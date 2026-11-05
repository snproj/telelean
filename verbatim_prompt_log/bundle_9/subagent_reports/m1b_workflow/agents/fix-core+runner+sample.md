# fix:core+runner+sample (agent a711972aaaea12192)

## summary
I fixed all 22 issues in core, runner and docs: the blocker, the 4 majors and all 17 minors. Core needed no file changes in mental_model/ or test-fixtures/. Every core and runner suite passes, including 6 new end-to-end tests that run real Lean. Some fixes only reach the user once the other fixer finishes their part; open_issues lists what they must do.

**The blocker (a column-0 comment cut declarations in half).**
- A comment that starts at column 0 now ends the declaration above it only when the next code after it starts a new command, or when no code follows. A comment followed by more indented code (inside a proof or a multi-line statement) now stays part of the declaration.
- Indented `end`/`namespace`/`section` lines now also end a declaration.
- Two extra guards: Lean-file edits refuse to remove or replace a declaration when the line after it is an indented continuation, and the planner refuses when Lean's own range for a freshly checked declaration ends later than the text telelean would cut.
- Declarations removed together are now deleted in one piece, so they leave one blank line, not two.
- Tested with real Lean: Derivation→Assumption on a proof with a column-0 comment now archives the whole proof and the file still builds. Deleting a multi-line statement with a column-0 comment removes all of it.

**Major issues.**
- **Delete with Lean** now refuses with `needs-confirmation` when other declarations would stop compiling. It lists the cards first, then lemmas without a card and other subjects' proofs. A new optional `confirmed` flag on the delete action and on the `deleteNode` message lets the board resend it.
- **Conditional proofs** (a `.holds` that takes hypotheses, as the earlier rewrite to Goal produces):
  - Derivation→Assumption or Goal→Assumption now asks first, and the drop-zone text no longer claims the proofs "stay valid". "Rewrite" removes the arguments where the proof is applied, using a new Lean edit (`drop-arguments`); "mark broken" leaves those uses as they are.
  - The rewrite to Goal now replaces each whole application `(d.holds h)` with the new hypothesis.
  - Any use that is not written as a parenthesised application with plain identifier arguments is refused with "choose mark broken".
  - Real Lean builds after Assumption→Goal (rewrite) followed by Derivation→Assumption (rewrite), and also when followed by Derivation→Goal (rewrite).
- **Revert** now refuses and changes nothing when the snapshot of the current state fails. The message names the stale lock file to remove.
- **Model rebuild speed**: it was quadratic in the number of cards in a file. Each block now gets its namespace from the parser, and the other per-block scans use binary search. With 1600 cards in one file, the model rebuild went from 6.2 s to 18 ms, a typing pause from 6.2 s to 57 ms, and an edit from 12.8 s to 143 ms.

**Minor issues.**
- Uses written through `open …` count as dependents while files are unchecked.
- A proof that rests on a hidden axiom is no longer flagged "self-evident".
- The rewrite now accepts the forms `@H`, `@c` and `(c)`.
- Deleting a card no longer makes the comment-only card above it bind to the next declaration.
- Editing a field written twice in a block (TL005) keeps the second line; removing such a field is refused.
- A board now lists the other subjects' vocabulary items its cards use, under their full names, so glosses work.
- graph.json moves to format 1.1, adding `conditional_on`.
- The TL011 message and the hypothesis-name text now match what the board and the files show.
- Another toolchain, or a project with dependencies, now drops the old Lean results, and the banner names the project's current toolchain.
- History snapshots only telelean's own sidecar files (`layout.json` and the attic).
- The memory check runs again before the second Lean step, and each run's memory cap is lowered to fit what is free.
- Snapshot temp files go in the git directory, git error messages keep the line naming the lock file, and linked git worktrees get separate history chains.

**Docs.** The plan now has "(fix)" notes in sections 1.1, 4, 5.5, 6.1–6.6, 8 and R12, plus contract-change entries in section 14. The user guide corrects the reload advice, the Vocabulary group description, the Problems button, toast Undo and Undo after hand edits, and adds the four missing points (history in an existing repo, removing `refs/telelean`, the trash). The decisions log gains a section 10 listing every decision I made.

