# fix:2c1:r2

Agent `aa54329f83d1bae61` of workflow `wf_ae5f1188-533`. Verbatim output (JSON alongside).

# Fixer 2c1 round 2: report

All three findings are fixed: R1-1 and R1-2 (major), R1-3 (minor). Every package compiles and every unit test passes. All work is in the working tree only: no git change, no commit.

Every fix has a test that fails without it. Run against the files as they were before this round, 7 of the 9 new tests fail. 13 targeted mutations: 12 fail a test, one is equivalent.

Scratch dir: /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2c1r2. Backups are in its `backup/`, and the changed-file list is `changed_files.txt`.

## Findings

**R1-1 (major): fixed, in core's gate.** The finding addressed this to 2d/2b. I fixed it in core, because 2c1 is the only core sub-slice running now, and the plan already states the rule: §4.9 says "Card statements … never may mention [proof material]".
- **The problem:** the gate's `other-result` rule judged a card's statement by its creator's phase. A finish without `freeze_statements` records everything the step wrote as `proof`, so a newly formalised statement could use a definition the same step wrote. That definition was then hidden with the Result, while the statement stayed listed.
- **The fix** (`otherResultFindings` in `packages/core/src/gate/sessionRules.ts`):
  - a declaration a card binds (its statement, its `.holds`, a pin) is never proof material;
  - a card's statement or pin is always judged as a statement, whatever phase wrote it.
- **The effect:**
  - Such a finish is now refused at the step, with a new message asking Claude to freeze: `CLAUDE_SESSION_TEXTS.otherResultNotFrozen` in `review/texts.ts`. Once frozen, the statement and the definition both read `statements`, as in the proved outcome.
  - A card formalised after the freeze may not use a definition written after it either; that case keeps the usual message.
  - A card's statement may still use another card's statement written in the same step.
  - D2-43, `baseMask` and 2d's ledger rule are unchanged.
- **Verified:** the reviewer's state, judged at `gate-other`, is now refused naming `Spyro.DarkChar`. With the freeze it passes. With a statement using only B's names it passes without a freeze.

**R1-2 (major): fixed** in `maskFiles` and `twinBindings` (`packages/core/src/project/build.ts`).
- The twin text now also leaves out each target's `.holds` that has a `codeOverride`.
- The re-parse runs in every file that holds such a `.holds`, even when nothing else in the file is left out.
- The twin's declaration indices are mapped back to the masked file's, where the overridden `.holds` stays.
- When the build has to fail safe, an overridden `.holds` is treated like a left-out declaration: an adjacent one leaves the block code-less unless it is pinned, and its hint is dropped.
- **Verified with the reviewer's probe:** the TL013 naming `cynder_not_good.holds` is gone, and the two outcomes' graphs (positions stripped) are now equal.

**R1-3 (minor): fixed** in `maskedCode` (`build.ts`), with new helpers `withoutBlankLines` and `blockCommentMask`.
- **Which cards:** a card with neither `codeOverride` nor `codeLayout` (in practice one the session formalised), whose gap between statement and `.holds` holds only blank lines and comments once hidden content is taken out.
- **What changes:** such a card is always composed with every blank line between its statement and its `.holds` removed, whether or not anything was taken out.
- **What stays:**
  - comment lines;
  - lines inside a block comment;
  - the statement's last line and the `.holds`' indentation;
  - the original line breaks (LF or CRLF).
- **Side effect:** a card written with a blank line reads tight while the results are hidden, the same in both outcomes. Cards B already had keep B's layout.
- The residual fixer 2c1 r1 accepted for this is removed from §4.7.
- **Verified:** the reviewer's probe now gives identical code for the twin, the spaced lemma and the tight lemma.

## Files changed
- packages/core/src/gate/sessionRules.ts (R1-1)
- packages/core/src/review/texts.ts (R1-1: `otherResultNotFrozen`)
- packages/core/src/project/build.ts (R1-2, R1-3)
- packages/core/test/review/judge.test.ts: +3 tests, `HONEST_PROOF` import
- packages/core/test/review/mask.test.ts: +6 tests, `computeItems` import
- docs/slice2-plan.md:
  - §3.4 (step end), §4.7 (the "dropped" bullet, the `buildProject` bullet, the residuals) and §4.9 (`other-result`);
  - §6.1's 2c1 test list;
  - three of fixer 2c1 r1's §8 entries annotated as completed, amended or superseded;
  - a new §8 entry, "fixer 2c1 r2".

## Tests
- **judge.test.ts:**
  - an unfrozen not-proved finish is refused, and passes with the freeze or with only B's names; check_lean says nothing while formalising;
  - a card formalised after the freeze may not use a definition written after it;
  - one card's statement may use another card's statement written by the same unfrozen step.
