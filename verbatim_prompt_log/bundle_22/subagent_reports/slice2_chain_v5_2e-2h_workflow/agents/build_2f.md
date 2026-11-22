# build:2f

Agent `ac1f7678a1345b765` of workflow `wf_bee8fde1-76d`. Verbatim output (JSON alongside).

BUILDER 2f REPORT: Add premise items and the end (the confirmation, final check, Apply, Exit, drift, endorsements), with AP-29 G1 provenance and the 2e carry-overs.

Sub-slice 2f is built. Every package compiles, and every unit, runner and real-Lean run listed below passed. HEAD is still 1473ca0 with nothing staged. `packages/extension/dist` and `out` are untouched. The plan's §8 has the dated entry "2026-11-21 (builder 2f: …)" at /home/zhengyew/telelean/docs/slice2-plan.md, lines 3780-3828 (only additions).

## Carry-overs (done first, each with a mutation-checked test)
- **R1-1: fixed.** A decision's "did not pass" heading now has its own runner text: `DECISIONS_DID_NOT_PASS` = "Your decisions leave a working copy that does not pass its checks". It was `REVIEW_TEXTS.didNotPass(…)`, which blamed a step when none ran. The Accept refusal under it, `DECIDED_DID_NOT_PASS`, starts with the same words. The test is in `session.review`: "if B plus the accepted items still fail, the stage is headed "did not pass"". Mutant c1 is caught.
- **R1-2: (a) and (b) fixed with new tests; (c) not testable.**
  - (a) The `dropJudgement` guard `rt.judgement.commit === s.head`. Test: `session.review` "only its step 4 could not be saved … the judgement is kept (2e review R1-2a)". Mutant c2 is caught.
  - (b) The `dropJudgement` phase check. Test: "a decision's judge that throws while a step runs … leaves the stage judgement alone (2e review R1-2b)". Mutant c3 is caught.
  - (c) `delete next.decidedHeading` in `finishQueueStart` is an equivalent mutant: c4 survived 118 tests in `session.review`, `submit`, `queue` and `reload`. The queue's end (`openStage`) deletes it too, and between the start and the end no decision (its only reader) can run. The line is kept as defence and noted in §8.

## Files changed (2f only, compared with the snapshot taken at the start)
Core (all additive, for G1):
- /home/zhengyew/telelean/packages/core/src/actions.ts: `ArrowProvenance`; `HistoryEntry.arrows?`.
- /home/zhengyew/telelean/packages/core/src/run.ts: `AttemptResolution.arrows?`.
- /home/zhengyew/telelean/packages/core/src/proposal/sidecars.ts: the resolution codec writes and reads `arrows` (lenient read, fixed key order).
- /home/zhengyew/telelean/packages/core/src/review/texts.ts: `arrowsFromClaude` and `arrowFromClaude`.
- /home/zhengyew/telelean/packages/core/src/project/index.ts: exports `anonymousInstanceName`.
- /home/zhengyew/telelean/packages/core/test/proposal/codecs.test.ts: +1 test.

Runner source:
- /home/zhengyew/telelean/packages/runner/src/run/premises.ts (new): `PremiseRunner`. Premise writes and completions that are due, their recovery, taking a write back out, write problems.
- /home/zhengyew/telelean/packages/runner/src/run/sessionEnd.ts (new): `EndRunner`. Final check, Apply, Back to review, Exit (with a double-Exit guard), drift watcher, moves, endorsements and layout sidecars, provenance, recovery of an interrupted Apply.
- /home/zhengyew/telelean/packages/runner/src/run/session.ts:
  - the R1-1 text;
  - anonymous instances named;
  - hooks for the view's problems and endorsements;
  - recovery enqueues the writes still due;
  - per-step arrows on the attempt records.
- /home/zhengyew/telelean/packages/runner/src/run/review.ts:
  - `DECIDED_DID_NOT_PASS`;
  - move positions with Undo and Redo;
  - exported `confirmationCheckId`;
  - the after-write hook;
  - Submit posts its view again;
  - `carryOut` refuses once an Exit has ended the run.
- /home/zhengyew/telelean/packages/runner/src/run/manager.ts:
  - now extends `EndRunner`;
  - `end()` and `moveProposed` added;
  - the D-21 rebase block and the `accept-base`/`rebase` writers deleted;
  - `dispose` stops the drift watcher.
