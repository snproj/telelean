/**
 * The session layer (docs/slice2-plan.md 1.1's 2d, 2.6, 2.8, 3.1-3.5, 3.11-3.13): an edit session runs as one run of
 * version 2 (one run directory, one shadow, one Claude conversation, one transcript). On top of the StepRunner
 * (step.ts), which runs each step as one round with fresh caps, it keeps:
 *
 *   queues     the start, a mid-stage Formalize and Retry step each queue one step per target (sources first); a queue
 *              runs to its end before the stage opens (D2-63); the records and the view stay as they were when it
 *              started; Cancel step or a failure drops the rest of it ("not run") into `retry`
 *   steps      S₀ (`step-start`) and its StepScope in one run.json write; A12's statements-only mode decided at S₀;
 *              the step's turn; its end (passed, gave up: never behind S₀; cancelled or failed: back to S₀), the
 *              ledger's `created` entries (D2-43), a re-ask's outcome (D2-46), the rollbacks' ledger and drafts (AF10)
 *   the write queue (§2.6): every write of the session in one queue, each in four writes (run.json `inFlight`, the files,
 *              the shadow commit, run.json with the records, `head`, `inFlight` cleared), the in-memory session
 *              changing only at steps 1 and 4 (AF11); 2d's writes are `queue-start` and `judge-apply` (2e adds
 *              `decide` and `submit-take-out`, review.ts); a queue of Claude steps starts as its last write (`asLastWrite`)
 *   the judge  when a queue ends: `engine.judge` on the head, then its whole outcome as one `judge-apply` write
 *              (reconcile, its reverts, `judged`, `judged-facts.json`), dropped and run again when the head moved, run
 *              again after its reverts until it converges; then the stage opens (§3.5)
 *   recovery   run.json v2: the write in flight finished, the stage judgement computed again from `judged-facts.json`
 *              (D2-72), a step that ran interrupted, a queue between two steps waiting for Resume or Cancel step
 *   views      the SessionView (core `buildSessionView`, masked while the results are hidden) and the session's RunView
 *              (§3.12), published when the session changes (`RunChange.session`)
 *
 * While a step runs, every review action is refused with D2-62's text. 2e's review actions are review.ts's (the
 * ReviewRunner on top of this layer); 2f's answer that refusal, or `not-yet`, until then. Only a queue's end judges
 * while the phase is `step`, and only a converged judgement is published, its view version raised only when what the
 * person sees changed (F17).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  anonymousInstanceName,
  arrowKey,
  ATTEMPT_FORMAT,
  ATTEMPT_RESOLUTION_FORMAT,
  buildProjectModel,
  buildSessionView,
  CLAUDE_SESSION_TEXTS,
  computeItems,
  formalizeOrder,
  formalizeStartProblems,
  judgeState,
  parseLeanFile,
  planAction,
  planItemRevert,
  premiseDraftKey,
  premiseKey,
  proofKey,
  proposeArrowProblems,
  reachingDraft,
  reconcile,
  REVIEW_TEXTS,
  subjectGraph,
  type ActionOutcome,
  type ArrowProvenance,
  type AttemptRecord,
  type AttemptResolution,
  type FileChange,
  type FormalizeSession,
  type LeanFacts,
  type LedgerEntry,
  type PremiseDraft,
  type ProjectModel,
  type RunCounters,
  type RunVerdict,
  type RunView,
  type SealBy,
  type SessionInference,
  type SessionRecords,
  type SessionView,
  type StateJudgement,
  type StepScope,
  type StepState,
} from '@telelean/core';

import { BASE_FACTS_FILE, filesKey } from '../gate/index.js';
import { cancelRun as leanCancelRun } from '../lean/runLean.js';
import type { CheckContext, CheckReport, FreezeRecord, SessionCheckContext } from '../gate/types.js';
import type { Adoption, ArrowProposal, ProposeArrowArgs, ProposeAssumptionArgs } from '../llm/types.js';
import { sha256Text } from '../semantic/project.js';
import { isLeanModelPath } from '../shadow/paths.js';
import { createRunShadow, runsDirOf } from '../shadow/index.js';
import type { ShadowCommit, ShadowWorkspace } from '../shadow/types.js';
import { writeTextAtomic } from './persist.js';
import { preflight as defaultPreflight } from './preflight.js';
import { formalizePlan, personNote, renderContextBundle, stepTurn } from './prompts.js';
import {
  ActiveRun,
  backendCliVersion,
  baseProblemSummary,
  defaultRunId,
  errorText,
  okOutcome,
  refused,
  sentenceShort,
  StepRunner,
  verdictOfStatus,
  ZERO_USAGE,
  type SessionRuntime,
} from './step.js';
import {
  PERSISTED_RUN_FORMAT,
  PERSISTED_SESSION_FORMAT,
  type FormalizeRequest,
  type PersistedRun,
  type PersistedSession,
  type PersistedStep,
  type RunChange,
  type SessionWrite,
} from './types.js';

/** The stage judgement's facts, kept beside run.json (§2.6): replaced only together with `judged`. */
export const JUDGED_FACTS_FILE = 'judged-facts.json';
const JUDGED_FACTS_FORMAT = 'telelean-judged-facts';
/** Lean's renderings of the statement items, by content key (§3.12). */
export const RENDERINGS_FILE = 'renderings.json';
/** A judge-apply's reverts make the judge run again; this many rounds at most (each item is reverted at most once). */
const MAX_JUDGE_ROUNDS = 8;
/** How long Cancel step waits for the round in progress to stop (the Claude process is closed at once). */
const STOP_WAIT_MS = 15_000;
const SESSION_CHANGE: RunChange = { run: true, proposal: false, session: true };

/** Steps whose Result exists: their step ended (§4.2, F9). */
export const ENDED_STATES: ReadonlySet<StepState> = new Set<StepState>(['passed', 'gave-up']);
const RUNNING_STATES: ReadonlySet<StepState> = new Set<StepState>(['running', 'interrupted']);

const ZERO_COUNTERS: RunCounters = { turns: 0, checks: 0, agentMs: 0, gateAttempts: 0 };

/** §2.9: what core reads of a PersistedSession. */
export function toSessionRecords(s: PersistedSession): SessionRecords {
  return {
    stage: s.stage,
    phase: s.phase,
    inferences: s.inferences,
    steps: s.steps.map((st) => ({
      id: st.id,
      kind: st.kind,
      target: st.target,
      stage: st.stage,
      state: st.state,
      question: st.scope.question,
      ...(st.lastFinish?.no_alternative === true ? { noAlternative: true } : {}),
      ...(st.retryOf !== undefined ? { retryOf: st.retryOf } : {}),
      ...(st.scope.statementsOnly !== undefined ? { statementsOnly: st.scope.statementsOnly } : {}),
      ...(st.queue !== undefined ? { queue: st.queue } : {}),
    })),
    queue: s.queue,
    retry: s.retry,
    items: s.items,
    premises: s.premises,
    ledger: s.ledger,
    rejectedArrows: s.rejectedArrows,
    stack: s.stack,
    nextAction: s.nextAction,
    ...(s.forced !== undefined ? { forced: s.forced } : {}),
    ...(s.heading !== undefined && s.heading !== null ? { heading: s.heading } : {}),
    ...(s.confirmation !== undefined ? { confirmation: s.confirmation } : {}),
    ...(s.drift !== undefined ? { drift: s.drift } : {}),
    ...(s.positions !== undefined ? { positions: s.positions } : {}),
    events: s.events,
  };
}

/** The records reconcile may change, written back into the persisted session (a copy). */
function withRecords(s: PersistedSession, records: SessionRecords): PersistedSession {
  const next: PersistedSession = { ...s, items: records.items, premises: records.premises, inferences: records.inferences };
  if (records.forced !== undefined) next.forced = records.forced;
  else delete next.forced;
  return next;
}

/** A project model of a file set (the engine's way: the model files of the library, with facts when given). */
export function filesModel(files: ReadonlyMap<string, string>, library: string, facts?: LeanFacts): ProjectModel {
  const lean = [...files.keys()].filter((p) => isLeanModelPath(p, library)).sort();
  const fileHashes: Record<string, string> = {};
  for (const p of lean) fileHashes[p] = sha256Text(files.get(p) ?? '');
  const lakefile = lakefileOf(files);
  return buildProjectModel({
    files: lean.map((p) => parseLeanFile(p, files.get(p) ?? '')),
    fileHashes,
    library,
    ...(facts !== undefined ? { facts } : {}),
    ...(lakefile !== undefined ? { lakefile } : {}),
  });
}

function lakefileOf(files: ReadonlyMap<string, string>): { path: string; text: string } | undefined {
  const p = ['lakefile.toml', 'lakefile.lean'].find((f) => files.has(f));
  return p !== undefined ? { path: p, text: files.get(p) ?? '' } : undefined;
}

/**
 * Every declaration name of a model's files (what D2-43's `created` entries are about), an anonymous instance by the
 * name Lean gives it (core `anonymousInstanceName`, as computeItems names its unit): builder 2f found, with real Lean on
 * a fresh model, that a step's new helper instance of a presupposition (`instance : Nonempty Being := Being.exists`)
 * got no `created` entry, so computeItems found no owner and the stage and the final check refused it as unowned.
 */
export function declarationNames(model: ProjectModel): Set<string> {
  const out = new Set<string>();
  for (const file of model.files.values()) {
    for (const d of file.decls) {
      const name = d.fullName ?? (d.keyword === 'instance' ? anonymousInstanceName(file, d) : undefined);
      if (name !== undefined) out.add(name);
    }
  }
  return out;
}

const hasHolds = (model: ProjectModel, card: string): boolean => model.nodes.get(card)?.node.lean.justificationKind !== undefined;
const statementEmpty = (model: ProjectModel, card: string): boolean => {
  const node = model.nodes.get(card)?.node;
  return node !== undefined && (node.lean.statement === undefined || node.lean.binding === 'none');
};

const stepOf = (s: PersistedSession, id: string): PersistedStep => {
  const step = s.steps.find((x) => x.id === id);
  if (step === undefined) throw new Error(`the session has no step ${id}`);
  return step;
};

/** 2j2 (D2-97): a note step that cleared its note, in the decisions-since lines. */
export const NOTE_CLEARED = "  The person's note was cleared.";

/**
 * §2.8: the decide and Show results actions on the stack since the previous queue started (the labels the person saw),
 * for the first step of a mid-stage Formalize or a Retry queue. 2j2 (D2-92, D2-97): under a decide action's label, each
 * distinct note of its declines; a note on an item to be redone, its label and its note (or that it was cleared). Each
 * entry is one `- ` line of the turn, its notes on the lines after it.
 */
export function decisionsSince(s: Pick<PersistedSession, 'stack'>): string[] {
  const done = s.stack.done;
  const seals = done.flatMap((a, k) => (a.kind === 'seal' ? [k] : []));
  const last = seals.at(-1) ?? done.length;
  const previous = seals.length >= 2 ? (seals.at(-2) as number) : -1;
  return done.slice(previous + 1, last).flatMap((a) => {
    if (a.kind === 'reveal') return [a.label];
    if (a.kind === 'note') return [[a.label, a.after !== undefined ? personNote(a.after) : NOTE_CLEARED].join('\n')];
    if (a.kind !== 'decide') return [];
    const notes = [...new Set(a.request.decisions.flatMap((d) => (d.to === 'declined' && d.note !== undefined && d.note.trim() !== '' ? [d.note] : [])))];
    return [[a.label, ...notes.map(personNote)].join('\n')];
  });
}

/** The newest queue number of the session (1 for the start's queue). */
const currentQueue = (s: PersistedSession): number => s.steps.reduce((m, x) => Math.max(m, x.queue ?? 1), 0);

/**
 * (builder 2e, 2d's review R1-1) A decision (a decide, Show results or a move) is on the done stack after the newest
 * seal: the user acted on the stage since its queue started (the first queue has no seal: every action counts).
 * 2j2 (builder decision 9; fixer r1, A-ADV-2j2-1): a note on an item to be redone counts, as a move does. Exported to
 * be tested alone.
 */
export const decidedSinceSeal = (s: Pick<PersistedSession, 'stack'>): boolean => {
  const done = s.stack.done;
  const seal = done.map((a) => a.kind).lastIndexOf('seal');
  return done.slice(seal + 1).some((a) => a.kind === 'decide' || a.kind === 'reveal' || a.kind === 'move' || a.kind === 'note');
};

/** The targets whose step ended (each has a Result draft, §4.2). */
export function endedTargets(s: PersistedSession): string[] {
  return [...new Set(s.steps.filter((x) => ENDED_STATES.has(x.state)).map((x) => x.target))];
}

