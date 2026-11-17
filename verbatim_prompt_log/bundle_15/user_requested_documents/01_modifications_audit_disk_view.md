# Disk audit for 2026-11-01T02:16Z to now (read-only)

All times are UTC; add 8 h for the +0800 times used in earlier reports. The machine's timezone changed to America/Los_Angeles on 2026-11-08T10:00Z (`/etc/localtime`, root, not the session). Nothing was modified, installed or downloaded. I read only metadata under `~/.claude`, `~/.config` and `~/snap`, never `.credentials.json`, and not the content of `~/.claude.json`. My scratch files are in `/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn15/audit-disk/` (63 MB: the full ctime/birth scan of $HOME, `agg.py`, `summary.txt`, `residual.txt`).

## Bottom line
- **Outside the repo the session left little in W1/W2:**
  - 4 live-run Claude transcripts and 2 MCP-log dirs (689 KB, all W2);
  - 11 npm debug logs (12 KB, W2);
  - edits to 3 memory notes;
  - Claude Code's own records of the session (about 222 MB).
- **What the session did not change in the period:** no package, extension, toolchain or Node install; no change to `~/.gitconfig`, `~/.config/git`, `~/.ssh`, the shell rc files, systemd user units, `~/.elan/toolchains`, `~/.local/opt` or `~/.local/bin`.
- **One indirect download.** At 2026-11-10T16:55:09–12Z the user's own VS Code TypeScript server ran automatic type acquisition (ATA). It did an `npm install` of these packages into `~/.cache/typescript/6.0` (7.26 MB), adding 18 files (6.43 MB) to `~/.npm/_cacache`:
  - types-registry 0.1.794
  - @types/node 26.6.6
  - @types/react and @types/react-dom
  - csstype, undici-types 8.9.0
  
  This was only possible because of the npm the session installed on PATH in turn 2. It started 11 s after the session wrote `packages/extension/scripts/snap-env.mjs` (16:54:58Z).
- **The W1 test isolation held.** W1 left nothing in the real home from test VS Code, Playwright or Chrome: no Copilot logs, Chrome dumps, mesa marker, `~/.config/Code` writes, or `~/snap/code` writes. `.vscode-test` is unchanged since 2026-11-01T00:20:40Z.
- **All W1/W2 scratch is gone.** /tmp is wiped at every boot (`/usr/lib/tmpfiles.d/tmp.conf: D /tmp … 30d`, and /tmp is on the root filesystem). The first reboot after W1 was about 2026-11-02T04:39Z (journal boot -17 ends 04:38:23, boot -16 starts 04:39:35). Nothing in /tmp is older than the 2026-11-13T07:10Z boot.
- **Repo:**
  - W2 left 23 modified tracked files (+586/−48) and 34 untracked files (25 source/test/fixture/doc files plus 9 prompt-log files), all written 16:54–18:39Z.
  - W1's work is inside the user's commit 98000b7.
  - Generated in the windows: vitest cache +82.9 MB, `extension/out` 8.3 MB, `dist` rebuilt (9.95 MB), Playwright `test-results` 7.6 MB, `core/dist` 1.0 MB.
  - `mental_model/` is not a git repo and has no `.lake`.
- **`~/.elan/known-projects`** gained entries 38–40. Entries 39–40 are the user's `~/yolo` work (Nov 9). Entry 38, `/home/zhengyew/telelean/test-fixtures/spyro`, is uncertain.
- **After W2 the user ran telelean themselves** in their own VS Code: `~/telelean-demo` plus about 3.7 MB of run data. These are user actions.
- **Turn-2 leftovers now gone:** the `/var/crash` Chrome report (removed 2026-11-09T20:37:39Z) and all /tmp leftovers. The rest are unchanged.

## 1. Session timeline from disk metadata
Evidence: mtimes of this session's transcript files and file-history.

