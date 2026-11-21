# verify:2b1a:spec

Agent `aaa26cfa8bb3c000f` of workflow `wf_ae5f1188-533`. Verbatim output (JSON alongside).

- **summary:** Fidelity review of sub-slice 2b1a (read-only; no builds or tests run). To isolate this sub-slice's changes, I rebuilt the pre-2b1a tree in my scratch dir (HEAD plus after_slice_2a.patch) and diffed it against the working tree. Only these files changed: gate/rules.ts, review/reducer.ts, review/types.ts, three review tests, the new test/gate/ruleHelpers.test.ts and docs/slice2-plan.md. Runner, webview, extension and test-fixtures are unchanged, and git is at 187673d with nothing staged.

The refactor matches the plan's §1.1 and §2.7 entries:
- **Code lines kept.** A multiset comparison of the code lines of the old evaluate() against the new helpers shows only two kinds of difference: the `push(` → `out.push(` sink rename and the restructured lines (the context, the composition and the return).
- **Order and output.** The helpers run in the original push order, so `orderFindings` gives the same grouping. `buildFailed` equals the old `g1` read. The helpers are pure, so the changed evaluation order cannot matter.
- **Contracts untouched.** gate/index.ts is unchanged and does not re-export the helpers. There is no new rule, finding code or token, and no existing gate test changed.
- **Harness.** The builder's differential harness compares against the true pre-2b1a rules.ts.

All six carry-overs are done as their fixes say:
- **S-V2A-S2:** the quiet path is `hidden || hiddenAfter`, dependencies are read at request time (decision 3), the RV-7 check uses the class after the Undo, and §8's fixer 2a note on hidden items (old l.2875, now l.2888) is corrected. The P1/P1b, decide-that-shows and shown-Undo tests trace correctly.
- **R1-1:** un-reject now reads the declining action's `takenOut`, which drives `reapply` for a premise that comes back and `premises.takeOut` for one kept out, and the written-again guard is in place.
- **R1-2:** the reveal action gains required `takenOut` and `commits`, Undo handles both action kinds, and §2.2 and §8 are updated.
- **R1-3:** all 8 untested paths have tests.
- **R1-4:** stated in types.ts, §2.9 and the "For 2e" bullet.
- **R1-5:** `leftNeedsOption` is used, and §3.5 now points to the content refresh.

Tests match the report (9 + 11 + 3, the V2A-S4 test extended).

Remaining problems (none blocker or major):
1. Undo of an R1-1 un-reject misreads a premise that was taken out again and is now in review: it treats the premise as a written v1 ghost. The result fails closed but leaves an inconsistent record.
2. A narrow RV-6/D2-64 leak remains through the RV-7 check the brief told the builder to keep on the class in force after the Undo.
3. `ItemWrite.premises.takeOut`'s field doc contradicts R1-1's use of it.
4. Nit: the random property checks only `taken`.
- **findings:**
  - [1]
    - **id:** F1
    - **severity:** minor
    - **where:** packages/core/src/review/reducer.ts:1157-1165 (Undo's takenOut loop), with reducer.ts:581-587 (R1-1's premisesOut) and records.ts:42
    - **problem:** R1-1 lists in `premises.takeOut` a written premise whose status the un-reject does not change (declined, or in review after its own un-reject or a re-proposal). It sets the premise's `card` but does not record it in the action's `changes`, because only `card` changed. The runner's step 4 then records it in that un-reject's `takenOut`, as §2.2 says. Undo of that un-reject runs `inWorkingCopy(r.kind, r, t.card)` on the unchanged record. For an in-review Add premise, any card makes it count as a written v1 ghost (records.ts:42). So the Undo puts the old card and key back on the record and lists the premise in `reapply`, although inverting the un-reject's commit (merge, then take-out) leaves the card out of ws/. The record then claims a written premise that is not there:
- an Accept schedules no premise write, because writeOf needs `card` undefined;
- `holdAs: 'pending'` is refused with writtenAsAxiom;
- Apply is refused with `not-written` until a reload re-enqueues the write.

