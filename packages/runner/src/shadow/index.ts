/**
 * WP2: the run's shadow workspace (docs/m2-plan.md section 4.2; layout and contracts in ./types.ts). Signatures and
 * documented behaviour are FROZEN.
 *
 * Implementation: ./workspace.ts (the ShadowWorkspace of one run directory), ./git.ts (the shadow's own history,
 * plumbing only, isolated configuration), ./paths.ts (which paths may enter the shadow).
 */
import { createHash } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { TERMINAL_RUN_STATES } from '@telelean/core';

import { isValidModuleName } from '../lean/leanNames.js';
import { runExclusive } from '../semantic/index.js';
import { ShadowGit } from './git.js';
import { isModelPath, PROJECT_CONFIG_FILES } from './paths.js';
import { seedFromRefreshOutput } from './seed.js';
import { ShadowLayoutError, type BuildSeedOutcome, type CreateShadowOptions, type RunDirInfo, type ShadowWorkspace } from './types.js';
import { RunShadow, shadowPaths } from './workspace.js';

export * from './types.js';
export { isLeanModelPath, isModelPath, isSafeRelativePath, moduleNameOf } from './paths.js';
export { commitMessage, parseCommitMessage, scanTree, shadowPaths, SHADOW_COMMIT_KINDS } from './workspace.js';
export { SHADOW_REF } from './git.js';

/** Run ids (also runLean scope groups). */
const RUN_ID_PATTERN = /^[A-Za-z0-9_]{1,64}$/u;
/** The label of every shadow's first commit. */
export const BASE_COMMIT_LABEL = 'Your files at the start of the run';

/**
 * The directory name of a model root under `runsDir`: its folder name (characters outside `[A-Za-z0-9._-]` -> `_`)
 * plus `-` and the first 8 hex digits of sha1(the root's absolute path). Implemented with the contract.
 */
export function rootKeyOf(root: string): string {
  const abs = path.resolve(root);
  const base = path.basename(abs).replace(/[^A-Za-z0-9._-]/g, '_') || 'root';
  return `${base}-${createHash('sha1').update(abs).digest('hex').slice(0, 8)}`;
}

async function lstatOrUndefined(p: string): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
  try {
    return await lstat(p);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ENOTDIR') return undefined;
    throw error;
  }
}

async function isRealDirectory(p: string): Promise<boolean> {
  const st = await lstatOrUndefined(p);
  return st !== undefined && st.isDirectory() && !st.isSymbolicLink();
}

/**
 * Fail-closed checks of the user's model tree before anything is created (D-24): no symlink at the root's model and
 * project paths or anywhere in `<library>/` (dot-entries aside, as M1's scan skips them), and every file of the base
 * that exists on disk is a regular file. A symlinked model file would otherwise pull text from outside the model into
 * what Claude reads.
 */
