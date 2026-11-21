export const meta = {
  name: 'plan-review-ultra',
  description: 'Ultracode review of a telelean slice plan: 5 single-lens critics, an adversarial refuter per critic, a fixer, then fresh re-critique (max 2 fix rounds)',
  phases: [{ title: 'Find' }, { title: 'Refute' }, { title: 'Fix' }, { title: 'Recheck' }],
}
// args: { plan: '<abs path of the plan file>', slice: '3', scope: '<one paragraph: what the slice covers>', extraReads: '<files every agent must read>' }
const R = '/home/zhengyew/telelean'
const SPEC = R + '/verbatim_prompt_log/bundle_21/user_requested_documents/01_spec_v4.md'
const AP = R + '/verbatim_prompt_log/bundle_21/user_requested_documents/02_autopilot_decisions.md'
const P1 = R + '/docs/slice1-plan.md'
const P2 = R + '/docs/slice2-plan.md'
const U20 = R + '/verbatim_prompt_log/bundle_20/prompt20.md'
const U21 = R + '/verbatim_prompt_log/bundle_21/prompt21.md'
const U21M = R + '/verbatim_prompt_log/bundle_21/prompt21_midturn.md'
const PLAN = args.plan
const SAFETY = `SAFETY AND RESOURCE RULES (mandatory): READ-ONLY everywhere unless your task names the ONE file you edit (${PLAN}). Never change git state (read-only git is fine). No network, no installs, no Claude CLI, no builds, no tests, no Lean, no tsc/vitest: other agents are building in the same working tree right now, so the code is in flux. Never touch ${R}/packages/extension/dist or out. Never send, post, upload or publish anything.`
const CONTEXT = `Context: telelean (${R}) is a VS Code extension (TypeScript monorepo: packages/core, runner, extension, webview) that shows a user's beliefs as cards backed by Lean 4 files; Claude formalises and proves through the user's Claude Code CLI; a non-LLM gate decides what counts. Spec v4.1: ${SPEC}. Autopilot decisions: ${AP}. Slice 1 (the new board) is done (${P1}); slice 2 (the review list: edit sessions, review items, statuses, Apply with the backstop, the session Undo stack) is being built now from ${P2} (its §2/§2.9 contracts are final; its §8 change log records what builders decided). The plan under review is ${PLAN}, for slice ${args.slice}: ${args.scope}\nThe user's own words outrank the spec and every plan: ${U20} (the turn-20 specification), ${U21} and ${U21M} (turn 21, including the mid-turn answers D1-D6 and the undo/read-only message).${args.extraReads ? '\nAlso read: ' + args.extraReads : ''}`
const FINDING = { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] }, where: { type: 'string' }, problem: { type: 'string' }, scenario: { type: 'string', description: 'concrete sequence of events or code path showing the problem' }, fix: { type: 'string', description: 'concrete change to the plan text' } }, required: ['id', 'severity', 'where', 'problem', 'fix'] }
const FIND = { type: 'object', properties: { summary: { type: 'string' }, findings: { type: 'array', items: FINDING } }, required: ['summary', 'findings'] }
const VERD = { type: 'object', properties: { verdicts: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, real: { type: 'boolean' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] }, reason: { type: 'string' } }, required: ['id', 'real', 'severity', 'reason'] } } }, required: ['verdicts'] }
const DISP = { type: 'object', properties: { summary: { type: 'string' }, dispositions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, action: { type: 'string', enum: ['fixed', 'rejected', 'partly'] }, note: { type: 'string' } }, required: ['id', 'action', 'note'] } } }, required: ['summary', 'dispositions'] }

