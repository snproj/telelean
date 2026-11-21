# fix:2a1

Agent `a96b2f23bd542a06e` of workflow `wf_8df564ad-639`. Verbatim output (JSON alongside).

## Fixer 2a1 report

All 13 findings are handled in the working tree, and nothing else the builder did was undone. Every package typechecks and every unit suite I ran passes. One design question goes back to the integrator: what to do with a stray comment (see "Needs a decision").

`$S` = `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad`; `$B` = `/home/zhengyew/telelean/node_modules/.bin`.

### Findings
- **F1 (major): fixed, except blank lines.**
  - Text outside declarations is now compared in order. A new `compareTexts(base, current)` in `items.ts` compares each changed file's declarations, blocks and non-blank outside lines in order, comments included (Myers diff, `commonSubsequence`).
  - A line of B that W deletes, edits or moves is unowned.
  - A line W adds is unowned, except two cases:
    - enclosing lines, as before;
    - a comment line, which goes with the new or changed declaration directly below it (else directly above it) and counts in that item's content key and `content.decls` text.
  - Block lines: the fields telelean writes (`premises`, `lean`, `id`, `follows_from`) are still compared as entries. Every other block line is now compared as written and in order. So a changed `type:`, `kind:` written for `type:`, swapped lines and new notes are all unowned.
  - **Not changed, on purpose:** blank lines, and whitespace inside a line, are still no difference. Lean reads them as whitespace, and telelean's own writes change them (blocks inserted with tidy blank lines, declarations taken out). Counting them would make telelean's own reverts disable Apply. The one place a blank line matters is a card's binding, which F3 now covers.
- **V2A1-C5 (minor): fixed** by the same comment rule. **For 2b2:** `planItemRevert` must remove a declaration's attached comments (`AddedTextUnit.attachedTo`) along with the declaration.
- **F2 / V2A1-C2 (major): fixed.** An axiom that is neither a shape-passing term nor a presupposition is now unowned in either phase. A shape-passing term created in a proof phase is still proof material.
- **V2A1-C1 (major): fixed.**
  - A derived id's `id:` write-back goes with the card's statement item only when that item has another change.
  - On its own it is no difference. This covers Claude's arrow write, a written premise, and the state after DO-0.
  - Any other `id:` change is unowned.
- **F3 (minor): fixed.** A change in the bound statement or the binding mode marks the card changed, so it gets its Formalize or Change item.
- **F4 (minor): fixed.**
  - T.holds counts as present when only Lean's facts have it, so its Result is not marked `asInBase`.
  - A `.holds` is no longer attached to a parent by its place or its name. Before, it became a child of T's statement and caused a spurious Change.
- **F5 (minor): fixed.** Children are compared only where both states have the parent's facts. A facts-only orphan is compared only where both states have facts for its file.
- **F6 (minor): fixed.** `draftReach` returns `complete: false`, with `leanName` first in `missing`, when the draft's facts lack its own statement.
- **F7 (minor): fixed.** Tests added (listed below), and the builder's §8 Tests line is corrected.
- **V2A1-C3 (minor): fixed, with one additive contract field.**
  - The ledger's `created` entry gains `draft?: string` (in `review/types.ts`; no sub-slice uses `LedgerEntry` yet). computeItems reads it instead of the current drafts. Only the running step, which has no `created` entries yet, is still read from its drafts.
  - New export `reachingDraft(model, premises, step, name)`.
  - **2d must set `draft`** when it writes `created` entries at a step's end. Both points are recorded in §8.
- **V2A1-C4 (minor): fixed.**
  - A declaration that moves to another file, or out of its place in its file, now counts as changed: the card's Change item if it is bound, a `decl:` vocabulary change if not.
  - A card whose block moved is unowned.
- **V2A1-C6 (nit): addressed.** All my vitest runs used `--no-cache --fsModuleCachePath=$S/f2a1/fsmc`. No new files appeared in `node_modules/.vitest-cache` (checked against a marker file).

### Needs a decision (integrator / 2b1b)
§4.9's `stray-command` rule lets every new comment through. computeItems now reports a new comment that no new or changed declaration is next to as unowned, so Apply is disabled. Either:
- 2b1b refuses such a comment at the step (same rule, via `compareTexts`), so Claude removes it; or
- the integrator relaxes the rule.

Until then, a stray comment Claude writes between the person's declarations disables Apply. This is recorded in §8.

### Files changed
- `packages/core/src/review/items.ts`: `compareTexts`, `commonSubsequence`, `reachingDraft`, the four types below, and all the ownership fixes.
- `packages/core/src/review/closure.ts`: F6.
- `packages/core/src/review/types.ts`: `created.draft?`.
- `packages/core/src/review/index.ts`: the new exports, plus the types `TextChanges`, `FileTextChanges`, `TextUnit` and `AddedTextUnit`. They are named so as not to clash with core's board `Layout`.
- `packages/core/test/review/items.test.ts`:
  - 13 new tests;
  - the `open … in` test rewritten, because its comment is now unowned;
  - the scope test extended with a scope around an existing declaration;
  - the proof-phase ledger: Vile's `created` entry now names its draft.
