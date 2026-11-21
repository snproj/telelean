export const meta = {
  name: 'slice1-sub',
  description: 'Build and verify one telelean slice-1 sub-slice (builder, two read-only verifiers, fixer if needed)',
  phases: [{ title: 'Build' }, { title: 'Verify' }, { title: 'Fix' }],
}
const S = '/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad'
const id = args.id
const FINDING = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] },
    where: { type: 'string', description: 'file:line or brief item' },
    problem: { type: 'string' },
    evidence: { type: 'string' },
    fix: { type: 'string' },
  },
  required: ['id', 'severity', 'where', 'problem', 'fix'],
}
const FIND = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    checks_run: { type: 'array', items: { type: 'string' }, description: 'commands you ran and their summary lines' },
    findings: { type: 'array', items: FINDING },
  },
  required: ['summary', 'findings'],
}

phase('Build')
const built = await agent(
  `Your brief is the file ${S}/briefs/${id}.md. Read it completely, then read every file it tells you to read first, and do exactly what it says. You are the only agent writing code right now. Your final message is your report, as the brief specifies.`,
  { label: `build:${id}`, phase: 'Build' },
)

phase('Verify')
const vprompt = (lens) =>
  `Read ${S}/briefs/verify_common.md (your role and rules) and the builder's brief ${S}/briefs/${id}.md, then the files the brief cites. The builder's report follows.\n\n=== BUILDER REPORT ===\n${built}\n=== END OF REPORT ===\n\nYOUR LENS: ${lens}`
const SPEC_LENS =
  'FIDELITY TO THE BRIEF AND THE SPEC. Go through the brief item by item and check the diff does each one, as the plan contracts and the cited spec clauses say, and nothing that contradicts them. Check the safety properties the spec cares about for this sub-slice (only the user changes kinds; no status that claims more than Lean checked; markup byte-identity and aliases never rewritten; old files still load; deleted tests only for removed behaviour, each listed). Do NOT run builds or tests (the other verifier does); read only.'
const CODE_LENS =
  'CODE CORRECTNESS AND REGRESSIONS. Read the diff (`git diff HEAD -- packages docs` and new files from `git status --porcelain`), look for bugs, missed call sites (grep for remaining uses of removed names, values and APIs across packages/*/src and packages/*/test), broken behaviour, and tests that do not test what they claim. Then confirm the builder\'s verification claims yourself: run the brief\'s typecheck and unit-test commands ONE AT A TIME through capped.sh (vitest with one worker; for the runner, only the test files the change touches, each under `timeout 900`). Quote the summary lines in checks_run.'
const verdicts = await parallel([
  () => agent(vprompt(SPEC_LENS), { label: `verify:${id}:spec`, phase: 'Verify', schema: FIND }),
  () => agent(vprompt(CODE_LENS), { label: `verify:${id}:code`, phase: 'Verify', schema: FIND }),
])
const all = verdicts.filter(Boolean).flatMap((v) => v.findings)
const must = all.filter((f) => f.severity === 'blocker' || f.severity === 'major')
log(`${id}: ${all.length} findings, ${must.length} blocker/major`)
let fixed = null
if (must.length > 0) {
  phase('Fix')
  fixed = await agent(
    `You are the FIXER for sub-slice ${id} of telelean slice 1. Read ${S}/builder_rules.md (mandatory) and the brief ${S}/briefs/${id}.md. The builder already implemented it (its report is below); two verifiers raised the findings below. Fix every blocker and major finding (and minor ones that are cheap and clearly right), in the working tree, without undoing the rest of the builder's work. If you judge a finding wrong, do not change the code for it; say why in your report. Then re-run the brief's verification commands (capped.sh, one at a time, vitest one worker; runner: only touched test files with timeout 900) and quote the summary lines.\n\n=== BUILDER REPORT ===\n${built}\n=== END ===\n\n=== FINDINGS (JSON) ===\n${JSON.stringify(all, null, 1)}\n=== END ===\n\nYour final message: for each finding, fixed / not fixed (why); files changed; verification output; effects outside the repo and your scratch dir.`,
    { label: `fix:${id}`, phase: 'Fix' },
  )
}
return { id, built, verdicts, fixed }
