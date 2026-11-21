# propose:user-first

Agent `a0d38a505628d5624` of workflow `wf_ad6807bb-b8a`. Verbatim output (JSON alongside).

- **summary:** Read against the user's own words (prompt20: TRANSFORM 1–10, DECLINE OPTIONS 1–3, REVIEW 3–6, FROZEN 1–5, INITIATING 2, REFERENCE SYSTEM 1; prompt21_midturn: ★D1–★D6 and message 3), the review failures sit in mechanisms the user never asked for.

**Slice 4.** It writes what the person typed inside Claude's queue step, then owns that content line by line beside Claude's content on the same card. The machinery for this is:
- typed units and typed items (soft, follow, supersession, must-hold);
- two baselines (S₀ and S₀ᵗ/typedStart);
- TransformFreezes with revalue;
- accepted covers.

Each round's fixes added cases here. Round 1's blockers (S4M-1, S4M-2, LC-1), round 2's blockers (R2-1, R2-2) and all eight findings still open (R3-1–R3-8) are in this machinery.

**Slice 5.** It makes # references hold their targets, on top of that same machinery (held revalue through TransformFreezes, detach units owned by typed items). Its first-pass blockers (S5-SOUND-01, FID5-1, LC-1) and both open majors (S5R3-01, S5R3-02) came from this.

**What the user asked for:**
- a window of exact copies, with new cards and a trash;
- fuzzy fields that Claude fills, and typed fields that become FROZEN;
- the "add cards" checkbox and Instructions;
- transforms for any card, suggested premises and vocabulary included;
- Reject, Transform ("adjust this card") and Shaky, with a group decline as the multi-card transform;
- freezing at all times;
- a # dropdown, found by sentence (★D6).

**What the user did not ask for:**
- typed content accepted on their behalf (RV-7 b5);
- Claude defining names inside their Lean (TR-12 c);
- references that lock their targets (RF-5 a, FZ-4 bullet 2, S12);
- references rewritten into words when a target is deleted (D5-12);
- all-or-nothing transform steps (D4-4).

Following AP-24's precedent, six coarser rules keep every capability the user named. They reuse slice 2–3 primitives instead of building parallel ones:
- **SIMP-1:** a transform's typed part becomes an immediate, judged decision (the pattern of slice 3's premise write). Only Claude's part waits for Submit review, as an ordinary step from one judged S₀.
- **SIMP-2:** typed content belongs to the card's ordinary review item. An item that is wholly the person's takes a plain Accept.
- **SIMP-3:** typed fields become ordinary own freezes. Earlier reasons on those keys are replaced, never revalued.
- **SIMP-4:** typed Lean may use only names that are already defined.
- **SIMP-5:** references are display-only links, with markers on the items that affect them.
- **SIMP-6:** editing a suggested premise is an immediate change to the session's records, and Claude never overwrites it.

Together they remove all 8 open slice-4 findings and 5 of the 6 open slice-5 findings. The sixth, S5R2-08, is a plain picker fix. They also remove the mechanisms behind the earlier blockers.

§14's guarantees still hold:
- nothing enters without the person's Accept;
- frozen and held Lean stays at its value;
- there are no hidden arrows;
- the base never moves;
- every decision is a recorded session step.

Each simplification needs an AUTOPILOT DECISION entry with its reversal. The rewritten sections need one critic round before building starts.
- **simplifications:**
  - [1]
    - **id:** SIMP-1
    - **title:** Carry out what you typed at once, as a decision; only Claude's part waits for Submit review
    - **change:** This replaces slice 4 §3.8–§3.9's transform step (typed write, `typed` commit, typed judgement, Claude's turn, all or nothing).

