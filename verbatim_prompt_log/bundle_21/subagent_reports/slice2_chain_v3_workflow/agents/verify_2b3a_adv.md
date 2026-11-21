# verify:2b3a:adv

Agent `ae25847510608ef79` of workflow `wf_dbef5745-55f`. Verbatim output (JSON alongside).

- **summary:** I found no blocker or major problem in 2b3a. The isolated probe holds up when I trace it end to end:
- The probe file imports only `Lean.CoreM` and `Lean.Util.FoldConsts`, and loads the model as data with `importModules … (loadExts := false) (level := .private)`.
- The check file no longer has an `#eval`, so no code that the model's instances can affect is elaborated in either job.
- A probe that is `cut` or `failed` gives no constants and becomes a check problem, with the marker set. A sandbox status of the probe job ends the refresh with that status.
- `probeFailedEnvironment` sits in `runCheck` after the build-error findings, so check, freeze, both gates and the ghost check's check can never pass on facts whose probe failed. The engine's clean-check cache is only set on `ok`.
- `checkBase` saves the base facts and then refuses the start before `openSession`. Base facts are read only by the engine.

The regenerated fixtures differ from the builder's backups only by `typeConsts` and the marker; I checked all five files by parsing and comparing the JSON.

The carry-over fixes R1-1, R1-2, R1-4 and R1-5 are correct under the stated contracts:
- R1-2's ledger filter changes only the arrow reasons and the completion check while a step runs, and the base mask's full-ledger read has no visible effect on a board taken when the queue started.
- R1-5 hides Claude's words exactly when the proof is hidden.

The remaining risk is a contract hazard behind R1-1 (F1). The cost going above 1.5 times 1d's was correctly escalated to the integrator; it is not a defect.

Tests: for every key rule I reasoned that dropping or inverting its condition makes at least one test fail. Two gaps remain: the seal convention R1-1 relies on (F1), and a keyed probe line on another line next to the real one (F2).

Effects outside the repo:
- Only my scratch dir (`tmp`, `fsmc`, an empty `tt`) and transient systemd scopes from `capped.sh`.
- Vite created and removed its temporary config file inside the existing, now-empty `packages/core/node_modules/.vite-temp` and `packages/runner/node_modules/.vite-temp`.
- No processes left, no git changes, nothing written in the repo.
- **findings:**
  - [1]
    - **id:** F1
    - **severity:** minor
    - **where:** packages/core/src/review/view.ts:703-725 (`removals`, `askedBy`); contract text at docs/slice2-plan.md:466 (§2.2 SealBy doc), docs/slice2-plan.md:1905 (§4.6), packages/core/src/review/types.ts:278, packages/core/src/review/reducer.ts:1050; §6.1 2d test list (docs/slice2-plan.md:2482-2515)
    - **problem:** R1-1's fix counts a decline against queues 1..k+1, where k is the number of seals before it in the done stack. That is right only if the session's first queue has no seal. Only the §8 'For 2d' note says so. The contract text says the opposite: 'Every queue of Claude steps starts with one' (§2.2's SealBy doc, core types.ts, the reducer's `seal` doc and §4.6). `SealBy` also includes 'formalize', which is what starts a session. So a 2d builder following the contract literally would seal the first queue too. Then queue q starts at the q-th seal, and a decline is subtracted from the queue that started after it, which is R1-1's bug again. Trace, using view.test.ts's own R1-1 scenario with a leading seal (done = [seal, seal3, decline4, decide5, decide6, seal7]): decline4 has seals=2, so it counts against queue 3, and s3 loses new-spyro-pg.
- Hidden: T shows `narrow`, although s3 asked `whole`.
- Shown, proved twin: the stage report says 'The new question … was not proved: your earlier result stands', although s3 proved T (a misleading status).
- Shown, not-proved twin: no such note, and `standingStep` picks s3, so s3's words and its 'did not finish' chip appear beside s2's standing Result.
No test would fail: every view test builds `stack.done` by hand, and §6.1's 2d list has no test that pins the seal and queue-number convention.
    - **fix:** 1. Change the four texts to 'Every queue after the session's first starts with one; the session's first queue has none'.
