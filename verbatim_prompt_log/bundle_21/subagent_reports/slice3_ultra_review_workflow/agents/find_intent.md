# find:intent

Agent `ac528dfb138bbf63a` of workflow `wf_84d1f5cb-1a7`. Verbatim output (JSON alongside).

- **summary:** I compared the plan with the user's own words, clause by clause: prompt20's FROZEN 1–5, REVIEW 3, 5, 7 and 8, TRANSFORM 4–5, DECLINE OPTIONS 3 and INITIATING 3; prompt21's ¶3, ¶5, ¶6 and ¶11; and the mid-turn D1, D3 and m3. I also checked the spec clauses the plan implements (§5, ES-2, RV-4, EN-2, TR-5, TR-10, DO-3) and the round-1 and round-2 dispositions.

**Faithful, and the reasoning holds:**
- An Accept freezes "until its status is changed by the user", and reconcile never unfreezes (D3-4).
- Only the person unfreezes. The request card has no unfreeze button, which matches FROZEN 2's mechanical unfreeze.
- Keep ticks default off, so REVIEW 7's full restore is the default.
- D3-1's reasoning holds, since REVIEW 5's mid-stage Formalize would otherwise be blocked.
- D3-9 drops "Allow this change". That is closer to FROZEN 2 ("not because the user has given approval") than the spec is, so its reasoning holds.

**Two round-2 changes create new fidelity problems:**
- The reversal of D3-44 (R2-12).
- The fail-closed meaningKey rule (D3-2, D3-51) when the probe is off.

**Findings: 1 blocker, 3 major, 6 minor, 2 nits.**
- **Blocker:** a vocabulary freeze of another subject's item (TR-10) is stored where the owning subject's sessions never read it. Claude can therefore change content the user froze.
- **Major:**
  - D3-44 makes ordinary board edits permanent standing freezes, and an emptied field is frozen empty. That goes against TRANSFORM 4, TR-5 and the user's ★D3 "easy way to make the entire model unfrozen".
  - DECLINE OPTIONS 3 ("removed / split into more cards") has no slice at all: §3.12 says "D2-15 stays" for slice 4.
  - In slice 1's probe-off mode, every Apply is refused, with a "reload the window" remedy that cannot work.
- **Minor and nits:**
  - REVIEW 5's "ask the user to … unaccept" cannot be granted during a step, and a request answered with Continue drops out of the stage report.
  - A whole-model step can be discarded by a freeze, with no warning.
  - D3-6's refusal for queued targets has no stated reason.
  - Exit's "Your files are not changed" becomes false.
  - The text of Formalize's ▾ promises more than it delivers.
  - Upgraded sessions refuse every Accept.
  - FZ-4's Result list is missing.
  - The row text does not do what REVIEW 8 asks.