- /home/zhengyew/telelean/packages/runner/src/run/step.ts: `applyBackstop` in the core defaults; new `SessionRuntime` fields.
- /home/zhengyew/telelean/packages/runner/src/run/types.ts: `RunCore.applyBackstop`; docs for `end` and `moveProposed`.
- /home/zhengyew/telelean/packages/runner/src/gate/engine.ts: the final check returns the model it judged.
- /home/zhengyew/telelean/packages/runner/src/gate/types.ts: `FinalCheckReport.model?`.
- /home/zhengyew/telelean/packages/runner/src/proposal/types.ts: `AcceptPlan.arrows?`.
- /home/zhengyew/telelean/packages/runner/src/proposal/service.ts: `apply` passes the arrows on.
- /home/zhengyew/telelean/packages/runner/src/workspace/files.ts: endorsements paths; `isSubjectSidecarFile` now covers `endorsements.json`.
- /home/zhengyew/telelean/packages/runner/src/workspace/types.ts: `ExternalChangeSet` gains `arrows` and may carry the subject's two sidecars.
- /home/zhengyew/telelean/packages/runner/src/workspace/history.ts: writes and parses `Telelean-Arrow:` trailers.
- /home/zhengyew/telelean/packages/runner/src/workspace/modelWorkspace.ts:
  - reads `endorsements.json` on load, when it changes, and after an Apply or its Undo, and passes it to `buildProjectModel`;
  - `applyChanges` accepts the subject's two sidecars;
  - the snapshot carries the arrows.
- `proposal/sidecarStore.ts` needed no change: it already writes resolutions through core's codec.

Runner tests:
- /home/zhengyew/telelean/packages/runner/test/run/session.premises.test.ts (new, 21 tests).
- /home/zhengyew/telelean/packages/runner/test/run/session.end.test.ts (new, 33 tests).
- /home/zhengyew/telelean/packages/runner/test/workspace/sessionApply.test.ts (new, 6 tests).
- /home/zhengyew/telelean/packages/runner/test/run/helpers/premises.ts (new) and /home/zhengyew/telelean/packages/runner/test/run/helpers/apply.ts (new).
- /home/zhengyew/telelean/packages/runner/test/run/helpers/fakeEngine.ts: `fakeFinalCheck`, `fakeWritePremise`, `fakeComplete`.
- /home/zhengyew/telelean/packages/runner/test/run/helpers/fakeServices.ts: the real `planApply`, `applyRequests`, change listeners.
- /home/zhengyew/telelean/packages/runner/test/run/session.review.test.ts: R1-1 assertions; R1-2a and R1-2b tests.
- /home/zhengyew/telelean/packages/runner/test/run/session.queue.test.ts: the D2-62 test updated.
- /home/zhengyew/telelean/packages/runner/test/proposal/sidecars.test.ts: +1 test (`arrows` through the real codecs).
- /home/zhengyew/telelean/packages/runner/test/workspace/m2members.test.ts: the refused path is now `decisions.json`.
- Moved tests rewritten: manager.accept.test.ts, manager.rounds.test.ts, walkthrough.e2e.test.ts, fresh.e2e.test.ts and /home/zhengyew/telelean/packages/runner/test/integration/m2flow.test.ts.

Extension:
- /home/zhengyew/telelean/packages/extension/src/logic/boardSession.ts:
  - `endSession` with exit skips the run queue (AF14);
  - `endSession` and `moveProposed` are routed;
  - Apply's toast offers Undo.
- /home/zhengyew/telelean/packages/extension/src/logic/runs.ts: `endSession`'s success notice.
- /home/zhengyew/telelean/packages/extension/test/unit/runRouting.test.ts: routing test updated; +2 tests.

Webview:
- /home/zhengyew/telelean/packages/webview/src/header/HistoryMenu.tsx: the "Arrows from Claude" block.
- /home/zhengyew/telelean/packages/webview/src/model/format.ts: `historyArrowLines`.
- /home/zhengyew/telelean/packages/webview/src/styles/board.css: the block's styles.
- /home/zhengyew/telelean/packages/webview/test/unit/format.test.ts: +1 test.
- /home/zhengyew/telelean/packages/webview/test/e2e/m1-header.spec.ts: +1 Playwright test.

Docs:
- /home/zhengyew/telelean/docs/slice2-plan.md: the §8 entry.

