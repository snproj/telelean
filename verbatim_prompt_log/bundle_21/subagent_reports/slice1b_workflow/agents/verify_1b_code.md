# verify:1b:code

Agent `afd7eaab2a8a33177` of workflow `wf_28f0bd61-9bc`. Verbatim output (JSON alongside).

- **summary:** Sub-slice 1b does what the brief and its V4.1 updates ask, and the builder's verification claims hold. Nothing I found is a blocker or major: one minor latent defect and five nits.

**The patch is current.** I rebuilt the 1b diff from the builder's saved originals in `scratchpad/b1b/orig`, and it is identical to `b1b/1b.patch`. Every file changed since 1b started is either among those originals or one of the four new test files.

**Checks I re-ran.** Every typecheck and unit suite, one at a time under capped.sh, with `node_modules/.bin` binaries (no npx), vitest on one worker:
- Core, runner and webview typecheck clean.
- The webview node config (6 errors) and the extension (9 errors) fail only in e2e/suite files. The errors are line for line the same as the 1a fixer's logs.
- All vitest counts match the report, and `packages/extension/out` and `dist` were left unchanged.
- In the runner I ran the builder's 6 files plus the other 4 files that import the changed `fakeCore.ts`, each batch under `timeout 900`. All pass. The only skips are the two Lean builds that wait for 12 GB of free RAM.

**Code review.** Each new action is one plan: the axiom-to-proposition change goes with its arrows or mark, and a drawn arrow removes the "follows from nothing" mark. The cycle check covers drawn arrows plus verified edges, including an old axiom's premises from before v4. A confirmed change never skips the cycle check. Two more points:
- **No new Claude path:** only the user's board messages and the run's fixed `set-premises` call `perform`.
- **Removed names:** none of the renamed or removed names remain in src or unit tests.

**Your stated concerns are not settled by 1b, by design: plan 1f handles them.** Until 1f lands:
- The Current tab stays editable during a run, including the new arrow edits.
- Ctrl+Z in the Proposed tab still posts an Undo of the Current board's last edit.

The plan (§2.7) already lists the arrow, from-nothing, claim-pending and move edits for 1f's read-only rule, so 1f needs to cover the five new messages and the new tray Remove button.

**Effects of my run outside my scratch dir:** the vitest result caches `packages/{core,runner,webview}/node_modules/.vite/vitest/*/results.json` were rewritten. Nothing else, and no processes are left. My probes and logs are in `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v1b/`.
- **findings:**
  - [1]
    - **id:** F1
    - **severity:** minor
    - **where:** packages/webview/src/state/store.ts:1920 (deleteSelectedArrows)
    - **problem:** With arrows and marks both selected, one Delete is not atomic. It sends `removeArrows` (which may wait in the A16 dialog) and, at once, one `setFromNothing` off per mark. If the user cancels the A16 dialog, the marks are already removed and the arrows are not: half a Delete is applied. It also costs 1 + M Undo steps and History entries for one key press (AR-1: each such change is one Undo step). This is latent in 1b: the only way to mix arrows and marks is `selectArrow(…, additive)`, which 1c wires to Ctrl-click.
    - **evidence:** A probe (`scratchpad/v1b/probe/probe-store.ts`, bundled with the local esbuild and run with node) selects the mark of a card plus the used arrow cynder-dark-past → cynder-not-good, then presses Delete. The A16 dialog opens, yet the messages already sent are [["setFromNothing",{"id":"extra","on":false,"requestId":"r1"}]]. After Cancel: `extra.fromNothing` is undefined, and the goal's premises are unchanged ["cynder-dark-past","new-spyro-pg","pg-no-dark-past"].
    - **fix:** Best: let core's `remove-arrows` also take `marks: string[]` and drop their `follows_from:` lines in the same plan. One Delete is then one plan, one Undo step and one A16 confirmation. Minimum: when the arrows need the A16 dialog, keep the marks in the dialog's pending change, send them only after Confirm, and send nothing on Cancel.
  - [2]
    - **id:** F2
    - **severity:** nit
    - **where:** packages/core/src/edit/planArrows.ts:141-166 (planAddArrows)
    - **problem:** A proposition with an arrow and a hand-written `follows_from:` line (TL023) gets the label "Make proposition: ‹card›" when an existing arrow is drawn again. The plan only removes the stray mark line; the card is already a proposition. The board cannot send this: its store answers "That arrow is drawn already." because the parser drops the mark.
    - **evidence:** Probe output: `TL023 redraw: OK label="Make proposition: P1 with both" nodes=["p1"]`. The `follows_from` line is removed and `premises: a1` is kept.
    - **fix:** When the target is a proposition and there is no new arrow, either refuse with "That arrow is drawn already." or label the plan "Remove 'follows from nothing': ‹card›".
  - [3]
    - **id:** F3
    - **severity:** nit
    - **where:** packages/webview/src/tray/SelectionTray.tsx:64 (SelectedArrows Remove); packages/webview/src/state/store.ts:1886 (selectArrow)
    - **problem:** The new tray line for selected arrows stays on screen with an enabled Remove button in the proposed view. There `deleteSelectedArrows` silently returns false, so the button does nothing. `selectArrow` is also not guarded by `proposedOverlay`, unlike `selectIncomingArrows` and the other new actions. The plan's §8 entry says every new action does nothing while the proposed view is on screen.
    - **evidence:** `SelectionTray` renders `<SelectedArrows/>` regardless of the view. `deleteSelectedArrows` returns false when `proposedOverlay(s) !== null`. `selectArrow` has no such check.
    - **fix:** Disable Remove when `proposedOverlay(s) !== null`, with the read-only reason in its title. Add the button to 1f's list of editing UI to disable during a run, and guard `selectArrow` like `selectIncomingArrows`.
  - [4]
    - **id:** F4
    - **severity:** nit
    - **where:** packages/core/src/run.ts:521 (upgradeLegacyProposal)
    - **problem:** A recovered pre-v4 proposal drops the legacy TL102 ("rests on a goal asserted as an axiom") and sets `rests-on-pending`, but gets no new TL102. A freshly built graph now has both the flag and TL102 "The proof rests on pending: ‹ids›.". The builder documented this gap; the code was left untouched.
    - **evidence:** `run.ts:521` filters out the legacy TL102 message. `build.ts:655` pushes the new TL102 next to the flag.
    - **fix:** In `upgradeLegacyProposal`, when a node keeps or gains `rests-on-pending`, replace its legacy TL102 with `{ code: 'TL102', severity: 'warning', message: `The proof rests on pending: ${pendingIds}.` }`, as build.ts does. Add a case to `test/proposal/legacy.test.ts`.
  - [5]
    - **id:** F5
    - **severity:** nit
    - **where:** docs/slice1-plan.md:301 (§8 1b, "E2E tests not updated") and the builder report
    - **problem:** The list of e2e tests that need updates misses specs that click the expanded card's kind button by its old name. That button is now "Move to axioms", and for a card with a reason it now opens the rationale dialog first.
    - **evidence:** packages/webview/test/e2e/m1-fixes.spec.ts:251 and packages/webview/test/e2e/m2-carryover.spec.ts:87 and :100 use `getByRole('button', { name: 'Make Assumption' })`. They were already outdated by 1a.
    - **fix:** Add these three locations to the §8 list for 1g.
  - [6]
    - **id:** F6
    - **severity:** nit
    - **where:** packages/runner/src/proposal/service.ts:95-99 (layoutOf)
    - **problem:** The proposed graph is built with `layoutOf(currentGraph)`, which rebuilds only the columns. The new `TlGraph.positions` therefore never reaches the proposed graph, so 1c's Proposed canvas would place cards differently from Current. This is harmless in 1b, which has no canvas.
    - **evidence:** `layoutOf` returns `{ format, version, columns }` only. `subjectGraph` fills `positions` from `options.layout.positions`.
    - **fix:** Carry the positions over: `...(graph.positions ? { positions: graph.positions } : {})` in `layoutOf`, or add this to 1c's brief.
