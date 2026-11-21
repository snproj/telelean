# fix:2b1b:r2

Agent `a4994eeda7940d897` of workflow `wf_ae5f1188-533`. Verbatim output (JSON alongside).

# Fixer 2b1b, round 2: report

All five findings are fixed. One major and one minor finding follow the review's proposed fix exactly; R1-1 has one refinement, and the two nits follow the review's options. Each fix has a test that fails without it: 14 mutations, all caught, every file restored byte for byte (checked with `cmp` and sha256). Core typecheck is clean and core has 67 files and 895 tests, all passing (was 887). Only core and `docs/slice2-plan.md` changed.

## Findings
- **C-V2B1B-C2 (major): fixed, as the review proposed.**
  - **The bug:** in `otherResultFindings`, a target's `.holds` was always judged against the step's new question (`active: true`).
  - **The fix:** it now uses `active: false`, so what T.holds mentions is judged with `materialQuestionOf`. That is the question on the record until the step claims its new one (at gate-proved, or by check_lean once T.holds changed). For any other target the two questions are the same.
  - **Effect on the review's R4 state:** it now passes check (formalise), the freeze, check (prove), gate-other and the stage before. At gate-proved with T.holds unchanged it gives `undeclared-premise/other-result` naming `t1_lemma`. A new proof from the new sources passes at gate-proved and at check. A reworked T.holds that still uses `t1_lemma` is refused by check_lean. With no re-ask (the old question kept) it passes.
- **R1-1 (minor): fixed, with a refinement.**
  - `compareTexts` gains an optional `alsoTouched`. `strayCommandFindings(c, openNames)` passes it at step purposes, and judgeState passes `openNames`.
  - **Refinement:** an opened declaration counts only if it is session content, meaning new or rewritten since B. Those are the declarations computeItems also attaches comments to at the stage.
  - **Why:** with the review's plain version, a comment above the person's own T.holds (which `openProof` opens) would pass this rule. It would then reach the stage as unowned text, caught at the step only by the A-ADV-3 catch-all, with a vaguer message.
  - **Result:** rewording the comment of an opened, unchanged lemma passes at check, gate-proved and gate-other, and the stage has no problem. Next to content the step did not open it is still `stray-command/comment` plus `existing-changed/text`. A comment above the person's own proof stays a stray comment.
- **R1-2 (minor): fixed.**
  - `extraSources(target, ledger, items, current: ProjectModel, activeStep?)` now requires `current`. Its only caller, `permittedFor`, already passed it.
  - The `extra` comment is updated in review/types.ts and in plan §2.9, and the round-1 §8 log line is annotated.
- **R1-3 (nit): fixed.**
  - `closed-proof` now reads: "it changed the proof of “T”, which this step may not change".
  - Session content that no item of S₀ covers gets a new token, `uncovered`, with the sentence "it changed ‹name›, which an earlier step wrote". The token is added to plan §2.7 and to the token docs in gate/types.ts.
- **R1-4 (nit): fixed.**
  - G5's `premises` rule now leaves to B.3 an added entry whose ledger arrow item is declined. This is exactly B.3's condition (B.3 already requires the arrow to be drawn, which an added entry is).
  - The review's probe now gives only `arrow/declined`.
  - Two cases stay G5's `markup/premises`: an arrow that is not declined (A-ADV-5), and a declined record with no ledger arrow, which B.3 does not see.

