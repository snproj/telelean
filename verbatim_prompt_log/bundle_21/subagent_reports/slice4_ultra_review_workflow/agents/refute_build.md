# refute:build

Agent `a3e6702499af3da10` of workflow `wf_67531371-ae0`. Verbatim output (JSON alongside).

- **verdicts:**
  - [1]
    - **id:** IMP-1
    - **real:** True
    - **severity:** minor
    - **reason:** The contradiction is real. §0 says 4a–4f run 'strictly in order, nothing beside them' and then 'may run beside 4b–4f', and the table repeats it. Slice 2's §0 rule, inherited via 'the rules of slices 1–3 hold unchanged', forbids any sub-slice beside a core change. Slice 3 slotted its runner-only 3p strictly between 3a and 3b. Runner tsconfig `paths` and the vitest alias both resolve @telelean/core to core/src/index.ts, so core work in flux does break 4g's tsc and vitest. Severity is overstated: the scratchpad chain script builds sub-slices one at a time ('You are the only agent writing code right now'). The cost is at worst wasted builder runs, not a product defect, and the fix is one line.
  - [2]
    - **id:** IMP-2
    - **real:** True
    - **severity:** major
    - **reason:** Confirmed:
- No webview file references ProjectModel, and the host sends the webview only TlGraph and SessionView.
- AnalyseInput.model is required, and TR-13's proof, statement and definition dependents need declFacts (usersOf, reach). A graph's verified and lean-ref edges cannot reproduce them.
- §7.1 rejects a check message, and §2.5 adds no host→webview message. TransformWindowView carries only `submit: Gate`. ActionOutcome.transform has no kinds, warnings or touched, and arrives only after Submit.

So the live 'Before you submit' panel, `expect` and the OutcomeLine are unimplementable as written. One correction: a wrong `expect` costs a confirmation round trip (`confirmed.outcome` exists), not a permanent bounce.
  - [3]
    - **id:** IMP-3
    - **real:** False
    - **severity:** nit
    - **reason:** Refuted. The host forwarded the validated draft itself in submitTransform's payload (`{ runId, window, rev, draft, expect }`). §2.6 defines `keys` as every card:/vocab: key of the draft, so they can be derived. The label comes from core's transformLabel, the subject is the board's, and ActionOutcome.transform.outcome says 'direct'. The host can build the apply-transform action exactly, and nothing is lost. The planner also re-runs the analysis on the board model and fails closed. Only wording remains: 'with the board action' (§3.6) and 'from the runner's answer' (§2.6) should say the host builds the action from the request it forwarded.
  - [4]
    - **id:** IMP-4
    - **real:** True
    - **severity:** major
    - **reason:** Holds against built code:
- validateContext (runner gate/engine.ts:125) requires `selection.target` and the premises array, and checkBase and normalise read `run.p.selection`.
- Slice 2's N1 rule takes the selection from 'the active step's or the first inference's', which does not exist in a transform-started session. RunView.target and PersistedRun.selection are required.
- In core review/items.ts, a transform step passed as `active` has no freeze, so its new declarations get phase 'proof' (L741). Non-theorems then go to `own(acc(proofKey(active.target),'result'))` (L942), a phantom `proof:transform:<id>` Result.
- After the step, `created` entries resolve their target through stepTarget, which is built only from inferences' steps plus the active step (L705–708). They come out `unowned`, and the backstop's own computeItems call (backstop.ts:120) would refuse them too.

The plan states intent only ('phase statements', 'an Add, no inference'). Core closes after 4f, so 4h would have to stop.
  - [5]
    - **id:** IMP-5
    - **real:** True
    - **severity:** major
    - **reason:** Slice 3 put the tools' ledger writes, `worded_by` and the fuzzy-statement pins in core gate/normalise.ts (3c1). The `card` entry renders 'a PROPOSITION block'. Slice 4's §3.9 step 4 needs three new behaviours there:
- AXIOM blocks, for AXIOM slots and for axioms Claude adds;
- pins from TransformScope.open, since fuzzyStatements is empty for transform steps;
- `worded_by: agent` only for Claude's sentence changes. S₀ comes before the typed write, so a slice-3 rule that compares with S₀ would mark the person's typed sentence as Claude's wording. That breaks CF-6 and G5, and the typed unit would no longer own the line.

No core sub-slice lists normalise.ts, and 4h/4i may not touch core. The runner could choose the pinned nodeIds itself, but the block kind and the worded_by rule are core.
  - [6]
    - **id:** IMP-6
    - **real:** True
    - **severity:** major
    - **reason:** Slice 3's FreezeDelta is `Record<key, { cleared, own }>`, and slice 4 adds only `startCleared`. §3.11 says a TransformFreeze ends by Unfreeze, yet nothing records the removed one.
- An Undo of that Unfreeze cannot restore the lock: a silent unfreeze, the class of problem slice 3's R2-2 was about.
- If the key also had a standing reason, the Undo restores that reason expecting B's value while ws/ holds the typed text, so `violates` refuses the Undo.
- 4e's tests cover startCleared's Undo only.

The missing pending-text variant in FreezeTableEntry.expect is the smaller half, since 4e owns table.ts.
  - [7]
    - **id:** IMP-7
    - **real:** True
    - **severity:** minor
    - **reason:** The finding's main path is wrong. Slice 2 §3.6 says 'Shaky: nothing leaves ws/', and dependents become to-be-redone with `reverted: false`. A written premise stays in ws/ while to-be-redone without revert, so the Shaky-like cascade takes nothing out. Real gaps remain:
- an accepted statement dependent made undecided ends Show results' force;
- drop-transform returns its sources to review, which also ends the force;
- a queue-transform that decides the last undecided meaning items shows the results with D2-23's returns, which can take out a written premise.

slice 2's decide and reveal actions record endedForce, startedForce, takenOut and commits for exactly these effects. The 'transform' action has none of them, and its outcome no write. These are edge cases with fail-safe outcomes (results hidden more; the backstop refuses leftovers), but the fields should be added.
  - [8]
    - **id:** IMP-8
    - **real:** True
    - **severity:** major
    - **reason:** The key form is missing. DraftKey and transformDraft() allow only card:, vocab: and new:, and an unwritten Add premise has no card id. planTypedWrite takes no window mode, so a `new:<n>` key would write a new card block instead of the `premise` TypedUnit. The validator also requires `kind` on axiom and proposition cards, which a premise card has no chooser for. 4a's tests include no premise window, so the hole reaches 4i/4l. One sub-claim is refuted: draftFromModel can reach the PremiseDraft through its `drafts` input (ItemContent.premise).
  - [9]
    - **id:** IMP-9
    - **real:** True
    - **severity:** major
    - **reason:** The conflict sits on the main Decline → Transform path for a target's Formalize item.
- **Results shown:** a target with a proved Result is a copied proposition with a proof, so it gets `proof: 'keep'`, locked by D4-19. Changing its statement hits D4-20 with no way to clear the proof.
- **Results hidden:** the masked copy has no proof, so the transform queues. At Submit review the real-state re-analysis sees the kept proof, or the stale rule's 'copied value differs from original' fires. It 'needs a new look'; Edit… meets D4-20 again, and only Drop remains.

§3.4's last bullet and §3.8's 'new targets in reworkResults need no choice' show the intended behaviour, but neither D4-20 nor the stale rule has the exemption.
  - [10]
    - **id:** IMP-10
    - **real:** True
    - **severity:** major
    - **reason:** The rule contradicts the spec for direct transforms.
