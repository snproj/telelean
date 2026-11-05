export const meta = {
  name: 'telelean-m1b-integrate-verify',
  description: 'M1 part B: integrate the six work packages, verify from three angles, fix by package, final verification',
  phases: [
    { title: 'Integrate', detail: 'wire packages, resolve open issues, sample workspace, e2e tests, user guide' },
    { title: 'Verify', detail: 'three independent lenses' },
    { title: 'Fix', detail: 'fixers partitioned by package' },
    { title: 'Final check', detail: 're-run everything, spot-check fixes' },
  ],
}

const REPO = '/home/zhengyew/telelean'
const SCR = '/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9'
const DOCS = REPO + '/verbatim_prompt_log/bundle_1/user_requested_documents'
const M1A = REPO + '/verbatim_prompt_log/bundle_9/subagent_reports/m1a_workflow/agents'

const SAFETY = `
SAFETY RULES FROM THE USER (mandatory; they apply to you and to anything you start):
- Never push anything to any remote repository: no "git push", no "git remote add", no "gh" commands, no PRs/issues/gists.
- Never put anything on the internet publicly and never send anything to a person: no emails, no messages through any app, no uploading files through a browser or any web service, no pastebins, no posting to web APIs.
- Network use is limited to reading documentation (WebFetch/WebSearch). No downloads and no new npm packages: if one seems needed, report it in open_issues instead.
- Never run the Claude CLI with a prompt (it spends the user's subscription quota); "--help"/"--version" only.
- Never read or print credentials or secrets (~/.claude/.credentials.json, tokens, keys).
- Write only inside your ASSIGNED PATHS plus your scratch dir ${SCR}/<your-label>/. Never touch the user's VS Code settings or installed extensions, ~/telelean_scripts, ~/.config, ~/.claude, ~/.elan, git global config. No sudo, no global installs, no "npm install". Do NOT set npm_config_logs_max=0 or otherwise make npm prune ~/.npm/_logs (a builder did that by accident).
- Tests that launch Chrome (Playwright) or a VS Code test instance must use an isolated HOME and XDG_CONFIG_HOME/XDG_DATA_HOME/XDG_CACHE_HOME under a scratch/test dir and "ulimit -c 0" (the existing test harnesses already do this; keep it), so nothing lands in the user's real home folder.
- RAM: this machine has crashed from RAM exhaustion before. Check "free -m" before heavy steps; at most ONE heavy process at a time (one lake build, one VS Code test instance, one browser); LEAN_NUM_THREADS=4; never build or download Mathlib; kill only processes you started; make sure test processes exit.
- Lean: toolchain binaries directly (~/.elan/toolchains/leanprover--lean4---v4.35.0/bin/{lake,lean}), never the elan proxies.
- Git: only in scratch/test repositories, local only, with GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 and "-c commit.gpgsign=false -c core.hooksPath=/dev/null" plus an explicit author; never add remotes. Never run git in ${REPO} or ${REPO}/mental_model (the real sample workspace must not become a git repository during tests; tests use copies).
- Report in your structured output every effect you caused outside ${REPO} and your scratch dir, even if harmless.
- Return your report as the structured output; do not write report files. Never claim a test passed unless you ran it; quote real output.
`

const PROJECT = `
PROJECT. telelean: a VS Code extension (personal-use prototype) showing a mental model as ASSUMPTION / DERIVATION / GOAL nodes in three independently scrollable columns, backed by Lean 4 files ("@@ telelean" markup blocks in Lean comments). Repo ${REPO} (npm workspaces packages/core, runner, webview, extension; Node 24.22.2 in ~/.local/bin; all approved npm packages installed).
DESIGN: ${DOCS}/02_design_decisions.md, ${DOCS}/03_architecture.md, ${REPO}/docs/design-amendments.md (overrides 02/03), ${REPO}/docs/m0-report.md, and THE M1 PLAN ${REPO}/docs/m1-plan.md (scope checklist, data flow, contracts, D-11 logic, statuses, vocabulary/uses/refs/glosses from .ilean + check file, history via git private refs, protocol, test isolation, decisions log in section 14).
STATE: M1 part A is done. Six builders implemented WP1 markup (core/src/markup), WP2 model/statuses/edits/export (core/src/project, edit, export), WP3 Lean semantic layer (runner/src/semantic), WP4 model workspace/sidecars/history (runner/src/workspace; also created the sample ${REPO}/mental_model), WP5 extension host (packages/extension), WP6 board UI (packages/webview -> packages/extension/dist/webview). Each passed its own acceptance tests in isolation. Their full reports (open issues, contract changes, integration notes, minor decisions, effects) are JSON files in ${M1A}/build-WP*.json; the plan agents' reports are plan-architect.json and plan-review.json there.
M1 SCOPE REMINDER: core library; runLean + memory guard; Initialize command; board (3 columns, vocabulary group, cards, expand-to-Lean, aura and glyphs, declared + verified arrows); A/D/G box with stance and why; edit text/rationale; delete; drag re-order; kind changes per D-11; Undo; tray; refresh via build + check file; graph.json; D-10 subjects + picker; D-33 history dropdown with revert (undoable) + storage counter; the user's 4 card requests: (1) drag inside expanded Lean code selects text instead of dragging the card, (2) per-card "uses:" vocabulary line from Lean, truncated inline with a dropdown, (3) copy-to-clipboard button on expanded Lean, (4) hover an identifier for its gloss, click to highlight it in the Vocabulary group.
`

