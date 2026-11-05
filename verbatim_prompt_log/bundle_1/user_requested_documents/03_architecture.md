# 03 — Architecture and software to install (Step 3)

*Answers Implementation step 3 (S49, S50) and the request to represent nodes programmatically (S34). It assumes the recommendations in `02_design_decisions.md`; overriding a ★ there changes the matching section here. Revised after the independent review (`../subagent_reports/review_workflow/DISPOSITIONS.md`). Evidence labels: **ran** = executed on this machine, **read** = read from source, **documented** = official docs, **designed** = not yet exercised. Revised again after a two-agent verification pass (`../subagent_reports/verification_workflow/`).*

> **Prototype profile (personal use).** For your prototype (M1–M2), only the integrity checks and cheap safety listed under "Prototype profile" in `02_design_decisions.md` are built. Passages marked **[H]** describe hardening deferred to the optional milestone H.

---

## 0. At a glance

```
┌──────────────────────────────── VS Code 1.140 (snap) ─────────────────────────────────┐
│  telelean board (editor tab, React webview)    subject: [Spyro ▾]                     │
│  ┌ Assumptions ─────┐┌ Derivations ─┐┌ Goals ───────┐   Lean editors (lean4 extension) │
│  │ ▸ Vocabulary (+3)││  card        ││  card        │   + docstring mirror: hover      │
│  │  card ●──────────┼┼─▶ card ──────┼┼─▶ card      │     shows your sentence          │
│  │  card            ││              ││              │   (M4: id completion, go-to-node,│
│  └ (scrolls) ───────┘└ (scrolls) ───┘└ (scrolls) ───┘    "Show in map" CodeLens)       │
│  [ tray:  A1  A2  A3  ⊢ [G]   presupposes: characters, games exist  ▶ These suffice ] │
│  [ agent thread: progress · question cards · review (meaning first) · "Ask Claude…" ] │
│  [ prompt box:  (Assumption | Derivation | Goal)  text…   stance · why?   Add …     ] │
│            ▲ typed messages: versioned snapshot / patch ▼ requests                   │
│ ─────────────────────────────── extension host (Node 24) ──────────────────────────── │
│  thin adapters: BoardPanel · EditService (WorkspaceEdit + Undo) · providers (M4)      │
│  @telelean/runner (no vscode): WorkspaceIndex · SemanticRunner · RunController ·     │
│     ShadowWorkspace · runLean (systemd-run + bwrap) · Gate G0–G6 · LlmHarness          │
│  @telelean/core: lex · parse · serialize · bind · graph · validate · diff · edits    │
└──────────────────────────────┼────────────────────────────────────────────────────────┘
                               ▼ spawns the unmodified Claude Code binary (your login)
                     Claude (your subscription)

 Model folder (opt-in: has .telelean/):  Model/<Subject>/*.lean with /- @@ telelean -/ blocks
   .telelean/ layout.json · decisions.json · attempts.jsonl · signoffs.json · attic/ ·
              graph.json (for your scripts) · frozen/ · sessions/
```

**Six principles**
1. **Lean files are the source of truth for nodes.** Everything else lives in `.telelean/`. Statuses are *derived* from Lean, never stored.
2. **The LLM is untrusted.** The Lean kernel and a deterministic gate decide what counts as proved. Nothing touches your files until you accept.
3. **Your words are the specification.** Natural language comes first. Your `natural_name` and `rationale` are never rewritten, and Claude's wording is always visibly marked as Claude's.
4. **One core library**, shared by the extension, the runner, `graph.json`, and any later CLI or LSP.
5. **Bounded resources** (your M1). There is one Lean job at a time, and every Lean process is sandboxed with a hard memory cap and no swap. telelean is opt-in per folder, and refreshes run only while the board is open.
6. **Usable early.** Milestones M0–M4: you start real use at M2 (§11).

---

## 1. Repository layout (`/home/zhengyew/telelean`)

```
telelean/
├─ package.json          npm workspaces ["packages/*"], private · .node-version 24.22.2
├─ packages/
│  ├─ core/      @telelean/core     pure TS, no vscode/Node APIs: markup, graph, validate, diff, edits, export, G0 token scan
│  ├─ runner/    @telelean/runner   Node-only, no vscode: WorkspaceIndex, SemanticRunner, ShadowWorkspace, runLean,
│  │                                Gate, RunController, LlmHarness (Claude SDK / CLI / Fake backends), AgentToolHost
│  ├─ extension/ telelean           VS Code adapters only: activation, BoardPanel, EditService, settings, (M4) providers
│  ├─ webview/   @telelean/webview  React 19 board (Vite → extension/dist/webview/)
│  └─ cli/       @telelean/cli      (M4) `telelean export|check|init|fmt|schema`
├─ lean/TeleleanTools/   facts extractor + (M3) model finder + Ramsey generator; pinned v4.35.0; copied into the extension at build
├─ test-fixtures/        Lean fixtures; exploit fixtures stored INERT as *.lean.txt, copied only into sandboxed shadows by tests
├─ mental_model/         sample model workspace (pending D-32)
├─ docs/                 markup-spec.md · user-guide.md · architecture.md
└─ verbatim_prompt_log/  (untouched; excluded from telelean's scanning)
```

The runner contains everything that matters: shadow, sandbox, gate, agent. Because it is free of `vscode`, the whole walkthrough can be tested end to end under vitest **without a display** (§10).

---

## 2. The programmatic node representation (S34)

```ts
type NodeType = 'ASSUMPTION' | 'DERIVATION' | 'GOAL';       // your three kinds (markup `type:`)
type Role = 'node' | 'vocabulary' | 'presupposition' | 'untracked';   // computed from Lean

interface TlNode {
  id: string; type: NodeType; role: Role; subject: string;
  naturalName: string; rationale?: string; body?: string;    // your words, verbatim
  asserted?: string;                                         // ISO date, written when you add the node
  stance?: 'believe' | 'rule' | 'supposing'; source?: 'observed' | 'reported' | 'inferred' | 'common';
  premises: string[];                                        // declared joint support
  supersedes?: string; refines?: string;                     // lifecycle (D-18)
  provenance: { wordedBy: 'user' | 'agent'; endorsed: boolean; origin: 'user' | 'agent'; session?: string };
  ext: Record<string, string>;
  loc: { file: string; range: Range; markupVersion: number };   // where the block lives
  lean: { binding: 'none' | 'adjacent' | 'pinned'; statement?: string /* n */; justification?: string /* n.holds */ };
  status: DerivedStatus;                                     // computed, never written to disk
}

interface DerivedStatus {                                    // a product of dimensions, not a ladder
  formal: 'informal' | 'formalized' | 'ill-formed';
  proof: { kind: 'none' } | { kind: 'assumed' } | { kind: 'pending-promotion' }
       | { kind: 'conditional'; on: string[] /* unproved nodes taken as hypotheses */ }
       | { kind: 'proved'; footprint: string[] /* node ids, incl. presup:<Lean name> ids */ };
  certificates: { consistency: Cert; nonVacuity: Cert; independence?: Cert };   // Cert = 'none'|'ok'|'refuted'
  flags: Array<'self-evident' | 'unselected-used' | 'claimed' | 'stale' | 'broken' | 'depends-on-removed'
             | 'no-rationale' | 'signoff-stale' | 'definitional-choice' | 'existence-commitment'>;
}

interface Edge { type: 'premise' | 'verified' | 'lean-ref'; source: string; target: string;
                 origin: 'declared' | 'lean'; where?: 'statement' | 'proof'; conditional?: boolean }
interface Attempt { id: string; target: string; premises: string[]; verdict: 'proved' | 'not-proved'
                    | 'insufficient' | 'inconsistent'; countermodel?: string; run: string; date: string }
```

