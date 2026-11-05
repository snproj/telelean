/**
 * AT3.13 (docs/m2-plan.md sections 8.4 and 10.4): createClaudeBackend with fake binaries and `settings.resolve`
 * (scratch home, PATH and extension dirs; the real PATH, ~/.local/bin and ~/.vscode are never scanned): resolution
 * order, version floor, the absolute `setpriv --pdeathsig KILL --` launcher, the explicit guard path; nothing but
 * `--version` of the fakes runs. The quota tripwire: under TELELEAN_NO_REAL_CLAUDE=1 (set by vitest.config.ts) and
 * without `resolve` it throws before resolving anything; ClaudeCliBackend.startSession with a non-node launcher
 * throws before spawning (test/llm/tripwire.test.ts spies on spawn itself).
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { findSystemExecutable } from '../../src/lean/systemd.js';
import { ClaudeCliBackend } from '../../src/llm/claudeCli.js';
import { defaultHookRuntime } from '../../src/llm/confinement.js';
import { StubToolHost } from '../../src/llm/stubToolHost.js';
import { LlmHarnessError } from '../../src/llm/types.js';
import { createClaudeBackend, PDEATHSIG_ARGS } from '../../src/run/index.js';
import { cleanup, makeTempDir } from './helpers/env.js';

let base: string;
let home: string;
let pathDir: string;
let customExt: string;
let log: string;
const GUARD = '/opt/telelean/dist/bin/telelean-path-guard.mjs';

/** A fake `claude` that appends its argv to the shared log and prints a version. */
function fakeBinary(file: string, version: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `#!/bin/sh\necho "${file} $*" >> "${log}"\necho "${version} (Claude Code)"\n`);
  chmodSync(file, 0o755);
}
const extBin = (dir: string, name: string) => path.join(dir, name, 'resources', 'native-binary', 'claude');
const logLines = (): string[] => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : []);

beforeAll(() => {
  base = makeTempDir('claude-bin');
  home = path.join(base, 'home');
  pathDir = path.join(base, 'pathbin');
  customExt = path.join(base, 'vscode-ext');
  log = path.join(base, 'invocations.log');
  fakeBinary(extBin(path.join(home, '.vscode', 'extensions'), 'anthropic.claude-code-2.1.314-linux-x64'), '2.1.314');
  fakeBinary(extBin(path.join(home, '.vscode', 'extensions'), 'anthropic.claude-code-2.1.290-linux-x64'), '2.1.290');
  fakeBinary(extBin(customExt, 'anthropic.claude-code-2.1.320-linux-x64'), '2.1.320');
  fakeBinary(path.join(pathDir, 'claude'), '2.1.310');
  fakeBinary(path.join(home, '.local', 'bin', 'claude'), '2.1.250');
});
afterAll(() => cleanup(base));

