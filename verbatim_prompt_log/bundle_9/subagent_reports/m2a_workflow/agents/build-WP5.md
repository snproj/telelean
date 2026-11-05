# build:WP5 (agent af3e90cbfc730adfb)

## summary
WP5 (VS Code extension host) for M2 is built, but one gated test fails because of a bug in WP3's code, not in mine: the typecheck is clean and 165 of 166 unit tests pass.

**The failing test** (`test/unit/realRuns.test.ts`, "run.json itself says interrupted…") runs against the real RunManager and shows a write-ordering bug in WP3's in-progress code. When the extension deactivates, WP3's `dispose()` writes the run as `interrupted` immediately, but earlier writes still queued behind it land afterwards. They leave run.json saying `working` (without `canResume`) and can recreate run folders that were just deleted. The user-visible effect after a reload is unchanged, because recovery turns `working` into `interrupted`, and the same file's other two tests pass. The fix belongs in WP3 (see open issues).

**What the extension does now (plan section 8):**
- **Runs per model folder.** Each model folder gets one RunManager, created with its workspace; `recover()` is called once, and the RunManager is disposed before the workspace. Run directories live under VS Code's global storage, in `runs/`. Closing the board does not stop a run.
- **Message routing.** The board session sends the 11 run messages to the RunManager and answers each with `actionResult`. Run messages are handled one at a time in arrival order, in a queue separate from board edits, so a slow start or Accept never blocks typing a card. Cancel skips the queue so it can stop a start that is still waiting for Lean. The run and proposal are posted to the board on attach, on `ready` and on every RunManager change, including a run of another subject.
- **Start a run.** If a run of the folder is already active, the start is refused (`conflict`) without asking anything. Otherwise the consent modal appears once per folder, with the plan's exact text and a "Run with Claude" button; a yes is remembered, a no starts nothing and asks again next time. Then `start({ subject, target, premises })` is called; the extension never declares premises itself.
- **Raw Lean diff.** `openProposalDiff` opens `vscode.changes` beside the board over a read-only `telelean-proposal:` document source, with the run's base on the left and the proposal on the right.
- **Settings.** `telelean.model`, `effort`, `claude.path` and the seven `run.*` settings are added with the plan's defaults and scopes; the run settings exactly equal the runner's defaults. The plan gave no limits, so I chose them.
- **Claude backend.** It is created only when the RunManager asks for it at a start, with the guard at `<extension>/dist/bin/telelean-path-guard.mjs`, the default hook runtime, `telelean/<version>`, `pdeathsig: true`, and the Claude Code extension's folder searched first.
- **Test mode.** The backend factory rejects with "real Claude is disabled in Test mode" and never calls `createClaudeBackend`; only `testing.useRunBackend` supplies a backend. `TELELEAN_NO_REAL_CLAUDE=1` is set in the vitest config, `.vscode-test.mjs` and `smoke.mjs`.
- **Bundling.** The bundle now includes the runner's llm, run, gate, shadow and proposal code plus the MCP SDK. `import.meta.url` is replaced with the bundle's own file URL, done a way that keeps strict mode. `build.mjs` copies the guard to `dist/bin` (checked byte-identical) and loads the bundle in a fresh Node process.
- **Carry-over 3.** `confirmedDependents` is passed into the change-kind action; a `needs-confirmation` answer still names the cards.
- **Deactivation.** `deactivate()` disposes every RunManager first and waits up to 4 s if `dispose()` returns a promise.

**Smoke test.** `test/suite/runs.test.ts` (AT5.8, plus AT5.9 inside VS Code) is written and bundles cleanly, but I did not run it; it is for the integrator.

I ran the real build, so `dist/extension.js` (+map), `dist/bin/` and `out/test/suite` are rebuilt from the other builders' in-progress code; the webview was not built. No Lean, Claude CLI or git ran outside the scratch folder.

