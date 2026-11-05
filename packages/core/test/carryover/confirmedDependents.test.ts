/**
 * AT1.13 (M1 carry-over 3): a kind change's DependentsChoice applies only to the dependents the dialog listed
 * (`confirmedDependents`, absent = none); when the facts find more, the planner refuses with `needs-confirmation`
 * listing all of them, so the board asks again with the host's list.
 */
import { describe, expect, it } from 'vitest';
import { ActionError } from '../../src/actions.js';
import { planAction, planKindChange, type PlanContext } from '../../src/edit/index.js';
import { kindChangeImpact } from '../../src/kindChange.js';
import { subjectGraph } from '../../src/project/index.js';
import { block, mainS, VOCAB_S } from '../project/helpers/build.js';
import { MAIN, model, ROOT, type Texts, VOCAB } from '../gate/helpers/spyroRun.js';
import { SPYRO_TEXTS } from '../project/helpers/spyro.js';

const CTX: PlanContext = { today: '2026-11-02', now: '2026-11-02T10:00:00.000Z', layouts: {} };
/** The proved Spyro sample plus a lemma without a card that uses cynder_dark_past.holds. */
const TEXTS: Texts = {
  [ROOT]: SPYRO_TEXTS.root,
  [MAIN]: SPYRO_TEXTS.provedMain.replace('end Spyro', 'theorem helper : cynder_dark_past := cynder_dark_past.holds\n\nend Spyro'),
  [VOCAB]: SPYRO_TEXTS.vocabulary,
};
const m = model(TEXTS);

const refusal = (fn: () => unknown): ActionError => {
  try {
    fn();
  } catch (error) {
    if (error instanceof ActionError) return error;
    throw error;
  }
  throw new Error('expected an ActionError');
};

describe('AT1.13 confirmedDependents', () => {
  it('the board\'s dialog lists only cards; the host finds the lemma too', () => {
    const impact = kindChangeImpact(subjectGraph(m, 'Spyro', { version: 1, semantic: { state: 'fresh' } }), 'cynder-dark-past', 'GOAL');
    expect(impact.dependents).toEqual(['cynder-not-good']);
    expect(refusal(() => planKindChange(m, { id: 'cynder-dark-past', to: 'GOAL' })).dependents).toEqual(['cynder-not-good', 'Spyro.helper']);
  });

  it('a confirmed list that does not cover every dependent: needs-confirmation listing all of them', () => {
    for (const choice of ['rewrite', 'mark-broken'] as const) {
      const error = refusal(() => planKindChange(m, { id: 'cynder-dark-past', to: 'GOAL', dependents: choice, confirmedDependents: ['cynder-not-good'] }));
      expect(error.code).toBe('needs-confirmation');
      expect(error.dependents).toEqual(['cynder-not-good', 'Spyro.helper']);
      expect(error.message).toBe(
        'Making it a Goal removes cynder_dark_past.holds, which 2 dependents use: rewrite them to take it as a hypothesis, or keep them and let them show as broken.',
      );
    }
    // A choice without any confirmed list counts as an empty one.
    expect(refusal(() => planKindChange(m, { id: 'cynder-dark-past', to: 'GOAL', dependents: 'rewrite' })).code).toBe('needs-confirmation');
  });

  it('a confirmed list covering every dependent (or more): the choice applies', () => {
    const plan = planKindChange(m, { id: 'cynder-dark-past', to: 'GOAL', dependents: 'mark-broken', confirmedDependents: ['cynder-not-good', 'Spyro.helper'] });
    expect(plan.broken).toEqual(expect.arrayContaining(['Spyro.cynder_not_good.holds', 'Spyro.helper']));
    const rewrite = planKindChange(m, { id: 'cynder-dark-past', to: 'GOAL', dependents: 'rewrite', confirmedDependents: ['Spyro.helper', 'cynder-not-good', 'something-else'] });
    expect(rewrite.leanOps.flatMap((g) => g.ops.map((op) => op.op))).toEqual(expect.arrayContaining(['add-hypothesis', 'remove-holds']));
  });

  it('through planAction: the board action\'s confirmedDependents reach the planner', () => {
    const action = { kind: 'change-kind', id: 'cynder-dark-past', to: 'GOAL', beforeId: null, dependents: 'mark-broken' } as const;
    expect(refusal(() => planAction(m, { ...action, confirmedDependents: ['cynder-not-good'] }, CTX)).dependents).toEqual(['cynder-not-good', 'Spyro.helper']);
    const plan = planAction(m, { ...action, confirmedDependents: ['cynder-not-good', 'Spyro.helper'] }, CTX);
    expect(plan.label).toBe('Make Goal: Cynder is a character who has a dark past (dependents marked broken)');
  });

  it('the drop-arguments case asks the same way', () => {
    const body = [
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
      '',
      'theorem lemma1 (h : a1) : Good t := (d1.holds h).1',
    ].join('\n');
    const s = model({ 'Model/S/Vocabulary.lean': VOCAB_S, 'Model/S/Main.lean': mainS(body) });
    const error = refusal(() => planKindChange(s, { id: 'd1', to: 'ASSUMPTION', dependents: 'rewrite', confirmedDependents: ['g1'] }));
    expect(error.dependents).toEqual(['g1', 'S.lemma1']);
    expect(planKindChange(s, { id: 'd1', to: 'ASSUMPTION', dependents: 'rewrite', confirmedDependents: ['g1', 'S.lemma1'] }).leanOps.flatMap((g) => g.ops.map((op) => op.op))).toEqual(
      expect.arrayContaining(['drop-arguments', 'holds-theorem-to-axiom']),
    );
  });

  it('a change without dependents needs no confirmation at all', () => {
    expect(planKindChange(m, { id: 'new-spyro-pg', to: 'DERIVATION' }).leanOps).toEqual([]);
    const plan = planKindChange(m, { id: 'cynder-not-good', to: 'DERIVATION', dependents: 'rewrite' });
    expect(plan.fieldChanges).toEqual([{ key: 'type', value: 'DERIVATION' }]);
  });
});
