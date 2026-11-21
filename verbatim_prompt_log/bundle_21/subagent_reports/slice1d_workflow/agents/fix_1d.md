# fix:1d

Agent `a3b3cb9eaf9b43510` of workflow `wf_a032f8ab-e62`. Verbatim output (JSON alongside).

## Fixer 1d report

I fixed the blockers (both verifiers' F1), the one major finding (verifier 2's F2) and every minor finding and nit. In three places I chose a different variant from the one a verifier suggested; each is explained under its finding. All checks pass, including the runner's real-Lean tests on the touched files.

Below, "V1" is the first verifier's list and "V2" the second's. Each list numbers its findings F1–F8.

### Findings

- **V1-F1 / V2-F1 (blocker): fixed.** In `geometry.ts`, every arrow of a band now enters the target's left edge, through the new `bandRoute`. This applies between two canvas cards when the target is in view.
  - **Source overlapping horizontally** (stacked above or below, or a 420 px expanded card): a loop on the left, from the source's left edge.
  - **Source on the right:** the arrow goes round the target, above it (below when the source's middle is below the target), and hooks into the left edge (new `aroundPath`). This also works when the source is out of view and the arrow comes in from the canvas edge.
  - Arrows outside a band keep BD-4's routes.
  - **Guard:** if any band arrow still gets no arrival slot, the band is drawn open (no seal) and its tooltip gains "Not every arrow of this band is drawn here, so it shows no ✓". This covers a missing source card, or a column source whose target is panned behind the column.
  - The bracket's padding is now at most half the arrival spacing.
  - The verifiers' own probe scripts (`band_stacked`, `band_right`, `band_crowded`) now show both arrows bound under the ✓, and the crowded bracket stops 4 px short of the neighbouring arrows.
  - 7 new geometry tests: source on the right with a non-band arrow kept on the right edge, stacked source, 420 px wide source, out-of-view source on the right, `bandRoute` cases, partly drawn band, crowded card.
- **V1-F2: fixed, slightly extended.** The band is open when v's own `.holds` or a direct(v) card's `.holds` has holds-mismatch. The tooltip says "its own .holds states something else (TL114)" or "the .holds of “‹card›” states something else (TL114)".
  - I left out hypothesis (`on`) cards: a conditional proof takes the statement, not the `.holds`, and that band is open anyway.
  - New `band.test.ts` case.
- **V1-F3: fixed.** On the `valueConsts` walk, a listed name that is neither card-bound nor in the facts makes the walk outdated, so v is marked stale.
  - I also stopped judging B.2's cross-check on outdated walks. Otherwise the renamed-lemma case also raised a spurious TL123 / `uses-unseen`.
  - New `direct.test.ts` case: a lemma renamed in a stale file makes v `['stale']`; with refs-only facts it is not stale.
- **V2-F2 (major): fixed.** `markEstablished` now treats `uses-unseen` as unsure, both for v itself and for every card its direct(v) reaches.
  - `direct.test.ts` now expects `['uses-unseen']` where it used to expect `['uses-unseen','established']`.
  - Added the TL114-behind-a-simp-lemma case, with and without the probe.
  - The real-Lean `valueProbe` fallback now asserts `['uses-unseen']`.
  - **Remaining gap (recorded in plan §8):** with refs-only facts, a card reached only through an un-owned simp lemma or instance whose basis the other cards explain still escapes both checks.
- **V2-F3: fixed, a different variant from the one suggested.** The walk is now outdated when it stops at another card's extra pinned name, or at its statement, and that declaration's file is not fresh or its facts are gone.
  - Statements are included because nothing else covers those files: a card reached by its statement is not in direct(v).
  - Not applied to stops at a card's `.holds`. That card's own stale/not-checked flags already block v's established status and band. Applying it there would break the 1a fixer's `status.test.ts` expectations (v's flags stay `[]` when l's file changed).
  - New `direct.test.ts` case: a pinned lemma in an edited file leaves u `['established']` and makes v `['stale']`.
- **V2-F4: fixed.**
  - `CheckFile.probeImports` is a new field. If the check fails at the imports and the probe added imports, `refresh.ts` runs the check once more without the probe.
  - In that case the facts have no `valueConsts`, the status is `check-errors`, and the detail reads "the value probe could not run: importing Lean.CoreM and Lean.Util.FoldConsts failed (…)".
  - Also fixed on the way: the probe's imports were added even when no declaration could be written. Now they are added only when there is a probe.
  - New real-Lean test: a model declares `Lean.Expr.getUsedConstants` and still gets its facts.
  - Test tests: `checkFile.test.ts` covers `probeImports`.
- **V2-F8: fixed, without its own test.** When the imports failed, `refresh.ts` no longer adds the value probe's own problems. There is no dedicated test because this case needs `lake env lean` to fail with no JSON output.
- **V1-F4: fixed.** New pure `edgeClass` built on `arrowLook`, now used by `EdgeEngine.writePaths`. `markerVariant` and `MARKER_VARIANTS` moved to `edges.ts`; `EdgeEngine` re-exports them. New test.
- **V2-F7: fixed.** A focused or selected TL107 arrow now keeps its notched head, in the focus colour (new marker variant `mismatch-focus`, with its CSS). The existing test was updated (it expected the plain focus head).
- **V1-F5: fixed.** `alsoAssumed(view, {hidden, current})`: in the Proposed view before the reveal, a card whose result is hidden counts as it is on the Current board, and a new hidden card is not counted. `AlsoAssumed.tsx` passes the overlay's hidden set. New `menu.test.ts` case.
- **V1-F6 / V2-F6: fixed.** `cardAura` now reads `.tl-card[data-glow="formalized"]:not([data-glow-dim])`. Added a `cardEstablished` field (the green glow).
- **V1-F7: fixed.** The arrow handle now takes its reason from `useBoard((s) => gestureGateOf(s).draw)`, the rule already tested in `store-gestures` and `gestures`.
- **V1-F8 / V2-F5: fixed.** Plan §8 now also lists `board.spec.ts:202` and `m2-overlay.spec.ts:94`. A new §8 entry, "fixer 1d", records all the decisions above, and the builder's "known limit" line now points to it.

### Files changed (22, all under /home/zhengyew/telelean)
- **Docs:** `docs/slice1-plan.md`
- **Core:**
  - `packages/core/src/project/edges.ts`, `packages/core/src/project/build.ts`
  - test: `packages/core/test/project/direct.test.ts`
- **Runner:**
  - `packages/runner/src/semantic/checkFile.ts`, `packages/runner/src/semantic/refresh.ts`
  - tests: `packages/runner/test/semantic/checkFile.test.ts`, `packages/runner/test/semantic/valueProbe.test.ts`
- **Webview source:**
  - `packages/webview/src/board/geometry.ts`, `band.ts`, `edges.ts`, `EdgeEngine.ts`, `Board.tsx`, `NodeCard.tsx`, `diagnostics.ts`, `assumed.ts`, `AlsoAssumed.tsx`
  - `packages/webview/src/styles/board.css`
- **Webview tests:** `packages/webview/test/unit/geometry.test.ts`, `band.test.ts`, `edges.test.ts`, `menu.test.ts`

The full patch is at /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f1d/fixer1d.patch.

### Verification
All runs used `capped.sh`, one job at a time, with vitest on one worker.

| Check | Result |
|---|---|
| tsc webview app config | exit 0 |
| tsc webview node config | 6 errors, all in e2e specs (m1-edits, m2-layout, m2-review); identical to the verifier's baseline log |
| tsc core test config | exit 0 |
| tsc runner test config | exit 0 (re-run after the last runner change) |
| tsc extension | 9 errors, all in `test/suite`; identical to the verifier's baseline |
| webview vitest | "Test Files 17 passed (17)", "Tests 290 passed (290)" |
| core vitest | "Test Files 53 passed (53)", "Tests 580 passed (580)" |
| extension vitest `--no-cache` | "Test Files 22 passed (22)", "Tests 197 passed (197)" |
| runner `test/semantic` (cap 1800, timeout 900, real Lean) | "Test Files 7 passed (7)", "Tests 53 passed (53)" |
| runner `integration/session` + `proposal/build` (real Lean) | "Test Files 2 passed (2)", "Tests 15 passed (15)" |
| scratch webview build into …/scratchpad/f1d/webview-build | "✓ 208 modules transformed", "✓ built in 201ms" |

The `valueProbe` verbose run printed: `[value probe, clash] status=check-errors; detail=check: the value probe could not run: importing Lean.CoreM and Lean.Util.FoldConsts failed (1:0: import Lean.Util.FoldConsts failed, environment already contains 'Lean.Expr.getUsedConstants' from Model.Clash.Main)`.

The timestamps of `packages/extension/dist` are unchanged; nothing new appeared in `dist` or `out`. Logs are in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f1d/.

### Effects outside the repo source and my scratch dir
- **Test-tool byproducts:** `node_modules/.vitest-cache` (28 files), `packages/{core,runner,webview}/node_modules/.vite` (1 file each), and `/tmp/node-compile-cache` (1 file).
- **Transient systemd user scopes:** from `capped.sh` and runLean; all ended, and no `telelean-*` units remain.
- **Lean:** ran through the runner's toolchain binaries, never the elan proxies, in temporary projects under `TELELEAN_TEST_TMP` set to my scratch dir. The tests removed them; an empty `f1d/tmp/tmp` folder remains.
- **Git and processes:** no git command that changes state was run, and none of my processes are left. The `waitwf.sh` script and a VS Code `claude -p` run that are still running are not mine.

