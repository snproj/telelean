# reverify:2c1:r1

Agent `a2da21a06782e2c31` of workflow `wf_ae5f1188-533`. Verbatim output (JSON alongside).

- **summary:** I re-verified fixer 2c1 round 1. All 18 findings are resolved as stated, but I found 3 new problems: 2 major (R1-1, R1-2) and 1 minor (R1-3). All three let the hidden board tell the outcomes apart before the meaning items are decided.

What I checked, all read-only in the repo:
- **Code:** I traced every change in review/mask.ts, project/build.ts, project/types.ts, extension boardSession.ts and the plan.
- **New tests against the old code:** I ran the new test/review/mask.test.ts against the pre-fix copies of the three source files in a scratch copy of core. Result: "Tests  16 failed | 25 passed (41)". Every new or rewritten test fails for the finding it targets.
- **Same copy with the fixed sources:** "Tests  41 passed (41)".
- **Three mutations of my own** (keyword override ignored, `mergeSpans` merging nothing, B's message anchor put back on the working copy's `.holds`). Each fails exactly the matching test, and each file was restored and checked with `cmp`.
- **Probes:** in my scratch directory.
- **Typecheck:** tsc rc=0 with no output for core and runner (tsconfig.test.json), webview (tsconfig.json and tsconfig.node.json) and extension (tsconfig.json).
- **Unit tests:**
  - core "Test Files  75 passed (75)", "Tests  1063 passed (1063)"
  - webview "Test Files  19 passed (19)", "Tests  314 passed (314)"
  - extension "Test Files  22 passed (22)", "Tests  204 passed (204)"

New problems:
- **R1-1 (major):** A-ADV-1's no-freeze outcome is still distinguishable through the vocabulary written with the statements. The ledger rule and computeItems hide that vocabulary too, so the fix belongs in 2d or the gate, not 2c1.
- **R1-2 (major):** a target's `.holds` that the step moved below a code-less card keeps a TL013 hint naming it on the hidden board. The gate accepts this state.
- **R1-3 (minor):** the residual the fixer accepted, blank lines around a hidden lemma inside a card new in the session, can be closed cheaply.

The empty-mask test's "byte for byte" claim is not true of `codeLoc` when a `.holds` comes before its statement. buildSessionView strips `codeLoc`, so nothing visible changes, and I file no finding for it.

Effects of my run:
- Vitest's config bundling created and deleted files in node_modules/.vite-temp (root, core, webview). The folders are empty again; only their mtimes changed.
- Running read-only `git status --porcelain` updated the `.git` directory's mtime (08:25). `.git/index` (Nov 17) and HEAD (187673d) are unchanged, and the git status hash is the same before and after.
- Everything else is under /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/rv2c1r1: a copy of core, and symlinks to the repo's node_modules/zod, node_modules/vitest and test-fixtures.
- No process of mine is left running.
- **checks_run:**
  - capped.sh 1800 tsc --noEmit -p tsconfig.test.json (packages/core): rc=0, no output
  - capped.sh 1800 tsc --noEmit -p tsconfig.test.json (packages/runner): rc=0, no output
  - capped.sh 1800 tsc --noEmit -p tsconfig.json (packages/webview): rc=0, no output
  - capped.sh 1800 tsc --noEmit -p tsconfig.node.json (packages/webview): rc=0, no output
  - capped.sh 1800 tsc --noEmit -p tsconfig.json (packages/extension): rc=0, no output
  - TMPDIR=<scratch>/tmp capped.sh 1800 vitest run --maxWorkers=1 --no-cache --fsModuleCachePath=<scratch>/fsmc (packages/core): Test Files  75 passed (75); Tests  1063 passed (1063)
  - same (packages/webview): Test Files  19 passed (19); Tests  314 passed (314)
  - same (packages/extension): Test Files  22 passed (22); Tests  204 passed (204)
  - New test/review/mask.test.ts against the pre-fix mask.ts/build.ts/types.ts (scratch copy of core at rv2c1r1/pre): Tests  16 failed | 25 passed (41). Every new or rewritten test fails for its finding, e.g. 'expected none to be pinned' (S1/A-ADV-2), 'no facts: expected theorem to be axiom' (S2), 'expected [ Spyro.pg_no_dark_past, …(1) ] to deeply equal []' (A-ADV-1), 'not to contain dark_cynder' (A-ADV-6)
  - The same copy with the fixed sources: Tests  41 passed (41)
  - Mutation spot checks in the scratch copy, each restored and checked with cmp: keyword override ignored -> 1 failed (S-V2C1-S2 test); mergeSpans merges nothing -> 1 failed (C3/C5 new-card test); B's .holds messages anchored at the working copy's .holds -> 1 failed (S-V2C1-S4 test)
  - Probe P1 (rv2c1r1/probe/nofreezevocab.test.ts): no-freeze vs frozen outcome with a new definition used by the formalised statement; the masked boards and computeItems drafts differ (R1-1)
  - Probe P2 (rv2c1r1/probe/layouts.test.ts): empty mask on more layouts (CRLF, CRLF proved, comment between, blank line between, .holds in another file, tab indent): code, refs and graph equal to B's build. With the .holds before its statement, only codeLoc differs (stripped by buildSessionView)
  - Probe P3 (same file): the fixer's twin cases with CRLF files (a hidden lemma with a comment inside another card's code; a hidden lemma below a pinned block): pass
  - Probe P4 (rv2c1r1/probe/movedholds.test.ts, movedholdsgate.test.ts): the target's proof moved below a code-less card after a blank line; the gate accepts it (stepFindings []); the masked TL013 names cynder_not_good.holds only in the proved outcome (R1-2)
  - Probe P5 (rv2c1r1/probe/newcard.test.ts): a spaced hidden lemma inside a card new in the session leaves a blank line in its masked code (R1-3)
  - git status --porcelain hash identical before and after; HEAD 187673d; .git/index mtime Nov 17; node_modules/.vite-temp folders empty; no /tmp/telelean-* left; no vitest or tsc process of mine left
