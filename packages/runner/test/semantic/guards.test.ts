/**
 * The refresh's guards, none of which may start a process: the memory guard (AT3.4), the toolchain check (AT3.6),
 * the project check (AT3.11), argument validation; and the `.git` mask, by inspecting the argv runLean hands to
 * (fake) systemd-run (AT3.8).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { refreshLeanFacts } from '../../src/semantic/index.js';
import { gitMaskPaths, spawnMemoryMax } from '../../src/semantic/refresh.js';
import { cleanupTempRoot, makeTempRoot, recordingHost, SEMANTIC_RUN_ID, spyroCopy } from './helpers.js';

const GiB = 1024 ** 3;

describe('refresh guards (nothing spawned)', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = makeTempRoot('semantic-guards');
  });
  afterAll(() => cleanupTempRoot(tmp));

  it('AT3.4: pauses below the memory threshold without spawning anything', async () => {
    const root = spyroCopy(tmp, 'lowmem');
    const fake = recordingHost(path.join(tmp, 'fake-lowmem'));
    const phases: string[] = [];
    const facts = await refreshLeanFacts({
      root,
      readMemAvailable: () => 1 * GiB,
      minAvailableBytes: 2 * GiB,
      host: fake.host,
      runId: SEMANTIC_RUN_ID,
      onPhase: (p) => phases.push(p),
    });
    expect(facts.status).toBe('low-memory');
    expect(facts.detail).toBe('MemAvailable is 1.0 GiB, below the 2.0 GiB threshold');
    expect(facts.build).toEqual({ status: 'skipped', durationMs: 0, messages: [], failedModules: [] });
    expect(facts.check).toEqual({ status: 'skipped', durationMs: 0, probed: 0 });
    expect(facts.modules).toEqual([]);
    expect(facts.decls).toEqual([]);
    expect(facts.toolchain).toBe('leanprover/lean4:v4.35.0');
    expect(phases).toEqual([]);
    expect(fake.calls()).toEqual([]);
  });

  it('AT3.6: an edited lean-toolchain gives unsupported-toolchain, nothing spawned', async () => {
    const root = spyroCopy(tmp, 'toolchain', 'toolchain');
    const fake = recordingHost(path.join(tmp, 'fake-toolchain'));
    const facts = await refreshLeanFacts({ root, readMemAvailable: () => 64 * GiB, host: fake.host, runId: SEMANTIC_RUN_ID });
    expect(facts.status).toBe('unsupported-toolchain');
    expect(facts.toolchain).toBe('leanprover/lean4:v4.34.0');
    expect(facts.detail).toContain('leanprover/lean4:v4.34.0');
    expect(facts.build.status).toBe('skipped');
    expect(fake.calls()).toEqual([]);

    rmSync(path.join(root, 'lean-toolchain'));
    const missing = await refreshLeanFacts({ root, readMemAvailable: () => 64 * GiB, host: fake.host });
    expect(missing).toMatchObject({ status: 'unsupported-toolchain', toolchain: '', detail: 'lean-toolchain is missing' });
    expect(fake.calls()).toEqual([]);
  });

  it('AT3.11: Lake dependencies and a missing manifest give unsupported-project with distinct details, nothing spawned', async () => {
    const fake = recordingHost(path.join(tmp, 'fake-project'));
    const withPackage = await refreshLeanFacts({ root: spyroCopy(tmp, 'package', 'manifest-package'), readMemAvailable: () => 64 * GiB, host: fake.host });
    expect(withPackage.status).toBe('unsupported-project');
    expect(withPackage.detail).toBe(
      'this project has Lake dependencies (mathlib): M1 checks only dependency-free models; Mathlib needs an explicit opt-in (M4)',
    );

    const noManifestRoot = spyroCopy(tmp, 'nomanifest');
    rmSync(path.join(noManifestRoot, 'lake-manifest.json'));
    const noManifest = await refreshLeanFacts({ root: noManifestRoot, readMemAvailable: () => 64 * GiB, host: fake.host });
    expect(noManifest.status).toBe('unsupported-project');
    expect(noManifest.detail).toBe('lake-manifest.json is missing (the sandbox keeps the model folder read-only, so Lake cannot write one)');
    expect(noManifest.detail).not.toBe(withPackage.detail);

    const brokenRoot = spyroCopy(tmp, 'brokenmanifest');
    writeFileSync(path.join(brokenRoot, 'lake-manifest.json'), '{"packages": ');
    const broken = await refreshLeanFacts({ root: brokenRoot, readMemAvailable: () => 64 * GiB, host: fake.host });
    expect(broken.status).toBe('unsupported-project');
    expect(broken.detail).toMatch(/^lake-manifest\.json is not valid JSON/u);

    const noLakefileRoot = spyroCopy(tmp, 'nolakefile');
    rmSync(path.join(noLakefileRoot, 'lakefile.toml'));
    const noLakefile = await refreshLeanFacts({ root: noLakefileRoot, readMemAvailable: () => 64 * GiB, host: fake.host });
    expect(noLakefile).toMatchObject({ status: 'unsupported-project', detail: 'the model folder has no lakefile.toml or lakefile.lean' });

    for (const f of [withPackage, noManifest, broken, noLakefile]) {
      expect(f.build.status).toBe('skipped');
      expect(f.check.status).toBe('skipped');
      expect(f.decls).toEqual([]);
    }
    expect(fake.calls()).toEqual([]);
  });

  it('reports a sandbox that cannot start as could-not-start (fails closed, nothing run)', async () => {
    const root = spyroCopy(tmp, 'nosandbox');
    const facts = await refreshLeanFacts({ root, readMemAvailable: () => 64 * GiB, host: { bwrap: path.join(tmp, 'no-such-bwrap') }, runId: SEMANTIC_RUN_ID });
    expect(facts.status).toBe('could-not-start');
    expect(facts.detail).toBe(`lake build: bwrap not found or not executable at ${path.join(tmp, 'no-such-bwrap')}`);
    expect(facts.build).toMatchObject({ status: 'could-not-start', durationMs: 0, messages: [] });
    expect(facts.check.status).toBe('skipped');
    expect(facts.modules).toEqual([]);
  });

  it('reports a missing root as could-not-start and rejects invalid arguments with TypeError', async () => {
    const fake = recordingHost(path.join(tmp, 'fake-args'));
    const gone = await refreshLeanFacts({ root: path.join(tmp, 'does-not-exist'), readMemAvailable: () => 64 * GiB, host: fake.host });
    expect(gone).toMatchObject({ status: 'could-not-start', toolchain: '' });
    const root = spyroCopy(tmp, 'args');
    await expect(refreshLeanFacts({ root: 'relative/path' })).rejects.toThrow(TypeError);
    await expect(refreshLeanFacts({ root, library: 'Not.A Module' })).rejects.toThrow(TypeError);
    await expect(refreshLeanFacts({ root, runId: 'bad-id' })).rejects.toThrow(TypeError);
    await expect(refreshLeanFacts({ root, memoryMax: 'lots' })).rejects.toThrow(TypeError);
    await expect(refreshLeanFacts({ root, buildTimeoutMs: 0 })).rejects.toThrow(TypeError);
    await expect(refreshLeanFacts({ root, minAvailableBytes: -1 })).rejects.toThrow(TypeError);
    expect(fake.calls()).toEqual([]);
  });
});

describe('the .git mask (AT3.8, argv inspection)', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = makeTempRoot('semantic-gitmask');
  });
  afterAll(() => cleanupTempRoot(tmp));

  /** The bwrap arguments runLean passed to (fake) systemd-run for the build. */
  async function buildArgv(root: string, label: string): Promise<string[]> {
    const fake = recordingHost(path.join(tmp, `fake-${label}`));
    const facts = await refreshLeanFacts({ root, readMemAvailable: () => 64 * GiB, host: fake.host, runId: SEMANTIC_RUN_ID });
    expect(facts.status).toBe('could-not-start'); // the fake systemd-run refuses to start anything
    expect(facts.detail).toContain('fake systemd-run: not starting anything');
    const runs = fake.calls().filter((c) => c[0] === 'systemd-run');
    expect(runs).toHaveLength(1);
    const argv = runs[0] ?? [];
    expect(argv).toContain(`MemoryMax=4G`);
    expect(argv.slice(-2)).toEqual(['build', 'Model']); // `lake build Model` in place
    expect(argv).toContain(root); // the root itself is the shadow (bound read-only, `.lake` writable)
    return argv;
  }

  const masksGit = (argv: readonly string[], root: string): boolean =>
    argv.some((a, i) => a === '--tmpfs' && argv[i + 1] === path.join(root, '.git'));

  it('masks .git only when it is a directory', async () => {
    const withGit = spyroCopy(tmp, 'with-git');
    mkdirSync(path.join(withGit, '.git'));
    writeFileSync(path.join(withGit, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    expect(gitMaskPaths(withGit)).toEqual([path.join(withGit, '.git')]);
    expect(masksGit(await buildArgv(withGit, 'with'), withGit)).toBe(true);

    const without = spyroCopy(tmp, 'without-git');
    expect(gitMaskPaths(without)).toEqual([]);
    expect(masksGit(await buildArgv(without, 'without'), without)).toBe(false);

    const gitFile = spyroCopy(tmp, 'git-file'); // a worktree's `.git` is a file: bwrap cannot cover it with a tmpfs
    writeFileSync(path.join(gitFile, '.git'), 'gitdir: /elsewhere\n');
    expect(gitMaskPaths(gitFile)).toEqual([]);
  });
});

