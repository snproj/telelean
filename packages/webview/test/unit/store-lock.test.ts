/**
 * Spec v4 ES-7, ES-9, UN-1, UN-3, A27 (slice 1f): while a run of the model folder is active (any subject, any state
 * before it ends), or this board's start is on its way, the Current board is read-only. Every edit action of the store
 * posts nothing and changes nothing (an info toast says why), Undo and Redo post nothing at all (the disabled buttons
 * say why), an edit under way ends when the lock begins, and viewing keeps working. The Proposed view never posts a
 * board Undo either. Slice 2h (§5.12): the Proposed view is an edit session's (M2's proposal is retired); the board
 * stack stays locked during a session with its own text, and a move there is a session step (`moveProposed`).
 */
import { EDIT_SESSION_ACTIVE, hostMessage, REVIEW_TEXTS, spyroGraph, type ActionOutcome, type RunState, type RunView, type SessionView, type TlGraph, type WebviewToHostMessage } from '@telelean/core';
import { describe, expect, it } from 'vitest';
import {
  arrowLock,
  createBoardStore,
  editLock,
  PROPOSED_ARROWS_LOCKED,
  undoLock,
  undoRedoButtons,
} from '../../src/state/store';
import { historyListing, workspaceState } from '../shared/graphs';
import { runView, TARGET } from '../shared/runs';
import { sessionRun, shownStage } from '../shared/sessions';

const DARK = 'cynder-dark-past';
const ACTIVE: readonly RunState[] = ['starting', 'working', 'waiting-for-answer', 'gate', 'review', 'interrupted'];
const ENDED: readonly RunState[] = ['accepted', 'discarded', 'cancelled', 'failed'];

function setup(graph: TlGraph = spyroGraph()) {
  const sent: WebviewToHostMessage[] = [];
  const store = createBoardStore((m) => sent.push(m), { today: () => '2026-11-19', setTimer: () => undefined, persist: () => undefined });
  store.getState().applyGraph(graph);
  const state = () => store.getState();
  const run = (value: RunView | null) => state().receive(hostMessage('run', { run: value }));
  const session = (value: SessionView | null) => state().receive(hostMessage('session', { session: value }));
  const result = (requestId: string, outcome: ActionOutcome) => state().receive(hostMessage('actionResult', { requestId, outcome }));
  state().receive(hostMessage('workspace', { state: workspaceState() }));
  return { store, sent, state, run, session, result };
}

/** Every edit gesture the store offers, each tried once on the board on screen. */
function tryEveryEdit(t: ReturnType<typeof setup>): Record<string, unknown> {
  const s = t.state;
  const out: Record<string, unknown> = {};
  out.addNode = s().addNode('AXIOM', 'Critics notice ratings');
  out.editNode = s().editNode(TARGET, 'naturalName', 'Cynder would be a bad addition');
  s().startEdit(TARGET, 'rationale');
  out.editing = s().editing;
  s().openDelete(DARK);
  out.deleteDialog = s().dialog;
  s().deleteNode(DARK);
  s().requestKindChange(TARGET, 'AXIOM', null);
  s().moveToAxioms(TARGET);
  s().dropCard(TARGET, 'AXIOM', null);
  s().reorder(DARK, null);
  out.moveCard = s().moveCard(DARK, 1);
  out.addArrows = s().addArrows(TARGET, ['new-spyro-pg']);
  out.removeArrows = s().removeArrows([{ source: DARK, target: TARGET }]);
  out.setFromNothing = s().setFromNothing('new-spyro-pg', true);
  s().clickCard(DARK, false);
  out.drawArrows = s().drawArrowsFromSelection(TARGET);
  s().claimPending(TARGET);
  s().moveCards({ [TARGET]: { x: 10, y: 20 } });
  s().selectIncomingArrows(TARGET);
  out.deleteSelected = s().deleteSelectedArrows();
  // Slice 1c2: the Delete key, with arrows selected and a card focused.
  out.pressDelete = s().pressDelete(DARK);
  const entry = historyListing().entries[0];
  if (entry) s().openRevert(entry);
  out.revertDialog = s().dialog;
  s().revertHistory('c0ffee1');
  let created: ActionOutcome | undefined;
  s().createSubject('Bayonetta', (outcome) => (created = outcome));
  out.createSubject = created;
  s().undo();
  s().redo();
  out.dialog = s().dialog;
  return out;
}

