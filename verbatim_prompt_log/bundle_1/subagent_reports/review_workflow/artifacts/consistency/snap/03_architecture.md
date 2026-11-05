# 03 — Architecture and software to install (Step 3)

*Answers Implementation step 3 (S49, S50) and the "represent nodes programmatically" request (S34). It assumes the recommendations in `02_design_decisions.md`; if you override a ★ decision, the affected section changes accordingly. Evidence for every "verified" claim is in `../subagent_reports/research_workflow/`.*

---

## 0. At a glance

```
┌──────────────────────────────── VS Code 1.140 (snap) ────────────────────────────────┐
│  telelean board (editor tab, React webview)        Lean editors (lean4 extension)    │
│  ┌ Assumptions ─┐┌ Derivations ─┐┌ Goals ───────┐   + telelean providers: diagnostics, │
│  │ ▸Vocabulary  ││  card        ││  card        │     hover = your sentence, id       │
│  │  card ●──────┼┼──▶ card ─────┼┼──▶ card      │     completion, go-to-node,         │
│  │  card        ││              ││              │     "◆ GOAL · Show in map" CodeLens │
│  └ (scrolls) ───┘└ (scrolls) ───┘└ (scrolls) ───┘                                     │
│  [ selection tray:  A1  A2  A3  ⊢  G   ▶ These suffice ]                             │
│  [ agent thread: progress · question cards · statement sign-off · report card ]      │
│  [ prompt box:  (Assumption|Derivation|Goal|Instruct)  text…   why?…   Add ]         │
│            ▲ typed messages: versioned snapshot/patch ▼ requests                     │
│ ─────────────────────────────── extension host (Node 24) ─────────────────────────── │
│  WorkspaceIndex ── @telelean/core: lex · parse · bind · graph · validate · diff · edits│
│  SemanticRunner ── lake build + telelean-extract → facts JSON   (one job at a time)  │
│  RunController ─── shadow workspace · agent session · gate G0–G6 · proposal · accept │
│  LlmHarness ────── LlmBackend ⇐ ClaudeAgentSdkBackend | FakeBackend (tests)          │
│                        │ spawns the unmodified Claude Code binary (your login)        │
└────────────────────────┼─────────────────────────────────────────────────────────────┘
                         ▼                                   Model workspace (any Lake project):
                Claude (your subscription)                   *.lean with /- @@ telelean v1 … -/ blocks
                                                             .telelean/layout.json · sessions/ · frozen/
 `telelean` CLI (export | check | init | fmt) ── same @telelean/core ── versioned JSON graph for scripts
```

**Five principles**
1. **Lean files are the source of truth for nodes.** Layout, sessions and frozen sign-offs live in `.telelean/`. Statuses are *derived* from Lean and never stored.
2. **The LLM is untrusted.** The Lean kernel plus a deterministic gate decide what counts as proved. Nothing touches your files until you accept.
3. **Your words are the specification.** Natural language comes first and Lean is shown on demand. `natural_name` and `rationale` are never rewritten by the agent.
4. **One core library** is shared by the extension, the CLI and any future LSP.
5. **Bounded resources.** One Lean job runs at a time. Agent builds run sandboxed with a memory cap, and there is no Mathlib by default.

---

## 1. Repository layout (in `/home/zhengyew/telelean`)

```
telelean/
├─ package.json             npm workspaces ["packages/*"], private
├─ .node-version            24.22.2
├─ tsconfig.base.json · eslint.config.mjs
├─ packages/
│  ├─ core/       @telelean/core   pure TypeScript, no `vscode` import
│  │    markup/   lexer (Lean-comment-aware) · parser · serializer (canonical) · binder
│  │    graph/    model · validate (TLnnn codes) · status · edges · diff
│  │    facts/    Lean facts schema · merge into graph
│  │    edits/    createNode · setKind · setField · addPremise · attachDecl → minimal TextEdits
│  │    export/   telelean-graph JSON v1 + JSON Schema
│  │    gate/     G0 lint (comment/string-aware Lean token scan)
│  │    node/     (Node-only subpath) spawn helpers, snap-env sanitizer, bwrap wrapper
│  ├─ extension/  telelean          VS Code extension (esbuild → dist/extension.js)
│  ├─ webview/    @telelean/webview React 19 board (Vite → extension/dist/webview/)
│  └─ cli/        @telelean/cli     `telelean export|check|init|fmt|schema`
├─ lean/TeleleanTools/      Lean package pinned to v4.35.0: telelean-extract (facts + audit); later the Ramsey generator
├─ test-fixtures/lean/      basic · spyro · broken · exploits (each exploit must be rejected by the gate)
├─ mental_model/            sample model workspace = your Spyro walkthrough (pending D-32)
├─ docs/                    markup-spec.md · user-guide.md · architecture.md
└─ verbatim_prompt_log/     (untouched)
```

---

## 2. The programmatic node representation (S34)

### 2.1 In-memory model (`@telelean/core`)

