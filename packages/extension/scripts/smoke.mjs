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
//
// Options:
//   --snap            run both instances in the user's snap VS Code (/snap/code/current, through the snap's
//                     electron-launch with the SNAP_* variables of `snap run`; scripts/snap-env.mjs) instead of the
//                     downloaded 1.140.0 build: `npm run test:smoke:snap`. The snap's per-user folders (SNAP_USER_DATA,
//                     SNAP_USER_COMMON) are made inside the isolated HOME, and the real ~/snap/code/<rev> and
//                     ~/snap/code/common are watched like ~/.config/Code. Run it from a terminal of the snap VS Code to
//                     also get the snap's AppArmor label and cgroup (the run reports which it had).
//   --snap-root=DIR   another snap mount than /snap/code/current (e.g. /snap/code/267, an older revision)
//   --label=NAME      only one of the two instances (smoke or e2e)
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { cp, lstat, mkdir, mkdtemp, readdir, readFile, readlink, symlink, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { homedir, tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_SNAP_ROOT, findSnap } from './snap-env.mjs';
import { collectOwners, leftoverAction, unitOwner } from './smoke-units.mjs';

const extensionDir = fileURLToPath(new URL('..', import.meta.url));
const repo = path.resolve(extensionDir, '..', '..');
const realHome = homedir();

const argv = process.argv.slice(2);
const optionValue = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const unknown = argv.filter((a) => a !== '--snap' && !/^--(snap-root|label)=./.test(a));
if (unknown.length) {
  console.error(`[smoke] unknown option(s): ${unknown.join(' ')} (known: --snap, --snap-root=DIR, --label=smoke|e2e)`);
  process.exit(2);
}
const label = optionValue('label');
if (label !== undefined && !['smoke', 'e2e'].includes(label)) {
  console.error(`[smoke] --label must be smoke or e2e, not ${label}`);
  process.exit(2);
}
/** @type {import('./snap-env.mjs').SnapInstall | undefined} */
let snap;
if (argv.includes('--snap') || optionValue('snap-root') !== undefined) {
  const found = findSnap(optionValue('snap-root') ?? DEFAULT_SNAP_ROOT);
  if (!found.ok) {
    console.error(`[smoke] --snap: ${found.reason}`);
    process.exit(2);
  }
  snap = found.snap;
}

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
// Snap mode: the snap's per-user folders (SNAP_USER_DATA, SNAP_USER_COMMON) in the isolated HOME, as `snap run` makes them.
if (snap) {
  for (const sub of [snap.revision, 'common']) await mkdir(path.join(dir, 'home', 'snap', snap.name, sub), { recursive: true });
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
  // VS Code's argv.json and extensions live in ~/.vscode ($HOME, so the instance's are in the isolated HOME).
  { label: '~/.vscode (top level)', root: path.join(realHome, '.vscode'), depth: 1 },
  // Snap mode: electron-launch writes its caches into SNAP_USER_DATA / SNAP_USER_COMMON (the isolated HOME's).
  ...(snap
    ? [
        { label: `~/snap/${snap.name} (top level)`, root: path.join(realHome, 'snap', snap.name), depth: 1 },
        // Also their times: electron-launch rewrites files there (.last_revision, caches) and chmods .config.
        { label: `~/snap/${snap.name}/${snap.revision}`, root: path.join(realHome, 'snap', snap.name, snap.revision), depth: 3, times: true },
        { label: `~/snap/${snap.name}/common`, root: path.join(realHome, 'snap', snap.name, 'common'), depth: 3, times: true },
      ]
    : []),
];
const snapshot = async () => Object.fromEntries(await Promise.all(WATCHED.map(async (w) => [w.label, await listTree(w.root, w.depth)])));

/** `path -> mtime/ctime` of the watched roots with `times` (and the roots themselves), to see writes that add no name. */
async function timesOf() {
  const result = {};
  for (const w of WATCHED.filter((entry) => entry.times)) {
    const times = {};
    for (const rel of ['', ...((await listTree(w.root, w.depth)) ?? [])]) {
      const stat = await lstat(path.join(w.root, rel)).catch(() => undefined);
      if (stat) times[rel || '.'] = `mtime ${stat.mtime.toISOString()} ctime ${stat.ctime.toISOString()}`;
    }
    result[w.label] = times;
  }
  return result;
}

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

/** Chromium's named shared-memory files of this user in /dev/shm (normally unlinked as soon as they are opened). */
const SHM_DIR = '/dev/shm';
async function chromiumShm() {
  const names = await readdir(SHM_DIR).catch(() => []);
  return names.filter((name) => name.startsWith('.org.chromium.Chromium.')).map((name) => path.join(SHM_DIR, name));
}

const before = await snapshot();
const timesBefore = await timesOf();
const shmBefore = new Set(await chromiumShm());
const unitsBefore = new Set(telelean_units());
const startedAt = Date.now();

/** This process's AppArmor label and cgroup: the test instances inherit both (see scripts/snap-env.mjs). */
const readProc = (file) => {
  try {
    return readFileSync(file, 'utf8').replace(/\0/g, '').trim();
  } catch {
    return 'unknown';
  }
};
const confinement = { apparmor: readProc('/proc/self/attr/current'), cgroup: readProc('/proc/self/cgroup').replace(/^0::/, '') };

console.log(`[smoke] profile and workspace: ${dir}`);
console.log(`[smoke] sample model copied from ${sampleSource}`);
console.log(`[smoke] VS Code: ${snap ? `the snap ${snap.dir} (VS Code ${snap.version}, snap version ${snap.snapVersion}) through its electron-launch` : 'the 1.140.0 test build in .vscode-test/'}`);
console.log(`[smoke] AppArmor label ${confinement.apparmor}; cgroup ${confinement.cgroup}`);
// With kernel.apparmor_restrict_unprivileged_userns=1 (Ubuntu 24.04), an unconfined bwrap cannot set up its user
// namespace ("setting up uid map: Permission denied"), so every Lean check of the instances would fail; the snap VS
// Code's processes run as snap.code.code (complain), which allows it.
const usernsRestricted = readProc('/proc/sys/kernel/apparmor_restrict_unprivileged_userns') === '1';
if (usernsRestricted && confinement.apparmor === 'unconfined') {
  console.log(
    '[smoke] WARNING: this process is unconfined and the kernel restricts unprivileged user namespaces (apparmor_restrict_unprivileged_userns=1): bwrap, hence every Lean check, will fail. Run this from a terminal of the snap VS Code, whose processes run as snap.code.code (complain).',
  );
} else if (snap && !confinement.apparmor.startsWith(`snap.${snap.name}.`)) {
  console.log(`[smoke] note: this is not the snap's AppArmor label (snap.${snap.name}.${snap.name}): run from a terminal of the snap VS Code to test under it too`);
}

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
  // Snap mode: the snap .vscode-test.mjs starts the instances in (scripts/snap-env.mjs).
  TELELEAN_VSCODE_SNAP: snap ? JSON.stringify(snap) : undefined,
};
const vscodeTest = `ulimit -c 0; env -u ELECTRON_RUN_AS_NODE xvfb-run -a npx vscode-test${label ? ` --label ${label}` : ''}`;
const exitCode = await new Promise((resolve) => {
  const child = spawn('sh', ['-c', vscodeTest], { cwd: extensionDir, env, stdio: 'inherit' });
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
const timesAfter = await timesOf();
for (const [label, was] of Object.entries(timesBefore)) {
  const now = timesAfter[label] ?? {};
  const changed = Object.keys(was).filter((rel) => rel in now && now[rel] !== was[rel]);
  for (const rel of changed) failures.push(`${label}: ${rel} was written during the run (${was[rel]} -> ${now[rel]})`);
  if (!changed.length) notes.push(`${label}: no entry written (times of ${Object.keys(was).length} entries unchanged)`);
}

// 6b'. What the extension host saw (test/suite/hostEnv.test.ts writes it; names only, plus non-secret values).
const hostEnvFile = path.join(dir, 'host-env.json');
if (existsSync(hostEnvFile)) {
  try {
    const hostEnv = JSON.parse(await readFile(hostEnvFile, 'utf8'));
    notes.push(
      `the extension host ran ${hostEnv.execPath} (VS Code ${hostEnv.vscodeVersion}, Electron ${hostEnv.electron}), AppArmor ${hostEnv.apparmor}; snap variables it had: ${hostEnv.snapLeaks.join(' ') || 'none'}`,
    );
  } catch (error) {
    warnings.push(`${hostEnvFile} is not readable: ${error.message}`);
  }
} else if (snap && label !== 'e2e') {
  failures.push(`${hostEnvFile} is missing: the host environment suite did not run in the snap`);
}
notes.push(`the run's AppArmor label ${confinement.apparmor}, cgroup ${confinement.cgroup}`);

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
// A test instance killed at shutdown can leave a Chromium shared-memory file in /dev/shm (seen once with the snap's
// VS Code 1.145.2). One created during the run that no process has open or mapped is garbage: removed, with a warning.
const shmNew = [];
for (const file of await chromiumShm()) {
  if (shmBefore.has(file)) continue;
  const stat = await lstat(file).catch(() => undefined);
  if (stat && stat.isFile() && stat.uid === process.getuid() && stat.mtimeMs >= startedAt) shmNew.push({ file, size: stat.size });
}
if (shmNew.length) {
  const inUse = new Set();
  for (const pid of await readdir('/proc').catch(() => [])) {
    if (!/^\d+$/.test(pid)) continue;
    const maps = await readFile(`/proc/${pid}/maps`, 'utf8').catch(() => '');
    const fds = await readdir(`/proc/${pid}/fd`).catch(() => []);
    const links = await Promise.all(fds.map((fd) => readlink(`/proc/${pid}/fd/${fd}`).catch(() => '')));
    for (const { file } of shmNew) if (maps.includes(file) || links.some((link) => link.startsWith(file))) inUse.add(file);
  }
  for (const { file, size } of shmNew) {
    if (inUse.has(file)) {
      notes.push(`${file} appeared during the run but a live process uses it (not this run's)`);
      continue;
    }
    const removed = spawnSync('rm', ['-f', '--', file]).status === 0;
    warnings.push(`${file} (${size} bytes), a Chromium shared-memory file no process uses, was left in ${SHM_DIR} during the run${removed ? ': removed' : ' and could not be removed'}`);
  }
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

const summary = {
  dir,
  sampleSource,
  vscode: snap ? { snap: snap.dir, version: snap.version, snapVersion: snap.snapVersion } : { version: '1.140.0', build: '.vscode-test/' },
  confinement,
  exitCode,
  durationMs: Date.now() - startedAt,
  failures,
  warnings,
  notes,
};
await writeFile(path.join(dir, 'smoke-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log('\n[smoke] isolation checks:');
for (const note of notes) console.log(`  ok    ${note}`);
for (const warning of warnings) console.log(`  WARN  ${warning}`);
for (const failure of failures) console.log(`  FAIL  ${failure}`);
console.log(
  `[smoke] vscode-test exit code ${exitCode}; ${failures.length} isolation failure(s), ${warnings.length} warning(s); summary in ${path.join(dir, 'smoke-summary.json')}`,
);
process.exit(exitCode !== 0 || failures.length > 0 ? 1 : 0);