/** The message types that change the user's files (none may be posted while the board is locked). */
const EDIT_TYPES = new Set([
  'addNode',
  'editNode',
  'deleteNode',
  'kindChange',
  'reorder',
  'theseSuffice',
  'createSubject',
  'addArrows',
  'removeArrows',
  'setFromNothing',
  'claimPending',
  'moveCards',
  'undo',
  'redo',
  'historyRevert',
]);
const edits = (sent: readonly WebviewToHostMessage[]) => sent.filter((m) => EDIT_TYPES.has(m.type));

describe('editLock (ES-9): when the Current board is read-only', () => {
  it('while a run of the model folder is active, in any state and on any subject; not once it has ended', () => {
    expect(editLock({ run: null, runBusy: null })).toBeNull();
    for (const state of ACTIVE) {
      expect(editLock({ run: runView({ state }), runBusy: null }), state).toBe(EDIT_SESSION_ACTIVE);
      expect(editLock({ run: runView({ state, subject: 'Bayonetta' }), runBusy: null }), state).toBe(EDIT_SESSION_ACTIVE);
    }
    for (const state of ENDED) expect(editLock({ run: runView({ state }), runBusy: null }), state).toBeNull();
    // This board's start is on its way to the host: locked already (the host refuses edits then too).
    expect(editLock({ run: null, runBusy: { action: 'start', requestId: 'r1' } })).toBe(EDIT_SESSION_ACTIVE);
    expect(editLock({ run: null, runBusy: { action: 'cancel', requestId: 'r1' } })).toBeNull();
    expect(EDIT_SESSION_ACTIVE).toBe("An edit session is active: the board can't be edited until you apply or exit it.");
  });
});

