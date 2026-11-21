# build:2b3a

Agent `a3155c1599dc38713` of workflow `wf_dbef5745-55f`. Verbatim output (JSON alongside).

I implemented sub-slice 2b3a (the isolated probe) and fixed all five carry-overs from the 2c2 review. Everything typechecks and every test suite I ran passes. One thing needs your decision: the probe costs more than the plan's 1.5× limit over 1d's refresh, and the plan leaves that call to the integrator.

S = `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad`, B = `$S/b2b3a`. Backups of every file I changed are in `$B/orig`.

## Carry-overs from the 2c2 review
Each fix has a test that fails without it (mutation-checked).
- **R1-1 — fixed as proposed.** A decline that took a source out of a question (D2-59) is now subtracted only from steps whose queue had already started when it was made. Queue q ≥ 2 starts at the (q−1)-th seal of the done stack; queue 1, and a step with no queue number, take every decline. The false §8 sentence is struck through and corrected. A "left the question" note shows only while the source is out of the question on record, and only once.
- **R1-2 — fixed as proposed.** While a step runs, the view's details ignore `arrow` and `created` ledger entries written by steps of the running queue. An entry naming an unknown step counts as the running queue's, so its reason is withheld. Completion, premise and mark-removed entries name no step and are never written during a queue, so they all stay.
- **R1-4 — fixed (test added).** A running twin whose steps have no queue numbers, with the re-ask's question replacement in one twin.
- **R1-3 — fixed.** The force comments in `review/types.ts`, plan §2.2 and plan §2.6 now also name RV-11's Result returns and the end of any queue.
- **R1-5 — fixed as proposed.** A Result that telelean or a cascade took out shows no `summary` or `gap`.

## What 2b3a now does
- **`importModules` works** on 4.35, so the fallback was not needed. The probe's value constants equal 1d's name for name, and the regenerated recordings differ from 1g's only by `typeConsts` and the marker.
- **Isolation, real Lean:** the model's high-priority `ToString String` and `ForIn Loop` instances forge the in-file probe (the control: every list empty, or the witness instance dropped) but not the isolated one.
- **No `[init]` in the probe job, real Lean:** `@[init]` and the hygienic `@[init.«_@».x._hyg]` both print their forged line in the check job, never in the probe job. G0 refuses both in Claude's text.
- **The clash model** now gives status `ok` from exactly one build, one check and one probe job; 1d's second check run is gone.
- **Fail closed:** a cut, failed or killed probe gives no constants and a check problem naming the cause. A failed probe at check, freeze, either gate or the ghost check is an `environment` outcome when the rules find nothing or only `source-only`. `checkBase` on a base whose probe failed still writes `base-facts.json` and refuses the start before Claude is contacted.

## Cost — needs your decision
Measured with `/usr/bin/time` under `capped.sh` on the Spyro fixture, median of 3:

| Job | Peak RSS | Time |
|---|---|---|
| check file alone | 477 MB | 0.21 s |
| 1d's check with its in-file probe | 567 MB | 0.31 s |
| isolated probe job | 954 MB | 0.61 s |
| `lake build` (full) | 483 MB | 0.66 s |
| `lake build` (nothing to do) | 109 MB | 0.15 s |

- A refresh's peak goes from 567 to 954 MB (1.68×) and its time from 0.97 to 1.48 s (1.53×; 2.1× when the build has nothing to do).
- runLean's cgroup peaks in the same run: build 103 MiB, check 84 MiB, probe 469 MiB.
- **Cause:** the frontend has already mapped Init at its base addresses, so `importModules (level := .private)` reads Init's olean files a second time into anonymous memory (+390 MB; Init's `.olean.private` alone is 258 MB). Importing `Lean.Environment` instead of `Lean.CoreM` saves only about 25 MB.
- **Alternative I measured:** read only the model's own modules with `Lean.readModuleData` — 560 MB / 0.27 s, about 1d's cost. But a model file written in Lean's module system keeps part of its data in `.olean.private`, so that reader would have to load that part too, or refuse such models.
- **Size limit:** the probe's message is 52 bytes per declaration on Spyro (measured) and about 66 on extras (estimated). runLean's 32 MiB cap is reached near 500,000 such declarations, or about 13,000 if each lists ~100 constants.

