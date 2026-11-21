# verify:2a1:spec

Agent `a5e503108c485d7e7` of workflow `wf_8df564ad-639`. Verbatim output (JSON alongside).

- **summary:** I checked 2a1 against the brief, plan sections 1.1, 2.1–2.3, 2.7, 2.9, 4.1–4.3, 6.1 and 8, and the spec. I only read files and ran no builds or tests.

Most of it matches the plan:
- **Contracts.** All 72 declarations in 2.2, 2.3, 2.7 and 2.9 match when checked mechanically. The only textual differences are equivalent: the `SessionPhase` alias, and `computeItems` taking a named input type with the same fields.
- **Additive changes.** I rebuilt the pre-2a1 files from `after_slice_1g.patch` and diffed them. `typeConsts`, `refused`, `ActionOutcome.review`/`cascade`/`hiddenResults`/`reveal` and the three new `RunView` fields are all optional, `frozen` is unchanged, and no gate finding codes were added. Old files still load.
- **Scope and tests.** Exactly the 31 files in the report changed. No test was deleted, skipped or moved.
- **Exports and texts.** Every function named in 2.9 is exported, with the later ones as `notImplemented` stubs. All user-facing texts quoted in plan sections 0–6 are in `texts.ts` verbatim.
- **Hashes and closures.** The SHA-256 reference digests and the item id match `sha256sum`. Closures follow 4.1.

The ownership map (`computeItems`) has three real gaps against 4.2's "one total map from every difference":
1. **Comments and similar text are ignored.** Comments, line moves and blank lines outside declarations are not differences. Neither are block key aliases (`kind:` → `type:`) and line order. A user comment that Claude deletes in the working copy would reach Apply with no item and no problem, and no gate rule covers it.
2. **Prop axioms in the proof phase are absorbed.** A Prop axiom created in a proof phase becomes part of the Result's proof material instead of being reported unowned. This breaks 4.2/D2-40 and the builder's own 8 note.
3. **Binding changes are invisible.** If a card's statement binding changes through a blank line, no item or problem appears. The existing G5 rule catches this at a gate, but the backstop is meant to stand alone.

There are also four smaller issues:
- **`asInBase`.** It compares only the text, so a `.holds` that exists only in Lean's facts counts as absent.
- **Fields and constructors.** They are compared even when one state has no facts for the declaration they belong to, which gives spurious changes when a module fails to build.
- **Empty premise drafts.** A premise draft with no facts reports a complete closure.
- **Test coverage.** The tests do not cover every unowned case, although the 8 entry says they cover every item in the 6.1 list for 2a1.
- **findings:**
  - [1]
    - **id:** F1
    - **severity:** major
    - **where:** packages/core/src/review/items.ts:257-279 (outsideLines), 563-606 (multiset compare), 213-224 (fieldEntries); docs/slice2-plan.md §8 'builder 2a1' text-outside-declarations decision
    - **problem:** Plan 4.2 says computeItems maps every difference between B and W to an item or to an unowned problem, text outside declarations included. Instead, `outsideLines` blanks comments and compares each file's outside text as a multiset of whitespace-collapsed non-blank lines. So the following count as no difference:
- deleting or editing a user's comment line;
- moving a line;
- adding or removing blank lines.
In blocks, fields are compared by normalised key and as per-key entry lists, so rewriting `kind:` to `type:` (markup/parser.ts:42) and reordering lines are also no difference.

No other layer catches edits to comments. Stray-command refuses only new commands; step limits cover declarations and block fields; G5 compares raw field values but not the written key or line order. The 2b2 backstop re-derives ownership from B, F and the ledger (4.10), and Apply writes exactly F. So a user comment that Claude deletes in ws/ would be removed from the user's file at Apply with no item, no problem and no Accept. That breaks 3.1 (F = B + the accepted items) and the rule that the user's text stays byte-identical.
    - **fix:** - Report every B line outside declarations and blocks that is missing or altered in W as unowned. Compare comment text instead of blanking it, preferably in order so that moved lines count too.
