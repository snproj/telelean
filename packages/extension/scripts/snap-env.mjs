// The user's VS Code is a snap (/snap/bin/code, classic confinement). `npm run test:smoke:snap` (scripts/smoke.mjs
// --snap) runs the in-VS-Code suites in THAT VS Code instead of the downloaded 1.140.0 test build, started the way the
// snap starts it, so the extension host sees the same environment as in the user's own window:
//
//   snap run code     sets SNAP, SNAP_NAME, SNAP_REVISION, SNAP_USER_DATA (~/snap/code/<rev>), SNAP_USER_COMMON, ... and
//                     runs the snap's command `electron-launch $SNAP/usr/share/code/bin/code --no-sandbox`
//   electron-launch   (the snap's own script) exports GTK_PATH, GTK_EXE_PREFIX, GTK_IM_MODULE_FILE, GDK_PIXBUF_*,
//                     GIO_MODULE_DIR, GSETTINGS_SCHEMA_DIR, LOCPATH, FONTCONFIG_*, SNAP_LAUNCHER_ARCH_TRIPLET, prepends
//                     the snap's folders to XDG_DATA_DIRS / XDG_CONFIG_DIRS (keeping the originals in
//                     <NAME>_VSCODE_SNAP_ORIG), fills caches under SNAP_USER_DATA / SNAP_USER_COMMON, and execs its
//                     arguments with --ozone-platform=x11
//   bin/code (CLI)    sets VSCODE_CLI=1 and ELECTRON_NO_ATTACH_CONSOLE=1, drops ELECTRON_RUN_AS_NODE and spawns the
//                     Electron binary detached (the desktop file adds --force-user-env)
//
// The test instance keeps the first two steps exactly (the real electron-launch of the installed revision, with the
// SNAP_* variables `snap run` sets) and replaces the CLI step by its effect on the environment and arguments: the CLI
// detaches VS Code, so @vscode/test-electron would never see the tests' exit code. SNAP_USER_DATA and SNAP_USER_COMMON
// point into the test profile's isolated HOME, so electron-launch writes its caches there and never under the real
// ~/snap/code. Running `snap run` itself is avoided: it would always use the real ~/snap/code/<rev> (snapd takes the
// home folder from the password database, not from $HOME).
//
// The AppArmor label and the cgroup are not set here: a process started from a terminal of the snap VS Code (or by
// Claude Code inside it) already runs as `snap.code.code (complain)` in a snap.code.code-*.scope, and its children
// inherit both. That label matters on this machine: with kernel.apparmor_restrict_unprivileged_userns=1, an unconfined
// bwrap cannot set up its user namespace ("setting up uid map: Permission denied"), while under the snap's
// complain-mode profile it can. scripts/smoke.mjs reports the label the run had.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import * as path from 'node:path';

/** Where snapd mounts the current revision of the VS Code snap. */
export const DEFAULT_SNAP_ROOT = '/snap/code/current';

/**
 * Variables electron-launch (re)computes on every start. They are removed from the test instance's environment before
 * electron-launch runs, so a run from inside the snap VS Code (whose environment already holds the user's values,
 * pointing into the real ~/snap/code) gets the same fresh values as a run from a plain terminal.
 */
