# build:1b

Agent `a0afdf02b86297b6f` of workflow `wf_28f0bd61-9bc`. Verbatim output (JSON alongside).

## 1b report (builder): arrows as board edits

Sub-slice 1b is built end to end: core, protocol, extension host, runner workspace and webview store, with minimal UI. All new and existing unit tests pass. The only type errors left are the same pre-existing ones from 1a, all in e2e test files I was told not to touch. I made no git changes, installed nothing, and never ran Claude or Lean. A patch of everything I changed is at `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b1b/1b.patch`; the pre-1b copies of the files are in `…/scratchpad/b1b/orig/`.

### Files changed
**Core**
- `packages/core/src/actions.ts`: new type `ArrowEnds`; new BoardActions `add-arrows`, `remove-arrows`, `set-from-nothing`, `claim-pending`, `move-cards` (plan §2.4); the `needs-confirmation` doc now covers arrow changes.
- `packages/core/src/edit/planArrows.ts` (new): the five planners, the cycle check, and the axiom → proposition confirmation.
- `packages/core/src/edit/planShared.ts` (new): planner helpers moved out of planAction.ts (`entryOf`, `pin`, `layoutOf`, `currentOrder`, `withoutPosition`, `label`, `hasLine`).
- `packages/core/src/edit/planAction.ts`: routes the new kinds; uses the shared helpers.
- `packages/core/src/kindChange.ts`: new exports `glowingDependents`, `arrowsInUse` and `removeUsedArrowsText`; `kindChangeImpact` now uses `glowingDependents`.
- `packages/core/src/protocol.ts`: messages `addArrows`, `removeArrows`, `setFromNothing`, `claimPending`, `moveCards` with hand-written validators, plus `LIMITS.coordinate = 1e6`.
- `packages/core/src/model.ts`: optional `TlGraph.positions` (additive).
- `packages/core/src/project/subjectGraph.ts`: no declared edge into an AXIOM (A19); fills `positions` for propositions only.
- `packages/core/src/project/build.ts`: TL102 warning "The proof rests on pending: ‹ids›."; TL122 (info) for an axiom with `premises:`.

**Runner**
- `packages/runner/src/workspace/history.ts`: `HISTORY_ACTIONS` now includes the five new kinds. Routing needed nothing else: `perform` is generic.

**Extension**
- `packages/extension/src/logic/actionMapping.ts`: the five messages are action messages and map to BoardActions (`confirmed` only when true).
- `packages/extension/src/logic/boardSession.ts`: header comment only (routing is generic through actionMapping).

**Webview**
- `packages/webview/src/state/store.ts`:
  - state: `selectedArrows`, `selectedMarks`, `positions`;
  - actions: `addArrows`, `drawArrowsFromSelection`, `removeArrows`, `setFromNothing`, `claimPending`, `moveCards`, `confirmArrows`, `selectArrow`, `selectIncomingArrows`, `deleteSelectedArrows`, `moveToAxioms`;
  - optimistic changes with exact rollback, and a new `arrows` dialog state;
  - the rationale dialog can start with the card's reason (`initial`).
- `packages/webview/src/dialogs/Dialogs.tsx`: new ArrowsDialog, built from the existing Modal and Dependent; the rationale field uses `initial`.
- `packages/webview/src/board/CardDetails.tsx`: arrow actions row; "Make Axiom" becomes "Move to axioms" (`data-testid` still `make-axiom`).
- `packages/webview/src/board/NodeCard.tsx`: Delete removes selected arrows or marks; it opens the card's delete dialog only when none is selected.
- `packages/webview/src/main.tsx`: Esc clears the selection; Delete removes selected arrows (not while typing, not with a dialog open, not when a card already handled the key).
- `packages/webview/src/model/format.ts`: new `selectionKeyFor`.
- `packages/webview/src/model/cardData.ts`: "follows from nothing" chip; the D-13 hint chip becomes "declared before v4: make it a proposition, or drop these arrows".
- `packages/webview/src/labels.ts`: history labels for the five kinds.
- `packages/webview/src/tray/SelectionTray.tsx`: a line listing selected arrows and marks, with Remove and Clear.
- `packages/webview/src/styles/board.css`: three rules for that line.

**Docs**
- `docs/slice1-plan.md` §8: the OPEN TL102 entry is closed, and a "builder 1b" entry lists all decisions.

### Tests
**Added**
- `packages/core/test/edit/arrows.test.ts` (27 tests), all five planners:
  - success cases;
  - refusals: a cycle over drawn arrows, a cycle through a verified edge, an old axiom's premises counting in the cycle check, a TL015 cycle not blocking unrelated arrows, another subject, a self-arrow, an unknown id, vocabulary, an arrow already drawn, no source, set-from-nothing on a card with arrows, claim-pending without a statement or with a `.holds`;
  - `needs-confirmation`: axiom → proposition with established dependents, and removing an arrow a proof uses (one and several);
  - labels, one plan per action, A→P by kind of `.holds`, "Make it a proposition (pending)" and "Drop these arrows", TL122, `graph.positions`.
- `packages/core/test/protocol.arrows.test.ts` (3 tests): validators accept, reject, and drop extra properties.
- `packages/webview/test/unit/store-arrows.test.ts` (21 tests): every store action (optimistic change, rollback, dialog before or after the host asks, confirmed resend), the selection model, Delete, Esc / `clearSelection`, Move to axioms, and no-ops in the proposed view.
- `packages/runner/test/workspace/arrows.test.ts` (6 tests): with the real core and Lean off, each action applied and undone exactly in one step, refusal changes nothing, history kinds and labels.