describe('the store while the board is locked', () => {
  it('no edit gesture posts anything or changes the board; an info toast says why (Undo and Redo stay silent, A27)', () => {
    const t = setup();
    t.run(runView({ state: 'working' }));
    const before = { nodes: t.state().nodes, order: t.state().order, edges: t.state().edges, positions: t.state().positions };
    const out = tryEveryEdit(t);
    expect(edits(t.sent)).toEqual([]);
    expect({ nodes: t.state().nodes, order: t.state().order, edges: t.state().edges, positions: t.state().positions }).toEqual(before);
    expect(out).toMatchObject({
      addNode: null,
      editNode: false,
      editing: null,
      deleteDialog: null,
      moveCard: false,
      addArrows: false,
      removeArrows: false,
      setFromNothing: false,
      drawArrows: false,
      deleteSelected: true, // handled: nothing sent, and the card's delete dialog stays shut
      pressDelete: true, // the same through the key (slice 1c2)
      revertDialog: null,
      createSubject: { ok: false, code: 'conflict', error: EDIT_SESSION_ACTIVE },
      dialog: null,
    });
    expect(Object.keys(t.state().provisional)).toEqual([]);
    expect(t.state().toasts.map((x) => [x.level, x.text])).toEqual([['info', EDIT_SESSION_ACTIVE]]);
  });

  it('Undo and Redo post nothing and add no toast (the disabled buttons say why)', () => {
    const t = setup();
    t.run(runView({ state: 'review' }));
    t.state().undo();
    t.state().redo();
    expect(t.sent.filter((m) => m.type === 'undo' || m.type === 'redo')).toEqual([]);
    expect(t.state().toasts).toEqual([]);
  });

  it('viewing keeps working: select, expand, arrows into a card, Esc, history list and preview, copy, open, subjects', () => {
    const t = setup();
    t.run(runView({ state: 'working', subject: 'Bayonetta' })); // another subject's run locks this board too
    t.state().clickCard(DARK, false);
    expect(t.state().selected).toEqual([DARK]);
    t.state().clickCard(TARGET, true);
    expect(t.state().selected).toEqual([DARK, TARGET]);
    t.state().toggleExpanded(TARGET);
    expect(t.state().expanded[TARGET]).toBe(true);
    expect(t.state().selectIncomingArrows(TARGET)).toBe(true);
    expect(t.state().selectedArrows.map((a) => a.source)).toEqual([DARK, 'new-spyro-pg', 'pg-no-dark-past']);
    t.state().clearSelection();
    expect(t.state().selectedArrows).toEqual([]);
    t.state().requestHistory();
    t.state().previewHistory('c0ffee1', 'parent');
    expect(t.state().copyText('abbrev x : Prop := y')).toBe(true);
    t.state().openInEditor('Model/Spyro/Main.lean');
    t.state().selectSubject('Bayonetta');
    // (Selecting a card's incoming arrows clears the card selection: the third `select`.)
    expect(t.sent.map((m) => m.type)).toEqual(['select', 'select', 'select', 'historyList', 'historyPreview', 'copyText', 'openInEditor', 'selectSubject']);
    expect(edits(t.sent)).toEqual([]);
  });

  it('when the lock begins, an inline edit, a drag and an edit dialog under way end', () => {
    const t = setup();
    t.state().startEdit(TARGET, 'naturalName');
    t.state().startDrag(DARK);
    t.state().openDelete(DARK);
    expect(t.state().editing).not.toBeNull();
    expect(t.state().drag).not.toBeNull();
    expect(t.state().dialog).toMatchObject({ kind: 'delete' });
    t.run(runView({ state: 'starting' }));
    expect(t.state().editing).toBeNull();
    expect(t.state().drag).toBeNull();
    expect(t.state().dialog).toBeNull();
    // A drag cannot start while locked.
    t.state().startDrag(DARK);
    expect(t.state().drag).toBeNull();
  });

  it('a dialog answered after the lock began sends nothing', () => {
    const t = setup();
    t.state().moveToAxioms(TARGET); // the impact first: the rationale dialog
    expect(t.state().dialog).toMatchObject({ kind: 'rationale' });
    // The lock begins with a start on its way (no run message yet): the dialog stays, but its answer is refused.
    t.store.setState({ runBusy: { action: 'start', requestId: 'r9' } });
    t.state().confirmRationale('a friend said so');
    expect(edits(t.sent)).toEqual([]);
    expect(t.state().dialog).toBeNull();
    expect(t.state().nodes[TARGET]?.type).toBe('PROPOSITION');
  });

  it('a start on its way locks the board; a refused start unlocks it; an ended run unlocks it too (UN-3: Undo works again)', () => {
    const t = setup();
    // Slice 1e: Formalize for dependencies on a selected arrow (the tray's "These suffice" is gone).
    t.state().selectArrow(DARK, TARGET, false);
    expect(t.state().formalize()).toBe(true);
    expect(t.sent.at(-1)?.type).toBe('formalize');
    expect(t.state().addNode('AXIOM', 'Critics notice ratings')).toBeNull();
    t.result('r1', { ok: false, code: 'not-yet', error: 'Claude could not be started: no binary' });
    expect(editLock(t.state())).toBeNull();
    expect(t.state().addNode('AXIOM', 'Critics notice ratings')).not.toBeNull();
    // A run that ends (here: accepted) unlocks the board: Undo reaches the host again (the Accept is its newest step).
    t.run(runView({ state: 'review' }));
    t.state().undo();
    expect(t.sent.filter((m) => m.type === 'undo')).toEqual([]);
    t.run(runView({ state: 'accepted', accepted: { changedFiles: true } }));
    t.state().undo();
    expect(t.sent.filter((m) => m.type === 'undo')).toHaveLength(1);
  });
});

