/**
 * The Claude backend the extension hands its RunManagers (docs/m2-plan.md section 8.4; AT5.4 at the factory level) and
 * the other vscode-free run helpers: the egress consent's exact text (8.2), the busy check.
 *
 * Quota tripwires: no test here builds a real backend. `createClaudeBackend` is always a recording fake, and in Test
 * mode the factory must never reach it.
 */
import { FakeBackend } from '@telelean/runner/llm/fake.js';
import type { LlmBackend } from '@telelean/runner/llm/types.js';
import type { ClaudeBackendSettings } from '@telelean/runner/run/types.js';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  busyRefusal,
  claudeBackendSettings,
  claudeExtensionDirs,
  CONSENT_DETAIL,
  CONSENT_MESSAGE,
  CONSENT_YES,
  consentKey,
  expandHome,
  guardScriptPath,
  runBackendFactory,
  TEST_MODE_NO_CLAUDE,
  type RunBackendDeps,
} from '../../src/logic/runs';
import { sampleRun } from './fakes';

const HOME = '/home/someone';
const EXTENSION_ROOT = '/home/someone/.vscode/extensions/telelean.telelean-0.0.1';
const CLAUDE_EXTENSION = '/home/someone/.vscode/extensions/anthropic.claude-code-2.1.314-linux-x64';
const HOOK = { command: '/home/someone/.local/bin/node', args: [] };

function recordingDeps(overrides: Partial<RunBackendDeps> = {}) {
  const created: ClaudeBackendSettings[] = [];
  const logs: string[] = [];
  let settingsComputed = 0;
  const backend = { id: 'claude-cli', caps: { builtinFileTools: true, subscriptionAuth: true, resume: true, interrupt: true } } as unknown as LlmBackend;
  const deps: RunBackendDeps = {
    root: '/models/spyro',
    isTest: false,
    override: () => undefined,
    settings: () => {
      settingsComputed++;
      return claudeBackendSettings({ extensionRoot: EXTENSION_ROOT, version: '0.0.1', claudePath: '', claudeExtensionPath: CLAUDE_EXTENSION, home: HOME, hookRuntime: HOOK });
    },
    createClaudeBackend: async (settings) => {
      created.push(settings);
      return { backend, binary: { path: `${CLAUDE_EXTENSION}/resources/native-binary/claude`, source: 'vscode-extension', version: '2.1.314' } };
    },
    log: (_level, message) => logs.push(message),
    ...overrides,
  };
  return { deps, created, logs, backend, settingsComputed: () => settingsComputed };
}

describe('the production backend factory (AT5.4)', () => {
  it('builds nothing until the RunManager calls it; then passes the dist/bin guard, hook runtime, client app and setpriv launcher', async () => {
    const { deps, created, logs, backend, settingsComputed } = recordingDeps();
    const factory = runBackendFactory(deps);
    expect(created).toEqual([]); // creating the factory (at workspace creation) resolves and runs nothing
    expect(settingsComputed()).toBe(0);
    await expect(factory()).resolves.toBe(backend);
    expect(created).toEqual([
      {
        guardScriptPath: path.join(EXTENSION_ROOT, 'dist', 'bin', 'telelean-path-guard.mjs'),
        hookRuntime: HOOK,
        clientApp: 'telelean/0.0.1',
        pdeathsig: true,
        extensionDirs: [path.dirname(CLAUDE_EXTENSION), path.join(HOME, '.vscode-server', 'extensions')],
      },
    ]);
    expect(logs).toEqual([`Claude Code 2.1.314 (vscode-extension): ${CLAUDE_EXTENSION}/resources/native-binary/claude`]);
  });

  it('a resolution failure rejects with its message (the RunManager refuses that start, not-yet, with it)', async () => {
    const { deps } = recordingDeps({
      createClaudeBackend: async () => {
        throw new Error('no usable Claude Code binary: /usr/bin/claude: --version failed');
      },
    });
    await expect(runBackendFactory(deps)()).rejects.toThrow('no usable Claude Code binary: /usr/bin/claude: --version failed');
  });
});