## Tests
**Added**
- `session.premises` (21):
  - as an axiom; as pending (A26); hidden while the results are hidden; a second premise unused;
  - a failed completion and Retry step; a meaning mismatch;
  - a failed probe and a Lean failure (AP30-4);
  - crashes before step 1, after step 4, and mid-write;
  - an Accept undone while its write is queued;
  - Undo, Redo, back to review, Reject and the Undo of a Reject (AF2); the mark;
  - Submit waits for a premise write (AF3);
  - "no longer closes the gap"; `factsMissing`;
  - a failed completion is not retried by a reload;
  - a Reject of T's Result is not completed again after a reload.
- `session.end` (33):
  - Apply: one `applyChanges`, only at Apply; the sidecars, new and merged into existing entries; an empty Apply; Back to review.
  - Checks: a stale check id; Apply while the check runs, and after it failed; the backstop on every Apply; EN-2 reuse; an unwritten premise is refused; `content-changed`.
  - Drift: debounced; between the check and Apply; during a step.
  - Exit: in a stage; during a step; in the confirmation; two Exits at once; while Apply waits or reads the drift; while Back or a decision waits.
  - Provenance: one step; two steps, each record holding only its own arrows.
  - Moves; a reload in the confirmation and during Apply (F, B, anything else, a running check).
  - Guards: a status change; Back while the check runs; an earlier confirmation's outcome is dropped; Exit while applying.
  - The anonymous helper instance.
- `sessionApply` (6).
- `runner/proposal/sidecars` +1; core `codecs` +1; webview `format` +1; Playwright `m1-header` +1; extension `runRouting` +2.

**Updated:** `session.review` (R1-1), `session.queue` (D2-62: Exit is no longer `not-yet`), `m2members`, the `runRouting` routing test.

**Moved to 2f: all 26 placeholders handled. 25 were rewritten as sessions that run to their Apply and un-skipped; 1 was deleted.**
- `manager.accept` (8):
  - without drift;
  - an Apply that changes no file;
  - a stale check id, with a definition as an item;
  - with drift (ES-7);
  - ES-7 with the real drift check;
  - a hand edit between the drift check and `planApply`'s read;
  - the drift refusal's file list;
  - a refused apply.
- `manager.rounds` (2): a checked suggestion is a draft whose Accept writes it, and telelean completes the target; a premise write the engine refuses is taken back out and the Accept is kept.
- `walkthrough.e2e` (3): (a) normative; (b) literal with an Add premise; the definition-belief cheat.
- `fresh.e2e` (9): (a)–(h) as sessions; (i) as a two-target Formalize, because B.4 refuses a second target in one step.
- `m2flow` (3): (a), (b), (c).
- **Deleted:** `manager.accept` "a failed re-gate cannot happen after drift any more" (the D-21 re-gate is gone).

**Skipped for later:** none from 2f. `manager.lifecycle`'s single "moves to 2h" placeholder remains.

## Verification
Every command ran from the package directory, with:
- `S=/tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad`
- every vitest command also prefixed with `TMPDIR=$S/b2f/tmp TELELEAN_TEST_TMP=$S/b2f/testtmp TELELEAN_NO_REAL_CLAUDE=1`

**Type checks**
- `timeout 900 $S/capped.sh 1800 /home/zhengyew/telelean/node_modules/.bin/tsc --noEmit -p <config>`, exit 0 in every case:
  - core `tsconfig.test.json`;
  - runner `tsconfig.test.json` (run last after the final change);
  - webview `tsconfig.json` and `tsconfig.node.json` (the latter re-run after the spec change);
  - extension `tsconfig.json`, re-run after the last runner change because it compiles the runner's sources.

**Unit tests**: `timeout 900 $S/capped.sh 1800 …/vitest run --maxWorkers=1 --no-cache --fsModuleCachePath=$S/b2f/fsmc`

| Package | Summary line |
|---|---|
| core | "Test Files 76 passed (76) / Tests 1134 passed (1134)" |
| webview | "Test Files 19 passed (19) / Tests 315 passed (315)" |
| extension, final run | "Test Files 22 passed (22) / Tests 219 passed (219)" |

**Runner with the fakes**: the same command plus `test/run/session.*.test.ts test/run/manager.*.test.ts test/run/prompts.test.ts test/proposal/ test/workspace/`, final run: "Test Files 37 passed (37) / Tests 426 passed | 1 skipped (427)". The skip is the 2h placeholder.

