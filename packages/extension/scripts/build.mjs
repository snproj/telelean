// Bundles the extension host code and the in-VS-Code smoke tests with esbuild.
//   src/extension.ts        -> dist/extension.js                  (CommonJS, `vscode` external)
//   runner/bin guard        -> dist/bin/telelean-path-guard.mjs   (the Claude CLI's PreToolUse hook, M2)
//   test/suite/*.test.ts    -> out/test/suite/*.test.js           (loaded by @vscode/test-cli's mocha runner)
// `@telelean/core` and `@telelean/runner/*` resolve through the tsconfig `paths` entries to the package sources (no
// workspace link needed). M2 bundles the runner's llm/, run/, gate/, shadow/ and proposal/ modules (with the MCP SDK);
// their `import.meta.url` is defined as the bundle's own URL (scripts/esbuild-options.mjs). The build fails when the
// guard script was not copied or the bundle does not load in Node with a stub `vscode` module.
// The webview bundle (dist/webview/) is built separately by packages/webview (`npm run build:all` does both).
import * as esbuild from 'esbuild';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { checkBundleLoads, copyGuardScript } from './build-steps.mjs';
import { extensionOptions, suiteOptions } from './esbuild-options.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

await rm(`${root}/dist/extension.js`, { force: true });
await rm(`${root}/dist/extension.js.map`, { force: true });
await rm(`${root}/dist/bin`, { recursive: true, force: true });
const result = await esbuild.build({ ...extensionOptions(root), metafile: true });
const runnerDirs = [...new Set(Object.keys(result.metafile.inputs).flatMap((input) => /runner\/src\/([^/]+)\//.exec(input)?.slice(1) ?? []))].sort();
console.log(`bundled runner modules: ${runnerDirs.join(', ')}`);
const guard = await copyGuardScript(`${root}/dist`);
console.log(`copied the path guard to ${guard}`);
console.log(checkBundleLoads(`${root}/dist/extension.js`));

await rm(`${root}/out`, { recursive: true, force: true });
await esbuild.build(suiteOptions(root));