```ts
type NodeKind = 'ASSUMPTION' | 'DERIVATION' | 'GOAL' | 'DEFINITION' | 'DECISION';

interface TlNode {
  id: string;                         // stable slug, the identity of the node
  kind: NodeKind;
  naturalName: string;                // the user's words, verbatim
  rationale?: string;                 // ASSUMPTION: why you hold it
  body?: string;                      // Markdown after '---'
  premises: string[];                 // declared joint support (one argument)
  affects?: string[];                 // DECISION: nodes this choice applies to
  tags: string[]; origin: 'user' | 'agent'; session?: string;
  ext: Record<string, string>;        // namespaced extension keys
  source: { file: string; range: Range; markupVersion: number };
  lean: { binding: 'none' | 'adjacent' | 'explicit'; decls: LeanDeclRef[] };
  status: DerivedStatus;              // computed, never written to disk
}

interface DerivedStatus {
  formal: 'informal' | 'formalized' | 'error';
  proof: 'n/a' | 'none' | 'sorry' | 'proved' | 'assumed';
  purity?: 'pure' | 'impure';
  assumptionsUsed?: string[];         // node ids, from collectAxioms
  flags: Array<'broken' | 'depends-on-broken' | 'stale' | 'claimed' | 'no-rationale'
             | 'existence-commitment' | 'unsigned' | 'signoff-stale' | 'no-consistency-certificate'>;
}

interface Edge {                      // drawn as arrows
  type: 'premise' | 'uses-assumption' | 'lean-ref';
  source: string; target: string;     // source supports / is used by target
  origin: 'declared' | 'lean';
  where?: 'statement' | 'proof';
}
interface Graph { version: number; nodes: Map<string, TlNode>; edges: Edge[]; diagnostics: TlDiagnostic[] }
```

### 2.2 How a graph is built
1. **Parse** the markup blocks in every workspace `.lean` file. Open, unsaved buffers are used instead of the disk copy. This takes milliseconds: the research prototype handled 3,000 nodes in about 0.25 s in CPython.
2. **Bind** each block to a Lean declaration, by adjacency or an explicit `lean:` list.
3. **Merge Lean facts** from the extractor (§5) when available, keyed by file hash so stale facts are visible as stale.
4. **Validate** (§3.4) and **compute statuses and edges**.

A versioned **patch** goes to the webview.

### 2.3 The same graph for scripts (S43)
`telelean export --format-version 1` emits `telelean-graph` JSON:
- `format`, `format_version`, `generator`
- `semantic {available, lean_version, stale}`
- `nodes[]`, with source ranges using LSP conventions (0-based, UTF-16)
- `edges[]`, `diagnostics[]`, and `files[]` with sha256

A JSON Schema (2020-12) ships with it. Consumers ignore unknown fields. Additive changes are minor versions; breaking changes are major versions, and the previous major stays available. A prototype schema and an example analysis script ("which assumptions does each goal transitively rest on? which assumptions are unused?") were validated in research.

---

## 3. Markup language v1 (the `@@ telelean` blocks)

### 3.1 Grammar

```
block      = "/-" NL marker NL { field NL } [ "---" NL body ] "-/"
marker     = "@@" ws "telelean" [ ws "v" digits ]          ; missing version = v1 (with a hint)
field      = key ws? ":" ws? value
key        = lcid { "." lcid }                              ; dotted keys = extensions, preserved
value      = json-string | raw-text                         ; typed by the key's schema, never by its look
list-value = [ "[" ] item { "," item } [ "]" ]              ; a repeated list key accumulates
```

**Rules**
- **Not YAML.** Raw text may contain `:`, `#` and quotes.
- **Escaping.** A value that starts with `"` is a JSON string. The serializer escapes the comment delimiters inside values (`-/` as `-\/`, `/-` as `/-`), because a stray `/-` would swallow the rest of the Lean file (verified).
- **Detection.** A plain `/- … -/` comment whose first non-blank line matches `^@@\s*telelean(\s+v\d+)?\s*$`. Doc comments (`/--`, `/-!`) are never used for blocks.
- **Binding.** A block binds to the declaration starting on the next non-blank line. Its docstring, attributes and modifiers may sit in between. A blank line, the end of the file or another block makes the node code-less. An explicit `lean: A, B.c` overrides adjacency, for multi-declaration nodes (resolved relative to the namespace at the block).
- **Lexing.** The lexer respects Lean's rules: comments nest, string literals hide comment markers, and `«…»` identifiers and raw strings are handled (20 edge cases verified).

### 3.2 Fields

| Field | Required | Meaning |
|---|---|---|
| `id` | ✓ | Stable slug `^[a-z0-9]+([-_.][a-z0-9]+)*$`, unique in the workspace. Generated once and never changed implicitly |
| `kind` | ✓ | `ASSUMPTION` \| `DERIVATION` \| `GOAL` \| `DEFINITION` \| `DECISION`. `type:` is accepted as an alias |
| `natural_name` | ✓ | Your sentence, verbatim |
| `rationale` | ASSUMPTION: encouraged | Why you believe it. On a GOAL: why you care |
| `premises` | | Ids that jointly support this node (from the button, or drawn arrows) |
| `affects` | DECISION | Ids a modeling decision applies to |
| `lean` | | Explicit declaration binding |
| `tags`, `origin` (user\|agent), `session` | | Bookkeeping and provenance |
| `x.y` | | Namespaced extension fields (credence, source… reserved, D-34) |
| body after `---` | | Markdown: longer description, notes |

Deliberately **not** in the markup: proof status (derived from Lean) and layout (`.telelean/layout.json`).

### 3.3 Examples (your walkthrough)

```lean
/-
@@ telelean v1
id: pg-no-dark-past
kind: ASSUMPTION
natural_name: PG games cannot have characters with dark pasts
-/
                                         ← blank line: code-less node (no rationale yet → badge)
/-
@@ telelean v1
id: cynder-dark-past
kind: ASSUMPTION
natural_name: Cynder is a character who has a dark past
rationale: familiar with gaming lore
-/
axiom cynder_dark_past : HasDarkPast cynder          -- formalised assumption

/-
@@ telelean v1
id: cynder-not-good
kind: GOAL
natural_name: Cynder would not be a good addition to the new Spyro game
premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past
-/
theorem cynder_not_good : ¬ GoodAddition cynder newSpyro := by sorry   -- formalised, unproved

/-
@@ telelean v1
id: characters
kind: DEFINITION
natural_name: Characters that can appear in games
origin: agent
lean: Character, cynder
-/
axiom Character : Type
axiom cynder : Character                              -- existence commitment (badge)

/-
@@ telelean v1
id: decision-pg-rule-is-strict
kind: DECISION
natural_name: "PG games cannot have characters with dark pasts" is a strict rule, not a tendency
affects: pg-no-dark-past
origin: user
session: 2026-11-01T10-15Z-a1b2
---
Asked during the run: rule / norm / tendency? Answer: strict rule.
-/
```

