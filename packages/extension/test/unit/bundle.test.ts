/**
 * The extension bundle (risks R2/R8; docs/m2-plan.md section 8.4; AT5.4, AT5.5): it is built from the current sources
 * with the build's own esbuild options, now contains the runner's llm/, run/, gate/, shadow/ and proposal/ modules
 * (and the path-guard module), has no `import.meta` left (the build defines `import.meta.url` as the bundle's own
 * URL), and loads and activates in plain Node with a stub `vscode` module (so a missing or broken import fails here,
 * before VS Code). The build copies the guard script to dist/bin/.
 */
import * as esbuild from 'esbuild';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import Module, { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// @ts-expect-error -- plain .mjs helpers shared with scripts/build.mjs (no type declarations)
import { checkBundleLoads, copyGuardScript, GUARD_SOURCE } from '../../scripts/build-steps.mjs';
// @ts-expect-error -- plain .mjs helper shared with scripts/build.mjs (no type declarations)
import { extensionOptions } from '../../scripts/esbuild-options.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
let outDir: string;
let bundle: string;
let warnings: esbuild.Message[];
let inputs: string[];

beforeAll(async () => {
  outDir = await mkdtemp(path.join(process.env.TELELEAN_TEST_TMP ?? tmpdir(), 'tl-bundle-'));
  bundle = path.join(outDir, 'extension.js');
  const result = await esbuild.build({ ...(extensionOptions(root) as esbuild.BuildOptions), outfile: bundle, sourcemap: false, logLevel: 'silent', metafile: true });
  warnings = result.warnings;
  inputs = Object.keys(result.metafile?.inputs ?? {});
}, 120_000);

afterAll(async () => {
  await rm(outDir, { recursive: true, force: true });
});

/** A `vscode` stand-in with just what activation touches; records what the extension registers. */
function vscodeStub() {
  const registered = { commands: [] as string[], serializers: [] as string[], providers: [] as string[] };
  const disposable = { dispose() {} };
  class EventEmitter<T> {
    private readonly listeners = new Set<(value: T) => void>();
    readonly event = (listener: (value: T) => void) => {
      this.listeners.add(listener);
      return { dispose: () => this.listeners.delete(listener) };
    };
    fire(value: T) {
      for (const listener of this.listeners) listener(value);
    }
    dispose() {
      this.listeners.clear();
    }
  }
  const uri = (fsPath: string) => ({ scheme: 'file', fsPath, path: fsPath, toString: () => `file://${fsPath}` });
  const stub = {
    version: '1.140.0-stub',
    ExtensionMode: { Production: 1, Development: 2, Test: 3, 1: 'Production', 2: 'Development', 3: 'Test' },
    EventEmitter,
    Uri: { file: uri, joinPath: (base: { fsPath: string }, ...parts: string[]) => uri(path.join(base.fsPath, ...parts)) },
    window: {
      createOutputChannel: () => ({ info() {}, warn() {}, error() {}, debug() {}, trace() {}, dispose() {} }),
      registerWebviewPanelSerializer: (viewType: string) => (registered.serializers.push(viewType), disposable),
    },
    commands: { registerCommand: (id: string) => (registered.commands.push(id), disposable) },
    workspace: {
      workspaceFolders: undefined,
      registerTextDocumentContentProvider: (scheme: string) => (registered.providers.push(scheme), disposable),
      onDidChangeTextDocument: () => disposable,
      onDidSaveTextDocument: () => disposable,
    },
  };
  return { stub, registered };
}

interface LoadedExtension {
  activate: (context: unknown) => Record<string, unknown>;
  deactivate: () => Promise<void>;
}

function loadWithStub(file: string, stub: unknown): LoadedExtension {
  const id = path.join(outDir, '__vscode_stub__.js');
  const loader = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
  const original = loader._resolveFilename;
  const require = createRequire(import.meta.url);
  loader._resolveFilename = function (this: unknown, request: string, ...rest: unknown[]) {
    return request === 'vscode' ? id : original.call(this, request, ...rest);
  };
  require.cache[id] = { id, filename: id, loaded: true, exports: stub } as unknown as NodeJS.Module;
  try {
    return require(file) as LoadedExtension;
  } finally {
    loader._resolveFilename = original;
  }
}

describe('extension bundle (R2, R8; AT5.5)', () => {
  it("bundles the runner's llm/, run/, gate/, shadow/, proposal/ (and workspace/) sources and the guard module, with no import.meta left", async () => {
    for (const dir of ['llm', 'run', 'gate', 'shadow', 'proposal', 'workspace']) {
      expect(inputs.some((i) => i.includes(`runner/src/${dir}/`)), `runner/src/${dir}/ is not in the bundle`).toBe(true);
    }
    expect(inputs.some((i) => i.includes('core/src/'))).toBe(true);
    expect(inputs.some((i) => i.endsWith('runner/bin/telelean-path-guard.mjs'))).toBe(true);
    expect(warnings.filter((w) => /import\.meta/.test(w.text))).toEqual([]);
    const text = await readFile(bundle, 'utf8');
    expect(text).not.toMatch(/import\.meta/);
    expect(text).not.toMatch(/\bimport_meta\b/); // esbuild's empty stand-in (`var import_meta = {}`) when undefined
    expect(text).toMatch(/teleleanImportMetaUrl = \(0, import_node_url\d*\.pathToFileURL\)\(__filename\)\.href/);
    expect(text.split('\n')[0]).toBe('"use strict";'); // the injected constant keeps the bundle in strict mode
  });

  it('loads and activates with a stub vscode: registers the 3 commands, the board serializer and the two diff providers', async () => {
    const { stub, registered } = vscodeStub();
    const extension = loadWithStub(bundle, stub);
    const context = {
      subscriptions: [] as Array<{ dispose(): void }>,
      extensionMode: 1,
      extension: { packageJSON: { version: '0.0.1' } },
      extensionUri: stub.Uri.file(root),
      workspaceState: { get: () => undefined, update: async () => undefined },
    };
    const api = extension.activate(context);
    expect(registered.commands.sort()).toEqual(['telelean.initializeModel', 'telelean.openBoard', 'telelean.refresh']);
    expect(registered.serializers).toEqual(['telelean.board']);
    expect(registered.providers).toEqual(['telelean-history', 'telelean-proposal']);
    expect(typeof api.simulateBoardMessage).toBe('function');
    expect(typeof api.workspaceFor).toBe('function');
    expect(typeof api.runsFor).toBe('function');
    expect(api.testing).toBeUndefined(); // test hooks exist only in Test mode
    await expect(extension.deactivate()).resolves.toBeUndefined();
    for (const disposable of context.subscriptions) disposable.dispose();
  });

  it("`import.meta.url` resolves in CommonJS: the runner's default guard path computes instead of throwing", async () => {
    // A tiny bundle with the same options: confinement.ts's defaultGuardScriptPath() does
    // `new URL('../../bin/telelean-path-guard.mjs', import.meta.url)`, which throws when import.meta.url is undefined.
    const entry = path.join(outDir, 'probe-entry.ts');
    await writeFile(entry, "import { defaultGuardScriptPath } from '@telelean/runner/llm/confinement.js';\nexport const guardPath = defaultGuardScriptPath();\n");
    const probe = path.join(outDir, 'probe.cjs');
    await esbuild.build({ ...(extensionOptions(root) as esbuild.BuildOptions), entryPoints: [entry], outfile: probe, sourcemap: false, logLevel: 'silent' });
    const loaded = createRequire(import.meta.url)(probe) as { guardPath: string };
    expect(loaded.guardPath).toBe(fileURLToPath(new URL('../../bin/telelean-path-guard.mjs', pathToFileURL(probe))));
  });

  it("the build's own load check passes for the bundle (a fresh Node process, stub vscode)", () => {
    expect(checkBundleLoads(bundle)).toMatch(/exports activate and deactivate/);
  });
});

describe('the path guard in dist/bin (AT5.4)', () => {
  it('copyGuardScript puts a byte-identical copy of the runner guard in <dist>/bin/', async () => {
    const dist = path.join(outDir, 'dist');
    const copied = await copyGuardScript(dist);
    expect(copied).toBe(path.join(dist, 'bin', 'telelean-path-guard.mjs'));
    expect(await readFile(copied, 'utf8')).toBe(await readFile(GUARD_SOURCE as string, 'utf8'));
  });

  it('an M2 build of dist/extension.js also copied the guard to dist/bin/ (the path the extension passes)', async () => {
    const built = path.join(root, 'dist', 'extension.js');
    // Not built in this checkout, or still an M1 bundle (no injected import.meta.url constant): nothing to check yet.
    if (!existsSync(built) || !(await readFile(built, 'utf8')).includes('teleleanImportMetaUrl')) return;
    const guard = path.join(root, 'dist', 'bin', 'telelean-path-guard.mjs');
    expect(existsSync(guard), `${guard} is missing: run npm run build`).toBe(true);
    expect(await readFile(guard, 'utf8')).toBe(await readFile(GUARD_SOURCE as string, 'utf8'));
  });
});
