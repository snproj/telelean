# recheck:round2

Agent `a8ea6300e1246db76` of workflow `wf_aabed7c9-dbf`. Verbatim output (JSON alongside).

- **summary:** Your question about the slices: the spec's order (★D8 (a)) has five slices. Slice 1 is the new board, and it is done. Slice 2 is the review list, which is what this plan covers. Slice 3 is FROZEN, slice 4 is the transform window, and slice 5 is references. Consistency checking comes in M3. Slice 2 is built as 2a1 → 2a2 → 2b1 → 2b2 → 2c → 2b3 → 2d → 2e → 2f. 2g (the webview) runs beside 2b3 and 2d–2f, and 2h comes last.

Round-2 findings that are fixed as described: S3, S4, S7, S10, S11, S13, C1, C2 (for Claude steps), I3, I5, I6 and N1.

Fixed in the main case, but with a gap that is still open:
- S1: a second re-ask's `asked.earlier` (F2).
- S2: a cancelled statements-only step is never put in `retry` (F3), and a not-proved step with no difference gets no Result item (F9).
- S5: the judge's changes to the records are not in the write queue (F8).
- S6 and S12: Undo of a DO-0 does not restore the question or `selectedArrows` (F4).
- S8: the cascade must test `shown` (F20).
- S9: draft-reached definitions escape `other-result` (F7).
- I1: hidden Results that use items outside cas (F6).
- I2: the written premise's key needs a build that no engine call provides (F11).
- I4: Undo restores only StatusSnapshot (F4).

The new problems that matter most:
- The reveal rule has no fixpoint once a draft turns a visible definition into a belief (F1).
- An ordinary Undo or un-reject of a Reject leaves its key in `rejectedFingerprints`. `rejected-repeat` is a global rule, so every later step and the final check fail (F4).
- Reconcile leaves a re-proposal that came back unchanged as Shaky or to be redone, so Submit loops (F5).
- The "Rejected in this session" list and the stage report's withdrawn list show part items of hidden Results (F10).
- Namespace and mutual lines that the gate allows have no owner at Apply (F13).

No blocker. 11 major, 8 minor, 1 nit. Code was checked where it matters: the HistoryActionKind label map, history parsing, comparator export targets, the tsconfig.test files, and RunView.frozen readers.
- **findings:**
  - [1]
    - **id:** F1-reveal-rule-has-no-fixpoint
    - **severity:** major
    - **where:** §4.7 'What a hidden Result waits for' (pre counts 'every visible belief item'), §4.7 'When a Result is revealed', §4.1 last bullet / D2-42
    - **problem:** Whether a Result is revealed depends on pre(R), and pre(R) counts visible belief items. But classes count a Result's drafts only once that Result is revealed. Take a statement-phase definition D. By D2-42 it is always its own visible item. No card statement reaches D, but R_T's premise draft does, and D is still in review. While R_T is hidden, D is not a belief, so D ∉ pre(R_T), and R_T is revealed once everything else is decided. Once R_T is revealed, its draft counts, so D becomes a belief from a step ≤ T's reference step. D is then in pre(R_T) and undecided, so R_T is hidden again, and D stops being a belief, and so on. There is no consistent state. An implementation either oscillates, or keeps the stale class. In the second case D shows a belief badge, or loses its group Accept via D2-23, while R_T is hidden. Drafts exist only when T was not proved, so that visible change shows the outcome.
    - **fix:** Make pre's item set independent of class:
- every visible statement item;
- every visible item that is or could become a belief (any Lean axiom, any `decl:` item, any vocabulary change) whose origin step is ≤ the reference step, whatever its current class.

A reveal then never changes pre. Add a 2a2 test with D and the draft: R_T is revealed once and stays revealed, and the twins are identical.
  - [2]
    - **id:** F2-second-reask-earlier-question
    - **severity:** major
    - **where:** §2.2 SessionInference.asked; §3.2 'A re-asked target' (the Submit step run 'as a re-ask' while asked is set); §4.7 'T's question sources'
    - **problem:** While `asked` is set, a Submit step for T runs as a re-ask. Every re-ask that ends sets `asked` with 'the one before it'. The natural reading is the record's question at that point, and that differs between the twins:
- if the first re-ask proved T, the record's question was already replaced by the asked question;
- if it did not, the record's question is still the original.

