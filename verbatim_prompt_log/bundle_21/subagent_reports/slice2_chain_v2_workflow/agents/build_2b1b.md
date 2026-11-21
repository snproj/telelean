# build:2b1b

Agent `a3f913dc54747d082` of workflow `wf_ae5f1188-533`. Verbatim output (JSON alongside).

# Builder 2b1b: report

`judgeState`, `permittedFor` and `proposeArrowProblems` are built in core, with the new gate codes and tokens and B.1–B.4. The three carry-overs from 2b1a's review are all fixed.

Core typechecks clean and its full suite passes (67 files, 857 tests). Runner, webview and extension typecheck clean. The webview (313) and extension (203) unit suites pass, and so do the two runner files that use core's gate code. All 101 mutation checks fail at least one test, and every mutated file was restored byte for byte (`cmp`).

Only core and `docs/slice2-plan.md` changed. `review/index.ts` and `gate/index.ts` are unchanged. `evaluateRules` behaves exactly as in slice 1; the only change there is that `orderFindings` now knows the four new codes, which `evaluateRules` never produces.

## Carry-overs
- **R1-F1: fixed.**
  - `review/reducer.ts` now records what each un-reject's merge brings back in `Work.mergedBack`. A new `settleMergedBack(w)` runs in `decide` after every decline and back-to-review of the request, and decides where those items go from their final status.
  - A merged-back premise is written again only if an un-reject brought it back and its final status keeps it in ws/ (never when it ends in review). Otherwise its record takes only the card, for the take-out, and keeps its pre-merge key, so a Reject of it in the same request rejects the draft key.
  - Any other merged-back item whose final status keeps it out goes to `keepOut`, which becomes part of `revert`.
  - The same pass also fixes two un-rejects in one request after a group Reject. Before, the first un-reject's keep-out landed in `revert`, and the second un-reject's premise was taken out.
  - Tests: 4 new reducer tests, and a mixed request is now one of the World property's actions (with a `mixedOut` path counter). §8's "Seen, not fixed" paragraph is replaced by the decision, and the §4.6 property sentence is updated.
- **R1-F2: fixed.**
  - The §8 sentence is reworded: RV-3 does reach this state within a stage, and the Undo then leaves the premise unwritten.
  - The test comment is reworded the same way.
  - The test state is now built with `reconcile`: vocab:z gets a new key and rests on a Shaky item, so RV-3 marks z, and p with it.
- **R1-F3: fixed.**
  - `carryOut` now writes the card only when `outcome.write.premises.write` includes P.
  - `agree` now requires an accepted premise to be written.
  - In the Undo branch, when P is in the action's `takenOut` and ends accepted, the test expects P in `reapply` and no premise write for it.
  - Both mutations the reviewer described ("never schedules premise writes" and "an Undo that lets a fresh write replace the card") now fail the property at the step where they happen.

## Files changed
- /home/zhengyew/telelean/packages/core/src/review/reducer.ts: R1-F1 (`mergedBack`, `settleMergedBack`, the un-reject loop now decides later).
- /home/zhengyew/telelean/packages/core/src/gate/types.ts: `GateFindingCode` gains `arrow`, `holds-kind`, `rejected-repeat`, `stray-command`; `GateFinding.inference?`; token docs.
- /home/zhengyew/telelean/packages/core/src/gate/rules.ts: `orderFindings` places the four new codes.
- /home/zhengyew/telelean/packages/core/src/gate/permitted.ts: `contribution` and `footprintSinceBase` exported (additive).
- /home/zhengyew/telelean/packages/core/src/gate/describe.ts: board sentences for every new code and token; slice 1's sentences unchanged.
- /home/zhengyew/telelean/packages/core/src/gate/sessionRules.ts (new): step limits, G5 in a session, B.3 with `arrowProblems`, B.4, `new-axiom` against B, `stray-command`, footprints by creator, B.2 with E(T), `other-result`, `stepWording`.
- /home/zhengyew/telelean/packages/core/src/review/permitted.ts: `permittedFor` (B.1), plus `extraSources`, `questionSources`, `isSessionProof`.
- /home/zhengyew/telelean/packages/core/src/review/judge.ts: `judgeState` (includes `rejected-repeat`) and `proposeArrowProblems`.
- /home/zhengyew/telelean/packages/core/src/review/texts.ts: slice 1b's six arrow-refusal texts added to `CLAUDE_SESSION_TEXTS`.
- /home/zhengyew/telelean/packages/core/test/review/judge.test.ts (new, 66 tests).
- /home/zhengyew/telelean/packages/core/test/review/helpers/judge.ts (new helper).
- /home/zhengyew/telelean/packages/core/test/gate/describeSession.test.ts (new, 4 tests).
- /home/zhengyew/telelean/packages/core/test/review/reducer.test.ts: +4 tests, the World property changes, R1-F2's state built with reconcile.
- /home/zhengyew/telelean/docs/slice2-plan.md: §4.6 property sentence; fixer 2b1a r1's two passages (R1-F1 decision, R1-F2 correction); builder 2b1b's §8 entry.

