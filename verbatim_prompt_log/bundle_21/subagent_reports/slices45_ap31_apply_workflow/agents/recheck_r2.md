# recheck:r2

Agent `af1a421939fa3fbf2` of workflow `wf_7292b46b-740`. Verbatim output (JSON alongside).

- **summary:** All four findings are fixed, and I re-raise none of them.

- **recheck-01:** the Rejects' cascades now come first, on the real dependencies. They never take out or pass through the window's own items (`inWindow`), and each taken-out item is reverted once with no choice (`touched.with`). Accepted items they reach get slice 2's Reject rule and text (`rejectAccepted`), and the walk runs on the state the reverts leave. D3-48's `frozenChangesOf` runs at Submit transform, with `confirmed.unfreeze`. Both deviations are sound and logged in D4-62.
- **recheck-02:** every ledger value and line now carries `item`, and drops and restores go by item, through the decide and transform actions' `transformValues`, `dropTransformValues`, `whollyYours`, A23, and slice 5's `added` rule and cheat 14.
- **recheck-03:** sources are defined once, by key, and are never a `proof:` item or a Result's part. `openItems` is that list, and the twin tests are in place.
- **intent-build-F9:** `session.reuseIds` reaches `newCardId` ahead of the reserved test. Slice 5's allocator replaces only the `deriveId` branch.
- No mechanism AP-31 removed came back.

New problems, all in slice 4 except the last:
- **Three majors:**
  - A22's fail-safe, as worded, overrides A12's `transform` declines and D4-60's Shaky declines of wholly-yours items.
  - The new by-key sources overlap items the same decision rejects or takes out. A `claude` choice can also make one item a source of two queued parts.
  - A written premise's card can enter a Transform cards… window, and a Claude part's scope, with conflicting effects. It is never a source, and `unaccept` takes it out (D2-71).
- **Two minors:**
  - The confirmation text is wrong for accepted items that the sources' Shaky-like cascade reaches.
  - The take-back text for D4-62's Keep-it-only exception offers choices that card does not have.
- **One nit in slice 5:** D5-20 and §2.6 say only one allocation path skips `takenIds`; there are two.

Nothing was edited, built or run.
- **findings:**
  - [1]
    - **id:** recheck2-01
    - **severity:** major
    - **plan:** slice4
    - **where:** slice4 §2.10 A22 and §3.10 'Reconcile' (the fail-safe), D4-51; against §2.10 A12 and §3.9 step 1 (reconcile declines `transform` every record it creates or updates under a queued part's keys) and D4-60 with its 4g test (Shaky on a wholly-yours item after an Unfreeze)
    - **problem:** A22's fail-safe says that at every judge 'a declined, withdrawn or taken-out record whose every difference is a live `transform` value or line returns to review, updated'. Nothing limits it to the cases slice 2's 'back although declined' rule takes out (Reject, plain decline, revert).

So it also matches two kinds of record:
- the decision's own new items under a queued part's keys, which A12 declines `transform` at the same judge-apply;
- a wholly-yours item you declined Shaky (D4-60).

Example:
1. You type card W's sentence and leave W's Lean statement to Claude.
2. The judge-apply creates card:W, every difference yours, and A12 declines it `transform`.
3. The fail-safe returns card:W to review at that judge or the next one.
4. You can now accept 'Change W · you typed it' before Claude's part runs.
5. At Submit review the recomputed scope drops W's statement, as frozen by an accepted item, so Claude never writes it.

§3.9 step 1's guarantee ('nothing Claude's part may change can be accepted before the part runs') is broken. Likewise, the Shaky decline in D4-60's 4g test is undone at the next judge.

The plan does not say which rule wins, and either order breaks one of them.
    - **fix:** Scope the fail-safe in A22, §3.10 and D4-51 to records that slice 2's fixer-2a rule would take out again: declined by Reject or plainly, withdrawn, or to be redone with `redo.reverted`. It never applies to a record declined Shaky or `transform`, whose content never left ws/.

In A12, state that reconcile's `transform` decline under a queued part's keys is applied after every other reconcile rule.

