# verify:2a:adv

Agent `a53f5fad55294e21f` of workflow `wf_ae5f1188-533`. Verbatim output (JSON alongside).

- **summary:** I reviewed 2a1 and 2a2 for adversarial safety. My snapshot of the tree is byte-identical to after_slice_2a2_built.patch. I traced the reducer, reconcile, the reveal rule, classify, deps and computeItems against the plan (§2.9, §3.5, §4.1–§4.7, §6.1, §8) and the spec (RV-1–RV-13, §14). Each suspect was confirmed by a probe that runs the real core code, in my scratch dir only.

The code holds on the main safety paths:
- Only `accept()` ever sets 'accepted', and reconcile never does.
- Group Accepts never take RV-7 items.
- Hidden Results and their parts can't be decided, and cascades into them are silent.

I found five real problems and two gaps in the tests:
1. **F1 rule broken, small RV-6 leak, no way forward (major).** Take a definition D that only a premise draft reaches, and an opaque E whose value uses D. Accepting the last meaning item shows the results. D2-23 then returns D, and RV-5 returns E with it, which hides the results again. The event "now needs its own Accept" names D while hidden, which reveals the draft. The loop repeats every time.
2. **A Reject silently undone (major).** Reconcile puts a rejected item back in review, with no event, when the same content reappears. The plan's whole-commit inverse merge for un-reject makes this reachable.
3. **A failed module wipes Accepts (major).** A judged state whose module did not build changes every content key in that module and empties its dependencies. Accepts are dropped with a misleading "Changed" event and never come back. Meanwhile Accept is enabled before dependencies.
4. **Undo restores a stale own Accept (major).** Undo puts back an own Accept whose badges grew since. The backstop would not catch it.
5. **Result Accept without a verdict (major).** Accepting a Result with no `results` entry records no verdict, which turns off RV-11 (fail-open).

Two smaller code issues:
- Redo can turn a group Accept into an own one, but only from input the protocol already refuses.
- "Adds no new basis" ignores sorry.

On the tests: 18 of 19 mutations left all 123 review tests passing (only the Undo force-restore was caught). That includes every Undo re-check except RV-5's dependency list, and D2-23 at Show results.

I did not run tsc or the full package suites (the code-lens verifier does). Nothing was written to the repository or to /tmp outside my scratch dir.
- **findings:**
  - [1]
    - **id:** V2A-ADV-1
    - **severity:** major
    - **where:** packages/core/src/review/reducer.ts:753 and :942 (badgesGrew :533-545 → cascadeBack :337); reconcile.ts:365-374; plan §4.1 (F1 claim) and §6.1 2a2 reveal test
    - **problem:** F1's claim ('its return never hides the results again') is false whenever an accepted meaning item depends on the returned item.

The case needs two items:
- D, a statement-phase definition that only a premise draft's statement reaches. It is b4 in `classes` only. It is accepted while the results are hidden, so its recorded badges are cBR's (belief false).
- E, a meaning item in R_stmt whose value, but not its meaning closure, uses D. An opaque is the clean example. E → D is an RV-5 edge.

What happens: accepting E, the last undecided meaning item, shows the results. D2-23 then returns D with `classes`, and cascadeBack returns E as D's accepted dependent. E is a meaning item, so the results are hidden again.

The outcome has `forced: null`, a cascade entry for D 'it now needs its own Accept', and an eventBadgesGrew event naming D. All of this happens while the results are hidden. It tells the user that a hidden premise draft reaches D, which RV-6 forbids (premises Claude proposes stay hidden). With no draft, the same action simply shows the results.

It also loops:
- D's re-Accept while hidden records cBR's badges again, own Accept included.
- So every later Accept of E bounces again.
- The only way out is Show results, which marks every Result seen early.

