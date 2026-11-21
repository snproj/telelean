# verify:2b1a:code

Agent `a96696db6dedfb062` of workflow `wf_ae5f1188-533`. Verbatim output (JSON alongside).

- **summary:** I reviewed 2b1a against the 2a patch (after_slice_2a.patch). Only the 8 files the builder lists changed. The refactor is sound. Two of the carry-over fixes still have real defects, both in Undo.

**Refactor (gate/rules.ts):** confirmed equivalent.
- Code lines are verbatim apart from the restructuring.
- A TypeScript-AST check found no helper that reads a module-level or global name the old closure did not. Every closure variable shared between rules is carried over: `facts`, the G1 findings (now `buildFailed`), `ready` and `footprints`.
- I built my own differential harness against the 2a `rules.ts`. It compares by JSON text and by deep strict equality, and I first confirmed it catches a change in key order only.
- Results: 295 core calls and 192 runner real-Lean calls, all identical. These match the builder's 221 + 74 and 192.

**Builder's verification:** every claim reproduced (summary lines in checks_run).

**Carry-overs:**
- R1-1 (normal case), R1-3, R1-4 and R1-5 behave as described.
- **S-V2A-S2 is not complete (major).** Take an Undo asked while the results are hidden, which would show them. It still checks a listed restored Accept's RV-7 badges against `classes`, which include the hidden premise drafts. In one copy the Undo is refused with "Definition D needs its own Accept (belief)" and the results stay hidden. In a copy without that hidden draft the same Undo succeeds. By hand, the same Accepts are not refused (D2-73).
- **R1-2's Undo path is broken (major).** It now also serves Show results, and it writes a Claude-drafted premise back while the premise stays in review. The record gets its card and written key back and the premise is listed in `reapply`, so it is written in ws/ with no Accept standing. The same happens for a back-to-review cascade (already there in 2a).
- **Minor:** the Undo of an un-reject asks the runner to take out a premise card that the inversion has already removed.
- **Nit:** one test title claims more than the test checks.

**Fixes tried (scratch only):** I applied the fixes for C1 and C2 to a scratch copy of `reducer.ts`.
- Core still passes: 65 files, 776 tests.
- The two premise probes now pass.
- The RV-7 probe is no longer refused: both copies show the results. Copy X also has D2-23 return D, which is what doing it by hand gives.

**Effects outside the repo and my scratch dir:**
- I wrote nothing in the repo and nothing to extension out or dist.
- Nothing went to any `node_modules/.vite-temp` (I used `--configLoader runner`) or to `.vitest-cache`.
- `TMPDIR` and `TELELEAN_TEST_TMP` pointed into my scratch dir; `rtmp` is empty again.
- `capped.sh` created transient systemd scopes, which ended with each job.
- My one read-only `git status` may have refreshed `.git/index`. A later change to the `.git` folder's timestamp (21:57) came from another session's git command, not from me.
- No processes of mine are left running.

