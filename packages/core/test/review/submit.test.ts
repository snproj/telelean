/**
 * Slice 2b2 (docs/slice2-plan.md 3.7, 6.1; D2-2, D2-54, D2-57): Submit review's plan, `planSubmit`, on synthetic records
 * and a stage judgement's RV-5 edges: the end confirmation when nothing is Shaky or to be redone; otherwise one step per
 * affected inference, a kept Shaky or to-be-redone item that rests on what another step opens taken out first, the step
 * that opens it run first; the counts; the cycles of items that are partly accepted.
 */
import { describe, expect, it } from 'vitest';
import { planSubmit } from '../../src/review/submit.js';
import type { ItemRecord, SessionInference } from '../../src/review/types.js';
import { idOf, judgementOf, record, recordsOf } from './helpers/records.js';

const SHAKY = { status: 'declined' as const, decline: { option: 'shaky' as const, at: 'now' } };
const REDO = (reverted: boolean) => ({ status: 'to-be-redone' as const, redo: { because: [], reverted } });
const ACCEPTED = { status: 'accepted' as const, accepted: { how: 'own' as const, fingerprint: 'f', belief: false, changesProved: false, at: 'now' } };
const origin = (target: string, step = `s-${target}`) => ({ origin: { step, target, phase: 'statements' as const } });

/** Two inferences: t1 (order 0) and t2 (order 1), whose questions are independent unless given. */
const INFERENCES: SessionInference[] = [
  { target: 't1', question: { sources: ['a'], fromNothing: false }, order: 0, steps: ['s-t1'] },
  { target: 't2', question: { sources: ['a'], fromNothing: false }, order: 1, steps: ['s-t2'] },
];

function plan(items: ItemRecord[], deps: Record<string, string[]> = {}, inferences: SessionInference[] = INFERENCES) {
  const judgement = judgementOf([], { deps });
  return planSubmit({ records: recordsOf(items, { inferences }), judgement });
}

