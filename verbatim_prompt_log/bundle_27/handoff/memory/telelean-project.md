---
name: telelean-project
description: "telelean = VS Code extension mapping a user's mental model as ASSUMPTION/DERIVATION/GOAL nodes backed by Lean files, LLM via the user's own Claude Code CLI; status, key decisions, where the design docs live"
metadata:
  node_type: memory
  type: project
  originSessionId: 03a29d54-7342-40e3-b5f0-2697a62c93ef
  modified: 2026-10-31T22:30:12.650Z
---

**Goal** (spec: `verbatim_prompt_log/bundle_1/prompt1.md`). A VS Code extension with a 3-column board (assumptions / derivations / goals), independently scrollable, draggable, with cross-column arrows. Nodes are `@@ telelean` markup blocks in Lean comments. Natural-language prompts are tagged A/D/G. An LLM formalises the selected nodes, asks pragmatics questions, and proposes a diff shown on the board and as file diffs. A personal-use prototype ([[telelean-scope-personal-prototype]]).

**Status 2026-11-01 (turn 2).** The user approved the ★ recommendations of `bundle_1/user_requested_documents/02_design_decisions.md`, with amendments recorded in `/home/zhengyew/telelean/docs/design-amendments.md`, which override 02/03:
- **D-23(a):** the Claude Code CLI `-p` stream-json ("learnharness pattern"), NOT the Agent SDK. The user wants the tool LLM-agnostic eventually.
- **Gate loop:** auto-retry, capped at 3, then revert.
- **D-33:** history dropdown + disk counter.
- **D-31:** xvfb installed.
- **D-32:** dropped; `mental_model/` is the sample workspace.
- **D-23(b):** smoke-test quota allowed, but **announce the amount and purpose just before running it**.

Node 24.22.2 is installed at `~/.local/opt/node`, and the root npm packages are installed. **M0 is complete** (2026-11-01): spikes in `wf_1ea207b3-94f`, 201 tests passing, live smoke test passed, report at `docs/m0-report.md` with design facts that M1 must apply. The user installed `packages/extension` via "Install Extension from Location"; at M0 it shows only a static sample. **State 2026-11-10:** M2 is DONE with real Claude.
- **Walkthrough:** normative and literal both passed with Opus 5.5 high (8 and 11 requests).
- **Live demo:** passed through the real extension UI in the user's snap VS Code 1.145.2, via `packages/extension/scripts/demo-driver.mjs --live --vscode snap`: Socrates proved (6 requests); penguin not proved, then the suggested premise adopted, then proved (10 requests).
- **Demo guide:** `docs/DEMO.md`. The user wanted a fast demo and asked me to SKIP logging, write-ups and the audit (turn 13).
- **Environment:** the repo is now the user's git repo with remote `origin` (`snproj/telelean`): never push, commit or fetch. bwrap needs the snap's AppArmor label (Ubuntu 24.04 userns restriction), so run tests from the snap VS Code's shell. The extension needs workspace trust.
- **Still open:** the theory gaps in `docs/project-report.md` §3.7, M3/M4/H, the paused turn-9 audit, and the raw-diff placement decision.

**Repo layout:**
- `packages/{core,runner,extension,webview}`, `test-fixtures/spyro`, `scripts/smoke-claude.mjs`, `docs/`.
- The user's Claude binary: `~/.vscode/extensions/anthropic.claude-code-<ver>-linux-x64/resources/native-binary/claude`. There is no `claude` on PATH.

**Why:** The user reviews design before code and steers per milestone. **How to apply:** Read `docs/design-amendments.md` and the latest `verbatim_prompt_log/bundle_N/responseN.md` before continuing. Raise new significant design decisions instead of silently choosing. See [[prompt-logging-instruction]], [[user-profile]], [[watch-ram-usage]].

**Turn 15 (2026-11-13), INTERRUPTED by a shutdown.** The user asked me to do everything skipped in turn 13.
- **Done:** bundles 13 and 14; the disk-view audit (`bundle_15/user_requested_documents/01_…`).
- **TODO:**
  - redo the transcript-view audit, which was stopped early;
  - reconcile it with the disk view into one audit document with undo commands;
  - finish and review the docs agent's partial edits: `docs/m2-live-report.md` (new), `project-report*.md`, `user-guide.md`, `decisions-log.md`, `m2-plan.md`;
  - write the turn-15 interim log.
- **Disk-audit findings to report:** TypeScript ATA used the session's npm on Nov 10 (~13.7 MB in `~/.cache/typescript` + `~/.npm`); the `known-projects` line for `test-fixtures/spyro` came from the user's Lean extension (written 2026-11-01 09:09 +0800).

**Turn 16 (2026-11-16):** continuing turn 15's TODO in workflow `wf_f5e9a90d-309`: 3 transcript-audit slices, docs finish then fact-check, then reconcile.
- On completion: write the reconcile markdown to `bundle_16/user_requested_documents/01_modifications_audit_turns_9-16.md`, and save all agent reports to `bundle_16/subagent_reports/`.
- The user has STAGED 116 changes in the repo index (not me): never touch the index.
- **2026-11-16 update:** the user paused the audit to save quota.
  - The audit workflow `wf_f5e9a90d-309` was stopped.
  - Continuation instructions are in `verbatim_prompt_log/bundle_18/user_requested_documents/CONTINUE_AUDIT.md`. Run them only when the user asks.
  - The docs update continues in workflow `wf_a41b86fa-8e3` (docs:finish then docs:check).
