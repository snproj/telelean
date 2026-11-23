# Decisions taken on autopilot (turn 21)

On 2026-11-18 you put me on autopilot. You asked me to finish the spec, to choose my own recommendation for any remaining design decision, to log those choices so you can reverse them, and then to implement the slices without stopping.

This file is that log. Every choice I made without asking you is listed here, with what it affects and how to reverse it. New entries are appended as the work goes on; the newest are at the bottom.

**Reference documents**
- The spec: `01_spec_v4.md`, in this folder. Clause IDs such as `AR-8` refer to it.
- Your answers to ★D1–★D6 are in its Part 2. Those are your decisions, not mine.

**How to undo code changes**
- I do not commit, stage or branch: your git state stays yours.
- After each slice, I save all my changes so far as one patch against `HEAD`, new files included: `bundle_21/evidence/patches/after_slice_N.patch`.
  - The patches cover only files I changed. Your own uncommitted change (`package-lock.json`, from the 2026-11-17 `npm install`) and the untracked build folders (`node_modules/`, `packages/extension/dist/`, `packages/extension/out/`) are never in them, and never touched by the steps below.
- **To undo everything I did:** `git apply -R bundle_21/evidence/patches/after_slice_LAST.patch`, where LAST is the newest slice.
- **To keep slices 1 to N and drop the later ones:** run the step above, then `git apply bundle_21/evidence/patches/after_slice_N.patch`.
- Both steps work only if the files have not been edited since; `git apply --check` tells you first. Run them from the repository root, with the patch paths relative to `verbatim_prompt_log/`.

---

## Design decisions

### AP-1 · ★D7: formalizing an arrow out of an unproved proposition → (b) Ask
- **Chosen:** telelean asks "‹source› is not proved: mark it pending, also formalize the arrows into it, or cancel?" Nothing is assumed without your answer.
- **Why:** it reuses your own "pending proof" idea, needs no new kind of proof, and never adds an assumption silently (S17).
- **Affects:** AR-8, ES-2, Appendix B.1.
- **To reverse:** choose (a) "given" (conditional proofs, discharged automatically later) or (c) "refuse". Only the AR-8 dialog and the run's preflight change.

### AP-2 · ★D8: slice order → (a) board first
- **Chosen:**
  1. the new board with Formalize for dependencies on today's review;
  2. the review list;
  3. FROZEN, including arrows;
  4. the transform window;
  5. references.
- **Why:** Formalize replaces These suffice, every later slice builds on the arrows, and the board is what you use daily.
- **To reverse:** reorder the remaining slices. Slices already built stay.

## Working decisions (how I work while you are away)

### AP-3 · No real-Claude runs on autopilot
- **Chosen:** I run no real-Claude telelean runs while you are away, so none of your plan's quota is spent without you. All tests use the fake Claude, as the standing rule requires.
- **Deferred to when you are back:** a live walkthrough of Formalize for dependencies.
- **To reverse:** tell me to run them. I announce the quota first, as always.

### AP-4 · No commits; one patch per slice
- **Chosen:** see "How to undo code changes" above.

### AP-5 · No new dependencies
- **Chosen:** no new npm packages and no downloads. Pan, zoom and the canvas are written by hand.
- **To reverse:** allow a library, e.g. for pan and zoom.

### AP-6 · Memory caps
- **Chosen:** this machine had about 2 GB of RAM free, with swap full. So every build and test runs one at a time, under a memory cap (`systemd-run --user --scope -p MemoryMax=…`), which kills only that job if it overflows.
- Heavy end-to-end tests (the VS Code test instance, the Playwright browser) run only when RAM allows. Otherwise they are listed as not run.

### AP-7 · One review round on the spec before building
- **Chosen:** three read-only reviewers checked v4.0 (fidelity and consistency, soundness, implementability) before slice 1. All their findings were applied (dispositions: `bundle_21/subagent_reports/spec_review_workflow/DISPOSITIONS.md`), and the result, v4.1, is the version I build from.
- **To reverse:** not applicable.

---

### AP-8 · Your installed extension is rebuilt only at verified slice ends
- **Chosen:** your telelean is installed straight from `packages/extension/dist`, so a build there changes the tool you use, the next time VS Code reloads it.
  - Builders never build into it. Test builds of the board go to a scratch folder (`TELELEAN_WEBVIEW_OUT`, a two-line addition to `vite.config.ts` and the test server).
  - At the end of a slice, if every check passes, I rebuild `dist` so your next VS Code reload runs the new version.
- **Backup** of the build you had before autopilot: `bundle_21/evidence/extension_build_before_autopilot.tar.gz` (`dist/` and `out/`).
  - To restore it: from `packages/extension`, run `tar -xzf ../../verbatim_prompt_log/bundle_21/evidence/extension_build_before_autopilot.tar.gz`, then reload VS Code.
- **To reverse:** tell me to leave `dist` alone; you then rebuild yourself with `npm run build:all` in `packages/extension`.

### AP-9 · One target per Formalize in slice 1
- **Chosen:** in slice 1, Formalize for dependencies takes arrows into one proposition at a time. With arrows into several, it is disabled with the reason.
- **Why:** today's run engine and review have exactly one target. Several targets, proved sources first (ES-2), come with the review list in slice 2, which needs per-target items anyway.
- **To reverse:** not needed; slice 2 lifts it.

