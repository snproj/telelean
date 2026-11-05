/**
 * The run controller (WP3; docs/m2-plan.md sections 2 and 4): one RunManager per model root, at most one active run
 * per root. It owns the run's state machine, the LLM session (ClaudeCliBackend or FakeBackend behind LlmBackend), the
 * AgentToolHost the session's tools call (check_lean, freeze_statements, ask_user, propose_assumption, finish), the
 * caps and the agent-active clock, usage, the gate loop (A2: retry with the exact failures, give up after
 * maxGateAttempts and revert the shadow to the last state that passed), ghost adoption and re-freeze, Feedback, Accept
 * (via the ProposalService and ModelWorkspace.applyChanges), Discard, Cancel, persistence (run.json) and recovery after
 * a window reload. It never runs Lean itself (LeanCheckEngine) and never writes the user's files except through
 * ModelWorkspace.applyChanges (Accept) and ModelWorkspace.perform (the `set-premises` of "These suffice").
 *
 * FROZEN CONTRACT (M2). Owner: WP3. Additive optional members / new exports only (docs/m2-plan.md section 14).
 */
import type {
  ActionOutcome,
  attemptNotice,
  DecisionRecord,
  decisionsInForce,
  describeFinding,
  FileChange,
  GateAttemptView,
  GhostView,
  Phenomenon as CorePhenomenon,
  planGhostAdoption,
  ProjectModel,
  proposalLabel,
  ProposalView,
  QuestionAnswer,
  RunCaps,
  RunView,
  Selection,
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
  /** Target node id: a GOAL or DERIVATION card of the subject (preflight refuses an ASSUMPTION). */
  target: string;
  /**
   * Selected premise ids (may be empty: "Self-evident?"). Reviewer change: start() itself declares them, AFTER
   * preflight passed and the backend was obtained, and before the shadow is created, via
   * `workspace.perform({ kind: 'set-premises', … })` (M1, undoable), only when non-empty and different from the
   * target's declared premises; a refusal there refuses the start. The caller (the extension) asks for egress consent
   * first and declares nothing itself.
   */
  premises: readonly string[];
}

export interface RunChange {
  run: boolean;
  proposal: boolean;
}

/**
 * One root's runs. Every method resolves (never rejects) with an ActionOutcome for the board's `actionResult`;
 * refusals: `not-found` (unknown or stale run/proposal/ghost/question ids), `conflict` (another active run, wrong
 * state, a proposal that no longer applies), `invalid` (bad answers, missing definition approvals), `not-yet`
 * (preflight problems the user can fix), `internal`.
 */
export interface RunManager extends Disposable {
  /** The root's current run (the newest non-dismissed one), or null. */
  current(): RunView | null;
  /** The current run's proposal (state `review`), or null. */
  proposal(): ProposalView | null;
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
  /** D-21: all-or-nothing; every definition question must be approved; rebase + re-gate when the real files drifted. */
  accept(runId: string, proposalId: string, lifecycle: readonly string[], definitions: readonly string[]): Promise<ActionOutcome>;
  /** A new round in the same session (statements may change: stage `formalise`, a new freeze is required). */
  feedback(runId: string, text: string): Promise<ActionOutcome>;
  discard(runId: string): Promise<ActionOutcome>;
  /** D-6 "I hold this": telelean writes the card into the shadow, re-freezes, and starts a proving round. */
  adoptGhost(runId: string, ghostId: string, rationale?: string): Promise<ActionOutcome>;
  rejectGhost(runId: string, ghostId: string): Promise<ActionOutcome>;
  /** Forgets an ended run (terminal state) on the board; its directory stays until pruned. */
  dismiss(runId: string): Promise<ActionOutcome>;
  /** The proposal's whole-file changes (base -> shown state) for the raw diff. */
  proposalDiff(runId: string, proposalId: string): Promise<FileChange[]>;
  /** After activation: loads the root's non-terminal runs from run.json (questions and proposals come back). */
  recover(): Promise<void>;
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
  /** WP3 addition (additive), test hook: replaces `lean.checkSandboxSupport()` (a reason = refused). */
  checkSandbox?: () => Promise<string | undefined>;
  /** WP3 addition (additive), test hook: replaces reading MemAvailable from /proc/meminfo (bytes; undefined = unknown). */
  readMemAvailable?: () => number | undefined;
}

export type PreflightProblem =
  /** `lean-toolchain` is not leanprover/lean4:v4.35.0 (D-7): no runs or gate in syntactic mode. */
  | 'toolchain'
  /** bwrap / systemd-run --user / cgroup v2 / setpriv missing (lean.checkSandboxSupport). */
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
  version: 1;
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
}
