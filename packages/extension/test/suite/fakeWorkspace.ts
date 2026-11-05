/**
 * A small working stand-in for the runner's ModelWorkspace (WP4) and its Initialize helpers, for the smoke suites
 * that run before integration. It plans real file changes and writes them through the extension's own TextSource
 * and EditApplier (so VS Code's WorkspaceEdit, saves, created folders and deletions are exercised for real), keeps an
 * undo stack and an in-memory history, and derives the board from the Spyro sample plus the blocks in each subject's
 * Inbox. No Lean, no git.
 */
import {
  buildProjectModel,
  defaultProjectConfig,
  emptyLayout,
  layoutPath,
  serializeLayout,
  serializeProjectConfig,
  spyroGraph,
  SUBJECT_NAME_PATTERN,
  subjectScaffold,
  type ActionOutcome,
  type BoardAction,
  type FileChange,
  type HistoryActionKind,
  type HistoryAvailability,
  type HistoryDiff,
  type HistoryListing,
  type NodeType,
  type ProjectModel,
  type SemanticSummary,
  type SubjectInfo,
  type TlGraph,
  type TlNode,
  type WorkspaceState,
} from '@telelean/core';
import type {
  Disposable,
  ExternalChangeSet,
  FolderInspection,
  InitializeOptions,
  ModelWorkspace,
  ModelWorkspaceOptions,
  WorkspaceChange,
} from '@telelean/runner/workspace/index.js';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import * as path from 'node:path';

interface Entry {
  id: string;
  time: string;
  action: HistoryActionKind;
  label: string;
  subject: string;
  changes: FileChange[];
}

const errorOutcome = (error: unknown): ActionOutcome => {
  const code = (error as { code?: unknown } | null)?.code;
  return {
    ok: false,
    code: typeof code === 'string' ? (code as Extract<ActionOutcome, { ok: false }>['code']) : 'internal',
    error: error instanceof Error ? error.message : String(error),
  };
};

const hex = () => Math.floor(Math.random() * 2 ** 48).toString(16).padStart(12, '0');

export class FakeModelWorkspace implements ModelWorkspace {
  static readonly instances: FakeModelWorkspace[] = [];
  readonly root: string;
  readonly refreshRequests: string[] = [];
  readonly invalidations: string[][] = [];
  refreshNowCalls = 0;
  private names: string[] = [];
  private inbox = new Map<string, TlNode[]>();
  private readonly undoStack: Entry[] = [];
  private readonly redoStack: Entry[] = [];
  private readonly history: Entry[] = [];
  private gitReady = false;
  private version = Date.now();
  private readonly listeners = new Set<(change: WorkspaceChange) => void>();
  private disposed = false;

  constructor(readonly options: ModelWorkspaceOptions) {
    this.root = options.root;
    FakeModelWorkspace.instances.push(this);
  }

  async load(): Promise<void> {
    await this.rescan();
  }

  subjects(): SubjectInfo[] {
    return this.names.map((name) => ({ name, nodeCount: this.nodesOf(name).length, files: [`Model/${name}/Inbox.lean`] }));
  }

  graph(subject: string): TlGraph {
    if (!this.names.includes(subject)) throw new Error(`unknown subject ${subject}`);
    const base = spyroGraph();
    return { ...base, subject, nodes: this.nodesOf(subject), version: ++this.version, semantic: this.semantic() };
  }

  async workspaceState(subject: string): Promise<WorkspaceState> {
    const undo = [...this.undoStack].reverse().find((e) => e.subject === subject)?.label ?? null;
    const redo = [...this.redoStack].reverse().find((e) => e.subject === subject)?.label ?? null;
    return {
      rootName: path.basename(this.root),
      subjects: this.subjects().map((s) => ({ name: s.name, nodeCount: s.nodeCount })),
      subject,
      undo,
      redo,
      history: await this.historyStatus(),
    };
  }

  semantic(): SemanticSummary {
    return { state: 'unavailable', detail: 'fake workspace (no Lean)' };
  }

