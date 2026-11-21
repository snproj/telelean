/**
 * Slice 2e (docs/slice2-plan.md 3.6, 4.6, 4.7, 6.1's 2e list): an edit session's review actions, with the FakeBackend and
 * the fake engine (its stage judge is core `judgeState` on fake facts):
 *   - Reject: one decision commit that takes out exactly the item and its dependents, transitively; the judge runs; the
 *     action records its commit, the item its `decline.commit`; un-reject brings it all back (the dependents to be redone
 *     without revert, D2-60), and is refused after a newer version and for a merge that conflicts;
 *   - Shaky: nothing leaves ws/, its dependents are to be redone with their content kept, and they keep the results
 *     hidden (AF4); a Shaky Result's dependents still pass, and a Reject of their source takes them out too;
 *   - `needs-confirmation` for accepted dependents, and always while the results are hidden when an Accept is taken away
 *     (D2-64); a hidden accepted Result that rests on the item loses its Accept, which shows with the results;
 *   - DO-0: the Results using the arrow are taken out to be redone, and the arrow is refused if proposed again;
 *   - Show results, the raw diff and "Show Claude's activity" (RV-6, §4.7), and their Undo;
 *   - Undo and Redo through the rules (AF13), Redo refused after a judge changed what it rests on;
 *   - decisions and the judge (F8, AF1, D2-27): an Accept while a judge runs keeps both changes, a Reject while a judge
 *     runs drops its judge-apply, the judge coalesces, and a decision survives the judge;
 *   - a revert whose state does not pass: the judge converges and the stage is headed "did not pass" (§3.6, ES-4);
 *   - the refusals: a stale stage, outside a stage, no stage judgement (fail closed).
 */
import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

import { REVIEW_TEXTS, type ActionOutcome, type StateJudgement } from '@telelean/core';

import { fakeStageJudge } from './helpers/fakeEngine.js';
import { makeHarness, rawRun, round1, START, step, waitForRun, waitForStage, type Harness } from './helpers/harness.js';
import {
  consistent,
  decision,
  GOAL_LINE,
  GOAL_PROOF,
  main,
  PG,
  PG_FORMALISED,
  pgScript,
  record,
  RESULT,
  session,
  settled,
  T,
  viewItem,
} from './helpers/review.js';
import { CHAIN, chainModel, LINK_ONE_STATEMENT, proveGoal, proveLinkOne, proveLinkTwo, stepMatch } from './helpers/sessions.js';

const toDispose: Array<() => void> = [];
afterEach(() => {
  for (const d of toDispose.splice(0)) d();
});

function harness(script: Parameters<typeof makeHarness>[0] = {}): Harness {
  const h = makeHarness(script);
  toDispose.push(() => h.dispose());
  return h;
}

/** Stage 1 of the Spyro question: Formalize(pg-no-dark-past) in review, and T's Result (hidden) resting on it. */
async function pgStage(outcome: 'proved' | 'not-proved' = 'proved', extra: Parameters<typeof makeHarness>[0] = {}): Promise<{ h: Harness; runId: string }> {
  const h = harness({ script: [pgScript(outcome)], ...extra });
  expect(await h.manager.start(START)).toMatchObject({ ok: true });
  const v = await waitForStage(h.manager, 1);
  await settled(h);
  return { h, runId: v.runId };
}

/** The three-target chain, all proved: Formalize(link-one), Formalize(link-two), three Results (hidden). */
async function chainStage(): Promise<{ h: Harness; runId: string }> {
  const h = harness({ source: chainModel(), withFacts: false, script: [proveLinkOne(), proveLinkTwo(), proveGoal()] });
  expect(await h.manager.formalize({ subject: 'Spyro', inferences: CHAIN })).toMatchObject({ ok: true });
  const v = await waitForStage(h.manager, 1);
  await settled(h);
  return { h, runId: v.runId };
}

const ok = (o: ActionOutcome) => expect(o).toMatchObject({ ok: true });