2. Add to §6.1's 2d list: the session's first queue writes no seal, and each later `queue-start` (Submit, mid-stage Formalize, Retry) writes exactly one seal and the next queue number, a Retry's steps included.
3. Optionally make `askedBy` independent of the convention, either by calibrating (offset = seals in done − (newest queue − 1)) or by recording the newest queue number on each decide action.
  - [2]
    - **id:** F2
    - **severity:** nit
    - **where:** packages/runner/src/semantic/probeFile.ts:100-102; docs/slice2-plan.md §8 'builder 2b3a' → 'The probe file and its reading' (~line 3425); packages/runner/test/semantic/probeFile.test.ts:106-107
    - **problem:** §8 and the builder's report say the reading is `failed` for a line carrying the probe's key at any other line number ('a forged placement'). The code does not do that. Line 100 only looks at information messages on `file.firstLine`, so a keyed message elsewhere is ignored, and a run with both the real line and such a message reads `ok`. The only test covers a keyed line alone at line 1, which fails as 'Lean printed nothing'. Nothing can be exploited today, since no model code runs in the probe job. But the stated fail-closed rule is not what the code does, and 2b3b or the integrator may rely on it.
    - **fix:** Either:
- make the code match the stated rule: return `failed` when any information message containing VALUE_PROBE_KEY sits on a line other than `firstLine`, and add a test with the recorded line plus a keyed message at line 1 that expects `failed`; or
- correct the §8 sentence and the report to say that a keyed line elsewhere is ignored.
  - [3]
    - **id:** F3
    - **severity:** nit
    - **where:** packages/runner/src/gate/engine.ts:304 (`refresh` doc); packages/runner/src/gate/findings.ts:133-137 (`unseenProofEnvironment` doc); engine.ts `runCheck`/`checkBaseNow` `build.durationMs`
    - **problem:** Comments are out of date after 2b3a:
- `refresh` is still described as '(build + check file), one Lean job', but it now runs three jobs: build, check and probe.
- `unseenProofEnvironment` still gives 'a model whose names clash with the probe's imports' as a cause, which 2b3a removed.
- `CheckReport.build.durationMs` adds the build and check times but leaves out the probe's.
    - **fix:** Update the two comments to name the build, check and probe jobs. Either add the probe's `durationMs` to `build.durationMs` or say in a comment that it is left out.
- **checks_run:**
  - Read verify_common.md, builder_rules.md, the 2b3a brief; plan §1.1 (2b3a/2b3b), §2.1 (isolated probe, failed probe, cost, recordings), §2.2/§2.6 seal and force contracts, §3.2-§3.4, §3.8, §4.6, §6.1 (2b3a and 2d lists), §8 (2c2 fixer and builder 2b3a entries)
  - Diffed every changed file against the builder's backups in b2b3a/orig (checkFile.ts, refresh.ts, engine.ts, findings.ts, scratch.ts, both index.ts files, view.ts, types.ts, the tests, README, plan), and facts.ts and edges.ts against the 2c2 recheck copies (doc-only changes)
  - Traced the isolation: probe file imports, the importModules flags, firstLine attribution, the walk (value and type, inductive constructors, inLibrary), G0's `init` and hygienic refusal and its `#eval` ban, so the model's .olean files are written only by Lean; checked that the check file has no `#eval`
  - Traced the fail-closed paths: readProbeOutput order (sandbox, cut, error, failed exit, line count, parse, type key); refresh (probe problem, consts only on ok, sandbox status return, low-memory guard, no marker when nothing was probed); classifyFacts mapping
  - Traced the engine: probeFailedEnvironment placement in runCheck and its effect on check, freeze, gate and checkGhost; cleanMirror/cleanModels caching only on ok; checkBase save then refuse; every base-facts.json reader (engine only); manager start refuses before openSession
  - Traced R1-1 (seal counting vs. the queue-number contract, Undo/Redo, Retry, D2-54), R1-2 (ledgerSeen readers, the base mask's full ledger with the queue-start working copy), R1-4, R1-5 (inWorkingCopy cases)
  - Verified with a node JSON comparison that the regenerated spyro/extras recordings and core's three Spyro facts differ only by typeConsts and the probe marker
  - Ran (capped, one worker, --no-cache, scratch TMPDIR/fsmc/TELELEAN_TEST_TMP): runner probeFile + checkFile: 19 passed; core review/view.test.ts: 58 passed; runner gate/engine.test.ts -t 'a failed probe never passes': 2 passed, 30 skipped; runner run/manager.start + gate/pure: 31 passed; runner semantic/probe.test.ts (real Lean, cap 3000): 5 passed
  - Judged test sensitivity per key rule by reasoning about inverting or dropping each condition (probe reading, refresh, engine, checkBase, isolation, R1-x); the gaps are F1 and F2
  - Checked for leftovers: no processes, an empty scratch tt, the package node_modules .vite-temp dirs empty again, git status unchanged by me
