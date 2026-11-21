# reverify:2b1a:r1

Agent `a5f91fc8e366e4500` of workflow `wf_ae5f1188-533`. Verbatim output (JSON alongside).

- **summary:** Fix round 1 of 2b1a holds up: all 13 findings are resolved. The RV-7 group (C-V2B1A-C1, A-ADV-2b1a-1, S-F2) is fixed by having `listedAcceptRefusal` read RV-7's badges and "blocked" in the class in force both when the Undo is asked and after it (`now && after`). The takenOut group (C-V2B1A-C2, A-ADV-2b1a-2, S-F1, C-V2B1A-C3) is fixed by Undo writing a taken-out premise again only when it restores that premise's change to a state that keeps it in ws/, read from `c.before`; the contract now says step 4 records only premises written when the write started. The doc and test findings (S-F3, S-F4, A-ADV-2b1a-3, C-V2B1A-C4) are fixed too. With the pre-fix reducer, 4 of the 7 new tests fail. I reproduced all 12 of the fixer's mutations on a scratch copy, and every one is caught. The first-round probes now show the fixed behaviour. The only probe still failing expected byte-identical answers; in copy X, D2-23 returns D at the show, exactly as a by-hand Accept does, and `taken` matches. All five typechecks are clean; core 783, webview 313 and extension 203 tests pass. New problems: one minor and two nits. (1) A single request that un-rejects V and then declines W, or the premise itself, still leaves a written premise's card and ledger entries, and a declaration's content, in ws/ while they are reverted or declined. The fixer found this but left it undecided, and its new §4.6 property sentence claims the opposite. A post-pass fix passes all review tests on a scratch copy. (2) The fixer's claim that no judge can leave a taken-out premise to be redone within a stage is false (RV-3 can); the code is right. (3) The new random premise property writes premise cards whether or not the reducer scheduled the write. My runs changed nothing in the repo.
- **resolved:**
  - [1]
    - **id:** C-V2B1A-C1
    - **how:** Fixed. `listedAcceptRefusal` (reducer.ts:1041-1065) now reads `blockedBy` and `classOf` with `inForce = now && after`. An Undo asked while hidden that shows the results reads `classesBeforeReveal`; its existing `showResults` then applies D2-23 with `classes`, as by hand. The test 'an Undo asked while the results are hidden that would show them…' covers own and group Accepts, D decided or a dependent, and the by-hand comparison. It fails with the pre-fix reducer and under M5, M7 and M8. The comment and §8 l.2918/2919/2950 are annotated.
  - [2]
    - **id:** A-ADV-2b1a-1
    - **how:** Fixed by the same `now && after` change. Probe 1/1b now goes through in both copies with the results shown; copy X gets D2-23's 'badges grew' return of D, the same as a by-hand group Accept. M5 (`inForce = after`) is caught by the new pair test. §8's fixer 2a hidden-items line and builder 2b1a's S-V2A-S2 entry are corrected.
  - [3]
    - **id:** S-F2
    - **how:** Fixed by the same change. The finding's 'byte-identical answers' conflicted with its own fix text (the show returns the item with an event, as decide does). The fixer rightly kept D2-23's event at the show. X and Y agree on refusal, label, `taken` and the results being shown, and copy X matches by hand. This also holds for the earlier verifier's rv7leak probe output.
  - [4]
    - **id:** C-V2B1A-C2
    - **how:** Fixed. The takenOut loop (reducer.ts:1169-1178) now requires `c !== undefined && !skipped.has(r.id) && inWorkingCopy(r.kind, r, t.card, c.before)`. A premise in review counts as written only if it was in review before the action (the ghost). The Show results and back-to-review variants are tested, the probes (revealundo, more (a)) now leave p in review with no card and premises.takeOut [p], and M4 (no `from`) is caught by the RV-5-return test.
  - [5]
    - **id:** A-ADV-2b1a-2
    - **how:** Fixed by the same condition. Probes 2, 3, 4, 4b and 5 behave correctly on the current code. Probe 4's pending Accept is now refused for its real reason (a dependency), not 'already written'. The ghost case (probe 5) is kept as a test. The suggested random check exists: a World simulation over 400 sequences, whose agreement check catches M1 ('seed 69 step 25: a written premise has a status that keeps it in ws/ (in-review)').
  - [6]
    - **id:** S-F1
    - **how:** Fixed. The Undo of an un-reject leaves the premise exactly as before the un-reject in the four ways of keeping it out, under the new §2.2 rule (the R1-1 take-out is not recorded in takenOut) and with a recorded entry, and the Redo takes it out again. M2 (no change check) is caught.
  - [7]
    - **id:** C-V2B1A-C3
    - **how:** Fixed. The new contract (types.ts SessionAction.takenOut and ItemWrite, plan §2.2/§2.9) says step 4 records only premises written when the write started, so `takenOut` is what the commits took out. It also defines a take-out as removing whatever of the premise is in ws/ (idempotent). Under §2.2 the Undo's write in the test is exactly {action 3, revert [V], reapply [], takeOut []}.
  - [8]
    - **id:** S-F3
    - **how:** Fixed (docs). The ItemWrite.premises.takeOut field doc and the ItemWrite comment (types.ts:452-500, plan §2.9) now cover R1-1's kept-out premises, planned from the record's card, and the Undo's untaken ones, planned from the entry's card. They also say how the runner finds the declining action (the stack action whose `commits` hold the item's `decline.commit`), which matches what `mergedBackBy` reads.
  - [9]
    - **id:** S-F4
    - **how:** Fixed (tests). The random run now asserts that no cascade or event entry is a Result or a Result's part, for every action asked while hidden or that hides the results (Show results excepted). Mutations M9-M12 of the answer rule, in decide and Undo, are each caught (2, 4, 4 and 2 failures).
  - [10]
    - **id:** A-ADV-2b1a-3
    - **how:** Fixed (tests). Probe 6 and an Undo variant are now in 'an action asked while the results are shown that hides them names no Result…'. `listed = shown` in decide (M9) and in Undo (M10) both fail tests.
  - [11]
    - **id:** C-V2B1A-C4
    - **how:** Fixed. The test is renamed to the helpers it checks (not proved, not frozen, readiness cards, status mismatch, proof before the freeze, statement changed without a freeze), and the body matches the new title. The file header no longer claims every helper is checked.
- **findings:**
  - [1]
    - **id:** R1-F1
    - **severity:** minor
    - **where:** packages/core/src/review/reducer.ts:550-591 (backToReview's un-reject loop decides premisesBack / keepOut from the statuses at that moment) with :855-860 (decide applies declines and backs to review in the order sent); docs/slice2-plan.md:1758 (§4.6 Properties, fixer's new sentence) and :3009 (§8 'Seen, not fixed (outside the findings), for the orchestrator')
    - **problem:** A single decide request that un-rejects V and then declines an item that keeps V's merged-back content out leaves ws/ inconsistent. The item can be W, which the premise also rests on, or the premise p itself. V's un-reject sees W still accepted, so p comes back: it is written again (`reapply`, card and written key back on its record, ledger entries put back), and a declaration X that comes back is not put in `revert`. The Reject that follows in the same request then reverts or declines p and X, but nothing takes them out. p's card and ledger entries stay in ws/ with no Accept standing, and X's content stays while it is reverted. The other order is correct.

This is inside the reducer's contract: builder 2a2 accepted mixed requests, rejecting the alternative 'refuse mixed or partial decisions outright'. The webview never sends one (§5.7). The next judge does not repair it, because reconcile's `reverts` catch only a premise whose status moves from in to out during that judge.

The fixer found this, but logged it 'for the orchestrator' with two options and no decision, which goes against the autopilot rule. Its new §4.6 sentence ('after any sequence of actions … its record holds exactly the card in ws/ … only while its status keeps it there') is false for it. The random run cannot see it, since it sends only single decisions and all-Accept groups.
    - **evidence:** Scratch probe /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/rv2b1ar1/probes/mixed2.test.ts (output in rv2b1ar1/probe_mixed2.log). p is written and rests on V and W; V's Reject took p out (takenOut recorded).
- [un-reject V, reject W]: p {to-be-redone, reverted, card 'p-card', fp written}, write {revert [W], reapply [V, p], premises.takeOut []}.
- [reject W, un-reject V]: write {revert [W], reapply [V], premises.takeOut [p]} (correct).
- [un-reject V, reject p]: p {declined, card 'p-card'}, write {reapply [V, p], takeOut []}.

The fixer's own probe: X {to-be-redone, reverted}, write revert [W] only.
    - **fix:** Decide where an un-reject's merged-back items go only after every decline and back to review of the request is applied:
- Record each un-reject's candidates in Work.
- After decide's declines-and-backs loop, move a premise whose final status keeps it out from `premisesBack` to `premisesOut`. Its record keeps the card for the take-out and its pre-merge key; deferring the card/key assignment avoids a Reject in the same request rejecting the written key.
- Put any other merged-back item whose status keeps it out in `keepOut`.

I tried a minimal post-pass on a scratch copy (a `mergedBack` set filled in the loop, then this check after the loop). It keeps all 176 review tests green and makes all three orders give {revert [W], reapply [V], premises.takeOut [p]}; the fixer's probe also gets X in `revert`.

Then:
- Add a reducer test pairing [un-reject V, reject W] with [reject W, un-reject V] and [un-reject V, reject p].
- Add one such mixed request to the World property's actions.
- Replace the §8 'Seen, not fixed' paragraph with the decision.
  - [2]
    - **id:** R1-F2
    - **severity:** nit
    - **where:** docs/slice2-plan.md:2999 (fixer 2b1a r1 decided: '…No judge can leave a taken-out premise so within a stage (its draft key changes only at a queue's end)'); packages/core/test/review/reducer.test.ts:1324 ('no judge does that within a stage, so this pins the rule'); fixer report ('M3 … guard states no code path produces today')
    - **problem:** The claim is false. reconcile's RV-3 (reconcile.ts:415-424) also runs on `updated` items within a stage, and `mark` sets every in-review dependent to be redone without revert. Suppose something a taken-out premise rests on gets a new key during the stage and rests on a Shaky or to-be-redone item. The judge then leaves the premise (in review, no card) to be redone with `reverted: false`, which is the state the M3 test builds by hand with `set`.

The code's rule (`skipped` → premises.takeOut, the premise left unwritten) handles this correctly; only the justification is wrong. It invites a later builder to drop the `skipped` check as dead code.
    - **evidence:** Scratch probe /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/rv2b1ar1/probes/rv3.test.ts. reconcile is called with no queueSteps:
- vocab:S declined Shaky;
- decl:D accepted, its draft key changed, resting on S;
- premise:t:p in review, no card, resting on D.

Result: problems []; D {to-be-redone, reverted:false}; p {to-be-redone, because [D], reverted:false}.
    - **fix:** Reword the §8 sentence and the test comment: a judge reaches this state through RV-3, when an item the premise rests on gets a new key and rests on a Shaky or to-be-redone item, and the Undo then leaves the premise unwritten. Optionally build the test state with reconcile instead of `set`.
  - [3]
    - **id:** R1-F3
    - **severity:** nit
    - **where:** packages/core/test/review/reducer.test.ts:1635-1641 (carryOut's 'The premise write that is due') in 'ws/ and the Add premise’s record agree after every step, each write carried out as §2.9 says…'
    - **problem:** The simulation writes a fresh card for any accepted premise that has none, whether or not the reducer scheduled that write in `premises.write`. So it does not carry out writes 'as §2.9 says'. A reducer that never schedules premise writes passes the property. So does an Undo that never puts a taken-out card back and lets a fresh write replace it (the V2A-S3 / AF2 regression): it passes every per-step agreement check, and the property fails only because its `undoneBack` path counter stays 0.
    - **evidence:** Scratch mutations, each restored, logs in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/rv2b1ar1/mut/:
- X1 drops `write.premises.write.push(id)` in writeOf: 2 failed, both older tests; the World property passes.
- X2 makes the takenOut loop never restore: the World property's only failure is 'undoneBack: expected 0 to be greater than 0'.
    - **fix:** In carryOut, write the card only when `outcome.write?.premises.write` includes P. In `agree`, require that an accepted premise holds a card once its step has been carried out. In the Undo branch, when P is in the undone action's takenOut and ends accepted, expect `reapply` to contain P and no premise write for it (AF2).
- **checks_run:**
  - tsc --noEmit (capped.sh 1800, TMPDIR in my scratch): core tsconfig.test.json, runner tsconfig.test.json, webview tsconfig.json, webview tsconfig.node.json, extension tsconfig.json: all exit 0, no output
  - vitest core (--no-cache --fsModuleCachePath=<scratch>/fsmc --maxWorkers=1): 'Test Files  65 passed (65)', 'Tests  783 passed (783)'
  - vitest webview: 'Test Files  19 passed (19)', 'Tests  313 passed (313)'
  - vitest extension (--no-cache): 'Test Files  22 passed (22)', 'Tests  203 passed (203)'
  - Diffs of the 5 changed files against the fixer's backup; before.diff vs after.diff differ in exactly those 5 files; HEAD 187673d, nothing staged
  - Scratch copy of packages/core (rv2b1ar1/tl, fixtures symlinked; the repo was never edited): test/review baseline 9 files, 176 tests pass
  - Pre-fix reducer.ts (backup) against the current reducer.test.ts: 'Tests 4 failed | 58 passed (62)' (RV-7 pair, RV-5 return, un-reject Undo, silent premise)
  - Mutations on the scratch copy, each restored byte for byte and checked with cmp, failing tests in parentheses: M1 old takenOut condition (4, the World property through its agreement check), M2 (1), M3 (1), M4 (1), M5 inForce=after (1), M6 inForce=now (5), M7 (1), M8 (1), M9 (2), M10 (4), M11 (4), M12 (2)
  - Extra mutations: X1 no premise-write scheduling (2 fail; World property passes); X2 Undo never restores (7 fail; World property only through its undoneBack counter)
  - First-round probes (v2b1a-adv probes 1b, 2-6; v2b1a-code more, revealundo, rv7leak; fixer's mixed) against the current code: 12/14 pass; rv7leak's 2 fail only on its byte-identical expectation (copy X's D2-23 event, the same as by hand)
  - New probes: probes/mixed2.test.ts (three request orders), probes/rv3.test.ts (RV-3 within a stage); candidate post-pass fix on the scratch copy: test/review 9 files, 176 tests pass, mixed orders consistent; scratch reducer restored and cmp-identical to the repo
  - Read classify.ts (factsMissing comes from the draft, the same in both class maps: the fixer's claim holds) and reconcile.ts (premise re-checks revert; RV-3 marks dependents in review without revert; `reverts` only catch in-to-out transitions)
  - Runner tests not run: no runner, extension or webview source imports the review reducer (grep)
  - Side effects outside my scratch dir: Vite briefly used the existing .vite-temp folders under the repo root, packages/core and packages/webview node_modules (all empty again); capped.sh made transient systemd user scopes; nothing newer in packages/extension/out or dist; .git/index unchanged; no processes left running
