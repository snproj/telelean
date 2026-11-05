/** Shared helpers for the semantic-layer tests (WP3). */
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { defaultHostTools, execCapture, type HostTools } from '../../src/lean/systemd.js';
import { REPO_ROOT, SPYRO } from '../lean/helpers.js';

export { cleanupTempRoot, knownProjectsLines, makeTempRoot, MiB, REPO_ROOT, SPYRO } from '../lean/helpers.js';

export const SEMANTIC_FIXTURES = path.join(REPO_ROOT, 'test-fixtures', 'semantic');
export const RECORDED = path.join(SEMANTIC_FIXTURES, 'recorded');

/** One run id per test process for the semantic tests, so leftover checks only ever see our own scopes. */
export const SEMANTIC_RUN_ID = `sem${process.pid}`;

/** A recorded fixture file as text. */
export function recorded(name: string): string {
  return readFileSync(path.join(RECORDED, name), 'utf8');
}

/** An overlay file's text, e.g. `overlayText('extras', 'Model/Spyro/Main.lean')`. */
export function overlayText(overlay: string, rel: string): string {
  return readFileSync(path.join(SEMANTIC_FIXTURES, 'overlays', overlay, rel), 'utf8');
}

function copyTree(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyTree(s, d);
    else if (entry.isFile()) copyFileSync(s, d);
    else throw new Error(`unexpected non-regular fixture entry ${s}`);
  }
}

/**
 * A scratch copy of the Spyro fixture at `<tmp>/<name>`, with `test-fixtures/semantic/overlays/<overlay>/` copied
 * over it. Builds only ever happen in such copies.
 */
export function spyroCopy(tmp: string, name: string, overlay?: string): string {
  const dir = path.join(tmp, name);
  if (existsSync(dir)) throw new Error(`${dir} already exists`);
  copyTree(SPYRO, dir);
  if (overlay !== undefined) copyTree(path.join(SEMANTIC_FIXTURES, 'overlays', overlay), dir);
  return dir;
}

/** Loaded `telelean-<runId>-*` scope units (any state), from the systemd user manager. */
export async function unitsOfRun(runId: string): Promise<string[]> {
  const tools = defaultHostTools();
  const r = await execCapture(tools.systemctl, ['--user', 'list-units', '--all', '--no-legend', '--plain', `telelean-${runId}-*`], tools.env);
  return r.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
}

export interface RecordingHost {
  /** HostTools overrides pointing at the recording fakes. */
  readonly host: Partial<HostTools>;
  /** Every recorded invocation: [tool, ...argv]. */
  calls(): string[][];
}

/**
 * Fake host tools that record each invocation (argv NUL-separated, one file per call) instead of doing anything.
 * `systemctl --user is-system-running` answers `running`, so runLean's preflight passes; `systemd-run` exits 1,
 * so a run that gets that far ends as `could-not-start` without any process of ours running Lean.
 */
export function recordingHost(dir: string): RecordingHost {
  mkdirSync(dir, { recursive: true });
  const logDir = path.join(dir, 'calls');
  mkdirSync(logDir, { recursive: true });
  const make = (tool: string, body: string): string => {
    const file = path.join(dir, tool);
    const record = `n=0; while [ -e '${logDir}/${tool}.'$n ]; do n=$((n+1)); done; printf '%s\\0' '${tool}' "$@" > '${logDir}/${tool}.'$n`;
    writeFileSync(file, `#!/bin/sh\n${record}\n${body}\n`);
    chmodSync(file, 0o755);
    return file;
  };
  const host: Partial<HostTools> = {
    systemdRun: make('systemd-run', 'echo "fake systemd-run: not starting anything" >&2; exit 1'),
    systemctl: make('systemctl', 'case "$2" in is-system-running) echo running ;; esac; exit 0'),
    bwrap: make('bwrap', 'exit 1'),
    setpriv: make('setpriv', 'exit 1'),
  };
  return {
    host,
    calls: () =>
      readdirSync(logDir)
        .sort()
        .map((f) => readFileSync(path.join(logDir, f), 'utf8').split('\0').slice(0, -1)),
  };
}
