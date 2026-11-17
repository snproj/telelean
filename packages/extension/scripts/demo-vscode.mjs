// The VS Code side of the demo driver (scripts/demo-driver.mjs; docs/DEMO.md): the instance's isolated profile, its
// environment and arguments, the launch (the downloaded 1.140.0 test build, another Electron binary, or the user's own
// VS Code snap through its electron-launch, as scripts/snap-env.mjs does it for the smoke tests), headless under
// xvfb-run unless --show, and what the instance leaves behind: its processes (found by the run's unique folder in their
// command line or working directory), telelean-* systemd scopes named after it (scripts/smoke-units.mjs) and changes
// under the real home folder (listings before and after; the driver cannot tell who caused a change, it reports them).
//
// Not a script to run: scripts/demo-driver.mjs imports it.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, openSync, readdirSync, readFileSync, readlinkSync, statSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectOwners, leftoverAction, unitOwner } from './smoke-units.mjs';

/** packages/extension (the extension under development: `--extensionDevelopmentPath`). */
export const EXTENSION_DIR = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const REPO = path.resolve(EXTENSION_DIR, '..', '..');
/** The VS Code test build @vscode/test-electron downloaded for the smoke tests (reused, never modified). */
export const TEST_BUILD = path.join(EXTENSION_DIR, '.vscode-test', 'vscode-linux-x64-1.140.0', 'code');
export const EXTENSION_ID = 'telelean.telelean';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------------------------------------------
// The profile

/**
 * The run's folders under `work`: the instance's own HOME, XDG dirs, user-data and extensions dirs, and the folder for
 * screenshots. The model folder itself is made by the driver (it must be fresh and empty).
 * @param {string} work absolute path of the run's work dir
 */
export async function makeProfile(work) {
  const base = path.join(work, 'profile');
  const profile = {
    work,
    home: path.join(base, 'home'),
    xdgConfig: path.join(base, 'xdg-config'),
    xdgCache: path.join(base, 'xdg-cache'),
    xdgData: path.join(base, 'xdg-data'),
    userData: path.join(base, 'user-data'),
    extensions: path.join(base, 'extensions'),
    screenshots: path.join(work, 'screenshots'),
    log: path.join(work, 'vscode.log'),
  };
  for (const dir of [profile.home, profile.xdgConfig, profile.xdgCache, profile.xdgData, path.join(profile.userData, 'User'), profile.extensions, profile.screenshots]) {
    await mkdir(dir, { recursive: true });
  }
  return profile;
}

/**
 * The instance's user settings (its own user-data dir, never the user's): AI features, telemetry, updates, experiments,
 * workspace trust and git off as in scripts/smoke.mjs; dialogs drawn by VS Code itself (`window.dialogStyle: custom`,
 * so the driver can click the git and consent questions in the page); no restored windows, no hot exit.
 * @param {{ userData: string }} profile
 * @param {Record<string, unknown>} extra e.g. telelean.model / telelean.effort
 */
export async function writeUserSettings(profile, extra = {}) {
  const settings = {
    'chat.disableAIFeatures': true,
    'telemetry.telemetryLevel': 'off',
    'update.mode': 'none',
    'extensions.autoUpdate': false,
    'extensions.autoCheckUpdates': false,
    'extensions.ignoreRecommendations': true,
    'workbench.enableExperiments': false,
    'workbench.startupEditor': 'none',
    'workbench.tips.enabled': false,
    'security.workspace.trust.enabled': false,
    'git.enabled': false,
    'git.autoRepositoryDetection': false,
    'window.dialogStyle': 'custom',
    'window.restoreWindows': 'none',
    'window.newWindowDimensions': 'maximized',
    'files.hotExit': 'off',
    ...extra,
  };
  const file = path.join(profile.userData, 'User', 'settings.json');
  await writeFile(file, `${JSON.stringify(settings, null, 2)}\n`);
  return file;
}

/** `<user-data>/User/globalStorage/telelean.telelean/runs`: the RunManager's run directories (run.json, transcript). */
export function runsDirOf(profile) {
  return path.join(profile.userData, 'User', 'globalStorage', EXTENSION_ID, 'runs');
}

/** The extension's own log files ("telelean" output channel) under the instance's logs. */
export async function extensionLogs(profile) {
  const found = [];
  async function walk(dir, level) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = path.join(dir, entry.name);
      if (entry.isDirectory() && level < 6) await walk(child, level + 1);
      else if (entry.isFile() && /telelean/i.test(entry.name) && entry.name.endsWith('.log')) found.push(child);
    }
  }
  await walk(path.join(profile.userData, 'logs'), 1);
  return found.sort();
}

