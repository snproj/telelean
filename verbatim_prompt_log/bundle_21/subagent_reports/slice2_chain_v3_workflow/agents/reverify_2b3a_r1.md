# reverify:2b3a:r1

Agent `a14a0c956a7d6793d` of workflow `wf_dbef5745-55f`. Verbatim output (JSON alongside).

- **summary:** All 12 findings of this round are resolved. They cover 9 distinct defects, because S3 = C3 = A-F2, S4 = C2 (part of A-F3) and C1 = A-F1. I traced every fix. For each code fix I also ran the new tests against the pre-fix code in a scratch copy (/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/rv2b3ar1/mut), and each one failed there and passes on the fix. For S2 (a tests-only fix) I broke two of refresh's probe rules in the copy, and the new test caught both.

Results of my own runs:
- tsc: clean in all five configs.
- vitest: core 1133/1133 (76 files), webview 314 (19 files), extension 205 (22 files).
- Runner, with real Lean: the whole suite passed, 63 files, 606 passed and 1 skipped (the opt-in real-Claude test). I ran all of it because the stricter probe reading affects every real refresh.

The fixer chose AP-33's behaviour for S1: a probe job that runs out of memory is now an `environment` outcome at every purpose and at the start. A probe timeout stays a counted budget finding, and the start still refuses a probe timeout with the "your files have Lean errors" text. Both are logged as decisions with alternatives.

One new nit: R1-1, a stale comment in probe.test.ts. It is the leftover of S2's 'where'.

Effects of my work:
- No repo file changed.
- vitest's config loader wrote and removed its temporary config file in the repo's existing, empty `node_modules/.vite-temp` folders (root, core, runner, webview).
- capped.sh and runLean created transient systemd user scopes; none are left.
- The Lean toolchain was used read-only. `~/.elan/known-projects` is unchanged and `~/.cache/lake` does not exist.
- No processes of mine are left.

Logs are in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/rv2b3ar1.
- **resolved:**
  - [1]
    - **id:** S-V2B3A-S1
    - **how:** Fixed in code, matching AP-33.
- **The rule:** `classifyFacts` (runner gate/findings.ts:90-103) returns an `environment` outcome through `probeOomEnvironment` when both `facts.status` and `facts.probe.status` are `oom`. This is exactly what refresh.ts:534-536 writes when the probe job is killed. A build or check kill returns before the probe and has no marker, so it stays budget.
- **Coverage:** `runCheck` and `checkBaseNow` both call `classifyFacts`, so the rule holds at check, freeze, both gates, the ghost check and checkBase. checkBase returns before `saveBaseFacts`, so no base facts are kept.
- **The text:** it names telelean's probe plus runLean's detail ('memory cap X exceeded').
- **The manager:** check_lean does not count it. The gate retries once after 30 s and then stops the run as 'not Claude's fault'. The start refuses with 'telelean could not run Lean on your files (…); nothing was sent to Claude'.
- **Docs:** §2.1, D2-75, §6.1 and §8 are updated.
- **Fails without the fix:** with the branch dropped in a scratch copy, gate/pure 'lets Lean results through…' fails (budget vs environment) and the engine S1 test fails (problems vs environment).
- **Kept as budget:** the probe's timeout (a logged decision).
  - [2]
    - **id:** S-V2B3A-S2
    - **how:** A new real-Lean test (probe.test.ts:403ff., through `RefreshHooks.runLean` via `spiedJobs`) covers all three rules:
- the probe's cap is `spawnMemoryMax('4G', 3 GiB, 2 GiB)` = '2048M', while the build and the check keep '4G';
- the probe still runs after a fake check whose imports failed, its marker is kept, and the detail names both causes when the probe also fails;
- an odd-name model runs only build and check, with no marker.

Mutations in my scratch copy:
- the probe cap set to `options.memoryMax`: the test fails ('4G' vs '2048M');
- the probe skipped after header errors: the test fails (jobs ['build','check']);
- unmutated: it passes.

The fixer's mutation 17 covers the nothing-probed guard.
  - [3]
    - **id:** S-V2B3A-S3
    - **how:** The code now matches §8. probeFile.ts:104-106 fails the reading on any message containing the key that is not an information message at `firstLine`, whether it is alone or beside the real line. Messages without the key are still ignored.
