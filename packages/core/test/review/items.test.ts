/**
 * Slice 2a1 (docs/slice2-plan.md 4.2, 4.3, 6.1): ownership (`computeItems`) and content keys, on the Spyro fixture and
 * edited copies, with facts from `fakeFacts` (value and type constants on).
 */
import { describe, expect, it } from 'vitest';
import { EditSession } from '../../src/edit/session.js';
import type { FrozenSnapshot } from '../../src/gate/types.js';
import { planGhostAdoption } from '../../src/gate/index.js';
import { commonSubsequence, compareTexts, computeItems, premiseDraftKey, reachingDraft } from '../../src/review/items.js';
import type { ItemDraft, LedgerEntry, PremiseDraft, SessionInference } from '../../src/review/types.js';
import { normative, pinned, proved } from '../gate/helpers/spyroRun.js';
import { BASE, INFERENCE, MAIN, TARGET, TARGET_HOLDS, TARGET_STATEMENT, VOCAB, append, created, draftOf, edit, modelOf, type Texts } from './helpers/session.js';
import type { FakeFactsOptions } from '../project/helpers/fakeFacts.js';
import type { LeanFacts } from '../../src/facts.js';

interface RunOptions {
  ledger?: LedgerEntry[];
  premises?: PremiseDraft[];
  ended?: string[];
  inferences?: SessionInference[];
  active?: { step: string; target: string; stepStart: Texts; freeze?: FrozenSnapshot };
  current?: FakeFactsOptions;
  mutate?: (facts: LeanFacts) => void;
}

function run(base: Texts, current: Texts, o: RunOptions = {}) {
  return computeItems({
    base: modelOf(base),
    current: modelOf(current, o.current ?? {}, o.mutate),
    ledger: o.ledger ?? [],
    premises: o.premises ?? [],
    inferences: o.inferences ?? [INFERENCE],
    ended: o.ended ?? [TARGET],
    ...(o.active ? { active: { ...o.active, stepStart: modelOf(o.active.stepStart) } } : {}),
  });
}

const byKey = (r: { drafts: ItemDraft[] }) => new Map(r.drafts.map((d) => [d.key, d]));
const draft = (r: { drafts: ItemDraft[] }, key: string): ItemDraft => {
  const found = byKey(r).get(key);
  if (!found) throw new Error(`no draft ${key}; drafts: ${r.drafts.map((d) => d.key).join(', ')}`);
  return found;
};
const unowned = (r: { problems: Array<{ code: string; text: string }> }) => r.problems.filter((p) => p.code === 'unowned').map((p) => p.text);
const RESULT = `proof:${TARGET}`;

/** pg-no-dark-past formalised (its abbrev, docstring mirror and `axiom .holds`) and pinned, as normalisation leaves it. */
const FORMALISED = pinned(normative(BASE));
const FORMALISED_LEDGER = [created('Spyro.pg_no_dark_past', 'statements'), created('Spyro.pg_no_dark_past.holds', 'statements')];

describe('cards (§4.2)', () => {
  it('a statement where B had none, with its pin, docstring mirror and an AXIOM card’s .holds: one Formalize item', () => {
    const r = run(BASE, FORMALISED, { ledger: FORMALISED_LEDGER });
    expect(r.problems).toEqual([]);
    expect(r.drafts.map((d) => d.key)).toEqual(['card:pg-no-dark-past', RESULT]);
    const d = draft(r, 'card:pg-no-dark-past');
    expect(d.kind).toBe('formalize');
    expect(d.origin).toEqual({ step: 's1', target: TARGET, phase: 'statements' });
    expect(d.partOfResult).toBeUndefined();
    expect(d.provides).toEqual({ decls: ['Spyro.pg_no_dark_past', 'Spyro.pg_no_dark_past.holds'], arrows: [], cards: ['pg-no-dark-past'] });
    expect(d.mentions).toEqual(['Spyro.Character', 'Spyro.Game', 'Spyro.GoodAddition', 'Spyro.HasDarkPast', 'Spyro.IsPG']);
    expect(d.content.fields).toEqual({ lean: 'Spyro.pg_no_dark_past' });
    expect(d.content.decls.map((x) => x.name)).toEqual(['Spyro.pg_no_dark_past', 'Spyro.pg_no_dark_past.holds']);
    expect(d.content.decls[0]?.text).toContain('/-- PG games cannot have characters with dark pasts -/');
  });

  it('the id write-back of a derived id goes with the statement', () => {
    const base = edit(BASE, MAIN, 'id: pg-no-dark-past\n', '');
    const derived = 'pg-games-cannot-have-characters-with';
    const current = edit(normative(base), MAIN, 'stance: rule\nasserted: 2026-11-01\n-/', `id: ${derived}\nstance: rule\nasserted: 2026-11-01\nlean: Spyro.pg_no_dark_past\n-/`);
    const r = run(base, current, { ledger: FORMALISED_LEDGER });
    expect(r.problems).toEqual([]);
    expect(draft(r, `card:${derived}`).content.fields).toEqual({ id: derived, lean: 'Spyro.pg_no_dark_past' });
  });

  it('an existing statement changed: a Change item, with the AXIOM card’s .holds', () => {
    const current = edit(BASE, MAIN, 'abbrev cynder_dark_past : Prop := HasDarkPast cynder', 'abbrev cynder_dark_past : Prop := HasDarkPast cynder ∧ True');
    const r = run(BASE, current);
    expect(r.problems).toEqual([]);
    const d = draft(r, 'card:cynder-dark-past');
    expect(d.kind).toBe('change');
    expect(d.provides.decls).toEqual(['Spyro.cynder_dark_past', 'Spyro.cynder_dark_past.holds']);
    expect(d.origin).toEqual({ step: '', target: '', phase: 'statements' });
  });

  it('a target’s .holds theorem is its Result; any other new .holds is unowned', () => {
    const r = run(BASE, proved(normative(BASE)), { ledger: [created('Spyro.pg_no_dark_past', 'statements'), created('Spyro.pg_no_dark_past.holds', 'statements')] });
    expect(unowned(r)).toEqual([]);
    const result = draft(r, RESULT);
    expect(result.kind).toBe('result');
    expect(result.provides.decls).toEqual([TARGET_HOLDS]);
    expect(result.asInBase).toBeUndefined();
    expect(result.origin).toEqual({ step: 's1', target: TARGET, phase: 'proof' });
    expect(result.mentions).toEqual(expect.arrayContaining(['Spyro.cynder_not_good', 'Spyro.pg_no_dark_past.holds', 'Spyro.cynder_dark_past.holds']));

    const axiom = run(BASE, append(BASE, MAIN, 'axiom cynder_not_good.holds : cynder_not_good'));
    expect(unowned(axiom)).toEqual(['Spyro.cynder_not_good.holds changed, but no review item covers it.']);
    expect(byKey(axiom).get(RESULT)?.provides.decls).toEqual([TARGET_HOLDS]);

    const card = '/-\n@@ telelean v1\nid: both\ntype: PROPOSITION\nnatural_name: Both\nasserted: 2026-11-01\nlean: Spyro.both\n-/\n/-- Both -/\nabbrev both : Prop := cynder_dark_past ∧ new_spyro_pg';
    const base = append(BASE, MAIN, card);
    const other = run(base, append(base, MAIN, 'theorem both.holds : both := ⟨cynder_dark_past.holds, new_spyro_pg.holds⟩'));
    expect(unowned(other)).toEqual(['Spyro.both.holds changed, but no review item covers it.']);
  });
});

