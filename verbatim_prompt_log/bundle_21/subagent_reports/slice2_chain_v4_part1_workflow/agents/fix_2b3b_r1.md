# fix:2b3b:r1

Agent `a44461882432b1982` of workflow `wf_4dd05c42-199`. Verbatim output (JSON alongside).

- **report:** FIXER 2b3b, ROUND 1: REPORT

All 12 findings are fixed; I judged none of them wrong. F-FC-1 and A-V2B3B-ADV-3 are the same defect, and F-FC-4 is part of ADV-4. The work is runner-only plus the plan: no core source, no webview file and no git changes. Every package typechecks, every unit suite passes, and every runner test file the change touches passes with real Lean. I ran 30 mutation checks: each was caught by at least one test, and each file was restored byte for byte (checked with `cmp`).

## Findings

**F-FC-1 (major) / A-V2B3B-ADV-3 (major): fixed.**
- The re-check memo now keeps each draft's outcome (closesGap and facts) and the constants its gap proof used, beside the reliance key.
- When the key is unchanged, `judge` reports that outcome again in `premiseChecks` with no Lean job. So a judge whose `judge-apply` was dropped loses nothing.
- Reconcile's step 5 takes a repeat safely: a draft already to be redone and reverted is skipped, and its facts are replaced by the same ones.
- `premiseChecks` now lists every draft judged on the state. It is absent when there is none.

**F-FC-2 (major): fixed.**
- `complete` no longer requires the newest commit to be of kind `adopt`. It freezes again from the state the completion is written on: the shadow's newest commit, which is the write's parent.
- That state is checked by what it holds: a ledger `premise` entry for the item, the premise's card in that state, and T not proved there. Everything after that is unchanged.
- A replay after recover()'s `revert` commit now passes (real-Lean test). A second completion is refused as "already proved".

**F-FC-3 (major): fixed.**
- The ghost check reuses a clean check's judgement only under the same session records. A new pure helper, `sessionContextKey`, hashes inferences, ledger, items, premises, ended, rejectedArrows, scope, stepStartCommit and noAlternative.
- Otherwise the clean check runs again under the current records.
- Real-Lean test: a ghost check right after propose_arrow, with no file changed since the freeze, now passes using the new source.

**F-FC-4 (minor): fixed**, as part of ADV-4 below.

**F-FC-5 (minor): fixed.** A session's `checkGhost` throws a TypeError without a non-empty `ghost.leanName`. Without a session, nothing changes.

**A-V2B3B-ADV-1 (major): fixed.**
- `relianceKey(draft, model, targetStatement, b1, proofConsts)` now walks core's `reach(…, 'uses')` from four starting points: the footprint, the statement's closure, T's statement, and the constants the gap proof used.
- Those constants come from the draft's last check and are kept in the memo; a failed check keeps the previous ones.
- The key hashes the meaning, with `#print axioms`, of every declaration the walk reaches, not only of the starting names.
- So it now changes when a source's statement is reworded under the same constants, when a lemma of the gap proof is removed or changed, when a lemma's own proof changes, and when a definition only T's statement reaches changes.

**A-V2B3B-ADV-2 (major): fixed.**
- The scratch check has a new outcome, `unchecked`. It covers:
  - a run that failed with no message;
  - errors only in telelean's own lines of the ghost file, or any error in its header (new `GhostScratchResult.errorsAt`);
  - no `#print axioms` answer;
  - B.2's UNSEEN_PROOF.
- A re-check whose outcome is a budget, an environment failure or `unchecked` leaves the draft out of `premiseChecks`, remembers nothing, and is tried again at the next judge.
- Only Lean errors in the statement or proof, sorry, a footprint outside the permitted set and B.2's card findings give `closesGap: false`.
- propose_assumption's ghost check still refuses `unchecked` outcomes with the same problem texts, so nothing changes for Claude.

**A-V2B3B-ADV-4 (minor): fixed.**
- `stepStartModel` runs G0 on S₀'s files before building or using them. If G0 finds anything, nothing is synced or built, and the step's check is an `environment` outcome.
- `complete` runs G0 on the state it starts from as well as on the completion.
- A premise re-check applies core's `ghostTextProblems` first. A draft it refuses no longer closes the gap, with no Lean job.