// ---------------------------------------------------------------------------------------------------------------
// The environment and the arguments

/** Kept although they start with CLAUDE: the user's own choices that reach Claude Code (as the runner keeps them). */
const CLAUDE_KEEP = ['CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC'];
/** What electron-launch of a snap VS Code exports (scripts/snap-env.mjs); never wanted by the test build. */
const SNAP_LAYER = [
  'GTK_PATH',
  'GTK_EXE_PREFIX',
  'GTK_IM_MODULE_FILE',
  'GDK_BACKEND',
  'GDK_PIXBUF_MODULE_FILE',
  'GDK_PIXBUF_MODULEDIR',
  'GIO_MODULE_DIR',
  'GSETTINGS_SCHEMA_DIR',
  'LOCPATH',
  'FONTCONFIG_PATH',
  'FONTCONFIG_FILE',
];

/**
 * The instance's environment, from `base` (the driver's own): this shell may run inside the user's (snap) VS Code or
 * inside a Claude Code session, so their IPC hooks, Electron switches, Wayland display and Claude Code session
 * variables are dropped, and a snap layer is undone (originals of XDG_DATA_DIRS / XDG_CONFIG_DIRS restored). Then the
 * instance gets its own XDG dirs, HOME (the isolated one unless `realHome`), the Lean toolchains of the real ~/.elan
 * (only read), git without global or system config and never above the work dir, LEAN_NUM_THREADS=4, and the quota
 * tripwire TELELEAN_NO_REAL_CLAUDE=1 unless `live`. DBUS_SESSION_BUS_ADDRESS and XDG_RUNTIME_DIR are kept: the Lean
 * sandbox's `systemd-run --user` needs them.
 * @param {Readonly<Record<string, string | undefined>>} base
 * @param {{ profile: Awaited<ReturnType<typeof makeProfile>>, realHome: boolean, live: boolean, extra?: Record<string, string> }} options
 */
export function instanceEnv(base, { profile, realHome, live, extra = {} }) {
  /** @type {Record<string, string>} */
  const env = {};
  for (const [name, value] of Object.entries(base)) {
    if (value === undefined) continue;
    if (name.startsWith('VSCODE_') || name.startsWith('ELECTRON_')) continue;
    if (name === 'WAYLAND_DISPLAY') continue;
    if (name.startsWith('ANTHROPIC_')) continue;
    if (name.startsWith('CLAUDE') && !CLAUDE_KEEP.includes(name)) continue;
    if (name.startsWith('SNAP') || name.endsWith('_VSCODE_SNAP_ORIG') || SNAP_LAYER.includes(name)) continue;
    if (name === 'TELELEAN_NO_REAL_CLAUDE' || name === 'TELELEAN_DEMO_LIVE') continue;
    env[name] = value;
  }
  for (const name of ['XDG_DATA_DIRS', 'XDG_CONFIG_DIRS']) {
    const original = base[`${name}_VSCODE_SNAP_ORIG`];
    if (original === undefined) continue;
    if (original === '') delete env[name];
    else env[name] = original;
  }
  const home = os.homedir();
  Object.assign(env, {
    XDG_SESSION_TYPE: 'x11',
    HOME: realHome ? home : profile.home,
    XDG_CONFIG_HOME: profile.xdgConfig,
    XDG_CACHE_HOME: profile.xdgCache,
    XDG_DATA_HOME: profile.xdgData,
    ELAN_HOME: base.ELAN_HOME ?? path.join(home, '.elan'),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CEILING_DIRECTORIES: profile.work,
    GIT_TERMINAL_PROMPT: '0',
    LEAN_NUM_THREADS: '4',
  });
  if (!live) env.TELELEAN_NO_REAL_CLAUDE = '1';
  Object.assign(env, extra);
  return env;
}

/**
 * VS Code's arguments: the extension under development (Test mode when `testsPath` is given: the dry run's agent),
 * the isolated profile, no telemetry, trust prompt, crash reporter or GPU, the DevTools endpoint on a loopback port
 * (Chromium binds it to 127.0.0.1) for the driver, and the fresh model folder as the window's workspace folder.
 * No `--disable-extensions`: the extensions dir is empty anyway, and the flag only adds a sticky toast over the board.
 */