- **2026-11-17 (turn 19):** the user stopped the docs agents (partial, unstaged edits in 6 docs files) and is moving to another machine.
  - Hand-off: `verbatim_prompt_log/bundle_19/user_requested_documents/HANDOFF.md`, with a memory snapshot alongside.
  - The user is now editing the source themselves.


**State 2026-11-22 (turn 22, new machine, session c398a83b): slice 2 of spec v4 is DONE.**
- Sub-slices 2a–2i are built and verified. The final checks passed: tsc ×5; core 1142, webview 435, extension 216, runner 883 (+1 planned skip); Playwright 21 specs / 118 tests; VS Code suites 53 passed, 8 pending.
- The extension is rebuilt into `packages/extension/dist` and `out` (git-tracked, so they show as modified). HEAD `1473ca0`, nothing staged: the user commits.
- AP-38 scope: STOP after slice 2. Slices 3–5 wait for the user's go-ahead.
- Open items:
  - a core reducer Undo/RV-7 defect, worked around in the runner (AP-42);
  - `docs/DEMO.md` and `scripts/demo-driver.mjs` still drive M2's review;
  - 7 skipped VS Code review scenarios.
- Resume material: `verbatim_prompt_log/bundle_21/RESUME.md` + `bundle_22/RESUME_ADDENDUM.md`; decisions log: `bundle_21/user_requested_documents/02_autopilot_decisions.md` (AP-1–AP-43).
- New machine: bwrap works from a plain shell, and the snap VS Code is 1.145.2 (`/snap/code/278`). There is no `.vscode-test/` 1.140.0 build, so run the VS Code suites with `scripts/smoke.mjs --snap`.

**Turn 23 (2026-11-22, a question only; nothing changed).** The user committed slice 2: HEAD is now `c557f06`.
- **Where things are:** demo folders live under `~/telelean-demos/` (plural). A run's review state is in `~/.config/Code/User/globalStorage/telelean.telelean/runs/<root>-<hash>/<run>/run.json`. Read it only.
- **Dead end found in `doorclose`:** an item "to be redone" whose content is kept counts as undecided. That keeps the results hidden, and Submit needs them shown, so it blocks Submit, against spec RV-3. The cause is my AP-24 rules AF4/D2-61 and D2-64.
- **What I proposed:**
  - a follow-up "2j": "to be redone" counts as finished; it has no Back to review; its dependents return to "in review" when the cause is un-declined; the item shows its cause; Submit's reason becomes visible text;
  - notes on every decline (lifting D2-13's Shaky-only rule), plus a note on "to be redone" items;
  - an overall comment at Submit (D2-13's recorded alternative);
  - a live read-only Q&A in a later slice, after a design note. The open question there is meaning before proof.
- The user decides which of these to do, and when.
- **Turn 25 (2026-11-22):** the user approved items 1–4.
  - **2j1 (D2-76):** to be redone counts as decided, with no Back to review and an automatic return.
  - **2j2 (D2-92):** notes on every decline and on to-be-redone items, plus a Submit comment.
  - Both are built, every check passes, and dist/out are rebuilt; NOT committed (HEAD c557f06). Patches are in bundle_25/evidence/patches; AP-44 and AP-45 are logged.
  - **Item 4:** only the design note, bundle_25/user_requested_documents/01_live_qa_design_note.md. Its 6 questions await the user (recommended: A, a fresh tool-less Claude given only the masked view).
  - **Open nit:** A-ADV-2j2-5 (a stale note line in decisions-since).
  - Slices 3–5 still await the go-ahead.
- **Turn 26–27 (2026-11-23):** the user committed 2j as 4640902. Turn 26 found two bugs: the Exit/Apply board bug, and run storage keyed by folder path, so a recreated folder inherited an old session.
  - **2k1 (Exit/Apply fix):** built and verified by the chain; the integrator passed. NOT committed. Its 19-file diff = bundle_27/evidence/patches/after_slice_2k1.patch.
    - Not yet run: the orchestrator's Playwright run, the AP-8 rebuild and the VS Code suites (including the new unrun Exit e2e scenario).
  - **2k2 (per-folder run data):** interrupted mid-build at the user's request, to rush to slices 3+.
    - The partial, unverified diff is in bundle_27/evidence/patches/slice_2k2_partial_only.patch (48 files, `patch -p1` against the 2k1 tree). The working tree was restored to 2k1 only.
    - It will likely need redoing after slice 3. The brief is in bundle_27/resume_kit/briefs/2k2.md.
- **End of turn 27 (2026-11-23 ~05:30Z):** the user moved the work to another machine, to go on to slices 3+.
  - The handoff package is `verbatim_prompt_log/bundle_27/handoff/START_HERE.md`, with `STANDING_INSTRUCTIONS.md`, `install_kit.sh` (rewrites machine paths into a new scratchpad), the kit, and these memory notes.
  - Next: bundle_29 (turn 28 was a short Q&A about where the six Q&A questions are); 2k1's final checks (ask the user first); AP-46; then slice 3's pre-build refresh, with an estimate given to the user first.
