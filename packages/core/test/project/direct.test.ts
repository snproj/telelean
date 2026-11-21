/**
 * Slice 1d (spec v4.1 B.2, B.5, BD-7; the review's S-1): direct(v) from the elaborated proof (`DeclFacts.valueConsts`),
 * the fallback to the `.ilean` references, B.2's cross-check (`uses-unseen`, TL123), TL107 without the coverage
 * exemption, and out-of-date facts along the walk. Hand-written facts (fakeFacts with `valueConsts`); the same cases
 * with real Lean 4.35 are in the runner's test/semantic/valueProbe.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { block, build, codes, graphOf, mainS, nodeOf, VOCAB_S } from './helpers/build.js';
import type { FakeFactsOptions } from './helpers/fakeFacts.js';

const VOCAB = { 'Model/S/Vocabulary.lean': VOCAB_S };
const A = [block({ id: 'a', type: 'AXIOM', name: 'A holds', rationale: 'r', lean: 'S.a' }), 'abbrev a : Prop := Good t', 'axiom a.holds : a'].join('\n');

/**
 * The S-1 trap: v's proof reaches a's `.holds` only through `good_t`, a `@[simp]` lemma no card owns, which `simp`
 * used without the proof naming it. Lean's `.ilean` references of `v.holds` name only `v`; its elaborated value names
 * `good_t`, whose value names `a.holds`; `#print axioms` sees `a.holds` either way.
 */
function simpLemma(premises: string[], options: FakeFactsOptions = {}) {
  const body = [
    A,
    '',
    '@[simp] theorem good_t : Good t = True := eq_true a.holds',
    '',
    block({ id: 'v', type: 'PROPOSITION', name: 'It is good, by simp', premises, lean: 'S.v' }),
    'abbrev v : Prop := Good t ∧ True',
    'theorem v.holds : v := by simp',
  ].join('\n');
  const axioms = ['Classical.choice', 'propext', 'S.Good', 'S.T', 'S.T.exists', 'S.a.holds'];
  return build(
    { ...VOCAB, 'Model/S/Main.lean': mainS(body) },
    {
      facts: {
        ...options,
        overrides: { 'S.v.holds': { axioms, valueConsts: ['S.v', 'S.good_t'] }, ...options.overrides },
      },
    },
  ).model;
}

