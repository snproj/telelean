/**
 * The quota tripwire of ClaudeCliBackend.startSession (docs/m2-plan.md section 10.4, AT3.13), observed with a spy on
 * child_process.spawn: under TELELEAN_NO_REAL_CLAUDE=1 (set by vitest.config.ts) a launcher other than
 * process.execPath throws before any spawn; M0's node double (fake-claude.mjs, launched with process.execPath) still
 * runs end to end.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { writeFileSync } from 'node:fs';

import { ClaudeCliBackend, isTestDoubleLaunch, realClaudeDisabled } from '../../src/llm/claudeCli.js';
import { StubToolHost } from '../../src/llm/stubToolHost.js';
import { LlmHarnessError, type LlmEvent } from '../../src/llm/types.js';
import { makeShadow, removeDir, type ShadowFixture } from './helpers.js';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: vi.fn(actual.spawn) };
});

const FAKE_CLI = fileURLToPath(new URL('./fixtures/fake-claude.mjs', import.meta.url));
let fx: ShadowFixture;
beforeAll(async () => {
  fx = await makeShadow();
});
afterAll(async () => removeDir(fx.base));
beforeEach(() => {
  vi.mocked(spawn).mockClear();
});

describe('ClaudeCliBackend.startSession under TELELEAN_NO_REAL_CLAUDE=1', () => {
  it('refuses a real launcher before spawning anything', async () => {
    expect(process.env['TELELEAN_NO_REAL_CLAUDE']).toBe('1');
    const backend = new ClaudeCliBackend({
      binary: { path: '/usr/bin/false' },
      launcher: { command: '/usr/bin/setpriv', args: ['--pdeathsig', 'KILL', '--'] },
    });
    const err = await backend
      .startSession({ cwd: fx.root, runDir: path.join(fx.base, 'run-real'), systemPrompt: 'x', model: 'claude-opus-5-5', toolHost: new StubToolHost() })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmHarnessError);
    expect((err as LlmHarnessError).code).toBe('process');
    expect(vi.mocked(spawn)).not.toHaveBeenCalled();
    // No launcher at all (the binary run directly) is refused the same way.
    const direct = new ClaudeCliBackend({ binary: { path: '/usr/bin/false' } });
    await expect(direct.startSession({ cwd: fx.root, runDir: path.join(fx.base, 'run-direct'), systemPrompt: 'x', model: 'm', toolHost: new StubToolHost() })).rejects.toThrow(/TELELEAN_NO_REAL_CLAUDE=1/);
    expect(vi.mocked(spawn)).not.toHaveBeenCalled();
  });

  it("still runs M0's node double launched with process.execPath", async () => {
    const backend = new ClaudeCliBackend({
      binary: { path: FAKE_CLI },
      launcher: { command: process.execPath, args: [] },
      controlTimeoutMs: 10_000,
      closeGraceMs: 2_000,
    });
    const session = await backend.startSession({ cwd: fx.root, runDir: path.join(fx.base, 'run-double'), systemPrompt: 'x', model: 'claude-haiku-5-5', toolHost: new StubToolHost() });
    try {
      const events: LlmEvent[] = [];
      for await (const e of session.send('echo:still allowed')) events.push(e);
      expect(events.find((e) => e.type === 'assistant_text')).toMatchObject({ text: 'still allowed' });
      expect(vi.mocked(spawn).mock.calls.some((c) => c[0] === process.execPath && (c[1] as string[]).includes(FAKE_CLI))).toBe(true);
    } finally {
      await session.close({ force: true });
    }
  });

  it('refuses a JavaScript CLI launched with process.execPath that is not a test fixture (fixer round 1)', async () => {
    // A stand-in for an npm-installed Claude Code `cli.js`: under the old rule (launcher = process.execPath) it ran.
    const standIn = path.join(fx.base, 'cli.js');
    writeFileSync(standIn, 'process.exit(0);\n');
    const backend = new ClaudeCliBackend({ binary: { path: standIn }, launcher: { command: process.execPath, args: [] } });
    await expect(
      backend.startSession({ cwd: fx.root, runDir: path.join(fx.base, 'run-cli-js'), systemPrompt: 'x', model: 'claude-opus-5-5', toolHost: new StubToolHost() }),
    ).rejects.toThrow(/Refusing to start the Claude CLI/);
    expect(vi.mocked(spawn)).not.toHaveBeenCalled();
    expect(isTestDoubleLaunch(process.execPath, FAKE_CLI)).toBe(true);
    expect(isTestDoubleLaunch(process.execPath, standIn)).toBe(false);
    expect(isTestDoubleLaunch('/usr/bin/setpriv', FAKE_CLI)).toBe(false);
    expect(isTestDoubleLaunch(process.execPath, '/usr/lib/node_modules/@anthropic-ai/claude-code/cli.js')).toBe(false);
  });

  it('any non-empty value but 0/false arms the tripwire (fixer round 1)', () => {
    for (const value of ['1', 'true', 'yes', 'on', 'TRUE', ' 1 ']) expect(realClaudeDisabled({ TELELEAN_NO_REAL_CLAUDE: value }), value).toBe(true);
    for (const value of [undefined, '', '0', 'false', 'FALSE']) expect(realClaudeDisabled({ TELELEAN_NO_REAL_CLAUDE: value }), String(value)).toBe(false);
  });
});
