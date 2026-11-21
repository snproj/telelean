/**
 * The Lean check engine (WP2): every Lean-running step of a run, on the shadow's build mirror, one job at a time
 * (`semantic.runExclusive`), each under runLean with the run's scope group (`telelean-<runId>-<n>`, cancellable with
 * `lean.cancelRun`). docs/m2-plan.md sections 3 and 4.3.
 *
 *   check      check_lean: G0 (core) on the changed text -> only if clean: sync mirror, G1 build + facts
 *              (semantic.refreshLeanFacts on build/) -> core project model of ws/ + facts -> core evaluateRules
 *   freeze     freeze_statements: check with purpose `freeze`; on success commit `freeze`, compute the permitted set
 *              (core computePermittedAxioms on the frozen model), lean.freezeChallenge on a copy of build/ (target
 *              `.holds` removed from the copy when present), and return the FreezeRecord
 *   normalise  before each gate (no Lean): pins + docstring mirror for statements new in this run, committed
 *   gate       finish (the caller ran normalise first): G0, G1, G3, G5 via check (purpose gate-*), then G4
 *              lake comparator against the round's freeze (status `proved` only)
 *   checkGhost propose_assumption: G0 on the statement and proof text, then a scratch check file importing the
 *              mirror's modules: `theorem telelean_ghost_check : (<statement>) → <target> := <proof>`, its
 *              `#print axioms` ⊆ permitted (no sorry), "alone entails" when no selected `.holds` is in it
 *   render     the review's statements: `#print` default and fully explicit (pp.explicit, pp.notation false,
 *              pp.universes, pp.coercions false), from a scratch check file
 *
 * Slice 2 (docs/slice2-plan.md 2.9, 2b3b): with `CheckContext.session`, check, freeze and gate judge the state with
 * core's `judgeState` (the step's scope and S₀, the session's records) instead of `evaluateRules`, and decide on the
 * judgement's `stepFindings`; and four methods judge the states of a session outside a step: `judge` (a stage),
 * `finalCheck` (the end), `writePremise` and `complete` (an accepted Add premise's write and its completion). G0 runs
 * first, before any Lean job, at every purpose (AP30-1 r2).
 *
 * FROZEN CONTRACT (M2). Owner: WP2. Additive optional members / new exports only (docs/m2-plan.md section 14).
 */
import type {
  applyBackstop,
  ArrowEnds,
  BackstopRefusal,
  buildProjectModel,
  checkFileChanges,
  computePermittedAxioms,
  DeclFacts,
  evaluateRules,
  FileChange,
  FinalCheckRule,
  frozenSnapshot,
  FrozenSnapshot,
  GateFinding,
  ghostTextProblems,
  ItemRecord,
  judgeState,
  LeanFacts,
  LedgerEntry,
  normalisationChanges,
  parseLeanFile,
  PremiseDraft,
  ProjectModel,
  RuleReport,
  RunStage,
  scanForbidden,
  Selection,
  SessionInference,
  StateJudgement,
  StepScope,
} from '@telelean/core';

import type { ComparatorVerdict, Freeze } from '../lean/comparator.js';
import type { HostTools } from '../lean/systemd.js';
import type { LeanToolchain } from '../lean/toolchain.js';
import type { FinishStatus } from '../llm/types.js';
import type { ShadowCommit, ShadowWorkspace } from '../shadow/types.js';

/** How every Lean job of a run is started. */
export interface LeanJobSettings {
  /** The run id: runLean scope group, so `lean.cancelRun(runId)` stops every job of the run. */
  runId: string;
  /** runLean `MemoryMax=` (setting `telelean.memory.capGiB`; lowered to MemAvailable minus a reserve, as M1 does). */
  memoryMax: string;
  /** Memory guard (no spawn below it; the outcome is `environment`). */
  minAvailableBytes: number;
  /** Wall-clock limit per Lean job (cap, default 120 000 ms). */
  leanJobMs: number;
  signal?: AbortSignal;
  toolchain?: LeanToolchain;
  /** Test hooks. */
  host?: Partial<HostTools>;
  readMemAvailable?: () => number | undefined;
}