reconcile's RV-7 step (shownNow, then acceptedDependentsBack) has the same flaw. The case is contrived (an opaque with a value), but it is concrete.
    - **fix:** When an action (decide, undo) or reconcile shows the results without a force, and D2-23 then returns items, the returns and their RV-5 cascade must not hide the results again. For example, record the show as a force that marks nothing seen early, such as a new `SessionForce.via` (contract addition, §8), recorded on the stack so Undo removes it. Optionally also record an own Accept's badges as the union of both class maps, which ends the loop for own Accepts. Let the integrator decide the variant and log it in §8. Test to add: D (draft-only belief, accepted while hidden) plus an opaque E using D. Accept E: the results stay shown and no event names D while hidden. Also add the reconcile variant.
    - **evidence:** Scratch probe /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2a-adv/probes/probe1.test.ts (P1). Outcome: statuses decl:D/decl:E in-review, forced null, cascade [{D,'it now needs its own Accept'}], events [eventBadgesGrew [D]], results hidden after. The second round is identical. The P1 control (D PLAIN in both maps) shows the results with no event. Log: …/v2a-adv/probe1.log.
  - [2]
    - **id:** V2A-ADV-2
    - **severity:** major
    - **where:** packages/core/src/review/reconcile.ts:226-236 (AF1 branch); reducer.ts:455-483 (un-reject); types.ts ItemWrite.reapply; plan §3.6 'the decision commit's inverse patch is merged onto the head'
    - **problem:** reconcile silently drops a user's Reject.

The mechanism: a record that is declined (Reject or plain) or reverted, whose draft has the same content key and is not asInBase or an unchanged premise draft, goes through toReview. That makes it 'in review' with no marker and no event. Its current key stays in rejectedFingerprints.

Reachable trace with the plan's un-reject mechanism:
1. Reject Y. Its decision commit c1 takes out Y and its dependent X (write.revert=[Y,X]).
2. The user Rejects X (no write).
3. Un-reject Y. The reducer keeps X declined and emits write.reapply=[Y] only.
4. §3.6 says un-reject merges the decision commit's inverse patch, so X's content comes back too.
5. The next judge sees X's draft and flips X to in review silently. The user's explicit Reject is gone.

The same happens for a dependent still taken out by a second taker (`stillOut`). There the content also fails to build.
    - **fix:** In reconcile, keep the decision instead of flipping it:
- A declined-out record whose draft key is in its rejectedFingerprints (or equals its fingerprint) keeps its decline. Add it to `reverts` so the write takes the content out again, and report a problem or event.
- A reverted record with a same-key draft stays reverted and is taken out again, or at least gets an event.

In the contract, state that `ItemWrite.reapply` restores only the listed items' content, never the whole inverted decision commit. Alternatively, add a `keepOut` list of items the inverted commit took out that stay out.

Tests to add:
- reconcile with a rejected record and a same-key draft.
- un-reject of Y after X was rejected.
- un-reject with two takers (see V2A-ADV-7).
    - **evidence:** Scratch probes probe1.test.ts (P2) and probe2.test.ts (P2b) under …/v2a-adv/probes/.
- Reject Y write: revert [Y, X].
- Reject X write: null.
- Un-reject Y write: reapply [Y] only; statuses Y in-review, X declined.
- reconcile with X's same-key draft: X 'in-review', rejectedFingerprints ['fp:decl:X'], events [], problems [], reverts [].
Log: …/v2a-adv/probe2.log.
  - [3]
    - **id:** V2A-ADV-3
    - **severity:** major
    - **where:** packages/core/src/review/items.ts:91-94 and 479-489 (factsMaterial in the content key), 975-976 (mentions from facts); reconcile.ts:238-241 (changedKey); deps.ts:110
    - **problem:** A judged state whose module did not build has no facts for any declaration in that module (ModuleFacts state 'failed' or 'dependency-failed'). §3.6 expects such states after a revert, un-reject or Undo.

What goes wrong:
- Every item computeItems reports there gets a different content key, because factsMaterial({}) drops kind, type, value and consts.
- Every such item gets empty `mentions`, so it has no RV-5 edges.

reconcile then runs changedKey on every accepted item in the module:
- the Accept is dropped and the item marked 'updated';
- accepted dependents return to review;
- the event 'Changed in the working copy, so back in review:' appears, although nothing changed;
- a hidden accepted Result's newContent ends Show results' force.

When the build is restored, the key changes back. The record now holds the facts-less key, so the item gets another 'updated' version (rev 3) and its Accept never returns. In a one-file model, that is every accepted item.

Meanwhile a facts-less Formalize depends on nothing, so a group Accept can take it before the definitions it uses. D2-25's 'dependencies over-approximate' does not hold when facts are missing entirely.
    - **fix:** Have computeItems flag a draft whose declarations have no facts in the judged state, for example `ItemDraft.factsMissing` (contract addition, §8). Then:
- reconcile keeps such records unchanged (key, rev, status, no event), and lets the judge's `no-longer-builds` reverts act only on the failing items;
- dependencies and Accept fail closed for them: refuse Accepts while the stage judgement's module has no facts, or make the item depend on every other item of that module.

Test to add: an accepted Formalize in Main survives a judgement with Main 'failed', and the next building judgement, as accepted, rev 1, with no event. Its Accept is refused while its facts are missing.
    - **evidence:** Scratch probe probe3.test.ts (P6): card:pg-no-dark-past key 7f688aa17bd4 when built vs f6c643d682bb with Main failed; computeItems problems []. reconcile(bad) gives in-review, rev 2, ['updated'], event eventChanged. reconcile(good again) gives in-review, rev 3, ['updated']. Probe probe4.test.ts (P7): deps of card:pg-no-dark-past are ['decl:Spyro.Evil'] when built, [] with Main failed. Logs: …/v2a-adv/probe3.log, probe4.log.
  - [4]
    - **id:** V2A-ADV-4
    - **severity:** major
    - **where:** packages/core/src/review/reducer.ts:913-935 (ownNeeded checks only how==='group'), :942 (badgesGrew only on a hidden→shown flip)
    - **problem:** Undo restores an own Accept whose badges grew since it was given, without D2-23 or RV-7's check. D2-73 says Undo checks RV-7's own Accept.

Reachable trace:
1. D is accepted (own) while it is not RV-7.
2. The user Shaky-declines Y. D, which depends on Y, cascades to to-be-redone, kept.
3. A judge that was running (D2-27) finishes, or a premise re-check runs, and makes D a belief. reconcile's RV-7 rule skips D, because D is not accepted at that moment.
4. The user Undoes the Shaky decline. D is restored as accepted with belief:false. The results are shown both before and after, so badgesGrew does not run.

An Undo of a Shaky decline writes nothing, so no judge follows. The backstop's `class` and `own-accept` codes only catch group Accepts, so D can reach Apply as a belief the user never accepted as one.
    - **fix:** For every Accept an Undo restores, own and group alike, compare `c.before.accepted.belief/changesProved` with `w.classOf(r, shownAfter)`. If a badge grew, refuse with RV-7's text (leftOwnAccept / leftOwnAcceptProved), or restore it and return it to review with D2-23's event. Add tests in the P3/P3b shape, forced and unforced.
    - **evidence:** Scratch probe probe1.test.ts. P3 (forced): Undo ok, D 'accepted', accepted {how:'own', belief:false} while the class is BELIEF. P3b (unforced, a belief in `classes` only, results shown): the same. The same scene with a group Accept is refused. Log: …/v2a-adv/probe1.log.
  - [5]
    - **id:** V2A-ADV-5
    - **severity:** major
    - **where:** packages/core/src/review/reducer.ts:494 (accepted.result only when state.results has the id); reconcile.ts:246 (RV-11 needs accepted.result and a judged inference); types.ts ReviewState.results? (builder 2a2 addition)
    - **problem:** Accepting a Result whose id has no entry in the optional `ReviewState.results` succeeds and records no verdict or Rests on. After that, reconcile's RV-11 never returns the Result: its condition needs `accepted.result !== undefined`, and it also skips when the inference has no judgement. The backstop's comparison of 'a changed accepted verdict or Rests on' has nothing to compare.

So one missing optional input silently turns off two safety checks, and nothing forces 2e to provide it. A probe shows a Result accepted this way staying accepted after its verdict and Rests on change.
    - **fix:** Fail closed:
- In ownAcceptRefusal and groupItemOf (blocked), refuse a Result's Accept when its `results` entry is missing, with a text such as "telelean has not judged this result yet".
- In reconcile, treat an accepted Result with no `accepted.result`, or whose inference is not in the judgement, as changed (RV-11).

