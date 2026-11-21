/**
 * M2 run messages on one board (docs/m2-plan.md section 8.1; AT5.1, AT5.2, AT5.6 with fake ports): BoardSession routes
 * core RUN_MESSAGE_TYPES to the root's RunManager (a recording fake here), reports outcomes as `actionResult`, and
 * posts `run` / `proposal` on `ready` and on every RunManager change, including a run of another subject.
 */
import { EDIT_SESSION_ACTIVE, FORMALIZE_START_TEXTS, parseWebviewToHost, REVIEW_TEXTS, RUN_MESSAGE_TYPES, SESSION_MESSAGE_TYPES, spyroGraph, type TlGraph, type TlNode, type WebviewToHostMessage } from '@telelean/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { BoardSession } from '../../src/logic/boardSession';
import { CONSENT_DECLINED, RUNS_UNAVAILABLE, type RunsHandle } from '../../src/logic/runs';
import { FakeRunManager, FakeWorkspace, RecordingPorts, sampleProposal, sampleRun } from './fakes';

function message(type: string, payload: Record<string, unknown> = {}): WebviewToHostMessage {
  const parsed = parseWebviewToHost({ v: 1, type, payload });
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let ws: FakeWorkspace;
let ports: RecordingPorts;
let runs: FakeRunManager;
let session: BoardSession;

function makeSession(handle: RunsHandle = { manager: runs, recovered: Promise.resolve() }): BoardSession {
  return new BoardSession({ root: ws.root, rootName: 'spyro', workspace: ws, ports, runs: handle });
}

beforeEach(() => {
  ws = new FakeWorkspace();
  ports = new RecordingPorts();
  runs = new FakeRunManager();
  session = makeSession();
});

const START = { target: 'cynder-not-good', premises: ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'] };

describe('routing run messages (AT5.1)', () => {
  it('every run message reaches the RunManager method of the same meaning, with the board\'s subject for a start', async () => {
    const answers = [{ question: 0, choice: { kind: 'option', option: 0 }, scope: 'run' }];
    const sent: Array<[string, Record<string, unknown>]> = [
      ['startRun', { ...START, requestId: 'q-start' }],
      ['answerQuestions', { runId: 'r1', setId: 'q1', answers, requestId: 'q-answer' }],
      ['cancelRun', { runId: 'r1', requestId: 'q-cancel' }],
      ['resumeRun', { runId: 'r1', requestId: 'q-resume' }],
      ['acceptProposal', { runId: 'r1', proposalId: 'p1', definitions: ['d1'], requestId: 'q-accept' }],
      ['feedback', { runId: 'r1', text: 'Read "cannot" as a rule.\nThanks.', requestId: 'q-feedback' }],
      ['discardProposal', { runId: 'r1', requestId: 'q-discard' }],
      ['adoptGhost', { runId: 'r1', ghostId: 'ghost-1', rationale: 'it seems obvious to me', requestId: 'q-adopt' }],
      ['adoptGhost', { runId: 'r1', ghostId: 'ghost-2', requestId: 'q-adopt2' }],
      ['rejectGhost', { runId: 'r1', ghostId: 'ghost-3', requestId: 'q-reject' }],
      ['dismissRun', { runId: 'r1' }],
      // Slice 2d: Formalize (a start, and mid-stage) and Retry step.
      ['formalize', { inferences: [START], requestId: 'q-formalize' }],
      ['formalize', { inferences: [{ target: 'cynder-not-good', premises: ['cynder-dark-past'] }], runId: 'r1', stage: 2, requestId: 'q-formalize2' }],
      ['retryStep', { runId: 'r1', requestId: 'q-retry' }],
    ];
    for (const [type, payload] of sent) await session.handle(message(type, payload));
    expect(runs.calls.map((c) => [c.method, c.args])).toEqual([
      ['start', [{ subject: 'Spyro', ...START }]],
      ['answer', ['r1', 'q1', answers]],
      ['cancel', ['r1']],
      ['resume', ['r1']],
      ['accept', ['r1', 'p1', ['d1']]],
      ['feedback', ['r1', 'Read "cannot" as a rule.\nThanks.']],
      ['discard', ['r1']],
      ['adoptGhost', ['r1', 'ghost-1', 'it seems obvious to me']],
      ['adoptGhost', ['r1', 'ghost-2']],
      ['rejectGhost', ['r1', 'ghost-3']],
      ['dismiss', ['r1']],
      ['formalize', [{ subject: 'Spyro', inferences: [START] }]],
      ['formalize', [{ subject: 'Spyro', inferences: [{ target: 'cynder-not-good', premises: ['cynder-dark-past'] }], runId: 'r1', stage: 2 }]],
      ['retry', ['r1']],
    ]);
    // Every routed type is one of core's run messages, and each of them is covered here, by openProposalDiff below, or
    // (slice 2, 2c1) is an edit session's message answered `not-yet` until its routing (2e, 2f), below.
    expect(new Set([...sent.map(([type]) => type), 'openProposalDiff', ...SESSION_MESSAGE_TYPES])).toEqual(new Set(RUN_MESSAGE_TYPES));
    expect(ws.performed).toEqual([]); // the board never declares premises itself (the RunManager does, after preflight)
  });

  it('slice 2 (2c1): a valid session message not routed yet is answered `not-yet`, "Not built yet (slice 2)", and reaches no RunManager method (2d routes formalize and retryStep)', async () => {
    const valid: Array<[string, Record<string, unknown>]> = [
      ['decideItems', { runId: 'r1', stage: 1, own: true, decisions: [{ item: 'it0123456789abcdef', rev: 1, to: 'accepted' }] }],
      ['revealResult', { runId: 'r1', stage: 1, via: 'show-result' }],
      ['sessionUndo', { runId: 'r1', step: 3 }],
      ['sessionRedo', { runId: 'r1', step: 4 }],
      ['submitReview', { runId: 'r1', stage: 1 }],
      ['endSession', { runId: 'r1', decision: 'exit' }],
      ['openSessionDiff', { runId: 'r1', stage: 1, confirmed: true }],
      ['moveProposed', { runId: 'r1', positions: { 'cynder-not-good': { x: 10, y: 20 } } }],
    ];
    expect(valid.map(([type]) => type)).toEqual(SESSION_MESSAGE_TYPES.filter((t) => t !== 'formalize' && t !== 'retryStep'));
    for (const [type, payload] of valid) await session.handle(message(type, { ...payload, requestId: `q-${type}` }));
    expect(runs.calls).toEqual([]);
    expect(ports.of('actionResult').map((m) => m.payload)).toEqual(valid.map(([type]) => ({ requestId: `q-${type}`, outcome: { ok: false, code: 'not-yet', error: REVIEW_TEXTS.notBuiltYet } })));
    expect(REVIEW_TEXTS.notBuiltYet).toBe('Not built yet (slice 2)');
    expect(ws.performed).toEqual([]);
  });

  it('slice 2 (2c2): while a run is active the answer is still `not-yet` (never the lock or busy refusal); without a request id it is a warning toast', async () => {
    runs.run = sampleRun({ state: 'working' }); // a step of the root's run is working: the board is locked (ES-9)
    await session.handle(message('decideItems', { runId: 'r1', stage: 1, own: false, decisions: [{ item: 'it0123456789abcdef', rev: 1, to: 'declined', option: 'shaky', note: 'ask me' }], requestId: 'q1' }));
    await session.handle(message('endSession', { runId: 'r1', decision: 'exit', requestId: 'q2' }));
    expect(ports.of('actionResult').map((m) => m.payload)).toEqual([
      { requestId: 'q1', outcome: { ok: false, code: 'not-yet', error: REVIEW_TEXTS.notBuiltYet } },
      { requestId: 'q2', outcome: { ok: false, code: 'not-yet', error: REVIEW_TEXTS.notBuiltYet } },
    ]);
    expect(ports.of('notice')).toEqual([]);
    await session.handle(message('submitReview', { runId: 'r1', stage: 1 }));
    expect(ports.of('notice').map((m) => m.payload)).toEqual([expect.objectContaining({ level: 'warning', text: REVIEW_TEXTS.notBuiltYet, undoable: false })]);
    expect(runs.calls).toEqual([]);
    expect(ws.performed).toEqual([]);
  });

  it('outcomes become actionResult; successes that change the board also get a toast (Undo only after an Accept)', async () => {
    runs.outcome = (method) => ({ ok: true, label: `label of ${method}`, undoable: method === 'accept' || method === 'start' });
    await session.handle(message('startRun', { ...START, requestId: 's1' }));
    await session.handle(message('acceptProposal', { runId: 'r1', proposalId: 'p1', definitions: [], requestId: 'a1' }));
    await session.handle(message('answerQuestions', { runId: 'r1', setId: 'q1', answers: [{ question: 0, choice: { kind: 'leave-open' }, scope: 'run' }], requestId: 'n1' }));
    expect(ports.of('actionResult').map((m) => m.payload)).toEqual([
      { requestId: 's1', outcome: { ok: true, label: 'label of start', undoable: true } },
      { requestId: 'a1', outcome: { ok: true, label: 'label of accept', undoable: true } },
      { requestId: 'n1', outcome: { ok: true, label: 'label of answer', undoable: false } },
    ]);
    expect(ports.of('notice').map((m) => [m.payload.text, m.payload.undoable])).toEqual([
      ['label of start', false], // the start's Undo would only undo a premises declaration: no Undo button
      ['label of accept', true], // one Accept = one undoable step
    ]);
  });

  it('a refusal with a request id is an actionResult only; without one (dismissRun) a warning toast', async () => {
    runs.outcome = { ok: false, code: 'not-found', error: 'There is no run r9 (any more).' };
    await session.handle(message('cancelRun', { runId: 'r9', requestId: 'c1' }));
    expect(ports.of('actionResult')[0]?.payload).toEqual({ requestId: 'c1', outcome: runs.outcome });
    expect(ports.of('notice')).toEqual([]);
    await session.handle(message('dismissRun', { runId: 'r9' }));
    expect(ports.of('notice')[0]?.payload).toMatchObject({ level: 'warning', text: 'There is no run r9 (any more).', undoable: false });
  });

  it('a RunManager that throws becomes an internal refusal, never a crash', async () => {
    runs.outcome = () => {
      throw new Error('boom');
    };
    await session.handle(message('discardProposal', { runId: 'r1', requestId: 'd1' }));
    expect(ports.of('actionResult')[0]?.payload.outcome).toEqual({ ok: false, code: 'internal', error: 'boom' });
  });

  it('run messages are handled one at a time in arrival order, and never hold back board messages', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    runs.outcome = async (method) => {
      if (method === 'start') await held;
      return { ok: true, label: method, undoable: false };
    };
    const start = session.handle(message('startRun', { ...START, requestId: 's1' }));
    const feedback = session.handle(message('feedback', { runId: 'r1', text: 'Try the literal reading.', requestId: 'f1' }));
    const dismiss = session.handle(message('dismissRun', { runId: 'r0' }));
    await sleep(10);
    expect(runs.calls.map((c) => c.method)).toEqual(['start']); // the others wait for the start, in order
    // A board message does not wait for the run start: it is answered at once. Slice 1f (ES-9): an edit sent while
    // the start is on its way is refused (before 1f it was applied); selecting a subject still works.
    await session.handle(message('addNode', { clientId: 'tmp', type: 'AXIOM', naturalName: 'Cynder can fly', requestId: 'e1' }));
    expect(ws.performed).toEqual([]);
    expect(ports.of('actionResult')[0]?.payload).toEqual({ requestId: 'e1', outcome: { ok: false, code: 'conflict', error: EDIT_SESSION_ACTIVE } });
    await session.handle(message('selectSubject', { subject: 'Spyro' }));
    release();
    await Promise.all([start, feedback, dismiss]);
    expect(runs.calls.map((c) => c.method)).toEqual(['start', 'feedback', 'dismiss']);
    expect(ports.of('actionResult').map((m) => m.payload.requestId)).toEqual(['e1', 's1', 'f1']);
  });

  it('Cancel does not wait in the queue: it reaches a start that is still waiting for Lean', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    runs.outcome = async (method) => {
      if (method === 'start') await held;
      return { ok: true, label: method, undoable: false };
    };
    const start = session.handle(message('startRun', { ...START, requestId: 's1' }));
    await sleep(5);
    runs.run = sampleRun({ state: 'starting' }); // the board shows the run being started (e.g. its base check)
    await session.handle(message('cancelRun', { runId: 'r1', requestId: 'c1' }));
    expect(runs.calls.map((c) => c.method)).toEqual(['start', 'cancel']);
    expect(ports.of('actionResult').map((m) => m.payload.requestId)).toEqual(['c1']); // answered while the start waits
    release();
    await start;
    expect(ports.of('actionResult').map((m) => m.payload.requestId)).toEqual(['c1', 's1']);
  });

  it('runs that are unavailable answer not-yet with the reason (and the raw diff a warning)', async () => {
    session = makeSession({ unavailable: 'Claude runs are not available: no storage folder' });
    await session.handle(message('startRun', { ...START, requestId: 's1' }));
    expect(ports.of('actionResult')[0]?.payload.outcome).toEqual({ ok: false, code: 'not-yet', error: 'Claude runs are not available: no storage folder' });
    await session.handle(message('openProposalDiff', { runId: 'r1', proposalId: 'p1' }));
    expect(ports.of('notice')[0]?.payload).toMatchObject({ level: 'warning', text: 'Claude runs are not available: no storage folder' });
    expect(ports.consentAsked).toBe(0);

    ports.clear();
    session = new BoardSession({ root: ws.root, rootName: 'spyro', workspace: ws, ports }); // no runs at all
    await session.handle(message('resumeRun', { runId: 'r1', requestId: 'r1' }));
    expect(ports.of('actionResult')[0]?.payload.outcome).toEqual({ ok: false, code: 'not-yet', error: RUNS_UNAVAILABLE });
    await session.handle(message('ready', { lastVersion: null }));
    expect(ports.posts.slice(-2).map((p) => p.type)).toEqual(['workspace', 'graph']); // no run messages without runs
  });

  it('run messages wait until the runs of an earlier window are recovered', async () => {
    let recover!: () => void;
    session = makeSession({ manager: runs, recovered: new Promise<void>((resolve) => (recover = resolve)) });
    const answering = session.handle(message('answerQuestions', { runId: 'r1', setId: 'q1', answers: [{ question: 0, choice: { kind: 'decide-for-me' }, scope: 'run' }], requestId: 'a1' }));
    await sleep(10);
    expect(runs.calls).toEqual([]);
    recover();
    await answering;
    expect(runs.calls.map((c) => c.method)).toEqual(['answer']);
  });
});