export interface CheckContext {
  shadow: ShadowWorkspace;
  selection: Selection;
  stage: RunStage;
  round: number;
  /** The round's freeze (stage `prove`). */
  freeze?: FreezeRecord;
  job: LeanJobSettings;
  /** check_lean's `files`: only scopes which diagnostics are reported (the build is always the whole library). */
  files?: readonly string[];
  /** Node ids whose blocks telelean added in this run (adopted ghosts). */
  teleleanBlocks: readonly string[];
  /** The shadow commit where the round started (round > 1). */
  roundStartCommit?: string;
  /**
   * Reviewer addition: the commit whose files are B for the rules (core `RuleInput.base`): default the shadow's `base`
   * commit. Accept's re-check after the real files drifted passes the `accept-base` commit (the user's files at
   * Accept), so the user's own edits made during the run are never judged as Claude's (docs/m2-plan.md section 7.1).
   * The engine finds `RuleInput.adopted` itself (the newest `adopt` commit).
   */
  baseCommit?: string;
  /**
   * Slice 2 (docs/slice2-plan.md 2.9, 2b3b): the edit session this check belongs to. With it, check, freeze and gate
   * judge with core's `judgeState` (the step's `scope` and its S₀ `stepStartCommit` are then required) instead of
   * `evaluateRules`, and the reports carry the judgement. For `judge` and `finalCheck` (purposes `stage` and `final`),
   * `selection`, `stage` and `round` are the active step's, or else the first inference's, so `validateContext` passes
   * unchanged; judgeState ignores them (JudgeInput.stage is passed as `prove`).
   */
  session?: SessionCheckContext;
}

/**
 * Slice 2 (docs/slice2-plan.md 2.9, 2b3b): what a session adds to CheckContext. With it, check, freeze and gate call
 * judgeState instead of evaluateRules, and their reports gain `judgement`. They decide on the judgement's
 * `stepFindings` with §2.1's failed-probe rule (an `environment` outcome with `probeFailure`'s sentence when they are
 * empty or only `source-only`), never on `ok` alone (AP30-3). G0 runs before all of it: when it finds anything they
 * return its findings, counted, with no judgement and no Lean job (AP30-1 r2).
 */
export interface SessionCheckContext {
  inferences: readonly SessionInference[];
  ledger: readonly LedgerEntry[];
  /** The session's records: they do not change while a queue runs (D2-62), so a step and its Resume read the same. */
  items: readonly ItemRecord[];
  premises: readonly PremiseDraft[];
  ended: readonly string[];
  rejectedArrows: readonly ArrowEnds[];
  /** Step purposes: the step's limits and its S₀ commit. */
  scope?: StepScope;
  stepStartCommit?: string;
  noAlternative?: boolean;
}

/** A Lean diagnostic for the agent: the WHOLE message (m0-report: never only the first line). */
export interface LeanDiagnosticView {
  file: string;
  /** 1-based, as Lean prints it. */
  line: number;
  /** 0-based column. */
  column: number;
  severity: 'error' | 'warning' | 'information';
  message: string;
}

