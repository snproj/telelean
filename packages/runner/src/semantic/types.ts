/**
 * The semantic layer (WP-semantic): how telelean learns what Lean thinks of a model project in M1
 * (03 section 5 "M1 facts"; docs/m1-plan.md section 4).
 *
 *   1. memory guard: MemAvailable >= threshold, else status `low-memory` (the board shows "paused: low memory");
 *   2. toolchain check: `lean-toolchain` must be the pinned `leanprover/lean4:v4.35.0` (D-7), else `unsupported-toolchain`;
 *      project check: `lake-manifest.json` must exist and list no packages, else `unsupported-project` (no Mathlib
 *      or other Lake dependencies in M1: D-28 needs an explicit opt-in, and the user's RAM rule forbids such builds);
 *   3. hash every module source (sha256), then `lake build <library>` (e.g. `lake build Model`, whatever
 *      `defaultTargets` says) IN PLACE under runLean (sources read-only, `.lake/` writable, `.git` masked when it is a
 *      directory); parse Lake's log for messages and failed modules;
 *   4. read each fresh module's `.ilean` (version 5: `decls` ranges and `references` with parent declarations);
 *   5. one generated check file on stdin (`lake env lean --stdin --json`) importing the fresh modules, with
 *      `set_option pp.fullNames true` and `pp.proofs false`, and per declaration `#check @N`, `#print N`,
 *      `#print axioms N` and `#check type_of% @N` (the sort of the type; an error there counts only for axioms and
 *      opaques); messages are attributed by line;
 *   6. re-hash the sources: modules whose source changed meanwhile are `stale`.
 *
 * FROZEN CONTRACT (M1). WP-semantic owns this file; additive optional fields only.
 */
import type { LeanFacts } from '@telelean/core';

import type { HostTools } from '../lean/systemd.js';
import type { LeanToolchain } from '../lean/toolchain.js';

/** Refreshes pause below this much MemAvailable (setting `telelean.memory.minAvailableGiB`, default 2). */
export const DEFAULT_MIN_AVAILABLE_BYTES = 2 * 1024 ** 3;
export const DEFAULT_REFRESH_MEMORY_MAX = '4G';
export const DEFAULT_BUILD_TIMEOUT_MS = 120_000;
export const DEFAULT_CHECK_TIMEOUT_MS = 120_000;

export interface RefreshRequest {
  /** Absolute path of the model root (the Lake project that holds `.telelean/`). */
  root: string;
  /** The Lake library holding the subjects (default `Model`). */
  library?: string;
  /** runLean scope group, for cancelRun (`[A-Za-z0-9_]{1,64}`). */
  runId?: string;
  signal?: AbortSignal;
  /** runLean `MemoryMax=` for the build and the check (default `4G`). */
  memoryMax?: string;
  /** Memory guard threshold (default DEFAULT_MIN_AVAILABLE_BYTES). */
  minAvailableBytes?: number;
  buildTimeoutMs?: number;
  checkTimeoutMs?: number;
  toolchain?: LeanToolchain;
  /** Test hooks. */
  host?: Partial<HostTools>;
  readMemAvailable?: () => number | undefined;
  now?: () => Date;
  /** Called when the build and the check start (the board shows "checking…"). */
  onPhase?: (phase: 'build' | 'check') => void;
}

/** Re-exported for convenience: what a refresh returns. */
export type { LeanFacts };
