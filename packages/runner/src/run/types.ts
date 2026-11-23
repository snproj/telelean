/**
 * The run controller (WP3; docs/m2-plan.md sections 2 and 4): one RunManager per model root, at most one active run
 * per root. It owns the run's state machine, the LLM session (ClaudeCliBackend or FakeBackend behind LlmBackend), the
 * AgentToolHost the session's tools call (check_lean, freeze_statements, ask_user, propose_assumption, finish), the
 * caps and the agent-active clock, usage, the gate loop (A2: retry with the exact failures, give up after
 * maxGateAttempts and revert the shadow to the last state that passed), ghost adoption and re-freeze, Feedback, Accept
 * (via the ProposalService and ModelWorkspace.applyChanges), Discard, Cancel, persistence (run.json) and recovery after
 * a window reload. It never runs Lean itself (LeanCheckEngine) and never writes the user's files except through
 * ModelWorkspace.applyChanges (Accept); slice 1e: start() no longer calls ModelWorkspace.perform (the arrows are drawn
 * on the board before a run, spec v4.1 AR-4).
 *
 * FROZEN CONTRACT (M2). Owner: WP3. Additive optional members / new exports only (docs/m2-plan.md section 14).
 */
import type {
  ActionOutcome,
  applyBackstop,
  ArrowEnds,
  AttemptRecord,
  attemptNotice,
  CanvasPosition,
  DecisionRecord,
  decisionsInForce,
  describeFinding,
  FileChange,
  FinalCheckRule,
  GateAttemptView,
  GhostView,
  ItemDecision,
  ItemRecord,
  LedgerEntry,
  PremiseDraft,
  Phenomenon as CorePhenomenon,
  planGhostAdoption,
  ProjectModel,
  proposalLabel,
  ProposalView,
  QuestionAnswer,
  ReviewAction,
  RunCaps,
  RunCounters,
  RunView,
  SealBy,
  Selection,
  SessionAction,
  SessionForce,
  SessionInference,
  SessionView,
  StepScope,
  StepState,
  TlGraph,
} from '@telelean/core';

import type { ResolveBinaryOptions } from '../llm/binary.js';

import type { FreezeRecord, LeanCheckEngine } from '../gate/types.js';
import type { HookRuntime } from '../llm/confinement.js';
import type { AskUserArgs, Effort, FinishArgs, LlmBackend, Phenomenon as LlmPhenomenon } from '../llm/types.js';
import type { ProposalService, RunSidecarStore } from '../proposal/types.js';
import type { CreateShadowOptions, ShadowWorkspace } from '../shadow/types.js';
import type { Disposable, ModelWorkspace, WorkspaceLog } from '../workspace/types.js';

// core's PHENOMENA (the board) and llm's PHENOMENA (the tool schema the model sees) must be the same list.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
export type PhenomenaDriftCheck = Assert<Same<CorePhenomenon, LlmPhenomenon>>;

/** Settings of every run of a root (package.json `telelean.*`, read by the extension; docs/m2-plan.md section 8). */
export interface RunSettings {
  /** `telelean.model`, default `claude-opus-5-5` (D-25). */
  model: string;
  /** `telelean.effort`, default `high` (D-25). */
  effort?: Effort;
  /** `telelean.run.*` (maxTurns 80, maxChecks 25, maxAgentMinutes 20, leanJobSeconds 120, maxGateAttempts 3). */
  caps: RunCaps;
  /** runLean `MemoryMax=` for the run's Lean jobs (`telelean.memory.capGiB`). */
  memoryMax: string;
  /** Memory guard (`telelean.memory.minAvailableGiB`). */
  minAvailableBytes: number;
  /** `telelean.run.contextScope`: the whole subject's cards (default) or only the target, the selection and their closure. */
  contextScope: 'subject' | 'neighbourhood';
  /** `telelean.run.keepRuns`, default 10 (03 section 8.4). */
  keepRuns: number;
  /**
   * `telelean.run.reuseLeanBuild`, default false (closing round 1): seed each run's build mirror from the user's
   * `.lake/build`, only when that tree is exactly what it held right after the board's last refresh, untouched since
   * (shadow/seed.ts; Lake rebuilds any module of it that does not match the run's sources). Off: every run builds its
   * working copy from scratch.
   */
  reuseLeanBuild?: boolean;
}

