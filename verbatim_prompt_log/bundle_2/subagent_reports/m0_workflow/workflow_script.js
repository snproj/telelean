export const meta = {
  name: 'telelean-m0-spikes',
  description: 'M0: three spikes (sandboxed Lean runs + comparator; Claude CLI harness offline; board in a real webview), each independently verified and fixed',
  phases: [
    { title: 'Build', detail: 'one agent per spike writes seed code + tests' },
    { title: 'Verify', detail: 'independent agent re-runs tests and tries to refute claims' },
    { title: 'Fix', detail: 'only if the verifier found blockers/majors' },
  ],
}

const REPO = '/home/zhengyew/telelean'
const SCR = '/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn2'
const DOCS = REPO + '/verbatim_prompt_log/bundle_1/user_requested_documents'
const REPORTS = REPO + '/verbatim_prompt_log/bundle_1/subagent_reports'
const CLAUDE_BIN = '/home/zhengyew/.vscode/extensions/anthropic.claude-code-2.1.314-linux-x64/resources/native-binary/claude'

const COMMON = `
PROJECT. telelean is a VS Code extension (personal-use prototype) that shows a user's mental model as a board of ASSUMPTION / DERIVATION / GOAL nodes in three independently scrollable columns, backed by Lean 4 files (nodes are "@@ telelean" markup blocks in Lean comments), with a pluggable LLM harness that formalises nodes and proves goals. The design is approved. Design docs (read only the sections named in your task, not everything): ${DOCS}/02_design_decisions.md (decisions D-1..D-34, plus a "Prototype profile" section) and ${DOCS}/03_architecture.md (architecture; section numbers are cited below).

AMENDMENTS MADE BY THE USER THIS TURN (they override the docs):
1. D-23(a) changed: Claude is driven through the user's own installed Claude Code CLI in headless "-p" stream-json mode (the "learnharness pattern"), NOT the Claude Agent SDK (it is not installed; do not install it). The harness must be LLM-agnostic: a provider interface whose first provider is the Claude CLI, plus a Fake provider for tests. The user's binary: ${CLAUDE_BIN} (Claude Code 2.1.314; there is no claude on PATH).
2. Gate loop: every time the LLM claims to be finished, a non-LLM programmatic check runs (footprint must list only selected assumptions, no sorry, goal statement unchanged, new definitions flagged for the user). On failure: a small notice to the user and an automatic re-prompt to the LLM with the failure, up to a cap (default 3), then tell the user and revert the Lean code to the last safe state. (M2 work; keep interfaces compatible.)
3. D-33: a history dropdown with revert and a storage counter (M1/M2, not now). D-10 multi-subject: attempt in M1.
4. xvfb is installed (xvfb-run). mental_model/ is the sample workspace.

WHAT M0 IS. Spikes: short experiments proving that the risky technical pieces work on THIS machine, written as clean, typed, well-organised seed code that M1/M2 will build on (not throwaway hacks). If something cannot be made to work, finding that out precisely IS a valid result: report what you tried and the exact errors.

REPO STATE. ${REPO} is an npm-workspaces monorepo (root package.json, tsconfig.base.json, .gitignore). Node 24.22.2 + npm 11.19.1 at ~/.local/bin (on PATH). All approved packages are ALREADY installed in the root node_modules (pinned): typescript 6.0.3, esbuild 0.28.2, vite 8.3.5, @vitejs/plugin-react 6.1.2, react/react-dom 19.3.1 (+types), zustand 5.0.16, @atlaskit/pragmatic-drag-and-drop 4.0.0 (+ -auto-scroll 3.2.1, -hitbox 3.0.0), @vscode/codicons, @modelcontextprotocol/sdk 1.32.2, zod 4.6.7, diff 9.0.0, vitest 5.0.5, @playwright/test 1.64.1, @vscode/test-cli 0.0.15, @vscode/test-electron 3.1.0, @types/mocha, @types/vscode 1.140.0, @types/node 24.19.2, @types/vscode-webview. packages/runner exists (package.json "type":"module", tsconfig extending the base, vitest.config.ts that runs test/**/*.test.ts sequentially, src/index.ts). test-fixtures/spyro is a verified Lean 4.35 project (Model/Spyro/{Vocabulary,Main}.lean + Check/Normative.lean with the normative proof theorem Spyro.cynder_not_good.holds); it builds in ~1 s.

HARD RULES.
- RAM: this machine has crashed from RAM exhaustion before. Run "free -m" before heavy steps; run at most ONE heavy process at a time (one lake build, one VS Code test instance, one browser); set LEAN_NUM_THREADS=4 for Lean; never build or download Mathlib; kill only processes you started; make sure test processes exit.
- Quota/secrets: NEVER run the Claude CLI with a prompt (no "-p" runs, no interactive session, nothing that contacts Anthropic): that spends the user's subscription quota. Only "--help", "--version" and "<subcommand> --help" are allowed. Never read or print ~/.claude/.credentials.json or any token/secret.
- Installs: no global/sudo installs, no "npm install" or new dependencies (if you truly need one, report it in open_issues). Playwright must use the installed Chrome (channel "chrome"); never download browsers. @vscode/test-electron MAY download the VS Code 1.140.0 test build into packages/extension/.vscode-test (approved).
- Scope: write only inside your ASSIGNED PATHS. Do not edit packages/runner/src/index.ts, package.json files you don't own, the design docs, anything under verbatim_prompt_log/, ~/telelean_scripts, or user settings. No git commands in the repo.
- Lean: call the toolchain binaries directly (~/.elan/toolchains/leanprover--lean4---v4.35.0/bin/lake and .../lean), not the elan proxies, so ~/.elan/known-projects is not appended to (it has 36 lines now and must still have 36 at the end).
- Lean files with deliberate probes (#eval/run_cmd that write files, list $HOME, use the network) must be stored inert as *.lean.txt and only copied into a sandboxed shadow directory at test time; never open probe files with a Lean server.
- Temporary files go under ${SCR}/<your-label>/ (create it).
- Return your report as the structured output (do not write report files). Quote real command output in evidence; never claim a test passed unless you ran it.
`

