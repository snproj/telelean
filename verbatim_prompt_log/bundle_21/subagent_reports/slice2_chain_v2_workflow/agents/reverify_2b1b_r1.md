# reverify:2b1b:r1

Agent `a95ed944016b203c6` of workflow `wf_ae5f1188-533`. Verbatim output (JSON alongside).

- **summary:** I re-verified fix round 1 of 2b1b. 19 of the 20 findings are resolved. I traced each one in the code and re-ran all 10 of the reviewers' probe files against the current code (10 files, 22 tests). I also ran 3 mutations of my own in a scratch copy of core: removing the `unseen` loop, removing the D2-59 drawn filter, and removing the catch-all each makes at least one test fail.

C-V2B1B-C2 is still open (major). The fix covers material that earlier steps wrote, but not T.holds itself: in a re-ask, `other-result` judges the unchanged T.holds against the new question. Probes R4, R5 and R7 show the step deadlocks, and the not-proved finish can never pass. A one-line change in a scratch copy fixes it with judge.test.ts still green.

There are 4 new problems:
- R1-1 (minor): rewording only the comment of an opened declaration is refused as a stray comment, with a misleading message.
- R1-2 (minor): the drawn test in `extraSources` is an optional parameter, and the §2.9/types.ts `extra` contract is stale, so a later caller could reopen A-ADV-1.
- R1-3 (nit): two board sentences misdescribe what Claude did (`closed-proof` for a removal or move; `session` for content no item covers).
- R1-4 (nit): A-ADV-5 now gives two findings for a declined arrow re-drawn by hand.

The fixer changed only the 13 listed files; the before/after snapshots differ in exactly those.

Verification, all run by me:
- tsc --noEmit exits 0 with no output for core, runner (tsconfig.test.json), webview (tsconfig.json and tsconfig.node.json) and extension.
- core: "Test Files  67 passed (67)", "Tests  887 passed (887)".
- webview: "Test Files  19 passed (19)", "Tests  313 passed (313)".
- extension (--no-cache): "Test Files  22 passed (22)", "Tests  203 passed (203)".
- runner manager.gate: "Test Files  1 passed (1)", "Tests  8 passed (8)". runner manager.accept: "Tests  10 passed (10)".

Effects outside my scratch dir:
- Vite's config loader wrote and then deleted its bundled config in node_modules/.vite-temp and in the core, webview and runner node_modules/.vite-temp folders. All are empty again; only their mtimes changed.
- Read-only `git status` changed the .git directory's mtime (no ref or index change; HEAD is still 187673d and the status hash is unchanged).
- Unchanged: extension out/ and dist, node_modules/.vitest-cache (1654 entries), and /tmp (29 entries).
- No repo file was edited, and none of my processes remain.

