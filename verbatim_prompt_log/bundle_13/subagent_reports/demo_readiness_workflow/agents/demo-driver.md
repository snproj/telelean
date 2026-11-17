# demo-driver (agent a0116ef265163947f)

## summary
Built a demo driver that plays the whole "your own simple example" demo in an isolated VS Code through the real board webview (CDP/playwright-core), plus docs/DEMO.md. Flow: fresh empty folder -> "telelean: Initialize Model Here" -> cards typed in the A|D|G box -> premises + goal selected -> "These suffice" -> consent -> each question answered (given --answer specs, else option 1) -> review stepped through (definition questions approved by default) -> if not proved and Claude suggests a gap-closing premise, "I hold this" (default) and the next round -> Accept -> wait until Lean re-checked the accepted files. Prints a JSON summary (stdout and <work>/summary.json): verdict per round (footprint, gap, gate attempts, statements, new vocabulary, definitions, lifecycle, suggested premises), questions with options and the answers given (and Claude's guess afterwards), ghosts/adopted premises, final Lean files, statuses after Accept (from .telelean/graph.json and the board), wall times, token usage/cost estimate, notifications, problems; screenshots of every step in <work>/screenshots; a short human-readable recap on stderr. Modes: --dry-run (default; VS Code Test mode with test/demo/agent.ts, bundled into the work dir, which installs a dry-run FakeBackend 'Claude' (test/demo/demoClaude.ts: lazily computed steps that formalise simple syllogisms/chains with a genericity question whose answer changes the result, or whole sentences with a linking premise; real Lean, real gate), pre-answers the git/consent modals Test mode never shows, and runs Initialize with arguments since Test mode has no folder picker; everything else through the UI), --rehearse (Development mode, the exact live UI path incl. palette/quick pick/input box/git dialog/real consent dialog, then must be refused by the quota tripwire before any Claude binary is looked up), --live (needs --live AND TELELEAN_DEMO_LIVE=yes, refuses if TELELEAN_NO_REAL_CLAUDE is armed; real HOME so Claude Code finds its login, VS Code profile and XDG dirs isolated; cancels at the first non-'allowed' rate-limit status unless --continue-on-rate-warning; on error/timeout/Ctrl+C the run is cancelled or discarded through the board). --vscode test-build|snap|<electron binary> (snap via the existing scripts/snap-env.mjs, SNAP_USER_DATA kept in the isolated home), headless under xvfb-run unless --show. All dry-run paths and both rehearsals (test build 1.140.0 and the user's snap 1.145.2) pass; --live was not run (as instructed).

## files_changed
- /home/zhengyew/telelean/packages/extension/scripts/demo-driver.mjs (new: CLI, modes, orchestration, summary)
- /home/zhengyew/telelean/packages/extension/scripts/demo-ui.mjs (new: workbench + board driving over CDP)
- /home/zhengyew/telelean/packages/extension/scripts/demo-vscode.mjs (new: isolated profile, env, launch, cleanup, unit/home checks)
- /home/zhengyew/telelean/packages/extension/test/demo/agent.ts (new: Test-mode agent for --dry-run)
- /home/zhengyew/telelean/packages/extension/test/demo/demoClaude.ts (new: dry-run FakeBackend 'Claude')
- /home/zhengyew/telelean/docs/DEMO.md (new: user-facing 5-minute demo, expectations, timings, tips, driver usage)

