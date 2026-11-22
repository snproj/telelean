/**
 * Slice 2e (docs/slice2-plan.md 3.7, 6.1's 2e list): Submit review (RV-12), with the FakeBackend and the fake engine (its
 * stage judge is core `judgeState` on fake facts; where a test needs Claude's step judged by a rule, the fake gate runs
 * core's own rule too: `rulesGate`):
 *   - Shaky with a note, then Submit: one step per affected inference, sources first, the take-out first (D2-57); the
 *     feedback turn matches a golden file; the stage number rises when the queue ends;
 *   - an identical Shaky set gives `rejected-repeat` (a counted attempt); with `no_alternative` it returns to review
 *     marked "no alternative found", can be accepted, and the next Submit asks Claude nothing (F5): the end
 *     confirmation, with no seal (D2-54); Undo stops at the Submit seal, a stale step gives `conflict`;
 *   - an exact repeat of a rejected version gives `rejected-repeat`; a reworded one comes back "updated", and un-reject
 *     of the rejected version is then refused (DO-1); the Result its Reject took out stays to be redone through the
 *     judge, and its Submit step reworks it (AF1);
 *   - a rejected Result stays declined through the judge and can be un-rejected (AF1);
 *   - two targets sharing a source declined as Shaky: the second's Result taken out first, the first's step first, the
 *     source's statement reworked, both proved again (D2-57);
 *   - Submit refuses a partly accepted cycle, with its text (§4.5);
 *   - Undo of a Reject, then a Submit queue, then the end confirmation: every state passes (F4; Apply is 2f's).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { REVIEW_TEXTS, type ActionOutcome, type StateJudgement } from '@telelean/core';

import { FakeBackend } from '../../src/llm/fake.js';
import { playFakeScript } from '../../src/llm/fakeScripts.js';
import type { LlmBackend, LlmSession, SessionConfig } from '../../src/llm/types.js';
import { makeHarness, rawRun, rawStep, round1, START, step, waitForStage, type Harness } from './helpers/harness.js';
import {
  consistent,
  decision,
  finishNoAlternative,
  GOAL_PROOF_AXIOMS,
  main,
  PG,
  PG_BLOCK_END,
  PG_FORMALISED,
  pgScript,
  record,
  RESULT,
  rulesGate,
  session,
  settled,
  sharedModel,
  stackKinds,
  T,
} from './helpers/review.js';
import { chainModel, CHAIN, GOAL_LINE, GOAL_PROOF, LINK_TWO_PROOF, proveGoal, proveLinkOne, proveLinkTwo, stepMatch } from './helpers/sessions.js';

const toDispose: Array<() => void> = [];
afterEach(() => {
  for (const d of toDispose.splice(0)) d();
});

function harness(script: Parameters<typeof makeHarness>[0] = {}): Harness {
  const h = makeHarness(script);
  toDispose.push(() => h.dispose());
  return h;
}

const ok = (o: ActionOutcome) => expect(o).toMatchObject({ ok: true });
const GOLDEN = fileURLToPath(new URL('./fixtures/sessions/submit-feedback-turn.txt', import.meta.url));
const rework = (target: string) => `rework “${target}” after the review`;
/** T's proof from pg-no-dark-past's statement (helpers/review.ts's GOAL_PROOF; this file's GOAL_PROOF is the chain's). */
const GOAL_FROM_PG = 'theorem cynder_not_good.holds : cynder_not_good := pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n';
/** pg-no-dark-past's statement reworded (the arguments in the other order): another version of the same item. */
const PG_REWORDED = PG_FORMALISED.replace('∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ GoodAddition c g', '∀ (c : Character) (g : Game), HasDarkPast c → IsPG g → ¬ GoodAddition c g');

