# find:build

Agent `ac18988a2b2dec9fe` of workflow `wf_84d1f5cb-1a7`. Verbatim output (JSON alongside).

- **summary:** I checked the slice-3 plan against four sources: slice 2's final contracts (§2, §2.9, the §8 builder and fixer entries); the core code built so far (review/types.ts, records.ts, reconcile.ts, items.ts, gate/types.ts, gate/permitted.ts, gate/describe.ts, actions.ts, edit/, protocol.ts, paths.ts); the slice-1 runner, host and webview code it extends (modelWorkspace.ts, sidecars.ts, undo.ts, history.ts, persist.ts, shadow/index.ts, boardSession.ts, runs.ts, actionMapping.ts, labels.ts, store.ts); and the round-1 and round-2 critiques and fixes.

**Round-2 fixes that hold for implementability:** R2-1, R2-2, R2-3, R2-6, R2-7, R2-10, R2-11(2), R2-12, R2-13 and R2-15. Their names fit the built code: decisionKey picks its fields by name; pruneRunDirs has `protect`; RunFiles is the chain to change; reconcile deep-clones records, so `frozen` survives.

**Round-2 fixes that do not fully hold:**
- R2-5 (heldAtJudge) adds a new defect: the map that feeds heldAtJudge is filled before reconcile creates the records (IMP-1). It also leaves direct core callers outside the "required type" net (IMP-16).
- R2-14 and R2-11(1) cannot be built in the reducer with the given ReviewAction (IMP-5).

