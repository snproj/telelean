/**
 * Slice 2e (docs/slice2-plan.md 4.7, 6.1's 2e list; AF5, AF7): non-interference while the results are hidden, with the
 * FakeBackend and the fake engine. Two sessions with one run id and one clock, alike but for what Claude's steps proved
 * (a fixed pair): every action on the listed items gives the same answer, the same SessionView, byte for byte, and the
 * same RunView apart from its progress counts, usage and times.
 *   - the chain's first two targets, proved or not (A12's statements-only step in the second session): Accept, Undo,
 *     Shaky, Undo, Reject, Undo, Accept, Undo on the two Formalize items;
 *   - the Retry pair: step 1 of 2 proved link-one or not (with an arrow item and a premise draft when it did), step 2
 *     was cancelled, and Retry step runs it while the results are hidden: the same items, with the same ids (AF7).
 */
import { afterEach, describe, expect, it } from 'vitest';

import { normalisationChanges, type ActionOutcome, type RunView, type SessionView } from '@telelean/core';

import type { FakeStep } from '../../src/llm/fake.js';
import type { FakeScriptTurn } from '../../src/llm/fakeScripts.js';
import { fakeModel } from './helpers/fakeEngine.js';
import { makeHarness, step, waitForRun, waitForStage, type Harness } from './helpers/harness.js';
import { arrowModel, decision, L_PROOF_B, RESULT, session, settled, T, X_BLOCK_END } from './helpers/review.js';
import { CHAIN, chainModel, failLinkOne, formalise, proveLinkOne, proveLinkTwo, stepMatch } from './helpers/sessions.js';

const toDispose: Array<() => void> = [];
afterEach(() => {
  for (const d of toDispose.splice(0)) d();
});

const NOW = () => new Date('2026-11-20T00:00:00.000Z');

function twin(script: FakeScriptTurn[], source = chainModel()): Harness {
  const h = makeHarness({ source, withFacts: false, script, newRunId: () => 'rtwin000002', now: NOW });
  toDispose.push(() => h.dispose());
  // The engine's normalise as the real one runs it before each gate (gate/engine.ts): the target's and the selected
  // premises' statements new since B pinned (core normalisationChanges). The fake's default does nothing, which would let
  // a telelean write that pins as a side effect (an arrow written into `premises:`) make one twin differ.
  h.engine.onNormalise = async (ctx) => {
    const shadow = ctx.shadow;
    const current = fakeModel(await shadow.currentFiles(), shadow.library, false);
    const base = fakeModel(await shadow.baseFiles(), shadow.library, false);
    const wanted = [...new Set([ctx.selection.target, ...ctx.selection.premises])];
    const nodeIds = wanted.filter((id) => current.nodes.get(id)?.statementDecl !== undefined && base.nodes.get(id)?.statementDecl === undefined);
    const changes = nodeIds.length > 0 ? normalisationChanges(current, nodeIds) : [];
    if (changes.length === 0) return { changes: [] };
    await shadow.writeFiles(changes);
    return { changes, commit: await shadow.commit('normalise', `Normalised (round ${ctx.round})`, ctx.round) };
  };
  return h;
}

/** The RunView without its progress counts, usage and times (AF5). */
function strip(v: RunView | null): string {
  const x = JSON.parse(JSON.stringify(v)) as Record<string, unknown>;
  for (const k of ['counters', 'usage', 'updatedAt', 'startedAt', 'endedAt']) delete x[k];
  return JSON.stringify(x);
}

/** Both sessions' views and RunViews agree while the results are hidden. */
function same(a: Harness, b: Harness, what: string): void {
  const va: SessionView | null = a.manager.session();
  const vb: SessionView | null = b.manager.session();
  expect(va?.results.shown, what).toBe(false);
  expect(JSON.stringify(vb), what).toBe(JSON.stringify(va));
  expect(strip(b.manager.current()), what).toBe(strip(a.manager.current()));
}

const A12_TURN = 'Step 2 of 2: formalize the statements of “link-two” (no proof: “link-one” was not proved)';

