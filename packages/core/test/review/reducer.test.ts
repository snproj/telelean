/**
 * Slice 2a2 (docs/slice2-plan.md 4.6, 6.1): the reducer: statuses, cascades, groups (RV-8) and the session stack
 * (UN-4–UN-6), on synthetic records.
 */
import { describe, expect, it } from 'vitest';
import { reconcile } from '../../src/review/reconcile.js';
import { acceptGate, planGroupAccept, planGroupDecline, reduceReview } from '../../src/review/reducer.js';
import { depsById, inWorkingCopy } from '../../src/review/records.js';
import { resultsState } from '../../src/review/reveal.js';
import { componentOf } from '../../src/review/scc.js';
import { REVIEW_TEXTS } from '../../src/review/texts.js';
import type { GroupItem, ItemClass, ItemDecision, ItemRecord, LedgerEntry, ReviewOutcome, ReviewState, SessionAction } from '../../src/review/types.js';
import {
  AT,
  BELIEF,
  CHANGES,
  PLAIN,
  RUN,
  draft,
  idOf,
  inferenceJudgement,
  item,
  judgementOf,
  next,
  record,
  recordsOf,
  stateOf,
  statuses,
  type Scene,
} from './helpers/records.js';

const accept = (state: ReviewState, key: string, own = true, extra: Partial<ItemDecision> = {}, confirmed = false): ReviewOutcome =>
  reduceReview(state, { kind: 'decide', decisions: [{ item: idOf(key), rev: item(state, key).rev, to: 'accepted', ...extra }], own, confirmed }, AT);
const decline = (state: ReviewState, key: string, option: ItemDecision['option'], confirmed = false, note?: string): ReviewOutcome =>
  reduceReview(
    state,
    { kind: 'decide', decisions: [{ item: idOf(key), rev: item(state, key).rev, to: 'declined', ...(option ? { option } : {}), ...(note ? { note } : {}) }], own: false, confirmed },
    AT,
  );
const review = (state: ReviewState, key: string, confirmed = false): ReviewOutcome =>
  reduceReview(state, { kind: 'decide', decisions: [{ item: idOf(key), rev: item(state, key).rev, to: 'in-review' }], own: false, confirmed }, AT);
const group = (state: ReviewState, keys: string[]): ReviewOutcome =>
  reduceReview(state, { kind: 'decide', decisions: keys.map((key) => ({ item: idOf(key), rev: item(state, key).rev, to: 'accepted' as const })), own: false, confirmed: false }, AT);
const undo = (state: ReviewState, confirmed = true): ReviewOutcome =>
  reduceReview(state, { kind: 'undo', step: state.stack.done[state.stack.done.length - 1]?.id ?? 0, confirmed }, AT);
const redo = (state: ReviewState, confirmed = true): ReviewOutcome =>
  reduceReview(state, { kind: 'redo', step: state.stack.undone[state.stack.undone.length - 1]?.id ?? 0, confirmed }, AT);
const ok = (outcome: ReviewOutcome) => {
  if (!outcome.ok) throw new Error(`${outcome.code}: ${'error' in outcome ? outcome.error : JSON.stringify(outcome.cascade)}`);
  return outcome;
};
const error = (outcome: ReviewOutcome) => (outcome.ok ? 'ok' : `${outcome.code}: ${'error' in outcome ? outcome.error : ''}`);
const set = (state: ReviewState, key: string, over: Partial<ItemRecord>): ReviewState => ({
  ...state,
  items: state.items.map((r) => (r.key === key ? { ...r, ...over } : r)),
});
const accepted = (how: 'own' | 'group' = 'own', extra: Partial<NonNullable<ItemRecord['accepted']>> = {}): NonNullable<ItemRecord['accepted']> => ({
  how,
  fingerprint: 'fp',
  belief: false,
  changesProved: false,
  at: AT,
  ...extra,
});
/** A written Add premise for target t, accepted as an axiom, its card written, its record holding the written key. */
const writtenPremise = (name: string, extra: Partial<ItemRecord> = {}): ItemRecord =>
  record(`premise:t:${name}`, 'add-premise', {
    partOf: 't',
    status: 'accepted',
    accepted: accepted('own', { holdAs: 'axiom', belief: true, fingerprint: `fp:written-${name}` }),
    card: `${name}-card`,
    fingerprint: `fp:written-${name}`,
    ...extra,
  });
/**
 * The runner's step 4 of the top action's write (§2.6, §3.8): its commit joins the action's `commits`, and the written
 * premises its write took out are recorded in its `takenOut` (card, written key, ledger entries), their records holding
 * no card and their draft key again.
 */
function stepFour(s: ReviewState, commit: string, premises: readonly string[] = []): ReviewState {
  const done = [...s.stack.done];
  const top = done[done.length - 1] as Extract<SessionAction, { kind: 'decide' | 'reveal' }>;
  const takenOut = premises.map((name) => ({
    item: idOf(`premise:t:${name}`),
    card: `${name}-card`,
    fingerprint: `fp:written-${name}`,
    ledger: [{ kind: 'premise' as const, card: `${name}-card`, target: 't', holdAs: 'axiom' as const, item: `premise:t:${name}`, commit: 'c0' }],
  }));
  done[done.length - 1] = { ...top, commits: [...top.commits, commit], takenOut: [...top.takenOut, ...takenOut] };
  let out: ReviewState = { ...s, stack: { done, undone: s.stack.undone } };
  for (const name of premises) out = set(out, `premise:t:${name}`, { card: undefined, fingerprint: `fp:draft-${name}` });
  return out;
}

/**
 * Two statement items, a vocabulary term, a belief definition, a statement that rests on both, a Result resting on a
 * statement and on Claude's arrow, and that arrow (part of the Result).
 */
const BASIC: Scene = {
  items: [
    record('card:a', 'formalize'),
    record('vocab:V', 'vocabulary-term'),
    record('decl:D', 'declaration', { declKind: 'definition' }),
    record('card:b', 'formalize'),
    record('proof:t', 'result'),
    record('arrow:x>t', 'add-arrow', { partOf: 't' }),
  ],
  deps: { 'card:b': ['vocab:V', 'decl:D'], 'proof:t': ['card:a', 'arrow:x>t'] },
  classes: { 'decl:D': BELIEF, 'arrow:x>t': CHANGES },
};
/** BASIC's meaning items: once they are accepted, the results are shown. */
const DECIDED = ['card:a', 'card:b', 'decl:D'];

describe('Accept (§4.6)', () => {
  it('is refused until the dependencies are accepted; an RV-7 item is never taken by a group, even a one-item group', () => {
    let s = stateOf(BASIC);
    expect(error(accept(s, 'card:b'))).toBe(`refused: ${REVIEW_TEXTS.acceptNeedsDependencies('Formalize “b”', ['Vocabulary term V', 'Definition D'])}`);
    // A one-item group of a belief item takes nothing: it is left with its reason, and no stack step is made.
    const one = ok(group(s, ['decl:D']));
    expect(one.taken).toEqual([]);
    expect(one.left).toEqual([{ item: idOf('decl:D'), reason: 'own-accept' }]);
    expect(one.stack.done).toEqual([]);
    // A group takes what its own Accept and the accepted items allow, and says what it left.
    const both = ok(group(s, ['vocab:V', 'card:b', 'decl:D']));
    expect(both.taken).toEqual([idOf('vocab:V')]);
    expect(both.left).toEqual([
      { item: idOf('decl:D'), reason: 'own-accept' },
      { item: idOf('card:b'), reason: 'depends' },
    ]);
    expect(both.label).toBe('Accept: Vocabulary term V');
    s = next(s, both);
    s = next(s, ok(accept(s, 'decl:D')));
    expect(item(s, 'decl:D').accepted).toMatchObject({ how: 'own', belief: true, changesProved: false, fingerprint: 'fp:decl:D' });
    s = next(s, ok(accept(s, 'card:b', false)));
    expect(item(s, 'card:b').accepted?.how).toBe('group');
    expect(s.stack.done.map((a) => a.kind === 'seal' ? 'seal' : a.label)).toEqual(['Accept: Vocabulary term V', 'Accept: Definition D', 'Accept: Formalize “b”']);
  });

  it('a Result or a Result’s part is neither accepted nor declined while the results are hidden, and a group leaves it', () => {
    const s = stateOf(BASIC);
    for (const outcome of [accept(s, 'proof:t'), decline(s, 'proof:t', 'reject'), decline(s, 'arrow:x>t', 'plain'), accept(s, 'arrow:x>t')]) {
      expect(error(outcome)).toBe(`refused: ${REVIEW_TEXTS.showResultsFirst}`);
    }
    const g = ok(group(s, ['proof:t', 'vocab:V']));
    expect(g.taken).toEqual([idOf('vocab:V')]);
    expect(g.left).toEqual([{ item: idOf('proof:t'), reason: 'hidden-result' }]);
  });

  it('records the Result’s verdict and Rests on, never under the "did not pass" heading', () => {
    const judged = { verdict: 'proved' as const, restsOn: ['a'], deps: [] };
    const shown = stateOf({
      ...BASIC,
      items: BASIC.items.map((r) => (DECIDED.includes(r.key) ? { ...r, status: 'accepted' as const, accepted: accepted() } : r.key === 'proof:t' ? { ...r, judged } : r)),
      deps: {},
    });
    const done = ok(accept(shown, 'proof:t'));
    expect(item(done, 'proof:t').accepted).toMatchObject({ how: 'own', result: { verdict: 'proved', restsOn: ['a'] } });
    // A Result telelean has not judged is never accepted, own or by a group: nothing would record what it rests on
    // (fail closed, V2A-S5).
    const unjudged = set(shown, 'proof:t', { judged: undefined });
    expect(error(accept(unjudged, 'proof:t'))).toBe(`refused: ${REVIEW_TEXTS.resultNotJudged('Result “t”')}`);
    expect(ok(group(unjudged, ['proof:t'])).left).toEqual([{ item: idOf('proof:t'), reason: 'blocked' }]);
    expect(error(accept({ ...shown, didNotPass: true }, 'proof:t'))).toBe(`refused: ${REVIEW_TEXTS.acceptDidNotPass}`);
    expect(ok(group({ ...shown, didNotPass: true }, ['vocab:V'])).left).toEqual([{ item: idOf('vocab:V'), reason: 'blocked' }]);
    // Declines stay allowed.
    expect(ok(decline({ ...shown, didNotPass: true }, 'vocab:V', 'reject')).taken).toEqual([idOf('vocab:V')]);
  });

  it('an Add premise takes its hold-as choice, never a default; one written in review is accepted only as an axiom', () => {
    const premise = record('premise:t:p', 'add-premise', { partOf: 't' });
    const s = stateOf({ items: [premise], classes: { 'premise:t:p': BELIEF } });
    expect(error(accept(s, 'premise:t:p'))).toBe(`refused: ${REVIEW_TEXTS.holdAsMissing('p')}`);
    const done = ok(accept(s, 'premise:t:p', true, { holdAs: 'pending', rationale: 'I believe it' }));
    expect(item(done, 'premise:t:p').accepted).toMatchObject({ holdAs: 'pending', rationale: 'I believe it', belief: true });
    expect(done.label).toBe('Accept: Add premise p (pending proof)');
    expect(done.write).toEqual({ action: 1, revert: [], reapply: [], premises: { write: [idOf('premise:t:p')], takeOut: [] } });
    const written = set(s, 'premise:t:p', { card: 'p-card' });
    expect(error(accept(written, 'premise:t:p', true, { holdAs: 'pending' }))).toBe(`refused: ${REVIEW_TEXTS.writtenAsAxiom('p')}`);
    const asAxiom = ok(accept(written, 'premise:t:p', true, { holdAs: 'axiom' }));
    expect(asAxiom.write).toBeNull();
  });

  it('a stale rev is a conflict; an unknown item too', () => {
    const s = stateOf(BASIC);
    const stale = reduceReview(s, { kind: 'decide', decisions: [{ item: idOf('vocab:V'), rev: 2, to: 'accepted' }], own: true, confirmed: false }, AT);
    expect(error(stale)).toBe(`conflict: ${REVIEW_TEXTS.conflictLabel('Vocabulary term V')}`);
    expect(error(reduceReview(s, { kind: 'decide', decisions: [{ item: 'it0000', rev: 1, to: 'accepted' }], own: true, confirmed: false }, AT))).toBe(
      `conflict: ${REVIEW_TEXTS.conflict('it0000')}`,
    );
  });
});

describe('cascades and confirmations (§3.6, D2-28, D2-64)', () => {
  /** Shown: no meaning item undecided. X accepted, Y accepted resting on it, Z in review resting on Y. */
  const CHAIN: Scene = {
    items: [
      record('decl:X', 'declaration', { status: 'accepted', accepted: accepted() }),
      record('decl:Y', 'declaration', { status: 'accepted', accepted: accepted() }),
      record('decl:Z', 'declaration'),
    ],
    deps: { 'decl:Y': ['decl:X'], 'decl:Z': ['decl:Y'] },
  };

  it('taking an Accept away asks first, listing the accepted dependents; nothing changes without `confirmed`', () => {
    const s = stateOf(CHAIN);
    const ask = decline(s, 'decl:X', 'reject');
    expect(ask).toEqual({ ok: false, code: 'needs-confirmation', cascade: [{ item: idOf('decl:Y'), to: 'to-be-redone', why: 'it depends on Definition X' }] });
    expect(statuses(s)).toEqual({ 'decl:X': 'accepted', 'decl:Y': 'accepted', 'decl:Z': 'in-review' });
    expect(review(s, 'decl:X')).toEqual({ ok: false, code: 'needs-confirmation', cascade: [{ item: idOf('decl:Y'), to: 'in-review', why: 'it depends on Definition X' }] });
    expect(decline(s, 'decl:X', 'shaky')).toEqual({ ok: false, code: 'needs-confirmation', cascade: [{ item: idOf('decl:Y'), to: 'to-be-redone', why: 'it depends on Definition X' }] });
    // Taking away an Accept no accepted item rests on needs no confirmation while the results are shown.
    expect(ok(review(s, 'decl:Y')).cascade).toEqual([]);
    const done = ok(decline(s, 'decl:X', 'reject', true));
    expect(statuses(done)).toEqual({ 'decl:X': 'declined', 'decl:Y': 'to-be-redone', 'decl:Z': 'to-be-redone' });
    expect(done.cascade.map((c) => [c.item, c.to])).toEqual([
      [idOf('decl:Y'), 'to-be-redone'],
      [idOf('decl:Z'), 'to-be-redone'],
    ]);
    expect(done.events).toEqual([{ text: REVIEW_TEXTS.eventRedoneWith, items: [idOf('decl:Z')] }]);
  });

  it('Reject takes out its dependents transitively, Shaky ones included (they keep their note); Shaky takes nothing out', () => {
    const scene: Scene = {
      items: [
        record('vocab:V', 'vocabulary-term'),
        record('decl:D1', 'declaration'),
        record('decl:D2', 'declaration'),
        record('decl:D3', 'declaration', { status: 'declined', decline: { option: 'shaky', note: 'too strong', at: AT } }),
      ],
      deps: { 'decl:D1': ['vocab:V'], 'decl:D2': ['decl:D1'], 'decl:D3': ['decl:D2'] },
    };
    const s = stateOf(scene);
    const rejected = ok(decline(s, 'vocab:V', 'reject'));
    expect(statuses(rejected)).toEqual({ 'vocab:V': 'declined', 'decl:D1': 'to-be-redone', 'decl:D2': 'to-be-redone', 'decl:D3': 'to-be-redone' });
    for (const key of ['decl:D1', 'decl:D2', 'decl:D3']) expect(item(rejected, key).redo).toEqual({ because: [idOf('vocab:V')], reverted: true });
    expect(item(rejected, 'decl:D3').decline).toEqual({ option: 'shaky', note: 'too strong', at: AT });
    expect(item(rejected, 'vocab:V').rejectedFingerprints).toEqual(['fp:vocab:V']);
    expect(rejected.write).toEqual({ action: 1, revert: ['vocab:V', 'decl:D1', 'decl:D2', 'decl:D3'].map(idOf), reapply: [], premises: { write: [], takeOut: [] } });
    expect(rejected.label).toBe('Decline: Vocabulary term V (Reject)');

    const shaky = ok(decline(s, 'vocab:V', 'shaky', false, 'not sure'));
    expect(statuses(shaky)).toEqual({ 'vocab:V': 'declined', 'decl:D1': 'to-be-redone', 'decl:D2': 'to-be-redone', 'decl:D3': 'declined' });
    expect(item(shaky, 'decl:D2').redo).toEqual({ because: [idOf('vocab:V')], reverted: false });
    expect(item(shaky, 'vocab:V').decline).toEqual({ option: 'shaky', note: 'not sure', at: AT });
    expect(item(shaky, 'vocab:V').rejectedFingerprints).toEqual([]);
    expect(shaky.write).toBeNull();
  });

  it('the decline options: Transform is refused until slice 4, the plain decline is the arrows’ only one, a declined item is declined already', () => {
    const s = stateOf(BASIC);
    expect(error(decline(s, 'vocab:V', 'transform'))).toBe(`refused: ${REVIEW_TEXTS.transformLater}`);
    expect(error(decline(s, 'vocab:V', 'plain'))).toBe(`refused: ${REVIEW_TEXTS.plainOnlyArrows('Vocabulary term V')}`);
    expect(error(decline(s, 'vocab:V', undefined))).toBe(`refused: ${REVIEW_TEXTS.plainOnlyArrows('Vocabulary term V')}`);
    const declined = next(s, ok(decline(s, 'vocab:V', 'reject')));
    expect(error(decline(declined, 'vocab:V', 'shaky'))).toBe(`refused: ${REVIEW_TEXTS.declinedAlready('Vocabulary term V')}`);
  });

  it('DO-0: an arrow item is declined plainly; the Results that use it are taken out, and it is never proposed again', () => {
    const shown = stateOf({ ...BASIC, items: BASIC.items.map((r) => (DECIDED.includes(r.key) ? { ...r, status: 'accepted' as const, accepted: accepted() } : r)) });
    const done = ok(decline(shown, 'arrow:x>t', 'reject'));
    expect(item(done, 'arrow:x>t').decline?.option).toBe('plain');
    expect(item(done, 'proof:t')).toMatchObject({ status: 'to-be-redone', redo: { because: [idOf('arrow:x>t')], reverted: true } });
    expect(done.rejectedArrows).toEqual([{ source: 'x', target: 't' }]);
    expect(done.label).toBe('Decline: Add arrow “x” → “t”');
    const action = done.stack.done[0] as Extract<SessionAction, { kind: 'decide' }>;
    expect(action.rejectedArrows).toEqual({ added: [{ source: 'x', target: 't' }], removed: [] });
  });
});

