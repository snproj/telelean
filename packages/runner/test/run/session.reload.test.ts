/**
 * Slice 2d (docs/slice2-plan.md 2.6, 3.11, 6.1's 2d list): an edit session across a reload, with the FakeBackend and
 * the fake engine:
 *   - a reload during step 2 of 3: interrupted; Resume sends the resume turn and the queue goes on; Cancel step instead
 *     takes the step back to its start, opens the stage, and step 3 reads "not run";
 *   - a reload between two steps, and right after a queue-start write (and in its middle: the write replayed): the queue
 *     waits for Resume or Cancel step (AF3);
 *   - a reload during a stage: the records come back, and the stage judgement is computed again from
 *     `judged-facts.json` with no build, giving the same view (D2-72);
 *   - a crash after each of the four writes of a `judge-apply` with a revert: recovered either not made or fully made;
 *     `dispose()` between its steps 2 and 4: never records ahead of `head` (AF11);
 *   - `isPersistedRun` reads version 2; a failing `writeStateChecked` at a write's step 1 refuses the action and changes
 *     nothing;
 *   - a v1 run in review converted into a session (§3.11, D2-16, AF12);
 *   - a reload before Claude had started (a crash, or the window closing, during the start's base check, or once Claude's
 *     process started but before the first step's turn): the session ends failed, as M2's run did.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildProjectModel, parseLeanFile, planGhostAdoption, premiseDraftKey, premiseKey, REVIEW_TEXTS, type StateJudgement } from '@telelean/core';

import { RunFiles, isPersistedRun } from '../../src/run/persist.js';
import { JUDGED_FACTS_FILE } from '../../src/run/session.js';
import { summaryOf } from '../../src/run/step.js';
import { PERSISTED_RUN_FORMAT, type PersistedRun, type PersistedSession, type PersistedStep, type RunChange } from '../../src/run/types.js';
import { FakeBackend } from '../../src/llm/fake.js';
import { playFakeScript, type FakeScriptTurn } from '../../src/llm/fakeScripts.js';
import type { LlmBackend, LlmSession, SessionConfig } from '../../src/llm/types.js';
import { cleanup } from './helpers/env.js';
import { fakeStageJudge, finding, SPYRO_PERMITTED } from './helpers/fakeEngine.js';
import { createFakeShadow, type FakeShadow } from './helpers/fakeShadow.js';
import { decision, pgScript, PG, RESULT } from './helpers/review.js';
import { makeHarness, rawRun, rawStep, readJson, round1, START, state, step, waitForRun, waitForStage, type Harness } from './helpers/harness.js';
import { CHAIN, chainModel, formalise, MAIN, proveGoal, proveLinkOne, proveLinkTwo, stepMatch, stepTurnScript } from './helpers/sessions.js';

const toDispose: Array<() => void> = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const d of toDispose.splice(0)) d();
});

/** A harness whose files outlive it (the second manager of a reload reuses them). */
function first(script: FakeScriptTurn[], extra: Parameters<typeof makeHarness>[0] = {}): Harness {
  const h = makeHarness({ script, ...extra });
  toDispose.push(() => cleanup(h.dir));
  return h;
}

/** The manager after the reload: same root, runs dir and workspace. */
function second(a: Harness, script: FakeScriptTurn[] = []): Harness {
  const b = makeHarness({ reuse: { dir: a.dir, root: a.root, runsDir: a.runsDir, workspace: a.workspace }, script });
  toDispose.push(() => b.dispose());
  return b;
}

/** run.json and ws/ agree: no write in flight, `head` the newest commit, ws/ its files. */
async function consistent(h: Harness): Promise<void> {
  const raw = rawRun(h);
  const shadow = h.shadow();
  expect(raw.session?.inFlight).toBeUndefined();
  const newest = (await shadow.commits()).at(-1);
  expect(raw.session?.head).toBe(newest?.id);
  expect(await shadow.currentFiles()).toEqual(await shadow.filesAt(newest?.id ?? ''));
}

describe('a reload during a step, and between two steps (§3.11, D2-55, AF3)', () => {
  const chain = (extraStep2: FakeScriptTurn): FakeScriptTurn[] => [proveLinkOne(), extraStep2, proveGoal()];

  it('during step 2 of 3: interrupted; Resume sends the resume turn and the queue goes on', async () => {
    const a = first(chain(stepTurnScript(2, 3, 'link-two', [...formalise('link-two'), { kind: 'sleep', ms: 60_000 }])), { source: chainModel(), withFacts: false });
    expect(await a.manager.formalize({ subject: 'Spyro', inferences: CHAIN })).toMatchObject({ ok: true });
    await waitForRun(a.manager, (v) => v.step?.index === 2 && v.counters.checks === 1);
    a.manager.dispose();
    const b = second(a, [
      { match: 'The session was interrupted (the person', steps: [...formalise('link-two', true).slice(2), { kind: 'callTool', tool: 'finish', args: { status: 'proved', summary: 'resumed', assumed_without_asking: [] } }, step.result()] },
      proveGoal(),
    ]);
    await b.manager.recover();
    const back = b.manager.current();
    expect(back).toMatchObject({ state: 'interrupted', canResume: true, session: { stage: 0, phase: 'interrupted' } });
    expect(rawStep(b, 's2').state).toBe('interrupted');
    expect(b.backend?.sessions).toHaveLength(0);
    expect(await b.manager.resume(back?.runId ?? '')).toMatchObject({ ok: true });
    expect(b.player?.played[0]?.turn).toBe(
      "The session was interrupted (the person's editor reloaded) while you were working. Your files are as you left them; the statements are frozen. Continue the run from where you were.",
    );
    await waitForStage(b.manager, 1);
    expect(rawRun(b).session?.steps.map((s) => [s.id, s.state])).toEqual([
      ['s1', 'passed'],
      ['s2', 'passed'],
      ['s3', 'passed'],
    ]);
    expect(b.player?.played[1]?.turn.split('\n')[0]).toBe(stepMatch(3, 3, 'cynder-not-good'));
  });

  it('during step 2 of 3: Cancel step instead takes it back to its start, opens the stage, and step 3 reads "not run"', async () => {
    const a = first(chain(stepTurnScript(2, 3, 'link-two', [...formalise('link-two'), { kind: 'sleep', ms: 60_000 }])), { source: chainModel(), withFacts: false });
    expect(await a.manager.formalize({ subject: 'Spyro', inferences: CHAIN })).toMatchObject({ ok: true });
    await waitForRun(a.manager, (v) => v.step?.index === 2 && v.counters.checks === 1);
    a.manager.dispose();
    const b = second(a);
    await b.manager.recover();
    const runId = b.manager.current()?.runId ?? '';
    const s2Start = rawStep(b, 's2').startCommit ?? '';
    expect(await b.manager.cancel(runId)).toMatchObject({ ok: true });
    await waitForStage(b.manager, 1);
    expect(await b.shadow().currentFiles()).toEqual(await b.shadow().filesAt(s2Start));
    expect(rawRun(b).session?.steps.map((s) => [s.id, s.state])).toEqual([
      ['s1', 'passed'],
      ['s2', 'cancelled'],
      ['s3', 'not-run'],
    ]);
    expect(b.manager.session()?.steps.map((s) => s.state)).toEqual(['ended', 'cancelled', 'not-run']);
    await consistent(b);
  });

  it('between two steps (a crash after a step ended): the queue waits for Resume, which starts the next step', async () => {
    const a = first([proveLinkOne(), proveLinkTwo(), proveGoal()], { source: chainModel(), withFacts: false });
    let closed = false;
    a.manager.onDidChange(() => {
      if (closed) return;
      const s = rawRun(a).session;
      if (s?.steps[0]?.state === 'passed' && s.steps[1]?.state === 'queued') {
        closed = true;
        void a.manager.dispose();
      }
    });
    expect(await a.manager.formalize({ subject: 'Spyro', inferences: CHAIN })).toMatchObject({ ok: true });
    await new Promise((r) => setTimeout(r, 200));
    expect(closed).toBe(true);
    const b = second(a, [proveLinkTwo(), proveGoal()]);
    await b.manager.recover();
    const back = b.manager.current();
    expect(back).toMatchObject({ state: 'interrupted', session: { phase: 'interrupted' } });
    expect(rawRun(b).session?.queue).toEqual(['s2', 's3']);
    expect(b.engine.methods()).toEqual([]);
    expect(await b.manager.resume(back?.runId ?? '')).toMatchObject({ ok: true });
    await waitForStage(b.manager, 1);
    expect(b.player?.played.map((p) => p.turn.split('\n')[0])).toEqual([stepMatch(2, 3, 'link-two'), stepMatch(3, 3, 'cynder-not-good')]);
    expect(rawRun(b).session?.steps.every((s) => s.state === 'passed')).toBe(true);
  });

  it('between two steps: Cancel step drops the rest of the queue and opens the stage', async () => {
    const a = first([proveLinkOne(), proveLinkTwo(), proveGoal()], { source: chainModel(), withFacts: false });
    let closed = false;
    a.manager.onDidChange(() => {
      const s = rawRun(a).session;
      if (!closed && s?.steps[0]?.state === 'passed' && s.steps[1]?.state === 'queued') {
        closed = true;
        void a.manager.dispose();
      }
    });
    expect(await a.manager.formalize({ subject: 'Spyro', inferences: CHAIN })).toMatchObject({ ok: true });
    await new Promise((r) => setTimeout(r, 200));
    const b = second(a);
    await b.manager.recover();
    expect(await b.manager.cancel(b.manager.current()?.runId ?? '')).toMatchObject({ ok: true });
    await waitForStage(b.manager, 1);
    expect(rawRun(b).session?.steps.map((s) => [s.id, s.state])).toEqual([
      ['s1', 'passed'],
      ['s2', 'cancelled'],
      ['s3', 'not-run'],
    ]);
    expect(rawRun(b).session?.retry).toEqual(['s2', 's3']);
    // s2 never ran: it gets its state only, never s1's round, finish, counters or attempt (fixer 2d r1, F-V2D-FC-2).
    const s2 = rawStep(b, 's2');
    expect(s2.lastFinish).toBeUndefined();
    expect(s2.attempt).toBeUndefined();
    expect(s2.round).toBeUndefined();
    expect(s2).toMatchObject({ freezes: [], gateAttempts: [], counters: { turns: 0, checks: 0, agentMs: 0, gateAttempts: 0 } });
    expect(rawStep(b, 's1')).toMatchObject({ lastFinish: { summary: 'link-one proved.' }, attempt: { verdict: 'proved' } });
    // Exit writes one attempt record per step that ran.
    expect(await b.manager.end(b.manager.current()?.runId ?? '', 'exit')).toMatchObject({ ok: true });
    expect(b.sidecars.attempts.map((x) => [x.target, x.verdict])).toEqual([['link-one', 'proved']]);
  });

  it('right after a queue-start write (AF3): the queue waits; Resume starts its first step on the queue-start\'s S₀', async () => {
    const a = first([round1(step.check(), { kind: 'sleep', ms: 60_000 })]);
    await a.manager.start(START);
    const working = await waitForRun(a.manager, (v) => v.counters.checks === 1);
    await a.manager.cancel(working.runId);
    await waitForStage(a.manager, 1);
    let closed = false;
    a.manager.onDidChange(() => {
      const s = rawRun(a).session;
      if (!closed && s?.steps[1]?.state === 'queued' && s.steps[1].startCommit !== undefined) {
        closed = true;
        void a.manager.dispose();
      }
    });
    await a.manager.retry(working.runId);
    expect(closed).toBe(true);
    const s2Start = rawStep(a, 's2').startCommit;
    const b = second(a, [{ match: stepMatch(1, 1, 'cynder-not-good'), steps: [step.finish('not_proved'), step.result()] }]);
    await b.manager.recover();
    expect(b.manager.current()).toMatchObject({ state: 'interrupted', session: { phase: 'interrupted' } });
    expect(await b.manager.resume(working.runId)).toMatchObject({ ok: true });
    await waitForStage(b.manager, 1);
    expect(rawStep(b, 's2')).toMatchObject({ state: 'passed', startCommit: s2Start, queue: 2 });
    // No second step-start commit: the queue-start's is the step's S₀.
    expect((await b.shadow().commits()).filter((c) => c.kind === 'step-start')).toHaveLength(2);
  });

  it('right after a queue-start write, a Resume whose `--resume` fails answers why and keeps the step\'s turn, which the next Resume sends (2d\'s review, R1-3)', async () => {
    const a = first([round1(step.check(), { kind: 'sleep', ms: 60_000 })]);
    await a.manager.start(START);
    const working = await waitForRun(a.manager, (v) => v.counters.checks === 1);
    await a.manager.cancel(working.runId);
    await waitForStage(a.manager, 1);
    let closed = false;
    a.manager.onDidChange(() => {
      const s = rawRun(a).session;
      if (!closed && s?.steps[1]?.state === 'queued' && s.steps[1].startCommit !== undefined) {
        closed = true;
        void a.manager.dispose();
      }
    });
    await a.manager.retry(working.runId);
    expect(closed).toBe(true);
    // After the reload, the first `--resume` fails.
    const player = playFakeScript([{ match: stepMatch(1, 1, 'cynder-not-good'), steps: [step.finish('not_proved'), step.result()] }]);
    const inner = new FakeBackend(player.script);
    let failResumes = 1;
    const backend: LlmBackend = {
      id: 'fake',
      caps: inner.caps,
      async startSession(cfg: SessionConfig): Promise<LlmSession> {
        if (cfg.resumeSessionId !== undefined && failResumes > 0) {
          failResumes -= 1;
          throw new Error('the CLI could not resume');
        }
        return inner.startSession(cfg);
      },
    };
    const b = makeHarness({ reuse: { dir: a.dir, root: a.root, runsDir: a.runsDir, workspace: a.workspace }, backend });
    toDispose.push(() => b.dispose());
    await b.manager.recover();
    expect(b.manager.current()).toMatchObject({ state: 'interrupted', session: { phase: 'interrupted' } });
    expect(await b.manager.resume(working.runId)).toEqual({ ok: false, code: 'not-yet', error: 'Claude could not be resumed: the CLI could not resume' });
    expect(rawStep(b, 's2').state).toBe('interrupted');
    expect(rawRun(b).undeliveredTurn?.split('\n')[0]).toBe(stepMatch(1, 1, 'cynder-not-good'));
    expect(b.manager.current()).toMatchObject({ state: 'interrupted', canResume: true });
    expect(await b.manager.resume(working.runId)).toMatchObject({ ok: true });
    await waitForStage(b.manager, 1);
    expect(player.played.map((x) => x.turn.split('\n')[0])).toEqual([stepMatch(1, 1, 'cynder-not-good')]);
    expect(player.played.some((x) => x.turn.startsWith('The session was interrupted'))).toBe(false);
    expect(rawStep(b, 's2')).toMatchObject({ state: 'passed' });
    expect(rawRun(b).undeliveredTurn).toBeUndefined();
  });

  it('in the middle of a queue-start write (after its step 1): recover() runs it again, then the queue waits', async () => {
    const a = first([round1(step.check(), { kind: 'sleep', ms: 60_000 })]);
    await a.manager.start(START);
    const working = await waitForRun(a.manager, (v) => v.counters.checks === 1);
    await a.manager.cancel(working.runId);
    await waitForStage(a.manager, 1);
    // Step 1 of the Retry's queue-start write lands, then the window closes (the in-memory session holds inFlight).
    const real = RunFiles.prototype.writeStateChecked;
    vi.spyOn(RunFiles.prototype, 'writeStateChecked').mockImplementation(async function (this: RunFiles, text: string) {
      await real.call(this, text);
      if (text.includes('"queue-start"')) {
        await a.manager.dispose();
        throw new Error('the window closed');
      }
    });
    expect(await a.manager.retry(working.runId)).toMatchObject({ ok: false });
    vi.restoreAllMocks();
    expect(rawRun(a).session?.inFlight?.action).toMatchObject({ kind: 'queue-start', by: 'retry', steps: ['s2'] });
    const b = second(a);
    await b.manager.recover();
    const raw = rawRun(b);
    expect(raw.session?.inFlight).toBeUndefined();
    expect(raw.session?.steps.map((s) => [s.id, s.state, s.queue, s.retryOf])).toEqual([
      ['s1', 'cancelled', 1, undefined],
      ['s2', 'queued', 2, 's1'],
    ]);
    expect(raw.session?.stack.done.map((x) => (x.kind === 'seal' ? x.by : x.kind))).toEqual(['retry']);
    expect(b.manager.current()).toMatchObject({ state: 'interrupted', session: { phase: 'interrupted' } });
  });
});