**Building the graph.**
1. **Parse.** The markup blocks in the subject's `.lean` files are parsed, preferring open buffers to disk (milliseconds).
2. **Bind.** Each block is bound to its declarations: pinned `lean:` names win, otherwise adjacency.
3. **Merge Lean facts.** Facts from the semantic layer (§5) are merged, keyed by file hash so stale facts show as stale.
4. **Add Lean-only items.** Vocabulary, presupposition and untracked items come from declarations that have no block.
5. **Validate**, then compute statuses and edges.
6. **Publish.** A versioned patch goes to the board, and `.telelean/graph.json` is rewritten (D-27).

**`graph.json` schema** (format `telelean-graph` 1.0):
- `format`, `format_version`, `generator`, `semantic {available, lean_version, stale}`
- `subjects[]`
- `nodes[]`, with LSP-convention ranges (0-based, UTF-16)
- `edges[]`, `attempts[]`, `diagnostics[]`, and `files[]` with sha256

A JSON Schema ships with it. Additive changes are minor versions; breaking changes are major versions, and the previous major stays available for a while. Research prototyped and validated this schema with an example analysis script ("which assumptions does each goal rest on? which are unused?").

---

## 3. Markup language v1

### 3.1 Grammar and rules

```
block  = "/-" NL marker NL { field NL } [ "---" NL body ] "-/"
marker = "@@" ws "telelean" [ ws "v" digits ]       ; optional version; absent = v1 (no warning)
field  = key ws? ":" ws? value                       ; key = lcid { "." lcid } ; dotted = extension, preserved
value  = json-string | raw-text                      ; typed by the key's schema, never by appearance
```

- **Not YAML.** Raw text may contain `:`, `#` and quotes. A value starting with `"` is a JSON string.
- **Escaping, done by the serializer.** A value containing a comment delimiter, or starting with a quote, is written as a JSON string: `-/` becomes `-\/` and `/-` becomes `\u002f-` (backslash, `u`, `0`, `0`, `2`, `f`, then `-`). In the Markdown body they become `-\/` and `/\-`. A stray `/-` would swallow the rest of the file (ran), so round-trip tests check it.
- **Detection.** A plain `/- … -/` comment whose first non-blank line is the marker. `/--` and `/-!` are never used for blocks.
- **Binding.**
  - By adjacency: the next declaration after the block. Its docstring, attributes and modifiers may sit in between, and a blank line means code-less.
  - Once formalised, the binding is **pinned** with fully-qualified names (`lean: Spyro.cynder_not_good`), so inserted declarations cannot rebind a node.
- **Lexing.** The lexer respects Lean: comments nest, strings hide markers, `«…»` and raw strings are handled. Research verified 19 lexing cases plus 20 parser tests in a Python reference implementation.
- **Rules for `id`.**
  - Generated from `natural_name` (transliterated; fallback `n-<6 hex>`), unique per workspace, never changed implicitly.
  - Markup is UTF-8, and your sentences may be in any language; back-translations use the sentence's language.
  - A block without an `id` (like your S37 sketch) is accepted: telelean derives one, writes it back on the next edit or via a quick fix, and reports info TL112.

### 3.2 Fields

| Field | Meaning |
|---|---|
| `id` (required) | Stable node identity |
| `type` (required) | `ASSUMPTION` \| `DERIVATION` \| `GOAL`. `kind` is accepted as an alias |
| `natural_name` (required) | Your sentence, verbatim |
| `rationale` | Why you hold it (ASSUMPTION), or why you care (GOAL). Encouraged, never required |
| `stance`, `source` | Optional chips (D-14): stance and evidential source |
| `asserted` | ISO date written when you add the node, so indexicals like "new" stay interpretable |
| `premises` | Ids that jointly support this node |
| `lean` | Pinned binding (written by telelean once formalised) |
| `supersedes`, `refines` | Lifecycle links (D-18) |
| `tags`, `origin`, `session`, `worded_by` | Bookkeeping and provenance |
| `x.y` | Extension fields; `credence` etc. reserved (D-34) |
| body after `---` | Markdown notes. Rendered with raw HTML disabled and a URL sanitiser (http/https/mailto only) |

Not in markup: proof status (derived), layout and decisions (sidecars, D-12), and vocabulary (computed, D-3).

### 3.3 Example: your walkthrough, in the D-2(b) and D-3 conventions

These two files compile as shown (ran: `lake build`, 0.85 s, Lean 4.35.0). The `pg-no-dark-past` block is followed by a blank line, so it is a code-less node; with `stance: rule` its badge reads "no source yet".

`Model/Spyro/Vocabulary.lean`. The vocabulary is computed, so it needs no markup. Its docstrings are Claude's wording until you rewrite them:
```lean
namespace Spyro

/-- characters -/
axiom Character : Type
/-- games -/
axiom Game : Type
/-- there is at least one character -/
axiom Character.exists : Nonempty Character
instance : Nonempty Character := Character.exists
/-- there is at least one game -/
axiom Game.exists : Nonempty Game
instance : Nonempty Game := Game.exists
/-- has a dark past -/
axiom HasDarkPast : Character → Prop
/-- is rated PG -/
axiom IsPG : Game → Prop
/-- would be a good addition to -/
axiom GoodAddition : Character → Game → Prop
/-- Cynder -/
noncomputable opaque cynder : Character
/-- the new Spyro game -/
noncomputable opaque newSpyro : Game

end Spyro
```

`Model/Spyro/Main.lean`:
```lean
import Model.Spyro.Vocabulary

namespace Spyro

/-
@@ telelean v1
id: pg-no-dark-past
type: ASSUMPTION
natural_name: PG games cannot have characters with dark pasts
stance: rule
asserted: 2026-11-01
-/

/-
@@ telelean v1
id: cynder-dark-past
type: ASSUMPTION
natural_name: Cynder is a character who has a dark past
rationale: familiar with gaming lore
source: common
asserted: 2026-11-01
lean: Spyro.cynder_dark_past
-/
/-- Cynder is a character who has a dark past -/
abbrev cynder_dark_past : Prop := HasDarkPast cynder
axiom cynder_dark_past.holds : cynder_dark_past

/-
@@ telelean v1
id: new-spyro-pg
type: ASSUMPTION
natural_name: The new Spyro game is PG
rationale: known from gaming news
source: reported
asserted: 2026-11-01
lean: Spyro.new_spyro_pg
-/
/-- The new Spyro game is PG -/
abbrev new_spyro_pg : Prop := IsPG newSpyro
axiom new_spyro_pg.holds : new_spyro_pg

/-
@@ telelean v1
id: cynder-not-good
type: GOAL
natural_name: Cynder would not be a good addition to the new Spyro game
premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past
asserted: 2026-11-01
lean: Spyro.cynder_not_good
-/
/-- Cynder would not be a good addition to the new Spyro game -/
abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro

end Spyro
```

