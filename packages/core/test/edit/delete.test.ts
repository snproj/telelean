/**
 * AT2.7 (plan part): planDelete lists premise removals, removed declarations and broken dependents (proofs that use
 * the removed `.holds` and statements that mention the removed abbrev). Slice 2i (spec v4 S9, ES-9): a delete always
 * removes the card's Lean; the card-only delete, which left `axiom ….holds` behind as an unmarked axiom, is gone. Plus
 * the layout-only and validation paths of planAction that never touch text (reorder, set-premises refusals).
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
    expect(planDelete(model(), { id: 'a1' })).toEqual({
      id: 'a1',
      removeDecls: ['S.a1', 'S.a1.holds'],
      premiseRemovals: ['dt', 'both'],
      brokenDependents: ['S.both', 'S.dt.holds', 'S.helper', 'S.gt.holds'],
    });
  });

  it('slice 2i (S9): an axiom\'s Lean always goes with it, so no `axiom ….holds` is left behind as an unmarked assumption', () => {
    expect(planDelete(model(), { id: 'a2' })).toEqual({ id: 'a2', removeDecls: ['S.a2', 'S.a2.holds'], premiseRemovals: ['gt', 'both'], brokenDependents: ['S.both'] });
    // A theorem's statement and .holds go too (one dependent), and a statement without a .holds goes alone (none).
    expect(planDelete(model(), { id: 'dt' })).toEqual({ id: 'dt', removeDecls: ['S.dt', 'S.dt.holds'], premiseRemovals: ['gt'], brokenDependents: ['S.gt.holds'] });
    expect(planDelete(model(), { id: 'both' })).toEqual({ id: 'both', removeDecls: ['S.both'], premiseRemovals: [], brokenDependents: [] });
    // The plan the board carries out ("Delete anyway"): the abbrev and the axiom both leave the file.
    const plan = planAction(model(), { kind: 'delete-node', id: 'a2', confirmed: true }, CTX);
    const after = plan.changes.find((c) => c.path === 'Model/S/Main.lean')?.after ?? '';
    expect(after).not.toContain('a2.holds');
    expect(after).not.toContain('abbrev a2');
    expect(after).not.toContain('id: a2');
    expect(after).toContain('axiom a1.holds : a1'); // the other axiom stays
    // What is left declares neither: no `axiom a2.holds` without its card (an unmarked axiom, a hidden belief).
    const left = build({ 'Model/S/Vocabulary.lean': VOCAB_S, 'Model/S/Main.lean': after }).model;
    const declared = [...left.files.values()].flatMap((f) => f.decls.map((d) => d.fullName));
    expect(declared).toContain('S.a1.holds');
    expect(declared.filter((name) => name === 'S.a2' || name === 'S.a2.holds')).toEqual([]);
    expect(left.nodes.has('a2')).toBe(false);
  });

  it('slice 2i round 1 (F-F1): an axiom `.holds` whose abbrev is missing still goes with the card, so none is left behind', () => {
    const body = [
      block({ id: 'o', type: 'ASSUMPTION', name: 'O', rationale: 'r', lean: 'S.o' }),
      'axiom o.holds : Good t',
      '',
      block({ id: 'k', type: 'ASSUMPTION', name: 'K', rationale: 'r', lean: 'S.k' }),
      'abbrev k : Prop := Good t',
      'axiom k.holds : k',
    ].join('\n');
    const m = build({ 'Model/S/Vocabulary.lean': VOCAB_S, 'Model/S/Main.lean': mainS(body) }).model;
    expect(planDelete(m, { id: 'o' })).toEqual({ id: 'o', removeDecls: ['S.o.holds'], premiseRemovals: [], brokenDependents: [] });
    const after = planAction(m, { kind: 'delete-node', id: 'o' }, CTX).changes.find((c) => c.path === 'Model/S/Main.lean')?.after ?? '';
    expect(after).not.toContain('o.holds');
    expect(after).not.toContain('id: o');
    expect(after).toContain('axiom k.holds : k'); // the other card's Lean stays
  });

  it('a code-less card removes no declaration; an unknown card is not-found', () => {
    const m = build({ 'Model/S/Vocabulary.lean': VOCAB_S, 'Model/S/Main.lean': mainS(block({ id: 'x', type: 'GOAL', name: 'X' })) }).model;
    expect(planDelete(m, { id: 'x' })).toEqual({ id: 'x', removeDecls: [], premiseRemovals: [], brokenDependents: [] });
    expect(refusal(() => planDelete(m, { id: 'nope' })).code).toBe('not-found');
  });
});

describe('D-18 delete with its Lean asks first when other declarations use it', () => {
  it('refuses with needs-confirmation listing the cards (then untracked declarations) that would stop compiling', () => {
    const error = refusal(() => planAction(model(), { kind: 'delete-node', id: 'a1' }, CTX));
    expect(error.code).toBe('needs-confirmation');
    expect(error.dependents).toEqual(['both', 'dt', 'gt', 'S.helper']);
    expect(error.message).toBe('Deleting its Lean code breaks 4 declarations that use it (Both; DT; GT; … (1 more)): they stop compiling. Delete anyway, or cancel.');
  });

  it('with one dependent the refusal is worded in the singular', () => {
    const error = refusal(() => planAction(model(), { kind: 'delete-node', id: 'dt' }, CTX));
    expect(error.code).toBe('needs-confirmation');
    expect(error.dependents).toEqual(['gt']);
    expect(error.message).toBe('Deleting its Lean code breaks a declaration that uses it (GT), which stops compiling. Delete anyway, or cancel.');
  });

  it('goes ahead when confirmed ("Delete anyway"), or when nothing uses it; `confirmed: false` asks as no flag does', () => {
    const confirmed = planAction(model(), { kind: 'delete-node', id: 'a1', confirmed: true }, CTX);
    expect(confirmed.label).toBe('Delete: A1');
    const after = confirmed.changes.find((c) => c.path === 'Model/S/Main.lean')?.after ?? '';
    expect(after).not.toContain('abbrev a1');
    expect(after).not.toContain('axiom a1.holds');
    // The users stay (now broken), as the question said.
    expect(after).toContain('theorem helper : Good t := a1.holds');
    expect(planAction(model(), { kind: 'delete-node', id: 'both' }, CTX).label).toBe('Delete: Both');
    expect(refusal(() => planAction(model(), { kind: 'delete-node', id: 'a1', confirmed: false }, CTX)).code).toBe('needs-confirmation');
  });
});

describe('AT2.6 reorder and set-premises refusals (no text involved)', () => {
  it('reorder changes only the layout (layoutOnly), pinning the column order the board shows', () => {
    const plan = planAction(model(), { kind: 'reorder', id: 'a2', column: 'AXIOM', beforeId: 'a1' }, { ...CTX, layouts: { S: emptyLayout() } });
    expect(plan).toEqual({
      action: 'reorder',
      label: 'Move: A2',
      subject: 'S',
      nodes: ['a2'],
      changes: [],
      layout: { subject: 'S', layout: { ...emptyLayout(), columns: { AXIOM: ['a2', 'a1'], PROPOSITION: ['dt', 'gt', 'both'] } } },
      layoutOnly: true,
    });
    expect(refusal(() => planAction(model(), { kind: 'reorder', id: 'a2', column: 'PROPOSITION', beforeId: null }, CTX)).code).toBe('invalid');
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