describe('posting run and proposal (AT5.1)', () => {
  it('"ready" posts the workspace and graph, then the run, the proposal and (slice 2d) the session', async () => {
    runs.run = sampleRun({ state: 'review', proposalId: 'p1' });
    runs.currentProposal = sampleProposal();
    await session.handle(message('ready', { lastVersion: null }));
    expect(ports.posts.map((p) => p.type)).toEqual(['workspace', 'graph', 'run', 'proposal', 'session']);
    expect(ports.of('session')[0]?.payload.session).toBeNull(); // not an edit session
    expect(ports.of('run')[0]?.payload.run).toEqual(runs.run);
    expect(ports.of('proposal')[0]?.payload.proposal).toEqual(runs.currentProposal);
  });

  it('with no run, "ready" posts run null and proposal null (the board clears a stale one)', async () => {
    await session.handle(message('ready', { lastVersion: null }));
    expect(ports.of('run').map((m) => m.payload.run)).toEqual([null]);
    expect(ports.of('proposal').map((m) => m.payload.proposal)).toEqual([null]);
  });

  it('posts what changed on every RunManager change, also for another subject\'s run', async () => {
    runs.run = sampleRun({ subject: 'Bayonetta', target: 'bayonetta-goal', state: 'working' });
    runs.fire({ run: true, proposal: false , session: false });
    await sleep(0);
    expect(ports.posts.map((p) => p.type)).toEqual(['run']);
    expect(ports.of('run')[0]?.payload.run?.subject).toBe('Bayonetta'); // the Spyro board still gets it (compact line)

    ports.clear();
    runs.run = sampleRun({ state: 'review', proposalId: 'p2' });
    runs.currentProposal = sampleProposal({ proposalId: 'p2' });
    runs.fire({ run: true, proposal: true , session: false });
    await sleep(0);
    expect(ports.posts.map((p) => p.type)).toEqual(['run', 'proposal']);
    expect(ports.of('proposal')[0]?.payload.proposal?.proposalId).toBe('p2');

    ports.clear();
    runs.currentProposal = null;
    runs.fire({ run: false, proposal: true , session: false });
    await sleep(0);
    expect(ports.posts.map((p) => [p.type, p.type === 'proposal' ? p.payload.proposal : undefined])).toEqual([['proposal', null]]);
  });

  it('after a run message the run and (slice 2d) the session are posted again (the panel follows even before the change event)', async () => {
    runs.run = sampleRun({ state: 'cancelled' });
    await session.handle(message('cancelRun', { runId: 'r1', requestId: 'c1' }));
    expect(ports.posts.map((p) => p.type)).toEqual(['actionResult', 'notice', 'run', 'session']);
  });

  it('a start (premises declared), a Formalize start (slice 2d) and an Accept (files changed) also republish the workspace and graph', async () => {
    await session.handle(message('startRun', { ...START, requestId: 's1' }));
    expect(ports.posts.map((p) => p.type)).toEqual(['actionResult', 'notice', 'run', 'session', 'workspace', 'graph']);
    ports.clear();
    await session.handle(message('formalize', { inferences: [START], requestId: 'f1' })); // slice 2d: a Formalize start too
    expect(ports.posts.map((p) => p.type)).toEqual(['actionResult', 'notice', 'run', 'session', 'workspace', 'graph']);
  });

  it('a closed board stops listening (the run itself goes on, D-25)', async () => {
    expect(runs.listenerCount).toBe(1);
    session.dispose();
    expect(runs.listenerCount).toBe(0);
    runs.fire();
    await sleep(0);
    expect(ports.posts).toEqual([]);
    expect(runs.calls.filter((c) => c.method === 'cancel' || c.method === 'dispose')).toEqual([]);
  });

  it('a RunManager whose current() throws posts run null and logs it', async () => {
    runs.current = () => {
      throw new Error('broken state');
    };
    await session.publishRuns({ run: true, proposal: false , session: false });
    expect(ports.of('run')[0]?.payload.run).toBeNull();
    expect(ports.logs.some((l) => l.level === 'error' && /broken state/.test(l.message))).toBe(true);
  });
});

