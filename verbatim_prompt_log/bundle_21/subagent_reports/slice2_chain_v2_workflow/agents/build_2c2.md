# build:2c2

Agent `a4514b31037ca7add` of workflow `wf_ae5f1188-533`. Verbatim output (JSON alongside).

# Builder 2c2 report: the session view (`buildSessionView`) and the host's `not-yet` answers

Status: done. Every package compiles, every unit test passes, and all 104 mutation checks are caught. No test was skipped, moved or deleted. One defect in an earlier sub-slice was found and not fixed (finding F1 below; it needs your decision).

## Carry-over from 2c1's review
- **R2-1 (minor): fixed.** All three parts are done.
  - §4.7's accepted residuals gain a bullet for the channel. In the not-proved branch only, the late freeze that R1-1's refusal asks for makes a failed attempt's helper definitions or vocabulary listed statement content, where a step frozen before its attempt hides them.
  - The fixer 2c1 r2 §8 entry's reason for rejecting alternative (a) now carries a correction. The chosen fix produces the same difference in the cases it refuses; what sets (a) apart is its reach.
  - The optional rewording is done. `CLAUDE_SESSION_TEXTS.otherResultNotFrozen` now ends "Remove what you wrote only for the proof attempt, call freeze_statements, then finish again." §4.9's quote and `judge.test.ts`'s `toContain` were updated to match.

## Files changed
- `packages/core/src/review/view.ts`:
  - `buildSessionView` replaces its stub.
  - New exports: `itemLabel`, `sessionLabels`, `reviewStateOf`.
- `packages/core/src/review/reducer.ts`:
  - New export `itemGates(state)`: every item's own Accept, decline and back-to-review gates, computed on one working copy of the review state.
  - `acceptGate` now runs on a shared internal `acceptGateIn`; its behaviour is unchanged.
- `packages/core/src/review/types.ts`, additive optional fields:
  - `SessionRecords.steps[].statementsOnly?` and `.queue?`
  - `SessionRecords.confirmation.reusedFileChecks?`
  - `SessionViewInput.endorsements?` and `.lakefile?`
- `packages/core/src/review/texts.ts`: R2-1's reworded message, ten new `REVIEW_TEXTS` entries in my wording, and `CLASS_REASON_TEXTS`.
- `packages/core/test/review/view.test.ts`: new, 43 tests.
- `packages/core/test/review/judge.test.ts`: R2-1's `toContain` updated.
- `packages/extension/test/unit/runRouting.test.ts`: one test added.
- `docs/slice2-plan.md`:
  - §2.9's code blocks show the new fields.
  - §4.7 has the R2-1 residual; §4.9's quote is updated.
  - The fixer 2c1 r2 entry has the correction.
  - New §8 entry "builder 2c2".

`review/index.ts` and the host's source are unchanged. Builder 2c1 already answers each session message `not-yet` with ten explicit case labels.

## Tests
- **Added**, `view.test.ts` (43 tests), grouped by describe block:
  - **While the results are hidden (8):**
    - the hidden Result's neutral row;
    - Results' parts left out (list, counts, board, rejected list, withdrawn list), and never named by a listed item;
    - the InferenceView's question rule;
    - Claude's words, step outcomes, reason chips and activity withheld;
    - the class map in force, and `dependents`;
    - card names while hidden;
    - AF4 and Submit's gate;
    - the hidden board (F17).
  - **Once shown (2):** real statuses, verdicts and words; `submit.work` from `planSubmit`, plus the partly accepted cycle.
  - **Every gate text (5):** while a step runs; in a stage; decline and back to review; Accept; Submit, Formalize and Retry.
  - **End confirmation (1).**
  - **List order and step numbers (3).**
  - **Details and labels (2).**
  - **Details of slice-3 kinds and previous proposals (2).**
  - **Notes, question arrows, build inputs (3):** D2-59 notes, `reviewStateOf`, endorsements and lakefile reaching the masked board.
  - **What only the results show (4).**
  - **`itemGates` per status (1).**
  - **Edges (4):** no judgement yet, a rebuild from persisted records (reload), events, moves.
  - **Non-interference (8):**
    - a proof or none;
    - a premise draft reaching a proof-phase definition;
    - Claude's arrow;
    - a lemma placed before the other cards, with a linter warning;
    - a re-ask proved or not;
    - a chain with a statements-only step;
    - a Retry queue, with the same item ids (AF7);
    - sequences of Accept, Reject, Shaky, a group Accept and Undo, comparing the reducer's answers as well as the views.

  DO-0 is not in any hidden sequence: an arrow item is a Result's part, so it is never listed while the results are hidden.
