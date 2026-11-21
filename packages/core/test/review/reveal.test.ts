/**
 * Slice 2a2 (docs/slice2-plan.md 4.7, 6.1): the stage reveal rule (`resultsState`), and how the reducer and reconcile
 * move it: the force of Show results, AF4's undecided items to be redone, and F1's case on real models.
 */
import { describe, expect, it } from 'vitest';
import { classify } from '../../src/review/classify.js';
import { itemDeps } from '../../src/review/deps.js';
import { computeItems } from '../../src/review/items.js';
import { reconcile } from '../../src/review/reconcile.js';
import { acceptGate, reduceReview } from '../../src/review/reducer.js';
import { resultsState } from '../../src/review/reveal.js';
import { depsById } from '../../src/review/records.js';
import type { ItemRecord, ReviewState } from '../../src/review/types.js';
import { AT, BELIEF, RUN, draft, idOf, item, judgementOf, next, record, recordsOf, stateOf, type Scene } from './helpers/records.js';
import { BASE, INFERENCE, TARGET, VOCAB, append, created, draftOf, modelOf } from './helpers/session.js';

const accepted = { how: 'own' as const, fingerprint: 'fp', belief: false, changesProved: false, at: AT };
const reveal = (items: ItemRecord[], classesBeforeReveal: Record<string, typeof BELIEF> = {}, forced: ReviewState['forced'] = null) =>
  resultsState({ items, classesBeforeReveal, forced });
const ok = <T extends { ok: boolean }>(o: T): Extract<T, { ok: true }> => {
  if (!o.ok) throw new Error(JSON.stringify(o));
  return o as Extract<T, { ok: true }>;
};

describe('resultsState (§4.7)', () => {
  it('shown when no statement or belief item is undecided; hidden as soon as one is in review', () => {
    const items = [
      record('card:a', 'formalize', { status: 'accepted', accepted }),
      record('decl:D', 'declaration', { status: 'declined', decline: { option: 'reject', at: AT } }),
      record('proof:t', 'result'),
      // Results' parts, plain vocabulary, and items to be redone whose content was taken out never count.
      record('arrow:x>t', 'add-arrow', { partOf: 't' }),
      record('premise:t:p', 'add-premise', { partOf: 't' }),
      record('decl:L', 'declaration', { partOf: 't' }),
      record('vocab:V', 'vocabulary-term'),
      record('card:r', 'formalize', { status: 'to-be-redone', redo: { because: ['x'], reverted: true } }),
    ];
    const classes = { 'decl:D': BELIEF, 'decl:L': BELIEF, 'premise:t:p': BELIEF, 'vocab:V': { ...BELIEF, belief: false } };
    expect(reveal(items, classes)).toEqual({ shown: true, meaning: ['card:a', 'decl:D', 'card:r'].map(idOf), waitingFor: [] });
    const inReview = [...items, record('card:b', 'change')];
    expect(reveal(inReview, classes)).toEqual({ shown: false, meaning: ['card:a', 'decl:D', 'card:r', 'card:b'].map(idOf), waitingFor: [idOf('card:b')] });
    // A belief item counts; an item the judgement gave no class counts as one (fail closed).
    expect(reveal([...items, record('decl:B', 'declaration')], { ...classes, 'decl:B': BELIEF }).waitingFor).toEqual([idOf('decl:B')]);
    expect(reveal([...items, record('decl:N', 'declaration')], classes).waitingFor).toEqual([idOf('decl:N')]);
    // A statement to be redone with its content still in ws/ is undecided (AF4).
    expect(reveal([...items, record('card:k', 'formalize', { status: 'to-be-redone', redo: { because: ['x'], reverted: false } })], classes).shown).toBe(false);
    // Show results forces them while something is undecided.
    expect(reveal(inReview, classes, { via: 'show-result', at: AT }).shown).toBe(true);
  });
});