- **Tests:** new cases at probeFile.test.ts:106-115.
- **Fails without the fix:** with the pre-fix probeFile.ts the test fails ('Lean printed nothing for the probe' vs "Lean printed the probe's key outside its line (information at 1:0)").
- **No false failures:** the whole runner suite, every real refresh included, passes with the stricter rule.
  - [4]
    - **id:** S-V2B3A-S4
    - **how:** Core `leanDurationMs` (facts.ts:240-242) adds the build, check and probe times. It is used at all four sites: engine.ts:438 and :527, proposal/service.ts:394 and view.ts:428. A grep finds no other duration sum left, and the hidden view still shows no duration.

The pre-fix copies fail the new tests:
- view: 1200 vs 1207;
- engine: 120 vs 127;
- proposal/build AT4.1 (real Lean): 893 vs 1527; it passes on the fixed copy.
  - [5]
    - **id:** S-V2B3A-S5
    - **how:** D2-75 now carries:
- the measured cost, accepted by AP-33 (567→954 MB, 0.97→1.48 s);
- the `readModuleData` alternative;
- the probe-oom rule;
- both size figures: about 500,000–650,000 declarations, but about 13,000 when each lists ~100 constants.

§2.1's Cost note says AP-33 accepted the cost, points to D2-75, and gives the 13,000 caveat.
  - [6]
    - **id:** C-V2B3A-C1
    - **how:** The convention is now the contract text everywhere it is stated:
- plan §2.2 SealBy doc;
- §4.6;
- the summary bullet;
- core review/types.ts SealBy;
- reducer.ts `seal` doc.

It says every queue after the session's first starts with exactly one seal, written in its `queue-start`; the first queue has none. This agrees with §2.6, where `queue-start` is only for queues in a stage, and with `PersistedStep.queue`, where the first queue is numbered 1. §6.1's 2d list (line 2499) now has the test that pins it.