- **Added**, extension `runRouting.test.ts`: "slice 2 (2c2): while a run is active the answer is still `not-yet` …; without a request id it is a warning toast".
- **Updated:** `judge.test.ts`, the fixer 2c1 r2 R1-1 test's message expectation.
- **Skipped for later, moved, or deleted:** none.

## Verification
All runs used `capped.sh` and the binaries in `node_modules/.bin`. Every vitest run had `--maxWorkers=1 --no-cache --fsModuleCachePath=<scratch>/b2c2/fsmc` and `TMPDIR=<scratch>/b2c2/tmp`. vitest 5 rejects `--poolOptions`, so `--maxWorkers=1` was used instead.

- `capped.sh 1800 tsc --noEmit -p` on `core/tsconfig.test.json`, `runner/tsconfig.test.json`, `webview/tsconfig.json`, `webview/tsconfig.node.json` and `extension/tsconfig.json`: each exit 0, no output.
- core `vitest run`: "Test Files 76 passed (76)", "Tests 1115 passed (1115)". Before this sub-slice: 75 files, 1072 tests.
- webview `vitest run`: "Test Files 19 passed (19)", "Tests 314 passed (314)".
- extension `vitest run --no-cache`: "Test Files 22 passed (22)", "Tests 205 passed (205)".
- runner: no runner source or test uses what changed (checked by grep), so no runner test file is touched. Smoke run with `TELELEAN_TEST_TMP=<scratch>/b2c2/runner-tmp` and `timeout 900`, `test/gate/pure.test.ts`: "Tests 14 passed (14)". No real-Lean runner test was run.
- Webview not touched, so no scratch build and no Playwright.

## Mutation checks
104 mutations, each restored and confirmed byte for byte with `cmp`. Every one fails at least one test.

On an earlier run of 101, six survived: V12, V13, V19, V23, V76, V79. I added tests for them (four tests and one assertion), and the final run catches all 104.

