/**
 * M2 store behaviour (docs/m2-plan.md section 6): the run kept apart from the board's graph, the run requests, and
 * carry-over 3. Slice 2h retired M2's review (the proposal, the stepper, Accept, Feedback, Discard, "I hold this"):
 * their tests were deleted with it; a start is a `formalize` (one inference here), and Stop is a Cancel.
 */
import { hostMessage, spyroGraph, type ActionOutcome, type RunView, type TlGraph, type WebviewToHostMessage } from '@telelean/core';
import { describe, expect, it } from 'vitest';
import { clampSplit, createBoardStore, formalizeOf, proposedOverlay, readSplit } from '../../src/state/store';
import { conditionalGraph } from '../shared/graphs';
import { MODALITY_QUESTION, GENERIC_QUESTION, RUN_ID, runView, TARGET, waitingRun } from '../shared/runs';
import { sessionRun, shownStage } from '../shared/sessions';

function setup(graph: TlGraph = spyroGraph()) {
  const sent: WebviewToHostMessage[] = [];
  const store = createBoardStore((m) => sent.push(m), { today: () => '2026-11-01', setTimer: () => undefined, persist: () => undefined });
  store.getState().applyGraph(graph);
  const state = () => store.getState();
  const run = (value: RunView | null) => state().receive(hostMessage('run', { run: value }));
  const result = (requestId: string, outcome: ActionOutcome) => state().receive(hostMessage('actionResult', { requestId, outcome }));
  const last = () => sent.at(-1);
  const ofType = <T extends WebviewToHostMessage['type']>(type: T) => sent.filter((m): m is Extract<WebviewToHostMessage, { type: T }> => m.type === type);
  return { store, sent, state, run, result, last, ofType };
}

const OK: ActionOutcome = { ok: true, label: 'done', undoable: false };

describe('the run is kept apart from the graph', () => {
  it('the run message touches none of the board’s graph data, and a new graph keeps the run (2h: no proposal any more)', () => {
    const { state, run } = setup();
    const before = { version: state().version, seq: state().seq, nodes: state().nodes, order: state().order, edges: state().edges, vocabulary: state().vocabulary };
    run(runView({ state: 'review' }));
    expect({ version: state().version, seq: state().seq, nodes: state().nodes, order: state().order, edges: state().edges, vocabulary: state().vocabulary }).toEqual(before);
    expect(state().run?.runId).toBe(RUN_ID);
    // A new graph (a Lean refresh) keeps the run; without a session there is no Proposed view to build.
    state().applyGraph(spyroGraph(5));
    expect(state().run?.runId).toBe(RUN_ID);
    expect(state().overlay).toBeNull();
    expect(proposedOverlay(state())).toBeNull();
    expect(state()).not.toHaveProperty('proposal');
    expect(state()).not.toHaveProperty('review');
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
    // Slice 2h: a start is a one-inference `formalize` (M2's `startRun` is retired).
    expect(ofType('formalize')).toHaveLength(1);
    expect(ofType('formalize')[0]?.payload).toEqual({ inferences: [{ target: TARGET, premises: ['cynder-dark-past', 'new-spyro-pg'] }], requestId: 'r1' });
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

describe('the run panel\'s run requests', () => {
  it('Cancel, Resume, Stop and Dismiss post for the right states only (2h: Stop is a Cancel of a run that is no session)', () => {
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
      ['cancelRun', { runId: RUN_ID, requestId: 'r3' }],
      ['resumeRun', { runId: RUN_ID, requestId: 'r2' }],
      ['dismissRun', { runId: RUN_ID }],
    ]);
    expect(ofType('discardProposal' as never)).toEqual([]);
  });

  it('slice 2h: Stop is offered only for a run that is no session (an interrupted v1 run, or one whose conversion failed in review)', () => {
    const { state, run, ofType } = setup();
    run(runView({ state: 'review', error: 'This run was started by an older telelean and could not be converted (x): Stop it.' }));
    state().stopRun();
    expect(ofType('cancelRun').map((m) => m.payload)).toEqual([{ runId: RUN_ID, requestId: 'r1' }]);
    // A session (its RunView names it) is ended by Exit, never by Stop.
    const { state: other, run: runOther, ofType: ofOther } = setup();
    runOther(runView({ state: 'interrupted', canResume: true, session: { stage: 1, phase: 'interrupted' } }));
    other().stopRun();
    runOther(runView({ state: 'review', session: { stage: 1, phase: 'stage' } }));
    other().stopRun();
    expect(ofOther('cancelRun')).toEqual([]);
  });

  it('slice 1f (ES-9): nothing is added from the A|P box during a session\'s review, and the board stays on the Proposed view (no switch back to Current)', () => {
    const { state, run, sent } = setup();
    const session = shownStage();
    run(sessionRun(session));
    state().receive(hostMessage('session', { session }));
    expect(state().proposedView).toBe(true);
    const before = sent.length;
    expect(state().addNode('AXIOM', 'Critics notice ratings')).toBeNull();
    expect(state().proposedView).toBe(true);
    expect(sent.slice(before).filter((m) => m.type === 'addNode')).toEqual([]);
    expect(Object.keys(state().provisional)).toEqual([]);
  });
});

/** The run messages posted, by type, as [type, payload]. */
function sent(ofType: ReturnType<typeof setup>['ofType']): Array<[string, unknown]> {
  return [...ofType('cancelRun'), ...ofType('resumeRun'), ...ofType('dismissRun')].map((m) => [m.type, m.payload] as [string, unknown]);
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
