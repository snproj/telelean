# build:board (agent a51ac0a30d2dd3348)

## summary
The board spike works in a real VS Code 1.140.0 webview, and every test runs green on this machine.

- **Three packages built** under the assigned paths: packages/core (pure TypeScript), packages/webview (React 19 + zustand + pragmatic-drag-and-drop, built by Vite 8 into packages/extension/dist/webview) and packages/extension (bundled by esbuild into dist/extension.js, CommonJS, `vscode` external).
- **core** holds the node/edge/graph types from 03 section 2, the versioned message protocol with hand-written validators, the Spyro sample from 03 section 3.3, a "proved" variant of it, and a deterministic large graph (75 nodes, 115 edges).
- **The board** has:
  - three columns, each scrolling on its own;
  - cards with the sentence first, a kind glyph, a blue aura when formalised, and a chevron that shows the Lean code in a plain block;
  - an imperative SVG edge engine adapted from the research prototype: dashed means declared, solid means verified, at most one animation frame per change, and a stub plus an "n linked" badge at the column edge when one end is scrolled away;
  - drag to another column (drop zone highlighted, `kindChange` posted);
  - click to select, Ctrl/Cmd-click to multi-select, and a selection tray with a target slot and a "These suffice" button;
  - an A|D|G prompt box.
- **Styling and security:** colours come only from VS Code's theme variables. The CSP is nonce-based with no 'unsafe-inline' or 'unsafe-eval'.
- **Extension:** the command "telelean: Open Board" opens a WebviewPanel with that CSP, uses protocol {v:1,type,payload} and logs every received message to a "telelean" output channel.
- **Tests:**
  - core: 14 vitest;
  - webview: 18 vitest + 9 Playwright in the installed Chrome against a static harness page with the same CSP shape, plus 3 screenshots (2 dark, 1 light);
  - extension: 3 vitest + 4 in-VS-Code smoke tests (VS Code 1.140.0 test build under xvfb).
- **Real-webview evidence:** the webview itself reports "4 cards, 3 arrows drawn" for Spyro and "75 cards, 36 arrows drawn (33 stubs)" for the large graph, with zero CSP violations.
- **One race found and fixed (in the diagnostic):** a graph that arrives while the panel is loading is drawn one frame late. The engine handled it correctly; only the early "rendered" report was wrong. Root cause and fix are in claims and open_issues.
- **Rules kept:** nothing was installed, no Claude CLI runs, no git, no Lean, and nothing was written outside the assigned paths and the scratchpad.