describe('block fields (§4.2) and arrow items', () => {
  /** pg-no-dark-past formalised in B, and only one arrow drawn into the target: Claude may add the others. */
  const base = edit(FORMALISED, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'premises: cynder-dark-past');
  const arrow = (texts: Texts, sources: string) => edit(texts, MAIN, 'premises: cynder-dark-past\n', `premises: cynder-dark-past, ${sources}\n`);

  it('a `premises:` addition with a ledger `arrow` entry is that arrow’s item, part of the target’s Result; without one it is unowned', () => {
    const ledger: LedgerEntry[] = [{ kind: 'arrow', source: 'new-spyro-pg', target: TARGET, step: 's1', why: 'the proof needs it' }];
    const r = run(base, arrow(base, 'new-spyro-pg, pg-no-dark-past'), { ledger });
    const d = draft(r, 'arrow:new-spyro-pg>cynder-not-good');
    expect(d.kind).toBe('add-arrow');
    expect(d.partOfResult).toBe(TARGET);
    expect(d.origin).toEqual({ step: 's1', target: TARGET, phase: 'proof' });
    expect(d.provides).toEqual({ decls: [], arrows: [{ source: 'new-spyro-pg', target: TARGET }], cards: [] });
    expect(d.content.arrow).toEqual({ source: 'new-spyro-pg', target: TARGET });
    expect(unowned(r)).toEqual([
      'The arrow “PG games cannot have characters with dark pasts” → “Cynder would not be a good addition to the new Spyro game” changed, but no review item covers it.',
    ]);
  });

  it('a removed arrow, a changed sentence, a new `follows_from:` and a reordered list are unowned or nothing', () => {
    const removed = run(FORMALISED, base);
    expect(unowned(removed)).toHaveLength(2);
    const sentence = run(BASE, edit(BASE, MAIN, 'natural_name: The new Spyro game is PG', 'natural_name: The new Spyro game is rated PG'));
    expect(unowned(sentence)).toEqual(['The natural_name line of “The new Spyro game is rated PG” changed, but no review item covers it.']);
    const mark = run(base, edit(base, MAIN, 'id: new-spyro-pg\n', 'id: new-spyro-pg\nfollows_from: nothing\n'));
    expect(unowned(mark)).toEqual(['The follows_from line of “The new Spyro game is PG” changed, but no review item covers it.']);
    const reordered = run(FORMALISED, edit(FORMALISED, MAIN, 'cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'new-spyro-pg,cynder-dark-past, pg-no-dark-past'));
    expect(reordered.problems).toEqual([]);
    expect(reordered.drafts.map((d) => d.key)).toEqual([RESULT]);
  });

  it('a new block no ledger entry wrote, and a removed block, are unowned with their declarations', () => {
    const card = '/-\n@@ telelean v1\nid: extra\ntype: AXIOM\nnatural_name: Extra\nasserted: 2026-11-01\nlean: Spyro.extra\n-/\n/-- Extra -/\nabbrev extra : Prop := IsPG newSpyro\naxiom extra.holds : extra';
    const r = run(BASE, append(BASE, MAIN, card));
    expect(unowned(r)).toEqual([
      'The card “Extra” changed, but no review item covers it.',
      'Spyro.extra changed, but no review item covers it.',
      'Spyro.extra.holds changed, but no review item covers it.',
    ]);
    const gone = run(append(BASE, MAIN, card), BASE);
    expect(unowned(gone)).toEqual([
      'The card “Extra” changed, but no review item covers it.',
      'Spyro.extra changed, but no review item covers it.',
      'Spyro.extra.holds changed, but no review item covers it.',
    ]);
  });
});

describe('declarations no card owns (§4.2, D2-43)', () => {
  const statementPhase = append(
    BASE,
    VOCAB,
    [
      '/-- is a villain -/\naxiom IsVillain : Character → Prop',
      '/-- villains -/\naxiom Villain : Type',
      '/-- there is at least one villain -/\naxiom Villain.exists : Nonempty Villain',
      'instance : Nonempty Villain := Villain.exists',
      '/-- is evil -/\ndef Evil (c : Character) : Prop := HasDarkPast c',
      'instance : Inhabited Character := ⟨cynder⟩',
      'instance : Coe Villain Character := ⟨fun _ => cynder⟩',
      '/-- everyone is evil -/\naxiom everyone_evil : ∀ c : Character, HasDarkPast c',
      '/-- nobody recorded it -/\ndef Orphan : Prop := True',
      '/-- a lemma written early -/\ntheorem early : True := trivial',
    ].join('\n'),
  );
  const statementLedger = [
    'Spyro.IsVillain',
    'Spyro.Villain',
    'Spyro.Villain.exists',
    'Spyro.instNonemptyVillain',
    'Spyro.Evil',
    'Spyro.instInhabitedCharacter',
    'Spyro.instCoeVillainCharacter',
    'Spyro.everyone_evil',
    'Spyro.early',
  ].map((name) => created(name, 'statements'));

  it('statement phase: vocabulary terms, a presupposition with its helper instance, definitions, instances and coercions', () => {
    const r = run(BASE, statementPhase, { ledger: statementLedger });
    const kinds = Object.fromEntries(r.drafts.map((d) => [d.key, [d.kind, d.declKind ?? null]]));
    expect(kinds).toEqual({
      'vocab:Spyro.IsVillain': ['vocabulary-term', null],
      'vocab:Spyro.Villain': ['vocabulary-term', null],
      'decl:Spyro.Villain.exists': ['declaration', 'presupposition'],
      'decl:Spyro.Evil': ['declaration', 'definition'],
      'decl:Spyro.instInhabitedCharacter': ['declaration', 'instance'],
      'decl:Spyro.instCoeVillainCharacter': ['declaration', 'coercion'],
      [RESULT]: ['result', null],
    });
    expect(draft(r, 'decl:Spyro.Villain.exists').provides.decls).toEqual(['Spyro.Villain.exists', 'Spyro.instNonemptyVillain']);
    for (const d of r.drafts) expect(d.partOfResult).toBeUndefined();
    expect(draft(r, 'decl:Spyro.Evil').origin).toEqual({ step: 's1', target: TARGET, phase: 'statements' });
    // A theorem is proof material, whenever it was created.
    expect(draft(r, RESULT).provides.decls).toEqual(['Spyro.early']);
    expect(draft(r, RESULT).asInBase).toBeUndefined();
    // A Prop axiom bound to no card (D2-40), and a declaration with no `created` entry.
    expect(unowned(r)).toEqual(['Spyro.Orphan changed, but no review item covers it.', 'Spyro.everyone_evil changed, but no review item covers it.']);
  });

  const proofPhase = append(
    BASE,
    MAIN,
    [
      'theorem helper : HasDarkPast cynder := cynder_dark_past.holds',
      '/-- is sneaky -/\naxiom Sneaky : Character → Prop',
      '/-- is vile -/\ndef Vile (c : Character) : Prop := ¬ IsPG newSpyro ∧ HasDarkPast c',
      '/-- is mean -/\ndef Mean (c : Character) : Prop := HasDarkPast c',
      '/-- is cruel -/\ndef Cruel (c : Character) : Prop := HasDarkPast c',
    ].join('\n'),
  );
  /** Vile's entry names the step's premise draft that reached it when the step ended (D2-42, V2A1-C3). */
  const VILE_DRAFT = 'premise:cynder-not-good:cynder_is_evil';
  const proofLedger = [
    created('Spyro.helper', 'proof'),
    created('Spyro.Sneaky', 'proof'),
    created('Spyro.Vile', 'proof', 's1', VILE_DRAFT),
    created('Spyro.Mean', 'statements'),
    created('Spyro.Cruel', 'proof'),
  ];

  it('proof phase: lemmas, vocabulary and definitions are proof material; a definition the step’s premise draft reaches is part of its Result; a statement-phase one is its own item', () => {
    const premise = draftOf({ consts: ['Spyro.Vile', 'Spyro.Mean', 'Spyro.cynder'] });
    const r = run(BASE, proofPhase, { ledger: proofLedger, premises: [premise] });
    expect(r.problems).toEqual([]);
    expect(r.drafts.map((d) => d.key)).toEqual(['decl:Spyro.Mean', 'decl:Spyro.Vile', 'premise:cynder-not-good:cynder_is_evil', RESULT]);
    expect(draft(r, RESULT).provides.decls).toEqual(['Spyro.Cruel', 'Spyro.Sneaky', 'Spyro.helper']);
    expect(draft(r, RESULT).asInBase).toBeUndefined();
    expect(draft(r, 'decl:Spyro.Vile')).toMatchObject({ partOfResult: TARGET, origin: { step: 's1', target: TARGET, phase: 'proof' }, declKind: 'definition' });
    expect(draft(r, 'decl:Spyro.Mean').partOfResult).toBeUndefined();
    expect(draft(r, 'decl:Spyro.Mean').origin.phase).toBe('statements');
  });

  it('ownership is fixed at creation (F7): a proof-phase definition stays proof material when a later statement, or a later step’s draft, reaches it', () => {
    const before = run(BASE, proofPhase, { ledger: proofLedger });
    expect(draft(before, RESULT).provides.decls).toContain('Spyro.Cruel');
    const later = edit(proofPhase, MAIN, 'abbrev cynder_dark_past : Prop := HasDarkPast cynder', 'abbrev cynder_dark_past : Prop := HasDarkPast cynder ∧ Cruel cynder');
    const inference: SessionInference = { ...INFERENCE, steps: ['s1', 's2'] };
    // The creating step's own draft reaches Vile only; the card statement and a later step's draft reach Cruel.
    const premises = [draftOf({ consts: ['Spyro.Vile'] }), draftOf({ step: 's2', leanName: 'cruel_premise', consts: ['Spyro.Cruel'] })];
    const r = run(BASE, later, { ledger: proofLedger, inferences: [inference], premises });
    expect(draft(r, RESULT).provides.decls).toEqual(['Spyro.Cruel', 'Spyro.Sneaky', 'Spyro.helper']);
    expect(byKey(r).has('decl:Spyro.Cruel')).toBe(false);
    expect(draft(r, 'decl:Spyro.Vile').partOfResult).toBe(TARGET);
    expect(draft(r, 'card:cynder-dark-past').kind).toBe('change');
  });

  it('the D2-42 exception is the ledger’s (V2A1-C3): it survives the draft’s withdrawal, and a draft that reaches a definition later changes nothing', () => {
    // Vile's draft was withdrawn since (a later Result version): Vile stays its own item, part of the Result.
    const withdrawn = run(BASE, proofPhase, { ledger: proofLedger, premises: [] });
    expect(withdrawn.problems).toEqual([]);
    expect(draft(withdrawn, 'decl:Spyro.Vile')).toMatchObject({ partOfResult: TARGET, origin: { step: 's1', target: TARGET, phase: 'proof' } });
    expect(draft(withdrawn, RESULT).provides.decls).toEqual(['Spyro.Cruel', 'Spyro.Sneaky', 'Spyro.helper']);
    // Cruel's entry names no draft: a draft of its step that reaches it now (new facts at a re-check) changes nothing.
    const recheck = run(BASE, proofPhase, { ledger: proofLedger, premises: [draftOf({ consts: ['Spyro.Cruel', 'Spyro.cynder'] })] });
    expect(byKey(recheck).has('decl:Spyro.Cruel')).toBe(false);
    expect(draft(recheck, RESULT).provides.decls).toContain('Spyro.Cruel');
    // What 2d records when a step ends: the first draft of that step, by key, whose statement reaches the name.
    const model = modelOf(proofPhase);
    const drafts = [draftOf({ leanName: 'zz_later', consts: ['Spyro.Vile'] }), draftOf({ consts: ['Spyro.Vile', 'Spyro.cynder'] }), draftOf({ step: 's2', leanName: 'a_other', consts: ['Spyro.Cruel'] })];
    expect(reachingDraft(model, drafts, 's1', 'Spyro.Vile')).toBe(VILE_DRAFT);
    expect(reachingDraft(model, drafts, 's1', 'Spyro.Cruel')).toBeUndefined();
    expect(reachingDraft(model, drafts, 's2', 'Spyro.Cruel')).toBe('premise:cynder-not-good:a_other');
  });

  it('an axiom that is no shape-passing term or presupposition is unowned in either phase (D2-40, F2): never proof material', () => {
    const cheat = append(BASE, MAIN, '/-- a cheat -/\naxiom cheat : HasDarkPast cynder');
    for (const phase of ['statements', 'proof'] as const) {
      const r = run(BASE, cheat, { ledger: [created('Spyro.cheat', phase)] });
      expect(unowned(r), phase).toEqual(['Spyro.cheat changed, but no review item covers it.']);
      expect(r.drafts.map((d) => d.key)).toEqual([RESULT]);
      expect(draft(r, RESULT).provides.decls).toEqual([]);
    }
    // A shape-passing predicate created in a proof phase stays proof material (the gate's new-axiom rule judges it).
    const sneaky = run(BASE, append(BASE, MAIN, '/-- is sneaky -/\naxiom Sneaky : Character → Prop'), { ledger: [created('Spyro.Sneaky', 'proof')] });
    expect(sneaky.problems).toEqual([]);
    expect(draft(sneaky, RESULT).provides.decls).toEqual(['Spyro.Sneaky']);
  });

  it('a changed existing vocabulary item is a vocabulary change; a removed one is unowned', () => {
    const changed = run(BASE, edit(BASE, VOCAB, '/-- is rated PG -/', '/-- is rated PG by the board -/'));
    expect(changed.problems).toEqual([]);
    expect(draft(changed, 'decl:Spyro.IsPG')).toMatchObject({ kind: 'declaration', declKind: 'vocabulary-change', provides: { decls: ['Spyro.IsPG'] } });
    const base = append(BASE, VOCAB, '/-- unused -/\naxiom Unused : Character → Prop');
    expect(unowned(run(base, BASE))).toEqual(['Spyro.Unused changed, but no review item covers it.']);
  });

  it('names only Lean reports follow their parent', () => {
    const texts = append(BASE, VOCAB, '/-- a record -/\nstructure Rec where\n  past : Prop');
    const field = (facts: LeanFacts) => {
      const parent = facts.decls.find((d) => d.name === 'Spyro.Rec');
      if (parent) facts.decls.push({ ...parent, name: 'Spyro.Rec.past', kind: 'def', type: 'Spyro.Rec → Prop', parent: 'Spyro.Rec', typeConsts: ['Spyro.Rec'], valueConsts: ['Spyro.Rec'] });
    };
    const r = run(BASE, texts, { ledger: [created('Spyro.Rec', 'statements')], mutate: field });
    expect(r.problems).toEqual([]);
    expect(draft(r, 'decl:Spyro.Rec').provides.decls).toEqual(['Spyro.Rec', 'Spyro.Rec.past']);
  });

  it('the active step owns what it made since S₀: statements when its freeze holds them, proof material otherwise', () => {
    const stepStart = FORMALISED;
    const current = append(append(stepStart, VOCAB, '/-- is evil -/\ndef Evil (c : Character) : Prop := HasDarkPast c'), MAIN, 'theorem helper : HasDarkPast cynder := cynder_dark_past.holds');
    const freeze: FrozenSnapshot = {
      round: 1,
      permitted: { standard: [], signature: [], selected: [], presuppositions: [], derivationFootprints: [], unusable: [], all: [] },
      targetStatement: 'Spyro.cynder_not_good',
      declarations: { 'Spyro.Evil': {} },
      axioms: [],
    };
    const inference: SessionInference = { ...INFERENCE, steps: ['s1', 's2'] };
    const r = run(BASE, current, {
      ledger: FORMALISED_LEDGER,
      inferences: [inference],
      ended: [],
      active: { step: 's2', target: TARGET, stepStart, freeze },
      premises: [draftOf({ step: 's2' })],
    });
    expect(r.problems).toEqual([]);
    expect(r.drafts.map((d) => d.key)).toEqual(['card:pg-no-dark-past', 'decl:Spyro.Evil', RESULT]);
    expect(draft(r, 'decl:Spyro.Evil').origin).toEqual({ step: 's2', target: TARGET, phase: 'statements' });
    expect(draft(r, 'card:pg-no-dark-past').origin).toEqual({ step: 's1', target: TARGET, phase: 'statements' });
    expect(draft(r, RESULT).provides.decls).toEqual(['Spyro.helper']);
    expect(draft(r, RESULT).origin).toEqual({ step: 's2', target: TARGET, phase: 'proof' });
  });
});

describe('text outside declarations (§4.2, D2-52)', () => {
  const inMain = (line: string) => `\`${line}\` in Model/Spyro/Main.lean changed, but no review item covers it.`;

  it('commands are unowned, an `open … in` line above a declaration among them, and so is a comment no new or changed declaration is next to', () => {
    const current = append(
      BASE,
      MAIN,
      [
        '-- a note above a command',
        'open Classical in',
        'theorem helper : HasDarkPast cynder := cynder_dark_past.holds',
        'attribute [simp] cynder_dark_past.holds',
        '#print axioms cynder_dark_past.holds',
      ].join('\n'),
    );
    const r = run(BASE, current, { ledger: [created('Spyro.helper', 'proof')] });
    expect(draft(r, RESULT).provides.decls).toEqual(['Spyro.helper']);
    expect(unowned(r)).toEqual([
      inMain('-- a note above a command'),
      inMain('open Classical in'),
      inMain('attribute [simp] cynder_dark_past.holds'),
      inMain('#print axioms cynder_dark_past.holds'),
    ]);
    // Between two of the person's declarations, a new comment belongs to nothing either.
    const between = run(BASE, edit(BASE, VOCAB, '/-- games -/', '-- a note\n/-- games -/'));
    expect(unowned(between)).toEqual(['`-- a note` in Model/Spyro/Vocabulary.lean changed, but no review item covers it.']);
  });

  it('a comment W adds goes with the new or changed declaration below it, else above it: in that item’s content and content key (C5)', () => {
    const lemma = 'theorem helper : HasDarkPast cynder := cynder_dark_past.holds';
    const ledger = [created('Spyro.helper', 'proof')];
    const plain = run(BASE, append(BASE, MAIN, lemma), { ledger });
    const commented = run(BASE, append(BASE, MAIN, `-- the step needs this\n\n${lemma}\n-- the end of the helpers`), { ledger });
    expect(commented.problems).toEqual([]);
    expect(draft(commented, RESULT).provides.decls).toEqual(['Spyro.helper']);
    expect(draft(commented, RESULT).content.decls).toEqual([{ name: 'Spyro.helper', text: `-- the step needs this\n\n${lemma}\n-- the end of the helpers`, kind: 'theorem' }]);
    expect(draft(commented, RESULT).contentKey).not.toBe(draft(plain, RESULT).contentKey);
    const reworded = run(BASE, append(BASE, MAIN, `-- the step needs it\n\n${lemma}\n-- the end of the helpers`), { ledger });
    expect(draft(reworded, RESULT).contentKey).not.toBe(draft(commented, RESULT).contentKey);
    // Above a `.holds` that the step changed (a pending axiom proved): the Result's.
    const pending = append(BASE, MAIN, 'axiom cynder_not_good.holds : cynder_not_good');
    const proof = edit(pending, MAIN, 'axiom cynder_not_good.holds : cynder_not_good', '-- by the rule\ntheorem cynder_not_good.holds : cynder_not_good := sorry');
    const holds = run(pending, proof);
    expect(holds.problems).toEqual([]);
    expect(draft(holds, RESULT).content.decls.map((d) => d.text)).toEqual(['-- by the rule\ntheorem cynder_not_good.holds : cynder_not_good := sorry']);
    // compareTexts says which declaration each added comment goes with (2b2's revert takes it out with it, §4.11).
    const texts = compareTexts(modelOf(BASE), modelOf(append(BASE, MAIN, `-- the step needs this\n\n${lemma}\n-- the end of the helpers`)));
    expect(texts.files.map((f) => [f.path, f.removed.length, f.added.map((u) => [u.kind, u.attachedTo ?? null])])).toEqual([
      [MAIN, 0, [['line', 'Spyro.helper'], ['decl', null], ['line', 'Spyro.helper']]],
    ]);
  });

  it('the person’s lines outside declarations stay as they were (F1): a comment deleted, edited or moved, and a changed command, are unowned; blank lines are no difference', () => {
    const base = append(BASE, MAIN, '-- first note\n\n-- second note');
    expect(unowned(run(base, BASE))).toEqual([inMain('-- first note'), inMain('-- second note')]);
    expect(unowned(run(base, edit(base, MAIN, '-- second note', '-- second note, edited')))).toEqual([inMain('-- second note'), inMain('-- second note, edited')]);
    const moved = unowned(run(base, edit(base, MAIN, '-- first note\n\n-- second note', '-- second note\n\n-- first note')));
    expect(moved).toHaveLength(2);
    expect(moved.every((text) => text === inMain('-- first note') || text === inMain('-- second note'))).toBe(true);
    expect(unowned(run(base, edit(base, MAIN, '\nend Spyro', '\nend Spyro -- done')))).toEqual([inMain('end Spyro'), inMain('end Spyro -- done')]);
    const spaced = edit(base, MAIN, '-- first note\n\n-- second note\n', '\n\n-- first note\n-- second note\n\n\n');
    expect(run(base, spaced).problems).toEqual([]);
    expect(run(base, spaced).drafts.map((d) => d.key)).toEqual([RESULT]);
  });

  it('`open … in` on the declaration’s own line hides it from the scanner: the whole command is unowned', () => {
    const r = run(BASE, append(BASE, MAIN, 'open Classical in theorem helper : HasDarkPast cynder := cynder_dark_past.holds'), {
      ledger: [created('Spyro.helper', 'proof')],
    });
    expect(unowned(r)).toEqual([
      '`open Classical in theorem helper : HasDarkPast cynder := cynder_dark_past.holds` in Model/Spyro/Main.lean changed, but no review item covers it.',
    ]);
  });

  it('enclosing lines (F13): a new namespace around two items’ declarations, and a `mutual` pair, are owned jointly, never unowned', () => {
    const current = append(
      BASE,
      MAIN,
      [
        'namespace Helpers',
        '',
        '/-- is mean -/',
        'def Mean (c : Character) : Prop := HasDarkPast c',
        '',
        'theorem helper : HasDarkPast cynder := cynder_dark_past.holds',
        '',
        'end Helpers',
        '',
        'mutual',
        '  def isEven : Nat → Bool',
        '    | 0 => true',
        '    | n+1 => isOdd n',
        '  def isOdd : Nat → Bool',
        '    | 0 => false',
        '    | n+1 => isEven n',
        'end',
      ].join('\n'),
    );
    const ledger = [
      created('Spyro.Helpers.Mean', 'statements'),
      created('Spyro.Helpers.helper', 'proof'),
      created('Spyro.isEven', 'statements'),
      created('Spyro.isOdd', 'statements'),
    ];
    const r = run(BASE, current, { ledger });
    expect(r.problems).toEqual([]);
    expect(r.drafts.map((d) => d.key)).toEqual(['decl:Spyro.Helpers.Mean', 'decl:Spyro.isEven', 'decl:Spyro.isOdd', RESULT]);
    expect(draft(r, RESULT).provides.decls).toEqual(['Spyro.Helpers.helper']);
  });

  it('a scope that encloses nothing new, or nothing at all, is unowned', () => {
    const r = run(BASE, append(BASE, MAIN, 'section Empty\nend Empty'));
    expect(unowned(r)).toEqual([
      '`section Empty` in Model/Spyro/Main.lean changed, but no review item covers it.',
      '`end Empty` in Model/Spyro/Main.lean changed, but no review item covers it.',
    ]);
    // Around an existing declaration (F7): unowned too, though the declaration itself is unchanged.
    const wrapped = run(BASE, edit(BASE, VOCAB, '/-- is rated PG -/\naxiom IsPG : Game → Prop\n', 'section Wrap\n/-- is rated PG -/\naxiom IsPG : Game → Prop\nend Wrap\n'));
    expect(unowned(wrapped)).toEqual([
      '`section Wrap` in Model/Spyro/Vocabulary.lean changed, but no review item covers it.',
      '`end Wrap` in Model/Spyro/Vocabulary.lean changed, but no review item covers it.',
    ]);
    expect(wrapped.drafts.map((d) => d.key)).toEqual([RESULT]);
  });

  it('a declaration moved to another file, or out of its place in its file, is a difference (V2A1-C4)', () => {
    const decl = '/-- would be a good addition to -/\naxiom GoodAddition : Character → Game → Prop\n';
    const moved = edit(edit(BASE, VOCAB, decl, ''), MAIN, 'namespace Spyro\n', `namespace Spyro\n\n${decl}`);
    const r = run(BASE, moved);
    expect(r.problems).toEqual([]);
    expect(draft(r, 'decl:Spyro.GoodAddition')).toMatchObject({ kind: 'declaration', declKind: 'vocabulary-change', provides: { decls: ['Spyro.GoodAddition'] } });
    const isPG = '/-- is rated PG -/\naxiom IsPG : Game → Prop\n';
    const swapped = run(BASE, edit(BASE, VOCAB, `${isPG}${decl}`, `${decl}${isPG}`));
    expect(swapped.problems).toEqual([]);
    expect(swapped.drafts.filter((d) => d.declKind === 'vocabulary-change')).toHaveLength(1);
    // A card's statement moved below another card (still pinned): that card's Change item; the block itself did not move.
    const abbrev = '/-- Cynder is a character who has a dark past -/\nabbrev cynder_dark_past : Prop := HasDarkPast cynder\naxiom cynder_dark_past.holds : cynder_dark_past\n';
    const statement = run(BASE, append(edit(BASE, MAIN, abbrev, ''), MAIN, abbrev));
    expect(statement.problems).toEqual([]);
    expect(draft(statement, 'card:cynder-dark-past')).toMatchObject({ kind: 'change', provides: { decls: ['Spyro.cynder_dark_past', 'Spyro.cynder_dark_past.holds'] } });
  });
});

describe('the lines of an existing block (§4.2, F1)', () => {
  const sentence = 'Cynder would not be a good addition to the new Spyro game';

  it('every line no item writes is compared as written and in order: a `type:` change, `kind:` for `type:`, two lines swapped', () => {
    for (const [from, to] of [
      ['type: GOAL', 'type: PROPOSITION'],
      ['type: GOAL', 'kind: GOAL'],
      ['asserted: 2026-11-01\nlean: Spyro.cynder_not_good', 'asserted:  2026-11-01\nlean: Spyro.cynder_not_good'],
    ] as const) {
      const r = run(BASE, edit(BASE, MAIN, from, to));
      expect(unowned(r), to).toEqual(from.startsWith('type') ? [`The type line of “${sentence}” changed, but no review item covers it.`] : []);
    }
    const swapped = unowned(run(BASE, edit(BASE, MAIN, 'type: ASSUMPTION\nnatural_name: The new Spyro game is PG', 'natural_name: The new Spyro game is PG\ntype: ASSUMPTION')));
    expect(swapped).toHaveLength(1);
    expect(swapped[0]).toMatch(/^The (type|natural_name) line of “The new Spyro game is PG” changed, but no review item covers it\.$/);
    const notes = unowned(run(BASE, edit(BASE, MAIN, 'lean: Spyro.new_spyro_pg\n-/', 'lean: Spyro.new_spyro_pg\n---\nA note.\n-/')));
    expect(notes).toEqual(['The notes line of “The new Spyro game is PG” changed, but no review item covers it.']);
  });

  it('a statement bound or unbound by a blank line below the block is the card’s statement item (F3)', () => {
    // The target bound by adjacency only (no `lean:` line); a blank line below its block unbinds it.
    const adjacent = edit(BASE, MAIN, 'asserted: 2026-11-01\nlean: Spyro.cynder_not_good\n-/', 'asserted: 2026-11-01\n-/');
    const unbound = run(adjacent, edit(adjacent, MAIN, '-/\n/-- Cynder would not be a good', '-/\n\n/-- Cynder would not be a good'));
    expect(unbound.problems).toEqual([]);
    expect(draft(unbound, `card:${TARGET}`)).toMatchObject({ kind: 'change', provides: { decls: [TARGET_STATEMENT] } });
    // A code-less card with a declaration after a blank line (TL013); the blank line removed binds it.
    const card = '/-\n@@ telelean v1\nid: extra-card\ntype: PROPOSITION\nnatural_name: Extra\nasserted: 2026-11-01\n-/\n\n/-- Extra -/\nabbrev extra : Prop := IsPG newSpyro';
    const gap = append(BASE, MAIN, card);
    const bound = run(gap, edit(gap, MAIN, '-/\n\n/-- Extra -/', '-/\n/-- Extra -/'));
    expect(bound.problems).toEqual([]);
    expect(draft(bound, 'card:extra-card')).toMatchObject({ kind: 'formalize', provides: { decls: ['Spyro.extra'] } });
  });
});

describe('the id write-back of a derived id (V2A1-C1)', () => {
  /** The target with a derived id (no `id:` line), with one arrow drawn. */
  const derived = 'cynder-would-not-be-a-good';
  const RESULT_D = `proof:${derived}`;
  const noId = edit(BASE, MAIN, 'id: cynder-not-good\n', '');
  const inference = (sources: string[]): SessionInference => ({ target: derived, question: { sources, fromNothing: sources.length === 0 }, order: 0, steps: ['s1'] });
  const items = (base: Texts, current: Texts, ledger: LedgerEntry[], sources: string[], premises: PremiseDraft[] = []) =>
    computeItems({ base: modelOf(base), current: modelOf(current), ledger, premises, inferences: [inference(sources)], ended: [derived] });

  it('telelean’s arrow write is no change of the statement, and after DO-0 the id line alone is no difference', () => {
    const base = edit(noId, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'premises: cynder-dark-past');
    const model = modelOf(base);
    const entry = model.nodes.get(derived);
    if (entry === undefined) throw new Error('no derived id');
    const session = new EditSession(model);
    session.setField(entry.file, entry.block, derived, 'premises', ['cynder-dark-past', 'new-spyro-pg']);
    const written = session.changes()[0]?.after as string;
    expect(written).toContain(`id: ${derived}\n`);
    const withArrow = { ...base, [MAIN]: written };
    const ledger: LedgerEntry[] = [{ kind: 'arrow', source: 'new-spyro-pg', target: derived, step: 's1', why: 'needed' }];
    const r = items(base, withArrow, ledger, ['cynder-dark-past']);
    expect(r.problems).toEqual([]);
    expect(r.drafts.map((d) => d.key)).toEqual([`arrow:new-spyro-pg>${derived}`, RESULT_D]);
    const declined = items(base, edit(withArrow, MAIN, 'premises: cynder-dark-past, new-spyro-pg', 'premises: cynder-dark-past'), [], ['cynder-dark-past']);
    expect(declined.problems).toEqual([]);
    expect(declined.drafts.map((d) => [d.key, d.asInBase ?? false])).toEqual([[RESULT_D, true]]);
  });

  it('a premise written into a derived-id target marked “follows from nothing” gives no statement item', () => {
    const base = edit(noId, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'follows_from: nothing');
    const premise = { ...draftOf(), target: derived };
    const plan = planGhostAdoption(modelOf(base), {
      subject: 'Spyro',
      target: derived,
      naturalName: premise.naturalName,
      leanStatement: premise.leanStatement,
      leanName: premise.leanName,
      session: 'run1',
      today: '2026-11-19',
    });
    const written = { ...base, [MAIN]: plan.changes[0]?.after as string };
    expect(written[MAIN]).toContain(`id: ${derived}\n`);
    const key = `premise:${derived}:cynder_is_evil`;
    const ledger: LedgerEntry[] = [
      { kind: 'premise', card: plan.nodeId, target: derived, holdAs: 'axiom', item: key, commit: 'c1' },
      { kind: 'mark-removed', card: derived, item: key, commit: 'c1' },
    ];
    const r = items(base, written, ledger, [], [premise]);
    expect(r.problems).toEqual([]);
    expect(r.drafts.map((d) => d.key)).toEqual([key, RESULT_D]);
  });
});

describe('names only Lean reports, and modules that did not build', () => {
  it('a `.holds` only Lean reports is its own declaration: present, so the Result is not B’s version (F4)', () => {
    const line = 'open Classical in theorem cynder_not_good.holds : cynder_not_good := sorry';
    const current = append(BASE, MAIN, line);
    const row = (current[MAIN] as string).split('\n').indexOf(line);
    const holdsFacts = (facts: LeanFacts) => {
      const statement = facts.decls.find((d) => d.name === TARGET_STATEMENT);
      if (statement === undefined) throw new Error('no statement facts');
      const range = { start: { line: row, character: 0 }, end: { line: row, character: line.length } };
      const selectionRange = { start: { line: row, character: 26 }, end: { line: row, character: 46 } };
      facts.decls.push({ ...statement, name: TARGET_HOLDS, kind: 'theorem', type: TARGET_STATEMENT, typeSort: 'Prop', range, selectionRange, refs: [], valueConsts: [], typeConsts: [TARGET_STATEMENT] });
      delete facts.decls[facts.decls.length - 1]?.value;
    };
    const r = run(BASE, current, { mutate: holdsFacts });
    expect(draft(r, RESULT).asInBase).toBeUndefined();
    expect(draft(r, RESULT).provides.decls).toEqual([TARGET_HOLDS]);
    expect(r.drafts.map((d) => d.key)).toEqual([RESULT]);
    expect(unowned(r)).toEqual([`\`${line}\` in Model/Spyro/Main.lean changed, but no review item covers it.`]);
  });

  it('a module whose facts are missing changes nothing by itself (F5): children and orphans are compared only where both states have facts', () => {
    const texts = append(BASE, VOCAB, '/-- a record -/\nstructure Rec where\n  past : Prop');
    const base = modelOf(texts, {}, (facts) => {
      const parent = facts.decls.find((d) => d.name === 'Spyro.Rec');
      if (parent === undefined) throw new Error('no Rec facts');
      facts.decls.push({ ...parent, name: 'Spyro.Rec.past', kind: 'def', type: 'Spyro.Rec → Prop', parent: 'Spyro.Rec', typeConsts: ['Spyro.Rec'], valueConsts: ['Spyro.Rec'] });
      const at = { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } };
      facts.decls.push({ ...parent, name: 'Spyro.Aux.helper', kind: 'def', range: at, selectionRange: at, typeConsts: [], valueConsts: [] });
    });
    const current = modelOf(texts, {}, (facts) => {
      facts.decls = facts.decls.filter((d) => d.file !== VOCAB);
    });
    const r = computeItems({ base, current, ledger: [], premises: [], inferences: [INFERENCE], ended: [TARGET] });
    expect(r.problems).toEqual([]);
    expect(r.drafts.map((d) => d.key)).toEqual([RESULT]);
  });
});

describe('commonSubsequence (the ordered comparison of §4.2)', () => {
  /** The length of a longest common subsequence, by dynamic programming. */
  const lcs = (a: string[], b: string[]) => {
    const t = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
    for (let x = 1; x <= a.length; x++)
      for (let y = 1; y <= b.length; y++) {
        const row = t[x] as number[];
        row[y] = a[x - 1] === b[y - 1] ? ((t[x - 1] as number[])[y - 1] as number) + 1 : Math.max((t[x - 1] as number[])[y] as number, row[y - 1] as number);
      }
    return (t[a.length] as number[])[b.length] as number;
  };

  it('keeps a longest common subsequence, in order, on random sequences', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let round = 0; round < 300; round++) {
      const a = Array.from({ length: Math.floor(random() * 12) }, () => 'abcd'.charAt(Math.floor(random() * 4)));
      const b = Array.from({ length: Math.floor(random() * 12) }, () => 'abcd'.charAt(Math.floor(random() * 4)));
      const { keptA, keptB } = commonSubsequence(a, b);
      const fromA = a.filter((_, k) => keptA[k]);
      const fromB = b.filter((_, k) => keptB[k]);
      expect(fromA, `${a.join('')} / ${b.join('')}`).toEqual(fromB);
      expect(fromA.length, `${a.join('')} / ${b.join('')}`).toBe(lcs(a, b));
    }
  });

  it('beyond its edit bound the middle counts as changed in full (fail closed)', () => {
    const a = ['start', ...Array.from({ length: 1100 }, (_, k) => `a${k}`), 'end'];
    const b = ['start', ...Array.from({ length: 1100 }, (_, k) => `b${k}`), 'end'];
    const { keptA, keptB } = commonSubsequence(a, b);
    expect(keptA.filter(Boolean)).toHaveLength(2);
    expect(keptB.filter(Boolean)).toHaveLength(2);
  });
});

