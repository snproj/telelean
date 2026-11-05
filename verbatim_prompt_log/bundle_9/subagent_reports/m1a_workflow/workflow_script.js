export const meta = {
  name: 'telelean-m1a-plan-build',
  description: 'M1 part A: architect writes the M1 plan + frozen contracts, a reviewer fixes the plan, then one builder per work package implements with tests',
  phases: [
    { title: 'Plan', detail: 'architect: docs/m1-plan.md + contract types' },
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
- Never put anything on the internet publicly and never send anything to a person: no emails, no messages through any app, no uploading files through a browser or any web service, no pastebins, no posting to web APIs.
- Network use is limited to reading documentation (WebFetch/WebSearch). No downloads and no new npm packages: if you believe one is needed, STOP that part and report it in open_issues instead (the main session will ask the user).
- Never run the Claude CLI with a prompt (it spends the user's subscription quota); "--help"/"--version" only. Real-Claude runs are done only by the main session.
- Never read or print credentials or secrets (~/.claude/.credentials.json, tokens, keys).
- Write only inside your ASSIGNED PATHS plus your scratch dir ${SCR}/<your-label>/. Never touch the user's VS Code settings or installed extensions, ~/telelean_scripts, ~/.config, ~/.claude, ~/.elan, ~/.npm config, git global config. No sudo, no global installs, no "npm install".
- Tests that launch Chrome (Playwright) or a VS Code test instance must use an isolated HOME and XDG_CONFIG_HOME/XDG_DATA_HOME/XDG_CACHE_HOME under a scratch/test dir and "ulimit -c 0", so nothing lands in the user's real home folder (last turn a crashed headless Chrome wrote crash dumps into ~/.config/google-chrome and the test VS Code's built-in Copilot wrote logs into ~/.copilot). Where possible also disable the test VS Code's built-in Copilot/chat and telemetry.
- RAM: this machine has crashed from RAM exhaustion before. Check "free -m" before heavy steps; run at most ONE heavy process at a time (one lake build, one VS Code test instance, one browser); LEAN_NUM_THREADS=4; never build or download Mathlib; kill only processes you started; make sure test processes exit.
- Lean: call the toolchain binaries directly (~/.elan/toolchains/leanprover--lean4---v4.35.0/bin/{lake,lean}), never the elan proxies.
- Git, only where your task needs it (e.g. history snapshots in TEST repositories under a scratch dir): local only, always "-c commit.gpgsign=false -c core.hooksPath=/dev/null" plus an explicit author; never modify global git config; never add remotes. Do not run git in ${REPO} itself (it is not a git repository and must stay that way).
- Report in your structured output every effect you caused outside ${REPO} and your scratch dir (files written, processes left behind, downloads), even if harmless.
- Return your report as the structured output; do not write report files. Never claim a test passed unless you ran it; quote real output.
`

const PROJECT = `
PROJECT. telelean is a VS Code extension (personal-use prototype) that shows a user's mental model as a board of ASSUMPTION / DERIVATION / GOAL nodes in three independently scrollable columns, backed by Lean 4 files (nodes are "@@ telelean" markup blocks inside Lean comments), with an LLM harness (M2) that formalises nodes and proves goals. Repo: ${REPO} (npm workspaces: packages/core, packages/runner, packages/webview, packages/extension; Node 24.22.2 at ~/.local/bin; all approved npm packages already installed at the root; test-fixtures/spyro is a verified Lean 4.35 project).
DESIGN SOURCES (approved by the user): ${DOCS}/02_design_decisions.md (decisions D-1..D-34 + "Prototype profile"), ${DOCS}/03_architecture.md (architecture), ${REPO}/docs/design-amendments.md (the user's turn-2 amendments A1-A8, which override 02/03), ${REPO}/docs/m0-report.md (M0 results + "Design changes learned in M0", which M1 must apply).
M0 CODE (already working, tested): packages/runner/src/lean (runLean sandbox via systemd-run + bwrap with keeper/setpriv, shadow copy, #print-axioms footprints, lake comparator), packages/runner/src/llm (Claude CLI backend, MCP tool server, path guard, fake backend; M2 material), packages/core (types, protocol v1, Spyro samples), packages/webview (React board prototype: columns, SVG edge engine, drag, selection tray, A|D|G box), packages/extension ("telelean: Open Board" with a static sample). The user has installed packages/extension in their VS Code via "Install Extension from Location", so rebuilt dist/ is what they will see after a reload.

M1 SCOPE ("map without AI", the first usable milestone; 03 section 11 row M1 + D-29): core library (markup parser/serializer/binder/validator, graph, edits, graph.json export); runLean + memory guard; Initialize command; board (3 columns, vocabulary group, cards, expand-to-Lean, aura and glyphs, declared + verified arrows); A/D/G box with stance and why; edit text/rationale; delete; drag re-order; kind changes per D-11 (A->D stays pending until you write a proof); Undo; tray; refresh via build + check file; graph.json. PLUS the user's amendments: D-10 several subjects per project with a subject picker (attempt; fall back to one subject if too complex), D-33 history dropdown with revert (revert itself undoable) and a storage counter per subject and overall (disk, git private refs refs/telelean/..., never touching the user's branches/index/hooks; Initialize offers git init). PLUS the user's turn-9 requests for the cards: (1) click-and-drag inside the expanded Lean code must NOT drag the card but select text normally (first step towards ctrl+click / editing in cards later); (2) a per-card "uses:" line listing the vocabulary that card's Lean statement uses, computed from Lean (not hard-coded), truncated inline like "HasDarkPast, cynder, ..." with a dropdown listing all; (3) a copy-to-clipboard button on the expanded Lean code; (4) when practical: hovering an identifier in the expanded Lean shows its gloss, and clicking it highlights the item in the Vocabulary group. The sample model workspace is ${REPO}/mental_model/ (currently empty; it should become the user's Spyro walkthrough as subject Spyro, starting state: 3 assumptions incl. one code-less, 1 unproved goal; see 03 section 3.3 and test-fixtures/spyro).
NOT in M1: anything calling an LLM (M2), refine/supersede/merge/suspend (M3), model finder (M3), Lean-editor integration and CLI (M4), Shiki (M4: plain code block is fine), hardening (H).
`

const WP = { type: 'object', properties: {
  id: { type: 'string' }, title: { type: 'string' },
  owned_paths: { type: 'array', items: { type: 'string' } },
  brief: { type: 'string', description: 'complete self-contained instructions for the builder, referencing plan sections' },
  acceptance_tests: { type: 'array', items: { type: 'string' } },
}, required: ['id', 'title', 'owned_paths', 'brief', 'acceptance_tests'] }

const PLAN = { type: 'object', properties: {
  plan_path: { type: 'string' }, summary: { type: 'string' },
  work_packages: { type: 'array', items: WP, description: '4 to 6 packages that can be built IN PARALLEL with no overlapping owned paths' },
  contracts: { type: 'array', items: { type: 'string' }, description: 'files containing the frozen contracts (types/signatures) all builders code against' },
  integration_plan: { type: 'string', description: 'what the later integration stage must wire and test end to end' },
  minor_decisions: { type: 'array', items: { type: 'object', properties: { decision: { type: 'string' }, rationale: { type: 'string' } }, required: ['decision', 'rationale'] } },
  major_decisions_needing_user: { type: 'array', items: { type: 'string' } },
  effects_outside_repo: { type: 'array', items: { type: 'string' } },
}, required: ['plan_path', 'summary', 'work_packages', 'contracts', 'integration_plan', 'minor_decisions', 'major_decisions_needing_user', 'effects_outside_repo'] }

const BUILD = { type: 'object', properties: {
  summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } },
  how_to_run_tests: { type: 'string' }, test_output: { type: 'string', description: 'verbatim tail of the final test run(s)' },
  acceptance: { type: 'array', items: { type: 'object', properties: { test: { type: 'string' }, status: { type: 'string', enum: ['pass', 'fail', 'not-done'] }, evidence: { type: 'string' } }, required: ['test', 'status', 'evidence'] } },
  contract_changes: { type: 'array', items: { type: 'string' }, description: 'any change you had to make to frozen contracts (should be none or additive), with reason' },
  minor_decisions: { type: 'array', items: { type: 'object', properties: { decision: { type: 'string' }, rationale: { type: 'string' } }, required: ['decision', 'rationale'] } },
  open_issues: { type: 'array', items: { type: 'string' } },
  integration_notes: { type: 'string', description: 'what the integrator must know to wire your package' },
  effects_outside_repo: { type: 'array', items: { type: 'string' } },
}, required: ['summary', 'files', 'how_to_run_tests', 'test_output', 'acceptance', 'contract_changes', 'minor_decisions', 'open_issues', 'integration_notes', 'effects_outside_repo'] }

phase('Plan')
const plan = await agent(`${SAFETY}\n${PROJECT}
YOUR ROLE: M1 architect. Do NOT implement the work packages; design them so 4-6 builders can work IN PARALLEL without conflicts, then an integrator wires them.
1. Read carefully: 02 (Prototype profile; D-1..D-5, D-7..D-22, D-27, D-28, D-33), 03 sections 0-7 and 9-13, design-amendments.md, m0-report.md, and the M0 code in packages/*. Also the research reference parser for the markup and its tests: grep the research artifacts under ${REPO}/verbatim_prompt_log/bundle_1/subagent_reports/research_workflow/artifacts/r4-markup-lsp/ (Python reference parser + 20 tests; lexing cases) and ${REPO}/verbatim_prompt_log/bundle_1/subagent_reports/verification_workflow/DISPOSITIONS.md for the escape rule (the serialized escape of "/-" inside block text uses the 7 characters backslash u 0 0 2 f -).
2. Write ${REPO}/docs/m1-plan.md: scope checklist (every M1 item + amendments + the 4 card requests, each mapped to a work package and a test); architecture of the M1 data flow (files -> parse/bind -> Lean refresh in the runLean sandbox via a telelean-generated check file that reports per-declaration kind, footprints (#print axioms or collectAxioms), sorry use, and the vocabulary constants each statement uses -> graph with derived statuses (D-15) -> board; board actions -> core edits -> WorkspaceEdit/file writes -> snapshot (D-33) -> refresh); the D-11 kind-change rules as implementable logic; Undo vs history semantics; subjects (D-10) layout and picker; Initialize scaffold contents; .telelean/ sidecars (D-12) used in M1; protocol v1 additions; how the webview gets per-card vocabulary and glosses; how tests isolate HOME for Chrome and VS Code; work packages with exact owned paths (no overlaps; one package owns packages/extension/dist/webview output if the webview builds into it); risks.
3. Freeze contracts IN CODE so builders share them: update/add TypeScript types and function signatures in packages/core/src (e.g. model/protocol/graph/edit/semantic-facts types) and minimal interface files for runner APIs, with stub implementations only where needed to compile. Run "npx tsc -p packages/core/tsconfig.json --noEmit" (and other packages' typechecks) so the repo still compiles and M0 tests still pass (cd packages/core && npm test; cd packages/runner && npx vitest run --silent may take ~70 s; run it).
4. Each work package's "brief" must be self-contained (builders read the plan too) and its acceptance tests concrete. Suggested split (adapt if better): WP-markup (core markup lexer/parser/serializer/binder/validator + the ported tests), WP-graph (core graph build/statuses/diff, edits incl. D-11, graph.json export + JSON schema), WP-semantic (runner: workspace index, Lean refresh via check file, Initialize scaffold, history snapshots/revert/storage counter), WP-extension (commands, EditService, refresh triggers, BoardPanel wiring, clipboard via host, opt-in per folder, isolated test profile), WP-webview (all board UI incl. vocabulary group and the 4 card requests, history dropdown, subject picker, A/D/G with stance/why, inline edit, delete, re-order, kind-change drop zones with D-11 impact text, Undo, tray with presuppositions).
Owned paths for you: ${REPO}/docs/m1-plan.md and contract files in packages/core/src (and minimal interface stubs elsewhere if essential). Record minor decisions (for a decisions log the user reads later) and any major decision that genuinely needs the user.`, { label: 'plan:architect', phase: 'Plan', schema: PLAN })

phase('Review plan')
const reviewed = await agent(`${SAFETY}\n${PROJECT}
YOUR ROLE: independent reviewer of the M1 plan, empowered to FIX it. The architect's result:
${JSON.stringify(plan, null, 1)}
Check docs/m1-plan.md and the contract code against: the M1 row of 03 section 11, the relevant 02 decisions (D-5, D-8..D-22, D-28, D-33), the amendments A1-A8, the M0 lessons, and the user's 4 card requests. Look for: missing scope items; contracts that will not support a scope item; overlapping owned paths or hidden dependencies that break parallel building (e.g. two packages editing the same file, a builder needing another's unfinished output to test); untestable acceptance criteria; Lean-semantics mistakes (footprints, statuses, D-2(b) encoding, presuppositions, vocabulary computation); unsafe test setups (HOME isolation, RAM). Fix every problem directly in docs/m1-plan.md and the contract files (keep the repo compiling: run the typechecks), then return the corrected full plan in the same schema (work_packages must be the final, complete briefs the builders will receive). Add your own minor decisions to minor_decisions. Owned paths: the same as the architect's.`, { label: 'plan:review', phase: 'Review plan', schema: PLAN })

const finalPlan = reviewed || plan
phase('Build')
const builds = await parallel(finalPlan.work_packages.slice(0, 6).map((wp) => () =>
  agent(`${SAFETY}\n${PROJECT}
YOUR ROLE: builder of work package ${wp.id} "${wp.title}". The full plan is ${REPO}/docs/m1-plan.md (read it entirely first, then the design sections it cites). The contracts in ${finalPlan.contracts.join(', ')} are FROZEN: code against them; if a change is unavoidable keep it additive and report it in contract_changes. Other builders work in parallel on the other packages, so other parts of the repo may be in flux: test your package in isolation (mocks/fixtures), and do not depend on their unfinished code.
ASSIGNED PATHS (write only here + your scratch dir): ${wp.owned_paths.join(', ')}
BRIEF:
${wp.brief}
ACCEPTANCE TESTS (implement them as automated tests where possible and run them):
${wp.acceptance_tests.map((t, i) => (i + 1) + '. ' + t).join('\n')}
Write clean, typed, documented code matching the existing style. Finish by running your package's typecheck and tests and quoting the result.`, { label: `build:${wp.id}`, phase: 'Build', schema: BUILD })
))

return { plan, reviewed, builds: finalPlan.work_packages.slice(0, 6).map((wp, i) => ({ wp: wp.id, title: wp.title, result: builds[i] })) }
