/**
 * M2 store behaviour (docs/m2-plan.md section 6): the run and the proposal kept apart from the board's graph, the
 * review state, the run requests, and carry-over 3.
 */
import { hostMessage, spyroGraph, spyroProvedGraph, type ActionOutcome, type ProposalView, type RunView, type TlGraph, type WebviewToHostMessage } from '@telelean/core';
import { describe, expect, it } from 'vitest';
import { boardView, clampSplit, createBoardStore, formalizeOf, proposedOverlay, readSplit, vocabularyCollapsed } from '../../src/state/store';
import { conditionalGraph, mapNode } from '../shared/graphs';
import {
  ADOPTED_ID,
  adoptedProposal,
  definitionProposal,
  emptyProposal,
  literalGhost,
  literalProposal,
  MODALITY_QUESTION,
  GENERIC_QUESTION,
  normativeProposal,
  reviewRun,
  RUN_ID,
  runView,
  TARGET,
  waitingRun,
} from '../shared/runs';

function setup(graph: TlGraph = spyroGraph()) {
  const sent: WebviewToHostMessage[] = [];
  const store = createBoardStore((m) => sent.push(m), { today: () => '2026-11-01', setTimer: () => undefined, persist: () => undefined });
  store.getState().applyGraph(graph);
  const state = () => store.getState();
  const run = (value: RunView | null) => state().receive(hostMessage('run', { run: value }));
  const proposal = (value: ProposalView | null) => state().receive(hostMessage('proposal', { proposal: value }));
  const result = (requestId: string, outcome: ActionOutcome) => state().receive(hostMessage('actionResult', { requestId, outcome }));
  const last = () => sent.at(-1);
  const ofType = <T extends WebviewToHostMessage['type']>(type: T) => sent.filter((m): m is Extract<WebviewToHostMessage, { type: T }> => m.type === type);
  return { store, sent, state, run, proposal, result, last, ofType };
}

const OK: ActionOutcome = { ok: true, label: 'done', undoable: false };

