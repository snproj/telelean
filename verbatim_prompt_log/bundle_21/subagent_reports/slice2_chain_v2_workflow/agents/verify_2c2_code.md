# verify:2c2:code

Agent `ae75d533d204e25ab` of workflow `wf_ae5f1188-533`. Verbatim output (JSON alongside).

- **summary:** I found no build or test regression. Every typecheck and test count in the builder's report reproduces exactly, and the delta against after_slice_2c1.patch touches the same 8 files the report lists. R2-1 is done as described: the §4.7 residual, the §8 correction, the reworded message (no stale copy remains anywhere), §4.9's quote and the judge test. The view code reads correctly against §2.3 and §4.7. I spot-checked it with 41 mutations on a scratch copy of core: 31 failed at least one test. Two survivors are equivalent in practice and one is a duplicate. The other survivors show two test gaps (findings 2 and 3); the code itself is correct there.

Two findings are major:
1. **The builder's F1 is real.** I reproduced it through the real pipeline (judgeState, reconcile, buildSessionView): after a user's Show results, a mid-stage re-ask that proves its target hides the results, and one that does not leaves them shown, while a meaning item is still undecided. The 2c2 non-interference pair for a re-ask uses hand-made records that are hidden in both outcomes, so it cannot see this.
2. **The "while a step runs" test does not test what it claims for Claude's words, notes and reason chips.** Its fixture has no words, no step that gave up, no re-ask and no D2-59 action. Changing each guard from "shown and no step running" to "shown" leaves all 43 tests passing. These guards protect the ordinary mid-stage Formalize path: the queue's steps end one by one while the results stay shown.

Minor issues:
- No test lists a rejected Result while the results are hidden.
- Undo and Redo labels can name a hidden Result, and the Undo offered is then refused.
- `previous` appears on every written Add premise, though none was updated.
- At stage 0 the board relies on the runner passing B.
- One nit: §8 says the hidden summary never reads the envelope's status, but `semanticOf` does for sandbox statuses.

Effects outside my scratch dir: Vite briefly wrote and removed its bundled config in the `.vite-temp` folders of the root, core, webview and runner node_modules during my four in-repo vitest runs; all four are empty again. `.git/index` is unchanged, and `packages/extension/out` and `dist` are untouched. Nothing else in the repo was written. The probe test is at /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2c2-code/probe/f1.probe.ts and the mutation results are in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2c2-code/tools/mut_results.json and mut_results2.json.
- **checks_run:**
  - Diff isolation: snapdiff.sh -> /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2c2-code/now.diff (357 files), split per file against after_slice_2c1.patch: 8 files changed (docs/slice2-plan.md, review/reducer.ts, texts.ts, types.ts, view.ts, judge.test.ts, view.test.ts (new), extension runRouting.test.ts), matching the report; pre-2c2 versions rebuilt in scratch (HEAD + 2c1 chunk) and diffed (delta.diff)
  - capped.sh 1800 tsc --noEmit -p packages/core/tsconfig.test.json: exit 0, no errors (--extendedDiagnostics: 'Files: 527')
  - capped.sh 1800 tsc --noEmit -p packages/runner/tsconfig.test.json: exit 0, no output
  - capped.sh 1800 tsc --noEmit -p packages/webview/tsconfig.json: exit 0, no output
  - capped.sh 1800 tsc --noEmit -p packages/webview/tsconfig.node.json: exit 0, no output
  - capped.sh 1800 tsc --noEmit -p packages/extension/tsconfig.json: exit 0, no output
  - core: TMPDIR=<scratch>/tmp capped.sh 1800 vitest run --maxWorkers=1 --no-cache --fsModuleCachePath=<scratch>/fsmc -> 'Test Files  76 passed (76)', 'Tests  1115 passed (1115)'
  - webview: same flags -> 'Test Files  19 passed (19)', 'Tests  314 passed (314)'
  - extension: same flags (--no-cache) -> 'Test Files  22 passed (22)', 'Tests  205 passed (205)'; find out dist -newer marker: nothing
  - runner smoke (no runner file or symbol touched, checked by grep): TELELEAN_TEST_TMP=<scratch>/runner-tmp capped.sh 1800 timeout 900 vitest run --maxWorkers=1 --no-cache test/gate/pure.test.ts -> 'Test Files  1 passed (1)', 'Tests  14 passed (14)'
  - grep: no copy of the old R2-1 text ('Call freeze_statements, then finish again') left in packages/, test-fixtures/ or docs/; no .only/.skip in view.test.ts (43 tests)
  - Scratch probe (vitest, repo imported by absolute path; /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2c2-code/probe/f1.probe.ts): F1 through judgeState+reconcile+buildSessionView -> proved: {forced:null, shown:false, waitingFor:1}; not proved: {forced:show-result, shown:true, waitingFor:1}; Undo label probe -> hidden view undo {step:3,label:'Accept: Result “Cynder would not be a good addition…”'}, reduceReview undo refused 'The results are not shown yet: show them first.'; written-premise probe -> previous present with markers []
  - Mutation spot-checks on a scratch copy of core (<scratch>/mut/packages/core, restored and cmp-checked against the repo after each): 41 mutations, 31 caught; survivors: M8 (stale state while hidden, equivalent for judged states), M14 (equivalent: dependsOn of a hidden row is []), M10/M47 (chip guard), M41 (left-question note guard), M42 (re-ask note guard), M43 (report words guard), M46 (Result detail words guard), M15/M48 (rejected list over hidden Result rows)
  - Code reading: view.ts in full; reducer.ts acceptGateIn/itemGates against decline/backToReview/ownAcceptRefusal/mergedBackBy; reveal.ts, records.ts, submit.ts, mask.ts (maskFacts/maskedModel), reconcile.ts endsForce; host dispatchRun's not-yet cases; plan §1.1, §2.2, §2.3, §2.9, §3.1-3.12, §4.5-4.7, §5.3-5.13, §6.1 (2c2), §8 (fixer 2c1 r2, builder 2c2)