- **checks_run:**
  - Patch check: regenerated the 1b diff from scratchpad/b1b/orig against the working tree: identical to b1b/1b.patch (33 files, 3332 lines). Files modified since 02:46 = the orig list + 4 new test files.
  - capped.sh 1400 node_modules/.bin/tsc --noEmit -p packages/core/tsconfig.test.json -> exit 0, no output
  - capped.sh 1400 node_modules/.bin/tsc --noEmit -p packages/runner/tsconfig.test.json -> exit 0, no output
  - capped.sh 1400 node_modules/.bin/tsc --noEmit -p packages/webview/tsconfig.json -> exit 0, no output
  - capped.sh 1400 node_modules/.bin/tsc --noEmit -p packages/webview/tsconfig.node.json -> exit 2, 6 errors (test/e2e/m1-edits.spec.ts x3, m2-layout.spec.ts x1, m2-review.spec.ts x2), identical to f1a/tsc_webview_node1.log apart from the path prefix
  - capped.sh 1400 node_modules/.bin/tsc --noEmit -p packages/extension/tsconfig.json -> exit 2, 9 errors (test/suite/runs.test.ts x5, e2e-runs.test.ts x2, e2e.test.ts x1, model.test.ts x1), identical to f1a/tsc_ext1.log
  - packages/core: capped.sh 1600 vitest run --maxWorkers=1 -> 'Test Files  52 passed (52)' / 'Tests  556 passed (556)'
  - packages/webview: capped.sh 1600 vitest run --maxWorkers=1 -> 'Test Files  9 passed (9)' / 'Tests  153 passed (153)'
  - packages/extension: capped.sh 1600 vitest run --no-cache --maxWorkers=1 -> 'Test Files  21 passed (21)' / 'Tests  185 passed (185)'; listing of out/ and dist/ (31 entries, mtimes and sizes) unchanged before and after
  - packages/runner (TELELEAN_TEST_TMP in my scratch): capped.sh 1800 timeout 900 vitest run --maxWorkers=1 test/workspace/{arrows,history,realcore,perform,undo,sample}.test.ts -> 'Test Files  6 passed (6)' / 'Tests  49 passed | 1 skipped (50)' (skip: sample.test.ts:105, waits for 12 GB of free RAM)
  - packages/runner, the other fakeCore importers: capped.sh 1800 timeout 900 vitest run --maxWorkers=1 test/workspace/{m2members,refresh,scan}.test.ts test/proposal/sidecars.test.ts -> 'Test Files  4 passed (4)' / 'Tests  37 passed | 1 skipped (38)' (skip: refresh.test.ts:361, waits for 12 GB of free RAM)
  - Test counts in the new files: core arrows 27, protocol.arrows 3, runner arrows 6, webview store-arrows 21 (as reported)
  - Probe (esbuild bundle in scratch, run with node): core planAddArrows on a TL023 card -> label 'Make proposition: P1 with both' (F2)
  - Probe (esbuild bundle in scratch, run with node): store Delete with a used arrow and a mark, then Cancel -> setFromNothing already sent, arrows kept (F1)
  - Sweeps: grep for hint-d13, the old D-13 hint text, 'Make Assumption'/'Make Axiom' locators, .tl-details__actions, Escape/Delete in e2e; every perform() caller (only boardSession and the run's set-premises); @telelean/core resolution (src via paths/alias, no dist); no leftover processes