describe('hidden Results (D2-64)', () => {
  /** card:c keeps the results hidden; the Result was accepted while they were shown, and rests on card:a (proved copy). */
  const hidden = (proved: boolean): Scene => ({
    items: [
      record('card:a', 'formalize', { status: 'accepted', accepted: accepted() }),
      record('card:c', 'formalize'),
      record('vocab:V', 'vocabulary-term'),
      record('proof:t', 'result', proved ? { status: 'accepted', accepted: accepted('own') } : {}),
      ...(proved ? [record('arrow:x>t', 'add-arrow', { partOf: 't', status: 'accepted', accepted: accepted('own', { changesProved: true }) })] : []),
    ],
    deps: proved ? { 'proof:t': ['card:a', 'arrow:x>t'], 'card:c': ['vocab:V'] } : { 'card:c': ['vocab:V'] },
    classes: proved ? { 'arrow:x>t': CHANGES } : {},
  });
  const visible = (o: ReviewOutcome) =>
    o.ok ? JSON.stringify({ label: o.label, taken: o.taken, left: o.left, cascade: o.cascade, events: o.events }) : JSON.stringify(o);

  it('taking an Accept away always asks, naming no Result; the cascade reaches the hidden Result silently; proved and not-proved copies answer alike', () => {
    const outcomes = [true, false].map((proved) => {
      const s = stateOf(hidden(proved));
      const ask = decline(s, 'card:a', 'shaky');
      expect(ask).toEqual({ ok: false, code: 'needs-confirmation', cascade: [], hiddenResults: true });
      const done = ok(decline(s, 'card:a', 'shaky', true));
      if (proved) expect(item(done, 'proof:t')).toMatchObject({ status: 'to-be-redone', redo: { reverted: false } });
      // A Reject of a listed item in review asks nothing: the trigger reads only listed statuses.
      const reject = ok(decline(s, 'vocab:V', 'reject'));
      if (proved) expect(item(reject, 'proof:t').status).toBe('accepted');
      const rejectA = decline(s, 'card:a', 'reject', true);
      if (proved) expect(item(ok(rejectA), 'proof:t').status).toBe('to-be-redone');
      return [JSON.stringify(ask), visible(done), visible(reject), visible(rejectA)];
    });
    expect(outcomes[0]).toEqual(outcomes[1]);
  });

  it('while the results are hidden, a listed item resting on a Result’s part waits for the results; it never names the part', () => {
    const scene: Scene = {
      items: [
        record('card:a', 'formalize'),
        record('card:s', 'formalize'),
        record('premise:t:p', 'add-premise', { partOf: 't', status: 'accepted', accepted: accepted('own', { holdAs: 'axiom' }), card: 'p-card' }),
      ],
      deps: { 'card:s': ['premise:t:p'] },
    };
    const s = stateOf(scene);
    expect(error(accept(s, 'card:s'))).toBe(`refused: ${REVIEW_TEXTS.acceptWaitsForResults('Formalize “s”')}`);
    expect(ok(group(s, ['card:s'])).left).toEqual([{ item: idOf('card:s'), reason: 'blocked' }]);
    // Once the results are shown, it is an ordinary dependency.
    const shown = { ...s, forced: { via: 'show-result' as const, at: AT } };
    expect(ok(accept(shown, 'card:s')).taken).toEqual([idOf('card:s')]);
  });
});

describe('D2-23: an action that shows the results applies `classes`', () => {
  it('the Accept that leaves no meaning item undecided returns a group-accepted definition that only a premise draft reaches', () => {
    const s = stateOf({
      items: [record('card:a', 'formalize'), record('decl:E', 'declaration', { status: 'accepted', accepted: accepted('group') }), record('proof:t', 'result')],
      classes: { 'decl:E': BELIEF },
      classesBeforeReveal: { 'decl:E': PLAIN },
    });
    const done = ok(accept(s, 'card:a'));
    expect(statuses(done)).toEqual({ 'card:a': 'accepted', 'decl:E': 'in-review', 'proof:t': 'in-review' });
    expect(done.events).toEqual([{ text: REVIEW_TEXTS.eventBadgesGrew, items: [idOf('decl:E')] }]);
    expect(done.cascade).toEqual([{ item: idOf('decl:E'), to: 'in-review', why: REVIEW_TEXTS.cascadeWhyOwnAccept }]);
    // It is part of the action: Undo puts it back, and the results stay shown meanwhile (E is no meaning item).
    const back = ok(undo(next(s, done)));
    expect(statuses(back)).toEqual({ 'card:a': 'in-review', 'decl:E': 'accepted', 'proof:t': 'in-review' });
  });
});

describe('back to review, un-reject, to be redone (§4.6, D2-60)', () => {
  const scene: Scene = {
    items: [record('vocab:V', 'vocabulary-term'), record('decl:D1', 'declaration'), record('decl:D2', 'declaration', { status: 'accepted', accepted: accepted() })],
    deps: { 'decl:D1': ['vocab:V'] },
  };

  it('un-reject brings the content back, and the dependents its decline took out as to be redone without revert', () => {
    let s = stateOf(scene);
    s = next(s, ok(decline(s, 'vocab:V', 'reject')));
    expect(item(s, 'decl:D1').redo).toEqual({ because: [idOf('vocab:V')], reverted: true });
    const back = ok(review(s, 'vocab:V'));
    expect(item(back, 'vocab:V')).toMatchObject({ status: 'in-review', rejectedFingerprints: [] });
    expect(item(back, 'vocab:V').decline).toBeUndefined();
    expect(item(back, 'decl:D1')).toMatchObject({ status: 'to-be-redone', redo: { because: [idOf('vocab:V')], reverted: false } });
    expect(back.write).toEqual({ action: 2, revert: [], reapply: [idOf('vocab:V'), idOf('decl:D1')], premises: { write: [], takeOut: [] } });
    expect(back.label).toBe('Back to review: Vocabulary term V');
  });

  it('un-reject is refused when Claude proposed a newer version; an item to be redone comes back only with its content in ws/', () => {
    let s = stateOf(scene);
    s = next(s, ok(decline(s, 'vocab:V', 'reject')));
    // Claude's reworded repeat: the rejected version is superseded (rev 1), the new one in review (rev 2).
    const newer = set(s, 'vocab:V', {
      rev: 2,
      status: 'in-review',
      fingerprint: 'fp:new',
      versions: [{ rev: 1, stage: 1, fingerprint: 'fp:vocab:V', content: { decls: [] }, rejected: true }],
    });
    const stale = reduceReview(newer, { kind: 'decide', decisions: [{ item: idOf('vocab:V'), rev: 1, to: 'in-review' }], own: false, confirmed: false }, AT);
    expect(error(stale)).toBe(`refused: ${REVIEW_TEXTS.unrejectNewer}`);
    expect(error(review(s, 'decl:D1'))).toBe(`refused: ${REVIEW_TEXTS.contentTakenOut}`);
    const kept = set(s, 'decl:D1', { redo: { because: ['x'], reverted: false } });
    expect(item(ok(review(kept, 'decl:D1')), 'decl:D1')).toMatchObject({ status: 'in-review' });
    expect(item(ok(review(kept, 'decl:D1')), 'decl:D1').redo).toBeUndefined();
    // A Reject of an item whose content a cascade took out keeps `redo`: un-reject returns it to be redone.
    const rejectedOut = next(s, ok(decline(s, 'decl:D1', 'reject')));
    expect(item(rejectedOut, 'decl:D1').redo).toEqual({ because: [idOf('vocab:V')], reverted: true });
    const unrejected = ok(review(rejectedOut, 'decl:D1'));
    expect(item(unrejected, 'decl:D1')).toMatchObject({ status: 'to-be-redone', rejectedFingerprints: [], redo: { reverted: true } });
    expect(unrejected.write).toBeNull();
    const withdrawn = set(s, 'decl:D2', { status: 'withdrawn' });
    expect(error(review(withdrawn, 'decl:D2'))).toBe(`refused: ${REVIEW_TEXTS.withdrawnStays('Definition D2')}`);
  });

  it('an un-rejected Add premise merges nothing, and the dependents its decline took out stay to be redone (AF2)', () => {
    let s = stateOf({
      items: [record('premise:t:p', 'add-premise', { partOf: 't', content: { decls: [] } }), record('proof:t', 'result')],
      deps: { 'proof:t': ['premise:t:p'] },
      forced: { via: 'show-result', at: AT },
    });
    s = next(s, ok(decline(s, 'premise:t:p', 'reject')));
    expect(item(s, 'proof:t').status).toBe('to-be-redone');
    const back = ok(review(s, 'premise:t:p'));
    expect(item(back, 'premise:t:p').status).toBe('in-review');
    expect(item(back, 'proof:t').redo).toEqual({ because: [idOf('premise:t:p')], reverted: true });
    expect(back.write).toBeNull();
  });
});

describe('DO-0 on an arrow a question selected (D2-59)', () => {
  /** A mid-stage Formalize selected Claude's accepted arrow x -> t into t's question; the proof does not use it. */
  const scene: Scene = {
    items: [record('arrow:x>t', 'add-arrow', { partOf: 't', status: 'accepted', accepted: accepted('own', { changesProved: true }) }), record('proof:t', 'result', { status: 'accepted', accepted: accepted() }), record('proof:u', 'result', { status: 'accepted', accepted: accepted() })],
    deps: { 'proof:u': ['proof:t'] },
    classes: { 'arrow:x>t': CHANGES },
    inferences: [
      { target: 't', question: { sources: ['a', 'x'], fromNothing: false }, order: 0, steps: ['s1'] },
      { target: 'u', question: { sources: ['t'], fromNothing: false }, order: 1, steps: ['s2'] },
    ],
    questionArrows: { 'proof:t': ['arrow:x>t'] },
  };

  it('takes the source out of that question and makes the Result to be redone, with what rests on it; Undo puts both back', () => {
    const s = stateOf(scene);
    const ask = decline(s, 'arrow:x>t', 'plain');
    expect(ask).toEqual({
      ok: false,
      code: 'needs-confirmation',
      cascade: [
        { item: idOf('proof:t'), to: 'to-be-redone', why: REVIEW_TEXTS.leftQuestion('x', 't') },
        { item: idOf('proof:u'), to: 'to-be-redone', why: 'it depends on Result “t”' },
      ],
    });
    const done = ok(decline(s, 'arrow:x>t', 'plain', true));
    expect(done.inferences[0]?.question).toEqual({ sources: ['a'], fromNothing: false });
    expect(item(done, 'proof:t')).toMatchObject({ status: 'to-be-redone', redo: { because: [idOf('arrow:x>t')], reverted: false } });
    expect(item(done, 'proof:u')).toMatchObject({ status: 'to-be-redone', redo: { reverted: false } });
    const action = done.stack.done[0] as Extract<SessionAction, { kind: 'decide' }>;
    expect(action.questions).toEqual([{ target: 't', before: { sources: ['a', 'x'], fromNothing: false }, after: { sources: ['a'], fromNothing: false } }]);
    const back = ok(undo(next(s, done)));
    expect(back.inferences[0]?.question).toEqual({ sources: ['a', 'x'], fromNothing: false });
    expect(back.rejectedArrows).toEqual([]);
    expect(statuses(back)).toEqual({ 'arrow:x>t': 'accepted', 'proof:t': 'accepted', 'proof:u': 'accepted' });
    expect(item(back, 'arrow:x>t').rejectedFingerprints).toEqual([]);
  });
});