**Results from re-running the verifiers' scripts on scratch copies with real Lean.** The column-0 comment, open-namespace, conditional-proof, rewrite-form, toolchain, cross-subject vocabulary, duplicate-field and card-rebinding scripts all now show the fixed behaviour. The lock-file revert script passes 2 of 3 checks; the third expected the old behaviour, see open_issues.

## files_changed
- /home/zhengyew/telelean/packages/core/src/markup/decls.ts
- /home/zhengyew/telelean/packages/core/src/markup/types.ts
- /home/zhengyew/telelean/packages/core/src/markup/parser.ts
- /home/zhengyew/telelean/packages/core/src/markup/values.ts
- /home/zhengyew/telelean/packages/core/src/markup/edits.ts
- /home/zhengyew/telelean/packages/core/src/markup/leanOps.ts
- /home/zhengyew/telelean/packages/core/src/edit/session.ts
- /home/zhengyew/telelean/packages/core/src/edit/planAction.ts
- /home/zhengyew/telelean/packages/core/src/edit/planKind.ts
- /home/zhengyew/telelean/packages/core/src/edit/dependents.ts
- /home/zhengyew/telelean/packages/core/src/project/build.ts
- /home/zhengyew/telelean/packages/core/src/project/text.ts
- /home/zhengyew/telelean/packages/core/src/project/subjectGraph.ts
- /home/zhengyew/telelean/packages/core/src/kindChange.ts
- /home/zhengyew/telelean/packages/core/src/actions.ts
- /home/zhengyew/telelean/packages/core/src/protocol.ts
- /home/zhengyew/telelean/packages/core/src/export/graphJson.ts
- /home/zhengyew/telelean/packages/core/src/export/schema.ts
- /home/zhengyew/telelean/packages/core/schema/telelean-graph-1.0.schema.json
- /home/zhengyew/telelean/packages/core/test/markup/decls.test.ts
- /home/zhengyew/telelean/packages/core/test/markup/leanOps.test.ts
- /home/zhengyew/telelean/packages/core/test/markup/edits.test.ts
- /home/zhengyew/telelean/packages/core/test/edit/delete.test.ts
- /home/zhengyew/telelean/packages/core/test/edit/conditional.test.ts (new)
- /home/zhengyew/telelean/packages/core/test/edit/staleUsers.test.ts (new)
- /home/zhengyew/telelean/packages/core/test/edit/bindings.test.ts (new)
- /home/zhengyew/telelean/packages/core/test/project/status.test.ts
- /home/zhengyew/telelean/packages/core/test/project/subjects.test.ts
- /home/zhengyew/telelean/packages/core/test/project/scale.test.ts (new)
- /home/zhengyew/telelean/packages/core/test/export/graphJson.test.ts
- /home/zhengyew/telelean/packages/core/test/protocol.test.ts
- /home/zhengyew/telelean/packages/core/test/contracts.test.ts
- /home/zhengyew/telelean/packages/runner/src/semantic/refresh.ts
- /home/zhengyew/telelean/packages/runner/src/workspace/semanticSummary.ts
- /home/zhengyew/telelean/packages/runner/src/workspace/modelWorkspace.ts
- /home/zhengyew/telelean/packages/runner/src/workspace/git.ts
- /home/zhengyew/telelean/packages/runner/src/workspace/history.ts
- /home/zhengyew/telelean/packages/runner/src/workspace/files.ts
- /home/zhengyew/telelean/packages/runner/test/integration/fixes.test.ts (new, real Lean)
- /home/zhengyew/telelean/packages/runner/test/workspace/historySafety.test.ts (new)
- /home/zhengyew/telelean/packages/runner/test/workspace/refresh.test.ts
- /home/zhengyew/telelean/packages/runner/test/semantic/guards.test.ts
- /home/zhengyew/telelean/packages/runner/test/semantic/refresh.test.ts
- /home/zhengyew/telelean/docs/m1-plan.md
- /home/zhengyew/telelean/docs/user-guide.md
- /home/zhengyew/telelean/docs/decisions-log.md

## test_runs
BASELINE before any change:
- core `npm test`: "Test Files  28 passed (28) / Tests  320 passed (320)"
- runner `npx vitest run`: "Test Files  27 passed (27) / Tests  270 passed (270) / Duration  109.42s"

