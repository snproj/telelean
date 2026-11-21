# recheck:s45:r1

Agent `ad221746655d4099c` of workflow `wf_e9e359bd-de3`. Verbatim output (JSON alongside).

- **summary:** All six findings are fixed in the plan text.
- recheck2-05: the fixer's own sentence ("or keep “‹A›”") is right, since an open window cannot take in another existing card.
- recheck2-02: the extra refusal of Mark its proof broken on a held card is a logged, sound narrowing. Its stated reason ("no other window changes a queued part's card") is not quite true: D4-39 still lets another part's Claude mark that same proof broken.
- recheck2-06 is fixed in slice 5's D5-20, §2.6 and the 5b test, and slice 4's §3.12 matches.

Checking the fixes against the built slice-2 code (`review/records.ts`, `reducer.ts`, `reconcile.ts`) found four new majors:
1. The built helpers read a `transform` decline as content out of the working copy. With them, the decision write reverts its own sources, Drop undoes the decision's commit, and fixer 2a takes typed content out again. recheck2-01's justification ("fixer 2a's rule leaves it alone") and its 4d/4e tests rest on an amendment that §2.10 never makes.
2. `planTransformWrite` and the transform action's ItemWrite ("as decide's") both plan the decision's file changes, and no rule says which does what. The result is double reverts and an inverse merge for every reopened record. recheck2-03's route for a written premise (take it out through `cascade`, D2-71) also collides with step 9's `redo` of that premise's own Result.
3. Undo of a transform leaves the sources that reconcile declined for its part declined `transform` after the part is gone.
4. "A card a queued part holds" is never defined. Under the natural reading of `cards`, a dependent emptied for one part can be opened in another window. That brings back recheck2-02's "source of two parts" failure.

Two minors:
- A Result in `takeOut` is also listed in `cascade` or `shakyAccepted`, with a wrong or doubled fate. This is the remaining case of recheck2-04's class.
- Two of the new `broken` sentences name ways out (Drop, Back to review) that TW-1 refuses while the window is open. The only path is Cancel, which loses the draft.

None of the fixes needs a mechanism AP-24 or AP-31 removed. This was a read-only review: nothing was edited, built or run, and git was not touched.
- **findings:**
  - [1]
    - **id:** recheck3-01
    - **severity:** major
    - **plan:** slice4
    - **where:** slice4 §2.10 A12 (Shaky-like only "for Submit's gate, the reveal and D2-57"), §3.10, A22 and D4-51 (recheck2-01: "its content never left ws/, fixer 2a's rule leaves it alone"), and §1.1 4d/4e (`records.ts` is in no file list). Against slice 2 §3.1 (what is in ws/) and built core `review/records.ts` (`inWorkingCopy`, `isDeclinedOut`, `isShaky`), `review/reducer.ts` (`writeOf`, `cascadeOut`) and `review/reconcile.ts` (fixer-2a branch, end-of-pass `reverts` loop, RV-3's `blockers`).
    - **problem:** The built slice-2 helpers treat every decline but Shaky as content out of ws/:
- `inWorkingCopy` is true for a declined record only when `option === 'shaky'`;
- `isDeclinedOut` is `declined && option !== 'shaky'`;
- `isShaky` and `cascadeOut`'s `goes` read only `'shaky'`.

The plan calls the `transform` decline Shaky-like, but amends only Submit's gate, the reveal and D2-57. It never touches `records.ts` or slice 2 §3.1, and recheck2-01's fix now rests on the opposite claim. With the built helpers:
- **(a) The decision reverts its own sources.** The reducer's `writeOf` puts every source the `transform` action declines into `revert`. Example: Decline → Transform of Claude's Change of C, typing C's sentence and leaving its Why to Claude. The decision write takes C back to B, your sentence included.
- **(b) Typed content is taken out again.** Reconcile's end-of-pass loop reverts card:W once A12 declines it (in ws/, then out). At the latest, the fixer-2a branch keeps out every transform-declined source with a draft at the next decision's judge. 4d's W test and 4e's reopened-source test cannot pass.
- **(c) Drop undoes the decision.** Drop moves sources from declined `transform` (out) to in review (in), so `writeOf` `reapply`s the inverse merge of the commit that declined them. That is the transform decision's own commit, so your whole typed part is taken back.
- **(d) Cascades never reach a source.** `cascadeOut` skips a transform-declined source, so a Reject that reaches one never asks D4-43's question. RV-3's `blockers` ignore it too, against A12's "RV-3 then reads it as a Shaky decline".
    - **fix:** Add to §2.10 A12 (built in 4d; put `records.ts` in its file list) an amendment of slice 2 §3.1 and core `review/records.ts`: a `transform` decline keeps its content in ws/ exactly as `shaky` does.
- `inWorkingCopy` is true for it.
- `isDeclinedOut` excludes it.
- Every built `option === 'shaky'` test that means "content kept" reads `shaky` or `transform`: `isShaky`'s callers (reconcile's RV-3 and F5 rules, `submit.ts`, `judge.ts`), `cascadeOut`'s `goes` and its decline-keeping line, and the reducer's Result case.
- The decline's own rules stay `transform`-specific: the menu, Back to review, `decide` refusals and the rework notes.

