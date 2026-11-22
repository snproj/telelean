# verify:2e:fc

Agent `a047ed4de8e4b2a53` of workflow `wf_bee8fde1-76d`. Verbatim output (JSON alongside).

- **summary:** Sub-slice 2e is faithful to the plan and the autopilot decisions, and I found no blocker or major problem. The tree typechecks and the touched test files pass. All five carry-overs (R1-1 to R1-5) are fixed in code and in tests. I report three minor findings. Two are fail-closed gaps in the new "did not pass" and judge-failure handling. One is an unhandled step-4 persist failure in Submit's take-out. I did not rerun the builder's mutation checks; I checked the plan's §6.1 test list by reading the new tests.

What I checked:
- **Scope and contracts:** I diffed 2d's tree against the current tree for `review.ts`, `session.ts`, `manager.ts`, `prompts.ts`, `types.ts`, `proposal/files.ts` and the host's `boardSession.ts` and `runs.ts`. Core, webview and `test-fixtures` are byte-identical to 2d. The only contract change is the additive `submit` field on the `queue-start` write, recorded in §8.
- **Plan §3.6 and §3.7:**
  - D2-62 refusals: decisions are refused while a step runs, outside a stage, for a stale stage, with no judgement, and while the view cannot be built.
  - Reject, Shaky and un-reject: one `decision` commit per action; the un-reject uses the inverse merge and is refused on a conflict.
  - AF3: Submit and the queue starts run as the write queue's last write and re-check inside the queue.
  - Submit: the take-out goes first (D2-57); the end confirmation seals nothing; the golden feedback turn; a partly accepted cycle is refused.
  - Raw diff and recovery: the raw diff asks for `confirmed` while the results are hidden and then counts as Show results. A `decide` or `submit-take-out` write found in flight is either made again fully or not made.
- **Spec safety properties:**
  - The user's decisions are never lost on a crash: each of the four writes of a decision is crash-tested.
  - Declining and Shaky decisions stay in the user's hands; the Undo of a Reject restores the user's own earlier Accept and the next judge re-classifies it (RV-7), and Submit and Apply wait for that judge.
  - Hidden results stay hidden: the diff and Show results rules are tested, and the AF5/AF7 twin tests check that the views are identical.
- **§6.1 test list:** every item has a test, including both of 2d's moved tests, now un-skipped. Skips left in the runner are all the 27 "moves to 2f/2h" placeholders; none say 2e.