describe('Submit review: the queue, the take-out and the feedback turn (§3.7, D2-2, D2-57)', () => {
  it('Shaky with a note, then Submit: one step per affected inference, sources first; the take-out first; the feedback turn matches a golden file; the stage rises when the queue ends', async () => {
    const NEW_PROOF = 'theorem link_two.holds : link_two := And.intro link_one.holds new_spyro_pg.holds\n';
    const h = harness({
      source: chainModel(),
      withFacts: false,
      script: [
        proveLinkOne(),
        proveLinkTwo(),
        proveGoal(),
        { match: rework('link-two'), steps: [step.freeze('link-two'), step.edit(LINK_TWO_PROOF, NEW_PROOF), step.finish('proved', 'Reworked with And.intro.'), step.result()] },
        { match: rework(T), steps: [step.freeze(T), step.edit(GOAL_LINE, GOAL_LINE + GOAL_PROOF), step.finish('proved', 'Proved again.'), step.result()] },
      ],
    });
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: CHAIN })).toMatchObject({ ok: true });
    const { runId } = await waitForStage(h.manager, 1);
    await settled(h);
    // Nothing listed may be in review: the two statements are.
    expect(await h.manager.submit(runId, 1)).toEqual({ ok: false, code: 'refused', error: REVIEW_TEXTS.submitInReview(2) });
    ok(await h.manager.decide(runId, 1, true, [decision(h, 'card:link-one', 'accepted')], false));
    ok(await h.manager.decide(runId, 1, true, [decision(h, 'card:link-two', 'accepted')], false));
    expect(h.manager.session()?.results.shown).toBe(true);
    ok(await h.manager.decide(runId, 1, true, [decision(h, 'proof:link-one', 'accepted')], false));
    const note = 'Use And.intro instead of the anonymous constructor.';
    ok(await h.manager.decide(runId, 1, true, [decision(h, 'proof:link-two', 'declined', { option: 'shaky', note })], false));
    await settled(h);
    expect(record(h, RESULT)).toMatchObject({ status: 'to-be-redone', redo: { reverted: false } });
    expect(h.manager.session()?.submit).toMatchObject({ gate: { ok: true }, next: 'claude-steps', work: { shaky: 1, redo: 1, steps: 2 } });
    const commits = (await h.shadow().commits()).length;
    ok(await h.manager.submit(runId, 1));
    await waitForStage(h.manager, 2);
    const s = session(h);
    expect(s.stage).toBe(2);
    expect(s.steps.slice(3).map((x) => [x.id, x.kind, x.target, x.queue, x.state, x.scope.openProof, x.scope.openItems])).toEqual([
      ['s4', 'submit', 'link-two', 2, 'passed', true, ['proof:link-two']],
      ['s5', 'submit', T, 2, 'passed', true, [RESULT]],
    ]);
    expect(stackKinds(h).at(-1)).toBe('seal:submit');
    // D2-57: the goal's Result rests on link-two's, which s4 opens: taken out first, in one decision commit before s4's S₀.
    const all = await h.shadow().commits();
    const takeOut = all[commits];
    expect(takeOut).toMatchObject({ kind: 'decision', label: 'Submit review: taken out first, for the steps that rework what they rest on' });
    expect(all[commits + 1]?.id).toBe(s.steps[3]?.startCommit);
    expect((await h.shadow().filesAt(takeOut?.id ?? '')).get('Model/Spyro/Main.lean')).not.toContain('theorem cynder_not_good.holds');
    // The feedback turn, then s4's own turn, in one message; s5's turn has no feedback.
    const played = h.player?.played ?? [];
    const turn = played[3]?.turn ?? '';
    if (process.env['UPDATE_GOLDEN'] === '1') {
      mkdirSync(fileURLToPath(new URL('./fixtures/sessions/', import.meta.url)), { recursive: true });
      writeFileSync(GOLDEN, turn);
    }
    expect(turn).toBe(readFileSync(GOLDEN, 'utf8'));
    expect(played[4]?.turn.split('\n')[0]).toBe('Step 2 of 2: rework “cynder-not-good” after the review');
    // The queue's end (F5): the reworked Shaky Result is back in review, updated; the goal's, proposed again the same.
    expect(record(h, 'proof:link-two')).toMatchObject({ status: 'in-review', rev: 2, markers: expect.arrayContaining(['updated']) });
    expect(record(h, 'proof:link-two').decline).toBeUndefined();
    expect(record(h, RESULT)).toMatchObject({ status: 'in-review' });
    expect(record(h, RESULT).redo).toBeUndefined();
    expect(await main(h)).toContain(GOAL_PROOF);
    expect(await main(h)).toContain(NEW_PROOF);
    expect(session(h).judged?.ok).toBe(true);
    await consistent(h);
  });

  it('two targets share a source whose Formalize item came from the first target\'s step, declined as Shaky: the second\'s Result is taken out first, the first\'s step runs first and rewords the source, and both are proved again', async () => {
    const LINK_BLOCK = 'natural_name: Cynder has a past that PG games exclude\npremises: pg-no-dark-past\nasserted: 2026-11-01\n-/\n';
    // Its statement mentions a game, so the proof may rest on Game.exists (pg's statement quantifies over games).
    const LINK = '/-- Cynder has a past that PG games exclude -/\nabbrev link_one : Prop := IsPG newSpyro → HasDarkPast cynder\n';
    const linkProof = (args: string) => `theorem link_one.holds : link_one := (pg_no_dark_past.holds ${args}).elim\n`;
    const goalProof = (args: string) => `theorem cynder_not_good.holds : cynder_not_good := fun _ => (pg_no_dark_past.holds ${args}).elim\n`;
    const h = harness({
      source: sharedModel(),
      withFacts: false,
      script: [
        {
          match: stepMatch(1, 2, 'link-one'),
          steps: [step.edit(PG_BLOCK_END, PG_FORMALISED), step.edit(LINK_BLOCK, LINK_BLOCK + LINK), step.freeze('link-one'), step.edit(LINK, LINK + linkProof('newSpyro cynder')), step.finish('proved'), step.result()],
        },
        { match: stepMatch(2, 2, T), steps: [step.freeze(), step.edit(GOAL_LINE, GOAL_LINE + goalProof('newSpyro cynder')), step.finish('proved'), step.result()] },
        {
          match: rework('link-one'),
          steps: [step.edit(PG_FORMALISED, PG_REWORDED), step.freeze('link-one'), step.edit(linkProof('newSpyro cynder'), linkProof('cynder newSpyro')), step.finish('proved', 'Reworded.'), step.result()],
        },
        { match: rework(T), steps: [step.freeze(), step.edit(GOAL_LINE, GOAL_LINE + goalProof('cynder newSpyro')), step.finish('proved', 'Proved again.'), step.result()] },
      ],
    });
    const inferences = [
      { target: 'link-one', premises: ['pg-no-dark-past'] },
      { target: T, premises: ['pg-no-dark-past'] },
    ];
    expect(await h.manager.formalize({ subject: 'Spyro', inferences })).toMatchObject({ ok: true });
    const { runId } = await waitForStage(h.manager, 1);
    await settled(h);
    expect(record(h, PG).origin).toMatchObject({ step: 's1', target: 'link-one', phase: 'statements' });
    ok(await h.manager.decide(runId, 1, true, [decision(h, 'card:link-one', 'accepted')], false));
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'declined', { option: 'shaky', note: 'State it for PG games only.' })], false));
    await settled(h);
    for (const key of ['proof:link-one', RESULT]) expect(record(h, key)).toMatchObject({ status: 'to-be-redone', redo: { reverted: false } });
    expect(h.manager.session()?.results.shown).toBe(true);
    // The second target's Result declined as Shaky too, with a note: Submit takes it out all the same, keeping both.
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'declined', { option: 'shaky', note: 'Prove it from the reworded rule.' })], false));
    const commits = (await h.shadow().commits()).length;
    ok(await h.manager.submit(runId, 1));
    await waitForStage(h.manager, 2);
    const s = session(h);
    expect(s.steps.slice(2).map((x) => [x.id, x.target, x.scope.openItems])).toEqual([
      ['s3', 'link-one', [PG, 'proof:link-one']],
      ['s4', T, [RESULT]],
    ]);
    // Taken out first: the second target's Result (it rests on pg, which s3 opens); the first's stays (its own step).
    const s3Start = await h.shadow().filesAt(s.steps[2]?.startCommit ?? '');
    expect((await h.shadow().commits())[commits]?.kind).toBe('decision');
    expect(s3Start.get('Model/Spyro/Main.lean')).not.toContain('theorem cynder_not_good.holds');
    expect(s3Start.get('Model/Spyro/Main.lean')).toContain('theorem link_one.holds');
    // A Shaky item taken out keeps its decline and note, and the feedback turn quotes it under SHAKY with what it rests on.
    const turn = h.player?.played[2]?.turn ?? '';
    expect(turn.startsWith('Review submitted (stage 1)')).toBe(true);
    const shaky = turn.slice(turn.indexOf('SHAKY:'), turn.indexOf('TO BE REDONE:'));
    expect(shaky).toContain('- Result “Cynder would not be a good addition to the new Spyro game”\n');
    expect(shaky).toContain('  The person\'s note: "Prove it from the reworded rule."\n  It relied on: Formalize “PG games cannot have characters with dark pasts”\n');
    // The rework reworded the source; both targets are proved again; every reworked item is back in review.
    const text = await main(h);
    expect(text).toContain(PG_REWORDED.split('\n')[4]);
    expect(text).toContain(goalProof('cynder newSpyro'));
    expect(text).toContain(linkProof('cynder newSpyro'));
    expect(record(h, PG)).toMatchObject({ status: 'in-review', rev: 2, markers: expect.arrayContaining(['updated']) });
    expect(record(h, 'proof:link-one').status).toBe('in-review');
    expect(record(h, RESULT).status).toBe('in-review');
    expect(session(h).judged?.ok).toBe(true);
    await consistent(h);
  });
});

