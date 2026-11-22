# build:2i

Agent `a0808bb48429cf138` of workflow `wf_2f71cf32-72e`. Verbatim output (JSON alongside).

# Builder 2i report (slice 2: cleanup of built code, AP-29; ES-9, S9, A19, BD-3; audit G4, G11, G9)

I implemented the §1.1 "2i" entry and nothing else:
- the card-only Delete is removed end to end;
- an old axiom's declared premises are now named in the chip tooltip, in the details row and in TL122;
- the guide's placement and Delete text is corrected.

Every package typechecks. Every unit suite passes, and so do the runner files I touched, including the real-Lean ones. 9 Playwright specs ran against a scratch build and all passed. All 27 mutants were killed. No test is skipped for later. Git state is untouched (HEAD 1473ca0, nothing staged). dist/ and out/ were not written.

A patch of only my changes (32 files, +410/−188, made against my pre-edit backups) is at /tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad/b2i/changes_2i.patch. The backups are in /tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad/b2i/copies/.

## Files changed (one line each)

**Core (source)**
- `packages/core/src/edit/types.ts`: `DeleteRequest` is `{ id }`; `DeletePlan.leavesUnmarkedAxiom` is removed.
- `packages/core/src/edit/planDelete.ts`: `planDel` always removes the statement and its `.holds`; there is no keepLean branch.
- `packages/core/src/edit/planAction.ts`: `planDeleteNode` has no keepLean. The needs-confirmation text now ends "Delete anyway, or cancel." "Delete anyway" (`confirmed`) is unchanged.
- `packages/core/src/actions.ts`: `delete-node` is `{ kind, id, confirmed? }`.
- `packages/core/src/protocol.ts`:
  - `DeleteNodeMessage` loses `keepLean`.
  - New export `DELETE_ALWAYS_REMOVES_LEAN` = "Deleting a card always deletes its Lean."
  - The validator refuses `keepLean: true` with that text, accepts and drops `keepLean: false`, and refuses a non-boolean as before.
- `packages/core/src/project/build.ts`: TL122 now comes from `axiomPremisesMessage(names)`, which replaces the constant `AXIOM_PREMISES_MESSAGE`. It names each premise once, in order: by sentence, cut near 40 characters; an id that is no card by its id.

**Webview (source)**
- `packages/webview/src/dialogs/Dialogs.tsx`: the "Delete card only, keep Lean" buttons and their warning are gone from both dialogs. The re-asked dialog's title is "Delete it anyway?".
- `packages/webview/src/state/store.ts`: `deleteNode(id, confirmed?)`; the pending entry has no `keepLean`; the comments are updated.
- `packages/webview/src/model/cardData.ts`:
  - new pure `declaredBeforeV4(node, nodes)` and `quotedNames`;
  - the chip tooltip is now "Its premises: line (N arrow(s) into it, from “A”, “B”) was written before v4, …".
- `packages/webview/src/board/CardDetails.tsx`: new `DeclaredBeforeV4` line above the two legacy buttons (Current view only): "Declared before v4 (not drawn): arrows from “A”, “B”." (`data-testid="declared-before-v4"`).

**Extension**
- `packages/extension/src/logic/actionMapping.ts`: `deleteNode` → `{ kind: 'delete-node', id, confirmed? }`.

**Tests** (core, webview, extension, runner; details in the next section)
- `packages/core/test/protocol.test.ts`, `packages/core/test/edit/delete.test.ts`, `packages/core/test/edit/bindings.test.ts`, `packages/core/test/edit/staleUsers.test.ts`, `packages/core/test/edit/helpers/scenarios.ts`, `packages/core/test/edit/arrows.test.ts`
- `packages/webview/test/unit/store.test.ts`, `packages/webview/test/unit/store-lock.test.ts`, `packages/webview/test/unit/cardData.test.ts`, `packages/webview/test/e2e/m1-edits.spec.ts`, `packages/webview/test/e2e/m1-cards.spec.ts`
- `packages/extension/test/unit/actionMapping.test.ts`, `boardSession.test.ts`, `editSessionLock.test.ts`, `dependentCards.test.ts`
- `packages/runner/test/workspace/fakeCore.ts` (its delete always archives), `packages/runner/test/workspace/perform.test.ts`, `packages/runner/test/integration/fixes.test.ts`, `packages/runner/test/integration/session.test.ts`. No runner source changed.

