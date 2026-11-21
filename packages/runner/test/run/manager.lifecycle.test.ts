/**
 * AT3.6 cancel and AT3.7 recovery (docs/m2-plan.md sections 4.6 and 4.7), with fakes.
 *   AT3.6 cancel during a check: lean.cancelRun with the run id, the session closed, state cancelled, attempt recorded
 *   AT3.7 a pending question survives a reload: manager B's recover() shows it without starting a session; answering
 *         resumes the session (resumeSessionId) with renderAnswersAsUserTurn; the run finishes; with two
 *         non-terminal run dirs the newer comes back and the older is marked failed
 * Slice 2d: every start is an edit session. Cancel is Cancel step (the step back to its start, the stage opens; the
 * session goes on: Discard ends it until 2f's Exit), the step's outcome is on its record, and the RunView withholds the
 * notices while a step runs and while the results are hidden (run.json holds them). A v1 run in review is converted
 * into a session when it is recovered (§3.11, session.reload.test.ts), so M2's legacy-proposal test moves to 2h.
 */
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { columnOrder } from '@telelean/core';
import { afterEach, describe, expect, it } from 'vitest';

import { renderAnswersAsUserTurn } from '../../src/llm/toolSchemas.js';
import { condenseRateLimit, localTime, rateLimitNotice } from '../../src/run/index.js';
import type { PersistedRun } from '../../src/run/types.js';
import { cleanup } from './helpers/env.js';
import { okReport } from './helpers/fakeEngine.js';
import { ASK_MODALITY, makeHarness, rawRun, rawStep, readJson, round1, START, state, step, waitForRun, waitForStage, type Harness } from './helpers/harness.js';

const TARGET_LINE = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';
const PROOF = 'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n';

/** Polls until `ok()` holds (a fire-and-forget effect), at most 5 s. */
async function waitForCondition(ok: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !ok(); i++) await new Promise((resolve) => setTimeout(resolve, 50));
  expect(ok()).toBe(true);
}

const toDispose: Array<() => void> = [];
afterEach(() => {
  for (const d of toDispose.splice(0)) d();
});

describe('cancel (AT3.6)', () => {
  it('Cancel step during a check: stops the step\'s Lean jobs, closes the Claude process, takes the step back; the session goes on in its stage', async () => {
    const h: Harness = makeHarness({ script: [round1(step.check(), step.finish(), step.result())] });
    toDispose.push(() => h.dispose());
    let release: () => void = () => undefined;
    const checking = new Promise<void>((started) => {
      h.engine.onCheck = () =>
        new Promise((resolve) => {
          started();
          release = () => resolve(okReport({ outcome: 'environment', environment: 'cancelled' }));
        });
    });
    await h.manager.start(START);
    await checking;
    const runId = h.manager.current()?.runId ?? '';
    const cancelling = h.manager.cancel(runId);
    // The check returns once its Lean job is stopped (here: by hand): nothing it gives changes the session.
    release();
    expect(await cancelling).toMatchObject({ ok: true, label: 'Step cancelled' });
    expect(h.cancelled).toEqual([runId]);
    expect(h.backend?.interrupts.length).toBeGreaterThan(0);
    expect(h.backend?.closes.length).toBeGreaterThan(0);
    const v = await waitForStage(h.manager, 1);
    expect(v).toMatchObject({ state: 'review', session: { stage: 1, phase: 'stage' } });
    expect(v.endedAt).toBeUndefined();
    expect(rawStep(h, 's1')).toMatchObject({ state: 'cancelled', attempt: { run: runId, round: 1, verdict: 'cancelled' } });
    expect(h.sidecars.attempts).toEqual([]);
    expect(rawRun(h).session?.heading).toMatchObject({ kind: 'cancelled', text: 'Step cancelled', firstStep: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(h.manager.current()?.state).toBe('review');
    expect(h.engine.methods()).not.toContain('gate');
    // The shadow and transcript are kept.
    expect(readFileSync(path.join(h.shadow().paths.sessionDir, 'transcript.jsonl'), 'utf8')).toContain('"kind":"tool-call","tool":"check_lean"');
    // No step runs any more: a second Cancel is refused; the session ends with Discard (2f: Exit), then dismissed.
    expect(await h.manager.cancel(runId)).toMatchObject({ ok: false, code: 'conflict' });
    expect(await h.manager.discard(runId)).toMatchObject({ ok: true, label: 'Session ended' });
    expect(h.sidecars.attempts).toEqual([expect.objectContaining({ run: runId, round: 1, verdict: 'cancelled' })]);
    expect(h.sidecars.resolutions).toEqual([expect.objectContaining({ run: runId, round: 1, resolution: 'discarded' })]);
    expect(await h.manager.dismiss(runId)).toMatchObject({ ok: true });
    expect(h.manager.current()).toBeNull();
  });
});

describe('one user action at a time', () => {
  it('a double-clicked answer is sent once; the second click gets conflict', async () => {
    const h: Harness = makeHarness({ script: [round1(step.ask(), step.finish('not_proved'), step.result())] });
    toDispose.push(() => h.dispose());
    await h.manager.start(START);
    const waiting = await waitForRun(h.manager, state('waiting-for-answer'));
    const answers = [{ question: 0, choice: { kind: 'option' as const, option: 1 }, scope: 'run' as const }];
    const [first, second] = await Promise.all([h.manager.answer(waiting.runId, 'q1', answers), h.manager.answer(waiting.runId, 'q1', answers)]);
    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: false, code: 'conflict' });
    expect(h.sidecars.decisions).toHaveLength(1);
    await waitForRun(h.manager, state('review'));
    expect(h.backend?.sessions).toHaveLength(1);
  });
});

