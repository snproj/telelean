/**
 * The model workspace (WP-workspace): everything the extension host needs for one opted-in model root, without
 * importing vscode (03 section 6 "WorkspaceIndex"; docs/m1-plan.md sections 3, 7 and 8).
 *
 *   load()            scan `<library>.lean`, `<library>/**.lean`, `.telelean/` sidecars; parse with core
 *   graph(subject)    core.subjectGraph(project model built from the parsed files + the latest Lean facts)
 *   invalidate(paths) re-read changed files (open buffers first, via TextSource) and rebuild
 *   requestRefresh()  debounced, coalesced, one-at-a-time Lean refresh (semantic.refreshLeanFacts in runExclusive);
 *                     afterwards rewrites `.telelean/graph.json`
 *   perform(action)   core.planAction -> materialise sidecars (layout.json, attic) -> snapshot hand edits ("manual")
 *                     -> EditApplier.apply (the extension: WorkspaceEdit + save) -> snapshot the result -> push the
 *                     undo entry -> re-parse -> requestRefresh
 *   undo/redo         reverse/forward patches of the recorded whole-file changes (fuzzy, all-or-nothing)
 *   history           D-33: per-subject private git refs, revert (itself undoable and snapshotted), storage counter
 *
 * FROZEN CONTRACT (M1). WP-workspace owns this file; additive optional members only.
 */
import type {
  AcceptProposalAction,
  ActionOutcome,
  ArrowProvenance,
  AttemptLine,
  AttemptSummary,
  BoardAction,
  EditPlan,
  FileChange,
  GraphJson,
  GraphJsonOptions,
  HistoryActionKind,
  HistoryAvailability,
  HistoryDiff,
  HistoryListing,
  LeanFacts,
  ParsedFile,
  PlanContext,
  ProjectConfig,
  ProjectInput,
  ProjectModel,
  SemanticSummary,
  SubjectGraphOptions,
  SubjectInfo,
  TlGraph,
  WorkspaceState,
} from '@telelean/core';

import type { RefreshRequest } from '../semantic/types.js';

export interface Disposable {
  dispose(): void;
}

export type WorkspaceLog = (level: 'info' | 'warn' | 'error', message: string) => void;

/** Where the workspace reads model files from. The extension prefers open (possibly unsaved) editor buffers. */
export interface TextSource {
  /** The current text of a file (POSIX path relative to the root), or null when it does not exist. */
  read(path: string): Promise<string | null>;
}

/** How the workspace writes. The extension applies a WorkspaceEdit and saves; tests write to disk. */
export interface EditApplier {
  /**
   * Applies whole-file changes (create / replace / delete) and saves them, so they are normally on disk when it
   * resolves. A changed file that cannot be saved keeps the change in its editor buffer, which the TextSource reads
   * first, and `apply` still resolves: the change is applied, so the workspace records it for Undo, snapshots and
   * re-reads it (the extension tells the user to save that file).
   * First checks that every file's current text (open buffer first) still equals `before` (`null`: the file must
   * not exist); otherwise it rejects without applying anything (the workspace reports `conflict`). Rejects when
   * any change could not be applied; it should then leave nothing half-applied (the extension changes back what the
   * editor applied before it refused, or its error names the files left changed).
   */
  apply(changes: readonly FileChange[], label: string): Promise<void>;
}

export interface SemanticSettings {
  /** Lean checking on/off (off = syntactic mode). Default true. */
  enabled: boolean;
  /** runLean `MemoryMax=` (setting `telelean.memory.capGiB`, default 4 -> `4G`). */
  memoryMax: string;
  /** Memory guard (setting `telelean.memory.minAvailableGiB`, default 2). */
  minAvailableBytes: number;
  /** Debounce for requestRefresh, default 750 ms. */
  debounceMs: number;
}

export interface GitSettings {
  /** D-33 snapshots on/off (setting `telelean.git.snapshotRefs`, default true). */
  enabled: boolean;
  /** git executable (default `git` on PATH). */
  gitPath: string;
  /** Author/committer of snapshot commits (default `telelean <telelean@localhost>`). */
  author: { name: string; email: string };
}

