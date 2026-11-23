# Subagent report: build:2j1 (agent a7f0de30ec7a5ab51, workflow wf_93090c56-47b)

Meta: {"agentType": "workflow-subagent", "isBuiltIn": true, "description": "build:2j1", "workflowPhase": "Build", "spawnDepth": 1, "requestShape": "foreground", "requestNonInteractive": true, "model": "claude-opus-5-5", "pickedEffortModel": "claude-opus-5-5", "inWorkflowRun": true}

Verbatim return value:

````
## Builder 2j1 report (2026-11-22): items to be redone (the user's D2-76, turn 25)

2j1 is built as D2-76 states (D1–D7). Every package compiles and every unit test passes. The changed behaviour:
- **Finished for the review.** An item to be redone keeps no result hidden and does not block Submit.
- **No Back to review by hand.** It is refused for every item to be redone, with core's sentence "Claude redoes it at Submit review. To review it yourself now, set back to review what it depends on, or use Undo."
- **Automatic return.** When what took an item down is set back to review, the item comes back with it, transitively, in the same action.
- **The cause is shown** in the item's detail and as its row's tooltip.
- **Submit's closed reason is visible text** in the session bar.
- **Old sessions load unchanged**: only additive fields, no migration.

HEAD is still c557f06, nothing is staged, and there are no git changes. The plan was updated first, then built. The extract was regenerated after the plan update and again at the end: /tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad/extracts/plan_2j1.md (2091 lines; it keeps my 2 §8 entries).

### Files changed (all under /home/zhengyew/telelean)

**Core**
- `packages/core/src/review/types.ts`: new `RedoKind`; `ItemRecord.redo.kind?` (additive).
- `packages/core/src/review/records.ts`: `isUndecided` now means "in review" only; new `copyRedo`, used by `itemStateOf` and `applyItemState` so `kind` survives Undo.
- `packages/core/src/review/reveal.ts`: doc comments only.
- `packages/core/src/review/reducer.ts`:
  - D2 refusals in `backToReview` and `itemGates`;
  - the cascades write `kind`, and `cascadeShaky` adds its cause to dependents already to be redone (D2-80);
  - DO-0's question change is `question` kind (D2-81);
  - new `releaseReturned` and `holdsUp`, called by `decide` before `settleMergedBack`;
  - the return's events;
  - the same-request Accept guard (D2-87).
- `packages/core/src/review/reconcile.ts`: kinds `judge` (reverts, their dependents, premise re-checks) and `queue` (RV-3); a dependent already taken out gets the reverted item in `because` (D2-80).
- `packages/core/src/review/texts.ts`:
  - removed `submitResultsHidden` and `contentTakenOut`;
  - added `redoneByClaude`, `eventBackWith`, `eventBackShakyWith`, `redoLine`, `redoDependsOn`, `redoCauseState`, `redoTookOut`, and the `redoReason*` texts.
- `packages/core/src/review/view.ts`: `ItemView.redo.why` (additive); Submit's hidden-results branch is now fail-closed with `showResultsFirst` (D2-86).

**Runner**
- `packages/runner/src/run/review.ts`: Submit's take-out writes `kind: 'take-out'`; `submitNow`'s hidden branch uses `showResultsFirst`.

**Webview**
- `packages/webview/src/model/review.ts`: `ReviewRow.title` and `redoLines`.
- `packages/webview/src/model/sessionBar.ts`: `submit.reason`.
- `packages/webview/src/run/review/ItemDetail.tsx`: the footer of an item to be redone shows the cause lines and the refusal sentence; no Back to review link, no Decline button.
- `packages/webview/src/run/review/ReviewList.tsx`: the row's `title`.
- `packages/webview/src/run/SessionBar.tsx`: the reason as text.
- `packages/webview/src/styles/board.css`: 2 rules.

**Docs**
- `docs/user-guide.md`:
  - 10.8: Submit's reason is shown as text;
  - 10.9: a new "To be redone" bullet.
