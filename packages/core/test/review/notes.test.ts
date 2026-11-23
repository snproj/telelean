/**
 * Slice 2j2 (docs/slice2-plan.md 1.1's and 6.1's 2j2 entries; D2-92, the user's decision of turn 25, and D2-93–D2-95):
 * notes for Claude in the reducer and reconcile.
 *   - N1: every decline keeps its note, whatever its option (D2-13 kept Shaky's only); a group shares one; Undo and
 *     Redo restore it with the decision;
 *   - N2: the `note` action on an item to be redone: set, replaced, cleared; its refusals; one stack step that Undo and
 *     Redo act on; the note survives every rule that rebuilds `redo` while the item stays to be redone, and goes when the
 *     item leaves that status.
 */
import { describe, expect, it } from 'vitest';
import { reconcile } from '../../src/review/reconcile.js';
import { reduceReview } from '../../src/review/reducer.js';
import { copyRedo, dropStaleRedoNotes, fallbackLabel, itemStateOf } from '../../src/review/records.js';
import { REVIEW_TEXTS } from '../../src/review/texts.js';
import type { DeclineOption, ItemRecord, ReviewOutcome, ReviewState } from '../../src/review/types.js';
import { AT, CHANGES, RUN, draft, idOf, item, judgementOf, next, record, recordsOf, stateOf, statuses } from './helpers/records.js';

type Ok = Extract<ReviewOutcome, { ok: true }>;
type Redo = NonNullable<ItemRecord['redo']>;

const ok = (outcome: ReviewOutcome): Ok => {
  if (!outcome.ok) throw new Error(`${outcome.code}: ${'error' in outcome ? outcome.error : JSON.stringify(outcome.cascade)}`);
  return outcome;
};
const LATER = '2026-11-22T09:00:00.000Z';
/** A decline of each key with `option` and `note` (one request: a group when several). */
const decline = (s: ReviewState, keys: string[], option: DeclineOption, note?: string): ReviewOutcome =>
  reduceReview(
    s,
    { kind: 'decide', decisions: keys.map((key) => ({ item: idOf(key), rev: item(s, key).rev, to: 'declined' as const, option, ...(note !== undefined ? { note } : {}) })), own: false, confirmed: true },
    AT,
  );
const back = (s: ReviewState, key: string): ReviewOutcome => reduceReview(s, { kind: 'decide', decisions: [{ item: idOf(key), rev: item(s, key).rev, to: 'in-review' }], own: false, confirmed: true }, AT);
const note = (s: ReviewState, key: string, text: string, rev = item(s, key).rev): ReviewOutcome => reduceReview(s, { kind: 'note', item: idOf(key), rev, note: text }, LATER);
const undo = (s: ReviewState): ReviewOutcome => reduceReview(s, { kind: 'undo', step: s.stack.done.at(-1)?.id ?? 0, confirmed: true }, AT);
const redo = (s: ReviewState): ReviewOutcome => reduceReview(s, { kind: 'redo', step: s.stack.undone.at(-1)?.id ?? 0, confirmed: true }, AT);
const shaky = (over: Partial<ItemRecord> = {}): Partial<ItemRecord> => ({ status: 'declined', decline: { option: 'shaky', at: AT }, ...over });
const redone = (because: string[], over: Partial<Redo> = {}): Partial<ItemRecord> => ({ status: 'to-be-redone', redo: { because: because.map(idOf), reverted: false, kind: 'cascade', ...over } });
const accepted = { how: 'own' as const, fingerprint: 'fp', belief: false, changesProved: false, at: AT };
const MULTI = 'Read it as a rule.\nNot as a fact about one game.';