const LENSES = [
  { key: 'checks', text: 'SOUNDNESS OF THE MECHANICAL CHECKS. Act as Claude trying to get forbidden changes counted. For every protection the slice promises, construct concrete edit sequences (including multi-step ones, ones that change and restore content between checks, ones that act through Lean elaboration such as instances, coercions, attributes, open, notation, or through files the checks do not read) and trace through the plan whether each judged state refuses them. Also look for false refusals that would block legitimate work.' },
  { key: 'lifecycle', text: 'LIFECYCLE, PERSISTENCE AND UNDO. Trace every piece of state the plan adds through: start of a session, each step, Cancel, Retry, failure, rollback, reload mid-step, VS Code crash, Apply, Exit, History restore, and Undo/Redo on both stacks (the board stack outside sessions, the session stack inside). Find any sequence that loses, duplicates, resurrects or wrongly keeps state, or makes the two Undo stacks interfere (the user explicitly demanded they never interact badly), or changes the session base (which must never move).' },
  { key: 'intent', text: 'FIDELITY TO THE USER. Compare the plan, clause by clause, with the user\'s own words and the spec clauses it implements. Find anything missing, narrowed, reinterpreted or added without a logged AUTOPILOT DECISION; anything that would surprise the user; and any logged decision whose reasoning does not hold. Quote the user\'s words for each finding.' },
  { key: 'build', text: 'IMPLEMENTABILITY. Check every contract against the slice-2 plan\'s final contracts (§2, §2.9 and the §8 change log) and the slice-1 code as it is (read it): names, types, call sites, data flow, persistence formats, protocol validators. Check each sub-slice can be built by one agent in order, ends compiling with tests passing, and that its tests are specified precisely enough to be written. Find missing pieces, contradictions between sections, and steps that would need code that does not exist yet.' },
  { key: 'ui', text: 'USER INTERFACE AND INTERACTION. Check the UI design against the spec\'s CM/BD/FZ clauses and what slices 1 and 2 already show: selection of every addressable thing, availability everywhere the spec requires, enablement and disabled reasons, dialogs, keyboard use, the look (colour tokens that never clash with the blue/green glows and diff halos, high contrast, never colour alone), consistency of wording with slices 1-2, and Playwright-testability with the mock-host harness.' },
]
phase('Find')
const verified = await pipeline(
  LENSES,
  (l) => agent(`${SAFETY}\n\n${CONTEXT}\n\nYou are one of five independent critics of the plan ${PLAN}. YOUR LENS ONLY: ${l.text}\n\nBe concrete and adversarial; report only real problems, each with a scenario and a concrete fix to the plan text. Severity: blocker = a safety property of the spec can be violated, or the slice cannot be built as planned; major = a requirement missing or wrong, a contradiction, an untestable or unbuildable part; minor = unclear or low-impact; nit = cosmetic.`, { label: `find:${l.key}`, phase: 'Find', schema: FIND }),
  (found, l) => {
    if (!found) return null
    const serious = found.findings.filter((f) => f.severity === 'blocker' || f.severity === 'major')
    const rest = found.findings.filter((f) => !(f.severity === 'blocker' || f.severity === 'major'))
    if (serious.length === 0) return { lens: l.key, confirmed: [], refuted: [], rest }
    return agent(`${SAFETY}\n\n${CONTEXT}\n\nYou are an adversarial REFUTER. Another critic (lens: ${l.key}) reported the serious findings below about ${PLAN}. For each, try hard to refute it: read the plan text it cites and everything relevant (the plan elsewhere may already handle it; the scenario may be impossible; the slice-2 contracts may already cover it; the severity may be overstated). Decide real=true only if the problem survives your best refutation; give the severity it really deserves. Be strict both ways: do not wave away a real safety problem.\n\n=== FINDINGS ===\n${JSON.stringify(serious, null, 1)}`, { label: `refute:${l.key}`, phase: 'Refute', schema: VERD }).then((v) => {
      const by = new Map((v ? v.verdicts : []).map((x) => [x.id, x]))
      const confirmed = []; const refuted = []
      for (const f of serious) {
        const x = by.get(f.id)
        if (!x || x.real) confirmed.push(x ? { ...f, severity: x.severity, refuter: x.reason } : f)
        else refuted.push({ ...f, refuter: x.reason })
      }
      return { lens: l.key, confirmed, refuted, rest }
    })
  },
)
const all = verified.filter(Boolean)
let open = all.flatMap((v) => [...v.confirmed, ...v.rest].map((f) => ({ ...f, id: `${v.lens}-${f.id}` })))
const refutedAll = all.flatMap((v) => v.refuted.map((f) => ({ ...f, id: `${v.lens}-${f.id}` })))
const sev = (fs) => fs.filter((f) => f.severity === 'blocker' || f.severity === 'major').length
log(`found: ${open.length} kept (${sev(open)} blocker/major), ${refutedAll.length} refuted`)
const rounds = []
for (let round = 1; round <= 2 && open.length > 0; round++) {
  phase('Fix')
  const fix = await agent(`${SAFETY} EXCEPTION: you edit exactly ONE file, ${PLAN}.\n\n${CONTEXT}\n\nYou are the FIXER of the plan (round ${round}). Apply every blocker and major finding below, and the minor ones that are cheap and clearly right; nits only when they remove ambiguity. If you judge a finding wrong, do not change the plan for it and say why. Keep the plan coherent: when you change a contract, update every section that uses it (sub-slice scopes, tests, decisions). New or changed decisions go in the decisions section as "AUTOPILOT DECISION:" with the alternative and how to reverse it. Add one dated line to the change log section: "ultra review round ${round}: …". Prefer the simplest sound fix.\n\n=== FINDINGS ===\n${JSON.stringify(open, null, 1)}`, { label: `fix:r${round}`, phase: 'Fix', schema: DISP })
  phase('Recheck')
  const re = await agent(`${SAFETY}\n\n${CONTEXT}\n\nYou are a fresh critic of ${PLAN} after a fix round. (1) Check each finding below against the plan now: is it really fixed, or rightly rejected? Re-raise it (same id) if not. (2) Then look, with all five lenses (soundness of the checks; lifecycle/persistence/undo; fidelity to the user's words; implementability against the slice-2 contracts and slice-1 code; UI), for NEW blocker or major problems, especially ones the fixes introduced. Report only real problems with a scenario and a concrete fix.\n\n=== FINDINGS AND DISPOSITIONS ===\n${JSON.stringify({ findings: open, dispositions: fix ? fix.dispositions : null }, null, 1)}`, { label: `recheck:r${round}`, phase: 'Recheck', schema: FIND })
  rounds.push({ round, findings: open, fix, recheck: re })
  open = re ? re.findings : []
  log(`round ${round}: ${open.length} open after recheck, ${sev(open)} blocker/major`)
  if (sev(open) === 0) break
}
return { verified: all, refuted: refutedAll, rounds, open }
