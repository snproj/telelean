export const meta = {
  name: 'slice2-vscode-suite-failures',
  description: 'Diagnose and fix the two VS Code suite failures from the final slice-2 checks: one Sonnet fixer per failure, a Sonnet check when product code changed',
  phases: [{ title: 'Fix' }, { title: 'Check' }],
}

const S = '/tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad'
const LOG = `${S}/final_checks/vscode_smoke.log`
const PROFILE = `${S}/final_checks/vscode/vscode-1007881`

const FAILURES = [
  {
    key: 'at59',
    other: 'the e2e.test.ts drag/selection failure (webview card Lean code area, packages/webview/src/board/*, packages/extension/test/suite/e2e.test.ts)',
    text: `FAILURE (smoke instance, runs.test.ts): the test at packages/extension/test/suite/runs.test.ts:348,
'AT5.9: a working run is persisted as interrupted when the window goes, its session closed; the restored board offers Resume'.
It failed at \`assert.equal(runNow()?.state, 'interrupted')\`: actual 'working', expected 'interrupted' (compiled: out/test/suite/runs.test.js:20947).
The log is ${LOG}, lines 1-290 (the smoke instance; the failure is at lines 272-290). The instance's model copy used by this suite is ${PROFILE}/runs/runs_model (its .telelean/ folder holds what the host persisted), and the extension host logs are under ${PROFILE}/user-data/logs/.
Your area: the extension host's run persistence when the window goes (RunManager.dispose and what it writes), and run recovery on restore (packages/extension/src/logic/runs.ts, boardSession.ts, packages/runner/src/run/*), plus the test itself.
Relevant slice-2 history: 2d built sessions, queues, steps and recovery ("an older (v1) run is recovered as an edit session with every item in review"; "a session that never started ends as failed, with M2's 'the editor reloaded' text"); 2h converted this test blind. Why it matters: if this is a product bug, a window reload during a Claude step could leave the restored board showing a run as 'working' that nothing drives, which would break the user's demo.`,
  },
  {
    key: 'drag',
    other: 'the runs.test.ts AT5.9 failure (run persistence and recovery: packages/extension/src/logic/runs.ts, boardSession.ts, packages/runner/src/run/*, packages/extension/test/suite/runs.test.ts)',
    text: `FAILURE (e2e instance, e2e.test.ts): the test at packages/extension/test/suite/e2e.test.ts:373,
'a mouse drag inside the expanded Lean code selects text and never drags the card (request 1)'.
It failed at \`assert.ok(node('cynder-dark-past')?.lean.code?.includes(selected), ...)\` with
selected = "/-- Cynder has a dark past -/\\nabbrev cynder_dark_past : Prop := HasDarkPast cynder\\naxiom cynder_dark_past.holds : cynder_dark_past\\n\\n\\n" (note the trailing three newlines). The earlier assertion (text was selected) passed; the later ones (no move posted, order unchanged, no dragging flag) did not run.
The log is ${LOG}, lines 291-354 (the e2e instance; the failure is at lines 339-354). The instance's model copy is under ${PROFILE}/e2e/.
Your area: the webview card's expanded Lean code (the \`.tl-lean\` element and what is rendered inside and after it: packages/webview/src/board/*, packages/webview/src/model/*), and the test itself. Find out whether the code block's DOM text now holds more than \`lean.code\` (extra blank lines or empty elements inside \`.tl-lean\`), whether slice 1 or slice 2 changed that area (a display regression), or whether the drag to the box's bottom-right corner only extends the selection past the code in this Chromium (a fragile test). You may reproduce it in the browser harness: build the webview into your scratch dir with TELELEAN_WEBVIEW_OUT and run single Playwright specs (m1-lean-code.spec.ts covers the code view), as builder_rules.md says.`,
  },
]

const FIX = {
  type: 'object',
  properties: {
    key: { type: 'string' },
    rootCauseClass: { type: 'string', enum: ['A-product-bug', 'B-test-out-of-date', 'C-test-fragile', 'D-unresolved-skipped'] },
    rootCause: { type: 'string' },
    introducedBy: { type: 'string' },
    sourceChanged: { type: 'boolean' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    testsRun: { type: 'array', items: { type: 'string' } },
    mutationChecks: { type: 'array', items: { type: 'string' } },
    expectedVsCodeResult: { type: 'string' },
    decisions: { type: 'array', items: { type: 'string' } },
    outsideEffects: { type: 'string' },
    report: { type: 'string' },
  },
  required: ['key', 'rootCauseClass', 'rootCause', 'introducedBy', 'sourceChanged', 'filesChanged', 'testsRun', 'mutationChecks', 'expectedVsCodeResult', 'decisions', 'outsideEffects', 'report'],
}

const CHECK = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['ok', 'problems'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] }, where: { type: 'string' }, problem: { type: 'string' } },
        required: ['severity', 'where', 'problem'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['verdict', 'findings', 'summary'],
}

