import { AXIOM_TO_PROPOSITION_REFUSAL, hostMessage, spyroGraph, spyroProvedGraph, type ActionOutcome, type TlGraph, type WebviewToHostMessage } from '@telelean/core';
import { describe, expect, it } from 'vitest';
import { createBoardStore, FLASH_MS, kindChangeRefused, MAX_TOASTS, moveInOrder, toastCanUndo, type PersistedState, type StoreOptions } from '../../src/state/store';
import { conditionalGraph, historyListing, mapNode, withSemantic, workspaceState } from '../shared/graphs';

/** The Spyro sample with a reason on its proposition, so a change to Axiom asks nothing first (no rationale dialog). */
const withReason = (graph: TlGraph = spyroGraph()) => mapNode(graph, 'cynder-not-good', (n) => ({ ...n, rationale: 'lore' }));

/** A store on the Spyro sample with recorded posts, a fake clock for its timers, and its persisted state. */
function setup(graph: TlGraph = spyroGraph(), options: StoreOptions = {}) {
  const sent: WebviewToHostMessage[] = [];
  const timers: Array<{ at: number; run: () => void }> = [];
  let now = 0;
  const persisted: PersistedState = { ...(options.persisted ?? {}) };
  const store = createBoardStore((m) => sent.push(m), {
    today: () => '2026-11-01',
    setTimer: (run, ms) => timers.push({ at: now + ms, run }),
    persist: (patch) => Object.assign(persisted, patch),
    ...options,
  });
  store.getState().applyGraph(graph);
  const advance = (ms: number) => {
    now += ms;
    for (const timer of timers.splice(0).sort((a, b) => a.at - b.at)) {
      if (timer.at <= now) timer.run();
      else timers.push(timer);
    }
  };
  const result = (requestId: string, outcome: ActionOutcome) => store.getState().receive(hostMessage('actionResult', { requestId, outcome }));
  const last = () => sent.at(-1);
  return { store, sent, state: () => store.getState(), advance, result, last, persisted };
}

const OK: ActionOutcome = { ok: true, label: 'done', undoable: true };
const refused = (code: Extract<ActionOutcome, { ok: false }>['code'], error: string, dependents?: string[]): ActionOutcome => ({
  ok: false,
  code,
  error,
  ...(dependents ? { dependents } : {}),
});