  onDidChange(listener: (change: WorkspaceChange) => void): Disposable {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  async invalidate(paths: readonly string[]): Promise<void> {
    this.invalidations.push([...paths]);
    await this.rescan();
    this.fire(this.names, false);
  }

  requestRefresh(reason: string): void {
    this.refreshRequests.push(reason);
  }

  async refreshNow(): Promise<SemanticSummary> {
    this.refreshNowCalls++;
    this.fire(this.names, true);
    return this.semantic();
  }

  async perform(action: BoardAction): Promise<ActionOutcome> {
    switch (action.kind) {
      case 'add-node':
        return this.addNode(action.subject, action.type, action.naturalName);
      case 'create-subject':
        return this.createSubject(action.name);
      default:
        return { ok: true, label: `(fake) ${action.kind}`, undoable: false };
    }
  }

  async undo(subject: string): Promise<ActionOutcome> {
    const index = this.undoStack.map((e) => e.subject).lastIndexOf(subject);
    const entry = index >= 0 ? this.undoStack[index] : undefined;
    if (!entry) return { ok: false, code: 'not-found', error: 'Nothing to undo.' };
    const reverse = entry.changes.map((c) => ({ path: c.path, before: c.after, after: c.before }));
    const outcome = await this.apply(reverse, `Undo: ${entry.label}`, 'undo', subject, entry.subject);
    if (outcome.ok) {
      this.undoStack.splice(index, 1);
      this.redoStack.push(entry);
    }
    return outcome;
  }

  async redo(subject: string): Promise<ActionOutcome> {
    const index = this.redoStack.map((e) => e.subject).lastIndexOf(subject);
    const entry = index >= 0 ? this.redoStack[index] : undefined;
    if (!entry) return { ok: false, code: 'not-found', error: 'Nothing to redo.' };
    const outcome = await this.apply(entry.changes, `Redo: ${entry.label}`, 'redo', subject, entry.subject);
    if (outcome.ok) {
      this.redoStack.splice(index, 1);
      this.undoStack.push(entry);
    }
    return outcome;
  }

  async historyStatus(): Promise<HistoryAvailability> {
    return this.gitReady ? { state: 'ready' } : { state: 'no-repo' };
  }

  async listHistory(subject: string, limit = 50): Promise<HistoryListing> {
    if (!this.gitReady) throw Object.assign(new Error('no repository'), { code: 'no-history' });
    const entries = this.history
      .filter((e) => e.subject === subject)
      .reverse()
      .map(({ id, time, action, label, subject: s }) => ({ id, time, action, label, subject: s, nodes: [] }));
    const bytes = entries.length * 100;
    return { subject, entries: entries.slice(0, limit), storage: { subjectBytes: bytes, totalBytes: bytes, perSubject: { [subject]: bytes } }, more: entries.length > limit };
  }

  async historyDiff(subject: string, entryId: string, compare: 'parent' | 'current'): Promise<HistoryDiff> {
    const entry = this.history.find((e) => e.id === entryId && e.subject === subject);
    if (!entry) throw Object.assign(new Error(`no history entry ${entryId}`), { code: 'not-found' });
    return { entry: { id: entry.id, time: entry.time, action: entry.action, label: entry.label, subject, nodes: [] }, compare, files: entry.changes };
  }

  /** Reverts the files the later entries of this subject touched to their state right after `entryId`. */
  async revert(subject: string, entryId: string): Promise<ActionOutcome> {
    const index = this.history.findIndex((e) => e.id === entryId && e.subject === subject);
    if (index < 0) return { ok: false, code: 'not-found', error: `no history entry ${entryId}` };
    const target = new Map<string, string | null>();
    for (const later of this.history.slice(index + 1).filter((e) => e.subject === subject)) {
      for (const change of later.changes) if (!target.has(change.path)) target.set(change.path, change.before);
    }
    const changes: FileChange[] = [];
    for (const [file, after] of target) changes.push({ path: file, before: await this.options.text.read(file), after });
    const label = `Revert to: ${this.history[index]?.label ?? entryId}`;
    return this.apply(changes, label, 'revert', subject, subject, true);
  }

  async prune(subject: string, keepLast: number): Promise<HistoryListing> {
    const mine = this.history.filter((e) => e.subject === subject);
    for (const entry of mine.slice(0, Math.max(0, mine.length - keepLast))) this.history.splice(this.history.indexOf(entry), 1);
    return this.listHistory(subject);
  }

  async initGit(): Promise<HistoryAvailability> {
    this.gitReady = true;
    for (const name of this.names) this.history.push({ id: hex(), time: new Date().toISOString(), action: 'initial', label: 'Initial state', subject: name, changes: [] });
    this.fire([], false);
    return { state: 'ready' };
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  // M2 members (optional in the type until integration makes them required). The fake has no Claude runs
  // (FAKE_RUNNER refuses to create a RunManager for it), so Accept never reaches applyChanges here.

  async applyChanges(set: ExternalChangeSet): Promise<ActionOutcome> {
    return { ok: false, code: 'not-yet', error: `the fake model workspace cannot apply "${set.label}"` };
  }

  async readText(file: string): Promise<string | null> {
    return this.options.text.read(file);
  }

  modelFiles(): string[] {
    return ['Model.lean', ...this.names.flatMap((name) => [`Model/${name}.lean`, `Model/${name}/Inbox.lean`])];
  }

  library(): string {
    return 'Model';
  }

  projectModel(): ProjectModel {
    return buildProjectModel({ files: [], fileHashes: {}, library: 'Model' });
  }

  async reloadAttempts(subject: string): Promise<void> {
    void subject;
  }

  // ---------------------------------------------------------------------------------------------

  private nodesOf(subject: string): TlNode[] {
    const base = subject === 'Spyro' ? spyroGraph().nodes : [];
    return [...base, ...(this.inbox.get(subject) ?? [])];
  }

  private async addNode(subject: string, type: NodeType, naturalName: string): Promise<ActionOutcome> {
    if (!this.names.includes(subject)) return { ok: false, code: 'not-found', error: `no subject ${subject}` };
    const file = `Model/${subject}/Inbox.lean`;
    const before = await this.options.text.read(file);
    const scaffold = subjectScaffold(subject, 'Model').find((f) => f.path === file)?.text ?? `namespace ${subject}\n\nend ${subject}\n`;
    const current = before ?? scaffold;
    const taken = new Set(this.nodesOf(subject).map((n) => n.id));
    const slug = naturalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'node';
    let id = slug;
    for (let i = 2; taken.has(id); i++) id = `${slug}-${i}`;
    const block = `/-\n@@ telelean v1\nid: ${id}\ntype: ${type}\nnatural_name: ${naturalName}\n-/\n\n`;
    const end = current.lastIndexOf(`end ${subject}`);
    const after = end >= 0 ? `${current.slice(0, end)}${block}${current.slice(end)}` : `${current}\n${block}`;
    const label = `Add ${type.toLowerCase()}: ${naturalName}`;
    const outcome = await this.apply([{ path: file, before, after }], label, 'add-node', subject, subject, true);
    return outcome.ok ? { ...outcome, nodeId: id } : outcome;
  }

  private async createSubject(name: string): Promise<ActionOutcome> {
    if (this.names.includes(name)) return { ok: false, code: 'invalid', error: `subject ${name} exists` };
    const changes: FileChange[] = subjectScaffold(name, 'Model').map((f) => ({ path: f.path, before: null, after: f.text }));
    changes.push({ path: layoutPath(name), before: null, after: serializeLayout(emptyLayout()) });
    const root = await this.options.text.read('Model.lean');
    changes.push({ path: 'Model.lean', before: root, after: `${root ?? ''}import Model.${name}\n` });
    return this.apply(changes, `New subject: ${name}`, 'create-subject', name, name, true);
  }

  /** Writes through the extension's EditApplier, records undo/history, rescans and notifies. */
  private async apply(changes: FileChange[], label: string, action: HistoryActionKind, historySubject: string, undoSubject: string, push = false): Promise<ActionOutcome> {
    try {
      await this.options.applier.apply(changes, label);
    } catch (error) {
      return errorOutcome(error);
    }
    const entry: Entry = { id: hex(), time: new Date().toISOString(), action, label, subject: undoSubject, changes };
    if (push) {
      this.undoStack.push(entry);
      this.redoStack.length = 0;
    }
    if (this.gitReady) this.history.push({ ...entry, subject: historySubject });
    const namesBefore = this.names.join(',');
    await this.rescan();
    this.fire([historySubject, undoSubject], false, namesBefore !== this.names.join(','));
    return { ok: true, label, undoable: true };
  }

  private async rescan(): Promise<void> {
    const library = path.join(this.root, 'Model');
    const dirs = existsSync(library) ? await readdir(library, { withFileTypes: true }) : [];
    // As the plan defines subjects: `Model/<S>/` holding .lean files, or a `Model/<S>.lean` (empty folders left by
    // deleted files do not count).
    const names: string[] = [];
    for (const d of dirs) {
      const name = d.isDirectory() ? d.name : d.name.endsWith('.lean') ? d.name.slice(0, -5) : '';
      if (!SUBJECT_NAME_PATTERN.test(name) || names.includes(name)) continue;
      const hasLean = d.isDirectory() ? (await readdir(path.join(library, d.name)).catch(() => [])).some((f) => f.endsWith('.lean')) : true;
      if (hasLean) names.push(name);
    }
    this.names = names.sort();
    const inbox = new Map<string, TlNode[]>();
    for (const name of this.names) {
      const text = (await this.options.text.read(`Model/${name}/Inbox.lean`)) ?? '';
      const nodes: TlNode[] = [];
      for (const block of text.matchAll(/@@ telelean v1\nid: (.+)\ntype: (ASSUMPTION|DERIVATION|GOAL)\nnatural_name: (.+)\n/g)) {
        nodes.push({
          id: block[1] ?? 'x',
          type: (block[2] ?? 'ASSUMPTION') as NodeType,
          role: 'node',
          subject: name,
          naturalName: block[3] ?? '',
          premises: [],
          provenance: { wordedBy: 'user', endorsed: true, origin: 'user' },
          ext: {},
          lean: { binding: 'none' },
          status: { formal: 'informal', proof: { kind: 'none' }, certificates: { consistency: 'none', nonVacuity: 'none' }, flags: [] },
        });
      }
      inbox.set(name, nodes);
    }
    this.inbox = inbox;
  }

  private fire(subjects: string[], semantic: boolean, subjectsListChanged = false): void {
    for (const listener of this.listeners) listener({ subjects: [...new Set(subjects)], semantic, subjectsListChanged });
  }
}

// -----------------------------------------------------------------------------------------------
// Initialize helpers

const EXCLUDED = new Set(['node_modules', '.lake', '.git', 'verbatim_prompt_log', 'test-fixtures']);

export async function fakeFindModelRoots(folder: string, options: { maxDepth?: number } = {}): Promise<string[]> {
  const roots: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (existsSync(path.join(dir, '.telelean', 'config.json'))) roots.push(dir);
    if (depth >= (options.maxDepth ?? 4)) return;
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (entry.isDirectory() && !EXCLUDED.has(entry.name) && entry.name !== '.telelean') await walk(path.join(dir, entry.name), depth + 1);
    }
  }
  await walk(folder, 0);
  return roots.sort();
}

