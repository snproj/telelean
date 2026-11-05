export const meta = {
  name: 'telelean-m1c-close',
  description: 'M1 closing: finish the delete-confirmation flow and remaining minors, rebuild, verify (up to 2 rounds)',
  phases: [
    { title: 'Fix', detail: 'cross-package follow-ups + docs' },
    { title: 'Verify', detail: 'independent check of the fixes and the full suites' },
  ],
}

const REPO = '/home/zhengyew/telelean'
const SCR = '/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9'
const M1B = REPO + '/verbatim_prompt_log/bundle_9/subagent_reports/m1b_workflow/agents'

const SAFETY = `
SAFETY RULES FROM THE USER (mandatory; they apply to you and to anything you start):
- Never push anything to any remote repository: no "git push", no "git remote add", no "gh" commands, no PRs/issues/gists.
- Never put anything on the internet publicly and never send anything to a person: no emails, no messages through any app, no uploads through a browser or any web service, no pastebins, no posting to web APIs.
- No downloads, no new npm packages, no "npm install"; network only for reading documentation.
- Never run the Claude CLI with a prompt (it spends the user's subscription quota); "--help"/"--version" only.
- Never read or print credentials or secrets.
- Write only inside your ASSIGNED PATHS plus your scratch dir ${SCR}/<your-label>/. Never touch the user's VS Code settings or installed extensions, ~/telelean_scripts, ~/.config, ~/.claude, ~/.elan, git global config. No sudo. Do NOT set npm_config_logs_max=0.
- Tests that launch Chrome or a VS Code test instance keep the existing isolation (HOME/XDG under scratch, ulimit -c 0). Check the real home folder is unchanged.
- RAM: at most ONE heavy process at a time; check "free -m"; LEAN_NUM_THREADS=4; kill only your own processes; leave none behind. Keep scratch copies small (do not copy packages/extension/.vscode-test; symlink or reuse it read-only).
- Lean: toolchain binaries directly, never elan proxies. Git only in scratch/test repositories with GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1, "-c commit.gpgsign=false -c core.hooksPath=/dev/null"; never in ${REPO} or ${REPO}/mental_model.
- Report every effect outside ${REPO} and your scratch dir. Structured output only; never claim a test passed unless you ran it.
`
const CONTEXT = `
PROJECT. telelean (VS Code extension; repo ${REPO}; npm workspaces core/runner/webview/extension). M1 ("map without AI") is integrated and verified except for the items below. Plan: ${REPO}/docs/m1-plan.md. User docs: docs/user-guide.md, docs/decisions-log.md. Previous reports (JSON): ${M1B}/final-check.json, fix-core+runner+sample.json, fix-extension+webview.json (their open_issues list the cross-package follow-ups).
`
const ISSUES = `
OPEN ITEMS TO CLOSE:
1. [major, webview] Delete with Lean when other declarations use the card: on actionResult needs-confirmation for deleteNode, the DeleteDialog must list outcome.dependents (node ids shown by their sentence, other entries as Lean names), explain that they will stop compiling, offer "Delete anyway", which resends deleteNode with confirmed: true, and keep "Delete card only (keep the Lean)" and Cancel. No error toast for this case.
2. [major, extension] packages/extension/src/logic/actionMapping.ts drops the confirmed flag: map deleteNode to { kind: 'delete-node', id, keepLean, ...(confirmed ? { confirmed } : {}) }. Verify end to end in the real VS Code test instance (e2e test: delete a used card -> dialog lists dependents -> Delete anyway -> files changed as the core plans, Undo restores byte-exactly).
3. [minor, webview] DependentsDialog: for D->A / G->A on a conditional proof, use the core's dialog.detail text and correct button labels instead of the hard-coded "change to Goal" paragraph.
4. [minor, extension] Smoke-suite flakiness from the SelfWrites race (two quick telelean writes to the same file; the first write's file event handled after the second write is recorded). Fix the bookkeeping (e.g. keep a short queue of expected texts per path, or compare against every recent self-write), then run the model-boards suite at least 5 times in a row and report the pass count.
5. [minor, docs] Bring docs/user-guide.md and docs/decisions-log.md in line with the code (restore is fixed; delete confirmation as implemented; current chip labels; toast Undo behaviour; "Keep last N" confirmation), record the extension/webview fixers' decisions and the deferred junction dot (joint premises drawn as separate declared arrows in M1) in decisions-log.md, append their contract changes to docs/m1-plan.md section 14, and fix the EditApplier doc comment in packages/runner/src/workspace/types.ts to match the extension's behaviour.
Finally rebuild everything ("npm run build" at the root, so packages/extension/dist is current for the user's installed copy) and run every suite sequentially: core, runner, webview (typecheck/build/unit/Playwright), extension (typecheck/unit/smoke+e2e).
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
  const fix = await agent(`${SAFETY}\n${CONTEXT}\nYOUR ROLE: M1 closing fixer (round ${round}). ASSIGNED PATHS: packages/extension/**, packages/webview/**, packages/core/** (only if strictly needed), packages/runner/src/workspace/types.ts (doc comment), docs/user-guide.md, docs/decisions-log.md, docs/m1-plan.md (section 14 only).\n${todo}`, { label: `close-fix-${round}`, phase: 'Fix', schema: RESULT })
  phase('Verify')
  const ver = await agent(`${SAFETY}\n${CONTEXT}\nYOUR ROLE: independent verifier of the M1 closing fixes (round ${round}). Report only: no edits under ${REPO}. Check each item below for real (run the delete-with-dependents flow in the real VS Code test instance; run the model-boards smoke suite at least 5 times; read the docs against the code), then re-run every suite sequentially from a clean build. Items:\n${todo}\nFixer's report:\n${JSON.stringify(fix, null, 1)}`, { label: `close-verify-${round}`, phase: 'Verify', schema: VERIFY })
  rounds.push({ fix, ver })
  const serious = (ver && ver.issues || []).filter((i) => i.severity !== 'minor')
  if (ver && ver.verdict === 'pass' && !serious.length) break
  todo = `OPEN ITEMS FROM THE PREVIOUS VERIFICATION (fix all blocker/major ones, cheap minors too, then rebuild and re-run every suite):\n${JSON.stringify(ver ? ver.issues : [], null, 1)}`
}
return rounds
