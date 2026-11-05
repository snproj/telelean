# build:WP1 (agent a30195b09657fd060)

## summary
WP1 is done. Every stub in `packages/core/src/gate/index.ts` and `packages/core/src/proposal/index.ts` is now implemented in pure TypeScript, in new modules beside them:
- `g0.ts`: G0 token denylist (only Claude's lines are judged, via the base text), file rules, and the single-term rule for ghost text.
- `permitted.ts`: the D-5 permitted set and the freeze snapshot.
- `decls.ts` + `rules.ts`: `evaluateRules` with the reviewer's corrected table, flagged definitions, footprints, the declaration diff.
- `normalise.ts`: normalisation and lifecycle changes. `adoption.ts`: `planGhostAdoption`. `describe.ts`: the A2 board sentences and attempt notices.
- `proposal/diff.ts` and `proposal/sidecars.ts`: `diffGraphs`, `proposalLabel`, and the attempts.jsonl / decisions.json codecs.

The three M1 carry-overs are done:
- (1) `subjectGraph` fills `LeanBinding.externalUsers` (new `project/users.ts`, one index per model; the text helpers moved unchanged from `edit/dependents.ts` to `project/textRefs.ts`).
- (2) Singular/plural texts in `kindChange.ts` and `edit/planKind.ts`, the singular ones exactly as frozen in plan 1.3.
- (3) `KindChangeRequest.confirmedDependents`, passed through `planAction`. A choice that does not cover every dependent now gets `needs-confirmation` listing all of them; a missing list counts as empty, as `actions.ts` documents.

I copied the architect's protocol test to `packages/core/test/protocol.m2.test.ts` and recorded my two additive contract changes as rows in plan section 14.

Tests: core went from 32 files / 351 tests to 46 files / 474, all passing, and the core typecheck is clean. Besides the fakeFacts-based tests the plan asks for, I added a test that runs the rules on recorded real Lean 4.35 facts. It caught one bug, which is fixed: definitions mentioned only by lemmas were wrongly flagged as definition questions. The runner, extension and webview typecheck clean against the changed core (`--noEmit`, nothing written).

Two things need follow-up elsewhere:
- Five runner integration tests send a dependents choice without `confirmedDependents` and will now get `needs-confirmation`; the integrator has to add the list.
- I did not run WP2's real-Lean gated suite, because two other agents' Lean runs were active.

## files
- /home/zhengyew/telelean/packages/core/src/gate/index.ts
- /home/zhengyew/telelean/packages/core/src/gate/types.ts
- /home/zhengyew/telelean/packages/core/src/gate/g0.ts
- /home/zhengyew/telelean/packages/core/src/gate/permitted.ts
- /home/zhengyew/telelean/packages/core/src/gate/decls.ts
- /home/zhengyew/telelean/packages/core/src/gate/rules.ts
- /home/zhengyew/telelean/packages/core/src/gate/normalise.ts
- /home/zhengyew/telelean/packages/core/src/gate/adoption.ts
- /home/zhengyew/telelean/packages/core/src/gate/describe.ts
- /home/zhengyew/telelean/packages/core/src/proposal/index.ts
- /home/zhengyew/telelean/packages/core/src/proposal/diff.ts
- /home/zhengyew/telelean/packages/core/src/proposal/sidecars.ts
- /home/zhengyew/telelean/packages/core/src/project/subjectGraph.ts
- /home/zhengyew/telelean/packages/core/src/project/users.ts
- /home/zhengyew/telelean/packages/core/src/project/textRefs.ts
- /home/zhengyew/telelean/packages/core/src/edit/dependents.ts
- /home/zhengyew/telelean/packages/core/src/edit/planKind.ts
- /home/zhengyew/telelean/packages/core/src/edit/planAction.ts
- /home/zhengyew/telelean/packages/core/src/edit/types.ts
- /home/zhengyew/telelean/packages/core/src/kindChange.ts
- /home/zhengyew/telelean/packages/core/test/protocol.m2.test.ts
- /home/zhengyew/telelean/packages/core/test/gate/helpers/spyroRun.ts
- /home/zhengyew/telelean/packages/core/test/gate/g0.test.ts
- /home/zhengyew/telelean/packages/core/test/gate/permitted.test.ts
- /home/zhengyew/telelean/packages/core/test/gate/rules.test.ts
- /home/zhengyew/telelean/packages/core/test/gate/normalise.test.ts
- /home/zhengyew/telelean/packages/core/test/gate/adoption.test.ts
- /home/zhengyew/telelean/packages/core/test/gate/describe.test.ts
- /home/zhengyew/telelean/packages/core/test/gate/realFacts.test.ts
- /home/zhengyew/telelean/packages/core/test/gate/scale.test.ts
- /home/zhengyew/telelean/packages/core/test/proposal/diff.test.ts
- /home/zhengyew/telelean/packages/core/test/proposal/codecs.test.ts
- /home/zhengyew/telelean/packages/core/test/carryover/externalUsers.test.ts
- /home/zhengyew/telelean/packages/core/test/carryover/kindTexts.test.ts
- /home/zhengyew/telelean/packages/core/test/carryover/confirmedDependents.test.ts
- /home/zhengyew/telelean/packages/core/test/edit/helpers/confirm.ts
- /home/zhengyew/telelean/packages/core/test/edit/kindChange.test.ts
- /home/zhengyew/telelean/packages/core/test/edit/conditional.test.ts
- /home/zhengyew/telelean/packages/core/test/edit/helpers/scenarios.ts
- /home/zhengyew/telelean/packages/core/test/fixtures/proposal/attempts.jsonl
- /home/zhengyew/telelean/packages/core/test/fixtures/carryover/Other-Main.lean
- /home/zhengyew/telelean/packages/core/test/fixtures/carryover/Spyro-Lemmas.lean
- /home/zhengyew/telelean/docs/m2-plan.md

## how_to_run_tests
cd /home/zhengyew/telelean/packages/core && npm test   (runs `tsc -p tsconfig.test.json` then `vitest run`; pure TypeScript, no Lean, no Claude, about 11 s). Typecheck alone: npm run typecheck. WP1 tests only: npx vitest run test/protocol.m2.test.ts test/gate test/proposal test/carryover test/edit

## test_output
Baseline before any change (core npm test): Test Files 32 passed (32), Tests 351 passed (351).
Final runs, 2026-11-01 ~21:11:
$ npm run typecheck  ->  > tsc -p tsconfig.test.json   (no output, exit 0)
$ npm test  ->  Test Files  46 passed (46)
                Tests  474 passed (474)
                Duration  11.36s
WP1 test files (verbose, all passing): protocol.m2 5; gate/g0 16; gate/permitted 9; gate/rules 30; gate/normalise 8; gate/adoption 6; gate/describe 10; gate/realFacts 7; gate/scale 1; proposal/codecs 9; proposal/diff 4; carryover/externalUsers 6; carryover/kindTexts 6; carryover/confirmedDependents 6. Updated M1 edit tests: kindChange 16, conditional 10, plans.fake 17, plans.wp1 17.
Scale checks: test/project/scale.test.ts (2000 cards, subjectGraph now with externalUsers) 147 ms against its 1500 ms bound; test/gate/scale.test.ts evaluateRules on 2000 cards 235 ms against a 1000 ms bound.
Cross-package typecheck against the changed core (all --noEmit): runner `tsc -p tsconfig.test.json`, extension `tsc -p tsconfig.json`, webview `tsc -p tsconfig.json` and `tsc -p tsconfig.node.json`: all clean.

## acceptance
- **test:** AT1.1 G0 tokens
  - **status:** pass
  - **evidence:** test/gate/g0.test.ts 'AT1.1' (7 tests). Each of 37 denylisted tokens gives code, token, range and `file:line:col`. The same words in comments, strings, docstrings and telelean blocks give nothing. #check/#print (and #print axioms) are allowed. `decide +native` gives native-code `+native`; `set_option maxHeartbeats 0 in` gives set-option. `import Lean` is flagged; `import Model.Spyro.Lemmas` is allowed when in projectModules. With baseText, the user's own set_option and #eval lines are not reported; a second copy of the line added by Claude is reported at the later line.
- **test:** AT1.2 file rules
  - **status:** pass
  - **evidence:** g0.test.ts 'AT1.2' (5 tests). lakefile.toml, lean-toolchain, lake-manifest.json and a new lakefile.lean each give project-file. Model/Other/Main.lean and Model.lean give outside-subject. A deletion gives deleted-file. 'Model/Spyro/my file.lean' and 'Model/Spyro/notes.md' give bad-path. Identical base and current maps give nothing, even with #eval in them. The honest walkthrough edits pass; an added `#eval` is reported at its line.
- **test:** AT1.2b ghostTextProblems
  - **status:** pass
  - **evidence:** g0.test.ts 'AT1.2b' (4 tests). The plan 10.2 literal ghost statement and proof give []. The fact-8 injection gives `:=` outside brackets, unbalanced `)`, `(` left open, keyword `axiom` and keyword `example`. Statements with `-/`, `#eval`, `sorry`, or empty text give problems. A proof containing `theorem` gives exactly one problem.
- **test:** AT1.3 permitted set
  - **status:** pass
  - **evidence:** test/gate/permitted.test.ts (9 tests). On the Spyro proved-overlay hand facts, all three selected give exactly the 13 names of the M0 comparator test. Without new-spyro-pg its .holds is gone (12 names). A selected proved derivation (derived fixture) adds its footprint. An unproved goal, a code-less card, a conditional proof and a derivation resting on the target's claimed .holds are unusable, and S.d.holds is never permitted. Zero premises give standard + signature + the target's presuppositions. Also covered: adopted ghosts, invalid ids, frozenSnapshot. Cross-checked on recorded real Lean facts in realFacts.test.ts.
- **test:** AT1.4 evaluateRules
  - **status:** pass
  - **evidence:** test/gate/rules.test.ts (30 tests): a positive and a negative case for build, not-formalised, missing-holds, proof-before-freeze, not-frozen, not-proved, status-mismatch, footprint, sorry-axiom, new-axiom (before and after the freeze), vocabulary-shape, existing-changed, statement-changed and markup.
- existing-changed: vocabulary axiom turned into a def; a removed declaration; a changed docstring; facts value changed behind a literal `open Other in` line, silent without B's facts; weakened target abbrev marked as the target.
- Pending derivation: its .holds axiom may become the theorem after the freeze, with no findings at all.
- status-mismatch for gate-other with a new T.holds; none for the user's unchanged proof.
- footprint in gate-other for a lemma on an unselected .holds, with and without a freeze.
- markup: changed T pin; adjacency-bound B target re-bound to an inserted abbrev; unselected card formalised; edited adopted-ghost block and declaration (against `adopted`).
- Readiness codes absent in gate-other.
- Flagged definitions: def on the statement path flagged; proof-only and lemma-only defs not; a def used by a signature item flagged; new presupposition flagged.
- Declarations diff; finding order G1/G3/G5/readiness.
- budget and comparator codes are produced by the runner (WP2), not by evaluateRules.
- **test:** AT1.5 normalisationChanges
  - **status:** pass
  - **evidence:** test/gate/normalise.test.ts 'AT1.5' (6 tests). For an id-less, docstring-less, newly formalised block: exact expected text with the derived id, `lean:` pin and docstring, every other byte unchanged. Second application gives []. The walkthrough formalisation gets only the pin. A different docstring becomes the sentence. Cards that are not new, code-less cards and unknown ids give []. A theorem under a selected block is not pinned.
- **test:** AT1.6 planGhostAdoption
  - **status:** pass
  - **evidence:** test/gate/adoption.test.ts (6 tests). Exact inserted text before the target block, with the multi-line statement collapsed. The re-parsed result is an ASSUMPTION with worded_by agent, origin agent, the session, pinned, docstring = sentence, the checked statement, and every other binding unchanged. A taken, keyword, invalid or dotted lean_name gives the derived name, with a `_2` suffix when that is used. The node id is made unique. Comment delimiters and the AT1.2b injection are refused `invalid`; bad metadata is `invalid`; an unknown target is `not-found`.
- **test:** AT1.7 lifecycleChanges
  - **status:** pass
  - **evidence:** normalise.test.ts 'AT1.7' (2 tests). G→D of the proved target changes only the `type:` line, also for an id-less adjacency-bound target (no pin, no id written). Not proved, already a derivation, a missing card, an unsupported kind change and the weakened-type proof are all refused `unsafe`.
- **test:** AT1.8 describeFinding/attemptNotice
  - **status:** pass
  - **evidence:** test/gate/describe.test.ts (10 tests). The plan 3.5 sentences come out exactly, from real rule, G0 and comparator findings: unselected premise, sorry gap, changed statement (comparator definition mismatch and weakened abbrev), #eval with file and line 12, added axiom, changed words, and the give-up sentence with “Statements frozen (round 1)”. Also: the status-mismatch, re-pointed pin and existing-declaration sentences; singular/plural ('(and 1 more)', '(and 2 more)', maxAttempts 1, lists of two cards); a sentence for every code.
- **test:** AT1.9 diffGraphs
  - **status:** pass
  - **evidence:** test/proposal/diff.test.ts (4 tests). Normative proposal: pg-no-dark-past changed ['statement','binding'], target changed ['proof','status'], three new verified edges, counts {0,2,0,0}. Literal: vocabulary {'Spyro.InGame':'added'}. An adopted ghost is 'added', in proposed-board order. Sentence, type, premises and fields changes are told apart; removed nodes come last; vocabulary changed/removed; identical boards give an empty diff.
- **test:** AT1.10 codecs
  - **status:** pass
  - **evidence:** test/proposal/codecs.test.ts (9 tests). Attempt record and resolution round trip, keys in interface order. The fixture attempts.jsonl (read via ?raw) has blank, non-JSON, unknown-format, version-2 and bad-verdict lines, all skipped. summariseAttempts: newest first, latest resolution attached (accepted after discarded). Decisions: lenient parse, add/replace in order, pretty serialisation with trailing newline. decisionsInForce: run scope never, nodes scope when it meets the nodes, subject scope always, newest first. proposalLabel forms.
- **test:** AT1.11 carry-over 1 externalUsers
  - **status:** pass
  - **evidence:** test/carryover/externalUsers.test.ts (6 tests). The lemma without a card (Spyro.helper, plus helper2 resting on it) and the other subject's card (other-dark, with nodeId, subject, naturalName, for both its .holds and its statement) are listed. Proof uses come first. Absent when nothing outside the board uses the card. The text scan works when a file is stale and when there are no facts. Model nodes are not mutated. Also checked on recorded real facts in realFacts.test.ts.
- **test:** AT1.12 carry-over 2 texts
  - **status:** pass
  - **evidence:** test/carryover/kindTexts.test.ts (6 tests). kindChangeImpact to Goal and to Assumption (proof taking hypotheses), with rewrite available and with 'Refresh Lean first', for 1 and 2 proofs. planKindChange messages for Goal and for drop-arguments, for 1 and 2 dependents. The singular strings equal the frozen plan 1.3 texts character for character; the plural ones are unchanged from M1.
- **test:** AT1.13 carry-over 3 confirmedDependents
  - **status:** pass
  - **evidence:** test/carryover/confirmedDependents.test.ts (6 tests). The board lists ['cynder-not-good']; the host finds ['cynder-not-good','Spyro.helper']. Confirming only the card (rewrite or mark-broken), or sending a choice with no list, gives needs-confirmation listing all of them. A covering or larger list applies. The same holds through planAction and in the drop-arguments case. A change with no dependents needs nothing.
- **test:** AT1.14 copied protocol test and core npm test
  - **status:** pass
  - **evidence:** test/protocol.m2.test.ts 5/5. It is the architect's file with the import changed to ../src/index.js, explicit vitest imports, and the last test now expecting scanForbidden/diffGraphs to be implemented. Core npm test: typecheck clean, 46 files / 474 tests passed.

## contract_changes
- core src/edit/types.ts: additive optional `KindChangeRequest.confirmedDependents?: readonly string[]` (carry-over 3). src/edit/planAction.ts passes `change-kind.confirmedDependents` through. As `actions.ts` already documents, a dependents choice without a covering list now gets `needs-confirmation` listing every dependent. Recorded in docs/m2-plan.md section 14.
- core src/gate/types.ts: doc only. `GateFinding.token` also carries a short variant marker on findings other than G0 (markup field, binding/formalised/block/removed/moved/telelean; existing-changed target/removed/meaning/ghost; not-proved missing/axiom/sorry/mismatch/conditional/unchecked; new-axiom belief/after-freeze; build not-built), read by describeFinding. Recorded in section 14.
- No frozen signature changed: every function in gate/index.ts and proposal/index.ts keeps its documented signature.

## minor_decisions
- **decision:** G0 flags `native` as a code token anywhere (not only `+native`), adds `run_tac` to the metaprogramming list, and matches ofReduceBool/ofReduceNat/reduceBool/reduceNat by their last name component (so `Lean.ofReduceBool` is caught).
  - **rationale:** A stricter denylist: `decide (config := {native := true})` and qualified names would otherwise slip through. False positives only cost a retry.
- **decision:** The ghost single-term rule also refuses `open`, `export`, `omit`, `include`, `coinductive` and `@[`, and an empty proof. Brackets must match by kind, including ⟦⟧ and ‹›.
  - **rationale:** Adoption writes the text into the user's file: an `open X` command after the abbrev would change how the user's later declarations resolve names.
- **decision:** File rules give one finding per path, most specific first (project-file, then deleted-file, outside-subject, bad-path). bad-path applies only to added paths. A new `<library>/<S>.lean` and nested `<library>/<S>/Dir/Module.lean` with ASCII identifier parts are accepted. Every added or modified .lean file is token-scanned. Positions use Lean's convention (1-based line, 0-based column); G0 findings name the enclosing declaration.
  - **rationale:** Clear single messages for Claude, consistent with the Lean messages it sees; lets the board say "in cynder_not_good.holds".
- **decision:** evaluateRules orders findings G1, then G3 by root cause (new-axiom, existing-changed, not-proved, status-mismatch, statement-changed, footprint, sorry-axiom, vocabulary-shape), then G5, then readiness/stage. Readiness and stage findings use step G3.
  - **rationale:** The first finding drives the A2 notice. With this order the cheat table's expected notices come out (added axiom, weakened abbrev, vocabulary redefined).
- **decision:** A "proof" is a facts theorem, or a def/opaque/instance whose typeSort is Prop, except the presupposition instance `instance : Nonempty T := T.exists`. Without facts, theorem/lemma.
  - **rationale:** Real Lean types that instance Prop; counting it as a proof would make the legitimate new-sort pattern fail proof-before-freeze (checked on recorded real facts).
- **decision:** Before the freeze, new-axiom fires only for beliefs: Prop-valued axioms, or a `.holds` of a card that is not a selected ASSUMPTION or ghost. Shape problems of non-Prop axioms belong to vocabulary-shape, which skips unmarked-axiom items.
  - **rationale:** A smuggled axiom is reported once, as the plan's cheat table expects ('new-axiom (+ footprint)').
- **decision:** sorry-axiom does not report a user's own declaration whose text is unchanged since B and which already used sorry in B (or when B has no facts).
  - **rationale:** Same idea as G0 judging only Claude's lines: a user's draft `sorry` in a file Claude has to edit would otherwise fail every attempt.
- **decision:** footprint fails closed in gate purposes when Lean listed no axioms for a proof. check in stage prove also checks T.holds's footprint, like gate-proved.
  - **rationale:** "Proved" must never rest on an unchecked footprint; the check gives Claude an early signal.
- **decision:** FrozenSnapshot.declarations leaves out theorems, so proofs may be reworked after the freeze. statement-changed compares kind, type and value, and exempts T.holds.
  - **rationale:** The freeze protects statements, vocabulary and definitions (D-19), not proofs.
- **decision:** Markup matches blocks by node id per file. An added `lean:` line is legal only on a chosen card that was code-less in B, naming the declaration directly below its block, which must not have existed in B. A binding finding is dropped when the same block already has a `lean:` finding, and a moved block is reported once.
  - **rationale:** Encodes the reviewer's pin/re-binding rules without double findings.
- **decision:** A definition is flagged when it is in any card's `uses` closure, or referenced by a vocabulary item that is neither a definition nor a lemma. usedByStatementsOf = the item's usedBy.
  - **rationale:** The real-facts test showed that counting lemma refs flags proof-only definitions, which the plan says need no question.
- **decision:** normalisationChanges pins only well-formed statements (no TL101/TL113), and formalisedThisRun requires the same.
  - **rationale:** A theorem placed directly under a selected block must not be pinned as that card's statement.
- **decision:** lifecycleChanges writes only the `type:` line (no derived id, no pin) and refuses (`unsafe`) anything but GOAL→DERIVATION of a goal that is still proved.
  - **rationale:** The documented "changes only its block's type:"; M2 proposes no other lifecycle item.
- **decision:** planGhostAdoption also rejects a name the project's code already uses as an identifier, re-parses its result, and refuses (`unsafe`) unless exactly one new pinned ASSUMPTION appears and every other binding is unchanged. Multi-line sentence or reason, a bad date and a bad session id are `invalid`.
  - **rationale:** A new declaration named like a used constant would shadow it inside the namespace. The re-parse makes the plan safe by construction.
- **decision:** describeFinding shows names relative to the subject (taken from the finding's file, else drops a capitalised first component that is not a Lean namespace). attemptNotice drops consequences (a footprint on an axiom the attempt added; a statement-changed of a declaration already reported as existing-changed) and duplicate descriptions before counting '(and n more)'. The give-up notice uses the brief form. maxAttempts 1 gives "Claude's attempt didn't pass the checks: …". No label gives "the last state that passed"; existing quotes around a label are not doubled.
  - **rationale:** Produces the plan 3.5 sentences exactly, including for multi-finding cheats.
- **decision:** diffGraphs fields: statement = the statement name or its declaration text; proof = a status change involving proved/conditional/pending, or a changed `.holds` theorem text; status = flags/certificates; binding = binding mode; fields = the card's other fields.
  - **rationale:** The walkthrough then gives exactly AT4.1's "(statement, binding)" and "(proof, status)".
- **decision:** Codec parsing validates fields and skips malformed or newer-version lines. Serialisers only order keys, never throw and never drop entries. summariseAttempts takes the latest resolution by date (ties: the later line) and puts newest records first (ties: the later line first). addDecisions replaces in place.
  - **rationale:** Hand edits never break the board, and writing never loses a recorded answer.
- **decision:** externalUsers: proof users first (from `.holds`, through untracked declarations), then the remaining statement users. The search stops at any card. The text scan runs only while some file is not fresh. One index per model.
  - **rationale:** A declaration that rests on the `.holds` counts as a proof use even when its type also mentions the statement. Linear cost: 147 ms for 2000 cards.
- **decision:** Carry-over 3 refuses with the same message as the no-choice refusal. The M1 planner tests now confirm the listed dependents through a small helper (test/edit/helpers/confirm.ts) that mirrors the board's flow.
  - **rationale:** The board simply re-asks with the host's list (AT6.9).
- **decision:** Added test/gate/realFacts.test.ts, which runs the rules on recorded real Lean 4.35 facts (test-fixtures/semantic, read only), on top of the fakeFacts-based acceptance tests.
  - **rationale:** The main remaining risk was fake vs real facts (value strings, typeSort of instances). It found the flagged-definition bug and showed no spurious 'meaning changed' finding on real output.

## open_issues
- Integrator: packages/runner/test/integration/fixes.test.ts (about lines 147, 158, 173) and session.test.ts (about lines 161, 181) call ws.perform({kind:'change-kind', …, dependents}) without confirmedDependents. Under the actions.ts contract (absent = []), now implemented, they get needs-confirmation. They need `confirmedDependents` set to the listed dependents (e.g. ['cynder-not-good'], ['g1']). I did not run them (real Lean, integrator-owned).
- Until WP5 maps kindChange.confirmedDependents and WP6 posts the listed dependents, the board's dependents dialog would keep getting needs-confirmation for rewrite or mark broken. The installed extension in dist is unaffected until it is rebuilt at integration.
- WP6 owns the webview assertions of the old singular texts (store.test.ts, m1-drag.spec.ts); the files show they are already updating them.
- I did not run WP2's real-Lean gated suite (packages/runner/test/gate/rules.test.ts) because two other agents' Lean runs were active. My rules were instead cross-checked on recorded real Lean 4.35 facts. The integrator should run AT2.6–AT2.15.
- GhostView.leanName (computed by WP3 when Claude proposes) and planGhostAdoption's name can differ in rare cases, because adoption also rejects names the project's code already uses. WP3 already takes plan.leanName as authoritative after adoption.

## integration_notes
- My files: everything is in packages/core (assigned paths), plus two rows appended to docs/m2-plan.md section 14, as the brief and plan section 9 ask. That file is otherwise integrator-owned, so please review the rows.
- Consumers: runner, extension and webview all compile core from source through the `@telelean/core` path alias, so no core build is needed.
- Read-only check of the other builders' current code:
  - WP2 (runner/src/gate/engine.ts) calls checkFileChanges(B files, ws/ files), evaluateRules with base (B's facts only for the base commit), adopted (newest adopt commit), roundStart and the freeze snapshot, and normalisationChanges on a facts-less model. All match my semantics; normalisation and the formalised check are syntactic when there are no facts.
  - WP3 (runner/src/run/manager.ts) builds the DescribeContext (sentences from the board, ownership from the shadow model) and passes the unquoted revert label, which is what attemptNotice expects. It calls planGhostAdoption with the ghost's checked statement, name, run id and today's date.
  - WP4 calls diffGraphs, lifecycleChanges (on the merged files with the shown state's facts; stale facts keep the proved status by name) and proposalLabel.
- WP2's gated tests use isImplemented probes, so they now run against my real rules.
- Test fixtures: realFacts.test.ts reads test-fixtures/semantic/recorded/{spyro,extras}-facts.json and overlays/extras (read only). The carry-over tests use packages/core/test/fixtures/carryover/*.lean; the codec test reads test/fixtures/proposal/attempts.jsonl through ?raw.

## effects_outside_repo
- None. I wrote only inside /home/zhengyew/telelean/packages/core and appended to docs/m2-plan.md section 14.
- My scratch dir /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/m2-wp1/ was created and left empty.
- No network, no Lean, no Claude CLI, no systemd units, no git, no installs.
- Vitest wrote its usual result caches under the repo's node_modules (.vitest-cache, .vite-temp), which is inside the repo.