describe('planSubmit (§3.7)', () => {
  it('nothing Shaky and nothing to be redone: the end confirmation, with no step (D2-54); also with no item at all', () => {
    const items = [record('card:x', 'formalize', ACCEPTED), record('proof:t1', 'result', { ...ACCEPTED, ...origin('t1') }), record('decl:D', 'declaration', { status: 'declined', decline: { option: 'reject', at: 'now' } })];
    expect(plan(items)).toEqual({ confirm: true, steps: [], takeOut: [], counts: { shaky: 0, redo: 0 }, partlyAccepted: [] });
    expect(plan([])).toEqual({ confirm: true, steps: [], takeOut: [], counts: { shaky: 0, redo: 0 }, partlyAccepted: [] });
  });

  it('one Shaky item: one step for its inference; the counts tell Shaky from to be redone (a Shaky item taken out stays Shaky)', () => {
    const items = [record('card:x', 'formalize', { ...SHAKY, ...origin('t1') }), record('proof:t1', 'result', { ...REDO(false), ...origin('t1') })];
    expect(plan(items)).toEqual({ confirm: false, steps: ['t1'], takeOut: [], counts: { shaky: 1, redo: 1 }, partlyAccepted: [] });
    const takenOut = [record('card:x', 'formalize', { ...REDO(true), decline: { option: 'shaky', at: 'now' }, ...origin('t1') })];
    expect(plan(takenOut).counts).toEqual({ shaky: 1, redo: 0 });
    // Only items to be redone, none Shaky: still Claude's steps, no confirmation.
    expect(plan([record('proof:t2', 'result', { ...REDO(true), ...origin('t2') })])).toEqual({ confirm: false, steps: ['t2'], takeOut: [], counts: { shaky: 0, redo: 1 }, partlyAccepted: [] });
  });

  it('the affected inferences: the origins of the Shaky and to-be-redone items and the targets of such Results; an item of no inference counts but has no step', () => {
    const items = [
      record('card:x', 'formalize', { ...SHAKY, ...origin('t2') }),
      record('proof:t1', 'result', { ...REDO(true), ...origin('t1') }),
      record('decl:orphan', 'declaration', { ...REDO(false), origin: { step: '', target: '', phase: 'statements' } }),
      record('decl:elsewhere', 'declaration', { ...SHAKY, ...origin('not-an-inference') }),
    ];
    const p = plan(items);
    expect(p.steps).toEqual(['t1', 't2']);
    expect(p.counts).toEqual({ shaky: 2, redo: 2 });
    expect(p.confirm).toBe(false);
  });

  it('D2-57: a kept Shaky item that rests on an item another step opens is taken out first, and the step that opens it runs first', () => {
    // Two targets share a source whose Formalize item came from t2's step and is declined Shaky; t1's Result rests on it
    // and is to be redone with its content kept (the Shaky cascade): t2 runs first, t1's Result is taken out first.
    const items = [
      record('card:shared', 'formalize', { ...SHAKY, ...origin('t2') }),
      record('proof:t1', 'result', { ...REDO(false), redo: { because: [idOf('card:shared')], reverted: false }, ...origin('t1') }),
      record('proof:t2', 'result', { ...REDO(false), ...origin('t2') }),
    ];
    const deps = { 'proof:t1': ['card:shared'], 'proof:t2': ['card:shared'] };
    const p = plan(items, deps);
    expect(p.steps).toEqual(['t2', 't1']);
    expect(p.takeOut).toEqual([idOf('proof:t1')]);
    // t2's own Result rests on t2's own open item: nothing to take out for it (its own step reworks both).
    // Transitively: t1's definition rests on another item, which rests on the shared one.
    const chain = [...items, record('decl:mid', 'declaration', { ...REDO(false), ...origin('t1') })];
    const p2 = plan(chain, { ...deps, 'decl:mid': ['card:other'], 'card:other': ['card:shared'] });
    expect(p2.takeOut).toEqual([idOf('proof:t1'), idOf('decl:mid')]);
  });

  it('an item whose content is already out (reverted), or an Add premise never written, is not taken out again', () => {
    const items = [
      record('card:shared', 'formalize', { ...SHAKY, ...origin('t2') }),
      record('proof:t1', 'result', { ...REDO(true), ...origin('t1') }),
      record('premise:t1:p', 'add-premise', { ...REDO(false), ...origin('t1') }),
      record('premise:t1:q', 'add-premise', { ...REDO(false), card: 'q-card', ...origin('t1') }),
    ];
    const p = plan(items, { 'proof:t1': ['card:shared'], 'premise:t1:p': ['card:shared'], 'premise:t1:q': ['card:shared'] });
    expect(p.takeOut).toEqual([idOf('premise:t1:q')]);
    expect(p.steps).toEqual(['t2', 't1']);
  });

  it('the order: RV-5 first, then sources first, ties by the inferences’ order; a cycle is broken by order', () => {
    const three: SessionInference[] = [
      { target: 't1', question: { sources: ['a'], fromNothing: false }, order: 0, steps: ['s-t1'] },
      { target: 't2', question: { sources: ['t3'], fromNothing: false }, order: 1, steps: ['s-t2'] },
      { target: 't3', question: { sources: ['a'], fromNothing: false }, order: 2, steps: ['s-t3'] },
    ];
    const items = ['t1', 't2', 't3'].map((t) => record(`proof:${t}`, 'result', { ...SHAKY, ...origin(t) }));
    // t3 is a source of t2's question: it runs before t2, though its order is later.
    expect(plan(items, {}, three).steps).toEqual(['t1', 't3', 't2']);
    // RV-5 wins over sources first: t3's kept Result rests on an item t2's step opens, so t2 runs first (and the Result
    // is taken out first), although t3 is a source of t2's question.
    const rv5 = plan([...items, record('card:y', 'formalize', { ...SHAKY, ...origin('t2') })], { 'proof:t3': ['card:y'] }, three);
    expect(rv5.steps).toEqual(['t1', 't2', 't3']);
    expect(rv5.takeOut).toEqual([idOf('proof:t3')]);
    // A cycle of RV-5 edges between two steps: the step it does not hold up runs first, then order breaks the cycle;
    // both kept items are taken out.
    const cyclic = plan(items, { 'proof:t1': ['proof:t2'], 'proof:t2': ['proof:t1'] }, three);
    expect(cyclic.steps).toEqual(['t3', 't1', 't2']);
    expect(cyclic.takeOut).toEqual([idOf('proof:t1'), idOf('proof:t2')]);
  });

  it('partly accepted cycles (§3.7, §4.5): an SCC with an accepted member that is not wholly accepted is named; wholly accepted or wholly not, none', () => {
    const scc = { 'decl:p': ['decl:q'], 'decl:q': ['decl:p'] };
    const pair = (p: Partial<ItemRecord>, q: Partial<ItemRecord>) => [record('decl:p', 'declaration', p), record('decl:q', 'declaration', q)];
    expect(plan(pair(ACCEPTED, { status: 'declined', decline: { option: 'reject', at: 'now' } }), scc).partlyAccepted).toEqual([[idOf('decl:p'), idOf('decl:q')]]);
    expect(plan(pair(ACCEPTED, ACCEPTED), scc).partlyAccepted).toEqual([]);
    expect(plan(pair({}, {}), scc).partlyAccepted).toEqual([]);
    // A single item depending on itself is no cycle of items; a chain is none either.
    expect(plan([record('decl:p', 'declaration', ACCEPTED), record('decl:q', 'declaration')], { 'decl:p': ['decl:q'] }).partlyAccepted).toEqual([]);
  });
});
