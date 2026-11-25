/**
 * The ShadowWorkspace of one run directory (contracts in ./types.ts; docs/m2-plan.md section 4.2).
 *
 * ws/ is read by walking it with lstat (symlinks are never followed): every regular file is a file of the working copy,
 * whatever its name; a symlink, a special file or any entry whose name starts with a dot is something Claude's confined
 * tools cannot create, so its presence fails closed (ShadowLayoutError: nothing is synced, diffed or committed).
 * Mutations (writeFiles, syncMirror, commit, revertTo) run one at a time.
 */
import { lstat, mkdir, readdir, readFile, rm, rmdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { FileChange } from '@telelean/core';

import { ShadowGit } from './git.js';
import { isModelPath } from './paths.js';
import {
  PASSING_COMMIT_KINDS,
  ShadowLayoutError,
  type BuildSeedOutcome,
  type ShadowCommit,
  type ShadowCommitKind,
  type ShadowPaths,
  type ShadowWorkspace,
} from './types.js';

export const SHADOW_COMMIT_KINDS: readonly ShadowCommitKind[] = [
  'base',
  'freeze',
  'adopt',
  'normalise',
  'gate-pass',
  'revert',
  'rebase',
  'accept-base',
  'checkpoint',
  'step-start',
  'decision',
  'completion',
];
const KIND_SET: ReadonlySet<string> = new Set(SHADOW_COMMIT_KINDS);
const COMMIT_ID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;

/** The fixed layout of `<runsDir>/<runId>/` (2k2: `<root>/.telelean/runs/<runId>/`). */
export function shadowPaths(runDir: string): ShadowPaths {
  const dir = path.resolve(runDir);
  return {
    runDir: dir,
    ws: path.join(dir, 'ws'),
    build: path.join(dir, 'build'),
    gitDir: path.join(dir, 'git'),
    sessionDir: path.join(dir, 'session'),
    frozenDir: path.join(dir, 'frozen'),
    gateDir: path.join(dir, 'gate'),
    scratchDir: path.join(dir, 'scratch'),
    stateFile: path.join(dir, 'run.json'),
  };
}

const byPath = (a: { path: string }, b: { path: string }): number => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

export interface UnusualEntry {
  path: string;
  why: 'symlink' | 'special' | 'hidden';
}

export interface TreeScan {
  /** Regular files, path -> text. */
  files: Map<string, string>;
  /** Symlinks, special files and dot-entries (not descended into). */
  unusual: UnusualEntry[];
}

/**
 * Walks a directory without following symlinks. `skipHidden`: dot-entries are skipped silently instead of reported
 * (the build mirror's `.lake`).
 */
export async function scanTree(root: string, options: { skipHidden?: boolean; readText?: boolean } = {}): Promise<TreeScan> {
  const scan: TreeScan = { files: new Map(), unusual: [] };
  const readText = options.readText ?? true;
  const stack: string[] = [''];
  while (stack.length > 0) {
    const rel = stack.pop() ?? '';
    let entries;
    try {
      entries = await readdir(path.join(root, rel), { withFileTypes: true });
    } catch (error) {
      if (rel === '' && (error as NodeJS.ErrnoException).code === 'ENOENT') return scan;
      throw error;
    }
    for (const entry of entries) {
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.name.startsWith('.')) {
        if (!options.skipHidden) scan.unusual.push({ path: childRel, why: 'hidden' });
      } else if (entry.isSymbolicLink()) {
        scan.unusual.push({ path: childRel, why: 'symlink' });
      } else if (entry.isDirectory()) {
        stack.push(childRel);
      } else if (entry.isFile()) {
        scan.files.set(childRel, readText ? await readFile(path.join(root, childRel), 'utf8') : '');
      } else {
        scan.unusual.push({ path: childRel, why: 'special' });
      }
    }
  }
  return scan;
}

