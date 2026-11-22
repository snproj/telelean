/**
 * Slice 2g (docs/slice2-plan.md 5.1, 5.2, 5.5-5.9, 6.1): the board store's session slice. Decisions post exactly one
 * `decideItems` with what the user saw (rev, stage), `own: true` only for the item's own Accept (D2-32); nothing is
 * optimistic; a cascade asks first; the reveal, Submit, the end, Exit, Retry and the raw diff carry their fields; one
 * request at a time; nothing that decides is sent while Claude's step runs (D2-62); the review UI follows the session.
 */
import { hostMessage, parseHostToWebview, REVIEW_TEXTS, spyroGraph, type ActionOutcome, type HostToWebviewMessage, type RunView, type SessionView, type WebviewToHostMessage } from '@telelean/core';
import { describe, expect, it } from 'vitest';
import { countsText, inferenceLines, itemControls, listControls, reportSummary, reportTargets, reviewRows, statusOf } from '../../src/model/review';
import { exitCounts, sessionBadgeText, sessionBarState } from '../../src/model/sessionBar';
import { readPersistedReview, type PersistedSessionReview } from '../../src/state/session';
import { boardView, createBoardStore, proposedOverlay, type PersistedState } from '../../src/state/store';
import {
  allAcceptedStage,
  AT,
  closed,
  confirmingSession,
  firstQueue,
  hiddenPair,
  hiddenStage,
  IDS,
  itemView,
  OPEN,
  SESSION_RUN,
  sessionRun,
  shownStage,
  stepSession,
  TARGET,
} from '../shared/sessions';

function setup(options: { persisted?: PersistedState } = {}) {
  const sent: WebviewToHostMessage[] = [];
  const persisted: PersistedState[] = [];
  const store = createBoardStore((m) => sent.push(m), {
    today: () => '2026-11-21',
    setTimer: () => undefined,
    persist: (patch) => persisted.push(patch),
    ...(options.persisted !== undefined ? { persisted: options.persisted } : {}),
  });
  store.getState().applyGraph(spyroGraph());
  const state = () => store.getState();
  const session = (value: SessionView | null) => state().receive(hostMessage('session', { session: value }));
  const run = (value: RunView | null) => state().receive(hostMessage('run', { run: value }));
  const result = (requestId: string, outcome: ActionOutcome) => state().receive(hostMessage('actionResult', { requestId, outcome }));
  const ofType = <T extends WebviewToHostMessage['type']>(type: T) => sent.filter((m): m is Extract<WebviewToHostMessage, { type: T }> => m.type === type);
  const last = () => sent.at(-1);
  const lastId = () => {
    const m = last();
    return m !== undefined && 'requestId' in m.payload ? (m.payload.requestId as string) : '';
  };
  return { store, sent, persisted, state, session, run, result, ofType, last, lastId };
}

const OK: ActionOutcome = { ok: true, label: 'done', undoable: false };
const refused = (error = 'no'): ActionOutcome => ({ ok: false, code: 'conflict', error });

describe('when a session message arrives (§5.2)', () => {
  it('a new session starts its review UI at the first item in review; the first stage switches the board to Proposed (the host’s board, masked)', () => {
    const { state, session } = setup();
    session(hiddenStage());
    expect(state().sessionReview).toMatchObject({ runId: SESSION_RUN, current: IDS.vocab, filter: 'all', pane: 'list', seenEvent: 0, lastGroup: null });
    expect(state().proposedView).toBe(true);
    const overlay = proposedOverlay(state());
    expect(overlay?.subject).toBe('Spyro');
    expect([...(overlay?.hidden ?? [])]).toEqual([TARGET]);
    expect(boardView(state()).nodes[TARGET]).toBe(hiddenStage().board.graph.nodes.find((n) => n.id === TARGET));
    // The Current | Proposed switch goes back to the user's files.
    state().setProposedView(false);
    expect(boardView(state()).nodes[TARGET]).toBe(state().nodes[TARGET]);
  });

  it('the session’s board stays on screen through a new graph; `session: null` clears it all', () => {
    const { state, session } = setup();
    session(hiddenStage());
    expect(proposedOverlay(state())).not.toBeNull();
    state().applyGraph(spyroGraph(9));
    expect(proposedOverlay(state())?.runId).toBe(SESSION_RUN);
    state().toggleItemSelected(IDS.vocab);
    state().openExitSession();
    session(null);
    expect(state()).toMatchObject({ session: null, sessionReview: null, selectedItems: [], sessionBusy: null, declineMenu: null, dialog: null, overlay: null, proposedView: false });
  });

  it('a later stage keeps `current` while it exists, else the first in review; selections that are gone or hidden are dropped', () => {
    const { state, session } = setup();
    session(shownStage());
    state().focusItem(IDS.definition);
    state().toggleItemSelected(IDS.arrow);
    state().toggleItemSelected(IDS.result);
    session(shownStage({}, { stage: 2 }));
    expect(state().sessionReview?.current).toBe(IDS.definition);
    expect(state().selectedItems).toEqual([IDS.arrow, IDS.result]);
    // The results hidden again: the Result cannot be selected, its parts are gone from the list.
    session(hiddenStage({ stage: 2 }));
    expect(state().selectedItems).toEqual([]);
    // The current item gone: the first item in review.
    session(hiddenStage({ stage: 3, items: hiddenStage().items.filter((i) => i.id !== IDS.definition) }));
    expect(state().sessionReview?.current).toBe(IDS.vocab);
    // No item at all (the first queue): no current.
    session(firstQueue());
    expect(state().sessionReview?.current).toBeNull();
  });

  it('a new run resets the review UI; the persisted UI is used only for the same run id', () => {
    const saved: PersistedSessionReview = { runId: SESSION_RUN, current: IDS.definition, filter: 'in-review' };
    const same = setup({ persisted: { sessionReview: saved } });
    same.session(hiddenStage());
    expect(same.state().sessionReview).toMatchObject({ current: IDS.definition, filter: 'in-review' });
    const other = setup({ persisted: { sessionReview: { ...saved, runId: 'run_other' } } });
    other.session(hiddenStage());
    expect(other.state().sessionReview).toMatchObject({ current: IDS.vocab, filter: 'all' });
    // A different run later: a fresh UI, and the selection goes.
    same.state().toggleItemSelected(IDS.vocab);
    same.session(hiddenStage({ runId: 'run_next' }));
    expect(same.state().sessionReview).toMatchObject({ runId: 'run_next', current: IDS.vocab, filter: 'all', explicit: {} });
    expect(same.state().selectedItems).toEqual([]);
    // What is persisted is the run's: its id, the current item and the filter.
    same.state().setReviewFilter('in-review');
    expect(same.persisted.at(-1)).toEqual({ sessionReview: { runId: 'run_next', current: IDS.vocab, filter: 'in-review' } });
    expect(readPersistedReview({ runId: 'r', current: 3, filter: 'x' })).toEqual({ runId: 'r', current: null, filter: 'all' });
    expect(readPersistedReview({ runId: '' })).toBeUndefined();
    expect(readPersistedReview(null)).toBeUndefined();
  });
});

