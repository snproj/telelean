/**
 * "telelean: Initialize Model Here" (D-28; docs/m1-plan.md sections 7.1 and 7.2): what a folder is, which files
 * opting it in creates, where model roots are, and `git init` for D-33 history.
 */
import type { Dirent } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import {
  CONFIG_PATH,
  DEFAULT_LIBRARY,
  defaultProjectConfig,
  emptyLayout,
  isSubjectName,
  layoutPath,
  libraryRootFile,
  parseProjectConfig,
  PINNED_TOOLCHAIN_NAME,
  serializeLayout,
  serializeProjectConfig,
  subjectScaffold,
  type FileChange,
} from '@telelean/core';

import { discoverRepository, runGit } from './git.js';
import type { FolderInspection, InitializeOptions } from './types.js';

/** `lakefile.toml` of a new model folder: a byte copy of `test-fixtures/spyro/lakefile.toml` (tests compare them). */
export const SCAFFOLD_LAKEFILE_TOML =
  'name = "Model"\ndefaultTargets = ["Model"]\n\n[leanOptions]\nautoImplicit = false\nrelaxedAutoImplicit = false\n\n[[lean_lib]]\nname = "Model"\n';

/** `lake-manifest.json` of a new model folder: a byte copy of `test-fixtures/spyro/lake-manifest.json` (Lake 5.0 builds with it and never rewrites it). */
export const SCAFFOLD_LAKE_MANIFEST =
  '{"version": "1.3.0",\n "packagesDir": ".lake/packages",\n "packages": [],\n "name": "Model",\n "lakeDir": ".lake",\n "fixedToolchain": false}\n';

export const SCAFFOLD_LEAN_TOOLCHAIN = `${PINNED_TOOLCHAIN_NAME}\n`;

/** The `.gitignore` lines telelean needs (build output and the unshared sidecars). */
/** (2k2, D2-109) `/.telelean/runs/`: the model's runs and its Claude consent, never shared (the folder also ignores itself). */
export const GITIGNORE_LINES: readonly string[] = ['/.lake/', '/.telelean/graph.json', '/.telelean/frozen/', '/.telelean/sessions/', '/.telelean/*.tmp', '/.telelean/runs/'];

const LIBRARY_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

async function readText(absolute: string): Promise<string | undefined> {
  try {
    return await readFile(absolute, 'utf8');
  } catch {
    return undefined;
  }
}

async function isRegularFile(absolute: string): Promise<boolean> {
  try {
    return (await stat(absolute)).isFile();
  } catch {
    return false;
  }
}

/** The facts of a `lakefile.toml` that matter here (a deliberately small reader: tables, `name = "…"`, `require`). */
export interface LakefileSummary {
  /** `name` of each `[[lean_lib]]`, in order (undefined when a table has no plain string name). */
  leanLibs: Array<string | undefined>;
  /** Names of `[[require]]` entries (or `?` when unnamed), plus `?` for an inline `require = …`. */
  requires: string[];
}

/** Reads the parts of a Lake TOML configuration that Initialize needs. Unknown syntax is ignored. */
export function readLakefileToml(text: string): LakefileSummary {
  const summary: LakefileSummary = { leanLibs: [], requires: [] };
  let table: 'lean_lib' | 'require' | 'other' | 'root' = 'root';
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    if (line === '') continue;
    const arrayTable = /^\[\[\s*([^\]]+?)\s*\]\]$/.exec(line);
    if (arrayTable) {
      const name = unquoteKey(arrayTable[1] ?? '');
      table = name === 'lean_lib' ? 'lean_lib' : name === 'require' ? 'require' : 'other';
      if (table === 'lean_lib') summary.leanLibs.push(undefined);
      if (table === 'require') summary.requires.push('?');
      continue;
    }
    if (/^\[[^\]]*\]$/.test(line)) {
      table = 'other';
      continue;
    }
    const keyValue = /^([A-Za-z0-9_."'-]+)\s*=\s*(.*)$/.exec(line);
    if (!keyValue) continue;
    const key = unquoteKey(keyValue[1] ?? '');
    const value = keyValue[2] ?? '';
    if (table === 'root' && (key === 'require' || key.startsWith('require.'))) summary.requires.push('?');
    if (key !== 'name') continue;
    const name = tomlString(value);
    if (table === 'lean_lib' && name !== undefined) summary.leanLibs[summary.leanLibs.length - 1] = name;
    if (table === 'require' && name !== undefined) summary.requires[summary.requires.length - 1] = name;
  }
  return summary;
}

function stripTomlComment(line: string): string {
  let quote: string | undefined;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === '\\' && quote === '"') i++;
      else if (c === quote) quote = undefined;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '#') return line.slice(0, i);
  }
  return line;
}

function unquoteKey(key: string): string {
  return key.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
}

function tomlString(value: string): string | undefined {
  const match = /^"((?:[^"\\]|\\.)*)"\s*$/.exec(value.trim()) ?? /^'([^']*)'\s*$/.exec(value.trim());
  return match ? (match[1] ?? '') : undefined;
}

