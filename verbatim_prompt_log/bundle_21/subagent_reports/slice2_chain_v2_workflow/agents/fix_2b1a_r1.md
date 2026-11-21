# fix:2b1a:r1

Agent `a1ab542f4b469a2df` of workflow `wf_ae5f1188-533`. Verbatim output (JSON alongside).

# Fixer 2b1a, round 1: report

All 13 findings are handled: the 3 majors and every minor and nit are fixed, and none is judged wrong. There are two reducer code fixes plus contract docs and tests. Every package typechecks, and every unit suite passes (core 783 tests, was 776). Each rule fix has a test that fails without it; 12 mutations were checked and every one was restored byte for byte (`cmp`).

Git state is as I found it: HEAD 187673d, nothing staged. Only the 5 files below changed.

## Findings

**C-V2B1A-C1 (major), A-ADV-2b1a-1 (major), S-F2 (minor): fixed.** They are one bug: RV-7 at an Undo asked while the results are hidden that would show them.
- `listedAcceptRefusal` (reducer.ts:1043) now reads the badges and "blocked" in the class in force both when the Undo is asked and after it (`now && after`).
- `classes` is read only when the results are shown then and stay shown. Before, a hidden premise draft reaching the item refused the Undo while the results stayed hidden.
- An Undo that shows the results then applies D2-23 through its existing `showResults`, returning such an item with its event, as by hand.
- Test: copies X and Y, which differ only in a hidden draft, for own and group Accepts, and for D decided by the action or an accepted dependent of it.
  - Both Undos go through and show the results.
  - In X, D2-23 returns D, the same as a by-hand group Accept.
  - The answers are not byte-identical, because X's D2-23 return is reported at the show, as at any show. The test compares refusal, `taken`, statuses and events instead.

**C-V2B1A-C2 (major), A-ADV-2b1a-2 (major), S-F1 (minor), C-V2B1A-C3 (minor): fixed.** Undo's takenOut loop (reducer.ts:1173) wrote a premise again even when it stayed out.
- A premise is now written again only when the Undo restores its change to a state that keeps it in ws/: `c !== undefined && !skipped.has(r.id) && inWorkingCopy(r.kind, r, t.card, c.before)`.
- "Restores" means the premise is not kept by a judge and not kept silently.
- A premise in review counts only when it was in review before the action (a converted v1 ghost).
- Every other one goes to `premises.takeOut`.
- C3's "take-out of nothing" is settled in the contract: step 4 records in `takenOut` only premises that were written when the write started (decision 2).
- Tests:
  - Probe 2/3 (Show results and back-to-review variants).
  - Probe 5 (the ghost, kept working).
  - The Undo's own RV-5 cascade returning a premise whose Accept it restored.
  - Undo of an un-reject in four ways of keeping the premise out (S-F1's trace, C3's probe (b), probes 4 and 4b), both under §2.2 and with the take-out recorded anyway, plus the Redo.
  - A new random property, suggested by A-ADV: it carries out every premise write as §2.9 says and checks ws/ against the record after every step, over 400 sequences reaching all 7 write paths.

