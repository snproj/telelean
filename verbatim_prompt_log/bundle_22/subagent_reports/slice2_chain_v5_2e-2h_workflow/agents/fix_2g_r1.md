# fix:2g:r1

Agent `a3cf86bd3c1064ff5` of workflow `wf_bee8fde1-76d`. Verbatim output (JSON alongside).

- **report:** # Fixer 2g round 1: report

All nine findings are dealt with. FC-1 to FC-8 are fixed, and FC-9 is accepted as a documented approximation. I changed only webview files plus the plan's §8, and I found no wrong finding. For FC-5, item (2) (Exit's dialog counts) was already tested; the other seven items got new tests.

## Per finding
- **F-V2G-FC-1: fixed.** `HoldAsDialog` in `dialogs/Dialogs.tsx` now renders the question in the `<h2>` through `<Label parts={wordsIn(question, sentence, 'agent')}/>`, so the sentence reads as Claude's words. The same plain-text hole existed in the dialog's "Choose how you hold …" note (`holdAsMissing`). The new provenance e2e caught it, and I fixed that too. When the item has no Add premise detail, the text stays plain. Tests:
  - the hold-as e2e now asserts `h2 [data-provenance="agent"]` and the new title text with the "(Claude)" marker;
  - the provenance e2e opens the hold-as dialog on the marked session and requires every token text node to be Claude's.
- **F-V2G-FC-2: fixed.** I removed the `.tl-review-status[data-status='accepted'] … { color: var(--tl-proved) }` rule from `styles/board.css`. The accepted ✓ now takes the foreground colour, and `--tl-proved` stays for the passed final check. Test: `theme.test.ts`, "green stays for what Lean checked: no review status … `--tl-proved`".
- **F-V2G-FC-3: fixed.** `sessionBadgeText` in `model/sessionBar.ts` now has builder-worded texts, built from exported `badgeInterrupted`, `badgeConfirming` and `badgeApplying`. They read "Edit session: interrupted · Spyro", "… confirming · Spyro" and "… applying · Spyro". Phases step and stage are unchanged. Test: `sessionBar.test.ts`, one test for the three phases plus review with a null run.
- **F-V2G-FC-4: fixed.** `markAgent` in `model/review.ts` now uses `findPhrase`, which skips an occurrence that touches a word character (letters, digits, `_`) on a side where the phrase starts or ends with one. "Evil" no longer marks the inside of "IsEvil", and the first whole match still wins. I added no length floor, because a short Claude sentence standing alone in a host text must stay marked. Test: `review.test.ts`, "a phrase of Claude's is marked only as a whole piece of text".
- **F-V2G-FC-5: fixed (tests).** The new unit describe "builder 2g r1: stale dialogs and menus, the selection helpers, one request at a time" in `store-session.test.ts` has 9 tests:
  - (1) the reveal dialog's stale rules and the cascade dialog closing when a step starts;
  - (3) the decline menu dropped when its item is gone or a step starts, and kept otherwise;
  - (4) `selectItems`: dedupe, hidden Result, unknown id, empty;
  - (6) `dismissEvents` and `seenEvent`;
  - (7) `toggleItemExplicit` and the pruning of explicit ids;
  - (8) `lastGroup` reset by a new stage and kept by an update of the same stage.

  In `s2-review.spec.ts` I added:
  - (4) "Select them", selecting the item an Accept waits for;
  - (5) "Go to the first one";
  - (6) the events box filtering by `seenEvent`.

  Item (2), Exit's counts refreshed by a later message, was already tested by the Exit test that sends `allAcceptedStage()` while the dialog is open, and by mutant S31. So that part of the finding was not true; I added nothing for it.
- **F-V2G-FC-6: fixed.** The slice in `state/session.ts` changed in two ways:
  - `track` no longer lets Exit overwrite `sessionBusy` while a request is on its way (`{ exit: true }`).
  - In `result`, when the request `sessionBusy` names is answered, an Exit still pending takes over; otherwise it clears.

  `busyOf` builds the busy mark from the pending entry, so decision items now come from `resend.decisions`. Test: "Exit never takes the busy mark from a decision on its way …", covering both answer orders and that no second send goes out.
- **F-V2G-FC-7: fixed.** "Ask me instead" (origin `report`) still goes through `decideItems` as `group: true`, so the "Left N" note stays. I did not use `group: false`, because that would drop the note of what was left, which is worse than a note after a report decision. A new `keepSelection` flag on the decide resend keeps the user's selection for that origin. Test: "'Ask me instead' is not a group action …". It also checks that the list's own group Decline still clears the selection.
- **F-V2G-FC-8: fixed.** In `run/review/parts.tsx`, `ItemLink` no longer calls `usePhrases`. A small `MarkedFallback` component does it only in the branch with no item to read. This is performance only and changes no output, so I wrote no failing-before test. The e2e provenance and the m2-provenance specs still pass, which covers behaviour.
- **F-V2G-FC-9: not fixed, as the finding offers.** I recorded it in §8 as a documented approximation. The preview's `blocked` can say "depends" where the host says "blocked" only for an item that both waits on a hidden item and has a missing dependency. Only the "Accept k of N" wording and the "Left" note can differ, and the host decides what is taken. The alternative (core exposes the host's `GroupItem` list) needs a core change, and §0 forbids that in this slice.

