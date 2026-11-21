/**
 * Spec v4.1 ES-2, AR-8 (★D7 (b), AP-10), slice 1e: Formalize for dependencies in the store. The selected arrows into one
 * proposition (or its "follows from nothing" mark) are the question; a source that is a proposition with neither a
 * proof nor a pending claim is asked about first: with a Lean statement "Mark pending and continue" (claimPending, the
 * user's own edit, then startRun once the host wrote it) or Cancel; without one, Cancel only.
 */
import { hostMessage, spyroGraph, type ActionOutcome, type TlGraph, type TlNode, type WebviewToHostMessage } from '@telelean/core';
import { describe, expect, it } from 'vitest';
import { createBoardStore, formalizeOf } from '../../src/state/store';
import { makeNode } from '../shared/graphs';
import { runView, TARGET } from '../shared/runs';

const DARK = 'cynder-dark-past';
/** A proposition with a Lean statement and no `.holds`: "Mark pending" applies. */
const LEMMA = makeNode('l-lemma', 'PROPOSITION', 'Dark pasts show in games', {}, { lean: { binding: 'pinned', statement: 'Spyro.l_lemma' } });
/** Another one, for the one-at-a-time questions. */
const LEMMA2 = makeNode('l-second', 'PROPOSITION', 'PG games are for children', {}, { lean: { binding: 'pinned', statement: 'Spyro.l_second' } });
/** A proposition without a Lean statement: it must be formalised and proved first. */
const BARE = makeNode('l-bare', 'PROPOSITION', 'Nobody formalised this', { formal: 'informal' }, { lean: { binding: 'none' } });
/** A pending proposition (its `.holds` is an axiom): no question. */
const PENDING = makeNode('l-pending', 'PROPOSITION', 'Assumed until proved', { proof: { kind: 'pending' } }, {
  lean: { binding: 'pinned', statement: 'Spyro.l_pending', justification: 'Spyro.l_pending.holds', justificationKind: 'axiom' },
});

/** The Spyro sample with these cards drawn into the target. */
function graphWith(...extra: TlNode[]): TlGraph {
  const graph = spyroGraph();
  const nodes = graph.nodes.map((n) => (n.id === TARGET ? { ...n, premises: [...n.premises, ...extra.map((e) => e.id)] } : n));
  const edges = [...graph.edges, ...extra.map((e) => ({ id: `premise:${e.id}->${TARGET}`, type: 'premise' as const, source: e.id, target: TARGET, origin: 'declared' as const }))];
  return { ...graph, nodes: [...nodes, ...extra], edges };
}

function setup(graph: TlGraph) {
  const sent: WebviewToHostMessage[] = [];
  const store = createBoardStore((m) => sent.push(m), { today: () => '2026-11-19', setTimer: () => undefined, persist: () => undefined });
  store.getState().applyGraph(graph);
  const state = () => store.getState();
  const result = (requestId: string, outcome: ActionOutcome) => state().receive(hostMessage('actionResult', { requestId, outcome }));
  const ofType = <T extends WebviewToHostMessage['type']>(type: T) => sent.filter((m): m is Extract<WebviewToHostMessage, { type: T }> => m.type === type);
  const select = (...sources: string[]) => sources.forEach((source, i) => state().selectArrow(source, TARGET, i > 0));
  return { store, sent, state, result, ofType, select };
}

const OK: ActionOutcome = { ok: true, label: 'Mark pending: done', undoable: true };

