export const meta = {
  name: 'slice-chain',
  description: 'Build several telelean sub-slices in order (builder, 2 verifiers, fixer, integrator check + patch each); stop at the first failed check',
  phases: [{ title: 'Build' }, { title: 'Verify' }, { title: 'Fix' }, { title: 'Integrate' }],
}
const S = '/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad'
const FINDING = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] },
    where: { type: 'string' },
    problem: { type: 'string' },
    evidence: { type: 'string' },
    fix: { type: 'string' },
  },
  required: ['id', 'severity', 'where', 'problem', 'fix'],
}
const FIND = {
  type: 'object',
  properties: { summary: { type: 'string' }, checks_run: { type: 'array', items: { type: 'string' } }, findings: { type: 'array', items: FINDING } },
  required: ['summary', 'findings'],
}
const INTEG = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', description: 'true only if every check passed and the patch was saved' },
    summary: { type: 'string' },
    checks: { type: 'array', items: { type: 'string', description: 'command and its summary line' } },
    patch: { type: 'string' },
  },
  required: ['ok', 'summary', 'checks'],
}
const SPEC_LENS =
  'FIDELITY TO THE BRIEF, THE PLAN AND THE SPEC. Go through the plan\'s entry for this sub-slice item by item and check the diff does each one, as the plan\'s contracts (§2, §2.9) and the cited spec clauses say, and nothing that contradicts them or the autopilot decisions (02_autopilot_decisions.md, AP-24 especially). Check the safety properties the spec cares about (nothing assumed without the user\'s individual Accept; no result shown before the meaning check; no state applied that no check judged; no proof resting on what its question does not allow; the user\'s decisions never lost on rollback/reload/crash; Claude never changes kinds or the user\'s files). Do NOT run builds or tests (the other verifier does); read only.'
const CODE_LENS =
  'CODE CORRECTNESS AND REGRESSIONS. Read the diff of this sub-slice (compare with the previous patch in /home/zhengyew/telelean/verbatim_prompt_log/bundle_21/evidence/patches/ to isolate it), look for bugs, missed call sites, broken behaviour, and tests that do not test what they claim. Then confirm the builder\'s verification claims yourself: run the brief\'s typecheck and unit-test commands ONE AT A TIME through capped.sh (vitest one worker; extension with --no-cache; runner: only the test files the change touches, each under `timeout 900`). Quote the summary lines in checks_run.'

const results = []
for (const id of args.ids) {
  phase('Build')
  const built = await agent(
    `Your brief is the file ${S}/briefs/${id}.md. Read it completely, then read every file it tells you to read first, and do exactly what it says. You are the only agent writing code right now. Your final message is your report, as the brief specifies.`,
    { label: `build:${id}`, phase: 'Build' },
  )
  phase('Verify')
  const vprompt = (lens) =>
    `Read ${S}/briefs/verify_common.md (your role and rules) and the builder's brief ${S}/briefs/${id}.md, then the files the brief cites. The builder's report follows.\n\n=== BUILDER REPORT ===\n${built}\n=== END OF REPORT ===\n\nYOUR LENS: ${lens}`
  const verdicts = await parallel([
    () => agent(vprompt(SPEC_LENS), { label: `verify:${id}:spec`, phase: 'Verify', schema: FIND }),
    () => agent(vprompt(CODE_LENS), { label: `verify:${id}:code`, phase: 'Verify', schema: FIND }),
  ])
  const all = verdicts.filter(Boolean).flatMap((v) => v.findings)
  const must = all.filter((f) => f.severity === 'blocker' || f.severity === 'major')
  log(`${id}: ${all.length} findings, ${must.length} blocker/major`)
  let fixed = null
  if (all.length > 0) {
    phase('Fix')
    fixed = await agent(
      `You are the FIXER for sub-slice ${id} of telelean. Read ${S}/builder_rules.md (mandatory) and the brief ${S}/briefs/${id}.md. The builder already implemented it (its report is below); two verifiers raised the findings below. Fix every blocker and major finding (and minor ones that are cheap and clearly right), in the working tree, without undoing the rest of the builder's work. If you judge a finding wrong, do not change the code for it; say why in your report. Then re-run the brief's verification commands (capped.sh, one at a time, vitest one worker; extension with --no-cache; runner: only touched test files with timeout 900) and quote the summary lines.\n\n=== BUILDER REPORT ===\n${built}\n=== END ===\n\n=== FINDINGS (JSON) ===\n${JSON.stringify(all, null, 1)}\n=== END ===\n\nOpen design questions: decide them yourself as builder_rules.md says (never leave one open). Your final message: for each finding, fixed / not fixed (why); files changed; verification output; \"Decisions for the orchestrator to log\" (each with its alternative); effects outside the repo and your scratch dir.`,
      { label: `fix:${id}`, phase: 'Fix' },
    )
  }
  phase('Integrate')
  const integ = await agent(
    `You are the INTEGRATOR CHECK after sub-slice ${id} of telelean. Read ${S}/builder_rules.md (mandatory). Do NOT edit, create or delete any file in the repository. Exceptions to the rules, for you only: you may run ${S}/recheck.sh and ${S}/savepatch.sh.\n` +
    `1. Run \`${S}/recheck.sh ${id}\` (about one minute: tsc in five configs, then vitest in core, webview and extension, one at a time under the memory cap), then read ${S}/rc_${id}/summary.txt. Every line must say rc=0 and the last line DONE. For any line with a nonzero rc, read ${S}/rc_${id}/<name>.log and report each failure precisely (file, test name, error).\n` +
    `2. Read-only safety checks, from /home/zhengyew/telelean: \`git diff --cached --stat\` prints nothing (nothing staged); \`git log -1 --format=%h\` prints 187673d (no new commits); \`stat -c '%y %n' packages/extension/dist packages/extension/out\` shows both at 2026-11-19 13:47 (the user's installed build untouched); \`ls -a packages/extension/out | grep -c '^.vite$'\` prints 0.\n` +
    `3. If and only if steps 1 and 2 all pass, run \`${S}/savepatch.sh after_slice_${id}\` from /home/zhengyew/telelean and set ok=true. Otherwise set ok=false and do NOT save the patch.\n` +
    `Report every command with its summary line.`,
    { label: `integrate:${id}`, phase: 'Integrate', schema: INTEG },
  )
  results.push({ id, built, verdicts, fixed, integ })
  if (!integ || !integ.ok) {
    log(`STOP after ${id}: integrator check failed`)
    break
  }
  log(`${id} done: ${integ.patch ?? 'patch saved'}`)
}
return { results }
