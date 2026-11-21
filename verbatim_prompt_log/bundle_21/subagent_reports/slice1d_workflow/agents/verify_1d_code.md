# verify:1d:code

Agent `adc025b44f28d2b8a` of workflow `wf_a032f8ab-e62`. Verbatim output (JSON alongside).

- **summary:** I confirmed the builder's verification claims. tsc passes for core, runner and the webview app config. The webview node config (6 errors) and extension (9 errors) fail only in the e2e and suite files that were already broken. Unit tests: core 53 files / 577 tests, webview 17 / 280, extension (--no-cache) 22 / 197. Runner tests the change touches, with real Lean: semantic 52, integration/session 8, m2flow + proposal/build 12, walkthrough + fresh e2e 31, gate 64. The value-probe test really ran Lean ("check ok 313 ms"). ~/.elan/known-projects, test-fixtures/, packages/extension/dist and out, and git state are unchanged. I did not re-run the vite build: the builder's scratch output exists.

The core walk, the value probe, its parsing, TL107, the chips, the glows and the RV-6 hiding all read correctly, and the carry-overs are in place. Three problems are real, and I reproduced each one with probes in my scratch folder:
1. The band bracket only covers arrows arriving on the card's left edge. A band arrow from a card to the right, or from a card stacked straight above or below (same x, so it loops into the right edge), is silently left out, yet the ✓ seal is still drawn over the rest. That is a ✓ on a strict subset of what Lean needs, a misleading green. With only such arrows, the proved card gets no band at all.
2. If facts lack valueConsts (fallback), a card is still marked established when its proof reaches a TL114 card only through a simp lemma. The cross-check flags uses-unseen but does not stop the green glow.
3. A walk that stops at another card's extra pinned lemma never checks whether that lemma's file is fresh. The card stays established after that file changes.

Smaller items: a model whose names clash with Lean.CoreM's imports now loses all facts; the e2e update list misses two specs; plus three nits.

