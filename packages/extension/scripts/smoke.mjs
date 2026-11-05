// npm run test:smoke: the in-VS-Code smoke tests in an isolated profile (docs/m1-plan.md section 10).
//
// 1. Makes $TELELEAN_TEST_TMP/vscode-<pid>/{home,xdg-config,xdg-cache,xdg-data,user-data,extensions,ws} (a fresh
//    mkdtemp under the OS temp dir when TELELEAN_TEST_TMP is unset; never anything under the real $HOME).
// 2. Fills ws/ with copies: mental_model (the sample model), second_model (a second root), plain_folder (Lean
//    files, no .telelean: must never get a workspace) and empty_folder (for Initialize). mental_model/ itself is
//    only read (never built, never a git repository: the tests build and git-init the copies). Two more pristine
//    copies live outside the workspace folder: e2e/e2e_model (the end-to-end suite), runs/runs_model (M2's run
//    suite, runs.test.ts) and runs-e2e/runs_e2e_model (M2's end-to-end run suite, e2e-runs.test.ts): FakeBackend
//    runs, never real Claude (TELELEAN_NO_REAL_CLAUDE=1).
// 3. Writes the instance's user settings: AI features, telemetry, updates, experiments and workspace trust off.
// 4. Records listings of the real ~/.copilot, ~/.config/Code and ~/.config/google-chrome.
// 5. Runs `sh -c 'ulimit -c 0; env -u ELECTRON_RUN_AS_NODE xvfb-run -a npx vscode-test'` (.vscode-test.mjs reads the
//    profile from TELELEAN_SMOKE_DIR): two test instances one after the other, "smoke" (every suite but the end-to-end
//    ones) and "e2e" (e2e.test.ts then e2e-runs.test.ts, with the DevTools endpoint on a free loopback port and their
//    own model copies).
// 6. Checks: the isolated user-data dir received the instance's files; the real listings did not change; no process
//    of this run is left (killed and reported if one is) and no telelean-* systemd unit of this run is left. A unit is
//    this run's when a process in it has the run's profile in its cwd or command line, or when its name carries a run
//    id of this run's extension hosts or Claude runs (scripts/smoke-units.mjs reads them from the instance's logs and
//    run directories). Every unit of this run is stopped: one that still runs a process fails the check; one with no
//    process left (systemd missed that its scope emptied, see smoke-units.mjs) is reported as a warning. Units of
//    other processes (another builder's) are only noted.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readdir, readFile, readlink, symlink, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { homedir, tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectOwners, leftoverAction, unitOwner } from './smoke-units.mjs';

const extensionDir = fileURLToPath(new URL('..', import.meta.url));
const repo = path.resolve(extensionDir, '..', '..');
const realHome = homedir();

const base = process.env.TELELEAN_TEST_TMP ? path.resolve(process.env.TELELEAN_TEST_TMP) : await mkdtemp(path.join(tmpdir(), 'telelean-smoke-'));
if (base === realHome || base.startsWith(`${realHome}${path.sep}`)) {
  console.error(`[smoke] refusing to put the test profile under the real home folder (${base}); set TELELEAN_TEST_TMP to a scratch dir outside it`);
  process.exit(2);
}
const dir = path.join(base, `vscode-${process.pid}`);
const ws = path.join(dir, 'ws');
for (const sub of ['home', 'xdg-config', 'xdg-cache', 'xdg-data', 'user-data/User', 'extensions', 'ws']) {
  await mkdir(path.join(dir, sub), { recursive: true });
}

// ---------------------------------------------------------------------------------------------------------------
// 2. The workspace

const skipped = (from, src, names) => path.relative(from, src).split(path.sep).some((segment) => names.includes(segment));

/** Copies the sample model (mental_model/) to `dest`, without any build output or repository; returns its source. */
async function copySample(dest) {
  const sample = path.join(repo, 'mental_model');
  if (!existsSync(path.join(sample, '.telelean', 'config.json'))) {
    console.error(`[smoke] the sample model ${sample} has no .telelean/config.json: it is broken, refusing to test a stand-in`);
    process.exit(2);
  }
  await cp(sample, dest, { recursive: true, filter: (src) => !skipped(sample, src, ['.lake', '.git', 'graph.json']) });
  return 'mental_model';
}