describe('direct(v) from the elaborated proof (B.2, S-1)', () => {
  it('a card reached only through a @[simp] lemma the proof never names counts, from the proof', () => {
    const model = simpLemma(['a'], { valueConsts: true });
    const v = nodeOf(model, 'v');
    expect(v.status.proof).toEqual({ kind: 'proved', footprint: ['a', 'presup:S.T.exists'] });
    expect(v.status.direct).toEqual({ ids: ['a'], from: 'proof' });
    expect(v.status.flags).toEqual(['established']);
    expect(graphOf(model).edges.filter((e) => e.target === 'v').map((e) => [e.id, e.mismatch])).toEqual([
      ['premise:a->v', undefined],
      ['verified:a->v', undefined],
    ]);
    expect(codes(model, 'v')).toEqual([]);
  });

  it('without the value probe (facts from before slice 1d) the walk falls back to the references: a is unseen', () => {
    const model = simpLemma(['a']);
    const v = nodeOf(model, 'v');
    expect(v.status.direct).toEqual({ ids: [], from: 'source', unseen: ['a'] });
    // The cross-check shows direct(v) is incomplete, so B.5's conditions over it cannot be confirmed: not established
    // (1d fixer).
    expect(v.status.flags).toEqual(['uses-unseen']);
    // The declared arrow is not a solid one: the references never reach a.
    expect(graphOf(model).edges.filter((e) => e.target === 'v').map((e) => e.id)).toEqual(['premise:a->v']);
    const tl123 = model.diagnostics.find((d) => d.code === 'TL123');
    expect(tl123).toMatchObject({ severity: 'warning', nodeId: 'v', message: 'The proof uses "a" in a way the arrows do not show: no card it uses directly rests on it.' });
  });

  it('one declaration the walk needs without valueConsts sends the whole walk to the references', () => {
    const model = simpLemma(['a'], { valueConsts: true, overrides: { 'S.good_t': { noValueConsts: true } } });
    expect(nodeOf(model, 'v').status.direct).toEqual({ ids: [], from: 'source', unseen: ['a'] });
  });

  it('an instance found by type-class search: the walk follows it to the card its value uses', () => {
    const body = [
      A,
      '',
      'class GoodT : Prop where',
      '  ok : Good t',
      '',
      'instance goodInst : GoodT := ⟨a.holds⟩',
      '',
      block({ id: 'w', type: 'PROPOSITION', name: 'It is good, by an instance', premises: ['a'], lean: 'S.w' }),
      'abbrev w : Prop := Good t',
      'theorem w.holds : w := GoodT.ok',
    ].join('\n');
    const facts = { valueConsts: true, overrides: { 'S.w.holds': { axioms: ['Classical.choice', 'S.Good', 'S.T', 'S.T.exists', 'S.a.holds'], valueConsts: ['S.GoodT', 'S.goodInst'] } } };
    const model = build({ ...VOCAB, 'Model/S/Main.lean': mainS(body) }, { facts }).model;
    expect(nodeOf(model, 'w').status.direct).toEqual({ ids: ['a'], from: 'proof' });
    expect(nodeOf(model, 'w').status.flags).toEqual(['established']);
  });

  it("another card's statement stops the walk without counting it; its extra pinned name counts it", () => {
    const body = [
      A,
      '',
      block({ id: 'u', type: 'PROPOSITION', name: 'U holds', premises: ['a'], lean: 'S.u, S.u_lemma' }),
      'abbrev u : Prop := Good t',
      'theorem u.holds : u := a.holds',
      'theorem u_lemma : Good t := a.holds',
      '',
      block({ id: 'p', type: 'PROPOSITION', name: 'P states u', premises: ['a'], lean: 'S.p' }),
      'abbrev p : Prop := Good t',
      'theorem p.holds : p := (a.holds : u)',
      '',
      block({ id: 'q', type: 'PROPOSITION', name: 'Q uses the pinned lemma', premises: ['u'], lean: 'S.q' }),
      'abbrev q : Prop := Good t',
      'theorem q.holds : q := u_lemma',
    ].join('\n');
    const model = build({ ...VOCAB, 'Model/S/Main.lean': mainS(body) }, { facts: { valueConsts: true } }).model;
    expect(nodeOf(model, 'p').status.direct).toEqual({ ids: ['a'], from: 'proof' });
    expect(nodeOf(model, 'q').status.direct).toEqual({ ids: ['u'], from: 'proof' });
    // q rests on a through u's pinned lemma: what that lemma rests on explains it (no uses-unseen).
    expect(nodeOf(model, 'q').status.flags).not.toContain('uses-unseen');
  });

  it("a card whose .holds states something else (TL114), reached only through a @[simp] lemma: v is not established, with or without the probe", () => {
    // u's .holds states `Good t`, not u; `good_l` (no card) uses u's .holds; v's proof is `by simp`.
    const body = [
      A,
      '',
      block({ id: 'u', type: 'PROPOSITION', name: 'U holds', premises: ['a'], lean: 'S.u' }),
      'abbrev u : Prop := Good t',
      'theorem u.holds : Good t := a.holds',
      '',
      '@[simp] theorem good_l : Good t = True := eq_true u.holds',
      '',
      block({ id: 'v', type: 'PROPOSITION', name: 'V holds', premises: ['a'], lean: 'S.v' }),
      'abbrev v : Prop := Good t ∧ True',
      'theorem v.holds : v := by simp',
    ].join('\n');
    const axioms = ['Classical.choice', 'propext', 'S.Good', 'S.T', 'S.T.exists', 'S.a.holds'];
    const run = (valueConsts: boolean) =>
      build({ ...VOCAB, 'Model/S/Main.lean': mainS(body) }, { facts: { valueConsts, overrides: { 'S.v.holds': { axioms, ...(valueConsts ? { valueConsts: ['S.v', 'S.good_l'] } : {}) } } } }).model;
    const withProbe = run(true);
    expect(nodeOf(withProbe, 'u').status.flags).toEqual(['holds-mismatch']);
    expect(nodeOf(withProbe, 'v').status).toMatchObject({ direct: { ids: ['u'], from: 'proof' }, flags: [] });
    // The references never reach u: the cross-check flags a (u's basis), and v is not established either.
    const fallback = run(false);
    expect(nodeOf(fallback, 'v').status).toMatchObject({ direct: { ids: [], from: 'source', unseen: ['a'] }, flags: ['uses-unseen'] });
  });

  it("a proof through another card's extra pinned name in a file that changed since the check: out of date (stale), not established", () => {
    // u's statement and .holds in Main.lean (unchanged); its pinned lemma u_lemma in Lemmas.lean, which changes.
    const lemmas = mainS('theorem u_lemma : Good t := a.holds');
    const main = mainS(
      [
        block({ id: 'u', type: 'PROPOSITION', name: 'U holds', premises: ['a'], lean: 'S.u, S.u_lemma' }),
        'abbrev u : Prop := Good t',
        'theorem u.holds : u := a.holds',
        '',
        block({ id: 'v', type: 'PROPOSITION', name: 'V holds', premises: ['u'], lean: 'S.v' }),
        'abbrev v : Prop := Good t',
        'theorem v.holds : v := u_lemma',
      ].join('\n'),
    );
    const texts = { ...VOCAB, 'Model/S/Axioms.lean': mainS(A), 'Model/S/Lemmas.lean': lemmas, 'Model/S/Main.lean': main };
    const fresh = build(texts, { facts: { valueConsts: true } }).model;
    expect(nodeOf(fresh, 'v').status).toMatchObject({ flags: ['established'], direct: { ids: ['u'], from: 'proof' } });
    const edited = build({ ...texts, 'Model/S/Lemmas.lean': `${lemmas}\n-- typed since\n` }, { facts: { valueConsts: true }, factsFrom: { 'Model/S/Lemmas.lean': lemmas } }).model;
    // u's own files did not change, so u stays fresh; v's proof rests on the changed lemma, so v is out of date.
    expect(nodeOf(edited, 'u').status.flags).toEqual(['established']);
    expect(nodeOf(edited, 'v').status.flags).toEqual(['stale']);
  });

  it('a lemma renamed since the check (its file changed): the walk cannot see past it, so v is out of date, not established', () => {
    const lemmas = mainS('theorem helper : Good t := a.holds');
    const main = mainS([block({ id: 'v', type: 'PROPOSITION', name: 'V holds', premises: ['a'], lean: 'S.v' }), 'abbrev v : Prop := Good t', 'theorem v.holds : v := helper'].join('\n'));
    const texts = { ...VOCAB, 'Model/S/Axioms.lean': mainS(A), 'Model/S/Lemmas.lean': lemmas, 'Model/S/Main.lean': main };
    const renamed = build(
      { ...texts, 'Model/S/Lemmas.lean': lemmas.replace('theorem helper', 'theorem helper_renamed') },
      { facts: { valueConsts: true }, factsFrom: { 'Model/S/Lemmas.lean': lemmas } },
    ).model;
    // The stale file's facts are kept by name only: `S.helper` matches nothing now.
    expect(renamed.declFacts.has('S.helper')).toBe(false);
    expect(nodeOf(renamed, 'v').status.proof.kind).toBe('proved');
    expect(nodeOf(renamed, 'v').status.flags).toEqual(['stale']);
    // Over the references (facts from before slice 1d), a name without facts may be Lean's own: no such inference.
    const old = build(
      { ...texts, 'Model/S/Lemmas.lean': lemmas.replace('theorem helper', 'theorem helper_renamed') },
      { factsFrom: { 'Model/S/Lemmas.lean': lemmas } },
    ).model;
    expect(nodeOf(old, 'v').status.direct?.from).toBe('source');
    expect(nodeOf(old, 'v').status.flags).not.toContain('stale');
  });

  it('a proof through a lemma in a file that changed since the check: the card is out of date (stale), not established', () => {
    // a in Axioms.lean, the lemma (no card) in Lemmas.lean, v in Main.lean: only Lemmas.lean changes.
    const lemmas = mainS('theorem helper : Good t := a.holds');
    const main = mainS([block({ id: 'v', type: 'PROPOSITION', name: 'V holds', premises: ['a'], lean: 'S.v' }), 'abbrev v : Prop := Good t', 'theorem v.holds : v := helper'].join('\n'));
    const texts = { ...VOCAB, 'Model/S/Axioms.lean': mainS(A), 'Model/S/Lemmas.lean': lemmas, 'Model/S/Main.lean': main };
    const fresh = build(texts, { facts: { valueConsts: true } }).model;
    expect(nodeOf(fresh, 'v').status).toMatchObject({ flags: ['established'], direct: { ids: ['a'], from: 'proof' } });
    const edited = build({ ...texts, 'Model/S/Lemmas.lean': `${lemmas}\n-- typed since\n` }, { facts: { valueConsts: true }, factsFrom: { 'Model/S/Lemmas.lean': lemmas } }).model;
    expect(nodeOf(edited, 'a').status.flags).toEqual([]);
    expect(nodeOf(edited, 'v').status.proof.kind).toBe('proved');
    expect(nodeOf(edited, 'v').status.flags).toEqual(['stale']);
  });
});

