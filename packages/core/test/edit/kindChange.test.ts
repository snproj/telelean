/**
 * AT2.8: planKindChange covers every cell of the D-11 table (docs/m1-plan.md section 6.2; spec v4: two kinds,
 * docs/slice1-plan.md 2.4): P->A by the `.holds` it has, with the card's arrows dropped (AR-7), and A->P refused
 * (AR-6); its impact matches kindChangeImpact. The cards still say ASSUMPTION, DERIVATION and GOAL: the aliases.
 * Plans only (no text): independent of WP-markup. (Conditional proofs and their dependents: conditional.test.ts.)
 */
import { describe, expect, it } from 'vitest';
import { ActionError } from '../../src/actions.js';
import { planKindChange } from '../../src/edit/index.js';
import { modelSemantic } from '../../src/edit/planKind.js';
import { AXIOM_TO_PROPOSITION_REFUSAL, kindChangeImpact } from '../../src/kindChange.js';
import type { NodeType } from '../../src/model.js';
import { subjectGraph, type ProjectModel } from '../../src/project/index.js';
import { block, build, mainS, VOCAB_S, type BuildOptions } from '../project/helpers/build.js';

const BODY = [
  block({ id: 'a1', type: 'ASSUMPTION', name: 'A1', rationale: 'r', lean: 'S.a1' }),
  'abbrev a1 : Prop := Good t',
  'axiom a1.holds : a1',
  '',
  block({ id: 'a2', type: 'ASSUMPTION', name: 'A2', rationale: 'r', lean: 'S.a2' }),
  'abbrev a2 : Prop := Bad t',
  'axiom a2.holds : a2',
  '',
  block({ id: 'a0', type: 'ASSUMPTION', name: 'A0 without holds', rationale: 'r', lean: 'S.a0' }),
  'abbrev a0 : Prop := Good t',
  '',
  block({ id: 'at', type: 'ASSUMPTION', name: 'AT proved', rationale: 'r', premises: ['a1'], lean: 'S.at' }),
  'abbrev at : Prop := Good t',
  'theorem at.holds : at := a1.holds',
  '',
  block({ id: 'dp', type: 'DERIVATION', name: 'DP pending', lean: 'S.dp' }),
  'abbrev dp : Prop := Bad t',
  'axiom dp.holds : dp',
  '',
  block({ id: 'd0', type: 'DERIVATION', name: 'D0 unproved', lean: 'S.d0' }),
  'abbrev d0 : Prop := Good t ∧ Bad t',
  '',
  block({ id: 'dt', type: 'DERIVATION', name: 'DT proved', premises: ['a1'], lean: 'S.dt' }),
  'abbrev dt : Prop := Good t',
  'theorem dt.holds : dt := a1.holds',
  '',
  block({ id: 'g0', type: 'GOAL', name: 'G0 unproved', premises: ['a1'], lean: 'S.g0' }),
  'abbrev g0 : Prop := Bad t',
  '',
  block({ id: 'ga', type: 'GOAL', name: 'GA asserted', lean: 'S.ga' }),
  'abbrev ga : Prop := Good t',
  'axiom ga.holds : ga',
  '',
  block({ id: 'gt', type: 'GOAL', name: 'GT proved', premises: ['dt'], lean: 'S.gt' }),
  'abbrev gt : Prop := Good t',
  'theorem gt.holds : gt := dt.holds',
  '',
  block({ id: 'both', type: 'GOAL', name: 'Both', premises: ['a1', 'a2'], lean: 'S.both' }),
  'abbrev both : Prop := a1 ∧ a2',
  '',
  block({ id: 'cl', type: 'GOAL', name: 'Code-less' }),
].join('\n');

function model(extra = '', options: BuildOptions = {}): ProjectModel {
  return build({ 'Model/S/Vocabulary.lean': VOCAB_S, 'Model/S/Main.lean': mainS(`${BODY}\n${extra}`) }, options).model;
}

const opsOf = (plan: ReturnType<typeof planKindChange>) => plan.leanOps.flatMap((g) => g.ops.map((op) => ({ file: g.file, ...op })));
const kinds = (plan: ReturnType<typeof planKindChange>) => opsOf(plan).map((op) => op.op);

function refusal(fn: () => unknown): ActionError {
  try {
    fn();
  } catch (error) {
    if (error instanceof ActionError) return error;
    throw error;
  }
  throw new Error('expected an ActionError');
}

