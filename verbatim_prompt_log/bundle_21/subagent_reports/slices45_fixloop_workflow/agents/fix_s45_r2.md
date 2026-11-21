# fix:s45:r2

Agent `affe240c5f035d645` of workflow `wf_e9e359bd-de3`. Verbatim output (JSON alongside).

I fixed all six findings in the plans: four exactly as proposed, recheck3-02 as proposed plus one extension, and recheck3-01 only in part. For that one I left some of the proposed widenings out, because they would add new bugs; the reasons are below and in the change log. I did not build, test or run anything, and I edited only the two plan files. Both plans have a dated 2026-11-20 change-log entry for this third recheck. No decision was added: D4-8, D4-43, D4-51 and D4-59 are revised, and the §7.2 intro says so. Nothing that AP-24 or AP-31 removed came back.

Files:
- /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/plans/slice4-plan.md
- /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/plans/slice5-plan.md

**recheck3-01 (major): fixed, partly as proposed.** I checked it against the built `records.ts`, `reducer.ts`, `reconcile.ts`, `submit.ts` and `judge.ts`, and the problem is real.
- **Adopted, in §2.10 A12** (amends slice 2 §3.1 and core `review/records.ts`; `records.ts` added to 4d's file list):
  - A `transform` decline keeps its content in ws/, as a Shaky one does: `inWorkingCopy` is true for it and `isDeclinedOut` false.
  - RV-3's `blockers` treats a `transform`-declined record as a blocker, as it does a Shaky one.
  - The `goes` test of the reducer's `cascadeOut` and of reconcile's `takeOut` reaches it, so a Reject's cascade that reaches a source asks D4-43's question.
  - A `transform`-declined record with no draft is not a problem, in reconcile or in the view's "disappeared" check.
  - Only records whose content is in ws/ are ever declined `transform`.
- **Not adopted:**
  - **Widening `isShaky`'s other callers.** These are slice 2's F5 rule, Submit's counts and steps in `submit.ts`, and DO-3's identical-set check in `judge.ts`. They are rules of the Shaky decline, not tests of where content is:
    - F5 would return a source to review while its part is still queued.
    - Submit would open a source in its inference's Submit step as well as in its part.
    - DO-3 would require Claude's part to change every source.
  - **The decline-keeping lines and the DO-0 Result case.** A source is defined by its part's `items` list, not by its decline. So a source that a judge's revert or D2-57's take-out makes to be redone drops the decline and stays listed. A Result is never declined `transform`, so the Result case needs no change.
- **Instead:**
  - F5 by inference, and `planSubmit`'s Submit steps and counts, leave out every item a queued part lists (A10).
  - `planSubmit` gives the end confirmation only when no part is left to run.
  - §3.7 no longer says a Shaky decline's cascade can reach a source; the built `cascadeShaky` leaves declined records alone.
- **Tests (4d, 4e):** card:W, Drop, RV-3, `goes`, the no-draft case and the F5 exclusion, each with a "restore the built helper" mutation. The ItemWrite test's mutation is decide's `writeOf` instead, because after recheck3-02 the ItemWrite no longer comes from `writeOf`.

**recheck3-02 (major): fixed as proposed, plus one extension.**
- The `transform` action's ItemWrite holds only `premises.takeOut`; its `revert` and `reapply` are empty.
- The runner applies `planTransformWrite`'s changes first, then plans the premise take-outs on that result, so a completion that step 9 already removed is left alone.
- The take-outs' ledger drops go into the action's `takenOut`, so Undo puts them back.
- A decision whose ItemWrite takes a premise out is a judged write, never a records-only one.
- **Extension:** written premises in `rejectOut` go the same way, and step 0 now skips them. Without this, `writeOf` would list them in `premises.takeOut` while step 0 had already taken them out without dropping their ledger entries.
- **Sections:** §2.2, A1, A13, A22, A25, §3.4, §3.5 step 0, §3.8 step 5.2 and the bullets after step 6, §5.1.
- **Tests:** 4c; 4e (the ItemWrite's contents, and no inverse merge for a reopened record); 4g (the P/T case and its hidden twin).

**recheck3-03 (major): fixed as proposed.**
- At every judge-apply, before A4, reconcile returns to review every record declined `transform` that no queued part lists. A4 then withdraws those with no draft (`changed-back`).
- The part-end return is now implementable: a part whose step passed leaves `queued` in the queue-end judge-apply, since records do not change while a queue runs, and all its sources return then.
- **Sections:** A4, A12, A13, §3.9 step 6, §3.10, §5.1, D4-51.
- **Tests:** 4d; 4e covers the C case through Undo and Redo, and the stack property now allows the withdrawn records that judge-applies created.

**recheck3-04 (major): fixed, with the definition narrowed slightly.**
- `QueuedTransform.cards` is now the set of cards a part holds: every card or vocabulary item owning a key of `scope.open`, plus every `arrowsInto` card. `transformScopeOf` returns it.
- One set is read everywhere: `left`, §3.7's opening refusal and window checks, §3.4's refusals, §4.5's entry gate, and the turn.
- **Narrowed:** the finding's "that is its window's cards" is not quite right. A window card whose fields are all typed or kept owns no key Claude may change, so the part does not hold it.
- **Tests:** 4a, 4b, 4h, 4i.

**recheck3-05 (minor): fixed as proposed.**
- `cascade` and `shakyAccepted` leave out every Result in `takeOut`. Each such Result is listed only under "These results are taken out to be redone", with its fate shown as taken out to be redone.
- `takeOut` is now carried in the outcome's cascade entries, and `unaccept` never holds an item of `redo`.
- Slice 5's §2.6 holder rule and its change log are updated to match.
- **Tests:** 4b (both T cases), 4e.

**recheck3-06 (minor): fixed as proposed.**
- Both take-back sentences now use the finding's wording, naming the window's Cancel first. D4-43's quote, the `broken` comment and test 4c are updated.
- The `left` texts are unchanged, since they are shown before a window opens.
