/**
 * Slice 2a2 (docs/slice2-plan.md 4.5, 6.1): RV-5 item dependencies on the Spyro fixture (mentions, mentioned before),
 * on synthetic drafts (Results, arrows), and what a listed item may show of them while the results are hidden.
 */
import { describe, expect, it } from 'vitest';
import { planGhostAdoption } from '../../src/gate/index.js';
import { itemDeps } from '../../src/review/deps.js';
import { computeItems } from '../../src/review/items.js';
import { reconcile } from '../../src/review/reconcile.js';
import { acceptGate, reduceReview } from '../../src/review/reducer.js';
import { depsById } from '../../src/review/records.js';
import { componentOf } from '../../src/review/scc.js';
import type { ItemDraft, LedgerEntry, ReviewState } from '../../src/review/types.js';
import { normative, pinned, proved } from '../gate/helpers/spyroRun.js';
import { AT, RUN, draft, idOf, inferenceJudgement, judgementOf, recordsOf, stateOf } from './helpers/records.js';
import { BASE, INFERENCE, MAIN, TARGET, append, created, draftOf, edit, modelOf, type Texts } from './helpers/session.js';

const RESULT = `proof:${TARGET}`;
const FORMALISED = pinned(normative(BASE));
const FORMALISED_LEDGER = [created('Spyro.pg_no_dark_past', 'statements'), created('Spyro.pg_no_dark_past.holds', 'statements')];
const TARGET_CODE = 'lean: Spyro.cynder_not_good\n-/\n/-- Cynder would not be a good addition to the new Spyro game -/\nabbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';

function depsOf(base: Texts, current: Texts, ledger: LedgerEntry[] = [], premises = [] as Parameters<typeof computeItems>[0]['premises']) {
  const B = modelOf(base);
  const W = modelOf(current);
  const { drafts, problems } = computeItems({ base: B, current: W, ledger, premises, inferences: [INFERENCE], ended: [TARGET] });
  return { drafts, problems, deps: itemDeps({ base: B, current: W, drafts, inferences: {} }) };
}

describe('mentions (§4.5, rule 1)', () => {
  it('Result -> Formalize through T.holds’s type, and through what its proof uses', () => {
    const typed = depsOf(edit(FORMALISED, MAIN, TARGET_CODE, '-/\n'), proved(FORMALISED), [created('Spyro.cynder_not_good', 'statements')]);
    expect(typed.problems).toEqual([]);
    expect(typed.deps).toEqual({ [`card:${TARGET}`]: [], [RESULT]: [`card:${TARGET}`] });
    const used = depsOf(BASE, proved(FORMALISED), FORMALISED_LEDGER);
    expect(used.deps).toEqual({ 'card:pg-no-dark-past': [], [RESULT]: ['card:pg-no-dark-past'] });
  });

  it('walks through declarations no item owns, and stops at the first item it meets', () => {
    // The new Evil uses the person's unchanged Mid, which uses X, changed in the session (its own item).
    const base = append(BASE, MAIN, 'def X (c : Character) : Prop := HasDarkPast c\ndef Mid (c : Character) : Prop := X c');
    const current = append(edit(base, MAIN, 'def X (c : Character) : Prop := HasDarkPast c', 'def X (c : Character) : Prop := HasDarkPast c ∧ True'), MAIN, 'def Evil (c : Character) : Prop := Mid c');
    const r = depsOf(base, current, [created('Spyro.Evil', 'statements')]);
    expect(r.problems).toEqual([]);
    expect(r.drafts.find((d) => d.key === 'decl:Spyro.X')?.declKind).toBe('vocabulary-change');
    expect(r.deps['decl:Spyro.Evil']).toEqual(['decl:Spyro.X']);
    expect(r.deps['decl:Spyro.X']).toEqual([]);
  });
});

