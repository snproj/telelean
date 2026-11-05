# build:WP4 (agent ad3cbb1ca46510ebc)

## summary
WP4 is complete and its tests pass. The final run had 75 tests, all passing, and the runner package typechecks with exit 0.

Every gated test ran, because the WP1, WP2 and WP3 code they need had landed in the tree by then:
- the real-core graph with 4 Spyro nodes, and graph.json from the real core after a perform;
- a real-core board session (add, reorder, undo, new subject, history);
- Lean builds under runLean of the sample and of the Initialize scaffold, each in a scratch copy;
- a real `refreshNow` through WP3, which returned state `fresh`.

What I built, in `packages/runner/src/workspace/` (no vscode imports):

**`createModelWorkspace`** (`modelWorkspace.ts`)
- `load` lists `<library>.lean`, `<library>/**.lean` and each subject's `layout.json`, reads them through the TextSource and hashes them with sha256. Parsing is lazy and cached by path plus hash.
- `graph(subject)` uses core's `buildProjectModel` and `subjectGraph`. Versions come from a process-wide counter seeded from `Date.now()`, so they always increase. An unknown subject throws.
- `invalidate` re-reads changed files; if two reads of one file overlap, the latest wins. Changes fire `onDidChange`.
- `requestRefresh` waits 750 ms, merges requests into one follow-up run, and runs one refresh at a time via `runExclusive`. Status mapping follows plan section 4; `unsupported-project` becomes `disabled` plus a TL201 diagnostic. A failed refresh keeps the previous facts. graph.json is rewritten after every refresh and every write, serialised and atomic.
- `perform`: plan, turn layout and attic entries into whole-file changes, "Manual edits" snapshot, applier, action snapshot (skipped for layout-only), undo entry. Refusals come back as outcomes and are never thrown, even if something fails after the apply.
- Undo/redo give exact reversal, or no-fuzz reverse patches with the installed `diff` 9.0.0, all or nothing.
- History, revert, prune, storage counter, `historyStatus`, `initGit`.
- perform, undo, redo, revert, prune and `initGit` run in one serial queue.

**History** (`history.ts`, `git.ts`)
- Refs are `refs/telelean/<rootKey>/subjects/<S>` and `.../project`, with `rootKey` as the plan defines and checked by `check-ref-format`.
- Snapshots use plumbing only (`hash-object`, a temporary index, `write-tree`, `commit-tree`, `update-ref` with the old value), the four safe `-c` flags, `GIT_TERMINAL_PROMPT=0`, and author/committer `telelean <telelean@localhost>`.
- A test against a dirty user repository (staged, unstaged and untracked changes, a branch, a tag, nine marker hooks) confirms the index, HEAD, branches, tags, config, hooks and status outside the model folder are unchanged. Only `refs/telelean/*` appear, no hook ran, and no reflog was created.

**Initialize** (`initialize.ts`): `inspectFolder`, `planInitialize`, `findModelRoots` and `initGitRepository`. The lakefile and manifest texts are tested to be byte-identical to `test-fixtures/spyro`.

**Disk adapters** (`fsAdapters.ts`): a disk TextSource and an EditApplier that checks `before` first, for tests and the integrator.

**The sample `mental_model/`** was written with plain file writes as plan 7.4 specifies: 11 files, no `.lake`, no `.git`.

**One behaviour fix, decided by me (logged below):** "Manual edits" snapshots take a subject's `layout.json` from the tip. Otherwise an unsnapshotted reorder would be mislabelled as a hand edit by the next action; plan section 8 says it should ride along with the next action snapshot.

