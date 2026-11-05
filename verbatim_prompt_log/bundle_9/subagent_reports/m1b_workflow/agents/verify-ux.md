# verify:ux (agent a9374160d277dfecb)

## verdict
needs-work

## what_i_ran
I drove the real extension by hand-scripted UI in an isolated VS Code. I did not edit anything under /home/zhengyew/telelean. I did not re-run the repo's npm suites (the integrator ran them) or the webview Playwright harness.

Setup:
- Harness: /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/verify-ux/harness/
  - launch.sh starts the downloaded VS Code 1.140.0 test build with --extensionDevelopmentPath=packages/extension.
  - It runs under `env -i` with HOME, XDG_* and TMPDIR inside the scratch profile run1/, `ulimit -c 0`, xvfb-run, custom dialogs, and --remote-debugging-port=47811 on loopback.
  - lib.mjs and drive.mjs attach with the installed playwright-core (connectOverCDP: trusted mouse and keyboard input, screenshots).
- Workspace run1/ws held:
  - a copy of mental_model;
  - an empty_folder;
  - a generated big_model with 146 nodes (56 A / 50 D / 40 G, 60 vocabulary items, 370 edges in graph.json).

Scenarios s01–s38, all through the UI:
- Open Board; Lean fresh in 3.6 s.
- Light and dark themes switched live through the isolated settings.json.
- Vocabulary group, expanded card, hover gloss, click-to-highlight, the "uses:" dropdown.
- Copy, then pasted into an untitled editor: the text was identical.
- Drag-select inside the Lean code: the card did not drag.
- Keyboard Tab order, popovers, Enter/Space/F2/Delete, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y.
- History: Initialize git from the dropdown, list, Preview diff, Revert and its undo (byte-exact), Keep last 3 (21 entries became 3; storage 18 KB became 3.5 KB).
- The A|D|G box with stance, why and source; inline edit; the "no reason yet" chip.
- Tray "These suffice".
- Drag re-order. Drag kind change with drop zones.
- I wrote a proof by hand, then dragged A to G and chose rewrite: the goal became conditional, and Ctrl+Z restored Main.lean byte-exactly.
- Make Derivation shows "promotion pending".
- Mismatch arrows; Delete; a refused Undo (file changed by hand).
- A Lean error typed in the editor and saved: badge "Lean: 2 errors", card chips, Problems list.
- Initialize Model Here from the Explorer context menu, declining git; New subject with name validation.
- Syntactic mode after a toolchain change; the low-memory pause via telelean.memory.minAvailableGiB=60; a corrupted layout.json.
- Big model: cards on screen after 765 ms, Lean fresh after 3.5 s. Frame-by-frame scrolling of each column: median 16.7 ms, p95 33 ms, max 50 ms, no long tasks. Selecting the 50-edge hub and dragging stayed responsive.
- Developer: Reload Window, three times.

Evidence: 86 screenshots in /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/verify-ux/shots/, which I looked at. Logs are run1/user-data/logs/20261101T135337/window1/exthost/telelean.telelean/telelean.log.

Shutdown: I killed the instance at the end. No process, Xvfb or telelean-* unit was left, and listings of the real ~/.config/Code, ~/.copilot, ~/.config/google-chrome, Trash, ~/.vscode/extensions, ~/.cache, ~/.pki, ~/.local/share, ~ (top level) and /run/user/1002 were identical before and after.

## issues
- **severity:** blocker
  - **package:** extension
  - **description:** A board that was open when VS Code reloads or restarts comes back as a permanently blank tab, with no webview at all. This breaks scope item 18 ("board restored after reload", AT5.4) and hits the user on the guide's very first step. host.restoreBoard awaits openBoard, which waits for attachSession, BoardPanel.attach, session.requestPublish, and finally `await panel.webview.postMessage(...)`. VS Code 1.140 queues a postMessage to a webview that is still initialising and resolves it only when the webview is ready, but it creates the webview only after deserializeWebviewPanel resolves. Each side waits for the other.
  - **evidence:** Every restored board stayed blank: 4 of 4 over two reloads (mental_model, big_model, empty_folder twice).