I kept `importModules` exactly as D2-75 specifies. Accepting this cost needs no code change; switching to the alternative would.

## Files changed
**Runner**
- `src/semantic/probeFile.ts` (new): the probe file and its fail-closed reading.
- `src/semantic/checkFile.ts`: check file without the probe; `valueProbeLines` with the type walk and a `modules` option; `parseValueProbe` reads both keys.
- `src/semantic/refresh.ts`: the probe job after the check; constants and marker into the facts; second check run removed; internal `RefreshHooks` test seam.
- `src/semantic/index.ts`, `src/semantic/types.ts`: export and doc.
- `src/gate/findings.ts`: `probeFailedEnvironment`, `baseProbeEnvironment`, `BASE_PROBE_FAILED`.
- `src/gate/engine.ts`: the failed-probe rule in `runCheck`; refusal in `checkBase`.
- `src/gate/scratch.ts`: ghost check keeps its in-file probe, now with the type walk; `GhostScratchResult.typeConsts`.
- `src/gate/index.ts`: exports.

**Core**
- `src/review/view.ts`: R1-1, R1-2, R1-5.
- `src/review/types.ts`: R1-3 comment.
- `src/facts.ts`, `src/project/edges.ts`: doc comments only.

**Tests**
- Runner `test/semantic/probe.test.ts` and `test/semantic/probeFile.test.ts` (new).
- Runner, updated: `test/semantic/checkFile.test.ts`, `refresh.test.ts`, `valueProbe.test.ts`; `test/gate/pure.test.ts`, `engine.test.ts`; `test/run/manager.start.test.ts`; `test/integration/session.test.ts`.
- Core `test/review/view.test.ts`.

**Fixtures** (written as the brief allowed)
- New overlays `test-fixtures/semantic/overlays/probe-forge/` and `probe-init/`.
- New recordings `probe-spyro.lean` and `probe-spyro.jsonl`.
- Regenerated `spyro-facts.json` and `extras-facts.json`.
- `test-fixtures/semantic/README.md`: rows for the above.
- Core `test/fixtures/project/spyro-facts.json`, `spyro-proved-facts.json`, `spyro-derived-facts.json`: `typeConsts` and the marker `{status:'ok', durationMs:600}` added, nothing else changed.

**Docs:** `docs/slice2-plan.md` — the §8 correction, R1-3's two comments, §2.3/§4.7 wording, the §2.1 cost note, and a new §8 "builder 2b3a" entry.

## Tests
- **Added:**
  - Core `view.test.ts`: 4 tests (R1-1 ×2, R1-2, R1-4).
  - `probeFile.test.ts`: 6.
  - `probe.test.ts`: 5 (real Lean: `importModules` and the recording, isolation, no `[init]`, the type walk, fail closed).
  - `checkFile.test.ts`: 6.
  - `pure.test.ts`: +1. `engine.test.ts`: +2. `manager.start.test.ts`: +1.
- **Updated:**
  - Core ADV-2 test (R1-5).
  - `refresh.test.ts`: AT3.1–AT3.3, odd-name, the recording check.
  - `valueProbe.test.ts`: clash test rewritten; simp test extended.
  - `session.test.ts`: hand-written facts' constants checked against real Lean, name for name; regenerates them with `UPDATE_SEMANTIC_RECORDINGS=1`.
- **Replaced:** `checkFile.test.ts`'s three 1d value-probe tests (the old check-file probe no longer exists).
- None skipped, moved or deleted; nothing waits for a later sub-slice.

