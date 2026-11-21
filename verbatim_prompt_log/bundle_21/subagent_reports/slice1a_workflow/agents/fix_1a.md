# fix:1a

Agent `a1a1b9c17dda04a9a` of workflow `wf_f847ea09-3b3`. Verbatim output (JSON alongside).

FIXER 1a REPORT (two kinds, AXIOM and PROPOSITION; slice 1, sub-slice 1a)

All blocker and major findings are fixed. Every minor and nit finding is fixed except 1a-corr-6, where the brief and the spec disagree. That one is not changed in code and is recorded as OPEN for the integrator in docs/slice1-plan.md §8.

FINDINGS
- **F1 and 1a-corr-1 (major): FIXED.**
  - webview/src/board/diagnostics.ts: `stylesApplied()` now tests `lists.length === NODE_TYPES.length`. `themeColors()` returns `kindA`, `kindP` (`--tl-kind-p`) and `proved` (`--tl-proved`) instead of kindD and kindG.
  - main.tsx: the message now reads "kinds … …, proved …".
  - New unit guard in webview/test/unit/theme.test.ts: every `resolveColor('var(--tl-…)')` name in diagnostics.ts must be declared in board.css. The webview unit tests have no DOM, so `stylesApplied` itself is checked only by the e2e and smoke tests.
- **F2 and 1a-corr-2 (major): FIXED.**
  - New core export `upgradeLegacyProposal(proposal)` in core/src/run.ts (run.ts allows new exports; index.ts is untouched). What it does to a proposal saved before spec v4:
    - kinds go through parseNodeType;
    - `pending-promotion`, and `assumed` on a proposition, become `pending`;
    - the flags `claimed` and `proved-goal` are dropped; `rests-on-claimed` becomes `rests-on-pending`, which is also added when a footprint card is now pending;
    - TL105, TL116 and the TL102 goal variant are removed from `graph.diagnostics`;
    - the `lifecycle` key is deleted;
    - it does nothing to a v4 proposal and is idempotent.
  - runner/src/run/manager.ts `recover()` calls it before `makeRun`, so the final save writes run.json back upgraded.
  - core/src/graph.ts `columnOrder` now skips a node of no known kind instead of throwing.
  - Tests:
    - new core/test/proposal/legacy.test.ts (4 tests);
    - runner/test/run/manager.lifecycle.test.ts "a run in review saved before spec v4 comes back with its proposal in the two kinds, and can be accepted". It writes an old-style run.json, recovers it, checks the kinds, statuses, diagnostics, columnOrder and the rewritten run.json, then Accepts.
  - Mutation check: with the recover call disabled, that runner test fails. The source was restored afterwards (cmp identical).
- **F3: FIXED.** core/test/edit/conditional.test.ts gains two tests, ported to P->A of the conditional proposition d1:
  - "rewrite" with Main.lean changed since the check gives facts-stale, while mark-broken still plans holds-theorem-to-axiom;
  - with no facts, needs-confirmation lists g1, and "rewrite" then gives facts-stale.
- **F4 and 1a-corr-8: FIXED.**
  - demoClaude.ts accepts `card.type === 'AXIOM' || 'ASSUMPTION'`.
  - demo-driver.mjs: addCard('AXIOM'/'PROPOSITION'); the `lifecycle` read is removed.
  - demo-ui.mjs: KIND_NOUN is Axiom/Proposition; the comments say "A|P box" and no card-changes step.
  - docs/DEMO.md steps 4, 5, 10 and 11 are updated.
  - The builder's §8 "left unchanged" bullet is corrected.
  - Checks: `node --check` on both .mjs files; extension tsc (demoClaude.ts has no errors).
