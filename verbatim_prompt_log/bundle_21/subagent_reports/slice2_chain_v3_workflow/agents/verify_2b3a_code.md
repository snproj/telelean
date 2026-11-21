# verify:2b3a:code

Agent `ad49e5cab45cde3ab` of workflow `wf_dbef5745-55f`. Verbatim output (JSON alongside).

- **summary:** I found no blockers or majors in sub-slice 2b3a. The isolated probe matches §2.1 and D2-75: `probeFile.ts` and the `modules` form of `valueProbeLines`, refresh's probe job with the memory guard, the check's options and the marker, the second check run removed, and the fail-closed reading. So do the engine's rule for a failed probe (check, freeze, both gates, the ghost check's check of ws/) and the start refusal in `checkBase`. The carry-over fixes R1-1 to R1-5 are correct.

Every verification command I ran passed: all five typechecks, the core, webview and extension suites, and 10 runner files, including the real-Lean probe, refresh and end-to-end files. I spot-checked the builder's mutation claims on scratch copies:
- 8 of 9 `view.ts` mutations were caught. The 9th (completion reading the full ledger) behaves the same as the original, because completion entries are never filtered.
- All 11 runner mutations were caught: 6 on `readProbeOutput`, 3 on the engine and findings, and 2 with real Lean (refresh no longer reporting a failed probe, and `loadExts := true`).

The regenerated facts differ from before only by `typeConsts` and the marker, in all 5 files. Nothing in webview or extension changed.

Still open, and not a code defect: the probe cost (refresh peak 567 → 954 MB, time 0.97 → 1.48 s) is above the plan's 1.5× threshold. The integrator must decide this before 2b3b, and the user's machine is RAM-tight. On today's path, a probe that fails at the gate triggers the manager's existing environment handling: one retry, then the run stops. That matches 1e's handling of the unseen-proof case.

Remaining findings: 1 minor and 3 nits (below).

Effect outside my scratch dir (my mistake, now reverted): at 13:27:25 a symlink loop I ran to set up a scratch copy for the mutation checks accidentally created 18 links inside the repo's `node_modules`. Each scope folder got a link to itself (`node_modules/@types/@types`, `@telelean/@telelean`, `@vitest/@vitest`, `@babel/@babel`, and 14 others). I removed all 18 by literal path at about 13:28-13:29 and checked that none remain and that the original `@telelean/{core,runner,webview}` links are intact; only the scope folders' modification times changed. All my typechecks ran before 13:27. If any other job saw a TS2688 error or odd module resolution for a scope like '@types' between 13:27:25 and 13:29, I caused it.

