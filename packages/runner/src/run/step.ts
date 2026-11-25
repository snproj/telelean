/**
 * The StepRunner (docs/slice2-plan.md 1.1, 2d): the machinery of one Claude round, taken out of the RunManager
 * (manager.ts) with its behaviour unchanged, so an edit session (session.ts) runs each of its steps as one round:
 * the LLM session (any LlmBackend) and its turns, the AgentToolHost the session's tools call, the per-round caps and
 * the agent-active clock, usage, the gate loop (A2), answers to Claude's questions, persistence of the run's view
 * (run.json, transcript.jsonl) and the run's ending. What happens when a round ends is the subclass's: M2's proposal
 * (manager.ts, a run of version 1) or the end of a session's step (session.ts).
 *
 * Invariants kept here (the plan's "what the proposal shows is always a judged state"):
 *   - gate-pass commits exactly the files the gate judged (GateReport.commit); at the end of that turn ws/ is reset
 *     to them, so edits Claude makes after finish never reach a proposal (or a step's end);
 *   - a give-up, a turn ending twice without finish, and a cap end the round through the subclass's revert;
 *   - a cap reached while a tool call runs takes effect when the call returns (its result is honoured);
 *   - an environment outcome of the gate is retried once after 30 s inside the same tool call, then the round fails;
 *   - Claude's guesses never reach the RunView before the user answered.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

import {
  ATTEMPT_FORMAT,
  ATTEMPT_RESOLUTION_FORMAT,
  applyBackstop as coreApplyBackstop,
  attemptNotice as coreAttemptNotice,
  DECISION_SCOPES,
  decisionsInForce as coreDecisionsInForce,
  DEFAULT_LIBRARY,
  describeFinding as coreDescribeFinding,
  NotImplementedError,
  planGhostAdoption as corePlanGhostAdoption,
  proposalLabel as coreProposalLabel,
  type ActionErrorCode,
  type ActionOutcome,
  type AnsweredQuestionView,
  type AttemptRecord,
  type AttemptResolution,
  type DecisionRecord,
  type DescribeContext,
  type FileChange,
  type GateAttemptView,
  type GateFinding,
  type GateFindingCode,
  type PermittedSummary,
  type ProjectModel,
  type QuestionAnswer,
  type QuestionSetView,
  type RunActivity,
  type RunNoticeKind,
  type RunState,
  type RunUsage,
  type RunVerdict,
  type RunView,
  type SessionView,
  type StateJudgement,
  type TlGraph,
} from '@telelean/core';

import type { CheckContext, CheckReport, FreezeOutcome, FreezeRecord, GateReport, GhostCheck, SessionCheckContext } from '../gate/types.js';
import { cancelRun as leanCancelRun } from '../lean/runLean.js';
import { renderAnswersAsUserTurn } from '../llm/toolSchemas.js';
import type {
  Adoption,
  AgentToolHost,
  AgentToolName,
  Answers,
  ArrowProposal,
  AskUserArgs,
  CheckLeanArgs,
  CheckResult,
  FinishArgs,
  FinishStatus,
  FreezeResult,
  FreezeStatementsArgs,
  GateCheckId,
  GateFailure,
  GateVerdict,
  LlmBackend,
  LlmEvent,
  LlmSession,
  ProposeArrowArgs,
  ProposeAssumptionArgs,
  ResultEvent,
  SessionConfig,
  TokenUsage,
  ToolCallContext,
} from '../llm/types.js';
import { pruneRunDirs, runsDirOf } from '../shadow/index.js';
import { PASSING_COMMIT_KINDS, type ShadowCommit, type ShadowWorkspace } from '../shadow/types.js';
import { nonTerminal, RunFiles } from './persist.js';
import { collapseWhitespace, minutesText, NUDGE_TURN, SYSTEM_PROMPT } from './prompts.js';
import type { PersistedGhost, PersistedRun, RunChange, RunCore, RunManagerOptions } from './types.js';

export const MAX_ACTIVITY = 200;
export const MAX_NOTICES = 100;
/** docs/m2-plan.md section 3.6: an environment outcome in the gate is retried once after this long. */
export const ENVIRONMENT_RETRY_MS = 30_000;
/** How long a terminal transition waits for the CLI to close before going on (it is killed in the background). */
export const CLOSE_WAIT_MS = 10_000;

export const ZERO_USAGE: RunUsage = {
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  costEstimateUsd: 0,
};

