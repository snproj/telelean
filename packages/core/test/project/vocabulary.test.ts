/**
 * AT2.5: the Vocabulary group (D-3, docs/m1-plan.md section 6.4), with Lean's facts (`typeSort`) and without them
 * (syntactic mode).
 */
import { describe, expect, it } from 'vitest';
import type { VocabItem } from '../../src/model.js';
import { block, build, graphOf, mainS } from './helpers/build.js';

const VOCAB = `namespace S

/-- things -/
axiom T : Type
/-- there is at least one thing -/
axiom T.exists : Nonempty T
instance : Nonempty T := T.exists
/-- is good -/
axiom Good : T → Prop
/-- likes -/
axiom Likes : T → T → Prop
/-- it rains -/
axiom Rains : Prop
/-- a thing -/
noncomputable opaque t : T
/-- the best friend of -/
noncomputable opaque friend : T → T
/-- an asserted thing -/
axiom c : T
/-- a hidden assumption -/
axiom hidden : Good t
/-- a big universe -/
axiom U : Type 1
/-- whether a number is small -/
axiom Small : Nat → Prop
/-- good pairs -/
def GoodPair (x y : T) : Prop := Good x ∧ Good y
/-- a record -/
structure Rec where
  past : T
/-- a lemma -/
theorem good_good : ∀ x : T, Good x → Good x := fun _ h => h

end S
`;

const MAIN = mainS(
  [
    block({ id: 'p', type: 'GOAL', name: 'The thing makes a good pair with itself', lean: 'S.p' }),
    'abbrev p : Prop := GoodPair t t',
    '',
    block({ id: 'r', type: 'ASSUMPTION', name: 'The friend likes it', rationale: 'seen', lean: 'S.r' }),
    'abbrev r : Prop := Likes (friend t) t',
    'axiom r.holds : r',
  ].join('\n'),
);

const summary = (items: readonly VocabItem[]) => items.map((v) => [v.shortName, v.kind, v.arity ?? null, v.flags]);

const EXPECTED = [
  ['T', 'sort', null, []],
  ['Good', 'predicate', 1, []],
  ['Likes', 'predicate', 2, []],
  ['Rains', 'predicate', 0, []],
  ['Small', 'predicate', 1, ['shape-violation']],
  ['friend', 'function', 1, []],
  ['t', 'constant', null, []],
  ['c', 'constant', null, ['shape-violation']],
  ['T.exists', 'presupposition', null, []],
  ['GoodPair', 'definition', null, ['definitional-choice']],
  ['Rec', 'definition', null, []],
  ['good_good', 'lemma', null, []],
  ['hidden', 'unmarked-axiom', null, ['unmarked-assumption']],
  ['U', 'other', null, ['shape-violation']],
];

describe('AT2.5 vocabulary classification', () => {
  const withFacts = build(
    { 'Model/S/Vocabulary.lean': VOCAB, 'Model/S/Main.lean': MAIN },
    {
      mutateFacts: (facts) => {
        // Lean's .ilean attributes the structure field to its structure (DeclFacts.parent).
        const rec = facts.decls.find((d) => d.name === 'S.Rec');
        if (!rec) throw new Error('fixture');
        facts.decls.push({ ...rec, name: 'S.Rec.past', kind: 'def', type: 'S.Rec → S.T', parent: 'S.Rec', refs: [], axioms: ['S.T'] });
      },
    },
  ).model;

  it('with facts: kinds, arities, flags, display order (sort, predicate, function, constant, presupposition, definition, lemma, unmarked-axiom, other)', () => {
    expect(summary(withFacts.vocabulary)).toEqual(EXPECTED);
  });

  it('attaches the presupposition to its sort and hides the anonymous Nonempty instance (matched by its start line)', () => {
    const t = withFacts.vocabulary.find((v) => v.name === 'S.T');
    const exists = withFacts.vocabulary.find((v) => v.name === 'S.T.exists');
    expect(t).toMatchObject({ presupposition: 'S.T.exists', type: 'Type', gloss: 'things', glossBy: 'user' });
    expect(exists).toMatchObject({ presupposes: 'S.T', type: 'Nonempty S.T' });
    expect(withFacts.vocabulary.map((v) => v.name)).not.toContain('S.instNonemptyT');
    expect(withFacts.declFacts.get('S.instNonemptyT')?.kind).toBe('instance');
  });

  it('folds a structure field into its structure', () => {
    expect(withFacts.vocabulary.map((v) => v.name)).not.toContain('S.Rec.past');
    expect(withFacts.vocabulary.find((v) => v.name === 'S.Rec')?.code).toBe('/-- a record -/\nstructure Rec where\n  past : T');
  });

  it('flags hidden assumptions (TL104) and shape violations (TL111) with the item name', () => {
    expect(withFacts.diagnostics.filter((d) => d.code === 'TL104').map((d) => d.vocab)).toEqual(['S.hidden']);
    expect(withFacts.diagnostics.filter((d) => d.code === 'TL111').map((d) => d.vocab)).toEqual(['S.c', 'S.U', 'S.Small']);
    const c = withFacts.diagnostics.find((d) => d.vocab === 'S.c');
    expect(c?.message).toMatch(/noncomputable opaque/);
    expect(c?.range).toEqual(withFacts.vocabulary.find((v) => v.name === 'S.c')?.loc?.range);
  });

  it('usedBy lists the nodes whose uses or presuppositions contain the item; definitions in a statement closure are definitional choices', () => {
    const usedBy = Object.fromEntries(withFacts.vocabulary.map((v) => [v.shortName, v.usedBy]));
    expect(usedBy).toMatchObject({ GoodPair: ['p'], Good: ['p'], T: ['p'], t: ['p', 'r'], Likes: ['r'], friend: ['r'], 'T.exists': ['p', 'r'], c: [], hidden: [] });
    const graph = graphOf(withFacts);
    expect(graph.nodes.find((n) => n.id === 'p')?.status.flags).toContain('definitional-choice');
    expect(graph.nodes.find((n) => n.id === 'r')?.status.flags).not.toContain('definitional-choice');
  });

  it('without facts the same rules run on the declaration text', () => {
    const syntactic = build({ 'Model/S/Vocabulary.lean': VOCAB, 'Model/S/Main.lean': MAIN }, { facts: false }).model;
    // No usedBy without facts (uses are Lean's), hence no definitional-choice; otherwise the same classification.
    expect(summary(syntactic.vocabulary)).toEqual(EXPECTED.map(([n, k, a, f]) => [n, k, a, (f as string[]).filter((x) => x !== 'definitional-choice')]));
    expect(syntactic.vocabulary.find((v) => v.name === 'S.Likes')?.type).toBe('S.T → S.T → Prop');
    expect(syntactic.vocabulary.find((v) => v.name === 'S.T.exists')).toMatchObject({ presupposes: 'S.T', type: 'Nonempty S.T' });
    expect(syntactic.vocabulary.map((v) => v.name)).not.toContain('S.instNonemptyT');
  });

  it('a predicate over a non-sort is a shape violation; an `axiom P0 : Prop` is a predicate of arity 0', () => {
    const small = withFacts.vocabulary.find((v) => v.name === 'S.Small');
    expect(small).toMatchObject({ kind: 'predicate', arity: 1, flags: ['shape-violation'] });
    expect(withFacts.vocabulary.find((v) => v.name === 'S.Rains')).toMatchObject({ kind: 'predicate', arity: 0, type: 'Prop' });
  });
});