const sampleSource = await copySample(path.join(ws, 'mental_model'));
await copySample(path.join(ws, 'second_model'));
// The end-to-end suite's own pristine copy, outside the workspace folder (the other suites never see it).
const e2eRoot = path.join(dir, 'e2e', 'e2e_model');
await copySample(e2eRoot);
// M2: the run suite's own pristine copy (its goal must still be a GOAL; model.test.ts changes ws/mental_model).
const runsRoot = path.join(dir, 'runs', 'runs_model');
await copySample(runsRoot);
// M2: the end-to-end run suite's own pristine copy (e2e-runs.test.ts, in the e2e instance).
const runsE2eRoot = path.join(dir, 'runs-e2e', 'runs_e2e_model');
await copySample(runsE2eRoot);
// A link inside a model root that points outside it: "Open in editor" must refuse it.
await mkdir(path.join(ws, 'plain_folder'), { recursive: true });
await writeFile(path.join(ws, 'plain_folder', 'Plain.lean'), '-- a Lean file in a folder that never opted in\ntheorem plain : True := trivial\n');
await symlink(path.join('..', 'plain_folder', 'Plain.lean'), path.join(ws, 'second_model', 'escape.lean'));
await mkdir(path.join(ws, 'empty_folder'), { recursive: true });

// 3. The instance's user settings (its own user-data dir, never the user's).
await writeFile(
  path.join(dir, 'user-data', 'User', 'settings.json'),
  `${JSON.stringify(
    {
      'chat.disableAIFeatures': true,
      'telemetry.telemetryLevel': 'off',
      'update.mode': 'none',
      'extensions.autoUpdate': false,
      'extensions.autoCheckUpdates': false,
      'workbench.enableExperiments': false,
      'security.workspace.trust.enabled': false,
      'workbench.startupEditor': 'none',
      'git.enabled': false,
      'git.autoRepositoryDetection': false,
    },
    null,
    2,
  )}\n`,
);

// ---------------------------------------------------------------------------------------------------------------
// 4. Real-home listings

/** Sorted relative paths under `root` down to `depth` levels (directories end with "/"); null when it is missing. */
async function listTree(root, depth) {
  if (!existsSync(root)) return null;
  const out = [];
  async function walk(abs, rel, level) {
    let entries;
    try {
      entries = await readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      out.push(entry.isDirectory() ? `${childRel}/` : childRel);
      if (entry.isDirectory() && level < depth) await walk(path.join(abs, entry.name), childRel, level + 1);
    }
  }
  await walk(root, '', 1);
  return out.sort();
}

const WATCHED = [
  { label: '~/.copilot', root: path.join(realHome, '.copilot'), depth: 4 },
  { label: '~/.config/Code (top level)', root: path.join(realHome, '.config', 'Code'), depth: 1 },
  { label: '~/.config/Code/logs', root: path.join(realHome, '.config', 'Code', 'logs'), depth: 1 },
  { label: '~/.config/google-chrome (top level)', root: path.join(realHome, '.config', 'google-chrome'), depth: 1 },
  { label: '~/.config/google-chrome/Crash Reports', root: path.join(realHome, '.config', 'google-chrome', 'Crash Reports'), depth: 3 },
  // WorkspaceEdit deletions go to the trash (files.enableTrash): the instance's must land in its own XDG data dir.
  { label: '~/.local/share/Trash/files', root: path.join(realHome, '.local', 'share', 'Trash', 'files'), depth: 1 },
];
const snapshot = async () => Object.fromEntries(await Promise.all(WATCHED.map(async (w) => [w.label, await listTree(w.root, w.depth)])));

function telelean_units() {
  const result = spawnSync('systemctl', ['--user', 'list-units', '--all', '--plain', '--no-legend', '--no-pager', 'telelean-*'], { encoding: 'utf8' });
  return (result.stdout ?? '')
    .split('\n')
    .map((line) => line.trim().split(/\s+/)[0])
    .filter((name) => name && name.startsWith('telelean-'));
}

/** A free TCP port on the loopback interface (for the test instance's DevTools endpoint, used by e2e.test.ts). */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}
const cdpPort = await freePort();

const before = await snapshot();
const unitsBefore = new Set(telelean_units());
const startedAt = Date.now();

console.log(`[smoke] profile and workspace: ${dir}`);
console.log(`[smoke] sample model copied from ${sampleSource}`);

// ---------------------------------------------------------------------------------------------------------------
// 5. Run VS Code

