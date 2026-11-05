# build:WP4 (agent ad0e022682d60c4d4)

## summary
WP4 is implemented and every acceptance test passes: 14 test files, 133 tests, 0 failed, 0 skipped. WP1 landed all of its core proposal helpers and lifecycleChanges during this turn, so the tests marked [gated] now run against WP1's real code and pass.

ProposalService (packages/runner/src/proposal/service.ts):
- build: parses ws/ model files with core, adds the check's facts, then buildProjectModel → subjectGraph (keeping the current board's column order) → diffGraphs. It produces: the files summary with diff 9.0.0 line counts; one StatementReview per statement that is new or changed against the base B (adopted ghosts show wordedBy 'agent'); a VocabularyReview of new sorts, predicates, functions and constants; definition questions d1, d2, …; l1 (GOAL→DERIVATION, recommended) when the verdict is proved and Lean shows the GOAL proved; ghosts; the report card; baseChanged and empty.
- baseDrift: reports changed real files plus files the user added (from realFiles) or deleted.
- planAccept: applies Claude's base→shown patch to the real text with exactly 3 context lines and fuzz 0. A user edit within 3 lines of a change of Claude's is a conflict naming the file; 4 lines away merges. Files only the user changed keep their text. Ticked lifecycle items are applied with core lifecycleChanges, and shadowState is returned without them. With shownState, changes are real → shownState plus lifecycle.
- apply: calls ModelWorkspace.applyChanges with history kind accept-proposal. diffFiles returns base → shown.

RunSidecarStore (sidecarStore.ts):
- attempts.jsonl: each line is one write on an O_APPEND descriptor, so concurrent writers never interleave.
- decisions.json: read-modify-write, written to a temp file in .telelean/, fsync'd, then renamed over the old file.
- One per-file queue is shared by every store in the process.

Real ModelWorkspace, M2 members (all go through the existing applyRecorded path):
- applyChanges: "Manual edits"/"Initial state" snapshot first, then the EditApplier, one undo entry, the accept-proposal snapshot, re-read, graph.json and a refresh request.
- readText, modelFiles (model files plus the project files that exist), library, projectModel.
- reloadAttempts, and graph(S).attempts newest first via core's codecs. Codec failures are logged and never break the board.
- HISTORY_ACTIONS gains accept-proposal, typed HistoryActionKind | AcceptProposalAction.

Additions beyond the brief, all additive and optional:
- AcceptRequest.realFiles and AcceptRequest.facts.
- build() keeps the shown state's facts per run, in memory and in <runDir>/proposal-facts.json. lifecycleChanges needs them; this keeps Accept with the pre-ticked G→D item working after a window reload. The gated test confirms this against WP1's real lifecycleChanges.
- In the shownState path, a file the user edits during the re-check (after the accept-base commit) is never silently overwritten: it is kept if the rebase left that file alone, otherwise Accept refuses with a conflict.

## files
- /home/zhengyew/telelean/packages/runner/src/proposal/index.ts
- /home/zhengyew/telelean/packages/runner/src/proposal/service.ts
- /home/zhengyew/telelean/packages/runner/src/proposal/files.ts
- /home/zhengyew/telelean/packages/runner/src/proposal/sidecarStore.ts
- /home/zhengyew/telelean/packages/runner/src/proposal/types.ts
- /home/zhengyew/telelean/packages/runner/src/workspace/modelWorkspace.ts
- /home/zhengyew/telelean/packages/runner/src/workspace/types.ts
- /home/zhengyew/telelean/packages/runner/src/workspace/history.ts
- /home/zhengyew/telelean/packages/runner/src/workspace/files.ts
- /home/zhengyew/telelean/packages/runner/test/proposal/helpers.ts
- /home/zhengyew/telelean/packages/runner/test/proposal/build.test.ts
- /home/zhengyew/telelean/packages/runner/test/proposal/accept.test.ts
- /home/zhengyew/telelean/packages/runner/test/proposal/apply.test.ts
- /home/zhengyew/telelean/packages/runner/test/proposal/sidecars.test.ts
- /home/zhengyew/telelean/packages/runner/test/workspace/m2members.test.ts

