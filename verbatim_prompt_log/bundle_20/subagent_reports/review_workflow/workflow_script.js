export const meta = {
  name: 'review-edit-session-spec',
  description: 'Independent adversarial review of the revised edit-session spec from 4 lenses (read-only)',
  phases: [{ title: 'Review', detail: '4 lenses: fidelity, logic, soundness, implementability/HCI' }],
}

const PRE = `You are an independent, adversarial reviewer of a design proposal for "telelean", a personal-prototype VS Code extension in /home/zhengyew/telelean. telelean shows a user's mental model as a board of ASSUMPTION / DERIVATION / GOAL cards backed by Lean 4 files (each card is an \`@@ telelean\` markup block in a Lean comment); "These suffice" makes Claude formalise selected cards in a private copy and prove a goal; a non-LLM gate (Lean build, #print axioms footprints, lake comparator, rule checks) decides whether the result counts. The user has a formal-methods background and cares about soundness ("proved" must mean proved from exactly what is shown) and about never letting the LLM add beliefs without their approval.

Inputs (read all of them before judging):
1. The user's ORIGINAL specification: /home/zhengyew/telelean/verbatim_prompt_log/bundle_20/prompt20.md (between the lines of '=' characters; it ends with three questions, which you can ignore).
2. The PROPOSED revision, in two parts: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/draft/spec_v2.md (sections 0-11: the spec itself) and /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/draft/spec_v2_part2.md (sections 12-17: edge cases, safety issues, decisions for the user, change log, what it replaces, implementation notes).
3. Maps of the CURRENT code, written by earlier read-only agents (authoritative descriptions of today's behaviour, with file:line references), in /home/zhengyew/telelean/verbatim_prompt_log/bundle_20/subagent_reports/understand_workflow/agents/: review-ui.md, board-ui.md, run-engine.md, gate-accept.md, edit-model.md, design-rationale.md. Read the ones your lens needs; you may also read the code under /home/zhengyew/telelean/packages to check a claim.

Your job: find real problems in the PROPOSED revision through your lens, and propose concrete fixes (replacement wording where possible). Do not praise; do not restate the proposal. Each finding must name the clause ID(s) it concerns, say concretely what goes wrong (a scenario), and give a fix. Rank by severity: blocker (the proposal is wrong or unsafe as written), major (a real gap or contradiction that would cause wrong behaviour or a wrong user decision), minor (unclear, incomplete or awkward), nit. If something is genuinely fine, do not invent a finding.

HARD RULES (the user's standing safety instructions; follow exactly):
- Strictly read-only. Do not create, modify, move or delete any file anywhere. Use Read/Grep/Glob and read-only shell commands only.
- Never change git state (no add/commit/stash/checkout/restore/reset/switch/fetch/pull/push).
- Never push, publish, upload or send anything to anyone; no network access at all.
- Never run Claude, tests, builds, Lean/lake, VS Code, Chrome or Playwright (the machine has very little free RAM).
- Do not spawn subagents.`

const SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', description: 'One paragraph: overall assessment through your lens' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'e.g. F1' },
          clauses: { type: 'string', description: 'clause IDs, e.g. "RV-4, EC-6"' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] },
          kind: { type: 'string', description: 'inconsistency | gap | safety | fidelity | readability | feasibility | other' },
          problem: { type: 'string', description: 'What goes wrong, with a concrete scenario' },
          evidence: { type: 'string', description: 'Quotes / file:line from the inputs or code' },
          suggested_fix: { type: 'string', description: 'Concrete fix, ideally replacement wording' },
        },
        required: ['id', 'clauses', 'severity', 'kind', 'problem', 'suggested_fix'],
      },
    },
  },
  required: ['verdict', 'findings'],
}