describe('Reject and un-reject (§3.6, D2-28, D2-60, DO-1)', () => {
  it('Reject makes one decision commit that takes out exactly the item and its dependents, transitively; the judge runs; un-reject brings all of it back', async () => {
    const { h, runId } = await chainStage();
    const before = await main(h);
    const judges = h.engine.methods().filter((m) => m === 'judge').length;
    const commits = (await h.shadow().commits()).length;
    ok(await h.manager.decide(runId, 1, true, [decision(h, 'card:link-one', 'declined', { option: 'reject' })], false));
    await settled(h);
    // One decision commit (the judge made none: nothing else failed).
    const all = await h.shadow().commits();
    expect(all.slice(commits).map((c) => c.kind)).toEqual(['decision']);
    const decisionCommit = all[commits];
    // It took out link-one's statement and every proof resting on it (link-one's, link-two's through it, the goal's
    // through link-two's), and nothing else: link-two's statement stays.
    const after = await main(h);
    expect(after).not.toContain('abbrev link_one');
    expect(after).not.toContain('link_one.holds');
    expect(after).not.toContain('link_two.holds');
    expect(after).not.toContain('cynder_not_good.holds');
    expect(after).toContain('abbrev link_two');
    expect(before.replace(LINK_ONE_STATEMENT, '').replace(/theorem [a-z_]+\.holds : [^\n]*\n/g, '')).toBe(after);
    // The records: the Reject, its commit, the dependents to be redone with their content taken out.
    const r = record(h, 'card:link-one');
    expect(r).toMatchObject({ status: 'declined', decline: { option: 'reject', commit: decisionCommit?.id } });
    expect(r.rejectedFingerprints).toContain(r.fingerprint);
    for (const key of ['proof:link-one', 'proof:link-two', 'proof:cynder-not-good']) {
      expect(record(h, key)).toMatchObject({ status: 'to-be-redone', redo: { reverted: true } });
    }
    expect(record(h, 'card:link-two').status).toBe('in-review');
    const action = session(h).stack.done.at(-1);
    expect(action).toMatchObject({ kind: 'decide', commits: [decisionCommit?.id] });
    // The judge ran on the new head.
    expect(h.engine.methods().filter((m) => m === 'judge').length).toBe(judges + 1);
    expect(session(h).judged?.commit).toBe(decisionCommit?.id);
    await consistent(h);
    // Un-reject: the inverse merge brings back what the commit took out; the dependents come back to be redone, their
    // content in ws/ (D2-60).
    ok(await h.manager.decide(runId, 1, true, [decision(h, 'card:link-one', 'in-review')], false));
    await settled(h);
    expect(await main(h)).toBe(before);
    expect(record(h, 'card:link-one')).toMatchObject({ status: 'in-review', rejectedFingerprints: [] });
    expect(record(h, 'card:link-one').decline).toBeUndefined();
    for (const key of ['proof:link-one', 'proof:link-two', 'proof:cynder-not-good']) {
      expect(record(h, key)).toMatchObject({ status: 'to-be-redone', redo: { reverted: false } });
    }
    await consistent(h);
  });

  it('un-reject is refused when the commit\'s inverse no longer merges (fail closed: nothing changes)', async () => {
    const { h, runId } = await pgStage();
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'declined', { option: 'reject' })], false));
    await settled(h);
    // White box: a write of the session's queue changes the lines next to what the Reject took out (a later step could).
    type Internals = { run: unknown; enqueueWrite<T>(run: unknown, job: () => Promise<T>): Promise<T>; sessionOf(run: unknown): { head: string }; persistChecked(run: unknown): Promise<void> };
    const m = h.manager as unknown as Internals;
    const shadow = h.shadow();
    await m.enqueueWrite(m.run, async () => {
      const files = await shadow.currentFiles();
      const text = files.get('Model/Spyro/Main.lean') ?? '';
      await shadow.writeFiles([{ path: 'Model/Spyro/Main.lean', before: text, after: text.replace('stance: rule\nasserted: 2026-11-01\n-/\n', 'stance: rule\nasserted: 2026-11-02\n-/\n') }]);
      const c = await shadow.commit('decision', 'a later write (test)', 1);
      m.sessionOf(m.run).head = c.id;
      await m.persistChecked(m.run);
    });
    const before = rawRun(h).session;
    const files = await shadow.currentFiles();
    expect(await h.manager.decide(runId, 1, true, [decision(h, PG, 'in-review')], false)).toEqual({ ok: false, code: 'refused', error: REVIEW_TEXTS.unrejectConflict('Model/Spyro/Main.lean') });
    expect(rawRun(h).session).toEqual(before);
    expect(await shadow.currentFiles()).toEqual(files);
  });

  it('a stale rev gives `conflict`, and nothing changes', async () => {
    const { h, runId } = await pgStage();
    const r = record(h, PG);
    const before = rawRun(h).session;
    expect(await h.manager.decide(runId, 1, true, [{ item: r.id, rev: r.rev + 1, to: 'accepted' }], false)).toMatchObject({ ok: false, code: 'conflict' });
    expect(rawRun(h).session).toEqual(before);
  });
});