**Runner with real Lean** (`capped.sh 3000`, timeout 900 each, run one after another by $S/b2f/v_lean.sh; all after the last source change):

| Files | Summary line |
|---|---|
| `test/gate/session.test.ts` | 27 passed (27) |
| `test/gate/engine`, `sessionPure`, `pure`, `rules` | Test Files 4 passed (4) / Tests 95 passed (95) |
| `test/integration/session.test.ts` | 8 passed (8) |
| `test/integration/m2flow.test.ts` | 5 passed (5) |
| `fresh.e2e -t '\((a\|b\|c)\) '` | 3 passed \| 6 skipped (9) |
| `fresh.e2e -t '\((d\|e\|f\|g)\) '` | 4 passed \| 5 skipped (9) |
| `fresh.e2e -t '\((h\|i)\) '` | 2 passed \| 7 skipped (9) |
| `test/run/walkthrough.e2e.test.ts` | 24 passed (24), 763.85 s |
| `test/integration/escapes.test.ts fixes.test.ts` | Test Files 2 passed (2) / Tests 6 passed (6) |

An earlier walkthrough run, before the last Exit guards, also gave 24 passed; it is superseded by the run above.

**Webview scratch build and Playwright**
- Build: `TELELEAN_WEBVIEW_OUT=$S/b2f/webview-out TMPDIR=$S/b2f/tmp timeout 900 $S/capped.sh 1800 …/vite build` gave "✓ built in 1.06s". The `dist` webview.js modification time is unchanged and `git status` is clean for `dist`/`out`.
- Playwright: `TELELEAN_WEBVIEW_OUT=$S/b2f/webview-out TELELEAN_TEST_RESULTS=$S/b2f/pw-results timeout 900 $S/capped.sh 3000 sh -c 'ulimit -c 0; …/playwright test test/e2e/m1-header.spec.ts'` gave "5 passed (20.9s)". The home guard reported the real home "unchanged".
- `packages/webview/test-results` was moved to $S/b2f/webview-test-results-m1header.
- Screenshot of the History block: $S/b2f/pw-results/s2f-history-arrows.png.

MemAvailable never dropped below 38 GB.

## Mutation checks
There were 90 mutants in 96 runs. Every file was restored and `cmp`-checked identical. 86 mutants are caught and 4 are equivalent. Logs: $S/b2f/mutations.log, mutations2.log, mutations3.log, mutations_carry.log. Each line below gives file:line (current code), what was broken, and the test that failed.

**Premises** (`premises.ts`)
- P2 :146: ledger entry and card no longer mean "written". Caught by "a crash after the premise write's step 4…".
- P4 :162: the completion-not-checked marker ignored. Caught by "a failed completion is not tried again by itself…".
- P5 :163: a proved T still completed. Caught by "a second premise for a proved T … unused premise".
- P6 :161: the completion entry ignored. It survived first; after the new test it is caught by "a Reject of T's Result … not made again".
- P7 :202: nothing enqueued after the Accept. Caught by "as an axiom…".
- P8 :290: hold-as forced to axiom. Caught by "accepted as pending, with a crash…".
- P9 :288: the Why dropped. Caught by the same test.
- P10 :299: no `mark-removed` entry. Caught by "accepting a premise of a target whose question is its mark…".
- P11 :351: the draft key kept as the accepted key. Caught by "as an axiom…".
- P12 :349: the draft key not kept in versions. Caught by "as an axiom…".
- P13 :353: no unused-premise marker. Caught by "a second premise…".
- P14 :324: a meaning mismatch accepted. Caught by "a meaning mismatch where it was written…".
- P15 :339: a partial key recorded. Caught by "…(facts missing) is taken back out".
- P16 :269: a failed write not taken back out. Caught by "a judgement whose probe failed…".
- P17 :268: no stage problem for a failed write. Caught by "a Lean environment failure is the same…".
- P18 :253: problems not filtered by the records. Caught by the same test.
- P19a :445 (no marker), P19b :469 (no Retry step), P19c :471 (no heading), P19d :475 (not taken back out). Caught by "a failed completion is taken back out…".
- P20 :120: the completion text lacks the premise. Caught by "as an axiom…".
- P21 :211: recovery enqueues nothing. Caught by "a crash after … step 4…".
- P22 :232: no judge after a premise job. Caught by "as an axiom…".
- P23 :218: no re-post after a premise job. Caught by "an Accept undone while its premise write still waits…".
- P24 :230: no completion after the write. Caught by "as an axiom…".
- P25 :215: the premise job taken off the write queue. Caught by "Submit review waits while a premise write runs…".