/** Lean keywords a ghost's statement name may not be (core's adoption plan has the final word). */
export const LEAN_KEYWORDS = new Set([
  'abbrev', 'admit', 'at', 'attribute', 'axiom', 'by', 'calc', 'class', 'def', 'deriving', 'do', 'else', 'end',
  'example', 'export', 'extends', 'for', 'from', 'fun', 'have', 'if', 'import', 'in', 'include', 'inductive',
  'instance', 'lemma', 'let', 'local', 'macro', 'match', 'mutual', 'namespace', 'noncomputable', 'notation', 'omit',
  'opaque', 'open', 'partial', 'private', 'protected', 'section', 'set_option', 'show', 'sorry', 'structure',
  'suffices', 'syntax', 'then', 'theorem', 'universe', 'unsafe', 'variable', 'where', 'with',
]);
export const LEAN_NAME = /^[A-Za-z_][A-Za-z0-9_']*$/;

// ---------------------------------------------------------------------------------------------
// Small helpers

export const refused = (code: ActionErrorCode, error: string): ActionOutcome => ({ ok: false, code, error });
export const okOutcome = (label: string): ActionOutcome => ({ ok: true, label, undoable: false });

/** 2k2 (docs/slice2-plan.md 2.10, D2-111): the notice of a run recorded at another path (its folder was moved, renamed or copied). */
export function movedRunNotice(from: string): string {
  return `This run was started in another folder (${from}), so it cannot continue here. Stop ends it: your files are not changed and nothing is recorded.`;
}
/** 2k2 (D2-111): the answer to every action on such a run but Stop (and a session's Exit). */
export const MOVED_RUN_REFUSAL = 'This run was started in another folder, so it can only be stopped.';

/**
 * 2k2 (D2-111, D2-121): why a run is held, never continued, and only ended: its run.json names another folder (`moved`:
 * the folder was moved, renamed or copied), or its own folder is gone from under the live manager (`deleted`: the model
 * folder was deleted, and maybe made again at the same path).
 */
export type HeldRun = { kind: 'moved'; from: string } | { kind: 'deleted'; dir: string };
export function heldNotice(h: HeldRun): string {
  return h.kind === 'moved'
    ? movedRunNotice(h.from)
    : `This run's folder no longer exists (${h.dir}), so it cannot continue. Stop ends it: your files are not changed and nothing is recorded.`;
}
export const DELETED_RUN_REFUSAL = "This run's folder no longer exists, so it can only be stopped.";
export function heldRefusal(h: HeldRun): string {
  return h.kind === 'moved' ? MOVED_RUN_REFUSAL : DELETED_RUN_REFUSAL;
}

/** How many changed files Accept's drift refusal names before "…". */
export const DRIFT_FILES_SHOWN = 5;

/**
 * Spec v4 ES-7 (slice 1f): Accept's answer while the user's model files differ from the run's base. The base never
 * moves, so nothing is merged: the user undoes those edits in the editor (Accept then goes through), or discards the run.
 */
export function driftRefusal(files: readonly string[]): string {
  const shown = files.slice(0, DRIFT_FILES_SHOWN);
  const list = files.length > DRIFT_FILES_SHOWN ? `${shown.join(', ')}, …` : shown.join(', ');
  return `Your files changed since this run started (${list}). Undo those edits in the editor, or discard the run.`;
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function sentenceShort(text: string, max = 60): string {
  const t = collapseWhitespace(text);
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/** docs/m2-plan.md section 3.5: what `renderGateVerdict` prints for each finding code. */
export function gateCheckOf(code: GateFindingCode, frozen: boolean): GateCheckId {
  switch (code) {
    case 'sorry':
    case 'sorry-axiom':
      return 'no_sorry';
    case 'hash-command':
    case 'metaprogramming':
    case 'native-code':
    case 'unsafe':
    case 'set-option':
    case 'import':
    case 'project-file':
    case 'outside-subject':
    case 'deleted-file':
    case 'bad-path':
      return 'lint';
    case 'build':
    case 'budget':
      return 'build';
    case 'footprint':
    case 'comparator-illegal-axiom':
    case 'undeclared-premise':
      return 'footprint';
    case 'new-axiom':
      return frozen ? 'footprint' : 'vocabulary';
    case 'not-proved':
    case 'statement-changed':
    case 'existing-changed':
    case 'comparator-statement-mismatch':
    case 'comparator-definition-mismatch':
    case 'comparator-kind-mismatch':
    case 'comparator-missing':
      return 'statement_unchanged';
    case 'vocabulary-shape':
      return 'vocabulary';
    case 'markup':
      return 'markup';
    case 'not-frozen':
      return 'not_frozen';
    default:
      return 'other';
  }
}

export function verdictOfStatus(status: FinishStatus): RunVerdict {
  switch (status) {
    case 'proved':
      return 'proved';
    case 'insufficient':
      return 'insufficient';
    case 'inconsistent':
      return 'inconsistent';
    default:
      return 'not-proved';
  }
}

/** The rate-limit event condensed for the board (`RunUsage.rateLimit`). */
export function condenseRateLimit(info: Record<string, unknown>): NonNullable<RunUsage['rateLimit']> {
  const status = typeof info.status === 'string' ? info.status : 'unknown';
  const out: NonNullable<RunUsage['rateLimit']> = { status };
  const resets = info.resetsAt;
  if (typeof resets === 'number' && Number.isFinite(resets)) out.resetsAt = new Date(resets < 1e12 ? resets * 1000 : resets).toISOString();
  else if (typeof resets === 'string' && resets !== '') out.resetsAt = resets;
  const type = typeof info.rateLimitType === 'string' ? info.rateLimitType : undefined;
  let utilization = typeof info.utilization === 'number' ? info.utilization : undefined;
  const windows = info.unifiedWindows;
  if (utilization === undefined && type !== undefined && typeof windows === 'object' && windows !== null) {
    const w = (windows as Record<string, unknown>)[type];
    if (typeof w === 'object' && w !== null && typeof (w as { utilization?: unknown }).utilization === 'number') {
      utilization = (w as { utilization: number }).utilization;
    }
  }
  const parts: string[] = [];
  // `five_hour` -> "five-hour window", `seven_day_opus` -> "seven-day opus window".
  if (type !== undefined) parts.push(`${type.replace('_', '-').replace(/_/g, ' ')} window`);
  if (utilization !== undefined) parts.push(`${Math.round(utilization * 100)}% used`);
  if (parts.length > 0) out.detail = parts.join(', ');
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** A local time as the board shows it: "00:45" today, "Nov 2 00:45" on another day (the webview's `formatTime`). */
export function localTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()) return time;
  const year = date.getFullYear() === now.getFullYear() ? '' : ` ${date.getFullYear()}`;
  return `${MONTHS[date.getMonth()]} ${date.getDate()}${year} ${time}`;
}

/**
 * The board notice for a usage-limit status other than `allowed`, worded like the status line's rate limit (fixer
 * round 1: never the CLI's raw status name or a UTC ISO time), e.g. "Close to your plan's usage limit (five-hour
 * window, 83% used); resets at 00:45."
 */
export function rateLimitNotice(rl: NonNullable<RunUsage['rateLimit']>, now: Date = new Date()): string {
  const detail = rl.detail ? ` (${rl.detail})` : '';
  const resets = rl.resetsAt ? `; resets at ${localTime(rl.resetsAt, now)}` : '';
  switch (rl.status) {
    case 'allowed_warning':
      return `Close to your plan's usage limit${detail}${resets}.`;
    case 'rejected':
      return `Your plan's usage limit was reached${detail}${resets}.`;
    default:
      return `Claude Code reported an unusual usage-limit status (${rl.status})${detail}${resets}.`;
  }
}

export function isModelPath(rel: string, library: string): boolean {
  if (['lakefile.toml', 'lakefile.lean', 'lean-toolchain', 'lake-manifest.json', `${library}.lean`].includes(rel)) return true;
  return rel.startsWith(`${library}/`) && rel.endsWith('.lean');
}

export function answerText(args: AskUserArgs, a: QuestionAnswer): string {
  switch (a.choice.kind) {
    case 'option':
      return args.questions[a.question]?.options[a.choice.option]?.label ?? `option ${a.choice.option}`;
    case 'free-text':
      return a.choice.text;
    case 'leave-open':
      return 'Leave it open';
    case 'decide-for-me':
      return 'Decide for me';
  }
}

export function summaryOf(permitted: PermittedSummary): PermittedSummary {
  return {
    standard: [...permitted.standard],
    signature: [...permitted.signature],
    selected: [...permitted.selected],
    presuppositions: [...permitted.presuppositions],
    derivationFootprints: [...permitted.derivationFootprints],
    unusable: [...permitted.unusable],
  };
}

export function stripGhost(g: PersistedGhost): RunView['ghosts'][number] {
  const { proof: _proof, footprint: _footprint, ...view } = g;
  return view;
}

export function defaultRunId(): string {
  return `r${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
}

// ---------------------------------------------------------------------------------------------
// One run in memory

// ---------------------------------------------------------------------------------------------
// One run in memory

export type RoundOutcome = 'accept' | 'give_up' | 'environment';

export interface RoundState {
  outcome?: RoundOutcome;
  verdict?: RunVerdict;
  /** The passing gate report (outcome accept). */
  passing?: GateReport;
  gatePass?: ShadowCommit;
  environment?: string;
  /** The label of the commit a give-up reverts to. */
  revertLabel?: string;
  capHit?: 'turns' | 'time';
  capInterrupted: boolean;
  nudged: boolean;
  /** API responses (message ids) of this round in this process; `turnsBase` = turns counted before (a reload). */
  messageIds: Set<string>;
  turnsBase: number;
  attemptRecorded: boolean;
}

export function newRound(turnsBase = 0): RoundState {
  return { capInterrupted: false, nudged: false, messageIds: new Set(), turnsBase, attemptRecorded: false };
}

export interface LiveAsk {
  setId: string;
  args: AskUserArgs;
  resolve: (answers: Answers) => void;
  reject: (error: Error) => void;
}

export interface TurnEnd {
  result?: ResultEvent;
  fatal?: string;
}

export class ActiveRun {
  session: LlmSession | undefined;
  unsubscribe: (() => void) | undefined;
  round: RoundState;
  ask: LiveAsk | undefined;
  activeToolCalls = 0;
  clockSince: number | undefined;
  clockTimer: ReturnType<typeof setTimeout> | undefined;
  /** Aborted by Cancel and the run's end; a session's Cancel step replaces it for the steps that follow. */
  abort = new AbortController();
  /** Terminal (or this manager was disposed): nothing may change the run any more. */
  ended = false;
  /** Cancel has begun: tool calls and turns that return from now on change nothing. */
  stopping = false;
  readonly ids = { q: 0, ghost: 0, proposal: 0, notice: 0 };
  /** Usage counted before this process's sessions (from run.json). */
  usageBase: RunUsage;
  readonly perMessage = new Map<string, TokenUsage>();
  lastModel: ProjectModel | undefined;
  toolHost!: AgentToolHost;
  /** The run as last written to run.json: what current() and proposal() show (never ahead of the file). */
  saved: PersistedRun | undefined;
  /** The round loop that runs now (runRound), so a session's Cancel step can wait for it to stop. */
  roundLoop: Promise<void> | undefined;
  /** Slice 2: an edit session's in-memory state (session.ts); undefined for a run of version 1. */
  live: SessionRuntime | undefined;
  /**
   * 2k2 (D2-111, D2-121, U4): set when the run cannot continue here (`HeldRun`: run.json names another folder, or the run's
   * own folder is gone): the run is held, never continued; only Stop or Exit end it, recording nothing (manager.ts
   * `endHeld`). A held run is never `live`.
   */
  held: HeldRun | undefined;

  constructor(
    public p: PersistedRun,
    public shadow: ShadowWorkspace,
    readonly files: RunFiles,
  ) {
    this.usageBase = { ...ZERO_USAGE, ...p.view.usage };
    this.round = newRound(p.view.counters.turns);
    const max = (prefix: string, ids: readonly string[]): number =>
      ids.reduce((m, id) => (id.startsWith(prefix) ? Math.max(m, Number.parseInt(id.slice(prefix.length), 10) || 0) : m), 0);
    this.ids.q = max('q', [...p.view.answered.map((a) => a.setId), ...(p.view.pendingQuestions ? [p.view.pendingQuestions.id] : [])]);
    this.ids.ghost = max('ghost-', p.ghosts.map((g) => g.id));
    this.ids.proposal = max('p', [...(p.view.proposalId ? [p.view.proposalId] : []), ...(p.proposal ? [p.proposal.proposalId] : [])]);
    this.ids.notice = max('n', p.view.notices.map((n) => n.id));
  }

  get view(): RunView {
    return this.p.view;
  }

  get runId(): string {
    return this.p.view.runId;
  }
}

/**
 * Slice 2 (session.ts): what an edit session keeps in memory besides run.json: the published view, the write queue
 * (§2.6: one write at a time, in order), the judge (one at a time, coalesced) and the models the view is built from.
 */
export interface SessionRuntime {
  /** The SessionView built when run.json was last written with a session change (what `session()` returns). */
  view: SessionView | null;
  /** The tail of the session's write queue, and the writes queued or running in it (`judging` while > 0, AF3). */
  writes: Promise<void>;
  pendingWrites: number;
  /** A judge runs, or is due (§3.6): `judging`. */
  judging: boolean;
  /** The stage judgement the records describe (not persisted: computed again on load, D2-72). */
  judgement: StateJudgement | null;
  /** B's model with the base facts, and the judged commit's model with `judged-facts.json` (cached by commit id). */
  baseModel: ProjectModel | undefined;
  judgedModel: { commit: string; model: ProjectModel; lakefile?: { path: string; text: string } } | undefined;
  /** A judge-apply's reverts made the judge run again: the previous board stays until it converges (F17). */
  converging: boolean;
  /** The previous converged view's board (F17). */
  board: SessionView['board'] | undefined;
  /** Lean's renderings of statements by content key (`renderings.json`, §3.12). */
  renderings: Record<string, { pretty: string; explicit: string }>;
  /** The tail of the judges (one at a time). */
  judges: Promise<void>;
  /** (fixer 2d r1, A-F6) Judges queued behind the running one: a judge that is due counts as judging (§3.6). */
  queuedJudges: number;
  /**
   * (fixer 2d r1, F-V2D-FC-4) The phase or a step's state changed through the run's state (a step interrupted, resumed)
   * since the last session post: the next run.json write posts the session too (§2.4).
   */
  stateChanged: boolean;
  /**
   * (fixer 2d r1, A-F4) Why the SessionView could not be built, while it cannot: then no view is shown (never a stale
   * one), the RunView withholds Claude's work, and a mid-stage Formalize is refused (fail closed).
   */
  viewError?: string;
  /**
   * (2f, §3.8) An accepted Add premise whose premise write could not be made, by item id: the stage problem "“‹item›”
   * was accepted, but telelean could not write it: ‹error›. Reload the window to try again, or decline it." (in memory:
   * a reload runs the due write again).
   */
  writeProblems?: Map<string, string>;
  /**
   * (2f, §3.10) The final check that passed, for Apply's backstop (pure, run again at Apply, never reused): its check
   * id, the judgement of F and F's model with the facts it judged. Not persisted: after a reload the check runs again.
   */
  final?: { checkId: string; judgement: StateJudgement; model?: ProjectModel };
  /** (2f, EN-2) The comparator passes the last final check recorded (by target), which the next one may reuse. */
  comparator?: Record<string, { filesKey: string; permitted: string[] }>;
  /** (2f, D2-18) The person's endorsements of the session's subject (its endorsements.json), the board's build input. */
  endorsements?: Record<string, Array<{ name: string; textHash: string }>>;
}

// ---------------------------------------------------------------------------------------------
// The StepRunner

export abstract class StepRunner {
  protected run: ActiveRun | undefined;
  protected readonly listeners = new Set<(change: RunChange) => void>();
  protected disposed = false;
  protected startLock = false;
  /** One user action at a time (answer, accept, feedback, adoption, resume, discard): a double click gets `conflict`. */
  protected actionBusy: string | undefined;
  protected backendPromise: Promise<LlmBackend> | undefined;
  protected readonly core: RunCore;

  constructor(protected readonly o: RunManagerOptions) {
    this.core = {
      attemptNotice: coreAttemptNotice,
      applyBackstop: coreApplyBackstop,
      describeFinding: coreDescribeFinding,
      planGhostAdoption: corePlanGhostAdoption,
      proposalLabel: coreProposalLabel,
      decisionsInForce: coreDecisionsInForce,
      ...(o.services.core ?? {}),
    };
  }

  // ---- basics

  protected now(): Date {
    return this.o.services.now?.() ?? new Date();
  }

  protected nowMs(): number {
    return this.now().getTime();
  }

  protected iso(): string {
    return this.now().toISOString();
  }

  protected today(): string {
    return this.iso().slice(0, 10);
  }

  protected log(level: 'info' | 'warn' | 'error', message: string): void {
    this.o.services.log?.(level, `[run] ${message}`);
  }

  protected get library(): string {
    try {
      return this.o.workspace.library?.() ?? DEFAULT_LIBRARY;
    } catch {
      return DEFAULT_LIBRARY;
    }
  }

  /** Runs a user action unless another one is still being handled (Cancel is never locked out). */
  protected makeRun(p: PersistedRun, shadow: ShadowWorkspace): ActiveRun {
    const files = new RunFiles(path.join(shadow.paths.runDir, 'run.json'), path.join(shadow.paths.sessionDir, 'transcript.jsonl'), (m) => this.log('warn', m));
    const run = new ActiveRun(p, shadow, files);
    run.toolHost = this.makeToolHost(run);
    return run;
  }

  protected async exclusive(what: string, fn: () => Promise<ActionOutcome>): Promise<ActionOutcome> {
    if (this.disposed) return refused('conflict', 'telelean is shutting down.');
    if (this.actionBusy !== undefined) return refused('conflict', `telelean is still handling your previous action (${this.actionBusy}).`);
    this.actionBusy = what;
    try {
      return await fn();
    } catch (e) {
      this.log('error', `${what} failed: ${errorText(e)}`);
      return refused('internal', `${what} failed: ${errorText(e)}`);
    } finally {
      this.actionBusy = undefined;
    }
  }

  protected emit(change: RunChange): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(change);
      } catch (e) {
        this.log('warn', `a run listener failed: ${errorText(e)}`);
      }
    }
  }

  /** Brings the derived parts of the view up to date (time, agent time, ghosts). */
  protected touch(run: ActiveRun): void {
    const v = run.view;
    v.updatedAt = this.iso();
    const running = run.clockSince !== undefined ? Math.max(0, this.nowMs() - run.clockSince) : 0;
    v.counters.agentMs = run.p.clocks.roundAgentMs + running;
    v.ghosts = run.p.ghosts.map(stripGhost);
  }

  /** run.json (atomic, in order), then the change event. Never throws. */
  protected async save(run: ActiveRun, change: RunChange = { run: true, proposal: false, session: false }): Promise<void> {
    if (this.disposed || run !== this.run) return;
    await this.persist(run, change);
  }

  /** Writes the run as it is now; once written, it is what current()/proposal() return, and listeners hear of it. */
  protected async persist(run: ActiveRun, change: RunChange): Promise<void> {
    this.touch(run);
    const text = `${JSON.stringify(run.p, null, 1)}\n`;
    await run.files.writeState(text);
    if (this.disposed || run !== this.run) return;
    run.saved = JSON.parse(text) as PersistedRun;
    this.onPersisted(run, change);
    this.emit(change);
  }

  protected transcript(run: ActiveRun, entry: Record<string, unknown>): void {
    if (this.disposed) return;
    void run.files.transcript({ at: this.iso(), ...entry });
  }

  protected setState(run: ActiveRun, state: RunState): void {
    if (run.view.state === state) return;
    const from = run.view.state;
    run.view.state = state;
    this.onStateChanged(run, from, state);
    this.syncClock(run);
    this.transcript(run, { kind: 'state', state, stage: run.view.stage, round: run.view.round });
  }

  protected notice(run: ActiveRun, kind: RunNoticeKind, level: 'info' | 'warning' | 'error', text: string, detail?: string): void {
    run.ids.notice += 1;
    run.view.notices.push({ id: `n${run.ids.notice}`, at: this.iso(), level, kind, text, ...(detail !== undefined ? { detail } : {}) });
    if (run.view.notices.length > MAX_NOTICES) run.view.notices.splice(0, run.view.notices.length - MAX_NOTICES);
  }

  protected activity(run: ActiveRun, kind: RunActivity['kind'], text: string, ok?: boolean): void {
    run.view.activity.push({ at: this.iso(), kind, text: text.length > 2000 ? `${text.slice(0, 1999)}…` : text, ...(ok !== undefined ? { ok } : {}) });
    if (run.view.activity.length > MAX_ACTIVITY) run.view.activity.splice(0, run.view.activity.length - MAX_ACTIVITY);
  }

  protected graph(subject: string): TlGraph | undefined {
    try {
      return this.o.workspace.graph(subject);
    } catch {
      return undefined;
    }
  }

  protected live(run: ActiveRun): boolean {
    // (A held run, D2-111, ran nothing here: no judge, no drift record, no write of its run.json until it is ended.)
    return !this.disposed && !run.ended && !run.stopping && run === this.run && run.held === undefined;
  }

  /**
   * 2k2 (A-F1 of the review, D2-121, U1): a live run whose own folder (`<root>/.telelean/runs/<runId>/`) is gone, because
   * the model folder was deleted (and maybe made again at the same path), is held at once: nothing of it may be written
   * into what stands there now (its attempt records, decisions or files), and nothing of it is shown but the notice. Its
   * Claude session and Lean jobs are stopped; nothing is recorded, as nothing can be (run.json has no folder). Called
   * wherever the run is looked at or acted on, and by the drift timer (the deletion's file events wake it).
   */
  protected checkGone(run: ActiveRun | undefined): void {
    if (run === undefined || run.held !== undefined || run.ended || this.disposed || run !== this.run) return;
    const dir = run.shadow.paths.runDir;
    if (existsSync(dir)) return;
    run.held = { kind: 'deleted', dir };
    this.log('warn', `the folder of run ${run.runId} no longer exists (${dir}): the run is held, and only Stop ends it`);
    this.stopClock(run);
    run.abort.abort();
    if (run.ask !== undefined) {
      const ask = run.ask;
      run.ask = undefined;
      ask.reject(new Error('the run folder was deleted'));
    }
    void this.closeSession(run, true).catch(() => undefined);
    void Promise.resolve()
      .then(() => (this.o.services.cancelLean ?? leanCancelRun)(run.runId))
      .catch(() => undefined);
    // The view changes (the board shows the held run, not the review): the listeners hear of it, never inside the caller.
    queueMicrotask(() => this.emit({ run: true, proposal: true, session: true }));
  }

  protected assertLive(run: ActiveRun): void {
    if (!this.live(run)) throw new Error('This run has ended; stop here.');
  }

  protected activeRun(): ActiveRun | undefined {
    const run = this.run;
    return run !== undefined && !run.ended && nonTerminal(run.view.state) ? run : undefined;
  }

  protected runFor(runId: string): ActiveRun | undefined {
    const run = this.run !== undefined && this.run.runId === runId ? this.run : undefined;
    this.checkGone(run); // D2-121: every action on a run looks first at whether its folder is still there
    return run;
  }

  // ---- the agent-active clock (docs/m2-plan.md section 4.4)

  protected syncClock(run: ActiveRun): void {
    const shouldRun = !run.ended && (run.view.state === 'working' || run.view.state === 'gate');
    if (shouldRun && run.clockSince === undefined) {
      run.clockSince = this.nowMs();
      this.scheduleClockTimer(run);
    } else if (!shouldRun && run.clockSince !== undefined) {
      this.stopClock(run);
    }
  }

  protected accumulate(run: ActiveRun): void {
    if (run.clockSince === undefined) return;
    const t = this.nowMs();
    const d = Math.max(0, t - run.clockSince);
    run.p.clocks.roundAgentMs += d;
    run.p.clocks.totalAgentMs += d;
    run.clockSince = t;
  }

  protected stopClock(run: ActiveRun): void {
    this.accumulate(run);
    run.clockSince = undefined;
    if (run.clockTimer !== undefined) clearTimeout(run.clockTimer);
    run.clockTimer = undefined;
  }

  protected scheduleClockTimer(run: ActiveRun): void {
    if (run.clockTimer !== undefined) clearTimeout(run.clockTimer);
    const remaining = Math.max(0, this.o.settings.caps.maxAgentMs - run.p.clocks.roundAgentMs);
    const timer = setTimeout(() => this.onClockTimer(run), remaining);
    (timer as { unref?: () => void }).unref?.();
    run.clockTimer = timer;
  }

  protected onClockTimer(run: ActiveRun): void {
    run.clockTimer = undefined;
    if (run.clockSince === undefined || !this.live(run)) return;
    this.accumulate(run);
    if (run.p.clocks.roundAgentMs >= this.o.settings.caps.maxAgentMs) this.capReached(run, 'time');
    else this.scheduleClockTimer(run);
  }

  // ---- caps (docs/m2-plan.md sections 2 and 4.4)

  protected capReached(run: ActiveRun, kind: 'turns' | 'time'): void {
    if (run.round.capHit !== undefined || !this.live(run)) return;
    run.round.capHit = kind;
    const caps = this.o.settings.caps;
    if (run.round.outcome === undefined) {
      this.notice(
        run,
        'cap',
        'warning',
        kind === 'turns'
          ? `Claude reached this round's limit of ${caps.maxTurns} turns; telelean stopped it.`
          : `Claude reached this round's limit of ${minutesText(caps)} of work; telelean stopped it.`,
      );
    }
    // A cap reached while a tool call runs takes effect when that call returns (its result is honoured).
    if (run.activeToolCalls === 0) this.interruptForCap(run);
    void this.save(run);
  }

  protected interruptForCap(run: ActiveRun): void {
    if (run.round.capInterrupted) return;
    run.round.capInterrupted = true;
    void run.session?.interrupt().catch((e: unknown) => this.log('warn', `interrupt failed: ${errorText(e)}`));
  }

  protected async toolCall<T>(run: ActiveRun, fn: () => Promise<T>): Promise<T> {
    run.activeToolCalls += 1;
    try {
      return await fn();
    } finally {
      run.activeToolCalls -= 1;
      if (run.activeToolCalls === 0 && run.round.capHit !== undefined && this.live(run)) this.interruptForCap(run);
    }
  }

  // ---- the backend and sessions

  protected obtainBackend(): Promise<LlmBackend> {
    const b = this.o.services.backend;
    if (typeof b !== 'function') return Promise.resolve(b);
    this.backendPromise ??= b().catch((e: unknown) => {
      this.backendPromise = undefined;
      throw e;
    });
    return this.backendPromise;
  }

  protected async openSession(run: ActiveRun, resumeSessionId?: string): Promise<void> {
    const backend = await this.obtainBackend();
    const settings = this.o.settings;
    const cfg: SessionConfig = {
      cwd: run.shadow.paths.ws,
      runDir: run.shadow.paths.sessionDir,
      systemPrompt: SYSTEM_PROMPT,
      model: settings.model,
      maxTurns: settings.caps.maxTurns,
      toolHost: run.toolHost,
      title: `telelean ${run.runId}`,
    };
    if (settings.effort !== undefined) cfg.effort = settings.effort;
    if (resumeSessionId !== undefined) cfg.resumeSessionId = resumeSessionId;
    else cfg.sessionId = randomUUID();
    this.transcript(run, { kind: 'session', action: resumeSessionId !== undefined ? 'resume' : 'start', sessionId: resumeSessionId ?? cfg.sessionId, model: cfg.model, effort: cfg.effort });
    const session = await backend.startSession(cfg);
    if (!this.live(run)) {
      await session.close({ force: true }).catch(() => undefined);
      throw new Error('the run ended while Claude was starting');
    }
    run.session = session;
    run.p.sessionId = session.sessionId ?? resumeSessionId ?? cfg.sessionId;
    run.view.backend.id = backend.id;
    run.unsubscribe = session.onEvent((e) => this.onSessionEvent(run, e));
  }

  protected async closeSession(run: ActiveRun, force = false): Promise<void> {
    const session = run.session;
    run.session = undefined;
    run.unsubscribe?.();
    run.unsubscribe = undefined;
    if (session === undefined) return;
    const closing = session.close(force ? { force: true } : {}).catch((e: unknown) => this.log('warn', `closing the session failed: ${errorText(e)}`));
    await Promise.race([closing, new Promise((r) => setTimeout(r, CLOSE_WAIT_MS).unref?.())]);
  }

  protected onSessionEvent(run: ActiveRun, e: LlmEvent): void {
    if (!this.live(run)) return;
    if (e.type !== 'text_delta') this.transcript(run, { kind: 'event', event: e });
    const v = run.view;
    switch (e.type) {
      case 'init':
        if (e.version !== undefined) v.backend.cliVersion = e.version;
        if (e.sessionId !== '') run.p.sessionId = e.sessionId;
        break;
      case 'assistant_text': {
        const text = e.text.trim();
        if (text !== '' && e.parentToolUseId == null) this.activity(run, 'claude-text', text);
        break;
      }
      case 'usage': {
        run.perMessage.set(e.messageId, e.usage);
        this.recomputeUsage(run);
        run.round.messageIds.add(e.messageId);
        v.counters.turns = run.round.turnsBase + run.round.messageIds.size;
        if (v.counters.turns >= this.o.settings.caps.maxTurns) this.capReached(run, 'turns');
        break;
      }
      case 'rate_limit': {
        const rl = condenseRateLimit(e.info);
        const before = v.usage.rateLimit?.status;
        v.usage.rateLimit = rl;
        if (rl.status !== 'allowed' && rl.status !== before) this.notice(run, 'info', 'warning', rateLimitNotice(rl, this.now()));
        break;
      }
      case 'result':
        // The CLI's figure is cumulative for the whole conversation, across --resume: the latest one, never a sum.
        v.usage.costEstimateUsd = e.costEstimateUsd;
        if (e.status === 'max_turns' && run.round.outcome === undefined && run.round.capHit === undefined) {
          run.round.capHit = 'turns';
          run.round.capInterrupted = true;
          this.notice(run, 'cap', 'warning', `Claude reached this round's limit of ${this.o.settings.caps.maxTurns} turns; telelean stopped it.`);
        }
        break;
      case 'permission_denied':
        this.activity(run, 'system', `A ${e.toolName ?? 'tool'} call of Claude's was refused${e.message ? `: ${e.message}` : ''}`, false);
        break;
      default:
        return;
    }
    void this.save(run);
  }

  protected recomputeUsage(run: ActiveRun): void {
    const base = run.usageBase;
    const u: RunUsage = { ...run.view.usage };
    u.requests = base.requests + run.perMessage.size;
    u.inputTokens = base.inputTokens;
    u.outputTokens = base.outputTokens;
    u.cacheReadInputTokens = base.cacheReadInputTokens;
    u.cacheCreationInputTokens = base.cacheCreationInputTokens;
    for (const t of run.perMessage.values()) {
      u.inputTokens += t.inputTokens;
      u.outputTokens += t.outputTokens;
      u.cacheReadInputTokens += t.cacheReadInputTokens;
      u.cacheCreationInputTokens += t.cacheCreationInputTokens;
    }
    run.view.usage = u;
  }

  // ---- context for the engine and for describing findings

  protected currentFreeze(run: ActiveRun): FreezeRecord | undefined {
    if (run.view.frozen === undefined) return undefined;
    const last = run.p.freezes.at(-1);
    return last !== undefined && last.round === run.view.round ? last : undefined;
  }

  protected checkContext(run: ActiveRun): CheckContext {
    const settings = this.o.settings;
    const ctx: CheckContext = {
      shadow: run.shadow,
      selection: run.p.selection,
      stage: run.view.stage ?? 'formalise',
      round: run.view.round,
      job: {
        runId: run.runId,
        memoryMax: settings.memoryMax,
        minAvailableBytes: settings.minAvailableBytes,
        leanJobMs: settings.caps.leanJobMs,
        signal: run.abort.signal,
      },
      teleleanBlocks: [...run.p.selection.adoptedGhosts],
    };
    const freeze = this.currentFreeze(run);
    if (freeze !== undefined) ctx.freeze = freeze;
    if (run.p.roundStartCommit !== undefined) ctx.roundStartCommit = run.p.roundStartCommit;
    // Slice 2b3b/2d: a session step's checks judge with its scope, its S₀ and the session's records.
    const session = this.sessionCheckContext(run);
    if (session !== undefined) ctx.session = session;
    return ctx;
  }

  protected describeContext(run: ActiveRun, model?: ProjectModel): DescribeContext {
    const graph = this.graph(run.p.selection.subject);
    const fallbackModel = (): ProjectModel | undefined => {
      try {
        return this.o.workspace.projectModel?.();
      } catch {
        return undefined;
      }
    };
    return {
      sentenceOf: (id) =>
        graph?.nodes.find((n) => n.id === id)?.naturalName ??
        run.p.ghosts.find((g) => g.nodeId === id)?.naturalName ??
        (model ?? run.lastModel)?.nodes.get(id)?.node.naturalName,
      nodeOfDecl: (name) => (model ?? run.lastModel)?.ownerOfDecl.get(name) ?? fallbackModel()?.ownerOfDecl.get(name),
      selected: [...run.p.selection.premises, ...run.p.selection.adoptedGhosts],
    };
  }

  protected describe(finding: GateFinding, ctx: DescribeContext): string {
    try {
      return this.core.describeFinding(finding, ctx);
    } catch (e) {
      if (!(e instanceof NotImplementedError)) this.log('warn', `describeFinding failed: ${errorText(e)}`);
      return finding.message;
    }
  }

  protected attemptNoticeText(findings: readonly GateFinding[], attempt: number, max: number, ctx: DescribeContext, revertedTo?: string): string {
    try {
      return this.core.attemptNotice(findings, attempt, max, ctx, revertedTo);
    } catch (e) {
      if (!(e instanceof NotImplementedError)) this.log('warn', `attemptNotice failed: ${errorText(e)}`);
      const first = findings[0] !== undefined ? this.describe(findings[0], ctx) : 'the checks failed';
      return attempt >= max
        ? `Claude's attempts didn't pass the checks ${max} times: ${first}. telelean reverted its working copy to ${revertedTo !== undefined ? `“${revertedTo}”` : 'the last state that passed'}.`
        : `Attempt ${attempt} didn't pass: ${first}. Asking Claude to retry.`;
    }
  }

  // ---- turns and rounds

  /** Starts the round loop on `firstTurn` (not awaited by the callers); `run.roundLoop` is its promise. */
  protected startRound(run: ActiveRun, firstTurn: string): void {
    const loop = this.runRound(run, firstTurn).catch((e: unknown) => this.log('error', `the round failed: ${errorText(e)}`));
    run.roundLoop = loop;
    void loop.finally(() => {
      if (run.roundLoop === loop) run.roundLoop = undefined;
    });
  }

  protected async runRound(run: ActiveRun, firstTurn: string): Promise<void> {
    try {
      let next: string | undefined = firstTurn;
      while (next !== undefined) {
        if (!this.live(run)) return;
        const ended = await this.runTurn(run, next);
        if (!this.live(run)) return;
        next = await this.endOfTurn(run, ended);
      }
    } catch (e) {
      if (!this.live(run)) return;
      this.log('error', `the run failed: ${errorText(e)}`);
      await this.roundCrashed(run, `internal error: ${errorText(e)}`);
    }
  }

  protected async runTurn(run: ActiveRun, text: string): Promise<TurnEnd> {
    const session = run.session;
    if (session === undefined) return { fatal: 'no Claude session' };
    this.transcript(run, { kind: 'turn', text });
    const out: TurnEnd = {};
    try {
      for await (const e of session.send(text)) {
        if (e.type === 'result') out.result = e;
        else if (e.type === 'error' && e.fatal) out.fatal = e.message;
      }
    } catch (e) {
      out.fatal = errorText(e);
    }
    return out;
  }

  /** After a turn's result: settle the round, nudge once, or keep waiting. Returns the next turn to send, if any. */
  protected async endOfTurn(run: ActiveRun, ended: TurnEnd): Promise<string | undefined> {
    const r = run.round;
    if (ended.result === undefined) {
      // The session died mid-turn (the CLI exited or could not be read).
      await this.closeSession(run, true);
      if (r.outcome === undefined) {
        if (run.view.state === 'waiting-for-answer') {
          // The question card stays; answering resumes the session (renderAnswersAsUserTurn).
          await this.save(run);
          return undefined;
        }
        this.setState(run, 'interrupted');
        run.view.canResume = run.p.sessionId !== undefined;
        this.notice(run, 'interrupted', 'warning', `Claude stopped unexpectedly (${ended.fatal ?? 'no result'}).${run.view.canResume ? ' Resume continues the same session.' : ''}`);
        await this.save(run);
        return undefined;
      }
    }
    if (run.view.state === 'waiting-for-answer') return undefined;
    if (r.outcome === 'environment') {
      await this.roundEnvironment(run, `telelean could not run the checks (${r.environment ?? 'unknown reason'}); this is not Claude's fault`);
      return undefined;
    }
    if (r.outcome === 'accept') {
      await this.roundAccepted(run);
      return undefined;
    }
    if (r.outcome === 'give_up') {
      await this.roundReverted(run, 'gave-up', `the checks failed ${this.o.settings.caps.maxGateAttempts} times`);
      return undefined;
    }
    if (r.capHit !== undefined) {
      await this.roundReverted(run, 'cap-reached', r.capHit === 'turns' ? 'the turn limit was reached' : 'the time limit was reached');
      return undefined;
    }
    if (!r.nudged) {
      r.nudged = true;
      this.activity(run, 'system', 'Claude ended its turn without calling finish; telelean asked it to finish.');
      await this.save(run);
      return NUDGE_TURN;
    }
    await this.roundReverted(run, 'no-finish', 'Claude ended its turn twice without calling finish');
    return undefined;
  }

  // ---- sidecars (attempts.jsonl, decisions.json)

  protected async appendAttempt(run: ActiveRun, verdict: RunVerdict, footprint?: string[]): Promise<void> {
    if (run.round.attemptRecorded) return;
    run.round.attemptRecorded = true;
    const v = run.view;
    const sel = run.p.selection;
    const record: AttemptRecord = {
      format: ATTEMPT_FORMAT,
      version: 1,
      id: `${run.runId}.${v.round}`,
      run: run.runId,
      round: v.round,
      date: this.iso(),
      subject: sel.subject,
      target: sel.target,
      premises: [...sel.premises, ...sel.adoptedGhosts],
      verdict,
      gateAttempts: v.counters.gateAttempts,
      model: v.backend.model,
      usage: { requests: v.usage.requests, inputTokens: v.usage.inputTokens, outputTokens: v.usage.outputTokens, costEstimateUsd: v.usage.costEstimateUsd },
    };
    if (footprint !== undefined && footprint.length > 0) record.footprint = [...footprint];
    if (run.p.ghosts.length > 0) record.ghosts = run.p.ghosts.map((g) => ({ id: g.id, naturalName: g.naturalName, adopted: g.state === 'adopted' }));
    if (run.p.lastFinish !== undefined) record.summary = run.p.lastFinish.summary.slice(0, 500);
    if (v.backend.effort !== undefined) record.effort = v.backend.effort;
    try {
      await this.o.services.sidecars.appendAttempt(this.o.root, record);
      await this.o.workspace.reloadAttempts?.(sel.subject);
    } catch (e) {
      this.log('warn', `attempts.jsonl could not be written: ${errorText(e)}`);
    }
  }

  protected async resolveAttempt(run: ActiveRun, resolution: AttemptResolution['resolution']): Promise<void> {
    const record: AttemptResolution = {
      format: ATTEMPT_RESOLUTION_FORMAT,
      version: 1,
      run: run.runId,
      round: run.view.round,
      date: this.iso(),
      resolution,
    };
    try {
      await this.o.services.sidecars.resolveAttempt(this.o.root, run.p.selection.subject, record);
      await this.o.workspace.reloadAttempts?.(run.p.selection.subject);
    } catch (e) {
      this.log('warn', `attempts.jsonl could not be written: ${errorText(e)}`);
    }
  }

  // ---- terminal transitions

  protected async endRun(run: ActiveRun, state: 'accepted' | 'discarded' | 'cancelled' | 'failed', extra: { verdict?: RunVerdict; error?: string } = {}): Promise<void> {
    run.ended = true;
    this.stopClock(run);
    run.abort.abort();
    if (run.ask !== undefined) {
      const ask = run.ask;
      run.ask = undefined;
      ask.reject(new Error('the run has ended'));
    }
    const v = run.view;
    v.state = state;
    v.endedAt = this.iso();
    v.pendingQuestions = undefined;
    v.proposalId = undefined;
    v.canResume = undefined;
    if (extra.verdict !== undefined) v.verdict = extra.verdict;
    if (extra.error !== undefined) v.error = extra.error;
    run.p.pendingAsk = undefined;
    run.p.proposal = undefined;
    this.transcript(run, { kind: 'state', state, round: v.round, ...(extra.error !== undefined ? { error: extra.error } : {}) });
    await this.closeSession(run);
    // Saved even though the run has ended (save() only checks that the run is still the current one).
    if (!this.disposed && run === this.run) await this.persist(run, { run: true, proposal: true, session: run.p.session !== undefined });
    await this.prune(run);
  }

  protected async failRun(run: ActiveRun, error: string): Promise<void> {
    if (run.ended) return;
    if (!run.round.attemptRecorded && run.view.state !== 'starting') await this.appendAttempt(run, 'failed');
    await this.endRun(run, 'failed', { verdict: 'failed', error });
  }

  protected async prune(run: ActiveRun): Promise<void> {
    try {
      await pruneRunDirs(runsDirOf(this.o.root), this.o.settings.keepRuns, [run.runId]);
    } catch (e) {
      if (!(e instanceof NotImplementedError)) this.log('warn', `old runs could not be pruned: ${errorText(e)}`);
    }
  }

  // ---- RunManager: answers (D-20)

  async answer(runId: string, setId: string, answers: readonly QuestionAnswer[]): Promise<ActionOutcome> {
    return this.exclusive('answering', () => this.answerNow(runId, setId, answers));
  }

  protected async answerNow(runId: string, setId: string, answers: readonly QuestionAnswer[]): Promise<ActionOutcome> {
    const run = this.runFor(runId);
    if (run === undefined) return refused('not-found', 'That run is not active any more.');
    // 2k2 (D2-111, D2-121): a run recorded at another path, or whose folder is gone, is never continued.
    if (run.held !== undefined) return refused('conflict', heldRefusal(run.held));
    if (run.view.state !== 'waiting-for-answer' || run.p.pendingAsk === undefined) return refused('conflict', 'No question of this run is waiting.');
    const pending = run.p.pendingAsk;
    if (pending.setId !== setId) return refused('not-found', 'Those questions are no longer waiting.');
    const args = pending.args;
    const problem = validateAnswers(args, answers);
    if (problem !== undefined) return refused('invalid', problem);
    const at = this.iso();
    const sorted = [...answers].sort((a, b) => a.question - b.question);
    const questions = run.view.pendingQuestions?.questions ?? [];
    const decisions: DecisionRecord[] = [];
    for (const a of sorted) {
      const q = args.questions[a.question];
      const qv = questions.find((x) => x.index === a.question);
      if (q === undefined || qv === undefined) continue;
      const answered: AnsweredQuestionView = { ...structuredClone(qv), setId, answer: structuredClone(a), answeredAt: at };
      if (q.claudesGuess !== undefined) answered.claudesGuess = { ...q.claudesGuess };
      run.view.answered.push(answered);
      const record: DecisionRecord = {
        id: `${run.runId}.${setId}.${a.question}`,
        run: run.runId,
        date: at,
        subject: run.p.selection.subject,
        phenomenon: q.phenomenon,
        question: q.question,
        options: q.options.map((o) => ({ label: o.label, consequence: o.consequence })),
        answer: structuredClone(a.choice),
        answerText: answerText(args, a),
        scope: a.scope,
        affectedNodes: [...qv.affectedNodes],
        decidedBy: 'user',
        wordedBy: 'agent',
      };
      if (q.claudesGuess !== undefined) record.claudesGuess = { ...q.claudesGuess };
      decisions.push(record);
    }
    try {
      await this.o.services.sidecars.recordDecisions(this.o.root, run.p.selection.subject, decisions);
    } catch (e) {
      this.log('warn', `decisions.json could not be written: ${errorText(e)}`);
      this.notice(run, 'info', 'warning', `Your answer reached Claude, but telelean could not record it in decisions.json (${errorText(e)}).`);
    }
    if (!this.live(run)) return refused('conflict', 'This run has ended.');
    run.view.pendingQuestions = undefined;
    run.p.pendingAsk = undefined;
    this.activity(run, 'answer', `You answered ${sorted.length} question${sorted.length === 1 ? '' : 's'}.`);
    const llmAnswers: Answers = { answers: sorted.map((a) => ({ question: a.question, choice: structuredClone(a.choice), scope: a.scope })), answeredAt: at };
    const live = run.ask;
    if (live !== undefined && live.setId === setId) {
      run.ask = undefined;
      this.setState(run, 'working');
      await this.save(run);
      live.resolve(llmAnswers);
      return okOutcome('Answer sent to Claude');
    }
    // No tool call can receive it (after a reload, or the CLI went away): the next user turn of a resumed session.
    run.p.undeliveredAnswers = { setId, answers: structuredClone(sorted) };
    this.setState(run, 'working');
    await this.save(run);
    const outcome = await this.continueSession(run, renderAnswersAsUserTurn(args, llmAnswers), 'answers');
    return outcome.ok ? okOutcome('Answer sent to Claude') : outcome;
  }

  /**
   * Sends `turn` on the live session, or on a resumed one (`--resume <session>`), and runs the round on. `delivers`: the
   * turn is the undelivered answers, or (slice 2) a session step's undelivered turn, cleared once a session has it.
   */
  protected async continueSession(run: ActiveRun, turn: string, delivers: 'answers' | 'turn' | false = false): Promise<ActionOutcome> {
    if (run.session === undefined) {
      if (run.p.sessionId === undefined) {
        await this.failRun(run, 'the Claude session cannot be resumed (no session id)');
        return refused('internal', 'The Claude session cannot be resumed.');
      }
      try {
        await this.openSession(run, run.p.sessionId);
      } catch (e) {
        if (!this.live(run)) return refused('conflict', 'This run has ended.');
        this.setState(run, 'interrupted');
        run.view.canResume = true;
        this.notice(run, 'interrupted', 'warning', `Claude could not be resumed (${errorText(e)}). Try Resume again later.`);
        await this.save(run);
        return refused('not-yet', `Claude could not be resumed: ${errorText(e)}`);
      }
    }
    if (delivers === 'answers' && run.p.undeliveredAnswers !== undefined) {
      run.p.undeliveredAnswers = undefined;
      await this.save(run);
    }
    if (delivers === 'turn' && run.p.undeliveredTurn !== undefined) {
      run.p.undeliveredTurn = undefined;
      await this.save(run);
    }
    this.startRound(run, turn);
    return okOutcome('Claude continues');
  }

  /** Round + 1 with fresh caps (Feedback, adoption): the proposal is withdrawn. */
  protected startNewRound(run: ActiveRun, stage: 'formalise' | 'prove'): void {
    this.stopClock(run);
    const v = run.view;
    v.round += 1;
    v.stage = stage;
    v.counters = { turns: 0, checks: 0, agentMs: 0, gateAttempts: 0 };
    v.proposalId = undefined;
    v.verdict = undefined;
    v.error = undefined;
    if (stage === 'formalise') v.frozen = undefined;
    run.p.proposal = undefined;
    run.p.clocks.roundAgentMs = 0;
    run.round = newRound();
  }

  // ---- the tool host (docs/m2-plan.md section 4.3)

  protected makeToolHost(run: ActiveRun): AgentToolHost {
    const wrap =
      <A, R>(tool: AgentToolName, fn: (args: A, ctx: ToolCallContext) => Promise<R>) =>
      async (args: A, ctx: ToolCallContext): Promise<R> => {
        this.transcript(run, { kind: 'tool-call', tool, args });
        try {
          const result = await fn(args, ctx);
          this.transcript(run, { kind: 'tool-result', tool, result });
          return result;
        } catch (e) {
          this.transcript(run, { kind: 'tool-error', tool, error: errorText(e) });
          throw e;
        }
      };
    return {
      check_lean: wrap('check_lean', (a: CheckLeanArgs) => this.toolCheckLean(run, a)),
      freeze_statements: wrap('freeze_statements', (a: FreezeStatementsArgs) => this.toolFreeze(run, a)),
      ask_user: wrap('ask_user', (a: AskUserArgs, c: ToolCallContext) => this.toolAskUser(run, a, c)),
      propose_assumption: wrap('propose_assumption', (a: ProposeAssumptionArgs) => this.toolProposeAssumption(run, a)),
      propose_arrow: wrap('propose_arrow', (a: ProposeArrowArgs) => this.toolProposeArrow(run, a)),
      finish: wrap('finish', (a: FinishArgs) => this.toolFinish(run, a)),
    };
  }

  protected assertCanAct(run: ActiveRun): void {
    if (!this.live(run)) throw new Error('This run has ended; stop here.');
    if (run.round.outcome !== undefined) throw new Error('The run is complete; stop here.');
    const state = run.view.state;
    if (state === 'waiting-for-answer') throw new Error('another question is waiting for the person; wait for the answer');
    if (state !== 'working') throw new Error('The run is complete; stop here.');
  }

  protected assertCheckBudget(run: ActiveRun): void {
    const max = this.o.settings.caps.maxChecks;
    const used = run.view.counters.checks;
    if (used >= max) throw new Error(`check budget used up (${used} of ${max}): call finish`);
  }

  protected async validateFiles(run: ActiveRun, files: readonly string[] | undefined): Promise<string[] | undefined> {
    if (files === undefined || files.length === 0) return undefined;
    const ws = run.shadow.paths.ws;
    const wsReal = await realpath(ws).catch(() => ws);
    const out: string[] = [];
    for (const f of files) {
      let rel = f.replace(/\\/g, '/');
      if (path.isAbsolute(f)) {
        const abs = path.resolve(f);
        const inside = [ws, wsReal].map((b) => path.relative(b, abs)).find((r) => r !== '' && !r.startsWith('..') && !path.isAbsolute(r));
        if (inside === undefined) throw new Error(`${f} is not a file of the workspace copy`);
        rel = inside.split(path.sep).join('/');
      }
      if (rel.split('/').some((s) => s === '' || s === '.' || s === '..' || s.startsWith('.'))) throw new Error(`${f} is not a file of the workspace copy`);
      if (!rel.endsWith('.lean')) throw new Error(`${f} is not a .lean file`);
      const st = await lstat(path.join(ws, rel)).catch(() => undefined);
      if (st === undefined || !st.isFile()) throw new Error(`${f} does not exist in the workspace copy`);
      out.push(rel);
    }
    return out;
  }

  protected toCheckResult(run: ActiveRun, report: CheckReport, files: readonly string[] | undefined): CheckResult {
    const findings = [...report.g0, ...report.findings];
    const diagnostics = (files === undefined ? report.diagnostics : report.diagnostics.filter((d) => files.includes(d.file))).map((d) => ({
      file: d.file,
      line: d.line,
      column: d.column,
      severity: d.severity,
      message: d.message,
    }));
    const result: CheckResult = {
      ok: report.outcome === 'ok',
      diagnostics,
      footprints: { ...(report.rules?.footprints ?? {}) },
      violations: findings.map((f) => f.message),
      stage: run.view.stage ?? 'formalise',
      checksLeft: Math.max(0, this.o.settings.caps.maxChecks - run.view.counters.checks),
    };
    if (report.outcome === 'environment') result.environment = report.environment ?? 'telelean could not run Lean';
    else if (report.g0.length > 0) result.note = 'Lean did not run: remove the forbidden text first.';
    return result;
  }

  protected async toolCheckLean(run: ActiveRun, args: CheckLeanArgs): Promise<CheckResult> {
    this.assertCanAct(run);
    this.assertCheckBudget(run);
    return this.toolCall(run, async () => {
      const files = await this.validateFiles(run, args.files);
      const ctx = this.checkContext(run);
      if (files !== undefined) ctx.files = files;
      let report: CheckReport;
      try {
        report = await this.o.services.engine.check(ctx);
      } catch (e) {
        report = { outcome: 'environment', environment: errorText(e), g0: [], findings: [], diagnostics: [], durationMs: 0 };
      }
      this.assertLive(run);
      if (report.outcome !== 'environment') run.view.counters.checks += 1;
      if (report.model !== undefined) run.lastModel = report.model;
      const result = this.toCheckResult(run, report, files);
      const n = result.violations.length;
      this.activity(
        run,
        'check',
        report.outcome === 'environment'
          ? `check_lean: telelean could not run Lean (${result.environment ?? ''})`
          : `check_lean: ${report.g0.length > 0 ? 'Lean not run' : `build ${report.build?.status === 'ok' || report.outcome === 'ok' ? 'ok' : (report.build?.status ?? 'failed')}`}, ${n} violation${n === 1 ? '' : 's'}`,
        report.outcome === 'ok',
      );
      await this.save(run);
      return result;
    });
  }

  protected isTargetRef(run: ActiveRun, targets: readonly string[]): boolean {
    if (targets.length !== 1) return false;
    const t = targets[0] ?? '';
    const sel = run.p.selection;
    if (t === sel.target) return true;
    const statement = run.lastModel?.nodes.get(sel.target)?.node.lean.statement ?? this.graph(sel.subject)?.nodes.find((n) => n.id === sel.target)?.lean.statement;
    if (statement === undefined) return false;
    return t === statement || `${sel.subject}.${t}` === statement;
  }

  protected async toolFreeze(run: ActiveRun, args: FreezeStatementsArgs): Promise<FreezeResult> {
    this.assertCanAct(run);
    if (run.view.stage === 'prove') throw new Error("already frozen in this round; statements change only after the person's feedback");
    if (!this.isTargetRef(run, args.targets)) throw new Error(`freeze_statements takes exactly the target: ["${run.p.selection.target}"]`);
    this.assertCheckBudget(run);
    return this.toolCall(run, async () => {
      const outcome = await this.o.services.engine.freeze(this.checkContext(run)).catch(
        (e: unknown): FreezeOutcome => ({
          ok: false,
          refusals: [errorText(e)],
          report: { outcome: 'environment', environment: errorText(e), g0: [], findings: [], diagnostics: [], durationMs: 0 },
          environment: errorText(e),
        }),
      );
      this.assertLive(run);
      if (outcome.report.model !== undefined) run.lastModel = outcome.report.model;
      if (!outcome.ok) {
        const environment = outcome.environment ?? (outcome.report.outcome === 'environment' ? (outcome.report.environment ?? 'unknown reason') : undefined);
        if (environment === undefined) run.view.counters.checks += 1;
        this.activity(run, 'freeze', environment !== undefined ? `freeze_statements: telelean could not run Lean (${environment})` : `freeze_statements: refused (${outcome.refusals.length} reason${outcome.refusals.length === 1 ? '' : 's'})`, false);
        await this.save(run);
        return {
          frozen: false,
          refusals: environment !== undefined ? [`telelean could not run Lean (${environment}); this is not your fault and was not counted; try again or call finish.`] : outcome.refusals,
        };
      }
      run.view.counters.checks += 1;
      const record = outcome.record;
      run.p.freezes.push(record);
      run.view.stage = 'prove';
      run.view.frozen = { round: run.view.round, at: record.at, permitted: summaryOf(record.snapshot.permitted) };
      this.onFrozen(run, record);
      this.activity(run, 'freeze', `freeze_statements: statements frozen (round ${run.view.round})`, true);
      await this.save(run);
      return { frozen: true, refusals: [], snapshotId: `freeze-${run.view.round}`, permitted: [...record.snapshot.permitted.all] };
    });
  }

  protected async toolAskUser(run: ActiveRun, args: AskUserArgs, ctx: ToolCallContext): Promise<Answers> {
    if (!this.live(run)) throw new Error('This run has ended; stop here.');
    if (run.view.state === 'waiting-for-answer' || run.ask !== undefined) throw new Error('another question is waiting');
    this.assertCanAct(run);
    run.ids.q += 1;
    const setId = `q${run.ids.q}`;
    const askedAt = this.iso();
    const known = new Set([...(this.graph(run.p.selection.subject)?.nodes.map((n) => n.id) ?? []), ...run.p.selection.adoptedGhosts]);
    // Claude's guesses stay here (pendingAsk); the view never carries them before the answer (D-20).
    const view: QuestionSetView = {
      id: setId,
      askedAt,
      questions: args.questions.map((q, index) => ({
        index,
        phenomenon: q.phenomenon,
        question: q.question,
        options: q.options.map((o) => ({ label: o.label, consequence: o.consequence, ...(o.formalPreview !== undefined ? { formalPreview: o.formalPreview } : {}) })),
        affectedNodes: (q.affectedNodes ?? []).filter((id) => known.has(id)),
      })),
    };
    run.p.pendingAsk = { setId, args: structuredClone(args), askedAt };
    run.view.pendingQuestions = view;
    this.setState(run, 'waiting-for-answer');
    this.activity(run, 'question', `Claude asks ${view.questions.length} question${view.questions.length === 1 ? '' : 's'}.`);
    const answered = new Promise<Answers>((resolve, reject) => {
      run.ask = { setId, args, resolve, reject };
    });
    // Handled from the start: a withdrawal while run.json is still being written must not be an unhandled rejection.
    answered.catch(() => undefined);
    const onAbort = (): void => {
      // The CLI went away or the turn was stopped: the question stays on the board; its answer then becomes the next
      // user turn of a resumed session.
      const ask = run.ask;
      if (ask !== undefined && ask.setId === setId) {
        run.ask = undefined;
        ask.reject(new Error('the question was withdrawn: the session stopped'));
      }
    };
    if (ctx.signal.aborted) onAbort();
    else ctx.signal.addEventListener('abort', onAbort, { once: true });
    await this.save(run);
    try {
      return await answered;
    } finally {
      ctx.signal.removeEventListener('abort', onAbort);
    }
  }

  protected ghostName(run: ActiveRun, args: ProposeAssumptionArgs, alsoTaken: readonly string[] = []): string {
    const subject = run.p.selection.subject;
    const model = run.lastModel;
    const taken = (name: string): boolean => {
      const full = `${subject}.${name}`;
      if (model?.declFacts.has(full) || model?.declFacts.has(`${full}.holds`) || model?.ownerOfDecl.has(full)) return true;
      for (const file of model?.files.values() ?? []) if (file.decls.some((d) => d.fullName === full || d.fullName === `${full}.holds`)) return true;
      return run.p.ghosts.some((g) => g.leanName === name) || alsoTaken.includes(name);
    };
    const preferred = args.lean_name;
    if (preferred !== undefined && LEAN_NAME.test(preferred) && !LEAN_KEYWORDS.has(preferred) && !taken(preferred)) return preferred;
    let base = args.natural_name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .slice(0, 6)
      .join('_');
    if (base === '' || !/^[a-z]/.test(base) || LEAN_KEYWORDS.has(base)) base = `ghost_${base}`.replace(/_$/, '');
    let name = base;
    for (let i = 2; taken(name); i++) name = `${base}_${i}`;
    return name;
  }

  protected async toolProposeAssumption(run: ActiveRun, args: ProposeAssumptionArgs): Promise<Adoption> {
    if (run.p.session !== undefined) return this.proposeAssumptionInSession(run, args);
    this.assertCanAct(run);
    if (run.view.stage !== 'prove' || this.currentFreeze(run) === undefined) throw new Error('freeze first; the gap is judged against the frozen statements');
    this.assertCheckBudget(run);
    return this.toolCall(run, async () => {
      const check: GhostCheck = await this.o.services.engine
        .checkGhost(this.checkContext(run), { naturalName: args.natural_name, leanStatement: args.lean_statement, proof: args.proof })
        .catch((e: unknown): GhostCheck => ({ ok: false, problems: [errorText(e)], environment: errorText(e) }));
      this.assertLive(run);
      if (!check.ok) {
        if (check.environment === undefined) run.view.counters.checks += 1;
        this.activity(run, 'ghost', `propose_assumption: “${sentenceShort(args.natural_name)}” ${check.environment !== undefined ? 'could not be checked' : 'was rejected'}`, false);
        await this.save(run);
        return {
          status: 'rejected',
          gateChecked: check.environment === undefined,
          message:
            check.environment !== undefined
              ? `telelean could not run Lean (${check.environment}); this is not your fault and was not counted.`
              : check.problems.join('\n'),
        };
      }
      run.view.counters.checks += 1;
      run.ids.ghost += 1;
      const ghost: PersistedGhost = {
        id: `ghost-${run.ids.ghost}`,
        naturalName: args.natural_name,
        leanStatement: check.statement ?? collapseWhitespace(args.lean_statement),
        leanName: this.ghostName(run, args),
        whyNeeded: args.why_needed,
        closesGap: true,
        aloneEntails: check.aloneEntails,
        state: 'suggested',
        round: run.view.round,
        proof: args.proof,
        footprint: [...check.footprint],
      };
      run.p.ghosts.push(ghost);
      this.activity(run, 'ghost', `Claude suggests a premise: “${sentenceShort(ghost.naturalName)}” (checked: it closes the gap${ghost.aloneEntails ? ' on its own' : ''}).`, true);
      await this.save(run);
      return {
        status: 'recorded',
        ghostId: ghost.id,
        gateChecked: true,
        aloneEntails: ghost.aloneEntails,
        message: `telelean checked that it closes the gap and shows it to the person as a suggested premise (statement name ${ghost.leanName} if adopted). They may adopt it after your turn ends; do not write it into the files.`,
      };
    });
  }

  protected async runGate(run: ActiveRun, status: FinishStatus): Promise<GateReport> {
    try {
      // Slice 2 (§2.8): a session step's own proposed arrows go into its target's `premises:` first (the ledger).
      await this.beforeGate(run);
      const ctx = this.checkContext(run);
      await this.o.services.engine.normalise(ctx);
      return await this.o.services.engine.gate({ ...ctx, status });
    } catch (e) {
      // A mirror that cannot be synced (a symlink or dot-entry in ws/) and the like: not the agent's fault.
      return {
        passed: false,
        environment: errorText(e),
        findings: [],
        flaggedDefinitions: [],
        check: { outcome: 'environment', environment: errorText(e), g0: [], findings: [], diagnostics: [], durationMs: 0 },
        durationMs: 0,
      };
    }
  }

  protected sleep(run: ActiveRun, ms: number): Promise<void> {
    const signal = run.abort.signal;
    if (signal.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        signal.removeEventListener('abort', done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      signal.addEventListener('abort', done, { once: true });
    });
  }

  protected async commitGatePass(run: ActiveRun, report: GateReport, attempt: number): Promise<ShadowCommit> {
    const shadow = run.shadow;
    const judged = report.commit;
    if (judged !== undefined) {
      // Tools never run concurrently with Claude's edits, so ws/ still equals the judged commit; make sure of it.
      const changes = await shadow.changes(judged.id);
      if (changes.length > 0) await shadow.revertTo(judged.id, 'Restored the judged files', run.view.round);
    }
    return shadow.commit('gate-pass', `Checks passed (round ${run.view.round}, attempt ${attempt})`, run.view.round);
  }

  protected async toolFinish(run: ActiveRun, args: FinishArgs): Promise<GateVerdict> {
    this.assertCanAct(run);
    return this.toolCall(run, async () => {
      const max = this.o.settings.caps.maxGateAttempts;
      const attempt = run.view.counters.gateAttempts + 1;
      const round = run.view.round;
      run.p.lastFinish = structuredClone(args);
      this.setState(run, 'gate');
      this.activity(run, 'gate', `finish(${args.status}): telelean runs the checks (attempt ${attempt} of ${max}).`);
      await this.save(run);
      let report = await this.runGate(run, args.status);
      this.assertLive(run);
      if (report.environment !== undefined) {
        this.notice(run, 'environment', 'warning', `telelean could not run the checks (${report.environment}); it tries again in 30 seconds. This is not Claude's fault and not counted.`);
        await this.save(run);
        await this.sleep(run, ENVIRONMENT_RETRY_MS);
        this.assertLive(run);
        report = await this.runGate(run, args.status);
        this.assertLive(run);
      }
      if (report.environment !== undefined) {
        run.round.outcome = 'environment';
        run.round.environment = report.environment;
        run.round.verdict = 'failed';
        this.notice(
          run,
          'environment',
          'error',
          run.p.session !== undefined
            ? `telelean could not run the checks again (${report.environment}). This is not Claude's fault; the step stops here: fix the cause, then Retry step.`
            : `telelean could not run the checks again (${report.environment}). This is not Claude's fault; the run stops here. Fix the cause, then start a new run.`,
        );
        this.setState(run, 'working');
        await this.save(run);
        return { passed: false, failures: [], flaggedDefinitions: [], attempt, maxAttempts: max, next: 'give_up', environment: report.environment };
      }
      run.view.counters.gateAttempts = attempt;
      const flaggedNames = report.flaggedDefinitions.map((f) => f.name);
      // Slice 2b3b/2d (D2-19): a proved finish whose B.1 set grew got a new challenge: the step's newest freeze.
      if (report.freeze !== undefined && report.freeze.round === run.view.round) run.p.freezes.push(report.freeze);
      if (report.passed) {
        const gatePass = await this.commitGatePass(run, report, attempt);
        this.assertLive(run);
        run.round.outcome = 'accept';
        run.round.verdict = verdictOfStatus(args.status);
        run.round.passing = report;
        run.round.gatePass = gatePass;
        run.p.gateAttempts.push({ attempt, round, at: this.iso(), passed: true, failures: [] });
        this.activity(run, 'gate', `The checks passed (attempt ${attempt}).`, true);
        this.setState(run, 'working');
        await this.save(run);
        return { passed: true, failures: [], flaggedDefinitions: flaggedNames, attempt, maxAttempts: max, next: 'accept' };
      }
      const findings = report.findings;
      const frozen = this.currentFreeze(run) !== undefined;
      const failures: GateFailure[] = findings.map((f) => ({ check: gateCheckOf(f.code, frozen), detail: f.message }));
      const dctx = this.describeContext(run, report.check.model);
      const view: GateAttemptView = {
        attempt,
        round,
        at: this.iso(),
        passed: false,
        failures: findings.map((f) => ({ step: f.step, text: this.describe(f, dctx), detail: f.message })),
      };
      run.p.gateAttempts.push(view);
      const detail = failures.map((f) => `- ${f.check}: ${f.detail}`).join('\n');
      const next: GateVerdict['next'] = attempt >= max ? 'give_up' : 'retry';
      if (next === 'retry') {
        this.notice(run, 'gate-failed', 'warning', this.attemptNoticeText(findings, attempt, max, dctx), detail);
      } else {
        // The state the give-up goes back to, as its rollback finds it (a session step: never behind its S₀).
        const target = await this.revertTarget(run);
        const label = target?.label ?? 'the start of the run';
        run.round.outcome = 'give_up';
        run.round.verdict = 'gave-up';
        run.round.revertLabel = label;
        this.notice(run, 'gave-up', 'error', this.attemptNoticeText(findings, attempt, max, dctx, label), detail);
      }
      this.activity(run, 'gate', `The checks failed (attempt ${attempt} of ${max}): ${findings.length} problem${findings.length === 1 ? '' : 's'}.`, false);
      this.setState(run, 'working');
      await this.save(run);
      return { passed: false, failures, flaggedDefinitions: flaggedNames, attempt, maxAttempts: max, next };
    });
  }

  // ---- what the subclass decides (docs/slice2-plan.md 2d: M2's proposal, or a session step's end)

  /** The gate passed (the round's outcome `accept`). */
  protected abstract roundAccepted(run: ActiveRun): Promise<void>;
  /** A give-up, a cap, or a turn that ended twice without finish (`verdict` says which). */
  protected abstract roundReverted(run: ActiveRun, verdict: RunVerdict, reason: string): Promise<void>;
  /** The gate could not run twice (an environment outcome): not Claude's fault. */
  protected abstract roundEnvironment(run: ActiveRun, reason: string): Promise<void>;
  /** The round loop threw (telelean's own error). */
  protected abstract roundCrashed(run: ActiveRun, error: string): Promise<void>;
  /** A session step's check context (its scope, S₀ and the session's records), or undefined outside a step. */
  protected abstract sessionCheckContext(run: ActiveRun): SessionCheckContext | undefined;
  /** propose_assumption in a session (§3.8): the draft, its checks and its refusals. */
  protected abstract proposeAssumptionInSession(run: ActiveRun, args: ProposeAssumptionArgs): Promise<Adoption>;
  /** propose_arrow (D2-1): refused outside a session. */
  protected abstract toolProposeArrow(run: ActiveRun, args: ProposeArrowArgs): Promise<ArrowProposal>;
  /**
   * The commit a give-up goes back to, which its notice names (fixer 2d r1, F-V2D-FC-3): M2's last passing commit of
   * the run; a session step's own target (session.ts), never behind its S₀.
   */
  protected revertTarget(run: ActiveRun): Promise<ShadowCommit | undefined> {
    return run.shadow.lastCommit(PASSING_COMMIT_KINDS);
  }
  /** A freeze succeeded (the session records its step's freeze commit). */
  protected onFrozen(_run: ActiveRun, _record: FreezeRecord): void {}
  /** Right before each gate attempt's normalise (the session writes its step's ledger arrows into `premises:`). */
  protected async beforeGate(_run: ActiveRun): Promise<void> {}
  /** The run's state changed (the session follows it with its step's and its phase). */
  protected onStateChanged(_run: ActiveRun, _from: RunState, _to: RunState): void {}
  /** run.json was written (the session rebuilds its view when `change.session`). */
  protected onPersisted(_run: ActiveRun, _change: RunChange): void {}

}

