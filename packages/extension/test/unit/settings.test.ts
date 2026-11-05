import { DEFAULT_RUN_CAPS } from '@telelean/core';
import { DEFAULT_RUN_SETTINGS } from '@telelean/runner/run/index.js';
import { describe, expect, it } from 'vitest';

import { memoryMaxFor, readSettings, RUN_SETTING_BOUNDS, SETTING_DEFAULTS, type SettingGetter } from '../../src/logic/settings';

const getter =
  (values: Record<string, unknown>): SettingGetter =>
  (key, fallback) =>
    key in values ? values[key] : fallback;

describe('settings -> workspace options', () => {
  it('maps the defaults', () => {
    expect(readSettings(getter({}))).toMatchObject({
      semantic: { enabled: true, memoryMax: '4G', minAvailableBytes: 2 * 1024 ** 3, debounceMs: 750 },
      git: { enabled: true, gitPath: 'git' },
    });
  });

  it('maps user values, clamps out-of-range numbers and ignores mistyped ones', () => {
    expect(
      readSettings(
        getter({
          'memory.capGiB': 2.5,
          'memory.minAvailableGiB': 0,
          'refresh.enabled': false,
          'refresh.debounceMs': 100_000,
          'git.snapshotRefs': false,
          'git.path': ' /usr/bin/git ',
        }),
      ),
    ).toMatchObject({
      semantic: { enabled: false, memoryMax: String(Math.round(2.5 * 1024 ** 3)), minAvailableBytes: 0, debounceMs: 60_000 },
      git: { enabled: false, gitPath: '/usr/bin/git' },
    });
    expect(readSettings(getter({ 'memory.capGiB': 'lots', 'refresh.enabled': 'yes', 'git.path': '' }))).toMatchObject({
      semantic: { memoryMax: '4G', enabled: true },
      git: { gitPath: 'git' },
    });
    expect(memoryMaxFor(8)).toBe('8G');
    expect(Object.keys(SETTING_DEFAULTS)).toHaveLength(17);
  });
});

describe('M2 run settings (docs/m2-plan.md section 8.3; AT5.3)', () => {
  it('the defaults are exactly the runner DEFAULT_RUN_SETTINGS (D-25 caps: 80 turns, 25 checks, 20 min, 120 s, 3 attempts)', () => {
    const settings = readSettings(getter({}));
    expect(settings.run).toEqual(DEFAULT_RUN_SETTINGS);
    expect(settings.run.caps).toEqual(DEFAULT_RUN_CAPS);
    expect(settings.run.caps).toEqual({ maxTurns: 80, maxChecks: 25, maxAgentMs: 20 * 60_000, leanJobMs: 120_000, maxGateAttempts: 3 });
    expect(settings.claudePath).toBe('');
  });

  it('reads user values: minutes and seconds become milliseconds, the memory settings are shared with the refresh', () => {
    const settings = readSettings(
      getter({
        model: ' claude-sonnet-5-5 ',
        effort: 'max',
        'claude.path': ' /opt/claude/bin/claude ',
        'run.maxTurns': 40,
        'run.maxChecks': 10,
        'run.maxAgentMinutes': 5,
        'run.leanJobSeconds': 60,
        'run.maxGateAttempts': 2,
        'run.keepRuns': 3,
        'run.contextScope': 'neighbourhood',
        'run.reuseLeanBuild': true,
        'memory.capGiB': 8,
        'memory.minAvailableGiB': 1,
      }),
    );
    expect(settings.run).toEqual({
      model: 'claude-sonnet-5-5',
      effort: 'max',
      caps: { maxTurns: 40, maxChecks: 10, maxAgentMs: 5 * 60_000, leanJobMs: 60_000, maxGateAttempts: 2 },
      memoryMax: '8G',
      minAvailableBytes: 1024 ** 3,
      contextScope: 'neighbourhood',
      keepRuns: 3,
      reuseLeanBuild: true,
    });
    expect(settings.claudePath).toBe('/opt/claude/bin/claude');
    expect(settings.semantic.memoryMax).toBe(settings.run.memoryMax);
    expect(readSettings(getter({ model: 'claude-opus-5-5[1m]' })).run.model).toBe('claude-opus-5-5[1m]');
    expect(readSettings(getter({ model: 'opus' })).run.model).toBe('opus');
  });

  it('clamps numbers to their bounds and rounds them to whole numbers', () => {
    const low = readSettings(
      getter({ 'run.maxTurns': 0, 'run.maxChecks': -5, 'run.maxAgentMinutes': 0.2, 'run.leanJobSeconds': 1, 'run.maxGateAttempts': 0, 'run.keepRuns': 0 }),
    );
    expect(low.run.caps).toEqual({ maxTurns: 1, maxChecks: 1, maxAgentMs: 60_000, leanJobMs: 10_000, maxGateAttempts: 1 });
    expect(low.run.keepRuns).toBe(1);
    const high = readSettings(
      getter({ 'run.maxTurns': 1e9, 'run.maxChecks': 1e9, 'run.maxAgentMinutes': 1e9, 'run.leanJobSeconds': 1e9, 'run.maxGateAttempts': 99, 'run.keepRuns': 1e9 }),
    );
    expect(high.run.caps).toEqual({ maxTurns: 1000, maxChecks: 500, maxAgentMs: 240 * 60_000, leanJobMs: 1800_000, maxGateAttempts: 10 });
    expect(high.run.keepRuns).toBe(100);
    expect(readSettings(getter({ 'run.maxChecks': 7.6, 'run.maxAgentMinutes': 2.4 })).run.caps).toMatchObject({ maxChecks: 8, maxAgentMs: 2 * 60_000 });
    for (const [key, [min, max]] of Object.entries(RUN_SETTING_BOUNDS)) {
      expect(min, key).toBeLessThanOrEqual(SETTING_DEFAULTS[key as keyof typeof RUN_SETTING_BOUNDS]);
      expect(max, key).toBeGreaterThanOrEqual(SETTING_DEFAULTS[key as keyof typeof RUN_SETTING_BOUNDS]);
    }
  });

  it('falls back to the defaults for mistyped or unknown values', () => {
    const settings = readSettings(
      getter({
        model: 'claude opus; rm -rf',
        effort: 'extreme',
        'claude.path': 42,
        'run.maxTurns': 'many',
        'run.maxChecks': Number.NaN,
        'run.maxAgentMinutes': null,
        'run.leanJobSeconds': Number.POSITIVE_INFINITY,
        'run.maxGateAttempts': '3',
        'run.keepRuns': {},
        'run.contextScope': 'everything',
        'run.reuseLeanBuild': 'yes',
      }),
    );
    expect(settings.run).toEqual(DEFAULT_RUN_SETTINGS);
    expect(settings.run.reuseLeanBuild).toBe(false); // closing round 1: off unless the user turns it on
    expect(settings.claudePath).toBe('');
    expect(readSettings(getter({ model: '' })).run.model).toBe('claude-opus-5-5');
    expect(readSettings(getter({ model: 'x'.repeat(101) })).run.model).toBe('claude-opus-5-5');
    expect(readSettings(getter({ 'claude.path': '/bin/claude\u0000x' })).claudePath).toBe('');
    expect(readSettings(getter({ 'claude.path': '   ' })).claudePath).toBe('');
  });
});