Otherwise I wrote only in `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2b3a-code`. Vitest created and emptied its usual `.vite-temp` folders in the packages' `node_modules`, as in every earlier sub-slice. I made no git changes, used no network, and left no processes or systemd scopes running.
- **findings:**
  - [1]
    - **id:** V2B3A-C1
    - **severity:** minor
    - **where:** packages/core/src/review/view.ts:697-725 (`removals`/`askedBy` seal arithmetic) vs docs/slice2-plan.md §2.2 `SealBy` doc (line ~466) and §4.6 (line ~1905)
    - **problem:** R1-1's fix assumes queue q ≥ 2 starts at the (q−1)-th seal, which holds only if the session's first queue has no seal. That assumption appears only in a §8 'For 2d' note. The contract text says the opposite: 'Every queue of Claude steps starts with one (D2-63)' (§2.2 SealBy doc and §4.6). The first queue is itself started by a Formalize (`SealBy` 'formalize'), so 2d could seal it. Then a decline made after k later queue starts would count k+1 seals, and the rule would also subtract it from queue k+2, which started after the decline. That is exactly the R1-1 bug (a re-asked source wrongly removed while hidden, and the re-ask note inverted). The core tests use hand-built stacks without an initial seal, so nothing would fail.
    - **fix:** Make the invariant part of the contract: change §2.2's SealBy doc and §4.6 to 'every queue after the session's first starts with one; the first queue has none', and give 2d a test that the session's first queue writes no seal. More robust alternative: record the queue number on the seal action (`{kind:'seal', by, at, queue}`) and count a decline against steps with `step.queue <= newest sealed queue before it` (1 when none).
    - **evidence:** view.ts:707 `if (action.kind === 'seal') sealsSoFar += 1;` and :724 `step.queue <= l.seals + 1`; plan line 466 '/** UN-5's sealing actions. Every queue of Claude steps starts with one (D2-63).'; line 1905 'Every queue starts with one'; §8 line 3430 'For 2d: … the session's first queue has no seal'.
  - [2]
    - **id:** V2B3A-C2
    - **severity:** nit
    - **where:** packages/runner/src/gate/engine.ts:434 and :523; packages/runner/src/proposal/service.ts:393; packages/core/src/review/view.ts:428
    - **problem:** Reported Lean durations now leave out the probe job. These sites add up `facts.build.durationMs + facts.check.durationMs`. Before 2b3a the in-file probe ran inside the check job, so its time was included. Now it is only in `facts.probe.durationMs` (about 0.6 of 1.48 s on Spyro), so the 'checked in …' and `CheckReport.build.durationMs` figures drop even though the refresh got slower. Display only: no budget reads them.
    - **fix:** Add `+ (facts.probe?.durationMs ?? 0)` at the four sites, or add a helper `leanDurationMs(facts)` in core and use it everywhere.
    - **evidence:** grep: `durationMs: facts.build.durationMs + facts.check.durationMs` at engine.ts:434, :523, service.ts:393, view.ts:428; refresh.ts writes the probe job's time only to `probe.durationMs`.
  - [3]
    - **id:** V2B3A-C3
    - **severity:** nit
    - **where:** packages/runner/src/semantic/probeFile.ts:100-102; docs/slice2-plan.md §8 'builder 2b3a' probe-reading bullet (line ~3425)
    - **problem:** The §8 decision (and the builder's report) says the reading is `failed` 'for a line with the key at any other line (a forged placement)'. The code keeps only key-bearing information messages at `file.firstLine` and ignores every other one. A keyed message at another line therefore causes `failed` only when no genuine line exists. Next to a genuine line it is ignored and the reading is `ok`. The probeFile test checks only the lone-message case. Low impact, since no model code runs in the isolated job, but the documented fail-closed property is stronger than the code.
    - **fix:** Either fail on any key-bearing message off the `#eval` line, e.g. `const keyed = messages.filter((m) => m.data.includes(VALUE_PROBE_KEY)); if (keyed.some((m) => m.line !== file.firstLine || m.severity !== 'information')) return failed('Lean printed the probe\'s key off its line');`, and add the genuine-plus-forged case to probeFile.test.ts; or correct the §8 sentence to 'a line with the key only at another line'.
    - **evidence:** probeFile.ts:100 `const lines = messages.filter((m) => m.severity === 'information' && m.line === file.firstLine && m.data.includes(VALUE_PROBE_KEY));` and nothing else looks at keyed messages; probeFile.test.ts:106-108 tests only a single keyed message at line 1 or a warning at line 3.
  - [4]
    - **id:** V2B3A-C4
    - **severity:** nit
    - **where:** packages/runner/src/semantic/checkFile.ts:105-118 (`valueProbeLines`); packages/runner/test/semantic/checkFile.test.ts ('Empty, single and many names: one entry each')
    - **problem:** `valueProbeLines([], …)` writes `(("").splitOn " ")`, and in Lean `"".splitOn " "` is `[""]`. So the probe would print one entry (null, for the empty name) for zero probed declarations, and `parseValueProbe(line, [])` would always fail ('listed 1 entries for 0 declarations'). The new edge-case test asserts only the literal and its comment claims 'one entry each', so it does not test what it says. Production never reaches this: `generateProbeFile` throws on no declarations, refresh checks `probed.length > 0`, and the ghost file always probes its check theorem.
    - **fix:** Have `valueProbeLines` throw a TypeError on empty `names`, as it already does for empty `modules`, and change the test to expect the throw instead of the literal.
    - **evidence:** checkFile.test.ts: `expect(valueProbeLines([], 'Model', { modules: ['Model'] })[3]).toContain('(("").splitOn " ")');` under the comment 'Empty, single and many names: one entry each, in order'.
- **checks_run:**
  - Diff isolated: reconstructed the pre-2b3a versions from verbatim_prompt_log/bundle_21/evidence/patches/after_slice_2c2.patch (they match the builder's backups in b2b3a/orig byte for byte) and diffed 36 changed files; also ran snapdiff.sh to /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2b3a-code/now.diff (369 files)
  - Regenerated facts check (python, all 5 files: core spyro-facts, spyro-proved-facts, spyro-derived-facts; recorded spyro-facts, extras-facts): identical after removing typeConsts and probe; every declaration has typeConsts right after valueConsts; markers {status:'ok', durationMs:600} for core's files and {status:'ok', durationMs:0} for the recordings
  - capped.sh 1800 tsc --noEmit -p packages/core/tsconfig.test.json: exit 0
  - capped.sh 1800 tsc --noEmit -p packages/runner/tsconfig.test.json: exit 0
  - capped.sh 1800 tsc --noEmit -p packages/webview/tsconfig.json: exit 0
  - capped.sh 1800 tsc --noEmit -p packages/webview/tsconfig.node.json: exit 0
  - capped.sh 1800 tsc --noEmit -p packages/extension/tsconfig.json: exit 0
  - core vitest (--maxWorkers=1 --no-cache --fsModuleCachePath=scratch, TMPDIR=scratch): 'Test Files  76 passed (76)' / 'Tests  1131 passed (1131)'
  - webview vitest: 'Test Files  19 passed (19)' / 'Tests  314 passed (314)'
  - extension vitest --no-cache: 'Test Files  22 passed (22)' / 'Tests  205 passed (205)' (out/ and dist/ untouched)
  - runner (capped 3000, timeout 900, TELELEAN_TEST_TMP=scratch) semantic/checkFile + semantic/probeFile + gate/pure: 'Test Files  3 passed (3)' / 'Tests  34 passed (34)'
  - runner semantic/probe.test.ts (real Lean): 'Tests  5 passed (5)'
  - runner semantic/refresh.test.ts (real Lean, no UPDATE_SEMANTIC_RECORDINGS; recordings' mtimes unchanged): 'Tests  9 passed (9)'
  - runner semantic/valueProbe.test.ts (real Lean): 'Tests  2 passed (2)'
  - runner gate/engine.test.ts (real Lean): 'Tests  32 passed (32)'
  - runner run/manager.start.test.ts: 'Tests  16 passed (16)'
  - runner integration/session.test.ts (real Lean): 'Tests  8 passed (8)'
  - runner gate/rules.test.ts (real Lean, ghost check): 'Tests  26 passed (26)'
  - runner run/fresh.e2e.test.ts (real Lean): 'Tests  9 passed (9)'
  - runner run/walkthrough.e2e.test.ts (real Lean): 'Tests  22 passed (22)'
  - Mutation spot-checks on a scratch copy of core (baseline 'Tests  58 passed (58)'): R1-1 old rule, off-by-one, seals not counted, note filter removed; R1-2 no filter, unknown step kept; R1-5 words always shown; R1-4 fallback inverted: each 'Tests  1 failed' or '2 failed'; completion reading the full ledger: 58 passed (behaves the same: completion entries are never filtered)
  - Mutation spot-checks on a scratch copy of the runner: probeFile cut/error/two-lines/no-type-key/line-number/failed-exit (each 'Tests  1 failed | 5 passed (6)'); findings loosened to empty-only, runCheck rule removed, checkBase refusal removed (each 'Tests  1 failed | 1 passed | 30 skipped (32)'); real Lean: refresh not pushing the probe problem and loadExts := true (each 'Tests  1 failed | 4 skipped (5)'); all files restored (cmp)
  - Code review: findings.ts, engine.ts (runCheck, checkBase, freeze/gate/checkGhost handling of the env report), scratch.ts, refresh.ts (probe job, guard, marker, sandbox statuses), checkFile.ts (Lean walk text), probeFile.ts; manager handling of environment outcomes (not counted, lastModel); core closure/deps self-reference of an inductive's own name (harmless: deps.ts filters c !== name, closure uses seen); view.ts R1-1/R1-2/R1-5 against reducer.ts question changes and the plan's queue numbering (Retry gets a new queue number)
  - Leftovers: no processes or systemd scopes of mine; the lake/lean server processes running are the user's webring project. Accidental writes: 18 self-referencing symlinks in node_modules/@*/ created at 13:27:25 and removed by literal path about 13:28-13:29; checked that none remain