describe('Results and arrows (§4.5, rules 2-4)', () => {
  const drafts: ItemDraft[] = [
    draft('proof:t', 'result'),
    draft('proof:u', 'result'),
    draft('arrow:s1>t', 'add-arrow', { partOfResult: 't', provides: { decls: [], arrows: [{ source: 's1', target: 't' }], cards: [] } }),
    draft('arrow:s2>t', 'add-arrow', { partOfResult: 't', provides: { decls: [], arrows: [{ source: 's2', target: 't' }], cards: [] } }),
    draft('premise:t:p', 'add-premise', { partOfResult: 't', provides: { decls: [], arrows: [{ source: 'pcard', target: 't' }], cards: ['pcard'] } }),
    draft('arrow:pcard>u', 'add-arrow', { partOfResult: 'u', provides: { decls: [], arrows: [{ source: 'pcard', target: 'u' }], cards: [] } }),
  ];
  const model = modelOf(BASE);

  it('Result -> Result through B.1’s session proofs; Result -> the arrow or premise item only of sources in direct(T); an arrow -> the item adding its card', () => {
    const deps = itemDeps({
      base: model,
      current: model,
      drafts,
      inferences: { t: inferenceJudgement('t', { throughResults: ['u'], direct: ['s1', 'pcard'] }), u: inferenceJudgement('u') },
    });
    expect(deps).toEqual({
      'proof:t': ['arrow:s1>t', 'premise:t:p', 'proof:u'],
      'proof:u': [],
      'arrow:s1>t': [],
      'arrow:s2>t': [],
      'premise:t:p': [],
      'arrow:pcard>u': ['premise:t:p'],
    });
  });

  it('an SCC of two Results: each is accepted one by one, blocked only by dependencies outside it (D2-26)', () => {
    const two = [draft('proof:t', 'result'), draft('proof:u', 'result'), draft('card:a', 'formalize')];
    const inferences = { t: inferenceJudgement('t', { throughResults: ['u'] }), u: inferenceJudgement('u', { throughResults: ['t'] }) };
    const deps = itemDeps({ base: model, current: model, drafts: two, inferences });
    expect(deps).toEqual({ 'proof:t': ['proof:u'], 'proof:u': ['proof:t'], 'card:a': [] });
    const component = componentOf(Object.keys(deps), (k) => deps[k] ?? []);
    expect(component.get('proof:t')).toBe(component.get('proof:u'));
    const { records } = reconcile({ runId: RUN, records: recordsOf([]), judgement: judgementOf(two, { deps, inferences }), queueSteps: ['s1'], at: AT });
    // card:a in review keeps the results hidden; accept it first, then each Result alone.
    let state: ReviewState = { ...stateOf({ items: records.items }), deps: depsById(records.items, deps) };
    const step = (key: string) => {
      const out = reduceReview(state, { kind: 'decide', decisions: [{ item: idOf(key), rev: 1, to: 'accepted' }], own: true, confirmed: false }, AT);
      if (!out.ok) throw new Error(JSON.stringify(out));
      state = { ...state, items: out.items, stack: out.stack, nextAction: out.nextAction };
    };
    step('card:a');
    step('proof:t');
    step('proof:u');
    expect(state.items.map((r) => r.status)).toEqual(['accepted', 'accepted', 'accepted']);
  });

  it('A17: an Add arrow depends on a Remove arrow on a cycle through it', () => {
    // A proposal removes new-spyro-pg -> cynder-not-good and adds cynder-not-good -> new-spyro-pg (no slice-2 step can
    // make either item; the rule holds on drafts).
    const base = modelOf(BASE);
    const withRemove = [
      draft('arrow:cynder-not-good>new-spyro-pg', 'add-arrow', { provides: { decls: [], arrows: [{ source: 'cynder-not-good', target: 'new-spyro-pg' }], cards: [] } }),
      draft('unarrow:new-spyro-pg>cynder-not-good', 'remove-arrow'),
    ];
    const deps = itemDeps({ base, current: base, drafts: withRemove, inferences: {} });
    expect(deps['arrow:cynder-not-good>new-spyro-pg']).toEqual(['unarrow:new-spyro-pg>cynder-not-good']);
  });
});