| Period | Activity |
|---|---|
| W1 | Activity runs from 2026-11-01T02:16Z through about 2026-11-02T03:40Z (`bundle_9` last write 03:39:50; `MEMORY.md` ctime 03:39:32). |
| Between W1 and W2 | Nothing. |
| W2 | Started about 16:17:54Z, when the host restarted after VS Code auto-updated Claude Code to 2.1.322 (16:17:58Z). First session edit at 16:18:49Z; last at 18:39:19Z. |
| After W2 | Nothing until 2026-11-13T12:20Z (turns 13–15). |

- I checked 15:45–16:19Z and 19:15–21:43Z on Nov 10: only VS Code, Vivaldi and Discord activity.
- I also checked the gap between the turn-2 audit and W1 (2026-11-01T01:00–02:16Z): only prompt-log, transcript and memory writes (including `track-downloads-installs.md`, born 01:32:30) and user apps.

## 2. Session-caused items outside the repo (all still present)
None of the undo commands has been run.

| # | Path | Size | Born / changed | Evidence | Undo |
|---|---|---|---|---|---|
| 1 | `~/.claude/projects/-tmp-claude-1002--home-zhengyew-telelean-03a29d54-7342-40e3-b5f0-2697a62c93ef-scratchpad-turn13-live-{normative…,literal…,demo-1…,demo-2…}` (4 dirs, 1 .jsonl each) | 162,611 + 193,338 + 134,336 + 180,316 = **670,601 B** | 16:41:29–16:42:09, 16:43:03–16:43:58, 18:36:28–18:36:59, 18:37:42–18:38:38 (W2) | W2 live runs of the user's claude CLI. The cwds were in the turn-13 scratchpad; demo-1/2 ran from the isolated snap-VS Code profiles' telelean `runs` dirs. These are the only `~/.claude/projects` dirs created in W1/W2 (none in W1). Near-copies, 24 B smaller each, are in `telelean/verbatim_prompt_log/bundle_13/evidence/live_claude_sessions/`. | `rm -rf ~/.claude/projects/-tmp-claude-1002--home-zhengyew-telelean-03a29d54-7342-40e3-b5f0-2697a62c93ef-scratchpad-turn13-live-*` (matches exactly 4) |
| 2 | `~/.cache/claude-cli-nodejs/-tmp-…-turn13-live-{normative…,literal…}/mcp-logs-telelean/*.jsonl` | 8,760 + 9,257 = **18,017 B** | 16:41:30–16:42:09, 16:43:04–16:43:58 | Same runs; the demo runs left no MCP logs. | `rm -rf ~/.cache/claude-cli-nodejs/-tmp-claude-1002--home-zhengyew-telelean-03a29d54-7342-40e3-b5f0-2697a62c93ef-scratchpad-turn13-live-*` (matches 2) |
| 3 | `~/.npm/_logs/2026-11-10T17_20_13_726Z…T17_39_43_997Z-debug-0.log` (11 files) | **12,401 B** | 17:20:28–17:39:45 | Each log records argv and cwd: `npm exec vitest run …` and `tsc -p tsconfig.test.json --noEmit` in `packages/runner`, and `npm test` in `packages/core`. All local; two `prompts.test.ts` runs exited 1. W1 logs have rotated out (npm keeps 10+1). The pre-existing `_update-notifier-last-checked` (0 B) was re-touched at 16:39:10, i.e. an npm update check. | `rm -f ~/.npm/_logs/2026-11-10T*-debug-0.log` (matches 11) |
| 4 | Memory notes in `~/.claude/projects/-home-zhengyew-telelean/memory/`: `prompt-logging-instruction.md`, `MEMORY.md`, `telelean-project.md` | 2,828 / 1,196 / 3,531 B | ctime 2026-11-01T02:22:07, 2026-11-02T03:39:32, 2026-11-10T18:39:19 | Intended writes. | none |
| 5 | Claude Code's records of this session: `~/.claude/projects/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/` and `~/.claude/file-history/03a29d54-…/` | W1: 158 files, **208,982,922 B** (subagents 122 / 204.2 MB, tool-results 22 / 2.6 MB, workflows 14 / 2.1 MB). W2: 13 files, **12,893,150 B**. Main .jsonl 14.3 MB (all turns). file-history: W1 3 files / 15,103 B; W2 7 files / 29,827 B. | W1, W2 | Files of the session itself. | Keep while the session may be resumed. To discard after it ends: `rm -rf ~/.claude/projects/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef ~/.claude/projects/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef.jsonl ~/.claude/file-history/03a29d54-7342-40e3-b5f0-2697a62c93ef` |

