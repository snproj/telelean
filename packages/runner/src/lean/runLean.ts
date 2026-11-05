/**
 * `runLean`: the one wrapper for every Lean-family process (03 §8.4, 02 D-24).
 *
 *   systemd-run --user --scope --unit=telelean-<run>-<n> -p MemoryMax=<cap> -p MemorySwapMax=0 -p OOMPolicy=stop --
 *     setpriv --pdeathsig KILL -- sh -c <keeper> telelean-keeper  bwrap <profile> -- <argv>
 *
 * - The scope puts every process of the run in one cgroup with a hard memory cap and no swap.
 * - bwrap applies the mount allowlist of {@link buildBwrapArgs}: no network, no host /run, `$HOME`
 *   masked, sources read-only, only `<shadow>/.lake` writable, environment cleared.
 * - The keeper is a few lines of `sh` that run bwrap and then hold the scope open until we have read
 *   the cgroup's `memory.events` and `memory.peak`. Without it the cgroup can vanish before we read it,
 *   and an OOM kill could go unnoticed. It also outlives the SIGTERM systemd sends to the whole scope
 *   when `OOMPolicy=stop` reacts to an OOM kill (see {@link KEEPER_SCRIPT}). `setpriv --pdeathsig` makes
 *   the keeper die with us, and bwrap's `--die-with-parent` then takes the sandbox down too.
 * - bwrap's `--json-status-fd` separates "could not start" from a command that ran and failed:
 *   `child-pid` arrives right after clone (before mount setup, which can still fail), while
 *   `exit-code` is written only if setup finished and the command was exec'd (bwrap 0.9.0
 *   `report_child_exit_status`).
 * - A run is registered for cancellation before its first `await`, so a cancel that arrives while it
 *   is still being prepared is not lost: the run is then never started.
 *
 * It fails closed: without bwrap, setpriv, systemd-run, a reachable systemd user manager, cgroup v2,
 * or an enforced memory cap, nothing runs and the status is `could-not-start`.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { accessSync, closeSync, constants, existsSync, mkdirSync, openSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import type { Readable, Writable } from 'node:stream';

import { buildBwrapArgs } from './sandboxProfile.js';
import {
  CGROUP_ROOT,
  cgroupOfPid,
  checkUserManager,
  defaultHostTools,
  killUnits,
  resetFailed,
  sampleCgroupMemory,
  showUnit,
  stopUnit,
  type HostTools,
} from './systemd.js';
import { checkToolchain, resolveToolchain, toolchainBinDir, type LeanToolchain } from './toolchain.js';

export type RunLeanStatus = 'ok' | 'failed' | 'oom' | 'timeout' | 'cancelled' | 'could-not-start';

export interface RunLeanOptions {
  /** Absolute path of the shadow project: the working directory, read-only except `.lake/`. */
  readonly shadowDir: string;
  /** The command to run inside the sandbox, e.g. `[<toolchain>/bin/lake, 'build']`. */
  readonly argv: readonly string[];
  /** systemd `MemoryMax=` for the whole scope, e.g. `4G`, `256M`. Default `4G`. */
  readonly memoryMax?: string;
  /** Wall-clock limit; on expiry the whole scope is killed. Default 120 000 ms. */
  readonly timeoutMs?: number;
  /** Extra paths bound read-only at the same path. */
  readonly roBinds?: readonly string[];
  /** Extra paths bound writable at the same path. */
  readonly rwBinds?: readonly string[];
  /** Paths covered by an empty tmpfs (e.g. a real workspace's `.git`). */
  readonly maskPaths?: readonly string[];
  /** The real project's `.lake/packages`, bound read-only at `<shadow>/.lake/packages`. */
  readonly packagesDir?: string;
  /** Extra environment inside the sandbox (on top of `HOME`, `PATH` and `LEAN_NUM_THREADS=4`). */
  readonly env?: Readonly<Record<string, string>>;
  /** Data written to the command's stdin (then closed). Default: stdin is /dev/null. */
  readonly stdin?: string;
  /** Write the command's stdout straight to this host file instead of capturing it (large exports). */
  readonly stdoutFile?: string;
  /** Cap on captured stdout and stderr, each. Default 32 MiB; the rest is drained and dropped. */
  readonly maxOutputBytes?: number;
  /**
   * Cancels the run; the status is then `cancelled`. Before the scope exists the run is simply never
   * started; afterwards its scope is killed.
   */
  readonly signal?: AbortSignal;
  /** Groups the run's scopes for {@link cancelRun}. `[A-Za-z0-9_]{1,64}`. Default: per-process. */
  readonly runId?: string;
  readonly toolchain?: LeanToolchain;
  /** Create the mount points `lake comparator`'s nested bwrap needs (see `SandboxProfile.allowNestedSandbox`). Default true. */
  readonly allowNestedSandbox?: boolean;
  /** Override host tool paths or the host environment (tests use this to check failing closed). */
  readonly host?: Partial<HostTools>;
}

