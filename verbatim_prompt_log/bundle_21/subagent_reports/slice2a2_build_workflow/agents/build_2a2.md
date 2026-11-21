# build:2a2

Agent `acfbe605016904511` of workflow `wf_9454d45c-350`. Verbatim output (JSON alongside).

**REPORT: builder 2a2 (the item model, part 2), core only**

Sub-slice 2a2 is built as the plan's §1.1 entry describes, with no fallback split. All seven 2a2 functions have replaced their stubs: `classify`, `itemDeps`, `resultsState`, `reconcile`, `reduceReview`, `planGroupAccept`, `planGroupDecline`. `review/index.ts` is unchanged. Every package typechecks, and the core, webview and extension suites pass.

**Files changed** (all under /home/zhengyew/telelean)
- `packages/core/src/review/classify.ts`: RV-7 classes (§4.4). Both maps come from `withDrafts`; c4's `addsNoNewBasis` is set on the arrow item's class.
- `packages/core/src/review/deps.ts`: RV-5 edges (§4.5), rules 1–5. The walk over declarations no item owns is memoised per declaration, cycles included.
- `packages/core/src/review/reveal.ts`: `resultsState` (§4.7, AF4), plus `isMeaningItem` and `isResultOrPart`.
- `packages/core/src/review/reconcile.ts`: the rules of §3.5.
- `packages/core/src/review/reducer.ts`: `reduceReview`, `planGroupAccept`, `planGroupDecline`, and an exported `acceptGate(state, id, own)` for 2c2's gates.
- `packages/core/src/review/scc.ts` (new): an iterative Tarjan and `componentOf`.
- `packages/core/src/review/records.ts` (new): record helpers shared by the reducer, reconcile and the reveal rule, including `depsById`. Imported by path, not exported from the index.
- `packages/core/src/review/types.ts`: three additive contract changes (below).
- `packages/core/src/review/texts.ts`: new texts in my own wording, where the plan quotes none (listed in §8).
- `docs/slice2-plan.md`: the §8 entry "builder 2a2".
- `packages/core/test/review/{classify,deps,reveal,reconcile,reducer}.test.ts` and `packages/core/test/review/helpers/records.ts`: all new.

**Contract changes** (additive, recorded in §8 with reasons; no other sub-slice uses them yet)
- `ReviewState.results?`: each Result's verdict and Rests on, so an Accept can fill `accepted.result`. The reducer has no judgement to read them from. 2e must fill it.
- `ReviewState.labels?`: the view's labels for the reducer's texts. Without one, the label falls back to the kind and the key, e.g. `Formalize “a”`. 2e must fill it.
- `SessionAction` (decide) `changes[].rev`: the item's rev when the action was made. Undo needs it to give `conflict` when an item was re-proposed since (D2-73).

