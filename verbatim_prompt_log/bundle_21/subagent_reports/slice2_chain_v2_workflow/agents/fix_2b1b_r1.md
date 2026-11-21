# fix:2b1b:r1

Agent `a19465eeaa179ae78` of workflow `wf_ae5f1188-533`. Verbatim output (JSON alongside).

# Fixer 2b1b, round 1: report

All 20 findings are dealt with: 15 fixed in code, 3 by tests only (S-F9, A-ADV-6, and the docs for S-F6/S-F8), and one (C-V2B1B-C2) fixed with a deliberate deviation from the reviewer's suggested fix, explained below. Every rule fix has a test that fails without it: 47 mutations, all caught, every file restored byte for byte (`cmp` and sha256 both checked). Core typecheck is clean, and core now has 887 tests (was 857), all passing.

## Findings
- **A-ADV-2 (blocker), S-F1, C-V2B1B-C3: fixed.** `holdsKindFindings` now refuses a theorem `.holds` on any card other than the step's target (at a stage or the end, other than a session target).
  - `axiom-to-theorem` when the reference had an axiom there.
  - `not-target` when the reference had none, or had other text.
  - The existing exceptions are kept: the target's axiom→theorem with the identical type, and telelean's pending claims.
  - At a step, a `.holds` that S₀ already had and the scope did not open is left to the step limits, so each change gets exactly one finding.
  - All the reviewers' probes are now refused: A, B, D, b4, b4c, and the stage case.
- **A-ADV-1 (blocker): fixed.** E(T) now counts a ledger arrow only while the judged state draws it. The running step's own entries count before its normalise draws them. propose_arrow says "drawn already" only when the arrow is drawn or this step proposed it, so Claude can propose a taken-out arrow again. Probe E is now refused at the gate and at the stage.
- **S-F2: fixed.** A removed S₀ line is no longer refused when it belongs to content the scope opened:
  - a comment that, when it came in (B→S₀), attached to an opened declaration;
  - an enclosing line whose declarations are all opened. To support this, `compareTexts` now records `AddedTextUnit.encloses`.

  The person's lines, and lines around content that was not opened, are still refused.
- **S-F3: fixed.** A step purpose without a scope or S₀ now throws `ActionError('invalid')`.
- **S-F4: fixed.** New tokens `closed-proof` and `text`, each with a board sentence.
- **S-F5: fixed.** The reducer refuses an un-reject whose declining decision also un-rejected another item (new text `REVIEW_TEXTS.unrejectMixed`). Undo of that decision undoes both. The §4.6 property sentence is narrowed and decision 13 is marked superseded.
- **S-F6: docs.** The engine merges G0's findings into `global` at every purpose. This is in the amended G0 decision in §8 and in a new bullet in §1.1's 2b3b entry.
- **S-F7: fixed.** One finding per problem:
  - B.3's re-check of the step's own arrows leaves a declined one to `rejected-repeat/arrow`;
  - the `rejected` check leaves premise drafts to `premise`.