Tests (4d, 4e), each with the mutation "restore the built helper":
- the `transform` action's ItemWrite reverts no source;
- card:W keeps its content and status through its judge-apply and through a later decision's judge;
- Drop writes no file;
- a Reject whose cascade reaches a source asks D4-43's question.
  - [2]
    - **id:** recheck3-02
    - **severity:** major
    - **plan:** slice4
    - **where:** slice4 §2.2 ("the transform, drop-transform and edit-premise outcomes carry `write: ItemWrite | null`, as decide's"), §3.5 steps 0, 8 and 9, §3.8 step 5.2 ("a written premise it returns to review leaves ws/ in this write, D2-71"), §5.1. Built `review/reducer.ts` `writeOf`. Slice 2 §4.11 (a premise's completion goes "as long as T.holds still rests on the premise") and D2-71.
    - **problem:** Two components plan the decision's file changes, and the plan never says which does what. `planTransformWrite` reverts `rejectOut` (step 0), deletes trashed Adds (step 8) and reverts `redo` (step 9). The `transform` outcome also carries an ItemWrite "as decide's", which the built `writeOf` fills from every status change:
- **`revert`** for the same `reject`, `rejectOut` and `redo` items. They are reverted twice: two plans of the same declarations on one head, so the second fails or overwrites the first.
- **`reapply`** for every record A22 reopens (Reject-declined → in review). That is the inverse merge of the commit that rejected Claude's version, on top of the content the write types there.
- **`premises.takeOut`** for the written premises `unaccept` returns to review. This is the only source of D2-71's take-out, but the plan gives it no base and no order.

recheck2-03's route makes that last collision systematic:
1. An accepted written premise P that relies on what the window changes is in `cascade`.
2. Its Result T, whose proof uses P's `.holds`, is a session-target dependent in `takeOut`.
3. So step 9 restores T.holds while P's take-out also removes its completion from T.holds.
4. Planned on the same head, the two edits collide and the decision is refused.
5. While the results are hidden (P and T silent), it is refused in one twin only, which D4-46's twins forbid.
    - **fix:** State the composition in §2.2 and §3.8 step 5.2 (4e, 4g):
- The `transform` action's ItemWrite holds only `premises.takeOut`: the written premises its `unaccept` returns to review, on the real state, hidden ones included.
- Its `revert` and `reapply` are empty. `planTransformWrite`'s steps 0, 8 and 9 are the decision's take-outs, and a reopened record keeps the content the write leaves (A22 changes only its status).
- The runner carries the take-outs out after `planTransformWrite`'s changes, planned on their result, as slice 2 carries out `revert` before the premise take-outs. A completion whose T.holds step 9 already put back is then left alone (slice 2 §4.11).
- Their ledger drops (premise, mark-removed, completion) go into the action's `takenOut`.

Tests (4e, 4g):
- Accepted written premise P of accepted Result T, and a window that retypes the vocabulary P's statement uses. The decision stands; P's card, arrow, mark removal and completion go once; Result T is reverted once; Undo puts both back. Mutation: decide's `writeOf` reverts T twice and the plan refuses.
- The twin with P and T hidden gives the same outcome.
- A reopened Reject-declined card gets no inverse merge.
  - [3]
    - **id:** recheck3-03
    - **severity:** major
    - **plan:** slice4
    - **where:** slice4 §5.1 (Undo "restores the statuses … removes its Claude part"), §2.10 A12 (sources returned "when the part's step ends … and by Drop") and A13, §3.9 step 1 (the records reconcile declines meanwhile, the decision's own new items among them), §2.10 A4, and 4e's Undo and stack-property tests.
    - **problem:** A transform action's Undo restores the statuses in its `changes` and removes its Claude part. It never touches the part's sources that reconcile declined `transform` at the decision's judge-apply or later: those are A12's events, never in `changes`. A12 returns sources only when the part's step ends, or by Drop.

Common case: Transform C, a card with no record yet. Type its sentence and leave its Why to Claude.
1. The judge-apply creates card:C and declines it `transform`.
2. Undo: the inverse merge puts C's sentence back, and the part is gone.
3. card:C stays declined `transform`, with no draft and no part.
   - Its row reads "✗ Declined (Transform) · Claude's part of “‹label›”", naming a part that no longer exists.
   - Back to review is disabled, and its decisions are refused as a source's.
4. No reconcile rule clears it. A4 withdraws only records in review; with recheck3-01's amendment, slice 2's "disappeared" problem fires and disables Apply.

It lingers until Submit review queues a no-op rework part for it. 4e's stack property ("undoing everything gives back the start records") fails on it.
    - **fix:** Make A12's return cover every way a part leaves the queue. At every judge-apply, reconcile returns to review each record declined `transform` that no queued or running part lists in its `items`; A4 then withdraws those with no draft (`changed-back`). So an Undo that removes a part, or a recovery that loses one, leaves none behind. Say so in §5.1's Undo and in A12.

Test (4e): the C case, then Undo.
- card:C ends withdrawn (`changed-back`), with no Transform-declined row and no problem.
- Mutation: restoring only `changes` leaves card:C declined `transform`.
- Redo then reopens card:C and declines it `transform` again.
  - [4]
    - **id:** recheck3-04
    - **severity:** major
    - **plan:** slice4
    - **where:** slice4 §2.2 `QueuedTransform.cards` ("the cards and vocabulary items it works on … (new cards through the decision's ids)") and `.items` (the sources include the emptied dependents' items, since their Lean is in `scope.open`). "A card a queued part holds" in §2.1 `left`, §3.4 Choices and Delete it too, §3.7's opening refusal and window checks, §4.5. D4-43, D4-59 (recheck2-02's invariant).
    - **problem:** recheck2-02's invariant ("no item is a source of two parts") rests on "a card a queued part holds". Such a card is left out of other windows, offers Keep it only as their dependent, and refuses Delete it too. The plan never defines "holds".

The only list a part has is `cards`, defined from the window's cards. But a part's sources also include the items of the dependents its decision emptied for it (`claude`, D4-48), which are not window cards. Example:
1. Window W1 on A changes A's statement, which D's statement uses. You choose Claude re-formalises it for D. P1 is queued, and card:D is its source, declined `transform`.
2. D is not in P1's `cards`, so Transform cards… on D opens W2. You type D's sentence and leave its Why to Claude, so P2's sources include card:D too.
3. When P1's step ends at Submit review, A12 returns card:D to review while P2 still waits to change it. card:D can be accepted, and P2's recomputed scope then loses D's Why.

This is recheck2-02's failure again, through a window instead of a dependent choice.
    - **fix:** Define "holds" once, in §2.2: a part holds every card and vocabulary item that owns a key of its `scope.open` or is an `arrowsInto` card. That is its window's cards (new ones through the ids) and the dependents its decision emptied for it. `cards` lists exactly those. `left`, §3.7's opening refusal and window checks, §3.4's Keep-it-only and Delete-it-too refusals, and §4.5 all read that one set.

Test (4b, 4h): a dependent emptied for a queued part is left out of a new window with D4-59's text, and as another window's dependent it offers Keep it only. Mutation: `cards` from the window's keys alone lets W2 make card:D a source of two parts.
  - [5]
    - **id:** recheck3-05
    - **severity:** minor
    - **plan:** slice4
    - **where:** slice4 §2.1 `TransformAnalysis.cascade`, `shakyAccepted` and `takeOut`; §2.2 `TransformDecision.unaccept` and `redo`; §2.4 (each CascadeEntry with its fate); §3.8 step 4, and step 5.2's order (`unaccept`, then `redo`).
    - **problem:** `cascade` and `shakyAccepted` exclude `rejectAccepted` and each other, but not the Results in `takeOut`.

Example: the results are shown, Formalize T and Result T are accepted, and B has no proof of T. A window retypes T's statement.
- Result T is in `cascade`, as an accepted RV-5 dependent of card:T, whose content holds a key of `writes`.
- It is also in `takeOut`, as a target whose statement changes (D4-19).
- The confirmation lists it under "return to review" (CascadeEntry `to`: in review) and under "These results are taken out to be redone".
- The reducer runs `unaccept`, then `redo`, so it ends taken out.

If you also leave T's Why to Claude, Result T is in both `shakyAccepted` ("will be redone", content kept) and `takeOut` (reverted). This is the remaining case of recheck2-04's class: the fate shown at the consent point is wrong or doubled.
    - **fix:** `cascade` and `shakyAccepted` leave out every Result of `takeOut`. It is listed once, under "These results are taken out to be redone", with CascadeEntry `to` to be redone. `unaccept` need not hold it, since `redo`'s take-out removes the Accept by slice 2's rule.

Test (4b): the T case lists Result T only in `takeOut`. Mutation: listing it in `cascade` shows "return to review".
  - [6]
    - **id:** recheck3-06
    - **severity:** minor
    - **plan:** slice4
    - **where:** slice4 §3.4's `broken` sentences ("… drop that part first to choose for it." and "… set it back to review first, or change your edit."), §2.1 `left`'s premise text, §2.7 TW-1 (refuses `dropTransform` and `decide` while a window is open), §3.8 step 5.5 (the window stays open after a take-back), §3.7 Cancel.
    - **problem:** After a take-back the window stays open, showing these sentences. But the ways out they name are refused while it is open: TW-1 refuses `dropTransform` and every `decide`, Back to review included.

Following them means:
1. Cancel, which discards the draft. A new window gets a new id, so the crash copy is not restored.
2. Then drop the part, or set the premise back to review.
3. Then redo the whole window.

The sentences invite a refused action and hide that cost. recheck2-02's Keep-it-only rule makes this the only way to choose for a held dependent.
    - **fix:** Name the Cancel in both sentences, which adds nothing to the design:
- "“‹c›” no longer builds with your change, and it is in Claude's part of “‹label›”, queued for Submit review: cancel this window, drop that part, then transform again."
- "“‹c›” no longer builds with your change: cancel this window, set it back to review, then transform again; or change your edit."

Test (4c): the take-back texts.