describe('Shaky sets and repeats at a Submit step\'s gate (DO-1, DO-3, F5, AF1)', () => {
  it('an identical Shaky set gives `rejected-repeat` (a counted attempt); with no_alternative it returns to review marked "no alternative found", can be accepted, and the next Submit asks Claude nothing; Undo stops at the seal', async () => {
    const h = harness({
      script: [pgScript('proved'), { match: rework(T), steps: [step.freeze(), step.finish('proved', 'The same again.'), finishNoAlternative('proved'), step.result()] }],
    });
    const gates = rulesGate(h, ['rejected-repeat']);
    expect(await h.manager.start(START)).toMatchObject({ ok: true });
    const { runId } = await waitForStage(h.manager, 1);
    await settled(h);
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'declined', { option: 'shaky', note: 'Is it a rule or a fact?' })], false));
    await settled(h);
    expect(record(h, RESULT)).toMatchObject({ status: 'to-be-redone', redo: { reverted: false } });
    ok(await h.manager.submit(runId, 1));
    await waitForStage(h.manager, 2);
    const s2 = session(h).steps[1];
    expect(s2).toMatchObject({ kind: 'submit', state: 'passed', counters: { gateAttempts: 2 }, lastFinish: { no_alternative: true } });
    expect(gates.at(-2)?.map((f) => [f.code, f.token])).toEqual([['rejected-repeat', 'shaky-identical']]);
    expect(gates.at(-1)).toEqual([]);
    // F5: back in review, unchanged (no "updated"), marked "no alternative found"; the Shaky decline is gone.
    for (const key of [PG, RESULT]) {
      const r = record(h, key);
      expect(r).toMatchObject({ status: 'in-review', rev: 1, markers: expect.arrayContaining(['no-alternative-found']) });
      expect(r.markers).not.toContain('updated');
      expect(r.decline).toBeUndefined();
    }
    // UN-5: Undo stops at the Submit seal (no Undo offered); a stale step gives `conflict`.
    const view = h.manager.session();
    expect(view?.undo).toBeNull();
    expect(view?.sealed).toMatchObject({ by: 'submit' });
    const seal = session(h).stack.done.at(-1);
    expect(await h.manager.undoSession(runId, seal?.id ?? -1, false)).toEqual({ ok: false, code: 'refused', error: REVIEW_TEXTS.sealed });
    expect(await h.manager.undoSession(runId, (seal?.id ?? 0) - 1, false)).toEqual({ ok: false, code: 'conflict', error: REVIEW_TEXTS.historyChanged });
    // Accepted, nothing is Shaky or to be redone: the next Submit is the end confirmation, with no step and no seal.
    ok(await h.manager.decide(runId, 2, true, [decision(h, PG, 'accepted')], false));
    ok(await h.manager.decide(runId, 2, true, [decision(h, RESULT, 'accepted')], false));
    const kinds = stackKinds(h);
    const steps = session(h).steps.length;
    expect(await h.manager.submit(runId, 2)).toEqual({ ok: true, label: REVIEW_TEXTS.confirmingPhase, undoable: false });
    expect(session(h)).toMatchObject({ phase: 'confirming', confirmation: { state: 'running', failures: [] } });
    expect(session(h).steps).toHaveLength(steps);
    expect(stackKinds(h)).toEqual(kinds);
    // A review action in the confirmation is refused (Back to review first).
    expect(await h.manager.decide(runId, 2, true, [decision(h, PG, 'in-review')], false)).toEqual({ ok: false, code: 'conflict', error: REVIEW_TEXTS.formalizeConfirming });
  });

  it('an exact repeat of a rejected version gives `rejected-repeat`; a reworded one comes back "updated", and un-reject of the rejected version is refused; the Result the Reject took out stays to be redone through the judge, and its step reworks it (AF1)', async () => {
    const h = harness({
      script: [
        pgScript('proved'),
        {
          match: rework(T),
          steps: [step.edit(PG_BLOCK_END, PG_FORMALISED), step.freeze(), step.edit(GOAL_LINE, GOAL_LINE + GOAL_FROM_PG), step.finish('proved', 'The same again.'), step.edit(PG_FORMALISED, PG_REWORDED), step.finish('proved', 'Reworded.'), step.result()],
        },
      ],
    });
    const gates = rulesGate(h, ['rejected-repeat']);
    expect(await h.manager.start(START)).toMatchObject({ ok: true });
    const { runId } = await waitForStage(h.manager, 1);
    await settled(h);
    const rejected = record(h, PG);
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'declined', { option: 'reject' })], false));
    await settled(h);
    // AF1: through the judge, the Reject stays, and the Result it took out stays to be redone, reverted.
    expect(record(h, PG)).toMatchObject({ status: 'declined', decline: { option: 'reject' }, rejectedFingerprints: [rejected.fingerprint] });
    expect(record(h, RESULT)).toMatchObject({ status: 'to-be-redone', redo: { reverted: true } });
    expect(await main(h)).not.toContain('pg_no_dark_past');
    expect(session(h).judged?.commit).toBe(session(h).head);
    ok(await h.manager.submit(runId, 1));
    await waitForStage(h.manager, 2);
    // The exact repeat was refused (counted); the reworded version passed.
    expect(session(h).steps[1]).toMatchObject({ kind: 'submit', state: 'passed', counters: { gateAttempts: 2 } });
    expect(session(h).steps[1]?.scope.fuzzyStatements).toContain('pg-no-dark-past');
    expect(gates.at(-2)?.map((f) => [f.code, f.token])).toEqual([['rejected-repeat', 'rejected']]);
    expect(gates.at(-1)).toEqual([]);
    // DO-1: the reworded repeat is the same item, in review, "updated"; the rejected version stays among its versions.
    const back = record(h, PG);
    expect(back).toMatchObject({ status: 'in-review', rev: 2, markers: expect.arrayContaining(['updated']) });
    expect(back.versions).toEqual([expect.objectContaining({ rev: 1, fingerprint: rejected.fingerprint, rejected: true })]);
    expect(record(h, RESULT).status).toBe('in-review');
    expect(await h.manager.decide(runId, 2, true, [{ item: back.id, rev: 1, to: 'in-review' }], false)).toEqual({ ok: false, code: 'refused', error: REVIEW_TEXTS.unrejectNewer });
    await consistent(h);
  });

  it('a rejected Result stays declined through the judge, and can be un-rejected: its proof comes back (AF1)', async () => {
    const h = harness({ script: [pgScript('proved')] });
    expect(await h.manager.start(START)).toMatchObject({ ok: true });
    const { runId } = await waitForStage(h.manager, 1);
    await settled(h);
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'accepted')], false));
    expect(h.manager.session()?.results.shown).toBe(true);
    const before = await main(h);
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'declined', { option: 'reject' })], false));
    await settled(h);
    expect(await main(h)).not.toContain('theorem cynder_not_good.holds');
    expect(record(h, RESULT)).toMatchObject({ status: 'declined', decline: { option: 'reject' } });
    expect(session(h).judged?.commit).toBe(session(h).head);
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'in-review')], false));
    await settled(h);
    expect(await main(h)).toBe(before);
    expect(record(h, RESULT)).toMatchObject({ status: 'in-review', rejectedFingerprints: [] });
    expect(record(h, RESULT).markers).not.toContain('updated');
    await consistent(h);
  });
});

