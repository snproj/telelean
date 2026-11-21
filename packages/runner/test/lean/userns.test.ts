/**
 * Turn 13 (snap work): bwrap's user namespaces. On Ubuntu 24.04 (`kernel.apparmor_restrict_unprivileged_userns=1`) an
 * unconfined bwrap cannot create them ("setting up uid map: Permission denied"), while the VS Code snap's processes
 * may. `checkUserNamespaces` finds that before a run sends anything to Claude (the run preflight calls it), and
 * `usernsHint` turns such a bwrap failure into a plain reason.
 */
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { checkUserNamespaces, usernsHint } from '../../src/lean/runLean.js';
import { preflight } from '../../src/run/preflight.js';
import { cleanupTempRoot, makeTempRoot } from './helpers.js';

const UID_MAP = 'bwrap: setting up uid map: Permission denied';

describe('usernsHint', () => {
  it('explains a namespace failure on a kernel with the AppArmor userns restriction', () => {
    const hint = usernsHint(`${UID_MAP}\n`, () => '1\n');
    expect(hint).toMatch(/apparmor_restrict_unprivileged_userns=1/);
    expect(hint).toMatch(/VS Code snap/);
    expect(usernsHint('bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted', () => '1')).not.toBe('');
  });

  it('says nothing without the restriction, or for another failure', () => {
    expect(usernsHint(UID_MAP, () => '0')).toBe('');
    expect(usernsHint(UID_MAP, () => undefined)).toBe('');
    expect(usernsHint("bwrap: Can't mkdir /x: Read-only file system", () => '1')).toBe('');
  });
});

describe('checkUserNamespaces', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = makeTempRoot('userns');
  });
  afterAll(() => {
    cleanupTempRoot(tmp);
  });

  function fakeBwrap(name: string, body: string): string {
    const file = path.join(tmp, name);
    writeFileSync(file, `#!/bin/sh\n${body}\n`);
    chmodSync(file, 0o755);
    return file;
  }

  it('passes on this machine (the tests run where the sandbox works)', async () => {
    expect(await checkUserNamespaces()).toBeUndefined();
  });

  it('refuses with bwrap’s own words when it cannot set up the sandbox', async () => {
    const bwrap = fakeBwrap('bwrap-denied', `echo '${UID_MAP}' >&2; exit 1`);
    const reason = await checkUserNamespaces({ bwrap });
    expect(reason).toMatch(/^bwrap cannot set up the sandbox here \(bwrap: setting up uid map: Permission denied\)/);
  });

  it('refuses when bwrap is missing, and caches only a success', async () => {
    expect(await checkUserNamespaces({ bwrap: path.join(tmp, 'no-such-bwrap') })).toMatch(/^bwrap cannot set up the sandbox here/);
    const marker = path.join(tmp, 'calls');
    const bwrap = fakeBwrap('bwrap-ok', `echo x >> '${marker}'; exit 0`);
    expect(await checkUserNamespaces({ bwrap })).toBeUndefined();
    expect(await checkUserNamespaces({ bwrap })).toBeUndefined();
    expect(readFileSync(marker, 'utf8')).toBe('x\n');
  });

  it('the run preflight runs it by default and passes on this machine', async () => {
    const outcome = await preflight({
      root: tmp,
      request: { subject: 'S', target: 't', premises: [] },
      workspace: {
        graph: () => ({ nodes: [{ id: 't', type: 'PROPOSITION', naturalName: 'T' }] }),
        applyChanges: () => undefined,
        readText: async (rel: string) => (rel === 'lean-toolchain' ? 'leanprover/lean4:v4.35.0\n' : rel === 'lake-manifest.json' ? '{"packages":[]}' : rel === 'lakefile.toml' ? '' : null),
        modelFiles: () => [],
        library: () => undefined,
        projectModel: () => undefined,
        reloadAttempts: () => undefined,
      },
      settings: { minAvailableBytes: 0 },
      readMemAvailable: () => 32 * 1024 ** 3,
    } as unknown as Parameters<typeof preflight>[0]);
    expect(outcome).toEqual({ ok: true });
  });
});