## how_to_run_tests
cd /home/zhengyew/telelean/packages/runner && free -m && (ulimit -c 0; TELELEAN_TEST_TMP=<scratch dir> LEAN_NUM_THREADS=4 npx vitest run test/workspace test/proposal). build.test.ts runs five real Lean refreshes of a scratch copy of mental_model/ under runLean (about 9 s). It skips itself below 12 GB MemAvailable.

Typecheck of WP4's paths alone: npx tsc -p /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/wp4/tsconfig.wp4.json. This extends the runner tsconfig and includes src/proposal, src/workspace, test/proposal and test/workspace.

Full runner typecheck: npx tsc -p tsconfig.test.json. This currently fails, but only in WP3's in-progress file test/run/helpers/harness.ts:46 (TS2554, LlmSession.close arity), which is not WP4 code.

## test_output
Final run (2026-11-01 20:45), `npx vitest run test/workspace test/proposal --reporter=verbose`, vitest exit=0:
     21  ✓ test/proposal/accept.test.ts
      3  ✓ test/proposal/apply.test.ts
      8  ✓ test/proposal/build.test.ts
      9  ✓ test/proposal/sidecars.test.ts
      5  ✓ test/workspace/historySafety.test.ts
     14  ✓ test/workspace/history.test.ts
     15  ✓ test/workspace/initialize.test.ts
      9  ✓ test/workspace/m2members.test.ts
      8  ✓ test/workspace/perform.test.ts
      4  ✓ test/workspace/realcore.test.ts
     12  ✓ test/workspace/refresh.test.ts
      7  ✓ test/workspace/sample.test.ts
      7  ✓ test/workspace/scan.test.ts
     11  ✓ test/workspace/undo.test.ts
 Test Files  14 passed (14)
      Tests  133 passed (133)
   Duration  30.93s

Regression check on the M1 integration tests (integrator-owned, real Lean), `npx vitest run test/integration`: Test Files 3 passed (3), Tests 16 passed (16), 32.13s.