## files
- /home/zhengyew/telelean/packages/runner/src/workspace/types.ts (modified: additive `core` option + `WorkspaceCore` interface)
- /home/zhengyew/telelean/packages/runner/src/workspace/index.ts (stubs replaced; additive exports)
- /home/zhengyew/telelean/packages/runner/src/workspace/modelWorkspace.ts (new)
- /home/zhengyew/telelean/packages/runner/src/workspace/history.ts (new)
- /home/zhengyew/telelean/packages/runner/src/workspace/git.ts (new)
- /home/zhengyew/telelean/packages/runner/src/workspace/undo.ts (new)
- /home/zhengyew/telelean/packages/runner/src/workspace/files.ts (new)
- /home/zhengyew/telelean/packages/runner/src/workspace/semanticSummary.ts (new)
- /home/zhengyew/telelean/packages/runner/src/workspace/sidecars.ts (new)
- /home/zhengyew/telelean/packages/runner/src/workspace/initialize.ts (new)
- /home/zhengyew/telelean/packages/runner/src/workspace/fsAdapters.ts (new)
- /home/zhengyew/telelean/packages/runner/test/workspace/helpers.ts (new)
- /home/zhengyew/telelean/packages/runner/test/workspace/fakeCore.ts (new)
- /home/zhengyew/telelean/packages/runner/test/workspace/scan.test.ts (new: AT4.1, AT4.9)
- /home/zhengyew/telelean/packages/runner/test/workspace/refresh.test.ts (new: AT4.2)
- /home/zhengyew/telelean/packages/runner/test/workspace/perform.test.ts (new: AT4.3)
- /home/zhengyew/telelean/packages/runner/test/workspace/undo.test.ts (new: AT4.4)
- /home/zhengyew/telelean/packages/runner/test/workspace/history.test.ts (new: AT4.5)
- /home/zhengyew/telelean/packages/runner/test/workspace/initialize.test.ts (new: AT4.6, AT4.8)
- /home/zhengyew/telelean/packages/runner/test/workspace/sample.test.ts (new: AT4.7)
- /home/zhengyew/telelean/packages/runner/test/workspace/realcore.test.ts (new: real-core session, gated WP1/WP2)
- /home/zhengyew/telelean/mental_model/lakefile.toml
- /home/zhengyew/telelean/mental_model/lake-manifest.json
- /home/zhengyew/telelean/mental_model/lean-toolchain
- /home/zhengyew/telelean/mental_model/.gitignore
- /home/zhengyew/telelean/mental_model/Model.lean
- /home/zhengyew/telelean/mental_model/Model/Spyro.lean
- /home/zhengyew/telelean/mental_model/Model/Spyro/Vocabulary.lean
- /home/zhengyew/telelean/mental_model/Model/Spyro/Inbox.lean
- /home/zhengyew/telelean/mental_model/Model/Spyro/Main.lean
- /home/zhengyew/telelean/mental_model/.telelean/config.json
- /home/zhengyew/telelean/mental_model/.telelean/subjects/Spyro/layout.json

## how_to_run_tests
cd /home/zhengyew/telelean/packages/runner && npx tsc -p tsconfig.json --noEmit && sh -c 'ulimit -c 0; LEAN_NUM_THREADS=4 TELELEAN_TEST_TMP=/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/wp4/tt TMPDIR=/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/wp4/tmp npx vitest run test/workspace'

Gates:
- The Lean-build tests run when WP3's `refreshLeanFacts` is implemented, or when `TELELEAN_WS_LEAN=1` is set. The WP3 probe uses an unreachable memory threshold, so it never spawns anything.
- The real-core tests run when WP1/WP2 are implemented. All gates were open in the final run.
- The Lean tests wait for at least 12 GB MemAvailable, and skip otherwise.

## test_output
== npx tsc -p tsconfig.json --noEmit
tsc exit=0
== vitest run test/workspace
 RUN  v5.0.5 /home/zhengyew/telelean/packages/runner
 Test Files  8 passed (8)
      Tests  75 passed (75)
   Start at  12:38:47
   Duration  13.99s (tests 93%, import 6%, transform 1%)
== leftovers (systemd units / processes named wp4t*): 0 / 0

Gated tests, from the previous verbose run (before realcore.test.ts was added; that file passed separately, 4/4):
 ✓ refresh.test.ts > ... > the real semantic layer (gated on WP3 or TELELEAN_WS_LEAN=1) > refreshNow builds and checks a scratch copy in place and hands the facts to core 1852ms
 ✓ refresh.test.ts > ... > graph.json with the real core (gated on WP2) > is written after a perform and parses 38ms
 ✓ initialize.test.ts > AT4.6 planInitialize > Lean (gated on WP3 or TELELEAN_WS_LEAN=1) > the empty-folder scaffold builds under runLean in a scratch copy 1326ms
 ✓ sample.test.ts > AT4.7 ... > parsed with the real core (gated on WP1) > a scratch copy parses to the 4 Spyro nodes, pg-no-dark-past code-less, the others pinned 5ms
 ✓ sample.test.ts > AT4.7 ... > built with Lean (gated on WP3 or TELELEAN_WS_LEAN=1) > a scratch copy builds under runLean 1202ms
 ✓ scan.test.ts > AT4.1 ... > with the real core (gated on WP1/WP2) > graph('Spyro') has the walkthrough's 4 nodes; subjects() lists both 10ms

