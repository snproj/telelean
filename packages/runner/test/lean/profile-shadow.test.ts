/** Pure checks of the bwrap profile, and the shadow copier (no sandbox involved). */
import { existsSync, mkdirSync, readFileSync, symlinkSync, utimesSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildBwrapArgs, sandboxPath } from '../../src/lean/sandboxProfile.js';
import { createShadow, ShadowError } from '../../src/lean/shadow.js';
import { formatDeclName, isValidDeclName, modulePath } from '../../src/lean/leanNames.js';
import { memoryMaxToBytes } from '../../src/lean/runLean.js';
import { cleanupTempRoot, makeTempRoot, SPYRO } from './helpers.js';

const profile = {
  home: '/home/u',
  elanHome: '/home/u/.elan',
  toolchainBin: '/home/u/.elan/toolchains/tc/bin',
  shadowDir: '/home/u/.config/runs/r1/ws',
};

/** Index of the first occurrence of a flag followed by its arguments. */
function indexOfSeq(args: readonly string[], seq: readonly string[]): number {
  for (let i = 0; i + seq.length <= args.length; i++) {
    if (seq.every((s, j) => args[i + j] === s)) return i;
  }
  return -1;
}

describe('bwrap profile (03 §8.4)', () => {
  const args = buildBwrapArgs({ ...profile, env: { LEAN_NUM_THREADS: '4' }, jsonStatusFd: 3 }, ['lake', 'build']);

  it('is the mount allowlist, in an order where the covers come before the binds through them', () => {
    const tmpfsHome = indexOfSeq(args, ['--tmpfs', '/home/u']);
    const elan = indexOfSeq(args, ['--ro-bind', '/home/u/.elan', '/home/u/.elan']);
    const shadowRo = indexOfSeq(args, ['--ro-bind', profile.shadowDir, profile.shadowDir]);
    const lakeRw = indexOfSeq(args, ['--bind', `${profile.shadowDir}/.lake`, `${profile.shadowDir}/.lake`]);
    expect(indexOfSeq(args, ['--ro-bind', '/usr', '/usr'])).toBe(0);
    expect(indexOfSeq(args, ['--ro-bind', '/etc', '/etc'])).toBeGreaterThan(0);
    for (const cover of [['--tmpfs', '/tmp'], ['--tmpfs', '/run']]) expect(indexOfSeq(args, cover)).toBeGreaterThan(0);
    expect(tmpfsHome).toBeGreaterThan(0);
    expect(elan).toBeGreaterThan(tmpfsHome);
    expect(shadowRo).toBeGreaterThan(tmpfsHome);
    expect(lakeRw).toBeGreaterThan(shadowRo);
    // comparator's nested bwrap needs these mount points
    for (const dir of ['/root', '/run/user', '/var']) expect(indexOfSeq(args, ['--dir', dir])).toBeGreaterThan(0);
    // nothing of the host's /run, /home or / is bound
    expect(args.filter((a, i) => (args[i - 1] === '--ro-bind' || args[i - 1] === '--bind') && (a === '/' || a === '/run' || a === '/home'))).toEqual([]);
  });

  it('isolates namespaces, clears the environment and ends with the command', () => {
    for (const flag of ['--unshare-all', '--die-with-parent', '--new-session', '--clearenv']) expect(args).toContain(flag);
    expect(indexOfSeq(args, ['--setenv', 'HOME', '/home/u'])).toBeGreaterThan(args.indexOf('--clearenv'));
    expect(indexOfSeq(args, ['--setenv', 'PATH', sandboxPath(profile.toolchainBin)])).toBeGreaterThan(0);
    expect(sandboxPath(profile.toolchainBin)).toBe('/home/u/.elan/toolchains/tc/bin:/usr/bin:/bin');
    expect(indexOfSeq(args, ['--setenv', 'LEAN_NUM_THREADS', '4'])).toBeGreaterThan(0);
    expect(indexOfSeq(args, ['--json-status-fd', '3'])).toBeGreaterThan(0);
    expect(args.slice(-3)).toEqual(['--', 'lake', 'build']);
    expect(args).not.toContain('--share-net');
  });

  it('binds packages, extra paths and masks where asked, and can drop the nested-sandbox dirs', () => {
    const more = buildBwrapArgs(
      { ...profile, packagesDir: '/real/.lake/packages', roBinds: ['/x'], rwBinds: ['/y'], maskPaths: ['/real/.git'], allowNestedSandbox: false },
      ['true'],
    );
    expect(indexOfSeq(more, ['--ro-bind', '/real/.lake/packages', `${profile.shadowDir}/.lake/packages`])).toBeGreaterThan(0);
    expect(indexOfSeq(more, ['--ro-bind', '/x', '/x'])).toBeGreaterThan(0);
    expect(indexOfSeq(more, ['--bind', '/y', '/y'])).toBeGreaterThan(0);
    expect(indexOfSeq(more, ['--tmpfs', '/real/.git'])).toBeGreaterThan(0);
    expect(indexOfSeq(more, ['--dir', '/root'])).toBe(-1);
  });

  it('rejects relative paths, bad env names and attempts to override HOME/PATH', () => {
    expect(() => buildBwrapArgs({ ...profile, shadowDir: 'rel' }, ['true'])).toThrow(TypeError);
    expect(() => buildBwrapArgs({ ...profile, env: { 'A=B': 'x' } }, ['true'])).toThrow(TypeError);
    expect(() => buildBwrapArgs({ ...profile, env: { PATH: '/evil' } }, ['true'])).toThrow(TypeError);
    expect(() => buildBwrapArgs(profile, [])).toThrow(TypeError);
  });

  it('parses MemoryMax values', () => {
    expect(memoryMaxToBytes('4G')).toBe(4 * 1024 ** 3);
    expect(memoryMaxToBytes('256M')).toBe(256 * 1024 ** 2);
    expect(memoryMaxToBytes('1048576')).toBe(1048576);
    expect(() => memoryMaxToBytes('4GB')).toThrow(TypeError);
    expect(() => memoryMaxToBytes('-1')).toThrow(TypeError);
  });
});