export interface CheckReport {
  /**
   * `ok`: no finding. `problems`: findings (G0 / G1 / G3 / G5 / readiness). `environment`: telelean could not run Lean
   * (sandbox could not start, low memory, the mirror could not be synced; since 2b3a also a probe that was cut or failed
   * when the rules find nothing else, and, fixer 2b3a r1, a probe job that ran out of memory): not the agent's fault,
   * not counted.
   */
  outcome: 'ok' | 'problems' | 'environment';
  /** For `environment`: why, in plain words. */
  environment?: string;
  /** G0 and file findings (when not empty, Lean was not started). */
  g0: GateFinding[];
  /** Everything else, from core's evaluateRules plus G1 budget findings (`budget`: timeout / oom of the build or the check, the probe's timeout). */
  findings: GateFinding[];
  diagnostics: LeanDiagnosticView[];
  /**
   * The build's facts status (absent when Lean did not run). `durationMs`: the refresh's Lean jobs (core
   * `leanDurationMs`: the build, the check and, since 2b3a, the isolated probe).
   */
  build?: { status: LeanFacts['status']; durationMs: number; errorCount: number };
  rules?: RuleReport;
  /** The shadow's project model with the mirror's facts (for the proposal; not serialised into tool results). */
  model?: ProjectModel;
  /**
   * Fixer round 1: B as the rules saw it (the base or accept-base commit, with B's facts when kept), so the freeze
   * computes the permitted set's derivation footprints from the user's own proofs only (core `computePermittedAxioms`).
   */
  base?: ProjectModel;
  facts?: LeanFacts;
  /**
   * Slice 2 (2b3b; additive): with `CheckContext.session`, the judgement of the checked state (core `judgeState`), when
   * Lean gave facts that the rules judged; absent when G0 refused the text, or when Lean could not judge it (an
   * `environment` or budget outcome of the build).
   */
  judgement?: StateJudgement;
  /**
   * (slice 2, fixer 2d r1, F-V2D-FC-8; additive) `judge`: the fully explicit form of each Add premise draft whose
   * re-check passed on this state (`premiseChecks`), by item key. Core's `premiseChecks` has no field for it; the
   * session fills it into a draft that has none (a pending ghost of a converted v1 run, §3.11), which §3.8's meaning check
   * needs. Absent when no re-check passed.
   */
  premiseExplicit?: Record<string, string>;
  durationMs: number;
}

/** What a successful freeze keeps (persisted in run.json; `freeze.exportPath` stays valid while the run dir exists). */
export interface FreezeRecord {
  round: number;
  /** The `freeze` shadow commit. */
  commit: ShadowCommit;
  at: string;
  selection: Selection;
  snapshot: FrozenSnapshot;
  /** comparator's challenge (lean/comparator.ts Freeze: export path, theorem names, permitted axioms). */
  freeze: Freeze;
}

export type FreezeOutcome =
  | { ok: true; record: FreezeRecord; report: CheckReport }
  /** `refusals`: one exact sentence per finding (the agent's freeze reply); `environment` when Lean could not run. */
  | { ok: false; refusals: string[]; report: CheckReport; environment?: string };

export interface GateReport {
  passed: boolean;
  /** telelean could not run the gate (sandbox, memory, a freeze problem): not counted as an attempt. */
  environment?: string;
  /** All failed rules, G0 first (G4 findings only when G0-G3 and G5 passed). */
  findings: GateFinding[];
  flaggedDefinitions: RuleReport['flaggedDefinitions'];
  /** `#print axioms` of the target's `.holds` (status proved). */
  footprint?: string[];
  check: CheckReport;
  comparator?: ComparatorVerdict;
  durationMs: number;
  /** Reviewer addition: the shadow commit whose files were judged (see `LeanCheckEngine.gate`). */
  commit?: ShadowCommit;
  /** Slice 2 (2b3b; additive): with `CheckContext.session`, the judgement of the gated state (`check.judgement`). */
  judgement?: StateJudgement;
  /**
   * Slice 2 (2b3b, D2-19, §3.3 step 5; additive): at a proved finish in a session, B.1's permitted set recomputed on the
   * gated state, with E(T), differed from the freeze's, so a new challenge was exported before the comparator, from the
   * step's freeze copy (`frozen/<n>/project`, its `.lake` rebuilt), changing only `permittedAxioms`. The caller records
   * it as the step's newest freeze, with the statements still fixed (the same freeze commit).
   */
  freeze?: FreezeRecord;
}