- **findings:**
  - [1]
    - **id:** V2C2-C1
    - **severity:** major
    - **where:** packages/core/src/review/reconcile.ts:434-441 (`endsForce`, 2a2's code); packages/core/test/review/view.test.ts:1318-1336 (the re-ask pair)
    - **problem:** The builder's F1 is real, and the §4.7 pair 'a re-ask proved or not' does not catch it. Show results' force (the user's, and telelean's `decided` one) ends at a queue's end only when a meaning item became undecided or a Result's content changed. A mid-stage re-ask that proves its target gives the Result new content, so the force ends and the results hide (a meaning item is still undecided). A re-ask that does not prove it leaves the Result unchanged, so the force stays and the results stay shown. So whether the stage is hidden tells the re-ask's outcome before the meaning items are decided (RV-6, D2-61). 2c2's pair builds hand-made records that are hidden in both outcomes, so it cannot see the difference. The builder reported F1 and left it unfixed; nothing in the tree addresses it.
    - **evidence:** Scratch probe (/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2c2-code/probe/f1.probe.ts). Stage 1 comes from judgeState+reconcile (Formalize in review, Result not proved). reduceReview reveal (show-result), then a seal. A re-ask step s2 for T (same question) is reconciled with queueSteps ['s2'] on PROVED vs STATEMENTS. Output: proved: {"forced":null,"shown":false,"waitingFor":1}; not proved: {"forced":{"via":"show-result",...},"shown":true,"waitingFor":1}.
    - **fix:** In reconcile, when `queueSteps` is given (a queue ends), drop any force before the reveal rule, then apply ADV-1's `decided` rule as now. The results are then hidden in both outcomes whenever a meaning item is undecided, and shown in both when none is. This changes 2a2's reconcile, so the orchestrator must route it. Add a pipeline twin to view.test.ts's non-interference block: a forced stage, a re-ask proved or not, byte-identical SessionView JSON (the probe above is a ready template). Until it is fixed, list it among §4.7's channels as open, not accepted.
  - [2]
    - **id:** V2C2-C2
    - **severity:** major
    - **where:** packages/core/test/review/view.test.ts:522-547 ('while a step runs … nothing outcome-like'); guards in packages/core/src/review/view.ts:829, 837, 1177, 1181, 1216
    - **problem:** The test's 'nothing outcome-like' checks are vacuous for Claude's words, the reason chips and telelean's notes. Its fixture (synth: forced shown, one passed step s1, no words, no D2-59 action, the record's question equal to s1's) gives no words, no chip and no note whether or not the step-running guard is there. During any queue started with the results shown (every mid-stage Formalize), records.steps change as each step ends, so `latestEnded` holds the running queue's ended steps. Without the `outcomes` guard (shown and no step running), the view would show mid-queue: that step's summary and gap (D2-10), its 'did not finish' chip, and a re-ask note claiming 'was not proved' even for a re-ask that proved (reconcile has not replaced the question yet). The code is right; the test would not notice if it broke.
    - **evidence:** Mutations on a scratch copy, each switching one consumer from `outcomes` to `shown`: M47 (view.ts:829, chip), M46 (837, Result-detail words), M41 (1177, left-question note), M42 (1181, re-ask note), M43 (1216, report words). Each leaves view.test.ts at 43/43 passed. The builder's per-consumer mutations (V23-V30) cover only 'while hidden'; only the combined V22 covers 'while a step runs'.
    - **fix:** Add a running-phase case: phase 'step', results shown. Records: an earlier passed step s1, a step s2 of the running queue that ended gave-up with words (summary, gap, assumedWithoutAsking, proposedNothing), another step still running, and s2's question different from the inference's. Put a decide action with a D2-59 question change in stack.done. Assert: report.steps carry no summary, proposedNothing or assumedWithoutAsking; the Result detail has no summary, gap or reasonChip; report.targets have no reasonChip; notes are []. Check that each of the five mutations above now fails.
  - [3]
    - **id:** V2C2-C3
    - **severity:** minor
    - **where:** packages/core/test/review/view.test.ts:263-307; packages/core/src/review/view.ts:1236
    - **problem:** No test has a rejected Result while the results are hidden. The 'left out of … Rejected in this session' test declines only a part (an arrow item); its Result is in review. If the rejected list iterated `ordered` (which holds the hidden Result rows) instead of `listed`, a Result rejected while shown would be listed after the results hid again, with its real rev and label (F10; RejectedView: 'Results … left out while the results are hidden'). No test would fail.
    - **evidence:** Mutation M48 (`for (const r of listed)` -> `for (const r of ordered)` at view.ts:1236) leaves view.test.ts at 43/43 passed. The builder's V09 used `records.items`, which also adds the declined hidden arrow item, so V09 failed for that reason only.
    - **fix:** Add a hidden case: a Formalize in review plus `result({ rev: 2, status: 'declined', decline: { option: 'reject', at } })` with a rejected earlier version. Assert view.rejected names no Result and the JSON holds neither the Result's rev nor its rejected version.
  - [4]
    - **id:** V2C2-C4
    - **severity:** minor
    - **where:** packages/core/src/review/view.ts:1281-1285 (undo/redo)
    - **problem:** `undo` and `redo` pass the stack action's label through whatever the reveal state. A decide action made while the results were shown can name a Result ('Accept: Result “…”'). If a judge then hides the results again without a new stack action (a meaning item returned to review by RV-7 or RV-5, e.g. after a coalesced judge), the hidden view offers an Undo whose label names a hidden Result. §4.7 says a hidden Result is never in an Undo label, and the reducer refuses that Undo (D2-8).
    - **evidence:** Probe: the Result accepted, the Formalize in review (hidden), stack.done top = {id 3, label 'Accept: Result “Cynder would not be a good addition to the new Spyro game”'}. buildSessionView gives undo {"step":3,"label":"Accept: Result “Cynder would not be…”"} while results.shown is false. reduceReview undo step 3 answers {code:'refused', error:'The results are not shown yet: show them first.'}.
    - **fix:** While !shown, give `undo: null` when the top decide action decided an item that is hidden now (decidedBy ∩ hidden), as the reducer refuses it anyway; likewise for `redo` with the top undone action. Alternatively keep the step with a label that names no item. Add a test.
  - [5]
    - **id:** V2C2-C5
    - **severity:** minor
    - **where:** packages/core/src/review/view.ts:1019-1021 (previousOf)
    - **problem:** `previousOf` takes `versions.at(-1)` whatever its rev. §3.8's premise write (2f) keeps the draft's key in `versions` at the same rev with no 'updated' marker. So every written Add premise will carry a `previous` detail identical to its own content, a 'Previous proposal' that was never proposed (§5.6: '"updated" opens "Previous proposal"').
    - **evidence:** Probe: an accepted written premise (card set, fingerprint 'written-key', versions [{rev 1, fingerprint 'draft-key'}], markers []) gets `previous: {kind:'add-premise', sentence:'Cynder is evil', …}`.
    - **fix:** Use the newest version with `rev < r.rev`, or give `previous` only with the 'updated' marker. Add a test with a written premise's same-rev version.
  - [6]
    - **id:** V2C2-C6
    - **severity:** minor
    - **where:** packages/core/src/review/view.ts:645-653 (board model); docs/slice2-plan.md §2.9 SessionViewInput.current
    - **problem:** With no judgement (the first queue, stage 0), no item exists, so `shown` is true and the board is `input.current` unmasked. Builder decision 11 relies on the runner passing B, but only §8 says so; §2.9's comment says current is 'the stage judgement's working copy … never ws/ while a queue runs', and at stage 0 there is none. If 2d passes anything but B (e.g. ws/), the first queue's board shows Claude's work in progress unmasked. The stage-0 test passes current: BASE, so it cannot tell.
    - **evidence:** view.ts: `const model = shown ? input.current : maskedModel(...)`; at stage 0 `resultsState` over [] gives shown true. view.test.ts:1200-1217 builds the stage-0 input with `current: BASE`.
    - **fix:** Fail closed: `const model = judgement === null ? input.base : shown ? input.current : maskedModel(...)`. Add to §2.9's comment that current is B before the first stage judgement. Add a test giving a different current with judgement null and asserting B's board.
  - [7]
    - **id:** V2C2-C7
    - **severity:** nit
    - **where:** packages/core/src/review/view.ts:401-402 (semanticOf); docs/slice2-plan.md §8 builder 2c2 (the board)
    - **problem:** §8 says the hidden summary's state reads 'only the masked facts … never the envelope's status'. But `semanticOf` first reads `SANDBOX_STATES[facts.status]`, and maskFacts keeps the working copy's envelope status. So for timeout, oom, cancelled, low-memory, could-not-start and unsupported-*, the envelope decides while hidden. A timeout can depend on hidden proof content, the duration channel §4.7 already accepts.
    - **evidence:** `const state = SANDBOX_STATES[facts.status] ?? (failed ? 'failed' : …)`; maskFacts returns `{ ...envelope, … }` with the working copy's status.
    - **fix:** Keep the behaviour (it is better than 'fresh' for a check that did not run) and amend §8's sentence to say the sandbox statuses are read from the envelope, under §4.7's duration residual.