describe('Test mode: real Claude is disabled (quota tripwire 2, AT5.4)', () => {
  it('quota tripwire 1: these tests run with TELELEAN_NO_REAL_CLAUDE=1 (vitest.config.mts)', () => {
    expect(process.env.TELELEAN_NO_REAL_CLAUDE).toBe('1');
  });

  it('without an installed backend the factory rejects with "real Claude is disabled in Test mode" and never calls createClaudeBackend', async () => {
    const { deps, created, settingsComputed } = recordingDeps({ isTest: true });
    await expect(runBackendFactory(deps)()).rejects.toThrow(TEST_MODE_NO_CLAUDE);
    expect(TEST_MODE_NO_CLAUDE).toBe('real Claude is disabled in Test mode');
    expect(created).toEqual([]);
    expect(settingsComputed()).toBe(0); // not even the binary search's settings (they read the Claude extension's path)
  });

  it('with a backend installed by testing.useRunBackend it returns exactly that backend, for the root', async () => {
    const fake = new FakeBackend([]);
    const roots: string[] = [];
    let installed: ((root: string) => LlmBackend) | undefined;
    const { deps, created } = recordingDeps({ isTest: true, override: () => installed });
    const factory = runBackendFactory(deps);
    installed = (root) => (roots.push(root), fake); // installed after the factory was made: read when it runs
    await expect(factory()).resolves.toBe(fake);
    expect(roots).toEqual(['/models/spyro']);
    expect(created).toEqual([]);
  });
});

describe('backend settings', () => {
  it('the guard is always the explicit dist/bin path (never derived from import.meta.url in the CommonJS bundle)', () => {
    expect(guardScriptPath('/ext')).toBe(path.join('/ext', 'dist', 'bin', 'telelean-path-guard.mjs'));
  });

  it("the folder of the Claude Code extension VS Code runs comes first, then the runner's defaults, without duplicates", () => {
    expect(claudeExtensionDirs('/opt/vscode-exts/anthropic.claude-code-2.1.320', HOME)).toEqual([
      '/opt/vscode-exts',
      path.join(HOME, '.vscode', 'extensions'),
      path.join(HOME, '.vscode-server', 'extensions'),
    ]);
    expect(claudeExtensionDirs(undefined, HOME)).toEqual([path.join(HOME, '.vscode', 'extensions'), path.join(HOME, '.vscode-server', 'extensions')]);
  });

  it('telelean.claude.path is passed when set (with ~ expanded), else the search is automatic', () => {
    const base = { extensionRoot: '/ext', version: '1.2.3', claudeExtensionPath: undefined, home: HOME, hookRuntime: HOOK };
    expect(claudeBackendSettings({ ...base, claudePath: '' })).not.toHaveProperty('claudePath');
    expect(claudeBackendSettings({ ...base, claudePath: '  ' })).not.toHaveProperty('claudePath');
    expect(claudeBackendSettings({ ...base, claudePath: '~/.local/bin/claude' }).claudePath).toBe(path.join(HOME, '.local/bin/claude'));
    expect(claudeBackendSettings({ ...base, claudePath: '/usr/local/bin/claude' }).claudePath).toBe('/usr/local/bin/claude');
    expect(claudeBackendSettings({ ...base, claudePath: '' }).clientApp).toBe('telelean/1.2.3');
    expect(expandHome('~', HOME)).toBe(HOME);
    expect(expandHome('~other/claude', HOME)).toBe('~other/claude');
  });
});

describe('egress consent text (docs/m2-plan.md section 8.2)', () => {
  it('message + detail are exactly the plan\'s text; the button is "Run with Claude"; one key per model root', () => {
    expect(`${CONSENT_MESSAGE} ${CONSENT_DETAIL}`).toBe(
      "Run Claude on this model? telelean sends this subject's cards (sentences, reasons, Lean statements), its vocabulary and your recorded answers, plus any model file Claude reads, to Anthropic through your Claude Code login (your claude.ai subscription; no API key).",
    );
    expect(CONSENT_YES).toBe('Run with Claude');
    expect(consentKey('mental_model-1a2b3c4d')).toBe('telelean.claudeConsent.mental_model-1a2b3c4d');
  });
});

describe('busy check', () => {
  it('only a non-terminal run blocks a start, with a sentence that says what to do', () => {
    expect(busyRefusal(null)).toBeUndefined();
    for (const state of ['accepted', 'discarded', 'cancelled', 'failed'] as const) expect(busyRefusal(sampleRun({ state })), state).toBeUndefined();
    expect(busyRefusal(sampleRun({ state: 'working' }))).toBe('Claude is already working on "Spyro" in this model: wait for it to finish, or Cancel it first.');
    // Slice 2h: a run in review is an edit session (M2's Accept, Feedback and Discard are retired).
    expect(busyRefusal(sampleRun({ state: 'review' }))).toBe('An edit session on "Spyro" is waiting for your review: Apply or Exit it first.');
    expect(busyRefusal(sampleRun({ state: 'interrupted' }))).toMatch(/Resume or Stop/);
    expect(busyRefusal(sampleRun({ state: 'waiting-for-answer' }))).toMatch(/waiting for your answer/);
  });
});