**Docs**
- `docs/user-guide.md`:
  - the Placement bullet is rewritten (G9);
  - the Delete row of section 4 is rewritten (G4);
  - the old-axiom bullet of 3.2 says the cards are named (A19);
  - "What changed in slice 2" gets one sentence about Delete.
- `docs/slice2-plan.md`: one §8 entry, "builder 2i", with its decisions, tests and mutation summary.

## Tests

**Added**
- core `protocol.test.ts`: "slice 2i (S9, ES-9): a delete always removes the card's Lean: keepLean: true is refused, keepLean: false is dropped".
- core `edit/arrows.test.ts`, new describe "slice 2i (A19, audit G11): TL122 names the cards an old axiom declares as premises", with 4 tests:
  - "none: an axiom without `premises:` gets no TL122";
  - "one premise is named in the singular; several are named in their order, each by its sentence";
  - "a premise listed twice is named once; a missing card by its id (TL007 too); another subject's card by its sentence (TL121 too); itself";
  - "a long sentence is cut near 40 characters, as the planner names cards".
- webview `cardData.test.ts`, new describe "slice 2i (A19, audit G11): an old axiom's declared premises are named", with 4 tests:
  - none (an axiom without premises, or a proposition);
  - one and several;
  - a duplicate, a missing card and the axiom itself;
  - `quotedNames` with empty, one and many names.
- extension `actionMapping.test.ts`: "slice 2i (S9): a delete never keeps the card's Lean: keepLean: true never becomes an action, keepLean: false is the plain delete".

**Rewritten to the new rule**
- core `delete.test.ts`: "keepLean removes nothing from Lean; an axiom .holds left behind becomes an unmarked assumption" → "slice 2i (S9): an axiom's Lean always goes with it, so no `axiom ….holds` is left behind as an unmarked assumption".

**Updated (keepLean removed, texts changed)**
- core `delete.test.ts`:
  - "lists the premise removals…";
  - "a code-less card removes no declaration" → "…; an unknown card is not-found";
  - "refuses with needs-confirmation…" (exact message);
  - "with one dependent the refusal is worded in the singular";
  - "goes ahead when confirmed, or when the Lean is kept, or when nothing uses it" → "goes ahead when confirmed ("Delete anyway"), or when nothing uses it; `confirmed: false` asks as no flag does".
- core `bindings.test.ts`: '"with its Lean" (confirmed)…' → '"Delete anyway" (confirmed, with its Lean)…'.
- core `staleUsers.test.ts`: the `attempt()` helper.
- core `scenarios.ts`, run by both `plans.fake.test.ts` and `plans.wp1.test.ts`:
  - "AT2.7 delete-node › removes the block…";
  - "archives a theorem .holds; keepLean leaves the declarations" → "archives a theorem .holds; an axiom card always takes its abbrev and .holds with it (slice 2i, S9)".
- core `arrows.test.ts`: "an old axiom's premises: are not drawn and get TL122…" (exact message).
- core `protocol.test.ts`: "accepts every message type…" and "rejects wrong versions…".
- webview `store.test.ts`:
  - "deleteNode posts keepLean and closes the dialog…" → "deleteNode posts the delete (slice 2i: never a keepLean…)…";
  - "needs-confirmation re-opens the delete dialog…";
  - "keeps the host's description of the cards…";
  - "from the confirmation, "card only" posts keepLean (never confirmed); Cancel posts nothing" → "from the confirmation, Cancel posts nothing; a new delete asks again, and Delete anyway is the only way on (slice 2i)";
  - "a confirmed delete refused again…".
- webview `store-lock.test.ts`: the `tryEveryEdit` helper.
- webview `cardData.test.ts`: "one chip per ProofStatus kind and M1 flag" (the tooltip is now checked).
- e2e `m1-edits.spec.ts`:
  - "AT6.7 the delete dialog lists…": buttons ['Delete card and its Lean code', 'Cancel'], no "hidden assumption";
  - "AT6.7 statement mentions…";
  - "AT6.7 when other declarations use its Lean code…": title "Delete it anyway?", buttons ['Delete anyway', 'Cancel']; the card-only step is replaced by Escape posting nothing.