## files
- /home/zhengyew/telelean/packages/extension/src/extension.ts
- /home/zhengyew/telelean/packages/extension/src/api.ts
- /home/zhengyew/telelean/packages/extension/src/board/BoardPanel.ts
- /home/zhengyew/telelean/packages/extension/src/logic/actionMapping.ts
- /home/zhengyew/telelean/packages/extension/src/logic/boardSession.ts
- /home/zhengyew/telelean/packages/extension/src/logic/settings.ts
- /home/zhengyew/telelean/packages/extension/src/logic/runs.ts
- /home/zhengyew/telelean/packages/extension/src/logic/proposalPreview.ts
- /home/zhengyew/telelean/packages/extension/src/vscode/historyProvider.ts
- /home/zhengyew/telelean/packages/extension/src/vscode/host.ts
- /home/zhengyew/telelean/packages/extension/src/vscode/registry.ts
- /home/zhengyew/telelean/packages/extension/src/vscode/runner.ts
- /home/zhengyew/telelean/packages/extension/test/unit/fakes.ts
- /home/zhengyew/telelean/packages/extension/test/unit/vscodeStub.ts
- /home/zhengyew/telelean/packages/extension/test/unit/runRouting.test.ts
- /home/zhengyew/telelean/packages/extension/test/unit/runBackend.test.ts
- /home/zhengyew/telelean/packages/extension/test/unit/hostRuns.test.ts
- /home/zhengyew/telelean/packages/extension/test/unit/realRuns.test.ts
- /home/zhengyew/telelean/packages/extension/test/unit/bundle.test.ts
- /home/zhengyew/telelean/packages/extension/test/unit/settings.test.ts
- /home/zhengyew/telelean/packages/extension/test/unit/packageJson.test.ts
- /home/zhengyew/telelean/packages/extension/test/unit/actionMapping.test.ts
- /home/zhengyew/telelean/packages/extension/test/unit/boardSession.test.ts
- /home/zhengyew/telelean/packages/extension/test/suite/runs.test.ts
- /home/zhengyew/telelean/packages/extension/test/suite/fakeWorkspace.ts
- /home/zhengyew/telelean/packages/extension/test/suite/activation.test.ts
- /home/zhengyew/telelean/packages/extension/scripts/build.mjs
- /home/zhengyew/telelean/packages/extension/scripts/build-steps.mjs
- /home/zhengyew/telelean/packages/extension/scripts/check-bundle.cjs
- /home/zhengyew/telelean/packages/extension/scripts/esbuild-options.mjs
- /home/zhengyew/telelean/packages/extension/scripts/import-meta-url.mjs
- /home/zhengyew/telelean/packages/extension/scripts/smoke.mjs
- /home/zhengyew/telelean/packages/extension/package.json
- /home/zhengyew/telelean/packages/extension/tsconfig.json
- /home/zhengyew/telelean/packages/extension/vitest.config.mts
- /home/zhengyew/telelean/packages/extension/.vscode-test.mjs
- /home/zhengyew/telelean/packages/extension/dist/extension.js
- /home/zhengyew/telelean/packages/extension/dist/extension.js.map
- /home/zhengyew/telelean/packages/extension/dist/bin/telelean-path-guard.mjs
- /home/zhengyew/telelean/packages/extension/out/test/suite/

## how_to_run_tests
cd /home/zhengyew/telelean/packages/extension
export TELELEAN_TEST_TMP=<scratch dir>
node ../../node_modules/typescript/bin/tsc -p tsconfig.json   # typecheck (same as npm run typecheck)
node ../../node_modules/vitest/vitest.mjs run                  # unit tests (vitest.config.mts sets TELELEAN_NO_REAL_CLAUDE=1)
node scripts/build.mjs   # extension bundle + dist/bin guard copy + bundle load check + suite bundles (no webview)
# Integrator only (AT5.8 smoke; needs WP6's webview build first): npm run test:smoke  (scripts/smoke.mjs: isolated profile, xvfb, ulimit -c 0; runs test/suite/runs.test.ts on $TELELEAN_RUNS_ROOT with the FakeBackend)

## test_output
$ node ../../node_modules/typescript/bin/tsc -p tsconfig.json
tsc exit 0

