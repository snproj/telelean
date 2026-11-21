# verify:1a:code

Agent `ada44a4fe2fd749dc` of workflow `wf_f847ea09-3b3`. Verbatim output (JSON alongside).

- **summary:** I reproduced every verification claim in the builder's report:
- tsc is clean except in the e2e files the report lists: 6 errors in webview `tsconfig.node.json`, 9 in extension test/suite.
- vitest: core 49 files and 513 tests, webview 8 and 130, extension 21 and 180.
- Runner: every touched file I ran passes, including walkthrough.e2e with 22 tests (its "(a) normative" case is renamed and now passes) and fresh.e2e with 9.
- Not run: the real-Lean test bodies stay skipped on this machine because they need 12 GB of free RAM.

The core of 1a is sound:
- the two kinds and their aliases;
- `follows_from` with TL022 and TL023, and G5 comparing it;
- statuses (`pending`, `rests-on-pending`, `established`);
- lenient layout parsing and positions;
- P→A dropping `premises:` and `follows_from:`, and A→P refused;
- the lifecycle removed end to end, and the protocol and the runner's preflight.

The grep for removed names across packages/*/src finds no live use. The comments and the dead `.tl-lifecycle` CSS rule are harmless.

Two problems are major. Both are regressions that test updates in 1c–1e cannot fix:
1. The webview's "rendered" self-check still assumes three columns and the old colour variables. It now always reports `styled: false`, which breaks the VS Code smoke test's main assertion.
2. Runs saved in run.json before this change are restored with their old-format proposal, which makes the webview throw. A run left in review across the upgrade gets stuck with no Accept, Discard or Cancel. A live run of the installed pre-v4 extension exists on this machine, so this can happen.

Minor findings:
- no test covers the `direct(v)` part of `established`;
- the A→P impact counts axiom cards among the cards that "lose their green glow";
- the §5 prompt texts in m2-plan.md drifted from the code;
- the brief and spec B.5 disagree on keeping a TL102 "rests on pending" warning;
- adding premises to a card marked `follows_from: nothing` (hand-written only, in 1a) gives TL023.
- the demo agent's kind check now fails silently (nit), plus small leftovers (nit).

Effects of my runs outside the repo:
- about 14 new /tmp/telelean-ws-tests-* folders (runner test scratch, never removed);
- npm debug logs in ~/.npm/_logs;
- transient systemd scopes from capped.sh, all ended.

Nothing was written to packages/extension/out or dist (checked with `find -newer`), and git state is unchanged.
- **checks_run:**
  - git diff HEAD -- packages docs (142 files, +1881/-2183) saved to scratchpad/v1a_corr/full.diff; untracked: docs/slice1-plan.md, packages/core/test/markup/kinds.test.ts
  - grep packages/*/src for removed names (ASSUMPTION/DERIVATION/GOAL literals, pending-promotion, rests-on-claimed, proved-goal, 'claimed', lifecycle, LifecycleItem, lifecycleChanges, kindAssumption/Derivation/Goal, PROVED_GOAL_REASON, PROPOSAL_FACTS_FILE, TL105, TL116): only alias tables (model.ts, layout.ts) and comments remain, plus a dead .tl-lifecycle CSS rule
  - grep for hard-coded three columns or old CSS variables: packages/webview/src/board/diagnostics.ts:43-44 (var(--tl-kind-d), var(--tl-kind-g)) and :58 (lists.length === 3)
  - core: capped.sh 1600 npx tsc --noEmit -p tsconfig.test.json -> exit 0, no output
  - runner: capped.sh 1600 npx tsc --noEmit -p tsconfig.test.json -> exit 0, no output
  - webview: capped.sh 1600 npx tsc --noEmit -p tsconfig.json -> exit 0, no output
  - webview: capped.sh 1600 npx tsc --noEmit -p tsconfig.node.json -> exit 2, 6 errors, all e2e: m1-edits.spec.ts(222,252,259), m2-layout.spec.ts(277), m2-review.spec.ts(234 x2), as the builder reported
  - extension: capped.sh 1400 npx tsc --noEmit -p tsconfig.json -> exit 2, 9 errors, all test/suite: e2e-runs(372 x2), e2e(243), model(106), runs(271 x2, 293 x3), as the builder reported
  - core: capped.sh 1600 npx vitest run --maxWorkers=1 -> 'Test Files  49 passed (49)', 'Tests  513 passed (513)'
  - webview: capped.sh 1600 npx vitest run --maxWorkers=1 -> 'Test Files  8 passed (8)', 'Tests  130 passed (130)'
  - extension: capped.sh 1700 npx vitest run --maxWorkers=1 --no-cache -> 'Test Files  21 passed (21)', 'Tests  180 passed (180)'; find out dist -newer marker -> nothing
  - runner A: capped.sh 1800 timeout 900 npx vitest run --maxWorkers=1 run/prompts, manager.accept, manager.rounds, manager.start, manager.lifecycle, manager.happy -> 'Test Files  6 passed (6)', 'Tests  49 passed (49)'
  - runner B: gate/engine, gate/rules, gate/pure, run/walkthroughScript, manager.gate, manager.caps -> 'Test Files  6 passed (6)', 'Tests  81 passed (81)'
  - runner C: proposal/accept, apply, boardEdits, sidecars, build -> 'Test Files  5 passed (5)', 'Tests  35 passed | 7 skipped (42)' (build.test real-Lean bodies skip: the 12 GB RAM gate)
  - runner D: workspace/perform, realcore, undo, historySafety, sample, refresh -> 'Test Files  6 passed (6)', 'Tests  46 passed | 2 skipped (48)'
  - runner D3: workspace/initialize, scan, history, m2members -> 'Test Files  4 passed (4)', 'Tests  44 passed | 1 skipped (45)'
  - runner E: integration/m2flow, lean/userns -> 'Test Files  2 passed (2)', 'Tests  11 passed (11)'
  - runner F1: run/fresh.e2e -> 'Test Files  1 passed (1)', 'Tests  9 passed (9)' (117.7 s)
  - runner F2: run/walkthrough.e2e -> 'Test Files  1 passed (1)', 'Tests  22 passed (22)' (205 s; the renamed '(a) normative' case passes)
  - Not run: the real-Lean bodies of integration/session, fixes and escapes (RAM-gated at 12 GB, as for the builder); I only read them
  - After my runs: git status --porcelain still 155 entries; no leftover vitest or lean processes of mine; /tmp/telelean-ws-tests-* went from 23 to 37 (about 14 from my runs, the rest possibly from concurrent agents)
