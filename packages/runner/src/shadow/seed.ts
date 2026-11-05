/**
 * Seeding a run's build mirror from the user's `.lake/build` (docs/m2-plan.md section 4.2; decisions-log sections 30
 * and 31).
 *
 * OFF BY DEFAULT (closing round 1): `createRunShadow` copies nothing unless `copyBuild` is set, and the RunManager sets
 * it only when the user turned `telelean.run.reuseLeanBuild` on. Without a seed the run's first Lean job builds the
 * model from scratch (a second or two for a small model), which is always correct. Lake writes the user's `.lake/build`
 * while runs start (the board's in-place refresh, the Lean extension, a `lake build` in a terminal), and fixer round 3's
 * checks of the live tree could not rule out a snapshot of a build in progress (a module without its outputs, or modules
 * of two versions of the files).
 *
 * With the setting on, the seed is what `.lake/build` held right after the board's last refresh, untouched since; that
 * includes whatever another program wrote there while the refresh ran:
 *   - `noteRefreshOutput` runs inside the board's refresh job (`semantic.runExclusive`; the model workspace calls it)
 *     right after the refresh. It records the build tree (every directory and regular file: device, inode, size, mtime,
 *     ctime) only after a refresh whose build and check succeeded with every module fresh (no source changed while it
 *     ran), and only when the tree looks like a complete build: every fresh module has its `.olean`, `.ilean` and
 *     `.trace`, no artifact is newer than its trace (Lake 4.35 deletes a module's artifacts before rebuilding it and
 *     writes the trace last), no Lake lock and no temporary file younger than 10 minutes. Any other refresh forgets the
 *     record. These checks see which files exist and their times, not which version of the sources a module was built
 *     from: a module that another program (a terminal `lake build`, the Lean extension) finished rebuilding from other
 *     versions of the files while the refresh ran, outputs and trace alike, passes them, so a record can hold modules
 *     of two versions (closing round 2: the closing round 1 verifier's probe recorded and seeded such trees, the write
 *     landing mostly in the refresh's check phase).
 *   - `seedFromRefreshOutput` runs inside `semantic.runExclusive` too (so the board's refresh cannot run meanwhile). It
 *     copies the tree only when a listing taken now equals the record, re-checks every file right after its copy, and
 *     lists the tree again after the copy, which must still equal the record. Any write, create, remove or rename gives
 *     the file or its directory a new ctime (on Linux 6.13 or newer, ext4, xfs, btrfs and tmpfs give a change made after
 *     a stat a ctime different from the one that stat saw), so a tree another process touched after the record is never
 *     used, and neither is one touched while it was copied.
 * Correctness rests on Lake's per-module check, not on the seed: in the mirror Lake compares every module's trace with
 * the run's own sources (which can differ from the refresh's anyway: open buffers, the start's premises declaration)
 * and rebuilds each module that does not match, so a seed of two versions only costs those rebuilds. Lake does not
 * re-read a module's outputs when its trace matches, so two Lake builds writing the same module at the same moment
 * (Lake 4.35 takes no build lock) could leave outputs it wrongly trusts, in the user's own `.lake/build` as in a seed
 * of it; with the setting off, nothing of the user's build enters a run.
 * In every other case nothing is seeded: build/.lake stays absent and the outcome says why (the RunManager logs it).
 * Seeding never refuses a start (a symlink or special file in `.lake/build` only means no seed; nothing of it is
 * copied) and never reaches the gate: it happens before the run starts, and a run without a seed is only slower.
 */
import { constants as fsConstants, type BigIntStats, type Dirent } from 'node:fs';
import { copyFile, lstat, mkdir, readdir, rm, utimes } from 'node:fs/promises';
import path from 'node:path';

import type { LeanFacts } from '@telelean/core';

import type { BuildSeedOutcome } from './types.js';

