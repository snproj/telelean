/**
 * The RunManager (WP3; docs/m2-plan.md sections 2, 3.7, 4 and 7.1; contracts in ./types.ts): one per model root, at
 * most one active run. It owns the run's state machine, the LLM session (any LlmBackend), the AgentToolHost the
 * session's tools call, the per-round caps and the agent-active clock, usage, the gate loop (A2), ghost adoption,
 * Feedback, Accept, Discard, Cancel, persistence (run.json, transcript.jsonl) and recovery. It never runs Lean itself
 * (LeanCheckEngine) and writes the user's files only through ModelWorkspace.perform (the premises declaration of
 * "These suffice", after preflight) and the ProposalService's apply (Accept).
 *
 * Invariants kept here (the plan's "what the proposal shows is always a judged state"):
 *   - gate-pass commits exactly the files the gate judged (GateReport.commit); at the end of that turn ws/ is reset
 *     to them, so edits Claude makes after finish never reach a proposal;
 *   - a give-up, a turn ending twice without finish, and a cap revert ws/ to the last passing commit, normalise it,
 *     re-check it (not counted) and build the proposal from that check;
 *   - a cap reached while a tool call runs takes effect when the call returns (its result is honoured);
 *   - an environment outcome of the gate is retried once after 30 s inside the same tool call, then the run fails;
 *   - Claude's guesses never reach the RunView before the user answered.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

import {
  ActionError,
  ATTEMPT_FORMAT,
  ATTEMPT_RESOLUTION_FORMAT,
  attemptNotice as coreAttemptNotice,
  buildProjectModel,
  DECISION_SCOPES,
  decisionsInForce as coreDecisionsInForce,
  DEFAULT_LIBRARY,
  describeFinding as coreDescribeFinding,
  isTerminalRunState,
  NotImplementedError,
  parseLeanFile,
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
  type ProposalView,
  type QuestionAnswer,
  type QuestionSetView,
  type RunActivity,
  type RunNoticeKind,
  type RunState,
  type RunUsage,
  type RunVerdict,
  type RunView,
  type TlGraph,
} from '@telelean/core';

import type { CheckContext, CheckReport, FreezeOutcome, FreezeRecord, GateReport, GhostCheck, RenderedStatement } from '../gate/types.js';
import { cancelRun as leanCancelRun } from '../lean/runLean.js';
import { renderAnswersAsUserTurn } from '../llm/toolSchemas.js';
import type {
  Adoption,
  AgentToolHost,
  AgentToolName,
  Answers,
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
  ProposeAssumptionArgs,
  ResultEvent,
  SessionConfig,
  TokenUsage,
  ToolCallContext,
} from '../llm/types.js';
import { createRunShadow, openRunShadow, pruneRunDirs } from '../shadow/index.js';
import { PASSING_COMMIT_KINDS, type ShadowCommit, type ShadowWorkspace } from '../shadow/types.js';
import type { Disposable } from '../workspace/types.js';
import { nonTerminal, RunFiles, scanRuns, writeJsonAtomic } from './persist.js';
import { preflight as defaultPreflight } from './preflight.js';
import { adoptionTurn, collapseWhitespace, feedbackTurn, minutesText, NUDGE_TURN, renderContextBundle, resumeTurn, SYSTEM_PROMPT } from './prompts.js';
import {
  PERSISTED_RUN_FORMAT,
  type PersistedGhost,
  type PersistedRun,
  type RunChange,
  type RunCore,
  type RunManager,
  type RunManagerOptions,
  type RunStartRequest,
} from './types.js';

const MAX_ACTIVITY = 200;
const MAX_NOTICES = 100;
/** docs/m2-plan.md section 3.6: an environment outcome in the gate is retried once after this long. */
export const ENVIRONMENT_RETRY_MS = 30_000;
/** How long a terminal transition waits for the CLI to close before going on (it is killed in the background). */
const CLOSE_WAIT_MS = 10_000;

const ZERO_USAGE: RunUsage = {
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  costEstimateUsd: 0,
};

