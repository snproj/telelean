/**
 * AT1.3 (docs/m2-plan.md section 3.2): the D-5 permitted set on the Spyro proved-overlay facts (the hand facts of the
 * M1 tests), derivation footprints, unusable premises, the circular case and zero premises; and the freeze record.
 */
import { describe, expect, it } from 'vitest';
import { ActionError } from '../../src/actions.js';
import { computePermittedAxioms, frozenSnapshot, type Selection } from '../../src/gate/index.js';
import { parseLeanFile } from '../../src/markup/api.js';
import { buildProjectModel } from '../../src/project/index.js';
import { block, build, mainS, VOCAB_S } from '../project/helpers/build.js';
import { spyroDerivedInput, spyroInput, spyroProvedInput } from '../project/helpers/spyro.js';

const proved = () => buildProjectModel(spyroProvedInput(parseLeanFile));
const ALL: Selection = { subject: 'Spyro', target: 'cynder-not-good', premises: ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'], adoptedGhosts: [] };

/** The M0 comparator test's permitted(ALL_SELECTED) (packages/runner/test/lean/comparator.test.ts). */
const STANDARD = ['propext', 'Classical.choice', 'Quot.sound'];
const SIGNATURE = ['Spyro.Character', 'Spyro.Game', 'Spyro.HasDarkPast', 'Spyro.IsPG', 'Spyro.GoodAddition'];
const PRESUPPOSITIONS = ['Spyro.Character.exists', 'Spyro.Game.exists'];
const ALL_SELECTED = ['Spyro.cynder_dark_past.holds', 'Spyro.new_spyro_pg.holds', 'Spyro.pg_no_dark_past.holds'];

describe('AT1.3 the permitted set', () => {
  it('all three selected: exactly the 13 names of the M0 comparator test', () => {
    const permitted = computePermittedAxioms(proved(), ALL);
    expect(permitted.all).toHaveLength(13);
    expect(new Set(permitted.all)).toEqual(new Set([...STANDARD, ...SIGNATURE, ...PRESUPPOSITIONS, ...ALL_SELECTED]));
    expect(permitted.all).toEqual([...permitted.all].sort());
    expect(permitted).toMatchObject({
      standard: STANDARD,
      selected: ALL_SELECTED,
      presuppositions: PRESUPPOSITIONS,
      derivationFootprints: [],
      unusable: [],
    });
    expect(new Set(permitted.signature)).toEqual(new Set(SIGNATURE));
    expect(permitted.all).not.toContain('Spyro.cynder_not_good.holds');
  });

  it('new-spyro-pg unselected: its .holds is not permitted', () => {
    const permitted = computePermittedAxioms(proved(), { ...ALL, premises: ['cynder-dark-past', 'pg-no-dark-past'] });
    expect(permitted.all).toHaveLength(12);
    expect(permitted.all).not.toContain('Spyro.new_spyro_pg.holds');
    // Game.exists stays: the target's own statement presupposes games.
    expect(permitted.presuppositions).toEqual(PRESUPPOSITIONS);
  });

  it('a selected proved derivation adds its footprint (it acts as a lemma)', () => {
    const model = buildProjectModel(spyroDerivedInput(parseLeanFile));
    const permitted = computePermittedAxioms(model, { ...ALL, premises: ['pg-no-dark-past', 'dark-and-pg'] });
    expect(permitted.selected).toEqual(['Spyro.pg_no_dark_past.holds']);
    expect(permitted.derivationFootprints).toEqual(expect.arrayContaining(['Spyro.cynder_dark_past.holds', 'Spyro.new_spyro_pg.holds', 'Classical.choice']));
    expect(permitted.all).toEqual(expect.arrayContaining(['Spyro.cynder_dark_past.holds', 'Spyro.new_spyro_pg.holds', 'Spyro.pg_no_dark_past.holds']));
    expect(permitted.unusable).toEqual([]);
  });

  it('unusable: an unproved proposition, a code-less card, a conditional proof, and a proposition resting on the target\'s own pending .holds', () => {
    const body = [
      block({ id: 'a1', type: 'ASSUMPTION', name: 'A1', rationale: 'r', lean: 'S.a1' }),
      'abbrev a1 : Prop := Good t',
      'axiom a1.holds : a1',
      '',
      block({ id: 'd', type: 'DERIVATION', name: 'D pending', lean: 'S.d' }),
      'abbrev d : Prop := Bad t',
      'axiom d.holds : d',
      '',
      block({ id: 'e', type: 'DERIVATION', name: 'E rests on the claimed D', lean: 'S.e' }),
      'abbrev e : Prop := Bad t',
      'theorem e.holds : e := d.holds',
      '',
      block({ id: 'g0', type: 'GOAL', name: 'G0 unproved', lean: 'S.g0' }),
      'abbrev g0 : Prop := Good t ∧ Bad t',
      '',
      block({ id: 'c', type: 'DERIVATION', name: 'C conditional', lean: 'S.c' }),
      'abbrev c : Prop := Good t',
      'theorem c.holds (h : a1) : c := h',
      '',
      block({ id: 'f', type: 'DERIVATION', name: 'F proved from A1', lean: 'S.f' }),
      'abbrev f : Prop := Good t',
      'theorem f.holds : f := a1.holds',
      '',
      block({ id: 'cl', type: 'GOAL', name: 'Code-less' }),
    ].join('\n');
    const { model } = build({ 'Model/S/Vocabulary.lean': VOCAB_S, 'Model/S/Main.lean': mainS(body) });
    expect(model.nodes.get('c')?.node.status.proof.kind).toBe('conditional');
    expect(model.nodes.get('d')?.node.status.proof.kind).toBe('pending');
    const permitted = computePermittedAxioms(model, { subject: 'S', target: 'd', premises: ['e', 'g0', 'c', 'cl', 'f', 'a1'], adoptedGhosts: [] });
    expect(permitted.unusable).toEqual(['e', 'g0', 'c', 'cl']);
    expect(permitted.selected).toEqual(['S.a1.holds']);
    expect(permitted.derivationFootprints).toContain('S.a1.holds');
    // The target's own claimed .holds is never permitted (not through the circular derivation either).
    expect(permitted.all).not.toContain('S.d.holds');
    expect(permitted.derivationFootprints).not.toContain('S.d.holds');
  });

  it('zero premises ("Self-evident?"): the standard axioms, the signature and the target\'s presuppositions', () => {
    const permitted = computePermittedAxioms(proved(), { ...ALL, premises: [] });
    expect(new Set(permitted.all)).toEqual(new Set([...STANDARD, ...SIGNATURE, ...PRESUPPOSITIONS]));
    expect(permitted.selected).toEqual([]);
  });

  it('an adopted ghost counts as selected', () => {
    const permitted = computePermittedAxioms(proved(), { ...ALL, premises: ['cynder-dark-past', 'pg-no-dark-past'], adoptedGhosts: ['new-spyro-pg'] });
    expect(permitted.selected).toEqual(ALL_SELECTED);
  });

  it('refuses ids that are not cards of the subject', () => {
    expect(() => computePermittedAxioms(proved(), { ...ALL, target: 'nope' })).toThrow(ActionError);
    expect(() => computePermittedAxioms(proved(), { ...ALL, premises: ['nope'] })).toThrow(/not a card of the subject Spyro/);
    expect(() => computePermittedAxioms(proved(), { ...ALL, subject: 'Other' })).toThrow(ActionError);
  });
});

describe('frozenSnapshot', () => {
  it('keeps the permitted set, the target statement, the subject\'s statements and vocabulary, and every axiom', () => {
    const snapshot = frozenSnapshot(proved(), ALL, 2);
    expect(snapshot.round).toBe(2);
    expect(snapshot.targetStatement).toBe('Spyro.cynder_not_good');
    expect(snapshot.permitted.all).toHaveLength(13);
    expect(snapshot.declarations['Spyro.pg_no_dark_past']).toEqual({ kind: 'def', type: 'Prop', value: '∀ (g : Spyro.Game) (c : Spyro.Character), Spyro.IsPG g → Spyro.HasDarkPast c → ¬Spyro.GoodAddition c g' });
    expect(snapshot.declarations['Spyro.GoodAddition']).toEqual({ kind: 'axiom', type: 'Spyro.Character → Spyro.Game → Prop' });
    // Proofs may be reworked after the freeze: theorems are not frozen.
    expect(snapshot.declarations['Spyro.cynder_not_good.holds']).toBeUndefined();
    expect(snapshot.axioms).toEqual([...snapshot.axioms].sort());
    expect(snapshot.axioms).toEqual(expect.arrayContaining(['Spyro.Character', 'Spyro.GoodAddition', 'Spyro.Character.exists', ...ALL_SELECTED]));
    expect(snapshot.axioms).not.toContain('Spyro.cynder_not_good.holds');
  });

  it('refuses a target without a statement, or an unknown one', () => {
    const base = buildProjectModel(spyroInput(parseLeanFile));
    expect(() => frozenSnapshot(base, { subject: 'Spyro', target: 'pg-no-dark-past', premises: [], adoptedGhosts: [] }, 1)).toThrow(/has no Lean statement/);
    expect(() => frozenSnapshot(base, { subject: 'Spyro', target: 'nope', premises: [], adoptedGhosts: [] }, 1)).toThrow(ActionError);
  });
});
