/**
 * One board's conversation with its model workspace (docs/m1-plan.md sections 3 and 5.5), without the vscode API:
 * validated webview messages in, BoardActions / undo / history calls to the runner's ModelWorkspace, and
 * `workspace` / `graph` / `history` / `actionResult` / `notice` messages back to the webview.
 *
 *   ready, onDidChange, subject switches  -> publish: `workspace` state, then the subject's `graph`
 *   action messages                       -> ws.perform(BoardAction) -> actionResult (requestId) + notice (Undo toast);
 *                                            a `needs-confirmation` answer also names the cards among its dependents
 *                                            (spec v4 slice 1b: addArrows, removeArrows, setFromNothing, claimPending
 *                                            and moveCards are action messages too, ./actionMapping.ts)
 *   undo / redo                           -> ws.undo / ws.redo for the board's subject, reported like an action
 *   history*                              -> listHistory / historyDiff (read-only diff editor) / revert / prune
 *   initGit                               -> a modal question in the host, then ws.initGit
 *   copyText / openInEditor / refresh     -> clipboard / editor (path re-checked inside the root) / ws.refreshNow
 *
 * M2 (docs/m2-plan.md section 8.1), the root's Claude runs (its RunManager, which outlives the board, D-25):
 *   startRun                              -> busy check, the board edits sent before it, the start's check (spec
 *                                            v4.1 Formalize for dependencies, core formalizeStartProblem: drawn arrows,
 *                                            proposition premises with a `.holds`, no cycle; slice 1e), egress consent
 *                                            (host, once per root) -> runs.start with the board's subject (the
 *                                            RunManager runs preflight; it declares nothing since slice 1e)
 *   answerQuestions, cancelRun, resumeRun, acceptProposal, feedback, discardProposal, adoptGhost, rejectGhost,
 *   dismissRun                            -> the RunManager method of the same meaning -> actionResult (+ a toast)
 *   formalize, retryStep                  -> slice 2d (docs/slice2-plan.md 1.1, 2.4): a start (busy check, the board
 *                                            edits sent before it, core formalizeStartProblems, egress consent) or a
 *                                            mid-stage Formalize (`runId` and `stage`: no busy check, no consent; the
 *                                            runner checks it on its own records) -> runs.formalize; Retry step ->
 *                                            runs.retry. In a session cancelRun is Cancel step (not queued, as before)
 *   openProposalDiff                      -> runs.proposalDiff -> the read-only multi-file diff beside the board
 *   ready, RunManager.onDidChange         -> `run` (the root's current run, any subject) and `proposal`; slice 2d: and
 *                                            `session` (the root's SessionView, masked by the runner) on ready and
 *                                            whenever the session changed (`RunChange.session`)
 *
 * Mutating messages run one at a time in arrival order (board edits in one queue, run messages in another, so a run
 * start or an Accept that waits for Lean never blocks the board); read-only ones (history listing and preview, copy,
 * open, refresh, the raw diff) do not wait behind them, and neither does Cancel (it must be able to stop a start or an
 * Accept in progress). When the board's subject disappears (undo of create-subject, a revert), the board switches to
 * the first remaining subject.
 *
 * Spec v4 ES-7, ES-9, UN-3 (slice 1f): an edit session (in slice 1, a run) diffs from a base that must not change.
 * While a run of this model folder is active (any state before it ends, on any subject), or while a start is on its
 * way to the RunManager, every message that would change the folder's files is refused before planning, with core's
 * EDIT_SESSION_ACTIVE (`conflict`): the action messages (add, edit, delete, kind, re-order, new subject, arrows,
 * "follows from nothing", Mark pending, moves), Undo, Redo and History revert. Selecting a subject, the history
 * listing and preview, Keep last N (it drops snapshots, never files), Initialize git, copy, open and refresh stay
 * allowed. A start first lets the board edits sent before it finish, so the run's base includes them. Slice 1e (1f's
 * verification): "before" is the order in which the messages reached the host, so an edit still queued behind another
 * when the start arrives is applied, not refused; only the edits that arrive after the start are locked out.
 */
import {
  ActionError,
  EDIT_SESSION_ACTIVE,
  formalizeStartProblem,
  formalizeStartProblems,
  hostMessage,
  LIMITS,
  REVIEW_TEXTS,
  runLocksBoard,
  type ActionOutcome,
  type DependentCard,
  type FileChange,
  type FormalizeMessage,
  type HistoryAvailability,
  type HistoryDiff,
  type HistoryListing,
  type HostToWebviewMessage,
  type NoticeLevel,
  type OpenProposalDiffMessage,
  type Range,
  type SubjectInfo,
  type TlGraph,
  type WebviewToHostMessage,
  type WorkspaceState,
} from '@telelean/core';
import type { RunChange, RunManager } from '@telelean/runner/run/types.js';
import type { ModelWorkspace, WorkspaceChange } from '@telelean/runner/workspace/index.js';

