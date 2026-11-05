export const meta = {
  name: 'telelean-research',
  description: 'Parallel research on the 7 technical pillars of the telelean VS Code extension + sentence-level requirements traceability',
  phases: [
    { title: 'Research', detail: '7 focused researchers (Claude/SDK, Lean semantics, UI/graph lib, markup+LSP, agent protocol, VS Code toolchain, prior art) + 1 requirements tracer' },
  ],
}

const SCRATCH = '/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/research'

const CONTEXT = `
PROJECT CONTEXT (read carefully):
- The user's full specification is at /home/zhengyew/telelean/verbatim_prompt_log/bundle_1/prompt1.md — READ IT FULLY before doing anything else.
- One-paragraph summary: a VS Code extension ("telelean") that lets a user build an interactive map of their mental model of a subject. Nodes are ASSUMPTIONs (user-supplied axioms, each annotated with WHY the user believes it), DERIVATIONs (must follow PURELY from assumptions, never needing new assumptions), and GOALs (things the user wants to prove but hasn't yet). The panel has three side-by-side vertical sections (assumptions | derivations | goals), each independently scrollable (there may be very many nodes), with arrows between nodes across sections, click-and-drag, and nodes movable between sections (promote/demote). Every node corresponds to something in a .lean file in the workspace, marked up with an "@@ telelean" block inside a Lean comment (e.g. natural_name, type); a node may exist as a comment with NO Lean code yet (the user explicitly does not want "sorry" for that). Natural language first; click a node to expand and see Lean code; nodes that have a Lean representation get a visual mark (e.g. blue aura). A text box with a UI switch tags prompts as ASSUMPTION/DERIVATION/GOAL. The user selects nodes (shown in a separate "selection" section below) and presses a button meaning "I assert these assumptions suffice to prove this goal"; an LLM then formalizes them in Lean intuitively, generates signatures, proves the goal, asks clarifying questions along the way (pragmatics in the linguistic sense: level of detail, unspoken context), and finally proposes a diff that is overlaid graphically on the nodes (with a switch to view the raw Lean file diffs); the diff may add new support nodes (e.g. a structure Cynder, a Prop isCharacter); the user accepts or gives feedback. The LLM slot must at least support Claude via the user's existing Claude subscription. The user asks whether an LSP is the right design for the markup language (the project/markup may grow; separate graph-analysis scripts may be written).
- Verified environment facts: Linux x86_64 (Ubuntu, Python 3.12.3, kernel 6.17 oem), 14 cores, 62 GB RAM. Lean 4.35.0 via elan 4.2.3 (installed toolchains v4.30.0 … v4.35.0; elan default = "stable"); lake 5.0.0. VS Code 1.140.0 installed as a snap (classic). VS Code extensions present: leanprover.lean4 0.0.240 (at ~/.vscode/extensions/leanprover.lean4-0.0.240), anthropic.claude-code 2.1.314 which bundles a native CLI at ~/.vscode/extensions/anthropic.claude-code-2.1.314-linux-x64/resources/native-binary/claude ("--version" prints "2.1.314 (Claude Code)"). The user is logged into Claude Code with a subscription (a credentials file exists — NEVER read, print, or copy ~/.claude/.credentials.json or any secret). NOT installed: node, npm, npx, pnpm, yarn, bun, docker, pip3, and no "claude" on PATH. git 2.43 is installed.
- Today is 2026-11-01. Your training data may be stale: verify versions/APIs against live sources (npm registry JSON at https://registry.npmjs.org/<pkg>, GitHub, official docs) and cite URLs.

RULES:
- Do NOT create or modify files anywhere except inside your own scratch directory (given below). In particular never touch /home/zhengyew/telelean. Do not install software system-wide or user-wide (no apt, no npm -g, no pip install, no elan toolchain installs, no VS Code extension installs).
- You MAY download package tarballs (e.g. from registry.npmjs.org) or clone repos into a fresh, empty subdirectory of your scratch dir in order to READ type definitions/docs/source. Never execute downloaded code.
- For Lean experiments: create projects only inside your scratch dir and pin lean-toolchain to exactly "leanprover/lean4:v4.35.0" (already installed) so elan never downloads anything. No Mathlib.
- Label every finding as one of: verified-locally / documented (give URL) / inferred / uncertain.
- Be concrete: exact API names, option names, versions, file paths, command lines.
- Besides your structured output, write a DETAILED markdown report (everything you learned, with code snippets and URLs) to the report path given below — later design agents will read it, so make it self-contained.
`

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    topic: { type: 'string' },
    summary: { type: 'string', description: '2-4 paragraph executive summary' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          evidence: { type: 'string' },
          source: { type: 'string' },
          confidence: { type: 'string', enum: ['verified-locally', 'documented', 'inferred', 'uncertain'] },
        },
        required: ['claim', 'evidence', 'confidence'],
      },
    },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          decision: { type: 'string' },
          recommendation: { type: 'string' },
          rationale: { type: 'string' },
          alternatives: { type: 'string' },
        },
        required: ['decision', 'recommendation', 'rationale'],
      },
    },
    design_decisions_for_user: {
      type: 'array',
      description: 'Significant decisions the USER should weigh in on (not ones with an obvious default)',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          why_it_matters: { type: 'string' },
          options: { type: 'string' },
          recommended: { type: 'string' },
        },
        required: ['question', 'why_it_matters', 'recommended'],
      },
    },
    software_needed: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          version: { type: 'string' },
          purpose: { type: 'string' },
          install_method: { type: 'string' },
          required: { type: 'boolean' },
        },
        required: ['name', 'purpose'],
      },
    },
    risks: { type: 'array', items: { type: 'string' } },
    open_questions: { type: 'array', items: { type: 'string' } },
    report_path: { type: 'string' },
  },
  required: ['topic', 'summary', 'findings', 'recommendations', 'risks', 'report_path'],
}

