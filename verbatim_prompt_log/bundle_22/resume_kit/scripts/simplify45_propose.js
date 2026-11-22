export const meta = {
  name: 'slices45-simplify-propose',
  description: 'Judge panel: three independent simplification proposals for the slice-4 (transform window) and slice-5 (references) plans, from different angles, then a judge scores them and recommends a combined set',
  phases: [{ title: 'Propose' }, { title: 'Judge' }],
}
const R = '/home/zhengyew/telelean'
const S = '/tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad'
const SPEC = R + '/verbatim_prompt_log/bundle_21/user_requested_documents/01_spec_v4.md'
const AP = R + '/verbatim_prompt_log/bundle_21/user_requested_documents/02_autopilot_decisions.md'
const P2 = R + '/docs/slice2-plan.md'
const P3 = S + '/plans/slice3-plan.md'
const P4 = S + '/plans/slice4-plan.md'
const P5 = S + '/plans/slice5-plan.md'
const REV4 = R + '/verbatim_prompt_log/bundle_21/subagent_reports/slice4_ultra_review_workflow/agents/'
const REV5 = R + '/verbatim_prompt_log/bundle_21/subagent_reports/slice5_ultra_review_workflow/agents/'
const OPEN4 = S + '/plans/slice4_open_after_ultra.json'
const OPEN5 = S + '/plans/slice5_open_after_ultra.json'
const U20 = R + '/verbatim_prompt_log/bundle_20/prompt20.md'
const U21M = R + '/verbatim_prompt_log/bundle_21/prompt21_midturn.md'
const SAFETY = `SAFETY AND RESOURCE RULES (mandatory): READ-ONLY everywhere; you edit no file. Never change git state. No network, no installs, no Claude CLI, no builds, no tests, no Lean (other agents are building slice 2 in the same tree). Never send, post, upload or publish anything.`
const CONTEXT = `Context: telelean (${R}) shows a user's beliefs as cards backed by Lean 4 files; Claude formalises and proves; a non-LLM gate decides what counts. Spec v4.1: ${SPEC}; autopilot decisions ${AP}. Slice 1 is built; slice 2 (the review list: edit sessions, items, statuses, Apply with the backstop; plan ${P2}) is being built; slice 3 (FROZEN; plan ${P3}) is planned and reviewed. Slices 4 (THE TRANSFORM WINDOW, plan ${P4}) and 5 (REFERENCES, plan ${P5}) were drafted and each went through an ultra review (5 single-lens critics with refuters, then two fix/recheck rounds): slice 4's first pass found 3 blockers and 49 majors, and after 105 fixes its recheck found 2 NEW blockers and 4 majors introduced by the fixes; slice 5's recheck still has 2 majors. The reports are in ${REV4} and ${REV5}; the findings still open after the last recheck are in ${OPEN4} and ${OPEN5}. The trouble concentrates in the most intricate mechanisms: line-by-line ownership of the person's typed content ("typed units") mixed with Claude's content on the same card, transforms as queue steps interleaved with Claude's steps inside a session and their interaction with slice 2's step limits (S₀, openItems, existing-changed) and slice 3's freeze table (reasons, revalue, held maps), follow-on edits and mirrors, trash and units superseding each other, and slice 5's "detach" of references and held-reference revaluing. PRECEDENT: slice 2's plan hit the same wall and was simplified on purpose (AP-24 in ${AP}: stage-level reveal, no decisions while Claude works, a queue runs to its end before its stage opens) — coarser rules that are still sound, logged with what the user loses and how to reverse. The user's own words outrank everything: ${U20} (TRANSFORM, DECLINE OPTIONS, REFERENCE SYSTEM, INITIATING EDIT SESSIONS) and ${U21M} (the D-answers; D6 "search by sentence").`
const PROPOSAL = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    simplifications: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          change: { type: 'string', description: 'precisely what the slice-4/5 plans would say instead (mechanism, rules, what is refused)' },
          eliminates: { type: 'string', description: 'which open findings (ids from the two JSON files and the review reports) and which mechanisms disappear' },
          user_loses: { type: 'string', description: 'what narrows versus the spec and the user\'s words, concretely, as the user would experience it' },
          soundness: { type: 'string', description: 'why every safety property still holds (nothing assumed without the user\'s Accept, frozen/held content kept, no hidden arrows, the base never moves, decisions never lost)' },
          reversal: { type: 'string' },
        },
        required: ['id', 'title', 'change', 'eliminates', 'user_loses', 'soundness', 'reversal'],
      },
    },
    residual_risks: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'simplifications', 'residual_risks'],
}
const ANGLES = [
  { key: 'refuse-first', text: 'ANGLE: REFUSE FIRST, MINIMAL MECHANISM. Find the smallest set of coarse rules that removes the intricate mechanisms entirely: e.g. ownership per field (or per card) instead of per line; a transform inside a session first rejects/reverts Claude\'s content it touches and then applies the person\'s version as the person\'s own edit; refuse a transform that would trash or reword content another card references or holds, instead of detaching or revaluing; no follow-on edits that need tracking. Prefer refusing with a clear sentence over any repair.' },
  { key: 'user-first', text: 'ANGLE: THE USER\'S INTENT FIRST. Start from the user\'s own words about TRANSFORM, DECLINE OPTIONS and REFERENCES and keep every capability they explicitly asked for, simplifying only what they did not ask for (e.g. capabilities the spec added on its own). For each mechanism that keeps failing review, find the simplest version that still gives the user what they asked for, and say exactly what they lose otherwise.' },
  { key: 'reuse-first', text: 'ANGLE: REUSE SLICES 2 AND 3. Express transforms and references as much as possible through machinery slices 2 and 3 already build and review: the person\'s own board edits (slice 1/2 planners, D3-44 standing freezes), sessions started like Formalize (slice 2 queues, stages, items, judgeState, Apply), decline options and the reducer, the freeze table and its reasons. Every new concept slice 4/5 introduces should be justified by a requirement nothing existing covers.' },
]
phase('Propose')
const props = await parallel(ANGLES.map((a) => () => agent(`${SAFETY}\n\n${CONTEXT}\n\n${a.text}\n\nRead both plans, the open findings, and enough of the review reports to see which mechanisms keep failing. Then propose 3-8 simplifications for slices 4 and 5 together (they interact: slice 5's references ride on slice 4's freeze/transform machinery). For each: the change, what it eliminates (cite finding ids), what the user loses, why it stays sound, and how to reverse it.`, { label: `propose:${a.key}`, phase: 'Propose', schema: PROPOSAL })))
phase('Judge')
const JUDGE = {
  type: 'object',
  properties: {
    scores: { type: 'array', items: { type: 'object', properties: { proposal: { type: 'string' }, soundness: { type: 'number' }, simplicity: { type: 'number' }, fidelity: { type: 'number' }, buildability: { type: 'number' }, comment: { type: 'string' } }, required: ['proposal', 'soundness', 'simplicity', 'fidelity', 'buildability', 'comment'] } },
    recommended: { type: 'array', items: { type: 'object', properties: { from: { type: 'string', description: 'proposal key and simplification id' }, title: { type: 'string' }, change: { type: 'string' }, user_loses: { type: 'string' }, why: { type: 'string' } }, required: ['from', 'title', 'change', 'user_loses', 'why'] } },
    rejected: { type: 'array', items: { type: 'object', properties: { from: { type: 'string' }, why: { type: 'string' } }, required: ['from', 'why'] } },
    open_after: { type: 'string', description: 'which open findings the recommended set does NOT eliminate, so the fixer must still handle them' },
  },
  required: ['scores', 'recommended', 'rejected', 'open_after'],
}
const judged = await agent(`${SAFETY}\n\n${CONTEXT}\n\nThree proposers, each from a different angle, proposed simplifications (JSON below). Score each proposal 0-5 on soundness (no safety property weakened), simplicity (how much intricate mechanism disappears; how buildable by one agent per sub-slice), fidelity (how much of what the USER asked for in their own words survives), and buildability (consistent with slice 2/3 contracts). Then recommend ONE combined, coherent set, picking individual simplifications across proposals (they must not contradict each other), with what the user loses for each, and list the rejected ones with reasons. Check every recommended change against the open findings: say which open findings remain for a fixer.\n\n=== PROPOSALS ===\n${JSON.stringify(props.filter(Boolean).map((p, i) => ({ angle: ANGLES[i].key, ...p })), null, 1)}`, { label: 'judge', phase: 'Judge', schema: JUDGE })
return { proposals: props.filter(Boolean).map((p, i) => ({ angle: ANGLES[i].key, ...p })), judged }