- `packages/core/test/review/closure.test.ts`: one new test (F6).
- `packages/core/test/review/helpers/session.ts`: `created()` takes `draft`.
- `docs/slice2-plan.md` §8: the builder 2a1 bullets amended in place, and a new "fixer 2a1" entry.

Backups of the pre-fix files are in `$S/f2a1/backup/`, and the patch is `/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2a1/fixer_2a1.diff`.

### Verification
Each command ran under `capped.sh`, one at a time. MemAvailable was about 14.6 GB throughout. Logs are in `$S/f2a1/logs/`.

**Typechecks:** `capped.sh 1800 $B/tsc --noEmit -p …` gave exit 0 with no output for:
- core `tsconfig.test.json`
- runner `tsconfig.test.json`
- webview `tsconfig.json` and `tsconfig.node.json`
- extension `tsconfig.json`

**Unit tests:** core, webview and extension used `TMPDIR=$S/f2a1/tmp [TELELEAN_TEST_TMP=$S/f2a1/tmp] capped.sh 1800 $B/vitest run --maxWorkers=1 --no-cache --fsModuleCachePath=$S/f2a1/fsmc`. The runner row used `env -u UPDATE_SEMANTIC_RECORDINGS TMPDIR=$S/f2a1/tmp TELELEAN_TEST_TMP=$S/f2a1/runner-tmp capped.sh 1800 timeout 900 $B/vitest run --maxWorkers=1 --no-cache --fsModuleCachePath=$S/f2a1/fsmc test/gate/pure.test.ts test/semantic/checkFile.test.ts`.

| Package | Result |
|---|---|
| core | Test Files 59 passed (59), Tests 652 passed (652) (was 638; +14) |
| webview | Test Files 19 passed (19), Tests 313 passed (313) |
| extension | Test Files 22 passed (22), Tests 203 passed (203) |
| runner (smoke check only) | Test Files 2 passed (2), Tests 24 passed (24) |

- **Runner:** no runner test file references the changed code, so there was no touched runner file to run. The two files above are a smoke check that the runner still loads core. The real-Lean files (`valueProbe`, `refresh`) were not run, since nothing they use changed.
- **Mutation check:** I temporarily swapped in the builder's `items.ts` and `closure.ts`, ran `items.test.ts` and `closure.test.ts`, then restored both files byte for byte (checked with `cmp`). Result: Tests 15 failed | 32 passed (47). Every new or rewritten test fails on the old code except the scope-around-an-existing-declaration case, which was coverage only because that rule already held.
- **Not run:** Playwright, the VS Code suite and the full runner suite.

### Effects outside the repo and my scratch dir
- `capped.sh` created transient systemd user scopes, one per command; each ended with its command.
- Vite briefly wrote and deleted its bundled config in four existing `.vite-temp` folders: `packages/{core,runner,webview}/node_modules/.vite-temp`, and the repo root's `node_modules/.vite-temp` (from the extension run, since the extension has no `node_modules` of its own). All four are empty again; only their mtimes changed. The root one is outside the allowed write locations.
- No writes to `node_modules/.vitest-cache` or to the `.vite/vitest` results caches.
- `packages/extension/out` and `dist`: untouched (mtime 13:47).
- No git commands that change state, no `npm`/`npx`, no network, no Claude CLI. Nothing of mine is in `/tmp`, and none of my processes are left.
- Processes I saw but did not start, and left alone:
  - the `lean --server` processes for the user's `webring` project;
  - VS Code's `tsserver`;
  - the orchestrator's `ramwatch.sh`;
  - a roughly 46-hour-old `claude -p` session started by the user's installed telelean extension (run `doorstuck-…`).

### Notes
- The harness flagged the builder report for a settings-json pattern. The only matches I found are `tsconfig*.json` mentions; it contains no instructions.
- The relayed user request ("What are the various slices again?") is not answered by this fix step. The sub-slices are listed in the table in §1 of `docs/slice2-plan.md`:
  - **2a1** contracts and item model, part 1
  - **2a2** item model, part 2
  - **2b1a / 2b1b** judging (refactor, then the new rules)
  - **2b2** backstop, revert, several targets, Submit's plan
  - **2c1** base mask and protocol messages
  - **2c2** session view
  - **2b3** type-constant probe and runner engine
  - **2d** sessions, queues and steps
  - **2e** review actions
  - **2f** Add premise items and the end
  - **2g** review panel and session bar
  - **2h** Proposed view, Formalize, Undo, retirement