const TRACE_SCHEMA = {
  type: 'object',
  properties: {
    sentences: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'S1, S2, ... in document order' },
          section: { type: 'string', enum: ['Idea', 'Implementation'] },
          text: { type: 'string', description: 'verbatim sentence (or verbatim code block)' },
          maps_to: { type: 'array', items: { type: 'string' }, description: 'requirement / constraint ids, or ["CONTEXT"]' },
          note: { type: 'string' },
        },
        required: ['id', 'section', 'text', 'maps_to'],
      },
    },
    requirements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'e.g. SEM-1, DATA-3, UI-7, LLM-2, LEAN-1, PROC-1, NFR-1' },
          group: { type: 'string', enum: ['semantics', 'data-representation', 'ui-interaction', 'llm-harness', 'lean-verification', 'process-meta', 'non-functional'] },
          statement: { type: 'string' },
          source_sentences: { type: 'array', items: { type: 'string' } },
          strength: { type: 'string', enum: ['must', 'should', 'could', 'question-to-answer'] },
          ambiguity: { type: 'string' },
        },
        required: ['id', 'group', 'statement', 'source_sentences', 'strength'],
      },
    },
    implied_constraints: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'IC-1, IC-2, ...' },
          constraint: { type: 'string' },
          derived_from: { type: 'array', items: { type: 'string' } },
          significance: { type: 'string', enum: ['high', 'medium', 'low'] },
          why: { type: 'string' },
        },
        required: ['id', 'constraint', 'derived_from', 'significance', 'why'],
      },
    },
    tensions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          sentences: { type: 'array', items: { type: 'string' } },
          suggested_resolution: { type: 'string' },
        },
        required: ['description', 'sentences'],
      },
    },
  },
  required: ['sentences', 'requirements', 'implied_constraints', 'tensions'],
}

