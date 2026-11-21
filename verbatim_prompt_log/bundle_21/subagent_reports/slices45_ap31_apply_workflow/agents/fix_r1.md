# fix:r1

Agent `a5c0b49d9929b52b5` of workflow `wf_7292b46b-740`. Verbatim output (JSON alongside).

I fixed all 25 findings in the two plans. None was wrong, so every one has a change. Nothing AP-31 removed came back: no typed units, transform freezes, revalue, detach, typed write inside a Claude step, MUST DEFINE, or Edit… re-base. Nothing was built or run, and I touched only the two plan files.

Files:
- /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/plans/slice4-plan.md (new 2026-11-20 §8 line)
- /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/plans/slice5-plan.md (new 2026-11-20 §8 line)

New in slice 4: §2.10 rows A21–A24 and decision D4-61. Revised in slice 4: A3–A7, A9, A12, A13; D4-28, D4-43, D4-46, D4-48, D4-49, D4-51, D4-52, D4-58, D4-59, D4-60. Revised in slice 5: D5-7, D5-8, D5-9, D5-20, D5-22, D5-25.

DISPOSITIONS

- **sound-L-01 (blocker): FIXED (slice 4).**
  - The reducer's `transform` action returns to review ("updated", rejected versions kept) every record that owns a key the write changes and is declined (Reject or plain), withdrawn, or to be redone with its content taken out. It skips the records the decision itself declines or takes out.
  - The reducer reads the keys from the decision's `transform` entry `values`, so `TransformDecision` needs no new field. The changes go in the action's `changes`, so Undo restores them.
  - New row A22 amends fixer 2a's rule: at any judge, a record whose every difference is a live `transform` value or line returns to review instead of being taken out again.
  - Where: §2.2, §3.8 step 5.2, §3.10, §5.1 (Redo reopens), D4-51. Tests in 4d, 4e and 4g: Reject then transform; Undo then Redo.

- **sound-L-02: FIXED (both plans).**
  - Un-reject of an item a transform declined is refused, with LC-15's text. Slice 2's S-F5 already refuses this for a mixed request.
  - Un-reject of a plain Reject restores the `transformValues` that Reject dropped, recorded as `transformValuesRestored` so its Undo drops them again. Liveness stays by recorded drops, never by item status (T18).
  - Where: §2.2, §3.10, A6, A13, A23, new D4-61, §4.5, tests in 4e and 4k.
  - Slice 5: §2.6, §3.5, D5-8, the 5c2 tests and cheat 14 gain the un-reject case.

- **sound-L-03: FIXED, adapted (slice 4).**
  - Slice 3's recorded ids write now comes first, while `idsCommit` is absent, before start-session's stage-1 write, the claude-step's decision write, and every stage decision write (A24, §3.1 "Ids first", §3.8 step 5, recovery note).
  - I did not add the suggested refusal. Making the ids write first covers the same case, and a refusal would leave the person with nothing they could do to lift it.
  - 4h tests with id-less cards: a retyped sentence, and a trashed same-sentence sibling.

- **sound-L-04: FIXED with options (a)–(d), not the refusal (slice 4).**
  - (a) While the results are hidden, every take-back problem that comes from Lean is one fixed sentence on its card and field, with no Lean message and no constant named. I made it uniform, rather than "masked-model names only", so the channel stays one bit.
  - (b) `other-result` on a typed piece is now a take-back reason.
  - (c) The remaining bit is logged in D4-46 alongside D2-69's channel: hidden names, instances, coercions and shadowing declarations.
  - (d) T15 gains twins for a hidden instance and a shadowing declaration.
  - I did not refuse typed Lean while the results are hidden: declining Claude's formalisations with Transform happens exactly then (D4-19). This is logged as D4-46's alternative.