describe('decisions while the results are hidden: a fixed pair (§4.7, AF5)', () => {
  it('every sequence of Accept, Shaky, Reject and Undo on the listed items gives the same answers and views, whether or not Claude proved the targets', async () => {
    const proved = twin([proveLinkOne(1, 2), proveLinkTwo(2, 2)]);
    const notProved = twin([failLinkOne(1, 2), { match: A12_TURN, steps: [...formalise('link-two'), step.finish('not_proved', 'Statements only.'), step.result()] }]);
    for (const h of [proved, notProved]) {
      expect(await h.manager.formalize({ subject: 'Spyro', inferences: CHAIN.slice(0, 2) })).toMatchObject({ ok: true });
      await waitForStage(h.manager, 1);
      await settled(h);
    }
    expect(session(proved).items.some((r) => r.key === 'proof:link-one' && r.content.decls.length > 0)).toBe(true);
    same(proved, notProved, 'the stage');
    const runId = proved.manager.current()?.runId ?? '';
    type Act = (h: Harness) => Promise<ActionOutcome>;
    const undo: Act = (h) => h.manager.undoSession(runId, h.manager.session()?.undo?.step ?? -1, true);
    const back = (confirmed: boolean): Act => (h) => h.manager.decide(runId, 1, true, [decision(h, 'card:link-one', 'in-review')], confirmed);
    const acts: Array<[string, Act]> = [
      ['Accept link-one', (h) => h.manager.decide(runId, 1, true, [decision(h, 'card:link-one', 'accepted')], false)],
      // D2-64: taking an Accept away asks first while the results are hidden, naming no Result.
      ['back to review (asked)', back(false)],
      ['back to review', back(true)],
      ['Shaky link-one', (h) => h.manager.decide(runId, 1, true, [decision(h, 'card:link-one', 'declined', { option: 'shaky', note: 'Say what "exclude" means.' })], false)],
      ['Undo of the Shaky decline', undo],
      ['Reject link-one', (h) => h.manager.decide(runId, 1, true, [decision(h, 'card:link-one', 'declined', { option: 'reject' })], false)],
      ['Undo of the Reject', undo],
      // Deciding both statements would show the results (then the two sessions differ, as they should): link-one stays
      // undecided from here on.
      ['Accept link-two', (h) => h.manager.decide(runId, 1, true, [decision(h, 'card:link-two', 'accepted')], false)],
      ['Shaky link-two (its Accept taken away: asked)', (h) => h.manager.decide(runId, 1, true, [decision(h, 'card:link-two', 'declined', { option: 'shaky' })], false)],
      ['Shaky link-two', (h) => h.manager.decide(runId, 1, true, [decision(h, 'card:link-two', 'declined', { option: 'shaky' })], true)],
      ['Undo of the Shaky decline', undo],
      ['Undo of the Accept', undo],
    ];
    for (const [what, act] of acts) {
      const a = await act(proved);
      const b = await act(notProved);
      expect(JSON.stringify(b), what).toBe(JSON.stringify(a));
      if (what.includes('asked')) expect(a, what).toMatchObject({ ok: false, code: 'needs-confirmation', hiddenResults: true });
      else expect(a, what).toMatchObject({ ok: true });
      await settled(proved);
      await settled(notProved);
      same(proved, notProved, what);
    }
    // The sequence did something: the Reject's decision commit, and its Undo's, in both.
    expect((await proved.shadow().commits()).filter((c) => c.kind === 'decision').length).toBeGreaterThanOrEqual(2);
  });
});

describe('the Retry pair (§4.7, AF7)', () => {
  it('step 1 proved link-one or not (with an arrow item and a premise draft when it did), step 2 was cancelled; Retry step runs it while the results are hidden: the same views and item ids', async () => {
    const arrow: FakeStep = { kind: 'callTool', tool: 'propose_arrow', args: { source: 'new-spyro-pg', target: 'link-one', why: 'the game matters' } };
    const provedStep1 = { match: stepMatch(1, 2, 'link-one'), steps: [...formalise('link-one'), arrow, step.propose({ lean_name: 'pg_excludes' }), ...formalise('link-one', true).slice(2), step.finish('proved', 'Proved.'), step.result()] };
    const sleeping = (match: string) => ({ match, steps: [...formalise('link-two'), { kind: 'sleep' as const, ms: 60_000 }] });
    const retried = { match: stepMatch(1, 1, 'link-two'), steps: [...formalise('link-two'), step.finish('not_proved', 'Not this time.'), step.result()] };
    const proved = twin([provedStep1, sleeping(stepMatch(2, 2, 'link-two')), retried]);
    const notProved = twin([failLinkOne(1, 2), sleeping(A12_TURN), retried]);
    for (const h of [proved, notProved]) {
      expect(await h.manager.formalize({ subject: 'Spyro', inferences: CHAIN.slice(0, 2) })).toMatchObject({ ok: true });
      const working = await waitForRun(h.manager, (v) => v.step?.index === 2 && v.state === 'working' && v.counters.checks >= 1);
      expect(await h.manager.cancel(working.runId)).toMatchObject({ ok: true });
      await waitForStage(h.manager, 1);
      await settled(h);
    }
    // The proved session has the Result's parts the other lacks: an arrow item and a premise draft (hidden).
    expect(session(proved).items.map((r) => r.kind)).toEqual(expect.arrayContaining(['add-arrow', 'add-premise']));
    expect(session(notProved).items.map((r) => r.kind)).not.toContain('add-arrow');
    same(proved, notProved, 'the stage, step 2 cancelled');
    const runId = proved.manager.current()?.runId ?? '';
    for (const h of [proved, notProved]) {
      expect(await h.manager.retry(runId)).toMatchObject({ ok: true });
      await waitForStage(h.manager, 1);
      await settled(h);
    }
    expect(session(proved).steps.map((x) => [x.id, x.state])).toEqual(session(notProved).steps.map((x) => [x.id, x.state]));
    same(proved, notProved, 'after Retry step');
    // The listed items are the same records, with the same ids (AF7: the ids hash the run id and the key).
    const listed = (h: Harness) => (h.manager.session()?.items ?? []).map((i) => i.id);
    expect(listed(notProved)).toEqual(listed(proved));
    const ids = new Map(session(proved).items.map((r) => [r.key, r.id]));
    for (const r of session(notProved).items) if (ids.has(r.key)) expect(r.id).toBe(ids.get(r.key));
  });
});