- `docs/slice2-plan.md`:
  - §1: 2j1 and 2j2 added to the order of work;
  - §1.1: the "**2j1:**" entry;
  - §2–§5: every sentence that stated the old rule, each tagged "(2j1, D2-76)";
  - §6.1: the "**2j1:**" entry, and the 2e test marked "superseded by 2j1";
  - §7.2: D2-76 (USER DECISION, with what it supersedes and RV-3 as amended) and D2-77–D2-87; D2-60 and D2-61 annotated as partly superseded;
  - §8: two "builder 2j1 (2026-11-22)" entries.

### Tests

**Added**
- New file `packages/core/test/review/redo.test.ts`, 25 tests:
  - **D1:** `isUndecided`; the force holds after a Shaky cascade and ends on the return; ADV-1's `decided` force.
  - **D2:** refused for every kind, kept or taken out; Decline stays open.
  - **D3:**
    - un-Shaky, transitive, with no write, plus Undo and Redo; none and single;
    - un-reject, with a Shaky item coming back to declined Shaky;
    - an arrow's plain un-decline;
    - two causes in both orders, the other un-decline order, and both in one request;
    - a decline in the same request; a dependency joining `because`;
    - a cause that does not hold up (4 cases); after the judge left the item no dependency;
    - a written Shaky premise written again;
    - a cycle and many items;
    - D2-87; other kinds and none never return; DO-0's question in both variants;
    - D2-79; the hidden Result is silent; shown results hide again.
  - **Kinds:** `copyRedo`/`itemStateOf`; reconcile's kinds and D2-80.
- `packages/core/test/review/view.test.ts`: new describe "2j1 (D2-76 D4, D2-83)", 4 tests: cause lines and states; telelean's reasons per kind; hidden cause never named; a hidden Result shows none.
- `packages/runner/test/run/session.review.test.ts`: "un-Shaky brings back, with no write, … Undo and Redo give back each state exactly; no event names a hidden Result".
- `packages/runner/test/run/session.reload.test.ts`, 2 tests: a reload between the Shaky decline and its un-Shaky, and before its Undo; D7, a hand-built pre-2j1 run.json (no `kind`, cause accepted since) that loads, shows the results, keeps its items to be redone, refuses Back to review, and comes back by Undo ×3.
- `packages/webview/test/unit/review.test.ts`: the row tooltip (none, one, many; not for other statuses).
- `packages/webview/test/e2e/s2-review.spec.ts`: "2j1 (D2-76): an item to be redone says why … Submit's closed reason is text".

**Updated, because they asserted the old rule**

reducer.test.ts:
- "Reject takes out its dependents…": `redo` now has `kind`.
- "un-reject brings the content back…" (renamed): dependents come back in review (D3).
- "un-reject is refused when Claude proposed a newer version; an item to be redone never comes back by hand…" (renamed): the D2 refusal for kept items too.
- "an un-rejected Add premise merges nothing…": `kind`.
- "a dependent another decline keeps out…": `kind`; W leaves `because`; back in review in the other order.
- "a written premise its decision commit took out comes back with it in review…" (renamed): D3 returns it to review, never accepted, so it is taken out again.
- "a written premise the merge brings back that something keeps out…": in review in the other order.
- "[un-reject V, reject p]…" (renamed): X comes back in review; p's leftover `redo` is now the same in both orders.
- "[un-reject V, back to review p]…" (renamed): refused by D2; V alone returns p.
- "two un-rejects in one request…": X and p come back in review.
- The random-sequence oracle `hiddenNow` now uses "undecided = in review".

reveal.test.ts:
- "shown when no statement or belief item is undecided…"
- The force describe, renamed.
- "a Shaky decline's cascade…" (renamed): the results stay shown; un-Shaky hides them.
- "RV-3 at a queue's end…" (renamed): kind `queue`; the results show.
- "un-reject: the statements it brings back…" (renamed): in review.

