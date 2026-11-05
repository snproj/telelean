/**
 * The model project as the semantic layer sees it (docs/m1-plan.md section 4, steps 2, 3 and 5): the pinned
 * toolchain, the dependency-free Lake manifest, the library's modules (source text, sha256, imports) and the state
 * of each module after a build.
 */
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, type Dirent } from 'node:fs';
import path from 'node:path';

import type { ModuleFacts } from '@telelean/core';

import { isValidModuleName } from '../lean/leanNames.js';
import { PINNED_TOOLCHAIN } from '../lean/toolchain.js';
import { parseImports } from './text.js';

export type ModuleState = ModuleFacts['state'];

/** sha256 (hex) of a text's UTF-8 encoding: what core compares with `ModuleFacts.sourceSha256`. */
export function sha256Text(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** The project's `lean-toolchain`, trimmed (`''` when missing), and why it cannot be checked, if it cannot. */
export function readProjectToolchain(root: string): { toolchain: string; problem?: string } {
  let toolchain: string;
  try {
    toolchain = readFileSync(path.join(root, 'lean-toolchain'), 'utf8').trim();
  } catch (e) {
    const missing = (e as NodeJS.ErrnoException).code === 'ENOENT';
    return { toolchain: '', problem: missing ? 'lean-toolchain is missing' : `lean-toolchain cannot be read: ${(e as Error).message}` };
  }
  if (toolchain !== PINNED_TOOLCHAIN) {
    return {
      toolchain,
      problem: `lean-toolchain pins ${JSON.stringify(toolchain)}; telelean checks only ${PINNED_TOOLCHAIN} (D-7), so the board stays syntactic`,
    };
  }
  return { toolchain };
}

/**
 * Why M1 cannot check this project as it is, or undefined: a lakefile must exist, and `lake-manifest.json` must
 * exist (the sandbox keeps the root read-only, so Lake could not write one) and list no packages (Lake
 * dependencies such as Mathlib need an explicit opt-in, D-28/M4, and break the RAM rule).
 */
export function projectProblem(root: string): string | undefined {
  const hasLakefile = ['lakefile.toml', 'lakefile.lean'].some((f) => {
    try {
      return lstatSync(path.join(root, f)).isFile();
    } catch {
      return false;
    }
  });
  if (!hasLakefile) return 'the model folder has no lakefile.toml or lakefile.lean';
  let text: string;
  try {
    text = readFileSync(path.join(root, 'lake-manifest.json'), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return 'lake-manifest.json is missing (the sandbox keeps the model folder read-only, so Lake cannot write one)';
    }
    return `lake-manifest.json cannot be read: ${(e as Error).message}`;
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(text);
  } catch (e) {
    return `lake-manifest.json is not valid JSON: ${(e as Error).message}`;
  }
  const packages = typeof manifest === 'object' && manifest !== null ? (manifest as { packages?: unknown }).packages : undefined;
  if (!Array.isArray(packages)) return 'lake-manifest.json has no "packages" list';
  if (packages.length > 0) {
    const names = packages.map((p: unknown) => {
      const name = typeof p === 'object' && p !== null ? (p as { name?: unknown }).name : undefined;
      return typeof name === 'string' ? name : '?';
    });
    return `this project has Lake dependencies (${names.join(', ')}): M1 checks only dependency-free models; Mathlib needs an explicit opt-in (M4)`;
  }
  return undefined;
}

export interface ModuleFile {
  /** e.g. `Model.Spyro.Main`. */
  readonly name: string;
  /** POSIX, relative to the root, e.g. `Model/Spyro/Main.lean`. */
  readonly file: string;
}

/**
 * The library's modules: `<library>.lean` and every `<library>/**.lean` (regular files only; symlinks, dot
 * directories and paths that are not plain module names are skipped). Sorted by file.
 */
export function listModuleFiles(root: string, library: string): ModuleFile[] {
  const out: ModuleFile[] = [];
  const consider = (rel: string): void => {
    const name = rel.slice(0, -'.lean'.length).split('/').join('.');
    if (isValidModuleName(name)) out.push({ name, file: rel });
  };
  try {
    if (lstatSync(path.join(root, `${library}.lean`)).isFile()) consider(`${library}.lean`);
  } catch {
    // no root module
  }
  const stack = [library];
  while (stack.length > 0) {
    const rel = stack.pop() ?? '';
    let entries: Dirent[];
    try {
      entries = readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const childRel = `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.')) stack.push(childRel);
      } else if (entry.isFile() && entry.name.endsWith('.lean')) {
        consider(childRel);
      }
    }
  }
  return out.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}

export interface ModuleSource extends ModuleFile {
  /** The source text the build sees (UTF-8). */
  readonly text: string;
  readonly sha256: string;
  /** Every module named by the header's `import` commands. */
  readonly headerImports: readonly string[];
  /** The project-internal ones: the library itself or modules under it (as `ModuleFacts.imports`). */
  readonly imports: readonly string[];
}

/** Whether a module name belongs to the library (`Model` or `Model.…`). */
export function inLibrary(name: string, library: string): boolean {
  return name === library || name.startsWith(`${library}.`);
}

/** Reads, hashes and parses the header of every module; unreadable files are skipped. Topologically sorted. */
export function readModuleSources(root: string, library: string): ModuleSource[] {
  const sources: ModuleSource[] = [];
  for (const m of listModuleFiles(root, library)) {
    let text: string;
    try {
      text = readFileSync(path.join(root, m.file), 'utf8');
    } catch {
      continue; // vanished or unreadable: Lake will report it if it matters
    }
    const headerImports = parseImports(text);
    sources.push({ ...m, text, sha256: sha256Text(text), headerImports, imports: headerImports.filter((i) => inLibrary(i, library)) });
  }
  return topologicalOrder(sources);
}

/** Dependencies before dependents, ties by name; modules on an import cycle keep name order at the end. */
export function topologicalOrder<T extends { readonly name: string; readonly imports: readonly string[] }>(modules: readonly T[]): T[] {
  const byName = new Map(modules.map((m) => [m.name, m]));
  const pending = new Map(modules.map((m) => [m.name, new Set(m.imports.filter((i) => byName.has(i) && i !== m.name))]));
  const order: T[] = [];
  const ready = (): string[] => [...pending].filter(([, deps]) => deps.size === 0).map(([n]) => n).sort();
  for (let batch = ready(); batch.length > 0; batch = ready()) {
    const next = batch[0] ?? '';
    pending.delete(next);
    for (const deps of pending.values()) deps.delete(next);
    const m = byName.get(next);
    if (m !== undefined) order.push(m);
  }
  for (const name of [...pending.keys()].sort()) {
    const m = byName.get(name);
    if (m !== undefined) order.push(m);
  }
  return order;
}

export interface ModuleStateInput {
  readonly modules: readonly { readonly name: string; readonly headerImports: readonly string[] }[];
  readonly library: string;
  /** Targets Lake listed under "Some required targets logged failures:" (any caption). */
  readonly failedTargets: ReadonlySet<string>;
  /** `lake build` exited 0. */
  readonly buildOk: boolean;
  /** Modules with a successful progress line (`Built`, `Replayed`, …) in this build's log. */
  readonly reportedOk: ReadonlySet<string>;
}

/**
 * Module states after a build (plan section 4 step 5): `failed` = Lake said so; `not-built` = outside the import
 * closure of the library root `<library>`; `dependency-failed` = an import (transitively) failed, or names a
 * library module that does not exist; otherwise `fresh`. When the build failed without naming any project
 * module (e.g. a lakefile error), only modules this log reports as built count as fresh, the rest `not-built`:
 * their artifacts may predate the sources.
 */
export function computeModuleStates(input: ModuleStateInput): Map<string, ModuleState> {
  const byName = new Map(input.modules.map((m) => [m.name, m]));
  const closure = new Set<string>();
  const stack = byName.has(input.library) ? [input.library] : [];
  while (stack.length > 0) {
    const name = stack.pop() ?? '';
    if (closure.has(name)) continue;
    closure.add(name);
    for (const i of byName.get(name)?.headerImports ?? []) if (byName.has(i)) stack.push(i);
  }

  const memo = new Map<string, boolean>();
  const visiting = new Set<string>();
  const brokenImport = (name: string): boolean => {
    const known = memo.get(name);
    if (known !== undefined) return known;
    if (visiting.has(name)) return true; // an import cycle never builds
    visiting.add(name);
    let broken = false;
    for (const i of byName.get(name)?.headerImports ?? []) {
      const missing = !byName.has(i) && inLibrary(i, input.library);
      if (input.failedTargets.has(i) || missing || (byName.has(i) && brokenImport(i))) {
        broken = true;
        break;
      }
    }
    visiting.delete(name);
    memo.set(name, broken);
    return broken;
  };

  const anyProjectModuleFailed = input.modules.some((m) => input.failedTargets.has(m.name));
  const states = new Map<string, ModuleState>();
  for (const m of input.modules) {
    let state: ModuleState;
    if (input.failedTargets.has(m.name)) state = 'failed';
    else if (!closure.has(m.name)) state = 'not-built';
    else if (brokenImport(m.name)) state = 'dependency-failed';
    else if (!input.buildOk && !anyProjectModuleFailed) state = input.reportedOk.has(m.name) ? 'fresh' : 'not-built';
    else state = 'fresh';
    states.set(m.name, state);
  }
  return states;
}
