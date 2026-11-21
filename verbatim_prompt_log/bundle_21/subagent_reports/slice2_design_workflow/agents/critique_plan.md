# critique:plan

Agent `a2443b6e54f0556d1` of workflow `wf_bd9a405e-4c7`. Verbatim output (JSON alongside).

- **summary:** Recap of the slices (★D8 (a)), which is what the user asked:
1. The new board, with Formalize for dependencies running on today's all-or-nothing review. Sub-slices 1a–1g; 1e and its fixer are logged in the slice-1 plan's §8.
2. The review list, which is the plan critiqued here:
   - 2a: the item model;
   - 2b: the checks;
   - 2c: meaning before proof, the session view and the protocol;
   - 2d: sessions and steps;
   - 2e: review actions;
   - 2f: Add premise and the end;
   - 2g: the review panel and session bar;
   - 2h: the Proposed view in a session, Formalize, Undo and retirement.
3. FROZEN, including arrows.
4. The transform window.
5. References.

Verdict: the plan covers every slice-2 clause in scope:
- ES-1–ES-9 as scoped;
- RV-1–RV-13;
- DO-0, DO-1, DO-3, with DO-2 shown disabled;
- EN-1–EN-4, UN-4–UN-6, CM-6;
- Appendix B's B.1–B.4 with E(T), plus the backstop.

Most contracts match the code I read: shadow and workspace, gate rules and types, protocol, run types, persist, the proposal service, and `modelWorkspace.applyChanges`. The adversarial pass still found 1 blocker, 14 major, 17 minor and 2 nit findings.

**Blocker.** During a step, accepting an Add premise (or taking it back to review) writes ws/ with an adopt commit and a completion. The step's rollback target comes before that commit, so a give-up or Cancel silently undoes the user's Accept. The step's own gate also judges telelean's write as Claude's change.

**Soundness (major):**
- Queued steps 2..n do not seal the session stack, so Undo reaches past a Claude step (UN-5, A28, §14.11).
- A hidden Result's status, rev, markers and the cascade lists follow outcome-dependent rules (cascades, the re-judge, reconcile). This shows the result before the meaning check, despite D2-7.
- pre(R_T) misses the statement and belief items reached through Claude's own arrows (E(T)) and through proof material.
- D2-42, and vocabulary added in a proof phase, change visible items before the reveal.
- One target's proof can use another target's lemma without an arrow, which leaks that target's hidden outcome and adds a dependency ES-2 forbids.
- A cancelled or unproved mid-stage re-Formalize can revert an accepted Result.
- No write order is set between shadow commits and run.json, so a crash between them can lose a decision and leave Apply disabled for the rest of the session.
- Non-declaration commands (`open`, `variable`, `attribute`, `#check`, …) belong to no item.
- Add premise drafts are never re-checked (RV-1).
- The Shaky rules contradict B.1's contributions.

**Implementability (major):**
- `StateJudgement`, buildSessionView's input, the reducer types, the item draft (the per-item output of `computeItems`), `ResultMask` and the engine's methods are undefined, although 2b and 2c are planned in parallel.
- ItemView declares `decline` twice, which does not compile.
- 2b is bigger than 2d, and running it beside 2c puts two builders on core's files in one tree.
- `applyChanges` refuses the sidecars Apply must write (`endorsements.json`, `layout.json`).

Each finding below gives concrete replacement text for the plan. Only reading tools were used: nothing was built, tested or run, and no file was written.
- **findings:**
  - [1]
    - **id:** S1-premise-accept-mid-step
    - **severity:** blocker
    - **where:** slice2-plan §3.6 'During a step (D2-3)' l.792-795; §3.8 Accept l.829-833; rollback target §2.6 l.600 and §3.4 'gave up' l.744; D2-3 l.1687; §5.13 step row
    - **problem:** §3.6 lets Accept and back-to-review take effect at once during a step 'since ws/ does not change'. Only the running inference's items are blocked. But accepting another inference's Add premise writes ws/: planGhostAdoption makes an `adopt` commit, and a completion (gate-proved, a Lean job, a `completion` commit) follows. Back to review, or Undo of an accepted premise, takes the card out again. Done mid-step, this has three effects:
(a) It changes Claude's working copy under it. G5 and the step limits compare with S₀, so telelean's write counts as Claude's failed attempt, and `writeFiles` races Claude's own edits.
(b) The rollback target lastCommitSince(S₀, [gate-pass, freeze, step-start]) comes before the adopt commit. A give-up, Cancel or failure therefore removes the card while its record still says accepted. Reconcile then reports 'disappeared, and no decision removed it', and Apply is disabled. This breaks ES-4 ('a rollback never undoes your decisions') and invariant D in §3.1.
(c) The completion's Lean job would run concurrently with the step's own Lean jobs.
    - **fix:** Replace §3.6's first 'During a step' bullet with: 'Accept and back to review take effect at once, except on Add premise items, and so does Show result: none of these changes ws/. Every decision that changes ws/ is recorded at once (status, cascade and stack) and queued in `pending`: Reject, plain decline, un-reject, Shaky, Accept or back-to-review of an Add premise, and any session Undo/Redo whose inverse changes ws/. It is carried out after the step ends (after its rollback). The completion runs then, and the item meanwhile reads "written when Claude's step ends".' Use the same wording in D2-3 and in §5.13's step row. Add two 2f tests:
- an Add premise accepted during step 2 is written after step 2 ends, and survives step 2's give-up, Cancel and failure;
- a completion never runs while a step's Lean job runs.
  - [2]
    - **id:** S2-no-seal-at-queued-step-start
    - **severity:** major
    - **where:** §2.2 SessionAction 'seal' l.289; §2.3 `sealed` l.347; §4.6 'Seals' l.1032; §5.12; §5.13 step row 'back to the seal'
    - **problem:** The stack is sealed only by Submit review, a mid-stage Formalize, Retry step and answering a question. In a several-target queue, steps 2..n start automatically, and their turn carries 'Decisions made while you worked'. Nothing seals at that point. So a Reject made during step 2 can still be undone after step 3 has acted on it. UN-5, A28 ('Undo stops at the step') and §14.11 ('Undo never reaches … back past a Claude step') forbid exactly this. The inverse merge may also hit content that a later step changed.
    - **fix:** Add `'step'` to the seal `by` union in §2.2 and §2.3. Add to §4.6: 'The start of every queued step after the first of its queue seals the stack: Claude is about to act on everything decided so far.' In §5.13, the step row's Undo becomes 'back to this step's seal (decisions made while it runs)'. Tests:
- 2a: the reducer handles a seal by step;
- 2e: a Reject made during step 2 cannot be undone once step 3 has started; one made during step 3 can be undone until step 4 starts.
  - [3]
    - **id:** S3-hidden-result-status-leak
    - **severity:** major
    - **where:** §3.6 cascades l.777-791; §3.5 reconcile l.758-771; §2.3 ItemView (`status`, `rev`, `markers`); ActionOutcome `review.cascade` / needs-confirmation l.487-491; §4.7; 2c non-interference test l.1071, l.1487
    - **problem:** D2-7 made a hidden Result's waiting list outcome-independent, but its status still follows outcome-dependent rules:
- The Reject and DO-0 cascades follow real RV-5 edges. For example, Result(T) → Formalize(P) exists only if the proof uses P.holds.
- 'A judged inference that fails B.1/B.2/footprint becomes to be redone (reverted)' can fire only when there is a proof.
- Reconcile's 'verdict, rests on or dependencies changed → rev+1, "updated"' fires on outcome changes.

The hidden Result's ItemView still carries `status`, `rev` and `markers`, and the needs-confirmation and cascade lists (and Undo labels) can name it. So rejecting one source's Formalize, while other waiting items are still undecided, turns the hidden Result 'to be redone' only when the proof used that source. The user learns the outcome before judging the meaning (RV-6, S7). The same rules can also deadlock Submit: a hidden Result stays 'in review' while a waiting item is 'to be redone', and only Show result releases it. The 2c test compares one static pair of states, so it cannot catch this.
    - **fix:** Add 'Status of a hidden Result' to §4.7:
1. Cascades treat a hidden Result as depending on exactly pre(R). Any decline, Shaky or to-be-redone of a pre item makes it to be redone, and reverts it, whether or not the proof used that item.
2. Judge- and reconcile-driven changes to a hidden Result are recorded but not shown (B.1/B.2/footprint failures, verdict or rests-on changes, 'no longer builds'). Its view keeps rev 0, the status from rule 1, and only the 'seen-early' marker. The recorded changes apply, marked 'updated', when it is revealed.
3. Hidden Results never appear in cascade lists, in `left`, in events or in Undo labels.

Extend the 2c and 2e tests: for generated proved/not-proved twins, every sequence of decisions (Accept, Reject, Shaky, DO-0, Undo) yields byte-identical SessionView and ActionOutcome JSON until a reveal.
  - [4]
    - **id:** S4-preset-misses-dependencies
    - **severity:** major
    - **where:** §4.7 'What a hidden Result waits for (D2-7)' l.1037-1040; D2-7 l.1691; D2-21 l.1705
    - **problem:** RV-6 keeps a Result neutral until every statement and belief item it depends on is decided. pre(R_T) covers only the statement items of T and Q(T)'s sources, and the belief items in their meaning closure. It misses two kinds:
(a) The Formalize item of a source of Claude's own arrow E(T). D2-21 only requires that source to have a `.holds`, which an AXIOM card formalised earlier in the session has, even while its Formalize item (a belief) is still in review.
(b) Belief items that the proof reaches but no statement in the closure does, such as a definition in another card's R_stmt used through a lemma.

So 'proved' can appear while the formalisation it rests on is still undecided: the automation bias D-19 exists to prevent.
    - **fix:** Replace the second bullet of pre(R_T) with an outcome-independent superset: 'every visible statement item and every visible belief item whose origin step is T's step or an earlier one (they exist before T's outcome, or come from T's statement phase)'. Keep the Results bullet. Test in 2a (reveal): a Result proved through Claude's arrow from an axiom formalised in step 1 stays hidden until that Formalize item is decided, and the waiting lists still match for proved/not-proved twins.
  - [5]
    - **id:** S5-d242-and-proof-phase-vocab-leak
    - **severity:** major
    - **where:** §4.1 statementReach l.927-930; D2-42 l.1726; §4.2 vocab ownership l.945
    - **problem:** (a) D2-42 puts the statements of Add premise drafts, which are hidden with their Result, into R_stmt. R_stmt also classifies visible items. So a definition that only a hidden draft reaches turns into a belief, and its `usedByStatementsOf` changes, before the reveal. That tells the user a premise was proposed, which suggests the target was not proved.
(b) §4.2 makes every shape-passing term a `vocab:<name>` item whatever its phase. A `noncomputable opaque` added in the proof phase is allowed, since new-axiom bars only axioms after the freeze. It shows at once as a visible Vocabulary item whose existence depends on the hidden outcome.

Both contradict the plan's own non-interference requirement.
    - **fix:** §4.1: 'R_stmt for the classes of visible items counts only revealed drafts. At each reveal, classes are recomputed, and D2-23 then returns any group-accepted item whose badge grew.' §4.2: 'Any declaration created in a proof phase that no statement reaches, vocabulary included, is proof material of proof:<T>.' Update D2-42's text. Make the 2c twin generator include one twin with a premise draft that reaches a definition, and one with a proof-phase opaque.
  - [6]
    - **id:** S6-cross-inference-proof-material
    - **severity:** major
    - **where:** §4.9 'Per inference' l.1126-1133; §4.5 edge 1; §4.7 pre-set; spec ES-2 ('a target may use another target only through a selected arrow')
    - **problem:** Nothing stops T2's proof from using a lemma that T1's step created (proof material of Result(T1)) when T1 is not among the sources of Q(T2) ∪ E(T2). B.2's walk passes through the lemma, because it belongs to no card, and checks only the cards it reaches. RV-5 then makes Result(T2) depend on Result(T1), which is not in pre(R_T2). As a result:
- R_T2 can be revealed while R_T1 is still hidden;
- R_T2's proof text names T1's hidden lemma;
- R_T2's Accept says 'waits for a result that is not shown yet', which reveals T1's outcome;
- T2 depends on T1 without an arrow, contrary to ES-2.
    - **fix:** Add to §4.9 'Per inference': 'T's proof, and the proof material of T's step, may mention proof material owned by Result(u) only if u is among the sources of Q(T) ∪ E(T). Otherwise the finding is `undeclared-premise` with token `other-result`: "‹lemma› belongs to the proof of “‹u›”, which is not a premise of “‹T›”: prove what you need here."' Add a cheat scenario to §6.2 and a core gate test.
  - [7]
    - **id:** S7-midstage-reask-loses-accepted-result
    - **severity:** major
    - **where:** §3.2 'During a stage (RV-9)' l.710-715; §3.4 table; §3.6 'A judged state that does not build' l.788-791
    - **problem:** A mid-stage Formalize replaces a target's question when it is requested, and updates its Result in place. Afterwards the new step may:
- be cancelled or fail (back to S₀);
- give up;
- end not proved (T.holds must stay as it was at S₀).

