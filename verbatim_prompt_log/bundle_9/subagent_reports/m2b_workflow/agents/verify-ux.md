# verify:ux (agent adaa3b7ff9642e4d6)

## verdict
needs-work

## what_i_ran
Everything ran in scratch at /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/m2verify-ux/. I wrote nothing under the repo.

1. Read m2-plan.md, user-guide.md (section 10 in full, M1 sections spot-checked) and the code that matters for this lens: the webview's run components and store, the extension's consent/backend/boardSession code, and the runner manager's notices, labels and Accept path.

2. Wrote three mocha probe suites (probe/ux.test.ts, ux2.test.ts, ux3.test.ts) and bundled them with the extension's own esbuild options. I ran them with @vscode/test-cli against the installed VS Code 1.140 build, in Test mode: FakeBackend through testing.useRunBackend, TELELEAN_NO_REAL_CLAUDE=1, real sandboxed Lean, xvfb at 1680x1050, ulimit -c 0. HOME, XDG dirs, user-data, extensions and TMPDIR were all under scratch. The suites click through the real board over CDP, record what the user sees and take light/dark screenshots (plus high contrast for M1). I looked at about 50 of the roughly 200 screenshots.
   - **Narrow layout** (Explorer open, board about 790 px wide), out-20261101T144518: 13 of 14 tests passed. The one failure was a locator bug in my test, so I redid that case in the wide pass. 51/51 soft checks passed. Covered: tray states; declined consent; normative with 3 questions (own words / Leave it open / Decide for me, scopes, guess hidden then shown, decisions.json); review with explicit toggle, report card, Ask me instead, lifecycle; raw diff; Accept, history and byte-exact Undo; attempts history; literal ghost, Revoke…, I hold this, round 2, Accept via the banner, Undo; ghost "No" then Discard; definition question; cancel; closing and reopening the board while a run works; reload while working giving Interrupted, then Resume (same session via --resume) and Stop; Self-evident?; M1 add card + Undo and the delete dialog.
   - **Wide layout** (side bars closed, 1382 px), out-20261101T145255 and out-20261101T145951: 9 of 9 passed after two fixes to my own harness (consent preset, card clicks). Covered: assumption made the target with ⊢; the run panel beside the board; hide/show via the badge; the subject-scoped answer appearing as EARLIER ANSWERS IN FORCE in the next run's first message; the literal Accept end state; gate-failed notice and details; Feedback sent with Ctrl+Enter; give-up; Accept of an empty proposal; raw diff with no files.
   - **Failure and drift**, out-20261101T150731: 4/4. A start while the user's files have a Lean error fails with no session; Accept after a far edit merges and keeps the user's edit; an adjacent edit is refused with the user guide's conflict text.

3. Started a Development-mode instance (not Test mode) with custom dialogs, a PATH without Claude and TELELEAN_NO_REAL_CLAUDE=1, and drove it from outside over CDP (devmode/out-20261101T230226). The real consent modal shows exactly the guide's text. Cancel is not remembered; Run with Claude is remembered. The start is then refused with "Claude could not be started: real Claude is disabled here (TELELEAN_NO_REAL_CLAUDE=1): no Claude binary was looked up or run."

4. Ran the repo's own e2e VS Code instance: `TELELEAN_SMOKE_GREP="end to end" node scripts/smoke.mjs` with TELELEAN_TEST_TMP in scratch. Result: 20 passing (M1 e2e 13 + M2 e2e-runs 7), 0 isolation failures, exit 0.

