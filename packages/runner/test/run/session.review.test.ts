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
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { REVIEW_TEXTS, sessionLabels, type ActionOutcome, type LeanFacts, type SessionView, type StateJudgement } from '@telelean/core';

import { RunFiles } from '../../src/run/persist.js';
import { DECIDED_DID_NOT_PASS, NO_JUDGEMENT } from '../../src/run/review.js';
import type { PersistedSession } from '../../src/run/types.js';
import { DECISIONS_DID_NOT_PASS } from '../../src/run/session.js';

import type { FakeStep } from '../../src/llm/fake.js';
import type { FakeScriptTurn } from '../../src/llm/fakeScripts.js';
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
  rulesGate,
  session,
  settled,
  stackKinds,
  T,
  viewItem,
} from './helpers/review.js';
import { CHAIN, chainModel, LINK_ONE_STATEMENT, LINK_TWO_STATEMENT, proveGoal, proveLinkOne, proveLinkTwo, stepMatch } from './helpers/sessions.js';

const LINK_TWO_BLOCK_END = 'natural_name: The new Spyro game excludes Cynder\npremises: link-one, new-spyro-pg\nasserted: 2026-11-01\n-/\n';

const toDispose: Array<() => void> = [];
afterEach(() => {
  vi.restoreAllMocks();
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
    for (const key of ['proof:link-one', 'proof:link-two', 'proof:cynder-not-good']) expect(record(h, key).redo).toMatchObject({ kind: 'cascade' });
    // Un-reject: the inverse merge brings back what the commit took out; the dependents come back with it, in review
    // (2j1, D2-76 D3; D2-60 left them to be redone), their content in ws/, and the judge keeps them so.
    ok(await h.manager.decide(runId, 1, true, [decision(h, 'card:link-one', 'in-review')], false));
    await settled(h);
    expect(await main(h)).toBe(before);
    expect(record(h, 'card:link-one')).toMatchObject({ status: 'in-review', rejectedFingerprints: [] });
    expect(record(h, 'card:link-one').decline).toBeUndefined();
    for (const key of ['proof:link-one', 'proof:link-two', 'proof:cynder-not-good']) {
      expect(record(h, key)).toMatchObject({ status: 'in-review' });
      expect(record(h, key).redo).toBeUndefined();
    }
    // The Results are hidden (link-one is in review): no event names them (D2-64).
    const resultIds = ['proof:link-one', 'proof:link-two', 'proof:cynder-not-good'].map((key) => record(h, key).id);
    expect(h.manager.session()?.results.shown).toBe(false);
    expect(JSON.stringify(h.manager.session()?.events)).not.toMatch(new RegExp(resultIds.join('|')));
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

  it('2j1 (D2-76 D1; it supersedes AF4\'s test): a Shaky decline of a definition makes its dependents P1 and P2 to be redone with their content kept: they keep no result hidden, so the results show and Submit runs', async () => {
    // D: a definition written before the freeze; P1 and P2: two statements (Formalize items) that use it; both proved.
    const D = 'def bad_past (c : Character) : Prop := HasDarkPast c\n';
    const P1 = '/-- Cynder has a past that PG games exclude -/\nabbrev link_one : Prop := bad_past cynder\n';
    const P2 = '/-- The new Spyro game excludes Cynder -/\nabbrev link_two : Prop := bad_past cynder ∧ IsPG newSpyro\n';
    const block = (premises: string) => `premises: ${premises}\nasserted: 2026-11-01\n-/\n`;
    const h = harness({
      source: chainModel(),
      withFacts: false,
      script: [
        {
          match: stepMatch(1, 2, 'link-one'),
          steps: [
            step.edit('namespace Spyro\n', `namespace Spyro\n\n${D}`),
            step.edit(block('cynder-dark-past'), `${block('cynder-dark-past')}${P1}`),
            step.freeze('link-one'),
            step.edit(P1, `${P1}theorem link_one.holds : link_one := cynder_dark_past.holds\n`),
            step.finish('proved', 'link-one proved'),
            step.result(),
          ],
        },
        {
          match: stepMatch(2, 2, 'link-two'),
          steps: [
            step.edit(block('link-one, new-spyro-pg'), `${block('link-one, new-spyro-pg')}${P2}`),
            step.freeze('link-two'),
            step.edit(P2, `${P2}theorem link_two.holds : link_two := ⟨link_one.holds, new_spyro_pg.holds⟩\n`),
            step.finish('proved', 'link-two proved'),
            step.result(),
          ],
        },
        { match: 'rework “link-one” after the review', steps: [step.finish('not_proved', 'reworked'), step.result()] },
        { match: 'rework “link-two” after the review', steps: [step.finish('not_proved', 'reworked'), step.result()] },
      ],
    });
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: CHAIN.slice(0, 2) })).toMatchObject({ ok: true });
    const v = await waitForStage(h.manager, 1);
    await settled(h);
    const keys = session(h).items.map((r) => r.key);
    expect(keys).toEqual(expect.arrayContaining(['decl:Spyro.bad_past', 'card:link-one', 'card:link-two', 'proof:link-one', 'proof:link-two']));
    const before = await main(h);
    ok(await h.manager.decide(v.runId, 1, true, [decision(h, 'decl:Spyro.bad_past', 'declined', { option: 'shaky' })], false));
    await settled(h);
    // Shaky takes nothing out; its dependents, P1 and P2 and the Results resting on them, are to be redone, kept.
    expect(await main(h)).toBe(before);
    const p1 = record(h, 'card:link-one');
    const p2 = record(h, 'card:link-two');
    for (const r of [p1, p2, record(h, 'proof:link-one'), record(h, 'proof:link-two')]) expect(r).toMatchObject({ status: 'to-be-redone', redo: { reverted: false } });
    const view = h.manager.session();
    expect(view?.results).toMatchObject({ shown: true, waitingFor: [] });
    expect(view?.submit.gate).toEqual({ ok: true });
    expect(view?.submit.work).toMatchObject({ shaky: 1, redo: 4 });
    // They cannot be set back to review by hand (D2): the refusal, and nothing changes.
    const unchanged = rawRun(h).session;
    expect(await h.manager.decide(v.runId, 1, true, [decision(h, 'card:link-one', 'in-review')], false)).toEqual({ ok: false, code: 'refused', error: REVIEW_TEXTS.redoneByClaude });
    expect(rawRun(h).session).toEqual(unchanged);
    expect(viewItem(h, 'card:link-one')?.review).toEqual({ ok: false, reason: REVIEW_TEXTS.redoneByClaude });
    // It says why (D4): "↻ to be redone: it depends on ‹D›, declined Shaky".
    const label = sessionLabels(view as SessionView)[record(h, 'decl:Spyro.bad_past').id] as string;
    expect(label).toContain('bad_past');
    expect(viewItem(h, 'card:link-one')?.redo?.why).toEqual([REVIEW_TEXTS.redoLine(REVIEW_TEXTS.redoDependsOn(label, 'declined Shaky'))]);
    // Submit runs: one step per affected inference, link-one's first (link-two's rests on what it opens).
    ok(await h.manager.submit(v.runId, 1));
    await waitForStage(h.manager, 2);
    expect(session(h).steps.slice(2).map((x) => [x.kind, x.target, x.queue])).toEqual([
      ['submit', 'link-one', 2],
      ['submit', 'link-two', 2],
    ]);
    expect(session(h).stack.done.at(-1)).toMatchObject({ kind: 'seal', by: 'submit' });
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

describe('2j1: the automatic return (D2-76 D3)', () => {
  const RESULTS = ['proof:link-one', 'proof:link-two', 'proof:cynder-not-good'];

  it('un-Shaky brings back, with no write, what its Shaky decline made to be redone; Undo and Redo give back each state exactly; no event names a hidden Result', async () => {
    const { h, runId } = await chainStage();
    const before = await main(h);
    ok(await h.manager.decide(runId, 1, true, [decision(h, 'card:link-one', 'declined', { option: 'shaky' })], false));
    await settled(h);
    for (const key of RESULTS) expect(record(h, key)).toMatchObject({ status: 'to-be-redone', redo: { because: [record(h, 'card:link-one').id], reverted: false, kind: 'cascade' } });
    const down = structuredClone(session(h).items);
    const commits = (await h.shadow().commits()).length;
    ok(await h.manager.decide(runId, 1, true, [decision(h, 'card:link-one', 'in-review')], false));
    await settled(h);
    for (const key of RESULTS) {
      expect(record(h, key)).toMatchObject({ status: 'in-review' });
      expect(record(h, key).redo).toBeUndefined();
    }
    // Records only: no commit, ws/ unchanged; the Results are hidden (link-one is in review), so no event names them.
    expect((await h.shadow().commits()).length).toBe(commits);
    expect(await main(h)).toBe(before);
    const view = h.manager.session();
    expect(view?.results.shown).toBe(false);
    const hiddenIds = RESULTS.map((key) => record(h, key).id);
    expect(JSON.stringify(view?.events)).not.toMatch(new RegExp(hiddenIds.join('|')));
    const back = structuredClone(session(h).items);
    // Undo restores every record the un-Shaky touched; Redo does it again.
    ok(await h.manager.undoSession(runId, view?.undo?.step ?? -1, true));
    await settled(h);
    expect(session(h).items).toEqual(down);
    ok(await h.manager.redoSession(runId, h.manager.session()?.redo?.step ?? -1, true));
    await settled(h);
    expect(session(h).items.map((r) => [r.key, r.status, r.redo])).toEqual(back.map((r) => [r.key, r.status, r.redo]));
    await consistent(h);
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
    const proposeArrow = (why: string): FakeStep => ({ kind: 'callTool', tool: 'propose_arrow', args: { source: 'cynder-dark-past', target: T, why } });
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

describe('DO-0 on an arrow a question selected (D2-59, F4)', () => {
  it('a mid-stage Formalize selects Claude\'s accepted arrow and T is proved; declining the arrow item takes its source out of T\'s question and makes the Result to be redone, the report says so; Undo puts it back; a Submit step that still uses the source fails B.2', async () => {
    const arrowStep: FakeStep = { kind: 'callTool', tool: 'propose_arrow', args: { source: 'cynder-dark-past', target: T, why: 'it is needed' } };
    const PROOF = 'theorem cynder_not_good.holds : cynder_not_good := fun _ => cynder_dark_past.holds.elim\n';
    // The chain model, with an arrow drawn from new-spyro-pg (which has a `.holds`) into T besides link-two's.
    const source = chainModel();
    const file = path.join(source, 'Model/Spyro/Main.lean');
    writeFileSync(file, readFileSync(file, 'utf8').replace('premises: link-two\n', 'premises: link-two, new-spyro-pg\n'));
    const h = harness({
      source,
      withFacts: false,
      script: [
        round1(arrowStep, step.freeze(), step.edit(GOAL_LINE, GOAL_LINE + PROOF), step.finish('proved', 'With the arrow.'), step.result()),
        { match: stepMatch(1, 1, T), steps: [step.freeze(), step.finish('proved', 'From the selected arrows.'), step.result()] },
        { match: `rework “${T}” after the review`, steps: [step.freeze(), step.edit(GOAL_LINE, GOAL_LINE + PROOF), step.finish('proved', 'Still with it.'), step.edit(PROOF, ''), step.finish('not_proved', 'Not from new-spyro-pg alone.'), step.result()] },
      ],
    });
    const gates = rulesGate(h, ['undeclared-premise']);
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: [{ target: T, premises: ['new-spyro-pg'] }] })).toMatchObject({ ok: true });
    const v = await waitForStage(h.manager, 1);
    await settled(h);
    const arrow = record(h, 'arrow:cynder-dark-past>cynder-not-good');
    expect(h.manager.session()?.results.shown).toBe(true);
    ok(await h.manager.decide(v.runId, 1, true, [decision(h, arrow.key, 'accepted')], false));
    ok(await h.manager.decide(v.runId, 1, true, [decision(h, RESULT, 'accepted')], false));
    // RV-9, D2-20: a mid-stage Formalize may select Claude's accepted arrow; the re-ask proves T, so its question changes.
    ok(await h.manager.formalize({ subject: 'Spyro', inferences: [{ target: T, premises: ['new-spyro-pg', 'cynder-dark-past'] }], runId: v.runId, stage: 1 }));
    await waitForStage(h.manager, 1);
    await settled(h);
    expect(session(h).inferences.find((i) => i.target === T)?.question).toEqual({ sources: ['new-spyro-pg', 'cynder-dark-past'], fromNothing: false });
    expect(h.manager.session()?.results.shown).toBe(true);
    if (record(h, RESULT).status === 'in-review') ok(await h.manager.decide(v.runId, 1, true, [decision(h, RESULT, 'accepted')], false));
    expect(record(h, RESULT).status).toBe('accepted');
    const before = await main(h);
    // DO-0: its accepted dependent loses its Accept (asked first).
    expect(await h.manager.decide(v.runId, 1, true, [decision(h, arrow.key, 'declined', { option: 'plain' })], false)).toMatchObject({ ok: false, code: 'needs-confirmation' });
    ok(await h.manager.decide(v.runId, 1, true, [decision(h, arrow.key, 'declined', { option: 'plain' })], true));
    await settled(h);
    expect(session(h).inferences.find((i) => i.target === T)?.question).toEqual({ sources: ['new-spyro-pg'], fromNothing: false });
    expect(record(h, RESULT)).toMatchObject({ status: 'to-be-redone', redo: { reverted: true } });
    expect(session(h).rejectedArrows).toEqual([{ source: 'cynder-dark-past', target: T }]);
    expect(await main(h)).toContain('premises: link-two, new-spyro-pg\n');
    expect(h.manager.session()?.report.notes).toContain(REVIEW_TEXTS.leftQuestion('Cynder is a character who has a dark past', 'Cynder would not be a good addition to the new Spyro game'));
    const decline = session(h).stack.done.at(-1);
    expect(decline).toMatchObject({ kind: 'decide', questions: [{ target: T, before: { sources: ['new-spyro-pg', 'cynder-dark-past'] }, after: { sources: ['new-spyro-pg'] } }] });
    // Undo (F4): the arrow, the question's source and the Result's Accept come back; nothing stays rejected.
    const undone = await h.manager.undoSession(v.runId, decline?.id ?? -1, true);
    expect(undone, JSON.stringify([undone, session(h).items.map((r) => [r.key, r.status, r.rev, r.markers, r.judged])])).toMatchObject({ ok: true });
    await settled(h);
    expect(await main(h)).toBe(before);
    expect(session(h).inferences.find((i) => i.target === T)?.question).toEqual({ sources: ['new-spyro-pg', 'cynder-dark-past'], fromNothing: false });
    expect(session(h).rejectedArrows).toEqual([]);
    expect(record(h, arrow.key).status).toBe('accepted');
    expect(record(h, RESULT).status).toBe('accepted');
    // Redo it, then Submit: T's step proves it with cynder-dark-past again, with no arrow: B.2 refuses (a counted attempt).
    ok(await h.manager.redoSession(v.runId, session(h).stack.undone.at(-1)?.id ?? -1, true));
    await settled(h);
    expect(session(h).inferences.find((i) => i.target === T)?.question.sources).toEqual(['new-spyro-pg']);
    ok(await h.manager.submit(v.runId, 1));
    await waitForStage(h.manager, 2);
    expect(gates.at(-2)?.map((f) => f.code)).toContain('undeclared-premise');
    expect(gates.at(-1)).toEqual([]);
    expect(session(h).steps.at(-1)).toMatchObject({ kind: 'submit', state: 'passed', counters: { gateAttempts: 2 }, lastFinish: { status: 'not_proved' } });
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

  it('Undo of a Reject that took an accepted item and its accepted dependent out of ws/ restores both Accepts, which the next judge keeps (builder 2e: no class while their content is out)', async () => {
    const { h, runId } = await pgStage();
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'accepted')], false));
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'accepted')], false));
    const before = await main(h);
    const accepted = { pg: record(h, PG).accepted, result: record(h, RESULT).accepted };
    expect(await h.manager.decide(runId, 1, true, [decision(h, PG, 'declined', { option: 'reject' })], false)).toMatchObject({ ok: false, code: 'needs-confirmation' });
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'declined', { option: 'reject' })], true));
    await settled(h);
    // The stage judgement has no class for either now: their content is out.
    expect(record(h, RESULT)).toMatchObject({ status: 'to-be-redone', redo: { reverted: true } });
    const reject = session(h).stack.done.at(-1);
    expect(await h.manager.undoSession(runId, reject?.id ?? -1, true)).toMatchObject({ ok: true });
    await settled(h);
    expect(await main(h)).toBe(before);
    expect(record(h, PG)).toMatchObject({ status: 'accepted', accepted: accepted.pg });
    expect(record(h, RESULT)).toMatchObject({ status: 'accepted', accepted: accepted.result });
    expect(session(h).judged).toMatchObject({ commit: session(h).head, ok: true });
    await consistent(h);
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

