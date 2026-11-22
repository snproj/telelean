# verify:2f:fc

Agent `a1d5690fd2b8ed9d5` of workflow `wf_bee8fde1-76d`. Verbatim output (JSON alongside).

- **summary:** Sub-slice 2f matches the brief, the plan's §3.8-§3.10 and its §6.1 tests. I found no blocker or major problem. Every typecheck exits 0, and the unit tests I re-ran pass (summary lines in checks_run). I did not re-run the builder's real-Lean files or the 90 mutation checks, so those rest on its report. The two carry-overs hold: R1-1 now has its own runner heading text, and R1-2 (a) and (b) have new tests that pass. R1-2 (c), the `decidedHeading` delete at a queue's start, is accepted as an equivalent mutant and recorded in §8. Four small findings remain: two minor, two nit. Spec safety properties checked in the code: Apply writes exactly F; endorsements cover only accepted declaration items; moves are limited to the subject's propositions. Nothing is applied without the check-id match and a passed final check, with drift and the backstop run again at Apply. Exit writes no model file and the attempt records are resolved 'discarded'.
- **findings:**
  - [1]
    - **id:** F1
    - **severity:** minor
    - **where:** packages/runner/src/run/premises.ts premiseWrite and completionWrite, the `if (run.ended) return 'failed'` guards after the Lean job
    - **problem:** Exit sets `run.stopping = true` and cancels the run's Lean jobs before `run.ended` becomes true. A premise write or completion in flight then sees the cancelled Lean job as an ordinary failure. The guard only checks `ended`, so it carries on. It records a write problem, or the 'completion-not-checked' marker, a Retry step and an event, and runs `takeBack` (a `revert` commit plus a run.json write), all in a session being discarded. These writes race Exit's `writeSessionAttempts` and `endRun`. The run.json object is shared, so the file stays consistent. The cost is spurious events and a revert on a shadow that Exit is closing, and Exit has no test with a premise job in flight.
    - **evidence:** exitSession sets stopping/abort/cancelLean before `endRun`. premiseWrite checks `if (run.ended) return 'failed'`, and completionWrite checks the same. `live()` is `!disposed && !ended && !stopping && run === this.run`.
    - **fix:** Use `if (!this.live(run)) return 'failed'` at both guards, and before the `completionFailed` / `takeBack` calls. Add one test: Exit while `onWritePremise` is held, then release it, and expect no revert commit, no write problem and no marker.
  - [2]
    - **id:** F2
    - **severity:** minor
    - **where:** packages/runner/test/run/session.premises.test.ts, 'the gates wait for a premise write and its completion' (plan §6.1 2f, AF3)
    - **problem:** The plan lists three gates that wait while a premise write or its completion is queued or running: a mid-stage Formalize, Submit review and Retry step. Only Submit is tested. Formalize and Retry reach the same `asLastWrite`, so they probably work, but no test fails if either one stops waiting.
    - **evidence:** The describe block has one test, `Submit review waits while a premise write runs…`. The `formalize(` and `retry(` calls in that file are not gate tests (the one `retry(` is the failed-completion Retry).
    - **fix:** Add two short variants of the existing test: a mid-stage `formalize(runId, stage, …)` and a `retry` while `onWritePremise` or the completion is held. Each should stay unresolved until release and then start from the adopt or completion commit.
  - [3]
    - **id:** F3
    - **severity:** nit
    - **where:** packages/runner/src/run/sessionEnd.ts recoverApply, the `equals(f)` test
    - **problem:** A reload during Apply compares only model and project files with F and B. Apply's change set also holds the endorsements.json and layout.json sidecars. If the window closed after the model files were written but before a sidecar, the files equal F, the run ends as applied, and the endorsements (and moved positions) are never written. The accepted definitions are then flagged 'needs your endorsement' again. The window is small, and the effect is a re-flag, not lost user data.
    - **evidence:** `paths` is built from `isModelOrProjectFile`, so the subject's two sidecar paths are never compared.
    - **fix:** Optional: also read the subject's two sidecars and treat 'model files equal F but a sidecar differs from what Apply would write' as the neither-case, or record the gap in §8 as accepted.
  - [4]
    - **id:** F4
    - **severity:** nit
    - **where:** packages/extension/src/logic/runs.ts RUN_SUCCESS_NOTICES (added 'submitReview')
    - **problem:** The 2f diff adds 'submitReview' to the success-toast set, which the plan does not ask for. A successful Submit now shows a toast with the outcome's label (for example 'taken out' or the confirmation text). The plan only asks that Apply's toast carry Undo.
    - **evidence:** git diff HEAD for runs.ts shows `+  'submitReview',` beside the `endSession` addition. HEAD's file has no 'submitReview' entry.
    - **fix:** Drop 'submitReview' from the set unless the toast is wanted. If it is kept, say so in §8.
