/**
 * AT3.12 (docs/m2-plan.md section 5): what leaves the machine. buildSystemPrompt() is section 5.1 verbatim (a fixture
 * copy, and the plan itself while it exists); the context bundle quotes the cards verbatim with the vocabulary and
 * the decisions in force; `neighbourhood` omits unrelated cards; the later turns are section 5.3's texts.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { DecisionRecord, TlGraph } from '@telelean/core';
import { describe, expect, it } from 'vitest';

import { CLAUDE_SESSION_TEXTS } from '@telelean/core';

import { buildContextBundle, buildSystemPrompt, DEFAULT_RUN_SETTINGS, NUDGE_TURN, resumeTurn, shortNames } from '../../src/run/index.js';
import { formalizePlan, stepTurn, submitFeedbackTurn, type StepTurnInput } from '../../src/run/prompts.js';
import { REPO_ROOT } from './helpers/env.js';
import { FakeWorkspace } from './helpers/fakeServices.js';

const FIXTURE = path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'system-prompt-5.1.txt');

const DECISION: DecisionRecord = {
  id: 'r1.q1.0',
  run: 'r1',
  date: '2026-10-30T12:00:00.000Z',
  subject: 'Spyro',
  phenomenon: 'genericity',
  question: 'Do you mean every PG game?',
  options: [
    { label: 'Every one', consequence: 'universal' },
    { label: 'Typical ones', consequence: 'generic' },
  ],
  answer: { kind: 'option', option: 0 },
  answerText: 'Every one',
  scope: 'subject',
  affectedNodes: ['pg-no-dark-past'],
  decidedBy: 'user',
  wordedBy: 'agent',
};

const EXPECTED_BUNDLE = `Run: "Formalize for dependencies" for the subject Spyro (namespace Spyro; the subject's folder is Model/Spyro/, its root module Model/Spyro.lean).

TARGET
- cynder-not-good (PROPOSITION): "Cynder would not be a good addition to the new Spyro game"
  Lean: Spyro.cynder_not_good := ¬GoodAddition cynder newSpyro (Model/Spyro/Main.lean, line 52). Not proved.

SELECTED PREMISES (the person drew arrows from these to the target: prove it from exactly these)
- cynder-dark-past (AXIOM, asserted 2026-11-01): "Cynder is a character who has a dark past" — because: familiar with gaming lore; source: common
  Lean: Spyro.cynder_dark_past := HasDarkPast cynder; assumed (axiom Spyro.cynder_dark_past.holds).
- new-spyro-pg (AXIOM, asserted 2026-11-01): "The new Spyro game is PG" — because: known from gaming news; source: reported
  Lean: Spyro.new_spyro_pg := IsPG newSpyro; assumed (axiom Spyro.new_spyro_pg.holds).
- pg-no-dark-past (AXIOM, stance: rule, asserted 2026-11-01): "PG games cannot have characters with dark pasts"
  No Lean yet (its block is in Model/Spyro/Main.lean, line 5).

Allowed besides these: Lean's standard axioms, the vocabulary, and the existence presuppositions of the things these statements mention (for example "there is at least one character"). freeze_statements tells you the exact list.

OTHER CARDS OF THIS SUBJECT (context only: if the proof needs one that has a .holds, propose its arrow with propose_arrow; if it has none, finish not_proved and name its id in gap)
(none)

VOCABULARY (Model/Spyro/Vocabulary.lean and other declarations without a card)
- Character : Type — characters
- Game : Type — games
- HasDarkPast : Character → Prop — has a dark past
- IsPG : Game → Prop — is rated PG
- GoodAddition : Character → Game → Prop — would be a good addition to
- cynder : Character — Cynder
- newSpyro : Game — the new Spyro game
- Character.exists : Nonempty Character — there is at least one character
- Game.exists : Nonempty Game — there is at least one game

EARLIER ANSWERS IN FORCE
- [genericity] "Do you mean every PG game?" → Every one (2026-10-30, scope: subject)

BUDGET: 25 Lean checks, 80 turns and 20 minutes of work for this run; waiting for the person's answers does not count.
`;

function bundle(ws: FakeWorkspace, premises: string[], scope: 'subject' | 'neighbourhood', graph?: TlGraph, decisions: DecisionRecord[] = []): string {
  return buildContextBundle({
    model: ws.projectModel(),
    graph: graph ?? ws.graph('Spyro'),
    library: 'Model',
    selection: { subject: 'Spyro', target: 'cynder-not-good', premises, adoptedGhosts: [] },
    decisions,
    caps: DEFAULT_RUN_SETTINGS.caps,
    scope,
  });
}

describe('the system prompt (section 5.1)', () => {
  it('is the plan text verbatim, ending with one newline, and the same on every call', () => {
    const fixture = readFileSync(FIXTURE, 'utf8');
    expect(buildSystemPrompt()).toBe(fixture);
    expect(buildSystemPrompt().endsWith('.\n')).toBe(true);
    expect(buildSystemPrompt().endsWith('\n\n')).toBe(false);
    expect(buildSystemPrompt()).toBe(buildSystemPrompt());
  });

  it('spec v4.1 (slice 1e): the task is Formalize for dependencies; slice 2d: a card the proof needs but nobody selected comes through propose_arrow when it has a .holds, else it is named in gap (A10)', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain(
      'Your task in this run (Formalize for dependencies): the person drew arrows from the SELECTED premises to the TARGET card and asks you to formalise them and prove the target from exactly these premises',
    );
    expect(prompt).toContain('When nothing is selected, the person marked the target as following from nothing: prove it from no premises at all.');
    expect(prompt).not.toContain('do not use it and never propose it with propose_assumption');
    expect(prompt).toContain(CLAUDE_SESSION_TEXTS.arrowRule);
    // Fixer 1e (ES-2, A11): a not-proved finish leaves the target's .holds as it was; it never removes the person's proof.
    expect(prompt).toContain(
      "finish with status not_proved, leave the target's `.holds` exactly as it was before the step (remove any proof of it you wrote; a proof or pending claim the person had stays as it is)",
    );
    expect(prompt).not.toContain('remove any proof of the target,');
    // The tools and the rules are unchanged.
    expect(prompt).toContain('Rules (a program checks them after finish; failures come back to you)');
  });

  it('slice 2d (docs/slice2-plan.md 2.8): an edit session works in steps; the arrow rule, the mark, D2-50 and D2-52 are verbatim', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain(CLAUDE_SESSION_TEXTS.workInSteps);
    expect(prompt).toContain(CLAUDE_SESSION_TEXTS.arrowRule);
    expect(prompt).toContain('For a target whose question is its "follows from nothing" mark: no arrows; propose a missing premise with propose_assumption.');
    expect(prompt).toContain(`- ${CLAUDE_SESSION_TEXTS.otherTargets}`);
    expect(prompt).toContain(`- ${CLAUDE_SESSION_TEXTS.declarationsOnly}`);
    // stray-command refuses every # command in a session, so the rules no longer allow #check and #print.
    expect(prompt).toContain('any # command;');
    expect(prompt).not.toContain('except #check and #print');
  });

  const plan = path.join(REPO_ROOT, 'docs', 'm2-plan.md');
  it.skipIf(!existsSync(plan))('still matches section 5.1 of docs/m2-plan.md', () => {
    const lines = readFileSync(plan, 'utf8').split('\n');
    const start = lines.findIndex((l) => l.startsWith('### 5.1 The system prompt'));
    const open = lines.findIndex((l, i) => i > start && l === '```');
    const close = lines.findIndex((l, i) => i > open && l === '```');
    expect(start).toBeGreaterThan(0);
    expect(`${lines.slice(open + 1, close).join('\n')}\n`).toBe(buildSystemPrompt());
  });
});

describe('the context bundle (section 5.2)', () => {
  it('quotes the cards verbatim with their Lean, the vocabulary and the decisions in force', () => {
    expect(bundle(new FakeWorkspace('/model'), ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'], 'subject', undefined, [DECISION])).toBe(EXPECTED_BUNDLE);
  });

  it('uses the source text when Lean has not checked the files, and lists unselected cards under OTHER CARDS', () => {
    const text = bundle(new FakeWorkspace('/model', { withFacts: false }), ['cynder-dark-past', 'new-spyro-pg'], 'subject');
    expect(text).toContain('  Lean: Spyro.cynder_not_good := ¬ GoodAddition cynder newSpyro (Model/Spyro/Main.lean, line 52). Not proved.');
    expect(text).toContain('OTHER CARDS OF THIS SUBJECT (context only: if the proof needs one that has a .holds, propose its arrow with propose_arrow; if it has none, finish not_proved and name its id in gap)\n- pg-no-dark-past (AXIOM): "PG games cannot have characters with dark pasts"\n');
    expect(text).toContain('EARLIER ANSWERS IN FORCE\n(none)\n');
  });

  it('says what an empty question asks: the target was marked "follows from nothing" (slice 1e)', () => {
    const text = bundle(new FakeWorkspace('/model'), [], 'subject');
    // Slice 1g: the first line names the run as the board does ("Follows from nothing?", not "Formalize for dependencies").
    expect(text.split('\n')[0]).toBe('Run: "Follows from nothing?" for the subject Spyro (namespace Spyro; the subject\'s folder is Model/Spyro/, its root module Model/Spyro.lean).');
    expect(text).toContain('SELECTED PREMISES (the person drew arrows from these to the target: prove it from exactly these)\n(none: the person marked the target as following from nothing: prove it from no premises at all.)\n');
    expect(text).toContain('- pg-no-dark-past (AXIOM): "PG games cannot have characters with dark pasts"');
    expect(text).toContain('- cynder-dark-past (AXIOM): "Cynder is a character who has a dark past" — Lean: Spyro.cynder_dark_past := HasDarkPast cynder');
  });

  it('`neighbourhood` lists only the cards the target or a premise mentions', () => {
    const ws = new FakeWorkspace('/model');
    const graph = ws.graph('Spyro');
    expect(bundle(ws, ['cynder-dark-past', 'new-spyro-pg'], 'subject', graph)).toContain('- pg-no-dark-past (AXIOM)');
    expect(bundle(ws, ['cynder-dark-past', 'new-spyro-pg'], 'neighbourhood', graph)).toContain('OTHER CARDS OF THIS SUBJECT (context only: if the proof needs one that has a .holds, propose its arrow with propose_arrow; if it has none, finish not_proved and name its id in gap)\n(none)\n');
    // When the target's statement mentions another card's statement (a lean-ref edge), that card is listed.
    const mentioned: TlGraph = {
      ...graph,
      edges: [...graph.edges, { id: 'lean-ref:pg-no-dark-past->cynder-not-good', type: 'lean-ref', source: 'pg-no-dark-past', target: 'cynder-not-good', origin: 'lean', where: 'statement' }],
    };
    expect(bundle(ws, ['cynder-dark-past', 'new-spyro-pg'], 'neighbourhood', mentioned)).toContain('- pg-no-dark-past (AXIOM): "PG games cannot have characters with dark pasts"');
  });

  it('a target that is proved already (A11, fixer 1e): prove it again from exactly the selection, or leave the existing proof as it is', () => {
    const ws = new FakeWorkspace('/model');
    const graph = ws.graph('Spyro');
    const proved: TlGraph = {
      ...graph,
      nodes: graph.nodes.map((n) => (n.id === 'cynder-not-good' ? { ...n, status: { ...n.status, proof: { kind: 'proved', footprint: ['cynder-dark-past'] } } } : n)),
    };
    expect(bundle(ws, ['new-spyro-pg'], 'subject', proved)).toContain(
      '(Model/Spyro/Main.lean, line 52). Proved already (prove it again from exactly this selection: a new proof replaces the existing one; if it does not follow, leave the existing proof as it is).\n',
    );
  });

  it('refuses a selection that is not on the board', () => {
    const ws = new FakeWorkspace('/model');
    expect(() => bundle(ws, ['nope'], 'subject')).toThrow(/premise nope is not a card of Spyro/);
  });

  it('shortens names only in the subject namespace', () => {
    expect(shortNames('¬Spyro.GoodAddition Spyro.cynder Spyro.Character.exists Other.Spyro.x', 'Spyro')).toBe('¬GoodAddition cynder Character.exists Other.Spyro.x');
  });
});

describe('later user turns (section 5.3)', () => {
  // Slice 2h: M2's Feedback and adoption turns went with their actions (Feedback, "I hold this"); the session's turns are below.
  it('Resume and the nudge', () => {
    expect(resumeTurn(true)).toBe("The session was interrupted (the person's editor reloaded) while you were working. Your files are as you left them; the statements are frozen. Continue the run from where you were.");
    expect(resumeTurn(false)).toContain('the statements are not frozen yet.');
    expect(NUDGE_TURN).toBe('You ended your turn without calling finish. Call finish now: with status proved if the target is proved, otherwise with status not_proved and the gap.');
  });
});

describe('an edit session\'s turns (slice 2d, docs/slice2-plan.md 2.8)', () => {
  const caps = DEFAULT_RUN_SETTINGS.caps;
  const base: StepTurnInput = {
    index: 2,
    of: 3,
    kind: 'formalize',
    target: { id: 'link-two', type: 'PROPOSITION', sentence: 'The new Spyro game excludes Cynder' },
    question: { sources: [{ id: 'link-one', sentence: 'Cynder has a past PG games exclude' }], fromNothing: false },
    arrows: [],
    fuzzyStatements: ['link-two'],
    openProof: true,
    openArrows: true,
    caps,
  };

  it('the plan: the targets in order, each with its question (the mark for an empty one); none, one or many', () => {
    expect(formalizePlan([])).toBe('FORMALIZE PLAN (one step per target, in this order; each step proves its target from its own question)');
    expect(formalizePlan([{ id: 't', sentence: 'T', sources: [], fromNothing: true }]).split('\n')[1]).toBe('1. t: "T" ← follows from nothing (no premises at all)');
    expect(
      formalizePlan([
        { id: 'a', sentence: 'A', sources: ['x'], fromNothing: false },
        { id: 'b', sentence: 'B', sources: ['a', 'y'], fromNothing: false },
      ]).split('\n').slice(1),
    ).toEqual(['1. a: "A" ← from x', '2. b: "B" ← from a, y']);
  });

  it('a step\'s first line is fixed: formalize and prove, rework, statements only; then the target, question, arrows, open and fixed', () => {
    const turn = stepTurn(base);
    const lines = turn.split('\n');
    expect(lines[0]).toBe('Step 2 of 3: formalize and prove “link-two”');
    expect(turn).toContain('TARGET: link-two (PROPOSITION): "The new Spyro game excludes Cynder"');
    expect(turn).toContain('QUESTION: the person selected the arrows from link-one ("Cynder has a past PG games exclude"): prove the target from exactly these.');
    expect(turn).toContain('YOUR ARROWS INTO IT SO FAR: (none)');
    expect(turn).toContain("OPEN IN THIS STEP: the target's proof (its .holds theorem) and the lemmas it needs; the empty Lean statements of link-two; new arrows into the target, proposed with propose_arrow.");
    expect(turn).toContain('FIXED: everything else, also what earlier steps wrote and what the person is reviewing: leave it exactly as it is.');
    expect(turn).toContain('BUDGET: 25 Lean checks, 80 turns, 20 minutes.');
    expect(turn).not.toContain(CLAUDE_SESSION_TEXTS.decisionsSince);
    expect(stepTurn({ ...base, kind: 'submit', openItems: ['card:x'] }).split('\n')[0]).toBe('Step 2 of 3: rework “link-two” after the review');
    const only = stepTurn({ ...base, statementsOnly: 'link-one', openProof: false, openArrows: false });
    expect(only.split('\n')[0]).toBe('Step 2 of 3: formalize the statements of “link-two” (no proof: “link-one” was not proved)');
    expect(only).toContain('OPEN IN THIS STEP: the empty Lean statements of link-two.');
    expect(only).toContain('call finish with status not_proved and name link-one in gap. Do not try to prove the target.');
    // The mark: no arrows open; Claude's arrows so far, with their review status.
    const mark = stepTurn({ ...base, question: { sources: [], fromNothing: true }, openArrows: false, arrows: [{ source: 's', status: 'accepted' }] });
    expect(mark).toContain('QUESTION: the person marked the target as following from nothing: prove it from no premises at all.');
    expect(mark).toContain('YOUR ARROWS INTO IT SO FAR: s (accepted)');
    expect(mark).not.toContain('propose_arrow');
  });

  it('the first step of a later queue lists the decisions since the previous queue (none, one, many)', () => {
    expect(stepTurn({ ...base, decisions: [] })).toContain(`${CLAUDE_SESSION_TEXTS.decisionsSince}\n(none)\n`);
    expect(stepTurn({ ...base, decisions: ['Accept: Formalize “A”'] })).toContain(`${CLAUDE_SESSION_TEXTS.decisionsSince}\n- Accept: Formalize “A”\n`);
    expect(stepTurn({ ...base, decisions: ['a', 'b'] })).toContain(`${CLAUDE_SESSION_TEXTS.decisionsSince}\n- a\n- b\n`);
  });
});

describe('Submit review\'s feedback turn (slice 2e, docs/slice2-plan.md 2.8, 3.7)', () => {
  const empty = { stage: 3, accepted: [], rejected: [], shaky: [], redo: [], steps: [] };

  it('its first line is fixed; every section says "(none)" when empty, and STEPS PLANNED lists none', () => {
    expect(submitFeedbackTurn(empty)).toBe(
      [
        CLAUDE_SESSION_TEXTS.reviewSubmitted(3),
        '',
        'ACCEPTED: keep them exactly as they are.',
        '(none)',
        '',
        'REJECTED: they were removed; never propose these exact versions again.',
        '(none)',
        '',
        'SHAKY: propose a different arrangement for these together. Any single one may come back unchanged, but not the whole set; if there is none, finish with no_alternative: true.',
        '(none)',
        '',
        'TO BE REDONE: propose them again; what each relied on:',
        '(none)',
        '',
        'STEPS PLANNED (one step per target, in this order):',
        '',
      ].join('\n'),
    );
  });

  it('one item per section: its label and Lean (indented), a Shaky note quoted, what an item to be redone relied on', () => {
    const turn = submitFeedbackTurn({
      stage: 1,
      accepted: [{ label: 'Formalize “A”', lean: 'abbrev a : Prop := True' }],
      rejected: [{ label: 'Result “B”', lean: 'theorem b.holds : b := trivial\n' }],
      shaky: [{ label: 'Formalize “C”', lean: 'abbrev c : Prop := True', note: 'Read it as a rule.' }],
      redo: [{ label: 'Result “D”', lean: '', reliedOn: ['Formalize “C”'] }],
      steps: [{ id: 'c', sentence: 'C holds' }],
    });
    expect(turn).toContain('ACCEPTED: keep them exactly as they are.\n- Formalize “A”\n    abbrev a : Prop := True\n\n');
    expect(turn).toContain('REJECTED: they were removed; never propose these exact versions again.\n- Result “B”\n    theorem b.holds : b := trivial\n\n');
    expect(turn).toContain('finish with no_alternative: true.\n- Formalize “C”\n    abbrev c : Prop := True\n  The person\'s note: "Read it as a rule."\n\n');
    expect(turn).toContain('TO BE REDONE: propose them again; what each relied on:\n- Result “D”\n  It relied on: Formalize “C”\n\n');
    expect(turn.endsWith('STEPS PLANNED (one step per target, in this order):\n1. c: "C holds"\n')).toBe(true);
  });

  it('many: every item in order, a multi-line Lean text, a Shaky item Submit took out with what it rests on, the steps numbered', () => {
    const turn = submitFeedbackTurn({
      ...empty,
      shaky: [
        { label: 'S1', lean: 'def x := 1\ndef y := 2', note: 'two\nlines' },
        { label: 'S2', lean: 'abbrev s2 : Prop := True', reliedOn: ['Formalize “A”', 'Result “B”'] },
      ],
      redo: [{ label: 'R1', lean: 'r1' }, { label: 'R2', lean: 'r2', reliedOn: [] }],
      steps: [
        { id: 'a', sentence: 'A' },
        { id: 'b', sentence: 'B' },
      ],
    });
    expect(turn).toContain('- S1\n    def x := 1\n    def y := 2\n  The person\'s note: "two\nlines"\n- S2\n    abbrev s2 : Prop := True\n  It relied on: Formalize “A”; Result “B”\n\n');
    expect(turn).toContain('- R1\n    r1\n- R2\n    r2\n\n');
    expect(turn).toContain('1. a: "A"\n2. b: "B"\n');
  });
});