## Files changed
All in the working tree, under `/home/zhengyew/telelean`. Backups are in `/tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad/f2gr1/backup/`, and the changed-file list is `f2gr1/changed_files.txt`.
- `packages/webview/src/dialogs/Dialogs.tsx` — FC-1.
- `packages/webview/src/styles/board.css` — FC-2.
- `packages/webview/src/model/sessionBar.ts` — FC-3.
- `packages/webview/src/model/review.ts` — FC-4.
- `packages/webview/src/state/session.ts` — FC-6 and FC-7.
- `packages/webview/src/run/review/parts.tsx` — FC-8.
- `packages/webview/test/unit/review.test.ts` — 1 test.
- `packages/webview/test/unit/sessionBar.test.ts` — 1 test.
- `packages/webview/test/unit/store-session.test.ts` — 9 tests.
- `packages/webview/test/unit/theme.test.ts` — 1 test.
- `packages/webview/test/e2e/s2-review.spec.ts` — hold-as provenance in two tests, plus two new tests ("Select them" with "Go to the first one", and the events box).
- `docs/slice2-plan.md` — a "fixer 2g r1" entry in §8.

The snapshots are `f2gr1/before.diff` and `f2gr1/after.diff`.

## Mutation checks
Each mutant was applied, the test files were run, the file was restored, and `cmp` confirmed it byte for byte (`restored=True` each time). Scripts and results are in `f2gr1/mut/` (`run.py`, `e2e.py`). All 27 were caught.

| Mutant | File | What was broken | Test that failed |
|---|---|---|---|
| M1 | state/session.ts | reveal dialog not closed when the phase leaves stage | the reveal dialog closes … |
| M2 | state/session.ts | reveal dialog not closed when results are shown | the reveal dialog closes … |
| M2b | state/session.ts | raw-diff dialog also closed when shown | the reveal dialog closes … |
| M3 | state/session.ts | cascade dialog kept when a step starts | the cascade dialog closes when a Claude step starts |
| M4 | state/session.ts | decline menu kept during a step | the decline menu is dropped … |
| M5 | state/session.ts | decline menu kept when an item is gone | the decline menu is dropped … |
| M6 | state/session.ts | `selectItems` without dedupe | "Select them" selects the listed items once each |
| M7 | state/session.ts | `selectItems` takes hidden Results | "Select them" … |
| M8 | state/session.ts | `dismissEvents` uses min instead of max | the events box shows what is newer … |
| M9 | state/session.ts | explicit ids not pruned | "fully explicit" toggles per item … |
| M11 | state/session.ts | `lastGroup` not reset on a new stage | the note of what a group left is cleared by the next stage |
| M12 | state/session.ts | selection cleared after "Ask me instead" | "Ask me instead" is not a group action |
| M12b | state/session.ts | `keepSelection` not passed | "Ask me instead" is not a group action |
| M13 | state/session.ts | Exit takes `sessionBusy` from a decision | Exit never takes the busy mark … |
| M14 | state/session.ts | busy cleared without the Exit takeover | Exit never takes the busy mark … |
| M15 | model/review.ts | no boundary before a phrase | a phrase of Claude's is marked only as a whole piece of text |
| M15b | model/review.ts | no boundary after a phrase | a phrase of Claude's is marked only as a whole piece of text |
| M16 | model/sessionBar.ts | interrupted badge dropped | the badge says so in the phases … |
| M16b | model/sessionBar.ts | confirming badge dropped | the badge says so in the phases … |
| M16c | model/sessionBar.ts | applying badge dropped | the badge says so in the phases … |
| CSS | styles/board.css | accepted ✓ drawn in `--tl-proved` again | theme.test.ts, "green stays for what Lean checked" |
| E1 | dialogs/Dialogs.tsx | hold-as title plain text | e2e hold-as test and e2e provenance test |
| E2 | dialogs/Dialogs.tsx | hold-as note plain text | e2e provenance test |
| E3 | run/review/StageReport.tsx | events box ignores `seenEvent` | e2e "the events box shows what is newer …" |
| E4 | run/SessionBar.tsx | "Go to the first one" goes to the last item | e2e "Select them … Go to the first one" |
| E5 | run/SessionBar.tsx | "Go to the first one" does not focus the item | e2e "Select them … Go to the first one" |
| (FC-8) | parts.tsx | none | performance only, no output change (see above) |

