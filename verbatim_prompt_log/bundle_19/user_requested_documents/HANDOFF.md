# telelean: hand-off for a new session on a new machine (2026-11-17)

Written at the user's request in turn 19, on moving to another machine. It is for the next Claude session and for the user: what exists, what state things are in, what is unfinished, how to set up, and the user's standing instructions.

## 1. What telelean is

A VS Code extension, a personal-use prototype. It shows a mental model as a board of ASSUMPTION / DERIVATION / GOAL cards in three columns, backed by Lean 4 files: cards are `@@ telelean` blocks in Lean comments. "These suffice" asks Claude, through the user's own Claude Code CLI, to formalise the selected cards and prove the goal from them. A non-LLM gate (Lean build, `#print axioms` footprints, `lake comparator` and rule checks) decides whether the result counts. The original spec is `verbatim_prompt_log/bundle_1/prompt1.md`.

## 2. Read first

1. `docs/DEMO.md`: how to run the demo. It is current.
2. `docs/project-report.md`: architecture, features and the Lean system (Part 3 is the theory). **Partly outdated:** it was written on 2026-11-02, before the real-Claude runs and the Nov 10 fixes (see §5).
3. `docs/m2-live-report.md`: the real-Claude results of Nov 10. It may be incomplete (see §5).
4. `docs/design-amendments.md`: the user's amendments, which override the original design in `bundle_1/user_requested_documents/02_*` and `03_*`.
5. `docs/decisions-log.md`: every minor decision. Its top section, "Decisions awaiting you", holds one open question: where "Raw Lean diff…" should open.
6. `docs/user-guide.md`, `docs/m1-plan.md`, `docs/m2-plan.md`.
7. `verbatim_prompt_log/bundle_*`: every turn's prompt, replies, documents and agent reports. The latest are bundles 13–19.

## 3. Status

- **M1, the board without AI:** done and verified.
- **M2, "These suffice":** done.
  - **Gate verification:** with a fake backend, 22+ cheat variants were refused.
  - **Real-Claude walkthrough** (Opus 5.5, high effort, Claude Code 2.1.322), on the Spyro sample:

    | Reading | Outcome | Requests | Cost estimate | Time |
    |---|---|---|---|---|
    | Normative | proved | 8 | $0.18 | 46 s |
    | Literal | not proved → suggested premise adopted → proved | 11 | $0.16 | 61 s |

  - **Live demo** through the real UI in the user's snap VS Code 1.145.2, on a fresh folder with typed cards:

    | Example | Outcome | Requests | Cost estimate |
    |---|---|---|---|
    | Socrates | proved | 6 | $0.14 |
    | Penguin | not proved → "All penguins are birds" adopted → proved | 10 | $0.14 |

- **Not started:** M3 (model finder: consistency and countermodels; full review; DECISION cards), M4 (Lean-editor integration, CLI), H (hardening).

## 4. Repository state (on the old machine, at hand-off)

- **HEAD:** `98000b7` "initial generation", the user's commit of 2026-11-05.
- **Staged by the user (not by Claude):** about 116 entries, including the Nov 10 code changes and bundles 10–15.
- **Unstaged:**
  - **Partial docs edits** by two docs agents the user stopped (turn 19), in `docs/{DEMO,m2-live-report,m2-plan,project-report-files,project-report,user-guide}.md`, about 49 lines added and 26 removed. See them with `git diff -- docs`. Keep or discard them as you like: `git restore docs/<file>` returns a file to its staged version.
  - **Untracked:** `.gitignore` and `.node-version` (from turn 2; they should probably be committed: `.gitignore` excludes `node_modules`, `dist`, `.vscode-test`, `.lake`, `test-results`), plus the bundles 16–19 files.
- **The user is about to edit the source** themselves.

## 5. Unfinished work

1. **Modifications audit,** requested in turn 9.
   - The disk view is done (`bundle_15/user_requested_documents/01_modifications_audit_disk_view.md`). The transcript view and the reconciliation are not.
   - How to continue: `bundle_18/user_requested_documents/CONTINUE_AUDIT.md`.
   - **It depends on the old machine's `~/.claude` session records,** so it must be finished there, or those files copied over first.
2. **Docs update for the Nov 10 changes,** stopped part-way.
   - **To do:** finish `docs/m2-live-report.md`, and bring `project-report.md`, `project-report-files.md`, `user-guide.md`, `decisions-log.md` and `m2-plan.md` §12 in line with the code.
   - **The Nov 10 changes:**
     - facts for declarations missing from Lean's `.ilean` index;
     - Accept's merge exception for cards added during a run;
     - clearer findings for a blank line between a card and its statement;
     - system-prompt updates;
     - the bwrap user-namespace preflight probe;
     - conflict-advice wording;
     - the demo driver, `npm run demo`, `npm run test:smoke:snap`, and `test-fixtures/fresh`.
   - The demo-readiness agents' reports are in `bundle_13/subagent_reports/demo_readiness_workflow/`.