describe('board store (M0 behaviour, M1 protocol)', () => {
  it('splits the graph into columns', () => {
    const { state } = setup();
    expect(state().order).toEqual({
      AXIOM: ['pg-no-dark-past', 'cynder-dark-past', 'new-spyro-pg'],
      PROPOSITION: ['cynder-not-good'],
    });
  });

  it('click selects one card, Ctrl/Cmd-click toggles, and every change posts select', () => {
    const { state, sent } = setup();
    state().clickCard('cynder-dark-past', false);
    state().clickCard('new-spyro-pg', true);
    state().clickCard('cynder-not-good', true);
    state().clickCard('new-spyro-pg', true);
    expect(state().selected).toEqual(['cynder-dark-past', 'cynder-not-good']);
    expect(sent.map((m) => m.type)).toEqual(['select', 'select', 'select', 'select']);
    state().clickCard('cynder-dark-past', false);
    expect(state().selected).toEqual(['cynder-dark-past']);
  });

  it('Formalize for dependencies (slice 1e): the selected arrows into one proposition are the question; `formalize` posts their sources (slice 2h)', () => {
    const { state, last, sent } = setup();
    state().selectArrow('cynder-dark-past', 'cynder-not-good', false);
    state().selectArrow('new-spyro-pg', 'cynder-not-good', true);
    expect(state().formalize()).toBe(true);
    expect(last()).toEqual({ v: 1, type: 'formalize', payload: { inferences: [{ target: 'cynder-not-good', premises: ['cynder-dark-past', 'new-spyro-pg'] }], requestId: 'r1' } });
    // Nothing declares premises any more (the arrows are drawn already, AR-4).
    expect(sent.some((m) => m.type === 'theseSuffice' || m.type === 'addArrows')).toBe(false);
  });

  it('Alt+Up/Down (moveCard) re-orders one place within the column and posts reorder', () => {
    const { state, last } = setup();
    const column = () => state().order.AXIOM;
    expect(column()).toEqual(['pg-no-dark-past', 'cynder-dark-past', 'new-spyro-pg']);
    expect(state().moveCard('pg-no-dark-past', -1)).toBe(false); // already first
    expect(state().moveCard('pg-no-dark-past', 1)).toBe(true);
    expect(column()).toEqual(['cynder-dark-past', 'pg-no-dark-past', 'new-spyro-pg']);
    expect(last()).toMatchObject({ type: 'reorder', payload: { id: 'pg-no-dark-past', column: 'AXIOM', beforeId: 'new-spyro-pg' } });
    expect(state().moveCard('pg-no-dark-past', 1)).toBe(true);
    expect(column()).toEqual(['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past']);
    expect(last()).toMatchObject({ type: 'reorder', payload: { id: 'pg-no-dark-past', beforeId: null } });
    expect(state().moveCard('pg-no-dark-past', 1)).toBe(false); // already last
    expect(state().moveCard('new-spyro-pg', -1)).toBe(true);
    expect(column()).toEqual(['new-spyro-pg', 'cynder-dark-past', 'pg-no-dark-past']);
    expect(last()).toMatchObject({ type: 'reorder', payload: { id: 'new-spyro-pg', beforeId: 'cynder-dark-past' } });
  });

  it('Formalize refuses a selection of cards only, with the reason; a "follows from nothing" mark asks for a proof from nothing (premises []) (slice 1e)', () => {
    const graph = mapNode(spyroGraph(), 'cynder-not-good', (n) => ({ ...n, premises: [], fromNothing: true }));
    const { state, sent, last } = setup(graph);
    state().clickCard('cynder-dark-past', false);
    expect(state().formalize()).toBe(false);
    expect(state().toasts.map((t) => [t.level, t.text])).toEqual([['info', "Select arrows, or a 'follows from nothing' mark."]]);
    expect(sent.some((m) => m.type === 'formalize')).toBe(false);
    state().selectMark('cynder-not-good', false);
    expect(state().formalize()).toBe(true);
    // Slice 2h: the start is a `formalize` with its inferences (M2's startRun is retired).
    expect(last()).toEqual({ v: 1, type: 'formalize', payload: { inferences: [{ target: 'cynder-not-good', premises: [] }], requestId: 'r1' } });
  });

  it('a drop across columns moves the card and posts kindChange; within a column it posts reorder (M1: M0 posted nothing)', () => {
    const { state, last, sent } = setup(withReason());
    // Spec v4 AR-6: no drop makes an axiom a proposition; nothing moves, nothing is posted, a toast says how instead.
    expect(kindChangeRefused(state(), 'pg-no-dark-past', 'PROPOSITION')).toBe(true);
    state().dropCard('pg-no-dark-past', 'PROPOSITION', 'cynder-not-good');
    expect(state().order.PROPOSITION).toEqual(['cynder-not-good']);
    expect(state().nodes['pg-no-dark-past']?.type).toBe('AXIOM');
    expect(sent.some((m) => m.type === 'kindChange')).toBe(false);
    expect(state().toasts.map((t) => [t.level, t.text])).toEqual([['info', AXIOM_TO_PROPOSITION_REFUSAL]]);
    // P->A (AR-7): the proposition moves into the Axioms column.
    expect(kindChangeRefused(state(), 'cynder-not-good', 'AXIOM')).toBe(false);
    state().dropCard('cynder-not-good', 'AXIOM', 'cynder-dark-past');
    expect(state().order).toEqual({ AXIOM: ['pg-no-dark-past', 'cynder-not-good', 'cynder-dark-past', 'new-spyro-pg'], PROPOSITION: [] });
    expect(state().nodes['cynder-not-good']?.type).toBe('AXIOM');
    expect(last()).toEqual({ v: 1, type: 'kindChange', payload: { id: 'cynder-not-good', from: 'PROPOSITION', to: 'AXIOM', beforeId: 'cynder-dark-past', requestId: 'r1' } });
    state().dropCard('new-spyro-pg', 'AXIOM', 'cynder-dark-past');
    expect(state().order.AXIOM).toEqual(['pg-no-dark-past', 'cynder-not-good', 'new-spyro-pg', 'cynder-dark-past']);
    expect(last()).toEqual({ v: 1, type: 'reorder', payload: { id: 'new-spyro-pg', column: 'AXIOM', beforeId: 'cynder-dark-past', requestId: 'r2' } });
    // To the end of the column: beforeId null.
    state().dropCard('new-spyro-pg', 'AXIOM', null);
    expect(last()).toEqual({ v: 1, type: 'reorder', payload: { id: 'new-spyro-pg', column: 'AXIOM', beforeId: null, requestId: 'r3' } });
    expect(state().order.AXIOM).toEqual(['pg-no-dark-past', 'cynder-not-good', 'cynder-dark-past', 'new-spyro-pg']);
    // Dropped where it already is: nothing is posted.
    const count = sent.length;
    state().reorder('new-spyro-pg', null);
    state().dropCard('cynder-dark-past', 'AXIOM', 'new-spyro-pg');
    expect(sent.length).toBe(count);
  });

  it('addNode sends the sentence trimmed only (verbatim), with the optional rationale, stance and source', () => {
    const { state, last } = setup();
    const id = state().addNode('PROPOSITION', '  Cynder   cannot appear in a PG game ');
    expect(id).toBe('cynder-cannot-appear-in-a-pg');
    expect(state().order.PROPOSITION).toEqual(['cynder-not-good', id]);
    expect(state().nodes[id ?? '']?.status.formal).toBe('informal');
    expect(state().nodes[id ?? '']?.status.flags).toEqual([]);
    expect(state().provisional[id ?? '']).toBe(true);
    expect(last()).toEqual({ v: 1, type: 'addNode', payload: { clientId: id, type: 'PROPOSITION', naturalName: 'Cynder   cannot appear in a PG game', requestId: 'r1' } });
    expect(state().addNode('PROPOSITION', '   ')).toBeNull();

    // Pasted line breaks become spaces (the protocol requires one line).
    state().addNode('AXIOM', 'Spyro is\npurple', { rationale: ' seen it ', stance: 'believe', source: 'observed' });
    expect(last()).toEqual({
      v: 1,
      type: 'addNode',
      payload: { clientId: 'spyro-is-purple', type: 'AXIOM', naturalName: 'Spyro is purple', requestId: 'r2', rationale: 'seen it', stance: 'believe', source: 'observed' },
    });
    // An axiom without a reason shows "no reason yet" until the host's graph arrives.
    state().addNode('AXIOM', 'Spyro flies');
    expect(state().nodes['spyro-flies']?.status.flags).toEqual(['no-rationale']);
    expect(state().nodes['spyro-is-purple']).toMatchObject({ rationale: 'seen it', stance: 'believe', source: 'observed', asserted: '2026-11-01' });
  });
});