- **mask.test.ts:**
  - R1-2:
    - a `.holds` moved below a code-less card (B's hint about what follows comes back);
    - B's `.holds` below a code-less card, in place or moved;
    - the fail-safe path.
  - R1-3:
    - tight or spaced statement × tight or spaced lemma (two blank lines too);
    - comment lines kept: a line comment, a block comment with a blank line inside, a line comment holding `/-`; LF and CRLF;
    - B's layout kept.
  - R1-1: the frozen twin gives the same items (except the Result) and the same board.
- **Against the pre-fix sources:** "Tests  7 failed | 2 passed | 157 skipped (166)". The 2 that pass guard the fix: one stops the new rule from refusing too much, the other pins the frozen twin's end state.
- None deleted, skipped or moved.

## Mutation checks
All 13 were restored byte for byte (filecmp and `cmp`). The full table is at /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/f2c1r2/mutation-table.txt.

| Id | Where | What was broken | Tests failed |
|---|---|---|---|
| M1 | sessionRules.ts:1332 | card content ignored | 2 |
| M2 | sessionRules.ts:1298 | only a card's `.holds` excluded from proof material | 1 |
| M3 | sessionRules.ts:1305 | not-frozen message never used | 1 |
| M3b | sessionRules.ts:1305 | not-frozen message always used | 1 |
| M4 | sessionRules.ts:1331 | a card's `.holds` counted as card content too | none (equivalent) |
| M5 | build.ts:370 | no re-parse when only an overridden `.holds` is present | 2 |
| M6 | build.ts:372 | twin text keeps the overridden `.holds` | 1 |
| M7 | build.ts:297 | twin indices not mapped back | 1 (existing "hidden lemma above a block" test) |
| M8 | build.ts:391 | fail-safe keeps the overridden `.holds` | 1 |
| M9 | build.ts:563 | composed only when something was taken out | 2 |
| M10 | build.ts:567 | blank lines kept | 2 |
| M11 | build.ts:498 | blank line inside a block comment removed | 1 |
| M12 | build.ts:459 | `--` no longer skipped by the comment scanner | 1 |

M4 is equivalent because a card's `.holds` mentions only its own statement, or is a session proof, which is judged before this check.

## Verification
Every command ran under `capped.sh`, one at a time, with TMPDIR and TELELEAN_TEST_TMP in my scratch dir. Vitest ran with one worker, `--no-cache --fsModuleCachePath=<scratch>/fsmc`.

- **tsc --noEmit**, rc=0 with no output for all five: core tsconfig.test.json, runner tsconfig.test.json, webview tsconfig.json and tsconfig.node.json, extension tsconfig.json.
- **vitest:**

| Package | Test files | Tests |
|---|---|---|
| core | 75 passed (75) | 1072 passed (1072) (was 1063) |
| webview | 19 passed (19) | 314 passed (314) |
| extension | 22 passed (22) | 204 passed (204) |

- **Runner:** no runner file changed, and no runner source reaches the changed code. `judgeState` and the mask are unused in the runner (grep), and the `build.ts` changes run only when `ProjectInput.mask` is set. So no runner test file is touched. As a smoke run, `env -u UPDATE_SEMANTIC_RECORDINGS capped.sh 3000 … timeout 900 vitest run … test/gate/pure.test.ts` gave "Test Files  1 passed (1)", "Tests  14 passed (14)".
- **Snapshots:**
  - `before.diff`: 4436840 bytes, 356 files;
  - `after.diff`: 4471408 bytes, 356 files, taken last;
  - only my 6 files' patches differ between them.

## Decisions for the orchestrator to log
Each is also in the plan's §8 as "fixer 2c1 r2 decided".

1. **R1-1: a card's statement is judged as a statement whatever phase wrote it,** and a card-bound name is never proof material. An unfrozen not-proved finish whose statement uses what the step wrote is refused until the step freezes.
   - *Alternative (a):* refuse every unfrozen not-proved finish that keeps any new declaration. Rejected because a freeze forced at the end would turn a failed proof attempt's helper definitions into statement content.
   - *Alternative (b):* amend D2-43 so an unfrozen step end records as `statements` whatever a card statement reaches. Rejected because it changes 2d's ledger rule and both core mirrors, and still misses a card formalised after the freeze.
   - Accepted residual (§4.7): after an unfrozen not-proved finish, a definition or vocabulary item that no card statement uses stays hidden, where a frozen step would list it.
2. **R1-2: the twin text leaves out every overridden `.holds`,** and is re-read in every file that holds one. *Alternative:* put B's `.holds` back in B's place in the twin, using planItemRevert's placing.
3. **R1-3: a card the session formalised drops every blank line between its statement and its `.holds` under the mask.** *Alternative:* keep the blank lines and the r1 residual.
4. **Found while testing, accepted as a §4.7 residual:**
   - **What happens:** a comment the step wrote with its statements, directly above a card's `.holds`, goes with a lemma the proof phase later writes between them. This follows computeItems' rule of attaching a comment to the new declaration below it.
   - **The effect:** the comment is hidden with the Result in one outcome and shown with the card in the other.
   - **Why the gate misses it:** the frozen-item rule covers only items that existed when the step started.
   - **Alternative:** a step rule that a comment attached to statement content at the freeze keeps that attachment, which would need the freeze commit's texts in `judgeState`.

## Effects outside the repo and my scratch dir
- **None from me.** No process of mine is left running, and `capped.sh`'s scopes are gone. Lean and VS Code processes from the user's other work, and the workflow's own `waitlabel`/`ramwatch` scripts, are still running; I did not touch them.
- **Inside the repo:** Vite wrote and deleted its bundled config in `node_modules/.vite-temp` (root, core, runner, webview). All are empty; only their directory times changed.
- **Untouched:**
  - `node_modules/.vitest-cache` (no newer file);
  - `~/.npm/_logs` (latest Nov 18);
  - `.git/index` (Nov 17; HEAD `187673d`);
  - `packages/extension/dist` and `out`;
  - `/tmp` (no `telelean-*`).
- I copied the reviewer's probes into my scratch dir and ran them there. Their dir was not written.