## files
- /home/zhengyew/telelean/packages/core/package.json
- /home/zhengyew/telelean/packages/core/tsconfig.json
- /home/zhengyew/telelean/packages/core/tsconfig.test.json
- /home/zhengyew/telelean/packages/core/vitest.config.ts
- /home/zhengyew/telelean/packages/core/src/index.ts
- /home/zhengyew/telelean/packages/core/src/model.ts
- /home/zhengyew/telelean/packages/core/src/graph.ts
- /home/zhengyew/telelean/packages/core/src/protocol.ts
- /home/zhengyew/telelean/packages/core/src/samples/spyro.ts
- /home/zhengyew/telelean/packages/core/src/samples/large.ts
- /home/zhengyew/telelean/packages/core/test/samples.test.ts
- /home/zhengyew/telelean/packages/core/test/protocol.test.ts
- /home/zhengyew/telelean/packages/webview/package.json
- /home/zhengyew/telelean/packages/webview/tsconfig.json
- /home/zhengyew/telelean/packages/webview/tsconfig.node.json
- /home/zhengyew/telelean/packages/webview/vite.config.ts
- /home/zhengyew/telelean/packages/webview/vitest.config.ts
- /home/zhengyew/telelean/packages/webview/playwright.config.ts
- /home/zhengyew/telelean/packages/webview/src/main.tsx
- /home/zhengyew/telelean/packages/webview/src/App.tsx
- /home/zhengyew/telelean/packages/webview/src/labels.ts
- /home/zhengyew/telelean/packages/webview/src/host/bridge.ts
- /home/zhengyew/telelean/packages/webview/src/state/store.ts
- /home/zhengyew/telelean/packages/webview/src/state/context.tsx
- /home/zhengyew/telelean/packages/webview/src/board/Board.tsx
- /home/zhengyew/telelean/packages/webview/src/board/Column.tsx
- /home/zhengyew/telelean/packages/webview/src/board/NodeCard.tsx
- /home/zhengyew/telelean/packages/webview/src/board/EdgeEngine.ts
- /home/zhengyew/telelean/packages/webview/src/board/geometry.ts
- /home/zhengyew/telelean/packages/webview/src/board/edges.ts
- /home/zhengyew/telelean/packages/webview/src/board/dnd.ts
- /home/zhengyew/telelean/packages/webview/src/board/diagnostics.ts
- /home/zhengyew/telelean/packages/webview/src/tray/SelectionTray.tsx
- /home/zhengyew/telelean/packages/webview/src/prompt/PromptBox.tsx
- /home/zhengyew/telelean/packages/webview/src/styles/board.css
- /home/zhengyew/telelean/packages/webview/test/harness/index.html
- /home/zhengyew/telelean/packages/webview/test/harness/harness.js
- /home/zhengyew/telelean/packages/webview/test/harness/serve.mjs
- /home/zhengyew/telelean/packages/webview/test/e2e/board.spec.ts
- /home/zhengyew/telelean/packages/webview/test/e2e/helpers.ts
- /home/zhengyew/telelean/packages/webview/test/unit/geometry.test.ts
- /home/zhengyew/telelean/packages/webview/test/unit/store.test.ts
- /home/zhengyew/telelean/packages/webview/test-results/board-dark-spyro.png
- /home/zhengyew/telelean/packages/webview/test-results/board-dark-large-scrolled.png
- /home/zhengyew/telelean/packages/webview/test-results/board-light-spyro-selection.png
- /home/zhengyew/telelean/packages/extension/package.json
- /home/zhengyew/telelean/packages/extension/tsconfig.json
- /home/zhengyew/telelean/packages/extension/vitest.config.mts
- /home/zhengyew/telelean/packages/extension/.vscode-test.mjs
- /home/zhengyew/telelean/packages/extension/scripts/build.mjs
- /home/zhengyew/telelean/packages/extension/src/extension.ts
- /home/zhengyew/telelean/packages/extension/src/board/BoardPanel.ts
- /home/zhengyew/telelean/packages/extension/src/board/html.ts
- /home/zhengyew/telelean/packages/extension/test/suite/board.test.ts
- /home/zhengyew/telelean/packages/extension/test/unit/html.test.ts
- /home/zhengyew/telelean/packages/extension/dist/extension.js (build output)
- /home/zhengyew/telelean/packages/extension/dist/webview/webview.js, webview.css, assets/codicon.ttf (build output)
- /home/zhengyew/telelean/packages/extension/.vscode-test/ (VS Code 1.140.0 test build, 998 MB, gitignored)

