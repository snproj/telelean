---
name: track-downloads-installs
description: User wants an exhaustive, verified account of everything downloaded/installed or written outside the project; how to audit it and which test tools leak into the real home folder
metadata:
  type: feedback
---

On 2026-11-01 the user asked for "an exhaustive list of things that you / your subagents downloaded or installed; check thoroughly that the list is exhaustive". The answer is `verbatim_prompt_log/bundle_2/user_requested_documents/05_downloads_and_installs.md`, which includes undo commands.

**Why:** The user cares what lands on their machine (RAM crashes before, disk use, privacy), and single-method checks missed several items.

**How to apply:**
- Keep a running ledger of downloads, installs and writes outside the repo during a turn, and report the additions at the end of each turn.
- To audit:
  - (1) Scan the disk by inode change time: `find -newerct`. mtime misses extracted archives such as the Node tarball and the VS Code test build.
  - (2) Scan the transcripts broadly: any network-capable tool, not narrow regexes. A first pass missed `lake +toolchain new` and Python urllib downloads.
  - (3) Reconcile the two.
- Known leaks from test tooling into the real home folder:
  - Playwright's system Chrome writes crash dumps to `~/.config/google-chrome/Crash Reports` and to `/var/crash`;
  - the test VS Code's built-in Copilot logs to `~/.copilot/logs`;
  - vitest writes `~/.local/share/vitest`;
  - the Claude CLI writes `~/.claude/projects/<cwd-slug>` and `~/.claude.json`.
- For M1+ tests, give test browsers and test VS Code an isolated HOME / XDG_CONFIG_HOME.

Related: [[watch-ram-usage]], [[telelean-project]].