const LENSES = [
  { key: 'fidelity', prompt: `LENS: FIDELITY TO THE USER'S TEXT AND INTENT.
- Go through the user's original specification sentence by sentence. For each sentence, find where the revision accounts for it. Report any sentence that was dropped, silently changed, or weakened, and any place where the revision's tag ("yours", "clarified", "changed", "new") misdescribes what happened (e.g. a substantive change tagged "clarified").
- Judge whether each change and addition is justified by a real problem, or is over-reach that the user did not ask for and would not want (the user asked to "fill in any irregular language / weird ordering or edge cases / introduce any convenient sub-concepts to make it more readable", and to raise safety issues; they did not ask for a redesign). Flag additions that add complexity without enough value.
- Check that the user's own terms are preserved where possible (Context Menu, fuzzy, shaky, FROZEN, submit review, submit transform, these suffice, Claude suggests, Formalize), and that renames are justified.
- Check readability: is the revision actually more readable than the original? Point to clauses that are too long, too dense, or use undefined terms.
- Check the change log (section 15) against the actual revision: is it complete and accurate?` },
  { key: 'logic', prompt: `LENS: LOGICAL CONSISTENCY, COMPLETENESS AND EDGE CASES.
- Build the session state machine implied by the revision (states: idle, transform window open, Claude step running, waiting for an answer / unfreeze request, review stage, end confirmation, applied, exited; and per item: in review / accepted / declined(option) / rejected-list / updated). For every (state, user action or event) pair, check the revision says what happens, and that clauses do not contradict each other. Report holes and contradictions with concrete scenarios.
- Pay special attention to interactions: RV-3 (accept = freeze; unfreeze returns to review) vs RV-4 (dependency closure) vs FZ-8 (restore at end) vs FZ-9/FZ-10/EC-1 (freezing at any time, including items in review); DO-1/DO-3 vs dependencies (EC-6); TR-15 (Claude-free transforms becoming already-accepted items) vs RV-7 (belief items need individual accept) vs ES-9/D1; mid-stage actions (RV-9) vs pending items and declined items; EN-2 keep ticks vs FROZEN 3 / EDIT SESSIONS 7; ES-1 (one session, one subject) vs multi-subject cards and vocabulary from other subjects; deadlocks (e.g. an accepted item that depends on something Claude must change; a rejected item that an accepted item needs; a frozen card whose Lean can never compile).
- Look for undefined terms or terms used before definition, and for simplifications: concepts the revision could drop or merge without loss (be concrete).` },
  { key: 'soundness', prompt: `LENS: FORMAL SOUNDNESS AND SAFETY. Try hard to break the revised specification.
- Construct concrete scenarios (Lean snippets against the Spyro example in /home/zhengyew/telelean/test-fixtures/spyro or mental_model/) in which, under the REVISED spec as written: (a) a "proved" status or the "proved from ..." list becomes untrue; (b) a belief enters the model without the user's individual Accept; (c) the meaning of frozen or held content changes; (d) Claude changes frozen content; (e) D-19's meaning-before-proof is bypassed; (f) a These suffice claim (proved from exactly the selection) is wrong; (g) an ungated state reaches the user's files. Use the gate map (gate-accept.md, especially sections 2-6) to see which rules exist today and which the revision relies on.
- Check every claim in section 13 (S1-S13) of the revision for correctness, including whether the Lean examples are right (e.g. would \`cynder_dark_past.holds.elim\` actually typecheck as a proof of anything once HasDarkPast is defined as False? is the InGame cheat described correctly?) and whether the stated mitigations actually close the hole. Say precisely what is still open.
- Check FZ-5 ("held") for completeness: what can change the meaning of a frozen statement other than its closure and instances (e.g. notation, open/namespace, coercions, simp attributes, universe levels, section variables, \`attribute [reducible]\`, auto-bound implicits, redefinition of a name in another file/namespace, import order)? Which of these are already blocked by G0 (see gate-accept.md section 2, G0) and which are not?
- Check RV-4 (dependencies) and RV-7 (belief items): is the dependency relation well-defined from Lean facts? Are there belief-bearing changes not covered by the RV-7 list (e.g. kind changes DERIVATION->ASSUMPTION, deleting a derivation's proof, changing declared premises, a changed gloss, an instance, a lemma used by a proof)?
- Check the These suffice preset (ES-2) against today's guarantees (G5 and existing-changed): is it really equivalent, field by field? What about the target's existing proof, adopted suggestions, and premises: fields?` },
  { key: 'implementability', prompt: `LENS: IMPLEMENTABILITY AGAINST THE CURRENT CODE, AND USABILITY.
- For each section of the revision, judge how it maps onto the current architecture (use the maps: run-engine.md section 5, edit-model.md sections 2-5, review-ui.md, board-ui.md). Report clauses that are infeasible, very expensive, or ill-defined for implementation, with the specific code obstacle (e.g. partial application of a proposal; stable item ids; computing dependencies between items; mechanical checks of "held" content and of "shaky not identical"; field-level freeze checks inside Lean files; transform-started runs without a target; vocabulary cards keyed by Lean name; references stored inside natural_name which G5 compares byte-for-byte). Propose simpler alternatives that keep the user's intent.
- Usability: the user will use this daily. Are the concepts learnable (Context Menu, fuzzy/open/frozen, held, belief, badges, stage report, unfreeze requests)? Is the click cost acceptable (every item must be accepted; belief items individually)? Are there UI states the revision forgets (empty selection, loading, errors, narrow windows, the review list with 100+ items)? Is the frozen look (FZ-11) distinguishable from existing visual channels (see board-ui.md section 5)?
- Judge the proposed implementation slicing in decision D5 (slices A-D): is each slice useful on its own and testable? Would a different order deliver value sooner or reduce risk? Is the cost estimate plausible?
- Point out any place the revision over-specifies implementation details that should be left open, or under-specifies something the implementer cannot decide alone.` },
]

phase('Review')
const res = await parallel(LENSES.map(l => () =>
  agent(PRE + '\n\n' + l.prompt, { label: 'review:' + l.key, phase: 'Review', schema: SCHEMA })
    .then(r => (r ? { key: l.key, ...r } : null))))
const got = res.filter(Boolean)
log(`${got.length}/${LENSES.length} reviews returned; ${got.reduce((n, r) => n + r.findings.length, 0)} findings`)
return { reviews: got, missing: LENSES.map(l => l.key).filter(k => !got.find(g => g.key === k)) }