describe('AT6.1 store: host messages', () => {
  it('drops graphs with a lower version; applies equal or higher versions; selection and expansion survive', () => {
    const { state, sent } = setup(spyroGraph(5));
    state().clickCard('cynder-dark-past', false);
    state().toggleExpanded('cynder-not-good');
    const seq = state().seq;

    expect(state().applyGraph(spyroProvedGraph(4))).toBe(false); // older: dropped
    expect(state().version).toBe(5);
    expect(state().seq).toBe(seq);
    expect(state().nodes['cynder-not-good']?.status.proof.kind).toBe('none');

    expect(state().applyGraph(spyroGraph(5))).toBe(true); // the same version again: harmless
    expect(state().seq).toBe(seq + 1);
    expect(state().applyGraph(spyroProvedGraph(6))).toBe(true);
    expect(state().version).toBe(6);
    expect(state().nodes['cynder-not-good']?.status.proof.kind).toBe('proved');
    expect(state().selected).toEqual(['cynder-dark-past']);
    expect(state().expanded).toEqual({ 'cynder-not-good': true });
    expect(sent.filter((m) => m.type === 'select')).toHaveLength(1); // nothing changed, nothing re-posted

    // A node that disappears leaves the selection (and the host hears about it).
    const without = { ...spyroGraph(7), nodes: spyroGraph().nodes.filter((n) => n.id !== 'cynder-dark-past') };
    state().applyGraph(without);
    expect(state().selected).toEqual([]);
    expect(sent.at(-1)).toEqual({ v: 1, type: 'select', payload: { ids: [] } });
  });

  it('stores workspace, history and notice messages', () => {
    const { store, state } = setup();
    store.getState().receive(hostMessage('workspace', { state: workspaceState() }));
    expect(state().workspace?.subjects.map((s) => s.name)).toEqual(['Spyro', 'Bayonetta']);
    state().requestHistory(50);
    expect(state().historyLoading).toBe(true);
    store.getState().receive(hostMessage('history', { listing: historyListing() }));
    expect(state().history?.entries).toHaveLength(3);
    expect(state().historyLoading).toBe(false);
    store.getState().receive(hostMessage('notice', { id: 'n1', level: 'info', text: 'Deleted “x”', undoable: true }));
    expect(state().toasts).toEqual([{ key: 1, level: 'info', text: 'Deleted “x”', undoable: true }]);
  });

  it('an optimistic drag rolls back on actionResult ok:false, with an error toast', () => {
    const { state, result } = setup(withReason());
    const into = () => state().edges.filter((e) => e.type === 'premise' && e.target === 'cynder-not-good').map((e) => e.source);
    expect(into()).toEqual(expect.arrayContaining(['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past']));
    const edges = state().edges.length;
    state().dropCard('cynder-not-good', 'AXIOM', null);
    expect(state().order.AXIOM).toEqual(['pg-no-dark-past', 'cynder-dark-past', 'new-spyro-pg', 'cynder-not-good']);
    // P->A (AR-7): its incoming arrows go with it at once (the new axiom shows none while the host writes it).
    expect(state().nodes['cynder-not-good']?.premises).toEqual([]);
    expect(into()).toEqual([]);
    expect(state().edges).toHaveLength(edges - 3);
    result('r1', refused('conflict', 'Model/Spyro/Main.lean changed since; try again.'));
    expect(state().order).toEqual({ AXIOM: ['pg-no-dark-past', 'cynder-dark-past', 'new-spyro-pg'], PROPOSITION: ['cynder-not-good'] });
    expect(state().nodes['cynder-not-good']?.type).toBe('PROPOSITION');
    expect(state().nodes['cynder-not-good']?.premises).toEqual(['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past']);
    expect(state().edges).toHaveLength(edges);
    expect(state().toasts.map((t) => [t.level, t.text])).toEqual([['error', 'Model/Spyro/Main.lean changed since; try again.']]);
  });

  it('an optimistic reorder rolls back on ok:false; a successful one stays', () => {
    const { state, result } = setup();
    state().reorder('new-spyro-pg', 'pg-no-dark-past');
    expect(state().order.AXIOM).toEqual(['new-spyro-pg', 'pg-no-dark-past', 'cynder-dark-past']);
    result('r1', OK);
    state().reorder('pg-no-dark-past', null);
    expect(state().order.AXIOM).toEqual(['new-spyro-pg', 'cynder-dark-past', 'pg-no-dark-past']);
    result('r2', refused('internal', 'layout.json could not be written'));
    expect(state().order.AXIOM).toEqual(['new-spyro-pg', 'pg-no-dark-past', 'cynder-dark-past']);
    expect(state().toasts.at(-1)?.text).toBe('layout.json could not be written');
  });

  it('a newer graph supersedes the optimistic state: no rollback over it', () => {
    const { state, result } = setup(spyroGraph(1));
    state().reorder('new-spyro-pg', 'pg-no-dark-past');
    state().applyGraph(spyroGraph(2)); // the host's order
    result('r1', refused('conflict', 'changed'));
    expect(state().order.AXIOM).toEqual(['pg-no-dark-past', 'cynder-dark-past', 'new-spyro-pg']);
  });

  it('an optimistic add is removed on ok:false, with an error toast', () => {
    const { state, result } = setup();
    const id = state().addNode('PROPOSITION', 'Cynder gets a spin-off') ?? '';
    state().clickCard(id, false);
    result('r1', refused('invalid', 'The sentence is empty.'));
    expect(state().nodes[id]).toBeUndefined();
    expect(state().order.PROPOSITION).toEqual(['cynder-not-good']);
    expect(state().selected).toEqual([]);
    expect(state().toasts.at(-1)).toMatchObject({ level: 'error', text: 'The sentence is empty.' });
  });

  it("an add's provisional card gives way to the host's id; selection and expansion move to it (result first)", () => {
    const { state, result, sent } = setup(spyroGraph(1));
    const id = state().addNode('PROPOSITION', 'Cynder gets a spin-off') ?? '';
    state().clickCard(id, false);
    state().toggleExpanded(id);
    // The host derived another id; its graph arrives after the result.
    result('r1', { ok: true, label: 'Add proposition: Cynder gets a spin-off', undoable: true, nodeId: 'cynder-gets-a-spin-off-2' });
    expect(state().nodes[id]).toBeDefined(); // still waiting for the graph
    const host = spyroGraph(2);
    const card = { ...state().nodes[id], id: 'cynder-gets-a-spin-off-2' } as TlGraph['nodes'][number];
    state().applyGraph({ ...host, nodes: [...host.nodes, card] });
    expect(state().nodes[id]).toBeUndefined();
    expect(state().provisional).toEqual({});
    expect(state().selected).toEqual(['cynder-gets-a-spin-off-2']);
    expect(state().expanded).toEqual({ 'cynder-gets-a-spin-off-2': true });
    expect(state().order.PROPOSITION).toEqual(['cynder-not-good', 'cynder-gets-a-spin-off-2']);
    expect(sent.at(-1)).toEqual({ v: 1, type: 'select', payload: { ids: ['cynder-gets-a-spin-off-2'] } });
  });

  it("an add's provisional card is replaced when the host's graph comes before the result", () => {
    const { state, result } = setup(spyroGraph(1));
    const id = state().addNode('PROPOSITION', 'Cynder gets a spin-off') ?? '';
    state().clickCard(id, false);
    // An unrelated graph (no new card yet) keeps the provisional card on the board.
    state().applyGraph(spyroGraph(2));
    expect(state().nodes[id]).toBeDefined();
    expect(state().order.PROPOSITION).toEqual(['cynder-not-good', id]);
    expect(state().selected).toEqual([id]);
    // The graph with the host's card (same sentence, new id) replaces it.
    const host = spyroGraph(3);
    const card = { ...state().nodes[id], id: 'n-host-1' } as TlGraph['nodes'][number];
    state().applyGraph({ ...host, nodes: [...host.nodes, card] });
    expect(state().nodes[id]).toBeUndefined();
    expect(state().selected).toEqual(['n-host-1']);
    result('r1', { ok: true, label: 'Add proposition', undoable: true, nodeId: 'n-host-1' });
    expect(state().selected).toEqual(['n-host-1']);
  });

  it('a needs-confirmation result opens the dependents dialog with the host’s dependents, and the answer is posted', () => {
    const { state, result, last } = setup(withReason(spyroGraph(1)));
    // From the graph alone nothing depends on cynder-not-good, so the drop is posted at once ...
    state().dropCard('cynder-not-good', 'AXIOM', null);
    expect(last()).toMatchObject({ type: 'kindChange', payload: { id: 'cynder-not-good', to: 'AXIOM', requestId: 'r1' } });
    // ... but the host's facts know better (lemmas that pass its proof arguments).
    result('r1', refused('needs-confirmation', '2 dependents pass cynder_not_good.holds arguments', ['other-card', 'Spyro.helper_lemma']));
    expect(state().nodes['cynder-not-good']?.type).toBe('PROPOSITION'); // rolled back
    expect(state().dialog).toMatchObject({ kind: 'dependents', id: 'cynder-not-good', to: 'AXIOM', dependents: ['other-card', 'Spyro.helper_lemma'], rewriteAvailable: true });
    expect(state().toasts).toEqual([]);
    state().confirmDependents('mark-broken');
    expect(state().dialog).toBeNull();
    // M2 carry-over 3: the choice names the dependents the dialog listed (here the host's list).
    expect(last()).toEqual({
      v: 1,
      type: 'kindChange',
      payload: { id: 'cynder-not-good', from: 'PROPOSITION', to: 'AXIOM', beforeId: null, requestId: 'r2', dependents: 'mark-broken', confirmedDependents: ['other-card', 'Spyro.helper_lemma'] },
    });
  });
});

