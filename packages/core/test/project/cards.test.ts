/**
 * AT2.4: a card's `uses` and `refs` come from Lean's references (DeclFacts.refs), never from hard-coded names:
 * changing the refs changes `uses`; the closure runs through other nodes' statements and vocabulary definitions;
 * refs are code-relative, include the card's own statement inside its `.holds`, and drop non-vocabulary names.
 */
import { describe, expect, it } from 'vitest';
import { buildProjectModel } from '../../src/project/index.js';
import { block, build, mainS, nodeOf, VOCAB_S } from './helpers/build.js';
import { parseFixture } from './helpers/parseFixture.js';
import { spyroFacts, spyroInput } from './helpers/spyro.js';

describe('AT2.4 uses and refs come from the facts', () => {
  it('changing the refs in the facts changes uses (and refs)', () => {
    const input = spyroInput(parseFixture);
    const facts = spyroFacts();
    const statement = facts.decls.find((d) => d.name === 'Spyro.cynder_dark_past');
    if (!statement) throw new Error('fixture');
    // Pretend Lean resolved `cynder` to the game constant instead (same range).
    statement.refs = statement.refs.map((r) => (r.name === 'Spyro.cynder' ? { ...r, name: 'Spyro.newSpyro' } : r));
    const before = nodeOf(buildProjectModel(input), 'cynder-dark-past');
    const after = nodeOf(buildProjectModel({ ...input, facts }), 'cynder-dark-past');
    expect(before.lean.uses).toEqual(['Spyro.HasDarkPast', 'Spyro.cynder']);
    expect(after.lean.uses).toEqual(['Spyro.HasDarkPast', 'Spyro.newSpyro']);
    expect(after.lean.refs?.map((r) => r.name)).toEqual(['Spyro.HasDarkPast', 'Spyro.newSpyro', 'Spyro.cynder_dark_past']);
    // Without facts for the statement, `uses` is absent (the webview hides the line).
    const none = nodeOf(buildProjectModel({ ...input, facts: undefined }), 'cynder-dark-past');
    expect(none.lean.uses).toBeUndefined();
    expect(none.lean.refs).toBeUndefined();
  });

  const vocab = VOCAB_S.replace('end S\n', '/-- good pairs -/\ndef GoodPair (x y : T) : Prop := Good x ∧ Good y\n\nend S\n');
  const body = [
    block({ id: 'b', type: 'ASSUMPTION', name: 'It is bad', rationale: 'r', lean: 'S.b' }),
    'abbrev b : Prop := Bad t',
    'axiom b.holds : b',
    '',
    block({ id: 'c', type: 'GOAL', name: 'A good pair, and bad', premises: ['b'], lean: 'S.c' }),
    '/-- A good pair, and bad -/',
    'abbrev c : Prop := GoodPair t t ∧ b',
    'theorem c.holds : c := ⟨sorry, b.holds⟩',
  ].join('\n');

  it('the closure runs breadth-first through other nodes\' statements and vocabulary definitions', () => {
    const model = build({ 'Model/S/Vocabulary.lean': vocab, 'Model/S/Main.lean': mainS(body) }).model;
    const c = nodeOf(model, 'c');
    // c's own refs (GoodPair, t), then GoodPair's body (T from its binders, Good), then b's statement (Bad).
    expect(c.lean.uses).toEqual(['S.GoodPair', 'S.t', 'S.T', 'S.Good', 'S.Bad']);
    expect(c.status.flags).toContain('definitional-choice');
    const goodPair = model.vocabulary.find((v) => v.name === 'S.GoodPair');
    expect(goodPair).toMatchObject({ kind: 'definition', flags: ['definitional-choice'], usedBy: ['c'] });
    expect(model.vocabulary.find((v) => v.name === 'S.Bad')?.usedBy).toEqual(['b', 'c']);
  });

  it('refs are relative to the card code, include the own statement inside .holds, and drop non-vocabulary names', () => {
    const model = build(
      { 'Model/S/Vocabulary.lean': vocab, 'Model/S/Main.lean': mainS(body) },
      { facts: { overrides: { 'S.c.holds': { extraRefs: ['And.right', 'Nat'] } } } },
    ).model;
    const c = nodeOf(model, 'c');
    expect(c.lean.code).toBe('/-- A good pair, and bad -/\nabbrev c : Prop := GoodPair t t ∧ b\ntheorem c.holds : c := ⟨sorry, b.holds⟩');
    expect(c.lean.refs).toEqual([
      { name: 'S.GoodPair', range: { start: { line: 1, character: 19 }, end: { line: 1, character: 27 } } },
      { name: 'S.t', range: { start: { line: 1, character: 28 }, end: { line: 1, character: 29 } } },
      { name: 'S.t', range: { start: { line: 1, character: 30 }, end: { line: 1, character: 31 } } },
      { name: 'S.b', range: { start: { line: 1, character: 34 }, end: { line: 1, character: 35 } }, nodeId: 'b' },
      { name: 'S.c', range: { start: { line: 2, character: 18 }, end: { line: 2, character: 19 } }, nodeId: 'c' },
      { name: 'S.b.holds', range: { start: { line: 2, character: 31 }, end: { line: 2, character: 38 } }, nodeId: 'b' },
    ]);
    const lines = (c.lean.code ?? '').split('\n');
    for (const ref of c.lean.refs ?? []) {
      const text = lines[ref.range.start.line]?.slice(ref.range.start.character, ref.range.end.character) ?? '';
      expect(ref.name.endsWith(text)).toBe(true);
    }
  });

  it('code that is not contiguous is joined by a blank line and refs are mapped per piece', () => {
    const split = [
      block({ id: 'b', type: 'ASSUMPTION', name: 'It is bad', rationale: 'r', lean: 'S.b' }),
      'abbrev b : Prop := Bad t',
      '',
      'abbrev other : Prop := Good t',
      '',
      'axiom b.holds : b',
    ].join('\n');
    const model = build({ 'Model/S/Vocabulary.lean': VOCAB_S, 'Model/S/Main.lean': mainS(split) }).model;
    const b = nodeOf(model, 'b');
    expect(b.lean.code).toBe('abbrev b : Prop := Bad t\n\naxiom b.holds : b');
    expect(b.lean.refs).toEqual([
      { name: 'S.Bad', range: { start: { line: 0, character: 19 }, end: { line: 0, character: 22 } } },
      { name: 'S.t', range: { start: { line: 0, character: 23 }, end: { line: 0, character: 24 } } },
      { name: 'S.b', range: { start: { line: 2, character: 16 }, end: { line: 2, character: 17 } }, nodeId: 'b' },
    ]);
    // An untracked Prop abbrev is a definition (D-4: endorsement needed only when a statement uses it).
    expect(model.vocabulary.find((v) => v.name === 'S.other')).toMatchObject({ kind: 'definition', flags: [] });
  });
});
