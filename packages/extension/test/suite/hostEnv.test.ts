/**
 * The extension host's environment and the parts of telelean that depend on it, as they run in the VS Code under
 * test: in `npm run test:smoke:snap` that is the user's snap VS Code started through the snap's electron-launch
 * (scripts/snap-env.mjs), whose extension host inherits the snap's variables (SNAP*, GTK_*, GDK_*, GIO_*, LOCPATH,
 * XDG_DATA_DIRS with the snap's folders first, ...).
 *
 *   where           which VS Code and Electron, the AppArmor label and cgroup, which snap variables reached the host;
 *                   written to <profile>/host-env.json (names, and values only of non-secret variables) for
 *                   scripts/smoke.mjs; in snap mode it must be the snap, started by electron-launch
 *   Lean sandbox    lean.checkSandboxSupport(), lean.checkUserNamespaces() (the run preflight's bwrap probe) and a
 *                   sandboxed `lean --version` (systemd-run --user --scope, setpriv, bwrap) from this environment
 *   Claude's env    sanitizeClaudeEnv(process.env), what a real run would give the Claude Code CLI: none of the snap's
 *                   variables and no path into the snap is left, XDG_DATA_DIRS / XDG_CONFIG_DIRS are the originals
 *   the hook        the PreToolUse path guard (dist/bin/telelean-path-guard.mjs) answers its self-test under the hook
 *                   runtime the extension would choose here, and under the Electron-as-Node fallback (the snap's own
 *                   binary with ELECTRON_RUN_AS_NODE=1), with Claude's environment. No Claude Code is involved.
 */
import * as assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

import { checkSandboxSupport, checkUserNamespaces, runLean } from '@telelean/runner/lean/runLean.js';
import { resolveToolchain, toolchainExe } from '@telelean/runner/lean/toolchain.js';
import { defaultHookRuntime, selfTestGuard, writeConfinementFiles, type HookRuntime } from '@telelean/runner/llm/confinement.js';
import { sanitizeClaudeEnv } from '@telelean/runner/llm/env.js';

import { EXTENSION_ID } from './helpers';

/** The snap scripts/smoke.mjs --snap started the instance from (scripts/snap-env.mjs SnapInstall), if any. */
interface SnapUnderTest {
  dir: string;
  name: string;
  revision: string;
  version: string;
  electron: string;
}

const SMOKE_DIR = process.env.TELELEAN_SMOKE_DIR ?? '';
const SNAP: SnapUnderTest | undefined = process.env.TELELEAN_VSCODE_SNAP ? (JSON.parse(process.env.TELELEAN_VSCODE_SNAP) as SnapUnderTest) : undefined;

/** Variables a snap VS Code adds to its extension host (names only are reported). */
function snapLeakNames(env: NodeJS.ProcessEnv): string[] {
  const exact = ['LOCPATH', 'GSETTINGS_SCHEMA_DIR', 'FONTCONFIG_PATH', 'FONTCONFIG_FILE'];
  return Object.keys(env)
    .filter((name) => /^(SNAP|GTK_|GDK_|GIO_|ELECTRON_)/.test(name) || name.endsWith('_VSCODE_SNAP_ORIG') || exact.includes(name))
    .sort();
}

/** Values safe to write down (paths and switches; SNAP_COOKIE / SNAP_CONTEXT are never among them). */
const REPORTED_VALUES = [
  'SNAP',
  'SNAP_REVISION',
  'SNAP_USER_DATA',
  'SNAP_USER_COMMON',
  'SNAP_LAUNCHER_ARCH_TRIPLET',
  'GTK_PATH',
  'GIO_MODULE_DIR',
  'LOCPATH',
  'XDG_DATA_DIRS',
  'XDG_CONFIG_DIRS',
  'XDG_RUNTIME_DIR',
  'ELECTRON_RUN_AS_NODE',
  'VSCODE_CLI',
  'HOME',
];

function readProc(file: string): string {
  try {
    return readFileSync(file, 'utf8').replace(/\0/g, '').trim();
  } catch {
    return 'unknown';
  }
}

function guardScript(): string {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, `${EXTENSION_ID} is not loaded`);
  return path.join(extension.extensionPath, 'dist', 'bin', 'telelean-path-guard.mjs');
}

