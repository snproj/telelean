# fix:2b3a:r1

Agent `ac581a32f82dcdd31` of workflow `wf_dbef5745-55f`. Verbatim output (JSON alongside).

# Fixer 2b3a, round 1: report

All 12 findings are fixed. I judged none of them wrong. Several are the same defect reported by more than one reviewer:
- S3 = C3 = A-F2
- S4 = C2 (and part of A-F3)
- C1 = A-F1

Paths:
- S = `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad`
- F = `$S/f2b3ar1`
- Backups: `$F/backup/<repo path>`; the list is in `$F/changed_files.txt`.
- Snapshots:
  - `$F/before.diff`: 369 files.
  - `$F/after.diff`: 370 files. The extra file is `packages/runner/src/gate/types.ts`, which got doc changes only.

## Findings

**S-V2B3A-S1 (minor): fixed in code; this is a decision, see below.**
- I treated AP-33's described behaviour as the wanted one, so the code now matches AP-33 instead of AP-33 being rewritten.
- `classifyFacts` (runner `gate/findings.ts`) now turns facts whose status *and* probe marker are both `oom` into an `environment` outcome. The new pieces are `probeOomEnvironment` and `PROBE_OUT_OF_MEMORY`, and the text reads: "telelean's probe ran out of memory, so telelean could not read what the declarations of this state use in Lean (‹detail›)".
- The outcome is the same at check, freeze, both gates, the ghost check and `checkBase`:
  - nothing passes and no attempt is counted;
  - the gate retries once after 30 s;
  - the start refuses with the environment notice ("telelean could not run Lean on your files (…); nothing was sent to Claude") and keeps no base facts.
- Still a counted budget finding, as before:
  - the probe's `timeout`;
  - the build's or the check's own `oom`, which carries no probe marker.
- Unchanged: refresh itself and the `ProbeRunFacts` contract.
- AP-33's bullet is now accurate, so it needs no edit (I cannot write to `verbatim_prompt_log` anyway).
- One correction for anything copied from the builder's report: "a cut, failed or killed probe gives a check problem" was wrong about "killed". The builder's §8 entry was right.

**S-V2B3A-S2 (minor): fixed.** A new real-Lean test in `test/semantic/probe.test.ts`, using `RefreshHooks.runLean` through a new `spiedJobs` helper, covers three cases:
- **Lowered cap.** The probe job runs under `spawnMemoryMax('4G', 3 GiB, 2 GiB)` = `2048M`, while the build and the check keep `4G`.
- **After the check's imports fail** (a fake check job):
  - the real probe still runs, with marker `ok`, the constants kept, and a detail naming the imports' failure;
  - if the probe fails as well, the detail names both failures.
- **Nothing probed.** A model whose only declaration is `def «odd name»` runs only the build and check jobs, and carries no marker.

**S-V2B3A-S3, C-V2B3A-C3, A-F2 (nits): fixed in code.**
- I changed the code to match the §8 rule as written.
- In `probeFile.ts`, any message that contains the probe's key but is not an information message at the `#eval`'s line now fails the reading. This holds alone or beside the real line, and for a different line or a different severity. The detail reads "Lean printed the probe's key outside its line (‹severity› at ‹line›:‹col›)".
- Messages without the key are still ignored.

**S-V2B3A-S4, C-V2B3A-C2 (nits): fixed.**
- New core `leanDurationMs(facts)` in `facts.ts` (additive): the build's time plus the check's plus the probe's.
- It is now used at all four sites:
  - engine `runCheck`;
  - engine `checkBaseNow`;
  - `proposal/service.ts` `semanticOf`;
  - core `review/view.ts` `semanticOf`.

**S-V2B3A-S5 (nit): fixed (docs).**
- D2-75 now carries:
  - the measured cost, accepted by AP-33;
  - the `readModuleData` alternative;
  - the probe-oom rule;
  - both size figures: about 500,000 declarations, but about 13,000 if each lists ~100 constants.
- §2.1's Cost note now says AP-33 accepted the cost and gives the 13,000 figure.

**C-V2B3A-C1, A-F1 (minor): fixed as contract text plus a 2d test; this is a decision.**
- The contract now says: every queue after the session's first starts with exactly one seal, in its `queue-start` write, and the first queue has none. Places changed:
  - plan §2.2 `SealBy` doc;
  - plan §4.6;
  - the plan's summary bullet;
  - core `review/types.ts` `SealBy`;
  - core `review/reducer.ts` `seal`.