export function instanceArgs({ profile, folder, cdpPort, testsPath }) {
  return [
    `--extensionDevelopmentPath=${EXTENSION_DIR}`,
    ...(testsPath ? [`--extensionTestsPath=${testsPath}`] : []),
    `--user-data-dir=${profile.userData}`,
    `--extensions-dir=${profile.extensions}`,
    '--disable-telemetry',
    '--disable-workspace-trust',
    '--disable-crash-reporter',
    '--disable-gpu',
    '--password-store=basic',
    '--ozone-platform=x11',
    '--skip-welcome',
    '--skip-release-notes',
    '--new-window',
    `--remote-debugging-port=${cdpPort}`,
    folder,
  ];
}

/** A free TCP port on the loopback interface (the instance's DevTools endpoint). */
export function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = /** @type {net.AddressInfo} */ (server.address());
      server.close(() => resolve(port));
    });
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Which VS Code

/**
 * The VS Code to start: `test-build` (default), `snap` (or any path under /snap/: the installed VS Code snap, started
 * through its electron-launch with the variables of `snap run`, scripts/snap-env.mjs), or the path of a VS Code
 * Electron binary (not the `code` CLI script, which detaches VS Code).
 * @param {string | undefined} choice
 */
export async function resolveVscode(choice) {
  if (choice === undefined || choice === 'test-build') {
    if (!existsSync(TEST_BUILD)) return { ok: false, reason: `the VS Code test build ${TEST_BUILD} is missing (npm run test:smoke downloads it); or pass --vscode snap` };
    return { ok: true, kind: 'test-build', binary: TEST_BUILD, version: readVersion(path.join(path.dirname(TEST_BUILD), 'resources', 'app', 'package.json')) };
  }
  if (choice === 'snap' || choice.startsWith('/snap/')) {
    let snapEnv;
    try {
      snapEnv = await import('./snap-env.mjs');
    } catch (error) {
      return { ok: false, reason: `scripts/snap-env.mjs could not be loaded: ${error.message}` };
    }
    const found = snapEnv.findSnap();
    if (!found.ok) return { ok: false, reason: found.reason };
    return { ok: true, kind: 'snap', binary: found.snap.electron, version: found.snap.version, snap: found.snap, snapEnv };
  }
  const binary = path.resolve(choice);
  if (!existsSync(binary)) return { ok: false, reason: `${binary} does not exist` };
  const head = readFileSync(binary).subarray(0, 4);
  if (!(head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46)) {
    return { ok: false, reason: `${binary} is not an executable binary (a script such as the \`code\` CLI detaches VS Code): pass the Electron binary, e.g. <VS Code>/code, or --vscode snap` };
  }
  return { ok: true, kind: 'binary', binary, version: readVersion(path.join(path.dirname(binary), 'resources', 'app', 'package.json')) };
}

