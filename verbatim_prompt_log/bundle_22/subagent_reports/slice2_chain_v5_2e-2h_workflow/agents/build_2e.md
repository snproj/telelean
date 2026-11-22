# build:2e

Agent `a0e56bee9db4cd80a` of workflow `wf_bee8fde1-76d`. Verbatim output (JSON alongside).

# Builder 2e report: the review actions

## Summary

Sub-slice 2e is built and verified, in the runner and the extension host only: no core, no webview and no `test-fixtures/` changes.

- **What 2e now does:** decide (Accept, every decline, back to review, un-reject), Show results, Undo and Redo, Submit review, the raw diff, recovery of these writes after a crash, and host routing for the six messages.
- **Carry-overs:** all five (R1-1 to R1-5) are fixed and mutation-checked.
- **Moved tests:** the two tests 2d moved to 2e are rewritten and un-skipped.
- **Verification:** every package typechecks and passes its unit tests. The runner files I touched pass, with the fakes and with real Lean.

Testing found four real defects; three are fixed in the runner. The fourth is in core, which §0 forbids 2e to change. The runner works around it and it is reported below.

## The core defect (for the orchestrator)

Core's reducer reads an item with no class in the stage judgement as having every badge (fail closed). After a Reject or a plain decline, the item's content is out of ws/, so it has no draft and no class. As a result, an Undo that restores its Accept, or an accepted dependent's, is always refused with RV-7's text. This breaks:
- the Undo of a Reject of an accepted item;
- the Undo of a Reject that took an accepted dependent out;
- D2-59's Undo of a decline of an accepted arrow.

**Runner workaround** (in `reviewState` in `review.ts`): for an Undo only, such an item gets the badges its restored Accept recorded, and only where the judgement has no class. The judge that follows the Undo classifies it again, and D2-23 returns it if its badges grew. Submit and Apply wait for that judge.

**Proper fix (core):** treat "no class while its content is out of ws/" as the restored Accept's recorded badges. The workaround can then be removed.

## The other three defects, fixed in the runner

- **`viewVersion` counted hidden changes (F17).** Found by the §6.1 arrow twin: the two twins' hidden boards ended with versions 7 and 6. The runner raised the version at every judge-apply write, including a judge round that took out a hidden Result. Now:
  - only the converged judge-apply raises it, and only when what the user can see changed;
  - a round whose reverts make the judge run again is recorded but not published.
- **A Submit could start beside a pending judge (AF3).** A decision's write asked for its judge only after the write left the queue, so for a moment the session looked idle. Now:
  - the judge is requested inside the write;
  - Submit, and 2d's queue starts, run as the write queue's last write (`asLastWrite`): they wait, then check again inside the queue;
  - a judge started by a decision stops if a step is running.
- **Cancel step of a Submit queue moved to a new stage.** It now returns to the submitted stage, as ES-4 says ("returns you to the previous stage").

## Kept from the two interrupted runs

The tree started as HEAD `1473ca0`.

- **Kept after review and tests:**
  - `review.ts`: the write's plan, the four writes, Submit's take-out and queue-start, the raw diff, the replays;
  - `inverseMerge`; the feedback turn; the manager's methods;
  - `replaySteps`' Submit branch; the R1-1 recovery rule; the "did not pass" heading of a decision's judge.
- **Changed:**
  - the judge is requested inside the write; Submit uses `asLastWrite`;
  - the Redo's confirmation wording comes from the decisions it re-sends;
  - the partly-accepted cycle is named in the view's list order;
  - a Shaky item that Submit takes out says what it relied on.
- **Redone:**
  - the AF4 test: its shown Results were in review, so Submit was rightly refused;
  - the DO-0 test's type error.
- **Deleted** (plain `rm`): `test/run/zz.explore.test.ts`, an exploration file.

## Carry-overs of 2d's review

- **R1-1 – fixed.** Done by the interrupted run, then tested. Recovery now judges with the queue's own steps (`queueSteps`) when it finds:
  - no stage judgement,
  - and the queue's end not yet reconciled,
  - and no decision stacked since the queue's seal.

  The test is in `session.reload`: "a queue's end whose judge threw, after a reload". Its `decidedSinceSeal` guard can never be false in 2e, since every review action is refused without a judgement (mutant M50 is equivalent). It stays as a safeguard.