FINAL:
- core `npm test` (tsc -p tsconfig.test.json && vitest run):
```
 Test Files  32 passed (32)
      Tests  349 passed (349)
```
- runner `npx tsc -p tsconfig.test.json` printed "runner typecheck ok". Then `npx vitest run` (full suite, real Lean under runLean; TELELEAN_TEST_TMP=scratch, LEAN_NUM_THREADS=4, ulimit -c 0), started 15:20:09, after the last source change at 15:19:31:
```
 Test Files  29 passed (29)
      Tests  285 passed (285)
   Start at  15:20:09
   Duration  128.99s (tests 98%, import 1%)
```
- The new real-Lean integration file, run with `--reporter=verbose`:
```
 ✓ ... loads; Lean: d1 and d-col0 proved, the cards show the whole proof and the whole multi-line statement 1910ms
 ✓ ... D->A on a proof with a column-0 comment replaces the whole proof (attic: all of it); Lean builds 1478ms
 ✓ ... delete with Lean of a statement with a column-0 comment removes all of it; Lean builds 1399ms
 ✓ ... A->G "rewrite" on an assumption d1 uses makes d1 and g1 conditional; D->A on d1 then asks, and "rewrite" drops the arguments 4041ms
 ✓ ... D->G "rewrite" on the conditional derivation replaces `(d1.holds h)` by the hypothesis h_d1 : d1; Lean builds 2786ms
 ✓ ... delete with its Lean lists an untracked lemma and another subject's proof first; confirmed, it deletes 1830ms
 Test Files  1 passed (1)
      Tests  6 passed (6)
```
- Negative control: with the binding check commented out, test/edit/bindings.test.ts gave "Tests  2 failed | 1 passed (3)". With the check restored, "3 passed".
- Typecheck of the other packages against the new core (nothing written):
  - webview `npx tsc -p tsconfig.json --noEmit`: "webview tsc status=0"
  - extension `npx tsc -p tsconfig.json --noEmit`: "extension tsc status=0"
  - I did NOT run the webview or extension test suites, Playwright, or the VS Code smoke/e2e tests: I did not touch those packages, and their tests write caches in their folders.
- Scale script (one file, n pinned cards, syntactic), after the fix:
```
n=200: buildProjectModel 10 ms; keystroke 23 ms; edit-node 55 ms
n=800: 22 / 22 / 79 ms
n=1600: 18 / 57 / 143 ms
n=3200: 45 / 119 / 293 ms
```
  The verifier measured n=1600 at 6223 / 12776 ms before.
- Verifiers' scripts re-run against my code (copies in my scratch dir, real Lean):
  - t5: D->A ok, attic holds the whole proof incl. "-- the key step", "after: status ok".
  - t7: delete gives {"ok":false,"code":"needs-confirmation","dependents":["other-goal","Spyro.helper_lemma"]}, and the build stays fresh.
  - t12: all 5 variants are "needs-confirmation" (open Spyro in / open Spyro / namespace Other + open Spyro now included).
  - t15: D->A gives needs-confirmation ["g1"]. Impact text: "Make Assumption: 1 dependent needs a rewrite".
  - t15b: D->G rewrite writes "theorem g1.holds (h_d1 : d1) (h_cynder_dark_past : cynder_dark_past) : g1 := h_d1.2"; refresh is fresh; g1 is conditional on ["d1","cynder-dark-past"].
  - t8c (mine, @H/@c/(c) forms): rewrite ok, "refresh 2: fresh".
  - t20: after the toolchain change, nodes show not-checked and uses count 0.
  - t22: Other's vocabulary now includes Spyro.IsPG and Spyro.newSpyro.
  - t23: the duplicate rationale line is kept.
  - t24: upper stays "none" for keepLean true and false.
  - t4: g-secret flags ["proved-goal"], so no longer self-evident.
  - probe5: "probe5: 2/3 checks passed" (see open_issues).
  - probe6: "probe6: 1/1 checks passed".
  - probe1b: crashes when it reads diagram.png from the snapshot; the file is no longer snapshotted (by design).