/** The board's graph with some cards changed (and others added), as the host reads it at a start. */
function withGraph(changes: Record<string, Partial<TlNode>>, extra: TlNode[] = []): void {
  ws.graph = (subject: string): TlGraph => {
    const graph = spyroGraph();
    return { ...graph, subject, version: ws.version, nodes: [...graph.nodes.map((n) => ({ ...n, ...(changes[n.id] ?? {}) }) as TlNode), ...extra] };
  };
}

describe('startRun: the start\'s check (spec v4.1 Formalize for dependencies, docs/slice1-plan.md 2.5; slice 1e)', () => {
  const refusal = () => ports.of('actionResult')[0]?.payload.outcome;

  it('a premise without an arrow drawn into the target: "Draw the arrows first.", before the consent question', async () => {
    withGraph({ 'cynder-not-good': { premises: ['cynder-dark-past'] } });
    await session.handle(message('startRun', { target: 'cynder-not-good', premises: ['cynder-dark-past', 'new-spyro-pg'], requestId: 's1' }));
    expect(refusal()).toEqual({ ok: false, code: 'invalid', error: FORMALIZE_START_TEXTS.drawFirst });
    expect(ports.consentAsked).toBe(0);
    expect(runs.callsOf('start')).toEqual([]);
    expect(ws.performed).toEqual([]);
  });

  it('no premises for a target without the "follows from nothing" mark: "Select arrows into one card."', async () => {
    await session.handle(message('startRun', { target: 'cynder-not-good', premises: [], requestId: 's1' }));
    expect(refusal()).toEqual({ ok: false, code: 'invalid', error: 'Select arrows into one card.' });
    expect(runs.callsOf('start')).toEqual([]);
  });

  it('AR-8: a proposition premise with neither a proof nor a pending claim must be marked pending first', async () => {
    const target = spyroGraph().nodes.find((n) => n.id === 'cynder-not-good') as TlNode;
    const { justification: _j, justificationKind: _k, ...lean } = target.lean;
    void _j;
    void _k;
    const lemma: TlNode = { ...target, id: 'l-card', naturalName: 'L is unproved', premises: [], lean: { ...lean, statement: 'Spyro.l_card' } };
    withGraph({ 'cynder-not-good': { premises: ['cynder-dark-past', 'l-card'] } }, [lemma]);
    await session.handle(message('startRun', { target: 'cynder-not-good', premises: ['l-card'], requestId: 's1' }));
    expect(refusal()).toEqual({ ok: false, code: 'invalid', error: '“L is unproved” is not proved: mark it pending first.' });
    expect(runs.callsOf('start')).toEqual([]);
  });

  it('a target on a cycle of arrows is refused, naming the cycle (AP-13)', async () => {
    withGraph({ 'cynder-dark-past': { type: 'PROPOSITION', premises: ['cynder-not-good'] } });
    await session.handle(message('startRun', { ...START, requestId: 's1' }));
    const outcome = refusal();
    expect(outcome).toMatchObject({ ok: false, code: 'invalid' });
    expect(outcome?.ok === false ? outcome.error : '').toMatch(/^This card is on a cycle of arrows \(Cynder would not be a good addition to … → Cynder is a character who has a dark pa… → Cynder would not be a good addition to …\): remove one arrow first\.$/);
    expect(runs.callsOf('start')).toEqual([]);
  });

  it('the check sees the edits sent before the start: an arrow drawn just before is in the files when it runs', async () => {
    withGraph({ 'cynder-not-good': { premises: ['cynder-dark-past'] } });
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const perform = ws.perform.bind(ws);
    ws.perform = async (action) => {
      await held;
      withGraph({ 'cynder-not-good': { premises: ['cynder-dark-past', 'new-spyro-pg'] } }); // what the arrow wrote
      return perform(action);
    };
    const drawing = session.handle(message('addArrows', { target: 'cynder-not-good', sources: ['new-spyro-pg'], requestId: 'a1' }));
    const starting = session.handle(message('startRun', { target: 'cynder-not-good', premises: ['cynder-dark-past', 'new-spyro-pg'], requestId: 's1' }));
    await sleep(5);
    release();
    await Promise.all([drawing, starting]);
    expect(ports.of('actionResult').map((m) => [m.payload.requestId, m.payload.outcome.ok])).toEqual([
      ['a1', true],
      ['s1', true],
    ]);
    expect(runs.callsOf('start')).toEqual([[{ subject: 'Spyro', target: 'cynder-not-good', premises: ['cynder-dark-past', 'new-spyro-pg'] }]]);
  });
});

