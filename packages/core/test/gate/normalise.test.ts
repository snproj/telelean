/**
 * AT1.5 (docs/m2-plan.md section 3.4): normalisationChanges pins, writes the derived id and mirrors the docstring for
 * a newly formalised card, idempotently and byte-stable elsewhere. AT1.7 (D-21): lifecycleChanges.
 */
import { describe, expect, it } from 'vitest';
import { ActionError, type FileChange } from '../../src/actions.js';
import { lifecycleChanges, normalisationChanges } from '../../src/gate/index.js';
import type { LifecycleItem } from '../../src/run.js';
import { BASE, edit, MAIN, model, normative, pinned, proved, TARGET_LINE, type Texts } from './helpers/spyroRun.js';

const apply = (texts: Texts, changes: readonly FileChange[]): Texts => {
  const out = { ...texts };
  for (const change of changes) {
    expect(change.before).toBe(texts[change.path]);
    if (change.after === null) delete out[change.path];
    else out[change.path] = change.after;
  }
  return out;
};

const DERIVED = 'pg-games-cannot-have-characters-with';
/** An id-less pg-no-dark-past block, formalised by Claude without a docstring. */
const IDLESS = edit(BASE, MAIN, 'id: pg-no-dark-past\n', '');
const formalisedBare = () =>
  edit(IDLESS, MAIN, 'stance: rule\nasserted: 2026-11-01\n-/\n\n', 'stance: rule\nasserted: 2026-11-01\n-/\nabbrev pg_no_dark_past : Prop := ∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ GoodAddition c g\naxiom pg_no_dark_past.holds : pg_no_dark_past\n\n');

describe('AT1.5 normalisationChanges', () => {
  it('pins, writes the derived id and the docstring of a newly formalised code-less card; nothing else changes', () => {
    const texts = formalisedBare();
    const m = model(texts);
    expect(m.nodes.get(DERIVED)?.node.lean.binding).toBe('adjacent');
    const changes = normalisationChanges(m, [DERIVED]);
    expect(changes.map((c) => c.path)).toEqual([MAIN]);
    const expected = (texts[MAIN] as string).replace(
      'type: ASSUMPTION\nnatural_name: PG games cannot have characters with dark pasts\nstance: rule\nasserted: 2026-11-01\n-/\nabbrev pg_no_dark_past',
      `id: ${DERIVED}\ntype: ASSUMPTION\nnatural_name: PG games cannot have characters with dark pasts\nstance: rule\nasserted: 2026-11-01\nlean: Spyro.pg_no_dark_past\n-/\n/-- PG games cannot have characters with dark pasts -/\nabbrev pg_no_dark_past`,
    );
    expect(changes[0]?.after).toBe(expected);
    expect(changes[0]?.before).toBe(texts[MAIN]);
  });

  it('is idempotent', () => {
    const texts = formalisedBare();
    const once = apply(texts, normalisationChanges(model(texts), [DERIVED]));
    expect(normalisationChanges(model(once), [DERIVED])).toEqual([]);
  });

  it('a card with the docstring already: only the pin (the walkthrough\'s normative formalisation)', () => {
    const changes = normalisationChanges(model(normative()), ['pg-no-dark-past']);
    expect(changes).toEqual([{ path: MAIN, before: normative()[MAIN], after: pinned(normative())[MAIN] }]);
    expect(normalisationChanges(model(pinned(normative())), ['pg-no-dark-past'])).toEqual([]);
  });

  it('a docstring other than the sentence becomes the sentence (escaped)', () => {
    const texts = edit(normative(), MAIN, '/-- PG games cannot have characters with dark pasts -/', '/-- the normative reading -/');
    const [change] = normalisationChanges(model(texts), ['pg-no-dark-past']);
    expect(change?.after).toBe(pinned(normative())[MAIN]);
  });

  it('cards that are not new, code-less cards and unknown ids change nothing', () => {
    expect(normalisationChanges(model(BASE), ['cynder-dark-past', 'new-spyro-pg', 'cynder-not-good'])).toEqual([]);
    expect(normalisationChanges(model(BASE), ['pg-no-dark-past', 'nope'])).toEqual([]);
    expect(normalisationChanges(model(pinned(proved())), ['pg-no-dark-past', 'cynder-not-good'])).toEqual([]);
  });
});