describe('Shaky (D2-48, AF4) and the cascades', () => {
  it('Shaky takes nothing out: its dependents are to be redone with their content kept, which keeps the results hidden; Submit names them; declined Shaky too, the results show', async () => {
    const { h, runId } = await chainStage();
    const before = await main(h);
    const commits = (await h.shadow().commits()).length;
    // Accept link-two's statement (its own Accept: a belief? no: a proposition's statement), leaving link-one in review.
    ok(await h.manager.decide(runId, 1, true, [decision(h, 'card:link-two', 'accepted')], false));
    ok(await h.manager.decide(runId, 1, true, [decision(h, 'card:link-one', 'declined', { option: 'shaky', note: 'too strong' })], false));
    await settled(h);
    expect(await main(h)).toBe(before);
    expect((await h.shadow().commits()).length).toBe(commits); // records only
    expect(record(h, 'card:link-one')).toMatchObject({ status: 'declined', decline: { option: 'shaky', note: 'too strong' } });
    for (const key of ['proof:link-one', 'proof:link-two', 'proof:cynder-not-good']) {
      expect(record(h, key)).toMatchObject({ status: 'to-be-redone', redo: { reverted: false } });
    }
    // Every meaning item is decided: the results show.
    const view = h.manager.session();
    expect(view?.results.shown).toBe(true);
    expect(view?.submit.gate).toEqual({ ok: true });
  });

  it('AF4: a Shaky decline of a definition makes its dependents P1 and P2 to be redone with their content kept: the results stay hidden, Submit\'s gate names them; once both are declined as Shaky the results show and Submit can run', async () => {
    // D: a definition written before the freeze; P1 and P2: two statements (Formalize items) that use it.
    const D = 'def bad_past (c : Character) : Prop := HasDarkPast c\n';
    const P1 = '/-- Cynder has a past that PG games exclude -/\nabbrev link_one : Prop := bad_past cynder\n';
    const P2 = '/-- The new Spyro game excludes Cynder -/\nabbrev link_two : Prop := bad_past cynder ∧ IsPG newSpyro\n';
    const h = harness({
      source: chainModel(),
      withFacts: false,
      script: [
        {
          match: stepMatch(1, 2, 'link-one'),
          steps: [
            step.edit('namespace Spyro\n', `namespace Spyro\n\n${D}`),
            step.edit('natural_name: Cynder has a past that PG games exclude\npremises: cynder-dark-past\nasserted: 2026-11-01\n-/\n', `natural_name: Cynder has a past that PG games exclude\npremises: cynder-dark-past\nasserted: 2026-11-01\n-/\n${P1}`),
            step.freeze('link-one'),
            step.finish('not_proved', 'not proved'),
            step.result(),
          ],
        },
        {
          // A12: link-one, an earlier target of the queue, has no `.holds`: link-two's step formalises only.
          match: 'Step 2 of 2: formalize the statements of “link-two”',
          steps: [
            step.edit('natural_name: The new Spyro game excludes Cynder\npremises: link-one, new-spyro-pg\nasserted: 2026-11-01\n-/\n', `natural_name: The new Spyro game excludes Cynder\npremises: link-one, new-spyro-pg\nasserted: 2026-11-01\n-/\n${P2}`),
            step.freeze('link-two'),
            step.finish('not_proved', 'not proved'),
            step.result(),
          ],
        },
      ],
    });
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: CHAIN.slice(0, 2) })).toMatchObject({ ok: true });
    const v = await waitForStage(h.manager, 1);
    await settled(h);
    const keys = session(h).items.map((r) => r.key);
    expect(keys).toEqual(expect.arrayContaining(['decl:Spyro.bad_past', 'card:link-one', 'card:link-two']));
    ok(await h.manager.decide(v.runId, 1, true, [decision(h, 'decl:Spyro.bad_past', 'declined', { option: 'shaky' })], false));
    await settled(h);
    const p1 = record(h, 'card:link-one');
    const p2 = record(h, 'card:link-two');
    expect(p1).toMatchObject({ status: 'to-be-redone', redo: { reverted: false } });
    expect(p2).toMatchObject({ status: 'to-be-redone', redo: { reverted: false } });
    let view = h.manager.session();
    expect(view?.results.shown).toBe(false);
    expect(view?.submit.gate).toEqual({ ok: false, reason: REVIEW_TEXTS.submitResultsHidden, missing: [p1.id, p2.id] });
    expect(await h.manager.submit(v.runId, 1)).toEqual({ ok: false, code: 'refused', error: REVIEW_TEXTS.submitResultsHidden });
    ok(await h.manager.decide(v.runId, 1, false, [decision(h, 'card:link-one', 'declined', { option: 'shaky' }), decision(h, 'card:link-two', 'declined', { option: 'shaky' })], false));
    await settled(h);
    view = h.manager.session();
    expect(view?.results.shown).toBe(true);
    expect(view?.submit.gate).toEqual({ ok: true });
  });

  it('a Shaky Result\'s dependents stay in ws/ and still pass; a Reject of their source takes them out too', async () => {
    const { h, runId } = await chainStage();
    // Show the results, decide the statements, then decline link-one's Result as Shaky.
    ok(await h.manager.reveal(runId, 1, 'show-result'));
    ok(await h.manager.decide(runId, 1, true, [decision(h, 'proof:link-one', 'declined', { option: 'shaky' })], false));
    await settled(h);
    const kept = await main(h);
    expect(kept).toContain('link_one.holds');
    expect(kept).toContain('link_two.holds');
    expect(record(h, 'proof:link-two')).toMatchObject({ status: 'to-be-redone', redo: { reverted: false } });
    // The judge passes (a Shaky Result still counts for those that use it, D2-48): nothing was taken out.
    expect(session(h).judged?.ok).toBe(true);
    expect(record(h, 'proof:link-two').markers).not.toContain('no-longer-builds');
    // Reject their source: link-one's statement goes, and with it the Shaky Result and its dependents.
    ok(await h.manager.decide(runId, 1, true, [decision(h, 'card:link-one', 'declined', { option: 'reject' })], false));
    await settled(h);
    const out = await main(h);
    expect(out).not.toContain('link_one.holds');
    expect(out).not.toContain('link_two.holds');
    expect(record(h, 'proof:link-one')).toMatchObject({ status: 'to-be-redone', decline: { option: 'shaky' }, redo: { reverted: true } });
    expect(record(h, 'proof:link-two')).toMatchObject({ status: 'to-be-redone', redo: { reverted: true } });
  });
});

