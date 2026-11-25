/**
 * A disk-backed stand-in for WP2's ShadowWorkspace, for the RunManager's own tests while `createRunShadow` is a
 * stub: the same directory layout (`<runsDir>/<runId>/{ws,build,git,session,...}`, 2k2), real files in ws/ (the
 * FakeBackend edits them through the path guard), and commits kept as whole-file snapshots in `git/commits.json`
 * (so `openFakeShadow` re-opens a run after a "reload"). No git, no Lean.
 */
import { createHash } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { FileChange } from '@telelean/core';

import { ensureRunsDir } from '../../../src/shadow/index.js';
import {
  PASSING_COMMIT_KINDS,
  ShadowLayoutError,
  type CreateShadowOptions,
  type ShadowCommit,
  type ShadowCommitKind,
  type ShadowPaths,
  type ShadowWorkspace,
} from '../../../src/shadow/types.js';

interface StoredCommit extends ShadowCommit {
  files: Record<string, string>;
}

function pathsOf(runDir: string): ShadowPaths {
  return {
    runDir,
    ws: path.join(runDir, 'ws'),
    build: path.join(runDir, 'build'),
    gitDir: path.join(runDir, 'git'),
    sessionDir: path.join(runDir, 'session'),
    frozenDir: path.join(runDir, 'frozen'),
    gateDir: path.join(runDir, 'gate'),
    scratchDir: path.join(runDir, 'scratch'),
    stateFile: path.join(runDir, 'run.json'),
  };
}

async function walk(dir: string, rel = ''): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(path.join(dir, rel), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const child = rel === '' ? e.name : `${rel}/${e.name}`;
    if (e.name.startsWith('.')) throw new ShadowLayoutError('hidden-entry', `a hidden entry appeared in the working copy: ${child}`, [child]);
    if (e.isSymbolicLink()) throw new ShadowLayoutError('not-regular', `a symlink appeared in the working copy: ${child}`, [child]);
    if (e.isDirectory()) out.push(...(await walk(dir, child)));
    else if (e.isFile()) out.push(child);
    else throw new ShadowLayoutError('not-regular', `not a regular file: ${child}`, [child]);
  }
  return out;
}

export class FakeShadow implements ShadowWorkspace {
  readonly paths: ShadowPaths;
  private stored: StoredCommit[] = [];
  private seq = 0;
  /** Every method call, in order (tests assert on them). */
  readonly log: string[] = [];

  constructor(
    readonly runId: string,
    readonly root: string,
    readonly library: string,
    runDir: string,
    private readonly now: () => Date,
  ) {
    this.paths = pathsOf(runDir);
  }

  private get commitsFile(): string {
    return path.join(this.paths.gitDir, 'commits.json');
  }

  async load(): Promise<void> {
    this.stored = JSON.parse(await readFile(this.commitsFile, 'utf8')) as StoredCommit[];
    this.seq = this.stored.length;
  }

  private async persist(): Promise<void> {
    await writeFile(this.commitsFile, JSON.stringify(this.stored));
  }

  async baseFiles(): Promise<Map<string, string>> {
    return new Map(Object.entries(this.stored[0]?.files ?? {}));
  }