- e2e `m1-cards.spec.ts` "AT6.3 …": the chip tooltip, the details line, and no such line on another card.
- extension:
  - `actionMapping.test.ts`: "editNode, deleteNode, reorder…", "deleteNode keeps "confirmed"…", "reads the request id…";
  - `boardSession.test.ts`: "without a requestId…", "a refusal with a request id…", "runs mutating messages one at a time…";
  - `editSessionLock.test.ts`: the EDITS table, "the consent question locks the board too…";
  - `dependentCards.test.ts`: "names the other subject's card…".
- runner:
  - `perform.test.ts`: "delete-node: the Lean change…", "refusals become ok:false…";
  - `fixes.test.ts`: "delete with Lean of a statement with a column-0 comment…", "delete with its Lean lists an untracked lemma…";
  - `session.test.ts`: "delete removes the block and its declarations…".

**Deleted**
- core `bindings.test.ts`: '"card only, keep Lean": a blank line separates upper from the declarations left behind'. That behaviour no longer exists; the blank-line rule stays covered by its confirmed twin.

**Skipped for later:** none.

## Verification

All commands ran from `packages/<pkg>`. S = /tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad. Final run logs are in S/b2i/logs/final_*.log and S/b2i/logs/final1800_*.log.

**tsc:** `TMPDIR=$S/b2i/tmp $S/capped.sh 1800 /home/zhengyew/telelean/node_modules/.bin/tsc --noEmit -p <config>`. Clean (rc 0, no output) for core tsconfig.test.json, runner tsconfig.test.json, webview tsconfig.json, webview tsconfig.node.json and extension tsconfig.json.

**vitest:** `env TMPDIR=$S/b2i/tmp TELELEAN_TEST_TMP=$S/b2i/ttmp TELELEAN_NO_REAL_CLAUDE=1 $S/capped.sh <cap> /home/zhengyew/telelean/node_modules/.bin/vitest run --maxWorkers=1 --no-cache --fsModuleCachePath=$S/b2i/fsmc [files]`

| Suite | Before | After |
|---|---|---|
| core | 1137 (76 files) | Test Files 76 passed (76) · Tests 1141 passed (1141) |
| webview | 431 (24 files) | Test Files 24 passed (24) · Tests 435 passed (435) |
| extension | 215 (22 files) | Test Files 22 passed (22) · Tests 216 passed (216) |

- I first ran these three suites under a 3000 MB cap, then reran them under 1800 MB to follow the builder rules; both runs passed.
- Runner, at cap 3000 with `timeout 900` each:
  - the 8 files that import the fake core (perform, m2members, sample, history, undo, scan, proposal/sidecars, refresh): Test Files 8 passed (8) · Tests 79 passed (79);
  - real Lean (LEAN_NUM_THREADS=2 via capped.sh): `test/integration/fixes.test.ts` Tests 5 passed (5), 30 s; `test/integration/session.test.ts` Tests 8 passed (8), 39 s;
  - the integrator runs the full runner suite.

**Scratch build:** `TMPDIR=$S/b2i/tmp TELELEAN_WEBVIEW_OUT=$S/b2i/webview-out $S/capped.sh 3000 /home/zhengyew/telelean/node_modules/.bin/vite build` → "✓ built in 438ms". dist/webview/webview.js still has its 05:56 timestamp.

**Playwright:** run one spec at a time against that build:
`env TMPDIR=$S/b2i/tmp TELELEAN_WEBVIEW_OUT=$S/b2i/webview-out TELELEAN_TEST_RESULTS=$S/b2i/pw/shots $S/capped.sh 3000 sh -c 'ulimit -c 0; /home/zhengyew/telelean/node_modules/.bin/playwright test test/e2e/<spec>'`

| Spec | Result |
|---|---|
| m1-edits | 7 passed |
| m1-cards | 4 passed |
| m1-store | 1 passed |
| board | 13 passed |
| s1-arrows | 11 passed |
| s2-board | 8 passed |
| s1-glows | 6 passed |
| m2-carryover | 5 passed |
| s1-session | 2 passed |

