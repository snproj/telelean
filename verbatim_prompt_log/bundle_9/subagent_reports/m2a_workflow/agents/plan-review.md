# plan:review (agent a42e4581d30e942bc)

## plan_path
/home/zhengyew/telelean/docs/m2-plan.md

## summary
I reviewed the M2 plan and its contracts against the M2 scope, 03 section 8, amendments A1 and A2, the M0 facts, the Prototype profile and the M1 code. I fixed the problems I found directly in /home/zhengyew/telelean/docs/m2-plan.md and in the contract files. Section 0.1 of the plan lists every correction; section 14 logs every contract change.

The scope was complete: all 23 items, both walkthrough readings and the 3 carry-overs were mapped. The problems were in the gate's soundness, quota safety, parallel building and a few acceptance tests that could not be tested.

**Gate holes closed. Before the fixes, each of these could make the board show something false:**
- **Lemmas in a "not proved" round.** `footprint` only ran for `proved`. A round that finished `not_proved` could carry a lemma, or a proof of the target, resting on an unselected assumption into the user's files on Accept. Now `footprint` also runs for `gate-other`, and a new code `status-mismatch` refuses a `not_proved` finish while the files still hold a new proof of the target.
- **Re-pointed target.** G5 allowed `lean:` changes on the target. Claude could point a formalised goal at a new weaker abbrev, freeze that, and pass G4. Now `lean:` lines are only added, by normalisation, and no card formalised before the run can be re-bound. No unselected card may be formalised either.
- **Pending promotion.** `statement-changed` would always fail a pending-promotion target; the target's `.holds` is now exempt. A selected derivation resting on the target's own claimed `.holds` is now unusable (circular).
- **Ghost text injection** (shown with Lean in my scratch copy, fact 8). A crafted `lean_statement` made the unpinned check file error-free with no axioms, so a ghost would show "closes the gap" when nothing about the target was checked. Fixes: a single-term rule (new core stub `ghostTextProblems`), a pinned `abbrev telelean_ghost_stmt` check (fact 7, verified to build) that must have no errors, and adoption writes exactly the checked text.
- **Edits after finish.** Claude could edit files after `finish` passed and before its turn ended, and those edits would enter the proposal unchecked. Now ws/ is reset to the judged files at the turn's end.
- **Revert without normalisation.** A revert to a `freeze` commit lost pins and docstrings; telelean now normalises after every revert.
- **Accept after drift.** The re-check used the old base, so the user's own edits during the run would have been judged as Claude's. Now B is the user's files at Accept (an `accept-base` commit). The freeze copy drops the target's `.holds` and everything that uses it, and drift includes files the user added or deleted.
- **G0 judging the user's lines.** G0 scanned whole files, so a user's own `set_option … in` or `#eval` line would fail every attempt in a file Claude edited. Now only Claude's lines are judged, and a stray non-Lean file is a `bad-path` finding instead of an environment failure.
- **Meaning drift and broken bases.** A new base check builds the user's files before any prompt. Lean errors end the run before Claude is contacted (it could never pass G1 on them). The base facts let `existing-changed` compare the user's declarations by meaning (catching an `open … in`) and by docstring.