view.test.ts:
- "Results' parts are left out…": `redo.why`.
- The AF4 test is replaced by "2j1 (D2-76 D1): a statement to be redone … keeps no result hidden, and Submit's gate opens".
- "decline and back to review…" and "per status…" (both renamed): `redoneByClaude`.

Runner:
- session.review "Reject makes one decision commit…": the Results come back in review; no event names them.
- session.review: the AF4 test is replaced by "2j1 (D2-76 D1; it supersedes AF4's test): …": results shown, Submit open, the D2 refusal, the D4 line.
- session.reload "a Submit's take-out crashed…": asserts `kind: 'take-out'`.

Webview:
- sessionBar.test.ts (4 tests): `submit.reason`.
- s2-review.spec "the session bar and the panel of a stage whose results are hidden": the visible reason.

**Skipped or deleted:** none.

### Verification (run by me, final state)

All commands ran from /home/zhengyew/telelean/packages through `capped.sh`, with the binaries from node_modules/.bin. Vitest ran through my wrapper `vt.sh`, which is `capped.sh <MB> timeout 900 vitest run --maxWorkers=1 --no-cache --fsModuleCachePath=<scratch>/b2j1/fsmc`, with TMPDIR, TELELEAN_TEST_TMP and TELELEAN_NO_REAL_CLAUDE=1 set in scratch.

| Command | Result |
|---|---|
| `capped.sh 1800 tsc --noEmit -p core/tsconfig.test.json` | exit 0 (the first final run found one TS2345 in my test, a readonly array; fixed, then exit 0) |
| `tsc --noEmit -p runner/tsconfig.test.json` | exit 0 |
| `tsc --noEmit -p webview/tsconfig.json` | exit 0 |
| `tsc --noEmit -p webview/tsconfig.node.json` | exit 0 |
| `tsc --noEmit -p extension/tsconfig.json` | exit 0 |
| core vitest (all) | Test Files 77 passed (77); Tests 1171 passed (1171) |
| webview vitest (all) | Test Files 24 passed (24); Tests 436 passed (436) |
| extension vitest (all, `--no-cache`) | Test Files 22 passed (22); Tests 216 passed (216) |
| runner, fake engine: session.{review, reload, submit, premises, twins, views, end, failclosed, queue, tools}, prompts, manager.{accept, happy, rounds} | Test Files 14 passed (14); Tests 243 passed (243) |
| runner, real Lean, capped 3000, timeout 900: fresh.e2e.test.ts | Tests 9 passed (9), Duration 424.07s |
| runner, real Lean, capped 3000, timeout 900: walkthrough.e2e.test.ts | Tests 24 passed (24), Duration 748.95s |
| `vite build` with TELELEAN_WEBVIEW_OUT=…/scratchpad/b2j1/webview-build | built in 635ms |
| Playwright s2-review.spec.ts, against that build | 13 passed (17.8s); home guard "unchanged" |
| Playwright s2-board.spec.ts, against that build | 8 passed (14.0s); home guard "unchanged" |

Baseline before I changed anything: core test/review was 17 files, 483 passed. Each test-results folder was moved to my scratch dir.

### Mutation checks

45 mutants: 37 core, 1 runner, 4 webview unit, and 3 webview UI (each through a scratch build and Playwright). Each file was backed up, mutated, tested, restored, and checked with `cmp`; every restore was identical. Line numbers are as at mutation time. The full log is /tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad/b2j1/mutation.log.

**Killed: 44 of 45.** Each line gives what was broken, then the test that failed.

Undecided-ness:
- M01 records.ts:26, AF4's rule put back → "2j1 (D2-76 D1): a statement to be redone…"

Back-to-review refusals:
- M02 reducer.ts:579, a kept item set back by hand → "per status: …"
- M03 reducer.ts:1491, the itemGates gate opened → "decline and back to review: …"