describe('accepted dependents (RV-5, §3.6, D2-64)', () => {
  it('`needs-confirmation` lists the accepted dependents; not confirming changes nothing; confirmed, they lose their Accept', async () => {
    const { h, runId } = await pgStage();
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'accepted')], false));
    await settled(h);
    expect(h.manager.session()?.results.shown).toBe(true);
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'accepted')], false));
    expect(record(h, RESULT).status).toBe('accepted');
    const before = rawRun(h).session;
    const ask = await h.manager.decide(runId, 1, true, [decision(h, PG, 'in-review')], false);
    expect(ask).toEqual({
      ok: false,
      code: 'needs-confirmation',
      error: REVIEW_TEXTS.cascadeBackToReview,
      cascade: [{ item: record(h, RESULT).id, to: 'in-review', why: expect.any(String) }],
    });
    // Cancel: nothing was sent again, nothing changed.
    expect(rawRun(h).session).toEqual(before);
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'in-review')], true));
    expect(record(h, PG).status).toBe('in-review');
    expect(record(h, RESULT).status).toBe('in-review');
  });

  it('D2-64: with the results hidden, taking a listed Accept away asks (hiddenResults), naming no Result; the hidden accepted Result loses its Accept silently, shown later', async () => {
    // Two statement items: pg (the Result rests on it) and link... use the chain: accept both statements, show, accept
    // every Result, then put link-two's statement back to review (results hidden again), then take link-one's Accept.
    const { h, runId } = await chainStage();
    ok(await h.manager.decide(runId, 1, false, [decision(h, 'card:link-one', 'accepted'), decision(h, 'card:link-two', 'accepted')], false));
    expect(h.manager.session()?.results.shown).toBe(true);
    for (const key of ['proof:link-one', 'proof:link-two', 'proof:cynder-not-good']) ok(await h.manager.decide(runId, 1, true, [decision(h, key, 'accepted')], false));
    // link-two's statement back to review: its accepted dependents (link-two's and the goal's Results) lose their Accept,
    // and the results are hidden again.
    const ask = await h.manager.decide(runId, 1, true, [decision(h, 'card:link-two', 'in-review')], false);
    expect(ask).toMatchObject({ ok: false, code: 'needs-confirmation' });
    ok(await h.manager.decide(runId, 1, true, [decision(h, 'card:link-two', 'in-review')], true));
    expect(h.manager.session()?.results.shown).toBe(false);
    expect(record(h, 'proof:link-one').status).toBe('accepted');
    // Now take link-one's Accept away while hidden: it asks even with nothing listed to name, with the sentence.
    const hiddenAsk = await h.manager.decide(runId, 1, true, [decision(h, 'card:link-one', 'in-review')], false);
    expect(hiddenAsk).toEqual({
      ok: false,
      code: 'needs-confirmation',
      error: `${REVIEW_TEXTS.cascadeBackToReview} ${REVIEW_TEXTS.cascadeHiddenResults}`,
      cascade: [],
      hiddenResults: true,
    });
    const answer = await h.manager.decide(runId, 1, true, [decision(h, 'card:link-one', 'in-review')], true);
    expect(answer).toMatchObject({ ok: true, review: { cascade: [] } });
    expect(JSON.stringify(answer)).not.toContain(record(h, 'proof:link-one').id);
    // The hidden accepted Result lost its Accept, silently; it shows with the results.
    expect(record(h, 'proof:link-one').status).toBe('in-review');
    expect(viewItem(h, 'proof:link-one')?.status).toBeNull();
    ok(await h.manager.reveal(runId, 1, 'show-result'));
    expect(viewItem(h, 'proof:link-one')?.status).toBe('in-review');
  });
});

