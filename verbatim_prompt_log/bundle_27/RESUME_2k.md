# Resume note for turn 27 (2026-11-23): sub-slices 2k1 and 2k2

## What the user asked (turn 27)
- the Exit/Apply fix;
- everything telelean keeps for a model local to the model folder, except the Claude CLI's own conversation files and the fact extractor.

The standing instructions and the quota-saving guidelines apply.

## Plan
- **The workflow** `chain_2k.js`, copied to resume_kit/scripts, is run by scriptPath from the scratch dir. For each of 2k1 (the Exit/Apply fix, brief `2k1.md`) and then 2k2 (the per-folder data, brief `2k2.md`), it runs:
  - an Opus builder;
  - two Sonnet verifiers (fidelity + code, and adversarial);
  - a Sonnet fixer and re-verifier, up to 2 rounds;
  - a Haiku integrator: `recheck_full.sh`, then `savepatch2.sh after_slice_<id>`.
- **Baseline:** HEAD 4640902 (the user's "2j" commit), with nothing staged. The patches are cumulative against HEAD, in `bundle_27/evidence/patches/`. dist/out were stamped 2026-11-22 07:58:19/20 (local, -0800).
- **After the chain** (orchestrator):
  1. A scratch webview build, then Playwright one spec at a time: `final_checks_2k/` (copy `final_checks_2j/` and change the dir names).
  2. The AP-8 rebuild: `vite build` in packages/webview, then `node scripts/build.mjs` in packages/extension.
  3. The VS Code suites (`run_vscode_smoke.sh`). The new VS Code e2e scenarios (Exit/Apply) run only here. A failure gets one Sonnet fixer, then a rebuild and a re-run.
  4. AP-46 onward in `bundle_21/user_requested_documents/02_autopilot_decisions.md`.
  5. subagent_reports from the journal; response27.md and modelinfo; memory.
- **Warn the user** before they reload into the new build: an open session in VS Code's storage is not migrated. Finish or Exit it first, with the old build.

## If interrupted
Resume the workflow with `resumeFromRunId` and the same scriptPath. Otherwise read the journal of the run and continue from the first unfinished agent.

## Launched
- 2026-11-23T02:22Z: run wf_d1a89afd-8fd (task wd6mcfatj); transcript dir ~/.claude/projects/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/subagents/workflows/wf_d1a89afd-8fd. RAM guard: background shell bf2xfqahb.

## STATUS 2026-11-23T05:20Z: chain stopped at the user's request (turn 27, 13:14 SGT)
- wf_d1a89afd-8fd was stopped during build:2k2. 2k1 completed (builder, fc, adv, fixer r1, integrator ok).
- Patches:
  - after_slice_2k1.patch: 19 files, the working tree now equals it byte for byte;
  - after_2k1_plus_2k2_partial.patch: 60 files, the tree at the stop;
  - slice_2k2_partial_only.patch: 48 files, diff -u, `patch -p1` against the 2k1 tree; checked to replay exactly.
- A pre-restore copy of the 60 files is in scratchpad/restore2k/pre_restore_copy.
- The RAM guard bf2xfqahb was stopped. dist/out are untouched (2026-11-22 07:58). HEAD is 4640902 with nothing staged.
- Not done for 2k1: Playwright, the AP-8 rebuild, the VS Code suites; AP-46 not yet written.
- About 1.73 M subagent tokens (estimated from transcripts; wf_usage can't read a stopped run).

## HANDOFF 2026-11-23 ~05:30Z
The user moved the work to another machine. The next session starts at `handoff/START_HERE.md`, which supersedes this file.
