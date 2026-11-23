# Model and session metadata for response 27 (turn 27), 2026-11-23 SGT

## Session and timing

- **Session:** `c398a83b-d60f-46a4-ad9a-8d926e6fdd1b`.
- **Turn 27 began** at 2026-11-23T02:14:55Z (10:14 SGT) and ended at about 05:35Z (13:35 SGT). The context was compacted once, during the workflow.
- **The user's mid-turn messages** are in `prompt27_midturn.md`:
  - two status questions;
  - the question whether to interrupt 2k2;
  - the order to stop and restore;
  - the handoff request.
- **The replies to them** are in `response27_midturn_reply.md`.

## Models

- **The main loop:** Opus 5.5 (`claude-opus-5-5`), in Claude Code in the VS Code extension, on Linux.
- **Ultracode** was on at the start of the turn, and reported off after the compaction.
- **Workflow `wf_d1a89afd-8fd`** (task wd6mcfatj, script `subagent_reports/workflow_script.js`):
  - an Opus builder;
  - Sonnet verifiers (`fc`, `adv`) and a Sonnet fixer;
  - a Haiku integrator.

## What ran

- **2k1, the Exit/Apply fix**, ran in full:
  - the build;
  - two verifiers, with no blocker or major findings;
  - fix round 1, with 4 findings fixed;
  - the integrator: 5 tsc configs, vitest in core, webview and extension, and the full real-Lean runner suite, all passing.
- **2k2, per-folder run data:** its builder started at 04:22Z. It was **stopped at about 05:13Z** at the user's request, mid-build, so there is no 2k2 report.
- **Saved patches:**
  - `evidence/patches/after_slice_2k1.patch`, written by the integrator;
  - `after_2k1_plus_2k2_partial.patch` and `slice_2k2_partial_only.patch`, written by me after the stop.
- **The restore and its check:** I put the working tree back to 2k1 alone. That rewrote 60 files from a scratch copy built with `git archive HEAD` plus the 2k1 patch, and ran no git command that changes state. A fresh diff equals `after_slice_2k1.patch` byte for byte. I checked that the 2k2-only patch replays exactly onto 2k1.
- **The handoff package** `handoff/` was written for a session on another machine. I tested `install_kit.sh` in scratch against a fake new-machine layout: all scripts parse, there are no leftover placeholders, and the paths were rewritten.
- **Turn-25 log gap closed:** I appended the two missing mid-turn messages and the harness notices to `bundle_25/prompt25_midturn.md`.

## Token use

- **Subagents:** ≈ 1.73 M tokens. Computed per agent as its largest context plus its output tokens, summed over the run's six agent transcripts. `wf_usage.py` shows nothing for a stopped run.
  - 2k1 ≈ 1.2 M: the builder ≈ 0.78 M, the verifiers ≈ 0.14 M and 0.10 M, the fixer ≈ 0.13 M, the integrator ≈ 0.04 M.
  - The interrupted 2k2 builder ≈ 0.53 M.
  - My estimate for 2k1 was 0.6–0.8 M.
- **The main loop:** 82 API messages since 02:14:55Z, deduplicated by message id, measured before writing this file. ≈ 0.12 M output tokens, ≈ 11.3 M cache reads and ≈ 0.26 M cache writes.
- **telelean's own Claude runs:** none. All tests ran with `TELELEAN_NO_REAL_CLAUDE=1`.

## Ledger: downloads, installs and writes outside the repo

The method: a disk scan by inode change time since 02:14:55Z, plus a scan of all 649 tool calls of the workflow's agents. The scan of the tool calls found nothing.

- **Downloads and installs:** none. No npm, npx, pip, curl, wget or git-changing command.
- **Writes outside the repo by this turn's work:**
  - the session scratch dir `/tmp/claude-1002/…/c398a83b…` (≈ 208 MB, mostly test builds and logs);
  - `/run/user/1002`: transient systemd scopes from `capped.sh`.
  - Claude Code wrote its own housekeeping under `~/.claude` (the transcript, backups, file history, the skills sync, `settings.json` at 05:18Z, `.claude.json`). I didn't read the credentials file; it appeared in the scan by name only.
- **Not from this turn's work:**
  - `~/telelean-demos/socrates`: changes at 02:16Z, before the workflow started at 02:22Z, from the user's own use;
  - `~/snap` (Discord, Telegram, Vivaldi), `~/.config/Code` (the user's VS Code), GlobalProtect logs, GNOME and wireplumber state.
- **Test-tool leaks:** no Chrome crash reports, no `~/.local/share/vitest`, no Copilot logs.
- **Git:** HEAD 4640902 with nothing staged. `dist`/`out` are untouched (2026-11-22 07:58 local).

## Honest gaps

- The 2k2 builder's own account of its partial work doesn't exist, because it was stopped. The partial patch is unverified and may be incomplete.
- 2k1's final checks were not run: Playwright, the AP-8 rebuild, and the VS Code suites, which include 2k1's new, never-run Exit scenario.
- AP-46 is not written. Both are listed for the next session in `handoff/START_HERE.md`.
- The token figure for the stopped workflow is my estimate from transcripts, not the harness's own count.