/** Names of the packages a `lake-manifest.json` lists, or undefined when it is not a manifest. */
export function manifestPackages(text: string): string[] | undefined {
  try {
    const raw = JSON.parse(text) as { packages?: unknown };
    if (!Array.isArray(raw.packages)) return undefined;
    return raw.packages.map((p) => (typeof (p as { name?: unknown })?.name === 'string' ? (p as { name: string }).name : '?'));
  } catch {
    return undefined;
  }
}

function dependencyReason(names: readonly string[]): string {
  const listed = [...new Set(names.filter((n) => n !== '?'))];
  const which = listed.length > 0 ? ` (${listed.join(', ')})` : '';
  return `This project has Lake dependencies${which}: not supported in M1, which checks only dependency-free models. Mathlib needs an explicit opt-in (M4).`;
}

async function hasLeanFile(absoluteDir: string, depth = 0): Promise<boolean> {
  if (depth > 8) return false;
  let entries: Dirent[];
  try {
    entries = await readdir(absoluteDir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.lean')) return true;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.') && (await hasLeanFile(path.join(absoluteDir, entry.name), depth + 1))) return true;
  }
  return false;
}

/** What "Initialize Model Here" would do in `root` (docs/m1-plan.md section 7.2). */
export async function inspectFolder(root: string): Promise<FolderInspection> {
  const abs = path.resolve(root);
  let entries: Dirent[];
  try {
    entries = await readdir(abs, { withFileTypes: true });
  } catch (error) {
    return { kind: 'unsupported', reason: `${abs} cannot be read: ${(error as Error).message}` };
  }
  const configText = await readText(path.join(abs, CONFIG_PATH));
  if (configText !== undefined) return { kind: 'model', config: parseProjectConfig(configText) };

  const gitignore = await readText(path.join(abs, '.gitignore'));
  const withGitignore = <T extends object>(value: T): T & { gitignore?: string } => (gitignore !== undefined ? { ...value, gitignore } : value);
  const visible = entries.filter((e) => !e.name.startsWith('.'));
  if (visible.length === 0) return withGitignore({ kind: 'empty' as const });

  const has = (name: string): boolean => entries.some((e) => e.name === name && e.isFile());
  if (has('lakefile.toml') && has('lakefile.lean')) {
    return {
      kind: 'unsupported',
      reason: 'This folder has both lakefile.lean and lakefile.toml; Lake uses lakefile.lean, and telelean M1 reads lakefile.toml only. Remove one of them.',
    };
  }
  if (!has('lakefile.toml')) {
    if (has('lakefile.lean')) {
      return {
        kind: 'unsupported',
        reason: 'This Lake project is configured by lakefile.lean; telelean M1 needs lakefile.toml (Lake can convert it: `lake translate-config toml`).',
      };
    }
    return {
      kind: 'unsupported',
      reason: 'This folder has files but no Lake project (lakefile.toml). Initialize telelean in an empty folder, or in a Lake project.',
    };
  }
  const lakefile = readLakefileToml((await readText(path.join(abs, 'lakefile.toml'))) ?? '');
  if (lakefile.requires.length > 0) return { kind: 'unsupported', reason: dependencyReason(lakefile.requires) };
  if (lakefile.leanLibs.length === 0) return { kind: 'unsupported', reason: 'lakefile.toml declares no [[lean_lib]]: telelean keeps the model in a Lake library.' };
  const library = lakefile.leanLibs[0];
  if (library === undefined || !LIBRARY_NAME_PATTERN.test(library)) {
    return { kind: 'unsupported', reason: `The first [[lean_lib]] of lakefile.toml needs a plain identifier as its name (found ${JSON.stringify(library ?? '')}).` };
  }
  const manifestText = await readText(path.join(abs, 'lake-manifest.json'));
  if (manifestText === undefined) {
    return { kind: 'unsupported', reason: 'lake-manifest.json is missing: telelean checks the project in a read-only sandbox, where Lake cannot create it.' };
  }
  const packages = manifestPackages(manifestText);
  if (packages === undefined) return { kind: 'unsupported', reason: 'lake-manifest.json is not a valid Lake manifest.' };
  if (packages.length > 0) return { kind: 'unsupported', reason: dependencyReason(packages) };

  const subjects: string[] = [];
  let libraryEntries: Dirent[] = [];
  try {
    libraryEntries = await readdir(path.join(abs, library), { withFileTypes: true });
  } catch {
    // no library directory yet: no subjects
  }
  for (const entry of libraryEntries) {
    if (entry.isDirectory() && isSubjectName(entry.name) && (await hasLeanFile(path.join(abs, library, entry.name)))) subjects.push(entry.name);
  }
  return withGitignore({ kind: 'lake-project' as const, library, subjects: subjects.sort() });
}

