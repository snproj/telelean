/**
 * WP-semantic public functions (docs/m1-plan.md sections 4 and 9). The signatures and documented behaviour are
 * FROZEN. The internal helpers (Lake log parser, `.ilean` reader, check-file generator, text and project helpers)
 * are exported too, for tests and for the integrator.
 */
import { readFileSync } from 'node:fs';

import type { LeanFacts } from '@telelean/core';

import { refresh } from './refresh.js';
import type { RefreshRequest } from './types.js';

export * from './types.js';
export * from './text.js';
export * from './project.js';
export * from './lakeLog.js';
export * from './ilean.js';
export * from './checkFile.js';
export * from './probeFile.js';
export { declDrafts, gitMaskPaths, messageFacts, rootRelativeFile, toDeclFacts, type DeclDraft } from './refresh.js';

/**
 * Builds the project in place under runLean and checks it (see ./types.ts for the six steps). Never throws for
 * Lean or sandbox failures: they become `status` values with a `detail`. Throws TypeError for invalid arguments.
 * Does not serialise itself: callers wrap it in `runExclusive`.
 */
export async function refreshLeanFacts(request: RefreshRequest): Promise<LeanFacts> {
  return refresh(request, readMemAvailableBytes);
}

/** MemAvailable from /proc/meminfo in bytes, or undefined when it cannot be read. */
export function readMemAvailableBytes(): number | undefined {
  try {
    const match = /^MemAvailable:\s+(\d+)\s+kB$/m.exec(readFileSync('/proc/meminfo', 'utf8'));
    return match ? Number(match[1]) * 1024 : undefined;
  } catch {
    return undefined;
  }
}

let tail: Promise<unknown> = Promise.resolve();

/**
 * Runs Lean jobs one at a time in this process (03 principle 5: one Lean job at a time; M2's shadow builds will
 * queue here too). A job's failure does not block the queue.
 */
export function runExclusive<T>(job: () => Promise<T>): Promise<T> {
  const run = tail.then(job, job);
  tail = run.catch(() => undefined);
  return run;
}
