# fix:2a:r1

Agent `afb171c21abce1b74` of workflow `wf_ae5f1188-533`. Verbatim output (JSON alongside).

## Fixer 2a, round 1: report

I fixed every finding in the working tree and judged none of them wrong. Two are fixed in a different way than suggested, explained under V2A-S2 and V2A-S5 below. The rest of the 2a1 and 2a2 work is kept.

`$S` = `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2ar1`

### Findings
- **V2A-S1 (major): fixed.**
  - New field `ItemRecord.judged {verdict, restsOn, deps}`, which reconcile sets.
  - RV-11 now applies to every Result in review or accepted: a changed verdict, Rests on or RV-5 dependencies counts as a changed key (rev + 1, "updated", accepted dependents back) and ends the force.
  - Shaky Results and Results to be redone with their content kept keep their status (D2-48) but record the new values.
  - Declined or taken-out Results keep what they recorded, so un-reject brings back the same version without "updated".
- **V2A-S2 (minor): fixed, differently from the suggestion.**
  - `decide` never compares a hidden item's rev, so the answer is "show them first" or `hidden-result` whatever rev is sent.
  - Undo checks D2-8 first and names no item.
  - Only a listed item whose rev or decision changed gives `conflict`.
  - A hidden item that a judge changed since, or whose restored Accept the rules now refuse, keeps its state silently. The rule check uses its real dependencies and iterates until nothing restored rests on an item that is not accepted. Anything the inverted commits bring back that must stay out goes into `revert`.
  - Why not the suggestion: `conflict` naming the action would still reveal that a hidden item changed, and §4.7's non-interference tests require byte-identical Undo outcomes.
- **V2A-S3 / C-V2A-C4 (minor): fixed.**
  - Undo puts `card` and the written key back from `takenOut`, so no new premise write is scheduled.
  - The write is non-null whenever the undone action had commits or `takenOut`, and it lists the premise in `reapply`.
  - The AF2 test now checks the card, the key and the whole write.
