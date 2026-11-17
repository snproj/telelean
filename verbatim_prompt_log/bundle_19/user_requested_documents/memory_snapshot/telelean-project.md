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