import { isActionMessage, requestIdOf, SELF_EVIDENT_NOT_YET, toBoardAction, type ActionMessage } from './actionMapping';
import { proposalDiffTitle, type ProposalDiff } from './proposalPreview';
import {
  busyRefusal,
  CONSENT_DECLINED,
  isRunRequest,
  RUN_SUCCESS_NOTICES,
  RUNS_UNAVAILABLE,
  type RunRequestMessage,
  type RunRequestType,
  type RunsHandle,
} from './runs';

export type LogLevel = 'info' | 'warn' | 'error';

/** Modal questions the host may ask (ids let tests answer them). */
export type ConfirmId = 'initGit';

/** What a session needs from the editor (VS Code in the extension, fakes in unit tests). */
export interface BoardSessionPorts {
  /**
   * Hands a message to the webview. Must resolve without waiting for delivery (a webview that is still loading, e.g.
   * one VS Code restores after a reload, receives nothing until later; it says "ready" and gets a fresh publish then).
   * False when the board is closed.
   */
  post(message: HostToWebviewMessage): Promise<boolean>;
  writeClipboard(text: string): Promise<void>;
  /** The absolute path of a model file named by the webview; throws when it is not inside the model root. */
  resolveFile(file: string): Promise<string>;
  openFile(absPath: string, range: Range | undefined): Promise<void>;
  /** Opens the read-only multi-file diff of a history entry. */
  showHistoryDiff(diff: HistoryDiff): Promise<void>;
  /** A modal question; true when the user chose `yes`. */
  confirm(id: ConfirmId, message: string, detail: string, yes: string): Promise<boolean>;
  /** The board now shows `subject` (remembered so a restored board shows it again). */
  subjectChanged(subject: string): void;
  log(level: LogLevel, message: string): void;
  /**
   * M2 egress consent (docs/m2-plan.md section 8.2): true when the user allows sending this model to Claude. The host
   * asks once per model root (a modal) and remembers a yes.
   */
  claudeConsent(): Promise<boolean>;
  /** M2: opens the read-only multi-file diff of a proposal ("Raw Lean diff…") beside the board. */
  showProposalDiff(diff: ProposalDiff): Promise<void>;
}

export interface BoardSessionOptions {
  root: string;
  /** Folder name of the root (the board's title and the `initGit` question). */
  rootName: string;
  workspace: ModelWorkspace;
  /** The subject to show first when it exists (restored or remembered); otherwise the first subject. */
  subject?: string;
  ports: BoardSessionPorts;
  /** M2: the root's Claude runs (absent or `unavailable`: run messages are refused `not-yet` with the reason). */
  runs?: RunsHandle;
}

type OutcomeKind = 'action' | 'undo' | 'redo' | 'revert';

const ALL_RUN_CHANGES: RunChange = { run: true, proposal: true, session: true };

const INIT_GIT_DETAIL =
  "telelean records each change as a private ref (refs/telelean/…) in this folder's own repository. It never touches your branches, staging area or hooks, and never pushes.";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The outcome for an exception from the runner (refusals normally arrive as `ok: false` outcomes instead). */
export function outcomeFromError(error: unknown): ActionOutcome {
  if (error instanceof ActionError) {
    return { ok: false, code: error.code, error: error.message, ...(error.dependents.length > 0 ? { dependents: [...error.dependents] } : {}) };
  }
  return { ok: false, code: 'internal', error: errorMessage(error) };
}

export function emptyHistoryListing(subject: string): HistoryListing {
  return { subject, entries: [], storage: { subjectBytes: 0, totalBytes: 0, perSubject: {} }, more: false };
}

export function describeAvailability(availability: HistoryAvailability): string {
  switch (availability.state) {
    case 'ready':
      return 'History is on.';
    case 'no-repo':
      return 'The model folder is not inside a git repository.';
    case 'git-missing':
      return 'git was not found (setting telelean.git.path).';
    case 'disabled':
      return 'History snapshots are switched off (setting telelean.git.snapshotRefs).';
    case 'error':
      return `History error: ${availability.detail}`;
  }
}

const isNoHistory = (error: unknown) => error instanceof ActionError ? error.code === 'no-history' : (error as { code?: unknown } | null)?.code === 'no-history';

/** Messages that change the model folder's files without being action messages (ES-9: refused during a run). */
const LOCKED_NON_ACTIONS: ReadonlySet<WebviewToHostMessage['type']> = new Set<WebviewToHostMessage['type']>(['undo', 'redo', 'historyRevert']);

