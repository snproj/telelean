You are the BUILDER for sub-slice 2c2 of telelean slice 2 ("the review list"). Work in /home/zhengyew/telelean. Your scratch dir: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b2c2 (create it).

READ FIRST, in this order:
1. /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/builder_rules.md — mandatory safety and resource rules (no git changes, no npx/npm, never real Claude, never write packages/extension/dist or out, memory cap via capped.sh, vitest one worker, extension vitest with --no-cache, TELELEAN_TEST_TMP in your scratch dir, delete files with plain rm).
2. /home/zhengyew/telelean/docs/slice2-plan.md — the plan. Read §0 (rules), §1 (the order of sub-slices and YOUR sub-slice's entry in full), §2 and §2.9 (contracts: implement them exactly as written), every section your sub-slice's entry points to, §6 (tests for your sub-slice), §7 (decisions) and §8 (the change log, including what earlier sub-slices of slice 2 decided).
3. The spec, for meaning: /home/zhengyew/telelean/verbatim_prompt_log/bundle_21/user_requested_documents/01_spec_v4.md — the clauses your sub-slice cites. The autopilot decisions that override the spec are in /home/zhengyew/telelean/verbatim_prompt_log/bundle_21/user_requested_documents/02_autopilot_decisions.md (notably AP-24: stage-level reveal, no decisions while a Claude step runs, a Formalize queue runs to completion before its stage opens).
4. /home/zhengyew/telelean/docs/slice1-plan.md §8 — what slice 1 built and decided (the code you build on).

GOAL: implement sub-slice 2c2 exactly as the plan's §1 entry and its sections describe — no more (later sub-slices exist), no less. Earlier sub-slices of slice 2 are in the working tree. Keep the product working: every package compiles and every unit test passes at the end of your sub-slice (the plan's §0/§1 say how tests that move to a later sub-slice are handled — follow that, and list every such test). Where the plan leaves a detail open, decide it, keep it minimal, and append a dated line to the plan's §8 change log ("builder 2c2: …").

VERIFY before you finish (capped.sh, one heavy job at a time, node_modules/.bin binaries): tsc --noEmit clean for core and runner (tsconfig.test.json), webview (tsconfig.json and tsconfig.node.json) and extension (tsconfig.json); vitest pass for core, webview, extension (--no-cache) and for the runner test files your change touches (with real Lean only if MemAvailable allows, capped 3000, timeout 900 each); if you touched the webview, one scratch build with TELELEAN_WEBVIEW_OUT into your scratch dir (never dist) — and if MemAvailable is above 6 GB you may run the Playwright specs your change affects, one at a time, against that build (`TELELEAN_WEBVIEW_OUT=… capped.sh 3000 sh -c 'ulimit -c 0; /home/zhengyew/telelean/node_modules/.bin/playwright test test/e2e/<spec>'` from packages/webview), moving any packages/webview/test-results folder to your scratch dir afterwards.

REPORT (your final message): files changed (one line each), tests added/updated/skipped-for-later/deleted (names), the exact verification commands and their summary lines, decisions you made (also in the plan's §8), and every effect outside the repo and your scratch dir. Do not claim anything you did not run.

ULTRACODE ADDITIONS (the user asked for maximum thoroughness; these are mandatory):
- MUTATION CHECKS: for each key rule or safety property your sub-slice implements (every gate rule, every status transition, every refusal, every ownership/visibility rule), temporarily break it in the source (invert or drop the key condition), run the test file(s) that should catch it, confirm at least one test FAILS, then restore the file byte for byte (keep a copy in your scratch dir and check with `cmp`). Report each mutation as: file:line, what you broke, which test failed. A rule no test catches needs a new test.
- EDGE CASES: for every function you add, test the empty case, the single case, the many case, and the boundary the spec or plan names (e.g. a removal, an unchanged state, a duplicate, a cycle, a reload mid-way).
- RUNNER: if you touched packages/runner, run every runner test file your change touches with real Lean where needed (capped 3000, timeout 900 each); the integrator runs the full runner suite after you.

CARRY-OVERS FROM 2c1's REVIEW (mandatory, do these first; each with a test where it changes behaviour; list each in your report as fixed / not fixed (why)):

- R2-1 (minor) at packages/core/src/review/texts.ts:574 (`otherResultNotFrozen`: "Call freeze_statements, then finish again."), used by packages/core/src/gate/sessionRules.ts:1303-1306; docs/slice2-plan.md §4.7 "Residual channels" (the fixer 2c1 r2 R1-1 bullet) and §8 "fixer 2c1 r2" (the rejection of alternative (a))
  PROBLEM: The R1-1 refusal asks Claude to freeze at the end of a not-proved attempt. That freeze holds everything the step wrote except proofs: `proof-before-freeze` refuses only a proof or a carrier. So a helper definition written for the failed attempt goes into the freeze commit, is recorded `statements` (D2-43), and is listed as a visible `decl:` item while the results are hidden.

A step that froze before its proof attempt, which every proved step does, records the same helper as `proof`, hidden with its Result.

The §8 entry rejects alternative (a) for exactly this reason: "a freeze forced at the end would make a failed proof attempt's helper definitions statement content … a new difference". The chosen fix produces that difference in the cases it refuses, and only in the not-proved branch. §4.7's new residual describes only the opposite case: an unused definition stays hidden after an unfrozen finish.

The channel depends on when Claude freezes, but the refusal pushes the freeze late only in not-proved outcomes, so the outcome shows in the item list without being documented.
  FIX: At minimum:
- add this channel to §4.7's accepted residuals: after the freeze this refusal asks for, what the step wrote for its failed attempt that is not a proof (a helper definition or vocabulary) reads as statement content and is listed, where a step frozen before its attempt hides it with the Result;
- correct §8's reason for rejecting (a), which applies to the chosen fix in the cases it refuses.

Optionally, also word the message so that the late freeze holds statement content only: "… Remove what you wrote only for the proof attempt, call freeze_statements, then finish again." If so, update §4.9's quote and the judge test's `toContain`.