/** The ShadowLayoutError for entries of ws/ telelean refuses to sync or diff. */
export function unusualEntriesError(unusual: readonly UnusualEntry[]): ShadowLayoutError {
  const paths = unusual.map((u) => u.path).sort();
  const irregular = unusual.some((u) => u.why !== 'hidden');
  const kinds = [
    unusual.some((u) => u.why === 'symlink') ? 'symlinks' : undefined,
    unusual.some((u) => u.why === 'special') ? 'special files' : undefined,
    unusual.some((u) => u.why === 'hidden') ? 'names starting with a dot' : undefined,
  ].filter((s) => s !== undefined);
  return new ShadowLayoutError(
    irregular ? 'not-regular' : 'hidden-entry',
    `the working copy holds entries telelean does not sync (${kinds.join(', ')}): ${paths.join(', ')}`,
    paths,
  );
}

/** Removes the now-empty parent directories of `relPaths` below `root` (never `root` itself). */
async function pruneEmptyParents(root: string, relPaths: readonly string[]): Promise<void> {
  const dirs = new Set<string>();
  for (const rel of relPaths) {
    for (let dir = path.posix.dirname(rel); dir !== '.' && dir !== ''; dir = path.posix.dirname(dir)) dirs.add(dir);
  }
  for (const dir of [...dirs].sort((a, b) => b.length - a.length)) {
    try {
      await rmdir(path.join(root, dir));
    } catch {
      // not empty (or already gone)
    }
  }
}

async function writeText(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, 'utf8');
}

/** The commit message: the label, then telelean's trailers. */
export function commitMessage(kind: ShadowCommitKind, label: string, round: number, at: string): string {
  return `${label}\n\nTelelean-Kind: ${kind}\nTelelean-Round: ${round}\nTelelean-At: ${at}\n`;
}

/** Reads a commit message written by `commitMessage`; undefined when it is not one. */
export function parseCommitMessage(id: string, message: string): ShadowCommit | undefined {
  const kind = /^Telelean-Kind: (\S+)$/mu.exec(message)?.[1];
  const round = Number(/^Telelean-Round: (\d+)$/mu.exec(message)?.[1]);
  const at = /^Telelean-At: (\S+)$/mu.exec(message)?.[1];
  if (kind === undefined || !KIND_SET.has(kind) || !Number.isInteger(round) || at === undefined) return undefined;
  return { id, kind: kind as ShadowCommitKind, label: message.split('\n')[0] ?? '', round, at };
}

/** One line, no control characters, at most 200 characters. */
function cleanLabel(label: string, kind: ShadowCommitKind): string {
  const one = String(label).replace(/[\u0000-\u001f\u007f]+/gu, ' ').replace(/\s+/gu, ' ').trim();
  return (one === '' ? kind : one).slice(0, 200);
}

export interface RunShadowInit {
  runId: string;
  root: string;
  library: string;
  paths: ShadowPaths;
  git: ShadowGit;
  now?: () => Date;
  /** How createRunShadow seeded the build mirror (fixer round 3). */
  buildSeed?: BuildSeedOutcome;
}

export class RunShadow implements ShadowWorkspace {
  readonly runId: string;
  readonly root: string;
  readonly library: string;
  readonly paths: ShadowPaths;
  readonly buildSeed?: BuildSeedOutcome;
  private readonly git: ShadowGit;
  private readonly now: () => Date;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly trees = new Map<string, Map<string, string>>();
  private baseId: string | undefined;

  constructor(init: RunShadowInit) {
    this.runId = init.runId;
    this.root = init.root;
    this.library = init.library;
    this.paths = init.paths;
    this.git = init.git;
    this.now = init.now ?? ((): Date => new Date());
    if (init.buildSeed !== undefined) this.buildSeed = { ...init.buildSeed };
  }

  /** Runs mutations one at a time; a failure does not block the queue. */
  private exclusive<T>(job: () => Promise<T>): Promise<T> {
    const run = this.queue.then(job, job);
    this.queue = run.catch(() => undefined);
    return run;
  }

