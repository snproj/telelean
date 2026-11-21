# build:2b1a

Agent `a4cc08a9a1954564a` of workflow `wf_ae5f1188-533`. Verbatim output (JSON alongside).

# Builder 2b1a report

Sub-slice 2b1a is done: the rules are out of `evaluate()`, and `evaluateRules`' output is byte-identical on every test state. All six open findings from the 2a review are fixed. Every package typechecks and every unit suite passes.

R1-4 is a docs-only fix, so it has no test. R1-5's case cannot be reached by any test, so its mutation survives, as expected.

Only `packages/core` source files and `docs/slice2-plan.md` changed. Git state is as I found it: HEAD 187673d, nothing staged, no commits.

## Carry-overs from the 2a review (done first)

**S-V2A-S2: fixed.**
- An Undo now checks the Accepts it restores with the visibility at the moment it is asked.
  - An item hidden then, or after the Undo, takes the silent path.
  - A listed item gets the refusal a by-hand Accept would get at that moment. A dependency hidden then reads "waits for the results to be shown" and is never named.
- The answers of `decide` and Undo (`cascade`, `events`) now name only items listed both before and after the action.
- §8's fixer 2a line on hidden items (l.2875) is corrected.

**R1-1: fixed.**
- Un-reject now reads the declining action's `takenOut`.
- A premise that comes back is written again: its record gets its card and written key back, and it is listed in `reapply`.
- A premise whose status keeps it out goes to `premises.takeOut`, with its card on the record so the runner can plan that take-out.
- I added a guard the finding did not ask for: a premise written again since keeps its new card. Without the guard, its card was overwritten with the old one.
- `ItemWrite`'s comment and the plan's "For 2e" bullet are corrected.

**R1-2: fixed.** The reveal `SessionAction` gains required `takenOut` and `commits`, shaped like decide's. Undo handles both action kinds, and an Undo whose action made commits always has a write naming it.

**R1-3: fixed.** All 8 untested paths now have tests, each failing under its mutation.

**R1-4: fixed (docs only).** `ReviewState.deps` has one source, stated in types.ts, plan §2.9 and the "For 2e" bullet.

**R1-5: fixed.** `leftText` uses `leftNeedsOption`, and §3.5 now points to the content refresh. No test can reach this case: the left reasons that get turned into text come from `planGroupAccept`, which never gives `needs-option`.

