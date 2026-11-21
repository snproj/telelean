# fix:2c1:r1

Agent `a704d6154e8ecca90` of workflow `wf_ae5f1188-533`. Verbatim output (JSON alongside).

# Fixer 2c1 round 1: report

All 18 findings are fixed: 4 blockers, 6 majors, 6 minors and 2 nits. Every package compiles and every unit test passes. All work is in the working tree only: no git change, no commit.

Every fix has a test that fails without it. Run against the files as they were before this round, 14 of the new or rewritten tests fail; on the fixed code they all pass. 34 targeted mutations also each fail a test.

Scratch dir: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2c1r1. Backups are in its `backup/`, and the changed-file list is `changed_files.txt`.

## Findings

**A-ADV-1 (blocker): fixed.** A card's own statement could be hidden.
- Cause: a step that formalises a card and ends not proved without a freeze records the new declarations as `proof`, so the mask hid them.
- Fix: in `maskedNames` (review/mask.ts), a name in `BaseMask.drop` is left out only when no card of the working copy binds it (`ownerOfDecl`).
- A written premise card's names still go with it. A target's `.holds` is still covered by `holds`.

**S-V2C1-S1, C-V2C1-C1, A-ADV-2 (blockers): fixed.** A hidden lemma right below a pinned card's block unbound the card.
- Fix: `maskFiles` (project/build.ts) re-parses each file that loses anything. The text it parses is the file with every left-out span removed as LeanOps' removal does (`withoutSpans`). Each kept block takes its binding from that parse (`twinBindings`), so a pinned block stays pinned.
- If that parse does not read as the same blocks and declarations, the build fails safe: only a binding by adjacency becomes code-less; a pinned binding is kept.

**C-V2C1-C2, A-ADV-3 (majors): fixed.** TL013 and TL014 hints could name or describe a hidden declaration.
- Fix: these hints are now taken from the same re-parse, so B's own hint comes back.
- On the fail-safe path, any hint about a left-out declaration is dropped.
- The old test at mask.test.ts:623 lost its TL013 exclusion; it now asserts B's TL013 exactly.