## Verification
Commands: `$S/capped.sh <MB> node_modules/.bin/{tsc,vitest}`. Vitest runs used `--maxWorkers=1 --no-cache --fsModuleCachePath=$B/fsmc TMPDIR=$B/tmp`; runner runs also used `TELELEAN_TEST_TMP=$B/tt` and `timeout 900`, under the 3000 MB cap.
- **tsc --noEmit:** core and runner (`tsconfig.test.json`), webview (`tsconfig.json`, `tsconfig.node.json`), extension (`tsconfig.json`) — all exit 0.
- **vitest:** core "Test Files 76 passed (76), Tests 1131 passed (1131)"; webview "19 passed, 314 passed"; extension "22 passed, 205 passed".
- **Runner files, each passed (real Lean where needed):**
  - checkFile, probeFile, gate/pure, guards, ilean, lakeLog, text together: "7 passed, 66 passed"
  - semantic/probe 5 · semantic/refresh 9 · valueProbe + pure + guards 25
  - gate/engine 32 · gate/rules 26 · run/manager.start 16
  - integration/session 8 · m2flow 5 · escapes 1 · fixes 5
  - proposal/build 7 · shadow/seed 8
  - workspace/m2members 9 · perform 8 · historySafety 5
  - run/fresh.e2e 9 · run/walkthrough.e2e 22
- **Regeneration:** with `UPDATE_SEMANTIC_RECORDINGS=1`: refresh (9 passed), probe (5 passed), session `-t "hand-written facts"` (1 passed, 7 skipped). Then without the variable: refresh + probe + probeFile 20 passed; session 8 passed. Each diff checked: only `typeConsts` and the marker were added.
- `check-spyro.jsonl` and `check-extras.jsonl` are byte-identical to today's Lean output, so I did not rewrite them.
- No webview file changed, so no scratch build and no Playwright.

## Mutation checks
46 mutations, each restored byte for byte (`cmp`), every one failing at least one test.
- **`review/view.ts`** — all failed `view.test.ts`, mostly the R1-1/R1-2/R1-4 tests: `:722` the queue condition dropped or `<=`→`<`; `:706` seal counting dropped; `:1292` notes filter dropped; `:1289` dedupe dropped; `:740` `ledgerSeen` never filtered; `:744` unknown step kept; `:742` stepless entries dropped; `:730` the R1-4 fallback inverted; `:989` words always shown, or not for the declined version.
- **`semantic/probeFile.ts`** — all failed `probeFile.test.ts`: `:94` cut; `:98` error; `:99` failed exit; `:102` two lines; `:100` the line-number condition dropped, or severity loosened; `:105` no type key; `:93` sandbox statuses.
- **`semantic/checkFile.ts`** — failed `checkFile`, `probeFile` or `pure` tests: `:280` type key ignored; `:264` length check; `:123` `loadExts := true` / `level := .exported`; `:175` type walk without values; `:139` constructor walk dropped; `:119` isolated form becomes CoreM; `:110` empty modules allowed.
- **`gate/scratch.ts`** `:192` and `:187` — failed `pure.test.ts`.
- **`gate/engine.ts` and `gate/findings.ts`** — all failed the engine's failed-probe tests: engine `:468` rule removed; findings `:159` loosened to empty-only, or returning always; engine `:539` base refusal removed; refusal moved before the save (engine `:534`); findings `:163` text changed (also failed the manager test); findings `:172` returns undefined.
- **`semantic/refresh.ts`** (real Lean) — `:539` problem dropped, `:534` sandbox return skipped, `:517` low-memory guard skipped: all failed "fails closed". `:579` marker dropped, `:325` `typeConsts` dropped, `:515` probe never run, `:530` timeout changed: all failed "importModules first".
- **The isolation itself** (real Lean):
  - Probe file made in-file again (`probeFile.ts:59`): the isolation test failed (forged lists).
  - `loadExts := true`: the `[init]` test failed. 4.35 itself then refuses the import ("`enableInitializersExecution` must be run before…"), so the probe fails closed rather than running `[init]`.