## Tests
- **Added in judge.test.ts (66):**
  - the walkthrough; a three-target chain judged sources first; a session proof that does not pass; other inferences' findings kept out of `stepFindings`; no inference at all;
  - the step limits (`session`, a fuzzy fill, a non-fuzzy fill, `meaning`, `target`/`removed`/moved, the person's text, `openItems`, a closed proof);
  - G5 (`premises`, `follows_from`, `type`, new blocks) and B.3 at the gate, every token included, plus "a cycle B already had is not counted";
  - every `propose_arrow` refusal with its exact text;
  - B.4 and `new-axiom` (`type-changed`, `belief`, `after-freeze`, rules 4 and 5);
  - B.2 (`unselected`, `source-only`, D2-59, E(T)) and B.1's contributions (`session-proof` read from the state not the records, `not-passing`, `own-proof`, `claim` pending, `conditional`, `mismatch`, `circular`, E(T));
  - `rejected-repeat`'s four tokens, `no_alternative`, the freeze, content the person brought back;
  - `stray-command` and AP-26's comments;
  - `other-result` and F7;
  - `status-mismatch` `changed`/`removed`;
  - the active step's slice-1 rules (readiness, not-frozen, not-proved, statement-changed, proof-before-freeze against S₀);
  - problems and `ok`; `final`; `reach`; the Result's flags and band; a re-ask's question; footprints by creator; a mark-questioned target with no statement; `stepWording` (empty, one, many).
- **Added in describeSession.test.ts (4):** the new sentences, and slice 1's unchanged ones.
- **Added in reducer.test.ts (4):**
  - "[un-reject V, reject W] and [reject W, un-reject V] write alike…"
  - "[un-reject V, reject p] rejects p's draft key…"
  - "[un-reject V, back to review p]…"
  - "two un-rejects in one request…"
- **Updated:** the reducer's World property "ws/ and the Add premise's record agree after every step…", and "Undo of Show results, or of a back to review, whose returned written premise…" (R1-F2).
- **Skipped for later / deleted / moved:** none.

## Verification (run on the final code)
Every heavy command ran through `capped.sh`, with `TMPDIR`, and with `TELELEAN_TEST_TMP` set to my scratch tmp. Binaries are from `/home/zhengyew/telelean/node_modules/.bin`. Every vitest ran with `--maxWorkers=1 --no-cache --fsModuleCachePath=<scratch>/fsmc`.

| Check | Command | Result |
|---|---|---|
| core typecheck | `capped.sh 1800 … tsc --noEmit -p packages/core/tsconfig.test.json` | exit 0 |
| core tests | `capped.sh 1800 … vitest run …` in packages/core | "Test Files 67 passed (67)", "Tests 857 passed (857)" (was 65 / 783) |
| other typechecks | `tsc --noEmit -p` on packages/runner/tsconfig.test.json, packages/webview/tsconfig.json, packages/webview/tsconfig.node.json, packages/extension/tsconfig.json | all exit 0, no output |
| webview tests | `vitest run …` | "Test Files 19 passed (19)", "Tests 313 passed (313)" |
| extension tests | `vitest run --no-cache …` | "Test Files 22 passed (22)", "Tests 203 passed (203)" |
| runner, fakes | `capped.sh 3000 timeout 900 … vitest run … test/run/manager.gate.test.ts` | "Tests 8 passed (8)" |
| runner, real Lean | `capped.sh 3000 timeout 900 … vitest run … test/gate/engine.test.ts` | "Tests 30 passed (30)" |

- Why those two runner files: I changed no runner file, but these two exercise core's gate code that I touched.
- No webview build and no Playwright: the webview was not touched.

## Mutation checks
101 mutations, each restored and checked with `cmp`; all 101 fail at least one test.
- The harness and results are in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b2b1b: `mutate.py`, `muts1.final.json`, `muts2.out.json`, and the full table `mutation-table.txt`.
- Two mutations survived on their first run, so I added tests and they now fail:
  - OR6: the "own draft" assertion only looked at `stepFindings`; the test now also checks the target's own judgement.
  - RF1d: no test sent "un-reject, then set the merged-back premise back to review" in one request.
- The reducer as it was before my change also fails the R1-F1 tests and the World property.

Each line: file:line, what I broke, how many tests failed, one failing test:
- SL1 gate/sessionRules.ts:240 token `session` never given → 2, "an earlier step's statement changed: token `session`…"
- SL2 :262 meaning never compared → 2, "a meaning change with unchanged text, through an instance…"
- SL3 :236 openItems not exempt → 1, "`openItems` opens their declarations…"
- SL4 :271 a .holds added while the proof is closed passes → 1, "`openItems` opens their declarations…"
- SL5 :238 T.holds never exempt under openProof → 1, "a Submit step whose Result is not open…"
- SL6 :254 moved declarations pass → 1, "the target's statement is fixed (`target`)…"
- SL7 :291 removed S₀ lines pass → 1, "the person's text outside declarations stays…"
- SL8 :310 valueConsts not compared → 1, "a meaning change…"
- SL9 :309 printed value not compared → 1, "a meaning change…"
- G1 :408 any premises: addition passes → 1, "G5 on edited `premises:`…"
- G2 :408 ledger arrows not accepted → 2, "G5 on edited `premises:`…"
- G3 :409 premises: removals pass → 1, "G5 on edited `premises:`…"
- G4 :423 follows_from removal without a ledger mark-removed passes → 1, "G5: `follows_from:` goes only through…"
- G5 :505 any new block passes → 1, same test
- G6 :505 ledger premise blocks refused → 1, same test
- G7 :456 a pin of a non-pinnable card passes → 1, "a fuzzy fill passes; a non-fuzzy empty card filled…"
- G8 :485 a non-pinnable card may become bound → 1, same test
- G9 :319 `type:` not compared → 1, "G5: `follows_from:`…"
- B3a :653 a declined item's arrow still drawn passes → 1, "B.3 ignores the ledger arrow of a declined arrow item…"
- B3b :704 B's own cycles counted → 1, "B.3: the drawn and solid arrows are acyclic…"
- B3c :705 no acyclicity check → 1, same test
- B3d :685 the step's arrow from another target passes → 1, "B.3 at the gate…"
- AP1 :597 not-target dropped → 2, "B.3 at the gate…"
- AP2 :609 no-holds dropped → 2, "B.3 at the gate…"
- AP3 :612 declined dropped → 3, "B.3 at the gate…"
- AP4 :617 drawn dropped → 2, "B.3 at the gate…"
- AP5 :608 mark dropped → 2, "refuses each case with its exact text"
- AP6 :607 into-axiom dropped → 2, "B.3 at the gate…"
- AP7 :603 unknown source dropped → 2, "refuses each case…"
- AP8 :620 cycle dropped → 1, "refuses each case…"
- AP9 :611 other-target dropped → 1, "refuses each case…"
- AP10 :596 a statements-only step accepts arrows → 1, "refuses each case…"
- AP11 :600 self-arrow accepted → 1, "refuses each case…"
- B4a :757 theorem-to-axiom passes → 1, "a theorem made an axiom with the same name…"
- B4b :761 axiom-for-proposition passes → 1, "Claude writes `axiom T.holds : T`…"
- B4c :761 a ledger premise's pending claim refused → 1, "`new-axiom` allows the .holds of an axiom card…"
- B4d :772 axiom → theorem of another type passes → 1, "a pending target proved…"
- NA1 :815 a reused name passes → 2, "a theorem made an axiom with the same name…"
- NA2 :828 a proposition's .holds reported by new-axiom too → 1, "Claude writes `axiom T.holds : T`…"
- NA3 :853 rule 4 refused → 10, "an earlier step's statement changed…"
- NA4 :878 a Prop axiom bound to no card passes as unclassified → 1, "`new-axiom`: B's axioms and shape-passing vocabulary pass…"
- NA5 :833 no after-freeze rule → 1, same test
- NA6 :847 vocabulary refused → 1, same test
- SC1 :935 enclosing lines refused → 1, "namespace lines around new declarations pass…"
- SC2 :941 attached comments refused → 1, "comments (AP-26)…"
- SC3 :936 an example's text refused → 1, "an `example` is the example rule's…"
- SC4 :946 commands pass → 4, "refuses an `attribute [simp]` line…"
- SC5 :942 stray comments pass → 1, "comments (AP-26)…"
- FP1 :978 footprint(T.holds) never outside → 2, "a session proof counts only once its own inference passed…"
- FP2 :1079 a declaration's footprint never outside → 1, "proof material is judged against its creator's permitted set…"
- FP3 :1057 no-facts declarations pass → 1, "a declaration of the step Lean reported nothing about…"
- BB1 :1011 every direct use allowed → 6, "a session proof counts only once…"
- BB2 :1007 source-only judged from references → 1, "without the elaborated values the proof is refused…"
- OR1 :1143 a source's proof material refused → 1, "T's proof using a lemma of t1's proof…"
- OR2 :1136 statements read as proofs → 1, "a statement may not use proof material…"
- OR3 :1169 a statement may mention a session proof's .holds → 1, same test
- OR4 :1189 premise drafts not judged → 1, "a premise draft of T mentioning t1's proof material…"
- OR5 :1117 nothing is proof material → 4, "T's proof using a lemma…"
- OR6 :1189 a draft may not mention its own target's material → 1, "a premise draft of T…"
- P1 review/permitted.ts:55 a question source counts without its arrow → 2, "a question source counts only while its arrow exists (D2-59)…"
- P2 :115 a session proof counts whether it passes or not → 2, "a session proof counts only once…"
- P3 :46 a declined arrow item stays in E(T) → 2, "B.3 ignores the ledger arrow…"
- P4 :112 the person's own proof gives nothing → 1, "a rejected session proof gives what B's .holds gives…"
- P5 :104 a pending claim not marked pending → 1, same test
- P6 :110 a circular proof counts → 1, "nothing, with why…"
- P7 :107 a conditional proof counts → 1, same test
- P8 :102 a mismatched .holds counts → 1, same test
- P9 :47 E(T) leaves out written premises → 2, "E(T): Claude's arrows in the ledger…"
- J1 review/judge.ts:226 inferences not sorted sources first → 1, "judges a three-target chain sources first…"
- J2 :405 every inference's findings in stepFindings → 1, "an inference other than the step's feeds RV-11 only…"
- J3 :226 the active step's question not substituted → 2, "a re-ask judges its target against the step's question…"
- J4 :366 the active target's proof always judged → 1, "a re-ask that finishes not proved…passes"
- J5 :411 `ok` always true → 3, "an `example` is the example rule's…"
- J6 :399 build errors not mapped to items → 1, "Lean's errors map to the items owning…"
- J7 :402 missing facts give no problem → 1, "a module that did not build…"
- J8 :291 a code-less target not pinnable → 1, "a target questioned by its mark, with no statement yet…"
- J9 :299 changed vocabulary not shape-checked → 1, "the vocabulary shape rule judges changed items too…"
- J10 :381 the active step's declarations judged before its freeze → 1, "before its freeze…"
- J11 :323 no step limits → 6, "an earlier step's statement changed…"
- J12 :369 the active rules keep "the run" wording → 2, "a changed or removed proof (`changed`, `removed`), in the step's words…"
- J13 :323 proof-before-freeze dropped → 2, "`statement-changed` against the step's freeze…"
- J14 :373 readiness dropped → 1, "freeze: readiness…"
- R1 :104 content already in S₀ judged too → 1, "content the person brought back (Undo, un-reject)…"
- R2 :106 rejected keys ignored → 1, "`rejected`: the step proposes exactly a version…"
- R3 :118 an earlier step's premise draft judged → 1, "`premise`: …"
- R4 :132 declined arrows pass → 1, "`premise`: …; `arrow`: …"
- R5 :143 no_alternative ignored → 1, "`shaky-identical`…"
- R6 :143 shaky-identical judged at the freeze → 1, same test
- R7 :145 a reworked Shaky set flagged → 1, same test
- R8 :118 premise drafts never judged → 1, "`premise`: …"
- D1 gate/describe.ts:269 the arrow `declined` sentence changed → 1, "B.3 `arrow`, one sentence per token…"
- D2 :292 the stray comment sentence changed → 1, "B.4 `holds-kind`, `rejected-repeat`, `stray-command`"
- O1 gate/rules.ts:437 orderFindings drops `arrow` → 5, "B.3 ignores…"
- O2 :37 orderFindings drops `stray-command` → 5, "refuses an `attribute [simp]` line…"
- RF1a review/reducer.ts:891 the post-pass call dropped → 11, including the R1-F1 tests and the World property
- RF1b :619 a merged-back premise written whatever its final status → 3, including the World property
- RF1c :615 a merged-back item a later decline keeps out is left in → 5, "a dependent declined since it was taken out…"
- RF1d :619 a premise left in review counted as kept in → 1, "[un-reject V, back to review p]…"
- RF2 :1204 the `skipped` check dropped → 1, "Undo of Show results, or of a back to review…"
- RF3a :715 no premise write scheduled → 3, including the World property at the step
- RF3b :1204 an Undo never puts the taken-out card back → 7, including the World property at the step

One rule cannot be reached by any test: B.1 leaving T.holds out of the permitted set. No source can bring it in (a circular footprint contributes nothing, and the signature excludes declarations that belong to cards), so I did not mutate it.

## Decisions for the orchestrator to log
Each is also in the plan's §8 builder 2b1b entry.
1. **G0 stays in the runner's engine** (`checkFileChanges`): judgeState sees only the Lean files, so 2b3 must add G0's findings to the step's. *Alternative:* run `scanForbidden` over the models' Lean files inside judgeState, which misses every other file.
2. **When T's proof is judged.** For the active step's target, as slice 1 judged a run, but against S₀: at a proved finish always; at check in stage prove and at a not-proved finish only when T.holds changed since S₀. So a re-ask that finishes not proved, keeping its old proof, is not refused. Every other inference, and every inference at stage or final, is judged when T.holds is a proof made in this session. The person's own unchanged proof is not judged at a stage (the backstop in 2b2 restates B.2 at Apply). *Alternative:* judge every proved target at every purpose.
3. **Footprints are judged per creator.** Each new or changed declaration is judged against the permitted set of the inference whose step created it, and the finding belongs to that inference, so a Result fails rather than the whole state. A declaration no step recorded is judged against the vocabulary layer as a global finding (fail closed). Before the active step's freeze, only `no-facts` applies. *Alternative:* make every footprint finding global.
4. **Phase of the active step's new declarations** (for `other-result`). Statements if the freeze holds them, proof after the freeze. With no freeze: statements at check and freeze, proof at a finish (as the step's end will record). *Alternative:* computeItems' rule alone.
5. **Step limits.** Token precedence is `session`, then `target`, then `removed`/`changed`/`meaning`. The limits also refuse moved S₀ declarations and removed or moved S₀ text outside declarations, so neither reaches Apply as unowned text. The value/type-constant comparison of D2-41 applies to step limits only; `evaluateRules`' `existing-changed` keeps slice 1's comparison. *Alternatives:* `target` first; leave moves and removed lines to the backstop.
6. **G5 in a session** is a sibling of slice 1's rule (`sessionMarkupFindings`).
   - `premises:` is compared as entries: an addition is allowed when a ledger arrow (declined or not) or a ledger premise explains it; no removals.
   - Pins are allowed on the scope's fuzzy cards plus the target when it has no statement at S₀ (a mark-questioned target is at no selected arrow); at stage and final, on every target and question source.
   - *Alternatives:* B.3 judges every `premises:` difference; pins only on fuzzy cards.