Under the **normative** reading, a run would formalise `pg-no-dark-past` and prove the goal:
```lean
abbrev pg_no_dark_past : Prop := ∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ GoodAddition c g
axiom pg_no_dark_past.holds : pg_no_dark_past
theorem cynder_not_good.holds : cynder_not_good :=
  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds
```
`#print axioms Spyro.cynder_not_good.holds` (ran): `[Classical.choice, Spyro.Character, Spyro.Game, Spyro.GoodAddition, Spyro.HasDarkPast, Spyro.IsPG, Spyro.Character.exists, Spyro.Game.exists, Spyro.cynder_dark_past.holds, Spyro.new_spyro_pg.holds, Spyro.pg_no_dark_past.holds]`.
That is one standard axiom, the signature, the two presuppositions, and exactly the three selected assumptions: the permitted set of D-5.

### 3.4 Validator (diagnostics in the board, `graph.json`, and in M4 also in Lean editors)
- **TL001–TL009** syntax/schema: parse error, duplicate id, dangling premise, unknown type, newer version, premise cycle.
- **TL011** info: ASSUMPTION without rationale.
- **TL013** hint: attach a following declaration?
- **TL101** bound declaration not found.
- **TL102** a node presented as proved depends on an unproved goal. This is a *warning* that sets `conditional`, and an *error* only in a proposal claiming proof.
- **TL103** a proof uses an axiom that is neither an ASSUMPTION nor allowed vocabulary.
- **TL104** a Prop axiom with no block (hidden assumption). Recognised presuppositions (`T.exists : Nonempty T` for a vocabulary sort) are exempt.
- **TL105** a GOAL is already proved: promote?
- **TL107** a proof uses assumptions outside the declared premises.
- **TL108** an existence commitment.
- **TL109** a declared premise is unused.
- **TL110** `autoImplicit` is on.
- **TL111** a vocabulary rule is violated (02 D-3: the simple shape check in the prototype; the full data-type rule in [H]).
- **TL112** info: block without `id` (a quick fix writes one).

---

## 4. Lean conventions and project scaffold

| Node state | Lean (D-2 option b) |
|---|---|
| Natural language only (any type) | Comment block only. No declaration, no `sorry` |
| Formalised statement | `abbrev n : Prop := S` |
| ASSUMPTION, formalised | `abbrev n : Prop := S` + `axiom n.holds : n` |
| DERIVATION / GOAL, proved | `abbrev n : Prop := S` + `theorem n.holds : n := proof`, footprint ⊆ allowed (D-5) |
| DERIVATION depending on an unproved goal | `theorem d.holds (h : g) : d := …` (explicitly conditional) |
| Vocabulary (computed) | Per 02 D-3: 0-ary `axiom T : Type`; predicates/relations over data types ending in `Prop`; `noncomputable opaque c : T` with the presupposition `axiom T.exists : Nonempty T` + instance (0-ary data sorts only); endorsed data-only `def`/`structure`/`inductive` |
| Structured facts (your records style, on request) | An endorsed data-only `structure`, an `opaque` instance, and an ASSUMPTION per field fact, e.g. `abbrev cynder_past : Prop := cynder.past = "dark"` + `axiom cynder_past.holds : cynder_past` |

**Kind changes** follow 02 D-11. Statements and names never change, and a `.holds` that others use is never removed until its replacement exists:
- G→D adds `theorem n.holds` once proved; G→A adds `axiom n.holds`; D→A turns the theorem into an axiom and archives the proof. Dependents are unaffected.
- A→D stays **pending**, keeping its axiom, until a proof exists.
- A→G and D→G list the affected dependents and offer a mechanical rewrite to an explicit hypothesis `(h : n)` (undoable), or leave them marked broken.

**Scaffold** (**telelean: Initialize Model Here**, which scaffolds an empty folder or just adds `.telelean/` to an existing Lake project, and offers `git init`):
```
lakefile.toml    name="Model"; [leanOptions] autoImplicit=false, relaxedAutoImplicit=false; [[lean_lib]] name="Model"
lean-toolchain   leanprover/lean4:v4.35.0        (exact; also the floor for runs and the gate)
Model.lean       root; imports each subject's root (maintained by telelean)
Model/<Subject>.lean · Model/<Subject>/{Vocabulary,Main,Inbox}.lean     (namespace <Subject>)
.telelean/       layout.json · decisions.json · attempts.jsonl · signoffs.json · attic/ · (gitignored) frozen/ sessions/ graph.json
.gitignore       /.lake  /.telelean/frozen/  /.telelean/sessions/  /.telelean/graph.json
```

---

## 5. Semantic layer (how telelean knows what Lean thinks)

**When.** Only in opt-in model folders (D-28), and only while that project's board is open. Saves are debounced, there is one job at a time, and a job lock is shared with shadow creation.

**How.** Every Lean process goes through **`runLean`** (§8.4). That covers your own refreshes too, because accepted code was written by the LLM:
- `systemd-run --user --scope -p MemoryMax=4G -p MemorySwapMax=0` around bwrap;
- a MemAvailable check before each spawn, and a "paused: low memory" badge.

**M1 facts.** `lake build`, then a **generated check file**: `#print axioms` with `pp.fullNames` for every bound declaration, plus `#check` probes, parsed from `lake lean <file> -- --json`. Names that fail to resolve fail closed. Lemma-level references come from `.ilean` files (read). This needs no compiled tool, and memory stays like a normal Lean process.

**M2+ facts** (`telelean-extract`). A small Lean program in `lean/TeleleanTools`, compiled on first use against the workspace's toolchain into extension storage (about 4 s; 231 MB binary; about 0.5 s and 475 MB RSS per run, ran by research with initializers enabled; to be re-measured with `loadExts := false` in M2). Its one-time compile uses a separate runLean variant: a writable tool directory and no shadow.
- **Per declaration** it emits:
  - kind, type hash, **statement-closure hash** (needed by G5), direct dependencies (statement vs proof)
  - axioms via `collectAxioms`, the D-3 rule check, sorry flags, docstring, ranges
- **Safety.** It imports untrusted modules **with initializers disabled** (`loadExts := false`). Pretty-printed statements for the review come from a separate rendering pass, run only inside the sandbox and only after G0 passes.
- **Fallback.** The interpreted fallback (`lake env lean --run`) costs about 1.6–2 GB RSS, so it is used one at a time and rarely.

**Live errors.** `vscode.languages.onDidChangeDiagnostics` gives instant badges for files open in editors.

**Scale** (ran): about 0.4 s per module build; 3,000 declarations extracted in about 1 s.

**Toolchains.** Only v4.35.0 gets runs and the gate. Other toolchains get the board in syntactic mode, with a banner.

