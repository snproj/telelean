# verify:2k1:adv

Agent `a57456f8708b50845` of workflow `wf_d1a89afd-8fd`. Verbatim output (JSON alongside).

- **summary:** I found no blocker or major defect in 2k1. I traced every candidate in the lens against the code and none held. I re-ran the three webview unit files (store-session, run, sessionBar) under capped.sh: 79 tests passed. I did not re-run the other suites; I judged the runner and extension tests by reading them and reasoning about the mutants. Four minor or nit points remain: two test gaps, a duplicated line on the board, and an unconfirmed assumption in the unrun VS Code scenario.

(a) Keeping an ended session or treating a live one as ended: nothing found.
- `RunManager.session()` (manager.ts:66-74) returns null only when `run.saved.view.state` is terminal. `saved` is set only by `persist` and `persistChecked` from the serialized text, so it turns even if the disk write fails.
- Every path that ends a session run goes through `endRun` (step.ts:1017), whose persist carries `session: true` (step.ts:1038). That covers Exit (sessionEnd.ts:294), Apply (finishApplied, sessionEnd.ts:498), `cancel` (manager.ts:184), `failRun`, and the recovery end (manager.ts:295 and session.ts:1961).
- `failStep` and a refused Apply (`backToConfirming`) never write a terminal state, so a live session is not treated as ended. Phase `applying` stays in run state `review`. The recovery tests assert `session(b).phase === 'confirming'`.
- If another persist lands between `v.state = state` (step.ts:1027) and the end's own persist, `session()` goes null with `session: false`. The later end persist still emits `session: true`, and the webview drops the view at once in `applyRun`. Both orders are safe.
- In the host, `publishRuns` (boardSession.ts:289-297) reads `session()` immediately before posting it, so a non-null view cannot be posted after the null one. The only consumer of `manager.session()` is boardSession.ts:296.
- Webview store: `receive` (state/session.ts:874-876) drops a view only when the store holds the same runId as terminal. A view for another run, or one with no run in the store, is kept.
- Webview selectors: the RunPanel and SessionBar selectors both require `s.run`, so no bar or panel is drawn without a run. `applyRun` (store.ts:1545) clears the view of an ended run. `receive(null)` clears the Exit dialog, overlay, Proposed view, selection and `sessionBusy`, and a late Exit result is handled by `result()`.
- Dismiss goes through `manager.dismiss`, which checks `run.view.state`. The runner test asserts the change includes `session`.

(b)-(f) and (h): out of this diff's scope. Nothing in the 19 changed files touches `ws/`, the Claude CLI sandbox, bwrap binds, `.gitignore`, history snapshots, model-root discovery, pruning, consent or the run storage layout. That is 2k2, and I did not trace it. Recovery of ended runs is unchanged: `recover()` (manager.ts:271) still reads only non-terminal runs.

(g) Hidden results: no new path found.
- The new texts are constants: `REVIEW_TEXTS.exited`, `applied`, `ENDED_TEXT.*`.
- `sessionRunView` (session.ts:597-600) still empties activity and notices unless the view shows results.
- `viewError` and a null view fail closed.
- The plain panel branch shows only what the session panel also showed: StatusLine, Target and AnsweredQuestions.

(i) Tests and real storage: the runner tests use makeHarness temp directories. The unrun VS Code scenario follows the existing scenarios' fixture, `files()`/`pristine` and `attemptsOf` patterns. It writes nothing new outside what they already do.

Tests judged by reasoning through the 13 mutants. Each key rule has a test that fails if its condition is dropped or inverted:
- `session()` null after each kind of end.
- The end's change naming the session (E1 and R3).
- `current()` keeping the end notice (R4).
- The store's two D3 rules.
- `runBadge`, `endedText` and the RunElsewhere ended check.
- The Exit button gone for an ended run (W7).
- `runId` equality in `receive`: the "view of another run is kept" test would fail if it were dropped.
- `phase` `confirming` after a recovery that did not finish Apply.