describe('recovery after a reload (AT3.7)', () => {
  it('brings a pending question back without starting a session; answering resumes the session and the run finishes', async () => {
    // Manager A: a turn that ends (result 0.01), the nudge turn asks a question, then the window reloads.
    const a = makeHarness({
      script: [
        round1(step.usage('a1', 100, 10), step.check(), step.result(0.01)),
        { match: 'You ended your turn without calling finish', steps: [step.ask(), step.text('never reached')] },
      ],
    });
    toDispose.push(() => cleanup(a.dir));
    await a.manager.start(START);
    const waiting = await waitForRun(a.manager, state('waiting-for-answer'));
    expect(waiting.usage.costEstimateUsd).toBe(0.01);
    const sessionA = a.backend?.configs[0]?.sessionId;
    a.manager.dispose();
    const persisted = readJson<PersistedRun>(a.shadow().paths.stateFile);
    expect(persisted.view.state).toBe('waiting-for-answer');
    expect(persisted.sessionId).toBe(sessionA);
    expect(persisted.pendingAsk?.setId).toBe('q1');

    // Manager B (after the reload): same root and runs dir.
    const b = makeHarness({
      reuse: { dir: a.dir, root: a.root, runsDir: a.runsDir, workspace: a.workspace },
      script: [
        {
          match: 'The session was interrupted while your ask_user call was waiting',
          steps: [step.usage('b1', 50, 5), step.freeze(), step.edit(TARGET_LINE, TARGET_LINE + PROOF), step.finish(), step.result(0.03)],
        },
      ],
    });
    toDispose.push(() => b.dispose());
    await b.manager.recover();
    const back = b.manager.current();
    expect(back?.state).toBe('waiting-for-answer');
    expect(back?.runId).toBe(waiting.runId);
    expect(back?.pendingQuestions?.questions[0]?.question).toBe(ASK_MODALITY.questions[0]?.question);
    expect(JSON.stringify(back)).not.toContain('claudesGuess');
    expect(b.backend?.sessions).toHaveLength(0); // recover() never starts a session by itself

    const answers = [{ question: 0, choice: { kind: 'free-text' as const, text: 'I mean it as a rule.' }, scope: 'run' as const }];
    expect(await b.manager.answer(waiting.runId, 'q1', answers)).toMatchObject({ ok: true });
    expect(b.backend?.configs[0]?.resumeSessionId).toBe(sessionA);
    expect(b.backend?.configs[0]?.sessionId).toBeUndefined();
    const review = await waitForStage(b.manager, 1);
    expect(b.player?.played[0]?.turn).toBe(
      renderAnswersAsUserTurn(ASK_MODALITY, { answers: [{ question: 0, choice: { kind: 'free-text', text: 'I mean it as a rule.' }, scope: 'run' }], answeredAt: 'x' }),
    );
    expect(rawStep(b, 's1')).toMatchObject({ state: 'passed', attempt: { verdict: 'proved' } });
    expect(review.answered[0]).toMatchObject({ claudesGuess: { option: 0, note: 'rating rules are norms' } });
    // Usage spans both processes; the cost estimate is the latest result's (cumulative) figure, never a sum.
    expect(review.usage.requests).toBe(2);
    expect(review.usage.inputTokens).toBe(150);
    expect(review.usage.costEstimateUsd).toBe(0.03);
    expect(readJson<PersistedRun>(b.shadow().paths.stateFile).undeliveredAnswers).toBeUndefined();
  });

  it('with two non-terminal run dirs, the newer comes back and the older is marked failed', async () => {
    const a = makeHarness({ script: [round1(step.ask())] });
    toDispose.push(() => cleanup(a.dir));
    await a.manager.start(START);
    const waiting = await waitForRun(a.manager, state('waiting-for-answer'));
    a.manager.dispose();
    // An older run of the same root, left as "working" by a crash.
    const newerDir = a.shadow().paths.runDir;
    const olderDir = path.join(path.dirname(newerDir), 'rold000000000001');
    cpSync(newerDir, olderDir, { recursive: true });
    const older = readJson<PersistedRun>(path.join(olderDir, 'run.json'));
    older.view.runId = 'rold000000000001';
    older.view.state = 'working';
    older.view.updatedAt = '2020-01-01T00:00:00.000Z';
    older.sessionId = 'old-session';
    writeFileSync(path.join(olderDir, 'run.json'), JSON.stringify(older));

    const b = makeHarness({ reuse: { dir: a.dir, root: a.root, runsDir: a.runsDir, workspace: a.workspace } });
    toDispose.push(() => b.dispose());
    await b.manager.recover();
    expect(b.manager.current()).toMatchObject({ runId: waiting.runId, state: 'waiting-for-answer' });
    const marked = readJson<PersistedRun>(path.join(olderDir, 'run.json'));
    expect(marked.view.state).toBe('failed');
    expect(marked.view.error).toBe('superseded by a newer run');
    expect(marked.sessionId).toBeUndefined();
    expect(b.backend?.sessions).toHaveLength(0);
  });

  // Slice 2d: a run in review is a session now, and a v1 run in review is converted into one when it is recovered
  // (§3.11; session.reload.test.ts covers the conversion): its proposal is not used again, so no legacy proposal is
  // upgraded for Accept any more. Retired with the old review (`proposal()`, `accept`).
  it.skip('moves to 2h: a run in review saved before spec v4 comes back with its proposal in the two kinds, and can be accepted (slice 1a fixer)', async () => {
    const a = makeHarness({ script: [round1(step.freeze(), step.finish(), step.result())] });
    toDispose.push(() => cleanup(a.dir));
    await a.manager.start(START);
    const review = await waitForRun(a.manager, state('review'));
    await a.manager.dispose(); // run.json holds its final state (no write still queued that could overwrite ours)
    // What a build before spec v4 left in run.json: three kinds, a pending promotion, the old flags and diagnostics,
    // and a lifecycle item (a proved GOAL made a DERIVATION).
    const stateFile = a.shadow().paths.stateFile;
    const old = JSON.parse(readFileSync(stateFile, 'utf8')) as {
      proposal: {
        lifecycle?: unknown[];
        graph: {
          nodes: Array<{ id: string; type: string; status: { proof: { kind: string; footprint?: string[] }; flags: string[] } }>;
          diagnostics: Array<{ code: string; severity: string; message: string; nodeId?: string }>;
        };
      };
    };
    const node = (id: string) => {
      const found = old.proposal.graph.nodes.find((n) => n.id === id);
      if (!found) throw new Error(`no node ${id}`);
      return found;
    };
    node('cynder-dark-past').type = 'ASSUMPTION';
    Object.assign(node('new-spyro-pg'), { type: 'DERIVATION', status: { ...node('new-spyro-pg').status, proof: { kind: 'pending-promotion' }, flags: ['claimed'] } });
    Object.assign(node('pg-no-dark-past'), { type: 'GOAL', status: { ...node('pg-no-dark-past').status, proof: { kind: 'assumed' }, flags: [] } });
    const footprint = ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'];
    Object.assign(node(START.target), { type: 'GOAL', status: { ...node(START.target).status, proof: { kind: 'proved', footprint }, flags: ['proved-goal', 'rests-on-claimed'] } });
    old.proposal.graph.diagnostics = [
      { code: 'TL105', severity: 'info', message: 'This goal is already proved: make it a Derivation?', nodeId: START.target },
      { code: 'TL116', severity: 'warning', message: 'This goal is asserted as an axiom (Spyro.pg_no_dark_past.holds): make it an Assumption?', nodeId: 'pg-no-dark-past' },
      { code: 'TL102', severity: 'warning', message: 'The proof rests on a goal asserted as an axiom: pg-no-dark-past.', nodeId: START.target },
      { code: 'TL109', severity: 'info', message: 'kept as it is', nodeId: START.target },
    ];
    old.proposal.lifecycle = [{ id: 'l1', kind: 'change-kind', nodeId: START.target, from: 'GOAL', to: 'DERIVATION', recommended: true, reason: 'Lean proved it' }];
    writeFileSync(stateFile, JSON.stringify(old));

    const b = makeHarness({ reuse: { dir: a.dir, root: a.root, runsDir: a.runsDir, workspace: a.workspace } });
    toDispose.push(() => b.dispose());
    await b.manager.recover();
    expect(b.manager.current()).toMatchObject({ runId: review.runId, state: 'review' });
    const proposal = b.manager.proposal();
    if (proposal === null) throw new Error('no proposal after the reload');
    expect(proposal).not.toHaveProperty('lifecycle');
    const kinds = Object.fromEntries(proposal.graph.nodes.map((n) => [n.id, n.type]));
    expect(kinds).toEqual({ 'cynder-dark-past': 'AXIOM', 'new-spyro-pg': 'PROPOSITION', 'pg-no-dark-past': 'PROPOSITION', [START.target]: 'PROPOSITION' });
    const status = (id: string) => proposal.graph.nodes.find((n) => n.id === id)?.status;
    expect(status('new-spyro-pg')).toMatchObject({ proof: { kind: 'pending' }, flags: [] });
    expect(status('pg-no-dark-past')).toMatchObject({ proof: { kind: 'pending' }, flags: [] });
    expect(status(START.target)).toMatchObject({ proof: { kind: 'proved', footprint }, flags: ['rests-on-pending'] });
    // The legacy TL102 goes; slice 1f (carry-over 3): the proof that rests on the now pending cards gets the warning a
    // fresh build gives it (B.5), beside its flag.
    expect(proposal.graph.diagnostics.map((d) => [d.code, d.message])).toEqual([
      ['TL109', 'kept as it is'],
      ['TL102', 'The proof rests on pending: new-spyro-pg, pg-no-dark-past.'],
    ]);
    expect(proposal.graph.diagnostics[1]).toMatchObject({ severity: 'warning', nodeId: START.target });
    // The board builds its proposed view from it (overlayFor -> columnOrder) without meeting an unknown kind.
    expect(columnOrder(proposal.graph.nodes)).toEqual({ AXIOM: ['cynder-dark-past'], PROPOSITION: expect.arrayContaining(['new-spyro-pg', 'pg-no-dark-past', START.target]) });
    // run.json is written back upgraded.
    const saved = readJson<PersistedRun>(stateFile);
    expect(saved.proposal).not.toHaveProperty('lifecycle');
    expect(saved.proposal?.graph.nodes.every((n) => n.type === 'AXIOM' || n.type === 'PROPOSITION')).toBe(true);
    // Accept takes it as any proposal of this build.
    expect(await b.manager.accept(review.runId, proposal.proposalId, [])).toMatchObject({ ok: true });
    expect(b.manager.current()).toMatchObject({ state: 'accepted' });
  });

  it('a run that was working comes back interrupted; Resume continues the session with the resume turn', async () => {
    const a = makeHarness({ script: [round1(step.check(), { kind: 'sleep', ms: 60_000 })] });
    toDispose.push(() => cleanup(a.dir));
    await a.manager.start(START);
    await waitForRun(a.manager, (v) => v.counters.checks === 1);
    a.manager.dispose();
    const b = makeHarness({
      reuse: { dir: a.dir, root: a.root, runsDir: a.runsDir, workspace: a.workspace },
      script: [{ match: 'The session was interrupted (the person', steps: [step.freeze(), step.finish(), step.result()] }],
    });
    toDispose.push(() => b.dispose());
    await b.manager.recover();
    const back = b.manager.current();
    expect(back).toMatchObject({ state: 'interrupted', canResume: true, session: { stage: 0, phase: 'interrupted' } });
    expect(rawRun(b).view.notices.at(-1)?.kind).toBe('interrupted');
    expect(rawStep(b, 's1').state).toBe('interrupted');
    expect(b.backend?.sessions).toHaveLength(0);
    expect(await b.manager.resume(back?.runId ?? '')).toMatchObject({ ok: true });
    expect(b.player?.played[0]?.turn).toBe(
      "The session was interrupted (the person's editor reloaded) while you were working. Your files are as you left them; the statements are not frozen yet. Continue the run from where you were.",
    );
    await waitForStage(b.manager, 1);
    expect(rawStep(b, 's1')).toMatchObject({ state: 'passed', attempt: { verdict: 'proved' } });
    expect(rawRun(b).view.notices.map((n) => n.kind)).toContain('resumed');
  });

  it('Stop on an interrupted session ends it (slice 2d: "Session ended"); dispose cancels the Lean jobs of an active run (fixer round 1)', async () => {
    const a = makeHarness({ script: [round1(step.check(), { kind: 'sleep', ms: 60_000 })] });
    toDispose.push(() => cleanup(a.dir));
    await a.manager.start(START);
    const working = await waitForRun(a.manager, (v) => v.counters.checks === 1);
    expect(a.cancelled).toEqual([]);
    await a.manager.dispose();
    // A check or the gate may be running when the window closes: its Lean job is cancelled, not left to time out.
    await waitForCondition(() => a.cancelled.includes(working.runId));
    const b = makeHarness({ reuse: { dir: a.dir, root: a.root, runsDir: a.runsDir, workspace: a.workspace }, script: [] });
    toDispose.push(() => b.dispose());
    await b.manager.recover();
    const back = b.manager.current();
    expect(back).toMatchObject({ state: 'interrupted' });
    expect(await b.manager.discard(back?.runId ?? '')).toMatchObject({ ok: true, label: 'Session ended' });
    expect(b.manager.current()).toMatchObject({ state: 'discarded' });
  });

  it('a usage-limit warning is worded for people, in local time (fixer round 1)', async () => {
    const resetsAt = Date.UTC(2026, 10, 1, 16, 45, 41) / 1000;
    const h = makeHarness({
      script: [round1({ kind: 'rateLimit', info: { status: 'allowed_warning', resetsAt, rateLimitType: 'five_hour', utilization: 0.83 } }, step.freeze(), step.finish(), step.result())],
    });
    toDispose.push(() => h.dispose());
    await h.manager.start(START);
    await waitForRun(h.manager, state('review'));
    const notice = rawRun(h).view.notices.find((n) => n.text.includes('usage limit'))?.text ?? '';
    expect(notice).toBe(`Close to your plan's usage limit (five-hour window, 83% used); resets at ${localTime(new Date(resetsAt * 1000).toISOString())}.`);
    expect(notice).not.toContain('allowed_warning');
    expect(notice).not.toContain('Z.');
  });
});