- **findings:**
  - [1]
    - **id:** FID-1
    - **severity:** blocker
    - **where:** §2.2 FreezeTarget 'vocab' ("fully qualified Lean name, any subject's (TR-10)"); §2.6 set-freezes (subject = the board's); §3.1 'One subject' ("So no other subject's standing freeze can be broken"); §3.3 Standing; §3.5 'Other subjects'; §3.2 heldValue ("text without the docstring"); boardFreezesView
    - **problem:** The user's FROZEN 2 says: "Claude can *never* edit a frozen card under any circumstances." FROZEN 4 lets the user freeze any visible card, and TR-10 says other subjects' vocabulary "can be frozen".

The plan stores such a freeze in the freezes.json of the board where it was made. A session on the subject that owns the declaration loads only its own freezes.json, and that subject's board does not show the lock.

The only remaining protection is the other-subject rule. It compares held values, which leave out the docstring (the gloss field), and it covers the declaration only while the freezing subject still reaches it in B. So §3.1's claim is false for exactly this case. The record can also become invisible: it is not 'not found', so A6 does not list it.
    - **scenario:** 1. S1's Vocabulary column shows S2's `InGame` read-only, because S1 uses it.
2. The user selects it and chooses Freeze. The records {vocab InGame, declaration} and {vocab InGame, gloss} go into S1's freezes.json.
3. On S2's board, where no lock shows, the user runs Formalize for dependencies (whole model) for a notion of time.
4. Claude rewrites InGame's docstring. S2's table has no record, heldValue ignores docstrings, the backstop passes, and Apply writes it.
5. Back on S1's board, InGame still shows a lock, now with Claude's gloss.

Variant: the user hand-edits S1 so it no longer uses InGame. S1's board stops showing InGame, so the record is invisible. A whole-model session on S2 then changes InGame's definition.
    - **fix:** §2.6 and §3.6: store a vocabulary freeze in the freezes.json of the subject that owns the declaration (the `subjectOfPath` of its module), whichever board it was made on. EditPlan.freezes names that subject; it is still one board step of the board where the freeze was made. A session's kept freezes for such items are written there too, at Apply or Exit. boardFreezesView of every subject reads the records naming its own declarations and those shown in its columns.

Alternative, read-only: §3.3's standing snapshot also takes, from every other subject's freezes.json, the records naming a declaration of the session's subject. Their expected value is B's, and they cannot be unfrozen in the session: "Frozen on ‹S1›'s board: unfreeze it there."

Either way:
- correct §3.1;
- add cheat 24: freeze S2's gloss on S1's board; a whole-model step on S2 rewrites the docstring → refused `frozen` (`gloss`);
- add tests in 3a and 3d.
  - [2]
    - **id:** FID-2
    - **severity:** major
    - **where:** D3-44 (§7.2 item 44, reversed by R2-12); §2.6 'FROZEN 1' bullet ("an emptied field is frozen empty"); §3.1; §5.1; header; §4.8; interaction with ES-2's 'Open the whole model'
    - **problem:** D3-44's reasoning ("as the user's FROZEN 1 says … the user's D1 answer re-allowed board edits … and did not withdraw it") does not hold.

(a) The user wrote FROZEN 1 ("applied … when the user manually edits a field") while direct edits were forbidden: "The user should not be able to edit fields directly on the \"Current\" tab" (INITIATING 3). A manual edit was then always a transform edit inside a session: TRANSFORM 5, "manually fill in a card's fields, which would make that field FROZEN". The spec makes that a session freeze (TR-5), which FROZEN 3 removes when "that same session has ended". D3-44 instead turns every board edit into a permanent standing freeze, which the user never described.

(b) "An emptied field is frozen empty" reverses TRANSFORM 4 ("if the user doesn't specify a value, Claude will try and autofill it") and TR-5 ("Clearing a field makes it fuzzy").

(c) ES-2's preset already fixes every sentence, Why, stance and source in narrow steps. So these freezes bind only whole-model steps, which is exactly where ★D3 asks for "an easy way to make the entire model unfrozen … subsystems throughout the entire model, such as a concept of time". Open the whole model keeps standing freezes, the first queue starts at once, and an Unfreeze made on the board before the session is permanent. The switch therefore silently leaves alone every field the user ever edited.

D3-44 itself excludes the A|P box for this reason ("leave Open the whole model nothing to reword"), but not edits. So fixing a typo freezes a sentence that typing it at creation did not.
    - **scenario:** Over a week, the user fixes typos in 30 cards' sentences on the board, and clears one wrong Why so that Claude can rewrite it.

The user then runs Formalize for dependencies (whole model) to add a notion of time:
- Claude's FROZEN BY THE PERSON section lists the 30 sentences and the empty Why;
- Claude may reword none of them, nor fill the Why;
- the ▾ text says Claude may change "any card … that is not frozen", and the user never knowingly froze anything.
    - **fix:** Preferred: restore round 1's choice. Board edits outside a session do not freeze. Give the reason above: FROZEN 1's edit freezes are TR-5's session freezes in the transform window (slice 4). The user guide says "to protect a field from Claude, freeze it".

If D3-44 is kept:
1. An edit that empties a field removes that field's standing freeze instead of freezing it empty (TR-5).
2. With Open the whole model on, Formalize's ▾ shows "‹n› of your standing freezes still hold" with a tick "Unfreeze them for this session". The tick puts every standing key into `standingCleared` in the session's first run.json write, before the first step. FZ-8 restores them at the end, with keep rows.
3. Log it as D3-52, with the alternative "standing freezes always hold (S21, AP-14 d)", and add a 3e2 test.
  - [3]
    - **id:** FID-3
    - **severity:** major
    - **where:** §3.10 'Submit with whole-model steps' ("D2-15 still holds for a Shaky set: no splits or merges of the declined cards"); §3.12 'Slice 4: … D2-15 stays (no Shaky splits)'; D3-14 (alternative 'delete in Shaky steps' rejected); D3-42
    - **problem:** The user's DECLINE OPTIONS 3 says: "Mark the card as \"shaky\"; i.e. Claude can do what it wishes with the card … some might be the same but others could change or be removed / split into more cards etc." The spec follows it: DO-3 ("keep, change, remove, split or merge"), TR-7 ("Splitting a Shaky card is always allowed") and CF-3 ("when splitting a Shaky card").

Slice 2 deferred this (D2-15, "without the transform rules"). Slice 3 builds the mechanisms, delete_card and add_card, but:
- forbids them in Shaky steps (D3-14);
- lists "D2-15 stays" among slice 4's hooks.

So no slice ever delivers Shaky removal or splitting, and no AUTOPILOT DECISION tells the user.
    - **scenario:** The user accepts 2 of 5 cards and declines 3 as Shaky, so that Claude can "reshuffle" them: drop one, split another.

At Submit, Claude may only re-propose the content of the same 3 cards, and otherwise reports "no alternative found". Even a whole-model Submit step, which has delete_card, may not use it on its own Shaky card.
    - **fix:** §3.12: replace "D2-15 stays (no Shaky splits)" with "slice 4 lifts D2-15 with TR-7: a step that reworks Shaky items may split a declined card (add_card) and remove one (delete_card), under DO-3's not-identical check".

Then do one of two things:
- build Shaky removal now: in 3c1, delete_card is allowed in a Submit step on that step's own Shaky cards, whatever the switch;
- or log D3-52, "DO-3's remove, split and merge (DECLINE OPTIONS 3) wait for slice 4", with that alternative, and list it first in the AP entry for the user's review.
  - [4]
    - **id:** FID-4
    - **severity:** major
    - **where:** §2.1 ('Missing meaningKey fails closed', 'Base facts'); §3.4 step 3 (accepted items' held names always compared); §3.5 (inexact refuses at final); D3-2; D3-51; AP-21's probe-off mode
    - **problem:** No clause of the user's covers this, but the user would hit it head-on: Apply becomes impossible.

Slice 1 keeps a probe-off mode. AP-21: "if your model declares a name that clashes with the probe's imports, the check runs again without the probe. You keep your facts". 3p's meaningKey comes from that same value probe, so in this mode no declaration has one.

From 3b, every Accept stores held maps (RV-4), which are always compared. So every session that accepted anything is inexact at the final check, and Apply refuses with "reload the window to check the base again", which cannot help. The same happens for any held declaration whose Repr is over 2 MB.

Also, the rule "when base-facts.json lacks meaningKey … the next judge runs checkBase once more" fires at every judge in this mode, adding a full base check each time.

Slice 2 could Apply such sessions, and Appendix B allows meaning compared "at least by fully explicit printing". Neither this regression nor the narrowing is logged.
    - **scenario:** A model whose top-level declaration clashes with the probe's imports. The user formalizes, accepts every item and presses Apply: "telelean could not compare what ‹T›.holds means in Lean: reload the window…". After a reload the result is the same, and every judge in the session ran an extra full check of the base.
    - **fix:** §2.1: state the probe-off case.
- Base facts are re-checked at most once per session; record in the session that the probe is off.
- The refusal names the real cause and remedy: "your model declares ‹name›, which the meaning check needs: rename it", or "‹name› is too large to compare in Lean".

Add to D3-2 the decision whether probe-off sessions may Apply on Appendix B's minimum (D2-41's comparison, with a visible note "meaning compared by printing only") or never, with its alternative.

Add a 3d test with the probe off.
  - [5]
    - **id:** FID-5
    - **severity:** minor
    - **where:** D3-7; §3.6 phases table (step: "Unfreeze accepted … no"); §3.9 row text ("accepted: unfreeze it after this step ends"); §2.4 StageReportView.requests ('kept-frozen' | 'cancelled' | 'failed' | 'step-ended')
    - **problem:** The user's REVIEW 5 says Claude "should never edit currently \"accepted\" / frozen cards, but may ask the user to unfreeze / unaccept them if it thinks it is important."

Under D3-7 the person cannot return accepted content to review while a step runs, even while the step is paused on Claude's own request. So a request about accepted content, or about content it holds, can never be granted within that step.

If the person then answers Continue, the request is not in the stage report, which lists only kept-frozen, cancelled, failed and step-ended requests. Claude's ask is lost.

D3-7 is logged as narrowing FZ-9 and FZ-10, not REVIEW 5.
    - **scenario:** Claude calls request_unfreeze to change the accepted Formalize of "PG games cannot have characters with dark pasts". The card says "accepted: unfreeze it after this step ends". The user presses Continue, Claude finishes not proved, and the stage report never mentions the request.
    - **fix:** §3.9 and §4.6: when a requested item is accepted, or held by an accepted item, the card says "To let Claude change it now: Cancel step, return it to review, then Retry step." and offers [Cancel step].

§2.4: StageReportView.requests also lists answered requests that left items frozen (`ended: 'answered-still-frozen'`), with Select them.

D3-7 states that it narrows REVIEW 5's "ask the user to … unaccept".
  - [6]
    - **id:** FID-6
    - **severity:** minor
    - **where:** §3.8 'Filling now' and 'A freeze the step cannot meet'; D3-50; §4.4
    - **problem:** FROZEN 4 says "at any time", and FZ-10 promises that freezing while Claude works costs Claude only an uncounted check.

D3-50 instead ends the step and rolls it back to S₀, discarding all its work, when the person freezes content the step already changed and fixed. 'Filling now' warns only for empty fields. In a whole-model step, any unfrozen sentence, statement or definition may already have been changed, or a card deleted with delete_card. So a Freeze, or Freeze all other cards, on the version the person sees (J) can silently end a long step.
    - **scenario:** Twenty minutes into a whole-model step, the user freezes "Spyro is PG"'s sentence as shown in J. Claude had reworded it and called freeze_statements. The step ends at once, not proved, and its work is gone; nothing warned the user.
    - **fix:** §3.8 and §4.4: while any step of the running queue has the whole model open, ask first before every freeze action on content of the subject, and before an Undo or Redo that gives such content a reason: "Claude's whole-model step may already have changed ‹x›. If it has fixed its statements since, the step ends without a result and its work is discarded." [Freeze] [Cancel].

Say the same in D3-50 and the user guide, and add a 3g test.
  - [7]
    - **id:** FID-7
    - **severity:** minor
    - **where:** D3-6; §3.6 'Not freezable' ("while a queue runs, those of its targets"); §5.3 Undo refusal
    - **problem:** In T21 ¶5 the user says: "I need to add the capability to freeze arrows … as well as to freeze the *set* of dependencies of a card". FROZEN 4 says "at any time".

D3-6 refuses freezing a target's Proof, Dependencies and mark while its step is queued or running. Its only stated reason, that the Exit list would tell a hidden outcome, applies while results are hidden. A queued target whose step has not started has no outcome at all, and freezing its Dependencies only narrows that step.
    - **scenario:** A three-target queue is running. Before T3's step starts, the user wants to stop Claude adding arrows into T3. The freeze is refused with "“T3”'s proof can be frozen once its result is shown."
    - **fix:** In D3-6 and §3.6, allow freezing a queued target's Proof, Dependencies and mark until its step starts. Its step reads the table when it starts, as for a standing freeze.

Keep the refusal for the running target, and give its real reason: D3-50, its propose_arrow entries cannot be withdrawn.

Add a 3b test.
  - [8]
    - **id:** FID-8
    - **severity:** minor
    - **where:** §5.4 ('An empty Apply … with ticks, and Exit with ticks': `id:` of kept derived-id cards; 'The ids at Apply'); §4.7; D3-16, D3-37; slice 2's Exit text ("Your files are not changed")
    - **problem:** REVIEW 8 says: "There should be a warning/confirmation popup before an edit session ends … This window should also tell him which cards / card fields will be automatically frozen / unfrozen".

The Exit dialog keeps slice 2's "Your files are not changed". But with keep ticks on derived-id cards, the follow-up board step writes `id:` lines into the user's Lean files.

Apply writes `id:` lines into every file of the subject, including files no item touched, and its confirmation lists only the items. Only the user guide says so.
    - **scenario:** The user exits with one kept freeze on a card whose id is derived. The dialog said "Your files are not changed", yet git shows an `id:` line added to that card's Lean file. After an Apply of one item, git shows `id:` lines in five files.
    - **fix:** §4.7: when kept rows name derived-id cards, the Exit dialog's sentence becomes "Your files are not changed, except that keeping these freezes writes the id: line of ‹n› cards."

Apply's confirmation adds: "telelean also writes the id: line of ‹n› cards into ‹m› files (no change in meaning)."

Add a 3g test.
  - [9]
    - **id:** FID-9
    - **severity:** minor
    - **where:** §4.8 ▾ text; §3.10 'Step limits with wholeModel'; §3.5 'Other subjects'; D3-41; D3-12
    - **problem:** ★D3 asks for "an easy way to make the entire model unfrozen … such as a concept of time or a concept of good/bad". The ▾ promises: "Claude may change any card, arrow, definition or vocabulary item of this subject that is not frozen".

With the whole model open, Claude still may not change:
- held content: whatever frozen or accepted Lean relies on;
- any theorem of B, lemmas included;
- this subject's vocabulary that another subject relies on (D3-41);
- Shaky content;
- an arrow a proof uses.

The control says none of this, so the user cannot tell why a definition stayed as it was.
    - **scenario:** The user opens the whole model to add time. The `Time`-related definition `InGame` is used by subject S1 and held by an accepted statement. Claude reports that it could not change it, while the ▾ said it could.
    - **fix:** §4.8: "… that is not frozen or held (relied on by frozen or accepted Lean). Lemmas and the proofs of other cards, vocabulary another subject uses, and arrows a proof uses stay as they are; other subjects stay as they are."

The whole-model banner adds "· held content too".
  - [10]
    - **id:** FID-10
    - **severity:** minor
    - **where:** §5.2 recover() upgrade; §2.3 ItemRecord.heldAtJudge; §3.7 Accept refusal; D3-51
    - **problem:** The upgrade sets `frozen` on accepted records, but nothing sets `heldAtJudge` on records still in review until some later reconcile runs with a judgement.

In a slice-2 session still open when slice 3's build is installed (AP-8 installs it at slice end), every Accept is refused with "‹item› has not been checked yet: wait for the check to finish", although no check is running. This breaks REVIEW 3's "the user can either accept or decline it".
    - **scenario:** The user returns to an open slice-2 session after the slice-3 install and presses Accept on an item in review. It is refused, and stays refused until some decline triggers a judge.
    - **fix:** §5.2: the upgrade also sets heldAtJudge on every in-review record, from the same recomputed judgement's freezeAtAccept. Add a 3d test: an upgraded session's in-review item can be accepted at once.
  - [11]
    - **id:** FID-11
    - **severity:** nit
    - **where:** Spec FZ-4 last sentence; §1.1 3g; §4.5
    - **problem:** FZ-4 says: "The Result lists any frozen card whose \"Rests on\" changes as a consequence". The plan claims FZ-1–FZ-13 in full but never mentions this. Slice 2's Result detail lists every card whose basis changes, without marking the frozen ones.
    - **fix:** §4.5 (3g): in a shown Result, the list "the cards whose basis changes" marks frozen cards with the lock and "frozen", following FZ-4.
  - [12]
    - **id:** FID-12
    - **severity:** nit
    - **where:** §4.7 rows ("[keep] tick ('stays frozen (standing)' / 'stays unfrozen')")
    - **problem:** REVIEW 8 asks the window to "tell him which cards / card fields will be automatically frozen / unfrozen after the session ends". The rows label only the tick. What happens without the tick is left implicit.
    - **fix:** §4.7: each row states its default, "will be unfrozen when the session ends" or "will be frozen again when the session ends", and the tick reads "keep it frozen (standing)" or "keep it unfrozen".
