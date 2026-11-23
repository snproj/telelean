# Resume note for turn 25 (sub-slices 2j1 and 2j2, and the live Q&A design note)

The user asked for the four items of `bundle_23/response23.md` (turn 25 prompt: `prompt25.md`). The plan:
- **Build:** workflow `wf_93090c56-47b` (script: `resume_kit/scripts/chain_2j.js`). It builds 2j1 and then 2j2, each with:
  - an Opus builder;
  - two Sonnet verifiers (fidelity + code, adversarial);
  - Sonnet fix and re-verify rounds;
  - a Haiku integrator running `recheck_full.sh` (with the real-Lean runner suite).
- **Design note:** in parallel, a design note for the live Q&A. An Opus agent drafts it and a Sonnet agent fact-checks it; it goes to `user_requested_documents/01_live_qa_design_note.md`. Item 4 is not built this turn: the user approves the note first.
- **Briefs:** `resume_kit/briefs/2j1.md` and `2j2.md` hold the user's design decisions (D1–D7, N1–N6).
- **Baseline:** HEAD `c557f06`, the user's commit of slice 2; it equals `after_slice_2_final.patch`. Patches go in `evidence/patches/` (`after_slice_2j1.patch`, `after_slice_2j2.patch`), cumulative against `c557f06`, written by `savepatch2.sh`.
- **If interrupted:**
  1. Check the tree: `snapdiff2.sh /tmp/x.diff`, compared with the last saved patch.
  2. Add an "interrupted" note to that sub-slice's brief.
  3. Relaunch the chain for the remaining ids, with the leftover minor findings as carry-overs.
- **After the chain** (the same steps as slice 2's RESUME Step 4):
  1. Build the webview into scratch, then run Playwright one spec at a time (`run_specs.sh`).
  2. Run the VS Code suites (`run_vscode_smoke.sh`).
  3. Only if everything passes, do the AP-8 rebuild of `packages/extension/dist` and `out`.
  4. Add AP-44 onward to `bundle_21/user_requested_documents/02_autopilot_decisions.md`.
  5. Report the quota used and the Q&A questions to the user.

## Status at the end of turn 25 (2026-11-22 ~16:10Z)
- **Done:** the whole plan. The chain wf_93090c56-47b passed both sub-slices, and the final checks passed (Playwright 120/120, VS Code 53 passing). The AP-8 rebuild is done, and AP-44 and AP-45 are logged.
- **Nothing left to resume.** Next comes the user's answers to the Q&A note's questions, then a commit by the user, then slices 3–5 on the go-ahead.