Probes are in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/rv2b1br1/probe and logs in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/rv2b1br1/logs.
- **resolved:**
  - [1]
    - **id:** S-F1
    - **how:** In holdsKindFindings (sessionRules.ts:853-874), a theorem .holds on any card other than scope.target is now refused at a step; at a stage or the end, on any card that is not a session target. The token is `axiom-to-theorem` when the reference had an axiom, else `not-target`. At a step, an unopened .holds that S₀ has is left to the step limits, so each change gets one finding. The tests are in judge.test.ts's 'only the step’s target is proved' block; the fixer's mutation B4a fails 6 tests. Re-run, reviewer probe A now gives holds-kind/not-target at gate-proved and at the stage.
  - [2]
    - **id:** S-F2
    - **how:** stepLimitFindings (sessionRules.ts:327-336) now exempts a removed S₀ line that came in (B→S₀) either attached to an opened declaration or enclosing only opened declarations. The enclosed names come from the new `AddedTextUnit.encloses` (items.ts:328-332). openNames now includes T's Result under openProof, except at gate-other (judge.ts:330-335). Tests: an opened lemma removed with its comment and its namespace pair passes; the person's comment and a pair around content not opened are still refused. My probe mv.probe.test.ts: moving an opened lemma with its comment, or removing only the comment, passes. Rewording the comment alone is still refused, but by another rule (see R1-1).
  - [3]
    - **id:** S-F3
    - **how:** judge.ts:233-235 throws ActionError('invalid') for check, freeze, gate-proved or gate-other without scope or S₀. A test covers all four purposes, and a stage without a scope still works; mutation SF3 fails it. No caller outside core exists yet.
  - [4]
    - **id:** S-F4
    - **how:** New tokens `closed-proof` (sessionRules.ts:271, :318) and `text` (:343-345, with the line in `names`), each with a board sentence (describe.ts:194-195). Tests are in describeSession.test.ts, and judge.test.ts was updated. One wording nit remains (see R1-3).
  - [5]
    - **id:** S-F5
    - **how:** mergedBackBy now flags `mixed` when the declining decide action also moved another item out of declined-out (reducer.ts:451). Cascades never change a declined-out item, so only real un-rejects count. backToReview then refuses with REVIEW_TEXTS.unrejectMixed (reducer.ts:564). A reducer test checks the refusal, that Undo restores both, and that a plain Reject is still un-rejected with its merge (mutation SF5a fails it). The §4.6 property sentence and decision 13 are narrowed.
  - [6]
    - **id:** S-F6
    - **how:** Docs only. §1.1's 2b3b entry and the amended §8 G0 decision now say that the engine merges G0's findings into `global` at every purpose, the stage and the final check included.
  - [7]
    - **id:** S-F7
    - **how:** For the step's own arrows, arrowFindings now skips B.3's `declined` (sessionRules.ts:756) and leaves it to rejected-repeat/arrow (same condition). rejectedRepeatFindings skips the `rejected` finding for premise drafts that `premise` already reports (judge.ts:111-116). Tests were updated and added (mutations SF7a/SF7b). A new duplicate arising from A-ADV-5 is reported separately as R1-4.
  - [8]
    - **id:** S-F8
    - **how:** Docs only: review/types.ts:414-418 and §2.9 now say that judgeState does not emit `scc`, and that planSubmit, the view and the backstop compute it.
  - [9]
    - **id:** S-F9
    - **how:** The D2-59 test now has a ledger `arrow` entry, a declined add-arrow record and rejectedArrows. The source stays in the question while the arrow is out of `premises:`. It asserts extra [], `unselected`, global [], and a drawn counterpart that passes. In a scratch copy I removed questionSources' drawn filter: this test and the E(T) test fail (2 failed).
  - [10]
    - **id:** C-V2B1B-C1
    - **how:** otherResultFindings (sessionRules.ts:1275-1295) treats the declarations of a ledger-premise card that have no `created` entry as that target's written premise draft. It may mention its own target's proof material, never another Result's. Re-run, reviewer probes f7 and f7b give global [], ok true and stepFindings []. Tests include another target's premise card mentioning Spyro.Wicked, which is still refused (mutations C1a/C1b).
  - [11]
    - **id:** C-V2B1B-C3
    - **how:** Fixed by the same B.4 change as S-F1: an axiom → theorem change on any card that may not be proved here is `axiom-to-theorem`, and a fuzzy AXIOM fill written as a theorem is `not-target`. Re-run probes: b4/b4b give axiom-to-theorem at gate-other without a freeze and at the stage for B's axiom made a theorem; b4c gives not-target at check, freeze, gate-other and stage. A test covers the opened Formalize item without a freeze.
  - [12]
    - **id:** C-V2B1B-C4
    - **how:** targetFootprintFindings (sessionRules.ts:1082-1098) returns footprint/no-facts for a theorem T.holds that Lean reported nothing about, unless the build failed for its file. Re-run probe nofacts: check gives ["footprint/no-facts"], and at the stage T's inference passes=false. A test covers check, stage, `private` and a failed module (mutations C4a/C4b).
  - [13]
    - **id:** C-V2B1B-C5
    - **how:** sessionExampleWording (sessionRules.ts:237-239) is applied at judge.ts:349, so the session message suggests a named lemma and never #check. A test checks this.
  - [14]
    - **id:** A-ADV-1
    - **how:** extraSources now counts a ledger arrow only while `current` draws it (the running step's own entries before its normalise draws them). permittedFor passes current and activeStep. arrowProblems calls an arrow 'proposed' only for this step's own entries. Re-run probe E: gate-proved gives ['footprint','undeclared-premise/unselected'], at the stage T passes=false, and re-proposing the arrow is accepted ([]). The tests updated judge.test.ts:506 (now about :521-530) and add the cascade case (mutations AD1a-d). The optional parameter and the stale contract are reported as R1-2.
  - [15]
    - **id:** A-ADV-2
    - **how:** Fixed by the same B.4 change as S-F1. Re-run probes: A (non-target t2 proved at gate-proved) gives holds-kind/not-target; B (statements-only step proving t1) gives not-target; D (an opened pending premise proved at gate-other without a freeze) gives axiom-to-theorem, and not-target at the stage.
  - [16]
    - **id:** A-ADV-3
    - **how:** There are three fixes. G5 now compares a block's other lines in order (token `lines`, sessionRules.ts:558-567), only when no field rule spoke for that block. A step catch-all reports each unowned problem that S₀ lacked as existing-changed/unowned, when no other step finding exists (judge.ts:461-477). The step-limit message is neutral for content no S₀ item covers. Re-run probes: J (swapped lines, and a malformed line) gives markup/lines; L gives the neutral message. In a scratch copy I removed the catch-all, and its test fails.
  - [17]
    - **id:** A-ADV-4
    - **how:** targetChanged now also counts a meaning change of T.holds against S₀ (judge.ts:276-279), and isSessionProof also checks meaning against B (permitted.ts:79-80, reusing D2-41's meaningChange). Re-run probe I: gate-other and gate-proved give undeclared-premise/unselected, and at the stage T passes=false. Tests cover this (mutations AD4a/b).
  - [18]
    - **id:** A-ADV-5
    - **how:** At a step, G5's arrowInto accepts only the active step's ledger arrows (sessionRules.ts:400-402); a stage still accepts any ledger arrow. Re-run probe H gives markup/premises; the test fails under mutation AD5. A side effect (a duplicate finding) is reported as R1-4.
  - [19]
    - **id:** A-ADV-6
    - **how:** A judgeState test now covers `unseen` at a finish and at the stage, plus a passing case where the card is used directly and selected. The fixer's mutation table had no entry for it, so I checked myself: deleting the `unseen` loop in a scratch copy fails that test (1 failed | 93 passed).
- **findings:**
  - [1]
    - **id:** C-V2B1B-C2
    - **severity:** major
    - **where:** packages/core/src/gate/sessionRules.ts:1271-1272 (otherResultFindings: a session-proof `.holds` holder gets `{ target: holdsTarget, phase: 'proof', active: true }`) with :1254-1258 (`sources` reads questionOf when active) and packages/core/src/review/judge.ts:276-282 (stepQuestionForMaterial); docs/slice2-plan.md §4.9 footprint bullet ('`other-result` likewise')
    - **problem:** Only partly fixed. Material that earlier steps made for the re-asked target is now judged with the recorded question, but T.holds itself is not. An earlier step of the same inference also wrote T.holds, under the old question. otherResultFindings still judges it against the step's new question at every purpose, because a `.holds` holder is hard-coded `active: true`.

Suppose a re-ask drops a target-source t1 whose proof material (e.g. t1_lemma) T's old proof mentions. That use is allowed under the old question by D2-50. Then check, freeze and gate-other all report undeclared-premise/other-result on the unchanged T.holds. Claude has no way out:
- before the freeze it may not change T.holds (proof-before-freeze);
- at gate-other it must leave T.holds byte-identical (status-mismatch).

So the freeze is refused until Claude deletes the old proof, and a not-proved finish can never pass. The step burns its gate attempts. This breaks builder decision 2 ('a re-ask that finishes not proved, keeping its old proof, is not refused') and §3.2's 'your earlier result stands'.
    - **fix:** In otherResultFindings, judge a target's own `.holds` with the question its material is judged with: build the holdsTarget creator with `active: false`, so `sources()` reads `materialQuestionOf`. That already returns the step's question at gate-proved and at check once T.holds changed, and the recorded question otherwise. Other targets are unaffected (materialQuestionOf = questionOf for them).

Add tests:
- R4's state passes at freeze, check (prove) and gate-other;
- at gate-proved with T.holds unchanged it reports `other-result`;
- with a new T.holds from the new sources it passes.
    - **evidence:** Probes reask4/5/7.probe.test.ts in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/rv2b1br1/probe.

Setup: withChain(FORMALISED) with t1 added to T's premises. S₀ holds `theorem t1_lemma … := cynder_dark_past.holds`, `theorem t1.holds : t1 := t1_lemma` (both created s1, proof) and `theorem cynder_not_good.holds := (fun _ => pg_no_dark_past.holds …) t1_lemma` (created s0, proof). The recorded question is INFERENCE's sources plus t1; the re-ask scope s2 asks INFERENCE.question (t1 dropped).

Results:
- stage (old question on the record): global [], ok true, T passes.
- gate-other unchanged: ["undeclared-premise/other-result"], 'Spyro.t1_lemma belongs to the proof of “t1”, which is not a premise of “cynder-not-good”: prove what you need here.' check (prove) and freeze unchanged give the same.
- freeze after rewriting T.holds: ["proof-before-freeze"].
- gate-proved with a new proof: [].
- the same session with the step's question equal to the old one: [].

In a scratch copy, with the holdsTarget creator `active: false`, R4 gives [] at gate-other, check and freeze, and judge.test.ts still passes (96/96 with the probe).
  - [2]
    - **id:** R1-1
    - **severity:** minor
    - **where:** packages/core/src/gate/sessionRules.ts:1032-1056 (strayCommandFindings: an added comment passes only with `attachedTo`) with packages/core/src/review/items.ts:303 and :336-349 (compareTexts attaches a comment only to a declaration touched since the reference, which is S₀ at a step)
    - **problem:** After S-F2, a step that opened a declaration (through openItems, or its Result under openProof) may remove or move it with its comment, but may not reword the comment alone. The old line is now exempt, but the new line attaches only to a declaration changed since S₀. So the reworded comment of an unchanged opened lemma is a stray comment, with the false message 'this comment is not next to a declaration this step wrote or changed: put it directly above the declaration it describes' (it is directly above it).

DO-3 lets a Submit step change an open item's content, and the comment belongs to that item's content key (AP-26). At the stage, computeItems attaches the same comment to the lemma with no problem.
    - **fix:** At step purposes, count a declaration the scope opens (judgeState's openNames) as touched for comment attachment. For example, give compareTexts an optional `alsoTouched` predicate used by its `touched`, and have strayCommandFindings pass `(name) => openNames.has(name)`.

Add tests:
- rewording the comment of an opened, unchanged lemma passes at check and gate-proved;
- the same rewording next to a declaration the scope did not open is still stray-command/comment.
    - **evidence:** Probe cmt.probe.test.ts. S₀ = PROVED plus `namespace Lemmas / -- a helper of the proof / theorem t_lemma … / end Lemmas`, with t_lemma created s0 (proof). The Submit scope opens ['proof:cynder-not-good'].
- Rewording only the comment: check and gate-proved give ["stray-command/comment"] with the message above.
- Rewording it and also changing the lemma's text: [].
- Probe mv.probe.test.ts: moving the lemma with its comment gives [], and removing only the comment gives [].
- A stage judgement of the reworded state: global [], problems [].
  - [3]
    - **id:** R1-2
    - **severity:** minor
    - **where:** packages/core/src/review/permitted.ts:48 and :54 (`extraSources(target, ledger, items, current?, activeStep?)`: 'Without `current`, the drawn test is skipped'); packages/core/src/review/types.ts:373 and docs/slice2-plan.md:955 (§2.9 InferenceJudgement.extra: 'Claude's arrows into T that are not declined, and T's written premises')
    - **problem:** A-ADV-1's fix (a blocker) depends on an optional parameter. Meanwhile the §2.9 contract that later builders implement still defines E(T) without the drawn condition; only §4.8 was updated.

A later caller that follows the contract could call extraSources(target, ledger, items) and get the old E(T) back. That is 2b2's backstop restating B.2 on F, or 2b3b's premise re-checks, which use 'E(T) and B.2' (§3.8). Then an arrow that a cascade's revert took out counts again, and a proof can use its source with no arrow drawn. A-ADV-1 is reopened.
    - **fix:** Make `current` required in extraSources; its only caller, permittedFor, already passes it. Update the `extra` comment in review/types.ts:373 and §2.9 (line 955) to: '…not declined and drawn into T in the judged state (the running step's own entries before its normalise draws them), and T's written premises (§4.8)'.
  - [4]
    - **id:** R1-3
    - **severity:** nit
    - **where:** packages/core/src/gate/describe.ts:194 (`closed-proof`) and :192 (`session`); producers: packages/core/src/gate/sessionRules.ts:271 and :282-292 (`closed-proof` for a changed, removed or moved T.holds) and :275-280 (the neutral `session` message for content no S₀ item covers)
    - **problem:** Two board sentences misdescribe what Claude did, the same class of problem as S-F4.
- `closed-proof` reads 'it wrote a proof of “T”, which this step may not change'. stepLimitFindings gives this token to every change of T.holds while the proof is closed, including removing or moving it.
- Session content that no item of S₀ covers keeps token `session`, so the board says '…which an earlier step proposed and you are reviewing', while Claude's message (A-ADV-3) says no review item covers it.
    - **fix:** Word `closed-proof` neutrally ('it changed the proof of “T”, which this step may not change'), or give each case its own sentence. Give the uncovered case its own token or flag, so the board drops 'you are reviewing'. Add describeSession tests.
  - [5]
    - **id:** R1-4
    - **severity:** nit
    - **where:** packages/core/src/gate/sessionRules.ts:400-402 (G5 `arrowInto` at a step accepts only the active step's ledger arrows) with :718-736 (B.3's first loop: a declined ledger arrow that is still drawn)
    - **problem:** Since A-ADV-5, a step that re-draws a declined Claude arrow by editing `premises:` gets two findings for one problem:
- G5's markup/premises, because no entry of the active step explains the addition;
- B.3's arrow/declined, because the declined ledger arrow is drawn again.

Before the fix, the old ledger entry explained the G5 addition, and only arrow/declined was reported. This contradicts the 'one finding per problem' rule (decision 8) that S-F7 enforced in this same round.
    - **fix:** In sessionMarkupFindings at a step, leave to B.3 an addition whose ledger arrow item is declined; B.3's `declined` sentence is the more precise one. Add the probe as a test expecting only arrow/declined.
    - **evidence:** Probe dup.probe.test.ts. B and S₀ lack new-spyro-pg → cynder-not-good. The ledger has that arrow from step s0, with a declined add-arrow record and rejectedArrows. Step s3 puts `new-spyro-pg` back into `premises:` by hand. check gives stepFindings ["markup/premises","arrow/declined"].
- **checks_run:**
  - capped.sh 1800 tsc --noEmit -p packages/core/tsconfig.test.json: exit 0, no output
  - tsc --noEmit -p packages/runner/tsconfig.test.json, packages/webview/tsconfig.json, packages/webview/tsconfig.node.json, packages/extension/tsconfig.json (each via capped.sh 1800, one at a time): all exit 0, no output
  - core vitest run --maxWorkers=1 --no-cache --fsModuleCachePath=<scratch>/fsmc, TMPDIR and TELELEAN_TEST_TMP in scratch: 'Test Files  67 passed (67)', 'Tests  887 passed (887)'
  - webview vitest (same flags): 'Test Files  19 passed (19)', 'Tests  313 passed (313)'
  - extension vitest (--no-cache, same flags): 'Test Files  22 passed (22)', 'Tests  203 passed (203)'; packages/extension/out and dist untouched
  - runner capped.sh 3000 timeout 900 vitest run test/run/manager.gate.test.ts: 'Test Files  1 passed (1)', 'Tests  8 passed (8)'
  - runner capped.sh 3000 timeout 900 vitest run test/run/manager.accept.test.ts: 'Test Files  1 passed (1)', 'Tests  10 passed (10)'
  - Re-ran the reviewers' 10 probe files (adv, b4, b4b, b4c, f7, f7b, nofacts, move, reask, reask2) against the current code: 'Test Files 10 passed (10)', 'Tests 22 passed (22)'. Every probe that showed a finding's problem now gives the expected finding or passes; outputs in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/rv2b1br1/probe-out-old.txt
  - New probes in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/rv2b1br1/probe: reask3-7 (re-ask T.holds residual), cmt and mv (comments of opened content), dup (double finding)
  - Mutations in a scratch mirror of packages/core (/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/rv2b1br1/mirror), each restored and checked with cmp against the repo file:
- B.2 `unseen` loop deleted: 1 judge test fails (A-ADV-6);
- questionSources' drawn filter removed: 2 fail (S-F9, E(T));
- A-ADV-3 catch-all disabled: 1 fails;
- trial C2 fix (holdsTarget creator active:false): R4 passes, judge.test.ts 94/94
  - Diffed every changed file against the fixer's backups. The before/after snapshots differ in exactly the 13 listed files, and the current file hashes are unchanged since the start of this verification
  - Repo audit after the runs: git HEAD 187673d and status hash unchanged; the vite .vite-temp folders (root, core, webview, runner) are empty again; .vitest-cache still has 1654 entries; /tmp still has 29 entries; no process of mine remains