export class BoardSession {
  private current: string;
  private queue: Promise<void> = Promise.resolve();
  private runQueue: Promise<void> = Promise.resolve();
  /** Each message's place in the order the messages reached the host (`handle`), counted from 1. */
  private arrivals = 0;
  /**
   * The arrival numbers of the starts on their way to the RunManager. Slice 1f (ES-9): a start locks the board from its
   * request on. Slice 1e: only for the edits that arrive after it; those that arrived before are applied first.
   */
  private readonly startsOnTheirWay = new Set<number>();
  private publishing: Promise<void> | undefined;
  private publishAgain = false;
  private notices = 0;
  private disposed = false;
  private readonly runSubscription: { dispose(): void } | undefined;

  constructor(private readonly options: BoardSessionOptions) {
    this.current = this.pickSubject(options.subject);
    const runs = options.runs;
    if (runs && 'manager' in runs) {
      try {
        this.runSubscription = runs.manager.onDidChange((change) => void this.publishRuns(change));
      } catch (error) {
        options.ports.log('error', `subscribing to the run changes failed: ${errorMessage(error)}`);
      }
    }
  }

  get root(): string {
    return this.options.root;
  }

  /** The subject the board shows ('' when the model has no subject yet). */
  get subject(): string {
    return this.current;
  }

  get workspace(): ModelWorkspace {
    return this.options.workspace;
  }

  /** Handles one validated message; resolves when its effects (posts included) are done. Never rejects. */
  async handle(message: WebviewToHostMessage): Promise<void> {
    const arrival = ++this.arrivals;
    try {
      switch (message.type) {
        case 'ready':
          await this.requestPublish();
          return await this.publishRuns();
        case 'select':
        case 'diagnostic':
          return; // logged by the panel
        case 'copyText':
          return await this.copy(message.payload.text);
        case 'openInEditor':
          return await this.open(message.payload.file, message.payload.range);
        case 'refresh':
          return await this.refresh();
        case 'historyList':
          return await this.listHistory(message.payload.subject, message.payload.limit);
        case 'historyPreview':
          return await this.preview(message.payload.subject, message.payload.entryId, message.payload.compare);
        case 'openProposalDiff':
          return await this.openProposalDiff(message.payload);
        case 'cancelRun':
          // Not queued: Cancel must reach the RunManager while a start or an Accept still waits for Lean (any
          // non-terminal state can be cancelled, docs/m2-plan.md section 2); it names a run the board already shows.
          return await this.handleRun(message);
        default:
          if (isRunRequest(message)) {
            // Slice 2d: a `formalize` without `runId` is a start (it locks the board from its request on, as startRun);
            // a mid-stage one (with `runId` and `stage`) runs in an active session, which locks the board already.
            const isStart = message.type === 'startRun' || (message.type === 'formalize' && message.payload.runId === undefined);
            if (!isStart) return await this.enqueueRun(() => this.handleRun(message));
            // The lock begins now, for the edits that arrive after this start (not for those already queued).
            this.startsOnTheirWay.add(arrival);
            try {
              return await this.enqueueRun(() => this.handleRun(message));
            } finally {
              this.startsOnTheirWay.delete(arrival);
            }
          }
          return await this.enqueue(() => this.handleInOrder(message, arrival));
      }
    } catch (error) {
      this.options.ports.log('error', `handling ${message.type} failed: ${errorMessage(error)}`);
      await this.notice('error', `telelean: ${errorMessage(error)}`, false);
    }
  }

  /**
   * Posts the root's current run (any subject: the board shows another subject's run as a compact line) and its
   * proposal, once the runs are recovered. Called on `ready`, when the session is attached and on every RunManager
   * change (`change` says which of the two changed).
   */
  async publishRuns(change: RunChange = ALL_RUN_CHANGES): Promise<void> {
    const runs = this.options.runs;
    if (!runs || !('manager' in runs)) return;
    await runs.recovered;
    if (this.disposed) return;
    const { manager } = runs;
    if (change.run) await this.post(hostMessage('run', { run: this.safely(() => manager.current(), null, 'current()') }));
    if (change.proposal) await this.post(hostMessage('proposal', { proposal: this.safely(() => manager.proposal(), null, 'proposal()') }));
    if (change.session) await this.post(hostMessage('session', { session: this.safely(() => manager.session(), null, 'session()') }));
  }

  /** The workspace changed (typing, saves, refreshes, actions): republish (and switch away from a vanished subject). */
  onWorkspaceChange(change: WorkspaceChange): Promise<void> {
    void change;
    return this.requestPublish();
  }