describe('Results (F9, AF1)', () => {
  it('a Result for every inference whose step ended, with no difference from B: B’s version, with a stable key', () => {
    const r = run(BASE, BASE);
    expect(r.problems).toEqual([]);
    expect(r.drafts).toHaveLength(1);
    const d = draft(r, RESULT);
    expect(d).toMatchObject({ kind: 'result', asInBase: true, provides: { decls: [], arrows: [], cards: [] }, content: { decls: [] } });
    expect(d.origin).toEqual({ step: 's1', target: TARGET, phase: 'proof' });
    // A statements-only step (or a give-up that kept the statements): its statement items, and the same Result.
    const statements = run(BASE, FORMALISED, { ledger: FORMALISED_LEDGER });
    expect(draft(statements, RESULT).asInBase).toBe(true);
    expect(draft(statements, RESULT).contentKey).toBe(d.contentKey);
    // No inference ended, nothing differs: no Result.
    expect(run(BASE, BASE, { ended: [] }).drafts).toEqual([]);
  });

  it('asInBase exactly when T.holds is B’s (the same text, or absent in both) and there is no proof material', () => {
    const pending = append(BASE, MAIN, 'axiom cynder_not_good.holds : cynder_not_good');
    expect(draft(run(pending, pending), RESULT)).toMatchObject({ asInBase: true, provides: { decls: [TARGET_HOLDS] } });
    expect(draft(run(pending, edit(pending, MAIN, 'axiom cynder_not_good.holds : cynder_not_good', 'theorem cynder_not_good.holds : cynder_not_good := sorry')), RESULT).asInBase).toBeUndefined();
    const lemma = run(BASE, append(BASE, MAIN, 'theorem helper : True := trivial'), { ledger: [created('Spyro.helper', 'proof')] });
    expect(draft(lemma, RESULT).asInBase).toBeUndefined();
  });
});

