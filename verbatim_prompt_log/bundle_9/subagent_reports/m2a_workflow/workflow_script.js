export const meta = {
  name: 'telelean-m2a-plan-build',
  description: 'M2 part A: architect writes the M2 plan + frozen contracts, a reviewer fixes it, then one builder per work package (no real Claude calls)',
  phases: [
    { title: 'Plan', detail: 'architect: docs/m2-plan.md + contracts' },
    { title: 'Review plan', detail: 'reviewer checks against requirements and fixes the plan' },
    { title: 'Build', detail: 'one agent per work package, in parallel' },
  ],
}

const REPO = '/home/zhengyew/telelean'
const SCR = '/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9'
const DOCS = REPO + '/verbatim_prompt_log/bundle_1/user_requested_documents'

const SAFETY = `
SAFETY RULES FROM THE USER (mandatory; they apply to you and to anything you start):
- Never push anything to any remote repository: no "git push", no "git remote add", no "gh" commands, no PRs/issues/gists.
- Never put anything on the internet publicly and never send anything to a person: no emails, no messages through any app, no uploads through a browser or any web service, no pastebins, no posting to web APIs.
- No downloads, no new npm packages, no "npm install"; network only for reading documentation (WebFetch/WebSearch). If a package seems needed, report it in open_issues.
- NEVER run the Claude CLI with a prompt, never start a real LLM session, and never let a test do so: it spends the user's subscription quota. "--help"/"--version" and the CLI's "initialize"-free dry runs only. All automated tests use the FakeBackend or recorded streams (packages/runner/test/llm/fixtures/recorded-cli-2.1.314). The main session alone runs the real-Claude walkthrough later.
- Never read or print credentials or secrets (~/.claude/.credentials.json, tokens, keys).
- Write only inside your ASSIGNED PATHS plus your scratch dir ${SCR}/<your-label>/. Never touch the user's VS Code settings or installed extensions, ~/telelean_scripts, ~/.config, ~/.claude, ~/.elan, git global config. No sudo. Do NOT set npm_config_logs_max=0.
- Tests that launch Chrome or a VS Code test instance keep the existing isolation (HOME/XDG under scratch, ulimit -c 0); keep scratch copies small (never copy packages/extension/.vscode-test).
- RAM: this machine has crashed from RAM exhaustion before. "free -m" before heavy steps; at most ONE heavy process at a time; LEAN_NUM_THREADS=4; never Mathlib; kill only your own processes; leave none behind.
- Lean: toolchain binaries directly (~/.elan/toolchains/leanprover--lean4---v4.35.0/bin), never elan proxies. Git only in scratch/test repositories with GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 "-c commit.gpgsign=false -c core.hooksPath=/dev/null"; never in ${REPO} or ${REPO}/mental_model.
- Report every effect outside ${REPO} and your scratch dir. Structured output only; never claim a test passed unless you ran it.
`

