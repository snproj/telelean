/**
 * M2 end to end in VS Code (integration, docs/m2-plan.md section 11): "Formalize for dependencies" (spec v4.1 ES-2; M2's
 * "These suffice") through the REAL board UI over
 * the DevTools protocol (trusted clicks and typing, cdp.ts), the real extension host, runner workspace, RunManager,
 * Lean check engine (sandboxed Lean), proposal service, sidecar store and git history, on a fresh COPY of
 * mental_model/ that scripts/smoke.mjs placed at $TELELEAN_RUNS_E2E_ROOT (outside the window's workspace folder).
 * Claude is the FakeBackend playing the scripts of test-fixtures/walkthrough/ (docs/m2-plan.md sections 10.2 and
 * 10.3), installed through the testing API: Test mode never builds the real backend, and TELELEAN_NO_REAL_CLAUDE=1 is
 * set for the instance (quota tripwires 1 and 2 of section 10.4).
 *
 *   normative  select the arrows into the goal ("Select incoming arrows"), "Formalize for dependencies" in the
 *              Context Menu section, the question answered on the board (no guess shown before), the proposal
 *              overlay (diff marks, the result hidden until the review), the review's explicit toggle, the raw Lean
 *              diff, Accept: Main.lean changes on disk (the goal keeps its kind: spec v4 has no G->D step), one
 *              history entry ("accept"), Undo restores the file byte-exactly
 *   literal    not proved, the translucent "Claude suggests" ghost card, "I hold this" with a reason, the re-freeze
 *              with the ghost selected, proved; Accept writes the card worded by Claude and draws its arrow into the
 *              goal (after Lean's check: no TL107, no mismatch arrow, no attention badge); Undo byte-exact
 *   cheating   the smuggled axiom: a gate-failed notice on the board and Claude's retry, proved; Feedback then
 *              continues the same session (round 2, a new freeze, proved); Discard leaves the files untouched
 *   give-up    the axiom three times: gave-up and reverted notices, the proposal is the frozen formalisation (no
 *              smuggled axiom), "gave up"; Discard
 *   cancel     Cancel while Claude works: cancelled, nothing written
 *   race       Formalize pressed while the board's Lean refresh rebuilds .lake/build (forced, no wait for idle
 *              Lean): the run starts, its Lean jobs wait for the refresh, it proves; Discard
 *   reload     the window "reloads" while a question waits: the restored board shows the question again; answering
 *              it on the board resumes the session (--resume) and the run finishes
 *
 * The cards stay where they are between tests: every run either ends without Accept or is undone byte-exactly.
 *
 * Slice 2h retired M2's review (the stepper, the proposal banner, Accept, Feedback, Discard, the ghosts' "I hold this"):
 * a start is a `formalize`, a run in review is an edit session, and its Cancel is Cancel step. Every scenario above but
 * the setup drives that review, so they are skipped for later (builder 2h), to be rewritten for the session's panel,
 * session bar and Apply; their scenarios stay here for that rewrite. The session's flows are covered meanwhile by the
 * runner's session suites (session.*.test.ts) and the board's s2-review and s2-board specs.
 *
 *   exit       (2k1, D2-100) a session started on the board reaches its first stage; Exit on the session bar,
 *              confirmed: the run panel of an ended run with the exited line and Dismiss, no session bar and no review
 *              panel; the files unchanged, the step's attempt resolved discarded; Dismiss removes it
 */
import * as assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { REVIEW_TEXTS, type ProposalView, type RunView, type SessionView, type TlGraph, type WorkspaceState } from '@telelean/core';
import { FakeBackend } from '@telelean/runner/llm/fake.js';
import { playFakeScript, validateFakeScriptFile, type FakeScriptFile, type FakeScriptPlayer, type FakeScriptTurn } from '@telelean/runner/llm/fakeScripts.js';
import type { BackendCaps, LlmBackend, LlmSession, SessionConfig } from '@telelean/runner/llm/types.js';
import type { Frame, Locator } from 'playwright-core';

import type { OpenBoardResult, TeleleanApi } from '../../src/api';
import { boardFrame, clearWorkbenchToasts, connectWorkbench, settleStartupToasts, type Workbench } from './cdp';
import { closeAllEditors, closeTextEditors, EXTENSION_ID, getApi, isRendered, nextBoardMessage, settleEditors, sleep, waitFor } from './helpers';

const LEAN_TIMEOUT_MS = 240_000;
const UI_TIMEOUT_MS = 30_000;
const ROOT = process.env.TELELEAN_RUNS_E2E_ROOT;
const CDP_PORT = process.env.TELELEAN_CDP_PORT;
const MAIN = 'Model/Spyro/Main.lean';
const VOCABULARY = 'Model/Spyro/Vocabulary.lean';
const ATTEMPTS = '.telelean/subjects/Spyro/attempts.jsonl';
const TARGET = 'cynder-not-good';
const PREMISES = ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'];
/** The card the literal reading's suggestion becomes when the user adopts it ("I hold this"). */
const ADOPTED = 'a-character-who-cannot-be-in';
/** The first line of a run's context bundle (runner prompts.ts), which the FakeBackend scripts match. */
const RUN_TURN = 'Run: "Formalize for dependencies"';

/** The walkthrough fixtures of the repository (the extension under test runs from packages/extension). */
function fixture(name: string): FakeScriptFile {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, `${EXTENSION_ID} is not loaded`);
  const file = path.resolve(extension.extensionPath, '..', '..', 'test-fixtures', 'walkthrough', `${name}.json`);
  return validateFakeScriptFile(JSON.parse(readFileSync(file, 'utf8')));
}

/** The `type:` line of card `id`'s markup block in `text` (or '' when there is none). */
function typeLineOf(text: string, id: string): string {
  return new RegExp(`\\nid: ${id}\\n(type: [^\\n]*)\\n`).exec(text)?.[1] ?? '';
}

