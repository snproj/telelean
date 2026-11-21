# recheck:r2

Agent `ae3c74f9abbacb07a` of workflow `wf_84d1f5cb-1a7`. Verbatim output (JSON alongside).

- **summary:** I checked all six round-2 findings against the plan as it stands now, and every fix holds, so none is re-raised. I edited nothing and ran nothing.

- **checks-S3-6 (fixed).** §2.1 now makes every lam, forallE and letE binder name anonymous and drops every mdata node before the Repr, and it keeps round 1's renaming of auxiliaries by their place in the walk.
  - The fixer's correction is right: in the pinned v4.35.0 sources, Lean/Elab/Binders.lean's elabArrow uses `addMacroScope `_internal `a reservedMacroScope`, so a plain arrow's binder is stable anyway.
  - The constant lists (checkFile.ts) name only probed declarations, so hygienic auxiliaries such as a derived `decEqColor✝` never enter held maps.
  - The 3p, recordings-gate and 3d tests cover the finding's scenarios.
- **intent-FID-1 (fixed).** A session Unfreeze of a foreign record goes into `standingCleared` and lifts it for that session only. Its end row has no tick and gives the reason. This is consistent across the header, §2.2, §2.4, §3.1, §3.3, §3.6, §4.3, §4.6, §4.7, §5.4, cheat 25 and the tests in 3a–3g. D3-41 logs it as a narrowing of EN-2.
- **lifecycle-L1 (fixed).** §5.2 now upgrades by phase:
  - in a stage: a judge with a build;
  - during a queue: `checkBase` only, plus the interrupted step's `startedAt`;
  - in confirming: the final check again, with a new id;
  - in applying: slice 2's Apply recovery first.

  `AddressValue.missing` and `HeldValue.missing` name permanent causes. A crash during the upgrade itself is still open (R3-4).
- **intent-FID-5 (fixed).** `unfreezeRequestProblems` now refuses whatever the step's limits fix, frozen or not, and the accepted-row hint appears only where a Retry helps. The validator's inputs are under-specified (R3-3).
- **ui-U1 (fixed).** A proposed "−" arrow's menu now acts on the arrow ("Freeze and reject the deletion"). Its disabled text during a step is wrong (R3-6).
- **build-IMP-6 (fixed).** `propose_arrow` refuses, and B.3's `not-target` refuses, a whole-model arrow into another target. The extra `partOfResult` rule gives the same result as slice 2 for every state slice 2 can produce: the built review/items.ts gives every ledger arrow item `partOfResult` = the arrow's target, and `SessionInference.steps` gives each step's target. One parenthesis is ambiguous (R3-5).

**New problems.**
- **1 major (R3-1).** `heldAtJudge` is refreshed only on records reconcile leaves in review. But a status change writes nothing to ws/, and an Accept starts no judge, so an Accept can find no map or a stale one. That means one of two things: a refusal ("not checked yet") when no check is due, or a false `held` problem that Unfreeze-then-Accept cannot clear. This contradicts D3-51's own invariant, and in one variant it fails open.
- **3 minor:**
  - **R3-2:** the whole-model question's wording misstates when a freeze ends the step.
  - **R3-3:** `RequestItem` and ToolInput are too coarse for FID-5's per-limit refusal.
  - **R3-4:** a crash during the upgrade's own judge leaves `upgrade` pending, and nothing re-runs it with a build.
- **2 nits (R3-5, R3-6)** on wording introduced by this round's fixes.
- **findings:**
  - [1]
    - **id:** R3-1
    - **severity:** major
    - **where:** Plan sections:
- §2.3 `ItemRecord.heldAtJudge` ("set by reconcile on every record it leaves in review")
- §3.5, the `freezeAtAccept` bullet ("an item returned to review never keeps a held map from an older version")
- §3.7 Accept
- §0 and D3-51 ("no Accept waits for a check that is not due")
- §5.2, the upgrade

Slice 2 sources:
- docs/slice2-plan.md §3.5 RV-3 rule (line 1433) and line 1638 ("an Accept starts no judge")
- §3.1 (Shaky and to-be-redone content stays in ws/)
- `ItemRecord.judged`, which is kept for every record whose content is in ws/
    - **problem:** `heldAtJudge`, which an Accept copies into `frozen.held` and without which it is refused, is set only on records that reconcile leaves in review.

