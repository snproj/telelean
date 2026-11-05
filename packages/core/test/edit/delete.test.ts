/**
 * AT2.7 (plan part): planDelete lists premise removals, removed declarations and broken dependents (proofs that use
 * the removed `.holds` and statements that mention the removed abbrev); keepLean leaves an unmarked axiom. Plus the
 * layout-only and validation paths of planAction that never touch text (reorder, set-premises refusals).
 */
import { describe, expect, it } from 'vitest';
import { ActionError } from '../../src/actions.js';
import { planAction, planDelete, type PlanContext } from '../../src/edit/index.js';
import { emptyLayout } from '../../src/layout.js';
import { block, build, mainS, VOCAB_S } from '../project/helpers/build.js';

const BODY = [
  block({ id: 'a1', type: 'ASSUMPTION', name: 'A1', rationale: 'r', lean: 'S.a1' }),
  'abbrev a1 : Prop := Good t',
  'axiom a1.holds : a1',
  '',
  block({ id: 'a2', type: 'ASSUMPTION', name: 'A2', rationale: 'r', lean: 'S.a2' }),
  'abbrev a2 : Prop := Bad t',
  'axiom a2.holds : a2',
  '',
  block({ id: 'dt', type: 'DERIVATION', name: 'DT', premises: ['a1'], lean: 'S.dt' }),
  'abbrev dt : Prop := Good t',
  'theorem dt.holds : dt := a1.holds',
  '',
  block({ id: 'gt', type: 'GOAL', name: 'GT', premises: ['dt', 'a2'], lean: 'S.gt' }),
  'abbrev gt : Prop := Good t',
  'theorem gt.holds : gt := dt.holds',
  '',
  block({ id: 'both', type: 'GOAL', name: 'Both', premises: ['a1', 'a2'], lean: 'S.both' }),
  'abbrev both : Prop := a1 ∧ a2',
  '',
  'theorem helper : Good t := a1.holds',
].join('\n');

const model = () => build({ 'Model/S/Vocabulary.lean': VOCAB_S, 'Model/S/Main.lean': mainS(BODY) }).model;
const CTX: PlanContext = { today: '2026-11-02', now: '2026-11-02T10:00:00.000Z', layouts: {} };

function refusal(fn: () => unknown): ActionError {
  try {
    fn();
  } catch (error) {
    if (error instanceof ActionError) return error;
    throw error;
  }
  throw new Error('expected an ActionError');
}

describe('AT2.7 planDelete', () => {
  it('lists the premise removals, the removed declarations and what breaks (proof users and statements mentioning the abbrev)', () => {
    expect(planDelete(model(), { id: 'a1', keepLean: false })).toEqual({
      id: 'a1',
      removeDecls: ['S.a1', 'S.a1.holds'],
      premiseRemovals: ['dt', 'both'],
      brokenDependents: ['S.both', 'S.dt.holds', 'S.helper', 'S.gt.holds'],
      leavesUnmarkedAxiom: false,
    });
  });

  it('keepLean removes nothing from Lean; an axiom .holds left behind becomes an unmarked assumption', () => {
    expect(planDelete(model(), { id: 'a2', keepLean: true })).toEqual({ id: 'a2', removeDecls: [], premiseRemovals: ['gt', 'both'], brokenDependents: [], leavesUnmarkedAxiom: true });
    expect(planDelete(model(), { id: 'dt', keepLean: true }).leavesUnmarkedAxiom).toBe(false);
  });

  it('a code-less card removes no declaration', () => {
    const m = build({ 'Model/S/Vocabulary.lean': VOCAB_S, 'Model/S/Main.lean': mainS(block({ id: 'x', type: 'GOAL', name: 'X' })) }).model;
    expect(planDelete(m, { id: 'x', keepLean: false })).toEqual({ id: 'x', removeDecls: [], premiseRemovals: [], brokenDependents: [], leavesUnmarkedAxiom: false });
    expect(refusal(() => planDelete(m, { id: 'nope', keepLean: false })).code).toBe('not-found');
  });
});

