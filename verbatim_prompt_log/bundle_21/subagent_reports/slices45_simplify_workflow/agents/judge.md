# judge

Agent `a5ff4e013447d458a` of workflow `wf_ad6807bb-b8a`. Verbatim output (JSON alongside).

- **scores:**
  - [1]
    - **proposal:** refuse-first (S45-1 to S45-7)
    - **soundness:** 4
    - **simplicity:** 3
    - **fidelity:** 2
    - **buildability:** 3
    - **comment:** Very conservative and mostly sound. Its best parts are adopted below: clearing means 'Claude rewrites this', no mirrors written in sessions (S45-2's rules, in R5), the token and other-subject locks (S45-4, in R6) and the in-place premise edit (S45-7, in R7). Its core keeps telelean's typed write inside a Claude step, with the typed commit as S₀ (S45-6). When that commit does not build, the step limits have no S₀ facts and freezes stay pending, and Resume still needs that commit's facts, which is R3-7 in another form. It also keeps a third, field-level typed item per card, which still needs D4-44's covers. S45-3 widens slice 3's comparator for every kind of expectation. S45-5 claims a typed item then depends on no Claude item, which is wrong: Claude changing one of your own declarations in the session is an RV-5 rule-1 dependency. Fidelity is the weak point. Decline windows start from your files' version, not Claude's proposal ('Adjust this card', TRANSFORM 1). Accepted Claude content on a transformed card is pulled back into review, with RV-5 cascades. Claude-added cards get new ids. Claude's transform fills cannot be declined Shaky. Typed Lean cannot use vocabulary proposed in the session.
  - [2]
    - **proposal:** user-first (SIMP-1 to SIMP-6)
    - **soundness:** 3
    - **simplicity:** 5
    - **fidelity:** 4.5
    - **buildability:** 4
    - **comment:** The simplest set and the closest to the user's words. The typed part is carried out as one judged decision, a sibling of slice 2's premise write. Items are card-granular and need a plain Accept. Typing makes an ordinary own freeze, and the reasons it overrides are replaced. There is no MUST DEFINE, the premise is edited in place, and EDIT SESSIONS 1-3 and Exit-cancels-all are kept. Gaps a fixer must close (folded into R2 and R3 below): ledger allowances and the 'you typed it' badge must end with a Reject; a trashed card's absence must be frozen; Shaky on Claude's transform fills silently keeps D4-24. Soundness is pulled down by SIMP-5, which drops reference holding (S12, RF-5 a, FZ-4 bullet 2, the held content of §14 item 3) rather than simplifying it. Without it, a group Accept could change what a frozen card's prose says.
  - [3]
    - **proposal:** reuse-first (SIMP-1 to SIMP-7)
    - **soundness:** 2.5
    - **simplicity:** 4
    - **fidelity:** 3
    - **buildability:** 3
    - **comment:** Good reuse instincts, adopted below: the in-session decision write (the same as user-first's), a queue that is dropped rather than edited, Shaky on Claude's transform fills mapped to a new queued transform, no mirrors in sessions, no detach, and one 'may Claude change it' predicate. Soundness problems: (1) SIMP-3 unfreezes every key the write changes but re-freezes only typed fields, so trashing a source silently unfreezes a frozen receiving Dependencies (against FZ-6 and FROZEN 3). (2) SIMP-2's auto-accept omits the RV-5 condition (§14 item 4). (3) Running the scratch against the judged commit lets Claude's in-review coercions shape what your own check confirms, and elaborates against hidden proof material. (4) The out-of-session board step can leave your files unbuildable with no session started. Fidelity costs: Exit no longer cancels the typed edits, the session is created at Submit rather than by the button, typed fields become standing freezes, a suggested premise's Lean cannot be edited, and kinds are locked in sessions.
- **recommended:**
  - [1]
    - **from:** user-first SIMP-1 (the same as reuse-first SIMP-1's in-session half)
    - **title:** Carry out what you typed at once, as one judged decision; only Claude's part waits for Submit review
    - **change:** In a stage, Submit transform is one session decision, 'Transform: ‹label›'. The modal window stays open, showing 'Checking your Lean…' (TW-1 and D4-18 unchanged). Its steps:
1. TR-12 (a), then (b): the scratch elaborates against B (D4-6).
2. Slice 2's RV-5 confirmation for the accepted items whose content, covers or frozen.held include a key the write changes. This is §3.8 step 3's list, moved here, and it follows D2-64's rule while the results are hidden.
3. telelean writes the typed part into ws/ as a decision write in slice 2's write queue, with no units: new cards and vocabulary, typed field lines, statements, kinds, Dependencies, cleared proofs and the trash. Trashing Claude's Add is a Reject of that Add in the same decision.
4. The ordinary judge runs, with the freeze table as the decision leaves it (R3).

The write is taken back whole, as slice 2's premise write is (ws/ returns to its parent, the window stays open with the problems), when that judgement finds a failure on visible content that its parent did not have:
- a build error;
- a typed piece whose constants in place differ from the scratch's (D4-23's typed-meaning rule);
- a frozen, held, other-subject or B.2 finding.

A hidden Result that the write breaks is taken out silently (D2-64) and is never a reason to take the write back.

The typed part must build on its own:
- a TR-13 statement or definition dependent that it breaks is 'Delete it too' or 'Claude re-formalises it': the write empties its Lean, which becomes fuzzy in Claude's part, and the turn quotes the old text;
- a proof that it breaks is marked broken in the same write: a Proof broken item whose origin is the transform;
- a session target's Result that it breaks is taken out to be redone in the same confirmed decision. D4-19's reworkResults becomes slice 2's ordinary rework.

What needs Claude is queued as the transform's Claude part: fuzzy and cleared fields, open fields, instructions, slots, the tick, and D4-39's may-break proofs.
- The Claude part is a scope only (keys, arrowsInto, slots, mayAddCards, instructions, dependents), never a draft.
- At Submit review it is one ordinary step: computeItems' active step with target transform:‹id› and no Result (R2-3). Its S₀ is the judged head.
- Slice 2's step limits apply per key (everything outside the scope keeps its text and meaning; openItems are the items that own content under its keys), and so do slice 3's checks.
- Its scope is computed again at Submit and at Retry from the keys that still exist. A freeze made since wins. A part with nothing left is dropped, with a note.

In the provisional session, a needs-Claude Submit writes the typed part as the session's first write (after consent and checkBase), judged the same way, then runs the Claude part as the first step. start-session and the direct path (D4-3) are unchanged, so Exit still cancels everything.

A no-Claude transform in a stage is just the decision: no queue and no forced extra stage. Its Undo is slice 2's inverse-patch merge, until the next seal.

Gone:
- the `typed` shadow commit and PersistedStep.typedCommit;
- JudgeInput.typedStart, S₀ᵗ and its exception list;
- the typed judgement as a step phase, and the no-Claude transform step;
- D4-4, D4-5, D4-40, D4-42 and most of D4-30.
    - **user_loses:** - **Atomicity.** If Claude's part fails, gives up or is cancelled, what you typed stays applied and in review. Retry runs Claude's part again. Undo takes the typed part back until the next Submit; after that, you Reject it.
- **A wait at Submit transform.** In a stage, Submit transform waits for one build of the working copy with your edits (seconds to about a minute). It refuses, with the errors, if your Lean does not build where it lands.
- **'Leave it to Claude' changes meaning.** For a statement or definition your change breaks, Claude now re-formalises it from its sentence (seeing its old Lean) instead of patching it. A proof your change breaks is a Proof broken item at once.

Gain: a transform with nothing for Claude applies at once, can be undone, and needs no extra stage.
    - **why:** It removes the second baseline and the typed write inside a Claude step. Those caused R3-1, R3-7, R2-2, S4M-1's valuation gap, S4M-2, LC-5/IMP-20 and D4-42/S4M-12.

Every Claude rule then runs from one judged S₀, whose facts slice 2's judged-facts.json already serves (D2-72).

It reuses slice 2's decision write, the premise write's take-back and the inverse-patch Undo, and it keeps EDIT SESSIONS 1-3 and REVIEW 6 as the user wrote them.

No check is weakened: freezes, held content, B.2, other subjects and the backstop still judge every state.
  - [2]
    - **from:** user-first SIMP-2 (the same as reuse-first SIMP-2's own fallback)
    - **title:** No typed items or units: your edits belong to the card's ordinary item, and nothing is accepted for you
    - **change:** computeItems keeps slice 3's card-granular ownership:
- card:‹c› owns the card's fields, and its Delete also owns the card's arrows out;
- proof:‹c›, decl: and vocab: items, and arrow: items, as in slice 3.

A card you create is a ledger `card` entry whose origin is the transform: an Add, never an intermediate (IMP-14).

**The ledger `transform` entry.** Each transform decision records one. It holds, per card and field, the value written, plus the lines Claude may never write: type:, follows_from, your premises: entries, a worded_by removal, a .holds turned from theorem to axiom or removed, and a new block's bookkeeping.
- It owns nothing and never has to hold.
- It only grants allowances: to G5, B.3, B.4, new-axiom (with D4-33's 'still bound to its card' amendment) and the backstop.
- It also feeds the 'you typed it' badge, EN-2's typed list and D5-8's token allowance.
- A Reject or take-out that restores a card drops that card's values from the entry, in the same recorded write; Undo restores them. This is how slice 2 drops a taken-out premise's ledger entries. So no allowance or badge outlives your Reject.

**Wholly yours.** An item whose every difference from B equals a live value of the entry is 'wholly yours'. It is badged and takes a plain Accept (group Accept takes it), even where RV-7 would ask for its own Accept. The exception is Lean your check could not confirm (session names, D4-32): it keeps its own Accept, shown in fully explicit form.

**Mixed items.** An item that mixes your fields and Claude's is one item, classified as today.
- Its Accept freezes all of it (RV-4), so D4-44, coverAtJudge, coverAtAccept and frozen.covers go.
- Its Reject restores B, through D3-48's dialog for your own frozen fields.
- Transform reopens it.

**Reconcile** withdraws an in-review item whose content a later step returned to B, marked 'changed back to your files' version'. It never raises slice 2's 'disappeared' problem.

Gone:
- TypedUnit and all its kinds (line, entry, decl, docstring, block, premise), with soft and follow;
- supersession, typed:‹c› items and 'typed units hold';
- the queue end's accepted-as-yours fixpoint;
- RV-5 rule 3's typed extension and the pairing edge;
- planItemRevert for typed items, and the backstop's re-derived typed ownership;
- D4-1, D4-22, D4-29's split, D4-33 (except its new-axiom amendment) and D4-44.
    - **user_loses:** - **One plain Accept per card you changed.** Each shows as 'Change ‹card› · you typed it'; group Accept takes them all. While in review, a statement you typed keeps the stage's results hidden, like any statement item (AP-24).
- **One Accept or Reject per mixed card.** On a card where you typed some fields and Claude wrote others, one Accept or Reject covers the whole card. Transform it again to separate them.
- **Reject restores your files' version**, not Claude's earlier proposal, which stays viewable among the item's versions.

RV-7 b5's 'counts as accepted' is spec text; your own REVIEW 3 has every item start in review.
    - **why:** Ownership stays total and disjoint exactly as slice 3 built it. So planItemRevert, D3-48's frozenChangesOf, D3-49's keep set and the backstop need no new kind.

The badge cannot be forged: it compares exact values, per card and field, with telelean's own ledger (cheat T8).

It removes R3-2 to R3-6, R2-1, R2-4, R2-5, S4M-3/4/5/7/13, IMP-15, F16 and the ownership half of S5R3-01.

It asks for more review than RV-7 b5, never less.
  - [3]
    - **from:** user-first SIMP-3 (with reuse-first SIMP-3's unfreeze-then-own-freeze idea, and D4-21 extended to references, which is D5-19's own logged alternative)
    - **title:** What you type is an ordinary own freeze; reasons you override are replaced, never revalued; frozen cards that rely on it must be unfrozen first
    - **change:** The transform decision records these freeze changes in its FreezeDelta, so Undo restores all of them.

**Own freezes.**
- Every field you typed gets slice 3's own freeze (`yours`, 'frozen: you typed it').
- Every field of a card or vocabulary item you trashed gets one too, frozen absent ('frozen: you deleted it').
- They are valued `{ from: 'state' }` by the decision's own judge-apply. That is their one pending moment: the modal window and the judging gate let no other check, decision or freeze action run meanwhile.

**Other keys the write changes.**
- A key that already had a reason (a frozen receiving Dependencies or arrow, a kind, a cleared proof) stays frozen, as an own freeze at its new value.
- A key with no reason stays unfrozen.
- On all these keys, standing and foreign reasons go into standingCleared and session-start ones into startCleared, marked `replaced`. They show no Unfreeze row at the end, and FZ-8 restores the standing ones.
- Accepted reasons are never replaced: R1's RV-5 confirmation returns those items to review first.

**Holders are never revalued.** A frozen card (any reason but accepted) is a window problem when:
- its Lean relies on what you change (FZ-4 bullet 1; D4-21 as now), or
- its sentence or Why refers to it with # (FZ-4 bullet 2, RF-5).

The problem stays until you unfreeze that card ([Unfreeze them]), delete it too, or, for a reference, take it into the window and change the reference.

**End rows.** Keep ticks at Apply only for own freezes of fields you typed on cards that remain. The others end with the session.

Gone:
- TransformFreeze: pending and valued, typed and follow-on, newest per key;
- the `transform` reason and FreezeTable.transforms;
- §3.11's revalue and slice 3's revalue hook;
- D4-23's valuation part and D4-34;
- slice 5's D5-19: the set-aside, the walk stop, pendingHolds, transformHolds, the binding rule and TransformFreeze `held`.
    - **user_loses:** - **One reason shown.** A field you retype shows one reason, 'frozen: you typed it', for the rest of the session instead of its full stack. A standing freeze is back after the session.
- **Unfreeze referring cards first.** Before you change content that a frozen card refers to with #, or that its Lean relies on, that card must be unfrozen (one click on [Unfreeze them] in the window covers all), deleted too, or have its reference edited in the same window. It no longer follows your new words silently. In a session started with Transform cards…, every other card is frozen, so this applies to every card that refers to what you change.
    - **why:** Slice 3's one table and one whole-state check stay exactly as built: no pending values, no second expectation, no revalue. The person's change is simply the person's own freeze (FZ-1, FZ-3 bullet 2e).

The holder rule is D4-21, already in the plan, applied to references; it is D5-19's own logged alternative.

It eliminates S5R3-02 (holders keep their full expectations, and nothing is set aside), S5R2-01 and S5R2-02, slice 5's LC-1, LC-2, IMP-2 and FID5-2, and slice 4's LC-2, LC-3, LC-16, S4M-8, S4M-13 and IMP-6.
  - [4]
    - **from:** user-first SIMP-4 (refuse-first S45-5 and reuse-first SIMP-5's first bullet are stricter forms)
    - **title:** Typed Lean may use only names that already exist; no 'Claude must define'
    - **change:** TR-12 (c) is narrowed. A typed statement or declaration may use only:
- names your files define;
- names the session's visible content defines (D4-6);
- names that a declaration typed in the same window declares (S4M-9).

Any other name is a problem on its field: '‹name› is not defined: add it as a vocabulary card in this window and type its declaration, or leave this statement to Claude.'

Typed Lean also may not rely on a declaration that the same window leaves to Claude (open, fuzzy, cleared, or a dependent the write empties). That is a problem naming both: '“‹c›”'s Lean uses ‹name›, which this window leaves to Claude: type it, or leave “‹c›”'s statement to Claude too.'

Gone:
- mustDefine and its needs-Claude reason;
- the outcome-changed dialog's case and the turn's MUST DEFINE line;
- new-definition's MUST DEFINE allowance;
- D4-7, and D4-32's unknown-name case. D4-32 stays for session names only.
    - **user_loses:** - **No 'Claude must define'.** You can no longer type a statement that uses a word nobody has defined and have Claude define it. Declare the word in the window (a plain predicate is one line, e.g. `axiom Wicked : Character → Prop`), or leave the statement to Claude with instructions.
- **Two transforms for dependent edits.** Typed Lean cannot rest on a declaration you ask Claude to rewrite in the same transform; do it in two transforms.
    - **why:** Every typed piece then elaborates fully, in the scratch and in place. R1 needs this for a write that builds on its own, and R3 needs it for exact freeze values.

It also stops your own freezes from holding what you asked Claude to change.

It removes S4M-9's 'Claude defines' half, IMP-11, UI-8, S5R2-03's MUST DEFINE half and D5-21's window problem.
  - [5]
    - **from:** refuse-first S45-2 (its clearing and mirror rules only) + reuse-first SIMP-1's cleared-field rule + reuse-first SIMP-5's mirror bullet
    - **title:** Clearing a field means 'Claude rewrites this'; no docstring mirrors are rewritten inside a session
    - **change:** **Clearing.**
- Clearing a filled field writes nothing. The old value stays until the Claude part replaces it, as Claude's content. The turn says 'the person cleared this: write it anew', and the stage report says when Claude did not.
- The exception: when your typed change breaks the field, it is a dependent left to Claude, and the write empties it (R1).
- 'Kept empty' is a typed empty value: frozen (FZ-2).

**Cleared Dependencies.** A cleared Dependencies field keeps its arrows. The Claude part gets it in arrowsInto, with removal allowed under slice 3's remove_arrow rules. D4-39's walk lists the card's own proof as may-break, so Claude can mark it broken before removing an arrow it uses.

**Mirrors.**
- The typed write never rewrites an existing statement's D-9 mirror.
- A statement you type is written with the mirror of its sentence as part of its value.
- Other mirrors are redone by slice 5's board hook at the first board change after the session (D5-7).

Gone: D4-31's soft units, D4-29's mirror rules, the mirror cases of S4M-7 and R2-5, and mirrorText in the typed write.
    - **user_loses:** - **Clearing no longer guarantees empty.** If Claude finds nothing better, the old value stays and the report says so. Choose 'kept empty' when you want the field gone.
- **Stale docstrings.** In your Lean files, a statement's docstring may show an older sentence until your next board edit after the session. This is cosmetic.
    - **why:** No content is 'yours unless Claude changes it', and no follow-on write lands in a frozen or held statement.

Together with R1 it removes:
- R3-1's root: a cleared Dependencies field written empty, against an S₀ that still had the arrows;
- R3-2 and R3-6;
- scenario (a) of S5R3-02.

It also keeps the typed part buildable.
  - [6]
    - **from:** reuse-first SIMP-7 + user-first SIMP-5 (its no-detach part only) + refuse-first S45-4 (its token and other-subject rules) + reuse-first SIMP-3 (its single predicate)
    - **title:** References: no detach, one rule for what Claude may change, and nothing another subject relies on changes in a session
    - **change:** **No detach.** Drop D5-12's detach: detachRefs in the typed write, detach units, planTypedWrite's `base`, the 'card Claude made in this session' problem, and the end confirmation's follow-on row.

**Trashing a referenced card.**
- The tokens of its unfrozen referrers stay as written and show 'deleted card', as the board's Delete already does.
- The window lists them in the Delete dialog's 'Referred to by' section.
- Frozen referrers are R3's problem.
- A window draft's token that names a card in that window's trash is refused, whatever `before` holds (refProblems). So no window card refers to what it trashes.

**Changing (not trashing) a referenced field** gives a warning for unfrozen referrers: 'Refers to it, and will read: ‹text›'.

**Other subjects.** Nothing another subject relies on changes in a session: neither what its Lean uses (D3-41) nor what its sentences and Whys refer to (D5-10, without its exemption for your typed change). The window locks such fields: '“‹A›” of ‹S› relies on it: change it outside a session.'

**One predicate.** `claudeMayChange(key)` is built from the effective table, every held map, heldFields, otherSubjectRefHolds and the other-subject rule. It feeds:
- the window's open and fuzzy problems;
- the Claude part's `open` and `arrowsInto`;
- the turn's HELD list.

**Unchanged.** Reference holding itself stays: RF-5 (a), FZ-4 bullet 2, D5-9, D5-21's absent holds and D5-22.
    - **user_loses:** - **No automatic rewording.** Deleting a referenced card in a transform no longer turns references to it into words. They read 'deleted card' until you reword the referring card, in the same window or later.
- **Other subjects' vocabulary.** In a session, you cannot change vocabulary that another subject's sentences refer to; do it outside a session.
    - **why:** telelean no longer writes into referrers, so:
- Claude's wording can never become yours (S5R3-01);
- no detached field over-restricts (S5R3-05);
- no line gets two units (S5R3-04).

The single predicate closes S5R3-03 and replaces three separate enumerations of held keys.

Holding stays, so S12 and §14 item 3 are not weakened. The behaviour now matches the board's Delete (FID5-13).
  - [7]
    - **from:** user-first SIMP-6 + refuse-first S45-7
    - **title:** A suggested premise is edited in place at once, and Claude never overwrites your edit
    - **change:** The premise window is D4-14's: sentence, Why and Lean statement, with no fuzzy field, instructions, tick, new card or trash. It queues nothing.

Submit transform:
1. runs TR-12, with unknown names a problem, as in R4;
2. runs slice 2's gap check ('closes the gap (checked)', 'may simply restate the target') on your version;
3. in one recorded, records-only session step, replaces the draft in PersistedSession.premises (`editedBy: 'you'`; a typed sentence sets `wordedBy: 'user'`).

The item returns to review, 'updated · worded by you'.

After that:
- An edited premise is never set to be redone, and never withdrawn by D2-17.
- If a check finds it no longer closes the gap, it stays in review, marked so. Accepting it then writes the card and arrow with no completion: the Result stays not proved.
- propose_assumption under its key is refused: 'The person edited this premise: propose a different one.'
- Its Accept still asks how you hold it (RV-1).
- Undo works until the next seal.
- Its sentence and Why count as your text for D5-8.

Gone: the premise unit, the no-Claude premise step, the premise's place in the queue, its staleness, and its run.json rewrite at a step's end.
    - **user_loses:** Nothing you could do before.

Two things change:
- Your edit applies at once.
- An edited premise that stops closing the gap is not reworked by Claude. Reject it for a fresh suggestion, or accept it and formalize the target again.
    - **why:** A premise draft stays outside ws/ until it is accepted, so the edit changes no file, freeze or other item.

It removes R3-8, R2-10, LC-9 and the premise branch of the queue.
  - [8]
    - **from:** reuse-first SIMP-4 (+ refuse-first S45-6's 'no separate rework-step kind')
    - **title:** The queue holds only Claude's part: drop it, never edit it; Claude's transform fills are reworked by an ordinary queued transform
    - **change:** **What a queued Claude part holds:** its cards, its open, fuzzy and cleared keys, slots, instructions and the tick. Never typed values, `original` or provenance.

**While it is queued**, its cards' items are declined `transform`, as with Shaky (D4-8 and D4-43 unchanged).

**Drop, never edit.**
- It can be dropped: one session step, after which its sources return to review.
- It cannot be edited: Edit…, rebaseDraft, `replace`, edit-mode windows and the window record's `edits` all go.
- A card with a queued Claude part opens in no other window: 'drop that transform first'.

**Rework.** A Shaky or to-be-redone item whose origin is a transform's Claude part is reworked at Submit review by a Claude part that telelean queues on its card or cards:
- scoped to what the item owns;
- with the Shaky note or the redo reason as instructions;
- with DO-3's identical-set check per set, and D2-15 still holding.

There is no `rework` step kind and no SessionTransforms.done.
    - **user_loses:** You cannot reopen a queued transform to adjust it. Drop it and open a new window instead; what you typed is already written and stays.
    - **why:** It removes LC-1's re-base and the stored provenance, LC-14, most of D4-30's staleness, D4-24's rework kind and S4M-14's narrowed scope.

It keeps DECLINE OPTIONS 3 (Shaky) for what Claude filled in a transform, which refuse-first's S45-6 would drop.
- **rejected:**
  - [1]
    - **from:** refuse-first S45-1 (the window starts from your version; Claude's proposals on its cards are set aside)
    - **why:** Fidelity:
- Decline windows would start from your files' version instead of Claude's proposal, against DECLINE OPTIONS 2 ('Adjust this card') and TRANSFORM 1's exact copy.
- Transforming a card would set aside Claude's accepted proposals on it and pull them back into review after a confirmation, with RV-5 cascades: a set-aside vocabulary item takes its users out too.
- Claude-added cards would get new ids.

Not needed: R2's card-granular items already keep copied Claude content Claude's, and with R1 there is no typed write over Claude's content inside a step left to protect.
  - [2]
    - **from:** refuse-first S45-2 (field-level ownership, one typed item per transform and card)
    - **why:** Rejected except its clearing and mirror rules, which are adopted in R5.

It keeps a third item per card, with field-level ownership split from Claude's item on the same card. That still needs D4-44's covers (its own residual says so) and new per-transform-and-card keys beside slice 2's stable item ids.

R2's card-granular ownership needs neither.
  - [3]
    - **from:** refuse-first S45-3 (every expectation also accepts your newest live typed value)
    - **why:** It changes slice 3's frozen comparator for every kind of expectation (standing, foreign, start, own, held) and needs bookkeeping of the newest live typed value.

R3 reaches the same protection with slice 3's own moves: replace the reasons by an own freeze, with no comparator change.

Its effect for references (frozen referrers follow your words) is kept as R3's logged reversal.
  - [4]
    - **from:** refuse-first S45-4 (the parts not in R6)
    - **why:** Adopted in R6: the token refusal, the other-subject lock and no detach.

Rejected parts:
- Refusing a trash whose arrow enters frozen Dependencies. R3 keeps such Dependencies frozen at the new value, as TR-15 and FZ-3 bullet 2e say for follow-on edits.
- Requiring every referrer of a trashed card, frozen or not, to be edited in the window. R6 lets unfrozen ones show 'deleted card', as the board's Delete does; frozen ones are R3's problem.
  - [5]
    - **from:** refuse-first S45-5 (typed Lean only on names in your files or the same window)
    - **why:** It also forbids typed Lean that uses vocabulary Claude proposed in this session, which costs fidelity.

Its claim that a typed item then depends on no Claude item is wrong: when Claude changes one of your declarations in the session, that change is an RV-5 rule-1 dependency, and accepting the typed item on write would break §14 item 4.

Under R2 nothing is accepted on write, so the stricter rule buys little. It stays the fallback if D4-32's unconfirmed path for session names causes trouble.
  - [6]
    - **from:** refuse-first S45-6 (the typed commit becomes the step's S₀; no rework steps)
    - **why:** It keeps telelean's write inside a Claude step:
- a typed commit that does not build leaves the step limits without S₀ facts, and freezes pending (its own residual);
- Resume still needs that commit's facts, which is R3-7 in another form.

It also drops Shaky on Claude's transform fills (DECLINE OPTIONS 3).

R1 removes the in-step write altogether. Its 'no rework-step kind' idea is folded into R8, which keeps Shaky.
  - [7]
    - **from:** user-first SIMP-5 (references hold nothing; markers only)
    - **why:** Rejected except its no-detach part, which is in R6.

It drops a safety property of the spec: S12, RF-5 (a), FZ-4 bullet 2, and the held content of §14 item 3. A frozen card's prose could then change through a Claude rewording that a group Accept takes, since a sentence change on a card without Lean is not an RV-7 item.

Once detach and TransformFreeze revalues are gone (R3, R6), holding is just slice 3's table plus heldFields, and that is not where the open findings come from.

Its 'smaller step back', an automatic 'Freeze what it refers to', can be revisited if sub-slice 5d stays troublesome.
  - [8]
    - **from:** reuse-first SIMP-1 (its out-of-session half: the typed part as a board step before the session starts)
    - **why:** - Exit would no longer cancel what you typed (REVIEW 6, EDIT SESSIONS).
- The session would be created at Submit rather than by the button (EDIT SESSIONS 1, INITIATING 2).
- Typed fields would become standing freezes.
- A typed part that cannot build without Claude's help would leave your files unbuildable, with the session unable to start (checkBase).

The provisional session is not where the open findings are, and R1 (user-first's provisional path) keeps it.
  - [9]
    - **from:** reuse-first SIMP-2 (auto-accept of items that are wholly yours)
    - **why:** Replaced by R2, which is this proposal's own fallback.

The auto-accept predicate omits RV-5: an item 'accepted as yours' could rest on a Claude change you have not accepted, against §14 item 4. It must also ignore id write-backs and pins.

RV-7 b5 is spec text, while REVIEW 3 has every item start in review.
  - [10]
    - **from:** reuse-first SIMP-3 (the parts not in R3 and R6)
    - **why:** Adopted: its Unfreeze-then-own-freeze idea is R3, and its single predicate is in R6.

Rejected parts:
- Follow-on keys 'freeze nothing' after the Unfreeze. That silently unfreezes a frozen receiving Dependencies when you trash a source (FZ-6, FROZEN 3).
- The 'freeze them again at the new version' holder dialog. It needs frozenChangesOf over planned keys and re-valued holder maps, where R3 uses D4-21's existing refusal.
  - [11]
    - **from:** reuse-first SIMP-5 (known names, no kind changes and no mirrors inside a session)
    - **why:** - **Names part:** superseded by R4. Its scratch against the stage's judged commit would let Claude's in-review coercions shape what your own check confirms, and would elaborate against hidden proof material.
- **Mirror part:** adopted in R5.
- **Kind lock:** rejected. It narrows TR-11 inside sessions, and R2's ledger allowances already cover type: and .holds.
  - [12]
    - **from:** reuse-first SIMP-6 (reword a suggested premise in its own Accept)
    - **why:** Rewording only the sentence and Why takes away editing a suggested premise's Lean statement (TRANSFORM 9, D4-14).

R7 is no harder to build and keeps it.
  - [13]
    - **from:** reuse-first SIMP-7 (frozen referrers re-frozen by a dialog)
    - **why:** Adopted in R6: no detach, 'deleted card', and the token refusal.

Only its handling of frozen referrers (a dialog that re-freezes them holding the card as absent) is replaced, by R3's refusal, which is D4-21's existing pattern.
- **open_after:** **Still open after the recommended set.** Only S5R2-08 remains: the # picker's → key. Take → only when the character after the caret is whitespace or the end of the field (the caret ends the #-word); otherwise → moves the caret. Add pickerReduce cases for both.

**Eliminated, and by which change:**
- R3-1: R1 + R5
- R3-2: R2 + R5
- R3-3, R3-4, R3-5: R2
- R3-6: R5
- R3-7: R1
- R3-8: R7
- S5R3-01: R2 + R6
- S5R3-02: R3 + R5
- S5R3-03: R6's predicate and lock
- S5R3-04: R6's token rule, and no detach
- S5R3-05: R6 (no detach)

**The fixer must still handle these:**
1. **Hidden results during R1's in-place judge.** Take the write back only on failures caused by visible content. A name clash with hidden proof material is D2-69's accepted channel: log it there. A hidden Result the write breaks is taken out silently. Add twin tests: two states that differ only in a hidden Result give the same window outcome.
2. **Crash or reload during the decision write and its judge.** Use slice 2's inFlight: finish the write or take it back, and keep the window record.
3. **The 'wholly yours' comparison** must ignore derived id write-backs and normalise's pins.
4. **Amendments to log** against frozen slice 3 and against slice 2:
   - the judged decision write kind;
   - own freezes valued by a decision;
   - the `replaced` mark;
   - the withdrawal rule, applied also in slice 3's whole-model steps;
   - D4-21's holder problem for references;
   - the ledger `transform` entry, and its drop on Reject or take-out;
   - `claudeMayChange`.
5. **AP entries with reversals** for each narrowing: D4-4's atomicity, RV-7 b5, TR-12 (c), the meaning of TR-13's 'leave it to Claude', the timing in RV-9 bullet 2, D5-12, D5-19, D5-10's exemption, D-9 mirrors inside sessions, and the new meaning of clearing a field.
6. **Rewrite pass, then one fresh critic round.**
   - Slice 4: §2.1–§2.3, §2.8–§2.9, §3.2–§3.11, §5 and §6, plus D4-1, D4-4, D4-5, D4-7, D4-14, D4-22–D4-24, D4-29–D4-34, D4-40, D4-42 and D4-44.
   - Slice 5: §2.5–§2.6 and §3.5–§3.7, plus D5-10, D5-12, D5-19 and D5-21.
7. **Fixes that stay**, to re-verify against the rewritten plan rather than assume:
   - R2-3: the Claude part as computeItems' active step;
   - R2-6: originalKeyOf on the direct path;
   - R2-7: names the draft deletes;
   - R2-8: a new vocabulary card's gloss needs its declaration;
   - R2-9: sources' revs after freeze actions;
   - R2-11: typed proofs refused;
   - R2-12: the undo scope;
   - D4-19's target locks, D4-21, D4-39 with R5's addition, and D4-43.