---

## 6. Extension host (thin) and runner (everything else)

| Component | Responsibility |
|---|---|
| Activation | `workspaceContains:**/.telelean/layout.json`, `onWebviewPanel:telelean.board`, commands. Elsewhere it waits for **telelean: Initialize Model Here**, which also opts an existing Lake project in. Multi-root workspaces get one board per opted-in root. No untrusted or virtual workspaces |
| BoardPanel | `WebviewPanel` (editor tab, `retainContextWhenHidden`, find widget) + serializer. Typed protocol (versioned snapshot/patch, request ids, zod-validated input) |
| EditService | Every board action → core edit ops → `WorkspaceEdit`, **then save**. Keeps the inverse ops for **in-board Undo/Redo** and the toast's Undo |
| WorkspaceIndex (runner) | Watches `Model/**/*.lean` in opt-in roots. Default excludes: `.lake/`, `verbatim_prompt_log/`, `test-fixtures/`, `lean/TeleleanTools/`. Incremental parse per subject |
| SemanticRunner (runner) | §5 |
| RunController (runner) | §8: shadow, agent session, gate, proposal, accept/feedback |
| Settings | `telelean.model` (claude-opus-5-5), `.effort` (high), `.backend` (claude-agent-sdk \| claude-cli \| fake), `.claude.path`, run caps, `.sandbox.required` (true), `.memory.capGiB` (4), `.review.pauseWhenRisky` (false), `.docstringMirror` (true), `.git.snapshotRefs` (true), `.modelRoots`, `.exclude` |
| (M4) Lean-editor providers | Diagnostics, hover, id completion, go-to-node, id-only rename (returns undefined elsewhere so Lean's rename still works), CodeLens, quick fixes, TextMate injection. **Never** semantic tokens or formatters for `lean4` (read: VS Code would then replace Lean's) |

---

## 7. The board (webview UI)

**Rendering.** No graph library supports three independently scrolling viewports that share edges. That covers React Flow, Cytoscape.js, JointJS, Sigma.js and GoJS (surveyed). So the board is three plain scrollable DOM columns plus one **custom SVG edge overlay**. A vanilla prototype of exactly this was benchmarked at about 17 ms per frame with 2,510 nodes and 2,262 edges, and screenshot-tested in dark, light and high-contrast themes (ran in Chrome).

**Stack.**
- React 19 + zustand + CSS on `--vscode-*` variables, and `@vscode/codicons`.
- `@atlaskit/pragmatic-drag-and-drop`, which uses native HTML5 drag and never moves DOM, so cached edge geometry stays valid.
- **Shiki** for Lean code: it bundles vscode-lean4's own grammar and uses the JS engine (no WASM). M1 may start with a plain `<pre>`.

**Layout.**
```
<App>  store · HostBridge · ThemeWatcher · SubjectPicker
├─ <Toolbar>  search/filter · edges Auto|Focus|All · ancestors/consequences · legend
├─ <ProposalBanner>  "4 new · 3 changed · 1 moved"  n/p · Review… · Accept · Feedback · Discard · Raw Lean diff…
├─ <Board>  <EdgeLayer under/> <Column type=A|D|G>×3 <EdgeLayer over/> <EdgeBadges/>  (EdgeEngine, imperative)
│     A column: <VocabularyGroup/> (auto-expands "+3 new" in proposals) · cards
├─ <SelectionTray>  premise chips ⊢ [target slot]  · expanded obligation · [Self-evident?] / [These suffice ▶]
├─ <AgentThread>  progress · question cards (answer in place) · Review view · report card · composer "Ask Claude…"
└─ <PromptBox>  Assumption | Derivation | Goal · text · stance chips · why/where-from field · "Add assumption"
```

**Node card.**
- **Face:**
  - checkbox (select), your sentence (plain), and a "because: …" line, but only with *your* rationale;
  - **blue aura** if formalised, one proof glyph, certificate badges, ⚑ decision chips;
  - one "needs attention" badge.
  - Claude's wording appears *italic* with a marker. A test asserts that agent text never renders in user styling.
- **Expanded (chevron):** Lean code; "Depends on / Used by" buttons (which double as the screen-reader route); footprint including presuppositions; Attempts history; wording history; "Open in editor".
- Vocabulary items are box-shaped. Presuppositions carry one chip per type ("assumes characters exist"). Ghost assumptions are translucent with a "Claude suggests" marker; dashing is reserved for your declared support.

**Gestures** (D-17):
- click selects; chevron or Enter expands;
- drag within a column re-orders;
- dragging across columns reveals **labelled drop zones that state the impact**, and dropping elsewhere cancels;
- drag from a port draws a declared arrow;
- in-board Undo (Ctrl+Z when focused) plus an Undo toast;
- keyboard and context-menu equivalents, contributed as VS Code keybindings scoped to the board.

**EdgeEngine.**
- At most one rAF per change. Geometry is cached by ResizeObserver; only three `scrollTop`s are read per frame.
- Edges with both ends off-screen are culled. An edge with one end hidden becomes a stub plus a "▲ n linked / ▼ n linked" button.
- Focused nodes get full curves. Same-column loops go through the gutter, and joint premises meet at a junction dot.
- About 250 drawn edges per frame, prioritised.
- **Line pattern is reserved for epistemic status**: dashed means declared, solid means verified, and it holds in every mode.
- Diffs use colour plus a +/−/~ glyph plus a halo.

**Review view** (D-19). This is the single end-of-run review, done in place on the cards, with a stepper ("3 of 7"). In **M2** it shows your sentence beside the Lean statement, with the fully explicit toggle and the statement closure; **M3** adds alignment, the deterministic gloss and the back-translation. Each new or changed statement shows (full version):
- your sentence with aligned spans underlined; hovering shows the symbol and its type, and unaligned words are flagged ("not represented: *would*");
- the **deterministic gloss** ("Lean says");
- the independent back-translation;
- a toggle to the fully explicit form and the statement closure.

Proof status is revealed after the statements. Pure signature items are grouped and auto-approved, but revocable.

**Raw diff.** "Raw Lean diff…" opens VS Code's native multi-file diff (`vscode.changes`, read in 1.140) on a read-only `telelean-proposal:` file system.

**Accessibility, theming and safety.**
- **Roles.** Columns use ARIA `grid`/`treegrid` roles, so the interactive children stay reachable; `listbox`/`option` would hide them.
- **Theming.** Contributed theme colours (`telelean.node.formalizedAura`, …). High contrast uses outlines instead of glows. Reduced motion is honoured.
- **CSP.** Nonce-based, with no `unsafe-eval`. Shiki tokens are rendered via React, never `innerHTML`.
- **Untrusted content.** Markdown is rendered with raw HTML off and a URL sanitiser.
- **Virtualisation.** None in M1–M3: plain DOM scrolls 3,000 cards per column at 60 fps (ran in Chrome).

---

## 8. The LLM harness

