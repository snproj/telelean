/**
 * Shared helpers for the workspace tests (WP4). Every scratch tree lives under `$TELELEAN_TEST_TMP` (default: a fresh
 * directory in the OS temp dir); git never reads the user's configuration and never looks above the scratch tree
 * (docs/m1-plan.md section 10). Importing this module sets those environment variables for the test process.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LEAN_FACTS_FORMAT,
  LEAN_FACTS_VERSION,
  type FactsStatus,
  type FileChange,
  type LeanFacts,
  type ModuleFacts,
} from '@telelean/core';

import { readMemAvailableBytes } from '../../src/semantic/index.js';
import { fsEditApplier, fsTextSource, type EditApplier, type TextSource } from '../../src/workspace/index.js';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export const MENTAL_MODEL = path.join(REPO_ROOT, 'mental_model');
export const SPYRO_FIXTURE = path.join(REPO_ROOT, 'test-fixtures', 'spyro');

/** The scratch base for this test process. */
export const SCRATCH = ((): string => {
  const base = process.env['TELELEAN_TEST_TMP'] ?? mkdtempSync(path.join(tmpdir(), 'telelean-ws-tests-'));
  mkdirSync(base, { recursive: true });
  return path.resolve(base);
})();

process.env['GIT_CONFIG_GLOBAL'] = '/dev/null';
process.env['GIT_CONFIG_NOSYSTEM'] = '1';
process.env['GIT_CEILING_DIRECTORIES'] = SCRATCH;
// Snapshot temp dirs (os.tmpdir()) stay inside the scratch tree as well.
const TMP = path.join(SCRATCH, 'tmp');
mkdirSync(TMP, { recursive: true });
process.env['TMPDIR'] = TMP;

/** One run id per test process for runLean scopes (only names containing it are ours). */
export const TEST_RUN_ID = `wp4t${process.pid}`;

export function makeTempDir(label: string): string {
  return mkdtempSync(path.join(SCRATCH, `ws-${label}-`));
}

export function cleanup(dir: string | undefined): void {
  if (dir === undefined || process.env['TELELEAN_KEEP_TMP'] === '1') return;
  rmSync(dir, { recursive: true, force: true });
}

/** A copy of `mental_model/` at `<dir>/<name>`. */
export function copyMentalModel(dir: string, name = 'mental_model'): string {
  const root = path.join(dir, name);
  cpSync(MENTAL_MODEL, root, { recursive: true });
  return root;
}

export function read(root: string, rel: string): string {
  return readFileSync(path.join(root, rel), 'utf8');
}

export function write(root: string, rel: string, text: string): void {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
}

export function exists(root: string, rel: string): boolean {
  try {
    statSync(path.join(root, rel));
    return true;
  } catch {
    return false;
  }
}

/** Every regular file under `root` (relative POSIX paths, sorted), `.git` and `.lake` skipped. */
export function listFiles(root: string, rel = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const child = rel === '' ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== '.git' && entry.name !== '.lake') out.push(...listFiles(root, child));
    } else out.push(child);
  }
  return out.sort();
}

/** The contents of every file under `root`, for "nothing changed" assertions. */
export function snapshotTree(root: string): Record<string, string> {
  return Object.fromEntries(listFiles(root).map((rel) => [rel, read(root, rel)]));
}

export function sha256(text: string | Buffer): string {
  return createHash('sha256').update(text).digest('hex');
}

/** git as a test user would run it (safe flags, explicit author, no optional locks so `status` never writes the index). */
export function userGit(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test User',
      GIT_AUTHOR_EMAIL: 'test-user@example.invalid',
      GIT_COMMITTER_NAME: 'Test User',
      GIT_COMMITTER_EMAIL: 'test-user@example.invalid',
      GIT_OPTIONAL_LOCKS: '0',
    },
  });
}

/** A disk TextSource whose `overlay` entries play unsaved editor buffers (null = the file is shown as missing). */
export function overlayTextSource(root: string, overlay: Map<string, string | null> = new Map()): TextSource & { overlay: Map<string, string | null> } {
  const disk = fsTextSource(root);
  return {
    overlay,
    read: async (rel) => (overlay.has(rel) ? (overlay.get(rel) ?? null) : disk.read(rel)),
  };
}

export interface RecordingApplier extends EditApplier {
  calls: Array<{ changes: FileChange[]; label: string }>;
  /** The next apply rejects with this error (after recording the call), without writing. */
  failNext?: Error;
}

/** The disk applier (checks `before`, then writes), recording every call. */
export function recordingApplier(root: string): RecordingApplier {
  const disk = fsEditApplier(root);
  const applier: RecordingApplier = {
    calls: [],
    async apply(changes, label) {
      applier.calls.push({ changes: changes.map((c) => ({ ...c })), label });
      const fail = applier.failNext;
      if (fail) {
        applier.failNext = undefined;
        throw fail;
      }
      await disk.apply(changes, label);
    },
  };
  return applier;
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Polls `condition` every 10 ms until it holds or `timeoutMs` passes. */
export async function waitFor(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('waitFor: timed out');
    await sleep(10);
  }
}

/** LeanFacts with the given status; `modules` default to none. */
export function fakeFacts(status: FactsStatus, options: { modules?: ModuleFacts[]; detail?: string; buildErrors?: number; finishedAt?: string } = {}): LeanFacts {
  return {
    format: LEAN_FACTS_FORMAT,
    version: LEAN_FACTS_VERSION,
    toolchain: 'leanprover/lean4:v4.35.0',
    library: 'Model',
    startedAt: '2026-11-01T10:00:00.000Z',
    finishedAt: options.finishedAt ?? '2026-11-01T10:00:02.000Z',
    status,
    ...(options.detail !== undefined ? { detail: options.detail } : {}),
    build: {
      status: status === 'build-errors' ? 'failed' : 'ok',
      durationMs: 1200,
      messages: Array.from({ length: options.buildErrors ?? 0 }, (_, i) => ({ severity: 'error' as const, file: 'Model/Spyro/Main.lean', text: `error ${i}` })),
      failedModules: [],
    },
    check: { status: 'ok', durationMs: 300, probed: 0 },
    modules: options.modules ?? [],
    decls: [],
  };
}

/** Fresh module facts for every `.lean` model file under `root` (as a successful build would report them). */
export function freshModules(root: string): ModuleFacts[] {
  return listFiles(root)
    .filter((rel) => rel === 'Model.lean' || (rel.startsWith('Model/') && rel.endsWith('.lean')))
    .map((rel) => ({ name: rel.slice(0, -5).split('/').join('.'), file: rel, sourceSha256: sha256(read(root, rel)), state: 'fresh' as const, imports: [] }));
}

// ------------------------------------------------------------------------------------------- RAM rule

/** Waits (up to `timeoutMs`) until MemAvailable is at least `bytes`; false when it never is (RAM rule: skip then). */
export async function waitForMemory(bytes = 12 * 1024 ** 3, timeoutMs = 120_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const available = readMemAvailableBytes();
    if (available === undefined || available >= bytes) return true;
    if (Date.now() > deadline) return false;
    await sleep(2_000);
  }
}