## how_to_run_tests
Run each package from its own folder. Root scripts were not used, because they would also build packages/runner.
1. core: `cd /home/zhengyew/telelean/packages/core && npm test` (type-check, then vitest). `npm run build` writes dist/.
2. webview: `cd /home/zhengyew/telelean/packages/webview && npm test`. This type-checks src and tests, runs `vite build` into ../extension/dist/webview, runs vitest, then Playwright. Playwright uses the installed Google Chrome (channel "chrome"), headless, one worker. Its webServer starts test/harness/serve.mjs on 127.0.0.1:41739 and stops it afterwards. Screenshots go to packages/webview/test-results/. Pieces: `npm run build`, `npm run test:unit`, `npm run test:e2e`.
3. extension: `cd /home/zhengyew/telelean/packages/extension && npm test`. This type-checks, runs build:all (webview Vite build, then esbuild of dist/extension.js and out/test/suite/*.test.js), runs vitest (the HTML/CSP unit test), then test:smoke = `env -u ELECTRON_RUN_AS_NODE xvfb-run -a npx vscode-test`. That runs one VS Code 1.140.0 instance from ./.vscode-test with its own user-data and extensions folders; it exits on its own (about 8 s once cached).
4. Manual use, without installing anything now: run `npm run build:all` in packages/extension. Later, in VS Code, run "Developer: Install Extension from Location..." and pick /home/zhengyew/telelean/packages/extension, then "telelean: Open Board". The command accepts an optional argument `{sample: 'spyro' | 'spyro-proved' | 'large'}`.

## test_output
=== packages/core: npm test (07:15:52) ===
 Test Files  2 passed (2)
      Tests  14 passed (14)
   Duration  258ms

=== packages/webview: npm test (07:15:22; typecheck + vite build + vitest + playwright) ===
      Tests  18 passed (18)
> @telelean/webview@0.0.0 test:e2e
> playwright test
Running 9 tests using 1 worker
  ✓  1 test/e2e/board.spec.ts:25:1 › renders the Spyro sample: sentence first, kind glyph, aura on formalised cards, dashed declared arrows (555ms)
  ✓  2 test/e2e/board.spec.ts:66:1 › the arrow checker used below is not vacuous: it reports an arrow moved 10 px off its card (295ms)
  ✓  3 test/e2e/board.spec.ts:80:1 › verified dependencies are drawn solid (322ms)
  ✓  4 test/e2e/board.spec.ts:93:1 › scrolling one column leaves the other columns alone; arrows follow scrolling and resizing; off-screen ends become stubs (921ms)
  ✓  5 test/e2e/board.spec.ts:151:1 › dragging an Assumptions card onto Goals highlights the drop zone, moves the card and posts kindChange (777ms)
  ✓  6 test/e2e/board.spec.ts:208:1 › click selects, Ctrl/Cmd-click multi-selects, the tray counts and "These suffice" posts the selected ids (1.1s)
  ✓  7 test/e2e/board.spec.ts:255:1 › the A|D|G box adds a card to the chosen column and posts addNode (414ms)
  ✓  8 test/e2e/board.spec.ts:285:1 › the chevron expands a card to show its Lean code without selecting it (548ms)
  ✓  9 test/e2e/board.spec.ts:311:1 › high contrast replaces the aura glow with an outline (317ms)
  9 passed (6.3s)
(Earlier, with the 8 tests that existed then: `npx playwright test --repeat-each=3` → 27 passed (17.3s).)

=== packages/extension: npm test (07:15; typecheck + build:all + vitest + env -u ELECTRON_RUN_AS_NODE xvfb-run -a npx vscode-test) ===
 Test Files  1 passed (1)
      Tests  3 passed (3)
✔ Validated version: 1.140.0
✔ Found existing install in /home/zhengyew/telelean/packages/extension/.vscode-test/vscode-linux-x64-1.140.0
    ✔ contributes the telelean.openBoard command
      webview reported: graph v1: 4 cards, 3 arrows drawn (0 stubs); viewport 846x698, column heights 542,542,542, visible; engine frames 3, measures 3, culled 0, missing 0, cards measured 4, lists connected true, graphs applied 1, waited 0 frames
    ✔ telelean.openBoard opens the panel; the webview loads under the CSP, posts ready and renders the graph (1291ms)
      webview reported: graph v1: 75 cards, 36 arrows drawn (33 stubs); viewport 846x698, column heights 542,542,542, visible; engine frames 5, measures 5, culled 68, missing 0, cards measured 75, lists connected true, graphs applied 2, waited 0 frames
    ✔ running the command again reveals the same panel and sends the new graph to the live webview (57ms)
      webview reported: graph v2: 4 cards, 3 arrows drawn (0 stubs); viewport 846x698, column heights 542,542,542, visible; engine frames 1, measures 1, culled 0, missing 0, cards measured 4, lists connected true, graphs applied 2, waited 0 frames
    ✔ a graph sent while the webview is still loading is re-sent on "ready" (the latest graph wins) (143ms)
  4 passing (2s)
Exit code:   0
(The smoke suite also passed 3 times in a row at 07:08: "4 passing (2s) ... Exit code: 0" each time.)
After the runs: pgrep for vscode-linux-x64-1.140.0 / Xvfb / serve.mjs / headless chrome found nothing; `wc -l ~/.elan/known-projects` → 36.

## claims
- **claim:** The webview bundle loads and runs under the strict nonce CSP inside a real VS Code 1.140.0 webview, and reports no CSP violations.
  - **evidence:** The smoke test asserts the webview posted `ready` and a `rendered` diagnostic, and that no `csp-violation` diagnostic arrived within 1 s after rendering. The webview listens for securitypolicyviolation events and forwards them. Output: "✔ telelean.openBoard opens the panel; the webview loads under the CSP, posts ready and renders the graph (1291ms)". The extension's log at .vscode-test/user-data/logs/20261101T071018/window1/exthost/telelean.telelean/telelean.log contains "[webview->host] ready {\"lastVersion\":null}". Grepping that run's logs for 'Refused to' or 'Content Security Policy' found nothing. CSP used: default-src 'none'; img-src <cspSource> data:; font-src <cspSource>; style-src <cspSource> 'nonce-N'; script-src 'nonce-N'.
- **claim:** Inside the real webview, the EdgeEngine draws the arrows and stubs: 3 arrows for Spyro; 36 paths (33 of them stubs) for the 75-card graph, with 68 edges culled because both ends were off-screen.
  - **evidence:** Self-report posted by the webview: "graph v1: 4 cards, 3 arrows drawn (0 stubs); viewport 846x698, column heights 542,542,542, visible" and "graph v1: 75 cards, 36 arrows drawn (33 stubs) ... culled 68, missing 0, cards measured 75".
- **claim:** Scrolling one column leaves the other columns' scrollTop unchanged. Real mouse-wheel input passes through the SVG overlay to the column underneath.
  - **evidence:** Playwright test 4 uses page.mouse.wheel over the Assumptions column, then the Derivations column. It asserts DERIVATION and GOAL stay at 0 after the first wheel, and that ASSUMPTION keeps its value and GOAL stays 0 after the second. "✓ 4 ... scrolling one column leaves the other columns alone; arrows follow scrolling and resizing; off-screen ends become stubs (921ms)".
- **claim:** After scrolling and after resizing the viewport, every drawn arrow's ends lie within 2 px of the correct (facing) edge of their cards, inside the cards' vertical extent. Edges with one end out of view are drawn as short stubs (30 px or less) that start on the visible card. No pair is drawn the wrong way: a full arrow when both cards are visible, a stub when one is, nothing when neither is.
  - **evidence:** checkArrows() in test/e2e/helpers.ts compares every path's `d` start and end points with getBoundingClientRect of both cards and of the column viewports. Test 4 requires problems == [], missing == [], full > 0 and stubs > 0, at three points: after scrolling A, after scrolling D, and after setViewportSize(980x640). Test 2 shows the checker is not vacuous: shifting one path 10 px yields exactly one problem matching /start .* not on the source's right edge/.
- **claim:** Dragging an Assumptions card onto Goals highlights the drop zone, moves the card in local state and posts kindChange. Dropping onto a card's upper half inserts the card above it.
  - **evidence:** Test 5 drags with real mouse down/move/up; the browser's native drag works with pragmatic-drag-and-drop under Playwright, no synthetic events needed. During the drag: Goals has data-drop=active, Derivations has data-drop=candidate, and the label reads "Drop to make Goal". Posted: {v:1,type:'kindChange',payload:{id:'pg-no-dark-past',from:'ASSUMPTION',to:'GOAL',beforeId:null}}. The second drag gives order [new-spyro-pg, cynder-not-good, pg-no-dark-past] and beforeId 'cynder-not-good'. Arrows still attach correctly afterwards (the within-column arrow runs through the gutter).
- **claim:** Click selects a card and Ctrl/Cmd-click toggles cards in the selection. The tray shows the count and the target slot, and "These suffice" posts the selected premises and the target.
  - **evidence:** Test 6: tray-count reads '1 selected', then '3 selected' (button disabled, no target), then '4 selected'. The last `select` message has ids ['new-spyro-pg','cynder-dark-past','cynder-not-good','pg-no-dark-past']. Posted: {v:1,type:'theseSuffice',payload:{premises:['new-spyro-pg','cynder-dark-past','pg-no-dark-past'],target:'cynder-not-good'}}. The 3 arrows of the selected cards get the class tl-edge--focus.
- **claim:** The A|D|G box adds a comment-only card to the chosen column and posts addNode. The chevron expands a card to show its Lean code without selecting it. Formalised cards carry the aura; in high contrast the aura is an outline instead of a glow.
  - **evidence:** Test 7 posted addNode {clientId:'cynder-should-get-her-own-spin',type:'GOAL',...} and a DERIVATION one. Test 8 finds 'abbrev cynder_dark_past : Prop := HasDarkPast cynder' in the expanded card, no `select` message was posted, and the code-less node reads 'No Lean code yet'. Test 1: the box-shadow contains rgb(55, 148, 255) on formalised cards and is 'none' on pg-no-dark-past. Test 9 (theme hc): box-shadow is 'none' and the outline is solid rgb(55, 148, 255).
- **claim:** Declared arrows are dashed and verified arrows are solid.
  - **evidence:** Test 1: three paths with data-pattern=declared and a computed stroke-dasharray other than 'none'. Test 3 (spyroProvedGraph): three paths with data-pattern=verified and stroke-dasharray 'none'. Unit test toDisplayEdges: a pair that is both declared and verified is drawn once, solid.
- **claim:** A graph posted while the webview is still loading is not lost.
  - **evidence:** Smoke test 4 passed. telelean.log shows "[host->webview] graph \"Spyro\" v2: delivered" at 22.703, before "[webview->host] ready" at 22.758, then a second delivery; the webview reported "graphs applied 2". VS Code queued the early message, so the re-send on ready is a harmless duplicate.
- **claim:** The VS Code test instance peaks at about 1.7 GB summed RSS, and a cached smoke run takes about 8 s.
  - **evidence:** A background sampler summed the RSS of all processes matching vscode-linux-x64-1.140.0 every 0.5 s during `npm test` in packages/extension: "samples=133 peak_rss_mib=1687". The script printed "exit 0 after 8 s". Summed RSS counts shared pages more than once, so the real figure is lower. free -m showed about 34 GB available before each heavy step.
- **claim:** "Developer: Install Extension from Location..." registers the folder in place and does not copy it, so the 988 MB .vscode-test folder is never copied. The extension does need its dist/ built.
  - **evidence:** VS Code 1.140.0's resources/app/out/vs/code/electron-utility/sharedProcess/sharedProcessMain.js contains: `async installFromLocation(e,t){...let r=await this.extensionsScanner.scanUserExtensionAtLocation(e);...return await this.addExtensionsToProfile([[r,{source:"resource"}]],t)...}`.

## deviations_from_design
- Added a webview->host message type `diagnostic` ({level, code, message, data}) beyond the specified ready / kindChange / addNode / select / theseSuffice. It carries CSP violations and a `rendered` summary, which the smoke test asserts on and the output channel logs.
- 03 section 2 types changed: `TlNode.loc` is optional (a card typed on the board has no markup block yet); `LeanBinding.code` is new (the source of the bound declarations, for the expanded card); `TlEdge.id` is new. Only the M0 subset of DerivedStatus is used.
- An edge with one end out of view is always drawn as a stub, even when the visible card is hovered or selected. D-13 and 03 section 7 give focused nodes full curves; M0 only highlights them.
- Drop zones say "Drop to make <Kind>" rather than the per-D-11 impact text ("promotion pending until proved", ...). Not yet implemented: in-board Undo, keyboard and context-menu equivalents, port-drag to declare an arrow, the edge-mode toggle, dimming of non-neighbours on hover, the vocabulary group, the proposal banner and agent thread, Shiki (a plain block is used, as allowed), WebviewPanelSerializer, and setState persistence.
- Columns use role=list/listitem; 03 section 7 asks for grid/treegrid.
- Not in the brief, added as a small extra: a check glyph on selected cards. In light themes the selection outline and the formalised aura are both blue, so selection was relying on colour alone.
- The `because:` rationale line is plain text, following D-15 (italic is reserved for Claude's wording). The research prototype showed it in italics.
- The tray's target is the single selected GOAL by default; a ⊢ button on a chip can set any selected card as the target. "These suffice" is enabled only with at least one premise and a target.
- The extension shows core sample graphs only (Lean-backed graphs come in M1). kindChange, addNode, select and theseSuffice are applied optimistically in the webview and only logged by the host.

## open_issues
- The new workspaces are not registered in package-lock.json, and there are no node_modules/@telelean/* links (npm install was not allowed). Cross-package imports therefore resolve through tsconfig `paths`, a Vite alias, esbuild's tsconfig support and Playwright's tsconfig support, all pointing at packages/core/src. Builds and tests work without links. Running `npm install` once (no new dependencies) would update the lock file; the aliases would still take precedence.
- packages/extension/.vscode-test holds the 988 MB VS Code 1.140.0 build plus about 10 MB of user-data. It is gitignored and in the approved location; delete it to reclaim space and it downloads again on the next smoke run.
- To keep temp files in the scratchpad, I ran the smoke tests with TMPDIR set to the long scratchpad path. VS Code's agent host could not create its Unix socket there ("listen EINVAL"; Unix socket paths have a 108-character limit) and continued without it, so the run was unaffected. The npm scripts do not set TMPDIR.
- The `rendered` diagnostic is now taken only after the engine has measured every card of the graph with a non-empty layout. A first version snapshotted after two frames and once reported '4 cards, 0 arrows ... missing 3'. Cause: zustand's React subscriptions attach in passive effects, so a graph arriving in that window is committed one frame after the engine's first measure. The engine itself recovered correctly through its MutationObserver; only the early snapshot was wrong.
- "n linked" badges overlap the first and last visible card in a column. Clicking one scrolls to the nearest hidden linked card; this path is not covered by a test.
- Covered only in the Chrome harness, not inside VS Code's webview: drag-and-drop, selection, the prompt box, real theme switching (light/dark/hc come from approximate fixtures), high-contrast light, and screenshots. The real-webview check relies on the webview's own report (cards, arrows, stubs, layout, CSP).
- `select` is posted on every selection change; it may need debouncing once the host does real work with it.

## design_feedback
- pragmatic-drag-and-drop 4.0.0 marks the research's import paths deprecated (they still work). Use @atlaskit/pragmatic-drag-and-drop/adapter/element-adapter, .../utils/combine, @atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/attach-closest-edge, .../closest-edge/extract-closest-edge and .../types. Auto-scroll stays at @atlaskit/pragmatic-drag-and-drop-auto-scroll/element. Typed drag data needs an index signature `[key: string | symbol]: unknown`.
- Vite 8 setup that works: `build.rolldownOptions` (rollupOptions is a deprecated alias) with a JS entry (src/main.tsx), entryFileNames 'webview.js', an assetFileNames function sending CSS to 'webview.css', cssCodeSplit false, modulePreload false, assetsInlineLimit 0, base './'. Output: one ES module of 280 KB with no eval, no new Function and no process.env; 43 KB of CSS; codicon.ttf at 150 KB, loaded through font-src cspSource with no violation.
- A `<script type=module nonce=...>` bundle plus a `<link rel=stylesheet>` from cspSource works in the real 1.140 webview with style-src '<cspSource> nonce' and script-src 'nonce'. React's style={{}} and the engine's el.style.left/top writes (CSSOM) are not blocked.
- In 1.140, webview.postMessage to a panel that is still loading resolved true and the message was delivered after load (VS Code queues it). The research advised buffering only when postMessage resolves false; in practice, re-sending on `ready` gives duplicates. Graph application should be idempotent or version-checked. 03 section 2's versioned patches will need a 'webview has version N' acknowledgement rather than relying on delivery results.
- React 19 + zustand: store updates that arrive between the first commit and passive effects are re-rendered one frame later. Any 'settled' signal (tests, the M2 review stepper) should wait for the engine's measured card count, not for a fixed number of frames.
- A TabInputWebview for a new panel is not visible through window.tabGroups immediately after executeCommand returns. Wait for the webview's `ready` before inspecting tabs.
- Playwright's real-mouse drag (mouse.down/move/up) drives pragmatic-drag-and-drop's native HTML5 drag in headless Chrome 155. The research's planned Playwright approach works, including closest-edge insertion.
- 03 section 12 / D-31 should note that the VS Code 1.140.0 test build is 988 MB unpacked and that the test instance peaks around 1.7 GB summed RSS. One instance at a time is fine on this 64 GB machine.
- D-15 and 03 section 7: in light themes, focusBorder (the selection outline) and charts.blue (the aura) are both blue. The selection needs a non-colour cue (a check glyph here) or a different token.
- "Install Extension from Location" in 1.140 links the folder in place (scanUserExtensionAtLocation + addExtensionsToProfile, no copy). The installed extension then runs from packages/extension/dist, so rebuilding updates it after a window reload.

## extra
Message protocol (core/src/protocol.ts), every message {v:1, type, payload}:
- host->webview: graph {graph: TlGraph}
- webview->host: ready {lastVersion}, kindChange {id, from, to, beforeId|null}, addNode {clientId, type, naturalName}, select {ids}, theseSuffice {premises, target}, diagnostic {level, code, message, data?}
- The host validates every inbound message with parseWebviewToHost, which rejects unknown types, a wrong v, non-ADG kinds, empty premises and over-long fields, and drops extra properties. The webview checks the host envelope with parseHostToWebview.

EdgeEngine (webview/src/board/EdgeEngine.ts, about 330 lines) plus pure geometry (geometry.ts, unit-tested):
- READ: card boxes and column viewports via getBoundingClientRect, only when the layout is dirty. A ResizeObserver watches the board, the lists and every card; a MutationObserver watches the lists. Each frame reads only the three scrollTops.
- COMPUTE: pure. An endpoint sits on the card's facing edge at min(h/2, 18) px below the card top, clamped into the visible part of the card. Cross-column arrows are cubic curves; within-column arrows loop through the gutter. A card with less than 8 px visible counts as off-screen. One end off-screen gives a stub (22×20 px hook) plus a badge; both ends off-screen means culled. Budget: 250 paths, focused first.
- WRITE: a pooled set of <path> elements whose attributes change only when their values change. Edges that skip a column sit in the under layer, below the opaque cards.

Sizes: dist/extension.js 23,321 B (core bundled in); webview.js 279,958 B; webview.css 42,914 B; codicon.ttf 149,508 B. Source: about 3,200 lines of TS/TSX/CSS across the three packages, plus tests.
Timings: core vitest about 0.3 s; webview Playwright 9 tests 6.3 s; extension npm test 8 s once cached (the first run also downloaded the VS Code 1.140.0 build).
Screenshots (viewed and checked):
- /home/zhengyew/telelean/packages/webview/test-results/board-dark-spyro.png: 3 dashed arrows, aura on 3 cards, "no source yet" badge.
- /home/zhengyew/telelean/packages/webview/test-results/board-light-spyro-selection.png: 4 selected with check glyphs, blue focus arrows, expanded Lean code, tray reading premises ⊢ target with "These suffice ▶".
- /home/zhengyew/telelean/packages/webview/test-results/board-dark-large-scrolled.png: A and D scrolled, stubs, "▲ 4 linked / ▼ 6 linked" badges, arrows passing under Derivations cards, hover highlight.
RSS sampler script: /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn2/board-spike/rss_sampler.sh

