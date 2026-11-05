export const meta = {
  name: 'telelean-m2c-close',
  description: 'M2 closing: make the run build seed robust (or off by default), fix remaining minors, align docs with code, verify (up to 2 rounds); no real Claude',
  phases: [
    { title: 'Fix', detail: 'seed race, scope leak, accepted flag, e2e race test, docs' },
    { title: 'Verify', detail: 'independent re-check and full suites' },
  ],
}

const REPO = '/home/zhengyew/telelean'
const SCR = '/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9'
const M2B = REPO + '/verbatim_prompt_log/bundle_9/subagent_reports/m2b_workflow/agents'

const SAFETY = `
SAFETY RULES FROM THE USER (mandatory; they apply to you and to anything you start):
- Never push anything to any remote repository: no "git push", no "git remote add", no "gh" commands, no PRs/issues/gists.
- Never put anything on the internet publicly and never send anything to a person: no emails, no messages through any app, no uploads through a browser or any web service, no pastebins, no posting to web APIs.
- No downloads, no new npm packages, no "npm install"; network only for reading documentation.
- NEVER run the Claude CLI with a prompt or start a real LLM session; never run scripts/walkthrough-claude.mjs or scripts/smoke-claude.mjs live; never set TELELEAN_WALKTHROUGH_LIVE or TELELEAN_SMOKE_LIVE yourself (the two script tests test/run/walkthroughScript.test.ts and smokeScript.test.ts will be run by the main session; skip them). Tests use the FakeBackend with TELELEAN_NO_REAL_CLAUDE=1.
- Never read or print credentials or secrets.
- Write only inside your ASSIGNED PATHS plus your scratch dir ${SCR}/<your-label>/. Never touch the user's VS Code settings or installed extensions, ~/telelean_scripts, ~/.config, ~/.claude, ~/.elan, git global config. No sudo. Do NOT set npm_config_logs_max=0.
- Tests that launch Chrome or a VS Code test instance keep the existing isolation (HOME/XDG under scratch, ulimit -c 0); never copy packages/extension/.vscode-test. Check the real home folder is unchanged afterwards.
- RAM: at most ONE heavy process at a time; "free -m" before heavy steps; LEAN_NUM_THREADS=4; kill only your own processes; leave none behind (including telelean-* systemd scopes you caused).
- Lean: toolchain binaries directly, never elan proxies. Git only in scratch/test repositories with GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 "-c commit.gpgsign=false -c core.hooksPath=/dev/null"; never in ${REPO} or ${REPO}/mental_model.
- Report every effect outside ${REPO} and your scratch dir. Structured output only; never claim a test passed unless you ran it.
`
const CONTEXT = `
PROJECT. telelean (VS Code extension; repo ${REPO}; npm workspaces core/runner/webview/extension). M1 is done; M2 ("These suffice" with the gate, gate loop, review, proposal, Accept, ghosts) is integrated and verified over three rounds: the gate refused all 22 cheat variants, no real Claude was ever started. Plans: docs/m2-plan.md (section 3 = the gate; section 14 = contract log), docs/user-guide.md, docs/decisions-log.md. The last verifier's report: ${M2B}/final-3.json; previous: final-2.json, fix-3-*.json.
`
const ISSUES = `
OPEN ITEMS TO CLOSE:
1. [major, runner] The run shadow's build seed from the user's live .lake/build is not reliable: the stability check (compare file lists before/after copy) is racy (test/shadow/seed.test.ts 'no seed is partial' is flaky: a 400-file seed where 401 were expected), and with an outside lake build running, 98 of 99 used seeds were snapshots of a build in progress. Make it robust in the simplest safe way. PREFERRED unless a provably reliable check is easy: do not seed from the user's .lake/build by default (build the shadow mirror from scratch; small models build in ~1-2 s), keep seeding only behind a setting (off) or only from telelean's own last refresh output taken under telelean's refresh lock when no other lake process touched it, and make the seed test deterministic. Whatever you choose, a partial or mixed seed must never be used, and a seed problem must never be reported as a gate rejection (environment at worst). Record the decision in docs/decisions-log.md.
2. [minor, docs] Make every doc/code comment claim about seeds match the new behaviour.
3. [minor, runner] runLean can leave a telelean-* systemd scope behind when a Lean job is cancelled just as it starts: make cancellation stop/reset the exact unit even in that window; add a test.
4. [minor, webview] Use core's RunView.accepted { changedFiles } to choose between 'Accepted' and 'Recorded' instead of parsing the runner's notice wording; remove that coupling note from plan section 14 or mark it resolved.
5. [minor, extension] Add a VS Code e2e test that starts a run WHILE Lean is refreshing (forced race, no wait for idle) and passes.
6. [minor, docs] Make docs/m2-plan.md section 3 (the gate, permitted set, rules, carriers, new-axiom rule, permitted set taking only proofs the user already had, examples handling) match the code exactly, as promised to the user; note the still-open user decision "where should Raw Lean diff... open (beside the board, current default, or as a tab in the board's group)" in docs/decisions-log.md under a heading for decisions awaiting the user.
Then rebuild everything (root npm run build, npm logs redirected to scratch via npm_config_logs_dir) and run every suite sequentially (core; runner full except the two script tests; webview typecheck/build/unit/Playwright; extension typecheck/unit/smoke+e2e) and "node scripts/walkthrough-claude.mjs --dry-run".
`
const RESULT = { type: 'object', properties: {
  summary: { type: 'string' }, files_changed: { type: 'array', items: { type: 'string' } },
  test_runs: { type: 'string' }, resolved: { type: 'array', items: { type: 'string' } },
  open_issues: { type: 'array', items: { type: 'string' } },
  minor_decisions: { type: 'array', items: { type: 'object', properties: { decision: { type: 'string' }, rationale: { type: 'string' } }, required: ['decision', 'rationale'] } },
  effects_outside_repo: { type: 'array', items: { type: 'string' } },
}, required: ['summary', 'files_changed', 'test_runs', 'resolved', 'open_issues', 'minor_decisions', 'effects_outside_repo'] }
const VERIFY = { type: 'object', properties: {
  verdict: { type: 'string', enum: ['pass', 'needs-work'] }, what_i_ran: { type: 'string' },
  issues: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, description: { type: 'string' }, evidence: { type: 'string' }, suggested_fix: { type: 'string' } }, required: ['severity', 'description', 'evidence', 'suggested_fix'] } },
  effects_outside_repo: { type: 'array', items: { type: 'string' } },
}, required: ['verdict', 'what_i_ran', 'issues', 'effects_outside_repo'] }