- Decide explicitly, with the integrator, how comment-only lines that Claude adds are owned (for example by the next new declaration's item), instead of letting them reach F unseen.
- Compare block lines by written key and line order as well as by value.
- Add tests for a deleted user comment and for a `kind:` to `type:` rewrite, and correct the 8 entry.
    - **evidence:** items.ts:268 `const blanked = blankComments(chars.join(''));`; lines 570-577 use the multiset `minus`; `fieldEntries` keys on `line.key`, which is the normalised key. The 8 entry says comments are not differences ('Lean reads it as whitespace') and 'moving a line is no difference'. The plan's 4.9 stray-command allows new comments, and nothing in the plan protects existing ones.
  - [2]
    - **id:** F2
    - **severity:** major
    - **where:** packages/core/src/review/items.ts:523-536
    - **problem:** Any new axiom created in a proof phase, including a Prop axiom bound to no card, becomes proof material of `proof:<T>`. Plan 4.2 lists 'a Prop axiom bound to no card (D2-40)' among the unowned differences: 'If one appears anyway, the stage reports it and Apply is disabled.' The builder's own 8 entry says 'a new axiom that is neither a shape-passing term nor a presupposition is unowned', but the code applies this only in the statement-phase branch (lines 551-554).

So `axiom cheat : ∀ c, HasDarkPast c` with a `created … 'proof'` entry is silently owned by the Result. A backstop that re-derives ownership with computeItems would not refuse it as `unowned`, and its `own-accept` check passes when the Result was accepted with its own Accept. The gate's new-axiom rule still refuses it, but the backstop is meant to stand alone.
    - **fix:** In the proof-phase branch, report as unowned any axiom that is neither a shape-passing vocabulary term nor a presupposition, at least every Prop axiom (`isPropValued(after.facts)` or W.vocabulary kind `unmarked-axiom`), as the statement-phase branch already does. Add a test: a proof-phase Prop axiom is unowned and is not in the Result's `provides`.
    - **evidence:** `if (kind === 'theorem' || owner.phase === 'proof') { if (kind !== 'theorem' && kind !== 'axiom' && reachedByDraftOf(...)) {…} const a = acc(proofKey(owner.target), 'result'); a.names.add(name); …}`. The proof-phase test in items.test.ts covers only a shape-passing predicate axiom (`Sneaky`).
  - [3]
    - **id:** F3
    - **severity:** minor
    - **where:** packages/core/src/review/items.ts:400-468 (card loop)
    - **problem:** A card's statement binding can change with no change to its block fields or to the bound declaration's text, and computeItems does not see it. Two cases:
- a blank line inserted between a block and its adjacently-bound declaration, so the card loses its statement;
- the blank line removed before a TL013 gap declaration, so a code-less card becomes bound to an existing user declaration.

`changed` is computed only from the bound declarations' snapshots and the `lean`/`id` entries, and blank lines outside declarations are ignored (F1). So no Formalize or Change item and no problem appears, against 4.2's card-statement rule. The existing G5 binding rule refuses this at a gate and at the final check, but the backstop that re-derives ownership would not.
    - **fix:** In the card loop, set `changed = true` when `inB.node.lean.statement !== inW.node.lean.statement` (or when B.bound(id) and W.bound(id) differ), so the card gets its Formalize or Change item. Add tests for a blank line inserted after an adjacency-bound block and for one removed before a gap declaration.
    - **evidence:** Line 405: `let changed = statementish.some((name) => !sameDecl(snapOf(B, name), snapOf(W, name)));`. Bound names go into `handled`, so the declaration loop skips them. markup/parser.ts:292-318: a blank line turns adjacency into a gap.
  - [4]
    - **id:** F4
    - **severity:** minor
    - **where:** packages/core/src/review/items.ts:632
    - **problem:** `sameHolds` compares `snapOf(B, name)?.text === snapOf(W, name)?.text`. A T.holds that exists only in Lean's facts has no syntactic text, for example a declaration the scanner did not read, such as `open Classical in theorem T.holds …` on one line. It therefore counts as 'absent in both', and the Result is marked `asInBase` although W proves T. Reconcile (AF1) would then keep a rejected Result rejected despite the new proof.
    - **fix:** Compare presence explicitly: the two are the same only when both snapshots are undefined, or both exist with equal text (and facts, via `sameDecl`). A side that has facts but no text never counts as absent.
  - [5]
    - **id:** F5
    - **severity:** minor
    - **where:** packages/core/src/review/items.ts:185-193 (sameDecl), 124-148 (sideOf)
    - **problem:** Children (fields, constructors) come only from facts, but `sameDecl` compares the child lists even when one side has no facts for the parent. In a W whose module failed to build, every unchanged structure, inductive or class in that module counts as changed, giving a spurious vocabulary-change or Change item. B's facts-only orphans from that module are also reported unowned. This contradicts the rule recorded in 8 ('facts are compared only where both states have the field'). Spurious records made at such a judge could later vanish and leave reconcile's 'disappeared' problem.
    - **fix:** Compare children only when both sides have facts for the parent, and do not report a B orphan as removed when W has no facts for its file or module.
  - [6]
    - **id:** F6
    - **severity:** minor
    - **where:** packages/core/src/review/closure.ts:153-158 (draftReach)
    - **problem:** A premise draft whose `facts` is empty walks from no start. It adds nothing to R_stmt and reports `complete: true`. Examples are a converted v1 ghost before its re-check, or a failed re-check. So `classes` would neither count what its statement reaches nor mark the result incomplete, against D2-25's fail-closed rule.
    - **fix:** Return `complete: false`, with the draft's statement name in `missing`, when `draft.facts` is empty or lacks the draft's own statement.
  - [7]
    - **id:** F7
    - **severity:** minor
    - **where:** packages/core/test/review/items.test.ts; docs/slice2-plan.md §8 'Tests' line of builder 2a1
    - **problem:** Plan 6.1 asks for 'every ownership rule of §4.2, and the unowned cases'. There is no test for:
- a `type:` change being unowned;
- a namespace or section that encloses an existing (not new) declaration;
- a proof-phase Prop axiom (this test would have exposed F2);
- a binding change (F3).
The 8 line says the tests cover 'every item of §6.1's 2a1 list', which overstates it.
    - **fix:** Add these tests (together with the fixes for F1 to F3) and correct the 8 wording.
- **checks_run:**
  - Read the verifier and builder briefs, builder_rules.md, plan sections 0, 1, 1.1, 2.1-2.3, 2.7, 2.9, 3.1-3.8, 4.1-4.12, 5.5, 5.11-5.12, 6.1 and the builder-2a1 entry in 8, and the spec's B.6 markup and backstop clauses
  - Rebuilt pre-2a1 copies of facts.ts, actions.ts, run.ts, index.ts and fakeFacts.ts from after_slice_1g.patch with `git apply --include` in the scratch dir, then diffed: only additive changes (the optional typeConsts field, the refused code, the optional review, cascade, hiddenResults and reveal fields, the session, inferences and step fields on RunView, one index export line, fakeFacts typeConsts options)
  - find packages docs test-fixtures -newer after_slice_1g.patch: 31 files (24 core src, 7 test and helper files, plus the plan), which matches the report; gate/types.ts untouched
  - contracts_check.py (plan code blocks against src/review/*.ts): 72 plan declarations, 4 textual differences, all equivalent (SessionPhase alias, computeItems(i: ComputeItemsInput) with identical fields, a leading '|', one script artifact)
  - texts_check2.py: 225 quoted strings in plan sections 0-6; the 60 not found literally are all numeric examples, spec phrases or meta quotes; no user-facing text is missing
  - sha256sum of the hash.test.ts vectors (UTF-8 string; 'a'×55, 56, 64, 1000) and of '["run1","card:x"]': all match the expected values and the id it28a92e030e357d5d
  - diff of the builder's items.ts.bak against items.ts: two later refinements only, consistent with the mutation check in the report
  - grep for .skip, .only and .todo in test/review: none; grep for duplicate exported names in core/src: none introduced by review/
  - Read items.ts, closure.ts, hash.ts, keys.ts, texts.ts, types.ts, view.ts, all the stubs, and the four test files with their helper; read the G5 code in gate/rules.ts, normalise.ts and engine.normalise to judge how the gaps are mitigated
  - No builds or tests were run, as instructed