### AP-10 · Mark pending needs a Lean statement
- **Chosen:** the AR-8 dialog's "Mark it pending" writes `axiom n.holds : n`, which needs the source's Lean statement `n`. For a source with no Lean statement, the dialog only explains: formalize and prove it first. It does not offer a pending mark that Claude would complete later.
- **Why:** a pending claim whose statement Claude writes in the same run would let Claude author an assumption (S6). The safe form needs your formalisation first.
- **To reverse:** allow "pending once formalized", with the formalisation as an own-Accept belief item (slice 2's review list can carry it).

### AP-11 · Two kinds internally too
- **Chosen:** the code's kind type becomes `AXIOM | PROPOSITION` everywhere: core, protocol, layout keys, and the graph.json schema enum. It does not keep three kinds internally behind a two-kind display.
- Old files keep working, because `type: ASSUMPTION/DERIVATION/GOAL` are read as aliases and never rewritten (B.6).
- **Why:** a hidden third kind would keep D/G-only behaviour alive in corners of the code where no one would see it.
- **To reverse:** not practical after slice 1; the aliases keep old files readable either way.

### AP-12 · Where canvas positions live, and Undo
- **Chosen:**
  - positions are stored in the subject's existing layout file (`layout.json`, with History as today);
  - each move or Tidy layout is one Undo step on the board stack, like today's reorder (UN-2);
  - telelean's automatic placement is computed in the board from the cards' measured sizes, and written only when you move a card or use Tidy layout, so opening a board writes nothing.
- **Alternative** (raised by the implementability reviewer): a separate positions file, with moves outside Undo.
- **To reverse:** move positions out of `layout.json`, and drop moves from Undo.

### AP-13 · Cycles include the arrows proofs use; cycles already in your files block Formalize
- **Chosen:** AR-3's cycle check counts both your arrows and the solid arrows of checked proofs. A cycle you wrote by hand (TL015) is reported, and Formalize is blocked until you remove one of its arrows. It never counts as a failed Claude attempt.
- **To reverse:** check drawn arrows only.

### AP-14 · Where the spec departs from your own words
Each item below is a clause where v4.1 does not do literally what your turn-21 text or answers say. I chose each one, on autopilot, for the reason given. To reverse one, restore your wording in the named clause; the code follows the spec.

| # | Your words | v4.1 | Why | Clause |
|---|---|---|---|---|
| a | "a green glow for 'proven'" | green means **established**: proved all the way down to axioms. A card proved from a pending one stays blue, with a chip | otherwise a pending claim would make cards look proved (S16) | BD-6 |
| b | Claude "can add or delete others if they aren't frozen" | under the preset, Claude only **adds** arrows into the targets. It deletes arrows only with the whole model open, and only arrows no proof uses | removing your arrows changes your question (S15) | ES-2, B.3 |
| c | (★D3) "everything outside the cards touched by the selected dotted arrows is frozen" | inside those cards, your sentences and existing Lean stay frozen too | stops the `… ∨ True` weakening (S1) | ES-2, Part 2 |
| d | "an easy way to make the entire model unfrozen" | the switch keeps your standing freezes, the selected arrows, and the Proofs of cards that are not targets; it resets after each session | keeps every proof tied to a question; no silent model-wide runs (S21) | ES-2 |
| e | "draw dependencies from at least one other axiom" | any axiom or proposition card can be the source, and "follows from nothing" also moves an axiom | a proposition source makes the same sense | AR-6 |
| f | a proposition dragged into AXIOMS "loses all incoming arrows" | it also loses its proof (kept in History; Undo restores it) | an axiom has no proof | AR-7 |
| g | "a right click … still opens the menu" | telelean's own menu, with the Context Menu's actions, replaces VS Code's default menu, except over text | the default menu has no board actions | CM-7 |
| h | declining an arrow "would also decline the relevant cards" | "relevant cards" = Results that use the arrow (to be redone) and cards Claude added at its ends (declined); your own cards are never declined | your own cards are not proposals | DO-0 |
| i | "the Current tab … completely uneditable" | the lock covers every subject of the model folder, not only the session's | subjects share one Lean build, hence one base | ES-9 |
| j | "Vocabulary and definitions … their own columns" | presuppositions stay in the Vocabulary column, but the AXIOMS header counts them, with pending claims and hidden assumptions | the AXIOMS column should account for every assumption | BD-1 |
| k | "dotted arrows" | arrows are drawn as dots (today they are dashed) | your word | Terms, BD-5 |

### AP-15 · How "follows from nothing" is stored
- **Chosen:** its own field in the card's block, `follows_from: nothing`, as data telelean keeps (Claude can never write it).
- **Why:** the first idea, an empty `premises:` list, is also what a typo or a list of invalid ids parses to today, so a typo would silently become the mark (soundness review S-12).
- **To reverse:** use `premises: []`, accepting that risk.

## Decisions taken while building

*(appended below as slices proceed)*

### AP-16 · Sub-slice 1a done (two kinds), and the "rests on pending" warning
- **Done:** sub-slice 1a. The kinds are AXIOM and PROPOSITION everywhere; the old names are read as aliases; `follows_from: nothing` exists; `established` is computed. Patch: `bundle_21/evidence/patches/after_slice_1a.patch`. Reports: `bundle_21/subagent_reports/slice1a_workflow/`.
  - Tests after 1a: core 526/526, webview 131/131, extension 180/180, the touched runner files pass.
  - The runner's real-Lean test bodies skip on this machine, because they wait for 12 GB of free RAM.
- **Runs saved by the old version:** a run left in review when you upgrade is converted to the new kinds when VS Code restores it, so it can still be accepted or discarded. Your doorstuck run is such a case.
- **Chosen** (the builder's brief and spec B.5 disagreed): a proof resting on a pending card also shows a Problems warning, TL102 "The proof rests on pending: …", besides the chip. Added in 1b.
- **To reverse:** drop the warning and keep only the chip.

### AP-17 · Sub-slice 1b done (arrows as board edits)
- **Done:** sub-slice 1b. You can draw and remove arrows, mark "follows from nothing", Move to axioms, and Mark pending; arrows into an axiom make it a proposition (AR-6); cycles are refused.
  - The gestures on the canvas come with 1c; in 1b they are buttons in the expanded card.
  - Patch: `after_slice_1b.patch`. Reports: `subagent_reports/slice1b_workflow/`.
  - Tests: core 556/556, webview 153/153, extension 185/185, plus 57 new arrow tests across the packages.
- **Carried over** to 1f and 1c, from its verification: one Delete of arrows and marks becomes a single Undo step; the cycle diagnostic ignores an old axiom's undrawn arrows; dialog wording "Move to axioms"; positions reach the Proposed view.
- **Ledger note:** builders' `npx` calls wrote npm debug logs to `~/.npm/_logs`, and npm's rotation removed older logs there. Since 1b every command calls `node_modules/.bin/…` directly, which writes no npm logs.

### AP-18 · Sub-slice 1f done (read-only during a run)
- **Done:** sub-slice 1f. While a run of the model folder is active, every board edit, Undo, Redo and History revert is refused, with the reason shown. Accept refuses when your files changed since the run started. 1b's four carry-overs are fixed. Patch: `after_slice_1f.patch`. Reports: `subagent_reports/slice1f_workflow/`.
  - Tests: core 564/564, webview 165/165, extension 197/197; the touched runner files pass, two of them as whole files with real Lean.
- **Chosen by the builder** (kept): the board also locks from the moment you start a run until the run manager answers, which closes a race where an edit could land after the run had read your files.
- **Carried over to 1e:**
  - the drift check becomes atomic (a hand edit that lands during Accept could still be merged);
  - edits queued before a start are applied first;
  - three nits.
- **Not in slice 1:** a live file watcher that shows the drift as soon as it happens (ES-7). Today the note appears when the proposal is built, and Accept refuses in any case. It comes with the session bar in slice 2.

### AP-19 · Sub-slice 1c1 done (the canvas, part 1)
- **Done:** sub-slice 1c1: the new board layout.
  - The Vocabulary and Definitions band sits above the board, with a divider and a collapsed summary.
  - The AXIOMS column has the "also assumed" line; the PROPOSITIONS canvas sits beside it.
  - Zoom: the wheel and pinch zoom about the cursor.
  - Pan: right-drag; a still right click opens the menu.
  - Keyboard: Tab, + − 0 and the arrow keys.
  - Toolbar: Fit all, Zoom to selection, Tidy layout.
  - Placement is computed and stored only when you move a card.
  - Arrows run across both parts and follow scrolling, panning and zooming. Cut-off ends get edge badges. Declared arrows are dotted, and the ∅ stub is dotted too.
  - Patch: `after_slice_1c1.patch`. Reports: `subagent_reports/slice1c1_workflow/`.
  - Tests: core 566/566, webview 212/212, extension 197/197.
- **Chosen by the builder** (kept):
  - pan and zoom live outside the store, so moving the view never re-renders the cards;
  - an expanded card on the canvas is widened to 420 px and raised over its neighbours;
  - Shift+F10 opens the menu for the focused card.
- **Fixed after verification:** the ∅ stub had been drawn like a Lean-checked arrow; it is now dotted, because it is your own declaration. Also, cards no longer jump when you switch between Current and Proposed.

### AP-20 · Sub-slice 1c2 done (arrow gestures)
- **Done:** sub-slice 1c2: what you can do with arrows on the board.
  - **Click:** arrows and ∅ stubs (Ctrl adds).
  - **Draw:** drag from a card's handle, with a rubber band and a hint that shows the AR-6 impact over an axiom; or right-click a target with cards selected and choose "Draw arrows from the selection".
  - **Delete:** removes the selected arrows and marks in one Undo step.
  - **Select:** a rectangle on empty canvas; a plain click on empty canvas clears the selection.
  - **Move:** drag a proposition onto the AXIOMS column to Move to axioms.
  - **Arrows a proof uses without a drawn arrow:** right-click offers "Draw this arrow".
  - Patch: `after_slice_1c2.patch`. Reports: `subagent_reports/slice1c2_workflow/`.
  - Tests: webview 244/244, core 566/566. This sub-slice touched only the webview.
- **Not yet checked in a browser:** the pointer wiring. It is unit-tested in its pure parts only; the Playwright tests come in 1g.
- **Carried over to 1d:**
  - the Proposed view shows the arrow handle disabled, with the reason;
  - a card dropped on the column keeps its drop position;
  - a stale press is cleared;
  - two tests;
  - two nits.
- **Memory note (07:38):** RAM fell to about 600 MB free because a Vivaldi tab grew to 1.7 GB; I sent you two notifications. You closed Vivaldi at about 07:40, after which about 22 GB was free.
  - I use that room to run the runner's real-Lean tests, which skip below 12 GB free. They run on a separate snapshot copy of the tree after 1c2, so builders can keep working.

### AP-21 · Sub-slice 1d done (glows, bands, and what a proof really uses)
- **Done:** sub-slice 1d.
  - **What a proof uses (direct(v))** now comes from Lean's elaborated proof term, through a small value probe in the Lean check. The probe imports `Lean.CoreM` and `Lean.Util.FoldConsts`, not all of `Lean`: about +90 MB and +0.1 s per check, where `import Lean` cost 1.6 GB and 15 s.
  - **Green glow ("✓ established"):** only for cards established by B.5.
  - **Band:** a bracket with a ✓ only when complete; otherwise dashed, without the ✓, naming what lies outside it.
  - **Arrow looks:** declared arrows are dotted; TL107 arrows get a notched head; TL109 is no longer drawn in the warning colour.
  - **Legend:** updated.
  - **Proposed view:** hides these until the result is revealed, for downstream cards too.
  - Patch: `after_slice_1d.patch`. Reports: `subagent_reports/slice1d_workflow/`.
  - Tests: core 580/580, webview 290/290, extension 197/197; the touched runner tests pass with real Lean.
- **Fixed after verification:**
  - a band's bracket could miss arrows that arrived from the right while still showing ✓ (blocker). Every band arrow now enters the left edge, and a band that cannot be drawn whole shows no ✓;
  - a card could glow green although Lean saw it use a card no arrow explains (major).
- **Chosen:**
  - if your model declares a name that clashes with the probe's imports, the check runs again without the probe. You keep your facts, and bands then show no ✓;
  - one known gap remains, recorded in the plan: with source-text-only facts (probe off), a card used only through a `simp` lemma whose basis the other cards explain can escape the cross-check. In that mode no band has a ✓ anyway.

### AP-22 · Sub-slice 1e done (Formalize for dependencies)
- **Done:** sub-slice 1e.
  - **The Context Menu section** replaces the tray: a selection summary, the labelled **Formalize for dependencies** button with its disabled reasons, and the card and arrow actions. The right-click menu shares the same actions.
  - **The AR-8 dialog:** "Mark pending and continue", or Cancel.
  - **The host** checks the question and applies the edits queued before the start.
  - **The run** no longer writes `premises:`.
  - **The gate** has the new `undeclared-premise` rule (B.2), on the elaborated facts, also for "Claude suggests".
  - **Prompts:** now in terms of arrows and "follows from nothing".
  - **1f's carry-overs:** Accept's drift check is now atomic, and edits are ordered before the start.
  - Patch: `after_slice_1e.patch`. Reports: `subagent_reports/slice1e_workflow/`.
  - Tests: core 597/597, webview 313/313, extension 203/203; the gate and walkthrough tests pass with real Lean, including every cheat script.
- **Fixed after verification (major):** when a card that already had a proof was formalized from a different set of arrows and Claude found no proof, the run could have deleted your existing proof. Now a not-proved finish must leave the target's `.holds` exactly as it was.
- **Chosen by the fixer** (kept): the Claude-suggests check no longer re-judges your own unchanged proof of the target; the final gate still judges it.
- **Process note:** a 1e builder command contained `git rm --cached` (a git index change, which the rules forbid). The safety classifier blocked the whole command, so nothing in it ran. Your git index has 0 staged changes; I checked. The builder rules now forbid `git rm`/`git mv` explicitly.
- **Cleanup:** I removed 60 empty test folders that this session's runner tests left in `/tmp` (`telelean-ws-tests-*`, all from this session), plus one leftover workspace from the runner baseline I stopped at 00:08. None of these came from before this session.

---

## SLICE 1 COMPLETE (2026-11-19 13:47)

### AP-23 · Slice 1 done, verified, and installed
- **Sub-slices 1a–1g are done**, each built, verified by two independent reviewers, fixed, and saved as a patch. The patch for the whole of slice 1 is `bundle_21/evidence/patches/after_slice_1g.patch` (301 files).
- **Final checks on the finished tree:**
  - typecheck clean in all five configurations;
  - unit tests: core 598/598, webview 313/313, extension 203/203;
  - the full runner suite with real Lean: 61 files, 585 passed, 1 skipped (`evidence/runner_full_suite_final_slice1.log`);
  - the full browser suite: 108/108 (`evidence/playwright_final_slice1.log`).
- **Installed:** I rebuilt `packages/extension/dist` and `out` from this tree (AP-8). **Your next VS Code reload runs the new board.**
  - Your old build is in `evidence/extension_build_before_autopilot.tar.gz`.
  - Your doorstuck run, if it is still in review, is converted to the new kinds when VS Code restores it (AP-16).
- **What you get:** see `docs/user-guide.md`, which starts with "What changed in slice 1":
  - the AXIOMS column and the PROPOSITIONS canvas (wheel and pinch zoom about the cursor, right-drag pan, a still right click for the menu);
  - the Vocabulary and Definitions columns above;
  - drawn arrows, "follows from nothing", Move to axioms, Mark pending;
  - the green glow ("✓ established") and bands (✓ only when complete);
  - the Context Menu section, with **Formalize for dependencies** (one target at a time);
  - the board read-only during a run.
- **Also fixed:** `scripts/walkthrough-claude.mjs`, the real-Claude walkthrough driver, had been broken by slice 1; the 1g fixer prepared a patch, and I applied it after reviewing it.
- **Known gaps:**
  - the demo automation scripts (`packages/extension/scripts/demo-driver.mjs`, `demo-ui.mjs`) still click the old tray;
  - the VS Code instance tests type-check, but were not run;
  - no real-Claude run was made (AP-3);
  - several targets per Formalize, the review list, the session Undo, and a live notice when your files change all come with slice 2.

## SLICE 2 (the review list)
- **Plan:** `docs/slice2-plan.md`, written by three designers and a synthesizer.
- **Review:** an adversarial critic found 1 blocker and 14 major problems. A fix-and-recheck loop is running (at most two rounds). The plan's decisions are marked "AUTOPILOT DECISION" in its §7.2; I will copy them here when the plan settles.

### AP-24 · Slice 2's design is simplified on purpose
- **Why:** the slice-2 plan (`docs/slice2-plan.md`) went through two rounds of fixing against an adversarial critic. Each round fixed what it was given, but the critic kept finding about a dozen new major problems in the most intricate mechanisms:
  - revealing each Result separately, with transitive reveals and "twin" non-interference;
  - letting your decisions take effect while a Claude step runs;
  - opening review items between the steps of a several-target queue.
- **Chosen:** coarser rules that are still sound. They are much simpler to build and to check.
  1. **Stage-level reveal (RV-6).** Every Result of a stage stays neutral until every statement and belief item in review has been decided, or until you press Show result, which reveals all of them at once and notes that you saw them early. Before the reveal, the Proposed view shows everything proof-related as in the session's base, while statements come from the proposal. This hides at least as much as the spec requires.
  2. **No decisions while Claude works (RV-3).** While a step runs, the review list is read-only; Cancel step still works. The spec says "at any time"; this narrows it to "at any time Claude is not working".
  3. **A Formalize queue runs to completion before the stage opens (ES-2, RV-9).** Several targets are proved one after another, sources first, each against its own question. The stage, with its items, opens after the last step. Cancel step drops the rest of the queue, which is listed as "not run", with Retry.
- **To reverse:** a later slice can refine the reveal to per Result (the spec's RV-6), and allow decisions during a step (RV-3). The designs for both are in `subagent_reports/slice2_planfix_workflow/` (rounds 1–2), with the problems they still had.

### AP-25 · Slice 2's plan is final; its own decisions live in the plan
- **The plan:** `docs/slice2-plan.md`, about 2,600 lines. It was written by three designers and a synthesizer, went through two rounds of critique and fixes, was simplified (AP-24), and then had one more critique and fix.
  - Reports: `subagent_reports/slice2_design_workflow/`, `slice2_planfix_workflow/` and `slice2_simplify_workflow/`.
- **Its design decisions** are D2-1 to D2-74, in the plan's §7.2. Each is marked "AUTOPILOT DECISION" with its alternative, and the ones withdrawn by AP-24 are marked as such. They are the detailed counterpart of this log for slice 2: read them to reverse anything.
- **Notable ones:**
  - D2-1: Claude proposes arrows with a new `propose_arrow` tool; telelean writes them.
  - D2-61: one reveal per stage, with the base mask.
  - D2-62: the review list is read-only while Claude works.
  - D2-63: a queue runs to its end before the stage opens.
  - D2-65: a mid-stage Formalize waits until the results are shown.
  - D2-67: Apply uses the existing history kind, so one Undo takes back a whole session.
  - D2-69: two remaining minor channels by which a result might be guessed are listed as accepted residuals.
- **Build:** 13 sub-slices, 2a1 → 2a2 → 2b1a → 2b1b → 2b2 → 2c1 → 2c2 → 2b3 → 2d → 2e → 2f → 2g → 2h. Each runs with the same procedure as slice 1: builder, two verifiers, fixer, and a patch saved.
- **Warning for undoing slice 2:** reversing it while a slice-2 session is open strands that session. The older code cannot read run.json version 2. Finish or exit open sessions first.

### AP-26 · Sub-slice 2a1 done (review contracts and item model, part 1), and stray comments
- **Done:** sub-slice 2a1. It is core only, with no visible change yet.
  - **The review contracts:** the types every later sub-slice builds on (`packages/core/src/review/`), with stubs for the functions later sub-slices fill in.
  - **`computeItems`:** decides which review item each change in the session's files belongs to. A change that belongs to no item is "unowned", and an unowned change disables Apply.
  - **Also:** the content keys (whitespace and positions don't count), the closures (what a statement or proof reaches), and a SHA-256 for item ids.
  - Patch: `after_slice_2a1.patch`. Reports: `subagent_reports/slice2a1_workflow/`.
  - Tests (my re-check): typechecks clean in all five configs; core 652/652, webview 313/313, extension 203/203.
- **Fixed after verification (major):**
  - Text outside declarations is now compared line by line and in order, comments included. Before, comments were blanked, so Claude could have changed one of yours unseen.
  - An axiom Claude writes during a proof phase is now unowned, so it can't pass as part of a proof.
  - A derived `id:` line Claude writes back counts only together with a real change to that card.
- **Decision (mine):** a new comment that sits next to no declaration Claude wrote or changed is refused at the step, by the `stray-command` rule (slice-2 plan §4.9). Claude then has to remove it right away, instead of it disabling Apply at the end. A comment directly above or below a new or changed declaration belongs to that declaration's item, and you review it with that item.
  - *To reverse:* delete the §4.9 sub-bullet marked AP-26 before 2b1b is built (afterwards, the matching check in `gate/rules.ts`). A stray comment then shows up only at the end, as an unowned change that disables Apply.
- **Process notes:**
  - Vite briefly wrote and deleted its bundled config in four existing `node_modules/.vite-temp` folders (the three packages' and the repo root's). All are empty again.
  - Your installed telelean extension has a `claude -p` run for **doorstuck** (pid 3695332), started on Nov 17 at about 19:13. It has been idle since 19:18 (5 min 46 s of CPU in 46 hours) and holds about 150 MB. It's yours, so I left it alone; you may want to discard that run.

### AP-27 · Stronger verification for the rest of the build (ultracode on)
- **Why:** at 18:10 the session switched to ultracode, which asks for the most thorough result with token cost no constraint. Until then each sub-slice had one builder, two verifiers and one fixer, and nothing re-checked the fixer's own changes except the unit tests.
- **Now, per sub-slice** (`scratchpad/chain_v2.js`):
  1. **The builder** must also do mutation checks: break each key rule on purpose, show that a test fails, then restore the file byte for byte. It must also test the edge cases (empty, single, many, removal, reload).
  2. **Three verifiers:** fidelity to the plan and spec, code correctness (they re-run the tests themselves), and a new adversarial safety lens. The adversarial verifier hunts for traced ways to:
     - accept something without your Accept;
     - leak a result early;
     - lose your decisions;
     - show a misleading green.
  3. **Up to two fix rounds.** After each, a fresh re-verifier checks every finding against the fixer's exact changes (per-file backups and before/after snapshots), looks for regressions, and re-runs the tests. If blocker or major findings remain after two rounds, the chain stops and I step in.
  4. **The integrator check** now includes the full runner suite with real Lean (about 10 minutes), as well as typechecks and all unit tests. It also checks that nothing is staged, no commit was made, and your installed build is untouched.
- **2a1 and 2a2** get a review-only pass (`2a`) under the new procedure, because 2a2's old-style verification was stopped mid-way to switch. That is safe: its verifiers were read-only. 2a2's state as built is saved as `after_slice_2a2_built.patch`.
- **Cost:** about 1.5 to 2 times the agents per sub-slice. More wall-clock time too, mainly the runner suite and the re-verifications.
- **To reverse:** run `scratchpad/chain_workflow.js` instead (two verifiers, no re-verify, no runner suite).

### AP-28 · Sub-slices 2a1 and 2a2 reviewed again (the first pass under AP-27)
- **Done:** 2a2 (the item model, part 2: statuses and their reducer, reconcile, RV-5 dependencies, RV-7 classes, the reveal rule) was built. A review-only pass under AP-27 then covered 2a1 and 2a2 together:
  - three verifiers;
  - a fixer;
  - a re-verifier, which confirmed 23 findings resolved.
- **What it caught (all fixed and re-verified):**
  - **Reconcile could silently drop a Reject you made**, in one case where Claude proposed the same content again.
  - **RV-11** (a Result whose verdict, "rests on" or dependencies changed goes back to review) covered only accepted Results. It now covers every Result.
  - **Un-reject** brought back only some of the dependents its Reject had taken out.
  - **Undo** could restore an own Accept that has since become a belief item without the individual-Accept check.
  - **Accepting a Result with no recorded verdict** succeeded. It is now refused ("fail closed").
  - **A module that does not build** (no facts) no longer lets its items be accepted, and no longer causes wrong reverts.
  - **Several re-checks had no tests.** Tests were added, each checked by mutation.
- **Decisions (the fixer's; details in the slice-2 plan's §8, "fixer 2a decided"):**
  1. RV-11 applies to every Result in review or accepted. *Alternative:* accepted Results only.
  2. Fail closed: an Accept of a Result with no recorded judgement is refused. *Alternative:* require the data at the call site.
  3. **Undo while results are hidden:**
     - Its answer depends only on items you can see.
     - A hidden item that changed keeps its state silently, so no message ever hints at a hidden result.
     - *Alternative:* a conflict message naming only the action.
  4. Undo re-checks an own Accept against the belief rule (RV-7). *Alternative:* restore it, then send it back to review.
  5. **Items you decided before the results were shown** keep their decision when only telelean (not you) changed them. This departs from RV-6's letter in that narrow case only. *Alternatives:* hide the results again, or record both classifications.
  6. **A known limitation:** a dependent kept out by a second decline is not brought back when only the first decline is undone. Claude redoes it at Submit review. *Alternative:* restore each listed item's content separately.
- **Carried over to 2b1a** (minor, all mandatory there, each with a test): a refusal path at Undo that could still depend on a hidden item (S-V2A-S2); two cases where a premise card was not restored consistently (after an un-reject, and after undoing Show results); untested fixer paths; one contradictory note in the plan; one unused text.
- **Tests:** typechecks clean (5 configs); core 753/753, webview 313/313, extension 203/203. **The full runner suite with real Lean passed:** 585, plus 1 skipped by design (the opt-in real-Claude test).
- **Patches:** `after_slice_2a2_built.patch` (2a2 as built) and `after_slice_2a.patch` (after the review). **Reports:** `subagent_reports/slice2a2_build_workflow/` (2a2's builder), plus the chain's reports once it ends.

### AP-29 · Spec coverage audit: gaps routed, unlogged departures decided
- **What:** a read-only audit (4 mappers, an adversarial gap checker, a report writer) traced all 873 distinct requirements of spec v4.1:
  - 317 built;
  - 240 planned in slice 2 and 165 in slice 3;
  - 73 left to slice 4 and 15 to slice 5;
  - 46 narrowed by logged decisions;
  - 17 flagged as unassigned or contradicted, of which the checker confirmed 15 as real gaps (13 issues).

  Report: `subagent_reports/spec_coverage_audit/coverage_audit.md`. Its section 4 lists every narrowing decision in one table, which is the best single place to review what you get instead of the spec's letter.
- **Gaps routed into slice 2** (plan amended; briefs updated before those sub-slices start):
  - **G2: a cycle you drew anywhere in the subject now blocks Formalize,** naming the cycle (AR-3, §14 item 9). Until now only cycles through the question's own cards did. This goes in 2b2.
  - **G1: Apply records where Claude's arrows came from.** Each accepted Claude arrow and Add premise is listed with its step on the attempt record, and History shows them under "Arrows from Claude" (§14 item 2). The run folder that held this before is pruned. This goes in 2f.
  - **A new small sub-slice, 2i,** at the end of slice 2:
    - **the card-only Delete is removed.** "Delete card only, keep Lean" left the card's `.holds` behind as an axiom no card shows, a hidden belief (S9, ES-9). "Delete anyway" stays.
    - an old axiom's declared premises are named in its chip (A19);
    - the guide's placement text is corrected.
- **Gaps routed into the slice-3 plan** (after its review): G3, G4's half and G6–G8, plus the smaller notes:
  - the freeze actions on mixed selections;
  - "your edit makes it yours" (CF-6, G5);
  - naming the frozen arrows that Move to axioms removes;
  - the band's definitions chip, and widening its source;
  - telelean's menu over the Vocabulary/Definitions band;
  - one-version kinds at FZ-10;
  - A25's report;
  - a deleted card's id coming back for a new card and inheriting its freeze (RF-2 (b)).
- **Decisions on departures the slice-1 builders made without logging them** (each kept, with a reason):
  - **G9: a card added from the A|P box, or with "New proposition here", stores its position with the add,** in the same Undo step. The spec contradicts itself here: BD-8 and CM-7 place new cards where you asked, and that cannot survive a reopen unless it is stored. Opening a board still writes nothing. This corrects AP-19's wording ("stored only when you move a card"). *To reverse:* drop `position` from add-node.
  - **G10: an axiom that becomes a proposition is placed by the normal layered rule** (one layer right of its sources), not "next to its new source" (AR-6, the spec's own elaboration of your "transferred to the canvas"). *Alternative:* send a position beside the source with the arrow, stored as in G9.
  - **G11: an old (pre-v4) axiom's declared premises stay undrawn,** and 2i names them in the chip, so you see them before choosing. *Alternative:* draw them dashed and unselectable, as A19 says.
  - **G12: an action on a mixed selection applies to the part it fits, and says so in its label or tooltip.** Delete already works this way (AR-1), and Formalize ignores selected cards. The literal CM-3 rule (disable the action when anything selected does not fit) would disable Formalize whenever a selection rectangle also takes cards. Slice 3's freeze actions follow the same rule: they name what they leave out and why, so nothing is believed frozen that is not.
  - **G13: the signature excludes your own subject-module axioms of kind "other"** (such as `axiom weird : Empty`), so a Claude proof that uses one is refused. This is stricter than §14 item 2, and fails closed: such an axiom proves anything. *To reverse:* add `other` to SIGNATURE_KINDS for subject modules.
  - **Smaller ones, kept as built:**
    - the empty board's Context Menu shows the first-step hint instead of "Select some items…" (CM-1 c);
    - the band's ✓ is stricter than BD-7 asks (fails safe);
    - a press that ever moved 4 px stays a drag (CM-7);
    - in the Proposed view, a changed card that grows may touch the next card (BD-3).

### AP-30 · The value probe is isolated from your model (a soundness fix that reaches back to slice 1)
- **What was found:** the slice-3 plan's ultra review (5 single-lens critics with adversarial refuters) found the following. The "value probe" reads, from Lean's elaborated terms, which constants each declaration really uses (slice 1d's `valueConsts`; slice 2 adds `typeConsts`). It runs as an `#eval` inside a check file that imports your model.
  - Its own code (printing, string concatenation, loops) is therefore compiled with the model's instances in scope.
  - A deliberately planted instance, such as a high-priority `ToString String`, could make it print forged constant lists. Those lists drive the bands and B.2 (no hidden arrows), slice 2's RV-5 dependencies and step limits, and slice 3's meaning comparison.
  - A refuter confirmed the mechanism. It needs deliberate sabotage of a probe Claude never sees, and it existed since slice 1d.
- **Decided (D2-75 in the slice-2 plan; moved there from the slice-3 plan's D3-52):** the probe runs as its own Lean job. Its file imports only `Lean.CoreM` and `Lean.Util.FoldConsts`, and loads the model's compiled modules as data (`importModules`, with extensions not loaded). Its code is never compiled next to the model, so nothing in the model can change it. Details:
  - **Sub-slices:** 2b3 is split. **2b3a** builds the isolated probe, measures its cost and regenerates the test recordings. **2b3b** builds the engine as planned. The core half (a failed probe, recorded and reported) goes in 2b2.
  - **Fails closed:** a state whose probe failed because of the state itself is never counted as passing. Steps get an "environment" outcome naming the cause, stages are partial with Accepts waiting, and the final check and the backstop refuse it.
  - **No Claude code runs at import:** G0 now also refuses Lean's `init` attribute, which runs code whenever a module is imported. It compares attribute names the way Lean reads them, and refuses any hand-written "hygienic" name (one containing `«_@»` or ending in `_hyg`). That spelling could otherwise sneak `init`, `macro`, `implemented_by` or `csimp` past G0. G0 runs before any Lean job at every step, so a refused state is never even built.
  - **Decided in advance:** if `importModules` cannot load the model on the pinned toolchain, 2b3a uses the fallback of reading the constants from `lake env leanexport`'s kernel export, rather than stopping.
- **Stated residuals:**
  1. The ghost check (a draft premise's scratch check) keeps its in-file probe, because its theorem is in no built module. Forged output there can only affect a draft before it is written: everything that counts is judged again with the isolated probe.
  2. The guarantee assumes your own files import nothing of Lean's beyond `Init`. If you `import Lean` yourself, your model gains Lean's elaborator hooks. G0 judges only Claude's lines, by design.
     *To close it:* the start check could refuse a base that imports modules outside the project.
- **To reverse:** follow D2-75's reversal in the slice-2 plan, which puts the `#eval` back into the check file and drops the probe job. The G0 rules are independent: remove them from `gate/g0.ts`.
- **Review cost:**
  - the slice-3 ultra review (14 agents);
  - the amendment workflow (7 agents: two amenders, a check, two fix and recheck rounds);
  - one last plan fix by me, for the hygienic-name bypass that the final recheck found (AP30-1 r3). That one goes into 2b2's verification, or 2c1 as a carry-over.

### AP-31 · Slices 4 and 5 are simplified on purpose (the AP-24 of the transform window and references)
- **Why:** both plans went through an ultra review: 5 single-lens critics with adversarial refuters, then two fix and recheck rounds.
  - **Slice 4's first pass found 3 blockers and 49 majors.** After 105 fixes, the recheck found new blockers that the fixes themselves introduced, and 5 majors stayed open.
  - **Slice 5 kept 2 majors open.**
  - **Where the trouble sat:** tracking your typed lines one by one inside cards Claude also edits; carrying out your typing inside Claude's steps; revaluing freezes; follow-on edits; and slice 5's automatic "detach" of references.
  - **How I chose:** a judge panel of three independent simplification proposals (refuse first, your intent first, reuse slices 2 and 3), scored by a judge (`subagent_reports/slices45_simplify_workflow/`), recommended one combined set. I adopted it.
- **Chosen (R1–R8):**
  1. **What you type is carried out at once.** In a review stage, Submit transform writes your typed part into the session as one decision, checks it with a build, and takes it back whole if it fails. Only Claude's part, for the fields you left open, waits for Submit review.
  2. **No line-by-line ownership.** Your edits belong to the card's ordinary review item, marked "you typed it" (telelean's own ledger proves it). There is one Accept per card, and group Accept takes them all.
  3. **Typing makes an ordinary freeze** ("frozen: you typed it"). Other freeze reasons on that field are replaced, never revalued. Before you change content that a frozen card relies on (its Lean, or a # reference), that card must be unfrozen, deleted too, or edited in the same window.
  4. **Typed Lean may use only names that exist** (in your files, the session's visible content, or the same window). There is no "Claude must define": declare the word in the window, or leave the statement to Claude.
  5. **Clearing a field means "Claude rewrites this"**, so the old value stays if Claude finds nothing better. Choose "kept empty" to remove it. Lean docstring mirrors are not rewritten inside a session.
  6. **References are never rewritten by telelean.** A deleted target reads "deleted card". Nothing another subject relies on changes in a session.
  7. **A suggested premise is edited in place, at once**, and Claude never overwrites your edit.
  8. **A queued transform holds only Claude's part.** You can drop it, but not reopen it. Claude's fills from a transform are reworked by an ordinary queued transform.
- **What you lose:**
  - your typed part stays applied (in review) even if Claude's part fails;
  - a short wait at Submit transform, for one build;
  - clearing does not guarantee empty;
  - one Accept or Reject covers a whole card you and Claude both changed;
  - a dependent edit needs two transforms;
  - docstrings can be stale until your next board edit after a session;
  - no automatic rewording of references to a deleted card;
  - in a session, you cannot change vocabulary that another subject's sentences refer to;
  - you cannot edit a queued transform; drop it and open a new one.
- **To reverse:** the pre-simplification plans are kept as `scratchpad/plans/slice4-plan.after_ultra.md` and `slice5-plan.after_ultra.md`, also copied into `subagent_reports/slice4_ultra_review_workflow/` and `slice5_ultra_review_workflow/`. They contain the full designs (typed units, follow-on freezes, detach), with the problems still open in them.

### AP-32 · Sub-slices 2b1a, 2b1b, 2b2, 2c1 and 2c2 done (slice 2's core engine)
- **Done, each under AP-27's procedure** (builder with mutation checks, three verifiers, up to two fix and re-verify rounds, then the full integrator check):
  - **2b1a:** judging, part 1 (a refactor only). The rule helpers came out of `evaluate()`, and every old gate suite is unchanged. It also did 2a's six carry-overs.
  - **2b1b:** judging, part 2:
    - step limits;
    - B.1–B.4 per inference;
    - `judgeState` over every inference, with the new tokens;
    - `proposeArrowProblems`;
    - the stray-comment rule (AP-26).
  - **2b2:** the backstop, plus:
    - taking content out (`planItemRevert`, with the new `replace-decl` edit);
    - several targets;
    - Submit's plan;
    - the start checks, including AP-29's "any hand-drawn cycle blocks Formalize";
    - `holdAs`;
    - the core half of the failed probe (AP-30);
    - G0's `init` and hygienic-name rules (AP-30 r3).
  - **2c1:** the base mask, the build's mask option and endorsements, `endorsementHash`, and the session protocol messages.
  - **2c2:** the session view (`buildSessionView`), and the host's "not built yet" answers.
- **Caught by review and fixed (examples):**
  - Undo or Redo could still name, or depend on, a hidden Result. Answers now depend only on listed items.
  - Mixed decide requests could leave the working copy inconsistent after an un-reject. They are now settled after the whole request.
  - A comment Claude placed next to a declaration it may not change could slip through.
  - A moved `.holds` could not be put back.
  - While a step ran, the view could show Claude's words, or the question it asked, from the running queue.
  - A taken-out Result could still show Claude's "proved" summary.
- **Decisions you might notice** (all with alternatives in the plan's §8, under each builder's and fixer's entry):
  - **When proofs are judged:** your own unchanged proof is not re-judged at a stage, since the backstop restates B.2 at Apply. A re-ask that finishes not proved, keeping its old proof, is not refused.
  - **Fails closed rather than guessing:**
    - taking content out refuses moved declarations, changed anonymous instances, and cards the state lacks;
    - a stage with no judgement yet treats every class as unknown;
    - a hidden Result's row shows nothing but "show them first";
    - Undo and Redo are unavailable while the top action decided an item that is now hidden.
  - **Start checks** also refuse a target asked twice, an empty request, and a Formalize on another subject's board during a session.
  - **Every queue's end ends every "Show results" force**, so a later reveal is always a fresh decision.
- **Accepted residuals** (listed in the plan's §4.7, alongside D2-69's):
  - whether a hidden judgement's probe failed (1 bit);
  - two comment-attachment cases, where a comment travels with a lemma written later;
  - after an unfrozen not-proved finish, a definition that no card statement uses stays hidden.

  None lets anything be accepted unseen. They only affect what can be inferred early, or which item a comment is reviewed with.
- **A known edge left as is (fails closed):** after one request un-rejects V and declines W, a later un-reject of W can take V's content out. The next judge reports it, and Apply stays disabled until an Undo. No client sends such mixed requests.
- **Tests (2c2's integrator check):** typechecks clean in all 5 configs; core 1127/1127 (598 at the end of slice 1), webview 314, extension 205. The full runner suite with real Lean passed after every sub-slice: 585, plus 1 skipped by design.
- **Patches:** `after_slice_2b1a.patch`, `2b1b`, `2b2`, `2c1`, `2c2`. **Reports:** `subagent_reports/slice2_chain_v2_workflow/` (47 agents; briefs included). The remaining slice 2 runs as chain v3 (2b3a, 2b3b, 2d, 2e, 2f, 2g, 2h, 2i), with each sub-slice's leftover minor findings carried into the next automatically.

### AP-33 · The isolated probe's cost is accepted (2b3a)
- **Measured** by builder 2b3a on the Spyro fixture (median of 3):

  | Job | Peak memory | Time |
  |---|---|---|
  | The old in-file probe (1d) | 567 MB | 0.31 s |
  | The isolated probe job | 954 MB | 0.61 s |

  That is 1.68×, over the plan's 1.5× line. The extra memory is Lean's own library data (`Init`'s private olean alone is 258 MB).
- **Verified with real Lean:**
  - `importModules` works on the pinned toolchain, so no fallback was needed;
  - planted `ToString String` and `ForIn` instances forge the old probe but not the isolated one;
  - `@[init]`, including the hygienic spelling, runs in the check job but never in the probe job, and G0 refuses both in Claude's text;
  - the constants equal 1d's, name for name.
- **Decided:** accept the cost. It buys a probe the model cannot forge (AP-30), and it stays under 1 GB and 1 s.
  - The refresh's memory cap is 4 GB by default. It is lowered to what is free minus a reserve, so on a tight machine (about 2 GB free) it drops to about 1 GB.
  - A probe that runs out of memory then fails closed: that state is never counted as passing, and a Formalize step reports that telelean could not read the Lean. It retries fine once memory frees up.
- **Alternative, if memory becomes a problem:** read only the model's own modules with `Lean.readModuleData` (measured 560 MB / 0.27 s, about the old cost). It must then also load the private part of model files written in Lean's module system, or refuse such models. The builder's report has the details.

### AP-34 · YOUR DECISION (2026-11-20 14:22): middle-ground verification, and a pause after slice 2
- **Asked because** quota became your concern. So far this turn's subagents had used about 72M tokens (174 agents). About 40 sub-slices remained, roughly 130M tokens at AP-27's procedure.
- **Your answers:**
  1. **Middle-ground verification:** about 2.3M tokens per sub-slice instead of about 3.2M (`scratchpad/chain_v4.js`):
     - one verifier for plan fidelity and code correctness together, plus the adversarial verifier;
     - a fix is re-verified only when it fixed a blocker or a major;
     - minor findings the fixer leaves go on as carry-overs;
     - the real-Lean suite stays in every integrator check (it costs almost no quota, since it is a script).
  2. **Pause after slice 2:** finish slice 2, rebuild your installed extension, then stop and report. No further plan reviews for slices 3–5 meanwhile.
- **Switch-over:** 2b3a (already under AP-27's procedure) finishes as it is. From 2b3b on, chain v4 is used. The hand-over is gated: the old chain's 2b3b builder waits without reading or editing anything, then it is stopped.
- **One plan job was already running:** the last fix and recheck round on the slice-4/5 plans. It is allowed to finish, since its last agent is a read-only recheck, and nothing new is started for slices 3–5.

### AP-35 · A verification gap found and closed: real-Lean tests that skip themselves when memory is low
- **Found:** 2b3b's integrator check reported the runner suite as passing: 647 passed, but **11 skipped**, where 1 is expected (the opt-in real-Claude test).
  - Several real-Lean integration tests skip themselves when less than 12 GB of memory is free (`waitForMemory` in the runner's test helpers, a rule from an earlier slice). During that check, free memory hovered around 11.3–12 GB.
  - So 10 tests silently did not run, and the integrator counted the run as passing.
  - The earlier sub-slices were not affected: each showed exactly 1 skip.
- **Closed:**
  1. **Re-run.** I re-ran the 8 affected test files with real Lean while 21.9 GB was free: 61/61 passed, with no skips (`evidence/runner_rerun_2b3b_memory_skips.log`). 2b3b is fully verified.
  2. **The full check now counts skips** (`scratchpad/recheck_full.sh`, used by every later integrator). With more than 1 skip, it waits for at least 13 GB free (up to 30 minutes) and re-runs the suite once. If tests still skip, it records a failure (`rc=98`), so the chain stops instead of passing unverified work.
- **Not changed:** the tests' own 12 GB rule, which protects your machine. Lowering it would be a code change to the project's tests.

### AP-36 · YOUR INSTRUCTION (2026-11-20 ~19:25 SGT): use the remaining quota fully
- **Your words:** "continue until the quota is completely used up in order to maximize efficiency". The quota was at 96% and resets on 21 Nov at 9 pm SGT.
- **How I apply it:**
  - The chain keeps building slice 2 with AP-34's middle-ground verification, until it finishes or the limit stops it.
  - I keep one stream of work, not parallel streams: parallel streams would split the same quota and leave more half-finished sub-slices when the limit hits.
  - I keep my own wake-ups to a minimum.
- **This changes AP-34's "pause after slice 2":** if slice 2 finishes while quota remains, I go on to slice 3. First comes its pre-build refresh against slice 2's final code (`resume_kit/plans/slice3_pending_items.md`), then the build, sub-slice by sub-slice.
- **To reverse:** say "pause after slice 2", and AP-34 applies again.
- **Resuming after the limit:** `RESUME.md`.

### AP-37 · 2d done; the skip check now expects the plan's planned skips
- **2d** (sessions, queues and steps) passed its full integrator check:
  - typechecks clean in all 5 configs;
  - unit tests: core 1133, webview 314, extension 213;
  - the real-Lean runner suite: 702 passed.
- **The integrator still refused to save 2d's patch.** AP-35's skip check expected exactly 1 skipped runner test, and found 30:
  - 1 is the opt-in real-Claude test;
  - 29 are the plan's static placeholders, `it.skip('moves to 2e/2f/2h: …')`. These are tests that the slice-2 plan moves to a later sub-slice, and each is listed in its builder's report.
- **Memory was not the cause:** about 21 GB was free throughout.
- **Fixed:** the check now expects 1 skip plus the number of `moves to` placeholders in the runner's tests, and still catches memory-induced skips. I saved 2d's patch myself after reading the integrator's full summary (`after_slice_2d.patch`), and restarted the chain at 2e with 2d's leftovers (4 minor, 1 nit) carried in.

### AP-38 · YOUR DECISION (2026-11-21 21:29 SGT): a demo this week; slice 2 only, then stop; all four quota optimizations
- **Your goal:** a demo by the end of this week. The weekly quota, not time, is the limit.
- **Your choices:**
  - **Scope:** slice 2 only, then stop. This replaces AP-36. The rest of the quota is kept for the demo, whose rehearsals use telelean's real-Claude runs, and for your other work.
  - **All four optimizations:**
    1. **A fresh session** runs the rest. This conversation's huge context made every orchestration turn expensive.
    2. **Cheaper models for the checking roles:** builders stay on Opus; verifiers, fixers and re-verifiers move to Sonnet; the integrator moves to Haiku.
    3. **Plan extracts:** each agent reads only its sub-slice's parts of the 3,700-line plan, 270 to 2,200 lines (`plan_extract.py`).
    4. **Lighter checks for the UI sub-slices** 2g, 2h and 2i: one verifier. The real-Lean suite and the browser tests still run.
- **Done in this session:**
  - **The chain was stopped** about 10 minutes into 2e's second run, so 2e is not paid for under the old settings. Its partial work stays in the tree (`wip_2e_interrupted2.full.diff`), and 2e's brief tells the next builder to continue from it.
  - **`chain_v5.js`** is written, syntax-checked and copied to `resume_kit/scripts/`.
  - **The extracts** are generated and copied to `resume_kit/extracts/`.
  - **`RESUME.md`** is rewritten with these instructions at the top, as you asked: scope, small context, few wake-ups, models, extracts, light UI checks, quota report.
- **To reverse:** run `chain_v4.js` (AP-34's middle ground) instead, or ask for slice 3.

### AP-39 · A new machine (2026-11-21 ~23:20 SGT, session c398a83b): the build continues here unchanged
- **What changed:** you moved the repository to this machine (64 GB, uid 1002) and committed the tree as `1473ca0` ("halfway through slice 2").
  - **Checked:** `1473ca0` holds exactly the saved 2e partial work. All 403 files match, and the new snapshot script reproduces `wip_2e_interrupted2.full.diff` byte for byte.
  - **From now on**, HEAD stays `1473ca0` with nothing staged. You commit.
- **Adaptations.** The plan and the procedure (AP-38) are unchanged.
  - **The scratch kit** moved to this session's scratchpad, `/tmp/claude-1002/-home-zhengyew-telelean/c398a83b-…/scratchpad`. I did not recreate `/tmp/claude-1000`: on this machine it would belong to another user account. 51 kit files had the old paths rewritten.
  - **The patches stay cumulative against `187673d`**, in the old layout (`snapdiff_core.sh`), so each new patch still compares directly with the earlier ones. A HEAD-based diff would have hidden 2e's partial work from 2e's own verifiers.
  - **The integrator's safety checks:**
    - HEAD is `1473ca0`.
    - `dist` and `out` are now tracked in git, and they are your installed extension on this machine, so `git status --porcelain` on them must print nothing.
    - Their checkout timestamps are unchanged.
  - **`builder_rules.md`:** this machine's RAM (caps and waits unchanged) and a note on the git state. A read-only copy of the tree as 2d left it is in `<S>/tree_2d/`.
- **Installed `node_modules`:** this copy of the repository had none.
  - `npm ci --offline` installed 310 packages (174 MB) from your local npm cache only, with no network. The lockfile is unchanged (hash checked), and npm's logs were kept in the scratchpad.
  - npm 11 skipped esbuild's postinstall, which only checks the binary. esbuild works.
  - **To undo:** `rm -rf node_modules`. It is git-ignored.
- **A preflight with no quota spent:** the integrator's full check, run on the tree as committed.
  - Typechecks and unit tests pass: core 1,133, webview 314, extension 213.
  - The real-Lean runner suite: 715 passed, 30 skipped as expected.
  - The only failures, 2 type errors and 2 tests, are in 2e's unfinished files.
- **To reverse:** delete `node_modules`. The kit in `bundle_21/resume_kit/` is untouched; the adapted copy is in `bundle_22/resume_kit/`.

### AP-40 · 2e, 2f and 2g done; 2h's full check hit an old time cap (2026-11-22)
- **Done in chain v5** (run `wf_bee8fde1-76d`, 19 agents, ≈ 4.66 M subagent tokens, 13 h):
  - **2e:** the reviewers found 2 major and 11 minor issues. All 13 were resolved, which the re-verifier confirmed.
  - **2f:** 8 minor or nit findings, fixed in one round.
  - **2g:** 9 minor or nit findings, fixed in one round.
  - Each passed its full check: typechecks, unit tests and the real-Lean runner suite (2g: 880 passed, 2 planned skips).
- **2h:** built, then reviewed (4 minor or nit findings, all fixed). But its full check stopped. The real-Lean runner suite was killed by the check script's cap of 40 minutes (`timeout 2400`) before it printed a result.
  - **Why:** the cap was set on the old machine, when the whole check took about 12 minutes. On this machine the runner suite took 1,807 s (preflight), 1,630 s (2e), 2,362 s (2f) and 2,385 s (2g), so 2g passed with 15 s to spare. 2h's new tests pushed it over. It was not a hang: the CPU was mostly idle, and the suite is serial by design (one worker, `LEAN_NUM_THREADS=2`, under the memory cap).
  - **Decision:** raise the cap to 90 minutes (`timeout 5400`), and the integrator's wait to 150 minutes. Nothing is weakened: every test must still run and pass, and the skip count check is unchanged.
  - **Alternative not taken:** run the suite with two workers. It would be faster, but it breaks the one-heavy-job rule and comes closer to the memory cap.
- **2h re-checked by me:** this is a script, so it cost no quota. It ran on the unchanged tree, which I checked with snapshots before and after.
  - Everything passed: core 1,137; webview 431; extension 215; runner 883 passed with 1 planned skip, in 2,422 s.
  - The safety checks passed too: nothing staged, HEAD `1473ca0`, `dist`/`out` untouched.
  - `after_slice_2h.patch` is saved.
- **Next:** chain v5 for 2i alone. 2h left no open findings, so 2i starts with no carry-overs.

### AP-41 · Sub-slices 2b3a, 2b3b and 2d done (the runner side: the isolated probe, the judging engine, and sessions with steps)
- **Done.** 2b3a ran under AP-27's procedure (three verifiers). 2b3b and 2d ran under AP-34's middle ground (two verifiers each; a fix round is re-verified only when it fixed a blocker or a major):
  - **2b3a:** the isolated probe.
    - A separate Lean job now reads what each declaration uses. With real Lean, forged instances in a model fool the old in-file probe but not this one.
    - It fails closed. A cut, failed or killed probe gives a problem that names the cause, and a base whose probe failed refuses the start before Claude is contacted.
    - It also fixed the five carry-overs from 2c2's review.
  - **2b3b:** the runner's judging engine.
    - Judge, final check, writing an accepted premise, and completing the target from it.
    - It re-checks a drafted premise only when something it relies on has changed.
    - A check that Lean cannot run is left out and tried again at the next judge. It is never counted as a pass.
  - **2d:** sessions, queues and steps.
    - Each step is one round with fresh limits. Cancel step takes the step back, and Retry step runs it again.
    - A Formalize can start in the middle of a stage.
    - An older (v1) run is recovered as an edit session with every item in review.
    - A session that never started ends as failed, with M2's "the editor reloaded" text.
- **Caught by review and fixed (examples):** first-round findings were 2b3a 0 major (4 minor, 8 nit), 2b3b 6 major (5 minor, 1 nit), 2d 5 major (11 minor, 2 nit).
  - A premise re-check was remembered when it ran, not when its result was kept. If a decision made the judge run again, the premise silently dropped out of the list. Now it is remembered with its outcome.
  - Completing a target was refused after a crash replay, or after a decision changed an unrelated file. It now starts from the newest commit that holds the written premise.
  - A mid-stage Formalize of a target whose earlier step was cancelled kept the old question, so the gate judged the proof against the wrong one. The new question now replaces it.
  - When the review list could not be built, the old list was reused. That showed Claude's activity while results were meant to be hidden. It now fails closed, shows one telelean notice and refuses a mid-stage Formalize.
  - "Claude's step proposed nothing" could never show, because every passed step ends on a new commit. It is now decided from the step's content.
- **Decisions you might notice** (full list with alternatives: the plan's §8 under each builder's and fixer's entry, `docs/slice2-plan.md`):
  - **Probe cost: accepted (AP-33).** The isolated probe needs more memory than the old in-file one (954 MB against 567 MB at its peak), over the plan's 1.5× line, because it loads Lean's own library data. Kept as the plan specifies. Alternative: read only the model's own modules, at about the old cost, but module-system files need extra handling.
  - **A probe that runs out of memory** is an environment problem, not a budget finding against Claude. Alternative: count it as a budget finding.
  - **One round per step,** with fresh limits. Alternative: one round for the whole session.
  - **Cancel step** closes Claude's process and takes the step back to its start. Retry resumes the conversation. Alternative: keep the process alive between steps.
  - **"No finish twice" counts as a give-up.** It goes back to the newest passing commit, keeping drafts and arrows still drawn. Alternative: treat it as a failure, back to the start.
  - **A re-ask that ends without a proof** takes back only its Result and arrows. Alternative: take back the whole step.
  - **Until 2f, Exit discards the session,** labelled "Session ended". Alternative: refuse Discard in a session.
  - **Old v1 runs become edit sessions.** Alternative: end such runs.
- **Tests (each sub-slice's integrator check):** typechecks clean in all 5 configs; all unit suites and the real-Lean runner suite passed.
- **Reports:** `bundle_21/subagent_reports/slice2_chain_v3_workflow/` (2b3a) and `bundle_21/subagent_reports/slice2_chain_v4_part1_workflow/` (2b3b, 2d). Patches: `bundle_21/evidence/patches/after_slice_2b3a.patch`, `after_slice_2b3b.patch` and `after_slice_2d.patch`.

### AP-42 · Sub-slices 2e, 2f, 2g, 2h and 2i done (the host and board side: review actions, the end of a session, the review panel and Proposed view, and a cleanup)
- **Done, each under AP-38's procedure** (2e and 2f had two verifiers, 2g, 2h and 2i one each; minor-only fix rounds were not re-verified, AP-34):
  - **2e:** the review actions.
    - Accept, every decline, back to review, un-reject, Show results, Undo and Redo, Submit review, and the raw Lean diff.
    - A decision cut off by a crash is made again, or dropped if the rules now refuse it.
    - Submit sends Claude a fixed feedback turn: accepted, rejected, shaky (with notes), to be redone, steps planned.
  - **2f:** Add premise items and the end of a session.
    - An accepted premise is written to the model, and the target is completed from it. A failed completion is taken back.
    - The confirmation, the final check, Apply, Exit, a watcher for files changed by hand, and the endorsement and layout files.
    - History now records which arrows Claude proposed.
  - **2g:** the review panel and the session bar.
    - The review list, group Accept and Decline, the decline menu with the Shaky note, the item details, the stage report, the end confirmation and the Exit dialog.
    - Claude's sentences are marked as Claude's.
  - **2h:** the board in a session.
    - The Proposed view, Formalize with several targets, and two Undo stacks (session and board).
    - The old Accept, Discard and ghost messages are gone. The user guide is rewritten for sessions.
  - **2i:** cleanup.
    - The card-only Delete is removed.
    - An old axiom's declared premises are now named in the chip tooltip, the details row and the TL122 problem.
- **Caught by review and fixed (examples):** first-round findings were 2e 2 major (11 minor), 2f 0 major (5 minor, 3 nit), 2g 0 major (5 minor, 4 nit), 2h 0 major (3 minor, 1 nit), 2i 0 major (3 minor, 1 nit).
  - When a decision's judge threw, the old judgement stayed in force. Accept, Submit and the diff then ran on another state's classes. It is now cleared, and review actions answer "no judgement".
  - A "did not pass" heading after a decision was never lifted. One brief Lean failure left no Accept for the rest of the session. A later passing judge now lifts it.
  - Exit during a premise write was read as an ordinary failure, so the write recorded a problem and took itself back on a session that was closing. The write now stops when the run is no longer live.
  - A short sentence by Claude could mark matching words inside your own text. A phrase now marks only a whole piece of text.
  - The board-lock text still said "until you accept or discard it", after those buttons were retired. It now says "apply or exit".
  - Deleting a card whose statement declaration was missing left its `.holds` axiom behind as an unmarked axiom. Delete now finds the `.holds` on its own.
- **Core defect found by 2e, your decision:** core's review reducer treats an item with no class in the stage judgement as if it had every badge.
  - After a Reject the item's content is out of the working copy, so it has no class. An Undo that would restore its Accept is then always refused with RV-7's text.
  - This affects the Undo of a Reject of an accepted item, the Undo of a Reject that took an accepted dependent out, and the Undo of a decline of an accepted arrow.
  - **Workaround, in the runner:** `reviewState` in `packages/runner/src/run/review.ts` gives such an item the badges its Accept recorded, for Undo only. The next judge classifies it again.
  - **Proper fix, in core:** treat "no class while its content is out" as those recorded badges. The workaround could then go. Alternatives: fix core inside 2e (its scope forbids it), or leave these Undos refused.
- **Decisions you might notice** (full list with alternatives: the plan's §8 under each builder's and fixer's entry, `docs/slice2-plan.md`):
  - **Decision headings:** "did not pass" after a decision is lifted by a later passing judge. Alternative: keep it until a later step passes.
  - **Reload during Apply:** files equal the proposed state, so it finishes as applied. Files equal the base, so back to the confirmation. Anything else gives a notice and back to the confirmation. Alternative: apply again.
  - **Moves:** only the subject's propositions may move. Exit drops them. Alternative: let axioms move too.
  - **A failed completion** is taken back and marked, and never retried by itself. Alternative: a stage problem carrying Lean's message.
  - **The Shaky note** is offered for every Shaky decline, including a Result's. Alternative: none on a Result's.
  - **Lock text:** "…until you apply or exit it." (2h first kept slice 1's words; its fixer changed them).
  - **Delete always removes the card's Lean.** The "keep Lean" choice is gone, and a `keepLean: true` request is refused. Alternative: keep the choice.
  - **VS Code suites:** 7 old end-to-end scenarios of the retired review are skipped, with their bodies kept for a rewrite, and 2h converted `runs.test.ts` without running it. Alternative: delete them or rewrite them blind. (I ran these suites after the rebuild: AP-43.)
- **Left as is (2i, minor [F-F2]):** for an old axiom's declared premises, the chip tooltip and the details row name a card from another subject by its id, while the TL122 text names it by its sentence. The webview holds only the current board. Documented in the plan's §8.
- **Tests (after 2i):** typechecks clean in all 5 configs; core 1142, webview 435, extension 216, runner 883 passed with 1 expected skip (the opt-in real-Claude test). 2h's first full check "failed" only on the runner's old 40-minute cap, raised to 90 minutes (AP-40).
- **Reports:** `bundle_22/subagent_reports/slice2_chain_v5_2e-2h_workflow/` and `bundle_22/subagent_reports/slice2_chain_v5_2i_workflow/`. Patches: `bundle_21/evidence/patches/after_slice_2e.patch` to `after_slice_2i.patch`.

### AP-43 · Slice 2 finished: the final checks, two VS Code test fixes, and your extension rebuilt (2026-11-22)
- **2i passed its full check** (run `wf_2f71cf32-72e`, 4 agents, ≈ 0.69 M subagent tokens):
  - typechecks clean in all 5 configs;
  - core 1,142; webview 435; extension 216;
  - runner 883 passed, with 1 planned skip.
  - `after_slice_2i.patch` is saved. Its one leftover (F-F2) is in AP-42.
- **Playwright, all 21 specs one at a time** against a scratch build: 118 tests passed, none failed or skipped. No new Chrome crash dumps.
- **Your extension is rebuilt (AP-8)** with `vite build` and `node scripts/build.mjs`. `packages/extension/dist` and `out` are git-tracked and now show 17 modified files. HEAD is still `1473ca0`, with nothing staged.
- **The VS Code suites ran for the first time since M2.**
  - **Why:** the slice-2 plan's final checks include them "if RAM allows" (§6.3). 1g and 2h had converted them but only type-checked them.
  - **How:** this machine has no copy of the 1.140.0 test build, and downloading one is not allowed. So they ran in your snap VS Code (1.145.2) through the project's own snap mode (`scripts/smoke.mjs --snap`), with a throwaway profile in the scratch dir.
  - **Isolation:** every check passed. `~/.config/Code`, `~/snap/code`, `~/.copilot`, `~/.vscode` and the Chrome folders were unchanged, and no process was left.
  - **First run:** 51 passed, 8 skipped, 2 failed. The 8 skips are 2h's: the old Accept test and 7 old review scenarios.
  - **Both failures were test problems, not product bugs.** Run `wf_46e69f5f-f31` (3 agents, ≈ 0.27 M subagent tokens) gave each failure one Sonnet fixer. The fix that touched source got a Sonnet check too (verdict ok).
    - **AT5.9 (a run still working when the window goes is kept as interrupted):** a race in the test. A late delivery report from the closed board set the test's copy of the run back to "working". The saved run file shows the product wrote "interrupted", as it should.
      - **Fix:** every board post event now names its panel (a small addition to the extension's test interface), and the test ignores the closed board's events. AT5.8 had the same hidden flaw and gets the same fix.
      - **Alternative:** a fixed wait. Rejected as timing-based.
    - **A drag inside a card's Lean code selects text:** the test ended its drag in the code box's bottom padding. In VS Code's webview that point fell just past the code, so the selection picked up line breaks. The code view is unchanged since M2.
      - **Fix (test only):** the drag now ends on the last line's text. The check ignores line breaks at the start and end of the selection; any other stray text still fails.
      - **Alternative:** change the product's CSS. Rejected, since nothing visible is wrong.
  - **Second run, after a rebuild with both fixes:** 53 passed, 8 skipped, none failed, and the isolation checks passed again. The extension's typecheck is clean, and its 216 unit tests pass.
  - **Logged in the plan:** `docs/slice2-plan.md` §8, the entry dated 2026-11-22.
- **Final patch:** `bundle_21/evidence/patches/after_slice_2_final.patch` (2i plus the two test fixes).
- **Not done, for later:**
  - `docs/DEMO.md` and the automated demo driver (`scripts/demo-driver.mjs`, `demo-ui.mjs`) still walk through M2's review (Accept, Discard). 2h reported this and left them as they are. My report has a demo script for slice 2.
  - The 7 old VS Code review scenarios stay skipped until they are rewritten for sessions.
  - The core defect in AP-42 waits for your decision.

### AP-44 · Your turn-25 follow-ups 2j1 and 2j2 built and checked (2026-11-22, session c398a83b)
- **Your decisions, as given (turn 25):**
  - **D2-76:** items to be redone count as decided; there is no Back to review on them; they return by themselves when their cause is un-declined. It amends RV-3 and supersedes AF4/D2-61's to-be-redone clause and D2-60.
  - **D2-92:** a note for Claude on every decline, a note on items to be redone, and one overall comment at Submit review. Claude receives all of them. It supersedes D2-13.
- **Builders' and fixers' decisions:** D2-77 to D2-91 (2j1) and D2-93 to D2-98 (2j2), each with its alternative, are in `docs/slice2-plan.md` §7.2, with the rest in §8. The main ones:
  - Only a `cascade` cause returns by itself (D2-77). A record saved before 2j1 has no kind, so it never returns (D7).
  - A returned item cannot be accepted in the same request (D2-87).
  - The note while to be redone lives in `redo.note`, and is dropped when the item leaves that status (D2-93).
  - The decline menu gives every option Shaky's note flow (D2-94).
  - The note is its own undoable step (D2-95).
  - The comment is kept on the Submit seal (D2-96).
  - Submit's confirmation is an inline panel under the session bar (D2-98).
- **Chain run `wf_93090c56-47b`:** 13 agents, ≈ 2.81 M subagent tokens, ≈ 262 min. Both sub-slices passed one fix round.
  - The first reviews found 8 findings for 2j1, including 2 majors (one defect, found twice), and 12 for 2j2 with no major.
  - Patches: `bundle_25/evidence/patches/after_slice_2j1.patch` and `after_slice_2j2.patch` (cumulative on c557f06).
- **Tests after 2j2:** the integrator found every typecheck clean, the core, webview and extension unit tests passing, and the runner suite at 897 passed with the 1 expected skip.
- **Open nits:**
  - **R1-1:** fixed in 2j2.
  - **A-ADV-2j2-5:** the decisions-since lines can still quote a note on an item that has since gone back to review. Claude sees a stale note line, which is harmless. Left for later.
- **Final checks (Playwright, the AP-8 rebuild, the VS Code suites):** see AP-45.

### AP-45 · 2j final checks passed; your extension rebuilt (2026-11-22 ~16:00Z, ~00:00 SGT)
- **Scratch webview build and Playwright,** one spec at a time: 21 of 21 spec files passed, 120 tests, nothing skipped or failed. Logs: scratch `final_checks_2j/`.
- **AP-8 rebuild:** `vite build` in packages/webview, then `node scripts/build.mjs` in packages/extension, both rc 0. `dist/` and `out/` are now modified in your working tree, for you to commit.
- **The VS Code suites (snap VS Code, isolated profile):** smoke 39 passing and 1 pending; e2e 14 passing and 7 pending (the 7 old review scenarios, unchanged since AP-43). 0 isolation failures, 0 warnings.
  - Order: the suites load the extension from `dist/`, so I ran them after the rebuild, as in AP-43.
- **Audit:** the subagents ran 894 shell commands, with no npx, npm install, download or git-changing command. Nothing was written under your telelean run folders or `~/telelean-demos`. HEAD is c557f06, with nothing staged.
- **Your doorclose session:** its old to-be-redone records have no `kind` (D7), so they do not come back by themselves. Undo the 4 steps back to before the Reject/Shaky decline, or let Claude redo them.

### AP-46 · 2k1, the Exit/Apply fix: checked, and your extension rebuilt; 2k2 interrupted (2026-11-23, turns 27 and 29)
- **Your decision (turn 27):** "I would like the Exit/Apply fix". It is D2-100 in the slice-2 plan's §7.2, with its design D1–D6. The bug: after Exit or Apply, the board kept showing the ended session's review panel, and a second Exit got "That run is not active any more."
- **What 2k1 does:** the runner's `session()` is null for any ended run, and the end's change makes the host post `session: null`. The board shows the ended run's outcome ("You exited…" or "Applied…") with Dismiss. It never draws review controls for an ended run, even if a stale view arrives.
- **The builder's decisions** (each also in §7.2):
  - D2-101: `session()` reads the run as last written (`run.saved`), as `current()` does, so both change with the run.json write that ends the run. *Alternatives:* clear the runtime view at the end, which would make an applied session's `current()` withhold its notices; or read `run.ended`, which changes before the write lands, so the board could briefly show "Preparing the review…".
  - D2-102, which differs from the brief's wording: after the end, `current()` keeps D2-10's rule as it was. With the results shown, the end notice is the last notice. With the results still hidden (an Exit before Show results, a Cancel while starting, a failure), that notice is withheld like any other, and the board's line comes from the run's state instead. *Alternative:* let telelean's end notice through whatever the reveal; the runner would then have to tell it apart from a step's notices, and the panel would show the line twice.
  - D2-103: the header of an ended session run reads like any ended run's ("Claude: discarded · Spyro"). *Alternative:* keep the session words, which name a phase and a lock that no longer exist.
  - D2-104: the rule "no review controls for an ended run" lives in the board's store, so one rule covers the panel, the session bar, the Proposed view, the Undo scope and the dialogs. *Alternative:* a check in each selector (RunPanel, session bar, badge).
  - D2-105: one Exit text, core's `REVIEW_TEXTS.exited`, used by both the runner and the board; `END_TEXTS.exited` is removed. *Alternative:* a copy of the text in the webview.
  - D2-106: one VS Code scenario, for Exit only. *Alternative:* a second, much longer scenario for Apply, which nobody could run before the final checks.
  - Minor: a test id on the ended line, and one bullet in the user guide's §10.13.
- **The fixer's decisions** (round 1 fixed 4 findings; none differs from your design):
  - F-F1: the ended-run rule stays in the store only. *Alternative:* an extra check in RunPanel's selector, which can't be tested because the store always clears first.
  - A-F1: the ended line appears twice, as the outcome line and as the last of the folded "Earlier notices". *Alternative:* filter that notice out of the panel.
  - A-F4: the VS Code scenario checks only the last attempt record, "discarded". *Alternative:* the full list, copied from a scenario that is itself skipped.
  - F-F2: a Playwright test renamed; no new test.
- **Checks in turn 27 (old machine):** two Sonnet verifiers found no blocker or major. The integrator passed tsc in 5 configs, vitest in core, webview and extension, and the full real-Lean runner suite.
- **Final checks (turn 29, 2026-11-23, on the 31 GB machine SPRLS57U):**
  - You committed 2k1 as `1736cb0` ("handoff"). Its 19 source files equal `bundle_27/evidence/patches/after_slice_2k1.patch` byte for byte.
  - **Scratch webview build and Playwright,** one spec at a time: 21 of 21 spec files passed, 124 tests (120 before, plus 2k1's 4 in `s2-review.spec.ts`), none skipped or failed.
  - **AP-8 rebuild:** `vite build` in packages/webview, then `node scripts/build.mjs` in packages/extension, both rc 0. Changed in your working tree, for you to commit: `dist/extension.js`, `dist/webview/webview.js`, `out/test/suite/e2e-runs.test.js` and their maps. The previous build is in git at `1736cb0`, and a copy is in my scratch dir (`dist_out_before_ap8.tgz`).
  - **The VS Code suites:** `run_vscode_smoke.sh` (`smoke.mjs --snap`: your snap VS Code 1.147.0, an isolated profile and HOME, under `xvfb-run`, which you installed for this in turn 29). Smoke: 39 passing, 1 pending. e2e: 15 passing, 7 pending. That is turn 25's count plus 2k1's new scenario "exit (2k1, D2-100)", which passed; the 7 pending are the old review scenarios, skipped on purpose since AP-43. 0 isolation failures, 0 warnings, rc 0. The suites ran after the rebuild, because they load the extension from `dist/`.
- **2k2 (your turn-27 request: everything telelean keeps for a model goes into the model folder) was interrupted** at your request on 2026-11-23 at about 05:13Z (13:13 SGT), mid-build and unverified. The partial work is `verbatim_prompt_log/bundle_27/evidence/patches/slice_2k2_partial_only.patch` (48 files). In turn 29 it still applied cleanly to `1736cb0` (`git apply --check`). Its brief, with the interruption note, is `bundle_27/handoff/kit/briefs/2k2.md`. Until 2k2 lands, sessions are stored by folder path in VS Code's storage, so don't delete and recreate a folder that has an open session.
- **Cost:** turn 27 used ≈ 1.2 M subagent tokens for 2k1 and ≈ 0.53 M for the interrupted 2k2 builder. Turn 29's checks were scripts, with no subagents.
