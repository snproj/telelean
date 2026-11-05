# telelean: project report

*2026-11-02. Covers the code in `/home/zhengyew/telelean` as of this date.*

## Status in brief

| | |
|---|---|
| **M1** (the board without AI) | **Done.** |
| **M2** (one-shot "These suffice" with Claude) | **Implemented and integrated, but verified only with a scripted fake Claude (the FakeBackend).** Those runs used real Lean 4.35 and real clicks through the board in an isolated VS Code test instance. The last verification round (m2close-verify-2) ended "needs-work", with minor issues only (Appendix A.2). |
| **Real Claude** | **Real Claude has never driven the M2 code.** The only live contact was M0's eight-request smoke test of the command-line harness (Claude Code 2.1.314 with a stub tool host). **The real-Claude walkthrough (m2-plan §12) has not been run.** The architecture defines "good enough to start using" as M2 plus a successful walkthrough, so M2 is not formally ready. |
| **Paused or waiting for you** | <ul><li>The real-Claude walkthrough. It needs both opt-ins, about 12 GB of free memory, and an announcement of the quota use beforehand.</li><li>Real runs in general: you were asked not to press "These suffice" until M2 is declared ready.</li><li>One open decision: where "Raw Lean diff…" opens.</li><li>The end-of-turn modifications audit.</li><li>Two runner test files. They spawn the live scripts to show that live mode refuses, and they have not been run.</li><li>M3, M4 and H have not started.</li></ul> |
| **Verification figures** (last verifier, clean build in a scratch copy) | <ul><li>core: 498 tests</li><li>runner: 532 passed, 1 skipped (the two files above excluded)</li><li>webview: 130 unit tests and 81 Playwright tests</li><li>extension: 171 unit tests</li><li>VS Code: 36 smoke tests and 21 end-to-end tests</li><li>walkthrough dry run: both readings passed</li><li>no real Claude process was started</li></ul> |

**How to read this report.**
- **Part 1** describes the architecture.
- **Part 2** describes what a user can do today.
- **Part 3** states the Lean logic precisely: the encoding, the statuses, the permitted set, the gate, and what is and is not guaranteed.
- **Appendices:**
  - A: limitations and open items;
  - B: places where the docs and the code disagree;
  - C: glossary;
  - D: how this report was checked.

---

# Part 1: Architecture

telelean is a VS Code extension made of four TypeScript packages (npm workspaces).
- **The Lean files are the source of truth.** Every card is an `@@ telelean v1` block inside a Lean comment. Every status is derived from Lean's output and never stored.
- **All logic runs in the VS Code extension host.** Lean, git and Claude Code run as child processes of it.
- **The board is a webview.** It displays what the host sends and turns gestures into typed messages.

## 1.1 The system in one picture

```
VS Code window
 ├─ board tab: webview (React, strict CSP)         ⇅ typed messages (protocol v1), validated on both sides
 └─ extension host (Node in Electron), running dist/extension.js
     ├─ packages/extension  thin adapter: commands, BoardPanel, BoardSession, CheckedEditApplier, watchers
     ├─ packages/runner     ModelWorkspace · RunManager · LeanCheckEngine · shadow · ProposalService · llm/
     │    └─ MCP tool server (HTTP on 127.0.0.1, per-run bearer token) ◀── telelean tool calls ───┐
     └─ packages/core       pure TS: markup, project model, edit planner, gate rules, protocol    │
          spawns:                                                                                 │
          ├─ runLean: systemd-run scope → setpriv → keeper → bwrap → lake / lean / comparator    │
          │           (one Lean job at a time, process-wide)                                      │
          ├─ git (plumbing only): private refs in the model's repository; one bare repo per run   │
          └─ setpriv → claude -p --input-format stream-json …  (cwd = the run's ws/) ─────────────┘
                 └─ PreToolUse hook: node telelean-path-guard.mjs (before every file-tool call)

Model folder (opt-in: has .telelean/config.json)     VS Code extension storage
  Model.lean, Model/<S>.lean, Model/<S>/*.lean         globalStorage/telelean.telelean/runs/<folder>-<hash>/<run>/
  .telelean/: config, layout, attic, attempts,           ws/  build/  git/  session/  frozen/  gate/  run.json …
              decisions, graph.json;   .lake/
```

## 1.2 Processes

