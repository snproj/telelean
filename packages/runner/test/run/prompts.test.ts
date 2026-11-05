/**
 * AT3.12 (docs/m2-plan.md section 5): what leaves the machine. buildSystemPrompt() is section 5.1 verbatim (a fixture
 * copy, and the plan itself while it exists); the context bundle quotes the cards verbatim with the vocabulary and
 * the decisions in force; `neighbourhood` omits unrelated cards; the later turns are section 5.3's texts.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { DecisionRecord, TlGraph } from '@telelean/core';
import { describe, expect, it } from 'vitest';

import { adoptionTurn, buildContextBundle, buildSystemPrompt, DEFAULT_RUN_SETTINGS, feedbackTurn, NUDGE_TURN, resumeTurn, shortNames } from '../../src/run/index.js';
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

const EXPECTED_BUNDLE = `Run: "These suffice" for the subject Spyro (namespace Spyro; the subject's folder is Model/Spyro/, its root module Model/Spyro.lean).

TARGET
- cynder-not-good (GOAL): "Cynder would not be a good addition to the new Spyro game"
  Lean: Spyro.cynder_not_good := ¬GoodAddition cynder newSpyro (Model/Spyro/Main.lean, line 52). Not proved.

SELECTED PREMISES (prove the target from exactly these)
- cynder-dark-past (ASSUMPTION, asserted 2026-11-01): "Cynder is a character who has a dark past" — because: familiar with gaming lore; source: common
  Lean: Spyro.cynder_dark_past := HasDarkPast cynder; assumed (axiom Spyro.cynder_dark_past.holds).
- new-spyro-pg (ASSUMPTION, asserted 2026-11-01): "The new Spyro game is PG" — because: known from gaming news; source: reported
  Lean: Spyro.new_spyro_pg := IsPG newSpyro; assumed (axiom Spyro.new_spyro_pg.holds).
- pg-no-dark-past (ASSUMPTION, stance: rule, asserted 2026-11-01): "PG games cannot have characters with dark pasts"
  No Lean yet (its block is in Model/Spyro/Main.lean, line 5).

Allowed besides these: Lean's standard axioms, the vocabulary, and the existence presuppositions of the things these statements mention (for example "there is at least one character"). freeze_statements tells you the exact list.

OTHER CARDS OF THIS SUBJECT (context only; never use them as premises)
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
    expect(text).toContain('OTHER CARDS OF THIS SUBJECT (context only; never use them as premises)\n- pg-no-dark-past (ASSUMPTION): "PG games cannot have characters with dark pasts"\n');
    expect(text).toContain('EARLIER ANSWERS IN FORCE\n(none)\n');
  });

  it('says what "Self-evident?" asks when nothing is selected', () => {
    const text = bundle(new FakeWorkspace('/model'), [], 'subject');
    expect(text).toContain('SELECTED PREMISES (prove the target from exactly these)\n(none: the person asks whether the target is self-evident: provable from no premises at all.)\n');
    expect(text).toContain('- pg-no-dark-past (ASSUMPTION): "PG games cannot have characters with dark pasts"');
    expect(text).toContain('- cynder-dark-past (ASSUMPTION): "Cynder is a character who has a dark past" — Lean: Spyro.cynder_dark_past := HasDarkPast cynder');
  });

  it('`neighbourhood` lists only the cards the target or a premise mentions', () => {
    const ws = new FakeWorkspace('/model');
    const graph = ws.graph('Spyro');
    expect(bundle(ws, ['cynder-dark-past', 'new-spyro-pg'], 'subject', graph)).toContain('- pg-no-dark-past (ASSUMPTION)');
    expect(bundle(ws, ['cynder-dark-past', 'new-spyro-pg'], 'neighbourhood', graph)).toContain('OTHER CARDS OF THIS SUBJECT (context only; never use them as premises)\n(none)\n');
    // When the target's statement mentions another card's statement (a lean-ref edge), that card is listed.
    const mentioned: TlGraph = {
      ...graph,
      edges: [...graph.edges, { id: 'lean-ref:pg-no-dark-past->cynder-not-good', type: 'lean-ref', source: 'pg-no-dark-past', target: 'cynder-not-good', origin: 'lean', where: 'statement' }],
    };
    expect(bundle(ws, ['cynder-dark-past', 'new-spyro-pg'], 'neighbourhood', mentioned)).toContain('- pg-no-dark-past (ASSUMPTION): "PG games cannot have characters with dark pasts"');
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
  const caps = DEFAULT_RUN_SETTINGS.caps;
  it('Feedback', () => {
    expect(feedbackTurn('Read "cannot" as a rule.', caps)).toBe(
      'Feedback from the person on your previous result:\n"Read "cannot" as a rule."\nThis starts a new round. Your earlier changes are still in the files. If statements need to change, revise them, then call check_lean and freeze_statements again before proving: finish with status proved needs a freeze in this round. Budget for this round: 25 Lean checks, 80 turns, 20 minutes.',
    );
  });
  it('Adoption', () => {
    expect(adoptionTurn({ nodeId: 'a-character-who-cannot-be-in', sentence: 'A character who cannot be in a game would not be a good addition to it', leanName: 'Spyro.not_in_game_not_good', statement: '∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g', caps })).toBe(
      'The person adopted your suggestion as an assumption:\n- a-character-who-cannot-be-in (ASSUMPTION, worded by you): "A character who cannot be in a game would not be a good addition to it"\n  Lean: Spyro.not_in_game_not_good := ∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g; axiom Spyro.not_in_game_not_good.holds (telelean wrote it right before the target\'s block).\nThe statements are frozen again with it selected, so you may use Spyro.not_in_game_not_good.holds. Prove the target now and call finish. Budget for this round: 25 Lean checks, 80 turns, 20 minutes.',
    );
  });
  it('Resume and the nudge', () => {
    expect(resumeTurn(true)).toBe("The session was interrupted (the person's editor reloaded) while you were working. Your files are as you left them; the statements are frozen. Continue the run from where you were.");
    expect(resumeTurn(false)).toContain('the statements are not frozen yet.');
    expect(NUDGE_TURN).toBe('You ended your turn without calling finish. Call finish now: with status proved if the target is proved, otherwise with status not_proved and the gap.');
  });
});