describe('AT2.8 planKindChange: the D-11 table', () => {
  const m = model();
  const cell = (id: string, to: NodeType) => planKindChange(m, { id, to });

  it('code-less: only type: changes', () => {
    const plan = cell('cl', 'AXIOM');
    expect(plan.fieldChanges).toEqual([{ key: 'type', value: 'AXIOM' }]);
    expect(kinds(plan)).toEqual([]);
  });

  it('P->A of an unproved proposition (DERIVATION and GOAL aliases): add-holds-axiom', () => {
    expect(opsOf(cell('g0', 'AXIOM'))).toEqual([{ file: 'Model/S/Main.lean', op: 'add-holds-axiom', statement: 'S.g0' }]);
    expect(kinds(cell('d0', 'AXIOM'))).toEqual(['add-holds-axiom']);
  });

  it('P->A of a pending proposition keeps its axiom: type only (A13)', () => {
    expect(m.nodes.get('dp')?.node.status.proof.kind).toBe('pending');
    expect(m.nodes.get('ga')?.node.status.proof.kind).toBe('pending');
    expect(kinds(cell('dp', 'AXIOM'))).toEqual([]);
    expect(kinds(cell('ga', 'AXIOM'))).toEqual([]);
  });

  it('P->A of a proved proposition: holds-theorem-to-axiom', () => {
    expect(opsOf(cell('gt', 'AXIOM'))).toEqual([{ file: 'Model/S/Main.lean', op: 'holds-theorem-to-axiom', statement: 'S.gt' }]);
    expect(kinds(cell('dt', 'AXIOM'))).toEqual(['holds-theorem-to-axiom']);
  });

  it('P->A removes the incoming arrows (`premises:`) and the "follows from nothing" mark in the same plan (AR-7)', () => {
    expect(cell('g0', 'AXIOM').fieldChanges).toEqual([
      { key: 'type', value: 'AXIOM' },
      { key: 'premises', value: null },
    ]);
    expect(cell('dp', 'AXIOM').fieldChanges).toEqual([{ key: 'type', value: 'AXIOM' }]);
    const marked = model([block({ id: 'fn', type: 'PROPOSITION', name: 'FN from nothing', followsFrom: 'nothing', lean: 'S.fn' }), 'abbrev fn : Prop := Good t', ''].join('\n'));
    expect(marked.nodes.get('fn')?.node.fromNothing).toBe(true);
    const plan = planKindChange(marked, { id: 'fn', to: 'AXIOM' });
    expect(plan.fieldChanges).toEqual([
      { key: 'type', value: 'AXIOM' },
      { key: 'follows_from', value: null },
    ]);
    expect(kinds(plan)).toEqual(['add-holds-axiom']);
  });

  it('A->P is refused with invalid, whatever the axiom holds (AR-6: an arrow or "follows from nothing" does it)', () => {
    const withCodeLess = model([block({ id: 'cl-a', type: 'AXIOM', name: 'A code-less axiom', rationale: 'r' }), ''].join('\n'));
    for (const id of ['a1', 'a0', 'at', 'cl-a']) {
      const error = refusal(() => planKindChange(withCodeLess, { id, to: 'PROPOSITION' }));
      expect(error.code, id).toBe('invalid');
      expect(error.message, id).toBe(AXIOM_TO_PROPOSITION_REFUSAL);
    }
  });

  it('its impact matches kindChangeImpact on the same graph', () => {
    const graph = subjectGraph(m, 'S', { version: 0, semantic: modelSemantic(m) });
    const cases: Array<[string, NodeType]> = [
      ['g0', 'AXIOM'],
      ['gt', 'AXIOM'],
      ['dt', 'AXIOM'],
      ['dp', 'AXIOM'],
      ['cl', 'AXIOM'],
    ];
    for (const [id, to] of cases) {
      const plan = planKindChange(m, { id, to });
      expect(plan.impact, `${id} -> ${to}`).toEqual(kindChangeImpact(graph, id, to));
    }
    expect(refusal(() => planKindChange(m, { id: 'a1', to: 'AXIOM' })).code).toBe('invalid');
    expect(refusal(() => planKindChange(m, { id: 'nope', to: 'AXIOM' })).code).toBe('not-found');
  });

  it('kindChangeImpact still describes A->P for the arrow gestures (AR-6): the axiom stays, pending proof', () => {
    const graph = subjectGraph(m, 'S', { version: 0, semantic: modelSemantic(m) });
    expect(kindChangeImpact(graph, 'a1', 'PROPOSITION')).toMatchObject({
      leanChange: 'pending',
      summary: 'Becomes a proposition: pending proof until proved',
      // Of its three dependents, `at` is an axiom card (TL106: it never glows); dt and gt are established (BD-6).
      detail: '`axiom a1.holds` stays, marked pending proof, until a run proves it (`theorem a1.holds : … := …`). 2 cards that rest on it will lose their green glow until it is proved.',
      dependents: ['at', 'dt', 'gt'],
      needsConfirmation: false,
      asksRationale: false,
    });
    expect(kindChangeImpact(graph, 'at', 'PROPOSITION')).toMatchObject({ leanChange: 'none', summary: 'Becomes a proposition: already proved' });
    expect(kindChangeImpact(graph, 'a0', 'PROPOSITION')).toMatchObject({ leanChange: 'none', summary: 'Becomes a proposition: unproved until a run proves it' });
  });
});