export const ELECTRON_LAUNCH_VARIABLES = [
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

/** Lists electron-launch prepends to; the originals are kept in <NAME>_VSCODE_SNAP_ORIG. */
const RESTORED_LISTS = ['XDG_DATA_DIRS', 'XDG_CONFIG_DIRS'];

/** Never copied into the test instance: snapctl's cookie for the user's own snap session (a credential). */
const SNAPCTL_COOKIE = ['SNAP_COOKIE', 'SNAP_CONTEXT'];

/** A placeholder for SNAP_COOKIE / SNAP_CONTEXT: the names exist as in the snap, nothing can use the value. */
export const PLACEHOLDER_COOKIE = 'telelean-snap-test-placeholder';

const SNAP_ARCH = { x64: 'amd64', arm64: 'arm64', arm: 'armhf', ia32: 'i386', ppc64: 'ppc64el', s390x: 's390x', riscv64: 'riscv64' };

/**
 * @typedef {object} SnapInstall
 * @property {string} dir         the revision's folder, e.g. /snap/code/278 (what `snap run` puts in $SNAP)
 * @property {string} name        the snap's name (code)
 * @property {string} revision    e.g. 278
 * @property {string} snapVersion the snap's version string (meta/snap.yaml), e.g. c4453f8e
 * @property {string} version     VS Code's version, e.g. 1.145.2
 * @property {string} launcher    <dir>/electron-launch
 * @property {string} electron    <dir>/usr/share/code/code (VS Code's Electron binary; process.execPath in the snap)
 * @property {string | undefined} commonId the app's common-id (SNAP_APP_COMMON_ID), e.g. code.desktop
 */

/** The value of a top-level `key: value` line of a snap.yaml (enough for name and version). */
function yamlScalar(text, key) {
  const match = new RegExp(`^${key}:[ \\t]*(.+?)[ \\t]*$`, 'm').exec(text);
  return match?.[1]?.replace(/^(['"])(.*)\1$/, '$2');
}

/**
 * The installed VS Code snap, or a reason it cannot be used.
 * @param {string} [snapRoot] default /snap/code/current
 * @returns {{ ok: true, snap: SnapInstall } | { ok: false, reason: string }}
 */
export function findSnap(snapRoot = DEFAULT_SNAP_ROOT) {
  let dir;
  try {
    dir = realpathSync(snapRoot);
  } catch {
    return { ok: false, reason: `${snapRoot} does not exist: is VS Code installed as a snap (snap install code --classic)?` };
  }
  const snapYaml = path.join(dir, 'meta', 'snap.yaml');
  const launcher = path.join(dir, 'electron-launch');
  const electron = path.join(dir, 'usr', 'share', 'code', 'code');
  const packageJson = path.join(dir, 'usr', 'share', 'code', 'resources', 'app', 'package.json');
  for (const file of [snapYaml, launcher, electron, packageJson]) {
    if (!existsSync(file)) return { ok: false, reason: `${file} is missing: not a VS Code snap this script knows` };
  }
  const yaml = readFileSync(snapYaml, 'utf8');
  const name = yamlScalar(yaml, 'name') ?? 'code';
  const snapVersion = yamlScalar(yaml, 'version') ?? '';
  const commonId = /^[ \t]+common-id:[ \t]*(\S+)/m.exec(yaml)?.[1];
  if (yamlScalar(yaml, 'confinement') !== 'classic') return { ok: false, reason: `${snapYaml}: the snap is not classic, telelean only knows the classic VS Code snap` };
  const version = JSON.parse(readFileSync(packageJson, 'utf8')).version;
  return {
    ok: true,
    snap: { dir, name, revision: path.basename(dir), snapVersion, version: String(version), launcher, electron, commonId },
  };
}

/**
 * The SNAP_* variables `snap run` sets for a classic snap's app (snapd 2.77: HOME and XDG_RUNTIME_DIR stay as they
 * are for classic snaps), with the per-user folders under `home`.
 * @param {SnapInstall} snap
 * @param {{ home: string, uid: number, euid: number, arch?: string, app?: string }} user
 * @returns {Record<string, string>}
 */
export function snapRunEnv(snap, user) {
  const app = user.app ?? snap.name;
  const arch = user.arch ?? SNAP_ARCH[process.arch] ?? process.arch;
  return {
    SNAP: snap.dir,
    SNAP_NAME: snap.name,
    SNAP_INSTANCE_NAME: snap.name,
    SNAP_APP_NAME: app,
    ...(snap.commonId ? { SNAP_APP_COMMON_ID: snap.commonId } : {}),
    SNAP_APP_DESKTOP_FILE: `/var/lib/snapd/desktop/applications/${snap.name}_${app}.desktop`,
    SNAP_REVISION: snap.revision,
    SNAP_VERSION: snap.snapVersion,
    SNAP_ARCH: arch,
    SNAP_LIBRARY_PATH: '/var/lib/snapd/lib/gl:/var/lib/snapd/lib/gl32',
    SNAP_DATA: `/var/snap/${snap.name}/${snap.revision}`,
    SNAP_COMMON: `/var/snap/${snap.name}/common`,
    SNAP_USER_DATA: path.join(user.home, 'snap', snap.name, snap.revision),
    SNAP_USER_COMMON: path.join(user.home, 'snap', snap.name, 'common'),
    SNAP_REAL_HOME: user.home,
    SNAP_UID: String(user.uid),
    SNAP_EUID: String(user.euid),
    SNAP_COOKIE: PLACEHOLDER_COOKIE,
    SNAP_CONTEXT: PLACEHOLDER_COOKIE,
  };
}

/**
 * How the test instance's environment differs from `base` (the environment the test runner was started with, possibly
 * from inside the snap VS Code): every SNAP* variable and <NAME>_VSCODE_SNAP_ORIG copy of `base` is removed, as are the
 * variables electron-launch sets itself; XDG_DATA_DIRS and XDG_CONFIG_DIRS go back to their originals when `base`
 * holds them; then come the SNAP_* variables of `snap run` and what VS Code's CLI sets (VSCODE_CLI,
 * ELECTRON_NO_ATTACH_CONSOLE).
 * @param {Readonly<Record<string, string | undefined>>} base
 * @param {SnapInstall} snap
 * @param {{ home: string, uid: number, euid: number, arch?: string }} user
 * @returns {{ unset: string[], set: Record<string, string> }}
 */
export function snapTestEnv(base, snap, user) {
  const unset = new Set(ELECTRON_LAUNCH_VARIABLES);
  for (const name of Object.keys(base)) {
    if (name.startsWith('SNAP') || name.endsWith('_VSCODE_SNAP_ORIG') || SNAPCTL_COOKIE.includes(name)) unset.add(name);
  }
  /** @type {Record<string, string>} */
  const set = {};
  for (const name of RESTORED_LISTS) {
    const original = base[`${name}_VSCODE_SNAP_ORIG`];
    if (original === undefined) continue;
    if (original === '') unset.add(name);
    else set[name] = original;
  }
  Object.assign(set, snapRunEnv(snap, user), { VSCODE_CLI: '1', ELECTRON_NO_ATTACH_CONSOLE: '1' });
  for (const name of Object.keys(set)) unset.delete(name);
  return { unset: [...unset].sort(), set };
}

/**
 * The launch of one test instance through the snap: @vscode/test-electron spawns `launcher` (electron-launch) with
 * `[electron, ...prefixArgs, ...its own arguments]`, and electron-launch execs them with --ozone-platform=x11, as it
 * execs the CLI for the user. --force-user-env is what the snap's desktop file passes.
 * @param {SnapInstall} snap
 */
export function snapLaunch(snap) {
  return { executable: snap.launcher, prefixArgs: [snap.electron, '--force-user-env'] };
}

/**
 * Names (never values) of the variables in `env` that a snap VS Code leaks into its extension host and its children,
 * for reports.
 * @param {Readonly<Record<string, string | undefined>>} env
 */
export function snapLeakNames(env) {
  return Object.keys(env)
    .filter(
      (name) =>
        name.startsWith('SNAP') ||
        name.endsWith('_VSCODE_SNAP_ORIG') ||
        ELECTRON_LAUNCH_VARIABLES.includes(name) ||
        name.startsWith('ELECTRON_') ||
        name.startsWith('GTK_') ||
        name.startsWith('GDK_') ||
        name.startsWith('GIO_'),
    )
    .sort();
}