// ---------------------------------------------------------------------------------------------
// Module helpers

// ---------------------------------------------------------------------------------------------
// Module helpers

/** The finish status Accept's re-gate judges a proposal with: `proved` only for a proved verdict. */
export function statusForRegate(verdict: RunVerdict, last: FinishStatus | undefined): FinishStatus {
  if (verdict === 'proved') return 'proved';
  return last !== undefined && last !== 'proved' ? last : 'not_proved';
}

export function backendCliVersion(backend: LlmBackend): string | undefined {
  const version = (backend as { options?: { binary?: { version?: unknown } } }).options?.binary?.version;
  return typeof version === 'string' ? version : undefined;
}

export function baseProblemSummary(report: CheckReport): string {
  const errors = report.diagnostics.filter((d) => d.severity === 'error');
  const items = errors.length > 0 ? errors.map((d) => `${d.file}:${d.line}: ${collapseWhitespace(d.message)}`) : [...report.g0, ...report.findings].map((f) => collapseWhitespace(f.message));
  const shown = items.slice(0, 3).map((t) => (t.length > 300 ? `${t.slice(0, 299)}…` : t));
  return `${shown.join('; ')}${items.length > 3 ? ` …and ${items.length - 3} more` : ''}` || 'Lean reported errors';
}

export async function headCommit(shadow: ShadowWorkspace): Promise<ShadowCommit | undefined> {
  return (await shadow.commits()).at(-1);
}