const PROJECT = `
PROJECT. telelean: VS Code extension (personal-use prototype) showing a mental model as ASSUMPTION / DERIVATION / GOAL nodes in three columns, backed by Lean 4 files ("@@ telelean" blocks in Lean comments). Repo ${REPO} (npm workspaces core/runner/webview/extension).
DESIGN: ${DOCS}/02_design_decisions.md, ${DOCS}/03_architecture.md (section 8 = the LLM harness), ${REPO}/docs/design-amendments.md (A1: Claude via the user's own Claude Code CLI in -p stream-json mode behind an LLM-agnostic LlmBackend interface, NOT the Agent SDK; A2: the gate loop; overrides 02/03), ${REPO}/docs/m0-report.md (M0 facts that M2 must apply: CLI flags, MCP alwaysLoad + ENABLE_TOOL_SEARCH=false, per-server MCP timeout for long ask_user waits, the initialize account check before any prompt, the hooks-listing check, minimum CLI 2.1.295, environment stripping, host-enforced run caps because --max-turns counts per user turn, Grep/Glob search hidden files so Claude's shadow root must hold only model files with .lake/.telelean visible only inside the Lean sandbox, keeper process, comparator message wording, Lean errors cut to their first line must be fixed for retry prompts).
STATE: M1 is DONE (docs/m1-plan.md, docs/user-guide.md, docs/decisions-log.md; all suites pass): core markup/project/edit/export, runner semantic layer (sandboxed Lean refresh via .ilean + check file) and workspace (sidecars, history via git private refs, undo), extension host (commands, BoardPanel, edits), webview board (vocabulary group, cards with uses/copy/hover gloss/no-drag code, history dropdown, subjects, tray). M0 code for M2 already exists: packages/runner/src/llm (types, ClaudeCliBackend, loopback MCP tool server with bearer token, PreToolUse path guard, FakeBackend, smoke script scripts/smoke-claude.mjs) and packages/runner/src/lean (runLean sandbox, shadow copy prototype, footprints, comparator with freeze/challenge module).

M2 SCOPE ("one-shot These suffice" = the milestone where the user starts real use; 03 section 11 row M2, D-29, sections 8.1-8.6, D-5, D-6, D-19, D-20, D-21, D-23..D-26 with the Prototype profile, amendments A1/A2): shadow (per run, model files only, symlinks refused, git base commit, last 10 runs kept); the Claude CLI backend wired for real (binary resolution incl. the VS Code Claude extension's binary, preflight auth/hook checks, env sanitising, system prompt + context bundle, caps 80 turns / 25 checks / 20 min agent-active / 120 s per Lean job, cancel, resume after reload, usage + cost estimate display); FakeBackend for tests; agent tools check_lean / ask_user / freeze_statements / propose_assumption / finish; freeze + PROTOTYPE gate (G0 token denylist, G1 sandboxed build with budgets, G3 footprints within the permitted set + simple vocabulary rule + no sorry, G4 lake comparator against the freeze, G5 markup half: the user's words byte-identical, ids stable, lifecycle changes only as confirmed items); THE GATE LOOP (A2): every time the LLM claims to be finished the non-LLM checks run; on failure a small notice on the board and an automatic re-prompt with the exact failure; cap 3 attempts (setting), then tell the user and revert the shadow to the last state that passed; new definitions and proposed missing premises are QUESTIONS for the user, not retries; the user's real files change only on Accept; minimal review (each statement's sentence beside its Lean, explicit toggle); proposal overlay on the board + raw file diff (vscode.changes multi-diff) + report card (footprint incl. presuppositions, status); Accept / Feedback (text field, continues the session) / Discard; minimal ghost adoption (propose_assumption -> translucent "Claude suggests" card with a gate-checked proof that it closes the gap -> "I hold this" adopts it as an ASSUMPTION, re-freeze, re-prove); attempts history per goal (D-18); ask_user UI on the board (1-3 questions, options with plain consequences, free text, "Leave it open", Claude's guess shown only after answering, phenomenon tag) with answers recorded in .telelean/decisions.json (D-20, minimal); "These suffice" from the tray with 0+ premises and a target.
WALKTHROUGH TARGETS (D-29), as automated FakeBackend tests AND later a real-Claude run by the main session: on the Spyro sample, the normative reading of "PG games cannot have characters with dark pasts" -> goal proved, then G->D proposed; the literal reading -> "not proved" with a ghost premise; adopt it -> re-freeze -> proved.
M1 CARRY-OVER MINORS (webview/extension): (1) the delete dialog's "Nothing else refers to it." and the card's "Used by: Nothing uses it yet." ignore cardless lemmas and other subjects' users -> use the host's knowledge; (2) the kind-change question says "1 dependent ... rewrite them" -> singular/plural wording; (3) a kind change applies the user's choice to dependents the board dialog did not list -> list them (host-provided) before applying.
NOT in M2: model finder/countermodels, full review (back-translation), DECISIONs UI beyond recording, refine/supersede/merge/suspend, Formalise-first, full "Ask Claude..." (M3); Lean-editor features, CLI (M4); hardening (H).
`

const WP = { type: 'object', properties: {
  id: { type: 'string' }, title: { type: 'string' },
  owned_paths: { type: 'array', items: { type: 'string' } },
  brief: { type: 'string' }, acceptance_tests: { type: 'array', items: { type: 'string' } },
}, required: ['id', 'title', 'owned_paths', 'brief', 'acceptance_tests'] }
const PLAN = { type: 'object', properties: {
  plan_path: { type: 'string' }, summary: { type: 'string' },
  work_packages: { type: 'array', items: WP },
  contracts: { type: 'array', items: { type: 'string' } },
  integration_plan: { type: 'string' },
  minor_decisions: { type: 'array', items: { type: 'object', properties: { decision: { type: 'string' }, rationale: { type: 'string' } }, required: ['decision', 'rationale'] } },
  major_decisions_needing_user: { type: 'array', items: { type: 'string' } },
  real_claude_walkthrough: { type: 'string', description: 'exact procedure + quota estimate for the main session to run the real-Claude walkthrough after integration' },
  effects_outside_repo: { type: 'array', items: { type: 'string' } },
}, required: ['plan_path', 'summary', 'work_packages', 'contracts', 'integration_plan', 'minor_decisions', 'major_decisions_needing_user', 'real_claude_walkthrough', 'effects_outside_repo'] }
const BUILD = { type: 'object', properties: {
  summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } },
  how_to_run_tests: { type: 'string' }, test_output: { type: 'string' },
  acceptance: { type: 'array', items: { type: 'object', properties: { test: { type: 'string' }, status: { type: 'string', enum: ['pass', 'fail', 'not-done'] }, evidence: { type: 'string' } }, required: ['test', 'status', 'evidence'] } },
  contract_changes: { type: 'array', items: { type: 'string' } },
  minor_decisions: { type: 'array', items: { type: 'object', properties: { decision: { type: 'string' }, rationale: { type: 'string' } }, required: ['decision', 'rationale'] } },
  open_issues: { type: 'array', items: { type: 'string' } }, integration_notes: { type: 'string' },
  effects_outside_repo: { type: 'array', items: { type: 'string' } },
}, required: ['summary', 'files', 'how_to_run_tests', 'test_output', 'acceptance', 'contract_changes', 'minor_decisions', 'open_issues', 'integration_notes', 'effects_outside_repo'] }