describe('run and proposal are kept apart from the graph', () => {
  it('neither message touches the board’s graph data, and a new graph keeps them', () => {
    const { state, run, proposal } = setup();
    const before = { version: state().version, seq: state().seq, nodes: state().nodes, order: state().order, edges: state().edges, vocabulary: state().vocabulary };
    const p = adoptedProposal();
    run(reviewRun(p));
    proposal(p);
    expect({ version: state().version, seq: state().seq, nodes: state().nodes, order: state().order, edges: state().edges, vocabulary: state().vocabulary }).toEqual(before);
    expect(state().nodes[ADOPTED_ID]).toBeUndefined(); // the proposal's card is not on the board
    expect(state().run?.runId).toBe(RUN_ID);
    // A new graph (a Lean refresh) keeps the run and the proposal; the overlay is rebuilt from them.
    const overlay = state().overlay;
    state().applyGraph(spyroGraph(5));
    expect(state().run?.runId).toBe(RUN_ID);
    expect(state().proposal?.proposalId).toBe('p2');
    expect(state().overlay).not.toBe(overlay);
    expect(state().overlay?.nodes[ADOPTED_ID]).toBeDefined();
  });

  it('a new proposal starts its review and switches the board to it; boardView reads the overlay; Current goes back', () => {
    const { state, run, proposal } = setup();
    const p = definitionProposal();
    run(reviewRun(p));
    proposal(p);
    expect(state().review).toMatchObject({ runId: RUN_ID, proposalId: 'p3', step: 0, revealed: false, definitions: {}, feedback: '' });
    expect(state().review).not.toHaveProperty('lifecycle');
    expect(state().proposedView).toBe(true);
    expect(boardView(state()).nodes[ADOPTED_ID]).toBeDefined();
    expect(proposedOverlay(state())?.hidden.has(TARGET)).toBe(true);
    // The proposal adds vocabulary: the group opens in the proposed view, the user's own choice stays.
    expect(state().vocabCollapsed).toBe(true);
    expect(vocabularyCollapsed(state())).toBe(false);
    state().toggleVocabulary();
    expect(vocabularyCollapsed(state())).toBe(true);
    expect(state().vocabCollapsed).toBe(true);
    state().setProposedView(false);
    expect(boardView(state()).nodes[ADOPTED_ID]).toBeUndefined();
    expect(vocabularyCollapsed(state())).toBe(true);
    // The same proposal again (an update of it) keeps the review where it was; a withdrawn one clears it all.
    state().setProposedView(true);
    state().reviewGo(2);
    proposal({ ...p });
    expect(state().review?.step).toBe(2);
    proposal(null);
    expect([state().proposal, state().overlay, state().review, state().proposedView]).toEqual([null, null, null, false]);
    // Another run's "p3" (proposal ids are unique within a run only) starts a fresh review.
    proposal(p);
    state().reviewGo(2);
    proposal({ ...p, runId: 'run_2' });
    expect(state().review).toMatchObject({ runId: 'run_2', proposalId: 'p3', step: 0 });
  });

  it('a run that leaves review takes the board back to the current files, even before the proposal is withdrawn', () => {
    const { state, run, proposal } = setup();
    const p = literalProposal();
    run(reviewRun(p));
    proposal(p);
    expect(state().proposedView).toBe(true);
    run(reviewRun(p, { state: 'working', stage: 'prove', round: 2, proposalId: undefined }));
    expect(state().proposedView).toBe(false);
    expect(state().proposal?.proposalId).toBe('p1'); // still there until the host clears it
  });

  it('the proposed view is only for the board’s own subject', () => {
    const { state, run, proposal } = setup();
    const p = normativeProposal({ subject: 'Bayonetta' });
    run(reviewRun(p, { subject: 'Bayonetta' }));
    proposal(p);
    expect(state().proposedView).toBe(false);
    state().setProposedView(true);
    expect(proposedOverlay(state())).toBeNull();
    expect(boardView(state()).nodes).toBe(state().nodes);
  });
});