**Where things are**, all under `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2b1a-code/`:
- probes: `probe/rv7leak.probe.test.ts`, `probe/revealundo.probe.test.ts`, `probe/more.probe.test.ts`
- harness: `diff/`
- fixed reducer copy: `fix/reducer.ts`
- logs: `logs/`
- **checks_run:**
  - Diff isolated: after_slice_2a.patch vs a new snapshot (snapdiff.sh). Changed: docs/slice2-plan.md, core gate/rules.ts, review/reducer.ts, review/types.ts, test/gate/ruleHelpers.test.ts (new), review/reconcile.test.ts, review/reducer.test.ts, review/reveal.test.ts. The 2a state was rebuilt from the patch.
  - Static check of the refactor: code-line multiset diff, plus a TypeScript-AST pass over the free identifiers of each helper vs the old evaluate closure. No helper reads a module or global name the closure did not; cross-section closure variables are all carried (facts, findings->buildFailed, ready, footprints).
  - tsc --noEmit -p tsconfig.test.json (core): exit 0, no output
  - tsc --noEmit -p tsconfig.test.json (runner): exit 0, no output
  - tsc --noEmit -p tsconfig.json (webview): exit 0, no output; -p tsconfig.node.json: exit 0, no output
  - tsc --noEmit -p tsconfig.json (extension): exit 0, no output
  - vitest core (--configLoader runner --no-cache --fsModuleCachePath=<scratch>/fsmc --maxWorkers=1): 'Test Files  65 passed (65)', 'Tests  776 passed (776)'
  - vitest webview: 'Test Files  19 passed (19)', 'Tests  313 passed (313)'
  - vitest extension (--no-cache): 'Test Files  22 passed (22)', 'Tests  203 passed (203)'; nothing written to extension out/ or dist/
  - runner, own config, real Lean (capped 3000, timeout 900), test/gate/rules.test.ts + test/gate/engine.test.ts: 'Test Files  2 passed (2)', 'Tests  56 passed (56)'
  - My own differential harness (every evaluate call also runs after_slice_2a's rules.ts; compared by JSON text and node:util isDeepStrictEqual). Sanity check: a key-order-only change in the old copy made 5 tests fail.
  - Differential, core all: 'Test Files  65 passed (65)', 'Tests  776 passed (776)'; 295 evaluate calls compared (221 in the existing gate suites + 74 in ruleHelpers), all identical
  - Differential, runner real Lean: rules.test.ts 'Tests  26 passed (26)' (32 calls); fresh.e2e 'Tests  9 passed (9)' (43); m2flow 'Tests  5 passed (5)' (23); walkthrough.e2e 'Tests  22 passed (22)' (94). 192 calls, all identical
  - Probe rv7leak.probe.test.ts (scratch): Undo asked while hidden that would show the results. Copy X: {ok:false, refused, 'Definition D needs its own Accept (belief)'}. Copy Y: ok, results shown. By hand in copy X: Accept D ok, then Accept m ok with D2-23 returning D. Same for own and group.
  - Probe revealundo.probe.test.ts (scratch): Undo of Show results keeps premise p in review silently and gives it {card:'p-card', fingerprint:'fp:written-p'}, write reapply [p]. Probe more.probe.test.ts (a): the decide variant does the same. (b): Undo of an un-reject lists p in premises.takeOut with no card.
  - Proposed fixes on a scratch copy of reducer.ts, swapped in by a vitest alias: core 'Test Files  65 passed (65)', 'Tests  776 passed (776)'; the revealundo and more probes pass; rv7leak no longer refused (both copies ok with the results shown; copy X has D2-23's return of D, as by hand)
  - Reviewed the builder's mutation log (22 review mutations, 31 gate). Each mutation is caught as reported; R1-5's survives, as the builder expected.
- **findings:**
  - [1]
    - **id:** V2B1A-C1
    - **severity:** major
    - **where:** packages/core/src/review/reducer.ts:1038 and :1051 (listedAcceptRefusal: blockedBy(w, r, after), w.classOf(r, after)); comment at :1118-1122; docs/slice2-plan.md §8 l.2888 ('a listed item gets the refusal an Accept by hand would get') and l.2924
    - **problem:** Carry-over S-V2A-S2 is not complete. Take an Undo asked while the results are hidden, which would show them. It checks a listed restored Accept's RV-7 badges, and blockedBy, against `classes`, which holds every premise draft (part of a hidden Result). The refusal leaves the results hidden, and whether it comes depends on a hidden premise draft; the text even names the belief badge that only the drafts give. This breaks D2-64/RV-6 and the brief's rule that a refusal must never depend on a hidden Result. It also breaks D2-73: by hand, the same Accepts are not refused (an Accept while hidden records classesBeforeReveal's badges, and D2-23 returns the item once the results are shown). The code comment and §8 claim that no answer depends on an item hidden now; this case shows otherwise.
    - **evidence:** Scratch probe rv7leak.probe.test.ts. Setup: card:m (formalize) and decl:D (definition) accepted, plus proof:t; one action sends both back to review, which hides the results. Copy X: a judge sets classes[decl:D]=BELIEF only (classesBeforeReveal stays PLAIN). Undo in X -> {"ok":false,"code":"refused","error":"Definition D needs its own Accept (belief)"}. Undo in Y (no such draft) -> ok, results shown. By hand in X: Accept D -> ok; then Accept m -> ok, cascade [D -> in-review 'it now needs its own Accept']. Same for a restored own and a restored group Accept.
    - **fix:** In listedAcceptRefusal, read blockedBy and the RV-7 class with `now && after`, i.e. classesBeforeReveal whenever the results are hidden at the request or after. When the Undo shows the results, the existing `showResults(w, at)` (D2-23) then returns the item, as by hand. On a scratch copy this keeps all 776 core tests green, and in the probe both copies answer ok with the results shown (copy X has D2-23's return of D). Add the probe's pair as a reducer test. Correct the comment and the §8 lines (l.2888, l.2924).
  - [2]
    - **id:** V2B1A-C2
    - **severity:** major
    - **where:** packages/core/src/review/reducer.ts:1157-1164 (Undo's takenOut loop: `if (inWorkingCopy(r.kind, r, t.card))`). Reached since R1-2 from Show results actions; the same path already existed for decide actions in 2a.
    - **problem:** Setup: the undone action returned an accepted written premise to review (Show results' D2-23 returns since R1-2, or a back-to-review cascade), and its write took the premise out. Then a judge changed something, so the Undo's silent path keeps the hidden premise in review. The takenOut loop then calls inWorkingCopy without `from`. That returns true for any in-review record given a card (the converted-v1-ghost rule). So the reducer puts the card and written key back on a record that is in review and lists it in `reapply`. The runner then inverts the take-out and puts the ledger entries back. Result: Claude's premise is written in ws/ (axiom, arrow into T, mark removed) with no Accept standing, which breaks §3.8 ('in ws/ only once written'). It also limits a later Accept of it to 'axiom' (writtenAsAxiom refuses 'pending').
    - **evidence:** Scratch probe revealundo.probe.test.ts. Setup: card:z in review; decl:E accepted (group), BELIEF in classes and PLAIN before reveal; written premise p rests on E. Show results returns E and p; the write takes p out (step 4 recorded). A judge then makes p also rest on card:z. Undo -> p {"status":"in-review","card":"p-card","fingerprint":"fp:written-p"}, write {"reapply":[p],"premises":{"write":[],"takeOut":[]}}. more.probe.test.ts (a): a back-to-review of card:m that cascaded p behaves the same.
    - **fix:** Decide 'written after the Undo' from the state the action changed the premise from: `inWorkingCopy(r.kind, r, t.card, top.changes.find((c) => c.item === r.id)?.before)`. Then an in-review premise counts as written only if it was in review and written before the action (a converted v1 ghost); otherwise it goes to premisesOut and the write takes it out again. On a scratch copy: p stays in review with no card and is in premises.takeOut, and all 776 core tests pass. Add reducer tests for the Show results and back-to-review variants.
  - [3]
    - **id:** V2B1A-C3
    - **severity:** minor
    - **where:** packages/core/src/review/reducer.ts:581-587 (R1-1's premises.takeOut path in un-reject) with :1157-1164 (Undo's takenOut loop); review/types.ts ItemWrite comment ('premises.takeOut the written premises it brings back that must go out again')
    - **problem:** R1-1 makes an un-reject's write take out a written premise that its own inverse merge brought back and that something keeps out. The runner's step 4 records that take-out in the un-reject action's `takenOut`. Undo of the un-reject inverts its commits newest first: the take-out, then the merge. So the premise's card ends up out again. The Undo's takenOut loop assumes inversion brings every takenOut premise back, so it still lists the premise in premises.takeOut. Neither ws/ nor the record (card undefined) holds a card at that point. The runner is asked to take out content that is not there, against ItemWrite's contract, so that Undo can fail or do nothing.
    - **evidence:** Scratch probe more.probe.test.ts (b). Premise p rests on V and W; V's Reject takes p out (c1), then W is rejected. Un-reject V -> write {reapply:[V], premises.takeOut:[p]}, p.card 'p-card'. Step 4 for that action: commit c3, takenOut [p]. Its Undo -> write {"action":3,"revert":[V],"reapply":[],"premises":{"write":[],"takeOut":[p]}}, with p to-be-redone, reverted and no card.
    - **fix:** Keep premises that an un-reject's own merge brought back out of that action's `takenOut`. One way: list them in a separate write field (e.g. `premises.mergedOut`) that the runner takes out in the same write without recording it in `takenOut`. Another: record on the action which premises its merge brought in, and skip them in Undo's takenOut loop. Add a reducer test with the probe's shape. Say in ItemWrite where the runner gets the card and ledger entries for these take-outs: un-reject sets the card on the record, while Undo relies on top.takenOut.
  - [4]
    - **id:** V2B1A-C4
    - **severity:** nit
    - **where:** packages/core/test/gate/ruleHelpers.test.ts:150 ('each helper applies only to the purposes it names')
    - **problem:** The title claims every helper is checked, but the test covers 6 of the 17: notProved, notFrozen, readyCards, statusMismatch, proofBeforeFreeze and statementChanged. buildFindings, footprintFindings, undeclaredPremiseFindings, readinessFindings, malformedBindingFindings, exampleFindings and the others are not checked against purposes.
    - **fix:** Rename the test to the helpers it checks, or extend it to the rest, for example footprintFindings: no findings outside check-in-prove and the gates; undeclaredPremiseFindings: gate-proved, or a new proof of the target.
