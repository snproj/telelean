export const meta = {
  name: 'understand-edit-system',
  description: 'Read-only map of telelean\'s current run/review/edit system against the user\'s new edit-session spec, with soundness invariants',
  phases: [{ title: 'Map', detail: '6 read-only readers, one per subsystem + design rationale' }],
}

const PREAMBLE = `You are a read-only code/documentation reader for "telelean", a personal-prototype VS Code extension in /home/zhengyew/telelean. telelean shows a user's mental model as a board of ASSUMPTION / DERIVATION / GOAL cards (three columns), backed by Lean 4 files where each card is an \`@@ telelean\` markup block in a Lean comment. "These suffice" (select premises + a goal) starts a run in which Claude (through the user's own Claude Code CLI, with telelean's MCP tools check_lean / freeze_statements / ask_user / propose_assumption / finish) formalises the selected cards in a private shadow copy and proves the goal; a non-LLM gate (Lean build, #print axioms footprints, lake comparator, rule checks) decides whether the result counts; the user then reviews a proposal and presses Accept / Feedback / Discard. Packages: packages/core (pure TS: markup, model, edit planning, gate rules, protocol), packages/runner (Node: Lean sandbox, shadow, run manager, proposals/Accept, workspace + history), packages/extension (VS Code adapter), packages/webview (React board). Design docs: docs/ and verbatim_prompt_log/bundle_1/user_requested_documents/.

The user has written a new SPECIFICATION for a redesigned edit system. It is in /home/zhengyew/telelean/verbatim_prompt_log/bundle_20/prompt20.md, between the two lines of '=' characters (it also contains three questions at the end). READ IT FIRST, in full.

Your job is to map ONE area of the CURRENT system precisely, so that the main session can (a) tidy the spec, (b) find where it conflicts with the current system or with proof-integrity (soundness) guarantees, and (c) later implement it. Be concrete: cite file paths with line numbers, quote UI strings exactly, and distinguish what the code DOES from what docs SAY. Where docs and code disagree, the code is authoritative; say so. Do not speculate silently: put anything you could not confirm in uncertainties.

HARD RULES (the user's standing safety instructions; follow exactly):
- Strictly read-only. Do not create, modify, move or delete any file anywhere (no scratch files either). Use Read/Grep/Glob and read-only shell commands (cat, sed -n, grep, wc, ls, and read-only git log/show/diff) only.
- Never change git state: no git add/commit/stash/checkout/restore/reset/switch/fetch/pull/push.
- Never push, publish, upload, or send anything to anyone; no network access at all (no curl/wget/npm/WebFetch/WebSearch).
- Never run Claude or any telelean script with --live; never run tests, builds, Lean/lake, VS Code, Chrome or Playwright (the machine has very little free RAM).
- Do not spawn subagents.
Your final answer is returned to the main session as structured data; put the detailed map in report_markdown (it can be long; completeness and precision matter more than brevity).`

const SCHEMA = {
  type: 'object',
  properties: {
    report_markdown: { type: 'string', description: 'Detailed map of the area with file:line references and exact UI strings' },
    spec_interactions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          spec_clause: { type: 'string', description: 'e.g. "REVIEW STAGE 3" or "FROZEN 2"' },
          current_behaviour: { type: 'string' },
          files: { type: 'string' },
          conflict_or_gap: { type: 'string' },
          safety_relevance: { type: 'string' },
        },
        required: ['spec_clause', 'current_behaviour', 'conflict_or_gap'],
      },
    },
    safety_invariants: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          invariant: { type: 'string' },
          enforced_where: { type: 'string' },
          how_new_spec_could_break_it: { type: 'string' },
        },
        required: ['invariant', 'enforced_where'],
      },
    },
    answers: { type: 'string', description: 'Facts answering the user questions at the end of the spec, if your area covers them; else empty string' },
    uncertainties: { type: 'array', items: { type: 'string' } },
  },
  required: ['report_markdown', 'spec_interactions', 'safety_invariants', 'answers', 'uncertainties'],
}

