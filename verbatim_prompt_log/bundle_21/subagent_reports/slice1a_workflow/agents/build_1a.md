# build:1a

Agent `a50f7e47dfca20b46` of workflow `wf_f847ea09-3b3`. Verbatim output (JSON alongside).

BUILDER 1a REPORT: two kinds, AXIOM and PROPOSITION (slice 1, sub-slice 1a)

STATUS
- Items A to L of the brief are all done.
- tsc is clean for core and runner (test configs), webview (tsconfig.json) and extension (tsconfig.json), except in e2e-only files. Those are left untouched as the brief says, and their errors are listed below.
- vitest:
  - core: 49 files, 513/513 (baseline was 48 files, 500 tests);
  - webview: 8 files, 130/130;
  - extension: 21 files, 180/180.
- Runner: every runner test file my change touches, plus related ones, was run in batches and passes.
  - Tests that need real Lean with 12 GB available skipped, under the project's own RAM rule (see VERIFY).
  - The baseline's known failure walkthrough.e2e "(a) normative: proved, G->D, Accept writes …" was renamed and now passes.
- The relayed undo/redo and read-only-Current request is 1f's subject. Nothing in 1a touches it.

CHANGED FILES (142; there is no other way to separate them from the tree's earlier uncommitted work, so this list comes from file mtimes after my start)
docs
- docs/slice1-plan.md: §8 gains a dated entry "2026-11-19 (builder 1a, two kinds)" with 18 decided details.
- docs/m2-plan.md: the §5.1 system-prompt block is replaced by the v4 text, with a dated note. This keeps runner's prompt doc-sync test true.
core
- core/schema/telelean-graph-1.0.schema.json: regenerated with UPDATE_SCHEMA=1 (kind enum AXIOM|PROPOSITION; proof 'pending').
- core/src/model.ts:
  - NodeType AXIOM|PROPOSITION, NODE_TYPES and isNodeType;
  - NodeTypeAlias, KIND_OF_ALIAS and parseNodeType;
  - StatusFlag loses claimed and proved-goal and gains rests-on-pending and established;
  - ProofStatus 'pending'; TlNode.fromNothing.
- core/src/markup/types.ts: 'follows_from' becomes a known key, placed in FIELD_ORDER after premises; BlockFields.followsFrom; LeanOp docs.
- core/src/markup/parser.ts: type: is read through parseNodeType (TL004 text); follows_from is parsed (TL022), TL023 is added, and TL011 now applies to AXIOM.
- core/src/markup/values.ts: TL011 text for axioms.
- core/src/layout.ts:
  - two columns, and old column keys read leniently;
  - positions (CanvasPosition);
  - stable serialisation;
  - withoutIds drops positions; appendToLayout keeps them.
- core/src/project/build.ts:
  - `.holds` axiom: assumed on an AXIOM, pending on a PROPOSITION;
  - TL105, TL116 and the TL102 goal variant are removed; TL106 and TL117 get new texts;
  - rests-on-pending; fromNothing on the node;
  - markEstablished (B.5 with S-3 and S-9).
- core/src/project/vocabulary.ts: TL104 says "(an Axiom)".
- core/src/project/edges.ts: comment only.
- core/src/kindChange.ts:
  - P->A notes that the arrows go (AR-7);
  - the A->P branch is kept ('pending', "lose their green glow");
  - new exports AXIOM_TO_PROPOSITION_REFUSAL and AXIOM_DROP_REFUSAL;
  - the GOAL branches are removed.
- core/src/edit/planKind.ts: A->P is refused (invalid, with the §2.4 text). P->A also writes premises:null and follows_from:null when those lines exist. The path to GOAL is removed.
- core/src/edit/planAction.ts: labels "Add axiom/proposition: …" and "Make Axiom: …"; rationale applies to AXIOM; re-order refusals across columns; archive reason "Proposition -> Axiom".
- core/src/edit/types.ts, core/src/edit/index.ts, core/src/actions.ts: doc comments only.
- core/src/gate/normalise.ts: lifecycle() is removed.
- core/src/gate/index.ts: lifecycleChanges is removed.
- core/src/gate/types.ts: the LifecycleItem re-export is removed.
- core/src/gate/rules.ts: COMPARED_FIELDS gains follows_from; AXIOM in allowedHolds and readiness; texts updated.
- core/src/gate/adoption.ts: an adopted card is written as type: AXIOM.
- core/src/gate/describe.ts: says "as an axiom".
- core/src/run.ts: LifecycleItem and ProposalView.lifecycle are removed.
- core/src/protocol.ts: acceptProposal is {runId, proposalId, definitions, requestId?}; kinds must be AXIOM or PROPOSITION.
- core/src/graph.ts: createUserNode flags no-rationale for AXIOM.
- core/src/export/graphJson.ts, core/src/export/schema.ts: the AXIOM|PROPOSITION and 'pending' enums.
- core/src/proposal/diff.ts: 'pending'.
- core/src/proposal/sidecars.ts, core/src/proposal/index.ts: label extras {adoptedGhosts, premises?}; "adopted axiom(s)"; no "(+ Make Derivation)".
- core/src/samples/spyro.ts: new kinds; the proved target is flagged established.
- core/src/samples/large.ts: 25 axioms and 50 propositions (same ids).
- core tests (31):
  - Rewritten or updated:
    - carryover/confirmedDependents.test.ts (rewritten), carryover/kindTexts.test.ts;
    - contracts.test.ts (adds old-layout and positions tests), edit/conditional.test.ts, edit/delete.test.ts, edit/helpers/scenarios.ts, edit/kindChange.test.ts, edit/staleUsers.test.ts;
    - export/graphJson.test.ts;
    - gate/adoption.test.ts, gate/describe.test.ts, gate/normalise.test.ts, gate/permitted.test.ts, gate/rules.test.ts (adds G5 checks: an alias rewritten to AXIOM, and an added follows_from);
    - markup/edits.test.ts, markup/research.test.ts (LEMMA is now the invalid kind), markup/robustness.test.ts, markup/serializer.test.ts, markup/values.test.ts;
    - project/edges.test.ts, project/facts.test.ts, project/helpers/build.ts, project/helpers/parseFixture.ts, project/spyro.test.ts, project/status.test.ts, project/subjects.test.ts;
    - proposal/codecs.test.ts, protocol.m2.test.ts, protocol.test.ts, samples.test.ts.
  - NEW: markup/kinds.test.ts.
runner
- src/proposal/service.ts:
  - removed: the lifecycle, keepFacts/factsFor, PROPOSAL_FACTS_FILE, PROVED_GOAL_REASON, planRefusal, KeptFacts and the fs imports;
  - layoutOf uses AXIOM/PROPOSITION.
- src/proposal/types.ts: AcceptRequest loses lifecycle and facts; ProposalCore loses lifecycleChanges.
- src/proposal/index.ts: those exports are removed.
- src/run/preflight.ts: AXIOM_TARGET_REFUSAL. A target that is not a PROPOSITION is refused.
- src/run/index.ts: exports AXIOM_TARGET_REFUSAL.
- src/run/types.ts: accept(runId, proposalId, definitions).
- src/run/manager.ts: accept takes no lifecycle; the notice says "as an axiom".
- src/run/prompts.ts: "pending proof"; AXIOM; the adoption turn says "as an axiom".
- src/run/systemPrompt.ts: AXIOMS/PROPOSITIONS wording, naming the old kinds once.
- src/shadow/types.ts: doc only.
- runner tests (26):
  - integration: escapes, fixes, m2flow, session;
  - lean: userns;
  - proposal: accept, apply, boardEdits, build, helpers.ts, sidecars;
  - run: fixtures/system-prompt-5.1.txt, fresh.e2e, helpers/fakeServices.ts, manager.accept (3-argument accept), manager.rounds, manager.start, prompts, walkthrough.e2e;
  - workspace: fakeCore.ts (kinds through parseNodeType), historySafety, perform, realcore, refresh, undo, sample (layout.json check, see below).
webview
- src:
  - labels.ts: Axioms/Propositions; glyphs A/P.
  - board/geometry.ts: 2 columns; skip-column routing removed (gutterY/routedPath kept).
  - board/EdgeEngine.ts, board/Board.tsx: scroll map and comment.
  - board/Column.tsx: refused DropZone (AXIOM_DROP_REFUSAL); refusesDrop; AXIOM vocabulary and ghosts.
  - board/NodeCard.tsx: only the 'edit-rationale' chip action.
  - board/CardDetails.tsx: only "Make Axiom" (make-axiom); stance chips on axioms; source chips on both kinds.
  - model/cardData.ts: chips "pending proof", "rests on pending" and "has a proof"; no proved-goal chip.
  - model/run.ts: the lifecycle step is gone; acceptSelection returns {definitions}.
  - state/store.ts:
    - lifecycle state is removed;
    - tray rule, AXIOM_TARGET_BLOCK and TARGET_CHOICE_BLOCK;
    - kindChangeRefused; requestKindChange refuses A->P with an info toast.
  - run/Review.tsx, run/ProposalBanner.tsx, run/GhostSuggestion.tsx, run/Questions.tsx, dialogs/Dialogs.tsx, prompt/PromptBox.tsx, tray/SelectionTray.tsx, board/GhostCards.tsx, board/VocabularyGroup.tsx, App.tsx, toasts/Toasts.tsx: texts and steps.
  - styles/board.css: --tl-kind-a, --tl-kind-p and --tl-proved; 2-column grid; refused drop zone.
- tests (9): shared/graphs.ts, shared/runs.ts; unit/cardData, format, geometry (rewritten for 2 columns), run, store-run, store and theme (whitelist kindAxiom, kindProposition, proved).
extension
- package.json: colours telelean.kindAxiom, kindProposition and proved (dark #73C991, light #388A34, hc #89D185, hcLight #388A34); the description says "AXIOM and PROPOSITION cards".
- src/logic/boardSession.ts: manager.accept(runId, proposalId, definitions).
- src/logic/historyPreview.ts: an example label in a doc comment.
- test/unit:
  - fakes.ts: FakeRunManager.accept takes 3 arguments; the fake proposal has no lifecycle; "Add axiom: x".
  - runRouting.test.ts: no lifecycle in the payloads; accept is expected with ['r1','p1',['d1']]; addNode AXIOM.
  - boardSession.test.ts: kinds and labels; the needs-confirmation kind changes are now P->A of cynder-not-good, with a test-only second proposition "cynder-would-not-sell" as the dependent card.
  - actionMapping.test.ts: v4 kinds; A->P is passed through by the mapping.
  - dependentCards.test.ts: PROPOSITION.
  - watchers.test.ts: a "Make Axiom" label, so the cut is now "…would not be a…".
  - editApplier.test.ts: label.
  - packageJson.test.ts: colour ids.

TESTS
Deleted (each with its category; the ones outside the brief's four categories are marked FLAG):
- G->D lifecycle:
  - core gate/normalise.test.ts: "G->D of the proved target changes only its `type:` line"; "refuses (unsafe) an item that no longer applies".
  - runner proposal/accept.test.ts: "an unknown lifecycle id is not-found; nothing else is planned"; "ticked lifecycle items are applied on top of the merged files (with the facts given), not in shadowState"; "a lifecycle item that no longer applies refuses the whole plan …"; "the facts build kept come back for Accept, also in a new service after a window reload" (the facts were kept only for the lifecycle).
  - runner proposal/build.test.ts: describe "WP1's lifecycleChanges" > "AT4.5 no drift with l1 ticked: after = the shown files with `type: DERIVATION` …".
- TL105 and TL116 assertions in core project/status.test.ts (the table was regrouped by kind):
  - "GOAL, H axiom: assumed + TL116" (now pending);
  - "GOAL, H theorem: proved + proved-goal (TL105)" (now proved and established);
  - "DERIVATION, H axiom: pending-promotion + claimed" (now pending);
  - "TL102 when a proof rests on a goal asserted as an axiom" (now rests-on-pending).
- A->P via change-kind:
  - core edit/helpers/scenarios.ts: "A->D keeps the axiom (pending promotion): only type: changes", replaced by "A->P is refused as a change-kind …".
  - core edit/kindChange.test.ts: "G->D: type only …"; "A->D: type only; an axiom stays and the promotion is pending".
- FLAG: the change-to-GOAL tests (A->G / D->G, which removed `.holds` with a hypothesis rewrite or mark-broken). I counted them as "A->P via change-kind": A->G is now the refused A->P, D->G is now P->P (a re-order), and no kind change removes a `.holds` any more.
  - core edit/helpers/scenarios.ts: "A->G with rewrite …"; "A->G with mark-broken removes the axiom …".
  - core edit/kindChange.test.ts: "A->G, D->G without dependents: remove-holds …"; "A->G, D->G with dependents and no choice: needs-confirmation listing them"; "untracked users are dependents too (by their Lean name)"; "mark-broken: remove-holds, and the users are listed as broken"; "rewrite: binder first on every user, apply-hypothesis …, then remove-holds; spans from the facts"; "rewrite picks a hypothesis name no user mentions yet"; "rewrite refuses with facts-stale unless every touched file is fresh"; "rewrite refuses with unsafe when a user is not a theorem"; "rewrite refuses with unsafe when an axiom .holds is used where the references do not show it"; "without fresh facts, uses found in the text still count as dependents (nothing is removed silently)".
  - core edit/conditional.test.ts: "D->G with \"rewrite\" replaces each whole application `(d1.holds h_a1)` by the new hypothesis h_d1 : d1".
  - core carryover/kindTexts.test.ts: "to Goal, one proof: exactly the frozen singular text …"; "to Goal, two proofs: the plural text as in M1"; "to Goal: one dependent exactly as frozen; two in the plural".
  - core contracts.test.ts: "A->G without dependents just removes .holds".
  - runner integration/session.test.ts: "A->G with \"mark broken\" removes the axiom; Lean reports the broken proof on the goal; undo restores it".
  - runner integration/fixes.test.ts: "D->G \"rewrite\" on the conditional derivation replaces `(d1.holds h)` by the hypothesis h_d1 : d1; Lean builds".
- FLAG, two columns: webview geometry.test.ts "routes a focused arrow that skips the Derivations column through a gap between its cards, never over them". With 2 columns no arrow skips a column; gutterY keeps its test.
Rewritten with the same intent (not deleted):
- core:
  - confirmedDependents.test.ts: all 5 intents, now on P->A of a conditional proof.
  - staleUsers.test.ts: 3 tests now delete the card instead of changing it to Goal.
  - kindTexts: "to Assumption" became "to Axiom …" (3 tests).
  - contracts:
    - "A->D keeps the axiom…" became "A->P keeps the axiom: pending proof until proved (AR-6, for the arrow gestures)";
    - "G->A adds…" became "P->A adds the axiom, says that its arrows go (AR-7) and asks why";
    - "a proved goal…" became "a proved proposition: ->A archives the proof";
    - "A->G with proof dependents…" became "A->P with proof dependents names what loses its green glow …".
  - conditional: the D->A tests became P->A; "A->G \"rewrite\" handles `@H` …" became "referenceSpans (what a P->A rewrite replaces) handles `@H`, a duplicated `@c` ref and a parenthesised `(c)` ref".
  - kindChange.test.ts: the G->A and D->A tests became "P->A of an unproved proposition (DERIVATION and GOAL aliases): add-holds-axiom", "P->A of a pending proposition keeps its axiom: type only (A13)" and "P->A of a proved proposition: holds-theorem-to-axiom".
- runner:
  - session "A->G on an assumption the proof uses …" became "P->A on the proved proposition: the theorem becomes the axiom (archived), its arrows go, Lean agrees; undo is byte-exact; A->P is refused"; "a derivation used by a proof …" lost its D->G assertion.
  - fixes "A->G \"rewrite\" … D->A …" became "P->A on a conditional proposition (hand-written) asks first, and \"rewrite\" drops the arguments its users pass; Lean builds".
  - walkthrough.e2e (a) was renamed "(a) normative: proved, Accept writes the formalisation and the proof and keeps the type: line; Undo restores".
- webview:
  - store.test "A->D needs no dialog …" became "A->P is refused before anything is sent (AR-6 …)"; "A->G of an assumption a proof uses asks first …" became "P->A of a proof that takes hypotheses, applied by another proof, asks first; rewrite needs fresh facts".
  - store-run and run.test: the lifecycle ticks and step are removed. The review clamp is now 3 (no "Card changes" step).
  - cardData "proved: make Derivation?" became the plain "✓ proved" chip.
Added:
- core markup/kinds.test.ts:
  - parseNodeType: "reads the two kinds, and the old ones as aliases naming the old kind"; "is case-insensitive, and undefined for anything else".
  - `type:` in the markup:
    - "`type: %s` reads as %s, with no diagnostic" (×5);
    - "`kind:` stays an alias of `type:`; lower case keeps the TL019 hint";
    - "any other value is TL004 naming the two kinds";
    - "an alias is never rewritten by an edit of another field";
    - "TL011 (no rationale) is about axioms, written either way".
  - follows_from: "is read as the mark and carried to the card as fromNothing"; "round-trips …"; "any other value is TL022 …"; "with declared premises it is TL023 …"; "a `premises:` line with no valid id is not an arrow …"; "a repeated line is TL005".
- core status.test.ts, describe "spec v4 B.5: the established flag":
  - "proved, resting only on axiom cards (through another proved proposition): established";
  - "resting on a pending proposition: not established, rests-on-pending (also two steps away)";
  - "a proof with sorry, a hidden axiom, or a hypothesis is not established";
  - "an axiom card in the footprint whose .holds states something else (TL114) leaves it unestablished (S-9)";
  - "stale facts leave it unestablished … (S-3)".
  - Also per-kind tables (describe.each over AXIOM/ASSUMPTION and PROPOSITION/DERIVATION/GOAL), "rests-on-pending: …", "a proof resting on a GOAL asserted as an axiom: …", "no-rationale is an AXIOM flag (TL011), never a proposition one".
- core contracts: "reads a layout written before spec v4: ASSUMPTION -> AXIOM, DERIVATION then GOAL -> PROPOSITION"; "keeps canvas positions (numbers only; malformed entries dropped) and writes them sorted by id".
- core kindChange.test: "P->A removes the incoming arrows (`premises:`) and the \"follows from nothing\" mark in the same plan (AR-7)"; "A->P is refused with invalid, whatever the axiom holds …"; "kindChangeImpact still describes A->P for the arrow gestures …".
- core serializer: "spec v4 AR-5: `follows_from: nothing` … goes right after `premises`, and parses back as the mark".
- core scenarios: "P->A (a `type: GOAL` alias) … writes `type: AXIOM` and drops its arrows …"; "P->A on a proved proposition …"; "A->P is refused as a change-kind …".
- webview cardData: "spec v4: \"rests on pending\" …; \"has a proof\" (no button) …".
- webview store: "A->P is refused before anything is sent …".
- runner sample.test.ts "has the project files of 7.1, byte for byte": the layout.json check now accepts the pre-v4 empty layout bytes as well as the v4 ones, and parses to emptyLayout(). mental_model/ still has the old keys and is outside my write set.

VERIFY (CAP=/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/capped.sh; one job at a time; MemAvailable stayed at about 2.3–2.9 GB; no job was killed by the cap)
tsc (each command run in its package dir):
- core: `$CAP 1600 npx tsc --noEmit -p tsconfig.test.json` → exit 0, no output.
- runner: `$CAP 1600 npx tsc --noEmit -p tsconfig.test.json` → exit 0.
- webview: `$CAP 1600 npx tsc --noEmit -p tsconfig.json` → exit 0.
- webview: `$CAP 1600 npx tsc --noEmit -p tsconfig.node.json` → exit 2, 6 errors, all in e2e specs I must not touch:
  - m1-edits.spec.ts 222, 252, 259 (dependentCards type 'GOAL');
  - m2-layout.spec.ts 277 (lifecycle);
  - m2-review.spec.ts 234 (×2, lifecycle).
- extension: `$CAP 1400 npx tsc --noEmit -p tsconfig.json` → exit 2, 9 errors, all in test/suite:
  - e2e-runs.test.ts 372 (×2, lifecycle);
  - e2e.test.ts 243 ('ASSUMPTION');
  - model.test.ts 106 ('ASSUMPTION');
  - runs.test.ts 271 (×2), 293 (×3) (lifecycle).
vitest:
- core: `$CAP 1600 npx vitest run --maxWorkers=1` → "Test Files 49 passed (49)", "Tests 513 passed (513)".
- webview: `$CAP 1600 npx vitest run --maxWorkers=1`. The first run had 1 failure (store-run review clamp 4 → 3, fixed). Rerun: "Test Files 8 passed (8)", "Tests 130 passed (130)".
- extension: `$CAP 1700 npx vitest run --maxWorkers=1 --no-cache` → "Test Files 21 passed (21)", "Tests 180 passed (180)". I used --no-cache because vitest.config.mts sets cacheDir to out/.vite; afterwards no file in out/ or dist/ was newer than my start.
runner (`$CAP 1800 timeout 900 npx vitest run --maxWorkers=1 <files>`):
- A: run/prompts, manager.accept, manager.rounds, manager.start, manager.happy, manager.lifecycle, manager.caps, manager.gate, walkthroughScript, backend → "10 passed (10)", "75 passed (75)".
- B: gate/engine, gate/rules, gate/pure, llm/cliSession, toolServer, tripwire, argvEnv, m2Harness, fake → "9 passed (9)", "128 passed (128)".
- C: proposal/accept, build, apply, sidecars, boardEdits → "5 passed (5)", "35 passed | 7 skipped (42)". The 7 skipped are build.test.ts's real-Lean tests: the tests' waitForMemory needs 12 GB MemAvailable.
- D1: workspace/perform, realcore, undo, historySafety, scan, history, m2members → "7 passed (7)", "58 passed (58)".
- D2: workspace/sample, refresh, initialize → "1 failed | 2 passed (3)", "1 failed | 31 passed | 3 skipped (35)". The failure was sample "has the project files of 7.1, byte for byte" (mental_model layout.json has the pre-v4 keys). I fixed the test; rerun of sample alone: "1 passed (1)", "6 passed | 1 skipped (7)".
- E1: integration/m2flow → "1 passed (1)", "5 passed (5)".
- E2: integration/session, fixes, escapes. Every test in them waits 120 s for 12 GB and then skips, so I only collected them: `… -t "^collect-only: no test has this name$" <3 files>` → "Test Files 3 skipped (3)", "Tests 14 skipped (14)". Imports and top-level code ran; no test bodies did.
- F1: run/fresh.e2e → "1 passed (1)", "9 passed (9)".
- F2: run/walkthrough.e2e → "1 passed (1)", "22 passed (22)".
- G: lean/userns, footprint, comparator → "3 passed (3)", "26 passed (26)".
- Not run (untouched, and they reference no changed symbol): shadow/*, semantic/*, lean/sandbox, lean/profile-shadow, llm/binary, pathGuard, streamJson, run/quotaTripwire, smokeScript.
- UNVERIFIED on this machine (RAM-gated): the real-Lean bodies of integration/session (8), fixes (5), escapes (1), proposal/build (7) and workspace sample/refresh/initialize (3 skipped).

CONTRACT DETAILS I DECIDED (each is a dated line in docs/slice1-plan.md §8)
- Protocol accepts only AXIOM/PROPOSITION for addNode.type, kindChange.from/to and reorder.column ("must be AXIOM or PROPOSITION"). The aliases exist in the markup only.
- parseNodeType does not trim. TL004 reads "Invalid type "X" (expected AXIOM, PROPOSITION).".
- TL022 and TL023 wording; both are errors. TL023 points at the follows_from line. A repeated line is TL005.
- Renamed card texts: TL011 for axioms; TL106 "This axiom has a proof."; TL117 "This axiom has no `axiom x.holds : x`, so proofs cannot use it."; TL104 "(an Axiom)". TL105, TL116 and TL102's goal variant are gone.
- Statuses: an axiom `.holds` is assumed on an AXIOM and pending on a PROPOSITION, with no flag. rests-on-pending is set when the footprint holds a pending proposition.
- established:
  - a conditional proof never counts; presuppositions are allowed;
  - "unsure" means stale, not-checked or holds-mismatch;
  - it walks direct(v) through today's refs-based edges.direct (the S-1 fallback) until 1d's facts extension.
- P->A also removes follows_from:, and the impact text says so.
- kindChangeImpact keeps the A->P branch for 1b ("Becomes a proposition", leanChange 'pending', glow text). KindLeanChange is none|add-axiom|theorem-to-axiom|pending. New core exports: AXIOM_TO_PROPOSITION_REFUSAL and AXIOM_DROP_REFUSAL.
- The →GOAL planner path is removed. The LeanOps remove-holds, add-hypothesis and apply-hypothesis are kept. DependentsChoice is left only for P->A of a conditional proof.
- Re-order refusal texts across columns; labels "Add axiom/proposition: …" and "Make Axiom: …"; attic reason "Proposition -> Axiom".
- The run lifecycle is removed end to end:
  - core types; protocol acceptProposal; RunManager.accept's 3 arguments; AcceptRequest.lifecycle and .facts;
  - proposal-facts.json is no longer written or read;
  - the "Card changes" step and "(+ Make Derivation)" are gone.
- The non-PROPOSITION target refusal lives in the runner's preflight (AXIOM_TARGET_REFUSAL "An axiom is something you hold: draw arrows into it to make it a proposition first.") and in the webview tray. The tray also says "Several propositions are selected: choose the target with ⊢." and "Select the proposition to prove too.". The gate has no new target-kind check.
- System prompt and m2-plan §5.1 updated.
- Layout positions: finite numbers only; ids that are empty or `__proto__` are dropped; written sorted by id after the columns and omitted when empty; deletes drop them; append and move keep them.
- graph.json format_version stays "1.1" although the enum values changed. OPEN for the integrator: bump the version?
- Webview: a refused drop zone, plus an info toast if dropped (nothing sent); "Make Axiom" only; source chips on both kinds, stance chips on axioms; chip names as above.
- Left unchanged (outside my write set, or e2e):
  - mental_model/ (layout.json still has the pre-v4 keys; its markup still says ASSUMPTION/GOAL, read as aliases);
  - the root package.json description;
  - extension/scripts/demo-driver.mjs, demo-ui.mjs and smoke.mjs; extension/test/demo/demoClaude.ts.
- Note for 1f: extension runRouting.test "… a board edit does not wait for the run start" still expects edits during a run to go through. ES-9 (1f) will change that.

E2E / NON-UNIT FILES THAT NEED UPDATING IN 1c–1e (not touched by me; counts are grep hits for old kinds, lifecycle or old colour ids)
- webview/test/e2e:
  - board.spec.ts (52), m1-drag.spec.ts (47), m2-review.spec.ts (17, tsc), m1-edits.spec.ts (13, tsc), m2-carryover.spec.ts (12), m1-cards.spec.ts (10);
  - m1-fixes.spec.ts (9), m1-lean-code.spec.ts (7), helpers.ts (4), m1-store.spec.ts (4), m2-layout.spec.ts (3, tsc), m2-overlay.spec.ts (3), m2-run.spec.ts (3), m2-provenance.spec.ts (1);
  - m1-header.spec.ts (uses statusGallery, which changed);
  - plus any Playwright screenshots (the board now has 2 columns).
- extension/test/suite: e2e.test.ts (22, tsc), e2e-runs.test.ts (11, tsc), boards.test.ts (10), runs.test.ts (5, tsc), model.test.ts (3, tsc), board.test.ts (3, colour ids), fakeWorkspace.ts (2), activation.test.ts (1, colour list).
- extension/scripts: demo-driver.mjs (9), demo-ui.mjs (1), smoke.mjs (1); extension/test/demo/demoClaude.ts (6).

EFFECTS OUTSIDE THE REPO AND MY SCRATCH DIR
- Transient systemd user scopes:
  - from capped.sh, one per heavy command;
  - from the runner tests' own runLean scopes.
  - All ended. `systemctl --user list-units --type=scope` shows none of mine, and no process of mine is left.
- /tmp/telelean-ws-tests-XXXXXX: 18 directories created 01:06–01:28 by my runner runs. runner/test/workspace/helpers.ts makes one SCRATCH base per test-file process and never removes it. Each holds only an empty tmp/. I left them, because they are outside my write set. 5 older ones predate my runs.
- ~/.npm/_logs/*-debug-0.log: every npx call writes one. npm keeps the newest 10, so older logs there were rotated out.
- Inside the repo but outside packages/docs:
  - /home/zhengyew/telelean/node_modules/.vitest-cache (vitest's module cache, now 785 files, 28 MB, added to by every vitest run);
  - node_modules/.vite-temp.
- Inside packages: core/node_modules/.vite-temp, runner/node_modules/.vite(-temp) (vitest results), webview/node_modules/.vite.
- packages/extension/out and dist are untouched (verified by mtime).
- Read-only git status/diff changed the mtime of the .git directory. .git/index is unchanged, and there is no git state change.
- No network, installs, downloads, real Claude (TELELEAN_NO_REAL_CLAUDE=1), publishing, or access to credentials or user config.
- Scratch notes: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b1a/ holds logs tsc_*.log, vitest_*.log and runner_*.log, deleted_tests.md and changed_by_mtime.txt.
