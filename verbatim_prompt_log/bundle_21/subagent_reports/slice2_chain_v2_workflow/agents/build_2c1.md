# build:2c1

Agent `a390b549c77f955ed` of workflow `wf_ae5f1188-533`. Verbatim output (JSON alongside).

# Builder 2c1 report: the base mask, the build's mask and endorsements options, `endorsementHash`, and the protocol messages

Sub-slice 2c1 is built. Every package compiles and every unit test passes. All work is in the working tree only: no git changes, nothing staged, no commit. Repo: /home/zhengyew/telelean. Scratch dir: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b2c1.

## Carry-overs
- **AP30-1 r3 (hygienic names): found done.** Builder 2b2 had already implemented it in `packages/core/src/gate/g0.ts` (`eraseMacroScopes`, `isHygienicName`, an `init` attribute list judged as a whole). The §6.1 tests are in `test/gate/g0.test.ts`. I re-ran four mutations and each fails a test:
  - drop the hygienic-name rule;
  - compare names without `eraseMacroScopes`;
  - judge the list line by line;
  - a `«_@»` component alone no longer counts as hygienic.

  `g0.ts` is byte-identical to before (`cmp`).
- **R2-1 (2b2's review): fixed as the brief says**, in `packages/core/src/review/revert.ts` step 2:
  - a run now ends where B's declaration text ends in the inserted text (its trailing spaces included; `trimEnd()` only as a fallback);
  - `follows` requires the same side, path and offset;
  - before a unit, the next place starts at the run's end instead of walking back over whitespace.

  Added 3 revert tests:
  - both layouts with trailing spaces, tabs or both; each declaration alone;
  - a CRLF file; three in a row;
  - R1-2's pending-claims scenario.

  §4.11 and the fixer 2b2 r2 entry are reworded as the brief asked.

## Files changed
- `packages/core/src/review/revert.ts`: the R2-1 fix.
- `packages/core/src/review/mask.ts`: `baseMask` and `maskFacts` replace their stubs. Added `projectMaskOf` and `maskedModel`, imported by path; `review/index.ts` is unchanged.
- `packages/core/src/review/types.ts`: `BaseMask.restoreMarks` (additive), plus doc notes.
- `packages/core/src/project/types.ts`: `ProjectMask`, `ProjectInput.mask`, `ProjectInput.endorsements`.
- `packages/core/src/project/build.ts`:
  - applies the mask (`maskFiles`, `maskedCode`, `withoutHidden`, refs of composed card code);
  - masked `premises` and the mark on each card;
  - `codeJoint`, exported; `codePieces` uses it with unchanged logic;
  - endorsements drop `definitional-choice`.
- `packages/core/src/paths.ts`: `endorsementsPath`, `Endorsement`, `EndorsementsFile`, `endorsementHash`, `parseEndorsements`, `serializeEndorsements`.
- `packages/core/src/protocol.ts`:
  - the host → webview `session` message and its light check;
  - the 10 webview → host messages with validators;
  - `SESSION_MESSAGE_TYPES`, appended to `RUN_MESSAGE_TYPES`;
  - new LIMITS: `inferences`, `decisions`, `stages`, `revision`.
- `packages/extension/src/logic/boardSession.ts`: `dispatchRun` gains a `default` that answers `not-yet` with "Not built yet (slice 2)". Without it the extension does not compile (TS2366).
- `docs/slice2-plan.md`:
  - §2.9's `BaseMask` block gains `restoreMarks`, plus a note on `projectMaskOf` and `maskedModel`;
  - §4.11 and fixer 2b2 r2's R1-2 entry reworded for R2-1;
  - a new §8 entry, "builder 2c1", with every decision and its alternative.

## Tests
- **Added:**
  - `core/test/review/mask.test.ts` (new, 28 tests);
  - `core/test/project/endorsements.test.ts` (new, 7);
  - `core/test/protocol.session.test.ts` (new, 15);
  - `core/test/review/revert.test.ts`: 3 more (R2-1);
  - `extension/test/unit/runRouting.test.ts`: 1 more (every session message is answered `not-yet` and reaches no RunManager method).
- **Updated:**
  - `core/test/protocol.m2.test.ts`: `RUN_MESSAGE_TYPES` now has 21 entries, with M2's eleven first;
  - `extension/test/unit/runRouting.test.ts`: the routed set now includes `SESSION_MESSAGE_TYPES`.
- Skipped, moved to a later sub-slice, or deleted: none.

## Verification
Every command ran under `capped.sh`, which sets `TELELEAN_NO_REAL_CLAUDE=1`, with `TMPDIR` and `TELELEAN_TEST_TMP` in my scratch dir.

- **Typecheck:** from each package, `capped.sh 1800 /home/zhengyew/telelean/node_modules/.bin/tsc --noEmit -p <config>`. rc=0 for all five:
  - core `tsconfig.test.json`;
  - runner `tsconfig.test.json`;
  - webview `tsconfig.json` and `tsconfig.node.json`;
  - extension `tsconfig.json`.
- **Unit tests:** from each package, `capped.sh 1800 …/vitest run --maxWorkers=1 --no-cache --fsModuleCachePath=<scratch>/verify_final/fsmc`.

| Package | Test files | Tests | Before |
|---|---|---|---|
| core | 75 passed (75) | 1050 passed (1050) | 997 |
| webview | 19 passed (19) | 314 passed (314) | |
| extension | 22 passed (22) | 204 passed (204) | |

- **Runner, real Lean:** from `packages/runner`, one file at a time, waiting until MemAvailable is at least 12 GB: `env -u UPDATE_SEMANTIC_RECORDINGS capped.sh 3000 timeout 900 …/vitest run --maxWorkers=1 --no-cache --fsModuleCachePath=… <file>`. All passed; no `/tmp/telelean-*` left over.

| File | Tests passed |
|---|---|
| `workspace/arrows` | 7 |
| `workspace/scan` | 7 |
| `workspace/realcore` | 4 |
| `workspace/refresh` | 13 |
| `workspace/perform` | 8 |
| `integration/fixes` | 5 |
| `integration/session` | 8 |
| `integration/m2flow` | 5 |
| `semantic/valueProbe` | 2 |
| `run/manager.gate` | 8 |
| `gate/engine` | 30 |

  These ran just before two small loop refactors in `mask.ts` and one doc comment. No runner code calls the mask functions. Core's suite and the affected mutations were re-run on the final code.
- **Webview:** I changed no webview file, so there was no scratch build and no Playwright run.

## Mutation checks
106 mutations; every mutated file was restored byte for byte (`filecmp`). The full list (file:line, what was broken, which test failed) is in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b2c1/mutation-table.txt.

- **Carry-overs: 8.** 7 fail a test:
  - R2-1: 3 (the file as it was before the fix, the run's end at `trimEnd()`, the walk back restored);
  - G0: 4.

  One is equivalent: R2-1's side check in `follows` (revert.ts:258). An `after` offset is a kept unit's end and a `before` offset is the first kept unit's start, and every `before` place of a file precedes every `after` one in B's order, so the two can never share an offset.
- **2c1's rules: 98, all failing at least one test.** They cover:
  - `baseMask`: 10 (mask.ts:49–64);
  - `maskedNames`: 3;
  - `maskFacts`: 16;
  - `projectMaskOf`: 5;
  - `maskedModel`: 3;
  - the build's mask: 22;
  - endorsements in the build: 6;
  - `paths.ts`: 5;
  - protocol: 27;
  - the host's `not-yet`: 1.

  The first run had 6 survivors, each fixed:
  - two redundant paths to a written premise card's declarations: only one kept (what the card owns, `ownerOfDecl`), plus a test with two pins;
  - a working-copy message identical to B's was de-duplicated: new test where the working copy has a message B lacked;
  - a mark guard that the node rule repeats: removed;
  - refs outside their own declaration: new test;
  - endorsement-format test cases had empty lists: now they have entries.

## Decisions for the orchestrator to log
Each is also in the plan's §8 as "builder 2c1 decided".

1. **How the build applies the mask.** It keeps the working copy's texts and positions. Masked declarations (and a `mutual` whose declarations all go) leave the build's view of each file; written premise blocks go before ids are assigned; Claude's arrows and the premises' arrows leave `premises:`; the input's facts are `maskFacts`' output. *Alternative:* rewrite the texts and re-position the facts.
2. **A target's code** is composed as in B: the working copy's statement, B's `.holds` text, joined as B joined them (`codeOverride.joined`). Its refs come from B's DeclFacts, kept at B's positions and placed against B's range. B's messages for it sit at the start of the working copy's declaration. *Alternative:* the working copy's layout around B's text, which shows where proof material was written.
3. **Other cards' code.** If masked declarations sit between a card's statement and its `.holds`, the code is one stretch without them, as LeanOps' removal (`deletionEdit`) leaves the text, and the `.holds` refs move up accordingly. *Alternative:* the working copy's two pieces.
4. **`baseMask`'s lists:**
   - `drop` reads each name's first `created` entry and never takes a name B has;
   - `dropArrows`, `dropNodes` and `restoreMarks` are each measured against B (an arrow B draws, a card B has, a mark B had);
   - each list is sorted, without duplicates;
   - a target's B `.holds` always wins over `drop`.

   *Alternative:* take every ledger entry as it is.
5. **A written premise card's declarations** are what the card owns (`ownerOfDecl`). *Alternative:* by name, which would hide another card's statement in a TL017 case.
6. **`maskFacts` details:**
   - a name only Lean reports goes with its parent (`parent`, else range, else name prefix);
   - a message belongs to a declaration whose syntactic range holds its start;
   - B's messages of unchanged declarations move by the line offset (and the first line's column);
   - `check.probed` is recounted;
   - a state without facts is refused (`invalid`), and `maskedModel` builds such a state without facts.

   *Alternative:* keep the working copy's count, or return empty facts.
7. **Derived ids.** A card into which only hidden writes went, and whose `id:` telelean wrote back over B's derived id, reads as derived again, with the parser's TL112 (`ProjectMask.derivedIds`). This does not apply if its `lean:` pins also changed. *Alternative:* show the written id.
8. **A new file of proof material only** (B lacks it, no block, every declaration masked) is left out of the build whole, so no TL118 appears. *Alternative:* keep it, empty.
9. **Freshness.** `maskedModel` keeps the working copy's: a fresh file gets its module's hash, any other file a differing one. *Alternative:* a file-hashes input.
10. **A block whose adjacent declaration is masked** becomes code-less. Its gap declaration is re-indexed or dropped, and the parser's TL013 hint is not re-derived; no stage can hold that state. *Alternative:* re-parse.
11. **Endorsements:**
    - `endorsementHash` is SHA-256 of the declaration's source text (`VocabItem.code` / `DeclEntry.text`) with whitespace collapsed;
    - entries count only for their own subject;
    - a card keeps the flag while any definition it uses still needs endorsement;
    - `parseEndorsements` (lenient, fails closed) and `serializeEndorsements` (sorted) sit in `paths.ts`, because 2f may not change core.

    *Alternatives:* hash the exact text; one list for all subjects.
12. **Protocol details:**
    - `requestId` is optional, as on every other message;
    - `stage` runs 0 to `LIMITS.stages`; a decision's `rev` and an Undo/Redo `step` 0 to `LIMITS.revision`;
    - item ids and the final check's id are host tokens;
    - `note` is kept as typed unless blank; `rationale` is trimmed, one line, dropped when blank;
    - `endSession` `back` refuses a check, and `exit` refuses a stage or a check;
    - `revealResult` refuses `raw-diff`.

    *Alternative:* a required `requestId`.
13. **Host change pulled forward from 2c2.** Putting the session messages in `RUN_MESSAGE_TYPES` (as §2.4 requires) broke the extension's compile, so `dispatchRun` got the `not-yet` default ("Not built yet (slice 2)") that §1.1 assigns to 2c2, with a routing test. *Alternative:* keep the session messages out of `RUN_MESSAGE_TYPES` until 2c2, against §2.4.
14. **Contract additions** (additive):
    - `BaseMask.restoreMarks`, because the build cannot read the ledger;
    - `ProjectMask` adds `restoreMarks`, `derivedIds` and `codeOverride.joined` to the plan's fields;
    - `SESSION_MESSAGE_TYPES`.

    No §2.9 signature changed. 2c2 should import `projectMaskOf` and `maskedModel` from `review/mask.ts`.

## Effects outside the repo and my scratch dir
- None from me. capped.sh's transient systemd user scopes are gone, and no process of mine is left running.
- Inside the repo, Vite wrote and deleted its bundled config in the `node_modules/.vite-temp` folders (root, core, runner, webview); all are empty now.
- Untouched:
  - `node_modules/.vitest-cache` (no file newer than my start);
  - `packages/extension/out` and `dist`;
  - `/tmp` (no `telelean-*` left);
  - `~/.npm/_logs`;
  - git (`.git/index` last changed Nov 17; HEAD still `187673d`).
- New files appeared under `verbatim_prompt_log/bundle_21/subagent_reports/slice5_ultra_review_workflow/` during my run. Another workflow wrote them, not me.

