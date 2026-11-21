# verify:2d:adv

Agent `a2d66c9c317783a41` of workflow `wf_4dd05c42-199`. Verbatim output (JSON alongside).

- **summary:** Adversarial-safety review of builder 2d (sessions, queues and steps), read-only for the repo. All work ran in a scratch mirror at /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2d-adv/mrepo, with probes and mutations there only; nothing was written into the repo or its node_modules.

What holds:
- The carry-overs are done. R1-1: a real-Lean test of complete on a decision head that also changes another card. R1-2: §3.8 and §6.1 rewritten. R1-3: toHaveBeenCalledTimes(2).
- The baseline of the four session test files passes: 46 of 46.
- A12's equivalence holds on the whole posted views. A probe compared the full SessionView and RunView of a statements-only run against a proved run, with times and counts scrubbed: they are equal.
- The builder's mutation list mostly holds. Of my extra mutations, the Cancel-step guard (V01) and the "question replaced only with a proof" rule (V12) are caught.

Four major problems, three of them confirmed by probes:
1. **F1: a cancelled target loses its new question.** When a target's earlier step was cancelled, a mid-stage Formalize of it keeps the old question. The stage judge then reverts the proof Claude made under the new question, and the old question is shown.
2. **F2: the v1 conversion loses its written cards on a reload.** These cards are kept only in memory, so a reload during the conversion's first judge creates the adopted ghost's item without `card`. That defeats AF12: once 2e/2f route Accept, a "pending" Accept leaves an AXIOM card in place.
3. **F3: a re-ask without a proof leaves a definition behind.** A proof-phase definition that one of the step's premise drafts reaches (its own D2-42 item) stays in ws/ while its ledger entry is dropped. The result is an unowned difference that disables Apply for the rest of the session.
4. **F4: two internal-error paths at a queue's end fail open.** A failed view build keeps the previous SessionView, which then decides both the RunView's withholding (Claude's activity leaked, probe-confirmed) and D2-65. A judge that throws opens the stage on the previous judgement (code reading, not probed).

Minors:
- F5 (probe-confirmed): Resume after a step whose turn never reached Claude sends the generic resume turn, and retry reports a success.
- F6: these rules have no test: the idle() waits (V07, V08), propose_arrow after finish (V20), Cancel while a question waits (V31), and the judge's take-out of a written premise (V36).
- F7 (latent for 2e): the queue-start replay rebuilds retried and submit steps from default scopes.
- F8 (latent for 2e): recovery re-applies a queue end's F5 rule.

One nit (F9): the give-up notice can name another step's commit, and §8's description of R1-1's test is wrong.
- **findings:**
  - [1]
    - **id:** F1
    - **severity:** major
    - **where:** packages/runner/src/run/session.ts:1249-1252 (finishQueueStart skips a target that already has an inference) and :996, :1012-1015 (endStep replaces the question only when `reask && proved`; `reask` needs an earlier ENDED step of T)
    - **problem:** §3.2 says: "A target whose step never ended has no Result, and is asked as new." The scenario:
- T's only step was cancelled or failed, so it is in `retry` and has no Result.
- A mid-stage Formalize of T with question Q2 then runs a step whose StepScope asks Q2. The gate judges the proof with Q2 (core judge.ts:243).

The inference still holds the cancelled step's Q1:
- finishQueueStart skips T because an inference for it exists.
- endStep never replaces the question, because no earlier step of T ended.

The stage judge then judges T's proof against Q1:
- A proof resting on a Q2 source fails B.2, and reconcile takes the Result out (to be redone, reverted); the judge-apply's `decision` commit removes T.holds from ws/.
- Once the results are shown, the InferenceView and the RunView's `inferences` show Q1, the question the person replaced.

So the person's new question is silently dropped, and a proof that passed its own gate is reverted.
    - **fix:** In finishQueueStart (which its replay also uses): when a requested target already has an inference but none of its steps ended (every step cancelled, failed or not-run, so it has no Result), replace that inference's `question` with the request's `{ sources, fromNothing }`. Keep today's behaviour when an ended step exists (a re-ask, D2-46).

Add the probe as a regression test:
1. Cancel T's first step (Q1 = [new-spyro-pg]).
2. Mid-stage Formalize T with Q2 = [cynder-dark-past], with a proof using cynder_dark_past.holds.
3. Expect:
   - `session.inferences[0].question` equal to Q2;
   - the Result in review, not to be redone;
   - the InferenceView's question equal to Q2 once the results are shown.
    - **evidence:** Probe: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2d-adv/mrepo/packages/runner/test/run/zzprobe.question.test.ts. Log: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2d-adv/logs/probe-question.log.

It prints:
- steps: s1 cancelled with {sources:[new-spyro-pg]}; s2 passed with {sources:[cynder-dark-past]};
- inferences: question {"sources":["new-spyro-pg"]};
- items: ["proof:cynder-not-good","to-be-redone",{"reverted":true}];
- view inferences: ["cynder-not-good",["new-spyro-pg"]], with results shown: true.

The assertion that the inference's question equals Q2 fails.
  - [2]
    - **id:** F2
    - **severity:** major
    - **where:** packages/runner/src/run/manager.ts:782 (convertLegacy passes `writtenCards` only to an in-memory judgeHead call); packages/runner/src/run/session.ts:1649-1665 (recovery reruns the judge without writtenCards); session.ts:1486-1489 (the only place a record's `card` is set)
    - **problem:** AF12: a converted v1 run's adopted ghost must be a written Add premise item in review, with `card` set, accepted only as an axiom and never written again. The card is set only by the conversion's first judge-apply, from an option held in memory.

If the window reloads while that first judge runs (a full Lean build of the converted state), recovery reruns the judge without writtenCards. The same happens if that judge throws: the stage opens without it, and a later judge creates the records. The record is then created with no `card`, although its AXIOM card is in ws/ and its ledger `premise` entry exists.

From there, the AF12 rules no longer apply:
- core's "accept it as an axiom" refusal is keyed on `r.card` (reducer.ts:681), so an Accept with holdAs 'pending' is taken;
- that Accept makes a premise write due (reducer.ts:729), which 2f's due check skips because the ledger already holds the premise entry;
- the AXIOM card stays, and Apply writes an axiom the person chose to hold as pending (A26);
- a decline does not take the card out either (reducer.ts:436 keys the take-out on `card`), so Apply stays refused.
    - **fix:** Make the conversion's cards durable. Either:
- in every judge-apply, set `card` on an add-premise record that lacks it, from the ledger `premise` entry whose `item` is the record's key; or
- persist writtenCards in PersistedSession until a judge-apply has applied them.

Add the probe as a test: a reload during the conversion's first judge keeps `card`. Once 2e routes Accept, also test that a 'pending' Accept of it is refused.
    - **evidence:** Probe: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2d-adv/mrepo/packages/runner/test/run/zzprobe.legacy.test.ts. Log: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2d-adv/logs/probe-legacy.log.

It replays the existing AF12 conversion, with the first manager's judge hanging and dispose() called mid-judge, then recover() in a second manager. Results:
- the item premise:cynder-not-good:not_in_game_not_good is in-review with card null;
- the ledger still holds {kind:'premise', card:'a-character-who-cannot-be-in', …};
- the assertion that the item's `card` equals plan.nodeId fails.
  - [3]
    - **id:** F3
    - **severity:** major
    - **where:** packages/runner/src/run/session.ts:1075 (takeBackReask's `take` covers only proof:<T> and the step's arrow items) and :1003-1004 (endStep then drops the step's proof-phase `created` entries and its drafts)
    - **problem:** D2-46: a re-ask that ends without a proof takes its proof material, arrows and premise drafts back to S₀.

A proof-phase definition that one of the step's premise drafts reaches is not proof material. It is its own `decl:` item, part of T's Result (D2-42: the `created` entry carries `draft`; core items.ts:934-940). takeBackReask reverts only the Result and the arrow items, so that definition stays in ws/, while endStep drops its `created` entry and the draft.

The next judge reports an unowned difference, which disables Apply for the rest of the session (§4.2). No item can take it out, so Exit is the only way out, and every decision is lost.
    - **fix:** In takeBackReask, also revert every draft that is part of T's Result and was created by this step: `d.partOfResult === step.target && d.origin?.step === step.id` (the D2-42 `decl:` items whose `created` entry is the step's). A broader option: revert every draft whose declarations are all among the step's proof-phase `created` names. Add the probe as a test.
    - **evidence:** Probe: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2d-adv/mrepo/packages/runner/test/run/zzprobe.reask.test.ts. Log: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2d-adv/logs/probe-reask.log.

Setup:
- queue 1 proves cynder-not-good;
- a mid-stage re-ask from [new-spyro-pg] freezes, writes `def helper_xyz : Prop := HasDarkPast cynder`, proposes a premise whose statement uses helper_xyz, and finishes not_proved;
- as the real engine does, the gate's check carries a model with facts and the ghost check returns the statement's facts.

After the queue:
- ws/ still contains helper_xyz;
- the ledger's `created` entries lack it;
- premises are [];
- judged.problems = ["Spyro.helper_xyz changed, but no review item covers it."].
  - [4]
    - **id:** F4
    - **severity:** major
    - **where:** packages/runner/src/run/session.ts:393-396 (buildView's catch returns the previous rt.view); :429 (sessionRunView withholds on view.results.shown); :1302 and :1326 (D2-65's resultsShown read from the same view); :1449-1454 (openStageWithoutJudgement)
    - **problem:** When buildSessionView throws, buildView logs the error and returns the previous SessionView, which is then both posted and used for safety decisions.

At a queue's end, the previous view is one built during the queue (for example results shown, when the stage before had none hidden). As a result:
- the RunView's `activity` and `notices` are no longer withheld (D2-10, AF9), although the records say the results are hidden;
- a mid-stage Formalize's D2-65 check reads `resultsShown: true`.

Related: a judge that throws at a later queue's end opens the stage on the previous stage judgement and records, because rt.judgement, rt.judgedModel and s.judged are not cleared. §8 decided instead that such a stage opens "without a judgement, so nothing can be accepted". The environment notice is itself withheld while the results are hidden.

The trigger is an internal error, but the effect is RV-6 failing open.
    - **fix:** Fail closed.
- Keep a flag that the last view build failed (or treat the view as null for these uses). While it is set, withhold activity and notices, refuse a mid-stage Formalize with a clear text, and show the error.
- In openStageWithoutJudgement, clear rt.judgement and rt.judgedModel and mark `judged` stale, so nothing reads the old judgement as the stage's.

Tests:
- the probe;
- a judge that throws at a second queue's end leaves the view with no judgement and Apply unreachable.
    - **evidence:** Probe: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2d-adv/mrepo/packages/runner/test/run/zzprobe.staleview.test.ts. Log: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2d-adv/logs/probe-staleview.log.

Core's buildSessionView is mocked to throw from the retried step's gate on. Results:
- the records say the results are hidden (the formalize item is undecided, one item waiting);
- the stale view says shown: true;
- RunView.activity contains "SECRET-ASSISTANT-WORDS: I proved it with cynder_dark_past.holds" and "The checks passed (attempt 1).".

The judge-throw path is from code reading (not probed).
  - [5]
    - **id:** F5
    - **severity:** minor
    - **where:** packages/runner/src/run/session.ts:728-732 (startStep ignores continueSession's failure) and :1227-1228 (startQueue answers ok); packages/runner/src/run/manager.ts resumeNow (sends resumeTurn)
    - **problem:** `--resume` can fail at a step's start: on Retry step after Cancel step closed Claude's process, or on Resume of a queue waiting between steps.

What happens then:
- continueSession marks the run interrupted, but startStep has already made the step running at its S₀;
- the call still answers ok, "Claude is working on …";
- Resume sends M2's generic resume turn ("…the person's editor reloaded… Continue the run from where you were.");
- the step's own turn (target, question, open and fixed limits, A12 mode) never reaches Claude.

Claude works blind, and the step is wasted. It is fail-closed, because the gate keeps the scope.
    - **fix:** When the session cannot be opened at a step's start:
- persist the step's turn as undelivered (like `undeliveredAnswers`), and have Resume send it;
- return the refusal from startStep, so retry, formalize and resume answer it instead of a success label.

Test: the probe.
    - **evidence:** Probe: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2d-adv/mrepo/packages/runner/test/run/zzprobe.resume.test.ts. Log: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2d-adv/logs/probe-resume.log.

Results:
- retry answered {"ok":true,"label":"Claude is working on “The new Spyro game excludes Cynder”"} while the state was interrupted;
- the turns sent after Resume were the generic resume turn, then the nudge;
- "Step 1 of 1: formalize and prove “link-two”" was never sent.
  - [6]
    - **id:** F6
    - **severity:** minor
    - **where:** packages/runner/src/run/session.ts:1182 and :1322 (idle() before Retry and before a mid-stage Formalize); :892 (assertCanAct in propose_arrow); :1126-1127 (failStep clears a waiting question); :1500-1506 (judge-apply's take-out of a written premise)
    - **problem:** These key rules have no test. With each line removed, every session test still passes (V07, V08, V20, V31, V36). Two of them matter for safety:
- **idle()** is the only guard against a judge's Lean job still running when a queue's S₀ is committed. judgeApply checks only the head, so a judge started before the queue (for example recovery's) can apply on S₀ mid-step. It then changes the records during the queue (D2-63) and writes its reverts into ws/ while Claude works.
- **assertCanAct in propose_arrow**: without it, a propose_arrow after a passing finish adds an undrawn ledger arrow to a passed step.

Note for 2e: judges are coalesced, and rt.judging is false during a finished judge's final save, so idle() can return while a queued judge waits.
    - **fix:** Add tests:
1. After a reload in a stage whose judged-facts.json is stale, block the fake judge and call retry. Expect no step-start commit and no step turn until the judge is released, and the judge-apply recorded before the queue-start (s.judged.commit is the parent of the queue's S₀). Do the same for a mid-stage Formalize.
2. finish(proved), then propose_arrow in the same turn: the tool errors, and the ledger is unchanged.
3. Cancel step while Claude waits for an answer: no pending question in run.json or the RunView.
4. A converted written premise that the judge takes out: its premise and mark-removed ledger entries are dropped, its card cleared, its key back to the draft's.

Also count queued judges in `judging`.
    - **evidence:** File: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2d-adv/mutation-results.jsonl. Each mutant was restored and checked with cmp.
- V07 and V08: "Tests 46 passed (46)".
- V20 (also with toolServer): "Tests 56 passed (56)".
- V31 (also with lifecycle): "55 passed | 1 skipped".
- V36: "46 passed".
- Control mutants V01 (Cancel-step guard) and V12 (question replaced without a proof) were caught.
  - [7]
    - **id:** F7
    - **severity:** minor
    - **where:** packages/runner/src/run/session.ts:1670-1693 (replaySteps)
    - **problem:** This is latent until 2e. retryNow builds a retried step as `{ ...old.scope, step }`. A replay of the same queue-start (a crash between its step 1 and step 4) instead rebuilds a formalize default scope (`openProof: true`, `openItems: []`), while startStep keeps a submit step's `scope.openProof` and `openItems`. A replayed retried Submit step would therefore:
- open the proof of a Result that may be accepted;
- fix its Shaky items so they cannot be reworked.

A queue-start with `by: 'submit'` (no `inferences` in the write) would be replayed with target ''.
    - **fix:** - Replay from the old scope and kind (`{ ...old.scope, step: id }`).
- Record in the queue-start write what a replay needs for every `by`: each step's kind, target and scope.
- Refuse a replay that cannot rebuild a step, instead of inventing one.

Test: a crash after step 1 of a Retry queue-start for a step with a non-default scope; the replayed scope equals the one retryNow builds.
    - **evidence:** Code reading: compare retryNow at session.ts:1186-1201 with replaySteps at :1674-1691.
  - [8]
    - **id:** F8
    - **severity:** minor
    - **where:** packages/runner/src/run/session.ts:1649-1659 (recovery passes the queue's steps as queueSteps whenever the phase is step and the queue is empty)
    - **problem:** This is latent until 2e. judgeLoop passes `queueSteps` only to the first judge-apply of a queue's end, and the stage opens in a later round.

A crash between those rounds leaves the phase at `step` with the first round's records already written. Recovery then passes queueSteps again, so reconcile's F5 rule runs a second time. That rule returns Submit steps' Shaky and to-be-redone items to review (core reconcile.ts:158-170), so it can return a Result that the first round took out (to be redone, reverted).
    - **fix:** Persist that the queue-end reconcile ran, for example `queueEndApplied: <queue number>` set in that judge-apply's step 4. On recovery, pass queueSteps only when it has not run, and keep endsQueue so the stage still opens.
    - **evidence:** Code reading: judgeLoop at session.ts:1424-1432 resets queueSteps after the first applied or reverted round, and recovery at :1657 rebuilds it from the queue's steps.
  - [9]
    - **id:** F9
    - **severity:** nit
    - **where:** packages/runner/src/run/step.ts, toolFinish's give-up branch (`run.shadow.lastCommit(PASSING_COMMIT_KINDS)`); docs/slice2-plan.md §8, builder 2d's R1-1 line
    - **problem:** - In a session, the give-up notice names the newest gate-pass, freeze or base commit of the whole shadow, for example an earlier step's "Checks passed (round 1, attempt 1)". The real rollback goes to this step's S₀, a step-start commit, which is not in PASSING_COMMIT_KINDS. stepReverted's own notice is correct.
- §8, and the builder's report, say R1-1's decision commit "rewords the premise's doc comment". The test actually rewords new-spyro-pg's docstring, which is another card.
    - **fix:** - In a session, take the label from `lastCommitSince(step.startCommit, ['gate-pass', 'freeze', 'step-start'])`.
- Correct the sentence in §8.
- **checks_run:**
  - Read verify_common.md, brief 2d.md, builder_rules.md; slice2-plan §0, §1/§1.1, §2.4-§2.9, §3.1-§3.13, §6.1 (2d list), §8 (builder 2d entry, carry-overs)
  - Read runner session.ts (all), legacy.ts, manager.ts (session routing, recover, convertLegacy, cancel/resume/discard), step.ts (round loop, tools, finish, freeze, continueSession), persist.ts diff, systemPrompt.ts diff; extension boardSession.ts and runs.ts diffs; relevant core code (reconcile, records.inWorkingCopy, items.ts ownership, judge.ts questions, gate proof-before-freeze, planAddArrows, view.ts gave-up chip)
  - Verified the carry-overs: R1-1 test at test/gate/session.test.ts:1283; R1-3 assertion at :1173; R1-2 plan text at §3.8 lines 1693 and 1699, §6.1 line 2570
  - Built a scratch mirror (core and runner) at /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2d-adv/mrepo, with node_modules symlinked
  - Baseline in the mirror, the four session test files: 'Test Files 4 passed (4) / Tests 46 passed (46)'
  - Probe zzprobe.question: failed, so F1 is confirmed
  - Probe zzprobe.a12, A12 equivalence on the whole SessionView and RunView: passed
  - Probe zzprobe.legacy: failed, so F2 is confirmed
  - Probe zzprobe.reask: failed, so F3 is confirmed
  - Probe zzprobe.staleview: failed, so F4 is confirmed
  - Probe zzprobe.resume: failed, so F5 is confirmed
  - Mutations in the mirror, each restored and checked with cmp: V01 (Cancel-step guard) caught by manager.lifecycle; V12 (question replaced without a proof) caught by session.views; survivors V07 (formalize idle), V08 (retry idle), V20 (propose_arrow canAct), V31 (Cancel clears a waiting question), V36 (judge-apply's premise take-out)
  - Ran every vitest through capped.sh 3000 with one worker, --no-cache, fsModuleCachePath and TMPDIR/TELELEAN_TEST_TMP in the scratch dir, and TELELEAN_NO_REAL_CLAUDE=1; MemAvailable stayed above 21 GB
  - Confirmed no writes into the repo or its node_modules since the mirror was made: find -newer printed nothing; git status shows no new files of mine
