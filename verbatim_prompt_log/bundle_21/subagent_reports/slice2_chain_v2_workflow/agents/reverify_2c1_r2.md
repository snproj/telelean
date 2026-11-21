# reverify:2c1:r2

Agent `af9911955570986c7` of workflow `wf_ae5f1188-533`. Verbatim output (JSON alongside).

- **summary:** Re-verification of fixer 2c1 r2. All three findings are fixed. I found one new minor problem, R2-1, a consequence of the R1-1 fix. Nothing in the repository was written.

**R1-1: fixed at the gate.** `otherResultFindings` now treats a card's statement as a statement whatever phase wrote it. So an unfrozen not-proved finish whose statement uses a definition the step wrote is refused, and the refusal asks for freeze_statements. The R1-1 scenario passes once the step has frozen.

**R1-2: fixed.** The twin text now also leaves out each overridden `.holds`, it is re-parsed in every file that holds one, and the declaration indices are mapped back to the masked file's.

**R1-3: fixed.** A card the session formalised is composed without the blank lines between its statement and its `.holds`, so both outcomes show the same code.

**Checks:**
- **Old code:** against the pre-fix sources (in a scratch copy), 7 of the 9 new tests fail.
- **Mutations:** 8 of my own, all caught and restored byte for byte.
- **Round-1 probes:** P4 and P5 (the R1-2 and R1-3 cases) now give equal boards. P1 still differs at the mask level with an unfrozen ledger, but the gate now refuses that state.
- **Extra probes:**
  - R1-2: four more layouts, all equal to the twin.
  - R1-3: refs land on their names in 6 layouts, in LF and CRLF.
  - R1-1: the gate behaves as intended on 4 more states.
- **No side effects:** the working tree matches the fixer's after snapshot, and the runner never reaches the changed code (mask-only build paths; the review code is not imported by the runner).

**Typecheck and unit tests:** tsc is clean (rc=0, no output) for all five configs. Vitest: core 75 files / 1072 tests, webview 19 / 314, extension 22 / 204, all passed.

**Effects outside my scratch dir:** none.
- All vitest runs used `--configLoader runner` and the scratch copy has no config file, so nothing was bundled into `node_modules/.vite-temp`; the `.vite-temp` and `.vitest-cache` times are unchanged.
- `packages/extension/dist` and `out` are untouched (dated Nov 19), and nothing in packages/, docs/, test-fixtures/ or node_modules is newer than my start.
- There is no `telelean-*` in `/tmp`.
- My scratch copy links to the repo's `node_modules` and `test-fixtures`, read only. No process of mine is left running.

**R2-1 (minor):** the freeze the R1-1 refusal asks for comes at the end of a failed attempt. It records that attempt's helper definitions as statement content, so they are listed while the results are hidden. A step that froze before its attempt hides them with its Result. §8 gives this exact difference as the reason for rejecting alternative (a), but §4.7's residuals do not list it.

Scratch dir: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/rv2c1r2 (the probes are in mirror/packages/core/test/rvprobe/, the mutation script in mut/run.py, the logs in the dir itself).
- **resolved:**
  - [1]
    - **id:** R1-1
    - **how:** Fixed at the gate, which is option (a) of the finding narrowed to the case that leaks.

The change, in packages/core/src/gate/sessionRules.ts `otherResultFindings`:
- `proofOwner` now never counts as proof material a name that a card binds;
- `cardContent` judges a card's statement or pin as a statement whatever phase wrote it;
- `statementText` picks `CLAUDE_SESSION_TEXTS.otherResultNotFrozen` when the active step has no freeze. That text is quoted verbatim in §4.9.

What I traced:
- The unfrozen finish of the finding's scenario (DarkChar used by pg_no_dark_past) is now refused at gate-other with the not-frozen message, and passes with the step's freeze.
- A not-proved step that gives up is rolled back to its freeze commit or to S₀ (§3.4), and a proved finish always has a freeze. So no state that passes or is kept has a card statement using a `proof`-phase definition.
- My probe (rvprobe/r11more.test.ts) also covers:
  - a new vocabulary predicate (`literal`): refused unfrozen, passes frozen;
  - an unused helper definition: passes;
  - a stage judgement with `proof` statement entries: no finding;
  - a proved state with a post-freeze definition: no finding.

