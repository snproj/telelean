# verify:2b3b:fc

Agent `acd3ececb5eaf32d8` of workflow `wf_4dd05c42-199`. Verbatim output (JSON alongside).

- **summary:** The 2b3b builder report holds up: everything compiles and every test passes, the §1.1 bullets for 2b3b are implemented, the §6.1 2b3b tests exist and test what they claim, and R1-1 is fixed. But I found three real defects, each confirmed with a small real-Lean demo test that I wrote and ran only in my scratch dir.

What matches the plan:
- G0 runs before any Lean job at every purpose.
- A session step decides on `stepFindings` with §2.1's failed-probe rule, never on `ok` alone.
- writePremise and complete refuse a failed probe (AP30-4).
- The re-export is built from the freeze's own copy.
- The shadow has the new commit kinds and `lastCommitSince`.
- planApply refuses drift.

My checks match the builder's numbers:
- tsc is clean for all 5 projects.
- core 1133 tests, webview 314, extension 205: all passed.
- Runner, with real Lean: 106 + 49 + 93 + 11 + 22 + 9 + 22 tests passed, slightly more files than the builder ran.
- I found no core or webview change, no git change, nothing written to dist/out or /tmp, and no leftover telelean units.

The defects:
1. **Lost premise re-check.** judge remembers which drafts it has checked against the inputs it last checked them with. When a judge's outcome is dropped because a decision moved the head (which §2.6 expects to happen), the next judge skips the draft. A "no longer closes the gap" result is then never reported (RV-1).
2. **complete is not safe to replay.** It accepts only a newest commit of kind `adopt`. After recover() reverts ws/ with a `revert` commit (a crash during the completion), the replayed completion is refused, though the files are identical. A completion that becomes due later (recover() enqueues it, e.g. an unused premise after its target's Result is rejected) fails the same way. This breaks §2.6's idempotent replay and §3.8's "a crash … loses nothing".
3. **Ghost check misses a just-proposed arrow.** The session ghost check reuses a judgement cached by the files alone. Right after propose_arrow (a ledger entry, no file change), it refuses a gap proof that uses the new arrow's source, so §3.8's "with E(T)" fails in the most common sequence. It fails closed (refuses rather than passes) but gives Claude a misleading reason.

Two minor gaps:
- S₀ can be built without G0 having checked its text.
- A session ghost check without `leanName` silently refuses every suggestion with a misleading message.
- **findings:**
  - [1]
    - **id:** FC-1
    - **severity:** major
    - **where:** packages/runner/src/gate/engine.ts:1412-1455 (premiseRechecks: `if (memo.get(key) === reliance) continue;` line 1431, `memo.set(key, reliance)` lines 1435/1451)
    - **problem:** The memo of judge's premise re-checks is updated when the check runs, not when its result is applied. §2.6 drops a judge's `judge-apply` write when a decision moved the head meanwhile, and the judge runs again on the new head (one judge at a time, coalesced, §3.6). If that decision changed nothing the draft relies on, the reliance key is unchanged, so the second judge skips the draft and its `premiseChecks` lack it. The first judge's `closesGap: false` is never reported. The draft stays in review (or accepted) although it no longer closes the gap, against RV-1 / §3.8 ("re-checks whenever something it relies on changes"). Only a reload, which builds a new engine, or a later change to the reliance brings the result back. 2d and 2f cannot work around it: there is no API to clear the memo.
    - **evidence:** A real-Lean demo using the builder's own premise setup: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2b3b-fc/demo/memo.test.ts, log in v2b3b-fc/logs/demo_memo2.log. Output: `judge 1 premiseChecks {"premise:cynder-not-good:not_in_game_not_good":true}`; after the builder's own change to pg_no_dark_past (a decision commit): `judge 2 … :false`; after a second, unrelated decision commit (judge 2's judge-apply dropped): `judge 3 premiseChecks null`; a fresh engine on the same head: `… :false`. reconcile.ts:396-406 shows why returning a cached result again would be harmless: a record already to be redone and reverted is skipped.
    - **fix:** Keep the outcome with the reliance key (memo: item key -> { reliance, closesGap, facts }). On a hit, put the cached result in `premiseChecks` again without a Lean job; core reconcile already skips a reverted to-be-redone record, so a repeat is idempotent. Add a test: judge (check runs, closesGap false) -> a commit that changes nothing the draft relies on -> judge again still reports closesGap false.
  - [2]
    - **id:** FC-2
    - **severity:** major
    - **where:** packages/runner/src/gate/engine.ts:1642-1643 (completeNow: `const adopt = await this.headOf(shadow); if (adopt.kind !== 'adopt') return { ok: false, … }`)
    - **problem:** complete refuses unless the shadow's newest commit is of kind `adopt`. Two cases break:
1. A crash after the completion's step 2 (its text already in ws/; also after complete's own `completion` commit but before step 4). §2.6's recover() then reverts ws/ to `head` (the adopt commit) with a `revert` commit and runs inFlight again ("which is idempotent"). The replayed complete is refused, though the files are exactly the adopt state.
2. A completion that becomes due later. recover() enqueues every due completion (§3.8, D2-71). For example, a premise written while T was proved ("unused premise") becomes due once the person rejects T's Result, and the newest commit is then that decision. The premise is never completed.
In both cases the completion fails, T's Result is marked "completion not checked", and a Claude Retry step is offered. This breaks §3.8's "a crash between the Accept, the write and the completion loses nothing". The builder's tests pin the strict rule ("(the newest commit is completion)" / "is freeze").
    - **evidence:** A real-Lean demo following the builder's premise flow: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2b3b-fc/demo/replay.test.ts, log in v2b3b-fc/logs/demo_replay.log. Steps: writePremise makes the adopt commit, the completion text is written into ws/, `shadow.revertTo(adopt)` plays recover() (the revert commit's files equal the adopt commit's), then the completion is written again. Output: `newest commit after recover(): revert`, then `complete after the replay: {"ok":false,"error":"the completion of “cynder-not-good” must start from its premise's adopt commit (the newest commit is revert)"}`.
    - **fix:** Take the state to freeze from as the head the completion is written on, and check what the completion needs rather than the commit's kind: the written premise's card is in it, a ledger `premise` entry exists for the item, and T is not proved there. A narrower alternative: use `lastCommit(['adopt'])` and accept a newer head only when its files equal that adopt commit's. Add a test that replays a completion after `revertTo(adopt)`, and one for a completion that becomes due after a decision commit.
  - [3]
    - **id:** FC-3
    - **severity:** major
    - **where:** packages/runner/src/gate/engine.ts:1191-1222 (checkGhostNow: the cached `cleanModels` judgement keyed by `filesKey(files)` only, then `sessionGhostRules(judgement.inferences[target])`)
    - **problem:** In a session, the ghost check takes B.1's permitted set and B.2's sources (E(T)) from the judgement cached with the last clean check of the same files. The cache key is the files alone. propose_arrow adds a ledger `arrow` entry and changes no file until the step's next normalise (§2.8), and E(T) counts "the active step's own [arrows] before its normalise draws them" (§4.8). So propose_assumption right after propose_arrow (no check_lean in between) is judged without the new arrow. A gap proof using that source is refused, against §3.8 ("it uses B.1's permitted set with E(T); B.2's allowed set is the sources of Q(T) ∪ E(T)") and the 2b3b deliverable "the ghost check with E(T)". The refusal even tells Claude it may use "yours into the target". It fails closed: nothing unsafe passes. But it breaks the main flow for Claude's own arrows, and Claude may then give up on the premise.
    - **evidence:** A real-Lean demo: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2b3b-fc/demo/ghostcache.test.ts, log in v2b3b-fc/logs/demo_ghost.log. Setup: two-arrow Spyro, a freeze (which caches the judgement), then the context's ledger gains the step's arrow new-spyro-pg -> T with ws/ unchanged. The same engine answers ["The proof that the suggestion closes the gap rests on axioms outside the permitted set: `Spyro.new_spyro_pg.holds`. It may use only the .holds of the target's sources (the arrows the person selected, and yours into the target)…"]. A fresh engine with the same context and files answers {"ok":true, footprint …"Spyro.new_spyro_pg.holds"…}.
    - **fix:** Make the cached judgement depend on the session context, not only on the files. Either add a hash of ctx.session (ledger, inferences, items, rejectedArrows, scope, stepStartCommit) to the `cleanModels` key, or recompute judgeState (pure, no Lean) on the cached model with the current ctx and S₀ (stepStartModel) before reading B.1. Add a test: freeze, then a ledger arrow with no file change, then checkGhost must allow that source.
  - [4]
    - **id:** FC-4
    - **severity:** minor
    - **where:** packages/runner/src/gate/engine.ts:673-691 (stepStartModel builds S₀ with `this.build(shadow, ctx.job, files, key)` when this engine has no facts for S₀'s files)
    - **problem:** AP30-1 r2 (§1.1's 2b3b, §2.1): G0 runs before any Lean job, and "text G0 refuses never reaches the mirror, where every Lean job runs". runCheck applies G0 only to ws/; S₀'s own files are built without G0 in that call. This has a concrete path. A stage judge that G0 refused builds nothing, so the engine caches no facts for that head. ES-4 still allows Formalize from a stage that did not pass (and Retry step when a step failed). The new step's S₀ is then that head. The first check whose ws/ passes G0 (for example, Claude removed the refused line) builds S₀'s refused text in the mirror. The text can reach the head only from legacy content (for example a converted v1 run written before the `init`-attribute rule), so the impact is low.
    - **evidence:** In runCheck the order is: G0 on ws/ (line 743), then `stepStartModel` (line 752), which calls `build` on S₀'s files when `this.recent` has no facts for them. In judgeNow a G0 refusal returns before `factsFor` (no build, nothing cached).
    - **fix:** In stepStartModel, run `this.g0Of(ctx, baseFiles, s0Files)` before building S₀. When it finds anything, return an environment outcome (or G0's findings) and run no Lean job. Add S₀ holding `@[init] def x : IO Unit := pure ()` with a clean ws/ to the G0-first test (no refresh, no syncMirror).
  - [5]
    - **id:** FC-5
    - **severity:** minor
    - **where:** packages/runner/src/gate/engine.ts:1170-1176 (checkGhost validation) and 1229-1231 / 1311-1314 (facts only when `ghost.leanName !== undefined`)
    - **problem:** In a session, the ghost check needs `GhostCheckInput.leanName` to build the draft's facts. Without it, `facts` is undefined and every suggestion is refused with "telelean could not read the suggested statement back from Lean (its fully explicit form, or what it uses)…". That blames Lean for a missing caller argument and hides the mistake from 2d, whose propose_assumption handler must pass it. writePremise and complete validate their premise argument with a TypeError (validatePremise); checkGhost does not.
    - **evidence:** `GhostCheckInput.leanName?` is optional in gate/types.ts. checkGhost validates only `leanStatement` and `proof`. ghostScratchCheck builds `facts` only when `ghost.leanName !== undefined`, and checkGhostNow refuses when `rules.session && outcome.facts === undefined`.
    - **fix:** In checkGhost, when ctx.session is set, throw TypeError unless `ghost.leanName` is a non-empty string, as validatePremise does. Add it to the 'a step purpose in a session needs its scope and S₀' test.
- **checks_run:**
  - Read verify_common.md, brief 2b3b.md, builder_rules.md; plan §0, §1.1 (2b3a/2b3b), §2.1, §2.6, §2.7, §2.9, §3.1-3.13, §4.8-4.12, §6.1 2b3a/2b3b, §8 (builder 2b3b entry)
  - Isolated 2b3b's diff: snapdiff.sh -> v2b3b-fc/now.diff; rebuilt the 2b3a version of each changed file from HEAD + after_slice_2b3a.patch (git apply in scratch); it matches the builder's orig/ copies (probe.test.ts orig was saved after the R1-1 edit)
  - Read every changed file: engine.ts (full), session.ts, scratch.ts, gate/types.ts, gate/index.ts, shadow/types.ts, workspace.ts, proposal/service.ts, proposal/types.ts, the fakes, realRuns.test.ts, session.test.ts, sessionPure.test.ts, shadow.test.ts and accept.test.ts additions; cross-checked core judgeState (G1 in global; ok = !buildFailed && global empty && no facts problem), permittedFor (contrib = Q(T)∪E(T) with arrows in the judged state), reconcile premiseChecks handling, arrowFindings (undrawn active-step arrows not refused)
  - R1-1 carry-over: probe.test.ts:175-176 comment now says argv and timeout and names the test "refresh's probe job (fixer 2b3a r1, S-V2B3A-S2)", which exists at line 404
  - No it.skip/only/todo added or tests removed; no core/webview file changed; git HEAD 187673d unchanged, no stash/branch; packages/extension/dist and out untouched (mtimes 2026-11-19 13:47); nothing new at /tmp top level 14:50-16:20; no telelean-* systemd units left
  - capped.sh 1800 node_modules/.bin/tsc --noEmit -p packages/core/tsconfig.test.json -> exit 0, no output
  - capped.sh 1800 tsc --noEmit -p packages/runner/tsconfig.test.json -> exit 0, no output
  - capped.sh 1800 tsc --noEmit -p packages/webview/tsconfig.json -> exit 0, no output
  - capped.sh 1800 tsc --noEmit -p packages/webview/tsconfig.node.json -> exit 0, no output
  - capped.sh 1800 tsc --noEmit -p packages/extension/tsconfig.json -> exit 0, no output
  - core: TMPDIR=<scratch>/tmp capped.sh 1800 timeout 900 vitest run --no-cache --fsModuleCachePath=<scratch>/fsmc --maxWorkers=1 -> 'Test Files  76 passed (76)' / 'Tests  1133 passed (1133)'
  - webview: same command -> 'Test Files  19 passed (19)' / 'Tests  314 passed (314)'
  - extension (--no-cache): same command -> 'Test Files  22 passed (22)' / 'Tests  205 passed (205)'
  - runner (TELELEAN_TEST_TMP and TMPDIR in scratch, capped.sh 3000 timeout 900, --maxWorkers=1, real Lean): gate/session + gate/sessionPure + shadow/shadow + shadow/seed + proposal/ -> 'Test Files  10 passed (10)' / 'Tests  106 passed (106)'
  - runner gate/engine + gate/pure -> 'Test Files  2 passed (2)' / 'Tests  49 passed (49)'
  - runner gate/rules + run/manager.{accept,caps,gate,happy,lifecycle,rounds,start} + run/prompts -> 'Test Files  9 passed (9)' / 'Tests  93 passed (93)'
  - runner integration/m2flow + semantic/probe -> 'Test Files  2 passed (2)' / 'Tests  11 passed (11)'
  - runner workspace/m2members + workspace/refresh -> 'Test Files  2 passed (2)' / 'Tests  22 passed (22)'
  - runner run/fresh.e2e -> 'Test Files  1 passed (1)' / 'Tests  9 passed (9)'
  - runner run/walkthrough.e2e -> 'Test Files  1 passed (1)' / 'Tests  22 passed (22)'
  - Demo tests I wrote and ran, all in my scratch dir (scratch vitest config v2b3b-fc/demo/vitest.config.mjs, same caps, real Lean, temp trees under TELELEAN_TEST_TMP in scratch and removed afterwards): memo.test.ts -> 'judge 3 premiseChecks null' after 'judge 2 … :false' (FC-1); replay.test.ts -> 'complete after the replay: {"ok":false,…(the newest commit is revert)}' (FC-2); ghostcache.test.ts -> the same engine refuses with `Spyro.new_spyro_pg.holds` outside the permitted set, a fresh engine gives ok:true (FC-3)