describe('decisions (§5.5-5.7): one message, what the user saw, not optimistic', () => {
  it('Accept posts exactly one decideItems with rev, stage and own: true; the status stays until the host says so', () => {
    const { state, session, ofType } = setup();
    session(shownStage({}, { stage: 3 }));
    expect(state().acceptItem(IDS.vocab)).toBe(true);
    expect(ofType('decideItems').map((m) => m.payload)).toEqual([
      { runId: SESSION_RUN, stage: 3, own: true, decisions: [{ item: IDS.vocab, rev: 1, to: 'accepted' }], requestId: expect.any(String) },
    ]);
    expect(state().session?.items.find((i) => i.id === IDS.vocab)?.status).toBe('in-review');
    expect(state().sessionBusy).toMatchObject({ action: 'decide', items: [IDS.vocab] });
  });

  it('Accept & next moves on at once, and back on a refusal', () => {
    const { state, session, result, lastId } = setup();
    session(shownStage());
    state().focusItem(IDS.vocab);
    state().acceptItem(IDS.vocab, true);
    expect(state().sessionReview?.current).toBe(IDS.formalize);
    result(lastId(), refused(REVIEW_TEXTS.conflict('Vocabulary term Spyro.InGame')));
    expect(state().sessionReview?.current).toBe(IDS.vocab);
    expect(state().sessionBusy).toBeNull();
    expect(state().toasts.at(-1)?.text).toBe(REVIEW_TEXTS.conflict('Vocabulary term Spyro.InGame'));
    // Accepted: it stays on the next one.
    state().acceptItem(IDS.vocab, true);
    result(lastId(), OK);
    expect(state().sessionReview?.current).toBe(IDS.formalize);
  });

  it('"Select all in review" then Accept, with one item, sends own: false (D2-32)', () => {
    const { state, session, ofType } = setup();
    session(shownStage({ formalize: 'accepted', definition: 'accepted', arrow: 'accepted', premise: 'accepted', result: 'accepted' }));
    state().selectAllInReview();
    expect(state().selectedItems).toEqual([IDS.vocab]);
    state().acceptSelected();
    expect(ofType('decideItems')[0]?.payload).toMatchObject({ own: false, decisions: [{ item: IDS.vocab, rev: 1, to: 'accepted' }] });
  });

  it('an Add premise asks how it is held, then sends holdAs and the one-line rationale', () => {
    const { state, session, ofType } = setup();
    const s = shownStage({}, {});
    session({ ...s, items: s.items.map((i) => (i.id === IDS.premise ? { ...i, accept: OPEN } : i)) });
    expect(state().acceptItem(IDS.premise)).toBe(true);
    expect(state().dialog).toEqual({ kind: 'hold-as', item: IDS.premise, next: false });
    expect(ofType('decideItems')).toHaveLength(0);
    expect(state().confirmHoldAs('pending', '  because\nit is  ')).toBe(true);
    expect(ofType('decideItems')[0]?.payload).toMatchObject({ own: true, decisions: [{ item: IDS.premise, rev: 1, to: 'accepted', holdAs: 'pending', rationale: 'because it is' }] });
    expect(state().dialog).toBeNull();
  });

  it('an Add premise already written (a converted v1 run’s adopted ghost) is accepted only as an axiom (AF12); no blank rationale is sent', () => {
    const { state, session, ofType } = setup();
    const s = shownStage();
    session({
      ...s,
      items: s.items.map((i) => (i.id === IDS.premise && i.detail.kind === 'add-premise' ? { ...i, accept: OPEN, detail: { ...i.detail, writtenInReview: true } } : i)),
    });
    state().acceptItem(IDS.premise);
    expect(state().confirmHoldAs('pending', '')).toBe(false);
    expect(ofType('decideItems')).toHaveLength(0);
    state().acceptItem(IDS.premise);
    expect(state().confirmHoldAs('axiom', '   ')).toBe(true);
    expect(ofType('decideItems')[0]?.payload.decisions).toEqual([{ item: IDS.premise, rev: 1, to: 'accepted', holdAs: 'axiom' }]);
  });

  it('arrow items decline plain (DO-0), whatever the menu was asked; others Reject, or Shaky with its note; Transform sends nothing', () => {
    const { state, session, ofType, result, lastId } = setup();
    session(shownStage());
    state().declineItem(IDS.arrow, 'reject');
    expect(ofType('decideItems')[0]?.payload).toMatchObject({ own: false, decisions: [{ item: IDS.arrow, rev: 1, to: 'declined', option: 'plain' }] });
    result(lastId(), OK);
    state().openDeclineMenu([IDS.formalize], 'item');
    state().chooseDeclineOption('transform');
    expect(ofType('decideItems')).toHaveLength(1);
    state().chooseDeclineOption('shaky');
    expect(state().declineMenu).toMatchObject({ option: 'shaky' });
    state().setDeclineNote('  try the literal reading  ');
    expect(state().confirmDeclineMenu()).toBe(true);
    expect(ofType('decideItems')[1]?.payload.decisions).toEqual([{ item: IDS.formalize, rev: 1, to: 'declined', option: 'shaky', note: 'try the literal reading' }]);
    expect(state().declineMenu).toBeNull();
    result(lastId(), OK);
    // The plain decline is no option for any other item; Reject sends at once from the menu.
    expect(state().declineItem(IDS.formalize, 'plain')).toBe(false);
    state().openDeclineMenu([IDS.definition], 'item');
    state().chooseDeclineOption('reject');
    expect(ofType('decideItems')[2]?.payload.decisions).toEqual([{ item: IDS.definition, rev: 1, to: 'declined', option: 'reject' }]);
  });

  it('needs-confirmation opens the cascade dialog (with the hidden-results sentence when hiddenResults); Continue sends it confirmed; Cancel sends nothing', () => {
    const { state, session, ofType, result, lastId } = setup();
    session(shownStage({ vocab: 'accepted', formalize: 'accepted' }));
    state().declineItem(IDS.vocab, 'reject');
    const cascade = [{ item: IDS.formalize, to: 'to-be-redone' as const, why: REVIEW_TEXTS.cascadeWhy('Vocabulary term Spyro.InGame') }];
    result(lastId(), { ok: false, code: 'needs-confirmation', error: 'confirm', cascade, hiddenResults: true });
    expect(state().dialog).toMatchObject({ kind: 'cascade', lead: REVIEW_TEXTS.cascadeReject, cascade, hiddenResults: true });
    expect(state().sessionBusy).toBeNull();
    state().confirmCascade();
    const sent = ofType('decideItems');
    expect(sent).toHaveLength(2);
    expect(sent[1]?.payload).toMatchObject({ confirmed: true, decisions: sent[0]?.payload.decisions });
    // A confirmed request asked again is an error, not a loop.
    result(lastId(), { ok: false, code: 'needs-confirmation', error: 'still', cascade });
    expect(state().dialog).toBeNull();
    expect(state().toasts.at(-1)?.text).toBe('still');
    // Cancel: nothing is sent.
    state().declineItem(IDS.vocab, 'shaky');
    result(lastId(), { ok: false, code: 'needs-confirmation', error: 'confirm', cascade });
    expect(state().dialog).toMatchObject({ kind: 'cascade', lead: REVIEW_TEXTS.cascadeShaky, hiddenResults: false });
    state().closeDialog();
    expect(ofType('decideItems')).toHaveLength(3);
    // Back to review asks with its own lead-in.
    state().reopenItem(IDS.formalize);
    result(lastId(), { ok: false, code: 'needs-confirmation', error: 'c', cascade: [] });
    expect(state().dialog).toMatchObject({ kind: 'cascade', lead: REVIEW_TEXTS.cascadeBackToReview, cascade: [] });
  });

  it('a group sends one message (own: false) and then shows what was left: the host’s and its own preview’s', () => {
    const { state, session, ofType, result, lastId } = setup();
    session(shownStage());
    state().toggleItemSelected(IDS.vocab);
    state().toggleItemSelected(IDS.formalize);
    state().acceptSelected();
    const sent = ofType('decideItems');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload).toMatchObject({ own: false, decisions: [{ item: IDS.vocab, rev: 1, to: 'accepted' }, { item: IDS.formalize, rev: 1, to: 'accepted' }] });
    result(lastId(), { ...OK, review: { taken: [IDS.vocab], left: [{ item: IDS.formalize, reason: 'own-accept' }], cascade: [] } });
    expect(state().sessionReview?.lastGroup).toBe(REVIEW_TEXTS.leftNote([REVIEW_TEXTS.leftOwnAccept('Formalize “PG games cannot have characters with dark pasts”')]));
    expect(state().selectedItems).toEqual([]);
    // A group Decline: one option, the plain one for the arrow; a declined item is left by the board's own preview.
    session(shownStage({ definition: 'declined' }));
    for (const id of [IDS.arrow, IDS.formalize, IDS.definition]) state().toggleItemSelected(id);
    state().declineSelected('reject');
    expect(ofType('decideItems')[1]?.payload).toMatchObject({
      own: false,
      decisions: [
        { item: IDS.arrow, to: 'declined', option: 'plain' },
        { item: IDS.formalize, to: 'declined', option: 'reject' },
      ],
    });
    result(lastId(), { ...OK, review: { taken: [IDS.arrow, IDS.formalize], left: [], cascade: [] } });
    expect(state().sessionReview?.lastGroup).toBe(REVIEW_TEXTS.leftNote([REVIEW_TEXTS.leftNotInReview('Definition Spyro.IsEvil')]));
    // A group Decline the rules leave whole sends nothing and says why.
    state().toggleItemSelected(IDS.definition);
    expect(state().declineSelected('shaky')).toBe(false);
    expect(ofType('decideItems')).toHaveLength(2);
  });

  it('nothing is sent for an Accept its gate closes, a hidden Result in a group, or a note with Reject (the protocol takes it only with Shaky)', () => {
    const { store, state, session, ofType, result, lastId } = setup();
    session(shownStage());
    // The Formalize's own Accept waits for its vocabulary term (its gate names it).
    expect(state().acceptItem(IDS.formalize)).toBe(false);
    expect(ofType('decideItems')).toHaveLength(0);
    // A group never takes a hidden Result, even one a selection kept by mistake.
    session(hiddenStage());
    store.setState({ selectedItems: [IDS.result, IDS.vocab] });
    state().acceptSelected();
    expect(ofType('decideItems')[0]?.payload.decisions).toEqual([{ item: IDS.vocab, rev: 1, to: 'accepted' }]);
    result(lastId(), OK);
    expect(state().declineItem(IDS.definition, 'reject', 'my note')).toBe(true);
    expect(ofType('decideItems')[1]?.payload.decisions).toEqual([{ item: IDS.definition, rev: 1, to: 'declined', option: 'reject' }]);
  });

  it('the hold-as dialog closes when its item leaves review (or Claude’s step starts)', () => {
    const { state, session } = setup();
    const open = (s: SessionView) => ({ ...s, items: s.items.map((i) => (i.id === IDS.premise ? { ...i, accept: OPEN } : i)) });
    session(open(shownStage()));
    state().acceptItem(IDS.premise);
    expect(state().dialog).toMatchObject({ kind: 'hold-as' });
    session(open(shownStage({ premise: 'accepted' })));
    expect(state().dialog).toBeNull();
    session(open(shownStage()));
    state().acceptItem(IDS.premise);
    session(stepSession());
    expect(state().dialog).toBeNull();
  });

  it('Un-reject sends the rejected version’s rev; Back to review the item’s; neither when its gate is closed', () => {
    const { state, session, ofType, result, lastId } = setup();
    const s = shownStage({ definition: 'declined' });
    session({
      ...s,
      items: s.items.map((i) => (i.id === IDS.definition ? { ...i, rev: 5, declined: { option: 'reject' as const }, review: OPEN } : i)),
      rejected: [
        { item: IDS.definition, label: 'Definition Spyro.IsEvil', rev: 3, at: AT, unreject: OPEN, superseded: false },
        { item: IDS.vocab, label: 'old', rev: 1, at: AT, unreject: OPEN, superseded: true },
      ],
    });
    expect(state().unrejectItem(IDS.vocab)).toBe(false); // a superseded version is view only
    expect(state().unrejectItem(IDS.definition)).toBe(true);
    expect(ofType('decideItems')[0]?.payload.decisions).toEqual([{ item: IDS.definition, rev: 3, to: 'in-review' }]);
    result(lastId(), OK);
    expect(state().reopenItem(IDS.vocab)).toBe(false); // in review already: its gate is closed
  });

  it('Ask me instead opens the decline menu on the items, Shaky, "Ask me about: …" prefilled; the user confirms', () => {
    const { state, session, ofType } = setup();
    session(shownStage());
    state().askMeInstead('s1', 0);
    expect(state().declineMenu).toEqual({ items: [IDS.formalize], origin: 'report', option: 'shaky', note: REVIEW_TEXTS.askMeAbout('“cannot have” read as a rule'), key: 's1:0' });
    expect(ofType('decideItems')).toHaveLength(0);
    state().confirmDeclineMenu();
    expect(ofType('decideItems')[0]?.payload.decisions).toEqual([{ item: IDS.formalize, rev: 1, to: 'declined', option: 'shaky', note: 'Ask me about: “cannot have” read as a rule' }]);
    state().askMeInstead('s1', 7);
    state().askMeInstead('s9', 0);
  });

  it('"Select these arrows": the target’s question and the missing arrow, drawn ones only (slice 2h: never Claude’s undecided one, D2-20)', () => {
    const { state, session } = setup();
    session(shownStage());
    state().selectReportArrows(TARGET, { source: 'new-spyro-pg', target: TARGET });
    // Claude's arrow new-spyro-pg → target is in review: it is not selectable until accepted.
    expect(state().selectedArrows).toEqual([
      { source: 'cynder-dark-past', target: TARGET },
      { source: 'pg-no-dark-past', target: TARGET },
    ]);
    session(shownStage({ arrow: 'accepted' }));
    state().selectReportArrows(TARGET, { source: 'new-spyro-pg', target: TARGET });
    expect(state().selectedArrows).toEqual([
      { source: 'cynder-dark-past', target: TARGET },
      { source: 'pg-no-dark-past', target: TARGET },
      { source: 'new-spyro-pg', target: TARGET },
    ]);
    state().selectReportArrows(TARGET, { source: 'cynder-not-good', target: 'pg-no-dark-past' });
    expect(state().selectedArrows).toHaveLength(2);
  });
});