describe('Undo and Redo after a judge changed a dependency (AF13)', () => {
  it('Undo, then a judge that makes the item depend on one in review, then Redo: refused with the rule\'s text, and nothing changes', async () => {
    // Claude's arrow into T (an arrow item: a dependency change leaves its rev alone; a Result's would be RV-11's).
    const arrowStep: FakeStep = { kind: 'callTool', tool: 'propose_arrow', args: { source: 'cynder-dark-past', target: T, why: 'it is needed' } };
    const h = harness({
      source: chainModel(),
      withFacts: false,
      script: [
        round1(
          arrowStep,
          step.edit(LINK_TWO_BLOCK_END, LINK_TWO_BLOCK_END + LINK_TWO_STATEMENT),
          step.freeze(),
          step.edit(GOAL_LINE, `${GOAL_LINE}theorem cynder_not_good.holds : cynder_not_good := fun _ => cynder_dark_past.holds.elim\n`),
          step.finish('proved'),
          step.result(),
        ),
      ],
    });
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: [{ target: T, premises: ['link-two'] }] })).toMatchObject({ ok: true });
    const { runId } = await waitForStage(h.manager, 1);
    await settled(h);
    const ARROW = 'arrow:cynder-dark-past>cynder-not-good';
    // link-two's statement (a Formalize item the step wrote) declined as Shaky: decided, so the results show, not accepted.
    ok(await h.manager.decide(runId, 1, true, [decision(h, 'card:link-two', 'declined', { option: 'shaky' })], false));
    expect(h.manager.session()?.results.shown).toBe(true);
    ok(await h.manager.decide(runId, 1, true, [decision(h, ARROW, 'accepted')], false));
    const accept = session(h).stack.done.at(-1);
    ok(await h.manager.undoSession(runId, accept?.id ?? -1, true));
    // A judge now makes the arrow depend on link-two's statement (declined Shaky): its Accept waits for it.
    const judge = h.engine.onJudge;
    h.engine.onJudge = async (ctx) => {
      const r = await judge(ctx);
      const deps: StateJudgement = { ...r.judgement, deps: { ...r.judgement.deps, [ARROW]: [...(r.judgement.deps[ARROW] ?? []), 'card:link-two'] } };
      return { judgement: deps, report: { ...r.report, judgement: deps } };
    };
    await internals(h).judgeHead(internals(h).run, {});
    await settled(h);
    expect(record(h, ARROW)).toMatchObject({ status: 'in-review', rev: 1 });
    const before = rawRun(h).session;
    const redo = await h.manager.redoSession(runId, accept?.id ?? -1, false);
    expect(redo).toEqual({
      ok: false,
      code: 'refused',
      error: REVIEW_TEXTS.acceptNeedsDependencies('Add arrow “Cynder is a character who has a dark past” → “Cynder would not be a good addition to the new Spyro game”', [
        'Formalize “The new Spyro game excludes Cynder”',
      ]),
    });
    expect(rawRun(h).session).toEqual(before);
  });
});