A Redo of the un-reject then counts the premise as 'written again since' and leaves the merged-back card unowned. It fails closed, but the state is inconsistent and the user is stuck. No test covers Undo of an R1-1 un-reject.
    - **evidence:** Hand trace:
1. Results shown; V and the written premise P accepted. A group Reject [V, P] (action G) gives G.takenOut=[P].
2. Un-reject P: P goes to in-review, with no merge.
3. Un-reject V (action U2): mergedBackBy(V) finds G. P is in-review with no card, so `written` is defined: `x.card='p-card'`, premisesOut, write takeOut [P]. P is not in U2.changes. The runner's step 4 records P in U2.takenOut.
4. Undo U2: P is in-review, and inWorkingCopy('add-premise', P, 'p-card') is true, so P.card='p-card', P.fingerprint=t.fingerprint, and the write has reapply [P].
    - **fix:** In Undo's takenOut loop, put a premise back (card, key, premisesBack) only when it is among `top.changes` and its restored status keeps it in ws/. Use `inWorkingCopy(r.kind, r, t.card, c.before)` with that change's `before`. Send every other takenOut premise to premisesOut without touching its record. Add a reducer test for the trace above, and for the Redo after it. Optionally state in §2.2 that a take-out of what the write's own merge brought back is recorded in `takenOut` without ledger entries.
  - [2]
    - **id:** F2
    - **severity:** minor
    - **where:** packages/core/src/review/reducer.ts:1051 (`const cls = w.classOf(r, after)` in listedAcceptRefusal); plan §8 'builder 2b1a (carry-over S-V2A-S2)'; AP-28 decision 3
    - **problem:** Take an Undo asked while the results are hidden that would show them. It checks a listed restored Accept's RV-7 badges against `classes`, which counts the premise drafts, and those drafts are hidden Results' parts. The refusal ('‹item› needs your own Accept…') is returned while the results stay hidden. So whether the Undo is refused depends on whether a hidden premise draft reaches the item, i.e. usually on whether the target was proved. This is the D2-64/RV-6 channel S-V2A-S2 closes for dependencies; it stays open for RV-7 because the brief said to keep the after-class. A by-hand Accept now reads `classesBeforeReveal`. decide, and an Undo for items it does not restore (reducer.test.ts:922), apply `classes` only through D2-23 once the results are shown.

Reachability is narrow. A listed definition D accepted with belief=false must still be accepted while the results are shown. That happens when a show skipped D2-23 because the stage judgement was partial (ADV-3; R1-4 keeps partial maps in ReviewState). An action in that window then hides the results and takes D's Accept away, and its Undo is asked while hidden.
    - **evidence:** Synthetic scene, in the style of the existing tests:
- card:a accepted; decl:D accepted (group, belief false), resting on card:a; review card:a (confirmed), so the results are hidden.
- Set classes[D]=BELIEF only (a draft reaches D).
- undo → refused `leftOwnAccept('Definition D')`, and the results stay hidden. With classes[D]=PLAIN → ok.