describe('messages (§2.4): their fields, the reveal, one request at a time', () => {
  it('revealResult sends `via` after the reveal dialog (Show results, Show Claude’s activity); nothing before it', () => {
    const { state, session, ofType, result, lastId } = setup();
    session(hiddenStage({ stage: 2 }));
    state().openReveal('show-result');
    expect(state().dialog).toEqual({ kind: 'reveal', via: 'show-result' });
    expect(ofType('revealResult')).toHaveLength(0);
    state().confirmReveal();
    expect(ofType('revealResult')[0]?.payload).toEqual({ runId: SESSION_RUN, stage: 2, via: 'show-result', requestId: expect.any(String) });
    result(lastId(), OK);
    state().openReveal('activity');
    state().confirmReveal();
    expect(ofType('revealResult')[1]?.payload).toMatchObject({ via: 'activity' });
    result(lastId(), OK);
    // Shown already: nothing to reveal.
    session(shownStage());
    state().openReveal('show-result');
    expect(state().dialog).toBeNull();
  });

  it('Raw Lean diff…: while hidden, the dialog first, then `confirmed`; shown, at once without it; the host’s `reveal` answer asks', () => {
    const { state, session, ofType, result, lastId } = setup();
    session(hiddenStage());
    state().openSessionDiff();
    expect(state().dialog).toEqual({ kind: 'reveal', via: 'raw-diff' });
    expect(ofType('openSessionDiff')).toHaveLength(0);
    state().confirmReveal();
    expect(ofType('openSessionDiff')[0]?.payload).toEqual({ runId: SESSION_RUN, stage: 1, confirmed: true, requestId: expect.any(String) });
    result(lastId(), OK);
    session(shownStage());
    state().openSessionDiff('Model/Spyro/Main.lean');
    expect(ofType('openSessionDiff')[1]?.payload).toEqual({ runId: SESSION_RUN, stage: 1, file: 'Model/Spyro/Main.lean', requestId: expect.any(String) });
    // The results hidden again meanwhile: the host answers that it would show them.
    result(lastId(), { ok: false, code: 'needs-confirmation', error: 'reveal', reveal: true });
    expect(state().dialog).toEqual({ kind: 'reveal', via: 'raw-diff', file: 'Model/Spyro/Main.lean' });
  });

  it('Submit, Apply (stage and check id), Back to review, Retry step and Exit carry the right fields', () => {
    const { state, session, ofType, result, lastId } = setup();
    session(allAcceptedStage());
    expect(state().submitReview()).toBe(true);
    expect(ofType('submitReview')[0]?.payload).toEqual({ runId: SESSION_RUN, stage: 1, requestId: expect.any(String) });
    result(lastId(), OK);
    session(confirmingSession());
    expect(state().applyEnd()).toBe(true);
    expect(ofType('endSession')[0]?.payload).toEqual({ runId: SESSION_RUN, decision: 'apply', stage: 1, check: 'chk-1', requestId: expect.any(String) });
    result(lastId(), OK);
    expect(state().backToReview()).toBe(true);
    expect(ofType('endSession')[1]?.payload).toEqual({ runId: SESSION_RUN, decision: 'back', stage: 1, requestId: expect.any(String) });
    result(lastId(), OK);
    session(shownStage({}, { heading: { kind: 'cancelled', text: REVIEW_TEXTS.stepCancelled, firstStep: false, retry: OPEN } }));
    expect(state().retryStep()).toBe(true);
    expect(ofType('retryStep')[0]?.payload).toEqual({ runId: SESSION_RUN, requestId: expect.any(String) });
    result(lastId(), OK);
    state().openExitSession();
    expect(state().dialog).toEqual({ kind: 'exit-session', ...exitCounts(state().session!) });
    // A decision that lands meanwhile: the dialog counts what Exit would discard now.
    session(allAcceptedStage());
    expect(state().dialog).toEqual({ kind: 'exit-session', accepted: 6, inReview: 0, stepRunning: false });
    expect(state().confirmExitSession()).toBe(true);
    expect(ofType('endSession')[2]?.payload).toEqual({ runId: SESSION_RUN, decision: 'exit', requestId: expect.any(String) });
  });

  it('Exit’s dialog closes once Apply runs (Exit is refused then)', () => {
    const { state, session } = setup();
    session(confirmingSession());
    state().openExitSession();
    session(confirmingSession({}, { phase: 'applying' }));
    expect(state().dialog).toBeNull();
    state().openExitSession();
    expect(state().dialog).toBeNull();
    expect(state().confirmExitSession()).toBe(false);
  });

  it('Apply waits for a passed check with no drift; Submit and Retry for their gates', () => {
    const { state, session, ofType } = setup();
    for (const s of [confirmingSession({ state: 'running' }), confirmingSession({ state: 'failed' }), confirmingSession({}, { drift: { files: ['Model.lean'], at: AT } }), confirmingSession({}, { judging: true })]) {
      session(s);
      expect(state().applyEnd()).toBe(false);
    }
    // Defence in depth: a gate the host left open while the check runs or failed still sends nothing.
    for (const check of ['running', 'failed'] as const) {
      session(confirmingSession({ state: check }, { confirmation: { ...confirmingSession({ state: check }).confirmation!, apply: OPEN } }));
      expect(state().applyEnd()).toBe(false);
    }
    session(hiddenStage());
    expect(state().submitReview()).toBe(false);
    expect(state().retryStep()).toBe(false);
    session(shownStage({}, { heading: { kind: 'failed', text: REVIEW_TEXTS.stepFailed('x'), firstStep: false, retry: closed(REVIEW_TEXTS.nothingToRetry) } }));
    expect(state().retryStep()).toBe(false);
    expect(ofType('endSession').length + ofType('submitReview').length + ofType('retryStep').length).toBe(0);
  });

  it('busy blocks a second request (every kind) until the host answers; Exit still goes, once', () => {
    const { state, session, sent, result, lastId, ofType } = setup();
    session(shownStage());
    state().acceptItem(IDS.vocab);
    const count = sent.length;
    state().acceptItem(IDS.vocab);
    state().declineItem(IDS.arrow, 'plain');
    state().acceptSelected();
    state().openReveal('raw-diff');
    state().openSessionDiff();
    state().submitReview();
    state().sessionUndo();
    state().openDeclineMenu([IDS.formalize], 'item');
    expect(sent.length).toBe(count);
    expect(state().declineMenu).toBeNull();
    const decision = lastId();
    // Exit is not blocked by a decision on its way (AF14), but a second Exit waits for the first one's answer.
    expect(state().confirmExitSession()).toBe(true);
    const exit = lastId();
    expect(state().confirmExitSession()).toBe(false);
    expect(ofType('endSession')).toHaveLength(1);
    result(decision, OK);
    result(exit, OK);
    expect(state().confirmExitSession()).toBe(true);
    expect(ofType('endSession')).toHaveLength(2);
  });

  it('session Undo and Redo send the step the user saw; a cascade asks with Undo’s lead-in; a sealed stack says why', () => {
    const { state, session, ofType, result, lastId } = setup();
    session(shownStage({}, { undo: { step: 7, label: 'Accept: x' }, redo: { step: 9, label: 'Accept: y' } }));
    state().sessionUndo();
    expect(ofType('sessionUndo')[0]?.payload).toEqual({ runId: SESSION_RUN, step: 7, requestId: expect.any(String) });
    result(lastId(), { ok: false, code: 'needs-confirmation', error: 'c', cascade: [] });
    expect(state().dialog).toMatchObject({ kind: 'cascade', lead: REVIEW_TEXTS.cascadeUndoAccept });
    state().confirmCascade();
    expect(ofType('sessionUndo')[1]?.payload).toEqual({ runId: SESSION_RUN, step: 7, confirmed: true, requestId: expect.any(String) });
    result(lastId(), OK);
    state().sessionRedo();
    expect(ofType('sessionRedo')[0]?.payload).toEqual({ runId: SESSION_RUN, step: 9, requestId: expect.any(String) });
    result(lastId(), OK);
    session(shownStage({}, { undo: null, sealed: { by: 'submit', at: AT } }));
    state().sessionUndo();
    expect(ofType('sessionUndo')).toHaveLength(2);
    expect(state().toasts.at(-1)?.text).toBe(REVIEW_TEXTS.sealed);
  });

  it('an answer to no session request goes to the board’s own handling (an error toast)', () => {
    const { state, session, result } = setup();
    session(shownStage());
    result('r999', refused('not ours'));
    expect(state().toasts.at(-1)?.text).toBe('not ours');
  });
});