- **R1-2 – fixed.** The RV-13 test now also checks the negative case: a step that wrote its proof has no `proposedNothing` and no report line.
- **R1-3 – fixed.** New test: a Resume whose `--resume` fails right after a queue-start answers why, and the next Resume sends the kept step turn.
- **R1-4 – fixed.** New test: a mid-stage Formalize's queue-start is replayed exactly as `formalizeInStage` built it, including A-F1's rule for a target with no ended step.
- **R1-5 – fixed.** In the plan, "no written cards" is struck through and annotated (builder 2d's judging line).

## Files changed

**Runner source**
- `src/run/review.ts` (new): the `ReviewRunner`, which adds the review actions, Submit, the raw diff and their replays on top of the session layer.
- `src/run/session.ts`:
  - hooks for the review layer; R1-1's recovery rule; the "did not pass" heading;
  - `asLastWrite`; the D2-62 guards; the F17 view version;
  - the stage rule for a cancelled Submit queue; the Submit branch of `replaySteps`.
- `src/run/manager.ts`: the session methods now go to `ReviewRunner`.
- `src/run/prompts.ts`: `submitFeedbackTurn`, the feedback turn.
- `src/run/types.ts`: doc comments, plus `queue-start` gains an optional `submit` field.
- `src/proposal/files.ts`: `inverseMerge`.

**Extension**
- `src/logic/boardSession.ts`: routes `decideItems`, `revealResult`, `sessionUndo`, `sessionRedo`, `submitReview` and `openSessionDiff`.
- `src/logic/runs.ts`: Submit review's success shows a toast.
- `test/unit/fakes.ts`: the fake RunManager gains `sessionDiffFiles`.
- `test/unit/runRouting.test.ts`: routing tests for 2e.

**Runner tests**
- `test/run/session.review.test.ts` (30 tests), `session.submit.test.ts` (new, 8), `session.twins.test.ts` (new, 5), `test/proposal/inverseMerge.test.ts` (new, 5).
- `test/run/session.reload.test.ts` (11 more), `session.queue.test.ts`, `session.failclosed.test.ts`, `prompts.test.ts` (3 more).
- `manager.rounds.test.ts`, `manager.accept.test.ts`, `manager.happy.test.ts` (a comment only).
- Helpers: `helpers/review.ts` (adds `rulesGate`, `sharedModel` and `arrowModel`); `helpers/fakeEngine.ts` (an `adjust` hook for the fake facts).
- `test/run/fixtures/sessions/submit-feedback-turn.txt` (new golden file; I inspected it).
- Deleted: `test/run/zz.explore.test.ts`.

**Docs**
- `docs/slice2-plan.md`: R1-5's annotation, a pointer at §3.5 step 4, and the builder 2e entry in §8.

## Tests

**Moved to 2e, now un-skipped (both rewritten):**
- `manager.rounds` "Feedback (AT3.8)": now a Shaky Result's Submit step.
- `manager.accept` "Discard ends the round; the raw diff covers base -> shown state": now the session's raw diff, with Discard as the stopgap Exit until 2f.

**Placeholders left in the runner:** 27 (26 move to 2f, 1 to 2h).

**Coverage of §6.1's 2e list:** every item is covered. For "Undo of a Reject, then a Submit queue, then Apply", the test runs up to the end confirmation, because Apply is 2f's.

**New:**
- `session.review` (30): Reject, un-reject and its merge conflict; Shaky and AF4; RV-5's confirmation and D2-64's; DO-0, and D2-59 with its Undo, Redo and B.2 failure; Show results, the raw diff and "Show Claude's activity"; Undo and Redo (AF13: a judge changing a class or a dependency); F8, coalescing and AF3; white-box checks of the guards; a converging revert; "did not pass"; F17; the refusals; the confirmations' wording.
- `session.submit` (8): the golden feedback turn; D2-57; DO-3 with `no_alternative` (F5); exact and reworded repeats with AF1; a rejected Result through the judge; a closed proof (`openProof` false); a partly accepted cycle; F4 up to the end confirmation.
- `session.twins` (5): AF5's decision sequences; AF7's Retry pair; the arrow pair with T's re-ask proved, not proved and cancelled.
- `inverseMerge` (5).

**Extended:**
- `session.reload` (11 more): R1-1, R1-3 and R1-4; a decision's write crashed after each of its four writes; a written Add premise taken out by a Reject and put back by its Undo; a Submit's queue-start replay; a Submit's take-out replay.
- `session.queue` (R1-2); `session.failclosed` (every review action refused while the view cannot be built); `prompts` (3 more).
- Extension `runRouting`: 4 more tests.

## Verification

All jobs ran through `capped.sh`, one at a time; MemAvailable stayed at or above 38 GB.

| What | Result |
|---|---|
| tsc `--noEmit`: core and runner (`tsconfig.test.json`), webview (`tsconfig.json`, `tsconfig.node.json`), extension | rc 0, no output |
| vitest core | Test Files 76 passed (76), Tests 1133 passed (1133) |
| vitest webview | Test Files 19 passed (19), Tests 314 passed (314) |
| vitest extension (`--no-cache`) | Test Files 22 passed (22), Tests 217 passed (217) |
| Runner with the fakes: `session.*` (8), `manager.*` (7), `prompts`, `test/proposal` | Test Files 23 passed (23), Tests 234 passed, 12 skipped (246) |
| Runner with real Lean, final code: `walkthrough.e2e` + `integration/m2flow` + `fresh.e2e` | Test Files 2 passed, 1 skipped (3), Tests 23 passed, 15 skipped (38), 654 s |

The command forms:
- **vitest:** `TMPDIR=<S>/b2e/tmp TELELEAN_TEST_TMP=<S>/b2e/ttmp <S>/capped.sh 3000 timeout 900 /home/zhengyew/telelean/node_modules/.bin/vitest run --maxWorkers=1 --no-cache --fsModuleCachePath=<S>/b2e/fsmc …`, with cap 2000 for the core, webview and extension suites. `capped.sh` sets `TELELEAN_NO_REAL_CLAUDE=1` and `LEAN_NUM_THREADS=2`.
- **tsc:** `<S>/capped.sh 2000 /home/zhengyew/telelean/node_modules/.bin/tsc --noEmit -p <cfg>`.

The 12 and 15 skips are the moved-test placeholders. Real Lean, per file: walkthrough 21 passed and 3 skipped; m2flow 2 passed and 3 skipped; fresh 9 skipped. These match 2d's numbers. No webview file changed, so there was no scratch build and no Playwright run.

## Mutation checks

59 runs of 54 mutants. Each file was copied to `<S>/b2e/mut` first, then restored and checked with `cmp`: all OK. Results are in `<S>/b2e/mut/batch1.out` and the later batch logs.

**Carry-overs** (all in `runner/src/run/session.ts`):

| Mutant | Line | What I broke | Test that failed |
|---|---|---|---|
| R1-1 | 1940 | R1-1's recovery rule turned off | reload: "queue-end rules: a re-ask…" |
| X1 (R1-2) | 1154 | `sameFiles` dropped from `proposedNothing` | queue: RV-13 |
| X13 (R1-3) | 1479 | Resume always answers "Claude continues" | reload: R1-3 |
| Y9 (R1-4) | 1983 | the replayed question is emptied | reload: R1-4 |

**2e's rules:**

| Mutant | Location | What I broke | Test that failed |
|---|---|---|---|
| M01 | review.ts:116 | the step-running refusal | queue: the D2-62 test |
| M02 | :117 | the phase refusal | submit: DO-3 |
| M03 | :118 | the stale-stage refusal | review: refusals |
| M04 | :120 | the view-error refusal | failclosed |
| M05 | :121 | the no-judgement refusal | review: refusals |
| M06 | :184 | no judge after a decision | review: Reject |
| M07 | :195 | judge coalescing removed | review: coalesces |
| M08 | :211 | the no-op path | review: refusals (group Accept) |
| M09 | :356 | the un-reject's merge | review: Reject |
| M10 | :352 | the Undo's inversion | review: "Undo of a Reject inverts…" |
| M11 | files.ts:118 | a conflict ignored | review: "no longer merges" |
| M12 | review.ts:473 | `decline.commit` not set | review: Reject |
| M13 | :468 | the action's `commits` not set | review: Reject |
| M14 | :469 | the action's `takenOut` not set | reload: written premise |
| M15 | :424 | the taken-out premise's entries not dropped | reload: written premise |
| M16 | :384 | the entries not put back | reload: written premise |
| M17 | :460 | the premise's card not cleared | reload: written premise |
| M18 | :150 | the Undo's recorded badges | review: "restores both Accepts" |
| M19 | :74 | `contentOut` | review: D2-59 |
| M20 | :518 | Submit's "in review" refusal | submit: golden |
| M21 | :519 | Submit's "results hidden" refusal | review: AF4 |
| M22 | :523 | Submit's cycle refusal | submit: partly accepted |
| M23 | :533 | Submit's take-out skipped | submit: golden |
| M24 | :630 | a Shaky item's decline dropped at take-out | submit: two targets share a source |
| M25 | :696 | `openProof` always true | submit: closed proof |
| M26 | :704 | `openItems` emptied | submit: golden |
| M27 | prompts.ts:400 | the feedback turn's note dropped | submit: golden |
| M28 | session.ts:833 | no feedback turn | submit: golden |
| M29 | :1970 | the Submit replay | reload: Submit queue-start replay |
| M30 | :1909 | the take-out replay | reload: take-out replay |
| M31 | :1909 | the decision replay | reload: four decision crashes |
| M32 | review.ts:488 | the raw diff's question | review: raw diff |
| M33 | :489 | the raw diff's Show results | review: raw diff |
| M34 | session.ts:1637 | the judge loop's D2-62 guard | review: "never acts while a step runs" |
| M35 | :1733 | "did not pass" | review: did not pass |
| M36 | :488 | the version always raised | review: view version |
| M37 | :1817 | a converging round published | twins: arrow ×3 |
| M38 | :1705 | the stage rises after a cancelled Submit | review: "never acts while a step runs" |
| M39 | review.ts:317 | the Reject wording | review: wording |
| M40 | :313 | the Redo wording | review: wording |
| M41 | :314 | the Undo wording | review: wording |
| M42 | boardSession.ts:402 | `confirmed` | runRouting |
| M43 | :532 | the diff's "needs confirmation" | runRouting |
| M44 | :411 | the Submit route | runRouting |
| M45 | session.ts:1817 | a converging round raises the version | twins: arrow ×3 |
| M46 | :1579 | the last write's check inside the queue | review: white box |
| M47 | :1726 | judge-apply's D2-62 guard | review: white box |
| M48 | :1405 | the queue start's re-check | review: white box |

**Survived on the first run, and why:**
- M25, M36, M37 and M48 had no test yet; each got one, and was run again and caught.
- M39 was malformed on the first run (it left a dangling `else`); run again correctly, it was caught.

**Equivalent mutants (kept as safeguards):**
- M49 (session.ts:1790: the converged write's clearing of `converging`). The previous board carries its own version, so no board is ever posted under two versions either way. A test pins that property.
- M50 (`decidedSinceSeal`): see R1-1 above.

## Decisions for the orchestrator to log

All 15 are also in the plan's §8 builder 2e entry, each with its alternative.

1. **The ws/ part of a review action.** It is planned on the head when the write starts: first the inverse merges, then the reverts and premise take-outs together in one `planItemRevert`. For an un-reject the merge reverses the declining commit; for an Undo it inverts the undone action's commits, newest first. There is one `decision` commit per action: it is added to the action's `commits` and becomes the decline's `decline.commit`. An Undo's own commit belongs to no action. *Alternative:* separate commits for the merges and the reverts.
2. **The inverse merge** reuses `mergeFile` (3 context lines, no fuzz, with its board-edit fallback). A conflict refuses the action and writes nothing. *Alternative:* a plain patch with no fallback.
3. **Judging and AF3.** The judge is requested inside the decision's write. Submit and the queue starts run as the last write and check again inside the queue. A judge started by a decision stops while a step runs. *Alternative:* refuse such a Submit with "Re-checking the working copy…".
4. **"Did not pass" after a decision.** A decision's judge that converges on a failing state heads the stage "did not pass", keeping a cancelled queue's Retry. Like ES-4's heading, it stays until a later step passes. *Alternative:* lift it when a later decision's judge passes, which would also drop a cancelled step's heading and its Retry.
5. **Undo of a decline that took content out** gets the recorded badges (the workaround above). *Alternatives:* fix core's reducer now (§0 forbids it in 2e); or leave such an Undo refused.
6. **`viewVersion` rises only for visible changes**, and converging judge rounds are not published (F17). *Alternative:* one raise per judge whatever changed, which still counts judges that a hidden item started.
7. **A cancelled or failed Submit queue keeps the stage number** (ES-4). *Alternative:* the stage rises whenever a Submit queue ends.
8. **Submit review.**
   - Refusals come in the view's order: items in review, then results hidden, then a partly accepted cycle.
   - Going to the end confirmation: phase `confirming`, no seal and no step; the check id is a hash of F's files key and the items' states.
   - Otherwise, the take-out and the queue-start run in one job. A taken-out item records what it rests on in `redo.because`; a Shaky one keeps its decline and note.

   *Alternative:* the take-out and the queue-start in two jobs.
9. **The feedback turn's format.**
   - Section order: ACCEPTED, REJECTED, SHAKY (with each note, and what a taken-out item rested on), TO BE REDONE (with what each relied on), STEPS PLANNED.
   - Each item is its view label plus its Lean text, indented; an empty section says "(none)".
   - It comes first in the first Submit step's turn. A Retry of a Submit step gets "Your decisions since the last step:" instead.
   - A golden file pins it.
10. **The raw diff** is B → the head, `.lean` files only. While the results are hidden it needs `confirmed`, and then counts as Show results (`raw-diff`). The host runs it in the run queue. The diff is titled "Raw Lean diff: ‹subject›" and its id is `stage-‹n›`; an unchanged session or file gives an info toast.
11. **Recovery.** A `decide` or `submit-take-out` write found in flight is made again on the recomputed judgement, or not made if the rules refuse it now.
12. **Host routing.** An absent `confirmed` means false. Answers, including "needs confirmation", are passed back unchanged. Submit's success shows a toast; a decision's does not. `endSession` and `moveProposed` stay `not-yet` until 2f.
13. **Accepting an Add premise** only writes records in 2e; the premise write itself is 2f's.
14. **Contract (additive):** `SessionWrite` `queue-start` gains an optional `submit: Array<{ target, openItems, openProof }>`, so a crash replay rebuilds the steps exactly.
15. **Test fakes.** `rulesGate` lets the fake gate run core's own step rules (`rejected-repeat`, `undeclared-premise`) where a test needs them. The twin harnesses use a normalise that pins statements as the real engine does: the fake's no-op normalise let an arrow write's side-effect pin make one twin differ.

**Runner texts not in core** (reported; no core text added):
- `NO_JUDGEMENT` and `DECISIONS_DID_NOT_PASS`;
- "telelean could not carry out your decision: ‹error›"; "Could not open the raw Lean diff: ‹error›";
- three commit labels;
- "This session changes no files." and "This session does not change ‹file›.";
- the feedback turn's section headers (Claude-facing).

## Effects outside the repo and the scratch dir

None. The work is confined to the repo's `packages/` and `docs/`, and the scratch dir `<S>/b2e`. Details:
- **Git:** no git commands that change state; HEAD is still `1473ca0`, with nothing staged.
- **Build outputs and caches:** nothing written to `packages/extension/dist` or `out`; nothing new in `/tmp`; every vitest ran with `--no-cache` and its module cache, temp dir and test temp dir in the scratch dir.
- **Processes:** none of mine left running.
- **Not mine:** the modified `verbatim_prompt_log/bundle_21/user_requested_documents/02_autopilot_decisions.md` and the untracked `bundle_22/` were already in that state before I started.

`<S>` = `/tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad`.