  async baseFiles(): Promise<Map<string, string>> {
    if (this.baseId === undefined) {
      const base = (await this.commits()).find((c) => c.kind === 'base');
      if (base === undefined) throw new ShadowLayoutError('git', `the shadow of run ${this.runId} has no base commit`);
      this.baseId = base.id;
    }
    return this.filesAt(this.baseId);
  }

  async currentFiles(): Promise<Map<string, string>> {
    const scan = await scanTree(this.paths.ws);
    if (scan.unusual.length > 0) throw unusualEntriesError(scan.unusual);
    return scan.files;
  }

  async changes(from?: string): Promise<FileChange[]> {
    const before = from === undefined ? await this.baseFiles() : await this.filesAt(from);
    const after = await this.currentFiles();
    const out: FileChange[] = [];
    for (const [p, text] of before) {
      const now = after.get(p);
      if (now === undefined) out.push({ path: p, before: text, after: null });
      else if (now !== text) out.push({ path: p, before: text, after: now });
    }
    for (const [p, text] of after) if (!before.has(p)) out.push({ path: p, before: null, after: text });
    return out.sort(byPath);
  }

  syncMirror(files?: ReadonlyMap<string, string>): Promise<{ copied: string[]; removed: string[] }> {
    return this.exclusive(async () => {
      let source: ReadonlyMap<string, string>;
      if (files !== undefined) source = files;
      else {
        const scan = await scanTree(this.paths.ws);
        if (scan.unusual.length > 0) throw unusualEntriesError(scan.unusual);
        source = scan.files;
      }
      const model = new Map([...source].filter(([p]) => isModelPath(p, this.library)));
      const mirror = await scanTree(this.paths.build, { skipHidden: true, readText: false });
      const copied: string[] = [];
      const removed: string[] = [];
      for (const [p, text] of model) {
        const target = path.join(this.paths.build, p);
        let current: string | undefined;
        try {
          if ((await lstat(target)).isFile()) current = await readFile(target, 'utf8');
          else await rm(target, { recursive: true, force: true });
        } catch {
          current = undefined;
        }
        if (current !== text) {
          await writeText(target, text);
          copied.push(p);
        }
      }
      for (const p of mirror.files.keys()) {
        if (isModelPath(p, this.library) && !model.has(p)) {
          await unlink(path.join(this.paths.build, p));
          removed.push(p);
        }
      }
      await pruneEmptyParents(this.paths.build, removed);
      return { copied: copied.sort(), removed: removed.sort() };
    });
  }

  writeFiles(changes: readonly FileChange[]): Promise<void> {
    return this.exclusive(async () => {
      const bad = changes.filter((c) => !isModelPath(c.path, this.library)).map((c) => c.path);
      if (bad.length > 0) throw new ShadowLayoutError('bad-path', `telelean writes only model files into the working copy, not: ${bad.join(', ')}`, bad);
      const seen = new Set<string>();
      for (const change of changes) {
        if (seen.has(change.path)) throw new ShadowLayoutError('io', `${change.path} is changed twice in one write`, [change.path]);
        seen.add(change.path);
        const file = path.join(this.paths.ws, change.path);
        let current: string | null = null;
        try {
          const st = await lstat(file);
          if (!st.isFile()) throw new ShadowLayoutError('not-regular', `${change.path} in the working copy is not a regular file`, [change.path]);
          current = await readFile(file, 'utf8');
        } catch (error) {
          if (error instanceof ShadowLayoutError) throw error;
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new ShadowLayoutError('io', `cannot read ${change.path}: ${(error as Error).message}`, [change.path]);
        }
        if (current !== change.before) {
          throw new ShadowLayoutError('io', `${change.path} changed in the working copy since telelean read it; nothing was written`, [change.path]);
        }
      }
      for (const change of changes) {
        const file = path.join(this.paths.ws, change.path);
        if (change.after === null) await rm(file, { force: true });
        else await writeText(file, change.after);
      }
      await pruneEmptyParents(
        this.paths.ws,
        changes.filter((c) => c.after === null).map((c) => c.path),
      );
    });
  }

