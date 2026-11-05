export const meta = {
  name: 'telelean-m2b-integrate-verify',
  description: 'M2 part B: integrate, verify (gate soundness / run UX / safety+quota), fix by package, final check, up to 2 closing rounds; no real Claude',
  phases: [
    { title: 'Integrate', detail: 'wire packages, resolve open issues, e2e with FakeBackend, docs' },
    { title: 'Verify', detail: 'three independent lenses' },
    { title: 'Fix', detail: 'fixers partitioned by package' },
    { title: 'Final check', detail: 're-run everything; closing rounds if needed' },
  ],
}

const REPO = '/home/zhengyew/telelean'
const SCR = '/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9'
const DOCS = REPO + '/verbatim_prompt_log/bundle_1/user_requested_documents'
const M2A = REPO + '/verbatim_prompt_log/bundle_9/subagent_reports/m2a_workflow/agents'

const SAFETY = `
SAFETY RULES FROM THE USER (mandatory; they apply to you and to anything you start):
- Never push anything to any remote repository: no "git push", no "git remote add", no "gh" commands, no PRs/issues/gists.
- Never put anything on the internet publicly and never send anything to a person: no emails, no messages through any app, no uploads through a browser or any web service, no pastebins, no posting to web APIs.
- No downloads, no new npm packages, no "npm install"; network only for reading documentation.
- NEVER run the Claude CLI with a prompt, never start a real LLM session, never run scripts/walkthrough-claude.mjs or scripts/smoke-claude.mjs without --dry-run, never set TELELEAN_WALKTHROUGH_LIVE: real runs spend the user's subscription quota and are done by the main session only. Tests use the FakeBackend / recorded streams and TELELEAN_NO_REAL_CLAUDE=1.
- Never read or print credentials or secrets.
- Write only inside your ASSIGNED PATHS plus your scratch dir ${SCR}/<your-label>/. Never touch the user's VS Code settings or installed extensions, ~/telelean_scripts, ~/.config, ~/.claude, ~/.elan, git global config. No sudo. Do NOT set npm_config_logs_max=0.
- Tests that launch Chrome or a VS Code test instance keep the existing isolation (HOME/XDG under scratch, ulimit -c 0); keep scratch copies small (never copy packages/extension/.vscode-test). Check the real home folder is unchanged afterwards.
- RAM: this machine has crashed from RAM exhaustion before. "free -m" before heavy steps; at most ONE heavy process at a time; LEAN_NUM_THREADS=4; kill only your own processes; leave none behind.
- Lean: toolchain binaries directly, never elan proxies. Git only in scratch/test repositories with GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 "-c commit.gpgsign=false -c core.hooksPath=/dev/null"; never in ${REPO} or ${REPO}/mental_model.
- Report every effect outside ${REPO} and your scratch dir. Structured output only; never claim a test passed unless you ran it.
`
const PROJECT = `
PROJECT. telelean (VS Code extension; repo ${REPO}; npm workspaces core/runner/webview/extension). Design: ${DOCS}/02_design_decisions.md, ${DOCS}/03_architecture.md (section 8 = harness), ${REPO}/docs/design-amendments.md (A1 Claude CLI backend; A2 gate loop), ${REPO}/docs/m0-report.md, ${REPO}/docs/m1-plan.md, THE M2 PLAN ${REPO}/docs/m2-plan.md (scope checklist, run state machine, prototype gate G0/G1/G3/G4/G5-markup, permitted set from the freeze, system prompt and context bundle, protocol, Accept through M1 history, FakeBackend scripts for both walkthrough readings and the cheating cases, live walkthrough procedure, section 14 contract log).
STATE: M1 is done. M2 part A is done: six builders implemented WP1 core gate rules/proposal helpers/codecs/M1 carry-overs, WP2 runner shadow + Lean check engine, WP3 run controller/tool host/prompts/Claude backend, WP4 proposals + Accept, WP5 extension run wiring/consent/settings, WP6 webview tray/run panel/questions/review/proposal overlay. Their reports (JSON, with open issues and integration notes) are in ${M2A}/build-WP*.json; plan agents' reports there too. Known integration items include: 5 M1 integration tests needing confirmedDependents (carry-over 3); a WP3 manager.ts dispose() race (sync run.json write while async writes are queued) making WP5's AT5.9 fail; WP5's AT5.8 smoke not yet run; the tray now posts startRun (not theseSuffice); remove the CORE_SINGULAR_TEXTS gate; RunView.updatedAt; HISTORY_ACTION_LABEL for accept-proposal; plan section 14 rows missing from WP3.
M2 SCOPE (summary): shadow; Claude CLI backend (preflight, consent, env sanitising, caps, cancel, resume, usage); FakeBackend; tools check_lean/ask_user/freeze_statements/propose_assumption/finish; freeze + prototype gate; the A2 gate loop (non-LLM checks at every finish, notice + automatic re-prompt, cap 3, then tell the user and revert to the last passing state; definitions/premises are questions, not retries); real files change only on Accept; minimal review; proposal overlay + raw diff + report card; Accept/Feedback/Discard; ghost adoption; attempts history; ask_user UI + decisions.json; walkthrough targets (normative -> proved then G->D; literal -> not proved + ghost -> adopt -> re-freeze -> proved); M1 carry-overs.
`
const RESULT = { type: 'object', properties: {
  summary: { type: 'string' }, files_changed: { type: 'array', items: { type: 'string' } },
  test_runs: { type: 'string' }, resolved: { type: 'array', items: { type: 'string' } },
  open_issues: { type: 'array', items: { type: 'string' } },
  minor_decisions: { type: 'array', items: { type: 'object', properties: { decision: { type: 'string' }, rationale: { type: 'string' } }, required: ['decision', 'rationale'] } },
  effects_outside_repo: { type: 'array', items: { type: 'string' } },
}, required: ['summary', 'files_changed', 'test_runs', 'resolved', 'open_issues', 'minor_decisions', 'effects_outside_repo'] }
const VERIFY = { type: 'object', properties: {
  verdict: { type: 'string', enum: ['pass', 'needs-work', 'fail'] }, what_i_ran: { type: 'string' },
  issues: { type: 'array', items: { type: 'object', properties: {
    severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
    package: { type: 'string', enum: ['core', 'runner', 'extension', 'webview', 'docs'] },
    description: { type: 'string' }, evidence: { type: 'string' }, suggested_fix: { type: 'string' },
  }, required: ['severity', 'package', 'description', 'evidence', 'suggested_fix'] } },
  strengths: { type: 'array', items: { type: 'string' } },
  effects_outside_repo: { type: 'array', items: { type: 'string' } },
}, required: ['verdict', 'what_i_ran', 'issues', 'strengths', 'effects_outside_repo'] }