**C-V2C1-C3, S-V2C1-S3, A-ADV-4 (majors) and C-V2C1-C5 (minor): fixed.** Another card's code could show Claude's comment, extra blank lines or a namespace written with a hidden lemma; a hidden `mutual` also deleted the person's own note after it.
- New `ProjectMask.codeLayout`: every card the working copy has with B's statement and `.holds` texts is composed in B's layout (B's joint, or two pieces).
- New `ProjectMask.lines`: comment lines attached to a left-out declaration, or to a target's `.holds` shown as B's, and enclosing lines around only such declarations. These are found with `compareTexts`.
- A card new in the session drops those lines, its left-out declarations, and any target `.holds` the step moved into its code.
- New `mergeSpans`: overlapping spans, and spans with only whitespace between them, are deleted once. This fixes C5.
- Refs are now placed by the column where the `.holds` starts (`CodeDecl.column`), which matches B's own build for joined, apart and indented layouts.

**S-V2C1-S2 (major): fixed.** Where facts did not decide the target's kind, the hidden board showed the proof as a theorem.
- Fix: `codeOverride` now carries B's keyword, and the build reads the overridden declaration with it.
- Tested in four states: no facts, B without facts, the module failed, the file stale. Each gives `pending`, the same as the not-proved twin.

**S-V2C1-S4 (minor): fixed.** B's messages for a target's `.holds` now go to the start of the target's statement in the working copy, so their order no longer shows that the step moved the `.holds`. §2.9 and §4.7 are amended.

**S-V2C1-S5 (minor): fixed.** `derivedIds` no longer needs a current hidden write. It restores B's derived id on every card whose id was written back while its `lean:` pins stayed B's.

**S-V2C1-S6, C-V2C1-C4, A-ADV-5 (minors): fixed.** `maskedModel` now accepts optional `endorsements` and `lakefile` and passes them to the build.

**A-ADV-6 (nit): fixed.** `maskFacts` drops the `detail` of the envelope, `build`, `check` and `probe`.

**C-V2C1-C6 (nit): fixed.** `dispatchRun` now names the ten session messages as explicit `case` labels instead of a `default`. Removing one label now fails the extension's tsc with TS2366.

## Files changed
- /home/zhengyew/telelean/packages/core/src/review/mask.ts
- /home/zhengyew/telelean/packages/core/src/project/build.ts
- /home/zhengyew/telelean/packages/core/src/project/types.ts (`ProjectMask.codeLayout`, `ProjectMask.lines`, `codeOverride[].keyword`; all additive)
- /home/zhengyew/telelean/packages/core/test/review/mask.test.ts (28 → 41 tests)
- /home/zhengyew/telelean/packages/extension/src/logic/boardSession.ts
- /home/zhengyew/telelean/docs/slice2-plan.md
  - §2.9 and §4.7 amended; one new accepted residual added to §4.7;
  - §6.1's 2c1 test list extended;
  - five of builder 2c1's decisions annotated as superseded or amended;
  - a new §8 entry, "fixer 2c1 r1".

Tests:
- **New (13):** one per finding group above, plus the fail-safe path and the "B's layout only when the texts are B's" check.
- **Rewritten (3):**
  - the lemma inside another card's code: the oracle is now the not-proved twin, with five layouts;
  - the empty mask: the new fields, plus apart and indented layouts;
  - the adjacent block: now uses a hand-made mask, since a card's own statement is no longer dropped.
- None deleted, skipped or moved.

## Mutation checks
- **34 source mutations:** each was run on `test/review/mask.test.ts`, each made at least one test fail, and each file was restored byte for byte (checked with filecmp and `cmp`). The full table (file:line, what was broken, which tests failed) is in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2c1r1/mutation-table.txt.
- **One compile check (C6):** removing one `case` label fails the extension's tsc with TS2366. The file was restored and checked with `cmp`.
- **The pre-fix files:** running the new test file against the three pre-fix source files gives "Tests  14 failed | 25 passed (39)".

## Verification
Every command ran under `capped.sh`, with `TMPDIR` and `TELELEAN_TEST_TMP` in my scratch dir.

- **tsc**, from each package: `capped.sh 1800 …/tsc --noEmit -p <config>`. rc=0 with no output for all five:
  - core `tsconfig.test.json`;
  - runner `tsconfig.test.json`;
  - webview `tsconfig.json` and `tsconfig.node.json`;
  - extension `tsconfig.json`.
- **vitest**, from each package: `capped.sh 1800 …/vitest run --maxWorkers=1 --no-cache --fsModuleCachePath=<scratch>/fsmc`.

| Package | Test files | Tests |
|---|---|---|
| core | 75 passed (75) | 1063 passed (1063) (was 1050) |
| webview | 19 passed (19) | 314 passed (314) |
| extension | 22 passed (22) | 204 passed (204) |

- **Runner:** no runner file changed, and no runner source builds with a mask, so no runner test file is touched. As a smoke run I ran `env -u UPDATE_SEMANTIC_RECORDINGS capped.sh 3000 … timeout 900 vitest run … test/gate/pure.test.ts test/gate/rules.test.ts`. `rules.test.ts` uses real Lean; MemAvailable was about 14.5 GB. Result: "Test Files  2 passed (2)", "Tests  40 passed (40)".
- **Snapshots:**
  - `before.diff`: 4383607 bytes, 356 files;
  - `after.diff`: 4436840 bytes, 356 files;
  - only my six files' patches differ between them.

## Decisions for the orchestrator to log
Each is also in the plan's §8 as "fixer 2c1 r1 decided".

1. **A card's own declarations.** A name in `BaseMask.drop` is left out only when no card of the working copy binds it.
   *Alternative:* amend D2-43 for 2d so that card-bound names are always recorded as `statements`.
2. **Bindings and hints.** The build re-parses the file without what the mask leaves out, and takes each block's binding and TL013/TL014 hints from that parse. When the parse does not match, it fails safe.
   *Alternative:* the fail-safe path only, which cannot bring back the hint B had.
3. **Other cards' code.** B's layout is used for every card that keeps B's statement and `.holds` texts, whatever lies between them in the working copy. A card new in the session drops its left-out declarations, a moved target `.holds`, and their attached lines, deleted as merged spans. A new residual is accepted (§4.7): around a hidden lemma inside a new card's code, the text cannot tell which blank lines came with the lemma.
   *Alternative:* use B's layout only when something hidden sits between.
4. **The target's kind.** B's keyword travels in `codeOverride`, and the build reads the overridden declaration with it.
   *Alternative:* pass the kind through the facts only, which cannot cover a state without facts.
5. **B's messages for a target's `.holds`** go to the start of the target's statement in the working copy.
   *Alternative:* B's position, moved by the statement's line offset.
6. **Derived ids.** `derivedIds` covers every card whose id was written back while its pins stayed B's.
   *Alternative:* restore the id in `planItemRevert` when a written premise is taken out.
7. **`maskedModel` inputs.** It takes optional `endorsements` and `lakefile`.
   *Alternative:* keep both on `ProjectModel`.
8. **Masked facts** carry no `detail` anywhere.
   *Alternative:* keep only `probe.status`.
9. **The host's `not-yet` answer** uses explicit `case` labels instead of a `default`.
   *Alternative:* keep the `default`.

## Effects outside the repo and my scratch dir
- **None from me.** No process of mine is left running, and `capped.sh`'s systemd scopes are gone. The running `lean --server` and `lake serve` processes are the user's own (the webring project); I did not touch them.
- **Inside the repo:** Vite wrote and deleted its bundled config in the `node_modules/.vite-temp` folders (root, core, runner, webview). All are empty; only their directory times changed.
- **Untouched:** `.git/index` (last changed Nov 17; HEAD still `187673d`), `~/.elan`, `~/.npm/_logs`. No `/tmp/telelean-*` folder is left.
- **Not mine:** `~/.cache/copilot` has newer files; I ran nothing that touches it.