describe('kind changes (D-11 through kindChangeImpact)', () => {
  it('P->A of a proof that takes hypotheses, applied by another proof, asks first; rewrite needs fresh facts', () => {
    const { state, last, sent } = setup(conditionalGraph(1));
    state().dropCard('d1', 'AXIOM', null);
    expect(sent.some((m) => m.type === 'kindChange')).toBe(false);
    expect(state().dialog).toMatchObject({ kind: 'dependents', dependents: ['g1'], rewriteAvailable: true, summary: 'Move to axioms: 1 dependent needs a rewrite' });
    state().confirmDependents('rewrite');
    expect(last()).toEqual({
      v: 1,
      type: 'kindChange',
      payload: { id: 'd1', from: 'PROPOSITION', to: 'AXIOM', beforeId: null, requestId: 'r1', dependents: 'rewrite', confirmedDependents: ['g1'] },
    });

    const stale = setup(withSemantic(conditionalGraph(1), { state: 'stale', staleFiles: ['Model/Spyro/Main.lean'] }));
    stale.state().requestKindChange('d1', 'AXIOM', null);
    expect(stale.state().dialog).toMatchObject({ kind: 'dependents', rewriteAvailable: false });
    stale.state().confirmDependents('rewrite'); // not offered: ignored
    expect(stale.sent.some((m) => m.type === 'kindChange')).toBe(false);
    stale.state().closeDialog();
    expect(stale.state().dialog).toBeNull();
    expect(stale.state().nodes['d1']?.type).toBe('PROPOSITION');
  });

  it('P->A offers the optional rationale (Skip allowed)', () => {
    const { state, last } = setup(spyroGraph(1));
    state().requestKindChange('cynder-not-good', 'AXIOM', null);
    expect(state().dialog).toMatchObject({ kind: 'rationale', id: 'cynder-not-good', summary: 'Move to axioms: adds axiom cynder_not_good.holds' });
    state().confirmRationale('  my friend said so ');
    expect(last()).toEqual({ v: 1, type: 'kindChange', payload: { id: 'cynder-not-good', from: 'PROPOSITION', to: 'AXIOM', beforeId: null, requestId: 'r1', rationale: 'my friend said so' } });

    const skip = setup(spyroGraph(1));
    skip.state().requestKindChange('cynder-not-good', 'AXIOM', 'pg-no-dark-past');
    skip.state().confirmRationale(null);
    expect(skip.last()).toEqual({ v: 1, type: 'kindChange', payload: { id: 'cynder-not-good', from: 'PROPOSITION', to: 'AXIOM', beforeId: 'pg-no-dark-past', requestId: 'r1' } });
    expect(skip.state().order.AXIOM).toEqual(['cynder-not-good', 'pg-no-dark-past', 'cynder-dark-past', 'new-spyro-pg']);
  });

  it('A->P is refused before anything is sent (AR-6: an arrow, or "follows from nothing", makes an axiom a proposition)', () => {
    const { state, sent } = setup(spyroGraph(1));
    state().requestKindChange('cynder-dark-past', 'PROPOSITION', null);
    expect(state().dialog).toBeNull();
    expect(state().order.PROPOSITION).toEqual(['cynder-not-good']);
    expect(state().nodes['cynder-dark-past']?.type).toBe('AXIOM');
    expect(sent.some((m) => m.type === 'kindChange')).toBe(false);
    expect(state().toasts.map((t) => [t.level, t.text])).toEqual([['info', "To make an axiom a proposition, draw an arrow into it, or mark it 'follows from nothing'."]]);
  });

  it('moveInOrder places a card above beforeId and reports where it came from', () => {
    const order = spyroGraph().nodes.reduce<Record<string, string[]>>((acc, n) => ((acc[n.type] ??= []).push(n.id), acc), {});
    const moved = moveInOrder({ AXIOM: order.AXIOM ?? [], PROPOSITION: order.PROPOSITION ?? [] }, 'cynder-dark-past', 'PROPOSITION', 'cynder-not-good');
    expect(moved.order.PROPOSITION).toEqual(['cynder-dark-past', 'cynder-not-good']);
    expect(moved.previous).toEqual({ column: 'AXIOM', beforeId: 'new-spyro-pg' });
    expect(moveInOrder(moved.order, 'cynder-dark-past', 'PROPOSITION', 'missing').beforeId).toBeNull();
  });
});