realcore.test.ts (run separately):
 ✓ adds a card to the Inbox and the layout, and undoes it exactly 239ms
 ✓ reorders within a column (layout only) and undoes it 70ms
 ✓ creates a subject (undo stack of the new subject) and its undo removes it 342ms
 ✓ records the session in the history 55ms
 Tests  4 passed (4)

## acceptance
- **test:** AT4.1 Scan of a scratch copy of mental_model plus a second subject: subjects() lists both with node counts; graph('Spyro') has 4 nodes; unknown subjects throw
  - **status:** pass
  - **evidence:** scan.test.ts. With the fake core: subjects() returns [Other(1), Spyro(4)] with their files; exactly the 8 model files (hashed with sha256) reach core, while dot-dirs, node_modules, .lake, folders outside the library and non-Lean files are skipped; graph('Nope') throws /unknown subject/. Also tested: unsaved buffers win, parsing happens once per content, invalidate adds and drops files and reports subject-list changes, and the latest read wins. Gated on WP1/WP2, run with the real core: graph('Spyro') has the 4 nodes and subjects() lists [Other 1, Spyro 4].
- **test:** AT4.2 requestRefresh with a fake refreshFacts: debounced, coalesced, one at a time, 'checking' meanwhile; every FactsStatus mapped (unsupported-project -> disabled + TL201); previous facts kept after a failure; onDidChange fires; graph.json written after a refresh and after a perform, and it parses
  - **status:** pass
  - **evidence:** refresh.test.ts: 11 tests. maxRunning stays at 1; the state sequence is [checking, fresh, checking, fresh]; requests made while a refresh runs give exactly one follow-up. All 10 statuses are mapped, plus a thrown error; TL201 appears only for unsupported-project. After failed refreshes the same facts object is still in use, and staleFiles follow the hashes. graph.json is checked after a refresh, after a fake-core perform, and (gated on WP2) after a real-core perform. Also passing: phases, refreshNow, disabled mode, and dispose aborting a running refresh. Gated on WP3: a real refreshNow returned state 'fresh' with all 5 modules fresh.
- **test:** AT4.3 perform: layout.json and the attic materialised into FileChanges for the applier; layoutOnly actions applied and undoable but not snapshotted; ActionError -> ok:false with dependents; an applier rejection (before mismatch) -> conflict with nothing recorded
  - **status:** pass
  - **evidence:** perform.test.ts: 7 tests. add-node gives the Inbox change plus a created layout.json and the nodeId in the outcome. delete-node gives the Lean change, the layout and attic/new-spyro-pg.lean with the header '-- archived 2026-11-01T09:30:00.000Z (deleted): Spyro.new_spyro_pg.holds'. A reorder in a scratch repository adds no history entry, is undoable, and rides along in the next snapshot. needs-confirmation comes back with dependents; a NotImplementedError becomes 'internal'. A stale before gives conflict: files unchanged, no undo entry, no action snapshot. A failure after a successful apply still returns ok, and undo still works.
- **test:** AT4.4 Undo/redo: exact reversal; reverse patch past an unrelated hand edit; conflict refusal leaves files untouched; a created file is deleted only if unchanged; a new action clears redo; undo of an undo works
  - **status:** pass
  - **evidence:** undo.test.ts: 11 tests, 5 unit and 6 workspace. Exact undo and redo across all files. A reverse patch keeps a hand edit elsewhere in Main.lean, and redo patches forward the same way. A conflict returns '<file> changed since; use History to revert' with the tree byte-identical and no applier call. Undo of create-subject is refused while a created file is edited; once restored, it deletes all 5 files, reverts Model.lean, and the subject disappears from subjects(). Also covered: redo cleared by a new action, the undo/redo/undo chain, stacks kept per subject, and the 100-entry limit.
