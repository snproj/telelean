export const meta = {
  name: 'telelean-demo-readiness',
  description: 'Quota-free demo readiness: custom examples on a fresh model (FakeBackend), snap VS Code check, live demo driver (dry only), then integrate and re-test',
  phases: [
    { title: 'Prepare', detail: 'three parallel agents' },
    { title: 'Integrate', detail: 'merge, rebuild, re-run everything' },
  ],
}

const REPO = '/home/zhengyew/telelean'
const SCR = '/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn13'

const SAFETY = `
SAFETY RULES FROM THE USER (mandatory; they apply to you and to anything you start):
- ${REPO} is now the USER'S git repository with a GitHub remote "origin". Never push, fetch, pull, commit, stash, checkout, reset, rebase or otherwise change git state there; read-only git (status, diff, log) is fine. Never run gh. Never add remotes.
- Never put anything on the internet publicly and never send anything to a person: no emails, messages, uploads, pastebins, posts to web APIs.
- No downloads, no new npm packages, no "npm install"; network only for reading documentation.
- NEVER run the Claude CLI with a prompt or start a real LLM session (no initialize/preflight against the real CLI either); never set TELELEAN_WALKTHROUGH_LIVE, TELELEAN_SMOKE_LIVE or TELELEAN_DEMO_LIVE; keep TELELEAN_NO_REAL_CLAUDE=1 in every test. Real-Claude runs are done ONLY by the main session.
- Never read or print credentials or secrets.
- Write only inside your ASSIGNED PATHS plus your scratch dir ${SCR}/<your-label>/. Never touch the user's VS Code settings or installed extensions, ~/telelean_scripts, ~/.config, ~/.claude, ~/.elan, git global config. No sudo. Do NOT set npm_config_logs_max=0 (redirect npm logs with npm_config_logs_dir into scratch instead).
- Tests that launch Chrome or a VS Code instance use an isolated HOME and XDG_* dirs, user-data-dir and extensions-dir under scratch, and "ulimit -c 0"; never copy packages/extension/.vscode-test. Check the real home folder is unchanged afterwards.
- RAM: at most ONE heavy process at a time; "free -m" before heavy steps; LEAN_NUM_THREADS=4; kill only your own processes; leave none behind (including telelean-* systemd scopes).
- Lean: toolchain binaries directly (~/.elan/toolchains/leanprover--lean4---v4.35.0/bin), never elan proxies. Git for tests only in scratch repositories with GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1.
- Report every effect outside ${REPO} and your scratch dir. Structured output only; never claim a test passed unless you ran it.
`
const CONTEXT = `
PROJECT. telelean: VS Code extension; repo ${REPO}; npm workspaces packages/core, runner, webview, extension. M1 (board without AI) and M2 ("These suffice": real run controller, shadow, gate with retry loop, review, proposal, Accept, ghosts) are implemented and verified with the FakeBackend. Read docs/project-report.md (architecture, features, the Lean system; Part 3 = the gate theory) and docs/m2-plan.md when needed. Settings default to model claude-opus-5-5, effort high. The user's Claude Code is 2.1.322 (binary resolved automatically from ~/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude).
GOAL NOW: a demo, as soon as possible, in which a user opens a FRESH folder in their own VS Code (a snap install), runs "telelean: Initialize Model Here", opens the board, types their own simple example as cards (assumptions + a goal) with the A|D|G box, selects premises and the goal, presses "These suffice", answers Claude's questions, and gets a result (proved with a proposal to Accept, or not proved with a suggested missing premise). The main session is meanwhile running the real-Claude walkthrough on the Spyro sample. Your work is quota-free.
`
const RESULT = { type: 'object', properties: {
  summary: { type: 'string' }, files_changed: { type: 'array', items: { type: 'string' } },
  test_runs: { type: 'string' }, problems_found: { type: 'array', items: { type: 'string' } },
  fixes: { type: 'array', items: { type: 'string' } },
  needed_outside_my_paths: { type: 'array', items: { type: 'string' }, description: 'exact changes another package needs (for the integrator)' },
  how_to_run: { type: 'string' },
  effects_outside_repo: { type: 'array', items: { type: 'string' } },
}, required: ['summary', 'files_changed', 'test_runs', 'problems_found', 'fixes', 'needed_outside_my_paths', 'how_to_run', 'effects_outside_repo'] }

