# refute:checks

Agent `a77accb194672fc4c` of workflow `wf_3842fba8-348`. Verbatim output (JSON alongside).

- **verdicts:**
  - [1]
    - **id:** S5-SOUND-01
    - **real:** True
    - **severity:** major
    - **reason:** Real, but the severity is overstated. The plan never says an unresolved target is held. referenceHolds says 'a referenced vocabulary declaration', and D5-9's own pattern ('nothing while c has no statement') invites a builder to skip absent targets. Nothing else stops Claude from declaring a dangling Lean name: new vocabulary is an ordinary item, and the 'claude' rendering even shows Claude '‹deleted card› [S.InGame]'. Card ids are safe, because slice 2's G5 allows new blocks only for ledger premises and the allocator avoids the registry. Lean names have no registry, though. otherSubjectRefHolds ('the declarations … of subject … at B') has the same hole. The fix is small: slice 3's heldValue already returns `absent`, and holdingMap already adds each refs.decl by heldValue, so one contract clause plus tests closes it. §3.3's 'never comes back' sentence is about card tokens, so that part of the finding overreaches. It is a fail-open, silent gap in S12/FZ-4, but it only arises when a referenced item was deleted and Claude later declares the same name. Major, not blocker.
  - [2]
    - **id:** S5-SOUND-02
    - **real:** True
    - **severity:** major
    - **reason:** Confirmed. Slice 4 §3.11 says 'no held value needs revaluing', and §3.12 says a frozen card whose reference holds a changed field 'is simply one more dependent'. Under D4-21 such a dependent must be unfrozen or deleted. Slice 5 §3.7/D5-12 instead make it a warning only, and §3.6, §2.5 and §2.6 cite a slice-4 `revalued.held` that does not exist; 'like a held name' points at nothing, because slice 4 revalues no held names. The 5d test states the intent for a held sentence, so a builder might invent a field revalue. Nothing covers held Lean names reached through #[card:c:statement] or #[lean:n], and no TransformFreeze is keyed by a Lean name. So the person's own typed change fails the transform step as `held`, against FZ-1 and FZ-3 2e. It fails closed, but the flow is common: D3-44 freezes every sentence edited on the board. The two plans contradict each other, and the integrator must decide.
  - [3]
    - **id:** S5-SOUND-03
    - **real:** True
    - **severity:** major
    - **reason:** Confirmed from the texts. heldFields takes only entries 'not revalued'. A TransformFreeze stays `{pending, text}` until the queue end (slice 4 §2.3, §3.11, D4-23), so a typed or detached referrer holds nothing during Claude's turn. transformScopeOf subtracts only keys the session freezes, so a referenced field left open can be changed (a copied sentence starts open). The queue-end held map then records Claude's version, with no finding and no FZ-5 'meaning changed' items. Scenario 2 is the sharper case: trashing c detaches A, which releases A's existing hold on d, a hold the gate enforces when there is no detach. Field holds are text only, so D4-23's reason for waiting on Lean facts does not apply to them. The path is narrow: it needs a Claude step and the referenced field open in the same window. Claude's change also still shows as its own Change item. It is nevertheless fail-open on S12.
  - [4]
    - **id:** S5-SOUND-04
    - **real:** True
    - **severity:** major
    - **reason:** Confirmed in the code. reducer.ts deletes `accepted` on a Shaky decline (decline(), ~l.480) and in cascadeShaky (~l.380). records.ts inWorkingCopy keeps a written add-premise in ws/ when it is declined Shaky or to be redone without revert, as slice 2 §3.8 also says. adoption.ts writes the Accept's Why to `rationale:`, and the ledger premise entry has no rationale field. So the person's Why token on the written card loses its only allowance ('an accepted Add premise's accepted.rationale'). §2.4 runs `reference` at step purposes with no S₀ excuse. The stage therefore gets a problem that blames Claude, and every later step not scoped to that card is refused, since step limits forbid Claude from touching it. It fails closed, but the flow is plausible: `#` in the premise Why is explicitly allowed, Shaky is a common decline, and the Shaky cascade from a vocabulary item has the same effect. The blame lands on Claude wrongly.
  - [5]
    - **id:** S5-SOUND-05
    - **real:** True
    - **severity:** major
    - **reason:** Real. §4.4 and §1.1 5f2 give `#` to every slice-4 window sentence, and slice 4 §3.12 turns all of them into the # input. That includes the premise window (D4-14), where refProblems accepts the person's token. gate/adoption.ts contains only adoptionPlan, which is the premise write path. A 5c2 'premise sentence' validator put there, mirroring 5c1's 'fail closed again at the write', refuses the person's own premise at the write. If the validator sits only in the propose_assumption handler, the written natural_name token matches no allowance. The reason: a slice-4 `premise` unit names an item, not a card field, and the plan does not map one to the other. Either way, Apply is blocked with a message that blames Claude. In the `added` branch, every later step also fails, as in S5-SOUND-04. It fails closed and the path is narrow, but it is the intersection of two features the user asked for (TRANSFORM 9 and REFERENCE SYSTEM 1), and the plan enables it explicitly.