describe('in-place edits', () => {
  it('posts editNode for the sentence (trimmed), the reason (empty = null), the stance and the source; applied optimistically', () => {
    const { state, sent } = setup();
    expect(state().editNode('cynder-dark-past', 'naturalName', '  Cynder  has a dark past ')).toBe(true);
    expect(state().nodes['cynder-dark-past']?.naturalName).toBe('Cynder  has a dark past');
    expect(state().editNode('cynder-dark-past', 'naturalName', '   ')).toBe(false); // blank: refused locally
    expect(state().editNode('cynder-dark-past', 'rationale', '')).toBe(true);
    expect(state().nodes['cynder-dark-past']?.rationale).toBeUndefined();
    expect(state().nodes['cynder-dark-past']?.status.flags).toContain('no-rationale');
    expect(state().editNode('pg-no-dark-past', 'stance', 'supposing')).toBe(true);
    expect(state().editNode('cynder-dark-past', 'source', null)).toBe(true);
    expect(state().editNode('cynder-dark-past', 'source', null)).toBe(false); // no change
    expect(sent.filter((m) => m.type === 'editNode').map((m) => m.payload)).toEqual([
      { id: 'cynder-dark-past', field: 'naturalName', value: 'Cynder  has a dark past', requestId: 'r1' },
      { id: 'cynder-dark-past', field: 'rationale', value: null, requestId: 'r2' },
      { id: 'pg-no-dark-past', field: 'stance', value: 'supposing', requestId: 'r3' },
      { id: 'cynder-dark-past', field: 'source', value: null, requestId: 'r4' },
    ]);
  });

  it('a refused edit is rolled back, and only its own field', () => {
    const { state, result } = setup();
    state().editNode('new-spyro-pg', 'naturalName', 'The new Spyro game is rated PG');
    state().editNode('new-spyro-pg', 'stance', 'believe');
    result('r1', refused('unsafe', 'The block cannot be edited safely.'));
    expect(state().nodes['new-spyro-pg']?.naturalName).toBe('The new Spyro game is PG');
    expect(state().nodes['new-spyro-pg']?.stance).toBe('believe'); // the later edit stays
    expect(state().toasts.at(-1)?.text).toBe('The block cannot be edited safely.');
    state().editNode('new-spyro-pg', 'rationale', null);
    expect(state().nodes['new-spyro-pg']?.status.flags).toContain('no-rationale');
    result('r3', refused('conflict', 'changed'));
    expect(state().nodes['new-spyro-pg']).toMatchObject({ rationale: 'known from gaming news', status: { flags: [] } });
  });
});

