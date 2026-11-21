export const meta = {
  name: 'spec-v4-review',
  description: 'Three read-only reviewers check telelean spec v4 (fidelity/consistency, soundness, implementability + slice-1 map)',
  phases: [{ title: 'Review', detail: 'fidelity+consistency, soundness, implementability (parallel, read-only)' }],
}

const SAFETY = `SAFETY RULES (from the user; mandatory):
- You are READ-ONLY. Do not write, create, edit, move or delete any file anywhere.
- No git commands that change state (no add/commit/stash/checkout/reset/branch/push/fetch/pull). Read-only git (log/show/diff/status) is fine.
- No network access, no installs, no downloads. Never send or publish anything to anyone.
- Never run Claude, a telelean run, builds, tests, Lean or lake: RAM on this machine is very tight (about 2 GB free).
- Use only reading tools and read-only shell commands (cat, sed -n, grep, find, wc, ls).`

const ROOT = '/home/zhengyew/telelean'
const SPEC = ROOT + '/verbatim_prompt_log/bundle_21/user_requested_documents/01_spec_v4.md'
const V31 = ROOT + '/verbatim_prompt_log/bundle_20/user_requested_documents/01_edit_sessions_spec_proposal.md'
const P21 = ROOT + '/verbatim_prompt_log/bundle_21/prompt21.md'
const MID = ROOT + '/verbatim_prompt_log/bundle_21/prompt21_midturn.md'
const MAPS = ROOT + '/verbatim_prompt_log/bundle_20/subagent_reports/understand_workflow/agents'

const FINDING = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] },
    clauses: { type: 'string', description: 'clause IDs or section names affected' },
    problem: { type: 'string' },
    evidence: { type: 'string', description: 'quotes from the spec, the user text, or code file:line' },
    fix: { type: 'string', description: 'the minimal concrete change to the spec' },
  },
  required: ['id', 'severity', 'clauses', 'problem', 'fix'],
}
const FINDINGS_SCHEMA = {
  type: 'object',
  properties: { summary: { type: 'string' }, findings: { type: 'array', items: FINDING } },
  required: ['summary', 'findings'],
}
const IMPL_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    findings: { type: 'array', items: FINDING },
    slice1_map: {
      type: 'object',
      properties: {
        areas: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              area: { type: 'string' },
              files: { type: 'array', items: { type: 'string' } },
              reuse: { type: 'string' },
              changes: { type: 'string' },
              risks: { type: 'string' },
            },
            required: ['area', 'files', 'changes'],
          },
        },
        tests_affected: { type: 'array', items: { type: 'string' } },
        size_estimate: { type: 'string' },
        open_questions: { type: 'array', items: { type: 'string' } },
      },
      required: ['areas', 'tests_affected', 'size_estimate'],
    },
  },
  required: ['summary', 'findings', 'slice1_map'],
}

const CONTEXT = `Context: telelean is a VS Code extension (TypeScript monorepo at ${ROOT}: packages/core, runner, extension, webview) that shows a user's beliefs as cards backed by Lean 4 files with "@@ telelean" markup blocks. Claude (through the user's Claude Code CLI) formalises and proves; a non-LLM gate (build, #print axioms footprints, rule checks, lake comparator) decides what counts. The user is a formal-methods person building a personal-use prototype.
The document under review is the revised specification v4: ${SPEC}. It extends v3.1 (${V31}) with the user's turn-21 board changes (${P21}) and the user's answers to decisions D1-D6 (${MID}, message 1; message 2 puts the assistant on autopilot and delegates remaining decisions). Code maps of the current system from the previous round are in ${MAPS} (board-ui.md, edit-model.md, gate-accept.md, run-engine.md, review-ui.md, design-rationale.md); the code is authoritative where they differ.
Report only real problems, each with a concrete minimal fix to the spec text. Severity: blocker = the spec as written would be unsound or unbuildable; major = a real gap or contradiction a builder or the user would hit; minor = unclear or inconsistent wording; nit = cosmetic.`