const TOPICS = [
  {
    key: 'r1-claude-slot',
    agentType: 'claude-code-guide',
    prompt: `TOPIC R1: Slotting an LLM into the extension — above all Claude via the user's existing Claude subscription — from inside a VS Code extension host (Node/Electron).
Answer precisely, with sources:
1. Claude Agent SDK for TypeScript ("@anthropic-ai/claude-agent-sdk"): current version (https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk), whether it bundles a Claude Code CLI (cli.js) or a native binary or requires an external one, required Node version, ESM vs CJS packaging (matters for bundling into a VS Code extension with esbuild), license. Download the tarball into your scratch dir and READ its type definitions (sdk.d.ts or similar) to get EXACT names for: query() options (cwd, model, systemPrompt incl. preset/append form, allowedTools, disallowedTools, permissionMode, canUseTool, hooks, mcpServers, settingSources, pathToClaudeCodeExecutable, executable, env, abortController, includePartialMessages, resume, continue, forkSession, maxTurns, additionalDirectories, thinking/effort options, sandbox options), SDKMessage variants, createSdkMcpServer + tool() signatures, Query object methods (interrupt, streamInput, setPermissionMode, setModel, ...), any file-checkpointing / rewind API, and how the built-in AskUserQuestion tool is surfaced to SDK hosts.
2. Authentication: with no ANTHROPIC_API_KEY set, does the SDK (via the CLI it spawns) use the logged-in Claude Code subscription credentials? Can pathToClaudeCodeExecutable point at the native binary inside the Claude Code VS Code extension (path in context) and is version skew between SDK and that binary a problem? Which env vars matter (ANTHROPIC_API_KEY precedence, CLAUDE_CODE_OAUTH_TOKEN, CLAUDE_CONFIG_DIR, "claude setup-token")?
3. Policy: find Anthropic's CURRENT official statements about using claude.ai subscription (Pro/Max) login / rate limits with the Agent SDK or in third-party tools (e.g. the Agent SDK overview note about third-party developers and claude.ai login; consumer terms). Quote verbatim with URLs. Distinguish (a) a personal tool the user builds and runs for themself with their own subscription vs (b) distributing the extension to others. What is the compliant route for (a)? (e.g. driving the official claude CLI in headless mode: claude -p --output-format stream-json --input-format stream-json).
4. Mid-run clarifying questions (the LLM must ask things like "do you want to model characters?"): compare (i) a custom in-process MCP tool ask_user whose handler awaits a Promise resolved by the webview UI — any tool timeout limits (e.g. MCP_TOOL_TIMEOUT) for long human waits?; (ii) the built-in AskUserQuestion tool intercepted via canUseTool — supported in the SDK? how are answers returned?; (iii) ending the turn and resuming the session with the answer. Recommend one.
5. Containment: restricting the agent to a shadow copy of the workspace (cwd, additionalDirectories, permission rules, disallowing Bash or allowing only e.g. "lake build"/"lake env lean"), intercepting writes via PreToolUse hooks, and preventing it from loading the user's global CLAUDE.md / settings / plugins (settingSources).
6. Alternatives for the provider "slot": (a) headless claude CLI stream-json without the SDK, (b) Anthropic API key via "@anthropic-ai/sdk" (tool runner), (c) VS Code Language Model API (vscode.lm.selectChatModels, vscode.lm tools API) — which models appear there, can Claude be used there, (d) OpenAI-compatible / local endpoints. Propose a provider-neutral TypeScript interface (e.g. LlmBackend with session start, streamed events, tool callbacks, ask-user callback, cancel, usage) and note which capabilities differ per provider (built-in file tools / agent loop vs plain chat-with-tools).
7. Note the default model the extension should request when using Claude (the current flagship is claude-opus-5-5; via Claude Code aliases like "opus"), and how to select model/effort through the SDK.
Your scratch dir: ${SCRATCH}/r1-claude-slot/ ; report path: ${SCRATCH}/r1-claude-slot/REPORT.md`,
  },
  {
    key: 'r2-lean-semantics',
    prompt: `TOPIC R2: Lean 4 semantics and machine-checking for ASSUMPTION / DERIVATION / GOAL nodes. You have Lean 4.35.0 locally — RUN EXPERIMENTS (in your scratch dir, toolchain pinned to leanprover/lean4:v4.35.0, no Mathlib) and report exact outputs and timings.
Investigate and recommend:
1. Encodings for ASSUMPTIONs: (i) global "axiom" declarations; (ii) hypotheses bundled in a structure/class (e.g. "class World where ..." or "structure Assumptions : Prop where ...") with derivations stated as theorems parameterised by it; (iii) section "variable"s — verify on 4.35 whether variables used only in a proof body are included (recent Lean 4 only includes variables mentioned in the statement or via "include"); (iv) "opaque" constants for uninterpreted vocabulary. Compare on: soundness (inconsistent axioms ⇒ everything provable — how could the tool detect or guard against it? With the structure approach, consistency = constructing an instance, i.e. a model), per-assumption dependency tracking (with axioms, "#print axioms thm" and Lean.collectAxioms give EXACTLY which assumptions a derivation uses — test this and show output, including how the standard axioms propext / Classical.choice / Quot.sound and sorryAx appear), ergonomics for an LLM, readability for the user, and how well each supports moving a node between kinds (assumption→derivation needs a proof; derivation→assumption drops the proof and turns it into an axiom; goal→derivation once proven; assumption→goal).
2. Encodings for GOALs and unproved DERIVATIONs whose STATEMENT is formalized but has no proof yet (without sorry): e.g. "def goal_x : Prop := ..." then "theorem goal_x_holds : goal_x := ...", vs "theorem ... := sorry". Define a clean node status lattice: natural-language-only (comment) → statement formalized → proved (no sorry, axioms ⊆ declared assumptions + standard axioms). Show how each state is detected mechanically.
3. Vocabulary / support declarations (e.g. "structure Character", "opaque Cynder : Character", "def IsPG : Game → Prop"): which kind are they logically? (signature symbols vs conservative definitions vs substantive axioms). Note that "axiom Cynder : Character" asserts inhabitation. Recommend how the tool should classify and display them.
4. Anti-cheating checks the extension can enforce mechanically on LLM-produced code: detect new axioms outside ASSUMPTION nodes, sorry/admit, native_decide (check which axiom it adds in 4.35, e.g. Lean.ofReduceBool / Lean.trustCompiler), implemented_by / extern / unsafe, debug.skipKernelTC or other set_option escapes, and changed goal statements (e.g. compare a hash of the elaborated type or pretty-printed statement before/after). Test which of these "#print axioms" catches.
5. Programmatic extraction: write and run a small Lean metaprogram (e.g. "lake env lean --run Extract.lean" importing a built module via importModules, or a lake exe) that emits JSON per declaration: name, kind (axiom/def/theorem/opaque/structure/inductive), pretty-printed type, docstring (findDocString?), declaration source range (findDeclarationRanges?), used constants, collectAxioms result, contains-sorry. Measure: lake build time for a 3-file toy project, extraction time, and incremental rebuild time after a one-line edit. Also try "lean --json File.lean" for diagnostics output format.
6. Comments and docstrings: confirm that a "/-- doc -/" must be followed by a declaration (what error otherwise), that "/- ... -/" and "/-! ... -/" can stand alone, and whether docstring text is retrievable verbatim via findDocString? (check whether Lean 4.35 treats docstrings as Verso/Markdown — any option like doc.verso that changes parsing). Can a "@@ telelean" block live inside a docstring without issues?
7. Alternative: Lean-native markup — a tiny Lean library providing an attribute (e.g. "@[telelean goal]") or a command for code-less nodes stored in an environment extension. Prototype it if quick, and list pros/cons vs pure comments (works when the file doesn't compile? requires a lake dependency in the user's project?).
8. Lake project setup the extension should create for a fresh mental-model workspace (lakefile.toml vs lakefile.lean, lean-toolchain), and whether Mathlib should be optional.
Your scratch dir: ${SCRATCH}/r2-lean-semantics/ ; report path: ${SCRATCH}/r2-lean-semantics/REPORT.md`,
  },
  {
    key: 'r3-ui-graph',
    prompt: `TOPIC R3: Front-end/UI architecture for the graph panel inside a VS Code webview.
Hard requirements from the spec: three side-by-side vertical sections (assumptions | derivations | goals), EACH INDEPENDENTLY SCROLLABLE with possibly very many nodes; arrows between nodes in different sections (and realistically also within a section, e.g. derivation→derivation); click and drag; drag a node to another section to re-classify it; multi-select with a separate "selection" section below the columns; click a node to expand and view its Lean code (syntax highlighted); a visual "blue aura" on nodes that have Lean code; a graphical diff overlay on nodes/edges for LLM-proposed changes (added/removed/modified); a text input box with an ASSUMPTION/DERIVATION/GOAL switch; VS Code theming (light/dark/high contrast).
Investigate (current versions, maintenance status, licenses, bundle sizes):
1. Graph libraries — React Flow (@xyflow/react), Cytoscape.js, JointJS, Sigma.js, D3, ELK (elkjs), GoJS (commercial) — and specifically whether ANY of them supports three independently scrolling viewports with edges crossing between them. (Expectation to test: single-canvas libraries don't; three separate instances can't share edges.)
2. The alternative: DOM-based columns (normal scrollable divs, possibly virtualized with @tanstack/react-virtual) plus one absolutely positioned SVG overlay on top that draws edges by reading node rects (getBoundingClientRect / ResizeObserver / scroll events, coalesced with requestAnimationFrame). Evaluate helper libraries (react-xarrows, leader-line, perfect-arrows, curved-arrows) vs a custom ~200-line implementation. Design how edges behave when an endpoint is scrolled out of view or virtualized away (clamp to column edge with a stub/badge? fade? count indicator?), how edge hit-testing/hover/highlight-ancestors works, and performance limits (hundreds–thousands of edges in SVG).
3. Drag and drop across multiple sortable containers: @dnd-kit (core/sortable; check current status and whether a newer "@dnd-kit/react" exists), @hello-pangea/dnd, Atlassian pragmatic-drag-and-drop, SortableJS — fit for kanban-style multi-column re-classification + in-column reordering + auto-scroll while dragging, and compatibility with virtualization.
4. Framework choice for the webview (React vs Svelte vs Solid vs Lit/vanilla) given the libraries above; state management (e.g. zustand); webview UI kit status (@vscode/webview-ui-toolkit was deprecated — confirm; successor such as @vscode-elements/elements or plain CSS using --vscode-* variables).
5. Code display in expanded nodes: Shiki (check it supports "lean"/"lean4" grammar) vs highlight.js vs a read-only Monaco; cost/benefit.
6. Webview mechanics: WebviewPanel (editor tab) vs WebviewView (sidebar) — which fits "the extension tab itself should contain an interactive panel"; CSP with nonces; asWebviewUri; retainContextWhenHidden vs getState/setState; WebviewPanelSerializer to restore after reload; message-passing protocol design (typed messages, request/response ids); testing the webview UI outside VS Code (Vite dev server + mocked acquireVsCodeApi + Playwright).
7. Produce a concrete recommendation with a component tree sketch, the edge-overlay algorithm in pseudo-code, how the diff overlay is rendered (colour/shape conventions, accessibility — not colour alone), and how the "selection" section and the A/D/G switch work.
Your scratch dir: ${SCRATCH}/r3-ui-graph/ ; report path: ${SCRATCH}/r3-ui-graph/REPORT.md`,
  },
  {
    key: 'r4-markup-lsp',
    prompt: `TOPIC R4: The node markup language inside Lean files, the canonical graph model, and the user's explicit question: "the project might be big and the markup language representing nodes might grow in the future (we might also write separate scripts doing graph analysis on the nodes linked to each other etc), so let me know if an LSP is the right design decision."
Investigate and recommend:
1. LSP or not. Options: (a) a separate language server attached to the lean4 language alongside the official Lean server (VS Code allows multiple clients per language; check how diagnostics/hover/completion/code actions merge, and any conflicts with leanprover.lean4); (b) no LSP: a reusable core library (parser + graph model + validator) used in-process by the extension, plus a CLI that emits a versioned JSON graph for scripts; (c) Lean-native: make the markup Lean syntax (attributes/commands) so the official Lean server provides everything; (d) hybrid: core library now, thin LSP wrapper later. Weigh: multi-editor reuse (many Lean users use Neovim/Emacs), what LSP features would actually be valuable (markup diagnostics, completion of node ids/types, go-to-node, hover showing NL text, code lens "show in graph", rename of node ids), cost, and the fact that graph-analysis scripts are better served by a stable JSON export than by speaking LSP. Give a crisp recommendation and the conditions under which to revisit.
2. Concrete markup design. Start from the user's suggestion:
   /-
   @@ telelean
   natural_name: "Cynder would not be a good addition to the new Spyro game"
   type: GOAL
   -/
   Design a precise, versioned grammar (e.g. "@@ telelean v1"): required/optional fields (stable node id — needed for edges and renames; type; natural_name; a longer natural-language description; rationale/justification for ASSUMPTIONs ("why I believe this"); provenance (user vs LLM, which prompt); status; edges such as uses/depends_on/supports with semantics; tags). Choose a sub-syntax (YAML-subset vs TOML-ish key: value vs JSON) that is robust to hand editing and LLM editing, diff/merge friendly, and trivially parseable without a YAML dependency surprise (YAML's "Norway problem" etc.). Specify: how a block binds to the Lean declaration(s) that follow (immediately-following declaration? explicit lean: field listing declaration names? multi-declaration nodes?), how code-less nodes look, how the natural-language description relates to Lean docstrings (the user suggested "maybe in the Lean file this would correspond to a docstring" — note a "/-- -/" docstring must be followed by a declaration, so code-less nodes need "/- -/"), where layout positions/ordering live (sidecar file vs markup — argue), which edges are derived automatically from Lean (e.g. axioms used) vs declared, and how id collisions/duplicates/dangling references are reported. Provide full examples for: code-less ASSUMPTION with rationale; formalized ASSUMPTION; formalized-but-unproved GOAL; proved DERIVATION; an LLM-created vocabulary/support declaration (e.g. structure Character).
3. File organisation in the user's workspace: one file per kind? one file per node? free placement anywhere in any .lean file (the spec says nodes correspond to "something in a Lean file in the current directory")? Lean import order constraints (definitions before use; cycles impossible) and how the extension decides WHERE to insert new nodes.
4. A versioned JSON graph schema (nodes, edges, statuses, source locations, diagnostics) for the CLI/scripts, and how schema evolution is handled.
5. Robustness: what happens when Lean files don't compile, when the user hand-edits markup badly, when the LLM mangles it; incremental re-parse on file change; performance with thousands of nodes.
Your scratch dir: ${SCRATCH}/r4-markup-lsp/ ; report path: ${SCRATCH}/r4-markup-lsp/REPORT.md`,
  },
  {
    key: 'r5-agent-protocol',
    prompt: `TOPIC R5: The LLM agent protocol and trust model for telelean — what exactly happens when the user selects nodes and presses the button meaning "I assert that the assumptions must be enough to prove the goal", and for other prompt kinds.
Design (concretely, step by step) and justify:
1. Input packaging: what context the agent gets (selected nodes' natural language + rationales, existing Lean code of the model, vocabulary already defined, markup grammar, invariants) and its tool surface (read/edit files in an isolated shadow workspace; a check_lean tool that builds and returns structured diagnostics + axioms-used per declaration; an ask_user tool with optional multiple-choice options; maybe propose_node / finish tools). Consider using the Lean LSP via an MCP server such as lean-lsp-mcp (check its status) vs a simple custom tool that runs lake build / lake env lean.
2. Clarifying questions about pragmatics (the spec: "do you want to model characters?" — level of detail, unspoken context). How should the agent decide when to ask vs assume, how are questions presented (options + free text), how are answers recorded (should answered pragmatic choices be persisted, e.g. as notes in the markup, so future runs stay consistent?).
3. Isolation and proposals: agent works in a shadow copy (temp dir / git worktree / copy with symlinked .lake) so the real workspace is untouched until the user accepts; the extension computes (a) a text diff per file and (b) a graph diff by parsing markup in base vs proposal (nodes added/removed/modified/reclassified, edges added/removed, nodes gaining Lean code). Handle the user editing the real files during the run (base-hash check, 3-way merge, or refuse-and-rebase).
4. Mechanical verification gate the extension enforces WITHOUT trusting the LLM: no new axioms except on ASSUMPTION nodes the user created/approved; every proved GOAL/DERIVATION has axioms ⊆ (selected/declared assumptions ∪ standard axioms); no sorry/admit/native_decide/unsafe tricks; markup valid; ids stable; the user's natural-language text of existing nodes not silently rewritten.
5. The formalization gap: a proof only means something if the Lean statements faithfully express the user's natural-language nodes (the LLM could formalize the goal trivially). Propose UI + protocol mitigations: show formal statements next to NL, LLM back-translation ("autoinformalization") of each formal statement into plain English for comparison, explicit per-node user sign-off ("this formalization matches what I mean"), flagging vacuity (e.g. goal provable from no assumptions, assumptions inconsistent ⇒ check whether False is provable, unused assumptions).
6. Failure modes: assumptions genuinely insufficient (the agent must NOT add assumptions silently; it should explain the gap, maybe sketch a countermodel, and propose candidate missing ASSUMPTIONs as suggestions the user must approve with their own rationale), Lean errors and self-repair loops (iteration caps), timeouts, cancellation, cost/usage display.
7. Semantics of the other prompt kinds: adding an ASSUMPTION/DERIVATION/GOAL from the text box (the spec's walkthrough creates comment-only nodes WITHOUT generating Lean code — so is the LLM invoked at all on add? should natural_name be the user's verbatim words?), "prove this DERIVATION from existing assumptions", "formalize this node only", "check consistency of assumptions", "explain/back-translate", free-form refactoring instructions. Propose the minimal action set for v1.
8. Feedback loop: user rejects with feedback → continue the same agent session (session resume) with the feedback; partial acceptance (accept some nodes/files only?) — is it feasible given Lean dependencies?
9. A system-prompt skeleton for the formalize-and-prove action (concise, model-appropriate; it will run on Claude Opus 5.5 / Claude Code).
Your scratch dir: ${SCRATCH}/r5-agent-protocol/ ; report path: ${SCRATCH}/r5-agent-protocol/REPORT.md`,
  },
  {
    key: 'r6-vscode-toolchain',
    prompt: `TOPIC R6: VS Code extension engineering, toolchain, testing, and integration with the installed Lean 4 extension, on THIS machine.
Investigate (with exact current versions as of Nov 2026, citing the npm registry / official docs):
1. Node.js: current LTS line(s) as of 2026-11; how to install WITHOUT sudo for this user (official tarball into ~/.local, nvm, fnm, volta) — pros/cons; which Node major matches VS Code 1.140's embedded Node/Electron (find VS Code 1.140's Electron/Node versions, e.g. from the snap install's resources/app/package.json or product.json under /snap/code/current/..., or release notes). Is npm enough or is pnpm worth it?
2. Recommended project layout for an extension with a separate webview app and a reusable core library + CLI (npm workspaces monorepo: packages/core, packages/extension, packages/webview, packages/cli?), build tooling (esbuild for the extension host bundle, Vite for the webview), TypeScript version, @types/vscode version matching engines.vscode for 1.140, @vscode/vsce for packaging a .vsix, linting.
3. Testing on this Linux box: unit tests (vitest), extension integration tests (@vscode/test-cli + @vscode/test-electron — these download a separate VS Code build; does that need a display? is xvfb-run installed? check "which xvfb-run", "dpkg -l | grep -i xvfb"), webview UI tests (Playwright against the Vite-built webview with a mocked acquireVsCodeApi — what browsers download is needed and how big), and Lean-side tests (running lake build on fixture projects). Also how the user will run it: F5 Extension Development Host vs "code --install-extension telelean-x.y.z.vsix" with the snap "code" CLI.
4. Integration with leanprover.lean4 0.0.240 installed at ~/.vscode/extensions/leanprover.lean4-0.0.240: inspect its package.json and bundled JS (read only) to find whether it exports an API to other extensions (vscode.extensions.getExtension('leanprover.lean4').exports — what is in it?), the commands it contributes (e.g. restart server, infoview), and whether its diagnostics are available via vscode.languages.getDiagnostics / onDidChangeDiagnostics (yes for any language server — but note the Lean server only elaborates OPEN files; so whole-project status needs lake build or a separate process). Also the Lean server's custom LSP methods ($/lean/fileProgress, $/lean/plainGoal, etc.) and whether a third-party extension can call them via the Lean extension's client.
5. VS Code API pieces the extension will need — verify names/availability in 1.140: WebviewPanel + registerWebviewPanelSerializer, FileSystemWatcher for **/*.lean, workspace.fs, TextDocumentContentProvider for virtual "proposed" documents, the vscode.diff command, and a multi-file diff/changes editor command (e.g. "vscode.changes") for showing a whole proposal; CodeLens provider for .lean files ("Show in telelean"); WorkspaceEdit for applying accepted proposals (so undo works); SecretStorage for API keys; configuration contribution for backend selection.
6. Spawning external processes from the extension host when VS Code is a snap: PATH/environment quirks (snap confinement is "classic" here), locating the claude binary (setting + fallbacks such as ~/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude), locating lake/lean via ~/.elan/bin.
7. A concrete list of software to install (name, version, why, install command) and the scaffold commands you would run.
Your scratch dir: ${SCRATCH}/r6-vscode-toolchain/ ; report path: ${SCRATCH}/r6-vscode-toolchain/REPORT.md`,
  },
  {
    key: 'r7-prior-art',
    prompt: `TOPIC R7: Prior art and design inspiration (the user has a background in formal methods and interests in linguistics, cognition and HCI).
1. learnharness (https://github.com/amosblomqvist/learnharness and https://learnharness.ai), which the user cited: read its README and docs (especially docs/architecture.md and anything about its knowledge graph of propositions and reasoning chains, how it stores the graph as local plain files, how it integrates an installed Claude Code CLI / subscriptions / API keys, its prompts). You may shallow-clone it into your scratch dir to read (do not run it). Extract concrete ideas worth borrowing and things that differ from telelean's goals.
2. Lean-ecosystem tools with dependency graphs of statements linked to Lean code: leanblueprint (Patrick Massot; \\uses, \\lean, \\leanok, the colour legend for stated/formalized/proved nodes — note the user independently proposed a blue aura for formalized nodes), LeanArchitect or any tool putting blueprint metadata in Lean attributes, doc-gen4, Mathlib's import-graph, ProofWidgets / infoview widgets (could part of the UI live in the Lean infoview?), Paperproof. What conventions should telelean adopt?
3. LLM+Lean agent tooling that telelean could reuse: lean-lsp-mcp (MCP server exposing Lean LSP to agents — status, install requirements, tools offered), LeanInteract, Pantograph, the Lean REPL (leanprover-community/repl), Kimina/other provers. Which one, if any, is worth integrating into the agent's tool surface in v1?
4. Argument/assurance mapping: Argdown (markup language + VS Code extension for argument maps with premises/conclusions — very close in spirit), Goal Structuring Notation (GSN: Goal, Strategy, Solution, Context, Assumption, Justification), the Toulmin model (claim, grounds, warrant, backing, qualifier, rebuttal), IBIS/Compendium, Kialo. Map their concepts onto telelean's ASSUMPTION (+ rationale) / DERIVATION / GOAL and point out concepts telelean is missing that the user might want (e.g. confidence/credence on assumptions, rebuttals/defeaters, context nodes, provenance/source of belief).
5. Cognitive/HCI considerations for externalizing a mental model: natural-language-first, progressive disclosure of formal detail, highlighting support chains on hover, keeping the user's own words verbatim, making the formalization gap visible. Cite any relevant literature or tools briefly.
Give concrete, prioritized borrow-this recommendations.
Your scratch dir: ${SCRATCH}/r7-prior-art/ ; report path: ${SCRATCH}/r7-prior-art/REPORT.md`,
  },
]

