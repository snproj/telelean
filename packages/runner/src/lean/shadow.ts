/**
 * Shadow copies of a Lean model project (03 §8.4 "Shadow", 02 D-24).
 *
 * A shadow holds only the model files: every `*.lean`, plus the root `lakefile.toml` / `lakefile.lean`,
 * `lean-toolchain` and `lake-manifest.json`. Symlinks are refused outright (fail closed, nothing is
 * copied), and so is anything that is not a regular file where a model file is expected. `.lake/build`
 * is copied when present, so sandboxed builds are incremental; `.lake/packages` is not copied but
 * reported, so runLean can bind it read-only at the shadow's own path.
 */
import { constants as fsConstants } from 'node:fs';
import { copyFile, lstat, mkdir, readdir, utimes } from 'node:fs/promises';
import path from 'node:path';

/** Root-level project files that belong in a shadow besides the `*.lean` sources. */
export const PROJECT_CONFIG_FILES: readonly string[] = ['lakefile.toml', 'lakefile.lean', 'lean-toolchain', 'lake-manifest.json'];

/** Directories never walked for sources (besides every dot-directory). */
const SKIPPED_DIRS = new Set(['node_modules']);

export type ShadowErrorCode = 'source-missing' | 'symlink' | 'not-regular' | 'dest-not-empty' | 'no-lakefile';

export class ShadowError extends Error {
  constructor(
    message: string,
    readonly code: ShadowErrorCode,
    /** Offending paths, relative to the source project. */
    readonly paths: readonly string[] = [],
  ) {
    super(message);
    this.name = 'ShadowError';
  }
}

export interface ShadowOptions {
  /** Copy `.lake/build` if the source has one. Default true. */
  readonly copyBuild?: boolean;
}

export interface Shadow {
  readonly dir: string;
  readonly sourceDir: string;
  /** Model files copied, as sorted POSIX paths relative to the project root. */
  readonly files: readonly string[];
  /** Whether `.lake/build` was copied. */
  readonly copiedBuild: boolean;
  /** Number of files copied from `.lake/build`. */
  readonly buildFiles: number;
  /** The source's `.lake/packages`, for runLean's read-only bind, if it exists. */
  readonly packagesDir?: string;
}

interface Walk {
  readonly files: string[];
  readonly symlinks: string[];
  readonly irregular: string[];
}

const toPosix = (rel: string): string => rel.split(path.sep).join('/');

/** Collects model files under `root`, skipping dot-directories and SKIPPED_DIRS. */
async function walkSources(root: string): Promise<Walk> {
  const walk: Walk = { files: [], symlinks: [], irregular: [] };
  const stack: string[] = [''];
  while (stack.length > 0) {
    const rel = stack.pop() ?? '';
    const entries = await readdir(path.join(root, rel), { withFileTypes: true });
    for (const entry of entries) {
      const childRel = rel === '' ? entry.name : path.join(rel, entry.name);
      const isCandidate = entry.name.endsWith('.lean') || (rel === '' && PROJECT_CONFIG_FILES.includes(entry.name));
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !SKIPPED_DIRS.has(entry.name)) stack.push(childRel);
      } else if (entry.isSymbolicLink()) {
        // Any symlink in the model tree is refused, wherever it points.
        walk.symlinks.push(toPosix(childRel));
      } else if (entry.isFile()) {
        if (isCandidate) walk.files.push(childRel);
      } else if (isCandidate) {
        walk.irregular.push(toPosix(childRel));
      }
    }
  }
  return walk;
}

/** Collects every file under a build directory; symlinks and special files are refused. */
async function walkTree(root: string): Promise<Walk> {
  const walk: Walk = { files: [], symlinks: [], irregular: [] };
  const stack: string[] = [''];
  while (stack.length > 0) {
    const rel = stack.pop() ?? '';
    const entries = await readdir(path.join(root, rel), { withFileTypes: true });
    for (const entry of entries) {
      const childRel = rel === '' ? entry.name : path.join(rel, entry.name);
      if (entry.isDirectory()) stack.push(childRel);
      else if (entry.isSymbolicLink()) walk.symlinks.push(toPosix(childRel));
      else if (entry.isFile()) walk.files.push(childRel);
      else walk.irregular.push(toPosix(childRel));
    }
  }
  return walk;
}

