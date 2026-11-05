# r6-vscode-toolchain: R6: VS Code extension engineering, toolchain, testing, and integration with the installed Lean 4 extension on this machine (Ubuntu 24.04, snap VS Code 1.140.0, Lean 4.35.0), as of 2026-11-01

## Summary
Machine and runtime. VS Code 1.140.0 is installed as a classic snap (rev 267, commit 07f806f9). It runs extensions on Node 24.21.0 inside Electron 43.7.3 with Chromium 150. I confirmed this by running the installed binary with ELECTRON_RUN_AS_NODE=1, and VS Code's 1.140.0 repo pins the same versions. Missing: Node, npm, pnpm, and xvfb. Present: Google Chrome 155 at /opt/google/chrome/chrome, xauth, gnome-keyring/libsecret, Lean 4.35.0, elan 4.2.3, lake 5.0.0, leanprover.lean4 0.0.240 (the latest release), and the Claude Code 2.1.314 binary, which runs. As of 2026-11-01:
- Node 26.13.0 has been Active LTS since 2026-10-28.
- Node 24.22.2 (LTS 'Krypton', supported until 2028-04-30) matches the extension host's major version, and the official generator-code pins @types/node 24.x. Recommendation: Node 24.22.2 from the official tarball into ~/.local/opt, symlinked into ~/.local/bin. The 24.22.2 tarball bundles npm 11.19.1 and corepack. The Node 26 tarball no longer includes corepack.
- TypeScript's npm 'latest' is 7.0.2, the native Go port. It has no classic JS API, and typescript-eslint 8.72.1 requires typescript <6.1.0. Use TypeScript 6.0.3, which generator-code also pins. TS 6 defaults to types: [], so every package must list its global types ('node', 'vscode-webview').

Toolchain:
- npm workspaces, not pnpm. vsce 4.1.0 only detects dependencies through npm or yarn, so with pnpm you would have to package with --no-dependencies anyway.
- Packages: core (pure TS, consumed as source), extension, webview, cli, plus Lean fixtures.
- esbuild 0.28.2 builds the extension host (CJS, platform node, target node24, external vscode). Vite 8.3.5 builds the webview; it is Rolldown-based, so use build.rolldownOptions with target chrome150 and emit into the extension's dist/webview.
- Pin "@types/vscode": "1.140.0" against engines.vscode ^1.140.0. vsce refuses to package if the types are newer, and @types/vscode 1.144.0 is already out because VS Code now ships roughly weekly.
- Package with vsce 4.1.0 --no-dependencies, then install with `code --install-extension`. The snap CLI works.
- Lint with ESLint 10.14 and typescript-eslint 8.72.1.

Testing:
- Unit tests: vitest 5.0.5.
- Integration tests: @vscode/test-cli 0.0.15 with @vscode/test-electron 3.1.0. The first run downloads VS Code 1.140.0 (a 349 MB tar.gz) into .vscode-test/ and launches it with its own user-data and extensions directories. It needs a display: DISPLAY=:0 exists, so test windows will pop up on the desktop. Headless runs need `sudo apt install xvfb` and then `xvfb-run -a`.
- ELECTRON_RUN_AS_NODE=1 leaks into every process spawned from the VS Code extension host, including Claude Code's shell, and test-electron passes it through. Run tests as `env -u ELECTRON_RUN_AS_NODE npm test`.
- Webview UI tests: Playwright 1.64.1 with channel 'chrome' uses the installed Chrome, so nothing is downloaded. The alternatives are a 126 MB headless shell or the full Chrome for Testing build plus shell (about 328 MB of zips).
- Lean fixtures pinned to v4.35.0 build in under 1 s. `lake env lean --json` prints one JSON object per diagnostic. `#print axioms` lists the axioms behind each derivation, which gives the 'derivation uses only assumptions' check.

Lean integration:
- The Lean extension exports { alwaysEnabledFeatures, lean4EnabledFeatures: Promise<{clientProvider, infoProvider, projectOperationProvider}> }. These are internal, untyped classes.
- The promise resolves only after a Lean editor is shown, and never resolves if the extension's setup checks fail.
- LeanClient.sendRequest exposes $/lean/plainGoal, $/lean/rpc/call and the other custom methods. Its customNotification event carries $/lean/fileProgress.
- Diagnostics go into a real DiagnosticCollection named 'lean4', with isSilent entries filtered out. So vscode.languages.getDiagnostics and onDidChangeDiagnostics work, but only for files the server has open: the Lean server elaborates only didOpen'ed files.
- I verified a headless `lake serve` client from Python, which completed in 1.5 s. It exercised initialize, waitForDiagnostics, plainGoal (returned '⊢ 1 = 2'), documentSymbol, and rpc/connect (the sessionId comes back as a JSON string). Recommendation: run your own `lake build` / `lake serve` for whole-project status and for checking proposals; treat the Lean extension's API as an optional extra.
- VS Code APIs I confirmed:
  - vscode.diff, and vscode.changes(title, [[label, original|undefined, modified|undefined], ...]) for the multi-file diff editor.
  - registerWebviewPanelSerializer, which needs an onWebviewPanel activation event.
  - WorkspaceEdit.createFile({contents}). If any edit carries needsConfirmation metadata, VS Code opens its Refactor Preview before applying.
  - SecretStorage.keys(), and the lm/chat/MCP APIs.
- The snap leaks SNAP*, GTK_PATH, LOCPATH, GIO_MODULE_DIR, snap-prefixed XDG_DATA_DIRS and ELECTRON_RUN_AS_NODE into child processes, and some of the *_VSCODE_SNAP_ORIG backup copies are missing. Children need an env sanitizer; a sketch is in the findings.
- Locate claude in this order: setting, PATH, ~/.local/bin/claude, getExtension('anthropic.claude-code').extensionPath + '/resources/native-binary/claude'. Do not use --bare with a subscription, because it never reads OAuth.

The harness refused to let me write REPORT.md ("Subagents should return findings as text"), so the whole report is in the fields below. The reusable scratch artifacts (Lean fixture, LSP probe script, npm metadata, extracted tarballs) were created and are listed in report_path.

## Recommendations
- **Node.js version and install method** → Install Node 24.22.2 LTS (Krypton) from the official tarball, without sudo:

mkdir -p ~/.local/opt ~/.local/bin && cd ~/.local/opt && curl -fsSLO https://nodejs.org/dist/v24.22.2/node-v24.22.2-linux-x64.tar.xz && curl -fsSL https://nodejs.org/dist/v24.22.2/SHASUMS256.txt | grep ' node-v24.22.2-linux-x64.tar.xz$' | sha256sum -c - && tar -xJf node-v24.22.2-linux-x64.tar.xz && ln -sfn node-v24.22.2-linux-x64 node && for b in node npm npx corepack; do ln -sfn ~/.local/opt/node/bin/$b ~/.local/bin/$b; done

Also commit a .node-version file containing 24.22.2.
  - rationale: VS Code 1.140 runs extensions on Node 24.21.0 and builds with Node 24.18.0. generator-code pins @types/node 24.x, and every tool's engines accept 24.22.2. The tarball needs no shell hooks, and ~/.local/bin is already on PATH. Node 24 is supported until 2028-04-30.
  - alternatives: Node 26.13.0 (Active LTS, but a different major from the ext host and without corepack). fnm 1.39.0 or mise, which need shell hooks. nvm 0.40.8, which slows shell startup. Volta is unmaintained.
- **Package manager / repo structure** → Use npm 11.19.1 workspaces. The root package.json is private with "workspaces": ["packages/*"]. Packages:
- packages/core (@telelean/core): pure TS, exports './src/index.ts' plus a './node' subpath for child_process helpers.
- packages/extension (telelean): all libraries in devDependencies, bundled.
- packages/webview (@telelean/webview): Vite app.
- packages/cli (@telelean/cli): bundled CLI.

Add test-fixtures/lean/* pinned to v4.35.0. Depend on core with a semver range (npm symlinks it).
  - rationale: vsce supports only npm/yarn dependency detection, and pnpm gives little benefit for four packages. A source-only core avoids build-order complexity because every consumer bundles it. Keeping Node-only code behind a subpath keeps child_process out of the webview bundle.
  - alternatives: pnpm 12.16.1, which forces vsce --no-dependencies and a separate install. A single-package layout, which is harder to reuse for the CLI and scripts.
- **Build tooling** → Extension host and CLI: esbuild 0.28.2 with esbuild.context({entryPoints:['src/extension.ts'], bundle:true, format:'cjs', platform:'node', target:'node24', outfile:'dist/extension.js', external:['vscode'], sourcemap:!production, sourcesContent:false, minify:production}). Bundle the CLI as ESM with a shebang.

Webview: Vite 8.3.5 with build:{outDir:'../extension/dist/webview', emptyOutDir:true, target:'chrome150', cssCodeSplit:false, modulePreload:false, sourcemap:true, rolldownOptions:{output:{entryFileNames:'webview.js', assetFileNames:'webview[extname]'}}}. Use a single entry with no dynamic import.

The extension generates HTML with CSP "default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource};" and loads asWebviewUri(dist/webview/webview.js) as type=module with the nonce.

Type-check with `tsc --noEmit`. Develop with `vite build --watch` plus 'Developer: Reload Webviews'.
  - rationale: This matches the official bundling guide and generator template. Vite 8 renamed rollupOptions to rolldownOptions. Webviews run Chromium 150. Fixed asset names make host-side HTML generation trivial.
  - alternatives: webpack (generator template variant). A Vite dev server with HMR inside the webview, which needs localhost CSP exceptions. Rolldown or tsdown directly.
- **TypeScript version and tsconfig** → Pin typescript 6.0.3. In a tsconfig.base.json use target ES2024, lib ES2024, module 'preserve', moduleResolution 'bundler', noEmit true, strict true, skipLibCheck true. Every package must set explicit 'types': ['node'] for core/cli/extension, ['node','mocha'] for extension tests, and ['vscode-webview'] for the webview, which also needs lib DOM and jsx react-jsx if React is used. Avoid baseUrl and use 'paths' only if needed.
  - rationale: typescript@7.0.2 is the native port without the classic JS API, and typescript-eslint 8.72.1 requires typescript <6.1.0. TS 6 defaults types to [], so global declarations such as acquireVsCodeApi vanish unless listed.
  - alternatives: Run TS 7 for type-checking side by side, aliased as an npm package, and keep TS 6 for eslint. Revisit once typescript-eslint supports 7.
- **engines / @types/vscode** → Use "engines": {"vscode": "^1.140.0"} and "devDependencies": {"@types/vscode": "1.140.0"} as an exact pin in packages/extension/package.json. Also set extensionKind ['workspace'], capabilities {untrustedWorkspaces: {supported: false, description}, virtualWorkspaces: false}, and activationEvents ['onWebviewPanel:telelean.map', 'workspaceContains:**/lakefile.toml', 'workspaceContains:**/lakefile.lean'].
  - rationale: vsce errors if @types/vscode is newer than engines (1.144.0 already exists). The extension spawns lake and an LLM agent, so it must not run in untrusted or virtual workspaces. The serializer requires the onWebviewPanel activation event.
  - alternatives: Lower engines, for example ^1.120.0, with matching @types, if wider compatibility matters. It does not here.