## test_runs
All with TELELEAN_NO_REAL_CLAUDE=1, LEAN_NUM_THREADS=4, isolated HOME/XDG/user-data/extensions under my scratch dir, xvfb, ulimit -c 0; work dirs under /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn13/demo-driver/.
- tsc -p packages/extension/tsconfig.json (includes test/demo): clean (3 runs).
- Refusals (9 cases: --live without env, env without --live, live with tripwire =1 and =true, two modes, goal only, duplicate sentences, bad subject, --isolated-home outside live): all exit 2, nothing created.
- dry1 (first attempt): reached Accept, but stalled 2x30 s and timed out waiting for post-Accept statuses -> fixed (see fixes).
- dry2 default Socrates: PASSED in 35 s; 1 question, proved in round 1, accepted, socrates-is-mortal DERIVATION proved.
- dry3 --answer 2: PASSED 44 s; round 1 not-proved with ghost 'Socrates is a typical human' (closes gap), adopted with reason, round 2 proved, accepted, adopted card worded_by agent.
- dry4 custom non-syllogism (rain example, subject Weather): PASSED 44 s (whole-claims path, ghost adopted, proved).
- dry5 chain (cats/mammals/animals) + free-text answer + --answer-scope subject: PASSED 42 s; decisions.json records the subject-scoped answer.
- dry6 --answer decide --end discard: PASSED 49 s; proved, discarded, Inbox.lean without Lean.
- dry7 documented 'Birds fly' command run from repo root: PASSED 40 s.
- reh1 --rehearse (test build): PASSED 15 s; palette init, git dialog, consent dialog text captured, refusal 'Claude could not be started: real Claude is disabled here (TELELEAN_NO_REAL_CLAUDE=1): no Claude binary was looked up or run.', no run created.
- reh-snap1 --rehearse --vscode snap (VS Code 1.145.2 via electron-launch): PASSED 17 s.
- int1 SIGINT during startup: exit 130, clean. int2 SIGINT right after run start: run cancelled via board but an exit race left the instance running (I stopped my processes) -> fixed. int3 same after fix: exit 130, run cancelled, nothing left.
- final-dry-run, final-rehearse, final2 (TMPDIR change), final3 (--answer 2, recap): all PASSED; no leftover processes, no units of mine, driver's real-home listings unchanged in every run.
- --live: NOT run (forbidden).

## problems_found
- Test mode (the only mode where a FakeBackend can be installed) has no folder picker for 'Initialize Model Here' and silently treats unanswered modals (git, consent) as 'no', so the dry run cannot click those; covered by an in-VS-Code agent for --dry-run and by --rehearse, which exercises the real palette/git/consent path in Development mode without Claude.
- Playwright's locator.textContent()/getAttribute() wait up to 30 s for absent elements (e.g. tray-replaces): caused 2x30 s stalls.
- .telelean/graph.json uses snake_case and status.proof as a plain string; the first post-Accept wait read the wrong fields and timed out.
- Shutdown race: when Ctrl+C arrived while the main path was also ending, the process could exit while VS Code was still closing (one test instance left running; I stopped it) and Playwright's temp dir /tmp/playwright-artifacts-3QunlO was left empty (I removed it).
- Every proposal that introduces a new sort has a 'Definitions' step for its existence presupposition (e.g. Entity.exists); Accept stays disabled until 'Yes, I endorse it' (product rule; the driver approves by default, --no-approve-definitions stops instead; documented in DEMO.md).
- Under xvfb without a window manager VS Code keeps its default 1440x900 window regardless of --screen (fine for the board; run panel still beside it).
- Not a bug of mine: during my tests other agents rebuilt packages/extension/dist and edited runner/core files (e.g. systemPrompt.ts); my final runs passed on the dist current at ~09:36-09:40.

## fixes
- demo-ui.mjs: textOf()/attrOf() helpers (count guard + 2 s timeout) for all optional reads; theseSuffice() no longer evaluates tray() in its timeout label.
- demo-driver.mjs: graphNodes() reads graph.json's snake_case fields; post-Accept wait = graph.json rewritten after the Accept click + Lean fresh/failed + target proved when the verdict was proved.
- demo-driver.mjs: shutdown() and endActiveRun() are single shared promises so every exit path awaits the full cleanup; early stops cancel (or discard in review) the run through the board first.
- demo-driver.mjs: TMPDIR of the driver process points into <work>/tmp after VS Code is launched (Playwright's temp dir no longer in /tmp; VS Code's own env unchanged).
- demo-driver.mjs: Accept refusals detected from new board toasts instead of a long timeout; 'waiting-for-answer' only acted on once the question set exists; adoption round wait 300 s; progress lines and a human-readable recap on stderr; screenshot list in the summary.
- demoClaude.ts: Typical declared only for the generic reading, user's capitalisation in question texts, noun/adjective glosses, constants kept in the plan, lean_name capped, generator errors end the turn with a message, clearer suggested-premise sentence.

## needed_outside_my_paths
- Nothing is required.
- Optional convenience: add to /home/zhengyew/telelean/packages/extension/package.json scripts: "demo": "node scripts/demo-driver.mjs" (then `npm --prefix packages/extension run demo -- --dry-run`).
- Optional product hook (not needed; --rehearse covers the gap): an env-gated fake backend in Development mode (e.g. honoured only when TELELEAN_NO_REAL_CLAUDE=1) would let one dry-run instance go through the palette folder picker and the real git/consent dialogs as well.