describe('starting a run: Formalize for dependencies (slice 1e; the tray of M2 is gone)', () => {
  /** The arrows into the target from two of its drawn premises. */
  const selectQuestion = (state: () => ReturnType<ReturnType<typeof createBoardStore>['getState']>) => {
    state().selectArrow('cynder-dark-past', TARGET, false);
    state().selectArrow('new-spyro-pg', TARGET, true);
  };

  it('blocked while a run of the root is active (any subject), and while a start is on its way; one request at a time', () => {
    const { state, run, result, ofType } = setup();
    selectQuestion(state);
    run(runView({ subject: 'Bayonetta' }));
    expect(state().formalize()).toBe(false);
    expect(formalizeOf(state()).disabled).toBe("A run is active. Claude is already working on Bayonetta: wait for it to finish, or cancel it.");
    run(runView({ state: 'cancelled' }));
    expect(state().formalize()).toBe(true);
    expect(state().runBusy).toMatchObject({ action: 'start', requestId: 'r1' });
    expect(formalizeOf(state()).disabled).toBe('A run is active. It is starting.');
    expect(state().formalize()).toBe(false); // in flight
    result('r1', { ok: false, code: 'not-yet', error: 'The project is not on leanprover/lean4:v4.35.0.' });
    expect(state().runBusy).toBeNull();
    expect(state().toasts.map((t) => t.text)).toEqual([
      'A run is active. Claude is already working on Bayonetta: wait for it to finish, or cancel it.',
      'A run is active. It is starting.',
      'The project is not on leanprover/lean4:v4.35.0.',
    ]);
    expect(ofType('startRun')).toHaveLength(1);
    expect(ofType('startRun')[0]?.payload).toEqual({ target: TARGET, premises: ['cynder-dark-past', 'new-spyro-pg'], requestId: 'r1' });
  });

  it('a declined consent is information, not an error, and the next start clears it; other refusals stay errors', () => {
    const { state, result } = setup();
    selectQuestion(state);
    expect(state().formalize()).toBe(true);
    const declined = 'Not started: telelean sends nothing to Claude until you allow it ("Run with Claude").';
    result('r1', { ok: false, code: 'not-yet', error: declined });
    expect(state().toasts.map((t) => [t.level, t.text])).toEqual([['info', declined]]);
    expect(state().formalize()).toBe(true);
    expect(state().toasts).toEqual([]);
    result('r2', { ok: false, code: 'not-yet', error: 'Claude could not be started: no claude binary' });
    expect(state().toasts.map((t) => [t.level, t.text])).toEqual([['error', 'Claude could not be started: no claude binary']]);
  });

  it('the run panel’s size per layout: clamped, persisted, null for the default; a stored value is read defensively', () => {
    const saved: unknown[] = [];
    const store = createBoardStore(() => undefined, { persist: (patch) => saved.push(patch), persisted: { runSplit: { narrow: 0.4, wide: null } } });
    expect(store.getState().runSplit).toEqual({ narrow: 0.4, wide: null });
    store.getState().setRunSplit('wide', 0.99);
    expect(store.getState().runSplit).toEqual({ narrow: 0.4, wide: 0.85 });
    store.getState().setRunSplit('narrow', null);
    expect(store.getState().runSplit).toEqual({ narrow: null, wide: 0.85 });
    store.getState().setRunSplit('narrow', null); // no change: nothing persisted
    expect(saved).toEqual([{ runSplit: { narrow: 0.4, wide: 0.85 } }, { runSplit: { narrow: null, wide: 0.85 } }]);
    expect(readSplit({ narrow: 0.123456, wide: 'big' })).toEqual({ narrow: 0.15, wide: null });
    expect(readSplit(null)).toEqual({ narrow: null, wide: null });
    expect(clampSplit(0.5004)).toBe(0.5);
  });

});

describe('answering questions', () => {
  it('drafts per question; Send posts every answer once; a new set starts with fresh drafts; the panel opens', () => {
    const { state, run, result, last } = setup();
    state().setRunPanelOpen(false);
    run(waitingRun([MODALITY_QUESTION, GENERIC_QUESTION]));
    expect(state().runPanelOpen).toBe(true);
    expect(state().submitAnswers()).toBe(false);
    state().setAnswerDraft('q1', 0, { kind: 'option', option: 1 });
    expect(state().submitAnswers()).toBe(false);
    state().setAnswerDraft('q1', 1, { kind: 'decide-for-me', scope: 'subject' });
    state().setAnswerDraft('other', 0, { kind: 'leave-open' }); // not the pending set: ignored
    expect(state().answerDrafts.other).toBeUndefined();
    expect(state().submitAnswers()).toBe(true);
    expect(last()).toEqual({
      v: 1,
      type: 'answerQuestions',
      payload: {
        runId: RUN_ID,
        setId: 'q1',
        answers: [
          { question: 0, choice: { kind: 'option', option: 1 }, scope: 'run' },
          { question: 1, choice: { kind: 'decide-for-me' }, scope: 'subject' },
        ],
        requestId: 'r1',
      },
    });
    expect(state().submitAnswers()).toBe(false); // in flight
    result('r1', OK);
    run(waitingRun([MODALITY_QUESTION], { pendingQuestions: { id: 'q2', askedAt: '2026-11-01T10:03:00.000Z', questions: [MODALITY_QUESTION] } }));
    expect(state().answerDrafts).toEqual({});
  });
});

