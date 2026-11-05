/**
 * AT2.2: node statuses per the table of docs/m1-plan.md section 6.3 (one test per cell), proved vs conditional,
 * holds-mismatch, `other` justifications, footprint mapping, flags and the TL1xx diagnostics that go with them.
 */
import { describe, expect, it } from 'vitest';
import type { NodeType } from '../../src/model.js';
import { block, build, codes, graphOf, mainS, nodeOf, VOCAB_S } from './helpers/build.js';

const VOCAB = { 'Model/S/Vocabulary.lean': VOCAB_S };

/** `a` (an assumption, `Good t`) plus node `n` (premises: a) of the given type, statement `Good t ∧ Good t`, with `holds`. */
function cell(type: NodeType, holds: string) {
  const body = [
    block({ id: 'a', type: 'ASSUMPTION', name: 'A holds', rationale: 'seen it', lean: 'S.a' }),
    'abbrev a : Prop := Good t',
    'axiom a.holds : a',
    '',
    block({ id: 'n', type, name: 'N holds', rationale: 'why not', premises: ['a'], lean: 'S.n' }),
    'abbrev n : Prop := Good t ∧ Good t',
    holds,
  ].join('\n');
  return build({ ...VOCAB, 'Model/S/Main.lean': mainS(body) }).model;
}

const ABSENT = '';
const AXIOM = 'axiom n.holds : n';
const THEOREM = 'theorem n.holds : n := ⟨a.holds, a.holds⟩';
const SORRY = 'theorem n.holds : n := sorry';

describe('AT2.2 the status table (H = n.holds)', () => {
  it('ASSUMPTION, H absent: none + missing-holds (TL117)', () => {
    const model = cell('ASSUMPTION', ABSENT);
    expect(nodeOf(model, 'n').status).toMatchObject({ formal: 'formalized', proof: { kind: 'none' }, flags: ['missing-holds'] });
    expect(codes(model, 'n')).toEqual(['TL117']);
  });
  it('ASSUMPTION, H axiom: assumed', () => {
    const model = cell('ASSUMPTION', AXIOM);
    expect(nodeOf(model, 'n').status).toMatchObject({ proof: { kind: 'assumed' }, flags: [] });
    expect(nodeOf(model, 'n').lean).toMatchObject({ justification: 'S.n.holds', justificationKind: 'axiom' });
    expect(codes(model, 'n')).toEqual([]);
  });
  it('ASSUMPTION, H theorem: proved + provable-assumption (TL106)', () => {
    const model = cell('ASSUMPTION', THEOREM);
    expect(nodeOf(model, 'n').status).toMatchObject({ proof: { kind: 'proved', footprint: ['a', 'presup:S.T.exists'] }, flags: ['provable-assumption'] });
    expect(codes(model, 'n')).toEqual(['TL106']);
  });
  it('ASSUMPTION, H theorem with sorryAx: none + uses-sorry (TL115)', () => {
    const model = cell('ASSUMPTION', SORRY);
    expect(nodeOf(model, 'n').status).toMatchObject({ proof: { kind: 'none' }, flags: ['uses-sorry'] });
    expect(codes(model, 'n')).toEqual(['TL115']);
  });

  it('DERIVATION, H absent: none', () => {
    const model = cell('DERIVATION', ABSENT);
    expect(nodeOf(model, 'n').status).toMatchObject({ formal: 'formalized', proof: { kind: 'none' }, flags: [] });
    expect(codes(model, 'n')).toEqual([]);
  });
  it('DERIVATION, H axiom: pending-promotion + claimed', () => {
    const model = cell('DERIVATION', AXIOM);
    expect(nodeOf(model, 'n').status).toMatchObject({ proof: { kind: 'pending-promotion' }, flags: ['claimed'] });
  });
  it('DERIVATION, H theorem: proved', () => {
    const model = cell('DERIVATION', THEOREM);
    expect(nodeOf(model, 'n').status).toMatchObject({ proof: { kind: 'proved', footprint: ['a', 'presup:S.T.exists'] }, flags: [] });
    expect(codes(model, 'n')).toEqual([]);
  });
  it('DERIVATION, H theorem with sorryAx: none + uses-sorry (TL115)', () => {
    const model = cell('DERIVATION', SORRY);
    expect(nodeOf(model, 'n').status).toMatchObject({ proof: { kind: 'none' }, flags: ['uses-sorry'] });
    expect(codes(model, 'n')).toEqual(['TL115']);
  });

  it('GOAL, H absent: none', () => {
    const model = cell('GOAL', ABSENT);
    expect(nodeOf(model, 'n').status).toMatchObject({ proof: { kind: 'none' }, flags: [] });
    expect(nodeOf(model, 'n').lean.justification).toBeUndefined();
  });
  it('GOAL, H axiom: assumed + TL116 ("make it an Assumption?")', () => {
    const model = cell('GOAL', AXIOM);
    expect(nodeOf(model, 'n').status).toMatchObject({ proof: { kind: 'assumed' }, flags: [] });
    expect(codes(model, 'n')).toEqual(['TL116']);
  });
  it('GOAL, H theorem: proved + proved-goal (TL105)', () => {
    const model = cell('GOAL', THEOREM);
    expect(nodeOf(model, 'n').status).toMatchObject({ proof: { kind: 'proved' }, flags: ['proved-goal'] });
    expect(codes(model, 'n')).toEqual(['TL105']);
  });
  it('GOAL, H theorem with sorryAx: none + uses-sorry (TL115)', () => {
    const model = cell('GOAL', SORRY);
    expect(nodeOf(model, 'n').status).toMatchObject({ proof: { kind: 'none' }, flags: ['uses-sorry'] });
    expect(codes(model, 'n')).toEqual(['TL115']);
  });
});

