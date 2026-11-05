# M1 plan: the map without AI

*Architect's plan for milestone M1 (2026-11-01, turn 9), corrected the same day by an independent plan review (section 15 lists every change the review made, with the evidence). Builders implement the work packages in section 9 in parallel against the frozen contracts in section 5; an integrator then wires and tests end to end (section 11). The user may read it later to review the smaller design decisions (section 13). Notes marked "(fix)" were added after the M1 verification, when the fixers corrected the core and runner behaviour they describe (details in `docs/decisions-log.md` section 10).*

**Design sources, in order of precedence:** the user's turn-9 requests (quoted in section 1.3); `docs/design-amendments.md` (A1–A8); `docs/m0-report.md` ("Design changes learned in M0"); `verbatim_prompt_log/bundle_1/user_requested_documents/02_design_decisions.md` (D-1…D-34, Prototype profile); `…/03_architecture.md`.

**Safety rules for everyone working on M1 (from the user, verbatim in spirit):** never push to any remote, add remotes or use `gh`; never publish anything or send anything to a person (no email, chat, upload, pastebin, web API posts); network only for reading docs; no downloads and no new npm packages (report a need instead); never run the Claude CLI with a prompt; never read credentials; write only inside your owned paths and your scratch dir; no sudo, no global installs, no `npm install`; never touch the user's VS Code settings/extensions, `~/telelean_scripts`, `~/.config`, `~/.claude`, `~/.elan`, git global config; do not run git in `/home/zhengyew/telelean` itself; tests that launch Chrome or VS Code use an isolated HOME/XDG dirs and `ulimit -c 0` (section 10); at most one heavy process at a time, `LEAN_NUM_THREADS=4`, never build Mathlib, kill only your own processes; call the toolchain binaries directly (`~/.elan/toolchains/leanprover--lean4---v4.35.0/bin/{lake,lean}`); git only in test repositories under a scratch dir, always with `-c commit.gpgsign=false -c core.hooksPath=/dev/null` and an explicit author; never commit a `.telelean/config.json` outside `mental_model/` and `test-fixtures/` (it would make the user's own VS Code find a spurious model root; tests create it in their scratch copies); report every effect outside the repo.

---

## 0. What exists after the architect's and the reviewer's steps

- **Frozen contracts in code** (section 5): `packages/core/src/{model,facts,actions,paths,layout,kindChange,protocol,notImplemented}.ts`, `packages/core/src/{markup,project,edit,export}/` (types + stubs), the extended Spyro sample, `packages/runner/src/{semantic,workspace}/` (types + stubs), runner `index.ts`, runner `tsconfig.json`/`vitest.config.ts` (core resolved from source).
- **Implemented with the contract** (so nobody waits on anyone): the protocol validators (`protocol.ts`), D-11 drop-zone impacts (`kindChange.ts`), layout.json helpers (`layout.ts`), path conventions (`paths.ts`), `runExclusive` and `readMemAvailableBytes` (runner `semantic/index.ts`) by the architect; `subjectScaffold` (`edit/index.ts`, the exact texts of section 7.1, verified to build on Lean 4.35) by the reviewer, because WP2 (create-subject) and WP4 (Initialize, the sample) both need identical text.
- **Stubs** throw `NotImplementedError` (`core/src/notImplemented.ts`). A test that needs another package's implementation can gate itself with `describe.skipIf(!isImplemented(() => parseLeanFile('X.lean', '')))`; the integrator removes such gates.
- **Reading fixtures in core tests**: core is typechecked with `types: []` (no `node:fs`, on purpose), so core tests import fixture files as strings with Vite's `?raw` suffix (`import text from '../../../../test-fixtures/spyro/Model/Spyro/Main.lean?raw'`; JSON: `?raw` + `JSON.parse`). `packages/core/test/raw-imports.d.ts` (shared, integrator-owned) declares the module type; verified with `tsc` and vitest 5.0.5.
- **Checks after the review (real output):** core `npm test` 38/38 passed (3 files, includes the new `subjectScaffold` tests); `tsc` clean for runner, webview (both configs) and extension; webview `vitest run` 24/24 and extension `vitest run` 4/4. The architect's earlier run: runner `vitest run` 140/140 (68 s; the review changed only runner types and docs, and `tsc` passes). Not run by either: webview Playwright and the VS Code smoke test (they rebuild `packages/extension/dist`).

---

## 1. Scope checklist

Every M1 item, each mapped to a work package (WP1–WP6, section 9) and a test. "AT" = acceptance test listed in that WP.

### 1.1 The M1 row of 03 §11 / D-29

