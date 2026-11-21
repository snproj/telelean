# build:1g

Agent `a419520c635af5ebf` of workflow `wf_666837d7-695`. Verbatim output (JSON alongside).

SUB-SLICE 1g REPORT (builder): end-to-end tests and docs for the new board

Status: finished. Parts A, B and C and every extra item are done, and every check passes. No spec is marked `test.fixme`. The final sweep had one failure, in s1-canvas; it is fixed and the spec has been re-run.

Short names used in the commands below:
- REPO = /home/zhengyew/telelean
- B = /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b1g
- CAP = /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/capped.sh. It runs each job in a systemd-run user scope with MemoryMax and no swap. It also sets `TELELEAN_NO_REAL_CLAUDE=1` and `LEAN_NUM_THREADS=2` for every job.
- BIN = /home/zhengyew/telelean/node_modules/.bin

======================================================================
1. FILES CHANGED
======================================================================
Everything is inside the allowed write set. Nothing was written to packages/extension/dist or packages/extension/out (checked).

**Webview**
- /home/zhengyew/telelean/packages/webview/src/styles/board.css: a product fix. `.tl-context__actions` gets `min-width: 26px` (see decision d).
- /home/zhengyew/telelean/packages/webview/test/harness/harness.js
- /home/zhengyew/telelean/packages/webview/test/e2e/helpers.ts
- New specs: /home/zhengyew/telelean/packages/webview/test/e2e/{s1-canvas,s1-arrows,s1-glows,s1-formalize,s1-session}.spec.ts
- Updated specs: /home/zhengyew/telelean/packages/webview/test/e2e/{board,m1-cards,m1-drag,m1-edits,m1-fixes,m1-lean-code,m1-store,m2-carryover,m2-layout,m2-overlay,m2-provenance,m2-review,m2-run}.spec.ts
- Unchanged:
  - m1-header.spec.ts and m2-questions.spec.ts;
  - everything else in packages/webview/test/harness/ and packages/webview/test/shared/, including the Chrome isolation and home-guard.ts.

**Runner**
- /home/zhengyew/telelean/packages/runner/src/run/prompts.ts: adds `RUN_NAME` and sets the bundle's first line.
- /home/zhengyew/telelean/packages/runner/src/llm/fakeScripts.ts: comment only.
- /home/zhengyew/telelean/packages/runner/test/run/prompts.test.ts
- /home/zhengyew/telelean/packages/runner/test/run/manager.happy.test.ts
- /home/zhengyew/telelean/packages/runner/test/run/manager.gate.test.ts
- /home/zhengyew/telelean/packages/runner/test/run/helpers/harness.ts
- /home/zhengyew/telelean/packages/runner/test/run/fresh.e2e.test.ts: comments only.
- /home/zhengyew/telelean/packages/runner/test/integration/m2flow.test.ts
- /home/zhengyew/telelean/packages/runner/test/semantic/refresh.test.ts

**Core**
- /home/zhengyew/telelean/packages/core/test/gate/realFacts.test.ts

**Extension** (type-checked only)
- /home/zhengyew/telelean/packages/extension/test/demo/demoClaude.ts
- /home/zhengyew/telelean/packages/extension/test/suite/{e2e-runs.test.ts,e2e.test.ts,model.test.ts,runs.test.ts,activation.test.ts,board.test.ts,boards.test.ts,fakeWorkspace.ts}

**test-fixtures**
- /home/zhengyew/telelean/test-fixtures/walkthrough/: README.md and 22 scripts. These are the 20 `cheat-*.json` files, `literal.json` and `normative.json`.
- /home/zhengyew/telelean/test-fixtures/fresh/: README.md and 10 scripts: {arith,chain,derivation-premise,goal-first,penguin,plato,rain,self-evident-not,socrates,variants}.json
- /home/zhengyew/telelean/test-fixtures/semantic/recorded/spyro-facts.json and extras-facts.json

**Docs**
- /home/zhengyew/telelean/docs/user-guide.md
- /home/zhengyew/telelean/docs/DEMO.md
- /home/zhengyew/telelean/docs/m2-plan.md: the §5.2 note and the template line.
- /home/zhengyew/telelean/docs/slice1-plan.md: the §8 entry "builder 1g" and a §9 line "after 1g".

