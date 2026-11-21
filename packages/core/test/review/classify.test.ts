/**
 * Slice 2a2 (docs/slice2-plan.md 4.4, 6.1): RV-7 classes on the Spyro fixture and edited copies, with facts from
 * `fakeFacts` (value and type constants on), the drafts from `computeItems`.
 */
import { describe, expect, it } from 'vitest';
import { classify } from '../../src/review/classify.js';
import { computeItems } from '../../src/review/items.js';
import type { ItemClass, LedgerEntry, PremiseDraft, SessionInference } from '../../src/review/types.js';
import type { FakeFactsOptions } from '../project/helpers/fakeFacts.js';
import { HONEST_PROOF, TARGET_LINE, normative, pinned, proved } from '../gate/helpers/spyroRun.js';
import { BASE, INFERENCE, MAIN, TARGET, TARGET_HOLDS, VOCAB, append, created, draftOf, edit, modelOf, type Texts } from './helpers/session.js';

interface Options {
  ledger?: LedgerEntry[];
  premises?: PremiseDraft[];
  inferences?: SessionInference[];
  current?: FakeFactsOptions;
  base?: FakeFactsOptions;
  withDrafts?: boolean;
}

function classesOf(base: Texts, current: Texts, o: Options = {}) {
  const B = modelOf(base, o.base ?? {});
  const W = modelOf(current, o.current ?? {});
  const inferences = o.inferences ?? [INFERENCE];
  const premises = o.premises ?? [];
  const { drafts, problems } = computeItems({ base: B, current: W, ledger: o.ledger ?? [], premises, inferences, ended: inferences.map((inf) => inf.target) });
  const classes = classify({ base: B, current: W, drafts, premises, inferences, withDrafts: o.withDrafts ?? true });
  const of = (key: string): ItemClass => {
    const found = classes[key];
    if (!found) throw new Error(`no class ${key}; keys: ${Object.keys(classes).join(', ')}`);
    return found;
  };
  return { drafts, problems, classes, of };
}

const NOT_RV7: ItemClass = { belief: false, changesProved: false, reasons: [], complete: true };
const RESULT = `proof:${TARGET}`;
const FORMALISED = pinned(normative(BASE));
const FORMALISED_LEDGER = [created('Spyro.pg_no_dark_past', 'statements'), created('Spyro.pg_no_dark_past.holds', 'statements')];
/** pg-no-dark-past formalised with the given statement body (pinned, with its `axiom .holds`). */
const formalise = (texts: Texts, body: string) =>
  edit(
    texts,
    MAIN,
    'stance: rule\nasserted: 2026-11-01\n-/\n\n',
    `stance: rule\nasserted: 2026-11-01\nlean: Spyro.pg_no_dark_past\n-/\n/-- PG games cannot have characters with dark pasts -/\nabbrev pg_no_dark_past : Prop := ${body}\naxiom pg_no_dark_past.holds : pg_no_dark_past\n\n`,
  );
/** The target with no Lean statement (a code-less proposition). */
const TARGET_CODE = 'lean: Spyro.cynder_not_good\n-/\n/-- Cynder would not be a good addition to the new Spyro game -/\nabbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';
const codeless = (texts: Texts) => edit(texts, MAIN, TARGET_CODE, '-/\n');
const EVIL = '/-- is evil -/\ndef Evil (c : Character) : Prop := HasDarkPast c';