describe('the session stack (UN-4–UN-6, D2-73)', () => {
  it('Undo restores every recorded effect: a Reject leaves no rejected key behind; every seal stops it', () => {
    let s = stateOf({ items: [record('vocab:V', 'vocabulary-term'), record('decl:D', 'declaration')], deps: { 'decl:D': ['vocab:V'] } });
    const start = JSON.stringify(s.items);
    s = next(s, ok(decline(s, 'vocab:V', 'reject')));
    const back = ok(undo(s));
    expect(JSON.stringify(back.items)).toBe(start);
    expect(back.write).toEqual({ action: 1, revert: [], reapply: [idOf('vocab:V'), idOf('decl:D')], premises: { write: [], takeOut: [] } });
    expect(back.stack.undone.map((a) => a.id)).toEqual([1]);
    for (const by of ['submit', 'formalize', 'retry'] as const) {
      const sealed = next(s, ok(reduceReview(s, { kind: 'seal', by }, AT)));
      expect(error(undo(sealed))).toBe(`refused: ${REVIEW_TEXTS.sealed}`);
    }
  });

  it('Undo of a Reject that took a written premise out restores it, its takeOut recorded for the runner (AF2)', () => {
    let s = stateOf({
      items: [
        record('premise:t:p', 'add-premise', {
          partOf: 't',
          status: 'accepted',
          accepted: accepted('own', { holdAs: 'axiom', belief: true, fingerprint: 'fp:written' }),
          card: 'p-card',
          fingerprint: 'fp:written',
        }),
      ],
      forced: { via: 'show-result', at: AT },
    });
    const rejected = ok(decline(s, 'premise:t:p', 'reject'));
    expect(rejected.write?.premises.takeOut).toEqual([idOf('premise:t:p')]);
    s = next(s, rejected);
    // The take-out write's step 4 (the runner): the card cleared, the draft key back, what it took out recorded.
    const action = s.stack.done[0] as Extract<SessionAction, { kind: 'decide' }>;
    const takenOut = [{ item: idOf('premise:t:p'), card: 'p-card', fingerprint: 'fp:written', ledger: [] }];
    s = { ...s, stack: { done: [{ ...action, takenOut, commits: ['c9'] }], undone: [] } };
    s = set(s, 'premise:t:p', { card: undefined, fingerprint: 'fp:draft' });
    const back = ok(undo(s));
    // Its card and written key are back with the Accept (V2A-S3): the record is the written premise again, so no new
    // premise write is due, and the next judge, which finds it in ws/ again, sees no change.
    expect(item(back, 'premise:t:p')).toMatchObject({
      status: 'accepted',
      accepted: { holdAs: 'axiom', fingerprint: 'fp:written' },
      rejectedFingerprints: [],
      card: 'p-card',
      fingerprint: 'fp:written',
    });
    // The runner inverts action 1's commits and puts its ledger entries back: the premise comes back with them.
    expect(back.write).toEqual({ action: 1, revert: [], reapply: [idOf('premise:t:p')], premises: { write: [], takeOut: [] } });
    expect((back.stack.undone[0] as Extract<SessionAction, { kind: 'decide' }>).takenOut).toEqual(takenOut);
  });

  it('Undo of a premise Accept and its Redo restore holdAs and the Why', () => {
    let s = stateOf({ items: [record('premise:t:p', 'add-premise', { partOf: 't' })], classes: { 'premise:t:p': BELIEF }, forced: { via: 'show-result', at: AT } });
    s = next(s, ok(accept(s, 'premise:t:p', true, { holdAs: 'pending', rationale: 'because' })));
    const undone = ok(undo(s));
    expect(item(undone, 'premise:t:p').status).toBe('in-review');
    expect(undone.write?.premises.takeOut).toEqual([idOf('premise:t:p')]);
    const again = ok(redo(next(s, undone)));
    expect(item(again, 'premise:t:p').accepted).toMatchObject({ how: 'own', holdAs: 'pending', rationale: 'because' });
    expect(again.write?.premises.write).toEqual([idOf('premise:t:p')]);
    expect(again.stack.done.map((a) => a.id)).toEqual([2]);
  });

  it('Redo goes through the rules: a judge that makes an item RV-7 or leaves a dependency unaccepted refuses it; a changed rev is a conflict', () => {
    let s = stateOf({ items: [record('vocab:V', 'vocabulary-term'), record('decl:Y', 'declaration'), record('decl:Z', 'declaration')] });
    s = next(s, ok(group(s, ['vocab:V', 'decl:Y'])));
    s = next(s, ok(undo(s)));
    const rv7 = { ...s, classes: { ...s.classes, 'decl:Y': BELIEF }, classesBeforeReveal: { ...s.classesBeforeReveal, 'decl:Y': BELIEF } };
    expect(error(redo(rv7))).toBe(`refused: ${REVIEW_TEXTS.leftOwnAccept('Definition Y')}`);
    const depends = { ...s, deps: { ...s.deps, [idOf('decl:Y')]: [idOf('decl:Z')] } };
    expect(error(redo(depends))).toBe(`refused: ${REVIEW_TEXTS.acceptNeedsDependencies('Definition Y', ['Definition Z'])}`);
    expect(error(redo(set(s, 'decl:Y', { rev: 2 })))).toBe(`conflict: ${REVIEW_TEXTS.conflictLabel('Definition Y')}`);
    expect(ok(redo(s)).taken).toEqual([idOf('vocab:V'), idOf('decl:Y')]);
  });

  it('a Redo never names a Result while the results are hidden', () => {
    let s = stateOf({ items: [record('card:a', 'formalize', { status: 'accepted', accepted: accepted() }), record('proof:t', 'result')] });
    s = next(s, ok(accept(s, 'proof:t')));
    s = next(s, ok(undo(s)));
    const hidden = set(s, 'card:a', { status: 'in-review', accepted: undefined });
    expect(error(redo(hidden))).toBe(`refused: ${REVIEW_TEXTS.showResultsFirst}`);
  });

  it('an Undo whose restored Accept would break RV-5 is refused; one whose items changed since is a conflict', () => {
    let s = stateOf({ items: [record('decl:Y', 'declaration', { status: 'accepted', accepted: accepted() }), record('decl:Z', 'declaration')] });
    s = next(s, ok(review(s, 'decl:Y')));
    const depends = { ...s, deps: { ...s.deps, [idOf('decl:Y')]: [idOf('decl:Z')] } };
    expect(error(undo(depends))).toBe(`refused: ${REVIEW_TEXTS.acceptNeedsDependencies('Definition Y', ['Definition Z'])}`);
    expect(error(undo(set(s, 'decl:Y', { rev: 2 })))).toBe(`conflict: ${REVIEW_TEXTS.conflictLabel('Definition Y')}`);
    expect(error(undo(set(s, 'decl:Y', { status: 'to-be-redone', redo: { because: [], reverted: true } })))).toBe(`conflict: ${REVIEW_TEXTS.conflictLabel('Definition Y')}`);
    // Markers telelean added since stay: they are no decision.
    const marked = set(s, 'decl:Y', { markers: ['no-longer-builds'] });
    expect(item(ok(undo(marked)), 'decl:Y').markers).toEqual(['no-longer-builds']);
  });

  it('a seal, or any new action, clears Redo; a stale Undo naming an old id is a conflict', () => {
    let s = stateOf({ items: [record('vocab:V', 'vocabulary-term'), record('decl:D', 'declaration')] });
    s = next(s, ok(accept(s, 'vocab:V')));
    s = next(s, ok(undo(s)));
    expect(s.stack.undone.map((a) => a.id)).toEqual([1]);
    expect(next(s, ok(reduceReview(s, { kind: 'seal', by: 'submit' }, AT))).stack.undone).toEqual([]);
    s = next(s, ok(accept(s, 'decl:D')));
    expect(s.stack.undone).toEqual([]);
    expect(s.stack.done.map((a) => a.id)).toEqual([2]);
    expect(error(reduceReview(s, { kind: 'undo', step: 1, confirmed: true }, AT))).toBe(`conflict: ${REVIEW_TEXTS.historyChanged}`);
    expect(error(reduceReview(s, { kind: 'redo', step: 1, confirmed: true }, AT))).toBe(`conflict: ${REVIEW_TEXTS.historyChanged}`);
  });

  it('a move is one stack step', () => {
    const s = stateOf({ items: [record('vocab:V', 'vocabulary-term')] });
    const moved = ok(reduceReview(s, { kind: 'move', before: { c1: null }, after: { c1: { x: 10, y: 20 } } }, AT));
    expect(moved.stack.done).toEqual([{ id: 1, kind: 'move', label: 'Move: c1', before: { c1: null }, after: { c1: { x: 10, y: 20 } }, at: AT }]);
    const two = ok(reduceReview({ ...s, labels: { c1: 'Cynder' } }, { kind: 'move', before: {}, after: { c1: { x: 1, y: 2 }, c2: { x: 3, y: 4 } } }, AT));
    expect(two.label).toBe('Move: 2 cards');
    expect(ok(reduceReview({ ...s, labels: { c1: 'Cynder' } }, { kind: 'move', before: {}, after: { c1: { x: 1, y: 2 } } }, AT)).label).toBe('Move: Cynder');
    expect(ok(undo(next(s, moved))).stack.undone.map((a) => a.kind)).toEqual(['move']);
  });

  it('an Undo whose action made commits names it in its write, also when no status it restores moves content (carry-over R1-3)', () => {
    let s = stateOf({ items: [record('decl:Y', 'declaration', { status: 'accepted', accepted: accepted() })] });
    s = next(s, ok(review(s, 'decl:Y')));
    expect(ok(undo(s)).write).toBeNull();
    // The same action, had its write made a commit: the runner must invert it, so the write names the action.
    const committed = stepFour(s, 'c3');
    expect(ok(undo(committed)).write).toEqual({ action: 1, revert: [], reapply: [], premises: { write: [], takeOut: [] } });
  });

  it('an Undo whose taken-out premise must stay out takes it out again once the commits are inverted (carry-over R1-3)', () => {
    let s = stateOf({
      items: [record('card:z', 'formalize', { status: 'accepted', accepted: accepted() }), record('vocab:V', 'vocabulary-term', { status: 'accepted', accepted: accepted() }), writtenPremise('p'), record('proof:t', 'result')],
      deps: { 'premise:t:p': ['vocab:V'] },
      classes: { 'premise:t:p': BELIEF },
    });
    const rejected = ok(decline(s, 'vocab:V', 'reject', true));
    expect(rejected.write).toEqual({ action: 1, revert: [idOf('vocab:V')], reapply: [], premises: { write: [], takeOut: [idOf('premise:t:p')] } });
    s = stepFour(next(s, rejected), 'c1', ['p']);
    // Without a judge since, the Undo writes it again: its card and written key come back with the inverse.
    const restored = ok(undo(s));
    expect(item(restored, 'premise:t:p')).toMatchObject({ status: 'accepted', card: 'p-card', fingerprint: 'fp:written-p' });
    expect(restored.write).toEqual({ action: 1, revert: [], reapply: [idOf('vocab:V'), idOf('premise:t:p')], premises: { write: [], takeOut: [] } });
    // A judge since: card:z is back in review, hiding the results, and the premise now rests on it too.
    const judged = { ...set(s, 'card:z', { status: 'in-review', accepted: undefined }), deps: { ...s.deps, [idOf('premise:t:p')]: [idOf('vocab:V'), idOf('card:z')] } };
    const back = ok(undo(judged));
    // Its restored Accept does not stand: it stays out, silently, and the write takes it out again after the inverse.
    expect(item(back, 'premise:t:p')).toMatchObject({ status: 'to-be-redone', redo: { reverted: true }, fingerprint: 'fp:draft-p' });
    expect(item(back, 'premise:t:p').card).toBeUndefined();
    expect(item(back, 'vocab:V').status).toBe('accepted');
    expect(back.write).toEqual({ action: 1, revert: [], reapply: [idOf('vocab:V')], premises: { write: [], takeOut: [idOf('premise:t:p')] } });
    expect(back.cascade).toEqual([]);
  });

  it('an Undo that keeps a decided item silently does not name it among what it took (carry-over R1-3)', () => {
    // Show results forced the results while M is in review. One action sent the accepted Result t back to review and
    // accepted M; its Undo makes M undecided again, which ends the force, so t is hidden after it.
    let s = stateOf({
      items: [
        record('card:m', 'formalize'),
        record('card:a', 'formalize', { status: 'accepted', accepted: accepted() }),
        record('proof:t', 'result', { status: 'accepted', accepted: accepted('own', { result: { verdict: 'proved', restsOn: [] } }) }),
        record('vocab:Q', 'vocabulary-term'),
      ],
      deps: { 'proof:t': ['card:a'] },
      forced: { via: 'show-result', at: AT },
    });
    const decisions: ItemDecision[] = [
      { item: idOf('proof:t'), rev: 1, to: 'in-review' },
      { item: idOf('card:m'), rev: 1, to: 'accepted' },
    ];
    s = next(s, ok(reduceReview(s, { kind: 'decide', decisions, own: false, confirmed: false }, AT)));
    expect(statuses(s)).toMatchObject({ 'card:m': 'accepted', 'proof:t': 'in-review' });
    expect(ok(undo(s)).taken).toEqual([idOf('proof:t'), idOf('card:m')]);
    // A judge since: t also rests on Q, in review. Its restored Accept does not stand: it stays in review, silently.
    const judged = { ...s, deps: { ...s.deps, [idOf('proof:t')]: [idOf('card:a'), idOf('vocab:Q')] } };
    const back = ok(undo(judged));
    expect(statuses(back)).toMatchObject({ 'card:m': 'in-review', 'proof:t': 'in-review' });
    expect(back.taken).toEqual([idOf('card:m')]);
    expect(back.forced).toBeNull();
    expect(back.cascade).toEqual([]);
  });
});

describe('groups (RV-8)', () => {
  const g = (id: string, over: Partial<GroupItem> = {}): GroupItem => ({ id, status: 'in-review', dependsOn: [], ownAccept: false, hidden: false, blocked: false, arrow: false, ...over });

  it('planGroupAccept: the greatest fixpoint, dependencies inside an SCC ignored, every reason given', () => {
    const items = [
      g('a'),
      g('b', { dependsOn: ['a'] }),
      g('c', { dependsOn: ['x'] }),
      g('x'),
      g('own', { ownAccept: true }),
      g('h', { hidden: true, status: null }),
      g('k', { blocked: true }),
      g('done', { status: 'accepted' }),
      g('s1', { dependsOn: ['s2'] }),
      g('s2', { dependsOn: ['s1', 'done'] }),
    ];
    expect(planGroupAccept(items, ['b', 'a', 'c', 'own', 'h', 'k', 'done', 's1', 'gone'])).toEqual({
      take: ['b', 'a', 's1'],
      left: [
        { item: 'own', reason: 'own-accept' },
        { item: 'h', reason: 'hidden-result' },
        { item: 'k', reason: 'blocked' },
        { item: 'done', reason: 'not-in-review' },
        { item: 'gone', reason: 'not-in-review' },
        { item: 'c', reason: 'depends' },
      ],
    });
  });

  it('planGroupDecline: arrow items plainly, hidden Results left, declined items left', () => {
    const items = [g('a'), g('arrow', { arrow: true }), g('h', { hidden: true, status: null }), g('d', { status: 'declined' }), g('acc', { status: 'accepted' })];
    expect(planGroupDecline(items, ['a', 'arrow', 'h', 'd', 'acc'], 'shaky')).toEqual({
      decisions: [
        { item: 'a', option: 'shaky' },
        { item: 'arrow', option: 'plain' },
        { item: 'acc', option: 'shaky' },
      ],
      left: [
        { item: 'h', reason: 'hidden-result' },
        { item: 'd', reason: 'not-in-review' },
      ],
    });
    // A plain decline is the arrow items' only option, and theirs alone: any other item is left with its own reason
    // (V2A-N2), never "can't be accepted now".
    expect(planGroupDecline(items, ['a', 'arrow'], 'plain')).toEqual({ decisions: [{ item: 'arrow', option: 'plain' }], left: [{ item: 'a', reason: 'needs-option' }] });
  });

  it('acceptGate reports what the Accept it previews would: the own Accept’s order for an own Accept, the group’s for a group (V2A-N2)', () => {
    // card:s rests on a listed definition in review and on a written premise, a Result's part: hidden now.
    const s = stateOf({
      items: [
        record('card:a', 'formalize'),
        record('decl:Z', 'declaration'),
        record('card:s', 'formalize'),
        record('premise:t:p', 'add-premise', { partOf: 't', status: 'accepted', accepted: accepted('own', { holdAs: 'axiom' }), card: 'p-card' }),
      ],
      deps: { 'card:s': ['decl:Z', 'premise:t:p'] },
    });
    const own = acceptGate(s, idOf('card:s'), true);
    expect(own).toEqual({ ok: false, reason: 'depends', text: REVIEW_TEXTS.acceptNeedsDependencies('Formalize “s”', ['Definition Z']), missing: [idOf('decl:Z')] });
    expect(error(accept(s, 'card:s'))).toBe(`refused: ${own.ok ? '' : own.text}`);
    const asGroup = acceptGate(s, idOf('card:s'), false);
    expect(asGroup).toMatchObject({ ok: false, reason: 'blocked', text: REVIEW_TEXTS.acceptWaitsForResults('Formalize “s”') });
    expect(ok(group(s, ['card:s'])).left).toEqual([{ item: idOf('card:s'), reason: 'blocked' }]);
  });

  it('an item the judgement gave no class needs its own Accept, and counts as a meaning item (fail closed, D2-25)', () => {
    const scene = stateOf({ items: [record('decl:N', 'declaration'), record('vocab:V', 'vocabulary-term')] });
    const s: ReviewState = { ...scene, classes: { 'vocab:V': PLAIN }, classesBeforeReveal: { 'vocab:V': PLAIN } };
    expect(ok(group(s, ['decl:N', 'vocab:V']))).toMatchObject({ taken: [idOf('vocab:V')], left: [{ item: idOf('decl:N'), reason: 'own-accept' }] });
    expect(resultsState({ items: s.items, classesBeforeReveal: s.classesBeforeReveal, forced: null }).waitingFor).toEqual([idOf('decl:N')]);
    expect(item(ok(accept(s, 'decl:N')), 'decl:N').accepted).toMatchObject({ how: 'own', belief: true, changesProved: true });
  });

  it('an item whose facts are missing is never accepted, own or by a group, until a judgement has them (ADV-3)', () => {
    const s = stateOf({ items: [record('card:m', 'formalize'), record('vocab:V', 'vocabulary-term')], classes: { 'card:m': { ...PLAIN, factsMissing: true } } });
    expect(error(accept(s, 'card:m'))).toBe(`refused: ${REVIEW_TEXTS.acceptFactsMissing('Formalize “m”')}`);
    expect(ok(group(s, ['card:m', 'vocab:V']))).toMatchObject({ taken: [idOf('vocab:V')], left: [{ item: idOf('card:m'), reason: 'blocked' }] });
    expect(acceptGate(s, idOf('card:m'), false)).toMatchObject({ ok: false, reason: 'blocked', text: REVIEW_TEXTS.acceptFactsMissing('Formalize “m”') });
    // While some class lacks its facts, no badge comparison reads the classes: an action that shows the results returns
    // nothing (the next full judgement's reconcile applies RV-7).
    const partial = stateOf({
      items: [record('card:a', 'formalize'), record('decl:E', 'declaration', { status: 'accepted', accepted: accepted('group') }), record('vocab:M', 'vocabulary-term')],
      classes: { 'decl:E': BELIEF, 'vocab:M': { ...PLAIN, factsMissing: true } },
      classesBeforeReveal: { 'decl:E': PLAIN, 'vocab:M': { ...PLAIN, factsMissing: true } },
    });
    expect(item(ok(accept(partial, 'card:a')), 'decl:E').status).toBe('accepted');
    const full = { ...partial, classes: { ...partial.classes, 'vocab:M': PLAIN }, classesBeforeReveal: { ...partial.classesBeforeReveal, 'vocab:M': PLAIN } };
    expect(item(ok(accept(full, 'card:a')), 'decl:E').status).toBe('in-review');
  });
});

