# fix:r2

Agent `a7d2ecf3aa9ccb327` of workflow `wf_7292b46b-740`. Verbatim output (JSON alongside).

All four findings were correct. I fixed each one, editing only the two plan files:
- /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/plans/slice4-plan.md
- /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/plans/slice5-plan.md

Both plans have a dated 2026-11-20 §8 line and agree with each other. No mechanism AP-31 removed came back. Nothing was built or run, and no git state was touched.

**recheck-01 (major, slice 4): FIXED as proposed, with two deviations.**
- **Order.** The decision's Rejects (trashed Adds, removed Claude arrow chips, Claude's arrows of trashed cards) cascade first, by slice 2's rule on the real dependencies.
  - Each item they take out is reverted once, has no choice, and is listed in `touched` as "taken out with “‹A›”: Claude redoes it at Submit review".
  - An accepted item they reach goes to the new `rejectAccepted` list with slice 2's Reject text. It is never in `cascade` or `unaccept`.
  - The window's own `card:`, `vocab:` and `decl:` items are never taken out, and the cascade does not pass through them (`inWindow`).
  - TR-13's walk runs on the state the reverts leave.
- **D3-48.** At Submit transform, `frozenChangesOf` runs on everything the decision takes out, `redo` included. Its rows join the confirmation with [Unfreeze them and submit], carried by `confirmed.unfreeze` and `TransformDecision.unfreeze` into the decision's FreezeDelta.
- **Deviation 1:** "Keep them frozen at your version" is not offered in a transform's confirmation. That keeps out any revaluing of freezes.
- **Deviation 2:** a taken-out card whose files' version relies on a declaration the window itself retypes gets Keep it or Delete it too only. Offering "Claude re-formalises it" would make the write edit what the revert just restored.
- **Knock-on fixes:**
  - R2-7 now also refuses typed Lean that uses a session name a cascade removes.
  - A typed Dependencies source taken out with a Reject is a new problem.
- **Recorded as:** new §2.10 row A25 (amending slice 2 §3.6 and slice 3's D3-48), new decision D4-62 with what you lose and how to reverse it, and tests in 4b, 4c, 4e and 4g. The 4e test is the accepted E that gets the Reject wording.

**recheck-02 (major, both plans): FIXED.**
- Every ledger value and line now carries `item`, the item that owns it. A follow-on change carries the item that caused it: the `premises:` entries a trash of x removed elsewhere, and those cards' Dependencies values, belong to `card:x`.
- Drops and restores go by item, never by owner card. `transformValues`, `transformValuesRestored` and the `transform` action's new `transformValues` record exactly what was dropped, by key. `dropTransformValues` and `whollyYours` follow the same rule: a live value counts only for its own item.
- I merged the proposed `causedBy` into this single `item` field. It is an allowance record only, not a typed unit.
- Updated: slice 4 §2.2, §2.9, A6, A13, A23, §3.5, §3.10, §5.1, D4-49 and T18; tests in 4c, 4d and 4e (the over-drop and under-drop cases, with mutations). In slice 5: §2.6, §3.5, D5-8, the 5c2 test and cheat 14.

**recheck-03 (major, slice 4): FIXED.**
- Sources are defined once, by key, in `QueuedTransform.items`: the `card:`, `vocab:` and `decl:` items under the part's open keys, plus Claude's arrow items into its `arrowsInto` cards. They are never a `proof:` item or a Result's part.
- `StepScope.openItems` is that list. Reconcile declines only records under those keys.
- A `transform` decline cascades as a Shaky one does: dependents in review become to be redone, silently for hidden Results.
- Updated §2.2, §3.1, §3.8, §3.9 step 1, A12, D4-8, D4-43 and D4-59, with the twin tests in 4e and 4g.
- **Cost, logged in D4-8:** leaving a session target's sentence or Why to Claude now makes its Result to be redone at Submit review.
- Slice 5 never names a part's sources, so it needed no change for this one.

**intent-build-F9 (minor, both plans): FIXED as proposed.**
- `planTransformWrite` takes `session.reuseIds` (set by a Redo only). `newCardId(sentence, reserved, reuse?)` gives the recorded id back when no card of the model holds it, before any reserved test.
- Slice 5's allocator replaces only the `deriveId` branch. Its §2.6 bullet names the reuse branch as the one path that skips the allocator.
- Updated slice 4 §2.9, §3.5 step 1, §3.12 and §5.1, with the 4c test ("writes `x` though reserved"). In slice 5: §2.2, §2.6, D5-20 and the 5b test.