- TR-13 offers 'rewrite' and 'delete too' for frozen dependents, and FZ-1 says freezes bind only Claude. §3.4 itself gives frozen dependents 'rewrite' and 'broken' in direct context, but then makes 'a dependent frozen by any other reason' an unconditional problem.
- In a provisional session every card outside the window carries `session-start`. Almost every direct transform with outside dependents is therefore blocked until each dependent is unfrozen, for a session that ends at once.
- The planner's `frozen` input is unspecified. PlanContext.freezes holds the standing records, not the session's startCleared or standingCleared flags. A standing-frozen dependent unfrozen in the window can still make the dry run refuse, with nothing in the window able to lift it.
  - [11]
    - **id:** IMP-11
    - **real:** True
    - **severity:** major
    - **reason:** `mustDefine` comes only from the scratch (§2.1). §3.3 runs the scratch only at Submit transform. §3.8 re-analyses at Submit review without saying where a scratch comes from, yet marks a transform stale when its needs-Claude reasons change. A queue-claude transform whose reason is 'Claude must define: …' loses that reason when re-analysed without a scratch, so it is stale every time. That breaks D4-7's path, and 4h's own test of it would fail after core has closed. The second half is a smaller gap 4f can close itself: `planSubmit({records, judgement})` has no models, so it cannot compute stale transforms or the 'touched' part of the cascade without an added input such as `analyses`.
  - [12]
    - **id:** IMP-12
    - **real:** True
    - **severity:** major
    - **reason:** §3.9 commits step-start with the StepScope first; for a queue's first step that is in the queue-start write. The typed write that gives new cards their ids comes after it. transformScopeOf(t, a, sessionFrozen) has no model, reserved set or ids, and FreezeKeys need real card ids. So a new card with a typed sentence and a fuzzy statement, which is TR-4's default, cannot be in `open`. Normalise will not pin it, and the step limits will not recognise Claude's statement. analyseTransform's typedKeys for new cards have the same problem. No listed 4e or 4h test covers this case.
  - [13]
    - **id:** IMP-13
    - **real:** True
    - **severity:** minor
    - **reason:** Both gaps are real.
- **Unattributed errors:** a failed import or header error lands on no typed line, and the plan does not say what happens, so the check can pass vacuously. This is reachable only where B does not build, which means the provisional or direct path. Stage windows run on a locked B that already passed checkBase.
- **Wider context:** the scratch sees every module, with typed names in draft order. The destination is narrower: Inbox imports only Vocabulary, Vocabulary.lean imports nothing, and order within a module matters. So a direct transform can write Lean that does not build.

Severity is overstated. TR-12 (a) still guards S10's soundness (single term, shape rule, no Prop axiom). In a session the step's build catches the failure, and a bad direct write is one board Undo away. This is a robustness gap.
  - [14]
    - **id:** IMP-14
    - **real:** True
    - **severity:** major
    - **reason:** The gap is real, though it shows up somewhere other than the finding says. §2.8's `no-proofs` forbids any `.holds` by Claude in a transform step ('no theorem and no .holds, but telelean's own'). telelean writes `axiom n.holds` only for typed statements (§3.5 steps 1 and 4). So an AXIOM card whose statement Claude fills ends one of two ways:
- without a `.holds`, giving TL117 ('proofs cannot use it');
- or, if Claude writes the `.holds` under slice 2's allowance 4, failing `no-proofs` at the step rather than at Apply.

This covers AXIOM slots, axioms Claude adds, and fuzzy statements of axiom cards, which is TR-4's default for new cards. The backstop sentence would also refuse it. The intermediate-readers half is mostly covered: the plan says the card entry is 'an Add, no inference', and 4e owns freeze/tools.ts, where intermediateInferences lives. Only mask.ts is unlisted.
  - [15]
    - **id:** IMP-15
    - **real:** True
    - **severity:** major
    - **reason:** Confirmed against slice 3 §3.7. A typed item's Reject reverts its units, while every typed key holds a TransformFreeze expecting the typed value. frozenChangesOf lists those keys, but the dialog's `unfreeze` drops only standing and own reasons, and `yours` revalues only own freezes to base. Whichever the person picks, the next judge reports the TransformFreeze mismatch and Apply waits until a manual Unfreeze. A cascade that withdraws a typed item does the same, for example rejecting Claude's vocabulary that a typed statement uses (D4-7's path). Slice 3 requires 'no stage problem after it' for the analogous R2-4 case. The plan never says how a TransformFreeze ends on Reject or withdrawal. It is recoverable, but it hits every Reject of a typed item.
