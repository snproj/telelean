/**
 * Spec v4 AR-1, AR-7, CM-2, ES-9 (slice 1c2): the board store's side of the arrow gestures: the Delete key
 * (`pressDelete`: one removeArrows for the selected arrows and marks, a card's dialog only without them, the reason
 * while locked or in the Proposed view), the selection rectangle (`selectArea`), a proposition moved over the AXIOMS
 * column (`overAxioms`, and the "Move to axioms" a drop there runs), and which gestures work when (`gestureGateOf`).
 * Slice 2h (§5.10, D2-20, D2-33): the Proposed view is an edit session's: it selects (never Claude's undecided arrow),
 * moves a card as a session step, and draws nothing.
 */
import { buildGraph, EDIT_SESSION_ACTIVE, hostMessage, REVIEW_TEXTS, spyroGraph, spyroProvedGraph, type ActionOutcome, type SessionView, type TlGraph, type WebviewToHostMessage } from '@telelean/core';
import { describe, expect, it } from 'vitest';
import { canvasDropOutcome } from '../../src/board/gestures';
import { MENU_PROPOSED_ARROWS } from '../../src/board/menu';
import { createBoardStore, gestureGateOf } from '../../src/state/store';
import { makeNode, workspaceState } from '../shared/graphs';
import { runView } from '../shared/runs';
import { confirmingSession, sessionRun, shownStage, stepSession } from '../shared/sessions';

const GOAL = 'cynder-not-good';
const DARK = 'cynder-dark-past';
const PG = 'new-spyro-pg';
const RULE = 'pg-no-dark-past';
const MARKED = 'spyro-is-fun';

/** spyroGraph plus a proposition marked "follows from nothing". */
function withMark(base: TlGraph = spyroGraph()): TlGraph {
  const nodes = [...base.nodes, makeNode(MARKED, 'PROPOSITION', 'Spyro games are fun', {}, { fromNothing: true })];
  return { ...buildGraph({ subject: base.subject, version: base.version, nodes, vocabulary: base.vocabulary, diagnostics: base.diagnostics }), semantic: base.semantic };
}

function setup(graph: TlGraph = withMark()) {
  const sent: WebviewToHostMessage[] = [];
  const store = createBoardStore((m) => sent.push(m), { today: () => '2026-11-19', setTimer: () => undefined, persist: () => undefined });
  store.getState().applyGraph(graph);
  store.getState().receive(hostMessage('workspace', { state: workspaceState() }));
  const state = () => store.getState();
  const result = (requestId: string, outcome: ActionOutcome) => state().receive(hostMessage('actionResult', { requestId, outcome }));
  const ofType = (type: string) => sent.filter((m) => m.type === type);
  /** Slice 2h: an edit session's stage arrives (its run first): the board switches to its Proposed view. */
  const session = (view: SessionView = shownStage()) => {
    state().receive(hostMessage('run', { run: sessionRun(view) }));
    state().receive(hostMessage('session', { session: view }));
  };
  return { store, sent, state, result, ofType, session };
}

const toasts = (t: ReturnType<typeof setup>) => t.state().toasts.map((x) => [x.level, x.text]);