/** White box: the manager's session internals the judging tests drive. */
type Internals = {
  run: unknown;
  judgeHead(run: unknown, o: unknown): Promise<void>;
  enqueueWrite<T>(run: unknown, job: () => Promise<T>): Promise<T>;
  idle(run: unknown): Promise<void>;
  asLastWrite(run: unknown, job: () => Promise<ActionOutcome>): Promise<ActionOutcome>;
  stageContext(run: unknown): Parameters<typeof fakeStageJudge>[0];
  judgeApply(run: unknown, judgement: StateJudgement, report: unknown, options: unknown): Promise<string>;
  startQueue(run: unknown, by: 'retry', steps: unknown[], inferences: unknown[]): Promise<ActionOutcome>;
  sessionOf(run: unknown): PersistedSession;
  runtimeOf(run: unknown): { queuedJudges: number; judgement: StateJudgement | null };
  persistStep4(run: unknown, change?: unknown): Promise<void>;
  writeJudgedFacts(...args: unknown[]): Promise<void>;
  openConfirmation(run: unknown): Promise<ActionOutcome>;
  finishQueueStart(run: unknown, ...rest: unknown[]): Promise<ActionOutcome>;
  submitNow(run: unknown, stage: number): Promise<ActionOutcome>;
};
const internals = (h: Harness) => h.manager as unknown as Internals;

/** A Lean error inside the first declaration whose line starts with `line` in the main file (a state that does not build). */
function errorAt(line: string): (facts: LeanFacts, files: ReadonlyMap<string, string>) => LeanFacts {
  return (facts, files) => {
    const at = (files.get('Model/Spyro/Main.lean') ?? '').split('\n').findIndex((l) => l.startsWith(line));
    if (at < 0) return facts;
    const range = { start: { line: at, character: 0 }, end: { line: at, character: 0 } };
    return { ...facts, build: { ...facts.build, status: 'failed', messages: [...facts.build.messages, { severity: 'error', file: 'Model/Spyro/Main.lean', range, text: 'unknown identifier (test)' }] } };
  };
}

/** A judge held until released, its judgement optionally changed; the commits every judge judged. */
function heldJudge(h: Harness, change?: (j: StateJudgement) => StateJudgement): { judged: string[]; release: () => void; started: () => Promise<void> } {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  const judged: string[] = [];
  h.engine.onJudge = async (ctx) => {
    const r = await fakeStageJudge(ctx);
    judged.push(r.judgement.commit);
    if (judged.length > 1 || change === undefined) {
      if (judged.length === 1) await held;
      return r;
    }
    await held;
    const changed = change(r.judgement);
    return { judgement: changed, report: { ...r.report, judgement: changed } };
  };
  const started = async () => {
    for (let k = 0; k < 400 && judged.length === 0; k++) await new Promise((r) => setTimeout(r, 5));
    expect(judged).toHaveLength(1);
  };
  return { judged, release, started };
}