export interface GhostCheckInput {
  naturalName: string;
  /**
   * Claude's proposition. Reviewer change: core `ghostTextProblems(leanStatement, proof)` must be empty (else refused
   * without Lean), whitespace runs are collapsed to one space, and the scratch file pins it as
   * `abbrev telelean_ghost_stmt : Prop := <statement>` followed by
   * `theorem telelean_ghost_check : telelean_ghost_stmt → <target statement> := <proof>`, so a statement that closes
   * the declaration early can never change what is checked (docs/m2-plan.md section 3.8). Any Lean error in the
   * scratch file refuses the ghost.
   */
  leanStatement: string;
  /** A term of type `telelean_ghost_stmt → <target statement>`. */
  proof: string;
  /**
   * Slice 2 (2b3b; additive): with `CheckContext.session`, the draft's Lean name (`PremiseDraft.leanName`), under which
   * `GhostCheck.facts` lists its statement's scratch facts. Required there (fixer 2b3b r1, F-FC-5: `checkGhost` throws
   * a TypeError without a non-empty one, as `writePremise` does without its draft); unused without a session.
   */
  leanName?: string;
}

export type GhostCheck =
  /**
   * `statement`: the checked (whitespace-collapsed) text, which `GhostView.leanStatement` and adoption use.
   * Slice 2 (2b3b; additive), with `CheckContext.session` only (§3.8): `explicit`, the statement's fully explicit form
   * (the value of `#print` under the review's explicit options, whitespace collapsed: `PremiseDraft.explicit`, which
   * `writePremise` compares where the premise is written); `facts`, its statement's scratch facts by Lean name (the
   * statement abbrev and its `.holds`, under `GhostCheckInput.leanName` in the subject's namespace:
   * `PremiseDraft.facts`), when Lean printed its constants.
   */
  | { ok: true; footprint: string[]; aloneEntails: boolean; statement?: string; explicit?: string; facts?: Record<string, DeclFacts> }
  /** `problems`: exact sentences for the agent (G0 tokens, Lean errors, axioms outside the permitted set, sorry). */
  | { ok: false; problems: string[]; environment?: string };

export interface RenderedStatement {
  /** Fully-qualified statement name. */
  name: string;
  pretty: string;
  explicit: string;
  /** Lean's message when the statement could not be printed. */
  error?: string;
}

