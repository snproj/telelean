/**
 * AT1.4 (docs/m2-plan.md section 3.3, the reviewer's corrected table): evaluateRules, a positive and a negative case
 * for every code, on the Spyro walkthrough's states (section 10.2) and the cheating cases of section 10.3; flagged
 * definitions; footprints; the declaration diff; finding order.
 */
import { describe, expect, it } from 'vitest';
import { evaluateRules, frozenSnapshot, planGhostAdoption, type RuleReport } from '../../src/gate/index.js';
import {
  BASE,
  codes,
  edit,
  findingsOf,
  HONEST_PROOF,
  literal,
  MAIN,
  model,
  normative,
  pinned,
  proved,
  rules,
  SEL,
  SEL_NO_PG,
  TARGET_LINE,
  VOCAB,
  type Texts,
} from './helpers/spyroRun.js';

const B = model(BASE);
const N = model(normative());
const F = frozenSnapshot(N, SEL, 1);
const P = model(pinned(proved()));
const NP = model(pinned(normative()));

const without = (report: RuleReport, code: string) => expect(codes(report), JSON.stringify(report.findings.map((f) => f.message))).not.toContain(code);
const has = (report: RuleReport, code: string) => expect(codes(report), JSON.stringify(report.findings.map((f) => f.message))).toContain(code);
const addBeforeEnd = (texts: Texts, path: string, code: string) => edit(texts, path, 'end Spyro', `${code}\n\nend Spyro`);

describe('AT1.4 the walkthrough passes every rule', () => {
  it('normative: check and freeze clean; the honest proof passes gate-proved; literal passes gate-other', () => {
    expect(rules('check', 'formalise', B, N).findings).toEqual([]);
    expect(rules('freeze', 'formalise', B, N).findings).toEqual([]);
    expect(rules('check', 'prove', B, P, { freeze: F }).findings).toEqual([]);
    expect(rules('gate-proved', 'prove', B, P, { freeze: F }).findings).toEqual([]);
    expect(rules('gate-other', 'prove', B, model(pinned(literal()))).findings).toEqual([]);
  });
});

describe('AT1.4 G1 build', () => {
  it('a Lean error is a finding with its whole message and position; a module the library does not build too', () => {
    const broken = model(proved(), {
      facts: { messages: [{ severity: 'error', file: MAIN, range: { start: { line: 56, character: 2 }, end: { line: 56, character: 2 } }, text: "unknown identifier 'x'\nwith more detail" }] },
    });
    const [finding] = findingsOf(rules('check', 'prove', B, broken, { freeze: F }), 'build');
    expect(finding).toMatchObject({ step: 'G1', file: MAIN, message: `${MAIN}:57:2: error: unknown identifier 'x'\nwith more detail` });
    const unbuilt = model({ ...normative(), 'Model/Spyro/Lemmas.lean': 'import Model.Spyro.Vocabulary\nnamespace Spyro\ntheorem l : True := trivial\nend Spyro\n' }, { facts: { moduleStates: { 'Model/Spyro/Lemmas.lean': 'not-built' } } });
    expect(findingsOf(rules('check', 'formalise', B, unbuilt), 'build').map((f) => [f.file, f.token])).toEqual([['Model/Spyro/Lemmas.lean', 'not-built']]);
    without(rules('check', 'formalise', B, N), 'build');
  });

  it('closing round 2 (plan 3.3): a failed module gets a finding of its own only when the build has no error message at all', () => {
    const silent = model(proved(), { facts: { status: 'build-errors', moduleStates: { [MAIN]: 'failed' } } });
    expect(findingsOf(rules('check', 'prove', B, silent, { freeze: F }), 'build').map((f) => f.message)).toEqual(['Lean could not build Model.Spyro.Main.']);
    const noisy = model(proved(), { facts: { status: 'build-errors', moduleStates: { [MAIN]: 'failed' }, messages: [{ severity: 'error', file: VOCAB, text: 'boom' }] } });
    expect(findingsOf(rules('check', 'prove', B, noisy, { freeze: F }), 'build').map((f) => f.message)).toEqual([`${VOCAB}: error: boom`]);
  });
});

describe('AT1.4 readiness (freeze, gate-proved only)', () => {
  it('not-formalised: a selected assumption without a statement; not in gate-other', () => {
    const report = rules('freeze', 'formalise', B, B);
    expect(findingsOf(report, 'not-formalised').map((f) => f.nodeId)).toEqual(['pg-no-dark-past']);
    has(rules('gate-proved', 'prove', B, B, { freeze: F }), 'not-formalised');
    without(rules('gate-other', 'formalise', B, B), 'not-formalised');
    without(rules('check', 'formalise', B, B), 'not-formalised');
    without(rules('freeze', 'formalise', B, N), 'not-formalised');
  });

  it('missing-holds: a selected assumption without `axiom n.holds : n`, or one stating something else; not in gate-other', () => {
    const noHolds = model(edit(normative(), MAIN, 'axiom pg_no_dark_past.holds : pg_no_dark_past\n', ''));
    expect(findingsOf(rules('freeze', 'formalise', B, noHolds), 'missing-holds').map((f) => [f.nodeId, f.token])).toEqual([['pg-no-dark-past', 'missing']]);
    const wrong = model(edit(normative(), MAIN, 'axiom pg_no_dark_past.holds : pg_no_dark_past\n', 'axiom pg_no_dark_past.holds : cynder_dark_past\n'));
    expect(findingsOf(rules('freeze', 'formalise', B, wrong), 'missing-holds').map((f) => f.token)).toEqual(['mismatch']);
    without(rules('gate-other', 'formalise', B, noHolds), 'missing-holds');
    without(rules('freeze', 'formalise', B, N), 'missing-holds');
  });
});

