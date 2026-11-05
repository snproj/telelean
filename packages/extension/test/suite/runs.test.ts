/**
 * AT5.8 (and AT5.9 in VS Code): a "These suffice" run through the real extension, runner workspace, RunManager, Lean
 * check engine, proposal service and sidecar store, on a fresh COPY of mental_model/ that scripts/smoke.mjs placed at
 * $TELELEAN_RUNS_ROOT (outside the window's workspace folder). Claude is the FakeBackend with the normative-reading
 * script of docs/m2-plan.md section 10.2, installed through the testing API (real Claude is disabled in Test mode, and
 * TELELEAN_NO_REAL_CLAUDE=1 is set for the instance by .vscode-test.mjs).
 *
 *   open the board, initialize git, refresh -> startRun from the board (consent answered by the testing API) -> the
 *   modality question arrives -> answered through simulateBoardMessage (Claude's guess revealed only now) -> the gate
 *   passes, a proved proposal with the G->D lifecycle item arrives, the real files are untouched -> the raw Lean diff
 *   opens -> Accept: Main.lean changes on disk, one history entry, Undo restores it byte-exactly -> a second run
 *   waits for an answer; the window "reloads" (testing.disposeWorkspace) and the restored board shows the question
 *   again -> Cancel -> a third run is working when the window goes: restored as interrupted (Resume offered), its
 *   session was closed -> Stop.
 *
 * (Gated on WP1-WP4 while the builders worked in parallel; the integrator removed the gate and runs it.)
 */
import * as assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

import type { ActionOutcome, HistoryListing, ProposalView, RunView, TlGraph } from '@telelean/core';
import { FakeBackend, type FakeStep } from '@telelean/runner/llm/fake.js';
import type { BackendCaps, LlmBackend, LlmEvent, LlmSession, SessionConfig } from '@telelean/runner/llm/types.js';

import type { OpenBoardResult, TeleleanApi } from '../../src/api';
import { closeAllEditors, closeTextEditors, getApi, message, nextPost, settleEditors, sleep, waitFor } from './helpers';

const LEAN_TIMEOUT_MS = 240_000;
const RUNS_ROOT = process.env.TELELEAN_RUNS_ROOT;
const MAIN = 'Model/Spyro/Main.lean';
const TARGET = 'cynder-not-good';
const PREMISES = ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'];

/** Reading A (normative), round 1, as in docs/m2-plan.md section 10.2 (edits that apply to a copy of mental_model/). */
const NORMATIVE: FakeStep[][] = [
  [
    { kind: 'read', path: MAIN },
    {
      kind: 'callTool',
      tool: 'ask_user',
      args: {
        questions: [
          {
            phenomenon: 'modality',
            question:
              'Does "cannot have" state a rule about what PG games should not include (normative), or that a PG game is unable to contain such a character (literal)?',
            options: [
              { label: 'A rule (normative)', consequence: 'A PG game with such a character breaks the rule; it says nothing about what the game contains.' },
              { label: 'Impossible (literal)', consequence: 'No PG game contains a character with a dark past at all.' },
            ],
            claudesGuess: { option: 0 },
            affectedNodes: ['pg-no-dark-past'],
          },
        ],
      },
    },
    {
      kind: 'edit',
      path: MAIN,
      oldString: 'stance: rule\nasserted: 2026-11-01\n-/\n\n',
      newString:
        'stance: rule\nasserted: 2026-11-01\n-/\n/-- PG games cannot have characters with dark pasts -/\nabbrev pg_no_dark_past : Prop := ∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ GoodAddition c g\naxiom pg_no_dark_past.holds : pg_no_dark_past\n\n',
    },
    { kind: 'callTool', tool: 'check_lean', args: {} },
    { kind: 'callTool', tool: 'freeze_statements', args: { targets: [TARGET] } },
    {
      kind: 'edit',
      path: MAIN,
      oldString: 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n',
      newString:
        'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\ntheorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n',
    },
    { kind: 'callTool', tool: 'check_lean', args: {} },
    { kind: 'callTool', tool: 'finish', args: { status: 'proved', summary: 'Proved from the three premises under the normative reading.', assumed_without_asking: [] } },
    { kind: 'result' },
  ],
];