- **test:** AT4.5 History in a scratch repo: Initial state, Manual edits before an action, action snapshot with trailers, per-subject scope, listHistory order and labels, historyDiff parent/current, revert and undo of the revert, prune keeps N with the same trees, storage counters, the user's index/HEAD/branches/status unchanged, marker hooks never run, only refs/telelean/* change, correct rootKey for a nested model root
  - **status:** pass
  - **evidence:** history.test.ts: 14 tests. The model root sits at 'models/my model' inside a repository with commits, a branch, a tag, a staged change, an unstaged change, an untracked file and 9 marker hooks (each checked to work by running it directly with sh). Refs live under refs/telelean/models.my_model-<sha1[:8]>/; trees contain exactly the scope's files, paths relative to the model root. The commit message equals the label plus the four Telelean-* trailers. Revert leaves other subjects and project files untouched. Prune keeps the trees, labels and times, and the oldest kept commit has no parent. subjectBytes > 0 and the total is at least each subject's. The repository state check passes, no markers appear, and no .git/logs/refs/telelean is created. Also covered: rootKey 'root' at the top level; no-repo, then initGit makes it ready with an Initial state and no branch commit; disabled; git-missing; initGitRepository refusals; a failing snapshot giving error state plus TL202 and then clearing; a second window building on the moved tip.
- **test:** AT4.6 inspectFolder/planInitialize: empty gives exactly the 7.1 files (lakefile and manifest byte-identical, subject files equal subjectScaffold); existing .gitignore gets only missing lines; lake-project gives only .telelean/ files and .gitignore lines; [[require]] or manifest packages give unsupported naming Lake dependencies; lakefile.lean only gives unsupported; an opted-in model gives model; initGitRepository refuses inside a repo; the scaffold builds under runLean (gated on WP3)
  - **status:** pass
  - **evidence:** initialize.test.ts: 13 tests in the inspectFolder and planInitialize groups, including the TOML reader, refusals, suggestSubjectName and the initGitRepository refusal. 'Lakefile and manifest byte-identical to test-fixtures/spyro' passes. The Lake dependencies reasons name 'mathlib' and 'batteries, mathlib' and include 'Mathlib needs an explicit opt-in (M4)'. The gated Lean build passed: status ok, exit 0, 'Build completed successfully' in 1326 ms.
- **test:** AT4.7 mental_model/ exactly per plan 7.4: Vocabulary.lean byte-identical to the fixture; Main.lean = fixture plus one import line; no .lake/.git; a scratch copy parses to 4 Spyro nodes (gated on WP1) and builds under runLean (gated on WP3)
  - **status:** pass
  - **evidence:** sample.test.ts: 7 tests. Exactly 11 files. The lakefile, manifest and toolchain are byte-identical to the fixture. Model.lean is 'import Model.Spyro\n'; config and layout equal serializeProjectConfig / serializeLayout(emptyLayout()); the subject root and Inbox equal subjectScaffold. Vocabulary.lean is byte-identical, and Main.lean has 'import Model.Spyro.Inbox' added after the Vocabulary import. inspectFolder reports a model, and findModelRoots(repo) returns exactly [mental_model]. With WP1, the 4 ids parse with bindings [none, pinned, pinned, pinned]. With WP3, the build passed in 1202 ms, and the real folder still has no .lake.
- **test:** AT4.8 findModelRoots finds nested roots and skips node_modules, .lake, .git, verbatim_prompt_log, test-fixtures and dot-dirs
  - **status:** pass
  - **evidence:** initialize.test.ts AT4.8 (2 tests). Default search returns [a, a/sub/b, deep/1/2/3]. maxDepth 5 adds deeper/1/2/3/4; maxDepth 1 returns only [a]. With excludedDirs [] it also finds node_modules/pkg, test-fixtures/spyro, verbatim_prompt_log/bundle_1 and x/node_modules/y, while .lake, .git and .hidden stay skipped. A missing folder gives [].
- **test:** AT4.9 Graph versions strictly increase across subjects and across two workspaces created one after the other for the same root
  - **status:** pass
  - **evidence:** scan.test.ts AT4.9: v1 >= Date.now() at start, and v1 < v2 (Other) < v3 (Spyro) < v4 (second workspace) < v5. A burst of 200 graph() calls is strictly increasing.