describe('Formalize for dependencies with an unproved proposition among the sources (AR-8)', () => {
  it('asks first; Cancel starts nothing and marks nothing', () => {
    const t = setup(graphWith(LEMMA));
    t.select(DARK, LEMMA.id);
    expect(formalizeOf(t.state())).toMatchObject({ disabled: null, target: TARGET, sources: [DARK, LEMMA.id] });
    expect(t.state().formalize()).toBe(true);
    expect(t.state().dialog).toEqual({ kind: 'formalize', mode: 'mark-pending', id: LEMMA.id, target: TARGET, sources: [DARK, LEMMA.id], queue: [], confirmed: [] });
    expect(t.sent.filter((m) => m.type !== 'select')).toEqual([]);
    t.state().closeDialog();
    expect(t.state().dialog).toBeNull();
    expect(t.sent.filter((m) => m.type !== 'select')).toEqual([]);
  });

  it('"Mark pending and continue": the mark first (the user\'s own edit), then the run once the host wrote it', () => {
    const t = setup(graphWith(LEMMA));
    t.select(DARK, LEMMA.id);
    t.state().formalize();
    t.state().confirmFormalizePending();
    expect(t.state().dialog).toBeNull();
    expect(t.ofType('claimPending').map((m) => m.payload)).toEqual([{ id: LEMMA.id, requestId: 'r1' }]);
    expect(t.ofType('startRun')).toEqual([]); // not before the host has written the mark
    t.result('r1', OK);
    expect(t.ofType('startRun').map((m) => m.payload)).toEqual([{ target: TARGET, premises: [DARK, LEMMA.id], requestId: 'r2' }]);
    expect(t.state().runBusy).toMatchObject({ action: 'start', requestId: 'r2' });
  });

  it('a refused mark starts nothing (its error toast says why)', () => {
    const t = setup(graphWith(LEMMA));
    t.select(LEMMA.id);
    t.state().formalize();
    t.state().confirmFormalizePending();
    t.result('r1', { ok: false, code: 'invalid', error: 'Its Lean statement has problems: fix them first.' });
    expect(t.ofType('startRun')).toEqual([]);
    expect(t.state().toasts.map((x) => [x.level, x.text])).toEqual([['error', 'Its Lean statement has problems: fix them first.']]);
  });

  it('several such sources: one question at a time; every chosen mark is sent, then the run', () => {
    const t = setup(graphWith(LEMMA, LEMMA2));
    t.select(LEMMA.id, DARK, LEMMA2.id);
    t.state().formalize();
    expect(t.state().dialog).toMatchObject({ kind: 'formalize', id: LEMMA.id, queue: [LEMMA2.id], confirmed: [] });
    t.state().confirmFormalizePending();
    expect(t.state().dialog).toMatchObject({ kind: 'formalize', id: LEMMA2.id, queue: [], confirmed: [LEMMA.id] });
    expect(t.ofType('claimPending')).toEqual([]); // nothing is marked before the last answer
    t.state().confirmFormalizePending();
    expect(t.ofType('claimPending').map((m) => m.payload.id)).toEqual([LEMMA.id, LEMMA2.id]);
    t.result('r1', OK);
    expect(t.ofType('startRun')).toEqual([]);
    t.result('r2', OK);
    expect(t.ofType('startRun').map((m) => m.payload.premises)).toEqual([[LEMMA.id, DARK, LEMMA2.id]]);
  });

  it('a source without a Lean statement: formalize and prove it first (Cancel only), even when others could be marked', () => {
    const t = setup(graphWith(LEMMA, BARE));
    t.select(LEMMA.id, BARE.id);
    expect(t.state().formalize()).toBe(true);
    expect(t.state().dialog).toMatchObject({ kind: 'formalize', mode: 'no-statement', id: BARE.id });
    t.state().confirmFormalizePending(); // not offered; does nothing
    expect(t.state().dialog).toMatchObject({ mode: 'no-statement' });
    expect(t.sent.filter((m) => m.type !== 'select')).toEqual([]);
  });

  it('axioms, pending and proved propositions need no question: the run starts at once', () => {
    const t = setup(graphWith(PENDING));
    t.select(DARK, PENDING.id);
    expect(t.state().formalize()).toBe(true);
    expect(t.state().dialog).toBeNull();
    expect(t.ofType('startRun').map((m) => m.payload)).toEqual([{ target: TARGET, premises: [DARK, PENDING.id], requestId: 'r1' }]);
  });

  it('a run that became active while the user was asked: the mark is not sent, and nothing starts', () => {
    const t = setup(graphWith(LEMMA));
    t.select(LEMMA.id);
    t.state().formalize();
    t.state().receive(hostMessage('run', { run: runView({ subject: 'Bayonetta' }) }));
    t.state().confirmFormalizePending();
    expect(t.ofType('claimPending')).toEqual([]);
    expect(t.ofType('startRun')).toEqual([]);
  });

  it('the question goes when a card it is about leaves the board', () => {
    const t = setup(graphWith(LEMMA));
    t.select(LEMMA.id);
    t.state().formalize();
    expect(t.state().dialog?.kind).toBe('formalize');
    t.state().applyGraph({ ...spyroGraph(9) });
    expect(t.state().dialog).toBeNull();
  });
});
