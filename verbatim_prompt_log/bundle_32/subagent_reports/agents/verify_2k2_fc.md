# verify:2k2:fc

Agent `a14a26d8712d506fb` of workflow `wf_3e2a0475-ada`. Verbatim output (JSON alongside).

- **summary:** No blockers. 2k2 does what DESIGN U1-U5 and REQUIREMENTS R1-R9 ask, with three deviations that the builder marked FOR THE USER and that I judge sound. Typechecks and all unit suites I ran pass. I found one major problem (known to the builder, outside its write area) and a few minor ones.

**Deviations from the user's wording (marked FOR THE USER):**
- D2-118: the runs folder's `.gitignore` is `/*`, not `*`. I checked this with VS Code's bundled ripgrep 15.0.0 inside a real git repository. A bare `*` hides all of ws/ from `rg --hidden` run from ws/ (no output, exit 1). `/*` still finds the file, with the model's own `/.telelean/runs/` line present as well. The deviation is correct.
- D2-111: a held moved run shows Stop, not "Exit session". Exit is still accepted through the API.
- D2-114 and D2-117 are kept as plan entries.

**Fidelity:** I found no sentence stating the old rule in the plan or user guide. Stale statements remain only in the findings below.

**Behaviour I checked against the code:**
- The runs folder is `runsDirOf(root)`, and recovery and pruning read only that folder.
- A held run records nothing in this folder (no attempt records, no decisions, no model file writes) and refuses every action except Stop and Exit.
- Pruning counts only run folders.
- The consent is an exact-text file, and `reset()` removes it.
- The watcher ignores `.telelean/runs/`, and every directory scan skips dot-directories.
- The path guard's hidden-segment rule is applied relative to ws/.
- No bwrap bind covers the model folder, and the board's in-place build masks `.telelean/runs`.
- `GIT_` variables are stripped and the git ceiling is set.

**Probe I wrote (scratch, not in the repo):** I copied the builder's held-session test and fired a workspace change with drift. The held run's `run.json` was rewritten with a `drift` record, which contradicts D2-111's "run.json untouched" (finding F2).