(1) **In a stage, Submit transform carries out the typed part at once**, as one session decision, "Transform: ‹label›":
- TR-12 (a) and (b) run as planned.
- Slice 2's RV-5 confirmation then runs for the accepted items it touches (§3.8 step 3's list, moved here).
- telelean writes the typed part into ws/ as a recorded decision write in slice 2's write queue. This is planTypedWrite without units: new cards and vocabulary, field lines with the D-9 mirror, statements, kinds, Dependencies, cleared proofs and the trash. Trashing Claude's Add is a Reject of that Add inside the same decision.
- The judge then runs while the modal window stays open ("Checking your Lean…"). It uses the freeze table as the decision leaves it: the keys the write changed are frozen at this judgement's values (SIMP-3).
- The write is taken back whole, and the window stays open with the problems, when the judgement shows a failure on visible content that the state before it did not have: a build error, the typed-meaning mismatch (S4M-1's comparison with the scratch, now made at this judge), or a frozen, held, other-subject or B.2 finding. Slice 3 §3.7 already uses this pattern for a premise write.
- A hidden Result whose proof the write breaks never takes the write back. The judge takes that Result out to be redone, silently while the results are hidden (D2-64), as after any decision.

(2) **So the typed part must build on its own.** In a session:
- a TR-13 statement or definition dependent is either "Delete it too" or "Claude re-formalises it": its Lean joins the transform as fuzzy, emptied by the write, and its old text is quoted in Claude's turn;
- a proof dependent is marked broken by telelean in the same write (slice 3's `proof-broken` entry, with the transform as origin);
- a session target's Result that the change breaks is taken out to be redone in the same confirmed decision, so D4-19's reworkResults becomes slice 2's ordinary Submit rework;
- typed Lean uses only defined names (SIMP-4).

(3) **What still needs Claude is queued as the transform's Claude part.** That is: fuzzy fields, open fields with instructions, slots, "Claude may add cards", and D4-39's may-break proofs.
- The Claude part is a scope only (keys, arrowsInto, slots, mayAddCards, instructions), never a draft to apply again.
- At Submit review each Claude part is one ordinary step: computeItems' active step, with target `transform:<id>` and no Result (R2-3's fix).
- Its S₀ is the judged head, which already holds the typed part. Slice 2's step limits and slice 3's checks apply unchanged, with `openItems` the items that own content under its keys.
- Its scope is recomputed at Submit and at Retry from the keys that still exist; a freeze made since then wins. A part with nothing left is dropped, with a note.
- The items on a queued Claude part's cards count as its sources for D4-43.

(4) **In a provisional session**, "needs Claude" writes the typed part as the session's first write (after consent and checkBase), judged as in (1), then runs the Claude part as the first step. start-session and the direct path are unchanged.

(5) **A transform with nothing for Claude is just the decision:** no queue, no extra stage (D4-5), no staleness.
- Its Undo (on the session stack, until the next seal) reverts the write by slice 2's inverse-patch merge (refused on a conflict), restores statuses and freezes, and drops its queued Claude part.
- Edit… opens a new window on the current state and replaces the queued Claude part. There is no rebaseDraft.
    - **eliminates:** Open slice-4 findings:
- R3-1 (B.3 reads "drawn" at an S₀ from before the typed write);
- R3-7 (typedStart's facts are not persisted).

Earlier slice-4 findings:
- round-2 blocker R2-2 (slice 2's frozen-items rule judged against an S₀ from before the write);
- R2-3, reduced to "the Claude part is an ordinary active step";
- round-1 blocker S4M-2 (rules reading S₀ before the typed write; a trashed card's `.holds` put back);
- the valuation gap of blocker S4M-1 (typed freezes valued at a state Claude shaped);
- S4M-12;
- LC-5 and IMP-20 (recovery of a three-part typed write);
- LC-7 (masked copies stale at Submit);
- LC-8 (Retry re-checks);
- LC-11 (the cascade's separate write, `submitting`);
- LC-15 (a reconcile Reject with no decision commit);
- IMP-11, IMP-12 (ids before the scope), F18.

Mechanisms gone:
- the `typed` shadow commit and PersistedStep.typedCommit;
- JudgeInput.typedStart and D4-33's S₀ᵗ list;
- the typed judgement as a step phase, and the no-Claude transform step;
- §3.8 step 2's re-analysis of typed content, and most of D4-30's staleness;
- rebaseDraft and Edit…'s stored provenance.

Decisions gone: D4-4, D4-5 (for transforms with nothing for Claude), D4-40, D4-42.
    - **user_loses:** (a) **Atomicity.** If Claude's part fails, gives up or is cancelled, what you typed stays applied and in review; the whole transform is no longer taken back. Retry runs Claude's part again. Undo takes the typed part back until the next Submit; after that, you Reject it.

(b) **A longer wait at Submit transform.** In a stage, Submit transform also waits for a build of the working copy with your edits (seconds to about a minute). It refuses, with the errors, if your Lean does not build where it lands.

(c) **"Leave it to Claude" changes meaning** for a statement or definition your change breaks. Claude now re-formalises it from its sentence (seeing its old Lean); it no longer patches the broken Lean. A proof your change breaks becomes a Proof broken item at once (the planned Claude step could only have marked it broken too, TR-14).

Gain: a transform with nothing for Claude applies at once and can be undone, with no wait for Submit review and no extra stage.
    - **soundness:** - **The base never moves.** The write goes into ws/ only, as every decision's does. Your files change only at Apply (ES-7, §14 item 11).
- **Nothing is assumed without your Accept.** Everything the write or Claude's part produces is an item (SIMP-2), with RV-7's classes. Apply's backstop still runs on exactly F (§14 item 5).
- **Frozen and held content is kept.** The write is your own change (FZ-1) and becomes your freeze (SIMP-3). Any other frozen, held or other-subject finding it would introduce takes it back. Frozen Lean that relies on what you change still blocks the window until you unfreeze or delete its holder (D4-21). Claude's part is judged by slices 2–3 from one judged S₀ that contains your write, so no rule needs a second baseline.
- **No hidden arrows.** B.2 runs at the write's judge, and proofs that use a removed arrow are dependents (marked broken or deleted).
- **RV-6.** The take-back reads only visible findings. A hidden Result changes silently (D2-64). Your typed statements are statement items, so they keep the results hidden until you decide them (AP-24's stage-level reveal).
- **Decisions are never lost.** The transform is one recorded session step, with its cascade confirmed. A failed Claude part never removes the typed part. The window is modal (TW-1), so no other decision interleaves with the write.
    - **reversal:** Restore slice4-plan.after_ultra.md §3.8–§3.9: the typed write inside the queued transform step, S₀ᵗ/typedStart, the typed judgement, D4-4 and D4-5. The decision write can stay as the path for transforms with nothing for Claude.

Log this as one AUTOPILOT DECISION that replaces D4-4, D4-5, D4-33's S₀ᵗ part, D4-40 and D4-42.
  - [2]
    - **id:** SIMP-2
    - **title:** No typed items: your edits belong to the card's ordinary review item
    - **change:** Drop TypedUnit, typed items and line-by-line ownership (§2.2, §3.10).

(1) **computeItems keeps slice 3's card-granular ownership.**
- Every difference of a card's fields from B belongs to `card:<c>` (Add, Change, Formalize or Delete). The fields are sentence, Why, stance, source, kind, the Lean statement with its mirror, and the `premises:` entries the person wrote.
- A new card you make is a ledger `card` entry with the transform as origin: an Add, never an intermediate (the plan's IMP-14 entry).
- A trash is slice 3's ledger `delete` entry, a Delete item.
- Vocabulary changes are `decl:` or `vocab:` items.
- Claude's arrows stay `arrow:` items.

(2) **Each transform write records one ledger `transform` entry in run.json.** It records, per card and field, the value written, plus the lines Claude may never write: `type:`, `follows_from`, the person's `premises:` entries, a `worded_by` removal, a `.holds` turned from theorem to axiom or removed, and a new block's bookkeeping.
- It only grants allowances: G5, B.4, new-axiom (with D4-33's "still bound to its card" amendment) and the backstop accept exactly those lines.
- It also feeds the "you typed it" badge, EN-2's "What you typed yourself" list, and D5-8's reference allowance.
- It owns nothing, never has to hold, and never supersedes. It goes only with the Undo of its decision.

(3) **Class.**
- An item whose every difference from B equals the newest live `transform` entry's value for that card and field is "wholly yours". It is badged "you typed it" and takes a plain Accept (group Accept takes it), even where RV-7 would ask for its own Accept.
- The exception is an item whose Lean is unconfirmed (D4-32): it takes its own Accept, shown in fully explicit form.
- An item with any of Claude's content is classified as today.
- Nothing is accepted automatically.

(4) **An item that mixes your fields and Claude's is one item.**
- Accept freezes all of it (RV-4). So no covered target outside its content remains, and D4-44 and its amendment to slice 3 §3.3 are dropped.
- Reject restores your files' version. Your typed fields are frozen, so it goes through slice 3's decline dialog (D3-48).
- Shaky reworks only its unfrozen part (D3-49).
- Transform opens it again.

(5) **The D-9 mirror** is an ordinary follow-on line of the card's statement. It is written whenever the docstring equalled the old sentence; SIMP-3 decides its freeze.

(6) **Reconcile:** an item whose content a later step returned to your files' version is withdrawn, marked "changed back to your files' version" (R3-5's rule, generalised). It never gets slice 2's "disappeared" problem.

(7) **The window's one gloss rule** is R3-6's generalised one: "Type the declaration of a vocabulary card whose gloss you write, or leave both to Claude."
    - **eliminates:** Open slice-4 findings:
- R3-2, R3-3, R3-4, R3-5;
- R3-6, by adopting its own one-line window rule (without units, nothing else is needed).

Earlier slice-4 findings:
- round-2 blocker R2-1;
- R2-4, R2-5, R2-8, and R2-10's typed half;
- round-1 blocker LC-1: provenance now only sets the starting chips, so nothing becomes yours through it;
- S4M-3, S4M-4, S4M-5 (back to slice 2's RV-5 confirmation), S4M-7, S4M-13;
- IMP-15, F16.

Slice-5 findings: S5R3-01's ownership half, and S5-SOUND-11.

Mechanisms gone:
- TypedUnit, with its kinds (line, entry, decl, docstring, block, premise) and its soft and follow flags;
- supersession, and absence superseding earlier units;
- "typed units hold" and typed content keys;
- the queue end's "accepted as yours" fixpoint;
- RV-5 rule 3 for typed items, and the sentence-pairing edge;
- acceptCovers of typed drafts, and coverAtJudge, coverAtAccept and frozen.covers;
- planItemRevert for typed items;
- the backstop's re-derivation of typed ownership.

Decisions gone: D4-1, D4-22, D4-29, D4-31's soft units, D4-33, D4-44.
    - **user_loses:** (a) **Your own edits are no longer accepted for you.** Each card you changed appears as "Add / Change / Delete ‹card› · you typed it" and needs one plain Accept; group Accept takes them all at once. Where Claude's content shares the card, RV-7's own Accept applies, as for any of Claude's items.

(b) **One item per card.** On a card where you typed one field and Claude filled another, you cannot accept Claude's part and reject yours, or the reverse. You Transform the card again instead.

(c) **Reject brings back your files' version**, not "Claude's proposal before your edit". That version stays viewable among the item's earlier versions, so you can copy it into a new transform.

RV-7 b5 ("content you typed yourself counts as accepted by you") comes from the spec, not from your words. REVIEW 6's "ends successfully when all changes are accepted" now holds literally.
    - **soundness:** - **Ownership stays total and disjoint at card granularity**, exactly as in slice 3. So planItemRevert, D3-48's frozenChangesOf, D3-49's keep set and the backstop need no new kind. An accepted item's freeze covers only content it owns, which removes R2-1's root cause.
- **Nothing becomes the model's without an Accept.** This is strictly more review than RV-7 b5.
- **The wholly-yours exemption cannot be forged.** It is read from what telelean itself recorded in run.json, out of Claude's reach, and compared field by field on the same card, so Claude cannot forge it (cheat T8). Unconfirmed Lean still takes its own Accept.
- **Your typed fields are frozen** (SIMP-3), so Claude cannot change them.
- **Claude-forbidden lines** (kinds, `.holds`, `worded_by`, premises) still pass only exactly as telelean recorded them for you. So the protections of S6 and S9 hold.
    - **reversal:** Step back in two stages:
1. Auto-accept a wholly-yours item at each judge-apply, once its RV-5 dependencies are accepted (RV-7 b5 at card level).
2. Only if line-level separation is wanted, restore §2.2 and §3.10 of slice4-plan.after_ultra.md (typed items, units, D4-1, D4-33, D4-44).
  - [3]
    - **id:** SIMP-3
    - **title:** What you type is an ordinary session freeze; earlier reasons are replaced, never revalued
    - **change:** Drop TransformFreeze, the `transform` reason and revalue (§2.3, §3.11). FZ-3 bullet 2e is met by replacement instead.

In the judge-apply of a transform's write, as part of that decision and recorded in its FreezeDelta (so Undo restores all of it):

(1) **Each field you typed gets an own freeze** (slice 3's `yours`) at that judgement's value, labelled "frozen: you typed it in ‹label›". The value is exact because the write builds (SIMP-1, SIMP-4).

(2) **Every key the write changed that already had reasons stays frozen, at its new value.** This covers fields you typed and follow-on keys alike: another card's Dependencies or mark, a kind, a cleared proof, a docstring mirror.
- Its standing and foreign reasons go into `standingCleared`, and its session-start reason into `startCleared`, each marked `replaced`.
- Its own freeze takes the new value.
- A follow-on key that had no reason stays unfrozen.

(3) **Accepted reasons are never replaced.** The decision's RV-5 confirmation has already returned those items to review.

A key held by a frozen card's Lean (FZ-4) is not yours to change: D4-21's window refusal stays.

Rows in the end confirmation:
- own freezes of fields you typed get keep ticks at Apply;
- a `replaced` standing reason gets no Unfreeze row, since the standing freeze returns at the end (FZ-8);
- follow-on own freezes end with the session, with no keep tick.

The direct path keeps D4-16.
    - **eliminates:** Round-1 slice-4 findings: S4M-8, S4M-13, IMP-6, IMP-15, LC-2, LC-3, LC-16.

Mechanisms gone:
- the TransformFreeze type and its typed flag;
- the newest-per-key rule;
- pending values and their later valuation;
- `FreezeTable.transforms`;
- §3.11's changes to slice 3's decline dialog;
- slice 3 §3.12's `revalue` hook.

Decisions gone: D4-23's valuation, and D4-34.

On slice 5's side: S5R3-02, S5R2-01, S5R2-02, and IMP-2, S5-SOUND-02, slice-5 LC-2 and FID5-2. All of these are about held maps carried by TransformFreezes.
    - **user_loses:** Almost nothing. A field you type is frozen exactly as if you had typed it and then pressed Freeze, and your standing freezes are back on the same fields after the session.

Two visible differences:
- the field shows one reason ("frozen: you typed it in ‹label›") instead of the stack it had;
- Unfreeze of that field unfreezes it for the rest of the session even if it was standing-frozen before. Unfreezing a standing freeze in a session already works this way.
    - **soundness:** - **FROZEN 1–3 and FZ-6 hold.** What you type is frozen, and Claude can never change it. Only your own action (the transform, Unfreeze, Undo) changes reasons. A replaced reason is replaced by a freeze on the same key, never by nothing, and standing records come back at the end (FZ-8).
- **Slice 3's one table and one whole-state check stay as built.** They see ordinary own freezes whose exact values come from a judged state that already contains them. So there is no pending period in which Claude could act (S4M-1's gap).
- **No conflicting expectations.** The Submit cascade still clears accepted expectations first, so no two expectations of one key can disagree.
    - **reversal:** Restore §2.3 and §3.11 of slice4-plan.after_ultra.md (a coexisting `transform` reason, with revalue). Or keep own freezes and only add a `transform` entry to FreezeReasonView, for display.
  - [4]
    - **id:** SIMP-4
    - **title:** Typed Lean may use only names that already exist (no "Claude must define")
    - **change:** TR-12 (c) is narrowed. A typed statement or declaration may use only:
- names your files define;
- names the session's visible content defines (D4-6);
- names that a declaration typed in the same window declares (S4M-9).

Any other unknown name is a problem on its field: "‹name› is not defined: add it as a vocabulary card in this window and type its declaration, or leave this statement to Claude."

A new vocabulary card left fuzzy defines nothing for typed Lean: "“‹c›”'s Lean uses ‹name›, which this window leaves to Claude: type its declaration, or leave “‹c›”'s statement to Claude too."

These go:
- `mustDefine` and its needs-Claude reason;
- the outcome-changed dialog;
- the MUST DEFINE line of Claude's turn;
- `new-definition`'s allowance for MUST DEFINE names;
- D4-7, and D4-32's unknown-name case.

So every typed piece has scratch constants, and SIMP-1's write always builds where TR-12 (b)'s visibility rule says it lands.
    - **eliminates:** - R2-3's MUST DEFINE case;
- round-1 IMP-11 (a transform that needs names defined stays stale for ever) and UI-8;
- S4M-9's "Claude defines" half;
- D4-7, and D4-32's unknown-name trigger;
- slice-5 D5-21's MUST DEFINE window problem (half of S5R2-03).

It is also the prerequisite that lets SIMP-1 write the typed part on its own, with exact freeze values for SIMP-3.
    - **user_loses:** You can no longer type a Lean statement that uses a predicate nobody has defined yet and let Claude define it. Instead, you can:
- add it as a vocabulary card in the same window and type its declaration (for example `axiom Wicked : Character → Prop`);
- or leave the statement to Claude ("Claude fills this"), with an instruction naming the predicate.

Using Claude's vocabulary that is still in review keeps working (D4-6).
    - **soundness:** This only removes cases.
- Every typed piece elaborates fully, in the scratch and in place. So your check confirms what it means, and it is frozen exactly.
- Claude never adds a declaration that changes what your own Lean says.
- TR-12 (a) and (b) are unchanged, and so are the visibility, deleted-name (R2-7) and proof (R2-11) rules.
    - **reversal:** Allow unknown names again, as "Claude must define" (TR-12 c, D4-7). The typed part of such a transform cannot be written on its own, so it would run whole in its Claude step, as in slice4-plan.after_ultra.md §3.9. This is the only case that would need that path.
  - [5]
    - **id:** SIMP-5
    - **title:** # references are links for reading: they hold nothing and are never rewritten
    - **change:** (1) **Drop holding by references** (RF-5 a, FZ-4 bullet 2, S12's fix). These go:
- referenceHolds, holdingMap, and the filling of heldFields (slice 3's hook stays empty);
- otherSubjectRefHolds, pendingHolds, transformHolds, refExceptions, HeldValue.deps;
- D5-22's refusal;
- reference HELD lines in Claude's turns;
- the window's "held by … (it refers to this)" marks and problems.

(2) **Drop D5-12's detach**, and planTypedWrite's `base` with it.
- A reference whose target is trashed (by you in a transform, or by an accepted Claude Delete) keeps its token and shows "deleted card ‹id›". Ids are never reused (RF-2 b), and an id is a slug of the card's first sentence.
- TR-13 lists such referrers as warnings ("Its reference will show “deleted card”: retype it here for words"), never as dependents to choose for, and never as problems.
- refProblems still refuses a new token that names a card in a trash.

(3) **Markers instead.** They are computed at each judgement from the masked model, for display only.
- Every item that changes a referenced card's sentence, deletes a referenced card or field, or adds or removes a referenced Lean name shows, in its row and detail: "Referred to by “‹A›” (frozen): it will read ‹new label›".
- The variants are "will show “deleted card”", and, on a vocabulary Add, "gives its reference to ‹n› a new target". This last one replaces D5-21's `revived` refusal.
- Optional: a Context Menu action "Freeze what it refers to", an ordinary freeze of the referenced fields.

(4) **Kept unchanged:**
- the # dropdown in every prose field;
- search by sentence, field references, and chips with current names;
- Copy reference;
- the id registry and F1;
- rendering for Claude, with raw spans;
- D5-8 (Claude adds no reference), whose allowance is now B, the values recorded in `transform` entries, and the premise rationale.
    - **eliminates:** All open slice-5 findings but one: S5R3-01, S5R3-02, S5R3-03, S5R3-04, S5R3-05.

Earlier slice-5 findings:
- S5R2-01, S5R2-02, checks-S5-SOUND-09, S5R2-03, S5R2-04, S5R2-06, S5R2-07;
- the first-pass blockers S5-SOUND-01, FID5-1 and slice-5 LC-1;
- IMP-2;
- S5-SOUND-02, -03, -08, -11, -12, -13 and -14;
- FID5-2, FID5-6, FID5-13;
- slice-5 LC-2, LC-6, LC-7, LC-9, LC-10, LC-11;
- UI-4, UI-17.

Mechanisms gone:
- nearly all of sub-slice 5d;
- D5-9, D5-10, D5-12's detach, D5-19, D5-21's absent holds, D5-22;
- slice-4 §2.6's held bullets (a TransformFreeze's `held`, detach units, reference-held keys in sessionFrozen);
- slice-4 §3.12's detach hook.
    - **user_loses:** (a) **A frozen card's # references no longer lock what they point to.** In a session, Claude may propose to reword or delete a card, or change a field, that a frozen card refers to, as for any unfrozen card. The item then says "Referred to by “‹A›” (frozen): it will read …", and nothing changes unless you accept it. To lock a target, freeze it (optionally with "Freeze what it refers to").

(b) **Deleting a referenced card no longer turns the references to it into words.** They show "deleted card ‹id›", as the board's Delete already does, until you retype them. The window lists them.

(c) **Claude may declare a Lean name that a dangling reference names.** Its item says so.

Everything REFERENCE SYSTEM 1 and ★D6 asked for stays.
    - **soundness:** - **References never reach Lean's meaning.** Tokens live only in sentences and Whys, and reach Lean only as words in docstrings (RF-2 d, D5-11). So no statement, proof, band, glow, footprint or B.2 result depends on them. FZ-4 bullet 1 still holds everything that frozen Lean relies on.
- **Changes still need your Accept.** Every change Claude makes to a referenced card is an item that needs your Accept, and the marker shows its effect on the referrer when you decide.
- **Frozen text is still compared exactly.** A frozen card's own stored text is compared exactly as before.
- **No silent retargeting.** Ids are never reused and Claude adds no reference, so a reference never silently gets another target.

Proof integrity is untouched. Only the prose a frozen card displays can change, and only through your Accept.
    - **reversal:** Restore slice5-plan.after_ultra.md §2.5–§2.6 and §3.6–§3.7 (D5-9, D5-10, D5-12, D5-19, D5-21, D5-22), on top of SIMP-3's own freezes.

A smaller step back: make "Freeze what it refers to" automatic for a frozen card's whole-card references (an own freeze of each target's sentence). That needs no held revalue.
  - [6]
    - **id:** SIMP-6
    - **title:** Editing a suggested premise is an immediate record change that Claude never overwrites
    - **change:** A premise window (D4-14's: sentence, Why, Lean statement; its UI is unchanged) is carried out at Submit transform as a decision that changes only the session's records, never as a step:
- TR-12 (a) and (b) run on the typed statement, with unknown names refused as in SIMP-4.
- The draft in PersistedSession.premises is replaced and marked `editedBy: 'you'`.
- The item returns to review, "updated (you edited it)".
- The next judge checks it again (slice 2 §3.8, "closes the gap (checked)").

An edited premise is never set to be redone, and never withdrawn by D2-17.
- If it no longer closes the gap, it stays in review, marked so.
- Only your Reject, another premise window, or your Shaky decline changes it.
- `propose_assumption` for the same key answers "The person edited this premise: propose a different one."

Its Accept still asks how you hold it (RV-1). Its sentence and Why count as the person's recorded text for D5-8.
    - **eliminates:** - open slice-4 R3-8;
- round-2 R2-10 (the `premise` unit's owner and its hold check);
- round-1 LC-9 (the premise rewrite escaping rollback), and the step half of IMP-8;
- slice-5 S5-SOUND-05 and IMP-17 (the premise sentence's tokens against adoption);
- the premise branch of the queue and of D4-14.
    - **user_loses:** Nothing beyond D4-14's existing narrowing: a premise window has no fuzzy fields, instructions, new cards or trash, and no place in a group window.

Gain: the edit applies at once and can be undone until the next Submit.
    - **soundness:** - **It changes nothing in the working copy.** A premise draft is outside ws/ until it is accepted (slice 2 §3.1). So the edit changes no file, no frozen content and no other item.
- **The checks are unchanged.** The gap check, and the Accept's "how you hold it" (a belief item with its own Accept), stay as they are.
- **Your text is never overwritten.** Claude never rewrites an edited premise, so what you typed changes only by your own action (TRANSFORM 5, FROZEN 2).
    - **reversal:** Route premise windows through the queue again (D4-14 and §3.7 of slice4-plan.after_ultra.md), keeping R3-8's rule.
- **residual_risks:**
  - New seams that must be built carefully:
- SIMP-1's transform write is a new kind of judged write in slice 2's write queue: a sibling of the premise write, taken back whole on failure.
- SIMP-3 adds a `replaced` mark to slice 3's standingCleared and startCleared.
- SIMP-2's `transform` ledger entry joins G5, B.4, new-axiom and the backstop as an allowance.

Slice 3 is frozen and slice 2 is being built, so these must be logged amendments, as slice 4 §0 already lists its own. The rewritten slice-4 §3.5–§3.11 and slice-5 §3.6–§3.7 need one critic round before 4a starts.
  - Hidden results. With the typed part applied at once, whether the write is taken back must depend only on visible findings. A hidden Result that the write breaks must change silently (D2-64). This needs a twin test: two states that differ only in a hidden Result must give the same window outcome.
  - Atomicity is gone. A transform whose Claude part fails leaves its typed part, the emptied fuzzy fields and the Proof broken items in review. If they are accepted anyway, Apply writes cards without Lean, which is legal and visible. The stage report and the queued-transform row must say that Claude's part did not run, and offer Retry.
  - More review work:
- every card the person edits in a session needs one plain Accept;
- "Leave it to Claude" now empties a dependent's Lean at once. For a widely used definition, that can mean many fuzzy statements and Proof broken items.

The old Lean must be quoted to Claude, so that its re-formalisation stays faithful.
  - SIMP-5 rests on references never carrying Lean meaning. With markers only, an inattentive group Accept can change what a frozen card's prose displays (the display only, never what it proves). Any later feature that lets references reach Lean or the gate must bring holding back first.
  - Slice 2's "disappeared" problem can also fire in slice 3's whole-model steps, when Claude returns an in-review card to the person's files' version. SIMP-2's withdrawal rule should be applied there too, or that dead end stays.
  - Each simplification narrows spec clauses that the user never asked for but never rejected either:
- RV-7 b5;
- TR-12 (c);
- TR-13's "leave the unfrozen ones to Claude";
- the timing of TR-15, RV-9 b2 and ES-9 bullet 3;
- D4-4;
- RF-5 (a), FZ-4 bullet 2 and S12's fix;
- D5-12.

Each needs an AUTOPILOT DECISION entry with its reversal, and the user should see them at the next stop.
  - Latency. In a stage, Submit transform now waits for a build of the working copy with the typed part, on top of the scratch check. That may be slow on large models under the RAM caps.
  - Not covered: S5R2-08 (→ in the # picker), and the remaining UI and build minors. These are plain fixes that the simplifications do not remove.