describe('the Delete key (AR-1): arrows and marks first, a card only without them', () => {
  it('with arrows and a mark selected and a card focused: one removeArrows with both, and no card dialog', () => {
    const t = setup();
    t.state().selectIncomingArrows(GOAL);
    t.state().selectMark(MARKED, true);
    expect(t.state().pressDelete(DARK)).toBe(true);
    expect(t.ofType('removeArrows')).toHaveLength(1);
    expect(t.sent.at(-1)).toEqual({
      v: 1,
      type: 'removeArrows',
      payload: { arrows: [DARK, PG, RULE].map((source) => ({ source, target: GOAL })), marks: [MARKED], requestId: 'r1' },
    });
    expect(t.state().dialog).toBeNull();
    expect(t.ofType('deleteNode')).toEqual([]);
  });

  it('with nothing selected, the focused card\'s delete dialog; with no card focused either, nothing (false)', () => {
    const t = setup();
    expect(t.state().pressDelete(DARK)).toBe(true);
    expect(t.state().dialog).toEqual({ kind: 'delete', id: DARK });
    t.state().closeDialog();
    // Selected cards are never deleted by the key alone (only a focused card's own Delete asks).
    t.state().clickCard(DARK, false);
    const count = t.sent.length;
    expect(t.state().pressDelete(null)).toBe(false);
    expect(t.state().pressDelete('nope')).toBe(false);
    expect(t.sent.length).toBe(count);
    expect(t.state().dialog).toBeNull();
  });

  it('a proof uses a removed arrow: one question for the whole Delete (A16), and Cancel sends nothing', () => {
    const t = setup(withMark(spyroProvedGraph()));
    t.state().selectArrow(DARK, GOAL, false);
    t.state().selectMark(MARKED, true);
    expect(t.state().pressDelete(null)).toBe(true);
    expect(t.state().dialog).toMatchObject({ kind: 'arrows', change: { kind: 'remove-arrows', arrows: [{ source: DARK, target: GOAL }], marks: [MARKED] } });
    t.state().closeDialog();
    expect(t.ofType('removeArrows')).toEqual([]);
  });

  it('during an edit session (ES-9): nothing is sent, no dialog opens, and the reason is shown', () => {
    const t = setup();
    t.state().selectIncomingArrows(GOAL);
    t.state().receive(hostMessage('run', { run: runView({ state: 'working' }) }));
    expect(t.state().pressDelete(DARK)).toBe(true);
    t.state().clearSelection();
    expect(t.state().pressDelete(DARK)).toBe(true);
    expect(t.ofType('removeArrows')).toEqual([]);
    expect(t.state().dialog).toBeNull();
    expect(toasts(t)).toEqual([['info', EDIT_SESSION_ACTIVE]]);
  });

  it('in the Proposed view: arrows change only through review items and transforms (the reason, nothing sent)', () => {
    const t = setup(spyroProvedGraph());
    t.session();
    expect(t.state().proposedView).toBe(true);
    // Slice 2h: a session's Proposed view selects its drawn arrows, never Claude's arrow still in review (D2-20).
    t.state().selectIncomingArrows(GOAL);
    expect(t.state().selectedArrows.map((a) => a.source)).toEqual([DARK, RULE]);
    expect(t.state().pressDelete(null)).toBe(true);
    expect(toasts(t)).toEqual([['info', MENU_PROPOSED_ARROWS]]);
    expect(t.ofType('removeArrows')).toEqual([]);
    t.state().clearSelection();
    expect(t.state().pressDelete(GOAL)).toBe(false);
    expect(t.state().dialog).toBeNull();
  });
});

describe('the selection rectangle (CM-2): selectArea', () => {
  const found = { cards: [GOAL, MARKED], arrows: [{ source: DARK, target: GOAL }], marks: [MARKED] };

  it('replaces the selection with what it found (cards in its order, arrows, marks) and tells the host the cards', () => {
    const t = setup();
    t.state().clickCard(DARK, false);
    t.state().selectArea(found, false);
    expect(t.state().selected).toEqual([GOAL, MARKED]);
    expect(t.state().selectedArrows).toEqual([{ source: DARK, target: GOAL }]);
    expect(t.state().selectedMarks).toEqual([MARKED]);
    expect(t.ofType('select').at(-1)?.payload).toEqual({ ids: [GOAL, MARKED] });
    // The same again changes nothing and tells the host nothing.
    const count = t.sent.length;
    t.state().selectArea(found, false);
    expect(t.sent.length).toBe(count);
    // An empty rectangle (a plain one) clears it.
    t.state().selectArea({ cards: [], arrows: [], marks: [] }, false);
    expect([t.state().selected, t.state().selectedArrows, t.state().selectedMarks]).toEqual([[], [], []]);
  });

  it('with Ctrl/Cmd it adds to the selection (nothing twice)', () => {
    const t = setup();
    t.state().clickCard(DARK, false);
    t.state().selectArrow(PG, GOAL, true);
    t.state().selectArea(found, true);
    expect(t.state().selected).toEqual([DARK, GOAL, MARKED]);
    expect(t.state().selectedArrows).toEqual([
      { source: PG, target: GOAL },
      { source: DARK, target: GOAL },
    ]);
    t.state().selectArea(found, true);
    expect(t.state().selected).toEqual([DARK, GOAL, MARKED]);
    expect(t.state().selectedArrows).toHaveLength(2);
  });

  it('keeps only what a click could select: known cards, drawn arrows, drawn marks', () => {
    const t = setup();
    t.state().selectArea({ cards: ['nope', GOAL], arrows: [{ source: GOAL, target: DARK }, { source: RULE, target: GOAL }, { source: 'nope', target: GOAL }], marks: [GOAL, MARKED] }, false);
    expect(t.state().selected).toEqual([GOAL]);
    expect(t.state().selectedArrows).toEqual([{ source: RULE, target: GOAL }]);
    expect(t.state().selectedMarks).toEqual([MARKED]);
  });

  it('works during an edit session (selecting is viewing); in a session\'s Proposed view it selects there, never Claude\'s undecided arrow (slice 2h)', () => {
    const t = setup();
    t.state().receive(hostMessage('run', { run: runView({ state: 'working' }) }));
    t.state().selectArea(found, false);
    expect(t.state().selected).toEqual([GOAL, MARKED]);
    const p = setup(spyroProvedGraph());
    p.session();
    p.state().selectArea({ cards: [GOAL], arrows: [{ source: DARK, target: GOAL }, { source: PG, target: GOAL }], marks: [] }, false);
    expect([p.state().selected, p.state().selectedArrows]).toEqual([[GOAL], [{ source: DARK, target: GOAL }]]);
    // Accepted, Claude's arrow is drawn as any arrow: it can be selected (and so asked about, D2-20).
    p.state().receive(hostMessage('session', { session: shownStage({ arrow: 'accepted' }) }));
    p.state().selectArea({ cards: [], arrows: [{ source: PG, target: GOAL }], marks: [] }, true);
    expect(p.state().selectedArrows).toEqual([
      { source: DARK, target: GOAL },
      { source: PG, target: GOAL },
    ]);
  });
});