export interface ModelWorkspaceOptions {
  /** Absolute path of the model root (holds `.telelean/config.json`). */
  root: string;
  text: TextSource;
  applier: EditApplier;
  semantic?: Partial<SemanticSettings>;
  git?: Partial<GitSettings>;
  log?: WorkspaceLog;
  now?: () => Date;
  /** Version string written into graph.json's generator. */
  generatorVersion?: string;
  /** Test hook: replaces semantic.refreshLeanFacts. */
  refreshFacts?: (request: RefreshRequest) => Promise<LeanFacts>;
  /**
   * Test hook (additive, M1 WP4): replaces some of the core functions the workspace calls (parse, build, graph,
   * plan, export), so the workspace can be tested with fakes while the core implementations are elsewhere.
   * Missing members default to `@telelean/core`'s.
   */
  core?: Partial<WorkspaceCore>;
}

/** The core functions a ModelWorkspace calls (all from `@telelean/core`; see `ModelWorkspaceOptions.core`). */
export interface WorkspaceCore {
  parseLeanFile(path: string, text: string): ParsedFile;
  buildProjectModel(input: ProjectInput): ProjectModel;
  subjectGraph(model: ProjectModel, subject: string, options: SubjectGraphOptions): TlGraph;
  planAction(model: ProjectModel, action: BoardAction, ctx: PlanContext): EditPlan;
  toGraphJson(model: ProjectModel, options: GraphJsonOptions): GraphJson;
  /** M2 (WP4, additive): the attempts.jsonl codec behind `TlGraph.attempts` (default: core's). */
  parseAttemptLines?(text: string): AttemptLine[];
  /** M2 (WP4, additive): records with their latest resolution, newest first (default: core's). */
  summariseAttempts?(lines: readonly AttemptLine[]): AttemptSummary[];
}

/**
 * M2 (WP4, docs/m2-plan.md section 7): whole-file changes made outside core's planner (an accepted proposal), applied
 * through the same recorded write path as an action: "Manual edits" / "Initial state" snapshots of the touched scopes
 * first, the EditApplier (its `before` check), an undo entry, the action's snapshot, re-read, graph.json, a Lean
 * refresh when model files changed.
 */
export interface ExternalChangeSet {
  /** History and Undo label (one line), e.g. `Formalize → proved: Cynder would not be a good addition…`. */
  label: string;
  action: HistoryActionKind | AcceptProposalAction;
  /** The subject whose undo stack records it (never ''). */
  subject: string;
  nodes: readonly string[];
  /**
   * `before` = the current text as the TextSource reads it (null: must not exist). Model files only, and (slice 2f,
   * docs/slice2-plan.md 2.6; additive) the subject's two sidecars an edit session's Apply writes: its `layout.json` (the
   * cards moved on the Proposed view) and its `endorsements.json` (D2-18). Anything else is refused (`unsafe`).
   */
  changes: readonly FileChange[];
  /**
   * (slice 2f, coverage audit G1; additive) An Apply's provenance: Claude's arrows it writes, recorded in its history
   * entry (`HistoryEntry.arrows`, shown under "Arrows from Claude").
   */
  arrows?: readonly ArrowProvenance[];
}

export interface WorkspaceChange {
  /** Subjects whose graph may have changed. */
  subjects: string[];
  /** The semantic state changed (checking / fresh / stale / failed / paused). */
  semantic: boolean;
  /** Subjects were added or removed. */
  subjectsListChanged: boolean;
}