- **V2A-S4 (minor): fixed.**
  - The reveal `SessionAction` gains `changes` (D2-23's returns at that show), and its Undo restores them through the same checks as a decide Undo.
  - The undo-everything property test now also runs on sequences with Show results.
- **V2A-S5 / ADV-5 / C-V2A-C6 (fail-open part): fixed, differently from the suggestion.**
  - `ReviewState.results?` is removed; an Accept reads the verdict and Rests on from the record's `judged`, which reconcile always sets.
  - An Accept of a Result with no `judged` is refused, own or by a group (`blocked`).
  - Reconcile treats an accepted Result with no `accepted.result`, no `judged`, or no inference judgement as changed.
- **V2A-S6 (minor): fixed.** `acceptGate`, `isMeaningItem`, `isResultOrPart`, `depsById` and `fallbackLabel` are exported. §8 has "For 2e" and "For 2c2" bullets.
- **V2A-N1 (nit): fixed.** Added `CLAUDE_SESSION_TEXTS.strayComment` with §4.9's text.
- **V2A-N2 / C-V2A-C7 (nits): fixed.**
  - `conflictLabel` is used for known items, so labels are no longer double-quoted.
  - `historyChanged` for a stale Undo or Redo.
  - A new `needs-option` left reason for a plain group decline.
  - `acceptGate` checks in the own Accept's order (own) or the group's order (group).
- **C-V2A-C1 (major): fixed.**
  - A record whose key is unchanged takes its draft's content, on F5's unchanged path too.
  - D2-17 reads the step of the premise's current draft.
  - Only other steps' drafts of a withdrawn key leave `premises`.
- **C-V2A-C2 / ADV-2 (major): fixed.**
  - Un-reject reads what the decision commit took out from the action that declined the item.
  - Dependents come back only when nothing else keeps them out; everything else the merge brings back that must stay out goes into `revert`, which runs after the merge.
  - Reconcile treats a declined, reverted or withdrawn record's draft as a new proposal only when a queue ends and the draft is not an exact rejected repeat. Otherwise the record keeps its decision, `reverts` takes the content out again, and an event says so.
- **C-V2A-C3 / ADV-4 (minor/major): fixed.** Undo checks RV-7 on every restored Accept, own or group.
- **C-V2A-C5 / ADV-9 (minor): fixed.** basis(u) is {u} when u's proof uses sorry.
- **C-V2A-C6 (minor): fixed.** §2.2 and §2.9 now show all the contract fields.
- **ADV-1 (major): fixed.**
  - New force `via: 'decided'`, set by the reducer (decide and Undo) and by reconcile when only D2-23's returns would hide the results again.
  - It marks nothing seen early and ends like any other force.
  - The decide action records it as `startedForce`, so its Undo removes it.
- **ADV-3 (major): fixed.**
  - `ItemDraft.factsMissing` and `ItemClass.factsMissing` mark items whose module did not build.
  - Reconcile leaves such records unchanged. While any draft lacks facts it applies only the no-longer-builds reverts: no RV-11, inference-failure, RV-7 or RV-5 rule.
  - The reducer refuses Accepts of such items and skips D2-23 while any class lacks facts.
- **ADV-6 (major): fixed.**
  - Added a test for each untested Undo re-check: M1, M2, M3, M4, M44, M42 and M38.
  - The random test now has a judge step: reconcile on perturbed classes and dependencies.
  - It asserts RV-5 and "badges cover the class in force" after every step, and records `named` for Undo too.
- **ADV-7 (minor): fixed.** Added tests for M5, M7, M8, M9, M10, M11, M12, M21, M28 and M41.
- **ADV-8 (minor): fixed.** Redo keeps `own` only when the recorded request was one item.

### Files changed (16; backups in `$S/backup/`, list in `$S/changed_files.txt`, my patch in `$S/fixer_2a_r1.diff`)
- In `packages/core/src/review/`: `types.ts`, `reducer.ts`, `reconcile.ts`, `texts.ts`, `index.ts`, `classify.ts`, `items.ts`, `records.ts` (comment only).
- In `packages/core/test/review/`: `reducer.test.ts`, `reconcile.test.ts`, `reveal.test.ts`, `classify.test.ts`, `deps.test.ts`, `contracts.test.ts`, `helpers/records.ts`.
- `docs/slice2-plan.md`: §2.2 and §2.9 code blocks, short pointers in §3.5, §3.6, §4.1 and §4.6, amendments to the builder 2a2 bullets, and a new §8 entry "fixer 2a, round 1".

### Mutation checks
- All mutations ran on a scratch copy (`$S/mut`); the repo was never mutated. Script: `$S/mutate.py`; results: `$S/mutation_results.txt`.
- Baseline on the copy: "Test Files 9 passed (9) | Tests 155 passed (155)".
- **All 53 mutations make at least one test fail.**
  - They cover every fix above, plus the verifier's M1–M12, M21, M28 and M38–M44.
  - After each one, the file was restored and `cmp` with the repo file reported identical.
- Two needed a second run:
  - The first S5 reconcile mutation did not compile. With a valid mutation, 1 test failed.
  - M12 first passed every test. I strengthened the RV-3 chain test (new item order plus an existing dependent); on re-run, 1 test failed.
- C1 is two fixes, the content refresh and the current-draft step. Removing the refresh alone fails a test. Reverting the step lookup alone is masked by the refresh; reverting both fails.

### Verification (each under `capped.sh`, one at a time, binaries from `node_modules/.bin`)
- **tsc --noEmit:** exit 0 with no output for core `tsconfig.test.json`, runner `tsconfig.test.json`, webview `tsconfig.json` and `tsconfig.node.json`, and extension `tsconfig.json`.
  - The core run first failed on one readonly-array type error in my new test; I fixed it and the re-run gave exit 0.
- **vitest** (`--maxWorkers=1 --no-cache --fsModuleCachePath=$S/fsmc`, with `TMPDIR` and `TELELEAN_TEST_TMP` set to `$S/tmp`):
  - core: "Test Files 64 passed (64)", "Tests 753 passed (753)" (was 721; +32, all in `test/review/`: 155, was 123)
  - webview: "Test Files 19 passed (19)", "Tests 313 passed (313)"
  - extension: "Test Files 22 passed (22)", "Tests 203 passed (203)"
- **Runner:** no runner file uses the changed contracts (checked with grep), so no runner test file was touched. As a smoke check, `test/gate/pure.test.ts` and `test/semantic/checkFile.test.ts` with `timeout 900` gave "Test Files 2 passed (2)", "Tests 24 passed (24)".
- **Not run:** Playwright, the VS Code suite and the full runner suite.
- **Snapshots:** `$S/before.diff` and `$S/after.diff`, 335 files each. Only the 16 files above differ.

### Decisions for the orchestrator to log (all in §8 as "fixer 2a decided")
1. **RV-11 for every Result (V2A-S1):** in review or accepted, compared with `judged`; D2-48 statuses only record the new values. *Alternative:* accepted Results only, verdict and Rests on only (the builder's).
2. **Fail closed via `judged` (V2A-S5):** `ReviewState.results` is removed; an Accept without `judged` is refused, and an accepted Result with nothing to compare counts as changed. *Alternative:* keep `results` and make it required.
3. **Hidden items at Undo (V2A-S2):** the answer depends on listed items only, and changed or failing hidden items keep their state silently. *Alternative (the finding's):* `conflict` naming only the action.
4. **RV-7 at Undo for own Accepts too (ADV-4):** refused with RV-7's text. *Alternative:* restore it, then return it to review with D2-23's event.
5. **The `decided` force (ADV-1).** It departs from RV-6's letter only for items the person decided before the results were shown and that only telelean returned. *Alternatives:* record own Accepts with the union of both class maps, or hide the results again.
6. **Un-reject reads the declining action (V2A-C2):** what stays out goes into `revert`, run after the merge. Accepted limitation: a dependent kept out by a second decline is not brought back by that decline's later un-reject; Claude redoes it at Submit review. *Alternative:* the runner restores only the listed items' content per item.
7. **Reconcile's AF1 at a decision's judge (V2A-C2):** keep the decision and take the content out again, with an event. *Alternative:* a stage problem that disables Apply.
8. **D2-17 and content refresh (V2A-C1):** the earlier step's draft of a key proposed again stays in `premises`. *Alternative:* drop it.
9. **Missing facts (ADV-3):** a partial judgement applies only its no-longer-builds reverts, and Accepts of such items are refused. *Alternative:* make the item depend on every other item of its module (the SCC rule voids that when all of them lack facts).
10. **New wording** (`REVIEW_TEXTS`): `conflictLabel`, `historyChanged`, `resultNotJudged`, `acceptFactsMissing`, `leftNeedsOption`, `eventResultChanged`, `eventProposedAgain`, `eventTakenOutAgain`. **New left reason:** `needs-option`.

### Effects outside the repo and my scratch dir
- `capped.sh` created one transient systemd user scope per heavy command; each ended with its command.
- vitest wrote and deleted its bundled config in four `.vite-temp` folders, which are empty again with only their mtimes changed:
  - `packages/{core,webview,runner}/node_modules/.vite-temp`, inside `packages/`;
  - the repo root's `node_modules/.vite-temp`, from the extension run, which is outside the allowed write locations.
- Nothing else:
  - `node_modules/.vitest-cache` (mtime 17:05), the `.vite` results caches, and `packages/extension/out` and `dist` (13:47) are unchanged;
  - no new files of mine in `/tmp`;
  - no git state change, npm/npx, network or Claude CLI;
  - no processes of mine are left (the running `tsserver` processes are VS Code's).
- Python wrote a `__pycache__` folder inside `$S` only.
