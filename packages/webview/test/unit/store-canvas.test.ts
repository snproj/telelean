/**
 * Spec v4 slice 1c, the board store's canvas parts: a new proposition's place (addNode's `position`, BD-8; "New
 * proposition here", CM-7), the right-click menu's selection rule (CM-7) and the mark selection, the Vocabulary and
 * Definitions band's height (BD-1), and the canvas positions of the Proposed view (the proposal's, plus the current
 * positions of the cards it removes).
 */
import { buildGraph, EDIT_SESSION_ACTIVE, hostMessage, spyroGraph, spyroProvedGraph, type ActionOutcome, type TlGraph, type WebviewToHostMessage } from '@telelean/core';
import { describe, expect, it } from 'vitest';
import { buildOverlay } from '../../src/model/run';
import { boardView, createBoardStore, readTopSplit, TOP_SPLIT_LIMITS, type PersistedState, type StoreOptions } from '../../src/state/store';
import { makeNode } from '../shared/graphs';
import { normativeProposal, reviewRun, runView } from '../shared/runs';

const GOAL = 'cynder-not-good';
const DARK = 'cynder-dark-past';
const MARKED = 'spyro-is-fun';

/** spyroGraph plus a proposition marked "follows from nothing". */
function withMark(base: TlGraph = spyroGraph()): TlGraph {
  const nodes = [...base.nodes, makeNode(MARKED, 'PROPOSITION', 'Spyro games are fun', {}, { fromNothing: true })];
  return { ...buildGraph({ subject: base.subject, version: base.version, nodes, vocabulary: base.vocabulary, diagnostics: base.diagnostics }), semantic: base.semantic };
}

function setup(graph: TlGraph = spyroGraph(), options: StoreOptions = {}) {
  const sent: WebviewToHostMessage[] = [];
  const persisted: PersistedState = { ...(options.persisted ?? {}) };
  const store = createBoardStore((m) => sent.push(m), { today: () => '2026-11-19', setTimer: () => undefined, persist: (patch) => Object.assign(persisted, patch), ...options });
  store.getState().applyGraph(graph);
  const state = () => store.getState();
  const result = (requestId: string, outcome: ActionOutcome) => state().receive(hostMessage('actionResult', { requestId, outcome }));
  const last = () => sent.at(-1);
  const requestIdOf = (m: WebviewToHostMessage | undefined) => (m?.payload as { requestId?: string } | undefined)?.requestId ?? '';
  return { store, sent, state, result, last, requestIdOf, persisted };
}

describe("a new proposition's place on the canvas (BD-3, BD-8)", () => {
  it('addNode sends the position (rounded, within the canvas) and shows the card there until the host\'s card arrives', () => {
    const { state, last, sent } = setup();
    const id = state().addNode('PROPOSITION', 'Cynder gets a spin-off', { position: { x: 120.6, y: -3e7 } }) ?? '';
    expect(last()).toEqual({ v: 1, type: 'addNode', payload: { clientId: id, type: 'PROPOSITION', naturalName: 'Cynder gets a spin-off', requestId: 'r1', position: { x: 121, y: -1_000_000 } } });
    expect(state().positions[id]).toEqual({ x: 121, y: -1_000_000 });
    // A graph without the host's card yet: the provisional card keeps its place.
    state().applyGraph(spyroGraph(2));
    expect(state().provisional[id]).toBe(true);
    expect(state().positions[id]).toEqual({ x: 121, y: -1_000_000 });
    // The host's card (another id) arrives with its stored position: the provisional one goes, and its place with it.
    const added = makeNode('cynder-gets-a-spin-off', 'PROPOSITION', 'Cynder gets a spin-off', {});
    const base = spyroGraph(3);
    state().applyGraph({ ...buildGraph({ subject: 'Spyro', version: 3, nodes: [...base.nodes, added], vocabulary: base.vocabulary, diagnostics: [] }), positions: { [added.id]: { x: 121, y: -1_000_000 } } });
    expect(state().positions).toEqual({ [added.id]: { x: 121, y: -1_000_000 } });
    expect(sent.filter((m) => m.type === 'addNode')).toHaveLength(1);
  });

  it('a refused add takes the card and its place away; an axiom never gets a position', () => {
    const { state, last, result, requestIdOf } = setup();
    const id = state().addNode('PROPOSITION', 'Cynder gets a spin-off', { position: { x: 1, y: 2 } }) ?? '';
    result(requestIdOf(last()), { ok: false, code: 'invalid', error: 'No.' });
    expect(state().nodes[id]).toBeUndefined();
    expect(state().positions[id]).toBeUndefined();
    const axiom = state().addNode('AXIOM', 'Spyro is purple', { position: { x: 1, y: 2 } }) ?? '';
    expect(last()?.payload).not.toHaveProperty('position');
    expect(state().positions[axiom]).toBeUndefined();
  });
});