E4 and E5 touched `run/SessionBar.tsx`, which is not in `changed_files.txt` because the file was restored byte for byte.

## Verification output
All from `/home/zhengyew/telelean`, with `S=/tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad`, run one at a time under `capped.sh`. MemAvailable stayed around 38 GB.
- **Typecheck:** `node_modules/.bin/tsc --noEmit -p …` for `packages/core/tsconfig.test.json`, `packages/runner/tsconfig.test.json`, `packages/webview/tsconfig.json`, `packages/webview/tsconfig.node.json` and `packages/extension/tsconfig.json`. Each exited rc=0 with no output. A type error in my own new test (`hiddenResults: false`) appeared during the work and is fixed.
- **Unit tests**, from each package, with `TELELEAN_NO_REAL_CLAUDE=1 TMPDIR=$S/f2gr1/tmp`:

  | Package | Summary lines |
  |---|---|
  | webview | `Test Files 22 passed (22)`, `Tests 399 passed (399)` (was 387) |
  | core | `Test Files 76 passed (76)`, `Tests 1134 passed (1134)` |
  | extension | `Test Files 22 passed (22)`, `Tests 219 passed (219)` |

  The command was `$S/capped.sh 1800 …/vitest run --maxWorkers=1 --no-cache --fsModuleCachePath=$S/f2gr1/fsmc`.
- **Runner:** I touched no runner file and no runner test, so I ran no runner tests. The brief's "only touched test files" leaves none to run.
- **Build:** `TMPDIR=$S/f2gr1/tmp TELELEAN_WEBVIEW_OUT=$S/f2gr1/webview-out $S/capped.sh 3000 …/vite build` gave `✓ built in 432ms` (final sources). `git status` for `packages/extension/dist` and `out` is empty.
- **Playwright:** each spec was run one at a time from `packages/webview` with `TELELEAN_TEST_RESULTS=$S/f2gr1/test-results TELELEAN_WEBVIEW_OUT=…`.

  | Spec | Result |
  |---|---|
  | s2-review | 12 passed (was 10) |
  | m2-review | 4 passed |
  | m2-run | 5 passed |
  | m2-provenance | 3 passed |
  | s1-session | 2 passed |
  | m2-overlay | 4 passed |
  | m2-questions | 2 passed |

  The home guard reported the real home unchanged every time, and `packages/webview/test-results` was moved to `$S/f2gr1/test-results-playwright-dir`.

## Decisions for the orchestrator to log
All are in §8 under "fixer 2g r1".
1. **Badge wording (FC-3):** "Edit session: interrupted | confirming | applying · ‹subject›", as builder wording in `model/sessionBar.ts`. Alternative: add core texts between sub-slices.
2. **Phrase matching (FC-4):** a phrase marks only a whole piece of text (word-boundary on both sides), with no length floor. Alternative: a minimum length of about 8 characters, which would leave a short Claude sentence unmarked in host texts.
3. **Busy (FC-6):** Exit takes `sessionBusy` only when it is free, and a pending Exit takes over when the named request is answered. Alternative: busy as a set of request ids.
4. **"Ask me instead" (FC-7):** it stays `group: true`, so the "Left N" note shows, with a `keepSelection` flag that keeps the user's selection. Alternative: `group: false`, which would drop the note of what was left.
5. **Preview `blocked` (FC-9, not changed):** accepted as a documented approximation. Alternative: core exposes the host's `GroupItem` list and the webview plans on it, which needs a core change.
6. **Not a decision, but worth logging:** FC-5's item (2) was already covered, so no test was added for it.

## Effects outside the repo and my scratch dir
- **Chrome temp folder in /tmp:** Playwright's Chrome ran with an isolated HOME/XDG in a temp dir that `test/harness/chrome-tmp.ts` created under `/tmp`. The global teardown deleted it after each run, and the home guard reported the real home unchanged every time.
- **Local web server:** a Playwright server on 127.0.0.1 ran during each spec and stopped afterwards.
- **`/home/zhengyew/telelean/node_modules/.vite-temp`:** each vite build wrote and removed its bundled-config temp file there, so only the folder's mtime changed. This is inside the repo but outside `packages/`.
- **systemd:** `capped.sh` created transient `systemd --user` scopes, which ended with each job.
- **Nothing else:** no network, installs, git changes or Claude runs. HEAD and the staged state are untouched, `dist` and `out` are untouched, and none of my processes are left running.
- **notFixed:**
  - [1]
    - **id:** F-V2G-FC-9
    - **why:** Accepted as a documented approximation, as the finding itself offers. The preview's blocked can say 'depends' where the host says 'blocked' only for an item that both waits on a hidden item and has a missing dependency. Only the 'Accept k of N' wording and the 'Left' note can differ, and the host decides what is taken, so nothing unsafe is sent. The alternative needs a core change (expose the host's GroupItem list in the view), which §0 forbids in this slice. Recorded in §8.