describe('a hidden item never changes an answer (fixer 2a, V2A-S2)', () => {
  /**
   * The results are hidden by card:c. Proved: the Result is accepted and rests on card:a; not proved: it rests on
   * nothing and is in review. `reversioned`: a judge made the hidden Result a new version since.
   */
  const copy = (proved: boolean, reversioned = false): ReviewState =>
    stateOf({
      items: [
        record('card:a', 'formalize', { status: 'accepted', accepted: accepted() }),
        record('card:c', 'formalize'),
        record('proof:t', 'result', {
          ...(proved ? { status: 'accepted' as const, accepted: accepted() } : {}),
          ...(reversioned ? { rev: 2, markers: ['updated' as const], versions: [{ rev: 1, stage: 1, fingerprint: 'fp:proof:t', content: { decls: [] }, rejected: true }] } : {}),
        }),
      ],
      deps: proved ? { 'proof:t': ['card:a'] } : {},
    });
  const answer = (o: ReviewOutcome) =>
    JSON.stringify(o.ok ? { ok: true, label: o.label, taken: o.taken, left: o.left, cascade: o.cascade, events: o.events, write: o.write, forced: o.forced } : o);

  it('a request naming a hidden Result is refused alike whatever rev it carries', () => {
    const outcomes = [copy(true, true), copy(false)].map((s) =>
      (['accepted', 'declined', 'in-review'] as const).map((to) =>
        answer(
          reduceReview(
            s,
            { kind: 'decide', decisions: [{ item: idOf('proof:t'), rev: 1, to, ...(to === 'declined' ? { option: 'reject' as const } : {}) }], own: true, confirmed: false },
            AT,
          ),
        ),
      ),
    );
    expect(outcomes[0]).toEqual(outcomes[1]);
    expect(outcomes[0]?.[0]).toBe(answer({ ok: false, code: 'refused', error: REVIEW_TEXTS.showResultsFirst, item: idOf('proof:t') }));
    // A group leaves it whatever its rev.
    expect(answer(group(copy(true, true), ['proof:t', 'card:c']))).toBe(answer(group(copy(false), ['proof:t', 'card:c'])));
  });

  it('an Undo leaves a hidden item a judge changed since, or whose Accept the rules now refuse, as it is, and answers alike', () => {
    const undoAfter = (proved: boolean, judge: (s: ReviewState) => ReviewState) => {
      let s = copy(proved);
      s = next(s, ok(decline(s, 'card:a', 'shaky', true)));
      if (proved) expect(item(s, 'proof:t')).toMatchObject({ status: 'to-be-redone', redo: { reverted: false } });
      s = judge(s);
      return ok(undo(s));
    };
    const reversion = (s: ReviewState) => set(s, 'proof:t', { rev: 2, status: 'in-review', redo: undefined, markers: ['updated'] });
    const newDependency = (s: ReviewState) => ({ ...s, deps: { ...s.deps, [idOf('proof:t')]: [idOf('card:a'), idOf('card:c')] } });
    const plain = undoAfter(false, (s) => s);
    for (const judge of [reversion, newDependency]) expect(answer(undoAfter(true, judge))).toBe(answer(plain));
    // The listed decision is undone; the hidden Result keeps what the judge made of it, or stays to be redone: it rests
    // on card:c, in review.
    expect(item(undoAfter(true, reversion), 'proof:t')).toMatchObject({ status: 'in-review', rev: 2 });
    expect(item(undoAfter(true, newDependency), 'proof:t')).toMatchObject({ status: 'to-be-redone' });
    expect(item(undoAfter(true, (s) => s), 'proof:t').status).toBe('accepted');
    expect(item(undoAfter(true, reversion), 'card:a').status).toBe('accepted');
  });

  it('an Undo of a decision on a Result, now hidden, is refused without naming it (D2-8)', () => {
    let s = stateOf({ items: [record('card:a', 'formalize', { status: 'accepted', accepted: accepted() }), record('proof:t', 'result')] });
    s = next(s, ok(accept(s, 'proof:t')));
    // A judge returned card:a to review: the results are hidden again.
    const hidden = set(s, 'card:a', { status: 'in-review', accepted: undefined });
    expect(undo(hidden)).toEqual({ ok: false, code: 'refused', error: REVIEW_TEXTS.showResultsFirst });
  });

  it('an Undo asked while the results are hidden answers alike, also when it shows them, whatever a judge did to a hidden Result (P1) or written premise (P1b) (carry-over S-V2A-S2)', () => {
    // P1: card:a, Result t resting on it and Result u resting on t, all accepted, the results shown. Sending card:a back
    // to review hides them; the Undo would show them again. Copy B: a judge made t a new version meanwhile.
    const p1 = stateOf({
      items: [
        record('card:a', 'formalize', { status: 'accepted', accepted: accepted() }),
        record('proof:t', 'result', { status: 'accepted', accepted: accepted('own', { result: { verdict: 'proved', restsOn: [] } }) }),
        record('proof:u', 'result', { origin: { step: 's2', target: 'u', phase: 'proof' }, status: 'accepted', accepted: accepted('own', { result: { verdict: 'proved', restsOn: [] } }) }),
      ],
      deps: { 'proof:t': ['card:a'], 'proof:u': ['proof:t'] },
    });
    const s1 = next(p1, ok(review(p1, 'card:a', true)));
    expect(resultsState({ items: s1.items, classesBeforeReveal: s1.classesBeforeReveal, forced: null }).shown).toBe(false);
    const reversioned = set(s1, 'proof:t', { rev: 2, markers: ['updated'], versions: [{ rev: 1, stage: 1, fingerprint: 'fp:proof:t', content: { decls: [] } }] });
    const a = ok(undo(s1));
    const b = ok(undo(reversioned));
    expect(answer(b)).toBe(answer(a));
    // No Result is named, though the Undo shows them: their changes show with the results.
    expect(a.cascade).toEqual([]);
    expect(a.taken).toEqual([idOf('card:a')]);
    expect(statuses(a)).toEqual({ 'card:a': 'accepted', 'proof:t': 'accepted', 'proof:u': 'accepted' });
    // Copy B keeps t as the judge left it, and u, whose restored Accept rests on t, silently in review.
    expect(statuses(b)).toEqual({ 'card:a': 'accepted', 'proof:t': 'in-review', 'proof:u': 'in-review' });
    expect(item(b, 'proof:t').rev).toBe(2);
    for (const o of [a, b]) expect(resultsState({ items: o.items, classesBeforeReveal: s1.classesBeforeReveal, forced: o.forced }).shown).toBe(true);

    // P1b: card:s rests on the written premise p (a Result's part); sending card:s back to review hides the results.
    // Copy B: a judge took p out since. The Undo, as an Accept of card:s by hand now, waits for the results, never
    // naming p, whatever its state.
    const p1b = stateOf({
      items: [
        record('card:a', 'formalize', { status: 'accepted', accepted: accepted() }),
        record('card:s', 'formalize', { status: 'accepted', accepted: accepted() }),
        record('premise:t:p', 'add-premise', { partOf: 't', status: 'accepted', accepted: accepted('own', { holdAs: 'axiom', belief: true }), card: 'p-card' }),
        record('proof:t', 'result'),
      ],
      deps: { 'card:s': ['premise:t:p'] },
      classes: { 'premise:t:p': BELIEF },
    });
    const s2 = next(p1b, ok(review(p1b, 'card:s', true)));
    const takenOut = set(s2, 'premise:t:p', { status: 'to-be-redone', accepted: undefined, redo: { because: [], reverted: true }, markers: ['no-longer-builds'], card: undefined });
    expect(answer(undo(takenOut))).toBe(answer(undo(s2)));
    expect(undo(s2)).toEqual({ ok: false, code: 'refused', error: REVIEW_TEXTS.acceptWaitsForResults('Formalize “s”'), item: idOf('card:s') });
    expect(error(accept(s2, 'card:s'))).toBe(error(undo(s2)));
  });

  it('a decision asked while the results are hidden that shows them names no hidden Result: proved and not-proved copies answer alike (carry-over S-V2A-S2)', () => {
    // card:c, the last undecided meaning item, came back to review with the Result in the proved copy, which rests on it.
    const pair = (proved: boolean) =>
      stateOf({ items: [record('card:c', 'formalize'), record('card:a', 'formalize', { status: 'accepted', accepted: accepted() }), record('proof:t', 'result')], deps: proved ? { 'proof:t': ['card:c'] } : {} });
    const visible = (o: ReviewOutcome) => JSON.stringify(o.ok ? { label: o.label, taken: o.taken, left: o.left, cascade: o.cascade, events: o.events, forced: o.forced } : o);
    for (const option of ['reject', 'shaky'] as const) {
      const proved = ok(decline(pair(true), 'card:c', option));
      const notProved = ok(decline(pair(false), 'card:c', option));
      expect(visible(proved), option).toBe(visible(notProved));
      // The results are shown after it, and the Result's change shows with them.
      expect(resultsState({ items: proved.items, classesBeforeReveal: pair(true).classesBeforeReveal, forced: proved.forced }).shown).toBe(true);
      expect(item(proved, 'proof:t')).toMatchObject({ status: 'to-be-redone', redo: { reverted: option === 'reject' } });
      expect(item(notProved, 'proof:t').status).toBe('in-review');
    }
  });

  it('an Undo asked while the results are shown reads a restored Accept’s dependencies as shown, also when the Undo hides them (builder 2b1a decided)', () => {
    // M is the meaning item that keeps the results hidden; Y, a plain definition, rests on the accepted written premise p.
    // One action accepted M and sent Y back to review; its Undo restores Y's Accept and hides the results again.
    let s = stateOf({
      items: [
        record('card:m', 'formalize'),
        record('decl:Y', 'declaration', { status: 'accepted', accepted: accepted() }),
        record('premise:t:p', 'add-premise', { partOf: 't', status: 'accepted', accepted: accepted('own', { holdAs: 'axiom', belief: true }), card: 'p-card' }),
        record('proof:t', 'result'),
      ],
      deps: { 'decl:Y': ['premise:t:p'] },
      classes: { 'premise:t:p': BELIEF },
    });
    const both = (confirmed: boolean) =>
      reduceReview(
        s,
        {
          kind: 'decide',
          decisions: [
            { item: idOf('card:m'), rev: 1, to: 'accepted' },
            { item: idOf('decl:Y'), rev: 1, to: 'in-review' },
          ],
          own: false,
          confirmed,
        },
        AT,
      );
    expect(both(false)).toEqual({ ok: false, code: 'needs-confirmation', cascade: [], hiddenResults: true });
    s = next(s, ok(both(true)));
    expect(resultsState({ items: s.items, classesBeforeReveal: s.classesBeforeReveal, forced: null }).shown).toBe(true);
    const back = ok(undo(s));
    expect(statuses(back)).toEqual({ 'card:m': 'in-review', 'decl:Y': 'accepted', 'premise:t:p': 'accepted', 'proof:t': 'in-review' });
    expect(resultsState({ items: back.items, classesBeforeReveal: s.classesBeforeReveal, forced: back.forced }).shown).toBe(false);
    // A dependency that is not accepted is named then, as by hand: the results are shown when the Undo is asked.
    const open = set(s, 'premise:t:p', { status: 'in-review', accepted: undefined });
    expect(error(undo(open))).toBe(`refused: ${REVIEW_TEXTS.acceptNeedsDependencies('Definition Y', ['Add premise “p”'])}`);
  });

  it('an Undo asked while the results are hidden that would show them checks a restored Accept’s badges against the class in force then: a hidden premise draft reaching it changes no refusal, and the show returns it, as by hand (fixer 2b1a r1)', () => {
    for (const how of ['own', 'group'] as const) {
      for (const decided of [true, false]) {
        const label = `${how} Accept, ${decided ? 'decided by the action' : 'an accepted dependent'}`;
        // M and D accepted, the results shown. One action sends M back to review, and D with it (decided by the action,
        // or as an accepted dependent of M): M undecided hides the results, and the Undo would show them again.
        const s0 = stateOf({
          items: [
            record('card:m', 'formalize', { status: 'accepted', accepted: accepted() }),
            record('decl:D', 'declaration', { declKind: 'definition', status: 'accepted', accepted: accepted(how) }),
            record('proof:t', 'result'),
          ],
          deps: decided ? {} : { 'decl:D': ['card:m'] },
        });
        const decisions: ItemDecision[] = [
          { item: idOf('card:m'), rev: 1, to: 'in-review' },
          ...(decided ? [{ item: idOf('decl:D'), rev: 1, to: 'in-review' as const }] : []),
        ];
        const s1 = next(s0, ok(reduceReview(s0, { kind: 'decide', decisions, own: false, confirmed: true }, AT)));
        expect(statuses(s1), label).toEqual({ 'card:m': 'in-review', 'decl:D': 'in-review', 'proof:t': 'in-review' });
        // Copy X: a judge since, and a premise draft of t (a Result's part, hidden) now reaches D, a belief in `classes`
        // only. Copy Y: no such draft. Every listed record, and `classesBeforeReveal`, are the same in both.
        const x: ReviewState = { ...s1, classes: { ...s1.classes, 'decl:D': BELIEF } };
        const ux = ok(undo(x));
        const uy = ok(undo(s1));
        // Both go through, alike, and show the results.
        expect([ux.label, ux.taken], label).toEqual([uy.label, uy.taken]);
        for (const [s, o] of [
          [x, ux],
          [s1, uy],
        ] as const)
          expect(resultsState({ items: o.items, classesBeforeReveal: s.classesBeforeReveal, forced: o.forced }).shown, label).toBe(true);
        expect(statuses(uy), label).toEqual({ 'card:m': 'accepted', 'decl:D': 'accepted', 'proof:t': 'in-review' });
        expect(uy.events, label).toEqual([]);
        // In copy X, D2-23 at the show returns D to review, reported with the results, as at any show.
        expect(statuses(ux), label).toEqual({ 'card:m': 'accepted', 'decl:D': 'in-review', 'proof:t': 'in-review' });
        expect(ux.events, label).toEqual([{ text: REVIEW_TEXTS.eventBadgesGrew, items: [idOf('decl:D')] }]);
        // By hand, in copy X, the same Accepts asked now go through (D's class in force now is plain), and the show they
        // make returns D the same way.
        const hand = ok(group(x, ['card:m', 'decl:D']));
        expect([statuses(hand), hand.events], label).toEqual([statuses(ux), ux.events]);
        // "blocked" reads the same class in force: one whose facts only `classes` lacks refuses nothing while the Undo is
        // asked hidden. (classify never marks missing facts in one map only, so this pins the rule, not a case.)
        const z: ReviewState = { ...s1, classes: { ...s1.classes, 'decl:D': { ...PLAIN, factsMissing: true } } };
        expect(statuses(ok(undo(z))), label).toEqual(statuses(uy));
      }
    }
  });

  it('an action asked while the results are shown that hides them names no Result in its cascade or events, an Undo included (fixer 2b1a r1)', () => {
    // card:a, and the Result t resting on it, accepted: the results are shown. Back to review of card:a hides them, and
    // t returns to review with it, silently.
    const s = stateOf({
      items: [
        record('card:a', 'formalize', { status: 'accepted', accepted: accepted() }),
        record('proof:t', 'result', { status: 'accepted', accepted: accepted('own', { result: { verdict: 'proved', restsOn: [] } }) }),
      ],
      deps: { 'proof:t': ['card:a'] },
    });
    const back = ok(review(s, 'card:a', true));
    expect(resultsState({ items: back.items, classesBeforeReveal: s.classesBeforeReveal, forced: back.forced }).shown).toBe(false);
    expect(item(back, 'proof:t').status).toBe('in-review');
    expect([back.taken, back.cascade, back.events]).toEqual([[idOf('card:a')], [], []]);
    // One action, asked while the results were hidden, accepted m and rejected q, which t rests on, and showed them. Its
    // Undo, asked while they are shown, hides them again and gives t its Accept back, silently.
    let u = stateOf({
      items: [
        record('card:m', 'formalize'),
        record('card:q', 'formalize', { status: 'accepted', accepted: accepted() }),
        record('proof:t', 'result', { status: 'accepted', accepted: accepted('own', { result: { verdict: 'proved', restsOn: [] } }) }),
      ],
      deps: { 'proof:t': ['card:q'] },
    });
    const decisions: ItemDecision[] = [
      { item: idOf('card:m'), rev: 1, to: 'accepted' },
      { item: idOf('card:q'), rev: 1, to: 'declined', option: 'reject' },
    ];
    u = next(u, ok(reduceReview(u, { kind: 'decide', decisions, own: false, confirmed: true }, AT)));
    expect(item(u, 'proof:t')).toMatchObject({ status: 'to-be-redone', redo: { reverted: true } });
    const undone = ok(undo(u));
    expect(resultsState({ items: undone.items, classesBeforeReveal: u.classesBeforeReveal, forced: undone.forced }).shown).toBe(false);
    expect(statuses(undone)).toEqual({ 'card:m': 'in-review', 'card:q': 'accepted', 'proof:t': 'accepted' });
    expect([undone.taken, undone.cascade, undone.events]).toEqual([[idOf('card:m'), idOf('card:q')], [], []]);
  });
});