export interface RunLeanResult {
  readonly status: RunLeanStatus;
  /** The sandboxed command's exit code (128+n if it died from signal n); null if it never ran or was killed by us. */
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** From spawning systemd-run until every process of the scope has exited (0 if nothing was spawned). */
  readonly durationMs: number;
  /**
   * cgroup `memory.peak` (RSS plus page cache) of the scope, read after the command finished, or just
   * before runLean killed it. Absent when the command never ran (`could-not-start`) or the cgroup could
   * not be read at that point: it is never a stale value from an earlier poll.
   */
  readonly peakMemoryBytes?: number;
  /** The scope unit, without the `.scope` suffix. */
  readonly unit: string;
  /** Why the run could not start, ran out of memory, or was stopped. */
  readonly detail?: string;
  readonly stdoutTruncated?: boolean;
  readonly stderrTruncated?: boolean;
}

export const DEFAULT_MEMORY_MAX = '4G';
export const DEFAULT_TIMEOUT_MS = 120_000;
export const DEFAULT_MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
/** Lean defaults inside the sandbox (RAM rule: at most 4 Lean threads). */
export const DEFAULT_SANDBOX_ENV: Readonly<Record<string, string>> = { LEAN_NUM_THREADS: '4' };

const MEMORY_MAX_PATTERN = /^\d+[KMGT]?$/;
const RUN_ID_PATTERN = /^[A-Za-z0-9_]{1,64}$/;
const STATUS_FD = 3;
const RELEASE_FD = 4;
const CGROUP_POLL_MS = 200;
/**
 * A cancel or timeout before bwrap reported its child waits for that report (the scope then exists) before killing,
 * at most this long; then systemd-run is killed anyway (it is stuck) and the close handler cleans up its unit.
 */
const KILL_DEFER_MAX_MS = 3_000;
/** ActiveState values of a unit that is still there and may need `systemctl stop` (an empty scope stays `active`). */
const LIVE_STATES = new Set(['active', 'activating', 'deactivating', 'reloading', 'refreshing']);

/**
 * The scope's main process, run by `sh`. It runs bwrap, reports bwrap's own exit status on fd 3 (bwrap
 * reports the command's on the same fd), then waits until the runner closes fd 4 before exiting, so the
 * scope's cgroup is still there to read.
 *
 * It outlives SIGTERM. With `OOMPolicy=stop`, an OOM kill makes systemd stop the scope by sending SIGTERM
 * to every process in it; bwrap and the command die of it, but the keeper has to stay until we have read
 * `memory.events` and `memory.peak`, or the cgroup, and the evidence in it, is gone first. The trap is a
 * handler, not an ignore, so bwrap and the command do not inherit it. A trapped signal ends `read` just
 * like EOF, hence the loop: only EOF without a TERM in between ends the wait. SIGKILL (timeout, cancel,
 * or `--pdeathsig` when the host dies) still ends the keeper at once.
 */
const KEEPER_SCRIPT = String.raw`trap 't=1' TERM; "$@" 4<&-; s=$?; printf '{ "keeper-bwrap-exit": %d }\n' "$s" >&3; while :; do t=; read -r _ <&4 && continue; [ -n "$t" ] || break; done; exit "$s"`;