describe('DO-0: an arrow item (§4.6)', () => {
  it('declining it takes the arrow away and the Results using it to be redone (reverted); it is in `rejectedArrows`, and refused if proposed again', async () => {
    const proposeArrow = (why: string) => ({ kind: 'callTool' as const, tool: 'propose_arrow', args: { source: 'cynder-dark-past', target: T, why } });
    const h = harness({
      source: chainModel(),
      withFacts: false,
      script: [
        round1(proposeArrow('it is needed'), step.freeze(), step.edit(GOAL_LINE, `${GOAL_LINE}theorem cynder_not_good.holds : cynder_not_good := fun _ => cynder_dark_past.holds.elim\n`), step.finish('proved', 'with the arrow'), step.result()),
        { match: `rework “${T}” after the review`, steps: [proposeArrow('again'), step.finish('not_proved', 'no other way'), step.result()] },
      ],
    });
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: [{ target: T, premises: ['link-two'] }] })).toMatchObject({ ok: true });
    const v = await waitForStage(h.manager, 1);
    await settled(h);
    const arrow = record(h, 'arrow:cynder-dark-past>cynder-not-good');
    expect(arrow.kind).toBe('add-arrow');
    expect(h.manager.session()?.results.shown).toBe(true);
    expect(await main(h)).toContain('premises: link-two, cynder-dark-past');
    ok(await h.manager.decide(v.runId, 1, true, [{ item: arrow.id, rev: arrow.rev, to: 'declined', option: 'plain' }], false));
    await settled(h);
    const text = await main(h);
    expect(text).not.toContain('cynder_not_good.holds');
    expect(text).toContain('premises: link-two\n');
    expect(record(h, arrow.key)).toMatchObject({ status: 'declined', decline: { option: 'plain' } });
    expect(record(h, RESULT)).toMatchObject({ status: 'to-be-redone', redo: { reverted: true } });
    expect(session(h).rejectedArrows).toEqual([{ source: 'cynder-dark-past', target: T }]);
    // Proposed again in a later step (Submit review reworks the Result): refused.
    ok(await h.manager.submit(v.runId, 1));
    await waitForStage(h.manager, 2);
    const transcript = readFileSync(`${h.shadow().paths.sessionDir}/transcript.jsonl`, 'utf8');
    expect(transcript).toContain('The person declined “cynder-dark-past” → “cynder-not-good” in this session: do not propose it again.');
    expect(session(h).ledger.some((e) => e.kind === 'arrow' && e.step !== 's1')).toBe(false);
  });
});