describe('startRun: busy check and egress consent (AT5.2)', () => {
  it('asks for consent, then calls start with the board\'s subject, target and premises (never perform)', async () => {
    await session.handle(message('startRun', { ...START, requestId: 's1' }));
    expect(ports.consentAsked).toBe(1);
    expect(runs.callsOf('start')).toEqual([[{ subject: 'Spyro', ...START }]]);
    expect(ws.performed).toEqual([]);
  });

  it('a "follows from nothing" mark as the question (no premises) starts a run with an empty selection (slice 1e)', async () => {
    withGraph({ 'cynder-not-good': { premises: [], fromNothing: true } });
    await session.handle(message('startRun', { target: 'cynder-not-good', premises: [], requestId: 's0' }));
    expect(runs.callsOf('start')).toEqual([[{ subject: 'Spyro', target: 'cynder-not-good', premises: [] }]]);
  });

  it('declined consent: nothing is started or declared, and the refusal says why', async () => {
    ports.consentAnswer = false;
    await session.handle(message('startRun', { ...START, requestId: 's1' }));
    expect(runs.calls).toEqual([]);
    expect(ws.performed).toEqual([]);
    expect(ports.of('actionResult')[0]?.payload.outcome).toEqual({ ok: false, code: 'not-yet', error: CONSENT_DECLINED });
    // The board recognises the user's own "no" by this start (webview store CONSENT_DECLINED_PREFIX) and says it as
    // information, not as an error.
    expect(CONSENT_DECLINED.startsWith('Not started:')).toBe(true);
  });

  it('busy: a run of this root is active (any subject) -> conflict, without asking for consent', async () => {
    for (const state of ['starting', 'working', 'waiting-for-answer', 'gate', 'review', 'interrupted'] as const) {
      ports.clear();
      runs.run = sampleRun({ state, subject: 'Bayonetta' });
      await session.handle(message('startRun', { ...START, requestId: `s-${state}` }));
      const outcome = ports.of('actionResult')[0]?.payload.outcome;
      expect(outcome?.ok, state).toBe(false);
      if (outcome?.ok !== false) continue;
      expect(outcome.code, state).toBe('conflict');
      expect(outcome.error, state).toContain('"Bayonetta"');
    }
    expect(ports.consentAsked).toBe(0);
    expect(runs.callsOf('start')).toEqual([]);
  });

  it('an ended run does not block a new start', async () => {
    for (const state of ['accepted', 'discarded', 'cancelled', 'failed'] as const) {
      runs.run = sampleRun({ state });
      await session.handle(message('startRun', { ...START, requestId: `s-${state}` }));
    }
    expect(runs.callsOf('start')).toHaveLength(4);
  });

  it('the RunManager\'s own busy refusal (a start that raced another) is passed on as conflict', async () => {
    runs.outcome = { ok: false, code: 'conflict', error: 'Another run of this model is active.' };
    await session.handle(message('startRun', { ...START, requestId: 's1' }));
    expect(ports.of('actionResult')[0]?.payload.outcome).toEqual(runs.outcome);
  });

  it('a model without a subject cannot start a run', async () => {
    ws.subjectList = [];
    session = makeSession();
    await session.handle(message('startRun', { ...START, requestId: 's1' }));
    expect(ports.of('actionResult')[0]?.payload.outcome).toMatchObject({ ok: false, code: 'invalid' });
    expect(ports.consentAsked).toBe(0);
  });

  it('the subject is the one the board showed when the button was pressed', async () => {
    ws.subjectList = [
      { name: 'Spyro', nodeCount: 4, files: [] },
      { name: 'Bayonetta', nodeCount: 0, files: [] },
    ];
    session = makeSession();
    let answer!: (yes: boolean) => void;
    ports.claudeConsent = () => new Promise<boolean>((resolve) => (answer = resolve));
    const starting = session.handle(message('startRun', { ...START, requestId: 's1' }));
    await sleep(5);
    await session.handle(message('selectSubject', { subject: 'Bayonetta' })); // switched while the modal was open
    answer(true);
    await starting;
    expect(runs.callsOf('start')).toEqual([[{ subject: 'Spyro', ...START }]]);
  });
});

