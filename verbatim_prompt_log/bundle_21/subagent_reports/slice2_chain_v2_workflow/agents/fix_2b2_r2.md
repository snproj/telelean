# fix:2b2:r2

Agent `a79f72fefcfb6b75f` of workflow `wf_ae5f1188-533`. Verbatim output (JSON alongside).

# Fixer 2b2 r2 report (telelean slice 2, sub-slice 2b2)

## Summary
Both findings are fixed in the working tree, and I judged neither wrong.
- Each fix has a test that fails without it. I checked this by mutation and restored every file byte for byte, checked with `cmp`.
- Everything compiles. Unit tests pass: core 997 (was 991), webview 314, extension 203.
- No runner test file is touched, so no real-Lean runner file was run (details under Verification).
- Snapshots:
  - before: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2b2r2/before.diff (351 files)
  - after: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2b2r2/after.diff (taken last, 351 files). It differs from before in exactly the 5 files listed under "Files changed".
- Backups: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2b2r2/backup/
- Changed paths: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2b2r2/changed_files.txt

## Findings
### R1-1 (major): FIXED
`frozenItemFindings` no longer compares a premise item that is not written yet. That is an S₀ item of kind `add-premise` whose key no ledger `premise` entry names. This is the same test computeItems uses to build the item from the draft, which lives outside ws/.
- The ledger is passed in from judgeState: packages/core/src/review/judge.ts:492, :521 and :526.
- The code is:
  - `const written = new Set(ledger.flatMap((e) => (e.kind === 'premise' ? [e.item] : [])));`
  - `if (d.kind === 'add-premise' && !written.has(d.key)) continue;`
- What now happens:
  - A step that proposes a premise again under the same key, reworded, passes at check, gate-proved and gate-other.
  - The exact repeat of a rejected premise still gets only `rejected-repeat/premise`.
  - A premise that is already written in ws/ stays frozen.
- I used the ledger instead of the review's "`provides` all empty" test (see Decision 1).
- Tests: 4 new, in packages/core/test/review/judge.test.ts:1664, describe "fixer 2b2 r2 (R1-1) …":
  - a reworded repeat of a rejected premise at a Submit step (check and gate-proved, where the item reads the newer draft) and at a not-proved finish (gate-other), with and without the re-proposal;
  - a premise still in review, proposed again reworded by a step that opens no item;
  - the exact repeat gives `rejected-repeat/premise` alone;
  - a written premise stays frozen: a lemma written below the comment after its `.holds` takes the comment, giving `existing-changed/session` at check and gate-other, naming its two declarations.
- Plan:
  - §4.9's frozen-items bullet is amended;
  - fixer 2b2 r1's §8 A-V2B2-ADV-4 entry is annotated;
  - a new §8 entry "fixer 2b2 r2" is added.

### R1-2 (minor): FIXED
Step 2 of `planItemRevert` (packages/core/src/review/revert.ts:252-269) now tracks the last declaration it put back after a unit: that unit's path and offset, and where the declaration's own text ends (`start + newText.trimEnd().length`).
- When the next declaration goes back after the same unit (same file, same offset), it starts at that end instead of calling `mapOffset` on the anchor. Its B lead then replaces the previous declaration's trailing whitespace.
- Places before a unit (first in their file) already mapped correctly and are unchanged. The revert's final check is unchanged.
- The header doc comment and §4.11 are amended.
- Tests: 2 new, in packages/core/test/review/revert.test.ts:454, describe "fixer 2b2 r2 (R1-2) …":
  - Two pending claims adjacent in B, each proved below later content by its own step. Both steps pass gate-proved, and both `.holds` are moved. Taking both Results out at once gives B byte for byte; taking each out alone puts it back in place and leaves only the other one moved.
  - Several layouts, each giving B byte for byte:
    - three declarations after the same unit;
    - two after different units;
    - one in each of two files whose units end at the same offset;
    - two first in their file, before the same unit.

## Files changed (all under /home/zhengyew/telelean)
- packages/core/src/review/judge.ts: R1-1's skip; `frozenItemFindings` now takes the ledger; doc comments.
- packages/core/src/review/revert.ts: R1-2's consecutive placement in step 2; header and step-2 comments.
- packages/core/test/review/judge.test.ts: 4 tests; imports `planGhostAdoption` and `literal`.
- packages/core/test/review/revert.test.ts: 2 tests; imports `compareTexts` and `withChain`.
- docs/slice2-plan.md: §4.9 and §4.11 amended, two §8 annotations, and the new §8 "fixer 2b2 r2" entry.

No test was deleted, skipped or moved.

## Mutation checks (9; harness /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2b2r2/mutate.py, results muts1.out.json and muts1b.out.json there)
Every file was restored from a byte copy, and `cmp` confirmed it identical (restored=True for all 9). All 9 were caught. The revert.ts mutations ran at :253 and :268, before a later one-line comment edit shifted them; current line numbers are given below.

