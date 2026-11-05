// Build steps besides esbuild itself, shared by scripts/build.mjs and the unit tests (test/unit/bundle.test.ts):
//   copyGuardScript    the runner's PreToolUse path guard -> dist/bin/telelean-path-guard.mjs (the Claude CLI runs it
//                      as a hook; the extension passes this path explicitly, docs/m2-plan.md section 8.4)
//   checkBundleLoads   requires the bundle in a separate Node process with a stub `vscode` module: it must load and
//                      export activate/deactivate (a module-load crash, e.g. from `import.meta.url`, fails the build)
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/** packages/runner/bin/telelean-path-guard.mjs */
export const GUARD_SOURCE = fileURLToPath(new URL('../../runner/bin/telelean-path-guard.mjs', import.meta.url));
export const GUARD_NAME = 'telelean-path-guard.mjs';
const CHECK_SCRIPT = fileURLToPath(new URL('./check-bundle.cjs', import.meta.url));

/**
 * Copies the guard script to `<distDir>/bin/` and checks the copy is byte-identical; returns its path.
 * @param {string} distDir absolute path of the dist folder (packages/extension/dist in the build)
 */
export async function copyGuardScript(distDir) {
  const target = path.join(distDir, 'bin', GUARD_NAME);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(GUARD_SOURCE, target);
  const [source, copy] = await Promise.all([readFile(GUARD_SOURCE), readFile(target)]);
  if (!source.equals(copy)) throw new Error(`the copied path guard ${target} differs from ${GUARD_SOURCE}`);
  return target;
}

/**
 * Loads the bundle in a fresh Node process with a stub `vscode` module; throws with its output when it fails.
 * @param {string} bundle absolute path of the bundle
 */
export function checkBundleLoads(bundle) {
  const result = spawnSync(process.execPath, [CHECK_SCRIPT, bundle], { encoding: 'utf8', timeout: 60_000, env: { ...process.env, TELELEAN_NO_REAL_CLAUDE: '1' } });
  if (result.status !== 0) {
    throw new Error(`the bundle ${bundle} does not load in Node: ${(result.stderr || result.stdout || String(result.error ?? '')).trim()}`);
  }
  return result.stdout.trim();
}