Full list (file:line, what was broken, number of failing tests, one failing test):
```
V01 view.ts:1091 hidden Result row: rev 0 dropped -> 2 failed (a re-ask proved or not …)
V02 view.ts:1092 hidden Result row: status shown -> 3 (a re-ask proved or not …)
V03 view.ts:1093 hidden Result row: class shown -> 1 (each Result is a neutral row …)
V04 view.ts:1094 hidden Result row: every marker -> 2 (a re-ask proved or not …)
V05 view.ts:1095 hidden Result row: dependencies named -> 9 (Claude's arrow the proof uses, or none)
V06 view.ts:867 hidden Result detail: revealed -> 8 (Claude's arrow …)
V07 view.ts:744 parts listed -> 4 (Claude's arrow …)
V08 view.ts:1358 counts over every record -> 7 (Claude's arrow …)
V09 view.ts:1236 rejected over every record -> 2 (Results' parts are left out …)
V10 view.ts:1382 withdrawn over every record -> 1 (Results' parts are left out …)
V11 view.ts:1256 marks over every record -> 4 (Results' parts are left out …)
V12 view.ts:1262 board arrows while hidden -> 1 (the board's arrows and premise suggestions only while shown …)
V13 view.ts:1271 board premises while hidden -> 1 (same)
V14 view.ts:1387 no hidden targets -> 1 (each Result is a neutral row …)
V15 view.ts:715 hidden dependencies named -> 1 (Results' parts …)
V16 view.ts:1116 redo.because names hidden items -> 1 (Results' parts …)
V17 view.ts:1352 events name hidden items -> 1 (events pass through, but never name a hidden item …)
V18 view.ts:718 a hidden accepted Result a dependent -> 2 (a re-ask …)
V19 view.ts:718 dependents not only accepted -> 1 (the class in force …)
V20 view.ts:675 hidden question = the record's -> 2 (a re-ask …)
V21 view.ts:639 words while hidden -> 13 (Claude's arrow …)
V22 view.ts:639 words while a step runs -> 2 (a session whose first queue runs …)
V23 view.ts:829 reason chip on a proved verdict -> 1 (a reason chip only for a not-proved verdict …)
V24 view.ts:832 statements-only chip dropped -> 1 (a chain X → L → T …)
V25 view.ts:1216 report words while hidden -> 7
V26 view.ts:1196 report verdicts while hidden -> 8
V27 view.ts:1181 re-ask note while hidden -> 2
V28 view.ts:1177 left-question note while hidden -> 1 (D2-59: a source that left a question …)
V29 view.ts:1186 D2-59 removal read as a re-ask -> 1 (D2-59 …)
V30 view.ts:1163 activity shown while hidden -> 3
V31 view.ts:645 unmasked board while hidden -> 12
V32 view.ts:433 node positions kept -> 2 (a lemma placed before the other cards …)
V33 view.ts:435 vocabulary loc kept -> 1 (the hidden board has no source position …)
V34 view.ts:440 diagnostic range kept -> 2
V35 view.ts:429 semantic details while hidden -> 1
V36 view.ts:654 version not viewVersion -> 1
V37 view.ts:401 hidden summary reads the unmasked status -> 1
V38 view.ts:651 endorsements not passed to the mask -> 1 (… endorsements and lakefile reach the masked board)
V39 view.ts:652 lakefile not passed -> 1 (same)
V40 view.ts:660 card named by the working copy while hidden -> 1 (a card is named as the board shows it …)
V41 view.ts:641 classes (with drafts) while hidden -> 1 (the class in force …)
V42 view.ts:722 decisions open while a step runs -> 2
V43 view.ts:1076 accept gate ignored -> 3; V44 view.ts:1077 decline gate ignored -> 2; V45 view.ts:1078 review gate ignored -> 3
V46 view.ts:1295 Submit with items in review -> 2; V47 view.ts:1296 Submit while hidden (AF4) -> 1; V48 view.ts:1297 Submit while judging -> 1
V49 view.ts:1298 Submit with a partly accepted cycle -> 1; V50 view.ts:1291 Submit plan read while hidden -> 4
V51 view.ts:1311 Formalize while hidden (D2-65) -> 1; V52 view.ts:1313 Formalize while judging -> 1; V53 view.ts:1307 Formalize while a step runs, generic text -> 1
V54 view.ts:1317 Retry with nothing to retry -> 1; V55 view.ts:1317 Retry while judging -> 1
V56 view.ts:1284 Undo while a step runs -> 1; V57 view.ts:1285 Redo while a step runs -> 1; V58 view.ts:1284 Undo across a seal -> 1
V59 view.ts:1370 telelean's `decided` force reported as the user's -> 1
V60–V68 view.ts:1322–1342 Apply while running, failed, drift, judging, applying; a vocabulary change endorsed; not-run dropped; reused file checks dropped; confirmation in a stage -> 1 each (changes, rejected, not run, the endorsements …)
V69 view.ts:733 Vocabulary after the cards -> 6; V70 view.ts:762 dependencies not first -> 4; V71 view.ts:737 fields item last -> 2; V72 view.ts:741 sources not first -> 9
V73 view.ts:512 2d's queue number ignored -> 1; V74 view.ts:355 a passed step not ended -> 2; V75 view.ts:672 a cancelled step read as ended -> 1
V76 view.ts:970 heldAs shown before the Accept -> 1; V77 view.ts:971 writtenInReview dropped (AF12) -> 1; V78 view.ts:1061 adds-no-new-basis marker dropped (AF8) -> 1
V79 view.ts:869 a rejected Result's detail reads the current state -> 1; V80 view.ts:876 completion-not-checked dropped -> 1; V81 view.ts:789 renderings ignored -> 1
V82 view.ts:1115 current decline dropped -> 1; V83 view.ts:605 did-not-pass ignored -> 2; V84 view.ts:592 every arrow counted as a question arrow -> 1
V85 view.ts:572 sessionLabels without items -> 1; V86 view.ts:543 itemLabel without a premise's sentence -> 1; V89 view.ts:553 a premise labelled by its key -> 2
V90 view.ts:703 a premise's label without its sentence -> 3; V91 view.ts:544 itemLabel without a declaration's name -> 1
V87 view.ts:1277 every card read as removed -> 1; V88 view.ts:1274 a written premise drawn as a suggestion -> 1
R01 reducer.ts:1336 decline of a hidden Result open -> 1; R02 reducer.ts:1338 declined again -> 2; R03 reducer.ts:1339 decline of a withdrawn item -> 2
R04 reducer.ts:1342 back to review of a hidden Result open -> 3; R05 reducer.ts:1346 back to review of an item in review open -> 2
R06 reducer.ts:1347 back to review of a withdrawn item -> 2; R07 reducer.ts:1350 back to review of a taken-out item (D2-60) -> 2
R08 reducer.ts:1356 un-reject after a mixed request (S-F5) -> 2; R09 reducer.ts:1355 a premise's un-reject refused for a mixed request -> 1
R10 reducer.ts:1360 the view's Accept checked as a group's -> 1; R11 reducer.ts:1331 gates read as if shown -> 11; R12 reducer.ts:1295 acceptGateIn's own-Accept block ignored -> 1
T01 texts.ts:616 R2-1's old message -> 1 (judge.test.ts, fixer 2c1 r2 R1-1 test)
```
The runner script is `<scratch>/b2c2/mutate.py`. The full results are in `mutations_final.json` and `mutation_table.txt` in the same folder.

