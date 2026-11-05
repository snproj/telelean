/**
 * Proposals, Accept and the run sidecars (WP4; docs/m2-plan.md sections 4.5 and 7).
 *
 *   build       the end-of-round ProposalView: the proposed subject graph (core project model of the shadow + the
 *               mirror's facts -> subjectGraph), its diff against the current board (core diffGraphs), the changed
 *               files with line counts (`diff` 9.0.0), review items (statements with sentence + Lean pretty/explicit +
 *               closure; new pure-signature vocabulary), definition questions, lifecycle items (G->D of a proved GOAL),
 *               ghosts and the report card
 *   baseDrift   which model files the user changed (open buffers first) since the run's base
 *   planAccept  the whole-file changes Accept applies: the shadow's changes rebased onto the real files (3-way:
 *               the base->shadow patch applied to the real text with no fuzz, as M1's undo does), then the confirmed
 *               lifecycle items; a patch that does not apply is a `conflict` (nothing is applied)
 *   apply       ModelWorkspace.applyChanges: "Manual edits" snapshot first, EditApplier (WorkspaceEdit + save),
 *               undo entry, the action's snapshot (history kind `accept-proposal`), re-read, Lean refresh
 *   sidecars    attempts.jsonl (append-only) and decisions.json (atomic replace), inside `.telelean/subjects/<S>/`
 *
 * FROZEN CONTRACT (M2). Owner: WP4. Additive optional members / new exports only (docs/m2-plan.md section 14).
 */
import type {
  ActionOutcome,
  addDecisions,
  AttemptRecord,
  AttemptResolution,
  AttemptSummary,
  buildProjectModel,
  DecisionRecord,
  DecisionsFile,
  diffGraphs,
  FileChange,
  FlaggedDefinition,
  GateAttemptView,
  GhostView,
  LeanFacts,
  lifecycleChanges,
  parseAttemptLines,
  parseDecisionsFile,
  parseLeanFile,
  proposalLabel,
  ProposalView,
  ReportCard,
  RunUsage,
  RunVerdict,
  Selection,
  serializeAttemptLine,
  serializeDecisionsFile,
  subjectGraph,
  summariseAttempts,
  TlGraph,
} from '@telelean/core';

import type { CheckReport, RenderedStatement } from '../gate/types.js';
import type { FinishArgs } from '../llm/types.js';
import type { ShadowWorkspace } from '../shadow/types.js';
import type { ModelWorkspace } from '../workspace/types.js';

/** Reads a real model file as the board sees it (ModelWorkspace.readText: open buffer first), null when missing. */
export type ReadRealText = (path: string) => Promise<string | null>;

export interface ProposalBuildInput {
  runId: string;
  round: number;
  /** Host-generated (`p<n>`). */
  proposalId: string;
  selection: Selection;
  shadow: ShadowWorkspace;
  /**
   * The check of exactly the shadow state the proposal shows (after normalisation, or of the reverted state), with
   * `model` and `facts` set (a check without them yields a proposal with the syntactic graph and no review renders).
   */
  check: CheckReport;
  /** engine.renderStatements for the new or changed statements (missing names render as their source text). */
  rendered: readonly RenderedStatement[];
  /** The board now (`ModelWorkspace.graph(subject)`): the diff's left side. */
  currentGraph: TlGraph;
  verdict: RunVerdict;
  /** Claude's finish arguments of the passing (or last) attempt. */
  finish?: FinishArgs;
  ghosts: readonly GhostView[];
  gateAttempts: readonly GateAttemptView[];
  flaggedDefinitions: readonly FlaggedDefinition[];
  usage: RunUsage;
  durationMs: number;
  agentMs: number;
  reverted?: ReportCard['reverted'];
  /** From `baseDrift` (non-empty -> `baseChanged`). */
  drift: readonly string[];
  /** Stamped on the proposal graph (the webview keeps proposal graphs apart from board graphs). */
  graphVersion: number;
}