Side effects: vitest touched .vite-temp and .vite caches under node_modules. Two empty /tmp/telelean-ws-tests-* folders left by runner workspace tests during my runs; I removed them. No processes are left.
- **findings:**
  - [1]
    - **id:** F1
    - **severity:** blocker
    - **where:** packages/webview/src/board/geometry.ts:485 (arrive only when routeSides(...).t === 'L') and :600-625 (bracket over `slots` only, seal whenever band.complete)
    - **problem:** The band's bracket only covers arrows that arrive on the target's left edge. A band arrow whose source is to the right of the target, or overlaps it horizontally (routeSides gives a loop into the right edge, e.g. a premise placed straight above its conclusion), gets no slot and is silently dropped from the bracket. The ✓ seal ('Together these suffice') is still drawn over the remaining arrows, so the board says a strict subset of what Lean needs is sufficient (a misleading green). If no band arrow arrives from the left, the proved card gets no band at all. Also, on a short card with many arrows, the spacing between arrival points shrinks below the bracket's 6 px pad, so the bracket can reach the ends of neighbouring arrows that are not in the band.
    - **evidence:** Probe scratchpad/v1d_corr/probe/band_stacked.mts: target t at canvas (400,300), premise 'above' at (400,100), premise 'left' at (20,300), band {above,left} complete. Output: 'path above->t M980 118C1022 118 1022 318 980 318' (arrives on the right edge); band d 'M714 312L710 312L710 324L714 324', seal at {x:710,y:318}, which only crosses left->t; band for {above} alone: []. band_right.mts: same with a source to the right. band_crowded.mts: 7 arrows into a 60 px card arrive 8 px apart, and the bracket spans 316..344 next to non-members at 314 and 346.
    - **fix:** In computeFrame, route every arrow that belongs to its target's band (bands.get(edge.target)?.arrows.includes(edge.id), target on the canvas) into the target's LEFT edge, looping around when the source is to the right or overlapping, so it gets a slot in pass 1. As a guard, draw the seal (and treat the shape as complete) only when every band arrow got a slot (ys.length === band.arrows.length); otherwise draw it open (dashed, no ✓). Cap pad at about half the arrival spacing. Add geometry tests for a band arrow from a card to the right and from a vertically stacked card.
  - [2]
    - **id:** F2
    - **severity:** major
    - **where:** packages/core/src/project/build.ts:925-945 (markEstablished) with :799-811; test packages/core/test/project/direct.test.ts:59
    - **problem:** When the walk falls back to the .ilean references (facts without valueConsts: a failed probe or older facts), B.2's cross-check can prove that direct(v) is incomplete (uses-unseen). Yet markEstablished still grants `established` using that incomplete direct(v). B.5's checks for TL114 and current facts over direct(v) then miss the card actually reached through a simp lemma or an instance, so the card glows green against B.5. Narrow trigger (fallback mode only), but it is a wrong green glow.
    - **evidence:** Probe scratchpad/v1d_corr/probe/unseen.probe.test.ts (core helpers): u's .holds states `Good t` (TL114), an un-owned `@[simp] good_l` uses u.holds, and v.holds is `by simp`. With valueConsts: 'v [] {"ids":["u"],"from":"proof"}' (not established, correct). Without: 'v ["uses-unseen","established"] {"ids":[],"from":"source","unseen":["a"]}'. direct.test.ts:59 encodes ['uses-unseen','established'] as expected.
    - **fix:** In markEstablished, skip drafts flagged 'uses-unseen' (the flag is added before markEstablished runs). The cross-check has shown direct(v) is incomplete, so B.5's conditions over direct(v) cannot be confirmed. Update direct.test.ts:59 to expect ['uses-unseen'] and add the TL114-behind-a-simp-lemma case.
  - [3]
    - **id:** F3
    - **severity:** minor
    - **where:** packages/core/src/project/edges.ts:116-124 (walkFrom: count(owner, name); continue)
    - **problem:** The walk marks itself `outdated` only for declarations it passes through. When it stops at another card's extra pinned name (or .holds), it never checks that declaration's file. A card's own `stale` flag covers only its statement and .holds files (build.ts:543), and pinned names can live in any file. So if v's proof goes through u's pinned lemma in a file changed since the check, v stays established (green, complete band) with out-of-date facts, against BD-6/BD-7 and v4.1 A.
    - **evidence:** Probe scratchpad/v1d_corr/probe/pinned.probe.test.ts: u has `lean: S.u, S.u_lemma` with u_lemma in Lemmas.lean; `theorem v.holds : v := u_lemma`. After editing Lemmas.lean (fresh files: Axioms, Main, Vocabulary only), the output is 'EDITED v ["established"] {"ids":["u"],"from":"proof"}'.
    - **fix:** In walkFrom, when counting a card at a declaration, also set `outdated = true` if `declFacts.get(name)?.file` is not fresh. Alternatively, include the files of a card's extra pinned names in its own stale check (build.ts:543). Add a direct.test.ts case.
  - [4]
    - **id:** F4
    - **severity:** minor
    - **where:** packages/runner/src/semantic/checkFile.ts:137-138; packages/runner/src/semantic/refresh.ts:445-486
    - **problem:** The check file now always imports Lean.CoreM and Lean.Util.FoldConsts. A model that declares a name also declared in their import closure (e.g. a subject namespaced `Lean`) now fails the imports, and every declaration loses its facts ('Lean: check failed', all cards not checked). Before 1d such a model was checked fine. The builder documented this as a known limit, but there is no fallback.
    - **evidence:** Section 8 of the plan and the report: 'a model that declares a name also declared by the modules Lean.CoreM imports would fail the check file's imports and get no facts'. parseCheckOutput turns any error on an import line into headerErrors.
    - **fix:** In refresh.ts, when the run reports header errors and the value-probe imports were added, re-run the check once without the probe (generateCheckFile(imports, names)). Keep those facts (no valueConsts, so the board falls back) and add a problem such as 'the value probe could not run: …'.
  - [5]
    - **id:** F5
    - **severity:** minor
    - **where:** Builder report / docs/slice1-plan.md section 8 'E2E tests not updated'; packages/webview/test/e2e/board.spec.ts:202, packages/webview/test/e2e/m2-overlay.spec.ts:94
    - **problem:** The list of e2e specs that 1d's chip change affects is incomplete. board.spec.ts:202 ('verified dependencies are drawn solid', spyroProvedGraph) expects a `.tl-chip` containing 'proved' on cynder-not-good, which now reads '✓ established' and fails. m2-overlay.spec.ts:94 looks for `[data-chip="proved-goal"]` (gone since 1a), which is now `[data-chip="established"]` once revealed.
    - **evidence:** grep: board.spec.ts:202 `card(page, 'cynder-not-good').locator('.tl-chip', { hasText: 'proved' })`; cardData now gives the established goal only {key:'established', label:'✓ established'}.
    - **fix:** Add both lines to the plan's 1d e2e list for 1g: expect `[data-chip="established"]` with '✓ established'.
  - [6]
    - **id:** F6
    - **severity:** nit
    - **where:** packages/webview/src/board/diagnostics.ts:34
    - **problem:** themeColors() still takes the first `.tl-card[data-formal="formalized"]` for `cardAura`. Since 1d an established card is also data-formal=formalized but glows green, so the 'rendered' diagnostic (asserted by the VS Code suite board.test.ts:143 and Playwright board.spec.ts:155) would report the green glow if an established card comes first in the DOM.
    - **evidence:** CSS now keys the blue aura on [data-glow='formalized'] and the green glow on [data-glow='established']; NodeCard sets both data-formal and data-glow.
    - **fix:** Query `.tl-card[data-glow="formalized"]` instead.
  - [7]
    - **id:** F7
    - **severity:** nit
    - **where:** packages/webview/src/board/EdgeEngine.ts:143-149 (markerVariant)
    - **problem:** While either end of a TL107 arrow is focused, it gets the plain 'focus' head and the focus stroke (.tl-edge--focus overrides .tl-edge--mismatch). So the new notched head, meant to make the warning not colour alone, disappears with the colour exactly when the user inspects the card.
    - **evidence:** markerVariant: `if (focused) return 'focus'; if (edge.mismatch) return 'mismatch';` and board.css:995/998 rule order.
    - **fix:** Add a 'mismatch-focus' marker variant (notched head in the focus colour), like 'conditional-focus', and return it for focused mismatch arrows.
  - [8]
    - **id:** F8
    - **severity:** nit
    - **where:** packages/runner/src/semantic/checkFile.ts:312-314 with refresh.ts:474-476
    - **problem:** When `lake env lean` fails with no JSON messages, parseCheckOutput has no header errors yet and records 'Lean printed nothing for the value probe'. refresh then adds the stderr header error, so the facts' detail shows both: a redundant second cause.
    - **evidence:** parseCheckOutput: `if (headerErrors.length === 0) valueProblems.push('Lean printed nothing for the value probe')`; refresh pushes the stderr fallback into output.headerErrors only after parsing.
    - **fix:** In refresh.ts, skip output.valueProblems when output.headerErrors is non-empty after the stderr fallback, or decide the 'printed nothing' problem there.