The gaps are in the findings below.
- **findings:**
  - [1]
    - **id:** F1
    - **severity:** nit
    - **where:** packages/webview/src/run/RunPanel.tsx Outcome (line ~351) with model/run.ts placeNotices (lines 326-337)
    - **problem:** After an Apply, or an Exit after Show results, the ended line is shown twice. It appears in `run-ended-text` and again as the last notice in the folded 'Earlier notices (n)' section, because the runner's notice has the same text as `REVIEW_TEXTS.applied` / `REVIEW_TEXTS.exited`. The builder's D2-102 only mentions this duplication for the alternative it rejected. It is folded, so the effect is cosmetic.
    - **evidence:** finishApplied adds the notice with `REVIEW_TEXTS.applied` (sessionEnd.ts:494). exitSession adds `REVIEW_TEXTS.exited` (sessionEnd.ts:293). A terminal run's notices all go to `later`, so the folded list holds the same text the Outcome prints.
    - **fix:** In the plain panel, filter out a notice whose text equals `endedText(run)`, or leave it. If left, say so in the plan's §8.
  - [2]
    - **id:** F2
    - **severity:** minor
    - **where:** packages/runner/test/run/session.end.test.ts, the existing Exit test 'stops a running step (Claude's process and the run's Lean jobs...)' (around line 475)
    - **problem:** The Exit path that closes a running step before `endRun` (sessionEnd.ts:290, `closeStep(... 'cancelled')`) is not asserted for the 2k1 rule. The new 2k1 describe only exits in a stage and in the confirmation. Nothing fails if `session()` stayed non-null after an Exit during a running step. That path goes through `closeStep` and `stopping` before the end write, and it is the Exit the user is most likely to press mid-work.
    - **evidence:** All `session()` null assertions are at lines 941-1050. The Exit-while-running test at ~475 has none.
    - **fix:** Add `expect(h.manager.session()).toBeNull()` and an `endOf(heard(h))` check, `{ change: {run: true, proposal: true, session: true}, state: 'discarded', session: null }`, to that test.
  - [3]
    - **id:** F3
    - **severity:** minor
    - **where:** packages/runner/src/run/manager.ts:72 (D2-101: `session()` reads `run.saved`, not `run.ended`)
    - **problem:** No test pins the choice D2-101 states. A mutant that reads `run.ended`, or `run.view.state`, instead of `run.saved.view.state` passes every 2k1 test, because those tests only look at the moment the end is heard. The difference is the window between `endRun`'s synchronous `v.state = state` and its persist. There `session()` would go null before `current()` and before the change event, and the board could briefly draw 'Preparing the review…'.
    - **evidence:** R1 and R4 mutate other conditions. The `heard()` helper samples only inside the emit, after `saved` is already terminal.
    - **fix:** Add a runner test that blocks `run.files.writeState` for the end's write, for example with a held promise in the harness. While it is blocked, assert that `session()` is still the live view and `current()` is not yet ended. After release, assert null and ended.
  - [4]
    - **id:** F4
    - **severity:** minor
    - **where:** packages/extension/test/suite/e2e-runs.test.ts, new scenario 'exit (2k1, D2-100)' (unrun)
    - **problem:** The scenario has never been run, and the helpers it uses (`startFormalize`, `selectQuestion`, `answerOnBoard`) have not been run since 2h. Two assertions assume details of that unrun harness. The first is the exact badge text 'Claude: discarded · Spyro', which depends on `runStateLabel` being 'Discarded' for a session run. The second is the attempts list `['proved','discarded']`, copied from the older scenario at line 625, which is itself skipped. If either is off, the scenario fails for a reason unrelated to the fix.
    - **evidence:** `runBadge` goes to `runBadgeText`, whose default case is `Claude: ${runStateLabel(run).toLowerCase()} · ${subject}`. The Playwright test covers that text on the board. Nothing runs the attempts assertion against a session run.
    - **fix:** The orchestrator should run this one scenario once after the rebuild (the builder could not). If the attempts assertion is wrong, relax it to check only that the last resolution is 'discarded'.
