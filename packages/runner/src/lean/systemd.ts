/**
 * Host-side helpers around the systemd user manager and cgroup v2, used by `runLean`.
 *
 * Nothing here runs inside the sandbox; these processes run as the user, outside bwrap.
 */
import { execFile } from 'node:child_process';
import { accessSync, constants, readFileSync } from 'node:fs';
import path from 'node:path';

/** Absolute paths of the host programs runLean needs, plus the environment they run with. */
export interface HostTools {
  readonly bwrap: string;
  readonly systemdRun: string;
  readonly systemctl: string;
  /** util-linux `setpriv`, used to tie the scope's keeper process to our lifetime (`--pdeathsig`). */
  readonly setpriv: string;
  readonly sh: string;
  /**
   * Environment for the host-side helpers (systemd-run, systemctl). It must let them reach the user
   * manager (`XDG_RUNTIME_DIR` / `DBUS_SESSION_BUS_ADDRESS`). It never reaches the sandboxed process,
   * which starts from `--clearenv`.
   */
  readonly env: Readonly<Record<string, string | undefined>>;
}

const SYSTEM_BIN_DIRS = ['/usr/bin', '/bin', '/usr/local/bin'];

/** First executable `name` in the standard system directories; a nonexistent path if none (preflight reports it). */
export function findSystemExecutable(name: string): string {
  for (const dir of SYSTEM_BIN_DIRS) {
    const candidate = path.join(dir, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return path.join(SYSTEM_BIN_DIRS[0] ?? '/usr/bin', name);
}

export function defaultHostTools(): HostTools {
  return {
    bwrap: findSystemExecutable('bwrap'),
    systemdRun: findSystemExecutable('systemd-run'),
    systemctl: findSystemExecutable('systemctl'),
    setpriv: findSystemExecutable('setpriv'),
    sh: '/bin/sh',
    env: process.env,
  };
}

export interface ExecResult {
  /** Exit code, or null if the process could not be spawned or was killed. */
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** Spawn error or timeout, if any. */
  readonly error?: string;
}

/** Runs a short host command and captures its output; never throws. */
export function execCapture(
  file: string,
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  timeoutMs = 10_000,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      file,
      [...args],
      { env: env as NodeJS.ProcessEnv, timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ code: 0, stdout, stderr });
          return;
        }
        const code = typeof error.code === 'number' ? error.code : null;
        const result: ExecResult = { code, stdout: stdout ?? '', stderr: stderr ?? '' };
        resolve(code === null ? { ...result, error: error.message } : result);
      },
    );
  });
}

/** States in which the user manager accepts transient scopes. */
const USABLE_MANAGER_STATES = new Set(['running', 'degraded', 'starting', 'initializing']);

/** Checks that a systemd user manager is reachable. Returns a reason if not. */
export async function checkUserManager(tools: HostTools): Promise<string | undefined> {
  const r = await execCapture(tools.systemctl, ['--user', 'is-system-running'], tools.env);
  const state = r.stdout.trim();
  if (USABLE_MANAGER_STATES.has(state)) return undefined;
  const why = [state, r.stderr.trim(), r.error].filter((s) => s !== undefined && s !== '').join('; ');
  return `no usable systemd user manager (systemctl --user is-system-running: ${why || `exit ${String(r.code)}`})`;
}

/** Reads unit properties (`systemctl --user show`). Missing units come back with `LoadState=not-found`. */
export async function showUnit(tools: HostTools, unit: string, props: readonly string[]): Promise<Record<string, string>> {
  const r = await execCapture(tools.systemctl, ['--user', 'show', unit, ...props.map((p) => `--property=${p}`)], tools.env);
  const out: Record<string, string> = {};
  for (const line of r.stdout.split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) out[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return out;
}

/** Sends `signal` to every process of every loaded unit matching `pattern` (a unit name or a glob). */
export async function killUnits(tools: HostTools, pattern: string, signal = 'SIGKILL'): Promise<ExecResult> {
  return execCapture(tools.systemctl, ['--user', 'kill', `--signal=${signal}`, '--kill-whom=all', pattern], tools.env);
}

/** Unloads a failed unit so its name can be reused and the user manager stays tidy. */
export async function resetFailed(tools: HostTools, unit: string): Promise<void> {
  await execCapture(tools.systemctl, ['--user', 'reset-failed', unit], tools.env);
}

/**
 * Stops a unit (`systemctl --user stop`): ends whatever still runs in it and unloads it, also when its cgroup is empty
 * and systemd would never stop it by itself (`kill` cannot end such a scope). Harmless for a unit that is gone.
 */
export async function stopUnit(tools: HostTools, unit: string): Promise<ExecResult> {
  return execCapture(tools.systemctl, ['--user', 'stop', unit], tools.env);
}

/** The cgroup v2 path (relative to /sys/fs/cgroup) of a live process, from `/proc/<pid>/cgroup`. */
export function cgroupOfPid(pid: number): string | undefined {
  try {
    const text = readFileSync(`/proc/${pid}/cgroup`, 'utf8');
    for (const line of text.split('\n')) {
      if (line.startsWith('0::')) return line.slice(3).trim();
    }
  } catch {
    // process gone
  }
  return undefined;
}

export const CGROUP_ROOT = '/sys/fs/cgroup';

export interface CgroupMemorySample {
  /** `memory.max` exists, i.e. the memory controller is enabled for this cgroup. */
  readonly memoryControllerEnabled: boolean;
  /** `memory.max` as written (bytes or `max`). */
  readonly memoryMax?: string;
  /** `memory.peak`: the highest charged memory (RSS + page cache) since the cgroup was created. */
  readonly peakBytes?: number;
  /** `memory.events` `oom_kill`: processes in this cgroup killed by the OOM killer. */
  readonly oomKills?: number;
  /** `memory.events` `oom`: times the limit was hit and an allocation was about to fail. */
  readonly oomEvents?: number;
}

function readOptional(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

/** Samples the memory files of a cgroup (absolute directory). Missing files are left undefined. */
export function sampleCgroupMemory(cgroupDir: string): CgroupMemorySample {
  const max = readOptional(path.join(cgroupDir, 'memory.max'));
  const peak = readOptional(path.join(cgroupDir, 'memory.peak'));
  const events = readOptional(path.join(cgroupDir, 'memory.events'));
  let oomKills: number | undefined;
  let oomEvents: number | undefined;
  for (const line of (events ?? '').split('\n')) {
    const [key, value] = line.trim().split(/\s+/);
    if (key === 'oom_kill') oomKills = Number(value);
    if (key === 'oom') oomEvents = Number(value);
  }
  const sample: {
    memoryControllerEnabled: boolean;
    memoryMax?: string;
    peakBytes?: number;
    oomKills?: number;
    oomEvents?: number;
  } = { memoryControllerEnabled: max !== undefined };
  if (max !== undefined) sample.memoryMax = max.trim();
  if (peak !== undefined && /^\d+$/.test(peak.trim())) sample.peakBytes = Number(peak.trim());
  if (oomKills !== undefined && Number.isFinite(oomKills)) sample.oomKills = oomKills;
  if (oomEvents !== undefined && Number.isFinite(oomEvents)) sample.oomEvents = oomEvents;
  return sample;
}
