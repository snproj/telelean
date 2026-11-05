// esbuild options shared by scripts/build.mjs and the bundle test (test/unit/bundle.test.ts).
// `@telelean/core` and `@telelean/runner/*` resolve through the tsconfig `paths` entries to the package sources.
import { fileURLToPath } from 'node:url';

/** Injected module that provides `import.meta.url` in the CommonJS bundles (see import-meta-url.mjs). */
export const IMPORT_META_URL_INJECT = fileURLToPath(new URL('./import-meta-url.mjs', import.meta.url));

/** @param {string} root absolute path of packages/extension */
export function commonOptions(root) {
  /** @type {import('esbuild').BuildOptions} */
  const options = {
    absWorkingDir: root,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    sourcemap: true,
    tsconfig: 'tsconfig.json',
    logLevel: 'info',
    // M2: the runner's llm/ modules and its path guard are bundled; their `import.meta.url` becomes the bundle's own
    // file URL (an injected constant), never undefined (docs/m2-plan.md section 8.4).
    define: { 'import.meta.url': 'teleleanImportMetaUrl' },
    inject: [IMPORT_META_URL_INJECT],
  };
  return options;
}

/** src/extension.ts -> dist/extension.js (CommonJS, `vscode` external). */
export function extensionOptions(root) {
  /** @type {import('esbuild').BuildOptions} */
  const options = { ...commonOptions(root), entryPoints: ['src/extension.ts'], outfile: 'dist/extension.js', external: ['vscode'] };
  return options;
}

/** test/suite/*.test.ts -> out/test/suite/*.test.js (loaded by @vscode/test-cli's mocha runner). */
export function suiteOptions(root) {
  /** @type {import('esbuild').BuildOptions} */
  // playwright-core (installed with @playwright/test) is loaded from the repository's node_modules at run time.
  const options = { ...commonOptions(root), entryPoints: ['test/suite/*.test.ts'], outdir: 'out/test/suite', external: ['vscode', 'mocha', 'playwright-core'] };
  return options;
}