export interface LeanCheckEngine {
  /**
   * telelean's normalisation before a gate (no Lean): core `normalisationChanges` for the target, selected premises
   * and adopted ghosts whose statement is new in this run (syntactic, base vs ws/), written into ws/ and committed
   * as `normalise` when anything changed. Idempotent.
   */
  normalise(ctx: CheckContext): Promise<{ changes: FileChange[]; commit?: ShadowCommit }>;
  /**
   * Reviewer addition (docs/m2-plan.md sections 2 and 4.1): builds the shadow's `base` commit right after the shadow
   * is created, before any prompt (no G0: it is the user's own text). Lean errors anywhere in the user's files make
   * the run fail before Claude is contacted (Claude could not fix them, so every attempt would fail); otherwise the
   * facts are kept in the run dir as B's facts, so `existing-changed` can also compare B's declarations by their
   * elaborated `type`/`value` (catching an `open … in` or a new instance that changes what unchanged text means).
   * One Lean job, not counted.
   */
  checkBase(ctx: CheckContext): Promise<CheckReport>;
  check(ctx: CheckContext): Promise<CheckReport>;
  /** Readiness, then the freeze (the caller passes the round and counts the check). */
  freeze(ctx: CheckContext): Promise<FreezeOutcome>;
  /**
   * The gate for one finish call. `status` decides the purpose: `proved` -> `gate-proved` + G4; anything else ->
   * `gate-other` (no G4). Requires `ctx.freeze` for `proved` (else a `not-frozen` finding).
   * Reviewer note: the gate judges exactly one committed state (the `normalise` commit, or a `checkpoint` commit when
   * normalisation changed nothing; `GateReport.commit`); the RunManager commits `gate-pass` only while ws/ still
   * equals it, and at the end of the turn resets ws/ to the gate-pass files (edits made after finish are discarded).
   */
  gate(ctx: CheckContext & { status: FinishStatus }): Promise<GateReport>;
  /**
   * Requires `ctx.freeze` (the permitted set); refuses (`ok: false`) before the freeze. Runs `check` first (G0, sync,
   * build) unless the mirror already holds a clean check of exactly ws/'s files; problems there refuse the ghost
   * with them (Lean never elaborates text that fails G0). Returns `GhostCheck.footprint` and the collapsed statement.
   * In a session (2b3b), the clean check's judgement is reused only under the same session records (fixer 2b3b r1,
   * F-FC-3: B.1 with E(T) reads the ledger), and `ghost.leanName` is required (TypeError).
   */
  checkGhost(ctx: CheckContext, ghost: GhostCheckInput): Promise<GhostCheck>;
  /** Statements of the CURRENT mirror (call after a successful check of the same files). */
  renderStatements(ctx: Pick<CheckContext, 'shadow' | 'job'>, names: readonly string[]): Promise<RenderedStatement[]>;
  /**
   * Slice 2 (docs/slice2-plan.md 2.9, 3.5, 3.6; 2b3b), RV-11: builds the head (the shadow's newest commit, from its
   * files, whatever a write in progress has put into ws/), reusing the facts when the mirror was last built from
   * exactly these files, judges every inference (`judgeState('stage')`), and checks again, in the scratch file, each
   * Add premise draft not written yet whose reliance changed since this engine last checked it (its target's statement,
   * B.1's permitted set and sources, and the facts of what its footprint, its gap proof's constants, its statement and
   * the target's statement reach): `premiseChecks`. Fixer 2b3b r1: a draft whose reliance did not change gets its last
   * check's outcome again, with no Lean job, so a judge whose outcome was dropped loses nothing; a check telelean could
   * not run or judge (its environment, a budget, an error only in telelean's own lines, no answer) leaves the draft out,
   * to be tried at the next judge, never "no longer closes the gap"; `premiseChecks` lists every draft judged on this
   * state either way, and is absent when there is none. Requires `ctx.session`. When G0 finds anything, nothing is synced, built, probed, rendered or checked: the files are judged
   * without facts (the `facts` problem), G0's findings first in `global` (so `ok` is false), and `report` carries them
   * as `g0`. Lean failures are the report's `environment` or budget outcome, with the files judged on what Lean gave.
   */
  judge(ctx: CheckContext): Promise<{ judgement: StateJudgement; report: CheckReport }>;
  /**
   * Slice 2 (§3.10 step 2; 2b3b): the final check of exactly F (the shadow's newest commit). Facts: reused when
   * `reuse.judgement` judged F's files key and is `ok` and the mirror was last built from them (EN-2), else a fresh
   * build. `judgeState('final')`; the backstop (always); then, only when nothing else failed, the comparator for every
   * inference whose `.holds` in F is a proof of this session, on its permitted set in F, unless `reuse.comparator`
   * recorded a pass for F's files key and the same permitted set. Drift is the caller's (the engine never reads the
   * real files). G0 first, as `judge`. Fixer 2b3b r1 (A-V2B3B-ADV-6): before anything, ws/ must equal that commit (no
   * write is in flight at the end), else an `environment` outcome with nothing built: the check never passes a state
   * that is not F.
   */
  finalCheck(
    ctx: CheckContext,
    reuse?: { judgement: StateJudgement; comparator: Record<string, { filesKey: string; permitted: string[] }> },
  ): Promise<FinalCheckReport>;
  /**
   * Slice 2 (§3.8, F11; 2b3b): normalises the premise write the caller made into ws/ (the premise's card), builds,
   * renders P's fully explicit form where it was written, commits exactly the files built as `adopt` (step 3 of the
   * write order, §2.6), and judges that commit (`judgeState('stage')`); the write's step 4 takes the written item's key
   * from that judgement. `meaningMatches`: the rendered form equals the draft's `explicit`. A G0 finding (no Lean job),
   * a build that failed, a Lean failure, a render that failed, or facts whose probe failed answer `{ ok: false }` with
   * no commit (the probe's: `environment` = probeFailure's sentence, `error` = it without its final period), so step 4
   * never reads a partial judgement (AP30-4); the caller takes the write back out.
   */
  writePremise(ctx: CheckContext, premise: { item: string; draft: PremiseDraft; card: string }): Promise<PremiseWriteReport>;
  /**
   * Slice 2 (§3.8, F11; 2b3b): normalises the completion the caller wrote into ws/ (the target's statement), freezes
   * again from the state it is written on (the shadow's newest commit: the premise's `adopt` commit, or, fixer 2b3b r1
   * F-FC-2, a later one, after recover()'s `revert` replays the write or when the completion becomes due after a
   * decision; it must hold the written premise, with its ledger `premise` entry and its card, and T not proved) after
   * `statement-changed` passes against the target's last freeze snapshot (`ctx.freeze`, required, and T's own), gates
   * it as `gate-proved` with that new freeze's challenge (build, footprint, statements fixed, B.2, comparator), and
   * commits `completion` when it passes; its judgement is then `judgeState('stage')` of that commit. G0 first, on the
   * completion and on the state it starts from; any failure answers `{ ok: false }` with no commit (the caller takes the
   * completion back out).
   */
  complete(ctx: CheckContext, premise: { item: string; draft: PremiseDraft; card: string }): Promise<CompletionReport>;
}