phase('Integrate')
const integ = await agent(`${SAFETY}\n${PROJECT}
YOUR ROLE: M2 integrator. ASSIGNED PATHS: everything under ${REPO} except verbatim_prompt_log/, docs/design-amendments.md and docs/m0-report.md.
1. Read docs/m2-plan.md (integration section) and every build-WP*.json report in ${M2A}. Wire everything end to end so "These suffice" on the board runs the real run controller with the shadow, gate, gate loop, review, proposal and Accept; the real path uses ClaudeCliBackend (after consent), and every test uses the FakeBackend with TELELEAN_NO_REAL_CLAUDE=1.
2. Resolve all cross-package open issues listed above and in the reports; append missing contract rows to plan section 14.
3. Rebuild everything (root npm run build) so packages/extension/dist is current, and run EVERY suite sequentially: core, runner (full), webview (typecheck/build/unit/Playwright), extension (typecheck/unit/smoke+e2e under xvfb). Make the FakeBackend end-to-end tests cover in the real VS Code test instance: normative walkthrough (question answered on the board -> proposal overlay -> review toggle -> raw diff -> Accept changes Main.lean -> history entry -> Undo byte-exact; G->D proposed); literal walkthrough (not proved -> ghost card -> I hold this -> re-freeze -> proved); one cheating script rejected with a notice and a retry, and the give-up path reverting after 3 attempts; Feedback continuing the session; Discard; cancel; a reload while a question is pending.
4. Run "node scripts/walkthrough-claude.mjs --dry-run" (both readings, FakeBackend, contacts nothing) and report its output. Do NOT run --binary-check or --live.
5. Update docs/user-guide.md with an M2 section (how to run "These suffice", consent, what leaves the machine, questions, review, proposal, Accept/Feedback/Discard, ghosts, attempts, notices and the retry/revert loop, cancel, usage/quota display, settings, limits) and docs/decisions-log.md with all M2 minor decisions (from plan + reports + yours), grouped, one line each with rationale.`, { label: 'integrate', phase: 'Integrate', schema: RESULT })