phase('Prepare')
const [fresh, snap, driver] = await parallel([
  () => agent(`${SAFETY}\n${CONTEXT}
YOUR TASK (fresh-model custom examples, runner level). ASSIGNED PATHS: packages/core/**, packages/runner/**, test-fixtures/**.
The Spyro walkthrough starts from cards that already have Lean. A demo user's cards are CODE-LESS (typed on the board, written as blocks into Model/<Subject>/Inbox.lean of a freshly initialised model), so a real Claude must create everything from scratch: sorts, predicates, constants with their presupposition (axiom T.exists : Nonempty T plus instance : Nonempty T := T.exists, exactly as runner/src/run/systemPrompt.ts teaches), statements (abbrev n : Prop := S), and axiom n.holds : n for each selected assumption, then freeze, prove and finish. This path has never been exercised.
1. Write FakeBackend scripts that behave like a well-behaved Claude following the system prompt for at least: (a) Socrates: A "All humans are mortal", A "Socrates is a human", G "Socrates is mortal" -> proved; (b) a chain: "Every cat is a mammal", "Every mammal is an animal", "Tom is a cat" |- "Tom is an animal" -> proved; (c) insufficient: "All birds can fly", "Tweety is a penguin" |- "Tweety can fly" -> not proved with a ghost "Every penguin is a bird" that closes the gap, adopt it, re-freeze, proved; (d) a goal with zero premises that is not self-evident -> not proved. Start each from a FRESH model created by the real Initialize scaffold plus M1 add-node actions (exactly what the board does), and drive the real RunManager + gate + Accept (like the existing walkthrough e2e / m2flow tests), then refresh and check the statuses.
2. Find and fix every false rejection or flow problem on this path (e.g. new sorts/constants/presupposition instances refused or turned into blocking questions; code-less premises; Inbox placement and pinning; freeze requirements; G->D lifecycle; Accept; the refresh afterwards). Keep the gate sound: a fix must not let any existing cheat test pass (run the cheat suites). Make sure the system prompt teaches exactly the patterns the gate accepts.
3. Add these scenarios as permanent tests; run core and runner suites (runner full, real Lean).`, { label: 'fresh-model', phase: 'Prepare', schema: RESULT }),
  () => agent(`${SAFETY}\n${CONTEXT}
YOUR TASK (the user's snap VS Code). ASSIGNED PATHS: packages/extension/** except packages/extension/scripts/demo-* and packages/extension/test/demo/**.
All extension tests so far ran in a downloaded VS Code 1.140 build. The user runs VS Code as a snap (/snap/bin/code; the real binary is under /snap/code/current/usr/share/code/). Run the extension's VS Code suites (smoke + e2e, including the FakeBackend run tests) against the snap binary instead (vscode-test/test-electron accept an executable path, or launch it directly with --extensionDevelopmentPath/--extensionTestsPath), with an isolated profile under xvfb. Confirm: activation, Initialize Model Here on a fresh folder, the board, the Lean refresh through systemd-run + bwrap from inside the snap's environment (the snap leaks variables such as ELECTRON_RUN_AS_NODE, SNAP*, GTK_*), history, and FakeBackend runs. Fix snap-specific failures in packages/extension; describe needed runner/core changes in needed_outside_my_paths. Add a script or npm script so the snap run can be repeated. Also review the real-backend path inside the extension host statically (binary resolution, environment sanitising, consent, the preflight) for anything that would break in the snap (do not run it).`, { label: 'snap-vscode', phase: 'Prepare', schema: RESULT }),
  () => agent(`${SAFETY}\n${CONTEXT}
YOUR TASK (a demo driver the main session will run live). ASSIGNED PATHS: new files packages/extension/scripts/demo-*.mjs and packages/extension/test/demo/**, plus a short ${REPO}/docs/DEMO.md.
Build a driver that launches an isolated VS Code instance (default: the downloaded test build in packages/extension/.vscode-test; option --vscode <path> for the snap binary) with the extension under development, opens a FRESH temporary folder, runs "telelean: Initialize Model Here", opens the board, and through the real webview (CDP, as packages/extension/test/suite/e2e*.ts do) types a custom example given on the command line (e.g. --assume "All humans are mortal" --assume "Socrates is a human" --goal "Socrates is mortal"), selects the premises and the goal, presses These suffice, handles the consent prompt, answers each question with a given answer or the first option, waits for the review/proposal, Accepts, waits for the refresh, and prints a JSON summary: verdict per round, questions asked and answers given, ghosts, the final Lean written, statuses after Accept, wall times, token usage if available; it also saves screenshots. Modes: --dry-run uses the FakeBackend (write a FakeBackend script for the Socrates example yourself, or use whatever the run manager offers) and must pass end to end; --live requires BOTH the flag and TELELEAN_DEMO_LIVE=yes and refuses if TELELEAN_NO_REAL_CLAUDE is set (like scripts/walkthrough-claude.mjs). You must NOT run --live. If product hooks are needed (e.g. a test-only way to accept the consent dialog), describe them in needed_outside_my_paths. docs/DEMO.md: the user-facing 5-minute demo steps in their own VS Code (reload, fresh folder, Initialize, Open Board, typing cards, selecting, These suffice, consent, answering, Accept/Feedback/Discard), what to expect, timings, and tips for good simple examples.`, { label: 'demo-driver', phase: 'Prepare', schema: RESULT }),
])

phase('Integrate')
const integ = await agent(`${SAFETY}\n${CONTEXT}
YOUR ROLE: integrator. ASSIGNED PATHS: everything under ${REPO} except verbatim_prompt_log/. Three agents just worked in parallel; their reports:
FRESH-MODEL: ${JSON.stringify(fresh, null, 1)}
SNAP: ${JSON.stringify(snap, null, 1)}
DRIVER: ${JSON.stringify(driver, null, 1)}
1. Apply every change listed in needed_outside_my_paths (and anything else needed to make the three pieces work together).
2. Rebuild everything (root npm run build, npm logs into scratch) so packages/extension/dist is current: the user loads the extension from that folder.
3. Run every suite sequentially: core, runner (full), webview (typecheck, build, unit, Playwright), extension (unit, smoke + e2e) with the downloaded build AND once with the snap binary via the snap agent's script; run the demo driver --dry-run (Socrates example) and the walkthrough --dry-run.
4. Report precisely how the main session runs the demo driver live (exact command), and anything that still blocks a live demo.`, { label: 'integrate', phase: 'Integrate', schema: RESULT })

return { fresh, snap, driver, integ }
