/**
 * Slice 2j1 (docs/slice2-plan.md 1.1's and 6.1's 2j1 entries; D2-76, the user's decision of turn 25, and D2-77–D2-82):
 * items to be redone.
 *   - D1: finished for the review: they keep no result hidden, and the force ends only when an item enters in review;
 *   - D2: never set back to review by hand (`redoneByClaude`), its content kept or taken out;
 *   - D3: the automatic return: when what took an item down is set back to review (un-Shaky, un-reject, an arrow's plain
 *     un-decline), the items to be redone because of it come back with it, transitively, to in review (a Shaky one to
 *     declined Shaky), unless something else keeps them down; never the other kinds (DO-0's question, the judge,
 *     Submit's take-out, RV-3 at a queue's end) nor a record saved before 2j1;
 *   - the kinds every writer records, and D2-80's complete `because` lists.
 */
import { describe, expect, it } from 'vitest';
import { reconcile } from '../../src/review/reconcile.js';
import { reduceReview } from '../../src/review/reducer.js';
import { applyItemState, copyRedo, isUndecided, itemStateOf } from '../../src/review/records.js';
import { resultsState } from '../../src/review/reveal.js';
import { REVIEW_TEXTS } from '../../src/review/texts.js';
import type { DeclineOption, ItemDecision, ItemRecord, ReviewOutcome, ReviewState } from '../../src/review/types.js';
import { AT, BELIEF, CHANGES, RUN, draft, idOf, item, judgementOf, next, record, recordsOf, stateOf, statuses, type Scene } from './helpers/records.js';

type Ok = Extract<ReviewOutcome, { ok: true }>;
type Redo = NonNullable<ItemRecord['redo']>;

const ok = (outcome: ReviewOutcome): Ok => {
  if (!outcome.ok) throw new Error(`${outcome.code}: ${'error' in outcome ? outcome.error : JSON.stringify(outcome.cascade)}`);
  return outcome;
};
/** One request: [key, to, option?] per decision, sent confirmed unless said. */
const decide = (s: ReviewState, decisions: Array<[string, ItemDecision['to'], DeclineOption?]>, confirmed = true): ReviewOutcome =>
  reduceReview(
    s,
    {
      kind: 'decide',
      decisions: decisions.map(([key, to, option]) => ({ item: idOf(key), rev: item(s, key).rev, to, ...(to === 'declined' ? { option: option ?? 'reject' } : {}) })),
      own: false,
      confirmed,
    },
    AT,
  );
const undo = (s: ReviewState): ReviewOutcome => reduceReview(s, { kind: 'undo', step: s.stack.done.at(-1)?.id ?? 0, confirmed: true }, AT);
const redo = (s: ReviewState): ReviewOutcome => reduceReview(s, { kind: 'redo', step: s.stack.undone.at(-1)?.id ?? 0, confirmed: true }, AT);
const shaky = (over: Partial<ItemRecord> = {}): Partial<ItemRecord> => ({ status: 'declined', decline: { option: 'shaky', at: AT }, ...over });
const rejected = (key: string): Partial<ItemRecord> => ({ status: 'declined', decline: { option: 'reject', at: AT }, rejectedFingerprints: [`fp:${key}`] });
const redone = (because: string[], over: Partial<Redo> = {}): Partial<ItemRecord> => ({ status: 'to-be-redone', redo: { because: because.map(idOf), reverted: false, kind: 'cascade', ...over } });
const accepted = { how: 'own' as const, fingerprint: 'fp', belief: false, changesProved: false, at: AT };
const shownIn = (s: Pick<ReviewState, 'items' | 'classesBeforeReveal' | 'forced'>) =>
  resultsState({ items: s.items, classesBeforeReveal: s.classesBeforeReveal, forced: s.forced }).shown;