/** A session whose turn never ends on its own (the run stays `working` until it is interrupted or closed). */
class HangingSession implements LlmSession {
  readonly sessionId: string;
  closed = false;
  private release: (() => void) | undefined;
  private readonly listeners = new Set<(event: LlmEvent) => void>();
  constructor(private readonly cfg: SessionConfig) {
    this.sessionId = cfg.resumeSessionId ?? cfg.sessionId ?? randomUUID();
  }
  async *send(): AsyncGenerator<LlmEvent> {
    yield this.emit({ type: 'init', sessionId: this.sessionId, model: this.cfg.model, tools: [], mcpServers: [{ name: 'telelean', status: 'connected' }], apiKeySource: 'none' });
    await new Promise<void>((resolve) => {
      this.release = resolve;
      if (this.closed) resolve();
    });
    yield this.emit({
      type: 'result',
      status: 'interrupted',
      isError: true,
      sessionId: this.sessionId,
      numTurns: 1,
      durationMs: 1,
      usage: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
      costEstimateUsd: 0,
      modelUsage: {},
      permissionDenials: [],
      errors: [],
    });
  }
  async interrupt(): Promise<void> {
    this.release?.();
  }
  async close(): Promise<void> {
    this.closed = true;
    this.release?.();
  }
  onEvent(listener: (event: LlmEvent) => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
  private emit(event: LlmEvent): LlmEvent {
    for (const listener of this.listeners) listener(event);
    return event;
  }
}

class HangingBackend implements LlmBackend {
  readonly id = 'fake' as const;
  readonly caps: BackendCaps = { builtinFileTools: true, subscriptionAuth: false, resume: true, interrupt: true };
  readonly sessions: HangingSession[] = [];
  async startSession(cfg: SessionConfig): Promise<LlmSession> {
    const session = new HangingSession(cfg);
    this.sessions.push(session);
    return session;
  }
}

/**
 * The backend the testing API installs once: the RunManager keeps the backend its factory returned, so the suite
 * switches what sessions it starts (the normative FakeBackend, or the hanging one for AT5.9) instead of the factory.
 */
class SwitchingBackend implements LlmBackend {
  readonly id = 'fake' as const;
  readonly caps: BackendCaps = { builtinFileTools: true, subscriptionAuth: false, resume: true, interrupt: true };
  constructor(public current: LlmBackend) {}
  startSession(cfg: SessionConfig): Promise<LlmSession> {
    return this.current.startSession(cfg);
  }
}

suite('a Claude run through the board (FakeBackend; AT5.8, AT5.9)', () => {
  let api: TeleleanApi;
  let root: string;
  let latestGraph: TlGraph | undefined;
  let latestRun: RunView | null | undefined;
  let latestProposal: ProposalView | null | undefined;
  let subscription: vscode.Disposable | undefined;
  let restoreBackend: (() => void) | undefined;
  let mainBefore = '';
  let runId = '';
  let setId = '';
  let proposal: ProposalView | undefined;
  const normative = new FakeBackend(NORMATIVE);
  const backend = new SwitchingBackend(normative);

  const read = (file: string) => readFileSync(path.join(root, ...file.split('/')), 'utf8');
  /** The latest run posted (read through a function: assertions after a reset must not see a narrowed type). */
  const runNow = (): RunView | null | undefined => latestRun;

  async function request(type: string, payload: Record<string, unknown>): Promise<ActionOutcome> {
    const requestId = String(payload.requestId);
    const result = nextPost(api, (e) => e.root === root && e.message.type === 'actionResult' && e.message.payload.requestId === requestId, LEAN_TIMEOUT_MS, `actionResult ${requestId}`);
    await api.simulateBoardMessage(root, message(type, payload));
    const event = await result;
    assert.ok(event.message.type === 'actionResult');
    return event.message.payload.outcome;
  }

  /** dismissRun has no request id (docs/m2-plan.md section 6.3), so no actionResult answers it: wait for the run to go. */
  async function dismiss(id: string): Promise<void> {
    await api.simulateBoardMessage(root, message('dismissRun', { runId: id }));
    await waitFor(() => runNow() === null, 10_000, 'the dismissed run to leave the board');
  }

  /** Restores the board as VS Code would after a reload (the serializer path), on a fresh panel. */
  async function restoreBoard(): Promise<void> {
    const panel = vscode.window.createWebviewPanel('telelean.board', `telelean: ${path.basename(root)}`, vscode.ViewColumn.Active, { enableScripts: true });
    await api.restoreBoard(panel, { root });
    await waitFor(() => api.boardFor(root)?.panel === panel && api.boardFor(root)?.subject === 'Spyro', 30_000, 'the restored board on subject Spyro');
  }

  suiteSetup(async function () {
    this.timeout(60_000);
    assert.ok(RUNS_ROOT, 'TELELEAN_RUNS_ROOT is not set: run the smoke tests with npm run test:smoke (scripts/smoke.mjs)');
    // Quota tripwire 1 (docs/m2-plan.md section 10.4), as the extension host sees it.
    assert.equal(process.env.TELELEAN_NO_REAL_CLAUDE, '1', 'the test instance must run with TELELEAN_NO_REAL_CLAUDE=1');
    root = RUNS_ROOT;
    api = await getApi();
    assert.ok(api.testing, 'the test API exists in Test mode');
    await api.testing.reset();
    await settleEditors();
    restoreBackend = api.testing.useRunBackend(() => backend);
    api.testing.answerPrompts({ claudeConsent: true, initGit: true });
    subscription = api.onDidPostToBoard((e) => {
      if (e.root !== root) return;
      if (e.message.type === 'graph') latestGraph = e.message.payload.graph;
      if (e.message.type === 'run') latestRun = e.message.payload.run;
      if (e.message.type === 'proposal') latestProposal = e.message.payload.proposal;
    });
  });

  suiteTeardown(async () => {
    subscription?.dispose();
    restoreBackend?.();
    api?.testing?.answerPrompts({ claudeConsent: undefined, initGit: undefined });
    await api?.testing?.reset();
    await closeAllEditors();
  });

  test('startRun from the board: the egress consent (testing API), then the run asks its question', async function () {
    this.timeout(LEAN_TIMEOUT_MS * 2);
    const opened = await vscode.commands.executeCommand<OpenBoardResult>('telelean.openBoard', { root });
    assert.deepEqual(opened, { root, asked: false });
    await waitFor(() => latestGraph?.nodes.length === 4, 30_000, 'a graph with 4 cards');
    const workspace = api.workspaceFor(root);
    assert.ok(workspace && typeof workspace.applyChanges === 'function', 'the model workspace lacks the M2 members (WP4)');
    assert.ok(api.runsFor(root), 'no RunManager for the root');
    assert.equal((await request('initGit', { requestId: 'run-git' })).ok, true);
    await api.simulateBoardMessage(root, message('refresh'));
    await waitFor(() => latestGraph?.semantic.state === 'fresh', LEAN_TIMEOUT_MS, `semantic "fresh" (now ${latestGraph?.semantic.state})`, 500);
    mainBefore = read(MAIN);

    const started = await request('startRun', { target: TARGET, premises: PREMISES, requestId: 'run-start' });
    assert.equal(started.ok, true, JSON.stringify(started));
    await waitFor(() => latestRun?.pendingQuestions !== undefined, LEAN_TIMEOUT_MS, `the question (run state ${latestRun?.state}: ${latestRun?.error ?? ''})`, 250);
    assert.ok(latestRun?.pendingQuestions);
    runId = latestRun.runId;
    setId = latestRun.pendingQuestions.id;
    assert.equal(latestRun.subject, 'Spyro');
    assert.equal(latestRun.target, TARGET);
    assert.deepEqual([...latestRun.premises].sort(), PREMISES);
    const [question] = latestRun.pendingQuestions.questions;
    assert.equal(question?.phenomenon, 'modality');
    assert.equal('claudesGuess' in (question ?? {}), false, "Claude's guess must not reach the board before the answer (D-20)");
    // The run directories live in the isolated profile's global storage, never in the user's.
    const runs = path.join(process.env.TELELEAN_SMOKE_DIR ?? '', 'user-data', 'User', 'globalStorage', 'telelean.telelean', 'runs');
    assert.ok(existsSync(runs), `${runs} does not exist`);
  });

  test('the answer goes through the board; the gate passes and a proved proposal arrives; the real files are untouched', async function () {
    this.timeout(LEAN_TIMEOUT_MS * 2);
    const answered = await request('answerQuestions', {
      runId,
      setId,
      answers: [{ question: 0, choice: { kind: 'option', option: 0 }, scope: 'run' }],
      requestId: 'run-answer',
    });
    assert.equal(answered.ok, true, JSON.stringify(answered));
    await waitFor(
      () => latestProposal?.report.verdict !== undefined || latestRun?.state === 'failed',
      LEAN_TIMEOUT_MS,
      `the proposal (run state ${latestRun?.state}: ${latestRun?.notices.map((n) => n.text).join(' | ') ?? ''})`,
      500,
    );
    assert.ok(latestProposal, `no proposal: ${JSON.stringify(latestRun?.notices)} ${latestRun?.error ?? ''}`);
    proposal = latestProposal;
    assert.equal(proposal.report.verdict, 'proved', JSON.stringify(proposal.report));
    assert.equal(latestRun?.state, 'review');
    assert.deepEqual(
      proposal.lifecycle.map((item) => [item.nodeId, item.from, item.to, item.recommended]),
      [[TARGET, 'GOAL', 'DERIVATION', true]],
    );
    assert.deepEqual(proposal.definitions, [], 'the normative reading introduces no definition');
    assert.equal(latestRun?.answered[0]?.claudesGuess?.option, 0, "Claude's guess is revealed after the answer");
    assert.equal(read(MAIN), mainBefore, "the user's files change only on Accept");
  });

  test('the raw Lean diff opens beside the board (vscode.changes)', async function () {
    this.timeout(60_000);
    assert.ok(proposal);
    await api.simulateBoardMessage(root, message('openProposalDiff', { runId, proposalId: proposal.proposalId }));
    await waitFor(() => vscode.window.tabGroups.all.flatMap((g) => g.tabs).some((t) => t.label.startsWith('Raw Lean diff')), 15_000, 'the raw Lean diff editor');
    await closeTextEditors();
  });

  test('Accept: Main.lean changes on disk, one history entry is recorded, Undo restores the file', async function () {
    this.timeout(LEAN_TIMEOUT_MS * 2);
    assert.ok(proposal);
    const accepted = await request('acceptProposal', {
      runId,
      proposalId: proposal.proposalId,
      lifecycle: proposal.lifecycle.filter((item) => item.recommended).map((item) => item.id),
      definitions: proposal.definitions.map((d) => d.id),
      requestId: 'run-accept',
    });
    assert.equal(accepted.ok, true, JSON.stringify(accepted));
    const main = read(MAIN);
    assert.match(main, /abbrev pg_no_dark_past : Prop :=/);
    assert.match(main, /lean: Spyro\.pg_no_dark_past/); // pinned by telelean's normalisation
    assert.match(main, /theorem cynder_not_good\.holds : cynder_not_good :=/);
    assert.match(main, /id: cynder-not-good\ntype: DERIVATION\n/);
    await waitFor(() => latestRun?.state === 'accepted', 30_000, `the run accepted (now ${latestRun?.state})`);

    const listed = nextPost(api, (e) => e.root === root && e.message.type === 'history', 30_000, 'the history listing');
    await api.simulateBoardMessage(root, message('historyList', { subject: 'Spyro' }));
    const event = await listed;
    assert.ok(event.message.type === 'history');
    const listing: HistoryListing = event.message.payload.listing;
    const newest = listing.entries[0];
    assert.equal(newest?.action, 'accept-proposal', JSON.stringify(listing.entries.slice(0, 3)));
    assert.match(newest?.label ?? '', /^These suffice/);

    const undone = await request('undo', { requestId: 'run-undo' });
    assert.equal(undone.ok, true, JSON.stringify(undone));
    assert.equal(read(MAIN), mainBefore, 'Undo restores Main.lean byte-exactly');
  });

  test('a restored board shows a pending question again (persisted at "reload", recovered by the new RunManager)', async function () {
    this.timeout(LEAN_TIMEOUT_MS * 2);
    await dismiss(runId);
    const started = await request('startRun', { target: TARGET, premises: PREMISES, requestId: 'run-start-2' });
    assert.equal(started.ok, true, JSON.stringify(started));
    await waitFor(() => latestRun?.pendingQuestions !== undefined, LEAN_TIMEOUT_MS, `the second run's question (state ${latestRun?.state})`, 250);
    const waiting = latestRun;
    assert.ok(waiting?.pendingQuestions);

    await api.testing?.disposeWorkspace(root); // the window reloads: the RunManager persists the waiting question
    latestRun = undefined;
    await restoreBoard();
    await waitFor(() => runNow()?.runId === waiting.runId && runNow()?.pendingQuestions !== undefined, 30_000, 'the restored question');
    assert.equal(runNow()?.state, 'waiting-for-answer');
    assert.equal(runNow()?.pendingQuestions?.id, waiting.pendingQuestions.id);
    assert.equal(runNow()?.pendingQuestions?.questions[0]?.question, waiting.pendingQuestions.questions[0]?.question);

    const cancelled = await request('cancelRun', { runId: waiting.runId, requestId: 'run-cancel' });
    assert.equal(cancelled.ok, true, JSON.stringify(cancelled));
    await waitFor(() => runNow()?.state === 'cancelled', 30_000, 'the cancelled run');
    await dismiss(waiting.runId);
  });

  test('AT5.9: a working run is persisted as interrupted when the window goes, its session closed; the restored board offers Resume', async function () {
    this.timeout(LEAN_TIMEOUT_MS * 2);
    const hanging = new HangingBackend();
    backend.current = hanging;
    try {
      const started = await request('startRun', { target: TARGET, premises: PREMISES, requestId: 'run-start-3' });
      assert.equal(started.ok, true, JSON.stringify(started));
      await waitFor(() => latestRun?.state === 'working' && hanging.sessions.length === 1, LEAN_TIMEOUT_MS, `the working run (state ${latestRun?.state})`, 250);
      const working = latestRun;
      assert.ok(working);

      await api.testing?.disposeWorkspace(root); // deactivation path: RunManager.dispose before the workspace
      await waitFor(() => hanging.sessions[0]?.closed === true, 10_000, 'the session to be closed');
      latestRun = undefined;
      await restoreBoard();
      await waitFor(() => runNow()?.runId === working.runId, 30_000, 'the restored run');
      assert.equal(runNow()?.state, 'interrupted');
      assert.equal(runNow()?.canResume, true);
      assert.equal(hanging.sessions.length, 1, 'recovery never starts a session by itself');

      const stopped = await request('discardProposal', { runId: working.runId, requestId: 'run-stop' }); // "Stop" = Discard
      assert.equal(stopped.ok, true, JSON.stringify(stopped));
      await waitFor(() => runNow()?.state === 'discarded', 30_000, 'the discarded run');
      assert.equal(read(MAIN), mainBefore, "the user's files are untouched by runs that were never accepted");
    } finally {
      backend.current = normative;
      await sleep(100);
    }
  });
});