## 3. Indirect effects (another program acting on session output)

**6. TypeScript automatic type acquisition (ATA) download.**
- **Files:** `~/.cache/typescript/6.0/{package.json (159 B), package-lock.json, node_modules/{types-registry, @types/{node,react,react-dom}, csstype, undici-types}}`, 7,264,162 B (209 entries, born 16:55:09–12Z).
  - The turn-1 19-B stub `package.json` was replaced. It now reads `{"private":true,"dependencies":{"types-registry":"^0.1.794"},"devDependencies":{"@types/node":"^26.6.6","@types/react":"^19.3.0","@types/react-dom":"^19.3.0"}}`.
- **npm cache:** `~/.npm/_cacache` gained 18 files (6,426,386 B), all born 16:55:08–12. Registry index keys:
  - types-registry: packument and 0.1.794 tarball
  - @types/node: packument and 26.6.6 tarball
  - @types/react and @types/react-dom: packuments
  - csstype: packument
  - undici-types: packument and 8.9.0 tarball
- **Attribution:** the user's VS Code tsserver, i.e. the window hosting the session. The test and demo launchers set HOME and XDG_CACHE_HOME to scratch, so their ATA would not land here. The install used the session-installed npm. It started 11 s after the session created `snap-env.mjs` (born 16:54:52, written 16:54:58); a new `.mjs` file opened in the editor (for example an IDE diff) is the likely trigger.
- **Undo:**
  - `rm -rf ~/.cache/typescript/6.0/node_modules ~/.cache/typescript/6.0/package-lock.json && printf '{ "private": true }' > ~/.cache/typescript/6.0/package.json`
  - `find ~/.npm/_cacache -type f -newerct '2026-11-10 16:55:00 UTC' ! -newerct '2026-11-10 16:55:13 UTC' -delete` (preview with `-print | wc -l`, expect 18; all 18 were born then).
  - To prevent a repeat: set the VS Code setting `"typescript.disableAutomaticTypeAcquisition": true`.

**7. Metadata-only change in `telelean/node_modules`.**
- At 2026-11-02T04:39:07.549–.688Z, during the first boot after W1, the ctime of all 8,670 npm-installed entries changed: 8,650 files, 19 `.bin` links and `.package-lock.json`. Directories and `.vitest-cache` were not touched. Mtime, birth time and content are unchanged, and the link count is now 1.
- This is consistent with hard-linked node_modules copies in the /tmp scratchpad being deleted by the boot-time /tmp wipe.
- Nothing to undo.

## 4. Repo `/home/zhengyew/telelean`

**Git state**
- HEAD is 98000b7 "initial generation", the user's commit at 2026-11-05T14:17:04Z. `.git` was born 14:12:48Z; 1,294 tracked files; `.git` is 7.1 MB apparent (13 MB on disk). Nothing is staged.
- **Modified (23 files, +586/−48), mtimes 2026-11-10T17:00:07–18:03:52Z (W2):**
  - docs: `m2-plan.md`, `project-report{,-files}.md`, `user-guide.md`
  - core: `src/gate/{describe,rules}.ts` and their tests
  - extension: `.vscode-test.mjs`, `package.json` (adds only the scripts `test:smoke:snap` and `demo`; no dependency changes), `scripts/smoke.mjs`
  - runner: `src/lean/runLean.ts`, `src/proposal/files.ts`, `src/run/{manager,preflight,systemPrompt,types}.ts`, `src/semantic/{ilean,refresh}.ts`, `test/proposal/accept.test.ts`, `test/run/fixtures/system-prompt-5.1.txt`, `test/semantic/ilean.test.ts`
  - `test-fixtures/semantic/README.md`