- **checks_run:**
  - capped.sh 1400 tsc --noEmit -p packages/core/tsconfig.test.json: exit 0
  - capped.sh 1400 tsc --noEmit -p packages/runner/tsconfig.test.json: exit 0
  - capped.sh 1400 tsc --noEmit -p packages/webview/tsconfig.json: exit 0
  - capped.sh 1400 tsc --noEmit -p packages/webview/tsconfig.node.json: exit 2, 6 errors, all in e2e specs (m1-edits.spec.ts x3, m2-layout.spec.ts x1, m2-review.spec.ts x2; GOAL/lifecycle, 1a baseline)
  - capped.sh 1400 tsc --noEmit -p packages/extension/tsconfig.json: exit 2, 9 errors, all in test/suite (e2e-runs x2, e2e x1, model x1, runs x5; baseline)
  - core: capped.sh 1800 vitest run --maxWorkers=1 -> 'Test Files  53 passed (53)', 'Tests  577 passed (577)'
  - webview: capped.sh 1800 vitest run --maxWorkers=1 -> 'Test Files  17 passed (17)', 'Tests  280 passed (280)'
  - extension: capped.sh 1800 vitest run --no-cache --maxWorkers=1 -> 'Test Files  22 passed (22)', 'Tests  197 passed (197)'; packages/extension/out unchanged
  - runner: capped.sh 1800 timeout 900 vitest run --maxWorkers=1 test/semantic/checkFile.test.ts -> 'Tests  10 passed (10)'
  - runner: test/semantic/valueProbe.test.ts (real Lean 4.35) -> '[value probe] status=ok; check ok 313 ms, peak 92 MiB', 'Tests  1 passed (1)'
  - runner: test/semantic/refresh.test.ts (real Lean) -> 'Test Files  1 passed (1)', 'Tests  9 passed (9)'
  - runner: test/semantic (whole folder) -> 'Test Files  7 passed (7)', 'Tests  52 passed (52)'
  - runner: test/integration/session.test.ts -> 'Test Files  1 passed (1)', 'Tests  8 passed (8)'
  - runner: test/integration/m2flow.test.ts + test/proposal/build.test.ts -> 'Test Files  2 passed (2)', 'Tests  12 passed (12)'
  - runner: test/run/walkthrough.e2e.test.ts + test/run/fresh.e2e.test.ts -> 'Test Files  2 passed (2)', 'Tests  31 passed (31)'
  - runner: test/gate -> 'Test Files  3 passed (3)', 'Tests  64 passed (64)'
  - md5sum ~/.elan/known-projects before/after runner tests: ba8069f646fd640d358f40a38513a416 (unchanged)
  - git log/stash/branch: unchanged (187673d, 98000b7, main); test-fixtures/semantic/recorded mtimes 2026-11-17 (untouched); packages/extension/dist mtimes 2026-11-17 (untouched)
  - probe node band_stacked.mts / band_right.mts / band_crowded.mts (reads geometry.ts): stacked or right-hand band arrow left out of the bracket while the seal is drawn; band [] when the only arrow arrives from the right
  - probe vitest (scratch config) pinned.probe.test.ts: 'EDITED v ["established"]' with the pinned lemma's file not fresh
  - probe vitest (scratch config) unseen.probe.test.ts: valueConsts=true v [] vs valueConsts=false v ["uses-unseen","established"]