| ID | Where | What was broken | Result | First failing test |
|---|---|---|---|---|
| FR1 | judge.ts:526 | the skip dropped | 2 failed | "a reworded repeat of a rejected premise at a Submit step …" |
| FR2 | judge.ts:526 | every premise item skipped, written ones too | 1 failed | "a written premise is in ws/ and stays frozen …" |
| FR3 | judge.ts:521 | written set built from the entries' `card`, not `item` | 1 failed | same |
| FR4 | judge.ts:492 | the call passes `[]` as the ledger | 1 failed | same |
| RN1 | revert.ts:254 | never follows the previous place (the old `mapOffset` path) | 2 failed | "two pending claims adjacent in B …" |
| RN2 | revert.ts:269 | the run's end includes the trailing whitespace | 2 failed | same |
| RN3 | revert.ts:254 | the run ignores its unit | 1 failed | "three that go back after the same unit; …" ("a_four is not where it was") |
| RN4 | revert.ts:254+269 | the run applies before a unit too | 1 failed | same test (the case of two first in their file) |
| RN5 | revert.ts:254 | the run ignores the file | 1 failed | same test ("b_one does not read as it did …") |

Before each fix, its new tests failed on the unfixed code:
- R1-1: 2 failed. The written-premise and exact-repeat tests are boundary tests and passed both before and after.
- R1-2: 2 failed, with `ActionError: Spyro.t2.holds cannot be put back …` and `a_two cannot be put back …`.

## Verification (after the last source edit)
Script: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2b2r2/verify.sh. Logs are in the verify_final folder there.

How each command ran:
- through `capped.sh 1800`, one at a time, from the package directory;
- with the binary /home/zhengyew/telelean/node_modules/.bin/<tool>;
- with `TMPDIR=…/f2b2r2/tmp` and `TELELEAN_TEST_TMP=…/f2b2r2/ttmp`;
- vitest with `--maxWorkers=1 --no-cache --fsModuleCachePath=…/f2b2r2/fsmc`.

| Command | Result |
|---|---|
| core `tsc --noEmit -p tsconfig.test.json` | rc=0, no output |
| runner `tsc --noEmit -p tsconfig.test.json` | rc=0, no output |
| webview `tsc --noEmit -p tsconfig.json` | rc=0, no output |
| webview `tsc --noEmit -p tsconfig.node.json` | rc=0, no output |
| extension `tsc --noEmit -p tsconfig.json` | rc=0, no output |
| core `vitest run …` | "Test Files  72 passed (72)" / "Tests  997 passed (997)" |
| webview `vitest run …` | "Test Files  19 passed (19)" / "Tests  314 passed (314)" |
| extension `vitest run …` (`--no-cache`) | "Test Files  22 passed (22)" / "Tests  203 passed (203)" |

**Runner.** No runner file changed, and no runner source or test uses `judgeState`, `planItemRevert` or core's review module (checked with grep). So the set of touched runner test files is empty, and no real-Lean file was run.
- As a smoke check I ran: `capped.sh 1800 timeout 900 env -u UPDATE_SEMANTIC_RECORDINGS TMPDIR=… TELELEAN_TEST_TMP=… vitest run --maxWorkers=1 --no-cache --fsModuleCachePath=… test/gate/pure.test.ts`
- Result: rc=0, "Test Files  1 passed (1)" / "Tests  14 passed (14)". No /tmp/telelean-* was left.

The webview is untouched, so there was no build and no Playwright run.

## Decisions for the orchestrator to log
Both are also in docs/slice2-plan.md §8, under "fixer 2b2 r2".

1. **R1-1: what counts as an unwritten premise.**
   - The frozen-items rule skips an S₀ item of kind `add-premise` whose key no ledger `premise` entry names, the test computeItems uses to build the item from the draft. This holds whatever the record's status. An accepted premise whose write is still due is included: reconcile returns it to review as "updated", as it did before fixer 2b2 r1's rule (S13, §3.5).
   - A written premise stays frozen.
   - Alternative: the review's test, an `add-premise` draft whose `provides` are all empty (how `planItemRevert` reads "not written"). It agrees on every state a step can reach, but would also skip a written premise whose card, declarations and arrow are gone while its mark removal stays.
2. **R1-2: declarations that go back after the same unit.**
   - They go in B's order. Each starts where the previous one's own text ends, and its B lead replaces that one's trailing whitespace. The run applies only to "after" places with the same file and offset.
   - Alternative: put a run of adjacent declarations back as one slice of B's text.

No contract changed: `frozenItemFindings` is internal, and no §2.9 signature changed.

## Effects outside the repo and my scratch dir
- **Systemd scopes:** `capped.sh`'s `systemd-run --user --scope` created one transient user scope per job; each was gone when its job ended.
- **Vite temp folders:** node_modules/.vite-temp, packages/core/node_modules/.vite-temp and packages/webview/node_modules/.vite-temp already existed. vitest wrote temporary config files there and deleted them; all three are empty now.
- **Git:** I ran only read-only git: `git status --porcelain`, `git diff --stat`, and snapdiff.sh's `git diff`/`git ls-files`. The .git directory's mtime reads 05:44:25 (git status's opportunistic index lock), but .git/index is unchanged since 2026-11-17, and no file directly in .git is newer than my start.
- **/tmp:** /tmp's own mtime changed (05:45:38), but no entry in /tmp is newer than my start. Every command I ran set TMPDIR to my scratch dir, and no /tmp/telelean-* exists, so I do not believe it was me.
- **Build folders:** nothing in packages/extension/dist or packages/extension/out is newer than my start.
- **None of these:** network, npm/npx, installs, Playwright or browser, real Claude (`TELELEAN_NO_REAL_CLAUDE=1` for every test command through capped.sh), git state changes.
- **Processes:** none of mine are left running. The `lean --server` for ~/webring, VS Code, and the orchestrator's waitlabel.py and ramwatch.sh are not mine.
- **Scratch probes:** my probes stayed in my scratch dir (vt/, with its own vitest config and vitecache) and are not in the repo.