**Updated**
- `packages/core/test/project/status.test.ts`: axiom cells now also expect TL122; "rests on pending" now expects the TL102 warning.
- `packages/webview/test/unit/cardData.test.ts`: the `hint-d13` expectation replaced by `declared-before-v4`, plus a from-nothing chip test.
- `packages/webview/test/unit/format.test.ts`: `selectionKeyFor`.
- `packages/extension/test/unit/actionMapping.test.ts`: classification list plus mapping of the new messages.
- `packages/extension/test/unit/boardSession.test.ts`: 4 new routing tests.
- `packages/runner/test/workspace/fakeCore.ts`: cases for the new kinds (needed for exhaustiveness).

**Deleted:** none.

### Verification (each command under capped.sh, one heavy job at a time)
**Typecheck** (`npx tsc --noEmit -p …`):
- core `tsconfig.test.json`: exit 0
- runner `tsconfig.test.json`: exit 0
- webview `tsconfig.json`: exit 0
- webview `tsconfig.node.json`: exit 2, 6 errors
- extension `tsconfig.json`: exit 2, 9 errors

Those 15 errors are identical, line for line, to the 1a fixer's logs (`f1a/tsc_webview_node1.log`, `f1a/tsc_ext1.log`). They are all in `test/e2e/*.spec.ts` and `test/suite/*.ts`, which I must not touch; none come from 1b.

**Vitest** (`--maxWorkers=1`; this vitest version rejects `--poolOptions`):
- core `npx vitest run`: "Test Files 52 passed (52) / Tests 556 passed (556)"
- webview `npx vitest run`: "Test Files 9 passed (9) / Tests 153 passed (153)"
- extension `npx vitest run --no-cache`: "Test Files 21 passed (21) / Tests 185 passed (185)". `packages/extension/out` was not written.
- runner, only the files 1b touches (`TELELEAN_TEST_TMP` set to my scratch), `capped.sh 1800 timeout 900 npx vitest run --maxWorkers=1 test/workspace/{arrows,history,realcore,perform,undo,sample}.test.ts`: "Test Files 6 passed (6) / Tests 49 passed | 1 skipped (50)".
  - The skip is `sample.test.ts`'s Lean build, which waits for 12 GB of free RAM.
  - I did not run the full runner suite.

### Decisions (also in docs/slice1-plan.md §8, "builder 1b")
- **Cycle check:** over premises of propositions plus verified edges, by breadth-first search. The message names the shortest cycle, each sentence cut near 40 characters. Into an old axiom, its pre-v4 premises are checked as new arrows. A TL015 cycle blocks only arrows that pass through it.
- **Unknown ids:** an unknown target is `not-found`; an unknown source is `invalid`. A vocabulary name gets its own message. When nothing would change, the answer is `invalid` "That arrow is drawn already."
- **Axiom → proposition (add-arrows, or set-from-nothing on an axiom):**
  - only `type:` changes, plus the arrows or mark; the card goes last in the PROPOSITION column of the layout and loses any stale position;
  - I reused `kindChangeImpact` for this, not `planKind` (which refuses A→P by 1a's design);
  - the host asks only for a Lean-axiom `.holds` with established dependents; its message is "Drawing this arrow into “X” makes it a proposition." followed by the impact detail;
  - the board always shows the impact dialog first, then sends `confirmed: true`.
- **A16 (removing an arrow a proof uses):** decided by verified edges, hypotheses included. The dependents listed are the affected targets.
- **Labels:** "Move: ‹card›" for one card and "Move: N cards" for several, so a single move says which card. Old-axiom variants: "Make proposition: …" and "Drop arrows declared before v4: …".
- **move-cards** is layout only, like `reorder`: one Undo step, and no History entry of its own.
- **Delete with both arrows and marks selected** sends one `removeArrows` plus one set-from-nothing off per mark, following the brief. That is one Undo step plus one per mark, not one in total.
- **Old axioms with premises:** TL122 is severity info. `subjectGraph` hides their edges; graph.json is unchanged.
- **"Move to axioms" button** always shows a dialog first (the rationale dialog with the reason filled in, or the dependents dialog). Dropping a card on the column keeps 1a's flow.
- **`upgradeLegacyProposal` is untouched,** so a recovered pre-v4 proposal has no TL102 until its state is rebuilt.

### E2E tests needing updates (not touched)
- `packages/webview/test/e2e/m1-cards.spec.ts` lines 87–88: the `hint-d13` chip is now `declared-before-v4`, with new text.
- `packages/webview/test/e2e/m1-drag.spec.ts` lines ~140–206: the expanded card's "Make …" buttons; the button is now "Move to axioms". This file was already outdated by 1a.
- `packages/extension/test/suite/e2e.test.ts` lines 222–276: its "Make Assumption" button is now "Move to axioms".
- The 6 + 9 type errors listed above, which predate 1b.

### Effects outside the repo and my scratch dir
- **Inside the repo, outside `packages/` and `docs/`:** vitest wrote 59 transform-cache files to `/home/zhengyew/telelean/node_modules/.vitest-cache/`. Also inside the repo, vitest updated `results.json` under `packages/{core,webview,runner}/node_modules/.vite/vitest/`.
- **npm logs:** `npx` wrote debug logs to `~/.npm/_logs/`. npm keeps only about 10, so older logs there were rotated out; 11 are now from this session.
- **systemd:** capped.sh created transient systemd user scopes, which are gone after each job.
- **Temporary trees:** the runner tests' temp dirs and scratch git repos were created under `…/scratchpad/b1b/runner-tmp`, inside my scratch dir.
- **Nothing else:**
  - no network, downloads or installs;
  - no git commands on the repo;
  - no writes to `packages/extension/dist` or `out`, `~/.config`, `~/.claude` or `~/.elan`;
  - no leftover processes of mine.
