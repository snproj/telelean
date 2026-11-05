export const meta = {
  name: 'telelean-design-review',
  description: 'Seven independent lenses review the telelean design documents (completeness, Lean soundness, HCI, feasibility, consistency, security/policy, red-team simplification)',
  phases: [
    { title: 'Review', detail: '7 parallel reviewers, each with a distinct lens, read-only' },
  ],
}

const SCRATCH = '/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/review'
const B = '/home/zhengyew/telelean/verbatim_prompt_log/bundle_1'

const CONTEXT = `
You are reviewing a DESIGN (no code exists yet) for "telelean", a VS Code extension that maps a user's mental model as ASSUMPTION / DERIVATION / GOAL nodes backed by Lean 4 files, with an LLM (Claude via the user's subscription) that formalises and proves on request.

READ FIRST (all read-only):
- The user's original request: ${B}/prompt1.md (and their mid-turn messages: ${B}/prompt1_midturn.md)
- The three design documents under review:
  - ${B}/user_requested_documents/01_consolidated_idea.md  (Step 1: consolidation + sentence traceability S1-S55)
  - ${B}/user_requested_documents/02_design_decisions.md   (Step 2: decisions D-1..D-34; ★ = needs user's call)
  - ${B}/user_requested_documents/03_architecture.md       (Step 3: architecture, software list)
- Evidence base (8 research reports, each with findings labelled verified-locally / documented / inferred): ${B}/subagent_reports/research_workflow/agents/*.md (full JSON alongside), artifacts under ${B}/subagent_reports/research_workflow/artifacts/
- The user's own earlier hand-written mental-model sketches (style evidence): /home/zhengyew/telelean_scripts/*.lean

About the user: background in formal methods, interests in linguistics (pragmatics), cognition and HCI; works in Lean 4 daily; wants to actually USE this tool with their Claude subscription; is RAM-sensitive (the machine has crashed from memory exhaustion before).

Environment facts (verified): Linux x86_64, 64 GB RAM, Lean 4.35.0 / Lake 5.0.0 via elan (toolchains v4.30-v4.35 installed), VS Code 1.140.0 (snap) with leanprover.lean4 0.0.240 and anthropic.claude-code 2.1.314, bubblewrap 0.9.0, git 2.43, Google Chrome 155; NOT installed: node/npm, xvfb, socat. Today is 2026-11-01.

RULES:
- Do NOT modify anything under /home/zhengyew (review only). Your scratch dir for any experiments: ${SCRATCH}/<your-lens>/ . The harness forbids writing report files, so put everything in your structured output.
- If you run Lean experiments: tiny projects only, lean-toolchain pinned to exactly "leanprover/lean4:v4.35.0", NO Mathlib, never "lake new ... math". Run at most one Lean process at a time. Never read ~/.claude/.credentials.json or any secret.
- Be concrete and actionable: cite doc + section, quote the problematic text briefly, say why it is wrong/missing, and give a specific fix. Prefer fewer, high-value issues over many nits; but do not omit real problems. Use severities honestly: blocker (design cannot work / violates an explicit user requirement), major (significant risk or gap), minor, nit.
- If you verify or refute a claim against the evidence reports or by experiment, say so in "evidence".
`

const SCHEMA = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    summary: { type: 'string', description: '1-3 paragraph verdict' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] },
          doc: { type: 'string', enum: ['01', '02', '03', 'all', 'response'] },
          section: { type: 'string' },
          problem: { type: 'string' },
          evidence: { type: 'string' },
          suggested_fix: { type: 'string' },
        },
        required: ['id', 'severity', 'doc', 'section', 'problem', 'suggested_fix'],
      },
    },
    strengths: { type: 'array', items: { type: 'string' } },
    questions_for_user: { type: 'array', items: { type: 'string' }, description: 'Questions the docs SHOULD ask the user but do not' },
    sentence_audit: {
      type: 'array',
      description: 'Completeness lens only: one row per sentence S1..S55 and per mid-turn prompt M1..M4',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string', enum: ['addressed', 'weak', 'missing'] },
          where: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['id', 'status', 'where'],
      },
    },
    alternative: {
      type: 'object',
      description: 'Red-team lens only',
      properties: {
        name: { type: 'string' },
        summary: { type: 'string' },
        keeps: { type: 'string' },
        drops: { type: 'string' },
        risks: { type: 'string' },
        when_to_prefer: { type: 'string' },
      },
    },
  },
  required: ['lens', 'summary', 'issues'],
}