const G_TO_D: LifecycleItem = { id: 'l1', kind: 'change-kind', nodeId: 'cynder-not-good', from: 'GOAL', to: 'DERIVATION', recommended: true, reason: 'Lean proved it from the selected premises' };

const refusal = (fn: () => unknown): ActionError => {
  try {
    fn();
  } catch (error) {
    if (error instanceof ActionError) return error;
    throw error;
  }
  throw new Error('expected an ActionError');
};

describe('AT1.7 lifecycleChanges', () => {
  it('G->D of the proved target changes only its `type:` line', () => {
    const texts = pinned(proved());
    expect(lifecycleChanges(model(texts), [G_TO_D])).toEqual([
      { path: MAIN, before: texts[MAIN], after: (texts[MAIN] as string).replace('id: cynder-not-good\ntype: GOAL', 'id: cynder-not-good\ntype: DERIVATION') },
    ]);
    // An adjacency-bound target without a written id: still only the `type:` line (no pin, no id).
    const bare = edit(edit(pinned(proved()), MAIN, 'id: cynder-not-good\n', ''), MAIN, 'asserted: 2026-11-01\nlean: Spyro.cynder_not_good\n-/', 'asserted: 2026-11-01\n-/');
    const id = 'cynder-would-not-be-a-good';
    expect(model(bare).nodes.get(id)?.node.status.proof.kind).toBe('proved');
    expect(lifecycleChanges(model(bare), [{ ...G_TO_D, nodeId: id }])[0]?.after).toBe((bare[MAIN] as string).replace('type: GOAL', 'type: DERIVATION'));
    expect(lifecycleChanges(model(texts), [])).toEqual([]);
  });

  it('refuses (unsafe) an item that no longer applies', () => {
    const notProved = model(pinned(normative()));
    expect(refusal(() => lifecycleChanges(notProved, [G_TO_D])).code).toBe('unsafe');
    expect(refusal(() => lifecycleChanges(notProved, [G_TO_D])).message).toMatch(/no longer proved/);
    const derivation = model(edit(pinned(proved()), MAIN, 'type: GOAL', 'type: DERIVATION'));
    expect(refusal(() => lifecycleChanges(derivation, [G_TO_D])).code).toBe('unsafe');
    expect(refusal(() => lifecycleChanges(model(pinned(proved())), [{ ...G_TO_D, nodeId: 'gone' }])).code).toBe('unsafe');
    expect(refusal(() => lifecycleChanges(model(pinned(proved())), [{ ...G_TO_D, to: 'ASSUMPTION' }])).code).toBe('unsafe');
    // The weakened-type cheat is not "proved".
    const weak = model(pinned(edit(normative(), MAIN, TARGET_LINE, `${TARGET_LINE}theorem cynder_not_good.holds : cynder_not_good ∨ True := Or.inr trivial\n`)));
    expect(refusal(() => lifecycleChanges(weak, [G_TO_D])).code).toBe('unsafe');
  });
});

describe('AT1.5 normalisation only pins well-formed statements', () => {
  it('a theorem placed directly under a selected card\'s block is not pinned as its statement', () => {
    const texts = edit(BASE, MAIN, 'stance: rule\nasserted: 2026-11-01\n-/\n\n', 'stance: rule\nasserted: 2026-11-01\n-/\ntheorem stray : True := trivial\n\n');
    const m = model(texts);
    expect(m.nodes.get('pg-no-dark-past')?.node.lean).toMatchObject({ binding: 'adjacent', statement: 'Spyro.stray' });
    expect(normalisationChanges(m, ['pg-no-dark-past'])).toEqual([]);
  });
});
