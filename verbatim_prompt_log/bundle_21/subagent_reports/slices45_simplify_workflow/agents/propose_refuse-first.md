# propose:refuse-first

Agent `aca47332fb3fb4b62` of workflow `wf_ad6807bb-b8a`. Verbatim output (JSON alongside).

- **summary:** The open findings of both plans come from a small set of mechanisms that each fix round made more intricate:
- telelean's typed write lands on top of Claude's proposals. That needs per-field Claude provenance in the window and line-by-line ownership of one card.
- What telelean writes for you is recorded as typed units (line, entry, decl, docstring, block, with soft and follow flags and supersession rules). One typed item per card is reused across transforms.
- A separate freeze kind, TransformFreeze, revalues other reasons and has follow-on variants. Slice 5's D5-19 builds a set-aside and walk-stop on top of it.
- telelean makes follow-on edits outside the window: other cards' arrows, D-9 mirrors, and slice 5's detaches.
- A transform step has two baselines: S₀ before the typed write, and S₀ᵗ with a list of exceptions.
- Smaller paths: typed Lean that names words nobody has defined yet ("Claude must define"), and a premise step at Submit review.

Following AP-24's precedent, this proposes seven coarse rules that remove these mechanisms instead of patching them:
- **S45-1.** A transform starts from your version (your files plus your own earlier typed changes). Claude's proposals on the window's cards are set aside first.
- **S45-2.** What you typed is owned per CF-2 field, never per line. There is one typed item per transform and card. Clearing a field asks Claude to rewrite it. Mirrors are never rewritten inside a session.
- **S45-3.** Typing makes an ordinary own freeze. Every other freeze of that field, held ones included, also accepts your newest live typed value, so nothing is revalued.
- **S45-4.** A transform changes only the cards in its window. There are no follow-on edits and no detach, and nothing another subject relies on changes in a session.
- **S45-5.** Typed Lean uses only names in your files or the same window.
- **S45-6.** The judged typed commit is the step's only S₀. There are no rework steps.
- **S45-7.** A suggested premise is edited in place, at once.

Together they remove:
- every open major: R3-1 to R3-5, S5R3-01, S5R3-02;
- every open minor except S5R2-08 (a UI key bug);
- the root mechanisms behind round 2's blockers R2-1 and R2-2, and round 1's LC-1, S4M-2 and slice 5's LC-1;
- TransformFreeze, typed units, follow-on freezes, detach, D5-19, "Claude must define", S₀ᵗ, rework steps and the premise step.

Dependencies between them:
- S45-3 relies on S45-1 (no accepted Claude content under a field you typed) and on S45-4 (nothing changes without your typing).
- S45-2 and S45-6 back each other up. Adopt S45-1 to S45-4 and S45-6 as one package. S45-5 and S45-7 stand alone.

Kept as they are: D4-44 (an Accept freezes what you accepted), D4-32 (own Accept for unconfirmed typed Lean), new-axiom's binding allowance, D4-19's target locks, D4-21's rule for frozen Lean dependents, refExceptions, and the `added`/`revived` reference rules.

What you lose, in short:
- decline windows are no longer pre-filled with Claude's proposal (you copy per field instead);
- no "Claude must define";
- no automatic detach of references;
- no Shaky on fills made by a transform;
- clearing a field no longer guarantees it ends up empty.

Each loss is logged below with how to reverse it.
- **simplifications:**
  - [1]
    - **id:** S45-1
    - **title:** A transform starts from your version and sets Claude's proposals on its cards aside
    - **change:** **The window copies your version.** In a review stage, every transform window works the same way: Transform cards…, Decline → Transform for one item or a group, and Ask me instead.
- Each card is copied as your version: your files (B) plus your own live typed changes from earlier transforms in this session.
- It never copies Claude's proposal into a field. D4-9's open "Claude's proposal" fields go, and so does TR-15's per-field Claude provenance.
- Where Claude has a proposal for a field, it is shown beside the field, read-only, with [Copy into the draft]. A copied value counts as typed by you.
- One exception keeps ★D2: a copied Lean value that RV-7 would class as belief or "changes what is proved" makes its typed item take its own Accept, through D4-32's path.
- A Claude-added card in the window becomes your own new card.