- **sound-L-05: FIXED (slice 4).**
  - Ledger values of a dependent's emptied Lean are marked `emptied`. They are allowances only: `whollyYours`, `liveTransformValues` consumers and EN-2's list skip them, so the item keeps its class's Accept.
  - The stage report says "Claude did not re-formalise “‹c›”: it has no Lean statement now." when Claude's part ends with it empty, fails, or is dropped.
  - Where: §2.2, §2.4, §2.9, §3.5 step 9, §3.7 Drop, §3.9 steps 5–6, §3.10, D4-48, D4-49; tests in 4d and 4g.

- **sound-L-06 and intent-build-F1: FIXED together (both plans).**
  - I confirmed in the built `judge.ts` (lines 247–248) and `backstop.ts` (268–269) that the subject is derived from the first target.
  - New row A21 moves the required `JudgeInput.subject` and `BackstopInput.subject` into slice 4 (4a contract, 4d core, 4g runner passing it to every judge, `finalCheck` and Apply's backstop).
  - §2.9 now says what judgeState does with a `transform` scope: no pseudo-inference; none of the active target's rules (not-proved, status-mismatch, statement-changed, readiness, malformed-binding, not-frozen, proof-before-freeze, target footprint, no-hidden-edge); its new declarations judged against the vocabulary layer; global rules, per-key limits, frozen/held and rejected-repeat as for any step.
  - T4 and T21 now run in a Claude part's step of a session with no inference, with the mutation check; 4d tests added.
  - Slice 5's 5a keeps only `frozenFindings`' `subject` and verifies the rest (§0, §1, §1.1, §2.4, §6.1).

- **sound-L-07: FIXED (slice 5).**
  - `heldValueOf` and `holdingMap` take a required `ResultArrows`: exactly the arrows slice 2's base mask drops. A session target's Dependencies are valued without them at every valuation and in the check.
  - I made it unconditional, not only while hidden, and required (D3-51's rule) so no caller can forget the mask.
  - Where: §1.1 5d, §2.5, §2.6, §3.6, D5-9; a 5d twin test.

- **sound-L-08 and intent-build-F8: FIXED (slice 5).**
  - Normalise requires `mirrorText` only of a docstring the running step made new or changed since its S₀. Docstrings written earlier in the session are left as they are.
  - A typed statement's mirror is resolved on the decision's planned result: the helper runs last, on a markup re-parse.
  - Where: §0, §1.1 5c1, §2.3, §2.6, §3.4, D5-7; 5c1 tests, including "type a statement, retype its sentence, then a Claude part passes".

- **sound-L-09: FIXED (slice 4).** `hiddenNotice` is now set whenever the decision writes any Lean, or changes or removes existing content (§2.1, §3.8 step 4, D4-46, 4b test).

- **sound-L-10: FIXED (slice 4).**
  - "Delete it too" and the runner's window checks refuse a card held by a queued part (D4-59's text).
  - The analysis gets a `drops` list. The confirmation asks D4-43's question per part; a resend needs `confirmed.drops` naming exactly those parts, and a different list asks again.
  - The `transform` action records `drops`, and Undo restores them.
  - Where: §2.1, §2.2, §2.4, §2.5, §2.7, §3.4, §3.7, §3.8, §4.2, §5.1, D4-43; tests.

- **sound-L-11: FIXED (slice 4).** `openTransform` and Submit transform refuse a premise window unless the premise is in review with its draft outside ws/, with the finding's text (§3.7, D4-58, 4h test).

- **sound-L-12: FIXED (both plans).**
  - Slice 4: `transformScopeOf` returns `lost`. The stage report adds "Claude's part of “‹label›” left out ‹fields›: ‹reason›." D4-39's walk and "results you must not break" are recomputed on the shown state at Submit review and Retry (§2.4, §2.9, §3.9 step 2, D4-59, tests).
  - Slice 5: a typed hold on a key a queued part leaves to Claude is a window problem, with new text "…take the reference out, and add it after Submit review." I worded it this way because Drop is refused while a window is open (§2.6, §2.8, §3.6, D5-25, 5d test).

- **sound-L-13: FIXED (slice 4).**
  - At a part's end every source returns to review first, then A4 withdraws any left with no draft; the same at Drop (A4, A12, §3.7, §3.9 step 6, D4-51).
  - The core tests are in 4d, which owns reconcile in this plan, rather than 4e; runner tests are in 4g.

- **sound-L-14: FIXED (slice 5).** D5-22 also refuses Submit transform and a transform's Redo (§1.1 5d, which now names four runner files including `run/transform.ts`; §3.6, D5-22, 5d test).

- **intent-build-F2: FIXED (slice 4).**
  - Shaky is refused only when the rework part would have an empty scope: every key the item owns is refused by `claudeMayChange`. New text: "Every field of it is frozen (‹reasons›): unfreeze the fields Claude may redo, then decline it Shaky."
  - The runner computes the refusal before the reducer, because ReviewState holds no model or hold index. Submit review dropping an empty part is the fail-safe.
  - Where: §1.1, §3.9 step 7, D4-60; the 4e test was moved to 4g.

- **intent-build-F3: FIXED (slice 4).**
  - `follow` own freezes keep slice 3's whole-state rows: "keep frozen" at Apply on cards that remain, and at Exit only when valued from base. `deleted` own freezes get no row at Apply.
  - New `OwnFreeze.transform.replacedBase`: Exit offers the keep row of an own freeze of the base value that a decision replaced.
  - Where: §2.3, §2.4, A3, §3.11, D4-52 (logged as refining R3's "the others end with the session"); 4d test "freeze X, trash a source of X → keep tick".

- **intent-build-F4: FIXED, adapted (both plans).**
  - Slice 4 defines `HeldKey`, `HoldIndex` (holders `{ key }` or `{ item }`, plus `via`) and `OtherSubjectHolds`. I keyed `OtherSubjectHolds` by `HeldKey` with an optional `name`, so slice 5's field keys and referring cards fit.
  - Core builders `holdIndexOf` and `otherSubjectHoldsOf` (4b, `freeze/holdIndex.ts`) are the one place every runner site calls. Slice 4 calls no `heldFields`.
  - Where in slice 4: §1.1, §2.3, §2.9, A5, A7, §3.12, D4-28.
  - Slice 5: 5d adds `heldFields`' keys and `otherSubjectRefHolds` inside those two builders. Deviation: the window's planned typed holds are added by `analyseTransform`, the one place that has the draft, not inside `holdIndexOf`.
  - Slice 5 wording fixed in §0, §1.1, §2.5, §2.6 and §9.

- **intent-build-F5: FIXED (both plans).**
  - The problem is now `choices.length > 1 && !(key in draft.dependents)`. A single choice is taken by default; `choices: []` is listed only.
  - I also had the direct confirmation list the dependents kept by default, so the board's "Delete anyway" acknowledgement is not lost.
  - Where: §2.1, §3.2, §3.4, §3.6, §4.6, §9, 4b tests. Slice 5 §1.1 and §2.6 now cite slice 4's rule instead of an exemption.

- **intent-build-F6: FIXED, merged with sound-L-04** (same fixed sentence, D4-46 log, T15 twins).

- **intent-build-F7: FIXED (slice 4).** Take-back failures are matched by code, token, file and declaration name, a build error by the declaration owning its range; never by position or message text (§2.9, §3.8 step 5.5, 4c test with the moved error).

- **intent-build-F9: FIXED (both plans).** A decision's Redo reuses its recorded new-card `ids` when no card holds them (slice 4 §5.1, A13; slice 5 §2.2, §3.2, §5, D5-20, 5b test "x → freeze → Undo×2 → Redo×2 keeps x").

- **intent-build-F10: FIXED (slice 4).** `ReviewState.phase?: SessionPhase` (slice 2's, with `transform`; absent means `stage`) (§2.2).

- **intent-build-F11: FIXED (both plans).** `confirmed` is removed from `dropTransform` in the protocol, RunManager and ReviewAction (slice 4 §2.2, §2.5, §2.7). Slice 5 §0 and §4.2 now cite 4j.