/**
 * The core functions the RunManager calls (default: `@telelean/core`'s). Reviewer addition, as M1's
 * `ModelWorkspaceOptions.core`: WP3 tests inject fakes while WP1's functions are still stubs.
 */
export interface RunCore {
  attemptNotice: typeof attemptNotice;
  describeFinding: typeof describeFinding;
  planGhostAdoption: typeof planGhostAdoption;
  proposalLabel: typeof proposalLabel;
  decisionsInForce: typeof decisionsInForce;
  /** Slice 2f (§3.10 step 4; additive): the backstop Apply runs again, pure and never reused (tests spy on it). */
  applyBackstop: typeof applyBackstop;
}

/** What the RunManager needs besides the workspace. Everything is injectable (tests use fakes for B/C/D's parts). */
export interface RunServices {
  /**
   * FakeBackend in tests; in the extension a factory called once, at the first start() that passes preflight (lazy:
   * opening a board never resolves or runs a Claude binary). A factory that rejects refuses that start (`not-yet`,
   * with its message, e.g. the binary candidates tried, or "real Claude is disabled in Test mode").
   */
  backend: LlmBackend | (() => Promise<LlmBackend>);
  /** Test hook: replaces some of the core functions the RunManager calls. */
  core?: Partial<RunCore>;
  engine: LeanCheckEngine;
  proposals: ProposalService;
  sidecars: RunSidecarStore;
  /** Default: shadow.createRunShadow. */
  createShadow?: (options: CreateShadowOptions) => Promise<ShadowWorkspace>;
  /** Default: shadow.openRunShadow. */
  openShadow?: (runDir: string, options: { root: string; library: string }) => Promise<ShadowWorkspace>;
  /** Default: runPreflight. */
  preflight?: (input: PreflightInput) => Promise<PreflightOutcome>;
  /** Default: () => new Date(). Drives timestamps and the agent-active clock (tests use vitest fake timers). */
  now?: () => Date;
  /** Default: `r` + base-36 time + 6 random hex digits (matches RUN_ID_PATTERN). */
  newRunId?: () => string;
  log?: WorkspaceLog;
  /**
   * WP3 addition (additive): stops every Lean job of a run on Cancel (default `lean.cancelRun`, which kills the
   * run's `telelean-<runId>-*` scopes). Tests pass a spy.
   */
  cancelLean?: (runId: string) => Promise<unknown>;
}

export interface RunManagerOptions {
  /** Absolute model root. */
  root: string;
  /** Where run directories live (extension: `<globalStorage>/runs`; tests: scratch). */
  runsDir: string;
  /** Must implement the M2 members (applyChanges, readText, modelFiles, library, projectModel, reloadAttempts). */
  workspace: ModelWorkspace;
  services: RunServices;
  settings: RunSettings;
}

export interface RunStartRequest {
  subject: string;
  /** Target node id: a PROPOSITION card of the subject (preflight refuses an AXIOM). */
  target: string;
  /**
   * Selected premise ids: the sources of the arrows the user selected into the target (spec v4.1 ES-2, Formalize for
   * dependencies; may be empty when the question is the target's "follows from nothing" mark). Slice 1e (AR-4, ES-5):
   * the arrows are already in the user's files, drawn on the board, so start() writes no `premises:` of its own (the
   * M2 `set-premises` declaration at start is gone). The caller (the extension) checks the request first
   * (core `formalizeStartProblem`: drawn arrows, proposition premises with a `.holds`, no cycle) and asks for egress
   * consent; it declares nothing either.
   */
  premises: readonly string[];
}