pre and cas use Q(T) ∪ asked.question ∪ asked.earlier. That gives {new} in the proved twin and {new, old} in the other. So the hidden Result's waiting list (shown in its detail) and rule-1 cascades over the old sources' items (which change `shown`) differ before the reveal.
    - **fix:** Set `asked.earlier` only when `asked` is unset. Define it as T's question when its Result was last shown. A later step while `asked` is set updates only `asked.step`. Add a 2c/2e twin: a re-ask (proved or not), then a Submit step for T before the reveal.
  - [3]
    - **id:** F3-cancelled-statements-only-step-not-retried
    - **severity:** major
    - **where:** §2.6 PersistedSession.retry doc; §3.3 step 3 last bullet; §3.4 table rows 'statements only' and 'cancelled / failed'
    - **problem:** Two rules conflict. One says 'a statements-only step never goes to retry'. The other says a cancelled or failed step 'and the rest move to retry'. Read literally, Cancel step, a cap or a failure during T's statements-only step leaves T out of `retry`. If T is the last step, Retry step is disabled. In the twin where L was proved, T's normal step goes into `retry`. So the Retry button, and which steps Retry reruns, show L's hidden outcome.
    - **fix:** A cancelled or failed step goes to `retry` in either mode, and Retry decides the mode again at its new S₀. Delete 'never goes to retry': an ended step never goes there anyway. Extend 2d's A12 twin test with Cancel step and an injected failure.
  - [4]
    - **id:** F4-undo-and-unreject-restore-statuses-only
    - **severity:** major
    - **where:** §2.2 StatusSnapshot / SessionAction; §3.6 Un-reject and Undo; §4.6 DO-0; §4.9 rejected-repeat (listed under global rules 'for every purpose')
    - **problem:** Actions change more than StatusSnapshot covers:
- Reject adds the key to `rejectedFingerprints` and sets `versions[].rejected`.
- DO-0 adds to `rejectedArrows`, and (D2-59) removes L from T's `question` and `selectedArrows`.
- An activity reveal on a running step sets `PersistedStep.reveal`.

Neither Undo, which inverts through StatusSnapshot, nor un-reject reverses any of this. The consequences:
(a) After an Undo or un-reject of a Reject, the restored content's key is still a rejected key. `rejected-repeat` is global, so every later judged state is not ok: each later Claude step fails on content it may not touch, and the final check refuses Apply. The same happens after an undone DO-0, because the arrow is back in ws/ and still in `rejectedArrows`. An ordinary Ctrl+Z breaks the session.
(b) After Undo of a DO-0 on a selected arrow L → T, the arrow is back in E(T), but L is a target that is missing from T's question and `selectedArrows`. R_T no longer waits for R_L, yet its proof can rest on L's session proof (throughResults), so R_T can show L's hidden outcome.
(c) An undone activity reveal still force-reveals the step's Result when the step ends.
(d) Because `shaky-identical` is global, it fires at stage and final, where `noAlternative` is never set.
    - **fix:** Record every effect in the SessionAction:
- `decide`: per item, the `rejectedFingerprints` and `versions` flags; the `rejectedArrows` delta; the question and `selectedArrows` delta.
- `reveal`: the step reveal.

Undo reverses these and Redo re-applies them. Un-reject removes the item's current key from `rejectedFingerprints`, and the arrow from `rejectedArrows`. Make `rejected-repeat` (all four tokens) a step-purpose rule that applies only to content created or changed since S₀. Tests in 2a2 and 2e:
- Undo of a Reject, then a step, then Apply all pass.
- Undo of a DO-0 on a selected arrow restores L in T's question and in `selectedArrows`.
  - [5]
    - **id:** F5-reconcile-keeps-unchanged-reproposals
    - **severity:** major
    - **where:** §3.5 reconcile ('the same key and content key: unchanged'); §4.6 table ('declined (Shaky) → in review: Before Submit review', 'to be redone → in review (updated): A step proposes it again'); §3.7 DO-3 / no_alternative
    - **problem:** A Submit step can bring an item back unchanged:
- DO-3 says 'any single item may come back unchanged';
- the step can return the whole set with no_alternative;
- Claude can re-add a reverted to-be-redone item identically.