const SPIKES = [
  {
    key: 'runlean',
    paths: 'packages/runner/src/lean/**, packages/runner/test/lean/**, test-fixtures/** (you may add files)',
    task: `
YOUR SPIKE: sandboxed Lean runs (03 section 8.4 "runLean", 8.5 gate rows G1/G3/G4, 02 D-24 and D-26). ASSIGNED PATHS: packages/runner/src/lean/**, packages/runner/test/lean/**, test-fixtures/**.
1. runLean (src/lean/runLean.ts): run an argv inside "systemd-run --user --scope --unit=telelean-<run>-<n> -p MemoryMax=<cap> -p MemorySwapMax=0 -- bwrap <profile>" using the exact mount allowlist of 03 section 8.4 (read it: ro /usr,/etc, tmpfs /tmp,/run,$HOME, --dir /root /run/user /var, ro ~/.elan, ro shadow sources, writable shadow/.lake, --unshare-all, --die-with-parent, --new-session, --clearenv with HOME and PATH). Parameters: shadowDir, argv, memoryMax (default "4G"), timeoutMs (default 120000), extra ro binds, env. Result: {status: "ok"|"failed"|"oom"|"timeout"|"could-not-start", exitCode, stdout, stderr, durationMs, peakMemoryBytes?}. Fail closed (could-not-start) without bwrap or a systemd user manager. Detect OOM reliably (cgroup memory.events oom_kill, or systemd's result) and report it distinctly. Timeout and cancel kill the whole scope ("systemctl --user kill telelean-<run>-*"); no stray processes may survive.
2. Shadow copy prototype (src/lean/shadow.ts): copy a Lean model project (only *.lean, lakefile.toml/.lean, lean-toolchain, lake-manifest.json; refuse symlinks; copy .lake/build if present) into a fresh directory.
3. Footprints (src/lean/footprint.ts): for given declaration names, generate a check file (import + "#print axioms <name>" lines), run it with the toolchain's "lake env lean" under runLean, parse into {decl -> axioms[]}, handling "does not depend on any axioms" and errors.
4. Comparator (src/lean/comparator.ts): get "lake comparator" running UNDER runLean on the fixture, as designed in gate step G4: a frozen challenge (statements, generated challenge module with theorem n.holds : n := sorry) plus an axiom whitelist; then (a) the honest normative proof is accepted, (b) a weakened goal is rejected, (c) a proof using an unselected axiom is rejected. Last turn a verifier got this working: start from ${REPORTS}/verification_workflow/artifacts/nested.sh and grep "comparator" in ${REPORTS}/verification_workflow/agents/verify-fix-verifier.md, ${REPORTS}/research_workflow/agents/r5-agent-protocol.md and r2-lean-semantics.md for the exact invocation (export via leanexport, flags, the nested-sandbox requirement for --dir /root /run/user /var). Distinguish "could not start" from "rejected".
5. Tests (vitest, sequential) in packages/runner/test/lean/: sandboxed build of the fixture succeeds (record time); footprint of Spyro.cynder_not_good.holds equals exactly [Classical.choice, Spyro.Character, Spyro.Game, Spyro.GoodAddition, Spyro.HasDarkPast, Spyro.IsPG, Spyro.Character.exists, Spyro.Game.exists, Spyro.cynder_dark_past.holds, Spyro.new_spyro_pg.holds, Spyro.pg_no_dark_past.holds] (set comparison); inert probes copied into a shadow: an #eval that writes a file into the real $HOME (must not appear there), one that lists $HOME (must see only the empty tmpfs) and one that tries the network/DNS (must fail); memory cap enforcement using a SMALL cap (e.g. 256M) on a command allocating ~600 MB (e.g. python3) gives status "oom"; a timeout gives "timeout" and leaves no processes; comparator cases (a)(b)(c); ~/.elan/known-projects still has 36 lines.
6. Typecheck your files (npx tsc -p packages/runner/tsconfig.json --noEmit; ignore errors in files you don't own) and run your tests: cd packages/runner && npx vitest run test/lean.`,
  },
  {
    key: 'claude-cli',
    paths: 'packages/runner/src/llm/**, packages/runner/test/llm/**, packages/runner/bin/**, scripts/smoke-claude.mjs',
    task: `
YOUR SPIKE: the LLM harness with the Claude Code CLI provider, entirely OFFLINE (03 sections 8.1-8.3 and 8.6; 02 D-23, D-24, D-25 for safeguards, applying amendment 1: CLI, not SDK). ASSIGNED PATHS: packages/runner/src/llm/**, packages/runner/test/llm/**, packages/runner/bin/**, scripts/smoke-claude.mjs (repo root).
1. Run "${CLAUDE_BIN} --help" (and relevant subcommand --help) and confirm which flags exist in 2.1.314; cross-check the official docs (code.claude.com/docs: CLI reference, headless mode, hooks, MCP, settings, env vars) with WebFetch where needed. Candidates: -p, --input-format stream-json, --output-format stream-json, --verbose, --include-partial-messages, --replay-user-messages, --model, --system-prompt(-file), --tools, --allowedTools, --disallowedTools, --permission-mode, --mcp-config, --strict-mcp-config, --settings, --setting-sources, --max-turns, --resume, --session-id, --effort. Never use --bare (it ignores the subscription login). Report a verified flag table.
2. Provider-agnostic types (src/llm/types.ts): LlmBackend / LlmSession / normalized LlmEvent (init {sessionId, model, auth info if any}, assistant text, tool use, tool result, usage, result {status, usage, cost estimate}, error) and the AgentToolHost interface (check_lean, ask_user, propose_assumption, freeze_statements, finish; 03 section 8.3; stub implementations are fine for M0).
3. ClaudeCliBackend (src/llm/claudeCli.ts): binary resolution (explicit setting -> newest ~/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude -> PATH -> ~/.local/bin/claude) with a --version check; environment sanitisation (strip ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL, CLAUDE_CODE_OAUTH_TOKEN, CLAUDE_CODE_USE_BEDROCK/_VERTEX/_FOUNDRY and similar provider switches, ELECTRON_RUN_AS_NODE, SNAP*, GTK_*, VS Code IPC variables; set CLAUDE_CODE_DISABLE_AUTO_MEMORY=1, ENABLE_CLAUDEAI_MCP_SERVERS=false and the other applicable ones from 03 section 8.2) so the user is never billed per token by accident; argv: built-in tools limited to Read/Glob/Grep/Edit/Write plus mcp__telelean__*, Bash/WebFetch/WebSearch/Agent/AskUserQuestion/NotebookEdit disallowed, permission mode dontAsk, no user/project setting sources, strict MCP config, custom system prompt, cwd = shadow dir, stream-json in and out; NDJSON parsing into LlmEvents; multi-turn send(); interrupt; close; resume(sessionId); spawn in its own process group so cleanup kills everything.
4. Tool server exposing AgentToolHost to the CLI as MCP tools. Preferred (03 section 8.2): a loopback HTTP MCP server (127.0.0.1, random port, per-run bearer token) using @modelcontextprotocol/sdk 1.32.2 in the same Node process; alternative: a stdio bridge. Choose and justify. Find out how the CLI behaves for a long-blocking tool call (ask_user may wait minutes): client timeouts (e.g. MCP_TOOL_TIMEOUT), keepalives; configure accordingly. Test offline with the MCP SDK client: list tools, ask_user blocks until the host resolves it (test a 30 s wait), finish.
5. File confinement: a PreToolUse command hook (installed via a generated --settings JSON file) denying Read/Glob/Grep/Edit/Write when the target (file_path, path, glob base, grep root) resolves via realpath (for new files: via the parent's realpath) outside the shadow dir, or into dotfiles, .lake/ or .telelean/. Verify the hook stdin/stdout/exit-code protocol in the docs. Test offline with synthetic hook inputs, including a symlink inside the shadow pointing outside, "..", absolute glob patterns.
6. FakeBackend (src/llm/fake.ts) replaying scripted steps, for tests.
7. scripts/smoke-claude.mjs: WRITE IT, DO NOT RUN IT, except with --dry-run (which prints the exact argv, env diff, MCP config and settings without contacting Claude; you may run that). The main session will run it later after informing the user. Using model claude-haiku-5-5, a short custom system prompt, max 6 turns and a 5-minute cap per scenario: (a) auth/plumbing: record the init event (session id, model, auth fields); Claude must call mcp__telelean__ask_user; the host answers after 75 s (proves long blocking waits work); then Claude calls mcp__telelean__finish. (b) confinement: Claude is asked to Read <shadow>/Model.lean (allowed) and /etc/hostname and ~/.bashrc (must be denied by the hook); verify from hook logs. (c) resume after reload: when the ask_user call arrives, kill the CLI (simulating a window reload), then --resume the session sending the answer as a user message; Claude must continue and call finish. Print a JSON summary: pass/fail per scenario, number of API requests, input/output/cache tokens and the CLI's cost estimate from result events, wall time. In your report, ESTIMATE the expected total token usage (measure the system prompt and tool schema sizes).
8. Tests (vitest) in packages/runner/test/llm/: argv assembly, env sanitisation, NDJSON parsing (synthetic lines shaped like the documented events), MCP server offline, hook decisions, FakeBackend. Typecheck (npx tsc -p packages/runner/tsconfig.json --noEmit; ignore errors in files you don't own); run: cd packages/runner && npx vitest run test/llm.`,
  },
  {
    key: 'board',
    paths: 'packages/core/**, packages/webview/**, packages/extension/**',
    task: `
YOUR SPIKE: the board prototype in a real VS Code webview (03 sections 2 and 7; 02 D-13, D-15, D-16, D-17). ASSIGNED PATHS: packages/core/**, packages/webview/**, packages/extension/** (create their package.json/tsconfig files; npm workspaces already include packages/*; do not run npm install). Research last turn benchmarked DOM columns + a custom SVG EdgeEngine (no graph library supports independently scrolling columns); its prototype is in ${REPORTS}/research_workflow/artifacts/r3-ui-graph/ and the findings in ${REPORTS}/research_workflow/agents/r3-ui-graph.md: start from it (it was written for this project, reuse is fine).
1. packages/core (pure TS, no vscode/Node APIs): the minimal TlNode/TlEdge/TlGraph types from 03 section 2 needed now, and the Spyro sample graph (03 section 3.3: pg-no-dark-past A code-less, cynder-dark-past A formalised, new-spyro-pg A formalised, cynder-not-good G formalised, with their Lean snippets) plus a generated large graph (about 25 cards per column) for scrolling tests.
2. packages/webview (React 19 + zustand + pragmatic-drag-and-drop; Vite build into packages/extension/dist/webview/): three columns Assumptions | Derivations | Goals, each independently scrollable; cards with the natural-language sentence first, a kind glyph, a blue aura when formalised, and a chevron that expands to show the Lean code (plain pre; Shiki later); arrows as an SVG overlay between cards in different columns (within-column arrows allowed, D-13b), dashed = declared, solid = verified; arrows follow column scrolling and resizing (rAF-batched), and when an endpoint is scrolled out of view draw a stub at the column edge instead of a misleading line; dragging a card onto another column requests a kind change (M0: update local state, highlight the drop zone, post a message); click selects, Ctrl/Cmd-click multi-selects; a tray section below the columns lists the selection with a target slot and a "These suffice" button (posts a message); an A|D|G prompt box (text field + segmented switch; Enter adds a card to that column and posts a message). Theme only via VS Code CSS variables (light/dark/high contrast). CSP-compatible: no inline scripts, nonce-based.
3. packages/extension: extension "telelean" (engines.vscode ^1.140.0, main dist/extension.js bundled to CJS by esbuild, vscode external), command "telelean: Open Board" (telelean.openBoard) opening a WebviewPanel with a strict CSP + nonce and localResourceRoots = dist/webview; versioned message protocol {v:1,type,payload}: host->webview "graph"; webview->host "ready", "kindChange", "addNode", "select", "theseSuffice"; log received messages to an OutputChannel. It must be loadable later via "Developer: Install Extension from Location..." (do NOT install it into the user's VS Code).
4. Tests: (i) Playwright (@playwright/test, channel "chrome", workers 1, headless) against a static harness page that loads the built bundle with a mock acquireVsCodeApi: scrolling one column leaves the other columns' scrollTop unchanged; after scrolling, every drawn arrow's endpoints coincide (within 2 px) with its cards' edges, and arrows with an off-screen endpoint render as stubs; dragging an Assumptions card onto Goals posts kindChange and moves the card; multi-select shows the tray with the right count and "These suffice" posts the selected ids; the A|D|G box adds a card to the chosen column; expanding shows the Lean code; formalised cards carry the aura. Save 2-3 screenshots (light and dark) under packages/webview/test-results/. (ii) Extension smoke with @vscode/test-cli + @vscode/test-electron and the VS Code 1.140.0 test build: run as "env -u ELECTRON_RUN_AS_NODE xvfb-run -a npx vscode-test" (the user's snap VS Code leaks ELECTRON_RUN_AS_NODE); assert the command opens the panel and the webview posts "ready" back (the bundle loads under the CSP). One VS Code test instance at a time, and make sure it exits.
5. Add "build" and "test" scripts to your packages.`,
  },
]