Nothing contradicts it today: no runner code writes a seal yet (grep finds only the reducer's generic action), and no core test seals a session's first queue. The view's arithmetic (`step.queue <= seals + 1`) is correct under this contract.
  - [7]
    - **id:** C-V2B3A-C2
    - **how:** Same fix as S-V2B3A-S4: `leanDurationMs` is used at all four sites, and the pre-fix code fails each new test.
  - [8]
    - **id:** C-V2B3A-C3
    - **how:** Same fix as S-V2B3A-S3: a keyed message beside the real line now fails the reading, and the pre-fix code fails the new probeFile test.
  - [9]
    - **id:** C-V2B3A-C4
    - **how:** `valueProbeLines` throws a TypeError on empty names (checkFile.ts:108). The test expects the throw in the isolated, in-file and followMain forms. With the pre-fix checkFile.ts the test fails ('expected function to throw an error, but it didn't'). No caller passes no name: `generateProbeFile` guards against it, and the ghost check always lists its check theorem.
  - [10]
    - **id:** A-F1
    - **how:** Same as C-V2B3A-C1:
- items 1 and 2 are done: all four texts are changed, and the 2d test is in §6.1;
- item 3 was optional and is logged as the alternative in §8.
  - [11]
    - **id:** A-F2
    - **how:** Same fix as S-V2B3A-S3: the code now does what §8 states, and the stray-key tests fail on the pre-fix code.
  - [12]
    - **id:** A-F3
    - **how:** - **engine `refresh` doc:** now names the build, check and probe jobs under one `runExclusive`. This is true: `refreshFacts` runs all three inside it.
- **`unseenProofEnvironment` doc:** drops the import-clash cause and says `probeFailedEnvironment` runs first. That is correct: it runs in `runCheck` (:471), before the gate's `unseenProofEnvironment` (:708).
- **`CheckReport` docs:** updated.
- **Durations:** fixed as in S-V2B3A-S4.
- **findings:**
  - [1]
    - **id:** R1-1
    - **severity:** nit
    - **where:** packages/runner/test/semantic/probe.test.ts:175 (the 'importModules first' test)
    - **problem:** The comment 'The check's options: its timeout, its argv, its (lowered) cap.' still says this test compares the probe job's lowered cap with the check's. The test asserts only `argv` and `timeoutMs` (lines 176-177). S-V2B3A-S2 cited this exact comment. The fix put the cap assertions in a new test (line 403ff.) but left the comment, so this test still claims a check it does not make.
    - **fix:** Reword it, for example: "The check's options: its argv and its timeout (its lowered cap: the S-V2B3A-S2 test below)". Or drop 'its (lowered) cap'.
    - **evidence:** probe.test.ts:175 `// The check's options: its timeout, its argv, its (lowered) cap.` followed only by `expect(probe.options.argv).toEqual(check.options.argv); expect(probe.options.timeoutMs).toBe(check.options.timeoutMs);`. The cap is asserted only at :416-418 in the new S2 test.
- **checks_run:**
  - **Typecheck.** tsc --noEmit (capped.sh 1800) on core tsconfig.test.json, runner tsconfig.test.json, webview tsconfig.json, webview tsconfig.node.json and extension tsconfig.json: all exit 0.
  - **Core.** vitest with one worker, --no-cache, --fsModuleCachePath and TMPDIR in my scratch dir: 'Test Files  76 passed (76)' / 'Tests  1133 passed (1133)'.
  - **Webview.** vitest: 'Test Files  19 passed (19)' / 'Tests  314 passed (314)'.
  - **Extension.** vitest --no-cache: 'Test Files  22 passed (22)' / 'Tests  205 passed (205)'.
  - **Runner files the fix touched** (capped 3000, timeout 900, one worker, real Lean, TELELEAN_TEST_TMP in scratch):
- checkFile + probeFile + gate/pure: 'Test Files 3 passed (3) / Tests 34 passed (34)'
- semantic/probe: '1 passed (1) / 6 passed (6)'
- gate/engine: '1 passed / 34 passed'
- semantic/refresh: '9 passed'
- semantic/valueProbe: '2 passed'
- proposal/build: '7 passed'
- run/manager.start: '16 passed'
- integration/session: '8 passed'
  - **Every other runner test file** (the stricter probe reading affects every real refresh):
- gate/rules: 26 passed
- semantic guards + ilean + lakeLog + text: 4 files, 32 passed
- integration escapes + fixes + m2flow: 3 files, 11 passed
- proposal accept + apply + boardEdits + positions + sidecars: 5 files, 38 passed
- shadow: 2 files, 20 passed
- lean: 5 files, 54 passed
- llm: 9 files, 'Tests 105 passed | 1 skipped (106)' (the skip is the opt-in real-Claude binary test)
- workspace: 11 files, 100 passed
- run: 13 files including fresh.e2e and walkthrough.e2e, 104 passed

Whole runner suite: 63 files, 606 passed, 1 skipped by design.
  - **Fails-without-the-fix checks** in a scratch copy (rv2b3ar1/mut, node_modules symlinked, every file restored and compared byte for byte with the repo: all identical). Each result below failed with the change and passed without it:
- S1 branch dropped: gate/pure and the engine S1 test fail.
- Pre-fix probeFile.ts and checkFile.ts: probeFile 'failed: …' and checkFile 'refuses … no name' fail.
- Pre-fix view.ts: the view test fails (1200 vs 1207).
- Pre-fix engine.ts: the engine durations test fails (120 vs 127).
- Pre-fix service.ts: proposal/build AT4.1 fails (893 vs 1527, real Lean); the unmutated copy passes 7/7.
- refresh.ts probe cap set to `options.memoryMax`: the S2 test fails ('4G' vs '2048M').
- Probe skipped after header errors: the S2 test fails; the unmutated S2 test passes.
  - **Diff review.**
- diff -u of all 20 files in changed_files.txt against the fixer's backups.
- The before and after snapshots differ only by runner gate/types.ts (docs).
- No repo file changed after the fixer's snapshot apart from those 20.
- Greps for remaining build+check duration sums, the seal-convention wording, `classifyFacts` callers and seal writers in code and tests.
- Read AP-33 and the manager's environment handling at start, check_lean, freeze, ghost and gate.
  - **Effects check.**
- No repo file was modified during verification (find -newer).
- The `node_modules/.vite-temp` folders are empty again.
- No run-*.scope units and no vitest or lake processes of mine remain.
- `~/.elan/known-projects` still dates from Nov 17, and `~/.cache/lake` is absent.