describe('the force, and AF4’s statements to be redone with their content kept', () => {
  it('Show results forces them, marking every Result seen early, until a statement or belief item becomes undecided', () => {
    let s = stateOf({ items: [record('card:a', 'formalize'), record('card:b', 'formalize', { status: 'accepted', accepted }), record('proof:t', 'result'), record('proof:u', 'result')] });
    const shown = ok(reduceReview(s, { kind: 'reveal', via: 'show-result' }, AT));
    expect(shown.forced).toEqual({ via: 'show-result', at: AT });
    expect(shown.stack.done).toEqual([{ id: 1, kind: 'reveal', label: 'Show results', force: { via: 'show-result', at: AT }, changes: [], takenOut: [], commits: [] }]);
    expect(item(shown, 'proof:t').markers).toEqual(['seen-early']);
    expect(item(shown, 'proof:u').markers).toEqual(['seen-early']);
    s = next(s, shown);
    // Showing them again changes nothing; deciding a Result is allowed now.
    expect(ok(reduceReview(s, { kind: 'reveal', via: 'raw-diff' }, AT)).stack).toBe(s.stack);
    s = next(s, ok(reduceReview(s, { kind: 'decide', decisions: [{ item: idOf('proof:t'), rev: 1, to: 'accepted' }], own: true, confirmed: false }, AT)));
    // Back to review on a statement ends the force: hidden again; the action records the force it ended.
    const back = ok(reduceReview(s, { kind: 'decide', decisions: [{ item: idOf('card:b'), rev: 1, to: 'in-review' }], own: false, confirmed: false }, AT));
    expect(back.forced).toBeNull();
    expect(resultsState({ items: back.items, classesBeforeReveal: s.classesBeforeReveal, forced: back.forced }).shown).toBe(false);
    expect(back.stack.done[2]).toMatchObject({ kind: 'decide', endedForce: { via: 'show-result', at: AT } });
    // Its Undo puts the force back.
    const undone = ok(reduceReview(next(s, back), { kind: 'undo', step: 3, confirmed: true }, AT));
    expect(undone.forced).toEqual({ via: 'show-result', at: AT });
  });

  it('Undo of Show results hides them again and keeps the seen-early markers', () => {
    let s = stateOf({ items: [record('card:a', 'formalize'), record('proof:t', 'result')] });
    s = next(s, ok(reduceReview(s, { kind: 'reveal', via: 'activity' }, AT)));
    const undone = ok(reduceReview(s, { kind: 'undo', step: 1, confirmed: true }, AT));
    expect(undone.forced).toBeNull();
    expect(item(undone, 'proof:t').markers).toEqual(['seen-early']);
    expect(resultsState({ items: undone.items, classesBeforeReveal: s.classesBeforeReveal, forced: undone.forced }).shown).toBe(false);
  });

  it('a Shaky decline’s cascade makes an accepted statement undecided: the results are hidden again', () => {
    const scene: Scene = {
      items: [record('decl:D', 'declaration', { status: 'accepted', accepted: { ...accepted, belief: true } }), record('card:s', 'formalize', { status: 'accepted', accepted }), record('proof:t', 'result')],
      deps: { 'card:s': ['decl:D'] },
      classes: { 'decl:D': BELIEF },
    };
    const s = stateOf(scene);
    expect(resultsState({ items: s.items, classesBeforeReveal: s.classesBeforeReveal, forced: null }).shown).toBe(true);
    const shaky = ok(reduceReview(s, { kind: 'decide', decisions: [{ item: idOf('decl:D'), rev: 1, to: 'declined', option: 'shaky' }], own: false, confirmed: true }, AT));
    expect(item(shaky, 'card:s')).toMatchObject({ status: 'to-be-redone', redo: { reverted: false } });
    expect(resultsState({ items: shaky.items, classesBeforeReveal: s.classesBeforeReveal, forced: null })).toMatchObject({ shown: false, waitingFor: [idOf('card:s')] });
  });

  it('RV-3 at a queue’s end: a new statement that uses a vocabulary item declined as Shaky is to be redone, and keeps them hidden', () => {
    const records = recordsOf([record('vocab:V', 'vocabulary-term', { status: 'declined', decline: { option: 'shaky', at: AT } }), record('proof:t', 'result', { status: 'accepted', accepted })]);
    const judgement = judgementOf([draft('vocab:V', 'vocabulary-term'), draft('card:s', 'formalize'), draft('proof:t', 'result')], {
      deps: { 'card:s': ['vocab:V'], 'vocab:V': [], 'proof:t': [] },
    });
    const out = reconcile({ runId: RUN, records, judgement, queueSteps: ['s2'], at: AT });
    expect(item(out.records, 'card:s')).toMatchObject({ status: 'to-be-redone', redo: { because: [idOf('vocab:V')], reverted: false } });
    expect(resultsState({ items: out.records.items, classesBeforeReveal: judgement.classesBeforeReveal, forced: null })).toMatchObject({ shown: false, waitingFor: [idOf('card:s')] });
  });

  it('un-reject: the statements it brings back are undecided again, which ends the force', () => {
    const scene: Scene = {
      items: [record('vocab:V', 'vocabulary-term'), record('card:s', 'formalize'), record('card:b', 'formalize'), record('proof:t', 'result')],
      deps: { 'card:s': ['vocab:V'] },
      forced: { via: 'show-result', at: AT },
    };
    let s = stateOf(scene);
    // The Reject takes card:s out (to be redone, reverted: no longer undecided), so the force holds.
    s = next(s, ok(reduceReview(s, { kind: 'decide', decisions: [{ item: idOf('vocab:V'), rev: 1, to: 'declined', option: 'reject' }], own: false, confirmed: false }, AT)));
    expect(item(s, 'card:s')).toMatchObject({ status: 'to-be-redone', redo: { reverted: true } });
    expect(s.forced).toEqual({ via: 'show-result', at: AT });
    const back = ok(reduceReview(s, { kind: 'decide', decisions: [{ item: idOf('vocab:V'), rev: 1, to: 'in-review' }], own: false, confirmed: false }, AT));
    expect(item(back, 'card:s')).toMatchObject({ status: 'to-be-redone', redo: { reverted: false } });
    expect(back.forced).toBeNull();
    expect(resultsState({ items: back.items, classesBeforeReveal: s.classesBeforeReveal, forced: back.forced }).waitingFor).toEqual([idOf('card:s'), idOf('card:b')]);
  });
});

