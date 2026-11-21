# build:1f

Agent `adc6d82d603012e3c` of workflow `wf_6dff6c3c-db5`. Verbatim output (JSON alongside).

## 1f report (builder): the board is read-only during a run, and Accept refuses on drift

1f is built end to end in core, the host, the runner and the webview, together with the four carry-overs. Every typecheck is clean apart from the known e2e errors, and core, webview and extension unit tests all pass. The runner files I touched pass, including m2flow and fresh.e2e run in full with real Lean. Two integration files only skip, because of the 12 GB RAM rule.

I made no git changes, installed nothing, used no npx/npm and ran no real Claude (FakeBackend only, `TELELEAN_NO_REAL_CLAUDE=1`). Nothing was written to `extension/dist` or `out` (checked with `find -newer`).

- **Patch:** `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b1f/1f.patch` (48 files, 3405 lines).
- **Originals:** `…/scratchpad/b1f/orig/`; the two new files are listed in `…/scratchpad/b1f/new-files.txt`.
- **Logs:** `…/scratchpad/b1f/*.log`.

### What it does
**A. Host (`extension/src/logic/boardSession.ts`).** Board edits are refused before planning with `{ok:false, code:'conflict', error:"An edit session is active: the board can't be edited until you accept or discard it."}` (core `EDIT_SESSION_ACTIVE`).
- **What is refused:** every action message (addNode, editNode, deleteNode, kindChange, reorder, theseSuffice, createSubject, addArrows, removeArrows, setFromNothing, claimPending, moveCards), plus undo, redo and historyRevert.
- **When:** while the root's run is active (core `runLocksBoard`: not accepted, discarded, cancelled or failed), on any subject. Also while a start is on its way, from the `startRun` request (before the consent question) until the RunManager answers.
- **Start ordering:** a start first waits for board edits already queued, so the run's base includes them.
- **Recovery:** the lock waits for the earlier window's runs to be recovered, so a recovered run locks the board from the first message on.
- **Still allowed:** selectSubject, the history list and preview, Keep last N, initGit, copy, open, refresh, and all run messages.

**B. Runner (`runner/src/run/manager.ts`).** On drift, Accept now refuses before `planAccept`, using the new exported `driftRefusal`:
> Your files changed since this run started (‹up to 5 files, then "…"›). Undo those edits in the editor, or discard the run.

- Nothing is planned, committed, re-checked or applied, and the run stays in review. Once the files match the base again, the same Accept goes through.
- The rebase block is kept but unreachable, commented "unreachable since slice 1f (ES-7)".
- **Base check:** nothing else moves the base or copies hand edits into it, so nothing else needed disabling.
  - The base commit is made once, in `createRunShadow`, and `baseFiles()` and the gate read that first commit.
  - Feedback, adoption, resume and recover work only on the shadow.
  - The only path that ever did this was the rebase's `accept-base`.

**C. Webview.** The store gets `editLock`, `arrowLock`, `undoLock` and `undoRedoButtons`. While a run is active, or this board's start is in flight:
- **Store actions:**
  - Every edit action posts nothing and changes nothing; it shows an info toast with the reason (seen only from keys: F2, Delete, Alt+↑/↓).
  - Undo and Redo post nothing and show no toast (A27). They also post nothing in the Proposed view.
  - When the lock begins, an inline edit, a drag or an edit dialog in progress ends.
  - Adding from the A|P box no longer switches the board back to Current.
- **Disabled controls**, each with the reason as its tooltip:
  - Edit, Add/Edit why, Delete and Move to axioms;
  - the stance and source chips, and the action chip on a card face;
  - all 1b arrow buttons except "Select incoming arrows";
  - the whole A|P box (its placeholder also shows the reason);
  - the tray's Remove, History's "Revert to this" and "New subject…";
  - the header Undo/Redo and a toast's Undo.
- **Drag and drop:** cards cannot be dragged, and neither cards nor columns accept a drop.
- **Proposed view:** the arrow buttons and Move to axioms are shown disabled with "Arrows change only through review items and transforms." The read-only note is reworded, and `selectArrow` does nothing there.
- **Review note:** the "files changed" note now says Accept is refused until the files match again.