7. **Tokens the plan does not assign:**
   - `propose_arrow` in a statements-only step → `not-target`, with §3.3's text;
   - a self-arrow → `cycle`;
   - an unknown card, a vocabulary name or another subject's card → `unknown-card`;
   - a declined item's arrow still in `premises:` → `declined`;
   - a stray comment → new token `comment`.

   *Alternative:* new tokens.
8. **One finding per problem.** `new-axiom` leaves a proposition's axiom `.holds` to B.4. B.4's axiom-to-theorem exception covers the step's target at a step, and any session target at stage or final. *Alternative:* report both codes.
9. **`rejected-repeat`.**
   - `shaky-identical` is judged at check and at a finish, never at the freeze.
   - `premise` covers only the step's own drafts.
   - These findings are step findings and do not affect `ok`.

   *Alternative:* judge at every step purpose.
10. **Other judgement fields.**
    - `stepFindings` at stage and final is the global findings.
    - `ok` means: it built, no `facts` problem, and no global finding.
    - One `no-longer-builds` problem per Lean error inside a declaration that an item provides.
    - A `facts` problem for drafts whose module did not build, or when there are no facts at all.
    - No `scc` problem (it depends on the records, which change without a judge).
    - `reasonChip` is left out; it depends on how the step ended, so 2c2 sets it.

    *Alternatives:* `[]` for non-step purposes; emit `scc`; derive the chip from the target's status.