  async currentFiles(): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const rel of (await walk(this.paths.ws)).sort()) out.set(rel, await readFile(path.join(this.paths.ws, rel), 'utf8'));
    return out;
  }

  async changes(from?: string): Promise<FileChange[]> {
    const base = from === undefined ? await this.baseFiles() : await this.filesAt(from);
    const now = await this.currentFiles();
    const out: FileChange[] = [];
    for (const rel of [...new Set([...base.keys(), ...now.keys()])].sort()) {
      const before = base.get(rel) ?? null;
      const after = now.get(rel) ?? null;
      if (before !== after) out.push({ path: rel, before, after });
    }
    return out;
  }

  async syncMirror(): Promise<{ copied: string[]; removed: string[] }> {
    this.log.push('syncMirror');
    return { copied: [], removed: [] };
  }

  async writeFiles(changes: readonly FileChange[]): Promise<void> {
    this.log.push(`writeFiles:${changes.map((c) => c.path).join(',')}`);
    const now = await this.currentFiles();
    for (const c of changes) {
      if ((now.get(c.path) ?? null) !== c.before) throw new ShadowLayoutError('io', `${c.path} changed since the edit was planned`, [c.path]);
    }
    for (const c of changes) {
      const abs = path.join(this.paths.ws, c.path);
      if (c.after === null) await rm(abs, { force: true });
      else {
        await mkdir(path.dirname(abs), { recursive: true });
        await writeFile(abs, c.after);
      }
    }
  }

  async commit(kind: ShadowCommitKind, label: string, round: number): Promise<ShadowCommit> {
    this.seq += 1;
    const files = Object.fromEntries(await this.currentFiles());
    const id = createHash('sha1').update(`${this.runId}:${this.seq}:${kind}`).digest('hex');
    const c: StoredCommit = { id, kind, label, round, at: this.now().toISOString(), files };
    this.stored.push(c);
    this.log.push(`commit:${kind}`);
    await this.persist();
    const { files: _files, ...commit } = c;
    return commit;
  }

  async commits(): Promise<ShadowCommit[]> {
    return this.stored.map(({ files: _files, ...c }) => c);
  }

  async lastCommit(kinds: readonly ShadowCommitKind[] = PASSING_COMMIT_KINDS): Promise<ShadowCommit | undefined> {
    for (let i = this.stored.length - 1; i >= 0; i--) {
      const c = this.stored[i];
      if (c !== undefined && kinds.includes(c.kind)) {
        const { files: _files, ...commit } = c;
        return commit;
      }
    }
    return undefined;
  }

  async lastCommitSince(since: string, kinds: readonly ShadowCommitKind[]): Promise<ShadowCommit | undefined> {
    const start = this.stored.findIndex((x) => x.id === since);
    if (start < 0) return undefined;
    for (let i = this.stored.length - 1; i >= start; i--) {
      const c = this.stored[i];
      if (c !== undefined && kinds.includes(c.kind)) {
        const { files: _files, ...commit } = c;
        return commit;
      }
    }
    return undefined;
  }

  async filesAt(commitId: string): Promise<Map<string, string>> {
    const c = this.stored.find((x) => x.id === commitId);
    if (c === undefined) throw new ShadowLayoutError('git', `unknown commit ${commitId}`);
    return new Map(Object.entries(c.files));
  }

  async revertTo(commitId: string, label: string, round: number): Promise<FileChange[]> {
    const target = await this.filesAt(commitId);
    const now = await this.currentFiles();
    const changes: FileChange[] = [];
    for (const rel of [...new Set([...target.keys(), ...now.keys()])].sort()) {
      const before = now.get(rel) ?? null;
      const after = target.get(rel) ?? null;
      if (before !== after) changes.push({ path: rel, before, after });
    }
    this.log.push(`revertTo:${commitId.slice(0, 8)}:${changes.length}`);
    if (changes.length === 0) return [];
    await this.writeFiles(changes);
    await this.commit('revert', label, round);
    return changes;
  }

  /** Test convenience: the kinds of every commit, oldest first. */
  kinds(): ShadowCommitKind[] {
    return this.stored.map((c) => c.kind);
  }
}

/** Registry of the shadows the fakes created, so a test can reach the one a RunManager made. */
export const createdShadows: FakeShadow[] = [];

export async function createFakeShadow(options: CreateShadowOptions): Promise<FakeShadow> {
  const runDir = path.join(options.runsDir, options.runId);
  try {
    await lstat(runDir);
    throw new ShadowLayoutError('io', `the run directory exists already: ${runDir}`);
  } catch (e) {
    if (e instanceof ShadowLayoutError) throw e;
  }
  await ensureRunsDir(options.runsDir); // as createRunShadow (2k2, D2-109)
  const shadow = new FakeShadow(options.runId, options.root, options.library, runDir, options.now ?? (() => new Date()));
  for (const dir of Object.values(shadow.paths)) if (!dir.endsWith('.json')) await mkdir(dir, { recursive: true });
  for (const [rel, text] of options.files) {
    if (rel.startsWith('.') || rel.includes('/.')) throw new ShadowLayoutError('bad-path', `not a model file: ${rel}`, [rel]);
    const abs = path.join(shadow.paths.ws, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, text);
  }
  await shadow.commit('base', 'Your files at the start of the run', 1);
  createdShadows.push(shadow);
  return shadow;
}

export async function openFakeShadow(runDir: string, options: { root: string; library: string }): Promise<FakeShadow> {
  const shadow = new FakeShadow(path.basename(runDir), options.root, options.library, runDir, () => new Date());
  await shadow.load();
  createdShadows.push(shadow);
  return shadow;
}