5. Final checks: no process, telelean-* unit or Xvfb of mine is left. The real-home snapshot matches the one I took at the start, except the mtime of ~/.config/Code (the user's own VS Code). `find -newer` against my baseline finds only the main session's prompt-log files in the repo.

## issues
- **severity:** major
  - **package:** runner
  - **description:** The literal walkthrough (D-29 target #25) ends with a warning on the board. The user adopts the suggestion with "I hold this", round 2 is proved, they press Accept, and the target immediately gets TL107: "The proof uses \"a-character-who-cannot-be-in\", which the declared premises do not cover." A mismatch (used-undeclared) arrow appears and Problems goes from 1 to 2. Accept writes the adopted card and the proof, but never adds the adopted card to the target's `premises:`. That is so even though the user adopted it for this target, round 2 was frozen with it selected, and attempts.jsonl lists it among round 2's premises. Neither plan 4.9/7.1 nor the decisions log addresses this, and the integrator's tests check file contents, not diagnostics.
  - **evidence:** Wide run observations in /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/m2verify-ux/out-20261101T145255/observations.jsonl:
- literal-target-after-accept: premises are still [cynder-dark-past, new-spyro-pg, pg-no-dark-past]; the footprint includes a-character-who-cannot-be-in.
- literal-graph-diagnostics: TL107 warning.
- literal-edges: a-character-who-cannot-be-in → verified edge with mismatch used-undeclared.

Screenshots in .../out-20261101T145255/shots/: 16-wide-literal-accepted-target-light.png and 17-wide-problems-list-light.png. Narrow run: .../out-20261101T144518/shots/26-literal-accepted-light.png (⚠1 on the derivation, "Problems 2").
  - **suggested_fix:** When the accepted round used adopted cards, have telelean's Accept also declare them on the target: append their ids to the target's `premises:` in the applied plan, e.g. as a pre-ticked lifecycle-style item "Declare … as a premise of …". telelean does this itself, so G5's rule that the agent never changes `premises` is unaffected. Add an assertion to m2flow.test.ts / e2e-runs.test.ts that the literal Accept leaves no TL107, and mention it in user-guide 10.9/10.10.
- **severity:** major
  - **package:** webview
  - **description:** When the board webview is narrower than 1000 px, the run is hard to use. The run panel moves under the board (max-height 48%), but the selection tray keeps its 2–3 lines (still showing the 4 chosen chips with a disabled button for the whole run) and the A|D|G box keeps its rows. The board shrinks to a strip about 200–230 px high (cards cut off, "1 linked" scroll hints), and the questions and review get about 150 px with an inner scrollbar. A 3-question batch shows only the first question's heading; the review's statement step shows about 6 lines. This is ordinary use, not an edge case: a 1440-px window with the Explorer open gives a 790-px board. It also happens every time "Raw Lean diff…" opens beside the board, which halves the editor area; then the panel shows only the review's Back/Next row.
  - **evidence:** Narrow run screenshots in /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/m2verify-ux/out-20261101T144518/shots/:
- 07-working-formalising-light.png: board strip y≈150–380, toasts over the goal card.
- 08-questions-light.png: question area about 150 px.
- 11-review-statement-light.png
- 15-raw-diff-light.png: board at about 390 px, panel shows only Back/Next.

CSS cause: styles/board.css `@media (max-width: 1000px) { .tl-workspace { flex-direction: column } .tl-run { max-height: 48% } }`.
  - **suggested_fix:** While a run is active, collapse the tray to one line or hide it (it is disabled with a reason anyway) and fold the A|D|G box. Give the panel more height, or make the board/panel split draggable. Scroll the question set or review into view when it appears. Consider opening the raw diff in another editor group without shrinking the board below 1000 px.
- **severity:** minor
  - **package:** webview
  - **description:** The "~changed" / "+new" diff badge squeezes card sentences. It sits in the card's title row (flex: none) next to the check mark, kind glyph and chevron. In columns about 220 px wide the sentence column is about 45 px, so text breaks every 4–5 letters: "PG game s canno t have chara cters", "Cynd er would not be a good additi on to the". The Proposed view is hard to read whenever the board is about 800 px wide, for example narrow windows or with the raw diff open.
  - **evidence:** Screenshots in /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/m2verify-ux/out-20261101T144518/shots/: 11-review-statement-light.png, 25-literal-round2-light.png, 32-definition-question-dark.png. At 1382 px it is readable: .../out-20261101T145255/shots/06-wide-review-statement-light.png.
  - **suggested_fix:** Put the badge on its own line above the sentence, or position it absolutely on the card's top edge, so .tl-card__text keeps the full row width.
- **severity:** minor
  - **package:** webview
  - **description:** The review's statement step is hard to read, and this is the step where the user checks meaning. It has three problems:
- The Lean is Lean's `#print` header, "@[reducible] def Spyro.pg_no_dark_past : Prop := …", although the user's file says `abbrev pg_no_dark_past : Prop :=`.
- It sits in a two-column grid (minmax(150px,1fr)) inside a ≤460-px panel with overflow-wrap: break-word, so identifiers break mid-word ("Spyro.pg_no_dark_pas" / "t").
- The heading "Lean <code>pg_no_dark_past</code>" inherits text-transform: uppercase from .tl-details__heading, so the identifier shows as "PG_NO_DARK_PAST".
  - **evidence:** Screenshots: /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/m2verify-ux/out-20261101T145255/shots/06-wide-review-statement-light.png and 12-wide-literal-ghost-light.png. Observation statement-step in .../out-20261101T144518/observations.jsonl. CSS: board.css .tl-details__heading (uppercase), .tl-statement__pair, .tl-lean.
  - **suggested_fix:** Show only the proposition: strip `@[reducible] def <name> : Prop :=` here, or have runner renderStatements return the body. Stack the sentence above the Lean inside the panel. Set text-transform: none on code inside headings.
- **severity:** minor
  - **package:** webview
  - **description:** A gave-up round first looks like a normal proposal:
- the badge says "Claude: proposal ready · Spyro" and the state line "Ready for review";
- Accept is the primary button in the banner;
- the review opens on the Statement step.

The red "Claude's attempts didn't pass the checks 3 times: … telelean reverted its working copy to “Statements frozen (round 1)”" notice and the "reverted" notice come after the whole review section in the panel. In the wide layout they are below the fold; in the narrow one they are invisible. A2 says the board tells the user what kept failing. The verdict is also visible at the review's Result step.
  - **evidence:** Screenshots in /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/m2verify-ux/out-20261101T145951/shots/: 06-wide-giveup-top-light.png (first screen) vs 07-wide-giveup-notices-light-panel.png (the notices, after scrolling past the review). Narrow run: .../out-20261101T144518/shots/30-giveup-notices-light.png. Panel order in RunPanel.tsx: Target, Outcome, QuestionSet, Review, Notices, …
  - **suggested_fix:** Render the gave-up, reverted, cap, no-finish and environment notices above the review, or as a line in the banner and badge. They are not proof results that D-19 hides.
- **severity:** minor
  - **package:** runner
  - **description:** Accepting an empty proposal claims changes and offers Undo. For the Self-evident? run (not proved; the review says "This round changed no file: Accept only records the outcome"), Accept changes no file, adds no history entry and leaves no Undo step. Yet the panel says "Accepted: Claude’s changes are in your files. Undo (Ctrl+Z) or History reverts them." and the notice says "Accepted: These suffice → not proved: … Undo reverts it." If the user presses Ctrl+Z as told, it undoes their previous, unrelated board action. The label also says "These suffice" for a Self-evident? run.
  - **evidence:** Observation empty-accept in /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/m2verify-ux/out-20261101T145951/observations.jsonl: state accepted, files unchanged, workspace undo null, history only "Initial state". Screenshot .../out-20261101T145951/shots/10-wide-empty-accept-light.png. Code: manager.ts ~1698 always appends "Undo reverts it."; webview RunPanel ENDED_TEXT.accepted.
  - **suggested_fix:** When the plan applies nothing, word it as "Recorded: … (no file changed)" with no Undo hint, in both the runner notice and the webview ended text. Use a Self-evident? label (core proposalLabel) for runs with no premises.
- **severity:** minor
  - **package:** runner
  - **description:** The usage-limit notice shows raw CLI values: "Claude usage limit status: allowed_warning (five hour window, 83% used); resets 2026-11-01T16:45:41.000Z." That is the internal status name and a UTC ISO time. The status line in the same panel already words it well, in local time: "rate limit: close (resets Nov 2 00:45)".
  - **evidence:** Screenshot /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/m2verify-ux/out-20261101T144518/shots/07-working-formalising-dark-panel.png; observation `working` in the same run. Code: runner manager.ts rate_limit case (~line 659).
  - **suggested_fix:** Word the notice like the webview's rateLimitView, for example "Close to your plan's usage limit (five-hour window, 83% used); resets at 00:45", or have the webview render it from the structured rateLimit.
- **severity:** minor
  - **package:** runner
  - **description:** "Stop" on an interrupted run that never produced a proposal shows the toast "Proposal discarded".
  - **evidence:** Observation `stopped` in /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/m2verify-ux/out-20261101T144518/observations.jsonl: toasts ["Proposal discarded"], state discarded. The label comes from manager.ts discard(), okOutcome('Proposal discarded').
  - **suggested_fix:** Use "Run stopped" (or "Run discarded") when there was no proposal.
- **severity:** minor
  - **package:** webview
  - **description:** Wording polish, three items:
- **Gate jargon.** The UI says "gate attempts 1/3", "Gate attempts: 1 passed of 2" and "1 gate attempt", and prefixes each failure with a "G3" chip. The user guide calls them "check attempts" and never introduces "gate" or "G3".
- **Target hint.** The tray says "Select the goal to prove (a GOAL card) as the target." even when a Derivation is selected. A Derivation is a valid target via ⊢, and this happens right after an Accept turns the goal into a Derivation.
- **Toast style.** Declining consent shows a red error toast for the user's own choice. It stays up into the next start, stacked over the goal card.
  - **evidence:** Screenshots in /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/m2verify-ux/:
- out-20261101T145951/shots/04-wide-gate-attempts-light-panel.png (gate jargon)
- out-20261101T145255/shots/16-wide-literal-accepted-target-light.png (tray hint with a Derivation selected)
- out-20261101T144518/shots/06-consent-declined-light.png and 07-working-formalising-light.png (toasts)
  - **suggested_fix:** Say "check attempts" and drop the G-step chip, or explain it in a tooltip. Use "Choose the target (a Goal or a Derivation) with ⊢". Show the declined consent as an info toast.
- **severity:** minor
  - **package:** webview
  - **description:** The run panel keeps its old scroll position when its content changes, so the new content can be off-screen:
- In the narrow layout, after the answers are sent the review appears above the viewport; the panel shows "Your answers" and Activity.
- In the wide layout, pressing "Next: Card changes" leaves the panel showing the answered questions instead of the lifecycle step.
  - **evidence:** Screenshots: /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/m2verify-ux/out-20261101T144518/shots/11-review-statement-light.png and .../out-20261101T145255/shots/09-wide-lifecycle-light-panel.png.
  - **suggested_fix:** Scroll the review section into view when it first appears, and scroll the current step into view on every step change.
- **severity:** minor
  - **package:** docs
  - **description:** user-guide.md section 10 is accurate for everything I exercised, with three exceptions:
- 10.4 and 10.8 say "check attempts" where the UI shows "gate attempts" and "G3".
- 10.9/10.10 do not say that an adopted suggestion is not added to the target's premises, so the board shows TL107 after Accept (issue 1).
- 10.10's "one Undo step reverts the whole Accept" is not true for an empty proposal (issue 6).

What I checked and found accurate: the consent text and remembering; preflight and refusal wording; status-line states; the question choices and scopes; the guess reveal; decisions.json and answers in force; notice and give-up texts; the overlay and the "result after the review" chip; review steps; ghost card; Accept, Feedback (Ctrl+Enter) and Discard; the history label; Cancel and Dismiss; reload with Resume and Stop; the conflict text; the troubleshooting texts; the settings table (defaults and bounds match package.json).
  - **evidence:** Compared /home/zhengyew/telelean/docs/user-guide.md sections 10.1–10.15 against the probe observations and screenshots listed above, and against extension package.json contributes.configuration.
  - **suggested_fix:** Align the wording with whichever term the webview keeps, and update 10.9/10.10 when issues 1 and 6 are fixed.

## strengths
- Every flow in the lens works end to end in the real VS Code instance with real Lean and the FakeBackend, including flows the integrator's e2e does not cover: three questions in one batch with own words / Leave it open / Decide for me, Self-evident?, ghost "No", reload while working with Resume and Stop, a start while the user's files have a Lean error, Accept after a far edit (merges) or an adjacent edit (refused), and Accept of an empty proposal. 62/62 soft checks passed.
- The user's files change only on Accept. Files were byte-identical before Accept in every run, and also after cancel, Discard, give-up, Stop, reload/resume, declined consent, a failed start and a refused Accept. Each Accept is one history entry ("accept · These suffice → proved: … (+ Make Derivation)" / "(+ 1 adopted assumption)") and Undo restores it byte-exactly; after a merged Accept, Undo returns to the user's own edit.
- Consent works as documented. The real modal (Development mode) shows exactly the guide's text; Cancel is not remembered and a yes is. The quota tripwire also holds outside Test mode: "Claude could not be started: real Claude is disabled here (TELELEAN_NO_REAL_CLAUDE=1): no Claude binary was looked up or run."
- Questions follow D-20. Phenomenon tags, options with consequences, own words, Leave it open, Decide for me, and scope radios ("these cards" disabled when a question names no card) are all there. Send stays disabled until every question has an answer. No guess is in the DOM before answering, and guesses (with notes, or "none given") appear after. decisions.json gets one record per answer, and a whole-subject answer reaches the next run as "EARLIER ANSWERS IN FORCE" while a this-run answer does not.
- The A2 loop is visible and exact. The gate-failed notice carries core's sentence plus Details showing what Claude was told. The give-up and revert notices and the report's "reverted to Statements frozen (round 1)" are shown. Feedback, by button or Ctrl+Enter, continues the same session in round 2 with a fresh freeze.
- The proposal UI matches the design. The board switches to Proposed by itself; diff marks use glyph, word, colour and halo; "result after the review" hides the proof status until the statements are reviewed; Vocabulary "+1 new" opens by itself; the translucent "Claude suggests" ghost card offers I hold this (with a reason) and No. The report card shows the footprint in words ("assumes characters exist"), "consistency unchecked", Ask me instead prefilling Feedback, and the definition Yes/No gate on Accept. Raw Lean diff opens a read-only multi-diff beside the board.
- The wide layout (board ≥ 1000 px, panel beside it) is clean and legible in light, dark and high-contrast themes. Claude's words are consistently italic with "Claude" / "Claude asks" / "(Claude's wording)" markers. Closing the board does not stop a run, and the badge brings the panel back.
- M1 still works. My own spot-check (add a card and Undo, the delete dialog, high-contrast board) passed, and the repo's e2e instance re-run passed 20/20 (M1 e2e 13 + M2 e2e 7) with clean isolation checks.

## effects_outside_repo
- All writes went to the scratch dir /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/m2verify-ux/: probe sources and bundles, isolated VS Code profiles (vsc-*, devmode/profile-*), outputs (out-*: about 200 screenshots plus observation and check logs), the repo smoke's profile under smoke-tt/, logs, home snapshots and an empty npm-cache dir. One of those is a symlink, probe/node_modules → /home/zhengyew/telelean/node_modules, which @vscode/test-cli needed to resolve its packages.
- Ran Xvfb and VS Code 1.140 test-build instances: 6 Test-mode probe launches, 1 Development-mode instance and the repo smoke's two instances. Each had HOME, XDG dirs, user-data and extensions under scratch (TMPDIR too for my probes) and ulimit -c 0. DevTools endpoints listened on random 127.0.0.1 ports, loopback only.
- Transient systemd --user telelean-* scopes ran from sandboxed Lean inside those instances. None of mine is left (checked). The other telelean-* units I saw belonged to the parallel m2verify-gate and m2verify-safety vitest runs; I did not touch them.
- I killed only my own processes: two stuck probe instances of mine (vsc-20261101T144307, vsc-20261101T145635) and the Development-mode instance's process group after its driver finished. My own cleanup also terminated two of my own bash shells. Nothing of mine is left running.
- git ran only inside my scratch model copies (GIT_CONFIG_GLOBAL=/dev/null, GIT_CONFIG_NOSYSTEM=1). Lean ran only through runLean inside the instances.
- The real-home snapshot before and after is identical: known-projects 37 lines, ~/.npm/_logs 11 files, ~/.vscode/extensions 18, plus ~/.copilot, google-chrome, fontconfig, .pki, Trash and /tmp/telelean-* 27 all unchanged. The only difference is the mtime of ~/.config/Code, from the user's own running VS Code (its TransportSecurity and DIPS-wal files); the entry count is still 67. smoke.mjs's own isolation checks also passed.
- No Claude CLI ran. Test mode used the FakeBackend, and the Development-mode start was refused by TELELEAN_NO_REAL_CLAUDE before any binary lookup, with no claude on PATH. Nothing was pushed, sent, uploaded or installed, and I read no credentials. I did not monitor VS Code's own background traffic; updates, telemetry, experiments and AI features were off in every profile.
- No file under /home/zhengyew/telelean was changed by me: find -newer my baseline lists only the main session's verbatim_prompt_log/bundle_9 files.