describe('the Proposed view never posts a board edit or a board Undo (UN-1; slice 2h: an edit session’s)', () => {
  it('during a session: no board edit posts; a move is a session step (moveProposed); the arrow actions have their own reason', () => {
    const t = setup();
    const view = shownStage();
    t.run(sessionRun(view));
    t.session(view);
    expect(t.state().proposedView).toBe(true);
    tryEveryEdit(t);
    expect(edits(t.sent)).toEqual([]);
    expect(t.sent.filter((m) => m.type === 'moveProposed').map((m) => m.payload)).toEqual([{ runId: view.runId, positions: { [TARGET]: { x: 10, y: 20 } }, requestId: 'r1' }]);
    expect(arrowLock(t.state())).toBe(PROPOSED_ARROWS_LOCKED);
    expect(PROPOSED_ARROWS_LOCKED).toBe('Arrows change only through review items and transforms.');
    // Current | Proposed still switches; on Current the session's own reason applies.
    t.state().setProposedView(false);
    expect(arrowLock(t.state())).toBe(EDIT_SESSION_ACTIVE);
  });

  it('a session on screen without a run known (should one ever be): the board Undo posts nothing; Ctrl+Z there is the session’s', () => {
    const t = setup();
    t.session(shownStage());
    expect(t.state().proposedView).toBe(true);
    expect(editLock(t.state())).toBeNull();
    expect(undoLock(t.state())).toBe(REVIEW_TEXTS.boardUndoLocked);
    t.state().undo();
    t.state().redo();
    expect(t.sent.filter((m) => m.type === 'undo' || m.type === 'redo')).toEqual([]);
    // A move there is the session's step even with no run lock: moveProposed, never the board's moveCards.
    t.state().moveCards({ [TARGET]: { x: 3, y: 4 } });
    expect(t.sent.filter((m) => m.type === 'moveProposed')).toHaveLength(1);
    expect(t.sent.filter((m) => m.type === 'moveCards')).toEqual([]);
    const moved = t.sent.at(-1);
    t.result(moved !== undefined && 'requestId' in moved.payload ? (moved.payload.requestId as string) : '', { ok: true, label: 'Move', undoable: false });
    t.state().undoInScope();
    expect(t.sent.filter((m) => m.type === 'sessionUndo')).toHaveLength(1);
  });
});

describe('the header\'s Undo and Redo buttons (UN-3, A27)', () => {
  const workspace = { undo: 'Add axiom: Critics notice ratings', redo: 'Delete: The new Spyro game is PG' };

  it('enabled with the step as tooltip when unlocked; disabled with the reason while locked, even with steps to undo', () => {
    expect(undoRedoButtons(workspace, null)).toEqual({
      undo: { disabled: false, title: 'Undo: Add axiom: Critics notice ratings (Ctrl+Z)' },
      redo: { disabled: false, title: 'Redo: Delete: The new Spyro game is PG (Ctrl+Shift+Z)' },
    });
    expect(undoRedoButtons({ undo: null, redo: null }, null)).toEqual({ undo: { disabled: true, title: 'Nothing to undo' }, redo: { disabled: true, title: 'Nothing to redo' } });
    expect(undoRedoButtons(workspace, EDIT_SESSION_ACTIVE)).toEqual({
      undo: { disabled: true, title: EDIT_SESSION_ACTIVE },
      redo: { disabled: true, title: EDIT_SESSION_ACTIVE },
    });
  });

  it('undoLock: a run\'s lock; during a session (slice 2h, §5.12) the board stack\'s own text on either view; none without a run', () => {
    const t = setup();
    expect(undoLock(t.state())).toBeNull();
    t.run(runView({ state: 'working' }));
    expect(undoLock(t.state())).toBe(EDIT_SESSION_ACTIVE);
    const view = shownStage();
    t.run(sessionRun(view));
    expect(undoLock(t.state())).toBe(REVIEW_TEXTS.boardUndoLocked);
    expect(REVIEW_TEXTS.boardUndoLocked).toBe("Your files can't change during an edit session; Undo in the Proposed view undoes your review steps.");
    t.session(view);
    expect(t.state().proposedView).toBe(true);
    expect(undoLock(t.state())).toBe(REVIEW_TEXTS.boardUndoLocked);
    t.state().setProposedView(false);
    expect(undoLock(t.state())).toBe(REVIEW_TEXTS.boardUndoLocked);
    expect(undoRedoButtons(t.state().workspace, undoLock(t.state())).undo).toEqual({ disabled: true, title: REVIEW_TEXTS.boardUndoLocked });
    // The session ended (the run with it): the board stack is the person's again.
    t.session(null);
    t.run(runView({ state: 'cancelled' }));
    expect(undoLock(t.state())).toBeNull();
  });
});
