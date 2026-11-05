/**
 * Locating the pinned Lean toolchain.
 *
 * telelean always calls the toolchain's binaries directly (never the elan proxies in `~/.elan/bin`),
 * so running Lean never appends to `~/.elan/known-projects` and never depends on elan's resolution.
 */
import { accessSync, constants, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/** The toolchain every telelean project is pinned to (D-7). */
export const PINNED_TOOLCHAIN = 'leanprover/lean4:v4.35.0';

export interface LeanToolchain {
  /** The toolchain name as written in `lean-toolchain`, e.g. `leanprover/lean4:v4.35.0`. */
  readonly name: string;
  /** The elan home directory that holds it, e.g. `/home/u/.elan`. Bound read-only into the sandbox. */
  readonly elanHome: string;
  /** The toolchain directory, e.g. `/home/u/.elan/toolchains/leanprover--lean4---v4.35.0`. */
  readonly dir: string;
}

/** The executables telelean runs from the toolchain's `bin/`. */
export type ToolchainExe = 'lake' | 'lean' | 'leanexport' | 'leanchecker';

/** elan's directory name for a toolchain: `leanprover/lean4:v4.35.0` -> `leanprover--lean4---v4.35.0`. */
export function toolchainDirName(name: string): string {
  return name.replaceAll('/', '--').replaceAll(':', '---');
}

/** Default elan home: `$ELAN_HOME`, else `~/.elan`. */
export function defaultElanHome(): string {
  return process.env['ELAN_HOME'] ?? path.join(homedir(), '.elan');
}

/** Describes a toolchain without checking that it exists (see {@link checkToolchain}). */
export function resolveToolchain(name: string = PINNED_TOOLCHAIN, elanHome: string = defaultElanHome()): LeanToolchain {
  return { name, elanHome, dir: path.join(elanHome, 'toolchains', toolchainDirName(name)) };
}

export function toolchainBinDir(toolchain: LeanToolchain): string {
  return path.join(toolchain.dir, 'bin');
}

export function toolchainExe(toolchain: LeanToolchain, exe: ToolchainExe): string {
  return path.join(toolchainBinDir(toolchain), exe);
}

/** Returns a reason the toolchain is unusable, or `undefined` if `lake` and `lean` are executable. */
export function checkToolchain(toolchain: LeanToolchain): string | undefined {
  try {
    if (!statSync(toolchain.dir).isDirectory()) return `${toolchain.dir} is not a directory`;
  } catch {
    return `toolchain ${toolchain.name} is not installed (${toolchain.dir} does not exist)`;
  }
  for (const exe of ['lake', 'lean'] as const) {
    const file = toolchainExe(toolchain, exe);
    try {
      accessSync(file, constants.X_OK);
    } catch {
      return `${file} is missing or not executable`;
    }
  }
  return undefined;
}