describe('AT2.2 proved vs conditional, mismatches, other kinds, footprints, flags', () => {
  it('a theorem taking a node statement as hypothesis is conditional, also when Lean wraps the #check type', () => {
    const body = [
      block({ id: 'a', type: 'ASSUMPTION', name: 'A holds', rationale: 'r', lean: 'S.a' }),
      'abbrev a : Prop := Good t',
      '',
      block({ id: 'd', type: 'DERIVATION', name: 'D holds', premises: ['a'], lean: 'S.d' }),
      'abbrev d : Prop := Good t',
      'theorem d.holds (h : a) : d := h',
    ].join('\n');
    const plain = build({ ...VOCAB, 'Model/S/Main.lean': mainS(body) }).model;
    // `#print axioms` covers the types too: `t` in `a`'s statement brings Classical.choice and T.exists.
    expect(nodeOf(plain, 'd').status.proof).toEqual({ kind: 'conditional', on: ['a'], footprint: ['presup:S.T.exists'] });
    expect(codes(plain, 'd')).toEqual(['TL102']);
    const wrapped = build({ ...VOCAB, 'Model/S/Main.lean': mainS(body) }, { facts: { overrides: { 'S.d.holds': { type: 'S.a →\n  S.d' } } } }).model;
    expect(nodeOf(wrapped, 'd').status.proof).toEqual({ kind: 'conditional', on: ['a'], footprint: ['presup:S.T.exists'] });
    // The hypothesis gives a conditional verified edge (declared as a premise, so no mismatch).
    expect(graphOf(wrapped).edges.filter((e) => e.type === 'verified')).toEqual([
      { id: 'verified:a->d', type: 'verified', source: 'a', target: 'd', origin: 'lean', where: 'proof', conditional: true },
    ]);
  });

  it('n.holds stating something else is holds-mismatch (TL114), proof none', () => {
    const model = cell('DERIVATION', 'theorem n.holds : Good t ∧ Good t := ⟨a.holds, a.holds⟩');
    expect(nodeOf(model, 'n').status).toMatchObject({ proof: { kind: 'none' }, flags: ['holds-mismatch'] });
    expect(codes(model, 'n')).toEqual(['TL114']);
  });

  it('a `def` justification counts as `other` and is treated like a theorem', () => {
    const model = cell('DERIVATION', 'def n.holds : n := ⟨a.holds, a.holds⟩');
    expect(nodeOf(model, 'n').lean.justificationKind).toBe('other');
    expect(nodeOf(model, 'n').status.proof).toEqual({ kind: 'proved', footprint: ['a', 'presup:S.T.exists'] });
  });

  it('footprint mapping: node ids, presup: entries, standard axioms and vocabulary dropped, other axioms as axiom: + TL103', () => {
    const body = [
      block({ id: 'a', type: 'ASSUMPTION', name: 'A holds', rationale: 'r', lean: 'S.a' }),
      'abbrev a : Prop := Good t',
      'axiom a.holds : a',
      '',
      'axiom sneaky : Bad t',
      '',
      block({ id: 'n', type: 'DERIVATION', name: 'N holds', lean: 'S.n' }),
      'abbrev n : Prop := Good t ∧ Bad t',
      'theorem n.holds : n := ⟨a.holds, sneaky⟩',
    ].join('\n');
    const model = build({ ...VOCAB, 'Model/S/Main.lean': mainS(body) }).model;
    const n = nodeOf(model, 'n');
    expect(n.lean.axioms).toEqual(['Classical.choice', 'S.Bad', 'S.Good', 'S.T', 'S.sneaky', 'S.T.exists', 'S.a.holds']);
    expect(n.status.proof).toEqual({ kind: 'proved', footprint: ['a', 'presup:S.T.exists', 'axiom:S.sneaky'] });
    expect(model.diagnostics.filter((d) => d.code === 'TL103')).toMatchObject([{ nodeId: 'n', vocab: 'S.sneaky', severity: 'warning' }]);
    expect(model.diagnostics.filter((d) => d.code === 'TL104').map((d) => d.vocab)).toEqual(['S.sneaky']);
  });

  it('rests-on-claimed: a proof using the axiom of a derivation whose promotion is pending', () => {
    const body = [
      block({ id: 'd', type: 'DERIVATION', name: 'D holds', lean: 'S.d' }),
      'abbrev d : Prop := Good t',
      'axiom d.holds : d',
      '',
      block({ id: 'g', type: 'GOAL', name: 'G holds', lean: 'S.g' }),
      'abbrev g : Prop := Good t ∧ Good t',
      'theorem g.holds : g := ⟨d.holds, d.holds⟩',
    ].join('\n');
    const model = build({ ...VOCAB, 'Model/S/Main.lean': mainS(body) }).model;
    expect(nodeOf(model, 'd').status.proof.kind).toBe('pending-promotion');
    expect(nodeOf(model, 'g').status.flags).toEqual(['proved-goal', 'rests-on-claimed']);
  });

  it('self-evident: proved with no node in the footprint', () => {
    const body = [block({ id: 'e', type: 'DERIVATION', name: 'Truth', lean: 'S.e' }), 'abbrev e : Prop := True', 'theorem e.holds : e := trivial'].join('\n');
    const model = build({ ...VOCAB, 'Model/S/Main.lean': mainS(body) }).model;
    expect(nodeOf(model, 'e').status).toMatchObject({ proof: { kind: 'proved', footprint: [] }, flags: ['self-evident'] });
  });

  it('not self-evident when the proof rests on a hidden (unmarked) axiom: TL103 and TL104 instead', () => {
    const body = [
      'axiom secret : Good t',
      '',
      block({ id: 'g', type: 'GOAL', name: 'G holds', lean: 'S.g' }),
      'abbrev g : Prop := Good t',
      'theorem g.holds : g := secret',
    ].join('\n');
    const model = build({ ...VOCAB, 'Model/S/Main.lean': mainS(body) }).model;
    const g = nodeOf(model, 'g');
    expect(g.status.proof).toEqual({ kind: 'proved', footprint: ['presup:S.T.exists', 'axiom:S.secret'] });
    expect(g.status.flags).not.toContain('self-evident');
    expect(codes(model, 'g')).toContain('TL103');
    expect(codes(model)).toContain('TL104');
  });

  it('existence-commitment + TL108: the proof needs a presupposition no statement mentions', () => {
    const body = [block({ id: 'e', type: 'DERIVATION', name: 'Something exists', lean: 'S.e' }), 'abbrev e : Prop := ∃ x : T, True', 'theorem e.holds : e := ⟨t, trivial⟩'].join('\n');
    const model = build({ ...VOCAB, 'Model/S/Main.lean': mainS(body) }).model;
    const e = nodeOf(model, 'e');
    expect(e.lean.presupposes).toEqual([]);
    expect(e.status).toMatchObject({ proof: { kind: 'proved', footprint: ['presup:S.T.exists'] }, flags: ['self-evident', 'existence-commitment'] });
    expect(model.diagnostics.find((d) => d.code === 'TL108')).toMatchObject({ nodeId: 'e', severity: 'info' });
  });

  it('TL102 when a proof rests on a goal asserted as an axiom', () => {
    const body = [
      block({ id: 'g0', type: 'GOAL', name: 'G0 holds', lean: 'S.g0' }),
      'abbrev g0 : Prop := Good t',
      'axiom g0.holds : g0',
      '',
      block({ id: 'd', type: 'DERIVATION', name: 'D holds', premises: ['g0'], lean: 'S.d' }),
      'abbrev d : Prop := Good t ∧ Good t',
      'theorem d.holds : d := ⟨g0.holds, g0.holds⟩',
    ].join('\n');
    const model = build({ ...VOCAB, 'Model/S/Main.lean': mainS(body) }).model;
    expect(codes(model, 'g0')).toEqual(['TL116']);
    expect(codes(model, 'd')).toEqual(['TL102']);
    expect(model.diagnostics.find((d) => d.code === 'TL102')?.message).toMatch(/goal asserted as an axiom: g0/);
  });

  it('a block bound to a theorem or to a bare axiom is ill-formed with TL113', () => {
    const body = [
      block({ id: 'th', type: 'DERIVATION', name: 'A lemma' }),
      'theorem th : Good t → Good t := fun h => h',
      '',
      block({ id: 'ax', type: 'ASSUMPTION', name: 'A bare axiom', rationale: 'r' }),
      'axiom ax : Good t',
    ].join('\n');
    for (const facts of [undefined, false] as const) {
      const model = build({ ...VOCAB, 'Model/S/Main.lean': mainS(body) }, facts === false ? { facts: false } : {}).model;
      for (const id of ['th', 'ax']) {
        expect(nodeOf(model, id).status.formal, `${id} (${facts === false ? 'syntactic' : 'facts'})`).toBe('ill-formed');
        expect(nodeOf(model, id).lean.binding).toBe('adjacent');
        expect(codes(model, id)).toContain('TL113');
      }
    }
  });

  it('a Lean error inside one node\'s .holds makes only that node ill-formed', () => {
    const body = [
      block({ id: 'a', type: 'ASSUMPTION', name: 'A holds', rationale: 'r', lean: 'S.a' }),
      'abbrev a : Prop := Good t',
      'axiom a.holds : a',
      '',
      block({ id: 'n', type: 'DERIVATION', name: 'N holds', lean: 'S.n' }),
      'abbrev n : Prop := Good t',
      'theorem n.holds : n := a.hold',
    ].join('\n');
    const main = mainS(body);
    const line = main.split('\n').findIndex((l) => l.startsWith('theorem n.holds'));
    const model = build(
      { ...VOCAB, 'Model/S/Main.lean': main },
      {
        facts: {
          moduleStates: { 'Model/S/Main.lean': 'failed' },
          messages: [
            {
              severity: 'error',
              file: 'Model/S/Main.lean',
              module: 'Model.S.Main',
              range: { start: { line, character: 23 }, end: { line, character: 23 } },
              text: "unknown identifier 'a.hold'",
            },
          ],
        },
      },
    ).model;
    expect(nodeOf(model, 'n').status).toMatchObject({ formal: 'ill-formed', proof: { kind: 'none' } });
    expect(nodeOf(model, 'n').status.flags).toContain('not-checked');
    expect(nodeOf(model, 'a').status.formal).toBe('formalized');
    expect(nodeOf(model, 'a').status.proof.kind).toBe('assumed');
    expect(model.diagnostics.find((d) => d.code === 'LEAN')).toMatchObject({ nodeId: 'n', severity: 'error', message: "unknown identifier 'a.hold'" });
  });

  it('no-rationale is an ASSUMPTION flag (TL011), never a derivation or goal one', () => {
    const body = [block({ id: 'x', type: 'ASSUMPTION', name: 'X' }), '', block({ id: 'y', type: 'GOAL', name: 'Y' })].join('\n');
    const model = build({ ...VOCAB, 'Model/S/Main.lean': mainS(body) }).model;
    expect(nodeOf(model, 'x').status.flags).toEqual(['no-rationale']);
    expect(nodeOf(model, 'y').status.flags).toEqual([]);
    expect(codes(model, 'x')).toEqual(['TL011']);
    expect(nodeOf(model, 'x').status.formal).toBe('informal');
  });
});
