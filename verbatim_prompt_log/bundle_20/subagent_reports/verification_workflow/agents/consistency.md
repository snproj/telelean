# verify:consistency

## Verdict

Not ready to approve as written (/home/zhengyew/telelean/verbatim_prompt_log/bundle_20/user_requested_documents/01_edit_sessions_spec_proposal.md). I found no blockers, 9 major problems and 6 minor ones.

None of the findings lets Claude add a belief without your individual Accept. C7 is the only one that, read permissively, could let a state that failed the build reach your files.

The majors are contradictions or undefined outcomes in core flows:
- **C1:** The Prove item still reveals the result, so §11.6 and "keeps D-19" are false. Result items also have no defined Accept or Decline, although you must decide every one before Submit review.
- **C2:** The These suffice preset is tied to the session's start and is a session freeze, but it is applied to every mid-stage inference.
- **C3:** Held content blocks the target's own proof whenever another card uses it or references it with #.
- **C4:** The frozen record and the working copy are fed from different sources (FZ-3, ES-7, RV-1). After a hand edit, the steps can never pass, and accepted content is compared against the wrong value.
- **C5:** "Allow this change" collides with the frozen-meaning check.
- **C6:** Group Accept can accept items whose dependencies it skipped, and deletions have no dependency edge, so §11.4 fails.
- **C7:** "Accept it as broken" and "mark broken" can never get through Apply, or they break §11.1.
- **C8:** ES-3 and TR-15 disagree on whether Transform cards… opens a session, so ★D1(a)'s cost is misdescribed.
- **C9:** A transform queued from the Context Menu is dropped when every item is already accepted.

Each has a local wording fix. The minors cover:
- tags and Part 4 omissions;
- the "biggest changes" summary, the FZ-11 banner and Appendix C;
- undefined session-walk outcomes;
- the Proof field states and S10's check on one path;
- blanket statements contradicted elsewhere;
- ★D5's slice 1 description.

## Findings

### C1 [major] — RV-1 (Prove, Result, Add), RV-2, RV-4, RV-6, RV-11, RV-12, §8, Part 3 S7, §11.6, biggest change 3

**Problem.** S7 says that "the mere presence of a 'Prove' item would reveal" the result, and fixes this with a neutral Result item. But RV-1 still creates a separate "Prove ‹card›" item that "lists what it rests on".

