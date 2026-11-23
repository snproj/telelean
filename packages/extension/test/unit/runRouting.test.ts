/**
 * M2 run messages on one board (docs/m2-plan.md section 8.1; AT5.1, AT5.2, AT5.6 with fake ports): BoardSession routes
 * core RUN_MESSAGE_TYPES to the root's RunManager (a recording fake here), reports outcomes as `actionResult`, and
 * posts `run` (slice 2d: and `session`) on `ready` and on every RunManager change, including a run of another subject.
 * Slice 2h retired M2's review messages and the host's `proposal`: a start is a `formalize` (one inference here), and
 * its check, busy refusal and consent are tested through it.
 */
import {
  EDIT_SESSION_ACTIVE,
  FORMALIZE_START_TEXTS,
  parseWebviewToHost,
  REVIEW_TEXTS,
  RUN_MESSAGE_TYPES,
  SESSION_MESSAGE_TYPES,
  spyroGraph,
  type ActionOutcome,
  type CascadeEntry,
  type TlGraph,
  type TlNode,
  type WebviewToHostMessage,
} from '@telelean/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { BoardSession } from '../../src/logic/boardSession';
import { CONSENT_DECLINED, RUNS_UNAVAILABLE, type RunsHandle } from '../../src/logic/runs';
import { FakeRunManager, FakeWorkspace, RecordingPorts, sampleRun } from './fakes';

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
/** Slice 2h: a one-inference Formalize start (M2's `startRun` is retired), with its request id. */
const formalizeStart = (requestId: string, inference: { target: string; premises: string[] } = START) => message('formalize', { inferences: [inference], requestId });
/** What the RunManager's `formalize` gets for such a start. */
const started = (inference: { target: string; premises: string[] } = START) => [{ subject: 'Spyro', inferences: [inference] }];

