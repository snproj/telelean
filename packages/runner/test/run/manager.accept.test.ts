/**
 * AT3.10 (docs/m2-plan.md section 7.1): Accept's orchestration with fakes. No drift -> plan + apply. A missing
 * definition approval -> invalid. Spec v4 ES-7 (slice 1f): drift -> Accept is refused with the changed files (up to 5,
 * then "…"); nothing is settled (no plan, no `accept-base` or `rebase` commit, no re-check, no apply), the run stays in
 * review, and once the files match the run's base again the same Accept goes through. (Before 1f, drift led to D-21's
 * rebase and re-gate; that path is kept, unreachable, until slice 2.)
 *
 * Slice 2d: every start is an edit session, which ends with Apply (one history entry, the final check and the backstop,
 * drift refusing it) or Exit, not with Accept or Discard of a proposal: these tests moved to 2f, which rewrote them for
 * Apply (docs/slice2-plan.md 0); "a failed re-gate cannot happen after drift" is gone with D-21's re-gate (the drift
 * test below shows no Lean job runs). Slice 2e: the session's raw Lean diff, with Discard ending it.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { REVIEW_TEXTS } from '@telelean/core';

import { driftRefusal } from '../../src/run/manager.js';
import { END_TEXTS } from '../../src/run/sessionEnd.js';
import { createProposalService } from '../../src/proposal/index.js';
import { makeHarness, rawRun, round1, step, waitForStage, type Harness } from './helpers/harness.js';
import { confirmedStage } from './helpers/premises.js';
import { decision, PG, PG_BLOCK_END, PG_FORMALISED, settled } from './helpers/review.js';

const MAIN = 'Model/Spyro/Main.lean';
const TARGET_LINE = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';
const PROOF = 'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n';
const USER_EDIT_OLD = 'rationale: known from gaming news';
const USER_EDIT_NEW = 'rationale: announced by the publisher';

let h: Harness | undefined;
const toDispose: Array<() => void> = [];
afterEach(() => {
  h?.dispose();
  h = undefined;
  for (const d of toDispose.splice(0)) d();
});

describe('Accept (AT3.10), in slice 2f an edit session\'s Apply', () => {
  const DRIFT = REVIEW_TEXTS.drift([MAIN]);

  it('without drift: plans exactly F (planApply), applies it, resolves the attempt as accepted and ends the run', async () => {
    const { h: harness, runId, checkId } = await confirmedStage(toDispose);
    h = harness;
    const outcome = await h.manager.end(runId, 'apply', 1, checkId);
    expect(outcome).toMatchObject({ ok: true, undoable: true });
    expect(h.proposals.applyRequests).toHaveLength(1);
    expect(h.proposals.applyRequests[0]?.finalState).toEqual(await h.shadow().filesAt(rawRun(h).session?.head ?? ''));
    expect(h.proposals.applied).toHaveLength(1);
    expect(h.log.filter((l) => l.startsWith('proposals.'))).toEqual(['proposals.baseDrift', 'proposals.baseDrift', 'proposals.planApply', 'proposals.apply']);
    // No Lean at Apply: the final check ran once, before (EN-2); the backstop again is pure.
    expect(h.engine.methods().filter((m) => m === 'finalCheck')).toHaveLength(1);
    expect(h.engine.methods().at(-1)).toBe('finalCheck');
    const v = h.manager.current();
    expect(v).toMatchObject({ state: 'accepted' });
    expect(h.sidecars.resolutions).toEqual([expect.objectContaining({ round: 1, resolution: 'accepted' })]);
    expect(h.backend?.closes.length).toBeGreaterThan(0);
    expect(v?.notices.at(-1)?.text).toBe(REVIEW_TEXTS.applied);
    expect(v?.accepted).toEqual({ changedFiles: true });
  });

  it('an Apply that changes no file is worded as recorded, with no Undo hint', async () => {
    const { h: harness, runId, checkId } = await confirmedStage(toDispose);
    h = harness;
    h.proposals.applyOutcome = { ok: true, label: 'FAKE label', undoable: false };
    const outcome = await h.manager.end(runId, 'apply', 1, checkId);
    expect(outcome).toEqual({ ok: true, label: END_TEXTS.recorded, undoable: false });
    const v = h.manager.current();
    expect(v).toMatchObject({ state: 'accepted' });
    expect(v?.notices.at(-1)?.text).toBe(END_TEXTS.recorded);
    expect(v?.notices.some((n) => n.text.includes('Undo'))).toBe(false);
    expect(v?.accepted).toEqual({ changedFiles: false });
  });

  it('refuses a stale check id; a definition is no question any more but an item, and Submit review waits until it is decided', async () => {
    const DEF = '/-- A strict game -/\ndef strict_game (g : Game) : Prop := IsPG g\n\n';
    const script = [round1(step.edit(PG_BLOCK_END, PG_FORMALISED + DEF), step.freeze(), step.edit(TARGET_LINE, TARGET_LINE + PROOF), step.finish(), step.result())];
    const { h: harness, runId, checkId } = await confirmedStage(toDispose, { script }, async (x, id) => {
      for (const key of [PG, 'proof:cynder-not-good']) {
        expect(await x.manager.decide(id, 1, true, [decision(x, key, 'accepted')], false)).toMatchObject({ ok: true });
        await settled(x);
      }
      // The definition is still in review: Submit is refused, so no confirmation opens without it.
      expect(await x.manager.submit(id, 1)).toEqual({ ok: false, code: 'refused', error: REVIEW_TEXTS.submitInReview(1) });
      expect(await x.manager.decide(id, 1, true, [decision(x, 'decl:Spyro.strict_game', 'accepted')], false)).toMatchObject({ ok: true });
      await settled(x);
    });
    h = harness;
    expect(await h.manager.end(runId, 'apply', 1, 'ck9999999999999999')).toEqual({ ok: false, code: 'conflict', error: REVIEW_TEXTS.historyChanged });
    expect(h.proposals.applyRequests).toHaveLength(0);
    expect(await h.manager.end(runId, 'apply', 1, checkId)).toMatchObject({ ok: true });
  });

  it('with drift (ES-7): refused with the changed files; no plan, no `accept-base` or `rebase` commit, no Lean job, no apply; the session stays in the confirmation', async () => {
    const { h: harness, runId, checkId } = await confirmedStage(toDispose);
    h = harness;
    const shadow = h.shadow();
    const shownFiles = await shadow.currentFiles();
    const commitsBefore = (await shadow.commits()).map((c) => c.kind);
    // The user edited a rationale in their real files during the run (by hand: the board refuses edits meanwhile).
    const real = h.workspace.texts.get(MAIN) ?? '';
    h.workspace.texts.set(MAIN, real.replace(USER_EDIT_OLD, USER_EDIT_NEW));
    h.proposals.drift = [MAIN];
    h.proposals.onPlanApply = () => {
      throw new Error('planApply must not be reached while the files differ from the base');
    };
    const engineCalls = h.engine.calls.length;
    expect(await h.manager.end(runId, 'apply', 1, checkId)).toEqual({ ok: false, code: 'conflict', error: DRIFT });
    // Nothing is settled: the working copy, its commits, the checks and the user's files are as they were.
    expect((await shadow.commits()).map((c) => c.kind)).toEqual(commitsBefore);
    expect((await shadow.commits()).some((c) => c.kind === 'accept-base' || c.kind === 'rebase')).toBe(false);
    expect(await shadow.currentFiles()).toEqual(shownFiles);
    expect(h.engine.calls.length).toBe(engineCalls);
    expect(h.proposals.applyRequests).toHaveLength(0);
    expect(h.proposals.applied).toHaveLength(0);
    expect(h.workspace.texts.get(MAIN)).toBe(real.replace(USER_EDIT_OLD, USER_EDIT_NEW));
    expect(rawRun(h).session).toMatchObject({ phase: 'confirming', drift: { files: [MAIN] }, confirmation: { state: 'passed' } });
    expect(h.sidecars.resolutions).toEqual([]);
  });

  it('ES-7 with the real drift check: a hand edit refuses Apply; the base did not move; once the edit is undone, the same Apply goes through', async () => {
    const { h: harness, runId, checkId } = await confirmedStage(toDispose);
    h = harness;
    // The proposal service's own baseDrift (real files, open buffers first, against the run's base commit).
    const service = createProposalService();
    h.proposals.baseDrift = async (shadow, readReal, realFiles) => {
      h?.log.push('proposals.baseDrift');
      return service.baseDrift(shadow, readReal, realFiles);
    };
    const original = h.workspace.texts.get(MAIN) ?? '';
    expect((await h.shadow().baseFiles()).get(MAIN)).toBe(original); // the base is the user's files at the start
    h.workspace.texts.set(MAIN, original.replace(USER_EDIT_OLD, USER_EDIT_NEW));
    expect(await h.manager.end(runId, 'apply', 1, checkId)).toEqual({ ok: false, code: 'conflict', error: DRIFT });
    expect(h.proposals.applyRequests).toHaveLength(0);
    expect((await h.shadow().baseFiles()).get(MAIN)).toBe(original);
    h.workspace.texts.set(MAIN, original);
    expect(await h.manager.end(runId, 'apply', 1, checkId)).toMatchObject({ ok: true });
    expect(h.proposals.applied).toHaveLength(1);
    expect(h.manager.current()?.state).toBe('accepted');
    expect(h.sidecars.resolutions).toEqual([expect.objectContaining({ round: 1, resolution: 'accepted' })]);
  });

  it('a hand edit landing between the drift check and planApply\'s own read is refused, never merged; once it is undone, the same Apply goes through', async () => {
    const { h: harness, runId, checkId } = await confirmedStage(toDispose);
    h = harness;
    const service = createProposalService();
    const original = h.workspace.texts.get(MAIN) ?? '';
    const edited = original.replace(USER_EDIT_OLD, USER_EDIT_NEW);
    h.proposals.baseDrift = async (shadow, readReal, realFiles) => {
      const drift = await service.baseDrift(shadow, readReal, realFiles);
      h?.workspace.texts.set(MAIN, edited);
      return drift;
    };
    // planApply's own drift (from the read it would apply) is authoritative: nothing applied, nothing merged.
    expect(await h.manager.end(runId, 'apply', 1, checkId)).toEqual({ ok: false, code: 'conflict', error: DRIFT });
    expect(h.proposals.applyRequests).toHaveLength(1);
    expect(h.proposals.applied).toEqual([]);
    expect(h.workspace.texts.get(MAIN)).toBe(edited);
    expect(rawRun(h).session?.phase).toBe('confirming');
    expect(h.sidecars.resolutions).toEqual([]);
    h.workspace.texts.set(MAIN, original);
    h.proposals.baseDrift = async (shadow, readReal, realFiles) => service.baseDrift(shadow, readReal, realFiles);
    expect(await h.manager.end(runId, 'apply', 1, checkId)).toMatchObject({ ok: true });
    expect(h.proposals.applied).toHaveLength(1);
  });

  it('the drift refusal: an edit session\'s names every file (core\'s text, ES-7); M2\'s, for a v1 run until 2h, names up to 5 files, then "…"', async () => {
    const files = ['Model/Spyro/A.lean', 'Model/Spyro/B.lean', 'Model/Spyro/C.lean', 'Model/Spyro/D.lean', 'Model/Spyro/E.lean', 'Model/Spyro/F.lean', 'lakefile.toml'];
    expect(driftRefusal(files.slice(0, 2))).toBe('Your files changed since this run started (Model/Spyro/A.lean, Model/Spyro/B.lean). Undo those edits in the editor, or discard the run.');
    expect(driftRefusal(files)).toBe(
      'Your files changed since this run started (Model/Spyro/A.lean, Model/Spyro/B.lean, Model/Spyro/C.lean, Model/Spyro/D.lean, Model/Spyro/E.lean, …). Undo those edits in the editor, or discard the run.',
    );
    const { h: harness, runId, checkId } = await confirmedStage(toDispose);
    h = harness;
    h.proposals.drift = files;
    expect(await h.manager.end(runId, 'apply', 1, checkId)).toEqual({ ok: false, code: 'conflict', error: REVIEW_TEXTS.drift(files) });
    expect(rawRun(h).session?.phase).toBe('confirming');
  });

  it('a refused apply leaves the session in the end confirmation, its check still passed, so Apply can be tried again', async () => {
    const { h: harness, runId, checkId } = await confirmedStage(toDispose);
    h = harness;
    h.proposals.applyOutcome = { ok: false, code: 'conflict', error: 'Model/Spyro/Main.lean changed since the edit was planned; nothing was written.' };
    expect(await h.manager.end(runId, 'apply', 1, checkId)).toMatchObject({ ok: false, code: 'conflict' });
    expect(rawRun(h).session).toMatchObject({ phase: 'confirming', confirmation: { state: 'passed' } });
    expect(h.manager.current()?.state).toBe('review');
    h.proposals.applyOutcome = undefined;
    expect(await h.manager.end(runId, 'apply', 1, checkId)).toMatchObject({ ok: true });
  });

  it('slice 2e: the session\'s raw diff covers base -> the head; Discard (2f\'s Exit until then) ends the session, its attempts discarded', async () => {
    const proof = 'theorem cynder_not_good.holds : cynder_not_good := fun _ => cynder_dark_past.holds.elim\n';
    h = makeHarness({ script: [round1(step.freeze(), step.edit(TARGET_LINE, TARGET_LINE + proof), step.finish(), step.result())] });
    await h.manager.formalize({ subject: 'Spyro', inferences: [{ target: 'cynder-not-good', premises: ['cynder-dark-past', 'new-spyro-pg'] }] });
    const { runId } = await waitForStage(h.manager, 1);
    expect(h.manager.session()?.results.shown).toBe(true);
    const diff = await h.manager.sessionDiff(runId, 1, false);
    expect(diff).toMatchObject({ ok: true, kind: 'diff' });
    const files = 'files' in diff ? diff.files : [];
    expect(files.map((c) => c.path)).toEqual([MAIN]);
    expect(files[0]?.after).toContain(proof);
    expect(files[0]?.before).not.toContain('cynder_not_good.holds');
    expect(files[0]?.after).toBe((await h.shadow().currentFiles()).get(MAIN));
    expect(await h.manager.sessionDiff(runId, 2, false)).toEqual({ ok: false, code: 'conflict', error: REVIEW_TEXTS.historyChanged });
    // Slice 2h: M2's raw diff, Discard and Accept are retired; Exit ends the session, and nothing applies afterwards.
    expect(await h.manager.end(runId, 'exit')).toMatchObject({ ok: true });
    expect(h.manager.current()?.state).toBe('discarded');
    expect(h.sidecars.resolutions).toEqual([expect.objectContaining({ resolution: 'discarded' })]);
    expect(await h.manager.end(runId, 'apply', 1, 'ck0000000000000000')).toMatchObject({ ok: false });
    expect(await h.manager.sessionDiff(runId, 1, false)).toMatchObject({ ok: false });
  });
});
