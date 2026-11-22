/**
 * Slice 2f (docs/slice2-plan.md 3.9, 3.10, 6.1's 2f lists "Apply", "Drift", "Final check and backstop", "Exit and
 * records", "Provenance", an empty Apply, an interrupted Apply): the end of an edit session, with the FakeBackend and
 * the fake engine (its final check is core's `judgeState('final')` and backstop on fake facts; `planApply` is the real
 * service's, a comparison of files), and the fake workspace, whose `applyChanges` records every change set (the spy).
 */
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyBackstop as coreApplyBackstop,
  endorsementHash,
  endorsementsPath,
  layoutPath,
  parseEndorsements,
  parseLayout,
  REVIEW_TEXTS,
  serializeEndorsements,
  serializeLayout,
  type ActionOutcome,
  type StateJudgement,
} from '@telelean/core';

import type { FinalCheckReport } from '../../src/gate/types.js';
import { END_TEXTS } from '../../src/run/sessionEnd.js';
import { sentenceShort } from '../../src/run/step.js';
import type { PersistedSession } from '../../src/run/types.js';
import { fakeFinalCheck, fakeModel } from './helpers/fakeEngine.js';
import { fakeCore, makeHarness, rawRun, round1, START, step, waitForRun, waitForStage, type Harness } from './helpers/harness.js';
import { acceptEverything } from './helpers/apply.js';
import { acceptPremise, auxModel, confirmedStage, PREMISE_KEY, premiseRecord, proposeArrow, proposePremise, scriptEnd } from './helpers/premises.js';
import { decision, GOAL_LINE, GOAL_PROOF, GOAL_PROOF_AXIOMS, main, PG, PG_BLOCK_END, PG_FORMALISED, pgScript, record, RESULT, session, settled, T } from './helpers/review.js';
import { makeTempDir, SPYRO_FIXTURE } from './helpers/env.js';
import { MAIN } from './helpers/sessions.js';

const toDispose: Array<() => void> = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const d of toDispose.splice(0)) d();
});

const ok = (o: ActionOutcome) => expect(o, JSON.stringify(o)).toMatchObject({ ok: true });
type Internals = {
  run: unknown;
  sessionOf(run: unknown): PersistedSession;
  runtimeOf(run: unknown): { judgement: StateJudgement | null };
  enqueueWrite<X>(run: unknown, job: () => Promise<X>): Promise<X>;
};
const internals = (h: Harness) => h.manager as unknown as Internals;

function harness(options: Parameters<typeof makeHarness>[0] = {}): Harness {
  const h = makeHarness(options);
  toDispose.push(() => h.dispose());
  scriptEnd(h);
  return h;
}

