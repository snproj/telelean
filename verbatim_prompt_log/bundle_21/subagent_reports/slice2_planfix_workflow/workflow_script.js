export const meta = {
  name: 'slice2-plan-fix',
  description: 'Fix docs/slice2-plan.md against its critique, then re-critique (loop until no blocker/major, max 2 rounds)',
  phases: [{ title: 'Fix' }, { title: 'Recheck' }],
}
const R = '/home/zhengyew/telelean'
const PLAN = R + '/docs/slice2-plan.md'
const SPEC = R + '/verbatim_prompt_log/bundle_21/user_requested_documents/01_spec_v4.md'
const SAFETY = `SAFETY AND RESOURCE RULES (mandatory): never change git state; no network, no installs, no Claude, no builds, no tests, no Lean (other agents are building in the same tree now). Do not touch packages/extension/dist or out. Read-only except where your task says you edit ONE file.`
const CRIT = { type: 'object', properties: { summary: { type: 'string' }, findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] }, where: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'where', 'problem', 'fix'] } } }, required: ['summary', 'findings'] }

const FIRST = '/home/zhengyew/telelean/verbatim_prompt_log/bundle_21/subagent_reports/slice2_design_workflow/agents/critique_plan.json'
let findings = null
const rounds = []
for (let round = 1; round <= 2; round++) {
  phase('Fix')
  const fixed = await agent(`${SAFETY} EXCEPTION: you edit exactly one file, ${PLAN}.\n\nYou are fixing the slice-2 implementation plan of telelean (${PLAN}; read it fully, then the spec ${SPEC} for the clauses it cites, and the code it names where you need to check a contract). An adversarial critic raised the findings below. Fix EVERY blocker and major finding in the plan text, and every minor and nit that is cheap and clearly right. Keep the plan's structure (§0-§9), keep clause references, keep sub-slices buildable one at a time by one agent each (split a sub-slice if the critic says it is too large, e.g. 2b). Where a fix is a design choice, mark it "AUTOPILOT DECISION:" with the alternative in §7.2, so the integrator can log it. Add a dated entry to the plan's change log (§8) listing what changed and which finding each change answers. If you judge a finding wrong, do not change the plan for it; say why in your reply. Your final message: per finding, fixed / not fixed (why), and the new sub-slice list (id + one line).\n\n=== FINDINGS (round ${round}) ===\n${findings === null ? `Read them from the JSON file ${FIRST} (its "findings" array: 1 blocker, 14 major, 17 minor, 2 nit).` : JSON.stringify(findings, null, 1)}`, { label: `fix:round${round}`, phase: 'Fix' })
  phase('Recheck')
  const crit = await agent(`${SAFETY}\n\nCritique the telelean slice-2 plan at ${PLAN} adversarially and FRESHLY (it was just revised; its §8 change log says what changed). Context: the spec is ${SPEC} (slice 2 = the review list: ES-1..ES-9 for Formalize-started sessions with several targets, RV-1..RV-13, DO-0/1/3 (DO-2 waits for slice 4), EN-1..EN-4, UN-4..UN-6, CM-6, Appendix B B.1-B.4 + backstop; FROZEN, transform window and references are later slices; in slice 2 Accept does not freeze). Lenses: (1) SOUNDNESS — can anything become assumed without the user's individual Accept, can a result show before the meaning check, can a state no check judged be applied, can a proof rest on something its question does not allow, can the user's decisions be lost on rollback/reload/crash? (2) IMPLEMENTABILITY — are the contracts complete, consistent and type-correct against the current code (read it), is each sub-slice buildable by one agent? Report only real problems with concrete fixes. The previous round's findings are ${findings === null ? 'in ' + FIRST : 'these: ' + JSON.stringify(findings.map((f) => f.id + ': ' + f.problem.slice(0, 160)))} — check they are really fixed, and look for new ones.`, { label: `recheck:round${round}`, phase: 'Recheck', schema: CRIT })
  rounds.push({ round, fixed, crit })
  const must = (crit?.findings ?? []).filter((f) => f.severity === 'blocker' || f.severity === 'major')
  log(`round ${round}: ${crit?.findings?.length ?? 0} findings, ${must.length} blocker/major`)
  findings = crit?.findings ?? []
  if (must.length === 0) break
}
return { rounds, remaining: findings }
