# Resume addendum (turn 22, session c398a83b; read after bundle_21/RESUME.md)

The repository moved to this machine. Everything in bundle_21/RESUME.md still holds, with these changes (logged as AP-39):

- **The git baseline:** HEAD is **`1473ca0`** (your commit "halfway through slice 2"), not `187673d`. It must stay `1473ca0` with nothing staged.
- **The patches** in `bundle_21/evidence/patches/` stay **cumulative against `187673d`**. The adapted `snapdiff.sh` and `savepatch.sh` (in `bundle_22/resume_kit/scripts/`, via `snapdiff_core.sh`) write that layout.
- **The adapted kit** is in `bundle_22/resume_kit/` (scripts and briefs). It hard-codes this session's scratchpad, `/tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad`. In a new session:
  - copy the kit into the new scratchpad;
  - `sed -i` that path to the new one in every copied file;
  - copy `bundle_21/resume_kit/{plans,extracts}` and the carry file;
  - rebuild the reference tree for the last finished sub-slice: `git archive 187673d -- packages docs test-fixtures scripts package.json tsconfig.base.json mental_model | tar -x -C <S>/tree_X`, then `git apply` that sub-slice's `after_slice_X.patch` inside it.
- **`node_modules`** was installed with `npm ci --offline` (it is git-ignored). If it is missing again, reinstall the same way, with `--logs-dir` pointing into the scratchpad.
- **The chain:** `chain_v5.js` was launched 2026-11-21 ~23:30 SGT as run `wf_bee8fde1-76d`, with ids 2e to 2i and carry `carry_open_2d.json`.
  - **If it is interrupted,** relaunch it from the first sub-slice with no `after_slice_<id>.patch`, after the tree check.
  - **The tree check:** `snapdiff.sh` compared with the last patch, plus a fresh "interrupted" note in that sub-slice's brief.
  - **The carry for the relaunch:** the previous sub-slice's leftover findings (`open` in the run's `journal.jsonl` results).
- **The integrator's checks** expect `dist`/`out` to be untouched in git (`git status --porcelain` on them prints nothing), with checkout mtime 2026-11-21 05:56:37 -0800.

## Update 2026-11-22 ~13:20 SGT
- **2e, 2f and 2g** passed in run `wf_bee8fde1-76d`.
- **2h** passed after the re-check of AP-40, which I ran (patch `after_slice_2h.patch`). The runner suite now takes about 40 minutes, so `recheck_full.sh` uses `timeout 5400`, and the integrator waits up to 150 minutes. Both changes are in `resume_kit/scripts/`.
- **2i** is running as `wf_2f71cf32-72e` (ids `["2i"]`, no carry-overs).
- **If it is interrupted:** check the tree against `after_slice_2h.patch` with `snapdiff.sh`, add an "interrupted" note to `briefs/2i.md`, and relaunch with ids `["2i"]`.
- **Then:** RESUME.md Step 4. Run the browser tests one at a time, rebuild `dist` (AP-8), add the AP entries (the decisions from 2b3a to 2i), write the report, and stop.

## Update 2026-11-22 ~15:56 SGT: slice 2 is finished, and the work stopped as AP-38 asks
- **2i** passed in `wf_2f71cf32-72e` (patch `after_slice_2i.patch`).
- **RESUME.md Step 4 is done:**
  - all 21 Playwright specs pass (118 tests);
  - the extension is rebuilt (AP-8);
  - AP-41 to AP-43 are appended to `bundle_21/user_requested_documents/02_autopilot_decisions.md`.
- **The VS Code suites, beyond the RESUME list.** The slice-2 plan's §6.3 lists them "if RAM allows", so they were run in your snap VS Code through `scripts/smoke.mjs --snap` (`resume_kit/scripts/run_vscode_smoke.sh`).
  - First run: 2 failures, both test problems. They were fixed in `wf_46e69f5f-f31`.
  - Second run: 53 passed, 8 pending.
  - `docs/slice2-plan.md` §8 has the entry dated 2026-11-22.
  - The final patch is `bundle_21/evidence/patches/after_slice_2_final.patch`.
- **`dist`/`out` are now rebuilt, so they show as modified in git (17 files).** The integrator's old check ("`git status` on dist/out prints nothing") no longer holds. A future chain must drop that check, or compare against the current files.
- **Next, only after the user's go-ahead:** slices 3–5. Open items:
  - the core reducer defect (AP-42; the runner works around it);
  - `docs/DEMO.md` and the demo driver still use M2's review;
  - the 7 skipped VS Code review scenarios;
  - F-F2 (AP-42).