export interface ModelWorkspace extends Disposable {
  readonly root: string;
  /** Scans and parses the model files (no Lean). Call once before anything else. */
  load(): Promise<void>;
  subjects(): SubjectInfo[];
  /** The board graph of one subject. Throws for an unknown subject. */
  graph(subject: string): TlGraph;
  /** Board-level state (subjects, undo/redo labels, history availability) for `subject`. */
  workspaceState(subject: string): Promise<WorkspaceState>;
  semantic(): SemanticSummary;
  /** Fired after anything that may change a graph or the semantic state. */
  onDidChange(listener: (change: WorkspaceChange) => void): Disposable;
  /** Files changed outside telelean's own edits (typing, saves, external tools): re-read and re-parse them. */
  invalidate(paths: readonly string[]): Promise<void>;
  /** Debounced, coalesced Lean refresh (one at a time per process). */
  requestRefresh(reason: string): void;
  /** A refresh now; resolves with the resulting state (the Refresh button, tests). */
  refreshNow(): Promise<SemanticSummary>;
  /** Plans, applies and records one action. Never throws for refusals: they are `ok: false` outcomes. */
  perform(action: BoardAction): Promise<ActionOutcome>;
  undo(subject: string): Promise<ActionOutcome>;
  redo(subject: string): Promise<ActionOutcome>;
  historyStatus(): Promise<HistoryAvailability>;
  listHistory(subject: string, limit?: number): Promise<HistoryListing>;
  historyDiff(subject: string, entryId: string, compare: 'parent' | 'current'): Promise<HistoryDiff>;
  /** Reverts the subject's files to an entry: snapshots the current state first, so the revert can be undone. */
  revert(subject: string, entryId: string): Promise<ActionOutcome>;
  /** Keeps the subject's last `keepLast` entries (rewrites its ref chain; git's own gc reclaims the space later). */
  prune(subject: string, keepLast: number): Promise<HistoryListing>;
  /** `git init` in the model root (only when it is not inside a repository), then starts the subjects' histories. */
  initGit(): Promise<HistoryAvailability>;

  // ---- M2 members (WP4; required since the M2 integration, docs/m2-plan.md section 11 step 2).

  /** Applies an accepted proposal (see ExternalChangeSet). Never throws for refusals (`ok: false` outcomes). */
  applyChanges(set: ExternalChangeSet): Promise<ActionOutcome>;
  /** The current text of a model or project file as the board sees it (open buffer first), null when missing. */
  readText(path: string): Promise<string | null>;
  /** The paths (root-relative POSIX) of every model file (`<library>.lean`, `<library>/**.lean`) and present project file. */
  modelFiles(): string[];
  /** The Lake library (`.telelean/config.json`). */
  library(): string;
  /** The project model behind the graphs (parsed files + the latest facts), for the context bundle. */
  projectModel(): ProjectModel;
  /**
   * Re-reads the subject's attempts.jsonl (after the run store appended to it) and republishes; `graph(subject)`
   * attaches them as `TlGraph.attempts` (core summariseAttempts), newest first.
   */
  reloadAttempts(subject: string): Promise<void>;
}

// ---------------------------------------------------------------------------------------------
// Initialize Model Here (D-28)

export type FolderInspection =
  /**
   * No files (hidden files and `.git` aside): scaffold everything. `gitignore` = the current `.gitignore` text when
   * one exists (planInitialize then appends only the missing lines, with `before` = this text).
   */
  | { kind: 'empty'; gitignore?: string }
  /** Already opted in. */
  | { kind: 'model'; config: ProjectConfig }
  /**
   * A Lake project with `lakefile.toml`, a `[[lean_lib]]`, `lake-manifest.json` and no Lake dependencies (no
   * `[[require]]`, manifest `packages` empty): only add `.telelean/` (and `.gitignore` lines). `subjects` = the
   * library's subdirectories whose names are subject names.
   */
  | { kind: 'lake-project'; library: string; subjects: string[]; gitignore?: string }
  /**
   * Anything else, with a user-facing reason: e.g. only a `lakefile.lean`, a `lakefile.toml` without
   * `[[lean_lib]]`, no `lake-manifest.json`, Lake dependencies such as Mathlib (explicit opt-in arrives in M4,
   * D-28), or other files in a folder without a lakefile. (A Lake project on another toolchain IS accepted: its
   * board runs in syntactic mode, D-7.)
   */
  | { kind: 'unsupported'; reason: string };

export interface InitializeOptions {
  /** The first subject (empty folders), e.g. `Spyro`. */
  subject: string;
  inspection: FolderInspection;
}
