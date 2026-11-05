/**
 * Binding and graph diagnostics (docs/m1-plan.md sections 6.1 and 6.5): pinned names resolved against the enclosing
 * namespaces, TL101 (not found), TL017 (bound twice), TL007 (dangling premise), TL015 (premise cycle), TL118 (file not
 * imported by the library root).
 */
import { describe, expect, it } from 'vitest';
import { block, build, codes, mainS, nodeOf, VOCAB_S } from './helpers/build.js';

const VOCAB = { 'Model/S/Vocabulary.lean': VOCAB_S };

describe('binding', () => {
  it('a pinned name without an exact match resolves against the block\'s enclosing namespaces', () => {
    const body = [block({ id: 'a', type: 'ASSUMPTION', name: 'A', rationale: 'r', lean: 'a' }), 'abbrev a : Prop := Good t', 'axiom a.holds : a'].join('\n');
    const model = build({ ...VOCAB, 'Model/S/Main.lean': mainS(body) }).model;
    expect(nodeOf(model, 'a').lean).toMatchObject({ binding: 'pinned', statement: 'S.a', justification: 'S.a.holds', justificationKind: 'axiom' });
    expect(nodeOf(model, 'a').status).toMatchObject({ formal: 'formalized', proof: { kind: 'assumed' } });
  });

  it('a pinned name that resolves to nothing is TL101 and the node is ill-formed', () => {
    const body = block({ id: 'a', type: 'GOAL', name: 'A', lean: 'S.missing' });
    const model = build({ ...VOCAB, 'Model/S/Main.lean': mainS(body) }).model;
    expect(nodeOf(model, 'a').status).toMatchObject({ formal: 'ill-formed', proof: { kind: 'none' }, flags: [] });
    expect(nodeOf(model, 'a').lean).toEqual({ binding: 'pinned', statement: 'S.missing' });
    expect(codes(model, 'a')).toEqual(['TL101']);
  });

  it('a declaration bound by two blocks is TL017 on the second; the first owns it', () => {
    const body = [
      block({ id: 'first', type: 'ASSUMPTION', name: 'First', rationale: 'r', lean: 'S.a' }),
      '',
      block({ id: 'second', type: 'ASSUMPTION', name: 'Second', rationale: 'r', lean: 'S.a' }),
      'abbrev a : Prop := Good t',
      'axiom a.holds : a',
    ].join('\n');
    const model = build({ ...VOCAB, 'Model/S/Main.lean': mainS(body) }).model;
    expect(model.ownerOfDecl.get('S.a')).toBe('first');
    expect(model.ownerOfDecl.get('S.a.holds')).toBe('first');
    expect(codes(model, 'second')).toEqual(['TL017']);
    expect(codes(model, 'first')).toEqual([]);
  });
});

describe('premise diagnostics', () => {
  it('TL007 for a dangling premise; TL015 on every card of a premise cycle', () => {
    const body = [
      block({ id: 'x', type: 'GOAL', name: 'X', premises: ['y', 'ghost'] }),
      '',
      block({ id: 'y', type: 'GOAL', name: 'Y', premises: ['z'] }),
      '',
      block({ id: 'z', type: 'GOAL', name: 'Z', premises: ['y'] }),
    ].join('\n');
    const model = build({ ...VOCAB, 'Model/S/Main.lean': mainS(body) }).model;
    expect(codes(model, 'x')).toEqual(['TL007']);
    expect(model.diagnostics.find((d) => d.code === 'TL007')?.message).toMatch(/"ghost"/);
    expect(codes(model, 'y')).toEqual(['TL015']);
    expect(codes(model, 'z')).toEqual(['TL015']);
  });
});

describe('TL118', () => {
  it('a model file the library root does not import is reported (Lean never checks it)', () => {
    const texts = {
      'Model.lean': 'import Model.S.Main\n',
      ...VOCAB,
      'Model/S/Main.lean': mainS(''),
      'Model/S/Extra.lean': 'namespace S\n\nend S\n',
    };
    const model = build(texts, { facts: false }).model;
    expect(model.diagnostics.filter((d) => d.code === 'TL118').map((d) => d.file)).toEqual(['Model/S/Extra.lean']);
    // Without a library root nothing is reported (the semantic layer marks such modules not-built anyway).
    const noRoot = build({ ...VOCAB, 'Model/S/Extra.lean': 'namespace S\n\nend S\n' }, { facts: false }).model;
    expect(noRoot.diagnostics.filter((d) => d.code === 'TL118')).toEqual([]);
  });
});