describe('requests, persistence, highlights, subjects, toasts', () => {
  it('request ids count up as r<n> and continue after a reload from the persisted counter', () => {
    const first = setup();
    first.state().undo();
    first.state().redo();
    first.state().initGit();
    expect(first.sent.map((m) => ('requestId' in m.payload ? m.payload.requestId : null))).toEqual(['r1', 'r2', 'r3']);
    expect(first.persisted.requestCounter).toBe(3);
    const reloaded = setup(spyroGraph(), { persisted: { requestCounter: 3 } });
    reloaded.state().undo();
    expect(reloaded.last()).toEqual({ v: 1, type: 'undo', payload: { requestId: 'r4' } });
  });

  it('the Vocabulary group state is persisted; highlighting expands it and flashes the item for FLASH_MS', () => {
    expect(setup().state().vocabCollapsed).toBe(true); // collapsed until opened
    expect(setup(spyroGraph(), { persisted: { vocabCollapsed: false } }).state().vocabCollapsed).toBe(false);
    const { state, persisted, advance } = setup(spyroGraph(), { persisted: { vocabCollapsed: true } });
    expect(state().vocabCollapsed).toBe(true);
    state().toggleVocabulary();
    expect(persisted.vocabCollapsed).toBe(false);
    state().setVocabularyCollapsed(true);
    expect(state().highlightVocab('Spyro.Nope')).toBe(false);
    expect(state().highlightVocab('Spyro.HasDarkPast')).toBe(true);
    expect(state().vocabCollapsed).toBe(false);
    expect(state().flash?.target).toBe('vocab:Spyro.HasDarkPast');
    advance(FLASH_MS - 1);
    expect(state().flash).not.toBeNull();
    advance(1);
    expect(state().flash).toBeNull();
    expect(state().revealNode('cynder-not-good')).toBe(true);
    expect(state().flash?.target).toBe('node:cynder-not-good');
    expect(persisted.subject).toBe('Spyro');
  });

  it('a graph of another subject resets the selection and drops pending adds', () => {
    const { state } = setup(spyroGraph(1));
    state().clickCard('cynder-dark-past', false);
    state().addNode('PROPOSITION', 'Pending card');
    const other = { ...spyroGraph(2), subject: 'Bayonetta', nodes: [] };
    state().applyGraph(other);
    expect(state().subject).toBe('Bayonetta');
    expect(state().selected).toEqual([]);
    expect(state().nodes).toEqual({});
  });

  it('subject and history messages', () => {
    const { state, sent } = setup();
    state().selectSubject('Spyro'); // already on screen: nothing
    state().selectSubject('Bayonetta');
    state().createSubject('Kingdom');
    state().requestHistory();
    state().previewHistory('c0ffee1', 'parent');
    state().revertHistory('b0ffee2');
    state().pruneHistory(20);
    expect(sent.map((m) => [m.type, m.payload])).toEqual([
      ['selectSubject', { subject: 'Bayonetta' }],
      ['createSubject', { name: 'Kingdom', requestId: 'r1' }],
      ['historyList', { subject: 'Spyro' }],
      ['historyPreview', { subject: 'Spyro', entryId: 'c0ffee1', compare: 'parent' }],
      ['historyRevert', { subject: 'Spyro', entryId: 'b0ffee2', requestId: 'r2' }],
      ['historyPrune', { subject: 'Spyro', keepLast: 20, requestId: 'r3' }],
    ]);
  });

  it('a dialog about a card that disappears closes', () => {
    const { state } = setup(spyroGraph(1));
    state().openDelete('new-spyro-pg');
    expect(state().dialog).toEqual({ kind: 'delete', id: 'new-spyro-pg' });
    state().applyGraph({ ...spyroGraph(2), nodes: spyroGraph().nodes.filter((n) => n.id !== 'new-spyro-pg') });
    expect(state().dialog).toBeNull();
  });

  it('deleteNode posts the delete (slice 2i: never a keepLean, the card\'s Lean always goes) and closes the dialog; provisional cards cannot be deleted or edited', () => {
    const { state, last, sent } = setup();
    state().openDelete('cynder-dark-past');
    state().deleteNode('cynder-dark-past');
    expect(state().dialog).toBeNull();
    expect(last()).toEqual({ v: 1, type: 'deleteNode', payload: { id: 'cynder-dark-past', requestId: 'r1' } });
    expect(sent.filter((m) => m.type === 'deleteNode').every((m) => !('keepLean' in m.payload))).toBe(true);
    const id = state().addNode('PROPOSITION', 'Provisional') ?? '';
    const count = sent.length;
    state().openDelete(id);
    state().deleteNode(id);
    expect(state().editNode(id, 'naturalName', 'Other')).toBe(false);
    state().requestKindChange(id, 'AXIOM', null);
    expect(state().dialog).toBeNull();
    expect(sent.length).toBe(count);
  });

  it('toasts: the same text shows once, at most three, each expires', () => {
    const { state, advance } = setup();
    state().pushToast('error', 'A');
    state().pushToast('error', 'A');
    expect(state().toasts).toHaveLength(1);
    for (const text of ['B', 'C', 'D', 'E']) state().pushToast('info', text);
    expect(MAX_TOASTS).toBe(3);
    expect(state().toasts.map((t) => t.text)).toEqual(['C', 'D', 'E']);
    advance(6000);
    expect(state().toasts).toEqual([]);
  });

  it('toast Undo: only the newest undoable toast keeps it, only while the host would undo that action, and never after an Undo or Redo', () => {
    const { state } = setup();
    const undoableTexts = () => state().toasts.filter((t) => t.undoable).map((t) => t.text);
    state().receive(hostMessage('notice', { id: 'n1', level: 'info', text: 'Add assumption: one', undoable: true }));
    state().receive(hostMessage('notice', { id: 'n2', level: 'info', text: 'Copied', undoable: false }));
    expect(undoableTexts()).toEqual(['Add assumption: one']);
    state().receive(hostMessage('notice', { id: 'n3', level: 'info', text: 'Add assumption: two', undoable: true }));
    expect(undoableTexts()).toEqual(['Add assumption: two']); // "one"'s Undo would now undo "two"

    // The button shows only while the host's Undo is this toast's action (the workspace state follows the notice).
    const [, , two] = state().toasts;
    expect(two && toastCanUndo(two, workspaceState({ undo: 'Add assumption: one' }))).toBe(false);
    expect(two && toastCanUndo(two, workspaceState({ undo: 'Add assumption: two' }))).toBe(true);
    expect(two && toastCanUndo(two, null)).toBe(true); // an older host without workspace state

    state().undo(); // from the header, Ctrl+Z or a toast: no toast's Undo is right any more
    expect(undoableTexts()).toEqual([]);
    state().receive(hostMessage('notice', { id: 'n4', level: 'info', text: 'Delete: three', undoable: true }));
    state().redo();
    expect(undoableTexts()).toEqual([]);
  });

  it('copyText posts exactly the text; refuses empty text', () => {
    const { state, last } = setup();
    const code = spyroGraph().nodes.find((n) => n.id === 'cynder-dark-past')?.lean.code ?? '';
    expect(state().copyText(code)).toBe(true);
    expect(last()).toEqual({ v: 1, type: 'copyText', payload: { text: code } });
    expect(state().copyText('')).toBe(false);
  });

  it('mapNode helper keeps other nodes', () => {
    const g = mapNode(spyroGraph(), 'pg-no-dark-past', (n) => ({ ...n, naturalName: 'x' }));
    expect(g.nodes.map((n) => n.naturalName)[0]).toBe('x');
    expect(g.nodes).toHaveLength(4);
  });
});

