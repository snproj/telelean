# apply:slice5

Agent `ae396cad97010de29` of workflow `wf_7292b46b-740`. Verbatim output (JSON alongside).

AP-31 is now applied to the slice-5 plan, and it matches the rewritten slice-4 plan. I edited only `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/plans/slice5-plan.md` (now about 157 KB). The design before AP-31 is still at `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/plans/slice5-plan.after_ultra.md` (I checked it was byte-identical to the old plan), and every reversal points to it. Nothing was built, run or tested, and the rewrite has not been through a critic round.

Sections rewritten: the header, §0, §1, §1.1, §2.2, §2.4–§2.8, §3.1, §3.4–§3.7, §4.1, §4.2, §4.4, §4.6, §5, §6.1 (5b–5f2), §6.2, §7.1–§7.3 and §9. §8 has a new line, "2026-11-20 (AP-31 applied)".

## 1. Sub-slices: still eight, in the same order
5a → 5b → 5c1 → 5c2 → 5d → 5e. 5f1 may run beside 5e when files don't overlap; 5f2 comes after 5e and 5f1. Core sub-slices run strictly one at a time.
- **5a** (core, two runner changes): tokens, the id registry format, the allocator, F1, the session's subject in every judge, every text, the stubs. The ledger `premise` entry gains `rationale?` and a new `naturalName?`.
- **5b** (runner, host): the registry on disk. Every allocation goes through it, including slice 4's `newCardId` (the decision write, recorded before its files go into ws/) and `add_card` in Claude's parts.
- **5c1** (core): names, mirrors (slice 4 writes only a typed statement's own mirror), the person's validation, and the dependents functions. `proseProblems` becomes `refProblems`, whose `trashed` is now one list of cards: it refuses every token naming a card in the window's own trash, whatever `before` holds, Instructions included.
- **5c2** (core): the `reference` rule, whose allowances come from the ledger (live `transform` values via `liveTransformValues`, and the premise entries). Also raw spans, names, and slice 4's `reference` dependents with no rewrite: `choices: []`, "Delete it too", and the Delete dialog's "Referred to by" section. The detach, `planTypedWrite.base` and the Submit staleness are gone.
- **5d** (core, then `run/session.ts`, `run/transformWrite.ts`, `run/prompts.ts`): it shrinks. Gone: the revalue, the walk stop, pending and valued holds, and the TransformFreeze maps. Added:
  - `valueOwnFreezes` uses `holdingMap` and gains `subject`;
  - `claudeMayChange` takes `heldFields` and `otherSubjectRefHolds` as sources;
  - reference holders in the analysis (direct, through other sentences, and through stored maps);
  - typed holds;
  - other-subject reference locks.
- **5e** (runner): raw spans now cover a Claude part's quoted values; the edited premise's written sentence is recorded.
- **5f1** (webview): includes the S5R2-08 fix. → is taken only when the character after the caret is whitespace or the end of the field; `pickerReduce` has cases for both.
- **5f2** (webview, guide): ImpactPanel's reference rows, holder problems, typed-hold problems and marks.

Fallback splits for 5c2 and 5d are rewritten in §1.

## 2. Decisions (§7.2)
- **Withdrawn by AP-31**, each recording what it was and the open findings it carried:
  - D5-12 (detach) → replaced by D5-24.
  - D5-19 (revalue) → replaced by D5-25 and D4-53.
- **Revised:**
  - D5-1: the (S4) places are slice 4's §3.12.
  - D5-7 (R5, with D4-56): no mirror is rewritten in a session; added what you lose.
  - D5-8 (R2, R7): the allowances are the live ledger `transform` values, which a Reject drops, plus the edited premise's sentence and the Why its write wrote.
  - D5-9 (R3, R6): held keys are refused through `claudeMayChange`; a dependent left to Claude whose Lean is reference-held is a holder problem.
  - D5-10 (R6, D4-57): the exemption for your typed change is dropped; the window locks such fields, refuses their trash, and refuses a new vocabulary name that another subject's dangling reference names. New "you lose" and reversal.
  - D5-11: wording (the decision write gives draft cards their ids).
  - D5-21 (R3, R4): no MUST DEFINE. `revived`'s exemption covers only a declaration you typed. Declaring a name that a frozen card's dangling reference names is a holder problem.
- **New:**
  - **D5-24 (R6):** telelean never rewrites a reference. Referrers of a deleted card keep their tokens and show "deleted card", listed as the Delete dialog lists them. Unfrozen referrers of a changed field are warned ("Refers to it, and will read: ‹text›."). Frozen referrers are holder problems. A window token naming a card in its own trash is refused. *You lose:* automatic rewording.
  - **D5-25 (R3):** holds never move. A frozen card that refers, directly or through other sentences, to what a transform changes must first be unfrozen, deleted too, or have its reference changed in the window; forced, the decision's judgement takes the write back (`held`). What you type holds its references through your own freeze. It may not refer to a fuzzy, cleared or emptied field of the same window; an open one is marked held and left out of Claude's part.
- **Unchanged:** D5-2–D5-6, D5-13–D5-18, D5-20, D5-22, D5-23.

Cheats 11 and 13 now hold through own freezes valued at the decision. New cheats: 14 (a token Claude writes back after your Reject dropped its allowance) and 15 (no rewrite of A; refusal of a copied token to the window's own trash). Cheats 1, 5 and 8 are adapted.

## 3. Choices beyond the judge's text (for the critic round)
1. **Typed holds:** the judge said nothing explicit for references. I refuse fuzzy, cleared and emptied targets but allow open ones (marked and left out of Claude's part), because copied sentences start open. Slice 4's Lean rule also refuses open. When all of a field's holders are planned, this text replaces slice 4's held text (one message).
2. **One source for holders:** holders come only from the hold index (`heldFields`, plus stored maps, plus planned typed holds). `reference` dependents are never D4-21's frozen-dependent problem. Between 5c2 and 5d, frozen direct referrers are listed but not refused.
3. **Warnings scope:** a changed-field warning goes only to direct referrers of that field.
4. **`referenceHolds` accepts `{ text }` roots**, for the planned holds.
5. **New ledger field:** the `premise` entry gains `naturalName`, so the `added` rule reads only the ledger.

## 4. Matching edits slice 4's plan may need (not made)
- `valueOwnFreezes` gains a `subject` input.
- `TransformDependent.reference` with `choices: []` must be exempt from "a dependent with no choice".
- The typed-hold one-message rule.
- Naming the one place that assembles `claudeMayChange`'s input; slice 4's plan doesn't name it, so the 5d builder records it in §8.

Before 5a starts: one fresh critic round on §2.5–§2.6, §3.5–§3.7 and D5-10, D5-21, D5-24, D5-25 (the judge's open item 6).
