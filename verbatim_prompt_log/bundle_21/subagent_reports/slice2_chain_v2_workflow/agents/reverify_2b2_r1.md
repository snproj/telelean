# reverify:2b2:r1

Agent `a143d6d4fc759cfe5` of workflow `wf_ae5f1188-533`. Verbatim output (JSON alongside).

- **summary:** Re-verification of fixer 2b2 r1. All 15 findings of the round are resolved.
- For every code fix I traced the code and re-ran the key mutation in a scratch copy of packages/core; each new test fails without its fix.
- The earlier reviewers' bug probes A1, A2, B1, B3 and D1 now fail the assertions they made about the old bugs, so those bugs are gone.
- C1 now leaves no TL023 (its remaining unowned follows_from line comes from the probe dropping P1's mark-removed entry, which the plan now hands to 2f). A3 is refused as intended.

Typecheck and unit tests (my own runs, capped.sh, one at a time):
- tsc is clean in core, runner, webview (both configs) and extension.
- core: "Test Files 72 passed (72) / Tests 991 passed (991)"
- webview: "Test Files 19 passed (19) / Tests 314 passed (314)"
- extension: "Test Files 22 passed (22) / Tests 203 passed (203)"

No runner code uses any changed function, so no runner test applies.

Two new problems in the fixer's changes:
- **R1-1 (major).** The new frozen-items rule also compares unwritten premise drafts. A later step that proposes a premise again under the same key with new wording is a newer proposal by design (spec S13, §3.5, fixer 2a's D2-17 decision). It is now refused at check, gate-proved and gate-other, with a message about comments that Claude cannot act on.
- **R1-2 (minor, fail closed).** Two declarations going back to B's place next to each other share an anchor, and the second is refused (`unsafe`). This blocks a cascade take-out of two chained Results whose pending `.holds` lines were adjacent in B.

Both fixes were validated in the scratch copy: the related core suites stay green, and the new checks fail on the current code.

Effects outside my scratch dir:
- The existing repo .vite-temp folders (root, core, webview) got new mtimes. They are empty: vitest wrote temporary config files there and deleted them.
- The .git directory's mtime changed from a read-only `git status`. The index is unchanged, and the porcelain count stayed at 321.
- Nothing was written in packages, docs or test-fixtures, nothing in /tmp, and no process is left running.

All probes, mutation harnesses, logs and the scratch copy are under /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/rv2b2r1.
- **resolved:**
  - [1]
    - **id:** S-V2B2-S1
    - **how:** Fixed in the revert (the finding's option a). planItemRevert removes a moved declaration that B has and puts B's text back in B's place (`baseDeclPlace`). verify() refuses a result that is not in B's place or in which anything else moved. Checks:
- the new revert tests cover B1, B3, the moved proof with its lemma and comments, an unchanged move, and the before/after sides;
- my mutation that restores the old `unsafe` refusal fails 2 of them;
- the old probes B1 and B3 no longer throw;
- my probes R3 (CRLF) and R4 (pending axiom proved at the end with a lemma) give B byte for byte;
- moving T.holds up, or into a new module, is refused at the step by the existing rules (R1, R2), so neither reaches a revert.
  - [2]
    - **id:** C-V2B2-C1
    - **how:** The same fix as S-V2B2-S1. Taking out a Result whose T.holds moved now restores B: verified by the tests, my mutation and probes R3 and R4.
  - [3]
    - **id:** A-V2B2-ADV-2
    - **how:** Resolved by the finding's alternative fix (handled in the revert), with a sound rationale in §8. Lean needs a source's .holds declared before a proof that uses it, so a pending target above a later source can only be proved below that source. Probes B1 and B3 are now tests; the old probes fail their old-bug assertions. (A narrower residual remains; see R1-2.)
  - [4]
    - **id:** S-V2B2-S2
    - **how:** Handed off as the finding's own fix offered: §1.1's 2h entry makes `GhostAdoptionRequest.holdAs` required once `adoptGhost` is retired, with tests, and says 2f passes the record's `accepted.holdAs`.
  - [5]
    - **id:** S-V2B2-S3
    - **how:** Updated: user-guide.md lines 103 and 237, boardSession.ts's startRun doc comment and protocol.ts's StartRunMessage doc comment now describe the subject-wide cycle check and its text.
  - [6]
    - **id:** S-V2B2-S4
    - **how:** `subjectCycle` counts a proposition listing itself in `premises:` as the cycle [x, x], first in board order. An old axiom's self-premise does not count, consistent with arrowsOf/A19. The new formalize test fails when I disable the selfArrow predicate.
  - [7]
    - **id:** C-V2B2-C2
    - **how:** The mark comes back only when `kept.length === 0`. verify() refuses an edited card whose lines hold both the mark and arrows (TL023). My mutation that drops the `kept.length === 0` condition fails the two-premise test. In the old probe C1, the target block now has `premises:` without `follows_from: nothing` and no TL023. The ledger move of mark-removed to P2 is handed to 2f in §3.8.
  - [8]
    - **id:** C-V2B2-C3
    - **how:** Same doc updates as S-V2B2-S3 (user guide l.103 and l.237).
  - [9]
    - **id:** C-V2B2-C4
    - **how:** The test 'at the stage and the end nothing changes' now also asserts `judge(..., { purpose: 'final' }).global` is [].
  - [10]
    - **id:** A-V2B2-ADV-1
    - **how:** `restsOnPremise`: the completion's T.holds goes with the premise only while its `uses` closure (or, without complete facts, its text) reaches a declaration the premise provides. My mutation back to the unconditional take-out fails the new test. The old probe D1 now keeps the reworked proof.
  - [11]
    - **id:** A-V2B2-ADV-3
    - **how:** Same fix as C-V2B2-C2: the mark is restored only when no arrow stays, and verify() refuses mark plus arrows read from the block lines. Tested, and the mutation is caught.
  - [12]
    - **id:** A-V2B2-ADV-4
    - **how:** The new frozen-items rule (judge.ts:489-490, 515-532) refuses the comment re-attachments: A1, A2, A3 and the closed-proof Result are now step findings; the old probes A1, A2 and A3 now see `existing-changed/session`; disabling the rule fails 4 judge tests. Its generality introduces a regression for re-proposed premise drafts (see R1-1).
  - [13]
    - **id:** A-V2B2-ADV-5
    - **how:** New backstop test: a rejected Result whose T.holds is B's, beside accepted items, passes. The reviewer's mutation (`owned = drafts`) now fails it (re-run by me).
  - [14]
    - **id:** A-V2B2-ADV-6
    - **how:** New backstop test: a question source whose arrow is in neither B nor F gives a `b2` refusal. The reviewer's mutation (`inference.question.sources`) now fails it (re-run by me).
  - [15]
    - **id:** A-V2B2-ADV-7
    - **how:** `probeFailure(facts, { detail: false })`:
- the stage's `facts` problem never carries Lean's error;
- `classesBeforeReveal` (the map the reducer uses while results are hidden) carries the sentence without it, while `classes` (shown) and the backstop keep it;
- the one-bit 'did it fail' channel is added to §4.7's accepted residuals.
My mutations restoring the detail in either place fail probe.test.ts.
- **findings:**
  - [1]
    - **id:** R1-1
    - **severity:** major
    - **where:** packages/core/src/review/judge.ts:515-532 (frozenItemFindings; the skip at :520), called at :489-490; docs/slice2-plan.md:1927 (§4.9's new fixer 2b2 r1 bullet)
    - **problem:** The frozen-items rule compares every item of S₀, unwritten premise drafts included (`premise:<T>:<leanName>`, whose content key is the draft's sentence, statement and target, §4.3).

A later step that proposes a premise again under the same item key with different wording is a newer proposal by design:
- spec S13: "A reworded repeat passes both checks. That is not a safety issue";
- §3.5: "a premise a later step proposed again";
- fixer 2a's D2-17 decision: "a premise the new step proposed again stays in review … computeItems reads the newest";
- the status table: "withdrawn → in review: A later proposal of the same key".

The two item computations differ: `atStart()` leaves out the active step's drafts, while computeItems on the judged state reads the newest draft. So the item's content key differs, and the step is now refused at check, gate-proved and gate-other. The finding is `existing-changed`/`session`, and its message, `frozenItemChanged`, talks about comments ("a comment next to it now goes with another declaration … keep comments where they were"). Claude cannot act on it, since it edited nothing in ws/. Each refusal counts a gate attempt.

Typical triggers:
- after the person rejects a premise, the Submit re-ask proposes a refined version under the same leanName;
- a not-proved finish (gate-other) proposes the missing premise again.

Before this round these steps passed, and reconcile versioned the item ("updated").
    - **fix:** In frozenItemFindings, skip S₀ drafts made from an unwritten premise draft: their content is outside ws/, and a same-key draft from the step is a newer proposal that reconcile versions at the queue's end. For example, after line 520:
`if (d.kind === 'add-premise' && d.provides.cards.length === 0 && d.provides.decls.length === 0 && d.provides.arrows.length === 0) continue;`

Add judge tests:
- a reworded repeat of a rejected premise at a Submit step (gate-proved) and at gate-other gives no finding;
- the exact repeat stays `rejected-repeat/premise` only.

Amend §4.9's new bullet and the §8 entry to say that unwritten premise drafts are excluded.
    - **evidence:** Probes in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/rv2b2r1/vt/tests/frozen.test.ts:
- P1a: Submit step s2, openItems [proof:T], the record rejected, premises [old s0 draft, reworded s2 draft of `cynder_is_evil`]. At check and gate-proved, stepFindings are [existing-changed/session], message "premise:cynder-not-good:cynder_is_evil was proposed earlier in this session, and the perso…", from frozenItemChanged.
- P1c: an in-review premise at a re-ask with openItems [] gives the same.
- P1e: gate-other on FORMALISED gives [] without the re-proposal and ["existing-changed/session"] with it.
- P1b: an exact repeat gives only rejected-repeat/premise.
- P1d (control) gives [].

I validated the fix in a scratch copy of packages/core. The check (mut/packages/core/test/rv_p1.test.ts) fails on the current code, and passes with the one-line skip. With the skip, judge, probe, revert and backstop tests plus the check give "Test Files 5 passed (5) / Tests 170 passed (170)".
  - [2]
    - **id:** R1-2
    - **severity:** minor
    - **where:** packages/core/src/review/revert.ts:242-260 (step 2's loop; `session.mapOffset(place.path, place.offset)` at :247; the comment at :243 says "so two that go back next to each other keep it")
    - **problem:** Two declarations can go back to B's place with the same nearest kept unit before them: they are adjacent in B, with only whitespace between. The first insertion (side 'after') replaces the whitespace that starts at that unit's end. For the second, `mapOffset` of the same anchor then falls inside that edit, returns undefined, and the revert refuses `unsafe`: "… cannot be put back where it was when the session started: edit it by hand.".

This is reachable. Two pending claims, or the person's proofs, are written next to each other in B, and each is proved below later content by its own step of one queue, which openProof allows. The second target's proof uses the first's `.holds` (RV-5), so a Reject of the first Result, a DO-0 cascade, or Submit's take-out takes both out at once. That take-out is then blocked, the failure the original S1/C1/ADV-2 findings described, in a narrower layout. It fails closed: nothing is written.
    - **fix:** In step 2, keep per anchor (path, side, offset) the end of the last inserted declaration's own text (`start + newText.trimEnd().length`). Start a later place with the same 'after' anchor there, instead of mapping the anchor. Its B lead then replaces the previous one's trailing whitespace, which is the same stretch of B's whitespace. Alternatively, insert a run of adjacent `back` declarations as one slice of B.

Add a revert test: two adjacent pending axioms, each proved at the end by its own step, both Results taken out at once, which must give B byte for byte.
    - **evidence:** /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/rv2b2r1/vt/tests/adjacent.test.ts:
- B = withChain(BASE) + `axiom t1.holds : t1\naxiom t2.holds : t2` + three abbrevs.
- s1 and s2 each replace their axiom by a theorem appended at the end.
- compareTexts: t1.holds moved in s1, t2.holds moved in s2. Both steps' gate-proved stepFindings are [].
- The stage items are proof:t1 and proof:t2, with 0 problems.
- Taking out proof:t1 and proof:t2 together gives "REFUSED unsafe: Spyro.t2.holds cannot be put back where it was when the session started: edit it by hand."

I patched step 2 the suggested way in a scratch copy (scratchpad/rv2b2r1/vt/patch_adj.py):
- the both-out revert gives B exactly;
- revert and backstop suites stay green ("Tests 44 passed (44)");
- unpatched, the same check fails.

The scratch copy was restored identical to the repo.
- **checks_run:**
  - capped.sh 1800, packages/core: tsc --noEmit -p tsconfig.test.json -> rc=0, no output
  - capped.sh 1800, packages/runner: tsc --noEmit -p tsconfig.test.json -> rc=0, no output
  - capped.sh 1800, packages/webview: tsc --noEmit -p tsconfig.json -> rc=0, no output
  - capped.sh 1800, packages/webview: tsc --noEmit -p tsconfig.node.json -> rc=0, no output
  - capped.sh 1800, packages/extension: tsc --noEmit -p tsconfig.json -> rc=0, no output
  - capped.sh 1800, packages/core: vitest run --maxWorkers=1 --no-cache --fsModuleCachePath=<scratch>/fsmc (TMPDIR and TELELEAN_TEST_TMP in scratch) -> "Test Files  72 passed (72)" / "Tests  991 passed (991)"
  - capped.sh 1800, packages/webview: same flags -> "Test Files  19 passed (19)" / "Tests  314 passed (314)"
  - capped.sh 1800, packages/extension: same flags (--no-cache) -> "Test Files  22 passed (22)" / "Tests  203 passed (203)"
  - Runner: no runner source or test uses a changed function (grep for judgeState, planItemRevert, probeFailure, subjectCycle, formalizeCycleProblem, baseDeclPlace, formalizeStartProblem; the runner only mentions them in comments), so no runner test file applies
  - Mutations in a scratch copy of packages/core, each restored and checked byte for byte (filecmp, `restored True`):
- the old `unsafe` refusal for a moved declaration: 2 revert tests fail;
- the mark without `kept.length === 0`: 1 fails;
- the completion taken out unconditionally: 1 fails;
- the frozen rule off: 4 judge tests fail;
- the probe detail kept in classesBeforeReveal: 2 probe tests fail;
- the detail kept in the stage problem: 2 fail;
- selfArrow off: 1 formalize test fails;
- backstop `owned = drafts`: 1 fails;
- backstop `inference.question.sources`: 1 fails
  - The earlier reviewers' probes, re-run on the fixed code:
- A1, A2, B1, B3 and D1 now fail their old-bug assertions (the bugs are gone);
- C1's target block has no `follows_from` beside `premises:`, and no TL023;
- A3 is `existing-changed/session`
  - Probes R1-R4 (scratchpad/rv2b2r1/vt/tests/revert.test.ts):
- T.holds moved up: the step limits refuse other_fact's move (pre-existing);
- T.holds in a new module: refused at the step (stray-command, build);
- CRLF move: B exactly;
- pending axiom proved at the end with a lemma: gate [], and the revert gives B exactly
  - Probes P1a-P1e (frozen rule versus a same-key premise re-proposal) and ADJ1 (two adjacent moved .holds taken out together): see R1-1 and R1-2. Both fixes were validated in the scratch copy.
  - Side effects:
- git status --porcelain count unchanged (321);
- no file newer than my start in packages, docs or test-fixtures (outside node_modules);
- the existing .vite-temp folders (root, core, webview) are empty, with only their mtimes changed;
- the .git directory's mtime changed from read-only git status, and .git/index is unchanged;
- no /tmp entry is newer than my start, and no /tmp/telelean-* exists;
- no process of mine is left running.