async function isRealDirectory(p: string): Promise<boolean> {
  try {
    const st = await lstat(p);
    return st.isDirectory() && !st.isSymbolicLink();
  } catch {
    return false;
  }
}

/** Copies one regular file, preserving its mode and timestamps (reflink where the filesystem allows). */
async function copyPreserving(src: string, dst: string): Promise<void> {
  await mkdir(path.dirname(dst), { recursive: true });
  await copyFile(src, dst, fsConstants.COPYFILE_FICLONE | fsConstants.COPYFILE_EXCL);
  const st = await lstat(src);
  await utimes(dst, st.atime, st.mtime);
}

/**
 * Copies the model project at `sourceDir` into `destDir`, which must not exist or be empty.
 * Everything is checked before anything is copied, so a refused shadow leaves nothing behind.
 */
export async function createShadow(sourceDir: string, destDir: string, options: ShadowOptions = {}): Promise<Shadow> {
  const source = path.resolve(sourceDir);
  const dest = path.resolve(destDir);
  let st;
  try {
    st = await lstat(source);
  } catch {
    throw new ShadowError(`source project ${source} does not exist`, 'source-missing');
  }
  if (st.isSymbolicLink()) throw new ShadowError(`source project ${source} is a symlink`, 'symlink', ['.']);
  if (!st.isDirectory()) throw new ShadowError(`source project ${source} is not a directory`, 'source-missing');
  if (dest === source || dest.startsWith(source + path.sep)) {
    throw new ShadowError(`shadow ${dest} must not be inside the source project`, 'dest-not-empty');
  }

  const sources = await walkSources(source);
  const buildDir = path.join(source, '.lake', 'build');
  const copyBuild = (options.copyBuild ?? true) && (await isRealDirectory(path.join(source, '.lake'))) && (await isRealDirectory(buildDir));
  const build: Walk = copyBuild ? await walkTree(buildDir) : { files: [], symlinks: [], irregular: [] };

  const symlinks = [...sources.symlinks, ...build.symlinks.map((p) => `.lake/build/${p}`)];
  if (symlinks.length > 0) {
    throw new ShadowError(`refusing to shadow a project containing symlinks: ${symlinks.join(', ')}`, 'symlink', symlinks);
  }
  const irregular = [...sources.irregular, ...build.irregular.map((p) => `.lake/build/${p}`)];
  if (irregular.length > 0) {
    throw new ShadowError(`refusing to shadow non-regular files: ${irregular.join(', ')}`, 'not-regular', irregular);
  }
  if (!sources.files.some((f) => f === 'lakefile.toml' || f === 'lakefile.lean')) {
    throw new ShadowError(`${source} has no lakefile.toml or lakefile.lean`, 'no-lakefile');
  }

  let existing: string[] = [];
  try {
    existing = await readdir(dest);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; // ENOENT: created below
  }
  if (existing.length > 0) throw new ShadowError(`shadow directory ${dest} is not empty`, 'dest-not-empty');
  await mkdir(path.join(dest, '.lake'), { recursive: true });

  for (const rel of sources.files) await copyPreserving(path.join(source, rel), path.join(dest, rel));
  for (const rel of build.files) await copyPreserving(path.join(buildDir, rel), path.join(dest, '.lake', 'build', rel));

  const packagesDir = path.join(source, '.lake', 'packages');
  const shadow: Shadow = {
    dir: dest,
    sourceDir: source,
    files: sources.files.map(toPosix).sort(),
    copiedBuild: copyBuild,
    buildFiles: build.files.length,
    ...((await isRealDirectory(packagesDir)) ? { packagesDir } : {}),
  };
  return shadow;
}