const AREAS = [
  { key: 'review-ui', prompt: `AREA: the run/review UI in the webview.
Read fully: packages/webview/src/run/*.tsx (Review.tsx, RunPanel.tsx, ProposalBanner.tsx, ReportCard.tsx, GhostSuggestion.tsx, Questions.tsx, RunBadge.tsx), packages/webview/src/model/run.ts, packages/webview/src/board/GhostCards.tsx, packages/webview/src/board/Board.tsx, and the run/review/proposal parts of packages/webview/src/state/store.ts; plus the ProposalView and review-related types in packages/core/src/run.ts and packages/core/src/protocol.ts as needed.
Produce:
1. The review flow step by step: which steps exist (reviewSteps), what each shows, its exact title strings ("Statement 1", "Vocabulary", "Definitions", ...), which controls each has (e.g. the "Fully explicit" toggle, definition yes/no, lifecycle ticks, presupposition endorsement "Yes, I endorse it", ghost "I hold this" / reject), and what Accept requires. Quote the explanatory UI strings exactly.
2. Exactly what the "Fully explicit" toggle does: what data it switches between (pp.explicit? notation? universes? coercions?), where that data is produced on the runner side (find the producer), and when it is useful to a user.
3. Exactly what "Claude suggests" cards are (ghost premises): where they render (board vs run panel), their lifecycle (adopt/reject), and how they differ from the review's "Statement N" steps.
4. The Current/Proposed board view: what toggles it, what the proposed view overlays (added/changed/removed cards?), and whether anything is editable in either view.
5. What Feedback / Discard / Accept do from the UI side, and what happens to a ghost/definition/statement the user declines.
6. Per-item granularity today: can the user accept/decline individual statements/vocabulary/definitions, or only the whole proposal?
Map each relevant spec clause (REVIEW STAGE 1-6, DECLINE OPTIONS, "Formalize" items, the single vocabulary item, "Claude suggests" as regular new cards) to current behaviour and gaps in spec_interactions. Answer user questions 1 and 2 in answers.` },
  { key: 'board-ui', prompt: `AREA: the board (main card graph), cards, vocabulary, selection and the tray, in the webview.
Read fully: packages/webview/src/board/*.tsx and *.ts (NodeCard, CardDetails, Column, VocabularyGroup, UsesLine, LeanCode, Board, dnd, dragGuard, geometry only as needed), packages/webview/src/tray/SelectionTray.tsx, packages/webview/src/prompt/PromptBox.tsx, packages/webview/src/header/*.tsx, packages/webview/src/dialogs/Dialogs.tsx, packages/webview/src/labels.ts, packages/webview/src/model/cardData.ts, packages/webview/src/model/format.ts, and the selection/edit parts of packages/webview/src/state/store.ts; plus packages/core/src/model.ts and packages/core/src/project/vocabulary.ts for the data the board renders. Find the CSS (grep for the class names) where needed.
Produce:
1. Every kind of thing that appears on the board: A/D/G cards, the Vocabulary group and its sub-kinds (labels.ts lists kinds such as 'definition' titled "Definitions"; list them all with exact titles and which Lean declarations fall into each), presupposition chips, ghosts, etc.
2. Precisely where (and whether) Lean definitions (def/abbrev/structure bodies; the Review's "Definitions" step) show up in the main card graph: which component, which column/group, under what condition (only when present? collapsed by default?), and how a user gets from a card to the definitions it uses ("uses:" line, hover glosses, click-to-highlight). Note any case where a definition exists in Lean but has no board representation (e.g. statement abbrevs n : Prop := S are not shown as definitions?).
3. Every field of a card (natural-language text, kind/type, stance, source, rationale, Lean statement/proof, status, declared premises / depends-on, used-by, uses:, ids): which are user-editable on the board today and how (inline edit? dialog? the A|D|G box?), and which are derived/read-only.
4. The selection model (click, ctrl-click, multi-select; what can be selected: cards, vocabulary items, ghosts, fields?), the tray, what the "These suffice" button requires, every action currently available for a selection (delete, kind change, edit, suspend, ...), and where those actions live in the UI (tray, card menu, header...). Is there any existing context-menu-like or toolbar area?
5. Existing visual conventions (the blue aura for formalised cards, status colours, ghost translucency, dashed vs solid arrows, selection highlight) with the CSS classes/variables involved, so a new FROZEN aura can avoid clashing.
Map relevant spec clauses (CONTEXT MENU, FROZEN 1/4/5, INITIATING EDIT SESSIONS 2-3, TRANSFORM 9-10, REFERENCE SYSTEM) in spec_interactions. Answer user question 3 in answers (and anything you learn about questions 1-2).` },
  { key: 'run-engine', prompt: `AREA: the run engine: how a "These suffice" run works end to end, on the runner side.
Read fully: packages/runner/src/run/manager.ts (large; read all of it in chunks), packages/runner/src/run/types.ts, prompts.ts, systemPrompt.ts, persist.ts, preflight.ts, backend.ts, index.ts, packages/runner/src/llm/toolSchemas.ts, packages/core/src/run.ts; skim packages/runner/src/shadow/ and packages/runner/src/llm/toolServer.ts, confinement.ts, fake.ts, fakeScripts.ts as needed.
Produce:
1. The run state machine: states, transitions, rounds, retries (gate loop, cap 3, revert), freeze_statements semantics, what Claude may edit before vs after the freeze, how ghosts (propose_assumption) are adopted/rejected and what that does (re-freeze, new round), what Feedback does (new round? what is kept or protected across rounds?), Discard, and how a run ends.
2. What exactly constitutes a "proposal": its parts (statements, vocabulary, definitions, presuppositions, lifecycle items such as kind changes G->D, ghosts, report card, attempts), how each part is computed, and the data types (cite core/src/run.ts).
3. Everything Claude is told (system prompt + per-run prompt): the rules about what it may or may not change (user's words, existing declarations, axioms, definitions), and which are enforced mechanically by the gate/confinement vs only requested in the prompt.
4. What, if anything, already resembles the spec's concepts: per-item accept/decline, "do not create X again" memory, regeneration of a subset, protecting user-chosen content from Claude, a second "these suffice" within one run, multi-round sessions.
5. What would need to change to support: a multi-stage edit session with per-item statuses; Claude being forbidden MECHANICALLY (not by prompt) from editing frozen cards/fields; blacklists; "shaky" regeneration with "not the exact same configuration"; and a run started from a TRANSFORM (a user-proposed card set with fuzzy vs user-filled fields, a "may add cards" checkbox and prose instructions) instead of "These suffice".
Map relevant spec clauses (EDIT SESSIONS 1-3, REVIEW STAGE 5-6, DECLINE OPTIONS, TRANSFORM 4-8, FROZEN 2) in spec_interactions.` },
  { key: 'gate-accept', prompt: `AREA: the gate (proof-integrity checks) and Accept: the soundness machinery the new spec must not weaken.
Read fully: packages/core/src/gate/*.ts (rules.ts is large; read all of it), packages/runner/src/gate/engine.ts, packages/runner/src/proposal/*.ts, packages/core/src/proposal/*.ts; and docs/project-report.md Part 3 (the Lean system, sections 3.1-3.9) for the theory, noting where the code has moved on (the Nov 10 changes are in git commit 187673d: git show 187673d -- packages/).
Produce:
1. Every gate rule (G0, G1, the G3 sub-rules, G4, G5, adoption) in one line each: what it checks, which attack it blocks, where it lives.
2. The permitted-axiom set: exact formula; which declarations count as the user's (and so are protected); what "existing declarations unchanged" compares; what "your words byte-identical" (G5) protects; what freeze_statements freezes.
3. Definitions: why "A definition can quietly carry a belief, so Accept needs your yes for each" (give a concrete Lean example of a belief smuggled through a def); how flaggedDefinitions are computed; which definitions need the yes and which are exempt; presuppositions ("X exists") and why they need endorsement; the vocabulary shape rule.
4. Accept: how the proposal is applied (rebase/merge onto the user's current files, conflicts, the exception for cards added during a run), and whether Accept can be partial (a subset of items) today.
5. SAFETY ANALYSIS of the new spec. For each spec mechanism that could interact with soundness, explain concretely whether it can make a displayed "proved" status untrue or let a belief in without the user's approval: partial acceptance (accept some review items, decline others, e.g. accept a proof but decline a definition or vocabulary item it depends on); per-card/per-field FROZEN status; user-written Lean fields in a TRANSFORM (they become frozen; could be ill-typed, or smuggle a belief through a def); "fuzzy" fields auto-filled by Claude; deleting cards that others depend on; "shaky" regeneration; a mid-stage "these suffice"; restoring frozen status at session end; letting the user edit Vocabulary and "Claude suggests" cards; Claude editing any unfrozen card (including the user's own assumptions' Lean, or their natural-language text) where today G5 and "existing declarations unchanged" forbid it. Put these in safety_invariants with how_new_spec_could_break_it filled in, and the strongest concrete failure scenarios in report_markdown.` },
  { key: 'edit-model', prompt: `AREA: the card data model, the markup, user edits, undo/history and storage (the M1 machinery): where new per-card/per-field state (FROZEN, edit-session state, blacklist, references) could live.
Read: packages/core/src/markup/ (all), packages/core/src/model.ts, packages/core/src/graph.ts, packages/core/src/actions.ts, packages/core/src/protocol.ts, packages/core/src/edit/*.ts, packages/core/src/kindChange.ts, packages/core/src/layout.ts, packages/core/src/proposal/sidecars.ts, packages/runner/src/workspace/ (all), packages/extension/src/logic/boardSession.ts, editApplier.ts, changeBatcher.ts, and skim packages/extension/src/vscode/host.ts.
Produce:
1. The \`@@ telelean\` block format: every field (natural_name, type, id, stance, source, rationale, declared premises, ...) with its meaning; how the block binds to the Lean declaration(s) below it; what a card with no Lean looks like; how vocabulary items are represented (markup or not); ids and their stability across edits/renames.
2. Every board action (core/src/actions.ts) and protocol message (core/src/protocol.ts): name, payload, what it does; how an action becomes a text edit (planAction/planKind/planDelete); how undo/redo and history snapshots work.
3. Sidecars under .telelean/ (layout, graph.json, decisions.json, attempts, ...): what each stores. Where would a persistent "frozen" flag per card/field naturally go (markup field vs sidecar), and what are the trade-offs (visible in Lean files? survives git and history revert/undo? can Claude read/edit it in the shadow, given its file tools are confined to the shadow's .lean files?).
4. Whether cards currently have individually addressable "fields" (for freezing a single field, and for a "#"-reference system like GitHub's #123 that can reference a card or one of its fields), how ids/names could serve as reference anchors, and any existing link/reference syntax in natural-language text or rationale.
5. How the extension routes board messages to runner actions (boardSession), and whether a long-lived "session" concept already exists that an EDIT SESSION could build on; how a run currently locks or coexists with user edits on the board.
Map relevant spec clauses (FROZEN 1-3, EDIT SESSIONS 7-8, TRANSFORM 2-5 and 10, REFERENCE SYSTEM, INITIATING EDIT SESSIONS 3) in spec_interactions.` },
  { key: 'design-rationale', prompt: `AREA: the design rationale and the user's prior decisions, so the spec revision doesn't silently undo something the user already decided, and so safety issues are explained with their original reasons.
Read: docs/design-amendments.md, docs/decisions-log.md, docs/user-guide.md, docs/m2-plan.md (sections 1-3 and 12), docs/m2-live-report.md, docs/DEMO.md, and verbatim_prompt_log/bundle_1/user_requested_documents/02_design_decisions.md (all decisions, especially D-3, D-4, D-6, D-11, D-13, D-16, D-17, D-18, D-19, D-20, D-33) and 03_architecture.md sections 7-8; skim verbatim_prompt_log/bundle_*/prompt*.md and response*.md for the user's own requests about editing, review and vocabulary (e.g. bundle_2, bundle_3, bundle_9, bundle_12).
Produce:
1. For each prior decision that the new spec touches (one-shot single diff at the end vs multi-stage review; statement freeze before proving; ghosts "Claude suggests" and "I hold this"; definitions yes/no; presupposition endorsement; vocabulary computed from Lean rather than markup; refine/supersede/merge/suspend; in-board Undo and history; the A|D|G box never calling Claude; kind change by drag; the gate loop with 3 retries then revert): what was decided, why, and whether the new spec keeps, changes or contradicts it.
2. The user's own stated preferences relevant to this spec, quoted exactly with file references (e.g. turn 2: "this should be stopped by not allowing the LLM to do these without approval from the user ... a non-LLM programmatic check").
3. The open theory gaps (project-report section 3.7) and whether the new spec helps, hurts or is neutral for each.
4. Terminology clashes: words the spec uses ("frozen", "freeze", "review", "transform", "definition", "statement", "vocabulary", "Claude suggests", "accept", "decline", "session", "edit") that already mean something specific in telelean's code/docs (e.g. freeze_statements already means something different), with a suggested disambiguation.
Put conflicts with prior decisions in spec_interactions; put the safety rationales in safety_invariants.` },
]

phase('Map')
const results = await parallel(AREAS.map(a => () =>
  agent(PREAMBLE + '\n\n' + a.prompt, { label: 'map:' + a.key, phase: 'Map', schema: SCHEMA })
    .then(r => (r ? { key: a.key, ...r } : null))))
const got = results.filter(Boolean)
log(`${got.length}/${AREAS.length} maps returned`)
return { maps: got, missing: AREAS.map(a => a.key).filter(k => !got.find(g => g.key === k)) }