$ node ../../node_modules/vitest/vitest.mjs run   (final run, 20:5x)
 ❯ test/unit/realRuns.test.ts (3 tests | 1 failed)
 FAIL  test/unit/realRuns.test.ts > [gated: WP1-WP4] deactivation with the real RunManager (AT5.9) > run.json itself says interrupted once the writes queued before the deactivation have landed (docs/m2-plan.md 4.6)
AssertionError: run.json after every pending write has landed: expected { runId: 'rmvxu11vlef45c0', …(16) } to match object { runId: 'rmvxu11vlef45c0', …(2) }
  - "canResume": true,
  - "state": "interrupted",
  + "state": "working",
 Test Files  1 failed | 18 passed (19)
      Tests  1 failed | 165 passed (166)
   Duration  6.61s
(Same result on 3 consecutive runs. Baseline before my changes: 15 files, 103/103 passed.)

$ node scripts/build.mjs
bundled runner modules: gate, lean, llm, proposal, run, semantic, shadow, workspace
copied the path guard to /home/zhengyew/telelean/packages/extension/dist/bin/telelean-path-guard.mjs
bundle loads: extension.js exports activate and deactivate
dist/extension.js 2.3mb; out/test/suite/{activation,board,boards,e2e,model,runs}.test.js built
(cmp: the dist/bin guard is identical to packages/runner/bin/telelean-path-guard.mjs; no "import.meta" left in dist/extension.js)

VS Code smoke (AT5.8): not run (integrator).

## acceptance
- **test:** AT5.1 routing (unit, fake RunManager)
  - **status:** pass
  - **evidence:** test/unit/runRouting.test.ts (27 tests): all 11 run messages reach the RunManager method of the same meaning, and a start carries the board's subject; outcomes become actionResult, with toasts on the listed successes and Undo only after Accept; run/proposal are posted on ready, on change (per flag) and after each run message, including another subject's run; arrival order holds in a separate run queue that board edits do not wait on; Cancel skips the queue; recovery is awaited. Host level in hostRuns.test.ts: the board gets run and proposal on attach and on change.
- **test:** AT5.2 startRun: consent once per root, remembered; declined starts nothing; start with subject/target/premises, never perform; busy gives conflict
  - **status:** pass
  - **evidence:** runRouting.test.ts: start({subject:'Spyro',target,premises}) is called and workspace.performed stays empty; a declined consent gives not-yet with CONSENT_DECLINED and no calls; every non-terminal state of any subject gives conflict without asking; the subject is captured when the button is pressed. hostRuns.test.ts (Production mode, stub modal): the modal shows the plan text with {modal:true, detail}; a yes is stored under telelean.claudeConsent.<rootKeyOf(root)>; the same folder is not asked again; another folder is asked; a dismissed modal is not remembered.
- **test:** AT5.3 settings defaults and bounds read, and contributed in package.json
  - **status:** pass
  - **evidence:** settings.test.ts: the defaults equal the runner's DEFAULT_RUN_SETTINGS; minutes and seconds become ms; values are clamped to bounds and rounded; mistyped values fall back to defaults. packageJson.test.ts: the 10 M2 properties have the plan's defaults and scopes (claude.path and keepRuns machine, the rest resource), effort and contextScope enums, and integer minimum/maximum equal to the bounds. The activation smoke suite also asserts the defaults inside VS Code (not run).
