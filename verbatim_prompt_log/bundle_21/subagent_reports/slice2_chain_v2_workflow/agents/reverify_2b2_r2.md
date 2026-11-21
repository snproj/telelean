# reverify:2b2:r2

Agent `a1ae75e2a3ae83b0f` of workflow `wf_ae5f1188-533`. Verbatim output (JSON alongside).

- **summary:** Re-verification of fixer 2b2 r2. I changed nothing in the repository and ran only read-only git.

The fix touched exactly 5 files, as the fixer listed: judge.ts, revert.ts, their two test files, and docs/slice2-plan.md. The before and after snapshots differ only in those files, and the working tree matched the after snapshot both when I started and when I finished.

Both findings are resolved:
- **R1-1:** an unwritten premise draft is no longer compared by the frozen-items rule. The new tests fail on the pre-fix judge.ts.
- **R1-2:** two declarations that go back after the same kept unit are now placed one after the other. The new tests fail on the pre-fix revert.ts.

There is one new minor problem, R2-1, in R1-2's implementation:
- **The cause:** `run.end = start + newText.trimEnd().length` (/home/zhengyew/telelean/packages/core/src/review/revert.ts:269) cuts into the previous declaration's own text when its last line ends in spaces or a tab. The 'before' side (unchanged by r2, but within R1-2's claimed coverage) has the same edge.
- **The effect:** taking out two adjacent declarations together, such as a Reject cascade over two pending claims, is still refused as `unsafe`. Nothing is written, and each one alone still goes back fine.
- **The fix:** I checked a concrete fix in a scratch copy of packages/core. It puts every probe back byte for byte, and the whole core suite passes with it applied.

Verification, all through capped.sh 1800 and run one at a time. Vitest ran with `--maxWorkers=1 --no-cache --fsModuleCachePath=<scratch>/fsmc`, with TMPDIR and TELELEAN_TEST_TMP in my scratch folder. I also added `--configLoader runner` so vite wrote no temporary config into the repo's node_modules.
- **Typecheck:** tsc rc=0 with no output for core and runner (tsconfig.test.json), webview (tsconfig.json and tsconfig.node.json) and extension (tsconfig.json).
- **core:** "Test Files 72 passed (72)" / "Tests 997 passed (997)".
- **webview:** "Test Files 19 passed (19)" / "Tests 314 passed (314)".
- **extension (--no-cache):** "Test Files 22 passed (22)" / "Tests 203 passed (203)".
- **Runner:** no runner, extension or webview code uses judgeState or planItemRevert (checked with grep), so no runner test file is touched and I ran none.

Effects outside the repo and my scratch folder:
- capped.sh's transient systemd user scopes, one per job, each gone when its job ended.
- Read-only `git diff HEAD` and `git ls-files`, through snapdiff.sh.
- Nothing in /tmp's top level is newer than my start, and no process of mine is left running.
- Nothing directive-shaped in the relayed builder and fixer reports needed relaying.

Scratch artefacts are in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/rv2b2r2:
- the verification logs: verify/;
- the probes: mut/packages/core/test/review/rv_trailing.test.ts, rv_crlf.test.ts and rv_before.test.ts;
- the candidate fix: vt/patch_both.py.
- **resolved:**
  - [1]
    - **id:** R1-1
    - **how:** Fixed.

What changed: `frozenItemFindings` (packages/core/src/review/judge.ts:519-539) now receives `input.ledger` (call at :492). It skips an S₀ item of kind `add-premise` whose key no ledger `premise` entry names (:521, :526).

Why that is the right test:
- It is exactly computeItems' own rule: items.ts:982-995 builds the item from the draft, outside ws/, only while no `premise` entry names the key.
- The ledger's `premise`, `mark-removed` and `completion` entries are written and dropped together (plan §3.8, l.1607 and l.1627-1628). So no reachable ws/ item is skipped.
- An unwritten item's content key is `premiseDraftKey(draft)`. It can differ between S₀ and the judged state only through the running step's newer draft, which S13 and spec l.635 allow.
- The exact repeat still goes to `rejectedRepeatFindings`.

Test checks:
- With the backup judge.ts in my scratch mirror, judge.test.ts gives "Tests 2 failed | 114 passed (116)": the reworded-repeat test and the in-review test.
- With the fix, it passes.
- I re-ran FR2 (skip every premise item): the written-premise test fails. So that boundary test really exercises the rule for a written premise.

