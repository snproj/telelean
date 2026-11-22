/**
 * Which files of a model root the workspace reads, snapshots and reverts (docs/m1-plan.md sections 2, 7.1, 8).
 * Listings come from the file system (dot-directories, `.lake` and `node_modules` skipped, symlinks never followed);
 * contents always come from the TextSource (open buffers first).
 */
import type { Dirent } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';

import { inScope, isSubjectName, libraryRootFile, projectSnapshotScope, subjectOfPath, subjectSidecarDir, TELELEAN_DIR } from '@telelean/core';

import type { SnapshotScope } from './history.js';

/** Directory names never walked inside a model root (besides every dot-directory). */
const SKIPPED_DIRS: ReadonlySet<string> = new Set(['node_modules', '.lake']);

const LAYOUT_PATH_PATTERN = /^\.telelean\/subjects\/([^/]+)\/layout\.json$/;
/** Slice 2f (docs/slice2-plan.md 2.6, D2-18): a subject's endorsed definitions, written by Apply inside its history entry. */
const ENDORSEMENTS_PATH_PATTERN = /^\.telelean\/subjects\/([^/]+)\/endorsements\.json$/;
const SIDECAR_PATH_PATTERN = /^\.telelean\/subjects\/([^/]+)\//;

/** A regular file (a symlink is not followed, so it never counts). */
export async function isFile(absolute: string): Promise<boolean> {
  try {
    return (await lstat(absolute)).isFile();
  } catch {
    return false;
  }
}

async function entriesOf(absolute: string): Promise<Dirent[]> {
  try {
    return await readdir(absolute, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * Regular files under `root/relDir` (POSIX paths relative to `root`), skipping dot-directories, `.lake`,
 * `node_modules` and symlinks; `accept` filters by file name.
 */
export async function walkFiles(root: string, relDir: string, accept: (name: string) => boolean = () => true): Promise<string[]> {
  const out: string[] = [];
  const stack = [relDir];
  while (stack.length > 0) {
    const rel = stack.pop() ?? '';
    for (const entry of await entriesOf(path.join(root, rel))) {
      const child = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !SKIPPED_DIRS.has(entry.name)) stack.push(child);
      } else if (entry.isFile() && accept(entry.name)) {
        out.push(child);
      }
    }
  }
  return out.sort();
}

/** `<library>.lean` and `<library>/**.lean`, sorted. */
export async function listModelFiles(root: string, library: string): Promise<string[]> {
  const files = await walkFiles(root, library, (name) => name.endsWith('.lean'));
  if (await isFile(path.join(root, libraryRootFile(library)))) files.unshift(libraryRootFile(library));
  return files.sort();
}

/** `.telelean/subjects/<S>/layout.json` for every subject name S that has one. */
export async function listLayoutFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await entriesOf(path.join(root, TELELEAN_DIR, 'subjects'))) {
    if (!entry.isDirectory() || !isSubjectName(entry.name)) continue;
    const rel = `${TELELEAN_DIR}/subjects/${entry.name}/layout.json`;
    if (await isFile(path.join(root, rel))) out.push(rel);
  }
  return out.sort();
}

/** Slice 2f (D2-18): `.telelean/subjects/<S>/endorsements.json` for every subject name S that has one. */
export async function listEndorsementFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await entriesOf(path.join(root, TELELEAN_DIR, 'subjects'))) {
    if (!entry.isDirectory() || !isSubjectName(entry.name)) continue;
    const rel = `${TELELEAN_DIR}/subjects/${entry.name}/endorsements.json`;
    if (await isFile(path.join(root, rel))) out.push(rel);
  }
  return out.sort();
}

/** True for `<library>.lean` and `<library>/**.lean`. */
export function isModelFile(rel: string, library: string): boolean {
  return rel === libraryRootFile(library) || (rel.startsWith(`${library}/`) && rel.endsWith('.lean'));
}

/**
 * M2: the project files a run's shadow carries besides the model files (docs/m2-plan.md section 4.2: lakefile,
 * toolchain, manifest), in the order `ModelWorkspace.modelFiles()` reports the present ones. Never `.gitignore` or
 * anything under `.telelean/` (the shadow's root holds no dot-entry).
 */
export const PROJECT_FILES: readonly string[] = ['lakefile.toml', 'lakefile.lean', 'lean-toolchain', 'lake-manifest.json'];

/** M2: a model file or one of PROJECT_FILES (the files a shadow, a proposal and Accept deal with). */
export function isModelOrProjectFile(rel: string, library: string): boolean {
  return isModelFile(rel, library) || PROJECT_FILES.includes(rel);
}

const ATTEMPTS_PATH_PATTERN = /^\.telelean\/subjects\/([^/]+)\/attempts\.jsonl$/;

/** M2: the subject whose `attempts.jsonl` `rel` is, if it is one. */
export function attemptsSubject(rel: string): string | undefined {
  const subject = ATTEMPTS_PATH_PATTERN.exec(rel)?.[1];
  return subject !== undefined && isSubjectName(subject) ? subject : undefined;
}

