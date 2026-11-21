You are the BUILDER for sub-slice 2c1 of telelean slice 2 ("the review list"). Work in /home/zhengyew/telelean. Your scratch dir: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b2c1 (create it).

READ FIRST, in this order:
1. /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/builder_rules.md — mandatory safety and resource rules (no git changes, no npx/npm, never real Claude, never write packages/extension/dist or out, memory cap via capped.sh, vitest one worker, extension vitest with --no-cache, TELELEAN_TEST_TMP in your scratch dir, delete files with plain rm).
2. /home/zhengyew/telelean/docs/slice2-plan.md — the plan. Read §0 (rules), §1 (the order of sub-slices and YOUR sub-slice's entry in full), §2 and §2.9 (contracts: implement them exactly as written), every section your sub-slice's entry points to, §6 (tests for your sub-slice), §7 (decisions) and §8 (the change log, including what earlier sub-slices of slice 2 decided).
3. The spec, for meaning: /home/zhengyew/telelean/verbatim_prompt_log/bundle_21/user_requested_documents/01_spec_v4.md — the clauses your sub-slice cites. The autopilot decisions that override the spec are in /home/zhengyew/telelean/verbatim_prompt_log/bundle_21/user_requested_documents/02_autopilot_decisions.md (notably AP-24: stage-level reveal, no decisions while a Claude step runs, a Formalize queue runs to completion before its stage opens).
4. /home/zhengyew/telelean/docs/slice1-plan.md §8 — what slice 1 built and decided (the code you build on).

GOAL: implement sub-slice 2c1 exactly as the plan's §1 entry and its sections describe — no more (later sub-slices exist), no less. Earlier sub-slices of slice 2 are in the working tree. Keep the product working: every package compiles and every unit test passes at the end of your sub-slice (the plan's §0/§1 say how tests that move to a later sub-slice are handled — follow that, and list every such test). Where the plan leaves a detail open, decide it, keep it minimal, and append a dated line to the plan's §8 change log ("builder 2c1: …").

VERIFY before you finish (capped.sh, one heavy job at a time, node_modules/.bin binaries): tsc --noEmit clean for core and runner (tsconfig.test.json), webview (tsconfig.json and tsconfig.node.json) and extension (tsconfig.json); vitest pass for core, webview, extension (--no-cache) and for the runner test files your change touches (with real Lean only if MemAvailable allows, capped 3000, timeout 900 each); if you touched the webview, one scratch build with TELELEAN_WEBVIEW_OUT into your scratch dir (never dist) — and if MemAvailable is above 6 GB you may run the Playwright specs your change affects, one at a time, against that build (`TELELEAN_WEBVIEW_OUT=… capped.sh 3000 sh -c 'ulimit -c 0; /home/zhengyew/telelean/node_modules/.bin/playwright test test/e2e/<spec>'` from packages/webview), moving any packages/webview/test-results folder to your scratch dir afterwards.

REPORT (your final message): files changed (one line each), tests added/updated/skipped-for-later/deleted (names), the exact verification commands and their summary lines, decisions you made (also in the plan's §8), and every effect outside the repo and your scratch dir. Do not claim anything you did not run.

ULTRACODE ADDITIONS (the user asked for maximum thoroughness; these are mandatory):
- MUTATION CHECKS: for each key rule or safety property your sub-slice implements (every gate rule, every status transition, every refusal, every ownership/visibility rule), temporarily break it in the source (invert or drop the key condition), run the test file(s) that should catch it, confirm at least one test FAILS, then restore the file byte for byte (keep a copy in your scratch dir and check with `cmp`). Report each mutation as: file:line, what you broke, which test failed. A rule no test catches needs a new test.
- EDGE CASES: for every function you add, test the empty case, the single case, the many case, and the boundary the spec or plan names (e.g. a removal, an unchanged state, a duplicate, a cycle, a reload mid-way).
- RUNNER: if you touched packages/runner, run every runner test file your change touches with real Lean where needed (capped 3000, timeout 900 each); the integrator runs the full runner suite after you.


CARRY-OVER FROM THE ORCHESTRATOR (AP-30, AP30-1 r3; do this FIRST): check packages/core/src/gate/g0.ts. If 2b2 did not already implement the plan's "Names as Lean reads them (AP30-1 r3)" rule (§2.1 "No Claude code runs at import"; §1.1 2b2's G0 bullet), implement it now: G0 compares attribute names after Lean's eraseMacroScopes on the canonical name; refuses as `metaprogramming` any identifier in Claude's lines with a `«_@»` component or a last component `_hyg` ("‹name› is a hygienic name, which is not allowed in the model files: rename it."); and judges an attribute list as a whole (an `init`/`builtin_init` in a list one of whose lines is Claude's is refused even on a line B also has). Tests: §6.1 2b2's "Hygienic names (AP30-1 r3)" list, with the mutation check. Report whether you implemented it or found it done.

CARRY-OVERS FROM 2b2's REVIEW (mandatory, do these first; each with a test where it changes behaviour; list each in your report as fixed / not fixed (why)):

- R2-1 (minor) at packages/core/src/review/revert.ts:269 (`end: start + newText.trimEnd().length`), with :262 (the 'before' side's backward whitespace walk, unchanged by r2); docs/slice2-plan.md §4.11 and the §8 "fixer 2b2 r2" entry ("its trailing whitespace excluded")
  PROBLEM: A declaration's span runs to the end of its last line, trailing spaces and tabs included:
- markup/decls.ts:384 uses `lines.contentEnd(endLine)`, and text.ts:32-37 does not trim it;
- `DeclEntry.text` is that slice (gate/decls.ts:44).

The run's end, `trimEnd()` of the inserted text, therefore lands inside the previous declaration's own text whenever its last line ends in whitespace. The next declaration's edit then replaces those spaces, and the revert's check refuses the result: "telelean could not take the content out cleanly (Spyro.t1.holds does not read as it did when the session started): nothing was written."

The 'before' side has the same edge. That is the case of two declarations that are first in their file and go back before the same unit, which the fixer says already worked. There, the second one's backward whitespace walk (:262) eats the first one's trailing spaces.

So R1-2's scenario stays blocked whenever the first of the two declarations ends its last line with whitespace. The scenario is two pending claims, or the person's own proofs, adjacent in B, each moved by its own step, and taken out together by a Reject cascade (RV-5) or Submit's take-out. This is plausible for the person's own Lean text, since editors often leave trailing spaces.

It fails closed: nothing is written, and each declaration alone still goes back.
  FIX: End the run where B's own declaration text ends in the inserted text, not at `trimEnd()`. In step 2, iterate over `{ name, at, place }` and compute `eol` before the edit. After `session.apply`:

```
const own = at.text.split(/\r?\n/).join(eol);
const k = newText.indexOf(own);
run = { path: place.path, side: place.side, offset: place.offset, end: start + (k >= 0 ? k + own.length : newText.trimEnd().length) };
```

Then make `follows` require the same side, path and offset:
- for 'after', start at `run.end`, as now;
- for 'before', keep `end = mapOffset(place.offset)` but set `start = run.end` instead of walking back over whitespace.

Add a revert test where the first of two adjacent declarations ends its last line with spaces, in both layouts (after a kept unit, and first in the file before a unit); taking both out at once must give B byte for byte. Reword §4.11 and the §8 entry: "where the previous one's own text ends (B's declaration text, its trailing spaces included)".
