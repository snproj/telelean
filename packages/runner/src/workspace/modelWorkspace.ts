/**
 * ModelWorkspace: one opted-in model root, without vscode (docs/m1-plan.md sections 2, 3, 4 and 8).
 *
 *   load()          config -> list `<library>.lean`, `<library>/**.lean`, `.telelean/subjects/<S>/layout.json`
 *                   -> read through the TextSource -> sha256 -> (lazily) core parseLeanFile, cached by path + hash;
 *                   then "Initial state" snapshots for chains that do not exist yet
 *   graph(S)        core.subjectGraph(core.buildProjectModel(files, hashes, facts, library), S, layout, semantic)
 *   invalidate      re-read changed files (latest read wins), drop deleted ones, fire onDidChange
 *   requestRefresh  debounce -> coalesce -> semantic.runExclusive(refreshLeanFacts) -> map the status
 *                   (./semanticSummary.ts) -> keep previous facts on failure -> rewrite .telelean/graph.json
 *   perform         planAction -> materialise sidecars -> "Manual edits" snapshots -> EditApplier.apply
 *                   -> action snapshots (not for layout-only) -> undo entry -> re-read -> graph.json -> refresh
 *   undo/redo       ./undo.ts, applied and snapshotted like actions ("Undo: …" / "Redo: …")
 *   history         ./history.ts (private refs; revert is snapshotted and undoable; prune; storage counter)
 *
 * M2 members (WP4, docs/m2-plan.md section 7):
 *   applyChanges    an accepted proposal's whole-file changes through the same recorded write path as perform
 *                   ("Manual edits"/"Initial state" snapshots first, EditApplier, one undo entry, the action snapshot
 *                   with history kind `accept-proposal`, re-read, graph.json, Lean refresh)
 *   readText        a model or project file through the TextSource (open buffers first)
 *   modelFiles      the model files the workspace knows plus the present project files (lakefile, toolchain, manifest)
 *   library, projectModel
 *   reloadAttempts  re-reads `.telelean/subjects/<S>/attempts.jsonl` (core parseAttemptLines + summariseAttempts);
 *                   graph(S) attaches them as `TlGraph.attempts`, newest first. The file is written by the run's
 *                   sidecar store, never by the EditApplier: it is not in snapshots and not undone.
 *
 * perform, undo, redo, revert, applyChanges, prune, initGit and the initial snapshots run one at a time in one queue.
 */
import { createHash } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  ActionError,
  attemptsPath,
  buildProjectModel,
  CONFIG_PATH,
  defaultProjectConfig,
  GRAPH_JSON_PATH,
  inScope,
  isSubjectName,
  layoutPath,
  parseAttemptLines,
  parseLayout,
  parseLeanFile,
  parseProjectConfig,
  planAction,
  subjectGraph,
  subjectSnapshotScope,
  summariseAttempts,
  TELELEAN_DIR,
  toGraphJson,
  type ActionOutcome,
  type AttemptSummary,
  type BoardAction,
  type BoardDiagnostic,
  type EditPlan,
  type FileChange,
  type HistoryActionKind,
  type HistoryAvailability,
  type HistoryDiff,
  type HistoryEntry,
  type HistoryListing,
  type Layout,
  type LeanFacts,
  type ParsedFile,
  type PlanContext,
  type ProjectConfig,
  type ProjectModel,
  type SemanticSummary,
  type SubjectInfo,
  type TlGraph,
  type WorkspaceState,
} from '@telelean/core';

import { refreshLeanFacts, runExclusive } from '../semantic/index.js';
import { DEFAULT_MIN_AVAILABLE_BYTES, DEFAULT_REFRESH_MEMORY_MAX, type RefreshRequest } from '../semantic/types.js';
import { noteRefreshOutput } from '../shadow/seed.js';
import {
  assertRelativePath,
  attemptsSubject,
  isModelFile,
  isSubjectScopeFile,
  layoutSubject,
  listLayoutFiles,
  listModelFiles,
  listScopeFiles,
  PROJECT_FILES,
  scopesOf,
  subjectNamesOf,
  toRelative,
} from './files.js';
import { HistoryStore, HistoryUnavailableError, type SnapshotFile, type SnapshotMeta, type SnapshotScope } from './history.js';
import { initGitRepository } from './initialize.js';
import { DROPS_FACTS, NO_FACTS_STATUSES, refreshDiagnostics, summarize, type RefreshRecord } from './semanticSummary.js';
import { materialisePlan } from './sidecars.js';
import type {
  Disposable,
  EditApplier,
  ExternalChangeSet,
  GitSettings,
  ModelWorkspace,
  ModelWorkspaceOptions,
  SemanticSettings,
  TextSource,
  WorkspaceChange,
  WorkspaceCore,
  WorkspaceLog,
} from './types.js';
import { applyBackwards, UndoStacks } from './undo.js';

export const DEFAULT_DEBOUNCE_MS = 750;
export const DEFAULT_HISTORY_LIMIT = 50;
export const MAX_HISTORY_LIMIT = 1000;
export const DEFAULT_SNAPSHOT_AUTHOR = { name: 'telelean', email: 'telelean@localhost' } as const;

let lastGraphVersion = 0;

/**
 * The next `TlGraph.version`: strictly increasing across subjects and across every workspace of this process, and
 * seeded from the clock so a re-created workspace (or a reloaded host) never goes back.
 */
export function nextGraphVersion(): number {
  lastGraphVersion = Math.max(lastGraphVersion + 1, Date.now());
  return lastGraphVersion;
}

let workspaceCounter = 0;
let graphJsonWrites = 0;

/** The lakefiles whose text feeds TL110 (`autoImplicit` on); Lake prefers lakefile.lean when both exist. */
const LAKEFILES = ['lakefile.lean', 'lakefile.toml'] as const;

interface ModelFile {
  path: string;
  text: string;
  hash: string;
}