export interface AcceptRequest {
  proposal: ProposalView;
  shadow: ShadowWorkspace;
  /** Ids of the lifecycle items the user ticked (unknown ids: `not-found`). */
  lifecycle: readonly string[];
  readReal: ReadRealText;
  /** `YYYY-MM-DD` (not used by M2's lifecycle items; reserved). */
  today: string;
  /**
   * Fixer round 1 (optional): how many premises the user selected for the run (0 = a "Self-evident?" run), for the
   * history label (core `proposalLabel`). Absent: labelled as "These suffice".
   */
  premises?: number;
  /**
   * Reviewer addition (docs/m2-plan.md section 7.1 step 4): after a rebase that passed its re-freeze and re-gate, the
   * exact files to apply (ws/ as re-gated: path -> text, every model file). The plan is then `real -> shownState`
   * plus the ticked lifecycle items, with no patching; absent = patch base -> shown onto the real text.
   */
  shownState?: ReadonlyMap<string, string>;
  /**
   * WP4 addition (optional): the real model files now (ModelWorkspace.modelFiles()), so a file the user added during
   * the run is kept in `shadowState` (and never deleted by the re-gated state). Absent: the model root's model files on
   * disk (`<library>.lean`, `<library>/**.lean`) plus the project files, each read through `readReal`.
   */
  realFiles?: readonly string[];
  /**
   * WP4 addition (optional): the Lean facts of the state being accepted (after a re-gate: the re-gate's check
   * facts). `lifecycleChanges` needs them to see that the target is proved. Absent: the facts `build` kept for this
   * proposal (in memory, else `<runDir>/proposal-facts.json`, so Accept after a window reload still has them).
   */
  facts?: LeanFacts;
}

export type AcceptPlan =
  | {
      ok: true;
      /** Whole-file changes against the REAL files (`before` = real text now), lifecycle items included. */
      changes: FileChange[];
      /** History / undo label (core proposalLabel). */
      label: string;
      nodes: string[];
      /** Real files that differ from the run's base (they were rebased). */
      drift: string[];
      /**
       * The merged model files WITHOUT the lifecycle items (path -> text, every model file): when `drift` is not
       * empty, the RunManager writes this into ws/, re-freezes and re-runs the gate before applying (D-21).
       */
      shadowState: Map<string, string>;
    }
  | { ok: false; code: 'conflict' | 'unsafe' | 'not-found' | 'invalid'; error: string; files?: string[] };

export interface ProposalService {
  build(input: ProposalBuildInput): Promise<ProposalView>;
  /**
   * Model files whose real text (open buffer first) differs from the run's base, sorted. Reviewer addition:
   * `realFiles` = ModelWorkspace.modelFiles() (the real model files now), so files the user added or deleted during
   * the run count as drift too; absent = only the base's files are compared.
   */
  baseDrift(shadow: ShadowWorkspace, readReal: ReadRealText, realFiles?: readonly string[]): Promise<string[]>;
  planAccept(request: AcceptRequest): Promise<AcceptPlan>;
  /** Requires `ModelWorkspace.applyChanges` (M2 member); never throws for refusals. */
  apply(plan: Extract<AcceptPlan, { ok: true }>, workspace: ModelWorkspace, subject: string): Promise<ActionOutcome>;
  /** base -> the shadow state the proposal shows, for the raw diff (`vscode.changes`). */
  diffFiles(shadow: ShadowWorkspace, proposal: ProposalView): Promise<FileChange[]>;
}

/**
 * The core functions the proposal service calls (default: `@telelean/core`'s). Reviewer addition, as M1's
 * `ModelWorkspaceOptions.core`: WP4 tests inject fakes while WP1's helpers are still stubs.
 */
export interface ProposalCore {
  diffGraphs: typeof diffGraphs;
  proposalLabel: typeof proposalLabel;
  lifecycleChanges: typeof lifecycleChanges;
  parseLeanFile: typeof parseLeanFile;
  buildProjectModel: typeof buildProjectModel;
  subjectGraph: typeof subjectGraph;
}

/** The core codecs the sidecar store calls (default: `@telelean/core`'s; reviewer addition, test hook). */
export interface SidecarCore {
  parseAttemptLines: typeof parseAttemptLines;
  serializeAttemptLine: typeof serializeAttemptLine;
  summariseAttempts: typeof summariseAttempts;
  parseDecisionsFile: typeof parseDecisionsFile;
  serializeDecisionsFile: typeof serializeDecisionsFile;
  addDecisions: typeof addDecisions;
}

/** `.telelean/subjects/<S>/attempts.jsonl` and `decisions.json` (formats: core run.ts; paths: core paths.ts). */
export interface RunSidecarStore {
  /** Appends one line (O_APPEND; creates the subject's sidecar dir). */
  appendAttempt(root: string, record: AttemptRecord): Promise<void>;
  resolveAttempt(root: string, subject: string, resolution: AttemptResolution): Promise<void>;
  /** Read-modify-write with an atomic replace (temp file inside `.telelean/`, then rename). */
  recordDecisions(root: string, subject: string, records: readonly DecisionRecord[]): Promise<void>;
  readAttempts(root: string, subject: string): Promise<AttemptSummary[]>;
  readDecisions(root: string, subject: string): Promise<DecisionsFile>;
}