suite('the extension host environment (snap leaks, Lean sandbox, Claude env, hook runtime)', () => {
  let scratch: string;

  suiteSetup(() => {
    assert.ok(SMOKE_DIR, 'TELELEAN_SMOKE_DIR is not set: run the smoke tests with npm run test:smoke (scripts/smoke.mjs)');
    scratch = mkdtempSync(path.join(SMOKE_DIR, 'host-env-'));
  });

  test('the VS Code under test, and what its extension host inherited (snap mode: the snap through electron-launch)', () => {
    const env = process.env;
    const report = {
      execPath: process.execPath,
      electron: process.versions.electron ?? null,
      node: process.versions.node,
      vscodeVersion: vscode.version,
      appRoot: vscode.env.appRoot,
      apparmor: readProc('/proc/self/attr/current'),
      cgroup: readProc('/proc/self/cgroup').replace(/^0::/, ''),
      snapLeaks: snapLeakNames(env),
      values: Object.fromEntries(REPORTED_VALUES.filter((name) => env[name] !== undefined).map((name) => [name, env[name]])),
      hookRuntime: defaultHookRuntime(),
    };
    writeFileSync(path.join(SMOKE_DIR, 'host-env.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`      host environment: ${JSON.stringify(report)}`);
    assert.equal(homedir(), path.join(SMOKE_DIR, 'home'), 'the isolated HOME');
    if (!SNAP) return;

    // The snap's binary, as process.execPath in the user's window (not the 1.140.0 test build).
    assert.equal(realpathSync(process.execPath), realpathSync(SNAP.electron));
    assert.equal(vscode.version, SNAP.version);
    assert.ok(vscode.env.appRoot.startsWith(`${SNAP.dir}/`), vscode.env.appRoot);
    // `snap run`'s variables, with the per-user folders in the isolated HOME (never the real ~/snap).
    assert.equal(env.SNAP, SNAP.dir);
    assert.equal(env.SNAP_NAME, SNAP.name);
    assert.equal(env.SNAP_REVISION, SNAP.revision);
    assert.equal(env.SNAP_USER_DATA, path.join(SMOKE_DIR, 'home', 'snap', SNAP.name, SNAP.revision));
    assert.equal(env.SNAP_USER_COMMON, path.join(SMOKE_DIR, 'home', 'snap', SNAP.name, 'common'));
    // electron-launch ran: it exports these (VS Code never removes them).
    assert.ok(env.SNAP_LAUNCHER_ARCH_TRIPLET, 'SNAP_LAUNCHER_ARCH_TRIPLET (electron-launch) is not set');
    assert.ok(env.XDG_DATA_DIRS_VSCODE_SNAP_ORIG !== undefined, 'XDG_DATA_DIRS_VSCODE_SNAP_ORIG (electron-launch) is not set');
  });

  test('the Lean sandbox works from this environment: preflight, the userns probe, then a sandboxed `lean --version`', async function () {
    this.timeout(120_000);
    const problem = await checkSandboxSupport();
    assert.equal(problem, undefined, `checkSandboxSupport: ${problem}`);
    const userns = await checkUserNamespaces();
    assert.equal(userns, undefined, `checkUserNamespaces: ${userns}`);
    const shadowDir = path.join(scratch, 'lean-shadow');
    mkdirSync(shadowDir, { recursive: true });
    const result = await runLean({ shadowDir, argv: [toolchainExe(resolveToolchain(), 'lean'), '--version'], memoryMax: '1G', timeoutMs: 60_000 });
    assert.equal(result.status, 'ok', `${result.status}: ${result.detail ?? ''} ${result.stderr}`);
    assert.match(result.stdout, /Lean \(version 4\.35\.0/);
  });

  test("Claude Code's environment keeps none of the snap's variables or paths", () => {
    const { env, removed, restored } = sanitizeClaudeEnv(process.env);
    const leftovers = snapLeakNames(env).filter((name) => name !== 'FONTCONFIG_PATH' && name !== 'FONTCONFIG_FILE');
    assert.deepEqual(leftovers, [], `left in Claude's environment: ${leftovers.join(', ')}`);
    assert.deepEqual(
      Object.keys(env).filter((name) => name.startsWith('VSCODE_')),
      [],
      "VS Code's own variables (IPC hooks) must not reach Claude",
    );
    if (process.env.XDG_DATA_DIRS_VSCODE_SNAP_ORIG !== undefined) {
      assert.ok(restored.includes('XDG_DATA_DIRS'), `restored: ${restored.join(', ')}`);
      assert.equal(env.XDG_DATA_DIRS ?? '', process.env.XDG_DATA_DIRS_VSCODE_SNAP_ORIG);
    }
    const snapDir = process.env.SNAP;
    if (snapDir) {
      // `_` is the shell's "last command" (electron-launch's `exec` sets it to the binary; harmless, shells reset it);
      // TELELEAN_VSCODE_SNAP exists only in this test.
      const intoSnap = Object.entries(env)
        .filter(([name]) => name !== '_' && name !== 'TELELEAN_VSCODE_SNAP')
        .filter(([, value]) => value.includes(`${snapDir}/`) || value === snapDir)
        .map(([name]) => name);
      assert.deepEqual(intoSnap, [], `variables that still point into ${snapDir}: ${intoSnap.join(', ')}`);
    }
    console.log(`      removed for Claude: ${removed.join(' ')}`);
  });

  test('the path guard answers its self-test under the chosen hook runtime and under Electron-as-Node', async function () {
    this.timeout(90_000);
    const { env } = sanitizeClaudeEnv(process.env);
    const runtimes: Array<[string, HookRuntime]> = [
      ['default', defaultHookRuntime()],
      ['electron', { command: '/usr/bin/env', args: ['ELECTRON_RUN_AS_NODE=1', process.execPath] }],
    ];
    for (const [name, runtime] of runtimes) {
      const shadowDir = path.join(scratch, `guard-${name}`, 'shadow');
      const runDir = path.join(scratch, `guard-${name}`, 'run');
      mkdirSync(shadowDir, { recursive: true });
      const files = await writeConfinementFiles({ runDir, shadowDir, guardScriptPath: guardScript(), runtime });
      const result = await selfTestGuard(files, { env });
      assert.ok(result.ok, `${name} (${runtime.command} ${runtime.args.join(' ')}): ${result.problems.join('; ')}`);
    }
  });
});
