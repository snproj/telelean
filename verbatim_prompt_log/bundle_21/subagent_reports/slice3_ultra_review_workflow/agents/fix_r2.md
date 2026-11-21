# fix:r2

Agent `ad084e227bba60530` of workflow `wf_84d1f5cb-1a7`. Verbatim output (JSON alongside).

- **summary:** I applied all 6 findings (1 major, 5 minor) to /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/plans/slice3-plan.md. §8 has one new dated line, "ultra review round 2: …". Nothing else was written, and nothing was built or run.

Claims checked read-only before editing:
- **Premise insertion:** core `gate/adoption.ts` writes the premise card right before the target's block.
- **Locked boards:** slice 2's RunElsewhere makes every board of the folder read-only during a session.
- **Lean internals (pinned 4.35 sources):**
  - `Expr` derives `Repr`, which prints binder names.
  - Anonymous instance binders (`withFreshMacroScope`), `mkFreshBinderName` (`_` binders, match discriminants) and deriving handlers take the module-wide macro-scope counter.
  - The finding's arrow example does NOT hold on 4.35: `elabArrow` uses a reserved scope (`_internal`, `reservedMacroScope`). So its rule R would not fail, but pattern-matching definitions, instance binders and derived instances do. The finding stands.

Choices made:
- **S3-6:** `Name.anonymous` for every binder, rather than `eraseMacroScopes`, so an alpha-renamed held theorem does not count as changed; text comparisons still catch renames.
- **FID-1:** a smaller form of option (a). The person can unfreeze a foreign record in the session, for that session only. It is frozen again at the end with no write, and its end row is listed but cannot be kept; D3-41 logs this as a narrowing of EN-2.
- **IMP-6:** its first option, plus one rule. A ledger arrow is part of a Result only when it goes into its own step's target, read from the entry's `step`. This also covers a card that a later mid-stage Formalize makes a target.

Decisions revised: D3-2, D3-7, D3-38, D3-41. No new decision numbers.
- **dispositions:**
  - [1]
    - **id:** checks-S3-6
    - **action:** fixed
    - **note:** Confirmed in the pinned Lean 4.35 sources: `Expr` derives `Repr`, and `mkFreshBinderName` and anonymous instance binders use `withFreshMacroScope`, which takes the module's counter. One correction: on 4.35 `elabArrow` uses a reserved macro scope, so plain arrows are stable and the finding's rule-R scenario would not fail. Pattern-matching definitions (`x✝`), instance binders (`inst✝`), `_` binders and derived instances reached by the walk do fail, so the defect is real.

Fix:
- §2.1 (meaningKey doc and a new bullet): before the `Repr`, every `lam`/`forallE`/`letE` binder name becomes `Name.anonymous` and every `mdata` node is dropped. S3-6's renaming of auxiliaries stays. `MeaningMissing` is now a named type.
- D3-2: 'binder names are not part of meaning'. Alternative: `eraseMacroScopes`. How to reverse is stated.
- §1.1 3p: the normalisation and a new overlay `binders`.
- §0's recordings gate: the overlay's facts before and after a premise write.