/** Lean keywords a ghost's statement name may not be (core's adoption plan has the final word). */
const LEAN_KEYWORDS = new Set([
  'abbrev', 'admit', 'at', 'attribute', 'axiom', 'by', 'calc', 'class', 'def', 'deriving', 'do', 'else', 'end',
  'example', 'export', 'extends', 'for', 'from', 'fun', 'have', 'if', 'import', 'in', 'include', 'inductive',
  'instance', 'lemma', 'let', 'local', 'macro', 'match', 'mutual', 'namespace', 'noncomputable', 'notation', 'omit',
  'opaque', 'open', 'partial', 'private', 'protected', 'section', 'set_option', 'show', 'sorry', 'structure',
  'suffices', 'syntax', 'then', 'theorem', 'universe', 'unsafe', 'variable', 'where', 'with',
]);
const LEAN_NAME = /^[A-Za-z_][A-Za-z0-9_']*$/;

// ---------------------------------------------------------------------------------------------
// Small helpers

const refused = (code: ActionErrorCode, error: string): ActionOutcome => ({ ok: false, code, error });
const okOutcome = (label: string): ActionOutcome => ({ ok: true, label, undoable: false });

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function sentenceShort(text: string, max = 60): string {
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

function isModelPath(rel: string, library: string): boolean {
  if (['lakefile.toml', 'lakefile.lean', 'lean-toolchain', 'lake-manifest.json', `${library}.lean`].includes(rel)) return true;
  return rel.startsWith(`${library}/`) && rel.endsWith('.lean');
}

function answerText(args: AskUserArgs, a: QuestionAnswer): string {
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

function summaryOf(permitted: PermittedSummary): PermittedSummary {
  return {
    standard: [...permitted.standard],
    signature: [...permitted.signature],
    selected: [...permitted.selected],
    presuppositions: [...permitted.presuppositions],
    derivationFootprints: [...permitted.derivationFootprints],
    unusable: [...permitted.unusable],
  };
}

function stripGhost(g: PersistedGhost): RunView['ghosts'][number] {
  const { proof: _proof, footprint: _footprint, ...view } = g;
  return view;
}

function defaultRunId(): string {
  return `r${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
}

// ---------------------------------------------------------------------------------------------
// One run in memory

type RoundOutcome = 'accept' | 'give_up' | 'environment';

interface RoundState {
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

function newRound(turnsBase = 0): RoundState {
  return { capInterrupted: false, nudged: false, messageIds: new Set(), turnsBase, attemptRecorded: false };
}

interface LiveAsk {
  setId: string;
  args: AskUserArgs;
  resolve: (answers: Answers) => void;
  reject: (error: Error) => void;
}

interface TurnEnd {
  result?: ResultEvent;
  fatal?: string;
}

class ActiveRun {
  session: LlmSession | undefined;
  unsubscribe: (() => void) | undefined;
  round: RoundState;
  ask: LiveAsk | undefined;
  activeToolCalls = 0;
  clockSince: number | undefined;
  clockTimer: ReturnType<typeof setTimeout> | undefined;
  readonly abort = new AbortController();
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

// ---------------------------------------------------------------------------------------------
// The manager

class RunManagerImpl implements RunManager {
  private run: ActiveRun | undefined;
  private readonly listeners = new Set<(change: RunChange) => void>();
  private disposed = false;
  private startLock = false;
  /** One user action at a time (answer, accept, feedback, adoption, resume, discard): a double click gets `conflict`. */
  private actionBusy: string | undefined;
  private backendPromise: Promise<LlmBackend> | undefined;
  private readonly core: RunCore;

  constructor(private readonly o: RunManagerOptions) {
    this.core = {
      attemptNotice: coreAttemptNotice,
      describeFinding: coreDescribeFinding,
      planGhostAdoption: corePlanGhostAdoption,
      proposalLabel: coreProposalLabel,
      decisionsInForce: coreDecisionsInForce,
      ...(o.services.core ?? {}),
    };
  }

  // ---- basics

  private now(): Date {
    return this.o.services.now?.() ?? new Date();
  }

  private nowMs(): number {
    return this.now().getTime();
  }

  private iso(): string {
    return this.now().toISOString();
  }

  private today(): string {
    return this.iso().slice(0, 10);
  }

  private log(level: 'info' | 'warn' | 'error', message: string): void {
    this.o.services.log?.(level, `[run] ${message}`);
  }

  private get library(): string {
    try {
      return this.o.workspace.library?.() ?? DEFAULT_LIBRARY;
    } catch {
      return DEFAULT_LIBRARY;
    }
  }

  /** Runs a user action unless another one is still being handled (Cancel is never locked out). */
  private async exclusive(what: string, fn: () => Promise<ActionOutcome>): Promise<ActionOutcome> {
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

  private emit(change: RunChange): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(change);
      } catch (e) {
        this.log('warn', `a run listener failed: ${errorText(e)}`);
      }
    }
  }

  /** Brings the derived parts of the view up to date (time, agent time, ghosts). */
  private touch(run: ActiveRun): void {
    const v = run.view;
    v.updatedAt = this.iso();
    const running = run.clockSince !== undefined ? Math.max(0, this.nowMs() - run.clockSince) : 0;
    v.counters.agentMs = run.p.clocks.roundAgentMs + running;
    v.ghosts = run.p.ghosts.map(stripGhost);
  }

  /** run.json (atomic, in order), then the change event. Never throws. */
  private async save(run: ActiveRun, change: RunChange = { run: true, proposal: false }): Promise<void> {
    if (this.disposed || run !== this.run) return;
    await this.persist(run, change);
  }

  /** Writes the run as it is now; once written, it is what current()/proposal() return, and listeners hear of it. */
  private async persist(run: ActiveRun, change: RunChange): Promise<void> {
    this.touch(run);
    const text = `${JSON.stringify(run.p, null, 1)}\n`;
    await run.files.writeState(text);
    if (this.disposed || run !== this.run) return;
    run.saved = JSON.parse(text) as PersistedRun;
    this.emit(change);
  }

  private transcript(run: ActiveRun, entry: Record<string, unknown>): void {
    if (this.disposed) return;
    void run.files.transcript({ at: this.iso(), ...entry });
  }

  private setState(run: ActiveRun, state: RunState): void {
    if (run.view.state === state) return;
    run.view.state = state;
    this.syncClock(run);
    this.transcript(run, { kind: 'state', state, stage: run.view.stage, round: run.view.round });
  }

  private notice(run: ActiveRun, kind: RunNoticeKind, level: 'info' | 'warning' | 'error', text: string, detail?: string): void {
    run.ids.notice += 1;
    run.view.notices.push({ id: `n${run.ids.notice}`, at: this.iso(), level, kind, text, ...(detail !== undefined ? { detail } : {}) });
    if (run.view.notices.length > MAX_NOTICES) run.view.notices.splice(0, run.view.notices.length - MAX_NOTICES);
  }

  private activity(run: ActiveRun, kind: RunActivity['kind'], text: string, ok?: boolean): void {
    run.view.activity.push({ at: this.iso(), kind, text: text.length > 2000 ? `${text.slice(0, 1999)}…` : text, ...(ok !== undefined ? { ok } : {}) });
    if (run.view.activity.length > MAX_ACTIVITY) run.view.activity.splice(0, run.view.activity.length - MAX_ACTIVITY);
  }

  private graph(subject: string): TlGraph | undefined {
    try {
      return this.o.workspace.graph(subject);
    } catch {
      return undefined;
    }
  }

  private live(run: ActiveRun): boolean {
    return !this.disposed && !run.ended && !run.stopping && run === this.run;
  }

  private assertLive(run: ActiveRun): void {
    if (!this.live(run)) throw new Error('This run has ended; stop here.');
  }

  private activeRun(): ActiveRun | undefined {
    const run = this.run;
    return run !== undefined && !run.ended && nonTerminal(run.view.state) ? run : undefined;
  }

  private runFor(runId: string): ActiveRun | undefined {
    return this.run !== undefined && this.run.runId === runId ? this.run : undefined;
  }

  // ---- the agent-active clock (docs/m2-plan.md section 4.4)

  private syncClock(run: ActiveRun): void {
    const shouldRun = !run.ended && (run.view.state === 'working' || run.view.state === 'gate');
    if (shouldRun && run.clockSince === undefined) {
      run.clockSince = this.nowMs();
      this.scheduleClockTimer(run);
    } else if (!shouldRun && run.clockSince !== undefined) {
      this.stopClock(run);
    }
  }

  private accumulate(run: ActiveRun): void {
    if (run.clockSince === undefined) return;
    const t = this.nowMs();
    const d = Math.max(0, t - run.clockSince);
    run.p.clocks.roundAgentMs += d;
    run.p.clocks.totalAgentMs += d;
    run.clockSince = t;
  }

  private stopClock(run: ActiveRun): void {
    this.accumulate(run);
    run.clockSince = undefined;
    if (run.clockTimer !== undefined) clearTimeout(run.clockTimer);
    run.clockTimer = undefined;
  }

  private scheduleClockTimer(run: ActiveRun): void {
    if (run.clockTimer !== undefined) clearTimeout(run.clockTimer);
    const remaining = Math.max(0, this.o.settings.caps.maxAgentMs - run.p.clocks.roundAgentMs);
    const timer = setTimeout(() => this.onClockTimer(run), remaining);
    (timer as { unref?: () => void }).unref?.();
    run.clockTimer = timer;
  }

  private onClockTimer(run: ActiveRun): void {
    run.clockTimer = undefined;
    if (run.clockSince === undefined || !this.live(run)) return;
    this.accumulate(run);
    if (run.p.clocks.roundAgentMs >= this.o.settings.caps.maxAgentMs) this.capReached(run, 'time');
    else this.scheduleClockTimer(run);
  }

  // ---- caps (docs/m2-plan.md sections 2 and 4.4)

  private capReached(run: ActiveRun, kind: 'turns' | 'time'): void {
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

  private interruptForCap(run: ActiveRun): void {
    if (run.round.capInterrupted) return;
    run.round.capInterrupted = true;
    void run.session?.interrupt().catch((e: unknown) => this.log('warn', `interrupt failed: ${errorText(e)}`));
  }

  private async toolCall<T>(run: ActiveRun, fn: () => Promise<T>): Promise<T> {
    run.activeToolCalls += 1;
    try {
      return await fn();
    } finally {
      run.activeToolCalls -= 1;
      if (run.activeToolCalls === 0 && run.round.capHit !== undefined && this.live(run)) this.interruptForCap(run);
    }
  }

  // ---- the backend and sessions

  private obtainBackend(): Promise<LlmBackend> {
    const b = this.o.services.backend;
    if (typeof b !== 'function') return Promise.resolve(b);
    this.backendPromise ??= b().catch((e: unknown) => {
      this.backendPromise = undefined;
      throw e;
    });
    return this.backendPromise;
  }

  private async openSession(run: ActiveRun, resumeSessionId?: string): Promise<void> {
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

  private async closeSession(run: ActiveRun, force = false): Promise<void> {
    const session = run.session;
    run.session = undefined;
    run.unsubscribe?.();
    run.unsubscribe = undefined;
    if (session === undefined) return;
    const closing = session.close(force ? { force: true } : {}).catch((e: unknown) => this.log('warn', `closing the session failed: ${errorText(e)}`));
    await Promise.race([closing, new Promise((r) => setTimeout(r, CLOSE_WAIT_MS).unref?.())]);
  }

  private onSessionEvent(run: ActiveRun, e: LlmEvent): void {
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

  private recomputeUsage(run: ActiveRun): void {
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

  private currentFreeze(run: ActiveRun): FreezeRecord | undefined {
    if (run.view.frozen === undefined) return undefined;
    const last = run.p.freezes.at(-1);
    return last !== undefined && last.round === run.view.round ? last : undefined;
  }

  private checkContext(run: ActiveRun): CheckContext {
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
    return ctx;
  }

  private describeContext(run: ActiveRun, model?: ProjectModel): DescribeContext {
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

  private describe(finding: GateFinding, ctx: DescribeContext): string {
    try {
      return this.core.describeFinding(finding, ctx);
    } catch (e) {
      if (!(e instanceof NotImplementedError)) this.log('warn', `describeFinding failed: ${errorText(e)}`);
      return finding.message;
    }
  }

  private attemptNoticeText(findings: readonly GateFinding[], attempt: number, max: number, ctx: DescribeContext, revertedTo?: string): string {
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

  // ---- RunManager: queries and listeners

  current(): RunView | null {
    const run = this.run;
    if (run === undefined) return null;
    if (run.saved !== undefined) return structuredClone(run.saved.view);
    this.touch(run);
    return structuredClone(run.view);
  }

  proposal(): ProposalView | null {
    const shown = this.run?.saved;
    if (shown === undefined || shown.view.state !== 'review' || shown.proposal === undefined) return null;
    return structuredClone(shown.proposal);
  }

  onDidChange(listener: (change: RunChange) => void): Disposable {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  // ---- start (docs/m2-plan.md sections 2 and 4.1)

  async start(request: RunStartRequest): Promise<ActionOutcome> {
    if (this.disposed) return refused('conflict', 'telelean is shutting down.');
    if (this.startLock) return refused('conflict', 'Another run of this model folder is starting.');
    this.startLock = true;
    try {
      return await this.doStart(request);
    } catch (e) {
      this.log('error', `start failed: ${errorText(e)}`);
      return refused('internal', `The run could not start: ${errorText(e)}`);
    } finally {
      this.startLock = false;
    }
  }

  private async doStart(request: RunStartRequest): Promise<ActionOutcome> {
    const { root, workspace, settings, services } = this.o;
    const active = this.activeRun();
    const pre = await (services.preflight ?? defaultPreflight)({
      root,
      workspace,
      request,
      settings,
      ...(active !== undefined ? { activeRunId: active.runId } : {}),
    });
    if (!pre.ok) return refused(pre.problem === 'busy' ? 'conflict' : 'not-yet', pre.message);
    if (this.activeRun() !== undefined) return refused('conflict', 'Another Claude run of this model folder is still active.');

    // The backend: a factory runs once, at the first start that passed preflight (`claude --version` only).
    let backend: LlmBackend;
    try {
      backend = await this.obtainBackend();
    } catch (e) {
      return refused('not-yet', `Claude could not be started: ${errorText(e)}`);
    }

    // The premises declaration (M1 set-premises, undoable): after preflight and the backend, before the shadow.
    const graph = workspace.graph(request.subject);
    const targetNode = graph.nodes.find((n) => n.id === request.target);
    if (targetNode === undefined) return refused('not-found', `The target "${request.target}" is not a card of ${request.subject}.`);
    const premises = [...new Set(request.premises)];
    const declared = new Set(targetNode.premises);
    const changed = premises.length !== declared.size || premises.some((p) => !declared.has(p));
    if (premises.length > 0 && changed) {
      const outcome = await workspace.perform({ kind: 'set-premises', target: targetNode.id, premises: [...premises] });
      if (!outcome.ok) return outcome;
    }

    // The run: shadow (model files only, as the board sees them), run.json, the base check, the session.
    const library = this.library;
    const files = new Map<string, string>();
    for (const rel of workspace.modelFiles?.() ?? []) {
      const text = await workspace.readText?.(rel);
      if (typeof text === 'string') files.set(rel, text);
    }
    const runId = (services.newRunId ?? defaultRunId)();
    const cliVersion = backendCliVersion(backend);
    const createShadow = services.createShadow ?? createRunShadow;
    let shadow: ShadowWorkspace;
    try {
      // Closing round 1: the working copy builds from scratch unless telelean.run.reuseLeanBuild is on (shadow/seed.ts).
      shadow = await createShadow({ root, runsDir: this.o.runsDir, runId, library, files, now: () => this.now(), copyBuild: settings.reuseLeanBuild === true });
    } catch (e) {
      return refused('not-yet', `telelean could not make the run's working copy: ${errorText(e)}`);
    }
    // A seed that is not exactly what the board's last refresh recorded, untouched since, is skipped (only slower, never refused).
    const seed = shadow.buildSeed;
    if (seed?.skipped !== undefined) this.log('info', `run ${runId}: the working copy's Lean build starts empty, not from your .lake/build: ${seed.skipped}`);
    else if (seed !== undefined && seed.files > 0) this.log('info', `run ${runId}: the working copy's Lean build starts from your .lake/build (${seed.files} files, the board's last Lean check)`);
    const startedAt = this.iso();
    const p: PersistedRun = {
      format: PERSISTED_RUN_FORMAT,
      version: 1,
      root,
      library,
      view: {
        runId,
        subject: request.subject,
        target: targetNode.id,
        premises,
        state: 'starting',
        round: 1,
        startedAt,
        updatedAt: startedAt,
        backend: {
          id: backend.id,
          model: settings.model,
          ...(settings.effort !== undefined ? { effort: settings.effort } : {}),
          ...(cliVersion !== undefined ? { cliVersion } : {}),
        },
        caps: { ...settings.caps },
        counters: { turns: 0, checks: 0, agentMs: 0, gateAttempts: 0 },
        usage: { ...ZERO_USAGE },
        answered: [],
        notices: [],
        activity: [],
        ghosts: [],
      },
      selection: { subject: request.subject, target: targetNode.id, premises, adoptedGhosts: [] },
      backendId: backend.id,
      freezes: [],
      ghosts: [],
      gateAttempts: [],
      clocks: { roundAgentMs: 0, totalAgentMs: 0, startedAt },
    };
    const run = this.makeRun(p, shadow);
    this.run = run;
    this.activity(run, 'system', `Started "These suffice" for “${sentenceShort(targetNode.naturalName)}” with ${premises.length === 0 ? 'no premises' : `${premises.length} premise${premises.length === 1 ? '' : 's'}`}.`);
    await this.save(run);

    // The base check: the user's files must build before Claude is contacted (one Lean job, not counted).
    let base: CheckReport;
    try {
      base = await services.engine.checkBase(this.checkContext(run));
    } catch (e) {
      base = { outcome: 'environment', environment: errorText(e), g0: [], findings: [], diagnostics: [], durationMs: 0 };
    }
    if (!this.live(run)) return refused('conflict', 'The run was stopped while it was starting.');
    if (base.model !== undefined) run.lastModel = base.model;
    if (base.outcome === 'problems') {
      const error = `your files have Lean errors (${baseProblemSummary(base)}); fix or save them, then start again`;
      await this.failRun(run, error);
      return refused('not-yet', `The run could not start: ${error}.`);
    }
    if (base.outcome === 'environment') {
      const error = `telelean could not run Lean on your files (${base.environment ?? 'unknown reason'}); nothing was sent to Claude`;
      this.notice(run, 'environment', 'error', `${error}.`);
      await this.failRun(run, error);
      return refused('not-yet', `The run could not start: ${error}.`);
    }

    // The session: guard self-test, CLI spawn, subscription check, hooks listing (all before the first prompt).
    try {
      await this.openSession(run);
    } catch (e) {
      if (!this.live(run)) return refused('conflict', 'The run was stopped while it was starting.');
      const error = errorText(e);
      await this.failRun(run, error);
      return refused('not-yet', `Claude could not be started: ${error}`);
    }

    // Round 1: the context bundle.
    let bundle: string;
    try {
      bundle = await this.contextBundle(run);
    } catch (e) {
      await this.failRun(run, `telelean could not describe the model to Claude: ${errorText(e)}`);
      return refused('internal', `The run could not start: ${errorText(e)}`);
    }
    run.view.stage = 'formalise';
    this.setState(run, 'working');
    await this.save(run);
    void this.runRound(run, bundle);
    return okOutcome(`Claude is working on “${sentenceShort(targetNode.naturalName)}”`);
  }

  private makeRun(p: PersistedRun, shadow: ShadowWorkspace): ActiveRun {
    const files = new RunFiles(path.join(shadow.paths.runDir, 'run.json'), path.join(shadow.paths.sessionDir, 'transcript.jsonl'), (m) => this.log('warn', m));
    const run = new ActiveRun(p, shadow, files);
    run.toolHost = this.makeToolHost(run);
    return run;
  }

  private async contextBundle(run: ActiveRun): Promise<string> {
    const { workspace, sidecars } = { workspace: this.o.workspace, sidecars: this.o.services.sidecars };
    const sel = run.p.selection;
    let decisions: DecisionRecord[] = [];
    try {
      const file = await sidecars.readDecisions(this.o.root, sel.subject);
      decisions = this.core.decisionsInForce(file, sel.subject, [sel.target, ...sel.premises]);
    } catch (e) {
      if (!(e instanceof NotImplementedError)) this.log('warn', `decisions could not be read: ${errorText(e)}`);
    }
    const model = workspace.projectModel?.();
    if (model === undefined) throw new Error('the workspace has no project model');
    return renderContextBundle({
      model,
      graph: workspace.graph(sel.subject),
      library: run.p.library,
      selection: sel,
      decisions,
      caps: this.o.settings.caps,
      scope: this.o.settings.contextScope,
    });
  }

  // ---- turns and rounds

  private async runRound(run: ActiveRun, firstTurn: string): Promise<void> {
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
      await this.failRun(run, `internal error: ${errorText(e)}`);
    }
  }

  private async runTurn(run: ActiveRun, text: string): Promise<TurnEnd> {
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
  private async endOfTurn(run: ActiveRun, ended: TurnEnd): Promise<string | undefined> {
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
      await this.failRun(run, `telelean could not run the checks (${r.environment ?? 'unknown reason'}); this is not Claude's fault`);
      return undefined;
    }
    if (r.outcome === 'accept') {
      await this.settleAccepted(run);
      return undefined;
    }
    if (r.outcome === 'give_up') {
      await this.settleReverted(run, 'gave-up', `the checks failed ${this.o.settings.caps.maxGateAttempts} times`);
      return undefined;
    }
    if (r.capHit !== undefined) {
      await this.settleReverted(run, 'cap-reached', r.capHit === 'turns' ? 'the turn limit was reached' : 'the time limit was reached');
      return undefined;
    }
    if (!r.nudged) {
      r.nudged = true;
      this.activity(run, 'system', 'Claude ended its turn without calling finish; telelean asked it to finish.');
      await this.save(run);
      return NUDGE_TURN;
    }
    await this.settleReverted(run, 'no-finish', 'Claude ended its turn twice without calling finish');
    return undefined;
  }

  /** The gate passed: ws/ back to the gate-pass files (edits after finish are discarded), then the proposal. */
  private async settleAccepted(run: ActiveRun): Promise<void> {
    const r = run.round;
    const gatePass = r.gatePass;
    const passing = r.passing;
    if (gatePass === undefined || passing === undefined) throw new Error('the passing gate state is missing');
    const after = await run.shadow.changes(gatePass.id);
    if (after.length > 0) {
      await run.shadow.revertTo(gatePass.id, 'Discarded edits made after finish', run.view.round);
      this.notice(run, 'info', 'info', 'Changes made after finish were discarded: the proposal shows exactly the files the checks passed.');
    }
    await this.buildProposal(run, r.verdict ?? 'proved', passing.check, passing.flaggedDefinitions);
  }

  /** Give-up, no finish, caps: revert to the last passing commit, normalise it, re-check it, then the proposal. */
  private async settleReverted(run: ActiveRun, verdict: RunVerdict, reason: string): Promise<void> {
    const shadow = run.shadow;
    const target = await shadow.lastCommit(PASSING_COMMIT_KINDS);
    let reverted: ProposalView['report']['reverted'];
    if (target !== undefined) {
      await shadow.revertTo(target.id, `Reverted to “${target.label}”`, run.view.round);
      reverted = { toCommit: target.id, label: target.label, reason };
      this.notice(run, 'reverted', 'warning', `telelean reverted Claude's working copy to “${target.label}” (${reason}).`);
      if (target.kind === 'base') {
        // Back before any freeze of this round: the shown state is unfrozen.
        run.view.stage = 'formalise';
        run.view.frozen = undefined;
      }
    }
    const ctx = this.checkContext(run);
    try {
      await this.o.services.engine.normalise(ctx);
    } catch (e) {
      this.log('warn', `normalising the reverted state failed: ${errorText(e)}`);
    }
    let check: CheckReport;
    try {
      check = await this.o.services.engine.check(ctx);
    } catch (e) {
      check = { outcome: 'environment', environment: errorText(e), g0: [], findings: [], diagnostics: [], durationMs: 0 };
    }
    if (!this.live(run)) return;
    await this.buildProposal(run, verdict, check, check.rules?.flaggedDefinitions ?? [], reverted);
  }

  private statementsToRender(run: ActiveRun, check: CheckReport): string[] {
    const model = check.model;
    if (model === undefined) return [];
    const sel = run.p.selection;
    const focus = new Set([sel.target, ...sel.premises, ...sel.adoptedGhosts]);
    const touched = new Set([...(check.rules?.declarations.added ?? []), ...(check.rules?.declarations.changed ?? [])]);
    const names = new Set<string>();
    for (const entry of model.nodes.values()) {
      if (entry.node.subject !== sel.subject) continue;
      const st = entry.node.lean.statement;
      if (st !== undefined && (touched.has(st) || focus.has(entry.node.id))) names.add(st);
    }
    return [...names];
  }

  private async buildProposal(
    run: ActiveRun,
    verdict: RunVerdict,
    check: CheckReport,
    flagged: GateReport['flaggedDefinitions'],
    reverted?: ProposalView['report']['reverted'],
  ): Promise<void> {
    const { engine, proposals } = this.o.services;
    const shadow = run.shadow;
    let rendered: RenderedStatement[] = [];
    if (check.model !== undefined && check.outcome !== 'environment' && check.g0.length === 0) {
      const names = this.statementsToRender(run, check);
      if (names.length > 0) {
        try {
          rendered = await engine.renderStatements({ shadow, job: this.checkContext(run).job }, names);
        } catch (e) {
          this.log('warn', `statements could not be rendered: ${errorText(e)}`);
        }
      }
    }
    if (!this.live(run)) return;
    let drift: string[] = [];
    try {
      const readText = this.o.workspace.readText?.bind(this.o.workspace);
      if (readText !== undefined) drift = await proposals.baseDrift(shadow, readText, this.o.workspace.modelFiles?.());
    } catch (e) {
      this.log('warn', `drift could not be computed: ${errorText(e)}`);
    }
    const currentGraph = this.graph(run.p.selection.subject);
    if (currentGraph === undefined) throw new Error(`the subject ${run.p.selection.subject} could not be loaded`);
    run.ids.proposal += 1;
    const proposalId = `p${run.ids.proposal}`;
    this.touch(run);
    const proposal = await proposals.build({
      runId: run.runId,
      round: run.view.round,
      proposalId,
      selection: run.p.selection,
      shadow,
      check,
      rendered,
      currentGraph,
      verdict,
      ...(run.p.lastFinish !== undefined ? { finish: run.p.lastFinish } : {}),
      ghosts: run.p.ghosts.map(stripGhost),
      gateAttempts: run.p.gateAttempts.filter((g) => g.round === run.view.round),
      flaggedDefinitions: flagged,
      usage: { ...run.view.usage },
      durationMs: Math.max(0, this.nowMs() - Date.parse(run.view.startedAt)),
      agentMs: run.p.clocks.totalAgentMs + (run.clockSince !== undefined ? Math.max(0, this.nowMs() - run.clockSince) : 0),
      ...(reverted !== undefined ? { reverted } : {}),
      drift,
      graphVersion: this.nowMs(),
    });
    if (!this.live(run)) return;
    run.p.proposal = proposal;
    run.view.proposalId = proposalId;
    run.view.verdict = verdict;
    this.setState(run, 'review');
    this.activity(run, 'system', `Round ${run.view.round} ended: ${verdict}. The proposal is ready for review.`);
    await this.appendAttempt(run, verdict, proposal.report.footprint);
    await this.save(run, { run: true, proposal: true });
  }

  // ---- sidecars (attempts.jsonl, decisions.json)

  private async appendAttempt(run: ActiveRun, verdict: RunVerdict, footprint?: string[]): Promise<void> {
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

  private async resolveAttempt(run: ActiveRun, resolution: AttemptResolution['resolution']): Promise<void> {
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

  private async endRun(run: ActiveRun, state: 'accepted' | 'discarded' | 'cancelled' | 'failed', extra: { verdict?: RunVerdict; error?: string } = {}): Promise<void> {
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
    if (!this.disposed && run === this.run) await this.persist(run, { run: true, proposal: true });
    await this.prune(run);
  }

  private async failRun(run: ActiveRun, error: string): Promise<void> {
    if (run.ended) return;
    if (!run.round.attemptRecorded && run.view.state !== 'starting') await this.appendAttempt(run, 'failed');
    await this.endRun(run, 'failed', { verdict: 'failed', error });
  }

  private async prune(run: ActiveRun): Promise<void> {
    try {
      await pruneRunDirs(this.o.runsDir, this.o.root, this.o.settings.keepRuns, [run.runId]);
    } catch (e) {
      if (!(e instanceof NotImplementedError)) this.log('warn', `old runs could not be pruned: ${errorText(e)}`);
    }
  }

  // ---- RunManager: answers (D-20)

  async answer(runId: string, setId: string, answers: readonly QuestionAnswer[]): Promise<ActionOutcome> {
    return this.exclusive('answering', () => this.answerNow(runId, setId, answers));
  }

  private async answerNow(runId: string, setId: string, answers: readonly QuestionAnswer[]): Promise<ActionOutcome> {
    const run = this.runFor(runId);
    if (run === undefined) return refused('not-found', 'That run is not active any more.');
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
    const outcome = await this.continueSession(run, renderAnswersAsUserTurn(args, llmAnswers), true);
    return outcome.ok ? okOutcome('Answer sent to Claude') : outcome;
  }

  /** Sends `turn` on the live session, or on a resumed one (`--resume <session>`), and runs the round on. */
  private async continueSession(run: ActiveRun, turn: string, deliversAnswers = false): Promise<ActionOutcome> {
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
    if (deliversAnswers && run.p.undeliveredAnswers !== undefined) {
      run.p.undeliveredAnswers = undefined;
      await this.save(run);
    }
    void this.runRound(run, turn);
    return okOutcome('Claude continues');
  }

  // ---- RunManager: cancel, resume, discard, dismiss

  async cancel(runId: string): Promise<ActionOutcome> {
    const run = this.runFor(runId);
    if (run === undefined) return refused('not-found', 'That run is not active any more.');
    if (run.ended || isTerminalRunState(run.view.state)) return refused('conflict', 'This run has already ended.');
    if (run.stopping) return refused('conflict', 'This run is already being cancelled.');
    const inReview = run.view.state === 'review';
    const session = run.session;
    // Mark it as stopping at once, so tool calls and turns that return later change nothing.
    run.stopping = true;
    this.stopClock(run);
    run.abort.abort();
    try {
      await session?.interrupt();
    } catch {
      // the session may already be gone
    }
    try {
      await (this.o.services.cancelLean ?? leanCancelRun)(run.runId);
    } catch (e) {
      this.log('warn', `the run's Lean jobs could not be cancelled: ${errorText(e)}`);
    }
    if (inReview) await this.resolveAttempt(run, 'discarded');
    else await this.appendAttempt(run, 'cancelled');
    this.notice(run, 'info', 'info', 'You cancelled the run. Its working copy and transcript are kept until old runs are pruned.');
    await this.endRun(run, 'cancelled', { verdict: inReview ? (run.view.verdict ?? 'cancelled') : 'cancelled' });
    return okOutcome('Run cancelled');
  }

  async resume(runId: string): Promise<ActionOutcome> {
    return this.exclusive('resuming', () => this.resumeNow(runId));
  }

  private async resumeNow(runId: string): Promise<ActionOutcome> {
    const run = this.runFor(runId);
    if (run === undefined) return refused('not-found', 'That run is not active any more.');
    if (run.view.state !== 'interrupted') return refused('conflict', 'Only an interrupted run can be resumed.');
    if (!run.view.canResume || run.p.sessionId === undefined) return refused('conflict', 'This run cannot be resumed: Stop it and start a new one.');
    run.view.canResume = undefined;
    this.setState(run, 'working');
    this.notice(run, 'resumed', 'info', 'Claude resumed the run.');
    await this.save(run);
    const undelivered = run.p.undeliveredAnswers;
    if (undelivered !== undefined) {
      const args = argsOfAnswered(run.view.answered, undelivered.setId);
      const turn = renderAnswersAsUserTurn(args, {
        answers: undelivered.answers.map((a) => ({ question: a.question, choice: a.choice, scope: a.scope })),
        answeredAt: this.iso(),
      });
      return this.continueSession(run, turn, true);
    }
    return this.continueSession(run, resumeTurn(this.currentFreeze(run) !== undefined));
  }

  async discard(runId: string): Promise<ActionOutcome> {
    return this.exclusive('discarding', () => this.discardNow(runId));
  }

  private async discardNow(runId: string): Promise<ActionOutcome> {
    const run = this.runFor(runId);
    if (run === undefined) return refused('not-found', 'That run is not active any more.');
    const state = run.view.state;
    if (state !== 'review' && state !== 'interrupted') return refused('conflict', 'Only a finished round (or an interrupted run) can be discarded; Cancel stops a working run.');
    const hadProposal = state === 'review' && run.p.proposal !== undefined;
    if (state === 'review') await this.resolveAttempt(run, 'discarded');
    else {
      await this.appendAttempt(run, 'cancelled');
      await this.resolveAttempt(run, 'discarded');
    }
    await this.endRun(run, 'discarded');
    // "Stop" on an interrupted run discards no proposal (fixer round 1).
    return okOutcome(hadProposal ? 'Proposal discarded' : 'Run stopped');
  }

  async dismiss(runId: string): Promise<ActionOutcome> {
    const run = this.runFor(runId);
    if (run === undefined) return refused('not-found', 'That run is not shown any more.');
    if (!isTerminalRunState(run.view.state)) return refused('conflict', 'Only an ended run can be dismissed.');
    this.run = undefined;
    this.emit({ run: true, proposal: true });
    return okOutcome('Run dismissed');
  }

  // ---- RunManager: feedback (docs/m2-plan.md section 4.8)

  async feedback(runId: string, text: string): Promise<ActionOutcome> {
    return this.exclusive('sending feedback', () => this.feedbackNow(runId, text));
  }

  private async feedbackNow(runId: string, text: string): Promise<ActionOutcome> {
    const run = this.runFor(runId);
    if (run === undefined) return refused('not-found', 'That run is not active any more.');
    if (run.view.state !== 'review') return refused('conflict', 'Feedback is possible once Claude has finished its round.');
    const trimmed = text.trim();
    if (trimmed === '') return refused('invalid', 'Write what Claude should change.');
    await this.resolveAttempt(run, 'superseded');
    const head = await headCommit(run.shadow);
    this.startNewRound(run, 'formalise');
    if (head !== undefined) run.p.roundStartCommit = head.id;
    this.notice(run, 'info', 'info', `Round ${run.view.round}: your feedback was sent to Claude.`);
    this.activity(run, 'system', `Round ${run.view.round} (Feedback): “${sentenceShort(trimmed, 120)}”`);
    this.setState(run, 'working');
    await this.save(run, { run: true, proposal: true });
    const outcome = await this.continueSession(run, feedbackTurn(trimmed, this.o.settings.caps));
    return outcome.ok ? okOutcome('Feedback sent to Claude') : outcome;
  }

  /** Round + 1 with fresh caps (Feedback, adoption): the proposal is withdrawn. */
  private startNewRound(run: ActiveRun, stage: 'formalise' | 'prove'): void {
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

  // ---- RunManager: ghosts (docs/m2-plan.md section 4.9)

  async adoptGhost(runId: string, ghostId: string, rationale?: string): Promise<ActionOutcome> {
    return this.exclusive('adopting the suggestion', () => this.adoptGhostNow(runId, ghostId, rationale));
  }

  private async adoptGhostNow(runId: string, ghostId: string, rationale?: string): Promise<ActionOutcome> {
    const run = this.runFor(runId);
    if (run === undefined) return refused('not-found', 'That run is not active any more.');
    if (run.view.state !== 'review') return refused('conflict', "A suggestion can be adopted once Claude's round has ended.");
    const ghost = run.p.ghosts.find((g) => g.id === ghostId);
    if (ghost === undefined) return refused('not-found', 'That suggestion is not part of this run.');
    if (ghost.state !== 'suggested') return refused('conflict', `That suggestion was already ${ghost.state}.`);
    const shadow = run.shadow;
    const sel = run.p.selection;
    const before = await headCommit(shadow);
    let model: ProjectModel;
    try {
      model = await this.shadowModel(run);
    } catch (e) {
      return refused('internal', `telelean could not read its working copy: ${errorText(e)}`);
    }
    let plan: ReturnType<RunCore['planGhostAdoption']>;
    try {
      plan = this.core.planGhostAdoption(model, {
        subject: sel.subject,
        target: sel.target,
        naturalName: ghost.naturalName,
        leanStatement: ghost.leanStatement,
        leanName: ghost.leanName,
        ...(rationale !== undefined && rationale.trim() !== '' ? { rationale: rationale.trim() } : {}),
        session: run.runId,
        today: this.today(),
      });
    } catch (e) {
      if (e instanceof ActionError) return refused(e.code, e.message);
      return refused('internal', `The suggestion could not be written: ${errorText(e)}`);
    }
    const nextRound = run.view.round + 1;
    let adoptCommit: ShadowCommit;
    try {
      await shadow.writeFiles(plan.changes);
      adoptCommit = await shadow.commit('adopt', `Adopted “${sentenceShort(ghost.naturalName)}”`, nextRound);
    } catch (e) {
      if (before !== undefined) await shadow.revertTo(before.id, 'Adoption undone', run.view.round).catch(() => undefined);
      return refused('internal', `The suggestion could not be written: ${errorText(e)}`);
    }
    const selection = { ...sel, adoptedGhosts: [...sel.adoptedGhosts, plan.nodeId] };
    const ctx: CheckContext = {
      ...this.checkContext(run),
      selection,
      stage: 'formalise',
      round: nextRound,
      teleleanBlocks: [...selection.adoptedGhosts],
      roundStartCommit: adoptCommit.id,
    };
    delete ctx.freeze;
    let frozen: FreezeOutcome;
    try {
      frozen = await this.o.services.engine.freeze(ctx);
    } catch (e) {
      frozen = { ok: false, refusals: [errorText(e)], report: { outcome: 'environment', environment: errorText(e), g0: [], findings: [], diagnostics: [], durationMs: 0 }, environment: errorText(e) };
    }
    if (!this.live(run)) return refused('conflict', 'This run has ended.');
    if (!frozen.ok) {
      if (before !== undefined) await shadow.revertTo(before.id, 'Adoption undone: the statements could not be frozen with it', run.view.round);
      const why = frozen.environment !== undefined ? `telelean could not run Lean (${frozen.environment})` : frozen.refusals.join('; ');
      this.notice(run, 'info', 'warning', `“${sentenceShort(ghost.naturalName)}” could not be adopted: ${why}.`);
      await this.save(run);
      return refused('conflict', `The suggestion could not be adopted: ${why}`);
    }
    await this.resolveAttempt(run, 'superseded');
    this.startNewRound(run, 'prove');
    run.p.selection = selection;
    run.p.roundStartCommit = adoptCommit.id;
    run.p.freezes.push(frozen.record);
    run.view.frozen = { round: run.view.round, at: frozen.record.at, permitted: summaryOf(frozen.record.snapshot.permitted) };
    ghost.state = 'adopted';
    ghost.nodeId = plan.nodeId;
    const shortName = plan.leanName.split('.').pop() ?? plan.leanName;
    ghost.leanName = shortName;
    if (frozen.report.model !== undefined) run.lastModel = frozen.report.model;
    this.notice(run, 'info', 'info', `You adopted “${sentenceShort(ghost.naturalName)}” as an assumption; Claude now proves the goal with it (round ${run.view.round}).`);
    this.activity(run, 'ghost', `Adopted ${ghost.id} as ${plan.nodeId}; statements frozen again with it selected.`, true);
    this.setState(run, 'working');
    await this.save(run, { run: true, proposal: true });
    const turn = adoptionTurn({ nodeId: plan.nodeId, sentence: ghost.naturalName, leanName: plan.leanName, statement: ghost.leanStatement, caps: this.o.settings.caps });
    const outcome = await this.continueSession(run, turn);
    return outcome.ok ? okOutcome(`Adopted “${sentenceShort(ghost.naturalName)}”`) : outcome;
  }

  async rejectGhost(runId: string, ghostId: string): Promise<ActionOutcome> {
    const run = this.runFor(runId);
    if (run === undefined) return refused('not-found', 'That run is not active any more.');
    if (run.ended || isTerminalRunState(run.view.state)) return refused('conflict', 'This run has already ended.');
    const ghost = run.p.ghosts.find((g) => g.id === ghostId);
    if (ghost === undefined) return refused('not-found', 'That suggestion is not part of this run.');
    if (ghost.state !== 'suggested') return refused('conflict', `That suggestion was already ${ghost.state}.`);
    ghost.state = 'rejected';
    const shown = run.p.proposal?.ghosts.find((g) => g.id === ghostId);
    if (shown !== undefined) shown.state = 'rejected';
    this.activity(run, 'ghost', `You declined ${ghost.id}: “${sentenceShort(ghost.naturalName)}”.`);
    await this.save(run, { run: true, proposal: run.p.proposal !== undefined });
    return okOutcome('Suggestion declined');
  }

  /** The shadow's model files parsed (syntactic: what core's adoption plan needs). */
  private async shadowModel(run: ActiveRun): Promise<ProjectModel> {
    const files = await run.shadow.currentFiles();
    const library = run.p.library;
    const parsed = [...files.entries()].filter(([rel]) => rel.endsWith('.lean') && isModelPath(rel, library)).map(([rel, text]) => parseLeanFile(rel, text));
    const lakefile = files.get('lakefile.toml');
    return buildProjectModel({ files: parsed, fileHashes: {}, library, ...(lakefile !== undefined ? { lakefile: { path: 'lakefile.toml', text: lakefile } } : {}) });
  }

  // ---- RunManager: accept (docs/m2-plan.md section 7.1)

  async accept(runId: string, proposalId: string, lifecycle: readonly string[], definitions: readonly string[]): Promise<ActionOutcome> {
    return this.exclusive('accepting', () => this.acceptNow(runId, proposalId, lifecycle, definitions));
  }

  private async acceptNow(runId: string, proposalId: string, lifecycle: readonly string[], definitions: readonly string[]): Promise<ActionOutcome> {
    const run = this.runFor(runId);
    if (run === undefined) return refused('not-found', 'That run is not active any more.');
    if (run.view.state !== 'review' || run.p.proposal === undefined) return refused('conflict', 'There is no proposal to accept.');
    const proposal = run.p.proposal;
    if (proposal.proposalId !== proposalId) return refused('not-found', 'That proposal was replaced; review the current one.');
    const missingDefinitions = proposal.definitions.filter((d) => !definitions.includes(d.id));
    if (missingDefinitions.length > 0) return refused('invalid', 'Answer every definition question: a “no” is feedback.');
    const unknownLifecycle = lifecycle.filter((id) => !proposal.lifecycle.some((l) => l.id === id));
    if (unknownLifecycle.length > 0) return refused('not-found', `Unknown lifecycle item${unknownLifecycle.length === 1 ? '' : 's'}: ${unknownLifecycle.join(', ')}.`);
    const workspace = this.o.workspace;
    const readReal = workspace.readText?.bind(workspace);
    if (readReal === undefined || workspace.applyChanges === undefined) return refused('not-yet', 'This workspace cannot apply proposals.');
    const { proposals, engine } = this.o.services;
    const shadow = run.shadow;
    const request = { proposal, shadow, lifecycle: [...lifecycle], readReal, today: this.today(), premises: run.p.selection.premises.length };
    const drift = await proposals.baseDrift(shadow, readReal, workspace.modelFiles?.());
    let plan = await proposals.planAccept(request);
    if (!plan.ok) return refused(plan.code, plan.error);
    if (!this.live(run)) return refused('conflict', 'This run has ended.');

    let shown: ShadowCommit | undefined;
    if (drift.length > 0) {
      // D-21: rebase onto the user's current files, then re-freeze and re-gate with B = their files at Accept.
      shown = await headCommit(shadow);
      try {
        const library = run.p.library;
        const realPaths = new Set((workspace.modelFiles?.() ?? []).filter((p) => isModelPath(p, library)));
        const wsNow = await shadow.currentFiles();
        const real = new Map<string, string>();
        for (const rel of realPaths) {
          const text = await readReal(rel);
          if (text !== null) real.set(rel, text);
        }
        await shadow.writeFiles(diffMaps(wsNow, real, library));
        const acceptBase = await shadow.commit('accept-base', 'Your files at Accept', run.view.round);
        await shadow.writeFiles(diffMaps(real, plan.shadowState, library));
        const rebase = await shadow.commit('rebase', "Claude's changes rebased onto your files", run.view.round);
        const status = statusForRegate(proposal.report.verdict, run.p.lastFinish?.status);
        const ctx: CheckContext = { ...this.checkContext(run), baseCommit: acceptBase.id, roundStartCommit: rebase.id, stage: 'formalise' };
        delete ctx.freeze;
        await engine.normalise(ctx);
        let failure: string | undefined;
        let freeze: FreezeRecord | undefined;
        if (status === 'proved') {
          const f = await engine.freeze(ctx);
          if (!f.ok) failure = f.environment !== undefined ? `telelean could not run Lean (${f.environment})` : f.refusals.join('; ');
          else freeze = f.record;
        }
        if (failure === undefined) {
          const gateCtx: CheckContext & { status: FinishStatus } = { ...ctx, stage: freeze !== undefined ? 'prove' : 'formalise', status };
          if (freeze !== undefined) gateCtx.freeze = freeze;
          const report = await engine.gate(gateCtx);
          if (report.environment !== undefined) failure = `telelean could not run the checks (${report.environment})`;
          else if (!report.passed) {
            const dctx = this.describeContext(run, report.check.model);
            failure = report.findings.map((f) => this.describe(f, dctx)).join('; ') || 'the checks failed';
          }
        }
        if (failure !== undefined) {
          if (shown !== undefined) await shadow.revertTo(shown.id, 'Accept refused: working copy restored', run.view.round);
          return refused(
            'conflict',
            `Accept was refused: Claude's changes, applied to your current files, did not pass the checks (${failure}). Discard, or undo your edits since the run started and Accept again.`,
          );
        }
        const shownState = new Map([...(await shadow.currentFiles())].filter(([rel]) => isModelPath(rel, library)));
        plan = await proposals.planAccept({ ...request, shownState });
        if (!plan.ok) {
          if (shown !== undefined) await shadow.revertTo(shown.id, 'Accept refused: working copy restored', run.view.round);
          return refused(plan.code, plan.error);
        }
      } catch (e) {
        if (shown !== undefined) await shadow.revertTo(shown.id, 'Accept refused: working copy restored', run.view.round).catch(() => undefined);
        return refused('internal', `Accept failed: ${errorText(e)}`);
      }
    }
    if (!this.live(run)) return refused('conflict', 'This run has ended.');
    const outcome = await proposals.apply(plan, workspace, run.p.selection.subject);
    if (!outcome.ok) {
      if (shown !== undefined) await shadow.revertTo(shown.id, 'Accept refused: working copy restored', run.view.round).catch(() => undefined);
      return outcome;
    }
    await this.resolveAttempt(run, 'accepted');
    const target = this.graph(run.p.selection.subject)?.nodes.find((n) => n.id === run.p.selection.target);
    // An Accept that changed no file records the outcome only: no history entry, so no Undo step (fixer round 1). The
    // workspace says which: `undoable` is false exactly when it applied nothing.
    const changedFiles = !outcome.ok || outcome.undoable;
    let label: string | undefined;
    try {
      label = this.core.proposalLabel(proposal.report.verdict, target?.naturalName ?? run.p.selection.target, {
        lifecycle: lifecycle.length,
        adoptedGhosts: run.p.selection.adoptedGhosts.length,
        premises: run.p.selection.premises.length,
      });
    } catch {
      label = undefined;
    }
    // Fixer round 3: the outcome as data (core RunView.accepted), so a board that did not send the Accept need not parse
    // the notice below.
    run.view.accepted = { changedFiles };
    if (changedFiles) this.notice(run, 'info', 'info', label !== undefined ? `Accepted: ${label}. Undo reverts it.` : 'Accepted. Undo reverts it.');
    else this.notice(run, 'info', 'info', `Recorded${label !== undefined ? `: ${label}` : ''} (no file changed).`);
    await this.endRun(run, 'accepted');
    return changedFiles ? outcome : { ...outcome, label: label !== undefined ? `Recorded: ${label} (no file changed)` : 'Recorded (no file changed)' };
  }

  async proposalDiff(runId: string, proposalId: string): Promise<FileChange[]> {
    const run = this.runFor(runId);
    const proposal = run?.p.proposal;
    if (run === undefined || proposal === undefined || proposal.proposalId !== proposalId) return [];
    return this.o.services.proposals.diffFiles(run.shadow, proposal);
  }

  // ---- recovery and disposal (docs/m2-plan.md section 4.6)

  async recover(): Promise<void> {
    if (this.disposed || this.activeRun() !== undefined) return;
    const scanned = await scanRuns(this.o.runsDir, this.o.root);
    const active = scanned.filter((s) => nonTerminal(s.run.view.state));
    const [newest, ...older] = active;
    for (const old of older) {
      const v = old.run.view;
      v.state = 'failed';
      v.verdict = 'failed';
      v.error = 'superseded by a newer run';
      v.endedAt = this.iso();
      v.updatedAt = this.iso();
      v.pendingQuestions = undefined;
      v.canResume = undefined;
      delete old.run.sessionId;
      delete old.run.pendingAsk;
      try {
        await writeJsonAtomic(old.stateFile, old.run);
      } catch (e) {
        this.log('warn', `an old run could not be marked failed: ${errorText(e)}`);
      }
    }
    if (newest === undefined) return;
    const p = newest.run;
    let shadow: ShadowWorkspace;
    try {
      shadow = await (this.o.services.openShadow ?? openRunShadow)(newest.runDir, { root: this.o.root, library: p.library });
    } catch (e) {
      p.view.state = 'failed';
      p.view.verdict = 'failed';
      p.view.error = `the run's working copy could not be opened after the reload (${errorText(e)})`;
      p.view.endedAt = this.iso();
      delete p.sessionId;
      await writeJsonAtomic(newest.stateFile, p).catch(() => undefined);
      return;
    }
    if (this.disposed || this.activeRun() !== undefined) return;
    const run = this.makeRun(p, shadow);
    this.run = run;
    const state = p.view.state;
    if (state === 'starting' || state === 'working' || state === 'gate') {
      if (p.sessionId !== undefined && state !== 'starting') {
        p.view.state = 'interrupted';
        p.view.canResume = true;
        this.notice(run, 'interrupted', 'warning', 'The editor reloaded while Claude was working. Resume continues the same session; Stop discards the run.');
      } else {
        await this.endRun(run, 'failed', { verdict: 'failed', error: 'the editor reloaded before Claude had started' });
        return;
      }
    } else if (state === 'interrupted') {
      p.view.canResume = p.sessionId !== undefined ? true : undefined;
    }
    this.transcript(run, { kind: 'recovered', state: p.view.state });
    await this.save(run, { run: true, proposal: true });
  }

  /**
   * Window closing: an active run is persisted as `interrupted` (a waiting question or a proposal as it is) and its
   * session closed. run.json is written at once, synchronously; the returned promise resolves once the writes queued
   * before have landed and run.json holds that final state again (the extension waits for it, at most 4 s).
   */
  dispose(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const run = this.run;
    let written: Promise<void> = Promise.resolve();
    if (run !== undefined && !run.ended) {
      this.stopClock(run);
      const v = run.view;
      if (v.state === 'working' || v.state === 'gate' || v.state === 'starting') {
        v.state = 'interrupted';
        v.canResume = run.p.sessionId !== undefined ? true : undefined;
        this.notice(run, 'interrupted', 'warning', 'The editor closed while Claude was working.');
      }
      if (run.ask !== undefined) {
        const ask = run.ask;
        run.ask = undefined;
        ask.reject(new Error('telelean is closing'));
      }
      this.touch(run);
      written = run.files.close(`${JSON.stringify(run.p, null, 1)}\n`);
      run.ended = true;
      const session = run.session;
      run.session = undefined;
      run.unsubscribe?.();
      void session?.close({ force: true }).catch(() => undefined);
      // A check, gate or Accept re-check may be running: its result is thrown away, so stop its Lean job now rather
      // than letting it run on for up to leanJobMs when the extension host outlives the manager (fixer round 1).
      void Promise.resolve()
        .then(() => (this.o.services.cancelLean ?? leanCancelRun)(run.runId))
        .catch(() => undefined);
    }
    this.disposed = true;
    this.listeners.clear();
    return written;
  }

  // ---- the tool host (docs/m2-plan.md section 4.3)

  private makeToolHost(run: ActiveRun): AgentToolHost {
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
      finish: wrap('finish', (a: FinishArgs) => this.toolFinish(run, a)),
    };
  }

  private assertCanAct(run: ActiveRun): void {
    if (!this.live(run)) throw new Error('This run has ended; stop here.');
    if (run.round.outcome !== undefined) throw new Error('The run is complete; stop here.');
    const state = run.view.state;
    if (state === 'waiting-for-answer') throw new Error('another question is waiting for the person; wait for the answer');
    if (state !== 'working') throw new Error('The run is complete; stop here.');
  }

  private assertCheckBudget(run: ActiveRun): void {
    const max = this.o.settings.caps.maxChecks;
    const used = run.view.counters.checks;
    if (used >= max) throw new Error(`check budget used up (${used} of ${max}): call finish`);
  }

  private async validateFiles(run: ActiveRun, files: readonly string[] | undefined): Promise<string[] | undefined> {
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

  private toCheckResult(run: ActiveRun, report: CheckReport, files: readonly string[] | undefined): CheckResult {
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

  private async toolCheckLean(run: ActiveRun, args: CheckLeanArgs): Promise<CheckResult> {
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

  private isTargetRef(run: ActiveRun, targets: readonly string[]): boolean {
    if (targets.length !== 1) return false;
    const t = targets[0] ?? '';
    const sel = run.p.selection;
    if (t === sel.target) return true;
    const statement = run.lastModel?.nodes.get(sel.target)?.node.lean.statement ?? this.graph(sel.subject)?.nodes.find((n) => n.id === sel.target)?.lean.statement;
    if (statement === undefined) return false;
    return t === statement || `${sel.subject}.${t}` === statement;
  }

  private async toolFreeze(run: ActiveRun, args: FreezeStatementsArgs): Promise<FreezeResult> {
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
      this.activity(run, 'freeze', `freeze_statements: statements frozen (round ${run.view.round})`, true);
      await this.save(run);
      return { frozen: true, refusals: [], snapshotId: `freeze-${run.view.round}`, permitted: [...record.snapshot.permitted.all] };
    });
  }

  private async toolAskUser(run: ActiveRun, args: AskUserArgs, ctx: ToolCallContext): Promise<Answers> {
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

  private ghostName(run: ActiveRun, args: ProposeAssumptionArgs): string {
    const subject = run.p.selection.subject;
    const model = run.lastModel;
    const taken = (name: string): boolean => {
      const full = `${subject}.${name}`;
      if (model?.declFacts.has(full) || model?.declFacts.has(`${full}.holds`) || model?.ownerOfDecl.has(full)) return true;
      for (const file of model?.files.values() ?? []) if (file.decls.some((d) => d.fullName === full || d.fullName === `${full}.holds`)) return true;
      return run.p.ghosts.some((g) => g.leanName === name);
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

  private async toolProposeAssumption(run: ActiveRun, args: ProposeAssumptionArgs): Promise<Adoption> {
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

  private async runGate(run: ActiveRun, status: FinishStatus): Promise<GateReport> {
    const ctx = this.checkContext(run);
    try {
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

  private sleep(run: ActiveRun, ms: number): Promise<void> {
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

  private async commitGatePass(run: ActiveRun, report: GateReport, attempt: number): Promise<ShadowCommit> {
    const shadow = run.shadow;
    const judged = report.commit;
    if (judged !== undefined) {
      // Tools never run concurrently with Claude's edits, so ws/ still equals the judged commit; make sure of it.
      const changes = await shadow.changes(judged.id);
      if (changes.length > 0) await shadow.revertTo(judged.id, 'Restored the judged files', run.view.round);
    }
    return shadow.commit('gate-pass', `Checks passed (round ${run.view.round}, attempt ${attempt})`, run.view.round);
  }

  private async toolFinish(run: ActiveRun, args: FinishArgs): Promise<GateVerdict> {
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
        this.notice(run, 'environment', 'error', `telelean could not run the checks again (${report.environment}). This is not Claude's fault; the run stops here. Fix the cause, then start a new run.`);
        this.setState(run, 'working');
        await this.save(run);
        return { passed: false, failures: [], flaggedDefinitions: [], attempt, maxAttempts: max, next: 'give_up', environment: report.environment };
      }
      run.view.counters.gateAttempts = attempt;
      const flaggedNames = report.flaggedDefinitions.map((f) => f.name);
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
        const target = await run.shadow.lastCommit(PASSING_COMMIT_KINDS);
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
}

// ---------------------------------------------------------------------------------------------
// Module helpers

/** The finish status Accept's re-gate judges a proposal with: `proved` only for a proved verdict. */
function statusForRegate(verdict: RunVerdict, last: FinishStatus | undefined): FinishStatus {
  if (verdict === 'proved') return 'proved';
  return last !== undefined && last !== 'proved' ? last : 'not_proved';
}

function backendCliVersion(backend: LlmBackend): string | undefined {
  const version = (backend as { options?: { binary?: { version?: unknown } } }).options?.binary?.version;
  return typeof version === 'string' ? version : undefined;
}

function baseProblemSummary(report: CheckReport): string {
  const errors = report.diagnostics.filter((d) => d.severity === 'error');
  const items = errors.length > 0 ? errors.map((d) => `${d.file}:${d.line}: ${collapseWhitespace(d.message)}`) : [...report.g0, ...report.findings].map((f) => collapseWhitespace(f.message));
  const shown = items.slice(0, 3).map((t) => (t.length > 300 ? `${t.slice(0, 299)}…` : t));
  return `${shown.join('; ')}${items.length > 3 ? ` …and ${items.length - 3} more` : ''}` || 'Lean reported errors';
}

async function headCommit(shadow: ShadowWorkspace): Promise<ShadowCommit | undefined> {
  return (await shadow.commits()).at(-1);
}

/** Whole-file changes turning `from` into `to` (model files only). */
function diffMaps(from: ReadonlyMap<string, string>, to: ReadonlyMap<string, string>, library: string): FileChange[] {
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
function argsOfAnswered(answered: readonly AnsweredQuestionView[], setId: string): AskUserArgs {
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

export function createRunManagerImpl(options: RunManagerOptions): RunManager {
  if (!path.isAbsolute(options.root)) throw new TypeError(`createRunManager: root must be absolute, got ${JSON.stringify(options.root)}`);
  if (!path.isAbsolute(options.runsDir)) throw new TypeError(`createRunManager: runsDir must be absolute, got ${JSON.stringify(options.runsDir)}`);
  return new RunManagerImpl(options);
}