const fixPrompt = (f) => `You are a FIXER for telelean (a VS Code extension; repo /home/zhengyew/telelean). Read ${S}/builder_rules.md first (mandatory: RAM, capped.sh, vitest flags, what you must never do). Your scratch dir: ${S}/vsfix_${f.key} (create it).

CONTEXT. Slice 2 is fully built (uncommitted work on HEAD 1473ca0; HEAD must stay; never commit, stash, checkout, git add, or change the index). Every typecheck, every unit suite, the real-Lean runner suite and all 21 Playwright specs pass. The orchestrator then rebuilt the extension and ran the in-VS-Code suites once (scripts/smoke.mjs --snap: the user's snap VS Code 1.145.2, an isolated profile): 51 passed, 8 pending, 2 failed. These suites were last run at M2 (commit 187673d); slice 1 (builder 1g) and slice 2 (builder 2h) converted them but only type-checked them. So a failure can come from slice 1, slice 2, a blind test conversion, or the newer VS Code (M2 used a 1.140.0 test build).

${f.text}

ANOTHER FIXER works in parallel on ${f.other}. Do not edit its files. If a test outside your area fails, re-run it once before drawing conclusions.

YOUR JOB. Find the root cause (read the code; trace the path; use the logs and the persisted files), then make the test pass for the right reason. Classify it:
- A-product-bug: the product behaves wrongly. Fix it in source, following the spec and plan (docs/slice2-plan.md, docs/slice1-plan.md, verbatim_prompt_log/bundle_21/user_requested_documents/01_spec_v4.md; use grep, do not read whole files). Add a unit test that fails without the fix. Check it by mutation: put the old code back, see the test fail, then restore it byte for byte and confirm with cmp.
- B-test-out-of-date: the product does what the spec and plan now intend, and the test expects the old behaviour. Update the test to the intended behaviour, and quote the plan or spec lines that define it.
- C-test-fragile: the product is right, but the test depends on this environment (timing, layout, Chromium). Make the test robust without weakening what it checks: never just loosen an assertion until it passes.
- D-unresolved-skipped: last resort only. Mark it mocha \`test.skip\` with a precise reason in a comment.

RULES.
- Before you change any file, copy it to ${S}/vsfix_${f.key}/backup/<its repo-relative path>, and append that path to ${S}/vsfix_${f.key}/changed_files.txt. First run \`${S}/snapdiff.sh ${S}/vsfix_${f.key}/before.diff\`; last, run \`${S}/snapdiff.sh ${S}/vsfix_${f.key}/after.diff\`.
- NEVER write packages/extension/dist or packages/extension/out, and never run the VS Code suites, scripts/smoke.mjs, scripts/build.mjs or npm/npx: they need dist/ and out/, which only the orchestrator rebuilds. The orchestrator will rebuild and re-run the suites after you.
- Verify with what you may run: tsc --noEmit for every package you touched (the extension's tsconfig.json type-checks test/suite); vitest for every package whose source or unit tests you changed (capped.sh, one worker, --no-cache, --fsModuleCachePath and TMPDIR in your scratch dir); runner: only the test files you touched, timeout 900; Playwright: single specs against a scratch webview build. Quote the summary lines.
- TELELEAN_NO_REAL_CLAUDE=1 always (capped.sh sets it). Never call real Claude.

Your final answer (the schema): the root cause and its class; introducedBy, which slice, sub-slice or environment, with evidence; the files changed; the tests run with their summary lines; the mutation checks; expectedVsCodeResult, meaning exactly what the orchestrator's re-run of this test should show; the decisions to log, each with its alternative; effects outside the repo and your scratch dir; and a short report.`

const checkPrompt = (f, fx) => `You are a CHECKER for a fix to telelean (repo /home/zhengyew/telelean). Read ${S}/builder_rules.md first (mandatory). Your scratch dir: ${S}/vscheck_${f.key} (create it). Do not edit any repo file. Never write packages/extension/dist or out. Never run the VS Code suites, smoke.mjs, build.mjs, npm or npx.

A fixer changed product code for this failure:
${f.text}

The fixer's result (JSON):
${JSON.stringify(fx, null, 1)}

The changed files are listed in ${S}/vsfix_${f.key}/changed_files.txt, with the pre-fix copies under ${S}/vsfix_${f.key}/backup/. Diff each one against the working tree.

Check the following, adversarially:
1. Is the root cause right, and is the fix correct and complete, as the spec and plan require? Use grep on docs/slice2-plan.md and verbatim_prompt_log/bundle_21/user_requested_documents/01_spec_v4.md.
2. Does the fix break any other path? Trace the callers, other run states, recovery of other kinds of runs, and the webview.
3. Does the new test fail without the fix? Re-do one mutation yourself, restoring the file byte for byte and confirming with cmp.
4. Re-run the affected unit suites (capped.sh, one worker, --no-cache, fsModuleCachePath and TMPDIR in your scratch dir) and tsc for the touched packages.

Report findings with severities: blocker, major, minor or nit. verdict 'ok' means no blocker or major finding.`

const results = await pipeline(
  FAILURES,
  (f) => agent(fixPrompt(f), { label: `fix:${f.key}`, phase: 'Fix', schema: FIX, model: 'sonnet' }),
  (fx, f) => {
    if (!fx) return { key: f.key, fx: null, check: null }
    if (!fx.sourceChanged) return { key: f.key, fx, check: null }
    return agent(checkPrompt(f, fx), { label: `check:${f.key}`, phase: 'Check', schema: CHECK, model: 'sonnet' }).then((c) => ({ key: f.key, fx, check: c }))
  },
)
return { results }