describe('delete with its Lean code when other declarations use it (D-18)', () => {
  it('needs-confirmation re-opens the delete dialog with the host’s list, no toast; Delete anyway resends with confirmed', () => {
    const { state, result, last, sent } = setup(spyroProvedGraph(1));
    state().openDelete('cynder-dark-past');
    state().deleteNode('cynder-dark-past');
    expect(state().dialog).toBeNull();
    expect(last()).toEqual({ v: 1, type: 'deleteNode', payload: { id: 'cynder-dark-past', requestId: 'r1' } });
    result(
      'r1',
      refused('needs-confirmation', 'Deleting its Lean code breaks 2 declarations that use it (…): they stop compiling.', ['cynder-not-good', 'Spyro.helper_lemma']),
    );
    expect(state().dialog).toEqual({ kind: 'delete', id: 'cynder-dark-past', dependents: ['cynder-not-good', 'Spyro.helper_lemma'] });
    expect(state().toasts).toEqual([]);
    expect(state().nodes['cynder-dark-past']).toBeDefined(); // delete is not optimistic: nothing to roll back
    state().deleteNode('cynder-dark-past', true);
    expect(state().dialog).toBeNull();
    expect(last()).toEqual({ v: 1, type: 'deleteNode', payload: { id: 'cynder-dark-past', confirmed: true, requestId: 'r2' } });
    result('r2', OK);
    expect(state().toasts).toEqual([]);
    expect(sent.filter((m) => m.type === 'deleteNode')).toHaveLength(2);
  });

  it('keeps the host’s description of the cards among the dependents (another subject’s card shows by its sentence)', () => {
    const { state, result } = setup(spyroProvedGraph(1));
    state().deleteNode('cynder-dark-past');
    const dependentCards = { 'other-goal': { subject: 'Bayonetta', type: 'PROPOSITION' as const, naturalName: 'Bayonetta would be a good addition' } };
    result('r1', { ok: false, code: 'needs-confirmation', error: 'breaks 2', dependents: ['other-goal', 'Spyro.helper_lemma'], dependentCards });
    expect(state().dialog).toEqual({ kind: 'delete', id: 'cynder-dark-past', dependents: ['other-goal', 'Spyro.helper_lemma'], cards: dependentCards });
    // A kind change's question keeps them too (the board's own impact did not ask: it asked only for the reason).
    state().closeDialog();
    state().requestKindChange('cynder-not-good', 'AXIOM', null);
    expect(state().dialog).toMatchObject({ kind: 'rationale' });
    state().confirmRationale(null);
    result('r2', { ok: false, code: 'needs-confirmation', error: 'others use it', dependents: ['other-goal'], dependentCards });
    expect(state().dialog).toMatchObject({ kind: 'dependents', id: 'cynder-not-good', dependents: ['other-goal'], cards: dependentCards, detail: 'others use it' });
  });

  it('from the confirmation, Cancel posts nothing; a new delete asks again, and Delete anyway is the only way on (slice 2i)', () => {
    const { state, result, last, sent } = setup(spyroProvedGraph(1));
    state().deleteNode('cynder-dark-past');
    result('r1', refused('needs-confirmation', 'breaks', ['Spyro.helper_lemma']));
    state().closeDialog();
    expect(state().dialog).toBeNull();
    expect(sent.filter((m) => m.type === 'deleteNode')).toHaveLength(1);
    state().deleteNode('cynder-dark-past');
    result('r2', refused('needs-confirmation', 'breaks', ['Spyro.helper_lemma']));
    expect(state().dialog).toEqual({ kind: 'delete', id: 'cynder-dark-past', dependents: ['Spyro.helper_lemma'] });
    state().deleteNode('cynder-dark-past', true);
    expect(last()).toEqual({ v: 1, type: 'deleteNode', payload: { id: 'cynder-dark-past', confirmed: true, requestId: 'r3' } });
    expect(sent.filter((m) => m.type === 'deleteNode').map((m) => m.payload)).toEqual([
      { id: 'cynder-dark-past', requestId: 'r1' },
      { id: 'cynder-dark-past', requestId: 'r2' },
      { id: 'cynder-dark-past', confirmed: true, requestId: 'r3' },
    ]);
  });

  it('a confirmed delete refused again, other refusals and a card that is gone meanwhile show the error toast instead', () => {
    const { state, result } = setup(spyroProvedGraph(1));
    state().deleteNode('cynder-dark-past', true);
    result('r1', refused('needs-confirmation', 'still refused', ['Spyro.helper_lemma']));
    expect(state().dialog).toBeNull(); // no loop of questions
    expect(state().toasts.map((t) => t.text)).toEqual(['still refused']);
    state().deleteNode('cynder-dark-past');
    result('r2', refused('conflict', 'Model/Spyro/Main.lean changed since telelean planned "Delete: x"; nothing was applied.'));
    expect(state().dialog).toBeNull();
    expect(state().toasts.map((t) => t.text)).toContain('Model/Spyro/Main.lean changed since telelean planned "Delete: x"; nothing was applied.');
    state().deleteNode('new-spyro-pg');
    state().applyGraph({ ...spyroProvedGraph(2), nodes: spyroProvedGraph().nodes.filter((n) => n.id !== 'new-spyro-pg') });
    result('r3', refused('needs-confirmation', 'gone meanwhile', ['cynder-not-good']));
    expect(state().dialog).toBeNull();
    expect(state().toasts.map((t) => t.text)).toContain('gone meanwhile');
  });
});