const BUILD = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    how_to_run_tests: { type: 'string' },
    test_output: { type: 'string', description: 'verbatim tail of the final test run(s)' },
    claims: { type: 'array', items: { type: 'object', properties: { claim: { type: 'string' }, evidence: { type: 'string' } }, required: ['claim', 'evidence'] } },
    deviations_from_design: { type: 'array', items: { type: 'string' } },
    open_issues: { type: 'array', items: { type: 'string' } },
    design_feedback: { type: 'array', items: { type: 'string' }, description: 'facts learned that should change the design docs' },
    extra: { type: 'string', description: 'spike-specific details, e.g. verified flag table, token estimate, timings' },
  },
  required: ['summary', 'files', 'how_to_run_tests', 'test_output', 'claims', 'deviations_from_design', 'open_issues', 'design_feedback'],
}

const VERIFY = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'needs-work', 'fail'] },
    reran_tests: { type: 'string', description: 'what you ran and the verbatim result tail' },
    probes: { type: 'array', items: { type: 'object', properties: { probe: { type: 'string' }, result: { type: 'string' } }, required: ['probe', 'result'] } },
    issues: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, description: { type: 'string' }, where: { type: 'string' }, suggested_fix: { type: 'string' } }, required: ['severity', 'description', 'suggested_fix'] } },
    notes: { type: 'string' },
  },
  required: ['verdict', 'reran_tests', 'probes', 'issues'],
}