phase('Plan')
const plan = await agent(`${SAFETY}\n${PROJECT}
YOUR ROLE: M2 architect. Do NOT implement the work packages; design them so 4-6 builders can work IN PARALLEL with disjoint owned paths, then an integrator wires them.
1. Read: 03 section 8 (all) and section 11; 02 Prototype profile, D-5, D-6, D-15, D-18..D-26, D-29; design-amendments.md; m0-report.md; docs/m1-plan.md (its contracts, protocol and section 14) and the M1 code; the M0 llm/lean code and its tests.
2. Write ${REPO}/docs/m2-plan.md: scope checklist (every M2 item, the gate loop, the walkthrough targets, the M1 carry-overs, each mapped to a work package and a test); the run state machine (preflight -> shadow -> formalise <-> ask_user -> freeze -> prove <-> check_lean -> finish -> gate -> retry loop (max 3) / revert -> review + proposal -> Accept/Feedback/Discard; ghost adoption -> re-freeze); the exact gate (prototype) and permitted-axiom computation from the freeze; the system prompt and context bundle (what leaves the machine; short tool descriptions); the protocol additions (run status, questions, proposal overlay, report card, attempts); how Accept applies the shadow diff to the real files through the M1 edit/history machinery (snapshot first, undoable); how all of this is tested with the FakeBackend (scripts for both walkthrough readings and for the cheating cases: added axiom, sorry, weakened goal, unselected assumption, belief tucked into a definition) without any real Claude call; risks; minor decisions.
3. Freeze contracts in code (types/signatures, stubs only where needed), keep every package compiling and the M1 suites passing (run core/runner tests at least).
4. Also write, in real_claude_walkthrough, the exact procedure the main session should follow afterwards to run the walkthrough with the user's real Claude CLI (model/effort choice, caps, expected number of requests and token estimate, what to record).
Owned paths: docs/m2-plan.md and contract files (packages/core/src, packages/runner/src/**/types.ts or similar).`, { label: 'plan:architect', phase: 'Plan', schema: PLAN })

phase('Review plan')
const reviewed = await agent(`${SAFETY}\n${PROJECT}
YOUR ROLE: independent reviewer of the M2 plan, empowered to FIX it. Architect's result:
${JSON.stringify(plan, null, 1)}
Check docs/m2-plan.md and the contracts against the M2 scope above, 03 section 8, the amendments (A1 CLI backend, A2 gate loop), the M0 facts, the Prototype profile and the M1 contracts. Look for: missing scope; soundness holes in the gate (could a cheating proof pass? is the permitted set computed from the freeze? is the goal statement frozen before proving? are presuppositions handled? can the user's real files change before Accept?); quota risks (any path where a test or default could call real Claude); conflicts in owned paths or hidden dependencies that break parallel building; untestable acceptance criteria; RAM/safety in tests. Fix every problem directly in the plan and contracts (keep everything compiling; run the typechecks and core/runner tests), then return the corrected full plan in the same schema.`, { label: 'plan:review', phase: 'Review plan', schema: PLAN })

const finalPlan = reviewed || plan
phase('Build')
const builds = await parallel(finalPlan.work_packages.slice(0, 6).map((wp) => () =>
  agent(`${SAFETY}\n${PROJECT}
YOUR ROLE: builder of M2 work package ${wp.id} "${wp.title}". Read ${REPO}/docs/m2-plan.md entirely first, then the design sections it cites. Contracts in ${finalPlan.contracts.join(', ')} are FROZEN (additive changes only, reported in contract_changes). Other builders work in parallel; test your package in isolation and do not depend on their unfinished code.
ASSIGNED PATHS: ${wp.owned_paths.join(', ')}
BRIEF:
${wp.brief}
ACCEPTANCE TESTS:
${wp.acceptance_tests.map((t, i) => (i + 1) + '. ' + t).join('\n')}
Finish by running your package's typecheck and tests and quoting the result.`, { label: `build:${wp.id}`, phase: 'Build', schema: BUILD })
))

return { plan, reviewed, builds: finalPlan.work_packages.slice(0, 6).map((wp, i) => ({ wp: wp.id, title: wp.title, result: builds[i] })) }