The two copies differ only in a hidden premise draft.
    - **fix:** Read RV-7 with `w.classOf(r, now && after)`: `classes` only when the results are shown both before and after, else `classesBeforeReveal`. This keeps ADV-4's after-class when an Undo hides the results. When the Undo shows them, its existing `showResults` call already applies D2-23 and returns the item with an event, as decide does. Add a test pairing the two copies above with byte-identical answers, and amend the §8 S-V2A-S2 note.
  - [3]
    - **id:** F3
    - **severity:** minor
    - **where:** packages/core/src/review/types.ts:478-483 and docs/slice2-plan.md:982-986 (ItemWrite.premises.takeOut field doc), versus the R1-1 paragraph at types.ts:455-461
    - **problem:** The field doc still says `takeOut` holds premises 'this action gives a status whose content is outside ws/' and that 'the write takes out those that are written when it starts'. R1-1 now puts there premises whose status the un-reject does not change (declined, in review, kept out by another taker) and that are not written when the write starts: their ledger entries are gone, and their card returns only with the write's own merge in step 2. A 2e runner that follows the field doc skips them, leaving the merged-back card in ws/ with no ledger entry. That card is unowned and disables Apply: the R1-1 bug again. The R1-1 paragraph contradicts the field doc instead of amending it. It also says the runner restores 'the ledger entries the declining action's takenOut recorded' without saying how the runner finds that action; the reducer's mergedBackBy is internal.
    - **evidence:** types.ts:482 says '…the write takes out those that are written when it starts', while types.ts:459-460 says '…in `premises.takeOut` when its status keeps it out (its record holds the card again, so the runner can plan the take-out, after the merge…)'.
    - **fix:** Amend the takeOut field doc in types.ts and §2.9. It should say that takeOut also holds the written premises an un-reject's inverse merge brings back that their status keeps out, and that the runner takes these out after the merge, planned from the record's `card`, whether or not a ledger entry exists. Also name how the runner finds the takenOut entry: the stack action whose `commits` hold the un-rejected item's `decline.commit` (read before the action). Alternatively, carry the entries in the write.
  - [4]
    - **id:** F4
    - **severity:** nit
    - **where:** packages/core/test/review/reducer.test.ts:1370 (random property 'no decision names a hidden item')
    - **problem:** The random property checks only `outcome.taken`. Builder 2b1a's answer rule for decide and Undo (decision 4: `cascade` and `events` name only items listed both before and after) is pinned by two hand-built scenes only. A regression that names a hidden Result in a cascade or event on another path would pass the random sequences.
    - **evidence:** Line 1370 checks `for (const id of outcome.taken) if (named.includes(id)) …`; `cascade` and `events` are never inspected in the random run.
    - **fix:** In the random run, record whether the results were hidden before each action. For every ok outcome of an action asked while they were hidden, assert that no `cascade[].item` and no `events[].items` entry is a Result or a Result's part (`kind === 'result' || partOf !== undefined`).
- **checks_run:**
  - Read verify_common.md, builder_rules.md, brief 2b1a.md, plan §0, §1, §1.1, §2.2, §2.6, §2.7, §2.9, §3.5, §3.6, §3.8, §4.5–§4.9, §6.1, §7.2, §7.4 and §8 (2a and 2b1a entries), spec RV-3/RV-5/RV-6/RV-7/DO-0/DO-1/UN-1–UN-6, and 02_autopilot_decisions AP-24–AP-28
  - Rebuilt the pre-2b1a tree (git archive HEAD + after_slice_2a.patch) in my scratch dir and diffed core and docs; confirmed the changed-file list matches the report
  - Diffed runner, webview, extension and test-fixtures against the 2a patch state: no changes
  - Multiset comparison of the code lines of the old evaluate() against the new helpers (python script in scratch): only push→out.push renames and the restructure lines differ
  - Checked the composition order against the original push order, orderFindings against the old `ordered` expression, buildFailed against g1, the footprints record, declarations copies and helper purity; verified gate/index.ts is unchanged and does not re-export the helpers
  - Inspected the builder's differential harness (setup.ts, rules_orig.ts equal to pre-2b1a rules.ts apart from import paths)
  - Compared each carry-over's implementation with the full finding text in scratchpad open_2a.json and the re-verifier's probe P2
  - Hand-traced the new reducer tests (P1, P1b, decide-that-shows, shown-Undo, P3, R1-1 ×3, R1-2/V2A-S4, R1-3) and the reconcile tests against the code
  - Hand-traced Undo of an R1-1 un-reject (found F1) and the RV-7 after-class at an Undo that shows the results (found F2)
  - Checked plan and types.ts consistency for the reveal SessionAction, ItemWrite, ReviewState.deps, and the §3.5 and §8 edits
  - Read-only git: log -3 and diff --cached (HEAD 187673d, nothing staged); grep for it.skip/only (none)