## Files changed
- /home/zhengyew/telelean/packages/core/src/gate/sessionRules.ts: C2 (the `.holds` creator uses `active: false`, docs of `materialQuestionOf`), R1-1 (`openNames` parameter, session-content check), R1-3 (`uncovered` token), R1-4 (`declinedArrow` in G5).
- /home/zhengyew/telelean/packages/core/src/review/items.ts: `compareTexts(base, current, alsoTouched?)`, an additive parameter.
- /home/zhengyew/telelean/packages/core/src/review/judge.ts: `strayCommandFindings(sc, openNames)`.
- /home/zhengyew/telelean/packages/core/src/review/permitted.ts: `current` required.
- /home/zhengyew/telelean/packages/core/src/review/types.ts: the `extra` comment.
- /home/zhengyew/telelean/packages/core/src/gate/describe.ts: the `closed-proof` sentence, and the new `uncovered` sentence.
- /home/zhengyew/telelean/packages/core/src/gate/types.ts: token docs.
- /home/zhengyew/telelean/packages/core/test/review/judge.test.ts
  - **7 new tests:**
    - C2 (2): "the old proof stands until the step claims the new question…" and "a proved finish claims it…".
    - R1-1 (3): "a Submit step that opened the Result rewords its lemma’s comment…", "next to content the step did not open…" and "a new comment above the person’s own proof stays a stray comment…".
    - R1-2 (1): `extraSources` tested directly, including a `@ts-expect-error` call without the state that must throw `TypeError`.
    - R1-4 (1): "at a step, `arrow` (`declined`) only…".
  - **1 updated:** the A-ADV-3 uncovered case now expects token `uncovered`.
- /home/zhengyew/telelean/packages/core/test/gate/describeSession.test.ts: 1 new test (the `uncovered` sentences, and `closed-proof` for a removal as judgeState reports it), and the round-1 `closed-proof` sentence updated.
- /home/zhengyew/telelean/docs/slice2-plan.md
  - §2.7: token `uncovered`.
  - §2.9: `extra`.
  - §4.9: four places (step limits, G5, footprint/other-result, stray comments).
  - §8: a note on the round-1 additive line, and a new entry "fixer 2b1b, round 2".
- No test was deleted, skipped or moved. Backups are in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2b1br2/backup and the list in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2b1br2/changed_files.txt.

## Mutation checks
14 mutations, each restored and checked with `cmp` and sha256. The harness is /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2b1br2/mutate.py; the results are in muts.out.json and mutation-table.txt in the same folder.

Each line: file:line, what I broke, how many tests failed, a failing test:
- C2a sessionRules.ts:1291 `active: true` again → 1 failed, "the old proof stands until the step claims the new question…"
- C2b judge.ts:282 a proved finish does not claim the new question → 3 failed, including "a proved finish claims it: the old proof is `other-result`…"
- C2c judge.ts:282 check_lean on a changed T.holds does not claim it → 2 failed, including the same test
- R1a items.ts:305 `alsoTouched` ignored → 1 failed, "a Submit step that opened the Result rewords its lemma’s comment…"
- R1b sessionRules.ts:1049 the session-content check dropped → 1 failed, "a new comment above the person’s own proof…"
- R1c judge.ts:356 `openNames` not passed → 1 failed, "a Submit step that opened the Result…"
- R1d sessionRules.ts:1049 any session content, opened or not → 1 failed, "next to content the step did not open…"
- R2a permitted.ts:48 `current` optional again → 1 failed ("…without the state there is no E(T)…"); tsc also fails with TS2578 (unused `@ts-expect-error`)
- R3a describe.ts:197 the old `closed-proof` sentence → 2 failed in describeSession
- R3b sessionRules.ts:276 uncovered content keeps `session` → 1 failed, "session content no item of S₀ provides…"
- R3c describe.ts:194 no `uncovered` sentence → 1 failed in describeSession
- R4a sessionRules.ts:477 no hand-off to B.3 → 1 failed, "at a step, `arrow` (`declined`) only…"
- R4b sessionRules.ts:411 any ledger arrow handed off → 2 failed, including A-ADV-5's "G5 at a step: an earlier step’s ledger arrow…"
- R4c sessionRules.ts:411 handed off without a ledger arrow → 1 failed, "at a step, `arrow` (`declined`) only…"