const RESULT = { type: 'object', properties: {
  summary: { type: 'string' },
  files_changed: { type: 'array', items: { type: 'string' } },
  test_runs: { type: 'string', description: 'every suite you ran, with verbatim result tails' },
  resolved: { type: 'array', items: { type: 'string' } },
  open_issues: { type: 'array', items: { type: 'string' } },
  minor_decisions: { type: 'array', items: { type: 'object', properties: { decision: { type: 'string' }, rationale: { type: 'string' } }, required: ['decision', 'rationale'] } },
  effects_outside_repo: { type: 'array', items: { type: 'string' } },
}, required: ['summary', 'files_changed', 'test_runs', 'resolved', 'open_issues', 'minor_decisions', 'effects_outside_repo'] }

const VERIFY = { type: 'object', properties: {
  verdict: { type: 'string', enum: ['pass', 'needs-work', 'fail'] },
  what_i_ran: { type: 'string' },
  issues: { type: 'array', items: { type: 'object', properties: {
    severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
    package: { type: 'string', enum: ['core', 'runner', 'extension', 'webview', 'sample-or-docs'] },
    description: { type: 'string' }, evidence: { type: 'string' }, suggested_fix: { type: 'string' },
  }, required: ['severity', 'package', 'description', 'evidence', 'suggested_fix'] } },
  strengths: { type: 'array', items: { type: 'string' } },
  effects_outside_repo: { type: 'array', items: { type: 'string' } },
}, required: ['verdict', 'what_i_ran', 'issues', 'strengths', 'effects_outside_repo'] }

phase('Integrate')
const integ = await agent(`${SAFETY}\n${PROJECT}
YOUR ROLE: M1 integrator. ASSIGNED PATHS: everything under ${REPO} except verbatim_prompt_log/ and docs/design-amendments.md, docs/m0-report.md (you may edit docs/m1-plan.md section 14 and create docs/user-guide.md and docs/decisions-log.md).
1. Read docs/m1-plan.md (integration plan section) and every build-WP*.json report in ${M1A} (open_issues, contract_changes, integration_notes, minor_decisions).
2. Wire everything end to end: the extension uses the real workspace/semantic/core code (no stubs or samples on the real path), refresh runs Lean via the sandbox, edits write the real files, history snapshots and revert work, graph.json is written. Remove obsolete skip-gates, fix the cross-package open issues the builders reported (e.g. the kindChange plural grammar bug "1 proof use it", the drag-guard note about canDrag vs the draggable toggle, TL110/lakefile text, zod declared where imported, the undo-stack subject key, temp-file gitignore, double error display, colour test hooks), and append the builders' contract-change rows to plan section 14.
3. Make ${REPO}/mental_model a correct sample: the user's Spyro walkthrough as subject Spyro in the starting state (3 assumptions: pg-no-dark-past code-less with stance rule, cynder-dark-past and new-spyro-pg formalised; 1 formalised unproved goal cynder-not-good), lakefile with autoImplicit=false, toolchain v4.35.0; it must build and refresh correctly. Do not turn it into a git repository (history must work once the user chooses git init via Initialize/the board; tests use copies).
4. Build all packages (npm run build where defined) so packages/extension/dist is current (the user's installed copy loads it after a window reload). Run EVERY suite sequentially: core, runner (full vitest), webview (typecheck, build, unit, Playwright), extension (typecheck, unit, VS Code smoke under xvfb). Add an end-to-end extension test (isolated HOME) on a COPY of mental_model: open board; graph comes from the files with Lean statuses; add an A node with stance and why via the box -> block written to the file; edit natural_name; kind change with D-11 impact; Undo restores the file byte-exactly; with git initialised in the copy, history lists snapshots and revert works (and can be undone); a second subject appears in the picker; the card shows the "uses:" vocabulary, the copy button writes the clipboard, and a mouse drag inside the expanded code selects text without moving the card.
5. Write docs/user-guide.md: how the user runs M1 in their VS Code (reload after build; Initialize Model Here; Open Board; every board action; history; subjects; what each status/glyph means; limits of M1; troubleshooting), short and practical. Write docs/decisions-log.md: every minor decision taken in M1 (from plan section 14 and the builders' reports, plus yours), grouped by topic, one line each with rationale, written so the user can skim and veto.`, { label: 'integrate', phase: 'Integrate', schema: RESULT })

