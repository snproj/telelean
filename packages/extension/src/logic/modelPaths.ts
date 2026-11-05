/**
 * Paths inside a model root: the checks behind "Open in editor" (the webview's path is untrusted), the TextSource and
 * the EditApplier (the runner's paths are relative POSIX), and which file events matter to a workspace.
 * Pure apart from the optional `realpath` probe.
 */
import { realpath as fsRealpath } from 'node:fs/promises';
import * as path from 'node:path';

/** Thrown when a path would leave the model root (or is not a plain relative POSIX path). */
export class OutsideRootError extends Error {
  constructor(
    readonly file: string,
    reason: string,
  ) {
    super(`refused "${file}": ${reason}`);
    this.name = 'OutsideRootError';
  }
}

/** True when `absPath` lies strictly inside `root` (the root itself is not inside). */
export function isInside(root: string, absPath: string): boolean {
  const rel = path.relative(root, absPath);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

/** `absPath` relative to `root` as a POSIX path, or undefined when it is not inside the root. */
export function relativeModelPath(root: string, absPath: string): string | undefined {
  if (!isInside(root, absPath)) return undefined;
  return path.relative(root, absPath).split(path.sep).join('/');
}

/**
 * The absolute path of a model file given as a POSIX path relative to the root. Refuses absolute paths, backslashes,
 * NUL, and empty, `.` or `..` segments (the protocol already refuses them; the host checks again), and anything that
 * would resolve outside the root.
 */
export function resolveInsideRoot(root: string, file: string): string {
  if (file.length === 0) throw new OutsideRootError(file, 'empty path');
  if (file.startsWith('/') || /[\\\0]/.test(file)) throw new OutsideRootError(file, 'not a relative POSIX path');
  const segments = file.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) throw new OutsideRootError(file, 'empty, "." or ".." segment');
  const absPath = path.join(root, ...segments);
  if (!isInside(root, absPath)) throw new OutsideRootError(file, 'outside the model root');
  return absPath;
}

/**
 * Like `resolveInsideRoot`, and when the file exists also checks its real path (symbolic links resolved) against the
 * root's real path, so a link inside the model folder cannot open a file elsewhere.
 */
export async function resolveModelFile(root: string, file: string, realpath: (p: string) => Promise<string> = fsRealpath): Promise<string> {
  const absPath = resolveInsideRoot(root, file);
  let real: string;
  try {
    real = await realpath(absPath);
  } catch {
    return absPath; // does not exist (yet): nothing to follow
  }
  const realRoot = await realpath(root).catch(() => root);
  if (!isInside(realRoot, real)) throw new OutsideRootError(file, 'links outside the model root');
  return absPath;
}

/** The innermost root that contains `absPath`, if any. */
export function rootOfPath(roots: Iterable<string>, absPath: string): string | undefined {
  let best: string | undefined;
  for (const root of roots) {
    if (isInside(root, absPath) && (best === undefined || root.length > best.length)) best = root;
  }
  return best;
}

/** What a changed file means for a model workspace. */
export interface ModelPathEvent {
  /** POSIX path relative to the root. */
  path: string;
  /** `model`: a Lean file; `sidecar`: under `.telelean/`; `project`: lakefile.toml/.lean, lean-toolchain, lake-manifest.json. */
  kind: 'model' | 'sidecar' | 'project';
  /** A Lean refresh is due even without a save (the project's build setup changed). */
  refresh: boolean;
}

/** Directories inside a root whose files never concern the board. */
const IGNORED_DIRS = new Set(['.lake', '.git', 'node_modules']);
/**
 * Gitignored telelean outputs: writing them must not trigger anything (graph.json is rewritten after each refresh;
 * `.telelean/*.tmp` are the temp files of atomic writes).
 */
const IGNORED_SIDECARS = ['.telelean/graph.json', '.telelean/frozen/', '.telelean/sessions/'];
const PROJECT_FILES = new Set(['lakefile.toml', 'lakefile.lean', 'lean-toolchain', 'lake-manifest.json']);

/**
 * Classifies a file event under `root`: undefined for files outside the root and for files that never concern the
 * board (`.lake/`, `.git/`, `.telelean/graph.json`, non-Lean files, ...).
 */
export function classifyModelPath(root: string, absPath: string): ModelPathEvent | undefined {
  const rel = relativeModelPath(root, absPath);
  if (rel === undefined) return undefined;
  const segments = rel.split('/');
  if (segments.some((s) => IGNORED_DIRS.has(s))) return undefined;
  if (rel.startsWith('.telelean/')) {
    if (IGNORED_SIDECARS.some((ignored) => (ignored.endsWith('/') ? rel.startsWith(ignored) : rel === ignored))) return undefined;
    if (segments.length === 2 && rel.endsWith('.tmp')) return undefined;
    return { path: rel, kind: 'sidecar', refresh: false };
  }
  if (PROJECT_FILES.has(rel)) return { path: rel, kind: 'project', refresh: true };
  if (rel.endsWith('.lean')) return { path: rel, kind: 'model', refresh: false };
  return undefined;
}
