/**
 * WP-workspace public functions (docs/m1-plan.md sections 3, 7, 8 and 9). The signatures and documented behaviour
 * are FROZEN; the implementations live in the modules next to this file:
 *
 *   modelWorkspace.ts   createModelWorkspace (ModelWorkspace: scan, graphs, refresh, perform, undo, history)
 *   history.ts, git.ts  D-33 snapshots on private refs (plumbing only)
 *   undo.ts             per-subject undo/redo stacks (exact reversal or no-fuzz reverse patches)
 *   sidecars.ts         layout.json and attic changes from an EditPlan
 *   initialize.ts       inspectFolder, planInitialize, findModelRoots, initGitRepository
 *   fsAdapters.ts       disk TextSource / EditApplier (tests, end-to-end runs; the extension has its own)
 *
 * Additive exports (M1 WP4): fsTextSource, fsEditApplier, suggestSubjectName, the scaffold texts.
 */
import type { FileChange } from '@telelean/core';

import {
  findModelRoots as findRoots,
  initGitRepository as initRepository,
  inspectFolder as inspect,
  planInitialize as plan,
} from './initialize.js';
import { createWorkspace } from './modelWorkspace.js';
import type { FolderInspection, InitializeOptions, ModelWorkspace, ModelWorkspaceOptions } from './types.js';

export * from './types.js';
export { fsEditApplier, fsTextSource } from './fsAdapters.js';
export { GITIGNORE_LINES, SCAFFOLD_LAKE_MANIFEST, SCAFFOLD_LAKEFILE_TOML, SCAFFOLD_LEAN_TOOLCHAIN, suggestSubjectName } from './initialize.js';

/** Directory names never searched for model roots or model files (D-28 default excludes, plus VCS/build dirs). */
export const DEFAULT_EXCLUDED_DIRS: readonly string[] = ['node_modules', '.lake', '.git', 'verbatim_prompt_log', 'test-fixtures'];

export function createModelWorkspace(options: ModelWorkspaceOptions): ModelWorkspace {
  return createWorkspace(options);
}

/** What "Initialize Model Here" would do in `root`. */
export async function inspectFolder(root: string): Promise<FolderInspection> {
  return inspect(root);
}

/**
 * The files Initialize creates (docs/m1-plan.md section 7.2): for an empty folder the full scaffold (lakefile.toml,
 * lean-toolchain, lake-manifest.json, .gitignore, `Model.lean`, the subject's root and Vocabulary/Inbox/Main,
 * `.telelean/config.json`, the subject's layout.json); for a Lake project only `.telelean/` and `.gitignore` lines.
 * Every change has `before: null` except an existing `.gitignore` (`before` = the inspection's `gitignore` text;
 * only missing lines are appended). Exact texts: docs/m1-plan.md section 7.1 (subject files via core
 * `subjectScaffold`). Throws TypeError for a `model` or `unsupported` inspection or an invalid subject name.
 * (The subject name is only used, and checked, for an empty folder: a Lake project keeps its own subjects.)
 */
export function planInitialize(options: InitializeOptions): FileChange[] {
  return plan(options);
}

/** Model roots (directories holding `.telelean/config.json`) under `folder`, skipping DEFAULT_EXCLUDED_DIRS. */
export async function findModelRoots(folder: string, options: { excludedDirs?: readonly string[]; maxDepth?: number } = {}): Promise<string[]> {
  return findRoots(folder, options.excludedDirs ?? DEFAULT_EXCLUDED_DIRS, options.maxDepth ?? 4);
}

/**
 * `git init` in `root` with telelean's safe settings (`-c commit.gpgsign=false -c core.hooksPath=/dev/null`),
 * refusing when `root` is already inside a repository. Never adds remotes, never commits to a branch.
 */
export async function initGitRepository(root: string, gitPath = 'git'): Promise<void> {
  return initRepository(root, gitPath);
}