Tests:
- 3p, real Lean: the overlay has an arrow-typed axiom (kept as a guard against a toolchain change), a pattern-matching definition, an anonymous instance binder, `fun _ =>`, and a `deriving DecidableEq` instance reached through `decide`. Main has an implication and an instance binder. An unrelated command inserted above them in each module, and a `planGhostAdoption` premise written right before the target, leave every earlier key unchanged. A renamed binder changes the text but not the key. A unit test checks the generated probe's normalisation.
- 3d: the 2f premise suite on the recorded facts. A premise written before a target whose accepted statement has an implication and an instance binder passes its write's judgement.
  - [2]
    - **id:** intent-FID-1
    - **action:** fixed
    - **note:** A smaller form of option (a), chosen because it follows FROZEN 4 and FZ-6 (the user's words) with no cross-subject write or Undo step.

How it works:
- In a session, Unfreeze of a foreign record puts its key in `standingCleared`. That is one flag per key, so FreezeDelta, Undo, `madeAt` and Unfreeze all other cards work unchanged; the last counts it as a standing freeze.
- Claude may then change the content within its limits.
- At the end it is in force again with no write, because its record never left the other board's file.
- The end confirmation and Exit list it with a reason and no tick (REVIEW 8).
- On a board outside a session, its Unfreeze is still left out with 'Frozen on ‹S›'s board: unfreeze it there.', since that board is unlocked then.
- A foreign record on a definition the other subject relies on stays fixed by the `other-subject` limit, so a request for it is refused under FID-5's rule.

D3-41 logs the missing keep tick as a narrowing of EN-2, with the finding's full (a) and its (b) as alternatives, and how to reverse it.

Sections changed: header, §2.2 (foreign, standingCleared), §2.3, §2.4 (`keep.reason`), §3.1, §3.3, §3.6, §4.3 (tooltip text), §4.6, §4.7 (Keep all covers only rows that can be kept; Exit shows the reason), §5.4, cheat 25, the 3g guide.

Tests: 3a, 3b, 3c1 (a foreign gloss request accepted; a foreign definition's declaration refused), 3d, 3e1 (host refuses the key; nothing writes the other subject's file), 3e2, 3f, 3g.
  - [3]
    - **id:** lifecycle-L1
    - **action:** fixed
    - **note:** §5.2 now upgrades by phase. It runs after slice 2's own recovery, with `checkBase` at once and a new `SessionFreezes.upgrade: 'pending'` flag.
- **Stage:** a judge with a build; its judge-apply reconciles, then sets `frozen`.
- **During a queue:** only `checkBase`; the records are untouched (D2-62, D2-63). The interrupted step's `startedAt` comes from its step-start record's time, or the upgrade's time when there is none. The queue-end judge sets `frozen`; it builds while the flag is pending, and also runs after Cancel step or a failure. A freeze made meanwhile is stored without keys, which fails closed.
- **Confirming:** the final check runs again with a build. A records-only write sets `frozen`, then the frozen part of the check runs again, giving a new check id.
- **Applying:** slice 2's Apply recovery runs first; the upgrade follows only if the session goes back to confirming.

(2) New `AddressValue.missing` and `HeldValue.missing` (§2.2, §3.2). For a value stored without a key, ‹why› names a permanent cause ('its name cannot be passed to Lean: rename it', 'its elaborated form is over 2 MB'); transient causes keep 'freeze it again'.

Also updated: §1.1 3d, §2.3 PersistedStep, §3.8.

Tests: 3a (the cause texts); 3d (interrupted then resumed, records unchanged until the queue ends; Cancel step; confirming gets a new id; applying).
  - [4]
    - **id:** intent-FID-5
    - **action:** fixed
    - **note:** §3.9: `unfreezeRequestProblems` first refuses every item the running step's limits fix, frozen or not, with that limit's text. That means:
- outside a narrow step's scope exceptions;
- what §3.10's whole-model list fixes;
- after freeze_statements, what it fixed;
- another subject's content;
- CF-3 data.

Texts (§2.8):
- The narrow text is reworded to 'fixed by this step's question, frozen or not … nor in a retry of it'.
- A new whole-model text is added.
- After freeze_statements, the existing 'statements are fixed' text is used.

The accepted row's hint (§3.9, §4.6) now shows only for content the step may change once unfrozen, such as a re-asked target's accepted proof. D3-7 is updated with the alternative and how to reverse. The whole-model limits of the validator go to 3c1 (§1.1).

Tests: 3b (narrow case, frozen and not; after freeze_statements; a re-ask's proof passes) and 3c1 (whole model).
  - [5]
    - **id:** ui-U1
    - **action:** fixed
    - **note:** §4.3: a proposed '−' arrow's right-click group acts on the arrow `{ kind: 'arrow', source, target }`. Freeze reads 'Freeze and reject the deletion' and goes through `decideItems` with `freezeSubjects` (§3.6's Versions: your version only). It is disabled during a step with §3.6's text. A '+' arrow keeps its item. 3f test added.
  - [6]
    - **id:** build-IMP-6
    - **action:** fixed
    - **note:** Took the first option:
- `propose_arrow` refuses, with the whole model open, an arrow into another target of the session (new text, §2.8). Another step's intermediate counts as a target.
- B.3 keeps slice 2's `not-target` for such an arrow, judged while the proposing step runs (§3.10, D3-38).

One rule more, beyond the finding: computeItems makes a ledger arrow part of a Result only when it goes into its own step's target, read from the entry's `step`. Without it, a card that a later mid-stage Formalize makes a target would take in another step's arrow. Slice 2's check 3 already asks for that arrow to be accepted first, and then counts it as a drawn arrow. For slice-2 states the rule is equivalent.

Also updated: the mask's `dropArrows` and Ownership wording, §1.1 3c1, and the ▾ text in §4.8 (round 1's FID-9 promise that it names every limit). D3-38 gives the alternative and how to reverse.

Tests: 3c1 (refusal; the later Formalize case passing B.3 at `final` and in the backstop) and 3e2.