describe('F1: showing the results never changes what they wait for', () => {
  it('a statement-phase definition that only T’s premise draft reaches: the results are shown, `classes` makes it a belief, and they stay shown', () => {
    const base = modelOf(BASE);
    const current = modelOf(append(BASE, VOCAB, '/-- is evil -/\ndef Evil (c : Character) : Prop := HasDarkPast c'));
    const premise = draftOf({ consts: ['Spyro.Evil', 'Spyro.cynder'] });
    const ledger = [created('Spyro.Evil', 'statements')];
    const { drafts, problems } = computeItems({ base, current, ledger, premises: [premise], inferences: [INFERENCE], ended: [TARGET] });
    expect(problems).toEqual([]);
    expect(drafts.map((d) => d.key)).toEqual(['decl:Spyro.Evil', 'premise:cynder-not-good:cynder_is_evil', 'proof:cynder-not-good']);
    const classes = classify({ base, current, drafts, premises: [premise], inferences: [INFERENCE], withDrafts: true });
    const classesBeforeReveal = classify({ base, current, drafts, premises: [premise], inferences: [INFERENCE], withDrafts: false });
    expect(classes['decl:Spyro.Evil']?.belief).toBe(true);
    expect(classesBeforeReveal['decl:Spyro.Evil']?.belief).toBe(false);
    const deps = itemDeps({ base, current, drafts, inferences: {} });
    const judgement = judgementOf(drafts, { classes, classesBeforeReveal, deps });
    const { records } = reconcile({ runId: RUN, records: recordsOf([]), judgement, queueSteps: ['s1'], at: AT });
    expect(records.items.every((r) => r.status === 'in-review')).toBe(true);
    // Nothing the rule reads is undecided: the results are shown at once.
    expect(resultsState({ items: records.items, classesBeforeReveal, forced: null })).toEqual({ shown: true, meaning: [], waitingFor: [] });
    // Shown, `classes` is in force: the definition needs its own Accept, and its decision never hides the results.
    const state: ReviewState = {
      ...stateOf({ items: records.items }),
      deps: depsById(records.items, deps),
      classes,
      classesBeforeReveal,
    };
    expect(acceptGate(state, idOf('decl:Spyro.Evil'), false)).toMatchObject({ ok: false, reason: 'own-accept' });
    const done = ok(reduceReview(state, { kind: 'decide', decisions: [{ item: idOf('decl:Spyro.Evil'), rev: 1, to: 'accepted' }], own: true, confirmed: false }, AT));
    expect(item(done, 'decl:Spyro.Evil').accepted).toMatchObject({ belief: true });
    expect(resultsState({ items: done.items, classesBeforeReveal, forced: null }).shown).toBe(true);
  });
});
