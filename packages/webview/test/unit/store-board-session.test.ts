/**
 * Slice 2h (docs/slice2-plan.md 5.10-5.12, 6.1): the board store during an edit session.
 *  - Undo's routing (§5.12): Ctrl+Z (`undoInScope`) in the Proposed view, or with the focus in the session's scope (the
 *    review panel, its dialogs), posts `sessionUndo` with the host's top step; in the Current view it posts nothing
 *    (the board stack is locked during a session, the toolbar says why); without a session it is the board's `undo`;
 *  - Claude's arrow still undecided is never selected (a click focuses its item); accepted, it is selectable;
 *  - the Context Menu section's Accept: one group `decideItems`, `own: false`, with what the user saw; refused while
 *    Claude's step runs (D2-62);
 *  - moves on the Proposed view are session steps (`moveProposed`), shown at once and put back if refused.
 */
import { hostMessage, REVIEW_TEXTS, spyroGraph, type ActionOutcome, type RunView, type SessionView, type WebviewToHostMessage } from '@telelean/core';
import { describe, expect, it } from 'vitest';
import { boardView, createBoardStore, undoLock, undoScopeOf } from '../../src/state/store';
import { hiddenStage, IDS, SESSION_RUN, sessionRun, shownStage, stepSession, TARGET } from '../shared/sessions';

const PG = 'new-spyro-pg';
const DARK = 'cynder-dark-past';

function setup() {
  const sent: WebviewToHostMessage[] = [];
  const store = createBoardStore((m) => sent.push(m), { today: () => '2026-11-21', setTimer: () => undefined, persist: () => undefined });
  store.getState().applyGraph(spyroGraph());
  const state = () => store.getState();
  const session = (value: SessionView | null) => state().receive(hostMessage('session', { session: value }));
  const run = (value: RunView | null) => state().receive(hostMessage('run', { run: value }));
  const result = (requestId: string, outcome: ActionOutcome) => state().receive(hostMessage('actionResult', { requestId, outcome }));
  const ofType = <T extends WebviewToHostMessage['type']>(type: T) => sent.filter((m): m is Extract<WebviewToHostMessage, { type: T }> => m.type === type);
  const lastId = () => {
    const m = sent.at(-1);
    return m !== undefined && 'requestId' in m.payload ? (m.payload.requestId as string) : '';
  };
  /** A session's stage and its run, as the host posts them. */
  const open = (view: SessionView = shownStage()) => {
    run(sessionRun(view));
    session(view);
  };
  return { store, sent, state, session, run, result, ofType, lastId, open };
}

describe('Undo and Redo during a session (§5.12, UN-1, D2-38)', () => {
  it('in the Proposed view Ctrl+Z and Ctrl+Shift+Z post the session’s top step; the board’s undo and redo never', () => {
    const t = setup();
    t.open(shownStage({}, { redo: { step: 6, label: 'Accept: Vocabulary term Spyro.InGame' } }));
    expect(undoScopeOf(t.state())).toBe('session');
    t.state().undoInScope();
    expect(t.ofType('sessionUndo').map((m) => m.payload)).toEqual([{ runId: SESSION_RUN, step: 4, requestId: expect.any(String) }]);
    t.result(t.lastId(), { ok: true, label: 'Undo: Show results', undoable: false });
    t.state().redoInScope();
    expect(t.ofType('sessionRedo').map((m) => m.payload)).toEqual([{ runId: SESSION_RUN, step: 6, requestId: expect.any(String) }]);
    expect(t.ofType('undo')).toEqual([]);
    expect(t.ofType('redo')).toEqual([]);
  });

  it('in the Current view during a session nothing is posted, and the board stack’s buttons say why; the panel’s focus makes it the session’s', () => {
    const t = setup();
    t.open();
    t.state().setProposedView(false);
    expect(undoScopeOf(t.state())).toBe('board');
    t.state().undoInScope();
    t.state().redoInScope();
    expect(t.sent.filter((m) => ['undo', 'redo', 'sessionUndo', 'sessionRedo'].includes(m.type))).toEqual([]);
    expect(undoLock(t.state())).toBe(REVIEW_TEXTS.boardUndoLocked);
    // The focus inside data-undo-scope="session" (the review panel): the session's stack, even on the Current view.
    t.state().setFocusInSession(true);
    expect(undoScopeOf(t.state())).toBe('session');
    t.state().undoInScope();
    expect(t.ofType('sessionUndo')).toHaveLength(1);
    t.state().setFocusInSession(false);
    expect(undoScopeOf(t.state())).toBe('board');
  });

  it('without a session it is the board’s Undo; sealed, an info toast says why; while a step runs (D2-62) nothing is posted', () => {
    const t = setup();
    expect(undoScopeOf(t.state())).toBe('board');
    t.state().undoInScope();
    expect(t.ofType('undo')).toHaveLength(1);
    const u = setup();
    u.open(shownStage({}, { undo: null, sealed: { by: 'submit', at: '2026-11-21T10:00:00.000Z' } }));
    u.state().undoInScope();
    expect(u.ofType('sessionUndo')).toEqual([]);
    expect(u.state().toasts.map((x) => x.text)).toEqual([REVIEW_TEXTS.sealed]);
    const w = setup();
    w.open(stepSession());
    w.state().undoInScope();
    w.state().redoInScope();
    expect(w.sent.filter((m) => ['undo', 'redo', 'sessionUndo', 'sessionRedo'].includes(m.type))).toEqual([]);
  });
});