**S-F3 (minor): fixed (docs).** The ItemWrite comment and field doc in types.ts and plan §2.9, §2.2's `takenOut`, and "For 2e" now state:
- what a take-out does (it is idempotent);
- that step 4 records only premises written when the write started;
- that R1-1's kept-out premises are planned from the record's card;
- how the runner finds the declining action (its `commits` hold the item's `decline.commit`);
- the Undo rule.

**A-ADV-2b1a-3 (minor), S-F4 (nit): fixed (tests).**
- Probe 6, plus an Undo variant: an action asked while the results are shown that hides them names no Result.
- The random run now checks every action asked while hidden, or that hides the results: no `cascade` or `events` entry is a Result or a Result's part. Show results' own answer is excepted.

**C-V2B1A-C4 (nit): fixed.** The ruleHelpers test was renamed to the six helpers it actually checks, and the file header was corrected.

**Seen, not fixed (outside the findings), logged in §8.** One request that un-rejects V and rejects W leaves wrong state for a premise or declaration resting on both: the premise is written again while reverted, and the declaration keeps content V's merge brought back. A scratch probe confirms it. The webview never sends such a mixed request (§5.7). 2c1's validator could refuse it.

## Files changed
- `packages/core/src/review/reducer.ts`: the two fixes and their comments.
- `packages/core/src/review/types.ts`: ItemWrite's contract and decide's `takenOut` doc (comments only).
- `packages/core/test/review/reducer.test.ts`: 7 new tests; the random run gains the answer check and the premise simulation.
- `packages/core/test/gate/ruleHelpers.test.ts`: one test renamed, header reworded.
- `docs/slice2-plan.md`: §2.2, §2.9, §4.6 Properties, the corrected §8 lines, and a new §8 entry "fixer 2b1a, round 1".

## Mutation checks
All on `reducer.ts`, run against `test/review/reducer.test.ts`; logs are in `…/f2b1ar1/mut/`.

| # | Mutation | Tests failing |
|---|---|---|
| M1 | :1173 back to the old `inWorkingCopy(r.kind, r, t.card)` | 4: RV-5 return, un-reject Undo, silent path, random property ("seed 69 step 25: a written premise has a status that keeps it in ws/ (in-review)") |
| M2 | :1173 no change check | 1 |
| M3 | :1173 no `skipped` check | 1 |
| M4 | :1173 no `from` | 1 |
| M5 | :1043 `inForce = after` | 1 (RV-7 pair) |
| M6 | :1043 `inForce = now` | 5 |
| M7 | :1044 `blockedBy(…, after)` | 1 |
| M8 | :1057 `classOf(…, after)` | 1 |
| M9 | :924 `listed = shown` (decide) | 2 |
| M10 | :1184 `listed = shown` (Undo) | 4 |
| M11 | :924 `listed = w.reveal().shown` (decide) | 4 |
| M12 | :1184 `listed = w.reveal().shown` (Undo) | 2 |

M3 and M7 guard states no code path produces today, so their tests use synthetic states:
- M3: no judge within a stage leaves a hidden, taken-out premise in a status that keeps content in ws/.
- M7: classify never marks missing facts in only one class map.

## Verification (MemAvailable about 13.9 GB throughout)
`S` is `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad` and `F` is `$S/f2b1ar1`.

- **tsc:** in each package dir, `TMPDIR=$F/tmp $S/capped.sh 1800 /home/zhengyew/telelean/node_modules/.bin/tsc --noEmit -p <cfg>`. Exit 0, no output, for all five configs: core and runner `tsconfig.test.json`, webview `tsconfig.json` and `tsconfig.node.json`, extension `tsconfig.json`.
- **vitest:** `TMPDIR=$F/tmp $S/capped.sh 1800 …/vitest run --no-cache --fsModuleCachePath=$F/fsmc --maxWorkers=1`.

| Suite | Result |
|---|---|
| core | `Test Files  65 passed (65)`, `Tests  783 passed (783)` |
| webview | `Test Files  19 passed (19)`, `Tests  313 passed (313)` |
| extension | `Test Files  22 passed (22)`, `Tests  203 passed (203)` |

- **Runner:** none run. No runner test file is touched: the runner imports nothing from core's review module, and grepping runner src/test for the changed symbols finds nothing.
- **Snapshots:** `before.diff` and `after.diff` are in `$F`, 336 files each. Exactly my 5 files' diffs changed.

## Decisions for the orchestrator to log (all also in plan §8)
1. **"Blocked" reads the same class as RV-7** (`now && after`). *Alternative:* `now && after` for RV-7's badges only.
2. **A take-out of a premise that only the write's own un-reject merge brought back is not recorded in `takenOut`.** So `takenOut` is exactly what the commits took out. *Alternatives:* record it with no ledger entries (S-F1), or a new `premises.mergedOut` write field (C3).
3. **A hidden premise a judge changed since keeps that change, its ws/ content included:** the Undo never writes it again. *Alternative:* decide from its status alone.

## Effects outside the repo and my scratch dir
- **Another workflow's edits, not mine:** the orchestrator's AP-29 coverage audit edited `docs/slice2-plan.md` at 22:22, after my snapshot (sub-slice 2i, §8 line). It also wrote `verbatim_prompt_log/bundle_21/` (spec_coverage_audit, `02_autopilot_decisions.md`). My plan edits are targeted and keep theirs; my backup was taken after their edit.
- **Vite temp folders:** Vite briefly used the existing `.vite-temp` folders of the repo root, core and webview; all three are empty again.
- **`.git`:** its directory mtime moved at 22:15:16, from a transient lock file of my read-only `git status`. `.git/index` is unchanged.
- **Systemd scopes:** `capped.sh` made transient systemd user scopes, which ended with each job.
- **Untouched:** extension `dist`/`out`, `~/.npm`, the repo's `.vitest-cache`.
- **Processes:** none left running.

