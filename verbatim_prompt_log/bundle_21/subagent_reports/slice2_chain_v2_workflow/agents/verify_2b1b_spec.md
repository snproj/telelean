# verify:2b1b:spec

Agent `ab105f9f7b04b9ee7` of workflow `wf_ae5f1188-533`. Verbatim output (JSON alongside).

- **summary:** I found 2 major, 4 minor and 3 nit problems, and no blockers. Most of the work matches the plan. To see what 2b1b changed, I rebuilt the post-2b1a core and docs tree in my scratch dir from after_slice_2b1a.patch and diffed it against the working tree. The diff agrees with the report: only core and docs/slice2-plan.md changed, and both index files are untouched.

What matches the plan:
- **Contracts:** the §2.7 codes, tokens and `GateFinding.inference` are additive, and every new token has a board sentence and a message for Claude. The texts quoted in §4.9 are used verbatim, and 1b's arrow texts are identical. `evaluateRules` is unchanged.
- **The rules:** B.1, E(T), D2-59, session-proof and the reasons for "nothing" follow §4.8. judgeState's global, per-inference and step rules, stepFindings and `ok` follow §4.9 and the logged decisions.
- **The carry-overs:** R1-F1 (`settleMergedBack`), R1-F2 (the corrected text, and the state built with reconcile) and R1-F3 (the World property) are done as the brief asked, and the plan's §8 entries are updated.
- **The tests:** the §6.1 tests exist and mostly test what they claim.

The two major problems are both ES-2 preset gaps. Each lets a step pass the gate with a change that computeItems later reports as unowned. Unowned changes disable Apply, and later steps cannot remove them because the step limits freeze them. Nothing is applied wrongly (it fails closed), but the session can only end with Exit, which discards all its review work.
- **F1:** Claude can prove a card that is not a target.
- **F2:** in a Submit step, the builder's own new rule about removed lines refuses removing or moving the comments and enclosing lines of reopened items.
- **findings:**
  - [1]
    - **id:** F1
    - **severity:** major
    - **where:** packages/core/src/gate/sessionRules.ts:226-303 (stepLimitFindings) and :735-782 (holdsKindFindings, condition at :769); packages/core/src/review/judge.ts:294-324
    - **problem:** A step can add a proof (a theorem `.holds`) to a card that is not the step's target, and the gate does not refuse it. Spec ES-2's preset opens only the targets' Proof; everything else is frozen, including empty fields ('the Proofs of non-targets stay closed', spec lines 396 and 404). Plan §4.2 (line 1713) says 'Unowned differences cannot pass the gate: … a proof of a card that is not a target'. The traced path for a new `theorem t1.holds` on a non-target t1 at gate-proved:
- the step limits iterate only S₀'s declarations, and their 'closed proof' check covers only the target's `.holds`;
- B.4 ignores absent → theorem, and also reports nothing for axiom → theorem on a non-target, because its only axiom → theorem branch is gated on the card being a target (:769);
- new-axiom, G5, B.3 and stray-command do not apply;
- the footprint rule judges it as the active step's proof material and passes it whenever it rests on the step's sources.
At the stage, computeItems makes it unowned (items.ts:723-727), so Apply is disabled. Every later step refuses to remove it (`existing-changed`/`session`, since it is in S₀ but not in B), and no review decision can remove it either: no item owns it. The session is stuck until Exit. The builder applied exactly this reasoning (AP-26) to moves and removed lines, but missed this case. No test covers it.
    - **fix:** Close ES-2's 'non-targets' Proofs are closed' at the gate:
- At step purposes, refuse any theorem `.holds` that S₀ lacks on a card other than `scope.target`. Use a token with its own describeFinding sentence and a message such as 'in this step only the proof of “T” may be written'. This also covers an AXIOM card 'proved' by Claude.
- In holdsKindFindings, at every purpose and against the reference, refuse a theorem `.holds` the reference lacks, and any axiom → theorem change, on a card that is not a target of the session. At stage and final this becomes a global finding.
- Keep exempting the axiom `.holds` of fuzzy AXIOM fills and of ledger premises.
- Add judge tests: `theorem t1.holds` for the non-target t1 is refused at gate-proved, and is a global finding at stage.
  - [2]
    - **id:** F2
    - **severity:** major
    - **where:** packages/core/src/gate/sessionRules.ts:287-301 (the loop over S₀'s removed lines in stepLimitFindings; openNames is applied only to declarations, at :236)
    - **problem:** The builder extended the step limits (decision 5) to refuse every S₀ line outside declarations that a step removed or moved. The loop has no exemption for content the scope opens. A Submit step may change or remove its `openItems` content (plan §2.7 line 857: 'whose content may change or go'; spec DO-3 line 640: 'keep, change, remove, split or merge'). The target's proof under `openProof` is open too. But such a step cannot remove or move:
- the comment lines attached to an open declaration (they are part of that item's content key; AP-26: the comment 'belongs to that declaration's item');
- the `namespace`/`section`/`mutual` … `end` lines around open declarations (plan §4.2 line 1694: they go with the last declaration they enclose).
This is also why editing such a comment fails: the old line counts as removed. Removing an open lemma together with its `-- helper` comment fails with `existing-changed`/`removed` ('stood here when this step started … restore it'). Claude must then leave an orphan comment or an empty namespace pair. At the stage, computeItems either attaches the orphan to some other declaration (mis-attributed) or reports it unowned, and an empty enclosing pair is always unowned. Apply is then disabled, and later steps cannot remove the lines (the same rule). No test removes an open item's declaration together with its comment or enclosing lines.
    - **fix:** In stepLimitFindings, exempt the S₀ line units that belong to opened content:
- comment lines that compareTexts(base, stepStart) attaches (`attachedTo`) to a name in `openNames`, or to the target's `.holds` under `openProof`;
- enclosing lines (`enclosing: true` in that comparison) all of whose enclosed declarations are in `openNames`.
Keep refusing lines B has (the person's text) and lines of items that are not open.
Add tests:
- a Submit step with `openItems: ['proof:T']` that removes an open lemma with its comment and its `namespace … end` pair passes;
- removing a person's comment still fails.
  - [3]
    - **id:** F3
    - **severity:** minor
    - **where:** packages/core/src/review/judge.ts:221-223 (`const step = STEP_PURPOSES.has(purpose) && input.scope !== undefined && input.stepStart !== undefined`)
    - **problem:** If the engine (2b3b) calls judgeState with a step purpose but omits `scope` or `stepStart`, judgeState silently judges the state like a stage. It then runs none of the following:
- the step limits;
- not-proved at gate-proved;
- status-mismatch, statement-changed, readiness and not-frozen;
- rejected-repeat.
It also sets `stepFindings` to the global findings only. So a gate-proved finish with no proof, or one that changed the person's declarations, gets an empty `stepFindings`: a green that fails open on a caller mistake. No test covers a step purpose without a scope.
    - **fix:** Fail closed: when `purpose` is a step purpose and `scope` or `stepStart` is missing, throw (an ActionError 'invalid', or the NotImplemented-style error the review modules use), or return `ok: false` with a global finding. Add a test.
  - [4]
    - **id:** F4
    - **severity:** minor
    - **where:** packages/core/src/gate/describe.ts:188-193 versus packages/core/src/gate/sessionRules.ts:241-247, :276-284 and :293-299
    - **problem:** The step limits reuse slice 1's `existing-changed` tokens with new meanings, but the board sentences (describeFinding, which the person reads with the step's gate attempts) were not adapted:
- Token `target` is now also used for the target's `.holds` while its proof is closed, a proof added or changed in a statements-only step. The board says 'it changed the statement it had to prove (a definition the frozen statement depends on changed: `cynder_not_good.holds`)'.
- Token `removed` is now also used for a removed or moved line of text outside declarations (no `names`). The board says 'it removed an existing declaration'.
Both misdescribe what Claude did. The plan (§2.7) asks for a board sentence for each new case.
    - **fix:** Give the two new cases their own tokens (for example `closed-proof` and `text`), each with a describeFinding sentence and a describeSession test. Examples: 'it wrote a proof of “T”, which this step could not prove' and 'it removed or moved a line of your text outside declarations'. Alternatively, make describe tell them apart: a `.holds` name for the first, no `names` with a `file` for the second.
  - [5]
    - **id:** F5
    - **severity:** minor
    - **where:** packages/core/src/review/reducer.ts:442-453 (mergedBackBy) and :610-625 (settleMergedBack); docs/slice2-plan.md:1807 (§4.6 property) and :3104 (builder 2b1b decision 13)
    - **problem:** The residual the builder left (decision 13) covers more than item V. Take a mixed request R = [un-reject V, reject W] in which V's merge brings back a written premise p that is then written again: it is in `reapply`, its record holds its card and written key, and the runner puts its ledger entries back. A later un-reject of W inverse-merges R's whole commit, which removes p's card from ws/. mergedBackBy lists only what R took out, so p is in no part of that write. p's record then keeps its card, written key and ledger entries while its card is gone. That contradicts the §4.6 property the builder amended to claim 'requests that mix an un-reject with a Reject included'. The World property cannot see it: its simulation never models a later un-reject inverting a commit that itself contained a merge. It is unreachable from the webview (§5.7) and fails closed ('disappeared'), so the impact is low. Still, the plan's property overclaims and the hole is cheap to close.
    - **fix:** Fail closed in the reducer: refuse an un-reject whose declining action (the one mergedBackBy finds) also un-rejected an item in its own request, with a text that points to Undo. Alternatively, refuse decide requests that mix `in-review` with `declined`, in the reducer or in 2c1's validator. Then narrow the §4.6 sentence and decision 13 to match, and add a reducer test.
  - [6]
    - **id:** F6
    - **severity:** minor
    - **where:** docs/slice2-plan.md:3092 (builder 2b1b decided (G0)) versus §4.9 line 1874; packages/core/src/review/judge.ts:294-305 and :411
    - **problem:** Plan §4.9 makes G0 one of judgeState's global rules for every purpose. The builder moved G0 to the engine, which is a reasonable decision, but the hand-off only says '2b3 adds its findings to the step's'. `global`, and therefore `ok`, never include G0 at stage or final. EN-2 needs every check run on exactly the final state, and the stage's 'did not pass' logic reads `ok`. A 2b3b builder who follows the note literally adds G0 only to `stepFindings`.
    - **fix:** Amend the decision's hand-off in §8, and add a note for 2b3b: the engine merges G0's findings into the judgement's `global` at every purpose (so `ok` and `stepFindings` include them), the final check included.
  - [7]
    - **id:** F7
    - **severity:** nit
    - **where:** packages/core/src/review/judge.ts:116-142 with packages/core/src/gate/sessionRules.ts:612 and :646-664; packages/core/test/review/judge.test.ts:556-557
    - **problem:** Some single problems produce two findings, against the builder's own decision 8 ('one finding per problem'):
- An arrow of the step that the person declined gets both `rejected-repeat`/`arrow` and B.3's `arrow`/`declined`, and the test expects both.
- In a Submit step, where the target is in `ended` so premise items exist, a premise draft that repeats a rejected one gets both `rejected-repeat`/`rejected` (the draft's content key is in the record's rejectedFingerprints) and `rejected-repeat`/`premise`.
    - **fix:** Report each once:
- skip `add-premise` drafts in the `rejected` loop, since `premise` covers them;
- leave the step's own declined arrows to one of the two rules, and update the test.
  - [8]
    - **id:** F8
    - **severity:** nit
    - **where:** packages/core/src/review/types.ts:414-415 and docs/slice2-plan.md:992-993
    - **problem:** The `StateJudgement.problems` contract still documents 'broken cycles' (code `scc`). Decision 10 says judgeState never emits it: planSubmit, the view and the backstop must compute it from the records. 2b2 and 2c2 builders read the contract first and may rely on `scc` arriving in `problems`.
    - **fix:** Update the contract comment in types.ts and §2.9. Either drop `scc`, or note 'not emitted by judgeState (builder 2b1b): computed from the records by planSubmit, the view and the backstop'.
  - [9]
    - **id:** F9
    - **severity:** nit
    - **where:** packages/core/test/review/judge.test.ts:411-418
    - **problem:** The test titled 'a question source counts only while its arrow exists (D2-59): its Claude arrow declined …' (§6.1: 'a question source whose Claude arrow was declined no longer counts') does not set up that scenario:
- it removes the person's own arrow, which is in B;
- it has no ledger `arrow` entry and no declined arrow item;
- it never checks `global`, which in this invalid state holds a G5 `markup`/`premises` finding for the removal.
It tests permittedFor's filter, not the declined Claude arrow.
    - **fix:** Build the real case: a base where the source's arrow into T is Claude's (a ledger `arrow` entry and a declined `add-arrow` record), the arrow absent from `premises:`, and the source still in the question. Assert that the source is in neither Q's sources nor E(T), that the proof using it is refused, and that `global` is empty.
- **checks_run:**
  - Read verify_common.md, builder_rules.md, brief 2b1b.md (with the carry-overs R1-F1, R1-F2 and R1-F3) and the builder's report
  - Read slice2-plan.md: §1 and §1.1 (the 2b1b entry), §2.7, §2.9, §4.2, §4.6, §4.8, §4.9, §6.1 (the 2b1b tests), §3.4, and §8 (the builder 2a/2b1a, fixer 2b1a r1 and builder 2b1b entries)
  - Read the spec's ES-2 preset, DO-0 to DO-3 and EN-1/EN-2, and 02_autopilot_decisions.md AP-24 to AP-29
  - Rebuilt the post-2b1a core/docs tree in my scratch dir (git archive HEAD plus git apply of after_slice_2b1a.patch, read-only for the repo) and diffed it against the working tree: only the files the report lists changed; review/index.ts and gate/index.ts are unchanged
  - Read every changed or new source file in full: gate/sessionRules.ts, review/judge.ts, review/permitted.ts, and the diffs of gate/types.ts, rules.ts, permitted.ts, describe.ts, review/texts.ts and review/reducer.ts
  - Read test/review/judge.test.ts, helpers/judge.ts, test/gate/describeSession.test.ts and the reducer.test.ts diff; checked each §6.1 2b1b item against a test
  - Traced by hand a non-target proof, a Submit step removing an open lemma with its comment or namespace pair, a mixed request followed by a later un-reject, and a step purpose without a scope through judgeState, computeItems (compareTexts, the .holds ownership rule) and the reducer
  - Compared the §4.9 texts with CLAUDE_SESSION_TEXTS, and 1b's arrow texts with edit/planArrows.ts
  - Checked that orderFindings keeps evaluateRules' order and that every code judgeState reports is in an order list
  - Ran no builds or tests (read-only lens); wrote only inside the scratch dir v2b1b-spec