describe('belief (§4.4)', () => {
  it('b2 and b3: a Formalize of an AXIOM card, its `.holds` axiom new; a Formalize of a proposition is no RV-7 item', () => {
    const r = classesOf(BASE, FORMALISED, { ledger: FORMALISED_LEDGER });
    expect(r.of('card:pg-no-dark-past')).toEqual({
      belief: true,
      changesProved: false,
      reasons: [
        { code: 'b2', cards: ['pg-no-dark-past'] },
        { code: 'b3', name: 'Spyro.pg_no_dark_past.holds' },
      ],
      complete: true,
    });
    // The target formalised in the session: its statement abbrev is never b4, and a Result that proves an unproved
    // target, of a statement first written in the session, is neither c1 nor c2.
    const proposition = classesOf(codeless(FORMALISED), proved(FORMALISED), { ledger: [created('Spyro.cynder_not_good', 'statements')] });
    expect(proposition.problems).toEqual([]);
    expect(proposition.of(`card:${TARGET}`)).toEqual(NOT_RV7);
    expect(proposition.of(RESULT)).toEqual(NOT_RV7);
  });

  it('b3: a presupposition with its helper instance; plain vocabulary is no RV-7 item', () => {
    const current = append(
      BASE,
      VOCAB,
      [
        '/-- villains -/\naxiom Villain : Type',
        '/-- there is at least one villain -/\naxiom Villain.exists : Nonempty Villain',
        'instance : Nonempty Villain := Villain.exists',
        '/-- is a villain -/\naxiom IsVillain : Character → Prop',
      ].join('\n'),
    );
    const ledger = ['Spyro.Villain', 'Spyro.Villain.exists', 'Spyro.instNonemptyVillain', 'Spyro.IsVillain'].map((n) => created(n, 'statements'));
    const r = classesOf(BASE, current, { ledger });
    expect(r.problems).toEqual([]);
    expect(r.of('decl:Spyro.Villain.exists')).toEqual({ belief: true, changesProved: false, reasons: [{ code: 'b3', name: 'Spyro.Villain.exists' }], complete: true });
    expect(r.of('vocab:Spyro.Villain')).toEqual(NOT_RV7);
    expect(r.of('vocab:Spyro.IsVillain')).toEqual(NOT_RV7);
  });

  it('b4: a new definition in R_stmt is a belief, one outside it is not, recomputed when a later statement starts to reach it', () => {
    const evil = append(BASE, VOCAB, EVIL);
    const ledger = [created('Spyro.Evil', 'statements'), ...FORMALISED_LEDGER];
    const outside = classesOf(BASE, evil, { ledger });
    expect(outside.of('decl:Spyro.Evil')).toEqual(NOT_RV7);
    const reached = classesOf(BASE, formalise(evil, '∀ (c : Character), Evil c → ¬ GoodAddition c newSpyro'), { ledger });
    expect(reached.problems).toEqual([]);
    expect(reached.of('decl:Spyro.Evil')).toEqual({ belief: true, changesProved: false, reasons: [{ code: 'b4', name: 'Spyro.Evil' }], complete: true });
    // The card's own statement abbrev reaches itself, and is still no b4.
    expect(reached.of('card:pg-no-dark-past').reasons.map((x) => x.code)).toEqual(['b2', 'b3']);
  });

  it('b4 through a class field (typeConsts), and conservatively without typeConsts (D2-25)', () => {
    const current = formalise(append(BASE, VOCAB, `${EVIL}\n/-- is wicked -/\nclass Wicked (c : Character) : Prop where\n  p : Evil c`), '∀ (c : Character), Wicked c → ¬ GoodAddition c newSpyro');
    const ledger = [created('Spyro.Evil', 'statements'), created('Spyro.Wicked', 'statements'), ...FORMALISED_LEDGER];
    const r = classesOf(BASE, current, { ledger });
    expect(r.problems).toEqual([]);
    expect(r.of('decl:Spyro.Evil')).toEqual({ belief: true, changesProved: false, reasons: [{ code: 'b4', name: 'Spyro.Evil' }], complete: true });
    expect(r.of('decl:Spyro.Wicked').belief).toBe(true);
    // Without the class's type constants, R_stmt cannot see the field: every new definition counts as a belief.
    const blind = classesOf(BASE, current, { ledger, current: { overrides: { 'Spyro.Wicked': { noTypeConsts: true } } } });
    expect(blind.of('decl:Spyro.Evil')).toEqual({ belief: true, changesProved: false, reasons: [{ code: 'b4', name: 'Spyro.Evil' }], complete: false });
  });

  it('b4 through a coercion the elaborated statement inserts', () => {
    const current = formalise(
      append(BASE, VOCAB, '/-- villains -/\naxiom Villain : Type\ninstance : Coe Villain Character := ⟨fun _ => cynder⟩'),
      '∀ (v : Villain), ¬ GoodAddition v newSpyro',
    );
    const ledger = [created('Spyro.Villain', 'statements'), created('Spyro.instCoeVillainCharacter', 'statements'), ...FORMALISED_LEDGER];
    const overrides = { 'Spyro.pg_no_dark_past': { valueConsts: ['Spyro.Villain', 'Spyro.GoodAddition', 'Spyro.instCoeVillainCharacter', 'Spyro.newSpyro'] } };
    const r = classesOf(BASE, current, { ledger, current: { overrides } });
    expect(r.drafts.find((d) => d.key === 'decl:Spyro.instCoeVillainCharacter')?.declKind).toBe('coercion');
    expect(r.of('decl:Spyro.instCoeVillainCharacter')).toEqual({
      belief: true,
      changesProved: false,
      reasons: [{ code: 'b4', name: 'Spyro.instCoeVillainCharacter' }],
      complete: true,
    });
    // As Lean sees it without the coercion (the source text alone), nothing reaches it.
    expect(classesOf(BASE, current, { ledger }).of('decl:Spyro.instCoeVillainCharacter')).toEqual(NOT_RV7);
  });

  it('b4 for a change to existing vocabulary in either R_stmt (B’s too); c1 for an existing lemma changed', () => {
    const base = formalise(append(BASE, VOCAB, `${EVIL}\n/-- a lemma written early -/\ntheorem early : True := trivial`), '∀ (c : Character), Evil c → ¬ GoodAddition c newSpyro');
    const current = edit(
      edit(edit(base, VOCAB, 'def Evil (c : Character) : Prop := HasDarkPast c', 'def Evil (c : Character) : Prop := HasDarkPast c ∧ True'), MAIN, 'Evil c →', 'HasDarkPast c →'),
      VOCAB,
      'theorem early : True := trivial',
      'theorem early : True := ⟨⟩',
    );
    const r = classesOf(base, current);
    expect(r.of('decl:Spyro.Evil')).toEqual({ belief: true, changesProved: false, reasons: [{ code: 'b4', name: 'Spyro.Evil' }], complete: true });
    expect(r.of('decl:Spyro.early')).toEqual({ belief: false, changesProved: true, reasons: [{ code: 'c1', name: 'Spyro.early' }], complete: true });
    expect(r.of('card:pg-no-dark-past').reasons.map((x) => x.code)).toEqual(['b2', 'c1']);
  });

  it('b1: any Add premise; the two maps: a definition that only a premise draft reaches is a belief in `classes` only', () => {
    const premise = draftOf({ consts: ['Spyro.Evil', 'Spyro.cynder'] });
    const options: Options = { ledger: [created('Spyro.Evil', 'statements')], premises: [premise] };
    const shown = classesOf(BASE, append(BASE, VOCAB, EVIL), options);
    expect(shown.of('premise:cynder-not-good:cynder_is_evil')).toEqual({ belief: true, changesProved: false, reasons: [{ code: 'b1' }], complete: true });
    expect(shown.of('decl:Spyro.Evil').belief).toBe(true);
    const hidden = classesOf(BASE, append(BASE, VOCAB, EVIL), { ...options, withDrafts: false });
    expect(hidden.of('decl:Spyro.Evil')).toEqual(NOT_RV7);
    expect(hidden.of('premise:cynder-not-good:cynder_is_evil').belief).toBe(true);
    // A draft whose facts lack its own statement fails closed (F6): every new definition is a belief, incomplete.
    const blind = classesOf(BASE, append(BASE, VOCAB, EVIL), { ...options, premises: [{ ...premise, facts: {} }] });
    expect(blind.of('decl:Spyro.Evil')).toMatchObject({ belief: true, complete: false });
  });

  it('complete: false when a card statement lacks typeConsts (D2-25)', () => {
    const r = classesOf(BASE, append(BASE, VOCAB, EVIL), { ledger: [created('Spyro.Evil', 'statements')], current: { overrides: { 'Spyro.cynder_dark_past': { noTypeConsts: true } } } });
    expect(r.of('decl:Spyro.Evil')).toEqual({ belief: true, changesProved: false, reasons: [{ code: 'b4', name: 'Spyro.Evil' }], complete: false });
  });
});