/** A temporary file of Lean or Lake (Lean writes an `.olean` under a temporary name and renames it). */
const TEMP_NAME = /\.tmp(?:\.[^/]*)?$/u;
/** The build lock of Lake versions that hold one while building (4.35 holds none); a copied one would stall the mirror's Lake. */
const LAKE_LOCK = 'lake.lock';
/** A temporary file older than this is a leftover of a crashed build, not a write in progress: it is skipped, not copied. */
export const STALE_TEMP_MS = 10 * 60 * 1000;
/**
 * A module's artifacts beside its trace `<leanLibDir>/<M>.trace` (Lake 4.35 `Module.oleanFile` … `irSigFile`) and in
 * `<irDir>/<M>.*` (`cFile`, `bcFile`); Lake's default directories `lib/lean` and `ir`. A target with its own trace
 * `<file>.trace` has the artifact `<file>`. Not compared: `.hash` files (written lazily), `.setup.json` (an input),
 * `.ltar` (packed on demand from the artifacts).
 */
const LIB_ARTIFACTS = ['olean', 'olean.server', 'olean.private', 'ilean', 'ir', 'ir.sig'];
const IR_ARTIFACTS = ['c', 'bc'];
const LIB_DIR = 'lib/lean/';
const IR_DIR = 'ir/';
/** What every module the refresh reported fresh must have in `lib/lean` for the tree to count as a complete build. */
const REQUIRED_OUTPUTS = ['olean', 'ilean', 'trace'];

/** One directory or regular file below the user's `.lake/build`. */
interface BuildEntry {
  /** Relative to `.lake/build`, POSIX; '' is `.lake/build` itself. */
  rel: string;
  dir: boolean;
  st: BigIntStats;
}

/** A listing of a `<root>/.lake/build` tree. */
interface BuildListing {
  buildDir: string;
  /** Every directory and regular file, sorted by path. */
  entries: BuildEntry[];
  /** Set when the tree cannot be seeded at all: it holds a symlink or special file, or a part vanished or changed type while it was listed. */
  problem?: string;
}

/** Test hooks of `seedFromRefreshOutput` (never used by telelean itself). */
export interface SeedHooks {
  /** Called after each file was copied and re-checked, with its path relative to `.lake/build`. */
  afterCopy?: (rel: string) => void | Promise<void>;
}

const isGone = (error: unknown): boolean => {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
};
const shown = (rel: string): string => (rel === '' ? '.lake/build' : `.lake/build/${rel}`);
const byRel = (a: BuildEntry, b: BuildEntry): number => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0);

async function isRealDirectory(p: string): Promise<boolean> {
  try {
    const st = await lstat(p);
    return st.isDirectory() && !st.isSymbolicLink();
  } catch (error) {
    if (isGone(error)) return false;
    throw error;
  }
}

/**
 * Lists `<root>/.lake/build` without following symlinks: undefined when there is none (or `.lake` or `.lake/build` is a
 * symlink, which is simply not seeded). Each directory is stat'ed before its entries are read, so a change while it is
 * listed shows up as a difference from the record, never as a match. Throws only for unexpected I/O errors.
 */
async function listBuild(root: string): Promise<BuildListing | undefined> {
  const lake = path.join(root, '.lake');
  const buildDir = path.join(lake, 'build');
  if (!(await isRealDirectory(lake)) || !(await isRealDirectory(buildDir))) return undefined;
  const entries: BuildEntry[] = [];
  let problem: string | undefined;
  const stack = [''];
  while (stack.length > 0 && problem === undefined) {
    const rel = stack.pop() ?? '';
    const dirPath = path.join(buildDir, rel);
    let st: BigIntStats;
    let children: Dirent[];
    try {
      st = await lstat(dirPath, { bigint: true });
      if (!st.isDirectory()) {
        problem = `${shown(rel)} changed while it was listed`;
        break;
      }
      children = await readdir(dirPath, { withFileTypes: true });
    } catch (error) {
      if (!isGone(error)) throw error;
      problem = `${shown(rel)} disappeared while it was listed`;
      break;
    }
    entries.push({ rel, dir: true, st });
    for (const child of children) {
      const childRel = rel === '' ? child.name : `${rel}/${child.name}`;
      if (child.isDirectory()) stack.push(childRel);
      else if (!child.isFile()) problem ??= `${shown(childRel)} is a symlink or special file (never copied)`;
      else {
        try {
          const fst = await lstat(path.join(buildDir, childRel), { bigint: true });
          if (fst.isFile()) entries.push({ rel: childRel, dir: false, st: fst });
          else problem ??= `${shown(childRel)} changed while it was listed`;
        } catch (error) {
          if (!isGone(error)) throw error;
          problem ??= `${shown(childRel)} disappeared while it was listed`;
        }
      }
    }
  }
  entries.sort(byRel);
  return { buildDir, entries, ...(problem !== undefined ? { problem } : {}) };
}

