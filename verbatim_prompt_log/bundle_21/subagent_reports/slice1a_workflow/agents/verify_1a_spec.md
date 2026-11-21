# verify:1a:spec

Agent `aef401ce27ace6260` of workflow `wf_f847ea09-3b3`. Verbatim output (JSON alongside).

- **summary:** I checked the diff against brief 1a (items A–L), plan §2.1–2.4, 2.6 and 2.8, and spec v4 Terms, CF-2, CF-4, BD-6, BD-9 and B.4–B.6. I ran no builds or tests. The tree before autopilot was clean apart from package-lock.json, so `git diff HEAD` is exactly 1a plus the integrator's two TELELEAN_WEBVIEW_OUT files (serve.mjs and vite.config.ts, 23:44).

**What matches the brief and spec:**
- **Model:** NodeType, NODE_TYPES, isNodeType and parseNodeType (aliases, case-insensitive, TL019 hint kept), ProofStatus 'pending', the flag changes and fromNothing all match.
- **Markup:** follows_from parses with TL022, TL023 (the arrows win) and TL005. FIELD_ORDER puts it right after premises. G5 compares it raw.
- **Aliases are never rewritten.** setBlockFields replaces only the requested value span. The only `type:` writers are add-node, change-kind and ghost adoption, and all write AXIOM or PROPOSITION.
- **Layout:** old layouts are read leniently, positions are filtered, serialisation is stable, and nothing rewrites layout.json on load.
- **Statuses:**
  - an axiom `.holds` is assumed on an AXIOM and pending on a PROPOSITION;
  - TL105, TL116 and TL102's goal variant are gone; TL106 reads "This axiom has a proof.";
  - `established` is conservative: proved, no sorry or `axiom:` entry, every footprint card an assumed AXIOM, and none of v, its footprint or the transitive direct(v) is stale, not-checked or TL114. It never claims more than Lean checked.
- **Planners:**
  - P→A removes `premises:` and `follows_from:` in the same plan, writes `type: AXIOM`, and labels the archive entry "Proposition -> Axiom".
  - A→P is refused with `invalid` and the plan's exact text. Re-ordering a card into the other column is refused too.
- **Gate:** the lifecycle is removed end to end. allowedHolds and readiness now apply to AXIOM. Claude still cannot add a pending claim for a proposition (new-axiom), and cannot change type, premises or follows_from (G5).
- **Protocol and runner:** the protocol accepts only the new names. The runner preflight refuses a non-PROPOSITION target with the brief's exact text.
- **Prompts:** the system prompt and its doc and fixture copies are in sync.
- **Webview:** two columns, "Make Axiom" only, the refused drop zone and toast, the new chips, the tray rule, and --tl-kind-a, --tl-kind-p and --tl-proved.
- **Colours:** the extension's colour ids and values match item J.
- **Tests:** the brief's required new tests are present. Every deleted test I found by diffing test names is listed in the report, except one merged confirmedDependents test, which is harmless.