describe('Claude\'s accepted arrow L → T, then Formalize X → L together with L → T (§4.7, D2-20, D2-50)', () => {
  const X_STATEMENT = '/-- Characters with dark pasts are excluded from PG games -/\nabbrev x_rule : Prop := ∀ (c : Character), HasDarkPast c → HasDarkPast c\naxiom x_rule.holds : x_rule\n';
  // From L's question alone (x-rule), so the stage judge keeps it (B.2).
  const L_PROOF_X = 'theorem cynder_excluded.holds : cynder_excluded := (x_rule.holds cynder).elim\n';
  const GOAL = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';
  const arrow: FakeStep = { kind: 'callTool', tool: 'propose_arrow', args: { source: 'cynder-excluded', target: T, why: 'it says Cynder is excluded' } };
  const queue1 = { match: 'Run: "Formalize for dependencies"', steps: [arrow, step.freeze(), step.edit(GOAL, `${GOAL}theorem cynder_not_good.holds : cynder_not_good := fun _ => cynder_excluded.holds.elim\n`), step.finish('proved', 'With the arrow.'), step.result()] };
  const lStep = (proved: boolean) => ({
    match: stepMatch(1, 2, 'cynder-excluded'),
    steps: [step.edit(X_BLOCK_END, X_BLOCK_END + X_STATEMENT), step.freeze('cynder-excluded'), ...(proved ? [step.edit(L_PROOF_B, L_PROOF_X), step.finish('proved', 'From x-rule.')] : [step.finish('not_proved', 'Not from x-rule.')]), step.result()],
  });
  const tStep = (end: 'proved' | 'not proved' | 'cancelled') => ({
    match: stepMatch(2, 2, T),
    steps: end === 'cancelled' ? [step.freeze(), { kind: 'sleep' as const, ms: 60_000 }] : [step.freeze(), step.finish(end === 'proved' ? 'proved' : 'not_proved', 'Again.'), step.result()],
  });

  for (const end of ['proved', 'not proved', 'cancelled'] as const) {
    it(`after the queue the results are hidden, and the views are the same whether L was proved or not (T's re-ask ${end})`, async () => {
      const proved = twin([queue1, lStep(true), tStep(end)], arrowModel());
      const notProved = twin([queue1, lStep(false), tStep(end)], arrowModel());
      const posts = new Map<Harness, number>();
      for (const h of [proved, notProved]) {
        expect(await h.manager.formalize({ subject: 'Spyro', inferences: [{ target: T, premises: ['cynder-dark-past'] }] })).toMatchObject({ ok: true });
        const { runId } = await waitForStage(h.manager, 1);
        await settled(h);
        expect(h.manager.session()?.results.shown).toBe(true);
        ok(await h.manager.decide(runId, 1, true, [decision(h, 'arrow:cynder-excluded>cynder-not-good', 'accepted')], false));
        ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'accepted')], false));
        // L is the source of Claude's accepted arrow into T: a new target only together with that arrow (D2-50).
        expect(await h.manager.formalize({ subject: 'Spyro', inferences: [{ target: 'cynder-excluded', premises: ['x-rule'] }], runId, stage: 1 })).toMatchObject({ ok: false, code: 'invalid' });
        const inferences = [
          { target: 'cynder-excluded', premises: ['x-rule'] },
          { target: T, premises: ['cynder-dark-past', 'cynder-excluded'] },
        ];
        // F17: the session view is posted as often in both sessions (a judge round that its reverts make run again,
        // which hidden content can decide, is never posted).
        h.manager.onDidChange((c) => {
          if (c.session) posts.set(h, (posts.get(h) ?? 0) + 1);
        });
        ok(await h.manager.formalize({ subject: 'Spyro', inferences, runId, stage: 1 }));
        if (end === 'cancelled') {
          const working = await waitForRun(h.manager, (v) => v.step?.index === 2 && v.state === 'working' && v.counters.checks >= 1);
          ok(await h.manager.cancel(working.runId));
        }
        await waitForStage(h.manager, 1);
        await settled(h);
      }
      // The two sessions did differ: L's proof.
      expect((await proved.shadow().currentFiles()).get('Model/Spyro/Main.lean')).toContain(L_PROOF_X);
      expect((await notProved.shadow().currentFiles()).get('Model/Spyro/Main.lean')).toContain(L_PROOF_B);
      expect(session(proved).steps.map((x) => [x.target, x.state])).toEqual(session(notProved).steps.map((x) => [x.target, x.state]));
      same(proved, notProved, `T's re-ask ${end}`);
      expect(posts.get(notProved)).toBe(posts.get(proved));
    });
  }
});

const ok = (o: ActionOutcome) => expect(o).toMatchObject({ ok: true });
