# refute:intent

Agent `a0674918de863094d` of workflow `wf_3842fba8-348`. Verbatim output (JSON alongside).

- **verdicts:**
  - [1]
    - **id:** FID5-1
    - **real:** True
    - **severity:** major
    - **reason:** The main claim holds, but the severity is lower than claimed. FZ-4 bullet 2 holds any field a frozen card references. ES-2's exceptions open only three things: additions into a target's Dependencies, a target's Proof, and empty statements at the ends of selected arrows. D5-9 and §3.6 hold nothing for #[card:c:dependencies], so the arrows into c are not protected from removal either. With Open the whole model, Claude can remove_arrow X→c (B.3, D3-11). RV-7 says 'Removing an arrow is not an RV-7 item', so a group Accept takes it, heldFields gives no key, and the backstop on F passes. For this case, §14 item 3's mechanical guarantee and the §4.6 guide sentence ('a frozen card's references hold their targets') are false. The §6.1 5d tests cover only the permissive side. The plan's 'by construction' reason explains why the exceptions stay open, not why removals go unheld. It descends from the references design's misreading (design D5-9 alternative: holding Dependencies 'would override ES-2's exceptions, which FZ-4 forbids'). The plan softened the alternative's wording but kept the narrowing, against its own 'simplest sound mechanism' rule.
Why it is not a blocker:
- Narrow-preset steps (the default) are unaffected, because the preset already fixes everything except ES-2's exceptions, and FZ-4 exempts those anyway.
- Every whole-model change still comes back as an item the person must accept before Apply.
- Lean-level holds (bullet 1) are untouched, so the effect is prose-level meaning drift.
- It is logged as a narrowing (D5-9, §9) with the correct alternative.
The empty-statement half is weak: FZ-4's own rationale says filling an empty statement 'does not change what a frozen card says'. The proposed fix is also inconsistent: by the finding's own argument, the Proof exception likewise only matters through references, yet the fix exempts proofs. It also needs care for Dependencies the person made fuzzy in a transform.
  - [2]
    - **id:** FID5-2
    - **real:** True
    - **severity:** major
    - **reason:** Confirmed. Slice 4's plan explicitly rejects a held revalue. §3.11 says 'no held value needs revaluing', and §3.12 says 'Slice 4 revalues no held value (D4-21) … a frozen card whose reference holds a field a transform changes is simply one more dependent'. A dependent frozen by a non-accepted reason is a problem ('unfreeze it … or delete it too'). The `revalued.held` that slice 5 relies on (§2.5, §2.6, §3.6 'like a held name') existed only in the slice-4 engine design (design_slice4-engine.md, lines 150 and 366) and was dropped by slice 4's integrator. The slice-5 synthesis report itself lists it as unresolved.
Why it breaks: 5c2 makes a referrer whose target changes but stays a warning only (D5-12). So A passes the TR-13 analysis, and at the transform step's judge A's heldFields expectation (B's value) gives a `held` finding against the person's own typed value:
- the two-value rule does not excuse it, because S₀ is before the typed write;
- the one-message rule does not drop it, because c's own TransformFreeze entry has no finding.
Statement and vocabulary references hold declaration names, which §3.6's 'a typed unit that changes a held field' does not cover either.
Mitigations: 5d's scope names 'slice 4's revalued', its test requires the typed change to pass, and §0 has a mapping rule, so a builder would find the gap. But a safety-relevant revalue inside the freeze check would then be designed ad hoc, and §2.6 asks slice 4 to keep a hook that slice 4 has deliberately dropped. Slice 5's behaviour is the more faithful one (FZ-1, and FZ-3's 'the frozen value becomes your version'). D5-12 already logs warning-only, but it does not say that it overrides D4-21 and §3.12, and it specifies no revalue.
  - [3]
    - **id:** FID5-3
    - **real:** True
    - **severity:** minor
    - **reason:** Mostly refuted. The user asked for a system 'similar to Github's', and GitHub's editor shows the raw form with a rendered preview, which is exactly D5-5. D5-5 is a logged decision with an alternative and a reversal. The design weighed contenteditable chips and rejected them as fragile (caret, IME, undo). The live 'Shows as:' line shows the chip with the target's current name the moment a pick is inserted, so RF-1's 'shown as a chip' and RF-2 (c) are met in substance. A broken token is not silent: the preview drops the chip at once, the card face then shows the raw text, Undo restores it, and it is the person's own edit, which FZ-1 always allows. GitHub's own raw form is more fragile: editing #123 into #12 silently points at another issue. The proposed contenteditable replacement is a preference, not a defect. What survives is minor:
- §9's RF-1 (b) row does not record D5-5 as a narrowing;
- the stale slug in the editor after a rewording is an unstated cost of D5-3 and D5-5;
- refusing a malformed '#[card:' or '#[lean:' at commit would be a cheap hardening.
  - [4]
    - **id:** FID5-4
    - **real:** True
    - **severity:** minor
    - **reason:** Both halves hold, but at low severity.
(1) D5-7 is disclosed as a narrowing (§9 RF-2 (d), the D5-18 residual 'a docstring may keep an older name'), but it gives no reason. The references design recommended re-mirroring outside sessions (open question 8: 'Recommended: yes, outside sessions only'), and §7.1 drops that silently. Outside sessions, freezes bind only Claude (FZ-1) and F1 already makes follow-on edits in the same Undo step, so the reversal's caveat is no obstacle. Stale names then show in the expanded card's Lean code (build.ts lean.code spans the declaration from its docstring), in hovers, and in the files and tool results Claude reads, which conflicts with I2.
(2) Today's normalise forces an exact D-9 mirror (an escapeBodyText comparison) on statements new in the run. Switching it to isMirrorOf, as §3.4 and the 5c1 tests imply, lets Claude put any ‹…› text in place of a token. This loosening is unlogged.
Minor because docstrings carry no Lean meaning, the mirror is part of the statement item's text that the person reviews (classify.ts and backstop.ts count it as the abbrev's text), the `reference` rule still refuses tokens in docstrings, and half (1) is already disclosed. Fix (2) needs care: 'keep normalise exact' could rewrite the docstring of a new statement the person has own-frozen, if a referenced sentence changed after the freeze.