**End of session** (`sessionEnd.ts`)
- E1 :372: a stale check id accepted. Caught by "a stale check id is refused…".
- E2 :373: Apply allowed while the check runs. It survived first; the test was tightened (no second check may start), and it is now caught by "Apply waits while the check runs…".
- E3 :374: Apply after a failed check. Caught by the same test.
- E4 :393: the check id not recomputed. Caught by "a status or ws/ change since the check…".
- E5 :404: no drift read at Apply. Caught by "a change of the person's files sets the drift…".
- E6 :408: no backstop. Caught by "the backstop runs again on every Apply…".
- E7 :448: an empty Apply applies. Caught by "nothing accepted…".
- E8 :477: no endorsements. Caught by "with an accepted definition and a moved card…".
- E9 :479: no layout. Caught by the same test.
- E10 :484: no arrows in the history entry. Caught by "an Apply with two accepted Claude arrows…".
- E11 :496: no arrows on the attempt record. Caught by the same test.
- E12 :306: a declined arrow listed. Caught by the same test.
- E13 :471: `planApply`'s refusal leaves the session in `applying`. Caught by "files changing between the check and Apply…".
- E14 :555: reload with the real files equal to F. Caught by "the real files equal F…".
- E15 :291: Exit records no attempt for the running step. Caught by "stops a running step…".
- E16 :259: Exit while applying. Re-run on the final code and caught by "Exit is refused while Apply writes the files".
- E17 :237: Back keeps the confirmation. Caught by "Back to review returns to the submitted stage…".
- E18 :185: a stale check outcome recorded. It survived first; it is now caught by the new test "the outcome of an earlier confirmation's check is dropped…". The variant E18c (the check-id condition only) is caught by the same test.
- E19 :133: drift's first-seen time not kept. Caught by "a change of the person's files…".
- E20 :517: an axiom card moved. Caught by "a move is one session-stack step…".
- E21 :84: no drift watcher. Caught by "a change of the person's files…".
- E22 :533: no check again after a reload. Caught by "a confirmation whose check was running comes back…".
- E23 :177: no EN-2 reuse. Caught by "EN-2: the next check gets the comparator passes…".
- E24 :189: an environment failure passes. Caught by "Apply waits while the check runs…".
- E25 :561: a reload equal to B is read as drift. Caught by "the real files equal B…".
- E26 :564: no notice for other files. Caught by "anything else: a notice…".
- E28 :293: Exit resolves the attempts as accepted. Caught by "in a stage: no model file is written…".
- E29 :261: a second concurrent Exit allowed. Caught by "two Exits at once…".
- E31 :422: Apply writes after an Exit during its reads. Caught by "an Exit that comes in while Apply reads the drift…".
- E32 :231: Back after an Exit. Caught by "an Exit while Back to review, or a decision, waits…".
- E33 :338: the same name endorsed twice. Caught by "the sidecars merge into what the files hold…".
- E34 :338: the file's other endorsements dropped. Caught by the same test.
- E35 :352: the layout's other positions dropped. Caught by the same test.

**Review, session, workspace**
- E27 session.ts:2155: every step's record gets every arrow. Caught by "two steps, each with an accepted arrow of its own…".
- V1 review.ts:303: a move sets no position. Caught by "a move is one session-stack step…".
- V2 review.ts:216: a move's `before` not read in the queue. Caught by the same test.
- V3 review.ts:601: Submit does not re-post. Caught by "Apply waits while the check runs…".
- V4 review.ts:212: a decision runs after an Exit. Caught by "an Exit while Back to review, or a decision, waits…".
- S1 session.ts:203: anonymous instances get no `created` entry. Caught by "a step's new anonymous instance of a presupposition…".
- S2 session.ts:484: the view gets no runner problems. Caught by "a Lean environment failure…".
- S3 session.ts:1994: the recovery hook not called. Caught by "a crash after … step 4…".
- W1 modelWorkspace.ts:995: the sidecars refused. Caught by "Apply's change set with the two sidecars…".
- W2 :995: any subject's sidecars accepted. Caught by "applyChanges still refuses every other file…".
- W3 :785: the build gets no endorsements. Caught by "Apply's change set…".
- W4 :679: a changed endorsements.json not read again. Caught by "Apply's change set…".
- W5 :587: endorsements not read on load. Caught by "a fresh workspace reads the endorsements on load".
- W6 files.ts:171: `endorsements.json` outside the subject's snapshots. Caught by "Apply's change set…".
- W7 history.ts:488: no trailers written. Caught by "Apply's change set…" and "…trailers round-trip".
- W8 modelWorkspace.ts:1073: the snapshot gets no arrows. Caught by "Apply's change set…".