**Unrun suites:** the builder reports them correctly (VS Code suites, smoke and demo scripts, 38 of the 78 runner test files, other Playwright specs).
- **findings:**
  - [1]
    - **id:** F1
    - **severity:** major
    - **where:** scripts/walkthrough-claude.mjs:371 (also 231 and 262)
    - **problem:** The real-Claude walkthrough script still calls `runner.shadow.rootKeyOf(root)`, which 2k2 removed, and still passes a `runsDir` that is now ignored. After a live run, line 371 throws a TypeError before `manager.dispose()` and before the summary is written, so a quota-spending run would lose its summary. The builder already reported this as outside its write area, but it is unfixed. No test reaches the line (`walkthroughScript.test.ts` covers only refusals before anything runs).
    - **evidence:** `git grep rootKeyOf -- scripts` shows line 371. `shadow/index.ts` no longer exports `rootKeyOf`. Line 262 passes `runsDir` to `createRunManager`, where the option no longer exists.
    - **fix:** The orchestrator patches it before anyone runs the script: line 371 becomes `summary.transcript = path.join(root, '.telelean', 'runs', v.runId, 'session', 'transcript.jsonl')`, and the `runsDir` option on line 262 is dropped (line 231's variable can stay or go).
  - [2]
    - **id:** F2
    - **severity:** minor
    - **where:** packages/runner/src/run/sessionEnd.ts scheduleDrift / refreshDrift / recordDrift; manager.ts holdMoved; test/run/manager.lifecycle.test.ts (held-session test)
    - **problem:** A held (moved) session run is still `live` for the drift watcher. When a model file changes in the new folder, `workspace.onDidChange` leads to `refreshDrift` and `recordDrift`, which write `session.drift` and bump `viewVersion` into the held run's `run.json`. D2-111, §2.10 and the lifecycle test all state that the run's `run.json` stays untouched until Stop or Exit. No judge or Lean job runs, and the view stays null/interrupted, so the impact is low (a write inside the run's own folder). The test does not fire a workspace change, so it does not catch this.
    - **evidence:** My scratch probe (a copy of the held-session test, then `b.proposals.drift = ['Model/Spyro/Main.lean']; b.workspace.fire(); wait 900 ms`) printed `RUNJSON CHANGED: true drift in file: true engine calls: 0 session view: null`. The diff shows `"drift": {"files": ["Model/Spyro/Main.lean"], ...}` added to `run.json`. Probe file: /tmp/claude-1000/-home-zhengyew-telelean/3358448c-d9b7-4f38-afd0-3f73c08df70e/scratchpad/v2k2-fc/probe/drift.test.ts.
    - **fix:** Return early when `run.movedFrom !== undefined` in the `scheduleDrift` timer, in `refreshDrift` and in `recordDrift`. Add a lifecycle test that fires `b.workspace.fire()` with `b.proposals.drift` set on a held session and asserts `run.json` is byte-identical.
  - [3]
    - **id:** F3
    - **severity:** minor
    - **where:** packages/extension/package.json:166 (`telelean.run.keepRuns` markdownDescription)
    - **problem:** The Settings text still says finished runs are kept "in VS Code's storage for telelean". That is the old rule, and the user sees it in the Settings UI.
    - **evidence:** `git grep -n "storage for telelean"` finds it only in package.json. The package.json is not in the diff.
    - **fix:** Reword to "(their working copies and transcripts, in the model folder's `.telelean/runs/`)".
  - [4]
    - **id:** F4
    - **severity:** minor
    - **where:** docs/project-report.md:848 and docs/slice2-plan.md §2.10 D2-110 ("A copied or cloned model never carries it (git-ignored)")
    - **problem:** The wording overclaims. Git-ignoring keeps `consent.json` out of a clone, but a file-manager copy or `cp -r` of the folder carries it. The builder's own moved-run tests use `cpSync` of the whole folder, runs included. The user guide is accurate: "copied with a clone" and "its runs go with it". The user's U3 sentence ("so a copied or cloned model never carries it") is only met for git-based copies.
    - **evidence:** `ensureRunsDir` and `rememberConsent` write the file inside the folder. Nothing binds the consent to the folder's path.
    - **fix:** Reword both places to "a clone (anything that goes through git)". If the user wants U3 literally for plain copies too, record the folder's `root` in `consent.json` and require a match, as U4 does for runs. That would be a new decision to mark FOR THE USER.
  - [5]
    - **id:** F5
    - **severity:** minor
    - **where:** docs/project-report.md:433
    - **problem:** The list of what Initialize writes into an existing Lake project's `.gitignore` still names five lines. `GITIGNORE_LINES` now has six; `/.telelean/runs/` is missing from the list.
    - **evidence:** The doc line ends at `/.telelean/*.tmp`; `initialize.ts` line 40 has six entries.
    - **fix:** Add `/.telelean/runs/` to that list.
  - [6]
    - **id:** F6
    - **severity:** nit
    - **where:** docs/project-report-files.md fakeShadow.ts and webview model/run.ts rows; docs/slice2-plan.md §1 table row for 2k2; packages/extension/src/vscode/host.ts:458
    - **problem:** Small stale statements.
- The `fakeShadow.ts` row still lists the dependency `src/shadow (rootKeyOf, types)`; it now uses `ensureRunsDir`.
- The webview `model/run.ts` row lacks `panelNotices` and `panelSession`.
- The §1 row says "(runner, extension, docs)" although the webview changed (§1.1 says so correctly).
- The comment above `createRunManager` still says "Throws when runs are unavailable (no storage folder, ...)".
    - **evidence:** Direct reads of each place.
    - **fix:** Edit the four places.
  - [7]
    - **id:** F7
    - **severity:** nit
    - **where:** packages/extension/scripts/demo-vscode.mjs:411 (`settleUnits` calls `collectOwners(profile.userData)`)
    - **problem:** `collectOwners` now takes the model folders to read run ids from run folders. The demo's `settleUnits` was not updated. Run-id ownership of leftover systemd scopes now comes only from logs, while ownership by cwd/cmdline still works. Unrun script.
    - **evidence:** smoke.mjs was updated to pass roots; demo-vscode.mjs was not.
    - **fix:** Pass the demo folder: `collectOwners(profile.userData, [<demo model folder>])`.
  - [8]
    - **id:** F8
    - **severity:** nit
    - **where:** packages/runner/src/run/manager.ts recover (the root comparison, `path.resolve(p.root) !== path.resolve(this.o.root)`)
    - **problem:** The comparison is lexical. A model opened once through a symlinked path and once through its real path would show its own earlier session as "started in another folder", where before 2k2 it was silently not found. This is a plausible case for a symlinked ~/telelean-demos.
    - **evidence:** The code uses `path.resolve` only.
    - **fix:** Compare realpaths too (with a try/catch fallback to `path.resolve`) before holding the run.
  - [9]
    - **id:** F9
    - **severity:** nit
    - **where:** packages/runner/src/run/manager.ts current(), after `endMoved` on a held version-1 run
    - **problem:** D2-119 says a held run shows nothing of Claude's work, whatever its version. `current()` only masks a held run while it has not ended. After Stop, a v1 run's view is the full saved view again (activity, ghosts, notices, verdict). The test checks only the state. This is practically unreachable, because every new run is version 2 and older runs are not migrated (U5).
    - **evidence:** `current()` line 57: `run.movedFrom !== undefined && !run.ended`. A v1 run then returns `structuredClone(run.saved.view)`.
    - **fix:** Either also mask the ended view of a held v1 run (keep its terminal state, drop activity, ghosts, verdict and notices except the end notice), or say in D2-119 that the masking holds only until the run ends.
  - [10]
    - **id:** F10
    - **severity:** nit
    - **where:** packages/extension/src/vscode/host.ts reset() (`resetRoots`)
    - **problem:** Test mode `reset()` now forgets the consent of only the roots that are open or registered at that moment. Before 2k2 it cleared every consent key in `globalState`. A consent in a folder whose workspace was already forgotten (for example by `disposeWorkspace`) survives a reset. This could make the unrun VS Code suites order-dependent.
    - **evidence:** `new Set([...host.boards.keys(), ...host.registry.roots()])`.
    - **fix:** Accept and say so in the plan (D2-116), or have `reset()` also forget the roots seen since activation.
