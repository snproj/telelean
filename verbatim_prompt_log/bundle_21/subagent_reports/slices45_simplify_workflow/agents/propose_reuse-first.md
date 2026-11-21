# propose:reuse-first

Agent `a52c41a69f43c6ee5` of workflow `wf_ad6807bb-b8a`. Verbatim output (JSON alongside).

- **summary:** The failures cluster around one design choice. Slice 4 writes the person's typed content inside a Claude step (S₀ falls before the typed write), owns that content line by line with a third "typed" item per card, and protects it with a new freeze kind (TransformFreeze) that revalues other reasons. Slice 5's D5-19 set-aside and its detach then sit on top of TransformFreezes. Of the 8 slice-4 findings still open (R3-1..R3-8), all 8 come from these mechanisms. So do the blockers fixed in earlier rounds (S4M-1, S4M-2, R2-1, R2-2, LC-1) and the slice-5 majors (S5R3-01, S5R3-02, S5R2-01, S5R2-02, LC-1).

The seven simplifications below rest on one principle: **what you type is applied at once, as your own edit, and only Claude's part waits.**
- **Outside a session**, the typed part is a board step, using the direct-path planner slice 4 already specifies, with D3-44 standing freezes. A session starts afterwards only if Claude is needed.
- **Inside a session**, the typed part is a stage decision written like Reject or un-reject, judged before any Claude step can run.

Everything Claude then does is an ordinary slice 2/3 step, whose S₀ already contains your edit. Your content is owned by the card's ordinary RV-1 item and protected by slice 3's own freezes. Changing frozen or held content is slice 3's Unfreeze followed by a fresh freeze, and the holders are asked about in slice 3's D3-48 dialog. On top of this:
- typed Lean may use only names that exist;
- in-session windows change no kinds and write no docstring mirrors;
- queued transforms hold only Claude's part, and can be dropped but not edited;
- a suggested premise is reworded in its own Accept instead of in a premise window;
- references to a deleted card show "deleted card", as the board's Delete already does.

Every narrowing is of spec v4.1 or autopilot text, not of the user's own words, with two exceptions, both disclosed:
- out of a session, Exit no longer takes back the typed part, which is offered as one board Undo instead;
- in a session, the typed part no longer waits for Submit review.

Each item lists its reversal.
- **simplifications:**
  - [1]
    - **id:** SIMP-1
    - **title:** Your typed part is applied at once, as your own edit; only Claude's part waits
    - **change:** OUTSIDE A SESSION: the transform window is a board dialog, not a provisional session. Gone: phase `transform`, stage 0, Cancel-is-Exit.
- Submit transform writes everything you typed as ONE board step `apply-transform`, with D3-44 standing freezes on the typed fields: fields, new cards, the trash, kinds, Dependencies, cleared proofs, and today's D-11 rewrites and Delete anyway. This is slice 4 §3.6's planner without the 'end the provisional session first' handoff, and it keeps its staleness check against the current files.
- No Claude part: that step is the whole transform (★D1).
- A Claude part (fuzzy or open fields, instructions, the tick, slots, or a Lean statement left open on a card whose sentence you changed): a session then starts exactly as a Formalize-started one does (consent, preflight, checkBase). Its base commit is the files after that board step. It has session-start freezes on every card outside the window (INITIATING 2, D4-17), and its first queue is the Claude part as one transform step.
- Nothing changed: an empty session, as today's start-session.
- The window says before Submit that the typed edits are applied first, as their own Undo step.

