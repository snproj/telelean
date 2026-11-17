// @vscode/test-cli configuration for the in-VS-Code smoke tests (docs/m1-plan.md section 10).
// Run from packages/extension with `npm run test:smoke`: scripts/smoke.mjs prepares an isolated profile under
// $TELELEAN_TEST_TMP/vscode-<pid>/ (home, XDG dirs, user-data, extensions, a workspace with copies of the sample
// model), points TELELEAN_SMOKE_DIR at it, and runs
//   sh -c 'ulimit -c 0; env -u ELECTRON_RUN_AS_NODE xvfb-run -a npx vscode-test'
// The VS Code 1.140.0 test build in ./.vscode-test/ is reused (never re-downloaded or modified). Because
// --user-data-dir and --extensions-dir are passed here, @vscode/test-electron does not add its own
// ./.vscode-test/user-data defaults, and HOME/XDG_* point into the scratch profile, so nothing reaches the user's real
// home folder (~/.config/Code, ~/.copilot, ~/.config/google-chrome, ...).
//
// Snap mode (`npm run test:smoke:snap`, scripts/smoke.mjs --snap): both instances run the user's own snap VS Code
// (/snap/code/<rev>, its version instead of 1.140.0) through the snap's electron-launch with the SNAP_* variables of
// `snap run` (scripts/snap-env.mjs), so the extension host gets the snap's environment (SNAP*, GTK_*, GDK_*, LOCPATH,
// XDG_DATA_DIRS, ...) as in the user's window. scripts/smoke.mjs passes the snap it found in TELELEAN_VSCODE_SNAP.
import { defineConfig } from '@vscode/test-cli';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { snapLaunch, snapTestEnv } from './scripts/snap-env.mjs';

const dir = process.env.TELELEAN_SMOKE_DIR;
// e2e.test.ts drives the board webview over the DevTools protocol: Chromium serves it on this loopback port
// (127.0.0.1 only), in the e2e configuration's own test instance only, so every other suite runs in an instance
// without a debugging endpoint, as a normal VS Code does.
const cdpPort = process.env.TELELEAN_CDP_PORT;
if (!dir) {
  throw new Error(
    'TELELEAN_SMOKE_DIR is not set. Run the smoke tests with `npm run test:smoke` (scripts/smoke.mjs prepares the isolated VS Code profile); refusing to start VS Code with a real profile.',
  );
}

// This shell may run inside the user's (snap) VS Code: drop its IPC hooks and Electron/Wayland settings so the
// test instance is a fresh, separate X11 window inside xvfb. DBUS_SESSION_BUS_ADDRESS and XDG_RUNTIME_DIR are kept:
// runLean's `systemd-run --user` needs them.
// Run by Claude Code (the M2 builders and fixers are), the shell also holds that session's variables (CLAUDECODE,
// CLAUDE_CODE_SESSION_ID, its messaging socket and token, CLAUDE_CONFIG_DIR, AI_AGENT, MCP_*): the user's VS Code has
// none of them, so neither does the test instance.
const inherited = Object.fromEntries(
  Object.keys(process.env)
    .filter((name) => /^(VSCODE_|ELECTRON_|CLAUDE|MCP_)/.test(name) || name === 'AI_AGENT')
    .map((name) => [name, undefined]),
);

// Snap mode: the launcher and the snap's environment layer (computed from this process's environment, so a run from a
// terminal of the snap VS Code and one from a plain terminal start the instance alike).
const snap = process.env.TELELEAN_VSCODE_SNAP ? JSON.parse(process.env.TELELEAN_VSCODE_SNAP) : undefined;
const snapEnv = snap ? snapTestEnv(process.env, snap, { home: join(dir, 'home'), uid: process.getuid(), euid: process.geteuid() }) : undefined;
const launch = snap ? snapLaunch(snap) : undefined;