### 8.1 The slot (S9)
```ts
interface LlmBackend { id: 'claude-agent-sdk' | 'claude-cli' | 'fake' | 'anthropic-api';
  caps: { builtinFileTools: boolean; subscriptionAuth: boolean; resume: boolean };
  startSession(cfg: SessionConfig): Promise<LlmSession>; }
interface LlmSession { send(turn: string): AsyncIterable<LlmEvent>; interrupt(): Promise<void>; close(): Promise<void>; }
interface AgentToolHost {                 // one implementation, used by every backend AND the fake
  check_lean(a): Promise<CheckResult>; ask_user(a): Promise<Answers>; propose_assumption(a): Promise<Adoption>;
  finish(a): Promise<GateVerdict>; }
```
- **FakeBackend** replays scripts of `{writeFile | edit | callTool}` steps *against the shadow*. The walkthrough test therefore exercises the real tools, gate and proposal logic.
- **Recorded stream.** One real SDK stream, recorded during M0/M2, is replayed in unit tests to catch SDK drift.
- **Later:** an API-key backend, needed before any sharing (D-23).

### 8.2 Claude backend (default: Agent SDK 0.3.316; fallback: CLI stream-json)
```ts
query({ prompt: userTurns,                            // AsyncIterable: feedback streams into the same session
  options: {
    cwd: shadowDir, model: 'claude-opus-5-5', effort: 'high',
    pathToClaudeCodeExecutable: resolvedBinary,       // resolved explicitly (below), never via import.meta.url
    systemPrompt: { type: 'custom', prompt: [STATIC_RULES, SYSTEM_PROMPT_DYNAMIC_BOUNDARY, projectContext] },
    settingSources: [], strictMcpConfig: true, mcpServers: { telelean: toolsFromHost(agentToolHost) },
    tools: ['Read','Glob','Grep','Edit','Write'],
    disallowedTools: ['Bash','WebFetch','WebSearch','Agent','AskUserQuestion','NotebookEdit'],
    allowedTools: ['Read','Glob','Grep','Edit','Write','mcp__telelean__*'],
    permissionMode: 'dontAsk',
    hooks: { PreToolUse: [realpathGuard], Stop: [requireFinish] },
    maxTurns: 80, abortController, verbatimPrompts: true, includePartialMessages: true, persistSession: true,
    env: { ...sanitize(process.env),                  // strip ANTHROPIC_API_KEY / _AUTH_TOKEN, CLAUDE_CODE_OAUTH_TOKEN,
                                                      // CLAUDE_CODE_USE_BEDROCK/_VERTEX/…, ELECTRON_RUN_AS_NODE, SNAP*, GTK_* …
           CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1', ENABLE_CLAUDEAI_MCP_SERVERS: 'false',
           CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS: '0', CLAUDE_AGENT_SDK_CLIENT_APP: 'telelean/0.x' } } })
```
- **Packaging: run in place** (read in VS Code 1.140):
  - "Developer: Install Extension from Location…" registers `packages/extension` *in place* (`installFromLocation` → scan → add to profile).
  - esbuild keeps `@anthropic-ai/claude-agent-sdk` **external**, and a build check asserts the bundle still contains a literal `import("@anthropic-ai/claude-agent-sdk")`.
  - Node resolves the SDK from the repo's `node_modules` (never install with `--omit=optional`).
- **Binary resolution:**
  - at activation, `createRequire(__filename).resolve('@anthropic-ai/claude-agent-sdk-linux-x64/claude')`;
  - fallbacks: setting → VS Code Claude extension binary (`getExtension('anthropic.claude-code').extensionPath + '/resources/native-binary/claude'`) → `~/.local/bin/claude`.
- **Auth preflight** before the first run:
  - run `<bin> --version`;
  - check the SDK's init message reports subscription auth, and refuse otherwise;
  - **this is unverified until the M0 spike**.
- **VSIX** (M4, optional): an `import.meta.url` shim for bundling, plus an explicit binary path. Personal use only.
- **CLI fallback** (`ClaudeCliBackend`), the learnharness pattern:
  - `claude -p --input-format stream-json --output-format stream-json --verbose …`, with the same tool and permission flags;
  - the same file-tool confinement, installed as a command PreToolUse hook via `--settings <file>`, or with the CLI itself inside bwrap. telelean fails closed if neither is active;
  - tools served from a loopback HTTP MCP server with a per-run bearer token;
  - the same AgentToolHost;
  - a minimum version checked via `--version`.

### 8.3 Agent tools

| Tool | Behaviour |
|---|---|
| `check_lean({files?})` | `files` are validated to lie inside the shadow and default to the run's targets. Runs G0 + sandboxed build + facts. Returns diagnostics, per-declaration footprints and rule violations, scoped to shadow model modules |
| `freeze_statements({targets})` | Ends formalising. Refused until G0, G1, G3 and the vocabulary rule pass. Then exports the exact snapshot, plus a generated challenge module declaring `theorem n.holds : n := sorry` per target, for G4. **Until it is called, `check_lean` rejects any proof body.** Re-freeze only on ghost adoption or feedback |
| `ask_user({questions[1–3]})` | Each question has a `phenomenon` tag (D-20); 2–4 options with plain consequences and optional formal previews; *Claude's guess* (shown only after you answer); free text; "Leave it open"; affected node ids. Blocks until answered, and the run clock pauses. Closing the board doesn't stop the run. After a window reload, the session resumes by `sessionId` and your answer arrives as the next user turn (M0 spike) |
| `propose_assumption({natural_name, lean_statement, why_needed})` | Must come with a gate-checked proof that it closes the gap. Becomes a ghost node you may adopt ("I hold this") |
| `finish({status, summary, gap?, conflict?, unused?, assumed_without_asking[]})` | Triggers the full gate and ends the turn (`_meta claude/endTurn`, with a Stop-hook fallback) |
| (M3) `certify({kind, …})` | The extension generates a read-only consistency/independence statement, and the agent fills the proof. Used only if the model finder fails |

**Why a custom `ask_user`?** Claude Code's built-in `AskUserQuestion` is denied under `dontAsk` and cannot carry affected nodes, phenomenon tags or scope. `ask_user` mirrors its shape, so the model uses it fluently.

**Context bundle.** The action; the target and selected nodes *verbatim*; the subject's node index; vocabulary; decisions; files; budgets. **All of this leaves the machine** (D-23), and a setting can scope the index to the target's neighbourhood.

### 8.4 Run protocol ("These suffice"; Formalise-first and "Ask Claude…" reuse it)
```
Preflight ─▶ Shadow ─▶ Formalise ⇄ ask_user ─▶ G0–G3 + vocabulary rules ─▶ freeze_statements ─▶ Prove ⇄ check_lean ─▶ finish ─▶ Gate ─▶ Review + Proposal
 opt-in root,  model files   vocab, abbrevs,       (refuse on violation)      leanexport of the     (agent-active caps)            G0–G6    meaning first, then
 v4.35, bwrap, only, no      .holds axioms                                    exact snapshot                                                proof status; Accept /
 memory ok     symlinks      (setting: pause here when risky → in-place review before proving)                                             Feedback / Discard
```
- **Shadow:** `~/.config/Code/User/globalStorage/<ext>/runs/<id>/ws`.
  - Agent-visible files are only `*.lean`, the lakefile, the toolchain and the manifest. Symlinked entries are refused when the shadow is built, and the proposal builder refuses anything that is not a regular file.
  - `.lake/build` is copied (on ext4 that is a full copy) and is visible only to sandboxed Lean processes, as are the read-only bound packages.
  - `git init` + a base commit inside the shadow give diffs and 3-way merges.
  - The last 10 runs are kept.