describe('the session stack checks every restored Accept against the current state (D2-73, AF13; ADV-4, ADV-6)', () => {
  it('RV-7: an Accept whose badges grew since needs its own Accept again, own and group alike, with or without a force', () => {
    for (const forced of [true, false]) {
      for (const both of [true, false]) {
        // card:Y declined Shaky takes D's Accept (D rests on it); a judge then makes D a belief.
        let s = stateOf({
          items: [record('card:Y', 'formalize', { status: 'accepted', accepted: accepted() }), record('decl:D', 'declaration', { status: 'accepted', accepted: accepted('own') })],
          deps: { 'decl:D': ['card:Y'] },
          ...(forced ? { forced: { via: 'show-result' as const, at: AT } } : {}),
        });
        s = next(s, ok(decline(s, 'card:Y', 'shaky', true)));
        expect(item(s, 'decl:D').status).toBe('to-be-redone');
        s = { ...s, classes: { ...s.classes, 'decl:D': BELIEF }, ...(both ? { classesBeforeReveal: { ...s.classesBeforeReveal, 'decl:D': BELIEF } } : {}) };
        expect(error(undo(s)), `forced ${forced}, both maps ${both}`).toBe(`refused: ${REVIEW_TEXTS.leftOwnAccept('Definition D')}`);
      }
    }
    // An own Accept taken back by hand, then a judge: it changes what is proved now.
    let x = stateOf({ items: [record('decl:X', 'declaration', { status: 'accepted', accepted: accepted('own') }), record('card:z', 'formalize')] });
    x = next(x, ok(review(x, 'decl:X', true)));
    const grown = { ...x, classes: { ...x.classes, 'decl:X': CHANGES }, classesBeforeReveal: { ...x.classesBeforeReveal, 'decl:X': CHANGES } };
    expect(error(undo(grown))).toBe(`refused: ${REVIEW_TEXTS.leftOwnAcceptProved('Definition X')}`);
    expect(item(ok(undo(x)), 'decl:X').status).toBe('accepted');
    // A group Accept of an item that is an RV-7 item now is refused even when its recorded badges cover the class: a
    // group never takes one.
    let g = stateOf({ items: [record('decl:G', 'declaration', { status: 'accepted', accepted: accepted('group', { belief: true }) })] });
    g = next(g, ok(review(g, 'decl:G')));
    expect(error(undo({ ...g, classes: { 'decl:G': BELIEF }, classesBeforeReveal: { 'decl:G': BELIEF } }))).toBe(`refused: ${REVIEW_TEXTS.leftOwnAccept('Definition G')}`);
  });

  it('"did not pass": no Accept is restored under the heading', () => {
    let s = stateOf({ items: [record('decl:Y', 'declaration', { status: 'accepted', accepted: accepted() })] });
    s = next(s, ok(review(s, 'decl:Y')));
    expect(error(undo({ ...s, didNotPass: true }))).toBe(`refused: ${REVIEW_TEXTS.acceptDidNotPass}`);
  });

  it('an Undo that takes an Accept from a dependent asks first, as by hand, with the hidden-results sentence while they are hidden', () => {
    let s = stateOf({ items: [record('decl:X', 'declaration'), record('decl:Y', 'declaration', { status: 'accepted', accepted: accepted() })] });
    s = next(s, ok(accept(s, 'decl:X')));
    // A judge: Y rests on X now.
    s = { ...s, deps: { ...s.deps, [idOf('decl:Y')]: [idOf('decl:X')] } };
    const cascade = [{ item: idOf('decl:Y'), to: 'in-review', why: REVIEW_TEXTS.cascadeWhy('Definition X') }];
    expect(undo(s, false)).toEqual({ ok: false, code: 'needs-confirmation', cascade });
    expect(statuses(ok(undo(s, true)))).toEqual({ 'decl:X': 'in-review', 'decl:Y': 'in-review' });
    const hidden = { ...s, items: [...s.items, record('card:c', 'formalize')] };
    expect(undo(hidden, false)).toEqual({ ok: false, code: 'needs-confirmation', cascade, hiddenResults: true });
  });

  it('an Undo that shows the results applies D2-23: a definition a premise draft reaches now returns to review', () => {
    let s = stateOf({
      items: [record('card:a', 'formalize', { status: 'accepted', accepted: accepted() }), record('decl:E', 'declaration', { status: 'accepted', accepted: accepted('group') }), record('proof:t', 'result')],
    });
    s = next(s, ok(review(s, 'card:a')));
    // A judge: a premise draft now reaches E, a belief in `classes` only.
    s = { ...s, classes: { ...s.classes, 'decl:E': BELIEF } };
    const back = ok(undo(s));
    expect(statuses(back)).toEqual({ 'card:a': 'accepted', 'decl:E': 'in-review', 'proof:t': 'in-review' });
    expect(back.events).toEqual([{ text: REVIEW_TEXTS.eventBadgesGrew, items: [idOf('decl:E')] }]);
    expect(back.forced).toBeNull();
  });

  it('Redo keeps an own Accept only when the request was one: a group that took one item stays a group (ADV-8)', () => {
    let s = stateOf({ items: [record('card:X', 'formalize'), record('card:Y', 'formalize')] });
    const first = ok(
      reduceReview(
        s,
        {
          kind: 'decide',
          decisions: [
            { item: idOf('card:X'), rev: 1, to: 'accepted' },
            { item: idOf('card:Y'), rev: 1, to: 'in-review' },
          ],
          own: true,
          confirmed: false,
        },
        AT,
      ),
    );
    s = next(s, first);
    expect(item(s, 'card:X').accepted?.how).toBe('group');
    s = next(s, ok(undo(s)));
    const rv7 = { ...s, classes: { ...s.classes, 'card:X': CHANGES }, classesBeforeReveal: { ...s.classesBeforeReveal, 'card:X': CHANGES } };
    expect(error(redo(rv7))).toBe(`refused: ${REVIEW_TEXTS.leftOwnAcceptProved('Formalize “X”')}`);
    expect(item(ok(redo(s)), 'card:X').accepted?.how).toBe('group');
  });
});

describe('the reveal records what D2-23 does at it, and telelean keeps what it showed (V2A-S4, ADV-1)', () => {
  it('Show results returns a group-accepted definition a premise draft reaches, reported; its Undo restores the Accept, and writes again a written premise it took out (carry-over R1-2)', () => {
    let s = stateOf({
      items: [record('card:z', 'formalize'), record('decl:E', 'declaration', { status: 'accepted', accepted: accepted('group') }), writtenPremise('p'), record('proof:t', 'result')],
      deps: { 'premise:t:p': ['decl:E'] },
      classes: { 'decl:E': BELIEF, 'premise:t:p': BELIEF },
      classesBeforeReveal: { 'decl:E': PLAIN, 'premise:t:p': BELIEF },
    });
    const shown = ok(reduceReview(s, { kind: 'reveal', via: 'show-result' }, AT));
    expect(item(shown, 'decl:E').status).toBe('in-review');
    expect(shown.events).toEqual([{ text: REVIEW_TEXTS.eventBadgesGrew, items: [idOf('decl:E')] }]);
    // The written premise resting on E returns to review with it, so the show's write takes it out (§3.8).
    expect(item(shown, 'premise:t:p').status).toBe('in-review');
    expect(shown.write).toEqual({ action: 1, revert: [], reapply: [], premises: { write: [], takeOut: [idOf('premise:t:p')] } });
    expect(shown.stack.done[0]).toEqual({
      id: 1,
      kind: 'reveal',
      label: REVIEW_TEXTS.showResults,
      force: { via: 'show-result', at: AT },
      changes: [
        expect.objectContaining({ item: idOf('decl:E'), rev: 1, before: expect.objectContaining({ status: 'accepted' }), after: expect.objectContaining({ status: 'in-review' }) }),
        expect.objectContaining({ item: idOf('premise:t:p'), rev: 1, before: expect.objectContaining({ status: 'accepted' }), after: expect.objectContaining({ status: 'in-review' }) }),
      ],
      takenOut: [],
      commits: [],
    });
    // Its step 4 records the take-out on the action, as a decision's does; the Undo inverts it and puts the premise
    // back: its card and written key, so no new premise write is due.
    s = stepFour(next(s, shown), 'c5', ['p']);
    const back = ok(undo(s));
    expect(statuses(back)).toEqual({ 'card:z': 'in-review', 'decl:E': 'accepted', 'premise:t:p': 'accepted', 'proof:t': 'in-review' });
    expect(item(back, 'decl:E').accepted).toMatchObject({ how: 'group', belief: false });
    expect(item(back, 'premise:t:p')).toMatchObject({ card: 'p-card', fingerprint: 'fp:written-p', accepted: { holdAs: 'axiom', fingerprint: 'fp:written-p' } });
    expect(back.write).toEqual({ action: 1, revert: [], reapply: [idOf('premise:t:p')], premises: { write: [], takeOut: [] } });
    expect(back.forced).toBeNull();
    expect(item(back, 'proof:t').markers).toEqual(['seen-early']);
  });

  it('an Undo right after the Accept that set telelean’s decided force removes it: the results are hidden again (carry-over R1-3, P3)', () => {
    const initial = stateOf({
      items: [record('decl:D', 'declaration', { status: 'accepted', accepted: accepted('own') }), record('decl:E', 'declaration'), record('proof:t', 'result')],
      deps: { 'decl:E': ['decl:D'] },
      classes: { 'decl:D': BELIEF, 'decl:E': BELIEF },
      classesBeforeReveal: { 'decl:D': PLAIN, 'decl:E': BELIEF },
    });
    const done = ok(accept(initial, 'decl:E'));
    expect(done.forced).toEqual({ via: 'decided', at: AT });
    const back = ok(undo(next(initial, done)));
    expect(back.forced).toBeNull();
    expect(statuses(back)).toEqual({ 'decl:D': 'accepted', 'decl:E': 'in-review', 'proof:t': 'in-review' });
    expect(resultsState({ items: back.items, classesBeforeReveal: initial.classesBeforeReveal, forced: back.forced }).shown).toBe(false);
  });

  it('an Accept that shows the results keeps them shown when D2-23 returns a draft-only belief with the meaning item resting on it', () => {
    // D: a statement-phase definition only a premise draft reaches, accepted while the results were hidden. E: a
    // meaning item whose value uses D, the last one undecided.
    const initial = stateOf({
      items: [record('decl:D', 'declaration', { status: 'accepted', accepted: accepted('own') }), record('decl:E', 'declaration'), record('proof:t', 'result')],
      deps: { 'decl:E': ['decl:D'] },
      classes: { 'decl:D': BELIEF, 'decl:E': BELIEF },
      classesBeforeReveal: { 'decl:D': PLAIN, 'decl:E': BELIEF },
    });
    const done = ok(accept(initial, 'decl:E'));
    expect(statuses(done)).toEqual({ 'decl:D': 'in-review', 'decl:E': 'in-review', 'proof:t': 'in-review' });
    expect(done.forced).toEqual({ via: 'decided', at: AT });
    expect(resultsState({ items: done.items, classesBeforeReveal: initial.classesBeforeReveal, forced: done.forced }).shown).toBe(true);
    expect(done.stack.done[0]).toMatchObject({ kind: 'decide', startedForce: { via: 'decided', at: AT } });
    expect(item(done, 'proof:t').markers).toEqual([]);
    expect(done.events).toEqual([{ text: REVIEW_TEXTS.eventBadgesGrew, items: [idOf('decl:D')] }]);
    // Shown, D's own Accept records `classes`' badges, so it never bounces again.
    let s = next(initial, done);
    s = next(s, ok(accept(s, 'decl:D')));
    expect(item(s, 'decl:D').accepted).toMatchObject({ belief: true });
    s = next(s, ok(accept(s, 'decl:E')));
    expect(statuses(s)).toEqual({ 'decl:D': 'accepted', 'decl:E': 'accepted', 'proof:t': 'in-review' });
    // Undo goes back step by step to where it started, telelean's force included.
    while (s.stack.done.length > 0) s = next(s, ok(undo(s)));
    expect(s.forced).toBeNull();
    expect(JSON.stringify(s.items)).toBe(JSON.stringify(initial.items));
  });
});