describe('read-only while Claude’s step runs (D2-62)', () => {
  it('no action that decides sends anything, in phases step and interrupted; Exit, browsing and selecting still work', () => {
    for (const phase of ['step', 'interrupted'] as const) {
      const { state, session, sent, ofType } = setup();
      // The report keeps an "Assumed without asking" entry here, so only D2-62's guard stops Ask me instead.
      session(stepSession({ phase, report: shownStage().report }));
      const before = sent.length;
      expect(state().acceptItem(IDS.vocab)).toBe(false);
      expect(state().declineItem(IDS.arrow, 'plain')).toBe(false);
      expect(state().reopenItem(IDS.vocab)).toBe(false);
      state().toggleItemSelected(IDS.vocab);
      expect(state().acceptSelected()).toBe(false);
      expect(state().declineSelected('reject')).toBe(false);
      state().openDeclineMenu([IDS.formalize], 'item');
      expect(state().declineMenu).toBeNull();
      state().askMeInstead('s1', 0);
      expect(state().declineMenu).toBeNull();
      state().openReveal('show-result');
      state().openSessionDiff();
      expect(state().dialog).toBeNull();
      expect(state().submitReview()).toBe(false);
      expect(state().retryStep()).toBe(false);
      state().sessionUndo();
      state().sessionRedo();
      expect(sent.length).toBe(before);
      // Browsing: moving through the list and selecting still work.
      state().moveCurrent(1);
      expect(state().sessionReview?.current).not.toBe(IDS.vocab);
      expect(state().selectedItems).toEqual([IDS.vocab]);
      state().openExitSession();
      expect(state().dialog).toMatchObject({ kind: 'exit-session', stepRunning: true });
      expect(state().confirmExitSession()).toBe(true);
      expect(ofType('endSession')).toHaveLength(1);
    }
  });

  it('the keys that decide do nothing; the keys that browse still move', () => {
    const { state, session, sent } = setup();
    session(stepSession());
    state().focusItem(IDS.vocab);
    const before = sent.length;
    for (const key of [{ key: 'a' }, { key: 'A', shiftKey: true }, { key: 'd' }, { key: 'z', ctrlKey: true }, { key: 'Z', ctrlKey: true, shiftKey: true }]) state().pressReviewKey(key);
    expect(sent.length).toBe(before);
    expect(state().declineMenu).toBeNull();
    expect(state().pressReviewKey({ key: 'ArrowDown' })).toBe(true);
    expect(state().sessionReview?.current).toBe(IDS.formalize);
  });

  it('in a stage the same keys decide: A own Accept, Shift+A Accept & next, D on an arrow at once, D then R on another item, Esc', () => {
    const { state, session, ofType, result, lastId } = setup();
    session(shownStage());
    state().focusItem(IDS.vocab);
    state().pressReviewKey({ key: 'a' });
    expect(ofType('decideItems')[0]?.payload).toMatchObject({ own: true, decisions: [{ item: IDS.vocab, to: 'accepted' }] });
    result(lastId(), OK);
    state().focusItem(IDS.arrow);
    state().pressReviewKey({ key: 'd' });
    expect(ofType('decideItems')[1]?.payload.decisions).toEqual([{ item: IDS.arrow, rev: 1, to: 'declined', option: 'plain' }]);
    result(lastId(), OK);
    state().focusItem(IDS.definition);
    state().pressReviewKey({ key: 'd' });
    expect(state().declineMenu).toMatchObject({ items: [IDS.definition], origin: 'item' });
    expect(state().pressReviewKey({ key: 'Escape' })).toBe(true);
    expect(state().declineMenu).toBeNull();
    state().pressReviewKey({ key: 'd' });
    state().pressReviewKey({ key: 'r' });
    expect(ofType('decideItems')[2]?.payload.decisions).toEqual([{ item: IDS.definition, rev: 1, to: 'declined', option: 'reject' }]);
    result(lastId(), OK);
    state().focusItem(IDS.vocab);
    state().pressReviewKey({ key: ' ' });
    expect(state().selectedItems).toEqual([IDS.vocab]);
    state().pressReviewKey({ key: 'Escape' });
    expect(state().selectedItems).toEqual([]);
    expect(state().pressReviewKey({ key: 'Escape' })).toBe(false);
    state().pressReviewKey({ key: 'Enter' });
    expect(state().sessionReview?.pane).toBe('detail');
  });
});