const common = {
  ...(launch ? { version: snap.version, useInstallation: { fromPath: launch.executable } } : { version: '1.140.0' }),
  workspaceFolder: join(dir, 'ws'),
  // TELELEAN_SMOKE_GREP runs only the matching suites/tests (development aid; `npm run test:smoke` runs everything).
  mocha: { ui: 'tdd', timeout: 60_000, color: false, ...(process.env.TELELEAN_SMOKE_GREP ? { grep: process.env.TELELEAN_SMOKE_GREP } : {}) },
  launchArgs: [
    // Snap mode: electron-launch's first argument is the Electron binary it execs (see scripts/snap-env.mjs).
    ...(launch ? launch.prefixArgs : []),
    `--user-data-dir=${join(dir, 'user-data')}`,
    `--extensions-dir=${join(dir, 'extensions')}`,
    '--disable-extensions',
    '--disable-telemetry',
    '--disable-workspace-trust',
    '--disable-crash-reporter',
    '--disable-gpu',
    '--password-store=basic',
    '--ozone-platform=x11',
  ],
  env: {
    ...inherited,
    // Snap mode: the caller's snap layer removed, then the SNAP_* variables of `snap run` and the CLI's VSCODE_CLI=1,
    // ELECTRON_NO_ATTACH_CONSOLE=1 (electron-launch adds its own variables when it starts the instance).
    ...(snapEnv ? Object.fromEntries(snapEnv.unset.map((name) => [name, undefined])) : {}),
    ...(snapEnv ? snapEnv.set : {}),
    TELELEAN_VSCODE_SNAP: process.env.TELELEAN_VSCODE_SNAP,
    WAYLAND_DISPLAY: undefined,
    XDG_SESSION_TYPE: 'x11',
    HOME: join(dir, 'home'),
    XDG_CONFIG_HOME: join(dir, 'xdg-config'),
    XDG_CACHE_HOME: join(dir, 'xdg-cache'),
    XDG_DATA_HOME: join(dir, 'xdg-data'),
    // Lean's toolchains are only read (runLean calls the pinned toolchain's binaries directly).
    ELAN_HOME: process.env.ELAN_HOME ?? join(homedir(), '.elan'),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CEILING_DIRECTORIES: process.env.TELELEAN_TEST_TMP ?? dir,
    GIT_TERMINAL_PROMPT: '0',
    LEAN_NUM_THREADS: '4',
    TELELEAN_SMOKE_DIR: dir,
    TELELEAN_TEST_TMP: process.env.TELELEAN_TEST_TMP ?? dir,
    TELELEAN_E2E_ROOT: process.env.TELELEAN_E2E_ROOT,
    TELELEAN_RUNS_ROOT: process.env.TELELEAN_RUNS_ROOT,
    TELELEAN_RUNS_E2E_ROOT: process.env.TELELEAN_RUNS_E2E_ROOT,
    TELELEAN_CDP_PORT: cdpPort,
    // M2 quota tripwire (docs/m2-plan.md section 10.4): the runner refuses to resolve or spawn a real Claude Code
    // under it. (The extension in Test mode never builds the real backend either: only testing.useRunBackend
    // supplies one, the FakeBackend.)
    TELELEAN_NO_REAL_CLAUDE: '1',
  },
};

// Two test instances, one after the other (`npx vscode-test` runs both; `--label smoke|e2e` runs one).
export default defineConfig([
  {
    ...common,
    label: 'smoke',
    // The activation suite runs first (it checks that the opted-in workspace activated the extension by itself); the
    // other suites follow in glob order (each starts from a clean slate). The end-to-end suites (e2e*.test.js) have
    // their own instance.
    files: ['out/test/suite/activation.test.js', 'out/test/suite/!(e2e*).test.js'],
  },
  {
    ...common,
    label: 'e2e',
    // M1's end-to-end suite, then M2's (e2e-runs.test.js: "These suffice" through the board UI, FakeBackend).
    files: ['out/test/suite/e2e.test.js', 'out/test/suite/e2e-runs.test.js'],
    launchArgs: [...common.launchArgs, ...(cdpPort ? [`--remote-debugging-port=${cdpPort}`] : [])],
  },
]);