describe('decisions and the judge (§3.6, §2.6, F8, D2-27, AF3)', () => {
  it('an Accept made while a judge runs goes through at once; the judge\'s outcome, which changes another item, is applied on the records as they are then: both changes kept', async () => {
    const { h, runId } = await pgStage();
    ok(await h.manager.reveal(runId, 1, 'show-result'));
    const result = record(h, RESULT);
    expect(result.judged?.verdict).toBe('established');
    // The judge (white box: one started on the head) finds T merely proved now (RV-11: the Result's verdict changed).
    const { release, started } = heldJudge(h, (j) => ({ ...j, inferences: { ...j.inferences, [T]: { ...(j.inferences[T] as NonNullable<StateJudgement['inferences'][string]>), verdict: 'proved' } } }));
    const judging = internals(h).judgeHead(internals(h).run, { decided: true });
    await started();
    expect(h.manager.session()?.judging).toBe(true);
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'accepted')], false));
    expect(record(h, PG).status).toBe('accepted');
    release();
    await judging;
    await settled(h);
    expect(record(h, PG).status).toBe('accepted');
    expect(record(h, RESULT)).toMatchObject({ status: 'in-review', rev: result.rev + 1, markers: expect.arrayContaining(['updated']), judged: { verdict: 'proved' } });
  });

  it('a Reject made while a judge runs, whose revert would take out another item: its judge-apply is dropped, the judge runs again on the new head, and nothing is lost', async () => {
    const { h, runId } = await chainStage();
    ok(await h.manager.reveal(runId, 1, 'show-result'));
    const h0 = session(h).head;
    // The held judge, on h0, finds link-two's inference failing: its judge-apply would take link-two's Result out.
    const { judged, release, started } = heldJudge(h, (j) => ({ ...j, inferences: { ...j.inferences, 'link-two': { ...(j.inferences['link-two'] as NonNullable<StateJudgement['inferences'][string]>), passes: false } } }));
    const judging = internals(h).judgeHead(internals(h).run, { decided: true });
    await started();
    const commits = (await h.shadow().commits()).length;
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'declined', { option: 'reject' })], false));
    const h1 = session(h).head;
    expect(h1).not.toBe(h0);
    release();
    await judging;
    await settled(h);
    // Dropped (the head moved), judged again on the new head; the decision's own judge then finds nothing new.
    expect(judged).toEqual([h0, h1, h1]);
    expect((await h.shadow().commits()).slice(commits).map((c) => c.kind)).toEqual(['decision']);
    expect(record(h, 'proof:link-two')).toMatchObject({ status: 'in-review' });
    expect(await main(h)).toContain('theorem link_two.holds');
    expect(record(h, RESULT)).toMatchObject({ status: 'declined', decline: { option: 'reject', commit: h1 } });
    expect(session(h).judged).toMatchObject({ commit: h1, ok: true });
    await consistent(h);
  });

  it('judging coalesces: decisions made while a judge runs make one more judge, on the newest head', async () => {
    const { h, runId } = await chainStage();
    ok(await h.manager.reveal(runId, 1, 'show-result'));
    const h0 = session(h).head;
    const { judged, release, started } = heldJudge(h);
    const judging = internals(h).judgeHead(internals(h).run, { decided: true });
    await started();
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'declined', { option: 'reject' })], false));
    ok(await h.manager.decide(runId, 1, true, [decision(h, 'proof:link-two', 'declined', { option: 'reject' })], false));
    const h2 = session(h).head;
    release();
    await judging;
    await settled(h);
    expect(judged).toEqual([h0, h2, h2]);
    expect(session(h).judged?.commit).toBe(h2);
  });

  it('Submit waits while a judge runs, and while a decision\'s write is still in the queue (AF3); an Accept does not wait', async () => {
    // A judge running: Accepts go through; Submit resolves only after the judge.
    const { h, runId } = await pgStage();
    const { release, started } = heldJudge(h);
    const judging = internals(h).judgeHead(internals(h).run, { decided: true });
    await started();
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'accepted')], false));
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'accepted')], false));
    let submitted = false;
    const submit = h.manager.submit(runId, 1).then((o) => ((submitted = true), o));
    await new Promise((r) => setTimeout(r, 150));
    expect(submitted).toBe(false);
    expect(session(h).phase).toBe('stage');
    release();
    await judging;
    expect(await submit).toEqual({ ok: true, label: REVIEW_TEXTS.confirmingPhase, undoable: false });
    expect(session(h).phase).toBe('confirming');
    // A write in the queue (white box: held in the write queue): Submit waits for it too.
    const { h: h2, runId: run2 } = await pgStage();
    ok(await h2.manager.decide(run2, 1, true, [decision(h2, PG, 'accepted')], false));
    ok(await h2.manager.decide(run2, 1, true, [decision(h2, RESULT, 'accepted')], false));
    let releaseWrite!: () => void;
    const write = internals(h2).enqueueWrite(internals(h2).run, () => new Promise<void>((r) => (releaseWrite = r)));
    let submitted2 = false;
    const submit2 = h2.manager.submit(run2, 1).then((o) => ((submitted2 = true), o));
    await new Promise((r) => setTimeout(r, 150));
    expect(submitted2).toBe(false);
    expect(session(h2).phase).toBe('stage');
    releaseWrite();
    await write;
    expect(await submit2).toMatchObject({ ok: true });
    expect(session(h2).phase).toBe('confirming');
  });

  it('the last write checks again inside the write queue: a judge that became due after its wait makes it wait again (white box)', async () => {
    const { h } = await pgStage();
    const m = internals(h);
    const { release, started } = heldJudge(h);
    const judging = m.judgeHead(m.run, { decided: true });
    await started();
    // Its first wait misses the judge (as if it had started right after the wait); the check inside the queue sees it.
    const realIdle = m.idle.bind(h.manager);
    let waits = 0;
    m.idle = async (run) => (++waits === 1 ? undefined : realIdle(run));
    let ran = false;
    const last = m.asLastWrite(m.run, async () => ((ran = true), { ok: true, label: 'ran', undoable: false }));
    await new Promise((r) => setTimeout(r, 150));
    expect(ran).toBe(false);
    release();
    await judging;
    expect(await last).toEqual({ ok: true, label: 'ran', undoable: false });
    expect(waits).toBeGreaterThanOrEqual(2);
  });

  it('a judge-apply that is not a queue\'s end is dropped while a step runs (white box)', async () => {
    const h = harness({ script: [pgScript('proved'), { match: `rework “${T}” after the review`, steps: [step.check(), { kind: 'sleep', ms: 60_000 }] }] });
    expect(await h.manager.start(START)).toMatchObject({ ok: true });
    const { runId } = await waitForStage(h.manager, 1);
    await settled(h);
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'declined', { option: 'shaky' })], false));
    ok(await h.manager.submit(runId, 1));
    await waitForRun(h.manager, (v) => v.state === 'working' && v.counters.checks === 1);
    const m = internals(h);
    const { judgement, report } = await fakeStageJudge(m.stageContext(m.run));
    expect(judgement.commit).toBe(session(h).head);
    const before = rawRun(h).session;
    expect(await m.enqueueWrite(m.run, () => m.judgeApply(m.run, judgement, report, { decided: true }))).toBe('dropped');
    expect(rawRun(h).session).toEqual(before);
    // Nor does a queue start reached now (its caller's checks came before the queue started): refused, nothing written.
    const s = session(h);
    const stray = { ...structuredClone(s.steps[1] as NonNullable<(typeof s.steps)[number]>), id: 's9', state: 'queued' as const };
    expect(await m.startQueue(m.run, 'retry', [stray], [])).toEqual({ ok: false, code: 'conflict', error: REVIEW_TEXTS.historyChanged });
    expect(rawRun(h).session).toEqual(before);
  });

  it('a revert that breaks the build converges: what no longer builds is taken out too, and the state passes again', async () => {
    const { h, runId } = await chainStage();
    // Without link-one's statement, link-two's statement does not build (white box: the judged facts get a Lean error
    // inside link_two's declaration while link_one's is gone).
    h.engine.onJudge = (ctx) =>
      fakeStageJudge(ctx, (facts, files) => ((files.get('Model/Spyro/Main.lean') ?? '').includes('abbrev link_one') ? facts : errorAt('abbrev link_two')(facts, files)));
    // F17: every session view posted meanwhile carries one board per version (a new board always comes with a new one).
    const boards = new Map<number, string>();
    const clash: string[] = [];
    h.manager.onDidChange((c) => {
      const v = c.session ? h.manager.session() : null;
      if (v === null) return;
      const board = JSON.stringify(v.board);
      const seen = boards.get(v.board.graph.version);
      if (seen !== undefined && seen !== board) clash.push(`version ${v.board.graph.version}`);
      boards.set(v.board.graph.version, board);
    });
    const version = session(h).viewVersion;
    ok(await h.manager.decide(runId, 1, true, [decision(h, 'card:link-one', 'declined', { option: 'reject' })], false));
    await settled(h);
    expect(clash).toEqual([]);
    // The decision raised it once, and the converged judgement (link-two's statement taken out too) once more.
    expect(session(h).viewVersion).toBe(version + 2);
    expect(JSON.stringify(h.manager.session()?.board)).not.toContain('link_two');
    expect(record(h, 'card:link-two')).toMatchObject({ status: 'to-be-redone', redo: { reverted: true }, markers: expect.arrayContaining(['no-longer-builds']) });
    expect(await main(h)).not.toContain('abbrev link_two');
    expect((await h.shadow().commits()).slice(-2).map((c) => [c.kind, c.label])).toEqual([
      ['decision', expect.stringContaining('Your decision')],
      ['decision', 'telelean took out what no longer passes'],
    ]);
    expect(session(h).judged).toMatchObject({ ok: true, commit: session(h).head });
    expect(session(h).heading).toBeUndefined();
    await consistent(h);
  });

  it('if B plus the accepted items still fail, the stage is headed "did not pass": no Accept, the declines stay (§3.6, ES-4)', async () => {
    const { h, runId } = await pgStage();
    ok(await h.manager.reveal(runId, 1, 'show-result'));
    // From now on the state does not build, in a declaration no item owns (B's own axiom).
    h.engine.onJudge = (ctx) => fakeStageJudge(ctx, errorAt('axiom cynder_dark_past.holds'));
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'declined', { option: 'reject' })], false));
    await settled(h);
    expect(session(h).judged?.ok).toBe(false);
    // 2e's review R1-1 (builder 2f): the heading has its own text, which blames no step (no step ran), and the Accept
    // refusal under it starts with the same words.
    expect(session(h).heading).toMatchObject({ kind: 'did-not-pass', text: DECISIONS_DID_NOT_PASS });
    expect(session(h).heading?.text).not.toContain("Claude's step");
    expect(DECIDED_DID_NOT_PASS.startsWith(`${DECISIONS_DID_NOT_PASS}:`)).toBe(true);
    expect(h.manager.session()?.heading).toMatchObject({ kind: 'did-not-pass', text: DECISIONS_DID_NOT_PASS });
    expect(await h.manager.decide(runId, 1, true, [decision(h, PG, 'accepted')], false)).toMatchObject({ ok: false, code: 'refused', error: DECIDED_DID_NOT_PASS });
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'declined', { option: 'shaky' })], false));
    expect(record(h, PG).status).toBe('declined');
  });
});