/** Converts a `MemoryMax=` value to bytes (for checking what the kernel enforces). */
const UNIT_SHIFT: Readonly<Record<string, number>> = { K: 10, M: 20, G: 30, T: 40 };

export function memoryMaxToBytes(value: string): number {
  if (!MEMORY_MAX_PATTERN.test(value)) throw new TypeError(`memoryMax must look like 4G or 256M, got ${JSON.stringify(value)}`);
  const shift = UNIT_SHIFT[value.at(-1) ?? ''];
  const digits = shift === undefined ? value : value.slice(0, -1);
  return Number(digits) * 2 ** (shift ?? 0);
}

// ---------------------------------------------------------------------------------------------
// Preflight (fail closed)

const preflightOk = new Set<string>();

/** Checks everything runLean needs. Returns a reason if a sandboxed run cannot be started. */
export async function checkSandboxSupport(
  host: Partial<HostTools> = {},
  toolchain: LeanToolchain = resolveToolchain(),
): Promise<string | undefined> {
  const tools: HostTools = { ...defaultHostTools(), ...host };
  const key = JSON.stringify([
    tools.bwrap, tools.systemdRun, tools.systemctl, tools.setpriv, tools.sh,
    tools.env['XDG_RUNTIME_DIR'], tools.env['DBUS_SESSION_BUS_ADDRESS'], toolchain.dir,
  ]);
  if (preflightOk.has(key)) return undefined;
  if (process.platform !== 'linux') return 'sandboxed Lean runs need Linux (bwrap, systemd user scopes)';
  const required: Array<[string, string]> = [
    ['bwrap', tools.bwrap],
    ['systemd-run', tools.systemdRun],
    ['systemctl', tools.systemctl],
    ['setpriv', tools.setpriv],
    ['sh', tools.sh],
  ];
  for (const [name, file] of required) {
    try {
      accessSync(file, constants.X_OK);
    } catch {
      return `${name} not found or not executable at ${file}`;
    }
  }
  if (!existsSync(path.join(CGROUP_ROOT, 'cgroup.controllers'))) return 'cgroup v2 is not mounted at /sys/fs/cgroup';
  const toolchainProblem = checkToolchain(toolchain);
  if (toolchainProblem !== undefined) return toolchainProblem;
  const managerProblem = await checkUserManager(tools);
  if (managerProblem !== undefined) return managerProblem;
  preflightOk.add(key);
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Cancellation

/**
 * Cancellation of one run, from its first line to its result. A cancel that arrives while the run is
 * still preparing is remembered (`pending`) and the run is never started; once the scope's process is
 * spawned, `attach` routes cancels to the code that kills it.
 */
class RunCancellation {
  pending: string | undefined;
  private deliver: ((detail: string) => void) | undefined;
  constructor(
    readonly runId: string,
    readonly unit: string,
  ) {}
  cancel(detail: string): void {
    if (this.deliver !== undefined) this.deliver(detail);
    else this.pending ??= detail;
  }
  attach(deliver: (detail: string) => void): void {
    this.deliver = deliver;
  }
}

/** Every run of this process from its first line to its result, including runs still preparing. */
const activeRuns = new Set<RunCancellation>();
let unitCounter = 0;
const DEFAULT_RUN_ID = `p${process.pid}`;

/**
 * Cancels every scope of a run: `systemctl --user kill 'telelean-<run>-*'`. Runs started by this
 * process report `cancelled`, including runs that were still preparing (they never start). Returns how
 * many of this process's runs were signalled.
 */
export async function cancelRun(runId: string, host: Partial<HostTools> = {}): Promise<number> {
  if (!RUN_ID_PATTERN.test(runId)) throw new TypeError(`invalid runId ${JSON.stringify(runId)}`);
  let signalled = 0;
  for (const run of [...activeRuns]) {
    if (run.runId === runId) {
      run.cancel('cancelled via cancelRun');
      signalled++;
    }
  }
  await killUnits({ ...defaultHostTools(), ...host }, `telelean-${runId}-*`, 'SIGKILL');
  return signalled;
}

// ---------------------------------------------------------------------------------------------
// The run

type EndReason = 'timeout' | 'cancelled' | 'cap-not-enforced';

class OutputBuffer {
  private readonly chunks: Buffer[] = [];
  private size = 0;
  truncated = false;
  constructor(private readonly limit: number) {}
  push(chunk: Buffer): void {
    if (this.size >= this.limit) {
      this.truncated = true;
      return;
    }
    const room = this.limit - this.size;
    const part = chunk.length > room ? chunk.subarray(0, room) : chunk;
    if (part.length < chunk.length) this.truncated = true;
    this.chunks.push(part);
    this.size += part.length;
  }
  text(): string {
    return Buffer.concat(this.chunks).toString('utf8');
  }
}

/** A run that ended before anything was spawned. */
function notStarted(status: 'could-not-start' | 'cancelled', unit: string, detail: string): RunLeanResult {
  return { status, exitCode: null, stdout: '', stderr: '', durationMs: 0, unit, detail };
}

function lastLines(text: string, n: number): string {
  return text.trim().split('\n').slice(-n).join('\n');
}

/** Runs `argv` in the sandbox. Never throws for runtime failures; throws TypeError for invalid arguments. */
export async function runLean(options: RunLeanOptions): Promise<RunLeanResult> {
  const runId = options.runId ?? DEFAULT_RUN_ID;
  if (!RUN_ID_PATTERN.test(runId)) throw new TypeError(`runId must match ${RUN_ID_PATTERN.source}, got ${JSON.stringify(runId)}`);
  const memoryMax = options.memoryMax ?? DEFAULT_MEMORY_MAX;
  const memoryMaxBytes = memoryMaxToBytes(memoryMax);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!(timeoutMs > 0)) throw new TypeError('timeoutMs must be positive');
  if (options.argv.length === 0) throw new TypeError('argv must not be empty');
  if (!path.isAbsolute(options.shadowDir)) throw new TypeError('shadowDir must be absolute');
  const unit = `telelean-${runId}-${++unitCounter}`;
  const tools: HostTools = { ...defaultHostTools(), ...options.host };
  const toolchain = options.toolchain ?? resolveToolchain();

  if (options.signal?.aborted) return notStarted('cancelled', unit, 'cancelled before start');

  // Register before the first await, so a cancel (abort or cancelRun) during the preparation is not lost.
  const cancellation = new RunCancellation(runId, unit);
  const onAbort = (): void => cancellation.cancel('cancelled by caller');
  activeRuns.add(cancellation);
  options.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const preflight = await checkSandboxSupport(tools, toolchain);
    if (cancellation.pending !== undefined) return notStarted('cancelled', unit, `${cancellation.pending} before start`);
    if (preflight !== undefined) return notStarted('could-not-start', unit, preflight);

    // From here to the spawn everything is synchronous, so no cancel can arrive in between: it either
    // came before (checked above) or reaches the scope through `cancellation.attach` below.
    const shadowDir = path.resolve(options.shadowDir);
    try {
      if (!statSync(shadowDir).isDirectory()) return notStarted('could-not-start', unit, `shadow ${shadowDir} is not a directory`);
      mkdirSync(path.join(shadowDir, '.lake'), { recursive: true });
    } catch (e) {
      return notStarted('could-not-start', unit, `shadow ${shadowDir} is unusable: ${(e as Error).message}`);
    }
    for (const p of [...(options.roBinds ?? []), ...(options.rwBinds ?? []), ...(options.packagesDir ? [options.packagesDir] : [])]) {
      if (!existsSync(p)) return notStarted('could-not-start', unit, `bind source does not exist: ${p}`);
    }

    const bwrapArgs = buildBwrapArgs(
      {
        home: homedir(),
        elanHome: toolchain.elanHome,
        toolchainBin: toolchainBinDir(toolchain),
        shadowDir,
        packagesDir: options.packagesDir,
        roBinds: options.roBinds,
        rwBinds: options.rwBinds,
        maskPaths: options.maskPaths,
        allowNestedSandbox: options.allowNestedSandbox,
        env: { ...DEFAULT_SANDBOX_ENV, ...options.env },
        jsonStatusFd: STATUS_FD,
      },
      options.argv,
    );
    const systemdArgs = [
      '--user', '--scope', '--quiet', '--expand-environment=no',
      `--unit=${unit}`,
      '--description=telelean sandboxed Lean run',
      '-p', `MemoryMax=${memoryMax}`,
      '-p', 'MemorySwapMax=0',
      '-p', 'OOMPolicy=stop',
      '--',
      tools.setpriv, '--pdeathsig', 'KILL', '--',
      tools.sh, '-c', KEEPER_SCRIPT, 'telelean-keeper',
      tools.bwrap, ...bwrapArgs,
    ];

    let stdoutFd: number | undefined;
    if (options.stdoutFile !== undefined) {
      try {
        stdoutFd = openSync(options.stdoutFile, 'w', 0o644);
      } catch (e) {
        return notStarted('could-not-start', unit, `cannot open ${options.stdoutFile}: ${(e as Error).message}`);
      }
    }

    const t0 = performance.now();
    let child: ChildProcess;
    try {
      child = spawn(tools.systemdRun, systemdArgs, {
        env: tools.env as NodeJS.ProcessEnv,
        stdio: [options.stdin !== undefined ? 'pipe' : 'ignore', stdoutFd ?? 'pipe', 'pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      if (stdoutFd !== undefined) closeSync(stdoutFd);
      return notStarted('could-not-start', unit, `cannot spawn systemd-run: ${(e as Error).message}`);
    }
    if (stdoutFd !== undefined) closeSync(stdoutFd); // the child holds its own copy

    return await new Promise<RunLeanResult>((resolve) => {
      const limit = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
      const stdout = new OutputBuffer(limit);
      const stderr = new OutputBuffer(limit);
      const statusStream = child.stdio[STATUS_FD] as Readable | null;
      const releaseStream = child.stdio[RELEASE_FD] as Writable | null;

      let sawChildPid = false;
      /** The command's exit code; bwrap reports it only once setup finished and the command was exec'd. */
      let commandExit: number | null = null;
      let bwrapExit: number | null = null;
      let endReason: EndReason | undefined;
      let endDetail: string | undefined;
      let spawnError: string | undefined;
      let cgroupDir: string | undefined;
      /** Highest `memory.peak`, `oom_kill` and `oom` seen in any sample. */
      let peak: number | undefined;
      let oomKills = 0;
      let oomEvents = 0;
      /** A sample succeeded after the command finished (or just before we killed it): the values above are final. */
      let endSampled = false;
      let released = false;
      /** The keeper has exited and its pipes are closed: later cancels change nothing. */
      let closed = false;
      let pollTimer: NodeJS.Timeout | undefined;
      let releaseFallback: NodeJS.Timeout | undefined;
      /** A cancel or timeout came before bwrap's child-pid report: kill when it arrives (or after KILL_DEFER_MAX_MS). */
      let killDeferred = false;
      let killFallback: NodeJS.Timeout | undefined;
      /** systemd-run was killed before the scope was seen to exist (the fallback): its unit may appear only later. */
      let killedBeforeScope = false;

      const sample = (atEnd = false): void => {
        if (cgroupDir === undefined) return;
        const s = sampleCgroupMemory(cgroupDir);
        if (s.peakBytes !== undefined) peak = Math.max(peak ?? 0, s.peakBytes);
        if (s.oomKills !== undefined) oomKills = Math.max(oomKills, s.oomKills);
        if (s.oomEvents !== undefined) oomEvents = Math.max(oomEvents, s.oomEvents);
        if (atEnd && s.peakBytes !== undefined && s.oomKills !== undefined) endSampled = true;
      };
      const release = (): void => {
        if (released) return;
        released = true;
        releaseStream?.end();
      };
      const killNow = (): void => {
        if (killFallback) clearTimeout(killFallback);
        killFallback = undefined;
        if (closed) return;
        if (!sawChildPid) killedBeforeScope = true;
        void killUnits(tools, `${unit}.scope`, 'SIGKILL');
        child.kill('SIGKILL'); // the keeper (or a stuck systemd-run); bwrap follows via --die-with-parent
      };
      const terminate = (reason: EndReason, detail?: string): void => {
        if (endReason !== undefined || closed) return;
        endReason = reason;
        endDetail = detail;
        if (reason !== 'cap-not-enforced') sample(true); // final: nothing allocates after the kill
        release();
        if (sawChildPid) {
          killNow();
          return;
        }
        // Closing round 1: systemd-run may still be waiting for systemd to create the scope. Killing it now made systemd
        // move the dying process into the new cgroup, where the kernel skips it: the scope then stayed active with no
        // process forever (or failed with Result=resources), and `systemctl kill` cannot end it. So wait until bwrap
        // reports its child (by then systemd-run has exec'd the keeper inside the scope), then kill the whole scope.
        killDeferred = true;
        killFallback = setTimeout(killNow, KILL_DEFER_MAX_MS);
      };
      cancellation.attach((detail) => terminate('cancelled', detail));

      const timer = setTimeout(() => terminate('timeout', `killed after ${timeoutMs} ms`), timeoutMs);

      child.on('error', (e) => {
        spawnError = e.message;
      });
      child.stdout?.on('data', (c: Buffer) => stdout.push(c));
      child.stderr?.on('data', (c: Buffer) => stderr.push(c));
      if (options.stdin !== undefined && child.stdin) {
        child.stdin.on('error', () => undefined); // the command may exit without reading
        child.stdin.end(options.stdin);
      }
      releaseStream?.on('error', () => undefined);

      let statusBuf = '';
      statusStream?.on('data', (chunk: Buffer) => {
        statusBuf += chunk.toString('utf8');
        let nl: number;
        while ((nl = statusBuf.indexOf('\n')) >= 0) {
          const line = statusBuf.slice(0, nl).trim();
          statusBuf = statusBuf.slice(nl + 1);
          if (line === '') continue;
          let record: Record<string, unknown>;
          try {
            record = JSON.parse(line) as Record<string, unknown>;
          } catch {
            continue;
          }
          if (typeof record['child-pid'] === 'number' && !sawChildPid) {
            // The sandbox process exists (so does the scope); its mount setup may still fail.
            sawChildPid = true;
            if (killDeferred) {
              killNow(); // cancelled or timed out while the scope was being created
              continue;
            }
            const cg = child.pid === undefined ? undefined : cgroupOfPid(child.pid);
            if (cg === undefined || !cg.endsWith(`/${unit}.scope`)) {
              terminate('cap-not-enforced', `run is not in its scope's cgroup (found ${String(cg)})`);
              continue;
            }
            cgroupDir = path.join(CGROUP_ROOT, cg);
            const s = sampleCgroupMemory(cgroupDir);
            const enforced = s.memoryMax !== undefined && s.memoryMax !== 'max' && Number(s.memoryMax) <= memoryMaxBytes;
            if (!enforced) {
              terminate('cap-not-enforced', `memory cap not enforced in ${cgroupDir} (memory.max=${String(s.memoryMax)})`);
              continue;
            }
            sample();
            pollTimer = setInterval(sample, CGROUP_POLL_MS);
          } else if (typeof record['exit-code'] === 'number') {
            commandExit = record['exit-code'];
            sample(true);
            releaseFallback ??= setTimeout(release, 5_000);
          } else if (typeof record['keeper-bwrap-exit'] === 'number') {
            bwrapExit = record['keeper-bwrap-exit'];
            sample(true); // the keeper is still in the scope, so the cgroup still exists
            release();
          }
        }
      });

      child.on('close', (code, signal) => {
        closed = true;
        void (async () => {
          clearTimeout(timer);
          if (pollTimer) clearInterval(pollTimer);
          if (releaseFallback) clearTimeout(releaseFallback);
          if (killFallback) clearTimeout(killFallback);
          const durationMs = Math.round(performance.now() - t0);
          sample(true); // usually gone by now; harmless if so

          // systemd's verdict: with OOMPolicy=stop an OOM kill fails the scope with Result=oom-kill,
          // and a failed unit stays loaded until reset-failed, so this cannot be missed by a race.
          // The keeper has exited, so the scope is empty or about to be; give systemd a moment to settle.
          const scope = `${unit}.scope`;
          const read = (): Promise<Record<string, string>> => showUnit(tools, scope, ['Result', 'ActiveState', 'LoadState']);
          const settling = (p: Record<string, string>): boolean => p['ActiveState'] === 'deactivating' || p['ActiveState'] === 'active';
          let props = await read();
          for (let i = 0; i < 20 && settling(props); i++) {
            await new Promise((r) => setTimeout(r, 100));
            props = await read();
          }
          // A stuck systemd-run was killed before its scope was seen: the unit may be created only now (empty or failed).
          for (let i = 0; killedBeforeScope && i < 10 && props['LoadState'] !== 'loaded'; i++) {
            await new Promise((r) => setTimeout(r, 100));
            props = await read();
          }
          const systemdOom = props['Result'] === 'oom-kill';
          if (props['LoadState'] === 'loaded' && LIVE_STATES.has(props['ActiveState'] ?? '')) {
            // Still there after the keeper exited: a process outlived it (should be impossible: bwrap's PID namespace dies
            // with it), or an empty scope systemd will never stop by itself. SIGKILL whatever still runs (so `stop` never
            // waits out a stop timeout), then `stop` ends the scope even when it is empty (`kill` alone cannot).
            await killUnits(tools, scope, 'SIGKILL');
            await stopUnit(tools, scope);
            props = { ...(await read()), ...(systemdOom ? { Result: 'oom-kill' } : {}) };
          }
          if (props['LoadState'] === 'loaded' && props['ActiveState'] === 'failed') await resetFailed(tools, scope);

          const err = stderr.text();
          const base = {
            exitCode: endReason === undefined ? commandExit : null,
            stdout: stdout.text(),
            stderr: err,
            durationMs,
            unit,
            ...(stdout.truncated ? { stdoutTruncated: true } : {}),
            ...(stderr.truncated ? { stderrTruncated: true } : {}),
          };
          let status: RunLeanStatus;
          let detail: string | undefined;
          if (endReason === 'timeout') {
            status = 'timeout';
            detail = endDetail;
          } else if (endReason === 'cancelled') {
            status = 'cancelled';
            detail = endDetail;
          } else if (endReason === 'cap-not-enforced') {
            status = 'could-not-start';
            detail = endDetail;
          } else if (oomKills > 0 || systemdOom) {
            // Checked before "did it run": systemd's OOM stop can kill bwrap before it reports anything.
            status = 'oom';
            const evidence = `cgroup oom=${oomEvents} oom_kill=${oomKills}${endSampled ? '' : ' (not read after the kill)'}, systemd Result=${props['Result'] ?? '?'}`;
            if (oomEvents > 0) detail = `memory cap ${memoryMax} exceeded (${evidence})`;
            else if (endSampled) detail = `killed by the kernel OOM killer below the ${memoryMax} cap: the machine ran out of memory (${evidence})`;
            else detail = `killed by the kernel OOM killer; the memory cap was ${memoryMax} (${evidence})`;
          } else if (commandExit !== null) {
            // bwrap writes exit-code only if its child finished setting up the sandbox and exec'd the command.
            status = commandExit === 0 ? 'ok' : 'failed';
          } else if (!sawChildPid) {
            status = 'could-not-start';
            detail = `could not create the scope: ${lastLines(err, 5) || spawnError || `systemd-run exited with ${String(code ?? signal)}`}`;
          } else if (bwrapExit !== null && bwrapExit < 128) {
            status = 'could-not-start';
            detail = `bwrap could not set up the sandbox: ${lastLines(err, 5) || `bwrap exited with ${bwrapExit}`}`;
          } else {
            status = 'failed';
            detail = `the sandbox was killed before the command finished (bwrap ${String(bwrapExit)}, keeper ${String(code ?? signal)})`;
          }
          // A peak only for a command that ran, and only from a sample taken at its end (never a stale poll).
          const peakMemoryBytes = endSampled && status !== 'could-not-start' ? peak : undefined;
          resolve({
            ...base,
            status,
            ...(peakMemoryBytes !== undefined ? { peakMemoryBytes } : {}),
            ...(detail !== undefined ? { detail } : {}),
          });
        })();
      });
    });
  } finally {
    activeRuns.delete(cancellation);
    options.signal?.removeEventListener('abort', onAbort);
  }
}