- Workbench DOM after more than 2 minutes: `"iframes": []`. The second reload printed `active tab: telelean: empty_folder` and `iframes: 0`. Switching tabs did not help.
- A fresh Open Board in the same window works: `iframes after fresh Open Board (empty_folder): 1`.
- telelean.log for a restore shows `restoring board "telelean: mental_model"`, then `board opened`, then `[mental_model] model workspace loaded (2 subjects)`. After that there is no `ready` and no `Lean refresh requested (open)`.
- The wait ends only when the tab closes: `14:18:31.249 board closed: …/empty_folder`, then `14:18:31.259 [empty_folder] Lean refresh requested (open)`.
- VS Code 1.140 code (the test build and the user's snap are both 1.140.0): `resolveWebview:async i=>{… await this._proxy.$deserializeWebviewPanel(…)}`; a postMessage while initialising does `pendingMessages.push({channel:e,data:t,transferable:i,resolve:r})`, which resolves only on Ready or `resolve(!1)` on dispose.
- The tests miss this: boards.test.ts:112-113 creates a live panel with createWebviewPanel and calls api.restoreBoard directly, so VS Code's real restore path never runs.
  - **suggested_fix:** Let deserializeWebviewPanel resolve as soon as the BoardPanel wraps the restored panel and has set its HTML, and attach the session in the background. Alternatively, never await webview.postMessage on the attach/publish path (post without waiting; the webview's own `ready` already triggers a publish). Add a unit test: restoreBoard must resolve while a fake panel's postMessage never resolves. This may also explain the integrator's unproven "board never loaded its webview" smoke race. Until fixed, the user guide's advice to reload makes things worse; the recovery is to close the tab and run "telelean: Open Board".
- **severity:** major
  - **package:** webview
  - **description:** A toast's Undo button undoes the most recent action, not the action the toast names. Toasts for actions that were already undone keep their Undo button, so pressing it undoes yet another action. Toasts stack for 6–15 s, so after two quick actions the user is offered a wrong Undo. Redo recovers it, but the wrong card changes.
  - **evidence:** Added "Toast test one", then "Toast test two". Toasts: `['Add assumption: Toast test one\nUndo', 'Add assumption: Toast test two\nUndo']`. After clicking Undo on the "Toast test one" toast: `has one: true  has two: false`, and `toasts after: ['Add assumption: Toast test two\nUndo', 'Undo: Add assumption: Toast test two']`. Screenshot shots/41-after-toast-undo-light.png. Cause: Toasts.tsx calls dismissToast plus actions.undo() with no target, and the protocol's `undo` carries only a requestId. The same stale toast was left after Revert and its undo (shots/61-new-subject-empty-light.png).
  - **suggested_fix:** Show Undo only on the newest undoable toast whose label equals workspace.undo; remove the button from older toasts when a new action, undo or redo arrives. Alternatively, collapse undoable toasts into one.
- **severity:** major
  - **package:** webview
  - **description:** Below roughly 600 px of board width the board is unreadable, and "Open in editor" causes exactly that by opening the file beside the board (ViewColumn.Beside), which halves its width. The columns have no minimum width (`repeat(3, minmax(0, 1fr))`), and `.tl-card__text` uses `overflow-wrap: anywhere`, so words break in the middle.
  - **evidence:** In a 1440 px window with the Explorer open and Main.lean beside the board (board about 540 px, columns about 110 px):
- card text breaks inside words: "Cynde r would not be a good additi on to", "Spyro game s are made for childr en", "PG game s canno t have chara cters";
- the expanded card's problem text breaks every few letters: "LE AN Un kn ow n ide ntif ier";
- column titles are cut to "ASSUMPTI…" / "DERIVATIO…", and the "▲ 3 linked" badge covers the Assumptions title.
Screenshots: shots/71-lean-errors-board-light.png, shots/73-lean-error-card-light.png, shots/70-open-in-editor-light.png. Even at about 205 px columns the uses line is cut by CSS to "uses: GoodAddition, cynde…" (shots/03-board-fresh-dark.png). host.ts:366-367 opens with `viewColumn: vscode.ViewColumn.Beside`.
  - **suggested_fix:** Give columns a minimum width (about 220 px) with horizontal scrolling, or a stacked/tabbed layout below about 700 px. Use `overflow-wrap: break-word`, not `anywhere`. Consider opening the code in an existing other editor group instead of splitting the board's group.
- **severity:** minor
  - **package:** webview
  - **description:** Keyboard basics are incomplete.
- Popovers (subject picker, History, uses ▾, Problems): opening one with Enter leaves focus on its button, Tab skips to the next header button, and arrow keys do nothing. The items are rendered at the end of <body>, after every card and the A|D|G box. role="menu" is declared but has no arrow-key navigation.
- Focus is lost after an inline edit is saved or cancelled.
- The Delete dialog focuses the destructive button.
- Cards cannot be re-ordered with the keyboard.
  - **evidence:** Script output:
- `after Enter on picker: menu open = 1  focus = button.tl-menu-button [subject-picker]`, `Tab -> … [history-button]`, `ArrowDown -> … [history-button]`;
- History: `Tab -> button.tl-lean-badge`; uses ▾: `active el after ArrowDown: tl-uses__toggle ▾ 3`;
- `Esc -> focus: (body)`, `focus after Enter-commit: BODY`;
- `Delete -> dialog: 1  focus: button.tl-button [] "Delete card and its Lean code"` (so Delete followed by Enter deletes the card and its Lean code).
  - **suggested_fix:** Move focus to the first item when a popover opens, add Up/Down/Home/End and return focus to the button on Escape. Return focus to the card after an inline edit. Focus Cancel (or "card only") in the Delete dialog. Add Move up/down for cards (e.g. Alt+Up/Down).
- **severity:** minor
  - **package:** webview
  - **description:** The History dropdown has two problems.
- After "Initialize git" inside the open dropdown, it keeps saying "No history yet." although the Initial state snapshot exists; it updates only when reopened.
- "Keep last N" drops history irreversibly with one click and no confirmation, while Revert asks first.
  - **evidence:** Right after Initialize git: `HISTORY: No history yet. | Keep the last | entries | Keep last`, while `git for-each-ref` printed `refs/telelean/root/subjects/Spyro Initial state`. After reopening: `13:57 · start · Initial state | Preview | Revert to this`. Prune: `entries 21 -> 3 | storage This subject: 18 KB … -> This subject: 3.5 KB`, with no dialog. Screenshots shots/31-history-after-init-light.png, shots/104-after-prune-dark.png.
  - **suggested_fix:** Request the history listing when availability changes to ready while the popover is open. Confirm before pruning ("Drop 18 older snapshots of Spyro?").
- **severity:** minor
  - **package:** extension
  - **description:** When a model file changes outside VS Code (a script, a CLI agent such as Claude Code, git), no Lean refresh is triggered, by design (refresh triggers are open, save, telelean's own edit, toolchain change, the Refresh button). Meanwhile every affected card shows a "checking…" chip indefinitely, which suggests a check is running when none is.
  - **evidence:** After writing Main.lean on disk the badge read `stale "Lean: files changed"` from 0 ms to 9710 ms, with goal chips `['λ Lean', 'unproved', 'checking…', 'not checked by Lean']`. Only clicking the badge gave `['λ Lean', '✓ proved: make Derivation?']`. The user guide's chip table defines "checking…" as "its file changed since the last check", while the badge uses "checking…" to mean a check is running.
  - **suggested_fix:** Request a debounced refresh on watcher create/change/delete while the board is open. Also rename the stale chip, e.g. "changed since last check" (that wording lives in the webview).
- **severity:** minor
  - **package:** runner
  - **description:** The syntactic-mode banner names the wrong toolchain. The summary takes the toolchain from the last facts (still v4.35.0) instead of the project's current pin, so the banner contradicts itself.
  - **evidence:** After setting lean-toolchain to v4.20.0: `banner: Syntactic mode. This project uses leanprover/lean4:v4.35.0; telelean checks only with leanprover/lean4:v4.35.0, so the cards show what the files say, unchecked by Lean. lean-toolchain pins "leanprover/lean4:v4.20.0"; …`. Screenshot shots/103-syntactic-mode-dark.png. Cause: runner/src/workspace/semanticSummary.ts:69 `const toolchain = facts?.toolchain || input.last?.toolchain;`.
  - **suggested_fix:** For the unsupported-toolchain state, use the current pin (input.last.toolchain or the project read) and never the stale facts' toolchain.
- **severity:** minor
  - **package:** webview
  - **description:** Request 4 (click an identifier to highlight it in the Vocabulary group) works, but during the 2-second flash the highlighted item is unreadable. The whole item or card takes the telelean.highlight background while the text keeps its normal colour.
  - **evidence:** Light theme: dark text on #9A6700. Dark theme: light text on #E5C07B, where the name and gloss almost vanish. Screenshots shots/12-ref-click-highlight-light.png, shots/13-uses-dropdown-light.png (whole card), shots/89-highlight-flash-dark.png.
  - **suggested_fix:** Flash an outline or halo, or a translucent tint, or switch the text to a contrasting colour while highlighted.
- **severity:** minor
  - **package:** webview
  - **description:** Arrows for a hovered or selected card are drawn in the layer above the cards, so they cross other cards' text like a strike-through. On a belief board this can read as "struck out".
  - **evidence:** In shots/91-proved-board-dark.png the blue arrow from "Cynder is a character…" to the goal runs straight through the text of the derivation card "Cynder is not suitable for PG games".
  - **suggested_fix:** Route focused edges around cards (through the column gutters), or draw them under cards with a halo where they cross.
- **severity:** minor
  - **package:** webview
  - **description:** Toasts stack at the bottom right over the selection tray, hiding its target chip and Clear button for 6–15 s after a few actions.
  - **evidence:** In shots/48-after-these-suffice-light.png three toasts cover the right half of the tray, and "These suffice ▶" wraps to a second row.
  - **suggested_fix:** Place toasts above the tray, or cap them at one or two collapsed entries.
- **severity:** minor
  - **package:** core
  - **description:** Some core texts disagree with what is written to disk, or with each other.
- The A→G/D→G impact text promises a hypothesis named `h`, but the rewrite writes `h_<statement>`.
- For a rule card, the face asks for a source, while TL011 in Problems asks for a rationale.
  - **evidence:** - Drop zone and dialog: "Either rewrite them to take it as a hypothesis (h : cynder_dark_past)…" (kindChange.ts:174). The file then contained `theorem cynder_not_good.holds (h_cynder_dark_past : cynder_dark_past) : cynder_not_good`; the user guide correctly says `(h_n : n)`.
- pg-no-dark-past (stance rule) shows the chip "no source yet", while Problems shows `TL011 This assumption has no `rationale:` yet (why do you hold it?).`
  - **suggested_fix:** Compute the real hypothesis name in kindChangeImpact, or say "(h_cynder_dark_past : …)". Align TL011's wording with the stance-aware chip.
- **severity:** minor
  - **package:** webview
  - **description:** Markdown backticks from core strings appear literally in several places. The drop zone strips them; problem texts and the Make … button tooltips do not. The low-memory tooltip runs two sentences together.
  - **evidence:** - Problems list: "TL011 This assumption has no `rationale:` yet".
- Make Derivation tooltip: "`axiom new_spyro_pg.holds` stays, marked claimed, until you replace it with a proof (`theorem new_spyro_pg.holds : … := …`)".
- Low-memory badge tooltip: "MemAvailable is 35.7 GiB, below the 60.0 GiB threshold Click to check again."
  - **suggested_fix:** Render backtick spans as <code> (or strip them) everywhere, as DropZone does. Join the badge detail and the refresh hint with ". ".
- **severity:** minor
  - **package:** extension
  - **description:** The history preview tab title is about 150 characters long, so it crowds the board tab out of the tab strip, and the preview opens in the board's own editor group, covering the board.
  - **evidence:** Tab title: "telelean history: Undo: Make Goal: Cynder is a character who has a dark past (dependents rewritten) (2026-11-01 14:03) vs the state before it (2 files)". Screenshot shots/57-history-preview-light.png.
  - **suggested_fix:** Shorten the title (e.g. "History: Make Goal… (14:03)"), and open the preview beside the board or in its own group.
- **severity:** minor
  - **package:** webview
  - **description:** An empty board (after Initialize, or a new subject) gives no first step. It shows three "No … yet" boxes, and the tray hint talks about selecting cards and "These suffice" although there are no cards.
  - **evidence:** shots/67-init-board-settled-light.png and shots/61-new-subject-empty-light.png: "No assumptions yet / No derivations yet / No goals yet" plus "Click a card to select it, Ctrl/Cmd-click to select several. Select premises and one goal, then press “These suffice”."
  - **suggested_fix:** When the subject has no cards, point to the A|D|G box (e.g. "Type your first assumption below") and hide the tray hint.
- **severity:** minor
  - **package:** webview
  - **description:** "These suffice" replaces the target's existing premises without saying so. D-13 specifies replacement, but M1 writes no attempts.jsonl, so the earlier premise set survives only in Undo/History. Selecting one extra card to add a premise silently drops the others.
  - **evidence:** The goal's premises (cynder-dark-past, new-spyro-pg, pg-no-dark-past) became `toast-test-one, cynder-dark-past` after pressing These suffice with those two selected. The board then showed mismatch arrows and Problems listed TL107 ×2 and TL109. Screenshot shots/107-mismatch-dark.png.
  - **suggested_fix:** Show the target's current premises in the tray and say they will be replaced, or offer "add to premises".
- **severity:** minor
  - **package:** webview
  - **description:** Joint premises are drawn as separate arrows. 03 §7 (EdgeEngine) says "joint premises meet at a junction dot", and D-13 says "joint support, drawn through a junction dot". The M1 plan lists only "declared + verified arrows", so this is a deviation from the spec rather than a broken scope item.
  - **evidence:** 03_architecture.md:394. `grep -i junction packages/webview/src` finds nothing. Screenshots shots/03-board-fresh-dark.png and shots/82-big-fresh-light.png show three separate dashed arrows into the goal.
  - **suggested_fix:** Draw declared premise sets through a junction dot near the target, or record the deferral in the decisions log.
- **severity:** minor
  - **package:** sample-or-docs
  - **description:** docs/user-guide.md is inaccurate in three places.
- §9 says to run Developer: Reload Window when the board stays empty. With the restore blocker, reloading leaves every open board tab blank; the working recovery is to close the tab and run "telelean: Open Board". §8 also tells the user to reload after changing settings.
- §3 lists the Vocabulary group as a band between the header and the columns. It is actually the first item inside the Assumptions column and is collapsed by default, and the header's Problems button is not listed.
- §4 offers "Undo on the toast" without saying that it undoes the latest action, not the one the toast names (see the toast issue).
  - **evidence:** user-guide.md §9: "The board stays empty / \"Waiting for the extension to send the graph…\": run Developer: Reload Window". §3: "From top to bottom: the header (subject picker, History, Undo/Redo, Lean badge, legend), the Vocabulary group, three columns…". Observed layout: shots/06-vocab-expanded-dark.png.
  - **suggested_fix:** Fix the troubleshooting advice (and re-check it after the restore fix). Describe the Vocabulary group as the top of the Assumptions column, collapsed by default, and mention the Problems button. Update the Undo row once toast Undo is fixed.

## strengths
- All four of your card requests work in the real extension. (1) A mouse drag in the expanded code selects the text, e.g. "/-- The new Spyro game is PG -/\nabbrev new_spyro_pg … ", and the card's data-dragging stays null. (2) The "uses:" line reads "uses: GoodAddition, cynder, …" with "▾ 3"; the dropdown lists each item with its kind and gloss and highlights the one you pick. (3) Copy puts exactly the card's code on the clipboard: pasting into an untitled editor gave the identical text, and the button shows "Copied". (4) Hovering an identifier shows its gloss ("has a dark past / predicate · HasDarkPast : Spyro.Character → Prop"); clicking it opens the collapsed Vocabulary group and flashes the item without changing the selection, and clicking the card's own name flashes that card.
- D-11 kind changes behave as designed in the UI. Drop zones state the Lean impact. Dragging A to G when a proof uses the card opens the dependents dialog with Cancel focused. Rewrite produced `theorem cynder_not_good.holds (h_cynder_dark_past : cynder_dark_past)` and Lean then reported the goal as conditional, drawn with a conditional arrow. Ctrl+Z restored Main.lean byte-exactly. Make Derivation gives "promotion pending" and "rests on a claimed node".
- History works end to end. Entries read time · action · label, Preview opens a correct multi-file diff, and Revert confirms first and is byte-exact; undoing the revert is byte-exact too. The storage counter and Keep last N work. Hand edits are recorded as "Manual edits". Only private refs are written.
- Errors are shown clearly and once. The badge reads "Lean: 2 errors", cards show "Lean problem" with a ⚠ count, and Problems lists each error with its file and line plus Show card and Open buttons. A refused Undo ("Model/Spyro/Inbox.lean changed since; use History to revert") appears once as an error toast, with no duplicate VS Code notification.
- Initialize from the Explorer context menu validates the name ("Start with a capital letter …"), suggests "EmptyFolder", writes 11 files, offers git in a clear modal, and opens a board that is up to date. New subject validates both bad and taken names and updates Model.lean.
- Large model: 146 cards on screen in 0.8 s and Lean fresh in 3.5 s. Frame-by-frame scrolling runs at median 16.7 ms and p95 33 ms with no long tasks. Selecting the 50-edge hub highlights all its arrows, with "▲/▼ n linked" badges for those off-screen. Drag and its undo stay responsive.
- Light and dark themes both render with the contributed colours (kinds, aura, vocabulary, highlight). The low-memory pause ("MemAvailable is 35.7 GiB, below the 60.0 GiB threshold") and syntactic mode are clearly signalled; the syntactic banner text is wrong, see issues. Boards opened fresh after a reload work, and the real home folders stayed untouched.

## effects_outside_repo
- Scratch dir /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/verify-ux/ (about 39 MB): harness/, shots/ (86 PNGs), logs/, gen/genbig.py, and run1/. run1/ is the isolated VS Code profile (home, xdg-*, user-data, extensions, tmp) and its workspace: a copy of mental_model (now with .lake, .git and telelean private refs created through the UI), an initialized empty_folder (.lake), and the generated big_model (.lake).
- Ran the downloaded VS Code 1.140.0 test build in packages/extension/.vscode-test, read-only, once (with three in-app window reloads) under xvfb-run on display :99. The environment was cleared with env -i; HOME, XDG_CONFIG/CACHE/DATA_HOME and TMPDIR pointed into run1/; ulimit -c 0. The extension was loaded with --extensionDevelopmentPath, read-only. I stopped it with SIGTERM at the end; no process of mine is left.
- A Chromium DevTools endpoint on 127.0.0.1:47811 was open only while that instance ran. I attached to it with the installed playwright-core over loopback only.
- XDG_RUNTIME_DIR and DBUS_SESSION_BUS_ADDRESS were passed through, as the smoke harness does, because systemd-run --user needs them. VS Code's runtime sockets came and went: the /run/user/1002 listing was identical before and after.
- The extension's Lean refreshes ran lake build and the check file under runLean, in transient systemd --user scopes (telelean-*), on the scratch copies only. `systemctl --user list-units 'telelean-*'` is empty afterwards. The ~/.elan toolchain was only read.
- git ran only in the scratch copy run1/ws/mental_model: the extension's git init and private refs (triggered through the board), plus my read-only for-each-ref with GIT_CONFIG_GLOBAL=/dev/null and GIT_CONFIG_NOSYSTEM=1.
- Read-only: grep of /snap/code/current/usr/share/code/resources/app (the user's VS Code version and its webview code). Before/after listings of ~/.config/Code, ~/.copilot, ~/.config/google-chrome, ~/.local/share/Trash/files, ~/.vscode/extensions, ~/.cache, ~/.pki, ~/.local/share and ~ (top level): all unchanged.
- No file under /home/zhengyew/telelean was modified (find -newer my start marker found nothing outside node_modules; the node_modules/.vitest-cache entries come from other runs, as I ran no vitest). The real mental_model is unchanged: no .lake, .git or graph.json.
- No network use beyond loopback CDP, no downloads, no npm install, no Claude CLI, no git outside the scratch dir, nothing sent or published.

