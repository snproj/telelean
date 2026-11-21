# build:2b3b

Agent `adb253c3314a01984` of workflow `wf_4dd05c42-199`. Verbatim output (JSON alongside).

BUILDER 2b3b REPORT: the runner engine (slice 2, the review list)

I built sub-slice 2b3b as written in the plan's §1.1 entry and its §6.1 test list. Every package compiles. Every unit suite passes, and so does every runner test file the change touches, with real Lean where needed. I ran 49 mutation checks; each one made at least one test fail, and each file was restored byte for byte (checked with `cmp`). I changed no core source and no webview file, and made no git changes.

## Carry-overs
- **R1-1 (nit): fixed as proposed.** In `packages/runner/test/semantic/probe.test.ts` (the "importModules first" test), the comment now reads "The check's options: its argv and its timeout." It points to the test of the probe's lowered cap by name, not by line number. This is a comment only, so there is no behaviour and no mutation check.

## What was built (runner only)
- **G0 runs first, before any Lean job, at every purpose (AP30-1 r2).**
  - Session check, freeze and gate (with or without `CheckContext.session`), and the ghost check: G0's findings are returned as problems and counted. There is no judgement and no Lean job.
  - `judge` and `finalCheck`: the files are judged without facts. G0's findings come first in `global`, so `ok` is false. The backstop, which is pure, still runs at the final check.
  - `writePremise` and `complete`: `{ ok: false, error: G0's first message }`, with no commit.
- **Shadow**
  - New commit kinds `step-start`, `decision` and `completion`.
  - `lastCommitSince(since, kinds)`: the newest commit of those kinds at or after `since`, never an older one. It returns undefined for an unknown commit.
  - `syncMirror(files?)`: it can sync the mirror from a given file map without reading ws/.
- **Gate in a session**
  - Check, freeze and gate call `judgeState` with: the step's scope; S₀ with its facts; the step's freeze (none at the freeze itself); the session's records.
  - They decide on `stepFindings` plus the build's Lean errors (fail closed). §2.1's failed-probe rule applies, and they never decide on `ok` alone (AP30-3).
  - The freeze's permitted set is B.1's, with E(T).