describe('D1: an item to be redone is finished for the review (§4.7)', () => {
  it('isUndecided is "in review" only, whatever `redo` says', () => {
    expect(isUndecided({ status: 'in-review' })).toBe(true);
    for (const r of [
      { status: 'to-be-redone' as const, redo: { because: [], reverted: false } },
      { status: 'to-be-redone' as const, redo: { because: [], reverted: true, kind: 'cascade' as const } },
      { status: 'accepted' as const },
      { status: 'declined' as const, decline: { option: 'shaky' as const, at: AT } },
      { status: 'withdrawn' as const },
    ])
      expect(isUndecided(r), JSON.stringify(r)).toBe(false);
  });

  it('Show results’ force holds when a Shaky cascade makes a statement to be redone, and ends when it comes back in review', () => {
    let s = stateOf({
      items: [record('card:x', 'formalize', { status: 'accepted', accepted }), record('card:z', 'formalize', { status: 'accepted', accepted }), record('card:m', 'formalize'), record('proof:t', 'result')],
      deps: { 'card:z': ['card:x'] },
      forced: { via: 'show-result', at: AT },
    });
    const down = ok(decide(s, [['card:x', 'declined', 'shaky']]));
    expect(item(down, 'card:z')).toMatchObject({ status: 'to-be-redone', redo: { reverted: false, kind: 'cascade' } });
    expect(down.forced).toEqual({ via: 'show-result', at: AT });
    expect(down.stack.done.at(-1)).not.toHaveProperty('endedForce');
    s = next(s, down);
    const back = ok(decide(s, [['card:x', 'in-review']]));
    expect(statuses(back)).toMatchObject({ 'card:x': 'in-review', 'card:z': 'in-review' });
    expect(back.forced).toBeNull();
    expect(back.stack.done.at(-1)).toMatchObject({ endedForce: { via: 'show-result', at: AT } });
  });

  it('a decline whose cascade leaves only items to be redone shows the results, and D2-23 at that show can set telelean’s `decided` force (ADV-1)', () => {
    // decl:e is a belief only with the premise drafts (`classes`), and was accepted by a group as plain; card:s1 rests
    // on it. M is the last meaning item in review; Z rests on M.
    const scene: Scene = {
      items: [
        record('decl:M', 'declaration', { declKind: 'definition' }),
        record('card:z', 'formalize', { status: 'accepted', accepted }),
        record('decl:e', 'declaration', { declKind: 'definition', status: 'accepted', accepted: { ...accepted, how: 'group' } }),
        record('card:s1', 'formalize', { status: 'accepted', accepted }),
        record('proof:t', 'result'),
      ],
      deps: { 'card:z': ['decl:M'], 'card:s1': ['decl:e'] },
      classes: { 'decl:M': BELIEF, 'decl:e': BELIEF },
      classesBeforeReveal: { 'decl:M': BELIEF },
    };
    const s = stateOf(scene);
    expect(shownIn(s)).toBe(false);
    const out = ok(decide(s, [['decl:M', 'declined', 'shaky']]));
    // Z is to be redone, which waits for nothing: the action shows the results, so `classes` is in force and decl:e
    // (with card:s1) returns to review; that alone would hide them again, so telelean's force keeps them shown.
    expect(item(out, 'card:z')).toMatchObject({ status: 'to-be-redone', redo: { kind: 'cascade' } });
    expect(statuses(out)).toMatchObject({ 'decl:e': 'in-review', 'card:s1': 'in-review' });
    expect(out.forced).toEqual({ via: 'decided', at: AT });
    expect(out.stack.done.at(-1)).toMatchObject({ startedForce: { via: 'decided', at: AT } });
  });
});

describe('D2: no Back to review by hand (§4.6)', () => {
  it('is refused on every item to be redone, kept or taken out, of every kind and none, with the same text; Decline stays open', () => {
    const kinds: Array<Redo['kind']> = ['cascade', 'question', 'judge', 'take-out', 'queue', undefined];
    for (const kind of kinds) {
      for (const reverted of [false, true]) {
        const s = stateOf({ items: [record('decl:X', 'declaration', shaky()), record('decl:Z', 'declaration', { status: 'to-be-redone', redo: { because: [idOf('decl:X')], reverted, ...(kind !== undefined ? { kind } : {}) } })] });
        const where = `${kind ?? 'none'} ${reverted}`;
        expect(decide(s, [['decl:Z', 'in-review']]), where).toEqual({ ok: false, code: 'refused', error: REVIEW_TEXTS.redoneByClaude, item: idOf('decl:Z') });
        expect(ok(decide(s, [['decl:Z', 'declined', 'reject']])).items.find((r) => r.key === 'decl:Z')?.status, where).toBe('declined');
      }
    }
  });
});