- **test:** Typecheck of the runner package
  - **status:** pass
  - **evidence:** npx tsc -p tsconfig.json --noEmit -> exit 0 (final run).

## contract_changes
- packages/runner/src/workspace/types.ts (WP4 is the owner; the change is additive): new optional `ModelWorkspaceOptions.core?: Partial<WorkspaceCore>` and a new exported interface `WorkspaceCore`, listing the five core functions the workspace calls (parseLeanFile, buildProjectModel, subjectGraph, planAction, toGraphJson). It is a test hook; missing members default to @telelean/core's own.
- packages/runner/src/workspace/index.ts: the stub bodies are replaced by implementations; signatures and DEFAULT_EXCLUDED_DIRS are unchanged. New exports: fsTextSource, fsEditApplier, suggestSubjectName, GITIGNORE_LINES, SCAFFOLD_LAKEFILE_TOML, SCAFFOLD_LAKE_MANIFEST, SCAFFOLD_LEAN_TOOLCHAIN. One sentence added to the planInitialize doc: the subject name is used, and checked, only for an empty folder (a Lake project keeps its own subjects).
- Plan section 14 was NOT edited: docs/ is outside my assigned paths. Rows for the integrator to append: | 2026-11-01 | WP4 | `runner/src/workspace/types.ts` | `ModelWorkspaceOptions.core?: Partial<WorkspaceCore>` (test hook) + `WorkspaceCore` interface | and | 2026-11-01 | WP4 | `runner/src/workspace/index.ts` | exports `fsTextSource`, `fsEditApplier`, `suggestSubjectName`, `GITIGNORE_LINES`, `SCAFFOLD_*`; planInitialize: subject checked only for empty folders |

## minor_decisions
- **decision:** "Manual edits" snapshots take a subject's layout.json from the chain's tip. Telelean's own layout-only changes therefore ride along with the next action snapshot. A hand edit to layout.json alone also rides along instead of producing a "Manual edits" entry.
  - **rationale:** Plan section 8 says layout-only changes are not snapshotted on their own and ride along with the next snapshot. Without this, the next action's hand-edit check would record every reorder as "Manual edits".
- **decision:** A "Manual edits" snapshot is labelled "Initial state" (action 'initial') when the scope has no chain yet. That happens, for example, when the user ran git init outside telelean after the board opened.
  - **rationale:** There is no base to call the changes hand edits against.
- **decision:** Undo outcomes are `undoable: false`; redo and revert outcomes are `undoable: true`.
  - **rationale:** The toast's Undo button posts `undo`, which on an undo's toast would undo the next older entry. Redo is the way back from an undo.
- **decision:** Both stacks store changes as they were last applied, and both Undo and Redo apply the top entry backwards. A file already in the target state counts as a no-op.
  - **rationale:** Exact reversal stays possible after an undo or redo that needed patching. One algorithm serves both directions.
- **decision:** After an action, a Lean refresh is requested only when a `.lean` model file changed. Layout-only and attic-only changes skip it; graph.json is rewritten in every case.
  - **rationale:** Saves a pointless build. Layout and attic files are not part of the Lean project.
- **decision:** historyDiff(..., 'current') returns before = the entry's text and after = the current text, i.e. what changed since the entry. 'parent' returns before = the parent's text and after = the entry's.
  - **rationale:** Older on the left, newer on the right in both modes. The plan leaves the direction open.
- **decision:** listHistory defaults to 50 entries (capped at 1000). It returns an empty listing when history is unavailable or listing fails; a failure shows as historyStatus 'error' plus a TL202 diagnostic and clears on the next success. historyDiff throws ActionError (not-found / no-history); revert returns outcomes; prune throws TypeError for keepLast < 1.
  - **rationale:** The webview can always render a listing, and errors still surface on the board.
- **decision:** A failing snapshot never fails the action: the action is applied and recorded for undo, and history reports 'error' with a TL202 diagnostic on every subject graph and in graph.json.
  - **rationale:** Plan: "Actions still work without history."
- **decision:** Workspace diagnostics TL201 and TL202 are appended to every subject's graph and to graph.json's diagnostics. TL201 carries no `file`.
  - **rationale:** TL201 is about the project, and lake-manifest.json may not exist, so there is no file to point at.