- **`realpathGuard`**, the PreToolUse hook. *Prototype: a containment check on the shadow path, plus symlink refusal at copy time. [H]: the full guard below.*
  - canonicalises every path, every glob base and every grep root;
  - requires each to resolve inside `realpath(shadow)`;
  - denies dotfiles, `.lake/` and `.telelean/`;
  - runs *before* any pattern rules;
  - rejects absolute Glob patterns and `..` segments, tests dotfiles relative to the shadow, and opens new files via the parent's realpath with `O_NOFOLLOW`.
- **`runLean`**, one wrapper for build, `lake lean --json`, extractor, leanchecker, leanexport and comparator:
  ```
  systemd-run --user --scope --unit=telelean-<run>-<n> -p MemoryMax=4G -p MemorySwapMax=0 -- \
  bwrap --ro-bind /usr /usr --ro-bind /etc /etc --symlink usr/lib /lib --symlink usr/lib64 /lib64 --symlink usr/bin /bin \
        --proc /proc --dev /dev --tmpfs /tmp --tmpfs /run --tmpfs $HOME --dir /root --dir /run/user --dir /var \
        --ro-bind ~/.elan ~/.elan --ro-bind <extractor dir> <same> \
        --ro-bind $SHADOW $SHADOW --bind $SHADOW/.lake $SHADOW/.lake --ro-bind <real>/.lake/packages $SHADOW/.lake/packages \
        --chdir $SHADOW --unshare-all --die-with-parent --new-session \
        --clearenv --setenv HOME $HOME --setenv PATH ~/.elan/bin:/usr/bin:/bin  lake build
  ```
  - It is an allowlist of mounts, with **no host `/run`** and **no inherited environment**. The review found the D-Bus session bus and the keyring reachable under the first profile (ran); the verifier confirmed the current one blocks them (ran).
  - `--dir /root --dir /run/user --dir /var` let `lake comparator`'s own nested sandbox start. Without them every solution would be "rejected"; with them comparator reports "Your solution is okay!" in about 3.25 s (ran by the verifier). A sandbox start-up failure is reported as "could not start", never "rejected".
  - The shadow's sources are read-only inside the sandbox, and only `.lake/` is writable. Real-workspace refreshes use the same profile, with sources read-only, `.lake/` writable and `.git` masked.
  - Cancel with `systemctl --user kill 'telelean-<run>-*'`.
  - It **fails closed** without bwrap or `systemd-run --user`. A `prlimit` fallback was dropped, because Lake cannot start threads under `RLIMIT_AS` (ran).
  - [H] **Socket probes** (D-Bus, ssh-agent, Wayland, network) are part of the exploit fixtures and must fail.
  - The research verified `systemd-run` + bwrap + elan + `lake build` from the snap extension host: about 0.8 s.

### 8.5 The gate (all mechanical)

| Step | What it does |
|---|---|
| **G0** | *Prototype:* token denylist: `initialize`, `#eval`, `run_cmd`/`run_elab`/`run_meta`, `#exit`, macros/syntax/`notation`/`elab`, `native_decide`/`decide +native`/`bv_decide`, `implemented_by`/`extern`/`csimp`/`unsafe`/`partial`, `set_option debug.*`, limit changes, new imports, lakefile/toolchain edits. *[H]:* an allowlist of top-level commands checked with Lean's parser, including `instance` limited to presupposition or endorsed instances, never with a `priority` |
| **G1** | Sandboxed build. Per-declaration time ≤ 10 s and RSS ≤ 1.5 GB |
| **G2** | [H] `leanchecker` kernel replay. Catches `debug.skipKernelTC` hacks that fool `#print axioms` (ran) |
| **G3** | Footprints ⊆ the permitted set (D-5). Vocabulary rule (D-3: the simple shape check in the prototype; the full data-type rule in [H]). No `sorryAx` in proved nodes. Initializers are never run |
| **G4** | `lake comparator --challenge-from-export frozen.ndjson`. The freeze is the exact snapshot plus a generated challenge module (`theorem n.holds : n := sorry` per target). `permitted_axioms` = std ∪ signature ∪ selected ∪ presuppositions of constants in the selected statements ∪ footprints of selected derivations, computed from the freeze. Catches a weakened goal, a same-name altered assumption, a smuggled axiom, an unselected assumption, and any axiom added after the freeze (ran). Sandbox start-up errors count as "could not start" |
| **G5** | Markup policy: your words byte-identical, ids stable, deletions or kind changes only as confirmed lifecycle items. [H] **Formal immutability**: every node formalised before the run and outside its change set keeps the same pinned names, kind, proof status and closure hash |
| **G6** | Flags: self-evident, unused selected premises, definitions on statement paths. Model-finder certificates: consistency, non-vacuity, independence for "insufficient" |

### 8.6 Outcomes, failures, caps
- **Proved.** Shows the footprint, including presuppositions, and the certificates; "consistency unchecked" until the model finder succeeds.
- **Insufficient.** Only with a countermodel, phrased as an answer: "No — here is a situation …". Otherwise **not proved**. Ghost assumptions are offered, and the attempt is recorded either way.
- **Inconsistent.** *An* inconsistent subset (minimisable).
- **Lean errors.** Bounded self-repair, with stall detection after 3 identical first errors, then "continue with more budget" (resume).
- **Caps.** 80 turns, 25 checks, and 20 min of *agent-active* time; the clock pauses while it waits on you. 120 s per Lean job.
- **Cancel.** Interrupt plus a scope kill; the shadow and transcript are kept.
- **Usage.** Tokens, the cost *estimate*, and rate-limit status.

**"Ask Claude…" requests:**
- `permitted_axioms` = all existing assumptions.
- Claude may add only ghost assumptions.
- Lifecycle changes (delete, merge, kind) appear as separate items, each needing your confirmation.

---

## 9. LSP, graph.json, CLI (S43; D-27)
- **No LSP now.** `.telelean/graph.json`, rewritten on every refresh (M1), is the interface for your scripts.
- **M4:** CLI `telelean export|check|init|fmt|schema` (check supports `--format text|json|gnu|sarif`), plus the in-process Lean-editor providers.
- **Later:** a thin LSP adapter, if you want the markup in Neovim or Emacs.

---

## 10. Testing (S52)