Tests (4d):
- The W case keeps card:W declined `transform` through its judge-apply and a later decision's judge (mutation: the unscoped fail-safe returns it to review).
- A wholly-yours item declined Shaky after an Unfreeze stays Shaky through the next judge.
  - [2]
    - **id:** recheck2-02
    - **severity:** major
    - **plan:** slice4
    - **where:** slice4 §2.2 `QueuedTransform.items`, §3.9 step 1 and §2.10 A12 (the sources' one definition, with no exclusions); §3.8 step 5.2 (status order: `reject` with `rejectOut` first, the sources' `transform` decline after); §3.5 step 8 (Claude's arrows of a trashed card in `reject`); §3.4 'Choices' (only Delete it too is refused on a card a queued part holds); D4-43
    - **problem:** The by-key sources include 'Claude's arrow items into its arrowsInto cards', with no exclusion for items the same decision gives another status.

First case:
1. Claude added card s and an arrow s→W into your card W.
2. You trash s and clear W's Dependencies, so Claude proposes them.
3. §3.5 step 8 declines Claude's arrows of s along with s (DO-0, `reject`).
4. arrow:s>W is also a source, so step 5.2 first rejects it, then declines it `transform`.

The reducer must either refuse the decision, or leave as a source an arrow that DO-0 says Claude never proposes again. That source then returns to review when the part ends. The same happens when s is not trashed but taken out by a Reject's cascade (`rejectOut`), for example when s's statement uses a Claude vocabulary Add you trash.

Second case:
1. A TR-13 dependent D outside the window is held by an earlier queued part P1.
2. D can still be given 'Claude re-formalises it'; only Delete it too is refused.
3. The new decision empties a source of P1, against D4-43.
4. card:D becomes a source of both P1 and the new part P2.
5. When P1's step ends, A12 returns every source of P1 to review, so card:D can be accepted while P2 still waits to change it.
    - **fix:** 1. Define sources as now, minus every item in the decision's `reject`, `rejectOut` and `redo` (§2.2, §3.9 step 1, A12).
2. Refuse `claude` on a dependent that a queued part holds, with D4-59's text, in the analysis and in the runner's window checks, as Delete it too already is. Then such a dependent offers Keep it only, and no item is ever a source of two parts.

Tests:
- 4e: in the s→W case, arrow:s>W gets only the Reject's status and no source entry; with s taken out by a cascade, it gets only the cascade's status.
- 4b: a dependent held by a queued part offers Keep it only.
  - [3]
    - **id:** recheck2-03
    - **severity:** major
    - **plan:** slice4
    - **where:** slice4 §2.1 `draftFromModel` (`left`); §3.7 (the premise window opens only on a premise in review, D4-58, with no such rule for Transform cards…); §3.4 Dependents and Choices; §2.2 `QueuedTransform.items` (never a Result's part); §3.9 step 3 (slice 2's frozen-items rule over `openItems`); §3.8 steps 3 and 5.2 (`unaccept`); §5.1; slice 2 §3.8 'Taking a written premise out' (D2-71)
    - **problem:** A written premise's card (an Add premise you accepted or declined Shaky, which slice 2 keeps written) shows on the Proposed view while the results are shown. Nothing in `left` keeps it out of Transform cards….

Accepted P, you type its sentence:
- `cascade` holds premise:P, because its covers hold a key of `writes`.
- `unaccept` of a written premise takes its card out of ws/ in the same write (D2-71; §5.1 'the written premises its cascade took out').
- Meanwhile planTransformWrite step 3 edits that same block.
- The plan either refuses ('a span an earlier edit replaced'), or your sentence is lost and its own freeze fails.

Shaky-declined P, you leave its Why to Claude:
- premise:P is a Result's part, so it is never a source.
- The part's step therefore changes an item outside `openItems` and fails slice 2's frozen-items rule at every attempt and every Retry.
- If you type its sentence instead, the decision stands. Reconcile then sees a changed written premise, returns it to review and takes it out (D2-71). The result is a `frozen` stage problem that disables Apply.

The same holds for P as a TR-13 dependent given 'Claude re-formalises it' or Delete it too, and for a Result's proof-phase `decl:` in a window. D3-48's `out` (§3.8 step 3) also misses the premise take-outs that `unaccept` makes.

TRANSFORM 9 asks for 'any card, including CLAUDE SUGGESTS', but D4-58 covers only premises in review.
    - **fix:** Apply D4-58's rule to cards windows:
- `draftFromModel` puts in `left` a card whose block a live ledger `premise` entry wrote, and a Result's proof-phase `decl:`, with 'Set it back to review first: a written premise is edited once it is out of your working copy.'
- The runner's window checks refuse such a key anywhere in a draft, the trash included.
- TR-13's walk lists a written premise with no choice. An accepted one returns to review through `cascade`, which takes it out (D2-71). A Shaky-declined one offers Keep it only.
- `claudeMayChange` refuses every key that a Result or a Result's part owns, so no part's scope holds a key that no source owns.
- §3.8 step 3's D3-48 `out` includes the written premises that `unaccept` takes out.

Tests:
- 4a: `left` with that text.
- 4b: the dependent has no choice, and Delete it too is refused.
- 4g: no part's scope holds a premise card's key.
  - [4]
    - **id:** recheck2-04
    - **severity:** minor
    - **plan:** slice4
    - **where:** slice4 §2.1 `cascade` and §3.8 step 4 (RV-5 b3's 'These accepted items return to review…'), against §3.8 step 5.2 (the sources' `transform` decline 'with a Shaky decline's cascade … including the ones `unaccept` returned') and §2.4 (`cascade` entries' fates); D4-8's cost
    - **problem:** Two kinds of accepted item are in `cascade` and shown under 'These accepted items return to review, because your transform changes what they rest on':
- accepted sources (an accepted item whose covers hold a field you leave to Claude);
- their accepted RV-5 dependents.

Step 5.2 then declines the sources `transform` and makes those dependents to be redone.

Example: the results are shown, and Formalize T and Result T are accepted. You leave T's Why to Claude.
- The dialog says both return to review.
- In fact, Formalize T ends declined (Transform).
- Result T ends to be redone and is re-proved at Submit review (D4-8's cost).

The person never sees that at the consent point. This is the defect recheck-01 fixed for Rejects.
    - **fix:** Take these items out of `cascade` into their own list, for example `shakyAccepted`, shown with slice 2's Shaky text: 'These accepted items lose their Accept and will be redone: …'. For an accepted source, the text reads '… and wait for Claude's part of “‹label›”'.

Each CascadeEntry carries that fate. While the results are hidden, Results are left out and D2-64's sentence is shown.

Test (4b/4e): the T case lists Result T under that text (mutation: listing it in `cascade` shows 'return to review').
  - [5]
    - **id:** recheck2-05
    - **severity:** minor
    - **plan:** slice4
    - **where:** slice4 §3.4 'First, the Rejects' cascades' (D4-62's exception: a taken-out card whose files' version relies on a declaration the window retypes offers Keep it and Delete it too only), against §3.4 'Choices' (Keep it's take-back text) and §3.8 step 5.5 ('a kept dependent that breaks keeps §3.4's own fixed text')
    - **problem:** When such a card is kept and its files' version no longer builds with your change, the take-back says '“‹c›” no longer builds with your change: choose Claude re-formalises it, Mark its proof broken or Delete it too.' The card offers neither of the first two choices.
    - **fix:** Add a text for an item of `rejectOut`, used by `transformTakeBack`: '“‹c›”, taken out with “‹A›”, no longer builds with your change in your files' version: delete it too, or take it into this transform.' Add a test in 4c.
  - [6]
    - **id:** recheck2-06
    - **severity:** nit
    - **plan:** slice5
    - **where:** slice5 D5-20 and §2.6 'New card ids' ('the one allocation path that skips takenIds' / 'the one path that skips it'), against slice5 §2.2 and §1.1 5a (a premise item's `cardId` is also given back without asking `takenIds`)
    - **problem:** Two allocation paths skip `takenIds`, not one. A builder or a 5b spy test that enforces a single bypass would route premise reuse through `takenIds`. The registry already holds the recorded id, so `takenIds` refuses it, and the Redo of a premise's Accept makes `x-2`, against D5-20's own premise rule.
    - **fix:** In D5-20 and §2.6, say 'the one path inside `newCardId` that skips the allocator; premise adoption's `cardId` reuse (§2.2) is the other'.