export interface RunChange {
  run: boolean;
  /**
   * M2: the proposal changed. Since 2h nothing posts a proposal (core's `proposal` message is retired, and so is
   * `RunManager.proposal()`): the flag is kept so the emitters stay as they are, and no host reads it.
   */
  proposal: boolean;
  /** Slice 2 (docs/slice2-plan.md 2.5): the edit session's view changed (the host posts `session`). */
  session: boolean;
}

/** Slice 2 (docs/slice2-plan.md 2.5): `formalize`'s request: a start (no `runId`), or a mid-stage Formalize (both). */
export interface FormalizeRequest {
  subject: string;
  inferences: ReadonlyArray<{ target: string; premises: readonly string[] }>;
  runId?: string;
  stage?: number;
}

/**
 * One root's runs. Every method resolves (never rejects) with an ActionOutcome for the board's `actionResult`;
 * refusals: `not-found` (unknown or stale run/question ids), `conflict` (another active run, wrong state), `invalid`
 * (bad answers), `not-yet` (preflight problems the user can fix), `internal`.
 *
 * Slice 2h (docs/slice2-plan.md 1.1): M2's review is retired: `proposal()`, `accept`, `feedback`, `discard`,
 * `adoptGhost`, `rejectGhost` and `proposalDiff` are gone. Every start is an edit session, reviewed by its items
 * (`session()`, `decide`, …, `end`); a run of version 1 is converted into one when it is recovered in review, or when a
 * round it resumed ends (§3.11, D2-16).
 */
export interface RunManager extends Disposable {
  /** The root's current run (the newest non-dismissed one), or null. */
  current(): RunView | null;
  onDidChange(listener: (change: RunChange) => void): Disposable;
  /**
   * Preflight, the backend (factory, first time; `claude --version` only), the premises declaration (see
   * RunStartRequest.premises), shadow, session, first turn (context bundle). Resolves once the run is `working` (or
   * failed). A preflight or backend refusal changes nothing: no declaration, no run directory, no process.
   */
  start(request: RunStartRequest): Promise<ActionOutcome>;
  /** Answers the pending ask_user batch; records the decisions; resumes the clock (or the session after a reload). */
  answer(runId: string, setId: string, answers: readonly QuestionAnswer[]): Promise<ActionOutcome>;
  /** Interrupt + `lean.cancelRun(runId)` + close the session; state `cancelled`; shadow and transcript kept. */
  cancel(runId: string): Promise<ActionOutcome>;
  /** An `interrupted` run: a new CLI process with `--resume <sessionId>` and a resume turn. */
  resume(runId: string): Promise<ActionOutcome>;
  /** Forgets an ended run (terminal state) on the board; its directory stays until pruned. */
  dismiss(runId: string): Promise<ActionOutcome>;
  /** After activation: loads the root's non-terminal runs from run.json (questions and sessions come back). */
  recover(): Promise<void>;

  // ---- Slice 2 (docs/slice2-plan.md 2.5): an edit session. `start(request)` is a one-inference `formalize`. While a
  // step runs (phases `step` and `interrupted`), decide, reveal, undoSession, redoSession, submit, retry, sessionDiff,
  // moveProposed, a mid-stage formalize and `end` other than `exit` answer `refused` with D2-62's text. `cancel` is
  // Cancel step in a session: it never ends the session. When each call resolves (D2-74): formalize, submit and retry
  // once their queue's first step is working; decide, reveal, the Undo and Redo and moves after their write's step 4.

