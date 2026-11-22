# fix:2i:r1

Agent `a1e118421c91441fa` of workflow `wf_2f71cf32-72e`. Verbatim output (JSON alongside).

- **report:** FIXER 2i ROUND 1 REPORT

Per finding
- F-F1 (minor): FIXED. `planDel` (packages/core/src/edit/planDelete.ts) now looks up the `.holds` on its own: it is pushed whenever `statement` is set and `exists(holdsName(statement))`, even if the abbrev is missing. `planDeleteNode` already removes the `.holds` through its remove-holds op, so the card's `axiom x.holds` no longer survives as an unmarked axiom. New test in core `test/edit/delete.test.ts`: "slice 2i round 1 (F-F1): an axiom `.holds` whose abbrev is missing still goes with the card, so none is left behind". It checks `removeDecls` is `['S.o.holds']`, that the written file has no `o.holds` and no `id: o`, and that the other card's `axiom k.holds : k` stays.
- F-F2 (minor): NOT CHANGED IN CODE, documented. The webview holds only the current board, so the chip tooltip and the details row name a premise that is not on it (a missing card, or another subject's) by its id. TL122 names another subject's card by its sentence. The difference is rare and was already in a code comment. It is now written as a decision in the plan's §8 entry "Fixer 2i round 1".
- F-F3 (minor): FIXED by a pinning test. New Playwright test in packages/webview/test/e2e/s1-session.spec.ts: "in the Proposed view an old axiom is named only in its chip tooltip: its details have no "declared before v4" line (slice 2i round 1, F-F3)". It gives `pg-no-dark-past` (an axiom) `premises: [cynder-dark-past]` in both the board's graph and the session's `board.graph`. Then:
  - In the Current view the details line reads "Declared before v4 (not drawn): arrows from “Cynder is a character who has a dark past”.".
  - In the Proposed view the chip tooltip names the card, the details show `proposal-readonly`, and there is no `declared-before-v4` line and no `legacy-drop-arrows`.
  - My first version of this test failed because the Proposed view draws the session's own board graph, not the one the page was opened with. I rewrote it to patch the session's graph too.
- F-F4 (nit): FIXED. The Dialogs.tsx header comment for the delete dialog now reads "delete the card with its Lean code, or cancel … When other declarations use that Lean code, the dialog opens again … 'Delete anyway', or cancel. Slice 2i: there is no 'card only' choice …".

Files changed (backups in S/f2ir1/backup, S = /tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad)
- packages/core/src/edit/planDelete.ts (F-F1)
- packages/core/test/edit/delete.test.ts (F-F1 test)
- packages/webview/src/dialogs/Dialogs.tsx (comment only)
- packages/webview/test/e2e/s1-session.spec.ts (F-F3 test)
- docs/slice2-plan.md (one §8 entry, "Fixer 2i round 1")
- packages/webview/src/board/CardDetails.tsx was touched only for a mutant and restored byte for byte (`cmp`), so it is not in changed_files.txt.

Mutation checks
- F-F1: I put the original `planDel` (the `.holds` pushed only inside `if (statement && exists(statement))`) back into planDelete.ts. `test/edit/delete.test.ts` then failed: "× slice 2i round 1 (F-F1): an axiom `.holds` whose abbrev is missing …" (1 failed, 8 passed). I restored the fixed file and checked it with `cmp`.
- F-F3: in src/board/CardDetails.tsx line 534 I rendered `<DeclaredBeforeV4 node={node} />` in the Proposed branch too, rebuilt the scratch bundle, and ran s1-session. The new test failed at `toHaveCount(0)` of `declared-before-v4` (1 failed, 2 passed). I restored the file (`cmp` identical) and rebuilt the scratch bundle.

Verification (S/f2ir1 for fsmc, tmp, ttmp; `TELELEAN_NO_REAL_CLAUDE=1`; one heavy job at a time through capped.sh; MemAvailable about 38 GB)
- tsc `--noEmit` (capped 1800), rc 0 with no output: core tsconfig.test.json; webview tsconfig.json; webview tsconfig.node.json.
- vitest core, full suite, cap 1800, `--maxWorkers=1 --no-cache --fsModuleCachePath=…/fsmc`: "Test Files 76 passed (76) · Tests 1142 passed (1142)" (1141 before, plus the F-F1 test).
- vitest webview, full suite: "Test Files 24 passed (24) · Tests 435 passed (435)".
- runner files that go through real core delete, with real Lean (LEAN_NUM_THREADS=2, cap 3000, timeout 900):
  - test/integration/fixes.test.ts: "Test Files 1 passed (1) · Tests 5 passed (5)"
  - test/integration/session.test.ts: "Test Files 1 passed (1) · Tests 8 passed (8)"
  - No runner file was touched, so I ran no other runner files.
- Scratch build `TELELEAN_WEBVIEW_OUT=S/f2ir1/webview-out vite build`: "✓ built in 472ms". dist was not written.
- Playwright `test/e2e/s1-session.spec.ts` against the scratch build: "3 passed (7.5s)". The home guard reported the home folder unchanged. I did not re-run the other Playwright specs from round 0, because this round changed no webview behaviour, only a comment and a test.
- snapdiff: before.diff 441 files, after.diff 441 files (S/f2ir1/before.diff and S/f2ir1/after.diff).

Decisions for the orchestrator to log (also in the plan's §8)
1. F-F2: the chip tooltip and the details row name a premise that is not on the current board by its id; TL122 names another subject's card by its sentence. The two surfaces differ only for that rare case. Alternative: the host sends the premise sentences with the old-axiom information, as `dependentCards` does for deletes.
2. F-F3: pin with a test that the Proposed view's details have no "declared before v4" line; the chip tooltip names the cards there, and the two choices are not offered there. Alternative: render the line in the Proposed view too.
3. F-F1: `planDel` finds the `.holds` independently of the statement declaration. Alternative: record the limit in §8 only. I chose the fix because it is a one-line change that closes the hidden-belief case.

Effects outside the repo and my scratch dir
- Playwright runs created and deleted short Chrome temp dirs (`/tmp/tl-pw-chrome-XXXXXX`, isolated HOME/XDG); the home guard reported the home folder unchanged each time.
- capped.sh started transient systemd user scopes; none remain.
- vite wrote and removed its temporary config bundle in /home/zhengyew/telelean/node_modules/.vite-temp/ (the folder already existed). This happened in 4 scratch builds.
- Playwright created packages/webview/test-results; I removed it (`rm -rf`). It is absent now.
- No installs, npx/npm, network, git changes or real Claude. No processes of mine are left.
- **notFixed:**
  - [1]
    - **id:** F-F2
    - **why:** Not a code change. The webview holds only the current board, so it cannot name another subject's card by its sentence; the difference from TL122 occurs only for an old axiom whose premises: names a card of another subject. It is recorded as a decision in the plan's §8 (alternative: the host sends the sentences).