### 3.4 Validator (diagnostics in the panel, in Lean editors, and from `telelean check`)

| Code | Severity | Check |
|---|---|---|
| TL001–TL009 | error / warn | Syntax and schema: parse error, duplicate id, dangling premise, unknown kind, newer markup version (TL002/TL008), premise cycle |
| TL011 | info | ASSUMPTION without rationale |
| TL013 | hint | A declaration follows after a blank line: attach it? |
| TL018 | hint | `type:` used; prefer `kind:` |
| TL101 | error | Bound declaration not found in Lean |
| TL102 | error | DERIVATION depends on `sorry` |
| TL103 | error | DERIVATION uses axioms that are not ASSUMPTIONs (impure) |
| TL104 | warn | Prop-valued axiom not attached to any ASSUMPTION ("hidden assumption") |
| TL105 | info | GOAL is already proved purely: promote to DERIVATION? |
| TL106 | warn | ASSUMPTION formalised as a non-axiom |
| TL107 | warn | Proof uses assumptions outside the declared premises |
| TL108 | info | Data axiom = existence commitment |
| TL109 | info | Declared premise unused by the proof |
| TL110 | warn | `autoImplicit` enabled in this project |

A Python reference implementation of the parser, binder, validator and export (about 600 lines, 20 passing tests) exists from research. It is ported to TypeScript with its tests.

---

## 4. Lean conventions and project scaffold

| Node state | Lean |
|---|---|
| Natural language only (any kind) | Comment block only. No `sorry`, no declaration |
| ASSUMPTION, formalised | `axiom name : Stmt` |
| GOAL / DERIVATION, formalised but unproved | `theorem name : Stmt := by sorry` |
| DERIVATION, proved | `theorem name : Stmt := proof`, axioms ⊆ assumptions ∪ {propext, Classical.choice, Quot.sound} ∪ vocabulary |
| DEFINITION (vocabulary) | Uninterpreted by default: `axiom T : Type`, `axiom c : T`, `axiom P : T → Prop` (or `opaque`). Any `def`/`structure`/`inductive` with content needs your sign-off |
| DECISION | Comment block only |

**Scaffold** (`telelean: Initialize model here`):
```
lakefile.toml    name = "Model"; [leanOptions] autoImplicit = false, relaxedAutoImplicit = false; [[lean_lib]] name = "Model"
lean-toolchain   leanprover/lean4:v4.35.0
Model.lean       root module; imports maintained by telelean
Model/Vocabulary.lean · Model/Main.lean · Model/Decisions.lean · Model/Inbox.lean (new code-less nodes)
.telelean/layout.json · .telelean/sessions/ · .telelean/frozen/
.gitignore       /.lake  /.telelean/sessions/
```

Kind is metadata, not location. Promote/demote edits one markup line plus the justification. Lean names and statements stay put, so dependents never break (verified). Existing Lean projects work too: blocks may sit in any `.lean` file outside `.lake/`.

---

## 5. The semantic layer (how telelean knows what Lean thinks)

**Pipeline.**
1. A file save produces a core re-parse and an immediate graph patch.
2. If non-comment tokens changed, a **semantic refresh** is scheduled: debounced, single-flight, one job at a time.
3. The refresh runs `lake build` in the real workspace. That is your code, which your Lean server already elaborates, so it needs no extra sandbox.
4. Then `telelean-extract <root modules>` writes facts JSON, which is merged and pushed as a patch.

Separately, `vscode.languages.onDidChangeDiagnostics` gives instant error badges for files open in editors.

**`telelean-extract`** is a small Lean program in `lean/TeleleanTools`.
- **Build.** Compiled against the workspace's toolchain into extension storage on first use: about 4 s, a 231 MB binary, about 0.5 s and 475 MB RSS per run. Without a compiled binary, it falls back to `lake env lean --run`, about 3–5 s per run.
- **Per declaration it emits:**
  - name, module, kind, pretty-printed type, alpha-invariant type hash, `isProp`, docstring
  - declaration ranges
  - direct dependencies (split by statement and proof)
  - `collectAxioms` result and axiom class (prop, type-former, existence commitment, data-suspicious)
  - `sorry` and synthetic-sorry flags, and `unsafe`/`implemented_by`/`extern` flags
- **Safety and robustness.**
  - It imports modules with `loadExts := false`, so their initializers never run.
  - For a file that fails to compile, a front-end mode elaborates it in-process to recover partial facts.
  - It is versioned per toolchain, because Lean's internal APIs drift (several renames were hit on 4.35), and CI-tested on Lean upgrades.

**Measured on this machine:** about 0.35–0.45 s per module build; 3,000 declarations extracted in about 1 s; `collectAxioms` over 2,980 declarations in 26 ms.

---

## 6. Extension host

