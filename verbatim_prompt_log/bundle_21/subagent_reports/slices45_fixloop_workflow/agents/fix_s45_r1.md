# fix:s45:r1

Agent `a329d13b14b3c75ac` of workflow `wf_e9e359bd-de3`. Verbatim output (JSON alongside).

All six findings are fixed; none was wrong. I edited only the two plan files:
- /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/plans/slice4-plan.md
- /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/plans/slice5-plan.md

The `.after_ap31.md` copies are untouched. Each plan's §8 has a dated 2026-11-20 entry for this second recheck. No mechanism that AP-24 or AP-31 removed came back, and no decision was added. Nothing was built or run, and git was not touched.

**recheck2-01 (major): FIXED.**
- A22's fail-safe now applies only to records fixer 2a's rule would take out again: declined by Reject or plainly, withdrawn, or to be redone with `redo.reverted`. It never touches a record declined Shaky or `transform`, or to be redone without revert.
- A12: reconcile applies its `transform` decline after every other rule that sets that record's own status (A22's fail-safe included). RV-3 then treats it as a Shaky decline.
- Extra, same principle: the reducer now reopens records before it declines the sources, so a reopened record that is a source ends declined `transform` (§3.8 step 5.2, §2.2 comment, §5.1 Redo).
- Sections: §1.1 4d/4e, §2.2, §2.9, §2.10 A12/A22, §3.8, §3.9 step 1, §3.10, §5.1, D4-51.
- Tests:
  - 4d: the W case and the Shaky case, with mutations.
  - 4e: a reopened source ends declined `transform`, with a mutation.

**recheck2-02 (major): FIXED.**
- Sources now exclude every item in the decision's `reject`, `rejectOut` and `redo`.
- A dependent that a queued part holds offers Keep it only. `claude` and also `mark-broken` are refused with D4-59's text, in the analysis and in the runner's window checks. Refusing `mark-broken` goes beyond the finding; I did it so "Keep it only" holds for proof dependents too, and logged it.
- For the same no-two-parts rule, a queued part's source never gets its own rework part (§3.9 step 7, D4-60).
- Sections: §1.1 4b/4e, §2.1, §2.2, A12, §3.2, §3.4, §3.7, §3.8 step 5.2, §3.9 steps 1 and 7, D4-8, D4-43, D4-59, D4-60.
- Tests:
  - 4e: the s→W case, with s trashed and with s taken out by a cascade.
  - 4b: a held dependent offers Keep it only.
  - 4h: crafted choices are refused.

**recheck2-03 (major): FIXED.**
- `draftFromModel`'s `left` now holds:
  - a card whose block a live ledger `premise` entry wrote, with D4-58's text;
  - a Result's proof-phase declaration, with its own text: "“‹name›” is part of the result for “‹T›”: decline that result on its own." The premise text did not fit a declaration.
- The runner's window checks refuse such keys anywhere in a draft, the trash included.
- As a TR-13 dependent, an accepted written premise has no choice (it goes through `cascade` and is taken out, D2-71). A Shaky-declined one, or one to be redone without revert, offers Keep it only. Delete it too is refused on both. A proof-phase declaration goes with its Result.
- `claudeMayChange` gains a required `results` input, filled by the new `resultKeysOf(drafts)`, and refuses those keys. The lost-key reason "part of the result for “‹T›”" is added.
- D3-48's `out` now includes the written premises the decision returns to review.
- Also: Transform cards… is disabled on such a card (§4.5), so no window opens empty.
- Sections: §2.1, §2.2, §2.9, A7, A25, §3.2, §3.4, §3.7, §3.8, §3.9, §3.12, §4.5, D4-57, D4-58, §9.
- Tests: 4a, 4b, 4g, 4h, 4i.

**recheck2-04 (minor): FIXED.**
- New list `TransformAnalysis.shakyAccepted`, kept out of `cascade`. It holds accepted sources, shown as "These accepted items lose their Accept and wait for Claude's part of “‹label›”: …", and their accepted RV-5 dependents, shown with slice 2's Shaky text "…and will be redone: …".
- Each CascadeEntry carries its fate. Results are left out while hidden, and the confirmation then always carries D2-64's sentence.
- `unaccept` is now `cascade` plus `shakyAccepted`.
- Sections: §2.1, §2.2, §2.4, §3.4 Holders, §3.8 steps 4 and 5.2, §4.2, §4.6, D4-8, §9.
- Tests: 4b (the T case, with the mutation) and 4e (fates).

**recheck2-05 (minor): FIXED, with the text adapted.**
- New `TransformDependent.broken`: the take-back sentence for a dependent with no choice but Keep it. `transformTakeBack` gains a `dependents` input to read it.
- The taken-out card's sentence is: "“‹c›”, taken out with “‹A›”, no longer builds with your change in your files' version: delete it too, or keep “‹A›”."
- I did not use the finding's "or take it into this transform". An open window has no action that adds another existing card (the runner refuses any non-trashed key outside the window's keys). "keep “‹A›”" is the way out that §3.2's D4-62 problem already names.
- The same rule gives their own sentences to held cards, Shaky written premises and session targets. Targets had the same defect, but no finding named it.
- Sections: §1.1, §2.1, §2.9, §3.4, §3.8 step 5.5, §4.6, D4-62.
- Test: 4c.

**recheck2-06 (nit): FIXED.**
- Slice 5's D5-20 and §2.6 now say "the one path inside `newCardId` that skips the allocator; premise adoption's `cardId` reuse (§2.2) is the other".
- The 5b test wording was corrected the same way, and its premise test gains the mutation "routing that reuse through `takenIds` makes `foo-2`".
- Slice 4's §3.12 wording was aligned to match.

To keep the two plans consistent, slice 5 also got two small edits:
- its §2.6 `claudeMayChange` bullet now says that its holders, not all its inputs, come only from `holdIndexOf` and `otherSubjectHoldsOf`;
- its §2.6 holder rule notes the `shakyAccepted` case.

Both are logged in slice 5's §8.