describe('the usage-limit wording helpers (fixer round 1)', () => {
  it('local times like the board: "00:45" today, "Nov 2 00:45" on another day', () => {
    const now = new Date(2026, 10, 1, 23, 0, 0);
    expect(localTime(new Date(2026, 10, 1, 23, 45, 0).toISOString(), now)).toBe('23:45');
    expect(localTime(new Date(2026, 10, 2, 0, 45, 0).toISOString(), now)).toBe('Nov 2 00:45');
    expect(localTime(new Date(2027, 0, 3, 9, 5, 0).toISOString(), now)).toBe('Jan 3 2027 09:05');
    expect(localTime('not a date', now)).toBe('not a date');
  });

  it('rateLimitNotice and condenseRateLimit', () => {
    const now = new Date(2026, 10, 1, 23, 0, 0);
    const rl = condenseRateLimit({ status: 'allowed_warning', resetsAt: new Date(2026, 10, 2, 0, 45, 0).getTime(), rateLimitType: 'five_hour', utilization: 0.83 });
    expect(rl.detail).toBe('five-hour window, 83% used');
    expect(rateLimitNotice(rl, now)).toBe("Close to your plan's usage limit (five-hour window, 83% used); resets at Nov 2 00:45.");
    expect(rateLimitNotice({ status: 'rejected' }, now)).toBe("Your plan's usage limit was reached.");
    expect(rateLimitNotice({ status: 'odd' }, now)).toBe('Claude Code reported an unusual usage-limit status (odd).');
    expect(condenseRateLimit({ status: 'allowed', rateLimitType: 'seven_day_opus' }).detail).toBe('seven-day opus window');
  });
});