Tests:
- The two new judge tests that refuse fail without the fix.
- My mutations each fail a test:
  - V1, `proof` without `!cardContent`;
  - V2, `proofOwner` excluding only `.holds`;
  - V3, the not-frozen message for any creator.

The `freeze_statements` that the refusal asks for has a side effect, reported as R2-1.
  - [2]
    - **id:** R1-2
    - **how:** Fixed in packages/core/src/project/build.ts `maskFiles` and `twinBindings`:
- the twin text leaves out every `.holds` under `codeOverride` as well as the hidden spans;
- `reread` is true whenever a file holds such a `.holds`;
- `twinDecls` drops the overridden indices, and `back()` maps the twin's `adjacentDecl`/`gapDecl` to the masked indices;
- in the fail-safe path, `keptAt` treats an overridden index as left out.

`codeOverride` covers the target's `.holds` in both outcomes (`maskedNames` puts every B `.holds` under `base`), so both twins remove it alike.

Checks:
- The round-1 probe P4 now gives no hint and equal stripped graphs.
- Four more layouts in rvprobe/r12more.test.ts are all equal to the not-proved twin:
  - the proof between two code-less cards;
  - the proof with a hidden lemma after it;
  - a hidden lemma, then the proof;
  - a namespace before the proof.
- The 3 new R1-2 tests fail on the pre-fix sources.
- Mutations caught: V4 (no re-parse for overrides), V5 (twin keeps the `.holds`), V6 (fail-safe keeps it) and V8 (no index map-back).
  - [3]
    - **id:** R1-3
    - **how:** Fixed in packages/core/src/project/build.ts `maskedCode`:
- it no longer returns undefined when nothing was taken out;
- it composes from `withoutBlankLines(gap.text)`, with `blockCommentMask` keeping comment lines and blank lines inside a block comment.

The path applies only to cards without `codeOverride` or `codeLayout` (in practice those formalised in the session), and only under the mask, so the runner and the unmasked build are unchanged.

Checks:
- The round-1 probe P5 now gives identical code for the twin, the spaced lemma and the tight lemma.
- My probe rvprobe/r13refs.test.ts places every ref on its name in the composed code, with the same ref count as the plain build, in 6 layouts × LF/CRLF:
  - tight;
  - spaced;
  - indented `.holds`;
  - multi-line statement;
  - trailing comment on the statement line;
  - a comment between.
- The 2 new R1-3 tests fail on the pre-fix sources, and mutation V7 (blank lines kept) is caught.
- The §4.7 residual is removed.
- **findings:**
  - [1]
    - **id:** R2-1
    - **severity:** minor
    - **where:** packages/core/src/review/texts.ts:574 (`otherResultNotFrozen`: "Call freeze_statements, then finish again."), used by packages/core/src/gate/sessionRules.ts:1303-1306; docs/slice2-plan.md §4.7 "Residual channels" (the fixer 2c1 r2 R1-1 bullet) and §8 "fixer 2c1 r2" (the rejection of alternative (a))
    - **problem:** The R1-1 refusal asks Claude to freeze at the end of a not-proved attempt. That freeze holds everything the step wrote except proofs: `proof-before-freeze` refuses only a proof or a carrier. So a helper definition written for the failed attempt goes into the freeze commit, is recorded `statements` (D2-43), and is listed as a visible `decl:` item while the results are hidden.

A step that froze before its proof attempt, which every proved step does, records the same helper as `proof`, hidden with its Result.

The §8 entry rejects alternative (a) for exactly this reason: "a freeze forced at the end would make a failed proof attempt's helper definitions statement content … a new difference". The chosen fix produces that difference in the cases it refuses, and only in the not-proved branch. §4.7's new residual describes only the opposite case: an unused definition stays hidden after an unfrozen finish.

The channel depends on when Claude freezes, but the refusal pushes the freeze late only in not-proved outcomes, so the outcome shows in the item list without being documented.
    - **fix:** At minimum:
- add this channel to §4.7's accepted residuals: after the freeze this refusal asks for, what the step wrote for its failed attempt that is not a proof (a helper definition or vocabulary) reads as statement content and is listed, where a step frozen before its attempt hides it with the Result;
- correct §8's reason for rejecting (a), which applies to the chosen fix in the cases it refuses.