- **Re-export (D2-19).** At a proved finish, when B.1's set differs from the freeze's, the challenge is built again from the freeze's own copy (`frozen/<n>/project`) and returned as the new `GateReport.freeze`.
- **The ghost check with E(T).** It uses B.1's permitted set and B.2's sources. In a session it also returns the statement's explicit form (the draft's `explicit`) and its scratch facts (the draft's `facts`), read from a second in-file probe.
- **`judge`.** It builds the head commit, reusing the facts when the mirror was last built from exactly those files, and runs `judgeState('stage')`. Premise drafts are checked again (`premiseChecks`) only when what they rely on has changed.
- **`finalCheck`**, in order:
  1. G0.
  2. Facts: reused under EN-2's rule, otherwise a fresh build.
  3. `judgeState('final')`.
  4. The backstop.
  5. The comparator for each proof of the session, only when nothing else failed. A pass recorded for the same files key and permitted set is reused.
- **`writePremise`**, in order:
  1. Normalise the premise's card.
  2. G0.
  3. Build. A failed probe answers `{ ok: false, environment }` (AP30-4); a Lean error or a failed render also answers `{ ok: false }`.
  4. Render P where it was written; `meaningMatches` compares that with the draft's explicit form.
  5. Commit the built files as `adopt`.
  6. Judge that commit.
- **`complete`**, in order:
  1. The head must be an `adopt` commit.
  2. Normalise, then G0.
  3. `statement-changed` against T's last freeze.
  4. Freeze again on the adopt state (P.holds is now permitted), with a challenge.
  5. Gate the completion as `gate-proved` with that freeze's challenge.
  6. Commit `completion`; its judgement is a stage judgement.
- **One mirror operation at a time per run.** Every engine method that uses the mirror waits for the run's earlier one.
- **`planApply`.** It reads the real files once. Any difference from B refuses the plan (`conflict`, with core's `REVIEW_TEXTS.drift`). Otherwise the plan is exactly B → F, labelled with `REVIEW_TEXTS.applyLabel`.

## Files changed
- `packages/runner/src/gate/engine.ts`: the session paths, the four new methods, the re-export, the session ghost check, the per-run lock and the facts caches.
- `packages/runner/src/gate/session.ts` (new): pure helpers (`sessionPermitted`, `sameNames`, `explicitBody`, `withG0`, `finalCheckFailures`, `finalRuleOf`, `completionScope`, `statementFactsOf`, `relianceKey`, `sessionProofTargets`).
- `packages/runner/src/gate/types.ts`: `SessionCheckContext`, `CheckContext.session`, `CheckReport.judgement?`, `GateReport.judgement?` and `.freeze?`, the four new methods, `FinalCheckReport` (with `comparator?`), `PremiseWriteReport`, `CompletionReport`, `GhostCheckInput.leanName?`, `GhostCheck.explicit?` and `.facts?`, and `EngineCore.judgeState` and `.applyBackstop`.
- `packages/runner/src/gate/scratch.ts`: the `statementFacts` option (the explicit `#print` and the statement's own probe), and reading them back.
- `packages/runner/src/gate/index.ts`: exports for `COMPLETION_STEP` and the session helpers.
- `packages/runner/src/shadow/types.ts`: the three commit kinds, `lastCommitSince`, `syncMirror(files?)`.
- `packages/runner/src/shadow/workspace.ts`: their implementation.
- `packages/runner/src/proposal/types.ts`: `ApplyRequest` and `ProposalService.planApply`.
- `packages/runner/src/proposal/service.ts`: `planApply`.
- `packages/runner/test/run/helpers/fakeEngine.ts`: the four new methods (they throw until a test scripts them).
- `packages/runner/test/run/helpers/fakeServices.ts`: `FakeProposals.planApply` (scriptable).
- `packages/runner/test/run/helpers/fakeShadow.ts`: `lastCommitSince`.
- `packages/runner/test/proposal/helpers.ts`: `lastCommitSince` in the in-memory shadow.
- `packages/extension/test/unit/realRuns.test.ts`: `FAKE_ENGINE` lists the four new methods as unused.
- `docs/slice2-plan.md`: a short additive note in §2.9 (the runner gate block) and the §8 entry "builder 2b3b".

## Tests
- **Added:** `packages/runner/test/gate/session.test.ts` (21; fake refreshFacts, plus real Lean for the re-export and G4 after it, the session freeze's B.1 set, the final comparator and its reuse, the final check's `permitted` failure, and the premise flow).
- **Added:** `packages/runner/test/gate/sessionPure.test.ts` (15, pure).
- **Updated:** `test/shadow/shadow.test.ts` (+3: the new kinds, `lastCommitSince`, `syncMirror(files)`).
- **Updated:** `test/proposal/accept.test.ts` (+2: `planApply`).
- **Updated:** `test/semantic/probe.test.ts` (R1-1's comment only).
- No test was skipped, moved to a later sub-slice, or deleted.

Every item of §6.1's 2b3b list has a test.

## Verification (each heavy job through `capped.sh`, one at a time; MemAvailable about 13.5–14.9 GB throughout)
- **Typecheck:** `capped.sh 1800 node_modules/.bin/tsc --noEmit -p` on each of `packages/core/tsconfig.test.json`, `packages/runner/tsconfig.test.json`, `packages/webview/tsconfig.json`, `packages/webview/tsconfig.node.json` and `packages/extension/tsconfig.json`. All exited 0 with no output.
- **Unit tests:** `TMPDIR=<scratch>/tmp capped.sh 1800 timeout 900 node_modules/.bin/vitest run --no-cache --fsModuleCachePath=<scratch>/fsmc --maxWorkers=1`, run in each package:

| Package | Test Files | Tests |
|---|---|---|
| core | 76 passed (76) | 1133 passed (1133) |
| webview | 19 passed (19) | 314 passed (314) |
| extension (`--no-cache`) | 22 passed (22) | 205 passed (205) |

  vitest 5 rejects `--poolOptions` ("Unknown option"), so I used `--maxWorkers=1` as the rules allow.
- **Runner:** run from `packages/runner` with `TMPDIR` and `TELELEAN_TEST_TMP` in the scratch dir, `capped.sh 3000 timeout 900 … --maxWorkers=1`, real Lean where needed:

| Runner test files | Result |
|---|---|
| `gate/session` + `gate/sessionPure` + `shadow/shadow` + `proposal/` | 9 files, 98 passed |
| `gate/engine` + `gate/pure` | 2 files, 49 passed |
| `gate/rules` + the seven `run/manager.*` | 8 files, 80 passed |
| `integration/m2flow` + `semantic/probe` | 2 files, 11 passed |
| `run/fresh.e2e` | 9 passed |
| `run/walkthrough.e2e` | 22 passed |

- No webview file changed, so there was no scratch build and no Playwright run.

## Mutation checks
49 in total, run with `<scratch>/b2b3b/mutate.py`; results are in `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b2b3b/mutation-results.jsonl`. Each entry is file:line, what I broke, and the test that failed. Line numbers are in the current files; all paths are under `packages/runner/src/`.

**`gate/engine.ts`: G0 first, failed probe, writePremise, re-export, complete**
- 743: G0's early return skipped in a session → "G0 runs first…" test.
- 1382 / 1483 / 1587 / 1646: G0 skipped in judge / finalCheck / writePremise / complete → the same G0 test.
- 861: failed-probe environment dropped on a session step → "check, freeze_statements, a proved and a not-proved finish…" test.
- 861: ok made `&& judgement.ok` → "never on the judgement's ok alone" test.
- 858: the build-error fallback dropped → the same test.
- 1601: writePremise's probe refusal dropped, and separately its `environment` field dropped → "writePremise on facts whose probe failed" test.
- 1603: writePremise's build-error refusal dropped → "a premise write on a state that does not build" test.
- 1612: `meaningMatches` no longer compares → "writePremise renders P…" test.
- 1099: re-export disabled → both re-export tests.
- 1143: re-export taken from build/ → both re-export tests. Taken from build/ with the target's `.holds` removed (a plausible wrong version) → the cheat test "…G4 still refuses it" fails on its own.
- 1705: complete's comparator uses the old freeze's challenge → "writePremise renders… complete…" test.
- 1674 / 1643: statement-changed check / adopt-head check dropped → the same test.
- 1641: the last-freeze check dropped → "complete refuses, before anything runs…" test.

**`gate/engine.ts`: judge, finalCheck, the lock, S₀, the ghost check, the freeze, validation**
- 1431: the reliance memo ignored → "judge checks a draft again…" test.
- 1424: written drafts no longer skipped → the same test.
- 1450: a failed re-check reported as `closesGap: true` → the same test.
- 1414: the partial-facts guard on re-checks dropped → "judge and finalCheck on facts whose probe failed" test.
- 1511: the final comparator loop disabled → "runs a challenge and the comparator…" test.
- 1516: a recorded pass reused whatever its files key → the same test.
- 1489: EN-2 reuse no longer needs `ok` → "judge reads the head commit's files…" test.
- 1374: judge reads ws/ instead of the head → the same test.
- 1390 / 1495: sandbox status not judged without facts in judge / not an environment in finalCheck → "judge: the files judged without facts…" test.
- 394: the per-run lock removed → "a judge and a premise write started together…" test.
- 680: S₀'s facts no longer kept → "check, freeze and gate judge with the step's scope, S₀…" test.
- 690: S₀ judged without its facts → the same test.
- 855: the gate's freeze not passed to judgeState → the same test.
- 1221: the ghost check uses the freeze's permitted set, and separately the selection's sources → "a proved finish whose B.1 set grew… the ghost check then uses E(T) too" test.
- 997: the session freeze takes slice 1's permitted set → "an arrow the step proposed before freezing…" test.
- 218: the scope-target check dropped → "a step purpose in a session needs its scope and S₀…" test.
- 1364: judge no longer requires a session → "pass validateContext…; need ctx.session" test.

**`gate/session.ts`, `gate/scratch.ts`, shadow, proposals**
- `gate/session.ts:217`: reliance key without the footprint → `relianceKey` pure test and the judge test.
- `gate/session.ts:79`: `explicitBody` keeps the header → `explicitBody` pure test.
- `gate/session.ts:125`: inference findings dropped from the final failures → the final check's `permitted` test (real Lean) and the `finalCheckFailures` pure test.
- `gate/session.ts:259`: proofs of the session found by meaning only → `sessionProofTargets` pure test.
- `gate/session.ts:87`: `withG0` keeps `ok` → `withG0` pure test.
- `gate/session.ts:64`: no derivation footprints → `sessionPermitted` pure test.
- `gate/session.ts:148`: `completionScope` with the proof closed → `completionScope` pure test.
- `gate/scratch.ts:131`: the statement probe lists the statement last → both ghost-file pure tests.
- `shadow/workspace.ts:342`: `lastCommitSince` reaches older commits → `lastCommitSince` shadow test.
- `shadow/workspace.ts:235`: `syncMirror` ignores the given files → `syncMirror(files)` shadow test.
- `proposal/service.ts:363`: `planApply`'s drift refusal dropped → the `planApply` drift test.

**Defensive lines no test reaches:**
- The check that the committed files equal the built ones, in writePremise and complete. Nothing writes ws/ while the run's lock is held.
- freeze's "did not judge the target". judgeState always judges it.
- runCheck's session without a scope. The public methods refuse that first.

## Decisions for the orchestrator to log (each is also in the plan's §8 as "builder 2b3b decided")
1. **What a session judges.** `judge` and `finalCheck` judge the shadow's newest commit from its own files (synced into the mirror from them), never ws/. A write in progress beside a judge therefore never enters a judgement. `writePremise` and `complete` judge ws/, the write in progress. *Alternative:* judge ws/ and name the newest commit, which a write in progress can make the wrong one.
2. **One mirror operation at a time per run.** Every engine method that uses the mirror waits for the run's earlier one; `normalise` does not touch the mirror and is not locked. The reason: a judge runs outside the write queue, so a premise write's build could otherwise replace the mirror under it. *Alternative:* leave it to 2d and 2f never to overlap a judge with a premise write or a render.
3. **S₀'s facts.** The engine keeps the facts of its recent builds by files key and pins the active step's S₀. After a reload it builds S₀ once, before ws/. An S₀ that does not build then is an `environment` outcome. *Alternatives:* persist S₀'s facts in the run directory; or judge S₀ without facts, which skips D2-41's meaning comparison at the step.
4. **The session step's inputs.** A session step needs `scope` and `stepStartCommit`, with the scope's target equal to the selection's (TypeError otherwise). The freeze's permitted set is B.1's, sorted into slice 1's categories over B.1's sources. *Alternative:* slice 1's set over the selection, which misses E(T) and proofs of earlier targets in the session.
5. **The re-export (D2-19).** The set is compared with the freeze's as a set. The freeze's copy is copied into a new `frozen/<m>` and its challenge built again. The new record keeps the freeze commit, round and declarations and is returned as `GateReport.freeze`. A re-export that fails is an `environment` outcome. *Alternative:* re-export into the same directory.
6. **The ghost check in a session.** It uses B.1's set and sources, and refuses fail-closed when it cannot read the explicit form or the facts. The draft's `explicit` is the value of the explicit `#print` (its header cut). Its facts are the statement abbrev and its `.holds` under `<subject>.<leanName>`, from a second in-file probe. Slice 1's ghost file is unchanged. *Alternatives:* the freeze's permitted set, which goes stale once E(T) grows; or compare whole `#print` outputs with the name substituted.
7. **judge's premise re-checks.** A draft is checked again only when its reliance key changed. The key covers the draft itself, T's statement and its meaning, B.1's set and sources, and the meaning and axioms of every name in its footprint and its statement's closure. A new draft, or any draft after a reload, counts as changed. Only drafts not yet written, of an ended inference, and neither declined nor withdrawn are checked, and only on a state whose facts are ok with the probe fine. A check telelean could not run is left out and tried at the next judge. *Alternatives:* check every draft at every judge, a Lean job each; or persist the reliance keys.
8. **writePremise commits `adopt` itself.** It commits the files it built, only after a successful build and render, and judges that commit. A failure leaves no commit. It also refuses a state with a Lean error and a render that failed. *Alternatives:* the caller (2f) commits after writePremise and judges again; or commit before the build, which leaves a stray `adopt` commit on every failure.
9. **complete.** It needs an `adopt` head and T's last freeze. "statement-changed against T's last freeze" means only the `statement-changed` findings: slice 1's other freeze-relative rules would refuse the premise's own `.holds` as an axiom added after the freeze. The completion runs as telelean's own step (`telelean-completion`) with only the proof open. Its judgement is a stage judgement of the `completion` commit. *Alternatives:* the whole freeze purpose against the last freeze; or return the `gate-proved` judgement.
10. **finalCheck.**
   - Drift is left to the caller; the engine never reads the real files.
   - The comparators run only when nothing else failed, for each inference whose `.holds` in F is a proof of this session.
   - Failures are mapped by rule, the backstop's included. `FinalCheckReport.comparator` returns the passes so 2f can record them.
   - *Alternatives:* always run the comparators; or list the backstop only in `backstop`.
11. **When Lean cannot judge.** A sandbox status, low memory or a budget means the files are judged without facts (partial, `ok` false), with the environment or budget outcome in the report. A shadow whose history cannot be read rejects `judge` and `finalCheck`. *Alternative:* a return type with no judgement.
12. **planApply.** The request is `{ shadow, readReal, finalState?, targets, nodes, realFiles? }`. Drift from its own read refuses the plan inside it; I read "plan.drift authoritative" that way. *Alternative:* return an ok plan carrying `drift`, as planAccept does.
13. **New required members.** `lastCommitSince` and `planApply`, and the four new engine methods, are required members, and the test fakes that implement these interfaces were updated. This amends the M2 contracts, which allowed only optional additions. *Alternatives:* free functions, or optional members.

## Effects outside the repo and my scratch dir
- systemd user scopes from `capped.sh`, and runLean's transient `telelean-<runId>-*` units during the Lean tests. None is left: `systemctl --user list-units 'telelean-*'` lists nothing, and the tests assert the same.
- Lean ran from the pinned toolchain binaries (`~/.elan/toolchains/leanprover--lean4---v4.35.0/bin`), read only. `~/.elan/known-projects` is unchanged (last modified Nov 17); the tests check it too.
- One direct Lean run outside the tests: `lake build` and `lake env lean --stdin` in a scratch copy of the Spyro fixture, to confirm the `#print` format of an abbrev under the explicit options. That copy has since been deleted.
- Nothing was written to `/tmp` outside the scratch dir: `TMPDIR` and `TELELEAN_TEST_TMP` pointed into it.
- No network, no installs, no git changes, no npm or npx. Nothing was written to `packages/extension/dist` or `out`: no file under them is newer than my start.
- `verbatim_prompt_log/bundle_21/prompt21_midturn.md` was modified at 16:05 by something else; I never wrote there.
- I left no processes running. The `lake serve` process on `/home/zhengyew/webring` that is running is not mine.

## Scratch files
- Saved originals: `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b2b3b/orig/`
- Mutation tooling: `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b2b3b/mutate.py`, `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b2b3b/mutations.py`, `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b2b3b/mutations.json`
- Mutation results: `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b2b3b/mutation-results.jsonl`