describe('un-reject brings back what its decision commit took out (fixer 2a, V2A-C2, ADV-2)', () => {
  it('a dependent declined since it was taken out stays declined: the write takes it out again after the merge', () => {
    for (const option of ['reject', 'shaky'] as const) {
      let s = stateOf({ items: [record('card:Y', 'formalize'), record('decl:X', 'declaration')], deps: { 'decl:X': ['card:Y'] } });
      s = next(s, ok(decline(s, 'card:Y', 'reject')));
      s = next(s, ok(decline(s, 'decl:X', option)));
      expect(item(s, 'decl:X')).toMatchObject({ status: 'declined', redo: { reverted: true } });
      const back = ok(review(s, 'card:Y'));
      expect(statuses(back)).toEqual({ 'card:Y': 'in-review', 'decl:X': 'declined' });
      expect(back.write).toEqual({ action: 3, revert: [idOf('decl:X')], reapply: [idOf('card:Y')], premises: { write: [], takeOut: [] } });
    }
  });

  it('a dependent another decline keeps out stays taken out; it comes back with the decline that took it out', () => {
    const scene: Scene = {
      items: [record('vocab:V', 'vocabulary-term'), record('vocab:W', 'vocabulary-term'), record('decl:x', 'declaration')],
      deps: { 'decl:x': ['vocab:V', 'vocab:W'] },
    };
    let s = stateOf(scene);
    s = next(s, ok(decline(s, 'vocab:V', 'reject')));
    s = next(s, ok(decline(s, 'vocab:W', 'reject')));
    expect(item(s, 'decl:x').redo).toEqual({ because: [idOf('vocab:V'), idOf('vocab:W')], reverted: true });
    // V's commit took x out: its merge brings x back, and W still keeps it out, so the write takes it out again.
    const v = ok(review(s, 'vocab:V'));
    expect(item(v, 'decl:x')).toMatchObject({ status: 'to-be-redone', redo: { because: [idOf('vocab:W')], reverted: true } });
    expect(v.write).toEqual({ action: 3, revert: [idOf('decl:x')], reapply: [idOf('vocab:V')], premises: { write: [], takeOut: [] } });
    // W's commit never took x out (it was out already): its merge leaves x out, for Claude to redo at Submit review.
    const w = ok(review(next(s, v), 'vocab:W'));
    expect(item(w, 'decl:x')).toMatchObject({ status: 'to-be-redone', redo: { reverted: true } });
    expect(w.write).toEqual({ action: 4, revert: [], reapply: [idOf('vocab:W')], premises: { write: [], takeOut: [] } });
    // The other way round, x comes back with V's merge, once W is back.
    let t = stateOf(scene);
    t = next(t, ok(decline(t, 'vocab:V', 'reject')));
    t = next(t, ok(decline(t, 'vocab:W', 'reject')));
    const w1 = ok(review(t, 'vocab:W'));
    expect(w1.write).toEqual({ action: 3, revert: [], reapply: [idOf('vocab:W')], premises: { write: [], takeOut: [] } });
    const v1 = ok(review(next(t, w1), 'vocab:V'));
    expect(item(v1, 'decl:x')).toMatchObject({ status: 'to-be-redone', redo: { reverted: false } });
    expect(v1.write).toEqual({ action: 4, revert: [], reapply: [idOf('vocab:V'), idOf('decl:x')], premises: { write: [], takeOut: [] } });
  });

  it('a group decline’s merge brings back every item it took out: those still declined go out again', () => {
    let s = stateOf({ items: [record('vocab:V', 'vocabulary-term'), record('vocab:W', 'vocabulary-term')] });
    s = next(
      s,
      ok(
        reduceReview(
          s,
          {
            kind: 'decide',
            decisions: [
              { item: idOf('vocab:V'), rev: 1, to: 'declined', option: 'reject' },
              { item: idOf('vocab:W'), rev: 1, to: 'declined', option: 'reject' },
            ],
            own: false,
            confirmed: false,
          },
          AT,
        ),
      ),
    );
    expect(ok(review(s, 'vocab:V')).write).toEqual({ action: 2, revert: [idOf('vocab:W')], reapply: [idOf('vocab:V')], premises: { write: [], takeOut: [] } });
  });

  it('un-reject of an item that stays taken out brings back no dependent its commit took out: the write takes it out again (carry-over R1-3)', () => {
    // R's content was taken out by V's Reject; X, proposed later, rests on R with its content kept (RV-3).
    let s = stateOf({
      items: [
        record('vocab:V', 'vocabulary-term', { status: 'declined', decline: { option: 'reject', at: AT }, rejectedFingerprints: ['fp:vocab:V'] }),
        record('decl:R', 'declaration', { status: 'to-be-redone', redo: { because: [idOf('vocab:V')], reverted: true } }),
        record('decl:X', 'declaration', { status: 'to-be-redone', redo: { because: [idOf('decl:R')], reverted: false } }),
      ],
      deps: { 'decl:R': ['vocab:V'], 'decl:X': ['decl:R'] },
    });
    s = next(s, ok(decline(s, 'decl:R', 'reject')));
    expect(item(s, 'decl:X').redo).toEqual({ because: [idOf('decl:R')], reverted: true });
    const back = ok(review(s, 'decl:R'));
    // R stays to be redone, its content out (V is still declined), so nothing of its commit comes back.
    expect(item(back, 'decl:R')).toMatchObject({ status: 'to-be-redone', redo: { reverted: true }, rejectedFingerprints: [] });
    expect(item(back, 'decl:X').redo).toEqual({ because: [idOf('decl:R')], reverted: true });
    expect(back.write).toEqual({ action: 2, revert: [idOf('decl:X')], reapply: [], premises: { write: [], takeOut: [] } });
  });

  it('a written premise its decision commit took out comes back written, with its card and written key; the next judge sees no change (carry-over R1-1)', () => {
    let s = stateOf({
      items: [record('vocab:V', 'vocabulary-term', { status: 'accepted', accepted: accepted() }), writtenPremise('p'), record('proof:t', 'result')],
      deps: { 'premise:t:p': ['vocab:V'] },
      classes: { 'premise:t:p': BELIEF },
    });
    const rejected = ok(decline(s, 'vocab:V', 'reject', true));
    expect(rejected.write).toEqual({ action: 1, revert: [idOf('vocab:V')], reapply: [], premises: { write: [], takeOut: [idOf('premise:t:p')] } });
    s = stepFour(next(s, rejected), 'c1', ['p']);
    expect(item(s, 'premise:t:p')).toMatchObject({ status: 'to-be-redone', redo: { reverted: true }, fingerprint: 'fp:draft-p' });
    // Un-reject: the inverse merge of c1 brings the premise's card back with V; its record is the written premise again.
    const back = ok(review(s, 'vocab:V'));
    expect(item(back, 'premise:t:p')).toMatchObject({ status: 'to-be-redone', redo: { because: [idOf('vocab:V')], reverted: false }, card: 'p-card', fingerprint: 'fp:written-p' });
    expect(back.write).toEqual({ action: 2, revert: [], reapply: [idOf('vocab:V'), idOf('premise:t:p')], premises: { write: [], takeOut: [] } });
    // The next judge computes it from ws/ with its ledger entries back (the written key): nothing changes, nothing goes.
    const judged = reconcile({
      runId: RUN,
      records: recordsOf(back.items),
      judgement: judgementOf([draft('vocab:V', 'vocabulary-term'), draft('premise:t:p', 'add-premise', { contentKey: 'fp:written-p', partOfResult: 't' }), draft('proof:t', 'result')], {
        classes: { 'vocab:V': PLAIN, 'premise:t:p': BELIEF, 'proof:t': PLAIN },
        deps: { 'premise:t:p': ['vocab:V'], 'vocab:V': [], 'proof:t': [] },
      }),
      at: AT,
    });
    expect(judged.reverts).toEqual([]);
    expect(judged.events).toEqual([]);
    expect(item(judged.records, 'premise:t:p')).toEqual(item(back, 'premise:t:p'));
  });

  it('a written premise the merge brings back that something keeps out is taken out again after it, its card on its record for that take-out (carry-over R1-1)', () => {
    // P rests on V and W, Q on V; both written and accepted. V's Reject takes both out in its decision commit; then W
    // is rejected too (P is out already: W's commit takes nothing of it), and Q is declined.
    const scene: Scene = {
      items: [
        record('vocab:V', 'vocabulary-term', { status: 'accepted', accepted: accepted() }),
        record('vocab:W', 'vocabulary-term', { status: 'accepted', accepted: accepted() }),
        writtenPremise('p'),
        writtenPremise('q'),
        record('proof:t', 'result'),
      ],
      deps: { 'premise:t:p': ['vocab:V', 'vocab:W'], 'premise:t:q': ['vocab:V'] },
      classes: { 'premise:t:p': BELIEF, 'premise:t:q': BELIEF },
    };
    let s = stateOf(scene);
    s = stepFour(next(s, ok(decline(s, 'vocab:V', 'reject', true))), 'c1', ['p', 'q']);
    s = next(s, ok(decline(s, 'vocab:W', 'reject', true)));
    expect(item(s, 'premise:t:p').redo).toEqual({ because: [idOf('vocab:V'), idOf('vocab:W')], reverted: true });
    s = next(s, ok(decline(s, 'premise:t:q', 'reject')));
    const v = ok(review(s, 'vocab:V'));
    expect(item(v, 'premise:t:p')).toMatchObject({ status: 'to-be-redone', redo: { because: [idOf('vocab:W')], reverted: true }, card: 'p-card', fingerprint: 'fp:draft-p' });
    expect(item(v, 'premise:t:q')).toMatchObject({ status: 'declined', card: 'q-card', fingerprint: 'fp:draft-q' });
    expect(v.write).toEqual({ action: 4, revert: [], reapply: [idOf('vocab:V')], premises: { write: [], takeOut: [idOf('premise:t:p'), idOf('premise:t:q')] } });
    // The other way round: W's un-reject brings nothing of P back (its commit took none of it); V's then writes P again.
    const w = next(s, ok(review(s, 'vocab:W')));
    expect(item(w, 'premise:t:p')).toMatchObject({ status: 'to-be-redone', redo: { reverted: true } });
    expect(item(w, 'premise:t:p').card).toBeUndefined();
    const vw = ok(review(w, 'vocab:V'));
    expect(item(vw, 'premise:t:p')).toMatchObject({ status: 'to-be-redone', redo: { reverted: false }, card: 'p-card', fingerprint: 'fp:written-p' });
    expect(vw.write).toEqual({ action: 5, revert: [], reapply: [idOf('vocab:V'), idOf('premise:t:p')], premises: { write: [], takeOut: [idOf('premise:t:q')] } });
  });

  it('a premise written again since the decision commit took it out keeps its new card: the un-reject leaves it as it is (carry-over R1-1)', () => {
    let s = stateOf({
      items: [record('vocab:V', 'vocabulary-term', { status: 'accepted', accepted: accepted() }), writtenPremise('p'), record('proof:t', 'result')],
      deps: { 'premise:t:p': ['vocab:V'] },
      classes: { 'premise:t:p': BELIEF },
    });
    s = stepFour(next(s, ok(decline(s, 'vocab:V', 'reject', true))), 'c1', ['p']);
    // A later queue proposed it again, and it was accepted and written again, with another card and key.
    const again = writtenPremise('p', { rev: 2, card: 'p2-card', fingerprint: 'fp:written-again', accepted: accepted('own', { holdAs: 'axiom', belief: true, fingerprint: 'fp:written-again' }) });
    s = { ...s, items: s.items.map((r) => (r.key === 'premise:t:p' ? again : r)) };
    const back = ok(review(s, 'vocab:V'));
    expect(item(back, 'premise:t:p')).toEqual(again);
    expect(back.write).toEqual({ action: 2, revert: [], reapply: [idOf('vocab:V')], premises: { write: [], takeOut: [] } });
  });
});

describe('an Undo writes again only the written premises it restores to a state that keeps them in ws/ (fixer 2b1a r1)', () => {
  it('Undo of Show results, or of a back to review, whose returned written premise it keeps in review silently does not write it again: its write takes it out again', () => {
    // Show results returns E (a draft-only belief), and with it the written premise p resting on E; its write takes p out
    // (R1-2).
    let s = stateOf({
      items: [record('card:z', 'formalize'), record('decl:E', 'declaration', { status: 'accepted', accepted: accepted('group') }), writtenPremise('p'), record('proof:t', 'result')],
      deps: { 'premise:t:p': ['decl:E'] },
      classes: { 'decl:E': BELIEF, 'premise:t:p': BELIEF },
      classesBeforeReveal: { 'decl:E': PLAIN, 'premise:t:p': BELIEF },
    });
    s = stepFour(next(s, ok(reduceReview(s, { kind: 'reveal', via: 'show-result' }, AT))), 'c5', ['p']);
    // A judge since: p also rests on card:z, in review. Its restored Accept does not stand, and p, hidden after the Undo,
    // stays in review silently: in review, Claude's premise is outside ws/ (§3.1), so the inverted take-out goes again.
    const shown = ok(undo({ ...s, deps: { ...s.deps, [idOf('premise:t:p')]: [idOf('decl:E'), idOf('card:z')] } }));
    expect(item(shown, 'premise:t:p')).toMatchObject({ status: 'in-review', fingerprint: 'fp:draft-p' });
    expect(item(shown, 'premise:t:p').card).toBeUndefined();
    expect(shown.write).toEqual({ action: 1, revert: [], reapply: [], premises: { write: [], takeOut: [idOf('premise:t:p')] } });
    // The same through a decision: back to review of card:m returns p, which rests on it, to review, and its write takes
    // p out. A judge since: card:q is back in review, and p rests on it too.
    let d = stateOf({
      items: [record('card:m', 'formalize', { status: 'accepted', accepted: accepted() }), record('card:q', 'formalize', { status: 'accepted', accepted: accepted() }), writtenPremise('p'), record('proof:t', 'result')],
      deps: { 'premise:t:p': ['card:m'] },
      classes: { 'premise:t:p': BELIEF },
    });
    d = stepFour(next(d, ok(review(d, 'card:m', true))), 'c1', ['p']);
    const judged = { ...set(d, 'card:q', { status: 'in-review', accepted: undefined }), deps: { ...d.deps, [idOf('premise:t:p')]: [idOf('card:m'), idOf('card:q')] } };
    const decided = ok(undo(judged));
    expect(statuses(decided)).toMatchObject({ 'card:m': 'accepted', 'card:q': 'in-review', 'premise:t:p': 'in-review' });
    expect(item(decided, 'premise:t:p').card).toBeUndefined();
    expect(decided.write).toEqual({ action: 1, revert: [], reapply: [], premises: { write: [], takeOut: [idOf('premise:t:p')] } });
    // Without the judge, each Undo restores p's Accept and writes it again.
    for (const back of [ok(undo(s)), ok(undo(d))]) {
      expect(item(back, 'premise:t:p')).toMatchObject({ status: 'accepted', card: 'p-card', fingerprint: 'fp:written-p' });
      expect(back.write?.reapply).toEqual([idOf('premise:t:p')]);
    }
    // A hidden premise a judge changed since keeps that change, its content in ws/ included. A judge within the stage
    // reaches this state through RV-3 (builder 2b1b, carry-over R1-F2): vocab:z, which p also rests on, gets a new key
    // and rests on vocab:w, declined as Shaky, so reconcile makes z to be redone at once, and p, in review and resting on
    // z, with it: to be redone with its draft kept, unwritten. The Undo leaves p so (`skipped`), and its write takes out
    // what the inversion of c1 brings back of p.
    const withMore: ReviewState = {
      ...d,
      items: [...d.items, record('vocab:z', 'vocabulary-term'), record('vocab:w', 'vocabulary-term', { status: 'declined', decline: { option: 'shaky', at: AT } })],
    };
    const depsKey = { 'premise:t:p': ['card:m', 'vocab:z'], 'vocab:z': ['vocab:w'] };
    const rv3 = reconcile({
      runId: RUN,
      records: recordsOf([...withMore.items]),
      judgement: judgementOf(
        [
          draft('card:m', 'formalize'),
          draft('card:q', 'formalize'),
          draft('premise:t:p', 'add-premise', { contentKey: 'fp:draft-p', partOfResult: 't' }),
          draft('proof:t', 'result'),
          draft('vocab:z', 'vocabulary-term', { contentKey: 'fp:vocab:z-2' }),
          draft('vocab:w', 'vocabulary-term'),
        ],
        { classes: { 'card:m': PLAIN, 'card:q': PLAIN, 'premise:t:p': BELIEF, 'proof:t': PLAIN, 'vocab:z': PLAIN, 'vocab:w': PLAIN }, deps: depsKey },
      ),
      at: AT,
    });
    expect(rv3.problems).toEqual([]);
    expect(rv3.reverts).toEqual([]);
    expect(item(rv3.records, 'premise:t:p')).toMatchObject({ status: 'to-be-redone', redo: { because: [idOf('vocab:z')], reverted: false }, fingerprint: 'fp:draft-p' });
    expect(item(rv3.records, 'premise:t:p').card).toBeUndefined();
    const redone: ReviewState = { ...withMore, items: rv3.records.items, deps: depsById(rv3.records.items, depsKey) };
    const kept = ok(undo(redone));
    expect(item(kept, 'premise:t:p')).toEqual(item(redone, 'premise:t:p'));
    expect(kept.write?.premises.takeOut).toEqual([idOf('premise:t:p')]);
    expect(kept.write?.reapply).toEqual([]);
  });

  it('an Undo that restores a written premise’s Accept, then returns it to review with what it rests on (RV-5), does not write it again', () => {
    // The results are hidden by card:m. The written premise p was accepted while they were shown; a judge since made it
    // change what is proved too, in `classes`.
    let s = stateOf({
      items: [record('card:m', 'formalize'), record('vocab:V', 'vocabulary-term', { status: 'accepted', accepted: accepted() }), writtenPremise('p'), record('proof:t', 'result')],
      deps: { 'premise:t:p': ['vocab:V'] },
      classes: { 'premise:t:p': { ...BELIEF, changesProved: true } },
      classesBeforeReveal: { 'premise:t:p': BELIEF },
    });
    // Accepting m shows the results, and D2-23 returns p to review: the action's write takes it out.
    const shown = ok(accept(s, 'card:m'));
    expect(item(shown, 'premise:t:p').status).toBe('in-review');
    expect(shown.write?.premises.takeOut).toEqual([idOf('premise:t:p')]);
    s = stepFour(next(s, shown), 'c1', ['p']);
    // Without a judge since, the Undo restores p's Accept (the class in force after it is the one it recorded) and
    // writes p again.
    expect(item(ok(undo(s)), 'premise:t:p')).toMatchObject({ status: 'accepted', card: 'p-card' });
    // A judge since: p rests on m too. The Undo takes m's Accept away, so p, its Accept restored, returns to review with
    // it (RV-5): in review, p is outside ws/, and the write takes it out again.
    const back = ok(undo({ ...s, deps: { ...s.deps, [idOf('premise:t:p')]: [idOf('vocab:V'), idOf('card:m')] } }));
    expect(statuses(back)).toEqual({ 'card:m': 'in-review', 'vocab:V': 'accepted', 'premise:t:p': 'in-review', 'proof:t': 'in-review' });
    expect(item(back, 'premise:t:p').card).toBeUndefined();
    expect(back.write).toEqual({ action: 1, revert: [], reapply: [], premises: { write: [], takeOut: [idOf('premise:t:p')] } });
  });

  it('Undo of a Reject of a converted v1 ghost, written while in review, writes it again in review (§3.11, AF12)', () => {
    let s = stateOf({
      items: [record('card:a', 'formalize', { status: 'accepted', accepted: accepted() }), record('premise:t:g', 'add-premise', { partOf: 't', card: 'g-card', fingerprint: 'fp:written-g' }), record('proof:t', 'result')],
      classes: { 'premise:t:g': BELIEF },
    });
    const rejected = ok(decline(s, 'premise:t:g', 'reject'));
    expect(rejected.write?.premises.takeOut).toEqual([idOf('premise:t:g')]);
    s = stepFour(next(s, rejected), 'c1', ['g']);
    const back = ok(undo(s));
    expect(item(back, 'premise:t:g')).toMatchObject({ status: 'in-review', card: 'g-card', fingerprint: 'fp:written-g' });
    expect(back.write).toEqual({ action: 1, revert: [], reapply: [idOf('premise:t:g')], premises: { write: [], takeOut: [] } });
  });

  it('Undo of an un-reject whose merge brought back a written premise that its status keeps out leaves the premise as it was, whatever the write recorded; Redo takes it out again', () => {
    const P = idOf('premise:t:p');
    const V = idOf('vocab:V');
    const scene = (deps: string[]): Scene => ({
      items: [record('vocab:V', 'vocabulary-term', { status: 'accepted', accepted: accepted() }), record('vocab:W', 'vocabulary-term', { status: 'accepted', accepted: accepted() }), writtenPremise('p'), record('proof:t', 'result')],
      deps: { 'premise:t:p': deps },
      classes: { 'premise:t:p': BELIEF },
    });
    const proposedAgain = (over: Partial<ItemRecord>) => {
      let s = stateOf(scene(['vocab:V']));
      s = stepFour(next(s, ok(decline(s, 'vocab:V', 'reject', true))), 'c1', ['p']);
      // A queue (its seal) whose step proposed p again: reconcile brought it back (§3.5).
      s = next(s, ok(reduceReview(s, { kind: 'seal', by: 'submit' }, AT)));
      return set(s, 'premise:t:p', over);
    };
    // How p is kept out when V's un-reject merges back the commit that took p out (R1-1).
    const flows: Record<string, () => ReviewState> = {
      'W, also rejected, keeps it out': () => {
        let s = stateOf(scene(['vocab:V', 'vocab:W']));
        s = stepFour(next(s, ok(decline(s, 'vocab:V', 'reject', true))), 'c1', ['p']);
        return next(s, ok(decline(s, 'vocab:W', 'reject', true)));
      },
      'it was rejected with V and un-rejected alone (in review)': () => {
        let s = stateOf(scene([]));
        const decisions: ItemDecision[] = [
          { item: V, rev: 1, to: 'declined', option: 'reject' },
          { item: P, rev: 1, to: 'declined', option: 'reject' },
        ];
        s = stepFour(next(s, ok(reduceReview(s, { kind: 'decide', decisions, own: false, confirmed: true }, AT))), 'c1', ['p']);
        return next(s, ok(review(s, 'premise:t:p')));
      },
      'proposed again, in review': () => proposedAgain({ status: 'in-review', redo: undefined }),
      'proposed again, to be redone with its draft kept': () => proposedAgain({ status: 'to-be-redone', redo: { because: [], reverted: false } }),
    };
    for (const [flow, make] of Object.entries(flows)) {
      const s = make();
      expect(item(s, 'premise:t:p').card, flow).toBeUndefined();
      const un = ok(review(s, 'vocab:V'));
      expect(item(un, 'premise:t:p').card, flow).toBe('p-card');
      expect(un.write?.premises.takeOut, flow).toEqual([P]);
      expect(un.write?.reapply, flow).not.toContain(P);
      // Step 4 of that write: its commit, and p's card cleared by the take-out. p was not written when the write started
      // (its card came back with the write's own merge), so §2.2 records no take-out of it; a runner that records one
      // anyway (with no ledger entries) gets the same records from the Undo.
      const committed = set(stepFour(next(s, un), 'c3'), 'premise:t:p', { card: undefined });
      const top = committed.stack.done[committed.stack.done.length - 1] as Extract<SessionAction, { kind: 'decide' }>;
      const recorded: ReviewState = {
        ...committed,
        stack: { done: [...committed.stack.done.slice(0, -1), { ...top, takenOut: [{ item: P, card: 'p-card', fingerprint: item(un, 'premise:t:p').fingerprint, ledger: [] }] }], undone: [] },
      };
      for (const [reading, state] of [
        ['§2.2', committed],
        ['recorded', recorded],
      ] as const) {
        const back = ok(undo(state));
        expect(item(back, 'premise:t:p'), `${flow}, ${reading}`).toEqual(item(s, 'premise:t:p'));
        expect(back.write?.reapply, `${flow}, ${reading}`).toEqual([]);
        if (reading === '§2.2') expect(back.write, flow).toEqual({ action: 3, revert: [V], reapply: [], premises: { write: [], takeOut: [] } });
        // Redo: the un-reject again, through the rules; its merge brings p's card back, and its write takes p out.
        const again = ok(redo(next(state, back)));
        expect(item(again, 'premise:t:p').card, `${flow}, ${reading}`).toBe('p-card');
        expect(again.write?.premises.takeOut, `${flow}, ${reading}`).toEqual([P]);
      }
    }
  });
});