describe('N1: every decline keeps its note (D2-92; D2-13 superseded)', () => {
  it('Reject, Shaky and the plain decline of an arrow item each keep the note, multi-line and at any length the protocol allows', () => {
    for (const [key, kind, option] of [
      ['card:x', 'formalize', 'reject'],
      ['card:x', 'formalize', 'shaky'],
      ['arrow:a>t', 'add-arrow', 'plain'],
    ] as const) {
      const s = stateOf({ items: [record(key, kind, kind === 'add-arrow' ? { partOf: 't' } : {}), record('card:m', 'formalize')], ...(kind === 'add-arrow' ? { forced: { via: 'show-result', at: AT } } : {}) });
      const out = ok(decline(s, [key], option, MULTI));
      expect(item(out, key).decline, option).toEqual({ option, note: MULTI, at: AT });
      const full = 'n'.repeat(4000);
      expect(item(ok(decline(s, [key], option, full)), key).decline?.note, option).toBe(full);
    }
  });

  it('a blank note is dropped, with every option; Transform stays refused until slice 4', () => {
    const s = stateOf({ items: [record('card:x', 'formalize'), record('card:m', 'formalize')] });
    for (const option of ['reject', 'shaky'] as const) expect(item(ok(decline(s, ['card:x'], option, ' \n\t ')), 'card:x').decline).toEqual({ option, at: AT });
    expect(decline(s, ['card:x'], 'transform', 'my note')).toEqual({ ok: false, code: 'refused', error: REVIEW_TEXTS.transformLater, item: idOf('card:x') });
  });

  it('a group decline shares one note, an arrow item among them declined plain with it; an arrow-only group too', () => {
    const s = stateOf({
      items: [record('card:x', 'formalize'), record('card:y', 'formalize'), record('arrow:a>t', 'add-arrow', { partOf: 't' }), record('arrow:b>t', 'add-arrow', { partOf: 't' }), record('card:m', 'formalize')],
      forced: { via: 'show-result', at: AT },
    });
    const out = ok(
      reduceReview(
        s,
        {
          kind: 'decide',
          decisions: [
            { item: idOf('card:x'), rev: 1, to: 'declined', option: 'reject', note: 'shared' },
            { item: idOf('card:y'), rev: 1, to: 'declined', option: 'reject', note: 'shared' },
            { item: idOf('arrow:a>t'), rev: 1, to: 'declined', option: 'plain', note: 'shared' },
          ],
          own: false,
          confirmed: true,
        },
        AT,
      ),
    );
    for (const key of ['card:x', 'card:y']) expect(item(out, key).decline).toEqual({ option: 'reject', note: 'shared', at: AT });
    expect(item(out, 'arrow:a>t').decline).toEqual({ option: 'plain', note: 'shared', at: AT });
    const arrows = ok(decline(s, ['arrow:a>t', 'arrow:b>t'], 'plain', 'not these'));
    for (const key of ['arrow:a>t', 'arrow:b>t']) expect(item(arrows, key).decline).toEqual({ option: 'plain', note: 'not these', at: AT });
  });

  it('Undo takes the decline and its note away; Redo sends it again, note included (its request records it)', () => {
    let s = stateOf({ items: [record('card:x', 'formalize'), record('card:m', 'formalize')] });
    s = next(s, decline(s, ['card:x'], 'reject', MULTI));
    const step = s.stack.done.at(-1);
    expect(step?.kind === 'decide' ? step.request.decisions : []).toEqual([{ item: idOf('card:x'), rev: 1, to: 'declined', option: 'reject', note: MULTI }]);
    s = next(s, undo(s));
    expect(item(s, 'card:x')).toMatchObject({ status: 'in-review' });
    expect(item(s, 'card:x').decline).toBeUndefined();
    s = next(s, redo(s));
    expect(item(s, 'card:x').decline).toEqual({ option: 'reject', note: MULTI, at: AT });
  });
});