describe('the fixture pair (§6.1): equal rows, counts and panel text, whatever the hidden outcome', () => {
  it('two stores fed the two outcomes read the same review state, rows, counts, report, inferences, controls and bar', () => {
    const { proved, notProved } = hiddenPair();
    const read = (twin: { session: SessionView; run: RunView }) => {
      const { state, session, run } = setup();
      run(twin.run);
      session(twin.session);
      state().focusItem(IDS.result);
      const s = state();
      const v = s.session as SessionView;
      const nodes = Object.fromEntries(v.board.graph.nodes.map((n) => [n.id, n]));
      return JSON.stringify({
        review: s.sessionReview,
        proposed: [s.proposedView, [...(proposedOverlay(s)?.hidden ?? [])]],
        rows: reviewRows(v.items, v.inferences, nodes, 'all'),
        filtered: reviewRows(v.items, v.inferences, nodes, 'in-review'),
        counts: countsText(v.counts),
        statuses: v.items.map(statusOf),
        details: v.items.map((i) => [i.detail, itemControls(i, v, false)]),
        report: [reportSummary(v), reportTargets(v)],
        inferences: inferenceLines(v),
        list: listControls(v, s.selectedItems, false),
        bar: sessionBarState(v, s.run, s.runPanelOpen),
        badge: sessionBadgeText(v, s.run),
        exit: exitCounts(v),
      });
    };
    expect(read(proved)).toBe(read(notProved));
  });
});