describe('the view version (F17)', () => {
  it('a judge-apply that changes only hidden content (a hidden Result checked again with another verdict) raises no version: the view is the same', async () => {
    const { h } = await pgStage();
    expect(h.manager.session()?.results.shown).toBe(false);
    const before = h.manager.session();
    const version = session(h).viewVersion;
    const result = record(h, RESULT);
    // White box: a judge on the same head finds T merely proved (RV-11 returns the hidden Result, rev + 1).
    const { release, started } = heldJudge(h, (j) => ({ ...j, inferences: { ...j.inferences, [T]: { ...(j.inferences[T] as NonNullable<StateJudgement['inferences'][string]>), verdict: 'proved' } } }));
    const judging = internals(h).judgeHead(internals(h).run, { decided: true });
    await started();
    release();
    await judging;
    await settled(h);
    expect(record(h, RESULT)).toMatchObject({ rev: result.rev + 1, markers: expect.arrayContaining(['updated']), judged: { verdict: 'proved' } });
    expect(session(h).viewVersion).toBe(version);
    expect(JSON.stringify(h.manager.session())).toBe(JSON.stringify(before));
  });
});

describe('the refusals (§2.4, §2.6, A-F4)', () => {
  it('a stale stage is `conflict`; with no stage judgement to read (its judge threw) every review action is refused, fail closed', async () => {
    const { h, runId } = await pgStage();
    const stale = { ok: false, code: 'conflict', error: REVIEW_TEXTS.historyChanged };
    expect(await h.manager.decide(runId, 2, true, [decision(h, PG, 'accepted')], false)).toEqual(stale);
    expect(await h.manager.reveal(runId, 0, 'show-result')).toEqual(stale);
    expect(await h.manager.submit(runId, 2)).toEqual(stale);
    expect(await h.manager.sessionDiff(runId, 2, true)).toEqual(stale);
    expect(await h.manager.decide('no-such-run', 1, true, [decision(h, PG, 'accepted')], false)).toMatchObject({ ok: false });
    // A queue whose judge throws: the stage opens with no judgement.
    const s2 = harness({ script: [pgScript('proved')] });
    s2.engine.onJudge = async () => {
      throw new Error('the judge broke');
    };
    expect(await s2.manager.start(START)).toMatchObject({ ok: true });
    const v = await waitForStage(s2.manager, 1);
    const before = rawRun(s2).session;
    expect(before?.judged).toBeUndefined();
    const none = { ok: false, code: 'conflict', error: NO_JUDGEMENT };
    expect(before?.items).toEqual([]);
    expect(await s2.manager.decide(v.runId, 1, true, [{ item: 'it0000000000000000', rev: 1, to: 'accepted' }], false)).toEqual(none);
    expect(await s2.manager.reveal(v.runId, 1, 'show-result')).toEqual(none);
    expect(await s2.manager.undoSession(v.runId, 1, false)).toEqual(none);
    expect(await s2.manager.submit(v.runId, 1)).toEqual(none);
    expect(await s2.manager.sessionDiff(v.runId, 1, true)).toEqual(none);
    expect(rawRun(s2).session).toEqual(before);
  });

  it('a decision whose first write (run.json with inFlight) fails is refused, and nothing changes; a group Accept that takes nothing makes no stack step', async () => {
    const { h, runId } = await pgStage();
    const before = rawRun(h).session;
    const files = await h.shadow().currentFiles();
    const real = RunFiles.prototype.writeStateChecked;
    vi.spyOn(RunFiles.prototype, 'writeStateChecked').mockImplementation(async function (this: RunFiles, text: string) {
      if (text.includes('"inFlight"')) throw new Error('disk full (test)');
      return real.call(this, text);
    });
    expect(await h.manager.decide(runId, 1, true, [decision(h, PG, 'declined', { option: 'reject' })], false)).toEqual({ ok: false, code: 'internal', error: REVIEW_TEXTS.saveFailed('disk full (test)') });
    vi.restoreAllMocks();
    expect(rawRun(h).session).toEqual(before);
    expect(await h.shadow().currentFiles()).toEqual(files);
    // pg is a belief: a group Accept leaves it, saying why, and records nothing.
    expect(await h.manager.decide(runId, 1, false, [decision(h, PG, 'accepted')], false)).toMatchObject({ ok: true, review: { taken: [], left: [{ item: record(h, PG).id, reason: 'own-accept' }] } });
    expect(rawRun(h).session).toEqual(before);
  });
});

describe('a decision\'s judge never acts while a step runs (D2-62, builder 2e)', () => {
  it('a judge of a decision found when a queue has started (white box) stops before it judges; the queue\'s end judges', async () => {
    const h = harness({ script: [pgScript('proved'), { match: `rework “${T}” after the review`, steps: [step.check(), { kind: 'sleep', ms: 60_000 }] }] });
    expect(await h.manager.start(START)).toMatchObject({ ok: true });
    const { runId } = await waitForStage(h.manager, 1);
    await settled(h);
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'declined', { option: 'shaky' })], false));
    ok(await h.manager.submit(runId, 1));
    const working = await waitForRun(h.manager, (v) => v.state === 'working' && v.counters.checks === 1);
    const judges = h.engine.methods().filter((m) => m === 'judge').length;
    const before = rawRun(h).session;
    await internals(h).judgeHead(internals(h).run, { decided: true });
    expect(h.engine.methods().filter((m) => m === 'judge').length).toBe(judges);
    expect(rawRun(h).session?.items).toEqual(before?.items);
    expect(rawRun(h).session?.judged).toEqual(before?.judged);
    ok(await h.manager.cancel(working.runId));
    await waitForStage(h.manager, 1);
    expect(h.engine.methods().filter((m) => m === 'judge').length).toBe(judges + 1);
    // ES-4: Cancel step of a Submit queue returns to the submitted stage (no new stage), with Retry step.
    expect(session(h)).toMatchObject({ stage: 1, phase: 'stage', retry: ['s2'], heading: { kind: 'cancelled' } });
    expect(h.manager.session()?.heading?.retry).toEqual({ ok: true });
  });
});

