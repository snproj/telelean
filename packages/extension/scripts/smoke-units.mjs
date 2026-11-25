// Which leftover telelean-* systemd units belong to a smoke run (scripts/smoke.mjs, check 6c), as plain helpers that
// the unit tests call too (test/unit/smokeUnits.test.ts).
//
// runLean runs every Lean process in a transient scope named telelean-<run id>-<n>.scope
// (packages/runner/src/lean/runLean.ts). The run ids a smoke run produces are
//   tlws<pid>_<w>_<k>  refresh <k> of the <w>-th ModelWorkspace in the extension host <pid> (runner workspace/modelWorkspace.ts)
//   p<pid>             runLean's default run id, in the process <pid>
//   <run id>           a Claude run's checks (runner gate/engine.ts), e.g. rmvy6qjztb18158
// The test instance writes its logs into the smoke run's own user-data dir (<user-data>/logs/<session>/...), and they
// name its extension hosts ("Started local extension host with pid N." in renderer.log, "Extension host with pid N
// started" in exthost.log, "Extension host with pid N exited ..." in main.log) and, in the extension's own log, its
// Claude runs ("runId":"…"). A run also has a directory in its model folder, <model>/.telelean/runs/<run id>/ (2k2;
// until then <user-data>/User/globalStorage/telelean.telelean/runs/<root key>/<run id>/), unless a test deleted it.
//
// A unit named after one of these is this smoke run's even when no process is left in it. That is how a scope used to
// be left behind: when runLean SIGKILLed systemd-run while systemd-run was still waiting for its scope to be created (a
// workspace disposed, or a run cancelled, a few milliseconds after the spawn), systemd 255 moved the dying process
// into the new cgroup (the kernel skips an exiting task without reporting an error), started the scope, and waited for
// an "empty" event that never came, because the cgroup never had a process. The scope then stayed "active running"
// with no process in it; `systemctl kill` cannot end it, `systemctl stop` does. Since M2's closing round 1 runLean
// waits for the scope to exist before it kills, and stops a scope still there after its run; this check stays as the
// safety net that would notice a regression.
import { readdir, readFile } from 'node:fs/promises';
import * as path from 'node:path';

/** telelean-<run id>-<n>.scope (runLean's naming). */
export const SCOPE_UNIT = /^telelean-([A-Za-z0-9_]{1,64})-(\d+)\.scope$/;
const REFRESH_RUN_ID = /^tlws(\d+)_\d+_\d+$/;
const DEFAULT_RUN_ID = /^p(\d+)$/;
const RUN_ID = /^[A-Za-z0-9_]{1,64}$/;
const HOST_PID = /\b[Ee]xtension host with pid (\d+)\b/g;
const LOGGED_RUN_ID = /"runId":"([A-Za-z0-9_]{1,64})"/g;

/**
 * The extension host pids and Claude run ids named in the text of one of the instance's logs.
 * @param {string} text
 * @returns {{ hostPids: number[], runIds: string[] }}
 */
export function idsInLog(text) {
  return {
    hostPids: [...text.matchAll(HOST_PID)].map((m) => Number(m[1])),
    runIds: [...text.matchAll(LOGGED_RUN_ID)].map((m) => m[1]),
  };
}

/**
 * This smoke run's extension host pids and Claude run ids, from the test instance's user-data dir: every `*.log`
 * under <user-data>/logs (down to 5 levels), and (2k2) the run directories in the runs folder of each model folder the
 * run used (<model>/.telelean/runs/<run id>/).
 * @param {string} userData the smoke run's <profile>/user-data
 * @param {readonly string[]} [modelRoots] the model folders of the smoke run
 * @returns {Promise<{ hostPids: Set<number>, runIds: Set<string> }>}
 */
export async function collectOwners(userData, modelRoots = []) {
  const hostPids = new Set();
  const runIds = new Set();
  async function walk(abs, level) {
    let entries;
    try {
      entries = await readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = path.join(abs, entry.name);
      if (entry.isDirectory() && level < 5) await walk(child, level + 1);
      else if (entry.isFile() && entry.name.endsWith('.log')) {
        const ids = idsInLog(await readFile(child, 'utf8').catch(() => ''));
        for (const pid of ids.hostPids) hostPids.add(pid);
        for (const id of ids.runIds) runIds.add(id);
      }
    }
  }
  await walk(path.join(userData, 'logs'), 1);
  for (const root of modelRoots) {
    for (const run of await readdir(path.join(root, '.telelean', 'runs'), { withFileTypes: true }).catch(() => [])) {
      if (run.isDirectory() && RUN_ID.test(run.name)) runIds.add(run.name);
    }
  }
  return { hostPids, runIds };
}

/**
 * Why `unit` is this smoke run's, judged by its name alone (a phrase for the report), or undefined.
 * @param {string} unit e.g. telelean-tlws1979697_2_1-23.scope
 * @param {{ hostPids: ReadonlySet<number>, runIds: ReadonlySet<string> }} owners from {@link collectOwners}
 * @returns {string | undefined}
 */
export function unitOwner(unit, owners) {
  const match = SCOPE_UNIT.exec(unit);
  if (!match) return undefined;
  const runId = match[1];
  const pidMatch = REFRESH_RUN_ID.exec(runId) ?? DEFAULT_RUN_ID.exec(runId);
  if (pidMatch) {
    const pid = Number(pidMatch[1]);
    return owners.hostPids.has(pid) ? `run id ${runId}, from extension host ${pid} of this run` : undefined;
  }
  return owners.runIds.has(runId) ? `run id ${runId}, a Claude run of this run` : undefined;
}

/**
 * What the smoke run does with a telelean-* unit that appeared while it ran:
 *   'fail'  it runs something of this run (a process with the run's profile in its cwd or command line, or any process
 *           in a unit named after this run): stop it, and the check fails
 *   'stop'  it is named after this run but no process is left in it: stop it unless systemd ends it by itself, and warn
 *   'keep'  it is not this run's (another builder's): leave it alone, and note it
 * @param {{ ownProcess: boolean, owner: string | undefined, populated: boolean }} unit
 * @returns {'fail' | 'stop' | 'keep'}
 */
export function leftoverAction({ ownProcess, owner, populated }) {
  if (ownProcess || (owner !== undefined && populated)) return 'fail';
  if (owner !== undefined) return 'stop';
  return 'keep';
}
