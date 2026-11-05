/**
 * The `telelean.*` settings (package.json `contributes.configuration`) as the runner's workspace and run options.
 * Pure: the caller passes a getter (VS Code's `WorkspaceConfiguration.get` in the extension, a record in tests).
 *
 * M2 (docs/m2-plan.md section 8.3): the model and effort Claude runs use, the Claude Code binary, and the per-round
 * caps of a run (`telelean.run.*`). Like the M1 settings they take effect after a window reload: the root's model
 * workspace and RunManager read them when they are created.
 */
import type { Effort } from '@telelean/runner/llm/types.js';
import type { RunSettings } from '@telelean/runner/run/types.js';
import type { GitSettings, SemanticSettings } from '@telelean/runner/workspace/index.js';

/** Setting keys relative to the `telelean` section, with their package.json defaults. */
export const SETTING_DEFAULTS = {
  'memory.capGiB': 4,
  'memory.minAvailableGiB': 2,
  'refresh.enabled': true,
  'refresh.debounceMs': 750,
  'git.snapshotRefs': true,
  'git.path': 'git',
  // M2: Claude runs (docs/m2-plan.md section 8.3; the defaults equal the runner's DEFAULT_RUN_SETTINGS).
  model: 'claude-opus-5-5',
  effort: 'high',
  'claude.path': '',
  'run.maxTurns': 80,
  'run.maxChecks': 25,
  'run.maxAgentMinutes': 20,
  'run.leanJobSeconds': 120,
  'run.maxGateAttempts': 3,
  'run.keepRuns': 10,
  'run.contextScope': 'subject',
  // Closing round 1: a run's working copy builds from scratch unless this is on (runner shadow/seed.ts).
  'run.reuseLeanBuild': false,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

/** Reads one setting; returns `fallback` when it is unset. */
export type SettingGetter = <K extends SettingKey>(key: K, fallback: (typeof SETTING_DEFAULTS)[K]) => unknown;

/** Inclusive bounds of the numeric run settings (the package.json `minimum`/`maximum`); all are whole numbers. */
export const RUN_SETTING_BOUNDS = {
  'run.maxTurns': [1, 1000],
  'run.maxChecks': [1, 500],
  'run.maxAgentMinutes': [1, 240],
  'run.leanJobSeconds': [10, 1800],
  'run.maxGateAttempts': [1, 10],
  'run.keepRuns': [1, 100],
} as const satisfies Partial<Record<SettingKey, readonly [number, number]>>;

/** `telelean.effort` (the CLI's `--effort`). */
export const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];
/** `telelean.run.contextScope`: what the first message lists under OTHER CARDS (docs/m2-plan.md section 5.2). */
export const CONTEXT_SCOPES: ReadonlyArray<RunSettings['contextScope']> = ['subject', 'neighbourhood'];
/**
 * A model id or alias as the CLI's `--model` takes it (`claude-opus-5-5`, `opus`, `claude-opus-5-5[1m]`): no spaces
 * or control characters, at most 100 characters. Anything else falls back to the default.
 */
export const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@[\]-]{0,99}$/;

export interface TeleleanSettings {
  semantic: SemanticSettings;
  git: Pick<GitSettings, 'enabled' | 'gitPath'>;
  /** M2: the settings of every run of the root (the RunManager's). */
  run: RunSettings;
  /** M2: `telelean.claude.path`, trimmed; '' = find it (VS Code Claude extension → PATH → ~/.local/bin). */
  claudePath: string;
}

const GIB = 1024 ** 3;

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/**
 * runLean's `MemoryMax=` value for a cap in GiB: `4G` for whole numbers, otherwise a byte count (systemd accepts
 * both), so `2.5` is not truncated.
 */
export function memoryMaxFor(capGiB: number): string {
  return Number.isInteger(capGiB) ? `${capGiB}G` : String(Math.round(capGiB * GIB));
}