describe('slice 2h: M2’s review is retired (§2.4): no `proposal` message, no legacy review or overlay', () => {
  it('the host’s retired `proposal` message is refused by the validator, and the store ignores it should one get through', () => {
    const { state, run, session } = setup();
    run(sessionRun(hiddenStage()));
    session(hiddenStage());
    const retired = { v: 1, type: 'proposal', payload: { proposal: null } };
    expect(parseHostToWebview(retired).ok).toBe(false);
    const before = { overlay: state().overlay, session: state().session, proposedView: state().proposedView };
    state().receive(retired as unknown as HostToWebviewMessage);
    expect({ overlay: state().overlay, session: state().session, proposedView: state().proposedView }).toEqual(before);
    expect(proposedOverlay(state())?.runId).toBe(SESSION_RUN);
    // No legacy review state is kept any more.
    expect(state()).not.toHaveProperty('review');
  });

  it('an item that is not listed, and a session with no current, ignore the actions', () => {
    const { state, session, sent } = setup();
    session(firstQueue({ phase: 'stage', steps: [] }));
    state().focusItem('nope');
    state().toggleItemSelected('nope');
    expect(state().acceptItem('nope')).toBe(false);
    // No current item: A is not the list's key.
    expect(state().pressReviewKey({ key: 'a' })).toBe(false);
    expect(sent.filter((m) => m.type === 'decideItems')).toHaveLength(0);
    // An item made by hand: the slice reads only what the view lists.
    const extra = itemView({ id: 'x', kind: 'formalize', detail: shownStage().items[1]!.detail });
    session(shownStage({}, { items: [...shownStage().items, extra] }));
    state().focusItem('x');
    expect(state().sessionReview?.current).toBe('x');
  });
});