- **resolved:**
  - [1]
    - **id:** S-V2C1-S1
    - **how:** Fixed. maskFiles re-parses the file without what is left out (twinBindings/withoutSpans) and takes each kept block's binding from that parse, so a pinned block stays pinned; on the fail-safe path only an adjacent binding becomes code-less. Covered by the new test (the target and another card; a lemma and an anonymous instance; no vocabulary item, no TL104, strip equal to the twin). It fails on the pre-fix code ('expected none to be pinned'), and my CRLF probe passes.
  - [2]
    - **id:** S-V2C1-S2
    - **how:** Fixed. codeOverride carries B's keyword, and maskFiles reads the overridden declaration with it, so holdsKind's fallback and the stale-file kindsAgree read B's kind. The test covers no facts, B without facts, module failed and file stale (pending, axiom, strip equal to the twin). It fails pre-fix, and my keyword mutation fails it.
  - [3]
    - **id:** S-V2C1-S3
    - **how:** Fixed for every card B has: codeLayout composes it in B's layout and never reads the working copy's gap. Cards new in the session drop their left-out declarations, the attached comment and enclosing lines (`lines`), and any moved target .holds. The test oracle is now the not-proved twin over five layouts, and it fails pre-fix. The blank lines left in a new card's code are a separate, avoidable residual (R1-3).
  - [4]
    - **id:** S-V2C1-S4
    - **how:** Fixed. B's messages for an overridden .holds are anchored at the start of the target's statement in the working copy. The moved-.holds order test fails pre-fix and with my anchor mutation.
  - [5]
    - **id:** S-V2C1-S5
    - **how:** Fixed. derivedIds no longer needs a current hidden write; it covers every card whose id was written over B's derived id while its pins stayed B's. The taken-out vs. arrow test fails pre-fix ('expected {} to deeply equal …'). Any visible write that could also write the id back is the same in both outcomes, so the twins stay consistent.
  - [6]
    - **id:** S-V2C1-S6
    - **how:** Fixed. maskedModel takes optional endorsements and lakefile and passes them to the build (§2.9 note added). The test fails pre-fix ('[definitional-choice] … to deeply equal [[], []]').
  - [7]
    - **id:** C-V2C1-C1
    - **how:** Same fix as S-V2C1-S1 (re-parse; fail-safe keeps pinned).
  - [8]
    - **id:** C-V2C1-C2
    - **how:** Fixed for left-out declarations. TL013/TL014 now come from the re-parse (B's hint comes back, also with a namespace around the lemma), and the old TL013 exclusion in the test is gone. The test fails pre-fix. A related, uncovered case (a moved target .holds, which is not left out) is R1-2.
  - [9]
    - **id:** C-V2C1-C3
    - **how:** Same fix as S-V2C1-S3: codeLayout for cards B has; `lines` plus merged deletions for new cards. The comment-above/below and namespace layouts are tested against the twin.
  - [10]
    - **id:** C-V2C1-C4
    - **how:** Same fix as S-V2C1-S6.
  - [11]
    - **id:** C-V2C1-C5
    - **how:** Fixed. mergeSpans deletes a mutual and its inner declarations, and whitespace-apart spans, as one stretch. For cards B has, codeLayout never reads the gap. The new-card mutual-before-note case is tested, and my no-merge mutation fails it.
  - [12]
    - **id:** C-V2C1-C6
    - **how:** Fixed. The default became ten explicit case labels, matching SESSION_MESSAGE_TYPES exactly. The extension tsc is clean, and the fixer's compile check (one label removed gives TS2366) is in its table.
  - [13]
    - **id:** A-ADV-1
    - **how:** Fixed as stated. maskedNames leaves a BaseMask.drop name out only when no card of the working copy binds it, and a written premise card's names still go. Test (source and code-less target, no freeze) fails pre-fix. A card-bound proof-phase name can otherwise only be a target's .holds, which `holds` covers (new-axiom after the freeze and holds-kind block the rest). The same no-freeze outcome still leaks through its vocabulary: R1-1.
  - [14]
    - **id:** A-ADV-2
    - **how:** Same fix as S-V2C1-S1.
  - [15]
    - **id:** A-ADV-3
    - **how:** Same fix as C-V2C1-C2. The gap lemma, the anonymous instance and the mutual below a code-less card are all tested, and B's hint comes back.
  - [16]
    - **id:** A-ADV-4
    - **how:** Same fix as S-V2C1-S3. The commented and spaced variants in another card's code now give B's code and refs.
  - [17]
    - **id:** A-ADV-5
    - **how:** Same fix as S-V2C1-S6.
  - [18]
    - **id:** A-ADV-6
    - **how:** Fixed. maskFacts drops `detail` from the envelope, build, check and probe; probeFailure of the masked facts gives the sentence without the detail. The test fails pre-fix.
- **findings:**
  - [1]
    - **id:** R1-1
    - **severity:** major
    - **where:** packages/core/src/review/mask.ts:94-101 (maskedNames, the A-ADV-1 exception covers card-bound names only); docs/slice2-plan.md:1509 (§3.4: `statements` only if in the step's freeze commit, D2-43); computeItems' decl ownership (packages/core/src/review/items.ts); gate-other accepts a not-proved finish without freeze_statements
    - **problem:** A-ADV-1's fix keeps a formalised card's own statement and `.holds` when the step ended not proved without freeze_statements. But that outcome still records the vocabulary written with those statements as `proof`.

The mask drops it, since no card binds it, and computeItems folds it into the hidden Result. In the proved outcome the freeze is mandatory, so the same definition is `statements`: its own visible `decl:` item and a vocabulary entry.

While the results are hidden, the no-freeze outcome therefore still differs:
- the definition is missing from the masked vocabulary;
- the formalised card's `uses` lack it and what it reaches;
- the card loses its `definitional-choice` flag ("needs your endorsement") although its shown statement uses the definition.

The item list differs the same way, independently of the mask. So RV-6 still breaks on this path, and 2c1 alone cannot close it.
    - **fix:** For the orchestrator (2d/2b, not 2c1's files): make both outcomes classify statement content alike. Either:
- (a) make gate-other refuse a finish that is not proved without a successful freeze_statements whenever the step formalised a card or added statement content (the A12 turn already asks for the freeze); or
- (b) amend §3.4/D2-43 so that a step ending with no freeze commit records as `statements` every new declaration that a card's statement in the working copy reaches through definitions (its statement closure), and `proof` the rest.

Then add the twin test: a fuzzy source formalised with a new definition its statement uses, proved and frozen vs. not proved without a freeze. computeItems' drafts and strip(masked graph) must be equal. The mask's A-ADV-1 exception can stay.
    - **evidence:** Probe /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/rv2c1r1/probe/nofreezevocab.test.ts. Setup: STATEMENTS plus `def DarkChar (c : Character) : Prop := HasDarkPast c` in Vocabulary.lean, and pg_no_dark_past written with `DarkChar c`. Ledger: all three names `proof` (no freeze) vs all `statements` (frozen, proved).

Results, frozen-and-proved first, then no-freeze:
- masked vocabulary: Spyro.DarkChar present vs absent;
- pg-no-dark-past flags: [no-rationale, definitional-choice] vs [no-rationale];
- pg-no-dark-past uses: [Game, Character, IsPG, DarkChar, GoodAddition, HasDarkPast] vs [Game, Character, IsPG, GoodAddition];
- computeItems drafts: [card:pg-no-dark-past, decl:Spyro.DarkChar, proof:cynder-not-good] vs [card:pg-no-dark-past, proof:cynder-not-good];
- strip(graph): not equal.
  - [2]
    - **id:** R1-2
    - **severity:** major
    - **where:** packages/core/src/project/build.ts:282-289 (twinBindings), 343 (re-parse only when something is left out), 357-376 (fail-safe path); the overridden `.holds` stays in the masked files at the working copy's position
    - **problem:** The re-parse removes only what the mask leaves out. A target's overridden `.holds` stays where the step wrote it (only its code becomes B's), and the re-parse does not run at all when nothing else in the file is left out.

Under openProof a step may replace the pending axiom with a proof written elsewhere. If it writes the proof at the end of the file, after a blank line below a code-less card, the working copy's TL013 on that card, "This node is code-less, but `cynder_not_good.holds` follows after a blank line: remove the blank line to attach it.", reaches the masked board. The not-proved outcome, with the axiom still in place, has no hint.

While the results are hidden, a hint on another card thus shows that the target's `.holds` was rewritten and moved, and names it. By the same mechanism:
- a B hint naming the target's `.holds`, or a visible declaration below the step's position, changes in one outcome only;
- the fail-safe path keeps such hints too.
    - **fix:** In maskFiles:
- build the twin text without every overridden `.holds` span as well (the not-proved outcome has that `.holds` beside its statement, where no block reads it);
- run the re-parse whenever the file has a left-out span or an overridden `.holds`;
- compare the twin's declarations with the kept ones minus the overridden, and map `adjacentDecl`/`gapDecl` back to the masked indices (the overridden `.holds` stays a masked declaration);
- on the fail-safe path, drop TL013/TL014 of a block whose gap or adjacent declaration is an overridden `.holds`.

Add a test: the target's pending axiom replaced by a proof at the end of the file, after a blank line below a code-less card, gives strip(graph) equal to the not-proved twin's, and no hint names `cynder_not_good.holds`.
    - **evidence:** Probes /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/rv2c1r1/probe/movedholds.test.ts and movedholdsgate.test.ts.

Setup: base = B1 with a code-less AXIOM card sky-blue appended. The proved outcome is pinned(normative(base)) with `axiom cynder_not_good.holds : cynder_not_good` removed and HONEST_PROOF appended after a blank line below sky-blue.

Results:
- judge(…, gate-proved, with the freeze): stepFindings [], ok true;
- masked proved hints: [[TL013, sky-blue, "This node is code-less, but `cynder_not_good.holds` follows after a blank line: remove the blank line to attach it."]];
- masked not-proved hints: [];
- strip(graph): not equal.
  - [3]
    - **id:** R1-3
    - **severity:** minor
    - **where:** packages/core/src/project/build.ts:464-476 (maskedCode, path for a card with no codeLayout); docs/slice2-plan.md:1910 (the residual accepted in §4.7)
    - **problem:** The residual the fixer accepted, "the working copy's text cannot tell which blank lines came with the lemma", is a real difference between the two outcomes, and it can be avoided.

Take a card formalised tight in the statements phase (no blank line between its statement and `.holds`). A proof-phase lemma inserted between them with blank lines around it leaves a blank line in the card's masked code in the proved outcome only. The cause is deletionEdit, which keeps one blank line.
    - **fix:** Under the mask, compose every card without codeOverride/codeLayout whose statement and `.holds` would be one stretch once what is left out (and a moved target `.holds`) is taken away, whether or not anything was taken away. Compose it with the blank lines of that gap removed, keeping comment lines, and let `compose` place the refs by the composed text. Both outcomes then give the same code, and §4.7's residual can be dropped.

Add twin tests for a new card: a tight and a spaced lemma, each with a tight and a spaced statement.
    - **evidence:** Probe /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/rv2c1r1/probe/newcard.test.ts.

pg-no-dark-past's masked code:
- not-proved twin: '…¬ GoodAddition c g\naxiom pg_no_dark_past.holds : pg_no_dark_past';
- spaced lemma (`\ntheorem pg_helper : True := trivial\n\n`): '…¬ GoodAddition c g\n\naxiom pg_no_dark_past.holds : pg_no_dark_past';
- tight lemma: the same as the twin.