export async function fakeInspectFolder(root: string): Promise<FolderInspection> {
  if (existsSync(path.join(root, '.telelean', 'config.json'))) return { kind: 'model', config: defaultProjectConfig() };
  const visible = (await readdir(root)).filter((name) => !name.startsWith('.'));
  return visible.length === 0 ? { kind: 'empty' } : { kind: 'unsupported', reason: '(fake) the folder is not empty' };
}

export function fakePlanInitialize(options: InitializeOptions): FileChange[] {
  if (options.inspection.kind !== 'empty') throw new TypeError('(fake) only empty folders');
  const created = (file: string, text: string): FileChange => ({ path: file, before: null, after: text });
  return [
    created('lakefile.toml', 'name = "Model"\ndefaultTargets = ["Model"]\n\n[leanOptions]\nautoImplicit = false\nrelaxedAutoImplicit = false\n\n[[lean_lib]]\nname = "Model"\n'),
    created('lean-toolchain', 'leanprover/lean4:v4.35.0\n'),
    created('lake-manifest.json', '{"version": "1.1.0",\n "packagesDir": ".lake/packages",\n "packages": [],\n "name": "Model",\n "lakeDir": ".lake"}\n'),
    created('.gitignore', '/.lake/\n/.telelean/graph.json\n/.telelean/frozen/\n/.telelean/sessions/\n/.telelean/*.tmp\n'),
    created('Model.lean', `import Model.${options.subject}\n`),
    ...subjectScaffold(options.subject, 'Model').map((f) => created(f.path, f.text)),
    created('.telelean/config.json', serializeProjectConfig(defaultProjectConfig())),
    created(layoutPath(options.subject), serializeLayout(emptyLayout())),
  ];
}

/**
 * The runner overrides for `api.testing.useRunner`. A fake workspace gets no Claude runs (M2): its boards answer run
 * messages "not available", and the real RunManager is never created for it (runs.test.ts covers runs).
 */
export const FAKE_RUNNER = {
  createModelWorkspace: (options: ModelWorkspaceOptions) => new FakeModelWorkspace(options),
  findModelRoots: fakeFindModelRoots,
  inspectFolder: fakeInspectFolder,
  planInitialize: fakePlanInitialize,
  createRunManager: (): never => {
    throw new Error('the fake model workspace of the M1 smoke suites has no Claude runs');
  },
};