| Process | Started by | Role | Isolation |
|---|---|---|---|
| VS Code workbench (renderer) | you | editors and tabs; hosts the board's webview | VS Code's own |
| Board webview (iframe) | `BoardPanel` | the React board: shows what the host sends and turns gestures into protocol messages; computes no Lean results | strict nonce CSP, no Node access, every message validated |
| Extension host (Node in Electron) | VS Code, at activation | runs `dist/extension.js`, which bundles the extension adapter, runner, core, the MCP SDK and `diff`; serves the MCP tool server in-process | VS Code's own; workspace trust is required |
| Lean/Lake jobs: `lake build`, `lake env lean --stdin --json` (check files, scratch checks), `leanexport`, `lake comparator` | runner, through `runLean` | builds, Lean facts, ghost and rendering checks, freeze exports, G4 | see below the table |
| git | runner | history snapshots on private refs in the model folder's own repository; one bare repository per run | plumbing only; hooks, signing, gc and fsmonitor off; `GIT_*` redirections dropped |
| Claude Code CLI (your binary, ≥ 2.1.295) | runner, when a run starts | the agent: `claude -p` in stream-json mode, with cwd = the run's `ws/`; its own session files go under `~/.claude/projects/` | own process group under `setpriv --pdeathsig KILL`; tool allowlist; none of your settings; cleaned environment; subscription login only |
| Path-guard hook `telelean-path-guard.mjs` | the CLI, before each file-tool call | allows or blocks the call by its path | runs with a real `node` when one is found (Electron in Node mode otherwise) |
| VS Code Lean extension (not telelean's) | you | editor features; may build `.lake/` in the same folder | **not sandboxed**: it elaborates any file you open, accepted code included |

**How `runLean` isolates a Lean job:**
- a systemd user scope with `MemoryMax`, no swap and `OOMPolicy=stop`;
- `setpriv --pdeathsig KILL`;
- a keeper shell;
- `bwrap`: no network, `$HOME` hidden except a read-only `~/.elan`, sources read-only, `.lake/` writable, environment cleared;
- fail-closed start: if any layer is missing, nothing runs;
- one job at a time.

## 1.3 The four packages

### packages/core: pure TypeScript, shared by everything

**Constraints.** It is compiled with `lib` ES2023 only, without DOM or Node typings. So it does no I/O and contains no LLM code. Its gate rules are the non-LLM judge of Claude's work. The other packages import its sources through path aliases; its `dist/` is unused.

**Module groups:**
- **Contracts** (marked FROZEN, additive changes only):
  - `model.ts`: cards, edges, graphs, derived statuses, vocabulary, Lean-check state;
  - `facts.ts`: `LeanFacts`;
  - `actions.ts`: BoardAction → EditPlan → FileChange, plus errors and undo/history types;
  - `run.ts`: runs, proposals and sidecar records;
  - `protocol.ts`: versioned host↔webview messages with hand-written validators;
  - `paths.ts` and `layout.ts`.
- **`markup/`:**
  - a lexer faithful to Lean 4.35 and a declaration-header scanner;
  - the block parser, which reports TL0xx diagnostics and binds blocks (a pinned `lean:` beats adjacency);
  - a serializer and byte-preserving edits;
  - LeanOps: the D-11 rewrites and the D-9 docstring mirror.
- **`project/`:**
  - `buildProjectModel` turns parsed files, hashes and facts into the project model: ids, bindings, ownership, vocabulary classification, statement closures, statuses with footprints, flags, TL1xx diagnostics and edges;
  - `subjectGraph` cuts out one subject's board.
- **`edit/` and `kindChange.ts`:**
  - `planAction`, through an `EditSession` that re-parses between steps and keeps other cards' bindings;
  - `planKind` (D-11, using Lean facts);
  - the graph-only preview shown during a drag.
- **`export/`:** `graph.json` format 1.1 and its JSON Schema.
- **`gate/`** (M2):
  - the G0 token and file rules;
  - the ghost single-term rule;
  - the permitted set and the freeze snapshot;
  - `evaluateRules`: G1 errors read from facts, G3, G5, and the readiness and stage rules;
  - normalisation, ghost adoption, lifecycle edits, and plain-language findings.
- **`proposal/`** (M2): the board diff, proposal labels, and codecs for `attempts.jsonl` and `decisions.json`.
- **`samples/` and `graph.ts`:** the Spyro sample, a generated large graph, and M0 helpers the webview still uses.

### packages/runner: the Node engine (no `vscode` imports)

**Foundation layers:**
- **`lean/`**: M0's spike, now production code.
  - `runLean`, the only way a Lean-family process starts;
  - `sandboxProfile.ts` (the bwrap allowlist);
  - `toolchain.ts`: pins v4.35.0 and calls its binaries directly, never elan's proxies;
  - `leanNames.ts`: injection-safe generated names;
  - `shadow.ts`: copies that refuse symlinks;
  - `comparator.ts`: G4 (the freeze challenge, `leanexport`, `lake comparator`, classification of its verdicts);
  - `footprint.ts`: parsers for `lean --json` and `#print axioms`.
- **`semantic/`:**
  - `refreshLeanFacts`, which turns a model root into `LeanFacts`;
  - `runExclusive`, the process-wide queue of one Lean job at a time;
  - the memory guard and `spawnMemoryMax`.
- **`llm/`:**
  - the provider-agnostic `LlmBackend`/`LlmSession` interface with normalised events;
  - the five-tool `AgentToolHost` interface, with its zod schemas and reply renderers in `toolSchemas.ts`;
  - `ClaudeCliBackend`: binary lookup, environment stripping, path-guard confinement and its self-test, the subscription and hook preflight, the MCP tool server, and stream-json parsing;
  - `FakeBackend`: scripted steps through the same guard decision, schemas and renderers;
  - `StubToolHost`: M0's tool host, still used by the smoke script and tests.

**M1/M2 machinery built on them:**
- **`workspace/`:** `ModelWorkspace`. It scans and parses the model files, builds subject graphs, and runs the debounced, coalesced refresh. It owns the single queued write path (perform, undo, redo, revert, `applyChanges`) and the history. `initialize.ts` implements "Initialize Model Here".
- **`shadow/`:** the run directory, the ws/→build/ sync by content comparison, the bare git repository written with `fast-import`, and the optional build seeding.
- **`gate/`:** `LeanCheckEngine` (checkBase, check, freeze, normalise, gate, ghost check, statement rendering), plus findings and the scratch sources sent to Lean on stdin.
- **`run/`:** `RunManager`. It owns:
  - the state machine, preflight and the backend factory;
  - the static system prompt and the context bundle;
  - the AgentToolHost and the caps;
  - the A2 gate loop, Feedback, ghost adoption and Accept;
  - persistence and recovery after a reload.
- **`proposal/`:**
  - `ProposalService`: the proposed graph and its diff, changed files, statement and vocabulary reviews, definition questions, the lifecycle item, the report card, drift detection and Accept planning;
  - `files.ts`: the no-fuzz 3-way merge;
  - `DiskSidecarStore`: `attempts.jsonl` and `decisions.json`.

**Build.** `tsconfig` is `noEmit`, so the runner is only type-checked. The extension bundles the runner's sources directly.

### packages/extension: the VS Code adapter (owns no model semantics)

**`src/logic/`** (no `vscode` imports, unit-tested):
- **`BoardSession`**, one per board. It keeps an edit FIFO queue and a separate run queue, so a run start or an Accept never blocks typing; cancel and read-only requests skip both queues. It coalesces publishes, switches subject when the shown one disappears, and adds the dependent cards to needs-confirmation answers.
- **`actionMapping`:** protocol message → BoardAction.
- **`editApplier`** (`CheckedEditApplier`). For each file it checks the current text against the planned before-text, writes minimal line edits in one WorkspaceEdit, undoes a partial apply, and saves.
- **`changeBatcher`:** debounces events and recognises echoes of telelean's own writes.
- **`modelPaths`:** keeps paths inside the root and refuses symlinks that lead out of it.
- **`settings`:** clamps the `telelean.*` values.
- **`runs`:** the consent texts, the lazy Claude backend factory (which refuses in Test mode) and the busy check.
- Also initialize, restore, roots, groups, and the history and proposal previews.

**`src/vscode/`:**
- **`host.ts`:** the commands, one BoardPanel per root, restore after a reload, the consent modal, RunManager construction, and `TeleleanApi` with Test-mode hooks.
- **`registry.ts`:** one ModelWorkspace and one RunManager per root, kept for the life of the window. Typing, saves and file-watcher events become invalidations, plus Lean refreshes while that root's board is open.
- **`editor.ts`:** the WorkspaceEdit port, and a TextSource that reads open buffers first.
- **`historyProvider.ts`:** read-only `telelean-history:` and `telelean-proposal:` diffs.
- **`runner.ts`:** a replaceable record of the runner's factory functions.

**`src/board/`:** `BoardPanel`. It runs the webview lifecycle, serves strict nonce-CSP HTML from `html.ts`, validates every inbound message with `core.parseWebviewToHost`, and queues messages until the session attaches.

**Build.** esbuild produces one CommonJS `dist/extension.js`. The build copies the path guard to `dist/bin/` and checks that the bundle loads under a stub `vscode`.

### packages/webview: the board

**Stack.** React 19, one zustand store and pragmatic-drag-and-drop. Vite 8 builds it into `packages/extension/dist/webview/`. There is no `index.html`: the extension writes the HTML.

**Module groups:**
- **`host/bridge.ts`:** the only caller of `acquireVsCodeApi`. It validates every incoming message with `parseHostToWebview` and forwards CSP violations, which `public/boot.js` records from page start.
- **`state/store.ts`:**
  - updates the board optimistically (moves, re-orders, adds, edits, never deletes);
  - gives each request an id `r<n>`;
  - `applyGraph` drops older graph versions, matches provisional cards, keeps the selection and rebuilds the proposal overlay.
- **`model/`:** pure, unit-tested helpers.
- **`board/`:** cards, columns, the Vocabulary group, ghost cards and drag and drop. `EdgeEngine` draws the arrows outside React from pure geometry.
- **`header/`, `tray/`, `prompt/`, `dialogs/`, `toasts/`, `common/`.**
- **`run/`:** RunPanel, Questions, Review, ReportCard, GhostSuggestion, ProposalBanner, RunBadge.

**CSP discipline.** No style attribute anywhere (positions are set through the CSSOM), and colours come only from `--vscode-*` variables.

## 1.4 Main data flows

### 1.4.1 Refresh: how the board learns what Lean thinks

1. **Triggers.** The board opens; you save a model file; telelean edits; another program writes a model `.lean` file, `lakefile.toml`, `lean-toolchain` or `lake-manifest.json`; you click the badge or run the command. After a debounce (750 ms), triggers are coalesced into one refresh.
2. **`semantic.runExclusive(refreshLeanFacts)`**, in order:
   1. the memory guard;
   2. the toolchain and manifest checks;
   3. hashing the sources;
   4. `lake build Model` in place under `runLean` (sources read-only, `.lake/` writable, `.git` masked);
   5. parsing Lake's log and computing module states;
   6. reading the `.ilean` files (declarations, ranges, references) and the docstrings;
   7. running one generated check file (`#check`, `#print`, `#print axioms`, `#check type_of%`) through `lake env lean --stdin --json`;
   8. re-hashing, so that modules that changed meanwhile become stale.

   Lean and sandbox failures become statuses, and the last good facts are kept.
3. **Model and board.** `core.buildProjectModel` builds the project model. `subjectGraph(S)` cuts out the board, and the runner adds the attempts from `attempts.jsonl`.
4. **Publishing.** The runner rewrites `.telelean/graph.json`. BoardSession posts `graph` and `workspace` messages; the webview validates them and applies the graph.

**Unsaved typing** is re-parsed after about 200 ms, through the TextSource that reads open buffers first, but it is not built. The affected cards show "changed since last check".

### 1.4.2 Edit, undo and history

1. **In the webview.** A gesture updates the store optimistically (deletes excepted), and the store posts a message with a request id.
2. **In the extension.** BoardPanel validates the message, BoardSession queues it, and `actionMapping` turns it into a BoardAction.
3. **`ModelWorkspace.perform`**, in one queue for the whole root:
   1. `core.planAction` returns whole-file changes. Kind changes go through `planKind` with the Lean facts. When dependents must be confirmed, it answers `needs-confirmation` and lists them.
   2. The layout and attic changes are materialised.
   3. If you edited files by hand since telelean last wrote, a "Manual edits" snapshot is taken.
   4. `CheckedEditApplier` writes the change (before-text check per file, one WorkspaceEdit, save).
   5. An action snapshot is taken on the private refs, except for layout-only changes.
   6. An in-memory undo entry is added (100 per subject).
   7. The files are re-read, `graph.json` is rewritten, and a refresh is requested.
4. **The answer.** The webview receives an `actionResult`. It confirms the change, rolls it back with an error toast, or reopens the dependents or delete dialog.

**Undo and Redo** apply stored patches with no fuzz (`fuzzFactor 0`). They refuse when the patch no longer applies, and they are snapshotted like actions.

**History** works on private refs. Its operations:
- list;
- preview: a read-only multi-file diff opened beside the board;
- revert: it snapshots first, and the revert itself can be undone;
- prune.

**Echoes.** `changeBatcher` suppresses the file events caused by telelean's own writes.

### 1.4.3 A run, end to end

1. **Start.** The tray sends `startRun`, which goes to BoardSession's run queue (separate from edits). Then come the busy check and the consent modal. Only a yes is remembered, per root, in `globalState`.
2. **Preflight.** `RunManager.start` checks, in order:
   - busy;
   - the selection;
   - the workspace;
   - the toolchain, a lakefile, and no Lake packages;
   - the sandbox;
   - free memory.

   Then the backend factory is built lazily: binary lookup and the `setpriv` launcher.
3. **Premises.** The premises declaration is an ordinary undoable action through `ModelWorkspace.perform`. It is skipped when unchanged, and for Self-evident?.
4. **Working copy.** `createRunShadow` writes the model and project files into `ws/`, as the board sees them (open buffers first), and into `build/`. It records a `base` commit in the run's bare repository and writes `run.json`.
5. **Base build.** `engine.checkBase` builds the user's files in the mirror. Lean errors end the run before Claude is contacted. Otherwise B's facts are saved to `base-facts.json`.
6. **Claude Code starts.** `ClaudeCliBackend.startSession`:
   1. starts the MCP tool server;
   2. writes the settings, hook policy and MCP config into `session/`;
   3. self-tests the guard;
   4. spawns the CLI;
   5. checks that the account is a claude.ai subscription and that the CLI lists the guard hook as enabled.

   Then it sends the static system prompt and the first message (the context bundle).
7. **Tool calls** arrive over MCP at the RunManager's AgentToolHost:
   - `check_lean`, `freeze_statements` and `propose_assumption` go to `LeanCheckEngine`: G0 on the text against B, then (if clean) mirror sync, build and facts, then `core.evaluateRules` over B, A, R and S;
   - `ask_user` puts the run in "waiting for answer". The clock pauses, and the answers are recorded in `decisions.json`.
8. **Gate.** `finish(status)` triggers normalisation (a commit), then the gate: G0, G1, G3 and G5, plus G4 for `proved`. The outcome:
   - pass: a `gate-pass` commit;
   - fail: a notice on the board, and the exact findings go back to Claude;
   - at the attempt cap, after a second turn without `finish`, or at the turn or time cap: revert to the newest passing commit, normalise, and re-check (not counted).
9. **Proposal.** `ProposalService.build` produces the proposal, which the webview shows as an overlay with the review. A line is appended to `attempts.jsonl`.
10. **Your choice:**
    - **Accept** (1.4.4);
    - **Feedback**: a new round in the same Claude session;
    - **I hold this**: an `adopt` commit, a re-freeze, then a new round;
    - **Discard** or **Cancel**.

    When the run ends, old run directories are pruned (`telelean.run.keepRuns`).

### 1.4.4 Accept

1. **Precondition.** Every definition question must be answered "yes".
2. **No drift** (your model files are unchanged since the run started).
   - `planAccept` takes exactly the judged files plus the ticked lifecycle item.
   - `ModelWorkspace.applyChanges` writes them through the M1 path: snapshots, `CheckedEditApplier`, one undo entry, a history entry of kind `accept-proposal`, then a refresh.
   - No Lean check runs before applying. If no file changes, the outcome is only recorded.
3. **Drift.**
   1. Your current files are written into `ws/` as an `accept-base` commit.
   2. Claude's diff is merged onto them with 3 context lines and no fuzz; an overlap refuses the Accept.
   3. A `rebase` commit is made, then normalisation and (for `proved`) a re-freeze.
   4. The gate runs again with B := `accept-base`. On success, exactly the re-checked files are applied; any failure refuses the Accept.
4. **Afterwards.** A resolution line is appended to `attempts.jsonl` and the run ends.

## 1.5 What is stored where

| Location | What | Written by | Notes |
|---|---|---|---|
| Model folder: `Model.lean`, `Model/<S>.lean`, `Model/<S>/{Vocabulary,Inbox,Main}.lean` | the cards (blocks in comments) and the Lean code | board actions and Accept, through the WorkspaceEdit path | in history; undoable |
| `lakefile.toml`, `lean-toolchain`, `lake-manifest.json` | the project files | Initialize | the project history chain |
| `.telelean/config.json` | the library name; it also marks the folder as a model (activation) | Initialize | project chain |
| `.telelean/subjects/<S>/layout.json`, `attic/<id>.lean` | card order; archived proofs | WorkspaceEdit path | in history; undoable |
| `.telelean/subjects/<S>/attempts.jsonl`, `decisions.json` | run rounds and their resolutions; your answers to Claude | `DiskSidecarStore`, directly (temp file, then rename) | not in history, never undone |
| `.telelean/graph.json` | export of the whole project (format 1.1) | the runner, directly | gitignored |
| `.lake/` | the in-place Lake build | Lean jobs | gitignored |
| `.telelean/frozen/`, `.telelean/sessions/` | nothing | (Initialize adds their `.gitignore` lines) | unused: runs live in extension storage |
| The model folder's git repository: `refs/telelean/<rootKey>/subjects/<S>`, `…/project` | history snapshots | git plumbing; temporary files under `<gitDir>/telelean-tmp-*` | `<rootKey>` = the folder's path in the repository plus a short hash (`root` at the top level). Your branches, index, HEAD, remotes and hooks are never touched |
| Extension-host memory | undo stacks (100 per subject), parse cache, current facts | runner | lost on window reload |
| VS Code `globalState` | consent per root (`telelean.claudeConsent.<rootKey>`) | host | only a yes is stored |
| VS Code `workspaceState` | board restore records (title, root, subject) | host | |
| Webview state, per panel | subject, Vocabulary-group collapsed, request counter, run-panel size | webview | |
| `~/.config/Code/User/globalStorage/telelean.telelean/runs/<folder>-<hash>/<runId>/` | see below the table | shadow, engine, RunManager | the newest 10 finished runs per folder are kept |
| `~/.claude/projects/` | Claude Code's own session transcripts | the CLI | used by `--resume`; never read by telelean |

**Contents of a run directory:**
- `ws/`: Claude's working copy;
- `build/`: the Lean mirror, with its own `.lake/`;
- `git/`: a bare repository;
- `session/`: settings, guard policy and log, MCP config with the token, system prompt, `transcript.jsonl`;
- `frozen/<n>/` and `gate/<n>/`;
- `scratch/`: created but never written;
- `run.json`, `base-facts.json`, `proposal-facts.json`.

## 1.6 Trust boundaries

| Boundary | What crosses it | What protects it |
|---|---|---|
| Webview ↔ extension host | protocol-v1 messages | <ul><li>strict CSP: two nonce'd scripts, no inline styles, no eval, local resources only from `dist/webview`</li><li>every inbound message is validated by core's parser, and the webview validates what it receives</li><li>Open in editor re-checks that the path stays inside the root, after resolving symlinks</li></ul> |
| Extension host → Lean/Lake | model sources (read-only); `.lake/` (writable) | <ul><li>the `runLean` layers (1.2), failing closed</li><li>one job at a time, the memory guard, per-job time limits</li><li>Lean can run code while it elaborates (`#eval`, `initialize`), so the user's own files are sandboxed as well</li></ul> |
| Extension host ↔ Claude Code CLI | prompts, tool calls and results, file reads and writes in `ws/` | <ul><li>your own unmodified CLI</li><li>tool allowlist (no shell, web or subagents), none of your settings</li><li>path-guard hook plus the CLI's own fences</li><li>`ws/` holds only model files</li><li>stripped environment; subscription-only checks</li><li>process group and death signal</li><li>per-round caps</li></ul> |
| CLI → MCP tool server | tool calls | <ul><li>127.0.0.1 on a random port</li><li>a per-run bearer token, compared in constant time</li><li>a Host-header check; browser Origins refused</li><li>config files with mode 0600</li></ul> |
| Claude's working copy → your files | proposal files | <ul><li>the non-LLM gate (G0, G1, G3, G4, G5)</li><li>proposals are built only from judged commits</li><li>Accept needs definition approvals, goes through the recorded write path with before-text checks, and re-gates after drift</li></ul> |
| Your machine → Anthropic | cards, vocabulary, answers, any model file Claude reads, tool results, Claude Code's own telemetry | <ul><li>per-folder consent, asked before anything is sent</li><li>no API key ever used</li></ul> |
| Other programs ↔ model folder | edits, Lake builds | <ul><li>before-text checks on every write; echo suppression</li><li>Lake takes no build lock (see the trace caveat, 3.7 item 5)</li></ul> |
| The VS Code Lean extension | elaborates files you open, accepted code included | <ul><li>nothing (outside telelean); workspace trust only</li></ul> |

**The trusted base.** It consists of:
- Lean's elaborator, which produces the facts, and Lean's kernel;
- `lake comparator`;
- telelean's TypeScript decisions: binding, vocabulary classification, the permitted set, the gate rules, the G0 lexer, normalisation and the merge (details in 3.7 item 3).

## 1.7 Where the implementation departs from the original design

These are departures from 02/03. Some were approved as amendments, others are still open.
- **Claude backend.** The design's default was the Claude Agent SDK. The code drives your installed Claude Code CLI in stream-json mode instead (amendment A1); there is no Agent SDK dependency and no `telelean.backend` setting.
- **Facts.** The planned compiled extractor (`telelean-extract`, with statement-closure hashes) was not built. M2 uses M1's approach: a check file plus `.ilean`. G5's "formal immutability" is replaced by text-and-printed-meaning comparisons, and closure hashes are deferred to H.
- **Gate steps.**
  - G0, G1, G3, G4 and G5 exist.
  - G2 (`leanchecker` replay) is deferred to H.
  - G6 is not a gate step: flags appear in the review and report card, and certificates come in M3.
  - G1's per-declaration limits (10 s, 1.5 GB) are not implemented; only the per-job time limit and the memory cap apply.
- **Shadow.**
  - It is a bare repository written with `fast-import`. The design had `git init` with a work tree, and so do the outdated comments in `shadow/types.ts`.
  - Runs build from scratch by default; the design copied `.lake/build`.
- **Activation and settings.** Activation keys on `.telelean/config.json`, not `layout.json`. Several designed settings do not exist: `.backend`, `.sandbox.required`, `.review.pauseWhenRisky`, `.docstringMirror`, `.modelRoots`, `.exclude`.
- **Verdicts.** The design allowed "insufficient" only with a countermodel. Today it is Claude's unverified claim, shown as "not proved".
- **Run files.** They live in extension storage, not in `.telelean/frozen/` and `.telelean/sessions/` (Initialize still gitignores both).
- **Live errors.** Error badges from VS Code's diagnostics (03 §5) are not implemented.

Per-file summaries: docs/project-report-files.md

---

# Part 2: Functionality and features

This part says what a user can do with telelean today and what happens when they do it.

**What it was checked against:**
- the extension manifest and host;
- the board;
- the runner and core;
- `docs/user-guide.md` and the last verifier's report.

**Which code runs.** The bundles in `packages/extension/dist/` are newer than every source file. The extension is registered in place from `packages/extension`, so VS Code runs exactly this code.

**Conventions.** Differences between the user guide and the code are marked **Docs vs code** and collected in Appendix B. Limitations and open items are in Appendix A.

## 2.1 Setting up and running

### 2.1.1 Requirements

| Need | Details |
|---|---|
| Linux with the sandbox tools | <ul><li>`bwrap`</li><li>a reachable systemd user manager (`systemd-run --user`, `systemctl --user`)</li><li>cgroup v2 with the memory controller</li><li>util-linux `setpriv`</li></ul>All are in `/usr/bin` here. Without them Lean checks fail closed: the badge shows "Lean: off" with "sandbox unavailable: …". |
| Lean `leanprover/lean4:v4.35.0` under `~/.elan` (or `$ELAN_HOME`) | telelean calls that toolchain's `lake` and `lean` directly, never elan's proxies, so it never writes `~/.elan/known-projects`. Installed here. |
| git (optional) | needed for History; `telelean.git.path` chooses the executable. |
| For M2: Claude Code 2.1.295 or newer, logged in with a claude.ai subscription | By default telelean uses the binary inside the VS Code Claude Code extension. Here that is `~/.vscode/extensions/anthropic.claude-code-2.1.314-linux-x64/resources/native-binary/claude`. |
| VS Code 1.140 or newer; Node 24.22.2 to build | the Node version is in `.node-version` |

### 2.1.2 Build, install, reload

- **Packaging.** There is no VSIX (an optional M4 item). The extension is registered in place from `/home/zhengyew/telelean/packages/extension` (Developer: Install Extension from Location…). After a rebuild, **Developer: Reload Window** loads the new `dist/`.
- **Building, only after a source change.** `npm run build` at the root runs each package's build script:
  - **core:** `tsc` into `packages/core/dist`, which nothing uses (the other packages import core's sources);
  - **extension:** esbuild bundles everything into `dist/extension.js`, copies the Claude path-guard hook to `dist/bin/telelean-path-guard.mjs`, and checks that the bundle loads;
  - **runner:** a type-check only (`noEmit`);
  - **webview:** Vite builds into `packages/extension/dist/webview/`.

  `npm --prefix packages/extension run build:all` rebuilds only the webview and the extension bundle. At the moment nothing needs rebuilding.
- **Trust.** Untrusted (Restricted Mode) and virtual workspaces are unsupported, because building a model with Lean can run code.

### 2.1.3 Commands and activation

| Command | Where | What it does |
|---|---|---|
| **telelean: Open Board** (`telelean.openBoard`) | Command Palette | opens, or reveals, the board of a model folder (2.1.5) |
| **telelean: Initialize Model Here** (`telelean.initializeModel`) | Command Palette; Explorer right-click on a folder | turns a folder into a model (2.1.4) |
| **telelean: Refresh Lean Check** (`telelean.refresh`) | Command Palette | re-checks the focused board, or the only open one. With several open and none focused it asks which; with none open it runs Open Board |

- **Keybindings and menus.** No keybindings are contributed. The only menu entry is the Explorer item.
- **Activation.** The extension activates in windows that contain `**/.telelean/config.json`, when VS Code restores a board tab, or when one of its commands runs. It reads no model file, runs no Lean and looks for no Claude binary until a board opens.
- **Log.** View → Output → telelean.

### 2.1.4 Initialize Model Here

1. **Folder.** The right-clicked folder. Otherwise a quick pick of the window's folders, plus "Choose another folder…".
2. **What it does depends on the folder:**
   - **Already a model:** it says so and opens the board.
   - **Empty folder:** it asks for the first subject's name, a capitalised Lean identifier of at most 64 characters, suggested from the folder name (`mental_model` → `MentalModel`). Then it writes:
     - `lakefile.toml`, with `autoImplicit = false`, `relaxedAutoImplicit = false` and one `[[lean_lib]] Model`;
     - `lean-toolchain`, set to v4.35.0;
     - `lake-manifest.json`, with no packages;
     - the missing `.gitignore` lines: `/.lake/`, `/.telelean/graph.json`, `/.telelean/frozen/`, `/.telelean/sessions/`, `/.telelean/*.tmp`;
     - `Model.lean`, `Model/<S>.lean`, and `Model/<S>/{Vocabulary,Inbox,Main}.lean` (each `namespace <S> … end <S>` with a one-line comment);
     - `.telelean/config.json` and `.telelean/subjects/<S>/layout.json`.
   - **Lake project without dependencies:** it asks first, in a modal ("Add telelean to the Lake project …?"). Then it writes only `.telelean/config.json` (with the project's library name), a layout file per subject it found, and the missing `.gitignore` lines. It changes no Lean file.
   - **Refused, with the reason:**
     - Lake dependencies (Mathlib comes in M4);
     - only a `lakefile.lean` (Lake can convert it with `lake translate-config toml`);
     - both lakefiles at once;
     - no `[[lean_lib]]`, or a library name that is not a plain identifier;
     - a missing or invalid `lake-manifest.json`;
     - files but no `lakefile.toml`.
3. **git.** Outside a repository, a modal offers `git init` for history. Saying no leaves history off, and the board can initialise git later. A folder already inside a repository gets history without being asked.
4. **Board.** telelean opens the board. Every file is written through one WorkspaceEdit and saved.

**Docs vs code.** The guide's file list leaves out `lake-manifest.json` and the layout file, and it does not say that an existing Lake project needs a manifest.

### 2.1.5 Open Board

- **Finding models.** telelean searches the window's folders, up to depth 6, for `.telelean/config.json`. It skips `node_modules`, `.lake`, `.git`, `verbatim_prompt_log` and `test-fixtures`. In this repository it finds only `mental_model/`.
- **Choosing.** One model opens directly. Several give a quick pick ("Which model?"). None gives a message with **Initialize Model Here…**.
- **The tab.** There is one board per model folder: an ordinary editor tab titled `telelean: <folder>`, with the parent folder added when two models share a name. Running the command again reveals the existing tab.
- **Restoring.** The tab survives a window reload, mapped back to its model and subject.
- **Loading errors.** If the model cannot be loaded, the tab says why. Fix the problem and run Open Board again; no reload is needed.
- **First check.** Opening the board starts a Lean check (2.3.7).

### 2.1.6 The sample model

**Cards.** `mental_model/` holds subject `Spyro`:

| Card | Kind | State |
|---|---|---|
| "PG games cannot have characters with dark pasts" | assumption | comment-only, stance *rule*, no reason, so it shows the chip "no source yet" |
| "Cynder is a character who has a dark past" | assumption | formalised: an `abbrev` plus `axiom ….holds` |
| "The new Spyro game is PG" | assumption | formalised: an `abbrev` plus `axiom ….holds` |
| "Cynder would not be a good addition to the new Spyro game" | goal | formalised, unproved, already declaring the three assumptions as `premises:` |

**Vocabulary:**
- sorts `Character` and `Game`, each with an existence presupposition;
- predicates `HasDarkPast` and `IsPG`;
- the relation `GoodAddition`;
- constants `cynder` and `newSpyro`.

**First open.** The first open builds the model in place: `mental_model/.lake/` and `.telelean/graph.json` appear. Both are gitignored, and neither exists yet.

**History.** Neither `mental_model/` nor the repository is a git repository, so History shows **Initialize git**. Accepting runs `git init` inside `mental_model/`.

### 2.1.7 A caution

Pressing **These suffice ▶** and then **Run with Claude** starts a real run on your claude.ai subscription quota. The real-Claude walkthrough has not been done (Appendix A.3), and the main session asked you not to press it until M2 is declared ready.

## 2.2 The board

### 2.2.1 Layout, top to bottom

1. **Header:**
   - "telelean" and the folder name;
   - the subject picker;
   - **History**, Undo and Redo;
   - the Lean badge;
   - **Problems N**, shown only when there are diagnostics;
   - the Claude run badge, shown only when a run exists;
   - a legend of the arrow styles and the aura.
2. **Banners, when relevant:** syntactic mode or Lean off; a run on another subject (with **Show**); the proposal banner (2.4.9).
3. **Workspace:** the three columns, with toasts at their bottom. During a run the run panel sits beside them, or below them when the board is narrower than 1000 px.
4. **Selection tray.**
5. **The A|D|G box,** for new cards.

### 2.2.2 Columns and cards

- **Columns.**
  - There are three: Assumptions, Derivations and Goals. Each scrolls on its own and shows a glyph, a title and a count.
  - Columns keep at least 220 px. A narrow board scrolls sideways, and drags auto-scroll near the edges.
  - An empty column says so. On an empty board, both the Assumptions column and the tray point to the A|D|G box.
- **The card face** shows:
  - your sentence;
  - "because: …" with your reason;
  - the kind glyph **A**, **D** or **G** (colour, letter and column together; never colour alone);
  - a check mark when selected, and a chevron to expand;
  - status chips (2.2.5);
  - **⚠ N** for warnings and errors (click it to expand the card);
  - "saving…" until the host confirms a new card;
  - for formalised cards, the "uses:" line (2.2.4).
- **Aura.** A glow, blue by default, means the card has a Lean statement.
- **Claude's wording.** A card worded by Claude (an adopted suggestion) shows its sentence in italics plus "(Claude's wording)".

### 2.2.3 The expanded card

Open a card with the chevron, or Enter on a focused card. Pressing inside the details never drags the card, and clicking there never changes the selection.

- **The Lean box.**
  - **Copy** copies exactly the card's code; the button shows "Copied" for 1.5 s. Code over 1,000,000 characters is refused with a toast.
  - **Open in editor** opens the file at the code's first line, beside the board and never over it. It reuses an editor group that already shows the file, and splits the window only when the board's group is the only one.
  - A comment-only card instead says "No Lean code yet: this node is a comment-only `@@ telelean` block." and has its own Open in editor.
- **Inside the code.**
  - Press and drag selects text; a drag guard switches off card dragging while the press lasts.
  - Hovering an identifier Lean resolved shows a tooltip: for a card's statement, that card's sentence and Lean name; for a vocabulary item, its gloss, kind and type.
  - Clicking reveals that card (it scrolls into view and flashes for 2 s), or opens the Vocabulary group at the item.
  - Ctrl/Cmd+click is reserved and does nothing yet.
- **Problems** of this card, each with **Open**.
- **Proof information:**
  - **Rests on**: the footprint of a proved card. It lists cards, presupposition chips such as "assumes characters exist", and any foreign axiom flagged TL103.
  - **Taken as hypotheses (unproved)**: for a conditional proof.
  - **Presupposes**: chips that highlight the item in the Vocabulary group.
  - **Lean's axiom list (N)**: a folded section.
- **Depends on / Used by.** Each entry is a card button with the reason: declared, used by the proof, used through other proofs, taken as a hypothesis, or mentioned in the statement. "Used by" also lists users without a card (lemmas) and other subjects' cards, marked "(subject …)".
- **Attempts (N).** Every "These suffice" round with this card as target, newest first, five at a time (**Show all N**). Each entry shows:
  - date and verdict;
  - the round;
  - what you did with it: accepted, discarded, continued in a later round, or not resolved;
  - the premises, or "from no premises (self-evident?)";
  - Claude's summary in italics;
  - the number of check attempts;
  - model and effort.

  **Docs vs code:** the guide does not mention this list.
- **Stance and source chips.**
  - Stance chips appear on Assumptions, or on any card that already has a stance: "I believe it", "It's a rule or definition", "Supposing, for argument".
  - Source chips appear on non-Goals, or on any card that already has a source: observed, reported, inferred, common knowledge.
  - Clicking a pressed chip clears it.
- **Buttons.** Make Assumption, Make Derivation and Make Goal (each tooltip states the D-11 impact), **Edit**, **Add why** or **Edit why**, and **Delete**.
- **In the proposed view** the chips and buttons are replaced by "This is Claude's proposal (read-only): switch the board to "Current" to edit your cards."

### 2.2.4 The "uses:" line and the Vocabulary group

**The "uses:" line.**
- Formalised cards list the vocabulary their statement uses, computed from Lean. The first two names are inline ("uses: HasDarkPast, cynder, …"); this subject's items get short names, others are fully qualified.
- **▾ N** lists all the names with kind and gloss. Picking one highlights it in the group; names outside the subject's vocabulary are greyed out as "elsewhere".

**The Vocabulary group.**
- **Place and state.** It is the first item of the Assumptions column and is collapsed by default. The open or closed state is kept per board in the webview's state, not in a model file. Highlighting an item opens the group.
- **Header.** The item count, and "N hidden assumption(s)" when Prop-valued axioms have no card (TL104).
- **Sections, in order:**
  1. Types
  2. Predicates & relations
  3. Functions
  4. Constants
  5. Presuppositions, as chips worded from the sort's gloss ("assumes characters exist"), or "assumes there is a T" without one
  6. Definitions
  7. Lemmas
  8. Unmarked axioms
  9. Other
- **Each item** shows its short name, type and gloss, plus flags: hidden assumption; shape (TL111); definition on a statement path (D-4); changed since last check. Its chevron shows the item's Lean code, the cards that use it, and Open in editor.
- **Other subjects.** Items of another subject that this subject's cards use through an explicit `import` are listed under their full names.
- **In the proposed view** the group shows the proposal's vocabulary with diff marks and "+N new". It opens by itself when the proposal adds vocabulary.

### 2.2.5 Arrows and status marks

**Arrows** are SVG lines drawn over the three scrolling columns, one per pair of cards.

| Style | Meaning |
|---|---|
| dashed | **declared**: you declared the support (`premises:`) |
| solid | **verified by Lean**: the proof uses it |
| hollow arrowhead | **conditional**: the proof takes it as a hypothesis |
| warning colour | **mismatch**: declared but unused (TL109), or used but not declared (TL107); the tooltip says which |
| thin | **statement reference**: one statement mentions another. Drawn only while one end is hovered or selected, and only if no other arrow joins the pair |

- **Scrolled-away ends.** When the other end is scrolled out of view, a stub is drawn and the column header or footer shows "▲ n linked" or "▼ n linked". Clicking it scrolls to the nearest hidden linked card.
- **Crossing the middle column.** Arrows that cross the Derivations column run under the cards, unless one end is hovered or selected.

**Status chips** on the card face:

| Chip | Meaning |
|---|---|
| no Lean yet / λ Lean / Lean problem | comment-only / has a Lean statement / statement or `.holds` missing, broken, or not of the form `abbrev n : Prop := …` |
| assumed | taken as an axiom. On a Goal it is flagged: "asserted as an axiom: make it an Assumption?" (TL116) |
| unproved | stated in Lean, not proved yet |
| ✓ proved | Lean checked the proof; the tooltip lists what it rests on. Without ✓, Lean did not check it |
| proved: make Derivation? / has a proof: make Derivation? | a proved Goal (TL105) / an Assumption with a proof (TL106). Clicking changes the kind |
| conditional on … | proved, but with unproved statements as hypotheses |
| promotion pending | a Derivation whose `.holds` is still an axiom |
| rests on a claimed node | its proof uses a Derivation whose promotion is pending |
| changed since last check (or "checking…") / not checked by Lean | its file changed since the check, so the other chips are dimmed and show the last known status / Lean could not check it |
| uses sorry / missing .holds / .holds says something else | TL115 / TL117 / TL114 |
| self-evident / existence commitment / definitional choice | proved from no card and no hidden assumption / needs a presupposition that no relevant statement mentions (TL108) / its statement relies on a definition (D-4) |
| broken | "depends on something removed". The chip exists, but core never sets its flag (Appendix B) |
| no reason yet (no source yet, for stance *rule*) | an Assumption without a "because". Clicking opens the reason editor (TL011) |
| you think this follows from those: prove it? | an Assumption that has declared support |

**Diagnostic codes** run TL001–TL019 (markup), TL101–TL121 (Lean side) and TL201 (the project cannot be checked).

### 2.2.6 The Lean badge, banners and Problems

| Badge | Meaning |
|---|---|
| Lean: not checked yet | no check has run yet |
| Lean: checking… | building or checking now |
| Lean: up to date | every file of the board is checked |
| Lean: files changed | some files changed since the check; their cards show the last known status |
| Lean: N errors | the build reported errors (see Problems) |
| Lean: check failed | the last check did not finish: a time-out, out of memory, cancelled, or an internal error. Hover for the reason; cards keep their last known status |
| Lean paused: low memory | available memory is below `telelean.memory.minAvailableGiB` |
| Lean: syntactic mode | the project is not on v4.35.0, so cards come from the text only |
| Lean: off | switched off by the setting, a project telelean cannot check (dependencies; TL201), or "sandbox unavailable" |

- **Refreshing.** Clicking the badge asks for a refresh.
- **Banners.** Syntactic mode and "Lean checking is off" also show a banner under the header.
- **Problems.** The **Problems** dropdown lists every diagnostic of the subject. Each has **Show card** (when it belongs to a card) and a `file:line` button that opens the file.

### 2.2.7 Subjects

- **Picker.** "subject: [Spyro ▾]" lists the model's subjects with their card counts.
- **New subject.** **New subject…** takes a capitalised identifier of at most 64 characters, not already taken. It writes `Model/<Name>.lean` and `Model/<Name>/{Vocabulary,Inbox,Main}.lean`, adds `import Model.<Name>` to `Model.lean`, and switches the board to the new subject.
- **Rules.**
  - A board shows one subject at a time.
  - Card ids are unique across subjects.
  - Undo and History work per subject.
  - If the shown subject disappears (an Undo of its creation, a revert), the board switches to the first remaining one and says so.
  - The subject is remembered across reloads.

### 2.2.8 Selection and the tray

- **Selecting.** A click selects one card, replacing the selection. Ctrl/Cmd+click, or Space on a focused card, toggles a card in the selection.
- **The tray** shows "N selected", the premise chips, a turnstile ⊢ and a target slot.
  - **Target.** The card chosen with ⊢ on a premise chip; without that, the single selected Goal.
  - **Chips.** Each has ⊢ ("Make this the target") and × ("remove").
  - **Presuppositions.** "+ presupposes:" chips show the existence presuppositions of the selected statements; clicking one highlights it.
  - **Buttons.** **Clear** and the run buttons (2.4.1).
- **Proposed view.** In the read-only proposed view, clicks never change the selection.

### 2.2.9 Keyboard

| Where | Keys |
|---|---|
| Anywhere | Tab moves between cards and buttons. Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z or Ctrl+Y redoes (not while typing in a field or while a dialog is open) |
| Focused card | Enter expands or collapses it, Space selects or deselects it, F2 edits the sentence, Delete opens the delete dialog, Alt+Up/Down moves it one place in its column |
| Dropdowns (subject, History, Problems, "uses:") | opening one moves the focus into it; Up, Down, Home and End move between items; Escape or choosing an item returns the focus to the button that opened it |
| Dialogs | native modal dialogs: the focus is trapped, Escape cancels, and Cancel has the initial focus on every destructive dialog |
| A\|D\|G switch | Left and Right move between Assumption, Derivation and Goal |

### 2.2.10 Toasts, provenance and theming

- **Toasts.**
  - At most three at a time, at the bottom of the board area.
  - Info toasts stay 6 s, warnings 10 s, errors 15 s; a toast with Undo stays at least 10 s.
  - **Undo** appears only on the newest undoable toast, and only while Undo would revert exactly that action.
  - Identical messages are merged.
- **Provenance.** Everything Claude wrote appears in italics with a "Claude" marker ("(Claude's words)", "(Claude's wording)"), never in the style of your own words. That covers its messages, questions and options, suggestions, summaries, and the glosses of new vocabulary.
- **Theme colours.** Six colours can be overridden through `workbench.colorCustomizations`, with defaults for dark, light and both high-contrast themes:
  - `telelean.kindAssumption`
  - `telelean.kindDerivation`
  - `telelean.kindGoal`
  - `telelean.formalizedAura`
  - `telelean.vocabulary`
  - `telelean.highlight`

  The board follows VS Code's reduced-motion preference.

## 2.3 Editing the model without AI (M1)

### 2.3.1 Every board action

| Action | Gesture | What is written | Undo / History entry |
|---|---|---|---|
| Add a card | A\|D\|G box | a comment block in `Model/<S>/Inbox.lean` | yes / "add" |
| Edit the sentence | **Edit** or F2 (Enter saves, Esc cancels) | `natural_name:`. A docstring equal to the old sentence follows it; a formalised card gets its `lean:` pin | yes / "edit" |
| Edit the reason | **Add why / Edit why**, or the "no reason yet" chip; empty removes it | `rationale:` | yes / "edit" |
| Stance, source | chips in the expanded card | `stance:` / `source:` | yes / "edit" |
| Re-order | drag within a column, or Alt+Up/Down | `.telelean/subjects/<S>/layout.json` only | yes / no entry of its own (rides along with the next snapshot) |
| Change kind | drag to another column, **Make …**, or a "make Derivation?" chip | `type:` plus the D-11 Lean change (2.3.4) | yes / "kind" |
| Delete | **Delete**, or the Delete key | the block, and its Lean unless kept; theorem proofs go to `.telelean/subjects/<S>/attic/<id>.lean`; the id leaves other cards' `premises:` | yes / "delete" |
| New subject | subject picker | the subject's files and an import in `Model.lean` | yes / "new subject" |
| Undo / Redo | header buttons, keys, or a toast's Undo | the previous file contents | – / "undo", "redo" |
| Revert to a history entry | History → **Revert to this** → **Revert** | the subject's files as they were then | yes / "revert" |
| Refresh Lean | badge or command | `.lake/`, `.telelean/graph.json` | no |

- **Saving and conflicts.** Edits are saved at once, including any unsaved typing in the same file. telelean checks each file's current text against what it planned. If the file changed meanwhile, the edit is refused: "… changed since telelean planned "…"; nothing was applied".
- **Optimistic display.** The board shows adds, moves and edits at once, and rolls them back with an error toast when the host refuses them.

### 2.3.2 Adding cards: the A|D|G box

1. **Kind.** Pick Assumption, Derivation or Goal.
2. **Sentence.** Type one sentence. Pasted line breaks are folded into one line.
3. **Optional second row:**
   - stance chips (Assumption only);
   - a "why" field, whose prompt follows the kind and stance: "Why do you believe it?", "Where does the rule come from?", "What are you exploring?", "Why do you think it follows?" or "Why do you care?";
   - source chips (Assumption and Derivation).
4. **Add.** Press Enter or **Add assumption/derivation/goal**.

**What is written.** A comment-only block (your words, trimmed, no Lean), with an id derived from the sentence and `asserted:` set to today. If `Inbox.lean` is missing, telelean creates it and adds its import.

**During a run.** The box keeps working. Its second row folds while the run panel shows, and adding a card switches the board back to Current.

### 2.3.3 Editing and deleting

- **Editing.**
  - The sentence and the reason are edited in place; the focus returns to the card.
  - Stance and source change with one click.
  - Ids never change with the sentence.
- **Deleting, first dialog.** It lists what refers to the card: declared as a premise by, used by the proofs of, mentioned in the statements of, lemmas without a card, and other subjects' cards. It says "Nothing else refers to it." only when nothing does. The buttons:
  - **Delete card and its Lean code**, or **Delete card** for a comment-only card;
  - **Delete card only, keep Lean**. This leaves `axiom …holds` as an unmarked axiom, which the Vocabulary group flags as a hidden assumption;
  - **Cancel**, which has the focus.
- **Deleting, second dialog.** If deleting the Lean code would break other declarations (the host knows this from Lean's facts), nothing is deleted yet. The dialog reopens as "Delete its Lean code too?" and lists those declarations: cards by sentence, another subject's card with "(subject …)", anything else by its Lean name. The buttons:
  - **Delete anyway**: the listed declarations stop compiling until changed, and Undo brings the code back;
  - **Delete card only, keep Lean**;
  - **Cancel**.

### 2.3.4 Changing kind (D-11)

Kind changes never rename a statement. Part 3.5 gives the logic.

| Change | Lean effect |
|---|---|
| comment-only card, any change | only `type:` |
| Goal → Derivation | none now; the card counts as derived once `theorem n.holds` exists |
| Goal or Derivation → Assumption | adds `axiom n.holds : n`, or turns the theorem into that axiom (the proof is archived in the attic). Without a reason, an optional "Why do you hold it?" dialog appears (Skip is fine) |
| Assumption → Derivation | the axiom stays; the card shows **promotion pending** until you replace the axiom with a proof |
| → Goal | removes `n.holds`. If proofs use it, a dialog offers **Rewrite them to take it as a hypothesis** `(h_n : n)` (needs fresh Lean facts; refused when a user is not a theorem), **Keep them, marked broken**, or **Cancel** |
| → Assumption, when `n.holds` takes hypotheses | proofs that pass it arguments must change: "Rewrite them to use it directly" or "Keep them, marked broken" |

**How the board previews and confirms:**
- **Drop zones.** During a drag, the other columns become labelled drop zones showing the impact, for example "Make Derivation: promotion pending until proved". That text comes from the board's own cards only ("No card on this board uses it").
- **Re-planning with Lean.** The host re-plans the change with Lean's facts across the project. If it finds more dependents (lemmas without a card, other subjects' proofs), it asks again with its own list and says it found more. Your choice then applies to exactly the listed dependents.
- **Cancelling a drag.** Dropping a card outside every column cancels it.

### 2.3.5 Declaring premises

- **The only gesture.** The only board gesture that writes `premises:` is the tray's **These suffice ▶** or **Add to its premises ▶**, and both start a Claude run (2.4).
- **How it is written.** The declaration is written after preflight, as an ordinary undoable action labelled "These suffice: … ← N premises".
- **What it refuses.** Premises from another subject, a card supporting itself, and cycles.
- **Without Claude.** Edit `premises:` by hand. The host would accept a declare-only message, but the board never sends one.

### 2.3.6 Undo, Redo and History

**Undo and Redo.**
- 100 steps per subject, kept in memory. They survive closing the board, but not a window reload.
- Tooltips name the action ("Undo: Add assumption: …").
- If you edited a file by hand since, Undo reverses only telelean's change, and refuses when that no longer applies ("changed since; use History to revert").

**History** needs git (amendment A3). Each telelean change becomes a commit on private refs: `refs/telelean/<rootKey>/subjects/<S>` per subject, and `…/project` for the project files.
- **Never touched:** your branches, index, HEAD, remotes and hooks. Nothing is pushed.
- **When snapshots are taken:** "Initial state" when a board first loads. Hand edits are snapshotted as "Manual edits" before telelean's next change.
- **What a subject's snapshots cover:** its `.lean` files, its `layout.json` and its attic. `attempts.jsonl` and `decisions.json` are not covered.

**The History dropdown.**
- **Storage line:** "This subject: X · All subjects: Y". This is disk use, not memory.
- **Entries:** "time · action · label", 50 at a time, with **Show older entries**.
- **Preview** opens a read-only multi-file diff beside the board, titled `History: <label> (<time>)`.
- **Revert to this** asks first. It snapshots the current state, then writes the entry's state back, and the revert can itself be undone. If that first snapshot fails (for example a stale git `….lock` file), nothing is reverted and the message names the file.
- **Keep the last N** confirms inline ("Drop 3 older snapshots of Spyro? This cannot be undone.") and is disabled when there is nothing to drop. git frees the space at its next housekeeping.

**No repository.** The dropdown offers **Initialize git**, which asks before running `git init` in the model folder. With history switched off or git missing, it explains why and says that board actions and Undo still work.

### 2.3.7 When Lean checks run

- **Triggers, only while the board is open:**
  - when the board opens;
  - after you save a model file in VS Code;
  - after telelean's own edits;
  - when another program writes a model `.lean` file, `lakefile.toml`, `lean-toolchain` or `lake-manifest.json`;
  - when you click the badge or run Refresh.

  Each trigger waits `telelean.refresh.debounceMs` (750 ms) first.
- **Unsaved typing** is re-parsed after about 200 ms but not built, so the affected cards show "changed since last check".
- **The check itself:**
  - `lake build Model` runs in place in the sandbox, with the model folder read-only except `.lake/` and with `.git` hidden;
  - then one generated check file (`#check`, `#print`, `#print axioms`, `#check type_of%`) runs through `lake env lean --stdin --json`;
  - each step has a fixed 120 s limit that no setting changes.
- **Failures.** If a check fails, the facts of the last good check stay in use and are marked stale where files differ (3.4).
- **One job at a time.** Board checks and run jobs queue behind each other.
- **Toolchains.** Any toolchain other than v4.35.0 gives syntactic mode.
- **Caveat.** Lake can trust a compiled module built from another version of its file (3.7 item 5).

### 2.3.8 Files telelean writes in a model folder

| File | Written when | Gitignored | In history | Undoable |
|---|---|---|---|---|
| model `.lean` files | board actions, Accept | no | yes | yes |
| `.telelean/config.json` | Initialize | no | yes (project chain) | through History |
| `.telelean/subjects/<S>/layout.json` | re-orders, new cards | no | yes | yes |
| `.telelean/subjects/<S>/attic/<id>.lean` | archived proofs | no | yes | yes |
| `.telelean/graph.json` | after every check and every telelean edit | yes | no | no |
| `.telelean/subjects/<S>/attempts.jsonl` | every Claude round, and what you did with it | no | no | no |
| `.telelean/subjects/<S>/decisions.json` | every answer to Claude | no | no | no |
| `.lake/` | Lean builds | yes | no | no |

- **`graph.json`** describes the whole project as one versioned JSON document for your scripts: `telelean-graph`, format 1.1. The schema file in `packages/core/schema/` is named 1.0 but accepts any 1.x. It always lists `attempts: []`; only the board's own graphs carry attempts.
- **`.telelean/frozen/` and `.telelean/sessions/`** are gitignored but unused.
- **Deleted files** (an Undo of a new subject, a revert) are removed through VS Code. The guide says they go to the OS trash under VS Code's default settings; this was not verified.

## 2.4 Proving with Claude: "These suffice" (M2)

A run asks Claude whether the target follows from exactly the selected premises.
- Claude works only in a private copy of the model.
- telelean checks Claude's result with Lean and with fixed rules; no LLM judges it (Part 3.6).
- Nothing reaches your files until you review the proposal and press **Accept**. The one exception is the premises declaration at the start, which is undoable.

### 2.4.1 Starting a run from the tray

1. **Select.** Select the premises and a target: a Goal, or a Derivation chosen with ⊢. A plain click replaces the selection, so use Ctrl/Cmd+click for every card after the first.
2. **Pick a button.**
   - **These suffice ▶** proves the target from exactly the selected premises, after declaring them as its support. That replaces the target's declared premises.
   - **Add to its premises ▶** (secondary) is offered when the target already declares premises you did not select. It keeps them and adds the selected ones. A warning line names what These suffice would drop. **Docs vs code:** the guide says this button appears "instead"; the tray shows both.
   - **Self-evident?**, when only a target is selected, proves it from no premises. It declares nothing.
3. **Disabled buttons.** The reason shows next to them:
   - "An assumption is something you hold: make it a Derivation first, then prove it."
   - "Several goals are selected: choose the target with ⊢."
   - "Choose the target (a Goal or a Derivation) with ⊢."
   - "Select the card to prove too: …"
   - a run of this model folder is already active.

   While a run is active the tray folds to one line; its chevron unfolds it.
4. **Lean busy.** The button works while the board's own Lean check runs; an end-to-end test covers that race.

### 2.4.2 Consent

The first start in a model folder shows a modal, "Run Claude on this model?". Its detail says that telelean sends:
- this subject's cards (sentences, reasons, Lean statements);
- its vocabulary and your recorded answers;
- any model file Claude reads.

All of it goes to Anthropic through your Claude Code login: your claude.ai subscription, no API key.

**The answers:**
- **Run with Claude** is remembered per folder path, in VS Code's global state.
- **Cancel** starts nothing, declares nothing and is not remembered. A toast says: 'Not started: telelean sends nothing to Claude until you allow it ("Run with Claude").'

There is no command to withdraw a consent once given.

### 2.4.3 What happens at the start

1. **Busy check, then consent** (in the board session).
2. **Preflight**, in this order. Each refusal is one sentence and changes nothing.
   1. No other active run of this folder.
   2. The selection is valid: the target is a Goal or Derivation of the subject, the premises are cards of the subject, and the target is not among them.
   3. The model loads.
   4. `lean-toolchain` is v4.35.0, there is a lakefile, and `lake-manifest.json` lists no packages.
   5. The sandbox works.
   6. Available memory is at least `telelean.memory.minAvailableGiB`.
3. **Finding Claude Code**, once per window, at the first start that passes preflight. telelean looks in this order:
   1. the setting (if set, it must work: no fallback);
   2. the VS Code Claude Code extension's binary, newest first, starting with the copy VS Code actually runs;
   3. `claude` on the PATH;
   4. `~/.local/bin/claude`.

   Each candidate must answer `--version` (which contacts nobody) with 2.1.295 or newer.
4. **The premises declaration** (2.3.5). It is skipped when nothing would change, and for Self-evident?.
5. **The private copy**, at `~/.config/Code/User/globalStorage/telelean.telelean/runs/<folder>-<hash>/<run id>/`:
   - `ws/`, Claude's working directory: only the model and project files as the board sees them (open buffers included), no dot-entries;
   - `build/`, the Lean mirror with the run's own build. It is built from scratch, unless `telelean.run.reuseLeanBuild` is on and the board's last check recorded a complete build that nothing has touched since;
   - `git/`, the copy's own history;
   - `session/`: the generated settings, the guard policy and log, the MCP config with its bearer token, the system prompt, and `transcript.jsonl`;
   - also `run.json`, `base-facts.json`, and the freeze (`frozen/`) and comparator (`gate/`) work folders;
   - a `scratch/` folder is created but never used: ghost checks and statement rendering go to Lean on standard input.
6. **Base check.** Your files are built once, as one Lean job that does not count. Lean errors anywhere end the run before Claude is contacted: "The run could not start: your files have Lean errors (…); fix or save them, then start again."
7. **Claude Code starts.** Three checks run before the first prompt (2.6.2), so a refusal costs no quota:
   - the path-guard hook's self-test;
   - the account must be a claude.ai subscription login;
   - the CLI's hooks listing must show the guard as enabled.
8. **The first message** goes to Claude, and the run shows "Working · formalising".

### 2.4.4 What Claude can do, and what is sent

**Claude's tools.**
- File tools: Read, Glob, Grep, Edit and Write, confined to `ws/`.
- telelean's five tools, over a local MCP server:
  - `check_lean`: a sandboxed build plus the rule check;
  - `freeze_statements`: freezes the statements of the target and the selected premises;
  - `ask_user`: 1–3 questions;
  - `propose_assumption`: suggests a missing premise;
  - `finish`, with status proved, not_proved, insufficient, inconsistent or lean_errors.

  `check_lean`, `freeze_statements` and `propose_assumption` each count one check.
- No shell, no web, no subagents.

**What is sent through your Claude Code login.**
- A fixed system prompt, the same text every run.
- The first message: TARGET; SELECTED PREMISES; OTHER CARDS OF THIS SUBJECT (all of them, or the neighbourhood, per `telelean.run.contextScope`); VOCABULARY; EARLIER ANSWERS IN FORCE; BUDGET.
- Every model file Claude reads. All subjects are in the copy, so imports work.
- Every tool result, your answers and your Feedback.
- Claude Code's own telemetry and error reports, as in your other sessions. They are off only if VS Code was started with `DISABLE_TELEMETRY`, `DISABLE_ERROR_REPORTING` or `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`; telelean passes these through.

**What stays on the machine.**
- The run directories: the newest `telelean.run.keepRuns` (10) finished runs per folder; older ones are pruned when a run ends.
- Claude Code's session transcripts under `~/.claude/projects/`, which `--resume` uses and telelean never reads.

### 2.4.5 The run panel

- **Where.** It opens beside the board when a run starts, or below it on a narrow board.
- **Header.**
  - "Claude" and the state: Starting, "Working · formalising", "Working · proving", "Waiting for your answer", "Checking Claude's result", "Ready for review" (with the verdict once revealed), Interrupted, Accepted, Discarded, Cancelled or Failed;
  - **Cancel**, while the run starts, works, waits for an answer or is being checked;
  - × hides the panel. Hiding never stops the run.
- **Status line:**
  - round N;
  - checks 3/25 and turns 12/80;
  - agent time 4:05 / 20:00, marked "(paused)" while Claude waits for you;
  - check attempts 1/3;
  - tokens in and out for the whole run;
  - "$0.42 estimate";
  - the rate-limit state: "rate limit ok", "rate limit: close (resets …)" or "rate limited (resets …)".
- **Body:**
  - the target line ("These suffice: “…” from 3 premises", or "Self-evident?: “…” from no premises at all");
  - progress text while starting and checking;
  - question cards;
  - notices with timestamps and folded details;
  - the review;
  - your answered questions;
  - an **activity** feed: each check, freeze, suggestion and gate step, plus Claude's own words in italics. It follows new lines unless you scrolled up, and folds away in review;
  - a backend line: model · effort · Claude Code version.
- **Resizing.** The panel's edge is a splitter. Drag it, or focus it and use the arrow keys (Home and End for the limits); double-click or Enter restores the default. The size is remembered per layout.
- **The header badge** reads, for example, "Claude: working on Spyro · 3/25 checks", "Claude: a question for you · Spyro" or "Claude: proposal ready · Spyro". It shows or hides the panel, switches subject for a run on another subject, and gets a bell when the run needs you.

### 2.4.6 Claude's questions

Claude asks before formalising when a reading changes the result (modality, genericity, scope, word sense and so on), up to three questions at a time.

**Each question card shows:**
- a tag in plain words: unstated premise, genericity, modality, negation, presupposition, scalar word, vagueness, evaluative standard, indexical, word sense, tense, granularity, closed world, or other;
- Claude's question, marked "Claude asks";
- "About “…”" with the affected cards;
- 2–4 options, each with its plain consequence and an optional Lean preview;
- the board's own choices: **In my own words** (a text field), **Leave it open** (recorded), and **Decide for me** (Claude chooses and lists the choice under "assumed without asking");
- "Remember for:" **this run** (the default), **these cards** (disabled when no card is affected), or **the whole subject**.

**Answering.**
- Nothing is pre-selected.
- **Send answer(s)** sends the whole batch, and Claude's clock is paused while it waits.
- Claude's own guess is never shown before you answer; afterwards it appears under "Your answers".

**Recording.**
- Every answer is written to `.telelean/subjects/<S>/decisions.json`.
- Answers for "the whole subject", and "these cards" answers when the run involves those cards, go to later runs as earlier answers in force.
- Answers cannot be revoked yet (M3), and nothing checks that a formalisation follows them (3.6).

### 2.4.7 The checks, retry notices and the revert

- **The freeze.**
  - Claude must first freeze the statements: the target's and the selected premises'. Proofs before the freeze are refused, including proofs hidden in a definition, an instance or a structure.
  - A freeze succeeds at most once per round. New statements need a new round: Feedback, or an adopted suggestion.
- **The gate.** When Claude calls `finish`, telelean runs the gate on the committed working copy. Its tooltip names:
  - G0: allowed Lean only;
  - G1: build;
  - G3: what it rests on;
  - G4: statement unchanged (Lean's comparator, for "proved" only);
  - G5: your words untouched.

  There is no G2. Part 3.6 gives the rules.
- **Not failures.** New definitions become yes/no questions in the review, and a missing premise becomes a suggestion.
- **A failed attempt.** The board shows a notice, for example *"Attempt 1 didn't pass: it added an axiom (`shortcut`), and only you can add beliefs. Asking Claude to retry."*, and Claude receives the exact findings.
- **After the last allowed attempt** (`telelean.run.maxGateAttempts`, 3 per round), telelean:
  1. stops Claude;
  2. reverts the working copy to the newest state that passed: the last passing gate, the freeze, or the start;
  3. normalises it and re-checks it (not counted; the re-check only supplies facts for the proposal and does not block);
  4. builds the proposal from it, with notices such as *"telelean reverted Claude's working copy to “Statements frozen (round 1)” (…)"*.

  The proposal banner then says so up front ("Claude gave up: its result didn't pass the checks 3 times. This proposal holds only what last passed the checks (…)"), and Accept becomes a secondary button.
- **More rules of the loop:**
  - Edits Claude makes after a passing gate are discarded: the proposal is exactly the gated files.
  - A turn that ends without `finish` gets one reminder. A second ends the round as "ended without finishing", with the same revert.
  - Hitting the turn or time cap ends the round as "stopped at a limit", with the same revert. A cap reached during a tool call takes effect when the call returns.
  - The check cap only refuses further checks ("call finish").
  - Machine problems (the sandbox could not start, low memory) are not counted. telelean retries once after 30 s; if that also fails, the run ends as failed, "… this is not Claude's fault".
  - A Lean job that runs out of time or memory is counted against Claude.

### 2.4.8 Caps, usage and quota

- **Caps per round.** The first round, each Feedback and each adopted suggestion get a fresh budget:
  - 80 turns;
  - 25 Lean checks;
  - 20 minutes of Claude's working time (waiting for you does not count);
  - 120 s per Lean job;
  - 3 check attempts.

  There is no dollar cap and no limit on the number of rounds.
- **The "$… estimate"** is Claude Code's own figure at API list prices, showing the latest value (it is cumulative across `--resume`). A subscription is not billed per token, but runs use the plan's usage.
- **Usage limits.** When Claude Code reports a usage-limit status other than "allowed", a notice says so in local time, for example *"Close to your plan's usage limit (five-hour window, 83% used); resets at 00:45."*
- **Recorded usage.** The report card shows requests, tokens, the estimate, the duration and Claude's working time. `attempts.jsonl` records usage per round.

### 2.4.9 When a round ends: the proposal on the board

- **The banner** reads, for example, "Claude’s proposal 1 new · 2 changed · +1 vocabulary". It has:
  - the **Current | Proposed** toggle;
  - **Review…**, which opens the panel and the proposed view;
  - **Accept**, **Feedback…**, **Discard** and **Raw Lean diff…**.
- **The board switches to Proposed by itself**, unless you are dragging or editing. It shows the subject as Accept would leave it:
  - diff marks on cards ("+ new", "~ changed", "− removed": glyph, word, colour and halo), with a tooltip listing the changed fields;
  - cards the proposal removes, still shown;
  - the proposal's arrows and vocabulary.

  The proposed view is read-only (no selection, dragging or editing); expanding works.
- **Meaning before proof status (D-19).** Until you have stepped past the statements in the review, or pressed **Show result**, the target and every new or re-proved card show "result after the review". Their proof chips, footprints and verified arrows stay hidden. Outcomes that are not proof results (gave up, stopped at a limit, ended without finishing) show at once.
- **Raw Lean diff…** opens VS Code's multi-file diff of every changed file, read-only, with the run's base on the left, titled "Raw Lean diff: Spyro (round 1)". The report card's per-file **diff** buttons open one file at a time. The diff opens beside the board; if the board's group is the only one, the window splits and the board gets half the width (an open decision, Appendix A.3).

### 2.4.10 The review and the report card

The review is a stepper in the run panel: click its steps, or use Back and Next.

1. **Statement steps**, one per new or changed statement. Each asks "Does the Lean say what the sentence says?" and shows:
   - the sentence above its Lean proposition (the `#print` header is stripped);
   - a **Fully explicit** checkbox: no notation, every argument shown, no coercion arrows;
   - "It uses": the names in the statement, with glosses;
   - **Show on the board**.

   **Docs vs code:** the guide says "beside"; the code puts the sentence above the Lean.
2. **New vocabulary.** The sorts, predicates, functions and constants Claude added, with gloss and code. They are approved unless you press **Revoke…**, which prefills Feedback.
3. **Definitions (N).** Each definition or existence assumption Claude introduced, with its code and the statements that rely on it. **Yes, I endorse it** or **No…** (which prefills Feedback). Accept stays disabled until every one has Yes.
4. **Result: the report card.** It contains:
   - the verdict: proved, not proved, "Claude reports a conflict (unverified until M3)", gave up, stopped at a limit, ended without finishing, cancelled, or failed;
   - the revert note, if any;
   - **Rests on** (for "proved");
   - "Self-evident: proved without any of your premises";
   - "Not used by the proof: …";
   - **Consistency unchecked** (for "proved"; the model finder comes in M3);
   - Claude's summary, the gap it reports, and any conflict it reports;
   - **Assumed without asking**, each item with **Ask me instead** (prefilled Feedback);
   - the suggested premises;
   - the check attempts, each failure in plain words with "What Claude was told";
   - "Files Accept would change", with line counts and diff buttons;
   - the usage line.
5. **Card changes.** For a proved Goal: "Make “…” a Derivation (Lean proved it from the selected premises; recommended)", ticked by default. Untick it to keep the card a Goal.

**Two rules.** The order (meaning first, result after) is a default of the panel, not a precondition. **Show the proof result now** reveals the result at once, and Accept is at hand at every step: only the definition approvals are required.

**Panel notes.** It says "Your files changed since the run started: Accept re-checks Claude’s changes on top of them first", or "This round changed no file: Accept only records the outcome", where these apply.

### 2.4.11 Suggested premises and "I hold this"

- **How a suggestion appears.** When the target does not follow, Claude may suggest a premise after freezing. The suggestion must be a single Lean proposition over the existing vocabulary (it cannot declare anything; whitespace is collapsed). telelean checks it with a generated scratch file passed to Lean on standard input, and shows it only if the suggestion together with the selected premises proves the frozen target.
- **The suggestion card.** A translucent "Claude suggests" card at the top of the Assumptions column (proposed view) and in the report card. It shows:
  - Claude's sentence and "Why it is needed";
  - the Lean statement;
  - the chip **closes the gap (checked)**;
  - **gives the goal on its own: it may simply restate it**, when the check used none of your premises;
  - the Lean name it would get. This can differ from the name adoption finally writes (Appendix A.2).
- **I hold this** takes an optional one-line reason, then **Adopt**. telelean then:
  1. writes the card into Claude's working copy right before the target, as an Assumption worded by Claude (`worded_by: agent`), with your reason;
  2. adds it to the target's `premises:`;
  3. freezes again with it selected.

  If that freeze fails, the adoption is undone and a notice says why. Otherwise a new round starts with Claude proving the target. The card and the declaration reach your files only through Accept, and both show in the raw diff.
- **No** marks the suggestion as declined. The run stays in review.

### 2.4.12 Accept, Feedback, Discard

**Accept** applies exactly the checked files of the proposal, plus the ticked card changes, through M1's write path:
1. your hand edits are snapshotted first;
2. there is one history entry, "accept · These suffice → proved: …" (or "Self-evident? → …"), plus "(+ Make Derivation)" or "(+ N adopted assumption)";
3. **one Undo step reverts the whole Accept**;
4. a Lean check follows, and the board shows the real statuses.

The toast reads "Accepted: …. Undo reverts it." Further rules:
- **No new check without drift.** If your files are unchanged since the run started, nothing is re-checked before applying: the files are the ones the gate judged.
- **"Not proved" rounds** can be accepted too: their statements and vocabulary are applied.
- **Rounds that changed no file** are only recorded ("Recorded: … (no file changed).") with no history entry and no Undo step.
- **Changed files (drift).** If you changed model files during the run, telelean merges Claude's changes onto yours with a 3-way patch (3 context lines, no fuzz).
  - An edit of yours within 3 lines of one of Claude's refuses the Accept: *"Your edits to Model/Spyro/Main.lean since the run started overlap Claude's; Discard, or Feedback to redo it on your current files."*
  - Otherwise telelean re-freezes and re-gates the combination, with your current files as the base, before applying it. A failure refuses the Accept and lists the findings.
- **Never partial.** Accept never applies part of a proposal.

**Feedback** is a text field (Ctrl+Enter sends, Esc closes, up to 4000 characters). It starts a new round in the same Claude session with fresh caps. Claude may revise the statements but must freeze again, and the proposal is withdrawn until the round ends.

**Discard** ends the run without touching your files.

### 2.4.13 Attempts history

Each round appends one line to `.telelean/subjects/<S>/attempts.jsonl`. It holds:
- the verdict and premises;
- the footprint;
- Claude's summary (up to 500 characters);
- the check attempts;
- model and effort;
- usage.

A second line later records what you did with it: accepted, discarded, or superseded by Feedback or an adoption. The target card's **Attempts** list shows these (2.2.3). Like `decisions.json`, the file is written directly, never undone, and not in history.

### 2.4.14 Cancel, closing, reload and resume

- **Cancel** stops Claude and the run's Lean jobs at once. The working copy and transcript are kept until pruning. **Dismiss** removes an ended run from the panel.
- **Closing the board** does not stop a run; reopening the board shows it again.
- **Window reload, restart or close.**
  - An active run is saved as "interrupted", and its Lean job is cancelled.
  - **After the reload:**
    - a waiting question or a proposal comes back as it was; answering a restored question resumes the same Claude session with `--resume`;
    - a run that was working shows "The session was interrupted (the editor reloaded) while Claude was working. Your files were not changed.", with **Resume** (when a session id exists) and **Stop** (ends it like Discard; toast "Run stopped");
    - a run still starting is marked failed;
    - older leftover runs are marked failed ("superseded by a newer run").
  - Nothing starts by itself after a reload.

### 2.4.15 Run states at a glance

| State | The panel shows | You can |
|---|---|---|
| starting | "Checking the setup, copying your model and starting Claude…" | Cancel |
| working (formalise / prove) | status, notices, activity | Cancel, hide the panel |
| waiting for answer | question cards | answer, Cancel |
| gate | "Claude says it is done: telelean checks the result …" | Cancel |
| review | banner, overlay, review, report card | Accept, Feedback, Discard, I hold this / No, Raw Lean diff |
| interrupted | interruption text | Resume (if possible), Stop |
| accepted / discarded / cancelled / failed | outcome sentence (and error) | Dismiss |

## 2.5 Settings

**When settings take effect.** All are read when a model's workspace and run manager are created, so they apply after **Developer: Reload Window**; open boards come back by themselves. The exception is `telelean.claude.path`, which is read at the first run start in a window.

**Bad values.** Out-of-range numbers are clamped and rounded. Wrong types fall back to the default. An invalid model name falls back to `claude-opus-5-5`.

| Setting | Default | Allowed | Scope | What it does |
|---|---|---|---|---|
| `telelean.memory.capGiB` | 4 | 1–64 | machine-overridable | memory cap of each sandboxed Lean job (systemd `MemoryMax`, no swap); lowered automatically when less memory is free |
| `telelean.memory.minAvailableGiB` | 2 | 0–64 | machine-overridable | no Lean job starts below this `MemAvailable` ("paused: low memory"); runs refuse at preflight |
| `telelean.refresh.enabled` | true | boolean | resource | checks the model with Lean while its board is open |
| `telelean.refresh.debounceMs` | 750 | 0–60000 | resource | wait after a save or edit before re-checking |
| `telelean.git.snapshotRefs` | true | boolean | resource | history snapshots under `refs/telelean/…` |
| `telelean.git.path` | `git` | string | machine | the git executable |
| `telelean.model` | `claude-opus-5-5` | model id or alias | resource | Claude Code's `--model` |
| `telelean.effort` | `high` | low, medium, high, xhigh, max | resource | Claude Code's `--effort` |
| `telelean.claude.path` | empty (automatic search) | path (`~` expanded) | machine | the Claude Code binary; when set it must work |
| `telelean.run.maxTurns` | 80 | 1–1000 | resource | model responses per round |
| `telelean.run.maxChecks` | 25 | 1–500 | resource | Lean checks per round (check, freeze, each suggestion) |
| `telelean.run.maxAgentMinutes` | 20 | 1–240 | resource | Claude's working minutes per round |
| `telelean.run.leanJobSeconds` | 120 | 10–1800 | resource | time limit of each Lean job of a run |
| `telelean.run.maxGateAttempts` | 3 | 1–10 | resource | check attempts per round before the stop and revert |
| `telelean.run.keepRuns` | 10 | 1–100 | machine | finished runs kept per model folder |
| `telelean.run.contextScope` | `subject` | `subject`, `neighbourhood` | resource | which other cards the first message lists |
| `telelean.run.reuseLeanBuild` | false | boolean | resource | start a run's build from your `.lake/build`; best left off (3.7 item 5) |

**How the memory cap is lowered.** The effective cap is the smaller of the setting and `MemAvailable` − min(1 GiB, half the threshold), and never below 256 MiB. A job near the limit then stops at its own cap instead of pushing the machine into swap.

**Docs vs code.** The description of `telelean.refresh.enabled` says that when it is off, the board "runs in syntactic mode". The board actually shows "Lean: off" and "Lean checking is off". The effect is the same.

## 2.6 Safety features

telelean is a personal-use prototype. It keeps the proof-integrity checks and cheap safety measures, and defers adversarial hardening to the optional milestone H.

### 2.6.1 The Lean sandbox and memory

- **One wrapper for every Lean process (`runLean`).** In order: `systemd-run --user --scope` with `MemoryMax`, `MemorySwapMax=0` and `OOMPolicy=stop`; then `setpriv --pdeathsig KILL`; then `bwrap`.
- **What bwrap allows:**
  - no network (all namespaces unshared);
  - a fresh `/tmp` and `/run`;
  - `$HOME` under an empty tmpfs, with only `~/.elan` bound read-only;
  - the sources read-only and only `.lake/` writable, with `.git` hidden during board checks;
  - an environment cleared except `HOME`, `PATH` (toolchain first) and `LEAN_NUM_THREADS=4`.
- **Fail closed.** If bwrap, setpriv, systemd-run, the user manager, cgroup v2 or an enforced memory cap is missing, nothing runs ("could not start").
- **Limits.** Each job has a wall-clock limit and can be cancelled (its whole scope is killed). One Lean job at a time per window. Nothing starts below the free-memory threshold.

### 2.6.2 Confining Claude Code

- **Your own CLI, headless.** The flags:
  - `-p --input-format stream-json --output-format stream-json`;
  - `--tools Read,Glob,Grep,Edit,Write`;
  - `--disallowedTools Bash,WebFetch,WebSearch,Agent,AskUserQuestion,NotebookEdit`;
  - `--permission-mode dontAsk` and `--restricted`;
  - `--setting-sources=`, so none of your Claude Code settings, hooks or CLAUDE.md apply;
  - `--strict-mcp-config` with only telelean's server.

  Auto-memory, claude.ai MCP servers, tool search, background tasks and the auto-updater are switched off.
- **Path guard** (`telelean-path-guard.mjs`).
  - A PreToolUse command hook with `onFailure: "block"` confines every file tool to the run's `ws/`.
  - It refuses dot-segments and hidden folders, and allows Grep and Glob only on folders with no hidden entry below them.
  - telelean self-tests the hook before the CLI starts, and refuses to start unless the CLI lists it as enabled.
  - The CLI's own fences (no reads or writes outside the working directory, deny rules for hidden entries) are a second layer.
- **The working copy holds only model files.** Your real folder, `.lake`, `.telelean` and `.git` are not in it.
- **The tool server** listens on 127.0.0.1 on a random port. It requires a per-run bearer token, checks the Host header and refuses browser Origins. The config files are owner-only.
- **Process lifetime.** The CLI runs in its own process group under `setpriv --pdeathsig KILL`, so it dies with the extension host.
- **Subscription only.**
  - **Before the CLI starts,** the environment is cleaned: `ANTHROPIC_*`, `CLAUDE*`, cloud-provider and gateway variables, OTEL exporters, `NODE_OPTIONS`, `SSH_AUTH_SOCK`, and VS Code, Electron and snap variables are removed. `CLAUDE_CONFIG_DIR` and the privacy switches are kept.
  - **Before the first prompt,** the account must be a claude.ai subscription login.
  - **During the run,** it stops if the CLI reports an API key in use.

### 2.6.3 Your files, your words and your quota

- **Writes to your files.** Only two things write before or at Accept: the premises declaration (undoable), and Accept itself (one undo step, snapshotted, re-gated after drift, refused on overlapping edits).
- **What a proposal is.** Either exactly the files a gate passed, or, after a revert, the newest commit that passed a gate or the freeze rules (or your base) plus telelean's pins and docstrings.
- **Consent** is asked per folder before anything is sent.
- **Claude's guesses** stay hidden until you answer, and **Claude's words** are always marked.
- **No session starts by itself.**
  - The backend is created lazily, at the first start that passes preflight.
  - A reload never resumes a session.
  - Caps bound every round.
  - Machine problems are retried once and never counted against Claude.

### 2.6.4 Quota tripwires and test isolation

- **`TELELEAN_NO_REAL_CLAUDE`.** Any non-empty value other than `0` or `false` makes the runner refuse to look up a Claude binary, or to spawn anything but a node test double from a test-fixtures folder. Every test configuration sets it.
- **Test mode.** In VS Code Test mode the extension refuses real Claude ("real Claude is disabled in Test mode"). Only a FakeBackend installed by a test can run.
- **Scripts.** `scripts/walkthrough-claude.mjs` and `scripts/smoke-claude.mjs` are dry by default. Going live needs both `--live` and `TELELEAN_WALKTHROUGH_LIVE=yes` (or `TELELEAN_SMOKE_LIVE=yes`); either one alone refuses before anything is resolved. The walkthrough also refuses `--live` while the tripwire is armed.
- **Real binary check.** The one test that runs the real binary's `--version` is opt-in (`TELELEAN_ALLOW_REAL_CLAUDE_VERSION=1`).
- **VS Code smoke and end-to-end tests** run in an isolated profile under a scratch directory:
  - scratch HOME, XDG folders, user data and extensions;
  - xvfb, `--disable-extensions`, and `GIT_CONFIG_GLOBAL=/dev/null`;
  - copies of the sample model.

  The run refuses to start without that profile. Afterwards it checks that the real `~/.config/Code` and similar folders did not change, and that no process or `telelean-*` unit is left.
- **Order.** Runner and extension tests run sequentially and use `$TELELEAN_TEST_TMP`.

### 2.6.5 Webview and host hygiene

- **Strict CSP.** Two nonce'd scripts only; no inline styles; no eval; command URIs disabled; local resources only from `dist/webview`.
- **Message validation.** Every message from the webview is validated by core's protocol parser.
- **Open in editor** re-checks that the path stays inside the model folder, also after symlinks are resolved.

---

# Part 3: The Lean system

**Scope.** This part states the logic telelean implements today, at M1 (the board) and M2 (one-shot "These suffice"), as `packages/core` and `packages/runner` do it. It is written for a reader with a formal-methods background who may want to change it. Where the design documents differ, the difference is stated. Those documents are 02 design decisions, 03 architecture, `docs/design-amendments.md`, `docs/m1-plan.md` and `docs/m2-plan.md`.

**Evidence:**
- unit tests on hand-made Lean facts;
- integration tests that run Lean 4.35 on the Spyro sample with a scripted (fake) Claude;
- the Lean outputs quoted in 3.8, re-run for this report in scratch copies;
- scratch probes that ran the real core rules on hand-made facts, for the gaps in 3.7.

**The walkthrough with the real Claude has not been run.**

**Notation.**
- *E*: a built Lean environment (every module of the model).
- *Ax(c)*: the axioms that constant *c* depends on, as `#print axioms c` prints them (Lean's `collectAxioms`). These are all the `axiom` declarations reachable from *c*'s type and value, transitively, through definitions, theorems and the values of opaque constants. Only axioms appear; theorems and opaque constants never do.
- *⌜e⌝*: the text Lean prints for *e*, with every run of whitespace collapsed to one space. telelean's check file sets only `pp.fullNames true` and `pp.proofs false`, so the defaults hide implicit and instance arguments. Several checks compare these texts rather than Lean terms; the places where this matters are pointed out.
- *STD* = {`propext`, `Classical.choice`, `Quot.sound`}: Lean's standard axioms, treated as part of the logic.
- *H_v* = `n.holds`, for a card *v* whose statement is named *n*.
- States of a run:
  - *B*: the user's files when the run started, with the facts of a base build;
  - *R*: the files when the current round began;
  - *S*: Claude's working copy now;
  - *F*: the round's freeze;
  - *A*: the working copy at the newest ghost adoption.
- The selection: target *T*, selected premises *P* (possibly empty), adopted ghosts *G*.

**The central claim** (02, "Prototype profile"): *"proved" means proved from exactly the assumptions you selected.* Precisely:
- Lean accepts a theorem `T.holds : T` whose axiom set lies inside a *permitted set*. That set is computed from the selection plus fixed logical and vocabulary axioms.
- The proof is checked against statements frozen before any proof was written or changed **in the current round**.

3.4 makes this precise for the board, 3.6 for runs, and 3.7 says what it does not cover. Above all, it does not cover whether the Lean says what your sentence says.

## 3.1 The objects

**Cards.** A card is a comment block in a model Lean file:

```lean
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
```

The block is line-oriented `key: value` text, not YAML. Its fields:
- `id`: a stable identity. When it is absent, it is derived from the sentence (TL112).
- `type`: ASSUMPTION, DERIVATION or GOAL (`kind` is accepted as an alias).
- `natural_name`: the user's sentence. It is the specification. telelean never rewrites it, and the run gate refuses any change to it.
- `rationale`, `stance` (believe / rule / supposing) and `source` (observed / reported / inferred / common).
- `asserted`: a date, so that indexicals such as "new" stay interpretable.
- free notes after `---`.
- `premises`: declared joint support.
- `lean`: the pinned binding (3.2).
- `origin`, `session`, `worded_by`: provenance. `worded_by: agent` marks Claude's wording.
- `supersedes`, `refines`, `tags`: kept as written, with no logical effect yet.

**The three kinds.** Kind is metadata (the `type:` line), not a location.
- **ASSUMPTION**: something held. Formally an axiom.
- **DERIVATION**: something claimed to follow. Formally a theorem; until it has one, it is "pending".
- **GOAL**: something one wants to know follows. It is never taken as given, so it has no `.holds` at all.

**Subjects.** A subject is a module subtree with its own namespace:
- `Model/<S>.lean` imports `Model/<S>/Vocabulary.lean`, `Inbox.lean` (where new cards go) and `Main.lean`;
- `Model.lean` imports every subject.

Consequences:
- Two subjects can both declare `Character`.
- Ids are unique across the project.
- Premises stay within one subject (TL121; runs refuse premises from another subject).
- One subject uses another only through an explicit `import`.
- A file the library root does not import is never checked by Lean (TL118).

**Sentence and Lean.** A card always has a sentence and optionally a Lean statement. The statement is one *interpretation* of the sentence; nothing in the system checks that it is the right one (3.7). The statement's docstring mirrors the sentence (D-9), so Lean's own hover shows the user's words.

**Cards without code.** A block with no declaration bound to it is a pure comment: status `informal`, no Lean meaning, no logical effect. It can be selected as a premise, but it contributes nothing unless Claude formalises it in that run.

**Stance and rationale have no logical effect.**
- No status, footprint or permitted set depends on them. A "supposing, for argument" assumption is a global axiom exactly like a belief: telelean has no scoped suppositions and no discharge of hypotheses.
- They feed only three things:
  - the `no-rationale` flag and chip (TL011: "no reason yet", worded "no source yet" for stance `rule`);
  - G5's requirement that a run leaves them byte-identical;
  - the context sent to Claude.

**Declared premises.** `premises:` is the user's claim that these cards jointly support this one (dashed arrows).
- It is written by "These suffice", which declares exactly the selection as an undoable edit, and by ghost adoption.
- Claude itself may never change it.
- It is compared with what Lean's proof actually uses (3.4).
- Checks: TL007 (dangling premise), TL015 (premise cycle), TL121 (premise in another subject).

## 3.2 The encoding

| Card state | Lean (D-2(b)) |
|---|---|
| no code (any type) | the comment block only |
| formalised | `abbrev n : Prop := S` (a `def n : Prop := S` is accepted too) |
| ASSUMPTION | the statement plus `axiom n.holds : n` |
| DERIVATION, proved | the statement plus `theorem n.holds : n := p` |
| DERIVATION, pending (after A→D) | the statement plus `axiom n.holds : n` |
| GOAL | the statement and no `n.holds` |
| conditional derivation | `theorem d.holds (h : g) : d := …` |

**Why two declarations.** The abbrev carries *meaning*: it is a definition and commits to nothing. `n.holds` carries *commitment*: an axiom means held, a theorem means derived, and its absence means open. Three things follow:
1. The user's files never need `sorry`. A `theorem g : S := by sorry` would assert S through `sorryAx`, and other proofs could use it.
2. Beliefs appear by name in every footprint, as `….holds` axioms.
3. Kind changes touch only `n.holds` (3.5).

**Exact forms required** (checked from Lean's facts).
- **The statement** must be a Prop-valued abbrev or def: `#print` shows kind `def` and `#check` shows type `Prop` (without facts, the header is checked). Bound to anything else, the card is `ill-formed` (TL113). telelean does not guess.
- **`n.holds` must state exactly n.** Either ⌜type(n.holds)⌝ = ⌜n⌝, or, for a conditional derivation, ⌜n₁ → … → n_k → n⌝ where every nᵢ is exactly some card's statement name. Otherwise the card shows ".holds says something else" (TL114) and is not proved. This compares printed text, not terms: `theorem n.holds : ¬ GoodAddition cynder newSpyro` states the unfolded proposition, which Lean accepts as definitionally equal, but telelean reports a mismatch.
- **`n.holds` is found by name** anywhere in the project (by convention right after the statement). A `.holds` of another kind, such as a def that proves the statement, is treated like a theorem.

**Conditional derivations.** `theorem d.holds (h : g) : d := …` says "d follows if g does", for an unproved g. The card is *conditional on g* and never `proved`. The A→G rewrite of D-11 produces exactly this form.

**Vocabulary declarations** need no markup; telelean computes them:

```lean
axiom Character : Type                              -- a sort
axiom HasDarkPast : Character → Prop                -- a predicate (any arity ≥ 0)
noncomputable opaque cynder : Character             -- a named constant
noncomputable opaque f : Character → Game           -- a function
axiom Character.exists : Nonempty Character         -- the sort's presupposition
instance : Nonempty Character := Character.exists   -- plumbing, not listed
```

**Presuppositions.**
- **Where they come from.** Lean accepts `opaque cynder : Character` only with an inhabitant of `Character`, which the instance provides from `Character.exists`. So every statement that mentions `cynder` depends on `Character.exists` (and on `Classical.choice`). In linguistic terms, naming Cynder presupposes that characters exist, and the presupposition is visible in Lean's axiom lists. Re-run for this report: `#print axioms Spyro.cynder_dark_past` gives `[Classical.choice, Spyro.Character, Spyro.HasDarkPast, Spyro.Character.exists]`.
- **Per card.** presup(x) := Ax(statement of x) ∩ {presupposition axioms}. In practice these are the sorts of the named opaque constants the statement uses, not every sort it mentions: a statement over sorts and predicates only (`∀ g c, …`) presupposes nothing.
- **What a proof may use without the user selecting a card for it:**
  - presup(T) and presup of every selected card;
  - any presupposition inside the footprint of a selected, user-proved derivation (DF, 3.6);
  - whatever existence claims the user's own signature makes (constants declared with `axiom`, which the signature admits).
- **Other declarations.** A declaration that is not a proof (a new constant, a definition) may also use any presupposition (3.6, footprint rule).

**Naming and binding.** A block binds to its statement declaration:
1. by `lean:` (pinned, fully qualified; the first name is the statement), which always wins;
2. otherwise by adjacency: the next declaration with no blank line in between. A docstring, attributes, modifiers and comments may sit in between. A blank line, another block or the end of the file means the card has no code. `example` and `mutual` cannot be bound (TL014).

Further rules:
- A declaration belongs to at most one card (TL017).
- Whenever telelean edits an adjacency-bound block, it writes the pin, so a declaration inserted later cannot silently rebind the card.
- In runs, normalisation pins every statement formalised in the run (3.6).

**Project defaults.**
- **Implicit variables.** The scaffold writes `autoImplicit = false` and `relaxedAutoImplicit = false`.
  - With autoImplicit on, an unknown lower-case name in a declaration *header* (a theorem's or axiom's type, a binder) silently becomes an implicit variable: `theorem s2 : HasDarkPast cyndr` elaborates to `∀ {cyndr : Character}, HasDarkPast cyndr`.
  - In a card's statement abbrev the proposition is the *value*, where auto-binding does not apply, so `abbrev s1 : Prop := HasDarkPast cyndr` is an "Unknown identifier" error either way.
  - TL110 warns when `autoImplicit` is on or not switched off (Lean's default is on). It does not read `relaxedAutoImplicit`.
- **Toolchain.** Exactly `leanprover/lean4:v4.35.0`. Other toolchains get the board in syntactic mode (cards read from the text only) and no runs.
- **Dependencies.** No Lake dependencies (no Mathlib).

## 3.3 The vocabulary discipline

**What counts as vocabulary.** Every declaration *in a subject's modules* that is bound to no card. Declarations in the library root (or any other non-subject module) are never vocabulary items; see the signature in 3.6.

**How it is classified.** From Lean's facts: the type from `#check`, the kind from `#print`, the sort of the type from `#check type_of%`. This is a "simple shape check" (02 D-3, prototype profile). "Sort" below means a project sort, i.e. an `axiom T : Type`.

| Declaration | Classified as | Accepted shape |
|---|---|---|
| `axiom T : Type` | sort | exactly `Type`: no arguments, no universe parameter |
| `axiom X : Nonempty T`, T a sort | presupposition (attached to T) | |
| `instance : Nonempty T := <T's presupposition>` | plumbing, not listed | |
| an axiom whose type is a proposition (`type_of%` gives `Prop`) | unmarked axiom: a hidden assumption (TL104) | never vocabulary |
| `axiom` or `opaque P : T₁ → … → Tₙ → Prop` | predicate (n ≥ 0, so `axiom P : Prop` is a propositional symbol) | every Tᵢ a sort, no implicit or instance binders; otherwise TL111 |
| `opaque c : T`, `opaque f : T₁ → … → T`, all sorts | constant, function | declaring it with `axiom` instead: TL111 |
| any other axiom or opaque (`Empty`, `PLift False`, `Type 1`, `Sort u`, a type that is not a sort) | other | TL111; never part of the signature |
| def, abbrev, structure, inductive, class, any other instance | definition | a question for the user when it lies on a statement path |
| a theorem without a card | lemma | used in proofs only |

**What the gate forbids, and the attack each rule blocks.** These rules apply to vocabulary added in a run. Several attacks were found and verified with real Lean during the design reviews and the M2 verification.

- **New axioms other than allowed claims and vocabulary** (rule `new-axiom`).
  - Before the freeze, a new axiom must be either the `.holds` of a selected ASSUMPTION or adopted ghost, or a vocabulary item of its own (bound to no card, not an unmarked axiom). The rule is defined by "is it vocabulary?", not by Prop-ness:
    - a new presupposition `axiom T.exists : Nonempty T` for a project sort is allowed, and becomes a definition question;
    - a new axiom bound to a card, a Prop-valued belief, or an axiom telelean cannot classify is refused, whatever its type.
  - After the freeze, no new axiom at all.
  - *Blocks:* Claude simply asserting the goal (`axiom shortcut : cynder_not_good`) or a missing premise.
- **An axiom written directly below a card's block** (`new-axiom`, token `statement`). Such an axiom is bound to the card, so it is never vocabulary and never signature. *Blocks:* found by the M2 verification with real Lean. `axiom side_goal : Empty` under a selected GOAL card without code becomes that card's "statement", and an inhabitant of `Empty` proves anything.
- **Axioms of a type that fits no vocabulary shape** (`Empty`, `PLift False`, `Type 1`, `Sort u`; rule `vocabulary-shape`, which catches kind `other`). These are never part of the signature. *Blocks:*
  - non-propositional types that still carry a proof;
  - a universe-polymorphic `Character : Sort u` instantiated at `Prop`.
- **Predicates, constants and functions whose argument or value types are not sorts** (`vocabulary-shape`). *Blocks:*
  - `axiom Character : Prop` used as a sort (all its inhabitants are equal by proof irrelevance). Alone it is a harmless propositional symbol, but every predicate or constant over it is refused.
  - a constant `{g : Game // IsPG g}`, whose existence presupposition *is* the belief;
  - a predicate over `PLift p`.
- **Constants and functions declared with `axiom`** (`vocabulary-shape`). *Blocks:* a silent existence assertion. An axiom constant of type T implies `Nonempty T` without T's presupposition showing in any footprint.
- **Definitions on a statement path** become questions, and Accept needs a "yes" to each. *Blocks:* a belief tucked into a definition body. In the literal reading of 3.8, `def InGame c g := GoodAddition c g` makes the literal statement say the normative one, and the proof's footprint stays clean. **The gate lets this through on purpose** (a definition may be legitimate); the user's "yes" is the check.
- **Declarations that existed before the run stay unchanged** (`existing-changed`). *Blocks:* turning existing vocabulary into a definition that makes the goal easy. With `def GoodAddition c _ := ¬ HasDarkPast c`, the proof's footprint lies *inside* the permitted set, so a footprint check alone would pass it.
- **Presuppositions created in a run** are always definition questions, never approved automatically. *Blocks:* a new existence commitment slipping in unnoticed.

**Deferred to milestone H:**
- the full data-type rule: structures and inductives with propositional fields, `Subtype`, `Sigma`, `PLift`, families indexed by propositions are today only questions to the user;
- restrictions on instances: no allowlist, and instance priorities are allowed. See 3.7 for a consequence.

## 3.4 Lean facts and statuses

**Facts.** A refresh builds the model in a sandbox and feeds Lean a generated check file. This happens on every save while the board is open, and on every check in a run (in Claude's copy). For every declaration the check file asks:
- `#check @N`: the type;
- `#print N`: the kind, attributes and value (proofs elided);
- `#print axioms N`: the footprint;
- `#check type_of% @N`: the sort of the type.

Lean's `.ilean` index adds positions and the references between declarations.

**Facts belong to one version of each file:**
- **fresh**: the file's hash equals the hash the build saw;
- **stale**: the file changed since. Its declarations keep their previous facts by name, as long as each declaration's current keyword agrees with the kind Lean reported (`kindsAgree`; for example `abbrev`→`def` keeps the facts, since Lean reports both as `def`);
- **unchecked**: its module failed, was not built, or is unknown. No facts.

Freshness is judged against the source hashes taken before and after the build. If Lake itself trusts a stale compiled file, the facts can still be wrong (3.7 item 5).

**Footprints.** The footprint of a card is computed from Ax(H_v). Because Ax lists only axioms, the cards that appear in it are exactly those whose `.holds` is an axiom: assumed assumptions, pending derivations, and goals asserted as axioms. A derivation proved by a theorem never appears; its own assumptions do.

Each axiom in Ax(H_v) is mapped as follows:
- a standard axiom: dropped;
- an axiom-declared sort or predicate: dropped (symbols, not beliefs);
- a card's `.holds`: that card's id;
- a presupposition: `presup:<name>`;
- `sorryAx`: the status "uses sorry";
- anything else: `axiom:<name>`, with warning TL103. That covers an unmarked axiom whose type is a proposition, a constant or function declared with `axiom` (an existence claim), and an axiom outside the subjects.

Constants and functions declared `opaque` never occur in Ax at all.

**Statuses** are a product of dimensions, not a ladder (D-15): formal × proof × flags. Certificates exist in the data model but are always `none` until M3.
- **formal:**
  - `informal`: no code;
  - `formalized`;
  - `ill-formed`: TL101 (statement not found), TL113 (not a Prop abbrev or def), or a Lean error inside the card's statement or `.holds`.
- **proof**, computed only for a card bound to a statement that exists and is a Prop abbrev/def, from its type and its `n.holds`:

| type \ `n.holds` | absent | axiom | theorem, no sorry | theorem using sorry |
|---|---|---|---|---|
| ASSUMPTION | none, `missing-holds` (TL117) | assumed | proved or conditional, `provable-assumption` (TL106) | none, `uses-sorry` |
| DERIVATION | none | pending-promotion, `claimed` | proved or conditional | none, `uses-sorry` (TL115) |
| GOAL | none | assumed, warning TL116 ("make it an Assumption?") | proved or conditional, `proved-goal` (TL105) | none, `uses-sorry` |

Two further cases:
- A theorem whose type is neither *n* nor n₁ → … → n is `none`, with `holds-mismatch` (TL114).
- A theorem without usable facts (type and axiom list) is `none`, with `not-checked`. **The board never shows "proved" without Lean.**

**"Proved", precisely (the board, any card).**

> proved(v) ⟺ (0) v is bound (pinned or adjacent) to a statement n that exists and is a Prop `abbrev` or `def` (no TL101, TL113); (1) Lean has usable facts for H_v (fresh, or kept from a stale file) that include its type and its axiom list; (2) H_v is not an axiom; (3) ⌜type(H_v)⌝ = ⌜n⌝; (4) H_v uses no sorry (`sorryAx` ∉ Ax(H_v)).

Without (0), no proof status is computed at all, even when `n.holds` is a sorry-free theorem whose printed type is n; such a premise is also unusable in a run.

**What "proved" means formally.** E ⊢ H_v : n, and the non-logical assumptions this derivation uses are exactly Ax(H_v) \ STD. The kernel treats an axiom as a constant with a type and no value, so a proof that uses the axioms a₁ : τ₁, …, a_k : τ_k stays valid when they are replaced by bound variables. Hence proved(v) yields the closed theorem ∀ (a₁ : τ₁) … (a_k : τ_k), n, with definitions unfolded, in Lean's logic with STD.

In words: *n holds in every interpretation of its vocabulary in which the footprint's presuppositions and the statements of its footprint cards hold.* The vocabulary here means the axiom-declared sorts and predicates in Ax(H_v), plus the opaque constants and functions that n uses. No proof can depend on which element an opaque name denotes, because the kernel never unfolds an opaque constant. Footprints are exact and transitive (D-1).

> conditional(v; u₁ … u_k) ⟺ the same, but with ⌜type(H_v)⌝ = ⌜n_{u₁} → … → n_{u_k} → n⌝, each n_{uᵢ} exactly a card's statement name. It certifies ⊢ n_{u₁} → … → n_{u_k} → n with the given footprint.

**The other values.**
- **assumed**: H_v is an axiom. If that axiom does not state n, the card stays "assumed" but gets TL114, and it cannot serve as a premise.
- **pending-promotion** (flag `claimed`): a DERIVATION whose H_v is still an axiom, after A→D. Proofs that rest on it get `rests-on-claimed`.
- **not-checked**: no usable facts.
- **stale**: the last known status, dimmed.
- **broken**, `depends-on-removed`, `unselected-used`, `signoff-stale`: defined in the data model but **never computed** by the current code. Only `broken` (also used for `depends-on-removed`) has a board chip, which the user guide (§7) lists; `unselected-used` and `signoff-stale` are not displayed anywhere.
  - What actually happens after D-11's "keep them, marked broken": the `.holds` is removed, and the declarations that used it fail to compile. They show as `ill-formed` (a Lean error inside the card) or `not checked` (their module failed).
  - Lean's unit of failure is the module, so one broken proof leaves every card of that module, and of the modules that import it, without fresh facts.

**Flags that depend on other cards.**
- `self-evident`: proved, and the footprint contains no card and no `axiom:` entry, so the card is proved from presuppositions alone.
- `existence-commitment` (TL108): the footprint contains a presupposition that none of these presupposes: the card's own statement, the statement of any footprint card, or (for a conditional proof) the statement of any hypothesis card.
- TL102: the proof is conditional, or its footprint contains a goal asserted as an axiom.
- `definitional-choice`: the statement closure uses a definition (D-4).

**Arrows.**
- **declared** (dashed): u ∈ premises(v).
- **verified** (solid): v is proved or conditional, and u ∈ direct(v) ∪ on(v).
  - direct(v) is the set of cards reached from H_v's references in Lean's index. The search follows references through declarations that belong to no card (lemmas, definitions) and stops at the first card `.holds`.
  - Arrows from a conditional proof's hypotheses are marked conditional.
  - They come from references on purpose: a goal proved through a derivation gets the arrow from that derivation, whereas its footprint shows only the derivation's assumptions.
- **lean-ref**: v's statement mentions u's statement.

**Mismatch flags** (only when v is proved or conditional) are judged at the level of assumptions. Let closure(v) be the transitive closure of direct ∪ on. Let rests(x) = {x}, unless x is proved or conditional, in which case rests(x) = (footprint cards of x) ∪ on(x).
- `declared-unused` (TL109, a hint) on p ⇢ v when p ∉ closure(v).
- `used-undeclared` (TL107, a warning) on u → v when u ∉ premises(v) and rests(u) ⊄ ⋃_{p ∈ premises(v)} rests(p).

**References versus footprints.** References are what the source mentions; the footprint is what the kernel term uses. They normally agree, but a constant that automation puts into a proof term without the source naming it gives a footprint entry without an arrow. **The footprint is authoritative.**

## 3.5 Kind changes (D-11)

**Principle.** Only the `type:` line and `n.holds` change; statements and names never do. A `.holds` that other declarations use is never removed without an explicit and complete confirmation.

**Users of H** (write H = `n.holds`):
- the declarations whose references reach H, transitively, across the whole project: other cards' proofs, lemmas without a card, other subjects' proofs;
- while some file is stale, also the declarations found by a textual scan;
- for an axiom H, also every declaration whose Ax contains H although no reference shows it (for example a use through notation).

| change | no code | H absent | H axiom | H theorem |
|---|---|---|---|---|
| G→D | type only | type only ("counts as derived once proved") | type only: now pending promotion | type only ("already proved") |
| G→A, D→A | type only | type plus `axiom n.holds : n` | type only | theorem becomes axiom; the proof is archived in `.telelean/subjects/<S>/attic/` |
| A→D | type only | type only | type only: pending promotion (`claimed`) | type only |
| A→G, D→G | type only | type only | no users: H removed; users: confirm | the same, with the proof archived |

**Effects on dependents, read logically.**
- **G→A, G→D, A→D, and D→A of a non-conditional H.** The users' types do not change, so the users stay valid.
  - G→A introduces a new axiom: a belief the user supplies (the drop asks for an optional reason).
  - D→A trades a proof for an axiom of the same type. The users keep compiling, but their footprints now contain `n.holds` instead of n's assumptions.
  - A→D keeps the axiom and marks it claimed ("never remove a `.holds` that others use until its replacement exists"). The card becomes proved once a theorem replaces the axiom, written by hand or by "These suffice" with this card as target.
- **A→G and D→G remove H**, since a goal is never taken as given. When H has users, the user chooses one of two options.
  - **Rewrite** (needs fresh facts for every touched file):
    - every user d becomes `theorem d (h_n : n) … : …`, with the new hypothesis as its *first* binder;
    - occurrences of H inside d become `h_n`;
    - occurrences of another rewritten user c inside d become `(c h_n)`.

    Logically this is →-introduction, discharging the axiom, applied to everything that depended on it. Cards whose `.holds` is rewritten become *conditional on n*. The rewrite is refused, and "mark broken" must be chosen instead, in three cases:
    - a user is not a theorem (a def or instance cannot take a hypothesis without changing its type);
    - a use of an axiom H is invisible to the references;
    - H's type is not of the form `… → n`.
  - **Mark broken:** remove H; the users stop compiling (3.4).
- **A conditional H** (`theorem n.holds (h : a) : n`):
  - G→A and D→A replace it by `axiom n.holds : n`, which takes no argument, so its direct users must change. "Rewrite" drops the arguments: `(n.holds h)` becomes `n.holds`.
  - The A→G and D→G rewrite replaces every whole application `(n.holds h …)` by the new hypothesis `h_n`.

**Preview and plan.**
- The drop-zone text is computed from the board's graph alone: `proofDependents` follows verified arrows transitively.
- The host then re-plans with the Lean facts across the whole project. When the dependents the user confirmed do not cover all the ones it finds, it refuses with `needs-confirmation` and lists every dependent.

## 3.6 The "These suffice" judgement (M2)

### Inputs and preflight

The inputs are P (possibly empty: the tray's "Self-evident?" button, which declares nothing) and T. Preflight refuses the run unless all of the following hold:
- T is a GOAL or DERIVATION of the board's subject. An ASSUMPTION is held, not proved: make it a Derivation first.
- Every premise is a card of the subject, and T ∉ P.
- No other run of this model folder is active, and the model loads.
- The toolchain is v4.35.0, and the project has no Lake dependencies.
- The sandbox is available, and there is enough free memory.

Then, in order:
1. telelean declares P as T's `premises:`, as an undoable M1 edit (skipped when P is empty or unchanged).
2. It copies the model files into a private working copy.
3. It builds the user's files once. **Lean errors anywhere end the run before Claude is contacted**, because Claude may not change the user's files. This build's facts become B's facts.

### The protocol of one round: formalise, freeze, prove

1. **Formalise.** Claude may:
   - add vocabulary;
   - write statements for T and for selected premises that have none;
   - write `axiom p.holds : p` for selected ASSUMPTIONs;
   - ask the user questions.

   It may write no proofs (rule `proof-before-freeze`).
2. **Freeze** (`freeze_statements([T])`). It succeeds **at most once per round**: after it the stage is "prove", and a second call is refused ("already frozen in this round; statements change only after the person's feedback"). If the freeze rules pass, telelean records:
   - **the permitted set Perm(F)**;
   - **a snapshot**: every non-theorem declaration of the subject's files, each with its printed kind, type and value; and every axiom of the project;
   - **the challenge for G4**: a copy of the working copy without `T.holds` and everything that uses it, plus a generated module containing `theorem T.holds : T := sorry`. This is the only `sorry` telelean ever writes. The copy is built and exported with `leanexport`.

   Only then is the `freeze` commit made.
3. **Prove.** Proofs are now allowed. No new axiom may be added, and the frozen declarations must stay unchanged. Claude may suggest a missing premise with `propose_assumption`.
4. **Finish** (`finish(status)`). telelean normalises the working copy, then runs the gate on exactly one committed state.

**The check budget.** `check_lean`, `freeze_statements` and each `propose_assumption` count one check against `telelean.run.maxChecks` (25 per round). Once the budget is used up, these tools are refused ("check budget used up … call finish"); the round itself goes on.

### Rounds

- **What a round is.** A run's rounds are the first round, each Feedback (back to formalising; a new freeze is needed before "proved"), and each ghost adoption (frozen again at once, with the ghost selected). Caps and gate attempts count per round.
- **Feedback keeps the working copy.** It does not revert, and it moves R to the current head. Proofs from earlier rounds therefore survive into the next round, and `proof-before-freeze` sees only what changed since R.
- **Claude's earlier statements are unprotected.** Claude's own formalisations from earlier rounds are not in B, so `existing-changed` does not protect them in a later round. The formalise/freeze/prove separation holds *within* a round (3.7 item 7).

### The permitted set

```
Perm(F) = ( STD ∪ Sig ∪ Sel ∪ Pre ∪ DF ) \ { T.holds, sorryAx }

STD = { propext, Classical.choice, Quot.sound }
Sig = { a | a is an axiom of the frozen project, bound to no card, whose type Lean did not report as a Prop,
            and either a is a vocabulary item of kind sort, predicate, function or constant (its TL111 flag is ignored),
            or a is no vocabulary item, Lean typed it, and it lies outside every subject's files (e.g. the library root) }
Sel = { p.holds | p ∈ P ∪ G, p has a statement, p.holds exists, is an axiom, and states exactly p (no TL114) }
Pre = ⋃ { presup(x) | x ∈ {T} ∪ P ∪ G }          (every selected card counts, usable or not)
DF  = ⋃ { Ax(d.holds) \ {sorryAx} | d ∈ P ∪ G, d.holds is not an axiom, d is proved (not conditional),
          T.holds ∉ Ax(d.holds), and the proof is the user's own: d had the same statement in B and
          d.holds has the same source text as in B (status and Ax taken from B's facts when B has facts) }
unusable = the selected cards that contribute to neither Sel nor DF
```

**Notes on the formula.**
- **The beliefs it admits.** The only beliefs in Perm(F) are the selected `.holds` axioms, and the axioms that the user's own proved selected cards rest on. The latter can include the user's hidden assumptions, if those proofs use them.
  - Sel does not depend on the card's type. An assumption, a pending derivation (its claim) and a goal asserted as an axiom all contribute their axiom.
  - A selected GOAL or DERIVATION with no proof, or only a conditional one, contributes nothing except its presuppositions.
- **Only proofs the user already had contribute.** A proof that Claude writes or changes for a selected premise never widens the set it is itself judged against, nor the next freeze after Feedback (decisions-log §27). Claude may still prove such a premise and use it as a lemma, but that lemma's own footprint must then lie inside Perm(F).
- **Selecting a proved derivation d permits the assumptions d rests on, not merely d's statement.** "Proved from {d}" therefore certifies that T follows from d's assumptions. The proof need not even pass through d (the report card then lists d as unused). Since d's assumptions entail d, this is a weaker claim than "T follows from d".
- **The target's own `.holds` is never permitted.** A target with pending promotion cannot use its own claim, and a selected derivation that rests on that claim is unusable.
- **The signature trusts the user.**
  - It is project-wide, not limited to the run's subject.
  - It includes the user's own constants declared with `axiom` (existence claims, which the shape rule refuses for *new* vocabulary).
  - It includes the user's shape-violating predicates and constants: Sig ignores the TL111 flag, and only new vocabulary is held to the shape rule.
  - Its second branch admits any non-Prop axiom outside every subject's files (the library root, or any other non-subject module), provided Lean typed it. Such axioms are never vocabulary items, so the board shows them as `axiom:` with TL103 while the gate accepts them. Claude cannot edit those files (G0 `outside-subject`).
- **No freeze.** In a round that finishes without a freeze, the footprint rule uses the same formula computed over S, with B.
- **Zero premises ("Self-evident?").** Perm(F) = STD ∪ Sig ∪ presup(T).
- **Spyro, normative reading, all three selected:** 13 names (3 standard axioms, 5 signature symbols, 2 presuppositions, 3 selected `.holds`).

### What a "proved" verdict guarantees

Suppose a round ends with verdict `proved`. Partition Ax(T.holds) \ STD, which lies in Perm(F), into three parts:
- Σ: the signature axioms (sorts, predicates, and any user constants declared with `axiom`);
- Π: the presupposition axioms (from Pre, or inside DF);
- Α: the rest, i.e. the selected `.holds` axioms and the other axioms behind selected user-proved derivations.

Then, in Lean's logic with STD (binders in dependency order):

> ⊢ ∀ Σ, (⋀ Π) → (⋀ Α) → T

This holds for three reasons:
1. axiom constants can be abstracted (3.4);
2. Ax(T.holds) ⊆ Perm(F), by G3's footprint rule and by G4's axiom check;
3. G4 compares T.holds's type, the closure of that type, and the stated types of the permitted axioms, as Lean terms, against the freeze.

So the types in Α are the *frozen* statements of the selected premises (and of the assumptions behind the selected user-proved derivations), and the conclusion is T's frozen statement. Separately, every other declaration Claude added or changed is held to Perm(F), or to Perm(F) plus all presuppositions if it is not a proof. So nothing that reaches the user's files rests on an unselected assumption.

**In words.** *In every situation (every interpretation of the vocabulary) where the named things exist, the selected premises hold as formalised, and the assumptions behind any selected derivation hold, the target holds as formalised.*

**For P = ∅.** T, as formalised, is a truth of classical higher-order logic with choice, given two things:
- presup(T): the non-emptiness of the sorts of the named constants T's statement uses;
- the user's signature, which may contain existence claims (see above).

### The gate

**Purposes.** Rules are evaluated for one of four purposes:
- `check` (`check_lean`): everything is reported, nothing is blocked;
- `freeze`;
- `gate-proved`: `finish` with status `proved`;
- `gate-other`: `finish` with `not_proved`, `insufficient`, `inconsistent` or `lean_errors`.

**Order.**
1. **G0** looks at text only. Any G0 finding stops the check there: Lean never elaborates text that fails G0.
2. **G1** runs one sandboxed build and the check file.
3. **G3, G5** and the readiness and stage rules run on S with fresh facts.
4. **G4** (the comparator) runs only when there is no finding at all, the status is `proved`, and the round has a freeze.

**Environment failures.** If the sandbox cannot start, memory is low, the job is cancelled or the working copy is unusable, the outcome is "environment". It is not a finding and does not count as an attempt.

**Fail-closed.** If the build had errors and no rule reported one, the engine adds a `build` finding itself.

Each rule below is stated as an invariant on S, followed by the attack it blocks.

**G0: text, on changed paths only.**
- **Whose lines count.** Only the lines Claude wrote are judged. A token on a line whose exact text also occurs in B's version of the file, up to the number of times it occurs there, counts as the user's own.
- **How tokens are found.** By telelean's own TypeScript lexer of Lean (`lexLean`, `core/src/markup/lexer.ts`), not by Lean's parser. Words in comments, strings, docstrings and telelean blocks never count.

The rules:
- `hash-command`: no `#X` except `#check` and `#print`. *Blocks:* `#eval` (code running during elaboration) and `#exit` (which hides the rest of a file from Lean).
- `metaprogramming`: none of `initialize`, `builtin_initialize`, `run_cmd`, `run_elab`, `run_meta`, `run_tac`, `macro`, `macro_rules`, `syntax`, `notation`, `infix`, `infixl`, `infixr`, `prefix`, `postfix`, `elab`, `elab_rules`, `declare_syntax_cat`, `declare_simp_like_tactic`. *Blocks:* code execution during elaboration, and new syntax that changes what existing text means.
- `native-code`: none of `native_decide`, `bv_decide`, `implemented_by`, `extern`, `csimp`; no `native` token anywhere; no `ofReduceBool`, `ofReduceNat`, `reduceBool`, `reduceNat`, however qualified. *Blocks:* proofs that trust compiled code instead of the kernel.
- `unsafe`: no `unsafe`, no `partial`. *Blocks:* code the kernel does not check as logic.
- `set-option`: no `set_option` at all. *Blocks:* raised limits; `debug.skipKernelTC`, a kernel bypass that fools `#print axioms`; switching `autoImplicit` back on.
- `sorry`: no `sorry`, no `admit`.
- `import`: only modules of the project's library. *Blocks:* code or axioms from outside the project.
- `project-file`: the lakefile, `lean-toolchain` and `lake-manifest.json` stay unchanged. *Blocks:* changed options, toolchain or dependencies.
- `deleted-file`, `outside-subject`, `bad-path`: no file is deleted; only `<library>/<S>.lean` and `<library>/<S>/**` change; a new file is a Lean module of the subject, with identifier path components. *Blocks:* edits to other subjects and to the trusted library root; stray files.

**G1: the build.**
- `build`: the build has no Lean error (the finding carries the whole message with `file:line:col`), and every changed or new file is imported by the library (otherwise Lean would never check it).
- `budget`: every Lean job stays within `telelean.run.leanJobSeconds` and the memory cap. A violation counts against Claude. Per declaration only Lean's default heartbeat limit applies, and it cannot be raised because `set_option` is forbidden.

**G3: the semantic rules.**
- `new-axiom` (every purpose).
  - *Invariant before the freeze:* every axiom not known in B is the `.holds` of a selected ASSUMPTION or adopted ghost, or a vocabulary item of its own (bound to no card, not an unmarked axiom). New presuppositions are allowed (and flagged); vocabulary of kind `other` passes here and is refused by `vocabulary-shape`.
  - *Invariant after the freeze:* no axiom lies outside F's list of every project axiom at the freeze. So there are no new sorts, predicates or presuppositions. New `noncomputable opaque` constants and functions, and new definitions, remain possible after the freeze; they are held only to the footprint rule, because `statement-changed` covers only frozen declarations.
  - *Blocks:* asserting the goal or a premise; an axiom directly below a card's block used as its "statement"; the `.holds` of a card that is not a selected assumption; any new axiom after the freeze. That last point includes turning the user's theorem T.holds into an axiom after the freeze (token `belief`).
- `existing-changed` (every purpose).
  - *Invariant:* every named declaration of B other than T.holds still exists with the same source text (docstring and attributes included). When B has facts, each also keeps its printed type and value. In addition, an adopted ghost's statement abbrev and `.holds` axiom keep the text they had at A (token `ghost`); G5 separately holds the ghost's block to A.
  - *Blocks:* weakening a statement under its own name; turning a vocabulary axiom into an easy definition (whose footprint looks clean); rewriting a gloss; an `open … in`, a section `variable` or a new declaration that changes the *printed* type or value of unchanged text.
  - *Misses:* an elaboration change that prints identically, typically a new instance added before the freeze (3.7 item 1). This text-and-printed-meaning comparison stands in for the formal immutability (closure hashes) that 02 and 03 designed and deferred to H.
- `not-proved` (gate-proved).
  - *Invariant:* T is proved in the sense of 3.4: its `.holds` exists, is not an axiom, has no sorry, states T exactly, takes no hypotheses, and was checked by Lean.
  - *Blocks:* a weakened theorem type (`cynder_not_good ∨ True`); a conditional proof; an asserted axiom.
- `status-mismatch` (gate-other).
  - *Invariant:* no non-axiom `T.holds` was added or changed in the run.
  - *Blocks:* a proof of the target that never went through the freeze and G4 reaching the user's files under the label "not proved".
- `statement-changed` (after the freeze: check in the prove stage, and both gates).
  - *Invariant:* every frozen declaration except T.holds keeps its printed kind, type and value, and is not removed. "Frozen" means every non-theorem declaration of the subject's files at the freeze, Claude's formalisations included.
  - It is compared as printed text. G4 compares terms, but only for T's closure and the permitted axioms (see the comparator section).
- `footprint` (check in the prove stage, and both gates; its "no facts" and "example" variants apply in every purpose).
  - *Invariant:* for every judged declaration d, Ax\*(d) ⊆ Perm if d is a proof, and Ax\*(d) ⊆ Perm ∪ {all presuppositions} otherwise.
  - *Judged declarations:*
    - T.holds;
    - every named declaration added or changed since B, of any kind: theorem, def, abbrev, instance, opaque, structure, class, inductive (axioms are judged by `new-axiom` instead);
    - every name only Lean reports inside such a declaration: structure fields, `where` and `let rec` declarations.
  - "A proof" means a declaration whose type is a `Prop`: a theorem, or a Prop-valued def, abbrev, instance or opaque, except the presupposition instance.
  - Ax\* is Ax, plus, for a structure or class, the axioms of the constants its source mentions. The reason: Lean keeps a field's default value in an auxiliary declaration that `#print axioms` does not follow.
  - *Fails closed:* a judged declaration that Lean reports nothing about (for example a `private` one) is a finding. So is an `example` added after the freeze: it has no name, so nothing can check it.
  - *Blocks:*
    - a proof that rests on an unselected assumption;
    - a lemma that rests on one, in a "not proved" round;
    - a proof carried by something that is not a theorem: `def h : PLift p := ⟨p.holds⟩`, an `Inhabited (PLift p)` instance, a field whose default is `p.holds`;
    - private lemmas;
    - examples.
- `sorry-axiom` (every purpose).
  - *Invariant:* no declaration of a changed file depends on `sorryAx`. There are two exceptions: a declaration with unchanged text that already used sorry in B; and, when B has no facts (Accept's re-check after drift), any declaration with unchanged text.
  - *Blocks:* sorry reached by other routes, for example Claude's proof using the user's unfinished lemma.
- `vocabulary-shape` (every purpose).
  - *Invariant:* every vocabulary item not known in B passes the shape rule and is not of kind `other`.
  - *Blocks:* the attacks of 3.3.

**G5: markup** (every purpose).
- *Invariant:*
  - Every block of B is still present, in the same file.
  - Its `natural_name` and `rationale` are byte-identical.
  - Its other fields are unchanged: `type`, `premises`, `stance`, `source`, `asserted`, `supersedes`, `refines`, `tags`, `origin`, `session`, `worded_by`. So are its markup version, its extension fields and its notes.
  - Its `id` is unchanged, or is the derived id telelean wrote back.
  - A `lean:` line is never changed or removed. It is added only to T or a selected card that had no binding in B, naming the new declaration directly below the block.
  - Every card bound in B stays bound to the same statement, and no unselected card becomes bound.
  - No new block appears except telelean's adopted ghosts, which must equal their text at A.
  - T's `premises:` may change only by telelean appending the ids of adopted ghosts.
- *Blocks:*
  - editing the user's words;
  - re-pointing the target's pin at a new, weaker abbrev and freezing that;
  - formalising cards outside the selection;
  - lifecycle changes (type changes, deletions) made by the agent;
  - Claude adding beliefs as new cards.

**Readiness and stage rules.**
- `not-formalised` (freeze and gate-proved).
  - *Invariant:* T, every selected ASSUMPTION and every adopted ghost is bound to an existing Prop abbrev or def.
  - In every purpose, a selected card that had no binding in B must not become bound to something else (token `malformed`). A card left without code is fine: "could not formalise" is an honest outcome.
  - *Blocks:* freezing a target that has no statement; an axiom used as a card's statement.
- `missing-holds` (freeze and gate-proved).
  - *Invariant:* every formalised selected ASSUMPTION and every ghost has a `.holds` whose printed type is exactly its statement (no TL114).
  - The message asks for `axiom n.holds : n`, but the axiom form is not checked. A user's own theorem `.holds` (a provable assumption) passes, and that premise then contributes through DF rather than Sel.
  - *Blocks:* a premise that cannot be used, or that asserts something other than its statement.
- `proof-before-freeze` (check in the formalise stage, and freeze, while the round has no freeze; its "example" variant applies in every purpose until the freeze).
  - *Invariant:*
    - nothing added or changed since R is a proof;
    - no other added declaration rests on more than the vocabulary layer (STD, the signature, presuppositions); one that does is a *carrier*;
    - no example has been added.
  - *Blocks:* choosing the statements to fit a proof already found in the round (the reason D-19 puts an explicit freeze between formalising and proving), including proofs hidden inside definitions.
  - It compares with R, so proofs in B and proofs from earlier rounds of the same run are not affected (see Rounds).
- `not-frozen` (gate-proved).
  - *Invariant:* the round has a successful freeze.
  - *Blocks:* a claim of "proved" with nothing frozen for G4 to compare against.

**Flagged definitions** are questions, never failures. They are:
- every new definition on a statement path, i.e. one that is:
  - in the statement closure of T, a selected premise or a ghost;
  - used by a card's statement;
  - flagged `definitional-choice`;
  - or referred to by a vocabulary item that is not itself a definition or lemma;
- every new presupposition.

A type-class-resolved instance leaves no identifier reference, so it is never on a statement path.

### The comparator's role (G4)

`lake comparator` (built into Lean 4.35) runs in the build mirror against the frozen export, with:
- `theorem_names` = [T.holds];
- `permitted_axioms` = Perm(F);
- `definition_names` = [].

**What it establishes** (per telelean's classification of the comparator's messages, and the M0 and runner tests):
- T.holds exists in the solution and is a theorem.
- Its type is identical to the frozen one, as a Lean term.
- The constants that type depends on (T's abbrev and its closure) are identical to the frozen ones, and so are the stated types of the permitted axioms. So neither the target nor a premise can be weakened or retyped under its own name after the freeze.
- T.holds uses no axiom outside Perm(F).
- Lean's kernel re-checks the solution's export.

**Tested rejections:**
- a goal abbrev weakened under the same name (definition mismatch);
- a theorem stated as `cynder_not_good ∨ True` (statement mismatch);
- an unselected assumption, and a smuggled axiom (illegal axiom).

The M0 spike also showed it rejecting a retyped assumption, a missing proof, a vocabulary symbol turned into a definition, and `sorry`.

**Why it is needed in addition to G3.**
- **G3 compares printed text**, with Lean's default printing plus `pp.fullNames`, which hides implicit and instance arguments. It does so in two ways:
  - `existing-changed` against B, i.e. the user's declarations;
  - `statement-changed` against F, i.e. every non-theorem declaration of the subject at the freeze, Claude's formalisations included.
- **G4 compares Lean terms:** T.holds's type, its closure and the permitted axioms' types, against the frozen export. It also replays the export in the kernel instead of trusting the build's environment.

Within its scope G4 is authoritative. G3 covers the rest of the subject's declarations.

**What it does not do.**
- It judges only T.holds; other declarations are G3's job.
- It runs only for status `proved`.
- It cannot see changes made before the freeze: the freeze already contains them.
- It enforces whatever Perm(F) telelean computed, so `permitted.ts` is part of the trusted base.
- A sandbox start-up failure is reported as "could not start" (environment), never as "rejected".

### Normalisation

Before every gate and after every revert, telelean (not Claude) normalises the files. For T, the selected premises and the ghosts whose statement declaration is new since B and well-formed, it:
- writes the pin (and a derived id that was missing);
- sets the statement's docstring to the escaped sentence (D-9).

It is idempotent and committed as `normalise`. Its purpose: blocks can be required to stay byte-identical (G5), Claude never edits blocks, and an accepted formalisation is always pinned.

### The retry loop, the revert and the outcomes

- **Attempts.** An attempt is one `finish` call in a round. The cap is `telelean.run.maxGateAttempts`: 3 by default, range 1–10.
- **Pass.** telelean commits exactly the judged files as `gate-pass`. Edits Claude makes after `finish` are discarded when its turn ends, and the proposal is built from that state.
- **Fail below the cap.** The board shows a notice ("Attempt 1 didn't pass: …"), and Claude receives the exact findings and retries.
- **Fail at the cap ("gave up").** telelean:
  1. reverts the working copy to the newest commit of kind `gate-pass`, `freeze` or `base`, i.e. a state that passed a gate, passed the freeze rules, or is B;
  2. normalises it;
  3. re-checks it with purpose `check` (not counted; it only supplies facts and does not block);
  4. builds the proposal from it.

  That proposal often holds the formalisation without a proof, which the user can still accept.
- **No finish.** A turn that ends without `finish` gets one reminder. If the next turn also ends without it, the round ends as "no-finish", with the same revert. Reaching the turn or time cap ends it as "cap-reached", likewise.
- **Environment failure in the gate.** It is retried once after 30 s; a second one ends the run as failed.
- **Invariant.** A proposal is either exactly the files a gate passed, or, after a revert, the newest commit that passed a gate or the freeze rules (or B), plus telelean's pins and docstrings.

**Verdicts.**
- `proved`.
- `not-proved`: a finish with `not_proved` or `lean_errors`.
- `insufficient` and `inconsistent`: Claude's claims. They are judged with the gate-other rules only, and shown as "not proved" and "Claude reports a conflict (unverified until M3)" respectively. Countermodels and consistency checks are M3.
- `gave-up`, `no-finish`, `cap-reached`.
- `cancelled`, `failed`.

### Ghost premises (suggested missing premises)

`propose_assumption(natural_name, lean_statement, why_needed, proof, lean_name?)` is allowed only after the freeze. The suggestion is checked in four steps.

1. **The single-term rule** (text only, before Lean runs). The statement and the proof may contain:
   - no G0 token;
   - no comment delimiter;
   - no `#` command;
   - no command keyword: `axiom`, `theorem`, `lemma`, `def`, `abbrev`, `example`, `instance`, `structure`, `class`, `inductive`, `coinductive`, `opaque`, `namespace`, `section`, `end`, `universe`, `variable`, `import`, `attribute`, `mutual`, `deriving`, `noncomputable`, `private`, `protected`, `open`, `export`, `omit`, `include`, `@[`.

   The statement also may have no `:=` or `|` outside brackets, and its brackets must balance. *Blocks:* text that closes the generated declaration and starts another one. The design reviewer showed that an injected `axiom evil : False` made an unpinned check pass.
2. **A clean check.** The working copy must pass a check first.
3. **A scratch check** on Lean's standard input. Nothing is ever written into the files:

   ```lean
   import Model
   namespace Spyro
   abbrev telelean_ghost_stmt : Prop := <statement, whitespace collapsed>
   theorem telelean_ghost_check : telelean_ghost_stmt → Spyro.cynder_not_good :=
     <proof>
   end Spyro
   #print axioms Spyro.telelean_ghost_check
   ```

   It passes iff Lean reports no error at all, Ax(`telelean_ghost_check`) ⊆ Perm(F), and `sorryAx` is not among those axioms. So the gap proof establishes **⊢ Ghost → T from the frozen selection**: the ghost is a *sufficient* missing premise relative to P. It need not be minimal, plausible or faithful.
4. **`aloneEntails`.** If none of the selected `.holds` axioms (nor the `.holds` axioms inside derivation footprints) occurs in that axiom list, the ghost gives the goal without the selection. The card then says "gives the goal on its own (it may simply restate it)".

**Adoption ("I hold this", possible only in review).**
1. telelean writes, right before T's block:
   - a new ASSUMPTION card (`worded_by: agent`, `origin: agent`, `session`, `asserted` today, the user's optional reason);
   - its docstring;
   - `abbrev <name> : Prop := <the checked text>`;
   - `axiom <name>.holds : <name>`.
2. It appends the new id to T's `premises:`.
3. It re-parses the result to make sure exactly that card appeared and no other binding changed.
4. It freezes again with the ghost selected. Perm grows by the ghost's `.holds` and its presuppositions. If the freeze is refused, the adoption is undone.
5. A new round starts, in the prove stage.

Claude must then prove T and pass the whole gate, G4 included; the gap proof is not reused. Nothing reaches the user's files before Accept, and the card stays marked as Claude's wording.

The ghost's Lean name is chosen twice: once when proposed, and again (with a stricter clash check) at adoption. The name shown before adoption can therefore differ from the one written (Appendix A.2).

### Accept and its re-check

- **Preconditions.** Every definition question must be answered "yes"; a "no" means Feedback. The lifecycle item "Make the target a Derivation" (offered only for a proved GOAL target; recommended and ticked by default) is optional.
- **No drift** (the user's model files are unchanged since the run started).
  - **No Lean check runs.** The judged state's diff, plus the ticked lifecycle items, is applied through M1's write path as **one history entry and one undo step**.
  - If no file changes, the outcome is only recorded: no history entry, no undo step.
- **Drift.** Claude's changes are rebased onto the user's current files, with patches that use 3 lines of context and allow no fuzz. An edit of the user's within 3 lines of one of Claude's counts as an overlap, and Accept is refused. On success telelean:
  1. normalises;
  2. re-freezes, if the verdict is `proved`;
  3. re-runs the gate with B := the user's files at Accept, so the user's own edits are never judged as Claude's.

  There are no B facts at this point, so the "meaning" part of `existing-changed` does not run, and `sorry-axiom` exempts every unchanged-text declaration. Any failure refuses Accept and keeps the proposal open; on success exactly the re-checked files are applied.
- **Lifecycle items.** The only one is GOAL → DERIVATION of a target that is still proved. It changes only the `type:` line.

### Questions and decisions

- **`ask_user`.** Claude can ask 1–3 questions at a time. Each question has:
  - a phenomenon tag: enthymeme, genericity, modality, negation, presupposition, scalar, vagueness, evaluative-standard, indexical, word-sense, tense, granularity, closed-world or other;
  - 2–4 options, each with its plain consequence;
  - the answer types "own words", "leave it open" and "decide for me".

  Claude's own guess is withheld until the user answers. Each answer has a scope: this run, these cards, or the whole subject. Claude's clock pauses while a question waits.
- **Where answers go.** They are recorded in `.telelean/subjects/<S>/decisions.json`. Answers with scope "subject", or "these cards" when a card in the selection is affected, are sent to later runs as "earlier answers in force".
- **They have no formal effect.** Nothing checks that a formalisation follows an answer. The same holds for `assumed_without_asking`, Claude's list of interpretive choices it made without asking (shown with "Ask me instead").
- **What gates Accept.** Only the definition questions: the host refuses Accept, and the button stays disabled, until each has "yes".
  - The review's order (each new or changed statement beside its sentence, in pretty and fully explicit form, before the proof result) is a UI default, not a precondition: the result can be revealed at once, and Accept is available at every step.
  - The lifecycle tick is optional.
  - New vocabulary is approved automatically and can be revoked through Feedback.

## 3.7 What is not guaranteed

1. **Faithfulness.** The gate guarantees "proved from the selected premises *as formalised*" (A2).
   - **The risk.** Claude writes the Lean for the target when it has none, for every selected assumption that has none, and for any new vocabulary. These formalisations are frozen and become the meaning of the user's words. A too-strong premise (for example `∀ c g, ¬ GoodAddition c g` for "PG games cannot have characters with dark pasts") or a too-weak target makes the proof valid and worthless, and the gate cannot see it.
   - **The safeguards:**
     - Claude is told to ask before formalising when a reading changes the result;
     - the review shows meaning before proof status (by default);
     - definitions on statement paths need a "yes";
     - statements the user formalised before the run cannot change in text or printed meaning (`existing-changed`), and their blocks and bindings cannot change (`markup`);
     - after the freeze, the target's closure cannot change at all (G4).
   - **A gap in those safeguards.** An elaboration change that prints identically can change what the user's *unchanged* statement means. The typical case is an instance Claude adds before the freeze:
     - `#print`/`#check` output stays the same, because implicit and instance arguments are hidden;
     - a type-class-resolved instance leaves no identifier reference, so it is not on a statement path and raises no definition question;
     - G4's freeze already contains it.

     Verified with Lean 4.35: `abbrev A.s : Prop := (1 : Nat) + 1 = 2`, then `instance (priority := high) myAdd : Add Nat := ⟨fun _ _ => 0⟩`, then `abbrev B.s` with the identical text. Both print `1 + 1 = 2` with type `Prop`, yet `example : A.s := rfl` and `example : ¬ B.s := by decide` both compile.
   - **Still to come.** Back-translation, alignment and glosses arrive in M3.
2. **Consistency and vacuity.**
   - Nothing checks that the selected premises are consistent. If they are not, every target is "proved" (from a contradiction), and the footprint is then an inconsistent subset of the premises. Proved results are labelled "consistency unchecked".
   - Non-vacuity is not checked either.
   - "Insufficient" and "inconsistent" are unverified claims.
   - The model finder and Ramsey-sentence certificates (D-1, D-6) are M3.
   - One consequence of the design limits the damage: beliefs are global axioms, but footprints confine the effect of an inconsistency elsewhere in the model to the proofs that actually use it.
3. **What Lean decides, and what TypeScript decides.**
   - **Lean decides:**
     - whether each file elaborates and the kernel accepts it;
     - every printed type, value, kind and axiom list;
     - the references between declarations;
     - G4's term-level comparison against the freeze, its axiom check for T.holds, and its kernel replay.
   - **TypeScript decides, and is trusted:**
     - which declaration is which card's statement (binding);
     - the vocabulary classification (it parses printed types into arrow parts);
     - the partition of axiom lists into signature, beliefs and presuppositions;
     - the permitted set itself;
     - "states exactly n" (text equality);
     - every text comparison (`existing-changed`, `statement-changed`, examples, the "user's own proof" test);
     - the G0 lexer: telelean's own TypeScript lexer of Lean, not Lean's parser, plus its line-multiset rule, which is a heuristic for "Claude's lines", not a proof of absence;
     - the markup comparison;
     - what counts as a proof;
     - the single-term rule;
     - normalisation, adoption and Accept's merge.

     A bug in `permitted.ts` or `rules.ts` could let a wrong verdict pass. The safeguards are a positive and a negative test for many rules, tests on recorded real facts, and end-to-end cheat scripts.
4. **Examples.** An `example` has no name, so Lean's facts say nothing about it. Examples are therefore refused, not checked: every one Claude adds, in every purpose. The user's own examples are neither judged nor touched.
5. **Lake's build traces, and `telelean.run.reuseLeanBuild`.**
   - **Lake can trust a wrong compiled file.** Lean facts come from Lake builds. Lake 4.35 trusts a module whose recorded input hash matches its source, and then does not re-read the compiled file. The last verifier (m2close-verify-2) found an ordinary way to break this:
     1. you save a file while a `lake build` outside telelean compiles it;
     2. you undo the save;
     3. Lake recorded the first text as the input but compiled the second, so with the first text back it trusts the wrong compiled file.

     This happened in 29 of 50 pure-Lake trials. telelean's board refresh then reports ok, with every module fresh, while its facts describe the other version. The board's statuses can thus be wrong; this is an M1 matter. Whether telelean's own refresh racing with a save is exposed in the same way was not tested. Two Lake builds writing the same module at once (Lake takes no build lock) are a second route.
   - **With the setting off (the default),** every run builds from scratch in its mirror, so a run's facts and comparator build match its files.
   - **With it on,** a run starts from what `.lake/build` held right after the board's last successful refresh, untouched since. Such a tree can carry the bad module, and the run's checks then read facts about a version that is not in its working copy. The setting's description, the user guide, the plan (§4.2), `seed.ts` and decisions-log §31 say that Lake still rebuilds whatever does not match the run's files. That is untrue in this case (Appendix A.2).
6. **The prototype sandbox and the deferred hardening.**
   - **What exists:**
     - every Lean process runs under `systemd-run` (memory cap, no swap) and `bwrap` (no network, home hidden, sources read-only);
     - Claude has no shell, and its file tools are confined to the working copy by a path-guard hook;
     - nothing reaches the user's files before Accept.
   - **Not done** (milestone H):
     - symlink-proof confinement (`realpath`, `O_NOFOLLOW`);
     - an audited mount allowlist with socket isolation;
     - the full data-type rule;
     - a G0 allowlist checked by Lean's parser. Today G0 is a lexical denylist: instances, `attribute`, `open` and instance priorities are not restricted;
     - `leanchecker` replay (G2);
     - formal immutability of untouched cards through closure hashes (the planned facts extractor does not exist);
     - the exploit-fixture suite.
   - **Two caveats.** `#print axioms` trusts the environment; the kernel-bypass option is forbidden by G0, and the comparator replays T.holds's export in the kernel. The system is not hardened against a deliberately adversarial model (personal prototype). The VS Code Lean extension, which is not sandboxed, elaborates accepted code whenever you open those files.
7. **Other limitations found in the code.**
   - **The exemption for T.holds is broader than D-11 needs.** `existing-changed` and the before-freeze branch of `new-axiom` both exempt T.holds by name, and `status-mismatch` looks only for a non-axiom T.holds. So in a round that finishes with a status other than `proved`, Claude can, with no finding:
     - delete the user's existing proof of T, at any point;
     - turn that proof into `axiom T.holds : T`, before freezing or in a round without a freeze.

     The same conversion after the freeze is refused by `new-axiom` (token `belief`). After Accept, the board would show the goal "assumed" (TL116); the raw diff shows the change. This was checked with the real core rules on hand-made facts in scratch probes, not with a repository test.
   - **The freeze discipline holds per round.** Feedback keeps the working copy and moves R to its head. Proofs from earlier rounds therefore survive, `proof-before-freeze` sees only changes since R, and Claude's own earlier formalisations are protected by nothing in the next round. From round 2 on, Claude may revise its earlier statements while knowing its earlier proofs; the new freeze then fixes whatever it chose.
   - **Text instead of terms.**
     - A `.holds` type that is only definitionally equal to n counts as a mismatch.
     - The meaning check compares Lean's default printing, which hides implicit and instance arguments; see item 1.
     - Instances found implicitly are not identifier references, so they do not enter a statement's closure and are not flagged as definitions.
     - After the freeze, G4's term comparison covers the target's closure.
   - **Proved derivations stand for their assumptions:** selecting a proved derivation permits the assumptions it rests on (3.6).
   - **Module granularity:** one Lean error makes every card of that module, and of the modules that import it, "not checked".
   - **No logical scoping:** suppositions are axioms, and decisions are advice to Claude, not constraints.
   - **Not yet implemented** (M3 or later):
     - more than one target per run;
     - partial Accept;
     - lifecycle items other than G→D;
     - refine, supersede, merge, suspend;
     - Formalise-first;
     - "Ask Claude…";
     - anti-goals.
   - **Resource budgets per declaration are not measured.** Only Lean's default heartbeat limit, the per-job time limit and the memory cap apply.

## 3.8 Worked example: the Spyro sample

**The starting point.** The sample (`mental_model/`) has this vocabulary:

```lean
axiom Character : Type
axiom Game : Type
axiom Character.exists : Nonempty Character
instance : Nonempty Character := Character.exists
axiom Game.exists : Nonempty Game
instance : Nonempty Game := Game.exists
axiom HasDarkPast : Character → Prop
axiom IsPG : Game → Prop
axiom GoodAddition : Character → Game → Prop
noncomputable opaque cynder : Character
noncomputable opaque newSpyro : Game
```

In `Main.lean`:
- "PG games cannot have characters with dark pasts" is an ASSUMPTION without code, with stance `rule`.
- `cynder_dark_past := HasDarkPast cynder` and `new_spyro_pg := IsPG newSpyro` are assumed, with `.holds` axioms.
- The goal is `cynder_not_good := ¬ GoodAddition cynder newSpyro`, unproved.

On the board:
- pg-no-dark-past is `informal`, with "no source yet";
- the two other assumptions are `assumed`;
- the goal is formalised and unproved;
- three declared arrows point into the goal, and there are no verified arrows.

**The run.** The user selects the three assumptions and the goal and presses These suffice: P = {cynder-dark-past, new-spyro-pg, pg-no-dark-past}, T = cynder-not-good. Claude asks one question (tag: modality): "Does 'cannot have' state a rule about what PG games should not include (normative), or that a PG game is unable to contain such a character (literal)?" A rule is deontic modality; the literal reading is about possibility.

**Reading A, normative** (the scripted run, `normative.json`).

1. Claude writes, directly below the block:

   ```lean
   /-- PG games cannot have characters with dark pasts -/
   abbrev pg_no_dark_past : Prop := ∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ GoodAddition c g
   axiom pg_no_dark_past.holds : pg_no_dark_past
   ```

   The axiom is allowed because pg-no-dark-past is a selected ASSUMPTION.
2. `check_lean` passes, and `freeze_statements` succeeds. Perm(F) has 13 names:
   - `propext`, `Classical.choice`, `Quot.sound`;
   - the signature: `Character`, `Game`, `HasDarkPast`, `IsPG`, `GoodAddition`;
   - the presuppositions `Character.exists` and `Game.exists`, contributed by the target's statement and the two formalised premises (`pg_no_dark_past` presupposes nothing);
   - the three selected `.holds`.
3. Claude proves:

   ```lean
   theorem cynder_not_good.holds : cynder_not_good :=
     pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds
   ```

   Re-run for this report:

   ```
   'Spyro.cynder_not_good.holds' depends on axioms: [Classical.choice, Spyro.Character, Spyro.Game,
    Spyro.GoodAddition, Spyro.HasDarkPast, Spyro.IsPG, Spyro.Character.exists, Spyro.Game.exists,
    Spyro.cynder_dark_past.holds, Spyro.new_spyro_pg.holds, Spyro.pg_no_dark_past.holds]
   ```

   These 11 names lie inside the 13 permitted ones.
4. Normalisation adds `lean: Spyro.pg_no_dark_past` to the block.
5. The gate:
   - G0 is clean, and G1 builds.
   - G3: the only new axiom is a selected `.holds`; no pre-existing declaration changed; T is proved with its exact type; its footprint lies inside Perm.
   - G5: only telelean's pin was added.
   - G4: the comparator accepts.
6. The report card:
   - verdict proved;
   - footprint: the three cards plus `presup:Spyro.Character.exists` and `presup:Spyro.Game.exists` ("assumes characters exist", "assumes games exist");
   - no unused premise;
   - "consistency unchecked";
   - lifecycle item "Make it a Derivation", recommended and ticked by default.
7. Accept writes the formalisation and the proof. It also writes `type: DERIVATION`, but only if "Make it a Derivation" stays ticked (the end-to-end test leaves it ticked).

**What was certified.** ⊢ for all sorts Character and Game, all predicates HasDarkPast, IsPG and GoodAddition, and Cynder and the new game (with characters and games existing): (∀ g c, IsPG g → HasDarkPast c → ¬ GoodAddition c g) → HasDarkPast cynder → IsPG newSpyro → ¬ GoodAddition cynder newSpyro.

The proof is a single application. **The content of the result lies entirely in the formalisation of the rule, and that formalisation is Claude's reading of the user's sentence.** This is why the review shows meaning before proof status.

**Reading B, literal** (`literal.json`).

1. Claude adds a predicate to `Vocabulary.lean` and formalises the rule literally:

   ```lean
   /-- is in -/
   axiom InGame : Character → Game → Prop
   abbrev pg_no_dark_past : Prop := ∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ InGame c g
   axiom pg_no_dark_past.holds : pg_no_dark_past
   ```

   `InGame` is a predicate over sorts, i.e. pure signature; the review lists it as new vocabulary, which can be revoked. Perm(F) now has 14 names, since `InGame` joins the signature.
2. **The goal does not follow.** Make both sorts a one-element type, make IsPG, HasDarkPast and GoodAddition true everywhere, and make InGame false. Then every premise holds and the goal fails. For this report the refutation of the generalised statement was checked in a scratch file (telelean M2 cannot produce it; M3's model finder is meant to):

   ```lean
   example : ¬ (∀ (Character Game : Type) (cynder : Character) (newSpyro : Game)
       (HasDarkPast : Character → Prop) (IsPG : Game → Prop) (GoodAddition InGame : Character → Game → Prop),
       (∀ g c, IsPG g → HasDarkPast c → ¬ InGame c g) → HasDarkPast cynder → IsPG newSpyro →
       ¬ GoodAddition cynder newSpyro) := by
     intro h
     exact h Unit Unit () () (fun _ => True) (fun _ => True) (fun _ _ => True) (fun _ _ => False)
       (fun _ _ _ _ h => h) trivial trivial trivial
   ```
3. Claude proposes a missing premise:
   - the sentence "A character who cannot be in a game would not be a good addition to it";
   - the statement `∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g`;
   - the proof `fun h => h cynder newSpyro (pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds)`.

   The scratch check passes. Re-run: Ax(`telelean_ghost_check`) is the 11 names above plus `Spyro.InGame`, 12 in all, inside the 14 permitted. The suggestion does not give the goal on its own, because it uses the three selected `.holds`.
4. Claude finishes `not_proved`, and the gate-other rules pass. The verdict is "not proved", with a "Claude suggests" card.
5. "I hold this" writes the following (the exact output of `planGhostAdoption`, generated for this report):

   ```lean
   /-
   @@ telelean v1
   id: a-character-who-cannot-be-in
   type: ASSUMPTION
   natural_name: A character who cannot be in a game would not be a good addition to it
   asserted: 2026-11-02
   lean: Spyro.not_in_game_not_good
   origin: agent
   session: <run id>
   worded_by: agent
   -/
   /-- A character who cannot be in a game would not be a good addition to it -/
   abbrev not_in_game_not_good : Prop := ∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g
   axiom not_in_game_not_good.holds : not_in_game_not_good
   ```

   The target's `premises:` becomes `cynder-dark-past, new-spyro-pg, pg-no-dark-past, a-character-who-cannot-be-in`.
6. telelean freezes again (15 permitted names). In round 2 Claude proves:

   ```lean
   theorem cynder_not_good.holds : cynder_not_good :=
     not_in_game_not_good.holds cynder newSpyro (pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds)
   ```

   Re-run: the footprint is the 12 names plus `Spyro.not_in_game_not_good.holds`. The verdict is proved, and the adopted card stays marked as Claude's wording.

**What the gate catches on this example.** These are the cheat scripts, run end to end with real Lean (`walkthrough.e2e.test.ts`):

| What Claude does | Outcome |
|---|---|
| `axiom shortcut : cynder_not_good` | `new-axiom` |
| `:= sorry` | G0 `sorry`; Lean is not run |
| target abbrev weakened to `… ∨ True` | `existing-changed` (G4 would report a definition mismatch) |
| theorem stated as `cynder_not_good ∨ True` | `not-proved` (G4: statement mismatch) |
| new-spyro-pg not selected, honest proof | `footprint`, naming `new_spyro_pg.holds` (G4: illegal axiom) |
| target's `lean:` re-pointed at `abbrev … := True` before the freeze | `markup`; the freeze is refused |
| `axiom GoodAddition` turned into `def GoodAddition c _ := ¬ HasDarkPast c` | `existing-changed` (its footprint lies inside Perm) |
| a belief tucked into `def InGame c g := GoodAddition c g` under the literal statement | **passes the gate** as a definition question; Accept is refused until the user says "yes" |
| `#eval 1` next to the honest proof | G0 `hash-command` |
| a proof written before the freeze | a check violation; the freeze is refused |
| a PLift def, an Inhabited instance, or a structure default resting on unselected new-spyro-pg | `proof-before-freeze` (carrier) before the freeze; `footprint` after it |
| `example : PLift new_spyro_pg := ⟨new_spyro_pg.holds⟩` | `proof-before-freeze`, then `footprint` (token `example`) |
| `axiom side_goal : Empty` below a selected GOAL card without code | `new-axiom` (statement), `not-formalised` |
| the user's sentence edited | `markup` |

**How the table is tested.** The end-to-end test checks each cheat's *first failure by category* (for example `- statement_unchanged:`), not by exact finding code. The exact codes in the table come from the fixtures' `expect` fields. They are pinned in core tests (`rules.test.ts`, `premiseCheats.test.ts`, `carriers.test.ts`).

## 3.9 Where each rule lives and how to change it

Paths are relative to `packages/`. "Code" means a change in that file plus its tests. Many rules have one positive and one negative test in `core/test/gate/rules.test.ts`, and the runner tests and cheat scripts pin the outcomes.

| Rule or mechanism | Where it lives | How to change it |
|---|---|---|
| Statement form (Prop abbrev/def), `.holds` naming | `core/src/project/build.ts` `isPropStatement`, `holdsKind`; `core/src/facts.ts` `HOLDS_SUFFIX`, `holdsName` | code |
| Binding (pin before adjacency) | `core/src/markup/parser.ts` `bindBlock`, `findFollowingDecl` | code |
| Proof-status table, "states exactly n", conditional | `build.ts` (status section of `buildProject`); `core/src/project/text.ts` `splitTopLevelArrows`, `normalizeWhitespace` | code |
| Footprint partition, TL103 | `build.ts` (footprint loop, `harmless`) | code |
| Standard axioms | `core/src/facts.ts` `STANDARD_AXIOM_NAMES`, and `runner/src/lean/comparator.ts` `STANDARD_AXIOMS` | code (keep both lists equal) |
| Flags (self-evident, existence commitment, rests on claimed, TL102) | `build.ts` (flags section) | code |
| Fresh, stale and unchecked facts | `core/src/project/factsIndex.ts` `FactsIndex`, `kindsAgree` | code |
| Arrows and mismatch flags | `core/src/project/edges.ts` `computeEdges`, `directUses` | code |
| Vocabulary shape rule, presupposition recognition | `core/src/project/vocabulary.ts` `classify`, `buildVocabulary`; `build.ts` `isPresupposition` | code |
| TL110 (autoImplicit) | `core/src/project/lakefile.ts` `autoImplicitDiagnostic` | code |
| Lean probes and printing options | `runner/src/semantic/checkFile.ts` `generateCheckFile`, `parseCheckOutput` | code |
| D-11 drop-zone previews | `core/src/kindChange.ts` `kindChangeImpact`, `proofDependents` | code |
| D-11 plans (rewrite, mark broken, conditional proofs) | `core/src/edit/planKind.ts` `planKind`, `holdsArguments`; `core/src/edit/dependents.ts` `usersOf`, `axiomListUsers`; the edit operations in `core/src/markup/leanOps.ts` | code |
| Run preflight (target kinds, toolchain) | `runner/src/run/preflight.ts` `preflight`; `core/src/paths.ts` `PINNED_TOOLCHAIN_NAME` | code |
| G0 token denylist | `core/src/gate/g0.ts` `WORD_CODES`, `NATIVE_CONSTANTS`, `HASH_ALLOWED`, `scanForbiddenText` | code |
| G0 file rules | `g0.ts` `checkChangeSet`, `PROJECT_FILES`, `inSubjectScope`, `isSubjectModulePath` | code |
| Permitted set | `core/src/gate/permitted.ts` `permittedAxioms`, `signatureAxioms`, `SIGNATURE_KINDS`, `contribution`, `footprintSinceBase` | code |
| The freeze record | `permitted.ts` `snapshotOf` | code |
| G1, G3, G5, readiness and stage rules | `core/src/gate/rules.ts` `evaluate` (one section per rule code), `markupFindings`, `COMPARED_FIELDS`, `flagged`, `footprintOf`, `SOURCE_REF_KINDS`, `G3_ORDER`, `LATE_ORDER` | code |
| What counts as a proof; the presupposition instance | `core/src/gate/decls.ts` `isProof`, `isPresuppositionInstance` | code |
| Gate order, fail-closed build, when G4 runs | `runner/src/gate/engine.ts` `runCheck`, `gateNow`; `runner/src/gate/findings.ts` `buildErrorFindings`, `classifyFacts` | code |
| Freeze challenge (removal closure, the `sorry` module) | `engine.ts` `freezeNow`, `removalClosure`; `comparator.ts` `freezeChallenge`, `generateChallengeModule` | code |
| Comparator configuration and verdicts | `engine.ts` `compare`; `comparator.ts` `runComparator`, `classifyComparatorRun`; `findings.ts` `comparatorFindings` | code |
| Normalisation | `core/src/gate/normalise.ts` `normalisation`; `engine.ts` `normalise` | code |
| Ghost single-term rule | `g0.ts` `termProblems`, `GHOST_COMMAND_WORDS` | code |
| Ghost check | `engine.ts` `checkGhostNow`; `runner/src/gate/scratch.ts` `ghostScratchSource`, `readGhostScratch` | code |
| Ghost names and adoption | `runner/src/run/manager.ts` `ghostName`, `adoptGhostNow`; `core/src/gate/adoption.ts` `adoptionPlan` | code |
| One freeze per round; the check budget | `manager.ts` `toolFreeze`, `assertCheckBudget` | code; setting `telelean.run.maxChecks` (25) |
| Gate attempts per round | `manager.ts` `toolFinish` | setting `telelean.run.maxGateAttempts` (3; range 1–10) |
| Other caps | `manager.ts` | settings `telelean.run.maxTurns` (80), `telelean.run.maxAgentMinutes` (20), `telelean.run.leanJobSeconds` (120), `telelean.memory.capGiB` (4), `telelean.memory.minAvailableGiB` (2) |
| Revert targets | `runner/src/shadow/types.ts` `PASSING_COMMIT_KINDS`; `manager.ts` `settleReverted` | code |
| Feedback (keeps the working copy, new round start) | `manager.ts` `feedbackNow` | code |
| Retry after an environment failure | `manager.ts` `ENVIRONMENT_RETRY_MS` (30 s) | code |
| Finish status to verdict; the status Accept re-checks with | `manager.ts` `verdictOfStatus`, `statusForRegate` | code |
| Accept: definition approvals, re-check after drift | `manager.ts` `acceptNow`; `runner/src/proposal/service.ts` `planAccept`, which calls `runner/src/proposal/files.ts` `mergeFile` and `MERGE_CONTEXT_LINES` (3) | code |
| Lifecycle items | `service.ts` `build`; `normalise.ts` `lifecycle` | code |
| Report card (footprint, unused premises, self-evident) | `service.ts` `reportCard` | code |
| What Claude is told | `runner/src/run/systemPrompt.ts`; `runner/src/run/prompts.ts` `renderContextBundle` | code. The system prompt is pinned by `runner/test/run/prompts.test.ts` against `docs/m2-plan.md` §5.1 and a fixture, so change all three. Setting `telelean.run.contextScope` (subject or neighbourhood) |
| Model and effort | the Claude backend | settings `telelean.model`, `telelean.effort` |
| Reuse of the user's Lean build | `runner/src/shadow/seed.ts` | setting `telelean.run.reuseLeanBuild` (off) |
| Decisions in force for later runs | `core/src/proposal/sidecars.ts` `inForce` | code |

---

# Appendix A: Known limitations and open items

## A.1 By design or by scope

**Board (M1).**
- **Lean:**
  - Lean 4 core only: no Mathlib or other Lake dependencies (M4);
  - only toolchain v4.35.0 is checked; others give syntactic mode;
  - no Lean-editor features such as hover, completion or code lenses (M4).
- **Checks:**
  - they run only while the board is open;
  - the in-place build can race the Lean extension on `.lake` (see A.2 item 1 for the trace caveat);
  - one Lean error leaves its whole module, and the modules importing it, unchecked.
- **Undo and settings:**
  - Undo is lost on a window reload;
  - History needs git;
  - settings need a window reload.
- **Board gestures:**
  - you cannot draw arrows by dragging;
  - definitions are flagged on the board but endorsed only in a proposal's review;
  - one subject per board;
  - Ctrl/Cmd+click in code does nothing yet.
- **Platform:** Linux only in practice, because of the sandbox requirements.

**Runs (M2).**
- **One run at a time:**
  - one run per model folder, enforced within one VS Code window (there is no lock across windows);
  - the target must be a Goal or Derivation of the board's subject.
- **Accept:**
  - no partial Accept (D-21 is later);
  - a definition is endorsed only by its Yes before Accept.
- **Not before M3:**
  - no consistency check, non-vacuity check or countermodels ("consistency unchecked"; "insufficient" and "inconsistent" are unverified claims);
  - a minimal review: no alignment check, deterministic gloss or back-translation;
  - recorded answers cannot be revoked, and nothing checks that formalisations follow them.
- **Hardening (H):**
  - the gate is a prototype profile, not hardened against a determined adversary;
  - the path guard is not symlink-proof, although the working copy contains only regular files and Claude has no shell.
- **Login and cost:** a claude.ai subscription login is required; there is no dollar cap and no limit on rounds.
- **Gestures and consent:**
  - no declare-only gesture: declaring premises without starting a run means editing `premises:` by hand;
  - no command to withdraw a consent.
- **What survives a run's end:**
  - the premises declaration made at the start stays after Discard, Cancel, or a failed start (at the base check or at Claude Code's start); Undo removes it;
  - the `attempts.jsonl` record stays too.
- **graph.json** never lists attempts.

## A.2 Known issues still open

**From the last verifier (m2close-verify-2):**
1. **Lake can trust a compiled module built from another version of its file** (3.7 item 5).
   - The scenario: save during an outside `lake build`, then undo.
   - The board's own facts can then describe a version that is not in the file. That is an M1 exposure.
   - With `telelean.run.reuseLeanBuild` on, a run seeds that tree and its checks read the wrong version.
   - The setting's description, the user guide (start step and settings table), m2-plan §4.2, decisions-log §31 and `seed.ts` promise that "Lake still rebuilds whatever in the copy does not match the run's files", which is untrue in this case.
   - The verifier suggested removing the setting (the default already never seeds, and Spyro builds from scratch in about a second), or rewording all those texts. Neither has been done.
2. **The suggested premise's Lean-name chip can differ from the name adoption writes.**
   - `ghostName` (at propose time) checks only that `<S>.<name>` and its `.holds` are not declared. Core's `adoptionPlan` also rejects a name used as an identifier anywhere in the files.
   - Example: Claude's name `Spyro` is shown, but `Spyro.pg_rules_out_cynder` is written. The adoption turn and the stored name are corrected afterwards.
   - Suggested fix: let `ghostName` call core's check.
3. **Cosmetic, in the tests:**
   - the title of `runner/test/shadow/shadow.test.ts:108` still uses the old overstated wording;
   - the new race end-to-end test cannot run alone under `TELELEAN_SMOKE_GREP`, because it relies on the suite's first test to open the board.

**Gate gaps found while preparing this report** (scratch probes and a Lean 4.35 experiment; no repository test pins them):

4. **The T.holds exemption** lets a round that does not finish `proved` delete the user's proof of T, or turn it into an axiom before the freeze, with no finding (3.7 item 7).
5. **The pre-freeze instance blind spot.** An instance that changes how unchanged text elaborates, while printing identically, is caught by no rule. This includes the user's own statements (3.7 item 1).
6. **The freeze discipline holds per round only.** After Feedback, Claude may revise its earlier statements knowing its earlier proofs (3.7 item 7).

**The real-Claude path is untested.**

7. Since M0, `ClaudeCliBackend` has run only against a node test double and recorded 2.1.314 streams. Options such as the tool server's `endTurnOnFinish` have never met a real CLI.

## A.3 Not done yet, and the open decision

- **The real-Claude walkthrough** (m2-plan §12) has not been run.
  - What it does: it drives the Spyro sample with a scripted user, under two readings of "cannot":
    - normative: expected proved, then Goal → Derivation accepted;
    - literal: expected not proved, a suggestion adopted, round 2 proved, accepted.
  - The script exists, and its dry run passes both readings with the FakeBackend and real Lean.
  - Going live needs both opt-ins, about 12 GB of free memory, and an announcement of the quota use. The plan estimates roughly 0.5–1.5 M cache-read tokens and 5–15 minutes per reading.
  - Until it passes, M2 is not formally "good enough to start using".
- **The modifications audit,** the main session's planned end-of-turn audit of everything modified this turn (files, installs, effectful commands, network effects), has not been done. Verifiers recorded their own effects outside the repository, and a separate scan answered which git repositories were read (`verbatim_prompt_log/bundle_9/evidence/scan_git.py`).
- **Two runner test files have not been run:** `packages/runner/test/run/walkthroughScript.test.ts` and `smokeScript.test.ts`. They spawn the scripts with `--live` and the `*_LIVE` variables (fake binary, tripwire armed) to show that live mode refuses. The verifiers' no-live rule excluded them. Command: `cd packages/runner && TELELEAN_NO_REAL_CLAUDE=1 npx vitest run test/run/walkthroughScript.test.ts test/run/smokeScript.test.ts`.
- **Missing reports:** both plans ask for `docs/m1-report.md` and `docs/m2-report.md`; neither exists.
- **Open decision: where "Raw Lean diff…" should open** (decisions log, top).
  - **Now:** beside the board. When the board is the only editor group, VS Code splits the window and the board shrinks to half width while the diff is open (still usable).
  - **Alternative:** a tab in the board's own group. The board keeps full width but is hidden until you switch back.
  - History **Preview** uses the same placement code, so the choice would naturally apply to it too. Nothing changes until you choose.
- **Later milestones.**
  - **M3 (faithfulness):**
    - the full review: alignment, deterministic gloss, back-translation;
    - a model finder for consistency, non-vacuity and countermodels;
    - the DECISIONs UI, including revoking answers;
    - refine, supersede, merge and suspend;
    - Formalise-first;
    - the full "Ask Claude…" composer;
    - anti-goals, pause-when-risky and sign-offs.
  - **M4 (integration):**
    - Lean-editor features;
    - a CLI (`telelean export|check|init|fmt|schema`);
    - Shiki and accessibility polish;
    - the full test-electron suite;
    - an optional VSIX;
    - Mathlib opt-in.
  - **H (optional hardening):**
    - a symlink-proof file-tool guard;
    - an audited sandbox profile with socket isolation;
    - the full vocabulary data-type rule;
    - `leanchecker`;
    - formal immutability via closure hashes;
    - a G0 allowlist checked by Lean's parser, with instance restrictions;
    - an exploit-fixture suite.
  - **Also later:** partial, node-level Accept (D-21).

# Appendix B: Where the docs and the code disagree

**User guide and setting descriptions.**
- **Guide 10.9: Claude's wording after an edit.** The guide says an adopted card "stays marked as Claude's wording (italics) until you edit its sentence". In fact editing changes only `natural_name:`; `worded_by: agent` stays, and the card keeps "(Claude's wording)". This was confirmed with core's edit planner in a scratch experiment: `/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/report-features/worded-by.mjs`. Only a hand edit of `worded_by:` clears the mark.
- **reuseLeanBuild wording** (setting description, guide 10.2 and 10.13): see A.2 item 1.
- **"Add to its premises ▶" "instead":** the tray shows both buttons.
- **Review statement step:** the guide says "beside"; the code puts the sentence above its Lean.
- **Gate step names:** the guide says "G0–G5"; G2 does not exist.
- **Subscription check:** the guide says "Claude Code itself checks". telelean asks Claude Code for the account and refuses anything else; the substance is the same.
- **`telelean.refresh.enabled`:** its description says "syntactic mode"; the board says "Lean: off".
- **The "broken" chip** (guide §7, and "they stop compiling and show it" in §4) never appears: core never sets the flag.
- **Missing from the guide:**
  - `lake-manifest.json` and `layout.json` in Initialize's file list, and the manifest requirement for existing Lake projects;
  - the card's Attempts list;
  - the resizable run panel and the folded tray;
  - the theme colours.
- **Trash for deleted files:** the guide's claim that they go to the OS trash was not verified.

**Plans and decisions log.**
- **m2-plan §8.2:** says the consent choice is remembered; only a yes is.
- **m2-plan:** says tests use `llm/fixtures/recorded-cli-2.1.314`; no test reads it.
- **m1/m2 reports:** both plans ask for them (A.3); they do not exist.
- **m0-report:** an outdated snapshot.

**Code comments and package metadata.**
- **Core** `package.json` describes the package as types, protocol and samples only.
- **Runner** `package.json` names `dist/` entry points that do not exist (`noEmit`).
- **add-node's `preferredId`** is documented as used, but nothing reads it: ids are always derived from the sentence.
- **graph.json `attempts`:** the comment says it is filled from M2 on; it is always `[]`.
- **The graph.json schema file** is named 1.0, while the format is 1.1 (the schema accepts any 1.x).
- **`gate/types.ts` and `gate/index.ts`:** their comments list fewer G0 tokens and ghost keywords than `g0.ts` checks (m2-plan §3.1 matches the code). The header of `gate/types.ts` also shows an older ghost-check shape and freeze order.
- **`workspace/types.ts`** calls undo patches "fuzzy"; `undo.ts` uses `fuzzFactor 0`.
- **`shadow/types.ts`:**
  - it says `git/` has `ws/` as its work tree; it is a bare `fast-import` repository;
  - it says `scratch/` holds scratch Lean projects; the folder is created but never written (scratch sources go to Lean on stdin).
- **`AcceptRequest`** documents `facts` and `realFiles` for the re-gate path; the RunManager passes neither.
- **Two unrelated functions are both named `rootKeyOf`:** the history ref key (`workspace/git.ts`) and the run-directory key (`shadow/index.ts`).
- **Webview:**
  - `ready.lastVersion` is always null;
  - `PersistedState.subject` is written but never read back by the webview;
  - the 25/80/3 figures in RunPanel's comment match `DEFAULT_RUN_CAPS`, but the UI reads the caps from RunView.
- **`seed.ts` and decisions-log §31** name only concurrent builds as Lake's exception; see A.2 item 1.

**Declared but never produced, or unused.**
- **Status flags** `unselected-used`, `broken`, `depends-on-removed` and `signoff-stale`. Only `broken` has a chip.
- **Other values:** the vocabulary flag `new` (the proposed view computes its own diff marks); Role values other than `node`; certificates other than `none`.
- **Unused functions:**
  - nothing calls `notImplemented()`;
  - `sentenceLabel`, `nodesOfType` and `isFormalized` are unused;
  - `planKindChange` and `planDelete` are not used outside core;
  - runner `footprint.ts` `computeFootprints` is used only by tests;
  - `EdgeEngine.onFrame` has no callers;
  - several webview helpers are exported but used only in their own files, and ReportCard repeats `COST_TITLE`'s text instead of importing it.

**Tests.**
- **Core `edit/conditional.test.ts`** cites a missing runner `integration/conditional.test.ts`; its real-Lean counterpart is `integration/fixes.test.ts`.
- **Helper headers describe stubs.** Those of fakeMarkup, scenarios, parseFixture, gate/helpers, run/helpers, proposal/helpers and m2-carryover.spec still describe stubs and gated blocks; nothing is gated now.
- **The walkthrough README** says the RunManager unit tests use its scripts; they script inline.

# Appendix C: Glossary

| Term | Meaning |
|---|---|
| **A / B / R / S / F** | states of a run: the newest ghost adoption / the user's files at the start (with base facts) / the round start / Claude's working copy now / the round's freeze |
| **Accept** | applying a proposal's judged files to your model, as one history entry and one undo step; it re-gates after drift |
| **A2 / gate loop** | the retry loop: `finish` → gate → notice and exact findings back to Claude → retry, up to `maxGateAttempts`, then revert to the last passing state |
| **attempt** | one `finish` call in a round; failed attempts count toward the cap |
| **attempts.jsonl / decisions.json** | per-subject logs of run rounds (and what you did with them) and of your answers to Claude |
| **binding / pin** | which declaration is a card's statement: `lean:` (pinned, always wins) or adjacency (the next declaration with no blank line) |
| **card** | one `@@ telelean v1` block in a Lean comment, with a sentence and optionally a Lean statement |
| **carrier** | a non-proof declaration (def, instance, structure) that rests on more than the vocabulary layer, i.e. carries a proof; refused before the freeze |
| **check / round budget** | per-round caps: 25 Lean checks, 80 turns, 20 agent minutes, 120 s per Lean job, 3 attempts |
| **comparator (G4)** | Lean's `lake comparator`, run against the frozen export with the permitted axioms; it checks T.holds's type, closure and axioms as terms, and replays in the kernel |
| **conditional** | a proof `theorem d.holds (h : g) : d` that takes unproved statements as hypotheses; never "proved" |
| **D-11** | the kind-change table: only `type:` and `n.holds` change; users of a removed `.holds` are rewritten or marked broken |
| **D-19** | meaning before proof status: a freeze between formalising and proving, and the review shows statements before results |
| **definition question** | a new definition on a statement path, or a new presupposition, in a proposal; Accept needs "yes" to each |
| **drift** | your model files changed while a run worked; Accept then merges, re-freezes and re-gates |
| **facts (fresh / stale / unchecked)** | what Lean reported per declaration (type, kind, value, axioms, references), tied to file versions |
| **footprint** | what a proof rests on: Ax(`n.holds`) mapped to card ids, `presup:` entries and `axiom:` entries |
| **freeze** | `freeze_statements`: records the permitted set, a snapshot of the subject's non-theorem declarations and all axioms, and the comparator challenge; once per round |
| **G0–G5** | the gate steps: G0 text rules, G1 build, G3 semantic rules, G4 comparator, G5 markup. There is no G2 (deferred to H) and no G6 step |
| **ghost** | a suggested missing premise (`propose_assumption`), checked to close the gap together with the selection; "I hold this" adopts it as a Claude-worded Assumption |
| **`.holds`** | `n.holds`, the commitment declaration: an axiom (held), a theorem (derived), or absent (open) |
| **kind** | ASSUMPTION, DERIVATION or GOAL (the `type:` line) |
| **lifecycle item** | a card change offered with a proposal; today only GOAL → DERIVATION for a proved target (recommended, ticked by default) |
| **normalisation** | telelean's own pre-gate edit: pins for statements formalised in the run, and docstrings mirroring the sentence |
| **pending promotion / claimed** | a Derivation whose `.holds` is still an axiom (after A→D) |
| **permitted set Perm(F)** | STD ∪ signature ∪ selected `.holds` ∪ presuppositions ∪ user-proved derivation footprints, minus T.holds and sorryAx (3.6) |
| **preflight** | the checks before anything is declared, spawned or sent |
| **presupposition** | `axiom T.exists : Nonempty T` for a sort T; needed by every named constant of T; "assumes characters exist" |
| **proposal** | the reviewable result of a round: proposed board, diff, files, questions, report card |
| **quota tripwire** | `TELELEAN_NO_REAL_CLAUDE`, Test-mode refusal and the dry-by-default scripts, which keep tests off your subscription |
| **round** | the first round, each Feedback, and each ghost adoption; caps and attempts count per round |
| **runLean** | the one wrapper for every Lean process (systemd scope, setpriv, keeper, bwrap; fail closed) |
| **runExclusive** | the process-wide queue of one Lean job at a time |
| **shadow / working copy** | the run's private copy (`ws/` for Claude, `build/` for Lean, `git/` history) in extension storage |
| **signature (Sig)** | vocabulary axioms that are symbols, not beliefs: sorts, predicates, functions and constants (and non-Prop library-root axioms) |
| **statement** | a card's `abbrev n : Prop := …`: its meaning, committing to nothing |
| **subject** | a module subtree and namespace (`Model/<S>/…`) shown on one board |
| **syntactic mode** | the board without Lean facts (wrong toolchain), cards read from text only |
| **TLxxx** | diagnostic codes: TL0xx markup, TL1xx Lean side, TL201 project not checkable |
| **verdict** | proved, not-proved, insufficient, inconsistent, gave-up, no-finish, cap-reached, cancelled, failed |
| **vocabulary** | declarations in a subject's modules bound to no card, classified as sort, predicate, function, constant, presupposition, definition, lemma, unmarked axiom or other |

# Appendix D: How this report was checked

**Sources:**
- per-package surveys of every source file (summarised in docs/project-report-files.md);
- a features survey checked against the code;
- a theory draft, fact-checked line by line. All 21 corrections and 11 additions from the fact-check are applied here.

**Spot checks while assembling** (read-only):
- the manifest's commands, settings, colours and activation;
- the root build scripts and the runner's `noEmit`;
- the bundle and source modification times;
- the shadow layout (the bare repository, the unused `scratch/`);
- the CLI flags, launcher and environment rules;
- the tool server's checks;
- refresh time limits and the check-file invocation;
- the permitted set, `rules.ts`, `decls.ts` and the G0 lists;
- the status computation in `build.ts`;
- `kindsAgree` and TL110;
- the lifecycle default;
- toast timings;
- the vocabulary flags;
- the last verifier's report.

Test counts are quoted from that verifier, not re-run.

**Lean outputs** (3.8, the 3.2 presupposition example, the 3.7 instance experiment and the autoImplicit behaviour) were run in scratch copies with toolchain 4.35.0 by the theory writer and the fact-checker.

**Process note:**
- During the theory work, one probe command was run by mistake in the repository root. It created `p2.lean`, which was deleted at once after its content was confirmed to be the probe text. The fact-checker confirmed that the root has no `p2.lean`, no `.lake` and no root manifest.
- Assembling this report changed nothing in the repository.