**Queueing sets Claude's proposals aside.** Queueing a transform declines, with option `transform`, every Claude item that owns content of a card in the window:
- its Add, Formalize, Change or Delete item;
- a vocabulary card's items;
- Claude's arrow items into it.

It never declines a Result or what belongs to one; D4-19's locks on a target's Kind, Dependencies and Proof stay. Before it does:
- accepted items go through RV-5's confirmation;
- slice 3's pre-write check (D3-48) asks you to unfreeze any frozen part of them.

While the transform is queued:
- the items keep their content, as D4-8 and D4-43 already say;
- a freeze of content they own is refused ("It is part of the queued transform “‹label›”: drop it first."), so D3-49's keep set never holds one.

At Submit review:
- the take-out reverts them to B right before the transform's step, so telelean's write lands only on your version;
- once the transform is carried out they are withdrawn as replaced-by-transform, listed, with their content viewable;
- no DO-1 ban applies: for fields you left to it, Claude may propose the same content again in that step.

An unchanged window still changes nothing (TR-1, TR-9).
    - **eliminates:** **Open:** R3-4 (a Reject of your typed line deletes Claude's content beneath it). With S45-4, also the Claude-worded referrer of S5R3-01.

**Earlier rounds:**
- LC-1 (blocker: Edit… re-based Claude's copied values into yours);
- S4M-4 (your typed line inside Claude's Add, with no dependency on it);
- R2-1 scenario (b), and R2-2's touched items;
- S4M-5's cascade for accepted items under your typed fields;
- LC-7 (masked copies and their staleness).

**Mechanisms that go:**
- the window's Claude provenance and `masked`;
- D4-9's open "Claude's proposal" fields;
- `touched`;
- D4-30's "copied value changed" staleness, since your version changes only by your own actions;
- the typed write on top of Claude's content.
    - **user_loses:** - **Decline windows start from your version.** In a review stage, the window no longer opens pre-filled with Claude's proposal. TRANSFORM 1's "exact copy" and DECLINE OPTIONS 2's "Adjust this card" now start from your version, with Claude's text beside each field.
- **Keeping Claude's wording takes a step.** To keep Claude's wording for a field, you click Copy (a copied belief Lean value then needs its own Accept). Or you leave the field to Claude, which proposes it again, possibly worded differently.
- **Accepted proposals can come back for review.** Transforming a card also takes its accepted Claude proposals out of the session, after a confirmation, and Claude proposes them again. You may review the same content twice.
- **Claude's added cards get a new id.** A Claude-added card that you transform becomes your own new card, with a new id.
    - **soundness:** - **Nothing of Claude's becomes yours unseen.** Untouched Claude content never enters a window. A Copy is your explicit act, and a copied belief or proof-changing Lean value keeps its own Accept (★D2, RV-7). Fields left to Claude come back as new items that need your Accept.
- **Frozen and held content.** The set-aside is a decision, so RV-5's confirmation and slice 3's D3-48 check run first. Freezing a set-aside item's content is refused while it is queued, so Submit's keep set (D3-49) never leaves Claude content under your write.
- **No hidden arrows.** Claude's arrows into the window's cards are declined under DO-0, so Results that used them are to be redone. B.2 and B.3 are unchanged.
- **The base never moves.** The copy reads B and telelean's ledger, and writes nothing.
- **Decisions are never lost.** Queueing is one recorded session step (Undo works until Submit seals). Set-aside items stay listed with their content. Drop keeps D4-43's rules.
    - **reversal:** - Restore D4-9's starting states in `draftFromModel`: copy the working copy, with Claude's values open and marked.
- Restore TR-15's per-field provenance, with Edit…'s re-base (LC-1's fix), `touched`, and the queue end's replaced-by-transform rule.
- Drop the set-aside from `queue-transform` and from Submit's take-out.
  - [2]
    - **id:** S45-2
    - **title:** Ownership by field, one typed item per transform and card
    - **change:** **What telelean records.** It records what you typed per CF-2 field, with its exact value: sentence, Why, stance, source, kind, Lean statement, Dependencies, a cleared proof, a vocabulary declaration, a gloss. It also records:
- a new card's existence (its `id:`, `type:` and `asserted:` lines);
- a trashed card's absence (its block, bound declarations and arrows out).

A field's value is slice 3's address value. A Lean statement is the abbrev with its docstring, its pin and an axiom's `.holds`, taken together. Dependencies are per-arrow entries plus the mark, matching slice 2's arrow items.

**Typed items.** There is one typed item per transform and card (`typed:<transform>:<card>`), never reused by a later transform.
- It owns a field exactly while the working copy holds the value telelean wrote.
- A field that no longer matches leaves it: a later transform of yours, or Claude after you unfroze the field.
- An item that owns nothing is withdrawn and listed "changed later". This replaces slice 2's "disappeared" problem.
- Its Reject restores B's version of exactly its fields, and nothing of it ever comes back by itself.

**Clearing a filled field** means "Claude rewrites this":
- telelean writes nothing for it, and the old value stays until Claude's step replaces it, as Claude's item;
- the stage report says when Claude did not;
- to empty a field, you choose "kept empty" (typed empty, and frozen).

**Mirrors.** telelean never rewrites a D-9 docstring mirror inside a session.
- A statement you type carries the mirror of your sentence as part of its value.
- Other mirrors stay as written until the first board change after the session, through slice 5's re-mirror.
    - **eliminates:** **Open:** R3-1 (together with S45-6), R3-2, R3-3, R3-5, R3-6.

**Earlier rounds:** R2-4, R2-5 (and D4-29's split of declaration and docstring), S4M-3, S4M-7.

**Mechanisms that go:**
- TypedUnit's line, entry, decl, docstring and block kinds, with `soft` and `follow`;
- supersession by identity, and absence superseding earlier units;
- soft writes of cleared fields (D4-31's soft half);
- the per-card typed item reused across transforms;
- the "disappeared" special case for typed items.
    - **user_loses:** - **A clear is not guaranteed empty.** Clearing an existing field no longer guarantees it ends up empty. If Claude finds nothing better, the old value stays and the report says so; choose "kept empty" when you want it gone.
- **Rejects are per transform and card.** Your typed change is rejected per transform and card, not field by field. To put back one field, transform again.
- **No step back to an earlier transform.** Rejecting a later transform of a field restores your files' value, not your earlier transform's.
- **Stale docstrings.** In the Lean files, a statement's docstring may show the old sentence until your first board edit after the session.
    - **soundness:** - **Ownership stays mechanical.** It still comes only from telelean's ledger, out of Claude's reach, and only on exact values. A value Claude writes is never yours unless it is exactly what you typed.
- **Everything else is Claude's.** Everything else on the card is Claude's item and needs your Accept. The backstop re-derives ownership from B, F and the live ledger, field by field.
- **Arrows.** They keep slice 2's per-arrow items, so B.2 and B.3 are unchanged.
- **No content is "yours unless Claude changes it"**, so no unowned soft content exists.
- **Stale mirrors break nothing.** A stale mirror is unchanged text inside a field, so no freeze or check breaks; docstrings do not change meaning in Lean.
- **The base never moves.**
- **Decisions are never lost.** A Reject is final for exactly its own fields and is recorded; Undo and un-reject restore it, so nothing is silently revived.
    - **reversal:** Return to slice 4's round-2 design:
- the units of §2.2 (line, entry, decl, docstring, block and premise, with soft, follow and supersession);
- per-card typed items;
- soft writes for cleared fields (D4-31);
- mirror updates (D4-29, §3.5 step 3).
  - [3]
    - **id:** S45-3
    - **title:** Your typed value satisfies every freeze; typing is an ordinary own freeze
    - **change:** **Typing makes an own freeze.** A field you type gets slice 3's own freeze (`yours`, labelled "frozen: you typed it"):
- it is valued at the typed judgement, before Claude's turn: text, meaningKey, and a held map from slice 5's `holdingMap`;
- a later typed write of the same field replaces it;
- your Unfreeze, or the Reject of its typed item, removes it, recorded in that action's FreezeDelta like any own freeze.

What goes:
- TransformFreeze, the `transform` reason kind and follow-on freezes;
- a typed item's Accept no longer covers anything, since its fields are already frozen. This replaces D4-44's rule for typed items; D4-44 stays for Claude's items.

**One rule replaces every revalue.** An expectation on a field is met by its own value, or by your newest live typed value for that field (from a typed item neither rejected nor withdrawn). This covers:
- standing, foreign and session-start expectations;
- an older own freeze;
- every held expectation (FZ-4, RF-5).

An accepted item's own content key is not widened. Accepted items under your change go back to review first, through S45-1 and slice 4's Submit cascade.

**The held walk** through a sentence or Why follows the references in B's words and in your live typed words.
    - **eliminates:** **Open:** S5R3-02.

**Earlier rounds, slice 4:** LC-2, LC-3, S4M-8, S4M-13, IMP-6, IMP-15, and R2-1's `follow` flag. LC-16's separate pending path is folded into S45-6's single rule.

**Earlier rounds, slice 5:** S5R2-01, S5R2-02, S5-SOUND-02, S5-SOUND-03, FID5-2, LC-1 (blocker: a reference you type holds nothing in its own step), LC-2, IMP-2.

**Mechanisms that go:**
- TransformFreeze: pending and valued, typed and follow-on, newest per key, its own rollback;
- §3.11's revalue and D4-34's follow-on revalue;
- D5-19's set-aside, walk stop and binding condition;
- `FreezeTable.transforms`, `pendingHolds` and `transformHolds`;
- D5-19's residual: unfreezing your typed field no longer leaves its holders failing.
    - **user_loses:** Almost nothing you would notice.
- **Referring cards follow your words.** A frozen card that refers to a field you retyped reads your new words without asking. This is what D5-19 already does, and the window warns you.
- **Old references stay held.** What your old words referred to stays held until the session ends or you unfreeze the referring card. So Claude may ask you to unfreeze it more often.
- **One label instead of two.** FZ-7's reason "you filled it in a transform" shows as one own freeze, "frozen: you typed it", with its keep tick at Apply.
    - **soundness:** - **Claude still cannot change what you typed.** Your own freeze holds its text and meaning from before Claude's turn (TR-5, FZ-3, FZ-4).
- **The widening adds only one value.** Each widened expectation accepts exactly one extra value: your newest live typed value. Only telelean's ledger can supply it, and Claude cannot produce it. So any change by Claude is still refused, while your own change never needs a revalue (FZ-1, FZ-3 bullet 2e).
- **Held content.** References in your new words are held, by your own freeze's map and by the widened walk. References your old words made stay held: an over-hold that fails closed.
- **Frozen Lean dependents are unchanged.** A frozen card whose own Lean uses a declaration you change still differs in its own value, so D4-21 still asks you to unfreeze or delete it. The widening only spares holders whose own words do not change.
- **Accepted items keep their meaning.** They are never satisfied by a typed value, so RV-4 and RV-5 hold.
- **The base never moves.**
- **Decisions are never lost.** Removing your freeze is a recorded freeze change, and Undo restores it. After a Reject, every expectation goes back to its own value, which B's restored version meets.
    - **reversal:** - Restore TransformFreeze and §3.11's revalue (slice-4 plan §2.3, D4-23's freeze part, D4-34).
- Restore D5-19, with `pendingHolds`, `transformHolds` and the walk stop (slice-5 plan §2.5, §3.6).
- Drop the "or your typed value" alternative from slice 3's comparisons.
  - [4]
    - **id:** S45-4
    - **title:** A transform changes only the cards in its window: no follow-on edits, no detach, nothing another subject relies on
    - **change:** **telelean writes nothing outside the window's cards.**
- The arrows out of a trashed card leave as part of its own typed Delete, just as Claude's Delete item already owns them in slice 3.
- If such an arrow is frozen, or enters Dependencies that are frozen or held by a reference, the window shows a problem: "“‹Y›”'s Dependencies are frozen (or held) and include the arrow from “‹X›”: add “‹Y›” to this transform, or unfreeze them." Its [Add “‹Y›”] puts Y in the window, with that arrow removed as your typed change.
- Mirrors are covered by S45-2. D-11 rewrites stay out of sessions (D4-13).

**No detach; D5-12 goes.** In a session, a card or vocabulary item that any sentence or Why of the subject refers to can be trashed only when every referrer is either:
- trashed too, or
- in the same window, with your draft no longer holding that token.

Otherwise the window shows: "“‹A›” refers to “‹c›”: take the reference out of “‹A›” in this transform [Add “‹A›”], or delete “‹A›” too."
- A window token that names a card in this window's trash, or in a queued transform's, is refused, whatever `before` holds.
- Changing (not trashing) a referenced field stays allowed, with the warning "Refers to it, and will read: ‹text›". Holders then follow S45-3.

**Other subjects.** Nothing another subject relies on changes in a session, whether by Claude or by your transform. That covers what its Lean uses (D3-41) and what its sentences and Whys reference (D5-10). The window locks such fields ("“‹A›” of ‹S› relies on it: change it outside a session."), so they are never open, fuzzy or left to Claude.

**Outside a session nothing changes.** On the direct path and with the board's Delete, references to a deleted card show "deleted card", as today.
    - **eliminates:** **Open:** S5R3-01, S5R3-03, S5R3-04, S5R3-05, and S5R3-02's trashed-source path.

**Earlier rounds, slice 5:** S5R2-07, the `planTypedWrite.base` part of S5R2-06, LC-10, LC-11, S5-SOUND-11, UI-4.

**Earlier rounds, slice 4:** S4M-8, and the split rule of IMP-22 and S4M-16.

**Mechanisms that go:**
- follow-on keys and follow-on freezes (D4-34);
- `detachRefs` in the typed write, and detach units owned by the trashed card's typed item;
- choosing words from B for a target Claude reworded;
- the special problem for "a card Claude made in this session";
- D5-10's exemption for your own typed change;
- the widened window scope for detached sentences.
    - **user_loses:** - **Trashing a referenced card takes one more step.** In a session, trashing a card that other cards' sentences refer to means adding each referring card to the window and taking the reference out yourself, or deleting it too. telelean no longer rewrites the reference into words for you.
- **Frozen receiving Dependencies.** Trashing a card whose arrows enter frozen Dependencies adds that card to the window (one click), or needs an Unfreeze.
- **Other subjects' references.** In a session, you cannot change vocabulary that another subject's sentences refer to. Do it outside a session.
    - **soundness:** - **Everything changed is visible and yours.** Every change telelean writes is a field of a card you can see in the window. It is owned by your typed item and frozen by your own freeze (S45-3). So no field changes without a reason of its own, which is the gap S5R3-02 exploited.
- **No reference is left dangling after a session**, so nothing is left broken (TR-13). A frozen referrer's words change only when you type them.
- **Arrows.** Arrows out of a trashed card go with the card, as slice 3's Delete items already do. Frozen or held Dependencies change only through your own typed change, which holders accept (S45-3).
- **Other subjects** keep everything they rely on: D3-41, with no exceptions.
- **The base never moves, and decisions are unaffected.**
    - **reversal:** - Restore D5-12: the detach as a follow-on of the typed write, with its choice of words and its problem for cards Claude made.
- Restore D4-34's follow-on edits with follow-on freezes.
- Restore D5-10's exemption for your own typed change.
  - [5]
    - **id:** S45-5
    - **title:** Typed Lean uses only names your files or the same window define
    - **change:** **What your typed Lean may use.**
- A Lean statement or vocabulary declaration you type may use only names in your files (B) and names that the same window's typed vocabulary declares.
- A typed Dependencies chip may name only cards in your files and the window's new cards.
- Anything else is a window problem: "‹name› is not in your files: declare it in this transform (a new vocabulary card), or leave this statement to Claude with Instructions."

**What goes:**
- TR-12 (c)'s "Claude must define";
- D4-6's session names (Claude's proposals, in review or accepted), and the scratch's handling of them.

The scratch check (TR-12 b) then always elaborates every typed piece completely.

**Consequence for typed items.** A typed item now depends on no Claude item, so it is accepted as yours when written. Its own Accept is needed only for D4-32's no-facts case and for S45-1's copied belief. With that:
- the queue end's fixpoint goes, and so do the "typed-by-you, waiting" state and the transform turn's MUST DEFINE section;
- without "Claude may add cards", the `new-definition` rule allows only plain vocabulary.
    - **eliminates:** **Earlier rounds, slice 4:**
- S4M-9;
- S4M-12 (D4-42's staleness for typed Lean that names reworked content);
- S4M-4's typed arrows into Claude's cards;
- the unknown-name half of S4M-1 and D4-32.

**Earlier rounds, slice 5:** S5R2-03 (a MUST DEFINE name that a dangling reference holds).

**Mechanisms that go:** `mustDefine`, `sessionNames`, D4-7, D4-35's MUST DEFINE allowance, the RV-5 edges from typed items to Claude's items, and the queue end's accept-as-yours fixpoint.
    - **user_loses:** - **No "Claude must define".** You can no longer type a statement that uses a word nobody has defined yet and have Claude define it in the same transform (TR-12 c). Declare the word yourself in the window (for a plain predicate, one line), or leave the statement to Claude with Instructions.
- **No Lean on Claude's vocabulary from this session.** You cannot type Lean that uses vocabulary Claude proposed in this session, even once you accepted it. Leave that statement to Claude, or transform it after Apply.
    - **soundness:** - **Your typed content never rests on unreviewed or session-only Claude content.** So the scratch check confirms what every typed piece means, against your files (S10, S4M-1).
- **No decision on a Claude item can strand your typed content or silently change it.**
- **Claude never has to write a declaration that your typed text relies on (S5, S6)**, so nothing is assumed without its own item and Accept.
- **D5-21 still holds.** No typed text makes Claude declare a name that a frozen card's dangling reference names.
- **The base never moves, and decisions are unaffected.**
    - **reversal:** - Restore TR-12 (c) (`mustDefine`, D4-7) and D4-6's session names, with the scratch's handling of them.
- Restore D4-32's unknown-name path, the typed RV-5 edges and the queue end's fixpoint.
- A middle step: allow the names of accepted items, with D4-32's own Accept.
  - [6]
    - **id:** S45-6
    - **title:** A transform step is your write, judged, then Claude's turn from there; no rework steps
    - **change:** **One baseline.** telelean's typed write and the typed judgement still come first. The judgement still compares each typed piece with your scratch check (D4-23). The judged typed commit then becomes the step's S₀ for every rule of slices 2 and 3:
- step limits;
- the frozen-items rule, whose open set becomes only `openItems`: the items owning content of dependents left to Claude;
- G5, B.3, B.4, new-axiom and no-proofs;
- the two-value rule.

What goes: `JudgeInput.typedStart`, D4-33's S₀ᵗ list, and the separate "typed units hold" rule. New-axiom's binding allowance from D4-33 stays.

**All or nothing stays.** A step that fails, gives up or is cancelled rolls back to the commit before the typed write, and Retry runs both parts again.

**Missing facts at S₀.** This happens when a module is broken by dependents left to Claude. A typed piece then has no facts at S₀:
- it is compared with your scratch's constants at the first judgement that has its facts;
- its own freeze takes its value there;
- its typed item needs its own Accept (D4-32 kept).

**No rework steps.** Items made by a transform step take Reject and Transform, not Shaky. When one would become "to be redone", it is withdrawn and listed instead. This is D4-24's own logged alternative.
    - **eliminates:** **Open:** R3-1, R3-7. R3-7's two failure modes (a rule silently skipped, or the pre-write baseline read) cannot occur, because no rule takes a second baseline.

**Earlier rounds:**
- R2-2 (the S₀ᵗ frozen-items rule and `typedStart`);
- S4M-2's separate "typed units hold" rule: the step limits and S45-3's freezes now hold your write;
- S4M-14 and D4-24: rework steps and their narrowed scope.

**Mechanisms that go:**
- the second baseline, and its facts as a separate input;
- the S₀ᵗ exception list;
- rework steps: their `rework` flags, `SessionTransforms.done`, and DO-3 per transform.
    - **user_loses:** - **No Shaky on Claude's fills from a transform.** Use Decline → Transform with your note as Instructions (same effect), or Reject.
- **Fills that depended on something you declined are withdrawn, not redone.** Transform again if you still want them.
    - **soundness:** - **One baseline that already contains your write.** Every rule reads it, so Claude's turn cannot undo any of your write without a step-limit or frozen finding (S4M-2). After the step, your own freezes and your typed items keep it.
- **Typed meaning is checked before Claude acts.** Your typed Lean is compared with your own check, and frozen at that meaning (S4M-1).
- **Missing facts fail closed.** The two-value rule excuses nothing, so frozen and held content must equal its expected value. Unconfirmed typed Lean waits for its own Accept.
- **A trashed card's `.holds` cannot come back unbound**, thanks to new-axiom's binding allowance.
- **All or nothing** keeps your write and Claude's fills together.
- **The base never moves.**
- **Decisions are never lost.** Withdrawn items stay listed.
    - **reversal:** - Make S₀ the commit before the typed write again, with D4-33's S₀ᵗ list, `JudgeInput.typedStart` and the "typed units hold" rule (slice-4 plan §3.9 step 6).
- Restore D4-24's rework steps.
  - [7]
    - **id:** S45-7
    - **title:** A suggested premise is edited in place, at once, and stays yours to accept or reject
    - **change:** **The premise window queues nothing.** It is D4-14's narrow window: sentence, Why and Lean statement. Submit transform:
1. runs TR-12 on your Lean;
2. runs slice 2's gap check ("closes the gap (checked)", "may simply restate the target") on your version;
3. in one recorded session step, replaces the premise draft in the session's records. This is a records-only write, outside the working copy as before.

The item then returns to review, marked "updated · worded by you".

**A premise you edited stays yours:**
- it is never set to be redone;
- if the check finds it no longer closes the gap (now or at a later judge), it stays in review, marked so. Accepting it then writes the card and its arrow with no completion: the Result stays not proved, and you formalize again;
- Claude may not propose another version under its key in this session; a refusal names the key, and a fresh proposal takes a new name;
- its Accept still asks how you hold it (RV-1).
    - **eliminates:** **Open:** R3-8.

**Earlier rounds:** R2-10 and LC-9.

**Mechanisms that go:**
- the `premise` typed unit;
- the no-Claude premise step at Submit review, and its write at the end of a passed step;
- the premise's place in the queue, its staleness checks and the queue end.
    - **user_loses:** Nothing you could do before is lost. Two things change:
- **Your edit applies at once**, not at Submit review.
- **No automatic rework.** A premise you edited that no longer closes the gap is not reworked by Claude. Reject it to get a fresh suggestion, or accept it and formalize the target again.
    - **soundness:** - **Nothing is assumed without your Accept.** The premise stays outside the working copy until you accept it, and its Accept still asks how you hold it: a belief item with its own Accept (RV-1, RV-7).
- **No proof claims more than Lean checked.** The gap check runs on exactly your version, and a premise that no longer closes the gap gets no completion.
- **Your wording is never overwritten**: it is never redone, and its key is reserved.
- **The base never moves.**
- **Decisions are never lost.** The edit is a recorded session step (Undo works until Submit seals), and the previous version stays viewable.
    - **reversal:** - Restore D4-14's queued premise transform, with its `premise` unit and its no-Claude step (slice-4 plan §3.7, §3.9).
- Add R3-8's own fix.
- **residual_risks:**
  - S5R2-08 (the picker's → key) is a UI bug that none of these rules touch. It needs its own small fix: take → only when the caret ends the #-word.
  - S45-3 changes slice 3's frozen plan in two small additive places. An expectation also accepts your newest live typed value, and the held walk also follows your typed words. Both do nothing until slice 4 records typed values, but slice 3 is marked FROZEN, so they must be logged as slice-4 amendments to slice 3, as D4-44 already is.
  - S45-6 relies on slice 2's handling of missing S₀ facts. Where the typed commit does not build (dependents left to Claude), the step-limit meaning comparisons for declarations in those modules have no S₀ side. Frozen and held content still fails closed, and anything else Claude changes there should surface as items or as `unowned` at the queue end. The integrator must confirm that slice 2's built rules skip such comparisons rather than pass them, and that Resume obtains S₀'s facts for a transform step, by persisting them or judging again.
  - D4-44 (an Accept freezes the value you saw) is still needed. One card can still carry your typed sentence and Claude's later Lean statement, because TR-4's per-field mix comes from your own TRANSFORM 4–5, and RV-4 pairs the two. S45-3 replaces D4-44 only for typed items.
  - Over-hold under S45-3: references made by your old words stay held until the session ends or the referring card is unfrozen. Claude may stop and ask to unfreeze more often.
  - S45-1 discards Claude's content on the cards you transform at Submit review. If the transform then fails and you drop it, Claude proposes those items again: your decisions are kept, but Claude's earlier text is not restored. Taking accepted proposals out goes through RV-5's confirmation, which may cascade widely; for example, setting aside a vocabulary item takes its users out too.
  - Under RV-7's last bullet, Lean you paste by hand still counts as typed by you, and is accepted as yours with no review row beyond the typed item. Only the [Copy] button's value keeps its own Accept. This follows the spec, but it remains a way to adopt Claude's belief text without an individual Accept.
  - These rules narrow your own words in five places:
- TRANSFORM 1 / DECLINE OPTIONS 2: decline windows start from your version;
- DECLINE OPTIONS 3: no Shaky on fills made by a transform;
- TRANSFORM 3: trashing referenced cards in a session;
- TRANSFORM 5: typed Lean limited to known names;
- D5-10's exemption for your typed change goes.

Each must be logged as an AP entry with its reversal, in an AP-14-style table you can review when back.
  - Both plans need a rewrite pass (slice 4: §2.1–§2.3, §3.2–§3.11, D4-1, D4-9, D4-14, D4-23, D4-24, D4-29–D4-34; slice 5: §2.5, §2.6, §3.6, §3.7, D5-10, D5-12, D5-19, D5-21), then at least one fresh critic round. New interactions may still appear, notably:
- the set-aside at queueing against D3-48's pre-write check and D4-43's rules for queued sources;
- per-(transform, card) typed-item keys against slice 2's stable item ids;
- S45-7's key reservation against slice 2's premise keys and `rejected-repeat`.
  - Some first-pass fixes are not removed by these rules and stay as they are: R2-3 (transform steps as computeItems' `active` step), R2-6 (`originalKeyOf`), R2-7 (names the draft deletes), R2-8 (a new vocabulary card's gloss), R2-9 (decline windows' source revs) and R2-11 (typed proofs refused). They should be re-verified against the rewritten plan rather than assumed still correct.
