/**
 * AT1.5 (docs/m2-plan.md section 3.4): normalisationChanges pins, writes the derived id and mirrors the docstring for
 * a newly formalised card, idempotently and byte-stable elsewhere. (AT1.7's lifecycleChanges went with spec v4's two
 * kinds: docs/slice1-plan.md 2.6.)
 */
import { describe, expect, it } from 'vitest';
import type { FileChange } from '../../src/actions.js';
import { normalisationChanges } from '../../src/gate/index.js';
import { BASE, edit, MAIN, model, normative, pinned, proved, type Texts } from './helpers/spyroRun.js';

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

describe('AT1.5 normalisation only pins well-formed statements', () => {
  it('a theorem placed directly under a selected card\'s block is not pinned as its statement', () => {
    const texts = edit(BASE, MAIN, 'stance: rule\nasserted: 2026-11-01\n-/\n\n', 'stance: rule\nasserted: 2026-11-01\n-/\ntheorem stray : True := trivial\n\n');
    const m = model(texts);
    expect(m.nodes.get('pg-no-dark-past')?.node.lean).toMatchObject({ binding: 'adjacent', statement: 'Spyro.stray' });
    expect(normalisationChanges(m, ['pg-no-dark-past'])).toEqual([]);
  });
});
