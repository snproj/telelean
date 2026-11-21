export const meta = {
  name: 'slices45-simplify-apply',
  description: 'Apply AP-31 (R1-R8) to the slice-4 and slice-5 plans, then two independent critics over both, then fix + recheck (max 2 rounds)',
  phases: [{ title: 'Apply' }, { title: 'Check' }, { title: 'Fix' }, { title: 'Recheck' }],
}
const R = '/home/zhengyew/telelean'
const S = '/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad'
const SPEC = R + '/verbatim_prompt_log/bundle_21/user_requested_documents/01_spec_v4.md'
const AP = R + '/verbatim_prompt_log/bundle_21/user_requested_documents/02_autopilot_decisions.md'
const P2 = R + '/docs/slice2-plan.md'
const P3 = S + '/plans/slice3-plan.md'
const P4 = S + '/plans/slice4-plan.md'
const P5 = S + '/plans/slice5-plan.md'
const JUDGED = S + '/plans/simplify45_judged.json'
const PROPS = R + '/verbatim_prompt_log/bundle_21/subagent_reports/slices45_simplify_workflow/agents/'
const U20 = R + '/verbatim_prompt_log/bundle_20/prompt20.md'
const U21M = R + '/verbatim_prompt_log/bundle_21/prompt21_midturn.md'
const SAFE = `SAFETY AND RESOURCE RULES (mandatory): no network, no installs, no Claude CLI, no builds, no tests, no Lean, no tsc/vitest (other agents are building slice 2 in the same tree). Never change git state. Never send, post, upload or publish anything. You may edit ONLY the plan file(s) your task names (all in a scratch directory); read-only everywhere else.`
const CTX = `Context: telelean (${R}) shows a user's beliefs as cards backed by Lean 4 files; Claude formalises and proves; a non-LLM gate decides what counts. Spec v4.1 ${SPEC}; decisions ${AP} (read AP-24 and AP-31). Slice 1 built; slice 2 (${P2}) being built; slice 3 planned (${P3}); slice 4 (the transform window, ${P4}) and slice 5 (references, ${P5}) planned and ultra-reviewed. The orchestrator ADOPTED AP-31: the judge's recommended set R1-R8 in ${JUDGED} (field 'recommended', with each change in full; the three proposals behind it are in ${PROPS}), plus the judge's 'open_after' list (the four fixer items and S5R2-08). The user's own words: ${U20} (TRANSFORM, DECLINE OPTIONS, REFERENCE SYSTEM) and ${U21M}.`

phase('Apply')
const e4 = await agent(`${SAFE} You edit exactly ONE file: ${P4}.\n\n${CTX}\n\nAPPLY AP-31 TO THE SLICE-4 PLAN. Rewrite the plan so that R1-R8 (as the judge's 'recommended' entries specify) ARE the design: remove the mechanisms they replace (typed units and typed items, TransformFreeze and its revalue/follow-on variants, the typed write inside a Claude step and the second baseline S₀ᵗ, 'Claude must define', Edit… of a queued transform and its re-base, the premise step, detach), and rewrite every section that depended on them: §1 order and §1.1 scopes (re-plan the sub-slices so each is buildable by one agent; fewer is better), §2 contracts, §3 design, §4 UI, §5 Undo and persistence, §6 tests and cheats (keep every cheat that still applies; add the ones the judge's 'open_after' asks for), §7 decisions (replace superseded D4-n with new ones citing AP-31 R1-R8, each with what the user loses and the reversal), §9 coverage (every audit row still covered or narrowed by a logged decision). Also handle the judge's 'open_after' fixer items 1-4 (hidden results during R1's judge — take the write back only on failures caused by visible content, twin tests; crash/reload during the decision write — slice 2's inFlight; the 'you typed it' comparison ignoring derived id write-backs and normalise's pins; the amendments to slices 2 and 3, which slice-4 sub-slices implement as extensions of the built code — list them in a new §2.10 'Amendments to slices 2 and 3' and do NOT edit those plans). Add a dated §8 line: 'AP-31 applied'. Return: the new sub-slice list, the decisions, and what slice 5 must change to match.`, { label: 'apply:slice4', phase: 'Apply' })