  /**
   * Posts `workspace` then `graph` for the current subject. Calls during a publish coalesce into one more publish,
   * so a burst of changes costs at most two.
   */
  requestPublish(): Promise<void> {
    if (this.publishing) {
      this.publishAgain = true;
      return this.publishing;
    }
    const run = async () => {
      do {
        this.publishAgain = false;
        await this.publish();
      } while (this.publishAgain && !this.disposed);
    };
    this.publishing = run().finally(() => {
      this.publishing = undefined;
    });
    return this.publishing;
  }

  dispose(): void {
    this.disposed = true;
    this.runSubscription?.dispose();
  }

  // ---------------------------------------------------------------------------------------------

  private enqueue(job: () => Promise<void>): Promise<void> {
    const run = this.queue.then(job);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private enqueueRun(job: () => Promise<void>): Promise<void> {
    const run = this.runQueue.then(job);
    this.runQueue = run.catch(() => undefined);
    return run;
  }

  // ---------------------------------------------------------------------------------------------
  // M2: Claude runs

  /** The root's RunManager once its runs are recovered, or the reason there is none. */
  private async runManager(): Promise<RunManager | string> {
    const runs = this.options.runs;
    if (!runs) return RUNS_UNAVAILABLE;
    if (!('manager' in runs)) return runs.unavailable;
    await runs.recovered;
    return runs.manager;
  }

  private async handleRun(message: RunRequestMessage): Promise<void> {
    const requestId = requestIdOf(message);
    const manager = await this.runManager();
    const outcome =
      typeof manager === 'string'
        ? ({ ok: false, code: 'not-yet', error: manager } as const)
        : await this.run(() => this.dispatchRun(manager, message));
    await this.finishRun(outcome, requestId, message.type);
  }

  private dispatchRun(manager: RunManager, message: RunRequestMessage): Promise<ActionOutcome> {
    switch (message.type) {
      case 'startRun':
        return this.startRun(manager, message.payload.target, message.payload.premises);
      case 'answerQuestions': {
        const { runId, setId, answers } = message.payload;
        return manager.answer(runId, setId, answers);
      }
      case 'cancelRun':
        return manager.cancel(message.payload.runId);
      case 'resumeRun':
        return manager.resume(message.payload.runId);
      case 'acceptProposal': {
        const { runId, proposalId, definitions } = message.payload;
        return manager.accept(runId, proposalId, definitions);
      }
      case 'feedback':
        return manager.feedback(message.payload.runId, message.payload.text);
      case 'discardProposal':
        return manager.discard(message.payload.runId);
      case 'adoptGhost': {
        const { runId, ghostId, rationale } = message.payload;
        return rationale === undefined ? manager.adoptGhost(runId, ghostId) : manager.adoptGhost(runId, ghostId, rationale);
      }
      case 'rejectGhost':
        return manager.rejectGhost(message.payload.runId, message.payload.ghostId);
      case 'dismissRun':
        return manager.dismiss(message.payload.runId);
      case 'openProposalDiff':
        // Read-only: handled outside the queue (handle()); never reaches here.
        return Promise.resolve({ ok: false, code: 'internal', error: 'openProposalDiff is not a queued run message' });
      // Slice 2d (docs/slice2-plan.md 1.1): Formalize (a start, or mid-stage) and Retry step.
      case 'formalize':
        return this.formalize(manager, message.payload);
      case 'retryStep':
        return manager.retry(message.payload.runId);
      // Slice 2 (docs/slice2-plan.md 1.1, 2.4): an edit session's messages (core SESSION_MESSAGE_TYPES) are valid run
      // messages before their routing exists (2e, 2f): answered `not-yet` until then. Named one by one (fixer 2c1 r1,
      // C-V2C1-C6), so the switch stays exhaustive: a run message nobody routes fails to compile; 2e and 2f each take
      // their own label out as they route it.
      case 'decideItems':
      case 'revealResult':
      case 'sessionUndo':
      case 'sessionRedo':
      case 'submitReview':
      case 'endSession':
      case 'openSessionDiff':
      case 'moveProposed':
        return Promise.resolve({ ok: false, code: 'not-yet', error: REVIEW_TEXTS.notBuiltYet });
    }
  }

  /**
   * Formalize for dependencies (spec v4.1 ES-2; the board's Context Menu): refused at once while a run of this root is
   * active. Slice 1f (ES-7, ES-9): from the request on the board is locked for the edits that arrive after it, and the
   * board edits that reached the host before it are applied first (the queue), so the shadow the RunManager makes from
   * the user's files (the run's base) includes them and nothing changes those files afterwards. Slice 1e: then the
   * start's check on the files as they are now (core `formalizeStartProblem`, docs/slice1-plan.md 2.5: every premise
   * the source of an arrow drawn into the target, or none for a target marked "follows from nothing"; every
   * proposition premise with a `.holds`; no cycle of arrows anywhere in the subject, named, since 2b2: AP-29, G2), before the egress
   * consent (asked once per root); then the RunManager, which runs preflight. Nobody declares premises any more (the
   * arrows are in the files). The subject is the one the board showed when the button was pressed.
   */
  private async startRun(manager: RunManager, target: string, premises: readonly string[]): Promise<ActionOutcome> {
    const subject = this.current;
    if (!subject) return { ok: false, code: 'invalid', error: 'This model has no subject yet: create one first ("New subject…").' };
    const busy = busyRefusal(this.safely(() => manager.current(), null, 'current()'));
    if (busy) return { ok: false, code: 'conflict', error: busy };
    await this.queue;
    const problem = this.formalizeProblem(subject, target, premises);
    if (problem !== undefined) return { ok: false, code: 'invalid', error: problem };
    if (!(await this.options.ports.claudeConsent())) return { ok: false, code: 'not-yet', error: CONSENT_DECLINED };
    await this.queue;
    return await manager.start({ subject, target, premises: [...premises] });
  }

  /**
   * Slice 2d (docs/slice2-plan.md 3.2, 2.4): Formalize for dependencies with one or more targets. A start (no `runId`):
   * as `startRun` (busy, the edits sent before it, the check, consent), the check being core `formalizeStartProblems`
   * on the board, then `runs.formalize`. A mid-stage Formalize (`runId` and `stage`): straight to the RunManager, which
   * checks it on the session's own records and refuses it while a step runs (D2-62); no busy refusal (the session is
   * the active run) and no consent question (it continues the consented session).
   */
  private async formalize(manager: RunManager, payload: FormalizeMessage['payload']): Promise<ActionOutcome> {
    const inferences = payload.inferences.map((i) => ({ target: i.target, premises: [...i.premises] }));
    const subject = this.current;
    if (payload.runId !== undefined && payload.stage !== undefined) {
      return await manager.formalize({ subject, inferences, runId: payload.runId, stage: payload.stage });
    }
    if (!subject) return { ok: false, code: 'invalid', error: 'This model has no subject yet: create one first ("New subject…").' };
    const busy = busyRefusal(this.safely(() => manager.current(), null, 'current()'));
    if (busy) return { ok: false, code: 'conflict', error: busy };
    await this.queue;
    let graph: TlGraph;
    try {
      graph = this.options.workspace.graph(subject);
    } catch (error) {
      return { ok: false, code: 'invalid', error: `The subject ${subject} could not be loaded: ${errorMessage(error)}` };
    }
    const problem = formalizeStartProblems(graph, inferences)[0];
    if (problem !== undefined) return { ok: false, code: 'invalid', error: problem.text };
    if (!(await this.options.ports.claudeConsent())) return { ok: false, code: 'not-yet', error: CONSENT_DECLINED };
    await this.queue;
    return await manager.formalize({ subject, inferences });
  }

  /** Slice 1e: the start's check on the subject's board as the files are now (undefined: it may start). */
  private formalizeProblem(subject: string, target: string, premises: readonly string[]): string | undefined {
    let graph: TlGraph;
    try {
      graph = this.options.workspace.graph(subject);
    } catch (error) {
      return `The subject ${subject} could not be loaded: ${errorMessage(error)}`;
    }
    return formalizeStartProblem({ nodes: graph.nodes, edges: graph.edges, subject }, target, premises);
  }

  /**
   * Spec v4 ES-9, UN-3 (slice 1f): why the model folder's files cannot change now (core EDIT_SESSION_ACTIVE), or
   * undefined, for a message that reached the host as number `arrival`. Locked while a start that arrived before it is
   * on its way (slice 1e: a start that arrived after it does not lock it, since the start waits for it), and while the
   * root's run is active (any subject, any state before it ends). Waits for the runs of an earlier window to be recovered
   * first, so a recovered run locks the board from the first message on. A RunManager whose `current()` throws is
   * logged and locks nothing (Accept still refuses while the files differ from the run's base, ES-7).
   */
  private async editLock(arrival: number): Promise<string | undefined> {
    const startedBefore = () => [...this.startsOnTheirWay].some((start) => start < arrival);
    if (startedBefore()) return EDIT_SESSION_ACTIVE;
    const runs = this.options.runs;
    if (!runs || !('manager' in runs)) return undefined;
    await runs.recovered;
    if (startedBefore()) return EDIT_SESSION_ACTIVE;
    return runLocksBoard(this.safely(() => runs.manager.current(), null, 'current()')) ? EDIT_SESSION_ACTIVE : undefined;
  }

  /**
   * Reports a run message's outcome like an action's (`actionResult` for a request id; a warning toast for a refusal
   * nobody asked about), with a toast for the successes that change the board (Undo only for an Accept, which is one
   * undoable step), then posts the run so the panel shows the new state even before the RunManager's change event.
   */
  private async finishRun(outcome: ActionOutcome, requestId: string | undefined, type: RunRequestType): Promise<void> {
    if (requestId) await this.post(hostMessage('actionResult', { requestId, outcome }));
    if (outcome.ok) {
      if (RUN_SUCCESS_NOTICES.has(type)) await this.notice('info', outcome.label, type === 'acceptProposal' && outcome.undoable);
    } else if (!requestId) {
      await this.notice(outcome.code === 'internal' ? 'error' : 'warning', outcome.error, false);
    } else {
      this.options.ports.log(outcome.code === 'internal' ? 'error' : 'info', `${type} refused (${outcome.code}): ${outcome.error}`);
    }
    await this.publishRuns({ run: true, proposal: false, session: true });
    // An Accept changed the files (a start declares nothing since slice 1e): the undo label and graph follow.
    if (outcome.ok && (type === 'startRun' || type === 'formalize' || type === 'acceptProposal')) await this.requestPublish();
  }

  /** "Raw Lean diff…": the proposal's files (the run's base left, the proposal right), optionally one of them. */
  private async openProposalDiff({ runId, proposalId, file }: OpenProposalDiffMessage['payload']): Promise<void> {
    const manager = await this.runManager();
    if (typeof manager === 'string') {
      await this.notice('warning', manager, false);
      return;
    }
    let files: FileChange[];
    try {
      files = await manager.proposalDiff(runId, proposalId);
    } catch (error) {
      await this.notice('warning', `Could not open the raw Lean diff: ${errorMessage(error)}`, false);
      return;
    }
    const shown = file === undefined ? files : files.filter((f) => f.path === file);
    if (shown.length === 0) {
      await this.notice('info', file === undefined ? 'This proposal changes no files.' : `This proposal does not change ${file}.`, false);
      return;
    }
    const proposal = this.safely(() => manager.proposal(), null, 'proposal()');
    const title = proposalDiffTitle({
      ...(proposal?.proposalId === proposalId ? { subject: proposal.subject, round: proposal.round } : {}),
      ...(file !== undefined ? { file } : {}),
    });
    try {
      await this.options.ports.showProposalDiff({ runId, proposalId, title, files: shown });
    } catch (error) {
      await this.notice('warning', `Could not open the raw Lean diff: ${errorMessage(error)}`, false);
    }
  }

  /** A RunManager read that must not break the board (a bug there is logged, the board shows `fallback`). */
  private safely<T>(read: () => T, fallback: T, what: string): T {
    try {
      return read();
    } catch (error) {
      this.options.ports.log('error', `runs.${what} failed: ${errorMessage(error)}`);
      return fallback;
    }
  }

  private async handleInOrder(message: WebviewToHostMessage, arrival: number): Promise<void> {
    if (isActionMessage(message) || LOCKED_NON_ACTIONS.has(message.type)) {
      // ES-9, UN-3 (slice 1f): refused before planning while an edit session (a run) is active.
      const locked = await this.editLock(arrival);
      if (locked !== undefined) return this.finish({ ok: false, code: 'conflict', error: locked }, requestIdOf(message), 'action');
    }
    if (isActionMessage(message)) return this.performMessage(message);
    const ws = this.options.workspace;
    switch (message.type) {
      case 'undo':
        return this.finish(await this.run(() => ws.undo(this.current)), message.payload.requestId, 'undo');
      case 'redo':
        return this.finish(await this.run(() => ws.redo(this.current)), message.payload.requestId, 'redo');
      case 'selectSubject':
        return this.selectSubject(message.payload.subject);
      case 'historyRevert': {
        const { subject, entryId, requestId } = message.payload;
        return this.finish(await this.run(() => ws.revert(subject, entryId)), requestId, 'revert');
      }
      case 'historyPrune':
        return this.prune(message.payload.subject, message.payload.keepLast, message.payload.requestId);
      case 'initGit':
        return this.initGit(message.payload.requestId);
      default:
        this.options.ports.log('warn', `unhandled message ${message.type}`);
    }
  }

  private async performMessage(message: ActionMessage): Promise<void> {
    const requestId = requestIdOf(message);
    const action = toBoardAction(message, this.current);
    if (!action) return this.finish({ ok: false, code: 'not-yet', error: SELF_EVIDENT_NOT_YET }, requestId, 'action');
    if (action.kind === 'add-node' && !this.current) {
      return this.finish({ ok: false, code: 'invalid', error: 'This model has no subject yet: create one first ("New subject…").' }, requestId, 'action');
    }
    const outcome = await this.run(() => this.options.workspace.perform(action));
    if (action.kind === 'create-subject' && outcome.ok && this.hasSubject(action.name)) this.switchTo(action.name);
    return this.finish(outcome, requestId, 'action');
  }

  private async run(job: () => Promise<ActionOutcome>): Promise<ActionOutcome> {
    try {
      return await job();
    } catch (error) {
      return outcomeFromError(error);
    }
  }

  /**
   * Reports an outcome: `actionResult` when the webview asked with a request id; an info notice with the label on
   * success (with Undo unless it was itself an undo/redo, where Undo would undo the previous action instead).
   * A refusal is shown once: the webview shows `outcome.error` itself for every request it made (or opens the
   * dependents dialog for `needs-confirmation`), so the host adds a warning notice only when there was no request id.
   */
  private async finish(outcome: ActionOutcome, requestId: string | undefined, kind: OutcomeKind): Promise<void> {
    if (requestId) await this.post(hostMessage('actionResult', { requestId, outcome: this.withDependentCards(outcome) }));
    if (outcome.ok) {
      await this.notice('info', outcome.label, outcome.undoable && kind !== 'undo' && kind !== 'redo');
    } else if (!requestId) {
      await this.notice(outcome.code === 'internal' ? 'error' : 'warning', outcome.error, false);
    } else {
      this.options.ports.log(outcome.code === 'internal' ? 'error' : 'info', `refused (${outcome.code}): ${outcome.error}`);
    }
    await this.requestPublish();
  }

  /**
   * A `needs-confirmation` answer lists its dependents as card ids or Lean names, and the board's graph holds only its
   * own subject's cards. Adds `dependentCards`: every dependent that is a card, in any subject, with its subject, kind
   * and sentence, so the board can show another subject's card by its sentence rather than its id.
   */
  private withDependentCards(outcome: ActionOutcome): ActionOutcome {
    if (outcome.ok || outcome.code !== 'needs-confirmation' || !outcome.dependents?.length) return outcome;
    const wanted = new Set(outcome.dependents);
    const cards: Record<string, DependentCard> = {};
    const subjects = this.subjects().map((s) => s.name);
    for (const subject of [...subjects.filter((s) => s === this.current), ...subjects.filter((s) => s !== this.current)]) {
      if (wanted.size === 0) break;
      let graph: TlGraph;
      try {
        graph = this.options.workspace.graph(subject);
      } catch (error) {
        this.options.ports.log('warn', `graph(${subject}) failed: ${errorMessage(error)}`);
        continue;
      }
      for (const node of graph.nodes) {
        if (!wanted.delete(node.id)) continue;
        cards[node.id] = { subject: node.subject || subject, type: node.type, naturalName: node.naturalName };
      }
    }
    return Object.keys(cards).length > 0 ? { ...outcome, dependentCards: cards } : outcome;
  }

  private async selectSubject(subject: string): Promise<void> {
    if (!this.hasSubject(subject)) {
      await this.notice('warning', `There is no subject "${subject}" (any more).`, false);
    } else {
      this.switchTo(subject);
    }
    await this.requestPublish();
  }

  private async listHistory(subject: string, limit: number | undefined): Promise<void> {
    let listing: HistoryListing;
    try {
      listing = await this.options.workspace.listHistory(subject, limit);
    } catch (error) {
      if (!isNoHistory(error)) await this.notice('warning', `History: ${errorMessage(error)}`, false);
      listing = emptyHistoryListing(subject);
    }
    await this.post(hostMessage('history', { listing }));
  }

  private async preview(subject: string, entryId: string, compare: 'parent' | 'current'): Promise<void> {
    try {
      const diff = await this.options.workspace.historyDiff(subject, entryId, compare);
      if (diff.files.length === 0) {
        await this.notice('info', compare === 'current' ? 'No differences: the files match this entry.' : 'This entry changed no files.', false);
        return;
      }
      await this.options.ports.showHistoryDiff(diff);
    } catch (error) {
      await this.notice('warning', `Could not preview this history entry: ${errorMessage(error)}`, false);
    }
  }

  private async prune(subject: string, keepLast: number, requestId: string | undefined): Promise<void> {
    let outcome: ActionOutcome;
    try {
      const listing = await this.options.workspace.prune(subject, keepLast);
      await this.post(hostMessage('history', { listing }));
      outcome = { ok: true, label: `History of ${subject}: kept the last ${keepLast} ${keepLast === 1 ? 'entry' : 'entries'}`, undoable: false };
    } catch (error) {
      outcome = outcomeFromError(error);
    }
    return this.finish(outcome, requestId, 'action');
  }

  private async initGit(requestId: string | undefined): Promise<void> {
    const yes = await this.options.ports.confirm(
      'initGit',
      `Initialize a git repository in "${this.options.rootName}" for telelean's history?`,
      INIT_GIT_DETAIL,
      'Initialize git',
    );
    if (!yes) {
      // Declining is a choice, not an error: an info notice (no error toast in the webview).
      return this.finish({ ok: true, label: 'Not initialized: history stays off.', undoable: false }, requestId, 'action');
    }
    let outcome: ActionOutcome;
    try {
      const availability = await this.options.workspace.initGit();
      outcome =
        availability.state === 'ready'
          ? { ok: true, label: `Initialized a git repository in "${this.options.rootName}" for telelean's history`, undoable: false }
          : { ok: false, code: 'no-history', error: describeAvailability(availability) };
    } catch (error) {
      outcome = outcomeFromError(error);
    }
    return this.finish(outcome, requestId, 'action');
  }

  private async copy(text: string): Promise<void> {
    try {
      await this.options.ports.writeClipboard(text);
      await this.notice('info', 'Copied', false);
    } catch (error) {
      await this.notice('error', `Could not copy: ${errorMessage(error)}`, false);
    }
  }

  private async open(file: string, range: Range | undefined): Promise<void> {
    let absPath: string;
    try {
      absPath = await this.options.ports.resolveFile(file);
    } catch (error) {
      this.options.ports.log('warn', `openInEditor ${errorMessage(error)}`);
      await this.notice('warning', `Not opened: ${errorMessage(error)}`, false);
      return;
    }
    try {
      await this.options.ports.openFile(absPath, range);
    } catch (error) {
      await this.notice('warning', `Could not open ${file}: ${errorMessage(error)}`, false);
    }
  }

  private async refresh(): Promise<void> {
    try {
      await this.options.workspace.refreshNow();
    } catch (error) {
      await this.notice('warning', `Lean refresh failed: ${errorMessage(error)}`, false);
    }
    await this.requestPublish();
  }

  // ---------------------------------------------------------------------------------------------

  private async publish(): Promise<void> {
    if (this.disposed) return;
    const vanished = this.ensureSubject();
    if (vanished) {
      await this.notice(
        'info',
        this.current ? `Subject "${vanished}" no longer exists; showing "${this.current}".` : `Subject "${vanished}" no longer exists.`,
        false,
      );
    }
    await this.post(hostMessage('workspace', { state: await this.workspaceState() }));
    if (!this.current) return;
    try {
      await this.post(hostMessage('graph', { graph: this.options.workspace.graph(this.current) }));
    } catch (error) {
      this.options.ports.log('error', `graph(${this.current}) failed: ${errorMessage(error)}`);
    }
  }

  /** Switches away from a subject that no longer exists; returns its name when it did. */
  private ensureSubject(): string | undefined {
    if (this.current && this.hasSubject(this.current)) return undefined;
    const previous = this.current;
    const next = this.pickSubject(undefined);
    if (next === previous) return undefined;
    this.current = next;
    if (next) this.options.ports.subjectChanged(next);
    return previous || undefined;
  }

  private switchTo(subject: string): void {
    if (subject === this.current) return;
    this.current = subject;
    this.options.ports.subjectChanged(subject);
  }

  private subjects(): SubjectInfo[] {
    try {
      return this.options.workspace.subjects();
    } catch (error) {
      this.options.ports.log('error', `subjects() failed: ${errorMessage(error)}`);
      return [];
    }
  }

  private hasSubject(subject: string): boolean {
    return this.subjects().some((s) => s.name === subject);
  }

  private pickSubject(preferred: string | undefined): string {
    const subjects = this.subjects();
    if (preferred && subjects.some((s) => s.name === preferred)) return preferred;
    return subjects[0]?.name ?? '';
  }

  private async workspaceState(): Promise<WorkspaceState> {
    try {
      return await this.options.workspace.workspaceState(this.current);
    } catch (error) {
      this.options.ports.log('warn', `workspaceState(${this.current}) failed: ${errorMessage(error)}`);
      return {
        rootName: this.options.rootName,
        subjects: this.subjects().map((s) => ({ name: s.name, nodeCount: s.nodeCount })),
        subject: this.current,
        undo: null,
        redo: null,
        history: { state: 'error', detail: errorMessage(error) },
      };
    }
  }

  private notice(level: NoticeLevel, text: string, undoable: boolean): Promise<boolean> {
    const id = `n${Date.now().toString(36)}-${++this.notices}`;
    const clipped = text.length > LIMITS.textLength ? `${text.slice(0, LIMITS.textLength - 1)}…` : text;
    return this.post(hostMessage('notice', { id, level, text: clipped, undoable }));
  }

  private async post(message: HostToWebviewMessage): Promise<boolean> {
    if (this.disposed) return false;
    try {
      return await this.options.ports.post(message);
    } catch (error) {
      this.options.ports.log('warn', `posting ${message.type} failed: ${errorMessage(error)}`);
      return false;
    }
  }
}
