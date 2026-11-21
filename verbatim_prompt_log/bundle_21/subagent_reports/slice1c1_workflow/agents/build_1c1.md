# build:1c1

Agent `ab5fcf87a3f6eed7c` of workflow `wf_13b8eae2-0c7`. Verbatim output (JSON alongside).

## Builder 1c1 report: the canvas, part 1

All the work is in the working tree; I made no git changes. The decisions are also appended to `/home/zhengyew/telelean/docs/slice1-plan.md` §8, in the entry "2026-11-19 (builder 1c1 …)".

### What was built

**Layout**
- The board is now:
  - a Vocabulary and Definitions band at the top;
  - below it, the AXIOMS column on the left and the PROPOSITIONS canvas.
- There is one SVG overlay, and it sits under both the column and the canvas, so arrows run beneath the cards.
- The canvas viewport and its layer let the pointer through (`pointer-events: none`). The cards, the canvas toolbar and the badges take it.
- So presses, wheel events and presses over an arrow all reach the board element, which carries the handlers. The wheel listener is on that ancestor too.

**Canvas view control**
- Pan and zoom live in an imperative `CanvasView`, not in the store. It writes `--tl-tx`, `--tl-ty` and `--tl-s` through the CSSOM, so there are no inline style attributes.
- Wheel zoom works about the cursor, clamped to 0.1–4. Ctrl+wheel (a trackpad pinch) is scaled up.
- A right-drag pans, with pointer capture.
- A right click with less than 4 px of movement opens the CM-7 menu through `common/Popover`, including both CM-7 exceptions. A right-drag never selects anything and never opens the menu (A21).
- The native `contextmenu` is suppressed on the board element, except over text fields or selected text.
- Shift+F10 opens the menu for the focused card.

**Moving cards and placement**
- A left-drag on a proposition moves it. If it is selected, the other selected propositions move with it. The release sends one `moveCards`, which is one Undo step. Escape cancels a move.
- Keyboard: `+`, `−` and `0` (Fit all), and the arrow keys pan.
- Tab goes through the column first, then the canvas cards in reading order. The canvas follows a card focused from the keyboard.
- The canvas toolbar has Fit all, Zoom to selection and Tidy layout, plus zoom buttons and a zoom percentage.
- Reveals pan and zoom the canvas to the card.
- Cards without a stored position get the layered placement, computed from measured collapsed sizes. It is never written until the card is moved or Tidy layout is used.
- An expanded card is raised above the others and widened to 420 px; nothing else moves.

**Overlay (`geometry.ts` and `EdgeEngine.ts`, rewritten)**
- Card boxes come from `getBoundingClientRect` and are cached per part, so scrolling, panning and zooming redraw without measuring again. Recompute is at most once per frame.
- Two clip paths: canvas-only for arrows between two canvas cards, and a board clip for the others.
- Column ends that are scrolled out of view are cut at the column's top or bottom, with "▲/▼ n linked".
- On the canvas, a cut-off arrow stops at the edge it leaves through, arriving square to it. Each edge has its own badge ("◀ ▲ ▶ ▼ n linked"); it pans to the nearest hidden card.
- Declared arrows are drawn as round dots (`0 6` with round caps); the legend matches.
- Selected arrows are now drawn.
- "Follows from nothing" is drawn as a ∅ stub into the card's left edge, with `data-mark-id`.

**AXIOMS column and the band**
- The column header has the "also assumed: K pending claims, N existence assumptions, M hidden assumptions" line. Each part links to its cards or Vocabulary items.
- The band has a Vocabulary column and a Definitions column, a draggable divider whose height is persisted as `topSplit`, and a collapse to one line that keeps counts and flags.
- In the proposed view, the diff marks are kept and the "Claude suggests" ghosts stay at the top of the AXIOMS column.

**Lock during a run (1f)**
- View control still works.
- Moves, Tidy layout, "New proposition here" and every edit entry in the menu are disabled, with the reason as the tooltip.
- The Proposed view never moves, tidies or selects, so its positions never reach the Current board's Undo stack.

**Core, extension and runner**
- Core implements §2.4's `add-node.position`: the protocol validates it, the planner writes it into layout.json in the same plan, and an axiom's position is ignored.
- The extension maps it to the action.
- The A|P box sends a position with every proposition (BD-8): the "New proposition here" point if one was chosen, otherwise next to the selected card, otherwise the middle of the view.
- Runner carry-over: `currentLayoutOf` carries `TlGraph.positions` into the proposed graph, so the Proposed canvas shows existing cards where the Current one does.

### Files

