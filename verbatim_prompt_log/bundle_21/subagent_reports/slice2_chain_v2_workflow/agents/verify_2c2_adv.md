# verify:2c2:adv

Agent `a70399a97c3538338` of workflow `wf_ae5f1188-533`. Verbatim output (JSON alongside).

- **summary:** Overall, 2c2 holds up under the adversarial lens. I found and confirmed (by probe) three major problems: two in 2c2's own code and one in 2a2 that the builder had already reported.

What holds, read against the code:
- While the results are hidden, each Result is a neutral row, and Results' parts are left out of the list, counts, board, rejected list and withdrawn list.
- Listed items never name a hidden item in their dependencies, dependents, redo.because or events.
- Claude's words, outcomes, chips and notes appear only when the results are shown and no step runs.
- The hidden board is masked, has no positions, and its summary reads only the masked facts.
- Gates match the reducer (itemGates runs on one Work, read-only).
- The R2-1 carry-over is fixed. The host still answers not-yet.
- Tests I ran: view.test.ts 43 passed; judge, reducer, reconcile and mask tests 265 passed.

The three major problems:
1. **Re-ask outcome visible mid-queue (2c2).** While a queue runs with the results shown (always so for a mid-stage Formalize), the InferenceView reads the question on record. D2-46 puts a proved re-ask's new question on the record when its step ends. So the next step of the same queue shows whether the re-ask was proved, before the queue ends.
2. **Taken-out Result reads "established" (2c2).** A Result the judge took out because it no longer passes its checks still shows "established", with its proof, from its record's judged field, while the event and the report say otherwise.
3. **Hidden-or-shown state tells the outcome (2a2's reconcile, the builder's F1).** I reproduced F1 independently.

Minor items and test gaps:
- At stage 0 the view trusts the runner to pass B.
- A misattributed reason chip.
- A source the user declined out of a question (D2-59) is still listed while the results are hidden.
- The non-interference test drives one fixed sequence, where §6.1 asks for every sequence.
- No test checks that Un-reject is closed outside a stage.
- A "passed its checks" wording nit.