describe('D3: the automatic return (§4.6; D2-76, D2-78, D2-79)', () => {
  it('un-Shaky brings back what is to be redone because of it, transitively, to in review, with no write; the notice lists them', () => {
    // W is to be redone because of Y (its cause, set by the DO-0 or RV-3 chains), Y because of X.
    const s = stateOf({
      items: [record('decl:X', 'declaration', shaky()), record('decl:Y', 'declaration', redone(['decl:X'])), record('decl:W', 'declaration', redone(['decl:Y'])), record('decl:O', 'declaration')],
      deps: { 'decl:Y': ['decl:X'], 'decl:W': ['decl:Y'] },
    });
    const out = ok(decide(s, [['decl:X', 'in-review']]));
    expect(statuses(out)).toEqual({ 'decl:X': 'in-review', 'decl:Y': 'in-review', 'decl:W': 'in-review', 'decl:O': 'in-review' });
    for (const key of ['decl:Y', 'decl:W']) {
      expect(item(out, key).redo, key).toBeUndefined();
      expect(item(out, key).accepted, key).toBeUndefined();
    }
    expect(out.write).toBeNull();
    expect(out.cascade).toEqual([
      { item: idOf('decl:Y'), to: 'in-review', why: 'it depends on Definition X' },
      { item: idOf('decl:W'), to: 'in-review', why: 'it depends on Definition Y' },
    ]);
    expect(out.events).toEqual([{ text: REVIEW_TEXTS.eventBackWith, items: [idOf('decl:Y'), idOf('decl:W')] }]);
    expect(out.label).toBe('Back to review: Definition X');
    // Every touched record is on the stack: its Undo gives back the records it started from, its Redo does it again.
    const after = next(s, out);
    expect(ok(undo(after)).items).toEqual(s.items);
    expect(ok(redo(next(after, ok(undo(after))))).items).toEqual(out.items);
  });

  it('a single item, and none: an un-Shaky with nothing to be redone because of it changes only itself', () => {
    const s = stateOf({ items: [record('decl:X', 'declaration', shaky()), record('decl:Z', 'declaration', redone(['decl:Q'])), record('decl:Q', 'declaration', shaky())] });
    const out = ok(decide(s, [['decl:X', 'in-review']]));
    expect(out.stack.done.at(-1)).toMatchObject({ changes: [{ item: idOf('decl:X') }] });
    expect(item(out, 'decl:Z')).toEqual(item(s, 'decl:Z'));
    expect(out.events).toEqual([]);
  });

  it('un-reject brings back with its merge what its commit took out: a Shaky dependent comes back to declined Shaky, with its note', () => {
    let s = stateOf({ items: [record('vocab:V', 'vocabulary-term'), record('decl:D', 'declaration', shaky({ decline: { option: 'shaky', note: 'too strong', at: AT } })), record('decl:E', 'declaration')], deps: { 'decl:D': ['vocab:V'], 'decl:E': ['vocab:V'] } });
    s = next(s, ok(decide(s, [['vocab:V', 'declined', 'reject']])));
    expect(item(s, 'decl:D')).toMatchObject({ status: 'to-be-redone', decline: { option: 'shaky', note: 'too strong' }, redo: { because: [idOf('vocab:V')], reverted: true, kind: 'cascade' } });
    const out = ok(decide(s, [['vocab:V', 'in-review']]));
    expect(item(out, 'decl:D')).toMatchObject({ status: 'declined', decline: { option: 'shaky', note: 'too strong' } });
    expect(item(out, 'decl:D').redo).toBeUndefined();
    expect(item(out, 'decl:E').status).toBe('in-review');
    // Both come back into ws/ with the merge (a declined Shaky item's content is in ws/).
    expect(out.write).toEqual({ action: 2, revert: [], reapply: ['vocab:V', 'decl:D', 'decl:E'].map(idOf), premises: { write: [], takeOut: [] } });
    expect(out.events).toEqual([
      { text: REVIEW_TEXTS.eventBackWith, items: [idOf('decl:E')] },
      { text: REVIEW_TEXTS.eventBackShakyWith, items: [idOf('decl:D')] },
    ]);
  });

  it('an arrow’s plain un-decline brings back the Result its proof uses, to in review, never to accepted (RV-5)', () => {
    let s = stateOf({
      items: [record('arrow:x>t', 'add-arrow', { partOf: 't', status: 'accepted', accepted: { ...accepted, changesProved: true } }), record('proof:t', 'result', { status: 'accepted', accepted })],
      deps: { 'proof:t': ['arrow:x>t'] },
      classes: { 'arrow:x>t': CHANGES },
    });
    s = next(s, ok(decide(s, [['arrow:x>t', 'declined', 'plain']])));
    expect(item(s, 'proof:t')).toMatchObject({ status: 'to-be-redone', redo: { because: [idOf('arrow:x>t')], reverted: true, kind: 'cascade' } });
    const out = ok(decide(s, [['arrow:x>t', 'in-review']]));
    expect(statuses(out)).toEqual({ 'arrow:x>t': 'in-review', 'proof:t': 'in-review' });
    expect(item(out, 'proof:t').accepted).toBeUndefined();
    expect(out.rejectedArrows).toEqual([]);
    expect(out.write?.reapply).toEqual([idOf('arrow:x>t'), idOf('proof:t')]);
  });

  describe('two causes: a Shaky decline of X and a Reject of Y both took Z down', () => {
    const scene: Scene = { items: [record('decl:X', 'declaration'), record('decl:Y', 'declaration'), record('decl:Z', 'declaration')], deps: { 'decl:Z': ['decl:X', 'decl:Y'] } };
    const both = (first: 'shaky' | 'reject'): ReviewState => {
      let s = stateOf(scene);
      const order: Array<[string, DeclineOption]> = first === 'shaky' ? [['decl:X', 'shaky'], ['decl:Y', 'reject']] : [['decl:Y', 'reject'], ['decl:X', 'shaky']];
      for (const [key, option] of order) s = next(s, ok(decide(s, [[key, 'declined', option]])));
      return s;
    };

    it('in either order Z lists both (D2-80); un-Shaky X leaves it to be redone, Y keeping it out; un-reject Y then brings it back', () => {
      for (const first of ['shaky', 'reject'] as const) {
        const s = both(first);
        expect([...(item(s, 'decl:Z').redo?.because ?? [])].sort(), first).toEqual([idOf('decl:X'), idOf('decl:Y')].sort());
        expect(item(s, 'decl:Z').redo, first).toMatchObject({ reverted: true, kind: 'cascade' });
        const x = ok(decide(s, [['decl:X', 'in-review']]));
        expect(item(x, 'decl:Z'), first).toMatchObject({ status: 'to-be-redone', redo: { because: [idOf('decl:Y')], reverted: true, kind: 'cascade' } });
        expect(x.write, first).toBeNull();
        expect(x.events, first).toEqual([]);
        const y = ok(decide(next(s, x), [['decl:Y', 'in-review']]));
        expect(statuses(y), first).toEqual({ 'decl:X': 'in-review', 'decl:Y': 'in-review', 'decl:Z': 'in-review' });
        expect(y.write?.reapply, first).toEqual([idOf('decl:Y'), idOf('decl:Z')]);
      }
    });

    it('the other way round: un-reject Y brings Z’s content back, still to be redone (X’s Shaky keeps it down, not out); un-Shaky X then brings it back', () => {
      const s = both('shaky');
      const y = ok(decide(s, [['decl:Y', 'in-review']]));
      expect(item(y, 'decl:Z')).toMatchObject({ status: 'to-be-redone', redo: { because: [idOf('decl:X')], reverted: false, kind: 'cascade' } });
      expect(y.write).toEqual({ action: 3, revert: [], reapply: [idOf('decl:Y'), idOf('decl:Z')], premises: { write: [], takeOut: [] } });
      const x = ok(decide(next(s, y), [['decl:X', 'in-review']]));
      expect(item(x, 'decl:Z').status).toBe('in-review');
      expect(x.write).toBeNull();
    });

    it('both set back in one request: Z comes back with them', () => {
      const out = ok(decide(both('reject'), [['decl:X', 'in-review'], ['decl:Y', 'in-review']]));
      expect(statuses(out)).toEqual({ 'decl:X': 'in-review', 'decl:Y': 'in-review', 'decl:Z': 'in-review' });
    });
  });

  it('a decline in the same request keeps an item down, in either order', () => {
    const s = stateOf({ items: [record('decl:X', 'declaration', shaky()), record('decl:Y', 'declaration'), record('decl:Z', 'declaration', redone(['decl:X']))], deps: { 'decl:Z': ['decl:X', 'decl:Y'] } });
    for (const order of [
      [['decl:X', 'in-review'], ['decl:Y', 'declined', 'shaky']],
      [['decl:Y', 'declined', 'shaky'], ['decl:X', 'in-review']],
    ] as Array<Array<[string, ItemDecision['to'], DeclineOption?]>>) {
      const out = ok(decide(s, order));
      expect(item(out, 'decl:Z')).toMatchObject({ status: 'to-be-redone', redo: { because: [idOf('decl:Y')], reverted: false, kind: 'cascade' } });
    }
  });

  it('a dependency that keeps it down, not yet in `because`, joins it (D2-80)', () => {
    const s = stateOf({ items: [record('decl:X', 'declaration', shaky()), record('decl:D', 'declaration', shaky()), record('decl:Z', 'declaration', redone(['decl:X']))], deps: { 'decl:Z': ['decl:X', 'decl:D'] } });
    const out = ok(decide(s, [['decl:X', 'in-review']]));
    expect(item(out, 'decl:Z')).toMatchObject({ status: 'to-be-redone', redo: { because: [idOf('decl:D')], reverted: false, kind: 'cascade' } });
    // Un-Shaky D then brings it back.
    expect(item(ok(decide(next(s, out), [['decl:D', 'in-review']])), 'decl:Z').status).toBe('in-review');
  });

  it('a cause that does not hold up keeps it down from `because` alone (after a judge, an item has no dependency it could read): declined, to be redone, an Add premise back in review', () => {
    const cases: Array<[string, ItemRecord]> = [
      ['declined Shaky', record('decl:C', 'declaration', shaky())],
      ['to be redone (the judge)', record('decl:C', 'declaration', redone([], { kind: 'judge', reverted: true }))],
      ['an Add premise in review, not written', record('premise:t:c', 'add-premise', { partOf: 't' })],
      ['withdrawn', record('decl:C', 'declaration', { status: 'withdrawn' })],
    ];
    for (const [what, cause] of cases) {
      const s = stateOf({ items: [record('decl:X', 'declaration', shaky()), cause, record('decl:Z', 'declaration', redone(['decl:X', cause.key]))] });
      const out = ok(decide(s, [['decl:X', 'in-review']]));
      expect(item(out, 'decl:Z'), what).toMatchObject({ status: 'to-be-redone', redo: { because: [cause.id], reverted: false, kind: 'cascade' } });
    }
    // A cause that holds up (in review or accepted, in ws/) keeps nothing down: back in review.
    for (const status of ['in-review', 'accepted'] as const) {
      const cause = record('decl:C', 'declaration', { status, ...(status === 'accepted' ? { accepted } : {}) });
      const s = stateOf({ items: [record('decl:X', 'declaration', shaky()), cause, record('decl:Z', 'declaration', redone(['decl:X', 'decl:C']))] });
      expect(item(ok(decide(s, [['decl:X', 'in-review']])), 'decl:Z').status, status).toBe('in-review');
    }
  });

  it('after the judge left the reverted item no dependency, an un-reject whose merge brings it back still reads its other cause: content back, still to be redone', () => {
    let s = stateOf({ items: [record('decl:X', 'declaration'), record('decl:Y', 'declaration'), record('decl:Z', 'declaration')], deps: { 'decl:Z': ['decl:X', 'decl:Y'] } });
    s = next(s, ok(decide(s, [['decl:X', 'declined', 'shaky']])));
    s = next(s, ok(decide(s, [['decl:Y', 'declined', 'reject']])));
    // The judge after the Reject: Z's content is out, so the judgement gives it no dependency.
    s = { ...s, deps: { ...s.deps, [idOf('decl:Z')]: [] } };
    const out = ok(decide(s, [['decl:Y', 'in-review']]));
    expect(item(out, 'decl:Z')).toMatchObject({ status: 'to-be-redone', redo: { because: [idOf('decl:X')], reverted: false, kind: 'cascade' } });
    expect(out.write?.reapply).toEqual([idOf('decl:Y'), idOf('decl:Z')]);
  });

  it('a written Add premise declined as Shaky, then taken out by a Reject of what it rests on, comes back with the un-reject to declined Shaky, written again', () => {
    const written = record('premise:t:p', 'add-premise', {
      partOf: 't',
      status: 'declined',
      decline: { option: 'shaky', note: 'unsure', at: AT },
      card: 'p-card',
      fingerprint: 'fp:written-p',
    });
    let s = stateOf({ items: [record('vocab:V', 'vocabulary-term', { status: 'accepted', accepted }), written, record('proof:t', 'result')], deps: { 'premise:t:p': ['vocab:V'] }, classes: { 'premise:t:p': BELIEF } });
    const rejected = ok(decide(s, [['vocab:V', 'declined', 'reject']]));
    expect(rejected.write?.premises.takeOut).toEqual([idOf('premise:t:p')]);
    s = next(s, rejected);
    // The runner's step 4: the take-out recorded on the action, the record without its card, its draft key again.
    const done = [...s.stack.done];
    const top = done[done.length - 1] as Extract<ReviewState['stack']['done'][number], { kind: 'decide' }>;
    done[done.length - 1] = {
      ...top,
      commits: ['c1'],
      takenOut: [{ item: idOf('premise:t:p'), card: 'p-card', fingerprint: 'fp:written-p', ledger: [{ kind: 'premise', card: 'p-card', target: 't', holdAs: 'axiom', item: 'premise:t:p', commit: 'c0' }] }],
    };
    s = { ...s, stack: { done, undone: [] }, items: s.items.map((r) => (r.key === 'premise:t:p' ? { ...r, card: undefined, fingerprint: 'fp:draft-p' } : r)) };
    expect(item(s, 'premise:t:p')).toMatchObject({ status: 'to-be-redone', decline: { option: 'shaky', note: 'unsure' }, redo: { reverted: true, kind: 'cascade' } });
    const out = ok(decide(s, [['vocab:V', 'in-review']]));
    expect(item(out, 'premise:t:p')).toMatchObject({ status: 'declined', decline: { option: 'shaky', note: 'unsure' }, card: 'p-card', fingerprint: 'fp:written-p' });
    expect(item(out, 'premise:t:p').redo).toBeUndefined();
    expect(out.write).toEqual({ action: 2, revert: [], reapply: [idOf('vocab:V'), idOf('premise:t:p')], premises: { write: [], takeOut: [] } });
    expect(out.events).toEqual([{ text: REVIEW_TEXTS.eventBackShakyWith, items: [idOf('premise:t:p')] }]);
  });

  it('a cycle comes back together (a greatest fixpoint), and so do many items at once', () => {
    const items = [record('decl:X', 'declaration', shaky()), record('decl:Z1', 'declaration', redone(['decl:X'])), record('decl:Z2', 'declaration', redone(['decl:X']))];
    const many = Array.from({ length: 6 }, (_, k) => record(`decl:M${k}`, 'declaration', redone(['decl:X'])));
    const s = stateOf({
      items: [...items, ...many],
      deps: { 'decl:Z1': ['decl:X', 'decl:Z2'], 'decl:Z2': ['decl:Z1'], ...Object.fromEntries(many.map((r, k) => [r.key, k === 0 ? ['decl:X'] : [`decl:M${k - 1}`]])) },
    });
    const out = ok(decide(s, [['decl:X', 'in-review']]));
    expect(out.items.every((r) => r.status === 'in-review')).toBe(true);
    expect(out.events).toEqual([{ text: REVIEW_TEXTS.eventBackWith, items: out.items.filter((r) => r.key !== 'decl:X').map((r) => r.id) }]);
  });

  it('a Shaky item that comes back to declined Shaky keeps its own dependents to be redone (Fixer 2j1 r1, F-F1/ADV-1): they list it, and Undo and Redo give back each state', () => {
    // P; X rests on P; Y rests on X. Shaky X, then Reject P: X and Y are to be redone (Y: because X and P).
    let s = stateOf({ items: [record('decl:P', 'declaration'), record('decl:X', 'declaration'), record('decl:Y', 'declaration')], deps: { 'decl:X': ['decl:P'], 'decl:Y': ['decl:X'] } });
    s = next(s, ok(decide(s, [['decl:X', 'declined', 'shaky']])));
    s = next(s, ok(decide(s, [['decl:P', 'declined', 'reject']])));
    expect(statuses(s)).toEqual({ 'decl:P': 'declined', 'decl:X': 'to-be-redone', 'decl:Y': 'to-be-redone' });
    expect([...(item(s, 'decl:Y').redo?.because ?? [])].sort()).toEqual([idOf('decl:P'), idOf('decl:X')].sort());
    const out = ok(decide(s, [['decl:P', 'in-review']]));
    // X keeps its Shaky decline; Y stays to be redone because of X, its content back with the merge.
    expect(statuses(out)).toEqual({ 'decl:P': 'in-review', 'decl:X': 'declined', 'decl:Y': 'to-be-redone' });
    expect(item(out, 'decl:X').decline?.option).toBe('shaky');
    expect(item(out, 'decl:Y').redo).toEqual({ because: [idOf('decl:X')], reverted: false, kind: 'cascade' });
    expect(out.events).toEqual([{ text: REVIEW_TEXTS.eventBackShakyWith, items: [idOf('decl:X')] }]);
    const after = next(s, out);
    expect(ok(undo(after)).items).toEqual(s.items);
    expect(ok(redo(next(after, ok(undo(after))))).items).toEqual(out.items);
    // Un-Shaky X then brings Y back to review.
    expect(statuses(ok(decide(after, [['decl:X', 'in-review']])))).toEqual({ 'decl:P': 'in-review', 'decl:X': 'in-review', 'decl:Y': 'in-review' });
  });

  it('an item rejected while a cascade casualty, its cause un-rejected first, then un-rejected itself, lists no cause that holds up (Fixer 2j1 r1, A-ADV-2)', () => {
    let s = stateOf({ items: [record('decl:P', 'declaration'), record('decl:X', 'declaration')], deps: { 'decl:X': ['decl:P'] } });
    s = next(s, ok(decide(s, [['decl:P', 'declined', 'reject']])));
    s = next(s, ok(decide(s, [['decl:X', 'declined', 'reject']])));
    s = next(s, ok(decide(s, [['decl:P', 'in-review']])));
    expect(item(s, 'decl:X').status).toBe('declined');
    const out = ok(decide(s, [['decl:X', 'in-review']]));
    // Its content is still out of ws/ (only Claude brings it back), so it stays to be redone; P is in review, so it is no cause.
    expect(item(out, 'decl:X')).toMatchObject({ status: 'to-be-redone', redo: { because: [], reverted: true, kind: 'cascade' } });
    // The other order returns it to review (existing behaviour), and a cause still declined stays listed.
    const still = stateOf({ items: [record('decl:P', 'declaration'), record('decl:X', 'declaration')], deps: { 'decl:X': ['decl:P'] } });
    let t = next(still, ok(decide(still, [['decl:P', 'declined', 'reject']])));
    t = next(t, ok(decide(t, [['decl:X', 'declined', 'reject']])));
    const listed = ok(decide(t, [['decl:X', 'in-review']]));
    expect(item(listed, 'decl:X')).toMatchObject({ status: 'to-be-redone', redo: { because: [idOf('decl:P')] } });
  });

  it('an item that comes back is not accepted by the same request: a group leaves it as not in review, and accepts the rest (D2-87)', () => {
    // Z rests on X; X's Reject took Z out, and the judge after it left Z no dependency (its content is out of the judged
    // state), so without D2-87 a group in the un-reject's own request would accept Z with no RV-5 check at all.
    let s = stateOf({ items: [record('decl:X', 'declaration'), record('decl:Z', 'declaration'), record('decl:Y', 'declaration')], deps: { 'decl:Z': ['decl:X'] } });
    s = next(s, ok(decide(s, [['decl:X', 'declined', 'reject']])));
    s = { ...s, deps: { ...s.deps, [idOf('decl:Z')]: [] } };
    const out = ok(decide(s, [['decl:X', 'in-review'], ['decl:Z', 'accepted'], ['decl:Y', 'accepted']]));
    expect(statuses(out)).toEqual({ 'decl:X': 'in-review', 'decl:Z': 'in-review', 'decl:Y': 'accepted' });
    expect(out.left).toEqual([{ item: idOf('decl:Z'), reason: 'not-in-review' }]);
    expect(out.taken).toEqual([idOf('decl:X'), idOf('decl:Y')]);
    // In a request of its own, after the judge that gives it its dependency again, it waits for X, as by hand (RV-5).
    const later = { ...next(s, out), deps: { ...s.deps, [idOf('decl:Z')]: [idOf('decl:X')] } };
    expect(ok(decide(later, [['decl:Z', 'accepted']])).left).toEqual([{ item: idOf('decl:Z'), reason: 'depends' }]);
  });

  it('a record of another kind, or with none (saved before 2j1), never comes back by itself; nothing of it is touched (D2-77)', () => {
    const others: Array<[string, Partial<Redo>, string[]]> = [
      ['decl:Q', { kind: 'question' }, []],
      ['decl:J', { kind: 'judge', reverted: true }, ['no-longer-builds']],
      ['decl:T', { kind: 'take-out', reverted: true }, []],
      ['decl:R', { kind: 'queue' }, []],
    ];
    const old = record('decl:O', 'declaration', { status: 'to-be-redone', redo: { because: [idOf('decl:X')], reverted: false } });
    const s = stateOf({
      items: [record('decl:X', 'declaration', shaky()), ...others.map(([key, over, markers]) => record(key, 'declaration', { ...redone(['decl:X'], over), markers: markers as ItemRecord['markers'] })), old],
      deps: Object.fromEntries([...others.map(([key]) => key), 'decl:O'].map((key) => [key, ['decl:X']])),
    });
    const out = ok(decide(s, [['decl:X', 'in-review']]));
    for (const r of s.items) if (r.key !== 'decl:X') expect(item(out, r.key), r.key).toEqual(r);
    expect(out.stack.done.at(-1)).toMatchObject({ changes: [{ item: idOf('decl:X') }] });
  });

  it('DO-0’s question change: the Result and what rests on it never come back with the arrow, also when its proof used the arrow (D2-81)', () => {
    for (const uses of [false, true]) {
      let s = stateOf({
        items: [
          record('arrow:x>t', 'add-arrow', { partOf: 't', status: 'accepted', accepted: { ...accepted, changesProved: true } }),
          record('proof:t', 'result', { status: 'accepted', accepted }),
          record('proof:u', 'result', { status: 'accepted', accepted }),
        ],
        deps: { 'proof:u': ['proof:t'], ...(uses ? { 'proof:t': ['arrow:x>t'] } : {}) },
        classes: { 'arrow:x>t': CHANGES },
        inferences: [
          { target: 't', question: { sources: ['a', 'x'], fromNothing: false }, order: 0, steps: ['s1'] },
          { target: 'u', question: { sources: ['t'], fromNothing: false }, order: 1, steps: ['s2'] },
        ],
        questionArrows: { 'proof:t': ['arrow:x>t'] },
      });
      s = next(s, ok(decide(s, [['arrow:x>t', 'declined', 'plain']])));
      const where = uses ? 'its proof used the arrow' : 'its proof did not';
      expect(item(s, 'proof:t').redo, where).toEqual({ because: [idOf('arrow:x>t')], reverted: uses, kind: 'question' });
      expect(item(s, 'proof:u').redo?.because, where).toContain(idOf('proof:t'));
      const out = ok(decide(s, [['arrow:x>t', 'in-review']]));
      expect(statuses(out), where).toEqual({ 'arrow:x>t': 'in-review', 'proof:t': 'to-be-redone', 'proof:u': 'to-be-redone' });
      expect(item(out, 'proof:t'), where).toEqual(item(s, 'proof:t'));
      expect(item(out, 'proof:u').redo?.because, where).toEqual([idOf('proof:t')]);
      // The question keeps its change (only Undo puts the source back).
      expect(out.inferences[0]?.question.sources, where).toEqual(['a']);
      if (uses) expect(out.write?.revert, where).toEqual([idOf('proof:t'), idOf('proof:u')]);
    }
  });

  it('an un-declined item that holds nothing up releases nothing: an Add premise back in review (outside ws/), an item back to be redone (D2-79)', () => {
    // X's content was taken out by V's Reject before X itself was rejected: its un-reject sends it back to be redone.
    let s = stateOf({
      items: [record('vocab:V', 'vocabulary-term', rejected('vocab:V')), record('decl:X', 'declaration', redone(['vocab:V'], { reverted: true })), record('decl:Z', 'declaration')],
      deps: { 'decl:X': ['vocab:V'], 'decl:Z': ['decl:X'] },
    });
    s = next(s, ok(decide(s, [['decl:X', 'declined', 'reject']])));
    expect(item(s, 'decl:Z')).toMatchObject({ status: 'to-be-redone', redo: { because: [idOf('decl:X')], reverted: true } });
    const out = ok(decide(s, [['decl:X', 'in-review']]));
    expect(item(out, 'decl:X').status).toBe('to-be-redone');
    expect(item(out, 'decl:Z')).toEqual(item(s, 'decl:Z'));
  });

  it('a hidden Result comes back silently: no cascade entry, event, label or left reason names it (D2-64)', () => {
    // M is in review, so the results are hidden; X is a listed statement, declined Shaky; t's Result rests on it.
    const s = stateOf({
      items: [record('card:m', 'formalize'), record('card:x', 'formalize', shaky()), record('proof:t', 'result', redone(['card:x']))],
      deps: { 'proof:t': ['card:x'] },
    });
    expect(shownIn(s)).toBe(false);
    const out = ok(decide(s, [['card:x', 'in-review']]));
    expect(item(out, 'proof:t').status).toBe('in-review');
    const R = idOf('proof:t');
    expect(JSON.stringify({ cascade: out.cascade, events: out.events, label: out.label, taken: out.taken, left: out.left })).not.toContain(R);
    // Its Undo restores it as silently.
    const back = ok(undo(next(s, out)));
    expect(item(back, 'proof:t')).toEqual(item(s, 'proof:t'));
    expect(JSON.stringify({ cascade: back.cascade, events: back.events })).not.toContain(R);
  });

  it('with the results shown, a statement that comes back is undecided again: they hide, and no Result is named', () => {
    const s = stateOf({
      items: [record('card:x', 'formalize', shaky()), record('card:z', 'formalize', redone(['card:x'])), record('proof:t', 'result', redone(['card:z']))],
      deps: { 'card:z': ['card:x'], 'proof:t': ['card:z'] },
    });
    expect(shownIn(s)).toBe(true);
    const out = ok(decide(s, [['card:x', 'in-review']]));
    expect(statuses(out)).toEqual({ 'card:x': 'in-review', 'card:z': 'in-review', 'proof:t': 'in-review' });
    expect(shownIn({ ...s, items: out.items, forced: out.forced })).toBe(false);
    expect(out.events).toEqual([{ text: REVIEW_TEXTS.eventBackWith, items: [idOf('card:z')] }]);
    expect(out.cascade.map((c) => c.item)).toEqual([idOf('card:z')]);
  });
});

