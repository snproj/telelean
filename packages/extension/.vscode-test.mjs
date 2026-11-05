// @vscode/test-cli configuration for the in-VS-Code smoke tests (docs/m1-plan.md section 10).
// Run from packages/extension with `npm run test:smoke`: scripts/smoke.mjs prepares an isolated profile under
// $TELELEAN_TEST_TMP/vscode-<pid>/ (home, XDG dirs, user-data, extensions, a workspace with copies of the sample
// model), points TELELEAN_SMOKE_DIR at it, and runs
//   sh -c 'ulimit -c 0; env -u ELECTRON_RUN_AS_NODE xvfb-run -a npx vscode-test'
// The VS Code 1.140.0 test build in ./.vscode-test/ is reused (never re-downloaded or modified). Because
// --user-data-dir and --extensions-dir are passed here, @vscode/test-electron does not add its own
// ./.vscode-test/user-data defaults, and HOME/XDG_* point into the scratch profile, so nothing reaches the user's real
// home folder (~/.config/Code, ~/.copilot, ~/.config/google-chrome, ...).
import { defineConfig } from '@vscode/test-cli';
import { homedir } from 'node:os';
import { join } from 'node:path';

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
const inherited = Object.fromEntries(
  Object.keys(process.env)
    .filter((name) => name.startsWith('VSCODE_') || name.startsWith('ELECTRON_'))
    .map((name) => [name, undefined]),
);

const common = {
  version: '1.140.0',
  workspaceFolder: join(dir, 'ws'),
  // TELELEAN_SMOKE_GREP runs only the matching suites/tests (development aid; `npm run test:smoke` runs everything).
  mocha: { ui: 'tdd', timeout: 60_000, color: false, ...(process.env.TELELEAN_SMOKE_GREP ? { grep: process.env.TELELEAN_SMOKE_GREP } : {}) },
  launchArgs: [
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
