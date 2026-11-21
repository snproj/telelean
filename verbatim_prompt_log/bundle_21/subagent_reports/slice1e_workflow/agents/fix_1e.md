# fix:1e

Agent `a2bfd95580691b5a9` of workflow `wf_e822c12a-f8e`. Verbatim output (JSON alongside).

FIXER 1e REPORT (slice 1, sub-slice 1e)

I fixed every finding except F7, which needs files in test-fixtures/, outside my write set. The finding IDs below are verifier A's. Verifier B's findings were duplicates: B-F1 = A-F2, B-F2 = A-F3, B-F3 = A-F4, B-F4 = A-F8.

## Findings

**F1 (major): fixed.** A not-proved proposal could delete the person's existing proof of the target. Changes, all in core `gate/rules.ts` unless noted:

1. **The rule now holds the target's `.holds` fixed.**
   - At gate-other, `status-mismatch` also refuses when the `.holds` that B had was changed (token `changed`) or removed (token `removed`). "B had" covers the person's proof and a pending claim's axiom.
   - The message says: "…a finish that is not proved leaves the target's .holds exactly as it was before the run … restore ‹name› exactly as it was before finishing."
   - The board text (`describe.ts`) is "it removed `v.holds` although it did not prove the goal (it must stay as it was)" (or "changed").
   - A proof the run added where B had none keeps the old message.
2. **The wording now depends on the case.**
   - When the person's proof is unchanged (only judged at gate-proved now), B.2 says: "‹T.holds› is the existing proof of the target, unchanged in this run … write a new proof … (it replaces the existing one), or finish with status not_proved and leave the existing proof exactly as it is, naming ‹id› in gap". B.2's `unseen` variant and the footprint rule say the same.
   - For a proof the run added or changed, the way back follows what B had: "remove the proof of the target", or "restore ‹T.holds› exactly as it was before the run". `not-proved`'s message for a missing `.holds` follows the same rule.
3. **checkGhost is no longer blocked.**
   - check_lean (stage prove) judges B.2 only when `targetProofNew`.
   - I also stopped check_lean judging the person's unchanged target proof with the footprint rule. This goes beyond the finding: that rule has done so since M2, and it would still block "Claude suggests" in the commonest A11 case (the existing proof uses an unselected axiom). gate-proved still judges both rules.
4. **Prompts.**
   - The system prompt's step 6 now says: "leave the target's `.holds` exactly as it was before the run (remove any proof of it you wrote; a proof or pending claim the person had stays as it is)". It previously said "remove any proof of the target".
   - The context bundle's line for a proved target now reads "Proved already (prove it again from exactly this selection: a new proof replaces the existing one; if it does not follow, leave the existing proof as it is)."
   - The fixture `system-prompt-5.1.txt` and docs/m2-plan.md §3.3, §5.1 and §5.2 follow, with dated notes.
5. **Tests added (core `undeclaredPremise.test.ts`):**
   - The unchanged proof is not judged at check_lean, and is judged at gate-proved with the new messages.
   - The requested case: the base proof uses an unselected proved card, S removes it, and gate-other refuses. Changed proofs and a changed pending claim are refused too; a proof left as it was passes.

**F2 (minor): fixed.**
- In runner `proposal/service.ts`, `selfEvident` is now true when the result is proved, the footprint holds only `presup:` entries, and no verified edge enters the target. The selection no longer matters.
- Following verifier B's note, a proof that goes through a selected card that is itself proved from nothing is not flagged.
- I updated the `ReportCard.selfEvident` doc in core `run.ts`.
- Test added in `accept.test.ts` for A9: unused premises get the flag, the case through a proved-from-nothing card does not, and an `axiom:` entry does not.

**F3 (minor): fixed (docs only).** The three missing e2e assertions are now listed in slice1-plan §8 under "fixer 1e":
- `m2-review.spec.ts:177`
- `m2-overlay.spec.ts:185`
- extension `e2e-runs.test.ts:389`

**F4 (minor): fixed.** With several cards selected, the section lists the card actions that any of them offers, disabled, with "Select one card for this action." on hover (`FORMALIZE_TEXTS.severalCards`). Tests are in `contextActions.test.ts`.

**F5 (minor): fixed.**
- New `selectionCards` lists the cards whose presuppositions apply: the selected arrows' ends, the marked cards, then the selected cards.
- New `summaryTitle` builds the summary tooltip from them.
- `ContextSection` uses both. The presuppositions still appear only in the tooltip, not as a chip, because the section has a fixed 30 px height.
- Unit tests added.

**F6 (minor): fixed for the gate.**
- New runner `gate/findings.ts` `unseenProofEnvironment`, called in `engine.gateNow`. When B.2 `source-only` is the gate's only finding, the gate returns `environment` with that text plus the facts' detail (cut at 300 characters).
- Effect: no attempt is counted, and the manager retries once after 30 s, then stops the run.
- With any other finding (for example a failed build), the attempt is still counted.
- I did not change the ghost check: an uncounted refusal could be repeated until the turn cap.
- Tests: a pure test in `pure.test.ts`, and an engine test with fake rules and facts in `engine.test.ts`.

