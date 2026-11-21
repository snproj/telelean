# fix:r2

Agent `a3ad25ff888ed4ada` of workflow `wf_3842fba8-348`. Verbatim output (JSON alongside).

- **summary:** I applied all 9 findings to /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/plans/slice5-plan.md, which is the only file I edited. I changed no other file, ran no tools that build or test, and left git alone.

Where the changes landed:
- **§0, §1 and §1.1 (scopes):** 5d now covers three runner files, adding run/step.ts. `frozenFindings` takes `subject` from 5a on, from every caller. `planTypedWrite` gains `base` in 5c2. The re-mirror runs on the plan's result and is off for `set-freezes`. The 5d scope lists the walk stop, the valued holds, the held statements and declarations, and the new window problems.
- **§2.5 (contracts):**
  - `referenceHolds` gains `stop`.
  - `heldFields` gains `transforms`. Its walk stops at any key a live TransformFreeze covers and continues through that TransformFreeze's own map.
  - `pendingHolds` now applies only while a TransformFreeze is pending.
  - New `transformHolds` gives the held map wherever a judgement values a sentence or Why TransformFreeze. It returns undefined, so the freeze stays pending, when a declaration its references hold has no meaningKey.
  - `FreezeTable.transforms` is new.
  - `refExceptions` gains `marks`, and at step purposes comes from the running step's inference only.
- **§2.6 (what slice 4 must keep single):**
  - Every detached field is a follow-on key (`typed: false`).
  - A trashed card's fields are among `plan.keys`.
  - `planTypedWrite` takes `base`.
  - Slice 4's valuation points are each a single call.
  - `sessionFrozen` is widened at the step start in run/step.ts.
- **§2.8 (texts):** five new window problem texts, and a held absent name uses the `revived` texts.
- **§3.4–§3.7 (design):** rewritten where these rules apply.
- **§4.1 (picker keys):** IME, arrow keys, Tab and blur.
- **§5 (board stack):** a freeze action's step writes ids only.
- **Tests, cheats, decisions, log:** the 5a, 5c1, 5c2, 5d and 5f1 tests and the Playwright drafts are updated. Cheats 12 and 13 are added, and the coverage row cites them. Decisions D5-5, D5-7, D5-9, D5-12, D5-19 and D5-21 are updated, each with its alternative and how to reverse it. The user guide notes the new narrowings. The change log has an "ultra review round 2" line.

Three deliberate departures from the fixes as worded, each explained under its finding id:
1. S5R2-01: a TransformFreeze's map holds things whenever its key is frozen for any reason or is held through another card's reference, not only when frozen for another reason.
2. S5R2-03: the window problem is built in 5d, not 5c2.
3. S5R2-07: the new problem replaces the detach only when the trashed card's sentence is Claude's and B lacks the card.
- **dispositions:**
  - [1]
    - **id:** S5R2-01
    - **action:** fixed
    - **note:** What changed:
- §3.7, §2.6, D5-12: every field a detach writes is a follow-on key (`typed: false` in `plan.keys` and `typedKeys`, D4-34). It gets a follow-on TransformFreeze: no reason of its own, no 'frozen: you typed it' row, no keep tick. So D5-19 sets aside every holder's expectation of it, and the Submit cascade sees the key.
- §2.5, §3.6, D5-19: heldFields' walk stops at any key a live TransformFreeze covers, through `referenceHolds`' new `stop` set and the new `FreezeTable.transforms`. Beyond that key it holds only that TransformFreeze's own map, never B's version.
- §3.7, §2.8: the cards that refer to a detached field are warnings ('Refers to it, and will read: ‹text›.').
- Tests: 5c2 and 5d get every test the finding lists, plus a mutation.

One refinement: the TransformFreeze's map holds things when its key has any reason of its own, or when it sets aside some holder's expectation, not only when the field is frozen for another reason. As written, unfrozen A held by frozen B would lose B's transitive hold on A's remaining or new references, which reopens S12 through A.

One addition: §2.6 requires, for the builder to confirm, that a trashed card's fields are among slice 4's `plan.keys`, which slice 4 already defines as every key whose value the plan changes. This covers stored flat maps, such as an own `{ from: 'state' }` freeze that reaches c through A, which the walk stop cannot reach.

Remaining residual, logged in D5-19: a stored flat map over-holds what it reached through a field the person later changes, which fails closed.
  - [2]
    - **id:** S5R2-02
    - **action:** fixed
    - **note:** The rule is now stated by valuation in §2.5, §2.6, §3.6 and D5-19:
- New `transformHolds(m, subject, target)` gives the held map wherever slice 4 values a sentence or Why TransformFreeze: the typed judgement before Claude's turn, a later judge-apply, or the queue end.
- It returns undefined when a declaration that its references hold has no meaningKey in m. The freeze then stays pending and holds through `pendingHolds`. So slice 4's 'a meaningKey for every declaration it covers' now counts those declarations, which prevents inexact held values.
- Other targets keep slice 4's own map, which `holdingMap` with no fields equals.
- §2.6 lists the valuation points as single calls.
- D5-19's 'from the queue end' is corrected.
- 5d tests: a typed Why valued at the typed judgement keeps holding through a later whole-model step, with a mutation; one left pending after a failed probe holds through `pendingHolds`.
- New cheat 13.
  - [3]
    - **id:** checks-S5-SOUND-09
    - **action:** fixed
    - **note:** `transformScopeOf`'s `sessionFrozen` (§3.6, §2.6) now also leaves out of `open` every Lean statement or vocabulary declaration whose declarations are reference-held at S₀, taken from heldFields and from the own, accepted and TransformFreeze maps. It also leaves out the statements and declarations in the meaning closure of what the transform's own typed and detached text refers to. The turn lists these under HELD, the window marks them, and a fuzzy one is a problem.