Return conditions:
- M04 :661, the source check ignores ws/ → "an un-rejected Add premise merges nothing…"
- M05 :665, every kind is a candidate → "a record of another kind… never comes back"
- M06 :695, a cause that is down is ignored → "a cause that does not hold up…"
- M07 :695, a dependency that is down is ignored → "a dependency … joins it"
- M08 :695, the content-out check is dropped → "a dependent another decline keeps out…"
- M10 :708, the Shaky status is lost → "un-reject … a Shaky dependent comes back to declined Shaky"
- M11 :717, returning ids are kept in `because` → V2A-C2 tests
- M12 :718, the dependency does not join `because` → D2-80 test
- M13 :725, content is always taken out again → "the other way round…"
- M14 :712, the merge-back flag is not set → "a written Add premise declined as Shaky…"
- M15 :555 and M16 :552, DO-0's `question` kind → DO-0 test
- M17 :405, cascadeShaky's union → "in either order Z lists both"
- M18 :380, cascades write no kind → 17 tests
- M19 :1033, `releaseReturned` never called → 27 tests
- M21 :640, `holdsUp` widened → "a cause that does not hold up…"
- M22 :616, the merge is never counted → 16 tests
- M42 :1051, D2-87 removed → "an item that comes back is not accepted by the same request"

Records, reconcile and runner:
- M23 records.ts:31, `copyRedo` drops `kind` → 10 tests
- M24–M28 reconcile.ts:371/379/385/414/433, the judge and queue kinds and D2-80 → the reconcile test in redo.test.ts and the RV-3 test
- M37 runner review.ts:680, the take-out writes no kind → session.reload "a Submit's take-out crashed…"

Hidden-item silence:
- M20 reducer.ts:926, a hidden Result is named in events → the seeded random-sequence tests (view.test) and "a hidden Result comes back silently"

Cause text:
- M29–M34 view.ts:1216–1227, each kind's reason and the hidden filter → the view 2j1 tests
- M35 texts.ts:527, the cause's state → "Results' parts are left out…"
- M36 view.ts:1277, `why` left empty → 4 tests

Visible Submit reason and rows:
- M38 and M39 sessionBar.ts:144 → sessionBar.test
- M40 and M41 webview model/review.ts:258/264 → review.test

UI:
- U01 ItemDetail.tsx:406, U02 SessionBar.tsx:126, U03 ReviewList.tsx:119 → s2-review.spec "2j1 (D2-76)…"

**Survived: 1 (equivalent).** M09, reducer.ts:695, dropped the clause "a candidate no longer lists an item that comes back". It is implied by the "down" check: a candidate it was reached through that drops out is to be redone, so it never holds up. The clause is now removed.

**Not mutated:**
- Submit's hidden-results branch (D2-86): unreachable by construction.
- The narrower `merging` condition (the un-rejected item must end in review): the mutant that counts no merge at all is killed, and I found no reachable state in which the narrower condition alone changes the outcome.

### Decisions for the orchestrator to log

All are also in plan §7.2 and §8.

- **D2-76 (USER DECISION, turn 25):** recorded as given (D1–D7). It supersedes AF4's and D2-61's to-be-redone clause, D2-60's rule allowing a hand back-to-review, and the 2e test. RV-3 is amended as the brief words it.
- **D2-77:** `redo.kind` is one of cascade, question, judge, take-out, queue. Only `cascade` comes back by itself. A later cause keeps a record's kind, except `question` and a judge take-out, which override it. A record without a kind (saved before 2j1) never returns and is displayed like a cascade's.
  - *Alternative:* read a missing kind as cascade. Old RV-3, DO-0 and take-out records would then return, against D2-76's edge cases.
- **D2-78:** "Nothing else keeps it down" means:
  - no other cause in `because` is declined, to be redone, withdrawn or outside ws/;
  - no RV-5 dependency is declined or to be redone (a greatest fixpoint, so a cycle returns together);
  - and its content is in ws/ or comes back with this request's merges.
  So an item kept out by a second Reject whose first Reject is un-rejected first stays to be redone (the merges cannot bring it back); Claude redoes it, or Undo restores it.
  - *Alternative:* also merge, at the later un-reject, the commit that took it out first. That changes the merges, which D2-76 keeps as they are.
