# files:runner-b (agent a30c8344b2913ae2a)

## package_overview
These five directories are the Node-side machinery of packages/runner behind one opted-in model root (M1) and behind M2's one-shot "These suffice" runs. None of them imports vscode. The extension (extension/src/vscode/runner.ts, host.ts, registry.ts) builds the objects, supplies a TextSource that reads open buffers first and a WorkspaceEdit-based EditApplier, sets runsDir to `<globalStorage>/runs`, and passes core's view types (TlGraph, RunView, ProposalView) on to the webview. All pure logic comes from @telelean/core, usually behind an injectable `core` test hook: block parsing, the project model, graphs, action planning, gate rules, normalisation, permitted axioms, finding wording, proposal labels, lifecycle edits and sidecar codecs. Lean runs only through lean/ (the runLean sandbox and the lake comparator) and semantic/ (refreshLeanFacts, the process-wide runExclusive queue and the memory guard). Claude is reached only through llm/ (LlmBackend, ClaudeCliBackend, tool schemas).

workspace/ (M1, extended for M2): ModelWorkspace scans and parses the model files and layout sidecars and builds subject graphs. It runs a debounced, coalesced Lean refresh: old facts are kept when a refresh fails and dropped when the board falls back to syntactic mode. It writes `.telelean/graph.json`. Every write (board actions, undo/redo, history revert, accepted proposals) goes through one queued path: base snapshots, the EditApplier with `before` checks, an in-memory undo entry, an action snapshot on private refs `refs/telelean/<rootKey>/...` (git plumbing only), re-read, refresh. initialize.ts implements "Initialize Model Here".

shadow/ (M2): each run gets `<runsDir>/<rootKey>/<runId>/` containing:
- ws/: Claude's working directory. It holds only model and project files, and a symlink, special file or dot-entry makes it fail closed.
- build/: the Lean mirror, synced from ws/ by comparing contents.
- git/: a bare repository written with fast-import. Its commits are typed: base, freeze, adopt, normalise, gate-pass, revert, rebase, accept-base, checkpoint.
- session/, frozen/, gate/ and run.json.
Seeding build/.lake from the user's own build is off by default.

gate/ (M2): the LeanCheckEngine does every Lean step of a run:
- G0 text rules, before any Lean runs.
- G1: build and facts of build/.
- core evaluateRules, comparing the current state with B (the base facts, kept in base-facts.json), the newest adopt commit and the round start.
- freeze: permitted axioms plus an exported comparator challenge.
- normalisation.
- the gate itself: it judges one committed state, with the G4 comparator only for `proved`.
- ghost checks and statement rendering, fed to Lean as scratch sources on stdin.
Results are findings or budget findings (both count against attempts), or environment outcomes (which do not count).

run/ (M2): one RunManager per root owns:
- the state machine: starting, working, waiting-for-answer, gate, review, interrupted, then accepted, discarded, cancelled or failed.
- preflight and the Claude backend factory.
- the static system prompt and the context bundle.
- the AgentToolHost: check_lean, freeze_statements, ask_user, propose_assumption, finish.
- the caps and the A2 gate loop.
- Feedback and ghost-adoption rounds, and Accept.
- persistence (run.json, transcript.jsonl) and recovery after a reload.

proposal/ (M2): ProposalService builds the review: the proposed graph and its diff, changed files, statement and vocabulary reviews, definition questions, the GOAL->DERIVATION lifecycle item and the report card. It measures drift and plans Accept, either as a 3-way merge with no fuzz and 3 context lines or as exactly the re-gated files. It applies the result through ModelWorkspace.applyChanges. DiskSidecarStore keeps attempts.jsonl and decisions.json.

A run flows like this: start -> preflight -> backend -> set-premises via workspace.perform -> createRunShadow from workspace.readText -> engine.checkBase -> session -> context bundle -> tool calls into the engine -> finish -> normalise and gate -> gate-pass commit, retry, or give-up and revert -> buildProposal -> review -> accept -> proposals.apply -> endRun and prune. If the user's files changed during the run, accept first writes accept-base and rebase commits, then re-freezes and re-gates.

Where comments and code disagree:
- workspace/types.ts calls undo patches "fuzzy", but undo.ts uses fuzzFactor 0.
- shadow/types.ts says git/ has ws/ as its work tree; it is a bare fast-import repository.
- shadow/types.ts says scratch/ holds scratch Lean projects. The directory is created but never written: scratch sources go to Lean on stdin.
- The header of gate/types.ts shows an older ghost-check shape and freeze order.
- AcceptRequest documents `facts` and `realFiles` for the re-gate path, but the RunManager passes neither.