| Component | Responsibility |
|---|---|
| Activation | `workspaceContains:**/lakefile.{toml,lean}`, `onWebviewPanel:telelean.board`, commands. Untrusted and virtual workspaces are not supported, because it spawns processes |
| ProjectService | Finds Lake project roots (multi-root workspace: one board per project, with a picker). Scaffold command. Checks that the toolchain is installed (never triggers elan downloads silently) |
| WorkspaceIndex | `FileSystemWatcher` on `**/*.lean`, excluding `.lake/`, `lake-packages/`, `.git/` and `node_modules/`. Incremental per-file parse. Owns `layout.json` |
| SemanticRunner | Job queue (concurrency 1), lake/extractor spawning with a **snap-environment sanitizer**: the snap leaks `ELECTRON_RUN_AS_NODE`, `SNAP*`, `GTK_*`… into children (verified). Puts `~/.elan/bin` on PATH. Cancellation and a memory cap |
| EditService | Every UI action (add node, edit text, change kind, draw premise, delete) → core edit ops → `WorkspaceEdit`, so changes are undoable and never written behind dirty buffers. Re-ordering touches only `layout.json` |
| Lean-editor providers | `DiagnosticCollection('telelean')`; hover (your sentence, kind, status); completion of ids and kinds; definition/references for ids; rename for ids only (returns undefined elsewhere, so Lean's rename keeps working); CodeLens "◆ GOAL · formalized · Show in map"; quick-fix code actions; a TextMate injection grammar to highlight blocks. **Never** semantic tokens or formatters for `lean4`, which would replace Lean's own |
| BoardPanel | `WebviewPanel` (editor tab, `retainContextWhenHidden`, find widget) + serializer. Typed protocol: versioned snapshot/patch, request/response ids, zod-validated inbound messages |
| RunController / ProposalService / Gate / LlmHarness | §8 |
| Settings | `telelean.model` (claude-opus-5-5), `telelean.effort` (high), `telelean.backend`, `telelean.claude.path`, run caps, `telelean.sandbox.required` (true), `telelean.git.snapshotBeforeApply` (true), `telelean.docstringMirror` (false) |
| Commands | Open board · Initialize model · Add node · Prove selection · Formalize node · Instruct · Accept / Reject proposal · Show proposal diff · Export graph · Reveal node |

---

## 7. The board (webview UI)

**Why no graph library.** None of React Flow, Cytoscape.js, JointJS, Sigma.js or GoJS supports three independently scrolling viewports that share edges. Each draws a single pan/zoom canvas, and separate instances cannot share an edge (verified survey).

**Design.**
- Three ordinary scrollable DOM columns.
- One absolutely positioned **SVG edge overlay**, in two layers (under and over the opaque cards).
- HTML badge buttons on top.

This keeps native scrolling, the find widget, accessibility and drag auto-scroll. A vanilla prototype of exactly this design was built and screenshot-tested in dark, light and high-contrast themes.

**Stack.**
- React 19.3 + zustand 5 + plain CSS on `--vscode-*` variables, plus `@vscode/codicons`.
- Drag-and-drop with `@atlaskit/pragmatic-drag-and-drop` 4.0. It uses native HTML5 drag, never moves DOM or applies transforms (so cached edge geometry stays valid), and has auto-scroll.
- Lean code highlighting with **Shiki 4.5**, which bundles a Lean grammar taken from vscode-lean4 itself, using the JS regex engine so no WASM is needed.
- `@vscode/webview-ui-toolkit` is deprecated and not used.

**Component tree**
```
<App> store · HostBridge · ThemeWatcher
├─ <Toolbar> search/filter · edges Auto|Focus|All · ancestors/consequences toggle · overlay switch · legend
├─ <ProposalBanner> "4 new · 3 changed · 1 moved · 1 removed"  n/p · Accept · Feedback… · Reject · Raw Lean diff…
├─ <Board>
│   ├─ <EdgeLayer under/>  <Column kind=A|D|G>×3 (header + scroll list, drop target)  <EdgeLayer over/>  <EdgeBadges/>
│   │     └─ <VocabularyGroup/> (top of Assumptions, collapsed)  <NodeCard/>…
│   └─ EdgeEngine (imperative, outside React)
├─ <SelectionTray>  premise chips ⊢ goal chip   [Clear] [These suffice to prove the goal ▶]
├─ <AgentThread>    progress · question cards · statement sign-off · report card
└─ <PromptBox>      KindSwitch (Assumption|Derivation|Goal|Instruct) · text · "Why do you believe this?" · Add
```

**Node card.**
- Checkbox (select), kind marker, your sentence (wraps), and a "because: …" line.
- Chips: λ formal · ✓ proved · ⚠ sorry · ✗ broken · ★ signed off · "no rationale yet".
- **Blue aura** when formalised. DEFINITION cards are boxes.
- The chevron expands to show:
  - the Lean code (Shiki)
  - "Depends on / Used by" buttons, which scroll to and focus the related card and double as the screen-reader route through the graph
  - the exact assumption set
  - "Open in editor" (beside, with selection)

**EdgeEngine** (framework-agnostic, about 300 lines; full TypeScript sketch from research).
- **Scheduling.** At most one requestAnimationFrame per change. Geometry is cached via ResizeObserver; only the three `scrollTop`s are read per frame. Measured: `getBoundingClientRect` per endpoint costs about 13× more JS than cached offsets.
- **Off-screen endpoints.** Edges with both ends off-screen are culled. An edge with one end hidden becomes a short stub plus a "▲ n linked / ▼ n linked" button that scrolls to the nearest hidden neighbour. Hovered or selected nodes get full curves.
- **Line styles.** Declared support is long-dashed; verified dependency is solid. Multi-premise arguments go through a junction dot, and same-column edges loop through the gutter.
- **Budget.** About 250 drawn edges, prioritised focus > diff > visible > stubs. Scrolling never re-renders React.
- **Measured.** About 17 ms per frame with 2,510 nodes and 2,262 edges. SVG repaint, not JS, is the bottleneck, so culling is essential.

**Gestures** (D-17): click selects · chevron expands · double-click opens source · drag within a column re-orders (layout only) · drag across columns changes kind (with rules) · drag from a port draws a declared arrow · keyboard equivalents (Alt+↑/↓, Ctrl+Shift+←/→) and context menus · aria-live announcements.

**Proposal overlay** (never colour alone):

| Change | Card | Edge | Glyph |
|---|---|---|---|
| added | dashed border (added colour) | long-dash | `+ new` |
| modified | solid border (modified colour) | — | `~ Lean added` / `~ text changed` (expanded: before/after) |
| moved / re-classified | dotted ghost "moved here" in the target column | re-targeted | `→ Goal → Derivation (proved)` |
| removed | dashed border, title struck through | dotted | `−` |
| unchanged | dimmed by colour, not opacity | faded | |

"Raw Lean diff…" opens VS Code's native multi-file diff editor (`vscode.changes`, verified present in 1.140) on a read-only `telelean-proposal:` file system.

**Statement sign-off view** (phase A of a run). For each new or changed statement, it shows:
- your sentence
- the Lean statement, with a *notation off* toggle
- an independent plain-English back-translation
- flags: definitions on the statement path, existence commitments, closed-world encodings

Each statement gets ✓ approve or ✗ with a comment.

**Theming and accessibility.**
- Contributed theme colours: `telelean.node.formalizedAura` (default `charts.blue`), `telelean.kind.*` and `telelean.diff.*`. You can override them in settings.
- High contrast swaps glows for outlines; reduced motion is honoured.
- Columns are ARIA listboxes and cards are options.
- Content Security Policy: nonce-based, no `unsafe-eval`. Shiki tokens are rendered through React, never `innerHTML`, because workspace text and LLM output are untrusted.
- **No virtualisation in v1.** Plain DOM scrolls 3,000 cards per column at 60 fps (measured). A geometry abstraction lets `@tanstack/react-virtual` slot in later.

---

## 8. The LLM harness

### 8.1 The slot (S9)
```ts
interface LlmBackend {
  id: 'claude-agent-sdk' | 'fake' | 'anthropic-api' | 'vscode-lm';
  caps: { builtinFileTools: boolean; subscriptionAuth: boolean; resume: boolean };
  startSession(cfg: SessionConfig): Promise<LlmSession>;   // cwd = shadow, model, effort, system prompt, host tools
}
interface LlmSession {
  send(turn: string): AsyncIterable<LlmEvent>;  // text deltas · tool start/end · question · usage · done · error
  interrupt(): Promise<void>; close(): Promise<void>;
}
```
- **v1 backends:** `ClaudeAgentSdkBackend` and `FakeBackend`. The fake replays scripted transcripts, so the whole walkthrough is testable without spending your quota.
- **v2:** API-key backend (`@anthropic-ai/sdk` tool runner; for sharing telelean) and a VS Code Language Model API backend.

### 8.2 Claude backend configuration (Claude Agent SDK 0.3.316)
```ts
query({ prompt: userTurns /* AsyncIterable: feedback is streamed into the same session */, options: {
  cwd: shadowDir, model: 'claude-opus-5-5', effort: 'high',
  systemPrompt: { type: 'custom', prompt: [STATIC_RULES, SYSTEM_PROMPT_DYNAMIC_BOUNDARY, projectContext] },
  settingSources: [], strictMcpConfig: true,            // isolate from your ~/.claude settings, hooks, MCP servers
  mcpServers: { telelean: teleleanTools },               // in-process tools (§8.3)
  tools: ['Read','Glob','Grep','Edit','Write'],         // no Bash, no web, no subagents
  disallowedTools: ['Bash','WebFetch','WebSearch','Agent','AskUserQuestion','NotebookEdit'],
  allowedTools: ['Read','Glob','Grep','Edit','Write','mcp__telelean__*'],
  permissionMode: 'dontAsk',
  hooks: { PreToolUse: [pathGuard /* shadow only; never lakefile*, lean-toolchain, .lake/**, .telelean/frozen/** */],
           Stop: [requireFinish] },
  maxTurns: 80, abortController, verbatimPrompts: true, includePartialMessages: true, persistSession: true,
  env: sanitizedEnv /* API-key variables removed → subscription login is used */ } })
```
- **Loading.** The SDK is ESM-only and locates its binary via `import.meta.url`, so it is loaded with a dynamic `import()` and kept out of the CommonJS bundle. telelean also always passes `pathToClaudeCodeExecutable` explicitly, resolved from the SDK's pinned platform package, so binary lookup never depends on `import.meta.url`. Your VS Code Claude extension's binary is an alternative via a setting.
- **Packaging.** It is installed **from the repo folder, not as a `.vsix`**. In VS Code 1.140, "Developer: Install Extension from Location…" registers a folder in place (verified: it calls `installFromLocation(folder)`). The SDK and its 330 MB binary therefore resolve from the repo's `node_modules`. A `.vsix` would have to embed them, and since distributing telelean would anyway require the API-key backend (D-23), `.vsix` packaging is deferred to v2.
- **Never `--bare`**, because that mode never reads your login.

### 8.3 Tools the agent gets (one in-process MCP server)

| Tool | Purpose |
|---|---|
| `check_lean({files?})` | Runs G0 lint + **sandboxed** build + extractor in the shadow. Returns diagnostics (file/line/col/message), per-declaration facts (assumptions used, flags) and policy violations |
| `ask_user({questions[1–3]})` | Each question has a kind (hidden premise / semantic / granularity / convention), 2–4 options with plain-language consequences, an optional formal preview, a recommended choice, free text, affected node ids, and `persist: decision`. Blocks until you answer in the board |
| `propose_formalization({nodes, summary})` | Ends phase A. Opens the statement sign-off view and blocks. Returns approved/rejected nodes with your comments. The extension reads the real declarations itself rather than trusting the summary |
| `propose_assumption({natural_name, lean_statement?, why_needed})` | Asks to add a premise. Shows a ghost node that you may adopt with **your** rationale |
| `finish({status, summary, gap?, conflict?, unused?, decisions?})` | `proved` / `insufficient` / `inconsistent` / `failed` / `needs_user`. Triggers the full gate and ends the turn |
| `certify(…)` (v1.5) | The extension generates a read-only consistency/independence statement; the agent fills in only the proof |

**Why a custom `ask_user` and not Claude Code's built-in `AskUserQuestion`?** The built-in tool is denied under the locked-down `dontAsk` permission mode and is unavailable to subagents. It also cannot carry affected-node ids or the "record as DECISION" flag. `ask_user` deliberately mirrors its shape (1–4 questions, 2–4 options, free text), so the model uses it fluently. The research reports disagreed here: R1 preferred the built-in tool under `default` mode, R5 the custom tool under `dontAsk`. The lockdown decides it.

**Context bundle** (first message): the action; the target and selected nodes *verbatim*; a compact index of all nodes; the vocabulary (from the extractor); recorded DECISIONs; target files; budgets. The agent reads the Lean source from the shadow on demand.

### 8.4 Run protocol (the "These suffice" button; Formalize-only and Instruct reuse it)
```
Preflight ─▶ Shadow ─▶ Formalize ⇄ ask_user ─▶ Sign-off (you) ─▶ Freeze ─▶ Prove ⇄ check_lean ─▶ finish ─▶ Gate ─▶ Proposal
   │            │          (vocab, axioms,        approve/       leanexport    (≤25 checks,              │       overlay + raw diff
 hashes,     copy + bwrap   theorem := sorry)     reject+why     frozen.ndjson  80 turns, 20 min)        │       + report card
 bwrap ok    sandbox                                                                               fail→back   ├─ Accept ─▶ base-hash check → WorkspaceEdit (+ git snapshot)
                                                                                                    to agent   │            (diverged → 3-way merge → re-gate)
                                                                                                    while      ├─ Feedback ─▶ same session (resume after reload)
                                                                                                    budget     └─ Discard (transcript kept)
```
- **Shadow workspace:** `<extension storage>/runs/<id>/ws`.
  - Copy sources, `lakefile`, toolchain and manifest.
  - Copy `.lake/build` with `cp -a --reflink=auto`, which preserves mtimes so there is no rebuild (verified).
  - Symlink `.lake/packages` and bind it read-only.
  - `git init` + a base commit, giving diffs and 3-way merges for free.
  - The last 10 runs are kept.
- **Sandbox for every Lean run on agent-written code:**
  `bwrap --ro-bind / / --dev /dev --proc /proc --tmpfs /tmp --tmpfs $HOME --ro-bind ~/.elan ~/.elan --bind $SHADOW $SHADOW --chdir $SHADOW --unshare-all --die-with-parent --new-session … lake build`
  - Wrapped in `systemd-run --user --scope -p MemoryMax=4G` (fallback: `prlimit`) with a 120 s timeout.
  - Verified to contain an agent `run_cmd` that wrote outside the project, listed `$HOME` and resolved DNS.
  - **Fails closed** if bubblewrap is missing.

### 8.5 The gate (all mechanical; about 5–10 s on small models)

| Step | Check | Tool | Catches (each verified against a real exploit) |
|---|---|---|---|
| G0 | Lint changed files | TS token scan | `#eval`/`run_cmd`/macros/`notation`/`elab`, `set_option debug.*`, `native_decide`, `implemented_by`/`extern`/`unsafe`, new imports, edits to lakefile/toolchain |
| G1 | Build | sandboxed `lake build` | Errors. `sorry` is allowed only on formalised-unproved nodes |
| G2 | Kernel replay | `leanchecker` (about 1 s) | `debug.skipKernelTC` environment hacking, which fools `#print axioms` |
| G3 | Axiom audit | `telelean-extract` | Proved ⇒ no `sorryAx`. Assumptions used ⊆ allowed. Hidden Prop axioms. `native_decide` auxiliary axioms. Vocabulary classes |
| G4 | Statement freeze | `lake comparator --challenge-from-export frozen.ndjson` (about 3 s) | Weakened goal, silently changed assumption, smuggled axiom. `permitted_axioms` = the 3 standard + vocabulary + the **selected** assumptions |
| G5 | Markup policy | core | Your `natural_name`/`rationale` byte-identical; ids stable; no deletions; reclassification only G→D when proved; agent nodes marked `origin: agent` |
| G6 | Advisory flags | core + facts | Proved from zero assumptions ("self-evident"); unused selected premises; new definitions on statement paths; trivial statement shapes; consistency unknown |

### 8.6 Failure modes
- **Insufficient** → plain-language gap, ghost assumptions (and a countermodel in v1.5).
- **Inconsistent** → the conflict set (the assumptions used in a proof of `False`) is highlighted.
- **Lean errors** → bounded self-repair: stall detection after 3 identical first errors, then a "continue with more budget" resume.
- **Cancel** → interrupt, kill the process group, keep the shadow and transcript.
- **Usage** → live tokens, cost *estimate* (the SDK says so), and subscription rate-limit status and reset time.

---

## 9. LSP, CLI and the JSON export (S43)

**Recommendation (D-28):** core library + CLI/JSON + in-process VS Code providers now; a thin LSP adapter later, only if you want markup support in Neovim or Emacs. Neovim attaches a second server natively; Emacs `lsp-mode` supports add-on servers; Eglot would need a multiplexer.

**CLI:**
- `telelean export [--format-version 1] [--facts]` — writes the JSON graph.
- `telelean check [--format text|json|gnu|sarif]` — markup + Lean-facts validation, with CI-friendly exit codes.
- `telelean init` — scaffolds a model project.
- `telelean fmt` — canonical block formatting.
- `telelean schema` — prints the JSON Schema.

A short `docs/markup-spec.md`, plus a read-only `SKILL.md` for agents, documents the format. Scripts should read the JSON, never parse blocks themselves.

---

## 10. Testing strategy (S52)

| Layer | Tooling | Covers |
|---|---|---|
| Core unit | vitest 5 | Lexer edge cases (nesting, strings, escapes), parser/serializer round-trip, binder, validator codes, status, graph diff, lint, JSON schema conformance. Port of the 20 research tests + more |
| Lean fixtures | vitest spawning `lake` (toolchain v4.35.0) | Extractor output on `basic`/`spyro`; `broken` partial facts; **every exploit in `exploits/` rejected by the gate** (sorry, smuggled axiom, native_decide, skipKernelTC, weakened goal, notation trick, `#eval`, definitional smuggling, autoImplicit typo) |
| Webview | Playwright 1.64 on your installed Chrome 155 (no browser download) + mocked VS Code API | Board render, selection tray, kind switch + why field, drag re-order/re-classify, edge stubs and badges, proposal overlay, sign-off view; screenshots for dark/light/high-contrast |
| Extension integration | `@vscode/test-cli` + `@vscode/test-electron` (VS Code 1.140 test build) | Activation, board opens, file edit → graph patch, Add node writes a comment block, proposal accept + undo, providers (hover/completion/CodeLens). Run as `env -u ELECTRON_RUN_AS_NODE …` (snap gotcha, verified) |
| End-to-end walkthrough | FakeBackend script | S18–S33 exactly: 4 nodes → select → question about the bridging premise → sign-off → proof → gate → overlay → accept → G moves to D |
| Manual smoke | Real Claude, once | The same walkthrough against your subscription. This uses some quota; I'll do one run unless you say otherwise |

Tests run **sequentially** (one VS Code test instance, one Lean job) with a `free -m` check, per your RAM instruction.

**"Good enough to start using" (v1 definition of done):** everything in the v1 column below works on `mental_model/`, all automated tests pass, and the manual Claude walkthrough succeeds end to end.

---

## 11. Roadmap

| v1 (what I'd build after approval) | v1.5 | v2 |
|---|---|---|
| Init/scaffold · markup v1 + validator · board with 3 columns + vocabulary group · cards, aura, statuses · declared + verified arrows · drag re-order/re-classify · selection tray · prompt box (A/D/G/Instruct, why-field) · semantic layer (build + extractor) · Claude backend + fake · **Prove-from-selection** (two-phase), **Formalize-only**, **Instruct** · questions + DECISION records · sign-off with back-translation · gate G0–G6 · proposal overlay + raw diff · accept/feedback/discard · Lean-editor providers · CLI export/check/init/fmt · tests above | Consistency & independence **certificates** (Ramsey sentences, prototyped) · "derive False" probe · countermodels attached to *insufficient* reports · deterministic logic-skeleton English · credence/source fields · DECISION drawer polish | Thin **LSP** adapter (Neovim/Emacs) · API-key and VS Code LM backends · node-level partial accept · goal-state tools (lean-lsp-mcp / lean-beam, sandboxed) · Lean module system · "Enable Mathlib" · optional free-form graph view · alternative arguments per goal |

---

## 12. Software to install

**Required, all without sudo:**

| # | Software | Version | Why | How |
|---|---|---|---|---|
| 1 | **Node.js** (bundles npm 11.19.1) | **24.22.2 LTS** | Build, test, package and the CLI. Same major as VS Code 1.140's extension host (Node 24.21) | Official tarball into `~/.local/opt/node`, SHA-256 checked, symlinks in `~/.local/bin` (already on your PATH). Command below |
| 2 | Project npm packages (local to the repo, nothing global) | pinned | See the list below | `npm install` in `/home/zhengyew/telelean` |
| 3 | VS Code test build | 1.140.0 (349 MB) | Integration tests run in an isolated copy | Auto-downloaded into `packages/extension/.vscode-test/` on the first test run |
| 4 | `telelean-extract` | built from source | Lean facts | Auto-built with your Lean 4.35.0 into extension storage (231 MB) |

**npm packages (exact pins):**
- *Build:* `typescript@6.0.3`. Not 7.x, whose native port breaks typescript-eslint.
- *Bundling:* `esbuild@0.28.2`, `vite@8.3.5`, `@vitejs/plugin-react@6.1.2`.
- *UI:* `react@19.3.1`, `react-dom@19.3.1`, `zustand@5.0.16`, `@atlaskit/pragmatic-drag-and-drop@4.0.0` (+ `-auto-scroll@3.2.1`, `-hitbox@3.0.0`), `shiki@4.5.0`, `@vscode/codicons`.
- *Claude:* `@anthropic-ai/claude-agent-sdk@0.3.316`, which pulls its ~330 MB native Claude Code binary as an optional dependency; plus `zod@4.6.7`, `@modelcontextprotocol/sdk@^1.29`, `@anthropic-ai/sdk` (peer).
- *Core:* `diff@9.0.0`.
- *Tests:* `vitest@5.0.5`, `@playwright/test@1.64.1` (uses your Chrome), `@vscode/test-cli@0.0.15`, `@vscode/test-electron@3.1.0`, `@types/mocha@10.0.10`.
- *Types:* `@types/vscode@1.140.0` (must not exceed your VS Code), `@types/node@24.19.2`, `@types/vscode-webview@1.57.5`.
- *Packaging and lint:* `@vscode/vsce@4.1.0`, `eslint@10.14.0`, `@eslint/js@10.0.1`, `typescript-eslint@8.72.1`.

**Optional:**

| Software | Why | How |
|---|---|---|
| **xvfb** | Headless integration tests. Without it, a VS Code window pops up during test runs (D-31) | `sudo apt install xvfb` (you run this) |

**Not needed:** `socat` (no agent shell, so the SDK sandbox is unused), Docker, Mathlib, `uv`/lean-lsp-mcp, pnpm, a global `claude` CLI, extra Playwright browsers.

**Already installed and used:**
- Lean 4.35.0 / Lake 5.0.0, which bundle `leanchecker`, `leanexport` and `lake comparator`; elan 4.2.3
- bubblewrap 0.9.0, git 2.43, Google Chrome 155
- VS Code 1.140 with the Lean 4 extension, and the Claude Code extension with your login

**Node install command** (from research; the checksum was verified against nodejs.org's SHASUMS256.txt):
```bash
mkdir -p ~/.local/opt ~/.local/bin && cd ~/.local/opt \
 && curl -fsSLO https://nodejs.org/dist/v24.22.2/node-v24.22.2-linux-x64.tar.xz \
 && curl -fsSL https://nodejs.org/dist/v24.22.2/SHASUMS256.txt | grep ' node-v24.22.2-linux-x64.tar.xz$' | sha256sum -c - \
 && tar -xJf node-v24.22.2-linux-x64.tar.xz && ln -sfn node-v24.22.2-linux-x64 node \
 && for b in node npm npx corepack; do ln -sfn ~/.local/opt/node/bin/$b ~/.local/bin/$b; done
```

**How you will run it once v1 is built** (full directions come with the implementation):
1. Install Node with the command above.
2. In `/home/zhengyew/telelean`: `npm ci && npm run build`. This builds the core, webview and extension bundles.
3. In VS Code: **Developer: Install Extension from Location…** → pick `/home/zhengyew/telelean/packages/extension`, then reload the window.
4. Open any Lean folder, e.g. `mental_model/`, and run **telelean: Open Board** (or **telelean: Initialize Model Here** in an empty folder).

Your Claude Code login is used automatically; there is no key to enter. To update after a code change: `npm run build`, then **Developer: Reload Window**. For development, F5 opens an Extension Development Host on `mental_model/`.

---

## 13. Resource budget (per your RAM instruction)

| Process | Approx. RAM | When |
|---|---|---|
| Extension host + board webview | 0.3–0.5 GB | Always while open |
| `lake build` of a small model | about 0.5 GB | Per refresh, one at a time |
| `telelean-extract` | about 0.5 GB | Per refresh |
| Claude Code process | 0.3–0.5 GB | During a run |
| VS Code test instance | about 1 GB | Integration tests only |
| Headless Chrome (Playwright) | about 0.5 GB | Webview tests only |

Expected peak during development is about 3 GB; about 37 GB is free now. The sandbox has a hard 4 GB cap per agent-code build. Disk is about 1.6 GB in total: `node_modules` about 0.8 GB including the Claude binary, the test build 0.35 GB, the extractor 0.23 GB, Node 0.1 GB.

---

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| **Formalisation gap**: kernel acceptance says nothing about meaning | Two-phase sign-off, an independent back-translation, a notation-off view, definitions require endorsement, vacuity flags. Kept visible, never claimed solved |
| **Inconsistent assumptions** → vacuous proofs | Per-theorem assumption sets, consistency certificates (v1.5), a "derive False" probe |
| Building agent Lean = **arbitrary code execution** | No agent shell; bwrap sandbox with no network, no `$HOME` and a memory cap; G0 lint; fail closed |
| **Subscription policy** | Personal use only, on the unmodified binary, never touching credentials. API-key backend before sharing (D-23) |
| **Lean API drift** (extractor, comparator are brand new in 4.35) | Exact toolchain pin, per-toolchain extractor, CI fixtures on upgrade, fall back to syntactic-only mode if the extractor fails |
| **SDK 0.x churn** / proprietary licence | Exact pin, `LlmBackend` abstraction, fake backend for tests |
| **VS Code ships weekly** (the snap auto-updates) | `engines` and `@types/vscode` pinned to 1.140; integration tests also against "stable" |
| **Comment edits re-elaborate files**; line shifts rebuild dependents | Layout in the sidecar; batched edits; topic modules as models grow |
| **Sign-off fatigue** | Ask only for user nodes, new DEFINITIONs and proposed assumptions; hash-bound so unchanged sign-offs persist |
| The **snap environment leaks into child processes** | Environment sanitizer for every spawn (verified list of leaked variables) |

---

## 15. Side effects of the research phase (disclosure)

- One research agent accidentally triggered a Mathlib project template, which added **about 450 MB (9,028 files) to `~/.cache/mathlib`** (01:33–01:34 today). It also appended **8 scratch-path lines to `~/.elan/known-projects`**.
- Nothing was deleted. Undo for the cache: `find ~/.cache/mathlib -maxdepth 1 -type f -newermt '2026-11-01 01:32' -delete`. Check first that no other session of yours fetched Mathlib in that window.
- No toolchains, packages or global tools were installed.
- I read `~/telelean_scripts/*.lean` (read-only) to understand your formalisation style.

---

## 16. Key sources

- Claude Agent SDK: overview, permissions, user input, custom tools, hooks, sessions — `https://code.claude.com/docs/en/agent-sdk/`; authentication `…/authentication`; legal & compliance `…/legal-and-compliance`; npm `@anthropic-ai/claude-agent-sdk` 0.3.316
- Lean 4.35.0 release notes (lake comparator, lake check, leanchecker, native_decide changes): `https://lean-lang.org/doc/reference/latest/releases/v4.35.0/`; `Lean/Util/CollectAxioms.lean`; `lake help comparator`
- VS Code API: webviews, `vscode.changes`, provider merge semantics in `@types/vscode` 1.140.0; bundling and testing guides at `code.visualstudio.com/api`
- Prior art: learnharness (`github.com/amosblomqvist/learnharness`, AGPL, ideas only), leanblueprint, LeanArchitect (ITP 2026), Argdown, GSN v3, Toulmin; faithfulness literature ("The Faithfulness Gap", arXiv 2606.16541; roundtrip verification, arXiv 2604.25031)
- Full per-topic reports with every finding, its evidence and confidence: `../subagent_reports/research_workflow/agents/*.md`