describe('the dependents dialog for P->A of a proof that takes hypotheses', () => {
  it('uses core’s impact (summary and detail) for a change to Axiom; the answer is posted with the listed dependents', () => {
    const { state, last } = setup(conditionalGraph());
    state().requestKindChange('d1', 'AXIOM', null);
    const dialog = state().dialog;
    expect(dialog).toMatchObject({ kind: 'dependents', id: 'd1', to: 'AXIOM', dependents: ['g1'], rewriteAvailable: true, summary: 'Move to axioms: 1 dependent needs a rewrite' });
    expect(dialog?.kind === 'dependents' && dialog.detail).toMatch(/as an axiom it becomes `axiom d1\.holds : d1`/);
    state().confirmDependents('rewrite');
    // M2 carry-over 3: the dependents the dialog listed go with the choice.
    expect(last()).toMatchObject({ type: 'kindChange', payload: { id: 'd1', from: 'PROPOSITION', to: 'AXIOM', dependents: 'rewrite', confirmedDependents: ['g1'] } });
  });

  // M2 carry-over 2: core's singular text for one dependent, exactly as frozen in docs/m2-plan.md section 1.3.
  it('core words one dependent in the singular in the dialog’s explanation', () => {
    const { state } = setup(conditionalGraph());
    state().requestKindChange('d1', 'AXIOM', null);
    const dialog = state().dialog;
    expect(dialog?.kind === 'dependents' && dialog.detail).toMatch(
      /as an axiom it becomes `axiom d1\.holds : d1`.*Either rewrite that proof to use it directly \(mechanical, undoable\), or keep that proof and let it show as broken\.$/,
    );
  });

  it('when the board’s impact asks too but about other dependents, the host’s list and message win', () => {
    // The drop was posted while the graph showed no user of d1 (so it asked only for the optional reason) ...
    const withoutEdge = { ...conditionalGraph(1), edges: conditionalGraph(1).edges.filter((e) => e.target !== 'g1') };
    const { state, result } = setup(withoutEdge);
    state().requestKindChange('d1', 'AXIOM', null);
    expect(state().dialog).toMatchObject({ kind: 'rationale' });
    state().confirmRationale(null);
    // ... then a graph with the arrow d1 -> g1 arrived, and the host also knows a lemma without a card.
    state().applyGraph(conditionalGraph(2));
    result('r1', refused('needs-confirmation', 'd1.holds takes a hypothesis, but … 2 dependents that pass it arguments must change: …', ['g1', 'Spyro.helper_lemma']));
    expect(state().dialog).toMatchObject({
      kind: 'dependents',
      id: 'd1',
      dependents: ['g1', 'Spyro.helper_lemma'],
      summary: 'Move to axioms: 2 dependents need a rewrite',
      detail: 'd1.holds takes a hypothesis, but … 2 dependents that pass it arguments must change: …',
    });
  });

  it('when only the host asks (its facts know more than the graph), the title follows the host’s list and the detail is the host’s message', () => {
    const { state, result } = setup(spyroGraph(1));
    // From the graph alone P->A of the proposition needs no confirmation (it asks only for the optional reason) ...
    state().requestKindChange('cynder-not-good', 'AXIOM', null);
    expect(state().dialog).toMatchObject({ kind: 'rationale' });
    state().confirmRationale(null);
    // ... but the host's facts say its proof takes a hypothesis and a lemma passes it one.
    // The planner's singular text (docs/m2-plan.md section 1.3, carry-over 2).
    const message = 'cynder_not_good.holds takes a hypothesis, but as an axiom it becomes `axiom cynder_not_good.holds : cynder_not_good`, so 1 dependent that passes it arguments must change: rewrite that dependent to use it directly, or keep it and let it show as broken.';
    result('r1', refused('needs-confirmation', message, ['Spyro.helper_lemma']));
    expect(state().dialog).toEqual({
      kind: 'dependents',
      id: 'cynder-not-good',
      to: 'AXIOM',
      beforeId: null,
      dependents: ['Spyro.helper_lemma'],
      rewriteAvailable: true,
      summary: 'Move to axioms: 1 dependent needs a rewrite',
      detail: message,
    });
    expect(state().toasts).toEqual([]);
  });
});