describe('a proposition moved over the AXIOMS column (AR-7)', () => {
  it('overAxioms says which card is over it (the column\'s drop zone); a drop there runs "Move to axioms" with its impact first', () => {
    const t = setup();
    t.state().setOverAxioms({ id: GOAL, count: 1 });
    expect(t.state().overAxioms).toEqual({ id: GOAL, count: 1 });
    // What BoardInput does on the release: the card goes back, and "Move to axioms" states the impact first.
    const outcome = canvasDropOutcome([GOAL], t.state().overAxioms !== null);
    t.state().setOverAxioms(null);
    expect(outcome).toEqual({ kind: 'to-axioms', id: GOAL });
    if (outcome.kind === 'to-axioms') t.state().moveToAxioms(outcome.id);
    expect(t.state().dialog).toMatchObject({ kind: 'rationale', id: GOAL, to: 'AXIOM', summary: 'Move to axioms: adds axiom cynder_not_good.holds' });
    expect(t.ofType('kindChange')).toEqual([]);
    expect(t.ofType('moveCards')).toEqual([]);
  });

  it('is cleared when an edit session begins, on another subject, and in the Proposed view', () => {
    const t = setup();
    t.state().setOverAxioms({ id: GOAL, count: 2 });
    t.state().receive(hostMessage('run', { run: runView({ state: 'starting' }) }));
    expect(t.state().overAxioms).toBeNull();
    const u = setup();
    u.state().setOverAxioms({ id: GOAL, count: 1 });
    u.state().applyGraph({ ...spyroGraph(9), subject: 'Bayonetta' });
    expect(u.state().overAxioms).toBeNull();
    // Slice 1d carry-over: really switching to the Proposed view, by the toggle and by a session's stage that arrives.
    const v = setup(spyroProvedGraph());
    v.session();
    expect(v.state().proposedView).toBe(true);
    v.state().setProposedView(false);
    v.state().setOverAxioms({ id: GOAL, count: 1 });
    expect(v.state().overAxioms).not.toBeNull();
    v.state().setProposedView(true);
    expect(v.state().proposedView).toBe(true);
    expect(v.state().overAxioms).toBeNull();
    const w = setup(spyroProvedGraph());
    w.state().receive(hostMessage('run', { run: sessionRun(shownStage()) }));
    w.state().setOverAxioms({ id: GOAL, count: 1 });
    w.state().receive(hostMessage('session', { session: shownStage() }));
    expect(w.state().proposedView).toBe(true);
    expect(w.state().overAxioms).toBeNull();
  });

  it('a drop on the column lands where it was dropped (slice 1d carry-over): the kind change carries the axiom it goes before', () => {
    const t = setup();
    t.state().moveToAxioms(GOAL, PG);
    expect(t.state().dialog).toMatchObject({ kind: 'rationale', id: GOAL, to: 'AXIOM', beforeId: PG });
    t.state().confirmRationale('it is what I hold');
    expect(t.ofType('kindChange').at(-1)?.payload).toMatchObject({ id: GOAL, from: 'PROPOSITION', to: 'AXIOM', beforeId: PG });
    // Not an axiom of the column (or none): the end of the column.
    const u = setup();
    u.state().moveToAxioms(GOAL, 'no-such-card');
    expect(u.state().dialog).toMatchObject({ kind: 'rationale', beforeId: null });
  });
});