describe('Claude’s arrows on the Proposed view (§5.10, D2-20)', () => {
  it('one still in review is never selected; accepted, it is (a mid-stage Formalize may ask about it)', () => {
    const t = setup();
    t.open();
    t.state().selectArrow(PG, TARGET, false);
    expect(t.state().selectedArrows).toEqual([]);
    t.state().selectArrow(DARK, TARGET, false);
    expect(t.state().selectedArrows).toEqual([{ source: DARK, target: TARGET }]);
    t.session(shownStage({ arrow: 'accepted' }));
    t.state().selectArrow(PG, TARGET, true);
    expect(t.state().selectedArrows).toEqual([
      { source: DARK, target: TARGET },
      { source: PG, target: TARGET },
    ]);
    // Back to review (to be redone): it leaves the selection.
    t.session(shownStage({ arrow: 'to-be-redone' }));
    expect(t.state().selectedArrows).toEqual([{ source: DARK, target: TARGET }]);
  });

  it('a click on it focuses its review item (the panel shows it); a click on its "Claude suggests" card too', () => {
    const t = setup();
    t.open();
    t.state().focusItem(IDS.arrow);
    expect(t.state().sessionReview).toMatchObject({ current: IDS.arrow, pane: 'detail' });
    t.state().focusItem(IDS.premise);
    expect(t.state().sessionReview?.current).toBe(IDS.premise);
    // An id the view does not list changes nothing.
    t.state().focusItem('gone');
    expect(t.state().sessionReview?.current).toBe(IDS.premise);
  });
});

describe('the Context Menu section’s Accept (CM-2, RV-8)', () => {
  it('one group decideItems (own: false) with the revisions the user saw; a hidden Result is never sent; nothing while a step runs', () => {
    const t = setup();
    t.open();
    expect(t.state().acceptGroup([IDS.vocab, IDS.formalize, IDS.vocab])).toBe(true);
    expect(t.ofType('decideItems').map((m) => m.payload)).toEqual([
      {
        runId: SESSION_RUN,
        stage: 1,
        own: false,
        decisions: [
          { item: IDS.vocab, rev: 1, to: 'accepted' },
          { item: IDS.formalize, rev: 1, to: 'accepted' },
        ],
        requestId: expect.any(String),
      },
    ]);
    // One request at a time.
    expect(t.state().acceptGroup([IDS.vocab])).toBe(false);
    t.result(t.lastId(), { ok: true, label: 'Accept 1 item', undoable: false, review: { taken: [IDS.vocab], left: [{ item: IDS.formalize, reason: 'own-accept' }], cascade: [] } });
    // A group decision: the note says what the host left, and why.
    expect(t.state().sessionReview?.lastGroup).toBe(REVIEW_TEXTS.leftNote([REVIEW_TEXTS.leftOwnAccept('Formalize “PG games cannot have characters with dark pasts”')]));
    // Nothing to send (unknown ids): false, nothing posted.
    expect(t.state().acceptGroup(['gone'])).toBe(false);
    expect(t.ofType('decideItems')).toHaveLength(1);
    const w = setup();
    w.open(stepSession());
    expect(w.state().acceptGroup([IDS.vocab])).toBe(false);
    expect(w.ofType('decideItems')).toEqual([]);
    // While the results are hidden, a Result named with others is left out of the message (never decided unseen).
    const h = setup();
    h.open(hiddenStage());
    expect(h.state().acceptGroup([IDS.result, IDS.vocab])).toBe(true);
    expect(h.ofType('decideItems').map((m) => m.payload.decisions)).toEqual([[{ item: IDS.vocab, rev: 1, to: 'accepted' }]]);
    // Only the hidden Result: nothing to send.
    const only = setup();
    only.open(hiddenStage());
    expect(only.state().acceptGroup([IDS.result])).toBe(false);
    expect(only.ofType('decideItems')).toEqual([]);
  });
});

describe('moves on the Proposed view (UN-4, D2-33)', () => {
  it('moveProposed, never moveCards: shown at once; a refused move goes back; nothing while a step runs; only propositions', () => {
    const t = setup();
    t.open();
    const before = boardView(t.state()).positions[TARGET];
    t.state().moveCards({ [TARGET]: { x: 120.4, y: 3e9 } });
    expect(t.ofType('moveCards')).toEqual([]);
    expect(t.ofType('moveProposed').map((m) => m.payload)).toEqual([{ runId: SESSION_RUN, positions: { [TARGET]: { x: 120.4, y: 1_000_000 } }, requestId: expect.any(String) }]);
    expect(boardView(t.state()).positions[TARGET]).toEqual({ x: 120.4, y: 1_000_000 });
    t.result(t.lastId(), { ok: false, code: 'conflict', error: REVIEW_TEXTS.stepRunning });
    expect(boardView(t.state()).positions[TARGET]).toEqual(before);
    // An axiom has no canvas place: nothing is sent.
    t.state().moveCards({ [DARK]: { x: 1, y: 1 } });
    expect(t.ofType('moveProposed')).toHaveLength(1);
    const w = setup();
    w.open(stepSession());
    w.state().moveCards({ [TARGET]: { x: 5, y: 5 } });
    expect(w.ofType('moveProposed')).toEqual([]);
    expect(w.ofType('moveCards')).toEqual([]);
  });
});