describe('builder 2g r1: stale dialogs and menus, the selection helpers, one request at a time', () => {
  it('the reveal dialog closes when the results become shown or the stage ends; a raw-diff one stays while the results are shown', () => {
    const a = setup();
    a.session(hiddenStage());
    a.state().openReveal('show-result');
    expect(a.state().dialog).toEqual({ kind: 'reveal', via: 'show-result' });
    a.session(hiddenStage({ stage: 2 })); // the same question stays open on a later hidden stage
    expect(a.state().dialog).toEqual({ kind: 'reveal', via: 'show-result' });
    a.session(shownStage({}, { stage: 2 }));
    expect(a.state().dialog).toBeNull();

    const b = setup();
    b.session(hiddenStage());
    b.state().openReveal('activity');
    b.session(stepSession());
    expect(b.state().dialog).toBeNull();

    const c = setup();
    c.session(hiddenStage());
    c.state().openSessionDiff();
    expect(c.state().dialog).toEqual({ kind: 'reveal', via: 'raw-diff' });
    c.session(shownStage());
    expect(c.state().dialog).toEqual({ kind: 'reveal', via: 'raw-diff' });
    c.session(confirmingSession());
    expect(c.state().dialog).toBeNull();
  });

  it('the cascade dialog closes when a Claude step starts, and stays while the stage goes on', () => {
    const { state, session, result, lastId } = setup();
    session(shownStage({ vocab: 'accepted', formalize: 'accepted' }));
    state().declineItem(IDS.vocab, 'reject');
    result(lastId(), { ok: false, code: 'needs-confirmation', error: 'confirm', cascade: [] });
    expect(state().dialog).toMatchObject({ kind: 'cascade' });
    session(shownStage({ vocab: 'accepted', formalize: 'accepted' }, { stage: 2 }));
    expect(state().dialog).toMatchObject({ kind: 'cascade' });
    session(stepSession());
    expect(state().dialog).toBeNull();
  });

  it('the decline menu is dropped when an item of it is gone or a step starts, and kept otherwise', () => {
    const { state, session } = setup();
    session(shownStage());
    state().openDeclineMenu([IDS.definition, IDS.arrow], 'group');
    session(shownStage({}, { stage: 2 }));
    expect(state().declineMenu).toMatchObject({ items: [IDS.definition, IDS.arrow] });
    const s = shownStage({}, { stage: 3 });
    session({ ...s, items: s.items.filter((i) => i.id !== IDS.arrow) });
    expect(state().declineMenu).toBeNull();
    session(shownStage());
    state().openDeclineMenu([IDS.definition], 'item');
    session(stepSession());
    expect(state().declineMenu).toBeNull();
  });

  it('"Select them" selects the listed items once each, never a hidden Result or an id the list does not have', () => {
    const { state, session } = setup();
    session(hiddenStage());
    state().selectItems([IDS.vocab, IDS.result, 'it_unknown', IDS.vocab, IDS.formalize]);
    expect(state().selectedItems).toEqual([IDS.vocab, IDS.formalize]);
    state().selectItems([]);
    expect(state().selectedItems).toEqual([]);
    session(shownStage());
    state().selectItems([IDS.result, IDS.result]);
    expect(state().selectedItems).toEqual([IDS.result]);
  });

  it('the events box shows what is newer than the last dismissal; Dismiss marks the newest as seen, and an empty list stays empty', () => {
    const { state, session } = setup();
    const event = (id: number) => ({ id, at: AT, text: `event ${id}`, items: [IDS.vocab] });
    session(hiddenStage({ events: [event(2), event(5)] }));
    expect(state().sessionReview?.seenEvent).toBe(0);
    state().dismissEvents();
    expect(state().sessionReview?.seenEvent).toBe(5);
    session(hiddenStage({ stage: 2, events: [event(2), event(5), event(7)] }));
    expect(state().sessionReview?.seenEvent).toBe(5); // a later event is not seen yet
    state().dismissEvents();
    expect(state().sessionReview?.seenEvent).toBe(7);
    session(hiddenStage({ stage: 3, events: [] }));
    state().dismissEvents();
    expect(state().sessionReview?.seenEvent).toBe(0);
  });

  it('"fully explicit" toggles per item, and an item that left the view is dropped from them', () => {
    const { state, session } = setup();
    session(shownStage());
    state().toggleItemExplicit(IDS.definition);
    state().toggleItemExplicit(IDS.formalize);
    expect(state().sessionReview?.explicit).toEqual({ [IDS.definition]: true, [IDS.formalize]: true });
    state().toggleItemExplicit(IDS.formalize);
    expect(state().sessionReview?.explicit).toEqual({ [IDS.definition]: true });
    const s = shownStage({}, { stage: 2 });
    session({ ...s, items: s.items.filter((i) => i.id !== IDS.definition) });
    expect(state().sessionReview?.explicit).toEqual({});
  });

  it('the note of what a group left is cleared by the next stage, and kept by an update of the same stage', () => {
    const { state, session, result, lastId } = setup();
    session(shownStage());
    state().toggleItemSelected(IDS.vocab);
    state().acceptSelected();
    result(lastId(), { ...OK, review: { taken: [], left: [{ item: IDS.formalize, reason: 'own-accept' }], cascade: [] } });
    expect(state().sessionReview?.lastGroup).not.toBeNull();
    session(shownStage({ vocab: 'accepted' })); // the host's answer to the decision: the same stage
    expect(state().sessionReview?.lastGroup).not.toBeNull();
    session(shownStage({ vocab: 'accepted' }, { stage: 2 }));
    expect(state().sessionReview?.lastGroup).toBeNull();
  });

  it('"Ask me instead" is not a group action: it keeps the user’s selection and shows no group note when it succeeds', () => {
    const { state, session, result, lastId } = setup();
    session(shownStage());
    state().toggleItemSelected(IDS.vocab);
    state().askMeInstead('s1', 0);
    expect(state().confirmDeclineMenu()).toBe(true);
    result(lastId(), { ...OK, review: { taken: [IDS.formalize], left: [], cascade: [] } });
    expect(state().selectedItems).toEqual([IDS.vocab]);
    // The list's own group Decline still clears it.
    state().declineSelected('reject');
    result(lastId(), { ...OK, review: { taken: [IDS.vocab], left: [], cascade: [] } });
    expect(state().selectedItems).toEqual([]);
  });

  it('Exit never takes the busy mark from a decision on its way, and an Exit still on its way keeps the rows busy after the decision is answered', () => {
    const a = setup();
    a.session(shownStage());
    expect(a.state().acceptItem(IDS.vocab)).toBe(true);
    const decisionId = a.lastId();
    expect(a.state().sessionBusy).toMatchObject({ action: 'decide', requestId: decisionId, items: [IDS.vocab] });
    expect(a.state().confirmExitSession()).toBe(true);
    const exitId = a.lastId();
    expect(a.state().sessionBusy).toMatchObject({ action: 'decide', requestId: decisionId });
    // Exit is refused first: the decision is still on its way, its rows still spin, and nothing else is sent.
    a.result(exitId, refused('not now'));
    expect(a.state().sessionBusy).toMatchObject({ action: 'decide', requestId: decisionId });
    const before = a.sent.length;
    expect(a.state().acceptItem(IDS.definition)).toBe(false);
    expect(a.sent.length).toBe(before);
    a.result(decisionId, OK);
    expect(a.state().sessionBusy).toBeNull();

    const b = setup();
    b.session(shownStage());
    b.state().acceptItem(IDS.vocab);
    const decision = b.lastId();
    b.state().confirmExitSession();
    const exit = b.lastId();
    // The decision is answered first: the Exit still on its way keeps everything else closed until it answers.
    b.result(decision, OK);
    expect(b.state().sessionBusy).toMatchObject({ action: 'end', requestId: exit });
    const sent = b.sent.length;
    expect(b.state().acceptItem(IDS.definition)).toBe(false);
    expect(b.sent.length).toBe(sent);
    b.result(exit, refused('no'));
    expect(b.state().sessionBusy).toBeNull();
    expect(b.state().acceptItem(IDS.definition)).toBe(true);
  });
});
