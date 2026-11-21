export const meta = {
  name: 'verify-edit-session-spec-v3',
  description: 'Final read-only verification of spec v3: fresh-eyes consistency check + soundness re-check of the fixes',
  phases: [{ title: 'Verify', detail: '2 verifiers: consistency, soundness of fixes' }],
}

const PRE = `You are a final verifier of a design proposal for "telelean", a personal-prototype VS Code extension in /home/zhengyew/telelean. telelean shows a user's mental model as a board of ASSUMPTION / DERIVATION / GOAL cards backed by Lean 4 files; "These suffice" makes Claude (an LLM) formalise selected cards in a private copy and prove a goal; a non-LLM gate (Lean build, #print axioms footprints, lake comparator, rule checks) decides whether the result counts. The user has a formal-methods background; soundness ("proved" means proved from exactly what is shown) and "the LLM never adds beliefs without my approval" are non-negotiable.

Inputs:
- The user's ORIGINAL specification: /home/zhengyew/telelean/verbatim_prompt_log/bundle_20/prompt20.md (between the '=' lines; ignore the three questions at the end).
- The proposal to verify (v3): /home/zhengyew/telelean/verbatim_prompt_log/bundle_20/user_requested_documents/01_edit_sessions_spec_proposal.md
- Background, if your lens needs it: the code maps in /home/zhengyew/telelean/verbatim_prompt_log/bundle_20/subagent_reports/understand_workflow/agents/ (gate-accept.md is the gate; run-engine.md the run engine), and the earlier review of v2 with its dispositions in /home/zhengyew/telelean/verbatim_prompt_log/bundle_20/subagent_reports/review_workflow/ (agents/*.md and DISPOSITIONS.md).

Report only real problems that would cause wrong behaviour, an unsafe result, or a wrong approval decision by the user; rank them (blocker, major, minor). For each: the clause IDs, a concrete scenario, and a concrete fix (replacement wording). Do not re-raise points the proposal already handles; do not praise. If you find no blocker or major, say so plainly in the verdict.

HARD RULES (the user's standing safety instructions; follow exactly):
- Strictly read-only. Do not create, modify, move or delete any file anywhere. Use Read/Grep/Glob and read-only shell commands only.
- Never change git state; never push, publish, upload or send anything; no network access.
- Never run Claude, tests, builds, Lean/lake, VS Code, Chrome or Playwright (the machine has very little free RAM).
- Do not spawn subagents.`

const SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          clauses: { type: 'string' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          problem: { type: 'string' },
          suggested_fix: { type: 'string' },
        },
        required: ['id', 'clauses', 'severity', 'problem', 'suggested_fix'],
      },
    },
  },
  required: ['verdict', 'findings'],
}

const LENSES = [
  { key: 'consistency', prompt: `LENS: FRESH-EYES CONSISTENCY. Read v3 as the user will, start to finish, without the earlier review. Find: clauses that contradict each other; actions or states whose outcome is undefined (walk a session: start by These suffice and by Transform cards…, a Claude step, a review stage with accepts/declines of each option, a mid-stage These suffice, Submit, Apply, Exit, a reload, a failed step); terms used before or without definition; places where Part 2's decisions, Part 3's fixes or Part 4's change log misdescribe Part 1 (wrong clause numbers, a 'changed' clause missing from Part 4, a tag that misdescribes the change); and anything in the 'biggest changes' summary or Appendix C that is inaccurate. Also flag wording that would mislead the user into approving something different from what Part 1 says.` },
  { key: 'soundness', prompt: `LENS: DO THE FIXES HOLD, AND DID THEY OPEN NEW HOLES? The v2 review raised blockers: soundness F1 (held set from 'uses' misses other cards' statements/proofs and instances), soundness F2 and logic F1 (belief classification missed existing names becoming axioms, Kind changes by Claude), implementability F1 (instance ban breaks every new constant), plus majors on meaning-before-proof, the These suffice preset, telelean-kept data, proposed premises, the gate baseline, transform proofs. (1) For each, check whether v3's text actually closes it (cite the clause) or what remains open. (2) Then try to break v3's NEW mechanisms with concrete Spyro-style Lean scenarios: RV-1's mechanical completion of a goal's proof when a proposed premise is accepted (what exactly is composed, re-checked against what, and can it certify something the user did not see?); RV-11 (an accepted proof counts like the user's own for later inferences: any circularity or permitted-set widening?); TR-15 (Claude-free transforms applied directly outside a session: any way an unchecked or unsafe state reaches the files, e.g. typed Lean, kind changes, deletes with dependents?); FZ-5 'Allow this change' on held content; RV-6 Show result; ES-2's open target Proof ('replaces your proof'); RV-7's classification (any belief-bearing change still group-acceptable?); §11's guarantees and Apply's backstop (are they mechanically checkable as stated?). Report what is still unsafe, with the minimal fix.` },
]

phase('Verify')
const res = await parallel(LENSES.map(l => () =>
  agent(PRE + '\n\n' + l.prompt, { label: 'verify:' + l.key, phase: 'Verify', schema: SCHEMA })
    .then(r => (r ? { key: l.key, ...r } : null))))
const got = res.filter(Boolean)
log(`${got.length}/2 verifications; ${got.reduce((n, r) => n + r.findings.length, 0)} findings`)
return { verifications: got }