describe('routing run messages (AT5.1)', () => {
  it('every run message reaches the RunManager method of the same meaning, with the board\'s subject for a start', async () => {
    const answers = [{ question: 0, choice: { kind: 'option', option: 0 }, scope: 'run' }];
    const sent: Array<[string, Record<string, unknown>]> = [
      ['answerQuestions', { runId: 'r1', setId: 'q1', answers, requestId: 'q-answer' }],
      ['cancelRun', { runId: 'r1', requestId: 'q-cancel' }],
      ['resumeRun', { runId: 'r1', requestId: 'q-resume' }],
      ['dismissRun', { runId: 'r1' }],
      // Slice 2d: Formalize (a start, and mid-stage) and Retry step.
      ['formalize', { inferences: [START], requestId: 'q-formalize' }],
      ['formalize', { inferences: [{ target: 'cynder-not-good', premises: ['cynder-dark-past'] }], runId: 'r1', stage: 2, requestId: 'q-formalize2' }],
      ['retryStep', { runId: 'r1', requestId: 'q-retry' }],
    ];
    for (const [type, payload] of sent) await session.handle(message(type, payload));
    expect(runs.calls.map((c) => [c.method, c.args])).toEqual([
      ['answer', ['r1', 'q1', answers]],
      ['cancel', ['r1']],
      ['resume', ['r1']],
      ['dismiss', ['r1']],
      ['formalize', [{ subject: 'Spyro', inferences: [START] }]],
      ['formalize', [{ subject: 'Spyro', inferences: [{ target: 'cynder-not-good', premises: ['cynder-dark-past'] }], runId: 'r1', stage: 2 }]],
      ['retry', ['r1']],
    ]);
    // Every routed type is one of core's run messages, and each of them is covered here, or (slice 2) is an edit
    // session's message routed below (2e, 2f). Slice 2h: M2's review messages are no run messages any more.
    expect(new Set([...sent.map(([type]) => type), ...SESSION_MESSAGE_TYPES])).toEqual(new Set(RUN_MESSAGE_TYPES));
    expect(ws.performed).toEqual([]); // the board never declares premises itself (the RunManager does, after preflight)
  });

  it('slice 2e: the review actions reach the RunManager method of the same meaning, `confirmed` false when absent; 2f: the end (Apply, Back to review, Exit) and the moves too', async () => {
    const decisions = [{ item: 'it0123456789abcdef', rev: 1, to: 'declined', option: 'shaky', note: 'ask me' }];
    const routed: Array<[string, Record<string, unknown>]> = [
      ['decideItems', { runId: 'r1', stage: 1, own: false, decisions }],
      ['decideItems', { runId: 'r1', stage: 1, own: true, decisions: [{ item: 'it0123456789abcdef', rev: 2, to: 'accepted' }], confirmed: true }],
      ['revealResult', { runId: 'r1', stage: 1, via: 'show-result' }],
      ['revealResult', { runId: 'r1', stage: 1, via: 'activity' }],
      ['sessionUndo', { runId: 'r1', step: 3 }],
      ['sessionUndo', { runId: 'r1', step: 3, confirmed: true }],
      ['sessionRedo', { runId: 'r1', step: 4 }],
      ['submitReview', { runId: 'r1', stage: 1 }],
      // 2j2 (D2-92): Submit's comment, passed on.
      ['submitReview', { runId: 'r1', stage: 1, comment: 'Prefer the rule reading.\nKeep the names.' }],
      ['openSessionDiff', { runId: 'r1', stage: 1 }],
      ['openSessionDiff', { runId: 'r1', stage: 1, confirmed: true }],
    ];
    for (const [type, payload] of routed) await session.handle(message(type, { ...payload, requestId: `q-${type}` }));
    expect(runs.calls.map((c) => [c.method, c.args])).toEqual([
      ['decide', ['r1', 1, false, decisions, false]],
      ['decide', ['r1', 1, true, [{ item: 'it0123456789abcdef', rev: 2, to: 'accepted' }], true]],
      ['reveal', ['r1', 1, 'show-result']],
      ['reveal', ['r1', 1, 'activity']],
      ['undoSession', ['r1', 3, false]],
      ['undoSession', ['r1', 3, true]],
      ['redoSession', ['r1', 4, false]],
      ['submit', ['r1', 1]],
      ['submit', ['r1', 1, 'Prefer the rule reading.\nKeep the names.']],
      ['sessionDiff', ['r1', 1, false]],
      ['sessionDiff', ['r1', 1, true]],
    ]);
    // 2f routes the end and the moves, each to the RunManager method of the same meaning, its answer passed back as it is.
    runs.calls = [];
    ports.clear();
    const later: Array<[string, Record<string, unknown>]> = [
      ['endSession', { runId: 'r1', decision: 'apply', stage: 2, check: 'ck0123456789abcdef' }],
      ['endSession', { runId: 'r1', decision: 'back', stage: 2 }],
      ['endSession', { runId: 'r1', decision: 'exit' }],
      ['moveProposed', { runId: 'r1', positions: { 'cynder-not-good': { x: 10, y: 20 } } }],
      // 2j2 (D2-92, D2-95): the note on an item to be redone.
      ['noteItem', { runId: 'r1', stage: 2, item: 'it0123456789abcdef', rev: 3, note: 'Keep it as a rule.' }],
    ];
    expect(new Set([...routed.map(([type]) => type), ...later.map(([type]) => type)])).toEqual(new Set(SESSION_MESSAGE_TYPES.filter((t) => t !== 'formalize' && t !== 'retryStep')));
    for (const [type, payload] of later) await session.handle(message(type, { ...payload, requestId: `q-${type}-${String(payload['decision'] ?? '')}` }));
    expect(runs.calls.map((c) => [c.method, c.args])).toEqual([
      ['end', ['r1', 'apply', 2, 'ck0123456789abcdef']],
      ['end', ['r1', 'back', 2, undefined]],
      ['end', ['r1', 'exit', undefined, undefined]],
      ['moveProposed', ['r1', { 'cynder-not-good': { x: 10, y: 20 } }]],
      ['note', ['r1', 2, 'it0123456789abcdef', 3, 'Keep it as a rule.']],
    ]);
    expect(ports.of('actionResult').map((m) => m.payload.outcome)).toEqual([
      { ok: true, label: 'did end', undoable: false },
      { ok: true, label: 'did end', undoable: false },
      { ok: true, label: 'did end', undoable: false },
      { ok: true, label: 'did moveProposed', undoable: false },
      { ok: true, label: 'did note', undoable: false },
    ]);
    expect(ws.performed).toEqual([]);
  });

  it('slice 2f: an Apply\'s success is a toast with Undo (it changed the files), and the board republishes; a refused Apply passes its answer back', async () => {
    runs.outcome = (method, args) =>
      method === 'end' && args[1] === 'apply' ? { ok: true, label: 'Apply: Formalize for dependencies → Cynder', undoable: true } : { ok: false, code: 'conflict', error: 'Your files changed since the session started.' };
    await session.handle(message('endSession', { runId: 'r1', decision: 'apply', stage: 1, check: 'ck0123456789abcdef', requestId: 'a1' }));
    expect(ports.of('actionResult')[0]?.payload.outcome).toEqual({ ok: true, label: 'Apply: Formalize for dependencies → Cynder', undoable: true });
    expect(ports.of('notice').map((m) => m.payload)).toEqual([expect.objectContaining({ level: 'info', text: 'Apply: Formalize for dependencies → Cynder', undoable: true })]);
    ports.clear();
    await session.handle(message('endSession', { runId: 'r1', decision: 'back', stage: 1, requestId: 'b1' }));
    expect(ports.of('actionResult')[0]?.payload.outcome).toEqual({ ok: false, code: 'conflict', error: 'Your files changed since the session started.' });
  });

  it('slice 2e: the RunManager\'s answers go back as they are (a refusal while a step runs, a `needs-confirmation` with its cascade), never the lock or busy refusal; without a request id a refusal is a warning toast', async () => {
    runs.run = sampleRun({ state: 'working' }); // a step of the root's run is working: the board is locked (ES-9)
    const cascade: CascadeEntry[] = [{ item: 'it00000000000000aa', to: 'in-review', why: 'it rests on this' }];
    runs.outcome = (method): ActionOutcome =>
      method === 'decide'
        ? { ok: false, code: 'needs-confirmation', error: REVIEW_TEXTS.cascadeBackToReview, cascade }
        : { ok: false, code: 'refused', error: REVIEW_TEXTS.stepRunning };
    await session.handle(message('decideItems', { runId: 'r1', stage: 1, own: true, decisions: [{ item: 'it0123456789abcdef', rev: 1, to: 'in-review' }], requestId: 'q1' }));
    await session.handle(message('revealResult', { runId: 'r1', stage: 1, via: 'show-result', requestId: 'q2' }));
    expect(ports.of('actionResult').map((m) => m.payload)).toEqual([
      { requestId: 'q1', outcome: { ok: false, code: 'needs-confirmation', error: REVIEW_TEXTS.cascadeBackToReview, cascade } },
      { requestId: 'q2', outcome: { ok: false, code: 'refused', error: REVIEW_TEXTS.stepRunning } },
    ]);
    expect(ports.of('notice')).toEqual([]);
    await session.handle(message('submitReview', { runId: 'r1', stage: 1 }));
    expect(ports.of('notice').map((m) => m.payload)).toEqual([expect.objectContaining({ level: 'warning', text: REVIEW_TEXTS.stepRunning, undoable: false })]);
    expect(runs.calls.map((c) => c.method)).toEqual(['decide', 'reveal', 'submit']);
    expect(ws.performed).toEqual([]);
  });

  it('slice 2e: Submit review\'s success is a toast, as Formalize\'s and Retry\'s; a decision\'s is not (the review list shows it)', async () => {
    runs.outcome = (method) => ({ ok: true, label: `label of ${method}`, undoable: false });
    await session.handle(message('decideItems', { runId: 'r1', stage: 1, own: true, decisions: [{ item: 'it0123456789abcdef', rev: 1, to: 'accepted' }], requestId: 'd1' }));
    await session.handle(message('revealResult', { runId: 'r1', stage: 1, via: 'show-result', requestId: 'v1' }));
    expect(ports.of('notice')).toEqual([]);
    await session.handle(message('submitReview', { runId: 'r1', stage: 1, requestId: 's1' }));
    expect(ports.of('notice').map((m) => m.payload)).toEqual([expect.objectContaining({ level: 'info', text: 'label of submit', undoable: false })]);
  });

  it('outcomes become actionResult; successes that change the board also get a toast (Undo only after an Apply)', async () => {
    runs.outcome = (method) => ({ ok: true, label: `label of ${method}`, undoable: method === 'end' || method === 'formalize' });
    await session.handle(formalizeStart('s1'));
    await session.handle(message('endSession', { runId: 'r1', decision: 'apply', stage: 1, check: 'ck0123456789abcdef', requestId: 'a1' }));
    await session.handle(message('answerQuestions', { runId: 'r1', setId: 'q1', answers: [{ question: 0, choice: { kind: 'leave-open' }, scope: 'run' }], requestId: 'n1' }));
    expect(ports.of('actionResult').map((m) => m.payload)).toEqual([
      { requestId: 's1', outcome: { ok: true, label: 'label of formalize', undoable: true } },
      { requestId: 'a1', outcome: { ok: true, label: 'label of end', undoable: true } },
      { requestId: 'n1', outcome: { ok: true, label: 'label of answer', undoable: false } },
    ]);
    expect(ports.of('notice').map((m) => [m.payload.text, m.payload.undoable])).toEqual([
      ['label of formalize', false], // a start changes no file: no Undo button
      ['label of end', true], // one Apply = one undoable step
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
    await session.handle(message('retryStep', { runId: 'r1', requestId: 'd1' }));
    expect(ports.of('actionResult')[0]?.payload.outcome).toEqual({ ok: false, code: 'internal', error: 'boom' });
  });

  it('run messages are handled one at a time in arrival order, and never hold back board messages', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    runs.outcome = async (method) => {
      if (method === 'formalize') await held;
      return { ok: true, label: method, undoable: false };
    };
    const start = session.handle(formalizeStart('s1'));
    const feedback = session.handle(message('retryStep', { runId: 'r1', requestId: 'f1' }));
    const dismiss = session.handle(message('dismissRun', { runId: 'r0' }));
    await sleep(10);
    expect(runs.calls.map((c) => c.method)).toEqual(['formalize']); // the others wait for the start, in order
    // A board message does not wait for the run start: it is answered at once. Slice 1f (ES-9): an edit sent while
    // the start is on its way is refused (before 1f it was applied); selecting a subject still works.
    await session.handle(message('addNode', { clientId: 'tmp', type: 'AXIOM', naturalName: 'Cynder can fly', requestId: 'e1' }));
    expect(ws.performed).toEqual([]);
    expect(ports.of('actionResult')[0]?.payload).toEqual({ requestId: 'e1', outcome: { ok: false, code: 'conflict', error: EDIT_SESSION_ACTIVE } });
    await session.handle(message('selectSubject', { subject: 'Spyro' }));
    release();
    await Promise.all([start, feedback, dismiss]);
    expect(runs.calls.map((c) => c.method)).toEqual(['formalize', 'retry', 'dismiss']);
    expect(ports.of('actionResult').map((m) => m.payload.requestId)).toEqual(['e1', 's1', 'f1']);
  });

  it('Cancel does not wait in the queue: it reaches a start that is still waiting for Lean', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    runs.outcome = async (method) => {
      if (method === 'formalize') await held;
      return { ok: true, label: method, undoable: false };
    };
    const start = session.handle(formalizeStart('s1'));
    await sleep(5);
    runs.run = sampleRun({ state: 'starting' }); // the board shows the run being started (e.g. its base check)
    await session.handle(message('cancelRun', { runId: 'r1', requestId: 'c1' }));
    expect(runs.calls.map((c) => c.method)).toEqual(['formalize', 'cancel']);
    expect(ports.of('actionResult').map((m) => m.payload.requestId)).toEqual(['c1']); // answered while the start waits
    release();
    await start;
    expect(ports.of('actionResult').map((m) => m.payload.requestId)).toEqual(['c1', 's1']);
  });

  it('runs that are unavailable answer not-yet with the reason (the raw diff too)', async () => {
    session = makeSession({ unavailable: 'Claude runs are not available: no storage folder' });
    await session.handle(formalizeStart('s1'));
    expect(ports.of('actionResult')[0]?.payload.outcome).toEqual({ ok: false, code: 'not-yet', error: 'Claude runs are not available: no storage folder' });
    await session.handle(message('openSessionDiff', { runId: 'r1', stage: 1, requestId: 'd1' }));
    expect(ports.of('actionResult')[1]?.payload.outcome).toEqual({ ok: false, code: 'not-yet', error: 'Claude runs are not available: no storage folder' });
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

describe('posting the run and the session (AT5.1; slice 2h: no proposal any more)', () => {
  it('"ready" posts the workspace and graph, then the run and (slice 2d) the session; never a proposal', async () => {
    runs.run = sampleRun({ state: 'review' });
    await session.handle(message('ready', { lastVersion: null }));
    expect(ports.posts.map((p) => p.type)).toEqual(['workspace', 'graph', 'run', 'session']);
    expect(ports.of('session')[0]?.payload.session).toBeNull(); // not an edit session
    expect(ports.of('run')[0]?.payload.run).toEqual(runs.run);
  });

  it('with no run, "ready" posts run null and session null (the board clears a stale one)', async () => {
    await session.handle(message('ready', { lastVersion: null }));
    expect(ports.of('run').map((m) => m.payload.run)).toEqual([null]);
    expect(ports.of('session').map((m) => m.payload.session)).toEqual([null]);
  });

  it('posts what changed on every RunManager change, also for another subject\'s run', async () => {
    runs.run = sampleRun({ subject: 'Bayonetta', target: 'bayonetta-goal', state: 'working' });
    runs.fire({ run: true, proposal: false , session: false });
    await sleep(0);
    expect(ports.posts.map((p) => p.type)).toEqual(['run']);
    expect(ports.of('run')[0]?.payload.run?.subject).toBe('Bayonetta'); // the Spyro board still gets it (compact line)

    // Slice 2h: a change that names only the proposal (the runner's emitters still set the flag) posts nothing.
    ports.clear();
    runs.fire({ run: false, proposal: true , session: false });
    await sleep(0);
    expect(ports.posts).toEqual([]);
    runs.fire({ run: false, proposal: false, session: true });
    await sleep(0);
    expect(ports.posts.map((p) => p.type)).toEqual(['session']);
  });

  it('after a run message the run and (slice 2d) the session are posted again (the panel follows even before the change event)', async () => {
    runs.run = sampleRun({ state: 'cancelled' });
    await session.handle(message('cancelRun', { runId: 'r1', requestId: 'c1' }));
    expect(ports.posts.map((p) => p.type)).toEqual(['actionResult', 'notice', 'run', 'session']);
  });

  it('a Formalize start (slice 2d) and an Apply (files changed, 2f) also republish the workspace and graph', async () => {
    await session.handle(message('formalize', { inferences: [START], requestId: 'f1' }));
    expect(ports.posts.map((p) => p.type)).toEqual(['actionResult', 'notice', 'run', 'session', 'workspace', 'graph']);
    ports.clear();
    await session.handle(message('endSession', { runId: 'r1', decision: 'apply', stage: 1, check: 'ck0123456789abcdef', requestId: 'a1' }));
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

  it('2k1 (D2-100 D1): the change that ends a session posts the ended run, then `session: null`; so does the republish after an Exit', async () => {
    const view = { runId: 'r1', subject: 'Spyro', stage: 1, phase: 'stage', items: [], inferences: [], steps: [], board: { graph: { nodes: [], edges: [] } } } as unknown as NonNullable<FakeRunManager['currentSession']>;
    const inSession = { session: { stage: 1, phase: 'stage' as const } };
    runs.run = sampleRun({ state: 'review', ...inSession });
    runs.currentSession = view;
    await session.handle(message('ready', { lastVersion: null }));
    expect(ports.of('session').map((m) => m.payload.session)).toEqual([view]);
    // The runner's end: run.json says discarded and session() is null; its change names the run and the session.
    ports.clear();
    runs.run = sampleRun({ state: 'discarded', ...inSession });
    runs.currentSession = null;
    runs.fire({ run: true, proposal: true, session: true });
    await sleep(5);
    expect(ports.posts.map((p) => p.type)).toEqual(['run', 'session']);
    expect(ports.of('run')[0]?.payload.run?.state).toBe('discarded');
    expect(ports.of('session')[0]?.payload.session).toBeNull();
    // Exit through the board: the RunManager ends the session, and the host's republish after it says the same.
    runs.run = sampleRun({ state: 'review', ...inSession });
    runs.currentSession = view;
    runs.outcome = (method) => {
      if (method === 'end') {
        runs.run = sampleRun({ state: 'discarded', ...inSession });
        runs.currentSession = null;
      }
      return { ok: true, label: 'Session ended', undoable: false };
    };
    ports.clear();
    await session.handle(message('endSession', { runId: 'r1', decision: 'exit', requestId: 'x1' }));
    expect(runs.callsOf('end')).toEqual([['r1', 'exit', undefined, undefined]]);
    const order = ports.posts.map((p) => p.type).filter((t) => t === 'run' || t === 'session');
    expect(order).toEqual(['run', 'session']);
    expect(ports.of('run').at(-1)?.payload.run?.state).toBe('discarded');
    expect(ports.of('session').at(-1)?.payload.session).toBeNull();
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

describe('a Formalize start: the start\'s check (spec v4.1 Formalize for dependencies, docs/slice1-plan.md 2.5; slice 1e; since 2h through `formalize`)', () => {
  const refusal = () => ports.of('actionResult')[0]?.payload.outcome;

  it('a premise without an arrow drawn into the target: "Draw the arrows first.", before the consent question', async () => {
    withGraph({ 'cynder-not-good': { premises: ['cynder-dark-past'] } });
    await session.handle(formalizeStart('s1', { target: 'cynder-not-good', premises: ['cynder-dark-past', 'new-spyro-pg'] }));
    expect(refusal()).toEqual({ ok: false, code: 'invalid', error: FORMALIZE_START_TEXTS.drawFirst });
    expect(ports.consentAsked).toBe(0);
    expect(runs.callsOf('formalize')).toEqual([]);
    expect(ws.performed).toEqual([]);
  });

  it('no premises for a target without the "follows from nothing" mark: "Select arrows into one card."', async () => {
    await session.handle(formalizeStart('s1', { target: 'cynder-not-good', premises: [] }));
    expect(refusal()).toEqual({ ok: false, code: 'invalid', error: 'Select arrows into one card.' });
    expect(runs.callsOf('formalize')).toEqual([]);
  });

  it('AR-8: a proposition premise with neither a proof nor a pending claim must be marked pending first', async () => {
    const target = spyroGraph().nodes.find((n) => n.id === 'cynder-not-good') as TlNode;
    const { justification: _j, justificationKind: _k, ...lean } = target.lean;
    void _j;
    void _k;
    const lemma: TlNode = { ...target, id: 'l-card', naturalName: 'L is unproved', premises: [], lean: { ...lean, statement: 'Spyro.l_card' } };
    withGraph({ 'cynder-not-good': { premises: ['cynder-dark-past', 'l-card'] } }, [lemma]);
    await session.handle(formalizeStart('s1', { target: 'cynder-not-good', premises: ['l-card'] }));
    expect(refusal()).toEqual({ ok: false, code: 'invalid', error: '“L is unproved” is not proved: mark it pending first.' });
    expect(runs.callsOf('formalize')).toEqual([]);
  });

  it('a target on a cycle of arrows is refused, naming the cycle (AP-13)', async () => {
    withGraph({ 'cynder-dark-past': { type: 'PROPOSITION', premises: ['cynder-not-good'] } });
    await session.handle(formalizeStart('s1'));
    const outcome = refusal();
    expect(outcome).toMatchObject({ ok: false, code: 'invalid' });
    expect(outcome?.ok === false ? outcome.error : '').toMatch(/^This card is on a cycle of arrows \(Cynder would not be a good addition to … → Cynder is a character who has a dark pa… → Cynder would not be a good addition to …\): remove one arrow first\.$/);
    expect(runs.callsOf('formalize')).toEqual([]);
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
    const starting = session.handle(formalizeStart('s1', { target: 'cynder-not-good', premises: ['cynder-dark-past', 'new-spyro-pg'] }));
    await sleep(5);
    release();
    await Promise.all([drawing, starting]);
    expect(ports.of('actionResult').map((m) => [m.payload.requestId, m.payload.outcome.ok])).toEqual([
      ['a1', true],
      ['s1', true],
    ]);
    expect(runs.callsOf('formalize')).toEqual([started({ target: 'cynder-not-good', premises: ['cynder-dark-past', 'new-spyro-pg'] })]);
  });
});

describe('a Formalize start: busy check and egress consent (AT5.2; since 2h through `formalize`)', () => {
  it('asks for consent, then calls formalize with the board\'s subject and the inference (never perform)', async () => {
    await session.handle(formalizeStart('s1'));
    expect(ports.consentAsked).toBe(1);
    expect(runs.callsOf('formalize')).toEqual([started()]);
    expect(ws.performed).toEqual([]);
  });

  it('a "follows from nothing" mark as the question (no premises) starts a session with an empty selection (slice 1e)', async () => {
    withGraph({ 'cynder-not-good': { premises: [], fromNothing: true } });
    await session.handle(formalizeStart('s0', { target: 'cynder-not-good', premises: [] }));
    expect(runs.callsOf('formalize')).toEqual([started({ target: 'cynder-not-good', premises: [] })]);
  });

  it('declined consent: nothing is started or declared, and the refusal says why', async () => {
    ports.consentAnswer = false;
    await session.handle(formalizeStart('s1'));
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
      await session.handle(formalizeStart(`s-${state}`));
      const outcome = ports.of('actionResult')[0]?.payload.outcome;
      expect(outcome?.ok, state).toBe(false);
      if (outcome?.ok !== false) continue;
      expect(outcome.code, state).toBe('conflict');
      expect(outcome.error, state).toContain('"Bayonetta"');
    }
    expect(ports.consentAsked).toBe(0);
    expect(runs.callsOf('formalize')).toEqual([]);
  });

  it('an ended run does not block a new start', async () => {
    for (const state of ['accepted', 'discarded', 'cancelled', 'failed'] as const) {
      runs.run = sampleRun({ state });
      await session.handle(formalizeStart(`s-${state}`));
    }
    expect(runs.callsOf('formalize')).toHaveLength(4);
  });

  it('the RunManager\'s own busy refusal (a start that raced another) is passed on as conflict', async () => {
    runs.outcome = { ok: false, code: 'conflict', error: 'Another run of this model is active.' };
    await session.handle(formalizeStart('s1'));
    expect(ports.of('actionResult')[0]?.payload.outcome).toEqual(runs.outcome);
  });

  it('a model without a subject cannot start a run', async () => {
    ws.subjectList = [];
    session = makeSession();
    await session.handle(formalizeStart('s1'));
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
    const starting = session.handle(formalizeStart('s1'));
    await sleep(5);
    await session.handle(message('selectSubject', { subject: 'Bayonetta' })); // switched while the modal was open
    answer(true);
    await starting;
    expect(runs.callsOf('formalize')).toEqual([started()]);
  });
});

describe('openSessionDiff (slice 2e, docs/slice2-plan.md 2.4; fake ports)', () => {
  const FILES = [
    { path: 'Model/Spyro/Main.lean', before: 'abbrev a : Prop := True\n', after: 'abbrev a : Prop := True\ntheorem a.holds : a := trivial\n' },
    { path: 'Model/Spyro/Lemmas.lean', before: null, after: 'namespace Spyro\nend Spyro\n' },
  ];

  it('while the results are hidden the RunManager\'s `needs-confirmation` with `reveal` goes back as it is, and no diff opens', async () => {
    const ask = { ok: false as const, code: 'needs-confirmation' as const, error: REVIEW_TEXTS.rawDiffReveals, reveal: true as const };
    runs.outcome = ask;
    runs.sessionDiffFiles = FILES;
    await session.handle(message('openSessionDiff', { runId: 'r1', stage: 2, requestId: 'd1' }));
    expect(runs.callsOf('sessionDiff')).toEqual([['r1', 2, false]]);
    expect(ports.of('actionResult').map((m) => m.payload)).toEqual([{ requestId: 'd1', outcome: ask }]);
    expect(ports.proposalDiffs).toEqual([]);
  });

  it('confirmed (or shown), the session\'s files open beside the board, titled by subject; focused on one file; no change is an info toast', async () => {
    runs.sessionDiffFiles = FILES;
    await session.handle(message('openSessionDiff', { runId: 'r1', stage: 2, confirmed: true, requestId: 'd1' }));
    expect(runs.callsOf('sessionDiff')).toEqual([['r1', 2, true]]);
    expect(ports.proposalDiffs).toEqual([{ runId: 'r1', proposalId: 'stage-2', title: 'Raw Lean diff: Spyro', files: FILES }]);
    expect(ports.of('actionResult')[0]?.payload).toEqual({ requestId: 'd1', outcome: { ok: true, label: 'Raw Lean diff: Spyro', undoable: false } });
    await session.handle(message('openSessionDiff', { runId: 'r1', stage: 2, file: 'Model/Spyro/Lemmas.lean', requestId: 'd2' }));
    expect(ports.proposalDiffs[1]).toEqual({ runId: 'r1', proposalId: 'stage-2', title: 'Raw Lean diff: Lemmas.lean', files: [FILES[1]] });
    await session.handle(message('openSessionDiff', { runId: 'r1', stage: 2, file: 'Model/Spyro/Vocabulary.lean', requestId: 'd3' }));
    expect(ports.of('notice').at(-1)?.payload).toMatchObject({ level: 'info', text: 'This session does not change Model/Spyro/Vocabulary.lean.' });
    runs.sessionDiffFiles = [];
    await session.handle(message('openSessionDiff', { runId: 'r1', stage: 2, requestId: 'd4' }));
    expect(ports.of('notice').at(-1)?.payload).toMatchObject({ level: 'info', text: 'This session changes no files.' });
    expect(ports.proposalDiffs).toHaveLength(2);
  });

  it('a diff that cannot be shown is refused `internal`, with why', async () => {
    runs.sessionDiffFiles = FILES;
    ports.showProposalDiff = async () => {
      throw new Error('no editor');
    };
    await session.handle(message('openSessionDiff', { runId: 'r1', stage: 2, confirmed: true, requestId: 'd1' }));
    expect(ports.of('actionResult')[0]?.payload.outcome).toEqual({ ok: false, code: 'internal', error: 'Could not open the raw Lean diff: no editor' });
  });
});

// Slice 2h: M2's openProposalDiff is retired; the session's raw diff (openSessionDiff, above) covers the diff's ports.

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

  it('AF14 (2f): endSession with exit is not queued: it reaches the RunManager, and stops the step, while another run message waits in the run queue; Apply and Back to review are queued', async () => {
    let release: () => void = () => undefined;
    runs.outcome = (method) =>
      method === 'retry' ? new Promise((resolve) => (release = () => resolve({ ok: true, label: 'retried', undoable: false }))) : { ok: true, label: `did ${method}`, undoable: false };
    const retrying = session.handle(message('retryStep', { runId: 'r1', requestId: 'retry' }));
    await sleep(5);
    const back = session.handle(message('endSession', { runId: 'r1', decision: 'back', stage: 1, requestId: 'back' }));
    await sleep(5);
    await session.handle(message('endSession', { runId: 'r1', decision: 'exit', requestId: 'exit' }));
    // Exit reached the manager past the waiting retry; Back to review still waits behind it in the run queue.
    expect(runs.calls.map((c) => [c.method, c.args[1]])).toEqual([
      ['retry', undefined],
      ['end', 'exit'],
    ]);
    release();
    await retrying;
    await back;
    expect(runs.calls.map((c) => [c.method, c.args[1]])).toEqual([
      ['retry', undefined],
      ['end', 'exit'],
      ['end', 'back'],
    ]);
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