describe('openProposalDiff (AT5.6, fake ports)', () => {
  it('shows the proposal\'s files (base left, proposal right) titled by subject and round', async () => {
    runs.currentProposal = sampleProposal({ proposalId: 'p3', round: 2 });
    await session.handle(message('openProposalDiff', { runId: 'r1', proposalId: 'p3' }));
    expect(runs.callsOf('proposalDiff')).toEqual([['r1', 'p3']]);
    expect(ports.proposalDiffs).toEqual([{ runId: 'r1', proposalId: 'p3', title: 'Raw Lean diff: Spyro (round 2)', files: runs.diffFiles }]);
  });

  it('focused on one file; a file the proposal does not change, or no change at all, is an info toast', async () => {
    await session.handle(message('openProposalDiff', { runId: 'r1', proposalId: 'p1', file: 'Model/Spyro/Lemmas.lean' }));
    expect(ports.proposalDiffs).toHaveLength(1);
    expect(ports.proposalDiffs[0]?.title).toBe('Raw Lean diff: Lemmas.lean');
    expect(ports.proposalDiffs[0]?.files.map((f) => [f.path, f.before])).toEqual([['Model/Spyro/Lemmas.lean', null]]);

    await session.handle(message('openProposalDiff', { runId: 'r1', proposalId: 'p1', file: 'Model/Spyro/Vocabulary.lean' }));
    expect(ports.of('notice').at(-1)?.payload).toMatchObject({ level: 'info', text: 'This proposal does not change Model/Spyro/Vocabulary.lean.' });
    runs.diffFiles = [];
    await session.handle(message('openProposalDiff', { runId: 'r1', proposalId: 'p1' }));
    expect(ports.of('notice').at(-1)?.payload).toMatchObject({ level: 'info', text: 'This proposal changes no files.' });
    expect(ports.proposalDiffs).toHaveLength(1);
  });

  it('a stale proposal id is a warning toast with the RunManager\'s reason', async () => {
    runs.diffFiles = new Error('That proposal is no longer current.');
    await session.handle(message('openProposalDiff', { runId: 'r1', proposalId: 'p0' }));
    expect(ports.of('notice')[0]?.payload).toMatchObject({ level: 'warning', text: 'Could not open the raw Lean diff: That proposal is no longer current.' });
    expect(ports.proposalDiffs).toEqual([]);
  });

  it('is read-only: it does not wait behind a slow run message', async () => {
    let release!: () => void;
    runs.outcome = async () => {
      await new Promise<void>((resolve) => (release = resolve));
      return { ok: true, label: 'x', undoable: false };
    };
    const accepting = session.handle(message('acceptProposal', { runId: 'r1', proposalId: 'p1', definitions: [], requestId: 'a1' }));
    await sleep(5);
    await session.handle(message('openProposalDiff', { runId: 'r1', proposalId: 'p1' }));
    expect(ports.proposalDiffs).toHaveLength(1);
    release();
    await accepting;
  });
});