In each case the draft has the record's own key, so reconcile leaves the item Shaky or to be redone. Two problems follow:
- A reverted item is then in ws/ while its record says reverted. That breaks §3.1's invariant, and 'back to review' is refused for it.
- A Shaky item cannot return to review after Submit, according to the table.

No rule implements 'the items come back marked no alternative found'. The item can never be accepted. The next Submit queues another Claude step for it, which costs quota, and DO-3's identical-set check makes that step fail.
    - **fix:** In reconcile, every Shaky or to-be-redone item with a draft, in an inference whose Submit step ended, returns to in review:
- marked 'updated' only when its key changed;
- marked 'no alternative found' when the finish said no_alternative;
- with `reverted` cleared;
- with the decline kept in its history.

State that this takes precedence over 'unchanged'. Add tests in 2a2 and 2e.
  - [6]
    - **id:** F6-hidden-proof-uses-items-outside-cas
    - **severity:** major
    - **where:** §4.7 cas(R) and rule 1; §3.7 D2-57 take-out ('a hidden Result ... through its cascade set'); §3.3 step 2 (Submit step openProof)
    - **problem:** A proof may use any visible item, for example a statement-phase definition or vocabulary term that no statement reaches. Such an item is in neither cas(R_T) nor pre. Suppose the user declines one as Shaky while R_T is hidden:
- rule 1, which follows cas only, leaves R_T in review;
- D2-57 ignores R_T, because it is in review and only cas is followed;
- T's own Submit step gets `openProof: false`.

The step that reworks the item, whether T's or another inference's, keeps T.holds fixed. Only in the twin where T was proved, T.holds stops building inside that step. Claude cannot fix that error, and it counts against Claude. The step gives up and the rework never appears, while in the other twin it does. Claude is blamed, and the visible rework shows T's hidden outcome.
    - **fix:** For hidden Results, use an outcome-independent 'may use' set for Shaky and redo-without-revert cascades, and for D2-57's test: cas plus every visible item whose origin step is ≤ T's reference step. A Shaky decline of such an item then makes R_T to be redone without revert (its `shown` status too). T's Submit step then gets openProof, and D2-57 takes R_T out when another step opens the item. Reject keeps cas, since the judge's build path handles real breakage. Add a 2e twin test.
  - [7]
    - **id:** F7-draft-reached-definitions-escape-other-result
    - **severity:** major
    - **where:** §4.2 (the D2-42 exception; 'created in a statement phase, or reached by a card statement → decl:'); §4.9 other-result; §2.9 ItemDraft.partOfResult
    - **problem:** The D2-42 exception items are a proof-phase `decl:` reached only by a draft of the same step. They are explicitly not proof material, so `other-result` does not protect them. Their ownership is also re-derived from current reach. So a later step's statement, another target's proof, or a premise statement can mention such a definition:
- the definition then counts as 'reached by a card statement' and becomes a visible `decl:` item;
- or another inference's revealed Result rests on it with no dependency on R_T.

These definitions exist only when T's step left drafts, that is, when T was not proved. So a later visible item shows T's hidden outcome. Claude reusing a helper it finds in the file is likely.
    - **fix:** Treat partOfResult declarations as R_T's proof material for `other-result`:
- statements, statement-phase content, premise statements and other inferences' material never mention them;
- proofs may use them only when T is a source of the question.

