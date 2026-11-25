Short answer: telelean followed its rules here, but your decisions led into a dead end the spec doesn't handle well, and Claude's last message is now partly wrong. I only read files in `~/telelean-demos/beans` (its run `rmwt8f9y13d0531`); I changed nothing.

**What "the freeze was blocked" means**
- **Freezing:** in each step, Claude must first lock in the statements and vocabulary it proposes (`freeze_statements`). Only then may it write proof material. Freezing keeps a proof from quietly shaping the statements it proves.
- **The refusal:** every freeze was refused with this check: *"proof:we-need-to-close-the-door was proposed earlier in this session … this step's edits change what goes with it: a comment next to it now goes with another declaration."* You had **accepted** that Result in stage 1. An accepted item is fixed, and the step may not change anything attached to it, including which card comment "belongs" to which declaration. Claude's new declarations under the card blocks changed that attachment.
- **The gate:** without a freeze, the gate counted everything Claude wrote (`NeedsTo`, `us`, `close`, `theDoor`, `Does`…) as proof material. A statement may not use proof material, so attempts 1 and 2 failed for that reason. The third failure hit the cap of 3, so the step **gave up**, and telelean **rolled back Claude's working copy** to the start of stage 2.

**How you got there** (your stage-1 decisions, from the record)
- **Declined with Reject:** `WeAreClosedOn`, `WeWantToGetRobbed`, and the target's own formalization ("I want to generically model a Need to take an Action…").
- **Declined as Shaky:** `WeNeedToCloseTheDoorOn`.
- **Accepted:** `Day`, `Day.exists`, `saturday`, and the **Result** "We need to close the door on Saturdays". The Result's verdict was *not proved*, and it had no content.
- **Submitted** with the comment asking for finer granularity (agents, actions, doors).
- **Stage 2's step** could, by the rule in `review.ts` (`submitSteps`, §3.3), redo only:
  - the two premise cards;
  - the bridging premise;
  - the Shaky term.
- **Closed to it:** the target's statement (Reject isn't reopened) and its proof (an accepted Result is reopened only when Shaky or to be redone). But your rework needs a new target statement (`NeedsTo us (close theDoor) saturday`). So the request couldn't be met within that step, and Claude's attempts kept colliding with the locked Result.

**The review now** (the run is in review, stage 2)
- **Withdrawn by Claude's step:** both premise cards' formalizations. So all three cards have no Lean statement.
- **Declined:** the target's formalization, `WeAreClosedOn`, `WeWantToGetRobbed`.
- **To be redone:** the bridging premise, which no longer closes the gap.
- **In review again:** `WeNeedToCloseTheDoorOn`, marked "no alternative found".
- **Accepted:** `Day`, `Day.exists`, `saturday`, and the Result (not proved).
- **Your answers** to the two questions are kept: "avoid every consequence of being robbed", and "a fixed door, `theDoor`".

**Is it within the spec?**
- **As specified:** the freeze rule, the gate's proof-material check, the 3-attempt cap, the rollback, the "no alternative found" mark, and which items a Submit step may redo.
- **Not good, though:**
  1. **A spec gap.** Rejecting a target's formalization and then accepting its *not proved* Result leaves no path to reformalize the target in this session. The spec doesn't say Reject should block that, and nothing warns you when you accept.
  2. **A stale message.** Claude wrote its summary before the rollback. It says "The new vocabulary is in Vocabulary.lean for you to review", but the rollback removed it; Vocabulary.lean holds only `Day`, `saturday` and `WeNeedToCloseTheDoorOn`. The bridging rule in your quote was never proposed as an item.
  3. **Unconfirmed:** Claude said formalizing "We don't want to get robbed" alone set off the refusal. That card's block isn't next to the target's, so the comment-attachment rule may be catching more than it should. I haven't reproduced it.

**What you could do now** (untested on this run)
- **Most likely to work:** set the Result back to review and decline it as **Shaky**, then Submit. A Shaky Result reopens the target's proof. The target's statement may still stay closed, because it was Rejected.
- **Certain to work:** Exit and Formalize afresh with your granularity note. Claude starts with nothing locked.

**If you'd like, I can investigate** points 1–3: reproduce the refusal on this exact file with the item-computation code in a scratch copy, and say which are bugs and what fixing them would take. It's main-loop work with no subagents, roughly 0.1–0.2 M tokens.
