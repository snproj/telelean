/**
 * AT3.10 (docs/m2-plan.md section 7.1): Accept's orchestration with fakes. No drift -> plan + apply. A missing
 * definition approval -> invalid. Spec v4 ES-7 (slice 1f): drift -> Accept is refused with the changed files (up to 5,
 * then "…"); nothing is settled (no plan, no `accept-base` or `rebase` commit, no re-check, no apply), the run stays in
 * review, and once the files match the run's base again the same Accept goes through. (Before 1f, drift led to D-21's
 * rebase and re-gate; that path is kept, unreachable, until slice 2.)
 *
 * Slice 2d: every start is an edit session, which ends with Apply (one history entry, the final check and the backstop,
 * drift refusing it) or Exit, not with Accept or Discard of a proposal: these tests move to 2f (Apply, drift, Exit) and
 * 2e (the session's raw Lean diff), docs/slice2-plan.md 0.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { driftRefusal } from '../../src/run/manager.js';
import { createProposalService } from '../../src/proposal/index.js';
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
  it.skip('moves to 2f: Accept (AT3.10) without drift: plans, applies, resolves the attempt as accepted and ends the run', async () => {
    const { harness, runId } = await provedRun();
    h = harness;
    const outcome = await h.manager.accept(runId, 'p1', []);
    expect(outcome).toMatchObject({ ok: true });
    expect(h.proposals.plans).toHaveLength(1);
    expect(h.proposals.plans[0]).not.toHaveProperty('lifecycle');
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

  it.skip('moves to 2f: Accept (AT3.10) an Accept that changes no file is worded as recorded, with no Undo hint (fixer round 1)', async () => {
    const { harness, runId } = await provedRun();
    h = harness;
    h.proposals.applyOutcome = { ok: true, label: 'FAKE label', undoable: false };
    const outcome = await h.manager.accept(runId, 'p1', []);
    expect(outcome).toEqual({ ok: true, label: 'Recorded: FAKE label (no file changed)', undoable: false });
    const v = h.manager.current();
    expect(v).toMatchObject({ state: 'accepted' });
    expect(v?.notices.at(-1)?.text).toBe('Recorded: FAKE label (no file changed).');
    expect(v?.notices.some((n) => n.text.includes('Undo'))).toBe(false);
    expect(v?.accepted).toEqual({ changedFiles: false });
  });

  it.skip('moves to 2f: Accept (AT3.10) refuses a stale proposal id and missing definition approvals', async () => {
    h = makeHarness({ script: [round1(step.freeze(), step.edit(TARGET_LINE, TARGET_LINE + PROOF), step.finish(), step.result())] });
    h.proposals.definitions = [{ id: 'd1', name: 'Spyro.InGame', kind: 'definition', code: 'def InGame (c : Character) (g : Game) : Prop := GoodAddition c g', usedByStatementsOf: ['pg-no-dark-past'] }];
    await h.manager.start(START);
    const review = await waitForRun(h.manager, state('review'));
    expect(await h.manager.accept(review.runId, 'p9', ['d1'])).toMatchObject({ ok: false, code: 'not-found' });
    const missing = await h.manager.accept(review.runId, 'p1', []);
    expect(missing).toEqual({ ok: false, code: 'invalid', error: 'Answer every definition question: a “no” is feedback.' });
    expect(h.proposals.plans).toHaveLength(0);
    expect(await h.manager.accept(review.runId, 'p1', ['d1'])).toMatchObject({ ok: true });
  });

  it.skip('moves to 2f: Accept (AT3.10) with drift (ES-7, slice 1f): refused with the changed files; no plan, no accept-base or rebase commit, no re-check, no apply', async () => {
    const { harness, runId } = await provedRun();
    h = harness;
    const shadow = h.shadow();
    const shownFiles = await shadow.currentFiles();
    const commitsBefore = (await shadow.commits()).map((c) => c.kind);
    // The user edited a rationale in their real files during the run (by hand: the board refuses edits meanwhile).
    const real = h.workspace.texts.get(MAIN) ?? '';
    h.workspace.texts.set(MAIN, real.replace(USER_EDIT_OLD, USER_EDIT_NEW));
    h.proposals.drift = [MAIN];
    h.proposals.onPlan = () => {
      throw new Error('planAccept must not be reached while the files differ from the base');
    };
    const engineCalls = h.engine.calls.length;
    const outcome = await h.manager.accept(runId, 'p1', []);
    expect(outcome).toEqual({ ok: false, code: 'conflict', error: 'Your files changed since this run started (Model/Spyro/Main.lean). Undo those edits in the editor, or discard the run.' });
    // Nothing is settled: the working copy, its commits, the checks and the user's files are as they were.
    expect((await shadow.commits()).map((c) => c.kind)).toEqual(commitsBefore);
    expect((await shadow.commits()).some((c) => c.kind === 'accept-base' || c.kind === 'rebase')).toBe(false);
    expect(await shadow.currentFiles()).toEqual(shownFiles);
    expect(h.engine.calls.length).toBe(engineCalls);
    expect(h.proposals.plans).toHaveLength(0);
    expect(h.proposals.applied).toHaveLength(0);
    expect(h.workspace.texts.get(MAIN)).toBe(real.replace(USER_EDIT_OLD, USER_EDIT_NEW));
    expect(h.log.filter((l) => l.startsWith('proposals.')).slice(-1)).toEqual(['proposals.baseDrift']);
    // The run stays in review with the same proposal.
    expect(h.manager.current()).toMatchObject({ state: 'review', proposalId: 'p1' });
    expect(h.manager.proposal()?.proposalId).toBe('p1');
    expect(h.sidecars.resolutions).toEqual([]);
  });

  it.skip('moves to 2f: Accept (AT3.10) a failed re-gate cannot happen after drift any more: the refusal comes first, ws/ is untouched (ES-7, slice 1f)', async () => {
    const { harness, runId } = await provedRun();
    h = harness;
    const shadow = h.shadow();
    const shownFiles = await shadow.currentFiles();
    h.workspace.texts.set(MAIN, (h.workspace.texts.get(MAIN) ?? '').replace(USER_EDIT_OLD, USER_EDIT_NEW));
    h.proposals.drift = [MAIN];
    let regated = false;
    h.engine.onGate = (ctx) => {
      if (ctx.baseCommit !== undefined) regated = true;
      return ctx.baseCommit !== undefined ? { findings: [finding('existing-changed', 'Spyro.new_spyro_pg changed')] } : undefined;
    };
    const outcome = await h.manager.accept(runId, 'p1', []);
    expect(outcome).toMatchObject({ ok: false, code: 'conflict' });
    expect(outcome.ok ? '' : outcome.error).toBe(driftRefusal([MAIN]));
    expect(regated).toBe(false);
    expect(await shadow.currentFiles()).toEqual(shownFiles);
    expect(h.proposals.applied).toHaveLength(0);
    expect(h.manager.current()).toMatchObject({ state: 'review', proposalId: 'p1' });
    expect(h.manager.proposal()?.proposalId).toBe('p1');
    expect(h.sidecars.resolutions).toEqual([]);
  });

  it.skip('moves to 2f: Accept (AT3.10) ES-7 with the real drift check: a hand edit refuses Accept; once it is undone, the same Accept goes through', async () => {
    const { harness, runId } = await provedRun();
    h = harness;
    // The proposal service's own baseDrift (real files, open buffers first, against the run's base commit).
    const service = createProposalService();
    h.proposals.baseDrift = async (shadow, readReal, realFiles) => {
      h?.log.push('proposals.baseDrift');
      return service.baseDrift(shadow, readReal, realFiles);
    };
    const base = await h.shadow().baseFiles();
    const original = h.workspace.texts.get(MAIN) ?? '';
    expect(base.get(MAIN)).toBe(original); // the base is the user's files at the start
    h.workspace.texts.set(MAIN, original.replace(USER_EDIT_OLD, USER_EDIT_NEW));
    const refusedOutcome = await h.manager.accept(runId, 'p1', []);
    expect(refusedOutcome).toEqual({ ok: false, code: 'conflict', error: driftRefusal([MAIN]) });
    expect(h.manager.current()).toMatchObject({ state: 'review', proposalId: 'p1' });
    expect(h.proposals.plans).toHaveLength(0);
    // The base did not move: it still holds the text from the start, not the hand edit.
    expect((await h.shadow().baseFiles()).get(MAIN)).toBe(original);
    // The user undoes the edit in the editor: Accept settles the run.
    h.workspace.texts.set(MAIN, original);
    const accepted = await h.manager.accept(runId, 'p1', []);
    expect(accepted).toMatchObject({ ok: true });
    expect(h.proposals.plans).toHaveLength(1);
    expect(h.proposals.plans[0]?.shownState).toBeUndefined();
    expect(h.proposals.applied).toHaveLength(1);
    expect(h.manager.current()?.state).toBe('accepted');
    expect(h.sidecars.resolutions).toEqual([expect.objectContaining({ round: 1, resolution: 'accepted' })]);
  });

  it.skip('moves to 2f: Accept (AT3.10) slice 1e (1f carry-over): a hand edit landing between the drift check and the plan\'s own read is refused, never merged', async () => {
    const { harness, runId } = await provedRun();
    h = harness;
    // The real proposal service for both reads; the user's edit lands right after baseDrift read the files.
    const service = createProposalService();
    const original = h.workspace.texts.get(MAIN) ?? '';
    const edited = original.replace(USER_EDIT_OLD, USER_EDIT_NEW);
    expect(edited).not.toBe(original);
    h.proposals.baseDrift = async (shadow, readReal, realFiles) => {
      const drift = await service.baseDrift(shadow, readReal, realFiles);
      h?.workspace.texts.set(MAIN, edited);
      return drift;
    };
    h.proposals.planAccept = async (request) => {
      h?.proposals.plans.push(request);
      return service.planAccept(request);
    };
    const outcome = await h.manager.accept(runId, 'p1', []);
    // The plan's own drift (from the read it would apply) is authoritative: nothing is applied, nothing merged.
    expect(outcome).toEqual({ ok: false, code: 'conflict', error: driftRefusal([MAIN]) });
    expect(h.proposals.plans).toHaveLength(1);
    expect(h.proposals.applied).toEqual([]);
    expect(h.workspace.texts.get(MAIN)).toBe(edited);
    expect(h.manager.current()).toMatchObject({ state: 'review', proposalId: 'p1' });
    expect(h.sidecars.resolutions).toEqual([]);
    // Once the edit is undone, the same Accept goes through.
    h.workspace.texts.set(MAIN, original);
    h.proposals.baseDrift = async (shadow, readReal, realFiles) => service.baseDrift(shadow, readReal, realFiles);
    expect(await h.manager.accept(runId, 'p1', [])).toMatchObject({ ok: true });
    expect(h.proposals.applied).toHaveLength(1);
  });

  it.skip('moves to 2f: Accept (AT3.10) the drift refusal names up to 5 files, then "…"', async () => {
    const files = ['Model/Spyro/A.lean', 'Model/Spyro/B.lean', 'Model/Spyro/C.lean', 'Model/Spyro/D.lean', 'Model/Spyro/E.lean', 'Model/Spyro/F.lean', 'lakefile.toml'];
    expect(driftRefusal(files.slice(0, 2))).toBe('Your files changed since this run started (Model/Spyro/A.lean, Model/Spyro/B.lean). Undo those edits in the editor, or discard the run.');
    expect(driftRefusal(files.slice(0, 5))).toBe(
      'Your files changed since this run started (Model/Spyro/A.lean, Model/Spyro/B.lean, Model/Spyro/C.lean, Model/Spyro/D.lean, Model/Spyro/E.lean). Undo those edits in the editor, or discard the run.',
    );
    const { harness, runId } = await provedRun();
    h = harness;
    h.proposals.drift = files;
    const outcome = await h.manager.accept(runId, 'p1', []);
    expect(outcome).toEqual({
      ok: false,
      code: 'conflict',
      error: 'Your files changed since this run started (Model/Spyro/A.lean, Model/Spyro/B.lean, Model/Spyro/C.lean, Model/Spyro/D.lean, Model/Spyro/E.lean, …). Undo those edits in the editor, or discard the run.',
    });
    expect(h.manager.current()?.state).toBe('review');
  });

  it.skip('moves to 2f: Accept (AT3.10) a refused apply leaves the proposal open', async () => {
    const { harness, runId } = await provedRun();
    h = harness;
    h.proposals.applyOutcome = { ok: false, code: 'conflict', error: 'Model/Spyro/Main.lean changed since the edit was planned; nothing was written.' };
    expect(await h.manager.accept(runId, 'p1', [])).toMatchObject({ ok: false, code: 'conflict' });
    expect(h.manager.current()?.state).toBe('review');
  });

  it.skip('moves to 2e/2f: Accept (AT3.10) Discard ends the round; the raw diff covers base -> shown state', async () => {
    const { harness, runId } = await provedRun();
    h = harness;
    const diff = await h.manager.proposalDiff(runId, 'p1');
    expect(diff.map((c) => c.path)).toEqual([MAIN]);
    expect(await h.manager.proposalDiff(runId, 'p0')).toEqual([]);
    expect(await h.manager.discard(runId)).toMatchObject({ ok: true });
    expect(h.manager.current()?.state).toBe('discarded');
    expect(h.sidecars.resolutions).toEqual([expect.objectContaining({ resolution: 'discarded' })]);
    expect(await h.manager.accept(runId, 'p1', [])).toMatchObject({ ok: false, code: 'conflict' });
  });
});
