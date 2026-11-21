# build:1c2

Agent `ab13903d90ce02f90` of workflow `wf_2d1ec6a9-856`. Verbatim output (JSON alongside).

## Builder 1c2 report: arrow gestures and selection

The arrow gestures work, with one limit: they are checked by unit tests only. The pointer wiring itself (`BoardInput.ts`, the DOM side of the EdgeEngine) has not run in a browser, because Playwright is not mine to run. Typecheck is clean except the 6 known e2e-only errors; vitest passes 244/244; the scratch build succeeded and `dist/` was not touched. Only the webview changed (no core, extension or runner files).

### Files changed
All paths are under /home/zhengyew/telelean.
- **New: `packages/webview/src/board/gestures.ts`.** The pure rules:
  - which arrows can be clicked (`hitRole`, `clickOutcome`, `hitThing`);
  - distance hit-testing (`pathPoints`, `arrowAt`);
  - the selection rectangle (`areaSelection`);
  - drawing (`drawTarget`, `cycleThrough`, `drawHint`, `rubberBandPath`);
  - dropping on the AXIOMS column (`canvasDropOutcome`);
  - the Delete key (`deleteOutcome`);
  - what is allowed during a run or in the Proposed view (`gestureGate`).
- **`src/board/BoardInput.ts`:**
  - hover, click and Ctrl-click on arrows and ∅ stubs, with distance hit-testing on the column's background;
  - the handle drag with its rubber band and hint;
  - the selection rectangle;
  - dropping a moved card on the column;
  - Esc cancels; a gesture in progress is cancelled when a run locks the board or the Proposed view opens.
- **`src/board/EdgeEngine.ts`:**
  - a `path.tl-edge-hit` after every drawn or undeclared arrow, and a hit line on every ∅ stub;
  - the hover look;
  - new queries: `toBoard`, `canvasViewRect`, `drawnPaths`, `drawnMarks`, `cardBoxes`, `sourceAnchor`, `hitTestColumn`.
- **`src/board/Board.tsx`:** a new top layer that never takes the pointer (`svg.tl-draft`, holding the rectangle and the rubber band) and the hint `div.tl-draw-hint`.
- **`src/board/NodeCard.tsx`:** the handle `span.tl-handle[data-handle][data-nodrag]`, not rendered when locked, in the Proposed view, or on an unsaved card. Delete now calls `pressDelete(id)`.
- **`src/board/CardDetails.tsx`:** removed 1b's temporary "Draw arrow from the selection" button, in both the normal and the Proposed-view row.
- **`src/board/menu.ts` and `src/board/ContextMenu.tsx`:** a new `undeclared` menu thing; its right click keeps the selection; actions "Draw this arrow" (calls `addArrows`), Show source, Show target.
- **`src/board/AxiomsColumn.tsx`, `src/board/DropZone.tsx`, `src/board/PropositionCanvas.tsx`:** the column's drop zone while a canvas card is over it. `DropZone` now takes the card's `id` as a prop.
- **`src/state/store.ts`:** `pressDelete`, `selectArea`, `overAxioms` with `setOverAxioms`, and `gestureGateOf`. `overAxioms` is cleared when a run locks the board, on a subject change, and on switching to the Proposed view.
- **Smaller:**
  - `geometry.ts`: `EdgeSpec.declared`; `canvasRect` is now exported.
  - `main.tsx`: the global Delete calls `pressDelete(null)`.
  - `styles/board.css`: rules for all of the above, including high contrast.
- **Docs:** `docs/slice1-plan.md` section 8 has a new 1c2 entry with every decision.

### Tests
- **New `test/unit/gestures.test.ts` (17 tests):**
  - arrow roles, checked on real display edges;
  - click outcome and menu thing for a hit;
  - path sampling and distance hit-testing (ties, tolerance, loops);
  - rectangle membership (whole canvas cards in reading order; whole drawn arrows only; marks);
  - draw targets and refusals (already drawn, unsaved card, a cycle named as core names it);
  - the hint text, including the axiom impact (AR-6);
  - the rubber band, the column drop, the Delete rule, the gate.
- **New `test/unit/store-gestures.test.ts` (13 tests):**
  - `pressDelete`: arrows plus a mark give one `removeArrows` with `marks`; a focused card's dialog only when nothing is selected; the A16 dialog; the locked and Proposed-view reasons;
  - `selectArea`: replace, Ctrl adds, invalid entries dropped, works during a run, nothing in the Proposed view;
  - `overAxioms`, and the "Move to axioms" dialog a drop runs;
  - `gestureGateOf`.
- **Updated:**
  - `menu.test.ts`: +2 tests for the undeclared arrow;
  - `store-lock.test.ts`: `pressDelete` added to the locked sweep;
  - `store-arrows.test.ts`: one test retitled (the store action now serves the menu).
