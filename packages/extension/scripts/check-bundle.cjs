// Usage: node scripts/check-bundle.cjs <bundle.js>  (scripts/build-steps.mjs checkBundleLoads)
// Requires the extension bundle with a minimal stub `vscode` module (nothing is activated) and checks its exports.
// Module-load errors (a missing dependency, `import.meta.url` in CommonJS, …) make it exit non-zero.
'use strict';
const Module = require('node:module');
const path = require('node:path');

const bundle = path.resolve(process.argv[2] || '');
const stubId = path.join(path.dirname(bundle), '__vscode_stub__.js');
const stub = { version: '0.0.0-build-check', ExtensionMode: { Production: 1, Development: 2, Test: 3 } };
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return request === 'vscode' ? stubId : originalResolve.call(this, request, ...rest);
};
require.cache[stubId] = { id: stubId, filename: stubId, loaded: true, exports: stub };

const extension = require(bundle);
const missing = ['activate', 'deactivate'].filter((name) => typeof extension[name] !== 'function');
if (missing.length > 0) {
  console.error(`the bundle does not export ${missing.join(' and ')}`);
  process.exit(1);
}
console.log(`bundle loads: ${path.basename(bundle)} exports activate and deactivate`);