describe('AT1.4 stage rules', () => {
  it('proof-before-freeze: a proof added in the round before the freeze (check in stage formalise, freeze)', () => {
    const early = model(proved());
    expect(findingsOf(rules('check', 'formalise', B, early), 'proof-before-freeze').map((f) => f.names)).toEqual([['Spyro.cynder_not_good.holds']]);
    has(rules('freeze', 'formalise', B, early), 'proof-before-freeze');
    without(rules('check', 'prove', B, early, { freeze: F }), 'proof-before-freeze');
    // Round 2 (Feedback): the previous round's proof is not "a proof before the freeze".
    without(rules('check', 'formalise', B, early, { roundStart: early }), 'proof-before-freeze');
    const example = model(addBeforeEnd(normative(), MAIN, 'example : cynder_not_good := pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds'));
    expect(findingsOf(rules('check', 'formalise', B, example), 'proof-before-freeze').map((f) => f.token)).toEqual(['example']);
    without(rules('check', 'formalise', B, N), 'proof-before-freeze');
  });

  it('examples (fixer round 3): every example added since B is refused in every purpose; the user\'s own stay theirs', () => {
    // The final verifier's probe X-14: an example resting on an unselected assumption, in a round that never froze.
    const code = 'example : PLift new_spyro_pg := ⟨new_spyro_pg.holds⟩';
    const early = model(addBeforeEnd(normative(), MAIN, code));
    for (const purpose of ['check', 'freeze', 'gate-other', 'gate-proved'] as const) {
      const [finding, ...more] = findingsOf(rules(purpose, 'formalise', B, early, { selection: SEL_NO_PG }), 'proof-before-freeze');
      expect(more, purpose).toEqual([]);
      expect(finding, purpose).toMatchObject({ step: 'G3', token: 'example', file: MAIN, message: expect.stringContaining('an `example` is a proof, written before freeze_statements: remove it.') });
    }
    expect(rules('gate-other', 'formalise', B, early, { selection: SEL_NO_PG }).findings.map((f) => [f.code, f.token])).toEqual([['proof-before-freeze', 'example']]);
    // After the round's freeze: a proof nothing can check (footprint, token example), in check (prove) and at every finish.
    const late = model(pinned(addBeforeEnd(proved(), MAIN, code)));
    expect(rules('gate-proved', 'prove', B, late, { freeze: F }).findings.map((f) => [f.code, f.token])).toEqual([['footprint', 'example']]);
    for (const purpose of ['check', 'gate-proved', 'gate-other'] as const) {
      const report = rules(purpose, 'prove', B, late, { freeze: F });
      const examples = report.findings.filter((f) => f.token === 'example');
      expect(examples.map((f) => [f.code, f.file]), purpose).toEqual([['footprint', MAIN]]);
      expect(examples[0]?.message, purpose).toContain('an `example` may not stay in the files: it has no name');
    }
    // Round 2 (Feedback): an example from an earlier round is still refused (compared with B, not the round's start).
    expect(findingsOf(rules('check', 'formalise', B, early, { roundStart: early }), 'proof-before-freeze').map((f) => f.token)).toEqual(['example']);
    // The user's own example stays theirs while unchanged; a second copy Claude adds is judged.
    const userB = model(addBeforeEnd(BASE, MAIN, code));
    const userS = model(addBeforeEnd(normative(), MAIN, code));
    expect(rules('gate-other', 'formalise', userB, userS).findings.filter((f) => f.token === 'example')).toEqual([]);
    const twice = model(addBeforeEnd(addBeforeEnd(normative(), MAIN, code), MAIN, code));
    expect(rules('gate-other', 'formalise', userB, twice).findings.filter((f) => f.token === 'example')).toHaveLength(1);
  });

  it('the presupposition instance of a new sort is vocabulary, not a proof (also with real facts typing it Prop)', () => {
    const sort = edit(normative(), VOCAB, '/-- Cynder -/', '/-- consoles -/\naxiom Console : Type\n/-- there is a console -/\naxiom Console.exists : Nonempty Console\ninstance : Nonempty Console := Console.exists\n/-- Cynder -/');
    const real = model(sort, {
      mutate: (facts) => {
        for (const d of facts.decls) if (d.kind === 'instance' || d.kind === 'theorem') d.typeSort = 'Prop';
      },
    });
    without(rules('check', 'formalise', B, real), 'proof-before-freeze');
    without(rules('check', 'formalise', B, real), 'new-axiom');
  });

  it('not-frozen: finish(proved) without a freeze in the round', () => {
    has(rules('gate-proved', 'prove', B, P), 'not-frozen');
    without(rules('gate-proved', 'prove', B, P, { freeze: F }), 'not-frozen');
    without(rules('gate-other', 'prove', B, NP), 'not-frozen');
  });
});