describe('the review', () => {
  it('going past the statements reveals the result (and the overlay shows it); "Show result" does so at once', () => {
    const { state, run, proposal } = setup();
    const p = adoptedProposal();
    run(reviewRun(p));
    proposal(p);
    expect(state().review?.revealed).toBe(false);
    state().reviewGo(1);
    expect(state().review?.revealed).toBe(false);
    state().reviewGo(2);
    expect(state().review?.revealed).toBe(true);
    expect(state().overlay?.hidden.size).toBe(0);
    state().reviewGo(99);
    expect(state().review?.step).toBe(3); // clamped to the last step, the result (spec v4: no "Card changes" step after it)
    const fresh = setup();
    fresh.run(reviewRun(p));
    fresh.proposal(p);
    fresh.state().revealResult();
    expect(fresh.state().review).toMatchObject({ step: 0, revealed: true });
    // Nothing to read first: the result is shown at once.
    const plain = setup();
    plain.proposal(normativeProposal({ proposalId: 'p9', review: [] }));
    expect(plain.state().review?.revealed).toBe(true);
  });

  it('Accept waits for every definition; a "no" opens Feedback, prefilled; Accept sends the approvals', () => {
    const { state, run, proposal, last } = setup();
    const p = definitionProposal();
    run(reviewRun(p));
    proposal(p);
    expect(state().acceptProposal()).toBe(false);
    state().answerDefinition('d1', 'yes');
    state().answerDefinition('d2', 'no');
    expect(state().review).toMatchObject({ feedbackOpen: true, feedback: "I don't endorse the definition `Spyro.Rating.exists` (“there is at least one rating”): " });
    expect(state().acceptProposal()).toBe(false);
    state().answerDefinition('d2', 'yes');
    expect(state().acceptProposal()).toBe(true);
    expect(last()).toEqual({ v: 1, type: 'acceptProposal', payload: { runId: RUN_ID, proposalId: 'p3', definitions: ['d1', 'd2'], requestId: 'r1' } });
  });

  it('Accept remembers whether it changes the files (the run panel’s outcome line): the proposal’s `empty`, then the host’s answer; a refusal or another run forgets it', () => {
    const { state, run, proposal, result } = setup();
    const empty = emptyProposal();
    run(reviewRun(empty, { premises: [] }));
    proposal(empty);
    expect(state().accepted).toBeNull();
    expect(state().acceptProposal()).toBe(true);
    expect(state().accepted).toEqual({ runId: RUN_ID, proposalId: 'p1', changedFiles: false });
    // As the host does it: the run ends and the proposal goes before the Accept's own answer arrives.
    run(runView({ state: 'accepted', premises: [] }));
    proposal(null);
    expect(state().accepted).toEqual({ runId: RUN_ID, proposalId: 'p1', changedFiles: false });
    result('r1', { ok: true, label: 'Recorded: Self-evident? → not proved (no file changed)', undoable: false });
    expect(state().accepted).toEqual({ runId: RUN_ID, proposalId: 'p1', changedFiles: false });
    run(null); // dismissed
    expect(state().accepted).toBeNull();

    // A proposal with changes whose Accept applied nothing after all (rebased onto identical edits of the user's):
    // the host's answer (`undoable` is false exactly when nothing was applied) wins over the proposal.
    const changes = normativeProposal({ runId: 'run_2' });
    run(reviewRun(changes, { runId: 'run_2' }));
    proposal(changes);
    state().acceptProposal();
    expect(state().accepted).toEqual({ runId: 'run_2', proposalId: 'p1', changedFiles: true });
    result('r2', { ok: true, label: 'Recorded: These suffice → proved (no file changed)', undoable: false });
    expect(state().accepted?.changedFiles).toBe(false);
    // A refused Accept changed nothing and the run stays in review: forgotten. Another run forgets it as well.
    state().acceptProposal();
    expect(state().accepted?.changedFiles).toBe(true);
    result('r3', { ok: false, code: 'conflict', error: 'Accept was refused: the checks failed on your current files.' });
    expect(state().accepted).toBeNull();
    state().acceptProposal();
    expect(state().accepted?.runId).toBe('run_2');
    run(runView({ runId: 'run_3' }));
    expect(state().accepted).toBeNull();

    // A round that changed no file only records, even when it proved the target (spec v4: no card change to tick).
    const proved = emptyProposal({ runId: 'run_4', report: normativeProposal().report });
    run(reviewRun(proved, { runId: 'run_4' }));
    proposal(proved);
    state().acceptProposal();
    expect(state().accepted).toEqual({ runId: 'run_4', proposalId: 'p1', changedFiles: false });
  });

  it('Feedback: prefills go on their own line; the text is trimmed but keeps its line breaks; blank text is not sent', () => {
    const { state, run, proposal, last, ofType } = setup();
    const p = normativeProposal();
    run(reviewRun(p));
    proposal(p);
    expect(state().sendFeedback()).toBe(false);
    state().openFeedback('First thing.');
    state().openFeedback('Second thing.');
    expect(state().review).toMatchObject({ feedback: 'First thing.\nSecond thing.', feedbackOpen: true, feedbackFocus: 2 });
    state().setFeedback('   ');
    expect(state().sendFeedback()).toBe(false);
    state().setFeedback('  Keep the rule general.\nThanks.  ');
    expect(state().sendFeedback()).toBe(true);
    expect(last()).toEqual({ v: 1, type: 'feedback', payload: { runId: RUN_ID, text: 'Keep the rule general.\nThanks.', requestId: 'r1' } });
    expect(ofType('feedback')).toHaveLength(1);
  });

  it('ghosts: "I hold this" with a one-line reason or none; "No"; Discard; Raw Lean diff', () => {
    const { state, run, proposal, result, ofType } = setup();
    const p = literalProposal();
    run(reviewRun(p));
    proposal(p);
    state().adoptGhost('ghost-1', '  it seems\nobvious ');
    result('r1', OK);
    state().adoptGhost('ghost-1');
    result('r2', OK);
    state().rejectGhost('ghost-1');
    result('r3', OK);
    state().discardProposal();
    state().openProposalDiff();
    state().openProposalDiff('Model/Spyro/Vocabulary.lean');
    expect(ofType('adoptGhost').map((m) => m.payload)).toEqual([
      { runId: RUN_ID, ghostId: 'ghost-1', rationale: 'it seems obvious', requestId: 'r1' },
      { runId: RUN_ID, ghostId: 'ghost-1', requestId: 'r2' },
    ]);
    expect(ofType('rejectGhost').map((m) => m.payload)).toEqual([{ runId: RUN_ID, ghostId: 'ghost-1', requestId: 'r3' }]);
    expect(ofType('discardProposal').map((m) => m.payload)).toEqual([{ runId: RUN_ID, requestId: 'r4' }]);
    expect(ofType('openProposalDiff').map((m) => m.payload)).toEqual([
      { runId: RUN_ID, proposalId: 'p1' },
      { runId: RUN_ID, proposalId: 'p1', file: 'Model/Spyro/Vocabulary.lean' },
    ]);
    // The host's update settles a request too.
    run(reviewRun(p, { ghosts: [literalGhost({ state: 'rejected' })], state: 'discarded' }));
    expect(state().runBusy).toBeNull();
  });

  it('Cancel, Resume, Stop and Dismiss post for the right states only', () => {
    const { state, run, result, ofType } = setup();
    state().dismissRun();
    run(runView());
    state().resumeRun();
    state().stopRun();
    state().dismissRun();
    state().cancelRun();
    result('r1', OK);
    run(runView({ state: 'interrupted', canResume: true }));
    state().resumeRun();
    result('r2', OK);
    state().stopRun();
    result('r3', OK);
    run(runView({ state: 'failed', error: 'x' }));
    state().cancelRun();
    state().dismissRun();
    expect(sent(ofType)).toEqual([
      ['cancelRun', { runId: RUN_ID, requestId: 'r1' }],
      ['resumeRun', { runId: RUN_ID, requestId: 'r2' }],
      ['discardProposal', { runId: RUN_ID, requestId: 'r3' }],
      ['dismissRun', { runId: RUN_ID }],
    ]);
  });

  it('slice 1f (ES-9): nothing is added from the A|P box during a review, and the board stays on the proposal (no switch back to Current)', () => {
    const { state, run, proposal, sent } = setup();
    const p = normativeProposal();
    run(reviewRun(p));
    proposal(p);
    expect(state().proposedView).toBe(true);
    const before = sent.length;
    expect(state().addNode('AXIOM', 'Critics notice ratings')).toBeNull();
    expect(state().proposedView).toBe(true);
    expect(sent.slice(before).filter((m) => m.type === 'addNode')).toEqual([]);
    expect(Object.keys(state().provisional)).toEqual([]);
  });
});

