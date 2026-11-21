# find:intent

Agent `a859440ece1b24caf` of workflow `wf_3842fba8-348`. Verbatim output (JSON alongside).

- **summary:** I compared the slice-5 plan with what the user actually wrote and with the spec clauses it builds. My sources were prompt20's REFERENCE SYSTEM 1 (“reference another card, or any of its fields, clearly and conveniently … a dropdown menu upon typing a symbol like '#'”), the user's ★D3 and ★D6 answers and mid-turn message 3, the user's standing request to keep the tool a personal-use prototype, and spec §13 together with CF-1, FZ-4/S12, TR-2/4/8/10/13 and CM-4/ES-9. Every audit row is mapped and most departures are logged. However, several logged decisions rest on reasons that do not hold.

**Blocker**
- **D5-9 drops holds the spec says exist.** It makes # references to Dependencies, and to an empty Lean statement, hold nothing. The spec's own FZ-4 exceptions paragraph only makes sense if those fields are held. Claude can therefore remove an arrow, or fill a statement, that a frozen card refers to. That is S12, the risk the RF-5 fix exists to close, and it breaks §14 item 3 (Claude never changes held content).

**Majors**
1. **Slice 4's plan does not have the revalue this plan relies on.** §3.6 and §3.7 assume a slice-4 step that updates a held value when the person rewords a referenced card (`revalued.held`). Slice 4 explicitly builds none, and its D4-21 treats a frozen referrer as a problem the person must unfreeze or delete. So 5d has nothing to extend, and the two plans promise opposite behaviour. Under slice 4's version, the person would have to unfreeze the referring card, which hands it to Claude; that runs against FZ-1 and the user's FROZEN 2.
2. **D5-5 shows the raw stored text in every editor instead of a chip.** RF-1 says picking a card inserts a chip, and the user asked for references “clearly and conveniently”. Instead the editor shows text like `#[card:old-sentence-slug:statement]`. The GitHub comparison fails because ★D6 rejected short numbers, and the slug keeps the card's first wording even after the card is reworded. One stray keystroke inside the token silently turns it into plain text, and the reference is lost.
3. **D5-7 leaves Lean docstrings with old names.** A docstring is never updated when the card it refers to is reworded. This breaks RF-2 (c) and (d) and the plan's own invariant I2. No reason is given for dropping the re-mirroring that the references design proposed. Separately, the looser docstring match stops the step that today rewrites Claude's docstrings to match the sentence.

**Minors**
- D5-10 adds cross-subject holds that nothing in the session can lift and that show no mark on the board, against the user's ★D3 wish for an easy way to open the whole model.
- D5-12 removes TR-13's choices for cards that refer to a deleted card, giving a false reason (that no check can confirm Claude's fix).
- D5-11 means new transform cards cannot be referenced, even from Instructions.
- D5-6 labels a live card of another subject “deleted card”, reached through the plan's own Copy reference.
- D5-8 adds a sizeable gate rule with no stated reason, against the user's personal-prototype scope.
- D5-17 lets a git merge conflict in `ids.json` block the A|P box and Formalize.
- A reference inside a referenced sentence shows only as “…”.
- Review rows name the same reference differently on their two sides.
- A board Delete leaves “deleted card” where a transform would keep the words.

