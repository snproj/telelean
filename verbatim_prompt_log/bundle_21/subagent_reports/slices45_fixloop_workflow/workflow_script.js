export const meta = {
  name: 'plan-fixloop',
  description: 'Fix given findings in telelean plan files, then a fresh two-lens recheck; repeat up to 2 rounds while blockers or majors remain',
  phases: [{ title: 'Fix' }, { title: 'Recheck' }],
}
// args: { plans: [abs paths], findings: [...], context: '<one paragraph>', label: '<short>' }
const R = '/home/zhengyew/telelean'
const AP = R + '/verbatim_prompt_log/bundle_21/user_requested_documents/02_autopilot_decisions.md'
const SPEC = R + '/verbatim_prompt_log/bundle_21/user_requested_documents/01_spec_v4.md'
const SAFE = `SAFETY AND RESOURCE RULES (mandatory): no network, no installs, no Claude CLI, no builds, no tests, no Lean, no tsc/vitest (other agents are building in the same tree). Never change git state. Never send, post, upload or publish anything. Read-only everywhere except the plan files your task names.`
const CTX = `Context: telelean (${R}) shows a user's beliefs as cards backed by Lean 4 files; Claude formalises and proves; a non-LLM gate decides what counts. Spec v4.1 ${SPEC}; autopilot decisions ${AP} (respect every AP-n, especially AP-24 and AP-31: never reintroduce a mechanism they removed; if a finding seems to need one, choose the simplest alternative and log it as a decision). ${args.context}`
const FIND = { type: 'object', properties: { summary: { type: 'string' }, findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] }, plan: { type: 'string' }, where: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'plan', 'where', 'problem', 'fix'] } } }, required: ['summary', 'findings'] }
const sev = (fs) => fs.filter((f) => f.severity === 'blocker' || f.severity === 'major').length
let open = args.findings
const rounds = []
for (let round = 1; round <= 2 && open.length > 0; round++) {
  phase('Fix')
  const fx = await agent(`${SAFE} You edit only these files: ${args.plans.join(', ')}.\n\n${CTX}\n\nFix every finding below in the plan it names (blockers and majors must; minors and nits when cheap and clearly right); if a finding is wrong, change nothing for it and say why. Keep the plans consistent with each other (update every section a change touches: scopes, contracts, tests, decisions, coverage); add dated change-log lines. Return one disposition per finding.\n\n=== FINDINGS ===\n${JSON.stringify(open, null, 1)}`, { label: `fix:${args.label}:r${round}`, phase: 'Fix' })
  phase('Recheck')
  const re = await agent(`${SAFE} Read-only.\n\n${CTX}\n\nA fixer just handled the findings below in ${args.plans.join(', ')} (its report follows). (1) Check each is really fixed or rightly rejected; re-raise it with the same id if not. (2) Then, with two lenses — soundness and lifecycle (could anything be accepted unseen, frozen or held content change, a decision be lost, the base move, the Undo stacks interfere, a hidden result leak), and fidelity and buildability (the user's words and the AP decisions; contracts consistent with the earlier slices' plans and the built code; each sub-slice buildable by one agent with precise tests) — look for NEW blocker or major problems, especially ones the fixes introduced. Report only real problems with concrete fixes.\n\n=== FINDINGS ===\n${JSON.stringify(open, null, 1)}\n=== FIXER ===\n${fx}\n=== END ===`, { label: `recheck:${args.label}:r${round}`, phase: 'Recheck', schema: FIND })
  rounds.push({ round, findings: open, fix: fx, recheck: re })
  open = re ? re.findings : []
  log(`round ${round}: ${open.length} open, ${sev(open)} blocker/major`)
  if (sev(open) === 0) break
}
return { rounds, open }