- **F5 and 1a-corr-9 (nits): FIXED.**
  - The `.tl-lifecycle` CSS rule is removed, and the "three columns" comments in board.css are updated.
  - Old nouns reworded:
    - CardDetails and ReportCard: "Nothing at all." and "…neither one of your axiom cards nor vocabulary";
    - the GhostSuggestion title and the runner's adoption notice: "proves the target with it".
  - The "pending proof" chip title no longer says "(spec v4: …)".
  - The kindProposition colour description now says "Propositions column".
  - `dependentsTexts(count)` loses its unused parameter.
  - EdgeEngine no longer measures obstacles: FrameInput.obstacles and the `data-edge-obstacle` markers are gone; gutterY and routedPath are kept for 1c.
  - The optimistic P->A in store.ts clears premises and fromNothing and hides the card's premise edges until the host's graph arrives; a refusal restores them. The rollback test in store.test.ts is extended to cover this.
  - P->A drops the card's canvas position from the layout (planAction `withoutPosition`, tested in scenarios.ts).
  - Left on purpose: GhostSuggestion's chip "gives the goal on its own", because e2e m2-overlay.spec.ts:114 pins it.
- **1a-corr-3: FIXED.** status.test.ts gains a describe with 3 tests (a in Axioms.lean, l in Lemmas.lean, v in Main.lean):
  - everything fresh: established;
  - l stale while a and v are fresh: not established;
  - l's `.holds` mismatched (TL114): not established.
  - Mutation check: with the direct(v) walk removed, the two negative tests fail. build.ts was restored (cmp identical).
- **1a-corr-4: FIXED.**
  - kindChange.ts A->P now counts only the cards that would lose a glow: `established` cards whose proved footprint contains the axiom.
  - kindChange.test.ts expects 2 cards instead of 3 (`at` is an axiom card).
  - contracts.test.ts adds a case: a dependent without the flag gets no glow sentence.
- **1a-corr-5: FIXED.** docs/m2-plan.md, with dated notes:
  - the §3.3 gate rows say AXIOM and PROPOSITION;
  - §4.1 preflight gives the AXIOM_TARGET_REFUSAL text;
  - the §5.2 bundle says "Pending proof"/"pending proof", plus the existing "assumed, but its axiom … is missing (add it)" variant;
  - the §5.3 adoption turn says "as an axiom … (AXIOM, worded by you)".
- **1a-corr-6: NOT CHANGED IN CODE.** The brief (D) explicitly says to remove the TL102 goal variant; spec B.5 says it "becomes 'rests on pending'". Since the brief and the spec conflict, the brief's choice is kept. §8 records it as OPEN, with the one-line alternative: a TL102 warning "The proof rests on pending: ‹ids›." beside the flag.
- **1a-corr-7: FIXED.**
  - planSetPremises removes a `follows_from:` line.
  - Ghost adoption (gate/adoption.ts) removes it from the target, and its safety check verifies the line is gone.
  - G5 (rules.ts `adoptedMarkRemoved`) accepts exactly that removal: on the target, when B had the mark, A and S have none, and `adoptedPremises` holds.
  - Tests:
    - scenarios.ts: set-premises on a marked card;
    - adoption.test.ts: the adoption replaces the mark;
    - rules.test.ts: the adoption's removal is allowed; without A, or done by the agent alone, it is a `follows_from` finding.

FILES CHANGED
- **core/src:** run.ts, graph.ts, kindChange.ts, edit/planAction.ts, gate/adoption.ts, gate/rules.ts.
- **core/test:** edit/conditional.test.ts, project/status.test.ts, edit/kindChange.test.ts, contracts.test.ts, edit/helpers/scenarios.ts, gate/adoption.test.ts, gate/rules.test.ts; NEW proposal/legacy.test.ts.
- **runner:** src/run/manager.ts; test/run/manager.lifecycle.test.ts.
- **webview/src:** board/diagnostics.ts, main.tsx, state/store.ts, board/EdgeEngine.ts, board/geometry.ts, board/Column.tsx, run/GhostSuggestion.tsx, board/CardDetails.tsx, run/ReportCard.tsx, model/cardData.ts, dialogs/Dialogs.tsx, styles/board.css.
- **webview/test/unit:** theme.test.ts, store.test.ts.
- **extension:** package.json, scripts/demo-driver.mjs, scripts/demo-ui.mjs, test/demo/demoClaude.ts.
- **docs:** slice1-plan.md (§8: a new "fixer 1a" entry and the corrected builder bullet), m2-plan.md, DEMO.md.