/** Feedback's round 2 (docs/m2-plan.md section 4.8): statements may change, so check, freeze again, then finish. */
const FEEDBACK_TURN: FakeScriptTurn = {
  match: 'Feedback from the person on your previous result',
  steps: [
    { kind: 'text', text: 'I checked the statements again; they stay as they are.' },
    { kind: 'callTool', tool: 'check_lean', args: {} },
    { kind: 'callTool', tool: 'freeze_statements', args: { targets: [TARGET] } },
    { kind: 'callTool', tool: 'finish', args: { status: 'proved', summary: 'Re-frozen unchanged; the proof from the three premises still holds.', assumed_without_asking: [] } },
    { kind: 'result' },
  ],
};

/** Claude reads, then works for a long time (a sleep the interrupt ends): the run stays `working` until Cancel. */
const CANCEL_TURNS: FakeScriptTurn[] = [
  {
    match: RUN_TURN,
    steps: [
      { kind: 'text', text: 'Reading the subject first.' },
      { kind: 'read', path: MAIN },
      { kind: 'sleep', ms: 600_000 },
      { kind: 'result' },
    ],
  },
];

/**
 * The normative script split at its question: round 1's turn ends with the ask_user call (the window reloads while it
 * waits); the answers arrive after the reload as the next user turn of the resumed session (M0's
 * renderAnswersAsUserTurn, "Here are the answers to it"), which plays the rest of reading A.
 */
function reloadTurns(): FakeScriptTurn[] {
  const steps = fixture('normative').turns[0]?.steps ?? [];
  const ask = steps.findIndex((s) => s.kind === 'callTool' && s.tool === 'ask_user');
  assert.ok(ask > 0, 'the normative script asks a question');
  return [
    { match: RUN_TURN, steps: steps.slice(0, ask + 1) },
    { match: 'Here are the answers to it', steps: steps.slice(ask + 1) },
  ];
}

/**
 * The backend the testing API installs once (the RunManager keeps the backend its factory gave it): each test puts
 * its own FakeBackend script in; a session resumed after a reload gets the same script, which continues where it was.
 */
class ScriptedClaude implements LlmBackend {
  readonly id = 'fake' as const;
  readonly caps: BackendCaps = { builtinFileTools: true, subscriptionAuth: false, resume: true, interrupt: true };
  readonly sessions: SessionConfig[] = [];
  player: FakeScriptPlayer | undefined;
  private backend: FakeBackend | undefined;

  use(turns: FakeScriptTurn[]): FakeScriptPlayer {
    const player = playFakeScript(turns);
    this.player = player;
    this.backend = new FakeBackend(player.script);
    this.sessions.length = 0;
    return player;
  }

  async startSession(cfg: SessionConfig): Promise<LlmSession> {
    if (!this.backend) throw new Error('no FakeBackend script installed for this test');
    this.sessions.push(cfg);
    return this.backend.startSession(cfg);
  }
}