- **test:** AT5.4 guard in dist/bin after the build; production factory passes it to createClaudeBackend (fake) and runs only at a start; Test mode without useRunBackend refuses with 'real Claude is disabled in Test mode' and never calls createClaudeBackend; with useRunBackend the injected FakeBackend is used
  - **status:** pass
  - **evidence:** bundle.test.ts: copyGuardScript is byte-identical, and the real dist/bin guard exists and is identical after the M2 build (build.mjs ran). runBackend.test.ts: the factory builds nothing until called, then passes {guardScriptPath:<ext>/dist/bin/telelean-path-guard.mjs, hookRuntime, clientApp:'telelean/0.0.1', pdeathsig:true, extensionDirs with the Claude extension's folder first}; Test mode rejects with the exact text and never calls createClaudeBackend; with an override it returns that FakeBackend for the root. hostRuns.test.ts: same through the host in Test and Production modes. Also checked against the real WP3 RunManager (realRuns.test.ts, gated, now running and passing): the start is refused not-yet with the text and no run directory is created.
- **test:** AT5.5 bundle contains llm/run/gate/shadow/proposal and loads in Node with the vscode stub without an import.meta.url crash
  - **status:** pass
  - **evidence:** bundle.test.ts: the bundle inputs include runner/src/{llm,run,gate,shadow,proposal,workspace} and bin/telelean-path-guard.mjs; no import.meta or import_meta left; the first line is still "use strict"; it activates with the stub and registers 3 commands, the serializer and the telelean-history and telelean-proposal providers; deactivate resolves; a probe bundle shows the runner's defaultGuardScriptPath() computes instead of throwing; build.mjs's own load check passes.
- **test:** AT5.6 openProposalDiff opens vscode.changes with base left and proposal right (unit with fake ports; smoke in VS Code)
  - **status:** pass
  - **evidence:** runRouting.test.ts: showProposalDiff gets the proposal's files with title 'Raw Lean diff: Spyro (round 2)'; one-file focus works; unchanged-file and empty cases give info toasts; a stale id gives a warning; it does not wait behind run messages. hostRuns.test.ts: stub executeCommand records ('vscode.changes', title, [[file, left, right]]); left and right use the telelean-proposal scheme; the provider serves base text left and proposal text right; a created file has no left side. The VS Code step is in runs.test.ts (not run).
- **test:** AT5.7 carry-over 3: confirmedDependents mapped into the action; needs-confirmation answers keep dependentCards
  - **status:** pass
  - **evidence:** actionMapping.test.ts: confirmedDependents (including []) reaches change-kind and stays absent when not sent. boardSession.test.ts: a kindChange with confirmedDependents reaches perform; core's needs-confirmation listing more dependents comes back with every dependent and dependentCards for the cards; a re-send listing all goes through.
- **test:** AT5.8 [gated] VS Code smoke: normative run from the board, answer via simulateBoardMessage, proposal, Accept changes Main.lean, history entry, Undo restores; restored board shows a pending question
  - **status:** not-done
  - **evidence:** Written as test/suite/runs.test.ts and bundled to out/test/suite/runs.test.js, which builds cleanly; not run, per the brief (integrator: isolated profile, xvfb, ulimit -c 0). It uses its own copy at $TELELEAN_RUNS_ROOT (smoke.mjs), the FakeBackend normative script from plan 10.2, consent and git through the testing API, and asserts TELELEAN_NO_REAL_CLAUDE=1. It also checks Claude's guess is hidden before the answer, the real files are untouched before Accept, the raw-diff tab opens, the history entry action is 'accept-proposal', and Undo restores byte-exactly. The restored question uses testing.disposeWorkspace then restoreBoard; a further step covers AT5.9 (working run, then interrupted with Resume offered).
- **test:** AT5.9 deactivation persists an active run as interrupted and closes its session
  - **status:** fail
  - **evidence:** Extension side passes. hostRuns.test.ts: deactivate() disposes every RunManager (waiting for a returned promise) before VS Code disposes the workspaces, never twice. realRuns.test.ts with the real WP1-WP4 code: the session is closed, and the next window recovers the run as interrupted with canResume, shown on the board. The settled run.json check fails: WP3's dispose() writes 'interrupted' immediately while older queued writes (RunFiles.chain) land afterwards, leaving state 'working'. It reproduced 3 times. This is a WP3 issue (see open issues).

## contract_changes
- No frozen contract file was changed (core run.ts, protocol.ts, model.ts, actions.ts, paths.ts, gate/*, proposal/*, index.ts; runner shadow/gate/run/proposal/workspace/llm types, runner index.ts, runner vitest.config.ts are untouched).
- Extension-internal API (packages/extension/src/api.ts), additive: PromptId gains 'claudeConsent'; TeleleanTesting gains useRunBackend(factory: RunBackendOverride): () => void and disposeWorkspace(root): Promise<void>; reset() also clears remembered consents and the run backend; TeleleanApi gains runsFor(root): RunManager | undefined; RunBackendOverride = (root) => LlmBackend | Promise<LlmBackend> is exported.
- src/extension.ts: deactivate() is now async and awaits host.shutdown(), which disposes run managers first, waiting at most 4 s.
- src/vscode/runner.ts RunnerFunctions gains createRunManager, createClaudeBackend, createLeanCheckEngine, createProposalService, createRunSidecarStore, defaultHookRuntime. testing.useRunner overrides can replace them.
- TeleleanHost constructor gains an optional third parameter { runner?: Partial<RunnerFunctions> } (a unit-test hook).
- BoardSessionPorts gains claudeConsent() and showProposalDiff(diff); BoardSessionOptions gains runs?: RunsHandle; BoardSession gains publishRuns(change?).
- For the integrator's section-14 log (docs are not in my paths): none of the above touches frozen files.

## minor_decisions
- **decision:** Only a 'yes' to the egress consent is remembered (globalState telelean.claudeConsent.<rootKeyOf(root)>). A 'no' refuses that start with code not-yet and asks again at the next start.
  - **rationale:** Remembering a 'no' would lock the user out with no UI to undo it. Nothing is sent, declared or started without a yes.
- **decision:** The consent modal splits the plan's text into the message 'Run Claude on this model?' and a detail with the rest, verbatim. The button is 'Run with Claude'; VS Code adds Cancel.
  - **rationale:** Keeps the exact wording in VS Code's modal layout. A test asserts message + ' ' + detail equals the plan text.
- **decision:** The extension checks for an active run before asking for consent. Any non-terminal run of the folder, any subject, refuses with conflict and a sentence per state saying what to do. A conflict from the RunManager itself is passed through.
  - **rationale:** Never ask for consent for a start that cannot happen; at most one active run per folder.
- **decision:** Run messages have their own queue (arrival order among themselves); board edits keep the M1 queue. cancelRun skips the queue, and openProposalDiff is read-only and also outside the queues.
  - **rationale:** A start (base-check Lean build, up to the 120 s job cap) or an Accept re-gate must not block typing a card. Cancel must be able to stop a start in progress, since the plan allows Cancel in any non-terminal state including 'starting'.
- **decision:** Toasts: successes of startRun, cancelRun, resumeRun, acceptProposal, feedback, discardProposal, adoptGhost and rejectGhost show the outcome label, with an Undo button only for Accept. Answers and dismissals show no toast. Refusals follow M1: actionResult only when there is a request id, otherwise a warning toast.
  - **rationale:** One Accept is one undoable step. A start's Undo would only undo a premises declaration while the run goes on. Answers and dismissals are visible in the run panel.
- **decision:** After every run message the run is posted again; start and Accept also republish workspace and graph. On ready, run and proposal are posted even when null, but only when runs are available.
  - **rationale:** The panel follows at once even before the RunManager's change event, and a reloaded webview clears a stale run.
- **decision:** Run settings limits (the plan gave none): maxTurns 1-1000, maxChecks 1-500, maxAgentMinutes 1-240, leanJobSeconds 10-1800, maxGateAttempts 1-10, keepRuns 1-100. All are integers, clamped and rounded. The model must match /^[A-Za-z0-9][A-Za-z0-9._:/@[\]-]{0,99}$/, else the default. claude.path is trimmed, ~ is expanded, and a value with control characters is ignored.
  - **rationale:** Generous limits that keep runs bounded; mistyped values fall back like M1's settings.
- **decision:** Run settings are read when the RunManager is created (they take effect after a window reload, as in M1). claude.path and the Claude extension's folder are read when the backend factory first runs.
  - **rationale:** Consistent with M1. The binary search inputs are only needed at the first start that passed preflight.
- **decision:** extensionDirs = [the parent folder of the anthropic.claude-code extension, ~/.vscode/extensions, ~/.vscode-server/extensions], without duplicates.
  - **rationale:** Passing extensionDirs replaces the runner's defaults (binary.ts), so they are repeated after the Claude extension's own folder.
- **decision:** import.meta.url is replaced in all CommonJS bundles with an injected constant holding the bundle's own file URL (esbuild define + inject, scripts/import-meta-url.mjs), not a banner. The guard path is always passed explicitly.
  - **rationale:** A banner placed before esbuild's "use strict" silently drops strict mode for the whole bundle; inject keeps it. Verified by test.
- **decision:** In Test mode, testing.useRunBackend(factory(root)) is read when the RunManager calls the backend factory. There is no proxy; if the RunManager caches the backend, tests switch backends per folder via testing.disposeWorkspace or reset().
  - **rationale:** Matches the brief literally (only useRunBackend supplies a backend) and stays simple.
- **decision:** New test hooks: testing.disposeWorkspace(root) closes the board and disposes the RunManager, then the workspace, like a window reload; api.runsFor(root) exposes the RunManager.
  - **rationale:** Needed for the smoke's 'restored board shows the question again' and AT5.9 steps without reloading VS Code.
- **decision:** deactivate() disposes run managers before VS Code disposes the rest, waiting up to 4 s when dispose() returns a promise (RUNS_SHUTDOWN_MS).
  - **rationale:** Persisting and closing the session must happen while the workspaces still exist. The wait lets WP3 make dispose asynchronous without an interface change.
- **decision:** The M1 fake-workspace smoke suites (FAKE_RUNNER) refuse to create a RunManager. Their boards answer run messages 'not available'.
  - **rationale:** Keeps WP3 code out of the M1 suites; runs.test.ts covers runs.
- **decision:** Raw diff tab title 'Raw Lean diff: <subject> (round n)', or 'Raw Lean diff: <file name>' when focused on one file. No changes, or an unchanged file, gives an info toast; failures give a warning toast.
  - **rationale:** Short titles keep the board's tab in place; openProposalDiff has no request id, so toasts are the only feedback.
- **decision:** The text answering a theseSuffice without premises now points to the tray's 'Self-evident?' button (a Claude run) instead of 'arrives in M2'.
  - **rationale:** The M1 text was wrong for M2.
- **decision:** The smoke run suite uses its own pristine copy runs/runs_model outside the workspace folder (TELELEAN_RUNS_ROOT, created by smoke.mjs) and inlines the plan's normative FakeBackend script.
  - **rationale:** model.test.ts changes ws/mental_model (G->A on the goal). The inline script avoids depending on WP3's fixture format.
- **decision:** Gated tests probe only synchronous functions with isImplemented (buildSystemPrompt, createLeanCheckEngine, createProposalService, createRunSidecarStore, ghostTextProblems, decisionsInForce) plus the workspace's M2 members.
  - **rationale:** Async stubs reject instead of throwing, so isImplemented cannot detect them.
- **decision:** Simple (still optional) M2 members were added to both test fakes (unit FakeWorkspace, suite FakeModelWorkspace).
  - **rationale:** Integration step 11.2 makes them required; the extension's fakes then keep compiling.

## open_issues
- WP3 bug, for the integrator and the WP3 builder: in packages/runner/src/run/manager.ts, dispose() writes run.json synchronously (RunFiles.writeStateSync) while async writes queued earlier in RunFiles.chain (persist.ts) are still pending. They land afterwards, so run.json ends as state 'working' without canResume, and late writes and transcript appends recreate run folders deleted meanwhile (seen as leftovers before I hardened my test's cleanup). recover() maps working to interrupted, so a reload looks right, but plan 4.6 says the run is persisted as interrupted. Suggested fix: in dispose, queue the final write behind the chain and return its promise (e.g. return run.files.writeState(final).then(() => run.files.flush())), or drop queued state writes once disposed. The extension's deactivate() already waits up to 4 s for a promise returned by dispose(). Until then this gated test fails: test/unit/realRuns.test.ts 'run.json itself says interrupted once the writes queued before the deactivation have landed'.
- AT5.8 is written but not run: the integrator runs npm run test:smoke after WP6's webview build (smoke.mjs creates $TELELEAN_RUNS_ROOT and sets TELELEAN_NO_REAL_CLAUDE=1). It needs the real WP1-WP4 code; its gate is already open, because the functions are no longer stubs.
- My gated unit tests (realRuns.test.ts) already run because WP1-WP4 replaced their stubs during my session, so they exercise the other builders' unfinished code; their results may change until integration.
- dist/extension.js (+map), dist/bin/ and out/test/suite were rebuilt from the in-progress sources around 20:49. If the user's VS Code loads this extension from this folder, a reload picks up this M2 host; nothing runs without them pressing These suffice and allowing the consent. Rebuild at integration (step 11.7).
- Suggestion, not implemented (outside the plan): a VS Code notification with 'Open Board' when a run starts waiting for an answer or reaches review while its board is closed (D-25 keeps runs going without a board, so the user may not notice).
- Plan section 14 log entries for the extension API additions (see contract_changes) are not written, because docs/ is outside my assigned paths.

## integration_notes
- **Step 11.2 (M2 workspace members become required):** the extension's fakes already implement them (`test/unit/fakes.ts` FakeWorkspace, `test/suite/fakeWorkspace.ts` FakeModelWorkspace), so nothing else changes in the extension.
- **Gates:** the [gated] tests are the whole `describe` in `test/unit/realRuns.test.ts` and the whole suite in `test/suite/runs.test.ts`. Each uses `IMPLEMENTED` probes; replace them with true to remove the gate.
- **Quota grep (plan 10.4):** the only `createClaudeBackend(` hits are `src/vscode/host.ts:484` and `src/logic/runs.ts:158`, the production path, which is never reached in Test mode. No test constructs a real backend, and there are no `new ClaudeCliBackend(` hits in the extension.
- **Tripwire variable:** `TELELEAN_NO_REAL_CLAUDE=1` is set in `vitest.config.mts`, `.vscode-test.mjs` and `scripts/smoke.mjs`, and in the build's bundle-load check. A unit test asserts it is present.
- **M1 suites:** `model.test.ts` and `e2e.test.ts` use the real runner, so a real RunManager is now created for their folders. The board gets extra run/proposal messages (null); no M1 test asserts exact message sequences there.
- **Backend factory calls:** the RunManager calls the factory at its first start that passed preflight. WP3 may also call it when a restored question is answered or a run resumed after a reload; the factory handles any call.
- **Bundle size:** `dist/extension.js` grew from 0.49 MB to 2.3 MB (zod, the MCP SDK with ajv and hono, and the runner's M2 code). The build prints which runner modules were bundled.
- **Webview interplay:** the extension posts `run`/`proposal` only when the folder has a RunManager. A failed RunManager creation is logged ("Claude runs are unavailable: …"), and the board's run messages are then refused `not-yet` with that reason.

## effects_outside_repo
- ~/.npm/_logs: my npx tsc / npx vitest runs created npm debug logs there, and npm's default logs-max=10 rotated older ones out (other builders' npx runs do the same at the same time). Contents not read. The final verification used node ../../node_modules/... directly to avoid more logs.
- Scratch only: /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/wp5/ held bundle experiments (removed) and the unit tests' temp folders in tmp/ (empty at the end). The older 12:xx files there (smoke-run*.log, vscode-965209/) predate this task and were left alone.
- Git ran only inside my scratch tmp: the real WP2 shadow's own git/ folder during realRuns.test.ts, with GIT_CONFIG_GLOBAL=/dev/null and GIT_CONFIG_NOSYSTEM=1 set by the test; those folders were deleted afterwards.
- No Lean process, no systemd unit of mine, no Claude CLI (not even --version), no network, no npm install, nothing under ~/.claude, ~/.config, ~/.elan, VS Code settings or extensions. The telelean-* units seen during the session belonged to other builders (wp2…/wp4…/t… scope names).