describe('"New proposition here" (CM-7)', () => {
  it('switches the A|P box to Proposition, asks it for the focus, and the next proposition goes to the point', () => {
    const { state, last } = setup();
    expect(state().newPropositionAt({ x: 40.4, y: 99.5 })).toBe(true);
    expect(state()).toMatchObject({ promptKind: 'PROPOSITION', newCardAt: { x: 40, y: 100 }, promptFocus: 1 });
    // The box passes the point on (PromptBox: `newCardAt ?? …`); the add consumes it.
    state().addNode('PROPOSITION', 'Cynder gets a spin-off', { position: state().newCardAt ?? undefined });
    expect(last()?.payload).toMatchObject({ position: { x: 40, y: 100 } });
    expect(state().newCardAt).toBeNull();
  });

  it('is forgotten by the ✕, by switching the box to Axiom, and by another subject', () => {
    const { state } = setup();
    state().newPropositionAt({ x: 1, y: 1 });
    state().clearNewCardAt();
    expect(state().newCardAt).toBeNull();
    state().newPropositionAt({ x: 1, y: 1 });
    state().setPromptKind('AXIOM');
    expect(state().newCardAt).toBeNull();
    state().newPropositionAt({ x: 1, y: 1 });
    state().applyGraph({ ...spyroGraph(9), subject: 'Zelda' });
    expect(state().newCardAt).toBeNull();
  });

  it('does nothing during an edit session (ES-9, with the reason) nor in the Proposed view', () => {
    const locked = setup();
    locked.state().receive(hostMessage('run', { run: runView({ state: 'working' }) }));
    expect(locked.state().newPropositionAt({ x: 1, y: 1 })).toBe(false);
    expect(locked.state().newCardAt).toBeNull();
    expect(locked.state().promptKind).toBe('AXIOM');
    expect(locked.state().toasts.map((t) => t.text)).toEqual([EDIT_SESSION_ACTIVE]);

    // The Proposed view is read-only: nothing happens there, and no toast (the menu shows the entry disabled).
    const proposed = setup();
    const p = normativeProposal();
    proposed.state().receive(hostMessage('run', { run: reviewRun(p) }));
    proposed.state().receive(hostMessage('proposal', { proposal: p }));
    expect(proposed.state().proposedView).toBe(true);
    const toasts = proposed.state().toasts.length;
    const focus = proposed.state().promptFocus;
    expect(proposed.state().newPropositionAt({ x: 1, y: 1 })).toBe(false);
    expect(proposed.state()).toMatchObject({ newCardAt: null, promptKind: 'AXIOM', promptFocus: focus });
    expect(proposed.state().toasts).toHaveLength(toasts);
  });
});