describe('a Submit step\'s limits (§3.3, §3.7)', () => {
  it('a Shaky statement the proof does not rest on: its Submit step reworks it with the target\'s proof closed (openProof false), and the accepted Result stays accepted', async () => {
    const h = harness({
      script: [
        round1(step.edit(PG_BLOCK_END, PG_FORMALISED), step.freeze(), step.edit(GOAL_LINE, GOAL_LINE + GOAL_PROOF_AXIOMS), step.finish('proved', 'From the two facts.'), step.result()),
        { match: rework(T), steps: [step.edit(PG_FORMALISED, PG_REWORDED), step.freeze(), step.finish('proved', 'Reworded the rule.'), step.result()] },
      ],
    });
    expect(await h.manager.start(START)).toMatchObject({ ok: true });
    const { runId } = await waitForStage(h.manager, 1);
    await settled(h);
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'declined', { option: 'shaky', note: 'Order the arguments as in the sentence.' })], false));
    await settled(h);
    // The Result rests on nothing pg adds: it stays in review; accepted, Submit reworks pg alone.
    expect(record(h, RESULT).status).toBe('in-review');
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'accepted')], false));
    ok(await h.manager.submit(runId, 1));
    await waitForStage(h.manager, 2);
    const s2 = session(h).steps[1];
    expect(s2).toMatchObject({ kind: 'submit', state: 'passed', scope: { openProof: false, openItems: [PG] } });
    const turn = h.player?.played[1]?.turn ?? '';
    expect(turn).toContain('OPEN IN THIS STEP: new arrows into the target, proposed with propose_arrow; the items to rework: card:pg-no-dark-past.');
    expect(record(h, PG)).toMatchObject({ status: 'in-review', markers: expect.arrayContaining(['updated']) });
    expect(record(h, RESULT).status).toBe('accepted');
  });
});