const sameFiles = (a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean => {
  if (a.size !== b.size) return false;
  for (const [p, t] of a) if (b.get(p) !== t) return false;
  return true;
};

function newRuntime(): SessionRuntime {
  return {
    view: null,
    writes: Promise.resolve(),
    pendingWrites: 0,
    judging: false,
    judgement: null,
    baseModel: undefined,
    judgedModel: undefined,
    converging: false,
    board: undefined,
    renderings: {},
    judges: Promise.resolve(),
    queuedJudges: 0,
    stateChanged: false,
  };
}

/**
 * The heading's text when a decision's judge leaves a working copy that does not pass (§3.6: B plus the accepted items
 * fail; builder 2e). Its own runner text (2e's review, R1-1; builder 2f): no step ran, so not core's "Claude's step did
 * not pass: …", which stays a step's heading (ES-4). The Accept refusal under it (review.ts `DECIDED_DID_NOT_PASS`)
 * starts with this text, so the two agree.
 */
export const DECISIONS_DID_NOT_PASS = 'Your decisions leave a working copy that does not pass its checks';

/** Shown, in place of Claude's work, while the SessionView cannot be built (fixer 2d r1, A-F4). */
export const SESSION_VIEW_FAILED = 'telelean could not build the review list. Nothing of it is shown until it can: reload the window to try again, or Exit the session.';

/**
 * Options of one judge (§3.5): a queue's end. `queueSteps` (reconcile's queue-end rules) only for a queue whose end was
 * not reconciled yet (`PersistedSession.queueEndReconciled`, fixer 2d r1).
 */
interface JudgeOptions {
  queueSteps?: string[];
  endsQueue?: boolean;
  /**
   * (builder 2e) A judge a decision's write started (§3.6): when it converges on a state that does not pass (B plus the
   * accepted items fail), the stage is headed "did not pass" (ES-4: no Accept until a later step passes).
   */
  decided?: boolean;
}

/**
 * §3.8, §3.11 (fixer 2d r1, F-V2D-FC-8): an Add premise draft with no fully explicit form (a pending ghost of a converted
 * v1 run: v1 kept none) takes the one its re-check rendered on the judged state (`CheckReport.premiseExplicit`, by item
 * key), on the draft and on its record's content, so the premise write's meaning check (§3.8) has its form to compare.
 * A draft's own form (its propose_assumption check's) is never replaced.
 */
function explicitFromChecks(s: PersistedSession, explicit: Readonly<Record<string, string>> | undefined): void {
  if (explicit === undefined) return;
  const formOf = (key: string): string | undefined => (Object.hasOwn(explicit, key) && explicit[key] !== '' ? explicit[key] : undefined);
  s.premises = s.premises.map((d) => {
    const form = d.explicit === '' ? formOf(premiseKey(d.target, d.leanName)) : undefined;
    return form !== undefined ? { ...d, explicit: form } : d;
  });
  for (const r of s.items) {
    const draft = r.kind === 'add-premise' ? r.content.premise : undefined;
    const form = draft !== undefined && draft.explicit === '' ? formOf(r.key) : undefined;
    if (draft !== undefined && form !== undefined) r.content = { ...r.content, premise: { ...draft, explicit: form } };
  }
}

/**
 * §3.11, AF12 (fixer 2d r1, A-F2): an Add premise record whose key has a ledger `premise` entry is written, so it holds
 * that entry's card (a converted v1 run's adopted ghost is the one written while in review). Derived from the ledger at
 * every judge-apply, never from memory, so a reload during the conversion's first judge loses nothing. The two always
 * change together: the premise write's step 4 sets both, a take-out (§3.8) drops both.
 */
function cardsFromLedger(s: PersistedSession): void {
  for (const r of s.items) {
    if (r.kind !== 'add-premise' || r.card !== undefined) continue;
    const entry = s.ledger.find((e): e is Extract<LedgerEntry, { kind: 'premise' }> => e.kind === 'premise' && e.item === r.key);
    if (entry !== undefined) r.card = entry.card;
  }
}

export abstract class SessionRunner extends StepRunner {
  // ---------------------------------------------------------------------------------------------
  // Basics

  protected sessionOf(run: ActiveRun): PersistedSession {
    const s = run.p.session;
    if (s === undefined) throw new Error('this run is no edit session');
    return s;
  }

  protected runtimeOf(run: ActiveRun): SessionRuntime {
    run.live ??= newRuntime();
    return run.live;
  }

  /** D2-62: a step runs (or is interrupted, or a queue waits between two steps): the session takes no action. */
  protected stepRunning(s: PersistedSession): boolean {
    return s.phase === 'step' || s.phase === 'interrupted';
  }

  /** The running or interrupted step, if any. */
  protected activeStep(s: PersistedSession): PersistedStep | undefined {
    return s.steps.find((x) => RUNNING_STATES.has(x.state));
  }

  /** §3.6: a judge runs or is due (queued behind another, A-F6), or the write queue holds a write. */
  protected isJudging(run: ActiveRun): boolean {
    const rt = run.live;
    return rt !== undefined && (rt.judging || rt.pendingWrites > 0 || rt.queuedJudges > 0);
  }

  /**
   * §2.4: `session` is posted whenever the phase or a step's state changes. Those that follow the run's state (an
   * interrupted step, its Resume: `onStateChanged`) mark the runtime, and the next run.json write posts the session
   * (fixer 2d r1, F-V2D-FC-4).
   */
  protected withStateChange(run: ActiveRun, change: RunChange): RunChange {
    return run.p.session !== undefined && run.live?.stateChanged === true && !change.session ? { ...change, session: true } : change;
  }

  protected override persist(run: ActiveRun, change: RunChange): Promise<void> {
    return super.persist(run, this.withStateChange(run, change));
  }

  /** Writes run.json now, rejecting when it fails (a session write's steps 1 and 4); then publishes as `persist`. */
  protected async persistChecked(run: ActiveRun, given: RunChange = SESSION_CHANGE): Promise<void> {
    const change = this.withStateChange(run, given);
    this.touch(run);
    const text = `${JSON.stringify(run.p, null, 1)}\n`;
    await run.files.writeStateChecked(text);
    if (this.disposed || run !== this.run) return;
    run.saved = JSON.parse(text) as PersistedRun;
    this.onPersisted(run, change);
    this.emit(change);
  }

  /**
   * §2.6 step 4: tried once more when it fails; a second failure stops the queue (a reload's recover() finishes it).
   * `change`: what it publishes (a judge-apply round that its reverts make run again publishes nothing, F17).
   */
  protected async persistStep4(run: ActiveRun, change: RunChange = SESSION_CHANGE): Promise<void> {
    try {
      await this.persistChecked(run, change);
    } catch {
      try {
        await this.persistChecked(run, change);
      } catch (e) {
        this.notice(run, 'environment', 'error', REVIEW_TEXTS.saveFailed(errorText(e)));
        throw e;
      }
    }
  }

  protected override onPersisted(run: ActiveRun, change: RunChange): void {
    if (run.p.session === undefined || !change.session) return;
    const rt = this.runtimeOf(run);
    rt.stateChanged = false;
    rt.view = this.buildView(run);
  }

  // ---------------------------------------------------------------------------------------------
  // Models (B with the base facts; the judged commit with judged-facts.json)

  protected async loadBaseModel(run: ActiveRun): Promise<ProjectModel> {
    const rt = this.runtimeOf(run);
    if (rt.baseModel !== undefined) return rt.baseModel;
    const shadow = run.shadow;
    const files = await shadow.baseFiles();
    let facts: LeanFacts | undefined;
    try {
      const json = JSON.parse(await readFile(path.join(shadow.paths.runDir, BASE_FACTS_FILE), 'utf8')) as { format?: string; facts?: LeanFacts };
      if (json.format === 'telelean-base-facts' && json.facts?.format === 'telelean-lean-facts') facts = json.facts;
    } catch {
      facts = undefined;
    }
    rt.baseModel = filesModel(files, run.p.library, facts);
    return rt.baseModel;
  }

  protected async readJudgedFacts(run: ActiveRun): Promise<{ commit: string; filesKey: string; facts?: LeanFacts } | undefined> {
    try {
      const json = JSON.parse(await readFile(path.join(run.shadow.paths.runDir, JUDGED_FACTS_FILE), 'utf8')) as Record<string, unknown>;
      if (json['format'] !== JUDGED_FACTS_FORMAT || typeof json['commit'] !== 'string' || typeof json['filesKey'] !== 'string') return undefined;
      const facts = json['facts'] as LeanFacts | null;
      return { commit: json['commit'], filesKey: json['filesKey'], ...(facts !== null && facts?.format === 'telelean-lean-facts' ? { facts } : {}) };
    } catch {
      return undefined;
    }
  }

  protected async writeJudgedFacts(run: ActiveRun, commit: string, key: string, facts: LeanFacts | undefined): Promise<void> {
    const text = `${JSON.stringify({ format: JUDGED_FACTS_FORMAT, version: 1, commit, filesKey: key, facts: facts ?? null })}\n`;
    await writeTextAtomic(path.join(run.shadow.paths.runDir, JUDGED_FACTS_FILE), text);
  }

  protected async loadRenderings(run: ActiveRun): Promise<void> {
    const rt = this.runtimeOf(run);
    try {
      const json = JSON.parse(await readFile(path.join(run.shadow.paths.runDir, RENDERINGS_FILE), 'utf8')) as { renderings?: Record<string, { pretty: string; explicit: string }> };
      if (typeof json.renderings === 'object' && json.renderings !== null) rt.renderings = json.renderings;
    } catch {
      rt.renderings = {};
    }
  }

  // ---------------------------------------------------------------------------------------------
  // The views (§2.3, §3.12)

  /** The session's words per step (Claude's), which buildSessionView shows only with the results (D2-10). */
  protected wordsOf(s: PersistedSession): Record<string, { summary?: string; gap?: string; proposedNothing?: string; assumedWithoutAsking?: Array<{ text: string; items: string[] }> }> {
    const out: ReturnType<SessionRunner['wordsOf']> = {};
    for (const step of s.steps) {
      const f = step.lastFinish;
      if (f === undefined) continue;
      out[step.id] = {
        summary: f.summary,
        ...(f.gap !== undefined ? { gap: f.gap } : {}),
        ...(step.proposedNothing === true && step.state === 'passed' ? { proposedNothing: f.summary } : {}),
        assumedWithoutAsking: f.assumed_without_asking.map((text) => ({ text, items: [] })),
      };
    }
    return out;
  }

  /** The SessionView of `s` with the runtime's stage judgement (it throws when buildSessionView does). No side effect. */
  protected viewOf(run: ActiveRun, s: PersistedSession, rt: SessionRuntime & { baseModel: ProjectModel }): SessionView {
    const judged = rt.judgement !== null ? rt.judgedModel : undefined;
    const view = buildSessionView({
      runId: run.runId,
      subject: run.p.view.subject,
      records: toSessionRecords(s),
      judgement: judged !== undefined ? rt.judgement : null,
      base: rt.baseModel,
      current: judged?.model ?? rt.baseModel,
      renderings: rt.renderings,
      words: this.wordsOf(s),
      judging: this.isJudging(run),
      viewVersion: s.viewVersion,
      ...(judged?.lakefile !== undefined ? { lakefile: judged.lakefile } : {}),
      // 2f: the runner's own problems of the stage (a premise write that could not be made, §3.8), and the working
      // copy's endorsements (its board's build input, §2.9's note).
      problems: this.stageProblems(run, s),
      ...this.viewEndorsements(run),
    });
    // F17: while a judge-apply's reverts make the judge run again, the previous board stays.
    if (rt.converging && rt.board !== undefined) view.board = rt.board;
    return view;
  }

  /** (2f, §3.8) The runner's own problems of the stage, for the view (SessionViewInput.problems): none here. */
  protected stageProblems(_run: ActiveRun, _s: PersistedSession): Array<{ text: string; items: string[] }> {
    return [];
  }

  /**
   * (2f; §2.9's note on `maskedModel`) The working copy's endorsements, its board's build input, which a ProjectModel
   * does not keep: the person's files' (the session's working copy starts from them and Apply alone writes the file).
   */
  protected viewEndorsements(_run: ActiveRun): { endorsements?: NonNullable<Parameters<typeof buildSessionView>[0]['endorsements']> } {
    return {};
  }

  /**
   * F17, §3.5 step 4 (builder 2e): the view version a judge-apply's write of `next` publishes, raised only when the view
   * it gives differs in what the user can see from the one last published (`judging` and the version itself aside).
   * So a change only hidden content had (a hidden Result a judge took out, a revert round while converging) raises
   * nothing, and the masked graph's `version` never counts hidden changes.
   */
  protected visibleViewVersion(run: ActiveRun, next: PersistedSession): number {
    const rt = this.runtimeOf(run);
    const last = rt.view;
    if (last === null || rt.baseModel === undefined || rt.viewError !== undefined) return next.viewVersion + 1;
    let candidate: SessionView;
    try {
      candidate = this.viewOf(run, { ...next, viewVersion: last.board.graph.version }, rt as SessionRuntime & { baseModel: ProjectModel });
    } catch {
      return next.viewVersion + 1;
    }
    const visible = (v: SessionView) => JSON.stringify({ ...v, judging: false });
    return visible(candidate) === visible(last) ? next.viewVersion : next.viewVersion + 1;
  }

  /** The SessionView of the session as run.json holds it (null when it cannot be built yet). */
  protected buildView(run: ActiveRun): SessionView | null {
    const s = run.p.session;
    const rt = run.live;
    if (s === undefined || rt === undefined || rt.baseModel === undefined) return rt?.view ?? null;
    try {
      const view = this.viewOf(run, s, rt as SessionRuntime & { baseModel: ProjectModel });
      if (!(rt.converging && rt.board !== undefined)) rt.board = view.board;
      delete rt.viewError;
      return view;
    } catch (e) {
      // Fail closed (fixer 2d r1, A-F4): never the previous view, whose reveal state, results and rules belong to
      // another state of the records (the RunView would show Claude's work while the results are hidden, D2-10, and a
      // mid-stage Formalize would read them as shown, D2-65). No view until one can be built.
      this.log('error', `the session view could not be built: ${errorText(e)}`);
      rt.viewError = errorText(e);
      return null;
    }
  }

  /** §3.12: the RunView of a session, from the saved view and the session's view (`viewError`: it could not be built). */
  protected sessionRunView(saved: PersistedRun, view: SessionView | null, viewError?: string): RunView {
    const v = structuredClone(saved.view);
    const s = saved.session as PersistedSession;
    v.session = { stage: s.stage, phase: s.phase };
    // AF5: the InferenceView's question rule, from the SessionView (never the records directly). With no view, the
    // question each target's latest ended step asked (the record's when none ended), which tells no outcome: the record's
    // changes only when a re-ask proves its target (D2-46).
    const asked = (i: SessionInference): string[] => [...([...s.steps].reverse().find((x) => x.target === i.target && ENDED_STATES.has(x.state))?.scope.question.sources ?? i.question.sources)];
    const inferences =
      view !== null
        ? view.inferences.map((i) => ({ target: i.target.id, premises: i.question.map((c) => c.id) }))
        : s.inferences.map((i) => ({ target: i.target, premises: asked(i) }));
    v.inferences = inferences;
    if (inferences[0] !== undefined) {
      v.target = inferences[0].target;
      v.premises = [...inferences[0].premises];
    }
    const active = this.activeStep(s) ?? [...s.steps].reverse().find((x) => x.state !== 'queued' && x.state !== 'not-run');
    if (active !== undefined) {
      const inQueue = s.steps.filter((x) => x.queue === active.queue);
      const running = RUNNING_STATES.has(active.state);
      v.step = {
        index: inQueue.indexOf(active) + 1,
        of: inQueue.length,
        target: active.target,
        kind: active.kind,
        statementsFixed: running ? saved.view.frozen !== undefined : active.freezeCommit !== undefined,
      };
    } else delete v.step;
    // D2-10, AF9: nothing of Claude's work while a step runs or while the results are hidden (a start refused before
    // any step ran has none: its own notice, e.g. a base telelean could not check, stays).
    const started = s.steps.some((x) => x.state !== 'queued');
    if (viewError !== undefined || (started && (this.stepRunning(s) || view === null || !view.results.shown))) {
      v.activity = [];
      v.notices = [];
    }
    // A-F4: the one telelean notice while no view can be built (it names nothing of the session's content).
    if (viewError !== undefined) v.notices = [{ id: 'session-view-error', at: v.updatedAt, level: 'error', kind: 'environment', text: SESSION_VIEW_FAILED }];
    delete v.frozen;
    delete v.proposalId;
    v.ghosts = [];
    if (v.verdict !== undefined && !['cancelled', 'failed', 'cap-reached'].includes(v.verdict)) delete v.verdict;
    return v;
  }

  // ---------------------------------------------------------------------------------------------
  // Starting a session (§3.2)

  /** ES-1: preflight, the shadow and its base, the backend, the conversation; one formalize step per target. */
  protected async startSession(request: FormalizeRequest): Promise<ActionOutcome> {
    const { root, workspace, settings, services } = this.o;
    const subject = request.subject;
    const asked = request.inferences.map((i) => ({ target: i.target, premises: [...new Set(i.premises)] }));
    if (asked.length === 0) return refused('invalid', 'Select arrows into one card.');
    const active = this.activeRun();
    for (const inf of asked) {
      const pre = await (services.preflight ?? defaultPreflight)({
        root,
        workspace,
        request: { subject, target: inf.target, premises: inf.premises },
        settings,
        ...(active !== undefined ? { activeRunId: active.runId } : {}),
      });
      if (!pre.ok) return refused(pre.problem === 'busy' ? 'conflict' : 'not-yet', pre.message);
    }
    if (this.activeRun() !== undefined) return refused('conflict', 'Another Claude run of this model folder is still active.');

    let backend;
    try {
      backend = await this.obtainBackend();
    } catch (e) {
      return refused('not-yet', `Claude could not be started: ${errorText(e)}`);
    }

    const graph = workspace.graph(subject);
    const order = formalizeOrder(graph, asked);
    const byTarget = new Map(asked.map((i) => [i.target, i]));
    const first = byTarget.get(order[0] ?? '') ?? asked[0];
    if (first === undefined) return refused('invalid', 'Select arrows into one card.');
    const firstNode = graph.nodes.find((n) => n.id === first.target);
    if (firstNode === undefined) return refused('not-found', `The target "${first.target}" is not a card of ${subject}.`);

    const library = this.library;
    const files = new Map<string, string>();
    for (const rel of workspace.modelFiles?.() ?? []) {
      const text = await workspace.readText?.(rel);
      if (typeof text === 'string') files.set(rel, text);
    }
    const runId = (services.newRunId ?? defaultRunId)();
    const cliVersion = backendCliVersion(backend);
    let shadow: ShadowWorkspace;
    try {
      shadow = await (services.createShadow ?? createRunShadow)({ root, runsDir: runsDirOf(root), runId, library, files, now: () => this.now(), copyBuild: settings.reuseLeanBuild === true });
    } catch (e) {
      return refused('not-yet', `telelean could not make the run's working copy: ${errorText(e)}`);
    }
    const seed = shadow.buildSeed;
    if (seed?.skipped !== undefined) this.log('info', `run ${runId}: the working copy's Lean build starts empty, not from your .lake/build: ${seed.skipped}`);
    else if (seed !== undefined && seed.files > 0) this.log('info', `run ${runId}: the working copy's Lean build starts from your .lake/build (${seed.files} files, the board's last Lean check)`);
    const baseCommit = (await shadow.commits()).at(-1);
    if (baseCommit === undefined) return refused('internal', "telelean could not read the run's working copy");

    const startedAt = this.iso();
    const steps: PersistedStep[] = order.map((target, k) => {
      const inf = byTarget.get(target) ?? { target, premises: [] };
      const question = { sources: [...inf.premises], fromNothing: inf.premises.length === 0 };
      return {
        id: `s${k + 1}`,
        kind: 'formalize',
        target,
        stage: 1,
        scope: { step: `s${k + 1}`, target, question, fuzzyStatements: [], openProof: true, openArrows: !question.fromNothing, openItems: [] },
        state: 'queued',
        queue: 1,
        freezes: [],
        gateAttempts: [],
        counters: { ...ZERO_COUNTERS },
        agentMs: 0,
      };
    });
    const inferences: SessionInference[] = steps.map((st, k) => ({ target: st.target, question: { ...st.scope.question, sources: [...st.scope.question.sources] }, order: k, steps: [st.id] }));
    const p: PersistedRun = {
      format: PERSISTED_RUN_FORMAT,
      version: 2,
      root,
      library,
      view: {
        runId,
        subject,
        target: first.target,
        premises: [...first.premises],
        state: 'starting',
        round: 0,
        startedAt,
        updatedAt: startedAt,
        backend: {
          id: backend.id,
          model: settings.model,
          ...(settings.effort !== undefined ? { effort: settings.effort } : {}),
          ...(cliVersion !== undefined ? { cliVersion } : {}),
        },
        caps: { ...settings.caps },
        counters: { ...ZERO_COUNTERS },
        usage: { ...ZERO_USAGE },
        answered: [],
        notices: [],
        activity: [],
        ghosts: [],
      },
      selection: { subject, target: first.target, premises: [...first.premises], adoptedGhosts: [] },
      backendId: backend.id,
      freezes: [],
      ghosts: [],
      gateAttempts: [],
      clocks: { roundAgentMs: 0, totalAgentMs: 0, startedAt },
      session: {
        format: PERSISTED_SESSION_FORMAT,
        version: 1,
        stage: 0,
        phase: 'step',
        inferences,
        steps,
        queue: steps.map((st) => st.id),
        retry: [],
        items: [],
        nextAction: 1,
        premises: [],
        ledger: [],
        rejectedArrows: [],
        stack: { done: [], undone: [] },
        head: baseCommit.id,
        events: [],
        viewVersion: 1,
      },
    };
    const run = this.makeRun(p, shadow);
    run.live = newRuntime();
    this.run = run;
    this.activity(
      run,
      'system',
      steps.length > 1
        ? `Started "Formalize for dependencies" for ${steps.length} targets.`
        : first.premises.length === 0
          ? `Started "Follows from nothing?" for “${sentenceShort(firstNode.naturalName)}”: a proof from no premises at all.`
          : `Started "Formalize for dependencies" for “${sentenceShort(firstNode.naturalName)}” from ${first.premises.length} premise${first.premises.length === 1 ? '' : 's'}.`,
    );
    await this.save(run, SESSION_CHANGE);

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
    await this.loadBaseModel(run);

    try {
      await this.openSession(run);
    } catch (e) {
      if (!this.live(run)) return refused('conflict', 'The run was stopped while it was starting.');
      const error = errorText(e);
      await this.failRun(run, error);
      return refused('not-yet', `Claude could not be started: ${error}`);
    }

    // The session's first turn: the context bundle (its first line unchanged), the plan, then the first step's turn.
    let prefix: string;
    try {
      const bundle = await this.contextBundle(run);
      const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
      const plan = formalizePlan(inferences.map((i) => ({ id: i.target, sentence: nodes.get(i.target)?.naturalName ?? i.target, sources: i.question.sources, fromNothing: i.question.fromNothing })));
      prefix = `${bundle}\n${plan}\n\n`;
    } catch (e) {
      await this.failRun(run, `telelean could not describe the model to Claude: ${errorText(e)}`);
      return refused('internal', `The run could not start: ${errorText(e)}`);
    }
    const started = await this.startStep(run, steps[0]?.id ?? 's1', prefix);
    if (!started.ok) return started;
    return okOutcome(`Claude is working on “${sentenceShort(firstNode.naturalName)}”`);
  }

  /** §5.2's context bundle for the run's current selection (the first step's at the start). */
  protected async contextBundle(run: ActiveRun): Promise<string> {
    const { workspace } = this.o;
    const sidecars = this.o.services.sidecars;
    const sel = run.p.selection;
    let decisions: Awaited<ReturnType<typeof sidecars.readDecisions>>['decisions'] = [];
    try {
      const file = await sidecars.readDecisions(this.o.root, sel.subject);
      decisions = this.core.decisionsInForce(file, sel.subject, [sel.target, ...sel.premises]);
    } catch (e) {
      this.log('warn', `decisions could not be read: ${errorText(e)}`);
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

  // ---------------------------------------------------------------------------------------------
  // A step (§3.3)

  /**
   * Starts step `id` of the current queue on the head: its mode (A12) and StepScope decided at S₀, the `step-start`
   * commit (reused when its queue-start write made it), both recorded in one run.json write, then its turn (`prefix`
   * first: the session's first turn) on the live Claude session, or a resumed one. Answers whether Claude got the turn
   * (fixer 2d r1, F-V2D-FC-5 / A-F5): when `--resume` fails, the step is interrupted, its turn is kept
   * (`undeliveredTurn`) for Resume to send, and the refusal is the answer, never a success label.
   */
  protected async startStep(run: ActiveRun, id: string, prefix = ''): Promise<ActionOutcome> {
    const ended = refused('conflict', 'This run has ended.');
    const s = this.sessionOf(run);
    const step = stepOf(s, id);
    const shadow = run.shadow;
    const files = await shadow.currentFiles();
    const model = filesModel(files, run.p.library);
    const inQueue = s.steps.filter((x) => x.queue === step.queue);
    const index = inQueue.indexOf(step) + 1;
    const of = inQueue.length;
    const earlier = new Set(inQueue.slice(0, index - 1).map((x) => x.target));
    const question = step.scope.question;
    // A12 (D2-4): a source of the question that is an earlier target of the same queue and has no `.holds` at S₀.
    const statementsOnly = step.kind === 'formalize' ? question.sources.find((src) => earlier.has(src) && !hasHolds(model, src)) : undefined;
    const fuzzy = [...new Set([step.target, ...question.sources].filter((c) => statementEmpty(model, c)))];
    const mark = question.sources.length === 0;
    const scope: StepScope = {
      step: id,
      target: step.target,
      question,
      fuzzyStatements: fuzzy,
      openProof: statementsOnly === undefined && (step.kind === 'formalize' || step.scope.openProof),
      openArrows: statementsOnly === undefined && !mark,
      openItems: step.kind === 'submit' ? [...step.scope.openItems] : [],
      ...(statementsOnly !== undefined ? { statementsOnly } : {}),
    };
    const head = (await shadow.commits()).at(-1);
    if (!this.live(run)) return ended;
    // Its own round: fresh caps, its own selection (the target and its question's sources).
    this.startNewRound(run, 'formalise');
    run.p.lastFinish = undefined;
    run.p.selection = { subject: run.p.selection.subject, target: step.target, premises: [...question.sources], adoptedGhosts: [] };
    step.round = run.view.round;
    step.scope = scope;
    const start =
      step.startCommit !== undefined && head?.id === step.startCommit
        ? step.startCommit
        : (await shadow.commit('step-start', `Step ${index} of ${of} starts: “${step.target}”`, run.view.round)).id;
    step.startCommit = start;
    step.state = 'running';
    s.queue = s.queue.filter((x) => x !== id);
    s.head = start;
    s.phase = 'step';
    run.p.roundStartCommit = start;
    const nodeOf = (card: string) => model.nodes.get(card)?.node;
    const target = nodeOf(step.target);
    // §2.8: the first step of a later queue lists the decisions made since the previous queue; a Submit queue's first
    // step is preceded by the feedback turn instead, which covers them (builder 2e). The queue's seal says which.
    const firstOfLater = index === 1 && (step.queue ?? 1) > 1;
    const seal = [...s.stack.done].reverse().find((a) => a.kind === 'seal');
    const submitted = firstOfLater && seal?.kind === 'seal' && seal.by === 'submit';
    const feedback = submitted ? this.submitFeedback(run, s, inQueue) : undefined;
    const decisions = firstOfLater && !submitted ? this.decisionsSinceLastQueue(s) : undefined;
    const turn =
      prefix +
      (feedback !== undefined ? `${feedback}\n` : '') +
      stepTurn({
        index,
        of,
        kind: step.kind,
        target: { id: step.target, type: target?.type ?? 'PROPOSITION', sentence: target?.naturalName ?? step.target },
        question: { sources: question.sources.map((q) => ({ id: q, sentence: nodeOf(q)?.naturalName ?? q })), fromNothing: question.fromNothing },
        arrows: s.ledger
          .filter((e): e is Extract<LedgerEntry, { kind: 'arrow' }> => e.kind === 'arrow' && e.target === step.target && e.step !== id)
          .map((e) => ({ source: e.source, status: s.items.find((r) => r.key === arrowKey(e.source, e.target))?.status ?? 'proposed' })),
        ...(statementsOnly !== undefined ? { statementsOnly } : {}),
        fuzzyStatements: fuzzy,
        openProof: scope.openProof,
        openArrows: scope.openArrows,
        ...(step.kind === 'submit' ? { openItems: scope.openItems } : {}),
        ...(decisions !== undefined ? { decisions } : {}),
        caps: this.o.settings.caps,
      });
    // With no live Claude session (after Cancel step, a reload, or a process that died), the turn goes to a resumed
    // one: kept in run.json until a session received it, so Resume sends it after a failed `--resume`.
    const resumed = run.session === undefined;
    if (resumed) run.p.undeliveredTurn = turn;
    else delete run.p.undeliveredTurn;
    this.setState(run, 'working');
    await this.save(run, SESSION_CHANGE);
    if (!this.live(run)) return ended;
    if (resumed) return this.continueSession(run, turn, 'turn');
    this.startRound(run, turn);
    return okOutcome('Claude continues');
  }

  /**
   * §2.8, §3.7: the feedback turn before a Submit queue's first step (`Review submitted (stage <n>)`, 2e's review.ts);
   * undefined here (no Submit queue before 2e).
   */
  protected submitFeedback(_run: ActiveRun, _s: PersistedSession, _steps: readonly PersistedStep[]): string | undefined {
    return undefined;
  }

  /**
   * §3.8, §3.11 (2f, D2-71): at recovery, in a stage, the premise writes and completions still due are enqueued, before
   * anything else and completions first (premises.ts); none here.
   */
  protected enqueueDueWrites(_run: ActiveRun): void {}

  /**
   * §2.6, §3.11: a write of a later sub-slice found in flight (2e's `decide` and `submit-take-out`), run again once the
   * stage judgement is computed again. True when it was made again (a judge follows), false when it was not.
   */
  protected async replayWrite(_run: ActiveRun, _write: SessionWrite): Promise<boolean> {
    return false;
  }

  /** The decide and Show results actions on the stack since the previous queue started (`decisionsSince`). */
  protected decisionsSinceLastQueue(s: PersistedSession): string[] {
    return decisionsSince(s);
  }

  protected sessionCheckContext(run: ActiveRun): SessionCheckContext | undefined {
    const s = run.p.session;
    if (s === undefined) return undefined;
    const step = this.activeStep(s);
    if (step === undefined || step.startCommit === undefined) return undefined;
    return {
      inferences: s.inferences,
      ledger: s.ledger,
      items: s.items,
      premises: s.premises,
      ended: endedTargets(s),
      rejectedArrows: s.rejectedArrows,
      scope: step.scope,
      stepStartCommit: step.startCommit,
      ...(run.p.lastFinish?.no_alternative === true ? { noAlternative: true } : {}),
    };
  }

  /** The check context of a stage judge (§2.9's note: the first inference's selection, stage `prove`). */
  protected stageContext(run: ActiveRun): CheckContext {
    const s = this.sessionOf(run);
    const first = s.inferences[0];
    const settings = this.o.settings;
    return {
      shadow: run.shadow,
      selection: { subject: run.p.view.subject, target: first?.target ?? run.p.selection.target, premises: [...(first?.question.sources ?? [])], adoptedGhosts: [] },
      stage: 'prove',
      round: Math.max(0, run.view.round),
      job: { runId: run.runId, memoryMax: settings.memoryMax, minAvailableBytes: settings.minAvailableBytes, leanJobMs: settings.caps.leanJobMs, signal: run.abort.signal },
      teleleanBlocks: [],
      session: { inferences: s.inferences, ledger: s.ledger, items: s.items, premises: s.premises, ended: endedTargets(s), rejectedArrows: s.rejectedArrows },
    };
  }

  protected override onFrozen(run: ActiveRun, record: FreezeRecord): void {
    const s = run.p.session;
    if (s === undefined) return;
    const step = this.activeStep(s);
    if (step !== undefined && step.freezeCommit === undefined) step.freezeCommit = record.commit.id;
  }

  /** A session follows the run's state: an interrupted step, and its Resume. */
  protected override onStateChanged(run: ActiveRun, _from: RunView['state'], to: RunView['state']): void {
    const s = run.p.session;
    if (s === undefined) return;
    const step = this.activeStep(s);
    const before = `${s.phase} ${step?.state ?? ''}`;
    if (to === 'interrupted') {
      if (step !== undefined) step.state = 'interrupted';
      if (s.phase === 'step') s.phase = 'interrupted';
    } else if ((to === 'working' || to === 'waiting-for-answer' || to === 'gate') && step !== undefined) {
      step.state = 'running';
      s.phase = 'step';
    }
    // §2.4: the session changed; the next run.json write posts it (fixer 2d r1, F-V2D-FC-4).
    if (`${s.phase} ${step?.state ?? ''}` !== before) this.runtimeOf(run).stateChanged = true;
  }

  /** §2.8: the step's own proposed arrows go into its target's `premises:` before each gate attempt (the ledger's). */
  protected override async beforeGate(run: ActiveRun): Promise<void> {
    const s = run.p.session;
    if (s === undefined) return;
    const step = this.activeStep(s);
    if (step === undefined) return;
    const entries = s.ledger.filter((e): e is Extract<LedgerEntry, { kind: 'arrow' }> => e.kind === 'arrow' && e.step === step.id);
    if (entries.length === 0) return;
    const shadow = run.shadow;
    for (const entry of entries) {
      const model = filesModel(await shadow.currentFiles(), run.p.library);
      const node = model.nodes.get(entry.target)?.node;
      if (node === undefined || node.premises.includes(entry.source)) continue;
      let changes: FileChange[];
      try {
        changes = planAction(model, { kind: 'add-arrows', target: entry.target, sources: [entry.source] }, { today: this.today(), now: this.iso(), layouts: {} }).changes;
      } catch (e) {
        // The rules then refuse what is not drawn (B.3); the arrow is Claude's to drop or to propose again.
        this.log('warn', `the arrow ${entry.source} → ${entry.target} could not be written: ${errorText(e)}`);
        continue;
      }
      await shadow.writeFiles(changes);
      entry.written = this.iso();
    }
    await this.save(run);
  }

  /** §3.8: propose_assumption in a step: B.1 with E(T), its draft kept outside ws/ with its scratch facts. */
  protected async proposeAssumptionInSession(run: ActiveRun, args: ProposeAssumptionArgs): Promise<Adoption> {
    this.assertCanAct(run);
    const s = this.sessionOf(run);
    const step = this.activeStep(s);
    if (step === undefined) throw new Error('no step of this session is running');
    if (step.scope.statementsOnly !== undefined) {
      return { status: 'rejected', gateChecked: false, message: CLAUDE_SESSION_TEXTS.statementsOnly(step.scope.statementsOnly) };
    }
    if (run.view.stage !== 'prove' || this.currentFreeze(run) === undefined) throw new Error('freeze first; the gap is judged against the frozen statements');
    this.assertCheckBudget(run);
    const leanName = this.draftName(run, s, args);
    const key = premiseDraftKey({ naturalName: args.natural_name, leanStatement: args.lean_statement, target: step.target });
    if (s.items.some((r) => r.kind === 'add-premise' && r.rejectedFingerprints.includes(key))) {
      return { status: 'rejected', gateChecked: false, message: 'The person rejected this premise in this session: do not propose it again.' };
    }
    return this.toolCall(run, async () => {
      const check = await this.o.services.engine
        .checkGhost(this.checkContext(run), { naturalName: args.natural_name, leanStatement: args.lean_statement, proof: args.proof, leanName })
        .catch((e: unknown) => ({ ok: false as const, problems: [errorText(e)], environment: errorText(e) }));
      this.assertLive(run);
      if (!check.ok) {
        if (check.environment === undefined) run.view.counters.checks += 1;
        this.activity(run, 'ghost', `propose_assumption: “${sentenceShort(args.natural_name)}” ${check.environment !== undefined ? 'could not be checked' : 'was rejected'}`, false);
        await this.save(run);
        return {
          status: 'rejected',
          gateChecked: check.environment === undefined,
          message: check.environment !== undefined ? `telelean could not run Lean (${check.environment}); this is not your fault and was not counted.` : check.problems.join('\n'),
        };
      }
      run.view.counters.checks += 1;
      const draft: PremiseDraft = {
        target: step.target,
        step: step.id,
        naturalName: args.natural_name,
        leanName,
        leanStatement: check.statement ?? args.lean_statement.replace(/\s+/g, ' ').trim(),
        explicit: check.explicit ?? '',
        whyNeeded: args.why_needed,
        proof: args.proof,
        footprint: [...check.footprint],
        aloneEntails: check.aloneEntails,
        facts: { ...(check.facts ?? {}) },
      };
      s.premises = [...s.premises.filter((d) => !(d.step === step.id && d.leanName === leanName)), draft];
      this.activity(run, 'ghost', `Claude suggests a premise: “${sentenceShort(draft.naturalName)}” (checked: it closes the gap${draft.aloneEntails ? ' on its own' : ''}).`, true);
      await this.save(run);
      return {
        status: 'recorded',
        gateChecked: true,
        aloneEntails: draft.aloneEntails,
        message: `telelean checked that it closes the gap; the person reviews it as an item after the last step (statement name ${leanName} if they accept it). Do not write it into the files.`,
      };
    });
  }

  /** The draft's Lean name: Claude's when valid and free (no declaration, no other draft of the session), else derived. */
  protected draftName(run: ActiveRun, s: PersistedSession, args: ProposeAssumptionArgs): string {
    return this.ghostName(run, args, s.premises.map((d) => d.leanName));
  }

  /** D2-1: propose_arrow, checked at once (core `proposeArrowProblems`); a ledger `arrow` entry; never a check. */
  protected async toolProposeArrow(run: ActiveRun, args: ProposeArrowArgs): Promise<ArrowProposal> {
    const s = run.p.session;
    if (s === undefined) throw new Error('propose_arrow exists only in an edit session');
    this.assertCanAct(run);
    const step = this.activeStep(s);
    if (step === undefined) throw new Error('no step of this session is running');
    if (step.scope.statementsOnly !== undefined) return { status: 'rejected', message: CLAUDE_SESSION_TEXTS.statementsOnly(step.scope.statementsOnly) };
    const current = filesModel(await run.shadow.currentFiles(), run.p.library, run.lastModel?.facts);
    this.assertLive(run);
    const problems = proposeArrowProblems({ current, scope: step.scope, inferences: s.inferences, ledger: s.ledger, rejectedArrows: s.rejectedArrows, source: args.source, target: args.target });
    if (problems.length > 0) {
      this.activity(run, 'tool', `propose_arrow ${args.source} → ${args.target}: refused`, false);
      await this.save(run);
      return { status: 'rejected', message: problems.map((p) => p.text).join(' ') };
    }
    if (!s.ledger.some((e) => e.kind === 'arrow' && e.source === args.source && e.target === args.target && e.step === step.id)) {
      s.ledger = [...s.ledger, { kind: 'arrow', source: args.source, target: args.target, step: step.id, why: args.why }];
    }
    this.activity(run, 'tool', `propose_arrow ${args.source} → ${args.target}: recorded`, true);
    await this.save(run);
    return {
      status: 'recorded',
      message: `telelean writes ${args.source} into the premises of ${args.target} before the checks; the person reviews the arrow as an item after the last step. You may use ${args.source}'s .holds now.`,
    };
  }

  // ---------------------------------------------------------------------------------------------
  // How a step ends (§3.4)

  /** The gate passed: ws/ back to the gate-pass files, then the step ends `passed`. */
  protected async stepAccepted(run: ActiveRun): Promise<void> {
    const r = run.round;
    const gatePass = r.gatePass;
    if (gatePass === undefined) throw new Error('the passing gate state is missing');
    const after = await run.shadow.changes(gatePass.id);
    if (after.length > 0) {
      await run.shadow.revertTo(gatePass.id, 'Discarded edits made after finish', run.view.round);
      this.notice(run, 'info', 'info', 'Changes made after finish were discarded: the step ends on exactly the files the checks passed.');
    }
    if (r.passing?.check.model !== undefined) run.lastModel = r.passing.check.model;
    await this.endStep(run, 'passed', r.verdict ?? 'not-proved');
  }

  /**
   * §3.4: a step's give-up goes back to `lastCommitSince(S₀, [gate-pass, freeze, step-start])`, never behind S₀; the
   * gave-up notice names the same commit (fixer 2d r1, F-V2D-FC-3).
   */
  protected override async revertTarget(run: ActiveRun): Promise<ShadowCommit | undefined> {
    const s = run.p.session;
    const start = s !== undefined ? this.activeStep(s)?.startCommit : undefined;
    if (start === undefined) return super.revertTarget(run);
    return run.shadow.lastCommitSince(start, ['gate-pass', 'freeze', 'step-start']);
  }

  /** A give-up or no finish twice: back no further than S₀; a cap: the step fails (back to S₀, D2-29). */
  protected async stepReverted(run: ActiveRun, verdict: RunVerdict, reason: string): Promise<void> {
    if (verdict === 'cap-reached') return this.failStep(run, 'failed', reason, verdict);
    const s = this.sessionOf(run);
    const step = this.activeStep(s);
    if (step?.startCommit === undefined) throw new Error('the running step has no start');
    const shadow = run.shadow;
    const target = await this.revertTarget(run);
    if (target !== undefined) {
      await shadow.revertTo(target.id, `Reverted to “${target.label}”`, run.view.round);
      this.notice(run, 'reverted', 'warning', `telelean reverted Claude's working copy to “${target.label}” (${reason}).`);
      if (target.kind === 'step-start') {
        run.view.stage = 'formalise';
        run.view.frozen = undefined;
      }
    }
    // §3.4: the ledger follows the rollback (the step's arrows no longer drawn go).
    const model = filesModel(await shadow.currentFiles(), run.p.library);
    const undrawn = (e: LedgerEntry) => e.kind === 'arrow' && e.step === step.id && !(model.nodes.get(e.target)?.node.premises.includes(e.source) ?? false);
    const ctx = this.checkContext(run);
    try {
      await this.o.services.engine.normalise(ctx);
    } catch (e) {
      this.log('warn', `normalising the reverted state failed: ${errorText(e)}`);
    }
    if (!this.live(run)) return;
    s.ledger = s.ledger.filter((e) => !undrawn(e));
    let check: CheckReport;
    try {
      check = await this.o.services.engine.check(this.checkContext(run));
    } catch (e) {
      check = { outcome: 'environment', environment: errorText(e), g0: [], findings: [], diagnostics: [], durationMs: 0 };
    }
    if (check.model !== undefined) run.lastModel = check.model;
    await this.endStep(run, 'gave-up', verdict);
  }

  /**
   * A step ends (passed, gave up): D2-43's `created` entries for every declaration new since S₀ still in ws/
   * (`statements` when its freeze commit has it, `proof` otherwise, with the step's premise draft that reaches a
   * proof-phase definition), a re-ask's outcome (D2-46), the step's records, the head; then the next step, or the
   * queue's end. One run.json write.
   */
  protected async endStep(run: ActiveRun, outcome: 'passed' | 'gave-up', verdict: RunVerdict): Promise<void> {
    const s = this.sessionOf(run);
    const step = this.activeStep(s);
    if (step?.startCommit === undefined) throw new Error('the running step has no start');
    const shadow = run.shadow;
    const library = run.p.library;
    const endFiles = await shadow.currentFiles();
    const endModel = filesModel(endFiles, library);
    const startFiles = await shadow.filesAt(step.startCommit);
    const startNames = declarationNames(filesModel(startFiles, library));
    // RV-13 (fixer 2d r1, F-V2D-FC-1): a passed step that proposed nothing ended on S₀'s files (before any re-ask
    // take-back) with no arrow and no premise of its own. Decided on content: a passed step always ends on a new
    // `gate-pass` commit, so its end and start commits never match.
    const proposedNothing =
      outcome === 'passed' &&
      sameFiles(endFiles, startFiles) &&
      !s.ledger.some((e) => e.kind === 'arrow' && e.step === step.id) &&
      !s.premises.some((d) => d.step === step.id);
    const freezeNames = step.freezeCommit !== undefined ? declarationNames(filesModel(await shadow.filesAt(step.freezeCommit), library)) : undefined;
    const withFacts = run.lastModel;
    const known = new Set(s.ledger.flatMap((e) => (e.kind === 'created' ? [e.name] : [])));
    const created: LedgerEntry[] = [];
    for (const name of [...declarationNames(endModel)].sort()) {
      if (startNames.has(name) || known.has(name)) continue;
      const phase = freezeNames?.has(name) === true ? 'statements' : 'proof';
      const draft = phase === 'proof' && withFacts !== undefined ? reachingDraft(withFacts, s.premises, step.id, name) : undefined;
      created.push({ kind: 'created', name, step: step.id, phase, ...(draft !== undefined ? { draft } : {}) });
    }
    // D2-46: a re-asked target. With a proof, its question is replaced; without one, its proof material, arrows and
    // drafts go back to S₀ (its statement-phase content stays, as items).
    const reask = s.steps.some((x) => x.target === step.target && x.id !== step.id && ENDED_STATES.has(x.state));
    const proved = outcome === 'passed' && run.p.lastFinish?.status === 'proved' && step.scope.statementsOnly === undefined;
    let ledger = [...s.ledger, ...created];
    let premises = s.premises;
    if (reask && !proved) {
      const taken = await this.takeBackReask(run, step, endModel, created);
      if (taken === undefined) return;
      ledger = ledger.filter((e) => !(e.kind === 'arrow' && e.step === step.id) && !(e.kind === 'created' && e.step === step.id && e.phase === 'proof'));
      premises = premises.filter((d) => d.step !== step.id);
    }
    if (!this.live(run)) return;
    const head = (await shadow.commits()).at(-1);
    if (!this.live(run) || head === undefined) return;
    // The step's records (one run.json write).
    s.ledger = ledger;
    s.premises = premises;
    if (reask && proved) {
      const inf = s.inferences.find((i) => i.target === step.target);
      if (inf !== undefined) inf.question = { sources: [...step.scope.question.sources], fromNothing: step.scope.question.fromNothing };
    }
    this.closeStep(run, step, outcome, verdict);
    if (proposedNothing) step.proposedNothing = true;
    step.endCommit = head.id;
    s.head = head.id;
    const next = s.queue[0];
    if (next === undefined) {
      this.stopClock(run);
      this.setState(run, 'review');
    }
    await this.save(run, SESSION_CHANGE);
    if (!this.live(run)) return;
    if (next !== undefined) await this.startStep(run, next);
    else void this.queueEnded(run);
  }

  /** The step's bookkeeping when it ends (any way): its state, freezes, gate attempts, finish, counters, attempt record. */
  protected closeStep(run: ActiveRun, step: PersistedStep, state: StepState, verdict: RunVerdict): void {
    const round = step.round ?? run.view.round;
    step.state = state;
    step.freezes = run.p.freezes.filter((f) => f.round === round);
    step.gateAttempts = run.p.gateAttempts.filter((g) => g.round === round);
    if (run.p.lastFinish !== undefined) step.lastFinish = structuredClone(run.p.lastFinish);
    step.counters = { ...run.view.counters };
    step.agentMs = run.p.clocks.roundAgentMs;
    // D2-11: the step's attempt record, written to attempts.jsonl only when the session ends.
    const v = run.view;
    const record: AttemptRecord = {
      format: ATTEMPT_FORMAT,
      version: 1,
      id: `${run.runId}.${round}`,
      run: run.runId,
      round,
      date: this.iso(),
      subject: run.p.view.subject,
      target: step.target,
      premises: [...step.scope.question.sources],
      verdict,
      gateAttempts: v.counters.gateAttempts,
      model: v.backend.model,
      usage: { requests: v.usage.requests, inputTokens: v.usage.inputTokens, outputTokens: v.usage.outputTokens, costEstimateUsd: v.usage.costEstimateUsd },
    };
    if (run.p.lastFinish !== undefined) record.summary = run.p.lastFinish.summary.slice(0, 500);
    if (v.backend.effort !== undefined) record.effort = v.backend.effort;
    step.attempt = record;
  }

  /**
   * D2-46 (§3.2, §3.4): a re-ask that ended without a proof takes back to S₀ only its target's `.holds`, its proof
   * material, its arrows and the other parts of T's Result it made (core `planItemRevert`, with S₀ as the base, over the
   * step's Result, arrow and proof-phase `decl:` items), as one `revert` commit. Undefined when the run stopped
   * meanwhile.
   */
  protected async takeBackReask(run: ActiveRun, step: PersistedStep, endModel: ProjectModel, created: readonly LedgerEntry[]): Promise<boolean | undefined> {
    const s = this.sessionOf(run);
    const shadow = run.shadow;
    const start = step.startCommit as string;
    const s0Model = filesModel(await shadow.filesAt(start), run.p.library);
    const stepLedger = [...created, ...s.ledger.filter((e) => e.kind === 'arrow' && e.step === step.id)];
    let changes: FileChange[];
    try {
      const { drafts } = computeItems({ base: s0Model, current: endModel, ledger: stepLedger, premises: [], inferences: s.inferences, ended: [step.target] });
      // Its Result (T.holds and its proof material), its arrows, and every other part of T's Result this step made: a
      // proof-phase definition one of its premise drafts reaches is its own `decl:` item (D2-42), whose `created` entry
      // and draft go below, so it must leave ws/ too (fixer 2d r1, A-F3: otherwise nothing owns it and Apply is lost).
      const take = drafts.filter(
        (d) =>
          d.key === proofKey(step.target) ||
          (d.kind === 'add-arrow' && stepLedger.some((e) => e.kind === 'arrow' && arrowKey(e.source, e.target) === d.key)) ||
          (d.partOfResult === step.target && d.origin.step === step.id),
      );
      changes = take.length > 0 ? planItemRevert({ base: s0Model, current: endModel, drafts: take, ledger: stepLedger }) : [];
    } catch (e) {
      // Fail closed: the whole step goes back to S₀ (the statements it wrote go too, as if it had been cancelled).
      this.log('warn', `the re-ask's proof could not be taken back alone, so the whole step was: ${errorText(e)}`);
      if (!this.live(run)) return undefined;
      await shadow.revertTo(start, 'The new question was not proved: the step back to its start', run.view.round);
      return true;
    }
    if (!this.live(run)) return undefined;
    if (changes.length > 0) {
      await shadow.writeFiles(changes);
      await shadow.commit('revert', 'The new question was not proved: its proof back to the step\'s start', run.view.round);
    }
    return true;
  }

  /**
   * A step is cancelled (Cancel step) or fails (a cap, an environment or backend failure, telelean's error): ws/ back
   * to S₀ (D2-29), its ledger entries and premise drafts dropped (AF10), the rest of its queue `not-run`, all of them
   * in `retry`, the heading; then the queue ends and the stage opens.
   */
  protected async failStep(run: ActiveRun, state: 'cancelled' | 'failed', reason: string, verdict: RunVerdict = state): Promise<void> {
    const s = this.sessionOf(run);
    const step = this.activeStep(s) ?? (s.queue[0] !== undefined ? stepOf(s, s.queue[0]) : undefined);
    if (step === undefined) return;
    const shadow = run.shadow;
    if (step.startCommit !== undefined) {
      try {
        await shadow.revertTo(step.startCommit, state === 'cancelled' ? 'Step cancelled: back to its start' : 'Step failed: back to its start', run.view.round);
      } catch (e) {
        this.log('error', `the step could not be taken back: ${errorText(e)}`);
      }
    }
    const head = (await shadow.commits()).at(-1);
    s.ledger = s.ledger.filter((e) => !((e.kind === 'arrow' || e.kind === 'created') && e.step === step.id));
    s.premises = s.premises.filter((d) => d.step !== step.id);
    // A step that never ran (a queue found between two steps, or right after its queue-start, after a reload) gets its
    // state only: the run's round, finish, counters and attempt are the previous step's (fixer 2d r1, F-V2D-FC-2), and
    // it has no attempt record (D2-11 records the steps that ran).
    if (step.state === 'queued') step.state = state;
    else this.closeStep(run, step, state, verdict);
    delete run.p.undeliveredTurn;
    const rest = s.queue.filter((id) => id !== step.id);
    for (const id of rest) stepOf(s, id).state = 'not-run';
    s.retry = [step.id, ...rest];
    s.queue = [];
    if (head !== undefined) s.head = head.id;
    if (step.startCommit !== undefined && head !== undefined) step.endCommit = head.id;
    const firstStep = !s.steps.some((x) => ENDED_STATES.has(x.state));
    s.heading = {
      kind: state,
      text: state === 'cancelled' ? REVIEW_TEXTS.stepCancelled : REVIEW_TEXTS.stepFailed(reason),
      firstStep,
      retry: { ok: true },
    };
    run.view.pendingQuestions = undefined;
    run.p.pendingAsk = undefined;
    this.stopClock(run);
    this.setState(run, 'review');
    await this.save(run, SESSION_CHANGE);
    void this.queueEnded(run);
  }

  // ---------------------------------------------------------------------------------------------
  // Cancel step, Retry step, Resume (§3.4, §3.11)

  /**
   * In a session, Cancel is Cancel step (§2.5): the running or interrupted step ends as cancelled (back to S₀), the
   * rest of its queue is `not-run`, both go to `retry`, and the stage opens. A queue waiting between two steps (after a
   * reload) cancels its next step the same way. It never ends the session.
   */
  protected async cancelStep(run: ActiveRun): Promise<ActionOutcome> {
    const s = this.sessionOf(run);
    if (this.activeStep(s) === undefined && !(this.stepRunning(s) && s.queue.length > 0)) return refused('conflict', 'No step of this session is running.');
    // Stop the round at once: nothing it returns changes the session any more.
    run.stopping = true;
    this.stopClock(run);
    run.abort.abort();
    if (run.ask !== undefined) {
      const ask = run.ask;
      run.ask = undefined;
      ask.reject(new Error('the step was cancelled'));
    }
    try {
      await run.session?.interrupt();
    } catch {
      // the process may be gone already
    }
    try {
      await (this.o.services.cancelLean ?? leanCancelRun)(run.runId);
    } catch (e) {
      this.log('warn', `the step's Lean jobs could not be cancelled: ${errorText(e)}`);
    }
    await this.closeSession(run, true);
    const loop = run.roundLoop;
    if (loop !== undefined) await Promise.race([loop.catch(() => undefined), new Promise((r) => setTimeout(r, STOP_WAIT_MS).unref?.())]);
    for (let k = 0; k < 100 && run.activeToolCalls > 0; k++) await new Promise((r) => setTimeout(r, 50));
    if (this.disposed || run !== this.run || run.ended) return refused('conflict', 'This run has ended.');
    run.stopping = false;
    run.abort = new AbortController();
    this.notice(run, 'info', 'info', 'You cancelled the step. Its changes were taken back; Retry step runs it again.');
    await this.failStep(run, 'cancelled', 'cancelled');
    return okOutcome('Step cancelled');
  }

  /** ES-4: Retry step (§3.4): the cancelled or failed step and the steps its queue dropped run again, as a new queue. */
  protected async retryNow(run: ActiveRun): Promise<ActionOutcome> {
    const s = this.sessionOf(run);
    if (this.stepRunning(s)) return refused('refused', REVIEW_TEXTS.stepRunning);
    if (s.phase !== 'stage') return refused('conflict', s.phase === 'applying' ? REVIEW_TEXTS.applyingNow : REVIEW_TEXTS.formalizeConfirming);
    if (s.retry.length === 0) return refused('conflict', REVIEW_TEXTS.nothingToRetry);
    await this.idle(run);
    const now = this.sessionOf(run);
    if (this.stepRunning(now) || now.phase !== 'stage' || now.retry.length === 0) return refused('conflict', REVIEW_TEXTS.historyChanged);
    let n = now.steps.length;
    const steps: PersistedStep[] = now.retry.map((id) => {
      const old = stepOf(now, id);
      const nid = `s${++n}`;
      return {
        id: nid,
        kind: old.kind,
        target: old.target,
        stage: now.stage,
        scope: { ...old.scope, step: nid },
        retryOf: old.id,
        state: 'queued',
        freezes: [],
        gateAttempts: [],
        counters: { ...ZERO_COUNTERS },
        agentMs: 0,
      };
    });
    return this.startQueue(run, 'retry', steps, []);
  }

  /**
   * One `queue-start` write (§2.6, AF3): the seal, the new inferences and steps (queued, the next queue number), `retry`
   * dropped, and the first step's `step-start` commit, after every write queued before it; then the first step runs.
   */
  protected async startQueue(run: ActiveRun, by: SealBy, steps: PersistedStep[], inferences: Array<{ target: string; premises: string[] }>): Promise<ActionOutcome> {
    const first = steps[0];
    if (first === undefined) return refused('conflict', REVIEW_TEXTS.nothingToRetry);
    const write: SessionWrite = { kind: 'queue-start', by, steps: steps.map((x) => x.id), ...(inferences.length > 0 ? { inferences } : {}) };
    const done = await this.asLastWrite(run, async () => {
      const s = this.sessionOf(run);
      // The checks were made on the session as it was before the queue (builder 2e): still a stage with no step.
      if (this.stepRunning(s) || s.phase !== 'stage') return refused('conflict', REVIEW_TEXTS.historyChanged);
      // Step 1: the write in flight.
      s.inFlight = { action: write, parent: s.head };
      try {
        await this.persistChecked(run, { run: false, proposal: false, session: false });
      } catch (e) {
        delete s.inFlight;
        return refused('internal', REVIEW_TEXTS.saveFailed(errorText(e)));
      }
      return this.finishQueueStart(run, write, steps);
    });
    if (!done.ok) return done;
    // AF14: it resolves once its first step works; a step Claude did not get (a failed `--resume`) answers why.
    const started = await this.startStep(run, first.id);
    if (!started.ok) return started;
    return okOutcome(`Claude is working on “${await this.cardShort(run, first.target)}”`);
  }

  /** A card's sentence, shortened as the start's label has it (its id when the working copy does not have the card). */
  protected async cardShort(run: ActiveRun, id: string): Promise<string> {
    try {
      const name = filesModel(await run.shadow.currentFiles(), run.p.library).nodes.get(id)?.node.naturalName;
      return name !== undefined ? sentenceShort(name) : id;
    } catch {
      return id;
    }
  }

  /** Steps 3 and 4 of a `queue-start` write (also its replay after a crash): the first step's S₀ and the records. */
  protected async finishQueueStart(run: ActiveRun, write: Extract<SessionWrite, { kind: 'queue-start' }>, steps: PersistedStep[]): Promise<ActionOutcome> {
    const s = this.sessionOf(run);
    const q = currentQueue(s) + 1;
    const commit = await run.shadow.commit('step-start', `Queue ${q} starts: “${steps[0]?.target ?? ''}”`, Math.max(0, run.view.round));
    const next: PersistedSession = structuredClone(s);
    // 2j2 (D2-92, D2-96): Submit review's comment stays with its seal, with the stage it submitted.
    const comment = write.by === 'submit' && write.comment !== undefined && write.comment.trim() !== '' ? { comment: { text: write.comment, stage: next.stage } } : {};
    next.stack = { done: [...next.stack.done, { id: next.nextAction, kind: 'seal', by: write.by, at: this.iso(), ...comment }], undone: [] };
    next.nextAction += 1;
    for (const inf of write.inferences ?? []) {
      const question = { sources: [...inf.premises], fromNothing: inf.premises.length === 0 };
      const known = next.inferences.find((i) => i.target === inf.target);
      if (known === undefined) next.inferences.push({ target: inf.target, question, order: next.inferences.length, steps: [] });
      // §3.2 (fixer 2d r1, A-F1): a target whose step never ended (cancelled, failed, not run) has no Result, and is
      // asked as new: its question is the request's. A re-ask (a step of it ended) keeps its question until a step
      // proves it (D2-46, endStep).
      else if (!next.steps.some((x) => x.target === inf.target && ENDED_STATES.has(x.state))) known.question = question;
    }
    for (const [k, st] of steps.entries()) {
      const step: PersistedStep = { ...st, queue: q, stage: next.stage, ...(k === 0 ? { startCommit: commit.id } : {}) };
      next.steps.push(step);
      next.inferences.find((i) => i.target === step.target)?.steps.push(step.id);
    }
    next.queue = steps.map((x) => x.id);
    next.retry = [];
    next.phase = 'step';
    delete next.heading;
    delete next.decidedHeading;
    next.head = commit.id;
    delete next.inFlight;
    next.viewVersion += 1;
    run.p.session = next;
    await this.persistStep4(run);
    return okOutcome('queued');
  }

  /**
   * Resume (§3.11) of a queue that waits between two steps (a reload after a step ended, or right after a queue-start
   * write): its next step starts. An interrupted step resumes as M2's run does (`--resume`, the resume turn).
   */
  protected async resumeBetweenSteps(run: ActiveRun): Promise<ActionOutcome> {
    const s = this.sessionOf(run);
    if (run.view.state !== 'interrupted') return refused('conflict', 'Only an interrupted run can be resumed.');
    const next = s.queue[0];
    if (next === undefined) return refused('conflict', 'No step of this session waits.');
    run.view.canResume = undefined;
    this.notice(run, 'resumed', 'info', 'Claude resumed the session.');
    const started = await this.startStep(run, next);
    return started.ok ? okOutcome('Claude continues') : started;
  }

  // ---------------------------------------------------------------------------------------------
  // Formalize during a stage (RV-9, §3.2)

  /** The FormalizeSession of the start check (§4.12), from the records and the view (the results shown, D2-65). */
  protected formalizeSessionOf(run: ActiveRun, view: SessionView | null): FormalizeSession {
    const s = this.sessionOf(run);
    const shaky = (r: PersistedSession['items'][number]) => r.status === 'declined' && r.decline?.option === 'shaky';
    const results: Record<string, PersistedSession['items'][number]['status']> = {};
    const shakyResults: string[] = [];
    for (const inf of s.inferences) {
      const r = s.items.find((x) => x.key === proofKey(inf.target));
      if (r === undefined) continue;
      results[inf.target] = r.status;
      if (shaky(r)) shakyResults.push(inf.target);
    }
    return {
      subject: run.p.view.subject,
      resultsShown: view?.results.shown === true,
      targets: s.inferences.map((i) => i.target),
      arrows: s.items.flatMap((r) => {
        if (r.kind !== 'add-arrow' || r.status === 'declined' || r.status === 'withdrawn') return [];
        const arrow = r.content.arrow;
        return arrow !== undefined ? [{ item: r.id, source: arrow.source, target: arrow.target, status: r.status }] : [];
      }),
      shakyTargets: [...new Set(s.items.filter(shaky).map((r) => r.origin.target))],
      results,
      shakyResults,
    };
  }

  /** RV-9: a mid-stage Formalize, checked on the session's own records (the host's check only answered early). */
  protected async formalizeInStage(run: ActiveRun, request: FormalizeRequest): Promise<ActionOutcome> {
    const s = this.sessionOf(run);
    if (this.stepRunning(s)) return refused('refused', REVIEW_TEXTS.stepRunning);
    if (s.phase !== 'stage') return refused('conflict', s.phase === 'applying' ? REVIEW_TEXTS.applyingNow : REVIEW_TEXTS.formalizeConfirming);
    if (request.stage !== s.stage) return refused('conflict', REVIEW_TEXTS.historyChanged);
    // §2.6: it waits until no judge runs and the write queue is empty, then is its last write.
    await this.idle(run);
    const now = this.sessionOf(run);
    if (this.stepRunning(now) || now.phase !== 'stage' || request.stage !== now.stage) return refused('conflict', REVIEW_TEXTS.historyChanged);
    const rt = this.runtimeOf(run);
    // A-F4: with no view, whether the results are shown (D2-65) is not known: refused (fail closed).
    if (rt.viewError !== undefined) return refused('conflict', SESSION_VIEW_FAILED);
    const view = rt.view;
    const judged = rt.judgedModel;
    if (judged === undefined) return refused('conflict', REVIEW_TEXTS.judging);
    const graph = subjectGraph(judged.model, run.p.view.subject, { version: 0, semantic: { state: 'fresh' } });
    const asked = request.inferences.map((i) => ({ target: i.target, premises: [...new Set(i.premises)] }));
    const problems = formalizeStartProblems(graph, asked, this.formalizeSessionOf(run, view));
    if (problems.length > 0) return refused('invalid', problems[0]?.text ?? 'Formalize was refused.');
    const order = formalizeOrder(graph, asked);
    const byTarget = new Map(asked.map((i) => [i.target, i]));
    let n = now.steps.length;
    const steps: PersistedStep[] = order.map((target) => {
      const premises = byTarget.get(target)?.premises ?? [];
      const id = `s${++n}`;
      const question = { sources: [...premises], fromNothing: premises.length === 0 };
      return {
        id,
        kind: 'formalize',
        target,
        stage: now.stage,
        scope: { step: id, target, question, fuzzyStatements: [], openProof: true, openArrows: !question.fromNothing, openItems: [] },
        state: 'queued',
        freezes: [],
        gateAttempts: [],
        counters: { ...ZERO_COUNTERS },
        agentMs: 0,
      };
    });
    return this.startQueue(run, 'formalize', steps, order.map((target) => ({ target, premises: [...(byTarget.get(target)?.premises ?? [])] })));
  }

  /** Waits until no judge runs or is queued and the session's write queue is empty (§2.6). */
  protected async idle(run: ActiveRun): Promise<void> {
    const rt = this.runtimeOf(run);
    for (let k = 0; k < 10_000 && this.isJudging(run); k++) {
      await rt.judges;
      await rt.writes;
      if (this.isJudging(run)) await new Promise((r) => setTimeout(r, 10));
    }
  }

  // ---------------------------------------------------------------------------------------------
  // The write queue (§2.6)

  /**
   * §2.6, AF3 (builder 2e): `job` as the write queue's last write: once no judge runs or is due and the queue is empty,
   * checked again inside the queue (a judge due or a write queued by then makes it wait again). So a queue of Claude
   * steps starts only on a judged head, with no session write left behind it (D2-62).
   */
  protected async asLastWrite(run: ActiveRun, job: () => Promise<ActionOutcome>): Promise<ActionOutcome> {
    const rt = this.runtimeOf(run);
    for (let k = 0; k < 1000; k++) {
      await this.idle(run);
      let busy = false;
      const out = await this.enqueueWrite(run, async () => {
        if (rt.judging || rt.queuedJudges > 0 || rt.pendingWrites > 1) {
          busy = true;
          return refused('conflict', REVIEW_TEXTS.judging);
        }
        return job();
      });
      if (!busy) return out;
    }
    return refused('conflict', REVIEW_TEXTS.judging);
  }

  protected enqueueWrite<T>(run: ActiveRun, job: () => Promise<T>): Promise<T> {
    const rt = this.runtimeOf(run);
    rt.pendingWrites += 1;
    const result = rt.writes.then(job);
    rt.writes = result.then(
      () => undefined,
      () => undefined,
    );
    return result.finally(() => {
      rt.pendingWrites -= 1;
    });
  }

  // ---------------------------------------------------------------------------------------------
  // The judge and reconcile (§3.5)

  /** The queue ended (its last step ended, or a Cancel step or a failure dropped the rest): judge the head, open the stage. */
  protected async queueEnded(run: ActiveRun): Promise<void> {
    const s = this.sessionOf(run);
    const q = currentQueue(s);
    await this.judgeHead(run, { queueSteps: s.steps.filter((x) => (x.queue ?? 1) === q).map((x) => x.id), endsQueue: true });
  }

  /**
   * One judge at a time (coalesced): `engine.judge` on the head, then its outcome as one `judge-apply` write, run
   * again when the head moved meanwhile or when its reverts changed ws/ (until it converges).
   */
  protected judgeHead(run: ActiveRun, options: JudgeOptions = {}): Promise<void> {
    const rt = this.runtimeOf(run);
    // A-F6: a judge queued behind another counts as judging until it starts (then `judging` covers it), so nothing
    // that waits for the session to be idle starts between the two.
    rt.queuedJudges += 1;
    const job = rt.judges.then(() => {
      rt.queuedJudges -= 1;
      return this.judgeLoop(run, options);
    });
    rt.judges = job.catch(() => undefined);
    return job;
  }

  protected async judgeLoop(run: ActiveRun, options: JudgeOptions): Promise<void> {
    const rt = this.runtimeOf(run);
    rt.judging = true;
    await this.save(run, SESSION_CHANGE);
    let queueSteps = options.queueSteps;
    // D2-62 (builder 2e): only a queue's end judges while the phase is `step`; any other judge found then (one a
    // decision made before the queue started) stops, since the queue's end judges the head and reconciles it all.
    const outrun = () => options.endsQueue !== true && this.stepRunning(this.sessionOf(run));
    try {
      for (let round = 0; round < MAX_JUDGE_ROUNDS; round++) {
        if (this.disposed || run !== this.run || run.ended || outrun()) return;
        let judged: { judgement: StateJudgement; report: CheckReport };
        try {
          judged = await this.o.services.engine.judge(this.stageContext(run));
        } catch (e) {
          // A shadow whose history cannot be read: the stage opens without a judgement (nothing can be accepted).
          this.log('error', `the judge failed: ${errorText(e)}`);
          this.notice(run, 'environment', 'error', `telelean could not check the working copy (${errorText(e)}).`);
          if (options.endsQueue === true) await this.openStageWithoutJudgement(run);
          else await this.dropJudgement(run);
          return;
        }
        if (this.disposed || run !== this.run || run.ended) return;
        let outcome: 'dropped' | 'applied' | 'reverted';
        try {
          outcome = await this.enqueueWrite(run, () => this.judgeApply(run, judged.judgement, judged.report, { ...options, ...(queueSteps !== undefined ? { queueSteps } : { queueSteps: undefined }) }));
        } catch (e) {
          // §2.6: a write that could not be made stops here; after a reload, recover() finishes what it recorded.
          this.log('error', `the judge's outcome could not be written: ${errorText(e)}`);
          if (!this.disposed && run === this.run) this.notice(run, 'environment', 'error', REVIEW_TEXTS.saveFailed(errorText(e)));
          if (options.endsQueue !== true) await this.dropJudgement(run);
          return;
        }
        if (outcome === 'dropped') continue;
        queueSteps = undefined;
        if (outcome === 'reverted') {
          rt.converging = true;
          continue;
        }
        await this.renderNew(run);
        return;
      }
      this.log('warn', 'the judge did not converge');
    } finally {
      rt.judging = false;
      rt.converging = false;
      if (!this.disposed && run === this.run && run.p.session !== undefined) await this.save(run, SESSION_CHANGE);
    }
  }

  /**
   * A judge a decision started (not a queue's end) that could not run or whose outcome could not be written (fixer 2e r1,
   * A-F1): the head it was to judge is past the stage judgement, which describes an older state and must not stand in for
   * it (§3.1: the head of ws/ is a state telelean judged, or `judging` is true). As a queue's end whose judge could not
   * run (A-F4), the judgement is cleared in memory and on disk (`judged`): every review action answers NO_JUDGEMENT, and
   * a reload runs the judge again. Inside the write queue, on the records as they are then.
   */
  protected async dropJudgement(run: ActiveRun): Promise<void> {
    if (this.disposed || run !== this.run || run.ended) return;
    await this.enqueueWrite(run, async () => {
      const s = this.sessionOf(run);
      const rt = this.runtimeOf(run);
      if (s.phase !== 'stage' || rt.judgement === null || rt.judgement.commit === s.head) return;
      rt.judgement = null;
      rt.judgedModel = undefined;
      delete s.judged;
      s.viewVersion += 1;
      await this.save(run, SESSION_CHANGE);
    });
  }

  /**
   * The stage opens after a judge that could not run (§3.5's fail-closed path): no judgement, nothing acceptable. The
   * previous stage's judgement does not stand in for it (fixer 2d r1, A-F4): it is cleared in memory and on disk
   * (`judged`), so the view has none and a reload runs the judge.
   */
  protected async openStageWithoutJudgement(run: ActiveRun): Promise<void> {
    const s = this.sessionOf(run);
    if (s.phase === 'stage') return;
    const rt = this.runtimeOf(run);
    rt.judgement = null;
    rt.judgedModel = undefined;
    delete s.judged;
    s.viewVersion += 1;
    this.openStage(run, s, false);
    await this.save(run, SESSION_CHANGE);
  }

  /**
   * §3.5 step 4: the phase becomes `stage`; the stage rises after the start's queue and a Submit's. A Submit queue in
   * which a step was cancelled or failed returns to the stage it submitted (ES-4: "returns you to the previous stage",
   * with Retry step, which keeps the stage too; builder 2e).
   */
  protected openStage(run: ActiveRun, s: PersistedSession, judgedOk: boolean): void {
    const q = currentQueue(s);
    const seal = [...s.stack.done].reverse().find((a) => a.kind === 'seal');
    const from: SealBy | 'start' = q <= 1 || seal === undefined || seal.kind !== 'seal' ? 'start' : seal.by;
    const failed = s.steps.find((x) => (x.queue ?? 1) === q && (x.state === 'cancelled' || x.state === 'failed'));
    if (from === 'start' || (from === 'submit' && failed === undefined)) s.stage += 1;
    for (const step of s.steps) if ((step.queue ?? 1) === q) step.stage = s.stage;
    delete s.decidedHeading;
    s.phase = 'stage';
    if (failed === undefined) delete s.heading;
    else if (!judgedOk && s.heading !== undefined && s.heading !== null) {
      // ES-4: S₀ itself did not pass its judgement.
      const reason = failed.state === 'cancelled' ? 'the step was cancelled and the state it started from does not pass' : s.heading.text.replace(/^Step failed: /, '');
      s.heading = { ...s.heading, kind: 'did-not-pass', text: REVIEW_TEXTS.didNotPass(reason) };
    }
    if (run.view.state !== 'review' && !this.stepRunning(s)) this.setState(run, 'review');
  }

  /**
   * The `judge-apply` write (§2.6, F8): dropped when the head is no longer the judged commit; otherwise reconcile on
   * the records as they are now, its reverts as the write's ws/ part (a `decision` commit), and in step 4 the records,
   * `judged` and `judged-facts.json`; at a converged queue end the stage opens.
   */
  protected async judgeApply(run: ActiveRun, judgement: StateJudgement, report: CheckReport, options: JudgeOptions): Promise<'dropped' | 'applied' | 'reverted'> {
    const s = this.sessionOf(run);
    if (s.head !== judgement.commit) return 'dropped';
    // D2-62 (builder 2e): never reconciled while a step runs, but at its queue's end (the loop then stops).
    if (options.endsQueue !== true && this.stepRunning(s)) return 'dropped';
    const at = this.iso();
    const recon = reconcile({ runId: run.runId, records: toSessionRecords(s), judgement, ...(options.queueSteps !== undefined ? { queueSteps: options.queueSteps } : {}), at });
    let next = withRecords(structuredClone(s), recon.records);
    // §3.6, ES-4 (builder 2e): a judge a decision started that converged (no revert left) on a state that does not pass:
    // B plus the accepted items fail, so the stage is headed "did not pass" (no Accept), keeping a cancelled or failed
    // queue's Retry. As ES-4's heading, it stands until a later step passes (openStage).
    // A later decision's judge that passes lifts it again (fixer 2e r1, A-F2, F-FC-1): `decidedHeading` remembers that
    // the heading is a decision's, and the heading it replaced (a cancelled or failed Submit step's, with its Retry).
    if (options.decided === true && next.phase === 'stage' && recon.reverts.length === 0) {
      if (!judgement.ok && next.heading?.kind !== 'did-not-pass') {
        next.decidedHeading = { under: next.heading ?? null };
        next.heading = { kind: 'did-not-pass', text: DECISIONS_DID_NOT_PASS, firstStep: next.heading?.firstStep ?? false, retry: next.heading?.retry ?? { ok: true } };
      } else if (judgement.ok && next.decidedHeading !== undefined) {
        const under = next.decidedHeading.under;
        if (under !== null) next.heading = under;
        else delete next.heading;
        delete next.decidedHeading;
      }
    }
    // §3.11: a written Add premise's record holds its card (a converted run's adopted ghosts: written items in review).
    cardsFromLedger(next);
    // §3.8: a draft with no explicit form takes the one its re-check rendered (a converted run's pending ghosts).
    explicitFromChecks(next, report.premiseExplicit);
    // The ws/ part: what the judge takes out (§3.6), and the written premises it returned to review (§3.8).
    let changes: FileChange[] = [];
    if (recon.reverts.length > 0) {
      const byId = new Map(next.items.map((r) => [r.id, r]));
      const keys = new Set(recon.reverts.flatMap((id) => (byId.get(id) !== undefined ? [byId.get(id)?.key as string] : [])));
      const drafts = judgement.drafts.filter((d) => keys.has(d.key));
      const base = await this.loadBaseModel(run);
      const current = report.model ?? filesModel(await run.shadow.filesAt(judgement.commit), run.p.library, report.facts);
      changes = drafts.length > 0 ? planItemRevert({ base, current, drafts, ledger: next.ledger }) : [];
      // A written premise taken out: its ledger entries go, its record holds its draft key again (§3.8).
      for (const id of recon.reverts) {
        const r = byId.get(id);
        if (r?.kind !== 'add-premise' || r.card === undefined) continue;
        next.ledger = next.ledger.filter((e) => !((e.kind === 'premise' || e.kind === 'mark-removed' || e.kind === 'completion') && e.item === r.key));
        delete r.card;
        if (r.content.premise !== undefined) r.fingerprint = premiseDraftKey(r.content.premise);
      }
    }
    const rt = this.runtimeOf(run);
    const model = report.model;
    // §3.11: a judge-apply that changes nothing (the same judged state, the same records, no event) writes nothing.
    const problems = [...judgement.problems.map((p) => p.text), ...recon.problems];
    const unchanged =
      changes.length === 0 &&
      recon.events.length === 0 &&
      options.endsQueue !== true &&
      s.judged?.commit === judgement.commit &&
      s.judged.filesKey === judgement.filesKey &&
      s.judged.ok === judgement.ok &&
      JSON.stringify(s.judged.problems) === JSON.stringify(problems) &&
      JSON.stringify(withRecords(structuredClone(s), toSessionRecords(s))) === JSON.stringify(next);
    if (unchanged) {
      const files = await run.shadow.filesAt(judgement.commit);
      rt.judgement = judgement;
      rt.judgedModel = { commit: judgement.commit, model: model ?? filesModel(files, run.p.library, report.facts), ...(lakefileOf(files) !== undefined ? { lakefile: lakefileOf(files) } : {}) };
      return 'applied';
    }
    const lastId = s.events.at(-1)?.id ?? 0;
    next.events = [...next.events, ...recon.events.map((e, k) => ({ id: lastId + k + 1, at, text: e.text, items: [...e.items] }))].slice(-50);
    next.judged = { commit: judgement.commit, filesKey: judgement.filesKey, ok: judgement.ok, problems, at };
    // F-V2D-FC-6, A-F8: the queue-end rules ran (in this write's step 4); recovery never runs them again for this queue.
    if (options.queueSteps !== undefined) next.queueEndReconciled = currentQueue(next);
    if (changes.length === 0) {
      if (options.endsQueue === true) this.openStage(run, next, judgement.ok);
      await this.writeJudgedFacts(run, judgement.commit, judgement.filesKey, report.facts);
      const files = await run.shadow.filesAt(judgement.commit);
      rt.judgement = judgement;
      rt.judgedModel = { commit: judgement.commit, model: model ?? filesModel(files, run.p.library, report.facts), ...(lakefileOf(files) !== undefined ? { lakefile: lakefileOf(files) } : {}) };
      // F17 (builder 2e): no revert left, so the judgement converged: the view this write publishes has its board, and
      // its version rises when anything the person sees changed since the last published view.
      rt.converging = false;
      next.viewVersion = this.visibleViewVersion(run, next);
      run.p.session = next;
      await this.persistStep4(run);
      return 'applied';
    }
    // Four writes (§2.6): inFlight, the files, the `decision` commit, the records.
    s.inFlight = { action: { kind: 'judge-apply', judged: judgement.commit, ...(options.queueSteps !== undefined ? { queueSteps: options.queueSteps } : {}) }, parent: s.head };
    try {
      await this.persistChecked(run, { run: false, proposal: false, session: false });
    } catch (e) {
      delete s.inFlight;
      this.log('error', `the judge's outcome could not be saved: ${errorText(e)}`);
      return 'dropped';
    }
    await run.shadow.writeFiles(changes);
    const commit: ShadowCommit = await run.shadow.commit('decision', 'telelean took out what no longer passes', Math.max(0, run.view.round));
    next.head = commit.id;
    delete next.inFlight;
    await this.writeJudgedFacts(run, judgement.commit, judgement.filesKey, report.facts);
    const files = await run.shadow.filesAt(judgement.commit);
    rt.judgement = judgement;
    rt.judgedModel = { commit: judgement.commit, model: model ?? filesModel(files, run.p.library, report.facts), ...(lakefileOf(files) !== undefined ? { lakefile: lakefileOf(files) } : {}) };
    // F17 (builder 2e): a round whose reverts make the judge run again is recorded but not published: the view stays the
    // one last published, and only the converged judgement's write publishes (and raises the version once if anything
    // the user can see changed), so how many rounds a judge took, which hidden content can decide, never shows.
    run.p.session = next;
    await this.persistStep4(run, { run: false, proposal: false, session: false });
    return 'reverted';
  }

  /** §3.12: Lean's renderings of the statement items whose content key is new, cached in `renderings.json`. */
  protected async renderNew(run: ActiveRun): Promise<void> {
    const s = this.sessionOf(run);
    const rt = this.runtimeOf(run);
    const judged = rt.judgedModel;
    if (judged === undefined || rt.judgement === null || judged.model.facts === undefined) return;
    const wanted = new Map<string, string>();
    for (const r of s.items) {
      if ((r.kind !== 'formalize' && r.kind !== 'change' && r.kind !== 'add') || Object.hasOwn(rt.renderings, r.fingerprint)) continue;
      const card = r.key.startsWith('card:') ? r.key.slice('card:'.length) : undefined;
      const name = card !== undefined ? judged.model.nodes.get(card)?.node.lean.statement : undefined;
      if (name !== undefined) wanted.set(name, r.fingerprint);
    }
    if (wanted.size === 0) return;
    try {
      const rendered = await this.o.services.engine.renderStatements({ shadow: run.shadow, job: this.stageContext(run).job }, [...wanted.keys()]);
      for (const r of rendered) {
        const key = wanted.get(r.name);
        if (key !== undefined && r.error === undefined) rt.renderings[key] = { pretty: r.pretty, explicit: r.explicit };
      }
      await writeTextAtomic(path.join(run.shadow.paths.runDir, RENDERINGS_FILE), `${JSON.stringify({ format: 'telelean-renderings', version: 1, renderings: rt.renderings })}\n`);
    } catch (e) {
      this.log('warn', `statements could not be rendered: ${errorText(e)}`);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Recovery (§3.11)

  /**
   * run.json v2 after a reload: outside a running step, the write in flight is finished (ws/ back to `head`, the write
   * again); the stage judgement is computed again (D2-72); a step that was working is interrupted; a queue found
   * between two steps waits for Resume or Cancel step; a judge that was due runs again.
   */
  protected async recoverSession(run: ActiveRun): Promise<void> {
    const p = run.p;
    const s = this.sessionOf(run);
    // As M2's recovery: a reload before Claude had started (during the base check, or after Claude's process started but
    // before the first step's turn; a window closed then saved it interrupted) ends the session failed. No step ran,
    // nothing of the model was sent and ws/ is B; a Resume could not start the first step, whose turn carries the
    // context bundle and the plan. (No other session has every step queued: a later queue follows an ended step.)
    if ((p.view.state === 'starting' || p.view.state === 'interrupted') && s.steps.every((x) => x.state === 'queued')) {
      await this.endRun(run, 'failed', { verdict: 'failed', error: 'the editor reloaded before Claude had started' });
      return;
    }
    this.runtimeOf(run);
    await this.loadBaseModel(run);
    await this.loadRenderings(run);
    const step = this.activeStep(s);
    const state = p.view.state;
    if (step !== undefined && (state === 'working' || state === 'gate' || state === 'interrupted')) {
      p.view.state = 'interrupted';
      p.view.canResume = p.sessionId !== undefined ? true : undefined;
      step.state = 'interrupted';
      s.phase = 'interrupted';
      if (state !== 'interrupted') this.notice(run, 'interrupted', 'warning', 'The editor reloaded while Claude was working. Resume continues the same session; Cancel step takes the step back.');
    }
    // The judge recovery runs, if any (§3.11): a judge whose write was in flight, a queue's end whose judge had not
    // opened the stage, or a stage whose judgement cannot be computed again without a build.
    let judgeOptions: JudgeOptions | undefined;
    let replay: SessionWrite | undefined;
    if (step === undefined) {
      // §2.6: finish the write in flight.
      const inFlight = s.inFlight;
      if (inFlight !== undefined || (await run.shadow.changes(s.head)).length > 0) {
        await run.shadow.revertTo(s.head, 'Recovered: back to the session head', Math.max(0, p.view.round));
        // The `revert` commit (when ws/ differed) holds head's files: it is the head now (the judge judges the newest).
        const newest = (await run.shadow.commits()).at(-1);
        if (newest !== undefined) s.head = newest.id;
      }
      if (inFlight?.action.kind === 'queue-start') {
        const write = inFlight.action;
        const steps = this.replaySteps(s, write);
        if (steps !== undefined) await this.finishQueueStart(run, write, steps);
        else {
          // A-F7: a write whose steps cannot be rebuilt exactly is not made (its step 1 recorded only `inFlight`, and
          // ws/ is at `head`): the stage stays as it was, rather than a queue with steps telelean invented.
          this.log('error', `a queue-start write (${write.by}) could not be replayed: its steps cannot be rebuilt; it was not made`);
          delete s.inFlight;
        }
      } else if (inFlight?.action.kind === 'judge-apply') {
        delete s.inFlight;
        judgeOptions = {};
      } else if (inFlight !== undefined) {
        // 2e's review writes (`decide`, `submit-take-out`) run again below, once the stage judgement is computed again
        // (they read it). 2f's `premise` and `completion` writes are due writes: nothing of them was recorded (ws/ is
        // back at `head`), so they are due still, and `enqueueDueWrites` runs them again below; a judge follows.
        delete s.inFlight;
        if (inFlight.action.kind === 'decide' || inFlight.action.kind === 'submit-take-out') replay = inFlight.action;
        else judgeOptions = {};
      }
    }
    const now = this.sessionOf(run);
    // D2-72: the stage judgement again, from the judged commit's files and judged-facts.json (no Lean job).
    const recomputed = await this.recomputeJudgement(run);
    // §2.6 (2e): the review write in flight, again: fully made (its judge follows, the head moved), or not made.
    if (replay !== undefined && now.phase === 'stage' && (await this.replayWrite(run, replay))) judgeOptions ??= { decided: true };
    // §3.8, §3.11 (2f, D2-71): every premise write and completion still due, before anything else, completions first.
    if (this.sessionOf(run).phase === 'stage') this.enqueueDueWrites(run);
    if (this.activeStep(now) === undefined && (now.phase === 'step' || now.phase === 'interrupted')) {
      if (now.queue.length > 0) {
        p.view.state = 'interrupted';
        p.view.canResume = p.sessionId !== undefined ? true : undefined;
        now.phase = 'interrupted';
      } else {
        // The queue's last step ended, but its judge had not opened the stage: it is judged as the queue's end again,
        // with reconcile's queue-end rules only when no judge-apply of this queue applied them yet (F-V2D-FC-6, A-F8:
        // a reload between two judge rounds of a queue's end must not apply them twice).
        const q = currentQueue(now);
        judgeOptions = {
          endsQueue: true,
          ...(now.queueEndReconciled !== q ? { queueSteps: now.steps.filter((x) => (x.queue ?? 1) === q).map((x) => x.id) } : {}),
        };
        p.view.state = 'review';
      }
    } else if (now.phase === 'stage' && !recomputed) {
      // 2d's review, R1-1 (builder 2e): a queue's end whose judge could not run (A-F4: no `judged`) is still
      // unreconciled; it is judged with its queue-end rules (AF1's "proposed again", D2-17, the force's end), never as a
      // plain judge, which would take a reworked Result out again. Only while no decision was stacked since the queue's
      // seal: queue-end rules after a decision could undo it (AF1).
      const q = currentQueue(now);
      if (now.judged === undefined && now.queueEndReconciled !== q && !decidedSinceSeal(now)) {
        judgeOptions = { queueSteps: now.steps.filter((x) => (x.queue ?? 1) === q).map((x) => x.id) };
      } else {
        // A decision whose judge had not ended when the window closed (the head is past the judged commit, a decision
        // stacked since the seal): its judge, as the decision's own (F-FC-1: it heads the stage "did not pass" too).
        const decided = (now.judged === undefined || now.head !== now.judged.commit) && decidedSinceSeal(now);
        judgeOptions ??= decided ? { decided: true } : {};
      }
    }
    this.transcript(run, { kind: 'recovered', state: p.view.state });
    // A judge due shows as judging from the first view on.
    if (judgeOptions !== undefined || (recomputed && now.phase === 'stage')) this.runtimeOf(run).judging = true;
    await this.save(run, { run: true, proposal: true, session: true });
    if (judgeOptions !== undefined) void this.judgeHead(run, judgeOptions);
    else if (recomputed && now.phase === 'stage') void this.applyRecomputed(run);
  }

  /**
   * The steps of a `queue-start` write, again from its action (a crash between its step 1 and step 4), exactly as the
   * action that wrote it built them (A-F7): a Retry's steps from the steps they retry (`{ ...old.scope, step }`, their
   * kind: `retryNow`), a mid-stage Formalize's from its `inferences` (`formalizeInStage`). Undefined when a step
   * cannot be rebuilt (a write of a later sub-slice that records nothing more): the write is then not made.
   */
  protected replaySteps(s: PersistedSession, write: Extract<SessionWrite, { kind: 'queue-start' }>): PersistedStep[] | undefined {
    const known = new Map(s.steps.map((x) => [x.id, x]));
    const retried = write.by === 'retry' ? s.retry : [];
    const out: PersistedStep[] = [];
    for (const [k, id] of write.steps.entries()) {
      const fresh = { id, stage: s.stage, state: 'queued' as const, freezes: [], gateAttempts: [], counters: { ...ZERO_COUNTERS }, agentMs: 0 };
      const old = retried[k] !== undefined ? known.get(retried[k] as string) : undefined;
      if (old !== undefined) {
        out.push({ ...fresh, kind: old.kind, target: old.target, scope: { ...old.scope, step: id }, retryOf: old.id });
        continue;
      }
      // Builder 2e: a Submit's steps as `submitSteps` built them (the write records each one's target and openings).
      const submit = write.by === 'submit' ? write.submit?.[k] : undefined;
      if (submit !== undefined) {
        const inference = s.inferences.find((i) => i.target === submit.target);
        if (inference === undefined) return undefined;
        const question = { sources: [...inference.question.sources], fromNothing: inference.question.fromNothing };
        out.push({
          ...fresh,
          kind: 'submit',
          target: submit.target,
          scope: { step: id, target: submit.target, question, fuzzyStatements: [], openProof: submit.openProof, openArrows: !question.fromNothing, openItems: [...submit.openItems] },
        });
        continue;
      }
      const inf = write.by === 'formalize' ? write.inferences?.[k] : undefined;
      if (inf === undefined) return undefined;
      const question = { sources: [...inf.premises], fromNothing: inf.premises.length === 0 };
      out.push({ ...fresh, kind: 'formalize', target: inf.target, scope: { step: id, target: inf.target, question, fuzzyStatements: [], openProof: true, openArrows: !question.fromNothing, openItems: [] } });
    }
    return out;
  }

  /**
   * D2-72: the stage judgement computed again with core's `judgeState('stage')` on the judged commit's files with
   * `judged-facts.json`, B and the records: no Lean job. False when there is nothing to compute it from, or the facts
   * belong to another state (the judge then runs, with a build).
   */
  protected async recomputeJudgement(run: ActiveRun): Promise<boolean> {
    const s = this.sessionOf(run);
    const rt = this.runtimeOf(run);
    if (s.judged === undefined) return false;
    const stored = await this.readJudgedFacts(run);
    if (stored === undefined || stored.filesKey !== s.judged.filesKey || stored.commit !== s.judged.commit) return false;
    let files: Map<string, string>;
    try {
      files = await run.shadow.filesAt(s.judged.commit);
    } catch {
      return false;
    }
    if (filesKey(files) !== s.judged.filesKey) return false;
    const base = await this.loadBaseModel(run);
    const current = filesModel(files, run.p.library, stored.facts);
    rt.judgement = judgeState({
      purpose: 'stage',
      stage: 'prove',
      commit: s.judged.commit,
      filesKey: s.judged.filesKey,
      base,
      current,
      inferences: s.inferences,
      ledger: s.ledger,
      items: s.items,
      premises: s.premises,
      ended: endedTargets(s),
      rejectedArrows: s.rejectedArrows,
    });
    rt.judgedModel = { commit: s.judged.commit, model: current, ...(lakefileOf(files) !== undefined ? { lakefile: lakefileOf(files) } : {}) };
    // In a stage, a head past the judged commit (a decision whose judge had not ended) needs the judge.
    return s.phase !== 'stage' || s.head === s.judged.commit;
  }

  /** In a stage, the recomputed judgement applied through a `judge-apply` write, which changes nothing when nothing differs. */
  protected async applyRecomputed(run: ActiveRun): Promise<void> {
    const rt = this.runtimeOf(run);
    const judgement = rt.judgement;
    const judged = rt.judgedModel;
    if (judgement === null || judged === undefined) return;
    rt.judging = true;
    try {
      await this.applyRecomputedNow(run, rt, judgement, judged);
    } catch (e) {
      this.log('error', `the recomputed judgement could not be applied: ${errorText(e)}`);
    } finally {
      rt.judging = false;
      if (!this.disposed && run === this.run) await this.save(run, SESSION_CHANGE);
    }
  }

  protected async applyRecomputedNow(run: ActiveRun, rt: SessionRuntime, judgement: StateJudgement, judged: NonNullable<SessionRuntime['judgedModel']>): Promise<void> {
    {
      const outcome = await this.enqueueWrite(run, () => this.judgeApply(run, judgement, { outcome: judgement.ok ? 'ok' : 'problems', g0: [], findings: [], diagnostics: [], durationMs: 0, model: judged.model, ...(judged.model.facts !== undefined ? { facts: judged.model.facts } : {}) }, {}));
      if (outcome !== 'applied') {
        rt.judging = false;
        await this.judgeHead(run, {});
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // The end of a session's records (D2-11), until 2f's Apply and Exit

  /**
   * D2-11: every step's attempt record, written with its resolution when the session ends. (2f, G1) `arrows`: an Apply's
   * provenance; each step's resolution carries the arrows that step proposed, none when it proposed none.
   */
  protected async writeSessionAttempts(run: ActiveRun, resolution: AttemptResolution['resolution'], arrows: readonly ArrowProvenance[] = []): Promise<void> {
    const s = run.p.session;
    if (s === undefined) return;
    const sidecars = this.o.services.sidecars;
    const subject = run.p.view.subject;
    try {
      for (const step of s.steps) {
        if (step.attempt === undefined) continue;
        await sidecars.appendAttempt(this.o.root, step.attempt);
        const own = arrows.filter((a) => a.step === step.id).map((a) => ({ ...a }));
        await sidecars.resolveAttempt(this.o.root, subject, {
          format: ATTEMPT_RESOLUTION_FORMAT,
          version: 1,
          run: run.runId,
          round: step.attempt.round,
          date: this.iso(),
          resolution,
          ...(own.length > 0 ? { arrows: own } : {}),
        });
      }
      await this.o.workspace.reloadAttempts?.(subject);
    } catch (e) {
      this.log('warn', `attempts.jsonl could not be written: ${errorText(e)}`);
    }
  }

  /** The verdict a passed step's attempt records: its finish's status. */
  protected verdictOfPassed(run: ActiveRun): RunVerdict {
    return verdictOfStatus(run.p.lastFinish?.status ?? 'not_proved');
  }
}

/** Two file maps equal (helpers' tests). */
export { sameFiles as sessionSameFiles };
