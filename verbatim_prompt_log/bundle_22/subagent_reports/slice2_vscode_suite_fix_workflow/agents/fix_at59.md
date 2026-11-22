# fix:at59

Agent `a06b11f9c4696bd38` of workflow `wf_46e69f5f-f31`. Verbatim output (JSON alongside).

- **key:** vsfix_at59
- **rootCauseClass:** C-test-fragile
- **rootCause:** Race in the test between its own state reset and VS Code's late delivery report. The product is right. BoardPanel.post() reports "delivered" through postMessage's thenable, which resolves some milliseconds AFTER the post, and reportPost fires onDidPostToBoard from that callback. The extension host log shows the run was posted as `working` (updatedAt 07:34:30.722), the board was closed at 30.749 by testing.disposeWorkspace, and a run/session/notice "delivered" report for that old `working` view still arrived at 30.765, after the board was closed. The test had already done `latestRun = undefined` (the session-closed waitFor passes on its first poll), so that stale event set latestRun back to the old `working` view with the same runId. The restore began at 30.790, so `waitFor(runNow()?.runId === working.runId)` passed at once on the stale value and `assert.equal(state, 'interrupted')` saw 'working'. No run was posted by the restored board before the failure (recovery logged 'runs recovered' at 31.028). RunManager.dispose and recoverSession are not at fault: dispose sets state interrupted and canResume and closes the session, recoverSession keeps a working or interrupted active step interrupted, and the runner suites session.reload and manager.lifecycle pass. AT5.8's restored-question waitFor had the same latent flaw (a stale `waiting-for-answer` view would satisfy it), so that check could pass without the restored board posting anything.
- **introducedBy:** Latent since M2 (commit 187673d), where the same test already did `latestRun = undefined` after disposeWorkspace and then waited only for a matching runId. Slice 2 (sessions, builder 2d, with 2h converting the test) exposed it: a session start now posts the run, session and a notice again after the actionResult, so a late delivery report of an old `working` view lands in the window between the test's reset and the restore. The newer VS Code (1.145.2) delivery timing may also contribute. Evidence is the log ordering above (board closed 30.749, stale run 'delivered' 30.765, restoring 30.790). It is not a slice-1 or slice-2 product regression.
- **sourceChanged:** True
- **filesChanged:**
  - /home/zhengyew/telelean/packages/extension/test/suite/runs.test.ts
  - /home/zhengyew/telelean/packages/extension/src/api.ts
  - /home/zhengyew/telelean/packages/extension/src/board/BoardPanel.ts
  - /home/zhengyew/telelean/packages/extension/src/vscode/host.ts
- **testsRun:**
  - tsc --noEmit -p packages/extension/tsconfig.json (includes test/suite): rc=0, no output
  - extension vitest (--no-cache, one worker): 'Test Files  22 passed (22); Tests  216 passed (216)'
  - runner vitest test/run/session.reload.test.ts test/run/manager.lifecycle.test.ts (real Lean, TELELEAN_NO_REAL_CLAUDE=1): 'Test Files  2 passed (2); Tests  58 passed (58)'
  - The in-VS-Code suite was not run (not allowed)
- **mutationChecks:**
  - None possible: the test is an in-VS-Code mocha test that I may not run, and the src change is test-API plumbing (a new `panel` field on BoardPostEvent). The product persist and recover path already has runner unit tests (session.reload, manager.lifecycle), which pass.
  - Reasoned check: without `retiredPanels`, the stale 'delivered' event from the closed board sets latestRun again, which is the failing log sequence. With it, events whose e.panel is the old panel are dropped, and only the restored board's first run post can satisfy the waitFor.
- **expectedVsCodeResult:** AT5.9 passes. After windowGoes() the old panel is retired, so late delivery events from it are ignored. latestRun stays undefined until the restored board (the new panel) posts the recovered run. The waitFor then sees the same runId, state 'interrupted' with canResume true, no new session (hanging.sessions.length stays 1), Exit then gives 'discarded', and the files are untouched. The AT5.8 restored-question test also still passes, now by waiting for a real post from the restored board. Recovery took about 240 ms after the restore in the failing run, well inside the 30 s waitFor. If AT5.9 still shows 'working' after this change, that would be a real product bug (recovery not marking the step interrupted), which the runner suites rule out.
- **decisions:**
  - Tag each post event with its panel (optional-free `panel: vscode.WebviewPanel` on BoardPostEvent) so the test can tell the old board's late events from the restored board's. Alternative: test-only, with a sleep or a flag that ignores events until the restore finishes. Rejected as timing-based, because a late event could still arrive after the restore started.
  - Retire the old panel BEFORE disposeWorkspace, then clear latestRun and latestSession, in one helper `windowGoes()` used by both AT5.8's restored-question test and AT5.9, so the same race cannot make either one pass vacuously. Alternative: fix only AT5.9.
  - Left the assertion as an exact `assert.equal(state, 'interrupted')` and the waitFor on the same runId. Alternative: waitFor state==='interrupted' with a timeout, which would have hidden the stale-event problem.
- **outsideEffects:** ["None outside the repo and my scratch dir /tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad/vsfix_at59 (backup/, changed_files.txt, before.diff, after.diff, fsmc/, tmp/, rt/). Nothing written to packages/extension/dist or out. No git state changed (HEAD 1473ca0, nothing staged). No Claude calls, no installs, no network."]
- **report:** Root cause: the failure is a test race, not a product bug. In the host log the board was closed at 23:34:30.749 and the test reset latestRun at that moment. VS Code's delivery acknowledgement for the old board's last `working` run view arrived at 30.765 and fired onDidPostToBoard, which re-set latestRun to `working`. The test then restored the board (30.790) and its `runId ===` wait passed immediately on that stale value, so the 'interrupted' assertion failed.

Product check: RunManager.dispose marks a working run interrupted, sets canResume and closes the session. recoverSession keeps a working or interrupted active step interrupted. The runner suites session.reload and manager.lifecycle (58 tests) pass.

Fix:
- packages/extension/src/api.ts: BoardPostEvent now carries the `panel` it was posted to.
- packages/extension/src/board/BoardPanel.ts: the onPost dep takes the panel and reportPost passes `this.panel`.
- packages/extension/src/vscode/host.ts: onPost forwards the panel into the event.
- packages/extension/test/suite/runs.test.ts: adds a `retiredPanels` set and a `windowGoes()` helper. The helper retires the current board's panel, disposes the workspace, then clears latestRun and latestSession. The subscription ignores events from retired panels. AT5.8's restored-question test and AT5.9 both use the helper. The assertions are unchanged.

Not run: the in-VS-Code suite. The orchestrator must rebuild dist/out first, because I changed extension src.

before.diff and after.diff snapshots are in the scratch dir. The backups of the 4 changed files are under vsfix_at59/backup/.