INSIDE A SESSION: Submit transform in a stage is a decision, like Reject or un-reject.
- TR-12 (a) runs, then the scratch (b) against the stage's judged commit.
- The typed part is written into ws/ at once, as one `decision` commit through slice 2's session write queue. It is recorded as one session-stack action; Undo is slice 2's inverse-patch merge, as for un-reject.
- The ordinary judge then judges it. If the write does not build, or a typed piece elaborates to other constants than the scratch gave (D4-23's typed-meaning rule, kept), it is taken back out at once (ws/ returns to its parent), as slice 2 takes back a premise write whose meaning differs in place. The window shows the problem.
- Only the Claude part is queued for Submit review (SIMP-4).

A FIELD YOU CLEAR AND LEAVE TO CLAUDE is not written. It stays as it is, and the transform step opens it, with 'the person cleared this: write it anew' in the turn. A cleared field you keep empty is a typed empty value.

So the typed write never runs inside a Claude step. A transform step's S₀ is always a judged state that already contains it.
    - **eliminates:** - **The typed write inside the step:** S₀ᵗ (`JudgeInput.typedStart`), the `typed` shadow commit, `PersistedStep.typedCommit` and the in-step typed judgement. Findings: R2-2 (blocker), S4M-2 (blocker), S4M-1 (blocker; typed Lean is now valued by a judgement no Claude step shaped, since nothing runs in a stage during decisions, D2-62), R3-1, R3-7, LC-5, IMP-20.
- **Soft units for cleared fields (D4-31):** R3-1's and R3-6's root.
- **The provisional session:** phase `transform`, stage 0, the end-the-session-then-board-action handoff, `claudeStarted`, SealBy `transform`. Findings: D4-2, D4-3, D4-27, LC-4, IMP-25, F1, UI-7, LC-10, LC-17, IMP-18, IMP-19, IMP-24, most of R2-6.
- **Other slice-4 decisions:** D4-5 (a no-Claude transform no longer forces a new stage), D4-40, D4-4's coupling (a failed Claude part never takes your typed part back), D4-42 and S4M-12 (your typed Lean is already written and judged before any take-out).
- **Slice 5:** LC-1 (blocker) and S5R2-02. A typed sentence's references hold from the judge-apply right after its write, through its own freeze's stored map (SIMP-3).
    - **user_loses:** - **Out of a session, with a Claude part:** your typed edits reach your files before the session starts, as their own board Undo step and History entry. Exit no longer takes them back, which narrows EDIT SESSIONS 6 for that part. The Exit dialog offers 'Also undo the edits you typed before this session': one board Undo once the session has ended, refused as today if the files changed since.
- **Out of a session, while drafting:** the session is created at Submit, not when the button is pressed (EDIT SESSIONS 1, INITIATING 2). The board sits behind the modal window, so the only visible difference is that no session bar shows while you draft.
- **In a session:** RV-9/RV-12's 'transforms wait until Submit review' now covers only Claude's part. What you typed shows in the Proposed view at once and is undone with Ctrl+Z until the next seal. Your own words (REVIEW 6) only say that Claude acts at Submit review.
    - **soundness:** - **Your own action:** the typed write is either a board edit outside sessions (★D1) or a stage decision. No Claude step runs while it is written and judged (D2-62), so its typed-meaning check and its freezes' values (SIMP-3) come from a state Claude never touched.
- **Ownership:** every B→W difference still has an owner (SIMP-2), and the backstop re-derives ownership.
- **The base never moves:** inside a session the write goes only to ws/. Outside one, the base is fixed when the session starts, after the board step (message 3: concrete and unchanging).
- **The two Undo stacks never meet:** the board step is on the board stack, the in-session write on the session stack, sealed by the next Claude step. Exit's optional undo is a board Undo made after the session has ended.
- **Decisions are never lost:** the in-session write is a recorded session action (Undo and Redo through the reducer), and the out-of-session one is a board step (UN-2).
    - **reversal:** Put the typed write back at the start of a transform step: slice 4 plan §3.9 steps 1–5 and D4-23 as in slice4-plan.after_ultra.md. Restore phase `transform` and the direct handoff (§3.1, §3.6, D4-2, D4-3). Stored history is unaffected: a decision commit and a board step are both ordinary records.
  - [2]
    - **id:** SIMP-2
    - **title:** No typed items, no typed units: your typed content belongs to the card's ordinary item
    - **change:** - **Ownership as in slices 2–3:** computeItems keeps their rules. Card field and statement changes go to `card:<c>` (Add, Change, Formalize, Delete), arrows to a Delete or arrow items, vocabulary to `vocab:`/`decl:`. RV-1's 'at most two items per card' holds again.
- **One ledger `typed` entry per typed write:** a list of allowances, each stating the person's write by exact value: card × field with its value, new blocks, removed blocks, declarations and arrows, set or removed marks. G5, B.3, B.4, new-axiom and the backstop read it as 'the person wrote exactly this'. It owns nothing and never has to hold; SIMP-3's own freezes do the holding.
- **'Accepted as yours':** at the judge-apply after the write, reconcile accepts as yours (RV-7 b5) every item that meets both conditions:
  - each of its differences from B equals a ledger value;
  - its card has no queued Claude part.
  Its `frozen` and `accepted.fingerprint` come from that judgement, as slice 2's premise write step 4 sets them. This happens in the same recorded action, so Undo takes it back.
- **Every other item the write touched:** it holds Claude's content, or its card has a queued Claude part. It stays in review, or is declined `transform` (SIMP-4), with the display-only marker 'you typed: ‹fields›' read from the ledger.
- **Backstop:** an item accepted as yours must have on F the content key recorded at that judge-apply.
- **Simpler fallback:** no auto-accept at all. You accept your own items; a group Accept takes the non-RV-7 ones.
    - **eliminates:** - **Slice 4 contracts:**
  - the TypedUnit kinds: line, entry, decl, docstring, block, premise;
  - `typed:<c>` items, with their labels and markers;
  - the typed-first, line-by-line ownership in computeItems;
  - unit supersession, absence supersession, and soft and follow units;
  - 'typed units hold' (D4-33);
  - RV-5 rule 3's typed extension and the RV-4 pairing edge;
  - `coverAtAccept`, `coverAtJudge`, `frozen.covers` and D4-44's amendment of slice 3 §3.3;
  - D4-1, D4-22, and D4-29's declaration/docstring ownership split.
- **Findings:** R2-1 (blocker), R2-4, R3-2, R3-3, R3-4, R3-5, R3-6, S4M-3, S4M-4, S4M-5, S4M-13, IMP-15, F16.
  - R3-4: rejecting the card's item restores B's version of the whole card, which is what Reject means (DO-1). Claude's earlier proposal stays viewable in the item's versions.
  - R3-3 and R3-5: no units revive, and no typed draft can disappear.
- **Slice 5:** S5R3-01, since no unit can carry Claude's wording into an item marked yours. The `added` rule's allowance reads the ledger's typed values instead of live units.
    - **user_loses:** - A card no longer shows a separate '· you typed it' item.
- On a card where you typed some fields and Claude wrote others, one Accept or Reject covers the whole card, as RV-1 states. You cannot reject only your typed part of such a card: use Undo before the next seal, or transform it again.
- RV-7's 'content you typed counts as accepted' (spec text, not your words) covers only items that are wholly yours. Under the fallback it covers nothing, which costs one more Accept per own item.
    - **soundness:** - **Nothing of Claude's is accepted without your Accept:** the 'yours' predicate is evaluated once, right after your own write, and only on items that hold no Claude content. The backstop re-checks it by content key.
- **Nothing changes after:** such an item is frozen by its Accept (RV-4), so no later step can change it.
- **Ownership** stays total and disjoint (slice 2/3's computeItems).
- **No hidden arrows:** your arrow writes are B.3 allowances checked by exact value. Claude's arrows remain ledger arrows with their own items.
- **Typed content stays frozen** through SIMP-3's own freezes.
    - **reversal:** Reinstate `typed:<c>` items, TypedUnit and typed-first ownership: slice 4 §2.2, §3.10, D4-1, D4-33, D4-44. The ledger `typed` entry is a subset of what those need, so stored sessions remain readable.
  - [3]
    - **id:** SIMP-3
    - **title:** Typing is slice 3's Unfreeze followed by an own freeze; affected holders are asked about in slice 3's dialog
    - **change:** There is no TransformFreeze, no `transform` reason and no revalue.

For each key the typed write changes, the transform decision's FreezeDelta (slice 3's, recorded and undone with the decision) does two things:
1. **Unfreeze for the session**, as slice 3's Unfreeze does:
   - standing and foreign reasons go into `standingCleared`;
   - own reasons are removed;
   - session-start reasons go into `startCleared`;
   - an accepted item covering the key returns to review, listed in the RV-5 confirmation the decision already shows.
2. **Own freeze on each field you typed** (`yours`, flagged `typed` for the label 'frozen: you typed it'), valued `{ from: 'state' }` by the judge-apply that follows the write.
   - That is the one pending moment. While judging, no step, freeze action or Submit runs (slice 2/3 gates), so no check ever reads it pending.
   - If that judgement has no keys (a failed probe), the decision is taken back (SIMP-1).

**Follow-on edits** (a trashed card's arrows, a cleared proof) freeze nothing. They belong to your Delete or Change item, accepted as yours, and RV-4's re-add refusal covers them.

**Holders:** before the write, slice 3's `frozenChangesOf` (D3-48) lists, from the planned changes:
- frozen Lean that relies on a declaration you retype;
- slice 5's frozen sentences and Whys that refer to a field you change or a card you trash.

The dialog offers [Freeze them again at the new version] (the default), [Unfreeze them and apply] and [Cancel]. 'Again' means Unfreeze plus an own freeze valued at the same judge-apply. Its stored held map (slice 5's holdingMap) then holds what their words refer to now.

**Outside a session:** D3-44's standing freezes in the board step (already D4-16).

**Slice 5's holding** keeps exactly slice 3's two sources:
- heldFields over B, for entries expected at B;
- stored maps, for own freezes and accepted items.

**One predicate for 'Claude may change this key':** built from the effective table, every held map, heldFields, otherSubjectRefHolds and the other-subject rule. It feeds:
- the window's open/fuzzy problems;
- the transform step's `open` set;
- the turn's HELD list.
    - **eliminates:** - **Slice 4:**
  - TransformFreeze, `SessionFreezes.transform` and the `transform` FreezeReason;
  - pending and valued TransformFreeze values, and their valuation points (D4-23's valuation, LC-16);
  - newest-TransformFreeze-per-key (LC-3);
  - FreezeDelta's TransformFreeze arrays (LC-2, IMP-6);
  - follow-on TransformFreezes (D4-34, S4M-8);
  - typed-then-open (F2, IMP-21);
  - the decline dialog's TransformFreeze cases (S4M-13, IMP-15).
- **Slice 5:** D5-19 entirely: the set-aside, the walk stop, `FreezeTable.transforms`, `pendingHolds`, `transformHolds` and the binding rule. Findings S5R3-02 (major), S5R2-01 (major), S5R2-02 (major), LC-1 (blocker), S5-SOUND-03, IMP-2/S5-SOUND-02 (`revalued.held`) and FID5-2.
- **The single predicate** replaces three enumerations of held keys: S5R3-03, S5R3-05 and checks-S5-SOUND-09.
    - **user_loses:** - **FZ-3 2e still holds, but you see it:** 'the frozen value becomes your version' is carried out as an Unfreeze and a fresh freeze. A standing freeze on a field you retyped reads 'frozen: you typed it' for the rest of the session. After Apply it is your standing freeze again, since standing records name targets, not values.
- **One more click:** frozen cards that rely on or refer to what you change no longer take your new value silently. A dialog asks you to re-freeze them at the new version (the default) or unfreeze them for the session.
- **Stored maps stay flat:** what a map reached through a field you later change stays held until that map goes. This was D5-19's residual and becomes the only behaviour, as in slice 3.
    - **soundness:** - **Only your actions remove reasons (FZ-6),** and the affected holders are named before the write.
- **Every new expectation** is a value of a judged state no Claude step shaped (SIMP-1).
- **FZ-8** still restores the standing state at the session's end.
- **Held content never changes silently:** its holders are either re-frozen at the new version or unfrozen by your explicit choice.
- **Slice 3's invariant is restored:** one table, one check, nothing incremental.
    - **reversal:** Reinstate TransformFreeze, the `transform` reason and the revalue: slice 4 §2.3, §3.11, D4-23, D4-34; slice 5 §2.5, §3.6, D5-19. Drop the holder rows from the transform's D3-48 dialog.
  - [4]
    - **id:** SIMP-4
    - **title:** The queue holds only Claude's part: no Edit…, no re-base, no rework steps
    - **change:** - **What a queued transform holds:** its cards, open and fuzzy fields, slots, instructions, the 'Claude may add cards' tick and its analysis. It never holds typed values, which are already written (SIMP-1), and has no `original` or `provenance`.
- **While queued:** an item whose card has a queued Claude part is declined `transform`, Shaky-like, through slice 2's Shaky machinery: its content stays in ws/, it does not block Submit, and the transform step reworks it.
- **Drop, never edit:** a queued transform can be dropped (one session step; its items return to review) but not edited. Edit… goes: to change one, drop it and open a new window, which copies the current state with your typed fields shown frozen.
- **One window per card:** a card with a queued Claude part opens in no other window ('drop that transform first').
- **At Submit review,** a queued part is stale, and refused with [Drop], only if:
  - one of its cards is gone;
  - one of its items changed status;
  - one of its open or fuzzy keys is now frozen or held (SIMP-3's predicate).
- **Cascades:** a decision whose cascade reaches a declined-transform item asks to drop that part in the same action (D4-43, kept).
- **Shaky on an item a transform step made:** it queues a new transform on that card, with every field open and the Shaky note as instructions. DO-3's identical-set check stays in that step. There is no separate rework-step kind.
    - **eliminates:** - **Re-basing:** Edit…, `rebaseDraft`, provenance carried by the re-base and QueuedTransform's `original`. Findings: LC-1 (blocker), LC-14, R2-9, D4-30's copied-value staleness, LC-7, IMP-11 (no stored scratch to re-analyse).
- **Source bookkeeping:** most of D4-8, D4-43, LC-6 and LC-13.
- **Rework steps:** D4-24 and S4M-14.
- **Undo routing:** D4-41's limit for session steps made before a window opened has fewer cases.
    - **user_loses:** - You cannot reopen a queued transform to adjust it. Drop it and start again; what you typed is kept, since it is already written.
- Shaky on something a transform produced is carried out as a transform with all its fields open, and keeps D4-12's content-only rule.
    - **soundness:** - **Nothing of yours is lost:** typed parts are written before anything is queued, and Drop and Undo restore statuses.
- **Stale parts are refused, never merged** (ES-7's spirit, D4-30's rule).
- **Declined-transform items follow slice 2's Shaky rules:** their content stays, and they cannot be accepted while declined.
- **DO-3's not-identical check** still applies to reworks.
    - **reversal:** Restore Edit… with `rebaseDraft` and provenance (slice 4 §3.7, D4-30, LC-1's fix) and rework steps (D4-24, §3.9 step 9).
  - [5]
    - **id:** SIMP-5
    - **title:** Narrow the typed write: known names only, no kind changes and no docstring mirrors inside a session
    - **change:** - **Known names only:**
  - TR-12 (b)'s scratch elaborates against the state the window was opened on: B outside a session, the stage's judged commit inside one.
  - Every name a typed statement or declaration uses must exist there, or be declared by a typed vocabulary card of the same draft, written first in the scratch's order.
  - An unknown name is a problem: 'Define ‹name› first (add it as a vocabulary card here and type its declaration), or leave this statement to Claude (clear it and say what you mean in the instructions).'
  - So every typed piece has `consts`, and the judge after the write confirms its meaning.
- **No kind changes inside a session:** in a stage window, Kind and an axiom's Dependencies are locked: 'Change kinds on the board, outside a session.' Outside a session the window keeps TR-11, with board semantics and D-11.
- **No docstring mirrors inside a session:** the typed write never writes a D-9 mirror. Slice 5's D5-7 hook re-mirrors stale mirrors at the next board change, extended to Apply's board step. Outside a session, the board's existing edit-node D-9 follow applies.
    - **eliminates:** - **'Claude must define':** `mustDefine` as a needs-Claude reason, D4-7, D4-32 (typed-unconfirmed items with their own Accept), D4-6's session names 'checked when carried out', most of UI-8's outcome-changed dialog, S4M-9, IMP-11's mustDefine part and R3-7's need for typed facts. Slice 5: S5R2-03 and D5-21's MUST DEFINE clause.
- **In-session kind changes:** R3-3's kind scenario, the B.4 and G5 typed `type:` allowances in sessions, D4-36 in sessions and D4-13's refusal.
- **In-session mirrors:** S4M-7, R2-5, R3-2, D4-29's mirror rules, the `docstring` unit, and slice 5's mirrorText in the typed write.
    - **user_loses:** - TR-12 (c) goes ('names that don't exist yet are allowed, and listed as Claude must define'; spec text, not your words). Type the definition too, or leave the statement to Claude.
- No kind changes during a session: make them before or after. Outside a session, the window and the board still change kinds.
- During a session, a retyped sentence's Lean docstring keeps the old wording until Apply. This is cosmetic; slice 5 already accepts it for references (D5-7).
    - **soundness:** - **Stricter checking:** every typed piece is fully elaborated, and its meaning confirmed, before anything relies on it.
- **No kind change inside sessions:** no belief change of that kind happens there at all, so CF-4 and S19 hold trivially.
- **Mirrors carry no meaning:** a docstring has no Lean meaning, and leaving it unchanged changes no frozen or held value.
    - **reversal:** Restore `mustDefine` (slice 4 §3.3 (c), D4-6, D4-7, D4-32). Unlock Kind in stage windows (§3.4, D4-36). Restore the mirror follow-on (§3.5 step 3, D4-29).
  - [6]
    - **id:** SIMP-6
    - **title:** A suggested premise is reworded in its own Accept, not in a transform window
    - **change:** - **No premise window:** drop mode `premise`, the `premise:<item>` draft key, the `premise` unit and the no-Claude premise step.
- **Reword in the Accept:** the Add premise Accept dialog already asks how you hold the premise and takes your Why (slice 2 §3.8). It now also lets you reword the premise's sentence. telelean writes the card in your wording (no `worded_by: agent`) in the existing premise write, and the ledger `premise` entry records both texts, as it records the Why for slice 5.
- **Its Lean statement is not edited here.** Decline it instead (Reject, or Shaky with a note saying what it should state), or change it after the session.
- **Built checks unchanged:** prose does not affect the gap check, so the meaning-in-place check and the completion stay as built.
    - **eliminates:** - **Slice 4:** D4-14's window and step, the premise-window texts and validator rules. Findings: IMP-8, R2-10, R3-8 (what you typed can no longer be overwritten by a rework, since it is accepted and frozen by RV-4), LC-9, UI-18.
- **Slice 5:** the S5-SOUND-05 / IMP-17 interplay. The Accept's sentence is validated like its Why.
    - **user_loses:** - You can no longer retype a suggested premise's Lean statement before accepting it. TRANSFORM 9 for 'Claude suggests' keeps the sentence and Why; the card is fully transformable after the session.
- A premise no longer appears among queued transforms.
    - **soundness:** - **The premise remains a belief item,** with its own Accept and 'how you hold it'.
- **Claude's Lean is never relabelled as yours.**
- **Checks unchanged:** the gap check, meaning-in-place check and completion work as built, because the Lean is unchanged.
- **Your wording is your own text,** given in your own Accept.
    - **reversal:** Restore the premise window (slice 4 §3.7's premise bullet, D4-14, R2-10). Or add a Lean field to the Accept dialog, with a fresh scratch gap check that reuses Claude's checked gap proof.
  - [7]
    - **id:** SIMP-7
    - **title:** References to a card you delete show 'deleted card'; no detach
    - **change:** - **No detach:** drop slice 5's detach (D5-12's follow-on edit). A transform that trashes a referenced card leaves the referrers' tokens as written. They show 'deleted card' (RF-2 c), exactly as the board's Delete already does.
- **The window warns:** it reuses the Delete dialog's section 'Referred to by (their references will show “deleted card”): …', with frozen referrers marked. It offers 'Delete it too', or taking the referrer into the window to reword it.
- **Frozen referrers:** a frozen referrer's hold on the trashed card changes, so SIMP-3's dialog asks whether to re-freeze it at the new version (holding the card as absent, D5-21) or unfreeze it.
- **Tokens to trashed cards:** a token in a window draft that names a card trashed in the same window, or by a queued transform, is refused whatever `before` holds.
    - **eliminates:** - **Slice 5:** `detachRefs` in transforms, detach units and their follow-on TransformFreezes, `planTypedWrite`'s `base`, the 'card Claude made in this session' problem and the end confirmation's follow-on row.
- **Findings:** S5R3-01, S5R3-04, S5R3-05, S5R2-07, S5R2-01's detach half, LC-10, FID5-6, and FID5-13 (the transform and the board's Delete now agree).
    - **user_loses:** References to a card you delete in a transform no longer turn into its words automatically. They read 'deleted card', with TL125, until you reword the referring card, in the same window or later.
    - **soundness:** - **telelean never writes words into your text,** so Claude's wording cannot become yours (S5R3-01).
- **A deleted target stays held as absent (D5-21),** and card ids are never reused (I1), so a dangling card token never gains a new target.
- **Frozen referrers** are named before the write.
- **Nothing is assumed:** a dangling reference is shown as one.
    - **reversal:** Restore D5-12's detach as a follow-on edit of the typed write (slice 5 §3.7, §2.6's detach bullet), owned by the Delete item rather than a typed item.
- **residual_risks:**
  - **SIMP-1 while results are hidden:** a typed decision in a stage starts a judge that can change hidden Results (RV-11). Slice 2 handles this as for Reject (D2-64). D4-19's locks on targets' Kind, Dependencies and Proof must stay, so that no typed value lands on a masked field.
  - **SIMP-1 when the session cannot start:** outside a session, if the session fails to start after the board step (consent declined, checkBase failure), the typed edits stay applied. The window must say so before Submit, and the board offers Undo.
  - **SIMP-1 and B.3:** with cleared fields no longer written, Dependencies left to Claude keep their arrows and are opened with removal allowed. Removals then fall under slice 3's remove_arrow rules (no arrow a proof uses). Removing a used source becomes: Claude marks the proof broken first.
  - **SIMP-2's predicate:** the per-field comparison must ignore slice 3's id write-backs (the ids commit) and normalise's pins. Otherwise wholly typed items would not be recognised as yours. The fallback (no auto-accept) avoids this risk entirely.
  - **Slice 3 amendments:** slice 3 is frozen, yet SIMP-3 adds two things to its structures:
- an own freeze valued at the judge-apply after a decision write;
- the transform decision's FreezeDelta and holder rows in D3-48's dialog.
Both are small, but they amend slice 3's plan, just as SIMP-2 removes slice 4's D4-44 amendment of slice 3 §3.3.
  - **Lean jobs in a stage:** the in-session typed decision needs the scratch (a Lean job) before its write. The write queue and the `judging` gate must cover it, so that no freeze action or decision interleaves between the scratch and the write.
  - **Mixed cards:** on a card where you typed one field and Claude wrote another, the single item's RV-7 class combines both (a typed Lean statement makes it c1, needing its own Accept). That is more own Accepts than slice 4's typed items needed.
  - **Not simplified here, still intricate:**
- TR-13's in-session dependents (D4-21, D4-39's may-break walk);
- the session-target locks (D4-19);
- the modal window with its own Undo timeline (D4-18, D4-41);
- slice 5's id registry and F1;
- the picker's →/← handling (S5R2-08, still open).
A later pass could drop D4-39 by giving transform steps slice 3's whole-model `mark_proof_broken` rules.
  - **Not re-reviewed:** these proposals have not been through a critic round. Each removes mechanisms and reuses slice 2/3 parts that were already reviewed. The new joints still need one focused review before the plans are rewritten:
- the decision write with a pre-write scratch;
- the ledger `typed` allowances read by G5, B.3, B.4, new-axiom and the backstop;
- the auto-accept-as-yours predicate.