describe('premise items (§4.2, §4.3, AF10)', () => {
  it('a draft of an inference whose step ended is an item by its key, with §4.3’s draft key; a draft of one that did not end makes none', () => {
    const premise = draftOf();
    const r = run(BASE, BASE, { premises: [premise] });
    const d = draft(r, 'premise:cynder-not-good:cynder_is_evil');
    expect(d).toMatchObject({ kind: 'add-premise', partOfResult: TARGET, provides: { decls: [], arrows: [], cards: [] } });
    expect(d.contentKey).toBe(premiseDraftKey(premise));
    expect(d.content.premise).toBe(premise);
    expect(d.mentions).toEqual(['Spyro.HasDarkPast', 'Spyro.cynder']);
    expect(d.origin).toEqual({ step: 's1', target: TARGET, phase: 'proof' });
    expect(run(BASE, BASE, { premises: [premise], ended: [] }).drafts).toEqual([]);
    // The draft key: sentence, statement with whitespace collapsed, target.
    expect(premiseDraftKey({ ...premise, leanStatement: 'HasDarkPast   cynder\n' })).toBe(premiseDraftKey(premise));
    expect(premiseDraftKey({ ...premise, naturalName: 'Cynder is wicked' })).not.toBe(premiseDraftKey(premise));
  });

  it('a written premise keeps its draft’s key through the ledger, whatever Lean name adoption chose; its arrow and mark removal are its own', () => {
    const base = edit(BASE, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'follows_from: nothing');
    const premise = draftOf({ leanName: 'cynder' });
    const key = 'premise:cynder-not-good:cynder';
    const plan = planGhostAdoption(modelOf(base), {
      subject: 'Spyro',
      target: TARGET,
      naturalName: premise.naturalName,
      leanStatement: premise.leanStatement,
      leanName: premise.leanName,
      session: 'run1',
      today: '2026-11-19',
    });
    expect(plan.leanName).toBe('Spyro.cynder_is_evil');
    const written = { ...base, [MAIN]: plan.changes[0]?.after as string };
    const ledger: LedgerEntry[] = [
      { kind: 'premise', card: plan.nodeId, target: TARGET, holdAs: 'axiom', item: key, commit: 'c1' },
      { kind: 'mark-removed', card: TARGET, item: key, commit: 'c1' },
    ];
    const r = run(base, written, { ledger, premises: [premise] });
    expect(r.problems).toEqual([]);
    expect(r.drafts.map((d) => d.key)).toEqual([key, RESULT]);
    const d = draft(r, key);
    expect(d.provides).toEqual({
      decls: ['Spyro.cynder_is_evil', 'Spyro.cynder_is_evil.holds'],
      arrows: [{ source: plan.nodeId, target: TARGET }],
      cards: [plan.nodeId],
    });
    expect(d.partOfResult).toBe(TARGET);
    expect(d.contentKey).not.toBe(premiseDraftKey(premise));
    expect(d.content.premise).toBe(premise);
    expect(d.content.fields?.natural_name).toBe('Cynder is evil');
    // Without the mark-removed entry, the mark's removal belongs to no item.
    expect(unowned(run(base, written, { ledger: ledger.slice(0, 1), premises: [premise] }))).toEqual([
      'The follows_from line of “Cynder would not be a good addition to the new Spyro game” changed, but no review item covers it.',
    ]);
  });

  it('AF9: a later arrow into the same target leaves every arrow’s and premise’s key as it was', () => {
    const base = edit(FORMALISED, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'premises: cynder-dark-past');
    const withArrow = edit(base, MAIN, 'premises: cynder-dark-past\n', 'premises: cynder-dark-past, new-spyro-pg\n');
    const premise = draftOf();
    const key = 'premise:cynder-not-good:cynder_is_evil';
    const plan = planGhostAdoption(modelOf(withArrow), {
      subject: 'Spyro',
      target: TARGET,
      naturalName: premise.naturalName,
      leanStatement: premise.leanStatement,
      leanName: premise.leanName,
      session: 'run1',
      today: '2026-11-19',
    });
    const one = { ...withArrow, [MAIN]: plan.changes[0]?.after as string };
    const two = edit(one, MAIN, `premises: cynder-dark-past, new-spyro-pg, ${plan.nodeId}`, `premises: cynder-dark-past, new-spyro-pg, ${plan.nodeId}, pg-no-dark-past`);
    const ledger: LedgerEntry[] = [
      { kind: 'arrow', source: 'new-spyro-pg', target: TARGET, step: 's1', why: 'needed' },
      { kind: 'premise', card: plan.nodeId, target: TARGET, holdAs: 'axiom', item: key, commit: 'c1' },
    ];
    const first = run(base, one, { ledger, premises: [premise] });
    const second = run(base, two, { ledger: [...ledger, { kind: 'arrow', source: 'pg-no-dark-past', target: TARGET, step: 's2', why: 'needed too' }], premises: [premise] });
    expect(first.problems).toEqual([]);
    expect(second.problems).toEqual([]);
    expect(draft(second, 'arrow:new-spyro-pg>cynder-not-good').contentKey).toBe(draft(first, 'arrow:new-spyro-pg>cynder-not-good').contentKey);
    expect(draft(second, key).contentKey).toBe(draft(first, key).contentKey);
    expect(draft(second, 'arrow:pg-no-dark-past>cynder-not-good').contentKey).not.toBe(draft(first, 'arrow:new-spyro-pg>cynder-not-good').contentKey);
  });
});