async function checkSourceTree(root: string, library: string, files: readonly string[]): Promise<void> {
  const refused: string[] = [];
  for (const name of [`${library}.lean`, library, ...PROJECT_CONFIG_FILES]) {
    const st = await lstatOrUndefined(path.join(root, name));
    if (st === undefined) continue;
    if (st.isSymbolicLink()) refused.push(name);
    else if (name !== library && !st.isFile()) refused.push(name);
  }
  if (await isRealDirectory(path.join(root, library))) {
    const stack = [library];
    while (stack.length > 0) {
      const rel = stack.pop() ?? '';
      for (const entry of await readdir(path.join(root, rel), { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const childRel = `${rel}/${entry.name}`;
        if (entry.isSymbolicLink()) refused.push(childRel);
        else if (entry.isDirectory()) stack.push(childRel);
        else if (!entry.isFile() && entry.name.endsWith('.lean')) refused.push(childRel);
      }
    }
  }
  for (const rel of files) {
    const st = await lstatOrUndefined(path.join(root, rel));
    if (st !== undefined && !st.isFile()) refused.push(rel);
  }
  const unique = [...new Set(refused)].sort();
  if (unique.length > 0) {
    throw new ShadowLayoutError('not-regular', `refusing to copy a model that contains symlinks or special files: ${unique.join(', ')}`, unique);
  }
}

function validateRunId(runId: unknown): asserts runId is string {
  if (typeof runId !== 'string' || !RUN_ID_PATTERN.test(runId)) throw new TypeError(`runId must match ${RUN_ID_PATTERN.source}, got ${JSON.stringify(runId)}`);
}

function validateLibrary(library: unknown): asserts library is string {
  if (typeof library !== 'string' || !isValidModuleName(library) || library.includes('.')) {
    throw new TypeError(`library must be a plain Lean identifier, got ${JSON.stringify(library)}`);
  }
}

/**
 * Creates `<runsDir>/<rootKeyOf(root)>/<runId>/` (fails if it exists): writes `options.files` into ws/ and build/
 * (refusing any path that is not a model or project file, D-24), `git init` in git/ and commits the base. Every
 * refusal happens before anything is created; a failure while creating removes the run directory again.
 *
 * The build mirror starts without `.lake/build` (closing round 1: the run's first Lean job builds the model from
 * scratch). Only with `copyBuild` (off by default; the RunManager sets it from `telelean.run.reuseLeanBuild`) is it
 * seeded, as one of telelean's Lean jobs (`semantic.runExclusive`, which the board's refresh holds too), and only with
 * what the user's `.lake/build` held right after the board's last refresh, untouched since (./seed.ts: that record
 * includes whatever another program wrote while the refresh ran; Lake's per-module check in the mirror rebuilds any
 * module that does not match the run's sources); anything else seeds nothing and never refuses the start
 * (`ShadowWorkspace.buildSeed` says why).
 */
export async function createRunShadow(options: CreateShadowOptions): Promise<ShadowWorkspace> {
  if (typeof options !== 'object' || options === null) throw new TypeError('createRunShadow needs options');
  validateRunId(options.runId);
  validateLibrary(options.library);
  if (typeof options.root !== 'string' || !path.isAbsolute(options.root)) throw new TypeError('root must be an absolute path');
  if (typeof options.runsDir !== 'string' || options.runsDir === '') throw new TypeError('runsDir must be a path');
  if (typeof options.files !== 'object' || options.files === null || typeof options.files.keys !== 'function') throw new TypeError('files must be a map of path -> text');
  const root = path.resolve(options.root);
  const library = options.library;
  const paths = [...options.files.keys()];
  const bad = paths.filter((p) => !isModelPath(p, library)).sort();
  if (bad.length > 0) throw new ShadowLayoutError('bad-path', `only model and project files enter the shadow, not: ${bad.join(', ')}`, bad);
  for (const [p, text] of options.files) if (typeof text !== 'string') throw new TypeError(`the text of ${p} must be a string`);

  await checkSourceTree(root, library, paths);

  const runDir = path.join(path.resolve(options.runsDir), rootKeyOf(root), options.runId);
  if ((await lstatOrUndefined(runDir)) !== undefined) throw new ShadowLayoutError('io', `the run directory ${runDir} already exists`, [runDir]);
  const layout = shadowPaths(runDir);
  const failed = async (error: unknown): Promise<never> => {
    await rm(runDir, { recursive: true, force: true });
    if (error instanceof ShadowLayoutError || error instanceof TypeError) throw error;
    throw new ShadowLayoutError('io', `cannot create the shadow: ${(error as Error).message}`, [runDir]);
  };
  await mkdir(path.dirname(runDir), { recursive: true });
  try {
    await mkdir(runDir);
  } catch (error) {
    throw new ShadowLayoutError('io', `cannot create the run directory ${runDir}: ${(error as Error).message}`, [runDir]);
  }
  try {
    for (const dir of [layout.ws, layout.build, layout.gitDir, layout.sessionDir, layout.frozenDir, layout.gateDir, layout.scratchDir]) await mkdir(dir);
    for (const [rel, text] of [...options.files].sort(([a], [b]) => (a < b ? -1 : 1))) {
      for (const base of [layout.ws, layout.build]) {
        await mkdir(path.dirname(path.join(base, rel)), { recursive: true });
        await writeFile(path.join(base, rel), text, 'utf8');
      }
      // The mirror keeps the user's mtime when the text is what is on disk (harmless without a seed; Lake 4.35 decides
      // rebuilds by content hash).
      const source = path.join(root, rel);
      const st = await lstatOrUndefined(source);
      if (st?.isFile() && (await readFile(source, 'utf8')) === text) await utimes(path.join(layout.build, rel), st.atime, st.mtime);
    }
  } catch (error) {
    return failed(error);
  }
  try {
    // The seed is copied as one of telelean's Lean jobs, so the board's in-place refresh cannot write .lake/build
    // meanwhile (never call createRunShadow from inside a runExclusive job: it would wait for itself).
    const buildSeed: BuildSeedOutcome = options.copyBuild === true ? await runExclusive(() => seedFromRefreshOutput(root, layout.build)) : { files: 0 };
    const git = new ShadowGit(layout.gitDir, layout.runDir, options.gitPath);
    await git.init();
    const shadow = new RunShadow({ runId: options.runId, root, library, paths: layout, git, buildSeed, ...(options.now ? { now: options.now } : {}) });
    await shadow.commit('base', BASE_COMMIT_LABEL, 1);
    return shadow;
  } catch (error) {
    return failed(error);
  }
}

/** Re-opens an existing run directory (recovery after a window reload). */
export async function openRunShadow(runDir: string, options: { root: string; library: string; gitPath?: string }): Promise<ShadowWorkspace> {
  if (typeof runDir !== 'string' || runDir === '') throw new TypeError('runDir must be a path');
  validateLibrary(options.library);
  const layout = shadowPaths(runDir);
  const runId = path.basename(layout.runDir);
  validateRunId(runId);
  for (const dir of [layout.ws, layout.build, layout.gitDir]) {
    if (!(await isRealDirectory(dir))) throw new ShadowLayoutError('io', `${dir} is missing: not a run directory`, [dir]);
  }
  const git = new ShadowGit(layout.gitDir, layout.runDir, options.gitPath);
  return new RunShadow({ runId, root: path.resolve(options.root), library: options.library, paths: layout, git });
}

/** run.json's state and update time (PersistedRun keeps them in `view`); undefined fields when unreadable. */
async function readRunState(stateFile: string): Promise<{ state?: string; updatedAt?: string }> {
  try {
    const json = JSON.parse(await readFile(stateFile, 'utf8')) as Record<string, unknown>;
    const view = typeof json['view'] === 'object' && json['view'] !== null ? (json['view'] as Record<string, unknown>) : {};
    const state = typeof view['state'] === 'string' ? view['state'] : typeof json['state'] === 'string' ? json['state'] : undefined;
    const updatedAt = typeof view['updatedAt'] === 'string' ? view['updatedAt'] : typeof json['updatedAt'] === 'string' ? json['updatedAt'] : undefined;
    return { ...(state !== undefined ? { state } : {}), ...(updatedAt !== undefined ? { updatedAt } : {}) };
  } catch {
    return {};
  }
}

/** The run directories of one root, newest first (by run.json `updatedAt`, else directory mtime). */
export async function listRunDirs(runsDir: string, root: string): Promise<RunDirInfo[]> {
  const dir = path.join(path.resolve(runsDir), rootKeyOf(root));
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const found: Array<RunDirInfo & { sortKey: number }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !RUN_ID_PATTERN.test(entry.name)) continue;
    const runDir = path.join(dir, entry.name);
    const info = await readRunState(path.join(runDir, 'run.json'));
    const updated = info.updatedAt !== undefined ? Date.parse(info.updatedAt) : Number.NaN;
    const mtime = (await stat(runDir).catch(() => undefined))?.mtimeMs ?? 0;
    found.push({ runId: entry.name, runDir, ...info, sortKey: Number.isFinite(updated) ? updated : mtime });
  }
  found.sort((a, b) => b.sortKey - a.sortKey || (a.runId < b.runId ? 1 : -1));
  return found.map(({ sortKey: _sortKey, ...info }) => info);
}

/**
 * Keeps the newest `keep` run directories of the root (03 section 8.4: the last 10) and deletes older ones whose
 * state is terminal (accepted, discarded, cancelled, failed) or unreadable. Never deletes `protect`ed run ids or a
 * non-terminal run. Returns the deleted run ids.
 */
export async function pruneRunDirs(runsDir: string, root: string, keep: number, protect: readonly string[] = []): Promise<string[]> {
  if (!Number.isInteger(keep) || keep < 0) throw new TypeError('keep must be a non-negative integer');
  const terminal = new Set<string>(TERMINAL_RUN_STATES);
  const deleted: string[] = [];
  for (const run of (await listRunDirs(runsDir, root)).slice(keep)) {
    if (protect.includes(run.runId)) continue;
    if (run.state !== undefined && !terminal.has(run.state)) continue;
    const st = await lstatOrUndefined(run.runDir);
    if (st === undefined || !st.isDirectory() || st.isSymbolicLink()) continue;
    await rm(run.runDir, { recursive: true, force: true });
    deleted.push(run.runId);
  }
  return deleted;
}