3. **Known theory gaps** (report §3.7), not fixed:
   - **The pre-freeze instance blind spot:** an instance added before the freeze can change how the user's unchanged statements elaborate, while the printed output stays the same.
   - **The user's proofs are unprotected before the freeze:** Claude can delete one, or turn it into an axiom, before freezing.
   - **The signature admits the user's own shape-violating vocabulary,** and non-Prop axioms at the library root.
   - **Claude's earlier-round formalisations** are unprotected after Feedback.
   - **Faithfulness is checked only by the user's review,** and premise consistency is unchecked (M3).
4. **The open decision** on where the raw diff opens.

## 6. Setting up on a new machine

- **Node 24.22.2** (npm 11.19.1). Turn 2 used a user-local tarball in `~/.local/opt`, with links in `~/.local/bin`; the command is in `bundle_1/user_requested_documents/03_architecture.md` §12. Then run `npm ci` at the repo root. All packages are pinned in `package-lock.json`, and the Claude Agent SDK is deliberately not used.
- **Lean:** elan with toolchain `leanprover/lean4:v4.35.0`, and no Mathlib. telelean calls the toolchain binaries directly, never the elan proxies.
- **Sandbox:** `bwrap` (bubblewrap), a systemd user manager (`systemd-run --user`) and `setpriv`. On Ubuntu 24.04, `kernel.apparmor_restrict_unprivileged_userns=1` blocks bwrap's user namespace except under a permissive AppArmor label. The snap VS Code has such a label; a plain terminal does not. So either run telelean and its tests from the snap VS Code, or add an AppArmor profile for bwrap. The run preflight now says so plainly.
- **Tests:**
  - `xvfb` for headless VS Code tests (`xvfb-run`);
  - Google Chrome for Playwright (channel `chrome`; no Playwright browser download);
  - the VS Code test build, about 1 GB, downloads automatically into `packages/extension/.vscode-test`.
- **Claude:** the VS Code Claude Code extension, logged in with the claude.ai subscription. telelean finds `~/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude` itself (minimum version 2.1.295); `telelean.claude.path` overrides it.
- **Build and install:** `npm run build`, then in VS Code **Developer: Install Extension from Location…** → `packages/extension`. Open demo folders in a **new window**, and **trust** the folder: telelean is disabled in Restricted Mode.
- **Running tests:**
  - per package: `cd packages/<pkg> && npm test`;
  - the runner's full suite takes about 14 min with real Lean;
  - the extension suites run under xvfb, and `npm run test:smoke:snap` runs them in the snap VS Code;
  - every test runs with `TELELEAN_NO_REAL_CLAUDE=1`.
- **Scripts that use real Claude, and therefore quota:**
  - `scripts/walkthrough-claude.mjs --live`, with `TELELEAN_WALKTHROUGH_LIVE=yes`;
  - `packages/extension/scripts/demo-driver.mjs --live`, with `TELELEAN_DEMO_LIVE=yes`;
  - `scripts/smoke-claude.mjs --live`, with `TELELEAN_SMOKE_LIVE=yes`.

  Without the flag and its switch, each one is dry or refuses.

## 7. Not carried over by git (machine-local)

- **Claude's memory notes:** a snapshot is in `memory_snapshot/` next to this file. Copy them into the new machine's Claude memory folder for this project to restore them. `user-profile.md` contains the user's name and interests; remove it before publishing the repo, if that matters.
- **Claude Code's session records** (`~/.claude/projects/-home-zhengyew-telelean/…`, about 220 MB): the agents' reports are already copied into the bundles.
- **Generated artifacts:** `node_modules` (`npm ci`), `.vscode-test` (downloaded again), `dist/` (`npm run build`).
- **The user's own demo folder,** `~/telelean-demo`.

## 8. The user's standing instructions (apply in the new session)

- **Logging.**
  - Each user turn gets `verbatim_prompt_log/bundle_N/`, holding:
    - `promptN.md` (verbatim);
    - `promptN_midturn.md` (messages sent mid-turn);
    - `responseN.md` (the final reply, verbatim, taken from the transcript);
    - `responseN_interim.md`;
    - `responseN_modelinfo.md`;
    - `user_requested_documents/`;
    - `subagent_reports/`, with every agent's full report.
  - Files belong inside bundles, never loose. If the user says to skip logging, catch up when allowed.
- **Safety.**
  - Never push, publish, upload or send anything to anyone, and pass these rules to every subagent.
  - Never change git state in the user's repo, which has staged work.
  - Tests must never call real Claude.
  - Announce the quota amount and purpose just before any real-Claude run.
- **RAM.** The old machine crashed from RAM exhaustion once. Watch available memory during heavy work, run one heavy process at a time, and kill only your own processes.
- **Scope.** A personal prototype: keep the proof-integrity checks, defer adversarial hardening (H), and explain relevance plainly.
- **Ledger.** The user wants an exhaustive, verified account of downloads, installs and writes outside the repo.
- **Communication.** The user has a formal-methods background and an interest in linguistic pragmatics; explain at that level. They are not yet familiar with some formalisms (e.g. Ramsey sentences) and prefer to learn them from the working product. Raise significant design decisions instead of choosing silently.
