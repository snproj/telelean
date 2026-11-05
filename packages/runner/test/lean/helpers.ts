/** Shared helpers for the sandboxed-Lean tests. */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createShadow, type Shadow } from '../../src/lean/shadow.js';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export const SPYRO = path.join(REPO_ROOT, 'test-fixtures', 'spyro');
export const RUNNER_FIXTURES = path.join(REPO_ROOT, 'test-fixtures', 'runner-lean');

/** One run id per test process, so concurrent or leftover scopes never collide. */
export const TEST_RUN_ID = `t${process.pid}`;

/** A fresh temporary directory under `$TELELEAN_TEST_TMP` (default: the OS temp dir). */
export function makeTempRoot(label: string): string {
  const base = process.env['TELELEAN_TEST_TMP'] ?? tmpdir();
  mkdirSync(base, { recursive: true });
  return mkdtempSync(path.join(base, `telelean-${label}-`));
}

/** Removes a temp tree unless `TELELEAN_KEEP_TMP=1`. */
export function cleanupTempRoot(dir: string | undefined): void {
  if (dir === undefined || process.env['TELELEAN_KEEP_TMP'] === '1') return;
  rmSync(dir, { recursive: true, force: true });
}

/** `wc -l ~/.elan/known-projects` (elan appends to it when its proxies run in a project). */
export function knownProjectsLines(): number | undefined {
  const file = path.join(homedir(), '.elan', 'known-projects');
  if (!existsSync(file)) return undefined;
  return readFileSync(file, 'utf8').split('').filter((c) => c === '\n').length;
}

function copyTree(src: string, dst: string): void {
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(d, { recursive: true });
      copyTree(s, d);
    } else if (entry.isFile()) {
      copyFileSync(s, d);
    } else {
      throw new Error(`unexpected non-regular fixture entry ${s}`);
    }
  }
}

/** A shadow of the spyro fixture, optionally with `overlays/<overlay>/` copied over it (playing the agent). */
export async function spyroShadow(tmp: string, name: string, overlay?: string): Promise<Shadow> {
  const shadow = await createShadow(SPYRO, path.join(tmp, name));
  if (overlay !== undefined) copyTree(path.join(RUNNER_FIXTURES, 'overlays', overlay), shadow.dir);
  return shadow;
}

/** Copies an inert probe into a shadow as `Probe.lean` (only ever elaborated under runLean). */
export function installProbe(shadowDir: string, probe: string): string {
  const target = path.join(shadowDir, 'Probe.lean');
  copyFileSync(path.join(RUNNER_FIXTURES, 'probes', `${probe}.lean.txt`), target);
  return target;
}

/** Collects `PROBE <label> <rest>` lines: label -> rests, in order. */
export function probeLines(stdout: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const line of stdout.split('\n')) {
    const m = /^PROBE (\S+) ?(.*)$/.exec(line);
    if (!m) continue;
    const label = m[1] ?? '';
    out.set(label, [...(out.get(label) ?? []), m[2] ?? '']);
  }
  return out;
}

/** Live processes whose full command line matches `pattern` (pgrep -f), excluding pgrep itself. */
export function processesMatching(pattern: string): string[] {
  try {
    return execFileSync('pgrep', ['-af', pattern], { encoding: 'utf8' })
      .split('\n')
      .filter((l) => l.trim() !== '');
  } catch {
    return []; // pgrep exits 1 when nothing matches
  }
}

export function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Polls until at least `count` live processes match `pattern`, or `timeoutMs` passes; returns the last
 * match. Tests wait with this instead of a fixed sleep, so a slow start under load does not flake.
 */
export async function waitForProcesses(pattern: string, count: number, timeoutMs = 5_000): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  let found = processesMatching(pattern);
  while (found.length < count && Date.now() < deadline) {
    await sleep(50);
    found = processesMatching(pattern);
  }
  return found;
}

export const MiB = 1024 * 1024;