  /**
   * The root's current session view (masked while the results are hidden), or null when the run is no session. 2k1
   * (D2-100 D1): null too once the session's run has ended, by any path, from the run.json write that ends it.
   */
  session(): SessionView | null;
  /** ES-1, RV-9: starts a session (no `runId`), or queues a mid-stage Formalize of the current stage (`runId`, `stage`). */
  formalize(request: FormalizeRequest): Promise<ActionOutcome>;
  /**
   * RV-3, RV-8, DO-0/1/3 (2e): core `reduceReview`'s decide on the records and the stage judgement, carried out through
   * the session's write queue; resolves after its write's step 4, before the judge it starts (D2-74).
   */
  decide(runId: string, stage: number, own: boolean, decisions: readonly ItemDecision[], confirmed: boolean): Promise<ActionOutcome>;
  /** RV-6's Show results (2e): every Result of the stage at once, noted as seen early. */
  reveal(runId: string, stage: number, via: 'show-result' | 'activity'): Promise<ActionOutcome>;
  /** UN-4: the session stack, by the SessionAction id the user saw (2e). */
  undoSession(runId: string, step: number, confirmed: boolean): Promise<ActionOutcome>;
  redoSession(runId: string, step: number, confirmed: boolean): Promise<ActionOutcome>;
  /**
   * RV-12 (2e): waits while the session judges (AF3), then the end confirmation (phase `confirming`, no seal) or the
   * take-out and one queue of Submit steps; resolves once that queue's first step works, or once `confirming`.
   */
  submit(runId: string, stage: number, comment?: string): Promise<ActionOutcome>;
  /**
   * 2j2 (D2-92, D2-95): the note for Claude on an item to be redone (`rev` the version the user saw), set, replaced or
   * (blank) cleared: core `reduceReview`'s `note`, one session-stack step, a records-only write.
   */
  note(runId: string, stage: number, item: string, rev: number, note: string): Promise<ActionOutcome>;
  /**
   * EN-1-EN-4 (2f, §3.10): Apply (the check id of a passed final check; drift and the backstop again, then exactly F with
   * the endorsements and the moved cards' positions, one history entry; the attempt records; the run ends `accepted`),
   * Exit (stops a running step; the attempt records, discarded; the run ends `discarded`; the files untouched), or Back
   * to review (the submitted stage, unsubmitted, the stack as it was). Exit is the one not refused while a step runs.
   */
  end(runId: string, decision: 'apply' | 'exit' | 'back', stage?: number, check?: string): Promise<ActionOutcome>;
  /** ES-4: runs the cancelled or failed step and the steps its queue dropped, as a new queue (D2-44, D2-55). */
  retry(runId: string): Promise<ActionOutcome>;
  /** The session's raw Lean diff; `needs-confirmation` while the results are hidden, unless `confirmed` (2e). */
  sessionDiff(runId: string, stage: number, confirmed: boolean): Promise<{ ok: true; kind: 'diff'; files: FileChange[] } | ActionOutcome>;
  /** Moves on the Proposed view (2f, D2-33): one session-stack step; Apply writes the positions into layout.json. */
  moveProposed(runId: string, positions: Readonly<Record<string, CanvasPosition>>): Promise<ActionOutcome>;
  /**
   * Window closing: an active run is persisted as `interrupted` (a waiting question or a proposal as it is) and its
   * session closed. May return a promise that resolves once run.json holds that final state (integrator addition:
   * the extension waits for it, at most 4 s); callers that ignore it still get the synchronous write.
   */
  dispose(): void | Promise<void>;
}

// ---------------------------------------------------------------------------------------------
// Preflight (03 section 8.4 "Preflight"; m0-report: refuse before any prompt, so a refusal costs no quota)

export interface PreflightInput {
  root: string;
  workspace: ModelWorkspace;
  request: RunStartRequest;
  settings: RunSettings;
  /** WP3 addition (additive): the root's active (non-terminal) run, if any: preflight refuses `busy`. */
  activeRunId?: string;
  /** WP3 addition (additive), test hook: replaces `lean.checkSandboxSupport()` and `lean.checkUserNamespaces()` (a reason = refused). */
  checkSandbox?: () => Promise<string | undefined>;
  /** WP3 addition (additive), test hook: replaces reading MemAvailable from /proc/meminfo (bytes; undefined = unknown). */
  readMemAvailable?: () => number | undefined;
}

export type PreflightProblem =
  /** `lean-toolchain` is not leanprover/lean4:v4.35.0 (D-7): no runs or gate in syntactic mode. */
  | 'toolchain'
  /** bwrap / systemd-run --user / cgroup v2 / setpriv missing (lean.checkSandboxSupport), or bwrap cannot create its namespaces (lean.checkUserNamespaces). */
  | 'sandbox'
  /** MemAvailable below the guard. */
  | 'memory'
  /** The target or a premise is not a card of the subject, or the target is selected as a premise. */
  | 'selection'
  /** The workspace lacks the M2 members, or the model has load errors. */
  | 'workspace'
  /** Another run of this root is active. */
  | 'busy';