## Decisions for the orchestrator to log
All are also in the plan's §8 entry "builder 2c2".

1. **Additive contract fields.** These let the view do what the plan asks from data the records did not hold:
   - `SessionRecords.steps[].statementsOnly?`: the statements-only reason chip that builder 2b1b left to 2c2. 2d sets it.
   - `SessionRecords.steps[].queue?`: so steps are numbered "i of n" within their queue. 2d sets it at `queue-start`.
   - `SessionRecords.confirmation.reusedFileChecks?`: 2f sets it.
   - `SessionViewInput.endorsements?` and `.lakefile?`: §2.9's note says 2c2 passes them to the masked build, but the input had no field. 2d/2f pass the ModelWorkspace's.

   *Alternative:* no fields. Without them the view could not show those data.
2. **Board.**
   - No source positions and `version` = `viewVersion`, whether the results are hidden or shown.
   - While hidden, the semantic summary's state reads only the masked facts: `failed` when a masked error or a failed probe is present, else `fresh`.
   - Once shown, the summary is the working copy's, as the runner reads it.

   *Alternatives:* strip positions only while hidden; read the envelope's status, which a hidden lemma's build error sets.
3. **Labels.** `ItemView.label` is the kind label only.
   - Full labels name card sentences (cut to 60 characters), the premise's sentence, or the Lean name.
   - One rule serves both the view's own texts and the exported `itemLabel` / `sessionLabels`, so 2e gets exactly the view's labels.

   *Alternative:* card ids, as the reducer's fallback labels use.
4. **List order.**
   - §5.5's groups; within a card: fields, Add arrows, Add premises, Result.
   - Then every item's listed dependencies are moved before it, so the dependency-first invariant holds on `items` itself. A source's Formalize can then follow a vocabulary term it uses.

   *Alternative:* groups only, leaving the invariant to 2g's `reviewRows`.
5. **Gates.** The gates are the reducer's own rules (`itemGates`).
   - Back to review on an item already in review is closed, with the text "‹item› is in review already."
   - A phase closes every action first. While a step runs: D2-62's text, or Formalize's own step-running text. While confirming: "Back to review first." While applying: a new text.
   - Submit checks in this order: phase, items in review, results hidden (AF4), judging, partly accepted cycle. `next` and `work` appear only while the results are shown.
   - Formalize: phase, hidden, judging. Retry: phase, nothing to retry, judging. Apply: applying, judging, check running, check failed, drift.
   - Undo and Redo only in a stage.

   *Alternatives:* `acceptGate` per item, which is O(n²); judging checked first.
