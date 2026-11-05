# fix-2:extension+webview (agent a371eee0157a82655)

## summary
Both minor issues are fixed, and every affected suite passes on the final build.

(1) Empty Accept wording. The run panel no longer says "Accepted: Claude's changes are in your files. Undo…" when an Accept changed nothing.
- When Accept is sent, the store now records whether it will change files (`accepted`). It decides from the proposal's `empty` flag plus any ticked card changes (lifecycle). This matters because the host ends the run before it answers the Accept.
- The host's answer then settles it: `undoable` is false exactly when Accept applied nothing. A refused Accept, a new run, or no run clears the record.
- The panel then reads "Recorded: nothing in your files changed; the outcome is in the card's Attempts.", with no Undo or History hint. This matches the runner's toast. The outcome element carries `data-outcome="recorded"`.
- A board that did not send the Accept itself (opened afterwards) falls back to the run's last info notice, which is the runner's own "Recorded: … (no file changed)." or "Accepted: … Undo reverts it.".
- In the same spirit, the Accept tooltips (review and banner) and the empty-round note now say what Accept really does. For an empty round they say there is no Undo step. If a Goal->Derivation tick would change a file even though the round changed none, they say that instead.
- Tests: 3 unit tests and 3 Playwright cases.

(2) Literal e2e checks. The VS Code end-to-end literal test now checks, after Accept and once Lean has checked the accepted files:
- the derivation's `premises:` line includes the adopted card;
- the graph's premises equal the three premises plus `a-character-who-cannot-be-in`;
- there is no TL107 diagnostic;
- no edge has a mismatch.
- On the board itself: the verified arrow from the adopted card is drawn, no arrow is marked as a mismatch, and the derivation has no attention badge.

The first full smoke run turned up a real runner race. The cheating test's start was refused with ENOENT because the shadow copies `.lake/build` while the Lean check started by the previous test's Undo was rewriting it. I made the e2e start wait until Lean is idle on fresh facts, and reported the runner bug as an open issue.

