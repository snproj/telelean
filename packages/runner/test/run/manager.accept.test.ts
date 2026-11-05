/**
 * AT3.10 (docs/m2-plan.md section 7.1): Accept's orchestration with fakes. No drift -> plan + apply. Drift ->
 * `accept-base` and `rebase` commits; normalise/freeze/gate with baseCommit = accept-base and roundStartCommit =
 * rebase; planAccept again with shownState; apply. A failed re-gate is refused with the described findings and ws/
 * restored to the shown state. A missing definition approval -> invalid.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { finding } from './helpers/fakeEngine.js';
import { makeHarness, round1, START, state, step, waitForRun, type Harness } from './helpers/harness.js';

const MAIN = 'Model/Spyro/Main.lean';
const TARGET_LINE = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';
const PROOF = 'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n';
const USER_EDIT_OLD = 'rationale: known from gaming news';
const USER_EDIT_NEW = 'rationale: announced by the publisher';

let h: Harness | undefined;
afterEach(() => {
  h?.dispose();
  h = undefined;
});

async function provedRun(): Promise<{ harness: Harness; runId: string }> {
  const harness = makeHarness({ script: [round1(step.freeze(), step.edit(TARGET_LINE, TARGET_LINE + PROOF), step.finish(), step.result())] });
  await harness.manager.start(START);
  const review = await waitForRun(harness.manager, state('review'));
  return { harness, runId: review.runId };
}

describe('Accept (AT3.10)', () => {
  it('without drift: plans, applies, resolves the attempt as accepted and ends the run', async () => {
    const { harness, runId } = await provedRun();
    h = harness;
    const outcome = await h.manager.accept(runId, 'p1', ['l1'], []);
    expect(outcome).toMatchObject({ ok: true });
    expect(h.proposals.plans).toHaveLength(1);
    expect(h.proposals.plans[0]?.lifecycle).toEqual(['l1']);
    expect(h.proposals.plans[0]?.shownState).toBeUndefined();
    expect(h.proposals.applied).toHaveLength(1);
    expect(h.log.filter((l) => l.startsWith('proposals.'))).toEqual(['proposals.baseDrift', 'proposals.build', 'proposals.baseDrift', 'proposals.planAccept', 'proposals.apply']);
    expect(h.engine.methods().slice(-1)).toEqual(['gate']); // no re-check without drift
    const v = h.manager.current();
    expect(v).toMatchObject({ state: 'accepted' });
    expect(v?.proposalId).toBeUndefined();
    expect(h.manager.proposal()).toBeNull();
    expect(h.sidecars.resolutions).toEqual([expect.objectContaining({ round: 1, resolution: 'accepted' })]);
    expect(h.backend?.closes.length).toBeGreaterThan(0);
    expect(v?.notices.at(-1)?.text).toBe('Accepted: FAKE label. Undo reverts it.');
    // Fixer round 3: the outcome as data, for a board that did not send the Accept (no notice parsing).
    expect(v?.accepted).toEqual({ changedFiles: true });
  });

  it('an Accept that changes no file is worded as recorded, with no Undo hint (fixer round 1)', async () => {
    const { harness, runId } = await provedRun();
    h = harness;
    h.proposals.applyOutcome = { ok: true, label: 'FAKE label', undoable: false };
    const outcome = await h.manager.accept(runId, 'p1', [], []);
    expect(outcome).toEqual({ ok: true, label: 'Recorded: FAKE label (no file changed)', undoable: false });
    const v = h.manager.current();
    expect(v).toMatchObject({ state: 'accepted' });
    expect(v?.notices.at(-1)?.text).toBe('Recorded: FAKE label (no file changed).');
    expect(v?.notices.some((n) => n.text.includes('Undo'))).toBe(false);
    expect(v?.accepted).toEqual({ changedFiles: false });
  });

  it('refuses a stale proposal id, unknown lifecycle items and missing definition approvals', async () => {
    h = makeHarness({ script: [round1(step.freeze(), step.edit(TARGET_LINE, TARGET_LINE + PROOF), step.finish(), step.result())] });
    h.proposals.definitions = [{ id: 'd1', name: 'Spyro.InGame', kind: 'definition', code: 'def InGame (c : Character) (g : Game) : Prop := GoodAddition c g', usedByStatementsOf: ['pg-no-dark-past'] }];
    await h.manager.start(START);
    const review = await waitForRun(h.manager, state('review'));
    expect(await h.manager.accept(review.runId, 'p9', [], ['d1'])).toMatchObject({ ok: false, code: 'not-found' });
    expect(await h.manager.accept(review.runId, 'p1', ['l7'], ['d1'])).toMatchObject({ ok: false, code: 'not-found' });
    const missing = await h.manager.accept(review.runId, 'p1', ['l1'], []);
    expect(missing).toEqual({ ok: false, code: 'invalid', error: 'Answer every definition question: a “no” is feedback.' });
    expect(h.proposals.plans).toHaveLength(0);
    expect(await h.manager.accept(review.runId, 'p1', ['l1'], ['d1'])).toMatchObject({ ok: true });
  });

  it('with drift: commits accept-base and rebase, re-freezes and re-gates against them, then applies exactly the re-gated files', async () => {
    const { harness, runId } = await provedRun();
    h = harness;
    const shadow = h.shadow();
    // The user edited a rationale in their real files during the run.
    const real = h.workspace.texts.get(MAIN) ?? '';
    h.workspace.texts.set(MAIN, real.replace(USER_EDIT_OLD, USER_EDIT_NEW));
    h.proposals.drift = [MAIN];
    h.proposals.onPlan = async (request) => {
      const merged = new Map(request.shownState ?? (await request.shadow.currentFiles()));
      if (request.shownState === undefined) merged.set(MAIN, (merged.get(MAIN) ?? '').replace(USER_EDIT_OLD, USER_EDIT_NEW));
      return { ok: true, changes: [{ path: MAIN, before: h?.workspace.texts.get(MAIN) ?? null, after: merged.get(MAIN) ?? null }], label: 'These suffice → proved', nodes: ['cynder-not-good'], drift: [MAIN], shadowState: merged };
    };
    const before = h.engine.calls.length;
    const outcome = await h.manager.accept(runId, 'p1', ['l1'], []);
    expect(outcome).toMatchObject({ ok: true });
    const commits = await shadow.commits();
    const acceptBase = commits.find((c) => c.kind === 'accept-base');
    const rebase = commits.find((c) => c.kind === 'rebase');
    expect(acceptBase).toBeDefined();
    expect(rebase).toBeDefined();
    // accept-base = the user's real files; rebase = Claude's changes merged onto them.
    expect((await shadow.filesAt(acceptBase?.id ?? '')).get(MAIN)).toBe(real.replace(USER_EDIT_OLD, USER_EDIT_NEW));
    const rebased = (await shadow.filesAt(rebase?.id ?? '')).get(MAIN) ?? '';
    expect(rebased).toContain(USER_EDIT_NEW);
    expect(rebased).toContain('theorem cynder_not_good.holds');
    const recheck = h.engine.calls.slice(before);
    expect(recheck.map((c) => c.method)).toEqual(['normalise', 'freeze', 'gate']);
    for (const c of recheck) expect(c).toMatchObject({ baseCommit: acceptBase?.id, roundStartCommit: rebase?.id });
    expect(recheck[1]).toMatchObject({ frozen: false });
    expect(recheck[2]).toMatchObject({ status: 'proved', frozen: true, stage: 'prove' });
    expect(h.proposals.plans).toHaveLength(2);
    expect(h.proposals.plans[1]?.shownState?.get(MAIN)).toBe(rebased);
    expect(h.proposals.applied[0]?.changes[0]?.after).toBe(rebased);
    expect(h.log.filter((l) => l.startsWith('proposals.')).slice(-4)).toEqual(['proposals.baseDrift', 'proposals.planAccept', 'proposals.planAccept(shownState)', 'proposals.apply']);
    expect(h.manager.current()?.state).toBe('accepted');
  });

  it('a failed re-gate after drift is refused with the described findings, and ws/ is restored to the shown state', async () => {
    const { harness, runId } = await provedRun();
    h = harness;
    const shadow = h.shadow();
    const shownFiles = await shadow.currentFiles();
    h.workspace.texts.set(MAIN, (h.workspace.texts.get(MAIN) ?? '').replace(USER_EDIT_OLD, USER_EDIT_NEW));
    h.proposals.drift = [MAIN];
    h.engine.onGate = (ctx) => (ctx.baseCommit !== undefined ? { findings: [finding('existing-changed', 'Spyro.new_spyro_pg changed')] } : undefined);
    const outcome = await h.manager.accept(runId, 'p1', ['l1'], []);
    expect(outcome).toMatchObject({ ok: false, code: 'conflict' });
    expect(outcome.ok ? '' : outcome.error).toContain('described existing-changed');
    expect(await shadow.currentFiles()).toEqual(shownFiles);
    expect(h.proposals.applied).toHaveLength(0);
    expect(h.manager.current()).toMatchObject({ state: 'review', proposalId: 'p1' });
    expect(h.manager.proposal()?.proposalId).toBe('p1');
    expect(h.sidecars.resolutions).toEqual([]);
  });

  it('a refused apply leaves the proposal open', async () => {
    const { harness, runId } = await provedRun();
    h = harness;
    h.proposals.applyOutcome = { ok: false, code: 'conflict', error: 'Model/Spyro/Main.lean changed since the edit was planned; nothing was written.' };
    expect(await h.manager.accept(runId, 'p1', [], [])).toMatchObject({ ok: false, code: 'conflict' });
    expect(h.manager.current()?.state).toBe('review');
  });

  it('Discard ends the round; the raw diff covers base -> shown state', async () => {
    const { harness, runId } = await provedRun();
    h = harness;
    const diff = await h.manager.proposalDiff(runId, 'p1');
    expect(diff.map((c) => c.path)).toEqual([MAIN]);
    expect(await h.manager.proposalDiff(runId, 'p0')).toEqual([]);
    expect(await h.manager.discard(runId)).toMatchObject({ ok: true });
    expect(h.manager.current()?.state).toBe('discarded');
    expect(h.sidecars.resolutions).toEqual([expect.objectContaining({ resolution: 'discarded' })]);
    expect(await h.manager.accept(runId, 'p1', [], [])).toMatchObject({ ok: false, code: 'conflict' });
  });
});