In each case the old proof, possibly accepted, is re-judged against the new question. If the new question drops a source the old proof uses, B.2 fails, and §3.6 makes the Result to be redone and reverts it. A cancelled step thus destroys an accepted decision, against ES-4: 'a rollback never undoes your decisions'.
    - **fix:** §3.2: 'A re-asked target keeps its old question and Result until the new step passes with a proof; then the question is replaced and the Result gets its new version. If the new step is cancelled, fails, gives up or ends without a proof, the old question and Result stand, and the stage report says "The new question for “T” was not proved: your earlier result stands."' Log it as D2-46, and add a 2d test (cancel, and not proved, after re-asking with fewer arrows).
  - [8]
    - **id:** S8-crash-consistency
    - **severity:** major
    - **where:** §2.6 Persistence; §3.6; §3.8; §3.11 recover()
    - **problem:** Each decision, adoption, ledger arrow and reconcile changes two stores, a shadow commit and run.json, and the plan sets no order between them. RunFiles writes run.json atomically, but not together with the commit. A reload in between leaves records that disagree with ws/:
- a Reject that was committed but not recorded is reported by reconcile as 'disappeared, and no decision removed it', and Apply stays disabled for the rest of the session;
- a ledger arrow that was written but not recorded makes every later G5 check fail.

The user's decision is lost and the session cannot reach Apply.
    - **fix:** Add to §2.6: 'PersistedSession.head (the shadow commit the records describe) and inFlight?: {action, parent}. Order: (1) write inFlight to run.json, atomically; (2) write the files; (3) commit; (4) write the new records, with head updated and inFlight cleared, atomically. On recover(), if HEAD ≠ head, revert ws/ to head (a `revert` commit) and re-run inFlight, which is idempotent. Ledger entries are recorded before the normalise that writes them.' Add 2d and 2e tests that inject a crash after each of the four writes and check the session recovers with the decision either fully done or redone.
  - [9]
    - **id:** I1-non-declaration-commands
    - **severity:** major
    - **where:** §4.2 computeItems l.932-956; §4.3 content keys l.958-966; §4.11 planItemRevert l.1169-1177; §4.9 global rules
    - **problem:** Ownership, content keys and revert are defined over declarations and block fields only. G0's denylist (core/src/gate/g0.ts) allows the following in Claude's own file text; only ghost text bans them:
- `open`, `variable`, `export`, `universe`, `omit`, `include`;
- `attribute [simp|instance] …`;
- `#check` and `#print`;
- `section` and `namespace` … `end`.

The parser treats these lines as commands, not declarations, so they belong to no item. Two failure modes follow:
- A Reject that removes a lemma leaves `attribute [simp] lemma` (or `#print lemma`) behind. The build fails on a line no item owns, the 'no longer builds' mapping finds no item, and the session is left with only Exit.
- If ownership ignores these lines, they reach F unreviewed, and `attribute [instance]` changes how later declarations elaborate.
    - **fix:** §4.9, a global rule for every session purpose: 'A new top-level command that is not a declaration, docstring or comment is refused (token `stray-command`). The exception is `namespace`/`section`/`end` lines that enclose only new declarations of the same step. `open … in` and attributes written on a declaration are part of its text, and so of its content key.' §4.2: '"every difference" includes text outside declarations; such text is unowned.' §4.11: 'A revert also removes the namespace/section lines its declarations needed.' Add a cheat scenario to §6.2.
  - [10]
    - **id:** I2-missing-shared-contracts
    - **severity:** major
    - **where:** §2.7 `judgeState(): StateJudgement` l.643; §2.3 'built only by buildSessionView'; §4.6 `reduceReview(state, action, at)`; §4.2 'Each draft carries'; §4.7 `resultMask`; §1.1 2b engine 'judge, finalCheck, complete'
    - **problem:** Several types cross sub-slice boundaries but are only named, never defined:
- `StateJudgement` (produced by 2b; consumed by 2c's buildSessionView and by 2d–2f);
- buildSessionView's input;
- the reducer's state, action and outcome types;
- the item draft that computeItems produces;
- `ResultMask`;
- the engine's judge, finalCheck and complete signatures, and `CheckContext.session`.

2b and 2c are planned in parallel, so each builder would invent its own shape, although §0 says builders implement §2 as written.
    - **fix:** Add a §2.9 with the TypeScript for:
- StateJudgement { commit, filesKey, ok, global: GateFinding[], inferences: Record<target, { passes, verdict, footprint, direct, throughResults, permitted, findings, band, missing, notNeeded }>, drafts: ItemDraft[], classes: Record<key, ItemClass>, deps: Record<key, string[]>, problems };
- ItemDraft { key, kind, declKind?, provides, mentions, partOfResult, contentKey, content };
- ReviewState, ReviewAction and ReviewOutcome (outcome: statuses, cascade, left, needsConfirmation, revert keys, stack entry);
- ResultMask { holds, drop, dropArrows, dropNodes };
- SessionViewInput { persisted, judgement, masked, base, startFacts };
- LeanCheckEngine.judge(ctx, purpose), finalCheck(ctx) and complete(ctx, premise), with CheckContext.session { inferences, ledger, items, rejectedArrows, scope?, stepStart? }.
  - [11]
    - **id:** I3-itemview-duplicate-decline
    - **severity:** major
    - **where:** §2.3 ItemView, l.391 (`decline?: { option; note? }`) and l.401 (`decline: Gate & { options … }`)
    - **problem:** ItemView declares `decline` twice with different types. TypeScript rejects this ('Subsequent property declarations must have the same type'), and the 2c builder is told to implement the contract as written.
    - **fix:** Rename the two fields: `declined?: { option: DeclineOption; note?: string }` for the current decline, and keep `decline: Gate & { options … }` for the action (or call it `declineGate`). Apply the same rename in 2g's fixtures.
  - [12]
    - **id:** I4-2b-size-and-parallel-core
    - **severity:** major
    - **where:** §1 table (2b; 2c 'may run beside 2b') l.66-75; §1.1 2b l.96-105
    - **problem:** 2b is larger than 2d. It contains:
- the typeConsts probe, with real Lean and RSS measurement;
- turning `evaluate()`, one 1,161-line closure, into judgeState for N inferences, with step limits, B.1–B.4, rejected-repeat and the new tokens;
- the backstop;
- planItemRevert, which needs to restore B's text of a theorem, an operation core's EditSession LeanOps do not offer;
- formalizeStartProblems and formalizeOrder;
- the new shadow commit kinds;
- the engine's judge, finalCheck, complete, re-exported challenge and the ghost check with E(T);
- planApply.

One agent is unlikely to finish all of it. Running 2c beside it also puts two builders in one tree editing core (src/index.ts exports, fixtures, project/build) and running core's tsc and vitest over each other's half-written files.
    - **fix:** Split 2b into:
- 2b1: the probe; core judgeState, the rules and B.1–B.4; formalizeStartProblems and formalizeOrder; evaluateRules kept green.
- 2b2: the backstop; revert, with a new `replace-decl` LeanOp; the runner engine; the shadow commit kinds; planApply.

State the refactor strategy: first extract per-rule helpers from `evaluate()` with evaluateRules' suites green, then build judgeState on them. Have 2a create core/src/review/index.ts and every export line, with `notImplemented` stubs for 2b's and 2c's functions. Run 2c after 2b1, or let it touch only files 2b never touches, with index edits made by the integrator.
  - [13]
    - **id:** C1-premise-drafts-recheck
    - **severity:** major
    - **where:** §3.8 'Proposing' l.823-828; §3.5 reconcile; §4.2
    - **problem:** RV-1 says the Add premise's scratch check 're-checks whenever something it relies on changes', including B.2. The plan checks a draft once, at propose_assumption, and never again; D2-42 even reuses those scratch facts. A draft may stop elaborating, or stop closing the gap, after:
- a source's Formalize is rejected;
- a definition is reverted;
- an arrow is declined.

It stays acceptable all the same, and accepting it writes a card that breaks the build or a completion that fails. Also, drafts live outside ws/, so computeItems (B → ws/) never sees them. How premise items are created, keyed, reconciled across stages and withdrawn is not specified.
    - **fix:** Add to §3.8: 'After every judged state, each premise draft whose footprint, statement closure or target statement changed is re-checked in the scratch file, under the same rules (E(T) and B.2 included). If it no longer closes the gap, it becomes to be redone ("no longer closes the gap"), and its scratch facts are replaced.' Add a step to §3.5: 'Premise items are reconciled from PersistedSession.premises by the key premise:<T>:<leanName>, like computeItems' drafts.'
  - [14]
    - **id:** C2-shaky-vs-contrib
    - **severity:** major
    - **where:** §3.6 'Shaky' l.782 and 'A judged state that does not build' l.788-791; §4.8 contrib reasons l.1085
    - **problem:** Shaky 'takes nothing out' and makes dependents to be redone without revert. But B.1 gives a declined (Shaky) or to-be-redone source no contribution. So every inference resting on a Shaky source's session proof fails its footprint at the next judge, and §3.6 then makes its Result to be redone with a revert. The two rules contradict each other, so a builder cannot satisfy both. The user would see a Shaky decline remove proofs two levels down.
    - **fix:** Choose one rule and write it down:
- either 'contrib(u) for a source whose Result is Shaky, or to be redone without revert, is its judged footprint; dependents are to be redone without revert, and the judge never reverts an item that is already to be redone because of an upstream Shaky';
- or 'Shaky on a source's Result reverts its dependents' Results', and update D2-28's text and the decline menu's description to say so.
  - [15]
    - **id:** I5-apply-sidecars
    - **severity:** major
    - **where:** §2.6 Sidecars l.604; §3.10 step 4 l.868-874; §1.1 2f file list l.127-135
    - **problem:** Apply must put `endorsements.json` and the moved cards' `layout.json` positions into the same history entry and Undo step. But `ModelWorkspace.applyChanges` refuses any file that is not a model file (runner/src/workspace/modelWorkspace.ts, around line 949: '… is not a model file, and Accept changes only model files'). `isSubjectSidecarFile` covers only layout.json and attic/. ExternalChangeSet is a frozen M2 contract, and 2f's file list names neither modelWorkspace.ts nor workspace/types.ts.
    - **fix:** Add to §2.6: 'ExternalChangeSet.changes may include the subject's sidecars layout.json and endorsements.json; applyChanges accepts exactly those two besides model files. isSubjectSidecarFile adds endorsements.json.' Add runner workspace/modelWorkspace.ts and workspace/types.ts to 2f's files, with a test that Undo of an Apply removes the endorsements and restores the positions.
  - [16]
    - **id:** S9-interrupted-no-cancel
    - **severity:** minor
    - **where:** §5.13 'interrupted' row l.1401; §3.11; §2.5 cancel
    - **problem:** An interrupted step offers only Resume or Exit. A user who does not want to spend quota on resuming must Exit and lose every decision. ES-4's Cancel step should also apply here.
    - **fix:** Change the interrupted row to 'Resume, Cancel step, Exit'. Add to §2.5: 'cancel(runId) on an interrupted step ends it cancelled: back to S₀, pending decisions carried out, Retry step offered.'
  - [17]
    - **id:** S10-single-item-group-own-accept
    - **severity:** minor
    - **where:** §2.2 ItemDecision comment l.291; D2-32 l.1716
    - **problem:** Under D2-32, a group action that happens to carry one item counts as that item's own Accept. Examples are 'Select all in review' → 'Accept 1', or a one-item Context Menu selection. Either can own-Accept an RV-7 item the user never opened, which weakens §14.5's 'individual Accept'.
    - **fix:** Add `own: boolean` to decideItems. Only the detail's Accept and Accept & next, and the A key on the current item, send `own: true`; group actions never do, whatever their size (D2-32's alternative). The reducer accepts an RV-7 item only with `own`.
  - [18]
    - **id:** C3-backstop-ledger-and-result-basis
    - **severity:** minor
    - **where:** §4.10 `unowned` l.1150 and `content-changed` l.1158; §3.10 'items' l.861
    - **problem:** (a) 'Ownership is re-derived … independently of the session's records' cannot hold. §4.2 needs the ledger (`created`, `arrow`, `premise`, `mark-removed`, `completion`) to attribute proof material and telelean's own writes, so a re-derivation without the ledger would refuse every Apply.