describe('keys and content keys (§4.3)', () => {
  const state = (evil: string, proof: string) =>
    proved(append(append(FORMALISED, VOCAB, `/-- is evil -/\n${evil}`), MAIN, proof));
  const ledger = [...FORMALISED_LEDGER, created('Spyro.Evil', 'statements'), created('Spyro.helper', 'proof')];

  it('keys stay stable across two working copies, and the same state gives the same drafts', () => {
    const one = run(BASE, state('def Evil (c : Character) : Prop := HasDarkPast c', 'theorem helper : True := trivial'), { ledger });
    const again = run(BASE, state('def Evil (c : Character) : Prop := HasDarkPast c', 'theorem helper : True := trivial'), { ledger });
    expect(again).toEqual(one);
    const other = run(BASE, state('def Evil (c : Character) : Prop := HasDarkPast c ∧ True', 'theorem helper : True := ⟨⟩'), { ledger });
    expect(other.drafts.map((d) => d.key)).toEqual(one.drafts.map((d) => d.key));
    expect(one.drafts.map((d) => d.key)).toEqual(['card:pg-no-dark-past', 'decl:Spyro.Evil', RESULT]);
    expect(draft(other, 'card:pg-no-dark-past').contentKey).toBe(draft(one, 'card:pg-no-dark-past').contentKey);
    expect(draft(other, 'decl:Spyro.Evil').contentKey).not.toBe(draft(one, 'decl:Spyro.Evil').contentKey);
    expect(draft(other, RESULT).contentKey).not.toBe(draft(one, RESULT).contentKey);
  });

  it('content keys ignore whitespace and positions, and change with valueConsts and typeConsts', () => {
    const at = (texts: Texts) => run(BASE, texts, { ledger: [created('Spyro.Evil', 'statements')] });
    const key = (texts: Texts, options: FakeFactsOptions = {}) =>
      draft(run(BASE, texts, { ledger: [created('Spyro.Evil', 'statements')], current: options }), 'decl:Spyro.Evil').contentKey;
    const end = append(BASE, VOCAB, '/-- is evil -/\ndef Evil (c : Character) : Prop := HasDarkPast c');
    const top = edit(BASE, VOCAB, 'namespace Spyro\n', 'namespace Spyro\n\n/-- is evil -/\ndef  Evil (c : Character) : Prop :=\n    HasDarkPast   c\n');
    expect(at(top).problems).toEqual([]);
    expect(key(top)).toBe(key(end));
    expect(key(end, { overrides: { 'Spyro.Evil': { valueConsts: ['Spyro.HasDarkPast'] } } })).not.toBe(key(end));
    expect(key(end, { overrides: { 'Spyro.Evil': { typeConsts: [] } } })).not.toBe(key(end));
  });
});
