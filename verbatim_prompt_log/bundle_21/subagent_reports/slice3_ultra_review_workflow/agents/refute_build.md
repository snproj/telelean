# refute:build

Agent `aebd96e3dd579e470` of workflow `wf_84d1f5cb-1a7`. Verbatim output (JSON alongside).

- **verdicts:**
  - [1]
    - **id:** IMP-2
    - **real:** True
    - **severity:** major
    - **reason:** Survives refutation. Built core review/items.ts gives a written premise its key from ws/ (draftOf, a hash over decls, fields, blocks and arrows). An unwritten one uses premiseDraftKey. So the key changes at the write, as slice 2 §3.8 (I2) says. Plan §3.7 sets frozen.fingerprint to the record's fingerprint (the draft key) at Accept from 3b. Only the runner's step 4 (slice 2's run/premises.ts, built in 2f) could update it. But §0 forbids runner source in 3b, and no sub-slice is given that update: 3d's and 3e1's file lists lack premises.ts. §3.4 step 1 has no premise exception, and §0 and §3.3 make the accepted check unconditional. So from 3b on, every stage judgement after a premise write raises `frozen (accepted)`, Apply is disabled, and the final check and the backstop refuse. This breaks the 2f test and §1.1's own claim under 3p that slice-2 session tests with an accepted item keep passing (AP-27). It is worse than reported. Even in the final design, the premise write's own judgement runs before step 4 (§3.7: writePremise 'with the freezes'; any frozen finding fails the write). That judgement already sees the premise's frozen.fingerprint differ from the written key, so every premise write would fail. The critic's fix (a) does not cure this, and neither does (b) as worded, because accepted.fingerprint is still the draft key during that judgement. The rule must compare the premise draft's identity, or exempt the item being written. Not a blocker: it fails closed, shows up at once in the runner suite, and 3b, a core sub-slice, can fix it in frozenFindings with a §8 record. But as written, the Add premise flow (RV-1) is broken from 3b on and the plan never repairs it.
  - [2]
    - **id:** IMP-1
    - **real:** True
    - **severity:** major
    - **reason:** Survives refutation. judgeState runs before reconcile, and JudgeInput.items holds the previous records (core review/types.ts). §2.3 and §3.5 limit freezeAtAccept to 'every item in review or accepted', and a draft with no record has no status. reconcile.ts creates the new records afterwards from judgement.drafts (newRecord). It is pure, with no model, so it can only copy entries; it cannot compute a held map.

Read literally:
- After the first queue (no records yet), every new record lacks heldAtJudge, so every Accept is refused with 'has not been checked yet', yet no judge is due. Accept is a records-only write with no commit, and a reload recomputes the judgement without reconcile. This is exactly the outcome D3-51 says it chose heldAtJudge to avoid.
- An item that F5's Submit rework returns to review was Shaky or to be redone at judge time, so it gets no entry. heldAtJudge persists from an earlier review period, so its Accept copies a stale held map from an older version. That fails open for names the new version relies on: a step can change them without a `held` refusal, and only RV-5 later returns the item to review.

The planned tests (3a 'freezeAtAccept', 3b 'reconcile setting it') do not cover new or returned records. The runner suite would expose the refusal at 3b, but the plan text is wrong.

The third bullet is weak: heldMap over an unwritten premise's provides.decls [] gives {}, which counts as present. The first two bullets stand. Fix: an entry for every draft, and reconcile refreshing heldAtJudge for every record it leaves in review.
  - [3]
    - **id:** IMP-3
    - **real:** True
    - **severity:** minor
    - **reason:** The contract inconsistency is real. Core edit/types.ts has PlanContext {today, now, layouts}, built by runner workspace/modelWorkspace.ts planContext() and inline by runner/test/run/helpers/fakeServices.ts:225. A required `freezes`, as §2.6 writes it, is absent from §0's optional list and from 3a's runner allowances, so runner and extension tsc break at 3a. planEditNode and planRemoveArrows take no ctx today. The data-loss scenario is far less likely than claimed:
- Before 3d, materialisePlan writes no freezes.json at all.
- After 3d, the same planContext() feeds set-freezes. If it omitted the records, Unfreeze through perform would report 'Not frozen', and 'freeze X, then Y' would lose X. 3d's planned freezes.json, Undo/Redo and R2-12 tests would very likely fail at once.
- The whole-file EditPlan.freezes deliberately mirrors layout.json, with the board stack's conflict check.

The fix is small: optional in 3a and required in 3d, or a delta merged at write time. Minor.
  - [4]
    - **id:** IMP-4
    - **real:** True
    - **severity:** minor
    - **reason:** The gap is real. §1 promises `not-yet` answers, but 3b is core-only and no sub-slice owns them; slice 2 gave that job to 2c2. Today's extension boardSession.ts dispatchRun is an exhaustive switch returning Promise<ActionOutcome> under strict. Widening core RUN_MESSAGE_TYPES in 3b would raise TS2366 if slice 2 leaves the switch exhaustive. That is unknowable until slice 2 ends: if 2c2's not-yet default survives, the new messages just get the 'slice 2' text. Before 3d, setFreezes does fall to handleInOrder's default (logged, no actionResult). But in practice:
- `formalize.options` is sent only by the ▾ (3e2, which adds its own route).
- The keep ticks come from 3g's list, which lands after 3e1's routes.
- dist is not rebuilt mid-slice, and 3f's tests use a fake host.

So the only concrete effect is a possible compile stop at 3b, which tsc shows at once and the integrator fixes with an allowance. Minor.
  - [5]
    - **id:** IMP-5
    - **real:** True
    - **severity:** minor
    - **reason:** The contract gap is real. ReviewState (core review/types.ts) holds items, deps, classes, forced, inferences, stack and so on, but no models, phase, queue or board. The planned undo/redo action carries only `violates`. The reducer can work out whether the results are hidden (resultsState), so the listed hidden-target Undo test can be written. It cannot apply D3-6's rule for queued or running targets during a step, and it cannot compute 'values computed then' for a Redo. The critic's scenario is impossible: a later queue's queue-start seal clears Redo (slice 2 §3.6, AF13). A real variant exists: Undo a freeze during a queue, then Redo in the next stage, with no seal between. Recorded values from J then differ from the stage's, which gives a spurious stage problem that fails closed. Applying (D3-46) is already refused by the runner's phase check, and provisional cards cannot exist in a session. The consequences are fail-closed or UX only, and a §8 contract field fixes it. This is the same class as R2-11 and R2-14, both minor.
  - [6]
    - **id:** IMP-6
    - **real:** True
    - **severity:** major
    - **reason:** Survives refutation for B.3 and the item model:
- Built core review/items.ts:767 marks every ledger arrow `partOfResult: id` (the arrow's own target card) and takes its origin target from entry.target.
- reconcile copies partOf at creation and never changes it, and inferenceOf reads origin.target.
- Slice 2 §4.9 B.3, at step purposes (every gate attempt), refuses an arrow the active step added that does not go into the step's target (`not-target`).

The plan relaxes only propose_arrow (§2.8; whole-model acceptance is in no sub-slice's file list) and the mask. §3.10's whole-model limits even list 'B.3' as still fixed. No 3c1 or 3e2 test sends a whole-model arrow into a non-target through a gate. The outcomes:
- If propose_arrow accepts the arrow, every gate fails, and Claude cannot withdraw the ledger entry, so the step burns its counted attempts and gives up.
- Otherwise the item is part of a Result that does not exist, hidden while the results are (contrary to §3.10 and F19's premise), and it carries a bogus inference for Submit and F5.

The backstop claim is weaker: slice 2's backstop restates B.3 as acyclicity (`cycle`), and `arrow` only needs an accepted Add arrow owner, which exists. Spec B.3 and ES-2 explicitly allow arrows 'into any unfrozen Dependencies with the whole model open' (the user's ★D3 feature). So this fails closed, but the feature breaks or is silently narrowed: major.