export type PreflightOutcome = { ok: true } | { ok: false; problem: PreflightProblem; message: string };

// ---------------------------------------------------------------------------------------------
// The Claude backend (amendment A1; m0-report "Design changes learned in M0", item 3)

export interface ClaudeBackendSettings {
  /** `telelean.claude.path` (when set it must work: no silent fallback). */
  claudePath?: string;
  /** Absolute path of telelean-path-guard.mjs (the extension copies it to `dist/bin/`; never via import.meta.url in a CJS bundle). */
  guardScriptPath: string;
  /** How the hook runs Node (default llm.defaultHookRuntime(): a real `node`, else Electron as Node). */
  hookRuntime?: HookRuntime;
  /** CLAUDE_AGENT_SDK_CLIENT_APP, e.g. `telelean/0.0.1`. */
  clientApp: string;
  /** VS Code extension directories searched for the Claude Code extension's binary (default ~/.vscode/extensions…). */
  extensionDirs?: string[];
  /**
   * Launch the CLI as `setpriv --pdeathsig KILL -- <claude> …` (default true) so a SIGKILLed extension host takes the
   * CLI down (m0-report open item "a watchdog is needed if the extension host is SIGKILLed"). The launcher uses the
   * absolute setpriv path (lean/systemd `findSystemExecutable('setpriv')`), not a PATH lookup.
   */
  pdeathsig?: boolean;
  /**
   * Reviewer addition, test hooks for the binary search (llm/binary.ts): tests pass a scratch `home`, `pathEnv` and
   * `extensionDirs` holding fake binaries (or `runVersion`), so the real PATH, `~/.local/bin` and `~/.vscode` are never
   * scanned and no real binary is ever run, not even with `--version`.
   */
  resolve?: Pick<ResolveBinaryOptions, 'home' | 'pathEnv' | 'env' | 'runVersion'>;
}

// ---------------------------------------------------------------------------------------------
// Prompts (docs/m2-plan.md section 5: what leaves the machine)

export interface ContextBundleInput {
  /** The project model at run start (workspace.projectModel()). */
  model: ProjectModel;
  /** The subject's board at run start (workspace.graph(subject)). */
  graph: TlGraph;
  library: string;
  selection: Selection;
  /** core decisionsInForce(decisions.json, subject, target + premises). */
  decisions: readonly DecisionRecord[];
  caps: RunCaps;
  scope: RunSettings['contextScope'];
}

// ---------------------------------------------------------------------------------------------
// Persistence (run.json inside the run directory; written after every state change, atomically)

export const PERSISTED_RUN_FORMAT = 'telelean-run' as const;

export interface PersistedGhost extends GhostView {
  /** The checked gap proof (Claude's term) and its footprint. */
  proof: string;
  footprint: string[];
}