**Changed in the repo during my run, but not by me**
- /home/zhengyew/telelean/docs/slice2-plan.md: modified at 12:27:30 by another writer. I did not edit it.
- /home/zhengyew/telelean/verbatim_prompt_log/bundle_21/subagent_reports/slice2_design_workflow/*: the orchestrator's logging.

**Created and then removed by me inside the repo**
- /home/zhengyew/telelean/packages/webview/test-results/ held triage screenshots. I moved them to /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b1g/triage-shots and removed the folder.
- vitest also wrote its own results.json under packages/{core,runner,webview}/node_modules/.vite. Those folders existed before. The extension's vitest ran with `--no-cache`.

======================================================================
2. SPECS
======================================================================
**Added: 5 specs, 28 tests**
- **s1-canvas (4 tests)**
  - Wheel and Ctrl+wheel zoom keep the point under the cursor fixed; the zoom range.
  - A right-drag pans, selects nothing and opens no menu.
  - A still right click (under 4 px) opens the menu at the pointer: the CM-7 selection rule, and "New proposition here" at that position.
  - The + − 0 keys and the arrow keys, Tab following the focused card, the toolbar, and a canvas edge's badge.
- **s1-arrows (11 tests)**
  - Drawing an arrow by its handle: the hint, the refusals, a cycle, Esc.
  - Drawing into an axiom: AR-6's dialog; Cancel keeps it an axiom; confirming moves it to the canvas.
  - Draw arrows from the selection.
  - Click, Ctrl+click, and Delete removing the selected arrow (A16).
  - The ∅ mark: set, select, Formalize from no premises, Delete.
  - Move to axioms from the menu; Mark pending.
  - The Ctrl selection rectangle.
  - A TL107 arrow's "Draw this arrow".
  - Drops on the column: several propositions are refused; one lands before an axiom.
  - The mark's menu offers Formalize.
- **s1-glows (6 tests)**
  - The green glow and dimming; high contrast.
  - The band's ✓ and its tooltip appear only for a complete band. An open band has none, and stale facts give none.
  - The band on a ∅ stub.
  - RV-6 in the Proposed view.
  - A band arrow from a card to the right of its target.
- **s1-formalize (5 tests)**
  - The Context Menu section: its text, summary and fixed height.
  - Formalize's enablement and each of its disabled reasons.
  - Card icons, several cards, and the "…" overflow.
  - Formalize from the section and from an arrow's menu.
  - AR-8: mark pending, and no statement.
  - A10's report hints.
- **s1-session (2 tests)**
  - ES-9's read-only board during a run: the A|P box, handles, details, menus, Delete and moves are off; Undo/Redo are off with the reason; viewing stays on. The end of the run unlocks the board.
  - The Proposed view's disabled handles and actions.

Where the brief's required tests are:
- zoom keeps the point fixed, right-drag pans with no menu, and a still right click opens the menu: s1-canvas;
- an arrow drawn by its handle, drawing into an axiom moves it after confirming, and Delete removes a selected arrow: s1-arrows;
- the band's ✓ only when complete: s1-glows;
- Formalize's enablement and disabled reasons: s1-formalize;
- the read-only board during a run: s1-session.

**Updated: 13 specs, each keeping its intent**

| Spec | Tests |
|---|---|
| board | 13 |
| m1-cards | 4 |
| m1-drag | 7 |
| m1-edits | 7 |
| m1-fixes | 8 |
| m1-lean-code | 4 |
| m1-store | 1 |
| m2-carryover | 5 |
| m2-layout | 8 |
| m2-overlay | 4 |
| m2-provenance | 3 |
| m2-review | 4 |
| m2-run | 5 |

m1-header (4 tests) and m2-questions (2 tests) are unchanged and pass. In total there are 20 specs and 107 tests: 79 existing and 28 new.

**Deleted: 3 tests, for behaviour v4 removed**
1. m1-fixes: '"These suffice" names the declared premises it would drop and offers "Add to its premises ▶" (M2: it starts a run with them all)'. Under CM-4 nothing is replaced any more.
2. m1-fixes: 'a focused arrow that skips the Derivations column is routed through a gap, never across a Derivation card'. That column no longer exists. It is replaced by 'an arrow never strikes through a card: arrows run under the cards, so a card in the way hides the part behind it'.
3. m2-review: 'fixer round 2: a round that changed no file but proved the goal: the ticked Goal -> Derivation is what Accept writes, and the tooltip says so'. There is no lifecycle step any more.

**Parts dropped inside tests that were kept**
- m1-cards: AT6.3's "proved: make Derivation?" click, now A19's "Drop these arrows".
- m1-cards: the assertion that no arrow goes into an axiom. Such an arrow is drawn when the graph has one (AR-6).
- board: the empty-Derivations placeholder. The canvas's and the column's empty texts are checked in m1-fixes instead.
- m2-layout: the folded tray.
- m2-review: the "Card changes" step, and the lifecycle ids of `acceptProposal`.

**Part B.** The 15 tsc errors in e2e-only files are fixed, and the extension's VS Code suites type-check.

======================================================================
3. COMMANDS AND SUMMARY LINES
======================================================================
I ran one heavy job at a time, each under CAP. MemAvailable was between 17.9 and 18.7 GB at every start.

**Scratch build**
- `cd REPO/packages/webview && TELELEAN_WEBVIEW_OUT=B/webview-build CAP 1500 BIN/vite build`
- Final: "✓ built in 157ms". Earlier builds: 159ms and 166ms.

**tsc**
- Command: `cd <pkg> && CAP 1500 BIN/tsc --noEmit -p <config>`. tsc prints nothing when clean.
- Each config exits 0 with 0 "error TS" lines:
  - core `tsconfig.test.json`
  - runner `tsconfig.test.json`
  - webview `tsconfig.json`
  - webview `tsconfig.node.json`. I re-ran this one after the last helper fix: exit 0, 0 errors.
  - extension `tsconfig.json`

**vitest**
- Command: `cd <pkg> && CAP 1800 timeout 1200 BIN/vitest run --maxWorkers=1`
- core: "Test Files 55 passed (55)  Tests 597 passed (597)". The run right after the recordings' regen had "Test Files 1 failed | 54 passed (55)  Tests 1 failed | 596 passed (597)": realFacts still expected `undeclared-premise`. Fixed (decision f).
- webview: "Test Files 19 passed (19)  Tests 313 passed (313)"
- extension, with `--no-cache`: "Test Files 22 passed (22)  Tests 203 passed (203)"

**Runner**
- Command: `cd REPO/packages/runner && TELELEAN_TEST_TMP=B/runner-tmp CAP <cap> timeout 900 BIN/vitest run --maxWorkers=1 <files>`
- Units, cap 1800 (`test/run/{prompts,manager.happy,manager.gate,walkthroughScript,smokeScript}`, `test/llm/m2Harness`): "Test Files 6 passed (6)  Tests 43 passed (43)"
- Regen, `UPDATE_SEMANTIC_RECORDINGS=1`, cap 3000, `test/semantic/refresh.test.ts`, real Lean: "Test Files 1 passed (1)  Tests 9 passed (9)"
- The same without the variable, after the comparison change: "Test Files 1 passed (1)  Tests 9 passed (9)"
- `test/integration/m2flow.test.ts`: "Test Files 1 passed (1)  Tests 5 passed (5)"
- `test/run/walkthrough.e2e.test.ts`: "Test Files 1 passed (1)  Tests 22 passed (22)"
- `test/run/fresh.e2e.test.ts`: "Test Files 1 passed (1)  Tests 9 passed (9)"
- manager.* and prompts, 8 files: "Test Files 8 passed (8)  Tests 66 passed (66)"
- Full suite at the end: `TELELEAN_TEST_TMP=B/runner-full-tmp CAP 6000 timeout 5400 BIN/vitest run --maxWorkers=1`. Started at 12:28:03 with MemAvailable 17944084 kB. Result: "Test Files 61 passed (61)  Tests 585 passed | 1 skipped (586)  Duration 533.52s"

**Playwright**
One spec per invocation, through /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b1g/pw.sh `<spec>`. The script prints MemAvailable, waits while it is under 1.5 GB, then runs:
`cd REPO/packages/webview && TELELEAN_WEBVIEW_OUT=B/webview-build TELELEAN_TEST_RESULTS=B/shots PWTEST_CACHE_DIR=B/pw-cache CAP 1800 sh -c 'ulimit -c 0; exec BIN/playwright test test/e2e/<spec> --output=B/pw-output'`

Final sweep:

| Spec | Summary line |
|---|---|
| board | "13 passed (8.4s)" |
| m1-cards | "4 passed (5.0s)" |
| m1-drag | "7 passed (4.8s)" |
| m1-edits | "7 passed (4.6s)" |
| m1-fixes | "8 passed (3.3s)" |
| m1-header | "4 passed (3.4s)" |
| m1-lean-code | "4 passed (3.0s)" |
| m1-store | "1 passed (1.8s)" |
| m2-carryover | "5 passed (3.7s)" |
| m2-layout | "8 passed (4.5s)" |
| m2-overlay | "4 passed (2.9s)" |
| m2-provenance | "3 passed (1.9s)" |
| m2-questions | "2 passed (1.8s)" |
| m2-review | "4 passed (3.4s)" |
| m2-run | "5 passed (3.0s)" |
| s1-canvas | "1 failed  3 passed (4.1s)" (see the fix below) |
| s1-arrows | "11 passed (9.1s)" |
| s1-glows | "6 passed (2.7s)" |
| s1-formalize | "5 passed (3.6s)" |
| s1-session | "2 passed (2.5s)" |

The s1-canvas failure was a race: an arrow check ran in the same frame as a toolbar zoom. The fix is in helpers.ts: `checkArrows` and `badgeReport` now wait for the engine's frame. After the fix I re-ran the six specs that use these two helpers:

| Spec | Summary line |
|---|---|
| board | "13 passed (9.0s)" |
| m1-drag | "7 passed (4.7s)" |
| m1-fixes | "8 passed (3.5s)" |
| s1-arrows | "11 passed (9.3s)" |
| s1-glows | "6 passed (2.7s)" |
| s1-canvas, `--repeat-each=3` | "12 passed (12.6s)" |

Stability runs with `--repeat-each=2`:

| Spec | Summary line |
|---|---|
| s1-arrows | "22 passed (18.0s)" |
| s1-formalize | "10 passed (6.9s)" |
| s1-session | "4 passed (4.4s)" |
| m2-run | "10 passed (5.8s)" |
| m2-layout | "16 passed (8.7s)" |
| board | "26 passed (17.4s)" |

The home guard printed "unchanged" after every spec run.

**Logs**
- /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b1g/logs/final.summary
- /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b1g/logs/final/ (each command's full log)
- /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b1g/logs/runner-f7.summary
- /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b1g/logs/final/runner-full.log

======================================================================
4. FIXTURE DIFFS
======================================================================
**F7 (walkthrough and fresh):** 34 files changed, 42 insertions(+), 38 deletions(-).
- Every script's first-turn matcher now reads `Run: \"Formalize for dependencies\"`.
- `fresh/arith.json` and `fresh/self-evident-not.json` have no premises, so they read `Run: \"Follows from nothing?\"`.
- Both READMEs say so.

**Semantic recordings:** extras-facts.json +155/−16, spyro-facts.json +45/−9.
- The only change is that every declaration gained `valueConsts`: spyro has 16 declarations (9 of them empty) and extras has 42 (15 empty).
- I checked this by removing `valueConsts` from the new files and comparing with the originals: they are identical, timestamps included.
- The originals are kept in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b1g/recorded-orig and /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b1g/fixtures-orig.

======================================================================
5. DECISIONS
======================================================================
These are appended to /home/zhengyew/telelean/docs/slice1-plan.md §8 as "2026-11-19 (builder 1g, end-to-end tests and docs)". The measured numbers are in §9 as "after 1g".

a. **Harness.** harness.js also answers `addArrows`, `removeArrows`, `setFromNothing`, `claimPending` and `moveCards`.

b. **helpers.ts works with the two parts of the board** (the AXIOMS column and the canvas).
   - New helpers: `list(page, 'AXIOM'|'PROPOSITION')`, `columnPoint`, `canvasPoint`, `canvasView` (reads `--tl-tx`, `--tl-ty` and `--tl-s`), `drawArrow`, `clickArrow`, `rightClick`, `rightDrag`, `menuItem`, `inView`.
   - `clickArrow` clicks 30 % along the arrow.
   - `panToShow` pans with the arrow keys, because the canvas clips its content and never scrolls.
   - `checkArrows` accepts either side edge at each end, and checks cut arrows.
   - `badgeReport` reports the column and the canvas separately.
   - `edgePairs` skips arrows into axioms, as core's subjectGraph does.
   - `shotPath` honours `TELELEAN_TEST_RESULTS`, so a scratch run writes no screenshots into the repo.
   - `checkArrows` and `badgeReport` wait for the engine's frame (the race fix).

c. **Deletions** were made only for behaviour v4 removed: the 3 tests in section 2.

d. **Product fix found by s1-formalize.** The Context Menu section's actions area had `flex: 1 1 0` with `min-width: 0`. When the summary and Formalize's reason filled the line, it shrank to 0 px and clipped the "…" button, so CM-3's overflow could not be reached. This happens in a window narrower than about 950 px with a reason shown. It now has `min-width: 26px`.

e. **F7.** prompts.ts adds `RUN_NAME`. The first line is now:
   - `Run: "Formalize for dependencies" for the subject …`
   - or `Run: "Follows from nothing?" for the subject …` when there are no premises.

   `test/llm/m2Harness.test.ts` keeps its own strings, because it is a self-contained test of the matcher.

f. **Recordings.**
   - `refresh.test.ts` now compares the recordings whole and asserts that every declaration has `valueConsts`. 1d's temporary comparison without `valueConsts` is gone.
   - Core's realFacts no longer expects `undeclared-premise` for `Spyro.cynder_not_good.holds`. With the values recorded, B.2 sees that the proof uses exactly the selected premises.

g. **VS Code suites.**
   - The four suites with type errors were updated: e2e-runs, e2e, model and runs.
   - The question is now the goal's incoming arrows: "Select incoming arrows", then the section's Formalize.
   - There is no lifecycle step, and the history label is `Formalize → proved: …`.
   - The suites use the A|P box, Move to axioms, and the AXIOM and PROPOSITION kinds.
   - I also updated activation, board, boards and fakeWorkspace to the new kinds, colour ids and labels, so the suites should pass when they are run.

h. **Docs.**
   - user-guide.md starts with a "What changed in slice 1" section. It links to the spec (verbatim_prompt_log/bundle_21/user_requested_documents/01_spec_v4.md) and to the autopilot decision log (02_autopilot_decisions.md); both targets exist.
   - Its board, actions, marks, limits and Formalize sections are rewritten.
   - DEMO.md's manual steps now draw the arrows and press Formalize. The automated driver is marked as not updated.

======================================================================
6. EFFECTS OUTSIDE THE REPO AND THE SCRATCH DIR
======================================================================
**Chrome isolation check**
- Each Playwright run used an isolated HOME, XDG and TMPDIR under /tmp/tl-pw-chrome-*. The harness's teardown created and deleted them. While they existed they held Chrome's Crash Reports/settings.dat, about 20 fontconfig cache files, and pki/nssdb (cert9.db, key4.db, pkcs11.txt).
- Each run also created and removed /tmp/playwright_chromiumdev_profile-*.
- None of these is left (checked at the end).
- The home guard walks each folder recursively. After every spec it printed: "~/.config/google-chrome 6 entries, ~/.cache/google-chrome absent, ~/.cache/fontconfig 91 entries, ~/.pki 4 entries, ~/.local/share/pki absent; unchanged".
- I re-checked at the end: the counts are the same, and nothing in ~/.config/google-chrome or ~/.pki is newer than 11:33 today.

**/tmp/node-compile-cache/v24.21.0-x64-964aae3f-1000/**
- Three new entries: 39dcd6a8 (11:33:17), 99b19012 (12:03:52) and 968083fb (12:26:11). Node wrote them during my three vite builds.
- The folder existed before. I left the entries in place; they are a cache and safe to delete.

**/tmp/playwright-transform-cache-1000**
- My first trial run created it, and I removed it. Later runs used `PWTEST_CACHE_DIR` inside the scratch dir.