describe('Submit\'s refusals and the end confirmation (§3.7, §4.5, F4)', () => {
  it('Submit refuses a cycle of items whose members are partly accepted, with its text, as the view\'s gate does', async () => {
    const h = harness({ script: [pgScript('proved')] });
    expect(await h.manager.start(START)).toMatchObject({ ok: true });
    const { runId } = await waitForStage(h.manager, 1);
    await settled(h);
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'accepted')], false));
    // From the next judge on, pg and the Result depend on each other (an SCC: white box, the judgement's edges).
    const judge = h.engine.onJudge;
    h.engine.onJudge = async (ctx) => {
      const r = await judge(ctx);
      const cyclic: StateJudgement = { ...r.judgement, deps: { ...r.judgement.deps, [PG]: [RESULT], [RESULT]: [PG] } };
      return { judgement: cyclic, report: { ...r.report, judgement: cyclic } };
    };
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'declined', { option: 'reject' })], false));
    await settled(h);
    expect(record(h, PG).status).toBe('accepted');
    expect(record(h, RESULT).status).toBe('declined');
    // In list order: the walk puts each item's dependencies first, here the Result's before pg's (the cycle's order).
    const text = REVIEW_TEXTS.acceptOrRejectTogether(['Result “Cynder would not be a good addition to the new Spyro game”', 'Formalize “PG games cannot have characters with dark pasts”']);
    expect(h.manager.session()?.submit.gate).toEqual({ ok: false, reason: text, missing: [record(h, RESULT).id] });
    const before = session(h);
    expect(await h.manager.submit(runId, 1)).toEqual({ ok: false, code: 'refused', error: text });
    expect(session(h)).toEqual(before);
  });

  it('Undo of a Reject, then a Submit queue, then the end confirmation: every judged state passes, and ws/ always holds what the records say (F4; Apply is 2f\'s)', async () => {
    const h = harness({
      script: [
        pgScript('proved'),
        { match: rework(T), steps: [step.edit(PG_FORMALISED, PG_REWORDED), step.freeze(), step.finish('proved', 'Reworded.'), step.result()] },
      ],
    });
    expect(await h.manager.start(START)).toMatchObject({ ok: true });
    const { runId } = await waitForStage(h.manager, 1);
    await settled(h);
    const before = await main(h);
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'declined', { option: 'reject' })], false));
    await settled(h);
    const reject = session(h).stack.done.at(-1);
    ok(await h.manager.undoSession(runId, reject?.id ?? -1, false));
    await settled(h);
    expect(await main(h)).toBe(before);
    expect(record(h, PG)).toMatchObject({ status: 'in-review', rejectedFingerprints: [] });
    expect(session(h).judged).toMatchObject({ ok: true, commit: session(h).head });
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'declined', { option: 'shaky', note: 'Order the arguments as in the sentence.' })], false));
    ok(await h.manager.submit(runId, 1));
    await waitForStage(h.manager, 2);
    expect(session(h).judged).toMatchObject({ ok: true, commit: session(h).head });
    expect(record(h, PG)).toMatchObject({ status: 'in-review', markers: expect.arrayContaining(['updated']) });
    ok(await h.manager.decide(runId, 2, true, [decision(h, PG, 'accepted')], false));
    ok(await h.manager.decide(runId, 2, true, [decision(h, RESULT, 'accepted')], false));
    await settled(h);
    ok(await h.manager.submit(runId, 2));
    expect(session(h).phase).toBe('confirming');
    expect(await main(h)).toContain(PG_REWORDED.split('\n')[4]);
    await consistent(h);
  });
});