phase('Verify')
const LENSES = [
  { key: 'semantics', text: 'LENS: Lean semantics and data correctness. Statuses (D-15) and footprints against real Lean output; the D-2(b) encoding; presuppositions; vocabulary/uses/refs/glosses vs the .ilean data; D-11 kind-change rules (never remove a .holds others use; A->D pending; A->G/D->G explicit-hypothesis rewrite); markup round-trip safety (parse/serialize/edit must never corrupt or drop the user\'s text: CRLF, Unicode, nested comments, escapes "/-" "-/" "--", blocks next to declarations, unknown keys preserved); binder correctness; refresh freshness when a module fails. Write adversarial test inputs in your scratch dir.' },
  { key: 'ux', text: 'LENS: the user experience against the spec and the user\'s requests. Run the real extension in the VS Code test instance (isolated HOME, xvfb) and/or the Playwright harness; take screenshots (light and dark) into your scratch dir and LOOK at them. Check every M1 scope item and each of the 4 card requests, the vocabulary group, the history dropdown and storage counter, the subject picker, error/notice display, empty states (fresh Initialize), a large model (about 150 nodes: scrolling, arrows, performance), keyboard access basics, and whether docs/user-guide.md is accurate.' },
  { key: 'safety', text: 'LENS: safety, robustness and side effects. File-write safety (atomic writes, no data loss on failures, Undo and history revert correctness, behaviour when files change on disk during an edit); git use (private refs only; never touching the user\'s branches/index/hooks/config; behaviour when the folder already is a git repository with uncommitted changes, when git is missing, when HEAD is detached); the Lean refresh runs in the sandbox with sources read-only and a memory cap; nothing writes outside the model folder, extension storage and test scratch dirs (check the real home folder before/after your runs); opt-in per folder; RAM use of refresh and of the board on a large model; leftover processes/units after tests.' },
]
const verdicts = await parallel(LENSES.map((l) => () => agent(`${SAFETY}\n${PROJECT}
YOUR ROLE: independent M1 verifier. You did not write this code; be skeptical and concrete. Report only: do NOT edit files under ${REPO} (write probes and copies only in your scratch dir ${SCR}/verify-${l.key}/). The integrator's report:
${JSON.stringify(integ, null, 1)}
${l.text}
Severity: blocker = a scope item is missing/broken or user data can be corrupted/lost or a safety rule is broken; major = a real defect the user would hit; minor = polish. Give each issue the package that must fix it.`, { label: `verify:${l.key}`, phase: 'Verify', schema: VERIFY })))

const issues = verdicts.filter(Boolean).flatMap((v, i) => v.issues.map((x) => ({ ...x, lens: LENSES[i].key })))
const serious = issues.filter((x) => x.severity !== 'minor')
log(`${issues.length} issues (${serious.length} blocker/major)`)

phase('Fix')
const GROUPS = [
  { key: 'core+runner+sample', pkgs: ['core', 'runner', 'sample-or-docs'], paths: 'packages/core/**, packages/runner/**, mental_model/**, test-fixtures/**, docs/m1-plan.md, docs/user-guide.md, docs/decisions-log.md' },
  { key: 'extension+webview', pkgs: ['extension', 'webview'], paths: 'packages/extension/** (including dist), packages/webview/**' },
]
const fixes = await parallel(GROUPS.map((g) => () => {
  const mine = issues.filter((x) => g.pkgs.includes(x.package))
  if (!mine.length) return Promise.resolve({ summary: 'no issues assigned', files_changed: [], test_runs: '', resolved: [], open_issues: [], minor_decisions: [], effects_outside_repo: [] })
  return agent(`${SAFETY}\n${PROJECT}
YOUR ROLE: M1 fixer for ${g.key}. ASSIGNED PATHS: ${g.paths}. Another fixer works in parallel on the other packages, so stay inside your paths; if a fix needs a change outside them, describe it in open_issues.
Fix every blocker and major issue below, and the minor ones that are cheap. If an issue is wrong, say why in open_issues. Re-run the affected suites (and the extension smoke/e2e if you touched extension or webview) and quote the results. Issues (JSON):
${JSON.stringify(mine, null, 1)}`, { label: `fix:${g.key}`, phase: 'Fix', schema: RESULT })
}))

phase('Final check')
const final = await agent(`${SAFETY}\n${PROJECT}
YOUR ROLE: final M1 verifier. Report only (no edits under ${REPO}). Re-run EVERY suite sequentially from a clean build (core; runner full vitest; webview typecheck/build/unit/Playwright; extension typecheck/unit/smoke+e2e under xvfb with isolated HOME), confirm that each blocker/major issue below is really fixed (spot-check by running the scenario), check that ${REPO}/mental_model builds and is not a git repository, and that the real home folder shows no new writes from the test runs (Chrome config, ~/.copilot, ~/.local/share/vitest). Issues that were raised:
${JSON.stringify(serious, null, 1)}
Fixers' reports:
${JSON.stringify(fixes, null, 1)}`, { label: 'final-check', phase: 'Final check', schema: VERIFY })

return { integ, verdicts, fixes, final }