- **decision:** errorCount = build messages with severity error + declarations whose probe failed (`error`).
  - **rationale:** check-errors would otherwise show 'failed' with 0 errors.
- **decision:** Statuses that produce no facts (could-not-start, timeout, oom, cancelled, low-memory, unsupported-toolchain, unsupported-project) and a refresh that throws all keep the previous facts. build-errors and check-errors replace the facts.
  - **rationale:** Plan section 4: build-errors/check-errors facts still cover the fresh modules, and previous facts stay in use after a failed refresh.
- **decision:** initGit inside an existing repository simply starts the histories and returns 'ready'. The public initGitRepository still refuses.
  - **rationale:** The board's "Initialize git" button can race with a git init done outside telelean.
- **decision:** inspectFolder:
- a folder with both lakefiles is unsupported (Lake prefers lakefile.lean; verified in the toolchain's Lake sources);
- a lakefile.lean-only folder gets the hint `lake translate-config toml` (that command exists in Lake 4.35);
- lake-project subjects are subdirectories with subject names that contain at least one .lean file;
- a .gitignore line counts as present in an equivalent spelling (`/.lake`, `.lake/`).
  - **rationale:** Avoids reading the wrong lakefile, empty layout files, and duplicate .gitignore lines.
- **decision:** suggestSubjectName: split the folder name on characters outside [A-Za-z0-9], capitalise each word, join; fall back to 'Subject'. So mental_model -> MentalModel, my-model 2 -> MyModel2, 2024 -> Subject.
  - **rationale:** Plan 7.2's rule, made concrete for WP5's prompt.
- **decision:** Reverting when nothing differs returns ok ('Nothing to revert: …'), undoable false, and takes no snapshot. Revert refuses with 'unsafe' any tree path that is not a plain relative path.
  - **rationale:** Avoids empty history entries. The path check is a cheap integrity guard for trees telelean did not write.
- **decision:** Graph versions come from one process-wide counter: max(last + 1, Date.now()). Every graph() call gets a new version.
  - **rationale:** Strictly increasing across subjects and re-created workspaces (AT4.9). The project model itself is cached, so repeated graph() calls stay cheap.
- **decision:** A snapshot's update-ref compare-and-swap retries once on the moved tip (another VS Code window). Snapshot temp files (blobs, temporary index) go into a fresh mkdtemp directory under os.tmpdir() with mode 0600, and are removed afterwards.
  - **rationale:** Concurrency safety without touching the user's index.

## open_issues
- Plan section 14 rows for my additive contract changes still need adding by the integrator (docs/ is outside my assigned paths); the exact rows are in contract_changes.
- Observed and resolved, no action needed: around 12:26 WP1's packages/core/src/markup/values.ts briefly failed to parse (raw U+2028/U+2029 inside a regex literal), which broke every @telelean/core import. It was fixed by 12:29 and my later runs pass. The integrator may want to check that those separators are written as \u escapes.
- I ran only my workspace tests plus the whole runner typecheck, not the full runner vitest suite: other builders' semantic and lean tests are heavy and theirs, and the rule is one heavy process at a time.
- The gated real-core tests (realcore.test.ts, scan/refresh real-core cases) ran against WP2's code as it stood around 12:38. If WP2 changes later, the integrator should re-run them. The integrator can remove the WP1/WP2/WP3 skip gates now.
- Undo stacks are keyed by EditPlan.subject. Today's WP2 create-subject plan uses the new subject, and the real-core session test passes; a plan with subject '' would land on a stack WP5 never undoes.
- graph.json and fsEditApplier write through `<file>.<pid>-<n>.tmp` then rename. Only a crash inside that millisecond window could leave a temp file, which the default .gitignore lines do not cover.
- For the user to review: hand edits to layout.json alone produce no "Manual edits" snapshot; they ride along with the next action snapshot (see minor decisions).

## integration_notes
For WP5 (extension host):
1. Create one workspace per model root and keep it until the window closes: `createModelWorkspace({ root /*absolute*/, text, applier, semantic: { enabled, memoryMax: '<n>G', minAvailableBytes, debounceMs? }, git: { enabled, gitPath?, author? }, log, generatorVersion })`.
   - `text` reads open buffers first, then disk; it takes POSIX paths relative to the root and returns null when the file is missing.
   - `applier` must check every `before` first, then apply a WorkspaceEdit and save. It should reject on a mismatch, preferably with `new ActionError('conflict', message)`; any rejection is reported as a conflict with your message shown as is.
   - Then `await ws.load()`, which also takes the "Initial state" snapshots.
2. Graphs and state: `graph(subject)` throws for an unknown subject. `workspaceState(subject)` also starts a missing chain ("board open"). `semantic()` is cheap.
3. Watchers:
   - model `.lean` files, `.telelean/subjects/*/layout.json` and `.telelean/config.json`: call `invalidate([paths])`, relative or absolute inside the root; other paths are ignored;
   - saves: `requestRefresh('save')`; board open: `requestRefresh('open')`; Refresh button: `refreshNow()`.
   - The workspace writes `.telelean/graph.json` itself; ignore it.
4. onDidChange gives `{ subjects, semantic, subjectsListChanged }`. Re-post `graph(boardSubject)` when `subjects` includes the board's subject or `semantic` is true. Re-post `workspaceState` when `subjectsListChanged` is true; if the board's subject is gone, switch to the first remaining one. TL202 history errors also fire a change.
5. Return behaviour:
   - perform, undo, redo and revert never reject; they always return an ActionOutcome. Show the Undo toast only when `undoable` (false for undo outcomes by design).
   - historyDiff throws ActionError not-found / no-history; prune throws TypeError for keepLast < 1; listHistory returns an empty listing when history is unavailable.
   - initGit() returns the new HistoryAvailability.
   - After the Initialize command, call `initGitRepository(root)` yourself (it refuses inside a repository), or use `ws.initGit()` from the board.
6. Initialize: `inspectFolder(folder)`, then `planInitialize({ subject, inspection })`, then apply the changes. Use `suggestSubjectName(path.basename(folder))` as the prompt's default. For a Lake project the subject is ignored.
7. `fsTextSource` / `fsEditApplier` are available for tests and the integrator's end-to-end test.

For the integrator:
- Remove the gates in test/workspace/{scan,refresh,sample,initialize,realcore}.test.ts; they were all open in my final run.
- The tests set GIT_CONFIG_GLOBAL=/dev/null, GIT_CONFIG_NOSYSTEM=1, GIT_CEILING_DIRECTORIES=$TELELEAN_TEST_TMP and TMPDIR=$TELELEAN_TEST_TMP/tmp when helpers.ts is imported.
- Lean tests use runId `wp4t<pid>`.

## effects_outside_repo
- Scratch dir /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/wp4/ (3.1 MB left): git probe repositories in probe/, test scratch trees under tt/ (each test removes its own), and tmp/ (snapshot temp dirs plus Node's node-compile-cache, created there because TMPDIR pointed there).
- Inside the repo but outside my assigned paths: vitest updated its results cache, /home/zhengyew/telelean/packages/runner/node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json. This is vitest's default behaviour; other runner test runs write it too.
- npx (npm exec) wrote its rotating per-run debug logs to ~/.npm/_logs/ for each tsc/vitest invocation (npm's default, at most 10 files kept). No npm config was touched and nothing was installed or downloaded.
- Lean: three kinds of runLean builds ran on scratch copies only: the sample, the Initialize scaffold, and one real refresh through WP3's refreshLeanFacts (each about 1.2 to 1.9 s). They ran in transient systemd user scopes named telelean-wp4t<pid>-*, each checked for at least 12 GB MemAvailable first (it was about 36 GB), one at a time. Afterwards no wp4t units or processes remained. ~/.elan/known-projects was not modified (mtime 09:09, before my work); toolchain binaries were called directly.
- git: run only in scratch repositories (probes and tests), always with GIT_CONFIG_GLOBAL=/dev/null, GIT_CONFIG_NOSYSTEM=1, GIT_CEILING_DIRECTORIES=<scratch>, the safe -c flags and explicit authors. Never in /home/zhengyew/telelean or mental_model/. No remotes, push, fetch or gc. The tests' marker hook scripts were run directly with sh inside scratch repositories, as a positive control.
- No network use, no downloads, no npm install, no Claude CLI, no credentials read, nothing published or sent, no sudo or global installs. The user's VS Code settings and extensions, ~/telelean_scripts, ~/.config, ~/.claude and the global git config were not touched.