describe('N2: the note of an item to be redone (D2-92, D2-95)', () => {
  const scene = () =>
    stateOf({
      items: [record('decl:X', 'declaration', shaky()), record('decl:Z', 'declaration', redone(['decl:X'])), record('card:m', 'formalize')],
      deps: { 'decl:Z': ['decl:X'] },
    });

  it('sets, replaces and clears it, each one stack step labelled "Note for Claude: ‹label›", records only (no write)', () => {
    let s = scene();
    const set = ok(note(s, 'decl:Z', MULTI));
    expect(item(set, 'decl:Z').redo).toEqual({ because: [idOf('decl:X')], reverted: false, kind: 'cascade', note: MULTI });
    expect(set.write).toBeNull();
    expect(set.label).toBe(REVIEW_TEXTS.undoNote(fallbackLabel(item(s, 'decl:Z'))));
    expect(set.label.startsWith('Note for Claude: ')).toBe(true);
    expect(set.stack.done.at(-1)).toEqual({ id: 1, kind: 'note', label: set.label, item: idOf('decl:Z'), rev: 1, after: MULTI, at: LATER });
    expect(set.cascade).toEqual([]);
    expect(set.events).toEqual([]);
    s = next(s, set);
    const replaced = ok(note(s, 'decl:Z', 'Shorter.'));
    expect(item(replaced, 'decl:Z').redo?.note).toBe('Shorter.');
    expect(replaced.stack.done.at(-1)).toMatchObject({ kind: 'note', before: MULTI, after: 'Shorter.' });
    s = next(s, replaced);
    const cleared = ok(note(s, 'decl:Z', '  \n '));
    expect(item(cleared, 'decl:Z').redo).toEqual({ because: [idOf('decl:X')], reverted: false, kind: 'cascade' });
    expect(Object.hasOwn(item(cleared, 'decl:Z').redo as object, 'note')).toBe(false);
    expect(cleared.stack.done.at(-1)).toMatchObject({ kind: 'note', before: 'Shorter.' });
    expect(cleared.stack.done.at(-1)).not.toHaveProperty('after');
    // A new step clears Redo, as every action.
    expect(cleared.stack.undone).toEqual([]);
  });

  it('the same note again, or clearing none, changes nothing and makes no stack step', () => {
    let s = scene();
    const none = ok(note(s, 'decl:Z', ''));
    expect(none.stack).toBe(s.stack);
    s = next(s, note(s, 'decl:Z', 'Once.'));
    const same = ok(note(s, 'decl:Z', 'Once.'));
    expect(same.stack).toBe(s.stack);
    expect(same.label).toBe('');
  });

  it('is refused on an item that is not to be redone, on a hidden one (never named), and for a stale rev or an unknown item', () => {
    const s = scene();
    for (const key of ['decl:X', 'card:m']) expect(note(s, key, 'n')).toEqual({ ok: false, code: 'refused', error: REVIEW_TEXTS.noteOnlyRedo, item: idOf(key) });
    // A declined record that keeps `redo` (a cascade took its content out before its decline, D2-60) is not to be redone.
    const kept = stateOf({ items: [record('decl:V', 'declaration', { status: 'declined', decline: { option: 'reject', at: AT }, redo: { because: [], reverted: true, kind: 'cascade' } }), record('card:m', 'formalize')] });
    expect(note(kept, 'decl:V', 'n')).toEqual({ ok: false, code: 'refused', error: REVIEW_TEXTS.noteOnlyRedo, item: idOf('decl:V') });
    expect(note(s, 'decl:Z', 'n', 2)).toMatchObject({ ok: false, code: 'conflict', item: idOf('decl:Z') });
    expect(reduceReview(s, { kind: 'note', item: 'it-missing', rev: 1, note: 'n' }, AT)).toMatchObject({ ok: false, code: 'conflict' });
    // A Result to be redone while the results are hidden (card:m is in review): "show them first", naming nothing.
    const hidden = stateOf({ items: [record('card:m', 'formalize'), record('proof:t', 'result', { status: 'to-be-redone', redo: { because: [], reverted: true, kind: 'judge' } })] });
    expect(note(hidden, 'proof:t', 'n')).toEqual({ ok: false, code: 'refused', error: REVIEW_TEXTS.showResultsFirst });
    // A hidden item's rev is never compared: the same answer whatever rev is sent.
    expect(note(hidden, 'proof:t', 'n', 7)).toEqual({ ok: false, code: 'refused', error: REVIEW_TEXTS.showResultsFirst });
  });

  it('Undo puts the note before back; Redo sends it again; Undo is a conflict once the item changed since', () => {
    let s = scene();
    s = next(s, note(s, 'decl:Z', 'First.'));
    s = next(s, note(s, 'decl:Z', 'Second.'));
    const undone = ok(undo(s));
    expect(item(undone, 'decl:Z').redo?.note).toBe('First.');
    expect(undone.label).toBe(s.stack.done.at(-1)?.kind === 'note' ? (s.stack.done.at(-1) as { label: string }).label : '');
    expect(undone.write).toBeNull();
    s = next(s, undone);
    expect(s.stack.undone.at(-1)).toMatchObject({ kind: 'note', after: 'Second.' });
    const redone2 = ok(redo(s));
    expect(item(redone2, 'decl:Z').redo?.note).toBe('Second.');
    expect(redone2.stack.undone).toEqual([]);
    s = next(s, redone2);
    // Undo twice: back to no note.
    s = next(s, undo(s));
    s = next(s, undo(s));
    expect(Object.hasOwn(item(s, 'decl:Z').redo as object, 'note')).toBe(false);
    // An Undo of a note on an item that left to be redone since (a judge's change, say): conflict.
    let t = next(scene(), note(scene(), 'decl:Z', 'Mine.'));
    t = { ...t, items: t.items.map((r) => (r.key === 'decl:Z' ? { ...r, status: 'in-review' as const, redo: undefined } : r)) };
    expect(undo(t)).toMatchObject({ ok: false, code: 'conflict', item: idOf('decl:Z') });
    // ... or whose note is no longer the one it left.
    let u = next(scene(), note(scene(), 'decl:Z', 'Mine.'));
    u = { ...u, items: u.items.map((r) => (r.key === 'decl:Z' ? { ...r, redo: { ...(r.redo as Redo), note: 'Other.' } } : r)) };
    expect(undo(u)).toMatchObject({ ok: false, code: 'conflict' });
    // A Redo whose item left to be redone since is refused by the rules.
    let w = next(scene(), note(scene(), 'decl:Z', 'Mine.'));
    w = next(w, undo(w));
    w = { ...w, items: w.items.map((r) => (r.key === 'decl:Z' ? { ...r, status: 'in-review' as const, redo: undefined } : r)) };
    expect(redo(w)).toEqual({ ok: false, code: 'refused', error: REVIEW_TEXTS.noteOnlyRedo, item: idOf('decl:Z') });
  });

  it('survives every rule that rebuilds `redo` while the item stays to be redone (D2-93)', () => {
    // A second Shaky cause (D2-80) and a Reject cascade over it.
    let s = stateOf({
      items: [record('decl:X', 'declaration', shaky()), record('decl:Y', 'declaration'), record('decl:Z', 'declaration', redone(['decl:X'])), record('card:m', 'formalize')],
      deps: { 'decl:Z': ['decl:X', 'decl:Y'] },
    });
    s = next(s, note(s, 'decl:Z', MULTI));
    const shakyToo = ok(decline(s, ['decl:Y'], 'shaky'));
    expect(item(shakyToo, 'decl:Z').redo).toEqual({ because: [idOf('decl:X'), idOf('decl:Y')], reverted: false, kind: 'cascade', note: MULTI });
    const rejectToo = ok(decline(s, ['decl:Y'], 'reject'));
    expect(item(rejectToo, 'decl:Z').redo).toEqual({ because: [idOf('decl:X'), idOf('decl:Y')], reverted: true, kind: 'cascade', note: MULTI });
    // One cause comes back, the other keeps it down: it stays, note kept.
    const both = next(s, shakyToo);
    const oneBack = ok(back(both, 'decl:X'));
    expect(item(oneBack, 'decl:Z')).toMatchObject({ status: 'to-be-redone', redo: { because: [idOf('decl:Y')], note: MULTI } });
    // DO-0's question change on a Result already to be redone.
    let q = stateOf({
      items: [
        record('arrow:x>t', 'add-arrow', { partOf: 't', status: 'accepted', accepted: { ...accepted, changesProved: true } }),
        record('decl:D', 'declaration', shaky()),
        record('proof:t', 'result', { status: 'to-be-redone', redo: { because: [idOf('decl:D')], reverted: false, kind: 'cascade' } }),
      ],
      deps: { 'proof:t': ['decl:D'] },
      classes: { 'arrow:x>t': CHANGES },
      inferences: [{ target: 't', question: { sources: ['a', 'x'], fromNothing: false }, order: 0, steps: ['s1'] }],
      questionArrows: { 'proof:t': ['arrow:x>t'] },
      forced: { via: 'show-result', at: AT },
    });
    q = next(q, note(q, 'proof:t', 'Use the other lemma.'));
    const questioned = ok(decline(q, ['arrow:x>t'], 'plain'));
    expect(item(questioned, 'proof:t').redo).toMatchObject({ kind: 'question', note: 'Use the other lemma.' });
    // The judge's take-out of an item to be redone with its content kept, its dependent too, and a premise re-check.
    const records = recordsOf([
      record('decl:X', 'declaration', shaky()),
      record('decl:A', 'declaration', { status: 'to-be-redone', redo: { because: [idOf('decl:X')], reverted: false, kind: 'cascade', note: 'A note' } }),
      record('decl:C', 'declaration', { status: 'to-be-redone', redo: { because: [idOf('decl:X')], reverted: false, kind: 'cascade', note: 'C note' } }),
      record('premise:t:p', 'add-premise', { partOf: 't', status: 'to-be-redone', redo: { because: [idOf('decl:X')], reverted: false, kind: 'cascade', note: 'P note' } }),
    ]);
    const judgement = judgementOf([draft('decl:X', 'declaration'), draft('decl:A', 'declaration'), draft('decl:C', 'declaration'), draft('premise:t:p', 'add-premise', { partOfResult: 't' })], {
      deps: { 'decl:A': ['decl:X'], 'decl:C': ['decl:A'], 'premise:t:p': [] },
      problems: [{ code: 'no-longer-builds', text: 'A no longer builds', keys: ['decl:A'] }],
      premiseChecks: { 'premise:t:p': { closesGap: false, facts: {} } },
    });
    const out = reconcile({ runId: RUN, records, judgement, at: AT });
    expect(item(out.records, 'decl:A').redo).toMatchObject({ reverted: true, kind: 'judge', note: 'A note' });
    expect(item(out.records, 'decl:C').redo).toMatchObject({ reverted: true, kind: 'judge', note: 'C note' });
    expect(item(out.records, 'premise:t:p').redo).toMatchObject({ reverted: true, kind: 'judge', note: 'P note' });
  });

  it('goes when the item leaves to be redone: the automatic return, a decline of it, a new proposal; Undo of the note, then of its cause', () => {
    let s = scene();
    s = next(s, note(s, 'decl:Z', MULTI));
    // The automatic return: un-Shaky X brings Z back in review, without its note.
    const returned = ok(back(s, 'decl:X'));
    expect(item(returned, 'decl:Z').status).toBe('in-review');
    expect(item(returned, 'decl:Z').redo).toBeUndefined();
    // Its Undo restores Z to be redone with the note (the state the action recorded).
    expect(item(ok(undo(next(s, returned))), 'decl:Z').redo).toEqual({ because: [idOf('decl:X')], reverted: false, kind: 'cascade', note: MULTI });
    // A decline of Z itself: its own note is the decline's; the note to be redone goes, also when `redo` stays (reverted).
    const declined = ok(decline(s, ['decl:Z'], 'reject', 'Declined: gone.'));
    expect(item(declined, 'decl:Z')).toMatchObject({ status: 'declined', decline: { option: 'reject', note: 'Declined: gone.' } });
    expect(item(declined, 'decl:Z').redo).toBeUndefined();
    let r = stateOf({ items: [record('decl:V', 'declaration', { status: 'declined', decline: { option: 'reject', at: AT } }), record('decl:Z', 'declaration', redone(['decl:V'], { reverted: true })), record('card:m', 'formalize')], deps: { 'decl:Z': ['decl:V'] } });
    r = next(r, note(r, 'decl:Z', 'Kept out.'));
    const declinedOut = ok(decline(r, ['decl:Z'], 'shaky'));
    expect(item(declinedOut, 'decl:Z')).toMatchObject({ status: 'declined', redo: { because: [idOf('decl:V')], reverted: true, kind: 'cascade' } });
    expect(Object.hasOwn(item(declinedOut, 'decl:Z').redo as object, 'note')).toBe(false);
    // ... and its un-decline brings it back to be redone (its content still out, D2-60) with no note.
    const again = ok(back(next(r, declinedOut), 'decl:Z'));
    expect(item(again, 'decl:Z')).toMatchObject({ status: 'to-be-redone' });
    expect(Object.hasOwn(item(again, 'decl:Z').redo as object, 'note')).toBe(false);
    // A new proposal at a queue's end (reconcile): in review, no `redo`, no note.
    const records = recordsOf([record('decl:Z', 'declaration', { status: 'to-be-redone', redo: { because: [], reverted: true, kind: 'take-out', note: 'Redo it.' } })]);
    const proposed = reconcile({ runId: RUN, records, judgement: judgementOf([draft('decl:Z', 'declaration', { contentKey: 'fp:decl:Z:2' })]), queueSteps: ['s1'], at: AT });
    expect(item(proposed.records, 'decl:Z').status).toBe('in-review');
    expect(item(proposed.records, 'decl:Z').redo).toBeUndefined();
    // Undo of the note, then of the decline that took Z down: Z back in review, nothing left of the note.
    let u = stateOf({ items: [record('decl:X', 'declaration'), record('decl:Z', 'declaration'), record('card:m', 'formalize')], deps: { 'decl:Z': ['decl:X'] } });
    u = next(u, decline(u, ['decl:X'], 'shaky', 'X note'));
    u = next(u, note(u, 'decl:Z', 'Z note'));
    u = next(u, undo(u));
    u = next(u, undo(u));
    expect(statuses(u)).toMatchObject({ 'decl:X': 'in-review', 'decl:Z': 'in-review' });
    expect(item(u, 'decl:Z').redo).toBeUndefined();
    expect(item(u, 'decl:X').decline).toBeUndefined();
  });

  it('copyRedo, itemStateOf and the sweep: the note is copied with `redo`, and only a record to be redone keeps one', () => {
    const redo: Redo = { because: ['a'], reverted: true, kind: 'cascade', note: MULTI };
    expect(copyRedo(redo)).toEqual(redo);
    expect(itemStateOf(record('decl:Z', 'declaration', { status: 'to-be-redone', redo })).redo).toEqual(redo);
    const items = [
      record('decl:A', 'declaration', { status: 'to-be-redone', redo: { ...redo } }),
      record('decl:B', 'declaration', { status: 'declined', decline: { option: 'reject', at: AT }, redo: { ...redo } }),
      record('decl:C', 'declaration'),
    ];
    expect(dropStaleRedoNotes(items)).toEqual([idOf('decl:B')]);
    expect(items[0]?.redo?.note).toBe(MULTI);
    expect(items[1]?.redo).toEqual({ because: ['a'], reverted: true, kind: 'cascade' });
  });

  it('reconcile drops a note left on a record that is not to be redone (a hand-edited run.json, say), and keeps one on a record still to be redone', () => {
    const records = recordsOf([
      record('decl:B', 'declaration', { status: 'declined', decline: { option: 'reject', at: AT }, redo: { because: [], reverted: true, kind: 'cascade', note: 'stale' } }),
      record('decl:Z', 'declaration', { status: 'to-be-redone', redo: { because: [idOf('decl:B')], reverted: true, kind: 'cascade', note: 'kept' } }),
    ]);
    const out = reconcile({ runId: RUN, records, judgement: judgementOf([], { deps: { 'decl:Z': ['decl:B'] } }), at: AT });
    expect(item(out.records, 'decl:B').redo).toEqual({ because: [], reverted: true, kind: 'cascade' });
    expect(item(out.records, 'decl:Z').redo?.note).toBe('kept');
  });

  it('a record saved before 2j2 (no note anywhere) reduces as before', () => {
    const s = scene();
    const out = ok(decline(s, ['card:m'], 'shaky'));
    expect(item(out, 'decl:Z').redo).toEqual({ because: [idOf('decl:X')], reverted: false, kind: 'cascade' });
    expect(Object.hasOwn(item(out, 'decl:Z').redo as object, 'note')).toBe(false);
  });
});