describe('an un-reject in a mixed request: what its merge brings back goes where the statuses the whole request leaves say (builder 2b1b, carry-over R1-F1)', () => {
  const V = idOf('vocab:V');
  const W = idOf('vocab:W');
  const X = idOf('decl:X');
  const P = idOf('premise:t:p');
  /** X and the written premise p rest on V and W, all accepted. */
  const SCENE_VW: Scene = {
    items: [
      record('vocab:V', 'vocabulary-term', { status: 'accepted', accepted: accepted() }),
      record('vocab:W', 'vocabulary-term', { status: 'accepted', accepted: accepted() }),
      record('decl:X', 'declaration', { declKind: 'definition', status: 'accepted', accepted: accepted() }),
      writtenPremise('p'),
      record('proof:t', 'result'),
    ],
    deps: { 'decl:X': ['vocab:V', 'vocab:W'], 'premise:t:p': ['vocab:V', 'vocab:W'] },
    classes: { 'premise:t:p': BELIEF },
  };
  /** V rejected: its decision commit c1 took X and the written premise p out (p's take-out recorded in step 4). */
  const rejectedV = (): ReviewState => {
    const s = stateOf(SCENE_VW);
    return stepFour(next(s, ok(decline(s, 'vocab:V', 'reject', true))), 'c1', ['p']);
  };
  const mixed = (s: ReviewState, decisions: Array<[string, ItemDecision['to']]>): ReviewOutcome =>
    reduceReview(
      s,
      {
        kind: 'decide',
        decisions: decisions.map(([key, to]) => ({ item: idOf(key), rev: item(s, key).rev, to, ...(to === 'declined' ? { option: 'reject' as const } : {}) })),
        own: false,
        confirmed: true,
      },
      AT,
    );

  it('[un-reject V, reject W] and [reject W, un-reject V] write alike: X and p go out again after the merge, and p is not written again', () => {
    const s = rejectedV();
    expect(item(s, 'premise:t:p')).toMatchObject({ status: 'to-be-redone', redo: { because: [V], reverted: true }, fingerprint: 'fp:draft-p' });
    const first = ok(mixed(s, [['vocab:V', 'in-review'], ['vocab:W', 'declined']]));
    const second = ok(mixed(s, [['vocab:W', 'declined'], ['vocab:V', 'in-review']]));
    for (const [order, out] of [
      ['un-reject first', first],
      ['Reject first', second],
    ] as const) {
      expect(out.write, order).toEqual({ action: 2, revert: [W, X], reapply: [V], premises: { write: [], takeOut: [P] } });
      expect(statuses(out), order).toEqual({ 'vocab:V': 'in-review', 'vocab:W': 'declined', 'decl:X': 'to-be-redone', 'premise:t:p': 'to-be-redone', 'proof:t': 'in-review' });
      expect(item(out, 'decl:X').redo?.reverted, order).toBe(true);
      // p's record holds the card the merge brings back, for the take-out, and its draft key: never the written one.
      expect(item(out, 'premise:t:p'), order).toMatchObject({ redo: { reverted: true }, card: 'p-card', fingerprint: 'fp:draft-p' });
      expect(item(out, 'vocab:W').rejectedFingerprints, order).toEqual(['fp:vocab:W']);
    }
  });

  it('[un-reject V, reject p] rejects p’s draft key, never its written one, and takes p out again; X, which nothing keeps out, stays back', () => {
    const out = ok(mixed(rejectedV(), [['vocab:V', 'in-review'], ['premise:t:p', 'declined']]));
    expect(out.write).toEqual({ action: 2, revert: [], reapply: [V, X], premises: { write: [], takeOut: [P] } });
    expect(item(out, 'premise:t:p')).toMatchObject({ status: 'declined', card: 'p-card', fingerprint: 'fp:draft-p', rejectedFingerprints: ['fp:draft-p'] });
    expect(item(out, 'premise:t:p').redo).toBeUndefined();
    expect(item(out, 'decl:X')).toMatchObject({ status: 'to-be-redone', redo: { reverted: false } });
    // Its Undo restores the records the request started from; nothing of p is written again.
    const back = ok(undo(set(stepFour(next(rejectedV(), out), 'c2'), 'premise:t:p', { card: undefined })));
    expect(item(back, 'premise:t:p')).toEqual(item(rejectedV(), 'premise:t:p'));
    expect(back.write).toEqual({ action: 2, revert: [V, X], reapply: [], premises: { write: [], takeOut: [] } });
  });

  it('[un-reject V, back to review p]: a premise the merge brings back and the request leaves in review is taken out again (in review, Claude’s premise is outside ws/)', () => {
    const out = ok(mixed(rejectedV(), [['vocab:V', 'in-review'], ['premise:t:p', 'in-review']]));
    expect(out.write).toEqual({ action: 2, revert: [], reapply: [V, X], premises: { write: [], takeOut: [P] } });
    expect(item(out, 'premise:t:p')).toMatchObject({ status: 'in-review', card: 'p-card', fingerprint: 'fp:draft-p' });
    expect(item(out, 'premise:t:p').redo).toBeUndefined();
  });

  it('a later un-reject of W, which a request that also un-rejected V declined, is refused (fixer 2b1b r1, S-F5); Undo of that request undoes both; W rejected alone is un-rejected as before', () => {
    const s = rejectedV();
    const after = stepFour(next(s, ok(mixed(s, [['vocab:V', 'in-review'], ['vocab:W', 'declined']]))), 'c2', ['p']);
    const label = 'Vocabulary term W';
    const refusal = mixed(after, [['vocab:W', 'in-review']]);
    expect(refusal).toEqual({ ok: false, code: 'refused', error: REVIEW_TEXTS.unrejectMixed(label), item: W });
    expect(REVIEW_TEXTS.unrejectMixed(label)).toBe(
      '“Vocabulary term W” was declined in the same decision that un-rejected another item, so it cannot be un-rejected alone: undo that decision instead, then decide again.',
    );
    const back = ok(undo(after));
    expect(statuses(back)).toEqual(statuses(s));
    // A Reject in a request with no un-reject: its un-reject brings back what its commit took out (V2A-C2).
    const alone = stepFour(next(s, ok(mixed(s, [['vocab:W', 'declined']]))), 'c2');
    expect(ok(mixed(alone, [['vocab:W', 'in-review']])).write?.reapply).toContain(W);
  });

  it('two un-rejects in one request bring back what the first one alone would keep out: [un-reject V, un-reject W] after a group Reject', () => {
    let s = stateOf(SCENE_VW);
    s = stepFour(next(s, ok(mixed(s, [['vocab:V', 'declined'], ['vocab:W', 'declined']]))), 'c1', ['p']);
    expect(item(s, 'premise:t:p').redo).toEqual({ because: [V, W], reverted: true });
    for (const order of [
      ['vocab:V', 'vocab:W'],
      ['vocab:W', 'vocab:V'],
    ]) {
      const out = ok(mixed(s, order.map((key) => [key, 'in-review'] as [string, ItemDecision['to']])));
      expect(out.write, order.join(', ')).toEqual({ action: 2, revert: [], reapply: [V, W, X, P], premises: { write: [], takeOut: [] } });
      expect(item(out, 'premise:t:p'), order.join(', ')).toMatchObject({ status: 'to-be-redone', redo: { reverted: false }, card: 'p-card', fingerprint: 'fp:written-p' });
      expect(item(out, 'decl:X').redo?.reverted, order.join(', ')).toBe(false);
    }
  });
});