describe('Show results, the raw diff and Claude\'s activity (RV-6, §4.7)', () => {
  it('Show results shows every Result, marked seen early; a statement set back to review hides them again; Undo of Show results hides them and keeps the markers', async () => {
    const { h, runId } = await chainStage();
    expect(h.manager.session()?.results.shown).toBe(false);
    const shown = await h.manager.reveal(runId, 1, 'show-result');
    expect(shown).toMatchObject({ ok: true, label: REVIEW_TEXTS.showResults });
    let view = h.manager.session();
    expect(view?.results).toMatchObject({ shown: true, forced: true });
    for (const key of ['proof:link-one', 'proof:link-two', 'proof:cynder-not-good']) expect(record(h, key).markers).toContain('seen-early');
    expect(view?.undo).toEqual({ step: session(h).stack.done.at(-1)?.id, label: REVIEW_TEXTS.showResults });
    // Undo of Show results: hidden again, the markers stay.
    ok(await h.manager.undoSession(runId, view?.undo?.step ?? -1, false));
    view = h.manager.session();
    expect(view?.results.shown).toBe(false);
    expect(record(h, 'proof:link-one').markers).toContain('seen-early');
    expect(session(h).forced).toBeUndefined();
    // Redo shows them again; a statement accepted then set back to review hides them (the force ends).
    ok(await h.manager.redoSession(runId, view?.redo?.step ?? -1, false));
    expect(h.manager.session()?.results.shown).toBe(true);
    ok(await h.manager.decide(runId, 1, true, [decision(h, 'card:link-one', 'accepted')], false));
    expect(h.manager.session()?.results.shown).toBe(true);
    ok(await h.manager.decide(runId, 1, true, [decision(h, 'card:link-one', 'in-review')], true));
    expect(h.manager.session()?.results.shown).toBe(false);
    expect(session(h).forced).toBeUndefined();
  });

  it('the raw diff while hidden needs `confirmed`, then counts as Show results; shown, it opens at once', async () => {
    const { h, runId } = await pgStage();
    expect(await h.manager.sessionDiff(runId, 1, false)).toEqual({ ok: false, code: 'needs-confirmation', error: REVIEW_TEXTS.rawDiffReveals, reveal: true });
    expect(session(h).stack.done).toEqual([]);
    const diff = await h.manager.sessionDiff(runId, 1, true);
    expect(diff).toMatchObject({ ok: true, kind: 'diff' });
    const files = 'files' in diff ? diff.files : [];
    expect(files.map((f) => f.path)).toEqual(['Model/Spyro/Main.lean']);
    expect(files[0]?.after).toContain(GOAL_PROOF.trim());
    expect(files[0]?.before).not.toContain('pg_no_dark_past');
    expect(session(h).forced).toMatchObject({ via: 'raw-diff' });
    expect(session(h).stack.done.map((a) => a.kind)).toEqual(['reveal']);
    expect(record(h, RESULT).markers).toContain('seen-early');
    // Shown: no confirmation, no new stack step.
    expect(await h.manager.sessionDiff(runId, 1, false)).toMatchObject({ ok: true, kind: 'diff' });
    expect(session(h).stack.done).toHaveLength(1);
  });

  it('"Show Claude\'s activity" counts as Show results; the RunView then shows Claude\'s work', async () => {
    const { h, runId } = await pgStage('proved');
    expect(h.manager.current()?.activity).toEqual([]);
    ok(await h.manager.reveal(runId, 1, 'activity'));
    expect(session(h).forced).toMatchObject({ via: 'activity' });
    expect(h.manager.session()?.results.shown).toBe(true);
    expect(h.manager.current()?.activity.length).toBeGreaterThan(0);
  });
});