describe('the memory cap of a spawn leaves room for the machine (scope item 3)', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = makeTempRoot('semantic-cap');
  });
  afterAll(() => cleanupTempRoot(tmp));

  it('keeps the configured cap when MemAvailable leaves enough, else lowers it to MemAvailable minus a reserve', () => {
    expect(spawnMemoryMax('4G', 64 * GiB, 2 * GiB)).toBe('4G');
    expect(spawnMemoryMax('4G', undefined, 2 * GiB)).toBe('4G');
    expect(spawnMemoryMax('4G', 3 * GiB, 2 * GiB)).toBe('2048M'); // 3 GiB available - 1 GiB reserve
    expect(spawnMemoryMax('4G', 2.5 * GiB, 1 * GiB)).toBe('2048M'); // reserve = half the threshold
    expect(spawnMemoryMax('4G', 0.1 * GiB, 0)).toBe('256M'); // never below 256 MiB
  });

  it('the build is started with the lowered cap (argv inspection, nothing runs)', async () => {
    const root = spyroCopy(tmp, 'cap');
    const fake = recordingHost(path.join(tmp, 'fake-cap'));
    const facts = await refreshLeanFacts({ root, readMemAvailable: () => 3 * GiB, minAvailableBytes: 2 * GiB, host: fake.host, runId: SEMANTIC_RUN_ID });
    expect(facts.status).toBe('could-not-start'); // the fake systemd-run refuses to start anything
    const runs = fake.calls().filter((c) => c[0] === 'systemd-run');
    expect(runs).toHaveLength(1);
    expect(runs[0]).toContain('MemoryMax=2048M');
  });
});