- Root `package.json` and `package-lock.json` are unchanged since 2026-10-31T22:24:17, and no package dir was born after turn 2, so there was no npm install in W1 or W2.
- **Untracked (born W2, 16:54:52–18:39:18):**
  - `docs/DEMO.md`
  - `packages/extension/scripts/{snap-env,demo-ui,demo-driver,demo-vscode}.mjs`
  - `packages/extension/test/demo/{agent,demoClaude}.ts`, `packages/extension/test/suite/hostEnv.test.ts`, `packages/extension/test/unit/snapEnv.test.ts`
  - `packages/runner/test/lean/userns.test.ts`, `packages/runner/test/proposal/boardEdits.test.ts`, `packages/runner/test/run/fresh.e2e.test.ts`
  - `test-fixtures/fresh/` (11 files), `test-fixtures/semantic/recorded/unlisted-Inbox.{lean,ilean.json}`
  - `verbatim_prompt_log/bundle_10..12`
- **Other untracked:** `.gitignore` and `.node-version` (born 2026-10-31T22:24:00, turn 2; not in the user's commit); `bundle_13..15` (written today, 813 KB in `bundle_13`).
- **Undo W2 code** (only to discard W2 work; the installed extension would then need a rebuild):
  `cd /home/zhengyew/telelean && git restore . && rm -rf docs/DEMO.md packages/extension/scripts/{demo-driver,demo-ui,demo-vscode,snap-env}.mjs packages/extension/test/demo packages/extension/test/suite/hostEnv.test.ts packages/extension/test/unit/snapEnv.test.ts packages/runner/test/lean/userns.test.ts packages/runner/test/proposal/boardEdits.test.ts packages/runner/test/run/fresh.e2e.test.ts test-fixtures/fresh test-fixtures/semantic/recorded/unlisted-Inbox.lean test-fixtures/semantic/recorded/unlisted-Inbox.ilean.json`

**Ignored and generated directories**

| Path | Size | Born | Undo |
|---|---|---|---|
| `packages/extension/.vscode-test` | 1,038,872,069 B | turn 2; unchanged since 2026-11-01T00:20:40 | (turn-2 item) |
| `node_modules`, packages part | 151,530,586 B (du) | turn 2 | (turn-2 item) |
| `node_modules/.vitest-cache` | 86,304,436 B: 2,197 files / 79,421,250 B born W1; 59 / 3,476,766 B born W2; 123 from turn 2 | W1, W2 | `find /home/zhengyew/telelean/node_modules/.vitest-cache -type f -newerct '2026-11-01 02:16 UTC' -delete` (matches 2,256), or `rm -rf …/.vitest-cache` (regenerated by vitest) |
| `packages/extension/dist` | 9,951,472 B (8 files rebuilt 2026-11-10T18:05Z) | W2 | **Keep.** The user's installed-from-folder telelean loads `./dist/extension.js`. |
| `packages/extension/out` | 8,261,846 B (18 files, compiled tests only) | W2 18:05:03 | `rm -rf /home/zhengyew/telelean/packages/extension/out` |
| `packages/webview/test-results` | 8,090,329 B (53 files born W1, 1 W2) | W1 | `rm -rf /home/zhengyew/telelean/packages/webview/test-results` |
| `packages/core/dist` | 1,144,699 B (165 files born W1) | W1 | rebuildable: `rm -rf /home/zhengyew/telelean/packages/core/dist` |
| `packages/*/node_modules` | ≤6.6 KB each (vite/vitest cache stubs) | turn 2 / W2 | — |

**`mental_model/`**: no `.git` (`git rev-parse` resolves to the telelean top level), no `.lake`. Its 11 files are tracked and match the commit. They were re-created in W1 at 2026-11-01T04:10:39 as a copy with preserved mtimes; `.gitignore` was written at 05:04:09.

## 5. `~/.elan`
- `toolchains/` is unchanged since 2026-10-18T07:50:21 (v4.30.0–v4.35.0); `tmp`, `bin`, `env` and `settings.toml` are unchanged.
- `known-projects` has 40 entries (`wc -l` gives 39 because there is no final newline), 4,116 B, last written 2026-11-09T19:58:13Z, between the windows. The turn-2 audit saw 37 entries (file mtime then 2026-10-31T19:05:23Z). Added since:
  - **38** `/home/zhengyew/telelean/test-fixtures/spyro`: added between about 2026-11-01T00:46Z and 2026-11-09T18:53Z. **Owner uncertain**; see uncertainty 1.
  - **39** `/home/zhengyew/yolo/lean`: about 2026-11-09T18:53Z (`~/yolo/lean` and its `.lake` born 18:52:59–18:53:00). The user's project.
  - **40** `/tmp/claude-1002/-home-zhengyew-yolo/a99b228b-…/scratchpad/leancopy`: 2026-11-09T19:58:13Z, from the user's `~/yolo` Claude session a99b228b.
- **Undo** for session lines 10–37 plus 38:
  `grep -v -e '/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/' -e '^/home/zhengyew/telelean/test-fixtures/spyro$' ~/.elan/known-projects > ~/.elan/known-projects.new && mv ~/.elan/known-projects.new ~/.elan/known-projects`
  - This keeps 11 entries.
  - It is safe for `elan toolchain gc`, because `~/webring` still pins v4.35.0.
  - Note that `telelean-demo` and `mental_model` (both v4.35.0) are not registered, because telelean bypasses elan.

## 6. The user's own use of telelean after W2 (not the session)
No session activity ran between 2026-11-10T18:39Z and 2026-11-13T12:20Z. These follow `DEMO.md`, which the session wrote at 18:39:18Z.
- **`~/telelean-demo`** (91,132 B):
  - folder created 21:43:39Z;
  - telelean's Initialize scaffolded `Model/CoffeePreferences`, `.telelean` and the lakefile at 21:44:25;
  - `git init`, offered by telelean's Initialize, at 21:44:42 (the repo has no commits);
  - `.lake` at 21:44:44;
  - `graph.json` last written 2026-11-11T22:40:02.
- **Run data:**
  - `~/.config/Code/User/globalStorage/telelean.telelean` (3,300,433 B, 336 entries), 2026-11-10T21:46:32 to 2026-11-11T22:40:01;
  - `~/.claude/projects/-home-zhengyew--config-Code-User-globalStorage-telelean-telelean-runs-telelean-demo-19e26f7b-{rmwb7zmyeba3937,rmwb8seauc02d67}-ws` (138,097 + 140,537 B);
  - matching `~/.cache/claude-cli-nodejs` dirs (6,158 + 10,190 B).
- **Extension registration:** `~/.vscode/extensions/extensions.json` has `telelean.telelean` 0.0.1 with location `/home/zhengyew/telelean/packages/extension` and `metadata.source: "resource"`, i.e. Install Extension from Location. There is **no telelean folder in `~/.vscode/extensions`** and no telelean VSIX in `CachedExtensionVSIXs`.
- **Undo** (optional, with VS Code closed): uninstall telelean in the Extensions view, then
  `rm -rf ~/telelean-demo ~/.config/Code/User/globalStorage/telelean.telelean ~/.claude/projects/-home-zhengyew--config-Code-User-globalStorage-telelean-telelean-runs-telelean-demo-19e26f7b-* ~/.cache/claude-cli-nodejs/-home-zhengyew--config-Code-User-globalStorage-telelean-telelean-runs-telelean-demo-19e26f7b-*`

## 7. Checked and clean for W1 and W2
- **Unchanged since before the period:**
  - `~/.gitconfig` (2026-07-18), `~/.config/git`, `~/.ssh`, `.bashrc`, `.profile`; no `.npmrc`;
  - `~/.local/opt` and `~/.local/bin` (2026-10-31T22:23:25); `~/.cache/mathlib` (2026-10-31T17:34:56);
  - `~/.cache/fontconfig`; no `~/.cache/ms-playwright`; no `~/.cache/vscode-*` besides cpptools (Oct 14);
  - the vitest token (2026-10-31T22:45:04);
  - `~/.config/google-chrome/Crash Reports` (only the 2 turn-2 dumps);
  - systemd `--user` unit dirs (May 2026). Transient units exist only for the current boot and belong to the user's apps.
- **Nothing written in W1/W2:**
  - `~/.copilot/logs` (none born in either window; the 23 turn-2 logs remain);
  - `~/.config` in W2. In W1 only the user's own entries changed: VS Code local history `History/23d3443e` (27 entries, 00:37–00:53Z on Nov 2) and `workspaceStorage` (13:56:29).
  - `~/snap/code`;
  - `/var/tmp`, `/dev/shm` (only byobu, Deep Security and snap entries);
  - `/var/crash` (empty);
  - `/var/lib/{apport,systemd}/coredump` (empty since 2025).
- **System and other checks:**
  - apt/dpkg: no installs in the period except the user's turn-2 `xvfb`; unattended upgrades ran on Nov 5 and Nov 10 (14:28Z).
  - No core dumps, archives, VSIX or crash files were born in either window.
  - The only new `.git` dirs are `~/telelean/.git` (user, Nov 5) and `~/telelean-demo/.git`.
  - No `~/.claude.json` backup from the windows survives: only 5 from 2026-11-13 09:44–12:36Z remain.

## 8. Not this session (activity classified)
- **W1:**
  - Steam: `~/.local/share/Steam`, 11,219 files / 6.87 GB born 12:21Z Nov 1 to 03:10Z Nov 2 (a game install), plus `.steampid`/`.steampath` (12:21:08), Vulkan layers, hicolor icons and `applications` (12:22:30), and mesa shader cache entries (12:21:25–31 and 13:34:07).
  - The user's `~/webring` Claude sessions 7b910999 and f49ff88a (23:40Z Nov 1 to 00:59Z Nov 2: transcripts, MCP logs, `session-env`, `state`).
  - VS Code: IDE lock 41797 (23:22:05) and the local history above.
  - The `telelean_scripts` panel's MCP log (13:56:29).
  - 3 GNOME screenshots, wireplumber, Vivaldi, Discord.
- **W2:** the VS Code restart and Claude Code 2.1.322 auto-update (16:17:42–58), Vivaldi, Discord.
- **Between the windows and after:**
  - the user's `git init`/commit (Nov 5);
  - `~/.rustup` (684 MB) and `~/.cargo` (21 MB), born 2026-11-09T20:57:31, during the user's `~/yolo` Claude session;
  - `yolo`, `spectec`, `.opam`;
  - VS Code extension installs and updates: partial-diff (Nov 2 05:05), cpptools, python-envs, rewrap, cmake-tools, lean4 0.0.242, tombi, claude-code 2.1.323;
  - snap refreshes: code rev 278 (Nov 8 18:21), discord 320 (Nov 2 boot), vivaldi, telegram;
  - reboots and the timezone change.
  - The other sessions in this project dir, 63d75c52 and b5370591, had their .jsonl files rewritten 2026-11-11T22:37 and 2026-11-13T12:20 by the user's Claude Code use.

## 9. Status of the turn 1–2 items
- **Gone:**
  - `/var/crash/_opt_google_chrome_chrome.1002.crash`. The `/var/crash` mtime is 2026-11-09T20:37:39Z, consistent with apport's daily cleanup of reports older than 7 days.
  - The whole turn-1/2 scratchpad (about 1.3 GB, including the research downloads) and every /tmp leftover, removed by the reboots.
  - The baseline undo commands for these are now moot.
- **Unchanged:**
  - Node in `~/.local/opt`; `~/.cache/mathlib`; `.vscode-test`;
  - the 2 Chrome dumps; the 23 Copilot logs; the vitest token;
  - the turn-2 smoke project and cache dirs; `known-projects` lines 10–37.
- **Changed:**
  - `~/.npm` is now 288,302,025 B (+6.43 MB from ATA, +11 logs).
  - The `~/.cache/typescript/6.0` stub was replaced by the ATA install.
  - `~/.claude.json`, its backups, the model catalog and the plugin-store record were rewritten on 2026-11-13 by Claude Code.

## 10. Totals by size

| Category | Bytes |
|---|---|
| Session, outside repo, W1/W2 (items 1–3) | 701,019 (17 files) |
| Session-triggered ATA (`~/.cache/typescript/6.0` + npm cache) | 13,690,548 |
| Claude Code records of the session, W1 + W2 parts | 221,876,072 (+44,930 file-history) |
| Repo, generated in W1/W2 (vitest cache 82,898,016; out 8,261,846; dist 9,951,472; test-results 7,627,673; core/dist 1,001,680) | 109,740,687 |
| Repo, source/tests/docs/fixtures/prompt logs born W1 (in commit 98000b7; 4.5 MB of it prompt logs) | ≈9,335,565 |
| Repo, born W2 (uncommitted) | ≈625,763 |
| Metadata-only node_modules ctime change | 0 B (8,670 entries) |
| User's own telelean use after W2 | 3,686,547 |
| Whole repo now | 1,331,320,378 (`.vscode-test` 1.04 GB, node_modules 237.8 MB, `.git` 7.1 MB) |

## 11. Uncertainties
1. **known-projects entry 38.** elan records a project only when its proxy (`lean`/`lake`) runs inside that folder. telelean's runner calls toolchain binaries directly, its sandbox mounts `~/.elan` read-only, and its tests use scratch copies. The fixture has never been built in place: its directory ctime is unchanged since 2026-10-31T22:25:57Z and it has no `.lake`. So the entry came from a non-building `lean`/`lake` call there: either a W1 agent's ad-hoc command, or the user's Lean 4 extension opening a file there between Nov 2 and Nov 9. The transcripts can decide this: search W1 Bash commands for `test-fixtures/spyro` together with lean/lake/elan.
2. **`~/.claude.json` content was not read.** The 4 W2 live CLI runs probably added project keys (as the turn-2 smoke runs did), and so may the user's demo runs. Optional cleanup, with all Claude Code processes closed:
   `cp ~/.claude.json ~/.claude.json.pre-cleanup && python3 -c "import json,os; p=os.path.expanduser('~/.claude.json'); d=json.load(open(p)); ks=[k for k in d.get('projects',{}) if '/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/' in k]; [d['projects'].pop(k) for k in ks]; json.dump(d,open(p,'w'),indent=2); print('removed',ks)"`
3. **The ATA trigger** is inferred from timing (11 s). The alternative is the user opening a `.mjs` file. Either way it ran in the user's VS Code with the session-installed npm.
4. **The node_modules ctime mechanism** (deleted hard links) is inferred. The transcripts can confirm, for example a `cp -al`.
5. **W1/W2 scratch contents are unrecoverable from disk:** Lean builds, isolated test-VS Code and Chrome profiles, anything downloaded there. Network-only activity is likewise invisible: Marketplace/CDN queries by the test VS Code, Chrome background fetches, and API usage of the 4 live runs.
6. **Rewritten files hide W2 writes.** `~/.claude/cache/model-catalog/…-cc.json` and `~/.claude/plugins/store/…` were rewritten today, so any W2 writes by the live runs cannot be seen.
7. **`/var/crash`.** A W1/W2 crash report would also have been removed by the Nov 9 cleanup, so one cannot be excluded. Attributing that cleanup to apport rests only on the directory mtime.
8. **The 3 mesa cache entries at 13:34:07Z** and **VS Code `History/23d3443e`** are attributed to the user by timing alone; contents were not read.
9. **Possible turn-2 correction (outside the period).** `node_modules/esbuild/bin/esbuild` is a hard link (2 links) to `@esbuild/linux-x64/bin/esbuild`, and `esbuild/bin` has mtime 2026-10-31T22:24:17. That suggests esbuild's postinstall "optimise" step did run during the turn-2 install, contrary to "the script was not run". It is local only; no network.
10. **This audit's own side effects.** The scratch dir above (63.4 MB, in /tmp, removed at reboot), and two persisted outputs written by the harness: `/home/zhengyew/.claude/projects/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/tool-results/bx1lww5fh.txt` (31,952 B) and `…/b29rp2ln3.txt` (45,866 B). Undo: `rm -rf /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn15/audit-disk` and `rm -f` the two tool-results files.