/** Until the end confirmation's check is no longer running, and nothing judges. */
async function checked(h: Harness, timeoutMs = 10_000): Promise<NonNullable<PersistedSession['confirmation']>> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const c = rawRun(h).session?.confirmation;
    if (c !== undefined && c.state !== 'running' && h.manager.session()?.judging === false && h.manager.session()?.confirmation?.check.state !== 'running') return c;
    if (Date.now() > until) throw new Error(`the final check did not end: ${JSON.stringify(c)}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** The proved Spyro question with every item decided (`decide`), submitted: the end confirmation and its passed check. */
async function confirmed(
  options: Parameters<typeof makeHarness>[0] = {},
  decide: (h: Harness, runId: string) => Promise<void> = async (h, runId) => {
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'accepted')], false));
    await settled(h);
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'accepted')], false));
    await settled(h);
  },
): Promise<{ h: Harness; runId: string; checkId: string }> {
  const h = harness({ script: [pgScript('proved')], ...options });
  expect(await h.manager.start(START)).toMatchObject({ ok: true });
  const { runId } = await waitForStage(h.manager, 1);
  await settled(h);
  await decide(h, runId);
  ok(await h.manager.submit(runId, 1));
  expect(session(h).phase).toBe('confirming');
  const c = await checked(h);
  return { h, runId, checkId: c.checkId };
}

const T_SENTENCE = 'Cynder would not be a good addition to the new Spyro game';

describe('Apply (§3.10 step 4, EN-3, D2-67, UN-2)', () => {
  it('writes exactly F in one applyChanges call (kind accept-proposal, the Apply label) only at Apply, across the session, the review and the end; the attempt records are resolved accepted; the run ends accepted', async () => {
    const { h, runId, checkId } = await confirmed();
    expect(h.manager.session()?.confirmation?.check).toMatchObject({ state: 'passed', reusedFileChecks: true, failures: [] });
    expect(h.manager.session()?.confirmation?.apply).toEqual({ ok: true });
    // The spy: nothing applied during the session, its review, the Submit or the final check.
    expect(h.workspace.appliedChanges).toEqual([]);
    expect(h.sidecars.attempts).toEqual([]);
    const B = (await h.shadow().baseFiles()).get(MAIN);
    const F = await main(h);
    const outcome = await h.manager.end(runId, 'apply', 1, checkId);
    expect(outcome).toMatchObject({ ok: true, undoable: true, label: REVIEW_TEXTS.applyLabel([sentenceShort(T_SENTENCE)]) });
    expect(h.workspace.appliedChanges).toHaveLength(1);
    const set = h.workspace.appliedChanges[0];
    expect(set).toMatchObject({ action: 'accept-proposal', subject: 'Spyro', label: REVIEW_TEXTS.applyLabel([sentenceShort(T_SENTENCE)]), nodes: [T] });
    expect(set?.changes).toEqual([{ path: MAIN, before: B, after: F }]);
    expect(h.workspace.texts.get(MAIN)).toBe(F);
    expect(h.sidecars.resolutions.map((r) => [r.round, r.resolution])).toEqual([[1, 'accepted']]);
    expect(h.sidecars.resolutions[0]?.arrows).toBeUndefined();
    const v = await waitForRun(h.manager, (x) => x.state === 'accepted');
    expect(v.accepted).toEqual({ changedFiles: true });
    expect(rawRun(h).view.notices.at(-1)?.text).toBe(REVIEW_TEXTS.applied);
    // ES-7: the base never moved, and nothing wrote D-21's commits.
    const kinds = (await h.shadow().commits()).map((c) => c.kind);
    expect(kinds.filter((k) => k === 'base')).toHaveLength(1);
    expect(kinds).not.toContain('accept-base');
    expect(kinds).not.toContain('rebase');
  });

  it('with an accepted definition and a moved card: the subject\'s endorsements.json (endorsementHash of its text in F) and layout.json are in the same change set', async () => {
    const DEF = '/-- A strict game -/\ndef strict_game (g : Game) : Prop := IsPG g\n\n';
    const script = [round1(step.edit(PG_BLOCK_END, PG_FORMALISED + DEF), step.freeze(), step.edit(GOAL_LINE, GOAL_LINE + GOAL_PROOF), step.finish('proved', 'Proved.'), step.result())];
    const { h, runId, checkId } = await confirmed({ script }, async (x, id) => {
      ok(await x.manager.moveProposed(id, { [T]: { x: 120, y: 40 } }));
      for (const key of [PG, 'decl:Spyro.strict_game', RESULT]) {
        ok(await x.manager.decide(id, 1, true, [decision(x, key, 'accepted')], false));
        await settled(x);
      }
    });
    expect(h.manager.session()?.confirmation?.endorsed).toEqual([{ name: 'Spyro.strict_game', declKind: 'definition' }]);
    ok(await h.manager.end(runId, 'apply', 1, checkId));
    const set = h.workspace.appliedChanges[0];
    expect(set?.changes.map((c) => c.path)).toEqual([MAIN, endorsementsPath('Spyro'), layoutPath('Spyro')]);
    const F = new Map([[MAIN, h.workspace.texts.get(MAIN) ?? '']]);
    const code = fakeModel(F).vocabulary.find((x) => x.name === 'Spyro.strict_game')?.code ?? '';
    expect(code).toContain('def strict_game');
    const endorsed = parseEndorsements(set?.changes[1]?.after ?? '').endorsed;
    expect(endorsed).toEqual([{ name: 'Spyro.strict_game', textHash: endorsementHash(code), run: runId, date: expect.any(String) as string }]);
    expect(set?.changes[1]?.before).toBeNull();
    expect(parseLayout(set?.changes[2]?.after).positions).toEqual({ [T]: { x: 120, y: 40 } });
  });

  it('the sidecars merge into what the files hold: another name\'s endorsement and another card\'s position are kept; the same name and the moved card are replaced', async () => {
    const DEF = '/-- A strict game -/\ndef strict_game (g : Game) : Prop := IsPG g\n\n';
    const script = [round1(step.edit(PG_BLOCK_END, PG_FORMALISED + DEF), step.freeze(), step.edit(GOAL_LINE, GOAL_LINE + GOAL_PROOF), step.finish('proved', 'Proved.'), step.result())];
    const { h, runId, checkId } = await confirmed({ script }, async (x, id) => {
      ok(await x.manager.moveProposed(id, { [T]: { x: 120, y: 40 } }));
      for (const key of [PG, 'decl:Spyro.strict_game', RESULT]) {
        ok(await x.manager.decide(id, 1, true, [decision(x, key, 'accepted')], false));
        await settled(x);
      }
    });
    const older = { name: 'Spyro.older_def', textHash: 'sha256:older', run: 'r-older', date: '2026-11-01T00:00:00.000Z' };
    const stale = { name: 'Spyro.strict_game', textHash: 'sha256:stale', run: 'r-older', date: '2026-11-01T00:00:00.000Z' };
    const endorsementsBefore = serializeEndorsements({ format: 'telelean-endorsements', version: 1, endorsed: [stale, older] });
    const layoutBefore = serializeLayout({ ...parseLayout(null), positions: { 'link-one': { x: 1, y: 2 }, [T]: { x: 0, y: 0 } } });
    h.workspace.texts.set(endorsementsPath('Spyro'), endorsementsBefore);
    h.workspace.texts.set(layoutPath('Spyro'), layoutBefore);
    ok(await h.manager.end(runId, 'apply', 1, checkId));
    const set = h.workspace.appliedChanges[0];
    expect(set?.changes.map((c) => [c.path, c.before === null ? null : 'text'])).toEqual([
      [MAIN, 'text'],
      [endorsementsPath('Spyro'), 'text'],
      [layoutPath('Spyro'), 'text'],
    ]);
    expect(set?.changes[1]?.before).toBe(endorsementsBefore);
    const endorsed = parseEndorsements(set?.changes[1]?.after ?? '').endorsed;
    expect(endorsed.map((e) => e.name)).toEqual(['Spyro.older_def', 'Spyro.strict_game']);
    expect(endorsed[0]).toEqual(older);
    expect(endorsed[1]).toMatchObject({ name: 'Spyro.strict_game', run: runId });
    expect(endorsed[1]?.textHash).not.toBe('sha256:stale');
    expect(set?.changes[2]?.before).toBe(layoutBefore);
    expect(parseLayout(set?.changes[2]?.after).positions).toEqual({ 'link-one': { x: 1, y: 2 }, [T]: { x: 120, y: 40 } });
  });

  it('only individually accepted definitions are endorsed: a declined definition is not, nor is an accepted vocabulary change (EN-3, D2-18; A-F1)', async () => {
    const STRICT = '/-- A strict game -/\ndef strict_game (g : Game) : Prop := IsPG g\n\n';
    const WEAK = '/-- A weak game -/\ndef weak_game (g : Game) : Prop := IsPG g\n\n';
    const IS_PG = 'axiom IsPG : Game → Prop';
    const script = [
      round1(
        step.edit(PG_BLOCK_END, PG_FORMALISED + STRICT + WEAK),
        step.edit(IS_PG, `/-- Rated for all -/\n${IS_PG}`, 'Model/Spyro/Vocabulary.lean'),
        step.freeze(),
        step.edit(GOAL_LINE, GOAL_LINE + GOAL_PROOF),
        step.finish('proved', 'Proved.'),
        step.result(),
      ),
    ];
    const { h, runId, checkId } = await confirmed({ script }, async (x, id) => {
      expect(session(x).items.find((r) => r.key === 'decl:Spyro.IsPG')).toMatchObject({ kind: 'declaration', declKind: 'vocabulary-change' });
      for (const key of ['decl:Spyro.IsPG', PG, 'decl:Spyro.strict_game']) {
        ok(await x.manager.decide(id, 1, true, [decision(x, key, 'accepted')], false));
        await settled(x);
      }
      ok(await x.manager.decide(id, 1, true, [decision(x, 'decl:Spyro.weak_game', 'declined', { option: 'reject' })], true));
      await settled(x);
      ok(await x.manager.decide(id, 1, true, [decision(x, RESULT, 'accepted')], false));
      await settled(x);
    });
    expect(h.manager.session()?.confirmation?.endorsed).toEqual([{ name: 'Spyro.strict_game', declKind: 'definition' }]);
    ok(await h.manager.end(runId, 'apply', 1, checkId));
    const set = h.workspace.appliedChanges[0];
    const change = set?.changes.find((c) => c.path === endorsementsPath('Spyro'));
    expect(parseEndorsements(change?.after ?? '').endorsed.map((e) => e.name)).toEqual(['Spyro.strict_game']);
  });

  it('nothing accepted (every item rejected): no file change, no history entry, no Undo step; the records are still written (D2-39)', async () => {
    const { h, runId, checkId } = await confirmed({}, async (x, id) => {
      ok(await x.manager.reveal(id, 1, 'show-result'));
      ok(await x.manager.decide(id, 1, true, [decision(x, PG, 'declined', { option: 'reject' })], true));
      await settled(x);
      if (record(x, RESULT).status !== 'declined') ok(await x.manager.decide(id, 1, true, [decision(x, RESULT, 'declined', { option: 'reject' })], true));
      await settled(x);
    });
    expect(h.manager.session()?.confirmation).toMatchObject({ empty: true, apply: { ok: true } });
    const outcome = await h.manager.end(runId, 'apply', 1, checkId);
    expect(outcome).toMatchObject({ ok: true, undoable: false, label: END_TEXTS.recorded });
    expect(h.workspace.appliedChanges).toEqual([]);
    expect(h.proposals.applyRequests).toEqual([]);
    expect(h.sidecars.resolutions.map((r) => r.resolution)).toEqual(['accepted']);
    expect(h.sidecars.resolutions[0]?.arrows).toBeUndefined();
    const v = await waitForRun(h.manager, (x) => x.state === 'accepted');
    expect(v.accepted).toEqual({ changedFiles: false });
  });

  it('Back to review returns to the submitted stage, unsubmitted, with the session stack as it was before Submit (EN-2, D2-54); Apply is then refused', async () => {
    let stack: PersistedSession['stack'] | undefined;
    const { h, runId, checkId } = await confirmed({}, async (x, id) => {
      ok(await x.manager.decide(id, 1, true, [decision(x, PG, 'accepted')], false));
      await settled(x);
      ok(await x.manager.decide(id, 1, true, [decision(x, RESULT, 'accepted')], false));
      await settled(x);
      stack = session(x).stack;
    });
    ok(await h.manager.end(runId, 'back', 1));
    expect(session(h)).toMatchObject({ phase: 'stage', stage: 1 });
    expect(session(h).confirmation).toBeUndefined();
    expect(session(h).stack).toEqual(stack);
    expect(h.manager.session()?.undo).not.toBeNull();
    expect(await h.manager.end(runId, 'apply', 1, checkId)).toEqual({ ok: false, code: 'conflict', error: END_TEXTS.noConfirmation });
    expect(await h.manager.end(runId, 'back', 1)).toEqual({ ok: false, code: 'conflict', error: REVIEW_TEXTS.historyChanged });
    expect(h.workspace.appliedChanges).toEqual([]);
  });
});

describe('the final check and the backstop (§3.10 steps 2-4, EN-2, §14.5)', () => {
  it('a stale check id is refused, and so is a stale stage; nothing is applied', async () => {
    const { h, runId } = await confirmed();
    expect(await h.manager.end(runId, 'apply', 1, 'ck0000000000000000')).toEqual({ ok: false, code: 'conflict', error: REVIEW_TEXTS.historyChanged });
    expect(await h.manager.end(runId, 'apply', 2, session(h).confirmation?.checkId)).toEqual({ ok: false, code: 'conflict', error: REVIEW_TEXTS.historyChanged });
    expect(h.workspace.appliedChanges).toEqual([]);
  });

  it('Apply waits while the check runs, and is refused once it failed, its failures listed', async () => {
    let release!: (r: FinalCheckReport) => void;
    const h0 = harness({ script: [pgScript('proved')] });
    h0.engine.onFinalCheck = () => new Promise<FinalCheckReport>((r) => (release = r));
    expect(await h0.manager.start(START)).toMatchObject({ ok: true });
    const { runId } = await waitForStage(h0.manager, 1);
    await settled(h0);
    ok(await h0.manager.decide(runId, 1, true, [decision(h0, PG, 'accepted')], false));
    ok(await h0.manager.decide(runId, 1, true, [decision(h0, RESULT, 'accepted')], false));
    await settled(h0);
    ok(await h0.manager.submit(runId, 1));
    const checkId = session(h0).confirmation?.checkId;
    expect(h0.manager.session()?.confirmation?.apply).toEqual({ ok: false, reason: REVIEW_TEXTS.applyWaitsForCheck });
    expect(await h0.manager.end(runId, 'apply', 1, checkId)).toEqual({ ok: false, code: 'conflict', error: REVIEW_TEXTS.applyWaitsForCheck });
    for (let k = 0; k < 200 && !h0.engine.methods().includes('finalCheck'); k++) await new Promise((r) => setTimeout(r, 5));
    // Refused because the check runs: that check is not started a second time.
    await new Promise((r) => setTimeout(r, 100));
    expect(h0.engine.methods().filter((m) => m === 'finalCheck')).toHaveLength(1);
    release({ passed: false, reusedFileChecks: false, judgement: internals(h0).runtimeOf(internals(h0).run).judgement as StateJudgement, failures: [{ rule: 'comparator', text: 'the comparator rejected it (test)', items: [record(h0, RESULT).id] }], backstop: [] });
    const c = await checked(h0);
    expect(c).toMatchObject({ state: 'failed', failures: [{ rule: 'comparator', text: 'the comparator rejected it (test)' }] });
    expect(h0.manager.session()?.confirmation?.apply).toEqual({ ok: false, reason: REVIEW_TEXTS.applyCheckFailed });
    expect(await h0.manager.end(runId, 'apply', 1, checkId)).toEqual({ ok: false, code: 'refused', error: REVIEW_TEXTS.applyCheckFailed });
    expect(h0.workspace.appliedChanges).toEqual([]);
  });

  it('the backstop runs again on every Apply (spy), on exactly what passed; records tampered after a check whose file checks were reused are refused by it, and nothing is applied', async () => {
    const spy = vi.fn(coreApplyBackstop);
    const { h, runId, checkId } = await confirmed({ core: { ...fakeCore(), applyBackstop: spy } });
    expect(h.manager.session()?.confirmation?.check.reusedFileChecks).toBe(true);
    // White box: the accepted Result's recorded content key no longer matches F (the backstop's `content-changed`).
    const m = internals(h);
    const result = m.sessionOf(m.run).items.find((r) => r.key === RESULT);
    if (result?.accepted === undefined) throw new Error('the Result is not accepted');
    result.accepted = { ...result.accepted, fingerprint: 'tampered' };
    expect(await h.manager.end(runId, 'apply', 1, checkId)).toEqual({ ok: false, code: 'refused', error: REVIEW_TEXTS.applyCheckFailed });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.results[0]?.value).toMatchObject({ ok: false, refusals: [expect.objectContaining({ code: 'content-changed' })] });
    expect(session(h).confirmation).toMatchObject({ state: 'failed', failures: [expect.objectContaining({ rule: 'backstop' })] });
    expect(h.workspace.appliedChanges).toEqual([]);
    expect(rawRun(h).view.state).toBe('review');
  });

  it('EN-2: the next check gets the comparator passes the last one recorded (the engine reuses them only for identical files and permitted set), and the stage judgement for its file checks', async () => {
    const seen: Array<{ judgement?: StateJudgement; comparator?: Record<string, unknown> } | undefined> = [];
    const { h, runId } = await confirmed();
    h.engine.onFinalCheck = async (ctx, reuse) => {
      seen.push(reuse as never);
      const r = await fakeFinalCheck(ctx, reuse);
      return { ...r, comparator: { [T]: { filesKey: r.judgement.filesKey, permitted: ['Spyro.cynder_dark_past.holds'] } } };
    };
    ok(await h.manager.end(runId, 'back', 1));
    ok(await h.manager.submit(runId, 1));
    await checked(h);
    ok(await h.manager.end(runId, 'back', 1));
    ok(await h.manager.submit(runId, 1));
    await checked(h);
    expect(seen).toHaveLength(2);
    expect(seen[0]?.judgement?.commit).toBe(session(h).head);
    expect(seen[1]?.comparator).toEqual({ [T]: { filesKey: seen[0]?.judgement?.filesKey, permitted: ['Spyro.cynder_dark_past.holds'] } });
  });

  it('the final check and the backstop refuse an accepted Add premise whose write never ran (AF2: not-written)', async () => {
    const h = harness({ script: [round1(step.edit(PG_BLOCK_END, PG_FORMALISED), step.freeze(), proposePremise(), step.finish('not_proved', 'It needs a premise.'), step.result())] });
    h.engine.onWritePremise = () => ({ ok: false, error: 'the Lean sandbox could not start (test)', environment: 'the Lean sandbox could not start (test)' });
    expect(await h.manager.start(START)).toMatchObject({ ok: true });
    const { runId } = await waitForStage(h.manager, 1);
    await settled(h);
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'accepted')], false));
    await settled(h);
    ok(await h.manager.decide(runId, 1, true, [acceptPremise(h, 'axiom')], false));
    await settled(h);
    expect(premiseRecord(h).card).toBeUndefined();
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'accepted')], false));
    await settled(h);
    ok(await h.manager.submit(runId, 1));
    const c = await checked(h);
    expect(c.state).toBe('failed');
    expect(c.failures).toContainEqual(expect.objectContaining({ rule: 'backstop', text: expect.stringContaining('telelean has not written it') as string }));
    expect(await h.manager.end(runId, 'apply', 1, c.checkId)).toEqual({ ok: false, code: 'refused', error: REVIEW_TEXTS.applyCheckFailed });
  });

  it('an accepted premise stays accepted after its write and its completion, and Apply passes the backstop\'s content-changed', async () => {
    const h = harness({ script: [round1(step.edit(PG_BLOCK_END, PG_FORMALISED), step.freeze(), proposePremise(), step.finish('not_proved', 'It needs a premise.'), step.result())] });
    expect(await h.manager.start(START)).toMatchObject({ ok: true });
    const { runId } = await waitForStage(h.manager, 1);
    await settled(h);
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'accepted')], false));
    await settled(h);
    ok(await h.manager.decide(runId, 1, true, [acceptPremise(h, 'axiom')], false));
    await settled(h);
    expect(premiseRecord(h)).toMatchObject({ status: 'accepted' });
    expect(record(h, RESULT)).toMatchObject({ status: 'in-review', markers: expect.arrayContaining(['updated']) });
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'accepted')], false));
    await settled(h);
    expect(premiseRecord(h).status).toBe('accepted');
    ok(await h.manager.submit(runId, 1));
    const c = await checked(h);
    expect(c).toMatchObject({ state: 'passed', failures: [] });
    ok(await h.manager.end(runId, 'apply', 1, c.checkId));
    const after = h.workspace.texts.get(MAIN) ?? '';
    expect(after).toContain('cynder_not_good.holds');
    expect(after).toContain('not_in_game_not_good.holds');
    // The premise's arrow, from the Apply's provenance (G1).
    expect(h.sidecars.resolutions[0]?.arrows).toEqual([{ source: premiseRecord(h).card, target: T, step: 's1', kind: 'premise' }]);
  });
});

describe('drift (§3.9, ES-7, A4)', () => {
  it('a change of the person\'s files sets the drift (debounced), with when it was first seen; Apply is refused meanwhile; undoing it clears the drift and the same Apply goes through', async () => {
    const { h, runId, checkId } = await confirmed();
    h.proposals.drift = [MAIN];
    h.workspace.fire();
    await viewDrift(h, (d) => d !== null);
    expect(session(h).drift).toEqual({ files: [MAIN], at: expect.any(String) as string });
    const at = session(h).drift?.at;
    expect(h.manager.session()?.drift).toEqual({ files: [MAIN], at });
    expect(h.manager.session()?.confirmation?.apply).toEqual({ ok: false, reason: REVIEW_TEXTS.drift([MAIN]) });
    expect(await h.manager.end(runId, 'apply', 1, checkId)).toEqual({ ok: false, code: 'conflict', error: REVIEW_TEXTS.drift([MAIN]) });
    expect(h.workspace.appliedChanges).toEqual([]);
    // A second file: the first-seen time stays.
    h.proposals.drift = [MAIN, 'Model/Spyro/Vocabulary.lean'];
    h.workspace.fire();
    await viewDrift(h, (d) => d?.files.length === 2);
    expect(session(h).drift).toEqual({ files: [MAIN, 'Model/Spyro/Vocabulary.lean'], at });
    h.proposals.drift = [];
    h.workspace.fire();
    await viewDrift(h, (d) => d === null);
    expect(session(h).drift).toBeUndefined();
    expect(h.manager.session()?.drift).toBeNull();
    ok(await h.manager.end(runId, 'apply', 1, checkId));
    expect(h.workspace.appliedChanges).toHaveLength(1);
  });

  it('files changing between the check and Apply (a hand edit no watcher reported yet): planApply\'s own read refuses it, nothing applied, and the drift is recorded', async () => {
    const { h, runId, checkId } = await confirmed();
    const before = h.workspace.texts.get(MAIN) ?? '';
    h.workspace.texts.set(MAIN, `${before}-- a hand edit\n`);
    expect(await h.manager.end(runId, 'apply', 1, checkId)).toEqual({ ok: false, code: 'conflict', error: REVIEW_TEXTS.drift([MAIN]) });
    expect(h.workspace.appliedChanges).toEqual([]);
    expect(session(h)).toMatchObject({ phase: 'confirming', drift: { files: [MAIN] } });
  });

  it('while a step runs, drift is recorded and the step goes on; the base commit never moves', async () => {
    const h = harness({ script: [round1(step.check(), { kind: 'sleep', ms: 400 }, ...pgSteps())] });
    expect(await h.manager.start(START)).toMatchObject({ ok: true });
    const base = (await h.shadow().commits()).find((c) => c.kind === 'base')?.id;
    await waitForRun(h.manager, (v) => v.state === 'working' && v.counters.checks === 1);
    h.proposals.drift = [MAIN];
    h.workspace.fire();
    for (let k = 0; k < 200 && session(h).drift === undefined; k++) await new Promise((r) => setTimeout(r, 10));
    expect(session(h).drift?.files).toEqual([MAIN]);
    await waitForStage(h.manager, 1);
    expect(session(h).drift?.files).toEqual([MAIN]);
    expect((await h.shadow().commits()).filter((c) => c.kind === 'base').map((c) => c.id)).toEqual([base]);
  });
});

/** Until the published view's drift satisfies `ok` and nothing judges (the drift is recorded through the write queue). */
async function viewDrift(h: Harness, ok: (d: { files: string[]; at: string } | null | undefined) => boolean): Promise<void> {
  for (let k = 0; k < 300 && !(ok(h.manager.session()?.drift) && h.manager.session()?.judging === false); k++) await new Promise((r) => setTimeout(r, 10));
  expect(ok(h.manager.session()?.drift)).toBe(true);
}

/** pgScript('proved')'s steps, for scripts that start with other steps. */
function pgSteps(): ReturnType<typeof step.check>[] {
  return [step.edit(PG_BLOCK_END, PG_FORMALISED), step.freeze(), step.edit(GOAL_LINE, GOAL_LINE + GOAL_PROOF), step.finish('proved', 'Proved.'), step.result()];
}

describe('Exit (§3.10 step 6, ES-8, EN-4)', () => {
  it('in a stage: no model file is written, every step\'s attempt record is resolved discarded, and the run ends discarded', async () => {
    const h = harness({ script: [pgScript('proved')] });
    expect(await h.manager.start(START)).toMatchObject({ ok: true });
    const { runId } = await waitForStage(h.manager, 1);
    await settled(h);
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'accepted')], false));
    await settled(h);
    // D2-11: no attempt record reaches attempts.jsonl while the session is open (so graph.attempts shows no verdict).
    expect(h.sidecars.attempts).toEqual([]);
    const texts = new Map(h.workspace.texts);
    expect(await h.manager.end(runId, 'exit')).toMatchObject({ ok: true, label: 'Session ended' });
    expect(h.workspace.appliedChanges).toEqual([]);
    expect(h.workspace.texts).toEqual(texts);
    expect(h.sidecars.attempts.map((a) => a.round)).toEqual([1]);
    expect(h.sidecars.resolutions.map((r) => r.resolution)).toEqual(['discarded']);
    expect(rawRun(h).view.state).toBe('discarded');
    expect(rawRun(h).view.notices.at(-1)?.text).toBe(END_TEXTS.exited);
  });

  it('stops a running step (Claude\'s process and the run\'s Lean jobs, as Cancel step does), whose attempt is recorded cancelled, then discarded', async () => {
    const h = harness({ script: [round1(step.check(), { kind: 'sleep', ms: 60_000 })] });
    expect(await h.manager.start(START)).toMatchObject({ ok: true });
    const working = await waitForRun(h.manager, (v) => v.state === 'working' && v.counters.checks === 1);
    expect(await h.manager.end(working.runId, 'exit')).toMatchObject({ ok: true });
    expect(h.backend?.interrupts.length).toBeGreaterThan(0);
    expect(h.cancelled).toContain(working.runId);
    expect(rawRun(h).view.state).toBe('discarded');
    expect(rawRun(h).session?.steps[0]?.state).toBe('cancelled');
    expect(h.sidecars.attempts.map((a) => a.verdict)).toEqual(['cancelled']);
    expect(h.sidecars.resolutions.map((r) => r.resolution)).toEqual(['discarded']);
    expect(h.workspace.appliedChanges).toEqual([]);
  });

  it('in the end confirmation it ends the session too; Back and Apply are refused afterwards', async () => {
    const { h, runId, checkId } = await confirmed();
    ok(await h.manager.end(runId, 'exit'));
    expect(rawRun(h).view.state).toBe('discarded');
    expect(await h.manager.end(runId, 'apply', 1, checkId)).toMatchObject({ ok: false, code: 'not-found' });
    expect(h.workspace.appliedChanges).toEqual([]);
  });

  it('two Exits at once (Exit skips the host\'s run queue, so a double click sends both): one ends the session, the other answers that it is ending; each record is written once', async () => {
    const { h, runId } = await confirmed();
    const outcomes = await Promise.all([h.manager.end(runId, 'exit'), h.manager.end(runId, 'exit')]);
    expect(outcomes.filter((o) => o.ok)).toHaveLength(1);
    expect(outcomes.filter((o) => !o.ok)).toEqual([{ ok: false, code: 'conflict', error: END_TEXTS.exiting }]);
    expect(rawRun(h).view.state).toBe('discarded');
    expect(h.sidecars.attempts).toHaveLength(1);
    expect(h.sidecars.resolutions.map((r) => r.resolution)).toEqual(['discarded']);
    // Once it has ended, another Exit finds no session.
    expect(await h.manager.end(runId, 'exit')).toMatchObject({ ok: false, code: 'not-found' });
  });

  /** A write already in the session's write queue holds it until `release`. */
  function holdQueue(h: Harness): () => void {
    const m = internals(h);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    void m.enqueueWrite(m.run, () => held);
    return release;
  }

  it('an Exit while Apply waits in the write queue ends the session discarded, and Apply does not run afterwards: nothing applied', async () => {
    const { h, runId, checkId } = await confirmed();
    const release = holdQueue(h);
    const applying = h.manager.end(runId, 'apply', 1, checkId);
    await new Promise((r) => setTimeout(r, 30));
    ok(await h.manager.end(runId, 'exit'));
    release();
    expect(await applying).toEqual({ ok: false, code: 'conflict', error: 'This run has ended.' });
    expect(h.proposals.applyRequests).toEqual([]);
    expect(h.workspace.appliedChanges).toEqual([]);
    expect(rawRun(h).view.state).toBe('discarded');
    expect(rawRun(h).session?.phase).toBe('confirming');
    expect(h.sidecars.resolutions.map((r) => r.resolution)).toEqual(['discarded']);
  });

  it('an Exit that comes in while Apply reads the drift (after its first checks, before it writes): Apply stops before the phase `applying`, nothing applied', async () => {
    const { h, runId, checkId } = await confirmed();
    const real = h.proposals.baseDrift.bind(h.proposals);
    let exited: Promise<ActionOutcome> | undefined;
    h.proposals.baseDrift = async (...args: Parameters<typeof real>) => {
      exited ??= h.manager.end(runId, 'exit');
      await exited;
      return real(...args);
    };
    expect(await h.manager.end(runId, 'apply', 1, checkId)).toEqual({ ok: false, code: 'conflict', error: 'This run has ended.' });
    expect(exited).toBeDefined();
    ok(await (exited as Promise<ActionOutcome>));
    expect(h.proposals.applyRequests).toEqual([]);
    expect(h.workspace.appliedChanges).toEqual([]);
    expect(rawRun(h).view.state).toBe('discarded');
    expect(rawRun(h).session?.phase).toBe('confirming');
    expect(h.sidecars.resolutions.map((r) => r.resolution)).toEqual(['discarded']);
  });

  it('an Exit while Back to review, or a decision, waits in the write queue: neither runs afterwards (run.json keeps the session as Exit left it)', async () => {
    const { h, runId } = await confirmed();
    const release = holdQueue(h);
    const back = h.manager.end(runId, 'back', 1);
    await new Promise((r) => setTimeout(r, 30));
    ok(await h.manager.end(runId, 'exit'));
    release();
    expect(await back).toEqual({ ok: false, code: 'conflict', error: 'This run has ended.' });
    expect(rawRun(h).session).toMatchObject({ phase: 'confirming', confirmation: { state: 'passed' } });

    const d = harness({ script: [pgScript('proved')] });
    expect(await d.manager.start(START)).toMatchObject({ ok: true });
    const stage = await waitForStage(d.manager, 1);
    await settled(d);
    const freed = holdQueue(d);
    const deciding = d.manager.decide(stage.runId, 1, true, [decision(d, PG, 'accepted')], false);
    await new Promise((r) => setTimeout(r, 30));
    ok(await d.manager.end(stage.runId, 'exit'));
    freed();
    expect(await deciding).toEqual({ ok: false, code: 'conflict', error: 'This run has ended.' });
    expect(record(d, PG).status).toBe('in-review');
    expect(rawRun(d).view.state).toBe('discarded');
  });
});

describe('provenance (§3.10 step 4, coverage audit G1, AP-29)', () => {
  it('an Apply with two accepted Claude arrows and one accepted Add premise records the three, with their steps, on the attempt record and the history entry; a declined arrow is not listed', async () => {
    const h = harness({
      source: auxModel(),
      withFacts: false,
      script: [
        round1(
          proposeArrow('aux-one'),
          proposeArrow('aux-two'),
          proposeArrow('aux-three'),
          step.freeze(),
          { ...proposePremise(), args: { ...(proposePremise() as { args: Record<string, unknown> }).args, proof: 'fun h => h cynder newSpyro' } } as ReturnType<typeof proposePremise>,
          step.finish('not_proved', 'It needs a premise.'),
          step.result(),
        ),
      ],
    });
    expect(await h.manager.start({ subject: 'Spyro', target: T, premises: ['cynder-dark-past', 'new-spyro-pg'] })).toMatchObject({ ok: true });
    const { runId } = await waitForStage(h.manager, 1);
    await settled(h);
    expect(h.manager.session()?.results.shown).toBe(true);
    for (const key of ['arrow:aux-one>cynder-not-good', 'arrow:aux-two>cynder-not-good']) {
      ok(await h.manager.decide(runId, 1, true, [decision(h, key, 'accepted')], false));
      await settled(h);
    }
    ok(await h.manager.decide(runId, 1, true, [decision(h, 'arrow:aux-three>cynder-not-good', 'declined', { option: 'plain' })], true));
    await settled(h);
    ok(await h.manager.decide(runId, 1, true, [acceptPremise(h, 'axiom')], false));
    await settled(h);
    if (record(h, RESULT).status !== 'accepted') ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'accepted')], true));
    await settled(h);
    ok(await h.manager.submit(runId, 1));
    const c = await checked(h);
    expect(c).toMatchObject({ state: 'passed' });
    ok(await h.manager.end(runId, 'apply', 1, c.checkId));
    const card = premiseRecord(h).card;
    const arrows = [
      { source: 'aux-one', target: T, step: 's1', kind: 'arrow' },
      { source: 'aux-two', target: T, step: 's1', kind: 'arrow' },
      { source: card, target: T, step: 's1', kind: 'premise' },
    ];
    expect(h.sidecars.resolutions).toEqual([expect.objectContaining({ resolution: 'accepted', arrows })]);
    expect(h.workspace.appliedChanges[0]?.arrows).toEqual(arrows);
    expect(record(h, PREMISE_KEY).status).toBe('accepted');
  });

  it('two steps, each with an accepted arrow of its own (a Shaky Result\'s Submit step proposes the second): each step\'s attempt record lists only its own, the history entry both', async () => {
    const h = harness({
      source: auxModel(),
      withFacts: false,
      script: [
        round1(proposeArrow('aux-one'), step.freeze(), step.edit(GOAL_LINE, GOAL_LINE + GOAL_PROOF_AXIOMS), step.finish('proved', 'Proved.'), step.result()),
        { match: `rework “${T}” after the review`, steps: [proposeArrow('aux-two'), step.freeze(T), step.edit(GOAL_LINE, GOAL_LINE + GOAL_PROOF_AXIOMS), step.finish('proved', 'Proved again.'), step.result()] },
      ],
    });
    expect(await h.manager.start({ subject: 'Spyro', target: T, premises: ['cynder-dark-past', 'new-spyro-pg'] })).toMatchObject({ ok: true });
    const { runId } = await waitForStage(h.manager, 1);
    await settled(h);
    expect(h.manager.session()?.results.shown).toBe(true);
    ok(await h.manager.decide(runId, 1, true, [decision(h, 'arrow:aux-one>cynder-not-good', 'accepted')], false));
    await settled(h);
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'declined', { option: 'shaky', note: 'Prove it again.' })], false));
    await settled(h);
    ok(await h.manager.submit(runId, 1));
    await waitForStage(h.manager, 2);
    await settled(h);
    ok(await h.manager.decide(runId, 2, true, [decision(h, 'arrow:aux-two>cynder-not-good', 'accepted')], false));
    await settled(h);
    if (record(h, RESULT).status !== 'accepted') ok(await h.manager.decide(runId, 2, true, [decision(h, RESULT, 'accepted')], true));
    await settled(h);
    ok(await h.manager.submit(runId, 2));
    const c = await checked(h);
    expect(c).toMatchObject({ state: 'passed' });
    ok(await h.manager.end(runId, 'apply', 2, c.checkId));
    const ids = session(h).steps.map((x) => x.id);
    expect(ids).toHaveLength(2);
    const one = { source: 'aux-one', target: T, step: ids[0], kind: 'arrow' };
    const two = { source: 'aux-two', target: T, step: ids[1], kind: 'arrow' };
    expect(h.sidecars.resolutions.map((r) => [r.resolution, r.arrows])).toEqual([
      ['accepted', [one]],
      ['accepted', [two]],
    ]);
    expect(h.workspace.appliedChanges[0]?.arrows).toEqual([one, two]);
  });
});

describe('moves on the Proposed view (D2-33)', () => {
  it('a move is one session-stack step, its positions the runner\'s; Undo puts them back, Redo sets them again; Exit drops them', async () => {
    const h = harness({ script: [pgScript('proved')] });
    expect(await h.manager.start(START)).toMatchObject({ ok: true });
    const { runId } = await waitForStage(h.manager, 1);
    await settled(h);
    ok(await h.manager.moveProposed(runId, { [T]: { x: 10, y: 20 } }));
    expect(session(h).positions).toEqual({ [T]: { x: 10, y: 20 } });
    ok(await h.manager.moveProposed(runId, { [T]: { x: 30, y: 40 } }));
    expect(session(h).positions).toEqual({ [T]: { x: 30, y: 40 } });
    const top = session(h).stack.done.at(-1);
    expect(top).toMatchObject({ kind: 'move', before: { [T]: { x: 10, y: 20 } }, after: { [T]: { x: 30, y: 40 } } });
    expect(h.manager.session()?.board.positions).toEqual({ [T]: { x: 30, y: 40 } });
    ok(await h.manager.undoSession(runId, top?.id ?? -1, false));
    expect(session(h).positions).toEqual({ [T]: { x: 10, y: 20 } });
    ok(await h.manager.undoSession(runId, session(h).stack.done.at(-1)?.id ?? -1, false));
    expect(session(h).positions).toBeUndefined();
    ok(await h.manager.redoSession(runId, session(h).stack.undone.at(-1)?.id ?? -1, false));
    expect(session(h).positions).toEqual({ [T]: { x: 10, y: 20 } });
    // Refusals: no card, an axiom card (it has no place on the canvas).
    expect(await h.manager.moveProposed(runId, { nope: { x: 1, y: 1 } })).toMatchObject({ ok: false, code: 'not-found' });
    expect(await h.manager.moveProposed(runId, { 'cynder-dark-past': { x: 1, y: 1 } })).toMatchObject({ ok: false, code: 'invalid' });
    ok(await h.manager.end(runId, 'exit'));
    expect(h.workspace.appliedChanges).toEqual([]);
  });

  it('a position that is not a pair of finite numbers, and a card of another subject, are refused, and the positions stay as they were (A-F3)', async () => {
    // Another subject's proposition (a dependency's): a second folder under Model/ with one card.
    const source = path.join(makeTempDir('other-subject'), 'source');
    mkdirSync(source, { recursive: true });
    cpSync(SPYRO_FIXTURE, source, { recursive: true, filter: (src) => !src.includes(`${path.sep}.lake`) });
    mkdirSync(path.join(source, 'Model', 'Other'), { recursive: true });
    writeFileSync(
      path.join(source, 'Model', 'Other', 'Main.lean'),
      'import Model.Spyro.Vocabulary\n\nnamespace Other\n\n/-\n@@ telelean v1\nid: other-card\ntype: PROPOSITION\nnatural_name: Something else holds\nasserted: 2026-11-01\nlean: Other.other_card\n-/\n/-- Something else holds -/\nabbrev other_card : Prop := True\ntheorem other_card.holds : other_card := trivial\n',
    );
    const h = harness({ script: [pgScript('proved')], source });
    expect(await h.manager.start(START)).toMatchObject({ ok: true });
    const { runId } = await waitForStage(h.manager, 1);
    await settled(h);
    ok(await h.manager.moveProposed(runId, { [T]: { x: 10, y: 20 } }));
    const stack = session(h).stack.done.length;
    for (const bad of [{ x: Number.NaN, y: 1 }, { x: 1, y: Number.POSITIVE_INFINITY }, { x: Number.NEGATIVE_INFINITY, y: 1 }]) {
      expect(await h.manager.moveProposed(runId, { [T]: bad })).toMatchObject({ ok: false, code: 'invalid' });
    }
    expect(await h.manager.moveProposed(runId, { [T]: { x: 1 } as never })).toMatchObject({ ok: false, code: 'invalid' });
    expect(await h.manager.moveProposed(runId, { [T]: null as never })).toMatchObject({ ok: false, code: 'invalid' });
    expect(await h.manager.moveProposed(runId, { 'other-card': { x: 1, y: 1 } })).toMatchObject({ ok: false, code: 'not-found' });
    // A refused move moves nothing, even a valid card in the same request.
    expect(await h.manager.moveProposed(runId, { [T]: { x: 5, y: 5 }, 'other-card': { x: 1, y: 1 } })).toMatchObject({ ok: false, code: 'not-found' });
    expect(session(h).positions).toEqual({ [T]: { x: 10, y: 20 } });
    expect(session(h).stack.done).toHaveLength(stack);
  });
});

describe('a reload in the end confirmation and during Apply (§3.10 step 7, §3.11)', () => {
  async function reload(a: Harness, prepare: (b: Harness) => void = () => undefined): Promise<Harness> {
    await a.manager.dispose();
    const b = makeHarness({ reuse: { dir: a.dir, root: a.root, runsDir: a.runsDir, workspace: a.workspace } });
    toDispose.unshift(() => b.dispose());
    scriptEnd(b);
    prepare(b);
    await b.manager.recover();
    return b;
  }
  /** A confirmed session whose Apply is held inside `applyChanges` (phase `applying` on disk): the window closes then. */
  async function applying(): Promise<{ h: Harness; runId: string; F: string; B: string }> {
    const { h, runId, checkId } = await confirmed();
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    h.proposals.applyOutcome = undefined;
    const apply = h.proposals.apply.bind(h.proposals);
    h.proposals.apply = async (...args) => {
      await held;
      return apply(...args);
    };
    void h.manager.end(runId, 'apply', 1, checkId);
    for (let k = 0; k < 200 && rawRun(h).session?.phase !== 'applying'; k++) await new Promise((r) => setTimeout(r, 10));
    expect(rawRun(h).session?.phase).toBe('applying');
    toDispose.push(() => release());
    return { h, runId, F: await main(h), B: (await h.shadow().baseFiles()).get(MAIN) ?? '' };
  }

  it('the real files equal F: Apply had finished, so the session ends as applied', async () => {
    const { h, F } = await applying();
    h.workspace.texts.set(MAIN, F);
    const b = await reload(h);
    const v = await waitForRun(b.manager, (x) => x.state === 'accepted');
    expect(v.accepted).toEqual({ changedFiles: true });
    expect(b.sidecars.resolutions.map((r) => r.resolution)).toEqual(['accepted']);
    expect(b.workspace.appliedChanges).toEqual([]);
  });

  it('the real files equal B: nothing was written, so back to the end confirmation, whose check runs again', async () => {
    const { h } = await applying();
    const b = await reload(h);
    const c = await checked(b);
    expect(session(b).phase).toBe('confirming');
    expect(c.state).toBe('passed');
    expect(b.engine.methods()).toContain('finalCheck');
    expect(session(b).drift).toBeUndefined();
    ok(await b.manager.end(rawRun(b).view.runId, 'apply', 1, c.checkId));
    expect(b.workspace.appliedChanges).toHaveLength(1);
  });

  it('anything else: a notice, the drift, back to the end confirmation; nothing is applied again blindly', async () => {
    const { h, B } = await applying();
    h.workspace.texts.set(MAIN, `${B}-- something else\n`);
    // The fake's baseDrift reports what the person's files hold now (the real one reads them).
    const b = await reload(h, (x) => (x.proposals.drift = [MAIN]));
    await checked(b);
    expect(session(b)).toMatchObject({ phase: 'confirming', drift: { files: [MAIN] } });
    expect(rawRun(b).view.notices.at(-1)?.text).toBe(END_TEXTS.reloadedDuringApply([MAIN]));
    expect(b.workspace.appliedChanges).toEqual([]);
  });

  it('a confirmation whose check was running comes back with the check running again', async () => {
    let release!: (r: FinalCheckReport) => void;
    const h = makeHarness({ script: [pgScript('proved')] });
    toDispose.push(() => h.dispose());
    scriptEnd(h);
    h.engine.onFinalCheck = () => new Promise<FinalCheckReport>((r) => (release = r));
    expect(await h.manager.start(START)).toMatchObject({ ok: true });
    const { runId } = await waitForStage(h.manager, 1);
    await settled(h);
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'accepted')], false));
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'accepted')], false));
    await settled(h);
    ok(await h.manager.submit(runId, 1));
    expect(rawRun(h).session?.confirmation?.state).toBe('running');
    const b = await reload(h);
    const c = await checked(b);
    expect(c.state).toBe('passed');
    void release;
  });
});

describe('the end confirmation\'s guards (§3.10 steps 3-4)', () => {
  it('a status or ws/ change since the check (white box) refuses Apply: the check id no longer matches the head and the records', async () => {
    const { h, runId, checkId } = await confirmed();
    const m = internals(h);
    const pg = m.sessionOf(m.run).items.find((r) => r.key === PG);
    if (pg === undefined) throw new Error('no PG item');
    pg.fingerprint = `${pg.fingerprint}x`;
    expect(await h.manager.end(runId, 'apply', 1, checkId)).toEqual({ ok: false, code: 'conflict', error: REVIEW_TEXTS.historyChanged });
    expect(h.workspace.appliedChanges).toEqual([]);
  });

  it('Back to review while the check runs: its outcome, once it comes, changes nothing (the confirmation it was for is gone)', async () => {
    let release!: (r: FinalCheckReport) => void;
    const h = harness({ script: [pgScript('proved')] });
    h.engine.onFinalCheck = () => new Promise<FinalCheckReport>((r) => (release = r));
    expect(await h.manager.start(START)).toMatchObject({ ok: true });
    const { runId } = await waitForStage(h.manager, 1);
    await settled(h);
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'accepted')], false));
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'accepted')], false));
    await settled(h);
    ok(await h.manager.submit(runId, 1));
    for (let k = 0; k < 200 && !h.engine.methods().includes('finalCheck'); k++) await new Promise((r) => setTimeout(r, 5));
    ok(await h.manager.end(runId, 'back', 1));
    release({ passed: true, reusedFileChecks: true, judgement: internals(h).runtimeOf(internals(h).run).judgement as StateJudgement, failures: [], backstop: [] });
    await new Promise((r) => setTimeout(r, 50));
    await settled(h);
    expect(session(h).phase).toBe('stage');
    expect(session(h).confirmation).toBeUndefined();
  });

  it('the outcome of an earlier confirmation\'s check is dropped: Back while it runs, a decision, Submit again (another check id); the new check stays running until its own outcome', async () => {
    const calls: Array<{ args: Parameters<typeof fakeFinalCheck>; release: (r: FinalCheckReport) => void }> = [];
    const h = harness({ script: [pgScript('proved')] });
    h.engine.onFinalCheck = (ctx, reuse) => new Promise<FinalCheckReport>((r) => calls.push({ args: [ctx, reuse], release: r }));
    expect(await h.manager.start(START)).toMatchObject({ ok: true });
    const { runId } = await waitForStage(h.manager, 1);
    await settled(h);
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'accepted')], false));
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'accepted')], false));
    await settled(h);
    ok(await h.manager.submit(runId, 1));
    const first = session(h).confirmation?.checkId;
    for (let k = 0; k < 200 && calls.length < 1; k++) await new Promise((r) => setTimeout(r, 5));
    ok(await h.manager.end(runId, 'back', 1));
    // Another confirmation: the Result rejected (its proof taken out), so the head and the records differ, and the check id.
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'declined', { option: 'reject' })], true));
    await settled(h);
    ok(await h.manager.submit(runId, 1));
    const second = session(h).confirmation?.checkId;
    expect(second).toMatch(/^ck[0-9a-f]{16}$/u);
    expect(second).not.toBe(first);
    for (let k = 0; k < 200 && calls.length < 2; k++) await new Promise((r) => setTimeout(r, 5));
    expect(calls).toHaveLength(2);
    const judgement = internals(h).runtimeOf(internals(h).run).judgement as StateJudgement;
    calls[0]?.release({ passed: false, reusedFileChecks: false, judgement, failures: [{ rule: 'comparator', text: 'the earlier confirmation\'s check (test)' }], backstop: [] });
    await new Promise((r) => setTimeout(r, 50));
    expect(session(h).confirmation).toMatchObject({ checkId: second, state: 'running', failures: [] });
    const own = calls[1];
    if (own === undefined) throw new Error('no second check');
    own.release(await fakeFinalCheck(...own.args));
    const c = await checked(h);
    expect(c).toMatchObject({ checkId: second, state: 'passed', failures: [] });
    ok(await h.manager.end(runId, 'apply', 1, second));
    expect(h.workspace.appliedChanges).toHaveLength(1);
  });

  it('Exit is refused while Apply writes the files (Apply ends the session itself)', async () => {
    const { h, runId, checkId } = await confirmed();
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const apply = h.proposals.apply.bind(h.proposals);
    h.proposals.apply = async (...args) => {
      await held;
      return apply(...args);
    };
    const applying = h.manager.end(runId, 'apply', 1, checkId);
    for (let k = 0; k < 200 && rawRun(h).session?.phase !== 'applying'; k++) await new Promise((r) => setTimeout(r, 10));
    expect(await h.manager.end(runId, 'exit')).toEqual({ ok: false, code: 'conflict', error: REVIEW_TEXTS.applyingNow });
    // Back to review waits its turn (one user action at a time) and would meet the same refusal.
    expect(await h.manager.end(runId, 'back', 1)).toMatchObject({ ok: false, code: 'conflict' });
    release();
    ok(await applying);
    expect(rawRun(h).view.state).toBe('accepted');
  });
});

describe('a presupposition\'s helper instance (RV-1; found by builder 2f with real Lean)', () => {
  it('a step\'s new anonymous instance of a presupposition gets its ledger `created` entry, so its presupposition\'s item owns it: no unowned problem, and Apply passes', async () => {
    const VOCAB = 'Model/Spyro/Vocabulary.lean';
    const SORT = '/-- dragons -/\naxiom Dragon : Type\n/-- there is at least one dragon -/\naxiom Dragon.exists : Nonempty Dragon\ninstance : Nonempty Dragon := Dragon.exists\n';
    const script = [round1(step.edit('\nend Spyro', `\n${SORT}\nend Spyro`, VOCAB), ...pgSteps())];
    const { h, runId, checkId } = await confirmedStage(toDispose, { script }, async (x, id) => {
      expect(session(x).ledger.filter((e) => e.kind === 'created').map((e) => (e.kind === 'created' ? e.name : ''))).toContain('Spyro.instNonemptyDragon');
      expect(session(x).judged?.problems).toEqual([]);
      expect(record(x, 'decl:Spyro.Dragon.exists').content.decls.map((d) => d.name)).toEqual(['Spyro.Dragon.exists', 'Spyro.instNonemptyDragon']);
      await acceptEverything(x.manager, id);
    });
    expect(session(h).confirmation).toMatchObject({ state: 'passed', failures: [] });
    ok(await h.manager.end(runId, 'apply', 1, checkId));
    expect(h.workspace.texts.get(VOCAB)).toContain('instance : Nonempty Dragon := Dragon.exists');
  });
});