describe('mentioned before (§4.5, rule 5)', () => {
  it('a Change depends on the items whose version in B mentions what it changes', () => {
    const card = '/-\n@@ telelean v1\nid: both\ntype: PROPOSITION\nnatural_name: Both\nasserted: 2026-11-01\nlean: Spyro.both\n-/\n/-- Both -/\nabbrev both : Prop := cynder_dark_past ∧ new_spyro_pg';
    const base = append(BASE, MAIN, card);
    const current = edit(
      edit(base, MAIN, 'abbrev cynder_dark_past : Prop := HasDarkPast cynder', 'abbrev cynder_dark_past : Prop := HasDarkPast cynder ∧ True'),
      MAIN,
      'abbrev both : Prop := cynder_dark_past ∧ new_spyro_pg',
      'abbrev both : Prop := new_spyro_pg',
    );
    const r = depsOf(base, current);
    expect(r.deps['card:cynder-dark-past']).toEqual(['card:both']);
    expect(r.deps['card:both']).toEqual([]);
  });
});

describe('hidden items (§4.5)', () => {
  it('a statement that mentions a written premise card waits for the results; the hidden item is never among its blockers', () => {
    const base = edit(BASE, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'follows_from: nothing');
    const premise = draftOf({ leanName: 'cynder' });
    const key = 'premise:cynder-not-good:cynder';
    const plan = planGhostAdoption(modelOf(base), {
      subject: 'Spyro',
      target: TARGET,
      naturalName: premise.naturalName,
      leanStatement: premise.leanStatement,
      leanName: premise.leanName,
      session: 'run1',
      today: '2026-11-19',
    });
    const written = { ...base, [MAIN]: plan.changes[0]?.after as string };
    const current = edit(
      written,
      MAIN,
      'stance: rule\nasserted: 2026-11-01\n-/\n\n',
      'stance: rule\nasserted: 2026-11-01\nlean: Spyro.pg_no_dark_past\n-/\n/-- PG games cannot have characters with dark pasts -/\nabbrev pg_no_dark_past : Prop := cynder_is_evil → ∀ (c : Character), HasDarkPast c → ¬ GoodAddition c newSpyro\naxiom pg_no_dark_past.holds : pg_no_dark_past\n\n',
    );
    const ledger: LedgerEntry[] = [
      { kind: 'premise', card: plan.nodeId, target: TARGET, holdAs: 'axiom', item: key, commit: 'c1' },
      { kind: 'mark-removed', card: TARGET, item: key, commit: 'c1' },
      ...FORMALISED_LEDGER,
    ];
    const r = depsOf(base, current, ledger, [premise]);
    expect(r.problems).toEqual([]);
    expect(r.deps['card:pg-no-dark-past']).toEqual([key]);
    const { records } = reconcile({ runId: RUN, records: recordsOf([]), judgement: judgementOf(r.drafts, { deps: r.deps }), queueSteps: ['s1'], at: AT });
    // The premise was accepted and written while the results were shown; the new statement keeps them hidden now.
    const items = records.items.map((x) =>
      x.key === key ? { ...x, status: 'accepted' as const, card: plan.nodeId, accepted: { how: 'own' as const, fingerprint: x.fingerprint, belief: true, changesProved: false, at: AT, holdAs: 'axiom' as const } } : x,
    );
    const state: ReviewState = { ...stateOf({ items }), deps: depsById(items, r.deps) };
    expect(acceptGate(state, idOf('card:pg-no-dark-past'), true)).toEqual({
      ok: false,
      reason: 'blocked',
      text: 'Formalize “pg-no-dark-past” waits for the results to be shown.',
      missing: [],
    });
    // Shown, it is an ordinary dependency, accepted already.
    expect(acceptGate({ ...state, forced: { via: 'show-result', at: AT } }, idOf('card:pg-no-dark-past'), true)).toEqual({ ok: true });
  });
});