The home guard reported the home folder unchanged after every spec. These are the specs that grep finds for deleting cards and for card chips. The VS Code suites were not run (integrator only).

## Mutation checks

27 mutants, all killed. Each file was restored byte for byte, checked with `cmp` against a copy taken just before the mutant; the script is S/b2i/mutate.py and the results are in S/b2i/mut/results.json. For each: file:line, what I broke, and one test that failed.

**Core: the protocol**
- C01 `core/src/protocol.ts:799`, validator accepts `keepLean: true` again → protocol "rejects wrong versions… malformed payloads" and the slice 2i test failed.
- C02 `protocol.ts:799`, refuses `keepLean: false` too → "slice 2i (S9, ES-9)…".
- C03 `protocol.ts:799`, a non-boolean keepLean is accepted → "rejects wrong versions…".
- C04 `protocol.ts:170`, refusal text changed → "slice 2i (S9, ES-9)…".

**Core: the planners**
- C05 `core/src/edit/planDelete.ts:30`, keeps the Lean (removeDecls `[]`) → delete "lists the premise removals…" (8 tests in 4 files).
- C06 `planDelete.ts:25`, no dependents computed → delete "lists the premise removals…".
- C07 `core/src/edit/planAction.ts:161`, the block is deleted but its Lean stays (the S9 hidden belief) → delete "slice 2i (S9): an axiom's Lean always goes with it…" (7 tests).
- C08 `planAction.ts:147`, an unconfirmed delete that breaks dependents goes ahead → "refuses with needs-confirmation…".
- C09 `planAction.ts:147`, "Delete anyway" (confirmed) is refused → "slice 2i (S9)…".
- C10 `planAction.ts:154`, "or keep its Lean" back in the text → "with one dependent the refusal is worded in the singular".

**Core: TL122**
- C11 `core/src/project/build.ts:1105`, no dedupe → arrows "a premise listed twice is named once…".
- C12 `build.ts:1107`, names by id → "one premise is named in the singular…".
- C13 `build.ts:1107`, no 40-character cut → "a long sentence is cut near 40 characters…".
- C14 `build.ts:68`, no names in TL122 → "one premise…".
- C15 `build.ts:1102`, TL122 on an axiom without premises → arrows '"Drop these arrows" on an old axiom…' and "none: …".
- C16 `build.ts:68`, the singular reads as plural → "one premise…".

**Webview store and chip**
- W01 `webview/src/state/store.ts:2035`, the board sends keepLean again → store "deleteNode posts the delete (slice 2i…)…".
- W02 `store.ts:1472`, a confirmed delete is asked again → "a confirmed delete refused again…".
- W03 `store.ts:2035`, `confirmed` not sent → "needs-confirmation re-opens… Delete anyway resends with confirmed".
- W04 `webview/src/model/cardData.ts:217`, the tooltip gives only the count → "one chip per ProofStatus kind and M1 flag".
- W05 `cardData.ts:232`, a proposition gets the old-axiom chip → "one chip per…" and "none: …".
- W06 `cardData.ts:233`, no dedupe → "a premise listed twice is named once and counted once…".
- W07 `cardData.ts:233`, names by id → "one chip per…".

**Extension**
- E01 `extension/src/logic/actionMapping.ts:86`, keepLean mapped into the action → "editNode, deleteNode, reorder and createSubject map one to one".

**Webview UI** (a rebuild into the scratch dir, then one Playwright spec)
- U01 `webview/src/dialogs/Dialogs.tsx:280`, card-only button back in the first dialog → m1-edits.spec.ts:151 "AT6.7 the delete dialog lists…".
- U02 `Dialogs.tsx:232`, card-only button back in the re-asked dialog → m1-edits.spec.ts:212 "AT6.7 when other declarations use its Lean code…".
- U03 `webview/src/board/CardDetails.tsx:390`, the details line is not rendered → m1-cards.spec.ts:71 "AT6.3 …".

## Decisions for the orchestrator to log

All of these are also in the plan's §8 entry "builder 2i".

