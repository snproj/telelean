# build:WP3 (agent aedc62ae7e38564bd)

## summary
refreshLeanFacts works for WP3. It follows plan section 4 in order: memory guard; toolchain check; project check (also requires a lakefile); hash the sources; build in place under runLean with `lake build <library>`, masking `.git` only when it is a directory; parse Lake's log, keeping whole messages, ignoring trace lines and reading the failures list, with positions converted to zero-width LSP ranges in UTF-16; work out module states from Lake's failures and the import headers; read version-5 `.ilean` files (source order, refs, auxiliary names such as structure fields with a parent, `_private.` names skipped) and the docstrings; generate one check file on stdin to `lake env lean --stdin --json` with `#check @N`, `#print N`, `#print axioms N` and `#check type_of% @N`, names written with M0's formatDeclName and messages attributed by line; parse type, kind, attributes, value, axioms, usesSorry, typeSort and error, with `instance` taken from the source keyword; re-hash the sources and mark changed modules stale. It never throws for Lean or sandbox failures, only TypeError for invalid arguments, and does not serialise itself (callers use runExclusive). The code is split into text.ts, project.ts, lakeLog.ts, ilean.ts, checkFile.ts and refresh.ts, and index.ts re-exports the helpers. The M0 lean/ code is reused unchanged. Fixtures (a) to (e) are under test-fixtures/semantic/overlays. Real recorded Lake logs, .ilean files, check outputs and two complete normalised LeanFacts files (spyro-facts.json, extras-facts.json) are under test-fixtures/semantic/recorded; a test checks them on every run. All 12 acceptance tests are automated and pass. One failure did occur in the second full-suite run, in WP4's in-progress test/workspace/history.test.ts, which is not my code. Typechecks are clean for runner src and for src plus the semantic and lean tests.

## files
- /home/zhengyew/telelean/packages/runner/src/semantic/index.ts
- /home/zhengyew/telelean/packages/runner/src/semantic/refresh.ts
- /home/zhengyew/telelean/packages/runner/src/semantic/text.ts
- /home/zhengyew/telelean/packages/runner/src/semantic/project.ts
- /home/zhengyew/telelean/packages/runner/src/semantic/lakeLog.ts
- /home/zhengyew/telelean/packages/runner/src/semantic/ilean.ts
- /home/zhengyew/telelean/packages/runner/src/semantic/checkFile.ts
- /home/zhengyew/telelean/packages/runner/test/semantic/helpers.ts
- /home/zhengyew/telelean/packages/runner/test/semantic/text.test.ts
- /home/zhengyew/telelean/packages/runner/test/semantic/lakeLog.test.ts
- /home/zhengyew/telelean/packages/runner/test/semantic/ilean.test.ts
- /home/zhengyew/telelean/packages/runner/test/semantic/checkFile.test.ts
- /home/zhengyew/telelean/packages/runner/test/semantic/guards.test.ts
- /home/zhengyew/telelean/packages/runner/test/semantic/refresh.test.ts
- /home/zhengyew/telelean/test-fixtures/semantic/README.md
- /home/zhengyew/telelean/test-fixtures/semantic/overlays/build-error/Model/Spyro/Main.lean
- /home/zhengyew/telelean/test-fixtures/semantic/overlays/extras/Model/Spyro/Main.lean
- /home/zhengyew/telelean/test-fixtures/semantic/overlays/extras/Model/Spyro/Orphan.lean
- /home/zhengyew/telelean/test-fixtures/semantic/overlays/nonbmp-error/Model/Spyro/Main.lean
- /home/zhengyew/telelean/test-fixtures/semantic/overlays/toolchain/lean-toolchain
- /home/zhengyew/telelean/test-fixtures/semantic/overlays/manifest-package/lake-manifest.json
- /home/zhengyew/telelean/test-fixtures/semantic/recorded/lake-build-error.stdout.txt
- /home/zhengyew/telelean/test-fixtures/semantic/recorded/lake-build-error.stderr.txt
- /home/zhengyew/telelean/test-fixtures/semantic/recorded/lake-extras-built.stdout.txt
- /home/zhengyew/telelean/test-fixtures/semantic/recorded/lake-extras-replayed.stdout.txt
- /home/zhengyew/telelean/test-fixtures/semantic/recorded/lake-missing-import.stdout.txt
- /home/zhengyew/telelean/test-fixtures/semantic/recorded/lake-missing-import.stderr.txt
- /home/zhengyew/telelean/test-fixtures/semantic/recorded/lake-lakefile-error.stderr.txt
- /home/zhengyew/telelean/test-fixtures/semantic/recorded/lake-nonbmp-error.stdout.txt
- /home/zhengyew/telelean/test-fixtures/semantic/recorded/lake-nonbmp-error.stderr.txt
- /home/zhengyew/telelean/test-fixtures/semantic/recorded/spyro-Vocabulary.ilean.json
- /home/zhengyew/telelean/test-fixtures/semantic/recorded/spyro-Main.ilean.json
- /home/zhengyew/telelean/test-fixtures/semantic/recorded/extras-Main.ilean.json
- /home/zhengyew/telelean/test-fixtures/semantic/recorded/check-spyro.lean
- /home/zhengyew/telelean/test-fixtures/semantic/recorded/check-spyro.jsonl
- /home/zhengyew/telelean/test-fixtures/semantic/recorded/check-extras.lean
- /home/zhengyew/telelean/test-fixtures/semantic/recorded/check-extras.jsonl
- /home/zhengyew/telelean/test-fixtures/semantic/recorded/spyro-facts.json
- /home/zhengyew/telelean/test-fixtures/semantic/recorded/extras-facts.json