const FIX = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    fixed: { type: 'array', items: { type: 'object', properties: { issue: { type: 'string' }, change: { type: 'string' } }, required: ['issue', 'change'] } },
    not_fixed: { type: 'array', items: { type: 'object', properties: { issue: { type: 'string' }, reason: { type: 'string' } }, required: ['issue', 'reason'] } },
    test_output: { type: 'string' },
  },
  required: ['summary', 'fixed', 'not_fixed', 'test_output'],
}

function verifyPrompt(s, b) {
  return `${COMMON}
YOUR ROLE: independent verifier of the "${s.key}" spike. You did not write it; be skeptical. Its task was:
${s.task}

The builder's report (JSON):
${JSON.stringify(b, null, 1)}

Do this: (1) re-run its tests from a clean state as described in how_to_run_tests and compare with the claims; (2) read the code for the key claims (are the safeguards really applied? do the tests assert something meaningful, or would they pass trivially?); (3) try to REFUTE the most important claims with 2-4 targeted probes of your own (examples: sandbox: can a build read a file under the real $HOME, reach the network, survive past the memory cap or timeout, leave stray processes; CLI harness: does the hook deny paths outside the shadow including via symlinks/relative paths/globs, is Bash really excluded from argv, are API-key variables really stripped, does the MCP server reject a missing/wrong bearer token; board: do columns really scroll independently and arrows track, does the webview load under the CSP in the real VS Code test instance). Report only: do NOT edit files in the assigned paths (${s.paths}); put any probe files under ${SCR}/verify-${s.key}/. Severity: blocker = the spike's main claim is false or a hard rule is broken; major = a real defect M1/M2 would inherit; minor = polish.`
}

