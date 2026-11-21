/**
 * AT1.13 (M1 carry-over 3): a kind change's DependentsChoice applies only to the dependents the dialog listed
 * (`confirmedDependents`, absent = none); when the facts find more, the planner refuses with `needs-confirmation`
 * listing all of them, so the board asks again with the host's list. Spec v4: the kind change that has dependents
 * to rewrite is P->A of a proof that takes hypotheses (its users stop passing it arguments); the change to Goal, which
 * removed a `.holds`, went with the GOAL kind (docs/slice1-plan.md 2.4).
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

/** d1 (a DERIVATION alias) proved conditionally on a1, applied by a card (g1) and by a lemma without a card. */
const BODY = [
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
const s = model({ 'Model/S/Vocabulary.lean': VOCAB_S, 'Model/S/Main.lean': mainS(BODY) });

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

const opKinds = (plan: ReturnType<typeof planKindChange>) => plan.leanOps.flatMap((g) => g.ops.map((op) => op.op));

describe('AT1.13 confirmedDependents', () => {
  it("the board's dialog lists only cards; the host finds the lemma too", () => {
    const impact = kindChangeImpact(subjectGraph(s, 'S', { version: 1, semantic: { state: 'fresh' } }), 'd1', 'AXIOM');
    expect(impact.dependents).toEqual(['g1']);
    expect(refusal(() => planKindChange(s, { id: 'd1', to: 'AXIOM' })).dependents).toEqual(['g1', 'S.lemma1']);
  });

  it('a confirmed list that does not cover every dependent: needs-confirmation listing all of them', () => {
    for (const choice of ['rewrite', 'mark-broken'] as const) {
      const error = refusal(() => planKindChange(s, { id: 'd1', to: 'AXIOM', dependents: choice, confirmedDependents: ['g1'] }));
      expect(error.code).toBe('needs-confirmation');
      expect(error.dependents).toEqual(['g1', 'S.lemma1']);
      expect(error.message).toBe(
        'd1.holds takes a hypothesis, but as an axiom it becomes `axiom d1.holds : d1`, so 2 dependents that pass it arguments must change: rewrite them to use it directly, or keep them and let them show as broken.',
      );
    }
    // A choice without any confirmed list counts as an empty one.
    expect(refusal(() => planKindChange(s, { id: 'd1', to: 'AXIOM', dependents: 'rewrite' })).code).toBe('needs-confirmation');
  });

  it('a confirmed list covering every dependent (or more): the choice applies', () => {
    const plan = planKindChange(s, { id: 'd1', to: 'AXIOM', dependents: 'mark-broken', confirmedDependents: ['g1', 'S.lemma1'] });
    expect(plan.broken).toEqual(expect.arrayContaining(['S.g1.holds', 'S.lemma1']));
    expect(opKinds(plan)).toEqual(['holds-theorem-to-axiom']);
    const rewrite = planKindChange(s, { id: 'd1', to: 'AXIOM', dependents: 'rewrite', confirmedDependents: ['S.lemma1', 'g1', 'something-else'] });
    expect(opKinds(rewrite)).toEqual(expect.arrayContaining(['drop-arguments', 'holds-theorem-to-axiom']));
  });

  it("through planAction: the board action's confirmedDependents reach the planner", () => {
    const action = { kind: 'change-kind', id: 'd1', to: 'AXIOM', beforeId: null, dependents: 'mark-broken' } as const;
    expect(refusal(() => planAction(s, { ...action, confirmedDependents: ['g1'] }, CTX)).dependents).toEqual(['g1', 'S.lemma1']);
    const plan = planAction(s, { ...action, confirmedDependents: ['g1', 'S.lemma1'] }, CTX);
    expect(plan.label).toBe('Move to axioms: D1 (dependents marked broken)');
  });

  it('a change without dependents needs no confirmation at all', () => {
    // cynder-not-good's proof takes no hypotheses: its users (none here) keep compiling against the axiom.
    const plan = planKindChange(m, { id: 'cynder-not-good', to: 'AXIOM', dependents: 'rewrite' });
    expect(plan.impact.needsConfirmation).toBe(false);
    expect(opKinds(plan)).toEqual(['holds-theorem-to-axiom']);
    expect(plan.fieldChanges).toEqual([
      { key: 'type', value: 'AXIOM' },
      { key: 'premises', value: null },
    ]);
  });
});
