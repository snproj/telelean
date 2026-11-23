# fix:2k1:r1

Agent `a7fe7192437a8d146` of workflow `wf_d1a89afd-8fd`. Verbatim output (JSON alongside).

- **report:** FIXER 2k1 round 1: all findings handled. Four fixed, one declined as already moot, one declined with reasons, one judged cosmetic and left. S = /tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad, F = S/f2k1r1.

FINDINGS
- F-F1 (nit): not fixed. In `applyRun`, `set(patch)` and `receive(null)` run in one synchronous tick, and React reads the store snapshot when it renders, after both. So no render sees the ended run together with the session view. A second check in RunPanel's `session` selector could not be tested, because the store always clears first. Recorded in §8. Alternative: add that selector check untested.
- F-F2 (nit): fixed. The Playwright test is renamed to "2k1 (D2-100 D3): an ended run that arrives while the store holds its session view clears it, and a view of it arriving late is dropped: neither draws the review panel or the session bar". The §6.1 bullet is updated to match.
- A-F1 (nit): not fixed. The ended line also appears as the last notice in the folded "Earlier notices (n)". It is cosmetic, and the notice is what run.json records. Recorded in §8. Alternative: filter a notice equal to `endedText(run)` out of the plain panel.
- A-F2 (minor): fixed. The existing runner test "stops a running step …" now installs `heard(h)` and asserts `session()` is null and `endOf(changes)` equals `{change:{run,proposal,session:true}, state:'discarded', session:null}`. This is the Exit during a running step.
- A-F3 (minor): fixed. New runner test "session() turns with the run.json write that ends the run, as current() does, not before it (D2-101) …". It holds `RunFiles.prototype.writeState` when the text's `view.state` is 'discarded'. While held, `session()` is not null, `current().state` is 'review', and no end has been heard. After release, `session()` is null, `current()` is 'discarded', and the end's change is `ENDED` with `session: null`.
- A-F4 (minor): fixed in the VS Code scenario. The attempts assertion is relaxed to `attemptsOf(runId).map(a => a.resolution ?? a.verdict).at(-1) === 'discarded'`, with a comment. The badge text assertion is kept, because Playwright covers `runBadge`'s text. The scenario is still UNRUN and typechecks.

FILES CHANGED IN THIS ROUND (backups in F/backup, listed in F/changed_files.txt)
- packages/runner/test/run/session.end.test.ts: A-F2 and A-F3; the `RunFiles` import was added.
- packages/webview/test/e2e/s2-review.spec.ts: test title (F-F2).
- packages/extension/test/suite/e2e-runs.test.ts: the attempts assertion (A-F4).
- docs/slice2-plan.md: §6.1 (the D1 line gets the two new tests, and the browser bullet is reworded) and a new §8 block "fixer 2k1 r1 (2026-11-23)" with the fixes, the two declined findings and their alternatives, and the mutation checks. The extract is regenerated: `plan_extract.py 2k1` gave "2156 lines | §8 kept 3 of 51".
- No source file changed. The whole tree is still 19 files against 4640902 (before.diff 90032 bytes, after.diff 94564 bytes). HEAD is still 4640902 and nothing is staged.

MUTATION CHECKS
Each was run with F/mut/run_mutant.sh and restored byte for byte ("cmp ok").
- A3, runner/src/run/manager.ts `session()`: `isTerminalRunState(run.saved.view.state)` replaced by `run.ended`. It failed exactly 1 test, the new D2-101 one: "Tests 1 failed | 42 passed (43)".
- A2, the same line: null for every terminal state except 'discarded'. It failed 4 tests: the Exit during a running step (A-F2), Exit in a stage, Exit in the end confirmation, and the D2-101 test.
- I did not mutate F2's rename or A-F4's relaxation: neither is a rule fix.

VERIFICATION (S/capped.sh, one job at a time, TMPDIR=F/tmp, TELELEAN_TEST_TMP=F/ttmp, TELELEAN_NO_REAL_CLAUDE=1)
- runner: `capped.sh 1800 timeout 900 vitest run --maxWorkers=1 --no-cache --fsModuleCachePath=F/fsmc test/run/session.end.test.ts` gave "Test Files 1 passed (1) / Tests 43 passed (43)". It is the only runner file I touched.
- tsc `--noEmit -p`: exit 0 and no output for packages/runner/tsconfig.test.json, packages/extension/tsconfig.json (includes test/), packages/webview/tsconfig.json and packages/webview/tsconfig.node.json.
- Playwright: s2-review.spec.ts against the unchanged scratch build S/b2k1/webview-build gave "18 passed (30.6s)". The home guard reported unchanged. The webview source is unchanged, so the build is still valid.
- Not re-run, because no source changed: the core, webview and extension vitest suites, the real-Lean runner files and the other Playwright specs. Round 0's results stand: core 1193, webview 449, extension 217; session.end plus the other fake-engine runner files 133 + 120; m2flow 5, walkthrough.e2e 24, fresh.e2e 9; m2-run 5, s1-session 3, s2-board 8.

DECISIONS FOR THE ORCHESTRATOR TO LOG (each also in §8)
1. F-F1: keep D3 in the store only (D2-104). Alternative: add an `isTerminalRunState` check to RunPanel's `session` selector, untestable because the store clears first.
2. A-F1: leave the doubled ended line (the Outcome line plus the last notice in the folded history). Alternative: filter a notice equal to `endedText(run)` out of the plain panel.
3. A-F4: the VS Code scenario asserts only the last attempt record, 'discarded'. Alternative: keep the full ['proved','discarded'] list, copied from a scenario that is itself skipped.
4. F-F2: rename the Playwright test, add no new test. The test already covers the store's end-to-end behaviour (mutation W7 from round 0).
No decision differs from the brief's DESIGN.

EFFECTS OUTSIDE THE REPO AND THE SCRATCH DIR
- Playwright made temporary Chrome HOME/XDG folders under /tmp/tl-pw-chrome-*, which its teardown deleted. The home guard reported the real home unchanged.
- capped.sh made transient systemd user scopes. No telelean-* units or vitest/playwright processes remain.
- packages/webview/test-results was created by Playwright and moved to F/webview-test-results-moved.
- vitest and tsc wrote nothing to node_modules or dist/out. packages/runner/src/run/manager.ts has a new mtime from the mutation checks; its content equals the pre-round file (`cmp` ok).
- No npm, npx or downloads; no git state change.

Snapshots: before F/before.diff, after F/after.diff (after_slice_2k1 cumulative: F/after.diff).
- **notFixed:**
  - [1]
    - **id:** F-F1
    - **why:** Judged a non-defect: set(patch) and receive(null) run in one synchronous tick, so no render sees the ended run with the session view. A second RunPanel selector check cannot be tested because the store always clears first. Recorded in plan section 8 with the alternative.
  - [2]
    - **id:** A-F1
    - **why:** Cosmetic: the duplicate sits in the folded 'Earlier notices' list, and the notice is what run.json records. Left as is, recorded in plan section 8 with the alternative (filter a notice equal to endedText(run)).