**Carry-overs**
1. TL015 no longer follows an AXIOM's `premises:` (`core/src/project/build.ts`).
2. One Delete is one plan.
   - `remove-arrows` takes an optional `marks` list, and `arrows` may then be empty.
   - The protocol accepts `removeArrows.marks` (distinct ids; at least one arrow or mark).
   - Labels: "Remove N arrow(s) and M 'follows from nothing' mark(s)", or "Remove 'follows from nothing': ‹card›" for a single mark.
   - The store sends one message, and the A16 dialog covers the whole Delete (Cancel sends nothing).
3. `upgradeLegacyProposal` now adds TL102 "The proof rests on pending: ‹ids›." at the card's `loc`. It stays idempotent, and a proposal of this build is unchanged.
4. The wording is now "Move to axioms" in:
   - the `kindChangeImpact` summaries;
   - the change-kind Undo/History label;
   - the reorder refusal text;
   - the column drop label ("Drop to move to axioms");
   - the rationale dialog's title and button;
   - the store's re-asked dependents title.

### Files changed
- **Core:** `src/run.ts`, `src/actions.ts`, `src/protocol.ts`, `src/edit/planArrows.ts`, `src/edit/planAction.ts`, `src/kindChange.ts`, `src/project/build.ts`.
- **Runner:** `src/run/manager.ts`, plus doc comments in `src/run/types.ts` and `src/proposal/types.ts`.
- **Extension:** `src/logic/boardSession.ts`, `src/logic/actionMapping.ts`.
- **Webview:**
  - `src/state/store.ts`, `src/main.tsx`;
  - `src/header/Header.tsx`, `HistoryMenu.tsx`, `SubjectPicker.tsx`;
  - `src/toasts/Toasts.tsx`;
  - `src/board/NodeCard.tsx`, `CardDetails.tsx`, `Column.tsx`;
  - `src/prompt/PromptBox.tsx`, `src/tray/SelectionTray.tsx`, `src/dialogs/Dialogs.tsx`, `src/run/Review.tsx`, `src/styles/board.css`.
- **Docs:** `docs/slice1-plan.md` §8 has a "builder 1f" entry with every decision.

### Tests
**Added**
- Extension `test/unit/editSessionLock.test.ts` (12): refusals for every edit message in every active state and for another subject's run, allowed with no run or an ended run, reading still allowed, start lock (a refused start or declined consent unlocks), the start waits for earlier edits, recovery, and `current()` throwing.
- Webview `test/unit/store-lock.test.ts` (11): `editLock` per state, every store edit gated, Undo/Redo silent, viewing works, the lock clears edits under way, the Proposed view never posts an undo, and `undoRedoButtons`.
- Core `test/edit/arrows.test.ts`: marks (4), TL015 (2), wording (1).
- Core `test/proposal/legacy.test.ts`: TL102 added once (1).
- Runner `manager.accept.test.ts`: "ES-7 with the real drift check: a hand edit refuses Accept; once it is undone, the same Accept goes through", and "the drift refusal names up to 5 files, then '…'".
- Runner `workspace/arrows.test.ts`: an arrow and a mark removed in one step, undone exactly.
- Webview `store-arrows.test.ts`: a mixed Delete is one message; the A16 question covers it; Cancel sends nothing; a refusal restores both.

**Changed** (old behaviour → new expectation; files kept)
- Runner `manager.accept.test.ts`:
  - "with drift: commits accept-base and rebase…" now expects a refusal, with no plan, commit, re-check or apply.
  - "a failed re-gate after drift…" now expects the refusal before any re-gate, with ws/ untouched.
