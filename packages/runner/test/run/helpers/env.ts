/**
 * Scratch space and timers for the run tests (WP3). Every scratch tree lives under `$TELELEAN_TEST_TMP` (default a
 * fresh directory in the OS temp dir); git never reads the user's configuration nor looks above the scratch tree.
 * Importing this module captures the REAL timers first, so helpers can wait for events with a real timeout while a
 * test runs under vitest's fake timers.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll } from 'vitest';

export const realSetTimeout: typeof setTimeout = globalThis.setTimeout.bind(globalThis);
export const realClearTimeout: typeof clearTimeout = globalThis.clearTimeout.bind(globalThis);
export const realSetImmediate: typeof setImmediate = globalThis.setImmediate.bind(globalThis);

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
export const MENTAL_MODEL = path.join(REPO_ROOT, 'mental_model');
export const SPYRO_FIXTURE = path.join(REPO_ROOT, 'test-fixtures', 'spyro');
export const WALKTHROUGH_FIXTURES = path.join(REPO_ROOT, 'test-fixtures', 'walkthrough');
export const SPYRO_FACTS = path.join(REPO_ROOT, 'test-fixtures', 'semantic', 'recorded', 'spyro-facts.json');

const OWN_SCRATCH = process.env['TELELEAN_TEST_TMP'] === undefined;
export const SCRATCH = ((): string => {
  const base = process.env['TELELEAN_TEST_TMP'] ?? mkdtempSync(path.join(tmpdir(), 'telelean-run-tests-'));
  mkdirSync(base, { recursive: true });
  return path.resolve(base);
})();
// A scratch base this module made itself is removed after the test file (a given $TELELEAN_TEST_TMP is the caller's).
afterAll(() => {
  if (OWN_SCRATCH && process.env['TELELEAN_KEEP_TMP'] !== '1') rmSync(SCRATCH, { recursive: true, force: true });
});

process.env['GIT_CONFIG_GLOBAL'] = '/dev/null';
process.env['GIT_CONFIG_NOSYSTEM'] = '1';
process.env['GIT_CEILING_DIRECTORIES'] = SCRATCH;

export function makeTempDir(label: string): string {
  return mkdtempSync(path.join(SCRATCH, `run-${label}-`));
}

export function cleanup(dir: string | undefined): void {
  if (dir === undefined || process.env['TELELEAN_KEEP_TMP'] === '1') return;
  rmSync(dir, { recursive: true, force: true });
}

/** Lets pending I/O callbacks and microtasks run (setImmediate is never faked by these tests). */
export function flushIo(times = 3): Promise<void> {
  let p = Promise.resolve();
  for (let i = 0; i < times; i++) p = p.then(() => new Promise<void>((r) => realSetImmediate(r)));
  return p;
}

/** The timers vitest fakes in these tests (never setImmediate or nextTick, which fs and the fakes rely on). */
export const FAKE_TIMERS: { toFake: Array<'setTimeout' | 'clearTimeout' | 'setInterval' | 'clearInterval' | 'Date'> } = {
  toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
};