- **D2-79:** only an un-declined item that "holds up" (in review, its content in ws/) releases anything. An un-rejected Add premise, or an item that goes back to be redone, releases nothing (AF2 kept).
  - *Alternative:* release on every un-decline, which would bring back a Result that needs an unwritten premise.
- **D2-80:** every cause is recorded in `because`. A Shaky decline adds itself to dependents already to be redone; the judge's take-out adds the reverted item to dependents already taken out; a dependency that blocks a return joins `because`.
  - *Alternative:* record only the first cause. A Reject-then-Shaky order would then let the un-reject return an item that the Shaky decline still holds.
- **D2-81:** DO-0's question change sets `question` also on a Result already to be redone (its proof used the arrow), and runs the Shaky-like cascade from it.
  - *Alternative:* only Results not yet to be redone. The un-decline would then return a reverted Result whose question changed.
- **D2-82:** the cascade notice is an event: "Back in review with it, since they depend on it:" and "Back to Shaky with it, since they depend on it:".
  - *Alternative:* one event for both.
- **D2-83:** D4's words:
  - a cascade (or no kind) gets one line per listed cause, "↻ to be redone: it depends on ‹label›, ‹declined Shaky | rejected | declined | to be redone | status word›";
  - otherwise "↻ to be redone: telelean took it out: ‹reason›", the reason chosen by kind and markers (builds, gap, checks, judged dependent, take-out, queue, question, hidden, declined);
  - they are built in core as `ItemView.redo.why`.
  - *Alternative:* send each cause's state and word it in the webview.
- **D2-84:** one refusal text for every item to be redone (D2-76's example), replacing `contentTakenOut`.
  - *Alternative:* a second text for the kinds that never return.
- **D2-85:** Submit's reason is shown as text only in phase `stage`; while a step runs, the phase line already explains.
  - *Alternative:* show it in every phase where Submit shows.
- **D2-86:** Submit's hidden-results branch is kept, fail-closed, with `showResultsFirst`, in both the view and the runner (now unreachable).
  - *Alternative:* drop it.
- **D2-87:** an item that came back in a request cannot be accepted by that same request; a group leaves it as "not in review". The realistic risk: after an un-reject, the judgement has no dependencies for the returned item, so a crafted request would accept it unchecked, possibly knowing the results.
  - *Alternative:* plan the Accepts on the state after the return.

### Other notes
- **AP-42:** the runner's Undo-badges workaround (`run/review.ts` `reviewState`) is untouched; 2j1 changes no Undo rule.
- **Contracts:** `ItemRecord.redo.kind` and `ItemView.redo.why` are additive; no message, validator or run.json version changed.
- **Pre-existing edge, unchanged:** an item that was declined directly (not via a cascade), when un-declined while something it depends on is still declined, goes to "in review", not "to be redone".

### Effects outside the repo and my scratch dir
- **Playwright:** the harness created its short Chrome temp dirs `/tmp/tl-pw-chrome-*` (my scratch path is too long for Chrome's socket) and deleted them at teardown; none are left. Its home guard reported the real home folders unchanged.
- **`/home/zhengyew/telelean/node_modules/.vite-temp`:** this directory existed before (gitignored, empty). Its mtime changed because vite and vitest bundle their config there temporarily; it is empty again.
- **Real-Lean tests:** they ran sandboxed (bwrap) in TELELEAN_TEST_TMP inside my scratch dir, reading the ~/.elan toolchain read-only.
- **capped.sh:** creates transient systemd user scopes (no files).
- **Unchanged:** nothing was written to packages/extension/dist or out, git config or ~/.config. There was no network use, no install and no real Claude.
- **Left running:** nothing of mine. A `claude -p` process from the user's own telelean VS Code run was running throughout; I did not touch it.

Scratch artifacts, all in /tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad/b2j1/: logs, mutant backups under mut/, the webview builds, test-results-*, and the screenshot test-results-pw2/s2-review-redo.png.

````