| Layer | Tooling | Covers |
|---|---|---|
| Core unit | vitest | Lexer edge cases, serializer round-trips (including `-/` and `/-`), binder (pinning), validator, status product, graph diff, G0 allowlist. Port of the 20 research tests and the 19 lexing cases |
| Lean fixtures | vitest → runLean (toolchain v4.35.0) | Statuses and footprints on `basic`/`spyro`. **Prototype:** sorry, extra axiom, weakened goal, unselected assumption, and `#eval`/`run_cmd` are rejected; builds have no network and no `$HOME`. **[H]:** the full exploit suite (native_decide, skipKernelTC, same-name altered assumption, Prop-carrying vocabulary including the `PropSort`/`PresupSmuggle` cases, `Sort u`, definitional smuggling, notation, `initialize`, limit raising, rebinding) and socket probes (D-Bus, ssh-agent, Wayland) |
| Walkthrough end-to-end | vitest + runner + FakeBackend (**no display**) | S18–S33. **M2:** normative reading → proved, then G→D; literal reading → "not proved", ghost adopted, re-freeze, proved. **M3:** the literal branch also shows the kernel-checked countermodel; plus the negation-strength and "would" questions |
| Webview | Playwright with your installed Chrome 155 (`workers: 1`) | Board, tray (0 premises, target slot), A/D/G box, drop zones and Undo, edge stubs, review view (alignment), provenance styling, themes |
| Extension smoke | `@vscode/test-cli` + `@vscode/test-electron` (VS Code 1.140 test build) | Activation (opt-in), board, Add writes a block, Accept and Undo. Run as `env -u ELECTRON_RUN_AS_NODE` (snap gotcha) under xvfb, Xephyr or a visible window (D-31) |
| Manual | Real Claude | M0 smoke test (with your permission); the M2 walkthrough |

Everything runs **sequentially** (vitest `fileParallelism: false`, Playwright `workers: 1`), with a `free -m` check, per your RAM instruction.

**"Good enough to start using"** is milestone M2: everything in the M1–M2 rows of §11 works on `mental_model/`, the tests for those rows pass, and the real-Claude walkthrough succeeds. I'll then give you directions and continue with M3/M4.

---

## 11. Milestones

| Milestone | Contents |
|---|---|
| **M0 — spikes (1–2 days)** | SDK in the extension host; the basic runLean wrapper (memory cap + sandbox), with `lake comparator` running under it; the board prototype in a real webview; resuming after a reload during a pending question; one smoke test if D-23b = yes |
| **M1 — map without AI** (first usable) | Core library; runLean + memory guard; Initialize command; board (3 columns, vocabulary group, cards, expand-to-Lean, aura and glyphs, declared + verified arrows); A/D/G box with stance and why; edit text/rationale; delete; drag re-order; kind changes per D-11 (A→D stays pending until you write a proof); Undo; tray; refresh via build + check file; `graph.json` |
| **M2 — one-shot "These suffice"** (**start real use here**) | Shadow + Claude (SDK) + fake backend; tools `check_lean`/`ask_user`/`freeze_statements`/`propose_assumption`/`finish`; freeze + prototype gate; minimal review (sentence beside Lean, explicit toggle); proposal overlay + raw diff + report card; Accept / Feedback (text field) / Discard; minimal ghost adoption; attempts history |
| **M3 — faithfulness** | Full review (alignment, gloss, back-translation); model finder (consistency, non-vacuity, countermodels); DECISIONs; refine/supersede/merge/suspend; Formalise-first; full "Ask Claude…"; anti-goals; pause-when-risky |
| **M4 — integration** | Lean-editor features; CLI + JSON Schema; Shiki and accessibility polish; full test-electron suite; optional VSIX; Mathlib opt-in |
| **H — hardening** (optional, any time after M2) | Symlink-proof file-tool guard; audited sandbox profile with socket isolation; full vocabulary data-type rule; `leanchecker`; formal immutability; exploit-fixture suite |

---

## 12. Software to install

**Required, no sudo:**

| # | Software | Version | Why | How |
|---|---|---|---|---|
| 1 | **Node.js** (bundles npm 11.19.1) | **24.22.2 LTS** | Build, test, run. Same major as VS Code 1.140's extension host (Node 24.21) | Command below: official tarball into `~/.local/opt`, verified against the published checksum *and* the literal hash recorded by research |
| 2 | npm packages (repo-local; nothing global) | pinned exactly (lockfile) | See below | `npm ci` |
| 3 | VS Code test build | 1.140.0, 349 MB | Extension smoke tests | Auto-downloaded on the first test run into `packages/extension/.vscode-test/` |
| 4 | `telelean-extract` | built from source | Lean facts (M2+) | Built with your Lean 4.35.0 into extension storage (231 MB) |

**npm packages:**
- *Build:* `typescript@6.0.3` (not 7.x, whose native port breaks typescript-eslint), `esbuild@0.28.2`, `vite@8.3.5`, `@vitejs/plugin-react@6.1.2`.
- *UI:* `react@19.3.1`, `react-dom@19.3.1`, `@types/react@19.3.0`, `@types/react-dom@19.3.0`, `zustand@5.0.16`, `@atlaskit/pragmatic-drag-and-drop@4.0.0` (+ `-auto-scroll@3.2.1`, `-hitbox@3.0.0`), `shiki@4.5.0`, `@vscode/codicons@0.0.46-24`.
- *Claude:* `@anthropic-ai/claude-agent-sdk@0.3.316`, whose platform package brings its own ~330 MB Claude Code binary. Its peer dependencies are pinned at install to the newest versions satisfying the SDK's ranges: `zod@4.6.7`, `@modelcontextprotocol/sdk` 1.x (≥ 1.29), `@anthropic-ai/sdk` (≥ 0.93).
- *Core:* `diff@9.0.0`, `ajv@8.20.0` (schema tests).
- *Tests:* `vitest@5.0.5`, `@playwright/test@1.64.1` (uses your Chrome; no browser download), `@vscode/test-cli@0.0.15`, `@vscode/test-electron@3.1.0`, `@types/mocha@10.0.10`.
- *Types:* `@types/vscode@1.140.0` (must not exceed your VS Code), `@types/node@24.19.2`, `@types/vscode-webview@1.57.5`.
- *Lint:* `eslint@10.14.0`, `@eslint/js@10.0.1`, `typescript-eslint@8.72.1`.
- *Packaging (M4, optional):* `@vscode/vsce@4.1.0`.

**Optional, choose one for headless extension tests (D-31):**
- **xvfb**: `sudo apt install xvfb` (you run this);
- the already-installed **Xephyr** (nothing to install);
- visible windows.

**Not needed:** `socat` (the agent has no shell), Docker, Mathlib, `uv`/lean-lsp-mcp, pnpm, a global `claude`, extra Playwright browsers.

**Already installed and used:**
- Lean 4.35.0 / Lake 5.0.0 (with `leanchecker`, `leanexport`, `lake comparator`), elan 4.2.3
- bubblewrap 0.9.0, systemd user manager (`systemd-run --user`), git 2.43, Google Chrome 155, Xephyr
- VS Code 1.140 + the Lean 4 extension + the Claude Code extension (your login)

