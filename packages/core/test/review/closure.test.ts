/**
 * Slice 2a1 (docs/slice2-plan.md 4.1, 6.1): elaborated closures. Meaning vs uses; through other statements (and a
 * class field, D2-30); a `.holds` by its type; a Prop instance by its type; `complete: false` without the arrays.
 */
import { describe, expect, it } from 'vitest';
import { constsOf, draftReach, reach, statementReach, usesOrRefs } from '../../src/review/closure.js';
import { proved } from '../gate/helpers/spyroRun.js';
import { BASE, MAIN, VOCAB, append, draftOf, modelOf, TARGET_HOLDS, TARGET_STATEMENT } from './helpers/session.js';

const facts = (model: ReturnType<typeof modelOf>, name: string) => {
  const f = model.declFacts.get(name);
  if (f === undefined) throw new Error(`no facts for ${name}`);
  return f;
};
const sorted = (names: Iterable<string>) => [...names].sort();

describe('constsOf and reach: meaning vs uses', () => {
  const model = modelOf(proved());

  it('a theorem means its type; it uses its type and its value', () => {
    const holds = facts(model, TARGET_HOLDS);
    expect(constsOf(holds, 'meaning')).toEqual([TARGET_STATEMENT]);
    expect(constsOf(holds, 'uses')).toEqual(expect.arrayContaining([TARGET_STATEMENT, 'Spyro.pg_no_dark_past.holds', 'Spyro.cynder_dark_past.holds']));
  });

  it('a `.holds` counts by its type only: its meaning closure never reaches the proof', () => {
    const meaning = reach(model, [TARGET_HOLDS], 'meaning');
    expect(sorted(meaning.names)).toEqual(
      sorted([TARGET_HOLDS, TARGET_STATEMENT, 'Spyro.GoodAddition', 'Spyro.cynder', 'Spyro.newSpyro', 'Spyro.Character', 'Spyro.Game']),
    );
    expect(meaning.complete).toBe(true);
    const uses = reach(model, [TARGET_HOLDS], 'uses');
    expect(uses.names.has('Spyro.pg_no_dark_past.holds')).toBe(true);
    expect(uses.names.has('Spyro.cynder_dark_past.holds')).toBe(true);
  });

  it('a statement abbrev means its value; an axiom and an opaque mean their type', () => {
    expect(constsOf(facts(model, TARGET_STATEMENT), 'meaning')).toEqual(['Spyro.GoodAddition', 'Spyro.cynder', 'Spyro.newSpyro']);
    expect(constsOf(facts(model, 'Spyro.GoodAddition'), 'meaning')).toEqual(['Spyro.Character', 'Spyro.Game']);
    expect(constsOf(facts(model, 'Spyro.cynder'), 'meaning')).toEqual(['Spyro.Character']);
  });

  it('`stopAt` records a declaration but does not walk through it (never a start)', () => {
    const stopped = reach(model, [TARGET_HOLDS], 'uses', (name) => name === 'Spyro.pg_no_dark_past.holds');
    expect(stopped.names.has('Spyro.pg_no_dark_past.holds')).toBe(true);
    expect(stopped.names.has('Spyro.pg_no_dark_past')).toBe(false);
    expect(reach(model, [TARGET_HOLDS], 'uses', (name) => name === TARGET_HOLDS).names.has(TARGET_STATEMENT)).toBe(true);
  });
});

describe('a Prop instance by its type', () => {
  const texts = proved();
  it('a Prop-valued instance means its type; a data instance its type and value', () => {
    const prop = modelOf(texts, { overrides: { 'Spyro.instNonemptyCharacter': { typeSort: 'Prop' } } });
    const instance = facts(prop, 'Spyro.instNonemptyCharacter');
    expect(constsOf(instance, 'meaning')).toEqual(['Spyro.Character']);
    expect(constsOf(instance, 'uses')).toEqual(['Spyro.Character', 'Spyro.Character.exists']);
    expect(reach(prop, ['Spyro.instNonemptyCharacter'], 'meaning').names.has('Spyro.Character.exists')).toBe(false);
    const data = modelOf(texts, { overrides: { 'Spyro.instNonemptyCharacter': { typeSort: 'Type' } } });
    expect(constsOf(facts(data, 'Spyro.instNonemptyCharacter'), 'meaning')).toEqual(['Spyro.Character', 'Spyro.Character.exists']);
  });
});