describe('the kinds every writer records (D2-77, D2-80)', () => {
  it('itemStateOf and applyItemState keep `kind`, and a record with none stays with none', () => {
    for (const redo of [{ because: ['a'], reverted: true, kind: 'judge' as const }, { because: ['a'], reverted: false }]) {
      const r = record('decl:Z', 'declaration', { status: 'to-be-redone', redo });
      const state = itemStateOf(r);
      expect(state.redo).toEqual(redo);
      expect(Object.hasOwn(state.redo as object, 'kind')).toBe('kind' in redo);
      const into = record('decl:Z', 'declaration');
      applyItemState(into, state);
      expect(into.redo).toEqual(redo);
      expect(copyRedo(redo)).toEqual(redo);
      expect(copyRedo(redo)).not.toBe(redo);
    }
  });

  it('reconcile: the judge’s reverts and their dependents are `judge`, a dependent taken out already gets the reverted item in `because`; a premise re-check is `judge`', () => {
    const records = recordsOf([
      record('decl:X', 'declaration', rejected('decl:X')),
      record('decl:A', 'declaration'),
      record('decl:B', 'declaration', redone(['decl:X'], { reverted: true })),
      record('decl:C', 'declaration'),
      record('premise:t:p', 'add-premise', { partOf: 't' }),
    ]);
    const judgement = judgementOf([draft('decl:A', 'declaration'), draft('decl:C', 'declaration'), draft('premise:t:p', 'add-premise', { partOfResult: 't' })], {
      deps: { 'decl:A': [], 'decl:B': ['decl:A'], 'decl:C': ['decl:A'], 'premise:t:p': [] },
      problems: [{ code: 'no-longer-builds', text: 'A no longer builds', keys: ['decl:A'] }],
      premiseChecks: { 'premise:t:p': { closesGap: false, facts: {} } },
    });
    const out = reconcile({ runId: RUN, records, judgement, at: AT });
    expect(item(out.records, 'decl:A')).toMatchObject({ status: 'to-be-redone', redo: { because: [], reverted: true, kind: 'judge' }, markers: ['no-longer-builds'] });
    expect(item(out.records, 'decl:C')).toMatchObject({ status: 'to-be-redone', redo: { because: [idOf('decl:A')], reverted: true, kind: 'judge' } });
    expect(item(out.records, 'decl:B').redo).toEqual({ because: [idOf('decl:X'), idOf('decl:A')], reverted: true, kind: 'cascade' });
    expect(item(out.records, 'premise:t:p')).toMatchObject({ status: 'to-be-redone', redo: { because: [], reverted: true, kind: 'judge' }, markers: ['no-longer-closes-gap'] });
    // An un-reject of X now leaves B to be redone: A, which the judge took out, still keeps it down.
    const s = stateOf({ items: out.records.items, deps: { 'decl:B': ['decl:A'], 'decl:C': ['decl:A'] } });
    expect(item(ok(decide(s, [['decl:X', 'in-review']])), 'decl:B')).toMatchObject({ status: 'to-be-redone', redo: { because: [idOf('decl:A')] } });
  });
});