describe('changes what is proved (§4.4)', () => {
  it('c1 and b2: a Change of an AXIOM card; c1 alone for a proposition’s, with c2 only on a Result that proves it', () => {
    const axiom = classesOf(BASE, edit(BASE, MAIN, 'abbrev cynder_dark_past : Prop := HasDarkPast cynder', 'abbrev cynder_dark_past : Prop := HasDarkPast cynder ∧ True'));
    expect(axiom.of('card:cynder-dark-past')).toEqual({
      belief: true,
      changesProved: true,
      reasons: [
        { code: 'b2', cards: ['cynder-dark-past'] },
        { code: 'c1', cards: ['cynder-dark-past'] },
      ],
      complete: true,
    });
    const change = (texts: Texts) =>
      edit(texts, MAIN, 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro', 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro ∧ True');
    const statement = classesOf(FORMALISED, change(FORMALISED));
    expect(statement.of(`card:${TARGET}`)).toEqual({ belief: false, changesProved: true, reasons: [{ code: 'c1', cards: [TARGET] }], complete: true });
    expect(statement.of(RESULT)).toEqual(NOT_RV7);
    const provedChanged = classesOf(FORMALISED, change(proved(FORMALISED)));
    expect(provedChanged.of(RESULT)).toEqual({ belief: false, changesProved: true, reasons: [{ code: 'c2', name: 'Spyro.cynder_not_good', cards: [TARGET] }], complete: true });
  });

  it('c1: a Result that replaces your proof; a pending target proved is not c1', () => {
    const yours = proved(FORMALISED);
    const replaced = edit(yours, MAIN, HONEST_PROOF, 'theorem cynder_not_good.holds : cynder_not_good :=\n  by exact pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n');
    expect(classesOf(yours, replaced).of(RESULT)).toEqual({ belief: false, changesProved: true, reasons: [{ code: 'c1', name: TARGET_HOLDS, cards: [TARGET] }], complete: true });
    const pending = edit(FORMALISED, MAIN, TARGET_LINE, `${TARGET_LINE}axiom cynder_not_good.holds : cynder_not_good\n`);
    expect(classesOf(pending, proved(FORMALISED)).of(RESULT)).toEqual(NOT_RV7);
  });

  it('c3: a changed sentence on a card with Lean', () => {
    const current = edit(
      edit(BASE, MAIN, 'natural_name: Cynder is a character who has a dark past', 'natural_name: Cynder has a dark past'),
      MAIN,
      'abbrev cynder_dark_past : Prop := HasDarkPast cynder',
      'abbrev cynder_dark_past : Prop := HasDarkPast cynder ∧ True',
    );
    expect(classesOf(BASE, current).of('card:cynder-dark-past').reasons.map((x) => x.code)).toEqual(['b2', 'c1', 'c3']);
  });

  it('c4: every Add arrow, "adds no new basis" when its source rests only on what the question covers (AF8)', () => {
    const dark = [
      '/-',
      '@@ telelean v1',
      'id: dark',
      'type: PROPOSITION',
      'natural_name: Cynder has a dark past, again',
      'premises: cynder-dark-past',
      'asserted: 2026-11-01',
      'lean: Spyro.dark',
      '-/',
      '/-- Cynder has a dark past, again -/',
      'abbrev dark : Prop := HasDarkPast cynder',
      'theorem dark.holds : dark := cynder_dark_past.holds',
    ].join('\n');
    const base = append(edit(FORMALISED, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'premises: cynder-dark-past'), MAIN, dark);
    const arrow = (source: string) => edit(base, MAIN, 'premises: cynder-dark-past\nasserted: 2026-11-01\nlean: Spyro.cynder_not_good', `premises: cynder-dark-past, ${source}\nasserted: 2026-11-01\nlean: Spyro.cynder_not_good`);
    const inference: SessionInference = { ...INFERENCE, question: { sources: ['cynder-dark-past'], fromNothing: false } };
    const ledger = (source: string): LedgerEntry[] => [{ kind: 'arrow', source, target: TARGET, step: 's1', why: 'needed' }];
    // dark's proof rests on cynder-dark-past alone: no new basis.
    const covered = classesOf(base, arrow('dark'), { ledger: ledger('dark'), inferences: [inference], current: { overrides: { 'Spyro.dark.holds': { axioms: ['Spyro.cynder_dark_past.holds'] } } } });
    expect(covered.problems).toEqual([]);
    expect(covered.of('arrow:dark>cynder-not-good')).toEqual({
      belief: false,
      changesProved: true,
      reasons: [{ code: 'c4', arrow: { source: 'dark', target: TARGET } }],
      complete: true,
      addsNoNewBasis: true,
    });
    // Its proof's footprint also holds the presupposition of the opaque `cynder`: a new basis.
    expect(classesOf(base, arrow('dark'), { ledger: ledger('dark'), inferences: [inference] }).of('arrow:dark>cynder-not-good').addsNoNewBasis).toBe(false);
    // An axiom card is its own basis.
    expect(classesOf(base, arrow('new-spyro-pg'), { ledger: ledger('new-spyro-pg'), inferences: [inference] }).of('arrow:new-spyro-pg>cynder-not-good')).toMatchObject({
      changesProved: true,
      addsNoNewBasis: false,
    });
    // A proof that uses `sorry` proves nothing: its card is its own basis, as a pending one (fixer 2a, ADV-9).
    const sorry = (axioms: string[], usesSorry: boolean) =>
      classesOf(base, arrow('dark'), { ledger: ledger('dark'), inferences: [inference], current: { overrides: { 'Spyro.dark.holds': { axioms, usesSorry } } } }).of('arrow:dark>cynder-not-good');
    expect(sorry(['Spyro.cynder_dark_past.holds', 'sorryAx'], true)).toMatchObject({ changesProved: true, addsNoNewBasis: false });
    expect(sorry(['Spyro.cynder_dark_past.holds', 'sorryAx'], false).addsNoNewBasis).toBe(false);
    expect(sorry(['Spyro.cynder_dark_past.holds'], true).addsNoNewBasis).toBe(false);
    // A source whose footprint is unknown (no `axioms` in its facts) never adds "no new basis" (fail closed).
    const B = modelOf(base);
    const W = modelOf(arrow('dark'), {}, (facts) => {
      const holds = facts.decls.find((d) => d.name === 'Spyro.dark.holds');
      if (holds) delete holds.axioms;
    });
    expect(W.declFacts.get('Spyro.dark.holds')?.axioms).toBeUndefined();
    const { drafts } = computeItems({ base: B, current: W, ledger: ledger('dark'), premises: [], inferences: [inference], ended: [TARGET] });
    expect(classify({ base: B, current: W, drafts, premises: [], inferences: [inference], withDrafts: true })['arrow:dark>cynder-not-good']).toMatchObject({ addsNoNewBasis: false });
  });

  it('a draft whose module did not build is marked, and so is its class: its facts are missing (fixer 2a, ADV-3)', () => {
    const failed = classesOf(BASE, FORMALISED, { ledger: FORMALISED_LEDGER, current: { moduleStates: { [MAIN]: 'failed' } } });
    expect(failed.drafts.find((d) => d.key === 'card:pg-no-dark-past')?.factsMissing).toBe(true);
    expect(failed.of('card:pg-no-dark-past').factsMissing).toBe(true);
    const built = classesOf(BASE, FORMALISED, { ledger: FORMALISED_LEDGER });
    expect(built.drafts.find((d) => d.key === 'card:pg-no-dark-past')?.factsMissing).toBeUndefined();
    expect(built.of('card:pg-no-dark-past').factsMissing).toBeUndefined();
  });
});