## resolved
- BLOCKER (core): a column-0 comment ended a declaration. It now ends one only when the next code starts a command, or nothing follows; indented end/namespace/section lines also end one. Lean-file edits refuse when an indented continuation follows the span, and the planner refuses when Lean's own range ends later than telelean's reading. Plan 6.1 corrected. Tests: markup, edit, and real Lean end to end.
- MAJOR (core): delete with Lean now refuses with needs-confirmation, listing what planDelete found would break (cards, untracked lemmas, other subjects' proofs). New optional `confirmed` on the delete action and on the deleteNode message. Unit test plus a real-Lean test with an untracked lemma and a cross-subject user.
- MAJOR (core): conditional .holds. D->A/G->A asks first and the drop-zone text no longer says the proofs stay valid. 'rewrite' uses the new drop-arguments edit; D->G/A->G rewrite replaces whole applications by h_n; other use shapes are refused with 'choose mark broken'. Unit tests plus a real-Lean sequence: A->G(rewrite), then D->A(rewrite) and D->G(rewrite), each builds.
- MAJOR (runner): revert refuses (code no-history, nothing written) when the snapshot of the current state fails; the message and TL202 name the lock file. Tested.
- MAJOR (core): buildProjectModel is no longer quadratic (block namespace from the parser, binary search in other per-block scans). 1600 cards in a file: 6.2 s down to 18 ms. Scale test added.
- minor (core): uses through `open`/`open … in` count as dependents in the stale-file scan, as do dotted suffixes of 2+ components. Tested.
- minor (core): self-evident now excludes footprints with `axiom:` entries. Tested.
- minor (core): rewrite handles @H, a duplicated @c reference and parenthesised (c) references. Tested with fake facts and with real Lean.
- minor (core): plans keep other cards' bindings (a blank line keeps a comment-only card above a deleted one from binding to what follows; any other change is refused). Tested with a negative control.
- minor (core): editing a TL005-duplicated field keeps the duplicate lines; removing such a field is refused.
- minor (runner): unsupported-toolchain and unsupported-project drop the facts in use, so the board is really syntactic. Tested.
- minor (core): boards list the vocabulary items of other subjects their cards use, read-only under full names, so glosses and highlighting resolve. Tested.
- minor (core): graph.json 1.1 adds status.conditional_on; footprint is now the real footprint for conditional proofs. Schema regenerated; 1.0 documents still validate.
- minor (runner): the syntactic-mode banner names the project's current toolchain pin. Tested.
- minor (core): the impact text names the real hypothesis (h_<statement>); TL011 wording matches the stance-aware chip.
- minor (docs): user-guide §9 reload advice, §8 settings note, §3 Vocabulary group and Problems button, §4 toast Undo and Undo after hand edits corrected.
- minor (runner): only layout.json and attic/*.lean of a subject's sidecar folder are snapshotted, reverted or deleted; a binary file survives revert and undo byte-exactly. Tested.
- minor (runner): the memory guard runs again before the check spawn, and spawn MemoryMax is lowered to MemAvailable minus a reserve. Tested with real Lean and by inspecting the arguments passed to systemd-run.
- minor (runner): snapshot temp dirs live in <gitDir>/telelean-tmp-*; leftovers older than 10 minutes are swept. Tested with an unusable TMPDIR.
- minor (runner): git errors keep the first fatal:/error: line plus the last line. Tested.
- minor (runner): linked worktrees get their own history chains (-wt<hash> in the ref key); the main worktree keeps its key. Tested in scratch repos.
- minor (docs): user guide adds history in an existing repo, removing refs/telelean, the exactness of undo after hand edits, and deletes going to the OS trash.

## open_issues
- NEEDS THE OTHER FIXER (extension, outside my paths): packages/extension/src/logic/actionMapping.ts destructures only { id, keepLean } from deleteNode, so `confirmed` never reaches the BoardAction. Map it: `{ kind: 'delete-node', id, keepLean, ...(confirmed ? { confirmed } : {}) }`. Until then, deleting a card's Lean while others use it is always refused; this is safe, and the toast lists the dependents.
- NEEDS THE OTHER FIXER (webview): when a deleteNode request gets actionResult needs-confirmation, DeleteDialog should list outcome.dependents (node ids by sentence, other entries as Lean names), offer 'Delete anyway (they stop compiling)', which resends deleteNode with confirmed: true, and keep 'Delete card only, keep Lean' and Cancel. Today store.ts sends it to errorToast.
- NEEDS THE OTHER FIXER (webview): DependentsDialog now also opens for D->A/G->A on a conditional proof (store.ts opens it for any kind-change needs-confirmation). Its hard-coded lines assume a change to Goal: 'A … is not taken as given, so its .holds has to go' and 'Rewrite them to take it as a hypothesis'. For to === 'ASSUMPTION' they should say, e.g., 'As an assumption its .holds becomes an axiom that states it directly; these pass it arguments:' and 'Rewrite them to use it directly'. The summary and detail from kindChangeImpact are already correct.
- Optional for the webview: other subjects' vocabulary items now appear in graph.vocabulary under their full names, with item.subject !== graph.subject. A 'from <subject>' tag would make that clearer; nothing breaks without it.
- The extension and webview bundles (packages/extension/dist, dist/webview) include core and must be rebuilt by the integrator or the other fixer for the user's installed copy to get these fixes. I did not touch dist.
- Verifier scripts with obsolete premises: probe5's third check ('the hand work is somewhere in the history') fails because the revert is now refused, so nothing is snapshotted or lost: the hand-made files stay on disk. My test shows that after the lock is removed the revert works and 'Manual edits' is in history. probe1b crashes because it reads diagram.png from a snapshot, and such files are no longer snapshotted; my test checks byte-exactness after revert and undo instead.
- Not done as suggested: spans are not taken from the .ilean full range. Instead, the planner refuses when the .ilean range ends after the span telelean would cut, and the text rule is fixed.
- docs/user-guide.md §4 (delete confirmation, toast Undo) describes the core and runner behaviour. Re-check the wording once the other fixer's webview and toast changes land.

## minor_decisions
- **decision:** A column-0 comment ends the declaration above only when the next code starts a command (or none follows); indented namespace/section/end/mutual lines also count as command starts.
  - **rationale:** Lean treats comments as whitespace. The issue's own suggested rule, plus a fix for an indented `end` after such a comment.
- **decision:** Two guards against cutting a declaration: Lean-file edits refuse when an indented continuation follows the span, and the planner refuses when the .ilean range of a fresh declaration ends after the span. Spans are not replaced by .ilean ranges.
  - **rationale:** A refusal is always safer than a half-removed proof. With the fixed text rule the guards are only defence in depth.
- **decision:** Removed declarations separated only by whitespace are deleted in one edit.
  - **rationale:** Separate deletions left two blank lines where a statement and its .holds were removed together.
- **decision:** Delete with Lean needs `confirmed: true` when brokenDependents is not empty; dependents are listed as owning card ids first, then untracked full names.
  - **rationale:** Same shape as the needs-confirmation answer for kind changes, so the board can reuse its list rendering.
- **decision:** Conditional .holds, D->A: only direct users are asked about or rewritten; 'rewrite' drops arguments only from parenthesised applications with exactly k plain identifier arguments; anything else is refused with 'choose mark broken'.
  - **rationale:** Users' own types do not change, so their users are unaffected. Recognising every way to apply a function is too risky for a mechanical edit.
- **decision:** Conditional .holds, D->G/A->G rewrite: each whole application `(n.holds h …)` becomes `h_n : n`, rather than giving the hypothesis the full type `a → n`.
  - **rationale:** The user then becomes conditional on node statements (clean status). The full-type option compiles but shows TL114 holds-mismatch.
- **decision:** Lean's duplicate reference ranges (with and without `@`, with and without parentheses) are merged to one span per identifier end, keeping the `@` one.
  - **rationale:** Real .ilean data records both. Seen in the verifier's and my own probes.
- **decision:** The stale-file dependent scan resolves through `open`ed namespaces (generously: file-wide, ignoring `in` and section scoping) and counts dotted suffixes of at least 2 components.
  - **rationale:** Over-reporting only adds a confirmation, missing a use removes a .holds others need. Single-component suffixes were excluded to avoid matching local variables.
- **decision:** Other blocks' bindings are checked at the end of every plan: a comment-only block that became adjacent gets a blank line inserted; any other binding change is refused (unsafe).
  - **rationale:** Catches every rebinding a block or declaration removal can cause, not just the reported case.
- **decision:** TL005 duplicates are kept when a field is set; removing a duplicated non-list field is refused; list fields (premises, lean, tags) still collapse repeated lines.
  - **rationale:** Keeps text the user typed, never promotes a hidden value silently. List lines add up to one value, so removing them is correct.
- **decision:** Foreign vocabulary items on a board keep their own `subject` and use the full name as `shortName`; the sort behind a used presupposition comes along.
  - **rationale:** Hover and highlight resolve without webview changes, and presupposition chips can read the sort's gloss. VocabFlag was not extended because the webview has an exhaustive Record over it.
- **decision:** graph.json version 1.1: `conditional_on` is always written (optional in the schema); `footprint` of a conditional node is now its real footprint; the schema file keeps its name.
  - **rationale:** The suggested fix. There are no outside consumers yet, and 1.0 documents still validate.
- **decision:** TL011 text is stance-aware: 'This rule has no `rationale:` yet (no source yet: …)', otherwise '(no reason yet: why do you hold it?)'.
  - **rationale:** It contains the chip's own words, so Problems and the card match.
- **decision:** `other` justification kind is treated as a theorem in kindChangeImpact; the impact names `(h_<last component> : <statement>)`.
  - **rationale:** Plan 6.2 rule; the text now matches what the rewrite writes.
- **decision:** unsupported-toolchain and unsupported-project drop the workspace's facts (new DROPS_FACTS set); low-memory, timeout, oom, cancelled and could-not-start still keep them.
  - **rationale:** Only the first two mean the project as it is cannot be checked at all (D-7).
- **decision:** Only revert requires the base snapshot; ordinary actions still proceed when a snapshot fails.
  - **rationale:** A revert deletes and overwrites hand-made files. An action keeps hand edits in the files and in the undo stack; this matches the WP4 decision 'actions still work without history'.
- **decision:** Subject sidecar scope is layout.json plus attic/*.lean only, also applied to revert targets and the 'current' history diff.
  - **rationale:** Files telelean does not write may not survive being read as text; now they are never touched.
- **decision:** Spawn memory cap = min(configured cap, MemAvailable − min(1 GiB, threshold/2)), floor 256 MiB; the guard is re-checked before the check spawn and a failure returns low-memory.
  - **rationale:** Scope item 3 ('before each spawn'). The default threshold of 2 GiB was below the default cap of 4 GiB.
- **decision:** Snapshot temp dir is `<gitDir>/telelean-tmp-*`; leftovers older than 10 minutes are swept once per git dir per workspace.
  - **rationale:** Never in the OS temp dir or the model folder, which watchers would see. 10 minutes avoids racing another window's live snapshot.
- **decision:** Linked worktrees: rootKey + `-wt` + 8 hex of sha1(git dir relative to the common dir); the main worktree keeps its key.
  - **rationale:** Backward compatible for existing chains, and stable if a worktree is moved.
- **decision:** The integration test for the fixes uses git disabled and its own Main.lean in a copy of mental_model/; the cross-subject case creates subject Other through create-subject.
  - **rationale:** Isolated, fast (about 14 s) and exercises the real planner, applier and Lean.

## effects_outside_repo
- Wrote only under my scratch dir /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/fix-core-runner/ (test temp trees in tt/, logs/, esbuild bundles, a CPU profile, the verifier scripts I copied in with their work dirs in sem/work, scratch git repos and worktrees in runs/). Read-only copies were taken from the other verifiers' scratch dirs.
- npm debug logs: each npx invocation (tsc, vitest, esbuild) wrote a log to ~/.npm/_logs, and npm rotated them (its default keeps the newest 10). I did not change any npm setting.
- The runner suite's llm tests (runner/test/llm, unchanged) create temp dirs under the OS temp dir (/tmp) because TELELEAN_TEST_TMPDIR was not set; they removed them. No leftovers of mine in /tmp (only other processes' playwright-* and vscode-typescript1002 entries).
- Lean ran under runLean: the toolchain binaries in ~/.elan/toolchains/leanprover--lean4---v4.35.0 were used read-only, and transient systemd --user scopes telelean-* were created and removed (none left; checked with systemctl --user list-units). The runner test asserting ~/.elan/known-projects is unchanged passed.
- git ran only in scratch repositories under my scratch dir, with GIT_CONFIG_GLOBAL=/dev/null, GIT_CONFIG_NOSYSTEM=1, GIT_CEILING_DIRECTORIES, the safe -c flags and explicit authors. No remotes, no pushes, no git in /home/zhengyew/telelean or mental_model.
- Vitest result caches were written inside my assigned paths (packages/core/node_modules/.vite, packages/runner/node_modules/.vite).
- No network use, no downloads, no npm install, no Claude CLI, no files touched in mental_model/ or test-fixtures/ (verified: none modified since 14:28, no .lake/.git/graph.json there), no edits outside my assigned paths.

