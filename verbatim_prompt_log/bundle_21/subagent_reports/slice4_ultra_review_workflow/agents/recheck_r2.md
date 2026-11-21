# recheck:r2

Agent `adc3963bbf9c87def` of workflow `wf_67531371-ae0`. Verbatim output (JSON alongside).

- **summary:** I checked all twelve round-2 findings against the plan as it now stands. Each one is fixed in the plan text, so none is re-raised. R2-1's part (2) was turned down, and rightly: since an accepted item's covered targets now hold the value you accepted (`frozen.covers`), there is no conflict left for it to solve.

I then reviewed the plan again with all five lenses and found eight new problems: five major and three minor. Four come from the round-2 fixes:
- **R3-2:** R2-5's split of declaration and docstring breaks a later transform that retypes the sentence of a card whose statement you typed earlier.
- **R3-6:** R2-8's new rule covers new vocabulary cards only; an existing vocabulary card with a cleared declaration and a typed gloss still fails.
- **R3-7:** R2-2's `typedStart` needs the typed judgement's facts, which are not persisted across a reload.
- **R3-8:** after R2-10, what you type into a suggested premise has no freeze, so Claude's rework can overwrite it.

Two more come from the typed-item rules that R2-1 made explicit:
- **R3-3:** units of a typed item you rejected come back when a later transform reuses that item, and `follow` units can then never hold.
- **R3-5:** a typed item with nothing left to own (after an Unfreeze, or a cleared field Claude later fills) triggers slice 2's "disappeared" problem and disables Apply.

Two are older gaps that no earlier round raised:
- **R3-1:** B.3's "drawn already" check reads S₀, from before the typed write, so Claude cannot propose again a source of a Dependencies field you cleared.
- **R3-4:** Reject of a typed item restores "B's version", which for Claude's Add card or new vocabulary means deleting the line or declaration.

None is a blocker. Each major finding leaves a natural flow failing at every attempt, or Apply disabled, with no clean way out.
- **findings:**
  - [1]
    - **id:** R3-1
    - **severity:** major
    - **where:** §3.9 step 6 (B.3 bullet; the S₀ᵗ list names only G5, B.4, new-axiom, no-proofs); §2.8 propose_arrow; §3.5 step 9 (a cleared field is written empty as soft units); D4-33; built core gate/sessionRules.ts arrowProblems (`drawnAt` from `drawnIn`), which arrowFindings calls with `drawnIn: c.stepStart`
    - **problem:** In a transform step, S₀ is the judged head before the typed write.

A Dependencies field you clear (fuzzy, "Claude proposes what it follows from", TR-4) is written as soft entry units, so the working copy no longer has those arrows. `propose_arrow` reads the working copy, so it accepts Claude's proposal of an original source.

At every gate attempt, however, B.3 runs `arrowProblems` with `drawnIn` = S₀ and reports that same arrow as `drawn`. Claude cannot withdraw a ledger arrow, so every attempt fails and the whole transform is taken back (D4-4). Retry repeats the failure.

D4-33's S₀ᵗ list leaves B.3 out.
    - **scenario:** 1. Proposition K has the Dependencies {A, B}. In a stage, open Transform cards… on K, clear its Dependencies (fuzzy) and add the instruction "B is wrong; find the real basis".
2. At Submit review, the typed write removes A and B from K's `premises:` (soft units).
3. Claude proposes A→K (accepted: it is not drawn in the working copy) and C→K.
4. Every gate attempt gives A→K `drawn` against S₀. After 3 attempts: "Your transform … could not be carried out", queued with `lastFailure`; every Retry ends the same way.
    - **fix:** §3.9 step 6 and §2.8 (4e): in a transform step, B.3 and propose_arrow read "drawn already" on the `typed` commit (`drawnIn` = `JudgeInput.typedStart`), and D4-33's S₀ᵗ list names B.3's `drawn` rule.

A re-proposed original arrow then leaves no B→W difference and no item: the soft unit simply does not own it.

