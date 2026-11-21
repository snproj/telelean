# fix:2d:r1

Agent `a3ec81240c4870313` of workflow `wf_4dd05c42-199`. Verbatim output (JSON alongside).

- **report:** # Fixer 2d, round 1: report

All 18 findings are fixed: 5 major, 11 minor, 2 nits. None was judged wrong. Four defects were reported twice: FC-3 = A-F9 (first part), FC-5 = A-F5, FC-6 = A-F8, FC-7 = A-F2.
- Every rule fix has a test that fails without it, checked by mutation and restored byte for byte with `cmp`.
- No core source, webview, extension or `test-fixtures/` file changed. Core and extension still compile and pass.
- All the final verification commands pass, with real Lean where needed.

## Findings

**Majors**
- **F-V2D-FC-1 (RV-13 never showed): fixed.** "Proposed nothing" is now decided at the step's end from content, not from commit ids:
  - the step passed;
  - its end files (its gate's, before any re-ask take-back) equal S₀'s;
  - it proposed no arrow and no premise draft.

  The result is stored as the additive `PersistedStep.proposedNothing`, which `wordsOf` reads.
- **A-F1 (a target with no ended step kept its old question): fixed.** In `finishQueueStart` (and its replay), a requested target that already has an inference but no ended step gets the request's question. A re-ask, which has an ended step, is unchanged (D2-46).
- **A-F2 = F-V2D-FC-7 (a converted ghost's `card` lived only in memory): fixed.** Every judge-apply sets a missing `card` on an Add premise record from the ledger's `premise` entry for its key (`cardsFromLedger`). The in-memory `writtenCards` is removed, and `legacySession` now returns `{ session }`.
- **A-F3 (a re-ask's take-back left a draft-reached definition): fixed.** `takeBackReask` now also reverts every draft that is part of T's Result and was made by this step (`partOfResult === T`, `origin.step` is the step).
- **A-F4 (a stale view after a failed view build): fixed; it now fails closed.**
  - When `buildSessionView` throws, there is no view: `session()` is null and `SessionRuntime.viewError` is set.
  - The RunView then withholds activity and notices, shows one telelean notice (`SESSION_VIEW_FAILED`), and fills its inferences, target and premises from the questions each target's latest ended step asked.
  - A mid-stage Formalize is refused with that text.
  - `openStageWithoutJudgement` now clears `rt.judgement`, `rt.judgedModel` and the persisted `judged`, and raises `viewVersion`. The stage has no judgement and Submit is closed; a reload re-runs the judge.

**Minors**
- **F-V2D-FC-2: fixed.** Cancel step on a queued step that never ran sets only its state: no `closeStep`, no copied round, finish or counters, and no attempt record.
- **F-V2D-FC-3 = A-F9 (first part): fixed.** A new StepRunner hook, `revertTarget(run)`, gives the commit a give-up goes back to.
  - M2 keeps `lastCommit(PASSING_COMMIT_KINDS)`.
  - A session step uses `lastCommitSince(S₀, [gate-pass, freeze, step-start])`.
  - `toolFinish`'s gave-up label and `stepReverted` both use it.
- **F-V2D-FC-4: fixed.** `onStateChanged` marks `stateChanged` when the phase or the active step's state actually changes. `persist` and `persistChecked` then turn the next write into a session change, and `onPersisted` clears the mark.
- **F-V2D-FC-5 = A-F5: fixed.**
  - `startStep` now returns an `ActionOutcome`. `startSession`, `startQueue` (Retry, mid-stage Formalize) and `resumeBetweenSteps` return its refusal instead of a success label.
  - Without a live session, the step's turn is stored in the new `PersistedRun.undeliveredTurn` (additive) until a session receives it. Resume sends it instead of the generic resume turn, and Cancel step drops it.
  - `continueSession`'s third parameter is now `'answers' | 'turn' | false`.
- **F-V2D-FC-6 = A-F8: fixed.**
  - New additive `PersistedSession.queueEndReconciled`, written in step 4 of the judge-apply that ran with `queueSteps`.
  - Recovery now always judges a queue's end with `endsQueue`, and passes `queueSteps` only if that queue is not reconciled yet.
- **F-V2D-FC-8: fixed, with runner changes only.**
  - `engine.judge` now returns `CheckReport.premiseExplicit` (runner type, additive): the explicit form of each draft whose re-check passed, also from the memo.
  - The judge-apply fills empty `explicit` on drafts and on their records' content, and never replaces a draft's own form.
  - The premise content key excludes `explicit`, so filling it never marks an item "updated".
- **A-F6: fixed.**
  - Tests now cover: `idle()` for Retry and for a mid-stage Formalize; propose_arrow after a passing finish; Cancel step while a question waits; a judge taking a converted written premise out.
  - Queued judges now count as judging (`SessionRuntime.queuedJudges`), and `idle()` waits on `isJudging`.
- **A-F7: fixed.**
  - `replaySteps` rebuilds a Retry's steps as `retryNow` does (`{ ...old.scope, step }`, the old kind), and a Formalize's from `inferences`.
  - A queue-start whose steps cannot be rebuilt (today only 2e's Submit) is not made: `inFlight` is dropped, the stage stays, and it is logged.

**Nits**
- **F-V2D-FC-9: fixed.**
  - The A12 twins now compare the whole SessionView, and the RunView without counters, usage and times.
  - New failure variant: a statements-only step under a turn cap ends `failed` and goes to `retry`.
- **A-F9 (second part): fixed.** The §8 R1-1 line now says the test rewords new-spyro-pg's docstring, not the premise's.

## Files changed

All paths are under /home/zhengyew/telelean. Backups of each file's prior state are in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2dr1/backup/; the list is in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2dr1/changed_files.txt.

**Runner source**
- `packages/runner/src/run/session.ts`: every fix above except the engine part of FC-8.
- `packages/runner/src/run/step.ts`:
  - `SessionRuntime.queuedJudges`, `.stateChanged`, `.viewError`;
  - the `revertTarget` hook, used in `toolFinish`;
  - `continueSession`'s `delivers` parameter.
- `packages/runner/src/run/manager.ts`: `current()` passes `viewError`; `resumeNow` sends `undeliveredTurn`; `convertLegacy` no longer passes `writtenCards`.
- `packages/runner/src/run/legacy.ts`: `writtenCards` removed; returns `{ session }`.
- `packages/runner/src/run/types.ts`: `PersistedRun.undeliveredTurn?`, `PersistedStep.proposedNothing?`, `PersistedSession.queueEndReconciled?`.
- `packages/runner/src/gate/types.ts`: `CheckReport.premiseExplicit?`.
- `packages/runner/src/gate/engine.ts`: the premise re-check returns `explicit`; the memo keeps it; `judge` reports `premiseExplicit`.

**Runner tests**
- `packages/runner/test/run/session.queue.test.ts`:
  - new (5): RV-13; statements-only failure → `retry`; Cancel while a question waits; target asked as new; judge throws at a later queue's end;
  - extended: the give-up notice labels; the A12 twins compare whole JSON.
- `packages/runner/test/run/session.tools.test.ts`:
  - new (1): propose_arrow after a passing finish;
  - extended: a draft's own explicit form is kept.
- `packages/runner/test/run/session.reload.test.ts`:
  - new (11): reload between judge rounds; pending ghost's explicit form; conversion card across a reload; judge take-out of the written premise; Retry replay scope; unrebuildable queue-start; queued judge; idle for Retry; idle for mid-stage Formalize; failed `--resume`; Claude process dies;
  - extended: Cancel between two steps records no attempt for the step that never ran;
  - the v1 fixture is now the helper `writeV1Run`.
- `packages/runner/test/run/session.views.test.ts`: new (1), a re-ask take-back of a draft-reached definition.
- `packages/runner/test/run/session.failclosed.test.ts`: new file (2 tests). It mocks core's `buildSessionView`, so it stands alone.
- `packages/runner/test/gate/session.test.ts`: real Lean, extended with `premiseExplicit` assertions (fresh, from the memo, and without a failed check's).

**Docs**
- `docs/slice2-plan.md`:
  - §6.1's 2d list gains the properties pinned by this round;
  - inline corrections in the builder 2d entry (R1-1's docstring, judge rounds, `proposedNothing`, `writtenCards`);
  - new §8 entry "2026-11-20 (fixer 2d, round 1 …)", with decisions, alternatives, tests, mutations and verification.

## Mutation checks

The driver is /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2dr1/mut/driver.py; specs are spec.json and spec_fc9*.json; logs are /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2dr1/logs/mut-*.log.
- There were 36 runs, each restored with `cmp OK`.
- Runs on the current tests ran the five `session.*` files (N30, N33 and N34 ran only `session.queue`), except N31/N32, which ran `gate/session` with real Lean, filtered to one test.
- Line numbers are in the current files. In the table, `S` means `packages/runner/src/run/session.ts`.

| Id | Where | What was broken | Test that failed |
|---|---|---|---|
| N01 | S:419 | RV-13 read from the commits again | queue "RV-13: a step that proposes nothing …" |
| N02 | S:1082 | RV-13 ignores premise drafts | same test |
| N03 | S:1373 | not asked as new | queue "a target whose only step was cancelled is asked as new …" |
| N04 | S:1625 | no card from the ledger | 3 reload conversion tests (the original one included) |
| N05 | S:1183 | take-back without decl: items | views "a re-ask that ends not proved, whose premise draft reaches a definition …" |
| N06 | S:456 | stale view kept (the original fail-open) | both failclosed tests |
| N07 | S:499 | no notice | failclosed "no stale view …" |
| N08 | S:1449 | no Formalize refusal | failclosed "no stale view …" |
| N09 | S:473 | RunView uses the records' question | failclosed "with no view … the same whether a re-ask proved its target or not" |
| N10 | S:1587 | judgement kept after the judge throws | queue "a judge that cannot run at a later queue's end …" |
| N11 | S:1296 | Retry does not wait (idle) | reload "Retry step" and "a judge queued behind another …" |
| N12 | S:1443 | Formalize does not wait (idle) | reload "a mid-stage Formalize" |
| N13 | S:971 | `assertCanAct` removed from propose_arrow | tools "after a passing finish it is an error …" |
| N14 | S:1241 | waiting question kept on Cancel step | queue "Cancel step while Claude waits for an answer …" |
| N15 | S:1641 | written premise keeps ledger entries and card | reload "a judge that takes the written premise out …" |
| N16 | S:313 | queued judges not counted | reload "a judge queued behind another counts as judging …" |
| N17 | S:1225 | `closeStep` always | reload "between two steps: Cancel step drops the rest …" |
| N18 | `packages/runner/src/run/step.ts:1564` | old gave-up label | queue "a give-up rolls back no further than S₀ …" |
| N19 | S:876 | no `stateChanged` mark | reload "the step and the phase are interrupted, and the session is posted with them" |
| N20 | S:326 | `persist` does not post marked changes | same test |
| N21 | S:1343 | `startQueue` ignores `startStep`'s outcome | reload "Retry step answers why; …" |
| N22 | `packages/runner/src/run/manager.ts:336` | generic resume turn | same test |
| N23 | S:802 | turn not kept | same test |
| N24 | S:1806 | recovery always passes `queueSteps` | reload "a reload between two judge rounds of a queue's end …" |
| N25 | S:1669 | `queueEndReconciled` never written | same test |
| N26 | S:1627 | explicit not filled | reload "a pending ghost's draft … takes the one its first re-check rendered" |
| N27 | S:261 | own explicit form replaced | tools "a checked suggestion becomes a draft outside ws/ …" |
| N28 | S:1833 | default scope on replay | reload "a Retry's steps are rebuilt as Retry built them …" |
| N29 | S:1836 | unrebuildable step invented | reload "a queue-start whose steps cannot be rebuilt is not made …" |
| N31 | `packages/runner/src/gate/engine.ts:1565` | no explicit from the re-check | gate/session "a source's statement reworded … lemma of a gap proof" |
| N32 | `packages/runner/src/gate/engine.ts:1510` | no explicit from the memo | same test |
| N33 | S:488 | A12 mode leaks into the RunView's `statementsFixed` | queue A12 twin test |
| N34 | S:137 | A12 mode leaks into the records' question | queue A12 twin test |

- **N33 and N34, against the original test:** both were also run against the builder's original A12 test, copied in temporarily as `session.queue.oldfc9.test.ts` and then removed with `rm`. Both mutants passed it, so the original test missed them; the tightened test catches both.
- **N30 (S:503, the RunView's verdict filter removed) survived.** It is an equivalent mutant: a session's `view.verdict` is only ever `cancelled` or `failed`, which the filter keeps anyway.

## Verification

The script is /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2dr1/final.sh; logs are in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2dr1/logs/final/.
- Every command ran one at a time through `capped.sh` with `TELELEAN_NO_REAL_CLAUDE=1`. tsc was capped at 2500 MB.
- vitest ran through `f2dr1/vt.sh`: `env TMPDIR=f2dr1/tmp TELELEAN_TEST_TMP=f2dr1/ttmp TELELEAN_NO_REAL_CLAUDE=1 LEAN_NUM_THREADS=2 capped.sh 3000 timeout 900 vitest run --maxWorkers=1 --no-cache --fsModuleCachePath=f2dr1/fsmc`, from `packages/<pkg>`.
- The lowest MemAvailable reading was 21526968 kB.

| Command | Result |
|---|---|
| tsc core (`tsconfig.test.json`), runner (`tsconfig.test.json`), webview (`tsconfig.json`, `tsconfig.node.json`), extension (`tsconfig.json`) | each exit 0, no output |
| vitest core | "Test Files 76 passed (76) Tests 1133 passed (1133)" |
| vitest webview | "Test Files 19 passed (19) Tests 314 passed (314)" |
| vitest extension | "Test Files 22 passed (22) Tests 213 passed (213)" |
| runner fake: `session.*` (5 files), `manager.*` (7), `prompts`, `test/llm`, `backend`, `quotaTripwire` | "Test Files 23 passed \| 1 skipped (24) Tests 240 passed \| 15 skipped (255)" |
| runner, real Lean: `test/gate/session.test.ts` | "Test Files 1 passed (1) Tests 27 passed (27)" |
| runner, real Lean: `test/gate/engine.test.ts` + `test/gate/sessionPure.test.ts` | "Test Files 2 passed (2) Tests 54 passed (54)" |
| runner, real Lean: `test/integration/m2flow.test.ts` | "Test Files 1 passed (1) Tests 2 passed \| 3 skipped (5)" |
| runner, real Lean: `test/run/walkthrough.e2e.test.ts` | "Test Files 1 passed (1) Tests 21 passed \| 3 skipped (24)" |
| runner: `test/run/fresh.e2e.test.ts` | "Test Files 1 skipped (1) Tests 9 skipped (9)" |

- The fake-engine runner count is the builder's 220 plus my 20 new tests. Its 15 skips are the builder's 14 moved tests plus `llm/binary`'s opt-in.
- The skips in `m2flow`, `walkthrough.e2e` and `fresh.e2e` are the builder's moved tests.
- No webview file changed, so there was no scratch build and no Playwright.

**Snapshots**
- `before.diff`: 5710794 bytes, 397 files.
- `after.diff`: 5784477 bytes, 398 files (the new test file).
- They differ only in my 14 files.
- Both are in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2dr1/.

## Decisions for the orchestrator to log

All are also in the plan's §8.
1. **RV-13:** decided on content at the step's end (passed; end files equal S₀'s before any take-back; no arrow, no draft), stored as `PersistedStep.proposedNothing`. A give-up never counts. *Alternative:* compare declarations or items instead of files.
2. **A target asked as new:** its inference's question is replaced in the queue-start's step 4 and its replay; re-asks are unchanged. *Alternative:* a new inference record for it.
3. **Written premise cards:** derived from the ledger at every judge-apply; `writtenCards` removed. *Alternative:* persist `writtenCards` until it is applied.
4. **Re-ask take-back:** also takes the step's own parts of T's Result (`partOfResult === T`, `origin.step` is the step). *Alternative:* every draft whose declarations are all among the step's proof-phase `created` names.
5. **Fail closed when no view can be built:**
   - no view and `viewError`;
   - the RunView withholds activity and notices and shows one telelean notice;
   - its inferences come from the asked questions;
   - a mid-stage Formalize is refused;
   - a judge that throws at a queue end clears the judgement, in memory and in `judged`.

   *Alternative:* keep the last good view with a flag, or withhold without a notice.
6. **A cancelled step that never ran** gets its state only, and no attempt record. *Alternative:* an attempt record of its own, with no finish.
7. **Revert target:** the StepRunner hook `revertTarget`, used by both the gave-up notice and the rollback. *Alternative:* patch the notice in `stepReverted`.
8. **Session posts:** a phase or step-state change through `setState` marks the runtime, and the next run.json write posts the session. *Alternative:* compare the persisted states with the last view at every write.
9. **Failed `--resume`:**
   - `startStep` returns its outcome;
   - `PersistedRun.undeliveredTurn` holds the unsent step turn, which Resume sends and Cancel step drops.

   *Alternative:* rebuild the step's turn from the records on Resume.
10. **Queue-end rules once:** `PersistedSession.queueEndReconciled`, with recovery passing `queueSteps` only for a queue not reconciled yet. *Alternative:* the judge round in the in-flight action.
11. **Explicit forms:**
    - `CheckReport.premiseExplicit` from the engine's passed re-checks, memo included;
    - the judge-apply fills an empty `explicit` on drafts and their records, and never replaces a draft's own form.

    *Alternatives:* a session ghost check per pending ghost at conversion (a Lean job and a step context at recovery); `explicit` in core's `premiseChecks` (a core change 2d may not make).
12. **Queued judges** count as judging (`queuedJudges`), and `idle()` uses `isJudging`. *Alternative:* set `judging` when a judge is queued.
13. **Queue-start replay:** rebuilt from the steps they retry, or from `inferences`; a write that cannot be rebuilt is not made. *Alternative:* add each step's kind, target and scope to the queue-start write now, a contract that 2e may still shape.
14. **Tests:**
    - `session.failclosed.test.ts` is its own file because it mocks core's `buildSessionView`;
    - the v1 fixture became the helper `writeV1Run`;
    - FC-9's test strength was shown against the original test.

    *Alternative:* a white-box flag in place of the module mock.

**Runner texts not in core (reported; no core text added):** "telelean could not build the review list. Nothing of it is shown until it can: reload the window to try again, or Exit the session." (`SESSION_VIEW_FAILED`).

**Contracts, all additive and runner-only:**
- `PersistedStep.proposedNothing?`;
- `PersistedSession.queueEndReconciled?`;
- `PersistedRun.undeliveredTurn?`;
- `CheckReport.premiseExplicit?`.

Internal changes: `JudgeOptions.writtenCards` removed; `legacySession` returns `{ session }`; `continueSession` takes `'answers' | 'turn' | false`; new StepRunner hook `revertTarget`. No core contract changed.

## Effects outside the repo and the scratch dir

- **Memory caps:** every heavy command ran through `capped.sh`, which creates a transient `systemd-run --user` scope that ends with the command.
- **Real Lean:** the sandboxed Lean jobs ran as transient `telelean-*` user units; 0 are left.
- **elan:** `~/.elan/known-projects` was only `stat`ed: mtime and ctime 2026-11-17 09:15, untouched.
- **Repo `node_modules`:** vite's config loader created and deleted transient bundles in the existing `.vite-temp` folders (repo root, `core`, `runner`, `webview`). All four are empty; only their ctimes changed. `--no-cache` and `TMPDIR` do not affect this; it is standard vitest config loading.
- **`/tmp`:** no new entries. All test temp, cache and fs-module-cache files went to the scratch dir.
- **Home directory:** a ctime scan against my start reference (21:01) found only:
  - files of the user's running apps: VS Code's `~/.config/Code`, the Discord snap, Copilot, `tracker3`;
  - the Claude harness's own `~/.claude` and `~/.claude.json`.

  Nothing came from me.
- **Repo writes:** only my 14 files under `packages/runner` and `docs`.
  - A temporary test copy, `packages/runner/test/run/session.queue.oldfc9.test.ts`, was created for the FC-9 check and removed with plain `rm`; it is confirmed gone.
  - The mutation driver edited source files temporarily and restored each byte for byte.
  - Nothing changed in `packages/extension/dist`, `packages/extension/out`, `test-fixtures/` or `scripts/` (checked).
- **Never done:**
  - git commands other than the read-only diffs in `snapdiff.sh`, or any change to git state;
  - network use, npm or npx, downloads or installs;
  - real Claude: every test had `TELELEAN_NO_REAL_CLAUDE=1`;
  - publishing or sending anything;
  - a build, Playwright, or the VS Code suite;
  - reading credentials.
- **Processes:** I started only my own, and none is left. The `lean --server` for `~/webring` that was running belongs to the user's editor and was left alone.
- **notFixed:**

