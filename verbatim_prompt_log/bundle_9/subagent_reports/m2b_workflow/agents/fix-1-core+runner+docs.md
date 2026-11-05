# fix-1:core+runner+docs (agent a954ccd0c710f48de)

## summary
I fixed all 13 issues in my paths: 2 blockers, 4 majors, 7 minors. Runner tests ran twice and core tests on the final code, all with real Lean where it applies; everything passes. I also rebuilt the repo.

Gate fixes (core):
- **P1/P6b, axiom below a selected premise card.** An axiom placed directly below the block of a selected Goal or Derivation card was taken as that card's statement and escaped every rule. Now, before the freeze, any new axiom is refused unless it is the `.holds` of a selected assumption or adopted ghost, or vocabulary not attached to any card. This holds whatever the axiom's type.
- **Permitted set.** The signature no longer admits an axiom attached to a card, or vocabulary of kind `other`.
- **Malformed statements.** In every check, a selected card of any type that Claude attached in this run to something other than a Prop statement is reported as `not-formalised`.
- **P2, circular permitted set.** `computePermittedAxioms` and `frozenSnapshot` take an optional B (the user's files at run start or at Accept). With B, a derivation's footprint counts only for a proof the user already had, unchanged. The engine's freeze and the not-proved check both pass B, so a proof Claude writes for a selected premise can no longer widen the set it is judged against, in that round or after Feedback.
- **P12, private declarations.** A declaration added in the run that Lean reports nothing about (e.g. `private`) is now a footprint finding instead of being skipped.

Literal walkthrough (TL107 after Accept): "I hold this" now also appends the adopted card to the target's `premises:` line, in the same change that writes the card. The markup rule accepts exactly that line as telelean wrote it. The change shows in the raw diff and Undo reverts it with the rest of the Accept.

Runner wording and lifecycle:
- An Accept that changes no file now says "Recorded: … (no file changed)." with no Undo hint.
- A run with no premises gets the label "Self-evident? → …".
- The usage-limit notice is worded like the status line, in local time (e.g. "Close to your plan's usage limit (five-hour window, 83% used); resets at 00:45.").
- Stop on an interrupted run says "Run stopped".
- Closing the window (`dispose()`) now cancels the run's running Lean jobs.

Safety:
- `scripts/smoke-claude.mjs` is dry by default. It goes live only with `--live` plus `TELELEAN_SMOKE_LIVE=yes`, decided before anything loads, and sets `TELELEAN_NO_REAL_CLAUDE=1` for itself otherwise. A new refusal test covers this.
- The quota tripwire is now armed by any value except empty, 0 or false.
- `createClaudeBackend` only skips the tripwire when a test gives both a scratch home and a scratch PATH.
- `startSession` only runs a .mjs/.js test double inside a `test/**/fixtures` folder.
- The test that ran your real Claude binary (`--version`) on every suite run now runs only with `TELELEAN_ALLOW_REAL_CLAUDE_VERSION=1`.
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` is now passed through to runs.

Tests and docs: there are core regression tests for each case. Four new end-to-end cheat scripts with real Lean cover a selected Goal premise (freeze refused; a belief added after the freeze) and a selected Derivation premise. A fourth covers a private lemma. The literal end-to-end and m2flow tests now check there is no TL107 or mismatch after Accept. The user guide (sections 10.3, 10.6, 10.8–10.12), the plan (3.2, 3.3, 4.9, 10.3, 10.4, section 14) and the decisions log (new section 27) are updated.

I also re-ran the verifier's own probes (P1, P2, P6b, P11, P12) with real Lean: every cheat is now caught and none reaches your files.

## files_changed
- /home/zhengyew/telelean/packages/core/src/gate/permitted.ts
- /home/zhengyew/telelean/packages/core/src/gate/rules.ts
- /home/zhengyew/telelean/packages/core/src/gate/index.ts
- /home/zhengyew/telelean/packages/core/src/gate/types.ts
- /home/zhengyew/telelean/packages/core/src/gate/describe.ts
- /home/zhengyew/telelean/packages/core/src/gate/adoption.ts
- /home/zhengyew/telelean/packages/core/src/proposal/index.ts
- /home/zhengyew/telelean/packages/core/src/proposal/sidecars.ts
- /home/zhengyew/telelean/packages/core/src/run.ts
- /home/zhengyew/telelean/packages/core/test/gate/premiseCheats.test.ts
- /home/zhengyew/telelean/packages/core/test/gate/adoption.test.ts
- /home/zhengyew/telelean/packages/core/test/gate/realFacts.test.ts
- /home/zhengyew/telelean/packages/core/test/proposal/diff.test.ts
- /home/zhengyew/telelean/packages/core/test/proposal/codecs.test.ts
- /home/zhengyew/telelean/packages/core/dist/** (rebuilt by tsc)
- /home/zhengyew/telelean/packages/runner/src/gate/types.ts
- /home/zhengyew/telelean/packages/runner/src/gate/engine.ts
- /home/zhengyew/telelean/packages/runner/src/run/manager.ts
- /home/zhengyew/telelean/packages/runner/src/run/index.ts
- /home/zhengyew/telelean/packages/runner/src/run/backend.ts
- /home/zhengyew/telelean/packages/runner/src/proposal/types.ts
- /home/zhengyew/telelean/packages/runner/src/proposal/service.ts
- /home/zhengyew/telelean/packages/runner/src/llm/claudeCli.ts
- /home/zhengyew/telelean/packages/runner/src/llm/env.ts
- /home/zhengyew/telelean/packages/runner/test/llm/tripwire.test.ts
- /home/zhengyew/telelean/packages/runner/test/llm/binary.test.ts
- /home/zhengyew/telelean/packages/runner/test/llm/argvEnv.test.ts
- /home/zhengyew/telelean/packages/runner/test/run/backend.test.ts
- /home/zhengyew/telelean/packages/runner/test/run/manager.accept.test.ts
- /home/zhengyew/telelean/packages/runner/test/run/manager.lifecycle.test.ts
- /home/zhengyew/telelean/packages/runner/test/run/smokeScript.test.ts
- /home/zhengyew/telelean/packages/runner/test/run/walkthrough.e2e.test.ts
- /home/zhengyew/telelean/packages/runner/test/integration/m2flow.test.ts
- /home/zhengyew/telelean/packages/runner/dist/** (rebuilt by tsc)
- /home/zhengyew/telelean/scripts/smoke-claude.mjs
- /home/zhengyew/telelean/test-fixtures/walkthrough/cheat-goal-premise-axiom.json
- /home/zhengyew/telelean/test-fixtures/walkthrough/cheat-goal-premise-belief.json
- /home/zhengyew/telelean/test-fixtures/walkthrough/cheat-derivation-premise-proof.json
- /home/zhengyew/telelean/test-fixtures/walkthrough/cheat-private-lemma.json
- /home/zhengyew/telelean/test-fixtures/walkthrough/README.md
- /home/zhengyew/telelean/docs/m2-plan.md
- /home/zhengyew/telelean/docs/user-guide.md
- /home/zhengyew/telelean/docs/decisions-log.md
- /home/zhengyew/telelean/packages/extension/dist/extension.js, extension.js.map, dist/bin/telelean-path-guard.mjs, dist/webview/*, packages/extension/out/test/suite/* (rewritten by the root build, as instructed; outside my assigned paths)

## test_runs
Logs are in /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/m2fix-core-runner/logs.

- **Core:** `tsc -p tsconfig.test.json` clean; vitest 47 files, 486 passed. Baseline before my changes was 46 files, 474 passed.
- **Runner typecheck:** `tsc -p tsconfig.test.json --noEmit` clean.
- **Runner fast subset** (llm and run tests with fakes, plus the smoke and walkthrough script tests): 20 files, 184 passed, 1 skipped.
- **Runner full suite, real Lean, run 1:** 53 files, 526 passed, 1 skipped, 559 s, exit 0. The skipped test is the now opt-in real-binary test.
- **Runner full suite, run 2 on the final code** (after two message-only core edits): 53 files, 526 passed, 1 skipped, 550 s, exit 0. No `telelean-*` systemd unit left.
- **Integrator's baseline** was 52 files, 509 passed. The 18 new tests are: 4 end-to-end cheats, 6 smoke-script tests, 2 tripwire, 1 backend, 4 lifecycle or wording, 1 empty-Accept.
- **Verifier's probes re-run with real Lean** (copied into my scratch probes folder):
  - P1: check violations, freeze refused (new-axiom with token `statement`, plus `malformed`); the round ends reverted; Accept records only; the real Main.lean has neither the axiom nor the proof.
  - P2: round 1 fails footprint (side_goal.holds rests on new_spyro_pg.holds); after Feedback, round 2 never passes; nothing accepted.
  - P6b: new-axiom (belief) plus malformed; reverted; nothing written.
  - P11 control: still caught.
  - P12: caught by the new `no-facts` footprint finding; not written.
- **`scripts/smoke-claude.mjs --dry-run --binary <fake>`:** exit 0, mode dry-run; only the fake's `--version` ran.
- **Root `npm run build`:** exit 0. Core tsc; the extension esbuild with the guard copied and the "bundle loads" check passing; runner tsc; webview vite build. Debug logs went to my scratch folder.
- **Not run by me:** extension unit and VS Code tests, webview unit and Playwright tests (the other fixer's packages).

## resolved
- Blocker P1/P6b, axiom below a selected Goal/Derivation premise: new-axiom now refuses every axiom added since B unless it is a selected `.holds` or vocabulary not attached to a card, whatever its type (tokens `statement` / `belief` / `unclassified`). `not-formalised` (token `malformed`) applies in every purpose to a selected card attached in the run to a non-Prop statement. signatureAxioms takes only vocabulary of kind sort/predicate/function/constant and never a declaration attached to a card. Covered by core premiseCheats tests and the end-to-end cheats goal-premise-axiom and goal-premise-belief.
- Blocker P2, circular permitted set: `computePermittedAxioms` and `frozenSnapshot` take an optional B. Derivation footprints count only for the user's own unchanged proof (same statement and `.holds` source text in B; B's footprint when B has facts). The engine's freeze (via the new `CheckReport.base`) and the not-proved check pass B. Covered by core tests (round 1 fails; the round-2 freeze is not widened) and the end-to-end cheat derivation-premise-proof.
- Major P12, private theorem: a declaration added or changed in the run that has no Lean facts (Lean skips `private` names), or a proof with no axiom list, is now a footprint finding (token `no-facts`) in every purpose. Files Lean did not build are left to the build finding. Covered by core tests and the end-to-end cheat private-lemma.
- Major literal walkthrough, TL107 after Accept: planGhostAdoption appends the adopted card to the target's `premises:` in the same change. The markup rule accepts exactly that line as telelean wrote it at adoption. The walkthrough end-to-end and m2flow tests now assert the premises line and no TL107 or mismatch after the refresh.
- Major smoke script live by default: it is now dry by default and live only with `--live` plus `TELELEAN_SMOKE_LIVE=yes`, decided before any module loads or binary is resolved. It refuses `--live` while the tripwire is set and sets `TELELEAN_NO_REAL_CLAUDE=1` for itself in dry runs. New test packages/runner/test/run/smokeScript.test.ts (fake `--binary`, tripwire always set).
- Minor empty Accept: the runner says "Recorded: … (no file changed)." with no Undo hint (the outcome label too, `undoable` false), detected from the workspace's `undoable` flag. `proposalLabel` takes an optional `premises` count, and 0 gives "Self-evident? → …" for both the history label and the notice.
- Minor usage-limit notice: new `rateLimitNotice` and `localTime` helpers word it like the status line, in local time. `condenseRateLimit` hyphenates the window name ("five-hour window").
- Minor Stop label: Stop on an interrupted run with no proposal answers "Run stopped".
- Minor docs: user guide 10.3 (Claude Code's own telemetry and the switches passed through), 10.6 (new rules), 10.8 (named check steps), 10.9 (adoption declares the premise), 10.10 (empty Accept is recorded only; Self-evident? label), 10.11 (Run stopped; Lean job stopped on close), 10.12 (notice wording). "check attempts" is kept because the current webview source shows exactly that; the verifier saw an older build saying "gate attempt".
- Minor binary.test real binary: the real `--version` test now runs only with `TELELEAN_ALLOW_REAL_CLAUDE_VERSION=1`; it was skipped in both suite runs.
- Minor tripwire exemptions: (a) `startSession` needs `isTestDoubleLaunch`: launcher `process.execPath` and a .mjs/.js binary inside a test/**/fixtures folder; (b) `createClaudeBackend` needs `resolve.home` and `resolve.pathEnv`; (c) any non-empty value except 0 or false arms the tripwire. New tests in tripwire.test.ts and backend.test.ts.
- Minor dispose: `dispose()` of an active run now fires `(cancelLean ?? lean.cancelRun)(runId)`; covered by a lifecycle test.
- Minor env: `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` added to KEEP, with an argvEnv test; the guide sentence is qualified.

## open_issues
- For the webview fixer: RunPanel `ENDED_TEXT.accepted` still says "Accepted: Claude's changes are in your files. Undo (Ctrl+Z) or History reverts them." even for an empty proposal. The runner now sends the notice "Recorded: … (no file changed)." and an actionResult label "Recorded: … (no file changed)" with `undoable` false. The webview should check the accepted proposal's `ProposalView.empty` (remembered before the proposal is cleared) and drop the Undo wording.
- For the webview fixer, terminology: the user guide (10.4, 10.8, 10.12, 10.13) says "check attempts", matching the current webview source (status line "check attempts k/3", attempts history "n check attempts"). If you rename it (the verifier saw "gate attempt" in an older build), update the guide too; I cannot edit webview files.
- Optional, for the extension fixer: e2e-runs.test.ts's literal test could also assert that the target's `premises:` gains a-character-who-cannot-be-in and that no TL107 shows after Accept. The runner end-to-end and m2flow tests already do. Undo still restores the files byte for byte, since the declaration is part of the one Accept step.
- The root build (about 00:01 on Nov 2) rebuilt packages/extension/dist (extension.js, guard, webview) and out/test/suite from the extension and webview sources as they stood at that time. The extension/webview fixer should rebuild after their own changes.
- The integrator's claim that tests ran "no Claude CLI (not even --version)" was wrong: until this fix, binary.test.ts ran the real binary's `--version` on every runner suite run. It is now opt-in.
- Not done, per the user's rule: I never ran scripts/smoke-claude.mjs without `--dry-run` except the refusal cases, which pass a fake `--binary`, keep `TELELEAN_NO_REAL_CLAUDE=1` and refuse before anything loads. That the default mode is dry is checked by reading the script's source in smokeScript.test.ts (`DRY = !LIVE`, with module loading after that line), not by running it.
- Decision 9 in the plan's own decisions list (section 15.1, "signature = every non-Prop axiom") is kept as the historical record. Its replacement is in plan section 3.2 and decisions-log section 27.

## minor_decisions
- **decision:** The adopted card is declared on the target at adoption time: core planGhostAdoption writes it into Claude's working copy (shadow) together with the card, and the markup rule accepts exactly that line. I did not add a separate pre-ticked item applied at Accept.
  - **rationale:** The change is then part of the checked files and visible in the raw diff and board diff, Undo reverts it with the rest, and the webview needs no new lifecycle kind. The user said "I hold this" for this target, just as "These suffice" declares the selected premises.
- **decision:** The signature still admits the user's own function and constant axioms (TL111). It excludes only declarations attached to cards and vocabulary of kind `other`/`unmarked-axiom`. It is narrower than before but wider than the verifier's "sort/predicate/presupposition only".
  - **rationale:** Plan 3.2 lists function and constant axioms. Excluding them would make every proof that mentions a user's axiom-declared constant fail. New ones are still refused before the freeze by vocabulary-shape, so only the user's own reach a frozen set.
- **decision:** An axiom outside every subject's modules (e.g. the library root) counts as signature when Lean typed it as non-Prop.
  - **rationale:** G0 forbids Claude to change files outside the subject, so only the user writes there.
- **decision:** computePermittedAxioms and frozenSnapshot without B keep their old behaviour (every proved derivation in the model counts). The runner always passes B.
  - **rationale:** Additive, compatible contract change. It keeps the AT1.3 tests and any caller judging the user's own files working.
- **decision:** The no-facts rule applies in every purpose (also check and freeze), to `theorem`/`lemma`/`def`/`abbrev`/`instance`/`opaque` added or changed in the run. It skips files that are not fresh only when a build finding already exists.
  - **rationale:** Fail closed without noise. A private statement abbrev would otherwise escape statement-changed after the freeze too.
- **decision:** Readiness and malformed messages give Claude a short reason ("it is not an abbrev/def of type Prop", or "Lean has no declaration of that name") instead of the board's TL113 text.
  - **rationale:** The board's TL113 text suggests adding `axiom n.holds`, which for a Goal or Derivation premise would itself be a new-axiom finding.
- **decision:** The empty-Accept wording keys on the workspace's `undoable` flag rather than on the plan's change count.
  - **rationale:** `undoable` is false exactly when no history entry or Undo step exists.
- **decision:** createClaudeBackend's tripwire exemption needs `resolve.home` and `resolve.pathEnv`, but not explicit `extensionDirs`.
  - **rationale:** The default extension directories derive from the given home, which tests already point at a scratch folder.
- **decision:** resolveClaudeBinary itself is not guarded by the tripwire.
  - **rationale:** The walkthrough's `--binary-check` and the smoke script's dry run set the tripwire for themselves and still need `claude --version`.
- **decision:** The smoke script's refusal order: (1) contradiction; (2) missing environment switch; (3) switch without `--live`; (4) tripwire set. The `--read-bashrc`/`--safe-targets` contradiction is now a refusal (exit 2) before anything loads.
  - **rationale:** Mirrors walkthrough-claude.mjs. Every refusal happens before the work dir is made or a binary is looked up.
- **decision:** condenseRateLimit hyphenates the first underscore of the window type (five_hour becomes "five-hour window").
  - **rationale:** Matches the wording the issue suggested and the webview's own test data ('five-hour window').
- **decision:** New end-to-end cheat scripts set up the user's code-less Goal or Derivation card through a new optional `userEdits` field, applied to the scratch copy before git init and so part of B.
  - **rationale:** Claude may never add blocks, so the premise card has to exist before the run, as in the verifier's probes.
- **decision:** I ran the full root build as instructed, with npm debug logs redirected to my scratch folder.
  - **rationale:** The extension bundle includes runner and core sources. I first checked that no other build or VS Code test process was running.

## effects_outside_repo
- ~/.npm/_logs: my early `npm test`, `npx tsc` and `npx vitest` runs wrote npm debug logs there (other agents' runs probably did too), and npm's default limit of 10 log files prunes older ones. About 11 files with times from 23:43 on Nov 1 to 00:01 on Nov 2 are there now. From the root build on, I redirected logs with npm_config_logs_dir to my scratch folder or called node_modules/.bin binaries directly.
- systemd --user transient scopes `telelean-<runId>-*` were created and removed by runLean during the two runner suite runs and the probe runs. None was left (checked with `systemctl --user list-units`).
- ~/.elan was used read-only (Lean v4.35.0 toolchain binaries through runLean). ~/.elan/known-projects is unchanged: 37 lines, mtime 2026-11-01 09:09.
- Everything else went to my scratch folder /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/m2fix-core-runner (about 11 MB): test temp dirs, probe copies and results, the smoke dry-run work dir with a fake claude, logs, npm logs.
- Inside the repo but outside my assigned paths: the root build rewrote packages/extension/dist (extension.js, its map, bin/telelean-path-guard.mjs, webview/*) and packages/extension/out/test/suite/*. The vitest runs added entries to node_modules/.vitest-cache.
- Other home changes since 23:15 that are not from me: ~/.config/Code GPU and network caches and globalStorage (your running VS Code), ~/.claude.json, ~/.claude/backups and ~/.claude/projects/...jsonl (the Claude Code session itself), tracker3, wireplumber and Steam state.
- No network use, no git commands, no pushes, no Claude CLI run (not even `--version` of the real binary), no live smoke or walkthrough, no Chrome or VS Code launched, nothing sent to anyone.