- No tests deleted.

### Verification
All run through capped.sh, one job at a time, with the binaries from `node_modules/.bin`.
- `tsc --noEmit -p tsconfig.json`: exit 0, no output.
- `tsc --noEmit -p tsconfig.node.json`: the same 6 known errors, all in files I did not touch:
  - `test/e2e/m1-edits.spec.ts` 222, 252, 259 (TS2345);
  - `test/e2e/m2-layout.spec.ts` 277 (TS2353);
  - `test/e2e/m2-review.spec.ts` 234 (TS2353, TS2339).
- `vitest run --maxWorkers=1 --pool=forks`: "Test Files 15 passed (15) / Tests 244 passed (244)".
- Scratch build with `TELELEAN_WEBVIEW_OUT=/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b1c2/webview-build vite build`: "✓ 206 modules transformed … ✓ built in 231ms". The bundle contains the new code and no longer contains "Draw arrow from the selection". `packages/extension/dist/webview` still has its 2026-11-17 timestamps.

### Decisions
Full list in section 8 of the plan; these are the ones you might not expect:
- **Hit paths:** they carry `data-hit-edge`, never `data-edge-id`, so the existing arrow counts (the "rendered" diagnostic, e2e helpers) are unchanged. The visible arrows no longer take the pointer; the hit path carries the tooltip, and the visible path keeps its `<title>`.
- **Undeclared arrows:** any verified arrow without a declared premise is "undeclared", whether or not it shows the TL107 warning colour. It has its menu only.
- **Click on empty canvas:**
  - a plain click now clears the selection;
  - Ctrl/Cmd-click keeps it;
  - a click that only closes an open menu keeps it.
- **Rectangle:** applied on release, no live preview. It is fixed in screen space and clipped to the canvas.
- **Drawing:**
  - over an axiom, the hint shows the impact before release; on release, 1b's dialog still opens, as the brief says;
  - releasing over a refused card shows the reason as an info toast and sends nothing;
  - releasing elsewhere, or on the source card, cancels silently.
- **Cycles:** the webview checks for cycles itself, to warn before release, over drawn arrows plus verified edges. It skips an old axiom's `premises:`; the host still checks those.
- **Several cards dropped on the column:** refused ("Move one proposition at a time to the axioms"). The cards go back where they were.
- **Axiom dragged onto the canvas:** unchanged; 1a's info toast stays on drop.
- **Delete in the Proposed view:** with arrows or marks selected, it shows "Arrows change only through review items and transforms." A card's Delete there still does nothing.

On the relayed user request: during an edit session every editing gesture here is off (no handles, no moves, no drops, Delete refused with the reason). Selecting still works, since it does not change files. I did not touch undo/redo; that is the session Undo of slice 2.

### E2E specs needing updates (not run)
- **`webview/test/e2e/m1-drag.spec.ts` AT6.9:** dragging `cynder-not-good` from the canvas onto the AXIOMS column now runs "Move to axioms". Expected:
  - while hovering, `.tl-dropzone[data-kind="AXIOM"] .tl-dropzone__summary` reads "Move to axioms: adds axiom cynder_not_good.holds";
  - after the drop, the rationale dialog opens and `kindChange { from: 'PROPOSITION', to: 'AXIOM' }` is posted;
  - the card then sits in `.tl-axioms .tl-col__list`.
- **Other `dragCard` uses** (`m1-drag`, `m1-store`, `m1-lean-code`, `m2-carryover`) drag axioms. 1c2 changes nothing for them beyond what 1a and 1c1 already outdated.
- **Presses near a card's right edge:** a press on the title line at the right edge now starts an arrow. The helpers press the sentence, so they are unaffected.
- **Plain click on empty canvas:** it now clears the selection. No current spec clicks there after selecting.
- **New coverage for 1g:**
  - drawing by the handle (rubber band, hint, release into a proposition and into an axiom with its dialog, Esc);
  - clicking and Ctrl-clicking arrows and stubs, including on the column's background;
  - the undeclared arrow's menu;
  - the rectangle with Ctrl;
  - Delete of arrows and marks;
  - dropping one card or several on the column;
  - no handles during a run or in the Proposed view.

### Effects outside the repo and my scratch dir
- `/tmp/node-compile-cache/v24.21.0-x64-964aae3f-1000/5b8de6f0` (5932 bytes): Node's compile cache, written during the vite build. The directory already existed.
- Short-lived systemd user scopes started by capped.sh.
- In the repo but not source: vitest updated its results cache at `packages/webview/node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json`.
- No git changes, no installs, no network, no Playwright or VS Code tests, nothing left running.

### Scratch files
- Pre-change snapshot: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b1c2/before
- My changes only, as a diff: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b1c2/1c2-changes.diff
- Build output: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b1c2/webview-build