/** Same entry, unchanged: device, inode, size, mtime and ctime (ctime moves on every write, rename, link change or utimes). */
function sameStat(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}

/** How `now` differs from the record `then` (the first difference, in plain words), or undefined when it is the same tree. */
function difference(then: BuildListing, now: BuildListing | undefined, when: string): string | undefined {
  if (now === undefined) return `.lake/build disappeared ${when}`;
  if (now.problem !== undefined) return now.problem;
  const later = new Map(now.entries.map((e) => [e.rel, e]));
  for (const e of then.entries) {
    const n = later.get(e.rel);
    if (n === undefined) return `${shown(e.rel)} disappeared ${when}`;
    if (n.dir !== e.dir || !sameStat(e.st, n.st)) return `${shown(e.rel)} changed ${when}`;
    later.delete(e.rel);
  }
  const [added] = later.keys();
  return added === undefined ? undefined : `${shown(added)} appeared ${when}`;
}

/** The first artifact newer than its trace (see the module comment), as a reason; undefined when there is none. */
export function artifactNewerThanTrace(files: ReadonlyArray<{ rel: string; st: Pick<BigIntStats, 'mtimeNs'> }>): string | undefined {
  const index = new Map(files.map((f) => [f.rel, f]));
  for (const trace of files) {
    if (!trace.rel.endsWith('.trace')) continue;
    const stem = trace.rel.slice(0, -'.trace'.length);
    const artifacts = [stem, ...LIB_ARTIFACTS.map((ext) => `${stem}.${ext}`)];
    if (stem.startsWith(LIB_DIR)) artifacts.push(...IR_ARTIFACTS.map((ext) => `${IR_DIR}${stem.slice(LIB_DIR.length)}.${ext}`));
    for (const rel of artifacts) {
      const artifact = index.get(rel);
      if (artifact !== undefined && artifact.st.mtimeNs > trace.st.mtimeNs) return `${shown(rel)} is newer than its trace ${shown(trace.rel)} (a build is running or was interrupted)`;
    }
  }
  return undefined;
}

/**
 * Why a listed tree does not look like one complete build of the refresh's modules (a Lake lock, a fresh temporary
 * file, an artifact newer than its trace, a fresh module without its `.olean`, `.ilean` or `.trace`), or undefined.
 * It cannot tell two complete builds of different source versions apart (see the module comment).
 */
function incompleteReason(files: readonly BuildEntry[], modules: LeanFacts['modules'], nowMs: number): string | undefined {
  for (const f of files) {
    const name = path.posix.basename(f.rel);
    if (name === LAKE_LOCK) return `Lake's build lock ${shown(f.rel)} exists (a build is running)`;
    if (TEMP_NAME.test(name) && nowMs - Number(f.st.mtimeMs) < STALE_TEMP_MS) return `${shown(f.rel)} is being written (a build is running)`;
  }
  const newer = artifactNewerThanTrace(files);
  if (newer !== undefined) return newer;
  const present = new Set(files.map((f) => f.rel));
  for (const m of modules) {
    if (m.state !== 'fresh') continue;
    const stem = `${LIB_DIR}${m.file.replace(/\.lean$/u, '')}`;
    for (const ext of REQUIRED_OUTPUTS) {
      if (!present.has(`${stem}.${ext}`)) return `${shown(`${stem}.${ext}`)} is missing (${m.name} is not completely built)`;
    }
  }
  return undefined;
}