6. **A hidden Result's row** holds rev 0, status null, classes null, only the seen-early marker, no dependencies, gates closed with "show them first", its decline options, its origin and its question. Listed items' `dependsOn`, `dependents`, `redo.because` and event items are filtered to listed items; an event left with none is dropped, as defence in depth. *Alternative:* trust the runner's events.
7. **Card references:** the board's node, else B's, else the working copy's (only while shown), else a bare reference. *Alternative:* always the working copy's, which would name a dropped premise card while hidden.
8. **Outcomes and report.** Step outcomes, activity, words, reason chips and notes appear only while the results are shown and no step runs.
   - `reasonChip` is set only for a not-proved verdict, from the target's latest ended step. A proved-but-not-established reason (BD-6) is left to the card's own chip on the shown board.
   - Notes: a re-ask not proved, and D2-59's "left the question", both derived from the steps and the stack.
   - The report lists every ended step.
   - `missing` comes from the judgement. Hints derived from Claude's gap text stay in the webview (`missingArrowHints`).

   *Alternatives:* list only the current stage's steps; compute BD-6's reason in core.
9. **Details.**
   - A declined or taken-out Result shows its own version: verdict and Rests on from `judged`, proof from its content.
   - `basisChanged`: the cards downstream of T whose footprint changed.
   - `previous` exists for Formalize, vocabulary terms, declarations and Add premises.
   - `endorsed` excludes vocabulary changes.
   - `marks`: card and Result items, plus a written premise on its own card.
   - `premises`: unwritten Add premises, except withdrawn ones.
   - A withdrawn item's `at` comes from its event; a superseded rejected version's `at` is empty.

   *Alternatives:* the stage judgement for a declined Result; time fields on the records.
10. **No `problems` field on SessionView.** The stage's problems reach the person through gates, events and the final check's failures. *Alternative:* add a field, which would be a contract change.
11. **No judgement yet (stage 0):** every class unknown (fail closed), no Submit plan, and the given working copy shown unmasked (the runner passes B).
12. **R2-1:** I also did the optional rewording. *Alternative:* the plan text only.
13. **New texts in my wording:** `inReviewAlready`, `submitInReview`, `nothingToRetry`, `applyingNow`, `applyWaitsForCheck`, `applyCheckFailed`, `stepPassed`, `stepStatementsOnlyOutcome`, `drawTooHint`, `classIncomplete`, and `CLASS_REASON_TEXTS`.
14. **Finding F1 (below): reported, not fixed.** *Alternatives:* list it as an accepted residual in §4.7, or apply the proposed fix in reconcile.

## Finding for the orchestrator, not fixed (outside 2c2)
**F1: whether the stage is hidden after a re-ask tells its outcome.** Setup: the user has forced Show results while a meaning item (statement or belief item) is still in review, and then runs a mid-stage Formalize that re-asks a target.
- 2a2's reconcile ends that force only when a meaning item becomes undecided or a Result changes (§3.5 step 3, `endsForce`).
- If the re-ask proves the target (a new Result version), the queue's end hides the results.
- If it does not, they stay shown.
- So the hidden-or-shown state tells the re-ask's outcome before the meaning item is decided.

I confirmed this with a throwaway reconcile test, created and then deleted with `rm`. The proved twin ends with `forced: null, shown: false`; the not-proved twin keeps the force, `shown: true`. §4.7's fixed pairs compare two hidden views, so they cannot see this.

Proposed fix: reconcile ends the user's force at every queue's end. I left it unfixed because it changes §4.7's force rule and 2a2's code, which are outside 2c2's entry.

## Effects outside the repo and the scratch dir
- `.git`: the directory's mtime changed at 09:41 when I ran the read-only `git status`, likely from git's transient lock. `.git/index` is unchanged, and no git state was altered.
- Vite (run by vitest) briefly created and deleted its bundled config in the existing `node_modules/.vite-temp` folders of the repo root, core, webview and runner. All four are empty again.
- `capped.sh` ran every heavy job in a transient `systemd-run --user` scope; nothing persistent.
- Nothing was written to `/tmp` outside my scratch dir (`TMPDIR` was set), no npm logs were created, and `packages/extension/dist` and `out` are untouched (no file newer than the session's start).
- No network, no git writes, no installs, no real Claude.

Scratch files (backups, logs, mutation runner) are in `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b2c2`.