Add a test for each, and note in §8 that 2e must fill `results` for every Result.
    - **evidence:** Scratch probe probe1.test.ts (P5): accepted.result undefined; reconcile with verdict 'not-proved' and restsOn ['something-new'] gives status 'accepted'.
  - [6]
    - **id:** V2A-ADV-6
    - **severity:** major
    - **where:** packages/core/src/review/reducer.ts:808, 890, 906-908, 916, 919, 937-940, 942; test/review/reducer.test.ts:523-645 (random property test)
    - **problem:** The reducer's re-checks against the current state (D2-73, AF13), and D2-23 at Show results, are untested. Mutation checks on a scratch copy (review suite, 123 tests) show that dropping any one of these leaves all 123 passing:
- Undo's RV-7 group check (919);
- Undo's D2-8 hidden-decided check (890);
- Undo's 'did not pass' check (916);
- Undo's RV-5 confirmation (937);
- Undo's D2-23 at a show (942);
- Undo's RV-5 cascade of later Accepts (907);
- Show results' D2-23 (808).

The random property test never changes classes or dependencies between actions, as a judge would. It also records `named = []` for Undo, so its 'no decision names a hidden item' property never covers Undo. Its RV-5 check cannot reach these paths, because Undo is LIFO.
    - **fix:** Tests to add:
- Undo after a class change: group gives leftOwnAccept; own as in V2A-ADV-4.
- Undo of a Result's Accept after a judge hid the results gives showResultsFirst.
- Undo under didNotPass gives acceptDidNotPass.
- An Undo that takes an Accept from a dependent gives needs-confirmation, with hiddenResults when hidden.
- An Undo that shows the results returns a draft-only belief.
- Show results returns a group-accepted draft-only belief, with eventBadgesGrew.