**What I did not do**
- No network, downloads or installs, and no change to git state.
- No real Claude: CAP sets `TELELEAN_NO_REAL_CLAUDE=1` on every job.
- No credentials read, and no writes to packages/extension/dist or out.
- Real Lean ran only for the brief's items (the regen and the runner suite), with `TELELEAN_TEST_TMP` in the scratch dir. Nothing was written under ~/.elan.

**Disk scan**
A ctime scan of the whole disk since 11:33:45 found 274 entries (/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b1g/logs/audit-ctime.txt). Apart from the items above, none are mine. They belong to:
- VS Code (~/.config/Code: logs, caches, and User, including its local history of ~/webring/Webring/Blog.lean, which the user edited);
- snap/vivaldi and snap/discord;
- ~/.cache/copilot and ~/.copilot;
- GNOME tracker3, gnome-shell and wireplumber;
- Claude Code itself (~/.claude/projects, skills, and a .credentials.json refresh; I did not read it).

**Processes**
None of mine are left. ramwatch.sh and waitwf.sh are the orchestrator's. The Lean servers belong to the user's webring. A claude process under the user's own VS Code telelean run is also not mine.

**Blocked command**
A safety check blocked this command of mine:
`mkdir -p B/trace1 && cd B/trace1 && rm -rf ./* && python3 -I -c …`
It was meant to make an empty scratch folder and unzip a Playwright trace into it. Nothing ran: trace1 was never created and nothing was deleted. I unzipped into /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b1g/trace2 instead. Nothing needs removing.

