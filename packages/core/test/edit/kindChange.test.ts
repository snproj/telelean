/**
 * AT2.8: planKindChange covers every cell of the D-11 table (docs/m1-plan.md section 6.2), its refusals
 * (needs-confirmation, facts-stale, unsafe) and the rewrite's spans; its impact matches kindChangeImpact.
 * Plans only (no text): independent of WP-markup.
 */
import { describe, expect, it } from 'vitest';
import { ActionError } from '../../src/actions.js';
import { planKindChange } from '../../src/edit/index.js';
import { modelSemantic } from '../../src/edit/planKind.js';
import { kindChangeImpact } from '../../src/kindChange.js';
import type { LeanOp } from '../../src/markup/types.js';
import type { NodeType } from '../../src/model.js';
import { subjectGraph, type ProjectModel } from '../../src/project/index.js';
import { block, build, mainS, VOCAB_S, type BuildOptions } from '../project/helpers/build.js';
import { confirmed } from './helpers/confirm.js';

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
  const cell = (id: string, to: NodeType) => {
    const plan = planKindChange(m, { id, to });
    expect(plan.fieldChanges).toEqual([{ key: 'type', value: to }]);
    return plan;
  };

  it('code-less: only type: changes, whatever the target', () => {
    for (const to of ['ASSUMPTION', 'DERIVATION'] as const) expect(kinds(cell('cl', to))).toEqual([]);
  });

  it('G->D: type only (absent, axiom, theorem)', () => {
    expect(kinds(cell('g0', 'DERIVATION'))).toEqual([]);
    expect(kinds(cell('ga', 'DERIVATION'))).toEqual([]);
    expect(kinds(cell('gt', 'DERIVATION'))).toEqual([]);
  });

  it('G->A: add-holds-axiom when absent, nothing for an axiom, holds-theorem-to-axiom for a theorem', () => {
    expect(opsOf(cell('g0', 'ASSUMPTION'))).toEqual([{ file: 'Model/S/Main.lean', op: 'add-holds-axiom', statement: 'S.g0' }]);
    expect(kinds(cell('ga', 'ASSUMPTION'))).toEqual([]);
    expect(opsOf(cell('gt', 'ASSUMPTION'))).toEqual([{ file: 'Model/S/Main.lean', op: 'holds-theorem-to-axiom', statement: 'S.gt' }]);
  });

  it('D->A: add-holds-axiom when absent, nothing for a pending axiom, holds-theorem-to-axiom for a theorem', () => {
    expect(kinds(cell('d0', 'ASSUMPTION'))).toEqual(['add-holds-axiom']);
    expect(kinds(cell('dp', 'ASSUMPTION'))).toEqual([]);
    expect(kinds(cell('dt', 'ASSUMPTION'))).toEqual(['holds-theorem-to-axiom']);
  });

  it('A->D: type only; an axiom stays and the promotion is pending', () => {
    expect(kinds(cell('a0', 'DERIVATION'))).toEqual([]);
    const pending = cell('a1', 'DERIVATION');
    expect(kinds(pending)).toEqual([]);
    expect(pending.impact).toMatchObject({ leanChange: 'pending-promotion', summary: 'Make Derivation: promotion pending until proved' });
    expect(kinds(cell('at', 'DERIVATION'))).toEqual([]);
  });

  it('A->G, D->G without dependents: remove-holds (a theorem is archived); absent .holds: type only', () => {
    expect(kinds(cell('a0', 'GOAL'))).toEqual([]);
    expect(kinds(cell('d0', 'GOAL'))).toEqual([]);
    expect(opsOf(cell('a2', 'GOAL'))).toEqual([{ file: 'Model/S/Main.lean', op: 'remove-holds', statement: 'S.a2', archive: false }]);
    expect(opsOf(cell('at', 'GOAL'))).toEqual([{ file: 'Model/S/Main.lean', op: 'remove-holds', statement: 'S.at', archive: true }]);
    expect(opsOf(cell('dp', 'GOAL'))).toEqual([{ file: 'Model/S/Main.lean', op: 'remove-holds', statement: 'S.dp', archive: false }]);
  });

  it('A->G, D->G with dependents and no choice: needs-confirmation listing them', () => {
    const a1 = refusal(() => planKindChange(m, { id: 'a1', to: 'GOAL' }));
    expect(a1.code).toBe('needs-confirmation');
    expect(a1.dependents).toEqual(['at', 'dt', 'gt']);
    expect(a1.message).toMatch(/removes a1\.holds/);
    const dt = refusal(() => planKindChange(m, { id: 'dt', to: 'GOAL' }));
    expect(dt.dependents).toEqual(['gt']);
  });

  it('untracked users are dependents too (by their Lean name)', () => {
    const withHelper = model('\ntheorem helper : Good t := a2.holds');
    const error = refusal(() => planKindChange(withHelper, { id: 'a2', to: 'GOAL' }));
    expect(error.dependents).toEqual(['S.helper']);
    const plan = planKindChange(withHelper, confirmed(withHelper, { id: 'a2', to: 'GOAL', dependents: 'mark-broken' }));
    expect(plan.impact).toMatchObject({ needsConfirmation: true, dependents: ['S.helper'] });
  });

  it('mark-broken: remove-holds, and the users are listed as broken', () => {
    const plan = planKindChange(m, confirmed(m, { id: 'a1', to: 'GOAL', dependents: 'mark-broken' }));
    expect(opsOf(plan)).toEqual([{ file: 'Model/S/Main.lean', op: 'remove-holds', statement: 'S.a1', archive: false }]);
    expect(plan.broken).toEqual(['S.at.holds', 'S.dt.holds', 'S.gt.holds']);
  });

  it('rewrite: binder first on every user, apply-hypothesis for the closure members, then remove-holds; spans from the facts', () => {
    const plan = planKindChange(m, confirmed(m, { id: 'a1', to: 'GOAL', dependents: 'rewrite' }));
    expect(plan.broken).toEqual([]);
    const ops = opsOf(plan);
    expect(ops.map((op) => [op.op, 'decl' in op ? op.decl : 'statement' in op ? op.statement : op.name])).toEqual([
      ['add-hypothesis', 'S.at.holds'],
      ['add-hypothesis', 'S.dt.holds'],
      ['add-hypothesis', 'S.gt.holds'],
      ['apply-hypothesis', 'S.gt.holds'],
      ['remove-holds', 'S.a1'],
    ]);
    const text = m.files.get('Model/S/Main.lean')?.text ?? '';
    const covered = (op: LeanOp) => ('replace' in op ? op.replace.map((s) => text.slice(s.start, s.end)) : []);
    expect(ops[0]).toMatchObject({ hypName: 'h_a1', hypType: 'a1' });
    expect(covered(ops[0] as LeanOp)).toEqual(['a1.holds']);
    expect(covered(ops[1] as LeanOp)).toEqual(['a1.holds']);
    expect(covered(ops[2] as LeanOp)).toEqual([]);
    expect(covered(ops[3] as LeanOp)).toEqual(['dt.holds']);
    expect(ops[4]).toMatchObject({ archive: false });
  });

  it('rewrite picks a hypothesis name no user mentions yet', () => {
    const taken = model('\ntheorem uses_name (h_a2 : True) : Good t := a2.holds');
    const plan = planKindChange(taken, confirmed(taken, { id: 'a2', to: 'GOAL', dependents: 'rewrite' }));
    expect(opsOf(plan)[0]).toMatchObject({ op: 'add-hypothesis', decl: 'S.uses_name', hypName: 'h_a2_2' });
  });

  it('rewrite refuses with facts-stale unless every touched file is fresh', () => {
    const original = mainS(`${BODY}\n`);
    const stale = build({ 'Model/S/Vocabulary.lean': VOCAB_S, 'Model/S/Main.lean': `${original}\n-- typed since\n` }, { factsFrom: { 'Model/S/Main.lean': original } }).model;
    expect(stale.freshFiles.has('Model/S/Main.lean')).toBe(false);
    expect(refusal(() => planKindChange(stale, confirmed(stale, { id: 'a1', to: 'GOAL', dependents: 'rewrite' }))).code).toBe('facts-stale');
    // mark-broken needs no exact spans.
    expect(kinds(planKindChange(stale, confirmed(stale, { id: 'a1', to: 'GOAL', dependents: 'mark-broken' })))).toEqual(['remove-holds']);
  });

  it('rewrite refuses with unsafe when a user is not a theorem', () => {
    const withDef = model('\ndef witness : Good t := a2.holds');
    const error = refusal(() => planKindChange(withDef, confirmed(withDef, { id: 'a2', to: 'GOAL', dependents: 'rewrite' })));
    expect(error.code).toBe('unsafe');
    expect(error.dependents).toEqual(['S.witness']);
  });

  it('rewrite refuses with unsafe when an axiom .holds is used where the references do not show it', () => {
    const hidden = model('\ntheorem sneaky : True := trivial', { facts: { overrides: { 'S.sneaky': { axioms: ['S.a2.holds'] } } } });
    const error = refusal(() => planKindChange(hidden, confirmed(hidden, { id: 'a2', to: 'GOAL', dependents: 'rewrite' })));
    expect(error.code).toBe('unsafe');
    expect(error.dependents).toEqual(['S.sneaky']);
  });

  it('without fresh facts, uses found in the text still count as dependents (nothing is removed silently)', () => {
    const unchecked = model('', { facts: false });
    const error = refusal(() => planKindChange(unchecked, { id: 'a1', to: 'GOAL' }));
    expect(error.code).toBe('needs-confirmation');
    expect(error.dependents).toEqual(['at', 'dt', 'gt']);
    expect(refusal(() => planKindChange(unchecked, confirmed(unchecked, { id: 'a1', to: 'GOAL', dependents: 'rewrite' }))).code).toBe('facts-stale');
  });

  it('its impact matches kindChangeImpact on the same graph', () => {
    const graph = subjectGraph(m, 'S', { version: 0, semantic: modelSemantic(m) });
    const cases: Array<[string, NodeType, 'rewrite' | 'mark-broken' | undefined]> = [
      ['g0', 'ASSUMPTION', undefined],
      ['gt', 'ASSUMPTION', undefined],
      ['a1', 'DERIVATION', undefined],
      ['a2', 'GOAL', undefined],
      ['a1', 'GOAL', 'mark-broken'],
      ['dt', 'GOAL', 'rewrite'],
      ['cl', 'ASSUMPTION', undefined],
    ];
    for (const [id, to, dependents] of cases) {
      const plan = planKindChange(m, dependents ? confirmed(m, { id, to, dependents }) : { id, to });
      expect(plan.impact, `${id} -> ${to}`).toEqual(kindChangeImpact(graph, id, to));
    }
    expect(refusal(() => planKindChange(m, { id: 'a1', to: 'ASSUMPTION' })).code).toBe('invalid');
    expect(refusal(() => planKindChange(m, { id: 'nope', to: 'GOAL' })).code).toBe('not-found');
  });
});
