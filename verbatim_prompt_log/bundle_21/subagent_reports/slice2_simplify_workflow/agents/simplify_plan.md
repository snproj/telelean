# simplify:plan

Agent `a9484a54880b3afa2` of workflow `wf_62b0aec8-9f9`. Verbatim output (JSON alongside).

I've rewritten /home/zhengyew/telelean/docs/slice2-plan.md with the three AP-24 simplifications. Nothing else in the project changed: no git, build, test or network. Of the 20 round-2 findings, 4 are gone with the simplification, 16 are fixed and none is still open. The pre-edit copy is at /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/backup/slice2-plan.md.before-AP24. I checked the result: code fences are balanced, every table row has its header's column count, D2-1 to D2-69 all have entries, and no reference to removed machinery remains outside the §8 log and the withdrawn entries.

The overall slices (★D8 (a)), for the relayed question: 1 is the new board (done), 2 the review list (this plan), 3 FROZEN, 4 the transform window, 5 references. Consistency checking comes in M3.

REMOVED
- Per-Result reveal: the waiting sets pre(R), the cascade sets cas(R), the reference step, revealClosure, rule 1 for hidden Results, ItemRecord.shown and ItemRecord.reveal.
- Re-ask bookkeeping: SessionInference.asked and selectedArrows.
- Step-start mask: startHolds, shownSinceStart, the per-step start-facts.json, ResultMask/resultMask, the residual-axioms recomputation, and SessionViewInput.startFacts.
- Decisions during a step: PendingWrite and PersistedSession.pending, the after-step marker, ReviewState.running, the "Decisions made while you worked" turn, and PersistedStep.startRecords.
- Seals and reveals inside a queue: the seal at every queued step, the seal on answering Claude (the queue's own seal has the same effect), and the activity reveal of a running step.
- Smaller pieces: per-step withholding of Claude's words; the reveal lists in revealResult and openSessionDiff; `revealed` in JudgeInput and SessionCheckContext; the `completion` step kind; check 2's three hidden-source refusals; the generated twin variants (fixed proved/not-proved test pairs remain).

CHANGED
- §4.7 is now one reveal for the whole stage. A "meaning item" is a statement item or a belief item that is not a Result or part of one. Belief is judged without premise drafts, so the rule cannot loop. Show results forces all Results open and marks them seen early; the force ends when a meaning item re-enters review.
- Base mask: each target's .holds uses the base's text and facts. Proof-phase declarations, Claude's arrows and written premise cards are dropped. Every declaration unchanged since the base takes the base's facts.
- Read-only during steps: the runner refuses every review message while a step runs, except Exit.
- Queues: each queue runs to its end, records and view stay frozen meanwhile, and reconcile runs once at the end. Cancel step marks the rest of the queue "not run" and puts it in retry.
- Two class maps: `classes` (premise drafts counted) and `classesBeforeReveal` (not counted).
- Hidden Results show no status. Decisions cascade into them by their real dependencies, silently. Taking an Accept away always asks first, with a sentence that names no Result.
- Contracts (§2, §2.9): SessionView.results, SessionForce and ItemRecord.partOf; SessionAction now records every effect of an action; ItemWrite, StepState and BaseMask; the judge-apply write, viewVersion and premiseChecks; writePremise and FormalizeSession, plus signatures for computeItems, classify, itemDeps, resultsState, reconcile and the group planners.
- Rest of the plan: §3 (the engine) is rewritten, and §4.1/4.2/4.5/4.6/4.8/4.9/4.12, §5, §6.1, the §6.2 cheats, the §7.1 rows and §7.4 are updated. A dated §8 entry records all of it.

Three choices go beyond the integrator's list:
- Formalize waits for the results (D2-65). A mid-stage Formalize is refused while results are hidden. This narrows RV-9's "at any point", though Show results unblocks it.
- No status on hidden Results (D2-64). A hidden Result shows no status, and the Accept-removal warning is generic rather than naming Results.
- Reveal applies D2-23 at once. The action that shows the results also returns any accepted item whose badge grew. An Accept starts no judge, so nothing else would do it.

NEW SUB-SLICES (core ones strictly in order; 2g may run beside 2b3 and 2d–2f)
- 2a1: contracts with stubs, texts, closures, ownership (fixed at creation, a Result for every ended step, shared enclosing lines), content keys.
- 2a2: both class maps, dependencies, the stage reveal rule, reconcile, the reducer with full Undo effects.
- 2b1a: the rule helpers pulled out of evaluate(), behaviour unchanged.
- 2b1b: step limits, B.1–B.4, judgeState, the new tokens, proposeArrowProblems.
- 2b2: backstop, revert (replace-decl), start checks, planSubmit, holdAs.
- 2c1: base mask, build mask option, endorsementHash, protocol and validators.
- 2c2: buildSessionView and the host's not-yet answers.
- 2b3: type-constant probe and runner engine (judge with premise re-checks, final check, writePremise, completion, planApply).
- 2d: sessions, queues and steps (read-only during steps, statements-only steps, re-asks, Cancel/Retry/"not run", reload, run.json v2).
- 2e: review actions (decisions, judge-apply, Reject/Shaky/DO-0, Undo/Redo, Show results, Submit with take-out).
- 2f: Add premise and the end (Apply, Exit, drift, endorsements).
- 2g: review panel and session bar (webview).
- 2h: Proposed view in a session, Formalize, session Undo, retiring the old review, user guide.

DECISIONS
New:
- D2-61: one reveal per stage, with the base mask.
- D2-62: the list is read-only while any step runs (a small departure from RV-3, noted).
- D2-63: a queue runs to its end before the stage opens; Cancel drops the rest as "not run", with Retry.
- D2-64: hidden Results show no status, cascades into them are silent, and the confirmation is generic.
- D2-65: a mid-stage Formalize waits for the results.
- D2-66: rejected-repeat applies only at step purposes, to content made since the step started; every action records all its effects.
- D2-67: Apply uses M2's existing history kind accept-proposal.
- D2-68: a session's RunView leaves out `frozen`.
- D2-69: two remaining leak channels are listed as accepted residuals.

Withdrawn by AP-24:
- D2-3: decisions during a step, replaced by D2-62.
- D2-6: the step-start mask, replaced by the base mask (D2-61).
- D2-7: per-Result waiting sets, replaced by D2-61.
- D2-9: the reveal closure; Show results now shows all.
- D2-45: parts hidden with their Result, now covered by D2-61.
- D2-47: a seal at every queued step, no longer needed.
- D2-49: the cascade set and shown status, replaced by D2-64.
- D2-58: per-step withholding of Claude's words, folded into D2-10.

Revised: D2-4, D2-5, D2-8, D2-10, D2-42, D2-43, D2-44, D2-46, D2-50, D2-51, D2-52, D2-55, D2-56, D2-59.

ROUND-2 FINDINGS (recheck_round2.json)
- F1: gone. The stage rule reads the draft-free classes and leaves Result parts out, so showing results never changes what they wait for. A 2a2 test covers the case.
- F2: gone. `asked` is removed; the view shows the latest step's question, and no step for a target can run while its re-ask outcome is hidden.
- F3: fixed. A cancelled or failed step goes to retry in either mode, and Retry decides the mode again.
- F4: fixed. Actions record every effect, un-reject clears the key and arrow, and rejected-repeat is step-only. Its part (c) is gone with the activity reveal.
- F5: fixed. Shaky and to-be-redone items return to review when their Submit step ends, with "updated" or "no alternative found" as appropriate.
- F6: gone. Cascades follow real dependencies, and Submit needs the results shown.
- F7: fixed. Ownership is fixed at creation, and other-result covers every proof-phase declaration.
- F8: fixed. The judge's whole outcome is one judge-apply write, reconciled against the current records.
- F9: fixed. computeItems always emits a Result for every inference whose step ended.
- F10: fixed. Result parts are left out of the Rejected and withdrawn lists while results are hidden.
- F11: fixed. New engine.writePremise; the completion re-freezes from the adopt commit.
- F12: fixed. PremiseDraft.facts and the missing function signatures are added, FormalizeSession is defined, and the group planners are generic. Its hidden-step-facts point is gone with D2-65.
- F13: fixed. Enclosing lines are owned jointly by the items they enclose.
- F14: fixed by D2-67.
- F15: fixed. A completion is a write; its Retry is a submit step.
- F16: fixed by listing both channels as accepted residuals (D2-69).
- F17: fixed. Build times and details are dropped from the hidden view, version comes from viewVersion, and the board is published only from a converged judgement.
- F18: fixed. 2b1 and 2c are split, with fallback splits elsewhere.
- F19: fixed by D2-68.
- F20: gone. There is no shown status left to read.