But records are returned to review, or accepted, without any judge running in between:
- RV-3 lets the person change any status at any time;
- back to review from Shaky, or from to be redone without revert, writes nothing to ws/;
- slice 2 starts no judge on an Accept.

This leaves three gaps:
1. **No map at all.** Reconcile itself makes a new or updated item depending on a Shaky or to-be-redone item "to be redone at once" (RV-3). Such a record never gets a map, or keeps its older version's. Its later Accept is either refused "has not been checked yet: wait for the check to finish" with no check due, or freezes the old version's map. With the old map, names the new version uses are not held at all: a later whole-model step can change what the accepted item means with no finding (fail-open for RV-4).
2. **A stale map.** A record declined Shaky keeps its map while a later whole-model step changes a definition it uses. If the person accepts it after back to review, a false `held (changed)` problem follows. Unfreeze-then-Accept copies the same stale map again, because no judge runs in between.
3. **Upgraded sessions.** After §5.2's upgrade, every record that was not in review at the upgrade's judge (accepted, Shaky, to be redone) has no map. In confirming, no reconcile runs at all.

All three contradict D3-51's invariant.
    - **scenario:** **A. No check ever comes**
1. The person declines vocabulary item S (which defines D) as Shaky.
2. A narrow mid-stage Formalize for T fills card C's empty statement at the selected arrow C → T with `abbrev c : Prop := ∀ x, D x`.
3. At the queue-end judge, RV-3 makes the new item V "to be redone" at once, with its content kept. V never gets a `heldAtJudge`.
4. The person sets S back to review and accepts it, then accepts V. V's Accept is refused: "“V” has not been checked yet: wait for the check to finish." Nothing is due, so it stays refused until an unrelated write to ws/ triggers a judge.

**B. A problem that cannot be cleared**
1. V (`abbrev c : Prop := ∀ x, D x`) is in review at judge J1, so its map holds D₁. The person declines V as Shaky.
2. A whole-model mid-stage step rewrites D to D₂. D is neither frozen nor held, because V is not accepted. V stays Shaky, so its map still holds D₁.
3. The person sets V back to review, accepts it, and accepts D's Change.
4. The final check reports `held (changed)` on D, and Apply is disabled.
5. Unfreeze V, then Accept again: the same D₁ map is copied, and the problem returns. Only declining D's change, which the person wanted to keep, clears it.

**C. Upgraded session**
An Undo of an Accept made before the upgrade, then its Redo, is refused in the same way.
    - **fix:** **§2.3 and §3.5.** Reconcile sets `heldAtJudge` at every judge-apply:
- on every record whose item has a draft in the judgement, whatever its status, from `freezeAtAccept`. This follows slice 2's `judged` rule, which is kept for every record whose content is in ws/.
- and removes it when the judgement has no entry.

Since a status change writes nothing to ws/, the stage judgement is then always the state the person sees when they accept.

**§5.2.** The confirming upgrade's records-only write also sets `heldAtJudge` on every record, from the final check's `freezeAtAccept`.

**§3.7.** Add one sentence: an Accept queued behind a decision's write (D2-27) copies the map from before that write. A `held` problem it causes is cleared by Unfreeze, then Accept, which now copies the fresh map.

**D3-51.** Reword its sentence to match.

