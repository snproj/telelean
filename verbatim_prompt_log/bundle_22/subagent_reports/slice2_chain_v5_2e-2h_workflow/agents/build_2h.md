# build:2h

Agent `acec4afcb92849313` of workflow `wf_bee8fde1-76d`. Verbatim output (JSON alongside).

BUILDER 2h REPORT (slice 2h: the board in a session, Formalize, Undo, retirement; carry-over F-V2G-FC-9)

All paths are under /home/zhengyew/telelean unless they start with /tmp. S = /tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad. HEAD is still 1473ca0, nothing is staged, and no git state was changed.

== CARRY-OVER STATUS ==
F-V2G-FC-9: FIXED (this is fixer 2g r1's alternative).
- Core's ItemView gets an optional `blocked?: true`. It is set only on listed items whose host GroupItem is blocked (core reducer groupItemOf, through itemGates), in packages/core/src/review/view.ts:1248 and packages/core/src/review/reducer.ts:1373.
- The webview's groupItemOf (packages/webview/src/model/review.ts:350) now reads that field instead of rebuilding it from the gate.
- Nothing leaks: `blocked` never depends on the outcome of a hidden Result (§4.5).
- Tests that fail without the fix:
  - core test/review/view.test.ts "builder 2h (carry-over F-V2G-FC-9): a listed item carries the host's GroupItem `blocked`…"
  - webview test/unit/review.test.ts "carry-over F-V2G-FC-9: an item that waits for a hidden item and has a dependency in review: "blocked", as the host plans it"
- Mutation-checked three ways: W01, C01 and C02 (table below).
- Recorded in plan §8.

== FILES CHANGED (107, compared with the after-2g snapshot) ==
docs:
- docs/slice2-plan.md: the §8 builder 2h entry.
- docs/user-guide.md:
  - a new "What changed in slice 2" section;
  - 10.7–10.14 rewritten (the session bar, the Proposed view, the review list and read-only while Claude works, the stage reveal and Show results, the decline options, mid-stage Formalize, Submit/Apply/Exit, the two Undo stacks);
  - 10.15–10.19 renumbered; stale Accept/Discard lines fixed.

core:
- src/protocol.ts: the old messages retired (startRun, acceptProposal, feedback, discardProposal, adoptGhost, rejectGhost, openProposalDiff, host `proposal`); RUN_MESSAGE_TYPES has 14 entries.
- src/gate/types.ts: `holdAs` required.
- src/gate/adoption.ts: an undefined holdAs is refused as `invalid`.
- src/review/view.ts: ItemView.blocked (carry-over).
- src/review/reducer.ts: itemGates carries blocked (carry-over).
- src/review/texts.ts: reviewItems now says "1 review item" for one.
- src/formalize.ts: docs only.
- tests: test/gate/adoption, premiseCheats, ruleHelpers and rules (holdAs; the new 2h test); test/proposal/diff and test/review/deps and items (holdAs); test/protocol.m2 (retirement test); test/review/view (carry-over test).

runner:
- src/run/manager.ts: the M2 accept, feedback, discard, adoptGhost, rejectGhost, proposalDiff and proposal() are retired. A new settleLegacy settles a resumed v1 round, then converts it to a session. upgradeLegacyProposal is kept.
- src/run/types.ts, src/run/index.ts, src/run/prompts.ts: retired members removed (feedbackTurn, adoptionTurn).
- tests: test/run/session.reload (3 new v1 tests); test/run/manager.accept, happy, lifecycle, rounds and start; test/run/prompts; test/integration/m2flow; test/run/walkthrough.e2e (all updated).

extension:
- src/logic/boardSession.ts, runs.ts, actionMapping.ts: retired handling removed. New busy text; RUN_SUCCESS_NOTICES updated.
- unit tests: test/unit/fakes.ts, runRouting, editSessionLock, hostRuns, realRuns, runBackend.
- VS Code suites: test/suite/runs.test.ts converted; test/suite/e2e-runs.test.ts has 7 scenarios skipped for later.

webview src:
- new model/sessionBoard.ts.
- changed: board/Board.tsx, BoardInput.ts, CardDetails.tsx, ContextMenu.tsx, EdgeEngine.ts (setBadges), GhostCards.tsx, NodeCard.tsx (ItemMark), contextActions.ts, edges.ts, geometry.ts, gestures.ts, menu.ts, runAction.ts, useFormalize.ts; dialogs/Dialogs.tsx; header/ContextSection.tsx, Header.tsx, legend.ts; main.tsx (focusin/focusout undo scope); model/review.ts; model/run.ts; run/RunPanel.tsx; state/session.ts; state/store.ts; styles/board.css; App.tsx.
- deleted: run/Review.tsx, run/ProposalBanner.tsx, run/GhostSuggestion.tsx, run/ReportCard.tsx. Copies are in S/b2h/.

webview tests:
- new: test/unit/sessionBoard.test.ts, test/unit/store-board-session.test.ts, test/e2e/s2-board.spec.ts.
- changed: unit band, contextActions, edges, gestures, legend, menu, review, run, store-arrows, store-canvas, store-formalize, store-gestures, store-lock, store-run, store-session, store; e2e board, helpers, m1-edits, m2-layout, m2-overlay, m2-provenance, m2-run, s1-arrows, s1-formalize, s1-glows, s1-session, s2-review; harness/harness.js (answers `formalize` and `moveProposed`; sends `session`, never `proposal`).
- deleted: test/e2e/m2-review.spec.ts (copy in S/b2h/deleted/).

== TESTS ==
Added:
- test/unit/sessionBoard.test.ts (20):
  - the overlay comes from the view only (no leak from the Current board); the twin pair gives equal overlays;
  - while hidden, no arrows, premises or Result marks are drawn and every target is chipped, whatever the view carries;
  - Add and Remove are drawn or not by status; the looks, badges and tooltips; focusesItem; pathMidpoint; premiseAnchor;
  - markText and markGlyph; the hidden chip; contextItems;
  - the undoScope truth table; sessionUndoButtons (sealed, D2-62, applying, confirming); formalizeSessionOf;
  - edge cases: empty, removed card, locations, new vocabulary.
- test/unit/store-board-session.test.ts (7): Undo routing (Proposed view, focus in the panel, Current view, sealed, step); Claude's arrow is never selected until accepted; focusItem; group Accept (own false, lastGroup, hidden Result excluded, D2-62); moveProposed (shown, rolled back, never moveCards).
- test/e2e/s2-board.spec.ts (7, drafted and run): hidden stage; shown arrows, badge and menu Accept; high contrast; mid-stage Formalize; Undo stacks and moveProposed; Context Menu group Accept; D2-62.
- webview unit additions:
  - contextActions +4: several targets; sources first; review items model; busy/D2-62. One of these replaces "several targets wait for the review list".
  - gestures +2: proposed hit role; session gestureGate.
  - legend +1, menu +3, review +1 (carry-over).
  - store-formalize +8: chain; select-too; no select-too; mid-stage; in-session; mark pending after a session began; results-hidden; Current/step reasons.
  - store-gestures +1 (the first stage switch filters the selection).
  - store-canvas +1 (a move shown stays shown on a new graph).
  - store-run +1 (Stop only for non-session runs).
  - store-session +1 (retired proposal refused and ignored).
- core: view.test +1 (carry-over); adoption.test +1 ("holdAs is required": @ts-expect-error plus undefined refused as invalid); protocol.m2 +1 ("the retired messages are refused by the validators").
- runner session.reload +3:
  - "a v1 run interrupted mid-round, resumed: its round ends as a session…";
  - "a v1 round resumed that edits after finish: the late edit is discarded before the conversion…";
  - "a v1 run in review whose proposal a build before spec v4 saved … is upgraded, then converted".

Updated (some renamed where their rule changed):
- webview: store-lock 3, store-gestures 2, store-arrows 1, store-canvas 2, store-session 2, store 1, band 1, edges 2, store-run 3 (kept ones).
- e2e: board, m1-edits, m2-run, s1-arrows, s1-formalize 2, s1-glows, s1-session, m2-provenance (its proposal test became "AT6.10 an edit session's board…"), m2-layout (one test cut to "new content in the run panel comes into view: a question set"), s2-review setup.
- extension: runRouting (7 reworded), editSessionLock 1, hostRuns 2, realRuns, runBackend.
- runner: manager.accept, happy, rounds, start; m2flow; walkthrough.e2e (compile and wording).
- core: gate and review fixtures (holdAs); adoption "holdAs as an axiom writes an AXIOM card…"; protocol "passes run through, and null clears it…".

Skipped for later (VS Code suites, which only the integrator runs; they drive M2's retired review):
- test/suite/runs.test.ts: "Accept: Main.lean changes on disk, one history entry is recorded, Undo restores the file".
- test/suite/e2e-runs.test.ts:
  - "normative: the question answered on the board, the overlay, the explicit toggle, the raw diff; Accept writes Main.lean…"
  - "literal: not proved, the "Claude suggests" card, "I hold this"…"
  - "cheating: the smuggled axiom is refused…; Feedback…; Discard…"
  - "give-up: three refused attempts…; Discard"
  - "cancel: Cancel on the run panel stops Claude while it works; nothing is written"
  - "race: Formalize pressed while the board's Lean refresh rebuilds .lake/build…; Discard"
  - "reload while a question waits: … the run finishes"

Deleted (the retired UI and messages, §5.14):
- webview test/unit/run.test.ts (9):
  - "steps: statements first, then vocabulary, definitions, the result…"
  - "Accept needs every definition approved…"
  - "Accept’s tooltip says what it does to the files…"
  - "the banner counts; "+N new" vocabulary" (its vocabulary part is kept as a new test)
  - "suggestions waiting for a decision come from the live run, else from the proposal"
  - "shows the proposal’s graph; with the result hidden…"
  - "cards and vocabulary the proposal removes are shown from the current board"
  - "spec v4.1 RV-6 (slice 1d): a card downstream whose proof status the proposal changes hides its result too…"
  - "a diff mark’s tooltip leaves out the fields that would tell the result while it is hidden"
- webview test/unit/store-run.test.ts (8):
  - "a new proposal starts its review and switches the board to it…"
  - "a run that leaves review takes the board back to the current files…"
  - "the proposed view is only for the board’s own subject"
  - "going past the statements reveals the result…"
  - "Accept waits for every definition; a "no" opens Feedback…"
  - "Accept remembers whether it changes the files…"
  - "Feedback: prefills go on their own line…"
  - "ghosts: "I hold this"…; "No"; Discard; Raw Lean diff"
- webview test/unit/store-session.test.ts: "a legacy proposal still gets its review and overlay; no session state is made".
- e2e test/e2e/m2-review.spec.ts (all 4):
  - "AT6.4 the review runs statements -> vocabulary -> definitions -> report card…"
  - "AT6.4 "Show result" reveals the report card early; Feedback, Accept, Discard and Raw Lean diff…"
  - 2 "fixer round 2: an Accept…" tests
- e2e m2-overlay (3):
  - "AT6.5 the overlay: Current | Proposed; diff marks…"
  - "AT6.5 "Claude suggests": translucent ghost cards, "I hold this"…"
  - "high contrast: the diff halo becomes an outline…"
- e2e m2-layout (4):
  - "half an editor (the raw Lean diff open beside the board)…"
  - "the statement step: the sentence above the proposition alone…"
  - "diff marks sit on their own line…"
  - "a round that gave up says so at once (badge, state, banner; Accept not primary)…"
- e2e s1-formalize (1): "a result that is not proved names the cards the proof needs that nobody selected… (A10)".
- extension test/unit/runRouting.test.ts, openProposalDiff (4):
  - "shows the proposal's files…"
  - "focused on one file…"
  - "a stale proposal id…"
  - "is read-only: it does not wait behind a slow run message"
- runner test/run/prompts.test.ts: "Feedback", "Adoption".
- runner test/run/manager.lifecycle.test.ts: "moves to 2h: a run in review saved before spec v4 comes back with its proposal in the two kinds, and can be accepted (slice 1a fixer)". It is now covered by session.reload's pre-v4 test.

== MUTATION CHECKS (48; each restored byte for byte) ==
Harness: S/b2h/mutate.py; results in S/b2h/mut/results_round1.json and results_round2.json. Every mutant was restored and checked with `cmp`; afterwards sha256 -c of all 17 mutated files reported OK.
- 45 failed a test on the first run.
- The 3 survivors were W19, W31 and W34. Each got a new test, and all 3 are now killed.
- C06 was checked by hand with tsc.

Format: id | file:line | what was broken | test that failed.
- W01 | webview src/model/review.ts:350 | blocked rebuilt from the gate (2g's approximation) | review.test "the GroupItem of an item…" and "carry-over F-V2G-FC-9…"
- W02–W05 | src/model/sessionBoard.ts:119–122 | arrows, premises, the target chip and Result marks no longer held while hidden | sessionBoard "while the results are hidden: … (whatever a view carries)"
- W06 | sessionBoard.ts:170 | a removed card loses its Current place | sessionBoard "edge cases…" and store-canvas "the session's positions…"
- W07 | sessionBoard.ts:132 | a declined Add is still drawn | sessionBoard "an Add in review stays drawn; declined or withdrawn…"
- W08 | sessionBoard.ts:143 | an accepted Remove is still drawn | sessionBoard "a Remove in review draws the base arrow…"
- W09 / W10 / W11 | sessionBoard.ts:260 / 260 / 258 | unused Add drawn dotted / Add not translucent / Remove badged '+' | sessionBoard "an Add in review: translucent with "+"…" (+ "toDisplayEdges gives Claude’s arrow its own look…" for W09 and W10)
- W12 | src/board/edges.ts:177 | no badges | sessionBoard "toDisplayEdges gives Claude’s arrow its own look…"
- W13 | sessionBoard.ts:268 | an accepted Add focuses its item | sessionBoard "a click on Claude’s arrow focuses its item…"; gestures "slice 2h (§5.10, D2-20)…"; store-board-session "one still in review is never selected…"
- W14 | src/state/store.ts:1389 | an undecided Claude arrow is selectable | store-gestures "in the Proposed view: arrows change only…" and "works during an edit session…"; store-board-session
- W15 | src/board/gestures.ts:43 | the proposed hit role becomes drawn | gestures "slice 2h (§5.10, D2-20)…"
- W16 | src/state/session.ts:863 | the first-stage switch keeps an undecided arrow selected | store-gestures "slice 2h: the first stage switches to Proposed…"
- W17 / W18 | gestures.ts:506 | a move allowed while a step runs / the applying reason | gestures "slice 2h (§5.10, D2-33, D2-62)…" and store-gestures "everything on an idle board…"
- W19 | store.ts:2071 | a Proposed-view move also reaches moveCards | (round 2) store-lock "a session on screen without a run known…"
- W20 | session.ts:931 | a shown move is lost on a new graph | store-canvas "a move shown before the host answered stays shown…"
- W21 | sessionBoard.ts:330 | the panel focus is ignored by Undo | sessionBoard undoScope table; store-board-session "in the Current view…"
- W22 | store.ts:2452 | Ctrl+Z never posts sessionUndo | store-board-session "in the Proposed view Ctrl+Z…"; store-lock
- W23 | store.ts:665 | the board stack's locked text is lost | store-lock "undoLock: a run's lock…"; store-board-session
- W24 | sessionBoard.ts:354 | the sealed text (UN-5) is lost | sessionBoard "the host’s step labels; … sealed (UN-5)…"
- W25 | src/board/contextActions.ts:143 | targets not ordered sources first | contextActions "several targets are ordered sources first…"; store-formalize chain tests
- W26 | contextActions.ts:131 | only one target | contextActions "slice 2h (§5.11, RV-9): several targets at once…"
- W27 | contextActions.ts:115 | Formalize allowed from the Current view | store-formalize "the Current view during a session…"
- W28 | store.ts:1369 | a mid-stage Formalize is posted as a start | store-formalize "in the Proposed view with the results shown: a mid-stage formalize…"
- W29 | store.ts:2249 | a chain's source is asked about | store-formalize "a chain: …"
- W30 | store.ts:2259 | Mark pending offered in a session | store-formalize "an unproved source: asked in-session…"
- W31 | store.ts:2277 | a pending mark is sent during a session | (round 2) store-formalize "a "Mark pending" question answered after a session began…"
- W32 | store.ts:2235 | no results-hidden dialog | store-formalize "D2-65: …"
- W33 | session.ts:728 | the wrong stage is posted | store-formalize mid-stage tests
- W34 | session.ts:758 | the section's Accept is not sent as a group | (round 2) store-board-session "one group decideItems (own: false)…" (lastGroup)
- W35 | contextActions.ts:174 | Accept k of N no longer says what it leaves | contextActions "none: no review items part; one: "1 review item"…"
- W36 | src/header/legend.ts:58 | no proposed legend entry | legend "adds `proposed`…"
- W37 | src/board/menu.ts:227 | Open in editor offered for a session-only card | menu "a card: its review items…"
- W38 | menu.ts:263 | no mid-stage Formalize in the menus | menu "Formalize on a drawn arrow is the mid-stage one…"
- W39 | src/model/run.ts:44 | the busy text says accept/discard | contextActions "a run of the model folder that is active…"; run.test "the tray is blocked…"
- C01 | core src/review/view.ts:1248 | view without blocked | view.test "builder 2h (carry-over F-V2G-FC-9)…"
- C02 | core src/review/reducer.ts:1373 | blocked always false | the same test
- C03 | core src/gate/adoption.ts:88 | an undefined holdAs is accepted | adoption.test "2h (fixer 2b2 r1, S-V2B2-S2): `holdAs` is required…"
- C04 | core src/protocol.ts:871 | discardProposal is parsed again | protocol.m2 "slice 2h: the retired messages are refused…"
- C05 | core src/review/texts.ts:334 | "1 review items" | webview contextActions "none: … "1 review item"…"
- C06 | core src/gate/types.ts:337 | holdAs made optional again | tsc TS2578 (an unused @ts-expect-error) at core test/gate/adoption.test.ts:195
- R01 | runner src/run/manager.ts:147 | a v1 round is not converted to a session | session.reload "a v1 run interrupted mid-round, resumed…" and "a v1 round resumed that edits after finish…"
- R02 | manager.ts:135 | late edits after finish are kept | session.reload "a v1 round resumed that edits after finish…"
- E01 | extension src/logic/runs.ts:177 | the busy refusal says Accept/Discard | runBackend "only a non-terminal run blocks a start…"

Not mutation-checked (stated plainly):
- settleLegacy's "reverted" branch (give-up, cap or no finish on a resumed v1 round) has no test of its own. It is M2's revert code moved unchanged.
- main.tsx's focusout wiring is DOM-only. It has no unit test; s2-board's Undo test covers the focus leaving the session bar for the canvas.

== VERIFICATION (commands run; summary lines) ==
vt.sh (S/b2h/vt.sh) runs: cd <pkg>; env TMPDIR=S/b2h/tmp TELELEAN_TEST_TMP=S/b2h/ttmp TELELEAN_NO_REAL_CLAUDE=1 S/capped.sh ${CAP} node_modules/.bin/vitest run --maxWorkers=1 --no-cache --fsModuleCachePath=S/b2h/fsmc.

- tsc (from the repo root): S/capped.sh 2500 node_modules/.bin/tsc --noEmit -p <config>, for packages/core/tsconfig.test.json, packages/runner/tsconfig.test.json, packages/webview/tsconfig.json, packages/webview/tsconfig.node.json and packages/extension/tsconfig.json. All rc=0 with no output.
- vitest (CAP=2500 timeout 580 S/b2h/vt.sh packages/<p>):
  - core: "Test Files 76 passed (76)", "Tests 1137 passed (1137)"
  - webview: "Test Files 24 passed (24)", "Tests 431 passed (431)"
  - extension: "Test Files 22 passed (22)", "Tests 215 passed (215)"
- runner, the touched and dependent files (CAP=3000 timeout 900 S/b2h/vt.sh packages/runner $(cat S/b2h/runfiles.txt), 22 files: test/run/backend, manager.accept, caps, gate, happy, lifecycle, rounds, start, prompts, quotaTripwire, session.end, failclosed, premises, queue, reload, review, submit, tools, twins, views, smokeScript, walkthroughScript): "Test Files 22 passed (22)", "Tests 297 passed (297)", Duration 107.68s.
- runner with real Lean, one at a time (CAP=3000 timeout 900):
  - test/integration/m2flow.test.ts: "Tests 5 passed (5)", 199.28s
  - test/run/walkthrough.e2e.test.ts: "Tests 24 passed (24)", 733.06s
- webview build (from packages/webview): TMPDIR=S/b2h/tmp TELELEAN_WEBVIEW_OUT=S/b2h/webview-out S/capped.sh 3000 /home/zhengyew/telelean/node_modules/.bin/vite build. Result: "✓ built in 923ms" (webview.js 630.42 kB). Nothing was written to packages/extension/dist or out (checked).
- Playwright, one spec at a time with S/b2h/pw/run.sh. From packages/webview, per spec: TMPDIR=S/b2h/tmp TELELEAN_NO_REAL_CLAUDE=1 TELELEAN_WEBVIEW_OUT=S/b2h/webview-out timeout 900 S/capped.sh 3000 sh -c 'ulimit -c 0; /home/zhengyew/telelean/node_modules/.bin/playwright test test/e2e/<spec>', then test-results moved to S/b2h/pw/. Results (MemAvailable stayed about 38 GB):
  - s2-board 7 passed. The first two runs failed (3 failed, then 2 failed) on mistakes in the draft itself: the SVG badge's text includes its title, the panel width, the empty-section check, and not panning the card into view before dragging. They were fixed in the spec, not in src.
  - s2-review 12, s1-formalize 5, s1-session 2, s1-glows 6, m2-run 5, m2-layout 4, m2-overlay 1, m2-provenance 3, board 13, m1-edits 7, s1-arrows 11: all passed.
  - The home guard printed "unchanged" every time.
- Not run: the VS Code suites (integrator only); the extension demo scripts.

== DECISIONS FOR THE ORCHESTRATOR TO LOG (also in plan §8, dated 2026-11-21) ==
1. Carry-over shape: an optional ItemView.blocked on listed items only. (Alternative: the view carries the whole GroupItem list and the webview plans on it.)
2. v1 runs: a resumed v1 round is settled as before, then converted to an edit session (settleLegacy, then convertLegacy). A failed conversion stays in review with its error and offers Stop (cancelRun). (Alternative: keep M2's proposal path for v1 runs only.)
3. sessionOverlay holds the mask itself while results.shown is false: no Claude arrows, premise cards or Result marks, and every target chipped. (Alternative: trust the host's mask alone.)
4. Positions in the Proposed view: a removed card keeps its Current canvas place, and a move still awaiting the host stays shown across a new Current graph. (Alternative: let the canvas place it; drop the shown move.)
5. Marks show a status word with its glyph ("accepted ✓", "declined ✗", "to be redone ↻", "withdrawn –"). Claude's arrows in review get their own tooltips. (Alternative: words only; no tooltip in review.)
6. The Proposed view's move reason per phase: D2-62's text while a step runs, "Apply is running…" while applying, else "Back to review first." (Alternative: one text for every phase but stage.)
7. The Undo scope is also cleared on a focusout that leads to nothing. (Alternative: focusin only, which kept the session scope after a click on the canvas.)
8. The first stage's auto-switch to Proposed filters the selection, as the toggle does. (Alternative: keep the Current selection.)
9. The Context Menu's "Accept k of N" tooltip lists what it leaves and why, and core's text now reads "1 review item". (Alternative: the label alone; "1 review items".)
10. Formalize tooltip for several targets: "Ask Claude to formalise the selected arrows and prove N targets, one step each, sources first". formalizeState takes the subject from the cards when the store has none yet. (Alternative: list every target.)
11. Busy texts: "An edit session is waiting for your review: apply or exit it first." on the board and "An edit session on "S" is waiting for your review: Apply or Exit it first." from the host. Core's EDIT_SESSION_ACTIVE keeps slice 1's exact words ("until you accept or discard it") and is FLAGGED for you. (Alternative: reword it to "until you apply or exit it" in core and in every test that quotes it.)
12. A request without holdAs is refused as invalid with "A premise is held as an axiom or as a proposition pending proof, not left unchosen." (Alternative: a generic invalid-payload text.)
13. VS Code suites: runs.test.ts is converted (a formalize start, the session's first stage, openSessionDiff with confirmed, Exit instead of Cancel/Stop for a session) and its Accept test is skipped. In e2e-runs.test.ts the 7 scenarios that drive M2's review are skipped, with their bodies kept for the rewrite. Not run here. (Alternative: delete them, or rewrite them blind.)
14. Playwright specs of the retired UI: the deletions and ports listed above. s2-review and s2-board cover their rules. (Alternative: port every deleted test to the session UI.)

== OPEN ITEMS / NOT CHANGED ==
- packages/extension/scripts/demo-driver.mjs and demo-ui.mjs still drive M2's review (Accept, Discard, "I hold this"). They need the real Claude, so they were neither run nor rewritten.
- EDIT_SESSION_ACTIVE wording: see decision 11.
- The skipped VS Code scenarios need rewriting for the session panel, session bar and Apply.

== EFFECTS OUTSIDE THE REPO AND THE SCRATCH DIR ==
- Playwright's Chrome made short temp directories /tmp/tl-pw-chrome-XXXXXX (14 runs). The harness teardown deleted each one; none is left.
- The home guard reported the real home unchanged every run (~/.config/google-chrome 10 entries, ~/.cache/fontconfig 113, ~/.pki 4, the others absent).
- capped.sh started transient systemd user scopes (systemd-run --user --scope); they ended with each job.
- The runner tests started sandboxed Lean (bwrap) processes; their files were under TELELEAN_TEST_TMP=S/b2h/ttmp.
- Inside the repo but outside the sources: vite and vitest wrote their transient bundled-config files to node_modules/.vite-temp and deleted them. The directory is empty; only its mtime changed.
- Read-only git commands (git diff, ls-files, show through the orchestrator's S/snapdiff.sh and my per-file reconstruction in S/b2h/recon). HEAD 1473ca0 and the staged content are unchanged.
- No downloads, installs, network use, Claude CLI, VS Code launch, sudo, credential reads, or writes to ~/.config, ~/.claude or ~/.elan. Nothing was written to packages/extension/dist or out.

Scratch artefacts: S/b2h/ (vt.sh, mutate.py, mut/, pw/, webview-out/, recon/, test_name_diff.txt, changed_2h.txt, now_2h_final.patch, the logs, deleted/ copies).