export interface PersistedRun {
  format: typeof PERSISTED_RUN_FORMAT;
  /** 1: M2's runs (and slice 1's). 2 (slice 2): an edit session, `session` set (docs/slice2-plan.md 2.6). */
  version: 1 | 2;
  root: string;
  library: string;
  /** What the board shows. `pendingQuestions` never contains Claude's guesses (they are in `pendingAsk`). */
  view: RunView;
  selection: Selection;
  backendId: string;
  /** The LLM session id (for `--resume`). */
  sessionId?: string;
  /** The ask_user batch in flight, with Claude's guesses (revealed after answering). */
  pendingAsk?: { setId: string; args: AskUserArgs; askedAt: string };
  /** Answers given while no tool call could receive them (after a reload): delivered as the next user turn. */
  undeliveredAnswers?: { setId: string; answers: QuestionAnswer[] };
  /**
   * (slice 2, fixer 2d r1, F-V2D-FC-5 / A-F5; additive) A session step's own turn that no Claude session received: its
   * step started with no live session and `--resume` failed. Resume sends it instead of the generic resume turn, so
   * Claude never works a step without its target, question and limits; cleared once a session received it.
   */
  undeliveredTurn?: string;
  /** One per round that froze; the last one is the current round's when `view.frozen` is set. */
  freezes: FreezeRecord[];
  /** The shadow commit where the current round started. */
  roundStartCommit?: string;
  ghosts: PersistedGhost[];
  gateAttempts: GateAttemptView[];
  /** The finish arguments of the latest attempt. */
  lastFinish?: FinishArgs;
  proposal?: ProposalView;
  clocks: {
    /** Agent-active ms of the current round (the cap) and of the whole run. */
    roundAgentMs: number;
    totalAgentMs: number;
    startedAt: string;
  };
  /** Slice 2 (version 2): the edit session. A session's rounds are its steps (one round per step, fresh caps each). */
  session?: PersistedSession;
}

// ---------------------------------------------------------------------------------------------
// Slice 2: an edit session's persisted records (docs/slice2-plan.md 2.6, 2.9)

export const PERSISTED_SESSION_FORMAT = 'telelean-session' as const;

/**
 * A write to ws/ that `recover()` can run again (§2.6's write order); all of a session's writes run in one queue.
 * 2d writes `queue-start` and `judge-apply`; 2e `decide` and `submit-take-out`; 2f `premise` and `completion`.
 */
export type SessionWrite =
  | { kind: 'decide'; action: ReviewAction }
  /**
   * Reads `holdAs` and `rationale` from the item's `accepted` record. Its Lean job is `engine.writePremise`; its step 4
   * sets the record's `fingerprint` and `accepted.fingerprint` to the written item's content key (§3.8). `premise` and
   * `completion` are due writes: the action that makes one due enqueues it, `recover()` enqueues every one still due,
   * and each does nothing when, at its step 1, it is no longer due (§3.8, AF2).
   */
  | { kind: 'premise'; item: string }
  | { kind: 'completion'; item: string }
  /**
   * The judge's whole outcome: planned inside the queue on the current records, dropped when the head is no longer
   * `judged` (§2.6, F8). `queueSteps`: the steps of the queue it ends, if it ends one (reconcile's input, AF1).
   */
  | { kind: 'judge-apply'; judged: string; queueSteps?: string[] }
  /** Submit's take-out before its queue starts (§3.7, D2-57). */
  | { kind: 'submit-take-out'; items: string[] }
  /**
   * The start of a queue of Claude steps in a stage (a mid-stage Formalize, Submit review, Retry step): its seal, its
   * steps queued, and its first step's `step-start` commit and StepScope. It is the write queue's last write; after a
   * crash the queue waits for Resume or Cancel step, as between two steps (§3.3, §3.11, AF3). `inferences`: a
   * mid-stage Formalize's new inferences and its re-asked targets' questions (builder 2d; additive), so a replay
   * after a crash queues the same steps. `submit`: a Submit review's steps, in order, each its inference's target and
   * what it opens (builder 2e; additive), so a replay rebuilds them exactly (fixer 2d r1, A-F7).
   */
  | {
      kind: 'queue-start';
      by: SealBy;
      steps: string[];
      inferences?: Array<{ target: string; premises: string[] }>;
      submit?: Array<{ target: string; openItems: string[]; openProof: boolean }>;
      /** (2j2, D2-92, D2-96; additive) Submit review's overall comment, which its seal keeps. */
      comment?: string;
    };