**Tests:**
- 3b: scenarios A and B. In B, after accepting D's change, the final check passes.
- 3b: an updated to-be-redone record, accepted, holds its new names.
- 3d: an upgraded session, where Undo then Redo of a pre-upgrade Accept is allowed, and a Shaky item set back to review can be accepted at once.
  - [2]
    - **id:** R3-2
    - **severity:** minor
    - **where:** - §3.8 "While a whole-model step runs" (the question's text and its explanation, "once it has fixed its statements a freeze of that content ends it")
- §4.4 "While a whole-model step runs"
- D3-50, the FID-6 paragraph

These contradict §3.8 "A freeze the step cannot meet", §2.9 `unmeetable`, and cheat 10(e).
    - **problem:** The whole-model question tells the person that a freeze ends Claude's step only "If it has fixed its statements since".

But `unmeetable` also ends the step at once, whether or not statements are fixed, when one of the step's own live ledger entries writes the frozen content:
- `arrow`
- `unarrow`
- `delete`
- `proof-broken`

Those tools are used before freeze_statements. Cheat 10(e) ("a card Claude deleted with delete_card: the step ends at once") states this too.

The person is therefore told that an early freeze is safe, and then loses the step's work, which can be long and costs quota, with no warning that matches.
    - **scenario:** 1. A whole-model mid-stage Formalize for T runs. Before fixing its statements, Claude calls `propose_arrow` X → P, where P is a non-target, so P's Dependencies are freezable (D3-6).
2. The person, looking at J, wants no new arrows into P and freezes P's Dependencies (or uses Freeze all other cards).
3. The dialog says the step ends only if Claude has fixed its statements. Claude has not, so the person confirms.
4. At the next check, `unmeetable` finds the step's own ledger arrow writing P's frozen Dependencies. The step ends at once and is rolled back to S₀, with "You froze P's Dependencies after Claude's step had already changed it."
    - **fix:** Reword the question in §3.8, §4.4, D3-50 and the user guide:

> "Claude's whole-model step may already have changed ‹x›. If it has fixed its statements since, or changed ‹x› with one of its tools (an arrow it proposed or removed, a card it deleted, a proof it marked broken), the step ends without a result and its work is discarded."

It still reads only the queue's StepScopes. Fix §3.8's explanation sentence the same way.

Test in 3e2: the dialog's text, and a freeze of P's Dependencies after Claude's `propose_arrow` into P, before freeze_statements, ending the step.
  - [3]
    - **id:** R3-3
    - **severity:** minor
    - **where:** - §2.2 `RequestItem` (`{ name: string }`)
- §3.9, first bullet (FID-5's per-limit refusal)
- §2.9 `ToolInput`
- §6.1 3c1 ("accepting a request for a foreign record's gloss, while refusing one for a foreign record on a definition's declaration")
- cheat 25
    - **problem:** FID-5's fix refuses "every item that the running step's limits fix". Two inputs are too coarse for that rule.

1. **`{ name }` has no field.** A vocabulary card has two fields, `declaration` and `gloss`, and the limits can fix one without the other. With FID-1, another subject's freeze of a whole vocabulary card it uses gives exactly that case: the `other-subject` rule fixes the declaration's held value, but not the gloss. The validator cannot decide such a request:
   - if it refuses, Claude can never ask for a gloss change the person could grant for the session;
   - if it accepts, Continue reports the name unfrozen while its declaration stays fixed, and Claude's next edit fails a counted check.
2. **No item records.** The whole-model limit "content declined Shaky, except this step's own `openItems`" needs item statuses, but `ToolInput` (`current`, `stepStart`, `scope`, `statementsFixed`, `inferences`, `ledger`, `table`, `held`, `judgement`, `stepIntermediates`, `subject`) has no item records.
    - **scenario:** 1. On S1's board, the person freezes S2's vocabulary card `InGame`, a definition S1's statements use. Both fields become foreign records.
2. In a whole-model session on S2, Claude calls `request_unfreeze { items: [{ name: 'S2.InGame' }], change: 'reword the gloss' }`.
3. Either outcome is wrong:
   - Refused, with "S2.InGame is used by … leave it exactly as it was": the person is never asked, though FID-1 lets them unfreeze the gloss for the session.
   - Accepted: after the person unfreezes both fields, Continue reports `InGame` unfrozen, Claude also edits the declaration, and the `other-subject` check fails and counts.
    - **fix:** **The request item.** Make it `{ name: string; field?: VocabField }`, in the type and in the tool schema.

**The validator** judges each field:
- a named field that the limits fix is refused, with that limit's text;
- without `field`, the item is refused only when every frozen or held part of it is fixed;
- the request row and Continue's `unfrozen` list name only the fields the step may change.

**`ToolInput`** gains `items: readonly ItemRecord[]`, or the keys of items declined Shaky.

**Tests in 3c1:**
- the whole `InGame` card frozen on S1: `{ name }` accepted for the gloss only;
- `{ name, field: 'declaration' }` refused with the `other-subject` text;
- another inference's Shaky item refused, while the step's own `openItems` are accepted.
  - [4]
    - **id:** R3-4
    - **severity:** minor
    - **where:** - §5.2 the upgrade, stage and confirming paths
- §2.2 `SessionFreezes.upgrade` ("until the write that sets frozen … from a judgement with keys")
- slice 2 §3.11 (`recover()` judges the stage purely on `judged-facts.json`; "a judge that was running runs again", with a build only when the facts mismatch or the head moved)
    - **problem:** The upgrade writes `freezes`, with `upgrade: 'pending'`, and then starts `checkBase` and a judge with a build. The window may close or crash during that heavy job, before its judge-apply; this machine has crashed from RAM before.

On the next load, nothing restarts the work:
- the session already has `freezes`, so §5.2's upgrade does not run again;
- slice 2's recovery judges the stage purely on slice 2's keyless `judged-facts.json`;
- it re-runs the interrupted judge without a build, because the facts match and the head did not move.

So no judgement with keys arrives. `upgrade` stays pending, accepted records stay without `frozen`, and the records stay without a map. This lasts until a queue-end judge, after a whole-model step that could already have changed accepted content (RV-4).

Nothing either says what happens if the person reaches confirming through Submit while `upgrade` is still pending: only the upgrade's own confirming path sets `frozen`.
    - **scenario:** 1. A slice-2 session is in a stage with accepted items. Slice 3 is installed.
2. On reload, `recover()` upgrades the session: run.json gets `freezes` with `upgrade: 'pending'`, then `checkBase` and the build judge start.
3. The window crashes before the judge-apply.
4. On the next load, the pure stage judge-apply has no keys, and the re-run judge does not build. Accepted items get no `frozen`.
5. The person runs a whole-model mid-stage Formalize. Its step may change accepted content (no `frozen` entry is in the table), which comes back only as an "updated" item at the queue's end.
    - **fix:** **§5.2.** `recover()` of a session whose `upgrade` is still pending runs its phase's upgrade step again:
- in a stage, a judge with a build;
- during a queue, nothing more;
- in confirming, the final check again.

**While `upgrade` is pending:**
- every judge builds;
- entering confirming by Submit makes the same records-only write after the final check, which sets `frozen`, sets `heldAtJudge` (R3-1), and removes `upgrade`.

**Tests in 3d:**
- a reload after the upgrade's run.json write and before its judge-apply: the next load builds and sets `frozen`;
- a Submit while `upgrade` is pending sets `frozen` in confirming.
  - [5]
    - **id:** R3-5
    - **severity:** nit
    - **where:** §2.8, `propose_arrow` ("an arrow into any unfrozen proposition of the session's subject that is not a target of the session (another step's intermediate included)"); §3.10 "Whole-model arrows" (the same parenthesis); D3-38
    - **problem:** The fixer's disposition says another step's intermediate counts as a target, so arrows into it are refused. But the parenthesis "(another step's intermediate included)" can just as well be read as listing an allowed destination.

No test pins the intended reading. Read the other way, 3c2 would admit arrows into another step's intermediate I. That grows E(I) and I's hidden Result, which is the exact IMP-6 pattern this round removed.
    - **scenario:** 1. A builder of 3c2 reads §3.10 as allowing an arrow from step A into intermediate I, which step B (target T2) added with `add_card`.
2. B.3 admits it.
3. I's hidden Result gains an arrow its own step never proposed, and its E(I) and RV-11 status change behind the person's back.
    - **fix:** In §2.8, §3.10 and D3-38, replace the parenthesis with: "…that is not a target of the session; another step's intermediate counts as a target."

Add a 3c2 test: `propose_arrow` into another step's intermediate is refused at once, and B.3 refuses a hand-written ledger arrow into it as `not-target`.
  - [6]
    - **id:** R3-6
    - **severity:** nit
    - **where:** §4.3 "What they act on" (a proposed "−" arrow's Freeze "disabled during a step with §3.6's text"); §3.6 phases table, Your version during a step ("Rejecting waits until Claude's step ends: freeze Claude's proposal now, or wait.")
    - **problem:** Delete and Remove arrow items offer "your version" only (§3.6 Versions). So a "−" arrow's menu has no "freeze Claude's proposal" entry.

During a step, the disabled "Freeze and reject the deletion" still tells the person to "freeze Claude's proposal now": an action that does not exist for this target.
    - **scenario:** 1. While Claude's step runs, the person right-clicks a "−" arrow from an earlier stage.
2. The only freeze entry is disabled, with "Rejecting waits until Claude's step ends: freeze Claude's proposal now, or wait."
3. The person finds nothing that freezes Claude's proposal.
    - **fix:** For the yours-only kinds (Delete, Remove arrow), the during-step reason reads: "Rejecting waits until Claude's step ends: freeze it then, which rejects the deletion."

Keep §3.6's text for the kinds that offer both versions. Add the case to 3f's `freezeMenu` disabled-reason test.
