All of 2k1's final checks passed, and your extension is rebuilt. The 2k2 work is half done; finishing it would take about 3–4 hours and roughly 1.4 M subagent tokens. I haven't started it.

**2k1**
- **Your commit `1736cb0`** is exactly 2k1: its 19 files match the checked patch byte for byte.
- **Playwright:** all 21 spec files pass, 124 of 124 tests. That's the 120 from before plus 2k1's 4 new ones.
- **The rebuild:** done. Six files under `packages/extension/dist` and `out` are now modified in your working tree.
- **The VS Code suites** (using the xvfb you installed): smoke 39 passing, 1 pending; e2e 15 passing, 7 pending. **2k1's new Exit scenario passed.** The 7 pending are the old review scenarios, skipped on purpose. No isolation failures.
- **AP-46** is written in the decisions log.

**What you need to do**
- **Get the Exit fix:** reload VS Code, or open a new window, which is safer because Claude Code runs in this one. This assumes your telelean is installed from this repo's `packages/extension`; if not, install it with *Developer: Install Extension from Location…*.
- **Commit when you like:** `dist`/`out`, the decisions log and `verbatim_prompt_log/bundle_29/`.

**2k2**
- **Where it is:** the patch is `verbatim_prompt_log/bundle_27/evidence/patches/slice_2k2_partial_only.patch` (48 files). Its brief is `bundle_27/handoff/kit/briefs/2k2.md`. A dry run shows the patch still applies cleanly to your current commit. Nothing is applied to your tree.
- **Already in the patch, not yet checked:**
  - the whole plan update (D2-107 to D2-117) and the docs;
  - each model's runs move into `<model>/.telelean/runs/`, with their own `.gitignore`;
  - the "Run with Claude" consent is stored in that folder as `consent.json`;
  - recovering and cleaning up old runs works per folder;
  - a run left behind by a moved folder can only be ended;
  - git, when run by Claude Code, can't see the model's repository;
  - telelean ignores changes under the runs folder, so Claude's work there doesn't trigger a model reload;
  - 23 test files and test helpers.
- **It compiles:** in a scratch copy, the type checker reports 0 errors for the runner (with its tests), the extension and the webview.
- **Still to do:**
  - run the tests and fix any failures;
  - the 8 required mutation checks (break each key rule and confirm a test fails);
  - the builder's report;
  - then the usual steps: two reviewers, up to two fix rounds, the full test run with real Lean, and the final checks I ran today.
- **Cost:** about 1.0–1.8 M subagent tokens, most likely around 1.4 M. Budget 2 M, since my recent estimates ran about 1.5× over. For comparison, 2k1 took 1.2 M.
- **Time:** about 3–4 hours, unattended once you say go:
  - the builder takes 1–1.5 h;
  - the reviews and fixes take about 1 h;
  - the full test run takes 45–60 min;
  - the final checks took under 10 minutes today.
- **Do it before slice 3.** Slice 3 changes the same runner and session code, so the patch probably won't apply afterwards, and 2k2 would cost close to a full rebuild (1.5–2 M or more).
- **Three decisions in it are marked for you to confirm:**
  - **D2-111:** when a folder is moved, renamed or copied, a run left over from its old place shows as interrupted, with only **Stop** (no "Exit session"). Ending it records nothing in the new folder.
  - **D2-114:** no new guard against `CLAUDE.md` or `.claude/` files in the folders above Claude's working copy. It relies on the Claude CLI flags verified in M0, which stop those files from loading (`--setting-sources=` and `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`).
  - **D2-117:** a second safety layer, the Claude CLI's own deny rules, only covers model folders whose path uses the characters `[A-Za-z0-9._/-]`. A folder with a space in its path is protected by telelean's path guard alone.
- **When 2k2 lands,** finish or Exit any open session before you reload. Old sessions in VS Code's storage don't move over.

**Cost and ledger**
- **Quota:** no subagents this turn. Claude Code's own use was about 0.09 M output tokens and 8 M cache reads.
- **Downloads and installs:** none by me. You installed `xvfb`.
- **What I wrote outside the repo and my scratch folder:**
  - Playwright's cache `/tmp/playwright-transform-cache-1000` (6.6 MB);
  - a tiny Node cache in `/tmp/node-compile-cache`;
  - Xvfb's socket;
  - the test VS Code touched `/tmp/vscode-typescript1000` when it exited.
- **Git:** running `git status` refreshed file timestamps in `.git/index`. Nothing is staged and HEAD is unchanged.
- **Everything else** that changed on disk was your own apps (Vivaldi, Telegram, Discord, your VS Code and Copilot, GNOME) and Claude Code's housekeeping.
- **The log:** this turn is in `verbatim_prompt_log/bundle_29/`.

Still open whenever you want them: the six live-Q&A questions, in §10 of `verbatim_prompt_log/bundle_25/user_requested_documents/01_live_qa_design_note.md`.