/** `.gitignore` after adding the lines telelean needs that are missing (equivalent spellings count as present). */
export function gitignoreWithTeleleanLines(before: string | undefined): string {
  const normalise = (line: string): string => line.trim().replace(/^\//, '').replace(/\/$/, '');
  const present = new Set((before ?? '').split(/\r?\n/).map(normalise));
  const missing = GITIGNORE_LINES.filter((line) => !present.has(normalise(line)));
  if (before === undefined) return `${GITIGNORE_LINES.join('\n')}\n`;
  if (missing.length === 0) return before;
  const eol = before.includes('\r\n') ? '\r\n' : '\n';
  const base = before === '' || before.endsWith('\n') ? before : `${before}${eol}`;
  return `${base}${missing.join(eol)}${eol}`;
}

/**
 * The files Initialize creates (docs/m1-plan.md section 7.2). Throws TypeError for a `model` or `unsupported`
 * inspection, and for an invalid subject name when scaffolding an empty folder (a Lake project keeps its own
 * subjects, so `subject` is not used there).
 */
export function planInitialize(options: InitializeOptions): FileChange[] {
  const { inspection } = options;
  if (inspection.kind === 'model' || inspection.kind === 'unsupported') {
    throw new TypeError(`cannot initialize a folder that is ${inspection.kind === 'model' ? 'already a telelean model' : 'not supported'}`);
  }
  const gitignoreChange = (): FileChange | undefined => {
    const before = inspection.gitignore;
    const after = gitignoreWithTeleleanLines(before);
    return before === after ? undefined : { path: '.gitignore', before: before ?? null, after };
  };
  const created = (rel: string, text: string): FileChange => ({ path: rel, before: null, after: text });

  if (inspection.kind === 'empty') {
    const subject = options.subject;
    if (!isSubjectName(subject)) throw new TypeError(`"${subject}" is not a subject name: use a capitalised Lean identifier (letters, digits, "_")`);
    const changes: FileChange[] = [
      created('lakefile.toml', SCAFFOLD_LAKEFILE_TOML),
      created('lean-toolchain', SCAFFOLD_LEAN_TOOLCHAIN),
      created('lake-manifest.json', SCAFFOLD_LAKE_MANIFEST),
    ];
    const gitignore = gitignoreChange();
    if (gitignore) changes.push(gitignore);
    changes.push(created(libraryRootFile(DEFAULT_LIBRARY), `import ${DEFAULT_LIBRARY}.${subject}\n`));
    for (const file of subjectScaffold(subject, DEFAULT_LIBRARY)) changes.push(created(file.path, file.text));
    changes.push(created(CONFIG_PATH, serializeProjectConfig(defaultProjectConfig())));
    changes.push(created(layoutPath(subject), serializeLayout(emptyLayout())));
    return changes;
  }

  const changes: FileChange[] = [created(CONFIG_PATH, serializeProjectConfig({ ...defaultProjectConfig(), library: inspection.library }))];
  const gitignore = gitignoreChange();
  if (gitignore) changes.push(gitignore);
  for (const subject of [...new Set(inspection.subjects)].filter(isSubjectName).sort()) changes.push(created(layoutPath(subject), serializeLayout(emptyLayout())));
  return changes;
}

/**
 * The default first-subject name for a folder: its name as a capitalised identifier (`mental_model` ->
 * `MentalModel`; characters outside `[A-Za-z0-9]` separate words and are dropped), else `Subject`.
 */
export function suggestSubjectName(folderName: string): string {
  const words = folderName.split(/[^A-Za-z0-9]+/).filter((w) => w !== '');
  const name = words
    .map((w) => `${w.charAt(0).toUpperCase()}${w.slice(1)}`)
    .join('')
    .slice(0, 64);
  return isSubjectName(name) ? name : 'Subject';
}

/** Model roots (directories holding `.telelean/config.json`) under `folder`, nested ones included, sorted. */
export async function findModelRoots(
  folder: string,
  excludedDirs: readonly string[],
  maxDepth: number,
): Promise<string[]> {
  const excluded = new Set(excludedDirs);
  const roots: string[] = [];
  const queue: Array<{ dir: string; depth: number }> = [{ dir: path.resolve(folder), depth: 0 }];
  while (queue.length > 0) {
    const { dir, depth } = queue.shift() ?? { dir: '', depth: 0 };
    if (await isRegularFile(path.join(dir, CONFIG_PATH))) roots.push(dir);
    if (depth >= maxDepth) continue;
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && !excluded.has(entry.name)) queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
    }
  }
  return roots.sort();
}

/**
 * `git init` in `root` with telelean's safe settings, refusing when `root` is already inside a repository (or
 * when git cannot tell). Never adds remotes and never commits to a branch.
 */
export async function initGitRepository(root: string, gitPath = 'git'): Promise<void> {
  const abs = path.resolve(root);
  let st;
  try {
    st = await stat(abs);
  } catch {
    throw new Error(`${abs} does not exist`);
  }
  if (!st.isDirectory()) throw new Error(`${abs} is not a directory`);
  const repo = await discoverRepository(gitPath, abs);
  if (repo !== 'no-repo') throw new Error(`${abs} is already inside the git repository at ${repo.topLevel}`);
  await runGit(gitPath, ['init', '--quiet'], { cwd: abs });
}