## The 2b1a refactor (`gate/rules.ts`)
- Nothing new: no rule, finding code or token. `gate/index.ts` and `evaluateRules`' signature are unchanged.
- `RuleContext`, built by `ruleContext(input)`, holds everything the rules share.
- Each rule is an exported helper: `buildFindings`, `newAxiomFindings`, `existingChangedFindings`, `adoptedGhostFindings`, `notProvedFindings`, `statusMismatchFindings`, `statementChangedFindings`, `footprintFindings(ctx, buildFailed)`, `undeclaredPremiseFindings`, `sorryAxiomFindings`, `vocabularyShapeFindings`, `markupFindings`, `readyCards` / `readinessFindings(ctx, ready)`, `malformedBindingFindings(ctx, ready)`, `proofBeforeFreezeFindings`, `exampleFindings`, `notFrozenFindings`.
- Also exported: `flagged`, `formalisedThisRunOf`, and `orderFindings` (the report's order).
- `evaluate` is now just their composition.

**How equivalence was checked.**
- I did 17 moves, one at a time. After each, core tsc and the gate suites ran through a differential harness kept in my scratch dir. The harness made every `evaluate` call also run the untouched original and fail on any byte difference in the report's JSON.
- All 221 calls in the gate suites matched at every move.
- At the end, 192 calls in the runner's real-Lean files also matched.
- I first confirmed the harness catches a key-order change that the tests themselves ignore.

## Files changed
- `packages/core/src/gate/rules.ts`: the refactor.
- `packages/core/src/review/reducer.ts`: S-V2A-S2, R1-1, R1-2, R1-5.
- `packages/core/src/review/types.ts`: the reveal action's `takenOut` and `commits`; the `ItemWrite` and `ReviewState.deps` comments.
- `packages/core/test/gate/ruleHelpers.test.ts`: new.
- `packages/core/test/review/reducer.test.ts`, `reconcile.test.ts`, `reveal.test.ts`: tests.
- `docs/slice2-plan.md`: §2.2, §2.9 (the `ItemWrite` and `ReviewState` code blocks), §3.5's bullet, the corrected §8 fixer lines and "For 2e" bullets, and the new §8 "builder 2b1a" entry.

## Tests
**Added in `test/gate/ruleHelpers.test.ts` (9):**
- `orderFindings` on no finding, one finding and many.
- `evaluateRules` equals the helpers' composition on 10 states in 6 purposes.
- Each helper applies only to the purposes it names.
- The context's derived values.
- Five gaps that my mutation checks found in the existing gate suites:
  - a declaration without facts in a stale file fails closed when the build found nothing;
  - a ready card bound to a non-Prop declaration gives one `not-formalised` finding, not two;
  - the report is in its own order, not the order the rules ran;
  - an adopted ghost counts as a chosen card;
  - a name only Lean reports, inside the person's unchanged declaration, is not judged.

**Added in `reducer.test.ts` (11):**
- an Undo asked while hidden answers alike, P1 and P1b;
- a decision that shows the results names no hidden Result (proved and not-proved copies alike);
- an Undo asked while the results are shown reads dependencies as shown (pins my decision 3 below);
- an Undo whose action made commits names it in its write;
- an Undo whose taken-out premise must stay out takes it out again;
- an Undo that silently keeps a decided item leaves it out of `taken`;
- un-reject of an item that stays taken out brings back no dependent;
- R1-1: a premise comes back written;
- R1-1: a premise kept out is taken out again;
- R1-1: a premise written again since keeps its new card;
- an Undo right after the decided-force Accept (P3).

**Added in `reconcile.test.ts` (3):** F5's content refresh; the proposed-again content refresh; a Result first seen in a partial judgement records no `judged`.

**Updated:**
- reducer: the V2A-S4 test, now with a written premise returned at Show results (R1-2);
- `reveal.test.ts`: the reveal action's shape gains `takenOut` and `commits`.

Skipped for later and deleted: none. No existing gate test changed.

## Verification (MemAvailable 13.5–14.2 GB throughout)
`S` is `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad` and `B` is `$S/b2b1a`.

- **tsc**: in each package dir, `TMPDIR=$B/tmp $S/capped.sh 1800 /home/zhengyew/telelean/node_modules/.bin/tsc --noEmit -p <cfg>`. All five configs exit 0 with no output: core and runner `tsconfig.test.json`, webview `tsconfig.json` and `tsconfig.node.json`, extension `tsconfig.json`.
- **vitest**: `TMPDIR=$B/tmp $S/capped.sh 1800 …/vitest run --no-cache --fsModuleCachePath=$B/fsmc --maxWorkers=1`.

| Suite | Result |
|---|---|
| core | `Test Files 65 passed (65)`, `Tests 776 passed (776)` (baseline 64 / 753) |
| webview | `19 passed (19)`, `313 passed (313)` |
| extension | `22 passed (22)`, `203 passed (203)` |

- **Runner, real Lean, through the harness**: from `packages/runner`, `TELELEAN_TEST_TMP=$B/rtmp … $S/capped.sh 3000 timeout 900 …/vitest run --root . --config $B/diff/vitest.runner.diff.config.mjs …`.

| File | Tests | `evaluate` calls compared, all identical |
|---|---|---|
| `test/gate/rules.test.ts` | 26 passed | 32 |
| `test/gate/engine.test.ts` | 30 passed | 0 (it injects fake rules) |
| `test/run/fresh.e2e.test.ts` | 9 passed | 43 |
| `test/integration/m2flow.test.ts` | 5 passed | 23 |
| `test/run/walkthrough.e2e.test.ts` | 22 passed | 94 |

  `walkthrough.e2e` "(a) normative", listed as a known failure, passed here.
- **Runner, own config**: `test/gate/rules.test.ts` and `test/gate/engine.test.ts` gave `Tests 56 passed (56)`.
- **Not run**: the webview scratch build and Playwright, because the webview was not touched.

## Mutation checks
Each mutation was applied to the repo file and the file restored byte for byte; `cmp` confirmed identical every time. Logs are in `$B/mutation_review_final.txt` and `$B/mutation_gate_final.txt`.

**Carry-overs (22 mutations; review tests):**
- **S-V2A-S2**:
  - `reducer.ts:1125`, silent path only for items hidden after the Undo: the P1/P1b test fails.
  - `:1040`, dependency gate read after the Undo: P1/P1b fails.
  - `:1140`, `shown && shownAfter`: the "Undo asked while the results are shown" test fails.
  - `:923`, decide's answer read after the action: the revealing-decision test fails.
  - `:1171`, Undo's answer read after the Undo: P1 fails.
- **R1-1**: `:441` takenOut ignored, `:573` card not restored, `:575` not in reapply, `:586` no take-out again, `:584` card not set, `:559` guard removed. Each fails an R1-1 test.
- **R1-2**: `:1157` takenOut read only for decide: the V2A-S4 test fails. `:962` reveal action without the fields: 5 tests fail.
- **R1-3**: `:1114`, `reconcile.ts:268`, `reconcile.ts:291`, `:560`, `:1168`, `:1164`, `reconcile.ts:181`, `:1143`. Each fails its new test.
- **R1-5** `:341`: survives, expected (the case is unreachable).

**Refactor (31 mutations; gate tests):** all 31 are caught.
- Each rule dropped from the composition (`rules.ts:389`–`405`).
- `buildFailed` forced false or true (`:386`).
- `ready` replaced by `[]` (`:402`).
- The report's order swapped (`:428`) or skipped (`:408`).
- Each part of the report dropped (`:409`–`412`).
- Context values broken: `targetProofNew` `:325`, `exempt` `:224`, ghosts left out of `chosen` `:229`, detached statements `:239`, `factsOnlySince` `:291`.

Before I added the five gap tests, these five survived: `buildFailed` forced true, `ready` as `[]`, order skipped, ghosts out of `chosen`, and `factsOnlySince` judging everything. The gap tests now catch them.

## Decisions for the orchestrator to log (all also in plan §8)
1. **Helper shape.** Each helper takes the context, plus only what one rule passes another explicitly (`buildFailed`, `ready`), and returns its findings. `orderFindings` sorts them. 2b1b can build one context per judged inference. *Alternative:* helpers that push into one shared map, or recompute everything from the input.
2. **Exports.** The helpers are exported from `gate/rules.ts` only, not from `gate/index.ts`, which is M2's frozen contract. *Alternative:* export them from the index, an additive contract change.
3. **S-V2A-S2, dependency visibility.** A listed restored Accept's dependencies are read with the visibility when the Undo is asked (`shown`). An Undo asked while the results are shown therefore never gets "waits for the results to be shown". *Alternative:* the finding's `shown && shownAfter`.
4. **S-V2A-S2, answer rule.** The rule that answers name only items listed before and after applies to `decide` too, not only Undo. Otherwise a Reject that shows the results named hidden Results, and its answer differed between a proved and a not-proved copy. *Alternative:* Undo only.
5. **R1-1, approach.** The finding's main fix (un-reject reads `takenOut`). *Alternative:* keep a written premise's take-out out of the decision commit.
6. **R1-1, written-again guard.** A premise written again since is left as it is: the merge of its old take-out changes nothing or conflicts, and the runner refuses it. *Alternative:* the reducer refuses the un-reject itself, which needs a new text.
7. **R1-2.** `takenOut` and `commits` are required on reveal actions, not optional. *Alternative:* optional fields.
8. **R1-4.** No per-record edges are persisted and merged in for items whose facts are missing. *Alternative:* persist each record's last full-judgement edges and union them in.
9. **R1-5.** Keep and use `leftNeedsOption`. *Alternative:* delete the text.
10. **Gap tests location.** The five gap tests are in a new file, so every existing gate test stays unchanged. *Alternative:* add them to `rules.test.ts` and `carriers.test.ts`.

## Effects outside the repo and my scratch dir
- **Vite temp folders.** Vite briefly wrote and deleted its bundled config in four existing `node_modules/.vite-temp` folders: the repo root's, core's, runner's and webview's. All four are empty again.
- **Systemd scopes.** `capped.sh` created transient systemd user scopes, which ended with each job.
- **Lean temp files.** Real-Lean temp projects went under `$B/rtmp`, which is empty again.
- **Untouched.** Nothing was written to `packages/extension/dist` or `out` (no file there is newer than my start), to `~/.npm`, `~/.elan` or the repo's `node_modules/.vitest-cache`.
- **Not mine.** The new files under `verbatim_prompt_log/bundle_21/subagent_reports/slice3_design_workflow/` appeared during my session but were written by another workflow; I did not touch them.
- **Running processes.** I left no processes running. The Lean server for `~/webring` predates my session (started 09:43) and is not mine.

