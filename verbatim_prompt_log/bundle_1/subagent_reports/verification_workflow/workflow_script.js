export const meta = {
  name: 'telelean-final-verification',
  description: 'Two fresh agents verify the revised telelean design docs: fix verification + fresh-eyes consistency/readability',
  phases: [{ title: 'Verify', detail: '2 read-only verifiers' }],
}
const B = '/home/zhengyew/telelean/verbatim_prompt_log/bundle_1'
const CONTEXT = `
You are verifying the REVISED design documents for "telelean" (a VS Code extension mapping a user's mental model as ASSUMPTION/DERIVATION/GOAL nodes backed by Lean 4, with Claude via the user's subscription). No code exists yet; these docs go to the user for approval.
Read (read-only): ${B}/prompt1.md, ${B}/prompt1_midturn.md, ${B}/user_requested_documents/01_consolidated_idea.md, 02_design_decisions.md, 03_architecture.md. The independent review that prompted the revision: ${B}/subagent_reports/review_workflow/agents/review-*.md and the disposition table ${B}/subagent_reports/review_workflow/DISPOSITIONS.md. Byte-exact policy sources: ${B}/subagent_reports/policy_sources/.
Rules: do not modify any file; the harness forbids report files, so put everything in your structured output. No experiments needed; if you run any, keep them in /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/verify/ and never touch ~/.claude/.credentials.json. Be concrete: doc + section + quote + fix. Report only real problems; say clearly if the docs are ready.`
const SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['ready', 'ready-with-minor-fixes', 'needs-work'] },
    summary: { type: 'string' },
    problems: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, severity: { type: 'string', enum: ['major', 'minor', 'nit'] },
      doc: { type: 'string' }, section: { type: 'string' }, quote: { type: 'string' },
      problem: { type: 'string' }, fix: { type: 'string' } },
      required: ['id', 'severity', 'doc', 'section', 'problem', 'fix'] } },
  },
  required: ['verdict', 'summary', 'problems'],
}
const tasks = [
  { key: 'fix-verifier', prompt: `LENS: FIX VERIFIER. For each of the 4 blockers (ENG-1, LS-1, SEC-PATHGUARD-SYMLINK, SEC-SANDBOX-RUN-SOCKETS) and each 'major' issue in the review outputs, check that the revised docs actually implement the disposition claimed in DISPOSITIONS.md, correctly and without introducing new errors (e.g. is the new bwrap allowlist command plausible on Ubuntu 24.04 — /lib, /lib64, /bin symlinks to usr — and does it still bind what Lean/elan/lake need (e.g. /etc/ssl? /proc, /dev, ~/.elan toolchain, the shadow, read-only packages, the extractor)? Is the D-3 vocabulary rule (monomorphic sort formers, Prop-ending predicates, Prop axioms; constants as noncomputable opaque with an existence axiom 'axiom Character.exists : Nonempty Character' + instance) internally consistent and does it actually close LS-1/LS-2? Is D-2 option (b) consistently used in 03's examples/tables? Are presuppositions handled consistently between D-3, D-5, 03 §3.3, §4, §8.5? Flag any claim marked 'ran' that the evidence does not support.` },
  { key: 'fresh-eyes', prompt: `LENS: FRESH-EYES READER (you are the user: formal-methods background, linguistics/HCI interests, wants to approve the design quickly and start using the tool). Read the three docs end to end. Find: contradictions between docs or sections; ★ questions that are unclear, double-barrelled, or missing a recommended answer; places where the docs still contradict the user's explicit wording without flagging it; stale references (e.g. to a 4th 'Instruct' switch position, DEFINITION/DECISION markup kinds, 'theorem := by sorry' as the recommended encoding, 'kind:' as canonical, two-phase mid-run sign-off as default, unsandboxed refresh builds, 'fully grounded' status) that survived the revision; and anything a user could not act on. Also check that 01's sentence-traceability claims still hold after the revision (e.g. S4, S15, S16, S25, S26, S31, S37, S39, S40 are still honoured by the revised design).` },
]
phase('Verify')
const res = await parallel(tasks.map(t => () => agent(CONTEXT + '\n' + t.prompt, { label: 'verify:' + t.key, phase: 'Verify', schema: SCHEMA })))
return tasks.map((t, i) => ({ key: t.key, result: res[i] }))