describe('statementReach (R_stmt)', () => {
  /** A class whose field type names a definition, and a statement that reaches the class: D2-30's first case. */
  const texts = append(
    append(BASE, VOCAB, '/-- is evil -/\ndef Evil (c : Character) : Prop := HasDarkPast c\n/-- is wicked -/\nclass Wicked (c : Character) : Prop where\n  p : Evil c\n/-- only a draft uses it -/\ndef Vile (c : Character) : Prop := ¬ IsPG newSpyro ∧ HasDarkPast c'),
    MAIN,
    '/-\n@@ telelean v1\nid: cynder-wicked\ntype: PROPOSITION\nnatural_name: Cynder is wicked\nasserted: 2026-11-01\nlean: Spyro.cynder_wicked\n-/\n/-- Cynder is wicked -/\nabbrev cynder_wicked : Prop := Wicked cynder\n\n/-\n@@ telelean v1\nid: both\ntype: PROPOSITION\nnatural_name: Both\nasserted: 2026-11-01\nlean: Spyro.both\n-/\n/-- Both -/\nabbrev both : Prop := cynder_dark_past ∧ new_spyro_pg',
  );
  const model = modelOf(texts);

  it('goes through other statements, and through a class field type to a definition (typeConsts)', () => {
    const r = statementReach(model, []);
    expect(r.complete).toBe(true);
    expect(r.names.has('Spyro.Evil')).toBe(true);
    expect(r.by['Spyro.Evil']).toEqual(['cynder-wicked']);
    expect(r.by['Spyro.HasDarkPast']).toEqual(['both', 'cynder-dark-past', 'cynder-wicked']);
    expect(r.by['Spyro.cynder_dark_past']).toEqual(['both', 'cynder-dark-past']);
    expect(r.names.has('Spyro.Vile')).toBe(false);
  });

  it('a premise draft adds what its statement reaches, recorded under its item key', () => {
    const draft = draftOf({ leanName: 'cynder_vile', consts: ['Spyro.Vile', 'Spyro.cynder'] });
    const r = statementReach(model, [draft]);
    expect(r.names.has('Spyro.Vile')).toBe(true);
    expect(r.by['Spyro.Vile']).toEqual(['premise:cynder-not-good:cynder_vile']);
    expect(r.names.has('Spyro.cynder_vile')).toBe(false);
  });

  it('a draft whose facts lack its own statement (none yet, or a failed re-check) reaches nothing visible: incomplete (F6)', () => {
    const empty = { ...draftOf({ consts: ['Spyro.Vile'] }), facts: {} };
    expect(draftReach(model, empty)).toEqual({ names: new Set(), complete: false, missing: ['cynder_is_evil'] });
    const renamed = { ...draftOf({ consts: ['Spyro.Vile'] }), leanName: 'cynder_vile' };
    const r = draftReach(model, renamed);
    expect(r.complete).toBe(false);
    expect(r.missing).toEqual(['cynder_vile']);
    expect(r.names.has('Spyro.Vile')).toBe(true);
    expect(statementReach(model, [empty]).complete).toBe(false);
    expect(draftReach(model, draftOf({ consts: ['Spyro.Vile'] })).complete).toBe(true);
  });

  it('without typeConsts the class field is invisible: the closure says so (`complete: false`)', () => {
    const old = modelOf(texts, { typeConsts: false });
    const r = statementReach(old, []);
    expect(r.complete).toBe(false);
    expect(r.missing).toContain('Spyro.cynder_wicked');
    expect(constsOf(facts(old, 'Spyro.Wicked'), 'meaning')).toBeUndefined();
    const one = modelOf(texts, { overrides: { 'Spyro.Wicked': { noTypeConsts: true } } });
    const partial = reach(one, ['Spyro.cynder_wicked'], 'meaning');
    expect(partial.complete).toBe(false);
    expect(partial.missing).toEqual(['Spyro.Wicked']);
  });

  it('without valueConsts, uses falls back to refs and valueConsts, incomplete', () => {
    const old = modelOf(texts, { valueConsts: false });
    expect(constsOf(facts(old, 'Spyro.Evil'), 'uses')).toBeUndefined();
    expect(usesOrRefs(facts(old, 'Spyro.Evil'))).toEqual({ names: ['Spyro.Character', 'Spyro.HasDarkPast'], complete: false });
    expect(usesOrRefs(facts(model, 'Spyro.Evil')).complete).toBe(true);
  });
});