const rounds = []
let todo = ISSUES
for (let round = 1; round <= 2; round++) {
  phase('Fix')
  const fix = await agent(`${SAFETY}\n${CONTEXT}\nYOUR ROLE: M2 closing fixer (round ${round}). ASSIGNED PATHS: everything under ${REPO} except verbatim_prompt_log/, docs/design-amendments.md, docs/m0-report.md, docs/m1-plan.md.\n${todo}`, { label: `m2close-fix-${round}`, phase: 'Fix', schema: RESULT })
  phase('Verify')
  const ver = await agent(`${SAFETY}\n${CONTEXT}\nYOUR ROLE: independent verifier of the M2 closing fixes (round ${round}). Report only: no edits under ${REPO}. Check each item for real: run the seed tests at least 10 times; reproduce the outside-lake-build race and confirm no partial/mixed seed is ever used; cancel Lean jobs at start and confirm no telelean-* unit is left; check the accepted/recorded display without notice parsing; run the new race e2e; read docs/m2-plan.md section 3 against core/src/gate and runner/src/gate code. Then rebuild from clean and re-run every suite sequentially (skip the two script tests), plus the walkthrough --dry-run, and re-try 3 gate cheats (added axiom, weakened goal, vocabulary turned into a def). Items:\n${todo}\nFixer's report:\n${JSON.stringify(fix, null, 1)}`, { label: `m2close-verify-${round}`, phase: 'Verify', schema: VERIFY })
  rounds.push({ fix, ver })
  const serious = (ver && ver.issues || []).filter((i) => i.severity !== 'minor')
  if (ver && ver.verdict === 'pass' && !serious.length) break
  todo = `OPEN ITEMS FROM THE PREVIOUS VERIFICATION (fix all blocker/major ones and cheap minors, then rebuild and re-run every suite):\n${JSON.stringify(ver ? ver.issues : [], null, 1)}`
}
return rounds
