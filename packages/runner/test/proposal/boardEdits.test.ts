/**
 * Turn 13 (fresh models, the demo path): Accept's rebase places the board's own edits made while Claude worked by card
 * id instead of by line (proposal/files.ts `mergeFile`, `boardEditsOf`). On a freshly typed Inbox every card is
 * within 3 lines of Claude's formalisation, so a card added with the A|D|G box or a reason written on a card made
 * every such Accept a conflict. Every other edit keeps the 3-line rule of docs/m2-plan.md section 7.1 (a sentence
 * changed next to Claude's formalisation of it above all). Pure: the texts are what the board and the run write.
 */
import { describe, expect, it } from 'vitest';

import { boardEditsOf, mergeFile } from '../../src/proposal/files.js';

const INBOX = 'Model/Demo/Inbox.lean';
const HEAD = 'import Model.Demo.Vocabulary\n\n-- New cards typed on the telelean board are added here.\nnamespace Demo\n\n';
const block = (id: string, type: string, sentence: string, extra: string[] = []): string =>
  ['/-', '@@ telelean v1', `id: ${id}`, `type: ${type}`, `natural_name: ${sentence}`, ...extra, 'asserted: 2026-11-10', '-/'].join('\n');
const PREMISES = 'premises: all-humans-are-mortal, socrates-is-a-human';

/** The person's Inbox when "These suffice" starts (the base): three code-less cards, the premises declared. */
const BASE = `${HEAD}${block('all-humans-are-mortal', 'ASSUMPTION', 'All humans are mortal')}\n\n${block('socrates-is-a-human', 'ASSUMPTION', 'Socrates is a human')}\n\n${block('socrates-is-mortal', 'GOAL', 'Socrates is mortal', [PREMISES])}\n\nend Demo\n`;

/** What the run shows: each card formalised directly below its block and pinned by telelean, the goal proved. */
const SHOWN = BASE.replace('natural_name: All humans are mortal\nasserted: 2026-11-10\n-/\n', 'natural_name: All humans are mortal\nasserted: 2026-11-10\nlean: Demo.all_humans_are_mortal\n-/\n/-- All humans are mortal -/\nabbrev all_humans_are_mortal : Prop := ∀ x : Being, Human x → Mortal x\naxiom all_humans_are_mortal.holds : all_humans_are_mortal\n')
  .replace('natural_name: Socrates is a human\nasserted: 2026-11-10\n-/\n', 'natural_name: Socrates is a human\nasserted: 2026-11-10\nlean: Demo.socrates_is_a_human\n-/\n/-- Socrates is a human -/\nabbrev socrates_is_a_human : Prop := Human socrates\naxiom socrates_is_a_human.holds : socrates_is_a_human\n')
  .replace(`${PREMISES}\nasserted: 2026-11-10\n-/\n`, `${PREMISES}\nasserted: 2026-11-10\nlean: Demo.socrates_is_mortal\n-/\n/-- Socrates is mortal -/\nabbrev socrates_is_mortal : Prop := Mortal socrates\ntheorem socrates_is_mortal.holds : socrates_is_mortal :=\n  all_humans_are_mortal.holds socrates socrates_is_a_human.holds\n`);

/** A card the board's A|D|G box adds while Claude works (core `add-node`: end of the Inbox's namespace). */
const PLATO = block('plato-is-a-human', 'ASSUMPTION', 'Plato is a human');
const withPlato = (text: string): string => text.replace('\nend Demo\n', `\n${PLATO}\n\nend Demo\n`);

function merged(real: string): string | null {
  const result = mergeFile(INBOX, BASE, SHOWN, real);
  if (!result.ok) throw new Error('conflict');
  return result.text;
}
const conflict = (real: string): boolean => !mergeFile(INBOX, BASE, SHOWN, real).ok;

describe('Accept merges the board\'s own edits made during a run (turn 13)', () => {
  it('the texts are set up as on a fresh model: the plain 3-line patch cannot place any of these edits', () => {
    expect(SHOWN).not.toBe(BASE);
    expect(merged(BASE)).toBe(SHOWN);
  });

  it('a card added at the end of the Inbox goes after Claude\'s proof, exactly as typed', () => {
    const text = merged(withPlato(BASE));
    expect(text).toBe(withPlato(SHOWN));
  });

  it('a rationale written on a card Claude formalised and pinned is kept, with the pin', () => {
    const real = BASE.replace('natural_name: Socrates is a human\n', 'natural_name: Socrates is a human\nrationale: I read the dialogues\n');
    expect(merged(real)).toBe(SHOWN.replace('natural_name: Socrates is a human\n', 'natural_name: Socrates is a human\nrationale: I read the dialogues\n'));
    // On the target too, together with an added card.
    const both = withPlato(BASE.replace('natural_name: Socrates is mortal\n', 'natural_name: Socrates is mortal\nrationale: the classic\n'));
    expect(merged(both)).toBe(withPlato(SHOWN.replace('natural_name: Socrates is mortal\n', 'natural_name: Socrates is mortal\nrationale: the classic\n')));
  });

  it('a changed rationale and a removed one are kept too', () => {
    const base = BASE.replace('natural_name: All humans are mortal\n', 'natural_name: All humans are mortal\nrationale: everyone dies\n');
    const shown = SHOWN.replace('natural_name: All humans are mortal\n', 'natural_name: All humans are mortal\nrationale: everyone dies\n');
    const changed = base.replace('rationale: everyone dies', 'rationale: nobody lives for ever');
    const result = mergeFile(INBOX, base, shown, changed);
    expect(result).toEqual({ ok: true, text: shown.replace('rationale: everyone dies', 'rationale: nobody lives for ever') });
    expect(mergeFile(INBOX, base, shown, base.replace('rationale: everyone dies\n', ''))).toEqual({ ok: true, text: SHOWN });
  });

  it('every other edit next to Claude\'s changes stays a conflict: the sentence of a formalised card above all', () => {
    expect(conflict(BASE.replace('natural_name: Socrates is a human', 'natural_name: Socrates was a human'))).toBe(true);
    expect(conflict(BASE.replace('natural_name: Socrates is a human\n', 'natural_name: Socrates was a human\nrationale: I read the dialogues\n'))).toBe(true);
    expect(conflict(BASE.replace(`${PREMISES}\n`, 'premises: all-humans-are-mortal\n'))).toBe(true);
    // A new block that is not code-less (a declaration directly below it) or carries a `lean:` field.
    expect(conflict(BASE.replace('\nend Demo\n', `\n${PLATO}\nabbrev plato_human : Prop := True\n\nend Demo\n`))).toBe(true);
    expect(conflict(BASE.replace('\nend Demo\n', `\n${PLATO.replace('-/', 'lean: Demo.socrates_is_mortal\n-/')}\n\nend Demo\n`))).toBe(true);
    // Lean code written by hand next to Claude's.
    expect(conflict(BASE.replace('\nend Demo\n', '\naxiom extra : Prop\n\nend Demo\n'))).toBe(true);
  });

  it('boardEditsOf takes out exactly the board\'s edits', () => {
    expect(boardEditsOf(INBOX, BASE, BASE)).toBeUndefined();
    const edits = boardEditsOf(INBOX, BASE, withPlato(BASE.replace('natural_name: It\n', '')));
    expect(edits?.rest).toBe(BASE);
    expect(edits?.restore(SHOWN)).toBe(withPlato(SHOWN));
    // A card whose id the merged text already has (e.g. an adopted suggestion of the same words) is not put back.
    expect(edits?.restore(withPlato(SHOWN))).toBeUndefined();
  });
});