describe('a reload before Claude had started (as M2: §3.11 keeps its meaning)', () => {
  const variants = [
    { how: 'a crash during the base check', hold: 'base', close: false },
    { how: 'the window closing during the base check', hold: 'base', close: true },
    { how: "the window closing after Claude's process started, before the first step's turn", hold: 'bundle', close: true },
  ] as const;
  for (const v of variants) {
    it(`${v.how}: after the reload the session ends failed, with no conversation and no Lean job`, async () => {
      const a = first([]);
      if (v.hold === 'base') a.engine.onCheckBase = () => new Promise(() => undefined); // the base check never ends
      else a.sidecars.readDecisions = () => new Promise(() => undefined); // the first turn's bundle is never ready
      void a.manager.start(START);
      await waitForRun(a.manager, (view) => view.state === 'starting');
      if (v.hold === 'bundle') {
        for (let k = 0; k < 200 && (a.backend?.sessions.length ?? 0) === 0; k++) await new Promise((r) => setTimeout(r, 5));
        expect(a.backend?.sessions).toHaveLength(1);
      }
      expect(rawRun(a)).toMatchObject({ version: 2, view: { state: 'starting' } });
      if (v.close) {
        await a.manager.dispose();
        expect(rawRun(a).view).toMatchObject({ state: 'interrupted' });
        // After Claude's process started the window's close saves it resumable (M2's rule); before, not.
        expect(rawRun(a).view.canResume).toBe(v.hold === 'bundle' ? true : undefined);
      }
      const b = second(a);
      await b.manager.recover();
      expect(b.manager.current()).toMatchObject({ state: 'failed', verdict: 'failed', error: 'the editor reloaded before Claude had started' });
      const raw = rawRun(b);
      expect(raw.view.state).toBe('failed');
      expect(raw.session?.steps.map((x) => x.state)).toEqual(['queued']);
      expect(b.engine.methods()).toEqual([]);
      expect(b.backend?.sessions).toHaveLength(0);
      expect(await b.manager.resume(raw.view.runId)).toMatchObject({ ok: false });
    });
  }
});

describe('a reload during a stage (D2-72)', () => {
  it('the records come back and the stage judgement is computed again from judged-facts.json, with no build: the same view', async () => {
    const a = first([round1(step.check(), step.freeze(), step.finish('not_proved', 'nothing'), step.result())]);
    await a.manager.start(START);
    await waitForStage(a.manager, 1);
    const before = a.manager.session();
    const raw = rawRun(a);
    expect(raw.session?.judged).toMatchObject({ commit: raw.session?.head });
    expect(readJson<{ filesKey: string }>(path.join(a.shadow().paths.runDir, JUDGED_FACTS_FILE)).filesKey).toBe(raw.session?.judged?.filesKey);
    await a.manager.dispose();
    const b = second(a);
    await b.manager.recover();
    await waitForStage(b.manager, 1);
    expect(b.engine.methods()).toEqual([]);
    expect(b.manager.session()).toEqual(before);
    expect(rawRun(b).session).toEqual(raw.session);
  });

  it('a stage whose judged-facts.json belongs to another state: the judge runs again (with a build)', async () => {
    const a = first([round1(step.finish('not_proved', 'nothing'), step.result())]);
    await a.manager.start(START);
    await waitForStage(a.manager, 1);
    await a.manager.dispose();
    const file = path.join(a.shadow().paths.runDir, JUDGED_FACTS_FILE);
    writeFileSync(file, JSON.stringify({ ...readJson<object>(file), filesKey: 'another state' }));
    const b = second(a);
    await b.manager.recover();
    expect(b.manager.session()?.judging).toBe(true);
    await waitForStage(b.manager, 1);
    expect(b.engine.methods()).toEqual(['judge']);
  });
});

describe('a judge whose head moved while it ran (§2.6, F8)', () => {
  it('its judge-apply is dropped and the judge runs again on the new head (white box: a session write moves the head meanwhile)', async () => {
    const a = first([round1(step.finish('not_proved', 'nothing'), step.result())]);
    await a.manager.start(START);
    await waitForStage(a.manager, 1);
    await a.manager.dispose();
    const file = path.join(a.shadow().paths.runDir, JUDGED_FACTS_FILE);
    writeFileSync(file, JSON.stringify({ ...readJson<object>(file), filesKey: 'another state' })); // the judge runs on recover()
    const b = second(a);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const judgedCommits: string[] = [];
    b.engine.onJudge = async (ctx) => {
      const r = await fakeStageJudge(ctx); // the head as the judge found it
      judgedCommits.push(r.judgement.commit);
      if (judgedCommits.length === 1) await held;
      return r;
    };
    await b.manager.recover();
    for (let k = 0; k < 200 && judgedCommits.length === 0; k++) await new Promise((r) => setTimeout(r, 5));
    expect(judgedCommits).toHaveLength(1);
    // No 2d action writes while a judge runs (Retry and a mid-stage Formalize wait for it); 2e's decisions will. One
    // write through the session's write queue that moves the head:
    type Internals = { run: unknown; enqueueWrite<T>(run: unknown, job: () => Promise<T>): Promise<T>; sessionOf(run: unknown): PersistedSession; persistChecked(run: unknown): Promise<void> };
    const m = b.manager as unknown as Internals;
    const shadow = b.shadow();
    const moved = await m.enqueueWrite(m.run, async () => {
      const c = await shadow.commit('decision', 'a decision (test; its files unchanged)', 1);
      m.sessionOf(m.run).head = c.id;
      await m.persistChecked(m.run);
      return c.id;
    });
    expect(moved).not.toBe(judgedCommits[0]);
    release();
    await waitForStage(b.manager, 1);
    expect(judgedCommits).toEqual([judgedCommits[0], moved]); // dropped, then judged again on the new head
    expect(rawRun(b).session?.judged?.commit).toBe(moved);
    expect(rawRun(b).session?.head).toBe(moved);
    await consistent(b);
  });
});