phase('Review')
const reviews = await parallel([
  () => agent(`${SAFETY}

${CONTEXT}

YOUR LENS: FIDELITY AND CONSISTENCY.
1. Read the user's turn-21 text and both mid-turn messages in full, then v4 in full. Check that every requirement and answer is captured faithfully by some clause. Where v4 departs from the user's words, it must be tagged (changed/clarified) and explained in Part 4. Quote the user's words in evidence.
2. Check v4 for internal contradictions, especially between new (v4) clauses and unchanged v3.1 clauses that may still assume old concepts: ASSUMPTION/DERIVATION/GOAL, "These suffice", premises ⊢ target, "Self-evident?", "make it a Derivation", the tray, the A|D|G box, "claimed", one target per run, "never from another target".
3. Check cross-references, tags and the terminology (axiom card vs Lean axiom, pending, established, question, band, Dependencies) for consistent use.
4. Flag clauses a builder could not implement unambiguously.
Do not re-litigate decisions the user made; do flag where v4 misstates them.`, { label: 'review:fidelity-consistency', phase: 'Review', schema: FINDINGS_SCHEMA }),

  () => agent(`${SAFETY}

${CONTEXT}

YOUR LENS: SOUNDNESS (adversarial). Attack v4's new design: arrows and the Dependencies field, Formalize for dependencies (questions, several targets proved sources-first, the preset, the "Open the whole model" switch, "Claude may add cards"), bands (BD-7), glows and "established" (BD-6), pending claims (AR-6/7), kinds by position (CF-4), "follows from nothing" (AR-5), arrow review items and DO-0, the Add premise item (RV-1), RV-5/RV-6/RV-7, the Apply backstop and Appendix B.1-B.7, and Part 3's S14-S21.
Find any concrete way that:
(a) something becomes assumed (an axiom, a pending claim, a definition or presupposition carrying content, an instance) without the user's individual Accept;
(b) the board shows a green band or green glow that misrepresents what Lean checked (including through pending claims, conditional proofs, sorry, hidden axioms, definitions, presuppositions, stale facts after hand edits);
(c) a proof is certified against a question different from the one the user asked, without an own-Accept item saying so;
(d) frozen or held content changes, or the preset can be escaped;
(e) a cycle, or a hidden edge (a card the proof uses directly with no arrow), survives into an applied state;
(f) the user's results are revealed before the meaning check (D-19) through the new visuals.
Ground claims about today's behaviour in the code: packages/core/src/gate/permitted.ts, gate/rules.ts, project/build.ts, project/edges.ts, kindChange.ts, edit/planKind.ts, edit/planAction.ts; packages/runner/src/run/manager.ts, runner/src/gate/engine.ts. For each problem: a concrete scenario, the clauses, and a minimal fix. Check whether S14-S21 are correct and sufficient. Do not re-report problems the spec already fixes unless its fix is wrong. If you would check a Lean fact, describe the check instead of running it.`, { label: 'review:soundness', phase: 'Review', schema: FINDINGS_SCHEMA }),

  () => agent(`${SAFETY}

${CONTEXT}

YOUR LENS: IMPLEMENTABILITY, plus a map for building SLICE 1. Slice 1 (Part 2, D8 (a)) is: the new board — the AXIOMS column plus the PROPOSITIONS canvas (mouse-wheel zoom about the cursor, Ctrl+wheel pinch zoom, right-button drag to pan, a right click without movement opens a context menu, keyboard pan/zoom, Fit all, placement of cards without positions, positions stored in the layout file), the Vocabulary and Definitions columns above, arrows drawn by the user (drag from a handle; cycle refusal; delete), dragging a proposition into the AXIOMS column (becomes an axiom), an arrow into an axiom making it a pending proposition, "follows from nothing" marks, glows (blue formalised, green established) and green bands computed from directUses, the A|P box, kinds AXIOM/PROPOSITION with ASSUMPTION/DERIVATION/GOAL read as aliases — and Formalize for dependencies running on TODAY's run/review machinery (all-or-nothing Accept; Claude adds no arrows itself in slice 1, it proposes missing premises as today's ghosts), with several targets per run proved sources first, a per-target question (the selected arrows), the permitted set built from the arrow sources, the new no-hidden-edges check (B.2) and acyclicity (B.3), and the AR-8 dialog (D7 (b)).
Read the code that slice 1 touches: packages/webview/src (App.tsx, board/*, state/store.ts, tray/*, prompt/*, model/*, styles/board.css, header/*), packages/core/src (model.ts, graph.ts, markup/*, project/build.ts, project/edges.ts, actions.ts, protocol.ts, edit/planAction.ts, edit/planKind.ts, kindChange.ts, gate/permitted.ts, gate/rules.ts, run.ts), packages/runner/src (run/manager.ts, run/preflight.ts, run/prompts.ts, gate/engine.ts, workspace/*), packages/extension/src (logic/boardSession.ts), and the tests (packages/*/test). For each area give: the files and functions to change, what already exists to reuse, concrete changes, and risks (VS Code webview specifics, Linux contextmenu timing, the EdgeEngine built for three scrolling columns, protocol messages and their hand-written validation, markup parser/serializer and G5 byte-identity, layout.json format, one-target assumptions in the run engine and gate, tests and fixtures that hard-code A/D/G or three columns). Also report anything in v4 that is unbuildable or underspecified for slice 1, as findings with fixes. Estimate slice 1's size (files touched, rough lines of code) and list open questions.`, { label: 'review:implementability', phase: 'Review', schema: IMPL_SCHEMA }),
])

return { reviews }