(b) The accepted record holds only a content key, which leaves out a Result's verdict and footprint. If a source changes and reconcile misses it, F can apply a Result whose 'rests on' differs from what the user accepted. The backstop is meant to stand alone but would not see this.
    - **fix:** (a) Reword to: 're-derived from B, F and the ledger (telelean's own record, outside ws/), independently of the item records'.
(b) Give ItemRecord.accepted `verdict` and `restsOn` for Results, and make `content-changed` compare them as well.
  - [19]
    - **id:** C4-b4-statement-abbrevs
    - **severity:** minor
    - **where:** §4.4 b4 l.973-975; §4.10 `own-accept` l.1152-1157
    - **problem:** b4 and the backstop's own-accept name every abbrev or definition 'in R_stmt'. Each card's statement abbrev is itself an abbrev in R_stmt. Read literally, every Formalize item becomes a belief, and every group-accepted Formalize is refused at Apply. That contradicts §4.4's own 'Not RV-7: … Formalize of a proposition'.
    - **fix:** Add to both b4 and own-accept: 'excluding the cards' statement abbrevs and their docstring mirrors (statement items are classed by b2 and c1–c3)'.
  - [20]
    - **id:** C5-back-to-review-seal
    - **severity:** minor
    - **where:** §3.10 step 3 l.863-867; §3.7 l.806
    - **problem:** A Submit that goes straight to the end confirmation feeds no Claude step, yet it seals the stack, and Back to review keeps the seal. The user can then no longer undo their last decisions before Submit, although Claude never acted. EN-2 says Back to review returns 'with nothing changed'.
    - **fix:** Write: 'Submit seals only when it queues Claude steps. Back to review leaves the stack as it was before Submit.'
  - [21]
    - **id:** C6-queue-vs-retry
    - **severity:** minor
    - **where:** §2.6 `queue` comment l.553-554; §3.4 table; §3.7 'Enabled' l.805; D2-44
    - **problem:** After a Cancel or failure, the rest of the queue 'is kept for Retry', but `queue` is described as 'step ids still to run; Retry step puts them back'. If those ids stay in `queue`, Submit review and mid-stage Formalize ('no step … queued') stay disabled unless the user retries. That contradicts D2-44, under which Submit drops inferences that never ran.
    - **fix:** Write: 'On Cancel or failure, `queue` is emptied, and the cancelled step and the rest move to `retry: string[]`. Retry moves them back. Submit and a mid-stage Formalize drop `retry` (D2-44).'
  - [22]
    - **id:** C7-decisions-told-when
    - **severity:** minor
    - **where:** §2.8 Turns l.672-674; §3.3 step 4
    - **problem:** 'Decisions made during a step reach Claude in its next turn' is ambiguous: a step has several user turns, including gate retries. If a retry turn mentions a Reject that is only pending, the rejected content is still in ws/ and fixed by the step limits. Claude may then try to edit it, and the gate refuses that as `existing-changed`.
    - **fix:** Write: '… in the first turn of the next step, after they are carried out; never in the retry turns of the step during which they were made.'
  - [23]
    - **id:** C8-cascade-scope-and-wording
    - **severity:** minor
    - **where:** §3.6 Reject l.777-781 and 'Accepted dependents' l.783; §4.6
    - **problem:** The cascade lists only dependents that are in review or to be redone. Shaky-declined dependents keep content whose dependency is gone, so they fail the next build and are reverted by the 'no longer builds' rule instead. Also, the confirmation announces that accepted dependents 'return to review', but D2-28 then takes them out as to be redone.
    - **fix:** Include Shaky dependents in the cascade, as to be redone and reverted. Change the confirmation text to: 'These accepted items lose their Accept and are taken out to be redone: …'.
  - [24]
    - **id:** I6-transition-tests
    - **severity:** minor
    - **where:** §1.1 2d l.113-120; §6.1 2d l.1515
    - **problem:** From 2d on, every start is a session. The existing manager, extension and e2e tests of Accept, Feedback and ghosts then fail until 2e or 2f rewrites them or 2h deletes them. 'Unit tests of every package it touched passing' cannot be met unless the plan says how these tests are handled.
    - **fix:** Write: '2d marks each such test `it.skip` with "moves to 2e/2f/2h: ‹name›" and lists them in its report. The integrator checks the list is empty at the slice end.'
  - [25]
    - **id:** I7-render-and-message-cost
    - **severity:** minor
    - **where:** §2.3 LeanStatementView; §2.4 `session` 'posted on ready and on every change' l.495; §3.12
    - **problem:** Every statement item needs Lean's pretty and fully explicit renderings, which take a scratch Lean job each. The plan never says when they run (after each step? after each judge?) or how they are cached. Also, `session`, which carries the whole TlGraph, is posted 'on every change'; during a step that includes every progress tick.
    - **fix:** Write: 'Renderings run after each step and each judge, for statement items whose content key is new, and are cached by content key. `session` is posted when the session itself changes (items, statuses, phase, reveals, drift, confirmation). Progress ticks go through `run` only.'
  - [26]
    - **id:** I8-run-json-v2-guard
    - **severity:** minor
    - **where:** §2.6 'run.json version 2' l.544
    - **problem:** `isPersistedRun` (runner/src/run/persist.ts, line 46) accepts only version 1, so a version-2 run.json would be dropped silently on recovery. In addition, the decisions log's way to undo the slices (`git apply -R`) would leave version-2 runs that the older build ignores, and may later prune.
    - **fix:** Write: 'isPersistedRun accepts versions 1 and 2', and add a 2d test. Note in slice 2's AP entry that reversing slice 2 leaves open sessions unrecoverable, so they should be Exited first.
  - [27]
    - **id:** C9-rv9-shaky-frozen
    - **severity:** minor
    - **where:** §3.2 'During a stage (RV-9)' l.710-715
    - **problem:** RV-9 says that 'cards you declined with Transform or Shaky count as frozen' for a mid-stage Formalize, and the plan never mentions it. Statements are already fixed by the step limits, but a re-asked target whose Result is Shaky gets openProof, so its proof can be reworked outside Submit review.
    - **fix:** Add a check to §4.12: 'A mid-stage Formalize of a target whose Result is Shaky is refused: "Claude reworks Shaky items at Submit review."' Alternatively, set openProof to false in that case. Log the choice.
  - [28]
    - **id:** C10-activity-reveal-record
    - **severity:** minor
    - **where:** §2.4 revealResult `step` l.508; D2-10; §2.2 ItemRecord.reveal
    - **problem:** Showing a running step's activity counts as Show result, but that step's Result item does not exist yet. The plan does not say where the forced reveal is recorded, so that the Result is created already revealed and marked 'seen early'.
    - **fix:** Add `PersistedStep.reveal?: { at, alsoReveal }`. Reconcile copies it to the step's Result, as a forced reveal with seenEarly set.
  - [29]
    - **id:** C11-failed-completion
    - **severity:** minor
    - **where:** §3.8 'Completion' l.835-839
    - **problem:** A failed completion leaves `theorem T.holds := …` in ws/. The stage then sits on a state that did not pass, although §3.1 expects the head of ws/ to be a judged passing state, and later judges keep failing on it.
    - **fix:** Write: 'On failure the completion is taken back out (revert to the adopt commit). The premise stays accepted, and the Result is marked "completion not checked", with Lean's message.'
  - [30]
    - **id:** C12-start-check-declined-source
    - **severity:** minor
    - **where:** §4.12 formalizeStartProblems l.1180-1189
    - **problem:** A mid-stage Formalize may select a source whose Result is Shaky, to be redone or rejected. B.1 gives such a source no contribution, so the step is bound to fail and only spends quota.
    - **fix:** Add check 4b, after the hidden-source check so it never reveals a hidden outcome: 'In a session, a source whose Result is neither accepted nor in review: "“‹L›”'s result is declined: decide it again, or select the arrows into “‹L›” too."'
  - [31]
    - **id:** I9-v1-conversion
    - **severity:** minor
    - **where:** §3.11 'A v1 run in review is converted' l.890-895; D2-16
    - **problem:** Version-1 runs have no ledger, so ownership of proof material (ledger `created` with its phase) and of adopted ghosts' arrows (`premise`, `mark-removed`) is missing. Their facts also lack the typeConsts that Apply needs. A literal conversion therefore makes everything unowned and refuses Apply.
    - **fix:** Write: 'The conversion writes ledger entries from the v1 run: `created` for every declaration new since B (its phase taken from the v1 freeze commit), and `premise`/`mark-removed` for adopted ghosts. It re-checks pending ghosts as drafts (with E(T) and B.2), and forces a fresh judge so the facts gain typeConsts.'
  - [32]
    - **id:** C13-2c-host-files
    - **severity:** minor
    - **where:** §1.1 2c l.107-111; §2.4; extension/src/logic/runs.ts busyRefusal
    - **problem:** Adding the new webview → host messages to the protocol's union affects the host's message handling, and the planned `not-yet` answer is host code, yet 2c lists no extension file. Separately, the host's `busyRefusal` refuses any start while a run is active, which would also block a mid-stage `formalize`.
    - **fix:** Add extension/src/logic/boardSession.ts and runs.ts to 2c's files, for the not-yet answers. Note in 2d that a `formalize` carrying runId and stage bypasses busyRefusal.
  - [33]
    - **id:** N1-stale-token-and-invariant
    - **severity:** nit
    - **where:** §2.7 new tokens l.656; §3.1 working copy invariant l.691-694
    - **problem:** `status-mismatch` already has the tokens `changed` and `removed`: the slice-1e fixer added them (core/src/gate/rules.ts, around line 511). Separately, the working-copy invariant puts 'every item that is in review' in ws/, but Add premise drafts stay outside ws/ until accepted.
    - **fix:** Drop '+ removed' from the list of new tokens. Change the invariant to read '… in review (Add premise drafts excepted) …'.
  - [34]
    - **id:** N2-validators-and-scc
    - **severity:** nit
    - **where:** §2.4 decideItems l.507; §2.5 sessionDiff l.535; §3.7; §4.5 SCC rule
    - **problem:** Three small gaps:
- The validator rule 'option only with declined' does not require an option, so a decline without one is ambiguous for non-arrow items.
- sessionDiff's `{ ok: true; files }` cannot be told apart from ActionOutcome's ok variant by `ok` alone.
- A partly accepted, partly rejected SCC (a group of mutually dependent items) passes Submit and fails only at the final check (`scc`).
    - **fix:** Require `option` with `declined`. Return `{ ok: true; kind: 'diff'; files }`. Add to Submit's gate: 'Accept or reject all of ‹items› together.'