VERIFICATION (all through capped.sh, one job at a time, MemAvailable about 2.5–2.9 GB, nothing killed by the cap)
- **tsc:**
  - core `-p tsconfig.test.json`: exit 0, run again after the last edits, exit 0.
  - runner `-p tsconfig.test.json`: exit 0, twice.
  - webview `-p tsconfig.json`: exit 0.
  - webview `-p tsconfig.node.json`: exit 2 with the same 6 e2e-only errors as the builder (m1-edits.spec.ts 222, 252, 259; m2-layout.spec.ts 277; m2-review.spec.ts 234 ×2).
  - extension `-p tsconfig.json`: exit 2 with the same 9 errors in test/suite (e2e-runs 372 ×2; e2e 243; model 106; runs 271 ×2, 293 ×3).
- **vitest --maxWorkers=1:**
  - core: "Test Files 50 passed (50)", "Tests 526 passed (526)".
  - webview: "Test Files 8 passed (8)", "Tests 131 passed (131)".
  - extension (--no-cache; afterwards no file in out/ or dist/ was newer than my marker): "Test Files 21 passed (21)", "Tests 180 passed (180)".
- **runner (`capped.sh 1800 timeout 900 npx vitest run --maxWorkers=1 …`):**
  - R1 (manager.lifecycle, manager.start, manager.rounds, gate/rules, gate/engine): "1 failed | 4 passed (5)", "1 failed | 83 passed (84)". The failure was my new test: it rewrote run.json while dispose's queued write could still overwrite it. Fixed by awaiting dispose. Rerun of manager.lifecycle: "1 passed (1)", "10 passed (10)".
  - R2 (workspace/perform, proposal/accept, apply, build, sidecars): "5 passed (5)", "37 passed | 7 skipped (44)". The 7 skipped are build.test.ts's real-Lean tests, which wait for 12 GB of free RAM.
  - R3 (integration/m2flow): "1 passed (1)", "5 passed (5)".
  - R4a (run/fresh.e2e): "1 passed (1)", "9 passed (9)".
  - R4b (run/walkthrough.e2e): "1 passed (1)", "22 passed (22)".
  - Not run on this machine, because they need 12 GB free: integration/session.test.ts and fixes.test.ts (set-premises and kind changes with real Lean).

E2E UPDATES FOR THE INTEGRATOR (in addition to the builder's list)
- webview/test/e2e/board.spec.ts:149–151 should expect `kindP` and `proved` instead of kindD and kindG. Line 77 is fine.
- extension/test/suite/board.test.ts:100–118 needs the new colour ids and the fields kindP and proved. Line 58 (`styled` true) now holds again.
- m2-overlay.spec.ts:114 still pins "gives the goal on its own".

EFFECTS OUTSIDE THE REPO AND MY SCRATCH DIR
- Transient systemd user scopes, one per capped command. All have ended; none of mine are listed, and no process of mine is left. I did not touch the user's live `claude -p` run or the ramwatch.sh process, which is not mine.
- /tmp/telelean-ws-tests-{GWLYdH,jlk0rn,d5cIag,4XAAN5,mBZs9B}: created 02:27–02:29 by the runner workspace tests, each holding only an empty tmp/. Left in place, as the builder did.
- ~/.npm/_logs: one debug log per npx call (11 new); older logs were rotated out.
- Vitest caches in the repo's node_modules (.vitest-cache, .vite-temp) were updated.
- packages/extension/out and dist are untouched.
- No network, installs, real Claude, publishing, or git state change; only read-only git diff, status and show were used.
- Scratch logs and the originals used for the mutation checks are in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f1a/
