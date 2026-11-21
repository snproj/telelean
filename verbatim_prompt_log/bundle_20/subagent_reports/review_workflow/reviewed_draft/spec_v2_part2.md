## 12. Edge cases and how they resolve *(new)*

- **EC-1 Freezing a card whose item is in review** freezes the proposed version, so Claude cannot change it further, but you still need to Accept or Decline it. Reject restores the previous version and keeps it frozen. Shaky is not offered while it is frozen.
- **EC-2 Deleting a card others rely on.** A Delete item can be accepted only when no remaining card would rest on the deleted card; otherwise it lists the cards that still do. In a transform, trashing such a card is allowed, but TR-14 warns you, and Claude must deal with the dependents, or ask to unfreeze them if they are frozen.
- **EC-3 Your frozen Lean does not compile once Claude has filled the rest.** Claude cannot fix it (it is frozen). It says so with an unfreeze request instead of retrying forever, and the stage reports it.
- **EC-4 A transform that asks for something impossible under the freezes** (e.g. changing a vocabulary item that a frozen card relies on): Claude makes an unfreeze request; if you keep it frozen, the stage reports that the instruction could not be followed.
- **EC-5 The same card in two pending items** (e.g. Change from an earlier step and an updated Change from a mid-stage step): the newer proposal replaces the older item, which disappears with a note.
- **EC-6 Rejecting an item that a pending (not accepted) item depends on**: the dependent item is marked "depends on a rejected item" and Claude must revise it in the next step.
- **EC-7 Window reload during a Claude step**: the step is interrupted, as runs are today, and **Resume** continues it. Review stages come back as they were.
- **EC-8 Your files change on disk during a session** (hand edits, git): Apply re-checks on top of them (ES-7). If they conflict with an accepted item, Apply is refused with the conflict listed. You can exit, or undo your edits and Apply again.
- **EC-9 Unfreeze all other cards by accident**: the Undo toast restores the previous freezes (FZ-9).

## 13. Safety issues found, and how the revision handles them

These are the logic and formalisation-safety issues in your text, in the spirit of "A definition can quietly carry a belief, so Accept needs your yes for each". Each was checked against the current gate by the gate/Accept map (`subagent_reports/understand_workflow/agents/gate-accept.md` §6). Examples use the Spyro model.

**S1. As written, a "These suffice" session protects nothing.**
- Today the gate makes everything that existed before a run immutable to Claude: the rule "existing declarations unchanged", plus G5 "your words byte-identical".
- Your spec replaces that with "Claude may change anything not frozen", but only INITIATING 2 freezes anything, and These suffice (INITIATING 1) freezes nothing.
- So Claude could:
  - weaken your goal to `¬ GoodAddition cynder newSpyro ∨ True` and prove it with `Or.inr trivial`;
  - rewrite the Lean of your premise "PG games cannot have characters with dark pasts" from `¬ InGame c g` to `¬ GoodAddition c g`;
  - redefine the vocabulary `HasDarkPast` (scenario in S2).
- Each would pass every remaining check and show "proved"; only your attention in the review would catch it.
- **Revision:** ES-2's preset freezes (**★D3**) reproduce today's protection exactly, and ES-3 does the same for transforms. Claude can touch existing content only where you deliberately opened it.

**S2. Frozen text is not frozen meaning.**
- A frozen assumption `abbrev cynder_dark_past : Prop := HasDarkPast cynder` keeps its text if Claude redefines the unfrozen vocabulary item `HasDarkPast` as `def HasDarkPast (_ : Character) : Prop := False`. The assumption now says `False` and proves anything: `cynder_dark_past.holds.elim`.
- Today this is refused only because all existing vocabulary is immutable. Also, the "definition needs your yes" check looks only at new names, so an in-place change would not even be asked about.
- New instances can likewise change how unchanged text is read (report §3.7, item 1).
- **Revision:** FZ-5 holds everything frozen Lean relies on, and forbids Lean that changes how it is read. RV-7 makes changed definitions belief items, not just new ones.

**S3. The freeze must be out of Claude's reach.**
- If "frozen" were a field in the card's Lean comment, Claude could edit it in its working copy.
- **Revision:** FZ-4. Freezes live in telelean's own files, which Claude cannot see or edit (the working copy never contains `.telelean/`). The check compares against telelean's copy.