const TRACE_PROMPT = `TASK: Sentence-level requirements consolidation and traceability for the user's specification at /home/zhengyew/telelean/verbatim_prompt_log/bundle_1/prompt1.md (read it fully; the user says it "might be messy and parts may be out of order, so consolidate points from the idea while keeping track that every sentence is still accounted for").
1. Split BOTH sections ("# Idea" and "# Implementation") into individual sentences in document order, ids S1..Sn. Each numbered/list item is at least one sentence; a fenced code block counts as one unit; keep text verbatim.
2. Produce a consolidated, de-duplicated, logically ordered requirement list grouped as semantics / data-representation / ui-interaction / llm-harness / lean-verification / process-meta / non-functional. Each requirement cites its source sentences. Mark strength must/should/could, or question-to-answer when the user asked for a recommendation (e.g. "let me know if an LSP is the right design decision").
3. EVERY sentence must map to at least one requirement or implied-constraint id, or to "CONTEXT" with a note explaining why it carries no requirement (e.g. pure motivation). No sentence may be left unmapped — double-check by walking the list again at the end.
4. List implied / unspoken constraints (things the spec doesn't say but that follow from it and would significantly shape the design), each with significance and reasoning. Think like a formal-methods + HCI expert: e.g. axioms vs hypotheses and consistency; the formalization gap between natural language and Lean statements; where LLM-created support declarations (like structure Cynder, Prop isCharacter) live given only three columns; whether arrows are user-drawn or derived from Lean dependencies; DERIVATION nodes that are not yet proved; what the A/D/G switch does when the LLM is not invoked (the walkthrough creates nodes without Lean code); where node layout/ordering persists; whether the LLM may ever add assumptions; subscription-usage constraints for Claude; concurrency between user edits and LLM edits; Lean build times; that "the directory VSCode is currently in" must be (or become) a Lake project; multi-root workspaces; that the user expects to "mostly work in the extension window".
5. List tensions/ambiguities between sentences with suggested resolutions.
Write nothing to disk except, optionally, scratch notes under ${SCRATCH}/t1-trace/. Do not modify /home/zhengyew/telelean.`

phase('Research')
log('Launching 7 researchers + 1 requirements tracer in parallel')

const thunks = TOPICS.map(t => () =>
  agent(CONTEXT + '\n' + t.prompt, {
    label: t.key,
    phase: 'Research',
    schema: FINDINGS_SCHEMA,
    ...(t.agentType ? { agentType: t.agentType } : {}),
  })
)
thunks.push(() => agent(TRACE_PROMPT, { label: 't1-traceability', phase: 'Research', schema: TRACE_SCHEMA }))

const results = await parallel(thunks)
const research = results.slice(0, TOPICS.length)
const trace = results[TOPICS.length]

const missing = TOPICS.filter((t, i) => !research[i]).map(t => t.key)
if (missing.length) log('WARNING: no result from: ' + missing.join(', '))
if (!trace) log('WARNING: traceability agent returned nothing')

return { research: research.map((r, i) => ({ key: TOPICS[i].key, result: r })), trace }