describe('which gestures work when (ES-9; gestureGateOf)', () => {
  it('everything on an idle board; during a run or a start on its way, only selecting; a session\'s Proposed view selects and moves (slice 2h), never draws', () => {
    const t = setup(spyroProvedGraph());
    expect(gestureGateOf(t.state())).toEqual({ draw: null, move: null, select: true });
    t.store.setState({ runBusy: { action: 'start', requestId: 'r9' } });
    expect(gestureGateOf(t.state())).toEqual({ draw: EDIT_SESSION_ACTIVE, move: EDIT_SESSION_ACTIVE, select: true });
    t.store.setState({ runBusy: null });
    t.state().receive(hostMessage('run', { run: sessionRun(shownStage()) }));
    expect(gestureGateOf(t.state())).toEqual({ draw: EDIT_SESSION_ACTIVE, move: EDIT_SESSION_ACTIVE, select: true });
    t.state().receive(hostMessage('session', { session: shownStage() }));
    expect(t.state().proposedView).toBe(true);
    // D2-33: a move there is a session step; drawing stays off (arrows change only through review items).
    expect(gestureGateOf(t.state())).toEqual({ draw: MENU_PROPOSED_ARROWS, move: null, select: true });
    // D2-62: while Claude's step runs nothing moves; nor while the end confirmation or Apply runs.
    t.state().receive(hostMessage('session', { session: stepSession() }));
    expect(gestureGateOf(t.state())).toEqual({ draw: MENU_PROPOSED_ARROWS, move: REVIEW_TEXTS.stepRunning, select: true });
    t.state().receive(hostMessage('session', { session: confirmingSession() }));
    expect(gestureGateOf(t.state()).move).toBe(REVIEW_TEXTS.formalizeConfirming);
    t.state().receive(hostMessage('session', { session: confirmingSession({}, { phase: 'applying' }) }));
    expect(gestureGateOf(t.state()).move).toBe(REVIEW_TEXTS.applyingNow);
    // Back on the Current view during the session: the session's reason.
    t.state().setProposedView(false);
    expect(gestureGateOf(t.state()).draw).toBe(EDIT_SESSION_ACTIVE);
  });

  it('slice 2h: the first stage switches to Proposed, and the selection keeps only what that view draws (D2-20)', () => {
    const t = setup(spyroProvedGraph());
    t.state().receive(hostMessage('run', { run: sessionRun(stepSession()) }));
    // On the Current board during the step: the arrows into the goal, Claude's future one included (it is the person's here).
    t.state().selectIncomingArrows(GOAL);
    expect(t.state().selectedArrows.map((a) => a.source)).toEqual([DARK, PG, RULE]);
    t.state().receive(hostMessage('session', { session: shownStage() }));
    expect(t.state().proposedView).toBe(true);
    expect(t.state().selectedArrows.map((a) => a.source)).toEqual([DARK, RULE]);
  });

  it('a draw released on a card adds one arrow, source → target (the store\'s addArrows; an axiom asks first, AR-6)', () => {
    const t = setup(spyroProvedGraph());
    // Into an axiom: the impact dialog, nothing sent yet.
    expect(t.state().addArrows(PG, [DARK])).toBe(true);
    expect(t.ofType('addArrows')).toEqual([]);
    expect(t.state().dialog).toMatchObject({ kind: 'arrows', id: PG, change: { kind: 'add-arrows', target: PG, sources: [DARK] } });
  });
});