phase('Verify')
const LENSES = [
  { key: 'gate', text: 'LENS: gate soundness and Lean. With FakeBackend scripts (write your own in scratch), try to get a "proved" verdict or an Accept that changes the user\'s files with: an added axiom; sorry/admit; a weakened goal statement (both abbrev and theorem type); an unselected assumption; a belief tucked into a definition (new def on the statement path, and existing vocabulary turned into a def); native_decide/decide +native; #eval/run_cmd/initialize; set_option limits; editing other subjects, Model.lean, lakefile or toolchain; changing the user\'s natural-language text or ids; renaming/removing existing declarations; a proof that only works because of a presupposition not shown; TOCTOU between gate and Accept (shadow changes after the gate passed; user edits the real file during review). Also check the permitted-set computation, the freeze, ghost adoption (gap proof really closes the gap), and the retry/revert loop.' },
  { key: 'ux', text: 'LENS: the M2 user experience in the real VS Code test instance (isolated HOME, xvfb, FakeBackend): run "These suffice" from the tray, consent dialog, run panel states, questions (options, free text, Leave it open, guess shown after answering), notices for failed attempts and the give-up revert, proposal overlay and ghost cards, review toggle, raw diff, report card, Accept/Feedback/Discard, attempts history, cancel, reload mid-run. Take screenshots (light/dark) into scratch and LOOK at them. Check that docs/user-guide.md is accurate for M2 and that M1 still works (spot-check).' },
  { key: 'safety', text: 'LENS: safety and quota. Prove no automated path can start the real Claude CLI (grep for spawn paths; run the suites with a fake "claude" earlier on PATH that records invocations; check TELELEAN_NO_REAL_CLAUDE handling, the consent gate, and that walkthrough/smoke scripts refuse live mode without the explicit switch). Check the CLI argv/env that WOULD be used (dry run): no --bare, no Bash/Web tools, dontAsk, no setting sources, strict MCP config, alwaysLoad, sanitised env, minimum version check, path guard confining file tools to the shadow (symlinks, .., hidden files, Grep/Glob roots). Check the user\'s real files and git state are untouched before Accept, that shadows are cleaned (last 10 runs), that cancel/deactivate leave no processes or units, RAM use of a run, and that nothing writes outside the model folder, extension storage and scratch.' },
]
const verdicts = await parallel(LENSES.map((l) => () => agent(`${SAFETY}\n${PROJECT}
YOUR ROLE: independent M2 verifier. Be skeptical and concrete. Report only: do NOT edit files under ${REPO} (probes and copies in ${SCR}/m2verify-${l.key}/). Integrator's report:
${JSON.stringify(integ, null, 1)}
${l.text}
Severity: blocker = soundness hole (a cheating proof passes or user files change without Accept), a scope item missing/broken, a quota leak, or a safety rule broken; major = a real defect the user would hit; minor = polish. Give each issue the package that must fix it.`, { label: `verify:${l.key}`, phase: 'Verify', schema: VERIFY })))

let issues = verdicts.filter(Boolean).flatMap((v, i) => v.issues.map((x) => ({ ...x, lens: LENSES[i].key })))
log(`${issues.length} issues (${issues.filter((x) => x.severity !== 'minor').length} blocker/major)`)

const GROUPS = [
  { key: 'core+runner+docs', pkgs: ['core', 'runner', 'docs'], paths: 'packages/core/**, packages/runner/**, scripts/**, mental_model/** (only if a sample fix is needed), test-fixtures/**, docs/m2-plan.md, docs/user-guide.md, docs/decisions-log.md' },
  { key: 'extension+webview', pkgs: ['extension', 'webview'], paths: 'packages/extension/** (including dist), packages/webview/**' },
]
const rounds = []
for (let round = 1; round <= 3; round++) {
  phase('Fix')
  const fixes = await parallel(GROUPS.map((g) => () => {
    const mine = issues.filter((x) => g.pkgs.includes(x.package))
    if (!mine.length) return Promise.resolve(null)
    return agent(`${SAFETY}\n${PROJECT}
YOUR ROLE: M2 fixer (round ${round}) for ${g.key}. ASSIGNED PATHS: ${g.paths}. Another fixer works in parallel on the other packages: stay inside your paths; describe needed changes outside them in open_issues. Fix every blocker and major issue, and cheap minors; if an issue is wrong say why. When done, rebuild (root npm run build if you touched sources bundled into the extension) and re-run the affected suites, quoting results. Issues:
${JSON.stringify(mine, null, 1)}`, { label: `fix-${round}:${g.key}`, phase: 'Fix', schema: RESULT })
  }))
  phase('Final check')
  const fin = await agent(`${SAFETY}\n${PROJECT}
YOUR ROLE: M2 final verifier (round ${round}). Report only. Rebuild from clean (root npm run build), re-run EVERY suite sequentially (core; runner full; webview typecheck/build/unit/Playwright; extension typecheck/unit/smoke+e2e under xvfb with isolated HOME), run "node scripts/walkthrough-claude.mjs --dry-run", confirm each blocker/major below is really fixed by running its scenario, re-try the three most dangerous gate cheats yourself (added axiom, weakened goal, existing vocabulary turned into a def), confirm no automated path invoked a real claude binary, and that the real home folder and ${REPO}/mental_model (not a git repo) are unchanged. Also report any cross-package open_issues the fixers left. Issues raised:
${JSON.stringify(issues.filter((x) => x.severity !== 'minor'), null, 1)}
Fixers' reports:
${JSON.stringify(fixes, null, 1)}`, { label: `final-${round}`, phase: 'Final check', schema: VERIFY })
  rounds.push({ fixes, fin })
  const serious = (fin && fin.issues || []).filter((x) => x.severity !== 'minor')
  if (fin && fin.verdict === 'pass' && !serious.length) break
  issues = (fin && fin.issues || []).map((x) => ({ ...x, lens: 'final' }))
}
return { integ, verdicts, rounds }