- **Packaging and installing** → From packages/extension run `npx vsce package --no-dependencies`, then `code --install-extension telelean-<v>.vsix`, then 'Developer: Reload Window'. Use the template .vscodeignore plus esbuild.mjs. Keep dist/webview/** included. For iteration, use F5 'Run telelean' (extensionHost, args ['--extensionDevelopmentPath=${workspaceFolder}/packages/extension', '${workspaceFolder}/mental_model'], outFiles packages/extension/dist/**/*.js, preLaunchTask ${defaultBuildTask}).
  - rationale: Everything is bundled, so vsce should not walk node_modules. The snap code CLI supports --install-extension with a path. F5 launches the same snap binary with the user's Lean and Claude extensions.
  - alternatives: 'Developer: Install Extension from Location…' (workbench.extensions.action.installExtensionFromLocation) or 'Extensions: Install from VSIX…'.
- **Unit and integration test setup** → Unit tests: vitest 5.0.5 for core, CLI and webview logic (jsdom 30.1.3 or happy-dom 21.0.4 for DOM).

Integration tests: @vscode/test-cli 0.0.15 with @vscode/test-electron 3.1.0 and mocha (ui tdd), configured in packages/extension/.vscode-test.mjs as defineConfig({label:'integration', files:'out/test/**/*.test.js', version:'1.140.0', workspaceFolder:'../../test-fixtures/lean/basic', installExtensions:['leanprover.lean4@0.0.240'], mocha:{ui:'tdd', timeout:60000}}). Add a second config with version 'stable' for regression checks.

Always run integration tests as `env -u ELECTRON_RUN_AS_NODE npm test -w packages/extension`, either on the real display or with `xvfb-run -a` if xvfb gets installed. Add .vscode-test/ to .gitignore. The first run downloads 349 MB.
  - rationale: This is the officially recommended tooling. Pinning the version matches the engines minimum and keeps the cache stable. ELECTRON_RUN_AS_NODE=1 leaks into agent shells and test-electron passes it through. The separate user-data-dir lets tests run beside the user's VS Code.
  - alternatives: useInstallation.fromPath with the snap binary to skip the download (uncertain). vscode-extension-tester 8.28.1 or wdio-vscode-service 8.0.0 for full-UI tests.
- **Webview UI tests** → Use @playwright/test 1.64.1 in packages/webview with use:{channel:'chrome', headless:true} and webServer `npx vite preview --port 4173 --strictPort`. Mock acquireVsCodeApi via page.addInitScript and drive host-to-webview messages with window.postMessage. Keep an index.html harness with --vscode-* CSS variable snapshots.
  - rationale: Installed Chrome 155 is at /opt/google/chrome/chrome, which is exactly the path Playwright's 'chrome' channel uses on Linux, so nothing is downloaded. Headless needs no display.
  - alternatives: `npx playwright install chromium --only-shell` (about 126 MB) or the full chromium (about 328 MB of zips). Vitest browser mode with @vitest/browser-playwright 5.0.5.
- **Lean-side tests** → Keep fixture Lake projects in test-fixtures/lean/<case>/ with lean-toolchain 'leanprover/lean4:v4.35.0' and a lakefile.toml. From vitest, spawn ~/.elan/bin/lake with the sanitized env: `lake build` (exit code plus 'error: file:line:col:' lines), `lake env lean --json <file>` for structured diagnostics, and #print axioms for derivation-purity checks. Optionally drive `lake serve` for didOpen + textDocument/waitForDiagnostics + $/lean/plainGoal. Gitignore .lake/.
  - rationale: All of these were verified locally and run in under 1-2 s on small fixtures. Pinning to the installed toolchain prevents elan downloads.
  - alternatives: Parsing .lake/build/**/*.trace logs (internal format, not recommended).
- **Lean extension integration strategy** → Primary: vscode.languages.getDiagnostics/onDidChangeDiagnostics for files open in the editor (stable API), plus telelean's own `lake build` / `lake env lean --json` / optional `lake serve` client for whole-project status and proposal checking (shadow copy or temp files).

Optional enhancement: leanprover.lean4 exports, used only as getExtension('leanprover.lean4') then activate(), then Promise.race(lean4EnabledFeatures, timeout), then clientProvider.getClients() and client.sendRequest('$/lean/plainGoal', ...) / customNotification for $/lean/fileProgress. Make it a soft dependency (no extensionDependencies) and feature-detect at runtime.
  - rationale: The exports are internal and untyped. lean4EnabledFeatures resolves only after a Lean editor is visible, or never if setup fails. The server elaborates only opened files. A headless lake serve was verified to work.
  - alternatives: A hard extensionDependencies on leanprover.lean4 (test-cli then auto-installs it and even-better-toml). Custom @[server_rpc_method] RPC functions in the user's Lean project, queried through $/lean/rpc/call.
- **Proposal display and acceptance UI (VS Code side)** → Serve proposed file contents through a 'telelean-proposal' scheme: TextDocumentContentProvider if read-only, FileSystemProvider if the user should be able to edit proposals. Show one file with vscode.diff(fileUri, proposalUri, title) and the whole proposal with vscode.changes(title, files.map(f => [f.uri, f.exists ? f.uri : undefined, proposalUri(f)])). Accept through a WorkspaceEdit (replace / createFile with contents) and workspace.applyEdit(edit, {isRefactoring:true}) so undo works. Set needsConfirmation: true on entries to get VS Code's Refactor Preview for per-change accept and reject.
  - rationale: All of these APIs and behaviours were verified in 1.140. Virtual non-file documents are not sent to the Lean server, so no spurious elaboration happens.
  - alternatives: Write proposals to a shadow directory on disk and diff file:// URIs, which also allows lake build of the shadow copy.