describe('D-18 delete with its Lean asks first when other declarations use it', () => {
  it('refuses with needs-confirmation listing the cards (then untracked declarations) that would stop compiling', () => {
    const error = refusal(() => planAction(model(), { kind: 'delete-node', id: 'a1', keepLean: false }, CTX));
    expect(error.code).toBe('needs-confirmation');
    expect(error.dependents).toEqual(['both', 'dt', 'gt', 'S.helper']);
    expect(error.message).toMatch(/breaks 4 declarations that use it \(Both; DT; GT; … \(1 more\)\): they stop compiling/);
  });

  it('with one dependent the refusal is worded in the singular', () => {
    const error = refusal(() => planAction(model(), { kind: 'delete-node', id: 'dt', keepLean: false }, CTX));
    expect(error.code).toBe('needs-confirmation');
    expect(error.dependents).toEqual(['gt']);
    expect(error.message).toBe('Deleting its Lean code breaks a declaration that uses it (GT), which stops compiling. Delete anyway, or keep its Lean.');
  });

  it('goes ahead when confirmed, or when the Lean is kept, or when nothing uses it', () => {
    const confirmed = planAction(model(), { kind: 'delete-node', id: 'a1', keepLean: false, confirmed: true }, CTX);
    expect(confirmed.label).toBe('Delete: A1');
    expect(confirmed.changes.find((c) => c.path === 'Model/S/Main.lean')?.after).not.toContain('abbrev a1');
    expect(planAction(model(), { kind: 'delete-node', id: 'a1', keepLean: true }, CTX).label).toBe('Delete: A1');
    expect(planAction(model(), { kind: 'delete-node', id: 'both', keepLean: false }, CTX).label).toBe('Delete: Both');
  });
});

describe('AT2.6 reorder and set-premises refusals (no text involved)', () => {
  it('reorder changes only the layout (layoutOnly), pinning the column order the board shows', () => {
    const plan = planAction(model(), { kind: 'reorder', id: 'a2', column: 'ASSUMPTION', beforeId: 'a1' }, { ...CTX, layouts: { S: emptyLayout() } });
    expect(plan).toEqual({
      action: 'reorder',
      label: 'Move: A2',
      subject: 'S',
      nodes: ['a2'],
      changes: [],
      layout: { subject: 'S', layout: { ...emptyLayout(), columns: { ASSUMPTION: ['a2', 'a1'], DERIVATION: ['dt'], GOAL: ['gt', 'both'] } } },
      layoutOnly: true,
    });
    expect(refusal(() => planAction(model(), { kind: 'reorder', id: 'a2', column: 'GOAL', beforeId: null }, CTX)).code).toBe('invalid');
  });

  it('set-premises: a cycle, a self-reference, an unknown card or another subject is invalid; no premises is not-yet', () => {
    const m = model();
    const cycle = refusal(() => planAction(m, { kind: 'set-premises', target: 'a1', premises: ['gt'] }, CTX));
    expect(cycle.code).toBe('invalid');
    expect(cycle.message).toMatch(/cycle/);
    expect(refusal(() => planAction(m, { kind: 'set-premises', target: 'gt', premises: ['gt'] }, CTX)).code).toBe('invalid');
    expect(refusal(() => planAction(m, { kind: 'set-premises', target: 'gt', premises: ['nope'] }, CTX)).code).toBe('invalid');
    const empty = refusal(() => planAction(m, { kind: 'set-premises', target: 'gt', premises: [] }, CTX));
    expect(empty).toMatchObject({ code: 'not-yet', message: 'Self-evident? arrives with Claude in M2' });
    expect(refusal(() => planAction(m, { kind: 'set-premises', target: 'nope', premises: ['a1'] }, CTX)).code).toBe('not-found');
  });
});