**Webview, new**
- `src/board/canvas/{view.ts, gesture.ts, placement.ts, CanvasView.ts}`
- `src/board/{BoardInput.ts, menu.ts, ContextMenu.tsx, CanvasToolbar.tsx, PropositionCanvas.tsx, AxiomsColumn.tsx, AlsoAssumed.tsx, assumed.ts, DropZone.tsx, Vocabulary.tsx, vocabularyBand.ts}`

**Webview, rewritten:** `src/board/{Board.tsx, EdgeEngine.ts, geometry.ts, reveal.ts}`

**Webview, edited**
- `src/board/{NodeCard.tsx, diagnostics.ts}`
- `src/common/Popover.tsx`: new `returnFocus` prop; follows the canvas view.
- `src/{main.tsx, labels.ts}`, `src/model/run.ts`
- `src/prompt/PromptBox.tsx`, `src/state/store.ts`, `src/styles/board.css`

**Webview, deleted:** `src/board/Column.tsx`, `src/board/VocabularyGroup.tsx`

**Core**
- `src/actions.ts`, `src/protocol.ts`
- `src/edit/planAction.ts`
- `src/edit/planShared.ts`: `coordinate` and `canvasPosition` now live here, shared with move-cards.
- `src/edit/planArrows.ts`

**Extension:** `src/logic/actionMapping.ts`

**Runner:** `src/proposal/service.ts` (`layoutOf` became the exported `currentLayoutOf`).

**Docs:** `docs/slice1-plan.md` §8.

All paths are under `/home/zhengyew/telelean/packages/<pkg>/`.

### Tests added and updated
- **Webview, new**
  - `test/unit/canvas.test.ts`: zoom about the cursor, wheel and pinch factors, Fit all, reveal and follow, the 4 px threshold, placement layering, cycles, stored cards, Tidy layout, BD-8.
  - `test/unit/menu.test.ts`: CM-7 selection including both exceptions; menu entries for a proposition, an axiom, an old axiom, an arrow, a mark and the canvas; the lock, the Proposed view and provisional cards; "also assumed"; the band summary.
  - `test/unit/store-canvas.test.ts`: `addNode.position`, "New proposition here", `selectForMenu` and `selectMark`, `topSplit`, overlay positions.
- **Webview, rewritten:** `test/unit/geometry.test.ts` (it assumed two columns). It now covers routing, clipping and `segmentExit`, cuts in the column and at canvas edges, the 2-D badges, ∅ stubs, culling and the budget.
- **Core:** `test/protocol.test.ts` and `test/edit/arrows.test.ts` (`add-node` position is stored for a proposition, ignored for an axiom, refused when off the canvas).
- **Extension:** `test/unit/actionMapping.test.ts`.
- **Runner, new:** `test/proposal/positions.test.ts`. It builds a syntactic proposal, needs no Lean, and checks that positions carry over and that a new card has none.
- No tests were deleted.

### Verification
All runs used `capped.sh` and one worker; the binaries came from `node_modules/.bin`.
- **Webview `tsc` (`tsconfig.json`):** clean.
- **Webview `tsc` (`tsconfig.node.json`):** 6 errors, all in the known e2e files (m1-edits ×3, m2-layout ×1, m2-review ×2).
- **Webview vitest:** "Test Files 13 passed (13) / Tests 206 passed (206)". The baseline was 10 files and 165 tests.
- **Core `tsc` (test config):** clean.
- **Core vitest:** "Test Files 52 passed (52) / Tests 566 passed (566)".
- **Extension `tsc`:** 9 errors, all in the known `test/suite` files.
- **Extension vitest `--no-cache`:** "Test Files 22 passed (22) / Tests 197 passed (197)". `extension/out` was not touched.
- **Runner `tsc` (test config):** clean.
- **Runner:** I ran only `test/proposal/positions.test.ts`, with `TELELEAN_TEST_TMP` set to my scratch dir: "Test Files 1 passed (1) / Tests 2 passed (2)". `build.test.ts` uses the changed service but is Lean-gated, so it is left for the integrator.
- **Scratch build:** `vite build` into `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b1c1/webview-build` reported "✓ built in 354ms". `webview.js` is 503.37 kB, which triggers Vite's advisory warning for chunks over 500 kB. `packages/extension/dist` was not touched.
- I did not run Playwright or any browser, so none of the pointer, wheel, focus or rendering behaviour has been seen working in a browser yet.