- **S-F8: docs.** `scc` is documented as not emitted by judgeState, in `review/types.ts` and in §2.9.
- **S-F9: test rebuilt.** D2-59 now uses a real declined Claude arrow (ledger entry, declined record, source still in the question), checks that `global` is empty, and has a passing counterpart with the arrow drawn.
- **C-V2B1B-C1: fixed.** The card telelean wrote for a premise (ledger `premise`, no `created` entry) now follows its draft's rule: it may mention its own target's proof material, never another Result's. The f7 probes now give an empty `global` and `ok: true`.
- **C-V2B1B-C2: fixed, with a deviation.**
  - What an earlier step made for the target is judged against the question on the record (for B.1's footprint and for `other-result`) until the step claims its new question: at gate-proved, or by check_lean once T.holds has changed.
  - Under `openProof`, the target's Result's proof material is open, except at gate-other. So a re-ask can drop an old lemma that rests on a source it no longer asks for.
  - **Deviation:** at gate-proved, old material is judged against the *new* question. The reviewer's fix would let the gate pass a lemma that the next stage judgement (after the question is replaced) fails, which would revert the new Result straight away.
  - Result: gate-other and check pass with everything unchanged; gate-proved passes once the lemma is removed, and keeping it gives a footprint finding with a hint explaining why.
- **C-V2B1B-C3: fixed** (with S-F1 above).
- **C-V2B1B-C4: fixed.** A target theorem `.holds` with no facts now gives `footprint/no-facts`, unless its file failed to build (then it is G1's).
- **C-V2B1B-C5: fixed.** In a session, the example message suggests a named lemma, not `#check` (`sessionExampleWording`).
- **A-ADV-3: fixed.**
  - G5 compares a block's other lines as written and in order (token `markup/lines`), but only when no field rule already spoke for that block.
  - A step catch-all: each new unowned difference that S₀ did not have becomes `existing-changed/unowned` (new text `CLAUDE_SESSION_TEXTS.unownedChange`).
  - Session content that no S₀ item provides gets a neutral step-limit message.
- **A-ADV-4: fixed.** A `.holds` now counts as changed when either its text or its meaning differs (D2-41): the active target is compared against S₀, and `isSessionProof` against B. Probe I is now refused at gate-other and at the stage.
- **A-ADV-5: fixed.** At a step, G5 accepts a `premises:` addition only for the step's own ledger arrows and for ledger premises. Probe H now gives `markup/premises`.
- **A-ADV-6: test added.** `unseen` at a finish and at the stage, plus the passing case.

## Files changed
- /home/zhengyew/telelean/packages/core/src/gate/sessionRules.ts: B.4, step limits (S-F2/S-F4/neutral message), G5 (A-ADV-5, lines), `arrowProblems`, B.3 dedupe, target no-facts, `other-result` (C1/C2), `materialQuestionOf`, `creatorOf().active`, `meaningChanged`, `sessionExampleWording`.
- /home/zhengyew/telelean/packages/core/src/review/judge.ts: the S-F3 throw, A-ADV-4, openNames, the re-ask split, the catch-all, S-F7, C5.
- /home/zhengyew/telelean/packages/core/src/review/permitted.ts: `extraSources` (drawn arrows, `activeStep`), `isSessionProof` meaning check, `permittedFor`'s `activeStep`.
- /home/zhengyew/telelean/packages/core/src/review/items.ts: `encloses`; `otherBlockLines` exported.
- /home/zhengyew/telelean/packages/core/src/review/reducer.ts: S-F5.
- /home/zhengyew/telelean/packages/core/src/review/texts.ts: `unrejectMixed`, `unownedChange`.
- /home/zhengyew/telelean/packages/core/src/review/types.ts: S-F8 comment.
- /home/zhengyew/telelean/packages/core/src/gate/describe.ts: sentences for `closed-proof`, `text`, `unowned`, `not-target`, `axiom-to-theorem`.
- /home/zhengyew/telelean/packages/core/src/gate/types.ts: code and token docs.
- /home/zhengyew/telelean/packages/core/test/review/judge.test.ts: +28 tests, 6 updated for the intended token and dedupe changes, D2-59 rebuilt.
- /home/zhengyew/telelean/packages/core/test/gate/describeSession.test.ts: +1.
- /home/zhengyew/telelean/packages/core/test/review/reducer.test.ts: +1 (S-F5).
- /home/zhengyew/telelean/docs/slice2-plan.md: §1.1 (2b3b G0 note), §2.7 tokens, §2.9 scc, §4.6, §4.8, §4.9, §8 (G0 and decision-13 amendments, new "fixer 2b1b, round 1" entry).
- No test was deleted, skipped or moved. Backups are in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2b1br1/backup and the list in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2b1br1/changed_files.txt.

## Mutation checks
47 mutations, each failing at least one test, each restored and checked with `cmp` (sha256 of all six source files re-verified afterwards). The full table is in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2b1br1/mutation-table.txt (raw results in muts.out.json, harness in mutate.py). A selection:
- B4a `sessionRules.ts:853`, non-target proof passes → 6 failed ("a proof of a card that is not the step's target is `not-target`…").
- B4b `:820`, any session target provable at a step → 2 failed ("a statements-only step (A12)…").
- B4c / B4d `:856`, double findings / opened names ignored → 2 / 3 failed.
- AD1a `permitted.ts:54`, undrawn arrow kept in E(T) → 2 failed. AD1d `sessionRules.ts:688` → 1 failed ("propose_arrow accepts such an arrow again…").
- SF2a–SF2e (comment, enclosing, `every`→`some`, gate-other, `encloses`) → 3 / 2 / 1 / 1 / 2 failed.
- AD3b / AD3d / AD3e / AD3f (no lines rule, no catch-all, catch-all always, catch-all ignoring S₀) → 1 / 1 / 57 / 1 failed.
- C2a–C2f (re-ask material) → 1 / 1 / 2 / 1 / 1 / 1 failed. C1a / C1b → 2 / 1. C4a / C4b → 1 / 1.
- AD4a `judge.ts:279` / AD4b `permitted.ts:79` → 1 / 2. AD5 `sessionRules.ts:402` → 1. SF7a / SF7b → 2 / 1.
- SF3 → 1. C5 → 1. SF5a / SF5b `reducer.ts:564/451` → 1 / 14. SF4a–SF4e, AD3a, AD3g, B4g (tokens, messages, board sentences) → 1–4 each.

## Verification (run on the final code)
All commands ran through `capped.sh`, with `TMPDIR` and `TELELEAN_TEST_TMP` set to my scratch tmp, binaries from `/home/zhengyew/telelean/node_modules/.bin`, and every vitest with `--maxWorkers=1 --no-cache --fsModuleCachePath=<scratch>/fsmc`.

| Check | Result |
|---|---|
| `tsc --noEmit -p` on core and runner `tsconfig.test.json`, webview `tsconfig.json` and `tsconfig.node.json`, extension `tsconfig.json` | all exit 0, no output |
| core `vitest run` | "Test Files  67 passed (67)", "Tests  887 passed (887)" |
| webview | "Test Files  19 passed (19)", "Tests  313 passed (313)" |
| extension | "Test Files  22 passed (22)", "Tests  203 passed (203)" |
| runner, `capped.sh 3000 timeout 900 … test/run/manager.gate.test.ts` | "Test Files  1 passed (1)", "Tests  8 passed (8)" |

- No runner file changed. `manager.gate` was run because it uses core's real `describeFinding`/`attemptNotice`, and I changed `describe.ts`.
- `gate/engine.test.ts` (real Lean) was not run: it exercises `evaluateRules`, `rules.ts` and `gate/permitted.ts`, none of which I changed.
- The snapshots are in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2b1br1: before.diff is 3,804,679 bytes and after.diff is 3,887,215 bytes, both covering 341 files. No new repo files.

## Decisions for the orchestrator to log
All are also in the plan's §8 "fixer 2b1b, round 1" entry.
1. **B.4 tokens and dedupe.** Two tokens: `axiom-to-theorem` and `not-target`. At a step, B.4 speaks only for new or opened `.holds`; S₀'s unopened ones are left to the step limits. *Alternative:* one token, or report both codes.
2. **S-F2 attachment.** The exemption uses the attachment and enclosure recorded when the line came in (B→S₀), never one re-derived from S₀'s neighbours. *Alternative:* exempt comments next to opened content by position.
3. **S-F3.** Throw `ActionError('invalid')`. *Alternative:* `ok: false` with a global finding.
4. **S-F4.** New tokens `closed-proof` and `text`. *Alternative:* tell the cases apart in describe from `names` and `file`.
5. **S-F5.** Refuse the later un-reject, with a text that points to Undo. *Alternative:* refuse mixed requests in the reducer or in 2c1's validator.
6. **S-F7.** Keep `rejected-repeat`'s `arrow` and `premise`; B.3 and `rejected` drop their duplicates. *Alternative:* keep B.3's `declined` and drop `rejected-repeat/arrow`.
7. **C-V2B1B-C2.**
   - (a) The target's proof material is open under `openProof`, except at gate-other.
   - (b) Old material is judged against the recorded question, except at gate-proved and at check once T.holds has changed.
   - *Alternative:* the reviewer's version, with the recorded question at every purpose (it fails open at gate-proved, as explained above).
8. **A-ADV-1.** "Drawn" is read from the state, not from the record's status. *Alternative:* record-based, which wrongly refuses a re-proposed arrow at the end-of-queue judgement, when the records are still the old ones.
9. **A-ADV-3.**
   - The catch-all speaks only when no other step finding exists, and only at step purposes. *Alternatives:* always, which doubles nearly every G5 and step-limit finding; or a new finding code.
   - G5's lines check runs only when no field rule spoke for the block.
10. **A-ADV-4.** status-mismatch stays a byte-identical text check. *Alternative:* also refuse a meaning change at gate-other.
11. **C-V2B1B-C1.** A written premise card's findings belong to its target's inference. *Alternative:* make them global.

Note for 2b3b, as stated in §1.1: merge G0's findings into `global` at every purpose.

## Effects outside the repo and the scratch dir
- Vite's config loader wrote and deleted bundled configs in four existing folders inside the repo (git-ignored). Each is empty again; only its modification time changed:
  - `node_modules/.vite-temp`
  - `packages/core/node_modules/.vite-temp`
  - `packages/webview/node_modules/.vite-temp`
  - `packages/runner/node_modules/.vite-temp`
- Unchanged: `node_modules/.vitest-cache` (1654 entries), `packages/extension/out` and `packages/extension/dist` (nothing newer), `/tmp` (29 entries before and after).
- `capped.sh` created transient systemd user scopes.
- No git state changes (HEAD is still 187673d), no network, no installs, no Claude CLI, no Lean run. None of my processes remain. The running `lake`/`lean` processes belong to VS Code's Lean server for `~/webring`; `waitlabel.py` and `ramwatch.sh` are the orchestrator's.
