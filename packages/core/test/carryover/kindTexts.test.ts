/**
 * AT1.12 (M1 carry-over 2): the dependents texts of kindChangeImpact and planKindChange in the singular and the plural;
 * the singular ones as frozen in docs/m2-plan.md section 1.3, the plural ones as in M1, with spec v4's kind names
 * ("as an axiom"; the texts of a change to Goal went with the GOAL kind, docs/slice1-plan.md 2.4).
 */
import { describe, expect, it } from 'vitest';
import { ActionError } from '../../src/actions.js';
import { planKindChange } from '../../src/edit/index.js';
import { kindChangeImpact } from '../../src/kindChange.js';
import type { SemanticSummary } from '../../src/model.js';
import { subjectGraph, type ProjectModel } from '../../src/project/index.js';
import { block, mainS, VOCAB_S } from '../project/helpers/build.js';
import { model } from '../gate/helpers/spyroRun.js';

const S = (body: string): ProjectModel => model({ 'Model/S/Vocabulary.lean': VOCAB_S, 'Model/S/Main.lean': mainS(body) });
const graphOf = (m: ProjectModel, state: SemanticSummary['state'] = 'fresh') => subjectGraph(m, 'S', { version: 1, semantic: { state } });

const refusal = (fn: () => unknown): ActionError => {
  try {
    fn();
  } catch (error) {
    if (error instanceof ActionError) return error;
    throw error;
  }
  throw new Error('expected an ActionError');
};

/** d1, a proposition (DERIVATION alias) proved conditionally on a1, applied by one proof (g1) or by two (g1, g2). */
const conditionalUsedBy = (n: 1 | 2) =>
  S(
    [
      block({ id: 'a1', type: 'GOAL', name: 'A1', lean: 'S.a1' }),
      'abbrev a1 : Prop := Good t',
      '',
      block({ id: 'd1', type: 'DERIVATION', name: 'D1', lean: 'S.d1' }),
      'abbrev d1 : Prop := Good t ∧ Good t',
      'theorem d1.holds (h_a1 : a1) : d1 := ⟨h_a1, h_a1⟩',
      '',
      block({ id: 'g1', type: 'GOAL', name: 'G1', lean: 'S.g1' }),
      'abbrev g1 : Prop := Good t',
      'theorem g1.holds (h_a1 : a1) : g1 := (d1.holds h_a1).2',
      ...(n === 2 ? ['', block({ id: 'g2', type: 'GOAL', name: 'G2', lean: 'S.g2' }), 'abbrev g2 : Prop := Good t', 'theorem g2.holds (h_a1 : a1) : g2 := (d1.holds h_a1).1'] : []),
    ].join('\n'),
  );

describe('AT1.12 kindChangeImpact texts (the board\'s dialog)', () => {
  it('to Axiom of a proof taking hypotheses, one proof: exactly the frozen singular text', () => {
    const m = conditionalUsedBy(1);
    expect(kindChangeImpact(graphOf(m), 'd1', 'AXIOM').detail).toBe(
      '`theorem d1.holds` takes a hypothesis; as an axiom it becomes `axiom d1.holds : d1` (the proof is kept in the attic), so the 1 proof that passes it arguments must change. Either rewrite that proof to use it directly (mechanical, undoable), or keep that proof and let it show as broken.',
    );
    expect(kindChangeImpact(graphOf(m, 'stale'), 'd1', 'AXIOM').detail).toBe(
      '`theorem d1.holds` takes a hypothesis; as an axiom it becomes `axiom d1.holds : d1` (the proof is kept in the attic), so the 1 proof that passes it arguments must change. Refresh Lean first to rewrite it mechanically, or keep it and let it show as broken.',
    );
  });

  it('to Axiom of a proof taking hypotheses, two proofs: the plural text as in M1', () => {
    const m = conditionalUsedBy(2);
    expect(kindChangeImpact(graphOf(m), 'd1', 'AXIOM').detail).toBe(
      '`theorem d1.holds` takes a hypothesis; as an axiom it becomes `axiom d1.holds : d1` (the proof is kept in the attic), so the 2 proofs that pass it arguments must change. Either rewrite them to use it directly (mechanical, undoable), or keep them and let them show as broken.',
    );
    expect(kindChangeImpact(graphOf(m, 'stale'), 'd1', 'AXIOM').detail).toBe(
      '`theorem d1.holds` takes a hypothesis; as an axiom it becomes `axiom d1.holds : d1` (the proof is kept in the attic), so the 2 proofs that pass it arguments must change. Refresh Lean first to rewrite them mechanically, or keep them and let them show as broken.',
    );
  });
});

describe('AT1.12 planKindChange texts (the host\'s needs-confirmation)', () => {
  it('to Axiom dropping arguments: one dependent exactly as frozen; two in the plural', () => {
    expect(refusal(() => planKindChange(conditionalUsedBy(1), { id: 'd1', to: 'AXIOM' })).message).toBe(
      'd1.holds takes a hypothesis, but as an axiom it becomes `axiom d1.holds : d1`, so 1 dependent that passes it arguments must change: rewrite that dependent to use it directly, or keep it and let it show as broken.',
    );
    expect(refusal(() => planKindChange(conditionalUsedBy(2), { id: 'd1', to: 'AXIOM' })).message).toBe(
      'd1.holds takes a hypothesis, but as an axiom it becomes `axiom d1.holds : d1`, so 2 dependents that pass it arguments must change: rewrite them to use it directly, or keep them and let them show as broken.',
    );
  });
});