function readVersion(packageJson) {
  try {
    return String(JSON.parse(readFileSync(packageJson, 'utf8')).version);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Launch and shutdown

/**
 * Starts the instance in its own process group: `sh -c 'ulimit -c 0; exec …'` (no core dumps), under
 * `xvfb-run -a` (a private X display of `screen`) unless `show`. Output goes to `profile.log`.
 * @returns {{ child: import('node:child_process').ChildProcess, command: string[], exited: Promise<number | null> }}
 */
export function launchInstance({ vscode, args, env, show, screen, profile }) {
  let command = [vscode.binary, ...args];
  if (vscode.kind === 'snap') {
    const launch = vscode.snapEnv.snapLaunch(vscode.snap);
    command = [launch.executable, ...launch.prefixArgs, ...args];
  }
  const wrapped = show ? command : ['xvfb-run', '-a', '-s', `-screen 0 ${screen}x24 -nolisten tcp`, ...command];
  const out = openSync(profile.log, 'a');
  const child = spawn('sh', ['-c', 'ulimit -c 0; exec "$@"', 'sh', ...wrapped], { env, stdio: ['ignore', out, out], detached: true });
  const exited = new Promise((resolve) => {
    child.once('exit', (code) => resolve(code));
    child.once('error', () => resolve(null));
  });
  return { child, command: wrapped, exited };
}

/** The environment for a snap launch: the instance env plus the snap layer of `snap run` (scripts/snap-env.mjs). */
export function withSnapLayer(env, base, vscode, profile) {
  if (vscode.kind !== 'snap') return env;
  // SNAP_USER_DATA / SNAP_USER_COMMON go into the isolated home, so electron-launch's caches never land in ~/snap/code.
  const layer = vscode.snapEnv.snapTestEnv(base, vscode.snap, { home: profile.home, uid: process.getuid(), euid: process.geteuid() });
  const out = { ...env };
  for (const name of layer.unset) delete out[name];
  return { ...out, ...layer.set };
}

/** The driver itself and its ancestors (never signalled, even though a --work-dir argument names the marker). */
function selfAndAncestors() {
  const pids = new Set([process.pid]);
  let pid = process.ppid;
  for (let i = 0; i < 64 && pid > 1; i++) {
    pids.add(pid);
    try {
      const status = readFileSync(`/proc/${pid}/status`, 'utf8');
      pid = Number(/^PPid:\s+(\d+)/m.exec(status)?.[1] ?? 0);
    } catch {
      break;
    }
  }
  return pids;
}

/**
 * Processes of this user whose command line or working directory contains `marker` (the run's work dir), except the
 * driver and its ancestors.
 * @returns {Array<{ pid: number, cmd: string }>}
 */
export function processesOf(marker) {
  const uid = process.getuid();
  const skip = selfAndAncestors();
  const out = [];
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    const pid = Number(name);
    if (skip.has(pid)) continue;
    try {
      if (statSync(`/proc/${pid}`).uid !== uid) continue;
      const cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').join(' ').trim();
      let cwd = '';
      try {
        cwd = readlinkSync(`/proc/${pid}/cwd`);
      } catch {
        // gone, or not readable
      }
      if (cmd.includes(marker) || cwd === marker || cwd.startsWith(`${marker}${path.sep}`)) out.push({ pid, cmd });
    } catch {
      // the process ended meanwhile
    }
  }
  return out;
}

/** VS Code's main process among `procs` (the Electron process without `--type=`). */
function mainProcess(procs, userData) {
  return procs.find((p) => p.cmd.includes(`--user-data-dir=${userData}`) && !p.cmd.includes('--type=') && !/^(\/bin\/)?sh |xvfb-run|electron-launch/.test(p.cmd));
}

function signal(pid, sig) {
  try {
    process.kill(pid, sig);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ends the instance and everything it started: SIGTERM to VS Code's main process (it closes its windows and extension
 * host, so telelean's deactivate runs), then the process group of the launch (xvfb-run and its Xvfb), then SIGKILL for
 * whatever of this run is still there after `graceMs`. Returns what had to be killed.
 */
export async function stopInstance({ launched, profile, graceMs = 20_000, log = () => {} }) {
  const killed = [];
  const main = mainProcess(processesOf(profile.work), profile.userData);
  if (main) {
    log(`closing VS Code (pid ${main.pid})`);
    signal(main.pid, 'SIGTERM');
  }
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline && mainProcess(processesOf(profile.work), profile.userData)) await sleep(250);
  // xvfb-run ends Xvfb once VS Code has exited; give the group a moment, then signal it.
  await Promise.race([launched.exited, sleep(5_000)]);
  if (launched.child.exitCode === null && launched.child.pid) {
    signal(-launched.child.pid, 'SIGTERM');
    await Promise.race([launched.exited, sleep(5_000)]);
  }
  for (const p of processesOf(profile.work)) {
    if (signal(p.pid, 'SIGKILL')) killed.push(`${p.pid} ${p.cmd.slice(0, 160)}`);
  }
  if (launched.child.exitCode === null && launched.child.pid) signal(-launched.child.pid, 'SIGKILL');
  return killed;
}

// ---------------------------------------------------------------------------------------------------------------
// systemd scopes (runLean's telelean-<run id>-<n>.scope units)

export function teleleanUnits() {
  const result = spawnSync('systemctl', ['--user', 'list-units', '--all', '--plain', '--no-legend', '--no-pager', 'telelean-*'], { encoding: 'utf8' });
  return (result.stdout ?? '')
    .split('\n')
    .map((line) => line.trim().split(/\s+/)[0])
    .filter((name) => name && name.startsWith('telelean-'));
}

function unitState(unit) {
  const show = spawnSync('systemctl', ['--user', 'show', unit, '-p', 'LoadState', '-p', 'ActiveState', '-p', 'ControlGroup'], { encoding: 'utf8' });
  /** @type {Record<string, string>} */
  const props = {};
  for (const line of (show.stdout ?? '').split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) props[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return props;
}

/**
 * The telelean-* units that appeared during the run and are still loaded: the ones that are this run's (a process of
 * the run in them, or named after its extension hosts or Claude runs) are stopped; others (another session's) are only
 * reported.
 */
export async function settleUnits({ before, profile }) {
  const notes = [];
  const owners = await collectOwners(profile.userData);
  for (const unit of teleleanUnits()) {
    if (before.has(unit)) continue;
    const state = unitState(unit);
    if (state.LoadState === 'not-found' || state.ActiveState === 'inactive') continue;
    const cgroup = state.ControlGroup ? path.join('/sys/fs/cgroup', state.ControlGroup) : undefined;
    const procs = cgroup ? (await readFile(path.join(cgroup, 'cgroup.procs'), 'utf8').catch(() => '')).split('\n').filter(Boolean) : [];
    let ownProcess = false;
    for (const pid of procs) {
      let cwd = '';
      try {
        cwd = readlinkSync(`/proc/${pid}/cwd`);
      } catch {
        // gone
      }
      const cmd = await readFile(`/proc/${pid}/cmdline`, 'utf8').catch(() => '');
      if (cwd.startsWith(profile.work) || cmd.includes(profile.work)) ownProcess = true;
    }
    const owner = unitOwner(unit, owners);
    const action = leftoverAction({ ownProcess, owner, populated: procs.length > 0 });
    if (action === 'keep') {
      notes.push(`unit ${unit} appeared meanwhile but is not this run's (left alone)`);
      continue;
    }
    spawnSync('systemctl', ['--user', 'stop', unit], { stdio: 'ignore' });
    spawnSync('systemctl', ['--user', 'reset-failed', unit], { stdio: 'ignore' });
    notes.push(`unit ${unit} of this run was still loaded (${state.ActiveState}, ${procs.length} process(es)): stopped`);
  }
  return notes;
}

// ---------------------------------------------------------------------------------------------------------------
// The real home folder

/** Sorted relative paths under `root` down to `depth` levels (directories end with "/"); null when it is missing. */
function listTree(root, depth) {
  if (!existsSync(root)) return null;
  const out = [];
  function walk(abs, rel, level) {
    let entries;
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      out.push(entry.isDirectory() ? `${childRel}/` : childRel);
      if (entry.isDirectory() && level < depth) walk(path.join(abs, entry.name), childRel, level + 1);
    }
  }
  walk(root, '', 1);
  return out.sort();
}

function lineCount(file) {
  try {
    return readFileSync(file, 'utf8').split('\n').filter(Boolean).length;
  } catch {
    return null;
  }
}

/** Listings of the places under the real home that a VS Code instance or a run could write to. */
export function homeSnapshot() {
  const home = os.homedir();
  const watched = {
    '~/.config/Code': listTree(path.join(home, '.config', 'Code'), 1),
    '~/.vscode': listTree(path.join(home, '.vscode'), 2),
    '~/.copilot': listTree(path.join(home, '.copilot'), 2),
    '~/.config/google-chrome': listTree(path.join(home, '.config', 'google-chrome'), 1),
    '~/.local/share/Trash/files': listTree(path.join(home, '.local', 'share', 'Trash', 'files'), 1),
    '~/snap/code': listTree(path.join(home, 'snap', 'code'), 2),
    '~/.pki': listTree(path.join(home, '.pki'), 3),
    '~/.cache': listTree(path.join(home, '.cache'), 1),
    '~/.claude/projects': listTree(path.join(home, '.claude', 'projects'), 1),
  };
  return { watched, elanKnownProjects: lineCount(path.join(home, '.elan', 'known-projects')) };
}

/** What changed between two snapshots (entries added or removed; the user's VS Code and other sessions run meanwhile). */
export function homeChanges(before, after) {
  const changes = [];
  for (const [label, was] of Object.entries(before.watched)) {
    const now = after.watched[label];
    if (was === null && now === null) continue;
    if (was === null || now === null) {
      changes.push(`${label} ${was === null ? 'appeared' : 'disappeared'}`);
      continue;
    }
    const added = now.filter((p) => !was.includes(p));
    const removed = was.filter((p) => !now.includes(p));
    if (added.length) changes.push(`${label}: added ${added.slice(0, 10).join(', ')}${added.length > 10 ? ` (+${added.length - 10} more)` : ''}`);
    if (removed.length) changes.push(`${label}: removed ${removed.slice(0, 10).join(', ')}${removed.length > 10 ? ` (+${removed.length - 10} more)` : ''}`);
  }
  if (before.elanKnownProjects !== after.elanKnownProjects) changes.push(`~/.elan/known-projects: ${before.elanKnownProjects} -> ${after.elanKnownProjects} lines`);
  return changes;
}