**A-V2B3B-ADV-5 (minor): fixed.** Three new tests:
- `complete` refuses a completion that also adds `axiom extra_fact : True` (the gate's step findings), with no commit.
- `complete` refuses, with a lenient judgeState, the target's statement weakened after its starting state (comparator definition-mismatch), with no commit.
- A session ghost check whose statement-probe line is removed from Lean's real answer is refused (fail closed).

**A-V2B3B-ADV-6 (minor): fixed.**
- `finalCheck` returns an `environment` outcome, with nothing built, unless ws/ equals the newest commit.
- `ApplyRequest.finalState` is now required; a request without it is a compile error and a runtime TypeError.

**A-V2B3B-ADV-7 (nit): fixed.** `complete` refuses when `ctx.freeze.selection.target` is not the premise's target.

## Files changed
Each original is in `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2b3br1/backup/<path>`, and each path is listed in `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2b3br1/changed_files.txt`. The before/after snapshot comparison shows exactly these 11 files changed.
- `packages/runner/src/gate/engine.ts`: the memo with outcomes and the re-emission; `premiseCheck`; the `unchecked` outcome; the gap proof's constants; the cache under `sessionContextKey`; the `leanName` TypeError; G0 on S₀ and on the completion's starting state; `complete` by content and T's own freeze; `finalCheck`'s ws/ rule.
- `packages/runner/src/gate/session.ts`: the wider `relianceKey` (`proofConsts`, the uses walk); new `sessionContextKey`.
- `packages/runner/src/gate/scratch.ts`: `GhostScratchResult.errorsAt`.
- `packages/runner/src/gate/types.ts`: docs for judge, finalCheck, complete, checkGhost and `GhostCheckInput.leanName`.
- `packages/runner/src/gate/index.ts`: exports `sessionContextKey`.
- `packages/runner/src/proposal/types.ts`: `ApplyRequest.finalState` required.
- `packages/runner/src/proposal/service.ts`: `planApply`'s TypeError, and no default to ws/.
- `packages/runner/test/gate/session.test.ts`: 26 tests (was 21).
- `packages/runner/test/gate/sessionPure.test.ts`: 20 tests (was 15).
- `packages/runner/test/proposal/accept.test.ts`: the `planApply` test, with `finalState` required.
- `docs/slice2-plan.md`: a note in §2.9, notes in §3.8 and §3.10 step 4, and the §8 entry "fixer 2b3b, round 1".

## Tests
**New in `session.test.ts`:**
- re-check outcomes with canned Lean answers (a spy on the engine's `leanStdin`): each `unchecked` case and a budget are left out and tried again; a proof error is remembered; the outcome is reported again after an unrelated decision commit, with no Lean job;
- the single-term rule on a re-check;
- the ghost check right after propose_arrow (real Lean);
- a reworded source, then a lemma taken out (real Lean, with the re-emission);
- the statement probe that cannot be read back (real Lean).

**Extended in `session.test.ts`:**
- `leanName` validation;
- G0 on S₀ and on the completion's starting state, with spies showing no refresh and no sync;
- `complete`'s early refusals: another target's freeze, no ledger entry, no card, T already proved;
- `finalCheck` with ws/ ahead of or behind the newest commit;
- the judge test's re-emission (real Lean);
- the completion flow: an extra axiom, the comparator's refusal, the replay after `revertTo(adopt)`, and "already proved".

**`sessionPure.test.ts`:** `relianceKey`'s three missed reliances and the uses walk into a lemma's proof; `sessionContextKey`; `errorsAt`.

No test was deleted, skipped or moved.

## Mutation checks
30 in total. Tooling is `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2b3br1/mutate.py` with `mutations.py` and `mutations.json` in the same folder. Results are in `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2b3br1/mutation-results.jsonl`, with one log per mutation in its `logs/` folder. Each entry is file:line, what was broken, and the test that failed. Paths are under `packages/runner/src/` unless noted.

**Re-emission and what telelean could not judge**
- `gate/engine.ts:1488`: a memo hit reports nothing → the canned re-check test (M01); separately, the real-Lean reliance test (M02).
- `gate/engine.ts:1528`: a budget made `closesGap: false` → canned test (M03). `unchecked` made false → canned test (M04).
- `gate/engine.ts:1331`: a run with no message counted as Claude's → canned test (M05).
- `gate/engine.ts:1333`: telelean-only errors counted as Claude's → canned test (M06).
- `gate/engine.ts:1334`: no axioms counted as Claude's → canned test (M07).
- `gate/engine.ts:1354`: UNSEEN_PROOF counted as Claude's → canned test (M08).
- `gate/scratch.ts:272`: a header error ignored → canned test and the `errorsAt` pure test (M09).

**G0 on other states**
- `gate/engine.ts:1518`: no single-term rule on a re-check → single-term test (M10).
- `gate/engine.ts:706`: no G0 on S₀ → G0-first test (M11).
- `gate/engine.ts:1767`: no G0 on the completion's starting state → G0-first test (M12).

**The reliance key**
- `gate/session.ts:235`: names only from the starting points → three pure reliance tests (M13) and the real-Lean reliance test (M14).
- `gate/session.ts:234`: `meaning` mode instead of `uses` → the pure lemma test (M15).
- `gate/session.ts:233`: no `proofConsts` → the pure lemma test (M16).
- `gate/engine.ts:1493`: the new constants never kept → real-Lean reliance test (M17).

**Cache, `leanName`, final state**
- `gate/engine.ts:1237`: the cache used whatever the records → propose_arrow ghost test, real Lean (M18).
- `gate/session.ts:257`: `sessionContextKey` without the ledger → its pure test (M19).
- `gate/engine.ts:1212`: no `leanName` check → the validation test (M20).
- `gate/engine.ts:1576`: `finalCheck` whatever ws/ holds → the head test (M21).
- `proposal/service.ts:356`: `planApply` defaults to ws/ → the `planApply` test (M22).

**`complete`**
- `gate/engine.ts:1743`: no freeze-target check → early-refusal test (M23).
- `gate/engine.ts:1752`: no ledger check → early-refusal test (M24).
- `gate/engine.ts:1756`: no card check → early-refusal test (M25).
- `gate/engine.ts:1759`: no "already proved" check → early-refusal test (M26).
- `gate/engine.ts:1751`: the strict adopt-head rule put back → completion flow, which fails "the newest commit is revert" at the replay (M27).
- `gate/engine.ts:1824`: the gate's step findings ignored → completion flow, the extra axiom passes (M28).
- `gate/engine.ts:1827`: the comparator's findings ignored → completion flow, the cheat passes (M29).
- `gate/engine.ts:1280`: no read-back check in the session ghost check → statement-probe test (M30).

## Verification
Each heavy job ran through `capped.sh`, one at a time; MemAvailable was about 11.2–12.9 GB.

**Typecheck:** `capped.sh 1800 node_modules/.bin/tsc --noEmit -p` on `packages/core/tsconfig.test.json`, `packages/runner/tsconfig.test.json`, `packages/webview/tsconfig.json`, `packages/webview/tsconfig.node.json` and `packages/extension/tsconfig.json`. All exited 0 with no output.

**Unit tests:** `TMPDIR=<scratch>/tmp capped.sh 1800 timeout 900 vitest run --no-cache --fsModuleCachePath=<scratch>/fsmc --maxWorkers=1`, run in each package:

| Package | Test Files | Tests |
|---|---|---|
| core | 76 passed (76) | 1133 passed (1133) |
| webview | 19 passed (19) | 314 passed (314) |
| extension | 22 passed (22) | 205 passed (205) |

**Runner:** from `packages/runner`, with TMPDIR and TELELEAN_TEST_TMP in the scratch dir, `capped.sh 3000 timeout 900 … --maxWorkers=1`:

| Runner test files | Test Files | Tests |
|---|---|---|
| `gate/session` + `gate/sessionPure` + `proposal/` | 8 passed (8) | 86 passed, 7 skipped (93) |
| `proposal/build` alone, re-run | 1 passed (1) | 7 passed (7) |
| `gate/engine` + `gate/pure` | 2 passed (2) | 49 passed (49) |
| `gate/rules` + the seven `run/manager.*` | 8 passed (8) | 80 passed (80) |
| `integration/m2flow` | 1 passed (1) | 5 passed (5) |
| `run/fresh.e2e` | 1 passed (1) | 9 passed (9) |
| `run/walkthrough.e2e` | 1 passed (1) | 22 passed (22) |
| final re-run of `gate/session` + `gate/sessionPure` on the final files | 2 passed (2) | 46 passed (46) |

- The 7 skipped tests were `proposal/build.test.ts`'s real-Lean tests. That file skips them itself below 12 GiB available, and memory was about 11.6 GB at the time. Re-run alone later, all 7 passed.
- No webview file changed, so there was no scratch build and no Playwright run.

## Decisions for the orchestrator to log
Each is also in the plan's §8 as "fixer 2b3b r1 decided".
1. **Re-emitted re-check outcomes (F-FC-1, ADV-3).** The memo keeps each draft's outcome and its gap proof's constants. A draft whose reliance key is unchanged gets that outcome again with no Lean job, so `premiseChecks` lists every draft judged on the state. *Alternative:* an engine call that forgets a draft's memo, which 2d would have to make whenever a judge-apply is dropped.
2. **The reliance key (ADV-1).** Core `reach` in `uses` mode from the footprint, the statement's closure, T's statement and the gap proof's constants at its last check, hashing the meaning and axioms of every name reached. *Alternative:* the `meaning` closure, which stops at a lemma's type and misses what its proof uses, which B.2's walk reads.
3. **What telelean could not judge (ADV-2).** A budget, an environment failure and the new `unchecked` outcome leave the draft out, remember nothing, and are tried again at the next judge. The ghost check refuses them as before. *Alternative:* remember `unchecked` with the key. That means fewer Lean jobs, but a transient memory shortage would hide a real change until something else changes.
4. **The ghost check's cache (F-FC-3).** A clean check's judgement is reused only under the same session records (`sessionContextKey`; not the freeze, which B.1 does not read). Otherwise the clean check runs again, with one more build of the same files. *Alternative:* recompute judgeState (pure) on the cached model under the current records with no build, which needs S₀'s model and B again outside runCheck.
5. **`complete`'s starting state (F-FC-2, ADV-7).** The newest commit, checked by content (ledger entry, card, T not proved), never by kind; `ctx.freeze` must be T's own. *Alternative:* `lastCommit(['adopt'])` with a newer head accepted only when its files equal that commit's. That covers a crash replay but not a completion that becomes due after a decision.
6. **G0 on other states (F-FC-4, ADV-4).** S₀ that G0 refuses gives an `environment` outcome with nothing built (Claude cannot change S₀). `complete` runs G0 on its starting state too. A re-check applies the single-term rule, and a refused draft no longer closes the gap. *Alternatives:* judge S₀ without facts, which skips D2-41's meaning comparison; leave a refused draft out.
7. **`leanName` (F-FC-5).** Required in a session: a TypeError, as `writePremise` does for its draft. *Alternative:* keep it optional with a clearer refusal text.
8. **The final state (ADV-6).** `finalCheck` returns an `environment` outcome unless ws/ equals the newest commit; `ApplyRequest.finalState` is required. This changes builder 2b3b's own additive contract (`finalState?`), which no later sub-slice uses yet; §2.9's note records it. *Alternatives:* judge ws/ and commit a checkpoint when they differ, which puts a side effect in a check; keep `finalState` optional with ws/ as the default.

## Effects outside the repo and my scratch dir
- **Transient systemd user scopes:** from `capped.sh`, and runLean's `telelean-*` units during the real-Lean tests and mutation runs. None is left: `systemctl --user list-units 'telelean-*'` lists nothing.
- **Real Lean in three mutation runs:** in M23–M25, the mutated `complete` (its early checks disabled) built a real G4 challenge. This happened in the test's own shadow under TELELEAN_TEST_TMP, inside my scratch dir.
- **Lean toolchain:** run from the pinned binaries, read only. `~/.elan/known-projects` is unchanged (last modified Nov 17), and the tests assert that too.
- **Vite temp folders:** vitest's config loader created and removed its temporary bundled config in the existing `packages/{core,runner,webview}/node_modules/.vite-temp` folders. They are empty again; only their modification times changed. No cache file was written: every vitest run used `--no-cache`, `--fsModuleCachePath` in the scratch dir, and TMPDIR in the scratch dir.
- **No other writes:** nothing outside the scratch dir in /tmp; nothing under `packages/extension/dist` or `out`; no network, no installs, no npm or npx, no git changes.
- **Processes:** I left none running. The Lean server on `/home/zhengyew/webring`, a `claude -p` run started by the VS Code extension, and `ramwatch.sh` are not mine and were not touched.

## Scratch files
Everything is in `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2b3br1/`: `before.diff`, `after.diff`, `backup/`, `changed_files.txt`, `logs/`, and the mutation tooling and results listed above.
- **notFixed:**