**S4. Partial acceptance can certify a proof whose ground was declined.**
- Suppose you accept "Prove ‘Cynder would not be a good addition’" and decline "Formalize ‘PG games cannot have…’" (Transform), then write different Lean for that premise yourself. The accepted proof was checked against the old version: it now fails to build, or worse, builds with another meaning while the table still says "accepted".
- Applying a subset of a proposal produces a file state that no check ever judged. Today Accept is all-or-nothing precisely to avoid this.
- **Revision:** RV-4 makes acceptance dependency-closed, and EN-2 reruns every check on exactly the final state before anything is applied.

**S5. Group accept can adopt hidden beliefs.**
- This is the turn-1 cheat. Claude adds `def InGame (c : Character) (g : Game) : Prop := GoodAddition c g`, formalises your premise as `∀ g c, IsPG g → HasDarkPast c → ¬ InGame c g`, and proves the goal in one line.
- Every mechanical check passes: the only axioms used are your selected premises. The belief "being in a game = being a good addition" lives only in the definition's body, which `#print axioms` cannot see.
- Likewise, a presupposition `axiom Unicorn.exists : Nonempty Unicorn` turns "all unicorns are white" (vacuously true) into "the unicorn in my garden is white" (existential import).
- Your "one item for all the vocabulary" plus group accept would let both through without the per-item yes you have today.
- **Revision:** RV-1 keeps definitions and presuppositions out of the vocabulary item. RV-7 requires an individual Accept for every belief item (**★D2**).

**S6. Claude can now author beliefs.**
- Gap-filling ("Claude may add cards"), shaky regeneration and fuzzy Kind fields all let Claude create ASSUMPTION cards. Today Claude never writes a belief: a suggested premise exists only after a separate check, outside your files, until you press "I hold this".
- A proof resting on such a card before you accept it would read "proved".
- **Revision:** RV-7 makes every such card a belief item, and RV-4 makes a proof that uses it conditional on it. CF-6 marks Claude's wording.

**S7. A list lets you see the result before judging the meaning.**
- D-19 shows the proof result only after the statements, to counter automation bias: a "proved" badge makes a wrong formalisation look right.
- In a free-order list, you could open the proof first.
- Separately, inside a Claude step, the rule "fix the statements before proving" stops Claude from shaping a statement to fit the proof it found. The name "freeze" collides with your FROZEN.
- **Revision:** RV-5 hides proof results until their statements are accepted. FZ-12 keeps the in-step rule under a new name.

**S8. Several inferences in one session must not share premises.**
- With two goals, or a mid-stage These suffice, one shared premise set would let goal 2's proof use goal 1's premises, or goal 1's own pending claim, and still report "from your selection".
- **Revision:** ES-2 and RV-9: each goal is a separate inference with its own premises.

**S9. Deleting a card can leave a hidden belief behind.**
- Today's "card only" delete keeps the Lean: the card's `axiom ….holds` stays as an unmarked axiom, so proofs resting on it still read "proved".
- **Revision:** RV-1 says a Delete removes the card and its Lean, and EC-2 blocks a Delete while something still rests on the card.

**S10. Lean you type into a transform can do more than you see.**
- A Lean field holding `True`, a newline, then `axiom evil : False` would add an axiom that proves anything. Separately, frozen Lean that cannot compile would deadlock the session, since Claude may not fix it.
- **Revision:** TR-13 checks typed Lean (one term, no extra declarations), and EC-3 covers non-compiling Lean.

**S11. Accepted content becomes unfrozen when the session ends.**
- This is per your EDIT SESSIONS 7, and it is not a problem by itself: the next session re-freezes everything you don't select (ES-2/ES-3), so it still cannot be changed without your opening it.
- If you would rather keep a card frozen, use the keep ticks of EN-2.

**S12. References create meaning dependencies.**
- A frozen card saying "#‹Spyro is PG› is too strong" changes meaning if Claude rewords the referenced card.
- **Revision:** RF-5: a frozen card's references hold their targets.

**S13. "Don't propose again" and "not identical" can only be checked for exact repeats.**
- A reworded repeat passes both checks. This is not a safety issue, since nothing enters without your Accept, but neither check should be read as a guarantee. DO-1 and DO-3 say so.

## 14. Decisions I need from you