======================================================================
7. OPEN ITEMS FOR THE INTEGRATOR
======================================================================
- /home/zhengyew/telelean/docs/slice2-plan.md still says the first line stays `Run: "These suffice"`, now at lines 727 and 2175 (another writer edited the file at 12:27). I did not edit it, as the brief says.
- /home/zhengyew/telelean/packages/extension/scripts/demo-driver.mjs and demo-ui.mjs still select cards and press the tray's "These suffice". They are outside the brief, and DEMO.md says they are not updated.
- /home/zhengyew/telelean/scripts/walkthrough-claude.mjs mentions "These suffice" in a comment only. Its dry run plays the updated walkthrough fixtures. I did not run it.
- The VS Code instance suites are type-checked only, not run, as the brief says.
- The browser tests do not cover A11 or ES-7's drift refusal; core's and the runner's tests cover them. The column's distance hit-test for arrows is exercised only incidentally.

======================================================================
8. THE SLICES (the user's question "What are the various slices again?")
======================================================================
From /home/zhengyew/telelean/docs/slice1-plan.md:

**Slice 1: the new board (spec v4)**
- 1a, two kinds: AXIOM and PROPOSITION (model, markup aliases, the statuses pending and established, layout, planners, labels).
- 1b, arrows as board edits: draw, delete, "follows from nothing", an arrow turns an axiom into a proposition, Move to axioms, Mark pending, cycle refusal, arrow selection.
- 1c1, the canvas and the columns above it: pan, zoom, right-drag, the right-click menu, the keyboard, positions, the arrow overlay, the ∅ stub, the AXIOMS header counts.
- 1c2, arrow gestures: hit-testing and selection, Delete, drawing by the handle and from the selection, the selection rectangle, dragging between the canvas and the column.
- 1d: glows and bands, arrow looks, the legend.
- 1e, Formalize for dependencies: the Context Menu section replaces the tray, the selected arrows are the question, the AR-8 dialog, and the gate's no-hidden-edges check.
- 1f: the board is read-only during a run, Accept refuses on drift, and the board's Undo is locked during a run.
- 1g (this one): the end-to-end tests and the user guide; the VS Code suites type-check.

**Later slices**
- 2: the review list, arrow items, and the session Undo stack.
- 3: FROZEN and the freeze UI.
- 4: the transform window.
- 5: references.