describe('Lean names in generated source', () => {
  it('escapes only where needed and refuses injection', () => {
    expect(formatDeclName('Spyro.cynder_not_good.holds')).toBe('Spyro.cynder_not_good.holds');
    expect(formatDeclName('end')).toBe('«end»');
    expect(formatDeclName('Foo.1x.bar')).toBe('Foo.«1x».bar');
    expect(formatDeclName('Spyro.Character.exists')).toBe('Spyro.Character.exists');
    expect(isValidDeclName('a\n#eval 1')).toBe(false);
    expect(isValidDeclName('a b')).toBe(false);
    expect(isValidDeclName('a..b')).toBe(false);
    expect(isValidDeclName('«a»')).toBe(false);
    expect(modulePath('Model.TeleleanChallenge')).toBe('Model/TeleleanChallenge.lean');
    expect(() => modulePath('Model.«x»')).toThrow(TypeError);
  });
});

describe('createShadow', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = makeTempRoot('shadow');
  });
  afterAll(() => cleanupTempRoot(tmp));

  it('copies only the model files of the fixture', async () => {
    const shadow = await createShadow(SPYRO, path.join(tmp, 's1'));
    expect(shadow.files).toEqual([
      'Check/Normative.lean',
      'Model.lean',
      'Model/Spyro/Main.lean',
      'Model/Spyro/Vocabulary.lean',
      'lake-manifest.json',
      'lakefile.toml',
      'lean-toolchain',
    ]);
    expect(shadow.copiedBuild).toBe(false);
    expect(existsSync(path.join(shadow.dir, '.lake'))).toBe(true);
    expect(readFileSync(path.join(shadow.dir, 'Model/Spyro/Main.lean'), 'utf8')).toBe(readFileSync(path.join(SPYRO, 'Model/Spyro/Main.lean'), 'utf8'));
  });

  it('skips non-model files and dot-directories, copies .lake/build, reports .lake/packages', async () => {
    const src = path.join(tmp, 'proj');
    mkdirSync(path.join(src, 'A'), { recursive: true });
    mkdirSync(path.join(src, '.git'), { recursive: true });
    mkdirSync(path.join(src, '.lake', 'build', 'lib'), { recursive: true });
    mkdirSync(path.join(src, '.lake', 'packages', 'dep'), { recursive: true });
    writeFileSync(path.join(src, 'lakefile.toml'), 'name = "A"\n');
    writeFileSync(path.join(src, 'A.lean'), 'import A.B\n');
    writeFileSync(path.join(src, 'A', 'B.lean'), 'def b := 1\n');
    writeFileSync(path.join(src, 'A', 'notes.md'), 'not a model file\n');
    writeFileSync(path.join(src, '.git', 'X.lean'), 'hidden\n');
    writeFileSync(path.join(src, '.lake', 'build', 'lib', 'A.olean'), 'olean');
    utimesSync(path.join(src, 'A.lean'), new Date('2026-01-02T03:04:05Z'), new Date('2026-01-02T03:04:05Z'));
    const shadow = await createShadow(src, path.join(tmp, 's2'));
    expect(shadow.files).toEqual(['A.lean', 'A/B.lean', 'lakefile.toml']);
    expect(shadow.copiedBuild).toBe(true);
    expect(shadow.buildFiles).toBe(1);
    expect(readFileSync(path.join(shadow.dir, '.lake/build/lib/A.olean'), 'utf8')).toBe('olean');
    expect(existsSync(path.join(shadow.dir, '.lake/packages'))).toBe(false);
    expect(shadow.packagesDir).toBe(path.join(src, '.lake', 'packages'));
    expect(statSync(path.join(shadow.dir, 'A.lean')).mtime.toISOString()).toBe('2026-01-02T03:04:05.000Z');
  });

  it('refuses symlinks anywhere in the model tree or the build, copying nothing', async () => {
    const src = path.join(tmp, 'linked');
    mkdirSync(path.join(src, 'M'), { recursive: true });
    writeFileSync(path.join(src, 'lakefile.toml'), 'name = "M"\n');
    writeFileSync(path.join(src, 'M.lean'), '\n');
    symlinkSync('/etc/passwd', path.join(src, 'M', 'Secret.lean'));
    const dest = path.join(tmp, 's3');
    const err = await createShadow(src, dest).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ShadowError);
    expect((err as ShadowError).code).toBe('symlink');
    expect((err as ShadowError).paths).toEqual(['M/Secret.lean']);
    expect(existsSync(dest)).toBe(false);

    const src2 = path.join(tmp, 'linked-build');
    mkdirSync(path.join(src2, '.lake', 'build'), { recursive: true });
    writeFileSync(path.join(src2, 'lakefile.toml'), 'name = "M"\n');
    symlinkSync('/etc', path.join(src2, '.lake', 'build', 'etc'));
    const err2 = await createShadow(src2, path.join(tmp, 's4')).catch((e: unknown) => e);
    expect((err2 as ShadowError).code).toBe('symlink');
    expect((err2 as ShadowError).paths).toEqual(['.lake/build/etc']);
  });

  it('refuses a non-empty destination and a project without a lakefile', async () => {
    const dest = path.join(tmp, 's5');
    mkdirSync(dest);
    writeFileSync(path.join(dest, 'x'), '');
    await expect(createShadow(SPYRO, dest)).rejects.toMatchObject({ code: 'dest-not-empty' });
    const bare = path.join(tmp, 'bare');
    mkdirSync(bare);
    writeFileSync(path.join(bare, 'A.lean'), '\n');
    await expect(createShadow(bare, path.join(tmp, 's6'))).rejects.toMatchObject({ code: 'no-lakefile' });
  });
});