**Problems found:**
1. A two-column leftover in webview src (diagnostics.ts) breaks the "rendered" self-check and the smoke test's `styled` assertion.
2. Runs saved by the old build before this change, if still in review, are restored unchanged and can crash the webview's proposed-view overlay.
3. Deleting the change-to-Goal tests removed the only unit test of the facts-stale refusal that P→A's "rewrite" still uses.
4. The demo tooling inside packages/ is broken, although the report calls it outside the write set.
5. Leftover wording and CSS (nits).
- **findings:**
  - [1]
    - **id:** F1
    - **severity:** major
    - **where:** packages/webview/src/board/diagnostics.ts:58 (also :32-44 themeColors; packages/webview/src/main.tsx:55)
    - **problem:** The board now renders two `.tl-col__list` elements, but `stylesApplied()` still requires `lists.length === 3`. The 'rendered' diagnostic therefore always reports `styled: false`, so the stylesheet/CSP self-check detects nothing in either direction. The VS Code smoke assertion `assert.equal(done.payload.data?.styled, true)` (extension/test/suite/board.test.ts:58) will fail because of src code, which the report does not mention: it lists board.test.ts only for colour ids. `themeColors()` also resolves the removed `--tl-kind-d`/`--tl-kind-g`, which fall back to the inherited foreground colour, and never reports `--tl-kind-p` or the new `--tl-proved`. This is a regression of existing behaviour caused by 1a's two-column change.
    - **fix:** In `stylesApplied()` use `lists.length === NODE_TYPES.length`. Make `themeColors()` return `kindA` (var(--tl-kind-a)), `kindP` (var(--tl-kind-p)) and `proved` (var(--tl-proved)) instead of kindD/kindG, and update the message in main.tsx:55. Add the matching expectations (webview e2e board.spec.ts:77 and 149-151; extension suite board.test.ts:58 and 110-118) to the integrator's e2e update list.
    - **evidence:** Board.tsx:162 renders one Column per NODE_TYPES entry (2), and each renders one `.tl-col__list` (Column.tsx:101). diagnostics.ts:43-44 reads `resolveColor('var(--tl-kind-d)')` and `resolveColor('var(--tl-kind-g)')`, but board.css now defines only --tl-kind-a, --tl-kind-p and --tl-proved.
  - [2]
    - **id:** F2
    - **severity:** minor
    - **where:** packages/runner/src/run/manager.ts:1758-1795 (recover) -> packages/webview/src/model/run.ts:595 -> packages/core/src/graph.ts:90
    - **problem:** Old saved run state does not load cleanly. A run saved by the pre-v4 build that is still in `review` is restored with its ProposalView unchanged: the graph's node types are ASSUMPTION/DERIVATION/GOAL and the `lifecycle` array is still there. The webview builds the proposed-view overlay as soon as the proposal arrives (store.ts overlayFor -> buildOverlay -> core `columnOrder`). `columnOrder` does `order[node.type].push(...)`, and `order['GOAL']` is undefined, so it throws a TypeError. No host-to-webview validator checks kinds (protocol.ts:687ff). This only happens to a user who upgrades while a run is in review.
    - **fix:** In `RunManagerImpl.recover()`, before `makeRun`, either map each `p.proposal.graph.nodes[].type` through `parseNodeType(...)?.type` and delete `p.proposal.lifecycle`, or end such a run with a plain notice ("made by an older telelean: run it again"). Optionally also make `columnOrder` skip unknown kinds defensively.
    - **evidence:** recover() handles only the starting, working, gate and interrupted states; a `review` run keeps `p.proposal` exactly as read from run.json. graph.ts:89-90 builds `order` from NODE_TYPES only.
  - [3]
    - **id:** F3
    - **severity:** minor
    - **where:** packages/core/src/edit/planKind.ts:131 and :194; packages/core/test/edit/kindChange.test.ts and conditional.test.ts
    - **problem:** The deleted A->G/D->G tests ("rewrite refuses with facts-stale unless every touched file is fresh" and "without fresh facts, uses found in the text still count as dependents") were the only unit tests of `requireFresh` and of the `complete` check (users found in the text but not in the facts). That behaviour survives in 1a: P->A of a conditional proof with `dependents: 'rewrite'` calls `requireFresh(users.all, users.all.length === users.fromFacts.length)`. No remaining core test uses a stale or unchecked model for P->A, so this refusal now has no coverage. The brief asks to keep each test's intent where the behaviour survives.
    - **fix:** Port both tests to P->A of the conditional proposition d1 in conditional.test.ts. On a model whose Main.lean changed since the check (factsFrom), with dependents 'rewrite' and confirmedDependents, expect code 'facts-stale'; 'mark-broken' should still plan only holds-theorem-to-axiom. Without facts, expect needs-confirmation to still list the text-found users.
    - **evidence:** `grep -rn facts-stale packages/*/test` finds nothing now. At HEAD, kindChange.test.ts:174 and :197-203 held the only facts-stale assertions, both with `to: 'GOAL'`.
  - [4]
    - **id:** F4
    - **severity:** minor
    - **where:** packages/extension/test/demo/demoClaude.ts:566; packages/extension/scripts/demo-driver.mjs:522-523; packages/extension/scripts/demo-ui.mjs:56
    - **problem:** 1a breaks `npm run demo`. The demo's fake Claude decides whether to write `axiom n.holds` with `card.type === 'ASSUMPTION'`, but the runner's context bundle now prints the node kind `(AXIOM)` (prompts.ts:121), so selected axioms get no `.holds` and the gate refuses them (missing-holds). demo-driver.mjs sends addCard('ASSUMPTION') and addCard('GOAL'), which the protocol now refuses ("must be AXIOM or PROPOSITION"). These files are under packages/, which is the builder's write set, and they are not the e2e suites the brief excluded. Yet the report and plan §8 call them "outside 1a's write set, or e2e".
    - **fix:** Accept 'AXIOM' (and 'ASSUMPTION') in demoClaude.ts:566, switch demo-driver.mjs and demo-ui.mjs to AXIOM/PROPOSITION and Axiom/Proposition, and drop the `lifecycle` read at demo-driver.mjs:338. Alternatively, assign them explicitly to a later sub-slice and correct the §8 wording.
    - **evidence:** prompts.ts:121 writes `- ${node.id} (${node.type}): …`. demoClaude.ts:48 `CARD_LINE` captures that kind, and :566 passes `card.type === 'ASSUMPTION'` as the `assumption` argument that adds the `.holds` line (:378).
  - [5]
    - **id:** F5
    - **severity:** nit
    - **where:** packages/webview/src/styles/board.css:1395, :141, :1128; CardDetails.tsx:193, :204; run/ReportCard.tsx:81, :92; run/GhostSuggestion.tsx:110; runner run/manager.ts:1606
    - **problem:** Leftovers:
- an unused `.tl-lifecycle` CSS rule;
- "three columns" comments in board.css;
- user-facing texts that still use the old nouns: "No assumptions at all.", "neither one of your assumptions nor vocabulary", "Claude then proves the goal with it" and "Claude now proves the goal with it".
    - **fix:** Remove the CSS rule, update the comments, and reword the texts to axioms and the target/proposition (e.g. "Rests on no axioms.", "neither one of your axiom cards nor vocabulary", "proves the target with it").
    - **evidence:** `grep -rn -i 'assumption|goal' packages/webview/src` and the board.css grep for 'lifecycle'.
- **checks_run:**
  - cat verify_common.md, briefs/1a.md, builder_rules.md: read the role, the brief and the rules
  - Read docs/slice1-plan.md (all, including the §8 change log) and spec v4 lines 60-255 and 1003-1126 (Terms, CF-2/CF-4, BD-6/BD-9, AR-5..AR-8, A13/A19/A26, B.1-B.7)
  - cat evidence/patches/git_status_before_autopilot.txt: tree clean except package-lock.json, so git diff HEAD = 1a plus 2 integrator files
  - git diff HEAD --stat -- . ':!package-lock.json': 142 files, 1881 insertions and 2183 deletions
  - git diff HEAD on core model/markup/layout/project/kindChange/edit/gate/protocol/run/export/schema/proposal/samples, the runner src, the extension src and package.json, and the webview labels/cardData/CardDetails/NodeCard/store/model-run/Column/Dialogs/PromptBox/Tray/EdgeEngine/geometry/Board/run panel/css
  - sed/grep on parser.ts, edits.ts setBlockFields, session.ts setField, rules.ts G5 markupFindings and new-axiom, build.ts footprint/flags/markEstablished, planKind.ts requireFresh/holdsArguments, dependents.ts usersOf, manager.ts recover, persist.ts, protocol.ts parseHostToWebview, graph.ts columnOrder
  - grep for leftover ASSUMPTION/DERIVATION/GOAL, lifecycle, kind-d/kind-g, 'length === 3' and 'three col' across packages/*/src: found diagnostics.ts:43-44 and :58, the board.css .tl-lifecycle rule and comments, and the demo files
  - python3 -I scratchpad/v1a/names.py: diffed test names between HEAD and the working tree for all changed test files and reconciled the 223 lines of output against the report's deleted/rewritten lists (all deletions listed except one merged confirmedDependents test)
  - grep -rn facts-stale packages/*/test: no hits (the coverage gap in F3)
  - Read new tests: core markup/kinds.test.ts, status.test.ts (established block), kindChange.test.ts, contracts layout tests, rules.test G5 additions, scenarios.ts change-kind, webview store A->P refusal, runner walkthrough and session diffs