/** Whole-file changes turning `from` into `to` (model files only). */
export function diffMaps(from: ReadonlyMap<string, string>, to: ReadonlyMap<string, string>, library: string): FileChange[] {
  const out: FileChange[] = [];
  const paths = new Set([...from.keys(), ...to.keys()].filter((p) => isModelPath(p, library)));
  for (const rel of [...paths].sort()) {
    const before = from.get(rel) ?? null;
    const after = to.get(rel) ?? null;
    if (before !== after) out.push({ path: rel, before, after });
  }
  return out;
}

/** The questions of an answered set, back in the tool's argument shape (for renderAnswersAsUserTurn after a reload). */
export function argsOfAnswered(answered: readonly AnsweredQuestionView[], setId: string): AskUserArgs {
  const questions = answered
    .filter((a) => a.setId === setId)
    .sort((a, b) => a.index - b.index)
    .map((a) => ({ phenomenon: a.phenomenon, question: a.question, options: a.options.map((o) => ({ label: o.label, consequence: o.consequence })) }));
  return { questions };
}

/** Every question of the batch exactly once, options in range, free text not blank, a known scope. */
export function validateAnswers(args: AskUserArgs, answers: readonly QuestionAnswer[]): string | undefined {
  const n = args.questions.length;
  if (answers.length !== n) return `Answer every question of the batch (${n}).`;
  const seen = new Set<number>();
  for (const a of answers) {
    if (!Number.isInteger(a.question) || a.question < 0 || a.question >= n) return `There is no question ${a.question + 1}.`;
    if (seen.has(a.question)) return `Question ${a.question + 1} was answered twice.`;
    seen.add(a.question);
    if (!DECISION_SCOPES.includes(a.scope)) return `Unknown scope "${String(a.scope)}".`;
    const q = args.questions[a.question];
    switch (a.choice.kind) {
      case 'option':
        if (!Number.isInteger(a.choice.option) || a.choice.option < 0 || a.choice.option >= (q?.options.length ?? 0)) return `Question ${a.question + 1} has no option ${a.choice.option + 1}.`;
        break;
      case 'free-text':
        if (a.choice.text.trim() === '') return `The answer to question ${a.question + 1} is empty.`;
        break;
      case 'leave-open':
      case 'decide-for-me':
        break;
      default:
        return 'Unknown kind of answer.';
    }
  }
  return undefined;
}