describe('slice 2d: Formalize, Retry step, Cancel step and the session message (docs/slice2-plan.md 1.1, 2.4, 3.2)', () => {
  const mid = { inferences: [{ target: 'cynder-not-good', premises: ['cynder-dark-past'] }], runId: 'r1', stage: 1 };

  it('a start runs the check before the consent question, then formalize with the board\'s subject; an invalid request never asks', async () => {
    await session.handle(message('formalize', { inferences: [{ target: 'cynder-not-good', premises: ['no-arrow-from-here'] }], requestId: 'bad' }));
    expect(ports.consentAsked).toBe(0);
    expect(ports.of('actionResult')[0]?.payload.outcome).toMatchObject({ ok: false, code: 'invalid' });
    expect(runs.calls).toEqual([]);
    await session.handle(message('formalize', { inferences: [START], requestId: 'good' }));
    expect(ports.consentAsked).toBe(1);
    expect(runs.callsOf('formalize')).toEqual([[{ subject: 'Spyro', inferences: [START] }]]);
    // Declined consent: nothing is started.
    ports.consentAnswer = false;
    await session.handle(message('formalize', { inferences: [START], requestId: 'no' }));
    expect(ports.of('actionResult').at(-1)?.payload.outcome).toEqual({ ok: false, code: 'not-yet', error: CONSENT_DECLINED });
    expect(runs.callsOf('formalize')).toHaveLength(1);
  });

  it('a start is refused by the busy check while a run is active; a mid-stage Formalize is not, and asks no consent', async () => {
    runs.run = sampleRun({ state: 'review' });
    await session.handle(message('formalize', { inferences: [START], requestId: 'start' }));
    expect(ports.of('actionResult')[0]?.payload.outcome).toMatchObject({ ok: false, code: 'conflict' });
    expect(runs.callsOf('formalize')).toEqual([]);
    await session.handle(message('formalize', { ...mid, requestId: 'mid' }));
    expect(ports.consentAsked).toBe(0);
    expect(runs.callsOf('formalize')).toEqual([[{ subject: 'Spyro', ...mid }]]);
    expect(ports.of('actionResult')[1]?.payload).toEqual({ requestId: 'mid', outcome: { ok: true, label: 'did formalize', undoable: false } });
  });

  it('a Formalize start locks the board for the edits sent after it (ES-9), as startRun does', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    runs.outcome = async (method) => {
      if (method === 'formalize') await held;
      return { ok: true, label: method, undoable: false };
    };
    const start = session.handle(message('formalize', { inferences: [START], requestId: 'f1' }));
    await sleep(5);
    await session.handle(message('addNode', { clientId: 'tmp', type: 'AXIOM', naturalName: 'Cynder can fly', requestId: 'e1' }));
    expect(ws.performed).toEqual([]);
    expect(ports.of('actionResult')[0]?.payload).toEqual({ requestId: 'e1', outcome: { ok: false, code: 'conflict', error: EDIT_SESSION_ACTIVE } });
    release();
    await start;
    expect(runs.calls.map((c) => c.method)).toEqual(['formalize']);
  });

  it('the ES-9 lock refuses board edits during a session and lets its messages through (mid-stage formalize, retryStep, cancelRun)', async () => {
    runs.run = sampleRun({ state: 'review' });
    await session.handle(message('addNode', { clientId: 'tmp', type: 'AXIOM', naturalName: 'A new axiom', requestId: 'edit' }));
    expect(ports.of('actionResult')[0]?.payload.outcome).toEqual({ ok: false, code: 'conflict', error: EDIT_SESSION_ACTIVE });
    await session.handle(message('formalize', { ...mid, requestId: 'mid' }));
    await session.handle(message('retryStep', { runId: 'r1', requestId: 'retry' }));
    await session.handle(message('cancelRun', { runId: 'r1', requestId: 'cancel' }));
    expect(runs.calls.map((c) => c.method)).toEqual(['formalize', 'retry', 'cancel']);
    expect(ws.performed).toEqual([]);
  });

  it('cancelRun (Cancel step) is not queued: it reaches the RunManager while a retryStep waits for its queue\'s first step', async () => {
    let release: () => void = () => undefined;
    runs.outcome = (method) =>
      method === 'retry' ? new Promise((resolve) => (release = () => resolve({ ok: true, label: 'retried', undoable: false }))) : { ok: true, label: `did ${method}`, undoable: false };
    const retrying = session.handle(message('retryStep', { runId: 'r1', requestId: 'retry' }));
    await sleep(5);
    await session.handle(message('cancelRun', { runId: 'r1', requestId: 'cancel' }));
    expect(runs.calls.map((c) => c.method)).toEqual(['retry', 'cancel']);
    release();
    await retrying;
  });

  for (const [what, first] of [
    ['a retryStep', ['retryStep', { runId: 'r1', requestId: 'first' }]],
    ['a mid-stage formalize', ['formalize', { ...mid, requestId: 'first' }]],
  ] as const) {
    it(`AF14: an answerQuestions sent while ${what} waits in the host\'s run queue reaches the RunManager once that call resolves`, async () => {
      let release: () => void = () => undefined;
      runs.outcome = (method) =>
        method === 'retry' || method === 'formalize'
          ? new Promise((resolve) => (release = () => resolve({ ok: true, label: 'the first step works', undoable: false })))
          : { ok: true, label: `did ${method}`, undoable: false };
      const firstCall = session.handle(message(first[0], first[1]));
      await sleep(5);
      const answering = session.handle(message('answerQuestions', { runId: 'r1', setId: 'q1', answers: [{ question: 0, choice: { kind: 'leave-open' }, scope: 'run' }], requestId: 'answer' }));
      await sleep(5);
      expect(runs.calls.map((c) => c.method)).toEqual([first[0] === 'retryStep' ? 'retry' : 'formalize']);
      release();
      await firstCall;
      await answering;
      expect(runs.calls.map((c) => c.method)).toEqual([first[0] === 'retryStep' ? 'retry' : 'formalize', 'answer']);
    });
  }

  it('`session` is posted on ready and whenever the session changed (RunChange.session), the RunManager\'s view as it is', async () => {
    const view = { runId: 'r1', subject: 'Spyro', stage: 1, phase: 'stage', items: [], inferences: [], steps: [], board: { graph: { nodes: [], edges: [] } } } as unknown as NonNullable<FakeRunManager['currentSession']>;
    runs.currentSession = view;
    await session.handle(message('ready', { lastVersion: null }));
    expect(ports.of('session').map((m) => m.payload.session)).toEqual([view]);
    runs.fire({ run: false, proposal: false, session: true });
    await sleep(5);
    expect(ports.of('session')).toHaveLength(2);
    runs.fire({ run: true, proposal: false, session: false });
    await sleep(5);
    expect(ports.of('session')).toHaveLength(2);
    runs.currentSession = null;
    runs.fire({ run: false, proposal: false, session: true });
    await sleep(5);
    expect(ports.of('session').at(-1)?.payload.session).toBeNull();
  });
});