describe('what the confirmation says (§3.6, §5.12, D2-64)', () => {
  it('Reject, Shaky, back to review, an Undo and a Redo each ask with their own lead-in; hidden, the hidden-results sentence follows', async () => {
    const { h, runId } = await pgStage();
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'accepted')], false));
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'accepted')], false));
    const lead = async (o: Promise<ActionOutcome>) => {
      const x = await o;
      return x.ok ? 'ok' : `${x.code}: ${x.error}`;
    };
    expect(await lead(h.manager.decide(runId, 1, true, [decision(h, PG, 'declined', { option: 'reject' })], false))).toBe(`needs-confirmation: ${REVIEW_TEXTS.cascadeReject}`);
    expect(await lead(h.manager.decide(runId, 1, true, [decision(h, PG, 'declined', { option: 'shaky' })], false))).toBe(`needs-confirmation: ${REVIEW_TEXTS.cascadeShaky}`);
    expect(await lead(h.manager.decide(runId, 1, true, [decision(h, PG, 'in-review')], false))).toBe(`needs-confirmation: ${REVIEW_TEXTS.cascadeBackToReview}`);
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'declined', { option: 'reject' })], true));
    await settled(h);
    const reject = session(h).stack.done.at(-1);
    ok(await h.manager.undoSession(runId, reject?.id ?? -1, false));
    await settled(h);
    // The Redo sends the Reject again: it asks as the Reject did.
    expect(await lead(h.manager.redoSession(runId, session(h).stack.undone.at(-1)?.id ?? -1, false))).toBe(`needs-confirmation: ${REVIEW_TEXTS.cascadeReject}`);
    // Hidden (the chain: a statement still in review), an Undo that takes an Accept away asks with the sentence.
    const { h: c, runId: chain } = await chainStage();
    ok(await c.manager.decide(chain, 1, true, [decision(c, 'card:link-one', 'accepted')], false));
    expect(c.manager.session()?.results.shown).toBe(false);
    expect(await lead(c.manager.undoSession(chain, session(c).stack.done.at(-1)?.id ?? -1, false))).toBe(`needs-confirmation: ${REVIEW_TEXTS.cascadeUndoAccept} ${REVIEW_TEXTS.cascadeHiddenResults}`);
  });
});

describe('the "did not pass" heading of a decision (fixer 2e r1: A-F2, F-FC-1, A-F10)', () => {
  /** A judge on which the state does not build, in a declaration no item owns (B's own axiom). */
  const failing = (h: Harness) => (h.engine.onJudge = (ctx) => fakeStageJudge(ctx, errorAt('axiom cynder_dark_past.holds')));
  const passing = (h: Harness) => (h.engine.onJudge = (ctx) => fakeStageJudge(ctx));

  it('a later decision whose judge passes lifts it: the heading is gone and an Accept goes through again; while it stands, the refusal does not blame a step', async () => {
    const { h, runId } = await pgStage();
    ok(await h.manager.reveal(runId, 1, 'show-result'));
    failing(h);
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'declined', { option: 'reject' })], false));
    await settled(h);
    expect(session(h).heading).toMatchObject({ kind: 'did-not-pass' });
    expect(session(h).decidedHeading).toEqual({ under: null });
    expect(await h.manager.decide(runId, 1, true, [decision(h, PG, 'accepted')], false)).toEqual({ ok: false, code: 'refused', error: DECIDED_DID_NOT_PASS });
    // The Undo of the Reject puts the state back, and its judge passes.
    passing(h);
    const reject = session(h).stack.done.at(-1);
    ok(await h.manager.undoSession(runId, reject?.id ?? -1, false));
    await settled(h);
    expect(session(h).judged?.ok).toBe(true);
    expect(session(h).heading).toBeUndefined();
    expect(session(h).decidedHeading).toBeUndefined();
    expect(h.manager.session()?.heading).toBeNull();
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'accepted')], false));
    expect(record(h, PG).status).toBe('accepted');
  });

  it('it puts back the heading it replaced: a cancelled Submit step\'s, with its Retry', async () => {
    const h = harness({ script: [pgScript('proved'), { match: `rework “${T}” after the review`, steps: [step.check(), { kind: 'sleep', ms: 60_000 }] }] });
    expect(await h.manager.start(START)).toMatchObject({ ok: true });
    const { runId } = await waitForStage(h.manager, 1);
    await settled(h);
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'declined', { option: 'shaky' })], false));
    ok(await h.manager.submit(runId, 1));
    await waitForRun(h.manager, (v) => v.state === 'working' && v.counters.checks === 1);
    ok(await h.manager.cancel(runId));
    await waitForStage(h.manager, 1);
    await settled(h);
    const cancelled = session(h).heading;
    expect(cancelled).toMatchObject({ kind: 'cancelled', retry: { ok: true } });
    ok(await h.manager.reveal(runId, 1, 'show-result'));
    failing(h);
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'declined', { option: 'reject' })], false));
    await settled(h);
    expect(session(h).heading).toMatchObject({ kind: 'did-not-pass', retry: { ok: true } });
    expect(session(h).decidedHeading).toEqual({ under: cancelled });
    expect(session(h).retry).toEqual(['s2']);
    passing(h);
    ok(await h.manager.undoSession(runId, session(h).stack.done.at(-1)?.id ?? -1, false));
    await settled(h);
    expect(session(h).heading).toEqual(cancelled);
    expect(session(h).decidedHeading).toBeUndefined();
    expect(h.manager.session()?.heading).toMatchObject({ kind: 'cancelled', retry: { ok: true } });
    expect(session(h).retry).toEqual(['s2']);
  });

  it('a judge that is not a decision\'s (a plain re-check, or a queue\'s end with no failed step) sets no heading, though its state does not pass', async () => {
    const h = harness({ script: [pgScript('proved')] });
    // The queue's end judges a state that does not build: no step failed, so no heading.
    failing(h);
    expect(await h.manager.start(START)).toMatchObject({ ok: true });
    await waitForStage(h.manager, 1);
    await settled(h);
    expect(session(h).judged?.ok).toBe(false);
    expect(session(h).heading).toBeUndefined();
    // A plain judge on a stage that passes, then one that does not: still no heading (only a decision's judge heads it).
    const { h: g } = await pgStage();
    failing(g);
    await internals(g).judgeHead(internals(g).run, {});
    await settled(g);
    expect(session(g).judged?.ok).toBe(false);
    expect(session(g).heading).toBeUndefined();
    expect(session(g).decidedHeading).toBeUndefined();
  });
});

