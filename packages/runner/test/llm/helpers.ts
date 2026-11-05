// Shared helpers for the LLM harness tests.

import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** Temp root for tests; set TELELEAN_TEST_TMPDIR to keep test files in a scratch area. */
export function testTmpBase(): string {
  return process.env.TELELEAN_TEST_TMPDIR ?? os.tmpdir();
}

export async function makeTempDir(prefix = 'telelean-llm-'): Promise<string> {
  await mkdir(testTmpBase(), { recursive: true });
  return mkdtemp(path.join(testTmpBase(), prefix));
}

export async function removeDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export interface ShadowFixture {
  base: string;
  root: string;
  outside: string;
  runDir: string;
}

/**
 * A shadow workspace with the traps the guard must handle:
 *   root/Model.lean, root/Model/Spyro/Main.lean        visible model files
 *   root/.lake/build/x.olean, root/.telelean/…, root/.git/config   hidden
 *   root/escape -> outside/          (directory symlink pointing outside)
 *   root/escape-file -> outside/secret.txt
 *   root/innocent-link -> root/.lake/build/x.olean   (visible name, hidden target)
 *   root/.hidden-link -> root/Model.lean             (hidden name, visible target)
 *   root/dangling -> outside/does-not-exist
 */
export async function makeShadow(): Promise<ShadowFixture> {
  const base = await makeTempDir();
  const root = path.join(base, 'ws');
  const outside = path.join(base, 'outside');
  const runDir = path.join(base, 'run');
  await mkdir(path.join(root, 'Model', 'Spyro'), { recursive: true });
  await mkdir(path.join(root, '.lake', 'build'), { recursive: true });
  await mkdir(path.join(root, '.telelean'), { recursive: true });
  await mkdir(path.join(root, '.git'), { recursive: true });
  await mkdir(outside, { recursive: true });
  await mkdir(runDir, { recursive: true });
  await writeFile(path.join(root, 'Model.lean'), 'import Model.Spyro.Main\n');
  await writeFile(path.join(root, 'Model', 'Spyro', 'Main.lean'), 'namespace Spyro\nend Spyro\n');
  await writeFile(path.join(root, 'lakefile.toml'), 'name = "spyro"\n');
  await writeFile(path.join(root, '.lake', 'build', 'x.olean'), 'olean');
  await writeFile(path.join(root, '.telelean', 'decisions.json'), '{}');
  await writeFile(path.join(root, '.git', 'config'), '[core]\n');
  await writeFile(path.join(outside, 'secret.txt'), 'secret');
  await symlink(outside, path.join(root, 'escape'));
  await symlink(path.join(outside, 'secret.txt'), path.join(root, 'escape-file'));
  await symlink(path.join(root, '.lake', 'build', 'x.olean'), path.join(root, 'innocent-link'));
  await symlink(path.join(root, 'Model.lean'), path.join(root, '.hidden-link'));
  await symlink(path.join(outside, 'does-not-exist'), path.join(root, 'dangling'));
  return { base, root, outside, runDir };
}

/**
 * A shadow workspace with no hidden entry anywhere below its root (the layout in which Grep and
 * Glob may search the whole workspace):
 *   root/Model.lean, root/Model/Spyro/Main.lean, root/Check/Normative.lean, root/lakefile.toml
 *   root/Model/ext -> outside/     (outside/ holds .secret/token.txt; the link is not followed)
 */
export async function makeCleanShadow(): Promise<ShadowFixture> {
  const base = await makeTempDir('telelean-llm-clean-');
  const root = path.join(base, 'ws');
  const outside = path.join(base, 'outside');
  const runDir = path.join(base, 'run');
  await mkdir(path.join(root, 'Model', 'Spyro'), { recursive: true });
  await mkdir(path.join(root, 'Check'), { recursive: true });
  await mkdir(path.join(outside, '.secret'), { recursive: true });
  await mkdir(runDir, { recursive: true });
  await writeFile(path.join(root, 'Model.lean'), 'import Model.Spyro.Main\n');
  await writeFile(path.join(root, 'Model', 'Spyro', 'Main.lean'), 'namespace Spyro\nend Spyro\n');
  await writeFile(path.join(root, 'Check', 'Normative.lean'), 'import Model\n');
  await writeFile(path.join(root, 'lakefile.toml'), 'name = "spyro"\n');
  await writeFile(path.join(outside, '.secret', 'token.txt'), 'secret');
  await symlink(outside, path.join(root, 'Model', 'ext'));
  return { base, root, outside, runDir };
}