4h test: the scenario passes, and the stage shows an Add arrow item for C→K only.
  - [2]
    - **id:** R3-2
    - **severity:** major
    - **where:** §2.2 TypedUnit `decl` ("except a card's statement abbrev that you typed, which includes its docstring") and `docstring`; §3.5 step 3 (the mirror as a soft docstring unit) and step 4 (replace-decl, "its docstring kept"); §3.9 step 6 typed units hold ("a typed card statement: with it"); supersession "a decl or docstring by name"; D4-29
    - **problem:** R2-5's split gives a card statement you typed a `decl` unit that includes its docstring, but writes any later D-9 mirror as a separate soft `docstring` unit.

Read as two identities, the mirror never supersedes the earlier `decl` unit. That unit still requires the old docstring while its typed item is in review or accepted, so the transform's own write breaks it.

Read as one identity, the soft unit supersedes the whole `decl` unit. Your typed statement's body is then released from D4-33, and computeItems hands it to `card:<c>`.

Either way, a transform that retypes the sentence of a card whose statement you typed in an earlier transform cannot pass.
    - **scenario:** 1. Stage 1: T0 types C's Lean statement. Its `decl` unit is the abbrev with the docstring that mirrors the old sentence. typed:C is accepted as yours.
2. Stage 2: T1 retypes C's sentence. C.statement is session-frozen by T0's `transform` reason, so the window keeps it. The docstring equals the old sentence and holds no Claude content, so telelean updates the mirror as a soft docstring unit.
3. T1's typed judgement finds that T0's `decl` unit (old docstring) does not hold: `frozen` (`typed`).
4. The no-Claude step fails with "What you typed in “T0” was changed" at every Submit and Retry. The only way out is the obscure step of unfreezing C.statement first.
    - **fix:** §2.2, §3.5 steps 3–4 and §3.9's hold rule (4c, 4d, 4e):
- A `decl` unit never includes the docstring, a card statement's included.
- The docstring of a statement you type is written as its own soft `docstring` unit, since it is the D-9 mirror and cosmetic (D4-29).
- Slice 3's statement value still includes the docstring, so the frozen check keeps it while the statement is frozen.

A later mirror then supersedes it by identity, and your typed body stays held.