describe('a judge a decision started that cannot run is fail closed (fixer 2e r1: A-F1, F-FC-2)', () => {
  it('its judge throws: the stage judgement of the older head is cleared, and every review action answers NO_JUDGEMENT; a reload judges again', async () => {
    const { h, runId } = await pgStage();
    ok(await h.manager.reveal(runId, 1, 'show-result'));
    const before0 = session(h).head;
    h.engine.onJudge = async () => {
      throw new Error('the judge broke');
    };
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'declined', { option: 'reject' })], false));
    await settled(h);
    expect(session(h).judged).toBeUndefined();
    expect(session(h).head).not.toBe(before0);
    const before = rawRun(h).session;
    const none = { ok: false, code: 'conflict', error: NO_JUDGEMENT };
    expect(await h.manager.decide(runId, 1, true, [decision(h, PG, 'accepted')], false)).toEqual(none);
    expect(await h.manager.submit(runId, 1)).toEqual(none);
    expect(await h.manager.sessionDiff(runId, 1, true)).toEqual(none);
    expect(await h.manager.undoSession(runId, session(h).stack.done.at(-1)?.id ?? -1, false)).toEqual(none);
    expect(rawRun(h).session).toEqual(before);
  });

  it('its outcome cannot be written (its judged facts): the same', async () => {
    const { h, runId } = await pgStage();
    ok(await h.manager.reveal(runId, 1, 'show-result'));
    const m = internals(h);
    let calls = 0;
    m.writeJudgedFacts = async () => {
      calls += 1;
      throw new Error('disk full (test)');
    };
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'declined', { option: 'reject' })], false));
    for (let k = 0; k < 400 && m.runtimeOf(m.run).judgement !== null; k++) await new Promise((r) => setTimeout(r, 5));
    await settled(h);
    expect(calls).toBe(1);
    expect(m.runtimeOf(m.run).judgement).toBeNull();
    expect(session(h).judged).toBeUndefined();
    const none = { ok: false, code: 'conflict', error: NO_JUDGEMENT };
    expect(await h.manager.decide(runId, 1, true, [decision(h, PG, 'accepted')], false)).toEqual(none);
    expect(await h.manager.submit(runId, 1)).toEqual(none);
  });

  it('only its step 4 could not be saved (the judgement already describes the head in memory): the judgement is kept (2e review R1-2a)', async () => {
    const { h, runId } = await pgStage();
    ok(await h.manager.reveal(runId, 1, 'show-result'));
    const m = internals(h);
    const { release, started } = heldJudge(h);
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'declined', { option: 'reject' })], false));
    await started();
    // From now on every checked run.json write fails: the judge-apply's step 4 (tried twice) cannot be saved.
    vi.spyOn(RunFiles.prototype, 'writeStateChecked').mockImplementation(async () => {
      throw new Error('disk full (test)');
    });
    release();
    for (let k = 0; k < 400 && (m.runtimeOf(m.run).judgement?.commit !== m.sessionOf(m.run).head || h.manager.session()?.judging !== false); k++) await new Promise((r) => setTimeout(r, 5));
    for (let k = 0; k < 100 && h.manager.session()?.judging !== false; k++) await new Promise((r) => setTimeout(r, 5));
    vi.restoreAllMocks();
    const s = m.sessionOf(m.run);
    // The write's in-memory records hold the judgement of the head (a reload's recover() finishes the write).
    expect(m.runtimeOf(m.run).judgement?.commit).toBe(s.head);
    expect(s.judged?.commit).toBe(s.head);
    expect(await h.manager.decide(runId, 1, true, [decision(h, PG, 'accepted')], false)).toMatchObject({ ok: true });
  });

  it('a decision\'s judge that throws while a step runs (white box: the phase turned `step` meanwhile) leaves the stage judgement alone (2e review R1-2b)', async () => {
    const { h, runId } = await pgStage();
    ok(await h.manager.reveal(runId, 1, 'show-result'));
    const m = internals(h);
    const before = m.runtimeOf(m.run).judgement;
    expect(before).not.toBeNull();
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let entered = false;
    h.engine.onJudge = async () => {
      entered = true;
      await held;
      throw new Error('the judge broke (test)');
    };
    // A decision whose write moved the head (its judge is requested inside the write and held).
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'declined', { option: 'reject' })], false));
    for (let k = 0; k < 400 && !entered; k++) await new Promise((r) => setTimeout(r, 5));
    expect(entered).toBe(true);
    const s = m.sessionOf(m.run);
    s.phase = 'step';
    release();
    for (let k = 0; k < 400 && m.runtimeOf(m.run).queuedJudges + (h.manager.session()?.judging === true ? 1 : 0) > 0; k++) await new Promise((r) => setTimeout(r, 5));
    await m.idle(m.run);
    expect(m.runtimeOf(m.run).judgement).toBe(before);
    expect(m.sessionOf(m.run).judged).toBeDefined();
    s.phase = 'stage';
  });
});

describe('Undo and the recorded badges (fixer 2e r1, A-F3: RV-7, AF13, the Undo side)', () => {
  /** A judge that classes `key` as a belief that changes what is proved (its class grew). */
  const grown = (h: Harness, key: string) => {
    h.engine.onJudge = async (ctx) => {
      const r = await fakeStageJudge(ctx);
      const j: StateJudgement = { ...r.judgement, classes: { ...r.judgement.classes, [key]: { belief: true, changesProved: true, reasons: [], complete: true } } };
      return { judgement: j, report: { ...r.report, judgement: j } };
    };
  };

  it('an Undo that restores an Accept whose class grew is refused with the rule\'s text, and nothing changes (the badges of the Accept are not read where the judgement has a class)', async () => {
    const { h, runId } = await pgStage();
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'accepted')], false));
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'declined', { option: 'shaky' })], true));
    await settled(h);
    expect(record(h, PG)).toMatchObject({ status: 'declined', decline: { option: 'shaky' } });
    const shaky = session(h).stack.done.at(-1);
    grown(h, PG);
    await internals(h).judgeHead(internals(h).run, {});
    await settled(h);
    const before = rawRun(h).session;
    const undone = await h.manager.undoSession(runId, shaky?.id ?? -1, true);
    expect(undone).toEqual({ ok: false, code: 'refused', error: REVIEW_TEXTS.leftOwnAcceptProved('Formalize “PG games cannot have characters with dark pasts”') });
    expect(rawRun(h).session).toEqual(before);
  });

  it('an Undo of a Reject whose content is out of ws/ (no class in the judgement) is not refused: the badges its Accept recorded stand in, and the next judge decides', async () => {
    const { h, runId } = await pgStage();
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'accepted')], false));
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'declined', { option: 'reject' })], true));
    await settled(h);
    const reject = session(h).stack.done.at(-1);
    // The judge classes PG as grown from now on: it is not in the judgement while its content is out, so the Undo is
    // allowed; the judge that follows returns it to review (D2-23).
    grown(h, PG);
    ok(await h.manager.undoSession(runId, reject?.id ?? -1, true));
    await settled(h);
    expect(record(h, PG).status).toBe('in-review');
  });
});