Also add a 'judge' step to the random property test that perturbs classes and deps between actions. Assert RV-5 and 'every accepted item's recorded badges cover its class in force', and set `named` for Undo too.
    - **evidence:** Scratch harness /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2a-adv/mutate.py and runmut.sh (copy of packages/core under …/v2a-adv/mut). Baseline 'Test Files 9 passed (9), Tests 123 passed (123)'. M1, M2, M3, M4, M38, M42, M44 each gave 'Tests 123 passed (123)'. Only M43 (Undo's endedForce restore) was caught: '1 failed | 122 passed'.
  - [7]
    - **id:** V2A-ADV-7
    - **severity:** minor
    - **where:** reducer.ts:474-479 (un-reject stillOut), :82 (UNKNOWN_CLASS); reconcile.ts:247 (RV-11 Rests on), :273 (D2-17 same step), :296 (judge revert keeps a Shaky decline), :321 (re-check status guard), :346 (RV-3 cascade), :395 (second force check), :60 (UNKNOWN_CLASS); classify.ts:138 (unknown source basis)
    - **problem:** Several 2a2 rules have no test that fails when the rule is dropped. Each mutation below left all 123 review tests passing:
- un-reject brings a dependent back only when no other taker is still out (M5);
- D2-17 keeps the new step's own premise drafts (M10);
- RV-3 marks the new item's dependents in review (M12);
- the judge's revert keeps a Shaky dependent's decline and note (M21);
- RV-11 on a Rests on change alone (M28);
- the force ends after RV-7/RV-5 returns (M41);
- the premise re-check only touches undecided or accepted drafts (M11);
- the fail-closed defaults: an unknown class in the reducer and in reconcile (M8, M9), and an unknown source footprint never saying 'adds no new basis' (M7).
    - **fix:** Tests to add:
- X with two takers: un-reject one, X stays reverted with because=[other]; un-reject both, X comes back.
- A premise draft of the same step as the new Result version is not withdrawn.
- RV-3 with a dependent chain.
- A judge revert under a Shaky dependent keeps its note.
- RV-11 with the same verdict and different restsOn.
- A force whose only undecided item comes from RV-7 or RV-5 returns.
- A declined premise with a failing re-check stays declined.
- A missing class gives own-accept, blocked and a meaning item.
- A source whose `.holds` has no axioms gives addsNoNewBasis false.
    - **evidence:** mutate.py results: M5, M7, M8, M9, M10, M11, M12, M21, M28 and M41 each gave 'Test Files 9 passed (9), Tests 123 passed (123)'.
  - [8]
    - **id:** V2A-ADV-8
    - **severity:** minor
    - **where:** packages/core/src/review/reducer.ts:973 (Redo re-sends `own: top.request.own` with a filtered decision list) vs :706
    - **problem:** decide() treats `own` with more than one decision as a group Accept (:706).

Redo filters the request down to the decisions that changed something but keeps the original `own`. A request {X accepted, Y in-review (a no-op)} with own:true was a group Accept of X. After Undo, if X has become RV-7, its Redo is an own Accept of X: an RV-7 item accepted without its own Accept.

The §2.4 validator refuses `own` with two decisions, so only malformed input gets here, but the reducer's own guard is bypassed.
    - **fix:** Redo should pass `own: top.request.own && top.request.decisions.length === 1`, or the decide action should record the effective own flag. Add a test with the probe's shape.
    - **evidence:** Scratch probe probe1.test.ts (P4): first action accepted.how 'group'; after Undo and X → CHANGES, Redo gives accepted {how:'own', changesProved:true}.
  - [9]
    - **id:** V2A-ADV-9
    - **severity:** minor
    - **where:** packages/core/src/review/classify.ts:89-102 (basisOfFootprint), :128-142 (basis/addsNoNewBasis)
    - **problem:** basis(u) ignores `sorryAx`. It is not a card's `.holds` and not a Prop axiom in the model's facts.

So a source whose proof is `sorry` has basis {}, and every Add arrow from it gets the reassuring marker 'adds no new basis', although the source rests on an unproved claim. RV-7: 'rests only on what the question already covers'. The arrow still needs its own Accept (c4), and B.1 excludes sorryAx, so no proof can use it. The marker is still misleading.
    - **fix:** In basis(u), return {u} when u's `.holds` facts have `usesSorry` or list sorryAx in `axioms` (treat it like a pending source). Add a test with a sorry-proved source.
    - **evidence:** Scratch probe probe4.test.ts (P8): `dark.holds := sorry` with axioms ['sorryAx'] gives class {c4, addsNoNewBasis: true}.
- **checks_run:**
  - Snapshot: snapdiff.sh → /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2a-adv/now.diff, byte-identical (cmp) to after_slice_2a2_built.patch; new/changed files listed against after_slice_1g.patch
  - Read: verify_common.md, brief 2a.md, builder_rules.md, reports_2a.md; plan §0, §1, §2.2, §2.4, §2.9, §3.1-§3.8, §4.1-§4.12, §6.1, §7.2, §8 (2a1/fixer 2a1/2a2 entries); spec RV-1-RV-13, DO-0-DO-3, UN-1-UN-7, §14, Appendix A/B; AP-24-AP-27
  - Read in full: review/types.ts, records.ts, reveal.ts, scc.ts, reducer.ts, reconcile.ts, classify.ts, deps.ts, closure.ts, items.ts; tests reducer/reconcile/reveal/deps/classify.test.ts and helpers; gate/rules.ts G5 part, facts.ts module states
  - Probes (scratch only; vitest from the repo binary, root in scratch, --no-cache --fsModuleCachePath=<scratch>/fsmc, TMPDIR=<scratch>/tmp, capped.sh 1400, --maxWorkers=1): probe1.test.ts 'Tests 7 passed (7)' (P1, P1 control, P2, P3, P3b, P4, P5); probe2.test.ts 'Tests 1 passed (1)' (P2b); probe3.test.ts 'Tests 1 passed (1)' (P6); probe4.test.ts 'Tests 2 passed (2)' (P7, P8). Each probe asserts the defect, so passing confirms it
  - Mutation checks on a scratch copy of packages/core (src+test; zod, vitest and test-fixtures symlinked read-only): baseline 'Test Files 9 passed (9), Tests 123 passed (123)'. Of 19 mutations, only M43 failed a test ('1 failed | 122 passed'); the other 18 left 123/123 passing. Each mutated file was restored byte for byte (sha256 checked)
  - Not run: tsc and the full core, webview, extension and runner suites (left to the code-lens verifier). I did not run vitest inside the repository, to stay read-only
  - Effects: only my scratch dir was written. The repo's node_modules/.vite-temp and packages/core/node_modules/.vite-temp mtimes (18:42-18:43) predate my first run (18:55), so they came from other agents. Nothing new in /tmp outside the scratch dir. No git command that changes state, no npm/npx, no network, no Claude. capped.sh transient systemd scopes ended with each command; no processes left