describe('a Submit whose first step cannot start (fixer 2e r1, A-F9; as 2d\'s R1-3 for Resume)', () => {
  it('answers why, not "Claude is working": the step waits interrupted with the feedback turn kept, and Resume sends it', async () => {
    const player = playFakeScript([pgScript('proved'), { match: rework(T), steps: [step.freeze(T), step.finish('not_proved', 'Not now.'), step.result()] }]);
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
    const h = harness({ backend });
    expect(await h.manager.start(START)).toMatchObject({ ok: true });
    const { runId } = await waitForStage(h.manager, 1);
    await settled(h);
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'declined', { option: 'shaky' })], false));
    await settled(h);
    // No live Claude session (white box: as after a reload or a process that died): the step's turn goes to a resumed one.
    (h.manager as unknown as { run: { session?: unknown } }).run.session = undefined;
    failResumes = 1;
    expect(await h.manager.submit(runId, 1)).toEqual({ ok: false, code: 'not-yet', error: 'Claude could not be resumed: the CLI could not resume' });
    expect(h.manager.current()).toMatchObject({ state: 'interrupted', canResume: true, session: { phase: 'interrupted' } });
    expect(rawStep(h, 's2')).toMatchObject({ state: 'interrupted', kind: 'submit' });
    expect(rawRun(h).undeliveredTurn?.startsWith('Review submitted (stage 1)')).toBe(true);
    expect(await h.manager.resume(runId)).toMatchObject({ ok: true });
    await waitForStage(h.manager, 2);
    expect(player.played.at(-1)?.turn.startsWith('Review submitted (stage 1)')).toBe(true);
    expect(rawRun(h).undeliveredTurn).toBeUndefined();
  });
});