- **findings:**
  - [1]
    - **id:** 1a-corr-1
    - **severity:** major
    - **where:** packages/webview/src/board/diagnostics.ts:32-60 (also packages/webview/src/main.tsx:55)
    - **problem:** A call site of the three-to-two-column change was missed. `stylesApplied()` still requires `lists.length === 3`, but the board now renders one `.tl-col__list` per NODE_TYPES entry, so it always returns false. `themeColors()` still reads `var(--tl-kind-d)` and `var(--tl-kind-g)`, which board.css no longer defines (they compute to the inherited text colour), and it never reports `--tl-kind-p` or `--tl-proved`. So the webview's 'rendered' diagnostic now always says `styled: false` and gives wrong kind colours. The VS Code smoke test asserts `styled === true`, and so does the Playwright board test. No test update in 1c–1e can make them pass; only the source can.
    - **evidence:** diagnostics.ts:56-58 `lists.length === 3 && …`; diagnostics.ts:43-44 `kindD: resolveColor('var(--tl-kind-d)'), kindG: resolveColor('var(--tl-kind-g)')`; board.css:17-19 defines only --tl-kind-a, --tl-kind-p and --tl-proved; Column.tsx:101 has one `.tl-col__list` per column, and Board renders NODE_TYPES (2) columns; extension/test/suite/board.test.ts:58 `assert.equal(done.payload.data?.styled, true, …)`; webview/test/e2e/board.spec.ts:77 expects `styled: true`. The builder's report does not mention diagnostics.ts.
    - **fix:** In `stylesApplied()`, test `lists.length === NODE_TYPES.length` (import NODE_TYPES from @telelean/core). In `themeColors()`, return kindA (`--tl-kind-a`), kindP (`--tl-kind-p`) and proved (`--tl-proved`) instead of kindD and kindG. Update the main.tsx message (`kinds ${kindA} ${kindP}`, `proved …`). Then 1c–1e update board.spec.ts:149-151 and the extension's board.test.ts:110-118 to the new fields.
  - [2]
    - **id:** 1a-corr-2
    - **severity:** major
    - **where:** packages/runner/src/run/manager.ts:1758-1810 (recover) + packages/webview/src/model/run.ts:595 / packages/core/src/graph.ts:88 (columnOrder)
    - **problem:** Runs saved before this change break after the upgrade. `PersistedRun.proposal` (a ProposalView with graph nodes typed GOAL, ASSUMPTION or DERIVATION, `proof.kind: 'pending-promotion'` and `lifecycle`) is kept in run.json. `recover()` restores the newest non-terminal run as it is, so a run in `review` keeps its old proposal and posts it. In the webview, `applyProposal` → `overlayFor` → `buildOverlay` → `columnOrder([...proposal.graph.nodes, …])` runs `order[node.type].push`, and `order['GOAL']` is undefined, so it throws a TypeError. `parseHostToWebview` does not check node types, and `store.receive` has no try/catch. The proposal is therefore never set. The run panel shows 'Preparing the proposal…' forever (RunPanel.tsx:405), with no Cancel in review (`cancellable` excludes review) and no Accept or Discard (ProposalBanner and Review need the proposal). The tray stays disabled while that run is active, and with 1f's read-only Current the whole board would stay locked.
    - **evidence:** runner/src/run/types.ts:302 `proposal?: ProposalView` is persisted; manager.ts recover() only changes starting, working and gate states; core graph.ts:88 `for (const node of nodes) order[node.type].push(node.id);` where `order` has only AXIOM and PROPOSITION keys. The case is realistic: the installed pre-v4 extension has a live run on this machine right now (a `claude -p` process with its system prompt under …/globalStorage/telelean.telelean/runs/…; I did not start it). If that run is still in review when the new build is installed, it hits this path.
    - **fix:** In recover() (or in scanRuns/readPersistedRun), detect a proposal saved before spec v4: any graph node type outside AXIOM/PROPOSITION, a `lifecycle` key, or 'pending-promotion'. Then either normalise it (type via parseNodeType; 'pending-promotion' → 'pending'; flag 'rests-on-claimed' → 'rests-on-pending'; drop 'claimed', 'proved-goal' and lifecycle) or drop the proposal and end the run with a plain notice ('telelean was updated; discard this run and start again'). Also make core `columnOrder` (and therefore buildOverlay) skip or normalise unknown types, so one bad host message cannot throw. Add a runner unit test that recovers such a run.json.
  - [3]
    - **id:** 1a-corr-3
    - **severity:** minor
    - **where:** packages/core/src/project/build.ts:877-898 (markEstablished) and packages/core/test/project/status.test.ts:335-358
    - **problem:** No test covers the direct(v) part of `established` (S-3 and S-9 for the cards the proof reaches through verified edges). Every unestablished case in the tests is already decided by the footprint check, which runs before the walk. In the 'otherStale' case, the axiom `a` (in v's footprint) lives in the same changed Lemmas.lean as `l`, so `a` is already stale. Deleting the BFS at build.ts:886-896 would leave every test green.
    - **evidence:** markEstablished: `if (rests.some((d) => … || unsure(d))) continue;` comes before the `direct` walk. In status.test.ts, `lemmas` holds both blocks a and l, and `otherStale` changes Lemmas.lean, so `a` gets 'stale' (build.ts:541).
    - **fix:** Add two cases: (1) `a` in fresh Main.lean, `l` (a theorem from a) in a changed Lemmas.lean, `v` in Main.lean proved from l.holds → v is proved but not established; (2) `l.holds` stating a different type (TL114) while v's footprint {a} is fresh → v is not established.
  - [4]
    - **id:** 1a-corr-4
    - **severity:** minor
    - **where:** packages/core/src/kindChange.ts (A->P branch, `resting`) and packages/core/test/edit/kindChange.test.ts:146-153
    - **problem:** The A→P impact says that 'N cards that rest on it will lose their green glow until it is proved', with N = proofDependents. That count includes axiom cards whose `.holds` is a theorem (BD-6: axioms never glow green) and propositions that are not established anyway (stale, conditional, resting on pending, hidden axiom). The new test enshrines the overcount: dependents ['at','dt','gt'] → '3 cards …', but 'at' is an AXIOM (TL106) that can never glow. The text is not reachable in 1a (A→P is refused first), but 1b's AR-6 gesture will show it.
    - **evidence:** kindChange.ts `const resting = dependents.length > 0 ? ` ${plural(dependents.length, 'card')} that … will lose … green glow …` : ''`; the test BODY has `at` as `type: 'ASSUMPTION'` with `theorem at.holds : at := a1.holds`.
    - **fix:** Count only dependents that currently carry 'established' (or are PROPOSITIONs) for the glow sentence, e.g. 'N established cards that rest on it will lose their green glow until it is proved', and correct the test expectation (2 for this model).
  - [5]
    - **id:** 1a-corr-5
    - **severity:** minor
    - **where:** docs/m2-plan.md:426, 431, 452 (also 267, 268, 275)
    - **problem:** Section 5 of m2-plan documents exactly what leaves the machine. Only §5.1 (the system prompt, enforced by a test) was synced. The context bundle template still shows 'Promotion pending: its .holds is still an axiom.' and 'promotion pending', and the adoption turn still reads 'The person adopted your suggestion as an assumption:\n- <nodeId> (ASSUMPTION, worded by you)'. runner/src/run/prompts.ts now sends 'Pending proof: …', 'pending proof' and 'as an axiom … (AXIOM, worded by you)'. The gate table rows still say 'selected ASSUMPTION'.
    - **evidence:** prompts.ts:93-110 and 263; m2-plan.md:426, 431 and 452 as quoted.
    - **fix:** Update those lines with the same dated note as §5.1 ('Updated 2026-11-19 for spec v4, slice 1a') so the documented texts match what is sent.
  - [6]
    - **id:** 1a-corr-6
    - **severity:** minor
    - **where:** packages/core/src/project/build.ts:640-665 (flags that depend on other nodes)
    - **problem:** Spec B.5 says 'TL102's "rests on a goal asserted as an axiom" becomes "rests on pending"'. 1a removed that TL102 variant completely, as the brief (D) instructed, so a proof resting on a pending proposition now produces no diagnostic, only the 'rests-on-pending' card flag. Before, a GOAL asserted as an axiom in a footprint produced a TL102 warning in Problems. The brief and the spec disagree, and the integrator should settle which is meant.
    - **evidence:** The diff removes `const goals = footprintNodes.filter((d) => d.type === 'GOAL') … TL102 'The proof rests on a goal asserted as an axiom'`. Nothing replaces it except `draft.flags.add('rests-on-pending')`.
    - **fix:** Either emit `TL102` (warning) 'The proof rests on pending: ‹ids›.' for footprint nodes with proof 'pending', next to the flag, or record in plan §8 that the flag replaces the diagnostic on purpose.
  - [7]
    - **id:** 1a-corr-7
    - **severity:** minor
    - **where:** packages/core/src/edit/planAction.ts (planSetPremises) and packages/core/src/gate/adoption.ts (premises append); packages/core/src/markup/parser.ts:179-189
    - **problem:** 1a makes `premises:` together with `follows_from: nothing` an error (TL023: the mark is ignored). Two paths still append premises without removing an existing `follows_from:` line: the run's set-premises declaration and ghost adoption. On a marked target they leave the user's file with a TL023 error. G5 now compares `follows_from` raw, so adoption cannot remove the line without an exemption either. In 1a this is reachable only with a hand-written mark, since the UI comes in 1b. AR-5 says drawing an arrow, and accepting a premise, removes the mark.
    - **evidence:** parser.ts:179 TL023 when `followsFrom` and premises are both present; adoption.ts appends the ghost id to the target's `premises:` only; rules.ts:60 COMPARED_FIELDS now includes 'follows_from', and the adoptedPremises exemption covers premises only.
    - **fix:** For 1b/1e: whenever a plan adds premises to a block that has a `follows_from:` line, remove that line in the same plan (set-premises, adoption, and 1b's add-arrows), and extend G5's adoptedPremises exemption to accept the removed mark on the adopted target.
  - [8]
    - **id:** 1a-corr-8
    - **severity:** nit
    - **where:** packages/extension/test/demo/demoClaude.ts:566
    - **problem:** `card.type === 'ASSUMPTION'` compares a `string` field (line 33), so tsc cannot flag it. The context bundle now says `(AXIOM)`, so the dry-run demo agent silently stops writing `axiom .holds` for selected axioms, and the gate would refuse its rounds. The report lists this file as needing updates; the point is that it fails at run time without any compile error.
    - **evidence:** demoClaude.ts:33 `type: string;`, :60 parses `(TYPE)` from the bundle; prompts.ts writes `(${node.type})` = AXIOM.
    - **fix:** Compare against 'AXIOM' (and also accept 'ASSUMPTION'), together with the demo-driver.mjs and demo-ui.mjs updates the report lists.
  - [9]
    - **id:** 1a-corr-9
    - **severity:** nit
    - **where:** webview/src/styles/board.css:1395; webview/src/dialogs/Dialogs.tsx:72; webview/src/board/EdgeEngine.ts:222-260; webview/src/model/cardData.ts:197; extension/package.json kindProposition description; webview/src/state/store.ts performKindChange; core/src/layout.ts moveInLayout
    - **problem:** Small leftovers:
- the `.tl-lifecycle` rule is dead CSS;
- `dependentsTexts(to)` keeps an unused parameter (`void to`);
- EdgeEngine still measures `[data-edge-obstacle]` blocks that nothing reads any more;
- the user-facing 'pending proof' chip title contains '(spec v4: pending proof)';
- the kindProposition colour description reads 'of the Propositions on the telelean board' (a noun is missing);
- the optimistic P→A keeps `premises` and `fromNothing` on the now-AXIOM card, so arrows into an axiom and the hint-d13 chip flash until the host's graph arrives;
- P→A keeps the card's canvas `positions` entry, so 1b's A→P would put it back at a stale place instead of next to its new source (AR-6).
    - **evidence:** As cited per file.
    - **fix:** Delete the dead rule, parameter and measuring. Drop '(spec v4: …)' from the chip title. Fix the colour description. Clear `premises` and `fromNothing` in the optimistic P→A node. In 1b/1c, drop the position when a card leaves the canvas (P→A).