Optionally, also word the message so that the late freeze holds statement content only: "… Remove what you wrote only for the proof attempt, call freeze_statements, then finish again." If so, update §4.9's quote and the judge test's `toContain`.
    - **evidence:** Probe /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/rv2c1r2/mirror/packages/core/test/rvprobe/latefreeze.test.ts. State: R1-1's STATEMENTS (DarkChar used by pg_no_dark_past) plus `def Helper (c : Character) : Prop := HasDarkPast c ∧ True`, which no statement uses.

Results:
- gate-other without a freeze: `["undeclared-premise/other-result: …Spyro.DarkChar was written in this step, which has not called freeze_statements…"]`;
- purpose `freeze` on the same state: `[]` (it passes), and `freezeOf(...)` holds Spyro.Helper: true;
- gate-other with that late freeze: `[]`;
- computeItems, drafts other than the Result:
  - not proved, late freeze (Helper `statements`): `[card:pg-no-dark-past, decl:Spyro.DarkChar, decl:Spyro.Helper]`;
  - proved, frozen before the attempt (Helper `proof`): `[card:pg-no-dark-past, decl:Spyro.DarkChar]`.
- **checks_run:**
  - tsc --noEmit core tsconfig.test.json (capped.sh 1800): rc=0, no output
  - tsc --noEmit runner tsconfig.test.json: rc=0, no output
  - tsc --noEmit webview tsconfig.json: rc=0, no output; tsconfig.node.json: rc=0, no output
  - tsc --noEmit extension tsconfig.json: rc=0, no output
  - vitest core (capped.sh 1800, --configLoader runner --maxWorkers=1 --no-cache --fsModuleCachePath=<scratch>/fsmc, TMPDIR and TELELEAN_TEST_TMP in scratch): 'Test Files  75 passed (75)', 'Tests  1072 passed (1072)'
  - vitest webview (same flags): 'Test Files  19 passed (19)', 'Tests  314 passed (314)'
  - vitest extension (same flags, --no-cache): 'Test Files  22 passed (22)', 'Tests  204 passed (204)'
  - The 9 new tests against the pre-fix sources, in a scratch copy of core (judge.test.ts + mask.test.ts -t 'fixer 2c1 r2'): 'Tests  7 failed | 2 passed | 157 skipped (166)'; restored, then 'Tests  166 passed (166)' on the current sources
  - Mutations in the scratch copy only (mut/run.py), each restored and checked byte for byte with filecmp against the repo file; each failed at least one test:
- V1, `!cardContent` dropped: 2 failed;
- V2, `proofOwner` excluding only `.holds`: 1 failed;
- V3, not-frozen message for any creator: 1 failed;
- V4, no re-parse for overridden `.holds`: 2 failed;
- V5, twin keeps the overridden `.holds`: 2 failed;
- V6, fail-safe ignores `overrideAt`: 1 failed;
- V7, blank lines kept: 2 failed;
- V8, no index map-back: 1 failed.
  - The round-1 reviewer's probes re-run on the current code:
- P4 (moved `.holds`): masked hints [] and [], strip(graph) equal: true;
- P5 (new card): twin, spaced and tight code identical;
- P1 (unfrozen ledger): still differs at the mask level, but that state is now refused at gate-other;
- P2 'holds before its statement': codeLoc differs, the same failure as on the pre-fix code (positions are stripped by buildSessionView), so it is not from this round.
  - Extra probes:
- r12more: R1-2 on 4 more layouts, all equal to the twin;
- r13refs: R1-3 refs placement in 6 layouts × LF/CRLF, all correct;
- r11more: R1-1 gate on a vocabulary axiom, an unused helper, a stage judgement and a proved state;
- latefreeze: the evidence for R2-1;
- extrapin: an extra `lean:` pin passes the gate, an older behaviour I did not report.
  - The working tree matches the fixer's after.diff, packages/extension/dist and out aside (the user's Nov 19 build, untouched); no repo file is newer than my start; node_modules/.vite-temp and .vitest-cache mtimes are unchanged; there is no telelean-* in /tmp