describe('selection for the right-click menu (CM-7) and of marks (AR-5)', () => {
  it('a card is selected first, unless it is selected or other cards are; empty canvas keeps the selection', () => {
    const { state, sent } = setup();
    state().selectForMenu({ kind: 'card', id: GOAL });
    expect(state().selected).toEqual([GOAL]);
    expect(sent.at(-1)).toEqual({ v: 1, type: 'select', payload: { ids: [GOAL] } });
    state().selectForMenu({ kind: 'card', id: DARK }); // other cards are selected: the selection stays
    expect(state().selected).toEqual([GOAL]);
    state().selectForMenu({ kind: 'canvas', at: { x: 0, y: 0 } });
    expect(state().selected).toEqual([GOAL]);
  });

  it('an arrow or a mark replaces the selection unless it is part of it', () => {
    const { state } = setup(withMark());
    state().clickCard(GOAL, false);
    state().selectForMenu({ kind: 'arrow', source: DARK, target: GOAL });
    expect(state()).toMatchObject({ selected: [], selectedArrows: [{ source: DARK, target: GOAL }], selectedMarks: [] });
    state().selectForMenu({ kind: 'mark', id: MARKED });
    expect(state()).toMatchObject({ selected: [], selectedArrows: [], selectedMarks: [MARKED] });
    state().selectForMenu({ kind: 'mark', id: MARKED });
    expect(state().selectedMarks).toEqual([MARKED]);
  });

  it('selectMark: a plain click replaces, Ctrl toggles; a card without the mark is ignored', () => {
    const { state, sent } = setup(withMark());
    state().clickCard(GOAL, false);
    const before = sent.length;
    state().selectMark(MARKED, false);
    expect(state()).toMatchObject({ selected: [], selectedMarks: [MARKED] });
    expect(sent.slice(before)).toEqual([{ v: 1, type: 'select', payload: { ids: [] } }]);
    state().selectArrow(DARK, GOAL, true);
    state().selectMark(MARKED, true);
    expect(state()).toMatchObject({ selectedMarks: [], selectedArrows: [{ source: DARK, target: GOAL }] });
    state().selectMark(GOAL, false);
    expect(state().selectedMarks).toEqual([]);
  });

  it('the Proposed view selects nothing', () => {
    const { state } = setup(withMark());
    const p = normativeProposal();
    state().receive(hostMessage('run', { run: reviewRun(p) }));
    state().receive(hostMessage('proposal', { proposal: p }));
    expect(state().proposedView).toBe(true);
    state().selectForMenu({ kind: 'card', id: GOAL });
    state().selectMark(MARKED, false);
    expect(state()).toMatchObject({ selected: [], selectedMarks: [] });
  });
});

describe('the Vocabulary and Definitions band (BD-1)', () => {
  it('its height is clamped, kept in the webview state, and read back defensively', () => {
    const { state, persisted } = setup(spyroGraph(), { persisted: { topSplit: 0.4 } });
    expect(state().topSplit).toBe(0.4);
    state().setTopSplit(0.95);
    expect(state().topSplit).toBe(TOP_SPLIT_LIMITS.max);
    expect(persisted.topSplit).toBe(TOP_SPLIT_LIMITS.max);
    state().setTopSplit(null);
    expect(persisted.topSplit).toBeNull();
    expect(readTopSplit('half')).toBeNull();
    expect(readTopSplit(0.01)).toBe(TOP_SPLIT_LIMITS.min);
    expect(setup(spyroGraph(), { persisted: { topSplit: Number.NaN } }).state().topSplit).toBeNull();
  });
});

describe('positions in the Proposed view (BD-3)', () => {
  it("the proposal's positions (carried over from the board by the runner), plus the current place of a card it removes", () => {
    const gone = makeNode('gone', 'PROPOSITION', 'A card the proposal removes', {});
    const base = spyroGraph();
    const current: TlGraph = {
      ...buildGraph({ subject: 'Spyro', version: 1, nodes: [...base.nodes, gone], vocabulary: base.vocabulary, diagnostics: [] }),
      positions: { [GOAL]: { x: 1, y: 2 }, gone: { x: 5, y: 6 } },
    };
    const p0 = normativeProposal();
    const p = normativeProposal({ graph: { ...spyroProvedGraph(30), positions: { [GOAL]: { x: 1, y: 2 } } }, diff: { ...p0.diff, nodes: { ...p0.diff.nodes, gone: { change: 'removed', fields: [] } } } });
    const nodes = Object.fromEntries(current.nodes.map((n) => [n.id, n]));
    expect(buildOverlay(p, { nodes, vocabulary: current.vocabulary, positions: current.positions ?? {} }, false).positions).toEqual({ [GOAL]: { x: 1, y: 2 }, gone: { x: 5, y: 6 } });

    const { state } = setup(current);
    state().receive(hostMessage('run', { run: reviewRun(p) }));
    state().receive(hostMessage('proposal', { proposal: p }));
    expect(boardView(state()).positions).toEqual({ [GOAL]: { x: 1, y: 2 }, gone: { x: 5, y: 6 } });
    state().setProposedView(false);
    expect(boardView(state()).positions).toBe(state().positions);
  });
});