describe('Undo and Redo (UN-4, D2-73, AF13)', () => {
  it('Undo of a Reject inverts its commit; Redo sends the request again as a new action, with a new commit', async () => {
    const { h, runId } = await pgStage();
    const before = await main(h);
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'declined', { option: 'reject' })], false));
    await settled(h);
    const reject = session(h).stack.done.at(-1);
    expect(await main(h)).not.toBe(before);
    expect(h.manager.session()?.undo?.step).toBe(reject?.id);
    ok(await h.manager.undoSession(runId, reject?.id ?? -1, false));
    await settled(h);
    expect(await main(h)).toBe(before);
    expect(record(h, PG)).toMatchObject({ status: 'in-review', rejectedFingerprints: [] });
    expect(record(h, RESULT)).toMatchObject({ status: 'in-review' });
    expect(session(h).stack).toMatchObject({ done: [], undone: [{ id: reject?.id }] });
    await consistent(h);
    // A stale step: conflict.
    expect(await h.manager.redoSession(runId, (reject?.id ?? 0) + 7, false)).toEqual({ ok: false, code: 'conflict', error: REVIEW_TEXTS.historyChanged });
    ok(await h.manager.redoSession(runId, reject?.id ?? -1, false));
    await settled(h);
    const redone = session(h).stack.done.at(-1);
    expect(redone?.id).not.toBe(reject?.id);
    expect(redone).toMatchObject({ kind: 'decide', commits: [expect.any(String)] });
    expect(redone?.kind === 'decide' && reject?.kind === 'decide' ? redone.commits[0] : '').not.toBe(reject?.kind === 'decide' ? reject.commits[0] : '');
    expect(record(h, PG).status).toBe('declined');
    expect(await main(h)).not.toContain('pg_no_dark_past');
  });

  it('Undo, then a judge that changes a class, then Redo: refused with the rule\'s text, and nothing changes (AF13)', async () => {
    const { h, runId } = await pgStage();
    // A group Accept that the rules allow now, undone; then a judge changes the item's class so that only its own
    // Accept may take it (RV-7): the Redo, the same request again, is refused (AF13).
    ok(await h.manager.reveal(runId, 1, 'show-result'));
    const group = await h.manager.decide(runId, 1, false, [decision(h, PG, 'accepted')], false);
    // pg is a belief (an axiom card's Formalize): a group Accept leaves it, saying why.
    expect(group).toMatchObject({ ok: true, review: { taken: [], left: [{ item: record(h, PG).id, reason: 'own-accept' }] } });
    expect(record(h, PG).status).toBe('in-review');
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'accepted')], false));
    ok(await h.manager.decide(runId, 1, false, [decision(h, RESULT, 'accepted')], false));
    expect(record(h, RESULT)).toMatchObject({ status: 'accepted', accepted: { how: 'group' } });
    const acceptAction = session(h).stack.done.at(-1);
    ok(await h.manager.undoSession(runId, acceptAction?.id ?? -1, false));
    expect(record(h, RESULT).status).toBe('in-review');
    // A judge now classes the Result as changing what is proved (its class grew): a group Accept would leave it.
    h.engine.onJudge = async (ctx) => {
      const r = await fakeStageJudge(ctx);
      const grown: StateJudgement = { ...r.judgement, classes: { ...r.judgement.classes, [RESULT]: { ...(r.judgement.classes[RESULT] ?? { belief: false, changesProved: false, reasons: [], complete: true }), changesProved: true } } };
      return { judgement: grown, report: { ...r.report, judgement: grown } };
    };
    type Internals = { run: unknown; judgeHead(run: unknown, o: unknown): Promise<void> };
    const m = h.manager as unknown as Internals;
    await m.judgeHead(m.run, {});
    await settled(h);
    const before = rawRun(h).session;
    const redo = await h.manager.redoSession(runId, acceptAction?.id ?? -1, false);
    expect(redo).toMatchObject({ ok: false, code: 'refused' });
    expect(redo.ok === false && redo.error).toBe(REVIEW_TEXTS.leftOwnAcceptProved(`Result “Cynder would not be a good addition to the new Spyro game”`));
    expect(rawRun(h).session).toEqual(before);
  });
});