**Tests**
69 tests added in 5 new files. No existing test was updated, skipped for later, moved or deleted.
- **classify.test.ts (12):**
  - b2 and b3: a Formalize of an AXIOM card, its `.holds` axiom new; a Formalize of a proposition is no RV-7 item
  - b3: a presupposition with its helper instance; plain vocabulary is no RV-7 item
  - b4: a new definition in R_stmt is a belief, one outside it is not, recomputed when a later statement starts to reach it
  - b4 through a class field (typeConsts), and conservatively without typeConsts (D2-25)
  - b4 through a coercion the elaborated statement inserts
  - b4 for a change to existing vocabulary in either R_stmt (B's too); c1 for an existing lemma changed
  - b1: any Add premise; the two maps: a definition that only a premise draft reaches is a belief in `classes` only
  - complete: false when a card statement lacks typeConsts (D2-25)
  - c1 and b2: a Change of an AXIOM card; c1 alone for a proposition's, with c2 only on a Result that proves it
  - c1: a Result that replaces your proof; a pending target proved is not c1
  - c3: a changed sentence on a card with Lean
  - c4: every Add arrow, "adds no new basis" when its source rests only on what the question covers (AF8)
- **deps.test.ts (7):**
  - Result -> Formalize through T.holds's type, and through what its proof uses
  - walks through declarations no item owns, and stops at the first item it meets
  - Result -> Result through B.1's session proofs; Result -> the arrow or premise item only of sources in direct(T); an arrow -> the item adding its card
  - an SCC of two Results: each is accepted one by one, blocked only by dependencies outside it (D2-26)
  - A17: an Add arrow depends on a Remove arrow on a cycle through it
  - a Change depends on the items whose version in B mentions what it changes
  - a statement that mentions a written premise card waits for the results; the hidden item is never among its blockers
- **reveal.test.ts (7):**
  - shown when no statement or belief item is undecided; hidden as soon as one is in review
  - Show results forces them, marking every Result seen early, until a statement or belief item becomes undecided
  - Undo of Show results hides them again and keeps the seen-early markers
  - a Shaky decline's cascade makes an accepted statement undecided: the results are hidden again
  - RV-3 at a queue's end: a new statement that uses a vocabulary item declined as Shaky is to be redone, and keeps them hidden
  - un-reject: the statements it brings back are undecided again, which ends the force
  - a statement-phase definition that only T's premise draft reaches: the results are shown, `classes` makes it a belief, and they stay shown
- **reconcile.test.ts (15):**
  - new, unchanged, updated, accepted leaving with its dependents, withdrawn, and a problem for one that vanished
  - a first step not proved gives its Result a record (F9); its parts are marked as such
  - a later Result version withdraws its target's earlier premise drafts that are not accepted (D2-17)
  - a written premise whose record holds the written key stays accepted; one taken out, holding the draft key again, is unchanged
  - a Shaky set that came back unchanged returns to review, marked "no alternative found" when its finish said so; a reverted item re-added identically is no longer reverted
  - a rejected proved Result, judged again with B's T.holds back, stays declined with its key and rev, and can still be un-rejected
  - a Result taken out to be redone stays so until its Submit step ends, then returns to review
  - a reworded repeat of a rejected Result comes back in review, "updated", the rejected version superseded
  - a Result reworked by a Submit step and rejected in the next stage stays rejected at the next judge (F5 reads only `queueSteps`)
  - items that no longer build, and Results whose inference fails, are taken out with what rests on them; a Shaky Result stays (D2-48)
  - a premise draft that no longer closes the gap is to be redone, marked so, its facts replaced
  - RV-7 (D2-23) returns an accepted item whose badges grew; RV-5 one whose dependency is not accepted; a written premise returned is taken out
  - a statement that becomes undecided ends the force; so does a Result that RV-11 returns to review
  - a new record's id depends only on the run id and its key: the listed items get the same ids whether or not hidden parts came first
  - no event is made for a change that touches only hidden items
- **reducer.test.ts (28):**
  - is refused until the dependencies are accepted; an RV-7 item is never taken by a group, even a one-item group
  - a Result or a Result's part is neither accepted nor declined while the results are hidden, and a group leaves it
  - records the Result's verdict and Rests on, never under the "did not pass" heading
  - an Add premise takes its hold-as choice, never a default; one written in review is accepted only as an axiom
  - a stale rev is a conflict; an unknown item too
  - taking an Accept away asks first, listing the accepted dependents; nothing changes without `confirmed`
  - Reject takes out its dependents transitively, Shaky ones included (they keep their note); Shaky takes nothing out
  - the decline options: Transform is refused until slice 4, the plain decline is the arrows' only one, a declined item is declined already
  - DO-0: an arrow item is declined plainly; the Results that use it are taken out, and it is never proposed again
  - taking an Accept away always asks, naming no Result; the cascade reaches the hidden Result silently; proved and not-proved copies answer alike
  - while the results are hidden, a listed item resting on a Result's part waits for the results; it never names the part
  - the Accept that leaves no meaning item undecided returns a group-accepted definition that only a premise draft reaches
  - un-reject brings the content back, and the dependents its decline took out as to be redone without revert
  - un-reject is refused when Claude proposed a newer version; an item to be redone comes back only with its content in ws/
  - an un-rejected Add premise merges nothing, and the dependents its decline took out stay to be redone (AF2)
  - takes the source out of that question and makes the Result to be redone, with what rests on it; Undo puts both back
  - Undo restores every recorded effect: a Reject leaves no rejected key behind; every seal stops it
  - Undo of a Reject that took a written premise out restores it, its takeOut recorded for the runner (AF2)
  - Undo of a premise Accept and its Redo restore holdAs and the Why
  - Redo goes through the rules: a judge that makes an item RV-7 or leaves a dependency unaccepted refuses it; a changed rev is a conflict
  - a Redo never names a Result while the results are hidden
  - an Undo whose restored Accept would break RV-5 is refused; one whose items changed since is a conflict
  - a seal, or any new action, clears Redo; a stale Undo naming an old id is a conflict
  - a move is one stack step
  - planGroupAccept: the greatest fixpoint, dependencies inside an SCC ignored, every reason given
  - planGroupDecline: arrow items plainly, hidden Results left, declined items left
  - RV-5 holds after every step, Undos and Redos included, and no decision names a hidden item
  - undoing every action of a sequence gives back the records it started from (F4)

**Verification**
S = /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad. MemAvailable stayed around 14.5 GB throughout. Vitest 5 rejects `--poolOptions` ("Unknown option"), so every vitest run used `--maxWorkers=1`, the rules' alternative.

Typechecks, from the repo root, each `$S/capped.sh 1800 timeout 600 /home/zhengyew/telelean/node_modules/.bin/tsc --noEmit -p <config>`:

| Config | Result |
|---|---|
| `packages/core/tsconfig.test.json` | exit 0 (re-run after the final edit, exit 0) |
| `packages/runner/tsconfig.test.json` | exit 0 |
| `packages/webview/tsconfig.json` | exit 0 |
| `packages/webview/tsconfig.node.json` | exit 0 |
| `packages/extension/tsconfig.json` | exit 0 |

Vitest, from each package directory: `TMPDIR=$S/b2a2/tmp $S/capped.sh 1800 timeout 900 /home/zhengyew/telelean/node_modules/.bin/vitest run --no-cache --fsModuleCachePath=$S/b2a2/fsmc --maxWorkers=1`

| Package | Summary lines |
|---|---|
| core, baseline before any change | "Tests 652 passed (652)" |
| core, final files | "Test Files 64 passed (64)", "Tests 721 passed (721)" |
| webview | "Test Files 19 passed (19)", "Tests 313 passed (313)" |
| extension (with `--no-cache`) | "Test Files 22 passed (22)", "Tests 203 passed (203)" |

Not run:
- **Runner tests:** no runner source or test imports core's review module or the changed texts (checked with grep), so no runner test file is touched. Lean was not used.
- **Webview build and Playwright:** the webview was not touched.

**Decisions for the orchestrator to log** (each is in §8 as "builder 2a2 decided", with its alternative)
1. **Contract additions:** `ReviewState.results?`, `ReviewState.labels?`, and `changes[].rev` on decide actions, as above.
2. **Undo:** it gives `conflict` when a changed item's rev or decision (status, decline, Accept, redo, rejected keys) differs from what the action left.
   - What telelean writes afterwards is not compared (the decision commit, a premise write's written key).
   - Markers added since stay.
   - The restored statuses must pass the rules (RV-5, RV-7's own Accept, D2-8, "did not pass"), or the Undo is refused with the rule's text.
   - An Undo that takes an Accept away gets RV-5's list and the confirmation, as by hand.
   - For a hidden item, the refusal is a `conflict` naming only the action.
3. **Redo:** it re-sends only the decisions the action actually carried out (what a group left then is not asked for again). The redone action gets a new id. Redo is refused with the rule's text when the rules now leave any of those decisions.
4. **One decide action:**
   - Declines and backs to review apply first, in the order sent, all or nothing.
   - Then the Accepts: an own Accept with its checks, or a group with RV-8's partial take.
   - A group Accept that takes nothing makes no stack step.
   - Arrow items are always declined plainly (a Reject or Shaky sent for one is read as plain). A plain decline, or no option, on any other item is refused.
5. **Content already taken out:**
   - An item whose content a cascade took out keeps `redo` (reverted) when declined. Back to review then returns it to "to be redone", not to review (D2-60).
   - Un-reject brings a dependent back only when no other item that took it out is still declined or taken out.
   - A Shaky dependent taken out by a Reject cascade or by the judge keeps its Shaky decline and note.
6. **DO-0's question change:** the Result it makes "to be redone" passes the Shaky cascade to its own dependents, so no accepted item rests on a non-accepted Result. DO-0's "a card Claude added at either end is declined with its items" is not built: no slice-2 step adds a card.
7. **Classes:**
   - c2 applies only when the Result has a proof.
   - c1 also covers an existing lemma that a vocabulary change changes (from the spec's RV-7 wording).
   - b4 applies to a vocabulary change in either R_stmt, whatever its kind.
   - c4 applies to every Add arrow.
   - "Adds no new basis": basis is the footprint cards plus the model's Prop-valued axioms; unknown facts are treated conservatively.
   - A missing class counts as every badge.
8. **Reconcile:**
   - RV-11 compares only the Result's recorded verdict and Rests on; a changed dependency is left to RV-5's defensive rule.
   - A declined or reverted record with a draft that is not B's version is a new proposal, even with the same key. Unchanged Add premise drafts are the exception, since they stay in `premises` by design.
   - D2-17's premise-draft withdrawal applies only at a queue's end, when the Result's content changed.
   - RV-3 follows the dependents in review.
   - The force also ends when a Result gets new content or returns to review from a decided status.
   - The judge's reverts take their dependents down as a Reject does.
   - `problems` holds only reconcile's own ("disappeared"); the runner adds the judgement's.
9. **A written premise in review** stays in ws/ only if it never left review (a converted v1 ghost). Any other return to review takes it out (`premises.takeOut` / `reverts`).
10. **Events** are lead-in texts with linked item ids, never item names in the text. The reducer reports only the cascade the person was not asked to confirm, and D2-23's returns. All new texts are listed in §8.
11. **§4.6's "undo everything" property (F4)** holds only for sequences without Show results:
    - An Undo that makes a statement undecided ends Show results' force, as §4.7 says.
    - After that, a Result decided under the force can't be undone until the results are shown again (D2-8).
    - The test checks the property on sequences without Show results, and checks RV-5 and "no decision names a hidden item" on sequences with it.

**Notes for later sub-slices**
- **2e:**
  - When building ReviewState: deps by id via `records.ts depsById`, plus `results` and `labels`.
  - `ItemWrite` is derived from "in ws/" before and after each changed item. For an Undo, `write.action` is the undone action's id: invert its commits and restore its `takenOut`.
  - After an inverse merge, take back out any item whose status keeps it out.
- **2c2:** can reuse `acceptGate`, `isMeaningItem`, `isResultOrPart` and `fallbackLabel`.

**Effects outside the repo and the scratch dir**
- Vite/vitest wrote and deleted its bundled config in three git-ignored folders inside the repo tree: `packages/core/node_modules/.vite-temp`, `packages/webview/node_modules/.vite-temp`, and the repo root's `node_modules/.vite-temp` (the extension's run). All three are empty again.
- Each heavy command ran in a transient systemd user scope (`capped.sh`), which ended with the command.
- Nothing else:
  - `/tmp/node-compile-cache` (no entries after 13:47), `node_modules/.vitest-cache`, and the extension's `out/` and `dist/` are unchanged.
  - No npm or npx, no network, no git command that changes state.
  - No processes left running.
