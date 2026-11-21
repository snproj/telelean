# fix:round2

Agent `a5b2654120f14e6e8` of workflow `wf_aabed7c9-dbf`. Verbatim output (JSON alongside).

I fixed all 22 findings in /home/zhengyew/telelean/docs/slice2-plan.md, the only file I changed (9 major, 12 minor, 1 nit). I judged none of them wrong: each claim about the code checked out against build.ts, persist.ts, adoption.ts, markup/decls.ts, gate/engine.ts and comparator.ts. Nothing was built or run, and git is untouched.

The §0–§9 structure is unchanged. §8 has a dated round-2 entry naming each finding and the sections, decisions and tests it changed. The design choices are logged as AUTOPILOT DECISIONs with alternatives in §7.2:
- **New:** D2-57 to D2-60.
- **Revised:** D2-4, D2-42, D2-46, D2-49, D2-50, D2-51, D2-52.
- **Refined:** D2-6.
- **Cross-referenced:** D2-2, D2-10 and D2-20 now point to the new ones.

**Per finding**
- **S1 (re-ask shows its outcome): fixed.**
  - A re-ask step that passes, gives up or runs statements only keeps its statement-phase content. Without a proof, only the target's proof, the step's proof material, its arrows and its premise drafts go back to S₀.
  - A new `SessionInference.asked` field holds the question asked and the one before it until the reveal. The InferenceView shows the asked question. The waiting and cascade sets use both questions and the latest ended step for T. The Result shows its `shown` status.
  - The old version, the old question and the report line appear only at the reveal. Cancel and failure still go back to S₀ at once.
  - Added to keep the fix closed:
    - a target whose Result is hidden cannot be re-asked;
    - a later step for T asks the asked question;
    - `other-result` now also bars statement-phase content from naming a target's `.holds`.
  - **Found while fixing S1:** the mask's start moved at every step's end, so a Result that stayed hidden through a Submit step for its own target showed its first version's outcome through the mask. It now moves only after the Result was shown (`shownSinceStart`).
  - Twin tests added in 2c and 2e; the 2d re-ask test is rewritten.
- **S2 (A12 skip shows L's outcome): fixed, critic's main option.** The step now runs statements only (`StepScope.statementsOnly`): Claude formalises and fixes the statements, then finishes not proved naming L. It never goes into `retry`, and the `skipped` state is gone. Chain twin tests in 2c and 2e.
- **S3 (mask keeps Lean messages and positions): fixed.**
  - `maskFacts` drops messages inside hidden declarations and messages with no position.
  - `buildSessionView` strips `loc`, `codeLoc`, vocabulary `loc` and diagnostic `range`, plus `semantic.durationMs`, and recounts `errorCount`.
  - "Open in editor" on the Proposed view uses the Current graph's location.
  - The twin generator varies proof length and placement and includes a linter warning.
- **S4 (hold-as choice not persisted): fixed.** `accepted.holdAs` and `rationale` are on the record, StatusSnapshot carries them, and the pending write and its replay read them. 2f test added.
- **S5 (writes not serialised): fixed.**
  - One write queue per session; the judge's revert is planned inside the queue and dropped if the head moved.
  - A new `writeStateChecked` rejects on failure; a failed step 1 aborts the write.
  - 2e test added.
- **S6 (Claude-arrow source becomes a target): fixed.** That source is recorded in `selectedArrows` and counts for the waiting and cascade sets from the request on. B.3 no longer re-checks old arrows for `other-target`. Tests in 2b2 and 2e.
- **I1 (Shaky rework across inferences): fixed, critic's main option.** Core `planSubmit` (2b2) takes the dependent kept content out first and orders the queue (D2-57). 2e test added.
- **I2 (premise key changes on write): fixed.** A draft's key is defined. The premise write records the written key as the accepted one and keeps the draft key in `versions`; the key survives a renamed Lean name via the ledger. 2f test added.
- **I3 (`open … in` is not declaration text): fixed, option (a).** It counts as a stray command, and the prompt now says to write fully qualified names. No parser change. 2b1 tests cover what Claude is told to write.
- **S7 (step-start records not persisted): fixed.** `PersistedStep.startRecords` and `startHolds`; the 2d reload test now includes a Reject made during the step.
- **S8 (hidden Result's shown status): fixed.** New `ItemRecord.shown`. Submit plans with visible items plus hidden Results by `shown`. RV-5's confirmation names a hidden accepted Result by label only.
- **S9 (statement-phase definition hidden with a draft): fixed.** Only proof-phase declarations are part of a Result.
- **S10 (host sends hidden data): fixed.** In a session, `RunView.frozen` holds only `{round, at}`. `openSessionDiff` answers `needs-confirmation` unless every hidden Result is named.
- **S11 (force survives a new hidden source): fixed.** A forced reveal also ends when a hidden Result joins pre(R).
- **S12 (declined arrow left in the question): fixed (D2-59).** A question's sources count only while their arrow exists, at Apply too. Declining such an arrow takes the source out of the question and makes the Result to be redone.
- **S13 (Claude's words across steps): fixed, first option (mechanical) (D2-58).** A step's words wait until the Results of that step and every earlier step are revealed.
- **C1 (ledger after rollback): fixed.** One rule for every rollback; B.3 ignores ledger arrows whose item is declined.
- **C2 (re-export source): fixed.** The re-export is built from the freeze commit's copy; 2b3 test added.
- **I4 (reducer contract gaps): fixed.** `ReviewState.waiting`, `SessionAction.id` with `nextAction`, and a new table row: a reverted to-be-redone item can't be set back to review (D2-60).
- **I5 (endorsements read and hash): fixed.** 2c exports `endorsementHash`; 2f's ModelWorkspace reads `endorsements.json`. Tests include Undo of an Apply.
- **I6 (2a too big): fixed by splitting into 2a1 and 2a2.** One deviation: the reconcile rules go to 2a2, not 2a1, because they read classes, dependencies and cascade sets. 2a2 also has a fallback split point.
- **N1 (check context for session judges): fixed.** For `judge` and `finalCheck`, the context's selection, stage and round are the active step's; judgeState ignores them, so `validateContext` is unchanged.

**New sub-slice list (run in this order)**
1. **2a1**: contracts (§2.9, with stubs), texts, closures, ownership and content keys (core).
2. **2a2**: RV-7 classes, RV-5 dependencies, reveal rules, reconcile rules, and the reducer with the session stack (core). Fallback split: 2a2a / 2a2b.
3. **2b1**: judging (core), refactor first: rule helpers, step limits, B.1–B.4, `judgeState`.
4. **2b2**: backstop, taking content out (`replace-decl`), several-target start checks, `planSubmit`, `holdAs` (core).
5. **2c**: masked model, `buildSessionView`, protocol messages, `endorsementHash` (core and host).
6. **2b3**: type-constant probe and the runner engine (judge, final check, completion, re-export, `planApply`).
7. **2d**: sessions and steps (runner and host), with the write queue, statements-only steps and re-asks.
8. **2e**: review actions: decisions, re-judging, Reject and Shaky, Submit with take-out, Undo, Show result.
9. **2f**: Add premise items and the end: confirmation, final check, Apply, Exit, drift, endorsements.
10. **2g** (may run beside 2b3 and 2d–2f): review panel and session bar (webview).
11. **2h**: Proposed view in a session, Formalize, session Undo, retiring the old review, user guide.

The core sub-slices 2a1, 2a2, 2b1, 2b2 and 2c run strictly one after another.