/** One step of a session's queue (§2.6). Its round is the run's round while it runs (fresh caps per step). */
export interface PersistedStep {
  id: string;
  kind: 'formalize' | 'submit';
  target: string;
  stage: number;
  /** The step's limits; for a re-asked target, `scope.question` is the new question (§3.2). */
  scope: StepScope;
  retryOf?: string;
  /** A statements-only step (A12, D2-4) ends `passed` (or `gave-up`). */
  state: StepState;
  /** The queue it runs in, numbered from 1 in the session (2d sets it when the queue starts). */
  queue?: number;
  /** (builder 2d; additive) The run's round while this step ran: its freezes and gate attempts carry it. */
  round?: number;
  startCommit?: string;
  freezeCommit?: string;
  endCommit?: string;
  freezes: FreezeRecord[];
  gateAttempts: GateAttemptView[];
  lastFinish?: FinishArgs;
  counters: RunCounters;
  agentMs: number;
  /** Written to attempts.jsonl only when the session ends (D2-11). Never set for a step that never ran. */
  attempt?: AttemptRecord;
  /**
   * (fixer 2d r1, F-V2D-FC-1; additive) RV-13: the step passed and proposed nothing: the files it ended on (its gate's,
   * before any re-ask take-back) equal its S₀'s, and it proposed no arrow and no premise. Its report line, "Claude's
   * step proposed nothing: ‹reason›", is shown with the results.
   */
  proposedNothing?: true;
}

/** §2.6: the session of a version-2 run.json. What core reads of it is `SessionRecords` (`toSessionRecords`). */
export interface PersistedSession {
  format: typeof PERSISTED_SESSION_FORMAT;
  version: 1;
  stage: number;
  phase: SessionView['phase'];
  inferences: SessionInference[];
  steps: PersistedStep[];
  /** Step ids still to run in the current queue. */
  queue: string[];
  /** After a Cancel step or a failure: the cancelled or failed step and the steps of its queue that it dropped. */
  retry: string[];
  items: ItemRecord[];
  /** The next SessionAction id (never reused in the session). */
  nextAction: number;
  /** Add premise drafts, outside ws/ until accepted. */
  premises: PremiseDraft[];
  ledger: LedgerEntry[];
  /** DO-0. */
  rejectedArrows: ArrowEnds[];
  stack: { done: SessionAction[]; undone: SessionAction[] };
  /** Show results' force (§4.7). */
  forced?: SessionForce;
  /** The shadow commit ws/ is at outside a running step: set by each write's step 4 and by each step's end. */
  head: string;
  /** A write to ws/ in progress (the write order, §2.6); `recover()` finishes it. */
  inFlight?: { action: SessionWrite; parent: string };
  /**
   * The stage judgement that the records and the view describe. The StateJudgement itself is not persisted: `recover()`
   * computes it again from the judged commit's files and `judged-facts.json` (§3.11, D2-72).
   */
  judged?: { commit: string; filesKey: string; ok: boolean; problems: string[]; at: string };
  /**
   * (fixer 2d r1, F-V2D-FC-6 / A-F8; additive) The newest queue whose end reconcile has applied with `queueSteps` (F5,
   * AF1's proposals again, D2-17, the force's end), written in that `judge-apply`'s step 4. A queue's end can take
   * several judge rounds (its reverts); a reload between them judges again with `endsQueue` but without `queueSteps`.
   */
  queueEndReconciled?: number;
  heading?: SessionView['heading'];
  /**
   * (fixer 2e r1, A-F2; additive) Present while `heading` is the "did not pass" heading a decision's judge made (§3.6):
   * `under` is the heading it replaced (a cancelled or failed Submit step's, with its Retry), or null. A later decision's
   * judge that passes puts it back. Cleared by a queue's start and its end, which set their own headings.
   */
  decidedHeading?: { under: SessionView['heading'] };
  confirmation?: {
    checkId: string;
    filesKey: string;
    state: 'running' | 'passed' | 'failed';
    failures: Array<{ rule: FinalCheckRule; text: string; items?: string[]; declaration?: string }>;
    reusedFileChecks?: boolean;
  };
  /** ES-7: the files that differ from B, and when that was first seen; absent while none differs (AF9). */
  drift?: { files: string[]; at: string };
  positions?: Record<string, CanvasPosition>;
  events: SessionView['events'];
  /** Raised whenever the view changes in a way the user can see; the masked graph's `version` (F17). */
  viewVersion: number;
}
