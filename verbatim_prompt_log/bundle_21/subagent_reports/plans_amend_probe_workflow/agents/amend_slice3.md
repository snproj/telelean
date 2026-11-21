# amend:slice3

Agent `a827b3fb8e59680ce` of workflow `wf_16a1ea15-88d`. Verbatim output (JSON alongside).

I edited only /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/plans/slice3-plan.md. It is now 1244 lines; the pre-edit copy is slice3-plan.after_ultra.md in the same folder. I ran nothing: no Lean, tsc, vitest, builds or git. Every earlier §8 line is unchanged. I added three dated §8 lines (2026-11-20): one for (a) labelled "orchestrator (AP-30)", one for R3-1–R3-6 labelled "orchestrator (AP-30)", and one for the coverage items labelled "orchestrator (AP-29)". Section headings are unchanged except §2.1's title. Decisions now run D3-1–D3-55.

## Dispositions

**(a) 3p builds on 2b3a's isolated probe: done.**
- 3p now only adds the meaning walk (`meaningKey`, with §2.1's normalisation) to 2b3a's `probeFile.ts`, or a `meaningProbe.ts` that file calls, plus the regeneration of the recordings (`probe-spyro.*` included), core's Spyro facts and the `binders` overlay facts.
- Removed from 3p: the isolation, the check-file change, AP-21's second run and the `importModules` confirmation. 3p confirms only the new part, and measures the walk's cost and output size against 2b3a's job.
- `LeanFacts.meaning` is now just `true`, the meaning marker. FID-4's base re-check reads it, not `probe`.
- `MeaningMissing` is now `'too-large' | 'unwritable' | 'absent'`. A cut is a failure of the whole probe (`probe.status: 'cut'`), and `absent` is printed as an explicit `"absent":true` line.
- When the whole probe failed (`probeFailure`), no `no-key` is reported per name, so slice 2's refusal stands, `environment` outcome included.
- At step purposes, an S₀ that lacks a key excuses no difference (fail closed).
- `freezeAtAccept` has no entry for drafts marked `factsMissing`.
- `fakeFacts({ meaningKey: true })` also sets the `probe` marker.
- Cheat 24 reuses 2b3a's `probe-forge` overlay.
- D3-52 is rewritten to extend D2-75. Its alternatives are now hashing inside the probe, `stdoutFile`, or leanexport; its reverse is dropping the walk.
- In §7.3, the sentence about AP-21 moves to slice 2's entry.

**R3-1 (major): done.**
- Reconcile now sets `heldAtJudge` at every judge-apply on every record whose item has a `freezeAtAccept` entry, whatever its status, and removes it from the others, the same rule slice 2 uses for `judged`. This closes all three gaps (no map, stale map, upgraded sessions).
- The upgrade's confirming write also sets it.
- An Accept queued behind a decision's write is stated in §3.7 as fail-closed: the stale map shows up as a `held` problem at the next judge, and back to review followed by Accept clears it. I argue there that a stale map can never leave a name unheld.
- I chose this over refusing Accepts while a write waits, which would narrow D2-27, and over a runner input, which D3-51 had removed.
- Updated: §1.1 3b, §2.3, §3.5, §3.7, §5.2, D3-51; tests in 3b (scenarios A and B and more) and 3d.

**R3-2: done.** The whole-model question now also names the step's tools. Updated §3.8, §4.4, D3-50, 3e2's guide and 3g's guide; tests in 3e2 (`propose_arrow` into P, then freezing P's Dependencies) and 3g.

**R3-3: done.** `RequestItem` gains `{ name, field? }`. The validator judges each field separately and returns `{ problems, items }`, the request as recorded. `ToolInput` gains `records`, named so it does not clash with the validator's `items`. Request rows name the field. Tests in 3b, 3c1, 3d and 3g.

**R3-4: done.** If `upgrade` is still pending at load, `recover()` re-runs that phase's step. Every judge builds while it is pending, and Submit's path into confirming sets `frozen` and `heldAtJudge`. Updated §2.2, §5.2, §1.1 3d; tests in 3d.

**R3-5: done.** "Another step's intermediate counts as a target" now appears in §2.8, §3.10 and D3-38. Added a 3c2 test and cheat 14.

**R3-6: done.** For Delete and Remove arrow, the during-step text is now "freeze it then, which rejects the deletion". Updated §3.6 and §4.3; added a 3f test.

## Coverage items

1. **G3+G12: done.** The menu label counts what the action covers ("Freeze 3 of 4 items"). The tooltip and the toast name every subject left out, with its reason, and the session path carries `left` too. When nothing fits, the action is disabled with every reason. Updated §4.3, §2.4, D3-53; tests in 3f.
2. **G5, CF-6: done.** Editing the sentence of a `worded_by: agent` card drops that line in the same plan and Undo step. The guide's "until you edit its sentence" becomes true. Slice 4's hook is in §3.12. Tests in 3b.
3. **G6: done.** The drop zone and the Move to axioms dialog name the arrows and the mark that will be removed, with frozen ones marked. Every action that removes an arrow or mark now drops its records: `change-kind` and `add-arrows` (A22), plus `set-from-nothing` off and `set-premises`. Apply also drops the records of marks F removes. Tests in 3b, 3e1 and 3f.
4. **G7: done.** One departure: the data is a new core field `DirectUses.definitions`, built in 3b, because 3f may change only the webview. 3f draws the chip. The stage report and Result show it through `bandsOf`.
5. **G8: done.** Covered in §4.2; test in 3f.
6. **RF-2 (b): done, as new D3-54.**
   - Records store their cards' sentences.
   - A record applies to a card whose id is written in its block whatever its sentence, so hand edits keep the freeze; for a card whose id is only derived, it applies only when the sentence matches the stored one.
   - telelean never gives a new card an id that a record names: add-node, adoption via `reserved`, and `add_card` all avoid it.
   - Any plan or write that writes a card's derived id marks non-applying records `lost`.
   - A session decides once, on B, which records apply.
   - Non-applying records are listed under "Frozen items not found" until the person clears them.
   - Two residuals are logged. A block the person writes by hand with the same sentence or id is taken as that card; this only freezes more. A History restore to before a card's id was written, with another sentence, lists its records instead of applying them; this is visible and rare.
7. **One-version kinds: done, as new D3-55,** with the reason for each kind and the alternative.
8. **FZ-4 frozen cards in the Result's list: already in the plan** (§4.5, FID-11, with a 3g test). I added the citation.
9. **AR-5: done, as a revision of D3-38.** With the whole model open, no arrow may go into a card marked "follows from nothing": `propose_arrow` refuses it at once and B.3 rejects it as `not-target`. Updated §2.8, §3.10 and the ▾ text; tests in 3c1 and cheat 13.
10. **A25, A2/A23: done.** §3.10 now spells out that the target's Result reads "“‹I›” was not proved" (3c2's `review/view.ts`). A2 and A23 are cited in §3.9, and the system prompt gets one A2 line. Tests in 3c2, 3d and 3e3.

## For you

- 3b grew: CF-6, A6 for four more actions, D3-54's planner rules, the G7 core field, R3-1 and R3-3. I placed each in §1's existing 3b1/3b2 fallback split.
- 3p relies on 2b2's `probeFailure` and `factsMissing`, and on 2b3a's `probe-forge` overlay.
- Because a cut fails the whole probe, a model whose meaning texts pass 32 MB cannot be checked. That fails closed, 3p measures how close Spyro gets, and D3-52 logs the alternatives.