**Quota safety.**
- `TELELEAN_NO_REAL_CLAUDE=1` is now set in `packages/runner/vitest.config.ts`. Once WP3 implements the checks, `createClaudeBackend` and `ClaudeCliBackend.startSession` refuse to start real Claude under it (M0's node test double still runs).
- In Test mode the extension refuses real Claude unless a fake backend is injected.
- The backend is created lazily through a factory at the first start, so opening a board never runs a Claude binary.
- `createClaudeBackend` gets test hooks so tests never scan the real PATH or home.
- The premises declaration moved into `RunManager.start`, after preflight and backend, so a refused start changes nothing.

**Parallel building.**
- The engine, RunManager, proposal service and sidecar store take `core` test hooks (as M1's workspace did), so each work package can test against fakes.
- Acceptance tests that need another package are marked [gated] and run by the integrator.
- The exact singular texts of carry-over 2 are frozen in section 1.3 because the webview's tests assert core's texts.
- The cheating scripts' retries now replace the cheat instead of adding a second theorem. Two cheating scripts were added: `rebind-target` and `lemma-not-proved`.
- Several acceptance tests were made testable: cancel and job timeout use a slow fixture, FakeBackend gets a `usage` step for the turn cap, and the merge-context rule is spelled out.

**Smaller fixes.**
- The cost estimate is the latest `result`'s value, never summed (the CLI already reports it for the whole conversation across `--resume`).
- A cap reached during a tool call takes effect when the call returns.
- An environment failure in the gate is retried once after 30 s.
- The readiness rules no longer apply to `not_proved`, so an honest "could not formalise" can end cleanly.
- The system prompt no longer forbids vocabulary axioms by mistake.
- The CLI's own session files under `~/.claude/projects/` are listed as an effect of the live walkthrough.

**Verification (after the final contract changes):**
- `tsc --noEmit` is clean for core and runner (test configs), webview (both configs) and extension.
- Core `npm test`: 351/351 passed.
- Runner `vitest run`: 285/285 passed (127 s, real Lean). No `telelean-*` unit was left, and `~/.elan/known-projects` stayed at 37 lines.

The main session needs no new decisions; I added 13 minor ones to section 15.1 for the user to review later.

## work_packages
- **id:** WP1
  - **title:** core: gate rules, proposal helpers, sidecar codecs, M1 carry-overs
  - **owned_paths:** ["packages/core/src/gate/**", "packages/core/src/proposal/**", "packages/core/src/project/**", "packages/core/src/edit/**", "packages/core/src/kindChange.ts", "packages/core/test/{gate,proposal,carryover}/**", "packages/core/test/{project,edit}/**", "packages/core/test/protocol.m2.test.ts", "packages/core/test/fixtures/{gate,proposal,carryover}/**"]
  - **brief:** Implement every stub of packages/core/src/gate/index.ts and packages/core/src/proposal/index.ts exactly as documented (plan sections 3 and 7; types in gate/types.ts and run.ts). Pure TypeScript, no Node typings; tests read fixtures with ?raw.

G0:
- scanForbidden: the token lists of plan 3.1, lexLean tokens only. Use the new baseText parameter: a token on a line whose exact text also occurs in B's version of the file is the user's and is not reported (line multiset).
- checkFileChanges: current holds every regular file, so a non-Lean file is bad-path.
- New ghostTextProblems: the single-term rule of plan 3.8.

Permitted set: computePermittedAxioms and frozenSnapshot per plan 3.2. A selected derivation resting on the target's own claimed .holds is unusable, and the target's .holds is never permitted.

evaluateRules, with the corrected table of plan 3.3:
- footprint also in gate-other (the round's freeze, else computePermittedAxioms(current));
- new status-mismatch;
- markup: lean: lines only ever added, by normalisation, on cards that were code-less in B; no card formalised in B re-bound; no unselected card newly formalised; ghost blocks equal their text in RuleInput.adopted;
- statement-changed exempts T's .holds;
- existing-changed: removed declarations count as changed, docstrings are compared, and so are facts type/value when base has facts;
- readiness rules (not-formalised, missing-holds) only for freeze and gate-proved.
RuleInput.base is exactly the user's files (base or accept-base commit); adopted is the newest adopt commit's model.

Also: normalisationChanges; planGhostAdoption (whitespace-collapsed checked statement; refuse when ghostTextProblems or scanForbidden finds anything); lifecycleChanges; describeFinding and attemptNotice (plan 3.5 sentences, including the status-mismatch and re-pointed-pin ones); diffGraphs, proposalLabel and the attempts/decisions codecs.

Carry-overs:
- (1) subjectGraph fills LeanBinding.externalUsers.
- (2) singular/plural with exactly the texts frozen in plan 1.3.
- (3) planKindChange refuses with needs-confirmation listing all dependents when confirmedDependents does not cover them.

Copy /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/m2-architect/vt/protocol-m2.test.ts to packages/core/test/protocol.m2.test.ts. Record any additive contract change in plan section 14.
  - **acceptance_tests:** ["AT1.1 G0 tokens: each denylisted token in changed text is a finding with code and range. The same words in comments, strings, docstrings and telelean blocks are not. #check/#print allowed; 'decide +native' and 'set_option maxHeartbeats 0 in' flagged; 'import Lean' flagged, 'import Model.Spyro.Lemmas' allowed when in projectModules. With baseText: a user's own 'set_option maxHeartbeats 400000 in' line (and a user's #eval line) in a file Claude edited is not reported; a second copy of that line added by Claude is.", "AT1.2 file rules: lakefile/toolchain/manifest change -> project-file; another subject's file or Model.lean -> outside-subject; deletion -> deleted-file; 'Model/Spyro/my file.lean' and 'Model/Spyro/notes.md' -> bad-path; unchanged files never scanned", "AT1.2b ghostTextProblems: the literal ghost of plan 10.2 (statement and proof) -> none. 'True) → True := fun _ => trivial⏎axiom evil : False⏎example : (True' -> problems (':=' outside brackets, unbalanced brackets, axiom, example). A statement with '-/', with #eval, with sorry, or empty -> problems; a proof containing 'theorem' -> a problem.", "AT1.3 permitted set on Spyro proved-overlay facts: all three selected -> the 13 names of plan 3.2; new-spyro-pg unselected removes its .holds; a selected proved derivation adds its footprint; an unproved selected goal -> unusable; a selected derivation whose footprint contains the target's claimed .holds -> unusable, and the target's .holds is never in the set; zero premises -> STD + signature + target presuppositions", "AT1.4 evaluateRules: a positive and a negative case for every code of plan 3.3, including: existing-changed for vocabulary axiom -> def, for a removed declaration, for a changed docstring, and from facts (text unchanged but value changed by an 'open … in'; silent without base facts); T's .holds axiom -> theorem allowed after the freeze too; status-mismatch for gate-other with a new theorem T.holds; footprint in gate-other for a lemma using an unselected .holds, with and without a freeze; markup for a changed lean: pin on T, a B-formalised target re-bound by adjacency, a newly formalised unselected card, and an edited adopted-ghost block; readiness codes absent in gate-other. Flagged definitions (statement-closure def flagged, proof-only def not, new presupposition flagged) and the declarations diff.", "AT1.5 normalisationChanges: pin + derived id + docstring for a newly formalised code-less block; idempotent; bytes outside the edits unchanged; nodes not new -> no change", "AT1.6 planGhostAdoption: the inserted text parses to a new ASSUMPTION (worded_by agent, origin agent, session), pinned, docstring = sentence, statement = the collapsed checked text; taken or keyword lean_name -> derived name; comment delimiters refused; the injected statement of AT1.2b refused (invalid)", "AT1.7 lifecycleChanges: G->D changes only type:; a target no longer proved -> unsafe", "AT1.8 describeFinding/attemptNotice produce the A2 sentences of plan 3.5, singular/plural, including the give-up sentence", "AT1.9 diffGraphs: added/changed (with fields)/removed nodes, vocabulary, edges, counts", "AT1.10 codecs: attempts round trip, bad/unknown lines skipped, summariseAttempts newest first with latest resolution; decisions add/replace; decisionsInForce scopes (run never, nodes when meeting, subject always)", "AT1.11 carry-over 1: a lemma without a card and another subject's card using a .holds are both in externalUsers; absent when none", "AT1.12 carry-over 2: texts for 1 and 2 dependents in both impact kinds, the singular ones exactly as frozen in plan 1.3", "AT1.13 carry-over 3: confirmed set not covering the actual dependents -> needs-confirmation listing all; covering -> applies", "AT1.14 the copied protocol.m2 test and core npm test pass"]
- **id:** WP2
  - **title:** runner: shadow workspace and the Lean check engine (gate executor)
  - **owned_paths:** ["packages/runner/src/shadow/**", "packages/runner/src/gate/**", "packages/runner/src/lean/**", "packages/runner/src/semantic/**", "packages/runner/test/shadow/**", "packages/runner/test/gate/**", "packages/runner/test/lean/**", "packages/runner/test/semantic/**", "test-fixtures/gate/**"]
  - **brief:** Implement packages/runner/src/shadow/index.ts (plan 4.2) and createLeanCheckEngine (plan sections 3, 4.3 and 7.1; contracts in gate/types.ts and shadow/types.ts), reusing M0/M1 code.

Shadow layout:
- ws/: only model/project files, no dot-entry. currentFiles() returns every regular file, so a stray notes.md is G0's bad-path; only symlinks, special files and dot-entries throw ShadowLayoutError.
- build/: the mirror, seeded from .lake/build when present. syncMirror copies only model files, keeps mtimes and mirrors deletions.
- git/: isolated config.
- session/, frozen/, gate/ and scratch/ live outside ws/.
- pruneRunDirs keeps 10.
- Commit kinds include accept-base. revertTo is a no-op when ws/ already equals the target.

Engine:
- New checkBase: build the base commit before any prompt (no G0). Lean errors -> problems naming file:line. Keep the facts in the run dir as B's facts.
- check: G0 via core checkFileChanges first; only if clean, sync and refresh on build/; then buildProjectModel + evaluateRules. B comes from ctx.baseCommit (default base) with B's facts; RuleInput.adopted comes from the newest adopt commit.
- freeze: readiness, commit freeze, computePermittedAxioms, lean.freezeChallenge on a copy of build/. Add an additive FreezeOptions.removeDecls that drops the target's .holds and its transitive users (from facts refs) from the copy.
- gate: G0, G1, G3, G5, then G4 for proved only. It judges one committed state and returns it as GateReport.commit.
- checkGhost: ghostTextProblems first (no Lean); then a clean check of ws/; then the pinned scratch file 'abbrev telelean_ghost_stmt : Prop := <stmt>' + 'theorem telelean_ghost_check : telelean_ghost_stmt → T := <proof>'. Any error refuses. Axioms are read from the message naming telelean_ghost_check; return the collapsed statement.
- renderStatements.
- Every Lean job runs through semantic.runExclusive and runLean with the run id as scope group.
- Outcome mapping: timeout/oom -> budget; could-not-start/low-memory/cancelled/unsyncable -> environment.

Read core through options.core (EngineCore) so tests can use fakes. Tests needing WP1's real rules are [gated] (describe.skipIf(!isImplemented(...))). Cheating fixtures live in test-fixtures/gate/, inert *.lean.txt where they hold forbidden commands. Check free -m first.
  - **acceptance_tests:** ["AT2.1 layout: ws/ holds exactly the model/project files with no dot-entry at any depth; build/.lake/build seeded; base commit; run and session dirs outside ws/; a symlink in the source or .lake/build refuses the shadow, leaving nothing behind", "AT2.2 the M0 decide() guard passes Grep/Glob on the ws/ root and denies Read of build/ and git/ paths", "AT2.3 syncMirror incremental (second build recompiles 0 modules), deletions mirrored, a symlink or .hidden file in ws/ -> ShadowLayoutError and no sync; a Model/Spyro/notes.md is returned by currentFiles() and never copied to build/", "AT2.4 commit/commits/lastCommit/filesAt/changes/revertTo (no commit when already equal)/writeFiles (before check); accept-base is not a passing kind", "AT2.5 listRunDirs/pruneRunDirs keep the newest 10 and never delete non-terminal or protected runs", "AT2.6 [gated: WP1 rules] check on Spyro normative formalised (real Lean): ok + footprints. A G0 finding starts no Lean process (runs now with a fake checkFileChanges via options.core). A job timeout on the slow fixture -> budget (counted).", "AT2.7 [gated: WP1 rules] freeze refused for an unformalised selected assumption, a proof before the freeze, a shape violation, a G5 change; succeeds otherwise with permitted = AT1.3's set; frozen.ndjson exists. With a target .holds already in ws/ the freeze copy lacks it and the challenge builds; with a pending-promotion target whose claimed .holds another proof uses, the copy lacks both and the challenge builds.", "AT2.8 [gated: WP1 rules] gate (real Lean), one case per line:\n- honest normative proof -> passed;\n- literal + adopted ghost proof -> passed;\n- axiom shortcut -> new-axiom;\n- := sorry -> G0 sorry, no Lean started;\n- weakened abbrev -> existing-changed;\n- weakened theorem type -> not-proved;\n- unselected new-spyro-pg -> footprint;\n- new def InGame in the closure -> passed with a flagged definition;\n- existing GoodAddition turned into a def -> existing-changed;\n- edited natural_name -> markup;\n- #eval -> G0, no Lean started;\n- target pin re-pointed to a new 'abbrev cynder_not_good_weak : Prop := True' -> markup, freeze refused;\n- finish not_proved with the proof still present -> status-mismatch;\n- finish not_proved with a lemma using unselected new_spyro_pg.holds -> footprint;\n- stray notes.md -> G0 bad-path, counted.\nA pure test maps every ComparatorVerdict reason.", "AT2.9 [gated: WP1 rules] checkGhost: the literal ghost -> ok with fact 7's footprint, aloneEntails false, statement collapsed. '¬ GoodAddition cynder newSpyro' with proof 'fun h => h' -> ok, aloneEntails true. A proof using an unselected .holds -> problems. Before the freeze -> refused. A forbidden token -> refused without Lean. Fact 8's injected statement -> refused without Lean; with a permissive fake ghostTextProblems it is refused because the scratch file has errors.", "AT2.10 renderStatements: pretty and explicit forms of pg_no_dark_past (explicit contains 'Not (')", "AT2.11 lean.cancelRun(runId) while a check builds the slow fixture (cancel on the onPhase('build') hook) -> environment outcome, no leftover telelean unit", "AT2.12 injected low MemAvailable -> environment, nothing spawned", "AT2.13 [gated: WP1 normalisationChanges] normalise writes pins and docstrings, commits 'normalise', idempotent", "AT2.14 the existing M0/M1 lean and semantic suites still pass", "AT2.15 B and A: with baseCommit = an accept-base commit holding user edits, the rules see neither edit as changed [gated: WP1]. RuleInput.adopted = the newest adopt commit's model (fake evaluateRules; runs now).", "AT2.16 checkBase (real Lean): the Spyro copy -> ok, facts kept and read back by a second engine on the same run dir; a Lean error in another subject's module -> problems naming file and line; no G0 scan of the base"]
- **id:** WP3
  - **title:** runner: run controller, tool host, prompts, Claude backend factory, persistence, FakeBackend scripts, walkthrough script
  - **owned_paths:** ["packages/runner/src/run/**", "packages/runner/src/llm/**", "packages/runner/bin/**", "packages/runner/test/run/**", "packages/runner/test/llm/**", "test-fixtures/walkthrough/**", "scripts/walkthrough-claude.mjs"]
  - **brief:** Implement packages/runner/src/run/index.ts per plan sections 2, 3.7, 4, 5 and 7.1 (contracts in run/types.ts).

RunManager (all services injected; RunServices.core test hook for WP1's functions):
- start: preflight -> backend (RunServices.backend may be a factory, called once, running only claude --version) -> set-premises via workspace.perform when non-empty and changed -> shadow -> engine.checkBase (Lean errors -> failed, nothing sent) -> session -> context bundle. A refusal at any step changes nothing.
- The state machine of plan 2 with per-round caps. A cap hit during a tool call takes effect when the call returns.
- The gate loop: retry with exact failures; give up at maxGateAttempts. gate-pass = the judged commit (GateReport.commit). At the turn's end ws/ is reset to the gate-pass files (edits after finish discarded, info notice). Give-up, no-finish and caps: revert to the last passing commit -> normalise -> re-check -> proposal.
- An environment outcome in the gate is retried once after 30 s, then the run fails.
- A nudge when a turn ends without finish.
- Cancel via interrupt + lean.cancelRun(runId).
- Feedback and ghost-adoption rounds.
- Accept (plan 7.1). With drift: accept-base commit, rebase commit, then normalise/freeze/gate with baseCommit = accept-base and roundStartCommit = rebase. A failure restores ws/; a pass is applied via planAccept with shownState.
- attempts.jsonl and decisions.json via RunSidecarStore; transcript.jsonl; atomic run.json.
- recover(): the newest non-terminal run comes back, older ones become failed; never resumes a session by itself.
- Cost estimate = the latest result's value, never summed across --resume.

RunToolHost per plan 4.3. Claude's guesses never reach RunView before the answer. MCP tools declare no readOnlyHint. Renderings: renderFreezeResult lists the permitted axioms; renderAdoption shows aloneEntails; renderGateVerdict says an environment give-up is not Claude's fault.

runPreflight per plan 4.1.

createClaudeBackend: M0 resolveClaudeBinary with extensionDirs and the new settings.resolve test hooks (home/pathEnv/env/runVersion); ClaudeCliBackend with an explicit guardScriptPath and the absolute-path setpriv --pdeathsig KILL launcher.

Quota tripwire (plan 10.4):
- with TELELEAN_NO_REAL_CLAUDE=1 (already set in packages/runner/vitest.config.ts), createClaudeBackend throws before resolving anything unless settings.resolve is given;
- ClaudeCliBackend.startSession refuses to spawn unless its launcher is process.execPath (M0's node double).

Prompts: buildSystemPrompt returns plan 5.1 verbatim (the corrected text); buildContextBundle follows plan 5.2; later turns per plan 5.3.

FakeBackend:
- add steps emitting usage and rate_limit events;
- write the scripts of plan 10.2 and 10.3 as data in test-fixtures/walkthrough/; retries replace the cheat; includes rebind-target and lemma-not-proved;
- write the end-to-end tests [gated].

scripts/walkthrough-claude.mjs (plan 12.1):
- esbuild bundle into its work dir;
- dry run by default (sets TELELEAN_NO_REAL_CLAUDE=1 for itself);
- --binary-check: llm.resolveClaudeBinary + ClaudeCliBackend.prepare, never startSession;
- live only with --live AND TELELEAN_WALKTHROUGH_LIVE=yes; stops at a rate_limit status that is not 'allowed'.
Builders run only --dry-run. Never spawn a real Claude CLI in any test.
  - **acceptance_tests:** ["AT3.1 happy path with fakes (engine/proposals/sidecars/core) + FakeBackend: start -> working -> ask_user -> waiting-for-answer (clock paused) -> answer (decision recorded, guess revealed) -> freeze -> finish -> gate pass -> review with proposal. Change events in order; run.json at each step; usage summed from usage events; cost = latest result (0.01 then 0.03 -> 0.03, also across a resumed session).", "AT3.2 gate loop: failures at attempts 1 and 2 then a pass -> two gate-failed notices (fake core texts), exact failures in the tool results, verdict proved. Three failures -> give_up, revert to the freeze commit, normalise, re-check, proposal with verdict gave-up, notices gave-up + reverted. [gated: WP1] the real attemptNotice sentences of plan 3.5.", "AT3.2b edits after finish returned accept -> at the turn's end ws/ equals the gate-pass commit, info notice, and the proposal comes from the gate-pass files", "AT3.3 environment outcome in the gate -> retried once after 30 s (fake timers), not counted. A second one -> run failed with an environment notice; an environment outcome then a pass -> review, proved.", "AT3.4 caps: the 26th check gets a tool error. maxTurns via usage events -> interrupt -> cap-reached. maxAgentMs under fake timers (paused while waiting for an answer) -> cap-reached. A time cap during the fake gate -> its pass is honoured. Counters reset on Feedback.", "AT3.5 a turn without finish: one nudge, then no-finish (revert, normalise, re-check)", "AT3.6 cancel during a check calls lean.cancelRun with the run id, closes the session, state cancelled, attempt recorded", "AT3.7 recovery: manager B's recover() shows manager A's pending question with no session started; answering resumes with resumeSessionId and renderAnswersAsUserTurn; the run finishes. With two non-terminal run dirs the newer comes back and the older becomes failed.", "AT3.8 Feedback round: finish(proved) without a new freeze -> not-frozen; after a freeze it passes; the earlier proof does not trigger proof-before-freeze", "AT3.9 propose_assumption -> GhostView with the engine's checked statement. adoptGhost in review -> adoption written (fake planGhostAdoption via core), commit adopt, freeze with adoptedGhosts, round 2 in stage prove, adoption turn naming the Lean name. A refused re-freeze reverts and stays in review.", "AT3.10 Accept orchestration: no drift -> plan + apply. Drift -> accept-base and rebase commits; normalise/freeze/gate with baseCommit = accept-base and roundStartCommit = rebase; planAccept with shownState; apply. A failed re-gate is refused with described findings and ws/ restored. A missing definition approval -> invalid.", "AT3.11 preflight refusals (toolchain, sandbox, memory, selection incl. an ASSUMPTION target, busy) create nothing, never call workspace.perform or the backend factory. A rejecting factory -> not-yet, nothing created or declared. New premises -> set-premises after the backend and before the shadow; unchanged -> skipped; a refused set-premises -> start refused. A fake checkBase with problems -> failed with the errors, startSession never called.", "AT3.12 buildSystemPrompt equals plan 5.1 (fixture copy); the context bundle quotes cards verbatim with vocabulary and decisions in force; neighbourhood scope omits unrelated cards", "AT3.13 createClaudeBackend with fake binaries and settings.resolve: resolution order, version floor, absolute setpriv launcher, explicit guard path; only --version of the fakes runs. Tripwire: under TELELEAN_NO_REAL_CLAUDE=1 without resolve it throws before listing candidates. startSession with a non-node launcher throws before spawn (spawn spy); the M0 double with process.execPath still runs.", "AT3.14 [gated: WP1, WP2, WP4] walkthrough end to end (FakeBackend + real engine/proposals + fs-backed ModelWorkspace on a scratch git copy of mental_model/):\n(a) normative -> proved -> G->D -> Accept. Files gain the pinned formalisation, the proof and 'type: DERIVATION'. Real model files are untouched before Accept. One history entry; Undo restores; attempts.jsonl says accepted.\n(b) literal -> not proved + ghost -> adopt -> re-freeze -> proved -> Accept; the adopted card has worded_by agent.", "AT3.15 [gated: WP1, WP2, WP4] each cheating script of plan 10.3 shows its notice and the scripted retry (replacing the cheat) passes; the give-up script reverts", "AT3.16 [gated: WP1, WP2, WP4; run by the integrator] 'node scripts/walkthrough-claude.mjs --dry-run' completes both readings with the FakeBackend under its own TELELEAN_NO_REAL_CLAUDE=1. --live without the env flag, or the flag without --live, refuses before resolving any binary (this part runs now)."]
- **id:** WP4
  - **title:** runner: proposals, Accept (rebase + apply through M1 history/undo), workspace M2 members, sidecar store
  - **owned_paths:** ["packages/runner/src/proposal/**", "packages/runner/src/workspace/**", "packages/runner/test/proposal/**", "packages/runner/test/workspace/**"]
  - **brief:** Implement packages/runner/src/proposal/index.ts per plan 4.5 and 7 (contracts in proposal/types.ts). Read core through createProposalService({ core }) (ProposalCore) and createRunSidecarStore({ core }) (SidecarCore) so the service and the store are tested with fakes while WP1's helpers are stubs. Tests needing WP1's real diff, label, lifecycle or codecs are [gated].

build:
- the proposed subject graph: core buildProjectModel over ws/ + the mirror's facts -> subjectGraph;
- diffGraphs against the current board; changed files with line counts (diff 9.0.0);
- StatementReview for each statement new or changed vs B (adopted ghosts included, wordedBy agent); VocabularyReview;
- DefinitionQuestion d<n>; LifecycleItem l1 (G->D, recommended) for a proved GOAL;
- ghosts; the report card; baseChanged; empty.

baseDrift(shadow, readReal, realFiles?): changed real files plus files the user added or deleted.

planAccept: apply the base->shown patch to the real text with no fuzz (structuredPatch's 3 context lines: a user edit within 3 lines of Claude's change is a conflict naming the file). Files only the user changed keep their text. Then the ticked lifecycle items via core lifecycleChanges. Return shadowState (merged, without lifecycle). With AcceptRequest.shownState (after a passing re-gate): changes = real -> shownState plus lifecycle, no patching.

apply: ModelWorkspace.applyChanges. diffFiles gives base -> shown.

In the real ModelWorkspace implement the optional M2 members:
- applyChanges via the existing applyRecorded path: 'Manual edits'/'Initial state' snapshots first, EditApplier, one undo entry, action snapshot with history kind accept-proposal (add it to HISTORY_ACTIONS, typed HistoryActionKind | AcceptProposalAction until the integrator merges), re-read, graph.json, refresh;
- readText, modelFiles, library, projectModel, reloadAttempts; graph(subject).attempts via core summariseAttempts.

RunSidecarStore: attempts.jsonl append-only (O_APPEND); decisions.json via an atomic temp file inside .telelean/; neither file is in history snapshots or undo.
  - **acceptance_tests:** ["AT4.1 normative proved state (facts from M1's real refresh of a scratch copy with the reading-A edits) -> proposal:\n- target proved in the graph;\n- diff: pg-no-dark-past changed (statement, binding), target changed (proof, status) [gated: WP1 diffGraphs; the rest runs now with a fake];\n- files summary;\n- one StatementReview (sentence, pretty, explicit, closure);\n- lifecycle l1 G->D recommended;\n- report footprint = the three cards + two presuppositions; consistency unchecked.", "AT4.2 literal not-proved state -> VocabularyReview lists InGame, the ghost is listed, verdict not-proved, no lifecycle item", "AT4.3 definition cheat -> definitions lists Spyro.InGame with code and usedByStatementsOf", "AT4.4 baseDrift: untouched -> nothing; an edited real file (fake TextSource) is reported; a model file the user added (in realFiles) and one they deleted are reported", "AT4.5 planAccept:\n- no drift -> before = real, after = shown (+ 'type: DERIVATION' when ticked, [gated: WP1 lifecycleChanges]);\n- drift more than 3 lines from Claude's changes -> merged;\n- drift within 3 lines or overlapping -> conflict naming the file;\n- unknown lifecycle id -> not-found;\n- with shownState -> after = exactly those files (+ lifecycle), before = real.", "AT4.6 apply on a real ModelWorkspace (fs adapters, scratch git repo): 'Manual edits' snapshot first; one history entry with the label (fake proposalLabel now, real [gated: WP1]); one Undo restores every file; refresh requested; git index, HEAD and status untouched", "AT4.7 workspace M2 members; graph.attempts newest first with resolutions", "AT4.8 sidecar store (fake codecs now, real [gated: WP1]): concurrent appends never interleave; resolutions; decisions atomic; neither file in history snapshots or undo", "AT4.9 diffFiles gives base -> shown changes for the raw diff", "AT4.10 the M1 workspace suite still passes"]
- **id:** WP5
  - **title:** VS Code extension host: run wiring, consent, settings, lazy backend, Test-mode quota guard, raw diff, bundling, carry-over 3 host side
  - **owned_paths:** ["packages/extension/src/**", "packages/extension/test/**", "packages/extension/scripts/**", "packages/extension/package.json", "packages/extension/tsconfig.json", "packages/extension/vitest.config.mts", "packages/extension/.vscode-test.mjs", "packages/extension/dist/extension.js", "packages/extension/dist/extension.js.map", "packages/extension/dist/bin/**", "packages/extension/out/**"]
  - **brief:** Implement plan section 8.

Run wiring:
- one RunManager per model root, created with the root's ModelWorkspace, recover() once, disposed with it;
- route core RUN_MESSAGE_TYPES in arrival order; post 'run'/'proposal' on change and on 'ready' (including another subject's run);
- startRun = egress consent once per root (globalState, exact text of plan 8.2) -> runManager.start({ subject, target, premises }). The RunManager runs preflight and declares the premises itself; the extension never calls perform for it. Busy -> conflict.

openProposalDiff: vscode.changes on a read-only telelean-proposal: provider beside the board.

Settings: telelean.model, effort, claude.path, run.* (plan 8.3).

Backend:
- RunServices.backend is a factory, called by the RunManager at the first start that passes preflight, never at workspace creation;
- the factory calls run.createClaudeBackend with guardScriptPath = <extensionPath>/dist/bin/telelean-path-guard.mjs, llm.defaultHookRuntime(), clientApp telelean/<version>, pdeathsig true;
- extensionDirs puts the dirname of getExtension('anthropic.claude-code')?.extensionPath first;
- runsDir = globalStorageUri/runs.

Quota guard:
- in ExtensionMode.Test the default factory rejects with 'real Claude is disabled in Test mode' and createClaudeBackend is never called; only testing.useRunBackend(factory) supplies a backend;
- set TELELEAN_NO_REAL_CLAUDE=1 in the extension's vitest config and .vscode-test.mjs env.

Bundling:
- bundle the runner's llm/run/gate/shadow/proposal;
- replace the M1 'no llm/' check with: the guard script is copied to dist/bin/ and the bundle loads;
- esbuild define/banner for import.meta.url; always pass guardScriptPath.

Carry-over 3: map kindChange.confirmedDependents into the change-kind action.

Do not run the webview build. The VS Code smoke needs the real runner: write it now, [gated], run by the integrator (isolated profile, xvfb, ulimit -c 0).
  - **acceptance_tests:** ["AT5.1 routing (unit, fake RunManager): every run message reaches the right method with the board's subject; outcomes become actionResult; run/proposal posted on change and on ready, including another subject's run", "AT5.2 startRun: consent asked once per root and remembered; declined -> nothing called; then runManager.start with subject, target and premises, never perform; busy -> conflict", "AT5.3 settings defaults and bounds (plan 8.3) read, and contributed in package.json", "AT5.4 guard script in dist/bin after the build. The production factory passes it to createClaudeBackend (fake) and runs only at a start. Test mode without useRunBackend -> start refused with 'real Claude is disabled in Test mode', createClaudeBackend never called. Test mode with useRunBackend -> the injected FakeBackend.", "AT5.5 bundle contains llm/run/gate/shadow/proposal and loads in Node with the vscode stub without an import.meta.url crash", "AT5.6 openProposalDiff opens vscode.changes with base left and proposal right (unit with fake ports; smoke in VS Code)", "AT5.7 carry-over 3: confirmedDependents mapped into the action; needs-confirmation answers keep dependentCards", "AT5.8 [gated: WP1-WP4; run by the integrator] VS Code smoke (isolated profile, xvfb, TELELEAN_NO_REAL_CLAUDE=1, FakeBackend via the testing API, copy of mental_model/): start the normative run from the board, answer via simulateBoardMessage, wait for the proposal, Accept. Main.lean changes on disk, a history entry appears, Undo restores. A restored board shows a pending question again.", "AT5.9 deactivation persists an active run as interrupted and closes its session"]
- **id:** WP6
  - **title:** webview board: tray, run panel, question cards, review, report card, proposal overlay, ghost cards, attempts history, carry-over UI
  - **owned_paths:** ["packages/webview/**", "packages/extension/dist/webview/**"]
  - **brief:** Implement plan section 6.4 against core run.ts types and protocol messages.

Tray:
- 'These suffice ▶' posts startRun (premises + target); 'Self-evident?' with 0 premises posts startRun with premises []; 'Add to its premises ▶' posts the union;
- disabled with a reason while a run of the root is active, and for an ASSUMPTION target ('make it a Derivation first, then prove it').

RunPanel:
- status line: state, stage, round, checks n/25, turns n/80, agent time, gate attempt k/3, tokens, cost 'estimate', rate limit, Cancel;
- notices; activity, where Claude's text is italic with a marker;
- question cards: 1-3 questions, phenomenon tag, options with consequences, free text, Leave it open, Decide for me, scope (default run); no guess before answering, guess shown afterwards from RunView.answered;
- review stepper: statements first (sentence beside Lean, explicit toggle, closure) -> new vocabulary (revocable = prefilled Feedback) -> definition questions (Accept disabled until all yes; 'no' opens Feedback) -> report card (revealed after the statements or via 'Show result'; each assumed-without-asking item has 'Ask me instead' = prefilled Feedback) -> lifecycle ticks (recommended pre-ticked);
- Accept / Feedback / Discard / Raw Lean diff.

ProposalBanner with a Current|Proposed toggle; diff badges (glyph + colour + halo, never colour alone); '+N new' vocabulary auto-expanded. Ghost cards are translucent 'Claude suggests' with 'I hold this' (optional why) / 'No'. The expanded card shows attempts history from graph.attempts.

Carry-overs:
- (1) 'Used by' and the delete dialog use LeanBinding.externalUsers;
- (2) singular/plural in the dialog's own texts. Update the existing assertions of core's singular texts (webview/test/unit/store.test.ts near lines 583/614, webview/test/e2e/m1-drag.spec.ts near lines 62/140) to the texts frozen in plan 1.3; they pass once WP1 lands [gated];
- (3) kindChange posts confirmedDependents; a needs-confirmation listing more re-opens the dialog with the host's list.

Keep run/proposal state apart from applyGraph. Harness fixtures for run/proposal messages. Playwright with isolated HOME and one worker. Do not run the VS Code smoke.
  - **acceptance_tests:** ["AT6.1 tray: startRun for 'These suffice ▶' (premises + target), 'Self-evident?' (premises []) and 'Add to its premises ▶' (union); disabled with a reason during a run of the root and for an ASSUMPTION target", "AT6.2 run panel: states, stage, counters, usage with 'estimate', rate limit, notices (gate-failed, gave-up, reverted, cap, environment), Claude's text italic + marker; Cancel posts cancelRun", "AT6.3 question card: phenomenon tag, options + consequences, free text, Leave it open, Decide for me, scope; submit posts answerQuestions; no guess before, guess shown after the run update", "AT6.4 review order: statements -> vocabulary -> definitions -> report card (each assumed-without-asking item with 'Ask me instead') -> lifecycle. Accept disabled until every definition is approved. Accept, Feedback, Discard and Raw Lean diff post the right messages with ticked lifecycle ids and approved definition ids.", "AT6.5 overlay toggle; diff badges (glyph + colour + halo); '+N new' vocabulary expanded; ghost cards translucent with 'Claude suggests', posting adoptGhost (optional why) and rejectGhost", "AT6.6 attempts history in the expanded card for that target (date, verdict, premises, resolution, Claude's summary italic)", "AT6.7 carry-over 1: Used by lists externalUsers (lemma in code font, other subject's card by sentence + '(subject …)'). 'Nothing else refers to it.' only when no board reference and no external user exist.", "AT6.8 carry-over 2: singular and plural dialog texts; existing assertions of core's singular texts updated to plan 1.3 [gated: WP1]", "AT6.9 carry-over 3: confirmedDependents posted; needs-confirmation with more dependents re-opens the dialog with the host's list", "AT6.10 provenance: agent text (activity, ghost sentences, questions, summaries, agent glosses) never renders in user styling", "AT6.11 another subject's run shows a compact line with 'Show'", "AT6.12 webview unit and Playwright suites pass (isolated HOME, one worker), including the M1 specs (the ones asserting core's carry-over texts once WP1 lands)"]

## contracts
- packages/core/src/run.ts (new, integrator-owned). RunView, RunState/RunStage/RunVerdict, RunCaps/DEFAULT_RUN_CAPS, RunCounters, RunUsage, questions (QuestionSetView/QuestionView without Claude's guess, AnsweredQuestionView with it, QuestionAnswer, DecisionScope), RunNotice, RunActivity, GhostView (leanStatement = the collapsed, checked text), PermittedSummary, ProposalView (graph, GraphDiff, ProposalFile, StatementReview/VocabularyReview, DefinitionQuestion, LifecycleItem, GateAttemptView, ReportCard), AttemptRecord/AttemptResolution/AttemptSummary, DecisionRecord/DecisionsFile, PHENOMENA, TERMINAL_RUN_STATES/isTerminalRunState.
- packages/core/src/protocol.ts. Host->web 'run' {run|null} and 'proposal' {proposal|null}. Web->host startRun, answerQuestions, cancelRun, resumeRun, acceptProposal, feedback, discardProposal, adoptGhost, rejectGhost, openProposalDiff, dismissRun. kindChange.confirmedDependents. RUN_MESSAGE_TYPES, RUN_ID_PATTERN, RUN_TOKEN_PATTERN, LIMITS.answersPerBatch/reviewItems. Validators implemented. The StartRunMessage doc now says preflight comes before the premises declaration.
- packages/core/src/model.ts: LeanBinding.externalUsers?: ExternalUser[] (carry-over 1); TlGraph.attempts?: AttemptSummary[]
- packages/core/src/actions.ts: change-kind.confirmedDependents? (carry-over 3); AcceptProposalAction / ACCEPT_PROPOSAL_ACTION (merged into HistoryActionKind at integration)
- packages/core/src/paths.ts: attemptsPath(subject), decisionsPath(subject) (implemented)
- packages/core/src/gate/types.ts (WP1-owned).
- Types: GateFinding, GateFindingCode (reviewer added 'status-mismatch'), G0Context, Selection, PermittedAxioms, FrozenSnapshot, RulePurpose (gate-other doc: footprints apply, status-mismatch applies, readiness does not), FlaggedDefinition, GhostAdoptionRequest/Plan, DescribeContext.
- RuleInput: base = exactly the user's files (base or accept-base commit), with B's facts from the base check when available; new optional adopted = the newest adopt commit's model.
- packages/core/src/gate/index.ts (WP1, stubs): scanForbidden(file, text, ctx, baseText?) (reviewer added baseText: only Claude's lines judged), checkFileChanges, new ghostTextProblems(statement, proof?) (the single-term rule), computePermittedAxioms (never contains the target's .holds; circular derivations unusable), frozenSnapshot, evaluateRules, normalisationChanges, planGhostAdoption (writes the collapsed checked statement; refuses on ghostTextProblems or scanForbidden findings), lifecycleChanges, describeFinding, attemptNotice
- packages/core/src/proposal/index.ts (WP1, stubs): diffGraphs, proposalLabel, parseAttemptLines, serializeAttemptLine, summariseAttempts, parseDecisionsFile, serializeDecisionsFile, addDecisions, decisionsInForce
- packages/core/src/index.ts: exports run.ts, gate/, proposal/
- packages/runner/src/shadow/types.ts + index.ts (WP2).
- Types: ShadowPaths; ShadowCommitKind (reviewer added accept-base) and PASSING_COMMIT_KINDS; ShadowCommit; CreateShadowOptions; ShadowLayoutError.
- ShadowWorkspace: currentFiles returns every regular file (only symlinks/special/dot-entries throw); syncMirror copies model files only; revertTo is a no-op when equal; plus baseFiles, changes, writeFiles, commit, commits, lastCommit, filesAt.
- RunDirInfo.
- rootKeyOf is implemented; createRunShadow, openRunShadow, listRunDirs and pruneRunDirs are stubs.
- packages/runner/src/gate/types.ts + index.ts (WP2).
- Types: LeanJobSettings; CheckContext (reviewer added baseCommit?); LeanDiagnosticView; CheckReport; FreezeRecord; FreezeOutcome; GateReport (reviewer added commit?, the judged state); GhostCheckInput (pinned scratch form documented); GhostCheck (ok.statement?, the collapsed text); RenderedStatement.
- LeanCheckEngine: normalise, new checkBase (build the base before any prompt; errors fail the run; keep B's facts), check, freeze, gate, checkGhost, renderStatements.
- New EngineCore and LeanCheckEngineOptions.core? (test hook).
- createLeanCheckEngine is a stub.
- packages/runner/src/run/types.ts + index.ts (WP3).
- RunServices: backend: LlmBackend | (() => Promise<LlmBackend>) (lazy factory); new RunCore and core? (test hook).
- RunStartRequest: premises are declared by start() itself, after preflight and backend.
- ClaudeBackendSettings: new resolve? (home/pathEnv/env/runVersion test hooks; absolute setpriv launcher).
- Unchanged: RunSettings, RunManagerOptions, RunChange, RunManager, PreflightInput/Problem/Outcome, ContextBundleInput, PersistedRun/PersistedGhost, PhenomenaDriftCheck.
- DEFAULT_RUN_SETTINGS is implemented. createRunManager, createClaudeBackend (doc: the TELELEAN_NO_REAL_CLAUDE tripwire), runPreflight, buildSystemPrompt and buildContextBundle are stubs.
- packages/runner/src/proposal/types.ts + index.ts (WP4).
- ReadRealText; ProposalBuildInput.
- AcceptRequest: reviewer added shownState? (apply exactly the re-gated files).
- AcceptPlan.
- ProposalService: build; baseDrift(shadow, readReal, realFiles?) (reviewer added realFiles); planAccept; apply; diffFiles.
- RunSidecarStore.
- New ProposalCore and SidecarCore.
- createProposalService({ now?, core? }) and createRunSidecarStore({ core? }) are stubs.
- packages/runner/src/workspace/types.ts: ExternalChangeSet; optional ModelWorkspace members applyChanges, readText, modelFiles, library, projectModel, reloadAttempts (required after integration)
- packages/runner/src/llm/types.ts + toolSchemas.ts.
- ProposeAssumptionArgs.proof (required) and lean_name?; Adoption.aloneEntails?.
- CheckResult.stage/checksLeft/environment?; FreezeResult.permitted?; GateVerdict.environment?.
- GateCheckId gains markup/vocabulary/not_frozen; status-mismatch maps to 'other'.
- Shorter tool descriptions; the zod schema drift check still compiles.
- WP3 extends the renderers (permitted axioms, aloneEntails, environment).
- packages/runner/src/index.ts: namespaces shadow, gate, run, proposal
- packages/runner/vitest.config.ts (integrator-owned; reviewer added test.env.TELELEAN_NO_REAL_CLAUDE='1', inert until WP3 implements the checks)

## integration_plan
Plan section 11.

1. Verify owned-path discipline and the section 14 change-log entries, including the reviewer's. Resolve open issues against frozen files.
2. In one change: merge AcceptProposalAction into HistoryActionKind (core actions.ts + webview HISTORY_ACTION_LABEL + runner HISTORY_ACTIONS). Make the ModelWorkspace M2 members required and update the extension's test fakes. Remove every isImplemented gate, so every [gated] test of section 9 now runs. Check the quota tripwires:
   - TELELEAN_NO_REAL_CLAUDE=1 in the runner vitest config (already set), the extension vitest config and .vscode-test.mjs;
   - grep the tests for 'createClaudeBackend(' and 'new ClaudeCliBackend(' and confirm each hit is a fake-binary or node-double test.
3. Typecheck all packages. Run core npm test, runner vitest run (now including WP3's end-to-end walkthrough and cheating tests, including rebind-target and lemma-not-proved, with the FakeBackend and real Lean), webview unit and extension unit. Re-check WP1's hand facts against real facts of the overlays.
4. Add a new integrator test under packages/runner/test/integration/. It runs on a scratch git copy of mental_model/ through the real ModelWorkspace, RunManager (FakeBackend), engine and proposal service:
   - normative Accept, then Undo, Redo and a History revert of the Accept;
   - literal run with ghost adoption, then Accept;
   - drifted Accept: a user edit of new-spyro-pg's rationale, more than 3 lines from every change of Claude's, is rebased, re-checked with that edit as part of B, and kept; a user edit inside pg-no-dark-past's block, which normalisation pinned, is a conflict;
   - a start that declares new premises gives one M1 history entry before the run's base; a start refused by preflight declares nothing;
   - recovery from run.json with a pending question;
   - git index, HEAD and status untouched; no telelean-* unit left.
5. Run node scripts/walkthrough-claude.mjs --dry-run for both readings.
6. Webview build + Playwright, then extension build + VS Code smoke (FakeBackend run through the board, TELELEAN_NO_REAL_CLAUDE=1). One at a time, isolated profiles; check the real home folders afterwards.
7. Rebuild packages/extension/dist (extension bundle, dist/bin guard script, webview). The user's installed copy then shows M2 after a reload: report this. Update docs/user-guide.md, write docs/m2-report.md, and add plan section 15.1 (decisions 1-42) to docs/decisions-log.md.
8. Hand over to the main session for the live walkthrough (plan section 12).

## minor_decisions
- **decision:** The agent's root ws/ holds only model files; Lean builds in a separate build/ mirror synced before every Lean job
  - **rationale:** Grep/Glob search hidden files (m0-report lesson 4); the mirror keeps .lake out of the agent's root without any sandbox or runLean change
- **decision:** The shadow's git dir lives outside ws/ (git/ with work tree ws/) with an isolated git config
  - **rationale:** no dot-entry in the agent's root; the user's global git config cannot affect telelean's private history
- **decision:** Every model file of the project (all subjects) is copied into the shadow; the context bundle covers only the run's subject
  - **rationale:** cross-subject imports (D-10) must build; Claude can read other subjects' files, which the consent text discloses
- **decision:** 'These suffice' declares the selected premises (M1's undoable set-premises), then starts the run. The RunManager makes the declaration itself, only after preflight passed and the backend was obtained. 'Self-evident?' declares nothing.
  - **rationale:** keeps D-13's meaning of the button; a refused start changes nothing in the user's files (reviewer)
- **decision:** Run targets must be GOAL or DERIVATION cards; a pending derivation's axiom .holds may be replaced by the proof
  - **rationale:** an assumption is held, not proved (D-11); D-11's promotion is exactly 'prove from these'
- **decision:** Caps and gate attempts are per round (first run, each Feedback, each ghost adoption); usage is shown for the whole run
  - **rationale:** each round is user-initiated; a Feedback round should not be starved by the first one
- **decision:** telelean normalises before every gate and after every revert (pins, derived ids, docstring = the sentence); the agent never edits blocks
  - **rationale:** deterministic D-8/D-9 handling; G5 can then demand byte-identical blocks, and an accepted reverted state is pinned too
- **decision:** G3 also refuses changes to declarations that existed before the run (text and docstring, plus elaborated type/value when the base check produced facts), except the target's .holds
  - **rationale:** cheap stand-in for H's formal immutability; catches 'existing vocabulary turned into a definition', a rewritten gloss, and an 'open … in' that changes what unchanged text means
- **decision:** Permitted signature = every non-Prop axiom of the project's modules
  - **rationale:** computable from facts (typeSort); new ones must already pass the shape rule before the freeze
- **decision:** Lemmas added in a run may not rest on unselected assumptions, whatever the finish status
  - **rationale:** accepted files should not contain proofs that silently use beliefs the user did not select; the reviewer extended the check to 'not proved' rounds
- **decision:** propose_assumption carries the gap proof and an optional lean_name; telelean checks it in a scratch module
  - **rationale:** D-6 requires a gate-checked proof that the ghost closes the gap, without writing the ghost into the agent's files
- **decision:** Ghosts can be adopted only in review; adoption starts a new round that begins frozen
  - **rationale:** no mid-turn file changes under Claude; re-freeze only on adoption or Feedback (03)
- **decision:** Environment failures (sandbox, low memory, unsyncable mirror, cancellation) are not counted. In the gate telelean retries once after 30 s; a second failure ends the run as failed.
  - **rationale:** not Claude's fault; the single retry keeps a transient memory dip from costing the round's work (reviewer)
- **decision:** A turn that ends without finish gets one nudge, then ends as no-finish (revert, normalise, re-check)
  - **rationale:** the CLI has no in-process Stop hook here; bounded and predictable
- **decision:** 'insufficient' and 'inconsistent' are shown as 'not proved' / 'Claude reports a conflict (unverified until M3)'
  - **rationale:** D-6: insufficiency needs a countermodel and consistency needs the model finder (M3)
- **decision:** A not-proved round can still be accepted (its statements and vocabulary)
  - **rationale:** the formalisation is useful on its own; labelled 'These suffice -> not proved'
- **decision:** Every definition question needs an explicit yes before Accept; a no is Feedback
  - **rationale:** A2/D-4: definitions can carry beliefs and are questions for the user, not retries
- **decision:** Accept rebases onto the user's current files with M1's no-fuzz patches (an edit within 3 lines of Claude's counts as overlapping), re-freezes and re-gates with the user's files at Accept as the base, then applies exactly the re-gated files
  - **rationale:** D-21 (3-way merge, re-gate, then apply) with M1's undo machinery, without judging the user's own edits as Claude's (reviewer)
- **decision:** One Accept = one history entry (accept-proposal) and one Undo step, snapshot first
  - **rationale:** A3 and D-21 all-or-nothing; reverting an Accept works like any M1 action
- **decision:** attempts.jsonl and decisions.json are written directly, never undone, not in history snapshots, not gitignored
  - **rationale:** they log what happened and what the user answered; D-12 says committed
- **decision:** Claude's guesses are kept host-side until the user answers
  - **rationale:** D-20: no pre-selected answer, enforced by data flow rather than UI hiding
- **decision:** The system prompt is static and byte-identical across runs; all project data (including the subject's folder) goes into the first user turn
  - **rationale:** prompt caching across runs; the egress is in one inspectable place
- **decision:** Egress consent is asked once per model folder and names exactly what is sent
  - **rationale:** D-23 egress disclosure without nagging on every run
- **decision:** At most one active run per model root; a run continues when its board closes
  - **rationale:** D-25; one Lean job at a time and a simple board model
- **decision:** The CLI is launched under setpriv --pdeathsig KILL (absolute path)
  - **rationale:** M0 open item: a SIGKILLed extension host must not leave a detached CLI running
- **decision:** Run ids double as runLean scope groups
  - **rationale:** Cancel kills every Lean job of a run with one systemctl --user kill
- **decision:** AcceptProposalAction stays a separate type and the ModelWorkspace M2 members stay optional until integration
  - **rationale:** keeps the webview's exhaustive label table and the M1 test fakes compiling while builders work in parallel
- **decision:** Per-declaration G1 budgets are Lean's default heartbeat limit (unchangeable: G0 forbids set_option), plus 120 s per job and the memory cap
  - **rationale:** 03's 10 s / 1.5 GB measurement needs the extractor; deferred to H
- **decision:** The live walkthrough is driven by a script with a scripted user; dry-run by default, live only with --live plus TELELEAN_WALKTHROUGH_LIVE=yes
  - **rationale:** the main session cannot click in VS Code; a double opt-in keeps any builder or test from spending quota
- **decision:** A 'not proved' round is checked too: its theorems must rest only on the selection, and it may not leave a new proof of the target in the files (status-mismatch)
  - **rationale:** otherwise an unchecked proof resting on an unselected belief could reach the user's files through 'Accept (not proved)' (reviewer)
- **decision:** A card formalised before the run keeps its Lean statement: lean: lines are only added (by normalisation), never changed; no formalised card is re-bound; no unselected card gets formalised
  - **rationale:** otherwise Claude could point the goal at a new weaker statement and freeze that (reviewer)
- **decision:** Claude's suggested premise must be one Lean term, checked as a named abbreviation (telelean_ghost_stmt) in a scratch file that must have no errors; adoption writes exactly the checked text
  - **rationale:** the reviewer showed the unpinned form can be fooled into 'closes the gap' (plan fact 8)
- **decision:** G0 judges only the lines Claude added; stray non-Lean files Claude writes are bad-path findings
  - **rationale:** a user's own set_option or #eval line must not fail every attempt; a stray file is Claude's mistake, not an environment failure (reviewer)
- **decision:** Edits Claude makes after finish are discarded; the proposal always shows the files the gate judged
  - **rationale:** the proposal must never contain unchecked text (reviewer)
- **decision:** The freeze copy drops the target's .holds and everything that uses it
  - **rationale:** needed after Feedback, on Accept re-checks and for a pending-promotion target whose claimed .holds other proofs use (reviewer)
- **decision:** The Claude backend is created lazily through a factory. In Test mode the extension refuses real Claude. TELELEAN_NO_REAL_CLAUDE=1 in every test runner makes createClaudeBackend and the CLI launch refuse.
  - **rationale:** opening a board never runs a Claude binary; three independent tripwires keep tests from spending quota (reviewer)
- **decision:** Sidecars are per subject: .telelean/subjects/<S>/attempts.jsonl and decisions.json, next to M1's layout.json, rather than D-12's single root-level files
  - **rationale:** consistent with M1's per-subject sidecar layout and D-10 subjects; still committed with the user's own commits
- **decision:** The cost estimate shown is the CLI's latest figure, never a sum
  - **rationale:** the CLI's total_cost_usd already covers the whole conversation across --resume (M0 smoke-test note)
- **decision:** A cap reached while a tool call runs takes effect when the call returns
  - **rationale:** a passing gate is never thrown away by a cap hit during its Lean job
- **decision:** Runner factories take core test hooks; cross-package tests are marked [gated] and run at integration
  - **rationale:** the six work packages can each test their own logic while the others are still stubs (as M1's workspace did)
- **decision:** A run starts only on files that build: right after the shadow is made telelean builds the user's files once, and Lean errors anywhere end the run before Claude is contacted
  - **rationale:** Claude may not change the user's files, so every attempt would fail; the same build gives the base facts for the meaning check
- **decision:** The readiness rules (target and selected assumptions formalised, .holds present) apply to the freeze and finish(proved), not to a not_proved finish
  - **rationale:** an honest 'could not formalise' should end cleanly instead of after three forced failures

## major_decisions_needing_user

## real_claude_walkthrough
For the main session only, after integration (plan section 12). No builder or test runs it.

Steps:
0. Preconditions:
   - integration done and all suites green;
   - 'node scripts/walkthrough-claude.mjs --dry-run' passes both readings (FakeBackend, contacts nothing; the script sets TELELEAN_NO_REAL_CLAUDE=1 for itself);
   - free -m shows at least 12 GB available and no other heavy process is running;
   - TELELEAN_NO_REAL_CLAUDE is NOT set in the shell that will run the live command (with it set the live run refuses at once: safe, but it looks like a failure).
1. Run 'node scripts/walkthrough-claude.mjs --dry-run --binary-check'. It runs only 'claude --version' (llm.resolveClaudeBinary) and builds the argv with ClaudeCliBackend.prepare, which spawns nothing and never calls startSession. Record:
   - the resolved binary: expected the VS Code Claude Code extension's resources/native-binary/claude, version >= 2.1.295, e.g. 2.1.314;
   - the exact argv: no --bare; --tools Read,Glob,Grep,Edit,Write; --permission-mode dontAsk; --setting-sources=; --strict-mcp-config; the absolute-path setpriv launcher;
   - the sanitised environment names (CLAUDE*/ANTHROPIC_* stripped; ENABLE_TOOL_SEARCH=false);
   - the system prompt (plan 5.1, the corrected text).
2. Announce the quota use to the user before any live call (numbers below).
3. Normative reading:
   TELELEAN_WALKTHROUGH_LIVE=yes node scripts/walkthrough-claude.mjs --live --reading normative --model claude-opus-5-5 --effort high --work-dir /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/<turn>/m2-walkthrough
   Default caps: 80 turns, 25 checks, 20 min agent-active, 120 s per Lean job, 3 gate attempts.
   The script copies mental_model/ to a scratch git repo and refreshes Lean once. The run's base check builds the copy before any prompt. It then starts 'These suffice' {cynder-dark-past, new-spyro-pg, pg-no-dark-past} ⊢ cynder-not-good. It answers the modality question with free text ('I mean it as a rule: PG games should not include characters with dark pasts. I do not mean it is impossible for a PG game to contain one.') and any other question with Decide for me.
   Pass:
   - subscription auth and the hook listing are verified before the first prompt;
   - Claude asks about the modality, or formalises the normative reading and lists it under assumed_without_asking;
   - freeze succeeds; the gate passes with verdict proved in <= 3 attempts;
   - lifecycle G->D is offered and applied on Accept;
   - after Accept the copy's refresh shows cynder-not-good proved in the Derivations column, footprint = the three premises + characters exist + games exist.
4. Literal reading: the same command with --reading literal. The answer is 'I mean it literally: a PG game cannot contain a character with a dark past at all.'
   Pass:
   - round 1 verdict not-proved with at least one ghost that closes the gap (pinned ghost check);
   - the script adopts it; telelean re-freezes; round 2 is proved;
   - Accept writes the adopted card with worded_by: agent; the copy refreshes to proved.
5. Failures: record and analyse the transcript. At most one retry per reading. A different but faithful formalisation is acceptable. A cheat caught by the gate (notice + retry) is a pass of the gate, not of the walkthrough. Never loop. The script cancels at the first rate_limit event whose status is not 'allowed'.
6. Record per reading, and save into the prompt log's bundle as the walkthrough report:
   - summary.json: verdict per round, gate attempts with findings, board notices, questions asked and answers given, ghosts, flagged definitions, the final diff of the copy, final statuses;
   - session/transcript.jsonl (exact user turns and events) and the guard log (any denials);
   - usage: requests; input, output, cache-read and cache-write tokens; the CLI's cost estimate (the latest result, never summed); rate-limit events;
   - wall time and agent-active time; CLI version and model.
7. Report effects outside the scratch dir:
   - the CLI's own session transcripts under ~/.claude/projects/<encoded ws/ path>/ (how --resume works; report directory names only, never read contents or credentials);
   - ~/.elan/known-projects line count before and after (expected unchanged at 37);
   - no telelean-* systemd unit left.
8. Optional, with the user: the same flow in a VS Code Extension Development Host on a copy of mental_model/, pressing These suffice on the board. This also exercises the production runs dir under ~/.config/Code/User/globalStorage (risk R13).

Quota estimate (not a measurement):
- requests: normative about 10-20; literal about 20-35 over its two rounds;
- tokens, both readings together: about 0.5-1.5 M cache-read, 50-150 k cache-write, a few thousand uncached input, 20-60 k output at effort high;
- wall time: 5-15 minutes per reading;
- the CLI reports its own cost estimate at API list prices (M0's smoke was 8 Haiku requests for $0.003). The subscription is not billed per token, but this is ordinary quota use, so it is announced first.

## effects_outside_repo
- Reviewer scratch dir /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/m2-reviewer/ (228 KB):
- lit/: a copy of the architect's literal-reading Spyro project with its .lake;
- ghost-check.lean, ghost-inject.lean, ghost-inject2.lean, ghost-inject-pinned.lean: check files run with the toolchain's own lake/lean ('lake env lean --stdin --json', unsandboxed, on text I wrote);
- core-tests.log, core-tests-final.log, runner-tests.log, runner-tests-final.log;
- tmp/: TELELEAN_TEST_TMP of the two runner suite runs.
- Read only, nothing written: the architect's scratch dir /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/m2-architect/ (copied lit/ from it).
- ~/.npm/_logs: about 15 npx/npm invocations (npx tsc for four packages, npm test for core twice, npx vitest for runner twice) wrote small debug logs; npm's default logs-max of 10 rotated older ones. No npm setting changed.
- systemd --user transient scopes telelean-<runId>-<n>: created and removed by runLean during the two runner suite runs; none before or after (systemctl --user list-units 'telelean-*' --all).
- ~/.elan/known-projects unchanged: 37 lines before and after (toolchain binaries used directly, never elan proxies).
- Inside the repo but outside my assigned paths: the test runs updated packages/core/node_modules/.vite/vitest/*/results.json, packages/runner/node_modules/.vite/vitest/*/results.json and about 130 entries of the root node_modules/.vitest-cache/.
- Repo files I changed (plan and contracts):
- /home/zhengyew/telelean/docs/m2-plan.md;
- core: src/gate/types.ts, src/gate/index.ts, src/run.ts (doc), src/protocol.ts (doc);
- runner: src/gate/types.ts, src/run/types.ts, src/run/index.ts (doc), src/proposal/types.ts, src/proposal/index.ts, src/shadow/types.ts;
- /home/zhengyew/telelean/packages/runner/vitest.config.ts: added test.env TELELEAN_NO_REAL_CLAUDE=1, an integrator-owned config file.
- Nothing else: no network access, downloads, npm installs, git commands, Claude CLI runs, or VS Code/Chrome launches. No changes to ~/.config, ~/.claude, ~/.elan, VS Code settings or extensions, or ~/telelean_scripts. The lean --server processes visible in ps belong to the user's VS Code sessions, not to me.