describe('AT1.4 G3', () => {
  it('not-proved: no proof of the target, or one of a weaker statement (gate-proved)', () => {
    expect(findingsOf(rules('gate-proved', 'prove', B, NP, { freeze: F }), 'not-proved').map((f) => f.token)).toEqual(['missing']);
    const weakType = model(pinned(edit(normative(), MAIN, TARGET_LINE, `${TARGET_LINE}theorem cynder_not_good.holds : cynder_not_good ∨ True := Or.inr trivial\n`)));
    expect(findingsOf(rules('gate-proved', 'prove', B, weakType, { freeze: F }), 'not-proved').map((f) => f.token)).toEqual(['mismatch']);
    without(rules('gate-proved', 'prove', B, P, { freeze: F }), 'not-proved');
    without(rules('gate-other', 'prove', B, NP, { freeze: F }), 'not-proved');
  });

  it('status-mismatch: a gate-other finish leaving a new proof of the target; an unchanged proof the user had is not one', () => {
    expect(findingsOf(rules('gate-other', 'prove', B, P, { freeze: F }), 'status-mismatch').map((f) => f.names)).toEqual([['Spyro.cynder_not_good.holds']]);
    without(rules('gate-other', 'prove', B, NP, { freeze: F }), 'status-mismatch');
    // A re-proved derivation: B already holds the proof, unchanged.
    without(rules('gate-other', 'prove', P, P), 'status-mismatch');
    without(rules('gate-proved', 'prove', B, P, { freeze: F }), 'status-mismatch');
  });

  it('footprint: the target\'s proof resting on an unselected premise (gate-proved, and check in stage prove)', () => {
    const freeze = frozenSnapshot(N, SEL_NO_PG, 1);
    const report = rules('gate-proved', 'prove', B, P, { freeze, selection: SEL_NO_PG });
    const [finding] = findingsOf(report, 'footprint');
    expect(finding).toMatchObject({ names: ['Spyro.new_spyro_pg.holds'], nodeId: 'cynder-not-good', file: MAIN });
    expect(finding?.message).toContain('Spyro.new_spyro_pg.holds ("The new Spyro game is PG", not selected)');
    has(rules('check', 'prove', B, P, { freeze, selection: SEL_NO_PG }), 'footprint');
    without(rules('check', 'formalise', B, model(proved()), { selection: SEL_NO_PG }), 'footprint');
    without(rules('gate-proved', 'prove', B, P, { freeze: F }), 'footprint');
  });

  it('footprint in gate-other: a lemma resting on an unselected .holds, with and without a freeze', () => {
    const lemma = model(addBeforeEnd(pinned(normative()), MAIN, 'theorem helper : new_spyro_pg := new_spyro_pg.holds'));
    const noFreeze = rules('gate-other', 'prove', B, lemma, { selection: SEL_NO_PG });
    expect(findingsOf(noFreeze, 'footprint').map((f) => [f.names, f.message.includes('Spyro.helper rests on')])).toEqual([[['Spyro.new_spyro_pg.holds'], true]]);
    const withFreeze = rules('gate-other', 'prove', B, lemma, { selection: SEL_NO_PG, freeze: frozenSnapshot(N, SEL_NO_PG, 1) });
    expect(findingsOf(withFreeze, 'footprint').map((f) => f.names)).toEqual([['Spyro.new_spyro_pg.holds']]);
    const fine = model(addBeforeEnd(pinned(normative()), MAIN, 'theorem helper : cynder_dark_past := cynder_dark_past.holds'));
    without(rules('gate-other', 'prove', B, fine, { selection: SEL_NO_PG }), 'footprint');
    expect(rules('gate-other', 'prove', B, fine, { selection: SEL_NO_PG }).footprints['Spyro.helper']).toContain('Spyro.cynder_dark_past.holds');
  });

  it('sorry-axiom: sorry reached in a changed file; the user\'s own unchanged sorry is theirs', () => {
    const viaAx = model(pinned(proved()), { facts: { overrides: { 'Spyro.cynder_not_good.holds': { axioms: ['Classical.choice', 'sorryAx'], usesSorry: true } } } });
    const report = rules('gate-proved', 'prove', B, viaAx, { freeze: F });
    expect(findingsOf(report, 'sorry-axiom').map((f) => f.names)).toEqual([['Spyro.cynder_not_good.holds']]);
    expect(findingsOf(report, 'not-proved').map((f) => f.token)).toEqual(['sorry']);
    const draft = addBeforeEnd(BASE, MAIN, 'theorem draft : True := sorry');
    const withDraft = model(pinned(proved(normative(draft))));
    without(rules('gate-proved', 'prove', model(draft), withDraft, { freeze: F }), 'sorry-axiom');
    without(rules('gate-proved', 'prove', model(draft, { facts: false }), withDraft, { freeze: F }), 'sorry-axiom');
    const claudes = model(addBeforeEnd(pinned(proved()), MAIN, 'theorem helper2 : True := sorry'));
    expect(findingsOf(rules('gate-proved', 'prove', B, claudes, { freeze: F }), 'sorry-axiom').map((f) => f.names)).toEqual([['Spyro.helper2']]);
  });

  it('new-axiom before the freeze: a belief that is not a selected assumption\'s .holds; vocabulary and selected .holds are fine', () => {
    const shortcut = model(addBeforeEnd(normative(), MAIN, 'axiom shortcut : cynder_not_good'));
    expect(findingsOf(rules('check', 'formalise', B, shortcut), 'new-axiom').map((f) => [f.names, f.token])).toEqual([[['Spyro.shortcut'], 'belief']]);
    const targetAxiom = model(edit(normative(), MAIN, TARGET_LINE, `${TARGET_LINE}axiom cynder_not_good.holds : cynder_not_good\n`));
    expect(findingsOf(rules('check', 'formalise', B, targetAxiom), 'new-axiom').map((f) => f.names)).toEqual([['Spyro.cynder_not_good.holds']]);
    // pg-no-dark-past not selected: its .holds is a belief nobody selected.
    const unselected = rules('check', 'formalise', B, N, { selection: { ...SEL, premises: ['cynder-dark-past', 'new-spyro-pg'] } });
    expect(findingsOf(unselected, 'new-axiom').map((f) => [f.names, f.nodeId])).toEqual([[['Spyro.pg_no_dark_past.holds'], 'pg-no-dark-past']]);
    without(rules('check', 'formalise', B, N), 'new-axiom');
    without(rules('check', 'formalise', B, model(literal())), 'new-axiom');
  });

  it('turn 13: a blank line between a selected card\'s block and its statement is named, not called a belief', () => {
    // The formalisation is right but detached from its block by one blank line (TL013): the card has no statement, so
    // its .holds is a Prop-valued axiom nobody holds. Same verdicts as before; the findings now say what to fix.
    const detached = model(edit(normative(), MAIN, 'stance: rule\nasserted: 2026-11-01\n-/\n/-- PG games', 'stance: rule\nasserted: 2026-11-01\n-/\n\n/-- PG games'));
    const check = rules('check', 'formalise', B, detached);
    expect(findingsOf(check, 'new-axiom').map((f) => [f.names, f.token, f.nodeId])).toEqual([[['Spyro.pg_no_dark_past.holds'], 'detached', 'pg-no-dark-past']]);
    expect(findingsOf(check, 'new-axiom')[0]?.message).toContain('a blank line separates Spyro.pg_no_dark_past from the block of the card pg-no-dark-past');
    expect(findingsOf(check, 'new-axiom')[0]?.message).not.toContain('propose_assumption');
    const freeze = rules('freeze', 'formalise', B, detached);
    expect(findingsOf(freeze, 'not-formalised').map((f) => [f.nodeId, f.names, f.token])).toEqual([['pg-no-dark-past', ['Spyro.pg_no_dark_past'], 'detached']]);
    expect(findingsOf(freeze, 'not-formalised')[0]?.message).toContain('follows its block after a blank line, so it is not attached; remove the blank line');
    // A belief elsewhere is still a belief; the attached formalisation passes.
    expect(findingsOf(rules('check', 'formalise', B, model(addBeforeEnd(normative(), MAIN, 'axiom shortcut : cynder_not_good'))), 'new-axiom').map((f) => f.token)).toEqual(['belief']);
    without(rules('freeze', 'formalise', B, N), 'not-formalised');
  });

  it('new-axiom after the freeze: any axiom not in the freeze', () => {
    const shortcut = model(addBeforeEnd(pinned(normative()), MAIN, 'axiom shortcut : cynder_not_good\ntheorem cynder_not_good.holds : cynder_not_good := shortcut'));
    const report = rules('gate-proved', 'prove', B, shortcut, { freeze: F });
    expect(findingsOf(report, 'new-axiom').map((f) => [f.names, f.token])).toEqual([[['Spyro.shortcut'], 'belief']]);
    expect(codes(report)[0]).toBe('new-axiom');
    has(report, 'footprint');
    const sort = model(edit(pinned(proved()), VOCAB, '/-- Cynder -/', '/-- consoles -/\naxiom Console : Type\n/-- Cynder -/'));
    expect(findingsOf(rules('gate-proved', 'prove', B, sort, { freeze: F }), 'new-axiom').map((f) => [f.names, f.token])).toEqual([[['Spyro.Console'], 'after-freeze']]);
    without(rules('gate-proved', 'prove', B, P, { freeze: F }), 'new-axiom');
  });

  it('vocabulary-shape: new vocabulary of a shape the simple D-3 rule refuses', () => {
    const constant = model(edit(normative(), VOCAB, '/-- Cynder -/', '/-- Spyro -/\naxiom spyro : Character\n/-- Cynder -/'));
    const [finding] = findingsOf(rules('check', 'formalise', B, constant), 'vocabulary-shape');
    expect(finding).toMatchObject({ names: ['Spyro.spyro'], file: VOCAB });
    expect(finding?.message).toContain('noncomputable opaque');
    const higher = model(edit(normative(), VOCAB, '/-- Cynder -/', '/-- a property of properties -/\naxiom Meta : (Character → Prop) → Prop\n/-- Cynder -/'));
    has(rules('check', 'formalise', B, higher), 'vocabulary-shape');
    const opaque = model(edit(normative(), VOCAB, '/-- Cynder -/', '/-- Spyro -/\nnoncomputable opaque spyro : Character\n/-- Cynder -/'));
    without(rules('check', 'formalise', B, opaque), 'vocabulary-shape');
    without(rules('check', 'formalise', B, model(literal())), 'vocabulary-shape');
  });

  it('existing-changed: vocabulary turned into a definition (fact 6), a removed declaration, a changed docstring', () => {
    const redefined = model(edit(proved(), VOCAB, 'axiom GoodAddition : Character → Game → Prop', 'def GoodAddition (c : Character) (_g : Game) : Prop := ¬ HasDarkPast c'));
    const report = rules('gate-proved', 'prove', B, redefined, { freeze: F });
    expect(findingsOf(report, 'existing-changed').map((f) => [f.names, f.token])).toEqual([[['Spyro.GoodAddition'], 'changed']]);
    expect(codes(report)[0]).toBe('existing-changed');
    has(report, 'statement-changed');
    const removed = model(edit(normative(), VOCAB, '/-- is rated PG -/\naxiom IsPG : Game → Prop\n', ''));
    const afterRemoval = findingsOf(rules('check', 'formalise', B, removed), 'existing-changed').map((f) => [f.names, f.token, f.file]);
    expect(afterRemoval).toContainEqual([['Spyro.IsPG'], 'removed', VOCAB]);
    // A declaration using it now elaborates differently: reported too (B's facts).
    expect(afterRemoval).toContainEqual([['Spyro.new_spyro_pg'], 'meaning', MAIN]);
    const docstring = model(edit(normative(), VOCAB, '/-- has a dark past -/', '/-- has a very dark past -/'));
    expect(findingsOf(rules('check', 'formalise', B, docstring), 'existing-changed').map((f) => f.names)).toEqual([['Spyro.HasDarkPast']]);
    without(rules('gate-proved', 'prove', B, P, { freeze: F }), 'existing-changed');
  });

  it('existing-changed by meaning: unchanged text, changed value (an `open … in` before it), only with B\'s facts', () => {
    // Claude puts `open Other in` right before the user's declaration: its text is unchanged (the `open` is a command
    // of its own), but `HasDarkPast` would now elaborate to `Other.HasDarkPast` (what Lean's facts would report).
    const texts = edit(normative(), MAIN, '/-- Cynder is a character who has a dark past -/\nabbrev cynder_dark_past', 'open Other in\n/-- Cynder is a character who has a dark past -/\nabbrev cynder_dark_past');
    const shifted = model(texts, {
      mutate: (facts) => {
        const decl = facts.decls.find((d) => d.name === 'Spyro.cynder_dark_past');
        if (decl) decl.value = 'Other.HasDarkPast Spyro.cynder';
      },
    });
    const report = rules('check', 'formalise', B, shifted);
    expect(report.declarations.changed).toEqual([]);
    expect(findingsOf(report, 'existing-changed').map((f) => [f.names, f.token])).toEqual([[['Spyro.cynder_dark_past'], 'meaning']]);
    expect(findingsOf(report, 'existing-changed')[0]?.message).toContain('its value was `Spyro.HasDarkPast Spyro.cynder`, now `Other.HasDarkPast Spyro.cynder`');
    without(rules('check', 'formalise', model(BASE, { facts: false }), shifted), 'existing-changed');
  });

  it('existing-changed on the target\'s statement (weakened abbrev) is marked as the target', () => {
    const weak = model(pinned(edit(proved(), MAIN, TARGET_LINE, 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro ∨ True\n')));
    const report = rules('gate-proved', 'prove', B, weak, { freeze: F });
    expect(findingsOf(report, 'existing-changed').map((f) => [f.names, f.token, f.nodeId])).toEqual([[['Spyro.cynder_not_good'], 'target', 'cynder-not-good']]);
    expect(findingsOf(report, 'statement-changed').map((f) => [f.names, f.token])).toEqual([[['Spyro.cynder_not_good'], 'target']]);
  });

  it('a pending derivation\'s `.holds` axiom may become the proof, also after the freeze', () => {
    const pending = edit(edit(BASE, MAIN, 'type: GOAL', 'type: DERIVATION'), MAIN, TARGET_LINE, `${TARGET_LINE}axiom cynder_not_good.holds : cynder_not_good\n`);
    const base = model(pending);
    expect(base.nodes.get('cynder-not-good')?.node.status.proof.kind).toBe('pending-promotion');
    const freeze = frozenSnapshot(model(normative(pending)), SEL, 1);
    expect(freeze.declarations['Spyro.cynder_not_good.holds']).toMatchObject({ kind: 'axiom' });
    const promoted = model(pinned(edit(normative(pending), MAIN, 'axiom cynder_not_good.holds : cynder_not_good\n', HONEST_PROOF)));
    const report = rules('gate-proved', 'prove', base, promoted, { freeze });
    expect(report.findings).toEqual([]);
    // Its claimed axiom is never permitted, even though it existed at the freeze.
    expect(freeze.permitted.all).not.toContain('Spyro.cynder_not_good.holds');
  });

  it('statement-changed: a frozen statement new in the run changes after the freeze (check in stage prove, gate)', () => {
    const changed = model(pinned(edit(proved(), MAIN, '¬ GoodAddition c g\n', '¬ GoodAddition c g ∨ True\n')));
    const report = rules('gate-proved', 'prove', B, changed, { freeze: F });
    expect(findingsOf(report, 'statement-changed').map((f) => [f.names, f.nodeId])).toEqual([[['Spyro.pg_no_dark_past'], 'pg-no-dark-past']]);
    without(report, 'existing-changed');
    has(rules('check', 'prove', B, changed, { freeze: F }), 'statement-changed');
    has(rules('gate-other', 'prove', B, changed, { freeze: F }), 'statement-changed');
    without(rules('check', 'formalise', B, changed), 'statement-changed');
    without(rules('gate-proved', 'prove', B, P, { freeze: F }), 'statement-changed');
  });
});

describe('AT1.4 G5 markup', () => {
  it('the target\'s `lean:` pin changed to a new weaker abbrev (the rebind-target cheat): refused at the freeze', () => {
    const repinned = model(
      addBeforeEnd(edit(normative(), MAIN, 'lean: Spyro.cynder_not_good\n', 'lean: Spyro.cynder_not_good_weak\n'), MAIN, 'abbrev cynder_not_good_weak : Prop := True'),
    );
    const [finding] = findingsOf(rules('freeze', 'formalise', B, repinned), 'markup');
    expect(finding).toMatchObject({ step: 'G5', nodeId: 'cynder-not-good', token: 'lean', names: ['Spyro.cynder_not_good', 'Spyro.cynder_not_good_weak'] });
    expect(findingsOf(rules('freeze', 'formalise', B, repinned), 'markup')).toHaveLength(1);
  });

  it('a target formalised in B by adjacency, re-bound to a newly inserted abbrev', () => {
    const adjacent = edit(BASE, MAIN, 'asserted: 2026-11-01\nlean: Spyro.cynder_not_good\n-/', 'asserted: 2026-11-01\n-/');
    const base = model(adjacent);
    expect(base.nodes.get('cynder-not-good')?.node.lean).toMatchObject({ binding: 'adjacent', statement: 'Spyro.cynder_not_good' });
    const rebound = model(
      edit(normative(adjacent), MAIN, 'asserted: 2026-11-01\n-/\n/-- Cynder would not', 'asserted: 2026-11-01\n-/\nabbrev cynder_not_good_weak : Prop := True\n/-- Cynder would not'),
    );
    expect(findingsOf(rules('freeze', 'formalise', base, rebound), 'markup').map((f) => [f.token, f.names])).toEqual([['binding', ['Spyro.cynder_not_good', 'Spyro.cynder_not_good_weak']]]);
    without(rules('freeze', 'formalise', base, model(normative(adjacent))), 'markup');
  });

  it('an unselected card becomes formalised', () => {
    const selection = { ...SEL, premises: ['cynder-dark-past', 'new-spyro-pg'] };
    expect(findingsOf(rules('check', 'formalise', B, N, { selection }), 'markup').map((f) => [f.nodeId, f.token])).toEqual([['pg-no-dark-past', 'formalised']]);
    without(rules('check', 'formalise', B, N), 'markup');
  });

  it('the user\'s words, other fields, removed and new blocks', () => {
    const one = (texts: Texts) => findingsOf(rules('check', 'formalise', B, model(texts)), 'markup').map((f) => [f.nodeId, f.token]);
    expect(one(edit(normative(), MAIN, 'natural_name: Cynder is a character who has a dark past', 'natural_name: Cynder is a character who had a dark past'))).toEqual([['cynder-dark-past', 'natural_name']]);
    expect(one(edit(normative(), MAIN, 'rationale: familiar with gaming lore', 'rationale: everyone knows it'))).toEqual([['cynder-dark-past', 'rationale']]);
    expect(one(edit(normative(), MAIN, 'id: pg-no-dark-past\ntype: ASSUMPTION', 'id: pg-no-dark-past\ntype: GOAL'))).toEqual([['pg-no-dark-past', 'type']]);
    expect(one(edit(normative(), MAIN, 'source: reported\n', ''))).toEqual([['new-spyro-pg', 'source']]);
    expect(one(edit(normative(), MAIN, 'lean: Spyro.cynder_dark_past\n', ''))).toEqual([['cynder-dark-past', 'lean']]);
    const removedBlock = edit(BASE, MAIN, '/-\n@@ telelean v1\nid: pg-no-dark-past\ntype: ASSUMPTION\nnatural_name: PG games cannot have characters with dark pasts\nstance: rule\nasserted: 2026-11-01\n-/\n\n', '');
    expect(one(removedBlock)).toEqual([['pg-no-dark-past', 'removed']]);
    expect(one(addBeforeEnd(normative(), MAIN, '/-\n@@ telelean v1\nid: claude-card\ntype: ASSUMPTION\nnatural_name: Claude thinks so\n-/'))).toEqual([['claude-card', 'block']]);
    const message = findingsOf(rules('check', 'formalise', B, model(edit(normative(), MAIN, 'natural_name: Cynder is a character who has a dark past', 'natural_name: Cynder had a dark past'))), 'markup')[0]?.message;
    expect(message).toMatch(/the block cynder-dark-past \("Cynder is a character who has a dark past"\) changed its `natural_name:` \("Cynder is a character who has a dark past" → "Cynder had a dark past"\)/);
  });

  it('telelean\'s own normalisation (pin, derived id) is not a markup change', () => {
    without(rules('gate-proved', 'prove', B, P, { freeze: F }), 'markup');
    const idless = edit(BASE, MAIN, 'id: pg-no-dark-past\n', '');
    const derived = 'pg-games-cannot-have-characters-with';
    const base = model(idless);
    expect(base.nodes.has(derived)).toBe(true);
    const selection = { ...SEL, premises: ['cynder-dark-past', 'new-spyro-pg', derived] };
    const normalised = model(edit(normative(idless), MAIN, 'natural_name: PG games cannot have characters with dark pasts\nstance: rule\nasserted: 2026-11-01\n-/', `id: ${derived}\nnatural_name: PG games cannot have characters with dark pasts\nstance: rule\nasserted: 2026-11-01\nlean: Spyro.pg_no_dark_past\n-/`));
    expect(evaluateRules({ purpose: 'freeze', stage: 'formalise', selection, base, current: normalised, teleleanBlocks: [] }).findings).toEqual([]);
    const otherId = model(edit(normative(idless), MAIN, 'natural_name: PG games cannot have characters with dark pasts\nstance: rule', 'id: something-else\nnatural_name: PG games cannot have characters with dark pasts\nstance: rule'));
    expect(evaluateRules({ purpose: 'freeze', stage: 'formalise', selection, base, current: otherId, teleleanBlocks: [] }).findings.map((f) => f.code)).toContain('markup');
  });

  it('an adopted ghost\'s block and declarations are held to the adopt commit (A), not to B', () => {
    const literalTexts = pinned(literal());
    const literalModel = model(literalTexts);
    const plan = planGhostAdoption(literalModel, {
      subject: 'Spyro',
      target: 'cynder-not-good',
      naturalName: 'A character who cannot be in a game would not be a good addition to it',
      leanStatement: '∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g',
      leanName: 'not_in_game_not_good',
      rationale: 'it seems obvious to me',
      session: 'r1',
      today: '2026-11-02',
    });
    const adoptedTexts = { ...literalTexts, [MAIN]: plan.changes[0]?.after as string };
    const A = model(adoptedTexts);
    const selection = { ...SEL, adoptedGhosts: [plan.nodeId] };
    const freeze = frozenSnapshot(A, selection, 2);
    const ctx = { selection, adopted: A, teleleanBlocks: [plan.nodeId], freeze };
    const proof = 'theorem cynder_not_good.holds : cynder_not_good :=\n  not_in_game_not_good.holds cynder newSpyro (pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds)\n';
    const round2 = edit(adoptedTexts, MAIN, TARGET_LINE, `${TARGET_LINE}${proof}`);
    expect(rules('gate-proved', 'prove', B, model(round2), ctx).findings).toEqual([]);
    // Without A, the ghost's block is a new block of Claude's.
    expect(codes(rules('gate-proved', 'prove', B, model(round2), { ...ctx, adopted: undefined, teleleanBlocks: [] }))).toContain('markup');
    const editedBlock = edit(round2, MAIN, 'natural_name: A character who cannot be in a game would not be a good addition to it', 'natural_name: A character who cannot be in a game is never a good addition');
    expect(findingsOf(rules('gate-proved', 'prove', B, model(editedBlock), ctx), 'markup').map((f) => [f.nodeId, f.token])).toEqual([[plan.nodeId, 'telelean']]);
    const editedDecl = edit(round2, MAIN, '¬ InGame c g → ¬ GoodAddition c g\n', 'True\n');
    expect(findingsOf(rules('gate-proved', 'prove', B, model(editedDecl), ctx), 'existing-changed').map((f) => [f.names, f.token])).toEqual([[['Spyro.not_in_game_not_good'], 'ghost']]);
  });
});

describe('AT1.4 flagged definitions, footprints, declarations, order', () => {
  it('a new definition on a statement path is a question (definition-belief cheat); a proof-only one is not; a new presupposition is', () => {
    const belief = edit(edit(BASE, VOCAB, '/-- Cynder -/', '/-- is in -/\ndef InGame (c : Character) (g : Game) : Prop := GoodAddition c g\n/-- Cynder -/'), MAIN, 'stance: rule\nasserted: 2026-11-01\n-/\n\n', 'stance: rule\nasserted: 2026-11-01\n-/\n/-- PG games cannot have characters with dark pasts -/\nabbrev pg_no_dark_past : Prop := ∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ InGame c g\naxiom pg_no_dark_past.holds : pg_no_dark_past\n\n');
    const report = rules('freeze', 'formalise', B, model(belief));
    expect(report.findings).toEqual([]);
    expect(report.flaggedDefinitions).toEqual([
      expect.objectContaining({ name: 'Spyro.InGame', kind: 'definition', gloss: 'is in', usedByStatementsOf: ['pg-no-dark-past'], code: '/-- is in -/\ndef InGame (c : Character) (g : Game) : Prop := GoodAddition c g' }),
    ]);
    const proofOnly = model(addBeforeEnd(normative(), MAIN, 'def three : Nat := 3'));
    expect(rules('check', 'formalise', B, proofOnly).flaggedDefinitions).toEqual([]);
    const lemmaOnly = model(addBeforeEnd(normative(), MAIN, 'def helperDef : Prop := True\ntheorem uses_helper : helperDef := trivial'));
    expect(rules('check', 'prove', B, lemmaOnly, { freeze: frozenSnapshot(N, SEL, 1) }).flaggedDefinitions).toEqual([]);
    const signature = model(edit(normative(), VOCAB, '/-- Cynder -/', '/-- pairs -/\ndef Pair : Type := Character × Game\n/-- a pair -/\nnoncomputable opaque pair : Pair\n/-- Cynder -/'));
    expect(rules('check', 'formalise', B, signature).flaggedDefinitions.map((d) => d.name)).toEqual(['Spyro.Pair']);
    const presup = model(edit(normative(), VOCAB, '/-- Cynder -/', '/-- consoles -/\naxiom Console : Type\n/-- there is a console -/\naxiom Console.exists : Nonempty Console\ninstance : Nonempty Console := Console.exists\n/-- Cynder -/'));
    expect(rules('check', 'formalise', B, presup).flaggedDefinitions.map((d) => [d.name, d.kind])).toEqual([['Spyro.Console.exists', 'presupposition']]);
  });

  it('footprints of the target\'s proof and the run\'s theorems; the statements new in the run; the declaration diff', () => {
    const report = rules('gate-proved', 'prove', B, P, { freeze: F });
    expect(report.footprints['Spyro.cynder_not_good.holds']).toEqual(expect.arrayContaining(['Spyro.cynder_dark_past.holds', 'Spyro.new_spyro_pg.holds', 'Spyro.pg_no_dark_past.holds']));
    expect(report.formalisedThisRun).toEqual(['pg-no-dark-past']);
    expect(report.declarations).toEqual({ added: ['Spyro.pg_no_dark_past', 'Spyro.pg_no_dark_past.holds', 'Spyro.cynder_not_good.holds'], changed: [], removed: [] });
    const mixed = model(edit(edit(proved(), VOCAB, '/-- is rated PG -/\naxiom IsPG : Game → Prop\n', ''), VOCAB, '/-- has a dark past -/', '/-- has a very dark past -/'));
    expect(rules('check', 'prove', B, mixed, { freeze: F }).declarations).toEqual({
      added: ['Spyro.pg_no_dark_past', 'Spyro.pg_no_dark_past.holds', 'Spyro.cynder_not_good.holds'],
      changed: ['Spyro.HasDarkPast'],
      removed: ['Spyro.IsPG'],
    });
  });

  it('findings come in the order G1, G3, G5, then readiness', () => {
    const messy = model(edit(edit(BASE, MAIN, 'natural_name: Cynder is a character who has a dark past', 'natural_name: Cynder had a dark past'), MAIN, TARGET_LINE, `${TARGET_LINE}axiom cynder_not_good.holds : cynder_not_good\n`), {
      facts: { messages: [{ severity: 'error', file: MAIN, text: 'boom' }] },
    });
    expect(codes(rules('freeze', 'formalise', B, messy))).toEqual(['build', 'new-axiom', 'markup', 'not-formalised']);
  });

  it('never throws for a malformed selection or model', () => {
    expect(() => rules('gate-other', 'prove', B, P, { selection: { subject: 'Spyro', target: 'nope', premises: ['also-nope'], adoptedGhosts: [] } })).not.toThrow();
    expect(() => rules('gate-proved', 'prove', B, model(BASE, { facts: false }), { freeze: F })).not.toThrow();
  });
});