function fixPrompt(s, b, v) {
  return `${COMMON}
YOUR ROLE: fix the "${s.key}" spike after independent verification. ASSIGNED PATHS: ${s.paths}. The original task was:
${s.task}

Builder's report (JSON):
${JSON.stringify(b, null, 1)}

Verifier's report (JSON):
${JSON.stringify(v, null, 1)}

Fix every blocker and major issue (and minors that are cheap), staying inside the assigned paths. If an issue is wrong or cannot be fixed now, say why in not_fixed. Re-run the spike's full test suite at the end and quote the result.`
}

const results = await pipeline(
  SPIKES,
  (s) => agent(`${COMMON}\n${s.task}`, { label: `build:${s.key}`, phase: 'Build', schema: BUILD }),
  (b, s) => (b ? agent(verifyPrompt(s, b), { label: `verify:${s.key}`, phase: 'Verify', schema: VERIFY }) : Promise.resolve(null)).then((v) => ({ b, v })),
  (r, s) => {
    const serious = r.v && r.v.issues && r.v.issues.some((i) => i.severity === 'blocker' || i.severity === 'major')
    if (!r.b || !serious) return { key: s.key, ...r, f: null }
    return agent(fixPrompt(s, r.b, r.v), { label: `fix:${s.key}`, phase: 'Fix', schema: FIX }).then((f) => ({ key: s.key, ...r, f }))
  },
)

return results.map((r, i) => r || { key: SPIKES[i].key, b: null, v: null, f: null })
