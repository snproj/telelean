# refute:lifecycle

Agent `ac748b220cdda0778` of workflow `wf_84d1f5cb-1a7`. Verbatim output (JSON alongside).

- **verdicts:**
  - [1]
    - **id:** L1
    - **real:** True
    - **severity:** minor
    - **reason:** The finding holds, but its severity is overstated.

Why it holds:
- §5.2 takes each upgraded accepted record's `frozen.held` from "the recomputed stage judgement's freezeAtAccept entry". Slice 2 §3.11 makes that a pure recompute over slice 2's judged-facts.json, which has no meaningKey. A build runs only after a filesKey mismatch, or after the head has moved.
- §2.1 re-runs checkBase only for base-facts.json, and only at "the next judge". Nothing revalues stored maps: reconcile never touches `frozen`, and only an Accept or a premise write's step 4 sets `frozen.held`.
- §2.1, §3.4 and §3.5 make every inexact comparison refuse at `final`. So the refusal is permanent, and its remedy ("reload the window to check the base again") does nothing: a reload in confirming runs no judge.
- It is wider than the finding says. While base-facts.json and F's judged facts both lack meaningKey, the final check's `other-subject` rule is also inexact for every other subject's declaration.
- The heldAtJudge part also holds. Reconcile sets heldAtJudge only on items in review, and back to review is records-only, so the Accept refuses with "wait for the check" when no check is due. A reload's judge-apply would set it, but from the same inexact facts.
- Slice 2's own v1 conversion runs "a fresh judge … so the facts gain typeConsts". That is the step the upgrade leaves out, and the proposed fix (checkBase plus a build judge at upgrade) follows it.

Why minor rather than major:
- Only sessions still open when slice 3's dist lands are affected, and new slice-3 sessions always have meaningKey; the one exception is the pathological Repr over 2 MB.
- It fails closed, and Exit recovers with the files untouched.
  - [2]
    - **id:** L2
    - **real:** True
    - **severity:** minor
    - **reason:** What holds:
- The §3.6 'Writes' text names only `freezes` for the in-memory update, and for what the step's later writes carry.
- But the reducer's outcome for a freeze action (slice 2's ReviewOutcome, plus `freezes`) also carries the new `stack` and `nextAction`. D3-23, §2.4 and §5.3 need that action on the stack during the step.
- So a literal implementation loses the action at the step's next run.json write, and `nextAction` can repeat.

What weakens it:
- §1.1's 3d scope speaks generically of "a checked run.json write before the in-memory change", and D3-23 and §5.3 state the intent.
- The planned 3d tests would fail under the narrow reading: cheat 10(d), "a fresh failure not counted, after an Undo of an Unfreeze" (F3), and the rollback after an Undo. All three need an Undo during the step to find its action. A builder would therefore be pushed to the right code.
- The `answer` seal claim is unsupported. Answers go through the manager's answer path, not §3.6's freeze write, so a seal pushed in memory is persisted by the next write.
- The extra "reducer inside the chain task" is not needed:
  - The host serialises session messages through enqueueRun, and each call resolves only after its run.json write.
  - §3.5's judge-apply re-check covers the step-end race.

Verdict: this is mainly a one-sentence contract fix ("replace every field the outcome changed: freezes, stack, nextAction"). Without it, there is a small leftover risk of reused ids.
  - [3]
    - **id:** L3
    - **real:** True
    - **severity:** minor
    - **reason:** Both gaps are real:
- (1) §2.2's `SessionFreezes.end` records only the planned text. Yet §5.4's recovery compares with "the text before Apply", which is stored nowhere durable:
  - freezes.json is not a History sidecar (D3-15);
  - UndoStacks live in memory;
  - `standing` holds parsed records, not the text that planApply read from disk.
- (2) §5.4 gives freezes.json's own verdict but no joint rule with slice 2 §3.10 step 7 when the model files and freezes.json disagree.

Mixed states are possible with the built CheckedEditApplier. It applies one WorkspaceEdit, where created files hit the disk at once, and then saves edited files one by one in change-set order, which the plan does not fix.
- With model files = B, slice 2 returns to confirming while freezes.json already holds the kept changes. §5.4's Exit without ticks writes nothing, so a standing freeze can be lost, against REVIEW 7 / FZ-8.
- In the other order, the kept freezes can be dropped when Apply finishes as applied.

Why only minor:
- It needs a crash inside Apply's sub-second write window.
- The most likely next step, pressing Apply again, re-merges with the disk file and repairs it.
- Claude's later change to unfrozen content still appears as a review item.
- §5.4 already gives "a notice" for some mixed cases.
- Round 1 rated F18 itself minor.

The proposed fix is sound and cheap: record `end.before`, let the model files decide, make freezes.json follow, and put freezes.json last in the change set.