Fix partOfResult and ownership at creation (ledger `created` plus the draft that reached the declaration), and never re-derive them from later reach. Add a cheat to §6.2 and a twin to 2c.
  - [8]
    - **id:** F8-judge-record-updates-outside-write-queue
    - **severity:** major
    - **where:** §2.6 'One write queue' (lists the judge's reverts only); §3.6 Judging; D2-51; §2.9 SessionWrite
    - **problem:** A judge's outcome also changes the records:
- RV-7 class growth and D2-23;
- RV-11 verdict or Rests on changes, which take a Result out of accepted;
- 'no longer builds' markers;
- premise re-checks;
- `judged`.

These changes are planned from the records as they were when the judge started. Meanwhile Accept, Shaky and Show result go through the queue (D2-27). Two outcomes are then possible:
- The judge's update is written from its own snapshot and overwrites a decision made meanwhile, so an Accept is lost.
- The decision's reducer output, computed from the records before the judge finished, overwrites an RV-11 un-accept. An accepted Result with a changed verdict then stays accepted until the backstop refuses Apply.
    - **fix:** Apply the judge's whole outcome (reverts and record updates) as one queued SessionWrite, `judge-apply { judged }`, planned inside the queue against the current records and head:
- if the head moved, drop it and judge again;
- otherwise merge it into the current records.

Add a 2e test: an Accept made during a judge whose outcome changes another item keeps both changes.
  - [9]
    - **id:** F9-no-result-item-without-a-difference
    - **severity:** major
    - **where:** §4.2 (computeItems maps 'every difference'); §3.5 step 3 and 'a record with no draft'; D2-44; §2.3 InferenceView.result
    - **problem:** computeItems maps only differences between B and the state. Some steps leave T.holds exactly as in B and create no proof material:
- a first step that ends not proved;
- a step that gives up;
- every statements-only step.

No `proof:<T>` draft exists for these steps. RV-1's 'one Result per inference, always present' then fails, and the '“‹L›” was not proved' Result has no item. The item list also differs from the twin where T was proved, which is an RV-6 leak. 2d's A12 twin test would fail. A Result rejected back to B's T.holds also loses its draft.
    - **fix:** computeItems takes the inferences whose step ended (from `SessionRecords.steps`) and always emits `proof:<T>` for each. Its content is T.holds as it is in the state (or absent) plus its proof material, so a not-proved Result has a stable key. Reconcile's 'no draft' rule never applies to these Results. Add a 2a1 test.
  - [10]
    - **id:** F10-rejected-and-withdrawn-lists-show-hidden-parts
    - **severity:** major
    - **where:** §2.3 SessionView.rejected / RejectedView and StageReportView.withdrawn; §4.7 'What is withheld while R_T is hidden'
    - **problem:** Part items of a hidden Result can be in 'Rejected in this session' from an earlier reveal: premise items, proof-phase `decl:` items, and the Result's own drafts. A later step for T may re-propose the same key in only one twin:
- a premise with the same Lean name appears when T is not proved;
- a proof-phase definition with the same name appears when T is proved.

While R_T is hidden, this has two visible effects:
- the entry becomes `superseded`, and its Un-reject gate changes to 'Claude proposed a newer version';
- T's earlier drafts are withdrawn only when a new Result version comes, and they appear in the report's withdrawn list.

§4.7's withheld list names counts, 'depends on N', missing lists and events, but not these two lists.
    - **fix:** While R_T is hidden, keep its part items' RejectedView and withdrawn entries as they were at the last reveal, the same way `shown` works. That covers `superseded`, rev and the Un-reject gate. Refuse un-reject of these items with the hidden-Result text. Add a 2c twin: a premise rejected, then re-proposed under the same key.
  - [11]
    - **id:** F11-premise-write-and-completion-need-their-own-lean-jobs
    - **severity:** minor
    - **where:** §3.8 (meaning in place, the written item's key, completion); §2.9 SessionWrite 'premise' and engine `complete`; §3.3 step 5 (re-export from the step's freeze copy)
    - **problem:** (a) Step 4 of the premise write must record the written item's content key. That key needs the facts of the written declarations (type, value, valueConsts, typeConsts), and the in-place rendering needs a build. No engine call provides this: judge runs outside the queue, and `complete` is the next write. Without it, reconcile sees a new key and takes the premise out of accepted, which is the I2 bug again.
(b) `complete()` gates 'with a re-exported challenge'. §3.3 builds re-exports from the step's freeze copy, which was made before the premise was written. P.holds is now a permitted axiom, and every permitted axiom is an export target (`comparatorExportTargets`). So the export lacks P.holds and fails, and every completion reads 'completion not checked'.
    - **fix:** Add `engine.writePremise(ctx, { item, draft })`. It normalises, builds, renders P where it was written, and returns the judgement. Step 4 takes the key from it and stores it as `judged`. For `complete()`, freeze again from the adopt commit, as M2's adoption did, after `statement-changed` passes against T's last freeze snapshot.
  - [12]
    - **id:** F12-missing-contract-pieces
    - **severity:** minor
    - **where:** §2.2 PremiseDraft; §2.7 JudgeInput.premises; §2.9 (function list); §4.6 planGroupAccept; §4.12 formalizeStartProblems; §3.2; §5.1
    - **problem:** Four pieces are missing:
(a) R_stmt with drafts (D2-42), premise items' `mentions` and their statement views all need each draft's scratch facts. PremiseDraft has none, and judgeState is pure, so classes and dependencies change after a reload.
(b) There are no signatures for `reconcile`, the pre/cas/revealed computation, `computeItems`, `classify` or `deps`, yet 2a1 must stub every function a later sub-slice calls, and 2d calls `reconcile`.
(c) The `session?` parameter of `formalizeStartProblems` has no type. The second bullet of check 2 needs each hidden step's start facts, which the host and webview never have. The plan does not say that the runner's mid-stage `formalize` re-runs the check.
(d) `planGroupAccept` is said to run in the webview, which has ItemView, not ItemRecord.
    - **fix:** - Add `PremiseDraft.facts` (the facts of its statement, replaced on re-check).
- Add signatures to §2.9 for:
  - `reconcile` (input: records, judgement, the ended step, ledger, drafts; output: records, events, problems);
  - the waiting/revealed computation;
  - `computeItems`.
- Add a runner-built `FormalizeSession` type, and state that the runner's `formalize` runs the full check (the host's check is advisory).
- Make `planGroupAccept` generic over `{ id, status, dependsOn, belief, hidden }`.
  - [13]
    - **id:** F13-enclosing-lines-unowned-at-apply
    - **severity:** major
    - **where:** §4.2 ('enclose only new declarations of one item'); §4.9 stray-command exception ('of the same step'); §4.10 unowned; §4.11 enclosing lines
    - **problem:** The gate and ownership use different rules:
- The gate accepts namespace, section and mutual lines around the new declarations of one step.
- Ownership gives those lines an owner only when they enclose declarations of one item.

Two new vocabulary terms inside one new `namespace` pass every check, and so does any `mutual` block, which always has at least two declarations and usually separate `decl:` items. Both are still unowned differences. 'Apply is disabled', and the backstop refuses `unowned` at F. The only ways out are rejecting all but one enclosed item, or, for a mutual pair (which cannot build apart), Exit.
    - **fix:** Use one rule in §4.2, §4.9, §4.10 and §4.11:
- enclosing lines are owned jointly by the items they enclose, and are never unowned while every enclosed declaration is new;
- a revert removes them together with the last enclosed declaration;
- the backstop accepts them when every enclosed declaration belongs to an accepted item.

Test Apply with two accepted items in one new namespace, and with a mutual pair.
  - [14]
    - **id:** F14-apply-session-history-kind
    - **severity:** minor
    - **where:** §3.10 step 4; §1.1 (2f: 'No core file')
    - **problem:** `apply-session` is not a HistoryActionKind (core `actions.ts`), and `ExternalChangeSet.action` is typed by it. No sub-slice adds it. Adding it to core breaks the webview's tsc, because `labels.ts` `HISTORY_ACTION_LABEL` is an exhaustive Record. Runner `workspace/history.ts` reads any kind outside `HISTORY_ACTIONS` as 'manual'.
    - **fix:** Use 'accept-proposal' for Apply. Otherwise, 2a1 adds 'apply-session' together with the one-line entries in runner `workspace/history.ts` and webview `labels.ts`.
  - [15]
    - **id:** F15-completion-step-kind-undefined
    - **severity:** minor
    - **where:** §2.3 StepView.kind; §2.6 PersistedStep.kind; §3.8 completion; D2-56
    - **problem:** 'completion' is a step kind, but nothing defines its lifecycle:
- whether a completion is a PersistedStep, and what its state is;
- whether it counts as 'a step for T that ended' (ending forces, moving the reference step and `startHolds`, sealing);
- whether it appears as 'step i of n';
- what D2-56's 'Retry step (a Claude step for T)' puts into `retry`, of which kind and with which StepScope.
    - **fix:** Drop 'completion' from the kind unions: a completion is a SessionWrite, never a step. Define D2-56's Retry as a `submit` step for T with openProof, placed in `retry`.
  - [16]
    - **id:** F16-unlisted-residual-channels
    - **severity:** minor
    - **where:** §4.7 'Residual channels'; §3.3 step 3 ('only the step's duration differs')
    - **problem:** Two channels are not listed:
(a) Claude runs every step in one conversation and knows every outcome. Content of later steps that is visible at once can therefore differ with a hidden outcome. The statement phase of a statements-only step is an example: its turn says 'no proof'. The twin tests script both twins alike and cannot see this, so the A12 claim holds only for scripted twins.
(b) Hidden declarations occupy Lean names. A visible declaration in a later step that clashes with a hidden lemma, or that resolves to one inside the subject namespace, fails or changes meaning only in the twin that has the lemma. `planGhostAdoption`'s `taken` scan over all files also picks a different Lean name and card id.
    - **fix:** List (a) as an accepted residual and correct the A12 sentence. For (b), either list it as a residual, or:
- put proof-phase declarations under the target's statement namespace (`‹T›.…`), enforced as a new token;
- forbid statement-phase names there;
- make adoption's `taken` scan ignore hidden declarations.
  - [17]
    - **id:** F17-view-json-differs-on-hidden-reverts
    - **severity:** minor
    - **where:** §4.7 masked model (what buildSessionView strips); §2.3 SessionBoardView; §6.1 2c/2e non-interference tests
    - **problem:** When a decision breaks a hidden proof in only one twin, the judge reverts the Result and judges again there. In that twin, the converged masked graph has a different `semantic.checkedAt` (`facts.finishedAt`) and `TlGraph.version`. The intermediate state, in which a module failed and later modules show 'not checked', may also be published. The byte-identical tests fail on these fields, and the board can briefly show cards that were not checked.
    - **fix:** buildSessionView drops `semantic.checkedAt` and `detail`, and sets `version` from a counter bumped only by visible changes. The board is published only from a converged judgement; until then the previous board is kept, with `judging: true`.
  - [18]
    - **id:** F18-largest-core-sub-slices-lack-split-points
    - **severity:** minor
    - **where:** §1 (fallback splits) and §1.1 for 2b1 and 2c
    - **problem:** 2b1 is larger than 2a2 and has no fallback split. It holds:
- the refactor of the roughly 1,050-line `evaluate()` closure, with every gate suite green after each move;
- judgeState with B.1–B.4, step limits, G5 against S₀, new-axiom's five allowances, `rejected-repeat`, `stray-command` and `other-result`;
- `proposeArrowProblems`;
- tests for each.

2c has none either. It holds the mask, the build's mask option, buildSessionView for the whole SessionView, the protocol validators, host routing and the twin generator.
    - **fix:** Add split points:
- 2b1a: the helpers taken out of `evaluate()`, with evaluateRules unchanged; 2b1b: judgeState and the new rules.
- 2c1: the mask, the build option and `endorsementHash`; 2c2: buildSessionView, the protocol and the host.
  - [19]
    - **id:** F19-frozen-permitted-optional-breaks-test-typecheck
    - **severity:** nit
    - **where:** §1.1 2a1; §2.3 'RunView of a session'; §3.12
    - **problem:** 2a1 is core-only, but making `RunView.frozen.permitted` optional breaks the runner and extension test typechecks, because `tsconfig.test.json` includes tests. Three tests read `frozen?.permitted.selected`:
- `manager.happy.test.ts:118`;
- `m2flow.test.ts:235`;
- `e2e-runs.test.ts:439`.
    - **fix:** Keep the M2 field required. Leave `frozen` out of a session's RunView (no webview code reads it) and let `step` carry the statements-fixed state. Otherwise, 2a1 also updates those three reads.
  - [20]
    - **id:** F20-cascade-membership-must-read-shown
    - **severity:** minor
    - **where:** §4.7 status rule 1; §3.6 / D2-28 (the Reject cascade includes dependents 'in review, to be redone, or declined Shaky')
    - **problem:** Rule 1 is stated unconditionally, but the reducer's Reject cascade selects dependents by status. Shared cascade code that tests a hidden Result's recorded status leaks. Example:
- R_T is rejected while shown, then re-asked.
- If the re-ask proves T, it records a new version in review; if not, R_T stays declined.
- The user then rejects the new source's Formalize item, which is in cas.
- The cascade reaches R_T, and changes its `shown` status, only in the proved twin.
    - **fix:** State that every cascade test on a hidden Result reads `shown`, and that the recorded status follows. That covers membership, the revert flag, the confirmation listing, and the refusal for the running inference. Add a reducer test with that pair.