1. **`keepLean: false` is accepted and dropped by the validator.** Only `true` is refused, with "Deleting a card always deletes its Lean."; a non-boolean is refused as malformed ("payload.keepLean must be true or false"). *Alternative:* refuse any `keepLean` key, `false` included.
2. **The refusal text `DELETE_ALWAYS_REMOVES_LEAN` lives in core `protocol.ts`**, beside the validator (its only user), rather than in `review/texts.ts`. *Alternative:* `review/texts.ts`.
3. **`DeletePlan.leavesUnmarkedAxiom` is removed with `keepLean`** (it could only be true for the card-only delete); `DeleteRequest` is `{ id }`. Both are part of m1's frozen planner contract in `edit/index.ts`; no other package uses them. *Alternative:* keep the field, always false.
4. **Texts that offered the removed choice are reworded.** Core's needs-confirmation text ends "… Delete anyway, or cancel." (was "… or keep its Lean."). The re-asked dialog's title is "Delete it anyway?" (was "Delete its Lean code too?"). *Alternative:* keep both texts.
5. **How the cards are named (A19):**
   - by sentence, in curly quotes;
   - a premise listed twice is named once (and counted once in the tooltip);
   - in TL122 each sentence is cut near 40 characters, like the planner's labels and cycle texts, and an id that is no card appears by its id in straight quotes (as TL007);
   - the tooltip and the details line use the full sentence;
   - the details line shows in the Current view only, where the two choices are;
   - the arrows stay undrawn (AP-29's G11).
   *Alternative:* name them by id (as TL007/TL107 do), or list them as "Show this card" buttons in the details.
6. **Two guide sentences beyond the placement and Delete text:** "What changed in slice 2" says a Delete now always removes the card's Lean; the old-axiom bullet of 3.2 says the tooltip, the details and TL122 name the cards. *Alternative:* change only the placement and Delete text.

**Contract note:** `DeleteNodeMessage` and `BoardAction` `delete-node` lose `keepLean`, as the 2i entry requires. Their users are updated: the extension's actionMapping, the webview store and the runner's test fake. No other sub-slice uses `keepLean`.

**Docs read for correctness (§6.1):** the placement claims match `planAddNode` (position stored in the same plan), `planMoveCards`, Tidy layout's `moveCards`, `planChangeKind` and `layoutToProposition` (both use `withoutPosition`), and `planDeleteNode` (`withoutIds`). Nothing posts `moveCards` on open.

## Effects outside the repo and the scratch dir

- **Chrome temp dir:** each Playwright run (9 specs ×2, plus 3 mutant runs) had the harness create a short Chrome temp dir `/tmp/tl-pw-chrome-XXXXXX`, because the scratch path is too long for Chrome's socket. Its teardown deleted it; none are left. Chrome's HOME/XDG were isolated inside that dir, and the home guard reported the home folder unchanged each time.
- **systemd scopes:** `capped.sh` started transient `systemd-run --user --scope` units; none remain.
- **Inside the repo but outside packages/docs:** Vite's config loader wrote and removed its temporary config bundle in `/home/zhengyew/telelean/node_modules/.vite-temp/`. That folder existed before I started; it is left empty with a new mtime. This happened during 5 scratch builds, not the brief's one: 1 initial, 3 for the UI mutants, and 1 final rebuild because the last mutant had overwritten the scratch bundle.
- **test-results:** Playwright created `packages/webview/test-results/`. I moved it to `$S/b2i/pw/test-results-moved/`; screenshots went to `$S/b2i/pw/shots/`.
- **Nothing else:** no installs, no npx/npm, no network, no git changes, no real Claude (`TELELEAN_NO_REAL_CLAUDE=1` everywhere). No processes of mine are left; the Lean servers, Vivaldi and Discord still running are the user's own.

## Not changed (reported)

- `docs/m1-plan.md`, `docs/decisions-log.md`, `docs/project-report.md` and `docs/project-report-files.md` still describe the card-only Delete as it was built then. They are records outside 2i's entry.
- The right-click menu's and the Context Menu section's legacy entries (menu.ts, contextActions.ts) are unchanged. The plan names only the chip tooltip, the details row and TL122.
