/**
 * runLean on this machine: a sandboxed build, the inert probes, the memory cap, timeouts,
 * cancellation, and failing closed.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { cancelRun, checkSandboxSupport, runLean } from '../../src/lean/runLean.js';
import { createShadow } from '../../src/lean/shadow.js';
import { defaultHostTools, execCapture, showUnit } from '../../src/lean/systemd.js';
import { resolveToolchain, toolchainExe } from '../../src/lean/toolchain.js';
import {
  cleanupTempRoot,
  installProbe,
  knownProjectsLines,
  makeTempRoot,
  MiB,
  probeLines,
  processesMatching,
  sleep,
  spyroShadow,
  SPYRO,
  TEST_RUN_ID,
  waitForProcesses,
} from './helpers.js';

const lake = toolchainExe(resolveToolchain(), 'lake');
const HOME_PROBE_FILE = path.join(homedir(), 'telelean-sandbox-probe-escape.txt');

async function unitGone(unit: string): Promise<boolean> {
  const props = await showUnit(defaultHostTools(), `${unit}.scope`, ['LoadState', 'ActiveState']);
  return props['ActiveState'] === 'inactive' || props['LoadState'] === 'not-found';
}

describe('runLean', () => {
  let tmp: string;
  let knownBefore: number | undefined;

  beforeAll(() => {
    tmp = makeTempRoot('sandbox');
    knownBefore = knownProjectsLines();
  });
  afterAll(() => {
    cleanupTempRoot(tmp);
  });

  it('passes the preflight on this machine', async () => {
    expect(await checkSandboxSupport()).toBeUndefined();
  });

  it('builds the fixture in the sandbox', async () => {
    const shadow = await createShadow(SPYRO, path.join(tmp, 'build'));
    const r = await runLean({ shadowDir: shadow.dir, argv: [lake, 'build'], runId: TEST_RUN_ID });
    console.log(`[sandboxed lake build] status=${r.status} ${r.durationMs} ms, peak ${((r.peakMemoryBytes ?? 0) / MiB).toFixed(1)} MiB\n${r.stdout.trim()}`);
    expect(r.status).toBe('ok');
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('Build completed successfully');
    expect(existsSync(path.join(shadow.dir, '.lake/build/lib/lean/Model.olean'))).toBe(true);
    expect(r.peakMemoryBytes).toBeGreaterThan(0);
    expect(await unitGone(r.unit)).toBe(true);

    // A shadow made from the built one carries .lake/build along: is the next build incremental?
    const again = await createShadow(shadow.dir, path.join(tmp, 'build-copy'));
    const r2 = await runLean({ shadowDir: again.dir, argv: [lake, 'build'], runId: TEST_RUN_ID });
    const rebuilt = r2.stdout.split('\n').filter((l) => /Built /.test(l)).length;
    console.log(`[build from a copied .lake/build] status=${r2.status} ${r2.durationMs} ms, ${again.buildFiles} build files copied, modules rebuilt: ${rebuilt}\n${r2.stdout.trim()}`);
    expect(again.copiedBuild).toBe(true);
    expect(r2.status).toBe('ok');
    expect(rebuilt).toBe(0);
    expect(r.stdout.split('\n').filter((l) => /Built /.test(l)).length).toBeGreaterThan(0); // the regex does see real builds
  });

  it('reports a failing command as failed, with its exit code', async () => {
    const shadow = await createShadow(SPYRO, path.join(tmp, 'fail'));
    const r = await runLean({ shadowDir: shadow.dir, argv: ['/bin/sh', '-c', 'echo out; echo err >&2; exit 3'], runId: TEST_RUN_ID });
    expect(r.status).toBe('failed');
    expect(r.exitCode).toBe(3);
    expect(r.stdout).toBe('out\n');
    expect(r.stderr).toBe('err\n');
  });

  it('applies the extra binds: read-only, writable, masked (.git) and the packages bind', async () => {
    const shadow = await createShadow(SPYRO, path.join(tmp, 'binds'));
    const ro = path.join(tmp, 'binds-ro');
    const rw = path.join(tmp, 'binds-rw');
    const real = path.join(tmp, 'binds-real');
    mkdirSync(ro);
    mkdirSync(rw);
    mkdirSync(path.join(real, '.lake', 'packages', 'dep'), { recursive: true });
    mkdirSync(path.join(shadow.dir, '.git'));
    writeFileSync(path.join(ro, 'in.txt'), 'ro-content\n');
    writeFileSync(path.join(real, '.lake', 'packages', 'dep', 'Dep.lean'), 'def dep := 1\n');
    writeFileSync(path.join(shadow.dir, '.git', 'config'), 'secret\n');
    const script = [
      `cat ${ro}/in.txt`,
      `echo w > ${ro}/out.txt 2>/dev/null && echo ro-writable || echo ro-blocked`,
      `echo w > ${rw}/out.txt && echo rw-ok`,
      `echo git=$(ls -A .git | wc -l)`,
      'cat .lake/packages/dep/Dep.lean',
      'echo w > .lake/packages/dep/x 2>/dev/null && echo pkg-writable || echo pkg-blocked',
    ].join('; ');
    const r = await runLean({
      shadowDir: shadow.dir,
      argv: ['/bin/sh', '-c', script],
      roBinds: [ro],
      rwBinds: [rw],
      maskPaths: [path.join(shadow.dir, '.git')],
      packagesDir: path.join(real, '.lake', 'packages'),
      runId: TEST_RUN_ID,
    });
    console.log(`[binds] ${r.status}\n${r.stdout.trim()}`);
    expect(r.status).toBe('ok');
    expect(r.stdout.split('\n').filter((l) => l !== '')).toEqual(['ro-content', 'ro-blocked', 'rw-ok', 'git=0', 'def dep := 1', 'pkg-blocked']);
    expect(readFileSync(path.join(rw, 'out.txt'), 'utf8')).toBe('w\n');
    expect(existsSync(path.join(ro, 'out.txt'))).toBe(false);
    expect(readFileSync(path.join(shadow.dir, '.git', 'config'), 'utf8')).toBe('secret\n'); // masked, not touched
  });

  describe('inert probes', () => {
    it('cannot write into the real $HOME, ~/.elan or the shadow sources; only .lake is writable', async () => {
      rmSync(HOME_PROBE_FILE, { force: true });
      const shadow = await spyroShadow(tmp, 'probe-write');
      installProbe(shadow.dir, 'WriteHome');
      const r = await runLean({ shadowDir: shadow.dir, argv: [lake, 'env', 'lean', 'Probe.lean'], runId: TEST_RUN_ID });
      console.log(`[probe WriteHome] ${r.status}\n${r.stdout.trim()}`);
      const probe = probeLines(r.stdout);
      expect(r.status).toBe('ok');
      // The write "succeeds" into the tmpfs that masks $HOME, and never reaches the real one.
      expect(probe.get('home')?.[0]).toMatch(/^WROTE /);
      expect(existsSync(HOME_PROBE_FILE)).toBe(false);
      expect(probe.get('elan')?.[0]).toMatch(/^BLOCKED .*read-only file system/i);
      expect(probe.get('shadow-source')?.[0]).toMatch(/^BLOCKED .*read-only file system/i);
      expect(existsSync(path.join(shadow.dir, 'telelean-sandbox-probe-escape.txt'))).toBe(false);
      expect(probe.get('shadow-lake')?.[0]).toMatch(/^WROTE /);
      expect(existsSync(path.join(shadow.dir, '.lake', 'telelean-sandbox-probe-lake.txt'))).toBe(true);
    });

    it('sees only the empty tmpfs for $HOME, an empty /run, and no session variables', async () => {
      const shadow = await spyroShadow(tmp, 'probe-list');
      installProbe(shadow.dir, 'ListHome');
      const r = await runLean({ shadowDir: shadow.dir, argv: [lake, 'env', 'lean', 'Probe.lean'], runId: TEST_RUN_ID });
      console.log(`[probe ListHome] ${r.status}\n${r.stdout.trim()}`);
      expect(r.status).toBe('ok');
      const probe = probeLines(r.stdout);
      const entries = (label: string): string[] =>
        (probe.get(label) ?? []).filter((l) => l.startsWith('ENTRY ')).map((l) => l.slice(6)).sort();
      // $HOME holds only the mount point of the read-only ~/.elan bind (plus the path to the shadow, if it lives under $HOME).
      const expectedHome = new Set(['.elan']);
      const rel = path.relative(homedir(), shadow.dir);
      if (!rel.startsWith('..') && !path.isAbsolute(rel)) expectedHome.add(rel.split(path.sep)[0] ?? '');
      expect(entries('home')).toEqual([...expectedHome].sort());
      expect(readdirSync(homedir()).length).toBeGreaterThan(expectedHome.size); // the real home has more
      expect(entries('run')).toEqual(['user']);
      expect(entries('run-user')).toEqual([]);
      expect(probe.get('run-user')).toContain('COUNT 0');
      const unset = (probe.get('env') ?? []).filter((l) => l.startsWith('UNSET ')).length;
      expect(unset).toBe(5);
    });

    it('has no network: loopback only, DNS, TCP, D-Bus and abstract sockets all blocked', async () => {
      const shadow = await spyroShadow(tmp, 'probe-net');
      installProbe(shadow.dir, 'Network');
      const r = await runLean({ shadowDir: shadow.dir, argv: [lake, 'env', 'lean', 'Probe.lean'], runId: TEST_RUN_ID });
      console.log(`[probe Network] ${r.status}\n${r.stdout.trim()}`);
      expect(r.status).toBe('ok');
      const probe = probeLines(r.stdout);
      expect(probe.get('interfaces')?.[0]).toBe('lo');
      for (const label of ['dns', 'tcp', 'dbus', 'abstract-x11']) {
        expect(probe.get(label)?.[0], label).toMatch(/^BLOCKED /);
      }
    });
  });

  it('enforces the memory cap: allocating ~600 MB under a 256M cap is reported as oom', async () => {
    const shadow = await createShadow(SPYRO, path.join(tmp, 'oom'));
    const r = await runLean({
      shadowDir: shadow.dir,
      argv: ['python3', '-I', '-c', "import time; x = b'\\x01' * (600 * 1024 * 1024); time.sleep(2); print(len(x))"],
      memoryMax: '256M',
      runId: TEST_RUN_ID,
    });
    console.log(`[oom] status=${r.status} exit=${String(r.exitCode)} ${r.durationMs} ms peak=${((r.peakMemoryBytes ?? 0) / MiB).toFixed(1)} MiB detail=${r.detail ?? ''}`);
    expect(r.status).toBe('oom');
    expect(r.stdout).not.toContain(String(600 * MiB));
    // Two independent signals: the cgroup's memory.events (read while the keeper still holds the scope,
    // after systemd's OOM stop has killed the rest) and systemd's own Result for the scope.
    expect(r.detail).toMatch(/^memory cap 256M exceeded \(cgroup oom=[1-9]\d* oom_kill=[1-9]\d*, systemd Result=oom-kill\)$/);
    // The peak is read after the kill, so it is the real one (at the cap), never a stale earlier sample.
    expect(r.peakMemoryBytes).toBeGreaterThan(200 * MiB);
    expect(r.peakMemoryBytes).toBeLessThanOrEqual(256 * MiB);
    expect(await unitGone(r.unit)).toBe(true); // the failed scope was reset
  });

  it('kills the whole scope on timeout and leaves no processes behind', async () => {
    const shadow = await createShadow(SPYRO, path.join(tmp, 'timeout'));
    const marker = `${7000 + (process.pid % 997)}.125`;
    const re = marker.replace('.', '\\.');
    const pending = runLean({
      shadowDir: shadow.dir,
      argv: ['/bin/sh', '-c', `sleep ${marker} & sleep ${marker}; wait`],
      timeoutMs: 3000,
      runId: TEST_RUN_ID,
    });
    const during = await waitForProcesses(`^sleep ${re}$`, 2, 2500); // exactly the two sleeps
    const r = await pending;
    const after = processesMatching(re); // anything still mentioning the marker: sleeps, sh, bwrap, keeper

    console.log(`[timeout] status=${r.status} ${r.durationMs} ms; sleeps during=${during.length} after=${after.length}; peak ${((r.peakMemoryBytes ?? 0) / MiB).toFixed(1)} MiB`);
    expect(during.length).toBe(2);
    expect(r.status).toBe('timeout');
    expect(r.exitCode).toBeNull();
    expect(r.durationMs).toBeLessThan(10_000);
    expect(r.peakMemoryBytes).toBeGreaterThan(0); // sampled just before the kill
    expect(after).toEqual([]);
    expect(await unitGone(r.unit)).toBe(true);
  });

  it('cancels via AbortSignal and via cancelRun(runId), killing every scope of the run', async () => {
    const shadow = await createShadow(SPYRO, path.join(tmp, 'cancel'));
    const marker = `${8000 + (process.pid % 997)}.25`;
    const controller = new AbortController();
    const aborted = runLean({ shadowDir: shadow.dir, argv: ['sleep', marker], signal: controller.signal, runId: TEST_RUN_ID });
    const re = marker.replace('.', '\\.');
    expect((await waitForProcesses(`^sleep ${re}$`, 1)).length).toBe(1);
    controller.abort();
    const a = await aborted;
    expect(a.status).toBe('cancelled');
    expect(processesMatching(re)).toEqual([]);

    const runId = `${TEST_RUN_ID}c`;
    const both = [
      runLean({ shadowDir: shadow.dir, argv: ['sleep', marker], runId }),
      runLean({ shadowDir: shadow.dir, argv: ['sleep', marker], runId }),
    ];
    expect((await waitForProcesses(`^sleep ${re}$`, 2)).length).toBe(2);
    expect(await cancelRun(runId)).toBe(2);
    const results = await Promise.all(both);
    console.log(`[cancel] abort=${a.status} ${a.durationMs} ms; cancelRun=${results.map((x) => `${x.unit}:${x.status}`).join(', ')}`);
    expect(results.map((x) => x.status)).toEqual(['cancelled', 'cancelled']);
    expect(processesMatching(re)).toEqual([]);
  });

  it('does not lose a cancel that arrives before the scope exists: the run never starts', async () => {
    const shadow = await createShadow(SPYRO, path.join(tmp, 'cancel-early'));
    const marker = `${5000 + (process.pid % 997)}.75`;
    const re = marker.replace('.', '\\.');
    const run = (extra: Partial<Parameters<typeof runLean>[0]> = {}): ReturnType<typeof runLean> =>
      runLean({ shadowDir: shadow.dir, argv: ['sleep', marker], runId: TEST_RUN_ID, ...extra });

    // Already aborted when runLean is called.
    const preAborted = run({ signal: AbortSignal.abort() });
    // Aborted in the same tick as the call, i.e. while runLean awaits its preflight.
    const sameTick = new AbortController();
    const abortedSameTick = run({ signal: sameTick.signal });
    sameTick.abort();
    // cancelRun right after the call.
    const earlyRunId = `${TEST_RUN_ID}e`;
    const viaCancelRun = run({ runId: earlyRunId });
    const signalled = await cancelRun(earlyRunId);
    // Aborted while a preflight really runs `systemctl --user is-system-running` (an equivalent sh path
    // is a new preflight cache key): the window the verifier reproduced.
    const duringPreflight = new AbortController();
    const abortedDuringPreflight = run({ signal: duringPreflight.signal, host: { sh: '/usr/bin/sh' } });
    await sleep(1);
    duringPreflight.abort();

    const results = await Promise.all([preAborted, abortedSameTick, viaCancelRun, abortedDuringPreflight]);
    await sleep(300); // a sleep that had started would still be running now
    const strays = processesMatching(re);
    console.log(`[early cancel] ${results.map((r) => `${r.status} (${r.durationMs} ms, ${r.detail ?? ''})`).join('; ')}; cancelRun signalled ${signalled}; strays ${strays.length}`);
    expect(results.map((r) => r.status)).toEqual(['cancelled', 'cancelled', 'cancelled', 'cancelled']);
    expect(signalled).toBe(1);
    for (const r of results.slice(0, 3)) expect(r.durationMs).toBe(0); // nothing was spawned
    for (const r of results) {
      expect(r.exitCode).toBeNull();
      expect(await unitGone(r.unit)).toBe(true);
    }
    expect(strays).toEqual([]);
  });

  it('closing round 1: a cancel just as the job starts (while systemd-run creates the scope) never leaves a telelean-* unit behind', async () => {
    const shadow = await createShadow(SPYRO, path.join(tmp, 'cancel-at-start'));
    const runId = `${TEST_RUN_ID}s`;
    const tools = defaultHostTools();
    const unitsOfRun = async (): Promise<string[]> => {
      const r = await execCapture(tools.systemctl, ['--user', 'list-units', '--all', '--plain', '--no-legend', `telelean-${runId}-*`], tools.env);
      return r.stdout.split('\n').map((line) => line.trim().split(/\s+/)[0] ?? '').filter((name) => name !== '');
    };
    expect(await checkSandboxSupport()).toBeUndefined(); // cached: runLean spawns systemd-run right away
    const statuses: string[] = [];
    let left: string[] = [];
    try {
      // Cancel 0 to 20 ms after the call: systemd-run typically needs 5 to 20 ms to create the scope, and killing it
      // meanwhile used to leave an empty scope that systemd never stopped (or a failed one, Result=resources).
      for (let i = 0; i < 42; i++) {
        const controller = new AbortController();
        const job = runLean({ shadowDir: shadow.dir, argv: ['sleep', '30'], runId, signal: controller.signal });
        setTimeout(() => controller.abort(), i % 21);
        const r = await job;
        statuses.push(r.status);
      }
      await sleep(500);
      left = await unitsOfRun();
      console.log(`[cancel at start] ${statuses.length} jobs: ${[...new Set(statuses)].join(', ')}; units left: ${left.length}`);
      expect(new Set(statuses)).toEqual(new Set(['cancelled']));
      expect(left).toEqual([]);
    } finally {
      // Never leave a unit in the user's systemd session, even when the assertion above fails.
      for (const unit of left.length > 0 ? left : await unitsOfRun()) {
        await execCapture(tools.systemctl, ['--user', 'stop', unit], tools.env);
        await execCapture(tools.systemctl, ['--user', 'reset-failed', unit], tools.env);
      }
    }
  }, 240_000);

  it('takes the sandbox down when the host process dies (extension-host crash)', async () => {
    const { build } = await import('esbuild');
    const script = path.join(tmp, 'host-crash-child.mjs');
    await build({
      entryPoints: [path.join(path.dirname(fileURLToPath(import.meta.url)), 'support', 'hostCrashChild.ts')],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile: script,
      logLevel: 'silent',
    });
    const shadow = await createShadow(SPYRO, path.join(tmp, 'host-crash'));
    const marker = `${6000 + (process.pid % 997)}.5`;
    const re = marker.replace('.', '\\.');
    const host = spawn(process.execPath, [script, shadow.dir, marker, `${TEST_RUN_ID}h`], { stdio: 'ignore' });
    for (let i = 0; i < 100 && processesMatching(`^sleep ${re}$`).length === 0; i++) await sleep(100);
    const before = processesMatching(`^sleep ${re}$`).length;
    host.kill('SIGKILL');
    let left = processesMatching(re);
    for (let i = 0; i < 50 && left.length > 0; i++) {
      await sleep(100);
      left = processesMatching(re);
    }
    const unit = `telelean-${TEST_RUN_ID}h-1`; // the child's first scope
    const props = await showUnit(defaultHostTools(), `${unit}.scope`, ['LoadState', 'ActiveState', 'Result']);
    console.log(`[host crash] sleeps before kill=${before}, processes mentioning the marker afterwards: ${left.length}; ${unit}: ${JSON.stringify(props)}`);
    expect(before).toBe(1);
    expect(left).toEqual([]);
    expect(await unitGone(unit)).toBe(true);
  });

  describe('fails closed', () => {
    it('without bwrap', async () => {
      const r = await runLean({ shadowDir: tmp, argv: ['true'], runId: TEST_RUN_ID, host: { bwrap: '/nonexistent/bwrap' } });
      expect(r.status).toBe('could-not-start');
      expect(r.detail).toMatch(/bwrap not found/);
    });

    it('without a reachable systemd user manager', async () => {
      const r = await runLean({ shadowDir: tmp, argv: ['true'], runId: TEST_RUN_ID, host: { env: { PATH: '/usr/bin:/bin' } } });
      console.log(`[no user manager] ${r.detail ?? ''}`);
      expect(r.status).toBe('could-not-start');
      expect(r.detail).toMatch(/systemd user manager/);
    });

    it('without systemd-run or setpriv', async () => {
      const a = await runLean({ shadowDir: tmp, argv: ['true'], runId: TEST_RUN_ID, host: { systemdRun: '/nonexistent/systemd-run' } });
      const b = await runLean({ shadowDir: tmp, argv: ['true'], runId: TEST_RUN_ID, host: { setpriv: '/nonexistent/setpriv' } });
      expect([a.status, b.status]).toEqual(['could-not-start', 'could-not-start']);
    });

    it('when bwrap cannot set up the sandbox (reported as could-not-start, not failed)', async () => {
      const shadow = await createShadow(SPYRO, path.join(tmp, 'setup-fail'));
      // A tmpfs mount point that does not exist inside the read-only shadow: bwrap cannot create it.
      const r = await runLean({ shadowDir: shadow.dir, argv: ['true'], runId: TEST_RUN_ID, maskPaths: [path.join(shadow.dir, 'no-such-dir')] });
      console.log(`[bwrap setup failure] ${r.status}: ${r.detail ?? ''}`);
      expect(r.status).toBe('could-not-start');
      expect(r.detail).toMatch(/bwrap/);
    });
  });

  it('left ~/.elan/known-projects untouched', () => {
    const after = knownProjectsLines();
    console.log(`[known-projects] before=${String(knownBefore)} after=${String(after)}`);
    expect(after).toBe(knownBefore);
  });
});