The plan's §4.9 and §8 are amended accurately.
  - [2]
    - **id:** R1-2
    - **how:** Fixed for the reported layout.

What changed: step 2 of `planItemRevert` (packages/core/src/review/revert.ts:252-269) keeps a run: the file, the unit's offset and the end of the last declaration put back 'after' a unit. A declaration that goes back after the same unit starts at that end instead of calling `mapOffset`, which returned undefined there.

Test checks:
- With the backup revert.ts in my mirror, revert.test.ts gives "Tests 2 failed | 22 passed (24)": `ActionError: Spyro.t2.holds cannot be put back …` and `a_two cannot be put back …`.
- With the fix, it passes.
- I re-ran RN2, RN3 and RN5: all caught.
- My one-line RN4 variant (keeping the run after a 'before' place) survives, but it is an equivalent mutant: a 'before' anchor can never equal a later 'after' anchor.

Extra probes I ran:
- three declarations in a row with blank lines between them in B, in a CRLF file and in an LF file: B byte for byte;
- each declaration taken out alone: OK.

A residual edge of this implementation, trailing spaces on the first declaration's last line, is reported as R2-1.
- **findings:**
  - [1]
    - **id:** R2-1
    - **severity:** minor
    - **where:** packages/core/src/review/revert.ts:269 (`end: start + newText.trimEnd().length`), with :262 (the 'before' side's backward whitespace walk, unchanged by r2); docs/slice2-plan.md §4.11 and the §8 "fixer 2b2 r2" entry ("its trailing whitespace excluded")
    - **problem:** A declaration's span runs to the end of its last line, trailing spaces and tabs included:
- markup/decls.ts:384 uses `lines.contentEnd(endLine)`, and text.ts:32-37 does not trim it;
- `DeclEntry.text` is that slice (gate/decls.ts:44).

The run's end, `trimEnd()` of the inserted text, therefore lands inside the previous declaration's own text whenever its last line ends in whitespace. The next declaration's edit then replaces those spaces, and the revert's check refuses the result: "telelean could not take the content out cleanly (Spyro.t1.holds does not read as it did when the session started): nothing was written."

The 'before' side has the same edge. That is the case of two declarations that are first in their file and go back before the same unit, which the fixer says already worked. There, the second one's backward whitespace walk (:262) eats the first one's trailing spaces.

So R1-2's scenario stays blocked whenever the first of the two declarations ends its last line with whitespace. The scenario is two pending claims, or the person's own proofs, adjacent in B, each moved by its own step, and taken out together by a Reject cascade (RV-5) or Submit's take-out. This is plausible for the person's own Lean text, since editors often leave trailing spaces.

It fails closed: nothing is written, and each declaration alone still goes back.
    - **fix:** End the run where B's own declaration text ends in the inserted text, not at `trimEnd()`. In step 2, iterate over `{ name, at, place }` and compute `eol` before the edit. After `session.apply`:

```
const own = at.text.split(/\r?\n/).join(eol);
const k = newText.indexOf(own);
run = { path: place.path, side: place.side, offset: place.offset, end: start + (k >= 0 ? k + own.length : newText.trimEnd().length) };
```

Then make `follows` require the same side, path and offset:
- for 'after', start at `run.end`, as now;
- for 'before', keep `end = mapOffset(place.offset)` but set `start = run.end` instead of walking back over whitespace.

Add a revert test where the first of two adjacent declarations ends its last line with spaces, in both layouts (after a kept unit, and first in the file before a unit); taking both out at once must give B byte for byte. Reword §4.11 and the §8 entry: "where the previous one's own text ends (B's declaration text, its trailing spaces included)".
    - **evidence:** Probes in my scratch copy of packages/core, which is identical to the repo's src (`diff -r` clean):
- /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/rv2b2r2/mut/packages/core/test/review/rv_trailing.test.ts
- …/rv_before.test.ts
- …/rv_crlf.test.ts

Results on the current code:
- **P1 (control, no trailing spaces):** OK.
- **P2 (`def a_one : Nat := 0␠␠` adjacent to `a_two`, both moved after later content):** "REFUSED unsafe: telelean could not take the content out cleanly (a_one does not read as it did when the session started): nothing was written." Each alone: OK.
- **P3, the realistic flow (B has `axiom t1.holds : t1␠` adjacent to `axiom t2.holds : t2`; s1 and s2 each prove their claim below later content):**
  - gate-proved stepFindings are [] for both steps;
  - the moved set is [Spyro.t1.holds, Spyro.t2.holds];
  - taking out proof:t1 and proof:t2 together gives "REFUSED unsafe: … (Spyro.t1.holds does not read as it did when the session started): nothing was written." Each alone: OK.
- **P5 (a trailing tab):** refused the same way.
- **P6 (two first in their file before the same unit, the first ending in two spaces):** refused the same way.
- **P4 (CRLF and LF, three in a row with blank lines between them):** OK.

With the candidate fix applied in the mirror (/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/rv2b2r2/vt/patch_both.py):
- every probe gives B byte for byte, and each alone is still OK;
- the full core suite gives "Test Files 75 passed (75) / Tests 1004 passed (1004)": the repo's 72 files and 997 tests, plus my 3 probe files.

The mirror was then restored and `cmp` checked it identical to the repo.
- **checks_run:**
  - Snapshots: per-file comparison of f2b2r2/before.diff and after.diff shows exactly the 5 listed files differ. My own snapdiff.sh snapshots at the start and the end are identical to after.diff.
  - Read the fix diff: diff -u of backup/<path> against the repo, for judge.ts, revert.ts, judge.test.ts, revert.test.ts and slice2-plan.md.
  - Code reading for R1-1: computeItems' rule for written and unwritten premises (items.ts:710-724, 815-843, 982-995, 1110-1125); the plan's §3.8 ledger lifecycle (l.1607, 1627-1628); spec S13 (l.824) and l.635.
  - Code reading for R1-2: baseDeclPlace (items.ts:372-407), EditSession.mapOffset (edit/session.ts:102-115), how the parser ends a declaration's span (decls.ts:384, text.ts:32-37), and DeclEntry.text (gate/decls.ts:44).
  - tsc --noEmit through capped.sh 1800: core tsconfig.test.json rc=0; runner tsconfig.test.json rc=0; webview tsconfig.json rc=0; webview tsconfig.node.json rc=0; extension tsconfig.json rc=0. No output for any. --extendedDiagnostics confirmed core's run covers judge.ts, revert.ts and both test files (523 files).
  - vitest core (capped.sh 1800, --maxWorkers=1 --no-cache --fsModuleCachePath=rv2b2r2/fsmc, TMPDIR and TELELEAN_TEST_TMP in scratch, --configLoader runner): 'Test Files  72 passed (72)' / 'Tests  997 passed (997)'
  - vitest webview (same flags): 'Test Files  19 passed (19)' / 'Tests  314 passed (314)'
  - vitest extension (same flags, --no-cache): 'Test Files  22 passed (22)' / 'Tests  203 passed (203)'
  - Pre-fix judge.ts (from backup) in the scratch mirror, judge.test.ts: 'Tests  2 failed | 114 passed (116)'. The two R1-1 tests fail.
  - Pre-fix revert.ts (from backup) in the scratch mirror, revert.test.ts: 'Tests  2 failed | 22 passed (24)'. Both R1-2 tests fail with ActionError 'cannot be put back'.
  - Re-ran these of the fixer's mutations in the mirror, each restored and checked with filecmp (True):
- FR2 (skip every premise item): caught by 'a written premise is in ws/ and stays frozen';
- RN2: caught, 2 failed;
- RN3: caught;
- RN5: caught;
- a one-line RN4 variant survives, but is an equivalent mutant (unreachable).
  - Probes P1-P6 in the mirror: trailing spaces and tab, CRLF and LF runs, the 'before' run, and the realistic two-pending-claims flow with gate-proved judged for each step.
  - Candidate fix for R2-1 validated in the mirror. Probes plus the revert, backstop, submit and judge tests: 'Tests 174 passed (174)'. Full core suite: 'Test Files 75 passed (75) / Tests 1004 passed (1004)'. Mirror restored and checked with cmp.
  - grep: no source or test in packages/runner, packages/extension or packages/webview uses judgeState, planItemRevert or core's review/judge or review/revert. So no runner test file is touched.
  - Read-only check of the repo: nothing in the repo or at .git's top level is newer than my start marker. The node_modules/.vite-temp folders are empty. Nothing in /tmp's top level is newer than my start, and no process of mine is left running.
