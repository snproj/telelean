// scripts/snap-env.mjs and the snap mode of .vscode-test.mjs (`npm run test:smoke:snap`): how the test instance is
// started through the snap's electron-launch, with `snap run`'s variables and the caller's snap layer removed.
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// @ts-expect-error -- plain .mjs helpers shared with scripts/smoke.mjs and .vscode-test.mjs (no type declarations)
import { ELECTRON_LAUNCH_VARIABLES, findSnap, PLACEHOLDER_COOKIE, snapLaunch, snapLeakNames, snapRunEnv, snapTestEnv } from '../../scripts/snap-env.mjs';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** A stand-in for /snap/code: <root>/278 with the files findSnap reads, and <root>/current -> 278. */
function fakeSnap(options: { confinement?: string; missing?: string } = {}): string {
  const root = mkdtempSync(path.join(process.env.TELELEAN_TEST_TMP ?? tmpdir(), 'tl-snap-env-'));
  dirs.push(root);
  const rev = path.join(root, '278');
  const files: Record<string, string> = {
    'meta/snap.yaml': `name: code\nversion: c4453f8e\nsummary: Code editing. Redefined.\napps:\n  code:\n    command: electron-launch $SNAP/usr/share/code/bin/code --no-sandbox\n    common-id: code.desktop\nbase: core20\nconfinement: ${options.confinement ?? 'classic'}\ngrade: stable\n`,
    'electron-launch': '#!/usr/bin/env bash\nexec "$@" --ozone-platform=x11\n',
    'usr/share/code/code': '',
    'usr/share/code/resources/app/package.json': '{ "name": "Code", "version": "1.145.2" }\n',
  };
  for (const [rel, text] of Object.entries(files)) {
    if (rel === options.missing) continue;
    mkdirSync(path.dirname(path.join(rev, rel)), { recursive: true });
    writeFileSync(path.join(rev, rel), text);
  }
  if (options.missing !== 'electron-launch') chmodSync(path.join(rev, 'electron-launch'), 0o755);
  symlinkSync('278', path.join(root, 'current'));
  return root;
}

const user = { home: '/scratch/home', uid: 1002, euid: 1002, arch: 'amd64' };

describe('findSnap', () => {
  it('reads the revision the current link points to, its versions and launch files', () => {
    const root = fakeSnap();
    const found = findSnap(path.join(root, 'current'));
    expect(found).toEqual({
      ok: true,
      snap: {
        dir: path.join(root, '278'),
        name: 'code',
        revision: '278',
        snapVersion: 'c4453f8e',
        version: '1.145.2',
        launcher: path.join(root, '278', 'electron-launch'),
        electron: path.join(root, '278', 'usr', 'share', 'code', 'code'),
        commonId: 'code.desktop',
      },
    });
  });

  it('says why when there is no snap, a file is missing, or the snap is not classic', () => {
    expect(findSnap('/nonexistent/snap/code/current')).toMatchObject({ ok: false, reason: expect.stringMatching(/does not exist/) });
    expect(findSnap(path.join(fakeSnap({ missing: 'electron-launch' }), 'current'))).toMatchObject({ ok: false, reason: expect.stringMatching(/electron-launch is missing/) });
    expect(findSnap(path.join(fakeSnap({ confinement: 'strict' }), 'current'))).toMatchObject({ ok: false, reason: expect.stringMatching(/not classic/) });
  });
});