/** Slice 2 (docs/slice2-plan.md 2.9, §3.10; 2b3b): the final check's outcome. */
export interface FinalCheckReport {
  passed: boolean;
  /** telelean could not run Lean (sandbox, memory, layout, a challenge it could not build): nothing passed. */
  environment?: string;
  /** EN-2: the facts of the last judgement were reused (no build). */
  reusedFileChecks: boolean;
  judgement: StateJudgement;
  /** Every failure, the backstop's refusals included (rule `backstop`); `items` are item ids. Drift is the caller's. */
  failures: Array<{ rule: FinalCheckRule; text: string; items?: string[]; declaration?: string }>;
  backstop: BackstopRefusal[];
  /**
   * (builder 2b3b; additive) The comparator's passes of this check by target, run or reused (`reuse.comparator`): F's
   * files key and the permitted set judged, which the caller records for EN-2's reuse.
   */
  comparator?: Record<string, { filesKey: string; permitted: string[] }>;
}
export type PremiseWriteReport =
  | { ok: true; meaningMatches: boolean; explicit: string; judgement: StateJudgement }
  | { ok: false; error: string; environment?: string };
export type CompletionReport =
  | { ok: true; commit: ShadowCommit; judgement: StateJudgement }
  | { ok: false; error: string; environment?: string };

/**
 * The core functions the engine calls (default: `@telelean/core`'s). Reviewer addition, as M1's
 * `ModelWorkspaceOptions.core`: WP2 tests inject simple fakes while WP1's rules are still stubs; tests that need the
 * real rules gate themselves with `isImplemented` and run at integration (docs/m2-plan.md section 9).
 */
export interface EngineCore {
  checkFileChanges: typeof checkFileChanges;
  scanForbidden: typeof scanForbidden;
  ghostTextProblems: typeof ghostTextProblems;
  evaluateRules: typeof evaluateRules;
  computePermittedAxioms: typeof computePermittedAxioms;
  frozenSnapshot: typeof frozenSnapshot;
  normalisationChanges: typeof normalisationChanges;
  parseLeanFile: typeof parseLeanFile;
  buildProjectModel: typeof buildProjectModel;
  /** Slice 2 (2b3b; additive): the session's rules and the backstop. */
  judgeState: typeof judgeState;
  applyBackstop: typeof applyBackstop;
}

export interface LeanCheckEngineOptions {
  /** Replaces semantic.refreshLeanFacts (tests). */
  refreshFacts?: (request: import('../semantic/types.js').RefreshRequest) => Promise<LeanFacts>;
  now?: () => Date;
  /** Test hook: replaces some of the core functions the engine calls. */
  core?: Partial<EngineCore>;
}