describe('established (B.5) with direct(v) from the proof', () => {
  // a (an axiom card) in Axioms.lean; l (proved from a) in Lemmas.lean; v (proved from l) in Main.lean.
  const axioms = mainS(A);
  const lemmas = (lHolds: string) => mainS([block({ id: 'l', type: 'PROPOSITION', name: 'L holds', premises: ['a'], lean: 'S.l' }), 'abbrev l : Prop := Good t', lHolds].join('\n'));
  const main = mainS([block({ id: 'v', type: 'PROPOSITION', name: 'V holds', premises: ['l'], lean: 'S.v' }), 'abbrev v : Prop := Good t', 'theorem v.holds : v := l.holds'].join('\n'));
  const texts = (lHolds: string) => ({ ...VOCAB, 'Model/S/Axioms.lean': axioms, 'Model/S/Lemmas.lean': lemmas(lHolds), 'Model/S/Main.lean': main });

  it('fresh, and every .holds stating its statement: established, direct(v) = {l} from the proof', () => {
    const model = build(texts('theorem l.holds : l := a.holds'), { facts: { valueConsts: true } }).model;
    expect(nodeOf(model, 'v').status).toMatchObject({ flags: ['established'], direct: { ids: ['l'], from: 'proof' } });
  });

  it("l's .holds states something else (TL114): v stays proved, not established, and l's own axioms still explain v's footprint", () => {
    const model = build(texts('theorem l.holds : Good t := a.holds'), { facts: { valueConsts: true } }).model;
    expect(nodeOf(model, 'l').status.flags).toEqual(['holds-mismatch']);
    expect(nodeOf(model, 'v').status).toMatchObject({ proof: { kind: 'proved', footprint: ['a', 'presup:S.T.exists'] }, flags: [], direct: { ids: ['l'], from: 'proof' } });
  });

  it('l changed since the check (stale): v is not established', () => {
    const fresh = texts('theorem l.holds : l := a.holds');
    const model = build({ ...fresh, 'Model/S/Lemmas.lean': `${fresh['Model/S/Lemmas.lean']}\n-- typed since\n` }, { facts: { valueConsts: true }, factsFrom: { 'Model/S/Lemmas.lean': fresh['Model/S/Lemmas.lean'] } }).model;
    expect(nodeOf(model, 'l').status.flags).toEqual(['stale']);
    expect(nodeOf(model, 'v').status.flags).not.toContain('established');
  });
});

