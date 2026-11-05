/**
 * The smoke run's leftover-unit check (scripts/smoke-units.mjs, used by scripts/smoke.mjs check 6c): a telelean-* scope
 * is the smoke run's when its name carries a run id of the run's extension hosts (named in the test instance's own
 * logs) or of its Claude runs, even when no process is left in it (the empty "active running" scope a refresh leaves
 * when it is aborted a few milliseconds after runLean spawned systemd-run); this run's units are stopped, and only one
 * that still runs something fails the check; other builders' units are left alone.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// @ts-expect-error -- plain .mjs helpers shared with scripts/smoke.mjs (no type declarations)
import { collectOwners, idsInLog, leftoverAction, unitOwner } from '../../scripts/smoke-units.mjs';

interface Owners {
  hostPids: Set<number>;
  runIds: Set<string>;
}
const ownerOf = unitOwner as (unit: string, owners: Owners) => string | undefined;
const collect = collectOwners as (userData: string) => Promise<Owners>;
const ids = idsInLog as (text: string) => { hostPids: number[]; runIds: string[] };
const action = leftoverAction as (unit: { ownProcess: boolean; owner: string | undefined; populated: boolean }) => 'fail' | 'stop' | 'keep';

let scratch: string;

beforeAll(async () => {
  scratch = await mkdtemp(path.join(process.env.TELELEAN_TEST_TMP ?? tmpdir(), 'tl-smoke-units-'));
});

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe('the run ids a smoke run owns', () => {
  it('reads the extension host pids and Claude run ids from the lines VS Code and the extension log', () => {
    const text = [
      '2026-11-02 02:50:13.559 [info] Started local extension host with pid 1979697.',
      '2026-11-02 02:50:13.922 [info] Extension host with pid 1979697 started',
      '2026-11-02 02:52:42.824 [info] Extension host with pid 1982112 exited with code: 0, signal: unknown.',
      '2026-11-02 02:50:48.479 [error] (node:1982112) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized',
      '2026-11-02 02:50:29.041 [info] [webview->host] cancelRun {"runId":"rmvy6qixdf968cd","requestId":"run-cancel"}',
      '2026-11-02 02:50:29.301 [info] [host->webview] run: delivered {"run":{"runId":"rmvy6qjztb18158","subject":"Spyro"}}',
    ].join('\n');
    expect(ids(text)).toEqual({ hostPids: [1979697, 1979697, 1982112], runIds: ['rmvy6qixdf968cd', 'rmvy6qjztb18158'] });
    expect(ids('no pids here; pid 42 alone is not an extension host')).toEqual({ hostPids: [], runIds: [] });
  });

  it("collects them from the instance's user-data dir: its logs at any depth and its run directories", async () => {
    const userData = path.join(scratch, 'user-data');
    const session = path.join(userData, 'logs', '20261102T025012');
    await mkdir(path.join(session, 'window1', 'exthost', 'telelean.telelean'), { recursive: true });
    await writeFile(path.join(session, 'main.log'), '[info] Extension host with pid 111 exited with code: 0, signal: unknown.\n');
    await writeFile(path.join(session, 'window1', 'renderer.log'), '[info] Started local extension host with pid 111.\n');
    await writeFile(path.join(session, 'window1', 'exthost', 'exthost.log'), '[info] Extension host with pid 222 started\n');
    await writeFile(path.join(session, 'window1', 'exthost', 'telelean.telelean', 'telelean.log'), '[info] run: delivered {"run":{"runId":"rlogged1"}}\n');
    await writeFile(path.join(session, 'window1', 'exthost', 'notes.txt'), 'Extension host with pid 333 started (not a .log file)\n');
    const runs = path.join(userData, 'User', 'globalStorage', 'telelean.telelean', 'runs');
    await mkdir(path.join(runs, 'runs_model-dd89ba1b', 'rdir1'), { recursive: true });
    await mkdir(path.join(runs, 'runs_model-dd89ba1b', 'not a run id'), { recursive: true });
    await writeFile(path.join(runs, 'runs_model-dd89ba1b', 'rfile'), 'a file, not a run directory\n');
    const owners = await collect(userData);
    expect([...owners.hostPids].sort()).toEqual([111, 222]);
    expect([...owners.runIds].sort()).toEqual(['rdir1', 'rlogged1']);
    // A profile without logs or runs owns nothing (and reading it does not throw).
    const empty = await collect(path.join(scratch, 'missing-user-data'));
    expect(empty.hostPids.size + empty.runIds.size).toBe(0);
  });
});

describe('which telelean-* units are the smoke run’s', () => {
  const owners: Owners = { hostPids: new Set([1979697, 1982112]), runIds: new Set(['rmvy6qjztb18158']) };

  it("claims the refresh scopes and default-run scopes of this run's extension hosts, and its Claude runs' scopes", () => {
    // The scope the verifier found left behind: refresh 1 of the 2nd workspace of extension host 1979697, unit 23.
    expect(ownerOf('telelean-tlws1979697_2_1-23.scope', owners)).toBe('run id tlws1979697_2_1, from extension host 1979697 of this run');
    expect(ownerOf('telelean-tlws1982112_14_3-140.scope', owners)).toContain('extension host 1982112');
    expect(ownerOf('telelean-p1979697-5.scope', owners)).toBe('run id p1979697, from extension host 1979697 of this run');
    expect(ownerOf('telelean-rmvy6qjztb18158-21.scope', owners)).toBe('run id rmvy6qjztb18158, a Claude run of this run');
  });

  it('leaves every other unit to whoever made it', () => {
    for (const unit of [
      'telelean-tlws4242_1_1-3.scope', // another process's workspace
      'telelean-tlws197969_2_1-23.scope', // a prefix of a host pid is not that pid
      'telelean-tlws19796971_2_1-23.scope',
      'telelean-p4242-1.scope', // another process's default run id
      'telelean-rsomeoneelse1-4.scope', // a run that is not this run's
      'telelean-tlws1979697_2_1.scope', // no unit counter: not runLean's naming
      'telelean-tlws1979697_2_1-23.service',
      'telelean-tlws1979697-23.scope', // not a refresh run id
      'other-tlws1979697_2_1-23.scope',
    ]) {
      expect(ownerOf(unit, owners), unit).toBeUndefined();
    }
  });

  it('fails on a unit of this run that still runs a process, stops an empty one, and keeps the rest', () => {
    const owner = 'run id tlws1979697_2_1, from extension host 1979697 of this run';
    expect(action({ ownProcess: true, owner: undefined, populated: true })).toBe('fail');
    expect(action({ ownProcess: false, owner, populated: true })).toBe('fail');
    expect(action({ ownProcess: true, owner, populated: true })).toBe('fail');
    // The leftover from the report: active running, no task, cgroup.events "populated 0".
    expect(action({ ownProcess: false, owner, populated: false })).toBe('stop');
    expect(action({ ownProcess: false, owner: undefined, populated: false })).toBe('keep');
    expect(action({ ownProcess: false, owner: undefined, populated: true })).toBe('keep');
  });
});