/** Slice 2f (D2-18): the subject whose `endorsements.json` `rel` is, if it is one. */
export function endorsementsSubject(rel: string): string | undefined {
  const subject = ENDORSEMENTS_PATH_PATTERN.exec(rel)?.[1];
  return subject !== undefined && isSubjectName(subject) ? subject : undefined;
}

/** The subject whose layout file `rel` is, if it is one. */
export function layoutSubject(rel: string): string | undefined {
  const subject = LAYOUT_PATH_PATTERN.exec(rel)?.[1];
  return subject !== undefined && isSubjectName(subject) ? subject : undefined;
}

/** The subject whose snapshot scope holds `rel` (module files and sidecars), if any. */
export function scopeSubject(rel: string, library: string): string | undefined {
  const sidecar = SIDECAR_PATH_PATTERN.exec(rel)?.[1];
  if (sidecar !== undefined) return isSubjectName(sidecar) ? sidecar : undefined;
  if (!isModelFile(rel, library)) return undefined;
  const subject = subjectOfPath(rel, library);
  return subject !== undefined && isSubjectName(subject) ? subject : undefined;
}

/** Subject names from a list of model file paths (the core rule: `<library>/<S>.lean` or a `.lean` file under `<library>/<S>/`). */
export function subjectNamesOf(paths: Iterable<string>, library: string): string[] {
  const names = new Set<string>();
  for (const rel of paths) {
    if (!isModelFile(rel, library)) continue;
    const subject = subjectOfPath(rel, library);
    if (subject !== undefined && isSubjectName(subject)) names.add(subject);
  }
  return [...names].sort();
}

/** The snapshot scopes (subject chains, then the project chain) that a set of changed paths touches. */
export function scopesOf(paths: Iterable<string>, library: string): SnapshotScope[] {
  const subjects = new Set<string>();
  let project = false;
  for (const rel of paths) {
    const subject = scopeSubject(rel, library);
    if (subject !== undefined) subjects.add(subject);
    if (inScope(rel, projectSnapshotScope(library))) project = true;
  }
  const scopes: SnapshotScope[] = [...subjects].sort().map((subject) => ({ kind: 'subject', subject }));
  if (project) scopes.push({ kind: 'project' });
  return scopes;
}

/**
 * The sidecar files of a subject that its history covers: `layout.json` and the attic's `.lean` files, which
 * telelean writes (UTF-8 text), and (slice 2f, D2-18) `endorsements.json`, which an Apply writes inside its history
 * entry, so that History's snapshots and the Apply's Undo cover it. Anything else a user drops into
 * `.telelean/subjects/<S>/` (a picture, notes) is never snapshotted, reverted or deleted: it would not survive being
 * read as text.
 */
export function isSubjectSidecarFile(rel: string, subject: string): boolean {
  const dir = `${subjectSidecarDir(subject)}/`;
  if (!rel.startsWith(dir)) return false;
  const rest = rel.slice(dir.length);
  return rest === 'layout.json' || rest === 'endorsements.json' || /^attic\/[^/]+\.lean$/.test(rest);
}

/** True for the files a subject's snapshots cover: its root file, the `.lean` files under its directory, its sidecars. */
export function isSubjectScopeFile(rel: string, subject: string, library: string): boolean {
  if (rel === `${library}/${subject}.lean`) return true;
  if (rel.startsWith(`${library}/${subject}/`)) return rel.endsWith('.lean');
  return isSubjectSidecarFile(rel, subject);
}

/**
 * The files a snapshot of `scope` covers, as they exist now: for a subject its root file, the `.lean` files under
 * its module directory and its sidecar files (`isSubjectSidecarFile`); for the project the fixed project files.
 */
export async function listScopeFiles(root: string, scope: SnapshotScope, library: string): Promise<string[]> {
  if (scope.kind === 'project') {
    const out: string[] = [];
    for (const rel of projectSnapshotScope(library)) if (await isFile(path.join(root, rel))) out.push(rel);
    return out.sort();
  }
  const subject = scope.subject;
  const out = await walkFiles(root, `${library}/${subject}`, (name) => name.endsWith('.lean'));
  const rootFile = `${library}/${subject}.lean`;
  if (await isFile(path.join(root, rootFile))) out.push(rootFile);
  out.push(...(await walkFiles(root, subjectSidecarDir(subject))).filter((rel) => isSubjectSidecarFile(rel, subject)));
  return out.sort();
}

/** Converts a path the host passed (relative POSIX, or absolute inside the root) to the relative form, or undefined. */
export function toRelative(root: string, p: string): string | undefined {
  const rel = path.isAbsolute(p) ? path.relative(root, p).split(path.sep).join('/') : p.replace(/\\/g, '/');
  if (rel === '' || rel.startsWith('/') || rel.split('/').some((s) => s === '' || s === '.' || s === '..')) return undefined;
  return rel;
}

/** A path inside the root, for changes the workspace writes or materialises. Throws for anything else. */
export function assertRelativePath(rel: string): void {
  if (rel === '' || rel.startsWith('/') || /[\\\0]/.test(rel) || rel.split('/').some((s) => s === '' || s === '.' || s === '..')) {
    throw new TypeError(`not a relative POSIX path inside the model root: ${JSON.stringify(rel)}`);
  }
}

