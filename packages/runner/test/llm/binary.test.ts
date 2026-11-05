import { existsSync } from 'node:fs';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MIN_CLAUDE_VERSION,
  compareVersions,
  listCandidates,
  parseClaudeVersion,
  resolveClaudeBinary,
} from '../../src/llm/binary.js';
import { findNodeBinary } from '../../src/llm/confinement.js';
import { LlmHarnessError } from '../../src/llm/types.js';
import { makeTempDir, removeDir } from './helpers.js';

let base: string;
let home: string;
let extDir: string;
let pathDir: string;

async function fakeBinary(file: string, version: string, executable = true): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `#!/bin/sh\necho "${version} (Claude Code)"\n`);
  await chmod(file, executable ? 0o755 : 0o644);
}
const extBin = (dirName: string) => path.join(extDir, dirName, 'resources', 'native-binary', 'claude');

beforeAll(async () => {
  base = await makeTempDir('telelean-bin-');
  home = path.join(base, 'home');
  extDir = path.join(home, '.vscode', 'extensions');
  pathDir = path.join(base, 'pathbin');
  await fakeBinary(extBin('anthropic.claude-code-2.1.300-linux-x64'), '2.1.300');
  await fakeBinary(extBin('anthropic.claude-code-2.1.314-linux-x64'), '2.1.314');
  await fakeBinary(extBin('anthropic.claude-code-2.1.290-linux-x64'), '2.1.290');
  await fakeBinary(extBin('anthropic.claude-code-2.1.400-linux-x64'), '2.1.400', false); // not executable
  await mkdir(path.join(extDir, 'someone.else-1.0.0'), { recursive: true });
  await fakeBinary(path.join(pathDir, 'claude'), '2.1.310');
  await fakeBinary(path.join(home, '.local', 'bin', 'claude'), '2.1.250');
});
afterAll(async () => removeDir(base));

describe('Claude binary resolution', () => {
  it('parses and compares versions', () => {
    expect(parseClaudeVersion('2.1.314 (Claude Code)\n')).toBe('2.1.314');
    expect(parseClaudeVersion('garbage')).toBeUndefined();
    expect(compareVersions('2.1.314', '2.1.295')).toBe(1);
    expect(compareVersions('2.1.9', '2.1.10')).toBe(-1);
    expect(compareVersions('2.1.0', '2.1')).toBe(0);
  });

  it('orders candidates: newest VS Code extension, other extensions, PATH, ~/.local/bin', async () => {
    const c = await listCandidates({ home, pathEnv: pathDir });
    expect(c).toEqual([
      { source: 'vscode-extension', path: extBin('anthropic.claude-code-2.1.314-linux-x64') },
      { source: 'vscode-extension', path: extBin('anthropic.claude-code-2.1.300-linux-x64') },
      { source: 'vscode-extension', path: extBin('anthropic.claude-code-2.1.290-linux-x64') },
      { source: 'path', path: path.join(pathDir, 'claude') },
      { source: 'local-bin', path: path.join(home, '.local', 'bin', 'claude') },
    ]);
  });

  it('picks the first candidate that runs --version and is new enough', async () => {
    const r = await resolveClaudeBinary({ home, pathEnv: pathDir });
    expect(r).toMatchObject({ source: 'vscode-extension', version: '2.1.314', path: extBin('anthropic.claude-code-2.1.314-linux-x64') });
    const viaPath = await resolveClaudeBinary({ home, pathEnv: pathDir, extensionDirs: [] });
    expect(viaPath).toMatchObject({ source: 'path', version: '2.1.310' });
  });

  it('an explicit setting wins and never falls back silently', async () => {
    const explicit = path.join(base, 'custom', 'claude');
    await fakeBinary(explicit, '2.1.320');
    expect(await resolveClaudeBinary({ home, pathEnv: pathDir, explicitPath: explicit })).toMatchObject({ source: 'setting', version: '2.1.320' });
    const err = await resolveClaudeBinary({ home, pathEnv: pathDir, explicitPath: path.join(base, 'missing') }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmHarnessError);
    expect((err as LlmHarnessError).code).toBe('binary');
  });

  it('refuses binaries older than the minimum and says why', async () => {
    const err = (await resolveClaudeBinary({ home, pathEnv: '', extensionDirs: [] }).catch((e: unknown) => e)) as Error;
    expect(err.message).toMatch(new RegExp(`2\\.1\\.250 is older than ${MIN_CLAUDE_VERSION.replace(/\./g, '\\.')}`));
  });

  it('finds a real node for the hook runtime on PATH, then in ~/.local/bin', async () => {
    const nodeDir = path.join(base, 'nodebin');
    await fakeBinary(path.join(nodeDir, 'node'), '24.22.2');
    expect(findNodeBinary(nodeDir, home)).toBe(path.join(nodeDir, 'node'));
    expect(findNodeBinary('', home)).toBeUndefined();
    await fakeBinary(path.join(home, '.local', 'bin', 'node'), '24.22.2');
    expect(findNodeBinary('', home)).toBe(path.join(home, '.local', 'bin', 'node'));
  });

  // Runs the user's REAL Claude Code binary (`--version` only, no quota) and scans the real home and PATH, so it is
  // opt-in (fixer round 1; docs/m2-plan.md 0.1 item 7: tests never scan the real PATH or home): it runs only with
  // TELELEAN_ALLOW_REAL_CLAUDE_VERSION=1 in the environment.
  const realExtDir = path.join(os.homedir(), '.vscode', 'extensions');
  const optedIn = process.env['TELELEAN_ALLOW_REAL_CLAUDE_VERSION'] === '1';
  const hasReal = optedIn && existsSync(path.join(realExtDir, 'anthropic.claude-code-2.1.314-linux-x64', 'resources', 'native-binary', 'claude'));
  it.skipIf(!hasReal || !optedIn)("finds the user's own Claude Code binary (runs only `claude --version`; opt-in)", async () => {
    const r = await resolveClaudeBinary({ pathEnv: '' });
    expect(r.source).toBe('vscode-extension');
    expect(compareVersions(r.version, MIN_CLAUDE_VERSION)).toBeGreaterThanOrEqual(0);
  });
});