describe('createClaudeBackend (AT3.13)', () => {
  it('the quota tripwire is armed in this test runner', () => {
    expect(process.env['TELELEAN_NO_REAL_CLAUDE']).toBe('1');
  });

  it('resolves the newest extension binary first (the Claude extension dir the caller names, then the defaults)', async () => {
    const before = logLines().length;
    const { backend, binary } = await createClaudeBackend({
      guardScriptPath: GUARD,
      clientApp: 'telelean/0.0.1',
      extensionDirs: [customExt, path.join(home, '.vscode', 'extensions')],
      resolve: { home, pathEnv: pathDir },
    });
    expect(binary).toEqual({ source: 'vscode-extension', path: extBin(customExt, 'anthropic.claude-code-2.1.320-linux-x64'), version: '2.1.320' });
    expect(backend).toBeInstanceOf(ClaudeCliBackend);
    expect(backend.options.binary).toEqual({ path: binary.path, version: '2.1.320' });
    expect(backend.options.guardScriptPath).toBe(GUARD);
    expect(backend.options.clientApp).toBe('telelean/0.0.1');
    expect(backend.options.hookRuntime).toEqual(defaultHookRuntime());
    // Only `--version` ran, once, on the binary that answered first.
    expect(logLines().slice(before)).toEqual([`${binary.path} --version`]);
  });

  it('falls back to PATH, then ~/.local/bin, refusing binaries older than 2.1.295', async () => {
    const viaPath = await createClaudeBackend({ guardScriptPath: GUARD, clientApp: 't', extensionDirs: [], resolve: { home, pathEnv: pathDir } });
    expect(viaPath.binary).toMatchObject({ source: 'path', version: '2.1.310' });
    const before = logLines().length;
    const err = await createClaudeBackend({ guardScriptPath: GUARD, clientApp: 't', extensionDirs: [], resolve: { home, pathEnv: '' } }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmHarnessError);
    expect((err as LlmHarnessError).code).toBe('binary');
    expect((err as Error).message).toMatch(/2\.1\.250 is older than 2\.1\.295/);
    expect(logLines().slice(before)).toEqual([`${path.join(home, '.local', 'bin', 'claude')} --version`]);
    // Within the default extension dirs, the 2.1.290 extension is too old; the 2.1.314 one wins.
    const defaults = await createClaudeBackend({ guardScriptPath: GUARD, clientApp: 't', resolve: { home, pathEnv: '' } });
    expect(defaults.binary).toMatchObject({ source: 'vscode-extension', version: '2.1.314' });
  });

  it('a configured path must work: no silent fallback', async () => {
    const explicit = path.join(base, 'custom', 'claude');
    fakeBinary(explicit, '2.1.330');
    const ok = await createClaudeBackend({ claudePath: explicit, guardScriptPath: GUARD, clientApp: 't', resolve: { home, pathEnv: pathDir } });
    expect(ok.binary).toEqual({ source: 'setting', path: explicit, version: '2.1.330' });
    const missing = await createClaudeBackend({ claudePath: path.join(base, 'nope'), guardScriptPath: GUARD, clientApp: 't', resolve: { home, pathEnv: pathDir } }).catch((e: unknown) => e);
    expect((missing as LlmHarnessError).code).toBe('binary');
  });

  it.skipIf(!existsSync(findSystemExecutable('setpriv')))('launches the CLI through the absolute setpriv path with --pdeathsig KILL (default), or directly when switched off', async () => {
    const { backend } = await createClaudeBackend({ guardScriptPath: GUARD, clientApp: 't', resolve: { home, pathEnv: pathDir } });
    expect(backend.options.launcher).toEqual({ command: findSystemExecutable('setpriv'), args: ['--pdeathsig', 'KILL', '--'] });
    expect(path.isAbsolute(backend.options.launcher?.command ?? '')).toBe(true);
    expect(PDEATHSIG_ARGS).toEqual(['--pdeathsig', 'KILL', '--']);
    const direct = await createClaudeBackend({ guardScriptPath: GUARD, clientApp: 't', pdeathsig: false, resolve: { home, pathEnv: pathDir } });
    expect(direct.backend.options.launcher).toBeUndefined();
  });

  it('runVersion can replace running the fakes entirely', async () => {
    const before = logLines().length;
    const { binary } = await createClaudeBackend({ guardScriptPath: GUARD, clientApp: 't', extensionDirs: [], resolve: { home, pathEnv: pathDir, runVersion: async () => '2.1.400 (Claude Code)' } });
    expect(binary.version).toBe('2.1.400');
    expect(logLines().slice(before)).toEqual([]);
  });

  it('tripwire: without `resolve` it throws before resolving anything (not even --version)', async () => {
    const marker = path.join(base, 'marker', 'claude');
    fakeBinary(marker, '2.1.400');
    const before = logLines().length;
    const err = await createClaudeBackend({ claudePath: marker, guardScriptPath: GUARD, clientApp: 't' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmHarnessError);
    expect((err as LlmHarnessError).code).toBe('process');
    expect((err as Error).message).toMatch(/real Claude is disabled here \(TELELEAN_NO_REAL_CLAUDE=1\)/);
    expect(logLines().slice(before)).toEqual([]);
  });

  it('tripwire: `resolve` without a scratch home and PATH is refused too (fixer round 1: it would scan the real ones)', async () => {
    const before = logLines().length;
    for (const resolve of [{}, { runVersion: async () => '2.1.400 (Claude Code)' }, { home }, { pathEnv: pathDir }]) {
      const err = await createClaudeBackend({ guardScriptPath: GUARD, clientApp: 't', resolve }).catch((e: unknown) => e);
      expect(err, JSON.stringify(Object.keys(resolve))).toBeInstanceOf(LlmHarnessError);
      expect((err as Error).message).toMatch(/real Claude is disabled here .*a test must pass both resolve\.home and resolve\.pathEnv/);
    }
    expect(logLines().slice(before)).toEqual([]);
  });

  it('tripwire: startSession with a non-node launcher refuses before anything starts', async () => {
    const marker = path.join(base, 'marker2', 'claude');
    fakeBinary(marker, '2.1.400');
    const before = logLines().length;
    const ws = path.join(base, 'ws');
    mkdirSync(ws, { recursive: true });
    const backend = new ClaudeCliBackend({ binary: { path: marker, version: '2.1.400' }, launcher: { command: '/bin/sh', args: [] }, guardScriptPath: GUARD });
    const err = await backend
      .startSession({ cwd: ws, runDir: path.join(base, 'run'), systemPrompt: 'x', model: 'claude-opus-5-5', toolHost: new StubToolHost() })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmHarnessError);
    expect((err as LlmHarnessError).code).toBe('process');
    expect((err as Error).message).toMatch(/Refusing to start the Claude CLI: TELELEAN_NO_REAL_CLAUDE=1 is set/);
    expect(logLines().slice(before)).toEqual([]);
    expect(existsSync(path.join(base, 'run'))).toBe(false); // not even the config files were written
  });
});