- **Spawning lake / claude from the extension host** → Use spawn(cmd, args, {cwd: projectRoot, env: childEnv(), shell: false}). childEnv() restores *_VSCODE_SNAP_ORIG, strips ELECTRON_*, SNAP*, VSCODE_* (with VS Code's exceptions), GDK_PIXBUF_*, GTK_PATH, LOCPATH, GIO_MODULE_DIR, GSETTINGS_SCHEMA_DIR, GTK_EXE_PREFIX and GTK_IM_MODULE_FILE when they point into /snap, filters /snap/code entries out of XDG_*_DIRS, and prepends ~/.elan/bin. For agent processes use detached:true and kill the process group on cancel, and parse stream-json line by line.
  - rationale: I verified that the snap leaks these variables and ELECTRON_RUN_AS_NODE=1 into children, and that VS Code sanitizes them only for its own terminals and tasks.
  - alternatives: Pass process.env unchanged. lake, lean and claude mostly tolerate it, but GUI and Electron children break.
- **Binary discovery** → lake lookup order: setting telelean.lake.path, then ~/.elan/bin/lake (elan proxy, honours lean-toolchain), then 'lake' on PATH. Before running, verify that the project's lean-toolchain appears in `elan toolchain list`.

claude lookup order: setting telelean.claude.path, then 'claude' on PATH, then ~/.local/bin/claude, then vscode.extensions.getExtension('anthropic.claude-code')?.extensionPath + '/resources/native-binary/claude', then a semver-sorted glob of ~/.vscode/extensions/anthropic.claude-code-*-linux-x64/resources/native-binary/claude. Never pass --bare when relying on the subscription. If the Agent SDK is used, pin its version to match the CLI (0.3.N ↔ 2.1.N) and pass pathToClaudeCodeExecutable.
  - rationale: The Claude extension directory name embeds version and platform and changes on auto-update, while getExtension().extensionPath always points at the active one. The native installer uses ~/.local/bin/claude. --bare never reads OAuth.
  - alternatives: Install the native CLI with `curl -fsSL https://claude.ai/install.sh | bash` so that ~/.local/bin/claude exists and auto-updates independently of the VS Code extension.
- **Linting / UI kit** → Lint with ESLint 10.14.0 flat config, @eslint/js 10.0.1 and typescript-eslint 8.72.1 (recommended config). Prettier 3.9.10 is optional. For VS Code-styled controls in the webview use @vscode-elements/elements 2.5.1 or @vscode-elements/react-elements 2.4.0 plus @vscode/codicons, not the deprecated @vscode/webview-ui-toolkit.
  - rationale: These versions are current and mutually compatible with TS 6.0.3. The toolkit is deprecated on npm, and the Lean infoview itself uses vscode-elements.
  - alternatives: Biome 2.6.4, a single binary for lint and format that is independent of the TS JS API.
- **Scaffold commands (after approval, in /home/zhengyew/telelean)** → printf '24.22.2\n' > .node-version && npm init -y && npm pkg set private=true --json && npm pkg set 'workspaces[0]=packages/*' && for p in core extension webview cli; do npm init -y -w packages/$p; done && npm pkg set name=@telelean/core -w packages/core && npm pkg set name=telelean -w packages/extension && npm pkg set name=@telelean/webview -w packages/webview && npm pkg set name=@telelean/cli -w packages/cli

npm i -D -E typescript@6.0.3 @types/node@24.19.2 esbuild@0.28.2 vitest@5.0.5 eslint@10.14.0 @eslint/js@10.0.1 typescript-eslint@8.72.1 npm-run-all2@9.0.4

npm i -D -E -w packages/extension @types/vscode@1.140.0 @vscode/test-cli@0.0.15 @vscode/test-electron@3.1.0 @types/mocha@10.0.10 @vscode/vsce@4.1.0

npm i -D -E -w packages/webview vite@8.3.5 @vitejs/plugin-react@6.1.2 @types/vscode-webview@1.57.5 @playwright/test@1.64.1 (plus the chosen UI framework and graph libs)

npm i -E -w packages/core yaml@2.9.1 zod@4.6.7 diff@9.0.0

npm i -w packages/extension -w packages/cli -w packages/webview @telelean/core

mkdir -p test-fixtures/lean/basic && printf 'leanprover/lean4:v4.35.0\n' > test-fixtures/lean/basic/lean-toolchain
  - rationale: Exact versions are the latest on 2026-11-01 that are mutually compatible. Installs are project-local, with no global tools.
  - alternatives: `npx yo code` (yo 7.0.1 with generator-code 1.12.0) for the extension package skeleton, then move it into packages/extension.

## Design decisions for user
- **Q:** Should integration tests run headlessly? Running headless requires `sudo apt install xvfb`. The alternative is to accept VS Code test windows popping up on your desktop.
  - why: Electron needs a display. Without xvfb, every integration-test run, including runs started by the coding agent, opens a VS Code window on your Wayland desktop.
  - options: (a) sudo apt install xvfb; (b) run on DISPLAY=:0 with visible windows; (c) rely only on vitest and Playwright tests and run integration tests manually
  - recommended: Install xvfb with one sudo command, so the agent can run `env -u ELECTRON_RUN_AS_NODE xvfb-run -a npm test` without disturbing you.
- **Q:** How deeply should telelean depend on the Lean 4 extension's internal API (exports.lean4EnabledFeatures.clientProvider), as opposed to running its own lake build / lake serve processes?
  - why: The Lean extension's API is undocumented and can break on updates. It is only available after a Lean editor is shown, and its server elaborates only open files. Running separate processes costs extra CPU and RAM, especially with Mathlib, but works headlessly and lets proposals be checked before they touch your files.
  - options: (a) own processes plus stable diagnostics (recommended); (b) depend on the Lean extension client for everything; (c) a hybrid with feature detection
  - recommended: Make telelean's own lake build / lean --json / optional lake serve the source of truth. Use stable vscode.languages diagnostics for open editors, and use the Lean extension's client only as an optional extra, for example to jump to goals.
- **Q:** Should leanprover.lean4 be a hard dependency (package.json extensionDependencies) or a soft one detected at runtime?
  - why: A hard dependency guarantees the Lean extension is installed and activated first. It also auto-installs it, plus tamasfe.even-better-toml, in test instances from the Marketplace. A soft dependency keeps telelean usable with only lake, and makes tests faster and offline-capable.
  - options: (a) soft (recommended); (b) hard extensionDependencies; (c) list it in an extensionPack
  - recommended: Soft dependency with feature detection. Document that the Lean 4 extension is recommended.
- **Q:** How should telelean call Claude? Options are the Claude Agent SDK (pinned to the CLI version, with pathToClaudeCodeExecutable pointing at the VS Code extension's binary) or spawning the claude CLI directly with -p --input-format/--output-format stream-json.
  - why: Both use your subscription OAuth. Never pass --bare: it disables OAuth. The SDK adds types and conveniences, but the auto-updating binary can drift from the SDK version (0.3.N ↔ 2.1.N), and npm pulls a 328 MB optional binary into node_modules. Direct spawning has fewer moving parts, but you hand-roll the protocol.
  - options: (a) Agent SDK with pathToClaudeCodeExecutable; (b) direct CLI stream-json; (c) install the native CLI (~/.local/bin/claude) so it updates independently of the VS Code extension
  - recommended: Decide together with the LLM-integration research. From a toolchain view, either works. Reuse the existing binary through extensionPath discovery, and pin or check versions at startup.
- **Q:** Should the markup tooling be an LSP server or a core library plus CLI (with in-process VS Code providers)?
  - why: You asked whether LSP is the right design. Technically a TS language server would run on VS Code's bundled Node via TransportKind.ipc, so no system Node is needed at runtime, and VS Code supports a second server for lean4 documents. But LSP is document-centric. Graph-analysis scripts need whole-graph queries, which a library plus a CLI emitting JSON serves better.
  - options: (a) core plus CLI now, LSP later (recommended); (b) LSP from day one; (c) extension-only logic
  - recommended: Build @telelean/core first, as the single source of truth for the @@ telelean grammar and graph model. Use it in-process in the extension (CodeLens, diagnostics, symbols) and expose it through the `telelean` CLI (JSON output, possibly an MCP server for the LLM). Wrap it in an LSP later only if other editors need it.
- **Q:** Should the user be able to edit an LLM proposal before accepting it, and should acceptance be per-file or per-change?
  - why: This decides between a read-only TextDocumentContentProvider and a writable in-memory FileSystemProvider for proposal documents. It also decides whether to use VS Code's built-in Refactor Preview (WorkspaceEditEntryMetadata.needsConfirmation) for per-change checkboxes.
  - options: (a) read-only diff with all-or-nothing accept; (b) editable proposals; (c) per-change Refactor Preview
  - recommended: Writable proposal documents (FileSystemProvider), the vscode.changes multi-diff for review, and needsConfirmation edits so you can uncheck individual changes in Refactor Preview. Everything stays undoable through WorkspaceEdit.
- **Q:** Where should the map UI live: an editor-area WebviewPanel tab, or a docked WebviewView (sidebar or bottom panel)?
  - why: The three-column map needs space. A panel tab can be moved and split, and it restores after reload through registerWebviewPanelSerializer plus onWebviewPanel activation. A docked view is always visible but narrow. Both can share the same Vite bundle.
  - options: (a) WebviewPanel; (b) WebviewView in activity bar or panel; (c) both, sharing one bundle
  - recommended: An editor-area WebviewPanel as the main map, plus an optional small WebviewView or command for the prompt box.

## Software needed
- Node.js (bundles npm 11.19.1 and corepack 0.36.0) 24.22.2 (LTS Krypton) — Build, test, package (vsce), and the CLI runtime. Same major as VS Code 1.140's extension host (Node 24.21.0). — install: No sudo: mkdir -p ~/.local/opt ~/.local/bin && cd ~/.local/opt && curl -fsSLO https://nodejs.org/dist/v24.22.2/node-v24.22.2-linux-x64.tar.xz && curl -fsSL https://nodejs.org/dist/v24.22.2/SHASUMS256.txt | grep ' node-v24.22.2-linux-x64.tar.xz$' | sha256sum -c - && tar -xJf node-v24.22.2-linux-x64.tar.xz && ln -sfn node-v24.22.2-linux-x64 node && for b in node npm npx corepack; do ln -sfn ~/.local/opt/node/bin/$b ~/.local/bin/$b; done   (expected sha256 48cc0e21e048790e54c0cf5749c2725005313d652651c40b7a21feb9697aaf75) — required=True
- Project devDependencies (local, via npm) typescript 6.0.3; @types/node 24.19.2; @types/vscode 1.140.0; esbuild 0.28.2; vite 8.3.5; @vitejs/plugin-react 6.1.2 (if React); vitest 5.0.5; @vscode/test-cli 0.0.15; @vscode/test-electron 3.1.0; @types/mocha 10.0.10; @vscode/vsce 4.1.0; @playwright/test 1.64.1; eslint 10.14.0; @eslint/js 10.0.1; typescript-eslint 8.72.1; npm-run-all2 9.0.4; @types/vscode-webview 1.57.5; runtime libs yaml 2.9.1, zod 4.6.7, diff 9.0.0 — Compile, bundle, lint, unit, integration and webview tests, and packaging. Nothing is installed globally. — install: `npm install` in the repo (see the scaffold commands in recommendations) — required=True
- VS Code test build 1.140.0 linux-x64 (348,920,118-byte tar.gz) — Instance used by @vscode/test-electron for integration tests, with its own user-data and extensions directories — install: Downloaded automatically into packages/extension/.vscode-test/ on the first `env -u ELECTRON_RUN_AS_NODE npm test` — required=True
- xvfb 2:21.1.12-1ubuntu1.9 (Ubuntu noble-updates) — Headless extension integration tests via `xvfb-run -a`. Without it, tests use DISPLAY=:0 and show windows. — install: sudo apt install xvfb — required=False
- Playwright Chromium headless shell Chrome for Testing 156.0.8078.4 (r1248), about 126 MB zip — Only needed if the installed Google Chrome 155 (channel 'chrome') is not used for webview tests — install: npx playwright install chromium --only-shell — required=False
- VS Code dev-convenience extensions latest — ESLint integration, the $esbuild-watch problem matcher used by template tasks.json, and the Test Explorer for vscode-test — install: code --install-extension dbaeumer.vscode-eslint && code --install-extension connor4312.esbuild-problem-matchers && code --install-extension ms-vscode.extension-test-runner — required=False
- @anthropic-ai/claude-agent-sdk 0.3.314 (pairs with installed CLI 2.1.314) or latest 0.3.316 — Optional typed harness around the Claude Code CLI (subscription auth). Pass pathToClaudeCodeExecutable to reuse the VS Code extension's binary. — install: npm i -E -w packages/extension @anthropic-ai/claude-agent-sdk@0.3.314 zod@4.6.7 (bundled by esbuild; the 328 MB optional platform binary stays in node_modules only) — required=False
- Already installed (verified) Lean 4.35.0, elan 4.2.3, lake 5.0.0; VS Code 1.140.0 snap; leanprover.lean4 0.0.240; anthropic.claude-code 2.1.314 (native binary); Google Chrome 155.0.8059.39; git 2.43; python3 3.12.3; xauth; gnome-keyring/libsecret — Lean toolchain, editor, Lean language features, Claude subscription access, headless browser for tests, keyring for SecretStorage — install: already present, no action — required=True

## Risks
- The Lean extension's exported API is internal: untyped, minified, and free to change in any release. lean4EnabledFeatures resolves only after a Lean editor is visible, and never if setup checks are Fatal. Any dependency on it must be optional and protected by a timeout.
- The Lean server elaborates only didOpen'ed files. Editor diagnostics therefore never give whole-project or proposal status, so telelean must run its own lake build / lean --json / lake serve, at extra CPU and memory cost (a separate server process per project).
- VS Code now ships about weekly (1.144.0 is already out) and the snap auto-refreshes. Behaviour of unpinned internals (vscode.changes, Refactor Preview routing) could shift. Pin engines and @types to 1.140 and keep a 'stable' integration-test config.
- ELECTRON_RUN_AS_NODE=1 and snap GTK, LOCPATH and SNAP* variables leak into every child of the extension host, including agent shells. Integration tests run from such shells fail unless the variable is unset, and GUI or Electron children misbehave without env sanitization.
- xvfb is not installed and installing it needs sudo. Until then, extension integration tests open visible VS Code windows on the user's desktop.
- TypeScript 7.0.2 is npm 'latest', but typescript-eslint caps support below 6.1.0. An accidental `npm i -D typescript` without a version pin would install 7 and break linting.
- If the Agent SDK is used together with the VS Code extension's auto-updating claude binary, versions can skew (SDK 0.3.N pairs with CLI 2.1.N). npm also downloads the 328 MB optional platform binary into node_modules, although it does not end up in the vsix.
- elan silently downloads any missing toolchain named in a lean-toolchain file. Fixtures or user projects that do not name an installed version cause long, unannounced downloads.
- Column units differ. lean --json reports 1-based lines and 0-based columns, which I believe are codepoints. LSP and VS Code use UTF-16, so ranges for non-BMP characters could be off unless converted.
- The first integration-test run downloads 349 MB (VS Code 1.140.0). Playwright's own browsers would add 126-328 MB if the installed Chrome were not used.
- I could not write REPORT.md because the harness blocks subagent report files. Later agents must rely on this structured output and on the scratch artifacts (lean-fixture/, scripts/lsp_probe.py).

## Open questions
- Do Lean-specific fields that the Lean extension attaches to vscode.Diagnostic objects (leanTags, fullRange, isSilent) reach other extensions through vscode.languages.getDiagnostics? This is untested; a quick integration test would answer it.
- Can @vscode/test-cli useInstallation.fromPath point at the snap binary (/snap/code/current/usr/share/code/code) and run tests outside the snap launcher, avoiding the 349 MB download? Unverified.
- Are lean --json columns codepoints or UTF-16 units? Test with non-BMP characters before mapping them to VS Code ranges.
- Does ELECTRON_RUN_AS_NODE=1 come from the extension host's own process.env, or is it added by the Claude Code extension when spawning? Either way the mitigation is the same: unset it for Electron children.
- Does VS Code 1.140 support ESM extension entry points? The official template still emits CJS, which is the safe choice, so this is not blocking.
- Will the downloaded VS Code test build run correctly under the user's Wayland session through XWayland (DISPLAY=:0)? Expected yes, because Chrome and the snap VS Code already run, but not executed here because running downloaded code was disallowed in this research step.
- Which UI framework and graph library for the webview (React with @xyflow/react 12.12.0, Svelte, Lit/vscode-elements)? This is outside R6 and decided by the UI research topic. The Vite and Playwright setup works with any of them.

## Findings
- [verified-locally] [Env] The installed VS Code is 1.140.0, snap rev 267, classic confinement, base core20, commit 07f806f999227108933c2e30515b26eecc1fda74, product date 2026-09-30. Its runtime is Node 24.21.0, Electron 43.7.3, Chromium 150.0.7871.250, V8 15.0.245.31-electron.0, modules ABI 148, napi 10.
  - evidence: Commands run: `snap list`, `code --version` (prints 1.140.0 / 07f806f9... / x64), /snap/code/current/usr/share/code/resources/app/{package.json,product.json}, and `ELECTRON_RUN_AS_NODE=1 /snap/code/current/usr/share/code/code -p 'JSON.stringify(process.versions)'`. The snap's meta/snap.yaml runs `electron-launch $SNAP/usr/share/code/bin/code --no-sandbox`, and electron-launch ends with `exec "$@" --ozone-platform=x11`, so VS Code runs on XWayland.
  - source: /snap/code/current/...
- [documented] [Env] VS Code 1.140.0's own repo pins Electron 43.7.3, remote/server Node 24.21.0, and build Node 24.18.0.
  - evidence: .npmrc has target="43.7.3" runtime=electron. remote/.npmrc has target="24.21.0". .nvmrc has 24.18.0.
  - source: https://raw.githubusercontent.com/microsoft/vscode/1.140.0/.npmrc ; .../remote/.npmrc ; .../.nvmrc
- [documented] [Env] VS Code stable now ships about weekly. The latest stable is 1.144.0, and @types/vscode 1.144.0 (2026-10-28) exists. The snap auto-refreshes, so the user will soon run a version newer than 1.140.
  - evidence: The releases API returns ["1.144.0","1.143.1","1.143.0","1.142.0","1.141.2",...,"1.140.0",...]. @types/vscode publish times include 1.140.0 on 2026-10-01 and 1.144.0 on 2026-10-28.
  - source: https://update.code.visualstudio.com/api/releases/stable ; https://registry.npmjs.org/@types/vscode
- [verified-locally] [Env] Not installed: node, npm, npx, pnpm, yarn, bun, deno, docker, podman, pip, claude on PATH, xvfb/xvfb-run/Xvfb. Installed: xauth, google-chrome-stable 155.0.8059.39 (/opt/google/chrome/chrome), Firefox (snap wrapper), gnome-keyring 46.1, libsecret 0.21.4, and the Electron runtime libs (libnss3, libgbm1, libgtk-3-0t64, libasound2t64, libxkbfile1, libxss1). apt offers xvfb 2:21.1.12-1ubuntu1.9, which needs sudo. The session is Wayland with DISPLAY=:0 and WAYLAND_DISPLAY=wayland-0. glibc is 2.39 and 550 GB of disk is free.
  - evidence: `command -v` loop, `dpkg -l`, `apt-cache policy xvfb`, `google-chrome --version`, `env`, `ldd --version`, `df -h`.
  - source: local shell
- [verified-locally] [Env] This agent's process is a child of the VS Code extension host: systemd -> code(630165) -> code(637453, --type=utility node.mojom.NodeService) -> claude(645458) -> bash. Its environment is therefore what any child spawned by a VS Code extension inherits, plus some CLAUDE_* variables.
  - evidence: `pstree -s -p $$`, and `ps`/`/proc/<pid>/cmdline` for 637453 and 645458.
  - source: local /proc
- [documented] [Node] Release lines on 2026-11-01:
- v26.13.0 'Lithium': Active LTS since 2026-10-28, EOL 2029-04-30, npm 11.20.0.
- v24.22.2 'Krypton': Maintenance LTS since 2026-10-20, EOL 2028-04-30, npm 11.19.1.
- v22.23.4 'Jod': Maintenance LTS, EOL 2027-04-30.
- v20: EOL since 2026-04-30.
- v27.0.0-alpha.0: released 2026-10-29 under the new alpha channel; stable release 2027-04-22.
  - evidence: Parsed nodejs.org/dist/index.json (latest per major, lts field, npm field) and the nodejs/Release schedule.json.
  - source: https://nodejs.org/dist/index.json ; https://raw.githubusercontent.com/nodejs/Release/main/schedule.json
- [verified-locally] [Node] node-v24.22.2-linux-x64.tar.xz:
- Size 32,039,312 bytes.
- sha256 48cc0e21e048790e54c0cf5749c2725005313d652651c40b7a21feb9697aaf75, matching SHASUMS256.txt.
- Contains bin/{node,npm,npx,corepack}, npm 11.19.1 and corepack 0.36.0.

node-v26.13.0-linux-x64.tar.xz:
- Size 34,083,252 bytes.
- sha256 d28a96af6c38596f6d9d97c0ee531c13d238d757742387d1928de822d959e997.
- Contains bin/{node,npm,npx} and npm 11.20.0, with no corepack.
  - evidence: I downloaded both tarballs into the scratch dir (not executed), ran sha256sum, listed them with `tar -tJf`, and read the bundled npm/corepack package.json with `tar -xJOf`.
  - source: https://nodejs.org/dist/v24.22.2/ ; https://nodejs.org/dist/v26.13.0/
- [documented] [Node] Version managers on 2026-11-01:
- nvm v0.40.8 (2026-09-21).
- fnm v1.39.0 (2026-03-06).
- Volta v2.0.2 (2024-12-05). Its README says 'Volta is unmaintained' and 'We recommend migrating to mise'.
- mise v2026.10.25.

Node 25 and later no longer ship corepack.
  - evidence: GitHub API releases/latest for each repo, the Volta README, and the OpenReplay article on corepack.
  - source: https://api.github.com/repos/{nvm-sh/nvm,Schniz/fnm,volta-cli/volta,jdx/mise}/releases/latest ; https://github.com/volta-cli/volta ; https://blog.openreplay.com/manage-package-managers-node-corepack/
- [documented] [Node] Every planned tool accepts Node 24.22.2. Engine ranges:
- vitest 5.0.5: ^22.12.0 || ^24.0.0 || >=26.0.0
- @vscode/test-cli 0.0.15 and @vscode/test-electron 3.1.0: >=22
- @vscode/vsce 4.1.0: >= 22
- vite 8.3.5 and @vitejs/plugin-react 6.1.2: ^20.19.0 || >=22.12.0
- eslint 10.14.0: ^20.19.0 || ^22.13.0 || >=24
- jsdom 30.1.3 and npm-run-all2 9.0.4: ^22.22.2 || ^24.15.0 || >=26.0.0
- @playwright/test 1.64.1: >=20

npm's registry 'latest' is 12.2.1 (needs ^22.22.2 || ^24.15.0 || >=26), but the bundled npm 11 is fine.
  - evidence: The engines field of the latest version in each package's registry document.
  - source: https://registry.npmjs.org/<pkg>
- [verified-locally] [PkgMgr] @vscode/vsce 4.1.0 detects dependencies only through npm (`npm list --production --parseable --depth=99999 --loglevel=error`) or yarn (--yarn/--no-yarn). It has no pnpm support. npm workspaces symlink local packages; the npm docs show caret ranges and never mention the 'workspace:' protocol.
  - evidence: Read pkgs/x-_vscode_vsce-4.1.0/package/out/npm.js line 78, grepped 'pnpm' across out/*.js (no hits), and read the commander options in out/main.js. The npm v11 workspaces docs describe `npm install b -w a`, `--workspaces` and `--if-present`.
  - source: https://registry.npmjs.org/@vscode/vsce/-/vsce-4.1.0.tgz ; https://docs.npmjs.com/cli/v11/using-npm/workspaces
- [verified-locally] [TS] typescript@latest is 7.0.2 (2026-07-08), the native Go port. Its package has main: null and types: null; exports are only '.': './lib/version.cjs' plus './unstable/*'; the compiler ships as per-platform binary packages. 6.0.3 (2026-04-16) is the last JS-based release.

typescript-eslint 8.72.1 (2026-10-26) declares peer typescript '>=4.8.4 <6.1.0'. generator-code 1.12.0, the official `yo code` scaffolder (2026-06-23), pins typescript ^6.0.3, @types/node 24.x, eslint ^10.5.0, typescript-eslint ^8.61.1, esbuild ^0.28.1, @vscode/test-cli ^0.0.15, @vscode/test-electron ^3.0.0 and mocha ^11.7.6.
  - evidence: Registry JSON for typescript (versions 5.8.2 to 7.0.2 with publish times, and the 7.0.2 manifest) and for typescript-eslint. Read generator-code's generators/app/dependencyVersions/package.json from the downloaded tarball.
  - source: https://registry.npmjs.org/typescript ; https://registry.npmjs.org/typescript-eslint ; https://registry.npmjs.org/generator-code/-/generator-code-1.12.0.tgz
- [documented] [TS] TypeScript 6.0 changes several tsconfig defaults:
- strict: true, module: esnext, target: es2025.
- types: [] (so 'node', 'mocha' and 'vscode-webview' must be listed explicitly).
- rootDir is the tsconfig directory.
- noUncheckedSideEffectImports: true.

Removals and deprecations:
- baseUrl is deprecated.
- moduleResolution node/node10 is deprecated; classic is removed.
- outFile is removed.
- target es5 and downlevelIteration are deprecated.
- esModuleInterop/allowSyntheticDefaultImports can no longer be false.

'ignoreDeprecations': '6.0' silences the deprecations. 6.0 is API-compatible with 5.9.
  - evidence: TypeScript 6.0 announcement.
  - source: https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/
- [verified-locally] [TS] @types/vscode-webview 1.57.5 declares only a global `function acquireVsCodeApi<StateType = unknown>(): WebviewApi<StateType>` (postMessage/getState/setState). With TS 6's types: [] default, the webview tsconfig must list "types": ["vscode-webview"].
  - evidence: Read pkgs/x-_types_vscode-webview-1.57.5/vscode-webview/index.d.ts.
  - source: https://registry.npmjs.org/@types/vscode-webview/-/vscode-webview-1.57.5.tgz
- [documented] [Versions] Latest versions on 2026-11-01:
- @types/vscode 1.144.0 (pin 1.140.0); @types/node 26.6.6 (24.x line: 24.19.2)
- esbuild 0.28.2; vite 8.3.5; @vitejs/plugin-react 6.1.2; vitest 5.0.5 (@vitest/browser and @vitest/browser-playwright 5.0.5)
- @vscode/test-cli 0.0.15; @vscode/test-electron 3.1.0; @vscode/vsce 4.1.0; @types/mocha 10.0.10 (mocha 12.0.3 exists, but test-cli uses ^11.7.6)
- @playwright/test 1.64.1; eslint 10.14.0; @eslint/js 10.0.1; typescript-eslint 8.72.1; prettier 3.9.10; @biomejs/biome 2.6.4
- npm-run-all2 9.0.4; concurrently 10.0.6
- react/react-dom 19.3.1; @types/react 19.3.0; @xyflow/react 12.12.0; elkjs 0.12.1; @dagrejs/dagre 3.1.3
- yaml 2.9.1; zod 4.6.7; diff 9.0.0 (ships its own types; @types/diff is a deprecated stub)
- vscode-languageclient and vscode-languageserver 11.0.0 (client engines vscode ^1.91.0)
- @leanprover/infoview-api 0.13.0
- @vscode-elements/elements 2.5.1; @vscode-elements/react-elements 2.4.0; @vscode/codicons 0.0.46-24
- @anthropic-ai/claude-agent-sdk 0.3.316; @anthropic-ai/claude-code 2.1.316; pnpm 12.16.1; yo 7.0.1; generator-code 1.12.0
  - evidence: Summary script over the registry JSON documents (dist-tags.latest, time[latest], engines, deprecated).
  - source: https://registry.npmjs.org/<pkg> (fetched 2026-11-01)
- [documented] [UI kit] @vscode/webview-ui-toolkit 1.4.0 is deprecated on npm ('This package has been deprecated, https://github.com/microsoft/vscode-webview-ui-toolkit/issues/561'). The maintained replacement is @vscode-elements/elements 2.5.1 (Lit) or @vscode-elements/react-elements 2.4.0. @leanprover/infoview 0.14.0 itself depends on @vscode-elements/react-elements.
  - evidence: The deprecated field in the registry JSON, and the @leanprover/infoview dependency list.
  - source: https://registry.npmjs.org/@vscode/webview-ui-toolkit ; https://registry.npmjs.org/@leanprover/infoview
- [verified-locally] [Build] The official esbuild template for extensions (generator-code 1.12.0, vscode-esbuild/esbuild.js) uses:
- esbuild.context({entryPoints:['src/extension.ts'], bundle:true, format:'cjs', minify:production, sourcemap:!production, sourcesContent:false, platform:'node', outfile:'dist/extension.js', external:['vscode'], logLevel:'silent', plugins:[problem-matcher plugin]})
- scripts check-types='tsc --noEmit', watch:esbuild, watch:tsc='tsc --noEmit --watch', package='check-types && lint && node esbuild.js --production', vscode:prepublish='npm run package', compile-tests='tsc -p . --outDir out', test='vscode-test'
- tasks.json problemMatcher '$esbuild-watch' (needs extension connor4312.esbuild-problem-matchers)
- recommended extensions dbaeumer.vscode-eslint, connor4312.esbuild-problem-matchers, ms-vscode.extension-test-runner

The template tsconfig is module Node16, target ES2022, lib ES2022, types [node, mocha], rootDir src, strict.
  - evidence: Read template files from the generator-code tarball. The VS Code bundling guide shows the same esbuild options and explains external:['vscode'].
  - source: https://registry.npmjs.org/generator-code/-/generator-code-1.12.0.tgz ; https://code.visualstudio.com/api/working-with-extensions/bundling-extension
- [documented] [Build] Vite 8.x is Rolldown-based. build.rollupOptions is now a deprecated alias for build.rolldownOptions. Defaults: build.target 'baseline-widely-available' (chrome111/edge111/firefox114/safari16.4), outDir 'dist', emptyOutDir true only when outDir is inside root, manifest false, cssCodeSplit true, modulePreload {polyfill:true}, sourcemap false. A webview build for VS Code 1.140 can target 'chrome150'.
  - evidence: Vite build options page. The Chromium version comes from the locally verified process.versions.chrome.
  - source: https://vite.dev/config/build-options
- [verified-locally] [Packaging] vsce 4.1.0 refuses to package when devDependencies['@types/vscode'] is newer than engines.vscode, with the error '@types/vscode X greater than engines.vscode Y. Either upgrade engines.vscode or use an older @types/vscode version'.

Useful package flags: --no-dependencies, --allow-missing-repository, --skip-license, -o/--out, --pre-release, --follow-symlinks, --ignoreFile, --allow-star-activation, --allow-package-secrets, --target.

The template .vscodeignore excludes .vscode/**, .vscode-test/**, out/**, node_modules/**, src/**, .gitignore, .yarnrc, esbuild.js, vsc-extension-quickstart.md, **/tsconfig.json, **/eslint.config.mjs, **/*.map, **/*.ts, **/.vscode-test.*.
  - evidence: Read pkgs/x-_vscode_vsce-4.1.0/package/out/validation.js:83-128, out/package.js:1043-1044, out/main.js option list, and the template .vscodeignore.
  - source: https://registry.npmjs.org/@vscode/vsce/-/vsce-4.1.0.tgz
- [verified-locally] [Testing] How @vscode/test-electron 3.1.0 runs:
- It caches downloads in <extensionRoot>/.vscode-test/ (defaultCachePath).
- It spawns VS Code with --no-sandbox --disable-gpu-sandbox --disable-updates --skip-welcome --skip-release-notes --no-cached-data --disable-workspace-trust --extensionTestsPath=... --extensionDevelopmentPath=..., plus --extensions-dir=.vscode-test/extensions and --user-data-dir=.vscode-test/user-data (unless reuseMachineInstall).
- It spawns with env = Object.assign({}, process.env, extensionTestsEnv), and nothing in it removes ELECTRON_RUN_AS_NODE.

The VS Code 1.140.0 linux-x64 build it downloads is 348,920,118 bytes (https://update.code.visualstudio.com/1.140.0/linux-x64/stable redirects 302 to code-stable-x64-1790759436.tar.gz).
  - evidence: Read pkgs/x-_vscode_test-electron-3.1.0/package/out/{runTest.js,util.js,download.js} and made HEAD requests with curl -I.
  - source: https://registry.npmjs.org/@vscode/test-electron/-/test-electron-3.1.0.tgz
- [verified-locally] [Testing] @vscode/test-cli 0.0.15 (.vscode-test.mjs with defineConfig) options:
- files, version ('stable' | 'insiders' | 'x.y.z' | commit), extensionDevelopmentPath, workspaceFolder, mocha, label, srcDir
- desktopPlatform, launchArgs, env
- useInstallation {fromMachine} | {fromPath}
- download {reporter, timeout}
- installExtensions ('owner.ext', 'owner.ext@1.2.3', 'owner.ext@prerelease', or a .vsix path)
- skipExtensionDependencies
- coverage {include, exclude, reporter, includeAll, output}

The README says: 'By default, any extensionDependencies from the package.json are automatically installed.' Mocha is the test runner.
  - evidence: Read pkgs/x-_vscode_test-cli-0.0.15/package/{README.md,out/config.d.cts}.
  - source: https://registry.npmjs.org/@vscode/test-cli/-/test-cli-0.0.15.tgz
- [inferred] [Testing] The official docs say: 'Running extension tests from the command line is currently only supported if no other instance of Code is running.' Their workaround is to run CLI tests in Stable and develop in Insiders.

On this box the downloaded test build uses its own --user-data-dir. VS Code's single-instance IPC handle and lockfile are derived from userDataPath (mainIPCHandle = f(userDataPath,'main',version); mainLockfile = userDataPath/code.lock). The test instance should therefore run alongside the user's open snap window.
  - evidence: Testing guide text. Read /snap/code/current/usr/share/code/resources/app/out/mainImpl.js, the environment service getters mainIPCHandle and mainLockfile.
  - source: https://code.visualstudio.com/api/working-with-extensions/testing-extension ; local mainImpl.js
- [documented] [Testing] Electron needs a display. The CI guide says 'In headless Linux CI machines xvfb is required' and uses `xvfb-run -a npm test`; its GitLab example installs `apt install -y libasound2 libgbm1 libgtk-3-0 libnss3 xvfb`. Here DISPLAY=:0 exists, so tests show a visible VS Code window. xvfb is not installed; headless runs need `sudo apt install xvfb` (candidate 2:21.1.12-1ubuntu1.9).
  - evidence: CI guide, local env, and apt-cache policy.
  - source: https://code.visualstudio.com/api/working-with-extensions/continuous-integration
- [verified-locally] [Testing gotcha] Processes spawned from the VS Code extension host (Claude Code's CLI and its Bash tool) carry ELECTRON_RUN_AS_NODE=1, and with that variable set the Electron binary acts as plain Node. If the implementing agent runs vscode-test from such a shell, the downloaded VS Code starts in Node mode and fails. Run integration tests as `env -u ELECTRON_RUN_AS_NODE npm test`. VS Code's integrated terminal strips /^ELECTRON_.+$/ itself.
  - evidence: ELECTRON_RUN_AS_NODE=1 appears in my env and in /proc/645458/environ (the claude process the Claude Code extension spawned). `ELECTRON_RUN_AS_NODE=1 /snap/code/current/usr/share/code/code -p ...` evaluated JS. test-electron passes process.env through unchanged. Whether the variable comes from the ext host env or is added by the Claude extension is inferred.
  - source: local /proc and test-electron source
- [verified-locally] [Testing] Playwright 1.64.1 browsers:
- chromium and chromium-headless-shell r1248 = Chrome for Testing 156.0.8078.4; firefox r1555 = 157.0; webkit r2370 = 27.2; ffmpeg r1013.
- Ubuntu 24.04 x64 download sizes: chrome-linux64.zip 200,345,244 B; chrome-headless-shell-linux64.zip 125,797,539 B; firefox-ubuntu-24.04.zip 116,377,639 B; webkit-ubuntu-24.04.zip 108,122,739 B; ffmpeg-linux.zip 2,302,701 B.
- CLI flags: --only-shell, --no-shell, --with-deps (apt, needs sudo).
- Cache in ~/.cache/ms-playwright unless PLAYWRIGHT_BROWSERS_PATH is set (0 means inside the package).
- channel 'chrome' launches the hard-coded Linux path /opt/google/chrome/chrome, which exists here (Chrome 155), so no download is needed.
  - evidence: Read pkgs/x-playwright-core-1.64.1/package/{browsers.json, lib/coreBundle.js (DOWNLOAD_PATHS, cftUrl, PLAYWRIGHT_CDN_MIRRORS, _createChromiumChannel('chrome', {linux:'/opt/google/chrome/chrome'}), install CLI options)}. Made curl HEAD requests to cdn.playwright.dev, and ran `ls -la /opt/google/chrome/chrome`.
  - source: https://registry.npmjs.org/playwright-core/-/playwright-core-1.64.1.tgz ; https://cdn.playwright.dev/builds/cft/156.0.8078.4/linux64/
- [inferred] [Testing] Webview UI tests can run headlessly. Serve the Vite build (`vite preview`) and inject a mock before the app loads: page.addInitScript(() => { const sent=[]; let st; window.__sent=sent; window.acquireVsCodeApi = () => ({postMessage: m=>sent.push(m), getState: ()=>st, setState: s=>(st=s)}); }). Simulate host messages with page.evaluate(() => window.postMessage({type:'graph/update', graph}, '*')); the webview's window 'message' listener receives them. Assert on DOM and on window.__sent. Config: use: {channel:'chrome', headless:true}, webServer: {command:'npx vite preview --port 4173 --strictPort', url:'http://localhost:4173'}. Include a stylesheet with snapshot --vscode-* CSS variables for theming.
  - evidence: Design pattern based on the documented webview messaging model and Playwright APIs. Not executed here because running downloaded code is forbidden.
  - source: https://code.visualstudio.com/api/extension-guides/webview
- [verified-locally] [Lean tests] I built a fixture Lake project (lean-toolchain leanprover/lean4:v4.35.0; lakefile.toml with [[lean_lib]] name='Fixture') containing @@ telelean comment blocks, a comment-only node, axioms, a sorry and #print axioms.
- `lake build` took 0.58 s wall (cold, 2 modules) and printed 'warning: Fixture/Spyro.lean:38:8: declaration uses `sorry`' and 'Build completed successfully (4 jobs).' with exit 0.
- A type error prints '✖ [3/5] Building Fixture.Bad', then 'error: Fixture/Bad.lean:9:2: Type mismatch ...' (multi-line), then 'Some required targets logged failures: - Fixture.Bad' and 'error: build failed', with exit 1.
- A comment-only node (a block comment with no code after it) compiles fine, so no sorry is needed.
  - evidence: Ran lake build in /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/research/r6-vscode-toolchain/lean-fixture.
  - source: local lake 5.0.0 / Lean 4.35.0
- [verified-locally] [Lean tests] `lake env lean --json <file>` prints one JSON object per message, for example {"caption":"","data":"Type mismatch\n  cynder_dark\nhas type ...","endPos":{"column":19,"line":9},"fileName":"Fixture/Bad.lean","isSilent":false,"keepFullRange":false,"kind":"[anonymous]","pos":{"column":2,"line":9},"severity":"error"}. kind is 'hasSorry' for sorry warnings. Lines are 1-based and columns 0-based. Exit code is 1 on error. Imports must already be built. Lake also stores per-module logs in .lake/build/lib/lean/<Mod>.trace (JSON schemaVersion '2025-09-10', log:[{message,level}]); that format is internal, so do not rely on it.
  - evidence: Ran the commands and read the .trace file with python3 -I.
  - source: local
- [verified-locally] [Lean tests] `#print axioms decl` yields 'decl depends on axioms: [Character, Game, cynder, cynder_dark, goodAddition, hasDarkPast, isPG, newSpyro, newSpyro_pg, pg_no_dark]'. That supports a mechanical 'DERIVATION only uses ASSUMPTIONs' check: axioms(derivation) ⊆ ASSUMPTION axioms ∪ {propext, Classical.choice, Quot.sound}. sorryAx would flag a sorry.
  - evidence: Observed output from the lake build of the fixture. The policy is my design inference.
  - source: local
- [verified-locally] [Run] Development and installation paths:
- F5 'Run Extension' (type extensionHost, args --extensionDevelopmentPath=...) opens an Extension Development Host of the same snap binary (${execPath}), with the user's extensions available.
- Packaged install: `vsce package --no-dependencies`, then `code --install-extension telelean-x.y.z.vsix`. The snap CLI supports --install-extension <ext-id|path>, --uninstall-extension, --list-extensions --show-versions, --extensions-dir, --user-data-dir, --profile, --disable-extensions.
- Built-in commands present in 1.140: workbench.extensions.command.installFromVSIX, workbench.extensions.action.installExtensionFromLocation, workbench.action.webview.reloadWebviewAction ('Developer: Reload Webviews'), workbench.action.webview.openDeveloperTools.
  - evidence: `env -u ELECTRON_RUN_AS_NODE code --help`, the template launch.json, and a grep of command IDs in workbench.desktop.main.js.
  - source: local snap VS Code
- [verified-locally] [Lean ext] leanprover.lean4 0.0.240 (the latest GitHub release, 2026-09-18) manifest:
- engines ^1.75.0, main ./dist/extension, extensionKind [workspace].
- activationEvents [onLanguage:markdown, onStartupFinished], so it activates on every startup.
- extensionDependencies [tamasfe.even-better-toml].
- Languages lean4 (.lean), lean, lean4markdown.
- configurationDefaults sets files.readonlyInclude {'**/.lake/**/*.lean': true, '**/.elan/**/*.lean': true}, so telelean should skip .lake/.
- Context key lean4.isLeanFeatureSetActive.
- Settings include lean4.serverArgs, lean4.envPathExtensions, lean4.automaticallyBuildDependencies (default false), lean4.alwaysAskBeforeInstallingLeanVersions, lean4.trace.server, and lean4.logging.* (LSP message logger with allowedMethods).
  - evidence: Parsed ~/.vscode/extensions/leanprover.lean4-0.0.240/package.json with python3 -I.
  - source: local + https://github.com/leanprover/vscode-lean4/releases
- [verified-locally] [Lean ext] Key commands among its 82:
- lean4.restartServer, lean4.stopServer, lean4.restartFile (Ctrl+Shift+X), lean4.refreshFileDependencies
- lean4.toggleInfoview (Ctrl+Shift+Enter), lean4.displayGoal, lean4.displayList, lean4.infoView.*/lean4.infoview.* (pin, pause, copy and so on)
- lean4.project.build (resolve deps, then Mathlib cache fetch, then lake build with a notification), lean4.project.clean, lean4.project.createStandaloneProject, lean4.project.createMathlibProject, lean4.project.open, lean4.project.selectProjectToolchain
- lean4.setup.*
- lean4.troubleshooting.showOutput, lean4.troubleshooting.showSetupInformation
- lean4.leanModuleHierarchy.*, lean4.copyModuleName, lean4.loogle.search
  - evidence: Parsed the contributes.commands list. Read the ProjectOperationProvider.buildProject implementation in dist/extension.js.
  - source: local
- [verified-locally] [Lean ext API] activate() returns new Exports(alwaysEnabledFeatures, lean4EnabledFeatures) with this shape:
- alwaysEnabledFeatures = {projectInitializationProvider, outputChannel, leanInstaller, depInstaller, fullDiagnosticsProvider, elanCommandProvider}
- lean4EnabledFeatures: Promise<{clientProvider: LeanClientProvider, infoProvider: InfoProvider, projectOperationProvider: ProjectOperationProvider}>
- allFeatures() merges both.

You reach it through vscode.extensions.getExtension('leanprover.lean4').exports, or await ext.activate(). There are no published typings, so this is an internal API.
  - evidence: Read the minified bundle (module 8143 'Exports' class and the activate() body ending in 'return new f.Exports(t,i)') and the tagged source vscode-lean4/src/exports.ts.
  - source: ~/.vscode/extensions/leanprover.lean4-0.0.240/dist/extension.js ; https://raw.githubusercontent.com/leanprover/vscode-lean4/v0.0.240/vscode-lean4/src/exports.ts
- [verified-locally] [Lean ext API] lean4EnabledFeatures resolves only once a Lean document is the active or a visible editor; the bundle's function U waits on onDidRevealLeanEditor. It also requires setup checks to pass (OS supported, deps installed, Lean installed, elan up to date, VS Code up to date). If a check is 'Fatal', the promise never resolves. Callers must race it against a timeout and must not assume it is available while the user works only in the telelean panel.
  - evidence: Read bundle functions U(...) and q(...): q calls checkAll(...), returns on 'Fatal', otherwise creates LeanClientProvider/InfoProvider/ProjectOperationProvider and resolves.
  - source: local dist/extension.js
- [verified-locally] [Lean ext API] LeanClientProvider public members:
- getActiveClient(), getClients(), findClient(extUri), getClientForFolder(extUri), ensureClient(extUri), restartFile, restartActiveFile. ExtUri is the internal FileUri class.
- Events: progressChanged: Event<[uri, LeanFileProgressProcessingInfo[]]>, diagnosticsChanged: Event<LeanPublishDiagnosticsParams>, clientAdded, clientRemoved, clientStopped.
- There is one LeanClient per Lake project folder.

LeanClient public members:
- sendRequest(method, params, token?), which rejects 'No connection to Lean' if not running; sendNotification; getDiagnostics(); isRunning(); isStarted(); getClientFolder(); isInFolderManagedByThisClient(extUri); restart(); stop(); initializeResult.
- Events: didChange, didClose, diagnostics, customNotification: Event<{method, params}> (every server notification, including $/lean/fileProgress), progressChanged, stopped, restarted, restarting, restartedWorker, serverFailed.

The server process is `lake serve --` for Lake projects, otherwise `lean --server`, with an optional '+toolchain' argument, cwd = project folder and env = copy of process.env.
  - evidence: Read the bundle classes and the source files clientProvider.ts and leanclient.ts at tag v0.0.240.
  - source: https://raw.githubusercontent.com/leanprover/vscode-lean4/v0.0.240/vscode-lean4/src/utils/clientProvider.ts ; .../src/leanclient.ts
- [inferred] [Lean ext API] Defensive accessor for a third-party extension:

const ext = vscode.extensions.getExtension('leanprover.lean4'); const exp = ext.isActive ? ext.exports : await ext.activate(); const feats = await Promise.race([exp?.lean4EnabledFeatures, new Promise(r => setTimeout(r, 10000))]); const client = feats?.clientProvider?.getClients().filter(c => file.startsWith(c.getClientFolder().fsPath + '/')).sort(longest folder first)[0]; await client.sendRequest('$/lean/plainGoal', {textDocument:{uri}, position:{line, character}}); client.customNotification(({method, params}) => { if (method === '$/lean/fileProgress') ... });

The file must already be open in that server.
  - evidence: Derived from the verified member list above.
  - source: local bundle + vscode-lean4 source
- [verified-locally] [Lean ext] At activation the Lean extension calls addToProcessEnvPATH(~/.elan/bin), which prepends it to process.env.PATH of the shared extension host if missing. Other extensions' spawn('lake') then usually works after Lean activates. Do not rely on activation order.
  - evidence: The bundle's activate() calls (0,D.addToProcessEnvPATH)(c.join(a.homedir(),'.elan','bin')). The implementation l(process.env, PATH.ofProcessEnv(), e) prepends only if not already included.
  - source: local dist/extension.js
- [verified-locally] [Lean diagnostics] The Lean client creates vscode.languages.createDiagnosticCollection('lean4') wrapped in LeanClientDiagnosticCollection. It disables the languageclient default (middleware handleDiagnostics: () => {}), handles textDocument/publishDiagnostics itself (incremental appends when isIncremental), filters out isSilent diagnostics, then calls vsCodeCollection.set(uri, diags). vscode.languages.getDiagnostics(uri), getDiagnostics() and onDidChangeDiagnostics therefore expose Lean errors and warnings, but only for files the server has open. The extension also attaches fullRange, leanTags (1=UnsolvedGoals, 2=GoalsAccomplished) and isSilent; whether other extensions see those fields is unconfirmed.
  - evidence: Bundle: startClient creates the collection, LeanClientDiagnosticCollection.syncToCollection filters !e.isSilent, and patchConverters adds fullRange/leanTags/isSilent.
  - source: local dist/extension.js
- [verified-locally] [Lean server] The server elaborates only opened documents. The Lean 4.35 ProtocolOverview says the server 'requires all files for which it receives requests and notifications to be opened by a textDocument/didOpen notification first ... It will discard notifications and error requests for closed files.'

The Lean client's didOpen middleware forwards any document vscode-languageclient opens (language lean4, scheme file, inside the project); its source comment says it 'will sometimes open invisible documents in the language server'. It uses dependencyBuildMode 'never' unless lean4.automaticallyBuildDependencies is set. So workspace.openTextDocument on a project .lean file triggers elaboration. Non-file virtual schemes are never sent to the server. Whole-project status needs lake build or a separate server process.
  - evidence: Read ~/.elan/toolchains/leanprover--lean4---v4.35.0/src/lean/Lean/Server/ProtocolOverview.lean, the leanclient.ts didOpen middleware, and the bundle's patched asOpenTextDocumentParams (setDependencyBuildMode 'never'). The elaboration side effect is inferred.
  - source: local Lean toolchain source + vscode-lean4 v0.0.240 source
- [verified-locally] [Lean LSP] Custom methods in the Lean 4.35.0 server (authoritative list):
- $/lean/fileProgress (server notification): {textDocument: VersionedTextDocumentIdentifier, processing: [{range, kind: 1 processing | 2 fatalError}]}
- textDocument/publishDiagnostics: extended with isIncremental, fullRange, isSilent, leanTags
- textDocument/didOpen: extended with dependencyBuildMode always | once | never
- $/lean/plainGoal: TextDocumentPositionParams -> {rendered, goals[]} | null; 'Not used in VS Code'
- $/lean/plainTermGoal
- textDocument/waitForDiagnostics {uri, version} -> {}: 'when external tools might want to use our LSP server'
- $/lean/waitForILeans
- $/lean/prepareModuleHierarchy, $/lean/moduleHierarchy/imports, $/lean/moduleHierarchy/importedBy
- $/lean/rpc/connect {uri} -> {sessionId: UInt64}
- $/lean/rpc/call {textDocument, position, sessionId, method, params}: builtins Lean.Widget.getInteractiveDiagnostics, getInteractiveGoals, getInteractiveTermGoal, getWidgets, InteractiveDiagnostics.infoToInteractive, getGoToLocation, lazyTraceChildrenToInteractive, highlightMatches, getWidgetSource, InteractiveDiagnostics.msgToInteractive; plus any @[server_rpc_method] function of type α → RequestM (RequestTask β)
- $/lean/rpc/release, $/lean/rpc/keepAlive (the infoview sends keepAlive every 10 s)
- Internal watchdog messages: $/lean/staleDependency, ileanInfoUpdate/Final, ileanHeaderSetupInfo, importClosure, queryModule
  - evidence: Read Lean/Server/ProtocolOverview.lean, Lean/Data/Lsp/Extra.lean (structures) and Lean/Server/Rpc/RequestHandling.lean (server_rpc_method attribute) in the installed toolchain.
  - source: ~/.elan/toolchains/leanprover--lean4---v4.35.0/src/lean/Lean/...
- [verified-locally] [Lean LSP] A headless client talking to the user's own `lake serve` works. A Python JSON-RPC probe against the fixture showed:
- serverInfo {'name':'Lean 4 Server','version':'0.3.0'} after 0.14 s.
- didOpen(dependencyBuildMode 'never') then textDocument/waitForDiagnostics returned {} after 0.76 s, with 2 diagnostics carrying fullRange.
- 40 $/lean/fileProgress notifications.
- $/lean/plainGoal at line 38 (0-based) returned {"goals":["⊢ 1 = 2"],"rendered":"```lean\n⊢ 1 = 2\n```"}.
- documentSymbol listed all declarations.
- $/lean/rpc/connect returned {'sessionId': '15966515055065411071'}. The UInt64 arrives as a JSON string, so a TS client must keep it as a string.
- Shutdown and exit were clean; the whole run took 1.50 s.

Telelean can therefore check proposals without the Lean extension's internal API.
  - evidence: /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/research/r6-vscode-toolchain/scripts/lsp_probe.py run as `python3 -I scripts/lsp_probe.py lean-fixture Fixture/Spyro.lean 38 2`. Typed definitions exist in @leanprover/infoview-api 0.13.0.
  - source: local lake serve (Lean 4.35.0)
- [verified-locally] [VS Code API] Signatures in @types/vscode 1.140.0 (the header reads 'Type Definition for Visual Studio Code 1.140 Extension API'):
- window.createWebviewPanel(viewType, title, ViewColumn | {viewColumn, preserveFocus?}, WebviewPanelOptions & WebviewOptions). Options include enableScripts, localResourceRoots, retainContextWhenHidden, enableFindWidget, enableCommandUris, portMapping.
- window.registerWebviewPanelSerializer(viewType, {deserializeWebviewPanel(panel, state): Thenable<void>}). The d.ts says reviving needs an 'onWebviewPanel:viewType' activation event.
- window.registerWebviewViewProvider(viewId, provider, {webviewOptions})
- workspace.createFileSystemWatcher(globPattern, ignoreCreate?, ignoreChange?, ignoreDelete?), with RelativePattern
- workspace.findFiles(include, exclude?, maxResults?, token?)
- workspace.fs: stat, readDirectory, createDirectory, readFile, writeFile, delete, rename, copy, isWritableFileSystem
- workspace.registerTextDocumentContentProvider(scheme, {onDidChange?: Event<Uri>, provideTextDocumentContent})
- workspace.registerFileSystemProvider(scheme, provider, {isCaseSensitive, isReadonly})
- languages.registerCodeLensProvider(selector, provider)
- languages.getDiagnostics(uri) / getDiagnostics(), onDidChangeDiagnostics
- ExtensionContext.secrets: SecretStorage {get, store, delete, keys(), onDidChange}
- window.createOutputChannel(name, {log: true}) returns a LogOutputChannel
- Also present: lm.selectChatModels, lm.registerTool, lm.registerLanguageModelChatProvider, chat.createChatParticipant, lm.registerMcpServerDefinitionProvider
  - evidence: Grepped and read pkgs/x-_types_vscode-1.140.0/vscode/index.d.ts (21,244 lines), for example line 11746 registerWebviewPanelSerializer and line 14154 applyEdit.
  - source: https://registry.npmjs.org/@types/vscode/-/vscode-1.140.0.tgz
- [verified-locally] [VS Code API] Built-in diff commands:
- vscode.diff(left: Uri, right: Uri, title?: string, columnOrOptions?)
- vscode.changes(title: string, resourceList: [label: Uri, original: Uri | undefined | null, modified: Uri | undefined | null][]). The runtime validates tuples of length 3, the first element must be a Uri, and it opens the multi-diff ('changes') editor with {resource, original:{resource}, modified:{resource}} per entry and label = title. For a newly created file, pass original = undefined.
- _workbench.openMultiDiffEditor is internal; avoid it.
  - evidence: Read the argument validator in out/vs/workbench/api/node/extensionHostProcess.js and the '_workbench.changes' handler in workbench.desktop.main.js. The commands reference page lists both commands with these argument names.
  - source: local VS Code 1.140 bundles ; https://code.visualstudio.com/api/references/commands
- [verified-locally] [VS Code API] WorkspaceEdit supports replace, insert, delete and set(uri, edits[, metadata]). It also has createFile(uri, {overwrite?, ignoreIfExists?, contents?: Uint8Array | DataTransferFile}, metadata?), deleteFile and renameFile. workspace.applyEdit(edit, {isRefactoring?}) applies text-only edits all-or-nothing, and the result is undoable.

WorkspaceEditEntryMetadata = {needsConfirmation: boolean, label: string, description?, iconPath?}. In 1.140, BulkEditService.apply routes edits through the Refactor Preview handler when options.showPreview is set or any edit has metadata.needsConfirmation. That gives a built-in per-change review and accept UI for LLM proposals.
  - evidence: Read the d.ts lines 3935-4140 and 14140-14154. Read workbench.desktop.main.js: 'this._previewHandler&&(e?.showPreview||t.some(u=>u.metadata?.needsConfirmation))&&(t=await this._previewHandler(t,e))'.
  - source: local VS Code 1.140 bundle + @types/vscode 1.140.0
- [documented] [Webview] From the webview guide:
- acquireVsCodeApi 'can only be invoked once per session'.
- getState/setState state 'is persisted even after the webview content itself is destroyed when a webview panel becomes hidden' and is destroyed with the panel.
- Serialization is enabled only by registering a WebviewPanelSerializer plus an onWebviewPanel activation event.
- retainContextWhenHidden 'has high memory overhead'.
- Use the ${webview.cspSource} placeholder in the CSP, localResourceRoots, and asWebviewUri for local files.
- Theme body classes are vscode-light, vscode-dark and vscode-high-contrast, plus --vscode-* CSS variables.
  - evidence: Webview guide.
  - source: https://code.visualstudio.com/api/extension-guides/webview
- [verified-locally] [Snap env] The VS Code snap's electron-launch saves originals as <VAR>_VSCODE_SNAP_ORIG and overrides:
- XDG_CONFIG_DIRS, XDG_DATA_DIRS, LOCPATH
- GIO_MODULE_DIR, GSETTINGS_SCHEMA_DIR
- GDK_PIXBUF_MODULE_FILE, GDK_PIXBUF_MODULEDIR, GDK_BACKEND
- GTK_PATH, GTK_EXE_PREFIX, GTK_IM_MODULE_FILE
- FONTCONFIG_PATH, FONTCONFIG_FILE

snapd also sets SNAP and SNAP_*.

What an extension-host child actually receives: SNAP=/snap/code/267, GTK_PATH=/snap/code/267/usr/lib/x86_64-linux-gnu/gtk-3.0, LOCPATH=/snap/code/267/usr/lib/locale, GIO_MODULE_DIR=~/snap/code/common/.cache/gio-modules, XDG_DATA_DIRS prefixed with snap dirs, GDK_BACKEND=x11 and ELECTRON_RUN_AS_NODE=1. Only 2 _VSCODE_SNAP_ORIG keys survive (XDG_CONFIG_DIRS, XDG_DATA_DIRS); the copies for LOCPATH, GTK_PATH and others are missing.
  - evidence: Read /snap/code/current/electron-launch. Read whitelisted keys only from my env and from /proc/645458/environ (the claude process spawned by the Claude Code extension).
  - source: local
- [verified-locally] [Snap env] VS Code's own sanitizeProcessEnvironment (used for terminals and tasks) deletes keys matching /^ELECTRON_.+$/, /^VSCODE_(?!(PORTABLE|SHELL_LOGIN|ENV_REPLACE|ENV_APPEND|ENV_PREPEND)).+$/, /^SNAP(|_.*)$/ and /^GDK_PIXBUF_.+$/. A second helper deletes DEBUG, NODE_OPTIONS, VSCODE_NODE_OPTIONS, LD_PRELOAD and DYLD_INSERT_LIBRARIES. The main process has unsetSnapExportedVariables()/restoreSnapExportedVariables() based on the _VSCODE_SNAP_ORIG keys. None of this applies to child_process.spawn calls made by extensions, so telelean must sanitize itself.

Sketch:
function childEnv(base=process.env){const env={...base};for(const k of Object.keys(env))if(k.endsWith('_VSCODE_SNAP_ORIG')){const n=k.slice(0,-17),o=env[k];if(o)env[n]=o;else delete env[n];delete env[k];}const strip=[/^ELECTRON_.+$/,/^VSCODE_(?!(PORTABLE|SHELL_LOGIN|ENV_REPLACE|ENV_APPEND|ENV_PREPEND)).+$/,/^SNAP(|_.*)$/,/^GDK_PIXBUF_.+$/];for(const k of Object.keys(env))if(strip.some(r=>r.test(k)))delete env[k];for(const k of ['DEBUG','NODE_OPTIONS','VSCODE_NODE_OPTIONS','LD_PRELOAD'])delete env[k];for(const k of ['GTK_PATH','GTK_EXE_PREFIX','GTK_IM_MODULE_FILE','GIO_MODULE_DIR','GSETTINGS_SCHEMA_DIR','LOCPATH','GDK_BACKEND'])if(env[k]?.includes('/snap/'))delete env[k];for(const k of ['XDG_DATA_DIRS','XDG_CONFIG_DIRS'])if(env[k])env[k]=env[k].split(':').filter(p=>!p.includes('/snap/code')).join(':');const elan=path.join(os.homedir(),'.elan','bin');if(!(env.PATH??'').split(':').includes(elan))env.PATH=elan+':'+(env.PATH??'');return env;}
  - evidence: Read functions I8/S8 in out/vs/workbench/api/node/extensionHostProcess.js, vT in out/mainImpl.js, and unsetSnapExportedVariables in mainImpl.js. The sanitizer code is my design.
  - source: local VS Code 1.140 bundles
- [verified-locally] [PATH/elan] PATH in extension-host children already contains /home/zhengyew/.elan/bin and ~/.local/bin, because VS Code was started from a shell with `code .` and ~/.profile line 29 exports $HOME/.elan/bin. ~/.elan/bin/{elan,lake,lean,leanc,...} are hardlinked elan proxies that honour lean-toolchain. In a project, `elan which lake` resolves to ~/.elan/toolchains/leanprover--lean4---v4.35.0/bin/lake. elan downloads any toolchain named in lean-toolchain that is not installed, so check `elan toolchain list` first.
  - evidence: /proc/645458/environ PATH, grep of ~/.profile, ls ~/.elan/bin, `elan which lake`, `elan toolchain list`, and `elan --help` ('automatically select and, if necessary, download').
  - source: local
- [verified-locally] [claude] The Claude Code extension's id is anthropic.claude-code (publisher 'Anthropic', name 'claude-code', v2.1.314, engines ^1.94.0). Its binary is <extensionPath>/resources/native-binary/claude, today ~/.vscode/extensions/anthropic.claude-code-2.1.314-linux-x64/resources/native-binary/claude: an ELF x86-64 file of 298,229,464 bytes, `--version` prints '2.1.314 (Claude Code)'. The extension has a setting claudeCode.claudeProcessWrapper ('Executable path used to launch the Claude process'). ~/.local/bin/claude and ~/.claude/local/claude do not exist. The documented native-installer layout is ~/.local/bin/claude symlinked into ~/.local/share/claude/versions/.
  - evidence: ls, file, --version, and the extension package.json settings. The setup docs describe the native installer launcher.
  - source: local ; https://code.claude.com/docs/en/setup
- [verified-locally] [claude] Relevant `claude --help` (2.1.314) flags:
- -p/--print, --output-format text|json|stream-json, --input-format stream-json, --include-partial-messages, --json-schema
- --permission-mode acceptEdits|auto|bypassPermissions|manual|dontAsk|plan, --permission-prompts host|none
- --allowedTools, --disallowedTools, --tools
- --mcp-config, --strict-mcp-config
- --system-prompt, --append-system-prompt, --model, --effort, --add-dir
- --settings, --setting-sources
- --session-id, --resume, --no-session-persistence
- --max-budget-usd, --restricted, --safe-mode

--bare is incompatible with subscription use: 'Anthropic auth is strictly ANTHROPIC_API_KEY or apiKeyHelper via --settings (OAuth and keychain are never read)'. -p skips the workspace trust dialog.
  - evidence: Ran the bundled binary with --help.
  - source: local claude 2.1.314
- [verified-locally] [claude SDK] @anthropic-ai/claude-agent-sdk 0.3.316 notes:
- package.json has claudeCodeVersion '2.1.316'; SDK 0.3.N pairs with CLI 2.1.N, and 0.3.314 matches the installed 2.1.314.
- Options.pathToClaudeCodeExecutable?: string ('Uses the built-in executable if not specified') lets you reuse the VS Code extension's binary instead of the optional dependency @anthropic-ai/claude-agent-sdk-linux-x64, which is 328,262,589 bytes unpacked.
- Other options: spawnClaudeCodeProcess, env, executable 'bun'|'deno'|'node', extraArgs.
- Peer dependencies: zod ^4, @anthropic-ai/sdk >=0.93.0, @modelcontextprotocol/sdk ^1.29.0.
  - evidence: Read the tarball's sdk.d.ts (lines ~1715-1740, ~2040, ~2531), package.json and manifest.json, plus registry JSON for the SDK versions and the linux-x64 subpackage.
  - source: https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk
- [inferred] [LSP option] If a telelean language server is ever built, it does not need system Node. vscode-languageclient's ServerOptions {module: serverPath, transport: TransportKind.ipc} forks the server with VS Code's own runtime (process.execPath plus ELECTRON_RUN_AS_NODE), which is Node 24.21 here. vscode-languageclient and vscode-languageserver are both at 11.0.0. Graph-analysis scripts are better served by the shared core library and a CLI that emits JSON, because LSP is document-centric rather than graph-centric.
  - evidence: Registry versions are documented. The fork behaviour follows from vscode-languageclient's module transport and from the locally verified fact that the Electron binary acts as Node when ELECTRON_RUN_AS_NODE=1.
  - source: https://registry.npmjs.org/vscode-languageclient