## how_to_run_tests
cd /home/zhengyew/telelean/packages/runner && (ulimit -c 0; TELELEAN_TEST_TMP=/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/wp3/testtmp npx vitest run test/semantic). That takes about 11 s for 43 tests, 9 of which run sandboxed refreshes through runLean. Add `--reporter=verbose --silent=false` to see the measured durations and peaks. Full runner suite: `npx vitest run` in the same folder with the same environment, about 80 s. Typecheck: `npx tsc -p tsconfig.json --noEmit`. To typecheck the tests as well, use a tsconfig that includes test/semantic and test/lean; mine is in scratch: tsconfig.tests.json. To regenerate the recorded facts after changing a fixture or the semantic layer: `UPDATE_SEMANTIC_RECORDINGS=1 npx vitest run test/semantic/refresh.test.ts`.

## test_output
=== cd packages/runner && TELELEAN_TEST_TMP=<scratch> npx vitest run test/lean test/semantic test/llm  (final code; M0's 140 tests + 43 new)
 Test Files  17 passed (17)
      Tests  183 passed (183)
   Start at  12:31:15
   Duration  79.47s (tests 98%, import 1%)

=== npx vitest run test/semantic --reporter=verbose --silent=false (12:27, before the two *-facts.json checks were added; the run above covers the final version)
[refresh spyro] status=ok; build ok 910 ms, peak 95 MiB; check ok 383 ms, peak 85 MiB, 16 declarations probed
[refresh build-error] status=build-errors; build failed 422 ms, peak 87 MiB; check ok 370 ms, peak 86 MiB, 11 declarations probed
  detail: lake build reported errors: Model.Spyro.Main failed; Model not built (an import failed)
[refresh extras] status=ok; build ok 1008 ms, peak 99 MiB; check ok 380 ms, peak 84 MiB, 42 declarations probed
[refresh extras, unchanged] status=ok; build ok 191 ms, peak 21 MiB; check ok 369 ms, peak 82 MiB, 42 declarations probed
[refresh cancelled] status=cancelled; build cancelled 312 ms, peak 90 MiB; check skipped 0 ms, peak ? MiB, 0 declarations probed
  detail: lake build: cancelled by caller
[refresh timeout] status=timeout; build timeout 63 ms, peak 10 MiB; check skipped 0 ms, peak ? MiB, 0 declarations probed
  detail: lake build: killed after 50 ms
[refresh stale] status=ok; build ok 903 ms, peak 92 MiB; check ok 360 ms, peak 87 MiB, 16 declarations probed
  detail: changed while the refresh ran (stale): Model/Spyro/Main.lean
[refresh nonbmp] status=build-errors; build failed 696 ms, peak 92 MiB; check ok 383 ms, peak 85 MiB, 11 declarations probed
[refresh odd-name] status=check-errors; build ok 926 ms, peak 95 MiB; check ok 376 ms, peak 84 MiB, 16 declarations probed
  detail: check: Spyro.«odd name» was not checked: not a usable Lean declaration name: "Spyro.«odd name»"
 Test Files  6 passed (6)
      Tests  43 passed (43)
   Start at  12:27:11
   Duration  11.38s (tests 94%, import 3%, transform 3%)

=== full suite, run 1 (12:22, before small refresh.ts changes)
 Test Files  18 passed (18)
      Tests  186 passed | 1 skipped (187)
   Start at  12:22:46
   Duration  77.54s (tests 98%, import 2%)

=== full suite, run 2 (12:29, final code; the only failure is in WP4's work-in-progress test, not my code)
 ❯ test/workspace/history.test.ts (13 tests | 1 failed) 3272ms
     × never touches the user's index, HEAD, branches, tags, status, config or hooks; only refs/telelean/* change 54ms
 Test Files  1 failed | 21 passed (22)
      Tests  1 failed | 226 passed | 2 skipped (229)
   Start at  12:29:34
   Duration  85.10s (tests 98%, import 2%)

=== typecheck: `npx tsc -p tsconfig.json --noEmit` exit 0; src + test/semantic + test/lean (scratch tsconfig) exit 0. Two earlier tries failed only on WP1 files that were mid-edit (core/src/markup/values.ts, parser.ts, text.ts). --noUnusedLocals/--noUnusedParameters: no findings in my files.
=== after the runs: `systemctl --user list-units --all 'telelean-*'` -> empty; ~/.elan/known-projects 37 lines before and after.
=== unsandboxed probes on scratch copies (direct toolchain binaries): lake build 0.86 s wall, max RSS 488 MB; check file 0.29 s, max RSS 479 MB.

## acceptance
- **test:** AT3.1 Spyro scratch copy: ok, all modules fresh, 11+5 decls with kinds/types/typeSort/axioms/refs/docstrings, no leftover units, known-projects unchanged
  - **status:** pass
  - **evidence:** refresh.test.ts 'AT3.1' passed. Status ok, 3 modules fresh, 16 decls in order. Kinds: axiom; def with ['reducible'] for the abbrevs; opaque for cynder/newSpyro; instance for both Nonempty instances. HasDarkPast type 'Spyro.Character → Prop'. typeSort Character 'Type 1', HasDarkPast 'Type', Character.exists 'Prop'. cynder_dark_past.holds axioms exactly [Classical.choice, Spyro.Character, Spyro.HasDarkPast, Spyro.Character.exists, Spyro.cynder_dark_past.holds]. Ref Spyro.HasDarkPast at 24:34-24:45 inside Spyro.cynder_dark_past. Docstrings present. unitsOfRun(sem<pid>) is []; known-projects unchanged. The output also equals recorded/spyro-facts.json.
- **test:** AT3.2 build error in Main: build-errors, Main failed, Model dependency-failed, Vocabulary fresh with decls, full message with file and zero-width UTF-16 range
  - **status:** pass
  - **evidence:** refresh.test.ts 'AT3.2' passed, run after an earlier successful build in the same copy, so old artifacts exist. States are Vocabulary fresh, Main failed, Model dependency-failed. failedModules ['Model.Spyro.Main']. decls = the 11 Vocabulary names; check probed 11; the stale Model.olean is still there but was not imported. One error: file Model/Spyro/Main.lean, module Model.Spyro.Main, range 57:51-57:51, text with all 6 lines ('Type mismatch\n  cynder_dark_past.holds\nhas type\n  ...').
- **test:** AT3.3 proved overlay + extras
  - **status:** pass
  - **evidence:** refresh.test.ts 'AT3.3' passed. d1.holds type 'Spyro.cynder_not_good → Spyro.d1'. The wrapped d3.holds type comes back on one line. g2.holds refs are [Spyro.g2, Spyro.d0.holds, And.right] and its axioms' only .holds are cynder_dark_past.holds and new_spyro_pg.holds. withSorry usesSorry true. hidden is an axiom with typeSort Prop; c2 has typeSort Type. Rec.past has parent Spyro.Rec and docstring 'the past'. No theorem has a value. uses_def value 'Spyro.darkAndPG Spyro.cynder Spyro.newSpyro'. instInhabitedRec kind instance. Orphan is not-built; no _private decls. A second refresh with no changes gives identical facts with the replayed sorry warning. The output equals recorded/extras-facts.json.
- **test:** AT3.4 memory guard: 1 GiB vs 2 GiB -> low-memory, nothing spawned
  - **status:** pass
  - **evidence:** guards.test.ts 'AT3.4' passed: status low-memory, detail 'MemAvailable is 1.0 GiB, below the 2.0 GiB threshold', build and check skipped, onPhase never called, and the recording fake systemd-run/systemctl/bwrap/setpriv logged no calls.
- **test:** AT3.5 cancellation via AbortSignal and tiny timeout -> cancelled/timeout with detail, no leftover scopes
  - **status:** pass
  - **evidence:** refresh.test.ts 'AT3.5' passed. Abort 300 ms into the build gave 'cancelled' with detail 'lake build: cancelled by caller'. buildTimeoutMs 50 gave 'timeout' with detail 'lake build: killed after 50 ms'. unitsOfRun(sem<pid>) is [] and pgrep finds no processes for either root.
- **test:** AT3.6 edited lean-toolchain -> unsupported-toolchain, nothing spawned
  - **status:** pass
  - **evidence:** guards.test.ts 'AT3.6' passed: the overlay 'toolchain' (v4.34.0) gives unsupported-toolchain with toolchain 'leanprover/lean4:v4.34.0'; a missing lean-toolchain gives detail 'lean-toolchain is missing'. No fake tool was called.
- **test:** AT3.7 source modified during the check (onPhase('check') edits a file) -> that module stale
  - **status:** pass
  - **evidence:** refresh.test.ts 'AT3.7' passed. States are Vocabulary fresh, Main stale, Model fresh. Main's sourceSha256 is the hash of the pre-edit bytes. Detail 'changed while the refresh ran (stale): Model/Spyro/Main.lean'. Main's decls are kept.
- **test:** AT3.8 .git mask only when .git exists (argv inspection)
  - **status:** pass
  - **evidence:** guards.test.ts 'masks .git only when it is a directory' passed. With fake systemd-run and systemctl (no Lean runs), the recorded argv has '--tmpfs <root>/.git' when .git is a directory, and none without .git or when .git is a file. The argv ends with 'build', 'Model', has MemoryMax=4G, and contains the root.
- **test:** AT3.9 message column after a non-BMP character converted to UTF-16
  - **status:** pass
  - **evidence:** Unit tests (text.test.ts, lakeLog.test.ts on the recorded log) and end to end (refresh.test.ts 'AT3.9') pass: Lean reports 56:30 in code points, the facts say 55:31, and line.slice(31) === 'undefinedThing'.
- **test:** AT3.10 all M0 runner tests still pass
  - **status:** pass
  - **evidence:** Final run of test/lean + test/semantic + test/llm: 17 files, 183 passed (M0's 140 plus 43 new). lean/ is unchanged. Full-suite run 1: 186 passed, 1 skipped (a gated WP4 test). Full-suite run 2: 226 passed, 2 skipped, 1 failed in WP4's work-in-progress test/workspace/history.test.ts.
- **test:** AT3.11 manifest with a package and missing manifest -> unsupported-project with distinct details, nothing spawned
  - **status:** pass
  - **evidence:** guards.test.ts 'AT3.11' passed. Details: 'this project has Lake dependencies (mathlib): M1 checks only dependency-free models; Mathlib needs an explicit opt-in (M4)' versus 'lake-manifest.json is missing (the sandbox keeps the model folder read-only, so Lake cannot write one)'. Also covered: invalid JSON and a missing lakefile. No fake tool was called.
- **test:** AT3.12 Lake log parser on recorded logs
  - **status:** pass
  - **evidence:** lakeLog.test.ts passed 9 tests on real Lake 5.0 / Lean 4.35 logs. Covered: failure with a trace line and a 6-line error plus the failures list; Built/Replayed with the sorry warning; bad imports with 4 failures, file-only messages and continuation lines; a lakefile error; ANSI and CR handling. Messages, severities, files, failed targets and the derived module states are right.

## contract_changes
- No frozen types were changed and no fields were added (packages/core/src/facts.ts and packages/runner/src/semantic/types.ts are untouched).
- Additive: packages/runner/src/semantic/index.ts (frozen file, WP3-owned) now exports the internal helpers the brief allows: everything from text.ts, project.ts, lakeLog.ts, ilean.ts and checkFile.ts, plus declDrafts, gitMaskPaths, messageFacts, rootRelativeFile, toDeclFacts and the DeclDraft type from refresh.ts. readMemAvailableBytes and runExclusive are unchanged. Plan section 14 asks for new exports to be recorded, but docs/ is outside my assigned paths. Please add this row to section 14: '2026-11-01 | WP3 | runner/src/semantic/index.ts | new exports: helper modules text/project/lakeLog/ilean/checkFile + declDrafts, gitMaskPaths, messageFacts, rootRelativeFile, toDeclFacts, DeclDraft'.

## minor_decisions
- **decision:** The build runs `lake build <library>` (e.g. `lake build Model`) instead of a bare `lake build`.
  - **rationale:** It builds exactly the library being checked, whatever `defaultTargets` says, so the 'not-built' state really means 'outside the library root's import closure'. Lake 4.35 resolves a target declaration before a package of the same name (Lake/CLI/Build.lean resolveTargetInWorkspace). The output is the same as `lake build` for the fixture.
- **decision:** The `type_of%` probe runs for every declaration, so typeSort is present for all of them. An error on that line counts only for axioms and opaques.
  - **rationale:** The kind is not known before the check. The extra cost is trivial, and an optional probe never marks other declarations as broken.
- **decision:** `value` is set for kinds def and instance, normalised to single spaces; elided proofs (`⋯`) are dropped. Theorems never get a value.
  - **rationale:** A Prop instance prints as a theorem with an atomic value such as `Spyro.Character.exists`, which helps WP2 recognise presupposition re-export instances. Normalising whitespace makes wrapped values comparable.
- **decision:** `attributes` is omitted when #print shows none.
  - **rationale:** Keeps the facts compact. `attributes?.includes('reducible')` works either way.
- **decision:** Modules that become stale during a refresh keep their decls.
  - **rationale:** Core uses a stale file's facts by name only (plan 6.3) and needs them to avoid flicker. The module's sourceSha256 is the pre-build hash, so core sees the mismatch itself.
- **decision:** Sandbox failures in either phase (could-not-start, timeout, oom, cancelled) return modules [] and decls []. build (and check) keep their status, detail and the messages so far.
  - **rationale:** 'No facts' is unambiguous, and WP4 keeps the previous facts after a failed refresh.
- **decision:** If the build fails without Lake naming any library module (e.g. a lakefile error), only modules this log reports as built are fresh; the rest are not-built.
  - **rationale:** Their artifacts may be older than the sources: no data rather than wrong data.
- **decision:** An import of a library module that does not exist, an import cycle, or an import that Lake lists as failed makes the importer dependency-failed.
  - **rationale:** Lake lists dependents of a compile failure only for bad imports, not for type errors.
- **decision:** The project check also requires lakefile.toml or lakefile.lean (status unsupported-project, own detail). An unparsable manifest is also unsupported-project.
  - **rationale:** Lake would fail anyway; this way the board gets a clear reason.
- **decision:** `.git` is masked only when it is a real directory. A worktree's `.git` file is left alone.
  - **rationale:** bwrap can only cover a directory with a tmpfs. A `.git` file only holds a pointer to a directory that is not bound into the sandbox.
- **decision:** A root that is missing or not a directory returns could-not-start, after the memory guard. If readMemAvailable returns undefined or throws, the refresh proceeds; a throwing onPhase callback is ignored.
  - **rationale:** None of these are Lean failures, and the refresh must not throw. The hard memory cap still protects the machine.
- **decision:** sourceSha256 is sha256 of the UTF-8 text (identical to the file bytes for valid UTF-8).
  - **rationale:** Matches what WP4 computes from its TextSource strings.
- **decision:** modules[] and decls[] are in topological module order (imports first, ties by name), then source order.
  - **rationale:** Deterministic and natural to read (Vocabulary before Main), matching Lake's job order.
- **decision:** Auxiliary declarations (structure fields, constructors) get DeclFacts with `parent`, are probed like the others, and their range starts at a preceding docstring if there is one, otherwise it equals the name's range.
  - **rationale:** The .ilean has no full range for them; this keeps 'docstring at range start' consistent so field glosses work.
- **decision:** Recorded, normalised LeanFacts for the Spyro fixture and the extras overlay are kept as fixtures and checked on every run.
  - **rationale:** Plan 11.3 asks the integrator to compare WP2's hand-written Spyro facts with real ones; these files are that reference.

## open_issues
- Names that M0's formatDeclName refuses (whitespace or guillemets, e.g. `def «odd name»`, which the .ilean records as `Spyro.«odd name»`) are not probed. Such a declaration has no kind or type, and the status becomes check-errors with a detail; a test covers this. It is legal but rare Lean. Relaxing formatDeclName is a hardening decision because M0 forbids whitespace on purpose.
- The second full-suite run had 1 failure in WP4's in-progress test/workspace/history.test.ts (AT4.5: `git status` shows the model files changed). It is not my code and is for WP4 or the integrator.
- Plan section 14 entry for the new semantic/index.ts exports: I cannot write docs/; the integrator should add the row given in contract_changes.
- Optional: the doc comment in semantic/types.ts still says '`lake build` IN PLACE'. The implementation runs `lake build <library>`. I left the frozen file untouched.
- peakMemoryBytes is the cgroup's memory.peak: 84–105 MiB per run here, against 480–490 MB max RSS unsandboxed. The toolchain's .olean pages are charged to whichever cgroup first read them, so the board should not label it as 'RAM used by Lean'.
- Multi-library packages (outside M1): if a library module imports a module of another library that fails only transitively, its importers may still count as fresh, because Lake names only the direct failure.
- R2 is unchanged: Lake has no build lock, so in-place builds can race the user's own Lean server on the same `.lake`.

## integration_notes
How to call it: `semantic.runExclusive(() => semantic.refreshLeanFacts({ root, library, runId, signal, memoryMax, minAvailableBytes, onPhase }))`. Pass a runId (pattern [A-Za-z0-9_]{1,64}) so `lean.cancelRun(runId)` can stop it. onPhase('build'|'check') fires right before each sandboxed run, for the board's 'checking…'. The semantic/ and lean/ modules import only node:fs, node:crypto, node:path, @telelean/core and each other, with no import.meta (R8 safe).

What each status contains:
- low-memory, unsupported-toolchain, unsupported-project, and could-not-start for a missing root: build and check are 'skipped', modules and decls empty, detail set; `toolchain` is the project's lean-toolchain text, or '' when missing.
- could-not-start, timeout, oom or cancelled in either phase: modules and decls empty; build (and check) carry the run status, detail and messages so far.
- build-errors: modules have states; decls only for fresh modules (stale ones are kept); build.messages hold every Lake message (severity, file relative to the root, module, zero-width LSP range in UTF-16, full multi-line text); the check normally ran on the fresh modules.
- check-errors: the build was ok but some declaration or the check had problems; detail lists up to 5 problems.
- ok: everything built and checked; detail is set only when modules turned stale.

DeclFacts details:
- `kind: 'instance'` comes from the source keyword.
- typeSort is present for every probed declaration.
- value is present for def and instance kinds only.
- attributes is omitted when empty.
- Auxiliary names have `parent`.
- error is Lean's first probe error.

ModuleFacts.sourceSha256 is sha256 of the UTF-8 text.

For WP2 and the integrator:
- Real facts are in test-fixtures/semantic/recorded/spyro-facts.json, matching test-fixtures/spyro, and extras-facts.json, which covers conditional proofs, a derivation used by a proof, an untracked lemma, sorry, a hidden axiom, axiom constants, a structure field with parent, a data instance and a not-built orphan.
- mental_model's Main.lean has one extra import line, so all its Main positions are one line lower.
- test/semantic/helpers.ts has `recordingHost(dir)`: fake systemd-run, systemctl, bwrap and setpriv that log their argv. Other tests can use it to prove nothing was spawned, or to inspect runLean's argv without running Lean.

Tests use TELELEAN_TEST_TMP and run id `sem<pid>`. Each test copies test-fixtures/spyro and applies an overlay; nothing is built under test-fixtures/.

## effects_outside_repo
- Scratch dir /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/wp3/ (about 1 MB, left in place): probe1–probe5 (scratch copies of test-fixtures/spyro with overlays and their .lake builds), ov/ (draft overlays), Lake logs and check outputs from the probes, tsconfig.tests.json, test-run logs (refresh-run.txt, semantic-run.txt, full-run.txt, full-run2.txt, owned-run.txt), and testtmp/. The tests removed their own trees from testtmp/; an empty testtmp/tmp is left, created by WP4's workspace test helpers during the full-suite runs.
- Unsandboxed toolchain runs in those scratch copies of trusted fixtures, as the brief allows. Direct binaries under ~/.elan/toolchains/leanprover--lean4---v4.35.0/bin, never the elan proxies, with LEAN_NUM_THREADS=4 and ulimit -c 0: `lake build Model` 7 times and `lake env lean --stdin --json` 3 times. All exited.
- Sandboxed runs through runLean created transient systemd --user scopes: telelean-sem<pid>-N for my tests, plus the M0 and WP4 suites' own scopes while I ran the full suite twice and the lean+semantic+llm directories once. All ended; `systemctl --user list-units --all 'telelean-*'` was empty afterwards.
- Running the full suite also ran other packages' tests: M0's llm tests create and remove temp dirs under /tmp (telelean-llm-*), because they read TELELEAN_TEST_TMPDIR, not TELELEAN_TEST_TMP, and default to os.tmpdir(); none were left. M0's binary.test.ts ran the user's VS Code Claude Code binary with `--version` only. WP4's workspace tests used git in scratch repositories under my TELELEAN_TEST_TMP.
- ~/.elan/known-projects: 37 lines before and after.
- ~/telelean-sandbox-probe-escape.txt does not exist (checked).
- None of the following happened: downloads, npm installs, network use, git commands in /home/zhengyew/telelean, Claude CLI runs with a prompt, or writes outside my assigned paths and scratch dir. No process of mine is left running.