Two unrelated functions are both named rootKeyOf: workspace/git.ts makes the git ref key and shadow/index.ts makes the run-directory key. Runs have only been exercised with the fake LLM backend. The real-Claude path (run/backend.ts -> ClaudeCliBackend) has not been walked through.

## files
- **path:** packages/runner/src/workspace/files.ts
  - **purpose:** Path rules and directory listing for a model root. It decides which files are model files (`<library>.lean`, `<library>/**.lean`), project files or layout/attempts sidecars, and which snapshot scope a path belongs to (a subject's chain or the project chain). Listings come from disk (skipping dot-dirs, .lake, node_modules and symlinks) while contents always come from the TextSource; it also validates root-relative POSIX paths.
  - **key_exports:** isFile, walkFiles, listModelFiles, listLayoutFiles, isModelFile, PROJECT_FILES, isModelOrProjectFile, attemptsSubject, layoutSubject, scopeSubject, subjectNamesOf, scopesOf, isSubjectSidecarFile, isSubjectScopeFile, listScopeFiles, toRelative, assertRelativePath
  - **depends_on:** @telelean/core (inScope, isSubjectName, libraryRootFile, projectSnapshotScope, subjectOfPath, subjectSidecarDir, TELELEAN_DIR); ./history.ts (SnapshotScope type)
- **path:** packages/runner/src/workspace/fsAdapters.ts
  - **purpose:** A TextSource and EditApplier that work on disk only, used by tests, end-to-end runs and scripts (the extension has its own adapters that read open buffers first). The applier first checks every change's `before` (if any differs it throws ActionError `conflict` and writes nothing), then writes atomically through temp files in `.telelean/`; if a later write fails it restores the files already written.
  - **key_exports:** fsTextSource, fsEditApplier
  - **depends_on:** ./files.ts (assertRelativePath); ./types.ts; @telelean/core (ActionError, FileChange)
- **path:** packages/runner/src/workspace/git.ts
  - **purpose:** Low-level git helper for D-33 history. It spawns git without a shell, with safe `-c` settings (no signing, hooks, auto-gc or fsmonitor), a cleaned environment (no GIT_DIR, GIT_INDEX_FILE and the like inherited; LC_ALL=C; no prompts) and an output cap. It also finds the repository holding a model root (top level, prefix, git dir, linked worktree) and derives the `rootKey` used in ref names.
  - **key_exports:** SAFE_GIT_CONFIG, GitError, GitErrorKind, GitRunOptions, GitResult, gitEnvironment, runGit, stderrSummary, gitText, RepoInfo, discoverRepository, rootKeyOf (prefix/worktree -> ref key; not the same as shadow's rootKeyOf), isValidRefName
  - **depends_on:** node:child_process, node:crypto, node:path (no internal deps)
- **path:** packages/runner/src/workspace/history.ts
  - **purpose:** HistoryStore: durable snapshots of a model root as commits on private refs `refs/telelean/<rootKey>/subjects/<S>` and `/project`. Commits are built with plumbing only (hash-object, a temporary GIT_INDEX_FILE inside the git dir, write-tree, commit-tree, then a compare-and-swap update-ref retried once), so the user's index, HEAD and branches are never touched. It also lists entries, looks one up (with an ancestor check), reads files and trees via cat-file --batch, keeps a cached disk-usage counter, prunes a chain to its last N entries, and defines the `Telelean-*` commit-message trailers.
  - **key_exports:** HistoryStore, SnapshotScope, SnapshotFile, SnapshotMeta, HistoryStoreOptions, EntryDetails, HistoryUnavailableError, HISTORY_FORMAT, SNAPSHOT_TEMP_PREFIX, snapshotMessage, entryFromMessage, isoOfGitDate, digestFiles
  - **depends_on:** ./git.ts (runGit, gitText, discoverRepository, isValidRefName, GitError, RepoInfo); @telelean/core history types
- **path:** packages/runner/src/workspace/index.ts
  - **purpose:** Public entry point of the workspace module (frozen M1 contract). It re-exports the types and disk adapters, defines DEFAULT_EXCLUDED_DIRS (node_modules, .lake, .git, verbatim_prompt_log, test-fixtures), and wraps createModelWorkspace, inspectFolder, planInitialize, findModelRoots (default depth 4) and initGitRepository.
  - **key_exports:** createModelWorkspace, inspectFolder, planInitialize, findModelRoots, initGitRepository, DEFAULT_EXCLUDED_DIRS, fsTextSource, fsEditApplier, suggestSubjectName, GITIGNORE_LINES, SCAFFOLD_LAKEFILE_TOML, SCAFFOLD_LAKE_MANIFEST, SCAFFOLD_LEAN_TOOLCHAIN, everything in ./types.ts
  - **depends_on:** ./initialize.ts, ./modelWorkspace.ts, ./fsAdapters.ts, ./types.ts
- **path:** packages/runner/src/workspace/initialize.ts
  - **purpose:** 'Initialize Model Here' (D-28). It classifies a folder as empty, already a model, a dependency-free Lake project (lakefile.toml with a [[lean_lib]] and an empty manifest) or unsupported (with a reason), and plans the files that opt it in: the full scaffold for an empty folder, only `.telelean/` sidecars and .gitignore lines for a Lake project. It also finds model roots breadth-first and runs a safe `git init` that refuses inside an existing repository.
  - **key_exports:** inspectFolder, planInitialize, findModelRoots, initGitRepository, suggestSubjectName, readLakefileToml, LakefileSummary, manifestPackages, gitignoreWithTeleleanLines, SCAFFOLD_LAKEFILE_TOML, SCAFFOLD_LAKE_MANIFEST, SCAFFOLD_LEAN_TOOLCHAIN, GITIGNORE_LINES
  - **depends_on:** ./git.ts (discoverRepository, runGit); ./types.ts; @telelean/core (CONFIG_PATH, project config and layout serializers, subjectScaffold, PINNED_TOOLCHAIN_NAME, libraryRootFile, layoutPath)
- **path:** packages/runner/src/workspace/modelWorkspace.ts
  - **purpose:** ModelWorkspaceImpl, the workspace of one model root. It loads files and caches their parses by path and sha256, builds the core project model and subject graphs (with attempts and TL201/TL202 diagnostics), re-reads invalidated files, runs a debounced, coalesced Lean refresh inside semantic.runExclusive (recording .lake/build for the optional run seed via shadow/seed noteRefreshOutput) and rewrites .telelean/graph.json. Every write goes through one queued applyRecorded path (base snapshots, EditApplier, undo entry, action snapshot, re-read, graph.json, refresh): perform (core planAction plus sidecars), undo/redo, history revert, and the M2 applyChanges (model files only, history kind `accept-proposal`).
  - **key_exports:** ModelWorkspaceImpl, createWorkspace, nextGraphVersion, DEFAULT_DEBOUNCE_MS (750), DEFAULT_HISTORY_LIMIT (50), MAX_HISTORY_LIMIT (1000), DEFAULT_SNAPSHOT_AUTHOR
  - **depends_on:** ./files.ts, ./history.ts, ./initialize.ts (initGitRepository), ./semanticSummary.ts, ./sidecars.ts (materialisePlan), ./undo.ts, ./types.ts; ../semantic (refreshLeanFacts, runExclusive, default memory settings); ../shadow/seed.ts (noteRefreshOutput); @telelean/core (parseLeanFile, buildProjectModel, subjectGraph, planAction, toGraphJson, parseAttemptLines, summariseAttempts, paths)
- **path:** packages/runner/src/workspace/semanticSummary.ts
  - **purpose:** Pure mapping from the last refresh record, the facts in use and the current file hashes to the board's SemanticSummary: fresh, stale, checking, failed, paused-low-memory, unsupported-toolchain, disabled or unavailable, plus stale files and an error count. It also produces the TL201 diagnostic for a project that cannot be checked, and defines which facts statuses carry no facts and which discard the previous facts (D-7 syntactic mode).
  - **key_exports:** summarize, staleFilesOf, errorCountOf, refreshDiagnostics, NO_FACTS_STATUSES, DROPS_FACTS, RefreshRecord, SummaryInput
  - **depends_on:** @telelean/core types only (also used by proposal/service.ts)
- **path:** packages/runner/src/workspace/sidecars.ts
  - **purpose:** Turns the sidecar parts of an EditPlan into whole-file changes: the subject's layout.json (serializeLayout), and archived declarations appended to `.telelean/subjects/<S>/attic/<id>.lean` under a dated header. It rejects a plan that changes one path twice or reaches outside the root (ActionError `internal`) and drops changes that change nothing.
  - **key_exports:** materialisePlan, appendToAttic
  - **depends_on:** ./files.ts (assertRelativePath); @telelean/core (atticPath, layoutPath, serializeLayout, ActionError)
- **path:** packages/runner/src/workspace/types.ts
  - **purpose:** The frozen M1 contract of the workspace, with optional M2 members added: TextSource, EditApplier, the semantic and git settings, ModelWorkspaceOptions (with `core` and `refreshFacts` test hooks), WorkspaceCore, ExternalChangeSet (writes from an accepted proposal), WorkspaceChange, the ModelWorkspace interface, and Initialize's FolderInspection and InitializeOptions. Its header calls undo/redo patches 'fuzzy', but undo.ts applies them with fuzzFactor 0.
  - **key_exports:** Disposable, WorkspaceLog, TextSource, EditApplier, SemanticSettings, GitSettings, ModelWorkspaceOptions, WorkspaceCore, ExternalChangeSet, WorkspaceChange, ModelWorkspace, FolderInspection, InitializeOptions
  - **depends_on:** @telelean/core types; ../semantic/types.ts (RefreshRequest)
- **path:** packages/runner/src/workspace/undo.ts
  - **purpose:** Per-subject Undo/Redo stacks held in memory (at most 100 entries), storing whole-file changes as last applied; both undo and redo apply the top entry backwards. Applying backwards is exact when the file still equals `after`, does nothing when it already equals `before`, and otherwise applies a reverse `diff` patch with fuzzFactor 0. If any file no longer fits, the whole step is refused.
  - **key_exports:** UndoStacks, UndoEntry, BackwardResult, backwardText, applyBackwards, UNDO_LIMIT
  - **depends_on:** diff (structuredPatch, applyPatch); @telelean/core (FileChange)
- **path:** packages/runner/src/shadow/git.ts
  - **purpose:** ShadowGit: the run's private bare repository in `<runDir>/git/`, created with an empty template and driven by plumbing only in an isolated environment (every GIT_* variable dropped, GIT_CONFIG_GLOBAL=/dev/null, GIT_CONFIG_NOSYSTEM=1, no hooks, excludes, attributes or autocrlf). Each commit is a whole snapshot written in one `git fast-import` (deleteall plus inline blobs) on the single branch refs/heads/shadow; reads use log, ls-tree and cat-file --batch.
  - **key_exports:** ShadowGit, SHADOW_REF, SHADOW_GIT_CONFIG, shadowGitEnvironment, fastImportPath, GitOutput
  - **depends_on:** node:child_process; ./types.ts (ShadowLayoutError)
- **path:** packages/runner/src/shadow/index.ts
  - **purpose:** Public API of the run shadow (frozen M2 contract). createRunShadow validates runId, library and paths, refuses symlinks or special files in the user's model tree, creates `<runsDir>/<rootKey>/<runId>/` with copies of the given texts in ws/ and build/, optionally seeds build/.lake under runExclusive, initialises the bare repo and commits `base`; if creation fails it removes the run directory again. It also provides openRunShadow (recovery), listRunDirs, and pruneRunDirs (keeps the newest N and deletes only runs that ended or whose run.json cannot be read).
  - **key_exports:** createRunShadow, openRunShadow, listRunDirs, pruneRunDirs, rootKeyOf (folder name + sha1 of the absolute root; not the same as workspace/git.ts rootKeyOf), BASE_COMMIT_LABEL; re-exports the types, the path helpers, commitMessage, parseCommitMessage, scanTree, shadowPaths, SHADOW_COMMIT_KINDS and SHADOW_REF
  - **depends_on:** ./git.ts, ./paths.ts, ./seed.ts, ./types.ts, ./workspace.ts; ../lean/leanNames.ts (isValidModuleName); ../semantic (runExclusive); @telelean/core (TERMINAL_RUN_STATES)
- **path:** packages/runner/src/shadow/paths.ts
  - **purpose:** Rules for which paths may enter a shadow (D-24): safe root-relative POSIX paths (no dot segments, backslashes or control characters), Lean model files of the library, and the four project config files at the root. It also derives a module name from a model file path.
  - **key_exports:** isSafeRelativePath, isLeanModelPath, isModelPath, moduleNameOf, PROJECT_CONFIG_FILES (re-export)
  - **depends_on:** ../lean/leanNames.ts (isValidModuleName); ../lean/shadow.ts (PROJECT_CONFIG_FILES)
- **path:** packages/runner/src/shadow/seed.ts
  - **purpose:** Optional seeding of a run's build mirror from the user's `.lake/build`, only when telelean.run.reuseLeanBuild is on (off by default). noteRefreshOutput runs inside the board's refresh job and records a stat listing (device, inode, size, mtime, ctime) only after an `ok` refresh with every module fresh, and only if the tree looks complete (outputs present, no artifact newer than its trace, no lock or recent temp file). seedFromRefreshOutput copies the tree only if it still matches that record before, during and after the copy; otherwise it seeds nothing and reports why.
  - **key_exports:** noteRefreshOutput, seedFromRefreshOutput, artifactNewerThanTrace, STALE_TEMP_MS, SeedHooks
  - **depends_on:** node:fs; ./types.ts (BuildSeedOutcome); @telelean/core (LeanFacts type). Called from workspace/modelWorkspace.ts and shadow/index.ts
- **path:** packages/runner/src/shadow/types.ts
  - **purpose:** The frozen M2 contract of the shadow: the run-directory layout (ShadowPaths), the commit kinds and PASSING_COMMIT_KINDS (gate-pass, freeze and base mark 'the last state that passed'), CreateShadowOptions, the ShadowLayoutError codes, BuildSeedOutcome, the ShadowWorkspace interface and RunDirInfo. Its layout comment says git/ uses ws/ as its work tree and that scratch/ holds scratch Lean projects; in the code git/ is a bare fast-import repository, and scratch/ is created but never written.
  - **key_exports:** ShadowPaths, ShadowCommitKind, PASSING_COMMIT_KINDS, ShadowCommit, CreateShadowOptions, ShadowErrorCode, ShadowLayoutError, BuildSeedOutcome, ShadowWorkspace, RunDirInfo
  - **depends_on:** @telelean/core (FileChange)
- **path:** packages/runner/src/shadow/workspace.ts
  - **purpose:** RunShadow, the ShadowWorkspace of one run directory. It reads ws/ with an lstat walk that fails closed on symlinks, special files and dot-entries; computes changes against any commit; syncs build/ to exactly the model files of ws/ by comparing contents; and makes telelean's own writes only after checking each file's `before`. It also commits, lists and reads typed commits (with a tree cache) and reverts ws/ to a commit (also removing those unusual entries); writes happen one at a time.
  - **key_exports:** RunShadow, RunShadowInit, shadowPaths, scanTree, TreeScan, UnusualEntry, unusualEntriesError, commitMessage, parseCommitMessage, SHADOW_COMMIT_KINDS
  - **depends_on:** ./git.ts (ShadowGit), ./paths.ts (isModelPath), ./types.ts
- **path:** packages/runner/src/gate/engine.ts
  - **purpose:** The LeanCheckEngine implementation:
- checkBase builds the user's base files and keeps B's facts in base-facts.json.
- check runs the G0 text rules (core checkFileChanges) before any Lean; then it syncs the mirror, refreshes build/ once, and runs core evaluateRules on the current state against B, the newest adopt commit and the round start. Build errors always fail the check.
- freeze computes the permitted axioms and the frozen snapshot, builds the comparator challenge in frozen/<n> without the target's `.holds` and the declarations that use it (transitively), and only then commits `freeze`.
- normalise rewrites new statements in core's form and commits them.
- gate judges one committed state; for `proved` it also runs the G4 lake comparator in gate/<n>.
- checkGhost and renderStatements feed a scratch source on stdin to `lake env lean --stdin --json`.
Every Lean job goes through semantic.runExclusive behind a memory check, and failures come back as budget findings or environment outcomes, not as exceptions.
  - **key_exports:** createEngine, BASE_FACTS_FILE, CHALLENGE_MODULE_NAME, filesKey, projectModulesOf, removalClosure
  - **depends_on:** ./findings.ts, ./scratch.ts, ./types.ts; ../lean (comparator: freezeChallenge, runComparator, holdsTarget; footprint: parseLeanJsonMessages; runLean; toolchain); ../semantic (refreshLeanFacts, runExclusive, readMemAvailableBytes, sha256Text, spawnMemoryMax); ../shadow (paths, types, scanTree); @telelean/core (checkFileChanges, evaluateRules, computePermittedAxioms, frozenSnapshot, normalisationChanges, ghostTextProblems, model builders, holdsName, SORRY_AXIOM)
- **path:** packages/runner/src/gate/findings.ts
  - **purpose:** Pure mappings that never run Lean: facts statuses to ok, budget or environment outcomes; comparator verdicts to G4 `comparator-*` findings (or environment/budget); Lean build messages to whole-message diagnostics and G1 `build` findings. It also writes the budget, not-frozen and working-copy-unusable sentences.
  - **key_exports:** COMPARATOR_FINDING_CODES, budgetFinding, environmentMessage, classifyFacts, FactsOutcome, layoutEnvironment, messageLocation, diagnosticsOf, buildErrorFindings, comparatorFindings, ComparatorOutcome, notFrozenFinding
  - **depends_on:** @telelean/core types; ../lean/comparator.ts (ComparatorVerdict, RejectionReason types); ../shadow/types.ts; ./types.ts
- **path:** packages/runner/src/gate/index.ts
  - **purpose:** Public entry point of the gate module (frozen M2 contract): createLeanCheckEngine, plus re-exports of the types, the engine helpers, the findings mappers and the scratch-file helpers.
  - **key_exports:** createLeanCheckEngine; re-exports from engine.ts (BASE_FACTS_FILE, CHALLENGE_MODULE_NAME, filesKey, projectModulesOf, removalClosure), findings.ts, scratch.ts and types.ts
  - **depends_on:** ./engine.ts, ./findings.ts, ./scratch.ts, ./types.ts
- **path:** packages/runner/src/gate/scratch.ts
  - **purpose:** Pure generation and parsing of telelean's scratch Lean sources. The ghost check pins Claude's statement as `abbrev telelean_ghost_stmt : Prop := <statement>`, followed by `theorem telelean_ghost_check : telelean_ghost_stmt → <target> := <proof>` and `#print axioms`; Lean errors are attributed by line. The review's statement renderings are `#print` with default and with fully explicit pp options.
  - **key_exports:** GHOST_STATEMENT_NAME, GHOST_CHECK_NAME, GHOST_NEEDS_FREEZE, collapseWhitespace, ghostScratchSource, GhostScratch, parseNamedAxiomsMessage, readGhostScratch, GhostScratchResult, EXPLICIT_OPTIONS, renderScratchSource, RenderScratch, readRenderScratch
  - **depends_on:** ../lean/leanNames.ts (assertModuleName, formatDeclName); ../lean/footprint.ts (LeanMessage type); ./types.ts (RenderedStatement)
- **path:** packages/runner/src/gate/types.ts
  - **purpose:** The frozen M2 contract of the engine: LeanJobSettings, CheckContext (shadow, selection, stage, round, freeze, baseCommit, roundStartCommit, teleleanBlocks), CheckReport, FreezeRecord and FreezeOutcome, GateReport, the ghost-check input and result, RenderedStatement, the LeanCheckEngine interface and the EngineCore test hook. Its header is partly stale: it shows the ghost theorem without the pinning abbrev, and a freeze order (commit before the challenge, only `.holds` removed) that engine.ts no longer follows.
  - **key_exports:** LeanJobSettings, CheckContext, LeanDiagnosticView, CheckReport, FreezeRecord, FreezeOutcome, GateReport, GhostCheckInput, GhostCheck, RenderedStatement, LeanCheckEngine, EngineCore, LeanCheckEngineOptions
  - **depends_on:** @telelean/core types; ../lean/comparator.ts, ../lean/systemd.ts, ../lean/toolchain.ts (types); ../llm/types.ts (FinishStatus); ../shadow/types.ts; ../semantic/types.ts (RefreshRequest)
- **path:** packages/runner/src/run/backend.ts
  - **purpose:** The Claude backend factory. It first applies the quota tripwire: with TELELEAN_NO_REAL_CLAUDE=1 it refuses before any lookup unless a test supplies both a scratch home and PATH. Otherwise it resolves the user's Claude Code binary (setting, then VS Code extension, PATH, ~/.local/bin, with a version check) and builds a ClaudeCliBackend with the guard script, hook runtime, client app and an absolute `setpriv --pdeathsig KILL --` launcher; this is the one code path in scope that would touch the real CLI, and it has not been walked through yet.
  - **key_exports:** createClaudeBackendImpl, setprivLauncher, PDEATHSIG_ARGS
  - **depends_on:** ../llm/binary.ts (resolveClaudeBinary), ../llm/claudeCli.ts (ClaudeCliBackend, realClaudeDisabled, NO_REAL_CLAUDE_ENV), ../llm/confinement.ts (defaultHookRuntime), ../llm/types.ts (LlmHarnessError), ../lean/systemd.ts (findSystemExecutable); ./types.ts
- **path:** packages/runner/src/run/index.ts
  - **purpose:** Public entry point of the run module (frozen M2 contract). It defines DEFAULT_RUN_SETTINGS (model claude-opus-5-5, effort high, core's DEFAULT_RUN_CAPS of 80 turns, 25 checks, 20 agent minutes, 120 s per Lean job and 3 gate attempts, a 4G memory cap, a 2 GiB memory guard, contextScope subject, keepRuns 10, reuseLeanBuild false). It also provides thin wrappers createRunManager, createClaudeBackend, runPreflight, buildSystemPrompt and buildContextBundle, plus re-exports of helpers.
  - **key_exports:** DEFAULT_RUN_SETTINGS, createRunManager, createClaudeBackend, runPreflight, buildSystemPrompt, buildContextBundle; re-exports adoptionTurn, budgetText, collapseWhitespace, feedbackTurn, NUDGE_TURN, resumeTurn, shortNames, condenseRateLimit, ENVIRONMENT_RETRY_MS, gateCheckOf, localTime, rateLimitNotice, validateAnswers, verdictOfStatus, missingWorkspaceMembers, PDEATHSIG_ARGS, setprivLauncher, readPersistedRun, scanRuns, ScannedRun and everything in ./types.ts
  - **depends_on:** ./backend.ts, ./manager.ts, ./preflight.ts, ./prompts.ts, ./persist.ts, ./types.ts; @telelean/core (DEFAULT_RUN_CAPS)
- **path:** packages/runner/src/run/manager.ts
  - **purpose:** RunManagerImpl: one per model root, with at most one active run. It owns:
- the run state machine and the LLM session.
- the AgentToolHost: check_lean, freeze_statements, ask_user, propose_assumption, finish.
- the caps: turns counted from usage events, checks, the agent-active clock and gate attempts.
- the A2 gate loop: a failed attempt is retried with the exact failures; after the last attempt it gives up and reverts to the last passing commit. An environment outcome is retried once after 30 s.
- the end-of-round proposal, Feedback and ghost-adoption rounds.
- Accept, including the rebase, re-freeze and re-gate when the user's files changed during the run.
- Cancel, Discard, Dismiss and Resume.
- the decisions and attempts sidecars, run.json and transcript persistence, recovery and dispose.
It never runs Lean itself. It writes the user's files only through workspace.perform (set-premises) and ProposalService.apply.
  - **key_exports:** createRunManagerImpl, gateCheckOf, verdictOfStatus, condenseRateLimit, localTime, rateLimitNotice, validateAnswers, ENVIRONMENT_RETRY_MS
  - **depends_on:** ./persist.ts, ./preflight.ts, ./prompts.ts, ./types.ts; ../gate/types.ts; ../shadow (createRunShadow, openRunShadow, pruneRunDirs, PASSING_COMMIT_KINDS); ../llm (types, toolSchemas renderAnswersAsUserTurn); ../lean/runLean.ts (cancelRun); @telelean/core (attemptNotice, describeFinding, planGhostAdoption, proposalLabel, decisionsInForce, parseLeanFile, buildProjectModel, run/attempt/decision types)
- **path:** packages/runner/src/run/persist.ts
  - **purpose:** Run persistence: atomic run.json writes (temp file plus rename, async and sync), PersistedRun validation and reading, and scanRuns (a root's run directories whose run.json is readable and matches the root, newest first). RunFiles is the per-run writer that serialises run.json snapshots and transcript.jsonl lines; its close() makes the final write on dispose, first synchronously and then again after any write still in flight.
  - **key_exports:** writeJsonAtomic, writeTextAtomic, writeTextAtomicSync, isPersistedRun, readPersistedRun, ScannedRun, scanRuns, nonTerminal, RunFiles
  - **depends_on:** ../shadow/index.ts (rootKeyOf); ./types.ts; @telelean/core (isTerminalRunState)
- **path:** packages/runner/src/run/preflight.ts
  - **purpose:** The checks that run before anything is created or sent, in this order: busy (another active run of the root); the subject loads; selection (the target is a GOAL or DERIVATION card of the subject, every premise is a card, the target is not a premise); the workspace has the M2 members; toolchain (pinned leanprover/lean4:v4.35.0, a lakefile, a manifest with no packages); the Lean sandbox is available (lean.checkSandboxSupport); the memory guard. Each refusal is one plain sentence.
  - **key_exports:** preflight, missingWorkspaceMembers
  - **depends_on:** ../lean/runLean.ts (checkSandboxSupport); ../semantic (readMemAvailableBytes); ../workspace/types.ts; ./types.ts; @telelean/core (PINNED_TOOLCHAIN_NAME)
- **path:** packages/runner/src/run/prompts.ts
  - **purpose:** Pure renderers of what is sent to Claude apart from the system prompt. The first-turn context bundle lists the subject folder, TARGET, SELECTED PREMISES with their Lean and status, OTHER CARDS (the whole subject, or only the neighbourhood), VOCABULARY, EARLIER ANSWERS IN FORCE and BUDGET. The later turns are feedback, adoption, resume and the nudge to call finish.
  - **key_exports:** renderContextBundle, feedbackTurn, adoptionTurn, AdoptedGhostTurnInput, resumeTurn, NUDGE_TURN, budgetText, minutesText, agentMinutes, collapseWhitespace, shortNames, SYSTEM_PROMPT (re-export)
  - **depends_on:** ./systemPrompt.ts; ./types.ts (ContextBundleInput); @telelean/core (subjectDir, subjectRootFile, model and graph types)
- **path:** packages/runner/src/run/systemPrompt.ts
  - **purpose:** The static system prompt of every run: section 5.1 of docs/m2-plan.md, verbatim (tests compare it with a fixture). It is byte-identical across runs so the CLI's prompt cache is reused. It explains the card markup, the workflow (ask_user, formalise, check_lean, freeze_statements, prove, finish or propose_assumption) and the rules the gate checks.
  - **key_exports:** SYSTEM_PROMPT
  - **depends_on:** none
- **path:** packages/runner/src/run/types.ts
  - **purpose:** The frozen M2 contract of the run controller: RunSettings, RunCore, RunServices (injectable backend or backend factory, engine, proposals, sidecars, shadow/preflight hooks, clock, cancelLean), RunManagerOptions, RunStartRequest, the RunManager interface, the preflight types, ClaudeBackendSettings, ContextBundleInput, and the run.json format (PersistedRun, PersistedGhost). It also contains a compile-time check that core's and llm's Phenomenon lists are identical.
  - **key_exports:** PhenomenaDriftCheck, RunSettings, RunCore, RunServices, RunManagerOptions, RunStartRequest, RunChange, RunManager, PreflightInput, PreflightProblem, PreflightOutcome, ClaudeBackendSettings, ContextBundleInput, PERSISTED_RUN_FORMAT, PersistedGhost, PersistedRun
  - **depends_on:** @telelean/core types; ../gate/types.ts; ../llm (types, binary, confinement); ../proposal/types.ts; ../shadow/types.ts; ../workspace/types.ts
- **path:** packages/runner/src/proposal/files.ts
  - **purpose:** Pure helpers for proposals and Accept. It filters file maps to model and project files, computes whole-file diffs and line counts (ProposalFile), and merges one file 3 ways: Claude's base-to-shown `diff` patch, with exactly 3 context lines, is applied to the user's real text with no fuzz, and clashing creates or deletes are conflicts. It also writes the conflict sentence.
  - **key_exports:** MERGE_CONTEXT_LINES, shadowFilesOf, diffFileMaps, lineCounts, proposalFileOf, MergeResult, mergeFile, listing, conflictMessage
  - **depends_on:** diff (structuredPatch, applyPatch); ../workspace/files.ts (isModelOrProjectFile); @telelean/core types
- **path:** packages/runner/src/proposal/index.ts
  - **purpose:** Public entry point of the proposal module (frozen M2 contract): the createProposalService and createRunSidecarStore factories, each with an optional `core` test hook, plus re-exports of types and constants.
  - **key_exports:** createProposalService, createRunSidecarStore, MERGE_CONTEXT_LINES, PROPOSAL_FACTS_FILE, PROVED_GOAL_REASON, everything in ./types.ts
  - **depends_on:** ./service.ts, ./sidecarStore.ts, ./files.ts, ./types.ts
- **path:** packages/runner/src/proposal/service.ts
  - **purpose:** ProposalServiceImpl. build parses ws/ with the check's facts into a proposed subject graph (keeping the board's column order) and diffs it against the current board. It assembles changed files, statement reviews (new or changed against B, Lean-rendered or source text), new pure-signature vocabulary, definition questions, the GOAL->DERIVATION lifecycle item l1 for a proved goal, ghosts and the report card, and keeps the facts in memory and in proposal-facts.json. It also implements baseDrift, planAccept (3-way merge or exactly the re-gated shownState, then lifecycle edits, as changes against the real files), apply (workspace.applyChanges with `accept-proposal`) and diffFiles.
  - **key_exports:** ProposalServiceImpl, PROVED_GOAL_REASON, PROPOSAL_FACTS_FILE
  - **depends_on:** ./files.ts, ./types.ts; ../workspace/files.ts (isModelFile, isModelOrProjectFile, listModelFiles, PROJECT_FILES); ../workspace/semanticSummary.ts (summarize); ../shadow/types.ts; @telelean/core (diffGraphs, lifecycleChanges, proposalLabel, subjectGraph, buildProjectModel, parseLeanFile, ACCEPT_PROPOSAL_ACTION)
- **path:** packages/runner/src/proposal/sidecarStore.ts
  - **purpose:** DiskSidecarStore for `.telelean/subjects/<S>/attempts.jsonl` and decisions.json. An attempts line is appended with one write on an O_APPEND file handle (adding a missing final newline first); decisions.json is replaced atomically (temp file in `.telelean/`, fsync, rename); each file has its own write queue within the process. Reads go through core's codecs, and neither file passes through the EditApplier, history or undo.
  - **key_exports:** DiskSidecarStore
  - **depends_on:** ./types.ts; @telelean/core (parseAttemptLines, serializeAttemptLine, summariseAttempts, parseDecisionsFile, serializeDecisionsFile, addDecisions, attemptsPath, decisionsPath, isSubjectName, TELELEAN_DIR)
- **path:** packages/runner/src/proposal/types.ts
  - **purpose:** The frozen M2 contract for proposals and sidecars: ProposalBuildInput, AcceptRequest (shownState, realFiles, facts, premises), AcceptPlan, ProposalService, the ProposalCore and SidecarCore test hooks, and RunSidecarStore. AcceptRequest says the re-gate's facts and the real file list should be passed, but the RunManager passes neither, so the service falls back to the facts kept at build time and a disk listing.
  - **key_exports:** ReadRealText, ProposalBuildInput, AcceptRequest, AcceptPlan, ProposalService, ProposalCore, SidecarCore, RunSidecarStore
  - **depends_on:** @telelean/core types; ../gate/types.ts; ../llm/types.ts (FinishArgs); ../shadow/types.ts; ../workspace/types.ts

