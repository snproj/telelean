import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { classifyModelPath, isInside, relativeModelPath, resolveInsideRoot, resolveModelFile, rootOfPath } from '../../src/logic/modelPaths';

let scratch: string;
let root: string;

beforeAll(async () => {
  scratch = await mkdtemp(path.join(process.env.TELELEAN_TEST_TMP ?? tmpdir(), 'tl-paths-'));
  root = path.join(scratch, 'model');
  await mkdir(path.join(root, 'Model', 'Spyro'), { recursive: true });
  await writeFile(path.join(root, 'Model', 'Spyro', 'Main.lean'), '-- main\n');
  await writeFile(path.join(scratch, 'secret.txt'), 'outside\n');
  await symlink(path.join(scratch, 'secret.txt'), path.join(root, 'Model', 'link.lean'));
  await symlink(path.join(root, 'Model', 'Spyro', 'Main.lean'), path.join(root, 'Model', 'inner-link.lean'));
});

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe('openInEditor path checks (AT5.7)', () => {
  it('resolves relative POSIX paths inside the root', async () => {
    expect(resolveInsideRoot(root, 'Model/Spyro/Main.lean')).toBe(path.join(root, 'Model', 'Spyro', 'Main.lean'));
    expect(await resolveModelFile(root, 'Model/Spyro/Main.lean')).toBe(path.join(root, 'Model', 'Spyro', 'Main.lean'));
    expect(await resolveModelFile(root, 'Model/Spyro/NotYet.lean')).toBe(path.join(root, 'Model', 'Spyro', 'NotYet.lean'));
    expect(await resolveModelFile(root, 'Model/inner-link.lean')).toBe(path.join(root, 'Model', 'inner-link.lean'));
  });

  it('refuses paths outside the root, however they are spelled', async () => {
    for (const bad of ['../secret.txt', '/etc/passwd', 'Model/../../secret.txt', 'Model/./Spyro/Main.lean', 'Model//Main.lean', 'Model\\..\\x', '', 'a\0b']) {
      expect(() => resolveInsideRoot(root, bad), JSON.stringify(bad)).toThrow(/refused/);
    }
  });

  it('refuses a symbolic link inside the root that points outside it', async () => {
    await expect(resolveModelFile(root, 'Model/link.lean')).rejects.toThrow(/links outside the model root/);
  });
});

describe('path helpers', () => {
  it('isInside / relativeModelPath / rootOfPath', () => {
    expect(isInside('/a/b', '/a/b/c')).toBe(true);
    expect(isInside('/a/b', '/a/b')).toBe(false);
    expect(isInside('/a/b', '/a/bc/d')).toBe(false);
    expect(isInside('/a/b', '/a/..b/c')).toBe(false);
    expect(relativeModelPath('/a/b', '/a/b/Model/S/Main.lean')).toBe('Model/S/Main.lean');
    expect(relativeModelPath('/a/b', '/a/x')).toBeUndefined();
    expect(rootOfPath(['/w/m', '/w/m/inner', '/w/n'], '/w/m/inner/Model.lean')).toBe('/w/m/inner');
    expect(rootOfPath(['/w/m'], '/w/other/Model.lean')).toBeUndefined();
  });

  it('classifies file events: Lean files, sidecars and project files count; .lake, .git, graph.json do not', () => {
    const r = '/w/m';
    expect(classifyModelPath(r, '/w/m/Model/Spyro/Main.lean')).toEqual({ path: 'Model/Spyro/Main.lean', kind: 'model', refresh: false });
    expect(classifyModelPath(r, '/w/m/Model.lean')).toEqual({ path: 'Model.lean', kind: 'model', refresh: false });
    expect(classifyModelPath(r, '/w/m/.telelean/subjects/Spyro/layout.json')).toEqual({ path: '.telelean/subjects/Spyro/layout.json', kind: 'sidecar', refresh: false });
    expect(classifyModelPath(r, '/w/m/.telelean/config.json')).toEqual({ path: '.telelean/config.json', kind: 'sidecar', refresh: false });
    expect(classifyModelPath(r, '/w/m/lakefile.toml')).toEqual({ path: 'lakefile.toml', kind: 'project', refresh: true });
    expect(classifyModelPath(r, '/w/m/lakefile.lean')).toEqual({ path: 'lakefile.lean', kind: 'project', refresh: true });
    expect(classifyModelPath(r, '/w/m/lean-toolchain')).toEqual({ path: 'lean-toolchain', kind: 'project', refresh: true });
    expect(classifyModelPath(r, '/w/m/lake-manifest.json')).toEqual({ path: 'lake-manifest.json', kind: 'project', refresh: true });
    for (const ignored of [
      '/w/m/.telelean/graph.json',
      '/w/m/.telelean/sessions/run1/x.lean',
      '/w/m/.telelean/frozen/a.json',
      // 2k2 (D2-107 R2): a run's working copy, its Lean build, its records and the consent never reach the workspace.
      '/w/m/.telelean/runs/r1/ws/Model/Spyro.lean',
      '/w/m/.telelean/runs/r1/ws/Model.lean',
      '/w/m/.telelean/runs/r1/ws/lakefile.toml',
      '/w/m/.telelean/runs/r1/build/Model/Spyro.lean',
      '/w/m/.telelean/runs/r1/run.json',
      '/w/m/.telelean/runs/consent.json',
      '/w/m/.telelean/runs/.gitignore',
      // A-F9: the folders' own create and delete events (the `.telelean/**` watcher glob delivers them).
      '/w/m/.telelean/runs',
      '/w/m/.telelean/sessions',
      '/w/m/.telelean/frozen',
      '/w/m/.telelean/graph.json.4242-7.tmp',
      '/w/m/.telelean/Main.lean.4242-8.tmp',
      '/w/m/.lake/build/lib/lean/Model.ilean',
      '/w/m/Model/.lake/x.lean',
      '/w/m/.git/index',
      '/w/m/README.md',
      '/w/other/Model.lean',
    ]) {
      expect(classifyModelPath(r, ignored), ignored).toBeUndefined();
    }
  });
});