/** The run messages posted, in order, as [type, payload]. */
function sent(ofType: ReturnType<typeof setup>['ofType']): Array<[string, unknown]> {
  return [...ofType('cancelRun'), ...ofType('resumeRun'), ...ofType('discardProposal'), ...ofType('dismissRun')].map((m) => [m.type, m.payload] as [string, unknown]);
}

describe('carry-over 3: confirmedDependents', () => {
  it('the choice names the listed dependents; a host that finds more re-asks with its list; asked about nothing new, it does not loop', () => {
    // Spec v4: the dependents dialog comes from P->A of a proof that takes hypotheses (d1, applied by g1).
    const { state, result, last } = setup(conditionalGraph(1));
    state().dropCard('d1', 'AXIOM', null);
    state().confirmDependents('rewrite');
    expect(last()).toMatchObject({ type: 'kindChange', payload: { from: 'PROPOSITION', to: 'AXIOM', dependents: 'rewrite', confirmedDependents: ['g1'], requestId: 'r1' } });
    result('r1', { ok: false, code: 'needs-confirmation', error: 'more', dependents: ['g1', 'Spyro.helper_lemma'] });
    expect(state().dialog).toMatchObject({ kind: 'dependents', dependents: ['g1', 'Spyro.helper_lemma'], relisted: true, summary: 'Move to axioms: 2 dependents need a rewrite' });
    state().confirmDependents('mark-broken');
    expect(last()).toMatchObject({ type: 'kindChange', payload: { dependents: 'mark-broken', confirmedDependents: ['g1', 'Spyro.helper_lemma'], requestId: 'r2' } });
    result('r2', { ok: false, code: 'needs-confirmation', error: 'same again', dependents: ['Spyro.helper_lemma'] });
    expect(state().dialog).toBeNull();
    expect(state().toasts.map((t) => t.text)).toEqual(['same again']);
  });

  it('the optional reason of a change to Axiom is sent again with the answer to the host’s question', () => {
    const { state, result, last } = setup(spyroGraph(1));
    state().requestKindChange(TARGET, 'AXIOM', null);
    state().confirmRationale('a friend said so');
    expect(last()).toMatchObject({ type: 'kindChange', payload: { rationale: 'a friend said so', requestId: 'r1' } });
    expect((last() as Extract<WebviewToHostMessage, { type: 'kindChange' }>).payload.confirmedDependents).toBeUndefined();
    result('r1', { ok: false, code: 'needs-confirmation', error: 'a lemma passes it arguments', dependents: ['Spyro.helper_lemma'] });
    const dialog = state().dialog;
    expect(dialog).toMatchObject({ kind: 'dependents', dependents: ['Spyro.helper_lemma'], rationale: 'a friend said so' });
    expect(dialog?.kind === 'dependents' ? dialog.relisted : 'not a dependents dialog').toBeUndefined(); // asked for the first time
    state().confirmDependents('mark-broken');
    expect(last()).toMatchObject({ type: 'kindChange', payload: { rationale: 'a friend said so', dependents: 'mark-broken', confirmedDependents: ['Spyro.helper_lemma'] } });
  });
});