/** What `.lake/build` held right after the board's last recorded refresh, per model root (`path.resolve(root)` -> its listing); see the module comment. */
const refreshOutputs = new Map<string, BuildListing>();

/**
 * Records, or forgets, what the board's refresh left in `<root>/.lake/build` (see the module comment). Call it inside
 * the refresh's own `semantic.runExclusive` job, right after the refresh, with its facts (undefined for a refresh that
 * was cancelled or threw). Returns why nothing was recorded, or undefined when the tree was recorded. Never throws.
 */
export async function noteRefreshOutput(
  root: string,
  facts: Pick<LeanFacts, 'status' | 'modules'> | undefined,
  nowMs: number = Date.now(),
): Promise<string | undefined> {
  const key = path.resolve(root);
  refreshOutputs.delete(key);
  if (facts === undefined) return 'the refresh did not finish';
  if (facts.status !== 'ok') return `the refresh ended with ${facts.status}`;
  const unsettled = facts.modules.find((m) => m.state !== 'fresh' && m.state !== 'not-built');
  if (unsettled !== undefined) return `${unsettled.file} was ${unsettled.state} after the refresh`;
  try {
    const listing = await listBuild(key);
    if (listing === undefined) return 'there is no .lake/build';
    const reason = listing.problem ?? incompleteReason(listing.entries.filter((e) => !e.dir), facts.modules, nowMs);
    if (reason !== undefined) return reason;
    refreshOutputs.set(key, listing);
    return undefined;
  } catch (error) {
    return `.lake/build could not be listed (${(error as Error).message})`;
  }
}

/**
 * Copies `<root>/.lake/build` into `<mirror>/.lake/build`, keeping each file's times, when it is exactly what
 * `noteRefreshOutput` recorded for the root (see the module comment); otherwise removes whatever it copied and seeds
 * nothing. Call it inside `semantic.runExclusive`. Never throws: the outcome says why nothing was seeded.
 */
export async function seedFromRefreshOutput(root: string, mirror: string, hooks: SeedHooks = {}): Promise<BuildSeedOutcome> {
  const key = path.resolve(root);
  const lakeDir = path.join(mirror, '.lake');
  const skip = async (reason: string): Promise<BuildSeedOutcome> => {
    await rm(lakeDir, { recursive: true, force: true }).catch(() => undefined);
    return { files: 0, skipped: reason };
  };
  const recorded = refreshOutputs.get(key);
  if (recorded === undefined) return skip('no finished Lean check of the board has been recorded for this build since the window opened');
  try {
    const changed = difference(recorded, await listBuild(key), "since the board's last Lean check (another program wrote it)");
    if (changed !== undefined) {
      // It can never match again (the ctimes moved on); the next finished refresh records the tree anew.
      if (refreshOutputs.get(key) === recorded) refreshOutputs.delete(key);
      return skip(changed);
    }
    const target = path.join(lakeDir, 'build');
    let copied = 0;
    for (const f of recorded.entries) {
      // Directories come with their files; temporary files are a crashed build's leftovers (fresh ones are never recorded).
      if (f.dir || TEMP_NAME.test(path.posix.basename(f.rel))) continue;
      const source = path.join(recorded.buildDir, f.rel);
      const destination = path.join(target, f.rel);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(source, destination, fsConstants.COPYFILE_FICLONE);
      if (!sameStat(f.st, await lstat(source, { bigint: true }))) return skip(`${shown(f.rel)} changed while it was copied`);
      await utimes(destination, f.st.atime, f.st.mtime);
      copied++;
      await hooks.afterCopy?.(f.rel);
    }
    const after = difference(recorded, await listBuild(key), 'while it was copied');
    if (after !== undefined) return skip(after);
    return { files: copied };
  } catch (error) {
    if (isGone(error)) return skip(`.lake/build changed while it was copied (${(error as Error).message})`);
    return skip(`.lake/build could not be copied (${(error as Error).message})`);
  }
}