/** A whole-number run setting: clamped to its bounds and rounded; a mistyped value falls back to the default. */
function runNumber(get: SettingGetter, key: keyof typeof RUN_SETTING_BOUNDS): number {
  const [min, max] = RUN_SETTING_BOUNDS[key];
  return Math.round(finiteNumber(get(key, SETTING_DEFAULTS[key]), SETTING_DEFAULTS[key], min, max));
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Out-of-range or mistyped values fall back to the defaults (or are clamped to the schema's bounds). */
export function readSettings(get: SettingGetter): TeleleanSettings {
  const capGiB = finiteNumber(get('memory.capGiB', SETTING_DEFAULTS['memory.capGiB']), SETTING_DEFAULTS['memory.capGiB'], 1, 64);
  const minAvailableGiB = finiteNumber(
    get('memory.minAvailableGiB', SETTING_DEFAULTS['memory.minAvailableGiB']),
    SETTING_DEFAULTS['memory.minAvailableGiB'],
    0,
    64,
  );
  const enabled = get('refresh.enabled', SETTING_DEFAULTS['refresh.enabled']);
  const debounceMs = finiteNumber(get('refresh.debounceMs', SETTING_DEFAULTS['refresh.debounceMs']), SETTING_DEFAULTS['refresh.debounceMs'], 0, 60_000);
  const snapshots = get('git.snapshotRefs', SETTING_DEFAULTS['git.snapshotRefs']);
  const gitPath = get('git.path', SETTING_DEFAULTS['git.path']);
  const memoryMax = memoryMaxFor(capGiB);
  const minAvailableBytes = Math.round(minAvailableGiB * GIB);

  const model = get('model', SETTING_DEFAULTS.model);
  const claudePath = get('claude.path', SETTING_DEFAULTS['claude.path']);
  const reuseLeanBuild = get('run.reuseLeanBuild', SETTING_DEFAULTS['run.reuseLeanBuild']);
  return {
    semantic: {
      enabled: typeof enabled === 'boolean' ? enabled : SETTING_DEFAULTS['refresh.enabled'],
      memoryMax,
      minAvailableBytes,
      debounceMs: Math.round(debounceMs),
    },
    git: {
      enabled: typeof snapshots === 'boolean' ? snapshots : SETTING_DEFAULTS['git.snapshotRefs'],
      gitPath: typeof gitPath === 'string' && gitPath.trim() !== '' ? gitPath.trim() : SETTING_DEFAULTS['git.path'],
    },
    run: {
      model: typeof model === 'string' && MODEL_PATTERN.test(model.trim()) ? model.trim() : SETTING_DEFAULTS.model,
      effort: oneOf(get('effort', SETTING_DEFAULTS.effort), EFFORTS, SETTING_DEFAULTS.effort),
      caps: {
        maxTurns: runNumber(get, 'run.maxTurns'),
        maxChecks: runNumber(get, 'run.maxChecks'),
        maxAgentMs: runNumber(get, 'run.maxAgentMinutes') * 60_000,
        leanJobMs: runNumber(get, 'run.leanJobSeconds') * 1000,
        maxGateAttempts: runNumber(get, 'run.maxGateAttempts'),
      },
      memoryMax,
      minAvailableBytes,
      contextScope: oneOf(get('run.contextScope', SETTING_DEFAULTS['run.contextScope']), CONTEXT_SCOPES, SETTING_DEFAULTS['run.contextScope']),
      keepRuns: runNumber(get, 'run.keepRuns'),
      reuseLeanBuild: typeof reuseLeanBuild === 'boolean' ? reuseLeanBuild : SETTING_DEFAULTS['run.reuseLeanBuild'],
    },
    // Control characters never belong in a path; such a value is ignored (automatic search).
    claudePath: typeof claudePath === 'string' && !/[\u0000-\u001f]/.test(claudePath) ? claudePath.trim() : '',
  };
}