describe('the write queue\'s last write and its guards (fixer 2e r1: A-F4, A-F5, A-F6)', () => {
  const submitScript = (): FakeScriptTurn[] => [pgScript('proved'), { match: `rework “${T}” after the review`, steps: [step.check(), { kind: 'sleep', ms: 60_000 }] }];
  async function shakyStage(): Promise<{ h: Harness; runId: string }> {
    const h = harness({ script: submitScript() });
    expect(await h.manager.start(START)).toMatchObject({ ok: true });
    const { runId } = await waitForStage(h.manager, 1);
    await settled(h);
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'declined', { option: 'shaky' })], false));
    await settled(h);
    return { h, runId };
  }
  /** `finishQueueStart` held until released (white box): the Submit's queue-start is in the write queue, its phase still `stage`. */
  function heldQueueStart(h: Harness): { release: () => void; entered: () => Promise<void> } {
    const m = internals(h);
    const real = m.finishQueueStart.bind(h.manager);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let isIn = false;
    m.finishQueueStart = async (...args) => {
      isIn = true;
      await held;
      return real(...args);
    };
    return {
      release,
      entered: async () => {
        for (let k = 0; k < 400 && !isIn; k++) await new Promise((r) => setTimeout(r, 5));
        expect(isIn).toBe(true);
      },
    };
  }

  it('a decision queued behind a Submit that is starting its queue is refused inside the queue (D2-62): no decision commit, nothing stacked', async () => {
    const { h, runId } = await shakyStage();
    const commits = (await h.shadow().commits()).length;
    const { release, entered } = heldQueueStart(h);
    const submit = h.manager.submit(runId, 1);
    await entered();
    const decided = h.manager.decide(runId, 1, true, [decision(h, PG, 'in-review')], false);
    release();
    expect(await submit).toMatchObject({ ok: true });
    expect(await decided).toEqual({ ok: false, code: 'refused', error: REVIEW_TEXTS.stepRunning });
    expect(stackKinds(h)).toEqual(['decide', 'seal:submit']);
    expect((await h.shadow().commits()).length).toBe(commits + 1);
  });

  it('a second Submit queued behind a Submit that is starting its queue is refused inside the queue too, and starts no second queue', async () => {
    const { h, runId } = await shakyStage();
    const { release, entered } = heldQueueStart(h);
    const first = h.manager.submit(runId, 1);
    await entered();
    // (The manager lets one action of a kind run at a time; the check inside the queue is the session's own.)
    const second = internals(h).submitNow(internals(h).run, 1);
    release();
    expect(await first).toMatchObject({ ok: true });
    expect(await second).toEqual({ ok: false, code: 'refused', error: REVIEW_TEXTS.stepRunning });
    expect(session(h).steps.map((x) => x.kind)).toEqual(['formalize', 'submit']);
    expect(stackKinds(h)).toEqual(['decide', 'seal:submit']);
  });

  it('the last write waits for a judge that is due but not started, and for a write queued behind it (white box)', async () => {
    const { h } = await pgStage();
    const m = internals(h);
    // Its wait never sees them (as if they came right after it): the checks inside the queue do.
    m.idle = async () => new Promise((r) => setTimeout(r, 5));
    const rt = m.runtimeOf(m.run);
    let ran = false;
    rt.queuedJudges = 1;
    const dueJudge = m.asLastWrite(m.run, async () => ((ran = true), { ok: true, label: 'ran', undoable: false }));
    await new Promise((r) => setTimeout(r, 120));
    expect(ran).toBe(false);
    rt.queuedJudges = 0;
    expect(await dueJudge).toEqual({ ok: true, label: 'ran', undoable: false });
    // A write queued behind it, while another holds the queue: it runs the other write first.
    const order: string[] = [];
    let releaseFirst!: () => void;
    const first = m.enqueueWrite(m.run, () => new Promise<void>((r) => (releaseFirst = r)));
    await new Promise((r) => setTimeout(r, 5));
    const last = m.asLastWrite(m.run, async () => (order.push('last'), { ok: true, label: 'ran', undoable: false }));
    await new Promise((r) => setTimeout(r, 40)); // its wait ends, its job is in the queue behind the held write
    const behind = m.enqueueWrite(m.run, async () => void order.push('behind'));
    releaseFirst();
    await first;
    await Promise.all([last, behind]);
    expect(order).toEqual(['behind', 'last']);
  });

  it('a decision whose files or commit fail after its first write: ws/ goes back to the head, nothing is recorded (a revert commit when ws/ differed)', async () => {
    for (const failing of ['files', 'commit'] as const) {
      const { h, runId } = await pgStage();
      const shadow = h.shadow();
      const before = rawRun(h).session;
      if (failing === 'files') {
        const real = shadow.writeFiles.bind(shadow);
        let failedOnce = false;
        shadow.writeFiles = async (changes) => {
          await real(changes); // half done, then the failure (once: the revert writes files too)
          if (failedOnce) return;
          failedOnce = true;
          throw new Error('disk (test)');
        };
      } else {
        const real = shadow.commit.bind(shadow);
        let failedOnce = false;
        shadow.commit = async (...args) => {
          if (args[0] === 'decision' && !failedOnce) {
            failedOnce = true;
            throw new Error('disk (test)');
          }
          return real(...args);
        };
      }
      expect(await h.manager.decide(runId, 1, true, [decision(h, PG, 'declined', { option: 'reject' })], false)).toEqual({ ok: false, code: 'internal', error: 'telelean could not carry out your decision: disk (test)' });
      expect(await main(h)).toContain('pg_no_dark_past');
      await consistent(h);
      expect(session(h).items).toEqual(before?.items);
      expect(session(h).stack).toEqual(before?.stack);
      expect(session(h).inFlight).toBeUndefined();
      toDispose.splice(0).forEach((d) => d());
    }
  });

  it('a records-only decision whose write fails is refused and leaves the session in memory as it was', async () => {
    const { h, runId } = await pgStage();
    const m = internals(h);
    const before = structuredClone(m.sessionOf(m.run));
    const real = RunFiles.prototype.writeStateChecked;
    vi.spyOn(RunFiles.prototype, 'writeStateChecked').mockImplementation(async function (this: RunFiles, text: string) {
      if (text.includes('"accepted"')) throw new Error('disk full (test)');
      return real.call(this, text);
    });
    expect(await h.manager.decide(runId, 1, true, [decision(h, PG, 'accepted')], false)).toEqual({ ok: false, code: 'internal', error: REVIEW_TEXTS.saveFailed('disk full (test)') });
    vi.restoreAllMocks();
    expect(m.sessionOf(m.run)).toEqual(before);
    expect(m.sessionOf(m.run).items.find((r) => r.key === PG)?.status).toBe('in-review');
  });
});

describe('un-reject of items declined at different commits, the diff and the confirmation\'s id (fixer 2e r1: A-F8, A-F10)', () => {
  it('a statement and its proof, rejected in two actions (the proof first) and un-rejected in one decision: both come back, no merge conflict (the commits\' inverses are merged newest first)', async () => {
    const { h, runId } = await chainStage();
    const before = await main(h);
    ok(await h.manager.reveal(runId, 1, 'show-result'));
    ok(await h.manager.decide(runId, 1, true, [decision(h, 'proof:link-two', 'declined', { option: 'reject' })], false));
    await settled(h);
    ok(await h.manager.decide(runId, 1, true, [decision(h, 'card:link-two', 'declined', { option: 'reject' })], false));
    await settled(h);
    expect(record(h, 'card:link-two').decline?.commit).not.toBe(record(h, 'proof:link-two').decline?.commit);
    expect(await main(h)).not.toContain('link_two');
    ok(await h.manager.decide(runId, 1, true, [decision(h, 'card:link-two', 'in-review'), decision(h, 'proof:link-two', 'in-review')], false));
    await settled(h);
    expect(await main(h)).toBe(before);
    expect(record(h, 'card:link-two')).toMatchObject({ status: 'in-review' });
    expect(record(h, 'proof:link-two')).toMatchObject({ status: 'in-review' });
    await consistent(h);
  });

  it('the raw diff lists the model files only (.lean), not another file the working copy changed', async () => {
    const { h, runId } = await pgStage();
    ok(await h.manager.reveal(runId, 1, 'show-result'));
    const m = internals(h);
    const shadow = h.shadow();
    await shadow.writeFiles([{ path: 'notes.txt', before: null, after: 'a note\n' }]);
    const commit = await shadow.commit('decision', 'a stray file', 0);
    m.sessionOf(m.run).head = commit.id;
    const diff = await h.manager.sessionDiff(runId, 1, false);
    expect(diff).toMatchObject({ ok: true, kind: 'diff' });
    expect('files' in diff ? diff.files.map((f) => f.path) : []).toEqual(['Model/Spyro/Main.lean']);
  });

  it('the end confirmation\'s check id follows the item statuses, not only the files (white box: the same files, another status)', async () => {
    const { h, runId } = await pgStage();
    ok(await h.manager.reveal(runId, 1, 'show-result'));
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'accepted')], false));
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'accepted')], false));
    ok(await h.manager.submit(runId, 1));
    const m = internals(h);
    const s = m.sessionOf(m.run);
    const first = s.confirmation?.checkId;
    expect(first).toMatch(/^ck[0-9a-f]{16}$/);
    s.phase = 'stage';
    delete s.confirmation;
    const result = s.items.find((r) => r.key === RESULT);
    if (result !== undefined) result.status = 'in-review';
    ok(await m.openConfirmation(m.run));
    expect(m.sessionOf(m.run).confirmation?.checkId).not.toBe(first);
  });
});

describe('Submit\'s take-out whose last write fails (fixer 2e r1, F-FC-3)', () => {
  it('answers like a decision\'s step 4 (saveFailed), starts no queue, and a judge follows on the head it moved', async () => {
    const { h, runId } = await chainStage();
    for (const key of ['card:link-one', 'card:link-two']) ok(await h.manager.decide(runId, 1, true, [decision(h, key, 'accepted')], false));
    ok(await h.manager.decide(runId, 1, true, [decision(h, 'proof:link-one', 'accepted')], false));
    ok(await h.manager.decide(runId, 1, true, [decision(h, 'proof:link-two', 'declined', { option: 'shaky' })], false));
    await settled(h);
    const m = internals(h);
    const real = m.persistStep4.bind(h.manager);
    let failed = false;
    m.persistStep4 = async (run, change) => {
      if (!failed) {
        failed = true;
        throw new Error('disk full (test)');
      }
      return real(run, change);
    };
    const judges = h.engine.methods().filter((x) => x === 'judge').length;
    expect(await h.manager.submit(runId, 1)).toEqual({ ok: false, code: 'internal', error: REVIEW_TEXTS.saveFailed('disk full (test)') });
    expect(failed).toBe(true);
    expect(m.sessionOf(m.run)).toMatchObject({ phase: 'stage', queue: [] });
    expect(m.sessionOf(m.run).steps.every((x) => x.kind === 'formalize')).toBe(true);
    for (let k = 0; k < 400 && (h.engine.methods().filter((x) => x === 'judge').length === judges || session(h).judged?.commit !== session(h).head); k++) await new Promise((r) => setTimeout(r, 5));
    await settled(h);
    expect(h.engine.methods().filter((x) => x === 'judge').length).toBe(judges + 1);
    expect(session(h).judged?.commit).toBe(session(h).head);
  });
});