**New problems, by severity:**
- **Blocker (IMP-2).** From 3b on, Accept freezes Add premises, but the slice-2 premise write still rewrites only `fingerprint`, not `frozen.fingerprint`. Every accepted, written premise then becomes a `frozen (accepted)` problem, slice 2's 2f suite fails, and 3b may not touch runner source.
- **Major (5):**
  - `PlanContext.freezes` either breaks the runner's compile at 3a, or is optional and lets a plan overwrite freezes.json from an empty list.
  - The protocol additions in 3b have no host owner: compile risk in `dispatchRun`, `setFreezes` is never answered, and the `not-yet` answers the plan promises have no owner.
  - Undo and Redo of freeze actions lack inputs (Redo's values, queue targets).
  - D3-38's whole-model arrows into non-targets still fail B.3 `not-target`, and the built computeItems marks every ledger arrow as part of its target's Result, so such an item would be hidden as part of a Result that does not exist.
  - The new-item `heldAtJudge` deadlock (IMP-1).
- **Minor and nit:**
  - Contract gaps: the banner's `mode` cannot be computed from SessionRecords, and a re-ask's options are undefined; required view fields at 3a; the S₀ ledger; a `rev` missing on freeze actions; freeze payloads cannot pass through `perform`.
  - snapshotOf never records meaningKey, so `statement-changed` silently skips the meaning comparison.
  - Assignment gaps: FZ-12's core texts; the Exit board step's route, which would snapshot; the gate on regenerated recordings; ownership of cheats.test.ts.
  - Naming nits.
- **findings:**
  - [1]
    - **id:** IMP-2
    - **severity:** blocker
    - **where:** §0 'Slice 2 stays green' and '3b may update runner test fixtures, never runner source'; §3.7 Accept (frozen.fingerprint = the record's fingerprint) and 'A written premise's step 4 also sets frozen.fingerprint…'; §3.4 step 1; §1.1 3d's file list (no run/premises.ts); slice 2 §3.8 (step 4 rewrites fingerprint and accepted.fingerprint) and 2f's test 'an accepted premise stays accepted after its write and its completion, and Apply passes the backstop's content-changed'
    - **problem:** From 3b on, the reducer's Accept of an Add premise sets frozen.fingerprint to the draft key. The slice-2 premise write (runner, unchanged until 3d) then sets `fingerprint` and `accepted.fingerprint` to the written key, but not `frozen`. Once written, the premise item is computed from ws/ with the written content key, so §3.4 step 1 reports `frozen (accepted)` at every stage judgement and refuses at `final` and in the backstop. 3b may not edit runner source, and AP-27 runs the full runner suite after every sub-slice. So 3b cannot end green, and the suite stays red until 3d.
    - **scenario:** Runner 2f suite after 3b: Accept premise P as an axiom → premise write → completion → judge-apply. The stage gets the problem '“P” is frozen, but the working copy differs from its frozen version'. Apply is disabled and the final check fails. The 2f test above fails.
    - **fix:** Either (a) list one runner exception for 3b in §0, next to 3a's stopgaps: the premise write's step 4 also copies the written key into `frozen.fingerprint` and that write's freezeAtAccept entry into `frozen.held` when the record has `frozen`. Name run/premises.ts in 3b, and in 3d's list for the held part. Or (b) amend §3.4 step 1: for an accepted add-premise record with a ledger `premise` entry, compare with `accepted.fingerprint`, which the write's step 4 sets. Either way, state that 3b runs the 2f premise suite.
  - [2]
    - **id:** IMP-1
    - **severity:** major
    - **where:** §2.3 StateJudgement.freezeAtAccept ('For every item in review or accepted'); §3.5 bullet 'freezeAtAccept is filled for every item in review or accepted…; reconcile copies an item in review's entry'; §3.7 / D3-51 (Accept refused without heldAtJudge); slice 2 §3.5 step 2 ('a new key: a new record, in review' is created by reconcile, after judgeState)
    - **problem:** judgeState runs before reconcile and sees only the previous records (JudgeInput.items). Several items are therefore not 'in review or accepted' when judgeState fills the map:
- a draft with no record yet, which covers every item of a queue that just ended;
- a record that reconcile is about to return to review (Submit-step rework, D2-23);
- an unwritten Add premise, whose declarations are not in `current`.

Reconcile has nothing to copy for them, so their Accept is refused with 'has not been checked yet: wait for the check to finish', although no check runs or is due.
    - **scenario:** A session starts and the first queue ends. The queue-end judge runs on empty records, so freezeAtAccept is {}. Reconcile creates 6 records in review without heldAtJudge. The person presses Accept on a Formalize item and it is refused. No judge starts until some other decision (Reject, Shaky) triggers one, so stage 1 cannot be accepted directly.
    - **fix:** §2.3/§3.5: 'freezeAtAccept holds an entry for every draft of the judgement (every item key computeItems produced), whatever its record's status or whether it has one. An unwritten Add premise's entry is the held map of the names its statement reaches in `current`; the premise write's step 4 replaces frozen.held.' Reconcile copies the entry into heldAtJudge for every record it leaves in review, new ones included. Add 3b tests: a record created by a queue-end reconcile can be accepted without another judge; so can an unwritten premise draft.
  - [3]
    - **id:** IMP-3
    - **severity:** major
    - **where:** §2.6 '`PlanContext` gains `freezes: Record<string, StandingRecord[]>`' (types in 3a; not optional); §0's optional-field list (it is absent); §1.1 3a's runner allowances; §2.6 EditPlan.freezes ('The subject's new freezes.json records'); D3-44 edit-node; A6 drops; core edit/planAction.ts `planEditNode(model, action)` (no ctx); runner workspace/modelWorkspace.ts planContext()
    - **problem:** PlanContext is built in runner src (ModelWorkspace.planContext()), which 3a and 3b may not edit. Made required, as written, the runner fails tsc at 3a. Made optional and left absent, which is the case until 3d, three plans are computed from `[]`: planFreeze, edit-node's D3-44 record and A6's drops. Because EditPlan.freezes carries the whole new file, materialisePlan would then write freezes.json with only the new records, and every other standing freeze is silently removed (FZ-6).
    - **scenario:** Any caller that builds PlanContext without `freezes` (a test helper, a later path) performs edit-node on a subject with 200 standing freezes. freezes.json becomes the single new record and the 200 freezes are gone, with no Unfreeze and no notice.
    - **fix:** Make EditPlan.freezes a delta `{ subject; add: StandingRecord[]; remove: FreezeKey[] }` that materialisePlan merges into freezes.json as it reads it at write time (as planApply merges), so a stale or absent context can never drop records. In addition:
- add `PlanContext.freezes?` to §0's optional list for 3a and 3b;
- planAction refuses set-freezes with `internal` ('telelean could not read the freezes: reload the window') when it is absent;
- 3d makes it required, so tsc finds planContext().

Name the `planEditNode(model, action, ctx)` signature change in 3b.
  - [4]
    - **id:** IMP-4
    - **severity:** major
    - **where:** §1 'Until 3d and 3e1 land, the host answers a valid freeze message it does not route yet with not-yet… until 3e2… formalize.options'; §0 (3b is core only); §2.5 (RUN_MESSAGE_TYPES gains sessionFreeze, answerUnfreeze); extension logic/runs.ts (`RunRequestMessage = Extract<WebviewToHostMessage, {type: RunRequestType}>`), boardSession.ts dispatchRun (switch with return type Promise<ActionOutcome>) and handleInOrder (default: log 'unhandled message', no actionResult)
    - **problem:** No sub-slice owns the promised `not-yet` answers between 3b and 3d, 3e1 and 3e2. Slice 2 gave this job to 2c2 explicitly. Three consequences once 3b adds the message types:
- RunRequestMessage widens. If dispatchRun is still an exhaustive switch, as built today, the extension fails tsc (TS2366) after a core-only sub-slice.
- `setFreezes` is not yet in ACTION_MESSAGE_TYPES. It falls to handleInOrder's default and is logged but never answered.
- `formalize.options` and `endSession.keep`/`keepAll` are dropped silently by slice 2's routing instead of answered `not-yet`.
    - **scenario:** 3b lands and the extension's tsc fails. Or, in a scratch build while 3f runs beside 3d, the board posts setFreezes; no actionResult ever arrives and freezeBusy spins forever.
    - **fix:** As 2c2 did, list a host exception for 3b in §0 (extension logic/boardSession.ts and runs.ts):
- dispatchRun answers sessionFreeze and answerUnfreeze with `not-yet`, 'Not built yet (slice 3)';
- handleInOrder answers setFreezes the same way;
- `formalize` with `options`, and `endSession` with `keep` or `keepAll`, answer `not-yet`.

3d, 3e1 and 3e2 each replace their part with routing. Add one host unit test per message in 3b.
  - [5]
    - **id:** IMP-5
    - **severity:** major
    - **where:** §2.3 ReviewAction `{ kind: 'undo' | 'redo'; step; confirmed; violates? }`; §5.3 (Undo refused under planFreeze's rules, R2-14; 'Redo sends the request again through the reducer, with values computed then'); §2.9 planFreeze's session input; slice 2 ReviewState (no models, phase or queue); §6.1 3b tests ('an Undo that would freeze a hidden target's Proof refused', 'Redo through the rules')
    - **problem:** The reducer is pure over ReviewState, which holds no models, no phase and no queue. Two things the plan asks of it cannot be done there:
- A Redo of a freeze action needs new OwnValues: addressValue and heldMap on J, the stage state or F.
- planFreeze's rules for Undo and Redo need the queued and running targets (D3-6 during a step), the applying phase (D3-46) and the FreezeBoard.

The given undo/redo action carries none of these, so 3b cannot implement R2-14 or 'values computed then', and its listed tests cannot be written against these contracts. A builder who reuses the recorded `after` values would freeze at stale values.
    - **scenario:** The person freezes X during step 1, at J. The queue ends and they Undo. A later queue changes J, then they Redo. The reducer has no new values: it either refuses or re-applies the old OwnValue, which gives a wrong expected value and a spurious stage problem. During a step, an Undo that restores a freeze on a queued target's Proof cannot be refused, because the reducer does not know the queue.
    - **fix:** Extend the undo/redo ReviewAction with `freeze?: { values?: Record<FreezeKey, OwnValue>; left?: Array<{ key: FreezeKey; reason: string }> }`. The runner computes it with planFreeze (on the view's board and session flags) and the value functions, for the keys the Undo or Redo would give a reason. The reducer refuses when `left` is not empty, and refuses a Redo of a freeze action that lacks `values` for any key it freezes. Keep the 3b tests as reducer tests with these inputs, and add the runner side to 3d's list.
  - [6]
    - **id:** IMP-6
    - **severity:** major
    - **where:** §2.8 propose_arrow (D3-38 exceptions); §3.10 base mask ('a whole-model arrow into another proposition (D3-38) is a listed item that can be decided while the results are hidden'); §1.1 3c1's file list; slice 2 §4.9 B.3 ('each arrow the active step added goes into the step's target', token `not-target'), §4.10 backstop; built core review/items.ts `acc(arrowKey(source, id), 'add-arrow', { partOfResult: id })`
    - **problem:** The plan relaxes only propose_arrow's validator and the mask. Three other places still assume a ledger arrow goes into a target, and no sub-slice is told to change them or test them at the gate or at Apply:
- B.3's `not-target` applies at every judged state, gate attempts included;
- the backstop re-derives B.3 at Apply;
- the built computeItems marks every ledger arrow as part of the Result of its target card.
    - **scenario:** A whole-model step proposes S→P, where P is not a target; propose_arrow accepts it and normalise writes it. The gate reports B.3 `not-target`; after three counted attempts the step gives up. If a builder relaxes only B.3, the item gets partOf P, a Result that does not exist, so it stays hidden while the results are, contrary to F19.
    - **fix:** 3c1, in review/judge.ts, review/items.ts and review/backstop.ts:
- in a step whose StepScope has wholeModel, B.3 admits a ledger arrow into an unfrozen proposition of the session's subject before freeze_statements (in 3c2 also arrows into and out of the step's intermediates);
- the backstop accepts such accepted arrows;
- computeItems sets partOfResult only when the arrow's target is an inference's target (in 3c2, or an intermediate).

Tests: in 3c1, such an arrow passes gate-proved and final, its item has no partOf, and the backstop passes. In 3e2, an Add arrow item into a non-target can be decided while the results are hidden.
  - [7]
    - **id:** IMP-7
    - **severity:** minor
    - **where:** §2.4 SessionFreezesView.mode ('the mode of the running queue, or else of the last one'); §2.9 buildFreezesView input (records, running?); §2.3 SessionInference.options ('of the request that added it'); slice 2 SessionRecords.steps (id, kind, target, stage, state, question: no scope or options); §3.10 'A mid-stage Formalize carries its own'
    - **problem:** buildFreezesView cannot know any step's switches except the running step's (`running.scope`). Nothing records which steps form a queue, so 'the last one' is undefined. Separately, a re-ask (a mid-stage Formalize of an existing target) with Open the whole model keeps the inference's options from the earlier request, so its step, and later its Submit and Retry steps, would run narrow.
    - **scenario:** A session starts narrow, and the person re-asks T with Open the whole model; T's step runs under the narrow preset. Or a whole-model queue ends, and the banner falls back to `start` because the steps of the last queue cannot be identified.
    - **fix:** SessionRecords.steps gains `options?: { wholeModel?: true; mayAddCards?: true }`, copied from PersistedStep.scope, and `queue?: number`, the id of the seal or queue-start write that queued the step. `mode` reads the steps of the newest queue. State that a re-ask's request replaces the inference's options, and that its later Submit and Retry steps copy the new ones. Add tests in 3b and 3e2.
  - [8]
    - **id:** IMP-8
    - **severity:** minor
    - **where:** §2.4 ('SessionView.freezes: SessionFreezesView; ItemView.covers: FreezeKey[]'; StageReportView.requests), types in 3a, built in 3b; §0's optional list; §1.1 3a 'review/view.ts (types only)'; slice 2's buildSessionView (2c2)
    - **problem:** These fields are required, so slice 2's buildSessionView no longer compiles once 3a adds the types. The natural repair, calling buildFreezesView (a NotImplementedError stub until 3b), makes every SessionView build throw, so every runner session test fails between 3a and 3b.
    - **scenario:** The 3a builder wires buildFreezesView into buildSessionView to satisfy tsc. Each `session` post throws NotImplementedError, and the full runner suite fails.
    - **fix:** State that 3a fills these fields with empty placeholders (`freezes`: an empty SessionFreezesView, `covers: []`, `requests: []`) and that 3b replaces them; buildSessionView never calls a stub. Alternatively, add the fields to §0's optional list until 3b.
  - [9]
    - **id:** IMP-10
    - **severity:** minor
    - **where:** §2.1 (FrozenSnapshot.declarations gains meaningKey; 'statement-changed also compares meaningKey where both sides have one … closes slice 2's §4.3 residual'); §1.1 3a (gate/rules.ts only); core gate/permitted.ts snapshotOf (copies only kind, type and value)
    - **problem:** No sub-slice makes snapshotOf record meaningKey. Because the rule applies only 'where both sides have one', the meaning comparison is then never made, and nothing reports it. The §4.3 residual stays open: a proof-phase instance can still change a fixed statement's meaning. D3-12's whole-model guarantee, that nothing visible changes after freeze_statements, stays open with it. A 3a test with a hand-built snapshot would still pass.
    - **scenario:** In a proof phase, Claude places an instance before a statement it fixed in this step. The printed type and value are equal, and the snapshot has no meaningKey, so statement-changed passes. The item's meaning changed after the proof attempt.
    - **fix:** In 3a:
- snapshotOf copies facts.meaningKey;
- statement-changed records the name as inexact, refused at final as in §2.1, when one side has a meaningKey and the other lacks it;
- the 3a test builds the snapshot through frozenSnapshot() from fakeFacts({ meaningKey: true }).

Name gate/permitted.ts in 3a's list.
  - [10]
    - **id:** IMP-16
    - **severity:** minor
    - **where:** §0 / D3-51 (3d makes SessionCheckContext.freezes required 'so tsc finds every call site'); §6.1 3d spy list; slice 2 D2-72 (recover() recomputes the stage judgement); §3.5 judge-apply's frozenFindings re-run; §5.3 `violates`
    - **problem:** The required type covers only the engine's paths. The following build their freeze input from core's optional fields, so tsc finds none of them, and the spy list leaves them out:
- recover()'s recomputed stage judgement;
- judge-apply's frozenFindings re-run;
- Undo's `violates`;
- the end's rows and table;
- toSessionRecords, which feeds ReviewState.freezes and the views.
    - **scenario:** After a reload, the recomputed stage judgement lacks the standing and own freezes, so the stage shows no frozen problem and Apply's gate opens. The final check then refuses, which confuses the person; the views also show no locks.
    - **fix:** 3d adds one runner helper, `freezeInputOf(session)`, used by every caller. The runner's PersistedSession.freezes becomes required after recover()'s upgrade, and the spy test also covers recover(), judge-apply's re-run and toSessionRecords.
  - [11]
    - **id:** IMP-11
    - **severity:** minor
    - **where:** §3.12 FZ-12 (3d runner texts, 3g webview; 'tests grep user-facing texts for "statements frozen"'); core gate/describe.ts (board sentences: 'a definition the frozen statement depends on changed', 'the frozen statements did not build for the final check', 'it changed the kind of a frozen declaration'); core gate/rules.ts messages
    - **problem:** These are user-facing board sentences in core, and their 'frozen' (statement fixing) now reads like FROZEN. 3d and 3g may not change core, and no core sub-slice is assigned the rename. The planned grep misses 'frozen statement(s)' and 'frozen declaration'.
    - **scenario:** After slice 3, a card shows 'it changed the kind of a frozen declaration'. The person reads it as one of their own freezes, which is exactly the confusion FZ-12 exists to prevent.
    - **fix:** 3a, which already edits gate/describe.ts, rewords them: 'fixed statement', 'the fixed statements did not build for the final check', 'a fixed declaration'. Widen the FZ-12 test to /statements? frozen|frozen statements?|frozen declaration/i over core's describe texts, the runner's texts and the webview's labels.
  - [12]
    - **id:** IMP-13
    - **severity:** minor
    - **where:** §5.4 ('telelean makes one board step, "Keep ‹n› freezes from the session"… a snapshot when it writes one'); §1.1 3e1 (no core file); runner ModelWorkspace.perform (BoardAction only; set-freezes cannot mix freeze and unfreeze) and applyChangesNow (always layoutOnly:false, so it always snapshots; refuses non-model files)
    - **problem:** This step combines kept freezes, kept unfreezes and id writes. No BoardAction can express it, and 3e1 cannot add one. The only runner route left, applyChanges, always makes a History snapshot, which contradicts 'a snapshot when it writes one' and FZ-9's 'no History snapshot'.
    - **scenario:** Exit with two ticked freezes of cards whose ids are written: the board step makes a History entry, 'Keep 2 freezes from the session', with no visible file change.
    - **fix:** State that 3e1 makes the step through ModelWorkspace.applyChanges with action 'set-freezes'. Its changes are the freezes.json merge (parseFreezesFile, serialiseFreezes) plus planIdWrites. ExternalChangeSet gains `snapshot?: boolean` (false when only freezes.json changes). recover()'s replay uses the same path.
  - [13]
    - **id:** IMP-14
    - **severity:** minor
    - **where:** §2.4 ActionOutcome.freeze (error branch) and the ok branch's `freeze.left`; §2.6 ('unfreeze-others answers needs-confirmation with freeze.standing'); core ActionError (carries only `dependents`); runner modelWorkspace refusal() and performNow
    - **problem:** A board plan cannot get its counts or its `left` reasons into the ActionOutcome. refusal() copies only code, message and dependents, EditPlan has no `left`, and performNow builds the ok outcome from the label alone.
    - **scenario:** The host's needs-confirmation for 'Unfreeze all other cards' reaches the webview without counts, so the reopened dialog cannot say how many standing freezes would go. A board Freeze that leaves a provisional card toasts nothing.
    - **fix:** 3a: ActionError gains `freeze?` with ActionOutcome.freeze's shape, and EditPlan gains `freezeLeft?: Array<{ label; reason }>`. 3b: planAction fills both. 3d: ModelWorkspace's refusal() and performNow copy them into the outcome.
  - [14]
    - **id:** IMP-9
    - **severity:** minor
    - **where:** §2.9 frozenFindings `stepStart` ('computeItems' drafts on it (with the ledger as it was at S₀), memoised per S₀ commit'); slice 2 JudgeInput (stepStart is a ProjectModel only); AP-24 removed PersistedStep.startRecords
    - **problem:** JudgeInput carries neither the ledger as it was at S₀ nor S₀'s commit, so the two-value rule's S₀ drafts cannot be computed as specified.
    - **scenario:** At S₀, computeItems runs with the current ledger, which includes the running step's propose_arrow entries. It reports an arrow that is not in S₀'s files, and the two-value rule compares against a wrong S₀ value.
    - **fix:** State that the S₀ ledger is `ledger` minus the entries whose `step` equals `scope.step`: the running step's `arrow` entries, and from 3c1 its `unarrow`, `delete`, `card` and `proof-broken` entries. Memoise by the stepStart model object (a WeakMap), or add `JudgeInput.stepStartCommit`.
  - [15]
    - **id:** IMP-12
    - **severity:** minor
    - **where:** §2.3 SessionAction 'freeze' `changes: Array<{ item; before; after }>`; built core review/types.ts, where decide and reveal changes carry `rev` (builder 2a2, D2-73)
    - **problem:** Its un-accepts lack the `rev` that slice 2's Undo conflict check compares, so an Undo could restore an Accept on a newer proposal the person never saw.
    - **scenario:** The person unfreezes accepted X in a stage, and X returns to review. A later queue proposes X rev 2. Undo of the freeze action re-accepts rev 2.
    - **fix:** Add `rev: number` to the freeze action's `changes`, and apply 2a2's rule: Undo answers `conflict` when the rev changed.
  - [16]
    - **id:** IMP-15
    - **severity:** minor
    - **where:** §0 'Recordings. The integrator regenerates … right after 3p, when RAM allows'; §1 table (3b after 3p)
    - **problem:** From 3b, Accept stores frozen.held, and heldValue without meaningKey is inexact, which the final check and the backstop refuse. Any runner suite that accepts and applies on old recordings therefore fails. 3b's green suite depends on a step the plan makes conditional on RAM.
    - **scenario:** RAM is tight after 3p, so the regeneration is deferred and 3b starts. The slice-2 runner suites with Accept followed by Apply fail with 'telelean could not compare what ‹name› means in Lean'.
    - **fix:** Make the regenerated recordings a hard gate before 3b starts, logged in §8; if RAM does not allow, wait. Also regenerate core's hand-written Spyro facts with meaningKey, as 2b3 did for typeConsts.
  - [17]
    - **id:** IMP-18
    - **severity:** minor
    - **where:** §0 FakeBackend bullet ('each cheat of §6.2 is also built by hand in core/test/freeze/cheats.test.ts'); §6.2; §6.1 per-sub-slice lists
    - **problem:** No sub-slice owns cheats.test.ts. Several cheats are runner behaviour that a pure core test cannot build: 10(a)–(e) (fresh counting, notices, rollbacks, early end) and 16 (the path guard). The tool cheats need 3c1 or 3c2.
    - **scenario:** 3d's builder adds cheat 10 to core tests, which 'no core source' allows, while 3f runs beside it. Or nobody adds any cheat, and §0's promise is never checked.
    - **fix:** Assign each cheat:
- 3a: 1, 2, 5–9, 11 and 18, as hand-built judgeState states;
- 3b: 19–23, through the reducer, frozenChangesOf and planSubmit;
- 3c1: 3, 8, 12, 13, 15 and 17;
- 3c2: 14;
- runner only (3d): 10 and 16.
  - [18]
    - **id:** IMP-19
    - **severity:** nit
    - **where:** §2.3 ('core gate/types.ts … FinalCheckRule: + frozen'); §2.5 sessionFreeze `view` 0–1 000 000 000; JudgeInput.freeze vs JudgeInput.freezes
    - **problem:** Three small slips:
- FinalCheckRule is defined in core review/view.ts, not gate/types.ts.
- `view` is bounded by 1e9, but slice 2 never fixes viewVersion's starting value; TlGraph.version, whose role it takes, is seeded from Date.now() (about 1.8e12).
- JudgeInput.freeze (the statement snapshot) and JudgeInput.freezes (FROZEN) differ by one letter, the confusion FZ-12 exists to prevent.
    - **scenario:** If 2c2 seeds viewVersion like the board graph's version, every sessionFreeze fails validation. A builder can also type `freeze` for `freezes`, and it compiles.
    - **fix:** Say review/view.ts for FinalCheckRule. Pin 'viewVersion starts at 0', or bound `view` by Number.MAX_SAFE_INTEGER. Name the new field `frozenInput` (or `freezeTable`) on JudgeInput, SessionCheckContext and BackstopInput.