describe('TL107 without the coverage exemption (spec v4.1 B.5)', () => {
  const derived = (premisesOfG: string[]) => {
    const body = [
      A,
      '',
      block({ id: 'b', type: 'AXIOM', name: 'B holds', rationale: 'r', lean: 'S.b' }),
      'abbrev b : Prop := Bad t',
      'axiom b.holds : b',
      '',
      block({ id: 'd', type: 'PROPOSITION', name: 'Good and bad', premises: ['a', 'b'], lean: 'S.d' }),
      'abbrev d : Prop := Good t ∧ Bad t',
      'theorem d.holds : d := ⟨a.holds, b.holds⟩',
      '',
      block({ id: 'g', type: 'PROPOSITION', name: 'Bad, again', premises: premisesOfG, lean: 'S.g' }),
      'abbrev g : Prop := Bad t',
      'theorem g.holds : g := d.holds.2',
    ].join('\n');
    return build({ ...VOCAB, 'Model/S/Main.lean': mainS(body) }, { facts: { valueConsts: true } }).model;
  };

  it('a use whose assumptions the arrows cover still needs its own arrow', () => {
    const model = derived(['a', 'b']);
    const graph = graphOf(model);
    expect(graph.edges.find((e) => e.id === 'verified:d->g')?.mismatch).toBe('used-undeclared');
    expect(model.diagnostics.filter((d) => d.nodeId === 'g').map((d) => [d.code, d.severity, d.message])).toEqual([
      ['TL107', 'warning', 'The proof uses "d", but no arrow is drawn from it.'],
    ]);
    // a and b are reached through d: not declared-unused (TL109 stays at the assumption level).
    expect(graph.edges.filter((e) => e.target === 'g' && e.type === 'premise').map((e) => e.mismatch)).toEqual([undefined, undefined]);
  });

  it('with the arrow from d: no mismatch at all', () => {
    const model = derived(['d']);
    expect(graphOf(model).edges.filter((e) => e.target === 'g' && e.mismatch)).toEqual([]);
    expect(codes(model, 'g')).toEqual([]);
  });
});
