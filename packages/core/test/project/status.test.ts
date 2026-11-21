/**
 * AT2.2: node statuses per the table of docs/m1-plan.md section 6.3 (one test per cell), with spec v4's two kinds
 * (docs/slice1-plan.md 2.1, B.5): an AXIOM's `axiom n.holds` is assumed, a PROPOSITION's is pending; the old
 * ASSUMPTION, DERIVATION and GOAL are read as aliases. Proved vs conditional, holds-mismatch, `other`
 * justifications, footprint mapping, flags (`established` among them) and the TL1xx diagnostics that go with them.
 */
import { describe, expect, it } from 'vitest';
import type { NodeType, NodeTypeAlias } from '../../src/model.js';
import { block, build, codes, graphOf, mainS, nodeOf, VOCAB_S } from './helpers/build.js';

const VOCAB = { 'Model/S/Vocabulary.lean': VOCAB_S };

/** `a` (an axiom, `Good t`) plus node `n` (premises: a) written with the given type, statement `Good t ∧ Good t`, with `holds`. */
function cell(type: NodeType | NodeTypeAlias, holds: string) {
  const body = [
    block({ id: 'a', type: 'AXIOM', name: 'A holds', rationale: 'seen it', lean: 'S.a' }),
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
  // The cell's `premises: a` on an axiom card is one written before v4: TL122 says so (spec v4 A19, slice 1b).
  describe.each(['AXIOM', 'ASSUMPTION'] as const)('an axiom card (`type: %s`)', (type) => {
    it('H absent: none + missing-holds (TL117)', () => {
      const model = cell(type, ABSENT);
      expect(nodeOf(model, 'n').type).toBe('AXIOM');
      expect(nodeOf(model, 'n').status).toMatchObject({ formal: 'formalized', proof: { kind: 'none' }, flags: ['missing-holds'] });
      expect(codes(model, 'n')).toEqual(['TL117', 'TL122']);
      expect(model.diagnostics.find((d) => d.code === 'TL117')?.message).toBe('This axiom has no `axiom n.holds : n`, so proofs cannot use it.');
    });
    it('H axiom: assumed', () => {
      const model = cell(type, AXIOM);
      expect(nodeOf(model, 'n').status).toMatchObject({ proof: { kind: 'assumed' }, flags: [] });
      expect(nodeOf(model, 'n').lean).toMatchObject({ justification: 'S.n.holds', justificationKind: 'axiom' });
      expect(codes(model, 'n')).toEqual(['TL122']);
    });
    it('H theorem: proved + provable-assumption (TL106, "This axiom has a proof."), never established', () => {
      const model = cell(type, THEOREM);
      expect(nodeOf(model, 'n').status).toMatchObject({ proof: { kind: 'proved', footprint: ['a', 'presup:S.T.exists'] }, flags: ['provable-assumption'] });
      expect(codes(model, 'n')).toEqual(['TL106', 'TL122']);
      expect(model.diagnostics.find((d) => d.code === 'TL106')?.message).toBe('This axiom has a proof.');
    });
    it('H theorem with sorryAx: none + uses-sorry (TL115)', () => {
      const model = cell(type, SORRY);
      expect(nodeOf(model, 'n').status).toMatchObject({ proof: { kind: 'none' }, flags: ['uses-sorry'] });
      expect(codes(model, 'n')).toEqual(['TL115', 'TL122']);
    });
  });

  describe.each(['PROPOSITION', 'DERIVATION', 'GOAL'] as const)('a proposition card (`type: %s`)', (type) => {
    it('H absent: none', () => {
      const model = cell(type, ABSENT);
      expect(nodeOf(model, 'n').type).toBe('PROPOSITION');
      expect(nodeOf(model, 'n').status).toMatchObject({ formal: 'formalized', proof: { kind: 'none' }, flags: [] });
      expect(nodeOf(model, 'n').lean.justification).toBeUndefined();
      expect(codes(model, 'n')).toEqual([]);
    });
    it('H axiom: pending (no TL116; spec v4 AR-6, A19)', () => {
      const model = cell(type, AXIOM);
      expect(nodeOf(model, 'n').status).toMatchObject({ proof: { kind: 'pending' }, flags: [] });
      expect(codes(model, 'n')).toEqual([]);
    });
    it('H theorem: proved and established (no TL105)', () => {
      const model = cell(type, THEOREM);
      expect(nodeOf(model, 'n').status).toMatchObject({ proof: { kind: 'proved', footprint: ['a', 'presup:S.T.exists'] }, flags: ['established'] });
      expect(codes(model, 'n')).toEqual([]);
    });
    it('H theorem with sorryAx: none + uses-sorry (TL115)', () => {
      const model = cell(type, SORRY);
      expect(nodeOf(model, 'n').status).toMatchObject({ proof: { kind: 'none' }, flags: ['uses-sorry'] });
      expect(codes(model, 'n')).toEqual(['TL115']);
    });
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

  it('rests-on-pending: a proof using the axiom of a proposition that is pending proof; not established', () => {
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
    expect(nodeOf(model, 'd').status.proof.kind).toBe('pending');
    expect(nodeOf(model, 'g').status).toMatchObject({ proof: { kind: 'proved', footprint: ['d', 'presup:S.T.exists'] }, flags: ['rests-on-pending'] });
  });

  it('self-evident: proved with no node in the footprint (and established: it rests on nothing)', () => {
    const body = [block({ id: 'e', type: 'DERIVATION', name: 'Truth', lean: 'S.e' }), 'abbrev e : Prop := True', 'theorem e.holds : e := trivial'].join('\n');
    const model = build({ ...VOCAB, 'Model/S/Main.lean': mainS(body) }).model;
    expect(nodeOf(model, 'e').status).toMatchObject({ proof: { kind: 'proved', footprint: [] }, flags: ['established', 'self-evident'] });
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
    expect(g.status.flags).not.toContain('established');
    expect(codes(model, 'g')).toContain('TL103');
    expect(codes(model)).toContain('TL104');
  });

  it('existence-commitment + TL108: the proof needs a presupposition no statement mentions', () => {
    const body = [block({ id: 'e', type: 'DERIVATION', name: 'Something exists', lean: 'S.e' }), 'abbrev e : Prop := ∃ x : T, True', 'theorem e.holds : e := ⟨t, trivial⟩'].join('\n');
    const model = build({ ...VOCAB, 'Model/S/Main.lean': mainS(body) }).model;
    const e = nodeOf(model, 'e');
    expect(e.lean.presupposes).toEqual([]);
    expect(e.status).toMatchObject({ proof: { kind: 'proved', footprint: ['presup:S.T.exists'] }, flags: ['established', 'self-evident', 'existence-commitment'] });
    expect(model.diagnostics.find((d) => d.code === 'TL108')).toMatchObject({ nodeId: 'e', severity: 'info' });
  });

  it('a proof resting on a GOAL asserted as an axiom: the goal is a pending proposition, the proof rests on pending (no TL116; TL102 "rests on pending", B.5)', () => {
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
    expect(nodeOf(model, 'g0').status.proof.kind).toBe('pending');
    expect(nodeOf(model, 'd').status.flags).toEqual(['rests-on-pending']);
    expect(codes(model, 'g0')).toEqual([]);
    // The integrator's decision on 1a's open item (docs/slice1-plan.md section 8): a warning beside the flag.
    expect(codes(model, 'd')).toEqual(['TL102']);
    expect(model.diagnostics.find((d) => d.code === 'TL102')).toMatchObject({ nodeId: 'd', severity: 'warning', message: 'The proof rests on pending: g0.' });
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

  it('no-rationale is an AXIOM flag (TL011), never a proposition one', () => {
    const body = [block({ id: 'x', type: 'ASSUMPTION', name: 'X' }), '', block({ id: 'y', type: 'GOAL', name: 'Y' }), '', block({ id: 'z', type: 'AXIOM', name: 'Z' })].join('\n');
    const model = build({ ...VOCAB, 'Model/S/Main.lean': mainS(body) }).model;
    expect(nodeOf(model, 'x').status.flags).toEqual(['no-rationale']);
    expect(nodeOf(model, 'z').status.flags).toEqual(['no-rationale']);
    expect(nodeOf(model, 'y').status.flags).toEqual([]);
    expect(codes(model, 'x')).toEqual(['TL011']);
    expect(nodeOf(model, 'x').status.formal).toBe('informal');
  });
});

describe('spec v4 B.5: the established flag (the green glow, BD-6)', () => {
  /** a (axiom) <- l (proved from a) <- v (proved from l), all propositions written with the new kind names. */
  const chain = (lHolds = 'theorem l.holds : l := a.holds', extra = '') =>
    [
      block({ id: 'a', type: 'AXIOM', name: 'A holds', rationale: 'r', lean: 'S.a' }),
      'abbrev a : Prop := Good t',
      'axiom a.holds : a',
      '',
      block({ id: 'l', type: 'PROPOSITION', name: 'L holds', premises: ['a'], lean: 'S.l' }),
      'abbrev l : Prop := Good t',
      lHolds,
      '',
      block({ id: 'v', type: 'PROPOSITION', name: 'V holds', premises: ['l'], lean: 'S.v' }),
      'abbrev v : Prop := Good t',
      'theorem v.holds : v := l.holds',
      extra,
    ].join('\n');

  it('proved, resting only on axiom cards (through another proved proposition): established', () => {
    const model = build({ ...VOCAB, 'Model/S/Main.lean': mainS(chain()) }).model;
    expect(nodeOf(model, 'l').status).toMatchObject({ proof: { kind: 'proved', footprint: ['a', 'presup:S.T.exists'] }, flags: ['established'] });
    // v's proof uses l (a theorem): its footprint lists what l rests on, a.
    expect(nodeOf(model, 'v').status).toMatchObject({ proof: { kind: 'proved', footprint: ['a', 'presup:S.T.exists'] }, flags: ['established'] });
    expect(nodeOf(model, 'a').status.flags).not.toContain('established');
    // The graph carries the flag to the board.
    expect(graphOf(model).nodes.find((n) => n.id === 'v')?.status.flags).toEqual(['established']);
  });

  it('resting on a pending proposition: not established, rests-on-pending (also two steps away)', () => {
    const model = build({ ...VOCAB, 'Model/S/Main.lean': mainS(chain('axiom l.holds : l')) }).model;
    expect(nodeOf(model, 'l').status).toMatchObject({ proof: { kind: 'pending' }, flags: [] });
    expect(nodeOf(model, 'v').status).toMatchObject({ proof: { kind: 'proved', footprint: ['l', 'presup:S.T.exists'] }, flags: ['rests-on-pending'] });
    const twoSteps = [
      chain('axiom l.holds : l'),
      '',
      block({ id: 'w', type: 'PROPOSITION', name: 'W holds', premises: ['v'], lean: 'S.w' }),
      'abbrev w : Prop := Good t',
      'theorem w.holds : w := v.holds',
    ].join('\n');
    const deeper = build({ ...VOCAB, 'Model/S/Main.lean': mainS(twoSteps) }).model;
    expect(nodeOf(deeper, 'w').status.flags).toEqual(['rests-on-pending']);
  });

  it('a proof with sorry, a hidden axiom, or a hypothesis is not established', () => {
    const sorry = build({ ...VOCAB, 'Model/S/Main.lean': mainS(chain('theorem l.holds : l := sorry')) }).model;
    expect(nodeOf(sorry, 'l').status.flags).toEqual(['uses-sorry']);
    // v's own proof is sorry-free, but its footprint (through l) carries sorryAx: proof none, flagged uses-sorry.
    expect(nodeOf(sorry, 'v').status.flags).not.toContain('established');
    const hidden = build({ ...VOCAB, 'Model/S/Main.lean': mainS(chain('theorem l.holds : l := secret', 'axiom secret : Good t')) }).model;
    expect(nodeOf(hidden, 'l').status.proof).toMatchObject({ kind: 'proved', footprint: ['presup:S.T.exists', 'axiom:S.secret'] });
    expect(nodeOf(hidden, 'l').status.flags).not.toContain('established');
    expect(nodeOf(hidden, 'v').status.flags).not.toContain('established');
    const conditional = build({ ...VOCAB, 'Model/S/Main.lean': mainS(chain('theorem l.holds (h : a) : l := h')) }).model;
    expect(nodeOf(conditional, 'l').status.proof.kind).toBe('conditional');
    expect(nodeOf(conditional, 'l').status.flags).not.toContain('established');
  });

  it('an axiom card in the footprint whose .holds states something else (TL114) leaves it unestablished (S-9)', () => {
    const mismatched = chain().replace('axiom a.holds : a', 'axiom a.holds : Good t');
    const model = build({ ...VOCAB, 'Model/S/Main.lean': mainS(mismatched) }).model;
    expect(nodeOf(model, 'a').status).toMatchObject({ proof: { kind: 'assumed' }, flags: ['holds-mismatch'] });
    expect(nodeOf(model, 'l').status.proof.kind).toBe('proved');
    expect(nodeOf(model, 'l').status.flags).not.toContain('established');
    expect(nodeOf(model, 'v').status.flags).not.toContain('established');
  });

  it('stale facts leave it unestablished: its own file, or a card its proof uses in another, unchanged file (S-3)', () => {
    const own = mainS(chain());
    const ownStale = build({ ...VOCAB, 'Model/S/Main.lean': `${own}\n-- typed since\n` }, { factsFrom: { 'Model/S/Main.lean': own } }).model;
    expect(nodeOf(ownStale, 'v').status.proof.kind).toBe('proved');
    expect(nodeOf(ownStale, 'v').status.flags).toEqual(['stale']);
    // l lives in Lemmas.lean, which changed since the check; v (Main.lean, unchanged) uses it.
    const lemmas = mainS(
      [
        block({ id: 'a', type: 'AXIOM', name: 'A holds', rationale: 'r', lean: 'S.a' }),
        'abbrev a : Prop := Good t',
        'axiom a.holds : a',
        '',
        block({ id: 'l', type: 'PROPOSITION', name: 'L holds', premises: ['a'], lean: 'S.l' }),
        'abbrev l : Prop := Good t',
        'theorem l.holds : l := a.holds',
      ].join('\n'),
    );
    const main = mainS([block({ id: 'v', type: 'PROPOSITION', name: 'V holds', premises: ['l'], lean: 'S.v' }), 'abbrev v : Prop := Good t', 'theorem v.holds : v := l.holds'].join('\n'));
    const fresh = build({ ...VOCAB, 'Model/S/Lemmas.lean': lemmas, 'Model/S/Main.lean': main }).model;
    expect(nodeOf(fresh, 'v').status.flags).toEqual(['established']);
    const otherStale = build({ ...VOCAB, 'Model/S/Lemmas.lean': `${lemmas}\n-- typed since\n`, 'Model/S/Main.lean': main }, { factsFrom: { 'Model/S/Lemmas.lean': lemmas } }).model;
    expect(nodeOf(otherStale, 'l').status.flags).toEqual(['stale']);
    expect(nodeOf(otherStale, 'v').status.flags).toEqual([]);
    expect(nodeOf(otherStale, 'v').status.proof.kind).toBe('proved');
  });

  describe('direct(v): the cards the proof reaches, beyond its footprint (S-3, S-9; slice 1a fixer)', () => {
    // a (an axiom card) in Axioms.lean; l (a theorem from a) in Lemmas.lean; v (proved from l) in Main.lean. v's
    // footprint is {a} only (l is a theorem), so only the walk through direct(v) sees l.
    const axioms = mainS([block({ id: 'a', type: 'AXIOM', name: 'A holds', rationale: 'r', lean: 'S.a' }), 'abbrev a : Prop := Good t', 'axiom a.holds : a'].join('\n'));
    const lemmas = (lHolds: string) => mainS([block({ id: 'l', type: 'PROPOSITION', name: 'L holds', premises: ['a'], lean: 'S.l' }), 'abbrev l : Prop := Good t', lHolds].join('\n'));
    const main = mainS([block({ id: 'v', type: 'PROPOSITION', name: 'V holds', premises: ['l'], lean: 'S.v' }), 'abbrev v : Prop := Good t', 'theorem v.holds : v := l.holds'].join('\n'));
    const files = (lHolds: string) => ({ ...VOCAB, 'Model/S/Axioms.lean': axioms, 'Model/S/Lemmas.lean': lemmas(lHolds), 'Model/S/Main.lean': main });

    it('everything fresh and stating its statement: established', () => {
      const model = build(files('theorem l.holds : l := a.holds')).model;
      expect(nodeOf(model, 'v').status).toMatchObject({ proof: { kind: 'proved', footprint: ['a', 'presup:S.T.exists'] }, flags: ['established'] });
    });

    it('l, which v uses, changed since the check while a (its footprint) and v are fresh: v is proved, not established', () => {
      const fresh = files('theorem l.holds : l := a.holds');
      const model = build({ ...fresh, 'Model/S/Lemmas.lean': `${fresh['Model/S/Lemmas.lean']}\n-- typed since\n` }, { factsFrom: { 'Model/S/Lemmas.lean': fresh['Model/S/Lemmas.lean'] } }).model;
      expect(nodeOf(model, 'a').status.flags).toEqual([]);
      expect(nodeOf(model, 'l').status.flags).toEqual(['stale']);
      expect(nodeOf(model, 'v').status).toMatchObject({ proof: { kind: 'proved', footprint: ['a', 'presup:S.T.exists'] }, flags: [] });
    });

    it("l's .holds states something else (TL114) while v's footprint {a} is fine: v is proved, not established", () => {
      const model = build(files('theorem l.holds : Good t := a.holds')).model;
      expect(nodeOf(model, 'l').status.flags).toEqual(['holds-mismatch']);
      expect(nodeOf(model, 'a').status.flags).toEqual([]);
      expect(nodeOf(model, 'v').status).toMatchObject({ proof: { kind: 'proved', footprint: ['a', 'presup:S.T.exists'] }, flags: [] });
    });
  });
});