describe('a judge-apply with a revert, crashed after each of its four writes (§2.6, D2-51, AF11)', () => {
  /** The first judge says the target's inference fails, so reconcile takes its new Result out (a revert). */
  function failingFirst(h: Harness): void {
    let calls = 0;
    h.engine.onJudge = async (ctx) => {
      const r = await fakeStageJudge(ctx);
      if (++calls > 1) return r;
      const failing: StateJudgement = { ...r.judgement, inferences: Object.fromEntries(Object.entries(r.judgement.inferences).map(([t, j]) => [t, { ...j, passes: false }])) };
      return { judgement: failing, report: { ...r.report, judgement: failing } };
    };
  }

  /**
   * Stops every write after `at` (1: run.json with inFlight, 2: the files, 3: the decision commit, 4: the records) of
   * the first write of `kind` (a `judge-apply`, or 2e's `decide`).
   */
  function crashAfter(h: Harness, shadow: FakeShadow, at: 1 | 2 | 3 | 4 | 'dispose', kind: 'judge-apply' | 'decide' = 'judge-apply'): { crashed: () => boolean } {
    let stage = 0;
    let crashed = false;
    const realChecked = RunFiles.prototype.writeStateChecked;
    const realState = RunFiles.prototype.writeState;
    const realClose = RunFiles.prototype.close;
    vi.spyOn(RunFiles.prototype, 'writeStateChecked').mockImplementation(async function (this: RunFiles, text: string) {
      if (crashed) throw new Error('crashed');
      await realChecked.call(this, text);
      if (text.includes('"inFlight"') && text.includes(`"kind": "${kind}"`) && stage === 0) {
        stage = 1;
        if (at === 1) crashed = true;
      } else if (stage === 3) {
        stage = 4;
        if (at === 4) crashed = true;
      }
    });
    vi.spyOn(RunFiles.prototype, 'writeState').mockImplementation(function (this: RunFiles, text: string) {
      return crashed ? Promise.resolve() : realState.call(this, text);
    });
    vi.spyOn(RunFiles.prototype, 'close').mockImplementation(function (this: RunFiles, text: string) {
      return crashed ? Promise.resolve() : realClose.call(this, text);
    });
    const writeFiles = shadow.writeFiles.bind(shadow);
    shadow.writeFiles = async (changes) => {
      if (crashed) throw new Error('crashed');
      await writeFiles(changes);
      if (stage === 1) {
        stage = 2;
        if (at === 2) crashed = true;
        if (at === 'dispose') {
          // AF11: the window closes between the write's steps 2 and 4: dispose() writes the in-memory run.json now.
          await h.manager.dispose();
          crashed = true;
        }
      }
    };
    const commit = shadow.commit.bind(shadow);
    shadow.commit = async (kind, label, round) => {
      if (crashed) throw new Error('crashed');
      const c = await commit(kind, label, round);
      if (stage === 2 && kind === 'decision') {
        stage = 3;
        if (at === 3) crashed = true;
      }
      return c;
    };
    const revertTo = shadow.revertTo.bind(shadow);
    shadow.revertTo = async (id, label, round) => {
      if (crashed) throw new Error('crashed');
      return revertTo(id, label, round);
    };
    return { crashed: () => crashed };
  }

  it('a reload between two judge rounds of a queue\'s end: judged again as the queue\'s end, without its queue-end rules a second time (fixer 2d r1, F-V2D-FC-6, A-F8)', async () => {
    const a = first([round1(step.freeze(), step.edit('abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n', 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\ntheorem cynder_not_good.holds : cynder_not_good := fun _ => cynder_dark_past.holds.elim\n'), step.finish('proved'), step.result())]);
    failingFirst(a); // round 1 takes the new Result out (a revert), so the judge runs again
    const judge = a.engine.onJudge;
    let rounds = 0;
    a.engine.onJudge = async (ctx) => (++rounds === 1 ? judge(ctx) : new Promise(() => undefined)); // round 2 never ends
    await a.manager.start(START);
    for (let k = 0; k < 200 && rounds < 2; k++) await new Promise((r) => setTimeout(r, 10));
    expect(rounds).toBe(2);
    const onDisk = rawRun(a).session;
    expect(onDisk?.phase).toBe('step');
    expect(onDisk?.queueEndReconciled).toBe(1);
    expect(onDisk?.items.find((r) => r.key === 'proof:cynder-not-good')).toMatchObject({ status: 'to-be-redone', redo: { reverted: true } });
    await a.manager.dispose();
    const b = second(a);
    // White box: what recovery asks the judge for.
    const asked: unknown[] = [];
    const m = b.manager as unknown as { judgeHead(run: unknown, o: unknown): Promise<void> };
    const judgeHead = m.judgeHead.bind(b.manager);
    m.judgeHead = (run, o) => {
      asked.push(o);
      return judgeHead(run, o);
    };
    await b.manager.recover();
    await waitForStage(b.manager, 1);
    expect(asked).toEqual([{ endsQueue: true }]);
    expect(rawRun(b).session?.items.find((r) => r.key === 'proof:cynder-not-good')).toMatchObject({ status: 'to-be-redone', redo: { reverted: true } });
    await consistent(b);
  });

  // Slice 2e (§2.6, D2-51, AF11): a decision's write (a Reject: its decision commit takes pg's statement and the Result
  // resting on it out), crashed after each of its four writes. recover() reverts ws/ to `head` and makes the write again
  // from `inFlight`, on the records and the stage judgement computed again, or finds it fully made.
  for (const at of [1, 2, 3, 4, 'dispose'] as const) {
    it(`a decision's write, crashed after ${at === 'dispose' ? 'step 2, with dispose()' : `step ${at}`}: recovered either not made or fully made`, async () => {
      const goal = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';
      const pg = 'stance: rule\nasserted: 2026-11-01\n-/\n';
      const pgLean = '/-- PG games cannot have characters with dark pasts -/\nabbrev pg_no_dark_past : Prop := ∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ GoodAddition c g\naxiom pg_no_dark_past.holds : pg_no_dark_past\n';
      const a = first([
        round1(step.edit(pg, pg + pgLean), step.freeze(), step.edit(goal, `${goal}theorem cynder_not_good.holds : cynder_not_good := pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n`), step.finish('proved'), step.result()),
      ]);
      await a.manager.start(START);
      const v = await waitForStage(a.manager, 1);
      const before = (await a.shadow().currentFiles()).get(MAIN) ?? '';
      const item = rawRun(a).session?.items.find((r) => r.key === 'card:pg-no-dark-past');
      const armed = crashAfter(a, a.shadow(), at, 'decide');
      const outcome = await a.manager.decide(v.runId, 1, true, [{ item: item?.id ?? '', rev: item?.rev ?? 0, to: 'declined', option: 'reject' }], false);
      expect(armed.crashed()).toBe(true);
      if (at === 1 || at === 2 || at === 3) expect(outcome).toMatchObject({ ok: false });
      a.manager.dispose();
      vi.restoreAllMocks();
      const onDisk = rawRun(a).session;
      // AF11: run.json never holds records ahead of its head.
      const declined = onDisk?.items.find((r) => r.key === 'card:pg-no-dark-past')?.status === 'declined';
      if (declined) expect((await a.shadow().commits()).find((c) => c.id === onDisk?.head)?.kind).toBe('decision');
      if (at !== 4) expect(onDisk?.inFlight?.action).toMatchObject({ kind: 'decide', action: { kind: 'decide' } });
      const b = second(a);
      await b.manager.recover();
      await waitForStage(b.manager, 1);
      await consistent(b);
      const after = rawRun(b).session;
      const pgAfter = after?.items.find((r) => r.key === 'card:pg-no-dark-past');
      const main = (await b.shadow().currentFiles()).get(MAIN) ?? '';
      // Every crash here comes after step 1, so the write is made: fully (the statement and the Result out, the action
      // on the stack with its commit, the decline's commit), never half.
      expect(pgAfter).toMatchObject({ status: 'declined', decline: { option: 'reject' } });
      expect(main).not.toContain('pg_no_dark_past');
      expect(main).not.toContain('theorem cynder_not_good.holds');
      expect(after?.items.find((r) => r.key === 'proof:cynder-not-good')).toMatchObject({ status: 'to-be-redone', redo: { reverted: true } });
      const action = after?.stack.done.at(-1);
      expect(action).toMatchObject({ kind: 'decide' });
      const commits = action?.kind === 'decide' ? action.commits : [];
      expect(commits).toHaveLength(1);
      expect(pgAfter?.decline?.commit).toBe(commits[0]);
      expect(after?.stack.done.filter((x) => x.kind === 'decide')).toHaveLength(1);
      // The decision's commit takes out exactly what the first one would have: its files are B's version of both items.
      expect((await b.shadow().filesAt(commits[0] ?? '')).get(MAIN)).toBe(main);
      expect(before).not.toBe(main);
      expect(after?.judged?.commit).toBe(after?.head);
    });
  }

  for (const at of [1, 2, 3, 4, 'dispose'] as const) {
    it(`a crash after ${at === 'dispose' ? 'step 2, with dispose()' : `step ${at}`}: recovered either not made or fully made, never records ahead of head`, async () => {
      const a = first([round1(step.freeze(), step.edit('abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n', 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\ntheorem cynder_not_good.holds : cynder_not_good := fun _ => cynder_dark_past.holds.elim\n'), step.finish('proved'), step.result())]);
      failingFirst(a);
      let armed: { crashed: () => boolean } | undefined;
      const judge = a.engine.onJudge;
      a.engine.onJudge = async (ctx) => {
        armed ??= crashAfter(a, a.shadow(), at);
        return judge(ctx);
      };
      await a.manager.start(START);
      for (let k = 0; k < 100 && armed?.crashed() !== true && !(at === 4 && rawRun(a).session?.phase === 'stage'); k++) await new Promise((r) => setTimeout(r, 20));
      expect(armed?.crashed()).toBe(true);
      a.manager.dispose();
      vi.restoreAllMocks();
      const onDisk = rawRun(a).session;
      // AF11: run.json never holds records ahead of its head: a revert recorded means its commit is the head.
      const result = onDisk?.items.find((r) => r.key === 'proof:cynder-not-good');
      if (result?.status === 'to-be-redone') expect((await a.shadow().commits()).find((c) => c.id === onDisk?.head)?.kind).toBe('decision');
      if (at === 1 || at === 2 || at === 3 || at === 'dispose') expect(onDisk?.inFlight?.action.kind).toBe('judge-apply');
      const b = second(a);
      await b.manager.recover();
      await waitForStage(b.manager, 1);
      await consistent(b);
      // Either the take-out was made (the Result to be redone, its proof out of ws/) or it was not (in review, kept).
      const after = rawRun(b).session?.items.find((r) => r.key === 'proof:cynder-not-good');
      const main = (await b.shadow().currentFiles()).get(MAIN) ?? '';
      if (after?.status === 'to-be-redone') {
        expect(after.redo?.reverted).toBe(true);
        expect(main).not.toContain('theorem cynder_not_good.holds');
      } else {
        expect(after?.status).toBe('in-review');
        expect(main).toContain('theorem cynder_not_good.holds');
      }
    });
  }
});

describe('a queue\'s end whose judge threw, after a reload (2d\'s review, R1-1)', () => {
  it('it is judged with its queue-end rules: a re-ask that proved a target whose Result was taken out keeps its proof, and the Result is back in review', async () => {
    const goal = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';
    const proved = `${goal}theorem cynder_not_good.holds : cynder_not_good := fun _ => cynder_dark_past.holds.elim\n`;
    const prove = [step.freeze(), step.edit(goal, proved), step.finish('proved'), step.result()];
    const a = first([round1(...prove), { match: stepMatch(1, 1, 'cynder-not-good'), steps: prove }]);
    // Queue 1's first judge: T's inference fails, so its Result is taken out (to be redone, reverted); the next one
    // converges. Queue 2's judge throws.
    let calls = 0;
    a.engine.onJudge = async (ctx) => {
      calls += 1;
      if (calls >= 3) throw new Error('the judge broke');
      const r = await fakeStageJudge(ctx);
      if (calls > 1) return r;
      const failing: StateJudgement = { ...r.judgement, inferences: Object.fromEntries(Object.entries(r.judgement.inferences).map(([t, j]) => [t, { ...j, passes: false }])) };
      return { judgement: failing, report: { ...r.report, judgement: failing } };
    };
    expect(await a.manager.formalize({ subject: 'Spyro', inferences: [{ target: 'cynder-not-good', premises: ['cynder-dark-past', 'new-spyro-pg'] }] })).toMatchObject({ ok: true });
    const v = await waitForStage(a.manager, 1);
    const result = () => rawRun(a).session?.items.find((r) => r.key === 'proof:cynder-not-good');
    expect(result()).toMatchObject({ status: 'to-be-redone', redo: { reverted: true } });
    expect((await a.shadow().currentFiles()).get(MAIN)).not.toContain('theorem cynder_not_good.holds');
    expect(a.manager.session()?.results.shown).toBe(true);
    // The re-ask (another question) proves T; its queue's judge throws: the stage opens with no judgement.
    expect(await a.manager.formalize({ subject: 'Spyro', inferences: [{ target: 'cynder-not-good', premises: ['cynder-dark-past'] }], runId: v.runId, stage: 1 })).toMatchObject({ ok: true });
    await waitForStage(a.manager, 1);
    expect(calls).toBe(3);
    expect(rawRun(a).session).toMatchObject({ phase: 'stage', queueEndReconciled: 1 });
    expect(rawRun(a).session?.judged).toBeUndefined();
    expect((await a.shadow().currentFiles()).get(MAIN)).toContain('theorem cynder_not_good.holds');
    await a.manager.dispose();
    const b = second(a);
    // White box: what recovery asks the judge for.
    const asked: unknown[] = [];
    const m = b.manager as unknown as { judgeHead(run: unknown, o: unknown): Promise<void> };
    const judgeHead = m.judgeHead.bind(b.manager);
    m.judgeHead = (run, o) => {
      asked.push(o);
      return judgeHead(run, o);
    };
    await b.manager.recover();
    await waitForStage(b.manager, 1);
    expect(asked).toEqual([{ queueSteps: ['s2'] }]);
    // AF1's "proposed again" at the queue's end: the Result is back in review, its proof kept in ws/.
    expect(rawRun(b).session?.items.find((r) => r.key === 'proof:cynder-not-good')).toMatchObject({ status: 'in-review' });
    expect(rawRun(b).session?.items.find((r) => r.key === 'proof:cynder-not-good')?.redo).toBeUndefined();
    expect((await b.shadow().currentFiles()).get(MAIN)).toContain('theorem cynder_not_good.holds');
    expect(rawRun(b).session).toMatchObject({ queueEndReconciled: 2, judged: { ok: true } });
    await consistent(b);
  });
});

describe('persistence (§2.6)', () => {
  it('isPersistedRun reads versions 1 and 2, and a version 2 only with its session', () => {
    const v1 = { format: PERSISTED_RUN_FORMAT, version: 1, view: { runId: 'r1' } };
    expect(isPersistedRun(v1)).toBe(true);
    const session = { format: 'telelean-session', version: 1, head: 'abc', inferences: [], steps: [], queue: [], retry: [], items: [], premises: [], ledger: [], rejectedArrows: [], events: [] };
    expect(isPersistedRun({ ...v1, version: 2, session })).toBe(true);
    expect(isPersistedRun({ ...v1, version: 2 })).toBe(false);
    expect(isPersistedRun({ ...v1, version: 2, session: { ...session, items: undefined } })).toBe(false);
    expect(isPersistedRun({ ...v1, version: 3, session })).toBe(false);
  });

  it('a failing writeStateChecked at a write\'s step 1 refuses the action and changes nothing (Retry\'s queue-start)', async () => {
    const h = makeHarness({ script: [round1(step.check(), { kind: 'sleep', ms: 60_000 })] });
    toDispose.push(() => h.dispose());
    await h.manager.start(START);
    const working = await waitForRun(h.manager, (v) => v.counters.checks === 1);
    await h.manager.cancel(working.runId);
    await waitForStage(h.manager, 1);
    const before = rawRun(h);
    const commits = (await h.shadow().commits()).length;
    vi.spyOn(RunFiles.prototype, 'writeStateChecked').mockRejectedValueOnce(new Error('disk full'));
    expect(await h.manager.retry(working.runId)).toEqual({ ok: false, code: 'internal', error: REVIEW_TEXTS.saveFailed('disk full') });
    expect(rawRun(h).session).toEqual(before.session);
    expect(h.manager.current()?.session).toEqual({ stage: 1, phase: 'stage' });
    expect(await h.shadow().commits()).toHaveLength(commits);
  });
});

/**
 * A v1 run left in review, written for `h` to recover: round 1 formalised pg-no-dark-past (frozen); round 2 adopted a
 * ghost (written) and proved the target with it; a second ghost is pending.
 */
async function writeV1Run(h: Harness): Promise<{ shadow: FakeShadow; freeze: Awaited<ReturnType<FakeShadow['commit']>>; nodeId: string }> {
  const files = new Map([...h.workspace.texts].sort(([x], [y]) => (x < y ? -1 : 1)));
  const runId = 'rv1run0000001';
  const shadow = await createFakeShadow({ root: h.root, runsDir: h.runsDir, runId, library: 'Model', files });
  // Round 1: pg-no-dark-past formalised (frozen); the adopted ghost written; the target proved with it.
  const a3 = 'stance: rule\nasserted: 2026-11-01\n-/\n\n';
  const main = (await shadow.currentFiles()).get(MAIN) ?? '';
  const formalised = main.replace(a3, 'stance: rule\nasserted: 2026-11-01\n-/\n/-- PG games cannot have characters with dark pasts -/\nabbrev pg_no_dark_past : Prop := ∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ InGame c g\naxiom pg_no_dark_past.holds : pg_no_dark_past\n\n');
  await shadow.writeFiles([{ path: MAIN, before: main, after: formalised }]);
  const freeze = await shadow.commit('freeze', 'Statements frozen (round 1)', 1);
  const model = buildProjectModel({ files: [...(await shadow.currentFiles())].filter(([p]) => p.endsWith('.lean')).map(([p, t]) => parseLeanFile(p, t)), fileHashes: {}, library: 'Model' });
  const ghostSentence = 'A character who cannot be in a game would not be a good addition to it';
  const plan = planGhostAdoption(model, { subject: 'Spyro', target: START.target, naturalName: ghostSentence, leanStatement: '∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g', leanName: 'not_in_game_not_good', session: runId, today: '2026-11-19', holdAs: 'axiom' });
  await shadow.writeFiles(plan.changes);
  await shadow.commit('adopt', `Adopted “${ghostSentence.slice(0, 59)}…”`, 2);
  const adopted = (await shadow.currentFiles()).get(MAIN) ?? '';
  const goal = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';
  await shadow.writeFiles([{ path: MAIN, before: adopted, after: adopted.replace(goal, `${goal}theorem cynder_not_good.holds : cynder_not_good := fun h => not_in_game_not_good.holds cynder newSpyro (pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds) h\n`) }]);
  await shadow.commit('gate-pass', 'Checks passed (round 2, attempt 1)', 2);
  const at = '2026-11-19T10:00:00.000Z';
  const ghost = (id: string, name: string, leanName: string, stateOf: 'adopted' | 'suggested', nodeId?: string) => ({
    id,
    naturalName: name,
    leanStatement: '∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g',
    leanName,
    whyNeeded: 'needed',
    closesGap: true,
    aloneEntails: false,
    state: stateOf,
    round: 1,
    proof: 'fun h => h cynder newSpyro',
    footprint: ['Spyro.pg_no_dark_past.holds'],
    ...(nodeId !== undefined ? { nodeId } : {}),
  });
  const v1: PersistedRun = {
    format: PERSISTED_RUN_FORMAT,
    version: 1,
    root: h.root,
    library: 'Model',
    view: {
      runId,
      subject: 'Spyro',
      target: START.target,
      premises: START.premises,
      state: 'review',
      round: 2,
      startedAt: at,
      updatedAt: at,
      backend: { id: 'fake', model: 'claude-opus-5-5' },
      caps: { maxTurns: 80, maxChecks: 25, maxAgentMs: 1_200_000, leanJobMs: 120_000, maxGateAttempts: 3 },
      counters: { turns: 3, checks: 2, agentMs: 1000, gateAttempts: 1 },
      usage: { requests: 3, inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costEstimateUsd: 0 },
      answered: [],
      notices: [],
      activity: [],
      ghosts: [],
      verdict: 'proved',
      proposalId: 'p2',
    },
    selection: { subject: 'Spyro', target: START.target, premises: START.premises, adoptedGhosts: [plan.nodeId] },
    backendId: 'fake',
    sessionId: '00000000-0000-4000-8000-000000000001',
    freezes: [
      {
        round: 1,
        commit: freeze,
        at,
        selection: { subject: 'Spyro', target: START.target, premises: START.premises, adoptedGhosts: [] },
        snapshot: { round: 1, permitted: SPYRO_PERMITTED, targetStatement: 'Spyro.cynder_not_good', declarations: {}, axioms: [] },
        freeze: { exportPath: '', challengeModule: 'Model.TeleleanChallenge', theoremNames: [], permittedAxioms: [], definitionNames: [] },
      },
    ],
    ghosts: [ghost('ghost-1', ghostSentence, 'not_in_game_not_good', 'adopted', plan.nodeId), ghost('ghost-2', 'Cynder is not in the new Spyro game', 'cynder_not_in_game', 'suggested')],
    gateAttempts: [{ attempt: 1, round: 2, at, passed: true, failures: [] }],
    lastFinish: { status: 'proved', summary: 'Proved with the adopted premise.', assumed_without_asking: [] },
    clocks: { roundAgentMs: 1000, totalAgentMs: 2000, startedAt: at },
  };
  writeFileSync(shadow.paths.stateFile, JSON.stringify(v1));
  return { shadow, freeze, nodeId: plan.nodeId };
}

/**
 * Slice 2h: a v1 run interrupted mid-round by a reload under an older telelean, for `h` to recover: round 1 formalised
 * pg-no-dark-past and froze it; the target's proof is in ws/, not checked yet. Its M2 round ends after a Resume.
 */
async function writeV1InterruptedRun(h: Harness): Promise<{ shadow: FakeShadow; runId: string }> {
  const files = new Map([...h.workspace.texts].sort(([x], [y]) => (x < y ? -1 : 1)));
  const runId = 'rv1run0000002';
  const shadow = await createFakeShadow({ root: h.root, runsDir: h.runsDir, runId, library: 'Model', files });
  const a3 = 'stance: rule\nasserted: 2026-11-01\n-/\n\n';
  const main = (await shadow.currentFiles()).get(MAIN) ?? '';
  const formalised = main.replace(a3, 'stance: rule\nasserted: 2026-11-01\n-/\n/-- PG games cannot have characters with dark pasts -/\nabbrev pg_no_dark_past : Prop := ∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ InGame c g\naxiom pg_no_dark_past.holds : pg_no_dark_past\n\n');
  await shadow.writeFiles([{ path: MAIN, before: main, after: formalised }]);
  const freeze = await shadow.commit('freeze', 'Statements frozen (round 1)', 1);
  const goal = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';
  await shadow.writeFiles([{ path: MAIN, before: formalised, after: formalised.replace(goal, `${goal}theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n`) }]);
  const at = '2026-11-19T10:00:00.000Z';
  const v1: PersistedRun = {
    format: PERSISTED_RUN_FORMAT,
    version: 1,
    root: h.root,
    library: 'Model',
    view: {
      runId,
      subject: 'Spyro',
      target: START.target,
      premises: START.premises,
      state: 'working',
      stage: 'prove',
      round: 1,
      startedAt: at,
      updatedAt: at,
      backend: { id: 'fake', model: 'claude-opus-5-5' },
      caps: { maxTurns: 80, maxChecks: 25, maxAgentMs: 1_200_000, leanJobMs: 120_000, maxGateAttempts: 3 },
      counters: { turns: 3, checks: 2, agentMs: 1000, gateAttempts: 0 },
      usage: { requests: 3, inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costEstimateUsd: 0 },
      answered: [],
      notices: [],
      activity: [],
      ghosts: [],
      frozen: { round: 1, at, permitted: summaryOf(SPYRO_PERMITTED) },
    },
    selection: { subject: 'Spyro', target: START.target, premises: START.premises, adoptedGhosts: [] },
    backendId: 'fake',
    sessionId: '00000000-0000-4000-8000-000000000002',
    freezes: [
      {
        round: 1,
        commit: freeze,
        at,
        selection: { subject: 'Spyro', target: START.target, premises: START.premises, adoptedGhosts: [] },
        snapshot: { round: 1, permitted: SPYRO_PERMITTED, targetStatement: 'Spyro.cynder_not_good', declarations: {}, axioms: [] },
        freeze: { exportPath: '', challengeModule: 'Model.TeleleanChallenge', theoremNames: [], permittedAxioms: [], definitionNames: [] },
      },
    ],
    ghosts: [],
    gateAttempts: [],
    clocks: { roundAgentMs: 1000, totalAgentMs: 1000, startedAt: at },
  };
  writeFileSync(shadow.paths.stateFile, JSON.stringify(v1));
  return { shadow, runId };
}

describe('slice 2h: M2\'s review is retired, so a run of version 1 always ends up as an edit session (§3.11, D2-16)', () => {
  it('a v1 run interrupted mid-round, resumed: its round ends as a session with one passed step (never a proposal to Accept); nothing reaches the user\'s files', async () => {
    const h = first([{ match: 'The session was interrupted', steps: [step.finish('proved', 'Proved from the three arrows.'), step.result()] }]);
    const { shadow, runId } = await writeV1InterruptedRun(h);
    const files = new Map(h.workspace.texts);
    await h.manager.recover();
    expect(h.manager.current()).toMatchObject({ runId, state: 'interrupted', canResume: true });
    expect(rawRun(h).version).toBe(1);
    expect(await h.manager.resume(runId)).toMatchObject({ ok: true });
    await waitForStage(h.manager, 1);
    const raw = rawRun(h);
    expect(raw.version).toBe(2);
    expect(raw.proposal).toBeUndefined();
    expect(raw.view.proposalId).toBeUndefined();
    const s = raw.session;
    expect(s?.steps.map((x) => [x.id, x.state, x.queue])).toEqual([['s1', 'passed', 1]]);
    // The step ends on exactly the files the gate passed (the proof), as M2's proposal did.
    expect((await h.shadow().filesAt(s?.head ?? '')).get(MAIN)).toContain('theorem cynder_not_good.holds : cynder_not_good :=');
    expect(s?.items.find((r) => r.key === `proof:${START.target}`)).toMatchObject({ kind: 'result', status: 'in-review' });
    expect(h.manager.current()).toMatchObject({ state: 'review', session: { stage: 1, phase: 'stage' } });
    expect(h.manager.session()?.results.shown).toBe(false);
    expect(h.backend?.configs.at(-1)?.resumeSessionId).toBe('00000000-0000-4000-8000-000000000002');
    expect(readFileSync(path.join(shadow.paths.sessionDir, 'transcript.jsonl'), 'utf8')).toContain('"kind":"converted"');
    expect(h.workspace.texts).toEqual(files);
  });

  it('a v1 round resumed that edits after finish: the late edit is discarded before the conversion (the session shows exactly the files the checks passed)', async () => {
    const h = first([{ match: 'The session was interrupted', steps: [step.finish('proved', 'Proved from the three arrows.'), step.edit('end Spyro', '-- a late edit\nend Spyro'), step.result()] }]);
    const { runId } = await writeV1InterruptedRun(h);
    const files = new Map(h.workspace.texts);
    await h.manager.recover();
    expect(await h.manager.resume(runId)).toMatchObject({ ok: true });
    await waitForStage(h.manager, 1);
    const raw = rawRun(h);
    expect(raw.version).toBe(2);
    const main = (await h.shadow().filesAt(raw.session?.head ?? '')).get(MAIN) ?? '';
    expect(main).toContain('theorem cynder_not_good.holds : cynder_not_good :=');
    expect(main).not.toContain('-- a late edit');
    expect(raw.view.notices.map((n) => n.text)).toContain('Changes made after finish were discarded: the session shows exactly the files the checks passed.');
    expect(h.workspace.texts).toEqual(files);
  });

  it('a v1 run in review whose proposal a build before spec v4 saved (three kinds, a lifecycle item) is upgraded, then converted: no proposal stays in run.json', async () => {
    const h = makeHarness({ script: [] });
    toDispose.push(() => h.dispose());
    const { shadow } = await writeV1Run(h);
    const raw = readJson<PersistedRun & { proposal?: unknown }>(shadow.paths.stateFile);
    const old = {
      runId: raw.view.runId,
      proposalId: 'p2',
      round: 2,
      graph: {
        nodes: [
          { id: 'cynder-dark-past', type: 'ASSUMPTION', status: { proof: { kind: 'assumed' }, flags: [] } },
          { id: START.target, type: 'GOAL', status: { proof: { kind: 'proved', footprint: ['cynder-dark-past'] }, flags: ['proved-goal'] } },
        ],
        edges: [],
        diagnostics: [],
      },
      lifecycle: [{ id: 'l1', kind: 'change-kind', nodeId: START.target, from: 'GOAL', to: 'DERIVATION', recommended: true, reason: 'Lean proved it' }],
    };
    writeFileSync(shadow.paths.stateFile, JSON.stringify({ ...raw, proposal: old }));
    await h.manager.recover();
    await waitForStage(h.manager, 1);
    const after = readFileSync(shadow.paths.stateFile, 'utf8');
    expect(JSON.parse(after)).toMatchObject({ version: 2 });
    expect(JSON.parse(after)).not.toHaveProperty('proposal');
    expect(after).not.toMatch(/"(ASSUMPTION|GOAL|DERIVATION)"/);
    expect(h.manager.current()).toMatchObject({ state: 'review', session: { stage: 1, phase: 'stage' } });
  });

  it('fixer 2h r1 (F-F-V2H-FC-3): a v1 round resumed that gives up (three failed checks) is reverted to the last passing commit, then converted: the reverted notice, a session, the user\'s files untouched', async () => {
    const goal = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';
    const proof = 'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n';
    const h = first([{ match: 'The session was interrupted', steps: [step.edit(goal, goal + proof), step.finish(), step.finish(), step.finish(), step.result()] }]);
    h.engine.onGate = () => ({ findings: [finding('footprint', 'the proof uses a premise nobody selected', { names: ['Spyro.new_spyro_pg.holds'], nodeId: 'cynder-not-good', file: MAIN })] });
    const { runId } = await writeV1InterruptedRun(h);
    const files = new Map(h.workspace.texts);
    await h.manager.recover();
    expect(await h.manager.resume(runId)).toMatchObject({ ok: true });
    await waitForStage(h.manager, 1);
    const raw = rawRun(h);
    expect(raw.version).toBe(2);
    expect(raw.proposal).toBeUndefined();
    const commits = await h.shadow().commits();
    // The failed checks left a checkpoint commit holding the proof; the revert must take the files back past it.
    expect(commits.some((c) => c.kind === 'checkpoint')).toBe(true);
    const freeze = commits.find((c) => c.kind === 'freeze');
    expect(raw.view.notices.map((n) => [n.kind, n.text])).toContainEqual(['reverted', 'telelean reverted Claude\'s working copy to “Statements frozen (round 1)” (the checks failed 3 times).']);
    // The session's one step ends on the freeze commit's files: the proof that failed its checks is gone.
    const main = (await h.shadow().filesAt(raw.session?.head ?? '')).get(MAIN) ?? '';
    expect(main).toEqual((await h.shadow().filesAt(freeze?.id ?? '')).get(MAIN));
    expect(main).not.toContain('theorem cynder_not_good.holds');
    expect(raw.session?.steps.map((x) => [x.id, x.state])).toEqual([['s1', 'passed']]);
    expect(h.manager.current()).toMatchObject({ state: 'review', session: { stage: 1, phase: 'stage' } });
    expect(h.workspace.texts).toEqual(files);
  });

  it('fixer 2h r1 (F-F-V2H-FC-3): a v1 run in review whose conversion fails (no base commit) stays in review with no session and says so; Stop ends it cancelled, its files untouched', async () => {
    const h = makeHarness({ script: [] });
    toDispose.push(() => h.dispose());
    const { shadow } = await writeV1Run(h);
    const files = new Map(h.workspace.texts);
    const commitsFile = path.join(shadow.paths.gitDir, 'commits.json');
    const stored = JSON.parse(readFileSync(commitsFile, 'utf8')) as Array<{ kind: string }>;
    writeFileSync(commitsFile, JSON.stringify(stored.map((c) => (c.kind === 'base' ? { ...c, kind: 'checkpoint' } : c))));
    await h.manager.recover();
    const view = h.manager.current();
    expect(view).toMatchObject({ state: 'review' });
    expect(view?.session).toBeUndefined();
    expect(h.manager.session()).toBeNull();
    expect(view?.error).toBe('This run was started by an older telelean and could not be converted (the run has no base commit): Stop it.');
    expect(view?.notices.map((n) => [n.kind, n.level])).toContainEqual(['info', 'error']);
    expect(rawRun(h).version).toBe(1);
    expect(rawRun(h).proposal).toBeUndefined();
    // Exit needs a session; Stop (cancel) ends the run and changes no file of the user's.
    expect(await h.manager.cancel(view?.runId ?? '')).toMatchObject({ ok: true });
    expect(h.manager.current()).toMatchObject({ state: 'cancelled' });
    expect(h.workspace.texts).toEqual(files);
  });
});

describe('a v1 run in review is converted into a session (§3.11, D2-16, AF12)', () => {
  it('one passed step, the ledger from the v1 run, an adopted ghost a written Add premise item in review, a pending one a draft; a fresh judge', async () => {
    const h = makeHarness({ script: [] });
    toDispose.push(() => h.dispose());
    const { shadow, freeze, nodeId } = await writeV1Run(h);
    const plan = { nodeId };

    await h.manager.recover();
    await waitForStage(h.manager, 1);
    const raw = rawRun(h);
    expect(raw.version).toBe(2);
    expect(raw.proposal).toBeUndefined();
    const s = raw.session;
    expect(s?.steps.map((x) => [x.id, x.state, x.queue, x.startCommit !== undefined, x.freezeCommit])).toEqual([['s1', 'passed', 1, true, freeze.id]]);
    expect(s?.inferences).toEqual([{ target: START.target, question: { sources: START.premises, fromNothing: false }, order: 0, steps: ['s1'] }]);
    const writtenKey = premiseKey(START.target, 'not_in_game_not_good');
    const draftKey = premiseKey(START.target, 'cynder_not_in_game');
    // The ledger from the v1 run: created (statements in the freeze, the proof after it), and the adopted ghost.
    expect(s?.ledger).toEqual(
      expect.arrayContaining([
        { kind: 'created', name: 'Spyro.pg_no_dark_past', step: 's1', phase: 'statements' },
        { kind: 'created', name: 'Spyro.cynder_not_good.holds', step: 's1', phase: 'proof' },
        expect.objectContaining({ kind: 'premise', card: plan.nodeId, target: START.target, holdAs: 'axiom', item: writtenKey }),
      ]),
    );
    expect(s?.ledger.some((e) => e.kind === 'created' && e.name.startsWith('Spyro.not_in_game_not_good'))).toBe(false);
    // The adopted ghost: a written Add premise item in review (its card set); the pending one: a draft's item.
    expect(s?.items.find((r) => r.key === writtenKey)).toMatchObject({ kind: 'add-premise', status: 'in-review', card: plan.nodeId });
    expect(s?.items.find((r) => r.key === draftKey)).toMatchObject({ kind: 'add-premise', status: 'in-review' });
    expect(s?.items.find((r) => r.key === draftKey)?.card).toBeUndefined();
    expect(s?.premises.map((d) => [d.leanName, d.step])).toEqual([
      ['not_in_game_not_good', 's1'],
      ['cynder_not_in_game', 's1'],
    ]);
    // The proof that uses the written premise still passes the first judge (E(T) reads written premises).
    expect(s?.items.find((r) => r.key === `proof:${START.target}`)).toMatchObject({ status: 'in-review' });
    expect(s?.judged?.ok).toBe(true);
    // Nothing was written again: one card for the ghost.
    expect(((await shadow.currentFiles()).get(MAIN) ?? '').split(`id: ${plan.nodeId}`).length - 1).toBe(1);
    expect(h.engine.methods()).toEqual(['judge', 'renderStatements']);
    expect(h.manager.current()).toMatchObject({ state: 'review', session: { stage: 1, phase: 'stage' } });
    expect(readFileSync(path.join(shadow.paths.sessionDir, 'transcript.jsonl'), 'utf8')).toContain('"kind":"converted"');
  });

  it('a pending ghost\'s draft (v1 kept no explicit form) takes the one its first re-check rendered, on the draft and on its record (§3.8, fixer 2d r1, F-V2D-FC-8)', async () => {
    const h = makeHarness({ script: [] });
    toDispose.push(() => h.dispose());
    await writeV1Run(h);
    const pending = premiseKey(START.target, 'cynder_not_in_game');
    const form = '∀ (c : Spyro.Character) (g : Spyro.Game), Not (Spyro.InGame c g) → Not (Spyro.GoodAddition c g)';
    h.engine.onJudge = async (ctx) => {
      const r = await fakeStageJudge(ctx);
      // As the real engine's judge: the passed re-check of the pending draft gives its fully explicit form.
      return { ...r, report: { ...r.report, premiseExplicit: { [pending]: form } } };
    };
    await h.manager.recover();
    await waitForStage(h.manager, 1);
    const s = rawRun(h).session;
    expect(s?.premises.find((d) => d.leanName === 'cynder_not_in_game')?.explicit).toBe(form);
    expect(s?.items.find((r) => r.key === pending)?.content.premise?.explicit).toBe(form);
    // The written one is not re-checked (it is written, and nothing writes it again): its draft keeps none.
    expect(s?.premises.find((d) => d.leanName === 'not_in_game_not_good')?.explicit).toBe('');
  });

  it('a reload during the conversion\'s first judge: the adopted ghost is still a written Add premise item in review, its card from the ledger (fixer 2d r1, A-F2)', async () => {
    const a = first([]);
    a.engine.onJudge = () => new Promise(() => undefined); // the first judge (a Lean build) never ends
    const { shadow, nodeId } = await writeV1Run(a);
    await a.manager.recover();
    for (let k = 0; k < 200 && !a.engine.methods().includes('judge'); k++) await new Promise((r) => setTimeout(r, 5));
    expect(rawRun(a)).toMatchObject({ version: 2, session: { phase: 'step', items: [] } });
    await a.manager.dispose();
    const b = second(a);
    await b.manager.recover();
    await waitForStage(b.manager, 1);
    const s = rawRun(b).session;
    const writtenKey = premiseKey(START.target, 'not_in_game_not_good');
    expect(s?.ledger).toContainEqual(expect.objectContaining({ kind: 'premise', card: nodeId, item: writtenKey }));
    expect(s?.items.find((r) => r.key === writtenKey)).toMatchObject({ kind: 'add-premise', status: 'in-review', card: nodeId });
    expect(s?.items.find((r) => r.key === premiseKey(START.target, 'cynder_not_in_game'))?.card).toBeUndefined();
    expect(((await shadow.currentFiles()).get(MAIN) ?? '').split(`id: ${nodeId}`).length - 1).toBe(1);
  });

  it('a judge that takes the written premise out (it no longer builds): its card leaves ws/, its ledger entries go, its record loses its card and holds its draft key (§3.8, fixer 2d r1, A-F6)', async () => {
    const a = first([]);
    const { nodeId } = await writeV1Run(a);
    await a.manager.recover();
    await waitForStage(a.manager, 1);
    const writtenKey = premiseKey(START.target, 'not_in_game_not_good');
    expect(rawRun(a).session?.items.find((r) => r.key === writtenKey)?.card).toBe(nodeId);
    expect(rawRun(a).session?.ledger.some((e) => e.kind === 'premise' && e.item === writtenKey)).toBe(true);
    await a.manager.dispose();
    // After a reload whose judged facts belong to another state, the judge runs again: its first judgement says the
    // written premise no longer builds.
    const file = path.join(a.shadow().paths.runDir, JUDGED_FACTS_FILE);
    writeFileSync(file, JSON.stringify({ ...readJson<object>(file), filesKey: 'another state' }));
    const b = second(a);
    let calls = 0;
    b.engine.onJudge = async (ctx) => {
      const r = await fakeStageJudge(ctx);
      if (++calls > 1) return r;
      const broken: StateJudgement = { ...r.judgement, problems: [...r.judgement.problems, { code: 'no-longer-builds', text: 'It no longer builds.', keys: [writtenKey] }] };
      return { judgement: broken, report: { ...r.report, judgement: broken } };
    };
    await b.manager.recover();
    await waitForStage(b.manager, 1);
    const s = rawRun(b).session;
    const record = s?.items.find((r) => r.key === writtenKey);
    expect(record).toMatchObject({ kind: 'add-premise', status: 'to-be-redone', redo: { reverted: true } });
    expect(record?.card).toBeUndefined();
    const draft = s?.premises.find((d) => d.leanName === 'not_in_game_not_good');
    expect(draft).toBeDefined();
    expect(record?.fingerprint).toBe(premiseDraftKey(draft as NonNullable<typeof draft>));
    expect(s?.ledger.some((e) => (e.kind === 'premise' || e.kind === 'mark-removed') && e.item === writtenKey)).toBe(false);
    expect((await b.shadow().currentFiles()).get(MAIN)).not.toContain(`id: ${nodeId}`);
    await consistent(b);
  });
});

describe('a written Add premise taken out by a decision, and put back by its Undo (slice 2e; §3.8, §2.2 takenOut, AF2)', () => {
  it('a Reject of the converted v1 ghost takes its card and ledger entries out in the decision commit, recorded on the action; its record holds its draft key; Undo puts all of it back', async () => {
    const a = first([]);
    const { nodeId } = await writeV1Run(a);
    await a.manager.recover();
    await waitForStage(a.manager, 1);
    const writtenKey = premiseKey(START.target, 'not_in_game_not_good');
    const runId = a.manager.current()?.runId ?? '';
    // The premise is a Result's part: Show results first.
    expect(await a.manager.reveal(runId, 1, 'show-result')).toMatchObject({ ok: true });
    const premise = rawRun(a).session?.items.find((r) => r.key === writtenKey);
    expect(premise).toMatchObject({ status: 'in-review', card: nodeId });
    const before = (await a.shadow().currentFiles()).get(MAIN) ?? '';
    const entries = rawRun(a).session?.ledger.filter((e) => (e.kind === 'premise' || e.kind === 'mark-removed') && e.item === writtenKey) ?? [];
    expect(entries.length).toBeGreaterThan(0);
    const outcome = await a.manager.decide(runId, 1, true, [{ item: premise?.id ?? '', rev: premise?.rev ?? 0, to: 'declined', option: 'reject' }], true);
    expect(outcome).toMatchObject({ ok: true });
    for (let k = 0; k < 400 && a.manager.session()?.judging !== false; k++) await new Promise((r) => setTimeout(r, 5));
    let s = rawRun(a).session;
    const out = s?.items.find((r) => r.key === writtenKey);
    const draft = s?.premises.find((d) => d.leanName === 'not_in_game_not_good');
    expect(out).toMatchObject({ status: 'declined', decline: { option: 'reject' } });
    expect(out?.card).toBeUndefined();
    expect(out?.fingerprint).toBe(premiseDraftKey(draft as NonNullable<typeof draft>));
    expect(out?.rejectedFingerprints).toEqual(expect.arrayContaining([premise?.fingerprint, premiseDraftKey(draft as NonNullable<typeof draft>)]));
    expect(s?.ledger.some((e) => (e.kind === 'premise' || e.kind === 'mark-removed') && e.item === writtenKey)).toBe(false);
    expect((await a.shadow().currentFiles()).get(MAIN)).not.toContain(`id: ${nodeId}`);
    const action = s?.stack.done.at(-1);
    expect(action).toMatchObject({ kind: 'decide', takenOut: [{ item: premise?.id, card: nodeId, fingerprint: premise?.fingerprint, ledger: entries }] });
    expect(action?.kind === 'decide' ? action.commits : []).toEqual([out?.decline?.commit]);
    await consistent(a);
    // Undo: the inverse of the decision commit puts the card back, and the ledger entries and the written key with it.
    expect(await a.manager.undoSession(runId, action?.id ?? -1, true)).toMatchObject({ ok: true });
    for (let k = 0; k < 400 && a.manager.session()?.judging !== false; k++) await new Promise((r) => setTimeout(r, 5));
    s = rawRun(a).session;
    expect(s?.items.find((r) => r.key === writtenKey)).toMatchObject({ status: 'in-review', card: nodeId, fingerprint: premise?.fingerprint, rejectedFingerprints: [] });
    expect(s?.ledger.filter((e) => (e.kind === 'premise' || e.kind === 'mark-removed') && e.item === writtenKey)).toEqual(entries);
    expect((await a.shadow().currentFiles()).get(MAIN)).toBe(before);
    await consistent(a);
    await a.manager.dispose();
  });
});

describe('a queue-start replayed after a crash (§2.6, fixer 2d r1, A-F7)', () => {
  it('a Retry\'s steps are rebuilt as Retry built them: the retried step\'s kind and its own scope', async () => {
    const a = first([round1(step.check(), { kind: 'sleep', ms: 60_000 })]);
    await a.manager.start(START);
    const working = await waitForRun(a.manager, (v) => v.counters.checks === 1);
    await a.manager.cancel(working.runId);
    await waitForStage(a.manager, 1);
    await a.manager.dispose();
    // The cancelled step is a Submit step with a scope of its own (2e makes such steps; written by hand here).
    const file = a.shadow().paths.stateFile;
    const p = readJson<PersistedRun>(file);
    const s1 = p.session?.steps[0] as PersistedStep;
    s1.kind = 'submit';
    s1.scope = { ...s1.scope, openProof: false, openItems: ['card:pg-no-dark-past'] };
    writeFileSync(file, JSON.stringify(p));
    const b = second(a);
    await b.manager.recover();
    await waitForStage(b.manager, 1);
    // Step 1 of the Retry's queue-start write lands, then the window closes.
    const real = RunFiles.prototype.writeStateChecked;
    vi.spyOn(RunFiles.prototype, 'writeStateChecked').mockImplementation(async function (this: RunFiles, text: string) {
      await real.call(this, text);
      if (text.includes('"queue-start"')) {
        await b.manager.dispose();
        throw new Error('the window closed');
      }
    });
    expect(await b.manager.retry(working.runId)).toMatchObject({ ok: false });
    vi.restoreAllMocks();
    expect(rawRun(b).session?.inFlight?.action).toMatchObject({ kind: 'queue-start', by: 'retry', steps: ['s2'] });
    const c = second(a);
    await c.manager.recover();
    const raw = rawRun(c);
    expect(raw.session?.inFlight).toBeUndefined();
    expect(raw.session?.steps[1]).toMatchObject({ id: 's2', kind: 'submit', retryOf: 's1', state: 'queued', queue: 2 });
    expect(raw.session?.steps[1]?.scope).toEqual({ ...s1.scope, step: 's2' });
  });

  it('a mid-stage Formalize\'s steps are rebuilt as formalizeInStage built them, and its inferences take the request\'s questions (2d\'s review, R1-4)', async () => {
    // Step 1 proves link-one; step 2 (link-two) is cancelled, so link-two has an inference but no ended step.
    const a = first([proveLinkOne(1, 2), stepTurnScript(2, 2, 'link-two', [...formalise('link-two'), { kind: 'sleep', ms: 60_000 }])], { source: chainModel(), withFacts: false });
    expect(await a.manager.formalize({ subject: 'Spyro', inferences: CHAIN.slice(0, 2) })).toMatchObject({ ok: true });
    const working = await waitForRun(a.manager, (v) => v.step?.index === 2 && v.state === 'working' && v.counters.checks === 1);
    expect(await a.manager.cancel(working.runId)).toMatchObject({ ok: true });
    await waitForStage(a.manager, 1);
    expect(rawRun(a).session?.inferences.find((i) => i.target === 'link-two')?.question).toEqual({ sources: ['link-one', 'new-spyro-pg'], fromNothing: false });
    // The statement decided, the results show; a mid-stage Formalize asks link-two again, from link-one alone.
    const link = rawRun(a).session?.items.find((r) => r.key === 'card:link-one');
    expect(await a.manager.decide(working.runId, 1, true, [{ item: link?.id ?? '', rev: link?.rev ?? 0, to: 'accepted' }], false)).toMatchObject({ ok: true });
    await waitForStage(a.manager, 1);
    expect(a.manager.session()?.results.shown).toBe(true);
    // Step 1 of its queue-start write lands, then the window closes.
    const real = RunFiles.prototype.writeStateChecked;
    vi.spyOn(RunFiles.prototype, 'writeStateChecked').mockImplementation(async function (this: RunFiles, text: string) {
      await real.call(this, text);
      if (text.includes('"queue-start"')) {
        await a.manager.dispose();
        throw new Error('the window closed');
      }
    });
    expect(await a.manager.formalize({ subject: 'Spyro', inferences: [{ target: 'link-two', premises: ['link-one'] }], runId: working.runId, stage: 1 })).toMatchObject({ ok: false });
    vi.restoreAllMocks();
    expect(rawRun(a).session?.inFlight?.action).toMatchObject({ kind: 'queue-start', by: 'formalize', steps: ['s3'], inferences: [{ target: 'link-two', premises: ['link-one'] }] });
    const c = second(a);
    await c.manager.recover();
    const raw = rawRun(c);
    expect(raw.session?.inFlight).toBeUndefined();
    const { startCommit, ...replayed } = raw.session?.steps[2] as PersistedStep;
    expect(startCommit).toBe(raw.session?.head);
    expect(replayed).toEqual({
      id: 's3',
      kind: 'formalize',
      target: 'link-two',
      stage: 1,
      queue: 2,
      state: 'queued',
      scope: { step: 's3', target: 'link-two', question: { sources: ['link-one'], fromNothing: false }, fuzzyStatements: [], openProof: true, openArrows: true, openItems: [] },
      freezes: [],
      gateAttempts: [],
      counters: { turns: 0, checks: 0, agentMs: 0, gateAttempts: 0 },
      agentMs: 0,
    });
    // A-F1: link-two had no ended step, so it is asked as new: its inference takes the request's question.
    expect(raw.session?.inferences.find((i) => i.target === 'link-two')).toMatchObject({ question: { sources: ['link-one'], fromNothing: false }, steps: ['s2', 's3'] });
    expect(raw.session?.retry).toEqual([]);
    expect(raw.session?.stack.done.at(-1)).toMatchObject({ kind: 'seal', by: 'formalize' });
    expect(c.manager.current()).toMatchObject({ state: 'interrupted', session: { phase: 'interrupted' } });
  });

  it('a Submit\'s queue-start is rebuilt from its `submit` steps (slice 2e): kind, target and what each opens; Resume then sends the feedback turn', async () => {
    const pg = 'stance: rule\nasserted: 2026-11-01\n-/\n';
    const pgLean = '/-- PG games cannot have characters with dark pasts -/\nabbrev pg_no_dark_past : Prop := ∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ GoodAddition c g\naxiom pg_no_dark_past.holds : pg_no_dark_past\n';
    const goal = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';
    const a = first([round1(step.edit(pg, pg + pgLean), step.freeze(), step.edit(goal, `${goal}theorem cynder_not_good.holds : cynder_not_good := pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n`), step.finish('proved'), step.result())]);
    await a.manager.start(START);
    const v = await waitForStage(a.manager, 1);
    const item = rawRun(a).session?.items.find((r) => r.key === 'card:pg-no-dark-past');
    expect(await a.manager.decide(v.runId, 1, true, [{ item: item?.id ?? '', rev: item?.rev ?? 0, to: 'declined', option: 'shaky', note: 'a rule?' }], false)).toMatchObject({ ok: true });
    const real = RunFiles.prototype.writeStateChecked;
    vi.spyOn(RunFiles.prototype, 'writeStateChecked').mockImplementation(async function (this: RunFiles, text: string) {
      await real.call(this, text);
      if (text.includes('"queue-start"')) {
        await a.manager.dispose();
        throw new Error('the window closed');
      }
    });
    expect(await a.manager.submit(v.runId, 1)).toMatchObject({ ok: false });
    vi.restoreAllMocks();
    expect(rawRun(a).session?.inFlight?.action).toEqual({
      kind: 'queue-start',
      by: 'submit',
      steps: ['s2'],
      submit: [{ target: START.target, openItems: ['card:pg-no-dark-past', 'proof:cynder-not-good'], openProof: true }],
    });
    const b = second(a, [{ match: 'Review submitted (stage 1)', steps: [step.freeze(), step.finish('proved', 'Kept.'), step.result()] }]);
    await b.manager.recover();
    const raw = rawRun(b);
    expect(raw.session?.inFlight).toBeUndefined();
    expect(raw.session?.steps[1]).toMatchObject({ id: 's2', kind: 'submit', target: START.target, state: 'queued', queue: 2, startCommit: raw.session?.head });
    expect(raw.session?.steps[1]?.scope).toEqual({ step: 's2', target: START.target, question: { sources: START.premises, fromNothing: false }, fuzzyStatements: [], openProof: true, openArrows: true, openItems: ['card:pg-no-dark-past', 'proof:cynder-not-good'] });
    expect(raw.session?.stack.done.at(-1)).toMatchObject({ kind: 'seal', by: 'submit' });
    expect(b.manager.current()).toMatchObject({ state: 'interrupted', session: { phase: 'interrupted' } });
    expect(await b.manager.resume(v.runId)).toMatchObject({ ok: true });
    await waitForStage(b.manager, 2);
    expect(b.player?.played[0]?.turn.startsWith('Review submitted (stage 1)\n')).toBe(true);
    expect(rawStep(b, 's2')).toMatchObject({ state: 'passed' });
  });

  it('a Submit\'s take-out crashed after its first write is made again on recovery (slice 2e, §2.6): its items to be redone and out of ws/; no queue starts, and Submit then starts it', async () => {
    const a = first([proveLinkOne(), proveLinkTwo(), proveGoal()], { source: chainModel(), withFacts: false });
    expect(await a.manager.formalize({ subject: 'Spyro', inferences: CHAIN })).toMatchObject({ ok: true });
    const v = await waitForStage(a.manager, 1);
    const id = (key: string) => rawRun(a).session?.items.find((r) => r.key === key);
    const d = (key: string, to: 'accepted' | 'declined', extra = {}) => ({ item: id(key)?.id ?? '', rev: id(key)?.rev ?? 0, to, ...extra });
    for (const key of ['card:link-one', 'card:link-two']) expect(await a.manager.decide(v.runId, 1, true, [d(key, 'accepted')], false)).toMatchObject({ ok: true });
    expect(await a.manager.decide(v.runId, 1, true, [d('proof:link-one', 'accepted')], false)).toMatchObject({ ok: true });
    expect(await a.manager.decide(v.runId, 1, true, [d('proof:link-two', 'declined', { option: 'shaky' })], false)).toMatchObject({ ok: true });
    await waitForStage(a.manager, 1);
    const real = RunFiles.prototype.writeStateChecked;
    vi.spyOn(RunFiles.prototype, 'writeStateChecked').mockImplementation(async function (this: RunFiles, text: string) {
      await real.call(this, text);
      if (text.includes('"submit-take-out"')) {
        await a.manager.dispose();
        throw new Error('the window closed');
      }
    });
    expect(await a.manager.submit(v.runId, 1)).toMatchObject({ ok: false });
    vi.restoreAllMocks();
    expect(rawRun(a).session?.inFlight?.action).toEqual({ kind: 'submit-take-out', items: [id('proof:cynder-not-good')?.id] });
    expect((await a.shadow().currentFiles()).get(MAIN)).toContain('theorem cynder_not_good.holds');
    const b = second(a, [
      { match: 'rework “link-two” after the review', steps: [step.freeze('link-two'), step.finish('proved', 'Kept.'), step.result()] },
      { match: 'rework “cynder-not-good” after the review', steps: [step.freeze(), step.finish('not_proved', 'Not now.'), step.result()] },
    ]);
    await b.manager.recover();
    await waitForStage(b.manager, 1);
    await consistent(b);
    const raw = rawRun(b).session;
    expect(raw?.phase).toBe('stage');
    expect(raw?.steps).toHaveLength(3);
    expect(raw?.items.find((r) => r.key === 'proof:cynder-not-good')).toMatchObject({ status: 'to-be-redone', redo: { reverted: true, because: [id('proof:link-two')?.id] } });
    expect((await b.shadow().currentFiles()).get(MAIN)).not.toContain('theorem cynder_not_good.holds');
    expect(await b.manager.submit(v.runId, 1)).toMatchObject({ ok: true });
    await waitForStage(b.manager, 2);
    expect(rawRun(b).session?.steps.slice(3).map((x) => x.target)).toEqual(['link-two', 'cynder-not-good']);
  });

  it('a queue-start whose steps cannot be rebuilt is not made: the stage stays as it was', async () => {
    const a = first([round1(step.finish('not_proved', 'nothing'), step.result())]);
    await a.manager.start(START);
    await waitForStage(a.manager, 1);
    await a.manager.dispose();
    const file = a.shadow().paths.stateFile;
    const p = readJson<PersistedRun>(file);
    const s = p.session as PersistedSession;
    // A Submit's queue-start in flight without its `submit` steps (2e records them; this one lacks them): nothing to
    // rebuild its step from.
    s.inFlight = { action: { kind: 'queue-start', by: 'submit', steps: ['s2'] }, parent: s.head };
    writeFileSync(file, JSON.stringify(p));
    const b = second(a);
    await b.manager.recover();
    const raw = rawRun(b);
    expect(raw.session?.inFlight).toBeUndefined();
    expect(raw.session?.steps.map((x) => x.id)).toEqual(['s1']);
    expect(raw.session?.stack.done).toEqual([]);
    expect(raw.session?.phase).toBe('stage');
    await waitForStage(b.manager, 1);
    await consistent(b);
  });
});

describe('Retry and a mid-stage Formalize wait while a judge runs (§2.6, AF3, fixer 2d r1, A-F6)', () => {
  /** After a reload whose judged facts belong to another state, the judge runs on recover(); it is held until released. */
  async function heldJudge(a: Harness, script: FakeScriptTurn[]): Promise<{ b: Harness; judged: string[]; release: () => void }> {
    await a.manager.dispose();
    const file = path.join(a.shadow().paths.runDir, JUDGED_FACTS_FILE);
    writeFileSync(file, JSON.stringify({ ...readJson<object>(file), filesKey: 'another state' }));
    const b = second(a, script);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const judged: string[] = [];
    b.engine.onJudge = async (ctx) => {
      const r = await fakeStageJudge(ctx); // the head as the judge found it
      judged.push(r.judgement.commit);
      if (judged.length === 1) await held;
      return r;
    };
    await b.manager.recover();
    for (let k = 0; k < 200 && judged.length === 0; k++) await new Promise((r) => setTimeout(r, 5));
    expect(judged).toHaveLength(1);
    return { b, judged, release };
  }

  /** Nothing of the queue happened while the judge was held; after it applied, the queue's S₀ follows the judged commit. */
  async function waitsForTheJudge(b: Harness, judged: string[], release: () => void, act: () => Promise<unknown>): Promise<void> {
    const commits = (await b.shadow().commits()).length;
    let resolved = false;
    const outcome = act().then((o) => {
      resolved = true;
      return o;
    });
    await new Promise((r) => setTimeout(r, 150));
    expect(resolved).toBe(false);
    expect(await b.shadow().commits()).toHaveLength(commits);
    expect(b.player?.played).toEqual([]);
    release();
    expect(await outcome).toMatchObject({ ok: true });
    await waitForStage(b.manager, 1);
    const all = await b.shadow().commits();
    const s0 = rawRun(b).session?.steps.at(-1)?.startCommit;
    const at = all.findIndex((c) => c.id === s0);
    expect(at).toBeGreaterThan(0);
    expect(all[at - 1]?.id).toBe(judged[0]);
  }

  it('a judge queued behind another counts as judging until it starts: Retry waits for it too (white box: the first judge held at its end)', async () => {
    const h = makeHarness({ script: [round1(step.check(), { kind: 'sleep', ms: 60_000 }), { match: stepMatch(1, 1, 'cynder-not-good'), steps: [step.finish('not_proved'), step.result()] }] });
    toDispose.push(() => h.dispose());
    await h.manager.start(START);
    const working = await waitForRun(h.manager, (v) => v.counters.checks === 1);
    await h.manager.cancel(working.runId);
    await waitForStage(h.manager, 1);
    type Internals = { run: { live: { judges: Promise<void> } }; judgeHead(run: unknown, o: unknown): Promise<void> };
    const m = h.manager as unknown as Internals;
    let release!: () => void;
    // A judge that has not ended yet (its last save), with `judging` already false, and one queued behind it.
    m.run.live.judges = new Promise<void>((r) => (release = r));
    const queued = m.judgeHead(m.run, {});
    let resolved = false;
    const retried = h.manager.retry(working.runId).then((o) => {
      resolved = true;
      return o;
    });
    await new Promise((r) => setTimeout(r, 150));
    expect(resolved).toBe(false);
    expect(rawRun(h).session?.steps).toHaveLength(1);
    release();
    await queued;
    expect(await retried).toMatchObject({ ok: true });
    await waitForStage(h.manager, 1);
    expect(rawStep(h, 's2')).toMatchObject({ state: 'passed', queue: 2 });
  });

  it('Retry step', async () => {
    const a = first([round1(step.check(), { kind: 'sleep', ms: 60_000 })]);
    await a.manager.start(START);
    const working = await waitForRun(a.manager, (v) => v.counters.checks === 1);
    await a.manager.cancel(working.runId);
    await waitForStage(a.manager, 1);
    const { b, judged, release } = await heldJudge(a, [{ match: stepMatch(1, 1, 'cynder-not-good'), steps: [step.finish('not_proved'), step.result()] }]);
    await waitsForTheJudge(b, judged, release, () => b.manager.retry(working.runId));
  });

  it('a mid-stage Formalize', async () => {
    const goal = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';
    const a = first([round1(step.freeze(), step.edit(goal, `${goal}theorem cynder_not_good.holds : cynder_not_good := fun _ => cynder_dark_past.holds.elim\n`), step.finish('proved'), step.result())]);
    await a.manager.formalize({ subject: 'Spyro', inferences: [{ target: 'cynder-not-good', premises: ['cynder-dark-past', 'new-spyro-pg'] }] });
    const v = await waitForStage(a.manager, 1);
    expect(a.manager.session()?.results.shown).toBe(true);
    const { b, judged, release } = await heldJudge(a, [{ match: stepMatch(1, 1, 'cynder-not-good'), steps: [step.finish('not_proved'), step.result()] }]);
    await waitsForTheJudge(b, judged, release, () => b.manager.formalize({ subject: 'Spyro', inferences: [{ target: 'cynder-not-good', premises: ['cynder-dark-past'] }], runId: v.runId, stage: 1 }));
  });
});

describe('a step whose `--resume` fails when it starts (fixer 2d r1, F-V2D-FC-5, A-F5)', () => {
  it('Retry step answers why; the step waits interrupted with its own turn kept, and Resume sends that turn, never the generic resume turn', async () => {
    const player = playFakeScript([
      proveLinkOne(1, 2),
      stepTurnScript(2, 2, 'link-two', [...formalise('link-two'), { kind: 'sleep', ms: 60_000 }]),
      stepTurnScript(1, 1, 'link-two', [...formalise('link-two', true), step.finish('proved'), step.result()]),
    ]);
    const inner = new FakeBackend(player.script);
    let failResumes = 0;
    const backend: LlmBackend = {
      id: 'fake',
      caps: inner.caps,
      async startSession(cfg: SessionConfig): Promise<LlmSession> {
        if (cfg.resumeSessionId !== undefined && failResumes > 0) {
          failResumes -= 1;
          throw new Error('the CLI could not resume');
        }
        return inner.startSession(cfg);
      },
    };
    const h = makeHarness({ source: chainModel(), withFacts: false, backend });
    toDispose.push(() => h.dispose());
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: CHAIN.slice(0, 2) })).toMatchObject({ ok: true });
    const working = await waitForRun(h.manager, (v) => v.step?.index === 2 && v.state === 'working' && v.counters.checks === 1);
    expect(await h.manager.cancel(working.runId)).toMatchObject({ ok: true });
    await waitForStage(h.manager, 1);
    failResumes = 1;
    expect(await h.manager.retry(working.runId)).toEqual({ ok: false, code: 'not-yet', error: 'Claude could not be resumed: the CLI could not resume' });
    expect(h.manager.current()).toMatchObject({ state: 'interrupted', canResume: true, session: { phase: 'interrupted' } });
    expect(rawRun(h).undeliveredTurn?.split('\n')[0]).toBe(stepMatch(1, 1, 'link-two'));
    expect(rawStep(h, 's3')).toMatchObject({ state: 'interrupted', retryOf: 's2', queue: 2 });
    expect(await h.manager.resume(working.runId)).toMatchObject({ ok: true });
    await waitForStage(h.manager, 1);
    expect(player.played.map((x) => x.turn.split('\n')[0]).at(-1)).toBe(stepMatch(1, 1, 'link-two'));
    expect(player.played.some((x) => x.turn.startsWith('The session was interrupted'))).toBe(false);
    expect(rawRun(h).undeliveredTurn).toBeUndefined();
    expect(rawStep(h, 's3')).toMatchObject({ state: 'passed', retryOf: 's2' });
  });
});

describe('Claude\'s process dies during a step (§2.4, fixer 2d r1, F-V2D-FC-4)', () => {
  it('the step and the phase are interrupted, and the session is posted with them', async () => {
    const backend = {
      id: 'fake' as const,
      caps: { builtinFileTools: true, subscriptionAuth: false, resume: true, interrupt: true },
      async startSession() {
        return {
          sessionId: 'sess-dies',
          async *send() {
            yield { type: 'error', fatal: true, message: 'the CLI exited' } as const;
          },
          async interrupt() {},
          async close() {},
          onEvent() {
            return () => undefined;
          },
        };
      },
    };
    const h = makeHarness({ backend: backend as unknown as LlmBackend });
    toDispose.push(() => h.dispose());
    const changes: RunChange[] = [];
    h.manager.onDidChange((c) => changes.push(c));
    expect(await h.manager.start(START)).toMatchObject({ ok: true });
    const v = await waitForRun(h.manager, state('interrupted'));
    expect(v).toMatchObject({ canResume: true, session: { stage: 0, phase: 'interrupted' } });
    expect(rawRun(h).session).toMatchObject({ phase: 'interrupted', steps: [{ id: 's1', state: 'interrupted' }] });
    const view = h.manager.session();
    expect(view?.phase).toBe('interrupted');
    expect(view?.steps.map((s) => [s.id, s.state])).toEqual([['s1', 'interrupted']]);
    expect(changes.at(-1)).toMatchObject({ run: true, session: true });
  });
});

describe('a decision\'s judge and a reload (fixer 2e r1: A-F1, A-F7, F-FC-1)', () => {
  it('a decision whose judge could not run: after a reload the judge runs again as the decision\'s own, and a state that does not pass heads the stage', async () => {
    const a = first([pgScript('proved')]);
    await a.manager.start(START);
    const v = await waitForStage(a.manager, 1);
    expect(await a.manager.reveal(v.runId, 1, 'show-result')).toMatchObject({ ok: true });
    a.engine.onJudge = async () => {
      throw new Error('the judge broke');
    };
    expect(await a.manager.decide(v.runId, 1, true, [decision(a, RESULT, 'declined', { option: 'reject' })], false)).toMatchObject({ ok: true });
    for (let k = 0; k < 400 && (rawRun(a).session?.judged !== undefined || a.manager.session()?.judging !== false); k++) await new Promise((r) => setTimeout(r, 5));
    expect(rawRun(a).session?.judged).toBeUndefined();
    await a.manager.dispose();
    const b = second(a);
    b.engine.onJudge = async (ctx) => {
      const r = await fakeStageJudge(ctx);
      const j: StateJudgement = { ...r.judgement, ok: false };
      return { judgement: j, report: { ...r.report, judgement: j } };
    };
    const asked: unknown[] = [];
    const m = b.manager as unknown as { judgeHead(run: unknown, o: unknown): Promise<void> };
    const judgeHead = m.judgeHead.bind(b.manager);
    m.judgeHead = (run, o) => {
      asked.push(o);
      return judgeHead(run, o);
    };
    await b.manager.recover();
    await waitForStage(b.manager, 1);
    for (let k = 0; k < 400 && rawRun(b).session?.judged === undefined; k++) await new Promise((r) => setTimeout(r, 5));
    expect(asked).toEqual([{ decided: true }]);
    expect(rawRun(b).session?.heading).toMatchObject({ kind: 'did-not-pass' });
    expect(rawRun(b).session?.judged).toMatchObject({ ok: false, commit: rawRun(b).session?.head });
  });

  it('a decide write found in flight with no stage judgement to read (its judged facts are gone) is not made: the rules need the judgement (fail closed)', async () => {
    const a = first([pgScript('proved')]);
    await a.manager.start(START);
    const v = await waitForStage(a.manager, 1);
    await a.manager.dispose();
    const file = a.shadow().paths.stateFile;
    const p = readJson<PersistedRun>(file);
    const s = p.session as PersistedSession;
    const pg = s.items.find((r) => r.key === PG);
    s.inFlight = {
      action: { kind: 'decide', action: { kind: 'decide', decisions: [{ item: pg?.id ?? '', rev: pg?.rev ?? 0, to: 'declined', option: 'reject' }], own: true, confirmed: false } },
      parent: s.head,
    };
    writeFileSync(file, JSON.stringify(p));
    // Its facts are gone: the judgement cannot be computed again without a build.
    rmSync(path.join(a.shadow().paths.runDir, JUDGED_FACTS_FILE));
    const before = structuredClone(s.items);
    const b = second(a);
    await b.manager.recover();
    await waitForStage(b.manager, 1);
    for (let k = 0; k < 400 && rawRun(b).session?.judged === undefined; k++) await new Promise((r) => setTimeout(r, 5));
    const raw = rawRun(b).session;
    expect(raw?.inFlight).toBeUndefined();
    expect(raw?.items).toEqual(before);
    expect(raw?.stack.done).toEqual([]);
    expect((await b.shadow().currentFiles()).get(MAIN)).toContain('pg_no_dark_past');
    expect(v.runId).toBe(b.manager.current()?.runId);
    await consistent(b);
  });
});