**Node install command:**
```bash
mkdir -p ~/.local/opt ~/.local/bin && cd ~/.local/opt \
 && curl -fsSLO https://nodejs.org/dist/v24.22.2/node-v24.22.2-linux-x64.tar.xz \
 && echo "48cc0e21e048790e54c0cf5749c2725005313d652651c40b7a21feb9697aaf75  node-v24.22.2-linux-x64.tar.xz" | sha256sum -c - \
 && curl -fsSL https://nodejs.org/dist/v24.22.2/SHASUMS256.txt | grep ' node-v24.22.2-linux-x64.tar.xz$' | sha256sum -c - \
 && tar -xJf node-v24.22.2-linux-x64.tar.xz && ln -sfn node-v24.22.2-linux-x64 node \
 && for b in node npm npx corepack; do ln -sfn ~/.local/opt/node/bin/$b ~/.local/bin/$b; done
```

**How you'll run it (from M1):**
1. `npm ci && npm run build` in `/home/zhengyew/telelean`.
2. In VS Code: **Developer: Install Extension from Location…** → `/home/zhengyew/telelean/packages/extension`, then reload.
3. In a model folder (e.g. `mental_model/`): **telelean: Initialize Model Here** (first time), then **telelean: Open Board**.

**Updating** is `npm run build` plus **Developer: Reload Window** in the model window. Develop through F5 (an Extension Development Host on `mental_model/`), so reloads never restart the window where your coding agent runs.

---

## 13. Resource budget (your M1)

| Process | RAM | When |
|---|---|---|
| Extension host + board | 0.3–0.5 GB | While open |
| `lake build` (small model, sandboxed) | about 0.5 GB | Per refresh, one at a time |
| Check file (M1) / compiled extractor (M2+) | about 0.5 GB | Per refresh |
| Interpreted extractor fallback | **1.6–2 GB** | Rare, one at a time |
| Claude Code process | 0.3–0.5 GB | During a run |
| VS Code test instance / headless Chrome | about 1 GB / about 0.5 GB | Tests only, never together |

- **Hard caps.** Every Lean process gets 4 GB with **no swap** (`MemorySwapMax=0`), because the cgroup default would otherwise spill into your 8 GB of swap. Refreshes pause if MemAvailable is low.
- **Peak.** Expected peak during development is about 3 GB (about 36 GB free now).
- **Disk.** About 1.6 GB, plus shadow copies (10 kept; full copies on ext4).

---

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| **The Claude path is unverified end to end** (no Node yet) | M0 spike + auth preflight before any UI work; CLI fallback backend |
| **Formalisation gap**: kernel acceptance ≠ meaning | Meaning-first review (alignment, deterministic gloss, back-translation, explicit view); definitions in statement closures need endorsement; vacuity and consistency certificates. Kept visible, never claimed solved |
| **Smuggling via vocabulary or definitions** (verified exploits) | D-3 structural rules in G3; presuppositions explicit; closure-hash immutability (G5); exploit fixtures |
| **Inconsistent or vacuous assumptions** | Model finder (M3); "consistency unchecked" label until then |
| **Agent Lean = code execution; the agent's file tools run outside the sandbox** | Prototype: no shell, a copy of the model files, diff review, and a basic memory-capped sandbox for every Lean process. [H]: realpath/`O_NOFOLLOW` guard, audited mount allowlist with no host `/run`, socket probes |
| **Subscription policy** | Personal, human-in-the-loop use only; exact texts saved; caps; API-key backend before sharing (D-23) |
| **Lean API drift**; comparator is new in 4.35 | Exact pin and floor; per-toolchain extractor; fixtures on upgrade; syntactic mode otherwise |
| **SDK 0.x churn** / proprietary licence | Exact pin; LlmBackend abstraction; recorded-stream replay tests; never vendored or published |
| **VS Code ships weekly** (the snap auto-updates) | `engines`/`@types` pinned to 1.140; smoke tests also against "stable" |
| **Sign-off fatigue** | Auto-approve pure signature; group vocabulary; risk-sorted review; only one review per run |
| **The snap environment leaks into children** (ELECTRON_RUN_AS_NODE, SNAP*, GTK_*) | Sanitiser on every spawn |

---

## 15. Side effects of this turn's research and review (disclosure)

- **Mathlib cache.** One research agent accidentally triggered a Mathlib project template, which added **9,028 files (about 450 MB) to `~/.cache/mathlib`** (01:33–01:34 today; nothing after).
- **elan's project list.** Research and review agents' Lean projects added **28 lines to `~/.elan/known-projects`** (all paths inside this session's scratchpad). Your own 9 entries are untouched.
- Nothing was deleted, and nothing was installed (no toolchains, packages or global tools).
- **Undo commands**, which I have not run:
  ```bash
  find ~/.cache/mathlib -maxdepth 1 -type f -newermt '2026-11-01 01:32' ! -newermt '2026-11-01 01:40' -delete
  cp ~/.elan/known-projects ~/.elan/known-projects.bak && sed -i '/03a29d54-7342-40e3-b5f0-2697a62c93ef/d' ~/.elan/known-projects
  ```
- I found `~/telelean_scripts/` through the files your Lean server had open, and read all five sketches there (read-only) to understand your formalisation style.
- Exploit probes written by research and review agents are kept in `bundle_1/subagent_reports/**/artifacts/`, renamed to `*.lean.txt`, so opening them never makes the Lean extension execute them.

---

## 16. learnharness: borrowed vs deliberately different (S44)

| Borrowed (ideas only; learnharness is AGPL, so no code) | Deliberately different |
|---|---|
| Joint premise sets as the stored truth, with arrows derived and drawn through a junction dot | Lean files are the store, not JSONL, and verification is by the kernel, not by LLM auditors |
| Layout in a non-semantic sidecar with a format version | The graph is *your beliefs*, not extracted facts, so presence ≠ endorsement and agent text is visibly marked |
| Submit-style tools that return validation errors to the model | A gate with kernel checks, freeze and sandbox, beyond schema validation |
| A held ask-user tool; honest "estimate" labels for billing | Questions tagged by pragmatic phenomenon, with no pre-selected answer and recorded scope |
| Driving the official Claude Code binary, never touching credentials | The Agent SDK as the default backend, with learnharness's CLI pattern as the fallback |
| *Lesson:* full-sentence labels became unworkable on their canvas | Cards wrap full sentences in columns. An optional short `label` (like your h1/h2) is reserved (D-34) |

---

## 17. Key sources

- **Policy, saved byte-exact on 2026-11-01:** `../subagent_reports/policy_sources/` (Agent SDK overview, legal & compliance, authentication, Consumer Terms).
- **Claude Agent SDK docs** (`code.claude.com/docs/en/agent-sdk/…`): permissions, user input, custom tools, hooks, sessions. npm `@anthropic-ai/claude-agent-sdk` 0.3.316.
- **Lean 4.35.0 release notes** (comparator, `lake check`, leanchecker, the native_decide change); `Lean/Util/CollectAxioms.lean`; `lake help comparator`.
- **VS Code API:** webviews, `vscode.changes`, the provider-merge semantics in `@types/vscode` 1.140.0, `installFromLocation` in 1.140's shared process; the bundling and testing guides.
- **Prior art:** learnharness, leanblueprint, LeanArchitect (ITP 2026), Argdown, GSN v3, Toulmin; the faithfulness literature (arXiv 2606.16541, 2604.25031).
- **Full research and review reports:** `../subagent_reports/`.