## how_to_run
From /home/zhengyew/telelean (progress on stderr, JSON summary on stdout and in <work>/summary.json, screenshots in <work>/screenshots; default work dir: a fresh /tmp/telelean-demo-* folder, or --work-dir DIR):
  node packages/extension/scripts/demo-driver.mjs --dry-run                       # Socrates, no Claude, ~35-50 s
  node packages/extension/scripts/demo-driver.mjs --dry-run --answer 2            # 'in general' -> not proved -> I hold this -> proved
  node packages/extension/scripts/demo-driver.mjs --dry-run --assume "Birds fly" --assume "Tweety is a bird" --goal "Tweety flies"
  node packages/extension/scripts/demo-driver.mjs --rehearse --vscode snap        # live UI path up to consent; must be refused by the tripwire; no quota
  TELELEAN_DEMO_LIVE=yes node packages/extension/scripts/demo-driver.mjs --live --vscode snap --assume "All humans are mortal" --assume "Socrates is a human" --goal "Socrates is mortal" [--answer 1] [--model M --effort E] [--timeout-minutes 60]
Live: run from a shell WITHOUT TELELEAN_NO_REAL_CLAUDE (the driver refuses otherwise); it spends subscription quota, uses the real HOME (Claude Code login), keeps VS Code's profile/XDG in the work dir, cancels at the first non-'allowed' rate-limit status unless --continue-on-rate-warning. Other options: --answer 1-4|open|decide|text:WORDS (per question, in order), --answer-scope run|nodes|subject, --no-adopt, --adopt-reason TEXT, --max-rounds N, --end accept|discard, --no-approve-definitions, --vscode test-build|snap|<electron binary>, --show, --screen WxH, --subject Name. Exit 0 = demo reached its end as expected, 1 = not, 2 = refusal/setup error.

## effects_outside_repo
- All test output written inside my scratch dir /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn13/demo-driver/ (probe-*, dry1-dry7, reh1, reh-snap1, int1-int3, final-*, final2, final3: isolated profiles, model folders, screenshots, summary.json; probe-scripts/; stamp files).
- Transient, removed by the tools themselves (verified none left): xvfb-run's temporary Xauthority dir under /tmp and Xvfb's /tmp/.X<n>-lock and /tmp/.X11-unix/X<n> socket per run; VS Code IPC sockets in /run/user/1002 per instance; telelean-<runId>-<n> systemd user scopes of the Lean sandbox (none of mine left; other sessions' units were left alone).
- /tmp/playwright-artifacts-3QunlO: an empty dir left by my interrupted test int2 (exit race); I removed it with rmdir; the driver now keeps Playwright's temp folder in the work dir.
- /tmp/node-compile-cache/ may have been updated by my 3 runs of the repo's tsc (TypeScript enables Node's compile cache in os.tmpdir()).
- The snap rehearsal executed /snap/code/278/electron-launch (read-only) with SNAP_USER_DATA/SNAP_USER_COMMON inside my isolated home; nothing under ~/snap/code changed (listing).
- Real home: no change attributable to my runs (the driver's before/after listings of ~/.config/Code, ~/.vscode, ~/.copilot, ~/.config/google-chrome, Trash, ~/snap/code, ~/.pki, ~/.cache, ~/.claude/projects and ~/.elan/known-projects were unchanged in every run). A ctime scan of ~ showed only others' activity: the user's apps (snap discord/vivaldi/telegram, ~/.config/Code of the user's VS Code, gnome-shell, wireplumber, nautilus; ~/.local/share/recently-used.xbel rewritten at 09:23:03 with no new entry, newest entry dated Nov 5; ~/.gnupg dir ctime 09:22:52), the main session (~/.claude/projects, ~/.claude/skills/synced) and other agents (~/.npm/_logs from their vitest/tsc runs, repo edits, dist rebuild).
- Read-only accesses outside the repo: grep of the Claude Code binary for XDG/credentials path strings (no secrets read), listing of ~/.vscode/extensions, reading /snap/code/278/electron-launch, and a targeted read of only the newest entries' dates in ~/.local/share/recently-used.xbel to attribute its change.
- No network use except loopback CDP, no downloads, no npm install, no git state changes, no Claude CLI run (the rehearsal refusal confirms no binary was looked up).