Reply "approve, with the ★ recommendations", plus any overrides by number.

| # | Question | Options | Recommendation |
|---|---|---|---|
| **★D1** | INITIATING 3 says "no editing fields directly on the Current tab". How far does that go? Today the board is fully editable at all times: Edit sentence/Why, stance/source chips, Make ‹kind› / drag, Delete, and the A\|D\|G box, which by your D-16 never calls Claude. | (a) Remove every direct field edit; keep the **A\|D\|G box** (adding a code-less card is not editing a field, and it keeps D-16); quick edits become a transform that runs without Claude (TR-15). (b) Also remove the box: adding a card is a transform. (c) Read it narrowly: only during a session is Current read-only, and direct edits stay outside sessions. | **(a)** |
| **★D2** | May belief items (new or changed assumptions, definitions, presuppositions) be accepted as part of a group? | (a) No: each needs its own Accept, as "I hold this" and "Yes, I endorse it" do today. (b) Yes, but the group confirmation lists them and needs one more click. | **(a)** |
| **★D3** | These suffice protects nothing as written (S1). Adopt ES-2's preset: everything except the selected cards' empty Lean/Proof fields is session-frozen. | yes / no | **yes** |
| **★D4** | TRANSFORM 3 has "delete permanently" from the trash. Inside a draft, a trashed card is deleted anyway when applied. What should "permanently" add? | (a) Drop it: the trash is enough. (b) It removes the card from the window, so Claude is not even shown what was there. | **(a)**, unless you meant (b) or something else |
| **★D5** | How to build it. This is about M2-sized work (M2 took about 25 M subagent tokens over roughly a day). | (a) Four slices, each planned, built and verified like M1/M2: **A** Context Menu, selection of fields, standing freezes and their look; **B** edit sessions with the review list, statuses, dependencies, decline options and Apply, started by These suffice; **C** the transform window and transform-started sessions, and removing direct edits; **D** references. I stop after each slice for you to try it. (b) All at once. | **(a)** |

## 15. Changes from your text, clause by clause

| Your clause | What changed | Why |
|---|---|---|
| Preamble | kept | |
| CONTEXT MENU | kept; plus selecting fields and review items, disabled actions with reasons, the action list, the tray kept for showing the selection (CM-2–5) | FROZEN 4 needs field selection |
| EDIT SESSIONS 1 | "transform cards" button and INITIATING 2's "initiate edit session" option merged into **Transform cards…** (ES-3) | they describe the same action |
| EDIT SESSIONS 2–3 | plus the gate loop, rollbacks that keep your decisions, questions, unfreeze requests, Cancel step (ES-4) | missing cases |
| EDIT SESSIONS 6 | split into Submit review (RV-10) and Exit session (ES-8, EN-4) | |
| EDIT SESSIONS 7 | made precise as standing vs session freezes (FZ-7/8); plus what happens to cards created in the session | consistency with FROZEN 3 |
| EDIT SESSIONS 8 | the confirmation also shows the changes and the final check; optional keep ticks (EN-2) | |
| REVIEW 1–2 | plus the **Prove** label; definitions and presuppositions get their own items; the list and the status table merged; vocabulary cards get the same item kinds (RV-1/2) | S5, S7 |
| REVIEW 3 | "its definition is FROZEN" now reads "the content it produces is frozen"; un-accepting and unfreezing are linked (RV-3) | "definition" means a Lean `def` in telelean |
| REVIEW 4 | kept; the option is called **Transform** (RV-6) | |
| REVIEW 5 | results join the current stage; Transform also allowed mid-stage; several goals = separate inferences (RV-9, ES-2) | ambiguity; S8 |
| REVIEW 6 | "cards which are not accepted" now reads "declined items" (RV-10) | at submit nothing is "in review" |
| (new) | dependencies RV-4, meaning before proof RV-5, belief items RV-7, the stage report RV-8 | S4–S7 |
| DECLINE 1 | generalised to Change and Delete; the "Rejected in this session" list; honest about exact-repeat checking (DO-1) | "don't create" fits only Add items |
| DECLINE 2 | renamed **Transform**; shows the previous version too (DO-2) | matches REVIEW 4 |
| DECLINE 3 | applies to one card too; "identical" defined; an escape if no alternative exists (DO-3) | otherwise Claude is forced into a cosmetic change |
| TRANSFORM 1 | "ok" = Submit transform (TR-10) | |
| TRANSFORM 3 | ★D4 | unclear what "permanently" adds |
| TRANSFORM 4–5 | plus the **open** state for copied fields, clearing, and frozen-empty = keep empty (TR-4/5, FZ-2) | copied fields needed a state |
| TRANSFORM 6 | new vocabulary always allowed (TR-8) | formalising needs it |
| TRANSFORM 9 | "Claude suggests" is no longer a special card (TR-11, RV-1) | your preamble |
| (new) | kind changes done by telelean (TR-12), typed Lean checked (TR-13), warnings (TR-14), Claude-free transforms (TR-15) | D-11; S10; ★D1 |
| FROZEN 1 | the look specified without dashes, translucency or a second glow (FZ-11) | those already mean declared, suggested and formalised |
| FROZEN 2 | plus where freezes live and how they are checked (FZ-4); held content (FZ-5); request cards (FZ-6) | S2, S3 |
| FROZEN 3 | via the two layers (FZ-7/8) | |
| FROZEN 4–5 | plus the scope of "all other cards", the Undo toast, and freezing while Claude works (FZ-9/10) | edge cases |
| INITIATING 1 | the These suffice preset (ES-2) | S1, ★D3 |
| INITIATING 2 | merged with EDIT SESSIONS 1 (ES-3) | |
| INITIATING 3 | ★D1 | ambiguity; conflicts with D-16 |
| REFERENCE | plus stable storage, no dropdown in Lean fields, deleted targets, held targets (RF-2–5) | S12 |