interface LayoutFile {
  text: string;
  layout: Layout;
}

/** One write the workspace records (an action, an undo/redo step, a revert or an accepted proposal). */
interface RecordedOperation {
  changes: FileChange[];
  label: string;
  /** M2: includes `accept-proposal` (an accepted proposal). */
  action: HistoryActionKind;
  subject: string;
  nodes: readonly string[];
  /** Take the action snapshot after applying (false for layout-only operations). */
  snapshot: boolean;
  /**
   * Refuse (write nothing) when history is ready but the snapshot of the current state before the write fails: a
   * revert deletes and overwrites hand-made files, which must first be kept in history (A3), not only in the
   * in-memory undo stack.
   */
  requireBaseSnapshot?: boolean;
}

const DISPOSED: ActionOutcome = { ok: false, code: 'internal', error: 'The model workspace was closed.' };

/** WorkspaceCore with the M2 codec members resolved (their defaults are core's). */
type ResolvedCore = Required<WorkspaceCore>;

/** A subject's attempts as last read: the file's text (to skip re-parsing) and what the board lists. */
interface AttemptsEntry {
  text: string;
  summaries: AttemptSummary[];
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Defaults overridden only by the members that are actually set. */
function withDefaults<T extends object>(defaults: T, partial: Partial<T> | undefined): T {
  const out = { ...defaults };
  for (const [key, value] of Object.entries(partial ?? {})) if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  return out;
}

/** An ActionOutcome for a refusal or failure (never thrown to the caller). */
function refusal(error: unknown): ActionOutcome {
  if (error instanceof ActionError) {
    return { ok: false, code: error.code, error: error.message, ...(error.dependents.length > 0 ? { dependents: [...error.dependents] } : {}) };
  }
  return { ok: false, code: 'internal', error: errorMessage(error) };
}

/**
 * The subject whose undo stack records a plan. A board undoes on its own subject's stack, so a plan must never be
 * recorded under '' (EditPlan.subject allows '' for project-level changes): a new subject is undone from its own
 * board (the board switches to it), any other project-level plan from the subject of the layout it changes or of
 * the action's card.
 */
function undoSubject(plan: EditPlan, action: BoardAction): string {
  if (plan.subject !== '') return plan.subject;
  if (action.kind === 'create-subject') return action.name;
  if (plan.layout) return plan.layout.subject;
  if (action.kind === 'add-node') return action.subject;
  return plan.archive?.[0]?.subject ?? '';
}

/** `YYYY-MM-DD` in local time (for `asserted:`). */
function localDate(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `YYYY-MM-DD HH:MM` in local time (for revert labels). */
function localTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${localDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Files that differ between two path -> text maps, as changes from `before` to `after`, sorted by path. */
function diffFileMaps(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): FileChange[] {
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
  const out: FileChange[] = [];
  for (const rel of paths) {
    const b = before.get(rel) ?? null;
    const a = after.get(rel) ?? null;
    if (b !== a) out.push({ path: rel, before: b, after: a });
  }
  return out;
}

function scopeKey(scope: SnapshotScope): string {
  return scope.kind === 'project' ? '\0project' : scope.subject;
}

function scopeSubjectName(scope: SnapshotScope): string {
  return scope.kind === 'subject' ? scope.subject : '';
}

export class ModelWorkspaceImpl implements ModelWorkspace {
  readonly root: string;
  private readonly text: TextSource;
  private readonly applier: EditApplier;
  private readonly semanticSettings: SemanticSettings;
  private readonly gitSettings: GitSettings;
  private readonly log: WorkspaceLog;
  private readonly now: () => Date;
  private readonly generatorVersion: string;
  private readonly refreshFacts: (request: RefreshRequest) => Promise<LeanFacts>;
  private readonly core: ResolvedCore;
  private readonly history: HistoryStore;
  private readonly runIdBase: string;

  private config: ProjectConfig = defaultProjectConfig();
  private files = new Map<string, ModelFile>();
  private layouts = new Map<string, LayoutFile>();
  private lakefile: { path: string; text: string } | undefined;
  /** M2: the PROJECT_FILES that exist (TextSource), for modelFiles(). */
  private projectFiles = new Set<string>();
  /** M2: per subject, its attempts.jsonl as last read (absent: no file, or nothing readable in it). */
  private readonly attempts = new Map<string, AttemptsEntry>();
  private readonly parseCache = new Map<string, { hash: string; parsed: ParsedFile }>();
  private modelCache: ProjectModel | undefined;
  private readonly latestRead = new Map<string, number>();
  private readCounter = 0;

  private facts: LeanFacts | undefined;
  private lastRefresh: RefreshRecord | undefined;
  private refreshing = false;
  private phase: 'build' | 'check' | undefined;
  private refreshTimer: NodeJS.Timeout | undefined;
  private refreshRun: Promise<void> | undefined;
  private followUp: Promise<void> | undefined;
  private refreshAbort: AbortController | undefined;
  private refreshCount = 0;

  private readonly undoStacks = new UndoStacks();
  private readonly startedChains = new Set<string>();
  private historyError: string | undefined;

  private queue: Promise<unknown> = Promise.resolve();
  private graphJsonChain: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<(change: WorkspaceChange) => void>();
  private disposed = false;

  constructor(options: ModelWorkspaceOptions) {
    if (!path.isAbsolute(options.root)) throw new TypeError(`the model root must be an absolute path, got ${JSON.stringify(options.root)}`);
    this.root = path.resolve(options.root);
    this.text = options.text;
    this.applier = options.applier;
    this.semanticSettings = withDefaults<SemanticSettings>(
      { enabled: true, memoryMax: DEFAULT_REFRESH_MEMORY_MAX, minAvailableBytes: DEFAULT_MIN_AVAILABLE_BYTES, debounceMs: DEFAULT_DEBOUNCE_MS },
      options.semantic,
    );
    this.gitSettings = withDefaults<GitSettings>({ enabled: true, gitPath: 'git', author: { ...DEFAULT_SNAPSHOT_AUTHOR } }, options.git);
    this.log = options.log ?? (() => undefined);
    this.now = options.now ?? (() => new Date());
    this.generatorVersion = options.generatorVersion ?? '0.0.0';
    this.refreshFacts = options.refreshFacts ?? refreshLeanFacts;
    this.core = withDefaults<ResolvedCore>(
      { parseLeanFile, buildProjectModel, subjectGraph, planAction, toGraphJson, parseAttemptLines, summariseAttempts },
      options.core,
    );
    this.history = new HistoryStore({ root: this.root, gitPath: this.gitSettings.gitPath, author: this.gitSettings.author, now: this.now });
    this.runIdBase = `tlws${process.pid}_${++workspaceCounter}`;
  }

  // ------------------------------------------------------------------------------------------- files and graphs

  async load(): Promise<void> {
    this.config = await this.readConfig();
    await this.rescan();
    await Promise.all(this.subjectNames().map((subject) => this.loadAttempts(subject)));
    if (this.gitSettings.enabled && !this.disposed) await this.enqueue(() => this.startHistories(this.subjectNames()));
  }

  subjects(): SubjectInfo[] {
    return this.model().subjects.map((s) => ({ name: s.name, nodeCount: s.nodeCount, files: [...s.files] }));
  }

  graph(subject: string): TlGraph {
    const model = this.model();
    if (!model.subjects.some((s) => s.name === subject)) throw new Error(`unknown subject "${subject}" in ${this.root}`);
    const version = nextGraphVersion();
    const layout = this.layouts.get(subject)?.layout;
    const graph = this.core.subjectGraph(model, subject, { version, semantic: this.semantic(), ...(layout ? { layout } : {}) });
    const extra = this.workspaceDiagnostics();
    const attempts = this.attempts.get(subject)?.summaries;
    return {
      ...graph,
      version,
      diagnostics: extra.length > 0 ? [...graph.diagnostics, ...extra] : graph.diagnostics,
      ...(attempts !== undefined && attempts.length > 0 ? { attempts: attempts.map((a) => ({ ...a })) } : {}),
    };
  }

  async workspaceState(subject: string): Promise<WorkspaceState> {
    if (this.gitSettings.enabled && !this.disposed && this.subjectNames().includes(subject)) {
      await this.enqueue(() => this.startHistories([subject]));
    }
    let subjects: WorkspaceState['subjects'] = [];
    try {
      subjects = this.subjects().map((s) => ({ name: s.name, nodeCount: s.nodeCount }));
    } catch (error) {
      this.log('error', `cannot list the subjects of ${this.root}: ${errorMessage(error)}`);
    }
    const labels = this.undoStacks.labels(subject);
    return { rootName: path.basename(this.root), subjects, subject, undo: labels.undo, redo: labels.redo, history: await this.historyStatus() };
  }

  semantic(): SemanticSummary {
    return summarize({
      enabled: this.semanticSettings.enabled,
      running: this.refreshing,
      ...(this.phase ? { phase: this.phase } : {}),
      ...(this.lastRefresh ? { last: this.lastRefresh } : {}),
      ...(this.facts ? { facts: this.facts } : {}),
      fileHashes: this.fileHashes(),
    });
  }

  onDidChange(listener: (change: WorkspaceChange) => void): Disposable {
    this.listeners.add(listener);
    return { dispose: () => void this.listeners.delete(listener) };
  }

  async invalidate(paths: readonly string[]): Promise<void> {
    if (this.disposed) return;
    await this.reread(paths);
  }

  // ------------------------------------------------------------------------------------------- Lean refresh

  requestRefresh(reason: string): void {
    if (this.disposed || !this.semanticSettings.enabled) return;
    this.log('info', `Lean refresh requested (${reason})`);
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      void this.startRefresh();
    }, Math.max(0, this.semanticSettings.debounceMs));
    this.refreshTimer.unref?.();
  }

  async refreshNow(): Promise<SemanticSummary> {
    if (this.disposed || !this.semanticSettings.enabled) return this.semantic();
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    await this.startRefresh();
    return this.semantic();
  }

  // ------------------------------------------------------------------------------------------- actions and undo

  perform(action: BoardAction): Promise<ActionOutcome> {
    return this.enqueue(() => this.performNow(action));
  }

  undo(subject: string): Promise<ActionOutcome> {
    return this.enqueue(() => this.step('undo', subject));
  }

  redo(subject: string): Promise<ActionOutcome> {
    return this.enqueue(() => this.step('redo', subject));
  }

  // ------------------------------------------------------------------------------------------- history

  async historyStatus(): Promise<HistoryAvailability> {
    if (!this.gitSettings.enabled) return { state: 'disabled' };
    const availability = await this.history.availability();
    if (availability.state === 'ready' && this.historyError !== undefined) return { state: 'error', detail: this.historyError };
    return availability;
  }

  async listHistory(subject: string, limit: number = DEFAULT_HISTORY_LIMIT): Promise<HistoryListing> {
    const empty: HistoryListing = { subject, entries: [], storage: { subjectBytes: 0, totalBytes: 0, perSubject: {} }, more: false };
    if (!(await this.historyReady())) return empty;
    const capped = Math.min(Math.max(1, Math.floor(Number.isFinite(limit) ? limit : DEFAULT_HISTORY_LIMIT)), MAX_HISTORY_LIMIT);
    try {
      const { entries, more } = await this.history.list(subject, capped);
      const storage = await this.history.storage(subject);
      this.setHistoryError(undefined);
      return { subject, entries, storage, more };
    } catch (error) {
      this.setHistoryError(`listing the history failed: ${errorMessage(error)}`);
      return empty;
    }
  }

  async historyDiff(subject: string, entryId: string, compare: 'parent' | 'current'): Promise<HistoryDiff> {
    await this.requireHistory();
    const details = await this.history.entry(subject, entryId);
    if (!details) throw new ActionError('not-found', `${entryId} is not an entry of ${subject}'s history.`);
    const entryFiles = await this.history.treeFiles(details.tree);
    const covered = new Map([...entryFiles].filter(([rel]) => isSubjectScopeFile(rel, subject, this.config.library)));
    const files =
      compare === 'parent'
        ? diffFileMaps(details.parent ? await this.history.treeFiles(details.parent) : new Map<string, string>(), entryFiles)
        : diffFileMaps(covered, await this.readScopeMap({ kind: 'subject', subject }));
    const { tree: _tree, parent: _parent, ...entry } = details;
    return { entry: entry satisfies HistoryEntry, compare, files };
  }

  revert(subject: string, entryId: string): Promise<ActionOutcome> {
    return this.enqueue(() => this.revertNow(subject, entryId));
  }

  prune(subject: string, keepLast: number): Promise<HistoryListing> {
    if (!Number.isInteger(keepLast) || keepLast < 1) return Promise.reject(new TypeError(`keepLast must be a positive integer, got ${keepLast}`));
    return this.enqueue(async () => {
      if (await this.historyReady()) {
        try {
          await this.history.prune(subject, keepLast);
          this.setHistoryError(undefined);
        } catch (error) {
          this.setHistoryError(`pruning the history failed: ${errorMessage(error)}`);
        }
      }
      return this.listHistory(subject, Math.max(keepLast, DEFAULT_HISTORY_LIMIT));
    });
  }

  initGit(): Promise<HistoryAvailability> {
    return this.enqueue(async () => {
      if (!this.gitSettings.enabled) return { state: 'disabled' } as const;
      let availability = await this.history.availability();
      if (availability.state === 'no-repo') {
        try {
          await initGitRepository(this.root, this.gitSettings.gitPath);
        } catch (error) {
          return { state: 'error', detail: errorMessage(error) } as const;
        }
        this.history.reset();
        this.startedChains.clear();
        availability = await this.history.availability();
      }
      if (availability.state === 'ready') await this.startHistories(this.subjectNames());
      return this.historyStatus();
    });
  }

  // ------------------------------------------------------------------------------------------- M2 members (WP4)

  applyChanges(set: ExternalChangeSet): Promise<ActionOutcome> {
    return this.enqueue(() => this.applyChangesNow(set));
  }

  async readText(file: string): Promise<string | null> {
    const rel = toRelative(this.root, file);
    if (rel === undefined) throw new TypeError(`not a path inside the model root: ${JSON.stringify(file)}`);
    return this.text.read(rel);
  }

  modelFiles(): string[] {
    return [...new Set([...this.files.keys(), ...this.projectFiles])].sort();
  }

  library(): string {
    return this.config.library;
  }

  projectModel(): ProjectModel {
    return this.model();
  }

  async reloadAttempts(subject: string): Promise<void> {
    if (this.disposed) return;
    if (!isSubjectName(subject)) throw new TypeError(`not a subject name: ${JSON.stringify(subject)}`);
    await this.loadAttempts(subject);
    if (this.disposed) return;
    this.emit({ subjects: [subject], semantic: false, subjectsListChanged: false });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
    this.refreshAbort?.abort();
    this.listeners.clear();
  }

  // ===================================================================================== internals

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.queue.then(job, job);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private emit(change: WorkspaceChange): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(change);
      } catch (error) {
        this.log('error', `onDidChange listener failed: ${errorMessage(error)}`);
      }
    }
  }

  private async readConfig(): Promise<ProjectConfig> {
    const text = await this.text.read(CONFIG_PATH);
    if (text === null) {
      this.log('warn', `${CONFIG_PATH} is missing in ${this.root}; using the default library`);
      return defaultProjectConfig();
    }
    return parseProjectConfig(text);
  }

  /** Re-lists and re-reads every model file and layout. */
  private async rescan(): Promise<void> {
    const library = this.config.library;
    const [modelPaths, layoutPaths] = await Promise.all([listModelFiles(this.root, library), listLayoutFiles(this.root)]);
    const files = new Map<string, ModelFile>();
    const layouts = new Map<string, LayoutFile>();
    await Promise.all([
      ...modelPaths.map(async (rel) => {
        const text = await this.text.read(rel);
        if (text !== null) files.set(rel, { path: rel, text, hash: sha256(text) });
      }),
      ...layoutPaths.map(async (rel) => {
        const subject = layoutSubject(rel);
        const text = await this.text.read(rel);
        if (subject !== undefined && text !== null) layouts.set(subject, { text, layout: parseLayout(text) });
      }),
    ]);
    this.files = files;
    this.layouts = layouts;
    this.lakefile = await this.readLakefile();
    this.projectFiles = await this.presentProjectFiles();
    for (const rel of [...this.parseCache.keys()]) if (!files.has(rel)) this.parseCache.delete(rel);
    this.modelCache = undefined;
  }

  /** M2: which PROJECT_FILES exist, through the TextSource (an unreadable one counts as missing). */
  private async presentProjectFiles(): Promise<Set<string>> {
    const present = await Promise.all(PROJECT_FILES.map(async (rel) => ((await this.text.read(rel).catch(() => null)) !== null ? rel : undefined)));
    return new Set(present.filter((rel): rel is string => rel !== undefined));
  }

  /**
   * M2: (re)reads one subject's attempts.jsonl through the TextSource. A codec failure (a stub before integration,
   * a bug) is logged and leaves the subject without attempts: the board never fails because of this log file.
   */
  private async loadAttempts(subject: string): Promise<void> {
    let text: string | null;
    try {
      text = await this.text.read(attemptsPath(subject));
    } catch (error) {
      this.log('warn', `${attemptsPath(subject)} could not be read: ${errorMessage(error)}`);
      text = null;
    }
    if (text === null || text.trim() === '') {
      this.attempts.delete(subject);
      return;
    }
    if (this.attempts.get(subject)?.text === text) return;
    try {
      this.attempts.set(subject, { text, summaries: this.core.summariseAttempts(this.core.parseAttemptLines(text)) });
    } catch (error) {
      this.attempts.delete(subject);
      this.log('warn', `${attemptsPath(subject)} could not be read: ${errorMessage(error)}`);
    }
  }

  /** The project's lakefile through the TextSource (lakefile.lean first, as Lake does), for TL110. */
  private async readLakefile(): Promise<{ path: string; text: string } | undefined> {
    for (const rel of LAKEFILES) {
      const text = await this.text.read(rel).catch(() => null);
      if (text !== null) return { path: rel, text };
    }
    return undefined;
  }

  /** Reads one file; `latest` is false when a newer read of the same file started meanwhile (that one wins). */
  private async readTracked(rel: string): Promise<{ text: string | null; latest: boolean }> {
    const token = ++this.readCounter;
    this.latestRead.set(rel, token);
    const text = await this.text.read(rel);
    return { text, latest: this.latestRead.get(rel) === token };
  }

  private async reread(paths: readonly string[]): Promise<void> {
    const library = this.config.library;
    const before = this.subjectNames();
    const changed = { lean: false, config: false, lakefile: false, projectFiles: false, layouts: new Set<string>(), attempts: new Set<string>() };
    await Promise.all(
      paths.map(async (p) => {
        const rel = toRelative(this.root, p);
        if (rel === undefined) return;
        if (rel === CONFIG_PATH) {
          changed.config = true;
          return;
        }
        if (PROJECT_FILES.includes(rel)) changed.projectFiles = true;
        if ((LAKEFILES as readonly string[]).includes(rel)) {
          changed.lakefile = true;
          return;
        }
        const attemptsOf = attemptsSubject(rel);
        if (attemptsOf !== undefined) {
          changed.attempts.add(attemptsOf);
          return;
        }
        const model = isModelFile(rel, library);
        const subject = layoutSubject(rel);
        if (!model && subject === undefined) return;
        const { text, latest } = await this.readTracked(rel);
        if (!latest) return;
        if (model) {
          const old = this.files.get(rel);
          if (text === null) {
            if (old) {
              this.files.delete(rel);
              this.parseCache.delete(rel);
              changed.lean = true;
            }
          } else {
            const hash = sha256(text);
            if (old?.hash !== hash) {
              this.files.set(rel, { path: rel, text, hash });
              changed.lean = true;
            }
          }
        } else if (subject !== undefined) {
          const old = this.layouts.get(subject);
          if (text === null) {
            if (old) {
              this.layouts.delete(subject);
              changed.layouts.add(subject);
            }
          } else if (old?.text !== text) {
            this.layouts.set(subject, { text, layout: parseLayout(text) });
            changed.layouts.add(subject);
          }
        }
      }),
    );
    if (changed.config) {
      const config = await this.readConfig();
      if (config.library !== this.config.library) {
        this.config = config;
        await this.rescan();
        changed.lean = true;
      }
    }
    if (changed.lakefile) {
      const lakefile = await this.readLakefile();
      if (lakefile?.path !== this.lakefile?.path || lakefile?.text !== this.lakefile?.text) {
        this.lakefile = lakefile;
        changed.lean = true; // TL110 is a project-level diagnostic: every subject's board shows it
      }
    }
    if (changed.projectFiles) this.projectFiles = await this.presentProjectFiles();
    for (const subject of changed.attempts) await this.loadAttempts(subject);
    if (!changed.lean && changed.layouts.size === 0 && changed.attempts.size === 0) return;
    if (changed.lean || changed.layouts.size > 0) this.modelCache = undefined; // attempts do not change the model
    const after = this.subjectNames();
    this.emit({
      subjects: changed.lean ? [...new Set([...before, ...after])].sort() : [...new Set([...changed.layouts, ...changed.attempts])].sort(),
      semantic: false,
      subjectsListChanged: before.join('\n') !== after.join('\n'),
    });
  }

  private subjectNames(): string[] {
    return subjectNamesOf(this.files.keys(), this.config.library);
  }

  private fileHashes(): Record<string, string> {
    const hashes: Record<string, string> = {};
    for (const file of [...this.files.values()].sort((a, b) => (a.path < b.path ? -1 : 1))) hashes[file.path] = file.hash;
    return hashes;
  }

  private parsed(file: ModelFile): ParsedFile {
    const cached = this.parseCache.get(file.path);
    if (cached?.hash === file.hash) return cached.parsed;
    const parsed = this.core.parseLeanFile(file.path, file.text);
    this.parseCache.set(file.path, { hash: file.hash, parsed });
    return parsed;
  }

  /** The project model of the current files and facts (rebuilt only after something changed). */
  private model(): ProjectModel {
    if (this.modelCache) return this.modelCache;
    const files = [...this.files.values()].sort((a, b) => (a.path < b.path ? -1 : 1)).map((f) => this.parsed(f));
    this.modelCache = this.core.buildProjectModel({
      files,
      fileHashes: this.fileHashes(),
      library: this.config.library,
      ...(this.facts ? { facts: this.facts } : {}),
      ...(this.lakefile ? { lakefile: this.lakefile } : {}),
    });
    return this.modelCache;
  }

  private workspaceDiagnostics(): BoardDiagnostic[] {
    const out = refreshDiagnostics(this.lastRefresh);
    if (this.historyError !== undefined) out.push({ code: 'TL202', severity: 'warning', message: `History: ${this.historyError}` });
    return out;
  }

  private planContext(): PlanContext {
    const now = this.now();
    const layouts: Record<string, Layout> = {};
    for (const [subject, file] of this.layouts) layouts[subject] = file.layout;
    return { today: localDate(now), now: now.toISOString(), layouts };
  }

  /**
   * `.telelean/graph.json` from core's export (direct write: it is gitignored and not a model file). Writes are
   * serialised (the latest state is written last) and atomic (a temp file per write, then rename).
   */
  private writeGraphJson(): Promise<void> {
    const write = async (): Promise<void> => {
      if (this.disposed) return;
      const target = path.join(this.root, GRAPH_JSON_PATH);
      const temp = `${target}.${process.pid}-${++graphJsonWrites}.tmp`;
      try {
        const json = this.core.toGraphJson(this.model(), {
          generatorVersion: this.generatorVersion,
          generatedAt: this.now().toISOString(),
          fileHashes: this.fileHashes(),
        });
        const extra = this.workspaceDiagnostics().map((d) => ({ code: d.code, severity: d.severity, message: d.message, file: null, range: null, node_id: null }));
        const out = extra.length > 0 ? { ...json, diagnostics: [...json.diagnostics, ...extra] } : json;
        await mkdir(path.join(this.root, TELELEAN_DIR), { recursive: true });
        await writeFile(temp, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
        await rename(temp, target);
      } catch (error) {
        await rm(temp, { force: true }).catch(() => undefined);
        this.log('warn', `${GRAPH_JSON_PATH} was not written: ${errorMessage(error)}`);
      }
    };
    const run = this.graphJsonChain.then(write, write);
    this.graphJsonChain = run;
    return run;
  }

  // ------------------------------------------------------------------------------------------- refresh internals

  /** Runs a refresh now, or (one is running) one more right after it, shared by every caller meanwhile. */
  private startRefresh(): Promise<void> {
    if (this.refreshRun) {
      const after = (): Promise<void> => {
        this.followUp = undefined;
        return this.startRefresh();
      };
      this.followUp ??= this.refreshRun.then(after, after);
      return this.followUp;
    }
    const run = this.runRefresh().finally(() => {
      if (this.refreshRun === run) this.refreshRun = undefined;
    });
    this.refreshRun = run;
    return run;
  }

  private async runRefresh(): Promise<void> {
    if (this.disposed) return;
    const abort = new AbortController();
    this.refreshAbort = abort;
    this.refreshing = true;
    this.phase = undefined;
    this.emit({ subjects: this.subjectNames(), semantic: true, subjectsListChanged: false });
    let record: RefreshRecord;
    let facts: LeanFacts | undefined;
    let started = Date.now();
    try {
      facts = await runExclusive(async () => {
        started = Date.now();
        if (abort.signal.aborted) throw new Error('the workspace was closed');
        let result: LeanFacts | undefined;
        try {
          result = await this.refreshFacts({
            root: this.root,
            library: this.config.library,
            runId: `${this.runIdBase}_${++this.refreshCount}`,
            signal: abort.signal,
            memoryMax: this.semanticSettings.memoryMax,
            minAvailableBytes: this.semanticSettings.minAvailableBytes,
            now: this.now,
            onPhase: (phase) => {
              if (this.disposed || this.refreshAbort !== abort) return;
              this.phase = phase;
              this.emit({ subjects: this.subjectNames(), semantic: true, subjectsListChanged: false });
            },
          });
          return result;
        } finally {
          // Still inside this refresh's Lean job: after a successful refresh, record what .lake/build holds now
          // (another program's writes during the refresh included), the only tree a run may seed its working copy
          // from (closing round 1, `telelean.run.reuseLeanBuild`, off by default; shadow/seed.ts); any other outcome
          // forgets the record.
          await noteRefreshOutput(this.root, abort.signal.aborted ? undefined : result);
        }
      });
      record = {
        status: facts.status,
        durationMs: Date.now() - started,
        ...(facts.detail ? { detail: facts.detail } : {}),
        ...(facts.toolchain ? { toolchain: facts.toolchain } : {}),
      };
    } catch (error) {
      facts = undefined;
      record = { status: 'error', detail: errorMessage(error), durationMs: Date.now() - started };
    }
    if (this.refreshAbort === abort) this.refreshAbort = undefined;
    this.refreshing = false;
    this.phase = undefined;
    if (this.disposed) return;
    this.lastRefresh = record;
    if (facts && !NO_FACTS_STATUSES.has(facts.status)) {
      this.facts = facts;
      this.modelCache = undefined;
    } else if (facts && DROPS_FACTS.has(facts.status)) {
      // Another toolchain, or a project M1 cannot check: the old facts no longer describe it (D-7 syntactic mode).
      if (this.facts) this.log('info', `Lean refresh: ${record.status}; the board is syntactic until the project can be checked again`);
      this.facts = undefined;
      this.modelCache = undefined;
    } else if (record.status !== 'ok') {
      this.log('warn', `Lean refresh: ${record.status}${record.detail ? ` (${record.detail})` : ''}; keeping the previous facts`);
    }
    await this.writeGraphJson();
    this.emit({ subjects: this.subjectNames(), semantic: true, subjectsListChanged: false });
  }

  // ------------------------------------------------------------------------------------------- action internals

  private async performNow(action: BoardAction): Promise<ActionOutcome> {
    if (this.disposed) return DISPOSED;
    let plan: EditPlan;
    let changes: FileChange[];
    try {
      plan = this.core.planAction(this.model(), action, this.planContext());
      changes = await materialisePlan(plan, (rel) => this.text.read(rel), this.now().toISOString());
    } catch (error) {
      return refusal(error);
    }
    const nodeId = plan.nodeId !== undefined ? { nodeId: plan.nodeId } : {};
    if (changes.length === 0) return { ok: true, label: plan.label, undoable: false, ...nodeId };
    const layoutOnly = plan.layoutOnly === true;
    const subject = undoSubject(plan, action);
    const entry = { label: plan.label, subject, nodes: [...plan.nodes], changes, layoutOnly };
    const failed = await this.applyRecorded(
      { changes, label: plan.label, action: plan.action, subject, nodes: plan.nodes, snapshot: !layoutOnly },
      () => this.undoStacks.record(entry),
    );
    return failed ?? { ok: true, label: plan.label, undoable: true, ...nodeId };
  }

  /**
   * Undo (or Redo) of the subject's top entry. The outcome of an undo is not `undoable` (an Undo button on its
   * toast would undo the next older entry; Redo is the way back); the outcome of a redo is.
   */
  private async step(kind: 'undo' | 'redo', subject: string): Promise<ActionOutcome> {
    if (this.disposed) return DISPOSED;
    const entry = this.undoStacks.peek(kind, subject);
    if (!entry) return { ok: false, code: 'not-found', error: kind === 'undo' ? 'Nothing to undo.' : 'Nothing to redo.' };
    const label = `${kind === 'undo' ? 'Undo' : 'Redo'}: ${entry.label}`;
    let applied: FileChange[];
    try {
      const backwards = await applyBackwards(entry.changes, (rel) => this.text.read(rel));
      if (!backwards.ok) return { ok: false, code: 'conflict', error: `${backwards.path} changed since; use History to revert` };
      applied = backwards.changes;
    } catch (error) {
      return refusal(error);
    }
    const done = { ok: true, label, undoable: kind === 'redo' } as const;
    if (applied.length === 0) {
      this.undoStacks.move(kind, subject, applied);
      return done;
    }
    const failed = await this.applyRecorded(
      { changes: applied, label, action: kind, subject, nodes: entry.nodes, snapshot: !entry.layoutOnly },
      () => this.undoStacks.move(kind, subject, applied),
    );
    return failed ?? done;
  }

  /**
   * M2: an accepted proposal's changes through the recorded write path (see applyRecorded): only model files, each
   * path once, every path inside the root; no-op changes dropped; nothing to write -> `ok`, not undoable.
   */
  private async applyChangesNow(set: ExternalChangeSet): Promise<ActionOutcome> {
    if (this.disposed) return DISPOSED;
    const library = this.config.library;
    if (typeof set.subject !== 'string' || !isSubjectName(set.subject)) {
      return { ok: false, code: 'invalid', error: `An accepted proposal needs the subject whose Undo records it (got ${JSON.stringify(set.subject)}).` };
    }
    const label = set.label.replace(/[\r\n]+/g, ' ').trim() || 'Formalize for dependencies';
    const seen = new Set<string>();
    const changes: FileChange[] = [];
    for (const change of set.changes) {
      try {
        assertRelativePath(change.path);
      } catch (error) {
        return { ok: false, code: 'unsafe', error: `Nothing was changed: ${errorMessage(error)}` };
      }
      if (!isModelFile(change.path, library)) {
        return { ok: false, code: 'unsafe', error: `Nothing was changed: ${change.path} is not a model file, and Accept changes only model files.` };
      }
      if (seen.has(change.path)) return { ok: false, code: 'invalid', error: `Nothing was changed: the proposal changes ${change.path} twice.` };
      seen.add(change.path);
      if (change.before !== change.after) changes.push({ path: change.path, before: change.before, after: change.after });
    }
    if (changes.length === 0) return { ok: true, label, undoable: false };
    const nodes = [...set.nodes];
    const entry = { label, subject: set.subject, nodes, changes, layoutOnly: false };
    const failed = await this.applyRecorded({ changes, label, action: set.action, subject: set.subject, nodes, snapshot: true }, () => this.undoStacks.record(entry));
    return failed ?? { ok: true, label, undoable: true };
  }

  private async revertNow(subject: string, entryId: string): Promise<ActionOutcome> {
    if (this.disposed) return DISPOSED;
    let changes: FileChange[];
    let label: string;
    try {
      await this.requireHistory();
      const details = await this.history.entry(subject, entryId);
      if (!details) return { ok: false, code: 'not-found', error: `${entryId} is not an entry of ${subject}'s history.` };
      const scope = subjectSnapshotScope(subject, this.config.library);
      const target = new Map<string, string>();
      for (const [rel, text] of await this.history.treeFiles(details.tree)) {
        // Only the files snapshots cover now (an older snapshot may hold other sidecar files, e.g. a binary one).
        if (!inScope(rel, scope) || !isSubjectScopeFile(rel, subject, this.config.library)) continue;
        assertRelativePath(rel); // a tree telelean did not write could name paths outside the root
        target.set(rel, text);
      }
      changes = diffFileMaps(await this.readScopeMap({ kind: 'subject', subject }), target);
      label = `Revert to: ${details.label} (${localTime(details.time)})`;
    } catch (error) {
      return error instanceof TypeError ? { ok: false, code: 'unsafe', error: error.message } : refusal(error);
    }
    if (changes.length === 0) return { ok: true, label: `Nothing to revert: ${subject} already matches that entry`, undoable: false };
    const entry = { label, subject, nodes: [], changes, layoutOnly: false };
    const failed = await this.applyRecorded({ changes, label, action: 'revert', subject, nodes: [], snapshot: true, requireBaseSnapshot: true }, () =>
      this.undoStacks.record(entry),
    );
    return failed ?? { ok: true, label, undoable: true };
  }

  /**
   * The common write path: "Manual edits"/"Initial state" snapshots of the touched scopes, the EditApplier (its
   * rejection becomes `conflict` and nothing is recorded), `recordUndo` right after a successful apply, then the
   * action snapshots, re-reading the files, graph.json and a Lean refresh when model files changed. Returns an
   * outcome only when nothing was applied; nothing after a successful apply can turn it into a failure.
   */
  private async applyRecorded(op: RecordedOperation, recordUndo: () => void): Promise<ActionOutcome | undefined> {
    const library = this.config.library;
    const paths = op.changes.map((c) => c.path);
    const scopes = scopesOf(paths, library);
    const history = await this.historyReady();
    if (history) {
      for (const scope of scopes) {
        const problem = await this.snapshotBase(scope);
        if (problem !== undefined && op.requireBaseSnapshot) {
          return {
            ok: false,
            code: 'no-history',
            error: `Nothing was changed: telelean could not first snapshot the current state of ${scope.kind === 'subject' ? scope.subject : 'the project files'} (${problem}). Fix that and try again.`,
          };
        }
      }
    }
    try {
      await this.applier.apply(op.changes, op.label);
    } catch (error) {
      return { ok: false, code: error instanceof ActionError ? error.code : 'conflict', error: errorMessage(error) };
    }
    recordUndo();
    try {
      if (history && op.snapshot) {
        for (const scope of scopes) {
          await this.snapshotScope(scope, { label: op.label, action: op.action, subject: scope.kind === 'subject' ? scope.subject : op.subject, nodes: op.nodes });
        }
      }
      await this.reread(paths);
    } catch (error) {
      this.log('error', `after applying "${op.label}": ${errorMessage(error)}`);
    }
    await this.writeGraphJson();
    if (paths.some((rel) => isModelFile(rel, library))) this.requestRefresh('edit');
    return undefined;
  }

  // ------------------------------------------------------------------------------------------- history internals

  private async historyReady(): Promise<boolean> {
    if (!this.gitSettings.enabled || this.disposed) return false;
    return (await this.history.availability()).state === 'ready';
  }

  private async requireHistory(): Promise<void> {
    if (!this.gitSettings.enabled) throw new ActionError('no-history', 'History is switched off (telelean.git.snapshotRefs).');
    try {
      await this.history.repository();
    } catch (error) {
      if (error instanceof HistoryUnavailableError) throw new ActionError('no-history', error.message);
      throw error;
    }
  }

  private setHistoryError(detail: string | undefined): void {
    if (detail === this.historyError) return;
    this.historyError = detail;
    if (detail !== undefined) this.log('warn', `history: ${detail}`);
    this.emit({ subjects: this.subjectNames(), semantic: false, subjectsListChanged: false });
  }

  /** The scope's current files (fs listing, TextSource contents). */
  private async readScope(scope: SnapshotScope): Promise<SnapshotFile[]> {
    const out: SnapshotFile[] = [];
    for (const rel of await listScopeFiles(this.root, scope, this.config.library)) {
      const text = await this.text.read(rel);
      if (text !== null) out.push({ path: rel, text });
    }
    return out;
  }

  private async readScopeMap(scope: SnapshotScope): Promise<Map<string, string>> {
    return new Map((await this.readScope(scope)).map((f) => [f.path, f.text]));
  }

  /** Commits the scope's current files (no-op when unchanged); failures become the TL202 history error. */
  private async snapshotScope(scope: SnapshotScope, meta: SnapshotMeta): Promise<void> {
    try {
      await this.history.snapshot(scope, await this.readScope(scope), meta);
      this.startedChains.add(scopeKey(scope));
      this.setHistoryError(undefined);
    } catch (error) {
      this.setHistoryError(`snapshot "${meta.label}" failed: ${errorMessage(error)}`);
    }
  }

  /**
   * Before a write: the scope's current state as "Initial state" (no chain yet) or "Manual edits" (hand edits since
   * the tip). For "Manual edits" a subject's layout.json is taken from the tip: telelean's own layout-only changes
   * are not snapshotted on their own (docs/m1-plan.md section 8), so they ride along with the next action snapshot
   * instead of passing for hand edits (a hand-edited layout.json rides along the same way).
   */
  /** Returns why the snapshot failed (it is also the TL202 history error), or undefined when the state is kept. */
  private async snapshotBase(scope: SnapshotScope): Promise<string | undefined> {
    const subject = scopeSubjectName(scope);
    try {
      const tip = await this.history.tip(scope);
      const files = await this.readScope(scope);
      if (tip === undefined) {
        await this.history.snapshot(scope, files, { label: 'Initial state', action: 'initial', subject, nodes: [] });
      } else {
        const view = scope.kind === 'subject' ? await this.withTipLayout(scope.subject, files, tip) : files;
        await this.history.snapshot(scope, view, { label: 'Manual edits', action: 'manual', subject, nodes: [] });
      }
      this.startedChains.add(scopeKey(scope));
      this.setHistoryError(undefined);
      return undefined;
    } catch (error) {
      this.setHistoryError(`snapshot of the hand edits failed: ${errorMessage(error)}`);
      return errorMessage(error);
    }
  }

  /** `files` with the subject's layout.json as it is at `tip` (dropped when the tip has none). */
  private async withTipLayout(subject: string, files: readonly SnapshotFile[], tip: string): Promise<SnapshotFile[]> {
    const rel = layoutPath(subject);
    const atTip = await this.history.fileAt(tip, rel);
    const rest = files.filter((f) => f.path !== rel);
    return atTip === undefined ? rest : [...rest, { path: rel, text: atTip }];
  }

  /** "Initial state" for each given subject chain (and the project chain) that does not exist yet. */
  private async startHistories(subjects: readonly string[]): Promise<void> {
    if (!(await this.historyReady())) return;
    const scopes: SnapshotScope[] = [...subjects.map((subject): SnapshotScope => ({ kind: 'subject', subject })), { kind: 'project' }];
    for (const scope of scopes) {
      if (this.startedChains.has(scopeKey(scope))) continue;
      try {
        if ((await this.history.tip(scope)) === undefined) {
          await this.snapshotScope(scope, { label: 'Initial state', action: 'initial', subject: scopeSubjectName(scope), nodes: [] });
        } else {
          this.startedChains.add(scopeKey(scope));
        }
      } catch (error) {
        this.setHistoryError(`starting the history failed: ${errorMessage(error)}`);
      }
    }
  }
}

export function createWorkspace(options: ModelWorkspaceOptions): ModelWorkspace {
  return new ModelWorkspaceImpl(options);
}
