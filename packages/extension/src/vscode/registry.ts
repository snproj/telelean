/**
 * One ModelWorkspace per model root (docs/m1-plan.md section 3): created lazily when the root's first board opens,
 * kept until the window closes (so in-board Undo survives closing and reopening the board), with the VS Code
 * TextSource/EditApplier and the file watchers that keep it in sync:
 *
 *   typing (onDidChangeTextDocument)        -> batched ~200 ms -> invalidate(paths)            (never builds)
 *   save (onDidSaveTextDocument)            -> invalidate(path) + requestRefresh('save')       (board open only)
 *   files changed outside the editor        -> batched ~300 ms -> invalidate(paths), and requestRefresh('files')
 *     (**\/*.lean, .telelean/**, lakefile.toml, lean-toolchain, lake-manifest.json)   for Lean files and the
 *                                                                                      project's build setup
 *
 * A Lean file written by another program (a script, a CLI agent, git) counts as saved: the board re-checks it, as
 * it does after a save in the editor (otherwise its cards would show "changed since last check" until the next save
 * or Refresh). Events under `.lake/`, for `.telelean/graph.json` (rewritten after every refresh), the echoes of
 * telelean's own writes and of the user's saves (handled by onSave), and changes under a dirty editor (VS Code keeps
 * the editor's text, which the board follows) are ignored. Lean refreshes are requested only while the root's board
 * is open (D-28).
 *
 * M2 (docs/m2-plan.md section 8.1): each root also gets its RunManager, created right after its workspace loaded
 * (`createRunManager`), recovered once (`recover()`: questions and proposals of an earlier window come back; it never
 * starts a session), and disposed before the workspace (an active run is persisted and its session closed). If the
 * runs cannot be created the board still works; its run messages are refused with the reason.
 */
import * as path from 'node:path';
import * as vscode from 'vscode';

import type { RunManager } from '@telelean/runner/run/types.js';
import type { ModelWorkspace, WorkspaceChange } from '@telelean/runner/workspace/index.js';

import { isDiskEcho, PathBatcher, SelfWrites } from '../logic/changeBatcher';
import { classifyModelPath, rootOfPath } from '../logic/modelPaths';
import { RUNS_UNAVAILABLE, type RunsHandle } from '../logic/runs';
import type { TeleleanSettings } from '../logic/settings';
import { readTextFile } from '../logic/textSource';
import { openDocument, vscodeEditApplier, vscodeTextSource } from './editor';
import type { RunnerFunctions } from './runner';

export type Log = (level: 'info' | 'warn' | 'error', message: string) => void;

/** Typing is re-parsed after this much quiet (the plan's ~200 ms). */
export const TYPING_DEBOUNCE_MS = 200;
/** File events (git checkouts, external tools) come in bursts. */
const FILE_EVENT_DEBOUNCE_MS = 300;

export interface RegistryDeps {
  runner: () => RunnerFunctions;
  settingsFor: (root: string) => TeleleanSettings;
  generatorVersion: string;
  log: Log;
  /** Whether a board for `root` is open (Lean refreshes run only then). */
  isBoardOpen: (root: string) => boolean;
  /** Forwarded from each workspace's onDidChange. */
  onDidChange: (root: string, change: WorkspaceChange) => void;
  /**
   * M2: creates the root's RunManager once its workspace has loaded. Throws when runs are unavailable (the reason is
   * kept and shown for the board's run messages). Absent: no runs.
   */
  createRunManager?: (root: string, workspace: ModelWorkspace) => RunManager;
}

/** How long deactivation waits for run managers that finish disposing asynchronously. */
export const RUNS_SHUTDOWN_MS = 4000;

interface Entry {
  root: string;
  workspace: ModelWorkspace;
  /** M2: the root's Claude runs. */
  runs: RunsHandle;
  /** The RunManager was disposed (deactivation disposes it before the rest). */
  runsDisposed: boolean;
  typing: PathBatcher;
  files: PathBatcher;
  /** Paths among `files` whose change should also trigger a Lean refresh. */
  refreshPaths: Set<string>;
  selfWrites: SelfWrites;
  /** Files the user just saved in the editor (their file events are echoes of a save that onSave handled). */
  userSaves: SelfWrites;
  disposables: vscode.Disposable[];
}

const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error));

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as { then?: unknown } | null | undefined)?.then === 'function';
}