const e5 = await agent(`${SAFE} You edit exactly ONE file: ${P5}.\n\n${CTX}\n\nAPPLY AP-31 TO THE SLICE-5 PLAN, consistently with the slice-4 plan just rewritten (its editor's report follows). Specifically: R6 (no detach: drop D5-12's detach, detachRefs, detach units, planTypedWrite's base, the 'card Claude made in this session' problem, the end confirmation's follow-on row; a trashed referenced card's unfrozen referrers keep their tokens and read 'deleted card', listed in the Delete dialog's 'Referred to by'; changing a referenced field warns unfrozen referrers; nothing another subject relies on changes in a session; one predicate for what Claude may change; a window draft's token naming a card in that window's trash is refused), R3's holder rule for references (a frozen card that refers to content the transform changes must be unfrozen, deleted too, or edited in the same window; D5-19's revalue and set-aside go), R5 (no mirrors rewritten inside a session), and the S5R2-08 picker fix (→ is taken only when the character after the caret is whitespace or the end of the field; pickerReduce tests for both). Rewrite every dependent section (§1, §1.1, §2, §3, §4, §5, §6 tests and cheats, §7 decisions citing AP-31, §9 coverage) and add a dated §8 line. Return the sub-slice list and the decisions.\n\n=== SLICE-4 EDITOR'S REPORT ===\n${e4}\n=== END ===`, { label: 'apply:slice5', phase: 'Apply' })

const FIND = { type: 'object', properties: { summary: { type: 'string' }, findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] }, plan: { type: 'string', enum: ['slice4', 'slice5', 'both'] }, where: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'plan', 'where', 'problem', 'fix'] } } }, required: ['summary', 'findings'] }
phase('Check')
const LENSES = [
  { key: 'sound', text: 'SOUNDNESS AND LIFECYCLE. Act as Claude trying to get forbidden changes counted, and trace every new state through start, steps, Cancel, Retry, failure, reload mid-write, crash, Undo/Redo on both stacks, Submit, Apply and Exit. Can anything become assumed without the user\'s individual Accept, can frozen or held content change, can the person\'s typed content be misattributed, can a decision be lost, can the base move, can the two Undo stacks interfere, can a hidden result leak through R1\'s judge?' },
  { key: 'intent-build', text: 'FIDELITY AND BUILDABILITY. Compare both plans with the user\'s own words and AP-31: is every user capability that AP-31 keeps really there, and every loss logged? Check the contracts against the slice-2 plan\'s final contracts and §8, the slice-3 plan, and the built code; check each sub-slice is buildable by one agent in order with precise tests; check the two plans agree with each other and with §2.10\'s amendments; check the UI parts (window, badges, dialogs, the # picker) are specified and testable.' },
]
const checks = await parallel(LENSES.map((l) => () => agent(`${SAFE} Read-only: you edit nothing.\n\n${CTX}\n\nThe slice-4 and slice-5 plans were just rewritten to apply AP-31 (the editors' reports follow). YOUR LENS: ${l.text} Report only real problems, each with a concrete fix and the plan it is in.\n\n=== SLICE-4 EDITOR ===\n${e4}\n=== SLICE-5 EDITOR ===\n${e5}\n=== END ===`, { label: `check:${l.key}`, phase: 'Check', schema: FIND })))
let open = checks.filter(Boolean).flatMap((c, i) => c.findings.map((f) => ({ ...f, id: `${LENSES[i].key}-${f.id}` })))
const sev = (fs) => fs.filter((f) => f.severity === 'blocker' || f.severity === 'major').length
log(`check: ${open.length} findings, ${sev(open)} blocker/major`)
const rounds = []
for (let round = 1; round <= 2 && open.length > 0; round++) {
  phase('Fix')
  const fx = await agent(`${SAFE} You edit ${P4} and ${P5} (only these).\n\n${CTX}\n\nFix every finding below in the plan it names (blockers and majors must; minors when cheap and clearly right); if a finding is wrong, change nothing for it and say why. Stay within AP-31 (do not reintroduce the mechanisms it removed; if a finding seems to need one, propose the simplest alternative and log it as a decision). Keep both plans consistent; add dated §8 lines. Return one disposition per finding.\n\n=== FINDINGS ===\n${JSON.stringify(open, null, 1)}`, { label: `fix:r${round}`, phase: 'Fix' })
  phase('Recheck')
  const re = await agent(`${SAFE} Read-only.\n\n${CTX}\n\nA fixer just handled the findings below (its report follows). Check each is really fixed or rightly rejected (re-raise with the same id if not), then look, with both lenses (soundness/lifecycle and fidelity/buildability), for NEW blocker or major problems in either plan. Report only real problems with concrete fixes.\n\n=== FINDINGS ===\n${JSON.stringify(open, null, 1)}\n=== FIXER ===\n${fx}\n=== END ===`, { label: `recheck:r${round}`, phase: 'Recheck', schema: FIND })
  rounds.push({ round, findings: open, fix: fx, recheck: re })
  open = re ? re.findings : []
  log(`round ${round}: ${open.length} open, ${sev(open)} blocker/major`)
  if (sev(open) === 0) break
}
return { e4, e5, checks, rounds, open }