**Host, core, webview**
- H1 boardSession.ts:261: Exit queued. Caught by "AF14 (2f): endSession with exit is not queued…".
- H2 :424: `endSession` not routed. Caught by the same test.
- H3 :428: `moveProposed` not routed. Caught by "slice 2e: the review actions reach the RunManager…".
- H4 :523: no Undo on Apply's toast. Caught by "slice 2f: an Apply's success is a toast with Undo…".
- C1 core sidecars.ts:149: the codec drops arrows. Caught by core "slice 2f (G1): … round trip"; C1b also caught by runner sidecars "… go on its line".
- C2 :102: a malformed arrow kept. Caught by the core codec test.
- C3 texts.ts:397: the step id shown instead of its number. Caught by webview "one line per arrow Claude proposed…".

**Carry-overs**
- c1 session.ts:1803, R1-1: caught by "…headed "did not pass"…".
- c2 session.ts:1733, R1-2a: caught by "…the judgement is kept (2e review R1-2a)".
- c3 session.ts:1733, R1-2b: caught by "…leaves the stage judgement alone (2e review R1-2b)".

**Equivalent (kept as defence, noted in §8)**
- P1 premises.ts:146, `premiseDue`'s `accepted` check: core's reducer deletes `accepted` whenever an item leaves it, so the write's `holdAs` guard refuses first and nothing is shown.
- P3 premises.ts:143, the phase check: jobs run in the write queue ahead of any phase change, and recovery enqueues only in the `stage` phase.
- E30 sessionEnd.ts:379, Apply's first "run ended" check: the second check, at :422, refuses the same.
- c4 session.ts:1499, R1-2(c).

## Decisions for the orchestrator to log (also in §8)
1. **G1 needs additive core changes**, though §1.1 planned 2f with no core file: `ArrowProvenance`, `HistoryEntry.arrows?`, `AttemptResolution.arrows?`, the codec, two texts, and the `anonymousInstanceName` export. Alternative: a runner-only record, which History could not show.
2. **Where provenance lives:** each step's resolution carries only that step's arrows; the history entry carries all of them as `Telelean-Arrow:` commit trailers. An arrow's step is its ledger entry's step; a premise's step is its draft's step, and its source is the written card. Alternative: one list on every record, or History joining with `attempts.jsonl`.
3. **The premise write:** one write-queue slot per accepted premise, holding the write and then the completion. Step 4 records the written key as `fingerprint` and `accepted.fingerprint`, keeps the draft key in `versions`, and leaves `judged` to the judge that follows. Alternative: store writePremise's judgement, which has no facts.
4. **Unused and due:**
   - A premise is "unused" when T is a theorem `.holds` at the write's parent.
   - A completion is due when the premise is written, T has no theorem `.holds`, there is no `completion` entry, and there is no `completion-not-checked` marker.
   - Alternative: read both from the stage judgement, which lags a write.
5. **The completion text:** `theorem T.holds : T := (proof) P.holds`, placed by LeanOps (`add-holds-axiom`, then `replace-decl`). Alternative: a raw text insert.
6. **A failed completion:**
   - It is taken back out with a `revert` commit and marked `completion-not-checked`.
   - An event carries Lean's message.
   - A placeholder `submit` step (state `not-run`, `openProof`) goes into `retry`.
   - The stage gets a heading only when it has none.
   - It is never retried by itself.
   - Alternative: a stage problem carrying the message.
7. **A write that could not be made (AP30-4):** a Lean failure or a `factsMissing` judgement takes the write back out and keeps the Accept. The problem is kept in memory only, and the write stays due until a reload. Alternative: persist the problem.
8. **A meaning mismatch** sends the item back to review, marked `meaning-differs-in-place`; its dependents follow at the next judge (RV-5). Alternative: a runner cascade.
9. **`mark-removed`** is written only when this write removed the mark. Alternative: write one with every premise write.
10. **The final check:**
    - Drift is not a check failure.
    - An environment error or a thrown check becomes a `build` failure.
    - Its outcome is recorded only for the same check id while that check is `running`.
    - `rt.final` and the comparator passes stay in memory; after a reload the check runs again.
    - Alternative: persist them, or add a `drift` failure.