A TR-13 dependent left to Claude whose Lean is reference-held is now a window problem, with two §2.8 texts: one for a frozen holder, one for the person's own typed reference. A holder that is frozen only as accepted is excluded, as D4-21 does, since the Submit cascade returns it to review.

D5-9 updated; 5d tests for both cases.
  - [4]
    - **id:** S5R2-03
    - **action:** fixed
    - **note:** What changed:
- §3.5 and D5-21: 'uses' exempts only names that no frozen card's reference holds.
- §3.6 'Absent names', §2.8: a held key expected absent through a reference reaches Claude with `CLAUDE_REF_TEXTS.revived`, and the person with the `revived` text, under `held`'s code.
- A MUST DEFINE name held absent through a reference is a window problem, with the finding's text. A typed declaration takes the name out of MUST DEFINE and is revalued through its own TransformFreeze (D5-19).

One departure on placement: the analysis problem is built in 5d, not 5c2. Detecting names held absent directly or through held sentences and Whys needs 5d's walk; the `revived` narrowing stays in 5c2.

Tests: 5c2 and 5d. §0's known test changes now note that 5c2's `revived` case for a frozen card's token becomes a `held` finding from 5d on, by the one-message rule.
  - [5]
    - **id:** S5R2-04
    - **action:** fixed
    - **note:** (a) In §3.6 and D5-9, when a target's question is its mark, the mark may go together with an arrow added into it, which is AR-5's accepted premise. Removals are still compared. `refExceptions` gains `marks` to carry this.

(b) At step purposes, `refExceptions` comes from the running step's inference only: its target, the ends of its selected arrows, and its mark. At stage, final and in the backstop it comes from every inference. This is stated in §2.5 and §1.1 5d. `proposeArrowProblems` now names 'the running step's target'.

5d tests for both, with a mutation; new cheat 12.
  - [6]
    - **id:** S5R2-05
    - **action:** fixed
    - **note:** In §3.4 the re-mirror hook now reads names from the plan's result. It re-parses the files the plan changed (markup only, no Lean job), so new, edited and deleted cards resolve as the plan leaves them. `set-freezes` writes ids only and never re-mirrors, per FZ-9; this is stated in §1.1 5c1, §3.4, §5's board stack and D5-7.

5c1 tests:
- an edit-node that rewords the referenced card re-mirrors referrer A in the same plan, with a mutation;
- a delete-node re-mirrors a referrer to 'deleted card';
- a freeze action changes no docstring, even when it writes ids.
  - [7]
    - **id:** S5R2-06
    - **action:** fixed
    - **note:** 1. run/step.ts joins 5d's runner files (§1, §1.1, §2.6): `pendingHolds` at the typed write, `transformHolds` at the typed judgement, and the held keys for `sessionFrozen` at the step start. The other valuation points, the judge-apply and the queue end, are mapped by the builder in §8.
2. `frozenFindings` gains a required `subject` in 5a, together with the hook's move. Every caller passes it, the runner's re-runs included. This is stated in §0, §1.1 5a, §2.4 and §2.5; core test fixtures are updated.
3. `planTypedWrite`'s session input gains `base: ProjectModel` beside its ledger, for `detachRefs`' choice of words (§2.6, §3.7, §1.1 5c2, tests).
  - [8]
    - **id:** S5R2-07
    - **action:** fixed
    - **note:** In §3.7, D5-12 and §2.8, a referrer is not detached when the trashed target's current sentence is Claude's and B lacks the card, such as a written premise or an `add_card` card. Instead the window shows the finding's problem. The problem goes once the referrer's draft drops the token or the referrer is trashed, since a referrer in the window counts by its draft's text.

One narrowing: the condition keeps 'its current sentence is Claude's'. A card the person made in an earlier transform also lacks a B version, but its sentence is the person's typed unit, so detaching it with those words is correct, and 'which Claude made' would be false for it.

5c2 test added; the guide notes the narrowing.
  - [9]
    - **id:** S5R2-08
    - **action:** fixed
    - **note:** Changes in §4.1:
- The capture handler ignores keydown while `isComposing` is set or `keyCode` is 229.
- ← is taken only in the field list; → only in the card list with the caret at the end of the query. Any other arrow key moves the caret.
- Tab closes the picker without preventDefault, so the focus moves.
- Neither Enter nor a blur commits while the preview shows a problem: InlineEdit stays open with the problem shown (UI-16's case).

D5-5's cost sentence is updated. New `pickerReduce` unit cases and Playwright drafts cover IME composition with Enter, Tab moving the focus, and a click away with a problem shown.