**F7 (minor): not fixed.** Renaming the bundle's first line `Run: "These suffice"` needs the FakeBackend scripts in test-fixtures/ to change with it, and test-fixtures/ is outside my write set. It stays the integrator's call, as noted in slice1-plan §8.

**F8 (nit): fixed.** The `suggestedGhosts` doc comment is back above the function.

**F9 (nit): fixed.** `ContextActions.card` is now the single selected card, filtered against the nodes on screen. The section runs card actions on that card.

## Files changed
The pre-fix copies are in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f1e/before/ if you want to diff only my changes.

**core:**
- /home/zhengyew/telelean/packages/core/src/gate/rules.ts
- /home/zhengyew/telelean/packages/core/src/gate/describe.ts
- /home/zhengyew/telelean/packages/core/src/gate/types.ts (docs)
- /home/zhengyew/telelean/packages/core/src/run.ts (doc)
- /home/zhengyew/telelean/packages/core/test/gate/undeclaredPremise.test.ts

**runner:**
- /home/zhengyew/telelean/packages/runner/src/gate/findings.ts
- /home/zhengyew/telelean/packages/runner/src/gate/engine.ts
- /home/zhengyew/telelean/packages/runner/src/gate/index.ts
- /home/zhengyew/telelean/packages/runner/src/proposal/service.ts
- /home/zhengyew/telelean/packages/runner/src/run/prompts.ts
- /home/zhengyew/telelean/packages/runner/src/run/systemPrompt.ts
- /home/zhengyew/telelean/packages/runner/test/run/fixtures/system-prompt-5.1.txt
- /home/zhengyew/telelean/packages/runner/test/gate/pure.test.ts
- /home/zhengyew/telelean/packages/runner/test/gate/engine.test.ts
- /home/zhengyew/telelean/packages/runner/test/run/prompts.test.ts
- /home/zhengyew/telelean/packages/runner/test/proposal/accept.test.ts

**webview:**
- /home/zhengyew/telelean/packages/webview/src/board/contextActions.ts
- /home/zhengyew/telelean/packages/webview/src/header/ContextSection.tsx
- /home/zhengyew/telelean/packages/webview/src/model/run.ts
- /home/zhengyew/telelean/packages/webview/test/unit/contextActions.test.ts

**docs:**
- /home/zhengyew/telelean/docs/slice1-plan.md: a new "fixer 1e" entry, plus three short "(changed by fixer 1e)" markers in the builder 1e entry.
- /home/zhengyew/telelean/docs/m2-plan.md

## Verification
Every run used capped.sh, one heavy job at a time.
- This vitest rejects `--poolOptions`, so I used `--maxWorkers=1`.
- Real-Lean runner files ran under cap 3000, which the 1e brief allows; the other runs used 1800.
- Runner runs set `TELELEAN_TEST_TMP` to my scratch folder and ran under `timeout 900`.

**tsc:**
- core (test config): 0 errors.
- runner (test config): 0 errors.
- webview `tsconfig.json`: 0 errors.
- webview `tsconfig.node.json`: the same 6 errors as before, all in test/e2e.
- extension: the same 9 errors as before, all in test/suite (`lifecycle` and the old kinds).

**vitest:**
- core: "Test Files 55 passed (55)", "Tests 597 passed (597)".
- webview: "Test Files 19 passed (19)", "Tests 313 passed (313)".
- extension (`--no-cache`): "Test Files 22 passed (22)", "Tests 203 passed (203)".

**runner:**

| File(s) | Result |
|---|---|
| gate/pure + run/prompts + proposal/accept | "Test Files 3 passed (3)", "Tests 45 passed (45)" |
| gate/rules.test.ts (real Lean) | "Tests 26 passed (26)" |
| gate/engine.test.ts (real Lean) | "Tests 30 passed (30)" |
| proposal/build.test.ts | "Tests 7 passed (7)" |
| integration/m2flow.test.ts | "Tests 5 passed (5)" |
| run/walkthrough.e2e.test.ts | "Tests 22 passed (22)", 185.6 s |
| run/fresh.e2e.test.ts | "Tests 9 passed (9)", 100.7 s |

I did not run the other runner files (manager.*, workspace, semantic and so on), nor any Playwright or VS Code e2e.

**Scratch webview build:** built to /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f1e/webview-build/ (webview.js 538.91 kB, webview.css 96.33 kB, codicon.ttf). A `find -newer` check shows nothing in extension/out or extension/dist changed.

## Effects outside the repo and scratch
- **Mine:** none.
  - The capped.sh scopes ended; no telelean systemd units and no processes of mine are left.
  - There are no `/tmp/telelean-*` directories now.
  - Caches stayed inside packages/*/node_modules.
  - No git changes, no npm or npx, no downloads, no real Claude.
- **Not mine:**
  - /home/zhengyew/telelean/docs/slice2-plan.md was modified at 11:26:05 by another session during my run; I did not touch it.
  - The Lean server on ~/webring and VS Code's tsserver are the user's.
