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
 * FROZEN CONTRACT (M2). Owner: WP2. Additive optional members / new exports only (docs/m2-plan.md section 14).
 */
import type {
  buildProjectModel,
  checkFileChanges,
  computePermittedAxioms,
  evaluateRules,
  FileChange,
  frozenSnapshot,
  FrozenSnapshot,
  GateFinding,
  ghostTextProblems,
  LeanFacts,
  normalisationChanges,
  parseLeanFile,
  ProjectModel,
  RuleReport,
  RunStage,
  scanForbidden,
  Selection,
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
   * (sandbox could not start, low memory, the mirror could not be synced): not the agent's fault, not counted.
   */
  outcome: 'ok' | 'problems' | 'environment';
  /** For `environment`: why, in plain words. */
  environment?: string;
  /** G0 and file findings (when not empty, Lean was not started). */
  g0: GateFinding[];
  /** Everything else, from core's evaluateRules plus G1 budget findings (`budget`: timeout / oom of the build). */
  findings: GateFinding[];
  diagnostics: LeanDiagnosticView[];
  /** The build's facts status (absent when Lean did not run). */
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
}

export type GhostCheck =
  /** `statement`: the checked (whitespace-collapsed) text, which `GhostView.leanStatement` and adoption use. */
  | { ok: true; footprint: string[]; aloneEntails: boolean; statement?: string }
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
   */
  checkGhost(ctx: CheckContext, ghost: GhostCheckInput): Promise<GhostCheck>;
  /** Statements of the CURRENT mirror (call after a successful check of the same files). */
  renderStatements(ctx: Pick<CheckContext, 'shadow' | 'job'>, names: readonly string[]): Promise<RenderedStatement[]>;
}

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
}

export interface LeanCheckEngineOptions {
  /** Replaces semantic.refreshLeanFacts (tests). */
  refreshFacts?: (request: import('../semantic/types.js').RefreshRequest) => Promise<LeanFacts>;
  now?: () => Date;
  /** Test hook: replaces some of the core functions the engine calls. */
  core?: Partial<EngineCore>;
}
