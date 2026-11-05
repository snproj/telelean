// Locating the user's own Claude Code binary (amendment 1: the CLI, not the Agent SDK).
//
// Order: explicit setting -> newest VS Code Claude Code extension binary -> PATH -> ~/.local/bin.
// Every candidate must answer `--version` (which does not contact Anthropic) with a version at
// least MIN_CLAUDE_VERSION.

import { execFile } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LlmHarnessError } from './types.js';

/** 2.1.295 adds `onFailure` on hooks, which the confinement guard relies on (fail closed). */
export const MIN_CLAUDE_VERSION = '2.1.295';

export type BinarySource = 'setting' | 'vscode-extension' | 'path' | 'local-bin';

export interface BinaryCandidate {
  path: string;
  source: BinarySource;
}

export interface ResolvedBinary extends BinaryCandidate {
  version: string;
}

export interface ResolveBinaryOptions {
  /** User setting; when given it must work (no silent fallback to another binary). */
  explicitPath?: string;
  home?: string;
  pathEnv?: string;
  /** Directories holding VS Code extensions (default ~/.vscode/extensions, ~/.vscode-server/extensions). */
  extensionDirs?: string[];
  minVersion?: string;
  /** Environment for the `--version` call (defaults to a minimal one). */
  env?: Record<string, string>;
  /** Injected for tests. */
  runVersion?: (binaryPath: string) => Promise<string>;
}

export function parseClaudeVersion(output: string): string | undefined {
  return /(\d+\.\d+\.\d+)/.exec(output)?.[1];
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

async function isExecutable(p: string): Promise<boolean> {
  try {
    await access(p, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

const EXTENSION_DIR_RE = /^anthropic\.claude-code-(\d+\.\d+\.\d+)(?:-.*)?$/;

/** VS Code Claude Code extension binaries, newest version first. */
export async function findExtensionBinaries(extensionDirs: string[]): Promise<BinaryCandidate[]> {
  const found: Array<{ version: string; path: string }> = [];
  for (const dir of extensionDirs) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const m = EXTENSION_DIR_RE.exec(name);
      if (!m?.[1]) continue;
      const bin = path.join(dir, name, 'resources', 'native-binary', 'claude');
      if (await isExecutable(bin)) found.push({ version: m[1], path: bin });
    }
  }
  found.sort((x, y) => compareVersions(y.version, x.version));
  return found.map((f) => ({ path: f.path, source: 'vscode-extension' as const }));
}

export async function listCandidates(opts: ResolveBinaryOptions = {}): Promise<BinaryCandidate[]> {
  const home = opts.home ?? os.homedir();
  if (opts.explicitPath) return [{ path: opts.explicitPath, source: 'setting' }];
  const candidates: BinaryCandidate[] = [];
  const extensionDirs = opts.extensionDirs ?? [
    path.join(home, '.vscode', 'extensions'),
    path.join(home, '.vscode-server', 'extensions'),
  ];
  candidates.push(...(await findExtensionBinaries(extensionDirs)));
  for (const dir of (opts.pathEnv ?? process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    const p = path.join(dir, 'claude');
    if (await isExecutable(p)) candidates.push({ path: p, source: 'path' });
  }
  const localBin = path.join(home, '.local', 'bin', 'claude');
  if (await isExecutable(localBin)) candidates.push({ path: localBin, source: 'local-bin' });
  // The same file can appear twice (PATH entry and ~/.local/bin).
  const seen = new Set<string>();
  return candidates.filter((c) => (seen.has(c.path) ? false : (seen.add(c.path), true)));
}

export function runClaudeVersion(binaryPath: string, env?: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      binaryPath,
      ['--version'],
      {
        timeout: 20_000,
        maxBuffer: 64 * 1024,
        env: env ?? { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: os.homedir() },
      },
      (err, stdout) => (err ? reject(err) : resolve(stdout)),
    );
  });
}

/** First candidate that runs and is new enough. */
export async function resolveClaudeBinary(opts: ResolveBinaryOptions = {}): Promise<ResolvedBinary> {
  const minVersion = opts.minVersion ?? MIN_CLAUDE_VERSION;
  const runVersion = opts.runVersion ?? ((p: string) => runClaudeVersion(p, opts.env));
  const candidates = await listCandidates(opts);
  const problems: string[] = [];
  for (const c of candidates) {
    let version: string | undefined;
    try {
      version = parseClaudeVersion(await runVersion(c.path));
    } catch (err) {
      problems.push(`${c.path}: --version failed (${(err as Error).message})`);
      continue;
    }
    if (!version) {
      problems.push(`${c.path}: no version in --version output`);
      continue;
    }
    if (compareVersions(version, minVersion) < 0) {
      problems.push(`${c.path}: version ${version} is older than ${minVersion}`);
      continue;
    }
    return { ...c, version };
  }
  const tried = problems.length > 0 ? ` Tried: ${problems.join('; ')}` : '';
  throw new LlmHarnessError(
    'binary',
    `No usable Claude Code binary (need ${minVersion} or newer).${tried || ' No candidates found.'}`,
  );
}