## files_changed
- /home/zhengyew/telelean/packages/webview/src/state/store.ts
- /home/zhengyew/telelean/packages/webview/src/model/run.ts
- /home/zhengyew/telelean/packages/webview/src/run/RunPanel.tsx
- /home/zhengyew/telelean/packages/webview/src/run/Review.tsx
- /home/zhengyew/telelean/packages/webview/src/run/ProposalBanner.tsx
- /home/zhengyew/telelean/packages/webview/test/shared/runs.ts
- /home/zhengyew/telelean/packages/webview/test/unit/run.test.ts
- /home/zhengyew/telelean/packages/webview/test/unit/store-run.test.ts
- /home/zhengyew/telelean/packages/webview/test/e2e/m2-review.spec.ts
- /home/zhengyew/telelean/packages/extension/test/suite/e2e-runs.test.ts
- /home/zhengyew/telelean/packages/extension/dist/webview/ (rebuilt by vite: webview.js, webview.css, maps, assets)
- /home/zhengyew/telelean/packages/extension/dist/extension.js, extension.js.map, dist/bin/telelean-path-guard.mjs (rebuilt by scripts/build.mjs)
- /home/zhengyew/telelean/packages/extension/out/test/suite/*.js (rebuilt test bundles)
- /home/zhengyew/telelean/packages/webview/test-results/*.png (Playwright screenshots regenerated; new m2-review-empty-accept.png)

## test_runs
All results below are from runs on the final sources unless noted.

Webview:
- Typecheck (`tsc -p tsconfig.json` and `tsc -p tsconfig.node.json`): exit 0.
- Unit tests (vitest): 8 files, 130 passed (3 new).
- Playwright (full suite, built bundle, Chrome isolated): 81 passed (3 new). The home guard reported the real Chrome locations unchanged.

Extension:
- Typecheck: exit 0.
- Unit tests (vitest): 19 files, 166 passed.
- `vite build` and `scripts/build.mjs` succeeded ("bundle loads: extension.js exports activate and deactivate").

VS Code smoke (scripts/smoke.mjs, isolated profile under my scratch dir, FakeBackend, TELELEAN_NO_REAL_CLAUDE=1, LEAN_NUM_THREADS=4, MemAvailable watch; it never dropped below about 53.5 GB):
- Run 1, only the "M2 end to end" suite, before my last small webview refinement: 7 passing, including the literal test with the new assertions.
- Run 2, full: smoke instance 36 passing; e2e instance 19 passing, 1 failing. The cheating test's start was refused because the shadow seeding raced a Lean refresh (ENOENT on `.lake/build/ir/Model/Spyro/Vocabulary.c`).
- Run 3, full, final, with the fresh-facts wait before each start: smoke instance 36 passing; e2e instance 20 passing (M1 13, M2 7); 0 isolation failures; no leftover process.

## resolved
- webview minor: an empty Accept now reads "Recorded: nothing in your files changed; the outcome is in the card's Attempts." in the run panel, with no Undo or History hint, both before and after the host's answer. It no longer contradicts the runner's "Recorded: … (no file changed)" toast. A real Accept keeps "Accepted: … Undo (Ctrl+Z) or History reverts them." The host's `undoable:false` also turns a non-empty proposal whose Accept applied nothing into "Recorded". A board opened after the Accept reads the run's last notice. Playwright cases are in m2-review.spec.ts; unit tests are in run.test.ts and store-run.test.ts.
- extension minor: the literal VS Code e2e test, after Accept and once Lean has checked the accepted files, asserts the `premises:` line with the adopted card, no TL107, and no mismatched edge. On the board it also checks the verified arrow from the adopted card, no mismatch arrow, and no attention badge on the derivation. It passed in two VS Code runs.
- extra (same issue): the Accept tooltips and the empty-round note now match what Accept does. They say there is no Undo step for an empty round, and say a ticked Goal->Derivation change does write the file.

## open_issues
- Runner, outside my paths, real bug. `createRunShadow` (`runner/src/shadow/index.ts`) races the workspace's own Lean refresh.
- What happens: `collectBuildSeed` lists `<root>/.lake/build`, then calls `lstat` and `copyFile` on each file. If `lake build` rewrites `.lake/build` in between, `lstat` throws ENOENT and the start is refused.
- Evidence: the e2e log shows `startRun refused (not-yet): telelean could not make the run's working copy: cannot create the shadow: ENOENT … runs_e2e_model/.lake/build/ir/Model/Spyro/Vocabulary.c`. This came right after an Undo triggered a refresh.
- A user who saves or undoes and then presses "These suffice" can hit it.
- The `set-premises` write in `RunManager.start` triggers a refresh just before the shadow is created, so that path is exposed too.
- Worse than the refusal: a seed copied during a build can mix artifacts of two builds (an .olean with another build's .trace), which Lake may trust. That is a proof-integrity risk.
- Suggested fix: seed only from a quiescent `.lake/build`. Either await or pause the ModelWorkspace's refresh around seeding, or verify that sizes and mtimes did not change during the copy. Treat ENOENT or any change as "no seed": an empty `build/.lake` is always correct, just slower.
- The e2e test now waits for Lean to be idle before each start, so it no longer exercises this race; it needs a runner-level test.
- Core/runner, optional. A board opened after an Accept learns whether files changed only from the runner's notice wording ("Recorded: … (no file changed)." or "Accepted: … Undo reverts it.").
- Suggestion: a structural `RunView` field, e.g. `accepted?: { changedFiles: boolean }`, set in `acceptNow` before `endRun`. The webview would prefer it and drop the text fallback.
- Until then, please keep that wording, and log this dependency in docs/m2-plan.md section 14 (docs/ is outside my paths).
- Observation: after the final smoke run, an empty transient scope from my test instance's extension host (`telelean-tlws1811849_2_1-23.scope`, empty cgroup) stayed 'active running'.
- smoke.mjs could not attribute it (it only notes such units), so I stopped it myself.
- Workspace dispose, or smoke.mjs's leftover check, may want to handle empty `telelean-tlws<own extension host pid>` scopes.

## minor_decisions
- **decision:** The panel words an empty Accept as "Recorded: nothing in your files changed; the outcome is in the card's Attempts." and marks it with `data-outcome="recorded"`.
  - **rationale:** This is close to the verifier's suggestion and to the runner's "Recorded" toast, and it tells the user where the outcome went. There is no Undo hint because no Undo step exists: Ctrl+Z would undo an older action.
- **decision:** The first guess at Accept time comes from the proposal's `empty` flag plus ticked card changes; the host's `undoable` then settles it. A fallback reads the run's last info notice only when this board did not send the Accept.
  - **rationale:** The host posts the accepted run before the Accept's answer, so the panel must be right before the answer arrives. A Goal->Derivation tick writes a file even when the round changed none. The fallback covers a board reopened while the accepted run is still shown.
- **decision:** The ended-run texts and the helpers (`endedOutcome`, `acceptChangedFiles`, `acceptChangesFiles`, `acceptTitle`) now live in model/run.ts; the review and the banner share one tooltip helper.
  - **rationale:** Pure helpers can be unit-tested, and one helper keeps the two Accept buttons from contradicting each other.
- **decision:** Besides the three graph-level assertions, the literal e2e test checks the board itself: the verified arrow is drawn, there is no `data-mismatch` arrow, and the derivation has no attention badge.
  - **rationale:** The original UX finding was what the user saw on the board (Problems 2 and a warning on the derivation). Waiting for the verified arrow also ensures the board has drawn the new Lean facts before checking.
- **decision:** `startFromTray` in e2e-runs.test.ts waits for fresh Lean facts before pressing "These suffice".
  - **rationale:** This makes the suite deterministic against the runner's seeding race, which caused the one failure. The runner bug itself is reported as an open issue.
- **decision:** I rebuilt with the per-package builds (webview `vite build`, then the extension's `scripts/build.mjs`) instead of the root `npm run build`.
  - **rationale:** The root build also re-emits packages/core/dist, which is outside my assigned paths and owned by the parallel fixer. The extension and webview resolve core from its sources, so the extension artifacts are identical either way.
- **decision:** After 01:30 I called the local tool binaries directly and pointed npm's log dir at my scratch dir.
  - **rationale:** My earlier npx/npm calls had written debug logs into the real ~/.npm/_logs (listed under effects outside the repo).

## effects_outside_repo
- ~/.npm/_logs: my npx/npm calls between 01:21 and 01:30 wrote 11 npm debug logs there (tsc, vitest, vite, playwright, typecheck). npm's own log rotation (default 10 kept) may have deleted older logs. Nothing was written there after I switched to the local binaries.
- /tmp/tl-pw-chrome-*: the Playwright harness made temporary directories for Chrome's isolated HOME and XDG, one per run (4 runs), and deleted them at teardown. The home guard reported the real Chrome locations unchanged each time.
- /tmp: the first extension unit-test run (before I set TELELEAN_TEST_TMP) created and removed its own temp dirs. I checked that nothing of mine was left in /tmp.
- systemd --user: the VS Code test instances' sandboxed Lean ran in transient telelean-* scopes. One empty scope of my own (`telelean-tlws1811849_2_1-23.scope`, created by my test instance's extension host) remained after the last run, and I stopped it with `systemctl --user stop`. A scope still running belongs to the other fixer (cwd in m2fix2-core-runner); I left it alone.
- The VS Code smoke runs kept everything under my scratch dir. Their checks found ~/.copilot, ~/.config/Code, ~/.config/google-chrome and the Trash unchanged, and no leftover process. ~/.elan was only read, by Lean.