## Decisions for the orchestrator to log
All are also in plan §8 ("builder 2b3a").
1. **Cost (yours to decide, per §2.1):** I kept `importModules` as D2-75 specifies; measured above 1.5×. *Alternative:* `readModuleData` of the library's own modules (560 MB / 0.27 s), which must also load module-system files' private part or refuse them.
2. **R1-1 note:** a "left the question" note shows only while the source is out of the question on record, once per source and target. *Alternative:* the review's wording — drop it once any later step of that target asked the source again, proved or not.
3. **R1-1, for 2d:** this relies on the session's first queue having no seal and every later queue exactly one (§4.6's three sealing actions). *Alternative:* record each step's sealing action id.
4. **R1-2:** a ledger entry naming an unknown step is withheld while a step runs; the base mask keeps reading the whole ledger. *Alternative:* filter the mask too — that would keep proof-phase declarations on the hidden board when no step has a queue number.
5. **R1-5:** the stage report still shows the step's words. *Alternative:* drop them there too.
6. **Probe reading, stricter than §2.1 lists:** it also fails on a run that failed without an error message, on more than one line, on a line at another line number (a forged placement), and on a line without the type key. `cut` wins over everything but sandbox statuses. *Alternative:* take the first line, as 1d did.
7. **Marker:** carries `detail` only for `failed` (per the contract). *Alternative:* carry the sandbox's detail too.
8. **Refresh:**
   - The probe also runs after the check's import errors.
   - No probe and no marker when nothing was probed.
   - Low memory before the probe gives `low-memory` facts with no declarations and no marker.
   - No new `onPhase` value.
   - The failed-probe check problem is `probeFailure`'s sentence without its final period.
   *Alternatives:* skip the probe after import errors; add a `probe` phase.
9. **Test seam:** an internal `refresh(…, hooks)` with `RefreshHooks.runLean`. *Alternative:* a field on the frozen `RefreshRequest`.
10. **Engine:** the failed-probe rule sits in `runCheck` after the build-error findings, so it also covers the ghost check's check. In `checkBase`, Lean errors come first, then the base facts are saved, then the probe refusal. *Alternative:* the probe refusal before Lean errors.
11. **Text location:** `BASE_PROBE_FAILED` ("Claude's work on this model cannot be checked.") is a runner text in `gate/findings.ts`. *Alternative:* core `REVIEW_TEXTS`.
12. **`parseValueProbe` signature** is now `{valueConsts, typeConsts?} | string`, and a malformed type key fails the whole line. *Alternative:* keep the values when only the type key is malformed.
13. **Inductive self-reference:** an inductive's own name appears in its `typeConsts` (its constructors' types name it). *Alternative:* drop the declaration's own name.
14. **`valueProbeLines` argument checks:** `followMain` together with `modules`, or an empty `modules`, is a TypeError.
15. **Regeneration paths:** core's hand-written facts are regenerated through `integration/session.test.ts` under `UPDATE_SEMANTIC_RECORDINGS`, with a hand-written marker time of 600 ms; `check-*.jsonl` are not rewritten (verified identical). *Alternative:* a one-off script.
16. **Probe imports:** kept `Lean.CoreM` as planned, rather than `Lean.Environment`, which would save only ~25 MB.

## Effects outside the repo and the scratch dir
- Read-only use of the toolchain binaries in `~/.elan/toolchains/leanprover--lean4---v4.35.0` (never the elan proxies). My manual runs used `HOME=$B/home`; that folder is still empty.
- Transient systemd user scopes from `capped.sh` and runLean; none are left.
- Nothing written to `~/.elan/known-projects`, `~/.cache/lake`, `/tmp` or the repo's `node_modules` caches (checked).
- No npm/npx, no network, no git changes; `packages/extension/dist` and `out` untouched; no processes of mine left running.