11. **Wording.** Slice 1's helpers reused against S₀ say "when this step started" and "in this step" instead of "before the run" and "in this run/round" (`stepWording`). *Alternative:* copies of those helpers with session messages.
12. **R1-F1: decide merged-back items after the whole request** (`settleMergedBack`). *Alternatives:* 2c1's validator refuses mixed requests, or the reducer refuses them. Builder 2a2 had accepted mixed requests, and this fix keeps that.
13. **Residual found while fixing R1-F1, left as is.** If a mixed request un-rejected V and declined W, a later un-reject of W reverses the whole decision commit, which takes V's content out of ws/ while V's record keeps it in. The next judge reports V "disappeared" and Apply stays disabled until an Undo, so it fails closed. No client sends a mixed request (§5.7), and Redo resends only recorded requests. *Alternatives:* the reducer refuses such an un-reject, or 2c1's validator refuses a `decideItems` that mixes `in-review` with `declined`.

Notes for later sub-slices:
- **2b3:** add G0's findings to the step's (decision 1).
- **2c2:** set `reasonChip` from the step records (decision 10).

## Effects outside the repo and the scratch dir
- Vite's config loader wrote and then deleted a bundled config in four existing folders, each empty again with only its mtime changed (inside the repo, git-ignored):
  - `node_modules/.vite-temp`
  - `packages/core/node_modules/.vite-temp`
  - `packages/webview/node_modules/.vite-temp`
  - `packages/runner/node_modules/.vite-temp`
- `node_modules/.vitest-cache` is unchanged (1654 entries).
- `packages/extension/out` and `packages/extension/dist`: nothing written (checked).
- `capped.sh` created transient systemd user scopes; the engine test ran real Lean through them. Its temp files went to the scratch dir.
- No git state changes, no network, no installs, no Claude CLI. None of my processes remain. The running `lake`/`lean` processes are your VS Code Lean server for `~/webring` (since Nov 19 09:42).
- Not mine: `verbatim_prompt_log/bundle_21/subagent_reports/slice3_ultra_review_workflow/` appeared at 00:00:57 while I was working.