describe('the properties of §4.6 on random sequences', () => {
  /**
   * Statements, vocabulary, definitions, two Results, Claude's arrow and an Add premise, with real dependencies. decl:e
   * is a belief only with the premise drafts (D2-42), and card:s1 rests on it: D2-23 at a show returns both (ADV-1).
   */
  const SCENE: Scene = {
    items: [
      record('card:s1', 'formalize'),
      record('card:s2', 'formalize'),
      record('vocab:v', 'vocabulary-term'),
      record('decl:d', 'declaration', { declKind: 'definition' }),
      record('decl:e', 'declaration', { declKind: 'definition' }),
      record('proof:t', 'result', { judged: { verdict: 'proved', restsOn: [], deps: ['arrow:x>t', 'card:s1'] } }),
      record('arrow:x>t', 'add-arrow', { partOf: 't' }),
      record('premise:t:p', 'add-premise', { partOf: 't' }),
      record('proof:u', 'result', { origin: { step: 's2', target: 'u', phase: 'proof' }, judged: { verdict: 'proved', restsOn: [], deps: ['proof:t'] } }),
    ],
    deps: { 'card:s2': ['vocab:v'], 'decl:e': ['decl:d'], 'proof:t': ['card:s1', 'arrow:x>t'], 'proof:u': ['proof:t'], 'card:s1': ['decl:e'] },
    classes: { 'decl:d': BELIEF, 'decl:e': BELIEF, 'arrow:x>t': CHANGES, 'premise:t:p': BELIEF },
    classesBeforeReveal: { 'decl:d': BELIEF, 'decl:e': PLAIN, 'arrow:x>t': CHANGES, 'premise:t:p': BELIEF },
    inferences: [
      { target: 't', question: { sources: ['a', 'x'], fromNothing: false }, order: 0, steps: ['s1'] },
      { target: 'u', question: { sources: ['t'], fromNothing: false }, order: 1, steps: ['s2'] },
    ],
    questionArrows: { 'proof:t': ['arrow:x>t'] },
  };
  const keys = SCENE.items.map((r) => r.key);

  function rng(seed: number) {
    let x = seed >>> 0 || 1;
    return (n: number) => {
      x ^= x << 13;
      x >>>= 0;
      x ^= x >>> 17;
      x ^= x << 5;
      x >>>= 0;
      return x % n;
    };
  }

  /** RV-5: every accepted item's dependencies outside its SCC are accepted. */
  function rv5Holds(s: ReviewState): boolean {
    const component = componentOf(
      s.items.map((r) => r.id),
      (id) => s.deps[id] ?? [],
    );
    const status = new Map(s.items.map((r) => [r.id, r.status]));
    return s.items.every((r) => r.status !== 'accepted' || (s.deps[r.id] ?? []).every((d) => component.get(d) === component.get(r.id) || status.get(d) === 'accepted'));
  }
  /** RV-7: every accepted item's recorded badges cover its class in force (`classes` while shown, else before). */
  function badgesCover(s: ReviewState): boolean {
    const map = resultsState({ items: s.items, classesBeforeReveal: s.classesBeforeReveal, forced: s.forced }).shown ? s.classes : s.classesBeforeReveal;
    return s.items.every((r) => {
      if (r.status !== 'accepted' || r.accepted === undefined) return true;
      const cls = map[r.key];
      return cls !== undefined && !((cls.belief && !r.accepted.belief) || (cls.changesProved && !r.accepted.changesProved));
    });
  }
  const hiddenNow = (s: ReviewState, id: string) => {
    const r = s.items.find((x) => x.id === id);
    if (r === undefined || (r.kind !== 'result' && r.partOf === undefined)) return false;
    const undecided = s.items.some((x) => (x.kind === 'formalize' || (s.classesBeforeReveal[x.key]?.belief ?? true)) && x.kind !== 'result' && x.partOf === undefined && (x.status === 'in-review' || (x.status === 'to-be-redone' && x.redo?.reverted !== true)));
    return undecided && s.forced === null;
  };
  const strip = (items: readonly ItemRecord[]) => JSON.stringify(items.map((r) => ({ ...r, markers: r.markers.filter((m) => m !== 'seen-early') })));

  /**
   * A judge between actions (ADV-6): new classes (a premise draft may only add a belief) and one dependency more or
   * less, applied by reconcile, which returns what RV-7, RV-5 and RV-11 now ask for. Drafts keep every key.
   */
  function judge(s: ReviewState, depsKey: Record<string, string[]>, pick: (n: number) => number): { state: ReviewState; depsKey: Record<string, string[]> } {
    const deps: Record<string, string[]> = Object.fromEntries(keys.map((k) => [k, [...(depsKey[k] ?? [])]]));
    const from = keys[pick(keys.length)] as string;
    const to = keys[pick(keys.length)] as string;
    if (from !== to) deps[from] = (deps[from] ?? []).includes(to) ? (deps[from] ?? []).filter((k) => k !== to) : [...(deps[from] ?? []), to];
    const kinds = [PLAIN, BELIEF, CHANGES];
    const classesBeforeReveal: Record<string, ItemClass> = {};
    const classes: Record<string, ItemClass> = {};
    for (const key of keys) {
      const before = kinds[pick(3)] as ItemClass;
      classesBeforeReveal[key] = before;
      classes[key] = pick(4) === 0 ? { ...before, belief: true } : before;
    }
    const drafts = s.items.flatMap((r) => {
      if (r.status === 'withdrawn') return [];
      const inWs = inWorkingCopy(r.kind, r, r.card);
      const partOf = r.partOf !== undefined ? { partOfResult: r.partOf } : {};
      if (r.kind === 'result') return [draft(r.key, r.kind, inWs ? { contentKey: r.fingerprint } : { contentKey: 'fp:base', asInBase: true })];
      return r.kind === 'add-premise' || inWs ? [draft(r.key, r.kind, { contentKey: r.fingerprint, ...partOf })] : [];
    });
    const judgement = judgementOf(drafts, { classes, classesBeforeReveal, deps, inferences: { t: inferenceJudgement('t'), u: inferenceJudgement('u') } });
    const records = recordsOf([...s.items], { inferences: [...s.inferences], rejectedArrows: [...s.rejectedArrows], ...(s.forced !== null ? { forced: s.forced } : {}) });
    const out = reconcile({ runId: RUN, records, judgement, at: AT });
    expect(out.problems).toEqual([]);
    return { state: { ...s, items: out.records.items, forced: out.records.forced ?? null, classes, classesBeforeReveal, deps: depsById(out.records.items, deps) }, depsKey: deps };
  }

  const P = idOf('premise:t:p');
  /** The premise's written key, and its draft key (§3.8, F11). */
  const WRITTEN = 'fp:written-p';
  const DRAFT = 'fp:premise:t:p';
  /**
   * The same, with the Add premise written and accepted, resting on vocab:v and card:s2 (both accepted), and Result t
   * resting on it (§3.8: its decline makes T's Result to be redone); the person's force shows the results, so its
   * decisions are open. Its decisions pick the premise and what it rests on more often (`PREMISE_PICKS`), so its writes
   * run often, un-rejects with two takers included.
   */
  const PREMISE_SCENE: Scene = {
    ...SCENE,
    items: SCENE.items.map((r) => {
      if (r.key === 'vocab:v' || r.key === 'card:s2') return { ...r, status: 'accepted' as const, accepted: accepted() };
      if (r.key !== 'premise:t:p') return r;
      return { ...r, status: 'accepted' as const, accepted: accepted('own', { holdAs: 'axiom', belief: true, fingerprint: WRITTEN }), card: 'p-card-0', fingerprint: WRITTEN };
    }),
    deps: { ...SCENE.deps, 'premise:t:p': ['vocab:v', 'card:s2'], 'proof:t': ['card:s1', 'arrow:x>t', 'premise:t:p'] },
    forced: { via: 'show-result', at: AT },
  };
  const PREMISE_PICKS = [...keys, 'vocab:v', 'vocab:v', 'vocab:v', 'card:s2', 'card:s2', 'premise:t:p', 'premise:t:p', 'premise:t:p'];
  const shownIn = (x: ReviewState) => resultsState({ items: x.items, classesBeforeReveal: x.classesBeforeReveal, forced: x.forced }).shown;
  /** A written premise's status keeps it in ws/ (§3.1, §3.8; no converted v1 ghost here). */
  const keepsIn = (r: ItemRecord) => r.status === 'accepted' || (r.status === 'declined' && r.decline?.option === 'shaky') || (r.status === 'to-be-redone' && r.redo?.reverted !== true);

  /**
   * The runner's side of the Add premise, as §2.9's ItemWrite and §3.8 state it: its card in ws/, whether its ledger
   * entries are there, and the actions whose write's own merge brought its card back (an un-reject, R1-1). `seen`
   * counts the paths taken, so the property is known to reach them.
   */
  interface World {
    card?: string;
    ledger: boolean;
    mergedIn: Set<number>;
    cards: number;
    seen: {
      written: number;
      recorded: number;
      mergedBack: number;
      mergedOut: number;
      /** (builder 2b1b, R1-F1) A mixed request whose un-reject merge brought the card back and whose decline kept it out. */
      mixedOut: number;
      undoneBack: number;
      undoneOut: number;
      judgedOut: number;
    };
  }

  /**
   * ws/ and the premise's record agree: it holds exactly the card in ws/, with its written key and ledger entries, only
   * while its status keeps it there; and (builder 2b1b, R1-F3) an accepted premise is written once its step has been
   * carried out, so a reducer that never schedules its write, or never puts its card back, fails here.
   */
  function agree(s: ReviewState, world: World, where: string): void {
    const r = item(s, 'premise:t:p');
    expect(r.card, `${where}: the record's card is the one in ws/`).toBe(world.card);
    expect(world.ledger, `${where}: its ledger entries are there exactly while it is written`).toBe(world.card !== undefined);
    if (r.status === 'accepted') expect(world.card, `${where}: an accepted premise is written`).toBeDefined();
    if (world.card === undefined) return;
    expect(r.fingerprint, `${where}: a written premise holds its written key`).toBe(WRITTEN);
    expect(keepsIn(r), `${where}: a written premise has a status that keeps it in ws/ (${r.status})`).toBe(true);
  }

  /**
   * One action's write, carried out as §2.9 says, then its step 4 and the premise write it makes due (§2.6, §3.8). An
   * un-reject's merge brings back a premise its declining commit took out (R1-1): written again (`reapply`, the runner
   * putting its ledger entries back), or kept out (`premises.takeOut`, its record holding the card for that take-out). An
   * Undo first inverts its action's commits, newest first: the take-outs come back with their ledger entries, then the
   * merge goes. The take-outs come last; step 4 records in the action's `takenOut` only a premise that was written when
   * the write started, and clears its record.
   */
  function carryOut(s: ReviewState, outcome: Extract<ReviewOutcome, { ok: true }>, isUndo: boolean, world: World, where: string): ReviewState {
    const W = outcome.write;
    let r = item(s, 'premise:t:p');
    const done = [...s.stack.done];
    if (W !== null) {
      const writtenAtStart = world.card !== undefined;
      if (isUndo) {
        const action = s.stack.undone[s.stack.undone.length - 1] as Extract<SessionAction, { kind: 'decide' | 'reveal' }>;
        expect(action.id, where).toBe(W.action);
        // AF2 (builder 2b1b, R1-F3): an Undo that restores the Accept of a premise its action took out puts that card
        // back (`reapply`); it never writes a fresh one in its place.
        if (r.status === 'accepted' && action.takenOut.some((t) => t.item === P)) {
          expect(W.reapply, `${where}: an Undo that restores the Accept puts the taken-out card back`).toContain(P);
          expect(W.premises.write, `${where}: an Undo that restores the Accept writes no fresh card`).not.toContain(P);
        }
        for (const t of action.takenOut) {
          if (t.item !== P) continue;
          world.card = t.card;
          world.ledger = t.ledger.length > 0;
        }
        if (world.mergedIn.delete(action.id)) world.card = undefined;
        if (W.reapply.includes(P)) {
          expect(r.card, `${where}: an Undo writes again the card its inversion brought back`).toBe(world.card);
          world.seen.undoneBack++;
        }
        if (W.premises.takeOut.includes(P) && world.card !== undefined) world.seen.undoneOut++;
      } else if (W.reapply.includes(P) || (W.premises.takeOut.includes(P) && !writtenAtStart && r.card !== undefined)) {
        expect(world.card, `${where}: a merge brings back a card that is out`).toBeUndefined();
        world.card = r.card;
        world.ledger = W.reapply.includes(P);
        world.mergedIn.add(W.action);
        if (W.reapply.includes(P)) world.seen.mergedBack++;
        else {
          world.seen.mergedOut++;
          // R1-F1's path: the un-reject came first and the Reject after it is of p, or of an item p rests on.
          const top = done[done.length - 1];
          const decisions = top?.kind === 'decide' ? top.request.decisions : [];
          const unreject = decisions.findIndex((d) => d.to === 'in-review');
          const reject = decisions.findIndex((d) => d.to === 'declined');
          const declined = decisions[reject]?.item;
          if (unreject >= 0 && reject > unreject && declined !== undefined && (declined === P || (s.deps[P] ?? []).includes(declined))) world.seen.mixedOut++;
        }
      }
      if (W.premises.takeOut.includes(P)) {
        if (!isUndo && writtenAtStart && world.card !== undefined) {
          const top = done[done.length - 1] as Extract<SessionAction, { kind: 'decide' | 'reveal' }>;
          const entry: LedgerEntry = { kind: 'premise', card: world.card, target: 't', holdAs: 'axiom', item: 'premise:t:p', commit: 'c0' };
          done[done.length - 1] = { ...top, takenOut: [...top.takenOut, { item: P, card: world.card, fingerprint: r.fingerprint, ledger: world.ledger ? [entry] : [] }] };
          world.seen.recorded++;
        }
        world.card = undefined;
        world.ledger = false;
        r = { ...r, fingerprint: DRAFT };
        delete r.card;
      }
      if (!isUndo) {
        const top = done[done.length - 1] as Extract<SessionAction, { kind: 'decide' | 'reveal' }>;
        expect(top.id, where).toBe(W.action);
        done[done.length - 1] = { ...top, commits: [...top.commits, `c${W.action}`] };
      }
    }
    // The premise write that is due (§3.8): only the one the action's write schedules (`premises.write`), for an accepted
    // premise with no card (builder 2b1b, R1-F3: a write the reducer did not schedule is never carried out here).
    if (W?.premises.write.includes(P) === true) {
      expect(r.status, `${where}: a scheduled premise write is for an accepted premise`).toBe('accepted');
      expect(r.card, `${where}: a scheduled premise write is for an unwritten premise`).toBeUndefined();
      world.card = `p-card-${++world.cards}`;
      world.ledger = true;
      r = { ...r, card: world.card, fingerprint: WRITTEN, accepted: { ...(r.accepted as NonNullable<ItemRecord['accepted']>), fingerprint: WRITTEN } };
      world.seen.written++;
    }
    const out: ReviewState = { ...s, items: s.items.map((x) => (x.id === P ? r : x)), stack: { done, undone: s.stack.undone } };
    agree(out, world, where);
    return out;
  }

  /** The judge-apply write takes out a written premise that reconcile gave a status keeping it out (§3.8). */
  function judgeApply(s: ReviewState, world: World, where: string): ReviewState {
    const r = item(s, 'premise:t:p');
    let out = s;
    if (world.card !== undefined && !keepsIn(r)) {
      world.card = undefined;
      world.ledger = false;
      const taken: ItemRecord = { ...r, fingerprint: DRAFT };
      delete taken.card;
      out = { ...s, items: s.items.map((x) => (x.id === P ? taken : x)) };
      world.seen.judgedOut++;
    }
    agree(out, world, where);
    return out;
  }

  interface Options {
    /** Show results among the actions. */
    reveals: boolean;
    /** A judge between actions (ADV-6). */
    judges: boolean;
    /** No Result or Result's part is decided while a force holds (see below). */
    noResultUnderForce: boolean;
    /** PREMISE_SCENE, with the runner's writes of its Add premise carried out (`carryOut`) and checked after every step. */
    premises?: World;
  }

  /**
   * A random sequence. With a force, an Undo that makes a meaning item undecided ends it (§4.7), and a Result decided
   * under it can then be undone only once the results are shown again (D2-8), so the undo-everything property is checked
   * on sequences where no Result is decided under a force.
   */
  function run(seed: number, o: Options): { initial: ReviewState; final: ReviewState } {
    const pick = rng(seed * 7919);
    const world = o.premises;
    const scene = world !== undefined ? PREMISE_SCENE : SCENE;
    const initial = stateOf(scene);
    let s = initial;
    let depsKey: Record<string, string[]> = { ...(scene.deps ?? {}) };
    const resultOrPart = (id: string) => {
      const r = s.items.find((x) => x.id === id);
      return r !== undefined && (r.kind === 'result' || r.partOf !== undefined);
    };
    const skip = (ids: readonly string[]) => o.noResultUnderForce && s.forced !== null && ids.some(resultOrPart);
    if (world !== undefined) Object.assign(world, { card: item(initial, 'premise:t:p').card, ledger: true, mergedIn: new Set<number>() });
    const picks = world !== undefined ? PREMISE_PICKS : keys;
    for (let step = 0; step < 40; step++) {
      if (o.judges && pick(5) === 0) {
        ({ state: s, depsKey } = judge(s, depsKey, pick));
        if (world !== undefined) s = judgeApply(s, world, `seed ${seed} step ${step}: judge`);
        expect(rv5Holds(s), `seed ${seed} step ${step}: RV-5 after a judge`).toBe(true);
        expect(badgesCover(s), `seed ${seed} step ${step}: badges after a judge`).toBe(true);
      }
      // With the Add premise's world, one roll in eleven is a mixed request (builder 2b1b, R1-F1).
      const roll = pick(world !== undefined ? 11 : 10);
      let outcome: ReviewOutcome;
      let named: string[] = [];
      /** Show results, or its Redo: its answer is about the results it shows. */
      let shows = false;
      let isUndo = false;
      if (roll < 5) {
        const key = picks[pick(picks.length)] as string;
        const r = item(s, key);
        const to = (['accepted', 'declined', 'in-review'] as const)[pick(3)] as ItemDecision['to'];
        const d: ItemDecision = {
          item: r.id,
          rev: r.rev,
          to,
          ...(to === 'declined' ? { option: pick(2) === 0 ? 'reject' : 'shaky' } : {}),
          ...(to === 'accepted' && r.kind === 'add-premise' ? { holdAs: 'axiom' } : {}),
        };
        named = [r.id];
        const own = pick(2) === 0;
        const confirmed = pick(3) > 0;
        if (skip(named)) continue;
        outcome = reduceReview(s, { kind: 'decide', decisions: [d], own, confirmed }, AT);
      } else if (roll < 6) {
        const chosen = [...new Set([keys[pick(keys.length)], keys[pick(keys.length)], keys[pick(keys.length)]])] as string[];
        named = chosen.map(idOf);
        if (skip(named)) continue;
        outcome = group(s, chosen);
      } else if (roll < 7) {
        if (!o.reveals) continue;
        shows = true;
        outcome = reduceReview(s, { kind: 'reveal', via: 'show-result' }, AT);
      } else if (roll < 9) {
        const top = s.stack.done[s.stack.done.length - 1];
        if (top?.kind === 'decide') named = top.request.decisions.map((x) => x.item);
        isUndo = true;
        outcome = undo(s, pick(2) === 0);
      } else if (roll < 10) {
        const top = s.stack.undone[s.stack.undone.length - 1];
        if (top?.kind === 'decide') named = top.request.decisions.map((x) => x.item);
        shows = top?.kind === 'reveal';
        const confirmed = pick(2) === 0;
        if (skip(named)) continue;
        outcome = redo(s, confirmed);
      } else {
        // A mixed request (R1-F1): one item back to review (mostly an un-reject of a rejected item, when there is one) and
        // another rejected, in either order, so a Reject in the same request can keep out what the un-reject's merge
        // brings back.
        const rejected = s.items.filter((x) => x.status === 'declined' && x.decline?.option !== 'shaky');
        const a = rejected.length > 0 && pick(4) > 0 ? (rejected[pick(rejected.length)] as ItemRecord) : item(s, picks[pick(picks.length)] as string);
        const b = item(s, picks[pick(picks.length)] as string);
        if (a.id === b.id) continue;
        const back: ItemDecision = { item: a.id, rev: a.rev, to: 'in-review' };
        const out: ItemDecision = { item: b.id, rev: b.rev, to: 'declined', option: 'reject' };
        named = [a.id, b.id];
        const decisions = pick(2) === 0 ? [back, out] : [out, back];
        const confirmed = pick(3) > 0;
        if (skip(named)) continue;
        outcome = reduceReview(s, { kind: 'decide', decisions, own: false, confirmed }, AT);
      }
      if (!outcome.ok) continue;
      // No decision, Undo and Redo included, named a hidden item: it was refused, or a group left it.
      for (const id of outcome.taken) if (named.includes(id)) expect(hiddenNow(s, id), `seed ${seed} step ${step}: decided hidden ${id}`).toBe(false);
      // No answer names a Result or a Result's part while the results are hidden, when the action is asked or after it
      // (D2-64, §2.9; builder 2b1a's rule, fixer 2b1a r1): its cascade and events name listed items only.
      const after = next(s, outcome);
      if (!shows && (!shownIn(s) || !shownIn(after))) {
        const mentioned = [...outcome.cascade.map((c) => c.item), ...outcome.events.flatMap((e) => e.items)];
        for (const id of mentioned) expect(resultOrPart(id), `seed ${seed} step ${step}: ${id} named while the results are hidden`).toBe(false);
      }
      s = world !== undefined ? carryOut(after, outcome, isUndo, world, `seed ${seed} step ${step}`) : after;
      expect(rv5Holds(s), `seed ${seed} step ${step}`).toBe(true);
      expect(badgesCover(s), `seed ${seed} step ${step}: badges`).toBe(true);
    }
    return { initial, final: s };
  }

  it('RV-5 and RV-7 hold after every step, judges, Undos and Redos included, and no decision names a hidden item', () => {
    for (let seed = 1; seed <= 80; seed++) run(seed, { reveals: true, judges: false, noResultUnderForce: false });
    for (let seed = 1; seed <= 80; seed++) run(seed, { reveals: true, judges: true, noResultUnderForce: false });
  });

  it('ws/ and the Add premise’s record agree after every step, each write carried out as §2.9 says: un-rejects, Undos, Show results and judges included (fixer 2b1a r1)', () => {
    const world: World = {
      ledger: false,
      mergedIn: new Set(),
      cards: 0,
      seen: { written: 0, recorded: 0, mergedBack: 0, mergedOut: 0, mixedOut: 0, undoneBack: 0, undoneOut: 0, judgedOut: 0 },
    };
    for (const judges of [false, true]) {
      for (let seed = 1; seed <= 200; seed++) run(seed, { reveals: true, judges, noResultUnderForce: false, premises: world });
    }
    // Every path of the premise's writes ran.
    for (const [path, n] of Object.entries(world.seen)) expect(n, path).toBeGreaterThan(0);
  });

  it('undoing every action of a sequence gives back the records it started from (F4), Show results included', () => {
    let undone = 0;
    let reveals = 0;
    for (const withReveals of [false, true]) {
      for (let seed = 1; seed <= 80; seed++) {
        const { initial, final } = run(seed, { reveals: withReveals, judges: false, noResultUnderForce: true });
        reveals += final.stack.done.filter((a) => a.kind === 'reveal').length;
        let s = final;
        while (s.stack.done.length > 0) {
          s = next(s, ok(undo(s)));
          undone++;
        }
        expect(strip(s.items), `seed ${seed}, reveals ${withReveals}`).toBe(strip(initial.items));
        expect(s.inferences).toEqual(initial.inferences);
        expect(s.rejectedArrows).toEqual(initial.rejectedArrows);
        expect(s.forced).toBeNull();
      }
    }
    expect(undone).toBeGreaterThan(200);
    expect(reveals).toBeGreaterThan(10);
  });
});