- Runner `integration/m2flow.test.ts` (c): refused with the file named and nothing merged; after undoing the edit, Accept goes through. Run 2 is refused the same way, then discarded.
- Runner `run/fresh.e2e.test.ts` (b): a hand edit holds Accept back until it is undone. `oneRound`'s `beforeAccept` now receives `(manager, review)`.
- Runner `run/manager.lifecycle.test.ts`: the recovered legacy proposal now also has the new TL102.
- Extension `runRouting.test.ts`: an edit sent during a start is answered at once but refused (it was applied before).
- Webview `store-run.test.ts`: "adding … during a review shows the current board again (D-16)" now expects nothing added and no switch.
- Webview `store-arrows.test.ts`: the Delete-with-a-mark test expects one `removeArrows {arrows:[], marks}`.
- Smaller updates:
  - Core `legacy.test.ts` (2 tests) and `protocol.arrows.test.ts` (marks cases).
  - Extension `actionMapping.test.ts` (marks mapping).
  - Label text "Make Axiom: …" → "Move to axioms: …" in core `contracts`, `conditional`, `confirmedDependents` and `scenarios`; runner `integration/fixes` and `session`; webview `store`, `store-run` and `store-arrows`.

**Deleted:** none.

### Verification
Everything ran through `capped.sh`, one job at a time, using `node_modules/.bin` binaries.

**Typecheck** (`tsc --noEmit`):

| Config | Result |
|---|---|
| core `tsconfig.test.json` | exit 0 |
| runner `tsconfig.test.json` | exit 0 |
| webview `tsconfig.json` | exit 0 |
| webview `tsconfig.node.json` | exit 2, 6 errors, identical to the 1a baseline (all `test/e2e`) |
| extension | exit 2, 9 errors, identical to the 1a baseline (all `test/suite`) |

**Vitest** (one worker):

| Suite | Test Files | Tests |
|---|---|---|
| core | 52 passed (52) | 564 passed (564) |
| webview | 10 passed (10) | 165 passed (165) |
| extension (`--no-cache`) | 22 passed (22) | 197 passed (197) |

**Runner**, with `TELELEAN_TEST_TMP` in my scratch dir:

| Files | Test Files | Tests |
|---|---|---|
| `manager.accept`, `manager.lifecycle`, `workspace/arrows` | 3 passed (3) | 26 passed (26) |
| `integration/m2flow.test.ts`, whole file, real Lean | 1 passed (1) | 5 passed (5), 49.5 s |
| `run/fresh.e2e.test.ts`, whole file, real Lean | 1 passed (1) | 9 passed (9), 101.6 s |
| `fixes.test.ts`, the 2 changed cases (`-t`) | 1 passed (1) | 5 skipped (5) |
| `session.test.ts`, the 2 changed cases (`-t`) | 1 passed (1) | 8 skipped (8) |

The fixes and session cases skip because of the 12 GB RAM rule. The full runner suite was not run.

### Decisions worth your attention (all logged in §8)
- **Message text:** the refusal follows the brief exactly, so plan §2.7's "(ES-9)" suffix is dropped.
- **Start lock:** locking from the start request until the RunManager answers is my addition. It closes a race where an edit could land after the shadow had read the files.
- **Fail-open case:** if `current()` throws, the host locks nothing and logs it. Accept's drift refusal still protects the base in that case.
- **Proposed view Undo/Redo:** shown disabled with the session reason. There is also a fallback reason for a proposal on screen without a run, which should never happen.
- **Proposal diff (left for slice 2):** `ProposalView.diff` and `baseChanged` are computed against the current board when the proposal is built, not against the base. While the board is locked these are the same unless the files were edited by hand.
- **Not done:** the 1b verifier's F3(b) (old-axiom edges in recovered pre-v4 proposals) was not on my carry-over list.
- **E2E tests needing updates (not touched):**
  - webview `test/e2e/m2-layout.spec.ts` lines 75–80 focus the A|P box during a run, which is now disabled;
  - webview `test/e2e/board.spec.ts:327` still checks the old drop label.

### Effects outside the repo and my scratch dir
- **Nothing persistent.**
- **Transient, all gone afterwards:**
  - systemd user scopes created by `capped.sh`;
  - the Lean jobs' transient units during the real-Lean runner tests (the tests check that none are left);
  - temporary directories under `/tmp` from the extension unit tests (removed).
- **Unchanged:** `~/.elan` and `~/.npm/_logs`.
- **Inside the repo but outside the change set:** vitest wrote 61 cache files to `node_modules/.vitest-cache` and updated three `results.json` files under `packages/{core,runner,webview}/node_modules/.vite/vitest/`.
- **Not mine, not touched:** your VS Code telelean has a real Claude run in progress on the doorstuck model.
- No network use and no leftover processes of mine.