Probes: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2c2-adv/probe/probe.test.ts (it imports the repo's sources and does not write to them); logs probe_run1.log to probe_run3.log in the same folder.

Effects outside the repo and my scratch folder: my core vitest runs briefly created and deleted vite's bundled config in packages/core/node_modules/.vite-temp, which is empty again. No repository file was written, and there were no git writes, network use, installs or real Claude.
- **findings:**
  - [1]
    - **id:** V2C2-ADV-1
    - **severity:** major
    - **where:** packages/core/src/review/view.ts:675 (questionOf; used by the InferenceViews at 1132-1142, the Result detail's question at 864, the list-order sources at 729; the RunView's premises are filled from these InferenceViews, AF5)
    - **problem:** Outcome leak while a queue runs with the results shown:
- While a step runs (phase step or interrupted) and the results were shown when the queue started, `questionOf` returns the question on record. A mid-stage Formalize always starts with the results shown (D2-65).
- D2-46 keeps a re-asked target's old question on the record "until the new step ends with a proof". The later steps' judgements need the new question, so 2d will put it on the record when the proved step ends, mid-queue.
- During the next step of the same queue, the InferenceView, the Result detail's question and the RunView's premises then show the new question if the re-ask proved T and the old one if not.
- So the outcome shows before the queue ends and before the new stage's meaning items are decided. This breaks D2-63/§3.1 Q ("the view stays as it was when the queue started") and §4.7.
- No test catches it: the "while a step runs" test never looks at `inferences`, and no twin pair runs in phase step with the results shown.
    - **fix:** While a step runs, use the asked question too, which does not depend on the outcome:
`const questionOf = (inf) => ((!shown || running) ? latestEnded.get(inf.target)?.question : undefined) ?? inf.question;`
The notes are already suppressed while running.

Add a twin test that asserts byte-identical SessionView JSON:
- phase 'step', results forced at the queue start;
- steps: s1 (T), s2 (T's re-ask, passed, queue 2), s3 (U, running, queue 2);
- the twins differ only in whether the record's question was replaced.

Add a §8 note for 2d: the RunView inherits this rule.
    - **evidence:** Probe P1 (probe_run1.log), phase 'step', results.shown true:
- proved twin's InferenceView question: [cynder-dark-past, pg-no-dark-past];
- not-proved twin's: [cynder-dark-past, new-spyro-pg, pg-no-dark-past];
- the views differ.

Plan sources: D2-46 at plan line 2727, and fixer 2b1b r1 at 3217 ("which a proved re-ask puts on the record").
  - [2]
    - **id:** V2C2-ADV-2
    - **severity:** major
    - **where:** packages/core/src/review/view.ts:869-891 (resultDetail: `j` only when inWorkingCopy; `verdict = j?.verdict ?? r.judged?.verdict`; restsOn from judged; proof from content)
    - **problem:** Misleading green verdict on a Result telelean took out:
- For a Result to be redone with its content taken out (`redo.reverted`), the shown detail reads verdict and Rests on from the record's `judged`, and shows its proof.
- When the judge takes a Result out because its inference no longer passes (B.1, B.2 or footprint), reconcile first sets `judged` from that very failing judgement (reconcile.ts:312-323), then takes it out (385-391, no marker).
- The detail then reads "established" with the proof, while the event says "No longer pass their checks, so telelean took them out to be redone:" and the stage report says not proved.
- A no-longer-builds take-out keeps its last good verdict (a partial judgement skips noteJudged).
- After DO-0 on an arrow the proof used, the detail reads established, resting on the declined source.
- This is lens (g); §3.8 asks that such outcomes never read as proved.
    - **fix:** Read `judged` only for a Result the user declined (status declined, not reverted before the decline).

For a reverted Result:
- read verdict, band, Rests on, flags and missing from the stage judgement's inference for the target (what ws/ holds: B's version);
- leave `proof` out, or show it only as the earlier version.

Add a test with P6's setup: reconcile with a judgement where T has `passes: false`, then judge again on B's version. The detail's verdict must be the stage judgement's, never 'established'.
    - **evidence:** Probe P6 (probe_run2.log):
- the Result: status to-be-redone, markers [], detail verdict 'established', proof 'Spyro.cynder_not_good.holds';
- report verdict: 'not-proved';
- events: ["No longer pass their checks, so telelean took them out to be redone:", …].

Probe P2 (a Result reverted by a cascade): detail 'established' with its restsOn, report 'not-proved'.
  - [3]
    - **id:** V2C2-ADV-3
    - **severity:** major
    - **where:** packages/core/src/review/reconcile.ts:434-441 (endsForce; 2a2's code, the builder's F1, reported but not fixed)
    - **problem:** I confirmed F1 independently: whether the stage is hidden tells a re-ask's outcome.
- Setup: the user forced Show results while a Formalize item is still in review, then ran a mid-stage re-ask.
- If the re-ask proves T, the Result's new content ends the force and the stage is hidden.
- If it does not, the force stays and the new outcome is shown.
- With the force kept, every Result (a new target's in the same queue included) also gets seen-early in one twin only. That marker difference persists even once both twins are hidden.
- §4.7's fixed pairs compare two hidden views, so they cannot see this.
    - **fix:** Have reconcile end the user's force (`via` other than 'decided') at every queue's end (`queueSteps` given), as the builder proposes, and update §4.7's force rule.

Add a reconcile-level twin test: forced, an undecided Formalize, a re-ask queue ending proved vs not proved. Assert the same `forced` and `results.shown`, and identical views.
    - **evidence:** Probe P4 (probe_run1.log):
- proved: forced undefined, shown false;
- not proved: forced {via: 'show-result'}, shown true.
  - [4]
    - **id:** V2C2-ADV-4
    - **severity:** minor
    - **where:** packages/core/src/review/view.ts:645-653 (with 635-637)
    - **problem:** With no judgement (stage 0, the first queue), there are no items, so `shown` is true. The board is then `input.current` unmasked, and every report target reads `revealed: true`.
- This is safe only if 2d passes B, as the builder's §8 decision asks.
- If 2d passes the head or any later state, the proof of a step that ended in the first queue appears on the board while the next step runs.
- The report also says 'revealed' while Claude still works.
    - **fix:** When `judgement === null`, build the board from `input.base`: nothing else can be shown before the first stage. Report the targets as not revealed during the first queue.

Add a test with a non-B `current` at stage 0.
    - **evidence:** Probe P3: current = a proved state, judgement null → the target's board status.proof is 'proved', and report.targets is [{target, revealed: true}].
  - [5]
    - **id:** V2C2-ADV-5
    - **severity:** minor
    - **where:** packages/core/src/review/view.ts:828-834 (reasonChipOf)
    - **problem:** The reason chip comes from the target's latest ended step, even when that step's version did not stand.
- Example: an earlier honest not-proved Result stands, and a later re-ask gave up (or ran statements only).
- The standing Result then gets "Claude's step did not finish" (or "“L” was not proved").
- Next to it, the note says "your earlier result stands": the reason given belongs to an outcome that is not the one shown.
    - **fix:** Take the chip from the latest ended step whose question (less D2-59's removals) equals the record's question: the step whose version stands. That is the comparison the re-ask note already makes. Add a test.
    - **evidence:** Probe P7 (probe_run3.log): verdict not-proved; chip "Claude's step did not finish"; notes ["The new question for “Cynder would not be a good addition to the new Spyro game” was not proved: your earlier result stands."].
  - [6]
    - **id:** V2C2-ADV-6
    - **severity:** minor
    - **where:** packages/core/src/review/view.ts:675 (with 1168-1180)
    - **problem:** While the results are hidden, the InferenceView still lists a source the user took out of the question by declining its arrow (D2-59). The latest ended step asked it, and the hidden rule shows that step's question unchanged. The same applies to the Result detail's question and, through AF5, the RunView's premises. The user's own decision is undone in the display.
    - **fix:** While hidden (and while running, with ADV-1's fix), subtract the done stack's D2-59 removals (`removedFromQuestion`) from the asked question. They are the user's own decisions, made while the results were shown, so the subtraction reveals no outcome. Add a test.
    - **evidence:** Probe P8: results.shown false; question [cynder-dark-past, new-spyro-pg, pg-no-dark-past]; record [cynder-dark-past, pg-no-dark-past].
  - [7]
    - **id:** V2C2-ADV-7
    - **severity:** minor
    - **where:** packages/core/test/review/view.test.ts:1410-1462
    - **problem:** Test gap. §6.1 asks that "every sequence of decisions on listed items run through reduceReview (Accept, Reject, Shaky, DO-0, Undo)" give identical views and outcomes. The test drives one fixed 7-action sequence on one pair. It never:
- un-rejects (D2-60's returning dependents);
- sets an item back to review;
- Redoes;
- sends a decision that takes an Accept away without `confirmed` (D2-64's hiddenResults dialog). Its Undos always pass `confirmed: true`.

Most of its actions are refused or no-ops: the first Accept and the group Accept take nothing.
    - **fix:** Add a seeded random-sequence twin test, for example 40 seeds × 12 actions, over the listed items of each fixed pair (at least proof/none, Claude's arrow, and the Retry pair).
- Mix own and group Accept, Reject, Shaky with a note, back to review (un-reject included), and Undo and Redo, with and without `confirmed`.
- Compare `answer(outcome)` at every step, and the views whenever either twin is hidden.
  - [8]
    - **id:** V2C2-ADV-8
    - **severity:** minor
    - **where:** packages/core/src/review/view.ts:1244 (rejected[].unreject: phaseGate); tests view.test.ts:522-547, 650-658, 675-717
    - **problem:** Test gap: nothing tests that Un-reject in "Rejected in this session" is closed outside a stage.
- No test has a declined item in phase step, interrupted, confirming or applying.
- The running test lists only items in review, and the confirmation tests assert `.confirmation`, never `.rejected`.
- Dropping `phaseGate` at line 1244 would leave Un-reject open while Claude's step runs (D2-62) or in the confirmation, and no test would fail. This mutation is not among the builder's 104.
    - **fix:** Add a declined (Reject) item to the "while a step runs" test and to the confirming/applying loop. Assert that `view.rejected[0].unreject` equals the phase's closure: D2-62's text, "Back to review first.", or applyingNow.
    - **evidence:** Probe P5 shows the code is right today ({ok:false, reason: D2-62's text} in step; "Back to review first." in confirming). A grep of view.test.ts finds no `rejected` assertion in any non-stage phase.
  - [9]
    - **id:** V2C2-ADV-9
    - **severity:** nit
    - **where:** packages/core/src/review/texts.ts:499 (stepPassed); view.ts:1149-1152
    - **problem:** "Claude's step passed its checks" is the outcome of every passed step, including an honest not-proved finish. In the stage report, next to a not-proved target, it reads like a green.
    - **fix:** Say what ended, for example "Claude's step ended: “T” proved" or "Claude's step ended without a proof", taken from the verdict of the version that step left (see ADV-5). Otherwise use a neutral "Claude's step finished".
- **checks_run:**
  - Read verify_common.md, brief 2c2.md and builder_rules.md; read the plan: §0, §1/1.1, §2.2-2.9, §3.1-3.13, §4.1-4.9, §5.1-5.13, §6.1 (2c2) and §6.2, and the §8 entries for builder 2c2, fixer 2c1 r2 and builder 2c1
  - Diffed the builder's pre-2c2 originals (scratch b2c2/orig) against reducer.ts, types.ts, texts.ts, index.ts, boardSession.ts, judge.test.ts and runRouting.test.ts: acceptGateIn is a pure extraction, index and host unchanged
  - Read view.ts in full, plus records.ts, reveal.ts, mask.ts (baseMask, maskFacts, maskedModel), the reducer's itemGates and acceptGateIn, reconcile.ts (force, judged, takeOut, events) and judge.ts resultOf
  - Traced non-interference field by field: hidden rows, parts, counts, marks, arrows, premises, rejected, withdrawn, events, gates, labels, list order, steps, report, board summary, undo/redo
  - Ran core view.test.ts (capped, --no-cache, scratch TMPDIR/fsmc): 43 passed
  - Ran core judge, reducer, reconcile and mask tests: 4 files, 265 passed
  - Scratch probes P1-P8, importing the repo's sources with no repo writes (logs probe_run1-3.log): P1 mid-queue question leak; P2/P6 reverted Result reads established; P3 stage-0 unmasked current; P4 F1 confirmed; P5 unreject closure correct but untested; P7 misattributed chip; P8 D2-59 source listed while hidden
  - Grepped for the old R2-1 message text (none left) and checked that no repository file changed (find -newer), and that node_modules/.vite-temp is empty