## 16. What this replaces in today's telelean (and earlier decisions it overrides)

| Today | Under this spec | Earlier decision affected |
|---|---|---|
| "Claude suggests" cards with "I hold this" / "No" | Add items for ASSUMPTION cards (belief items) | D-6 kept in substance (only you add beliefs); the presentation changes |
| The review stepper: Statement 1…N, New vocabulary, Definitions, Result, Card changes | The review list (Add, Change, Formalize, Prove, Delete, Vocabulary) plus the stage report | D-19 one-shot review → multi-stage, per item |
| "Yes, I endorse it" on definitions | Accept on each definition's own item | D-4 kept |
| Vocabulary "Revoke…" (prefilled Feedback) | Decline on the vocabulary item or sub-item | |
| "Card changes" ticks | "make it a Derivation" on the Prove item | |
| Accept (all or nothing) | Per-item Accept, then Apply once at the end (still one undo step) | D-21: its deferred partial accept is delivered |
| Feedback… | Decline → Transform with instructions, or a mid-stage transform | |
| Discard | Exit session | |
| Raw Lean diff… | kept (Context Menu while a session is active) | |
| "Your words byte-identical" and "existing declarations unchanged" | the preset freezes (ES-2/3), enforced by FZ-4/5 | same protection by default; open only where you open it |
| Direct board edits, drag to change kind | transforms (★D1); kind changes still follow D-11 | D-17 changes; D-16 kept under ★D1(a) |
| One goal per run | several goals, each a separate inference | |
| "Statements frozen (round N)" | "Statements fixed" | renamed (FZ-12) |

## 17. Notes for implementing it later (not for approval)

- **Storage.** Standing freezes go in a per-subject file under `.telelean/`, keyed by card id or vocabulary Lean name, with the frozen fields listed. Claude never sees it, and it is not part of Undo or History. Session state (items, statuses, rejected list, session freezes, the standing snapshot) lives with the run's state in VS Code's storage. Cards get written ids before they can be frozen or referenced.
- **Enforcement.** Today the gate compares every pre-run declaration and markup field against your files at run start. That generalises to "every frozen or held field against telelean's frozen copy", run at every check, freeze, finish and Apply. Held sets come from Lean's dependency facts (`uses`, references). The meaning check compares the fully explicit form of frozen statements before and after. New instances and attributes are refused while anything is frozen.
- **Sessions are runs with rounds.** A review stage is a round. "Submit review" is structured Feedback generated from the statuses. Apply is today's all-or-nothing Accept path (rebase, re-check, one history entry) run on the fully accepted state. Transform-started sessions need a new run kind without a single target.
- **Items** come from the proposal's graph diff plus a block diff, with stable item ids across stages.