| # | Item | Built by | Test |
|---|---|---|---|
| 1 | Core library: markup lexer, parser, serializer, binder, markup validator | WP1 | AT1.1–1.9: ported research tests + the lexing cases of `gen_lex_tests.py`, round-trip incl. `-/` and `/-` |
| 2 | Core library: graph build, statuses (D-15), vocabulary (D-3), edges (D-13), Lean/graph validator, edits, graph.json | WP2 (+WP1 text primitives) | AT2.1–2.12 |
| 3 | runLean + memory guard (MemAvailable before each spawn, "paused: low memory") | WP3 (runLean exists from M0) | AT3.4, AT3.5 |
| 4 | Initialize command (scaffold or add `.telelean/`, offer `git init`) | WP4 (`inspectFolder`, `planInitialize`, `initGitRepository`) + WP5 (command, prompts) | AT4.6, AT5.3 |
| 5 | Board: 3 columns (M0), vocabulary group, cards, expand-to-Lean (with "Depends on / Used by", 03 §7), aura and glyphs, declared + verified arrows, legend (D-15; M0's legend gains the conditional and mismatch arrows) | WP6 (UI) on WP2 data | AT6.1–6.4, AT6.21 |
| 6 | A/D/G box with stance and why | WP6 (UI), WP2 (`add-node` plan), WP1 (`renderBlock`) | AT6.5, AT2.6 |
| 7 | Edit text/rationale (+ stance/source chips; docstring mirror D-9) | WP6, WP2, WP1 | AT6.6, AT2.6 |
| 8 | Delete (confirmation lists dependents: premises, proofs, statements that mention it; with its Lean, the host refuses with `needs-confirmation` listing every declaration that would stop compiling, untracked and other subjects' included, until the board resends with `confirmed: true`) | WP6, WP2 (`planDelete`), WP1 | AT6.7, AT2.7 |
| 9 | Drag re-order (layout only) | WP6 (posts `reorder`), WP2, WP4 (layout.json) | AT6.8, AT4.3 |
| 10 | Kind changes per D-11, A→D pending until a proof exists | `kindChange.ts` (done), WP2 (`planKindChange`), WP1 (`applyLeanOps`), WP6 (drop zones, dialog), WP5 | AT2.8, AT2.11, AT1.7, AT6.9 |
| 11 | Undo (and Redo; Undo toast) | WP4 (stack), WP6 (Ctrl+Z, toast), WP5 | AT4.4, AT6.10 |
| 12 | Tray (target slot, presupposition chips, "These suffice" = declare premises in M1) | WP6, WP2 (`set-premises`) | AT6.11 |
| 13 | Refresh via build + check file | WP3 (refresh), WP4 (scheduling, graph.json), WP5 (triggers) | AT3.1–3.3, AT4.2 |
| 14 | graph.json (versioned, JSON Schema) | WP2 (`toGraphJson`, schema), WP4 (writes it) | AT2.10, AT4.2 |

### 1.2 The user's amendments and the M0 lessons

| # | Item | Built by | Test |
|---|---|---|---|
| 15 | D-10 several subjects per project + subject picker + new subject | `paths.ts` (done), `subjectScaffold` (done), WP4 (scan), WP2 (per-subject graphs, `create-subject`), WP6 (picker), WP5 | AT2.9, AT4.1, AT6.12 |
| 16 | D-33 history dropdown (time · action · summary), read-only preview with diff, "Revert to this" (itself undoable), storage counter per subject and overall, keep-last-N pruning, private refs only, Initialize offers git init | WP4 (git), WP5 (diff editor, messages), WP6 (dropdown) | AT4.5, AT5.5, AT6.13 |
| 17 | M0 lessons: keeper/OOMPolicy/exit-code/toolchain PATH (already in runLean); colour ids with one dot and no `charts.*` defaults; idempotent graph application for queued messages; full Lean messages (not just the first line) | WP3 (keeps runLean; keeps continuation lines), WP5 (colours), WP6 (store) | AT5.2, AT6.1, AT3.2 |
| 18 | Opt-in per folder, multi-root (one board per model root), board restored after reload | WP5 | AT5.1, AT5.4 |
| 19 | Syntactic mode when the toolchain is not v4.35.0 (D-7); projects with Lake dependencies (e.g. Mathlib) are refused in M1 (D-28 "explicit opt-in", the RAM rule) | WP3 (statuses `unsupported-toolchain`, `unsupported-project`), WP4 (Initialize refuses), WP6 (banner) | AT3.6, AT3.11, AT4.6, AT6.14 |
| 20 | Isolated test profiles (HOME/XDG for Chrome and VS Code, Copilot/telemetry off, `ulimit -c 0`) | WP5, WP6 | AT5.6, AT6.15 |
| 21 | `mental_model/` = the user's Spyro walkthrough as subject `Spyro` (3 assumptions incl. one code-less, 1 unproved goal) | WP4 | AT4.7 |

### 1.3 The user's turn-9 card requests

> "clicking and dragging on the expanded Lean code in a card does not drag the card, but passes through to interact with the text … (ctrl+click / editing later) … hovering an identifier in the expanded Lean shows its gloss, and clicking it highlights the item in the Vocabulary group … do it once possible"; "listing the vocabulary of each card … a dropdown list … that truncates to "HasDarkPast, cynder, ..." when inline"; "a button on the expanded Lean code of each card that copies the code to the user's clipboard".

| # | Request | Data (who) | UI (who) | Test |
|---|---|---|---|---|
| 22 | Drag inside expanded code selects text, never drags the card; clicks in the code do not change the selection | – | WP6 | AT6.16: mouse drag over code → non-empty `getSelection()`, no `reorder`/`kindChange` posted, card never `data-dragging`, selection unchanged |
| 23 | "uses:" line from Lean, truncated inline ("HasDarkPast, cynder, …"), dropdown lists all with glosses | `TlNode.lean.uses` from `.ilean` refs (WP2, WP3) | WP6 | AT2.4 (uses computed, never hard-coded), AT6.17 |
| 24 | Copy button on the expanded code | – | WP6 posts `copyText`; WP5 `vscode.env.clipboard.writeText` | AT6.18, AT5.5 |
| 25 | Hover an identifier → gloss; click → highlight it in the Vocabulary group (and for a node's name: reveal that card); Ctrl/Cmd+click reserved | `TlNode.lean.refs` (positions inside `code`), `TlGraph.vocabulary` (gloss) (WP2, WP3) | WP6 | AT2.4, AT6.19 |

All four are practical in M1 (section 6.4 explains where the data comes from; risk R5 explains why toggling the card's `draggable` attribute, not CSS, is what lets Chrome select text).

### 1.4 Not in M1

Anything calling an LLM (M2); refine/supersede/merge/suspend, model finder, decisions (M3); Lean-editor providers, CLI, Shiki (M4: a plain `<pre>` is fine); hardening (H); `wording.jsonl` and `attempts.jsonl` writes (history snapshots keep old wordings; attempts start with M2 runs); drawing arrows by dragging from a card's port (the tray covers declaring support); the plain-text action log idea of A7 (optional, not scheduled); projects with Lake dependencies (Mathlib opt-in is M4); endorsement UI for definitions (D-4: M1 only flags them).

---

## 2. Architecture of M1

```
                    ┌──────────────────────────── extension host (Node 24, VS Code 1.140) ────────────────────────────┐
 webview (React)    │ WP5 extension (thin)                        │ WP4 runner/workspace (no vscode)                  │
 ┌──────────────┐   │  BoardPanel per model root ── protocol ──▶  │  ModelWorkspace(root)                             │
 │ columns,     │◀──┤  (validates with core parseWebviewToHost)    │   files ─▶ core.parseLeanFile (WP1) per file      │
 │ vocabulary,  │──▶│  EditApplier = WorkspaceEdit + save          │   + LeanFacts ─▶ core.buildProjectModel (WP2)     │
 │ cards, tray, │   │  TextSource  = open buffers, else disk       │   ─▶ core.subjectGraph (WP2) ─▶ TlGraph           │
 │ history,     │   │  watchers: change / save / create / delete   │   actions ─▶ core.planAction (WP2 + WP1)           │
 │ subject pick │   │  clipboard, open-in-editor, diff preview     │   ─▶ sidecars ─▶ applier ─▶ snapshot ─▶ undo      │
 └──────────────┘   │  commands: Open Board, Initialize, Refresh   │   history: git private refs (D-33)                │
                    │                                              │   refresh ─▶ WP3 semantic.refreshLeanFacts        │
                    │                                              │   graph.json ◀─ core.toGraphJson (WP2)            │
                    └──────────────────────────────────────────────┴─────────────────┬─────────────────────────────────┘
                                                                                     ▼ runExclusive (one Lean job at a time)
                                      runLean (systemd-run scope, MemoryMax, no swap, keeper, bwrap; M0)
                                      1. lake build (in place: sources read-only, .lake writable, .git masked)
                                      2. read .lake/build/lib/lean/**.ilean (decl ranges + references)
                                      3. lake env lean --stdin --json  ◀── generated check file (#check / #print / #print axioms)
```

**Data flow, files to board.** (1) The workspace lists `Model.lean`, `Model/**.lean` and `.telelean/subjects/*/layout.json`, reads each through the TextSource (open buffer first) and parses it (WP1). (2) It hashes each text (sha256). (3) `buildProjectModel` (WP2) binds blocks to declarations, merges the latest LeanFacts (fully where the file hash matches; by name, flagged `stale`, where it does not: section 6.3), computes vocabulary, statuses, edges, diagnostics and card data (`code`, `uses`, `refs`, `presupposes`, `axioms`). (4) `subjectGraph` cuts one subject's board, ordered by its layout.json. (5) The extension posts it; the webview applies it (older versions dropped).

**Data flow, board to files.** A gesture becomes a protocol message (validated by `parseWebviewToHost`) → the extension maps it to a `BoardAction` → `ModelWorkspace.perform(action)`: `planAction` (WP2, using WP1 primitives) → `EditPlan` (Lean file changes + new layout + archived declarations) → the workspace materialises sidecars (layout.json, attic) into whole-file `FileChange`s → snapshots hand edits of the touched scopes ("Manual edits") → `EditApplier.apply` (checks `before`, WorkspaceEdit + save) → snapshots the result (labelled) → pushes the undo entry → re-parses → posts the graph at once (changed files marked stale) → schedules a Lean refresh → posts again with fresh facts and rewrites graph.json.

**Refresh triggers** (WP5 calls `requestRefresh`; WP4 debounces 750 ms, coalesces, runs one at a time): board opened; a model file saved; telelean's own edit applied; lakefile/toolchain changed; a Lean file written by another program (file watcher; echoes of telelean's own writes and of saves already handled, and changes under an editor with unsaved typing, are ignored); the Refresh button. Only while that root's board is open (D-28). Typing in an editor only re-parses (debounced ~200 ms in WP5), never builds.

---

## 3. Runtime flows (who does what)

| Flow | Steps |
|---|---|
| Open Board | WP5 finds model roots (`findModelRoots` per workspace folder; quick pick if several; none → offer Initialize) → creates (lazily, once per root; kept until the window closes, so undo survives closing the board) or reuses the `ModelWorkspace` → `load()` → posts `workspace` + `graph` (semantic `unavailable`/`checking`) → history: snapshot "Initial state" for the subject if its chain is missing → `requestRefresh('open')` |
| Typing | `onDidChangeTextDocument` for files under the root → debounce → `invalidate([path])` → `onDidChange` → post graph |
| Save | `onDidSaveTextDocument` → `invalidate` + `requestRefresh('save')` |
| Action | message → `perform` → `actionResult` (requestId) + `notice` (Undo toast) + graph posts |
| Undo/Redo | Ctrl+Z / Ctrl+Shift+Z (board focused, not in a text field) or the toast → `undo`/`redo` message → `ws.undo(subject)` → same as an action (snapshotted "Undo: …") |
| History | dropdown opened → `historyList` → `history` reply; Preview → `historyPreview` → WP5 opens `vscode.changes` on a read-only `telelean-history:` provider fed by `historyDiff`; Revert → `historyRevert` → `ws.revert` |
| Subject switch | `selectSubject` → WP5 posts `workspace` + `graph` for it (each board remembers its subject in the panel state). If the board's subject disappears (undo of create-subject, a revert), WP5 switches the board to the first remaining subject |
| New subject | `createSubject` → `perform({kind:'create-subject'})` → scaffold files + `import Model.<S>` in `Model.lean` → switch to it |
| Initialize | command on a folder → `inspectFolder` → ask the first subject's name (empty folder) → `planInitialize` → apply → if not inside a repo: modal "Initialize a git repository here for telelean's history?" → `initGitRepository` → open the board |

---

## 4. The semantic layer (WP3): build + check file

**Steps** (`refreshLeanFacts`, see `packages/runner/src/semantic/types.ts`):
1. **Memory guard.** `readMemAvailable()` ≥ `minAvailableBytes` (default 2 GiB), else return status `low-memory` without spawning. The board shows "Lean paused: low memory (x GB available)"; the next save or the Refresh button retries. *(fix)* The guard runs again before the check spawn (step 7; below the threshold the check is skipped and the status is `low-memory`), and each spawn's `MemoryMax=` is the configured cap lowered to MemAvailable minus a reserve (the smaller of 1 GiB and half the threshold; never below 256 MiB), so a run near the limit hits its own cap (`oom`) instead of pushing the machine into swap.
2. **Toolchain and project.** `lean-toolchain` (trimmed) must read `leanprover/lean4:v4.35.0`, else `unsupported-toolchain` (syntactic mode banner, D-7). `lake-manifest.json` must exist (the sandbox keeps the root read-only, so Lake could not write one) and its `packages` must be empty, else `unsupported-project` with a detail ("lake-manifest.json is missing" / "this project has Lake dependencies (…): M1 checks only dependency-free models; Mathlib needs an explicit opt-in, M4"). Nothing is spawned in either case.
3. **Build in place.** Hash every module source (sha256) first and keep the texts (column conversion needs them). `runLean({ shadowDir: root, argv: [<toolchain>/bin/lake, 'build'], maskPaths: [root/.git if it exists], memoryMax, timeoutMs, runId, signal })`.
4. **Parse Lake's log** (stdout and stderr). Line shapes verified on Lake 5.0 / Lean 4.35 (review probe, 2026-11-01):
   - progress: `✔ [i/n] Built <Module> (…)`; `⚠ [i/n] Replayed <Module>` (Lake replays the stored messages of up-to-date modules, so warnings such as "declaration uses `sorry`" appear on every build); `✖ [i/n] Building <Module> (…)` (failed);
   - `trace: …` lines (ignored);
   - messages: `error|warning|info: <path>:<line>:<col>: <first line>`, then every following line up to the next recognised line is a continuation (Hint/Note paragraphs, indented terms) and belongs to the message text;
   - `Some required targets logged failures:` followed by `- <Module>` lines; `error: build failed`; `Build completed successfully (n jobs).`
   Lean lines are 1-based and columns are 0-based code points: convert to 0-based lines and UTF-16 characters using the source text of step 3. Lake gives no end position: ranges are zero-width.
5. **Module states.** Modules = `<library>.lean` and `<library>/**.lean`. Imports come from each file's header (`import X` lines). `failed` = Lake said so (Lake then *deletes* that module's `.olean`/`.ilean`: verified twice); `dependency-failed` = a project import is failed or dependency-failed; `not-built` = not in the root's import closure; otherwise `fresh` (built now or up to date). Failed, dependency-failed and not-built modules are never imported by the check file, even when old `.olean` files exist for them.
6. **Read `.ilean`** for fresh modules: `.lake/build/lib/lean/<Module/Path>.ilean`, JSON, `version` 5 (anything else: no decls for that module, status `check-errors` with a detail). Verified shape on Lean 4.35 (Spyro, 2026-11-01):
   ```json
   { "version": 5, "module": "Model.Spyro.Main", "directImports": [["Model.Spyro.Vocabulary", false, false, false]],
     "decls": { "Spyro.cynder_dark_past": [23, 0, 24, 52, 24, 7, 24, 23], … },
     "references": { "{\"c\":{\"m\":\"Model.Spyro.Vocabulary\",\"n\":\"Spyro.HasDarkPast\"}}":
                       { "definition": null, "usages": [[24, 34, 24, 45, "Spyro.cynder_dark_past"]] }, … } }
   ```
   `decls[name]` = full range (from the docstring) then selection range, 0-based; columns are UTF-16 (verified with non-BMP characters on the line). Each usage = range + the *parent declaration* that contains it → `DeclFacts.refs`. A `definition` array has 4 elements, or 5 when Lean records a parent. Names starting with `_private.` are skipped. A reference whose `definition` parent is another declaration (structure fields: `Spyro.Rec.past` → `Spyro.Rec`) gives `DeclFacts.parent`. Lean also records elaborated projections (`d0.holds.2` gives a ref to `And.right` on the `2`).
7. **Check file** on stdin to `lake env lean --stdin --json` under runLean, importing every fresh module:
   ```lean
   import Model.Spyro.Vocabulary
   import Model.Spyro.Main
   set_option pp.fullNames true
   set_option pp.proofs false
   #check @Spyro.cynder_dark_past        -- "Spyro.cynder_dark_past : Prop"
   #print Spyro.cynder_dark_past         -- "@[reducible] def Spyro.cynder_dark_past : Prop :=\nSpyro.HasDarkPast Spyro.cynder"
   #print axioms Spyro.cynder_dark_past  -- "'Spyro.cynder_dark_past' depends on axioms: [Classical.choice,\n Spyro.Character, …]"
   #check type_of% @Spyro.HasDarkPast    -- axioms and opaques only: "Spyro.Character → Prop : Type"
   …
   ```
   Names are written with M0's `formatDeclName`. Messages are attributed by their 1-based `pos.line` (M0 `footprintsFromMessages` pattern). Parsing (outputs verified by the review's probe):
   - `#check`: `type` = text after the first ` : `, whitespace normalised (long types wrap onto indented lines: `Spyro.d3.holds : Spyro.a_long_name →\n  Spyro.b_long_name → Spyro.cynder_not_good → Spyro.d3`).
   - `#print`: the keyword before the name (`axiom`, `theorem`, `def`, `opaque`, `structure`, `inductive`, `class`), the `@[…]` attributes, and for `def`s the value after `:=` (`value`; theorems print `:=\n⋯` under `pp.proofs false`). **`instance` is not visible there**: a Prop-valued instance prints as a theorem (`theorem Spyro.instNonemptyCharacter : Nonempty Spyro.Character :=\nSpyro.Character.exists`), a data instance as `@[instance_reducible] def …`. So `kind: 'instance'` is set when the declaration's source text (after docstring, attributes and modifiers) starts with the `instance` keyword.
   - `#print axioms`: the list (M0 `parseAxiomsMessage`; it spans lines), `usesSorry` = contains `sorryAx`.
   - `#check type_of% @N` (axioms and opaques; others optional): `typeSort` = text after the last ` : ` (`Prop`: N proves a proposition, so an axiom of sort Prop is an assertion; `Type`: a data, function or predicate symbol; `Type 1`: a sort such as `axiom T : Type`).
   - An error message on a line → `error`.
   Measured: check ~0.3 s and ~480 MB RSS; build ~1.2 s and ~500 MB RSS for Spyro (unsandboxed probe).
8. **Re-hash** the sources; any module whose hash changed during the refresh becomes `stale`.
9. **Docstrings**: the text between `/--` and `-/` at the start of each declaration's full range.

**Mapping to the board's `SemanticSummary`** (WP4): `ok` → `fresh` (or `stale` when files changed since); `build-errors`/`check-errors` → `failed` with `errorCount` (facts for fresh modules are still used); `low-memory` → `paused-low-memory`; `unsupported-toolchain` → same; `unsupported-project` → `disabled` with the detail (+ diagnostic TL201); `could-not-start` → `disabled` with detail ("sandbox unavailable: …"); `timeout`/`oom`/`cancelled` → `failed` with detail. Previous facts stay in use after a failed refresh (marked stale where hashes differ), except after `unsupported-toolchain` and `unsupported-project` *(fix)*: the project as it is cannot be checked, so the previous facts are dropped and the board really is syntactic (D-7); the summary names the project's current pin, not the toolchain of earlier facts.

**Why not `collectAxioms` or a compiled extractor in M1?** 03 §5 keeps M1 tool-free; `#print axioms` gives the same list and the `.ilean` index gives exact references without running any code beyond Lean itself. The compiled extractor (closure hashes for G5) arrives in M2.

---

## 5. Frozen contracts (in code)

Rules: files marked FROZEN are read-only for builders except the named owner, who may add **optional** fields or new exports and must record each addition in section 14. Renames, removals and type changes go through the integrator. `packages/core/src/index.ts` and `packages/runner/src/index.ts` are frozen for everyone (they already export every module).

### 5.1 `core/src/model.ts` (owner after freeze: integrator)
`TlGraph` now = `{ version, subject, nodes, edges, vocabulary: VocabItem[], diagnostics: BoardDiagnostic[], semantic: SemanticSummary }`; `version` increases across subjects and re-created workspaces (WP4 seeds its counter from `Date.now()`). `LeanBinding` gains `justificationKind`, `codeLoc`, `uses`, `refs` (`LeanRef` = `{ name, range relative to code, nodeId? }`), `presupposes`, `axioms`. `ProofStatus` `conditional` gains an optional `footprint`. New: `VocabItem`/`VocabKind`/`VocabFlag`, `BoardDiagnostic`/`Severity`, `SemanticSummary`, `SubjectInfo`, `FileRange`, `STANCES`, `EVIDENTIALS`. `StatusFlag` gains `rests-on-claimed`, `proved-goal`, `provable-assumption`, `missing-holds`, `uses-sorry`, `holds-mismatch`, `not-checked`. `TlEdge` gains `mismatch`; its doc states the verified-edge semantics of 6.3. **The Spyro sample** (`samples/spyro.ts`, frozen) is the canonical example of all new card data, checked against a real Lean build (refs index the right identifiers; `contracts.test.ts` verifies). `spyroGraph()` matches `test-fixtures/spyro`; `spyroProvedGraph()` matches `test-fixtures/runner-lean/overlays/proved` (the review corrected its `loc`s, pg-no-dark-past's `pinned` binding, docstring line and `codeLoc`).

### 5.2 `core/src/markup/` (owner: WP1)
`types.ts`: `Span` (UTF-16 offsets), lexer types, `MarkupBlock` (id, idWritten, version, typed `fields`, verbatim `extensions`, `body`, spans, `lines`, `binding`), `BlockBinding` (`none|adjacent|pinned`, FQ `statement`, decl indices), `DeclInfo` (keyword, name, fullName, namespace, modifiers, attributes, docstring, spans, `valueStart`), `MarkupDiagnostic`, `ParsedFile` (path, text, eol, blocks, decls, imports, diagnostics), `NewBlock`, `TextEdit`, `InsertWhere`, **`LeanOp`** (the WP2→WP1 contract: `add-holds-axiom`, `holds-theorem-to-axiom`, `remove-holds`, `remove-decl`, `add-hypothesis` (binder right after the name), `apply-hypothesis`, `set-docstring` (body escapes)), `LeanOpsResult`. `api.ts`: `lexLean`, `lineIndex`, `parseLeanFile`, `parseFieldValue`, `escapeJsonValue`, `formatFieldValue`, `escapeBodyText`, `renderBlock`, `deriveId`, `applyTextEdits`, `setBlockField`, `removeBlockEdits`, `insertBlockEdits`, `applyLeanOps` (stubs), `findDecl`, `relativeName`, `ID_PATTERN` (done).

### 5.3 `core/src/project/` (owner: WP2)
`ProjectInput` (parsed files, file hashes, facts, library) → `buildProjectModel` → `ProjectModel` (subjects, nodes by id with their block/decls, files, facts, `freshFiles`, vocabulary, diagnostics, `declFacts`, `ownerOfDecl`) → `subjectGraph(model, subject, { version, layout, semantic })`.

### 5.4 `core/src/edit/`, `actions.ts`, `kindChange.ts`, `layout.ts`, `paths.ts`, `export/`
- `actions.ts` (integrator): `BoardAction` (`add-node`, `edit-node`, `delete-node`, `change-kind`, `reorder`, `set-premises`, `create-subject`), `HistoryActionKind`, `FileChange` (whole-file before/after), `ArchiveEntry`, `EditPlan`, `ActionError` + codes, `ActionOutcome`, `HistoryEntry`, `StorageUsage`, `HistoryAvailability`, `HistoryListing`, `HistoryDiff`, `WorkspaceState`.
- `edit/` (WP2): `planAction(model, action, ctx)`, `planKindChange` (documents its `facts-stale` and `unsafe` refusals), `planDelete` (broken dependents include statements that mention the removed abbrev), `subjectScaffold(subject, library)` (**implemented**: exact texts of 7.1; WP2 must keep its output, `contracts.test.ts` guards it), `PlanContext`, `KindChangePlan`, `DeletePlan`.
- `kindChange.ts` (implemented; WP2 owns): `kindChangeImpact(graph, id, to)`, `proofDependents` (transitive over verified edges; correct for derivations once verified edges follow 6.3).
- `layout.ts`, `paths.ts` (implemented; WP2 owns): layout.json format and helpers; folder conventions (section 7.1).
- `export/graphJson.ts` (WP2): `GraphJson` top-level shape (frozen), `toGraphJson(model, options)`.
- `facts.ts` (integrator): `LeanFacts`, `ModuleFacts`, `DeclFacts` (gains optional `typeSort`; `kind: 'instance'` rule documented), `DeclRef`, `BuildFacts`, `CheckRunFacts`, `FactsStatus` (gains `unsupported-project`), helpers `holdsName`, `statementOfHolds`, constants.

### 5.5 `core/src/protocol.ts` (implemented; integrator)

| Direction | Type | Payload | Notes |
|---|---|---|---|
| host→web | `graph` | `{ graph: TlGraph }` | missing M1 fields default (older host); the webview drops a graph whose `version` is below the last applied one |
| host→web | `workspace` | `{ state: WorkspaceState }` | subjects, current subject, undo/redo labels, history availability |
| host→web | `history` | `{ listing: HistoryListing }` | reply to `historyList` |
| host→web | `actionResult` | `{ requestId, outcome: ActionOutcome }` | for every mutating message with a `requestId`; `needs-confirmation` carries `dependents` (node ids or fully-qualified Lean names of untracked declarations) |
| host→web | `notice` | `{ id, level, text, undoable }` | toasts; `undoable` shows Undo |
| web→host | `ready`, `select`, `diagnostic` | as M0 | |
| web→host | `addNode` | `{ clientId, type, naturalName, requestId?, rationale?, stance?, source? }` | sentence: one line, not blank; the host derives the final id (6.2) |
| web→host | `kindChange` | `{ id, from, to, beforeId, requestId?, dependents?: 'rewrite'\|'mark-broken', rationale? }` | |
| web→host | `theseSuffice` | `{ premises (may be empty), target, requestId? }` | M1: declare premises; empty → `not-yet` |
| web→host | `editNode` | `{ id, field: naturalName\|rationale\|stance\|source, value \| null, requestId? }` | |
| web→host | `deleteNode` | `{ id, keepLean, confirmed?, requestId? }` | *(fix)* without `keepLean`, a delete that breaks other declarations is answered `needs-confirmation` with `dependents`; the board resends with `confirmed: true` |
| web→host | `reorder` | `{ id, column, beforeId, requestId? }` | |
| web→host | `undo`, `redo`, `initGit`, `refresh` | `{ requestId? }` / `{}` | |
| web→host | `selectSubject`, `createSubject` | `{ subject }` / `{ name, requestId? }` | names match `SUBJECT_NAME_PATTERN` |
| web→host | `historyList`, `historyPreview`, `historyRevert`, `historyPrune` | subject + `limit?` / `entryId, compare` / `entryId` / `keepLast` | entry ids are hex |
| web→host | `copyText` | `{ text ≤ 1 000 000 }` | host writes the clipboard |
| web→host | `openInEditor` | `{ file (relative POSIX, no `..`), range? }` | host re-checks it is inside the root |

### 5.6 Runner (`packages/runner/src/semantic/`, `workspace/`)
- `semantic/types.ts` (WP3): `RefreshRequest`, defaults, the step list (now with the project check and the `type_of%` probe). `semantic/index.ts`: `refreshLeanFacts` (stub), `readMemAvailableBytes`, `runExclusive` (done).
- `workspace/types.ts` (WP4): `TextSource`, `EditApplier` (must check `before` first), `SemanticSettings`, `GitSettings`, `ModelWorkspaceOptions`, `ModelWorkspace` (load, subjects, graph, workspaceState, semantic, onDidChange, invalidate, requestRefresh, refreshNow, perform, undo, redo, historyStatus, listHistory, historyDiff, revert, prune, initGit), `WorkspaceChange`, `FolderInspection` (`empty`/`lake-project` carry the current `.gitignore` text; dependency projects are `unsupported`), `InitializeOptions`. `workspace/index.ts`: `createModelWorkspace`, `inspectFolder`, `planInitialize`, `findModelRoots`, `initGitRepository` (stubs), `DEFAULT_EXCLUDED_DIRS`.
- The extension imports the runner from source: WP5 adds `"@telelean/runner": ["../runner/src/index.ts"]` (and, for deep imports, `"@telelean/runner/*": ["../runner/src/*"]`) to its tsconfig `paths`. Import only `semantic`, `workspace` (and `lean` if needed); `llm/confinement.ts` uses `import.meta.url` (inside a function, so not fatal, but meaningless in a CJS bundle; see R8).

---

## 6. Core semantics (WP1, WP2)

### 6.1 Binding, command starts, ids and the D-2(b) convention
- A block binds by `lean:` (pinned; the first name is the statement) or else by adjacency (the next declaration with no blank line in between; docstring, `@[…]`, modifiers and plain comments may intervene; another block, a blank line or EOF = code-less; TL013 when a declaration follows after a blank line). Names resolve against the enclosing namespaces (`_root_.` honoured). Pinned names are fully qualified as telelean writes them (D-8); WP2 falls back to resolving a pinned name against the block's enclosing namespaces when no declaration has the exact name.
- **Command starts** (where a declaration's span ends; WP1): a line at column 0 that begins with a declaration keyword (`axiom theorem lemma def abbrev opaque instance example inductive coinductive structure class mutual`), a modifier (`private public protected noncomputable unsafe partial nonrec scoped local meta`), `@[`, `end`, `namespace`, `section`, `open`, `export`, `variable`, `universe`, `set_option`, `attribute`, `notation`/`infix`/`infixl`/`infixr`/`prefix`/`postfix`, `macro`, `macro_rules`, `syntax`, `elab`, `deriving instance`, `initialize`, a `#…` command, `import`; or EOF. *(fix)* A line that begins with a comment at column 0 (`--`, `/-`, `/--`, `/-!`, a telelean block) is a command start only when the next code after the comment is itself a command start (or there is none): Lean treats comments as whitespace, so a column-0 comment inside a tactic proof or a multi-line statement, followed by more indented code, belongs to the declaration (the earlier rule cut such declarations in half, so D->A, A->G and delete broke compiling files). As a second guard, `applyLeanOps` refuses to remove or replace a declaration when the code right after its span is an indented continuation line, and the planner refuses when a freshly checked declaration's `.ilean` range ends after the span it would cut.
- **Ids.** A block without `id:` gets `deriveId(natural_name)`, unique within its file (WP1, TL112 info). WP2 resolves a derived id that collides with any other id in the workspace by suffixing (`-2`, `-3`, …; files in path order); TL006 is reported only for duplicated *written* ids.
- **D-2(b).** The statement must be a Prop-valued `abbrev`/`def` (`abbrev n : Prop := S`); its justification is the declaration named `n.holds` (anywhere in the project; by convention right after the statement). Anything else bound to a block (a bare axiom or theorem) is flagged TL113 ("write `abbrev n : Prop := …` and `axiom n.holds : n`") and the node is `ill-formed` (M1 is strict: telelean writes and reads only the approved D-2(b) form).
- **Pinning (D-8).** Whenever telelean edits a block whose node is formalised by adjacency, the same plan also writes `lean: <fully-qualified statement>` (like the derived-id write-back), so later inserted declarations cannot rebind it.
- Code shown on a card = the source text from the statement's start (docstring included) to the end of `n.holds`, when contiguous (only blank lines/comments between); otherwise the pieces joined by a blank line (refs are mapped per piece). `codeLoc` = where it starts.

### 6.2 D-11 kind changes as implementable logic
`kindChangeImpact` (done, graph only, for drop zones) and `planKindChange` (WP2, with facts) share this table. Let S = statement, H = `S.holds`, hk = H's kind (`absent`/`axiom`/`theorem`; `other` is treated as `theorem`), deps = declarations using H (transitively, from `DeclFacts.refs`).

| from→to | code-less | hk = absent | hk = axiom | hk = theorem |
|---|---|---|---|---|
| G→D | type only | type only ("counts as derived once proved") | type only → pending promotion | type only ("already proved") |
| G→A | type only | type + `add-holds-axiom` (+ optional rationale) | type only | type + `holds-theorem-to-axiom` (archived) |
| D→A | type only | type + `add-holds-axiom` | type only | type + `holds-theorem-to-axiom` (archived) |
| A→D | type only | type only | type only → **pending promotion** (axiom stays, flag `claimed`; dependents `rests-on-claimed`) | type only |
| A→G, D→G | type only | type only | deps = ∅: type + `remove-holds`; deps ≠ ∅: needs `dependents` | same, with `archive: true` |

With deps ≠ ∅ and no `dependents` choice → `ActionError('needs-confirmation', …, deps)` (deps = node ids, plus fully-qualified names of untracked declarations). `mark-broken` → `remove-holds` (dependents stop compiling and show as not checked/ill-formed after the refresh). **`rewrite`** → requires every touched file to be fresh (else `facts-stale`). Let C = the declarations using H (a declaration d uses x when one of d's `DeclFacts.refs` names x), closed under "uses a member of C". Refuse with `unsafe` (listing them) when C contains a non-theorem (a def/abbrev/instance/opaque cannot take a hypothesis without changing its type), or, when H is an axiom, when a declaration whose `axioms` list H is neither in C nor H itself (a use the references do not show, e.g. through notation). Otherwise: hypName = `h_<last component of S>` (suffixed `_2`, `_3`, … until it occurs as a token in none of C's declarations); for each d ∈ C: `add-hypothesis(d, hypName, hypType = S relative to d's namespace, replace = d's refs to H)` — the binder goes **right after d's name, before its existing binders**, so that `(c h)` is a correct partial application for callers that pass further arguments — and, for each c ∈ C referenced in d, `apply-hypothesis(d, hypName, replace = d's refs to c)`; then `remove-holds`. Each d becomes `theorem d (h : S) … : …`, i.e. conditional on the node (D-2(b)). Spans come from `DeclFacts.refs` converted to offsets of the current text (valid because the files are fresh). The board card moves to `to` at `beforeId` (layout change in the same plan). Pending promotion needs no markup: it is derived (a DERIVATION whose H is an axiom); writing the proof by hand (replacing `axiom` with `theorem … := …`) makes it `proved` on the next refresh.

*(fix)* **Conditional proofs.** H may take hypotheses (`theorem n.holds (h : a) : n`, type `a → … → n`; the A→G rewrite produces exactly these). (1) **D→A / G→A** replace it by `axiom n.holds : n`, which states `n` directly, so declarations that apply H (`(n.holds h)`) would break: with such users (direct users only; their own types do not change) the change needs a `dependents` choice like A→G (`needs-confirmation` listing them; the drop zone says so instead of "stays valid"); `mark-broken` leaves them, `rewrite` (fresh facts) drops the arguments with the LeanOp `drop-arguments` (each use must be `(n.holds h₁ … hₖ)` with k = H's arity, or nested `((n.holds h₁) h₂)`, plain identifiers only; anything else is refused: choose "mark broken"). (2) **A→G / D→G `rewrite`** of a conditional H passes `applied: k` to `add-hypothesis`, which replaces each whole application by the new hypothesis `(h_n : n)`, so a user ends up conditional on `n` and on the hypotheses it already had; an H whose type is not `… → n` (e.g. a `∀` type) is refused. **Reference spans**: Lean's `.ilean` records `@c` and `(c)` twice (with and without the `@` or the parentheses): the planner shrinks parentheses to the identifier and keeps one span per identifier end (the `@` one); `add-hypothesis` accepts a leading `@`.

*(fix)* **Delete** (`planDeleteNode`, D-18): without `keepLean`, when `planDelete(...).brokenDependents` is not empty, the plan refuses with `needs-confirmation` (dependents = owning cards, then untracked fully-qualified names) unless the action has `confirmed: true`. **Other cards' bindings**: every plan ends with a check that no other block's binding changed: a code-less block left directly above a declaration (the block below it or the declarations after it were removed) gets a blank line after it; any other change of another block's statement is refused (`unsafe`). **Duplicate fields** (TL005): setting a field edits its first line only and keeps the duplicates (user text); removing a field that is duplicated is refused.

**Other plans** (WP2): `add-node` id = `deriveId(naturalName, taken)` over every id in the workspace (written and derived); `preferredId` is ignored in M1 (the webview's optimistic card is replaced when the graph arrives; `ActionOutcome.nodeId` tells it the final id). The sentence is written verbatim (trimmed only).

**History and toast labels** (one line, the sentence cut to 60 characters with `…`): `Add assumption: <sentence>` (derivation/goal likewise); `Edit sentence: <new sentence>`; `Edit why: <sentence>`; `Set stance: <stance> (<sentence>)`; `Set source: <source> (<sentence>)`; `Delete: <sentence>`; `Make Goal: <sentence>` (+ ` (dependents rewritten)` / ` (dependents marked broken)`); `Move: <sentence>`; `These suffice: <target sentence> ← <n> premises`; `New subject: <S>`; `Undo: <label>`; `Redo: <label>`; `Revert to: <label> (<time>)`; `Manual edits`; `Initial state`; `Initialize model`.

### 6.3 Status derivation (D-15) and edges (D-13)
`formal`: `informal` (code-less) · `formalized` (the statement is a Prop abbrev/def: in the facts, or syntactically when the file has no usable facts) · `ill-formed` (TL101 statement not found, TL113 not a Prop abbrev/def, or a Lean error inside the node's statement or `.holds` declaration).

**Which facts.** A fresh file (hash = facts) uses its facts. A **stale** file (hash differs) keeps a declaration's previous facts **by name** while its current syntactic keyword agrees with the facts' kind (flag `stale`; `refs` dropped; `uses`, `presupposes`, `axioms` kept), so statuses do not flicker while the user types. Otherwise, and for files in failed / dependency-failed / not-built modules or with no facts at all, only the syntactic keyword counts: an `axiom` H counts as an axiom; a `theorem` H counts as **not proved** (proof `none`) with `not-checked` (plus `stale` in a stale file). The board never shows "proved" without Lean.

`proof` (per node, from H as determined above):

| type | H absent | H axiom | H theorem, no `sorryAx` | H theorem with `sorryAx` |
|---|---|---|---|---|
| ASSUMPTION | none + `missing-holds` (TL117) | assumed | proved/conditional + `provable-assumption` (TL106) | none + `uses-sorry` |
| DERIVATION | none | pending-promotion + `claimed` | proved / conditional | none + `uses-sorry` (TL115) |
| GOAL | none | assumed + TL116 ("make it an Assumption?") | proved / conditional + `proved-goal` (TL105) | none + `uses-sorry` |

- **Proved vs conditional**: normalise H's `#check` type (every whitespace run → one space). Equal to S → `proved { footprint }`. Otherwise split at top-level ` → ` (outside brackets; not when the type starts with `∀`, `∃` or `fun`): the last part is S and every other part is exactly some node's statement name → `conditional { on: those nodes, footprint }`; any other type → none + `holds-mismatch` (TL114).
- **Footprint** = H's `axioms`, mapped: a node's `n.holds` (any subject) → its id; a presupposition axiom → `presup:<name>`; standard axioms and vocabulary symbols (sorts, predicates, functions, constants) → dropped; `sorryAx` → handled above; anything else (an unmarked assertion, an `axiom c : T` constant, …) → `axiom:<name>` + TL103. Theorems never appear in `#print axioms` (verified: `theorem g2.holds : g2 := d0.holds.2` lists only d0's assumptions), so a proof through a derivation shows that derivation's assumptions: exactly D-1's "which beliefs a result rests on".
- **Flags**: `rests-on-claimed` if a footprint node is pending promotion; `self-evident` if proved with no node and no `axiom:` entry in the footprint *(fix: a proof resting on a hidden axiom is not self-evident; TL103/TL104 say why)*; `existence-commitment` + TL108 (info) if the footprint has a presupposition that neither the node's own `presupposes` nor any footprint node's `presupposes` contains (D-3b: an existence assumption the proof needs but no statement mentions); TL102 (warning) when the proof is conditional (lists `on`) or its footprint contains a GOAL node (a goal asserted as an axiom, TL116).
- **Edges** (only edges with both ends in the subject go into its graph):
  - declared `premise` edges from `premises:`;
  - **verified edges from references, not from footprints.** direct(v) = the nodes u whose `.holds` the proof of v uses: start at v's `.holds` `DeclFacts.refs` and follow references through declarations that belong to no node (untracked lemmas, defs) until a node's `.holds` is reached. One edge u→v (`where: 'proof'`) per u ∈ direct(v), plus one edge u→v with `conditional: true` per u ∈ on(v). (A footprint-based edge set would miss every derivation→goal arrow and make `proofDependents` report "nothing uses it" for a derivation that a goal's proof uses, so D→G would delete a `.holds` that others use — exactly what D-11 forbids.) Facts for a stale file: edges by name as above; no facts: no verified edges;
  - `lean-ref` edges: v's statement refs naming another node's statement (`where: 'statement'`);
  - **mismatch flags, only when v is proved or conditional**: closure(v) = transitive closure of direct(v) ∪ on(v); rests(x) = the assumption-level nodes x stands for ({x} unless x is proved or conditional, else its footprint nodes ∪ on). `declared-unused` (TL109, hint) on the premise edge p→v when p ∉ closure(v); `used-undeclared` (TL107, warning) on the verified edge u→v when u ∉ premises(v) and rests(u) ⊄ ⋃ rests(p) over p ∈ premises(v). So a proof that routes through a derivation of the declared premises is not flagged, and an unproved goal's declared premises are never "unused".
- `not-checked` when the node's module is failed/dependency-failed/not-built or no facts exist; `stale` when its file's hash differs from the facts.
- **Lean messages** become `BoardDiagnostic`s with code `LEAN`, the file and range; `nodeId` = the node whose bound declarations contain the message start (an error there makes that node `ill-formed`).

### 6.4 Vocabulary, "uses", refs, glosses, presuppositions
- **Vocabulary items** = declarations of the subject's modules (from the facts, else syntactic `DeclInfo`s) bound to no node, except auxiliary declarations with a `parent` (structure fields: shown inside their parent's item) and the presupposition instances below. Classification (D-3 simple shape check; "sort" = a project sort):
  - `axiom T : Type` → `sort`;
  - `axiom X : Nonempty T` with T a sort → `presupposition`, attached to T (`VocabItem.presupposes` / the sort's `presupposition`);
  - `instance : Nonempty T := <T's presupposition>` (anonymous or named) → **not listed** (plumbing for the chip). Lean prints it as a theorem (`Spyro.instNonemptyCharacter`) and the syntactic `DeclInfo` of an anonymous instance has no name: match facts to syntax by the declaration's start line;
  - an axiom whose `typeSort` is `Prop` and that is no node's `.holds` → `unmarked-axiom` + TL104 (a hidden assumption);
  - an axiom or opaque of type `A₁ → … → Aₙ → Prop` → `predicate` (arity n; n = 0 allowed, `axiom P0 : Prop`); + TL111 `shape-violation` when some Aᵢ is not a sort;
  - `opaque c : T` (T a sort) → `constant`; `opaque f : A₁ → … → B` (all sorts) → `function`; the same shapes declared with `axiom` → same kind + TL111 ("declare it `noncomputable opaque` so its existence presupposition shows": an axiom constant asserts existence silently);
  - other axioms (`axiom T : Type 1`, `Sort u`, non-sort data types, …) → `other` + TL111;
  - def/abbrev/structure/inductive/class/instance → `definition`, with `definitional-choice` (VocabFlag, and the StatusFlag on the node) when it lies in some node's statement closure (D-4; M1 only flags it). A Prop-valued def/abbrev without a block is an untracked statement, also a `definition`; its `.holds` axiom is an `unmarked-axiom` (TL104), its `.holds` theorem a `lemma`;
  - theorems → `lemma`.
  Without facts (syntactic mode, files never checked) the same rules run on the declaration text (keyword, the text after the name's `:`). Display order: sort, predicate, function, constant, presupposition, definition, lemma, unmarked-axiom, other; file order within a kind.
- **Gloss** = the docstring. `glossBy: 'user'` in M1 (no agent); M2 will mark agent-worded docstrings.
- **`lean.uses`** (request #23): the statement's own refs that name vocabulary items, then — breadth-first, first-occurrence order, no duplicates — those reached through referenced node statements and referenced vocabulary definitions (the statement closure). Sorts appear only where written (e.g. `∀ (g : Game)`). A name from another subject's vocabulary (explicit import, D-10) is kept fully qualified. Never hard-coded: no facts for the statement → `uses` absent and the webview hides the line; stale → kept by name.
- **`lean.refs`** (request #25): refs of the card's declarations that name a vocabulary item or a node's statement/`.holds` — the card's own included, e.g. `cynder_dark_past` in `axiom cynder_dark_past.holds : cynder_dark_past` (then `nodeId` is set) — with the range converted to `code`-relative positions; only when the file is fresh. Other refs (core constants such as `Nat`, elaborated projections such as `And.right`) are dropped.
- **`lean.presupposes`** (tray chips, D-3b): presupposition axioms in the statement's `#print axioms` list (constants force them through `Nonempty`; verified: `cynder_dark_past` → `Character.exists`; through other nodes' abbrevs too, since `#print axioms` is transitive).
- **`VocabItem.usedBy`** = nodes whose `uses` (or `presupposes`) contain the item.
- *(fix)* **Other subjects' items on a board**: `subjectGraph` appends the items of other subjects that the board's cards use (their `uses`, `presupposes` and code refs, plus the sort a used presupposition is about), read-only: `subject` stays the item's own, `shortName` is the fully-qualified name. Hover glosses and click-to-highlight then work for D-10 explicit imports too.

### 6.5 Diagnostic codes
Markup (WP1): TL001 malformed line; TL002 unknown field (kept); TL003 missing required field (`type`, `natural_name`; a missing `id` is TL112 instead); TL004 invalid value; TL005 duplicate field; TL006 duplicate written id (workspace-wide; WP2 reports it); TL007 dangling premise (WP2); TL008 newer markup version; TL009 block inside a doc comment; TL010 unterminated comment; TL011 info: ASSUMPTION without rationale (worded like the board's chip: "no source yet" for a rule, "no reason yet" otherwise); TL013 hint: attach a following declaration?; TL014 `example`/`mutual` cannot be bound; TL015 premise cycle (WP2); TL017 declaration bound twice (WP2); TL019 hint: lower-case type; TL112 info: block without id. No diagnostic for a missing version marker or for the `kind:` alias (03: "no nagging"). Lean/graph (WP2): TL101 bound declaration not found; TL102 warning: proof is conditional on unproved nodes, or rests on a goal asserted as an axiom; TL103 proof uses a non-node, non-vocabulary axiom; TL104 unmarked Prop axiom (hidden assumption); TL105 goal already proved; TL106 assumption has a proof; TL107 proof uses assumptions the declared premises do not cover; TL108 info: existence commitment (a presupposition the proof needs but no statement mentions); TL109 hint: declared premise unused by the proof; TL110 `autoImplicit` on (lakefile); TL111 vocabulary shape violation (6.4); TL113 statement is not a Prop abbrev/def; TL114 `n.holds` does not state `n`; TL115 uses `sorry`; TL116 goal asserted as an axiom; TL117 assumption without `.holds`; TL118 file not imported by the library root; TL120 block outside any subject; TL121 premise in another subject. Workspace (WP4): TL201 the project cannot be checked as it is (missing `lake-manifest.json`, Lake dependencies), TL202 history error. Lean messages: code `LEAN`, severity from Lean.

### 6.6 graph.json
Written by WP4 to `.telelean/graph.json` (gitignored) after every Lean refresh and every telelean edit; content from `toGraphJson` (WP2), whole project, snake_case, deterministic (sorted keys where order is not meaningful). The JSON Schema `packages/core/schema/telelean-graph-1.0.schema.json` is **generated from a zod schema** (`z.toJSONSchema`, zod 4.6.7 is installed; ajv is present only transitively, is not a declared dependency and must not be used or added), e.g. by a vitest test that rewrites it when `UPDATE_SCHEMA=1` (Node cannot import core's `.js`-specifier TypeScript directly); a test asserts the committed file equals the generated one and that the Spyro export validates. The zod schema lives in `export/schema.ts`, which `export/index.ts` must **not** re-export: the webview bundles `@telelean/core`, and zod must stay out of it. *(fix)* **Format 1.1**: `status.conditional_on` (the node ids a conditional proof takes as hypotheses; empty otherwise), and a conditional node's `footprint` is its real footprint (what the proof rests on, as for proved nodes; 1.0 listed the hypotheses there). The schema accepts 1.0 documents (the field is optional); the schema file keeps its name.

### 6.7 Escaping (D-8; verification FV-5)
A value is written raw unless it contains a comment delimiter, starts with `"`, contains a line break or control character, or has leading/trailing spaces; then it is a JSON string in which every `/` followed by `-` is written `\u002f` (so `/-` becomes the 7 characters backslash u 0 0 2 f -) and every other `/` preceded by `-` is written `\/` (so `-/` becomes `-\/`). The Markdown body, and docstrings written by `set-docstring`, use `-\/` and `/\-` (doc comments nest too). The D-9 mirror compares a docstring with `escapeBodyText(old natural_name)`. Programmatic edits are safe from the Lean extension's `\`-input rewriting (research r4).

---

## 7. Workspace layout, Initialize, subjects (WP4)

### 7.1 A model folder (D-10, D-12 as used in M1), with the exact texts

```
lakefile.toml                            byte copy of test-fixtures/spyro/lakefile.toml (library Model; see below)
lean-toolchain                           "leanprover/lean4:v4.35.0\n"
lake-manifest.json                       byte copy of test-fixtures/spyro/lake-manifest.json (verified: Lake 5.0 builds with it and never rewrites it)
.gitignore                               "/.lake/\n/.telelean/graph.json\n/.telelean/frozen/\n/.telelean/sessions/\n"
Model.lean                               "import Model.<S>\n" per subject, in creation order (maintained by telelean)
Model/<S>.lean                           subjectScaffold (core, implemented)
Model/<S>/Vocabulary.lean                subjectScaffold
Model/<S>/Inbox.lean                     subjectScaffold
Model/<S>/Main.lean                      subjectScaffold
.telelean/config.json                    serializeProjectConfig(defaultProjectConfig())   (the opt-in marker)
.telelean/graph.json                     export (gitignored)
.telelean/subjects/<S>/layout.json       serializeLayout(emptyLayout())   (column order; committed)
.telelean/subjects/<S>/attic/<id>.lean   archived declarations, appended with a "-- archived <ISO time> (<reason>): <declName>" header
```

`lakefile.toml` (the fixture's, 135 bytes):
```toml
name = "Model"
defaultTargets = ["Model"]

[leanOptions]
autoImplicit = false
relaxedAutoImplicit = false

[[lean_lib]]
name = "Model"
```
`subjectScaffold('Spyro', 'Model')` returns these four files (each text ends with one newline; `contracts.test.ts` guards them; the review built them plus the root above with Lean 4.35: 7 jobs, success):

`Model/Spyro.lean`
```lean
import Model.Spyro.Vocabulary
import Model.Spyro.Inbox
import Model.Spyro.Main
```
`Model/Spyro/Vocabulary.lean`
```lean
-- Vocabulary of Spyro: types, predicates and constants (the board lists them in its Vocabulary group).
namespace Spyro

end Spyro
```
`Model/Spyro/Inbox.lean`
```lean
import Model.Spyro.Vocabulary

-- New cards typed on the telelean board are added here.
namespace Spyro

end Spyro
```
`Model/Spyro/Main.lean`
```lean
import Model.Spyro.Vocabulary
import Model.Spyro.Inbox

-- Formalised cards: a statement `abbrev n : Prop := …` and its `n.holds`.
namespace Spyro

end Spyro
```
`create-subject` appends `import <library>.<S>` after the last import line of `<library>.lean` (creating the file with just that line when missing). Subjects = directories `Model/<S>/` holding `.lean` files, plus `Model/<S>.lean` files (names matching `SUBJECT_NAME_PATTERN`). Legacy layouts such as `test-fixtures/spyro` (no subject root, no Inbox) work: a missing Inbox is created on the first add (the subjectScaffold Inbox text), with its import added to `Model/<S>.lean` if that exists, else to `Model.lean`.

### 7.2 Initialize ("telelean: Initialize Model Here")
- `inspectFolder`: `empty` (nothing but hidden files and `.git`; carries the current `.gitignore` text if any); `model` (has `.telelean/config.json`); `lake-project` (`lakefile.toml` with a `[[lean_lib]]`, `lake-manifest.json` with no `packages`, and no `[[require]]`; library = the first `[[lean_lib]]` name; subjects = the library directory's subdirectories with subject names; carries `.gitignore`); else `unsupported` with a user-facing reason (only `lakefile.lean`; no `[[lean_lib]]`; no `lake-manifest.json`; Lake dependencies such as Mathlib: "not supported in M1; Mathlib needs an explicit opt-in (M4)"; other files in a folder without a lakefile). A Lake project on another toolchain is accepted (its board runs in syntactic mode, D-7).
- `planInitialize`: empty → every file of 7.1 with the first subject (the user types the name; the suggested default is the folder name as a capitalised identifier: `mental_model` → `MentalModel`, characters outside `[A-Za-z0-9_]` dropped, fallback `Subject`); lake project → `.telelean/config.json` (with the inspected `library`), `.gitignore` lines, one layout.json per subject. All files `before: null` except an existing `.gitignore` (`before` = its text; only the missing lines are appended).
- Then, if the root is not inside a git repository: a modal offer to `git init` (`initGitRepository`); declining leaves history unavailable, and the history dropdown keeps offering "Initialize git".

### 7.3 Subject picker and new subjects
The header shows `subject: [Spyro ▾]`; the menu lists subjects with node counts and "New subject…" (inline name field). `create-subject` writes `subjectScaffold(S)`, the layout.json, and adds `import Model.<S>` to `Model.lean` (created if missing). Ids stay unique across subjects; a board shows one subject; selections and the tray stay within it.

### 7.4 The sample `mental_model/`
WP4 writes it with plain file writes: the 7.1 project files (lakefile, toolchain, manifest, `.gitignore`, `Model.lean` = `import Model.Spyro\n`, config, an empty layout for Spyro), `Model/Spyro.lean` and `Model/Spyro/Inbox.lean` from `subjectScaffold('Spyro', 'Model')`, `Model/Spyro/Vocabulary.lean` as a byte copy of `test-fixtures/spyro/Model/Spyro/Vocabulary.lean`, and `Model/Spyro/Main.lean` = the fixture's Main.lean with one extra line `import Model.Spyro.Inbox` after the Vocabulary import (so every position in it is one line below the frozen sample's). The starting state is 03 §3.3: three assumptions (pg-no-dark-past code-less), one unproved goal. No `.lake/`, no `git init` (the folder sits inside `/home/zhengyew/telelean`, which must stay git-free; the user can accept the board's "Initialize git" offer). Tests always copy it to a scratch dir before building.

---

## 8. Undo vs history (WP4)

**Undo/Redo** (D-17): per root and subject, in memory (lost on window reload), at most 100 entries. An entry is the materialised `FileChange[]` of one action (whole-file before/after, sidecars included) plus its label. Undo of an entry: for each file, if the current text equals `after`, write `before`; otherwise apply the reverse patch (`diff` 9.0.0 `structuredPatch`/`applyPatch`, no fuzz) to the current text; a file created by the action is deleted only if unchanged; any failure refuses the whole undo (`conflict`: "<file> changed since; use History to revert"). The undo is applied like an action (snapshotted "Undo: <label>") and moves to the redo stack; a new action clears redo. Revert, undo and redo are themselves undoable.

**History** (D-33, A3): durable git snapshots, per subject.
- **Refs**: `refs/telelean/<rootKey>/subjects/<S>` (one chain per subject) and `refs/telelean/<rootKey>/project`; `rootKey` = `root` when the model root is the repository top level, else the relative path with `/`→`.`, other characters outside `[A-Za-z0-9._-]` → `_`, plus `-<8 hex of sha1(relpath)>`. *(fix)* Refs are shared by all worktrees of a repository, so in a linked worktree (`git worktree add`) the key gets `-wt<8 hex of sha1(its git dir relative to the shared one, e.g. worktrees/feature)>`; the main worktree keeps the plain key. Validate with `git check-ref-format`.
- **Snapshot** = a commit whose tree holds exactly the scope's files (`subjectSnapshotScope` / `projectSnapshotScope` in `paths.ts`; *(fix)* of a subject's sidecar folder only the files telelean writes, `layout.json` and `attic/*.lean`: anything else a user puts there is never snapshotted, reverted or deleted, since it may not survive being read as text), paths relative to the model root, parent = the chain's tip. Message: the label, a blank line, then trailers `Telelean-Action`, `Telelean-Subject`, `Telelean-Nodes`, `Telelean-Format: 1`. Author and committer `telelean <telelean@localhost>` (configurable), date = now. File contents come from the TextSource (what the user sees, unsaved typing included).
- **Plumbing only, never the user's index, branches or hooks**: `hash-object -w`, a temporary index file in a fresh temp dir (`GIT_INDEX_FILE`; *(fix)* the temp dir is `<gitDir>/telelean-tmp-*`, never the OS temp dir or the model folder; leftovers of a crash, older than 10 minutes, are removed on the next snapshot) or `mktree`, `write-tree`, `commit-tree`, `update-ref <ref> <new> <old>`; every call with `-c commit.gpgsign=false -c core.hooksPath=/dev/null -c gc.auto=0 -c core.fsmonitor=false`, env `GIT_TERMINAL_PROMPT=0` and the explicit author/committer environment. No `checkout`, `add` on the real index, `reset`, `gc`, `prune`, `push`, `fetch` or `remote`.
- **When**: before applying an action, each touched scope whose current files differ from its tip gets a "Manual edits" snapshot; after applying, each touched scope gets the action's snapshot; a subject with no chain gets "Initial state" when its board opens. Layout-only changes (re-order) are not snapshotted on their own (they ride along in the next snapshot); they are still undoable.
- **Revert to entry X** (subject S): snapshot S's current state if it differs from the tip (*(fix)* when history is ready but that snapshot fails, e.g. a stale `*.lock`, the revert refuses with `no-history` and changes nothing: a revert deletes and overwrites hand-made files, which must be in history first, A3), then write X's tree over S's scope (files in X written, files in scope but not in X deleted) through the EditApplier, labelled "Revert to: <X's label> (<time>)", snapshotted, undoable. Project files are never reverted by a subject revert.
- **Preview**: `historyDiff(subject, entryId, 'parent' | 'current')` → WP5 opens VS Code's multi-file diff (`vscode.changes`) on a read-only `telelean-history:` document provider.
- **Storage counter**: per subject `git rev-list --objects --disk-usage <subject ref> --not --branches --tags --remotes`; overall the same over all of the root's `refs/telelean/<rootKey>/…` refs; "disk, not RAM". Cache for 10 s.
- **Keep last N** (`prune`): recreate the chain's last N commits with the same trees, messages and dates (oldest kept becomes a root commit), `update-ref` with old-value check. No gc: git's own housekeeping reclaims the space later (the counter drops at once because it counts reachable objects).
- **Unavailable**: no repository → `no-repo` (offer `git init`); no git → `git-missing`; setting off → `disabled`. Actions still work without history.

---

## 9. Work packages (parallel; no overlapping owned paths)

| WP | Title | Owned paths |
|---|---|---|
| WP1 | core markup and Lean-text primitives | `packages/core/src/markup/**`, `packages/core/test/markup/**`, `packages/core/test/fixtures/markup/**` |
| WP2 | core model, statuses, vocabulary, edit planning, graph.json | `packages/core/src/project/**`, `packages/core/src/edit/**`, `packages/core/src/export/**`, `packages/core/src/graph.ts`, `packages/core/src/kindChange.ts`, `packages/core/src/layout.ts`, `packages/core/src/paths.ts`, `packages/core/schema/**`, `packages/core/scripts/**`, `packages/core/test/{project,edit,export}/**`, `packages/core/test/fixtures/{project,edit,export}/**` |
| WP3 | runner semantic layer (Lean facts) | `packages/runner/src/semantic/**`, `packages/runner/src/lean/**`, `packages/runner/test/semantic/**`, `packages/runner/test/lean/**`, `test-fixtures/semantic/**` |
| WP4 | runner workspace, history, undo, Initialize, sample | `packages/runner/src/workspace/**`, `packages/runner/test/workspace/**`, `test-fixtures/workspace/**`, `mental_model/**` |
| WP5 | VS Code extension host | `packages/extension/src/**`, `packages/extension/test/**`, `packages/extension/scripts/**`, `packages/extension/{package.json,tsconfig.json,vitest.config.mts,.vscode-test.mjs}`, `packages/extension/dist/extension.js{,.map}`, `packages/extension/out/**` |
| WP6 | webview board UI | `packages/webview/**`, `packages/extension/dist/webview/**` (Vite output) |

Frozen, owned by the integrator: `packages/core/src/{index,model,facts,actions,protocol,notImplemented}.ts`, `packages/core/src/samples/**`, `packages/core/test/{protocol,samples,contracts}.test.ts`, `packages/core/test/raw-imports.d.ts`, `packages/core/{package.json,tsconfig*.json,vitest.config.ts}`, `packages/runner/src/index.ts`, `packages/runner/src/llm/**`, `packages/runner/{package.json,tsconfig.json,vitest.config.ts}`, `packages/extension/.vscode-test/**` (the downloaded VS Code; never modified), root files, `docs/**` except section 14 entries. Builders needing a change there record it in their report's open issues.

**Working rules for builders.**
- Code against the frozen contracts; when you need another package's function, call it (it is a stub until integration) and gate the test with `isImplemented(...)`. Optional test hooks you add to a frozen interface (e.g. injectable core functions in `ModelWorkspaceOptions`) are additive changes: record them in section 14.
- Builders run in parallel on one machine: check `free -m` before a heavy step and wait while MemAvailable is under 12 GB; one heavy process per builder at a time. When you check for leftover `telelean-*` systemd units or processes, look only at names containing your own run id/pid: other builders may be running Lean at the same moment.
- WP5 does not run `npm run build:all` or the webview build (that writes WP6's `dist/webview`); it tests against whatever bundle is there. WP6 does not run the VS Code smoke test. The integrator runs both together.
- Do not change the VS Code test version (1.140.0 is already downloaded; another would download ~350 MB) and do not add npm packages.
- Keep M0 behaviour unless the plan changes it; update M0 tests you own when the plan changes their expectations, and say so in your report.
- Never commit a `.telelean/config.json` outside `mental_model/` and `test-fixtures/`; tests create it inside their scratch copies.

The complete briefs and acceptance tests are in the reviewed structured report (summarised per WP here):
- **WP1**: port the research lexer/parser/binder (`verbatim_prompt_log/bundle_1/subagent_reports/research_workflow/artifacts/r4-markup-lsp/proto/telelean_ref.py`) to TypeScript under the 02/03 rules (`type` canonical, `kind` alias silent, no DEFINITION kind, no TL016/TL018, premises allowed on any node), with the command starts of 6.1, plus serializer, ids, text edits and `applyLeanOps` (binder-first `add-hypothesis`, escaped `set-docstring`).
- **WP2**: `buildProjectModel`, `subjectGraph`, statuses and reference-based edges (6.3), vocabulary and card data (6.4), diagnostics (6.5), `planAction`/`planKindChange`/`planDelete` (6.2, D-18), `toGraphJson` + zod schema (6.6).
- **WP3**: `refreshLeanFacts` (section 4) with fixtures for success, build error, sorry, conditional proof, derivation used by a proof, hidden axiom, toolchain mismatch, dependency project, low memory, cancellation.
- **WP4**: `createModelWorkspace` (sections 2, 3, 8), `inspectFolder`/`planInitialize`/`findModelRoots`/`initGitRepository` (7.2), the sample (7.4).
- **WP5**: activation/opt-in, Open Board/Initialize/Refresh, BoardPanel per root with serializer, EditApplier/TextSource, watchers and refresh triggers, protocol dispatch, clipboard, open-in-editor, history diff provider, colours, isolated test profile, smoke tests on a copy of `mental_model/`.
- **WP6**: vocabulary group, card face/expanded view with the four turn-9 requests, Depends on/Used by, legend, inline edit, delete dialog, drop zones with `kindChangeImpact` text and the A→G/D→G dialog, reorder, A|D|G box with stance/why/source, tray with presupposition chips, subject picker, history dropdown, Lean badge/problems, Undo toast and Ctrl+Z, harness and Playwright tests with isolated HOME.

---

## 10. Test isolation and resource rules

- **Temp dirs**: tests create scratch trees under `$TELELEAN_TEST_TMP` (runner helper `makeTempRoot`); builders set it to their scratch dir. When it is unset, tests use a fresh `mkdtemp` under `os.tmpdir()`, never anything under the real `$HOME`. Never build inside `mental_model/` or `test-fixtures/` (copy first).
- **Chrome (Playwright, WP6)**: `launchOptions.env` gets `HOME`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, `XDG_DATA_HOME` pointing into the run's short temp dir (the one `chrome-tmp.ts` already makes for `TMPDIR`), plus `--disable-crash-reporter --disable-breakpad --no-first-run`; the npm script runs `sh -c 'ulimit -c 0; playwright test'`. One worker.
- **VS Code (WP5)**: a pretest script makes `$TELELEAN_TEST_TMP/vscode-<pid>/{home,xdg-config,xdg-cache,xdg-data,user-data,extensions,ws}` (passing the path to `.vscode-test.mjs` through an environment variable), copies `mental_model/` to `ws/mental_model` (until WP4 has written it: `test-fixtures/spyro` plus a generated `.telelean/config.json` and empty layout, in the copy only), and writes `user-data/User/settings.json` with `"chat.disableAIFeatures": true`, `"telemetry.telemetryLevel": "off"`, `"update.mode": "none"`, `"extensions.autoUpdate": false`, `"extensions.autoCheckUpdates": false`, `"workbench.enableExperiments": false`, `"security.workspace.trust.enabled": false`. `.vscode-test.mjs` passes `--user-data-dir`, `--extensions-dir` (test-electron adds its own `.vscode-test/user-data` only when these are absent: verified in `@vscode/test-electron` 3.1.0 `util.js`), `--disable-extensions`, `--disable-telemetry`, `--disable-workspace-trust`, and env `HOME`/`XDG_*` to those dirs, `ELAN_HOME=/home/zhengyew/.elan` (read-only use by runLean), `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`; `DBUS_SESSION_BUS_ADDRESS`/`XDG_RUNTIME_DIR` stay (systemd-run --user needs them). Script: `sh -c 'ulimit -c 0; env -u ELECTRON_RUN_AS_NODE xvfb-run -a npx vscode-test'`. Afterwards assert that the isolated `user-data` dir was used (files appeared in it) and that nothing new appeared in the real `~/.copilot`, `~/.config/Code`, `~/.config/google-chrome` (compare listings before/after in the test script).
- **Git in tests** (WP4/WP5): only in scratch repositories; `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_CEILING_DIRECTORIES=$TELELEAN_TEST_TMP` (discovery never leaves the scratch tree), the safe `-c` flags, explicit author.
- **RAM**: `free -m` before heavy steps; one heavy process at a time (one `lake build`, one VS Code instance, one browser); vitest `fileParallelism: false`; `LEAN_NUM_THREADS=4`; every Lean process under runLean's memory cap; `ulimit -c 0` in every test script that starts Lean, Chrome or VS Code.

---

## 11. Integration plan (after the builders)

1. Confirm the builders' owned-path discipline (no edits outside their paths; section 14 entries for additive contract changes) and resolve open issues against frozen files.
2. Remove `isImplemented` skip gates; typecheck all packages; run `cd packages/core && npm test`, runner `vitest run` (semantic + workspace + M0), webview unit, extension unit.
3. **End-to-end runner test** (new, integrator-owned under `packages/runner/test/integration/`): a scratch copy of `mental_model/` + a fs `EditApplier` + `git init` in the copy: `load` → Spyro graph (4 nodes, layout order) → `refreshNow` → `fresh`; cynder-dark-past/new-spyro-pg `assumed`, the goal `none`, 9 vocabulary items, `uses`/`refs`/`presupposes` = the sample's → add (Inbox.lean gets a block, layout appended) → edit sentence (docstring mirror follows; an adjacent binding gets pinned) → set-premises → reorder → G→A on the goal (axiom added; refresh: `assumed`) → undo/redo → with the proved overlay applied by hand: A→G on an assumption the goal's proof uses, once with mark-broken and once with rewrite (after the rewrite the goal is `conditional` on it) → a derivation proved by a theorem and used by a goal's proof: the verified edge derivation→goal exists and D→G asks for confirmation → delete → history listing, storage counter > 0, revert (and undo the revert) → graph.json validates against the schema. Assert `git status --porcelain` and `.git/index` untouched, `HEAD` unchanged, no hook ran. Re-check WP2's hand-written `spyro-facts.json` against WP3's real facts for the fixture and fix whichever side is wrong.
4. **Lean round-trip of escapes**: write sentences with `-/`, `/-`, `/-/`, `-/-`, `"`, a newline into blocks via `renderBlock`/`setBlockField` (and a docstring via `set-docstring`), build under runLean, assert success and re-parse equality.
5. Webview build + Playwright (isolated HOME); extension build + VS Code smoke (isolated profile); one at a time; check the real home folders afterwards.
6. Rebuild `packages/extension/dist` (extension + webview) so the user's installed copy shows M1 after "Developer: Reload Window"; write `docs/m1-report.md` and the decisions log for the user.

---

## 12. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | `.ilean` is an internal format (v5 on 4.35) | The toolchain is pinned (D-7); unknown versions degrade to "no refs/uses" with a clear detail, never wrong data |
| R2 | In-place builds race the user's Lean server on the same `.lake` | Lake has **no** build lock (removed in lean4#2445; see `Lake/Util/Lock.lean` in the toolchain sources), so races are possible when a save makes both rebuild (the user's server rebuilds imports when a file is restarted). The likely cost is a redundant rebuild; a damaged artifact would show as an import error on the board, fixed by the next build or by cleaning `.lake`. One telelean refresh at a time; a failed refresh keeps the previous facts and retries on the next save; documented. A private build shadow (sources synced into extension storage) is the fallback if this bites in practice |
| R3 | Lean message columns are code points, LSP needs UTF-16 | WP3 converts using the line text; a fixture with a non-BMP character tests it (`.ilean` columns are already UTF-16: verified) |
| R4 | Applying an edit saves the user's unsaved changes in that file | Documented (D-17 "edits are saved immediately"); the EditApplier refuses when the file changed since the plan; undo reverses only telelean's change |
| R5 | Chrome starts a native drag from text inside a draggable card | CSS cannot prevent it: Chromium's drag source search walks up from the text node to the nearest `draggable=true` ancestor, skipping children with `draggable="false"` or `-webkit-user-drag: none`. So WP6 sets the card's `draggable` attribute to `false` on `pointerdown` inside `.tl-lean` (restoring it on `pointerup`/`pointercancel`/blur) — the drag decision happens after pointerdown — and keeps `canDrag` false for such drags plus `user-select: text` on the code. AT6.16 proves it |
| R6 | D-11 mechanical rewrite edits proof text | Only with fresh facts and exact ref spans; refused when a user is not a theorem or a use is invisible to the references; refresh verifies; undo restores; `mark-broken` is the alternative |
| R7 | Parallel stubs hide integration bugs (WP2 edit tests need WP1) | Skip gates + the integrator's end-to-end test (11.3) |
| R8 | The extension bundle must not depend on `llm/confinement.ts`'s `import.meta.url` | WP5 imports the runner subpaths it needs (`semantic`, `workspace`) or esbuild `define`s `import.meta.url`; the integrator checks the bundle loads |
| R9 | Snapshot plumbing could touch the user's repo state | Plumbing only, temp index, explicit flags (incl. fsmonitor off); tests assert index/HEAD/status/hooks untouched |
| R10 | Undo after hand edits | Reverse patches without fuzz; refusal points to History |
| R11 | `workspaceContains` may not see dot-directories in some setups | WP5 smoke test checks activation on the copied sample; commands activate the extension anyway |
| R12 | Board graph rebuilt per keystroke | Parse cache by path+hash; debounce; research measured 27k lines in ~145 ms (Python). *(fix)* `buildProjectModel` was quadratic in the pinned blocks of a file (each block re-scanned the text before it for its namespace): blocks now carry their namespace from the parser, other per-block scans use binary search. Measured (one file, n pinned cards, syntactic): n=1600 build 18 ms, keystroke 57 ms, edit 143 ms; n=3200 45 / 119 / 293 ms (before: n=1600 6.2 s / 6.2 s / 12.8 s) |
| R13 | A model inside a project with Lake dependencies (Mathlib) would build or import gigabytes | Refused in M1: `inspectFolder` returns `unsupported`, `refreshLeanFacts` returns `unsupported-project` without spawning (D-28 opt-in is M4) |
| R14 | Lean's printed output is parsed as text (`#check`, `#print`, `#print axioms`) | Formats verified on 4.35 by the architect and the review (wrapping, instances printed as theorems, `type_of%` sorts); the toolchain is pinned; anything unparsable becomes a `check-errors` detail, never a guessed status |

---

## 13. Decisions log

### 13.1 Minor decisions taken (for the user to review later)
1. **Opt-in marker** is `.telelean/config.json` (not `layout.json` as in 03 §6): config and layout are separate files.
2. **Per-subject sidecars** under `.telelean/subjects/<S>/` (layout.json, attic/; later decisions, attempts): D-12's root-level files, split by subject so a subject's history and revert stay self-contained.
3. **Per-subject history chains** (`refs/telelean/<rootKey>/subjects/<S>`) plus a project chain: revert touches only one subject; the storage counter is per subject and overall, as A3 asked.
4. **Layout-only changes are not snapshotted** on their own (still undoable); they ride along in the next snapshot.
5. **Pruning does not run `git gc`** on the user's repository; the counter drops at once, the disk space returns at git's next housekeeping.
6. **`mental_model/` is not `git init`ed by telelean's builders**: it lives inside the git-free telelean folder; the board offers "Initialize git".
7. **M1 "These suffice" declares support only** (writes `premises:`, D-13) and says that proving with Claude arrives in M2; with zero premises ("Self-evident?") it answers "available from M2".
8. **Strict D-2(b)**: a block bound to anything but a Prop abbrev/def is flagged TL113 (ill-formed) rather than guessed.
9. **New subject scaffold import order**: Vocabulary ← Inbox ← Main (Main imports Inbox), so hand-formalised Inbox nodes can be used by Main.
10. **`uses:`** = statement closure through other nodes' statements and vocabulary definitions; sorts listed only where written; inline the first 2 names then `, …`, with a `▾ N` dropdown. Clicking a node's name in the code reveals that card (an extension of the user's vocabulary-highlight idea).
11. **Glosses are shown as the user's wording in M1** (no agent yet); M2 marks agent-worded docstrings.
12. **Instances that only re-export a presupposition** are not listed as vocabulary.
13. **`wording.jsonl` and `attempts.jsonl` are not written in M1** (snapshots keep old wordings; attempts start with runs in M2).
14. **graph.json schema from zod** (`z.toJSONSchema`), because ajv is not a declared dependency and no package may be added.
15. **Runner `build` = typecheck** (`noEmit`); core is imported from source through tsconfig `paths` / vitest aliases, as the extension and webview already do.
16. **Applying an edit saves the file**, including any unsaved typing in it (D-17).
17. **Lean refresh runs in place** in the model folder (sources read-only, `.lake` writable, `.git` masked), as 03 §8.4 specifies, not in a shadow.
18. **No port-drag arrows in M1** (the tray declares support); keyboard/menu equivalents for kind changes are buttons in the expanded card.
19. **Theme colours**: contributed ids keep exactly one dot and get explicit per-theme hex defaults (no `charts.*`), plus `telelean.vocabulary` and `telelean.highlight`.
20. *(review)* **Verified arrows come from Lean's references, footprints from `#print axioms`**: a goal proved through a derivation shows the arrow from that derivation (not from the derivation's assumptions), while its footprint still lists exactly the assumptions it rests on.
21. *(review)* **Declared-vs-verified mismatches are judged at the assumption level**: a proof that routes through a derivation of the declared premises is not flagged; an unproved goal's premises are never "unused".
22. *(review)* **Stale files keep their previous facts by name** while the declaration keyword is unchanged (flag `stale`), so statuses do not flicker while typing; a theorem Lean has not checked never shows as proved.
23. *(review)* **The mechanical D-11 rewrite adds the hypothesis as the first binder** and refuses when a dependent is not a theorem or a use is invisible to Lean's references (choose "mark broken" then).
24. *(review)* **Projects with Lake dependencies (Mathlib) are refused in M1**, both by Initialize and by the refresh: D-28 asks for an explicit opt-in (M4), and building them breaks the RAM rule.
25. *(review)* **Hidden assumptions are recognised by Lean's sort check** (`#check type_of% @N` = `Prop`) rather than by guessing from the type text; an `axiom c : T` constant is flagged (TL111) because it asserts existence without a visible presupposition.
26. *(review)* **Exact scaffold texts are frozen and implemented with the contract** (`subjectScaffold`), so Initialize, New subject and the sample write identical files.
27. *(review)* **Adjacent bindings are pinned on the next telelean edit** of the block (`lean:` written, D-8), like the derived-id write-back.
28. *(review)* **The host always derives new ids itself** (`deriveId`, `n-<hex>` for non-Latin text); the webview's provisional id only matches its optimistic card.
29. *(review)* **The M0 legend (D-15) gains the conditional and mismatch arrows, and the expanded card gets "Depends on / Used by" lists** (03 §7; also the keyboard/screen-reader route); an ASSUMPTION with declared premises shows D-13's hint "you think this follows from those — prove it?".
30. *(review)* **The vocabulary group's collapsed state lives in the webview state** (per board, survives reloads), not in layout.json (writing a file per toggle would flood undo and history).
31. *(review)* **A model workspace lives until the window closes** (created when its first board opens), so undo survives closing and reopening the board; Lean refreshes still run only while a board is open.

### 13.2 Major decisions needing the user
None. Every M1 item follows the approved design; the choices above are reversible defaults.

---

## 14. Contract change log (builders append; additive changes only)

| Date | WP | File | Change |
|---|---|---|---|
| 2026-11-01 | architect | (all) | initial freeze |
| 2026-11-01 | review | `core/src/model.ts` | `ProofStatus.conditional.footprint?`; docs: `uses` closure through definitions, verified-edge semantics on `TlEdge`, `TlGraph.version` seeding |
| 2026-11-01 | review | `core/src/facts.ts` | `FactsStatus` + `unsupported-project`; `DeclFacts.typeSort?`; docs: `kind: 'instance'` from the source, whitespace-normalised `type`, zero-width Lake message ranges, full message text |
| 2026-11-01 | review | `core/src/markup/types.ts` | docs: `add-hypothesis` binder right after the name, `apply-hypothesis` includes a preceding `@`, `set-docstring` body escapes, column-0 `--` ends a declaration span |
| 2026-11-01 | review | `core/src/edit/index.ts` | `subjectScaffold` implemented (exact texts of 7.1); docs: `planKindChange` refusals, `planDelete` statement dependents |
| 2026-11-01 | review | `core/src/project/index.ts`, `core/src/graph.ts`, `core/src/paths.ts` | docs: stale-by-name facts; `verifiedEdges` is a sample helper (the builder uses references); project chain name |
| 2026-11-01 | review | `core/test/contracts.test.ts` | tests for `subjectScaffold` |
| 2026-11-01 | review | `core/src/samples/spyro.ts` | `spyroProvedGraph()` corrected to the overlay it cites: `loc` of all four blocks, pg-no-dark-past `binding: 'pinned'`, its docstring line in `code` (`SPYRO_LEAN.pgNoDarkPastNormative`), `codeLoc` 13–15, refs one line down |
| 2026-11-01 | review | `core/test/raw-imports.d.ts` (new, integrator-owned) | ambient `*?raw` module type so core tests can read fixture files without Node typings |
| 2026-11-01 | review | `runner/src/workspace/types.ts`, `workspace/index.ts` | `FolderInspection.empty/lake-project.gitignore?`; docs: dependency projects `unsupported`, `EditApplier` checks `before`, `planInitialize` gitignore handling |
| 2026-11-01 | review | `runner/src/semantic/types.ts` | docs: project check (`unsupported-project`), `type_of%` probe |
| 2026-11-01 | WP1 | `core/src/markup/edits.ts`, `markup/api.ts` | new export `setBlockFields(file, block, changes: readonly BlockFieldChange[]): TextEdit[]` and type `BlockFieldChange` (several fields of one block in one call, so a derived id is written once); `setBlockField` delegates to it, behaviour unchanged |
| 2026-11-01 | WP1 | `core/src/markup/serializer.ts` (`escapeBodyText`) | behaviour extension: a leading `--` (after whitespace) is written `\--`, besides `-/` → `-\/` and `/-` → `/\-` (Lean 4.35 skips whitespace and comments right after `/--`, so `/-- -- x -/` would be unterminated; verified on the toolchain) |
| 2026-11-01 | WP1 | `core/src/markup/values.ts` (`escapeJsonValue`) | also escapes C1 control characters and U+2028/U+2029 as `\uXXXX` (still the documented rule) |
| 2026-11-01 | WP1 | `core/src/markup/api.ts` | structure only: re-exports from lexer/text/parser/decls/values/serializer/ids/edits/leanOps/names; `findDecl`, `relativeName`, `ID_PATTERN` moved verbatim to `names.ts`/`ids.ts` |
| 2026-11-01 | WP2 | `core/src/edit/index.ts` | structure only: `subjectScaffold` moved verbatim to `edit/scaffold.ts` and re-exported (no circular import with the planner) |
| 2026-11-01 | WP3 | `runner/src/semantic/index.ts` | new exports: helper modules text/project/lakeLog/ilean/checkFile + `declDrafts`, `gitMaskPaths`, `messageFacts`, `rootRelativeFile`, `toDeclFacts`, `DeclDraft` |
| 2026-11-01 | WP4 | `runner/src/workspace/types.ts` | `ModelWorkspaceOptions.core?: Partial<WorkspaceCore>` (test hook) + `WorkspaceCore` interface |
| 2026-11-01 | WP4 | `runner/src/workspace/index.ts` | exports `fsTextSource`, `fsEditApplier`, `suggestSubjectName`, `GITIGNORE_LINES`, `SCAFFOLD_*`; `planInitialize`: the subject name is used (and checked) only for an empty folder |
| 2026-11-01 | WP5, WP6 | – | no contract changes |
| 2026-11-01 | integrator | `core/src/project/types.ts` (+ `project/lakefile.ts`) | `ProjectInput.lakefile?: { path; text }`: TL110 (`autoImplicit` on) is computed when given (warning, project-level, on every board and in graph.json); the workspace passes `lakefile.lean` or else `lakefile.toml` and re-reads it on change |
| 2026-11-01 | integrator | `runner/src/workspace/initialize.ts`, `fsAdapters.ts` | `GITIGNORE_LINES` gains `/.telelean/*.tmp` (the 7.1 `.gitignore` text gets a fifth line, `mental_model/.gitignore` too); `fsEditApplier` writes its temp files into `.telelean/` (graph.json's already were) |
| 2026-11-01 | integrator | `runner/src/workspace/modelWorkspace.ts` | an undo entry is never recorded under subject `''`: a project-level plan goes to the new subject's stack (create-subject), else the layout's or the card's subject |
| 2026-11-01 | integrator | `core/src/kindChange.ts` | impact texts agree in number ("1 proof uses it", "2 proofs use it") |
| 2026-11-01 | integrator | `core/package.json`, `runner/package.json` | declare `zod` 4.6.7 under `dependencies` (the version installed at the root; nothing installed, lockfile untouched) |
| 2026-11-01 | integrator | extension `logic/boardSession.ts` | a refusal answering a request id is shown once (the webview's toast; the host adds a notice only without a request id); a declined "Initialize git" is an info outcome, not an error |
| 2026-11-01 | integrator | webview `board/diagnostics.ts` | the `rendered` diagnostic also reports the resolved `vocabulary` and `highlight` colours (the VS Code colour smoke test now requires them) |
| 2026-11-01 | integrator | risk R5 (12) | correction from WP6's negative controls: in Chrome 155 each mechanism alone (the card's `draggable` toggle, or `canDrag` false) keeps text selection working; both stay. The integrator's VS Code end-to-end test fails as expected with the guard switched off |
| 2026-11-01 | integrator | 6.7 / research note r4 | correction from WP1's probes: Lean 4.35's comment nesting scan starts after the third character (`/-/-/` is one comment), and Lean skips whitespace and comments right after `/--` and `/-!`; the lexer follows Lean |
| 2026-11-01 | integrator | `runner/src/semantic/types.ts` | docs only: the build is `lake build <library>` |
| 2026-11-01 | integrator | tests | skip gates removed (core, runner, extension), the stub test deleted, the `NotImplementedError` sample fallbacks removed from the extension's real path; new: runner `test/integration/` (11.3, 11.4), extension `test/suite/e2e.test.ts` (drives the board webview over the DevTools protocol of its own isolated test instance: `.vscode-test.mjs` now has two configurations, `smoke` and `e2e`), runner `tsconfig.test.json` |
| 2026-11-01 | integrator | `runner/src/workspace/git.ts` | git gets no stdin pipe unless there is input (avoids "Unexpected SIGPIPE" in VS Code's extension host log when git exits before its stdin is closed) |
| 2026-11-01 | fixer (core+runner) | `core/src/actions.ts`, `core/src/protocol.ts` | `BoardAction` `delete-node` and message `deleteNode` gain optional `confirmed?: boolean` (validated as a boolean); without `keepLean`, a delete that breaks other declarations is refused with `needs-confirmation` (dependents = cards, then untracked names) unless confirmed |
| 2026-11-01 | fixer (core+runner) | `core/src/markup/types.ts` | `LeanOp` gains `drop-arguments` (`{ decl, args, replace }`: each occurrence must be applied to exactly `args` plain identifiers in parentheses; the application becomes the occurrence) and `add-hypothesis` gains optional `applied?: number` (each whole application is replaced by the hypothesis); `add-hypothesis` accepts a leading `@`; `MarkupBlock` gains optional `namespace?: string[]` (set by the parser); doc of `DeclInfo.span`: the column-0 comment rule |
| 2026-11-01 | fixer (core+runner) | `core/src/markup/decls.ts`, `markup/values.ts` | new exports `isCommandWord`, `LIST_FIELD_KEYS`, `noRationaleMessage`; `DeclScan.namespaceAt` |
| 2026-11-01 | fixer (core+runner) | `core/src/export/graphJson.ts`, `export/schema.ts`, `schema/telelean-graph-1.0.schema.json` | graph.json format 1.1: `status.conditional_on` (optional in the schema, always written); a conditional node's `footprint` is its real footprint |
| 2026-11-01 | fixer (core+runner) | `core/src/edit/dependents.ts` | `usersOf`/`factUsers`/`textUsers` take `{ transitive?: boolean }`; the text scan also resolves through `open`ed namespaces and counts dotted suffixes of two or more components |
| 2026-11-01 | fixer (core+runner) | `core/src/edit/planKind.ts` | new exports `holdsArguments`, `referenceSpans` |
| 2026-11-01 | fixer (core+runner) | `core/src/project/text.ts` | new export `namespaceTable` (one-pass namespace lookup) |
| 2026-11-01 | fixer (core+runner) | `runner/src/workspace/semanticSummary.ts` | new export `DROPS_FACTS` (`unsupported-toolchain`, `unsupported-project`: the workspace drops the facts in use) |
| 2026-11-01 | fixer (core+runner) | `runner/src/semantic/refresh.ts` | new export `spawnMemoryMax`; the guard runs before the check spawn too |
| 2026-11-01 | fixer (core+runner) | `runner/src/workspace/git.ts`, `history.ts`, `files.ts` | `RepoInfo.worktree?`, `rootKeyOf(prefix, worktree?)`, `stderrSummary`; `SNAPSHOT_TEMP_PREFIX`; `isSubjectSidecarFile`, `isSubjectScopeFile` |
| 2026-11-01 | fixer (extension+webview) | extension `logic/boardSession.ts` | `BoardSessionPorts.post` resolves without waiting for the webview to receive the message (delivery is only logged and reported) |
| 2026-11-01 | fixer (extension+webview) | extension `api.ts` | `TeleleanApi.onDidPostToBoard` fires once VS Code reports delivery (not when the post is sent); `TeleleanApi.restoreBoard` resolves as soon as the restored panel shows the board, before the model session is attached |
| 2026-11-01 | fixer (extension+webview) | extension `logic/editApplier.ts` | `WorkspaceEditPort` gains optional `prepare(absPaths)` (open the documents before the `before` check); `CheckedEditApplierOptions` gains `onUnsaved(paths, label)`: an applied change whose file could not be saved resolves (recorded for Undo) and is reported; a partly applied batch is changed back |
| 2026-11-01 | fixer (extension+webview) | extension `logic/groups.ts` (new) | `groupBesideBoard` and helpers: where "Open in editor" and the history preview open (another editor group, or one split of the board's group) |
| 2026-11-01 | fixer (extension+webview) | refresh triggers (section 2) | a Lean file written by another program (file watcher) also requests a Lean refresh (`requestRefresh('files')`, board open only); echoes of the user's own saves and changes under a dirty editor are ignored. |
| 2026-11-01 | fixer (extension+webview) | webview `state/store.ts` | `TrayModel.dropped`; new store actions `theseSuffice(mode?: 'replace' \| 'add')` and `moveCard(id, delta)`; `Toast.undoable` narrowed to "newest undoable toast", new export `toastCanUndo(toast, workspace)`; new export `MAX_TOASTS` (3) |
| 2026-11-01 | fixer (extension+webview) | webview `board/geometry.ts` | `FrameInput.obstacles` and `PathSpec.routed` (a focused arrow that skips the Derivations column is routed through a gap) |
| 2026-11-01 | fixer (extension+webview) | webview `model/cardData.ts`, `model/format.ts`, `common/InlineCode.tsx` (new) | `staleChip(checking)`; `codeSpans`, `plainText`, `sentences` (backtick spans as code, tooltips without them) |
| 2026-11-01 | closing fixer | extension `logic/actionMapping.ts` | `deleteNode` maps `confirmed` to the `delete-node` action (`...(confirmed ? { confirmed } : {})`) |
| 2026-11-01 | closing fixer | webview `state/store.ts` | `DialogState` `delete` gains optional `dependents` (the host's needs-confirmation list: the dialog asks again with "Delete anyway"); `deleteNode(id, keepLean, confirmed?)` posts `confirmed: true` (only without `keepLean`); a delete's `needs-confirmation` re-opens the dialog instead of an error toast. The `dependents` dialog's `summary`/`detail` come from the host's answer when the board's own impact did not ask about the same dependents |
| 2026-11-01 | closing fixer | extension `logic/changeBatcher.ts` | new export type `EchoStream` (`'editor' \| 'disk'`); `SelfWrites.isEcho(absPath, text, stream = 'editor')` and `has(absPath, stream = 'disk')`: every text recorded in the last 5 s per path counts (the oldest match since the stream's last match), a mismatch forgets the recorded texts for that stream only |
| 2026-11-01 | closing fixer | `runner/src/workspace/types.ts` | docs only: `EditApplier.apply` may resolve when the change is applied but a file could not be saved (the change stays in its editor, which the TextSource reads; the extension asks the user to save it) |
| 2026-11-01 | closing fixer (round 2) | `core/src/actions.ts` | new type `DependentCard` (`{ subject, type, naturalName }`); the failed `ActionOutcome` gains optional `dependentCards?: Record<string, DependentCard>`: for `needs-confirmation`, the cards among `dependents` in any subject (the extension host fills it; the board shows another subject's card by its sentence) |
| 2026-11-01 | closing fixer (round 2) | `core/src/kindChange.ts`, `core/src/edit/planAction.ts` | texts only: the preview says "No card on this board uses it." (was "Nothing uses it."; the impact is computed from the graph alone); the delete refusal for one dependent is in the singular ("…, which stops compiling.") |
| 2026-11-01 | closing fixer (round 2) | extension `logic/boardSession.ts` | a `needs-confirmation` `actionResult` carries `dependentCards`, looked up in every subject's graph (the board's subject first) |
| 2026-11-01 | closing fixer (round 2) | extension `logic/changeBatcher.ts` | `SelfWrites.matches(absPath, text, stream = 'editor')` (like `isEcho`, but records nothing); new export `isDiskEcho(sources, absPath, readText)`: the file watcher's echo check, which reads once and asks every source before any of them forgets |
| 2026-11-01 | closing fixer (round 2) | webview `state/store.ts` | `DialogState` `dependents` and `delete` gain optional `cards` (the outcome's `dependentCards`) |
| 2026-11-01 | closing fixer (round 2) | extension `test/suite/cdp.ts` | new test helpers `clearWorkbenchToasts(page)` and `settleStartupToasts(page)`: the end-to-end suite clears VS Code's own notification toasts (the startup one about `--disable-extensions` once it has appeared, any other before each test); the launch arguments of section 10 are unchanged |

---

## 15. What the independent review changed (2026-11-01)

Evidence: a scratch copy of the Spyro fixture with extra declarations, built with the toolchain's own `lake` (`~/.elan/known-projects` unchanged), plus the toolchain's Lake sources.

1. **Verified edges and D→G dependents were wrong for derivations.** `#print axioms` lists only axioms, so `theorem g2.holds : g2 := d0.holds.2` never mentions `d0`; footprint-based edges would draw no d0→g2 arrow, and `proofDependents` would let D→G delete `d0.holds` while g2 uses it (D-11 violation). Fixed: verified edges from `.ilean` references (6.3); TL107/TL109 redefined at the assumption level.
2. **The rewrite inserted the hypothesis after existing binders**, which makes `(c h)` pass `h` to the wrong parameter whenever c has its own hypotheses. Fixed: binder first; refusals for non-theorem users and invisible uses (6.2).
3. **Instances**: Lean prints `instance : Nonempty Character := …` as a `theorem`, so "`def` + `instance_reducible` → instance" would have listed the presupposition instances as lemmas. Fixed: `instance` from the source keyword; anonymous instances matched by start line (4, 6.4).
4. **Hidden assumptions vs vocabulary** could not be told apart from type text. Added the `#check type_of% @N` probe (`typeSort`, verified to print `… : Prop` / `: Type` / `: Type 1`) and precise D-3 shape rules incl. `axiom c : T` (6.4).
5. **Long types wrap across lines** in `#check` output (verified); parsing now normalises whitespace (4, 6.3).
6. **Stale/failed files**: syntactic fallback would show a hand-edited `theorem` as proved without Lean, and flicker while typing; now previous facts by name, and unchecked theorems are never "proved" (6.3). A failed module no longer makes every node in it ill-formed: only nodes with an error in their own declarations.
7. **Mathlib/dependency projects** were not guarded at all; now refused (`unsupported-project`, Initialize `unsupported`): D-28 and the RAM rule.
8. **`planInitialize` could not know an existing `.gitignore`** (synchronous, no root): the inspection now carries it.
9. **Scaffold texts were unspecified** while WP2 and WP4 wrote them independently: exact texts frozen, `subjectScaffold` implemented and tested; built with Lean 4.35.
10. **R2 claimed "Lake's own locking"**: Lake has no build lock (removed in lean4#2445); risk text corrected.
11. **R5**: CSS/`draggable="false"` on the code cannot stop Chrome dragging the card; the attribute toggle on the card is the mechanism (12).
12. **The proved sample disagreed with the overlay it cites** (pg-no-dark-past is pinned there, so every later block sits lower; its code lacked the docstring line). Corrected, so WP2/integration can reproduce it from real facts.
13. **Core tests could not read fixture files** (no Node typings in core's test config, so no `node:fs`): added `test/raw-imports.d.ts` for Vite `?raw` imports (verified).
14. **Smaller fixes**: Lake log line shapes and replayed messages documented; command-start list for declaration spans; derived-id collisions; D-8 pinning on edit; id derivation always on the host; docstring escapes for `/-`; TL102/TL108/TL111 defined; legend, Depends on/Used by and the D-13 hint added to the board; statement-level dependents in the delete dialog; graph version seeding; git `core.fsmonitor=false` and `GIT_CEILING_DIRECTORIES` in tests; no `.telelean/config.json` outside `mental_model/` and `test-fixtures/`; WP5 pretest fallback while `mental_model/` is still empty; leftover-unit checks limited to one's own run id.