const env = {
  ...process.env,
  TELELEAN_SMOKE_DIR: dir,
  TELELEAN_TEST_TMP: base,
  TELELEAN_E2E_ROOT: e2eRoot,
  TELELEAN_RUNS_ROOT: runsRoot,
  TELELEAN_RUNS_E2E_ROOT: runsE2eRoot,
  TELELEAN_CDP_PORT: String(cdpPort),
  // M2 quota tripwire (also set by .vscode-test.mjs for the test instances): never a real Claude Code.
  TELELEAN_NO_REAL_CLAUDE: '1',
  // npx writes (and prunes) its debug logs in this run's profile instead of the real ~/.npm/_logs. (Do not use
  // logs-max=0 for this: npm then deletes every existing log in its logs dir.)
  npm_config_logs_dir: path.join(dir, 'npm-logs'),
};
const exitCode = await new Promise((resolve) => {
  const child = spawn('sh', ['-c', 'ulimit -c 0; env -u ELECTRON_RUN_AS_NODE xvfb-run -a npx vscode-test'], { cwd: extensionDir, env, stdio: 'inherit' });
  child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  child.on('error', (error) => {
    console.error(`[smoke] could not start the test: ${error.message}`);
    resolve(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 6. Checks

const failures = [];
/** Problems that do not fail the run: things the run cleaned up after itself that should not have been left. */
const warnings = [];
const notes = [];

// 6a. The isolated user-data dir was used (VS Code writes its logs and storage there).
const userData = (await listTree(path.join(dir, 'user-data'), 3)) ?? [];
const written = userData.filter((p) => p !== 'User/' && p !== 'User/settings.json');
if (!userData.some((p) => p.startsWith('logs/')) || written.length < 3) failures.push(`the isolated user-data dir received no files from VS Code: ${JSON.stringify(userData)}`);
else notes.push(`isolated user-data dir used: ${written.length} entries (e.g. ${written.slice(0, 4).join(', ')})`);
const isolatedHome = (await listTree(path.join(dir, 'home'), 2)) ?? [];
notes.push(`isolated HOME afterwards: ${isolatedHome.length ? isolatedHome.join(', ') : '(empty)'}`);

// 6b. The real home folders did not change.
function processAlive(pid) {
  try {
    return existsSync(`/proc/${pid}`);
  } catch {
    return false;
  }
}
async function cmdlineOf(pid) {
  try {
    return (await readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0').join(' ');
  } catch {
    return '';
  }
}
const after = await snapshot();
for (const { label } of WATCHED) {
  const was = before[label];
  const now = after[label];
  if (was === null && now === null) continue;
  if (was === null || now === null) {
    failures.push(`${label} ${was === null ? 'appeared' : 'disappeared'} during the run`);
    continue;
  }
  const added = now.filter((p) => !was.includes(p));
  const removed = was.filter((p) => !now.includes(p));
  for (const entry of added) {
    // ~/.copilot/logs/process-<ms>-<pid>.log: a log of a live process that is not ours belongs to the user's own VS Code.
    const match = /process-\d+-(\d+)\.log$/.exec(entry);
    if (match && processAlive(Number(match[1])) && !(await cmdlineOf(Number(match[1]))).includes(dir)) {
      notes.push(`${label}: new ${entry} belongs to a running process outside this test (pid ${match[1]}, the user's own VS Code)`);
      continue;
    }
    failures.push(`${label}: new entry ${entry}`);
  }
  if (removed.length) notes.push(`${label}: entries removed meanwhile (not by this test, which never writes there): ${removed.join(', ')}`);
  if (!added.length && !removed.length) notes.push(`${label}: unchanged (${now.length} entries)`);
}

// 6c. Nothing of this run is left running.
const leftovers = (spawnSync('pgrep', ['-af', '--', dir], { encoding: 'utf8' }).stdout ?? '')
  .split('\n')
  .filter((line) => line.trim() && !line.includes('pgrep'));
if (leftovers.length) {
  failures.push(`processes of this run were still running (now killed): ${leftovers.join(' | ')}`);
  for (const line of leftovers) {
    const pid = Number(line.trim().split(/\s+/)[0]);
    if (pid > 1) spawnSync('kill', ['-TERM', String(pid)]);
  }
} else {
  notes.push('no process of this run is left');
}
/** `systemctl --user show` properties of a unit (LoadState=not-found once it is gone). */
function unitState(unit) {
  const show = spawnSync('systemctl', ['--user', 'show', unit, '-p', 'LoadState', '-p', 'ActiveState', '-p', 'SubState', '-p', 'ControlGroup'], { encoding: 'utf8' });
  const props = {};
  for (const line of (show.stdout ?? '').split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) props[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return props;
}
const unitGone = (state) => state.LoadState === 'not-found' || state.ActiveState === 'inactive';
/** Stops a unit and unloads it if it failed (a failed transient unit stays loaded until reset-failed). */
function stopUnit(unit) {
  spawnSync('systemctl', ['--user', 'stop', unit], { stdio: 'ignore' });
  spawnSync('systemctl', ['--user', 'reset-failed', unit], { stdio: 'ignore' });
}
const owners = await collectOwners(path.join(dir, 'user-data'));
notes.push(
  `this run's extension hosts (from its logs): ${owners.hostPids.size ? `pids ${[...owners.hostPids].join(', ')}` : 'none found'}; Claude run ids of this run: ${owners.runIds.size}`,
);
/** Units of this run with no process left: stopped below unless systemd ends them by itself meanwhile. */
const emptyOwn = [];
for (const unit of telelean_units()) {
  if (unitsBefore.has(unit)) continue;
  const state = unitState(unit);
  if (unitGone(state)) continue; // it ended between the listing and now
  const cgroupDir = state.ControlGroup ? path.join('/sys/fs/cgroup', state.ControlGroup) : undefined;
  const procs = cgroupDir ? (await readFile(path.join(cgroupDir, 'cgroup.procs'), 'utf8').catch(() => '')).split('\n').filter(Boolean) : [];
  const events = cgroupDir ? await readFile(path.join(cgroupDir, 'cgroup.events'), 'utf8').catch(() => '') : '';
  const populated = procs.length > 0 || /^populated 1$/m.test(events);
  let ownProcess = false;
  for (const pid of procs) {
    const cwd = await readlink(`/proc/${pid}/cwd`).catch(() => '');
    if (cwd.startsWith(dir) || (await cmdlineOf(pid)).includes(dir)) ownProcess = true;
  }
  const owner = unitOwner(unit, owners);
  const what = `${state.ActiveState ?? '?'} ${state.SubState ?? '?'}, ${procs.length} process(es) in its cgroup`;
  const action = leftoverAction({ ownProcess, owner, populated });
  if (action === 'fail') {
    failures.push(`systemd unit ${unit} of this run was still loaded (${what}${owner ? `; ${owner}` : ''}; now stopped)`);
    stopUnit(unit);
  } else if (action === 'stop') {
    emptyOwn.push({ unit, owner, what, activeState: state.ActiveState });
  } else {
    notes.push(`systemd unit ${unit} appeared during the run but is not this run's (${what}; none of this test, and not named after its extension hosts or Claude runs): another builder's?`);
  }
}
// Give systemd a moment to end them by itself (it normally does as soon as a scope's last process exits).
for (let waited = 0; waited < 2000 && emptyOwn.some((u) => !unitGone(unitState(u.unit))); waited += 200) await new Promise((r) => setTimeout(r, 200));
const EMPTY_UNIT_CAUSE = {
  active:
    'systemd never saw its cgroup empty, as when runLean killed systemd-run while the scope was still being created (a dispose or cancel right after the spawn); runLean waits for the scope and stops a leftover since M2 closing round 1, so this is a regression',
  failed: 'runLean resets a failed scope when its run ends, so the process that ran it was gone first',
};
for (const { unit, owner, what, activeState } of emptyOwn) {
  if (unitGone(unitState(unit))) {
    notes.push(`systemd unit ${unit} of this run (${owner}) ended by itself after the run`);
    continue;
  }
  stopUnit(unit);
  const cause = EMPTY_UNIT_CAUSE[activeState] ?? 'it did not end by itself';
  warnings.push(`systemd unit ${unit} of this run (${owner}) was left ${what}, now stopped: ${cause}`);
}

const summary = { dir, sampleSource, exitCode, durationMs: Date.now() - startedAt, failures, warnings, notes };
await writeFile(path.join(dir, 'smoke-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log('\n[smoke] isolation checks:');
for (const note of notes) console.log(`  ok    ${note}`);
for (const warning of warnings) console.log(`  WARN  ${warning}`);
for (const failure of failures) console.log(`  FAIL  ${failure}`);
console.log(
  `[smoke] vscode-test exit code ${exitCode}; ${failures.length} isolation failure(s), ${warnings.length} warning(s); summary in ${path.join(dir, 'smoke-summary.json')}`,
);
process.exit(exitCode !== 0 || failures.length > 0 ? 1 : 0);