I found no bugs in the carry-over fixes; the findings below are all about 2e's new code.
- **findings:**
  - [1]
    - **id:** FC-1
    - **severity:** minor
    - **where:** packages/runner/src/run/session.ts:1731-1735 (judgeApply, `options.decided` heading) and :1927-1937 (recoverSession's `judgeOptions ??= {}` for a stage whose head is past `judged.commit`)
    - **problem:** The "did not pass" heading set by a decision's judge is never lifted. After the user's later decision makes the state pass again (for example, Rejecting the accepted item that broke it), the heading stays: "Claude's step did not pass: the working copy with your decisions does not pass its checks". The reducer then refuses every Accept with `acceptDidNotPass`. With items still in review, Submit is refused too, so only Exit remains. This is a stale, misleading heading, though it fails closed. The builder chose this on purpose (decision 4) and named a "lift it" alternative, but the cost is not covered by any test. The existing test at session.review.test.ts:841 only covers the failing case. The reload path has a related gap. A decision whose judge had not ended when the window closed is re-judged with `{}` instead of `{ decided: true }`, so a reload that finds a failing state sets no heading.
    - **fix:** In judgeApply, when `options.decided === true`, the state is now `ok`, `next.heading?.kind === 'did-not-pass'`, and the current queue has no cancelled or failed step (so the heading is not ES-4's own), delete `next.heading`. A cancelled or failed step's heading and its Retry stay. In recoverSession, pass `{ decided: true }` when the stage's head is past `judged.commit` and `decidedSinceSeal(now)` is true. Add a test in session.review: Reject the accepted item that broke the state, then check that the heading is gone and Accept works again.
    - **evidence:** Code reading: `openStage` at session.ts:1700-1717 is the only place that deletes `s.heading`, and it runs only at a queue's end. grep for did-not-pass in runner/src shows no other deletion. The test at session.review.test.ts:841-855 has no step where the state passes again.
  - [2]
    - **id:** FC-2
    - **severity:** minor
    - **where:** packages/runner/src/run/session.ts:1652-1659 (judgeLoop, catch of `engine.judge`)
    - **problem:** When `engine.judge` throws for a judge a decision started (not a queue's end), nothing is cleared. `rt.judgement` and `s.judged` keep the previous commit's values, while `s.head` has moved past them. Only the queue-end case calls `openStageWithoutJudgement`, which is the A-F4 fail-closed handling. The user's further decisions and Submit then read a judgement of an older head. The queue-start or the final check judges the head anyway, so no unjudged state is applied, but the plan's "no check of the working copy to decide on" fail-closed behaviour is not used here. No test covers a decided judge that throws; session.review.test.ts:878 covers only a queue-end judge that throws.
    - **fix:** In the catch branch, when the head is past `s.judged.commit` and the phase is `stage`, set `rt.judgement = null`, `rt.judgedModel = undefined` and `delete s.judged`, save, and return. Reviews then answer `NO_JUDGEMENT`, and a reload re-judges through recovery. Add a test where `h.engine.onJudge` throws after a decision and the next `decide` and `submit` answer `NO_JUDGEMENT`.
    - **evidence:** Code reading of the catch branch; the test list in session.review.test.ts, session.failclosed.test.ts and session.reload.test.ts has no decided-judge-throws case.
  - [3]
    - **id:** FC-3
    - **severity:** minor
    - **where:** packages/runner/src/run/review.ts:~745-748 (submitTakeOut, final `await this.persistStep4(run)`)
    - **problem:** carryOut catches a failure of its step 4 and answers `saveFailed`. submitTakeOut does not: `persistStep4` throws after `run.p.session = next` and `next.head = commit.id`. The exception passes through `asLastWrite` to `exclusive`, which answers `'submitting the review' failed: …` as `internal`. The in-memory session now holds the take-out, with its items to be redone, reverted and with the head moved, but no queue was started. A retry of Submit then plans from that state; a reload's recover() resolves it from run.json. It is not data loss, but the answer is wrong and the state in between is surprising.
    - **fix:** Wrap that call as in carryOut: on a throw return `refused('internal', REVIEW_TEXTS.saveFailed(errorText(e)))`, so the reply is consistent. The in-memory take-out is then like carryOut's step-4 failure, whose `moved: true` has no later queue, and a judge should follow (`requestJudge`) so the head is judged.
    - **evidence:** Code reading: review.ts submitTakeOut ends with an unguarded `await this.persistStep4(run); return okOutcome('taken out');`, while carryOut guards the same call.
- **checks_run:**
  - tsc --noEmit -p packages/core/tsconfig.test.json: rc=0, no output
  - tsc --noEmit -p packages/runner/tsconfig.test.json: rc=0, no output
  - tsc --noEmit -p packages/webview/tsconfig.json and tsconfig.node.json: rc=0, no output
  - tsc --noEmit -p packages/extension/tsconfig.json: rc=0, no output
  - vitest packages/extension (--no-cache): Test Files 22 passed (22), Tests 217 passed (217)
  - vitest runner session.review, session.submit, session.twins, proposal/inverseMerge, prompts: Test Files 5 passed (5), Tests 68 passed (68)
  - vitest runner session.reload, session.queue, session.failclosed: Test Files 3 passed (3), Tests 61 passed (61)
  - vitest runner manager.rounds, manager.accept, manager.happy: Test Files 3 passed (3), Tests 5 passed | 11 skipped (16); the skips are the "moves to 2f/2h" placeholders (27 across the runner suite, none say 2e)
  - diff -rq of tree_2d against the current tree for packages/core, packages/webview and test-fixtures: no differences, so core and webview vitest were not rerun
  - TELELEAN_NO_REAL_CLAUDE=1 and capped.sh used throughout; no real-Lean runs and no mutation reruns by me