### E2E specs that need updating
The helpers and specs are partly outdated already, since 1a.
- **`test/e2e/helpers.ts`**
  - `list()`: the PROPOSITION list is gone. Propositions are in `.tl-canvas__layer [data-slot-id] > .tl-card`.
  - `scrollTops()`: only the AXIOM list scrolls.
  - `inColumnView()`: vocabulary items now sit in `.tl-vcol__list`; canvas cards should be checked against the `.tl-canvas` rect.
  - Line 219: `svg.tl-edges--over` is now `svg.tl-edges`.
  - Lines 223 and 333: per-column views become the AXIOMS list plus the canvas.
  - Lines 368–372 (badge helper): canvas badges are `.tl-badge[data-part="canvas"][data-side]` inside `.tl-canvas__badge-slot`.
  - `columnPoint`/`dragCard`: propositions now move by a pointer left-drag on the canvas, not by HTML drag. The canvas is an HTML drop target only to refuse axioms.
- **`board.spec.ts`**
  - Lines 36–37, 68–71: the canvas has an empty state `[data-testid="canvas-empty"]`.
  - Line 77: the diagnostic's `lists` is now "axioms,canvas".
  - Lines 210–291: scrolling and badges.
  - Lines 317–332: drops.
  - Lines 433–440: an added proposition appears on the canvas, placed in view.
- **`m1-cards.spec.ts`**
  - Line 22: the Vocabulary group is now the band `[data-testid="vocabulary"]` above the board, not the first child of the Axioms list.
  - Line 24: the toggle text includes "Definitions".
  - Lines 30–31: sections are split into `vocabulary-column` and `definitions-column`.
  - Line 102.
- **`m1-lean-code.spec.ts`:** lines 87, 146–154, 177–180.
- **`m1-edits.spec.ts`:** line 344.
- **`m1-fixes.spec.ts`**
  - Lines 49–57: there is one `.tl-col`, and `.tl-board-scroll` is now `.tl-board-area` with no sideways scroll.
  - Lines 202–214: `svg.tl-edges`.
  - Lines 260–261: the empty text is now "No axioms yet: type your first one in the box below".
- **`m1-drag.spec.ts`:** proposition drags.
- **`m1-store.spec.ts`:** lines 46–47.
- **`m2-carryover.spec.ts`:** lines 123 and 134.
- **`m2-overlay.spec.ts`:** line 104.
- **`m2-layout.spec.ts`:** line 86.
- **`m2-run.spec.ts`:** lines 191–195.
- **Extension `test/suite/board.test.ts`:** the `lists` format changed. `styled` now checks the AXIOMS list and the canvas. `edges: 3` should still hold, since all three arrows are in view after the initial fit.
- **New test ids:** `canvas-tools`, `zoom-in`, `zoom-out`, `zoom-level`, `fit-all`, `zoom-selection`, `tidy-layout`, `board-menu` (items carry `[data-action]`), `also-assumed`, `assumed-menu`, `top-divider`, `vocabulary-column`, `definitions-column`, `canvas-empty`, `prompt-place`.

### Extension points left for 1c2
- In `BoardInput.ts`:
  - `pressOnEmptyCanvas` is where the selection rectangle starts.
  - `thingAt` already maps `path[data-edge-id]` (drawn arrows only) and `[data-mark-id]` to menu things.
  - `placeSlot`, `SLOT_SELECTOR` and the move press are there to build dragging into the column on.
- `DropZone` is ready to label the column as a "Move to axioms" drop zone.
- New store actions: `selectMark` and `selectForMenu`. 1b's `selectArrow`, `selectIncomingArrows` and `deleteSelectedArrows` remain.
- Overlay paths carry `data-edge-id`, `data-source`, `data-target` and `data-pattern`. Hit paths can go in the same SVG groups, because the canvas lets the pointer through to them.
- Over the column, its list sits on top of the overlay, so arrow segments there will need geometric hit-testing.
- 1b's temporary expanded-card arrow buttons still work.

### Effects outside the repo and my scratch dir
- vitest's own caches were written inside the repo but outside the allowed write folders:
  - `/home/zhengyew/telelean/node_modules/.vitest-cache`: 44 module-cache files added or updated, out of 993 already there.
  - `/home/zhengyew/telelean/node_modules/.vite-temp`: the extension vitest run's config loading changed its modification time; it is empty now.
- Inside `packages`, vitest updated `packages/{webview,core,runner}/node_modules/.vite/vitest/<hash>/results.json`.
- Nothing else. All runner temp files went to `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b1c1/runner-tmp`.
- `/tmp`'s own modification time changed during the session, but no new entries remain there; I can't attribute that change.
- No installs, no network, no Claude, no git commands. No processes of mine are left running.