- §6.1's 2d list gains a test that pins this convention.
- `buildSessionView` is unchanged.
- A-F1's optional item 3 (making `askedBy` independent of the convention) is not done, because it would change a contract. It is logged as the alternative.

**C-V2B3A-C4 (nit): fixed.** `valueProbeLines` now throws a TypeError on empty `names`, in both forms. The test expects the throw.

**A-F3 (nit): fixed.**
- The engine's `refresh` doc names all three jobs.
- `unseenProofEnvironment` no longer names the probe import clash as a cause.
- `CheckReport` docs updated for `environment`, `findings` and `build.durationMs`.
- Durations: see S4.

## Files changed (20)

**Runner source**
- `src/gate/findings.ts`: `probeOomEnvironment`, `PROBE_OUT_OF_MEMORY`, `classifyFacts`, header table, `unseenProofEnvironment` doc.
- `src/gate/index.ts`: two new exports.
- `src/gate/engine.ts`: `leanDurationMs` at two sites, `refresh` doc.
- `src/gate/types.ts`: docs only.
- `src/semantic/probeFile.ts`: the stray-key rule.
- `src/semantic/checkFile.ts`: refuses empty names.
- `src/proposal/service.ts`: `leanDurationMs`.

**Core source**
- `src/facts.ts`: `leanDurationMs`.
- `src/review/view.ts`: `leanDurationMs`.
- `src/review/types.ts`: `SealBy` doc.
- `src/review/reducer.ts`: `seal` doc.

**Tests**
- Runner:
  - `test/semantic/probe.test.ts`: +1 test, `spiedJobs` helper.
  - `test/semantic/probeFile.test.ts`: extended.
  - `test/semantic/checkFile.test.ts`: the empty-names case.
  - `test/gate/engine.test.ts`: +2 tests.
  - `test/gate/pure.test.ts`: extended.
  - `test/proposal/build.test.ts`: duration assertion.
- Core:
  - `test/review/probe.test.ts`: +1.
  - `test/review/view.test.ts`: +1.

**Docs**
- `docs/slice2-plan.md`:
  - the summary bullet;
  - §2.1: new "A probe job that runs out of memory" bullet, Cost note;
  - §2.2 and §4.6: seals;
  - §6.1: the 2b3a list +3 bullets, the 2d list +1;
  - D2-75;
  - a new §8 entry, "fixer 2b3a, round 1".

No test was deleted, skipped or moved.

## Mutation checks

16 mutations. Each was restored byte for byte (checked with `cmp`), and each failed at least one test. The driver is `$F/mut.py`; results are in `$F/mut/results-*.json`.

| # | Where | What I broke | Test that failed |
|---|---|---|---|
| 1 | `checkFile.ts:108` | empty-names refusal dropped | checkFile "refuses what it cannot pass: no name…" |
| 2 | `probeFile.ts:106` | stray-key check disabled | probeFile "failed: …" |
| 3 | `probeFile.ts:105` | stray test by line only | probeFile "failed: …" |
| 4 | `probeFile.ts:105` | stray test by severity only | probeFile "failed: …" |
| 5 | `findings.ts:99` | probe-oom branch dropped | gate/pure "lets Lean results through…" and engine "fixer 2b3a r1 (S-V2B3A-S1…)" |
| 6 | `findings.ts:84` | any `oom` treated as environment | gate/pure and the engine S1 test |
| 7 | `findings.ts:84` | facts status unchecked | gate/pure |
| 8 | `findings.ts:96` | probe timeout made environment | gate/pure, the engine's existing failed-probe test and the S1 test |
| 9 | core `facts.ts:241` | probe term dropped | core probe and view tests, and the engine durations test |
| 10 | core `view.ts:428` | old sum restored | the view durations test |
| 11 | `engine.ts:438` | old sum restored | engine durations test |
| 12 | `engine.ts:527` | old sum restored | engine durations test |
| 13 | `service.ts:394` | old sum restored | `proposal/build` "AT4.1 reading A proved" (real Lean) |
| 14 | `refresh.ts:530` | probe runs under `options.memoryMax` | the new S2 test in probe.test.ts (real Lean) |
| 15 | `refresh.ts:530` | cap taken from `availableForCheck` | the new S2 test in probe.test.ts (real Lean) |
| 16 | `refresh.ts:515` | probe skipped after import errors | the new S2 test in probe.test.ts (real Lean) |
| 17 | `refresh.ts:515` | probed-count guard changed to `>= 0` | the new S2 test in probe.test.ts (real Lean) |