export class WorkspaceRegistry implements vscode.Disposable {
  private readonly loading = new Map<string, Promise<Entry>>();
  private readonly entries = new Map<string, Entry>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly deps: RegistryDeps) {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => this.onTyping(event)),
      vscode.workspace.onDidSaveTextDocument((doc) => this.onSave(doc)),
    );
  }

  /** The root's workspace, created and loaded on first use. Rejects when it cannot be created or loaded. */
  async get(root: string): Promise<ModelWorkspace> {
    const existing = this.entries.get(root);
    if (existing) return existing.workspace;
    let pending = this.loading.get(root);
    if (!pending) {
      pending = this.create(root).finally(() => this.loading.delete(root));
      this.loading.set(root, pending);
    }
    return (await pending).workspace;
  }

  /** The root's workspace if it is already loaded. */
  peek(root: string): ModelWorkspace | undefined {
    return this.entries.get(root)?.workspace;
  }

  /** M2: the runs of a loaded root (its RunManager and recovery, or why there are none). */
  runs(root: string): RunsHandle | undefined {
    return this.entries.get(root)?.runs;
  }

  /** M2: the RunManager of a loaded root, if it has one. */
  peekRunManager(root: string): RunManager | undefined {
    const runs = this.entries.get(root)?.runs;
    return runs && 'manager' in runs ? runs.manager : undefined;
  }

  roots(): string[] {
    return [...this.entries.keys()];
  }

  /** Disposes one root's workspace and runs (tests; a root that stopped being a model). */
  forget(root: string): void {
    const entry = this.entries.get(root);
    if (!entry) return;
    this.entries.delete(root);
    this.disposeEntry(entry);
  }

  /**
   * Deactivation, before the rest is disposed: disposes every root's RunManager while its workspace still exists (an
   * active run is persisted as interrupted, a waiting question or proposal as it is, and the session closed). A
   * manager whose dispose returns a promise is waited for, at most `timeoutMs`.
   */
  async shutdownRuns(timeoutMs = RUNS_SHUTDOWN_MS): Promise<void> {
    const pending = [...this.entries.values()].map((entry) => this.disposeRuns(entry)).filter(isThenable);
    if (pending.length === 0) return;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        this.deps.log('warn', `${pending.length} run manager(s) did not finish disposing within ${timeoutMs} ms`);
        resolve();
      }, timeoutMs);
    });
    await Promise.race([Promise.allSettled(pending).then(() => undefined), timeout]);
    clearTimeout(timer);
  }

  dispose(): void {
    for (const entry of this.entries.values()) this.disposeEntry(entry);
    this.entries.clear();
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
  }

  // ---------------------------------------------------------------------------------------------

  private async create(root: string): Promise<Entry> {
    const name = path.basename(root);
    const log: Log = (level, message) => this.deps.log(level, `[${name}] ${message}`);
    const selfWrites = new SelfWrites();
    const settings = this.deps.settingsFor(root);
    const workspace = this.deps.runner().createModelWorkspace({
      root,
      text: vscodeTextSource(root),
      applier: vscodeEditApplier(root, log, (writes) => selfWrites.record(writes)),
      semantic: settings.semantic,
      git: settings.git,
      log,
      generatorVersion: this.deps.generatorVersion,
    });
    try {
      await workspace.load();
    } catch (error) {
      workspace.dispose();
      throw error;
    }
    const entry: Entry = {
      root,
      workspace,
      runs: this.createRuns(root, workspace, log),
      runsDisposed: false,
      selfWrites,
      userSaves: new SelfWrites(),
      refreshPaths: new Set(),
      typing: new PathBatcher(TYPING_DEBOUNCE_MS, (paths) => this.invalidate(entry, paths, false)),
      files: new PathBatcher(FILE_EVENT_DEBOUNCE_MS, (paths) => {
        // (filter, not some: every flushed path leaves refreshPaths, not just the first one that was in it)
        const refresh = paths.filter((p) => entry.refreshPaths.delete(p)).length > 0;
        this.invalidate(entry, paths, refresh);
      }),
      disposables: [],
    };
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(root), '{**/*.lean,.telelean/**,lakefile.toml,lean-toolchain,lake-manifest.json}'),
    );
    entry.disposables.push(
      workspace.onDidChange((change) => this.deps.onDidChange(root, change)),
      watcher,
      watcher.onDidCreate((uri) => void this.onFileEvent(entry, uri, 'create')),
      watcher.onDidChange((uri) => void this.onFileEvent(entry, uri, 'change')),
      watcher.onDidDelete((uri) => void this.onFileEvent(entry, uri, 'delete')),
    );
    this.entries.set(root, entry);
    log('info', `model workspace loaded (${workspace.subjects().length} subjects)`);
    return entry;
  }

  /** The root's RunManager (recovery started, not awaited), or why there is none. Never throws. */
  private createRuns(root: string, workspace: ModelWorkspace, log: Log): RunsHandle {
    const create = this.deps.createRunManager;
    if (!create) return { unavailable: RUNS_UNAVAILABLE };
    let manager: RunManager;
    try {
      manager = create(root, workspace);
    } catch (error) {
      log('warn', `Claude runs are unavailable: ${describeError(error)}`);
      return { unavailable: `Claude runs are not available: ${describeError(error)}` };
    }
    const recovered = Promise.resolve()
      .then(() => manager.recover())
      .then(
        () => log('info', 'runs recovered'),
        (error: unknown) => log('warn', `recovering the runs of an earlier window failed: ${describeError(error)}`),
      );
    return { manager, recovered };
  }

  /** Disposes the entry's RunManager once; returns what its dispose returned (a promise, if it finishes later). */
  private disposeRuns(entry: Entry): unknown {
    if (entry.runsDisposed || !('manager' in entry.runs)) return undefined;
    entry.runsDisposed = true;
    try {
      const result: unknown = entry.runs.manager.dispose();
      if (isThenable(result)) {
        return Promise.resolve(result).catch((error: unknown) =>
          this.deps.log('warn', `[${path.basename(entry.root)}] disposing the runs failed: ${describeError(error)}`),
        );
      }
      return result;
    } catch (error) {
      this.deps.log('warn', `[${path.basename(entry.root)}] disposing the runs failed: ${describeError(error)}`);
      return undefined;
    }
  }

  private disposeEntry(entry: Entry): void {
    this.disposeRuns(entry); // first, while the workspace it persists against still exists
    entry.typing.dispose();
    entry.files.dispose();
    for (const disposable of entry.disposables.splice(0)) disposable.dispose();
    entry.workspace.dispose();
  }

  private entryFor(uri: vscode.Uri): { entry: Entry; path: string; refresh: boolean } | undefined {
    if (uri.scheme !== 'file') return undefined;
    const root = rootOfPath(this.entries.keys(), uri.fsPath);
    const entry = root === undefined ? undefined : this.entries.get(root);
    if (!entry) return undefined;
    const event = classifyModelPath(entry.root, uri.fsPath);
    return event ? { entry, path: event.path, refresh: event.refresh } : undefined;
  }

  private onTyping(event: vscode.TextDocumentChangeEvent): void {
    if (event.contentChanges.length === 0) return;
    const hit = this.entryFor(event.document.uri);
    if (!hit || hit.entry.selfWrites.isEcho(event.document.uri.fsPath, event.document.getText(), 'editor')) return;
    hit.entry.typing.add([hit.path]);
  }

  private onSave(doc: vscode.TextDocument): void {
    const hit = this.entryFor(doc.uri);
    if (!hit || hit.entry.selfWrites.isEcho(doc.uri.fsPath, doc.getText(), 'editor')) return;
    hit.entry.userSaves.record([{ absPath: doc.uri.fsPath, text: doc.getText() }]);
    hit.entry.typing.drop([hit.path]);
    hit.entry.typing.flush();
    void this.invalidate(hit.entry, [hit.path], true, 'save');
  }

  private async onFileEvent(entry: Entry, uri: vscode.Uri, kind: 'create' | 'change' | 'delete'): Promise<void> {
    const event = classifyModelPath(entry.root, uri.fsPath);
    if (!event) return;
    // A dirty editor keeps its text when the file changes on disk (VS Code does not reload it); the board follows the
    // editor. A clean one is reloaded by VS Code (its change event re-parses it); the refresh below still applies.
    if (kind !== 'delete' && openDocument(uri.fsPath)?.isDirty) return;
    // telelean's own write, or a save onSave handled. (An event may be handled after a later write was recorded:
    // SelfWrites matches it against every recent write, and isDiskEcho asks both sources before either forgets.)
    const read = () => (kind === 'delete' ? Promise.resolve(null) : readTextFile(uri.fsPath).catch(() => undefined));
    if (await isDiskEcho([entry.selfWrites, entry.userSaves], uri.fsPath, read)) return;
    // Written by another program: re-read it, and re-check with Lean when it is a Lean file or the build setup.
    if (event.refresh || event.kind === 'model') entry.refreshPaths.add(event.path);
    entry.files.add([event.path]);
  }

  private async invalidate(entry: Entry, paths: string[], refresh: boolean, reason = 'files'): Promise<void> {
    if (!this.entries.has(entry.root)) return;
    try {
      await entry.workspace.invalidate(paths);
    } catch (error) {
      this.deps.log('warn', `[${path.basename(entry.root)}] invalidate failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (refresh && this.deps.isBoardOpen(entry.root)) entry.workspace.requestRefresh(reason);
  }
}