WP4-only typecheck: exit=0.
Full runner typecheck: exit=2, a single error in test/run/helpers/harness.ts(46,20) TS2554 (WP3's file).

## acceptance
- **test:** AT4.1 normative proved state from real refresh facts → proposal
  - **status:** pass
  - **evidence:** build.test.ts. Target proved in the proposed graph. files = [{Main.lean, modified, +6, -0}]. One StatementReview for pg-no-dark-past (sentence, pretty/explicit, closure with kinds and glosses). lifecycle = [l1 GOAL→DERIVATION, recommended]. Footprint = the 3 cards + presup:Spyro.Character.exists + presup:Spyro.Game.exists. consistency 'unchecked'. The [gated] diff test now runs on WP1's real diffGraphs and passes: pg-no-dark-past changed (statement, binding), target changed (proof, status).
- **test:** AT4.2 literal not-proved state
  - **status:** pass
  - **evidence:** build.test.ts. The VocabularyReview lists Spyro.InGame (predicate, gloss 'is in'). ghost-1 is listed. verdict not-proved, empty footprint, no lifecycle item. An extra test on the adopted-ghost round 2 (real Lean) shows Claude's card reviewed as wordedBy 'agent', in the footprint, with G→D offered.
- **test:** AT4.3 definition cheat
  - **status:** pass
  - **evidence:** build.test.ts. definitions = [{d1, Spyro.InGame, definition, code '/-- is in -/\ndef InGame (c : Character) (g : Game) : Prop := GoodAddition c g', usedByStatementsOf ['pg-no-dark-past'], gloss 'is in'}]. InGame is not listed as vocabulary.
- **test:** AT4.4 baseDrift
  - **status:** pass
  - **evidence:** accept.test.ts. Untouched → []. An unsaved open buffer (overlay TextSource) → [Main]. A user-added file (from realFiles) and a deleted one → both reported. Non-model paths are ignored. Without realFiles only the deletion is visible.
- **test:** AT4.5 planAccept
  - **status:** pass
  - **evidence:** accept.test.ts. No drift → before = real, after = shown. User edits on lines 10/16/24/40 against Claude's line 20 merge; lines 17/19/20/21/23 conflict with 'Your edits to Model/Spyro/Main.lean since the run started overlap Claude's; …'. Unknown lifecycle id → not-found. With shownState → exactly those files plus lifecycle, before = real. The [gated] test with WP1's real lifecycleChanges passes (type: DERIVATION), also from the persisted facts after a 'reload'.
- **test:** AT4.6 apply on a real ModelWorkspace in a scratch git repo
  - **status:** pass
  - **evidence:** apply.test.ts. History reads [accept-proposal, 'Manual edits', 'Initial state']. One applier call. One Undo restores the pre-Accept files and Redo re-applies them. A refresh is requested. Index, HEAD, refs, status outside the model, config and hooks are unchanged, and no hook marker was written. The [gated] real proposalLabel test passes: 'These suffice → proved: Cynder would not be a good addition to the new Spyro game'.
- **test:** AT4.7 workspace M2 members and graph.attempts
  - **status:** pass
  - **evidence:** m2members.test.ts. readText reads open buffers first and stays inside the root. modelFiles lists model plus project files and follows invalidate. library and projectModel work. attempts are newest first with resolutions, at load, via reloadAttempts (emits) and via invalidate. A codec failure is logged, not thrown. applyChanges refusals are covered, as is 'Initial state' first when no chain exists. The [gated] real-codec test passes.
- **test:** AT4.8 sidecar store
  - **status:** pass
  - **evidence:** sidecars.test.ts. 150 appends from two store instances plus 150 from a separate node process: 300 intact lines. A missing final newline is completed first. Resolutions are appended. decisions.json goes through a temp file and rename, with no temp left. 20 concurrent writes lose nothing. A failed write leaves the old file. Bad subjects are refused. Neither file appears in snapshots, Undo or a History revert. The [gated] real-codec round trip passes.
- **test:** AT4.9 diffFiles
  - **status:** pass
  - **evidence:** accept.test.ts. base → shown changes for model and project files: a deleted file, an added module, the modified Main. A stray notes.md is excluded.
- **test:** AT4.10 the M1 workspace suite still passes
  - **status:** pass
  - **evidence:** All 10 M1 workspace test files pass in the final run (historySafety, history, initialize, perform, realcore, refresh, sample, scan, undo: 83 tests). test/integration also passes, 16/16.

## contract_changes
- runner src/proposal/types.ts: new optional AcceptRequest.realFiles?: readonly string[] (ModelWorkspace.modelFiles(); when absent the model root's files on disk plus the project files are used). Lets user-added files stay in shadowState and never be deleted.
- runner src/proposal/types.ts: new optional AcceptRequest.facts?: LeanFacts (the accepted state's facts, e.g. the re-gate's check facts; when absent, the facts build() kept for this proposal are used). Needed by lifecycleChanges.
- runner src/proposal/index.ts: new exports MERGE_CONTEXT_LINES (3), PROPOSAL_FACTS_FILE ('proposal-facts.json'), PROVED_GOAL_REASON.
- runner src/workspace/types.ts: WorkspaceCore gains optional parseAttemptLines? and summariseAttempts? (test hook; default is core's).
- Run directory layout (WP2's shadow/types.ts comment lists the layout): new file <runDir>/proposal-facts.json written atomically by ProposalService.build ({format:'telelean-proposal-facts', version:1, proposalId, savedAt, facts}).
- Internal, not contract files: workspace/history.ts SnapshotMeta.action widened to HistoryActionKind | AcceptProposalAction, and HISTORY_ACTIONS gains 'accept-proposal' (read back as such); modelWorkspace.ts RecordedOperation.action widened the same way; workspace/files.ts gains PROJECT_FILES, isModelOrProjectFile and attemptsSubject.
- docs/m2-plan.md section 14 was not edited (docs/** is outside WP4's assigned paths): the integrator should log the entries above.

## minor_decisions
- **decision:** Accept's patches use exactly 3 context lines (structuredPatch {context: 3}, applyPatch fuzzFactor 0).
  - **rationale:** diff 9.0.0's default is 4 context lines, not the 3 the plan assumed. The plan's rule is 3 ('a user edit within 3 lines … is a conflict'), so it is passed explicitly. The tests check the boundary: 3 lines away conflicts, 4 merges.
- **decision:** build() rebuilds the proposed model from ws/ now (model files) plus check.facts instead of using check.model.
  - **rationale:** This matches the brief ('core buildProjectModel over ws/ + the mirror's facts') and ProposalCore's members, and stays correct even if the check omitted its model.
- **decision:** The proposed board keeps the current board's column order (a layout derived from currentGraph's node order); new cards such as an adopted ghost follow in file order. currentGraph.attempts are copied onto the proposal graph.
  - **rationale:** The service cannot read layout.json from the shadow, and cards should not jump around in the overlay.
- **decision:** The lifecycle item l1 is offered only when the verdict is 'proved', the target is a GOAL, and Lean's status for it in the proposed board is 'proved'. A check without facts offers none.
  - **rationale:** Core's lifecycleChanges refuses a target that is not proved, so offering the item without facts would only fail at Accept.
- **decision:** A StatementReview is 'new' when B has no statement declaration for the card, and 'changed' when the declaration's source text (docstring included) or its bound name differs. Reviews follow board order. Closure names bound to other cards get kind 'statement' and that card's sentence as gloss.
  - **rationale:** This is a simple syntactic comparison against B, as the plan's 'new or changed vs B' asks.
- **decision:** The VocabularyReview appears only when non-empty and lists new sort/predicate/function/constant items of the subject (names not declared in B). Definitions and presuppositions are definition questions instead; lemmas are proof-only.
  - **rationale:** Only these kinds are pure signature under the D-3 rules (auto-approved, revocable).
- **decision:** Report card: footprint and unusedPremises are filled only for verdict 'proved'. A selected card counts as used when it is in the footprint or has a verified edge into the target. Adopted ghosts count as selected. selfEvident means proved, no selected card, and only presup: entries in the footprint.
  - **rationale:** A proved derivation shows in the footprint only through its own assumptions, so its verified edge is what proves it was used. A 'not proved' round has no footprint to compare against.
- **decision:** DefinitionQuestion.code and gloss fall back to the declaration's source text and docstring in the shown files when the engine's FlaggedDefinition lacks them.
  - **rationale:** DefinitionQuestion.code is required, but FlaggedDefinition.code is optional.
- **decision:** Facts for Accept are kept per run in memory and in <runDir>/proposal-facts.json. AcceptRequest.facts, when given, takes precedence.
  - **rationale:** WP3's persisted run.json holds no facts. Without them, Accept after a window reload with the pre-ticked G→D item would be refused as 'unsafe'. Verified against WP1's real lifecycleChanges.
- **decision:** In the shownState path, real files are compared with the newest accept-base commit. An edit the user made during the re-check is kept if the re-gated state left that file unchanged, and is a conflict otherwise ('You changed <file> while telelean re-checked the proposal; press Accept again to include your edits.'). A real file absent from shownState is never deleted.
  - **rationale:** Applying real → shownState alone would silently overwrite typing done during the re-check; the EditApplier's before-check cannot catch it because 'before' is read afterwards.
- **decision:** Conflict sentences start with a capital letter ('Your edits to A and B since the run started overlap Claude's; Discard, or Feedback to redo it on your current files.').
  - **rationale:** The board shows refusal texts as they are; the plan's text is otherwise unchanged.
- **decision:** applyChanges accepts only model files (<library>.lean, <library>/**.lean), each path once, and requires a valid subject. It drops no-op changes, and returns ok with undoable false when nothing remains. Like perform (and unlike revert), it does not require the base snapshot to succeed.
  - **rationale:** Plan 7.2 says Accept never writes anything else. The user's edits are preserved in the merged text and in the undo entry, so a failed snapshot need not block Accept.
- **decision:** modelFiles() returns the model files the workspace knows plus the project files that exist (lakefile.toml, lakefile.lean, lean-toolchain, lake-manifest.json), tracked through the TextSource at scan time and on invalidate; never .gitignore or .telelean/. readText accepts relative or in-root absolute paths and throws TypeError otherwise.
  - **rationale:** WP2's shadow takes exactly the model files and project files.
- **decision:** attempts.jsonl is read through the TextSource (open buffer first), at load, on reloadAttempts (which always republishes) and on invalidate of that path. Unchanged text is not re-parsed. graph() attaches a copy, and only when non-empty.
  - **rationale:** Consistent with how layout.json is read, and the extension's file watcher already covers the path.
- **decision:** Sidecar store details: one per-file write queue per process, shared across store instances; a missing final newline is completed before appending; decisions are written to .telelean/decisions-<S>.<pid>-<n>.tmp, fsync'd, then renamed; invalid subjects and relative roots are refused with TypeError.
  - **rationale:** No lost updates or joined lines; temp files are covered by the scaffold's /.telelean/*.tmp gitignore line.
- **decision:** diffFiles uses ws/ now as 'the shown state' and ignores the proposal argument.
  - **rationale:** In review ws/ holds exactly the shown state (WP3 restores it after a failed re-check), and ProposalView carries no commit id.

## open_issues
- Full runner typecheck currently fails at test/run/helpers/harness.ts(46,20) TS2554 (WP3's in-progress file). WP4's paths typecheck clean in isolation.
- The formerly gated WP4 tests now run against WP1's code as it stood at about 20:45. If WP1 changes diffGraphs fields, the proposalLabel format or codec behaviour, the integrator should re-run test/proposal and test/workspace.
- The webview's HISTORY_ACTION_LABEL has no 'accept-proposal' entry yet. HistoryMenu falls back to the raw kind, and the integrator adds the label when merging AcceptProposalAction into HistoryActionKind (plan 11 step 2).
- .telelean/graph.json still exports attempts: [] (core's toGraphJson takes no attempts); TlGraph.attempts is attached only to board graphs.
- decisions.json writes from two windows at the same instant can lose one update: the replace is atomic, but there is no cross-process lock. Acceptable for a personal prototype.
- jsdiff's applyPatch may re-anchor a hunk at another place in the file where all of its context (3 lines before and after) matches exactly. This is safe with Lean's distinctive lines, but a file with large repeated identical regions could in theory merge at the wrong copy (the M1 undo has the same property).

## integration_notes
For WP3's RunManager:
- Pass `realFiles: ws.modelFiles()` in every AcceptRequest, and `facts: gateReport.check.facts` in the planAccept call that follows a passing re-gate (both optional, both have fallbacks).
- planAccept with shownState expects the `accept-base` commit to exist and to hold the user's real files at Accept, as plan 7.1 step 4 says.
- plan.shadowState holds every merged model and project file, including user-added files, without lifecycle items.
- Call proposals.apply(plan, workspace, subject). It never throws, and an empty change set returns ok with undoable false.
- Call workspace.reloadAttempts(subject) after store.appendAttempt / resolveAttempt so the board's attempts history updates.

For the integrator:
- Make the ModelWorkspace M2 members required and update the extension's test fakes. WorkspaceCore's two new codec members are optional, so M1 fakes still compile.
- Add 'accept-proposal' to the webview label table when merging the union.
- Mention <runDir>/proposal-facts.json in WP2's layout comment.
- Log the contract changes in plan section 14.

Every test marked [gated] already runs and passes today; the describe.skipIf wrappers can simply be removed.

Unrelated to my work: /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/wp4/probe and …/turn9/wp4/tt existed before this builder started (12:07 and 12:39) and were left untouched.

## effects_outside_repo
- Scratch dir /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/wp4/: created tsconfig.wp4.json, final-run.txt and tmp/ (the tests' TELELEAN_TEST_TMP: scratch model copies, scratch git repos, vitest compile cache). tmp/ was emptied after the runs.
- Real Lean through M1's runLean (toolchain v4.35.0 binaries, sandboxed, in scratch copies only): transient systemd --user scopes telelean-wp4b<pid>_<n>-* from build.test.ts, and telelean-itg*/tlws* scopes from the M1 integration and workspace suites I ran. All removed by runLean; `systemctl --user list-units 'telelean-wp4*' 'telelean-itg*' 'telelean-tlws*'` is empty afterwards. ~/.elan/known-projects is unchanged at 37 lines (also asserted by build.test.ts).
- git ran only in scratch repositories created by the tests under the scratch tmp, with GIT_CONFIG_GLOBAL=/dev/null, GIT_CONFIG_NOSYSTEM=1, GIT_CEILING_DIRECTORIES and -c commit.gpgsign=false -c core.hooksPath=/dev/null. Never in /home/zhengyew/telelean or mental_model/.
- sidecars.test.ts spawned one short-lived child process (process.execPath, a plain Node script it writes into scratch) that appends lines to a scratch attempts.jsonl.
- No network use, no Claude CLI invocation, no npm install, no credentials read; nothing written outside the assigned paths and the scratch dir. The running lean --server/lake serve processes belong to the user's own editor sessions and were not touched.