(Rows 3 and 4 are two variants of the same rule; the count of 16 treats rows 8 and 9's source as one mutation each, i.e. M1–M16 plus M7b.)

## Verification

How I ran it:
- Typecheck: `$S/capped.sh 1800 node_modules/.bin/tsc --noEmit -p …`
- Tests: `[TMPDIR=$F/tmp TELELEAN_TEST_TMP=$F/tt] $S/capped.sh <3000 runner | 1800 others> timeout 900 node_modules/.bin/vitest run --maxWorkers=1 --no-cache --fsModuleCachePath=$F/fsmc …`
- One job at a time; MemAvailable was about 14.5 GB throughout.

Typecheck results:
- core `tsconfig.test.json`: exit 0
- runner `tsconfig.test.json`: exit 0 (re-run after the final comment edits)
- webview `tsconfig.json`: exit 0
- webview `tsconfig.node.json`: exit 0
- extension `tsconfig.json`: exit 0

Vitest results:

| Suite | Test Files | Tests |
|---|---|---|
| core | 76 passed (76) | 1133 passed (1133), was 1131 |
| webview | 19 passed (19) | 314 passed (314) |
| extension | 22 passed (22) | 205 passed (205) |
| runner `semantic/checkFile` + `semantic/probeFile` + `gate/pure` | 3 passed (3) | 34 passed (34) |
| runner `semantic/probe` (real Lean) | 1 passed (1) | 6 passed (6) |
| runner `gate/engine` (real Lean) | 1 passed (1) | 34 passed (34) |
| runner `proposal/build` (real Lean) | 1 passed (1) | 7 passed (7) |
| runner `semantic/refresh` (real Lean) | 1 passed (1) | 9 passed (9) |
| runner `semantic/valueProbe` (real Lean) | 1 passed (1) | 2 passed (2) |

- The last two were run because the probe reading changed, which affects every real refresh.
- No webview file changed, so no scratch build and no Playwright run.

## Decisions for the orchestrator to log

All five are also in plan §8, "fixer 2b3a, round 1".

1. **S1, probe out of memory.** A probe job that runs out of memory is an `environment` outcome at every purpose and at `checkBase`, never a counted budget finding. AP-33's behaviour is kept, and the engine's classification changes accordingly. The probe's timeout and the build's or check's own oom stay budget findings.
   - *Alternatives:* keep the check's budget rule and correct AP-33's bullet instead; or also make the probe's timeout an environment outcome.
2. **C1/A-F1, seals.** The seal convention is now the contract: the session's first queue has no seal, and every later `queue-start` writes exactly one. §6.1 has a 2d test for it; `buildSessionView` is unchanged.
   - *Alternative:* add `queue` to the seal action, or calibrate from the newest queue number, so the view no longer depends on the convention (this changes a contract).
3. **S3, stray probe lines.** The code now matches §8: a keyed message off the `#eval` line, or of another severity, fails the reading even beside the real line.
   - *Alternative:* reword §8 to say such a line is ignored.
4. **S4, durations.** A core helper, `leanDurationMs`, is used at all four sites.
   - *Alternative:* write the sum out inline at each site.
5. **C4, empty names.** `valueProbeLines([])` is a TypeError in both forms.

## Effects outside the repo and the scratch dir

- No files written outside the repo and my scratch dir.
- Lean toolchain binaries were used read-only, by the tests.
- `capped.sh` and runLean created transient systemd user scopes; none are left.
- No processes of mine are left. Three unrelated processes are running: a Lean server for `~/webring`, `ramwatch.sh`, and a telelean Claude CLI process from VS Code. None was started by me.
- Checked unchanged or absent:
  - `~/.elan/known-projects` (mtime Nov 17);
  - `~/.cache/lake` (does not exist);
  - `/tmp`: no new entries;
  - the repo's `node_modules` caches;
  - `packages/extension/out` and `dist`.
- No npm or npx, no network, no git changes.