11. **Apply's order**, inside `asLastWrite`:
    1. The gate.
    2. The check id, recomputed.
    3. The check's model at hand.
    4. Drift.
    5. The backstop.
    6. "Run still live", checked again with no await.
    7. Phase `applying`.
    8. `planApply`.
    9. The sidecars.
    10. Apply with the arrows.
    11. The records, and the run ends `accepted`.

    An empty Apply makes no `planApply` or `apply` call. Alternative: drift first (only changes which refusal shows); for the empty Apply, an empty change set.
12. **The sidecars:**
    - Endorsements cover every declaration of an accepted definition, instance, coercion or presupposition item, using the hash of F's vocabulary code, merged by name.
    - The layout covers the moved propositions of the subject, merged into the file's positions.
    - Each sidecar is written only when its text changes.
    - Alternative: endorse definitions only.
13. **Moves:**
    - Only the subject's propositions may move, with finite coordinates.
    - `before` is read inside the queue.
    - Undo applies `before` and Redo `after`.
    - Exit drops them.
    - Alternative: let axioms move too.
14. **Exit:**
    - It is not exclusive and is refused only while Apply writes.
    - It closes a running step as `cancelled`.
    - A second concurrent Exit answers "The session is already ending."
    - Apply, Back or a review action that waited in the queue answers "This run has ended." (this guard in `review.ts` `carryOut` changes 2e's code).
    - Alternative: Exit waits for the round loop.
15. **A reload during Apply:**
    - files equal F: the session finishes as applied;
    - files equal B: back to the confirmation, whose check runs again;
    - anything else: a notice, the drift recorded, back to the confirmation.

    Alternative: apply F again.
16. **The drift watcher** subscribes to `onDidChange`, debounced 300 ms, reads through the queue, keeps the first-seen time, and posts the view again. Alternative: the host calls in.
17. **Endorsements for the hidden board** are read once per session; the shown board stays the engine's (a residual for 2g/2h). Alternative: re-read at every judge.
18. **The `declarationNames` fix** names anonymous instances. Found with real Lean: `Demo.instNonemptyBeing` was refused as unowned. Alternative: exempt anonymous instances from ownership.
19. **Views:** Submit posts its view again, and so do premise jobs, the final check and drift once the queue is idle. Alternative: leave `judging` showing.
20. **The host:** Exit skips the run queue; Apply's toast carries Undo. Alternative: queue Exit too, which AF14 rules out.
21. **D-21:** deleted, as §1.1 requires.
22. **Moved-test rewrites:** fresh (i) became a two-target Formalize; the re-gate test was deleted. Alternative: none that keeps B.4.
23. **R1-1:** a runner text for the heading. Alternative: keep the step prefix.
24. **R1-2(c):** kept as defence. Alternative: delete the line.

Runner texts added that are not in core (full list in §8):
- `END_TEXTS`: exited, recorded, noConfirmation, driftUnknown, checkCouldNotRun, reloadedDuringApply, exiting;
- `PREMISE_MEANING_EVENT`, `completionFailedEvent`, `completionFailedHeading`;
- the write-problem texts, the commit labels, the move refusals, and "This run has ended.".

## Effects outside the repo and the scratch dir
- `capped.sh` ran each job in a transient `systemd-run --user` scope; each scope ended with its job and none is left.
- Playwright's Chrome used an isolated HOME/XDG in `/tmp/tl-pw-chrome-*`, created and deleted by the spec's teardown; the home guard reported the real home unchanged.
- The Lean toolchain in `~/.elan` was executed, read-only. Builds wrote only under `$S/b2f/testtmp`.
- No network, no installs, no git state changes, no writes to `dist`/`out`/`test-fixtures`. None of my processes are left running.
- The harness writes its own tool-result files under `~/.claude/projects`; my commands did not.
- The other `lean` processes visible in `ps` (spectec, vbrainheck) are the user's own and were not touched.

## Not run / caveats
- No Playwright spec other than `m1-header`.
- No runner files outside those listed: `backend`, `quotaTripwire`, `smokeScript`, `walkthroughScript`, `llm`, `shadow`, `lean` and `semantic` were not run; 2f does not touch them.
- The full runner suite is left to the integrator.