  commit(kind: ShadowCommitKind, label: string, round: number): Promise<ShadowCommit> {
    return this.exclusive(() => this.commitNow(kind, label, round));
  }

  private async commitNow(kind: ShadowCommitKind, label: string, round: number): Promise<ShadowCommit> {
    if (!KIND_SET.has(kind)) throw new TypeError(`unknown shadow commit kind ${JSON.stringify(kind)}`);
    if (!Number.isInteger(round) || round < 0) throw new TypeError('round must be a non-negative integer');
    const files = await this.currentFiles();
    const at = this.now();
    const text = cleanLabel(label, kind);
    const id = await this.git.commitSnapshot(files, await this.git.head(), commitMessage(kind, text, round, at.toISOString()), at);
    this.trees.set(id, new Map(files));
    if (kind === 'base') this.baseId ??= id;
    return { id, kind, label: text, round, at: at.toISOString() };
  }

  async commits(): Promise<ShadowCommit[]> {
    const out: ShadowCommit[] = [];
    for (const { id, message } of await this.git.log()) {
      const commit = parseCommitMessage(id, message);
      if (commit !== undefined) out.push(commit);
    }
    return out;
  }

  async lastCommit(kinds: readonly ShadowCommitKind[] = PASSING_COMMIT_KINDS): Promise<ShadowCommit | undefined> {
    const all = await this.commits();
    for (let i = all.length - 1; i >= 0; i--) {
      const c = all[i];
      if (c !== undefined && kinds.includes(c.kind)) return c;
    }
    return undefined;
  }

  async lastCommitSince(since: string, kinds: readonly ShadowCommitKind[]): Promise<ShadowCommit | undefined> {
    const all = await this.commits();
    const start = all.findIndex((c) => c.id === since);
    if (start < 0) return undefined;
    for (let i = all.length - 1; i >= start; i--) {
      const c = all[i];
      if (c !== undefined && kinds.includes(c.kind)) return c;
    }
    return undefined;
  }

  async filesAt(commitId: string): Promise<Map<string, string>> {
    if (typeof commitId !== 'string' || !COMMIT_ID.test(commitId)) throw new ShadowLayoutError('git', `not a shadow commit id: ${JSON.stringify(commitId)}`);
    let tree = this.trees.get(commitId);
    if (tree === undefined) {
      tree = await this.git.readTree(commitId);
      this.trees.set(commitId, tree);
    }
    return new Map(tree);
  }

  revertTo(commitId: string, label: string, round: number): Promise<FileChange[]> {
    return this.exclusive(async () => {
      const target = await this.filesAt(commitId);
      const scan = await scanTree(this.paths.ws);
      const changes: FileChange[] = [];
      for (const [p, text] of scan.files) if (!target.has(p)) changes.push({ path: p, before: text, after: null });
      for (const [p, text] of target) {
        const current = scan.files.get(p);
        if (current !== text) changes.push({ path: p, before: current ?? null, after: text });
      }
      if (changes.length === 0 && scan.unusual.length === 0) return [];
      for (const entry of scan.unusual) await rm(path.join(this.paths.ws, entry.path), { recursive: true, force: true });
      for (const change of changes) {
        const file = path.join(this.paths.ws, change.path);
        if (change.after === null) await rm(file, { force: true });
        else await writeText(file, change.after);
      }
      await pruneEmptyParents(this.paths.ws, [...changes.filter((c) => c.after === null).map((c) => c.path), ...scan.unusual.map((u) => u.path)]);
      await this.commitNow('revert', label, round);
      return changes.sort(byPath);
    });
  }
}
