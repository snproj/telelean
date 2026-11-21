# fix:1c1

Agent `ab6011000ca098b26` of workflow `wf_13b8eae2-0c7`. Verbatim output (JSON alongside).

## Fixer 1c1 report

I fixed all 15 findings (one major, the rest minor or nit), and judged none of them wrong. All changes are in the webview and in `docs/slice1-plan.md`; core, extension and runner are unchanged. Every check from the brief passes, with only the known e2e and `test/suite` type errors. No git changes.

Below, the first verifier's findings are **A-F1…A-F6** and the second's are **B-F1…B-F9**.

### Findings
- **A-F1 (major), the ∅ stub looked Lean-verified: fixed.**
  - The stub is now drawn like a declared arrow: round dots, the `declared` arrowhead, and the declared widths (3 px focused, 3.6 px selected, with the halo; no halo in high contrast).
  - `EdgeEngine.writeMarks` uses the `focus` or `declared` marker instead of `verified`.
  - Plan §8 notes that the stub stays dotted and that 1d's band marks a checked proof from nothing.
- **B-F8 (nit), the ∅ tooltip could never show: fixed.**
  - The stub now takes the pointer (`.tl-mark { pointer-events: visiblePainted; cursor: help }`), so its tooltip shows and a right click on it opens the mark's menu. A left click on it does nothing until 1c2.
  - I corrected the plan's 1c1 menu note: today only a drawn conditional or mismatch arrow can already open the arrow menu.
- **A-F4 / B-F4, menu labels understated a mixed delete: fixed.**
  - New `removeSelectionLabel` in `menu.ts`. When the clicked arrow or mark is part of the selection, the label counts every selected arrow and mark, e.g. "Remove 2 arrows and 1 'follows from nothing' mark".
  - `MenuContext` gained `selectedMarks`, and `ContextMenu` passes it.
  - Extra: in the Proposed view (where the entry is disabled) the label names only the thing, never a selection left over from Current.
  - Menu test added.
- **A-F5 / B-F3, BD-8 ignored a selected axiom: fixed.**
  - The A|P box now goes by the card selected last. A proposition places the new card to its right, as before. An axiom places it at the canvas's left side, 24 px in, level with the axiom's top, kept in view.
  - Code: `newCardAnchor` in `PromptBox`, `CanvasView.newCardPosition(NewCardAnchor | null)`, and in `placement.ts` `besideAxiom` plus a `beside` option for `newCardPosition`.
  - Tests added.
- **A-F3 / B-F1, cards moved when switching Current ↔ Proposed: fixed.**
  - `PropositionCanvas` remembers, per subject, where the Current board last showed each card (stored or placed).
  - The Proposed view seeds the placement with those places (`keepCurrentPlaces`). The proposal's stored positions win, and only the proposal's new cards are placed by the layered placement.
  - This is display only: nothing is written and nothing reaches any Undo stack.
  - Trade-off: a changed card that grows by its ~18 px diff line can reach into the 22 px gap below it. If the Proposed view is the first view a webview ever shows, it falls back to the layered placement.
  - Test added, including the case where a changed card sits above an unstored card and both keep their place.
- **B-F2, keyboard focus lost when the canvas re-sorts: fixed.**
  - `PropositionCanvas` records which element on the canvas has the focus. After every new reading order, if the focus fell to `<body>`, it gives it back with `preventScroll` (to the same element, else its card).
  - A press anywhere else clears the record, so the focus never returns to a card the user left.
  - I removed the move-only refocus from `BoardInput.finishMove`, since the general one covers it.
- **B-F6, touch and pen moves were cancelled: fixed.**
  - `lostpointercapture` now cancels a press only when `event.target === board`.
  - `.tl-canvas` has `touch-action: none`, so a touch drag on a card moves it.
  - I did not put it on the whole board, because that would stop touch scrolling in the AXIOMS column. Touch has no right button, so it cannot pan anyway.
- **A-F2 / B-F5, lost geometry test cases: fixed.** `geometry.test.ts` gains three cases:
  - an anchor clamped into the visible part of a partly scrolled card, through `computeFrame` and `anchor` directly;
  - two column cards in view joined by a loop on their right, under the board clip;
  - a column hook with one end scrolled away, cut up or down, with the ▲/▼ badge.
- **Deleted test, now listed (also in plan §8):** 1c1 deleted, without a counterpart, the after-1f case "finds the gap nearest to where the line wants to cross, inside the visible band". It went with `gutterY` and `routedPath`; v4's canvas routes arrows side to side, so nothing crosses a column. The after-1f `endpoint` and `sidesFor` cases became the `anchor`, visibility and `routeSides` cases.
- **A-F6 / B-F7, untested Proposed-view branch: fixed.** The `store-canvas` test now covers `newPropositionAt` in the Proposed view: it returns false, `newCardAt` stays null, and no toast is added.
- **B-F9, wrong comment: fixed.** It now says "At 25 %".
- **Also tidied:** the PromptBox component's doc comment was attached to the helper above it; it is back on `PromptBox`.

