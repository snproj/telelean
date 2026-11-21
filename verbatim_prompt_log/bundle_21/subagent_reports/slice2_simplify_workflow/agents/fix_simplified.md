# fix:simplified

Agent `ab5d7131d8f719e37` of workflow `wf_62b0aec8-9f9`. Verbatim output (JSON alongside).

I fixed all 14 findings (6 major, 8 minor, no blocker) by editing only `/home/zhengyew/telelean/docs/slice2-plan.md`. A check of modification times shows no other file changed. I made no git changes, ran nothing, and called no network or Claude.

The AP-24 simplifications are unchanged: one reveal per stage, nothing decided while a step runs, and every queue runs to its end. Because "(F1)–(F20)" already names the second recheck's findings, the plan cites these as **AF1–AF14**; the header explains this. Design choices are marked AUTOPILOT DECISION in §7.2: new D2-70 to D2-74, and revised D2-16, D2-27, D2-31, D2-51, D2-61 and D2-68. The §7.4 log range is now D2-1 to D2-74. §8 has a dated 2026-11-19 entry that maps each finding to the sections it touched.

**Per finding (all fixed):**
- **F1 (major), fixed (D2-70):**
  - A Result draft that is B's version is marked `ItemDraft.asInBase`. Reconcile then keeps a rejected or reverted record as it is, before the changed-key and RV-11 rules run.
  - Taking a written premise out resets its key to the draft key.
  - Beyond the finding: the earlier rule that returns Shaky or to-be-redone items to review now reads only the steps of the queue that just ended (`queueSteps`). Without that, a later judge would undo a Reject the same way.
  - Tests in 2a1, 2a2 and 2e.
- **F2 (major), fixed (D2-71):**
  - (a) Premise writes and completions are now "due writes". The action that makes one due enqueues it, `recover()` enqueues any still due, and each checks at its start that it is still due.
  - (b) The final check and a new backstop code `not-written` refuse an accepted premise that was never written.
  - (c) Any action that moves a written premise out of the working copy (decline, cascade, back to review, Undo of its Accept) takes it out in its own write. Its ledger entries are dropped but recorded on the stack (`SessionAction.takenOut`) so Undo can restore them, and its key goes back to the draft key. Un-reject of a premise merges nothing.
  - Beyond the finding: ledger entries name the premise by its key; a take-out is planned when its write starts; the completion runs right after its premise write.
  - Tests in 2a2, 2b2 and 2f, covering both crash points and Undo of the Accept.
- **F3 (major), fixed (D2-27 and D2-51 revised):** `judging` now also means "the session's write queue is not empty", for the Submit, Apply, Formalize and Retry gates. A queue of Claude steps starts as a new `queue-start` write, the last one in that queue. Tests in 2d, 2e and 2f.
- **F4 (major), fixed (D2-61 revised):** a statement or belief item that is to be redone with its content still in the working copy counts as undecided. It keeps the results hidden, appears in `waitingFor`, and ends a Show results force. Submit's gate then names those items. Tests in 2a2 for each source (a Shaky cascade, RV-3 at a queue's end, un-reject), plus 2c2 and 2e.
- **F5 (major), fixed (D2-68 revised):** a session's RunView `inferences`, `target` and `premises` follow the InferenceView's question rule and are filled from the SessionView. RunView is added to the byte comparisons of the fixed pairs.
- **F6 (major), fixed (D2-61 revised):**
  - `maskFacts` is now specified field by field. It keeps the working copy's DeclFacts and module entries and takes only `axioms` and `usesSorry` from B.
  - B's Lean messages are moved by each declaration's line offset. An overridden `.holds` is placed against B's range.
  - The signature now takes both models.
  - New 2c1 test: a hidden lemma placed above a card with refs, a warning and an anonymous instance.
- **F7, fixed (D2-31 revised):** item ids are `it` plus a sha256 of the run id and the key, so `nextItem` is gone. No event is ever made about a hidden item. Added a 2e test pair where a Retry queue runs while the results are hidden.
- **F8, fixed:** §2.9 gains the signatures of `permittedFor` (B.1), `proposeArrowProblems`, `planItemRevert` and `buildSessionView`. `reconcile` takes the run id instead of a counter. `classify` takes the inferences and sets `ItemClass.addsNoNewBasis`.
- **F9, fixed:**
  - (a) The stage judgement is not persisted; it is recomputed on load (new D2-72).
  - (b) A premise write and a completion also replace `judged`.
  - (c) `refused` is added to `ActionErrorCode` in 2a1.
  - (d) A session's RunView sends `activity` and `notices` as empty arrays.
  - (e) Results are left out of `marks` while the results are hidden.
  - (f) `ReviewOutcome.events` is added.
  - (g) Drift is persisted as `{files, at}`.
  - (h) A `premises:` addition contributes only its own entry to an item's key.
- **F10, fixed:** a cancelled or failed step's premise drafts are dropped in its rollback write, and premise items exist only for inferences whose step ended. Test in 2d.
- **F11, fixed:** the in-memory session changes only at a write's steps 1 and 4. Test in 2d.
- **F12, fixed (D2-16 revised):**
  - An adopted ghost converts as a written Add premise in review. It can be accepted only as an axiom, with no second write, and the detail view carries a `writtenInReview` flag.
  - Beyond the finding: E(T) and B.2 now read written premises from the ledger rather than accepted ones. Otherwise the converted proof that uses the ghost would fail the first judge.
  - Tests in 2d and 2g.
- **F13, fixed (new D2-73):** Undo checks the restored statuses against the current state. Redo resends the recorded request through the reducer's rules. Any new action, a seal included, clears Redo. Tests in 2a2 and 2e.
- **F14, fixed (new D2-74):** `formalize`, `submit` and `retry` resolve once their first step is working. `decide`, `reveal`, Undo, Redo and moves resolve after their own write. `endSession` exit bypasses the host's run queue. Tests in 2d and 2f.

**Slices, to answer "What are the various slices again?":**
- Overall build order (★D8 (a)):
  1. The new board (done and installed).
  2. The review list (this plan).
  3. FROZEN.
  4. The transform window.
  5. References.

  Consistency checking comes later, in milestone M3.
- **Final slice-2 sub-slice list:** still 13; no fix needed a new one. The core sub-slices run strictly in this order, and 2g may run beside 2b3 and 2d–2f.
  1. 2a1: contracts (§2.9 with stubs), texts, closures, ownership and content keys (core).
  2. 2a2: classes, dependencies, the stage reveal rule, reconcile and the reducer (core).
  3. 2b1a: the rule helpers taken out of `evaluate()`, behaviour unchanged (core).
  4. 2b1b: step limits, B.1–B.4, `judgeState`, the new tokens, `proposeArrowProblems` (core).
  5. 2b2: backstop, revert, start checks, Submit's plan, `holdAs` (core).
  6. 2c1: base mask, build option, `endorsementHash`, protocol (core).
  7. 2c2: `buildSessionView` and the host's `not-yet` (core and host).
  8. 2b3: probe and runner engine, `writePremise` included.
  9. 2d: sessions, queues and steps, with the write queue, statements-only steps and re-asks.
  10. 2e: review actions.
  11. 2f: Add premise and the end.
  12. 2g: review panel and session bar.
  13. 2h: Proposed view in a session, Formalize, Undo, retirement.