## Verification (final code)
Every command ran through `capped.sh`, one at a time, with binaries from node_modules/.bin, `TMPDIR` and `TELELEAN_TEST_TMP` set to my scratch tmp, and every vitest with `--maxWorkers=1 --no-cache --fsModuleCachePath=<scratch>/fsmc`. The only edit after the full set of runs was a two-line comment in sessionRules.ts; core's tsc and vitest were run again after it.

| Check | Result |
|---|---|
| `tsc --noEmit -p` on core and runner `tsconfig.test.json`, webview `tsconfig.json` and `tsconfig.node.json`, extension `tsconfig.json` | all exit 0, no output |
| core vitest | "Test Files  67 passed (67)", "Tests  895 passed (895)" |
| webview vitest | "Test Files  19 passed (19)", "Tests  313 passed (313)" |
| extension vitest | "Test Files  22 passed (22)", "Tests  203 passed (203)" |
| runner `capped.sh 3000 timeout 900 … test/run/manager.gate.test.ts` | "Test Files  1 passed (1)", "Tests  8 passed (8)" |

- I ran `manager.gate` because it uses core's real `describeFinding`, which I changed. No runner file changed.
- `gate/engine` (real Lean) was not run: it exercises `evaluateRules`, `rules.ts` and `gate/permitted.ts`, none of which changed.
- No webview change, so no webview build and no Playwright.
- **Snapshots:** before.diff is 3,887,215 bytes and after.diff 3,923,633 bytes, both 341 files, the same file set. Exactly my 10 files differ.
- **Concurrent plan edits:** someone else, presumably the orchestrator or plan fixer, edited docs/slice2-plan.md between my before snapshot (01:55) and my plan backup (02:04): the AP30-1–6 entries and §1.1/§2.1 text, 65 changed lines. So after.diff for the plan includes their changes as well as mine. Everything I changed in the plan is a separate hunk, and there were no further outside edits during my edits.

## Decisions for the orchestrator to log
Each is also in the plan's §8 "fixer 2b1b, round 2" entry.
1. **R1-1: which opened declarations hold a new comment.** Only opened declarations that are session content (new or rewritten since B). *Alternative:* the review's version, every opened declaration. That passes a comment above the person's own proof, which `openProof` opens, and it then reaches the stage as unowned text, caught at the step only by the A-ADV-3 catch-all.
2. **Seen while fixing R1-1, left as is.**
   - **The issue:** the stray-comment rule attaches a step's new comment against S₀, while computeItems at the stage attaches against B. So a new comment placed directly above session content the step did not open (trailing a declaration the step wrote or opened) passes the step. At the stage it goes with that other content and changes its content key.
   - **Why left:** reconcile then returns that item to review marked "updated", which is visible and never silent; Apply needs it accepted again. This was already so for a comment trailing a new declaration. I confirmed it with a scratch probe (/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2b1br2/probe/attach.probe.test.ts).
   - *Alternative:* at a step, judge each new comment by the stage's attachment (B → W), and refuse one whose owner there the step may not change.
3. **R1-3: a new token `uncovered`.** *Alternatives:* a flag on the finding, or one neutral sentence for both `session` and the uncovered case.

## Effects outside the repo and the scratch dir
- **Vite's config loader:** in four existing, git-ignored folders inside the repo, only the modification time changed. Each is empty:
  - `node_modules/.vite-temp`
  - `packages/core/node_modules/.vite-temp`
  - `packages/webview/node_modules/.vite-temp`
  - `packages/runner/node_modules/.vite-temp`
- **Unchanged:**
  - `node_modules/.vitest-cache` (1654 entries).
  - `packages/extension/out` and `dist`: nothing newer.
  - `/tmp`: the same entries as before. Its directory mtime changed at 02:16:32: some process created and removed an entry. I can't tell which; my commands all sent temp files to scratch.
- `capped.sh` created transient systemd user scopes.
- No git state changes (HEAD is still 187673d), no network, no installs, no Claude CLI, no Lean run.
- None of my processes remain (only VS Code's tsserver is running).