### Files changed (under `/home/zhengyew/telelean`)
- `packages/webview/src/styles/board.css`
- `packages/webview/src/board/EdgeEngine.ts`
- `packages/webview/src/board/menu.ts`
- `packages/webview/src/board/ContextMenu.tsx`
- `packages/webview/src/board/PropositionCanvas.tsx`
- `packages/webview/src/board/BoardInput.ts`
- `packages/webview/src/board/canvas/placement.ts`
- `packages/webview/src/board/canvas/CanvasView.ts`
- `packages/webview/src/prompt/PromptBox.tsx`
- `packages/webview/test/unit/geometry.test.ts`, `canvas.test.ts`, `menu.test.ts`, `store-canvas.test.ts`
- `docs/slice1-plan.md`: in-place corrections to the builder's 1c1 entry, plus a new entry "2026-11-19 (fixer 1c1, after the two verifications)".

### Verification
Everything ran through `capped.sh`, one job at a time, with binaries from `node_modules/.bin`. This vitest (v5.0.5) rejects `--poolOptions`, so I used `--maxWorkers=1`, which the rules allow.
- **Webview `tsc -p tsconfig.json`:** exit 0, no errors.
- **Webview `tsc -p tsconfig.node.json`:** 6 errors, the same known e2e ones (m1-edits ×3, m2-layout ×1, m2-review ×2).
- **Webview vitest:** "Test Files 13 passed (13)" / "Tests 212 passed (212)" (206 before; 6 new cases).
- **Scratch build** into `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f1c1/webview-build`: "✓ built in 240ms". `webview.js` is 505.09 kB, with the same Vite warning about chunks over 500 kB.
- **Core `tsc` (test config):** clean.
- **Core vitest:** "Test Files 52 passed (52)" / "Tests 566 passed (566)".
- **Extension `tsc`:** 9 errors, all in the known `test/suite` files (e2e-runs ×2, e2e ×1, model ×1, runs ×5).
- **Extension vitest `--no-cache`:** "Test Files 22 passed (22)" / "Tests 197 passed (197)". A file listing of extension `out/` and `dist/` before and after shows no change.
- **Runner `tsc` (test config):** clean.
- **Runner** `timeout 900 vitest run --maxWorkers=1 test/proposal/positions.test.ts`, with `TELELEAN_TEST_TMP` set to my scratch dir: "Test Files 1 passed (1)" / "Tests 2 passed (2)".
- **Not run:** Playwright or any browser. The pointer, focus, touch and tooltip changes have not been seen working in a real browser.
- Logs are in `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f1c1/`.

### Notes for the e2e update and for 1c2
- A right click just left of a marked card now hits the ∅ stub and opens the mark's menu, not the canvas menu.
- With an axiom selected, the A|P box places the new proposition at the canvas's left side. It is still in view, so `board.spec.ts` 433–440 should hold.
- API changes: `CanvasView.newCardPosition` now takes a `NewCardAnchor | null` instead of an id. New exports: `removeSelectionLabel`, `besideAxiom`, `BESIDE_AXIOM_INSET`, `keepCurrentPlaces`, and the type `NewCardAnchor`.

### Effects outside the repo and my scratch dir
- `/home/zhengyew/telelean/node_modules/.vitest-cache`: 9 module-cache files added or updated (1002 entries now).
- `.vite-temp` folders: their modification times changed when configs were loaded; all are empty. They are in `/home/zhengyew/telelean/node_modules` and `packages/{core,runner,webview}/node_modules`.
- `packages/{core,runner,webview}/node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json` were updated.
- `/home/zhengyew/telelean/.git`: the directory's modification time changed at 06:25:33. That was my first, read-only `git status`, which takes and removes `index.lock`; no file in `.git` changed.
- `/tmp`: its own modification time changed, but no new entries remain; I can't attribute it.
- `~/.copilot/session-state` and `~/.cache/copilot` changed during the session. Nothing I ran touches them; it is probably VS Code's Copilot.
- No installs, network, Claude or git writes. No processes of mine are left running.

Your relayed request (Current uneditable during an edit session, and no Undo interference between Current and Proposed) is unaffected:
- The Proposed view's kept places are only shown, never written.
- The new placement next to an axiom applies only to adds, which are disabled during a run.
- The remove entries stay disabled while locked and in the Proposed view.