const LENSES = [
  {
    key: 'completeness',
    prompt: `LENS: COMPLETENESS / TRACEABILITY CRITIC.
The user demanded: "consolidate points from the idea while keeping track that every sentence is still accounted for", then "raise unspoken constraints ... if it involves a significant design decision", then "sketch out a software architecture ... give me a list of software that you would want to install", plus logging requirements.
1. Walk EVERY sentence S1..S55 of prompt1.md (use the numbering in 01_consolidated_idea.md Appendix A, but re-check it against prompt1.md yourself) and decide whether the DESIGN (docs 01-03 together) actually ADDRESSES it with a concrete design element or decision - not merely maps an ID to it. Mark addressed / weak / missing with where (doc §) and a note. Pay special attention to: click-and-drag; arrows "from any node in one section to a node in another section"; moving nodes between sections incl. "derivation made into an assumption"; "The options I select should be shown in a separate section below"; "generate signatures for the assumptions and goals"; diff "overlayed graphically on the nodes" AND switchable to Lean file diffs; "several more nodes to be created"; "accept this, or else provide some feedback"; "represent nodes ... programatically"; "click on the node and expand it to see the Lean definition"; blue aura; "let me know if an LSP is the right design decision"; learnharness inspiration; "Test the basic functionality ... giving me directions as to how to do so" (are usage directions planned?); logging.
2. Also audit the 4 mid-turn prompts (M1 RAM, M2 save subagent reports, M3/M4 everything in bundle_1) - are they honoured in the design/process?
3. Check Step 2: are there unspoken constraints of significant design impact that the docs MISS entirely? (Think broadly: undo/versioning of the model, multiple subjects per workspace, deleting nodes, renaming ids, what happens when the user edits Lean by hand so a node's Lean no longer matches its NL, offline use, performance of first build, i18n of natural language, etc.)
4. Check Step 3 deliverable: is the software list complete and actionable (versions, commands, what needs sudo)?`,
  },
  {
    key: 'lean-soundness',
    prompt: `LENS: FORMAL METHODS / LEAN SOUNDNESS REVIEWER.
Scrutinise the logical design: D-1 (assumptions as global axioms + generated Ramsey-sentence models), D-2 (sorry for formalised-unproved), D-3/D-4 (vocabulary classification, definitional smuggling, endorsement), D-5 (strict selection via lake comparator permitted_axioms), D-6/D-7 (insufficiency/inconsistency), status lattice (03 §2/§5), the gate G0-G6 (03 §8.5), and the Lean conventions table (03 §4).
Hunt for soundness holes an adversarial LLM could exploit that the gate would NOT catch, e.g.: instances (instance declarations as hidden assumptions, e.g. an instance providing Decidable/Inhabited/Subsingleton for an uninterpreted type), vocabulary axioms whose types smuggle propositions (functions returning Prop-carrying structures, Subtype, Sigma, Exists in Type via Nonempty, structures with Prop fields), universe-polymorphic axioms, 'opaque' with implemented_by, 'partial def', 'decreasing_by sorry', macros generated in imported files, 'open ... in' tricks, notation in vocabulary files written BEFORE the freeze, redefinition across namespaces/shadowing (a theorem named like a user node in another namespace), 'set_option maxRecDepth'/'maxHeartbeats' DoS, 'attribute [simp]' changes, Classical vs constructive expectations, and whether the comparator's 'permitted_axioms by type' plus 'statement closure' really pins the meaning of the GOAL when vocabulary is axioms (does the frozen export include the vocabulary axioms' types? what if the agent adds a NEW vocabulary axiom during phase B that is a Prop in disguise?). Also check: is "existence commitment" handling right (axiom c : T asserts T nonempty), does D-2's sorry interplay with comparator (challenge has sorry; solution must not) work, are claims attributed as 'verified' actually verified in the evidence reports?
You MAY run small Lean 4.35 experiments (rules in CONTEXT) to confirm or refute specific holes; report exact outputs.`,
  },
  {
    key: 'hci-pragmatics',
    prompt: `LENS: HCI / COGNITION / LINGUISTIC-PRAGMATICS REVIEWER.
The user has interests in linguistics (pragmatics: unspoken context), cognition and HCI, and wants to "first see natural language, and only dive into Lean code when necessary", working "mostly in the extension window".
Review the interaction design (02 §C, 03 §7, 03 §8.3-8.4): the three-column board + vocabulary group, gestures (click selects, chevron expands, drag reorders vs reclassifies vs port-drag draws arrows), selection tray + "These suffice" button, prompt box with Assumption|Derivation|Goal|Instruct switch and the rationale field, the agent thread (question cards, statement sign-off, report card), proposal overlay conventions, edge stubs/badges, status glyphs/aura, accessibility, and the clarifying-question policy (D-19: what to ask, budgets, DECISION records).
Questions to answer: Is the cognitive load reasonable for daily use? Are gestures conflicting or undiscoverable? Is the two-phase sign-off (D-18) likely to cause sign-off fatigue or feel like friction vs the user's spec (single diff at the end)? Does the pragmatics treatment match linguistic notions the user would recognise (implicature, presupposition, genericity, enthymemes, common ground) and is anything important missing (e.g. vagueness/gradable predicates, context dependence, scalar implicature, defeasibility, speaker commitment vs belief)? Does the design preserve the user's own words and agency (verbatim natural_name, own rationale)? How do the user's own sketches in /home/zhengyew/telelean_scripts (cynder.lean: 'self_evident ?- no', 'from [h1, h2] ?- no', 'h1 is actually ...'; smoking.lean) map onto the design - does the design support their workflow of iteratively refining NL hypotheses into structured representations ("h1 is actually ... superseding h1")? Suggest concrete UI/protocol changes.`,
  },
  {
    key: 'feasibility',
    prompt: `LENS: ENGINEERING FEASIBILITY & SCOPE REVIEWER (senior VS Code extension + Lean tooling engineer).
Assess whether v1 (03 §11 roadmap, §6-§10) is buildable and what is likely to break. Specifically examine:
- Loading the ESM-only, proprietary @anthropic-ai/claude-agent-sdk 0.3.316 from a CommonJS esbuild-bundled VS Code extension via dynamic import(); its import.meta.url binary resolution when kept external; vsce packaging with --no-dependencies (how does the SDK + its 330 MB optional native binary get into the installed extension? If node_modules are excluded, the dynamic import fails!). Propose a concrete, working packaging approach (e.g. run from the repo via F5 / install from folder / bundle the SDK but pass pathToClaudeCodeExecutable / copy the platform package).
- bwrap sandbox details: --tmpfs $HOME then binding the shadow under the extension's globalStorage (which lives under $HOME, e.g. ~/.config/Code/User/globalStorage or a snap path); elan/lake needing ~/.elan writable? (toolchain lookups, known-projects file writes - R2 saw elan append to ~/.elan/known-projects); lake needing lake-manifest.json; 'systemd-run --user --scope' availability from the VS Code snap; reflink on this filesystem (ext4? -> full copy).
- lake comparator / leanexport / leanchecker workflow realism (timings, exit codes, requires lake-manifest.json), and the per-toolchain compiled extractor (231 MB binary; build on first use).
- Webview stack (React 19, Vite 8 rolldown, pragmatic-drag-and-drop, Shiki JS engine) under the nonce CSP; message protocol; WebviewPanelSerializer.
- Testing plan realism (ELECTRON_RUN_AS_NODE gotcha, display requirement without xvfb, Playwright channel 'chrome', fake backend).
- Is v1 scope too big for a first usable version? Propose a staged plan with a smaller "walking skeleton" milestone that the user can start using earliest, and which items to defer (e.g. comparator freeze, sign-off view, Lean-editor providers, CLI). Identify the critical path and the riskiest unknowns to spike first.
You may inspect the research artifacts and local files read-only; no installs.`,
  },
  {
    key: 'consistency',
    prompt: `LENS: CONSISTENCY & FACT-CHECK REVIEWER.
1. Find internal contradictions between docs 01, 02 and 03 (field names, kinds, decisions vs architecture, numbers, versions, file paths, which items are v1 vs later, what the agent may do, sandbox/permission settings, model/effort defaults, timings).
2. Fact-check every claim marked or implied as "verified" in docs 02/03 against the evidence reports in subagent_reports/research_workflow/agents/*.md. Flag any claim that is overstated, misattributed, contradicted by a report, or where the reports disagree with each other (e.g. R1 recommended AskUserQuestion via canUseTool with permissionMode 'default' while R5 recommended a custom ask_user with 'dontAsk'; R2 recommended abbrev+holds while R4/R5 recommended sorry; R4 put vocabulary in the Assumptions column while R7 suggested a strip/drawer; R6 suggested pinning SDK 0.3.314 to match the installed CLI while R1 suggested 0.3.316 with its own binary). For each disagreement, check the docs pick a side explicitly and justify it.
3. Check version numbers and commands in 03 §12 against the reports (Node 24.22.2 + checksum, TypeScript 6.0.3, @types/vscode 1.140.0, vite 8.3.5, etc.).
4. Check that quoted policy text in 02 D-23 matches what the reports quote (and that the docs don't overclaim legal certainty).
5. Check the docs' statement that the walkthrough's three assumptions do not entail the goal is supported by evidence (R5 Ramsey/independence certificate).`,
  },
  {
    key: 'security-policy',
    prompt: `LENS: SECURITY, PRIVACY & POLICY REVIEWER.
Threat-model the design (03 §8, 02 D-23..D-27): the LLM agent and the Lean code it writes are untrusted; the user's machine holds secrets (~/.claude credentials, SSH keys, browser profiles) and other projects.
Check: (a) agent tool surface (Read/Glob/Grep/Edit/Write path-guarded by a PreToolUse hook; dontAsk; no Bash/web) - can the agent read outside the shadow via symlinks inside the shadow (.lake/packages is a symlink to the real workspace!), via Glob/Grep patterns, via '..' or absolute paths, via MCP tool inputs (check_lean files param), via Edit on a symlink target? Does the PreToolUse hook see resolved paths? (b) the bwrap profile (--ro-bind / / exposes the whole filesystem read-only except $HOME which is tmpfs: what sensitive data outside $HOME is readable, e.g. /etc, other mounts, /run/user sockets, the D-Bus session bus, X11/Wayland sockets via /tmp being tmpfs? --unshare-all includes network?) (c) the REAL workspace build (03 §5 says lake build of accepted code runs unsandboxed with normal trust - but accepted code was written by the LLM; G0 lint is the only barrier; is that enough? what about the user's Lean server elaborating files on open, and the proposal virtual docs?) (d) prompt injection: workspace text/LLM output rendered in the webview (CSP), Lean files containing instructions to the agent, markup text injected into prompts; (e) credentials/env: stripping API keys, CLAUDE_CONFIG_DIR, verbatimPrompts; (f) privacy: what leaves the machine; session transcripts stored under ~/.claude/projects per shadow cwd; (g) policy: is the stated reading of Anthropic's subscription policy accurate and appropriately hedged; branding rules ("Claude Code" not in product name); SDK proprietary licence implications for a personal tool kept in a local repo.
Give concrete fixes (e.g. realpath checks, no symlinks in shadow / bind packages read-only inside sandbox only, sandbox the real-workspace build too, deny reading dotfiles, etc.).`,
  },
  {
    key: 'red-team-simplify',
    prompt: `LENS: RED-TEAM ARCHITECT & USER ADVOCATE.
Your job: argue the strongest case that this design is over-engineered or overrides the user's explicit wishes, and propose a materially SIMPLER alternative architecture that still satisfies every sentence of prompt1.md and lets the user start using the tool much sooner.
1. Identify recommendations that depart from what the user literally asked (e.g. renaming 'type:' to 'kind:', NL text in the block instead of the docstring the user suggested, adding a 4th DEFINITION kind and DECISION kind to a 3-column design, a two-phase run with a sign-off checkpoint instead of one diff at the end, an 'Instruct' 4th switch position, strict selection semantics, bwrap sandbox/comparator/leanchecker gate) and judge for each whether the departure is justified, should be offered as an option, or should be dropped/deferred. Be fair: keep things that protect soundness the user would obviously care about as a formal-methods person.
2. Identify complexity that could be deferred without harming the core experience in v1 (e.g. Lean-editor providers, CLI, extractor exe vs simple #print axioms parsing, comparator freeze, DECISION records, multi-root, layout sidecar, edge-budget engine).
3. Fill the 'alternative' field with a concrete simpler architecture (what it keeps, drops, its risks, and when the user should prefer it), and list issues where the main design should change.
Also consider: would driving the 'claude' CLI in headless stream-json mode (like learnharness) be simpler than the Agent SDK given the packaging/ESM issues? Is React+custom SVG engine the simplest viable UI?`,
  },
]

phase('Review')
log('Launching 7 reviewers in parallel')
const results = await parallel(LENSES.map(l => () =>
  agent(CONTEXT + '\n' + l.prompt, { label: 'review:' + l.key, phase: 'Review', schema: SCHEMA })
))
const out = LENSES.map((l, i) => ({ key: l.key, result: results[i] }))
const missing = out.filter(o => !o.result).map(o => o.key)
if (missing.length) log('WARNING: no result from ' + missing.join(', '))
const counts = {}
for (const o of out) for (const iss of (o.result?.issues || [])) counts[iss.severity] = (counts[iss.severity] || 0) + 1
log('Issue counts: ' + JSON.stringify(counts))
return out