describe('the test environment', () => {
  const snap = {
    dir: '/snap/code/278',
    name: 'code',
    revision: '278',
    snapVersion: 'c4453f8e',
    version: '1.145.2',
    launcher: '/snap/code/278/electron-launch',
    electron: '/snap/code/278/usr/share/code/code',
    commonId: 'code.desktop',
  };

  it("sets snap run's variables with the per-user folders in the given home, and never a real snapctl cookie", () => {
    const env = snapRunEnv(snap, user);
    expect(env).toMatchObject({
      SNAP: '/snap/code/278',
      SNAP_NAME: 'code',
      SNAP_INSTANCE_NAME: 'code',
      SNAP_REVISION: '278',
      SNAP_VERSION: 'c4453f8e',
      SNAP_ARCH: 'amd64',
      SNAP_APP_COMMON_ID: 'code.desktop',
      SNAP_USER_DATA: '/scratch/home/snap/code/278',
      SNAP_USER_COMMON: '/scratch/home/snap/code/common',
      SNAP_REAL_HOME: '/scratch/home',
      SNAP_UID: '1002',
      SNAP_COOKIE: PLACEHOLDER_COOKIE,
      SNAP_CONTEXT: PLACEHOLDER_COOKIE,
    });
    expect(env).not.toHaveProperty('HOME');
    expect(env).not.toHaveProperty('XDG_RUNTIME_DIR');
  });

  it('from inside the snap VS Code: drops its snap layer and restores the original lists before electron-launch runs', () => {
    const inside = {
      PATH: '/usr/bin:/bin',
      SNAP: '/snap/code/278',
      SNAP_USER_DATA: '/home/u/snap/code/278',
      SNAP_COOKIE: 'a-real-cookie',
      SNAP_LAUNCHER_ARCH_TRIPLET: 'x86_64-linux-gnu',
      GTK_PATH: '/snap/code/278/usr/lib/x86_64-linux-gnu/gtk-3.0',
      LOCPATH: '/snap/code/278/usr/lib/locale',
      GIO_MODULE_DIR: '/home/u/snap/code/common/.cache/gio-modules',
      XDG_DATA_DIRS: '/home/u/snap/code/278/.local/share:/snap/code/278/usr/share:/usr/share',
      XDG_DATA_DIRS_VSCODE_SNAP_ORIG: '/usr/share',
      XDG_CONFIG_DIRS: '/etc/xdg',
      XDG_CONFIG_DIRS_VSCODE_SNAP_ORIG: '',
      LOCPATH_VSCODE_SNAP_ORIG: '',
    };
    const { unset, set } = snapTestEnv(inside, snap, user);
    for (const name of ['GTK_PATH', 'LOCPATH', 'GIO_MODULE_DIR', 'SNAP_LAUNCHER_ARCH_TRIPLET', 'XDG_DATA_DIRS_VSCODE_SNAP_ORIG', 'LOCPATH_VSCODE_SNAP_ORIG', 'XDG_CONFIG_DIRS']) {
      expect(unset).toContain(name);
    }
    expect(unset).not.toContain('PATH');
    expect(set.XDG_DATA_DIRS).toBe('/usr/share');
    expect(set.SNAP_USER_DATA).toBe('/scratch/home/snap/code/278');
    expect(set.SNAP_COOKIE).toBe(PLACEHOLDER_COOKIE);
    expect(Object.values(set)).not.toContain('a-real-cookie');
    expect(set).toMatchObject({ VSCODE_CLI: '1', ELECTRON_NO_ATTACH_CONSOLE: '1' });
    // Nothing is both removed and set.
    expect(unset.filter((name: string) => name in set)).toEqual([]);
  });

  it('from a plain terminal: only the variables electron-launch sets itself are removed', () => {
    const { unset, set } = snapTestEnv({ PATH: '/usr/bin:/bin', XDG_DATA_DIRS: '/usr/share' }, snap, user);
    expect(unset).toEqual([...ELECTRON_LAUNCH_VARIABLES].sort());
    expect(set).not.toHaveProperty('XDG_DATA_DIRS');
  });

  it('launches electron-launch with the Electron binary first, as the desktop file does (--force-user-env)', () => {
    expect(snapLaunch(snap)).toEqual({ executable: '/snap/code/278/electron-launch', prefixArgs: ['/snap/code/278/usr/share/code/code', '--force-user-env'] });
  });

  it('names the leaked variables of an extension host (names only)', () => {
    expect(snapLeakNames({ SNAP: 'x', GTK_PATH: 'x', ELECTRON_RUN_AS_NODE: '1', LOCPATH: 'x', HOME: 'x', X_VSCODE_SNAP_ORIG: '' })).toEqual([
      'ELECTRON_RUN_AS_NODE',
      'GTK_PATH',
      'LOCPATH',
      'SNAP',
      'X_VSCODE_SNAP_ORIG',
    ]);
  });
});

describe('.vscode-test.mjs in snap mode', () => {
  it('starts both instances through electron-launch with the snap environment', async () => {
    const root = fakeSnap();
    const found = findSnap(path.join(root, 'current'));
    if (!found.ok) throw new Error(found.reason);
    vi.stubEnv('TELELEAN_SMOKE_DIR', '/scratch/profile');
    vi.stubEnv('TELELEAN_VSCODE_SNAP', JSON.stringify(found.snap));
    vi.stubEnv('GTK_PATH', '/snap/code/278/usr/lib/x86_64-linux-gnu/gtk-3.0');
    vi.stubEnv('VSCODE_IPC_HOOK', '/run/user/1/vscode.sock');
    vi.stubEnv('CLAUDE_CODE_MESSAGING_TOKEN', 'a-session-token');
    // @ts-expect-error -- the @vscode/test-cli configuration (plain .mjs)
    const configs = (await import('../../.vscode-test.mjs')).default as Array<{
      label: string;
      version: string;
      useInstallation?: { fromPath: string };
      launchArgs: string[];
      env: Record<string, string | undefined>;
    }>;
    expect(configs.map((c) => c.label)).toEqual(['smoke', 'e2e']);
    for (const config of configs) {
      expect(config.useInstallation).toEqual({ fromPath: found.snap.launcher });
      expect(config.version).toBe('1.145.2');
      expect(config.launchArgs.slice(0, 2)).toEqual([found.snap.electron, '--force-user-env']);
      expect(config.launchArgs).toContain('--user-data-dir=/scratch/profile/user-data');
      expect(config.env).toMatchObject({
        SNAP: found.snap.dir,
        SNAP_USER_DATA: `/scratch/profile/home/snap/code/278`,
        HOME: '/scratch/profile/home',
        VSCODE_CLI: '1',
        TELELEAN_NO_REAL_CLAUDE: '1',
      });
      expect('GTK_PATH' in config.env && config.env.GTK_PATH === undefined).toBe(true);
      expect('VSCODE_IPC_HOOK' in config.env && config.env.VSCODE_IPC_HOOK === undefined).toBe(true);
      // The variables of a Claude Code session that runs the tests never reach the instance.
      expect('CLAUDE_CODE_MESSAGING_TOKEN' in config.env && config.env.CLAUDE_CODE_MESSAGING_TOKEN === undefined).toBe(true);
    }
  });

  it('without TELELEAN_VSCODE_SNAP it keeps the 1.140.0 test build', async () => {
    vi.stubEnv('TELELEAN_SMOKE_DIR', '/scratch/profile');
    vi.stubEnv('TELELEAN_VSCODE_SNAP', '');
    // @ts-expect-error -- the @vscode/test-cli configuration (plain .mjs)
    const configs = (await import('../../.vscode-test.mjs')).default as Array<{ version: string; useInstallation?: unknown; launchArgs: string[]; env: Record<string, string | undefined> }>;
    for (const config of configs) {
      expect(config.version).toBe('1.140.0');
      expect(config.useInstallation).toBeUndefined();
      expect(config.launchArgs[0]).toBe('--user-data-dir=/scratch/profile/user-data');
      expect(config.env).not.toHaveProperty('SNAP_USER_DATA');
    }
  });
});
