# plan:architect (agent abf52c879acb839e8)

## plan_path
/home/zhengyew/telelean/docs/m2-plan.md

## summary
M2 architecture for one-shot 'These suffice' is written to /home/zhengyew/telelean/docs/m2-plan.md (15 sections). It covers: a scope checklist mapping all 23 M2 items, both walkthrough readings, the cheating cases, the 3 M1 carry-overs and the M0 lessons to work packages and acceptance tests; the run state machine; the exact prototype gate; the static system prompt, context bundle and later turns (what leaves the machine); protocol additions; Accept through M1's applyRecorded path (snapshot first, one undo step); FakeBackend scripts with the exact Lean edits; integration; risks; the live walkthrough; 29 minor decisions; no major ones.

Gate rules. G0 is a token denylist plus file rules on the changed text only, run before any Lean process. G1 builds in a separate build mirror. G3 checks footprints against the permitted set, no sorry, the simple vocabulary shape rule, no new axioms, and 'existing declarations unchanged' (cheap stand-in for H's formal immutability). G4 is lake comparator against the round's freeze. G5 checks the user's words byte for byte, ids and blocks. Permitted set computed from the frozen model = standard axioms + every non-Prop project axiom + selected .holds axioms + presuppositions of the target and selected statements + footprints of selected proved derivations. New definitions on statement paths and new presuppositions become yes/no questions; ghosts carry a checked gap proof.

Shadow layout. The agent's root ws/ holds only model files (no dot-entry anywhere). Lean runs in a build/ mirror synced before every job, so no sandbox or runLean change was needed (m0-report lesson 4). Git, session files and freezes sit outside ws/.

Contracts frozen in code (types plus stubs throwing NotImplementedError):
- core: run.ts (new), gate/, proposal/, plus additions to protocol.ts, model.ts, actions.ts, paths.ts. Protocol validators are implemented.
- runner: shadow/, gate/, run/, proposal/ (rootKeyOf and DEFAULT_RUN_SETTINGS implemented), optional ModelWorkspace members.
- llm: propose_assumption gains proof and lean_name; GateVerdict gains environment; GateCheckId gains markup, vocabulary and not_frozen.

All four packages typecheck. M1 suites still pass: core 351/351, runner 285/285 (real Lean, 127 s, no leftover units), webview unit 90/90, extension unit 103/103. A scratch vitest of the new validators passed 5/5.

Lean facts verified on v4.35 in scratch copies:
- the literal reading builds;
- the ghost gap-check theorem's footprint is exactly as the permitted set predicts;
- the adopted-ghost proof builds;
- the explicit form prints Not(...);
- both definition-smuggling cheats build, and the existing-vocabulary-to-def cheat has a footprint inside the permitted set. Footprints alone therefore miss it; G3's existing-changed rule and G4 catch it.

## work_packages
- **id:** WP1
  - **title:** core: gate rules, proposal helpers, sidecar codecs, M1 carry-overs
  - **owned_paths:** ["packages/core/src/gate/**", "packages/core/src/proposal/**", "packages/core/src/project/**", "packages/core/src/edit/**", "packages/core/src/kindChange.ts", "packages/core/test/{gate,proposal,carryover}/**", "packages/core/test/{project,edit}/**", "packages/core/test/protocol.m2.test.ts", "packages/core/test/fixtures/{gate,proposal}/**"]
  - **brief:** Implement every stub of packages/core/src/gate/index.ts and packages/core/src/proposal/index.ts exactly as documented (plan sections 3 and 7; types in gate/types.ts and run.ts). Pure TypeScript, no Node typings (tests read fixtures with ?raw).

Functions:
- scanForbidden and checkFileChanges: G0 token lists and file rules (plan 3.1), using lexLean tokens only; unchanged files are never scanned.
- computePermittedAxioms and frozenSnapshot: the D-5 permitted set from the frozen model (plan 3.2).
- evaluateRules: every rule of plan 3.3 per purpose (check, freeze, gate-proved, gate-other), flagged definitions, footprints and the declaration diff. Build on M1's vocabulary classification and definitional-choice flag, statuses and footprints, the raw MarkupBlock lines for G5, and edit/dependents usersOf.
- normalisationChanges (plan 3.4), planGhostAdoption (plan 4.9), lifecycleChanges (G->D type only).
- describeFinding and attemptNotice: the A2 sentences of plan 3.5, singular/plural correct.
- diffGraphs, proposalLabel, and the attempts.jsonl / decisions.json codecs including decisionsInForce.

Carry-overs:
- (1) subjectGraph fills LeanBinding.externalUsers: users of the card's statement or .holds that are not cards on this board, i.e. lemmas without a card in any subject and other subjects' cards (with sentence). Use facts refs transitively through untracked declarations, plus the text scan while files are stale.
- (2) Singular/plural wording ('rewrite it' vs 'rewrite them') in kindChange.ts and edit/planKind.ts.
- (3) planKindChange refuses with needs-confirmation, listing all dependents, when a dependents choice is given and its dependents are not all in confirmedDependents (absent = []).

Also copy the architect's scratch test /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/m2-architect/vt/protocol-m2.test.ts into packages/core/test/protocol.m2.test.ts, importing from ../src/index.js and adding vitest imports.

Record any additive contract change in plan section 14.
  - **acceptance_tests:** ["AT1.1 G0 tokens: every denylisted token in changed text is a finding with code and range. The same words in comments, strings, docstrings and telelean blocks are not. #check and #print are allowed. 'decide +native' and 'set_option maxHeartbeats 0 in' are flagged. 'import Lean' is flagged; 'import Model.Spyro.Lemmas' is allowed when in projectModules.", "AT1.2 file rules: lakefile/toolchain/manifest change -> project-file; another subject's file or Model.lean -> outside-subject; deletion -> deleted-file; 'Model/Spyro/my file.lean' -> bad-path; unchanged files never scanned", "AT1.3 permitted set on Spyro proved-overlay facts: all three premises selected gives the 13 names of plan 3.2 (= M0 comparator test permitted(ALL_SELECTED)). new-spyro-pg unselected removes its .holds. A selected proved derivation adds its footprint. An unproved selected goal goes to unusable. Zero premises gives STD + signature + target presuppositions.", "AT1.4 evaluateRules: a positive and a negative case for every code of plan 3.3, including existing-changed when a vocabulary axiom becomes a def, and the allowed change of a pending derivation's .holds from axiom to theorem. Flagged definitions: a new def in a statement closure is flagged; a proof-only def is not; a new presupposition is flagged. The declarations diff is reported.", "AT1.5 normalisationChanges: pin + derived id + docstring for a newly formalised code-less block; idempotent; bytes outside the edits unchanged", "AT1.6 planGhostAdoption: the inserted text parses to a new ASSUMPTION (worded_by agent, origin agent, session); taken lean_name -> derived name; comment delimiters refused", "AT1.7 lifecycleChanges: G->D changes only type:; a no-longer-proved target -> unsafe", "AT1.8 describeFinding/attemptNotice produce the A2 sentences of plan 3.5 incl. the give-up sentence", "AT1.9 diffGraphs: added/changed(with fields)/removed nodes, vocabulary, edges, counts", "AT1.10 codecs: attempts round trip, bad/unknown lines skipped, summariseAttempts newest first with latest resolution; decisions add/replace; decisionsInForce scopes (run never, nodes when meeting, subject always)", "AT1.11 carry-over 1: a lemma without a card and another subject's card using a .holds are both listed in externalUsers; absent when none", "AT1.12 carry-over 2: texts for 1 and 2 dependents in both impact kinds", "AT1.13 carry-over 3: confirmed set not covering the actual dependents -> needs-confirmation listing all; covering -> applies", "AT1.14 protocol.m2 test and core npm test pass"]
- **id:** WP2
  - **title:** runner: shadow workspace and the Lean check engine (gate executor)
  - **owned_paths:** ["packages/runner/src/shadow/**", "packages/runner/src/gate/**", "packages/runner/src/lean/**", "packages/runner/src/semantic/**", "packages/runner/test/shadow/**", "packages/runner/test/gate/**", "packages/runner/test/lean/**", "packages/runner/test/semantic/**", "test-fixtures/gate/**"]
  - **brief:** Implement packages/runner/src/shadow/index.ts (plan 4.2) and createLeanCheckEngine (plan section 3; contracts in gate/types.ts), reusing M0/M1 code.

Shadow layout:
- ws/ holds only model and project files, all regular files, no dot-entry at any depth.
- build/ is the Lean mirror (same files plus .lake/, seeded from the user's .lake/build). syncMirror runs before every Lean job: content compare, unchanged mtimes kept, deletions mirrored; it refuses symlinks, special files and dot-entries.
- git/ is the shadow history (GIT_DIR, work tree ws/), with isolated config and the safe -c flags.
- session/, frozen/, gate/ and scratch/ live outside ws/. pruneRunDirs keeps 10.

Engine:
- normalise: core normalisationChanges for statements new in this run, written and committed.
- check: G0 via core checkFileChanges first; only if clean, sync and run semantic.refreshLeanFacts on build/ (runId, memoryMax, guard, leanJobMs as build/check timeouts); then core buildProjectModel + evaluateRules.
- freeze: readiness, commit 'freeze', computePermittedAxioms on the frozen model, lean.freezeChallenge on a copy of build/. Add additively a way to remove declarations from the freeze copy, e.g. FreezeOptions.removeDecls via core applyLeanOps remove-decl, so a target .holds already in ws/ never clashes with the challenge.
- gate: G0, G1, G3, G5, then G4 via lean.runComparator for status proved only.
- checkGhost and renderStatements: scratch check files via 'lake env lean --stdin --json' in build/ (plan 3.8 and 4.5).
- Every Lean job goes through semantic.runExclusive and runLean with the run's scope group.
- Outcome mapping: ComparatorVerdict reasons -> comparator-* findings; runLean timeout/oom of the agent's build -> budget (counted); could-not-start / low-memory / unsyncable mirror -> environment (not counted).

Cheating fixtures live in test-fixtures/gate/ as edit scripts or overlays; anything containing forbidden commands is stored inert as *.lean.txt. All Lean via the toolchain binaries under runLean; check free -m first.
  - **acceptance_tests:** ["AT2.1 layout: ws/ holds exactly the model/project files with no dot-entry at any depth; build/.lake/build seeded; base commit; run and session dirs outside ws/; a symlink in the source or .lake/build refuses the shadow, leaving nothing behind", "AT2.2 the M0 decide() guard passes Grep/Glob on the ws/ root and denies Read of build/ and git/ paths", "AT2.3 syncMirror incremental (second build recompiles 0 modules), deletions mirrored, a symlink or .hidden file in ws/ -> ShadowLayoutError and no sync", "AT2.4 commit/commits/lastCommit/filesAt/changes/revertTo/writeFiles (with before check)", "AT2.5 listRunDirs/pruneRunDirs keep the newest 10 and never delete non-terminal or protected runs", "AT2.6 check on Spyro normative formalised (real Lean): ok + footprints; a G0 finding starts no Lean process (refreshFacts spy); job timeout honoured", "AT2.7 freeze refused for an unformalised selected assumption, a proof before the freeze, a shape violation, a G5 change; succeeds otherwise with permitted = AT1.3's set; frozen.ndjson exists; with a target .holds already in ws/ the freeze copy lacks it and the challenge builds", "AT2.8 gate (real Lean), one case per line:\n- honest normative proof -> passed (comparator accepted);\n- literal + adopted ghost proof -> passed;\n- axiom shortcut -> new-axiom;\n- := sorry -> G0 sorry, no Lean started;\n- weakened abbrev -> existing-changed;\n- weakened theorem type -> not-proved;\n- unselected new-spyro-pg -> footprint naming new_spyro_pg.holds;\n- new def InGame := GoodAddition in the closure -> passed with a flagged definition;\n- existing GoodAddition turned into a def -> existing-changed;\n- edited natural_name -> markup;\n- #eval -> G0, no Lean started.\nA pure test maps every ComparatorVerdict reason.", "AT2.9 checkGhost: the literal ghost of plan section 0 -> ok with that footprint and aloneEntails false. '¬ GoodAddition cynder newSpyro' with proof 'fun h => h' -> ok, aloneEntails true. A proof using an unselected .holds -> problems. Before the freeze -> refused. A forbidden token -> refused without Lean.", "AT2.10 renderStatements: pretty and explicit forms of pg_no_dark_past (explicit contains 'Not (')", "AT2.11 lean.cancelRun(runId) during a check -> environment outcome, no leftover telelean unit", "AT2.12 injected low MemAvailable -> environment, nothing spawned", "AT2.13 normalise writes pins and docstrings, commits 'normalise', idempotent", "AT2.14 the existing M0/M1 lean and semantic suites still pass"]
- **id:** WP3
  - **title:** runner: run controller, tool host, prompts, Claude backend factory, persistence, FakeBackend scripts, walkthrough script
  - **owned_paths:** ["packages/runner/src/run/**", "packages/runner/src/llm/**", "packages/runner/bin/**", "packages/runner/test/run/**", "packages/runner/test/llm/**", "test-fixtures/walkthrough/**", "scripts/walkthrough-claude.mjs"]
  - **brief:** Implement packages/runner/src/run/index.ts per plan sections 2, 4 and 5 (contracts in run/types.ts).

RunManager (all services injected):
- the state machine and transitions table of plan 2; per-round caps (turns from usage events; checks; an agent-active stopwatch paused while waiting for an answer and in review; leanJobMs passed to the engine);
- the gate loop: retry with exact failures, give up at maxGateAttempts, then revert ws/ to the last passing commit, re-check it and build the proposal;
- a nudge when a turn ends without finish; Cancel via session interrupt + lean.cancelRun(runId);
- Feedback rounds (stage formalise, a new freeze required) and ghost adoption rounds (core planGhostAdoption -> writeFiles -> commit adopt -> engine.freeze with adoptedGhosts -> stage prove -> adoption turn);
- Accept orchestration (plan 7.1): when the real files drifted, rebase into ws/, re-freeze and re-gate before ProposalService.apply;
- attempts/decisions through RunSidecarStore; transcript.jsonl in session/; atomic run.json after every change; recover() after a reload (a pending question returns; answering resumes the session with renderAnswersAsUserTurn).

RunToolHost implements AgentToolHost per the plan 4.3 table. Claude's guesses never reach RunView before the answer.

runPreflight per plan 4.1. createClaudeBackend: M0 resolveClaudeBinary with extensionDirs + ClaudeCliBackend, with an explicit guardScriptPath and the 'setpriv --pdeathsig KILL --' launcher.

Prompts: buildSystemPrompt returns plan 5.1 verbatim; buildContextBundle follows plan 5.2; the later turns use the texts of plan 5.3.

FakeBackend scripts of plan 10.2 and 10.3 go into test-fixtures/walkthrough/ as data. Write the walkthrough and cheating end-to-end tests, gated with isImplemented until WP2/WP4 land.

scripts/walkthrough-claude.mjs (plan 12.1):
- bundles the runner with esbuild's JS API into its work dir (Node strip-only type stripping cannot run the codebase's parameter properties);
- dry-run by default with the FakeBackend; --binary-check runs only 'claude --version';
- live only with --live AND TELELEAN_WALKTHROUGH_LIVE=yes. Builders run only --dry-run.

You may extend FakeStep/FakeSession and compact the tool-result renderings, updating the M0 llm tests you own. Never spawn a real Claude CLI in any test.
  - **acceptance_tests:** ["AT3.1 happy path with fakes + FakeBackend: start -> working -> ask_user -> waiting-for-answer (clock paused) -> answer (decision recorded, guess revealed in answered) -> freeze -> finish -> gate pass -> review with proposal; change events in order; run.json written at each step; usage summed", "AT3.2 gate loop: failures at attempts 1 and 2 then pass gives two gate-failed notices (core texts), exact failures in the tool results, and verdict proved. Three failures give give_up, a revert to the freeze commit, a re-check, a proposal with verdict gave-up, and notices gave-up + reverted.", "AT3.3 environment failure in the gate is not counted; run failed with an environment notice", "AT3.4 caps: the 26th check gets a tool error. maxTurns reached via usage events -> interrupt -> cap-reached. maxAgentMs under fake timers (not advancing while waiting for an answer) -> cap-reached. Counters reset on Feedback.", "AT3.5 a turn without finish: one nudge, then no-finish", "AT3.6 cancel during a check calls lean.cancelRun with the run id, closes the session, state cancelled, attempt recorded", "AT3.7 recovery: a disposed manager with a pending question; a new manager's recover() shows it; answering resumes the session (resumeSessionId) with renderAnswersAsUserTurn and the run finishes", "AT3.8 Feedback round: finish(proved) without a new freeze -> not-frozen; after a freeze it passes; the earlier proof does not trigger proof-before-freeze", "AT3.9 propose_assumption -> GhostView. adoptGhost in review -> adoption written, commit adopt, freeze with adoptedGhosts, round 2 in stage prove, adoption turn naming the Lean name. A refused re-freeze reverts and stays in review.", "AT3.10 Accept orchestration: no drift -> plan + apply. Drift -> rebase into ws/, re-freeze, gate, apply. A failed re-gate is refused and ws/ restored. A missing definition approval -> invalid.", "AT3.11 preflight refusals (toolchain, sandbox, memory, selection incl. an ASSUMPTION target, busy) create nothing", "AT3.12 buildSystemPrompt equals plan 5.1 (fixture copy); the context bundle quotes cards verbatim with vocabulary and decisions in force; neighbourhood scope omits unrelated cards", "AT3.13 createClaudeBackend with fake binaries (M0 binary.test pattern): resolution order, version floor, setpriv launcher, explicit guard path; only --version is executed", "AT3.14 walkthrough end to end (FakeBackend + real WP2/WP4 + fs-backed ModelWorkspace on a scratch git copy of mental_model/; gated):\n(a) normative -> proved -> lifecycle G->D -> Accept. Files gain the pinned formalisation, the proof and 'type: DERIVATION'. Real files are untouched before Accept. One history entry; Undo restores; attempts.jsonl says accepted.\n(b) literal -> not proved + ghost -> adopt -> re-freeze -> proved -> Accept. The adopted card has worded_by agent.", "AT3.15 cheating end to end (gated): each script of plan 10.3 shows its notice and the scripted honest retry passes; the give-up script reverts", "AT3.16 'node scripts/walkthrough-claude.mjs --dry-run' completes both readings with the FakeBackend and refuses --live without the environment flag"]
- **id:** WP4
  - **title:** runner: proposals, Accept (rebase + apply through M1 history/undo), workspace M2 members, sidecar store
  - **owned_paths:** ["packages/runner/src/proposal/**", "packages/runner/src/workspace/**", "packages/runner/test/proposal/**", "packages/runner/test/workspace/**"]
  - **brief:** Implement packages/runner/src/proposal/index.ts per plan 4.5 and 7 (contracts in proposal/types.ts).

build:
- the proposed subject graph: core buildProjectModel over ws/ + the mirror's facts, then subjectGraph;
- diffGraphs against the current board; changed files with line counts (diff 9.0.0);
- StatementReview for each new or changed statement (sentence, rendered pretty/explicit, closure from lean.uses with glosses); a VocabularyReview of new pure-signature items;
- DefinitionQuestion ids d<n>; a LifecycleItem l1 (G->D, recommended) for a proved GOAL target;
- ghosts; the report card (footprint from the proposed target status, unused premises, self-evident, consistency unchecked, Claude's summary/gap/conflict/assumed_without_asking, gate attempts, usage, durations, reverted); baseChanged; empty.

baseDrift compares base vs ModelWorkspace.readText (open buffers first).

planAccept: apply the base->shown patch to the real text with no fuzz (M1 undo technique); files only the user changed stay as they are; an overlapping edit -> conflict naming the file; ticked lifecycle items via core lifecycleChanges; return shadowState (merged, without lifecycle) for the re-gate.

apply calls ModelWorkspace.applyChanges.

In the real ModelWorkspace implement the optional M2 members:
- applyChanges through the existing applyRecorded path: 'Manual edits'/'Initial state' snapshots first, EditApplier, one undo entry, the action snapshot with history kind accept-proposal (add it to HISTORY_ACTIONS, typed HistoryActionKind | AcceptProposalAction until the integrator merges the union), re-read, graph.json, refresh;
- readText, modelFiles, library, projectModel, reloadAttempts; graph(subject).attempts via core summariseAttempts.

RunSidecarStore: attempts.jsonl append-only with O_APPEND; decisions.json read-modify-write with an atomic temp file inside .telelean/. Neither file enters history snapshots or undo.
  - **acceptance_tests:** ["AT4.1 normative proved state -> proposal:\n- the target is proved in the graph;\n- diff: pg-no-dark-past changed (statement, binding), target changed (proof, status); files summary;\n- one StatementReview (sentence, pretty, explicit, closure);\n- lifecycle l1 G->D recommended;\n- report footprint = the three cards + presup:Spyro.Character.exists + presup:Spyro.Game.exists; consistency unchecked.", "AT4.2 literal not-proved state -> VocabularyReview lists InGame, the ghost is listed, verdict not-proved, no lifecycle item", "AT4.3 definition cheat -> definitions lists Spyro.InGame with code and usedByStatementsOf", "AT4.4 baseDrift reports nothing for untouched files and reports an edited real file (fake TextSource)", "AT4.5 planAccept: no drift -> before=real, after=shown (+ 'type: DERIVATION' when ticked); drift elsewhere in the file -> merged; overlapping drift -> conflict naming the file; unknown lifecycle id -> not-found", "AT4.6 apply on a real ModelWorkspace (fs adapters, scratch git repo): 'Manual edits' snapshot first when hand edits exist; one history entry with the proposal label; one Undo restores every file; a refresh is requested; git index, HEAD and status untouched", "AT4.7 workspace M2 members and graph.attempts newest first with resolutions", "AT4.8 sidecar store: concurrent appends never interleave; resolutions; decisions atomic; neither file in history snapshots or undo", "AT4.9 diffFiles gives base -> shown changes for the raw diff", "AT4.10 the M1 workspace suite still passes"]
- **id:** WP5
  - **title:** VS Code extension host: run wiring, consent, settings, backend construction, raw diff, bundling, carry-over 3 host side
  - **owned_paths:** ["packages/extension/src/**", "packages/extension/test/**", "packages/extension/scripts/**", "packages/extension/package.json", "packages/extension/tsconfig.json", "packages/extension/vitest.config.mts", "packages/extension/.vscode-test.mjs", "packages/extension/dist/extension.js", "packages/extension/dist/extension.js.map", "packages/extension/dist/bin/**", "packages/extension/out/**"]
  - **brief:** Implement plan section 8.

Run wiring:
- one RunManager per model root, created with the root's ModelWorkspace in the registry, recover() once, disposed with it;
- BoardSession routes core RUN_MESSAGE_TYPES to it in arrival order and posts 'run'/'proposal' on onDidChange and on 'ready' (including another subject's run);
- startRun = egress consent once per root (globalState, exact text of plan 8.2; the testing API answers it) -> set-premises via ws.perform only when premises are non-empty and differ from the declared ones -> runManager.start; busy -> conflict.

openProposalDiff: vscode.changes on a read-only telelean-proposal: content provider, placed with M1's groupBesideBoard.

Settings: telelean.model, effort, claude.path, run.* (plan 8.3) through readSettings, read after a reload.

Backend construction (lazy):
- run.createClaudeBackend with guardScriptPath = <extensionPath>/dist/bin/telelean-path-guard.mjs, llm.defaultHookRuntime(), clientApp telelean/<version>, pdeathsig true;
- extensionDirs puts the dirname of getExtension('anthropic.claude-code')?.extensionPath first;
- runsDir = globalStorageUri/runs.

Bundling:
- bundle the runner's llm/run/gate/shadow/proposal;
- replace the M1 'no llm/ in bundle' check with a check that the guard script is copied to dist/bin/ and the bundle loads;
- esbuild define for import.meta.url, and always pass guardScriptPath explicitly.

Test mode: testing.useRunBackend(factory) injects FakeBackend scripts.

Carry-over 3: map kindChange.confirmedDependents into the change-kind action.

Do not run the webview build; the VS Code smoke uses the isolated profile, xvfb and ulimit -c 0.
  - **acceptance_tests:** ["AT5.1 routing (unit, fake RunManager): every run message reaches the right method with the board's subject; outcomes become actionResult; run/proposal posted on change and on ready, including another subject's run", "AT5.2 startRun: consent asked once per root and remembered; set-premises only when non-empty and different; busy -> conflict", "AT5.3 settings defaults and bounds (plan 8.3) read, and contributed in package.json", "AT5.4 guard script present in dist/bin after the build; createClaudeBackend receives it; Test mode uses the injected FakeBackend factory", "AT5.5 bundle contains llm/run/gate/shadow/proposal and loads in Node with the vscode stub without an import.meta.url crash", "AT5.6 openProposalDiff opens vscode.changes with base on the left and proposal on the right (unit with fake ports; smoke in VS Code)", "AT5.7 carry-over 3: confirmedDependents mapped into the action; needs-confirmation answers keep dependentCards", "AT5.8 VS Code smoke (isolated profile, xvfb, FakeBackend via the testing API, copy of mental_model/): start the normative run from the board, answer via simulateBoardMessage, wait for the proposal, Accept. Main.lean changes on disk, a history entry appears, Undo restores. A restored board (restoreBoard) shows a pending question again.", "AT5.9 deactivation persists an active run as interrupted and closes its session"]
- **id:** WP6
  - **title:** webview board: tray, run panel, question cards, review, report card, proposal overlay, ghost cards, attempts history, carry-over UI
  - **owned_paths:** ["packages/webview/**", "packages/extension/dist/webview/**"]
  - **brief:** Implement plan section 6.4 against core run.ts types and protocol messages.

Tray:
- 'These suffice ▶' posts startRun with premises and target; 'Self-evident?' with 0 premises posts startRun with premises [];
- 'Add to its premises ▶' posts the union;
- disabled with a reason while a run of the root is active.

RunPanel:
- status line: state, stage, round, checks n/25, turns n/80, agent time, gate attempt k/3, tokens, cost 'estimate', rate limit, Cancel;
- notices; activity, where Claude's text is italic with a marker;
- question cards: 1-3 questions, phenomenon tag, options with consequences, free text, Leave it open, Decide for me, scope selector defaulting to run; no guess before answering, guess revealed afterwards from RunView.answered;
- review stepper: statements first (sentence beside Lean, explicit toggle, closure), then new vocabulary (revocable = prefilled Feedback), then definition questions (Accept disabled until all yes; 'no' opens Feedback), then the report card (revealed after the statements or via 'Show result'), then lifecycle ticks (recommended pre-ticked);
- Accept / Feedback text / Discard / Raw Lean diff post acceptProposal, feedback, discardProposal, openProposalDiff.

ProposalBanner with a Current|Proposed toggle. The proposed view renders proposal.graph with diff badges (glyph + colour + halo, never colour alone) and auto-expands '+N new' vocabulary. Ghost cards are translucent 'Claude suggests' with 'I hold this' (optional why) / 'No' -> adoptGhost / rejectGhost.

The expanded card shows the attempts history from graph.attempts for that target.

Carry-overs:
- (1) 'Used by' and the delete dialog use LeanBinding.externalUsers;
- (2) singular/plural in the dialog texts;
- (3) kindChange posts confirmedDependents listed by the dialog; a needs-confirmation with more dependents re-opens it with the host's list.

Keep run/proposal state apart from applyGraph. Harness fixtures for run/proposal messages; Playwright with isolated HOME and one worker; do not run the VS Code smoke.
  - **acceptance_tests:** ["AT6.1 tray: startRun posted for 'These suffice ▶' (premises + target), for 'Self-evident?' (premises []) and for 'Add to its premises ▶' (union); disabled with a reason during a run of the root", "AT6.2 run panel shows states, stage, counters, usage with 'estimate', rate limit, notices (gate-failed, gave-up, reverted, cap, environment), activity with Claude's text italic + marker; Cancel posts cancelRun", "AT6.3 question card: phenomenon tag, options + consequences, free text, Leave it open, Decide for me, scope; submit posts answerQuestions; no guess before, guess revealed after the run update", "AT6.4 review order: statements -> vocabulary -> definitions -> report card -> lifecycle. Accept is disabled until every definition is approved. Accept, Feedback, Discard and Raw Lean diff post the right messages with ticked lifecycle ids and approved definition ids.", "AT6.5 overlay toggle; diff badges (glyph + colour + halo); '+N new' vocabulary expanded; ghost cards translucent with 'Claude suggests', posting adoptGhost (with optional why) and rejectGhost", "AT6.6 attempts history in the expanded card for that target (date, verdict, premises, resolution, Claude's summary italic)", "AT6.7 carry-over 1: Used by lists externalUsers (lemma in code font, other subject's card by sentence + '(subject …)'). 'Nothing else refers to it.' appears only when no board reference and no external user exist.", "AT6.8 carry-over 2: singular and plural dialog texts", "AT6.9 carry-over 3: confirmedDependents posted; needs-confirmation with more dependents re-opens the dialog with the host's list", "AT6.10 provenance test: agent text (activity, ghost sentences, questions, summaries, agent glosses) never renders in user styling", "AT6.11 another subject's run shows a compact line with 'Show'", "AT6.12 webview unit and Playwright suites pass (isolated HOME, one worker), including the M1 specs"]

## contracts
- packages/core/src/run.ts (new, integrator-owned). RunView, RunState/RunStage/RunVerdict, RunCaps/DEFAULT_RUN_CAPS, RunCounters, RunUsage, questions (QuestionSetView/QuestionView without Claude's guess, AnsweredQuestionView with it, QuestionAnswer, DecisionScope), RunNotice, RunActivity, GhostView, PermittedSummary, ProposalView (graph, GraphDiff, ProposalFile, StatementReview/VocabularyReview, DefinitionQuestion, LifecycleItem, GateAttemptView, ReportCard), AttemptRecord/AttemptResolution/AttemptSummary, DecisionRecord/DecisionsFile, PHENOMENA, TERMINAL_RUN_STATES/isTerminalRunState.
- packages/core/src/protocol.ts. Host->web 'run' {run|null} and 'proposal' {proposal|null}. Web->host startRun, answerQuestions, cancelRun, resumeRun, acceptProposal, feedback, discardProposal, adoptGhost, rejectGhost, openProposalDiff, dismissRun. kindChange.confirmedDependents. RUN_MESSAGE_TYPES, RUN_ID_PATTERN, RUN_TOKEN_PATTERN, LIMITS.answersPerBatch/reviewItems. Validators implemented and tested in scratch.
- packages/core/src/model.ts: LeanBinding.externalUsers?: ExternalUser[] (carry-over 1); TlGraph.attempts?: AttemptSummary[]
- packages/core/src/actions.ts: change-kind.confirmedDependents? (carry-over 3); AcceptProposalAction / ACCEPT_PROPOSAL_ACTION (merged into HistoryActionKind at integration)
- packages/core/src/paths.ts: attemptsPath(subject), decisionsPath(subject) (implemented)
- packages/core/src/gate/types.ts + gate/index.ts (WP1, stubs). GateFinding/GateFindingCode, G0Context, Selection, PermittedAxioms, FrozenSnapshot, RuleInput/RulePurpose/RuleReport, FlaggedDefinition, GhostAdoptionRequest/Plan, DescribeContext. Functions: scanForbidden, checkFileChanges, computePermittedAxioms, frozenSnapshot, evaluateRules, normalisationChanges, planGhostAdoption, lifecycleChanges, describeFinding, attemptNotice.
- packages/core/src/proposal/index.ts (WP1, stubs): diffGraphs, proposalLabel, parseAttemptLines, serializeAttemptLine, summariseAttempts, parseDecisionsFile, serializeDecisionsFile, addDecisions, decisionsInForce
- packages/core/src/index.ts: exports run.ts, gate/, proposal/
- packages/runner/src/shadow/types.ts + index.ts (WP2). ShadowPaths, ShadowCommitKind/PASSING_COMMIT_KINDS, ShadowCommit, CreateShadowOptions, ShadowLayoutError, ShadowWorkspace (baseFiles, currentFiles, changes, syncMirror, writeFiles, commit, commits, lastCommit, filesAt, revertTo), RunDirInfo. rootKeyOf is implemented; createRunShadow, openRunShadow, listRunDirs and pruneRunDirs are stubs.
- packages/runner/src/gate/types.ts + index.ts (WP2). LeanJobSettings, CheckContext, LeanDiagnosticView, CheckReport, FreezeRecord, FreezeOutcome, GateReport, GhostCheckInput/GhostCheck, RenderedStatement, LeanCheckEngine (normalise, check, freeze, gate, checkGhost, renderStatements), createLeanCheckEngine (stub).
- packages/runner/src/run/types.ts + index.ts (WP3). RunSettings, RunServices, RunManagerOptions, RunStartRequest, RunChange, RunManager (current, proposal, onDidChange, start, answer, cancel, resume, accept, feedback, discard, adoptGhost, rejectGhost, dismiss, proposalDiff, recover), PreflightInput/Problem/Outcome, ClaudeBackendSettings, ContextBundleInput, PersistedRun/PersistedGhost, PhenomenaDriftCheck (compile-time). DEFAULT_RUN_SETTINGS is implemented; createRunManager, createClaudeBackend, runPreflight, buildSystemPrompt and buildContextBundle are stubs.
- packages/runner/src/proposal/types.ts + index.ts (WP4): ReadRealText, ProposalBuildInput, AcceptRequest, AcceptPlan, ProposalService (build, baseDrift, planAccept, apply, diffFiles), RunSidecarStore; createProposalService, createRunSidecarStore (stubs)
- packages/runner/src/workspace/types.ts: ExternalChangeSet; optional ModelWorkspace members applyChanges, readText, modelFiles, library, projectModel, reloadAttempts (required after integration)
- packages/runner/src/llm/types.ts + toolSchemas.ts. ProposeAssumptionArgs.proof (required) and lean_name?; Adoption.aloneEntails?; CheckResult.stage/checksLeft/environment?; FreezeResult.permitted?; GateVerdict.environment?; GateCheckId + markup/vocabulary/not_frozen. Shorter tool descriptions; the zod schema drift check still compiles.
- packages/runner/src/index.ts: namespaces shadow, gate, run, proposal

## integration_plan
Plan section 11.
1. Verify owned-path discipline and the section 14 change-log entries; resolve open issues against frozen files.
2. In one change: merge AcceptProposalAction into HistoryActionKind (core actions.ts + webview HISTORY_ACTION_LABEL + runner HISTORY_ACTIONS). Make the ModelWorkspace M2 members required and update the extension's test fakes. Remove every isImplemented skip gate.
3. Typecheck all packages. Run core npm test, runner vitest run (now including WP3's end-to-end tests: both walkthrough readings and every cheating script with the FakeBackend and real Lean), webview unit and extension unit. Re-check WP1's hand facts against real facts of the overlays.
4. Add a new integrator test under packages/runner/test/integration/. It runs on a scratch copy of mental_model/ with a fs-backed ModelWorkspace and git, through the real RunManager (FakeBackend), engine and proposal service:
   - normative Accept, then Undo, Redo and a History revert of the Accept;
   - literal run with ghost adoption, then Accept;
   - a drifted Accept: a user comment edit during the run is rebased and re-gated; an overlapping edit is a conflict;
   - recovery from run.json with a pending question;
   - assert git index, HEAD and status are untouched and no telelean-* unit is left.
5. Run node scripts/walkthrough-claude.mjs --dry-run for both readings.
6. Webview build + Playwright, then extension build + VS Code smoke with a FakeBackend run through the board. One at a time, isolated profiles; check the real home folders afterwards.
7. Rebuild packages/extension/dist (extension bundle, dist/bin guard script, webview). Update docs/user-guide.md, write docs/m2-report.md, and add plan section 15.1 to docs/decisions-log.md.
8. Hand over to the main session for the live walkthrough (plan section 12).

## minor_decisions
- **decision:** The agent's root ws/ holds only model files; Lean builds in a separate build/ mirror synced before every Lean job
  - **rationale:** Grep/Glob search hidden files (m0-report lesson 4); the mirror keeps .lake out of the agent's root without any sandbox or runLean change, and Lean facts are root-relative so paths match
- **decision:** The shadow's git dir lives outside ws/ (git/ with work tree ws/) with an isolated git config
  - **rationale:** no dot-entry in the agent's root; the user's global git config cannot affect telelean's private history
- **decision:** Every model file of the project (all subjects) is copied into the shadow; the context bundle covers only the run's subject
  - **rationale:** cross-subject imports (D-10) must build; Claude can read other subjects' files, which is disclosed in the consent text
- **decision:** 'These suffice' first declares the selected premises (M1's undoable set-premises), then starts the run; 'Self-evident?' declares nothing
  - **rationale:** keeps D-13's meaning of the button; the run's base already contains the declaration
- **decision:** Run targets must be GOAL or DERIVATION cards; a pending derivation's axiom .holds may be replaced by the proof
  - **rationale:** an assumption is held, not proved (make it a Derivation first, D-11); D-11's promotion is exactly 'prove from these'
- **decision:** Caps and gate attempts are per round (first run, each Feedback, each ghost adoption); usage is shown for the whole run
  - **rationale:** each round is user-initiated; a Feedback round should not be starved by the first one
- **decision:** telelean normalises before every gate (lean: pins, derived ids, docstring = the sentence); the agent never edits blocks
  - **rationale:** deterministic D-8/D-9 handling; G5 can then demand that blocks stay byte-identical
- **decision:** G3 also refuses textual changes to declarations that existed before the run (except the target's .holds)
  - **rationale:** cheap stand-in for H's formal immutability; catches 'existing vocabulary turned into a definition', whose footprint passes the permitted set (verified)
- **decision:** Permitted signature = every non-Prop axiom of the project's modules
  - **rationale:** computable from facts (typeSort); new ones must already pass the shape rule before the freeze
- **decision:** Lemmas added in a run may not rest on unselected assumptions either
  - **rationale:** the accepted files should not contain proofs that silently use beliefs the user did not select
- **decision:** propose_assumption carries the gap proof (a term statement -> target) and an optional lean_name; telelean checks it in a scratch module
  - **rationale:** D-6 requires a gate-checked proof that the ghost closes the gap, without writing the ghost into the agent's files
- **decision:** Ghosts can be adopted only in review; adoption starts a new round that begins frozen
  - **rationale:** no mid-turn file changes under Claude; 03: re-freeze only on adoption or Feedback
- **decision:** Environment failures (sandbox, low memory, unsyncable mirror) are not counted as attempts or checks; in the gate they end the run as failed
  - **rationale:** not Claude's fault; retrying would not help
- **decision:** A turn that ends without finish gets one nudge, then ends as no-finish with a revert to the last passing state
  - **rationale:** the CLI has no in-process Stop hook here; bounded and predictable
- **decision:** 'insufficient' and 'inconsistent' are shown as 'not proved' / 'Claude reports a conflict (unverified until M3)'
  - **rationale:** D-6: insufficiency needs a countermodel and consistency needs the model finder (M3)
- **decision:** A not-proved round can still be accepted (its statements and vocabulary)
  - **rationale:** the formalisation is useful on its own; labelled 'These suffice -> not proved'
- **decision:** Every definition question needs an explicit yes before Accept; a no is Feedback
  - **rationale:** A2/D-4: definitions can carry beliefs and are questions for the user, not retries
- **decision:** Accept rebases onto the user's current files with M1's no-fuzz patches, re-freezes and re-gates when files drifted, and refuses overlapping edits
  - **rationale:** D-21 (3-way merge, re-gate, then apply) with the machinery M1's undo already uses
- **decision:** One Accept = one history entry (accept-proposal) and one Undo step, snapshot first
  - **rationale:** A3 and D-21 all-or-nothing; reverting an Accept works like any M1 action
- **decision:** attempts.jsonl and decisions.json are written directly, never undone, not in history snapshots, not gitignored
  - **rationale:** they log what happened and what the user answered; D-12 says committed
- **decision:** Claude's guesses are kept host-side until the user answers
  - **rationale:** D-20: no pre-selected answer, enforced by data flow rather than UI hiding
- **decision:** The system prompt is static and byte-identical across runs; all project data goes into the first user turn
  - **rationale:** prompt caching across runs; the egress is in one inspectable place
- **decision:** Egress consent is asked once per model folder and names exactly what is sent
  - **rationale:** D-23 egress disclosure without nagging on every run
- **decision:** At most one active run per model root; a run continues when its board closes
  - **rationale:** D-25; one Lean job at a time and a simple board model
- **decision:** The CLI is launched under setpriv --pdeathsig KILL
  - **rationale:** M0 open item: a SIGKILLed extension host must not leave a detached CLI running
- **decision:** Run ids double as runLean scope groups
  - **rationale:** Cancel kills every Lean job of a run with one systemctl --user kill
- **decision:** AcceptProposalAction stays a separate type until integration; ModelWorkspace M2 members are optional until integration
  - **rationale:** keeps the webview's exhaustive label table and the M1 test fakes compiling while builders work in parallel
- **decision:** Per-declaration G1 budgets are Lean's default heartbeat limit (unchangeable: G0 forbids set_option), plus 120 s per job and the memory cap
  - **rationale:** 03's 10 s / 1.5 GB per-declaration measurement needs the extractor; deferred to H
- **decision:** The live walkthrough runs from a script with a scripted user (free-text answers per reading, adopt the first gap-closing ghost). It is dry-run by default and live only with --live plus TELELEAN_WALKTHROUGH_LIVE=yes.
  - **rationale:** the main session cannot click in VS Code; a double opt-in keeps any builder or test from spending quota

## major_decisions_needing_user

## real_claude_walkthrough
For the main session only, after integration (plan section 12). No builder or test runs it.

Steps:
0. Preconditions:
   - integration done and all suites green;
   - 'node scripts/walkthrough-claude.mjs --dry-run' passes both readings (FakeBackend, contacts nothing);
   - free -m shows at least 12 GB available and no other heavy process is running.
1. Run 'node scripts/walkthrough-claude.mjs --dry-run --binary-check'. It runs only 'claude --version'. Record:
   - the resolved binary: expected the VS Code Claude Code extension's resources/native-binary/claude, version >= 2.1.295, e.g. 2.1.314;
   - the exact argv: no --bare; --tools Read,Glob,Grep,Edit,Write; --permission-mode dontAsk; --setting-sources=; --strict-mcp-config; setpriv launcher;
   - the sanitised environment names (CLAUDE*/ANTHROPIC_* stripped; ENABLE_TOOL_SEARCH=false);
   - the system prompt (plan 5.1).
2. Announce the quota use to the user before any live call (numbers below).
3. Normative reading:
   TELELEAN_WALKTHROUGH_LIVE=yes node scripts/walkthrough-claude.mjs --live --reading normative --model claude-opus-5-5 --effort high --work-dir /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/<turn>/m2-walkthrough
   Default caps: 80 turns, 25 checks, 20 min agent-active, 120 s per Lean job, 3 gate attempts.
   The script copies mental_model/ to a scratch git repo, refreshes Lean once, and starts 'These suffice' {cynder-dark-past, new-spyro-pg, pg-no-dark-past} ⊢ cynder-not-good. It answers the modality question with free text ('I mean it as a rule: PG games should not include characters with dark pasts. I do not mean it is impossible for a PG game to contain one.') and any other question with Decide for me.
   Pass:
   - subscription auth and the hook listing are verified before the first prompt;
   - freeze succeeds; the gate passes with verdict proved in <= 3 attempts;
   - lifecycle G->D is offered and applied on Accept;
   - after Accept the copy's refresh shows cynder-not-good proved in the Derivations column, footprint = the three premises + characters exist + games exist.
4. Literal reading: the same command with --reading literal. The answer is 'I mean it literally: a PG game cannot contain a character with a dark past at all.'
   Pass:
   - round 1 verdict not-proved with at least one ghost that closes the gap (gate-checked);
   - the script adopts it; telelean re-freezes; round 2 is proved;
   - Accept writes the adopted card with worded_by: agent; the copy refreshes to proved.
5. Failures: record and analyse the transcript. At most one retry per reading. A different but faithful formalisation is acceptable. A cheat caught by the gate (notice + retry) is a pass of the gate, not of the walkthrough. Never loop, and stop at any rate-limit warning event.
6. Record per reading, and save into the prompt log's bundle as the walkthrough report:
   - summary.json: verdict per round, gate attempts with findings, board notices, questions asked and answers given, ghosts, flagged definitions, the final diff of the copy, final statuses;
   - session/transcript.jsonl (exact user turns and events) and the guard log (any denials);
   - usage: requests; input, output, cache-read and cache-write tokens; the CLI's cost estimate; rate-limit events;
   - wall time and agent-active time; CLI version and model.
7. Optional, with the user: the same flow in a VS Code Extension Development Host on a copy of mental_model/, pressing These suffice on the board.

Quota estimate (not a measurement):
- requests: normative about 10-20; literal about 20-35 over its two rounds;
- tokens, both readings together: about 0.5-1.5 M cache-read, 50-150 k cache-write, a few thousand uncached input, 20-60 k output at effort high;
- wall time: 5-15 minutes per reading;
- the CLI reports its own cost estimate at API list prices (for comparison, M0's smoke was 8 Haiku requests for $0.003). The subscription is not billed per token, but this is ordinary quota use, so it is announced first.

## effects_outside_repo
- Scratch dir /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/m2-architect/ (1.9 MB):
- lit/, defcheat/, vocabcheat/: copies of test-fixtures/spyro, each with a .lake build. Built unsandboxed with the toolchain's own lake and lean, on text I wrote: the literal reading + ghost, and the two definition cheats.
- vt/: scratch vitest config + protocol test.
- tmp/: TELELEAN_TEST_TMP of the runner suite run.
- runner-tests.log.
- ~/.npm/_logs: each npx/npm invocation (npx tsc, npx vitest, npm test) wrote a small debug log, about 20 files of about 1 KB. With npm's default logs-max of 10, npm itself rotated out older debug logs there. I did not change any npm setting.
- systemd --user transient scopes telelean-<runId>-<n>: created and removed by runLean during the existing runner suite; none left (checked with systemctl --user list-units 'telelean-*' --all).
- ~/.elan/known-projects unchanged: 37 lines before and after (toolchain binaries used directly, never elan proxies).
- Inside the repo but outside my owned paths: running the existing suites updated vitest result caches in packages/{core,runner,webview}/node_modules/.vite/vitest/*/results.json and packages/extension/out/.vite/vitest/*/results.json.
- Nothing else: no network access, downloads, npm installs, git commands, Claude CLI runs, or VS Code/Chrome launches, and no changes to ~/.config, ~/.claude, ~/.elan, VS Code settings/extensions or ~/telelean_scripts.