4c/4h test: T0 types C's statement; T1 retypes C's sentence with the statement kept. T1 passes, the mirror is updated, and T0's body still holds.
  - [3]
    - **id:** R3-3
    - **severity:** major
    - **where:** §3.9 step 6 typed units hold ("of every earlier entry whose typed item is in review or accepted"); §3.10 (one typed item per card across the session's transforms; a Reject removes only the TransformFreezes; queue end step 1 creates or updates typed drafts and accepts them as yours); §2.2 `follow` ("no Unfreeze releases it"); "Live means in a typed entry that no rollback dropped"
    - **problem:** A typed item's Reject reverts its units and removes their TransformFreezes, but the units stay live. Whether they must hold is read from the item's status.

A card has one typed item for the whole session. When a later transform types anything on that card, the queue end updates the rejected record and accepts it as yours. From then on every unit of the rejected entry must hold again.

`follow` units (a trash, a kind change, a cleared proof, a new block's bookkeeping) are never released. Their revived values contradict the B state the Reject restored and the new transform's units, so no state satisfies both.
    - **scenario:** 1. Stage 1: T1 changes K's Kind from P to A. Its follow units: `type:` AXIOM, K's incoming entries removed, `.holds` an axiom. typed:K is accepted as yours.
2. Stage 2: the person rejects typed:K, so K is a proposition with its arrows again.
3. Transform cards… on K, retype its Why. T2 passes, because typed:K is rejected during the step.
4. At the queue end, typed:K is updated and accepted as yours. The next judge requires T1's follow units: `frozen` (`typed`) and `accepted` stage problems, Apply disabled.
5. Rejecting typed:K again drops T2's Why, and every later transform on K revives T1 again.

The same happens if T1 trashes S, the trash is rejected, and T2 types into S.
    - **fix:** §3.10 and §3.9 (4d, 4e, 4f): a typed item's Reject, and its withdrawal by the person's cascade, mark the units it reverted as revoked. Record this in that decide step (e.g. `ItemRecord.revokedUnits`, or per typed entry).

Revoked units neither own content nor must hold. Only un-reject, or the Undo of that decision, restores them.

Tests (4d, 4h): both flows reach Apply with T2's change kept.
  - [4]
    - **id:** R3-4
    - **severity:** major
    - **where:** §3.10 `planItemRevert` ("restores B's version of exactly its units' lines, entries, declarations, docstrings and blocks"); §3.10 RV-5 rule 3 (the typed item depends on the Add, not the reverse); §3.7 (Decline → Transform on Add and Vocabulary term items, Claude's values copied open)
    - **problem:** For a typed unit on a card or declaration that B lacks (Claude's Add card, Claude's new vocabulary item), B's version is absence.

Rejecting your typed item therefore deletes the line or declaration from Claude's content instead of putting Claude's value back. Claude's Add stays, since it does not depend on the typed item.
    - **scenario:** 1. Decline → Transform on Claude's "Add Spyro is brave" (card N), retype its sentence; it is carried out at Submit review.
2. Later the person rejects "Change N · you typed it".
3. planItemRevert removes N's `natural_name:` line. Claude's block is left without one (parser TL003 "Missing required field `natural_name:`."), card:N reads "updated", and the stage is broken until N is rejected too or the Reject is undone.

With a typed declaration on Claude's new vocabulary item IsSly, the same Reject deletes IsSly and breaks everything that uses it. A typed Why or gloss silently loses Claude's text.
    - **fix:** §2.2 and §3.10 (4c, 4d): each unit records the value it replaced (`before`, in the typed entry).

`planItemRevert` of a typed item restores:
- B's version where B has the card or declaration;
- the replaced value (Claude's content) where B lacks it. Its own item then owns that content again.

4d test: Reject of a typed sentence, Why and declaration on Claude's Add and on Claude's vocabulary item gives Claude's values back, valid blocks, and card:N and vocab:IsSly back at their keys from before the transform.
  - [5]
    - **id:** R3-5
    - **severity:** major
    - **where:** §3.10 queue end step 3 (only records named in a typed entry's `touched` are withdrawn); §3.10 typed items' content key (soft and released units left out); §3.9 typed units hold (soft and released units exempt); slice-2 plan §3.5 reconcile ("otherwise the stage gets the problem “‹item›” disappeared, and no decision removed it, and Apply is disabled")
    - **problem:** A typed draft exists only while one of its units owns a B→W difference. Claude may later change content whose only typed unit no longer has to hold:
- a field you unfroze (FROZEN 2's own flow: Claude asks, you unfreeze, Claude edits);
- a field you cleared and Claude left empty (a soft unit), which a later step fills.

The typed item then has no draft. Its record is named in no typed entry's `touched`, so reconcile applies slice 2's rule: "“Change C · you typed it” disappeared, and no decision removed it", and Apply is disabled.

The only exit is to Reject the typed item, which reverts Claude's wanted change to B's version.
    - **scenario:** (a) Unfrozen field:
1. Stage 1: T1 retypes C's sentence; typed:C is accepted as yours.
2. Stage 2: the person unfreezes C.sentence (typed:C returns to review), then opens Transform cards… on C with the sentence open and the instruction "reword it".
3. Claude rewrites the sentence, so card:C gets a Change.
4. At the queue end typed:C has no draft: "disappeared" stage problem, Apply disabled.

(b) Cleared field:
1. T1 clears C's Why and Claude leaves it empty; typed:C is accepted, owning only the soft absence.
2. A later whole-model Formalize writes a Why: the same "disappeared" problem.
    - **fix:** §3.10 (4d): at every judge-apply, reconcile withdraws a typed record that has no draft, with the marker "changed after you unfroze or cleared it", never slice 2's "disappeared" problem.

Its TransformFreezes are already gone (removed by the Unfreeze) or never existed (soft units).

Tests (4d, 4h): both flows reach Apply, with Claude's change in review as card:C.
  - [6]
    - **id:** R3-6
    - **severity:** minor
    - **where:** §3.2 problems (R2-8's rule covers only a new vocabulary card); §3.5 step 2 (a gloss by set-docstring) and step 9 (a cleared field emptied, as a soft unit); §2.2 ("a declaration's absence supersedes its earlier docstring units")
    - **problem:** Clearing an existing vocabulary card's declaration makes it fuzzy. Step 9 then empties it: the declaration is removed, with a soft decl-null unit.

That absence supersedes the typed gloss's docstring unit written in step 2. The hold rule then requires the gloss to be absent, while the gloss's TransformFreeze expects your text, so no state satisfies both. Alternatively the LeanOp order silently drops the gloss.

The window shows no problem.
    - **scenario:** 1. Transform cards… on vocabulary IsSly: clear the declaration (fuzzy) and type the gloss "cunning and deceitful". It needs Claude and is queued.
2. If Claude writes `/-- cunning and deceitful -/ axiom IsSly …`, the superseded gloss unit (read as absent) fails the hold rule.
3. If Claude writes no docstring, the frozen gloss fails.
4. Every attempt fails and the transform is taken back.
    - **fix:** §3.2 (4b): extend R2-8's problem to every vocabulary card: "Type the declaration of a vocabulary card whose gloss you write, or leave both to Claude."

Alternatively, write a cleared existing declaration as open, never removed, so the typed gloss stays on it.

4b test.
  - [7]
    - **id:** R3-7
    - **severity:** minor
    - **where:** §2.9 `JudgeInput.typedStart` ("with the typed judgement's facts"); §3.9 step 4; §5.3 (an interrupted transform step: only `typedCommit` is persisted); slice 2 D2-72 (`judged-facts.json` serves S₀)
    - **problem:** A Claude transform step's gate attempts and finish need `typedStart` with the typed judgement's facts, because R2-2's frozen-items rule compares content keys, which include facts.

Only `typedCommit` is persisted. After a reload, Resume ("slice 2's Resume") has the typed commit's files but not its facts:
- passing it without facts silently skips the rule (`sameProbe` is false);
- passing nothing reads S₀ and brings back R2-2's false `existing-changed` findings.
    - **scenario:** 1. Decline → Transform on Claude's Formalize C with a typed statement, leaving C's Why open for Claude.
2. VS Code reloads during Claude's turn, and the person clicks Resume.
3. Every gate attempt either skips the frozen-items rule or fails on card:C as changed since S₀.
    - **fix:** §3.9 step 4 and §5.3 (4h):
- Write the typed judgement's facts beside the step (e.g. `typed-facts.json`, keyed by the typed commit) before the run.json write that records the values.
- `recover()` loads them into `typedStart`.
- When they are missing or do not match, Resume runs the typed judgement again (no Claude) before the resume turn.

4h test: reload mid-step, then Resume, and the R2-2 flows pass.
  - [8]
    - **id:** R3-8
    - **severity:** minor
    - **where:** D4-14 ("no typed item and no transform freeze", R2-10); §3.7 premise window ("The queue-end judge checks it again (slice 2 §3.8: one that no longer closes the gap is to be redone)"); the user's TRANSFORM 5 and FROZEN 2; spec TR-5 ("Typing in a field freezes it")
    - **problem:** After R2-10, what the person types into a suggested premise has no freeze. If the queue-end check finds that it no longer closes the gap, reconcile makes it "to be redone". The next Submit's step for its target then re-proposes the premise under the same item key, replacing the person's text without any Unfreeze.

The user's TRANSFORM 5 and FROZEN 2 make typed fields frozen, and D4-14 does not say Claude may rewrite them.
    - **scenario:** 1. Transform the suggested premise of T and retype its Lean statement more weakly.
2. At the queue end it no longer closes T's gap, so it becomes "to be redone".
3. At Submit review, Claude's step for T proposes a new version of the premise, which overwrites the person's typed text.
    - **fix:** §3.7 and D4-14 (4f, 4h): a premise whose draft the person transformed (`wordedBy: 'user'` or a typed statement) that no longer closes the gap stays in review, marked "no longer closes the gap". It is never set to be redone, so only the person's Reject or a new transform changes it.

Alternatively, D4-14 and the user guide state plainly that Claude may then rework it.