**Nits**
- The system-prompt line misses one token form and describes vocabulary references wrongly.
- Typing never filters the field rows of the dropdown.
- The chain mark for a hold passed on through another card names the wrong card as the one that refers to it.
- **findings:**
  - [1]
    - **id:** FID5-1
    - **severity:** blocker
    - **where:** §3.6 'What is held' and 'The check' ('no held key is a proof, a Dependencies field or an empty statement'); §2.5 referenceHolds; §7.2 D5-9; §4.6 guide text
    - **problem:** FZ-4 bullet 2 holds 'the field that a frozen card's sentence or Why references with #'. §14 item 3 promises 'Claude never changes frozen or held content'. D5-9 makes #[card:c:dependencies] hold nothing, and #[card:c:statement] hold nothing while c has no statement. Its reason is that this 'keeps ES-2's exceptions … by construction'. It does not. FZ-4's exceptions are narrower: 'a target's Dependencies stays open for additions' and 'an empty Lean statement at either end of a selected arrow stays fuzzy'. Those exceptions only matter because # references DO hold Dependencies and empty statements, since frozen Lean can rely on neither. They apply only to additions into targets and to the ends of selected arrows. Meanwhile the picker still offers Dependencies and Lean statement rows, and the guide will say 'a frozen card's references hold their targets'. So the person makes a reference that silently holds nothing. This reopens S12 on the strength of a misread of ES-2.
    - **scenario:** Standing-frozen A has the Why 'Because #[card:c:dependencies] are all observations.' The person runs Formalize for dependencies on another target with Open the whole model. Claude removes the person's arrow X → c, which no proof uses and no question selects (B.3 and D3-11 allow this). heldFields gives nothing for A's token, and no rule fires. 'Remove arrow X → c' is not an RV-7 item, so a group Accept takes it, and Apply's backstop passes. A's frozen Why now refers to a different set. The same happens to 'Until #[card:c:statement] exists, …' when Claude formalises c and c is not at a selected arrow.
    - **fix:** Rewrite D5-9 and §3.6 as follows. #[card:c:dependencies] holds c's Dependencies using slice 3's frozen-Dependencies comparison: no arrow removed, the mark unchanged, and no arrow added, except additions into a target of the step (ES-2's only exception). #[card:c:statement] on an empty statement holds it as 'keep empty' (FZ-2), unless c is at an end of a selected arrow or the person made it fuzzy in a transform. Proof references keep holding nothing (FZ-4: proofs are not held). Replace the 'by construction' sentence with these exceptions, applied inside the check. Add 5d tests: removal refused; a target's addition allowed; an empty statement kept empty; a selected-arrow end stays fuzzy. Correct the guide sentence.
  - [2]
    - **id:** FID5-2
    - **severity:** major
    - **where:** §3.6 'The person's own changes'; §3.7 ('listed as a warning only'); §2.5 ('slice 4's revalued.held'); §2.6; §1.1 5d; §6.1 5d S4 tests
    - **problem:** The plan says that when the person, in a transform, changes a field a frozen card refers to, the change 'revalues it like a held name (revalued.held with the field key)'. It lists the referring card 'as a warning only'. Slice 4's plan builds no such revalue and handles this exact case the other way. It says 'Slice 4 revalues no held value (D4-21: holders are unfrozen, deleted or cascaded), so a frozen card whose reference holds a field a transform changes is simply one more dependent'. Under D4-21 such a dependent is a problem: 'unfreeze it to leave it to Claude, or delete it too'. So 5d has nothing to extend, §2.6 asks slice 4 to keep a call it never has, and the two plans promise opposite behaviour. Slice 5's behaviour is the faithful one. FZ-1 says 'Frozen binds Claude only: you can always change a field yourself'. The user's FROZEN 2 makes unfreezing the act that lets Claude edit ('Claude can edit it … specifically and mechanically because the card itself is no longer frozen'). Forcing the person to unfreeze A just to reword c hands A to Claude, the opposite of what freezing A meant.
    - **scenario:** Standing-frozen A says '#[card:c] is too strong'. In a session the person opens a transform on c and rewords it. Under slice 4 as planned, A shows as a frozen TR-13 dependent, and Submit transform is blocked until the person unfreezes A or trashes it. Under slice 5 as planned, A is a warning. But that only works if a revalue exists. Without one, A's held expectation (c's sentence at B) refuses the person's own typed change at the next judged state. The 5d builder will find no revalued.held to extend.
    - **fix:** Say in §3.6 and §2.6 that 5d itself adds the held-value revalue: a typed unit that changes a field or declaration held by a reference sets that key's expectation, in every holder, to the typed value, inside slice 4's revalue code. Say that the reference via is never a TR-13 problem dependent (a warning row only), overriding D4-21 for references. Log this as a new D5-n (alternative: D4-21's unfreeze-or-delete; reversal: drop the revalue and make reference holders problems). Add slice 4's freeze and analysis files to 5d's scope list. Add a test that the person's typed rewording of a referenced card passes, and that Claude's later rewording of it is refused.
  - [3]
    - **id:** FID5-3
    - **severity:** major
    - **where:** §4.1 RefInput; §7.2 D5-5 and D5-3; §9 rows RF-1 (b) and RF-2 (c)
    - **problem:** The user asked for a way to 'reference another card, or any of its fields, clearly and conveniently' (prompt20, REFERENCE SYSTEM 1). RF-1 says 'Picking one inserts a reference, shown as a chip such as "Cynder has a dark past › Lean statement"'. RF-2 (c) says 'A reference always shows its target's current name'. D5-5 instead inserts and shows the stored token in every editor, e.g. #[card:cynder-has-a-dark-past:statement], with chips only on a separate 'Shows as:' line. Its reason, 'as GitHub's does', does not carry over. GitHub's raw form is a short number, which the user declined in ★D6 ('search by sentence'). telelean's raw form is a slug of up to six words of the card's first sentence, kept forever (D5-3), so after a rewording the editor shows the old wording as if it were the name. One stray keystroke inside a token silently turns it into plain text. No refusal follows, because it is no longer a token, and the reference is gone, along with any hold it gave a frozen card. §9 does not record RF-1 (b) as narrowed.
    - **scenario:** Card spyro-is-pg is reworded on the board to 'Spyro is rated E10+'. The person then edits A's Why: '#[card:spyro-is-pg] is too strong, unlike #[card:cynder-has-a-dark-past:statement]'. The field shows both raw tokens, and the first reads like the card's old sentence. Deleting one ']' while editing saves '#[card:spyro-is-pg is too strong…' as plain text. The 'Shows as:' line just loses a chip. Claude later reads raw bracket syntax, and a frozen A no longer holds its target.
    - **fix:** Replace D5-5's editor with atomic chips. RefInput becomes a contenteditable field in which each token renders as a non-editable chip showing the target's current name. The caret steps over a chip, Backspace deletes it whole, copy yields the stored token, and a malformed token cannot arise. The stored text is unchanged. Insertions use the field's own small undo stack (UN-4 bullet 4b allows field-local undo, and §4.1 already plans this as a fallback). Drop 'Shows as:'. If the plain input is kept instead, do all of the following: mark RF-1 (b) and RF-2 (c) as narrowed by D5-5 in §9; add the stale-slug cost to D5-3 and D5-5; refuse at commit any text containing a malformed '#[card:' or '#[lean:'.
  - [4]
    - **id:** FID5-4
    - **severity:** major
    - **where:** §3.4 'Docstrings'; §2.3 isMirrorOf; §7.2 D5-7; §3.1 I2; §6.1 5c1 ('normalise leaves a stale mirror alone')
    - **problem:** RF-2 says 'A reference always shows its target's current name' and 'In Lean docstrings and in everything Claude reads, references appear as the target's sentence'. D5-7 never re-mirrors a docstring when a referenced card is reworded, so docstrings keep old names indefinitely. That contradicts the plan's own I2 ('every name shown, or sent to Claude, is computed from the current model'). The references design proposed re-mirroring on board edits (§7.1), and D5-7 gives no reason for dropping it. Its reversal caveat, 'outside sessions only, since a statement may be frozen', is no obstacle: freezes bind Claude only (FZ-1), and telelean's follow-on edits 'may touch frozen cards; they count as your change' (TR-15). A second problem: isMirrorOf accepts any ‹…› text in a token's place, and normalise moves from today's exact escapeBodyText(sentence) comparison to it. So a docstring Claude writes with the wrong words inside ‹ › is no longer corrected.
    - **scenario:** A says '#[card:spyro-is-pg] is too strong', with the docstring '/-- ‹Spyro is PG› is too strong -/'. The person rewords spyro-is-pg on the board. A's chip shows the new name. But A's expanded card (which shows the bound declaration's source, docstring included), the Raw Lean diff, VS Code's hover and the Lean file Claude reads all keep 'Spyro is PG', until A's own sentence is edited. Separately, in a session Claude formalises B, whose sentence is '#[card:c] matters', with the docstring '‹Cynder is innocent› matters'. isMirrorOf accepts it and normalise leaves it.
    - **fix:** (1) Outside sessions, every board plan that changes a model file of a subject also rewrites each D-9 mirror of that subject that isMirrorOf its sentence but differs from mirrorText. This is a follow-on edit in the same Undo step and History entry, on F1's pattern. List the remaining in-session staleness as a D5-18 residual. (2) Keep normalise exact: a docstring that is new or differs from B's must equal mirrorText. Apply the loose isMirrorOf only to docstrings unchanged since B, and to planEditNode's 'was it a mirror' test. Update D5-7, §3.4 and the 5c1 tests.
  - [5]
    - **id:** FID5-5
    - **severity:** minor
    - **where:** §3.6 'Other subjects'; §2.5 otherSubjectRefHolds; §2.8 other-subject text; §4.6; §7.2 D5-10
    - **problem:** Answering ★D3, the user asked for 'an easy way to make the entire model unfrozen, because I anticipate that oftentimes "formalize for dependencies" is meant to implement subsystems throughout the entire model, such as a concept of time'. D5-10 holds every declaration and gloss of the session's subject that any other subject's sentence or Why references, 'whether or not the referring card is frozen'. That is wider than RF-5 ('a frozen card's references hold their targets'). Nothing in the session can lift it: there is no freeze to Unfreeze, and D3-9 has no 'Allow this change'. §4.6 shows no mark for it either. Its stated reason, that the alternative 'needs other subjects' freezes in the start snapshot', is weak, because slice 3 already reads every subject's freezes.json and carries foreign records in the snapshot (D3-41).
    - **scenario:** S2's unfrozen card says '#[lean:Time] is linear'. The person opens S1's whole model to add a notion of time. Claude's change to Time's gloss is refused ('a session never changes what another subject relies on'). S1's board shows nothing on Time, and there is nothing to unfreeze. The only way out is to exit, edit S2's card, and start again.
    - **fix:** Hold only what frozen cards of other subjects reference (their standing records, read the way D3-41 reads foreign ones). Show it as 'held by “‹A›” of ‹S›'. Let the person's Unfreeze of that held item in the session lift it for that session, as D3-41 does for foreign freezes. If the wider rule stays, show its holds in StateJudgement.held with the holder, and correct D5-10's reason.
  - [6]
    - **id:** FID5-6
    - **severity:** minor
    - **where:** §3.7 'A transform'; §7.2 D5-12
    - **problem:** TR-13 offers, for cards that depend on a changed or deleted card, 'to rewrite them (D-11), to delete them too, or to leave the unfrozen ones to Claude'. D5-12 detaches cards that depend through a reference 'with no choice of its own'. It rejects the alternative because it leaves 'a reference to Claude, whose fix no check can confirm'. That is not true: a token naming a trashed card is mechanically detectable in any judged state, and Claude's rewording comes back as a reviewed Change item. The detach also rewrites the person's own sentence or Why, a frozen one included, with no way to opt out short of trashing that card.
    - **scenario:** The person splits c into c1 and c2 in a transform and trashes c. A's Why 'because #[card:c]' becomes 'because ‹c's old words›': unlinked words of a card that no longer exists. The person wanted Claude to reword A around c1, which TR-13 would have offered.
    - **fix:** Give cards that depend through a reference TR-13's choices: Detach (default, detachRefs), Delete it too, and, for unfrozen ones, Leave it to Claude. In that last case the reference rule also refuses, at every purpose, any token naming a card the transform trashed, so 'nothing is left broken'. Correct D5-12's reason.
  - [7]
    - **id:** FID5-7
    - **severity:** minor
    - **where:** §4.2 candidates; §4.4; §7.1 row 'Draft cards in prose'; §7.2 D5-11
    - **problem:** CF-1 says every card can be referenced with #. TR-8 says 'An Instructions box takes prose for Claude, with # references'. TR-2 says 'telelean gives it an id'. The user wanted instructions 'to guide it on any vague parts' (TRANSFORM 7), and the vague parts are mostly the window's new cards, whose fields start fuzzy. D5-11 makes prose tokens 'name existing cards, never a transform's new cards'. The references design proposed real ids at creation; D5-11 lists that as the alternative but gives no reason for rejecting it.
    - **scenario:** The person adds a new card 'Time is linear' in the transform window and writes in Instructions: 'Formalise #Time is linear with the existing clock vocabulary'. The picker does not offer the new card. They must describe it in words, or Apply and edit afterwards.
    - **fix:** Allocate a registry id when a card is created in the window (recorded at once, and burnt if the card is dropped), so its sentence, Why and Instructions can reference it. Or, at least, let Instructions take draft keys, rendered for Claude as '‹draft sentence› [new card n]'. Either way, state the reason in D5-11.
  - [8]
    - **id:** FID5-8
    - **severity:** minor
    - **where:** §3.3; §2.3 TL124; §7.2 D5-6 and D5-11 ('not validated'); §2.8 Copy toast
    - **problem:** RF-2 (c) reserves 'deleted card' for a deleted target. D5-6 shows it for a live card of another subject. The obvious way to create one is the plan's own Copy reference, whose toast says 'paste it into a sentence, a Why or a message to Claude'. Prose to Claude is not validated, so both the person and Claude read 'deleted card' for a card that exists.
    - **scenario:** On S1's board the person copies a reference to 'Spyro is PG', then answers a question in S2's session with 'see #[card:spyro-is-pg]'. The chip reads 'deleted card', and Claude reads '‹deleted card› [card spyro-is-pg]'.
    - **fix:** Label such a token '‹S›: ‹sentence›', resolved across the project for display only, never held, and styled as foreign. Refuse it at commit in every RefInput, answers included, using refProblems' existing text. Make the Copy toast say that card references work within their own subject.
  - [9]
    - **id:** FID5-9
    - **severity:** minor
    - **where:** §3.5; §2.4 referenceFindings; §2.8 CLAUDE_REF_TEXTS 'added'; §6.2 cheats 2–3; §7.2 D5-8
    - **problem:** Neither the user nor the spec forbids Claude to write references, and D5-8 gives no reason. Yet it adds a gate rule that runs at every purpose and in the backstop, two tool validators, Claude texts and FakeBackend cheats. The user's standing guidance on this project is to keep hardening that does not protect the core claim out of scope ('I'm trying to create a prototype for personal use, so let me know to what extent this is relevant'). The real risks are a token forged to an id not yet allocated, or to a hidden card. Both need only one check: every token not already in B must name an existing, visible target. D5-8 also narrows Shaky ('Claude can do what it wishes with the card', DECLINE OPTIONS 3): once D2-15 is lifted, the person's token can never move into a card that replaces a split or merged Shaky card.
    - **scenario:** A premise Claude suggests cannot say '#Cynder has a dark past implies …', even though the person would see it as a chip in the item they review. A Shaky card holding '#[card:cynder-dark]' that Claude splits must lose the reference.
    - **fix:** Replace the 'added' sub-rule with one check: every token in the judged state that is not in B must name an existing target of the subject that is visible on the masked model (refProblems), or the state is refused. Keep the cheap 'docstring' sub-rule (RF-2 d). Or keep D5-8 and state its actual reason in §7.2.
  - [10]
    - **id:** FID5-10
    - **severity:** minor
    - **where:** §2.7 TL203; §5 'ids.json'; §7.2 D5-17
    - **problem:** ids.json is 'committed with the person's files (D-12)'. A sorted JSON list that grows on two git branches gets conflict markers. D5-17 then refuses every allocation and every session start in that subject, over a file the person never edits. The A|P box, which per ★D1 'should stay', stops adding cards, and Formalize cannot start. TL203's only advice, 'delete it', silently gives up the never-reuse guarantee (RF-2 b).
    - **scenario:** The person merges a branch and ids.json gets '<<<<<<<' markers. Adding 'Spyro is PG' from the A|P box fails with TL203, and so does starting Formalize, until they hand-edit a JSON file they have never seen.
    - **fix:** Have parseIdsFile salvage an unparseable file by taking every quoted string matching ID_PATTERN. For a merge conflict that is exactly the union of both sides, which is what a monotonic registry needs. Report TL203 as a warning ('read leniently') and rewrite the file cleanly at the next record. Refuse only when nothing can be salvaged from a non-empty file. Update D5-17.
  - [11]
    - **id:** FID5-11
    - **severity:** minor
    - **where:** §2.3 refLabel; §3.3; §7.2 D5-5 ('one level deep')
    - **problem:** RF-2 (d) says Claude reads references as 'the target's sentence', and the user wants references shown 'clearly'. A token inside the target's sentence shows as '…', for the person and for Claude. No reason is given beyond avoiding nesting, which a depth bound and cycle check would handle.
    - **scenario:** B says '#[card:spyro-is-pg] is too strong'. C's Why says 'because #[card:b]'. The person's chip and Claude's turn both read '‹… is too strong›'.
    - **fix:** Render nested tokens recursively with a visited set, up to depth 3, using '…' only at the bound or on a cycle. A chip may cut its visible text at 60 characters, with the full nested text in its tooltip; Claude always gets the full rendering.
  - [12]
    - **id:** FID5-12
    - **severity:** minor
    - **where:** §3.3 ('Review rows resolve before-values on B's graph, after-values on the Proposed graph')
    - **problem:** RF-2 (c) says a reference 'always shows its target's current name'. Rendering the two sides of a Change row with different name sources makes an unchanged reference look changed whenever its target was reworded in the session.
    - **scenario:** c is reworded in the session, and Claude also changes A's Why from 'too strong' to 'far too strong'. The Change A row reads '‹Spyro is PG› is too strong' → '‹Spyro is rated E10+› is far too strong', which suggests the reference itself changed.
    - **fix:** Render both sides of a row with the Proposed (masked) resolver, so a row differs only where the stored text differs. Show B's name, when different, in the chip's tooltip ('was: ‹…›').
  - [13]
    - **id:** FID5-13
    - **severity:** minor
    - **where:** §3.7 'The board's Delete'; §2.8 Delete text; §4.6
    - **problem:** Deleting a referenced card gives different results depending on how it is done. A transform, even one applied directly, turns the referring cards' tokens into the deleted card's words. The board's Delete leaves 'deleted card'. The Delete dialog also does not say which referring cards are frozen, although TR-13, which RF-5 (b) points to, 'says which are frozen', and it is a frozen card's text that changes.
    - **scenario:** The person deletes 'Spyro is PG' from the board, and frozen A then reads 'deleted card is too strong'. Had they trashed it in a transform, A would read 'Spyro is PG is too strong'.
    - **fix:** Mark frozen referring cards in the Delete dialog. Offer 'Keep their words' (detachRefs, the default, as a follow-on edit in the same Undo step) beside 'Leave “deleted card”'.
  - [14]
    - **id:** FID5-14
    - **severity:** nit
    - **where:** §2.8 'System prompt line'
    - **problem:** The line lists #[card:ID], #[card:ID:FIELD] and #[lean:NAME], but not #[lean:NAME:FIELD]. It says each reference appears as '‹the target's sentence› [card ID]', which is wrong for vocabulary tokens: §2.3 renders those as '‹short name› [‹Lean name›]'. The text is to be used verbatim, so the error would ship as written.
    - **fix:** Use: '… stored in the files as #[card:ID], #[card:ID:FIELD], #[lean:NAME] or #[lean:NAME:FIELD]. In telelean's messages a card reference appears as ‹its sentence› [card ID], and a vocabulary reference as ‹its short name› [NAME]; a field reference adds ’s ‹field›. …'
  - [15]
    - **id:** FID5-15
    - **severity:** nit
    - **where:** §4.1 keys; §4.2 search
    - **problem:** RF-1 promises 'a dropdown of cards and fields, filtered as you type'. Typed words never reach field rows. '#cynder lean' finds nothing, because every word must occur in a card's sentence; fields appear only after pressing →.
    - **fix:** When the query's last word or words match one of the card kind's field labels (lean, statement, why, proof, dependencies, gloss and so on), and the rest of the query matches a card, also list '‹card› › ‹Field›' rows directly.
  - [16]
    - **id:** FID5-16
    - **severity:** nit
    - **where:** §2.8 Held chain mark; §2.5 heldFields holders; §3.6 transitive holding
    - **problem:** FZ-4 says 'Held items show a chain mark: "held by ‹card›"'. With transitive holding (D5-9), C held through B shows 'held by “A” (it refers to this)'. That is false: A refers to B, and B refers to C.
    - **fix:** Use 'held by “‹A›” (it refers to this)' only for direct holds, and 'held by “‹A›” through “‹B›”' for transitive ones. heldFields keeps the first card in between for each holder.