suite('M2 end to end: "Formalize for dependencies" through the board UI (FakeBackend, real Lean, CDP)', () => {
  let api: TeleleanApi;
  let root: string;
  let wb: Workbench | undefined;
  let latestGraph: TlGraph | undefined;
  let latestState: WorkspaceState | undefined;
  let latestRun: RunView | null | undefined;
  let latestProposal: ProposalView | null | undefined;
  /** 2k1: the edit session as last posted (`session`). */
  let latestSession: SessionView | null | undefined;
  let restoreBackend: (() => void) | undefined;
  let pristine: Record<string, string> = {};
  const claude = new ScriptedClaude();
  const subscriptions: vscode.Disposable[] = [];

  const read = (file: string): string => readFileSync(path.join(root, ...file.split('/')), 'utf8');
  const readIfExists = (file: string): string => (existsSync(path.join(root, ...file.split('/'))) ? read(file) : '');
  /** The run and proposal as last posted (functions, so narrowing never survives an await). */
  const run = (): RunView | null | undefined => latestRun;
  const proposal = (): ProposalView | null | undefined => latestProposal;
  const session = (): SessionView | null | undefined => latestSession;
  const fresh = () => latestGraph?.subject === 'Spyro' && latestGraph.semantic.state === 'fresh';
  const frame = (): Promise<Frame> => {
    assert.ok(wb, 'not connected to the test instance');
    return boardFrame(wb.page, 'runs_e2e_model');
  };
  const card = async (id: string): Promise<Locator> => (await frame()).locator(`[data-node-id="${id}"]`);
  const undoButton = async () => (await frame()).locator('button.tl-icon-button--toolbar[aria-label="Undo"]');
  const runText = () => `${run()?.state ?? 'no run'} (round ${run()?.round ?? '-'}): ${(run()?.notices ?? []).map((n) => n.text).join(' | ')} ${run()?.error ?? ''}`;

  /** The model files as they are now (Main.lean and Vocabulary.lean are what runs may change). */
  const files = (): Record<string, string> => ({ [MAIN]: read(MAIN), [VOCABULARY]: read(VOCABULARY) });

  /**
   * Spec v4.1 ES-2 (slice 1e): the question is the arrows drawn into the goal. Selects them on the current board with
   * "Select incoming arrows" from the goal's right-click menu (a right click without movement, CM-7; the canvas clips an
   * expanded card, so its details' button may be out of reach) and waits for the Context Menu section to name them.
   */
  async function selectQuestion(): Promise<void> {
    const f = await frame();
    await waitFor(async () => (await f.locator('.tl-board[data-view="proposed"]').count()) === 0, UI_TIMEOUT_MS, 'the board to show the current files');
    const goal = f.locator(`[data-node-id="${TARGET}"]`);
    await goal.waitFor({ timeout: UI_TIMEOUT_MS });
    await goal.locator('.tl-card__text').click({ button: 'right' });
    const menu = f.getByTestId('board-menu');
    await menu.waitFor({ timeout: UI_TIMEOUT_MS });
    await menu.locator('[data-action="select-incoming"]').click();
    await waitFor(
      async () => ((await f.getByTestId('context-summary').textContent()) ?? '').startsWith(`${PREMISES.length} arrows into “Cynder would not be a good addition`),
      UI_TIMEOUT_MS,
      `the ${PREMISES.length} arrows into the goal selected`,
    );
  }

  /** Selects the arrows into the goal and presses "Formalize for dependencies"; resolves with the new run's id. */
  async function startFormalize(): Promise<string> {
    const before = run()?.runId;
    // Lean has checked the files as they are and is idle (an earlier test's Undo starts a refresh), so the assertions
    // of these tests see fresh facts. A start while Lean refreshes works as well (the run's working copy builds from
    // scratch and its Lean jobs wait for the refresh): the race test below presses the button during a refresh.
    await waitFor(fresh, LEAN_TIMEOUT_MS, `Lean idle on fresh facts before the run (now ${latestGraph?.semantic.state})`, 250);
    await selectQuestion();
    const f = await frame();
    const button = f.getByTestId('formalize');
    assert.equal(await button.isEnabled(), true, `Formalize for dependencies is disabled: ${(await f.getByTestId('formalize-reason').allTextContents()).join(' ')}`);
    await button.click();
    await waitFor(() => run() != null && run()?.runId !== before, LEAN_TIMEOUT_MS, `a new run (now ${runText()})`, 200);
    return run()?.runId ?? '';
  }

  /** Waits for the question card on the board and answers it there with option `option` (Send). */
  async function answerOnBoard(option: number): Promise<void> {
    const f = await frame();
    const set = f.getByTestId('question-set');
    await waitFor(async () => (await set.count()) > 0 || run()?.state === 'failed', LEAN_TIMEOUT_MS, `the question card (run ${runText()})`, 250);
    assert.ok(run()?.pendingQuestions, `no question: ${runText()}`);
    assert.equal(await f.getByTestId('claudes-guess').count(), 0, "Claude's guess must not be on the board before the answer (D-20)");
    await set.getByTestId('option').nth(option).click();
    await set.getByTestId('send-answers').click();
    await waitFor(() => run()?.pendingQuestions === undefined, UI_TIMEOUT_MS, 'the answer to reach the run');
  }

  /** Waits until the run is in review with a proposal of round `round` (or failed). */
  async function waitForReview(round: number): Promise<ProposalView> {
    await waitFor(
      () => (run()?.state === 'review' && run()?.round === round && proposal()?.runId === run()?.runId && proposal()?.round === round) || run()?.state === 'failed',
      LEAN_TIMEOUT_MS,
      `the proposal of round ${round} (run ${runText()})`,
      250,
    );
    const shown = proposal();
    assert.ok(shown && run()?.state === 'review', `no proposal: ${runText()}`);
    await (await frame()).getByTestId('review').waitFor({ timeout: UI_TIMEOUT_MS });
    return shown;
  }

  /** Steps the review until `kind` (statement, vocabulary, definitions, result) is shown. */
  async function reviewStep(kind: string): Promise<Locator> {
    const review = (await frame()).getByTestId('review');
    const step = review.getByTestId('review-step');
    for (let i = 0; i < 8 && (await step.getAttribute('data-step')) !== kind; i++) {
      await review.getByTestId('review-next').click();
      await sleep(100);
    }
    assert.equal(await step.getAttribute('data-step'), kind, `the review never reached its "${kind}" step`);
    return step;
  }

  async function dismissEnded(state: string): Promise<void> {
    await waitFor(() => run()?.state === state, LEAN_TIMEOUT_MS, `the run to be ${state} (now ${runText()})`, 250);
    const f = await frame();
    await f.getByTestId('dismiss-run').click();
    await waitFor(() => run() === null, UI_TIMEOUT_MS, 'the dismissed run to leave the board');
  }

  /** attempts.jsonl's lines of one run (records and resolutions). */
  function attemptsOf(runId: string): Array<Record<string, unknown>> {
    return readIfExists(ATTEMPTS)
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((line) => line['run'] === runId);
  }

  suiteSetup(async function () {
    this.timeout(120_000);
    assert.ok(ROOT && CDP_PORT, 'TELELEAN_RUNS_E2E_ROOT and TELELEAN_CDP_PORT are set by scripts/smoke.mjs (run `npm run test:smoke`)');
    // Quota tripwire 1 (docs/m2-plan.md section 10.4), as the extension host sees it.
    assert.equal(process.env.TELELEAN_NO_REAL_CLAUDE, '1', 'the test instance must run with TELELEAN_NO_REAL_CLAUDE=1');
    root = ROOT;
    assert.ok(existsSync(path.join(root, '.telelean', 'config.json')), `${root} is not a copy of mental_model/`);
    assert.ok(!existsSync(path.join(root, '.git')), 'the copy must start without a repository');
    pristine = files();
    api = await getApi();
    assert.ok(api.testing, 'the test API (extension mode Test)');
    await api.testing.reset(); // one model board at a time (boardFrame takes the first board webview)
    await settleEditors();
    restoreBackend = api.testing.useRunBackend(() => claude);
    api.testing.answerPrompts({ claudeConsent: true, initGit: true });
    subscriptions.push(
      api.onDidPostToBoard((event) => {
        if (event.root !== root) return;
        const m = event.message;
        if (m.type === 'graph') latestGraph = m.payload.graph;
        if (m.type === 'workspace') latestState = m.payload.state;
        if (m.type === 'run') latestRun = m.payload.run;
        if (m.type === 'session') latestSession = m.payload.session;
      }),
    );
    wb = await connectWorkbench(CDP_PORT);
    await settleStartupToasts(wb.page);
  });

  setup(async () => {
    if (wb) await clearWorkbenchToasts(wb.page);
  });

  /**
   * After a failed test: end whatever run it left (Discard in review or when interrupted, else Cancel), dismiss it,
   * and put the copy's files back, so one failure does not fail every later test as well.
   */
  teardown(async function () {
    this.timeout(120_000);
    const left = run();
    if (left && !['accepted', 'discarded', 'cancelled', 'failed'].includes(left.state)) {
      // Slice 2h: M2's Discard is retired; a run in review or interrupted is an edit session, which Exit ends.
      const exit = left.state === 'review' || left.state === 'interrupted';
      await api.simulateBoardMessage(root, exit
        ? { v: 1, type: 'endSession', payload: { runId: left.runId, decision: 'exit', requestId: `teardown-${left.runId}` } }
        : { v: 1, type: 'cancelRun', payload: { runId: left.runId, requestId: `teardown-${left.runId}` } });
      await waitFor(() => ['discarded', 'cancelled', 'failed'].includes(run()?.state ?? ''), 60_000, 'the leftover run to end').catch(() => undefined);
    }
    const ended = run();
    if (ended) {
      await api.simulateBoardMessage(root, { v: 1, type: 'dismissRun', payload: { runId: ended.runId } });
      await waitFor(() => run() === null, 10_000, 'the leftover run to leave the board').catch(() => undefined);
    }
    const now = files();
    if (Object.keys(pristine).some((file) => now[file] !== pristine[file])) {
      for (const [file, text] of Object.entries(pristine)) writeFileSync(path.join(root, ...file.split('/')), text);
      await sleep(1_000);
    }
    await closeTextEditors();
  });

  suiteTeardown(async () => {
    for (const subscription of subscriptions) subscription.dispose();
    restoreBackend?.();
    await wb?.browser.close().catch(() => undefined); // disconnects only (connectOverCDP)
    api?.testing?.answerPrompts({ claudeConsent: undefined, initGit: undefined });
    await api?.testing?.reset();
    await closeAllEditors();
  });

  test('the board opens on the copy; "Initialize git" starts its history; Lean checks the files', async function () {
    this.timeout(LEAN_TIMEOUT_MS + 60_000);
    const rendered = nextBoardMessage(api, root, isRendered, 60_000, 'the "rendered" diagnostic');
    const opened = await vscode.commands.executeCommand<OpenBoardResult>('telelean.openBoard', { root });
    assert.deepEqual(opened, { root, asked: false });
    await rendered;
    const f = await frame();
    await f.getByTestId('history-button').click();
    await f.getByTestId('history-unavailable').getByRole('button', { name: 'Initialize git' }).click();
    await waitFor(() => latestState?.history.state === 'ready', UI_TIMEOUT_MS, `history ready (now ${JSON.stringify(latestState?.history)})`);
    await wb?.page.keyboard.press('Escape');
    await waitFor(fresh, LEAN_TIMEOUT_MS, `fresh Lean facts (now ${latestGraph?.semantic.state})`, 250);
    assert.deepEqual(
      latestGraph?.nodes.map((n) => [n.id, n.type, n.status.proof.kind]),
      [
        ['pg-no-dark-past', 'AXIOM', 'none'],
        ['cynder-dark-past', 'AXIOM', 'assumed'],
        ['new-spyro-pg', 'AXIOM', 'assumed'],
        // The files say GOAL (spec v4 reads ASSUMPTION, DERIVATION and GOAL as aliases of the two kinds).
        ['cynder-not-good', 'PROPOSITION', 'none'],
      ],
    );
    assert.ok(api.runsFor(root), 'the root has a RunManager');
  });

  test.skip('normative: the question answered on the board, the overlay, the explicit toggle, the raw diff; Accept writes Main.lean, one history entry, Undo restores it byte-exactly', async function () {
    this.timeout(LEAN_TIMEOUT_MS * 3);
    const player = claude.use(fixture('normative').turns);
    const before = files();
    const runId = await startFormalize();
    await answerOnBoard(0);
    const shown = await waitForReview(1);
    assert.equal(shown.report.verdict, 'proved', runText());
    assert.deepEqual(files(), before, "the user's files change only on Accept");
    assert.equal(run()?.answered[0]?.claudesGuess?.option, 0, "Claude's guess is revealed after the answer");
    const f = await frame();
    await waitFor(async () => (await f.getByTestId('answered-question').getByTestId('claudes-guess').count()) > 0, UI_TIMEOUT_MS, "Claude's guess shown after the answer");

    // The overlay: the proposed board with diff marks; the target's result stays hidden until the review shows it.
    await waitFor(async () => (await f.locator('.tl-board[data-view="proposed"]').count()) === 1, UI_TIMEOUT_MS, 'the board to switch to Proposed');
    assert.equal(await (await card('pg-no-dark-past')).getAttribute('data-diff'), 'changed');
    assert.equal(((await (await card('pg-no-dark-past')).getByTestId('diff-badge').textContent()) ?? '').includes('changed'), true);
    assert.equal(await (await card(TARGET)).locator('[data-chip="result-hidden"]').count(), 1, 'the result is hidden before the review');
    assert.match((await f.getByTestId('proposal-counts').textContent()) ?? '', /changed/);

    // The review: the statement first, the sentence beside its Lean, the explicit form on request.
    const step = await reviewStep('statement');
    assert.match((await step.getByTestId('statement-sentence').textContent()) ?? '', /PG games cannot have characters with dark pasts/);
    const lean = step.getByTestId('statement-lean');
    assert.match((await lean.textContent()) ?? '', /¬\s?(Spyro\.)?GoodAddition c g/); // the pretty form (names as Lean prints them)
    await step.getByTestId('explicit-toggle').check();
    await waitFor(async () => ((await lean.textContent()) ?? '').includes('Not (Spyro.GoodAddition c g)'), UI_TIMEOUT_MS, 'the explicit form (Not (…))');

    // The raw Lean diff opens beside the board (vscode.changes over the read-only telelean-proposal: documents).
    await f.getByTestId('review').getByTestId('raw-diff').click();
    await waitFor(() => vscode.window.tabGroups.all.flatMap((g) => g.tabs).some((t) => t.label.startsWith('Raw Lean diff')), UI_TIMEOUT_MS, 'the raw Lean diff editor');
    await closeTextEditors();

    // Spec v4 (slice 1a): no G->D step any more; the review ends with the result.
    await reviewStep('result');
    assert.equal(await f.getByTestId('review').locator('[data-step-kind="lifecycle"]').count(), 0, 'no "Card changes" step');

    // Accept: the real Main.lean changes; one history entry; Undo restores it byte-exactly.
    await f.getByTestId('review').getByTestId('accept').click();
    await waitFor(() => run()?.state === 'accepted', LEAN_TIMEOUT_MS, `the run accepted (now ${runText()})`, 250);
    const main = read(MAIN);
    assert.match(main, /lean: Spyro\.pg_no_dark_past/);
    assert.match(main, /\/-- PG games cannot have characters with dark pasts -\/\nabbrev pg_no_dark_past : Prop :=/);
    assert.match(main, /theorem cynder_not_good\.holds : cynder_not_good :=/);
    // The goal keeps its kind: a run changes no type: line (spec v4: no lifecycle item; CF-4: only you change a kind).
    // The fixture's `type: GOAL` (an alias, never rewritten) is there before and after, so the check cannot pass empty.
    assert.equal(typeLineOf(before[MAIN] ?? '', TARGET), 'type: GOAL');
    assert.equal(typeLineOf(main, TARGET), 'type: GOAL');
    assert.deepEqual(attemptsOf(runId).map((a) => a['resolution'] ?? a['verdict']), ['proved', 'accepted']);
    assert.equal(player.remaining(), 0);

    await f.getByTestId('history-button').click();
    const entries = f.getByTestId('history-entry');
    await waitFor(async () => (await entries.count()) >= 2, UI_TIMEOUT_MS, 'the history entries');
    const newest = (await entries.first().locator('.tl-history__line').textContent()) ?? '';
    assert.match(newest, / · accept · Formalize → proved: Cynder would not be a good addition/);
    await wb?.page.keyboard.press('Escape');

    await (await undoButton()).click();
    await waitFor(() => read(MAIN) === before[MAIN], UI_TIMEOUT_MS, 'Undo of the Accept: Main.lean byte for byte as before', 100);
    assert.deepEqual(files(), before);
    await dismissEnded('accepted');
  });

  test.skip('literal: not proved, the "Claude suggests" card, "I hold this", re-frozen with it, proved; Accept writes the card worded by Claude; Undo restores', async function () {
    this.timeout(LEAN_TIMEOUT_MS * 4);
    const player = claude.use(fixture('literal').turns);
    const before = files();
    await startFormalize();
    await answerOnBoard(1);
    const round1 = await waitForReview(1);
    assert.equal(round1.report.verdict, 'not-proved', runText());
    const f = await frame();
    const ghost = f.locator('.tl-col__list[data-kind="AXIOM"] [data-ghost-id="ghost-1"]');
    await ghost.waitFor({ timeout: UI_TIMEOUT_MS });
    assert.equal((await ghost.locator('.tl-ghost__marker').textContent())?.trim(), 'Claude suggests');
    assert.equal(await ghost.getByTestId('ghost-lean').textContent(), '∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g');
    assert.equal(await ghost.locator('[data-chip="closes-gap"]').count(), 1);
    const opacity = await ghost.evaluate((el: unknown) => (globalThis as unknown as { getComputedStyle(e: unknown): { opacity: string } }).getComputedStyle(el).opacity);
    assert.ok(Number(opacity) < 1, `the ghost card is translucent (opacity ${opacity})`);

    await ghost.getByRole('button', { name: 'I hold this' }).click();
    const why = ghost.getByRole('textbox', { name: 'Why do you hold it? (optional)' });
    await why.fill('it seems obvious to me');
    await why.press('Enter');
    // Re-frozen with the adopted card selected: round 2 starts in stage prove.
    await waitFor(() => run()?.round === 2 && run()?.frozen?.round === 2, LEAN_TIMEOUT_MS, `the re-freeze of round 2 (now ${runText()})`, 250);
    assert.ok(run()?.frozen?.permitted.selected.includes('Spyro.not_in_game_not_good.holds'), JSON.stringify(run()?.frozen?.permitted));
    assert.equal(run()?.ghosts.find((g) => g.id === 'ghost-1')?.state, 'adopted');
    const round2 = await waitForReview(2);
    assert.equal(round2.report.verdict, 'proved', runText());
    assert.ok(round2.report.footprint?.includes('a-character-who-cannot-be-in'), JSON.stringify(round2.report.footprint));
    assert.deepEqual(files(), before, "the user's files change only on Accept");
    assert.equal(player.remaining(), 0);

    await f.getByTestId('banner-accept').click();
    await waitFor(() => run()?.state === 'accepted', LEAN_TIMEOUT_MS, `the run accepted (now ${runText()})`, 250);
    const main = read(MAIN);
    assert.match(main, /natural_name: A character who cannot be in a game would not be a good addition to it\n/);
    assert.match(main, /worded_by: agent\n/);
    assert.match(main, /rationale: it seems obvious to me\n/);
    assert.match(main, /not_in_game_not_good\.holds cynder newSpyro/);
    assert.match(read(VOCABULARY), /axiom InGame : Character → Game → Prop/);
    // The adopted card's arrow into the goal is drawn ("I hold this": the user adopted it for this target), so once Lean
    // has checked the accepted files the board shows no TL107 ("uses … but no arrow is drawn from it") and no mismatch
    // arrow: the UX verification's finding in exactly this flow (also asserted by runner walkthrough.e2e and m2flow).
    assert.match(main, /id: cynder-not-good\ntype: GOAL\nnatural_name: [^\n]*\npremises: cynder-dark-past, new-spyro-pg, pg-no-dark-past, a-character-who-cannot-be-in\n/);
    await waitFor(
      () => fresh() && latestGraph?.nodes.some((n) => n.id === ADOPTED) === true && latestGraph.nodes.find((n) => n.id === TARGET)?.status.proof.kind === 'proved',
      LEAN_TIMEOUT_MS,
      `Lean's facts of the accepted files (now ${latestGraph?.semantic.state})`,
      250,
    );
    const checked = latestGraph;
    assert.deepEqual(checked?.nodes.find((n) => n.id === TARGET)?.premises, [...PREMISES, ADOPTED]);
    assert.deepEqual(checked?.diagnostics.filter((d) => d.code === 'TL107'), [], 'no TL107 after Accept');
    assert.deepEqual(checked?.edges.filter((e) => e.mismatch), [], 'no declared-vs-verified mismatch after Accept');
    // And on the board (once it draws these facts: the verified arrow from the adopted card), no arrow is drawn as a
    // mismatch and the goal needs no attention.
    const verified = f.locator(`path.tl-edge[data-source="${ADOPTED}"][data-target="${TARGET}"][data-pattern="verified"]`);
    await waitFor(async () => (await verified.count()) > 0, UI_TIMEOUT_MS, 'the verified arrow from the adopted card');
    assert.equal(await f.locator('path.tl-edge[data-mismatch]').count(), 0, 'no mismatch arrow on the board');
    const attention = (await card(TARGET)).getByTestId('attention');
    const badges = await attention.count();
    assert.equal(badges, 0, `the goal needs no attention (${badges > 0 ? await attention.first().getAttribute('title') : ''})`);
    await (await undoButton()).click();
    await waitFor(() => read(MAIN) === before[MAIN] && read(VOCABULARY) === before[VOCABULARY], UI_TIMEOUT_MS, 'Undo of the Accept: both files byte for byte as before', 100);
    await dismissEnded('accepted');
  });

  test.skip('cheating: the smuggled axiom is refused with a notice and Claude retries; Feedback continues the same session; Discard leaves the files untouched', async function () {
    this.timeout(LEAN_TIMEOUT_MS * 4);
    const script = fixture('cheat-added-axiom');
    const player = claude.use([...script.turns, FEEDBACK_TURN]);
    const before = files();
    const runId = await startFormalize();
    await answerOnBoard(0);
    const round1 = await waitForReview(1);
    assert.equal(round1.report.verdict, 'proved', runText());
    assert.equal(run()?.counters.gateAttempts, 2, 'one failed attempt, then the retry passed');
    const failed = run()?.notices.find((n) => n.kind === 'gate-failed');
    assert.ok(failed, runText());
    assert.match(failed.text, /^Attempt 1 didn['’]t pass: it added an axiom \(`shortcut`\), and only you can add beliefs\. Asking Claude to retry\.$/);
    const f = await frame();
    // In review, the attempt-by-attempt notices of a round that passed are history: folded below the review.
    const earlier = f.getByTestId('run-notices-earlier');
    await earlier.waitFor({ timeout: UI_TIMEOUT_MS });
    await earlier.locator(':scope > summary').click();
    const notice = f.getByTestId('run-notice').filter({ hasText: 'it added an axiom' });
    await notice.first().waitFor({ timeout: UI_TIMEOUT_MS });
    assert.equal(await notice.first().getAttribute('data-kind'), 'gate-failed');

    // Feedback: a new round in the same Claude session.
    await f.getByTestId('banner-feedback').click();
    const text = f.getByTestId('feedback-text');
    await text.fill('Please check the statements once more.');
    await f.getByTestId('send-feedback').click();
    await waitFor(() => run()?.round === 2, UI_TIMEOUT_MS, `round 2 (now ${runText()})`);
    const round2 = await waitForReview(2);
    assert.equal(round2.report.verdict, 'proved', runText());
    assert.equal(claude.sessions.length, 1, 'Feedback continues the open session (no new CLI process)');
    const feedbackTurn = player.played.find((p) => p.turn.startsWith('Feedback from the person on your previous result:'));
    assert.ok(feedbackTurn, JSON.stringify(player.played.map((p) => p.turn.slice(0, 60))));
    assert.ok(feedbackTurn.turn.includes('"Please check the statements once more."'));
    assert.equal(run()?.frozen?.round, 2, 'round 2 froze again before finishing proved');
    assert.equal(player.remaining(), 0);

    // Discard: the run ends, nothing reaches the user's files.
    await f.getByTestId('review').getByTestId('discard').click();
    await waitFor(() => run()?.state === 'discarded', LEAN_TIMEOUT_MS, `the run discarded (now ${runText()})`, 250);
    assert.deepEqual(files(), before);
    assert.deepEqual(attemptsOf(runId).map((a) => a['resolution'] ?? a['verdict']), ['proved', 'superseded', 'proved', 'discarded']);
    await dismissEnded('discarded');
  });

  test.skip('give-up: three refused attempts; telelean reverts to the frozen formalisation and says so; Discard', async function () {
    this.timeout(LEAN_TIMEOUT_MS * 4);
    claude.use(fixture('cheat-give-up').turns);
    const before = files();
    const runId = await startFormalize();
    await answerOnBoard(0);
    const shown = await waitForReview(1);
    assert.equal(shown.report.verdict, 'gave-up', runText());
    assert.equal(run()?.counters.gateAttempts, 3);
    assert.deepEqual(run()?.notices.map((n) => n.kind), ['gate-failed', 'gate-failed', 'gave-up', 'reverted']);
    assert.match(shown.report.reverted?.label ?? '', /frozen/i);
    const f = await frame();
    const gaveUp = f.getByTestId('run-notice').and(f.locator('[data-kind="gave-up"]'));
    await gaveUp.waitFor({ timeout: UI_TIMEOUT_MS });
    assert.match((await gaveUp.textContent()) ?? '', /3 times/);
    assert.match((await gaveUp.textContent()) ?? '', /reverted its working copy to “Statements frozen/);
    // What the proposal shows is the judged, reverted state: the formalisation without the smuggled axiom.
    const answer = await api.runsFor(root)?.sessionDiff(runId, 1, true);
    const diff = answer !== undefined && 'kind' in answer ? answer.files : [];
    const shownText = diff.map((c) => c.after ?? '').join('\n');
    assert.ok(shownText.includes('abbrev pg_no_dark_past : Prop :='), shownText);
    assert.ok(!shownText.includes('axiom shortcut'), shownText);
    assert.ok(!shownText.includes('theorem cynder_not_good.holds'), shownText);

    await f.getByTestId('banner-discard').click();
    await waitFor(() => run()?.state === 'discarded', LEAN_TIMEOUT_MS, `the run discarded (now ${runText()})`, 250);
    assert.deepEqual(files(), before);
    await dismissEnded('discarded');
  });

  test.skip('cancel: Cancel on the run panel stops Claude while it works; nothing is written', async function () {
    this.timeout(LEAN_TIMEOUT_MS * 2);
    claude.use(CANCEL_TURNS);
    const before = files();
    const runId = await startFormalize();
    await waitFor(() => run()?.state === 'working' && claude.sessions.length === 1, LEAN_TIMEOUT_MS, `the working run (now ${runText()})`, 250);
    const f = await frame();
    await f.getByTestId('run-panel').getByTestId('cancel-run').click();
    await waitFor(() => run()?.state === 'cancelled', UI_TIMEOUT_MS, `the run cancelled (now ${runText()})`, 100);
    assert.deepEqual(files(), before);
    assert.deepEqual(attemptsOf(runId).map((a) => a['verdict']), ['cancelled']);
    await dismissEnded('cancelled');
  });

  test.skip('race: Formalize pressed while the board\'s Lean refresh rebuilds .lake/build (no wait for idle Lean): the run starts, waits for the refresh, proves; Discard', async function () {
    this.timeout(LEAN_TIMEOUT_MS * 3);
    const player = claude.use(fixture('normative').turns);
    const before = files();
    const prior = run()?.runId;
    // The arrows are selected on the current board first (selecting takes a while; the refresh below must still run
    // when the button is pressed).
    await waitFor(fresh, LEAN_TIMEOUT_MS, `Lean idle on fresh facts before the race (now ${latestGraph?.semantic.state})`, 250);
    await selectQuestion();
    const f = await frame();
    const button = f.getByTestId('formalize');
    assert.equal(await button.isEnabled(), true, `Formalize for dependencies is disabled: ${(await f.getByTestId('formalize-reason').allTextContents()).join(' ')}`);
    // Force the race: without their Lake traces Lake rebuilds both modules in place, so the board's refresh rewrites
    // .lake/build for a second or two; Formalize is pressed as soon as the board shows Lean checking.
    for (const module of ['Vocabulary', 'Main']) rmSync(path.join(root, '.lake', 'build', 'lib', 'lean', 'Model', 'Spyro', `${module}.trace`), { force: true });
    const refreshed = Promise.resolve(vscode.commands.executeCommand('telelean.refresh')).catch((e: unknown) => console.log(`[race] the refresh command failed: ${String(e)}`));
    await waitFor(() => latestGraph?.semantic.state === 'checking', UI_TIMEOUT_MS, `the board to show Lean checking (now ${latestGraph?.semantic.state})`, 10);
    const atPress = latestGraph?.semantic.state;
    await button.click();
    const afterPress = latestGraph?.semantic.state;
    console.log(`[race] Lean was "${atPress}" when Formalize was pressed ("${afterPress}" right after)`);
    assert.equal(atPress, 'checking', 'the button was pressed while Lean was refreshing');
    await waitFor(() => run() != null && run()?.runId !== prior, LEAN_TIMEOUT_MS, `a new run (now ${runText()})`, 200);
    const runId = run()?.runId ?? '';
    assert.equal(run()?.target, TARGET, runText());
    assert.deepEqual([...(run()?.premises ?? [])].sort(), [...PREMISES].sort(), runText());

    // The run goes on as usual: the question, the proof, the review; the refresh finishes on its own.
    await answerOnBoard(0);
    const shown = await waitForReview(1);
    assert.equal(shown.report.verdict, 'proved', runText());
    assert.equal(player.remaining(), 0);
    await refreshed;
    await waitFor(fresh, LEAN_TIMEOUT_MS, `the board's refresh to finish (now ${latestGraph?.semantic.state})`, 250);
    assert.deepEqual(files(), before, "the user's files change only on Accept");
    await (await frame()).getByTestId('review').getByTestId('discard').click();
    await waitFor(() => run()?.state === 'discarded', LEAN_TIMEOUT_MS, `the run discarded (now ${runText()})`, 250);
    assert.deepEqual(files(), before);
    assert.deepEqual(attemptsOf(runId).map((a) => a['resolution'] ?? a['verdict']), ['proved', 'discarded']);
    await dismissEnded('discarded');
  });

  test.skip('reload while a question waits: the restored board shows it again; answering it there resumes the session and the run finishes', async function () {
    this.timeout(LEAN_TIMEOUT_MS * 3);
    claude.use(reloadTurns());
    const before = files();
    const runId = await startFormalize();
    await waitFor(() => run()?.pendingQuestions !== undefined, LEAN_TIMEOUT_MS, `the question (now ${runText()})`, 250);
    const setId = run()?.pendingQuestions?.id;
    await (await frame()).getByTestId('question-set').waitFor({ timeout: UI_TIMEOUT_MS });

    // The window "reloads": the RunManager persists the waiting question and closes the session; a new workspace and
    // RunManager recover it, and the board comes back through the serializer path on a fresh panel.
    await api.testing?.disposeWorkspace(root);
    latestRun = undefined;
    const panel = vscode.window.createWebviewPanel('telelean.board', `telelean: ${path.basename(root)}`, vscode.ViewColumn.Active, { enableScripts: true });
    await api.restoreBoard(panel, { root });
    await waitFor(() => api.boardFor(root)?.panel === panel && api.boardFor(root)?.subject === 'Spyro', UI_TIMEOUT_MS, 'the restored board on subject Spyro');
    await waitFor(() => run()?.runId === runId && run()?.pendingQuestions?.id === setId, UI_TIMEOUT_MS, `the restored question (now ${runText()})`);
    assert.equal(run()?.state, 'waiting-for-answer');
    assert.equal(claude.sessions.length, 1, 'recovery starts no session by itself');
    const f = await frame();
    if ((await f.getByTestId('question-set').count()) === 0) await f.getByTestId('run-badge').click(); // the panel may start closed
    await answerOnBoard(0);
    const shown = await waitForReview(1);
    assert.equal(shown.report.verdict, 'proved', runText());
    assert.equal(claude.sessions.length, 2, 'the answer started a resumed session');
    assert.equal(claude.sessions[1]?.resumeSessionId, claude.sessions[0]?.sessionId, 'the CLI is resumed with --resume <session>');
    assert.deepEqual(files(), before);
    await (await frame()).getByTestId('review').getByTestId('discard').click();
    await dismissEnded('discarded');
    assert.deepEqual(files(), before);
    assert.deepEqual(files(), pristine, 'every run of this suite left the files as the copy was');
  });

  test('exit (2k1, D2-100): Exit on the session bar, confirmed, leaves the run panel of an ended run with the exited line and Dismiss; no session bar, no review panel; the files unchanged', async function () {
    this.timeout(LEAN_TIMEOUT_MS * 3);
    claude.use(fixture('normative').turns);
    const before = files();
    const runId = await startFormalize();
    await answerOnBoard(0);
    // The session's first stage: the review panel and the session bar.
    await waitFor(
      () => (session()?.runId === runId && session()?.phase === 'stage' && session()?.judging === false) || run()?.state === 'failed',
      LEAN_TIMEOUT_MS,
      `the session's first stage (run ${runText()})`,
      250,
    );
    assert.equal(run()?.state, 'review', runText());
    const f = await frame();
    const bar = f.getByTestId('session-bar');
    await bar.waitFor({ timeout: UI_TIMEOUT_MS });
    const reviewPanel = f.locator('[data-testid="run-panel"][data-session]');
    await reviewPanel.waitFor({ timeout: UI_TIMEOUT_MS });
    assert.deepEqual(files(), before, "the user's files change only on Apply");

    // Exit asks first; its "Exit session" ends the session.
    await bar.getByTestId('session-exit').click();
    const dialog = f.getByTestId('dialog-exit-session');
    await dialog.waitFor({ timeout: UI_TIMEOUT_MS });
    await dialog.getByTestId('exit-confirm').click();
    await waitFor(() => run()?.state === 'discarded' && session() === null, LEAN_TIMEOUT_MS, `the run discarded and its session gone (now ${runText()}; session ${session() === null ? 'null' : 'still posted'})`, 100);

    // D2: the run panel of an ended run, with the exited line and Dismiss; no review panel, no session bar, no Exit.
    const ended = f.getByTestId('run-ended');
    await ended.waitFor({ timeout: UI_TIMEOUT_MS });
    assert.equal(await ended.getAttribute('data-outcome'), 'discarded');
    assert.equal(((await ended.getByTestId('run-ended-text').textContent()) ?? '').trim(), REVIEW_TEXTS.exited);
    assert.equal(await ended.getByTestId('dismiss-run').isVisible(), true, 'Dismiss is offered');
    assert.equal(await reviewPanel.count(), 0, 'no review panel for an ended run');
    assert.equal(await f.getByTestId('session-bar').count(), 0, 'no session bar for an ended run');
    assert.equal(await f.getByTestId('session-exit').count(), 0, 'no Exit for an ended run');
    assert.equal(((await f.getByTestId('run-badge').textContent()) ?? '').trim(), 'Claude: discarded · Spyro');
    // D5: Exit changed no file; the step's attempt is recorded, and resolved discarded.
    assert.deepEqual(files(), before);
    // (Only the last record is asserted: the earlier ones follow the scenarios' older helpers, unrun since 2h.)
    assert.equal(attemptsOf(runId).map((a) => a['resolution'] ?? a['verdict']).at(-1), 'discarded');

    // D4: Dismiss removes it, as for any run.
    await ended.getByTestId('dismiss-run').click();
    await waitFor(() => run() === null, UI_TIMEOUT_MS, 'the dismissed run to leave the board');
    await waitFor(async () => (await f.getByTestId('run-panel').count()) === 0, UI_TIMEOUT_MS, 'the run panel to close');
    assert.deepEqual(files(), pristine, 'the session left the files as the copy was');
  });
});