Only targets ever get proofs (ES-2 opens only targets' Proofs; TR-14 says transform steps write none). So a Prove item exists exactly when a proof was found, and RV-2 shows every item's label and badges from the start. RV-6's "Hidden until then" list does not cover the Prove item. It also misses the "closes the gap (checked)" and "may simply restate the goal" marks on Add items, which appear only when the proof failed. So §11.6 and "keeps D-19" (biggest change 3) are false.

Second, RV-12 requires a decision on every Result item before Submit review, but nothing says what accepting or declining one does:
- RV-4 has no Result row.
- Reject ("restores the previous version"), Transform and Shaky have no meaning for a Result.
- "Prove G" and "Result G" are two decisions on the same proof, and they can disagree.

Third, accepting an Add item "complete[s] the proof … with no extra Claude step". That changes the Result's verdict outside any step, but RV-11 re-checks only at steps.

Scenario: you run These suffice P1–P3 ⊢ G. Stage 1 lists Formalize P1…P3, Formalize G, Def InGame, Vocabulary, "Prove G" (rests on P1, P2, InGame) and a neutral "Result G". You learn that G was proved, and from what, before judging InGame or P2. You then accept Prove G and decline Result G with Reject. The outcome is undefined.

**Suggested fix.** Merge the two items.
- RV-1: delete "Prove ‹card›" and write: "Result ‹target›: one per inference, always present whether or not a proof was found. Once revealed (RV-6) it shows the verdict, the proof (marked 'replaces your proof' when it does), what it rests on and, for a goal, make it a Derivation (ticked)."
- RV-1, first line: "… and one for its proof (Result, or Proof broken)".
- RV-4: "Result: the proof and the Derivation tick."
- §8 preamble: "On a Result, Decline offers Reject (the previous proof stays, and Claude may not offer this exact proof again) or Shaky (Claude tries again at Submit review). Transform is not offered."
- RV-6 "Hidden until then", add: "the 'closes the gap (checked)' and 'may simply restate the goal' marks on Add items". Also define: "statement item: an Add, Formalize or Change item that adds or changes a Lean statement".
- RV-1 Add, append: "The target's Result then returns to 'in review', marked 'updated'."
- Align S7, biggest change 3 and the "What this replaces" row ("make it a Derivation on the Result item").

### C2 [major] — ES-2 (Preset; "The same preset applies to every inference"), RV-9, FZ-7, FZ-3, FZ-2, RV-12, ES-3, S1, S11

**Problem.** The preset is defined against the session's start: "everything that existed when the session started is session-frozen", with exceptions for "each selected card's empty Lean statement" and "each target's Proof". It is also a session freeze (FZ-7 reason "the session's start froze it"). Yet ES-2 and RV-9 apply it to every later inference.

(a) Because it is a session freeze, it outlives the step, and the exceptions of earlier inferences lapse. In a transform-started session, a mid-stage These suffice freezes the transformed cards for the rest of the session. In a These suffice session, a card formalised in inference 1 but not selected in inference 2 had an empty Lean at the start, so it is now "keep empty" (FZ-2). Either way, the Shaky, Transform and to-be-redone work that RV-12 runs at Submit review can no longer touch those fields.

(b) FZ-3 takes frozen values "from your files when the session starts". So a field that has an in-review change is frozen at its old value, and the working copy already violates it.

Scenario: you run Transform cards… on A and G, clear A's Lean and reword its sentence. Step 1 proposes "Change A" (in review). You then run These suffice A ⊢ G. A's Lean "existed when the session started", so it is frozen at your old text. Every attempt is refused, or Claude must revert A, which silently removes the in-review item. Afterwards A stays frozen, so your queued Shaky on A cannot be carried out. The same happens to P1's step-1 formalisation when you later run P2 ⊢ G2.

**Suggested fix.** Replace ES-2's Preset with:

"Preset (★D3). For each inference's step, everything that exists when the step starts is frozen for that step, at its value then. The exceptions are each selected card's empty Lean statement (fuzzy) and each target's Proof (open). A standing freeze always wins. For the inference that starts a session, these are also the session's starting freezes (FZ-7). For a mid-stage inference they are limits of its step only: they add no FZ-7 reason and end with the step."

Keep RV-9's "Cards you declined with Transform or Shaky count as frozen for it" as an example. If a mid-stage step should also be able to update proposals still in review, add "and content whose item is still in review" to the exceptions.

### C3 [major] — FZ-4 (both bullets), RF-5, Appendix B (Held sets), ES-2 (exceptions), Part 3 S1 ("keeps today's protection")

**Problem.** FZ-4 holds "other cards' statements and proofs" that frozen Lean relies on. Appendix B defines this as the closure of each frozen declaration's type and value "through … proofs". FZ-4 also holds the whole of "any card that a frozen card's sentence or Why references with #".

Under ES-2's preset every other card is frozen. So the target becomes held as soon as any other card uses its `.holds` or mentions it with #. Held means Claude may not change it. No clause lets ES-2's "Proof is open" or "empty Lean statement is fuzzy" win over held; the only stated precedence is "a standing freeze always wins". Today, T.holds is exempt by name (gate map §3.2).

Scenario: D2 is proved from goal G, which is claimed (`axiom G.holds`), so D2 "rests on a claimed node". You run These suffice P1, P2 ⊢ G to discharge the claim. Turning G.holds into a theorem changes a declaration that D2 holds. Every attempt is refused, or the step stops at an unfreeze request. Re-proving a derivation that other cards use fails the same way. Once references exist, a single "see #G" in any card's Why holds all of G, so Claude cannot even formalise G's empty Lean statement.

A proof cannot change what any statement means (proof irrelevance), so holding it protects only footprints.

**Suggested fix.** - FZ-4, bullet 1: "… other cards' statements (for a `.holds`, only its type), definitions, lemmas, vocabulary, and the instances and coercions Lean inserted;".
- FZ-4, bullet 2: "the field that a frozen card's sentence or Why references with #, or the card's Sentence for a reference to the whole card."
- Add to FZ-4: "Held never overrides ES-2's exceptions. A target's Proof stays open, and a selected card's empty Lean statement stays fuzzy, because neither changes what a frozen card says. The Result lists the frozen cards whose Rests on changes."
- Appendix B, Held sets: "… through card statements, definitions, lemmas and instances; for a `.holds`, its type only."

### C4 [major] — FZ-3 (2nd and 3rd bullets), ES-7, RV-1 (last bullet), RV-4, FZ-10, Appendix A4, Appendix B (Backstop at Apply)

**Problem.** The frozen record and the working copy are fed from different sources:
- FZ-3 takes what frozen content says "from your files when the session starts, and from your own changes after that". It then requires every judged state to leave frozen content "exactly as it was"; Appendix B's backstop checks against the frozen term.
- ES-7 says your own edits during a session "are merged at Apply", while "telelean takes the frozen copy from your version". A4 repeats that Apply re-checks "on top of yours".

So a hand edit enters the frozen record at once but reaches the working copy only at Apply. FZ-3 also gives no frozen value for accepted content: RV-4 freezes Claude's proposal, which is neither your files nor your change. The same goes for FZ-10's "freeze Claude's proposal".

Scenarios:
1. You fix a typo by hand in a session-frozen premise. Its frozen value is now your version, but the working copy still has the old one. Every later check reports "frozen content changed" and refuses, so no step can pass.
2. An accepted Formalize has no frozen value under FZ-3. The frozen check therefore either refuses it (its value at the start was empty) or does not protect it.
3. You freeze Claude's proposal (FZ-10), then Reject the item. DO-1 restores the previous version, which now differs from the frozen value.
4. RV-1 builds items from "your files at its start, plus your own changes". If that includes ES-7's edits, as the same words in FZ-3 do, a card you add with the A|D|G box during a session appears as "Delete ‹your card›", a change Claude never made.

**Suggested fix.** - FZ-3, 2nd bullet: "telelean keeps the frozen value of every frozen field: your files' value for standing freezes and the session's starting freezes; the accepted content for an accepted item; the value shown when you froze it, for your own freezes; and the value at the step's start, for an inference's limits (ES-2)."
- ES-7: "Your own edits during a session are copied into the session's base and working copy as they happen (while a step runs, at its next check, as in FZ-10). They never become items, and Apply lists them separately. If they touch frozen or held content, the frozen value becomes your version, and every accepted item whose content or dependencies they touch returns to 'in review'."
- A4: "Conflicts with accepted items show when you make the edit."
- FZ-10: "Rejecting an item whose proposal you froze first asks whether to unfreeze it."

### C5 [major] — FZ-5 (Allow this change), FZ-3 (3rd bullet), §11.3, Appendix B (Backstop at Apply), RV-1/RV-4 (no "meaning changed" item kind), §8, biggest change 5

**Problem.** FZ-5 lets a held item change "while its holders stay frozen", and sends back each holder whose meaning changes as "meaning changed by ‹item›". Three other rules forbid that state:
- FZ-3 refuses every judged state in which frozen content's meaning changed ("A state that changes either is refused").
- §11.3 says Claude never changes frozen or held content.
- Appendix B's Apply backstop requires every frozen declaration to elaborate to its frozen term.

So after Allow this change, every check refuses the change, unless the meaning check is relaxed somewhere the spec does not say. Two outcomes are also undefined:
- what accepting a "meaning changed" item freezes;
- what declining it does. Reject "restores the previous version" of the holder, but the holder's text never changed.

Scenario: frozen assumption cynder_dark_past uses HasDarkPast. Claude asks to change HasDarkPast, and you press Allow this change. The next check finds that cynder_dark_past's meaning changed and refuses, so the step cannot pass. If the change is let through and you then Reject "meaning changed by HasDarkPast", nothing is restored, and Apply fails its backstop with no explanation.

**Suggested fix.** - FZ-5, last bullet: "Allow this change lets the held item change. Each holder whose meaning then changes keeps its frozen text. Its new meaning is provisional, under an item 'meaning changed by ‹item›' that depends on the held change (RV-5; a belief item for an assumption). Accepting that item makes the new meaning the holder's frozen meaning. Declining it, with any option, declines the held change with the same option."
- FZ-3: "… A state that changes either is refused, except a provisional meaning change under FZ-5."
- §11.3: "… except a change you allow under FZ-5, which needs your Accept."
- Appendix B backstop: "… elaborates to its frozen term, or to one you accepted under FZ-5."
- Biggest change 5: append "unless you allow a change (FZ-5)".

### C6 [major] — RV-8, RV-5, RV-6, RV-7, DO-1, DO-3, §11.4, biggest change 2

**Problem.** RV-8 takes "every selected item whose dependencies are accepted or in the selection, except the items of RV-7". If a dependency in the selection is itself an RV-7 item, it is skipped, but its dependents are still taken. Items then become accepted on top of unaccepted ones. This contradicts RV-5 ("Accept is enabled only once everything the item depends on is accepted"), §11.4 and biggest change 2 ("Accepting always respects dependencies").

Separately, RV-5's relation ("I's Lean … mentions something J adds or changes") has no edge for deletions. So a Delete can be accepted while another card's restorable version still mentions the deleted card.

Scenario 1: you select every item of stage 1 and press Accept. Def InGame, Formalize P and Formalize G are skipped (RV-7). But Formalize D (a derivation premise that uses InGame), Prove G and Result G are taken, because their dependencies are "in the selection". The Result is accepted while it is still hidden.

Scenario 2: a Shaky merge yields Delete A1, Delete A2, Add A3 and Change D. You accept both Deletes and A3, then Reject Change D. DO-1 restores D's old proof, which uses A1.holds, next to an accepted deletion of A1, and nothing returns to "in review".

**Suggested fix.** - RV-8: "Accept takes every selected item that is not an RV-7 item and all of whose dependencies are accepted, or are taken by this same Accept. It lists the items it left and why."
- RV-5, first bullet, append: "… or when I deletes or changes something that another card's version before J mentions (so a Delete depends on the items that remove the other mentions of the deleted card)."

### C7 [major] — TR-13 ("mark them broken"), TR-14 ("accept it as broken"), EN-2 ("any breaks you chose (TR-13), listed as expected"; "If the final check fails, Apply is disabled"), §11.1, Appendix B ("the build"), RV-1, RV-4, §8

**Problem.** Today, "mark broken" leaves declarations that do not compile (edit-model map: "they stop compiling"). EN-2 runs every check on the final state and disables Apply on failure, yet lists TR-13 breaks "as expected". That leaves two readings:
- Apply passes a state that failed the build. This contradicts §11.1 ("only as a state that passed every check"). Lean fails a whole module, so everything downstream of the break, Claude's content included, goes unchecked.
- Apply never passes.

TR-14's "accept it as broken" is not a TR-13 choice, so EN-2 does not even list it as expected. "Proof broken" is also missing from RV-1's item kinds, from RV-4 and from §8.

Scenario: in a transform session you change assumption A's Lean. Frozen derivation D's proof stops building, which gives "Proof broken D". You accept it as broken and press Submit review. The final check fails at the build and Apply is disabled. Back to review leaves only two ways out: re-prove D, or Exit.

**Suggested fix.** Recommended, because it keeps §11.1 exact:
- New rule: "Inside a session, nothing is left broken."
- TR-13: offer "rewrite them (D-11)", "delete them too" or "leave the unfrozen ones to Claude". "Mark broken" stays only for Claude-free transforms outside a session (TR-15).
- TR-14: "You can re-prove it with These suffice, or make it a claim: its proof is replaced by `axiom ….holds`, a belief item that needs its own Accept."
- EN-2: drop "any breaks you chose (TR-13), listed as expected".
- RV-1: list "Proof broken" in the proof slot.

If breaks must stay possible inside a session, §11.1 must instead say: "… passed every check, apart from the breaks you chose or accepted, which are listed. Apply refuses if anything else fails, including anything that depends on a broken declaration."

### C8 [major] — ES-3, TR-15, ★D1 (a), CM-4, Part 4 (EDIT SESSIONS 1 and INITIATING 2 rows)

**Problem.** ES-3 starts the session "when the transform window opens". So every Submit transform happens inside a session, and TR-15's "outside a session, as direct edits: one Undo step, no session" can never apply to Transform cards…. ★D1(a)'s cost is then wrong. It promises "A typo fix becomes select → Transform cards… → edit → Submit", "applied at once … no session". In fact, every typo fix would open a session, freeze every other card, show the session bar, and end only through Submit review and the Apply confirmation.

Read the other way (TR-15 applies because no session was active before), an unchanged submit is itself Claude-free: copied empty fields start keep-empty, there are no instructions, and the box is off. TR-15 then applies it as a no-op, with no session. That contradicts ES-3's "Submitting it unchanged opens the session … This is your 'initiate edit session'."

You would be choosing ★D1 on a description that neither reading delivers.

**Suggested fix.** - ES-3: "Opening the window with no session active starts a provisional session, in which every non-selected card is session-frozen. On Submit transform:
  - unchanged → the session continues with an empty first stage (your 'initiate edit session');
  - needs Claude (TR-15) → the first Claude step starts;
  - changed but needs no Claude → the provisional session is dropped, its freezes are undone, and the edits are applied directly as one Undo step (★D1).
  Cancel drops the provisional session."
- TR-15: "outside a session (including ES-3's provisional session), as direct edits …".

### C9 [major] — RV-9, RV-12, EN-1, TR-15 ("inside a session, as items already accepted in the current stage"), CM-4, biggest change 4

**Problem.** RV-9 lets you start a transform from the Context Menu during a stage, queued until Submit review. A queued transform is not an item. RV-12 goes straight to the end confirmation when "every item is accepted or rejected, and nothing is waiting to be redone", and EN-1 says the same. So a queued transform that needs Claude is never carried out.

Separately, TR-15 makes a Claude-free transform inside a session "items already accepted in the current stage", i.e. at once. That contradicts RV-9 and biggest change 4 ("wait until Submit review").

Scenario: in stage 1 you accept every item. Then you select card K, open Transform cards…, write "split K into two", and submit the transform, which is queued. You press Submit review. All items are accepted, so the end confirmation opens, and Apply writes the session without the split. Nothing tells you it was dropped.

**Suggested fix.** - RV-12: "If every item is accepted or rejected, nothing is waiting to be redone, and no queued transform needs Claude, the session goes to the end confirmation … Queued transforms that need no Claude are carried out first, as accepted items (TR-15)."
- EN-1: "… a stage in which every item is accepted or rejected and no transform is queued."
- TR-15: "inside a session, at Submit review (RV-9), as accepted items of the stage being submitted."

### C10 [minor] — How to read it; tags of RV-3, RV-8, RV-9, EN-1, TR-10, ES-3; Part 4

**Problem.** "How to read it" says that "yours" means reworded only, and that every changed or new clause is in Part 4 with its reason. You approve by number on that basis.

Tagged "yours" or "clarified", but changed in substance:
- RV-3 adds a fourth status, "to be redone"; your REVIEW 2 has three.
- RV-8 limits group Accept by RV-7 and by dependencies.
- RV-9 adds ES-2's preset, queued transforms, and "disabled while a step runs".
- EN-1 says "accepted or rejected"; your REVIEW 6 says "when all changes are accepted".
- TR-10 says other subjects' vocabulary cannot be transformed; your TRANSFORM 9 says any card.
- ES-3's Cancel ends the session with no confirmation; your REVIEW 8 asks for one "successfully or not". Neither the tag nor Part 4 says so.

Missing from Part 4:
- CF-6;
- FZ-2;
- FZ-12 (it appears only in the "replaces" table, without a reason);
- ES-1;
- ES-5, which moves the writing of declared premises from the start to the end, a change to today's behaviour;
- ES-6, ES-7, RV-13, EN-3 and §11.

Part 4's TRANSFORM 4–5 row also cites "D-16 (no Lean unless asked)", but D-16 is "The A|D|G box never calls Claude."

**Suggested fix.** - Retag RV-3, RV-8, RV-9, EN-1 and TR-10 as "(changed: …)", naming the change. Add "no confirmation on Cancel" to ES-3's tag.
- Add a Part 4 row: "(new) | one session per folder, Current/Proposed views (ES-1); declared premises written at Apply, not at the start (ES-5); reload (ES-6); your own edits during a session (ES-7); Apply (EN-3); steps that propose nothing (RV-13); guarantees (§11); keep empty (FZ-2); Claude's-wording mark (CF-6); 'statements fixed' (FZ-12)".
- Extend the REVIEW 8 row: "… except Cancel in the window that started the session (ES-3)".
- TRANSFORM 4–5 row: replace "D-16 (no Lean unless asked)" with "so Claude formalises a card only if you ask".

### C11 [minor] — Biggest changes 1–5, FZ-11 (banner text), Appendix C Q3 (last bullet)

**Problem.** - **Line 1** says These suffice "freezes everything you didn't select". ES-2 actually freezes everything that existed, the selected cards included, apart from their empty Lean statements and the targets' proofs; ★D3 states this correctly.
- **FZ-11's banner** ("Everything except the selected cards is frozen for this session") puts the same error into the product. During every These suffice session it tells you that Claude may change your selected premises.
- **Lines 2–5** are false as Part 1 stands (see C6, C1, C9 and C5). Line 3 also says "each proof", where RV-1 has one Result per inference.
- **Appendix C Q3** ends "Under this spec, the accepted item records it". No Part 1 clause keeps an endorsement after the session ends (items live in session state), so after Apply the board would still say "needs your endorsement".

**Suggested fix.** - Line 1: "'These suffice' freezes everything that existed except the selected cards' empty Lean statements and the targets' proofs, so it keeps today's protection (★D3)."
- FZ-11: "one banner stating the session's starting freezes. After These suffice: 'Only the selected cards' empty Lean statements and the targets' proofs may change'. After Transform cards…: 'Everything except the selected cards is frozen'."
- Line 3: "Each inference gets one Result item …".
- Add to EN-3: "Apply records each definition and presupposition you accepted as endorsed, so the board stops asking." Otherwise, drop the Appendix C sentence.

### C12 [minor] — ES-4, EN-2, ES-3, FZ-9

**Problem.** Three session-walk outcomes are undefined:
- **(a)** ES-4 says Cancel step, a cap or an environment failure "returns you to the previous stage". The first step of a These suffice session has no previous stage, and "a step never ends the session".
- **(b)** EN-2 gives a way back only when the final check fails. A passing Apply confirmation has no defined Back or Cancel, although a confirmation must be possible to decline.
- **(c)** ES-3's Cancel has "no confirmation". That contradicts EN-2's "A confirmation always comes first" and your REVIEW 8. It also silently drops any Freeze or Unfreeze you made while the window was open (FZ-9 allows this), with no keep tick.

**Suggested fix.** - (a) ES-4: "For the session's first step, you get an empty stage marked 'step cancelled' or 'step failed', with Retry step and Exit session."
- (b) EN-2: "Every confirmation has Back to review, which returns you to the submitted stage, unsubmitted. Nothing changes."
- (c) EN-2: "A confirmation always comes first, except Cancel in the window that started the session (ES-3) when you changed no freezes."

### C13 [minor] — TR-4, TR-5, ES-2, FZ-9, TR-12, TR-15, Part 3 S10

**Problem.** (a) The Proof field's states contradict each other:
- TR-4 says "a new card's fields start fuzzy" and also "A Proof field is never fuzzy".
- TR-5 says "Clearing a field makes it fuzzy", which would include clearing a proof.
- FZ-9 lets you Unfreeze an empty Proof in the window, which makes it fuzzy by TR-4's definition.
- ES-2 calls an empty target Proof "open", but TR-4 defines "open" as "not frozen and filled".
What clearing a Proof does is undefined: is the proof deleted, or does the card become claimed, i.e. gain a new axiom?

(b) TR-15 applies Claude-free transforms outside a session with "no Lean check before writing", while TR-12 checks typed Lean "When you submit". If TR-15 wins, S10's fix is skipped on that path. Typing "True", a newline, then "axiom evil : False" in a Lean field would then be written as an unmarked axiom.

**Suggested fix.** - (a) TR-4: "A new card's fields start fuzzy, except Kind and Lean name (chosen, TR-2) and Proof (empty, keep empty). A Proof is never fuzzy: in a transform you can keep it or clear it. Clearing deletes the proof and leaves the card unproved, never claimed."
- (a) ES-2: "each target's Proof is open, even when empty: Claude may fill it …".
- (b) TR-15: "… one Undo step, no session. TR-12's checks still run; the gate does not."

### C14 [minor] — RV-3, DO-1, FZ-7, CF-1, TR-10, CF-4, RV-1, ★D1 (c), S9, FZ-8, ES-1

**Problem.** Several blanket statements are contradicted elsewhere:
- **(a)** RV-3 says "You can change any status until you submit". But DO-1 lets you un-reject later from "Rejected in this session", FZ-7 and RV-5 un-accept carried-over items when you unfreeze, and your REVIEW 3 and REVIEW 5 let you un-accept later. An implementer who locks statuses at submit breaks all of these.
- **(b)** CF-1 says "every card … transform it", but TR-10 says "Vocabulary from other subjects … not transformed".
- **(c)** CF-4 says Kind changes "only … through a transform". But RV-1's "make it a Derivation" tick changes Kind, and ★D1(c) keeps today's drag and Make ‹kind›.
- **(d)** ★D1(c) keeps "today's direct edits" outside sessions. Those include the card-only Delete, which S9 and "What this replaces" say is gone. Choosing (c) would silently keep S9's hidden belief.
- **(e)** FZ-8 returns "every card and field" to its state at the session's start. That wipes freezes you made during the session on other subjects' cards, which ES-1 says are standing.
- **(f)** RV-1 says a newer proposal updates its item in place. DO-1 says a reworded repeat of a rejected item "appears as a new item", which would give the card a second fields item.

**Suggested fix.** - (a) RV-3: "You can change any item's status at any time during the session; declines take effect as §8 says."
- (b) CF-1: "… and transform it (other subjects' vocabulary is not transformed, TR-10)."
- (c) CF-4: "only you change it: in a transform, with make it a Derivation on a proof's item, or, under ★D1(c), by today's direct kind change."
- (d) ★D1(c): "… today's direct edits stay, except the card-only Delete (S9)."
- (e) FZ-8: "every card and field of the session's subject".
- (f) DO-1: "A reworded repeat comes back as the same item, in review and marked 'updated'; the rejected version stays under Rejected in this session."

### C15 [minor] — ★D5 (a), slice 1; RV-4; RV-5; §11.5; S4

**Problem.** Slice 1 is "the review list, statuses, belief items, Result items, …, Exit and Apply, for These suffice sessions. This runs on today's checks, which already protect everything you have." It is the part you would use daily.

But Accept's freeze (RV-4, your REVIEW 3) needs FROZEN, which only arrives in slice 2. Today's checks protect only your files as they were at the start. Claude's content from earlier rounds is unprotected (gate map §3.2: "Not protected: Claude's own formalisations from earlier rounds"). So in slice 1, a Shaky step, a to-be-redone step or a mid-stage These suffice can still change items you accepted, against your REVIEW 5.

The slice also does not list RV-5's dependencies or the Apply backstop (§11.5), on which the safety of per-item Accept rests (S4). ★D5(a) is therefore approved on an inaccurate description.

**Suggested fix.** ★D5 (a), slice 1: "… plus dependencies (RV-5) and the Apply backstop (§11.5). Until slice 2, Accept does not freeze: a later step may still change an accepted item, which then returns to 'in review', marked 'updated'."

