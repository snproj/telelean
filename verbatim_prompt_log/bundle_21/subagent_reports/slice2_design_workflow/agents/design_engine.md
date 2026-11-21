# design:engine

Agent `a6d6e0e2863b0ccbf` of workflow `wf_bd9a405e-4c7`. Verbatim output (JSON alongside).

- **summary:** I've designed the slice 2 session engine. It extends today's run machinery and does not replace it. A session is a run: one run directory, one shadow, one Claude conversation, and run.json at version 2 with a new `session` member. The shadow's `base` commit is made once and never moves.

**Steps.** Every Claude step proves exactly one target, i.e. one inference. A Formalize with several targets becomes a queue of steps, sources first. Each step reuses today's round loop: formalise, statements fixed, prove, finish, gate with up to 3 attempts, and the comparator (G4) for its target. After each step and each user decision, every inference is judged again (RV-11) on the resulting state.

**Items.** Core computes the review items from the difference between the base and the working copy (ws/). Each item has a stable key, such as `card:<id>`, `proof:<id>` or `arrow:<src>><tgt>`. When a later proposal changes an item, it stays the same item: back to "in review", marked "updated", with the earlier version kept. Statuses follow a pure core reducer that enforces RV-3/5/6/7/8, the cascades, and the session Undo stack.

**Decisions.** A Reject, or a plain decline of an arrow item, takes the content out of the working copy at once. telelean records this as a `decision` commit and then re-checks the state (no Claude). So the working copy is always base plus the content not declined, and at Apply it is exactly base plus the accepted items.

**Submit review.** It sends Claude a structured list generated from the statuses: accepted, rejected, Shaky (with an optional note from the user), and to be redone. Then it queues one step per affected inference, sources first.

**Apply.** It reuses today's write path (`planAccept` and `apply`), given exactly the final state. Before that it runs every check on the final state: each inference's permitted set B.1 including Claude's arrows E(T), the no-hidden-edges check B.2, B.3, B.4, and G4 with a fresh challenge per inference. It also runs the Appendix B backstop, which is never reused. The drift check is atomic, and a file watcher keeps Apply disabled while the user's files differ from the base. D-21's rebase path is deleted.

**Gate changes.** The ES-2 preset becomes a rule relative to the step's start, with an explicit StepScope. Claude proposes arrows by appending ids to the target's `premises:` line, under a new markup exception plus the B.3 checks. The no-hidden-edges rule allows E(T) and accepted premise cards. new-axiom compares name and type against the base. A new `holds-kind` rule enforces B.4, and exact repeats of rejected content are refused.

**Plan.** Eight sub-slices, in order: 2a and 2b (pure core) → 2c (engine) → 2d1, 2d2, 2d3 (session manager) → 2e (Apply, Exit, drift); 2f (protocol and host) runs alongside.

**Leak found in today's code.** attempts.jsonl gets each round's verdict as soon as the round ends, and the Current board's card details list it before the review reveals the result. That breaks "meaning before proof" (S7) today; the design moves those records to the end of the session.
- **current_state:** RUNS TODAY (one target, all-or-nothing):
- runner/src/run/manager.ts is RunManagerImpl, 2369 lines. It allows one active run per root, using the state machine of docs/m2-plan.md section 2 (lines 117-204 there).
  - doStart (L850-992): preflight, backend, then a shadow made from the user's files (createRunShadow makes the `base` commit once). Then engine.checkBase, openSession, and the context bundle (L979-991). Since 1e the run writes no `premises:` (L871-877).
  - The turn loop is runRound/runTurn/endOfTurn (L1026-1102). The gate loop is in toolFinish (L2215-2288): retry while attempt < maxGateAttempts, else give_up.
  - settleAccepted (L1105-1116) resets ws/ to the gate-pass commit.
  - settleReverted (L1119-1147) reverts to `shadow.lastCommit(PASSING_COMMIT_KINDS)`. That can be the base commit, which in a multi-step session would undo earlier steps.
  - buildProposal (L1164-1226) renders the statements, computes baseDrift, calls ProposalService.build, and calls appendAttempt at round end (L1224). appendAttempt (L1230-1260) writes the verdict to attempts.jsonl and calls reloadAttempts.
  - Feedback (L1508-1524) and startNewRound (L1527-1540) start a new round in the same conversation.
  - adoptGhostNow (L1548-1631): telelean writes the AXIOM card and its arrow (core planGhostAdoption, an `adopt` commit), re-freezes, and starts a proving round.
  - acceptNow (L1663-1775):
    - drift refusal (1f) at L1677-1681;
    - plan.drift authoritative (1e carry-over) at L1688;
    - D-21 rebase, marked unreachable, at L1691-1747;
    - proposals.apply at L1749.
  - cancel (L1420-1446) is terminal: it ends the run.
  - recover (L1786-1845): a run in working or gate becomes interrupted, and Resume is offered. dispose is at L1852.
  - toolFreeze allows one freeze per round (L2013). toolProposeAssumption (L2122) records ghosts.
- runner/src/run/types.ts:
  - RunStartRequest {subject, target, premises} (L128-141);
  - the RunManager interface (L154-196): start/answer/cancel/resume/accept/feedback/discard/adoptGhost/rejectGhost/dismiss/proposalDiff/recover/dispose;
  - PersistedRun v1, i.e. run.json (L285-315): one selection, freezes per round, ghosts, gateAttempts, proposal.
- runner/src/run/persist.ts: RunFiles (atomic run.json, transcript.jsonl) and scanRuns.
- runner/src/run/prompts.ts: renderContextBundle (first line `Run: "These suffice"`, which FakeBackend scripts match), feedbackTurn, adoptionTurn, resumeTurn, NUDGE_TURN.
- core/src/run.ts:
  - RunState (L108-124);
  - RunView (L288-332): single target, round, frozen, ghosts, verdict;
  - EDIT_SESSION_ACTIVE and runLocksBoard (L139-144): a non-terminal run locks the folder (ES-9);
  - ProposalView (L452-473): graph, diff, files, review (StatementReview + VocabularyReview), definitions as yes/no questions, ghosts, report, baseChanged, empty;
  - upgradeLegacyProposal (L497).
- runner/src/proposal/service.ts:
  - build (L122-180): subjectGraph of ws/ with the check's facts, diffGraphs against the current board, statement reviews against B, vocabulary review, definition questions, report card;
  - baseDrift (L267-273);
  - planAccept (L275-343): 3-way merge of base→shown onto the real files, or exactly `shownState`;
  - apply (L345-354): ModelWorkspace.applyChanges with action `accept-proposal`, one history entry and one Undo step.
- runner/src/shadow/types.ts:
  - the layout: ws/, build/, git/, session/, frozen/<n>, gate/<n>, scratch/, run.json, base-facts.json (L1-26);
  - commit kinds (L47-67): base, freeze, adopt, normalise, gate-pass, revert, rebase, accept-base, checkpoint;
  - PASSING_COMMIT_KINDS = gate-pass, freeze, base (L69);
  - ShadowWorkspace (L143-183): baseFiles, currentFiles, changes, syncMirror, writeFiles, commit, commits, lastCommit, filesAt, revertTo.
  - Since 1f nothing writes the user's files into the shadow (accept-base and rebase are unreachable).

GATE TODAY:
- runner/src/gate/types.ts:
  - CheckContext (L65-86): one `selection`, `freeze`, `roundStartCommit`, `baseCommit`, `teleleanBlocks`;
  - CheckReport (L99-124);
  - FreezeRecord (L127-136);
  - LeanCheckEngine (L189-224): normalise, checkBase, check, freeze, gate, checkGhost, renderStatements.
- runner/src/gate/engine.ts:
  - runCheck (L397-477): G0 against B, sync, build and facts, then the models B (base-facts.json), A (newest `adopt`), R (round start) and S, then core evaluateRules;
  - freezeNow (L557-628): permitted set with B, then a challenge without the target's `.holds` closure. The permitted axioms are baked into the challenge export (lean/comparator.ts Freeze L92-99);
  - gateNow (L676-709): the judged commit, the rules, then G4 for `proved` only;
  - checkGhostNow (L746-809) and ghostDirectProblems (L835-860): B.2 for the scratch theorem (1e).
- core/src/gate:
  - types.ts: Selection {subject, target, premises, adoptedGhosts} (L162-172); RuleInput (L212-243); GateFindingCode (L18-120, including 1e's `undeclared-premise`).
  - rules.ts evaluate (L112-873):
    - new-axiom by name against B (L283-357; `inBase(name)` at L325);
    - existing-changed against B: every B declaration keeps its text and meaning, the target's `.holds` exempt (L359-423);
    - not-proved (L425-460), status-mismatch (L472-483), statement-changed against the round's freeze (L485-516);
    - footprint (L518-606): permitted = the freeze's, else computed from current with B;
    - undeclared-premise, B.2 from 1e (L608-655): allowed = premises ∪ adoptedGhosts (L630);
    - G5 markupFindings (L905-1112): COMPARED_FIELDS includes `premises` and `follows_from` (L76). Only telelean's adoption may append to the target's premises or drop its mark (L940-964). No new blocks except telelean's.
  - permitted.ts permittedAxioms (L84-122): derivation footprints only from the user's own unchanged proofs in B (L61-76).
- core/src/formalize.ts: formalizeStartProblem (one target, AP-9), drawn arrows, AR-8 needsHoldsFirst, cycles (AP-13).
- core/src/project/edges.ts: directWalk (L160) and directWalkOfConsts (L243), the value-probe walk from 1d.

PROTOCOL AND HOST:
- core/src/protocol.ts:
  - webview → host: startRun (L192), answerQuestions, cancelRun, resumeRun (L194-198), acceptProposal (L205), feedback (L207), discardProposal (L208), adoptGhost and rejectGhost (L210-211), openProposalDiff (L213), dismissRun (L215);
  - host → webview: `run` (L73) and `proposal` (L75).
- extension/src/logic/boardSession.ts: editLock (L410-424) uses runLocksBoard(manager.current()) and the start in flight. extension/src/logic/runs.ts routes RUN_MESSAGE_TYPES.
- ModelWorkspace (runner/src/workspace/types.ts):
  - onDidChange (L165) fires after typing, saves and file-watcher events (extension/src/vscode/registry.ts L94, L202-209);
  - readText reads the open buffer first; modelFiles; applyChanges (L189).

TESTS: runner/test/run/manager.*.test.ts use the helpers fakeEngine, fakeShadow, fakeServices and harness (no Lean), plus FakeBackend scripts (llm/fake.ts). There are also runner/test/gate engine and rules tests, runner/test/proposal accept/apply/build tests, and core/test/gate/*.

GAPS THAT MATTER FOR SLICE 2:
- (i) S7 leak today: appendAttempt writes the verdict at round end (manager.ts L1224, L1256), and webview/src/board/CardDetails.tsx L88-104 lists it on the Current board's card while the review still hides the result.
- (ii) settleReverted can fall back to the base commit.
- (iii) Cancel is terminal.
- (iv) One freeze per round, and the permitted set is fixed in the challenge at freeze time.
- (v) Nothing computes per-item diffs, statuses or dependencies. The review is the all-or-nothing ProposalView, with definition questions answered yes or no.
- (vi) The D-21 rebase block and `accept-base`/`rebase` are dead code since 1f.
- **design:** 0. PRINCIPLES AND INVARIANTS
- A session is today's run, extended:
  - one run directory, one shadow (ws/ = the working copy; the `base` commit = the session base, made once and never moved);
  - one Claude conversation, continued across steps and stages and resumed with `--resume` after a reload; caps apply per step;
  - one transcript, and run.json at version 2.
- RunView stays the live process view: state, step progress, questions, notices, activity, usage. RunState is unchanged. A stage and its confirmation use 'review'; Apply maps to 'accepted', Exit to 'discarded'. So runLocksBoard and the host's ES-9 lock keep working as they are.
- The review data moves to a new SessionView. ProposalView is kept only for reading legacy runs.
- W (judged working copy): outside a running step, the ws/ head is a state telelean judged, or `judging` is true. ws/ = base + the content of every item that is in review, accepted, declined Shaky, or to be redone because of a Shaky decline. Rejected content, and content a reject made unbuildable, is taken out at once by telelean (`decision` commits). So at the end the final state F = ws/ = base + the accepted items.
- S (one inference per step): every Claude step proves at most one target. It has its own FreezeRecord (statements fixed), its own gate and its own G4. RV-11 re-judges all inferences on the state the step leaves.
- D (decisions belong to the user): statuses change only through user actions, together with the cascades recorded with that action. Claude's rollback never goes behind its step's `step-start` commit, which comes after every decision carried out so far. Decisions made while a step runs are recorded at once and carried out when it ends.
- Baseline = B in slice 2 (there are no transforms yet). G0's own-line exemption, new-axiom's "existed before" and derivation footprints still compare with B, never with accepted Claude content.
- In slice 2, Accept does not freeze (FROZEN is slice 3). Accepted content is protected:
  - during steps, by the step preset (everything at step start is fixed except the StepScope);
  - at Apply, by the content-hash check (acceptedFingerprint) and the backstop.
- The whole-model switch and "Claude may add cards" are not in slice 2.

1. PERSISTED MODEL (runner/src/run/types.ts, additive; run.json `version: 2`; v1 is still read)
```ts
interface PersistedRun { /* v1 fields unchanged */ version: 1 | 2; session?: PersistedSession }
interface PersistedSession {
  format: 'telelean-session'; version: 1; startedBy: 'formalize';
  stage: number;                        // 0 until the first stage
  inferences: PersistedInference[];     // one per target, keyed by target
  steps: PersistedStep[];               // in run order
  queue: string[];                      // step ids still to run (Retry re-queues)
  items: ItemRecord[]; nextItem: number;
  premises: PremiseProposal[];          // Add premise drafts (ghosts + their checks); outside ws/ until accepted
  rejected: RejectedRecord[];           // "Rejected in this session" (item id, version, fingerprint, decision commit)
  stack: { done: SessionAction[]; undone: SessionAction[]; sealedAt: number }; // UN-4..UN-6
  pending: SessionAction[];             // decisions made while a step ran
  judged?: { commit: string; at: string; ok: boolean; problems: string[] };   // RV-11, facts in judged-facts.json
  stepMark?: { kind: 'cancelled'|'failed'|'did-not-pass'; step: string; text: string };
  confirmation?: { kind: 'apply'|'exit'; checkId?: string; state?: 'running'|'passed'|'failed'; problems?: string[] };
  drift: string[]; positions?: Record<string, CanvasPosition>;   // moves on the Proposed view
}
interface PersistedInference { target: string; question: string[]; fromNothing: boolean; order: number; steps: string[] }
interface PersistedStep {
  id: string; kind: 'formalize'|'submit'|'retry'|'completion'; target: string; stage: number;
  scope: StepScope; turn?: string /* the step's user turn, for the transcript and Retry */;
  state: 'queued'|'running'|'passed'|'gave-up'|'cancelled'|'failed'|'skipped';
  startCommit?: string; endCommit?: string; freezes: FreezeRecord[]; gateAttempts: GateAttemptView[];
  lastFinish?: FinishArgs; verdict?: RunVerdict; counters: RunCounters; agentMs: number;
  attempt?: AttemptRecord;              // written to attempts.jsonl only when the session ends (S7)
}
interface ItemRecord {
  id: string; key: string; kind: ItemKind; group: string; origin: { step: string; target: string };
  status: ItemStatus; markers: ItemMarker[]; fingerprint: string; content: ItemContent;
  versions: Array<{ stage: number; fingerprint: string; content: ItemContent }>;   // RV-1 "previous viewable"
  acceptedFingerprint?: string; revealed?: boolean; seenEarly?: boolean; revertCommit?: string;
}
type SessionAction =
  | { kind: 'status'; changes: Array<{ itemId: string; from: ItemStatus; to: ItemStatus }>; commit?: string; at: string }
  | { kind: 'show-result'; itemId: string; at: string }
  | { kind: 'move'; before: Record<string, CanvasPosition | null>; after: Record<string, CanvasPosition>; at: string }
  | { kind: 'seal'; reason: 'submit'|'formalize'|'retry'|'answer'; at: string };
```
- Shadow commit kinds (additive):
  - `step-start`: a step's S₀; it is passing, because the state was judged;
  - `decision`: telelean took declined content out, one commit per user action;
  - `completion`: telelean's proof completion after an accepted premise.
- Rollback target = the newest commit of kind gate-pass, freeze, step-start or decision whose index is ≥ the step's startCommit. The new helper `ShadowWorkspace.lastCommitSince(id, kinds)` finds it.
- Facts files in the run directory: base-facts.json (existing), step-start-facts.json (S₀, overwritten for each step) and judged-facts.json (the last judged state).

2. CORE CONTRACTS (new core/src/session.ts; exported; frozen like run.ts after integration)
```ts
export type ItemKind = 'formalize'|'change'|'add'|'delete'|'add-premise'|'add-arrow'|'remove-arrow'
  |'vocabulary'|'declaration'|'result'|'proof-broken';   // slice 2 produces formalize, add-premise, add-arrow, vocabulary, declaration, result
export type DeclineOption = 'reject'|'shaky'|'transform'|'plain';
export type ItemStatus =
  | { kind: 'in-review' }
  | { kind: 'accepted'; via: 'own'|'group'; at: string }
  | { kind: 'declined'; option: DeclineOption; at: string; note?: string }   // note: the Shaky note (Q7)
  | { kind: 'to-be-redone'; because: string[]; reverted: boolean }
  | { kind: 'withdrawn'; at: string };                                      // Q13
export type ItemMarker = 'updated'|'no-alternative-found'|'seen-early'|'meaning-differs-in-place'|'completion-not-checked'
  |'replaces-your-proof'|'proves-changed-statement'|'proved-from-nothing'|'unused-premise'|'adds-no-new-basis';
export type Gate = { ok: true } | { ok: false; reason: string };
export interface ItemView {
  id: string; key: string; kind: ItemKind; label: string; group: string;   // arrow items grouped under their target
  status: ItemStatus; markers: ItemMarker[];
  classes: { belief: boolean; changesProved: boolean; reasons: string[] };  // RV-7
  dependsOn: string[]; missing: string[];   // RV-5; hidden items left out
  canAccept: Gate; canDecline: Gate & { options: DeclineOption[] };
  detail: ItemDetail; previous: number; origin: { step: string; target: string }; sub?: ItemView[];
}
export type ItemDetail =
  | { kind: 'statement'; nodeId: string; sentence: string; wordedBy: 'user'|'agent'; leanName: string; pretty: string; explicit: string; closure: StatementReview['closure']; holds?: string }
  | { kind: 'arrow'; source: { id: string; sentence: string }; target: { id: string; sentence: string }; why?: string }
  | { kind: 'premise'; target: string; sentence: string; leanName: string; leanStatement: string; explicit?: string; whyNeeded: string; aloneEntails: boolean }
  | { kind: 'vocabulary'; name: string; vocabKind: VocabKind; type?: string; gloss?: string; code?: string }
  | { kind: 'declaration'; name: string; declKind: 'definition'|'presupposition'|'instance'|'coercion'|'vocabulary-change'; code: string; before?: string; gloss?: string; usedByStatementsOf: string[] }
  | { kind: 'result'; target: string; revealed: false; waitingFor: string[] }
  | { kind: 'result'; target: string; revealed: true; verdict: 'established'|'proved'|'not-proved'; why?: string;
      proof?: string; lemmas: string[]; band: { used: string[]; notNeeded: string[]; complete: boolean }; restsOn: string[];
      gap?: string; selectToo: Array<{ source: string; target: string }>; summary?: string };
export interface InferenceView { target: string; question: string[]; fromNothing: boolean; added: string[]; order: number; resultItem?: string; hidden: boolean }
export interface StepView { id: string; index: number; of: number; kind: PersistedStep['kind']; target: string; state: PersistedStep['state'] }
export interface StageReportView {
  stage: number; summaries: Array<{ step: string; text: string }>; notNeeded: ArrowEnds[];
  missing: Array<{ target: string; text: string; selectToo?: ArrowEnds }>; consistency: 'unchecked';
  assumedWithoutAsking: Array<{ step: string; text: string; relies: string[] }>;
  proposedNothing: Array<{ step: string; reason: string }>; withdrawn: string[];
}
export interface EndConfirmationView {
  kind: 'apply'|'exit'; changes: Array<{ itemId: string; label: string }>;
  check?: { state: 'running'|'passed'|'failed'; problems: string[]; reused: boolean; checkId?: string };
  discards?: { accepted: number; inReview: number };   // Exit
}
export interface SessionView {
  sessionId: string; subject: string; phase: 'starting'|'step'|'stage'|'confirming'|'applying'|'ended'; stage: number;
  inferences: InferenceView[]; items: ItemView[];
  counts: { inReview: number; accepted: number; declined: number; toBeRedone: number };
  report: StageReportView; rejected: Array<{ itemId: string; label: string; at: string; unreject: Gate }>;
  steps: StepView[]; stepMark?: PersistedSession['stepMark'] & { retry: Gate };
  drift: { files: string[]; at: string } | null; judging: boolean;
  submit: Gate; apply: Gate; exit: Gate; undo: { label?: string; reason?: string }; redo: { label?: string; reason?: string };
  confirmation?: EndConfirmationView; graph: TlGraph /* working copy, hidden results masked */; diff: GraphDiff /* vs base */;
  hiddenCards: string[];
}
```

3. ITEMS (core/src/session/items.ts, deps.ts, mask.ts; pure, from a ProjectModel with facts)
3.1 Keys. An item's key is its identity, and is stable across stages:
- `card:<id>`: Formalize, Change, Add or Delete;
- `proof:<id>`: Result or Proof broken;
- `arrow:<src>><tgt>`;
- `premise:<tgt>:<leanName>`;
- `vocabulary` (the group) and `vocab:<name>` (its sub-items);
- `decl:<name>`.

3.2 `computeItems({ base, current, subject, inferences, judgments, premises, acceptedPremiseCards }) → ItemDraft[]`. It works on the declaration and field diff from B to the working copy (core gate/decls.ts declTables):
- A card's statement abbrev, its `.holds` axiom (an axiom being formalised), its `lean:` pin and its docstring → Formalize (when the card had no statement in B); Change when it had one.
- The `.holds` of an inference's target that differs from B → Result. Proof-only declarations go with the Result(s) whose `.holds` valueConsts closure reaches them; orphans go with the origin step's Result.
- Declarations owned by no card:
  - plain signature vocabulary → a `vocab:` sub-item;
  - a definition, instance or coercion in the elaborated closure of any card's statement (types and values through `valueConsts`, as for held sets) → `decl:`;
  - a presupposition plus its helper instance (isPresuppositionInstance) → one `decl:` item;
  - anything else is proof-only.
- Ids appended to a target's `premises:` → `arrow:` items. An id that is an accepted premise card belongs to that premise item.
- Premise drafts from session state → `premise:` items, kept outside ws/ until accepted.
- Every draft carries:
  - `provides` (declaration names, arrows, cards);
  - `mentions` (elaborated constants of its declarations);
  - `partOfResult`: the target it is hidden with. This holds for arrows into a target, that target's premises, and proof-only declarations.
  - `fingerprint`: sha256 of the normalised content, whitespace collapsed, also used for DO-1/DO-3.

3.3 Reconcile (runner) matches drafts to records by key:
- New key → in review.
- Same fingerprint → unchanged.
- Changed fingerprint → the old version is pushed to `versions`, the item goes to in review and gets `updated`. If it was accepted, it first leaves accepted together with its accepted dependents (RV-5). A Result is hidden again.
- A Result whose verdict or dependencies changed → in review, `updated`, hidden again (RV-11).
- A record with no draft:
  - expected when rejected, or when to be redone with its content reverted;
  - `withdrawn` when Claude removed Shaky content;
  - otherwise fail closed: a stage problem is shown and Apply is disabled.
- Defensively, the RV-5 closure is enforced afterwards.

3.4 RV-7 `classifyItem(draft, base, current)`:
- belief:
  - premise items;
  - Formalize of an AXIOM;
  - any Lean axiom added or changed (presupposition, unmarked axiom, pending claim);
  - a `decl:` in a statement's elaborated closure.
- changesProved:
  - add-arrow (always; `adds-no-new-basis` when the source rests only on what Q covers);
  - a Result that replaces a proof existing at B, or proves a statement the session changed;
  - Change items.
- Classes are recomputed on every judged state. An item that was accepted `via: 'group'` and becomes RV-7 → in review with its badge.

3.5 RV-5 `itemDependencies` (from the elaborated facts): I → J when:
- mentions(I) ∩ provides(J) ≠ ∅; or
- I is Result(T) and J is one of: T's or a used source's statement item, an arrow item into T that the proof uses (direct(T)), a premise item for T, or the Result of a source proved in this session; or
- I is an arrow item and J adds a card at one of its ends.

3.6 RV-6 `revealed(I)`. True when either:
- `seenEarly` is set; or
- every statement or belief item I depends on (excluding its own partOfResult items) is decided, and every Result it depends on is revealed.

It is false again when any of those returns to review. The runner leaves hidden items out of `items`, counts, `missing` and `depends on N`, and sends a Result's detail as `revealed: false`. `hiddenCardsOf(baseGraph, graph, hiddenTargets)` collects every card whose result signature differs from base and that is, or rests on through its footprint or direct(v), a hidden target. `maskGraph` gives those cards base's status and direct, drops verified edges into them, drops TL109/TL107/TL102 on them, and redacts the target's `.holds` text from `lean.code`. So the webview never receives a hidden verdict. 1d's buildOverlay stays as a second layer, keyed by `hiddenCards`. Raw Lean diff counts as Show result for every Result it shows.

3.7 RV-8 group Accept:
- It takes the items that are not RV-7, that are not a hidden Result (a Result must be revealed before the action), and whose dependencies are accepted or taken by the same action.
- It returns `skipped` with a reason for each item it left.
- Decline applies one option to all, and a plain decline to arrow items.

4. STATUSES (core/src/session/review.ts: `reduceReview(state, action, at) → ReviewOutcome`; pure, used by the runner and by tests)
```ts
type ReviewAction = { kind: 'accept'; ids: string[]; own: boolean; holdAs?: 'axiom'|'pending' }
  | { kind: 'decline'; ids: string[]; option: DeclineOption; note?: string; confirmed?: boolean }
  | { kind: 'review'; ids: string[]; confirmed?: boolean } | { kind: 'unreject'; ids: string[] } | { kind: 'show-result'; id: string };
type ReviewOutcome = { ok: true; changes: Array<{ id: string; from: ItemStatus; to: ItemStatus }>; revert: string[]; reapply: string[]; skipped: Array<{ id: string; reason: string }> }
  | { ok: false; code: 'needs-confirmation'; leaving: string[] } | { ok: false; code: 'invalid'; error: string };
```
Transitions:
- in review → accepted:
  - all dependencies accepted;
  - an RV-7 item only through its own Accept (`own: true`);
  - a Result only when revealed;
  - not while the stage is marked "did not pass".
- in review → declined:
  - Reject or plain: the content is reverted. In-review dependents → to be redone with `reverted: true`, and their content is reverted when it would no longer build. The removal is transitive.
  - Shaky: no change to ws/; in-review dependents → to be redone with `reverted: false`.
  - DO-0 on an arrow: every Result whose proof uses it → to be redone (reverted). A premise item declines its own arrow with it.
- accepted → in review or declined: first `needs-confirmation`, listing the accepted dependents that return to review (RV-5). Re-sending with `confirmed` applies the change; not re-sending changes nothing.
- declined Reject → in review (un-reject): the decision commit is re-applied by a 3-way merge of its inverse patch (proposal/files.ts mergeFile). If a newer version occupies the slot, this is refused: "Claude proposed a newer version: review that one."
- Shaky → in review: allowed before Submit.
- to be redone → in review (updated) when a step re-proposes it, or → declined by the user.
- Session stack (UN-4..UN-6): every action, with its cascade and its decision commit, is one entry.
  - Undo = the inverse action through the same reducer, so it gets the same RV-5 list. Undoing a Reject re-applies the content as above.
  - Seals: Submit, mid-stage Formalize, Retry, answering a question. Undo stops at the newest seal: "Undo stops at Claude's step."
  - The stack is discarded at the end of the session.
- Accept and back-to-review are allowed while a step runs, since they do not change ws/. Reject, plain decline and un-reject made during a step are recorded at once, pushed to `pending`, and carried out when the step ends (Q3).

5. STEPS (runner/src/run/step.ts StepRunner, extracted from RunManagerImpl: turn loop, tool host, caps and clock, gate loop)
5.1 `formalize({ subject, inferences: [{ target, sources }] })`:
- Host and runner validation: core `formalizeStartProblems` runs per inference (drawn or accepted arrows, AR-8, cycles over drawn and solid arrows). A source that is an earlier target of the same request is exempt from AR-8. During a session, a source whose Result is hidden is refused with "‹source›'s result is not shown yet" (no leak).
- `formalizeOrder` gives a topological order over the arrows among the targets, with ties broken by reading order.
- Each target becomes or replaces a PersistedInference. A re-Formalized target keeps its `proof:` item, updated in place.
- One `formalize` step per target is queued. A mid-stage Formalize (RV-9) seals the stack, queues its steps, and its items join the current stage. It is disabled while a step runs.

5.2 StepScope (core gate types). This is the ES-2 preset, relative to S₀:
```ts
interface StepScope { target: string; question: string[]; fuzzyStatements: string[]; openStatements: string[]; openDecls: string[]; openDependencies: boolean }
```
- Formalize step:
  - fuzzy = empty statements at both ends of Q(T) (not of E(T): Q19);
  - the target's proof is open;
  - openDependencies is true unless the target's question is its ∅ mark.
- Submit step: in addition, opens that inference's Shaky content (statements and declarations) and its to-be-redone slots.

5.3 Running a step:
- Before the step: commit `step-start` and save step-start-facts.json.
- The step turn (prompts `stepTurn`) gives the target, Q, E so far, what is open, what is fixed, and decisions made earlier while a step ran.
- Today's round runs: check_lean, then freeze_statements (exactly the step target), then prove, then finish, then normalise (pins for scope cards), then the gate with up to maxGateAttempts.
- At the gate:
  - the permitted set B.1 is recomputed on the gated state with E(T);
  - if it differs from the FreezeRecord's, the engine re-exports the challenge (a new Freeze in the same step; statements stay fixed) before G4 (Q15);
  - then RV-11: judgeSession on the same facts. Its findings never count against Claude; they only update items.

5.4 Outcomes:
- Passed: ws/ is reset to the gate-pass commit.
- Gave up: roll back to `lastCommitSince(step.startCommit, PASSING)`, then normalise, re-check, and head the stage with the failures.
- Cap, Cancel step or environment failure: revert to step.startCommit, mark the stage "step failed"/"step cancelled", keep the rest of the queue for Retry, and stop the queue.
- Skipped (Q4): when a source that is an earlier target of the same queue still has no `.holds` at step start, no Claude contact is made. The Result reads not proved, "‹L› was not proved", and Retry is offered.
- A step that proposes nothing (no item) → `proposedNothing` with Claude's summary (RV-13).
- If S₀ itself was not passing, "Claude's step did not pass: …" heads the stage and Accept is disabled until a later step passes.

5.5 After each step: the `pending` decisions are carried out (a decision commit), then judge (the step's facts are reused when no decision changed ws/), then reconcile, then the next step. When the queue is empty the phase becomes `stage`; stage += 1 when the queue came from the start or from Submit.

5.6 Retry step: seals the stack, then re-runs the stored queue from the failed or cancelled step with fresh caps. On the first step's failure, the stage is empty, marked, with Retry and Exit. A step never ends the session.

6. DECISIONS ON THE WORKING COPY AND JUDGING (RV-11, DO-1)
- After a reducer outcome:
  - `planItemRevert(current, base, drafts)` (core/session/revert.ts: core markup primitives remove-decl and setBlockFields) removes the content and restores B's versions: the card becomes code-less again, its pin is removed, an appended id is removed, a target's `.holds` goes back to B (the user's proof, pending axiom, or nothing), and lemmas only that item used are removed;
  - then shadow.writeFiles and a `decision` commit, with the commit id stored on the action and on the items;
  - then scheduleJudge.
- The judge (engine.judge) is one build plus check purpose rules plus judgeSession. Runs are serialised and coalesced: a dirty flag re-runs the judge on the newest head. `judging` disables Submit, endSession and Apply.
- If the judged state does not build: map the errors to the items that own the failing declarations, mark them to be redone ("no longer builds after your decision"), revert them, and judge again (bounded by the number of items). If base plus the accepted items still fails, set stepMark `did-not-pass` (Accept disabled; Exit allowed). Fail closed.

7. SUBMIT REVIEW (RV-12)
- Enabled when nothing is in review, no step runs, nothing is being judged, and the stage is not marked did-not-pass.
- Seal the stack.
- If every item is accepted or rejected (nothing Shaky, nothing to redo), the phase becomes `confirming(apply)` with no Claude step.
- Otherwise: the affected inferences are the origins of Shaky and to-be-redone items, plus the targets of Shaky or to-be-redone Results. Queue one `submit` step per inference in formalizeOrder (Q2).
- The first step turn starts with `submitFeedbackTurn`, built from the statuses with the labels and Lean texts:
  - ACCEPTED: keep them exactly as they are;
  - REJECTED: removed; never propose these exact versions again;
  - SHAKY: propose a different arrangement for these together, with the person's note quoted; any single item may come back unchanged, but not the whole set; if there is no alternative, finish with `no_alternative: true`;
  - TO BE REDONE: what each relied on;
  - STEPS PLANNED.
- At each Submit step's gate:
  - the DO-3 identical-set check: the fingerprint of the Shaky set before and after. An identical set without `no_alternative` → finding `rejected-repeat` (token `shaky-identical`). With `no_alternative` → the items return with the marker `no-alternative-found`.
  - DO-1 exact repeats are refused by the gate (`rejected-repeat`; DO-0 arrows through `arrow`/`rejected`).

8. ADD PREMISE ITEMS (RV-1)
- propose_assumption (after statements are fixed): today's ghost check, with the B.1 permitted set including E(T), and B.2 allowing Q ∪ E ∪ accepted premises. Exact repeats of rejected premises are refused. The check also renders the statement's fully explicit form. The result is a PremiseProposal, which becomes item `premise:<T>:<leanName>`, part of Result(T) and hidden with it.
- Accept: own Accept, since it is a belief item; its dependencies are the declarations its statement mentions; `holdAs: 'axiom'|'pending'`.
- On Accept, core planGhostAdoption, extended additively with `holdAs` (pending = PROPOSITION + `axiom P.holds`), writes the card, the arrow, and the removal of the target's mark, as an `adopt` commit (telelean's write; G5 checks it through `adopted`/`teleleanBlocks` as today).
- The engine renders P's explicit form in place; a mismatch → back to review with `meaning-differs-in-place`.
- If T is not proved, a `completion` step without Claude: telelean writes `theorem T.holds : T := (<checked proof>) P.holds`; engine.complete runs normalise, then gate-proved against the step's freeze with a re-exported challenge (build, footprint, statements fixed, B.2, G4). If it passes, Result(T) → in review, updated. If it fails, Result(T) gets `completion-not-checked` with the failure, and Retry (a Claude step) is offered.
- A second accepted premise for a proved T is written and marked `unused-premise`.
- Rejecting an accepted premise reverts the card, the arrow, the mark and the completion; Result(T) → to be redone.

9. DRIFT (ES-7)
- SessionManager subscribes to `workspace.onDidChange` (typing, saves, file-watcher and git events), debounced by 300 ms, plus once after recovery and right before Apply. Each time it computes `proposals.baseDrift(shadow, workspace.readText, workspace.modelFiles())` (open buffers first, so unsaved edits count). A change is persisted and emitted.
- While `drift` is non-empty, `apply` is `{ok:false, reason: driftRefusal(files)}` ("…Undo those edits in the editor, or exit the session."). Steps go on, nothing is merged, and the base commit is never rewritten.

10. APPLY AND EXIT (EN-1..EN-4); REUSING TODAY'S ACCEPT
- `endSession(apply)`:
  - preconditions: phase stage, not judging, nothing in review, Shaky, to be redone or queued, no did-not-pass mark;
  - phase becomes `confirming`;
  - engine.finalCheck(F = ws/ head):
    - G0 against B;
    - build (reused when F's files hash equals judged.commit's and judged.ok);
    - rules against B with the base-relative exceptions (accepted arrows and premises, pins);
    - judgeSession on F: B.1 footprint ⊆ permitted for every inference, B.2, B.3 acyclic and arrows only into targets, B.4;
    - per proved inference, freezeChallenge on F's permitted set, then G4 (reused only when the commit and permitted hash are the same as a recorded pass);
    - the items recomputed on F must equal the accepted records (`fingerprint === acceptedFingerprint`); a covering failure → refuse;
    - `backstopProblems` (core/session/backstop.ts), computed from B and F directly and independently of computeItems:
      - every new or changed axiom other than shape-passing signature vocabulary, every definition, instance or coercion reaching a statement, and every changed kind, type or value must map to an item accepted with `via: 'own'` where RV-7 requires it;
      - exemptions: an accepted presupposition's helper instance, declarations no statement reaches, and the axiom→theorem change of a `.holds` that an accepted Result proves;
      - every arrow of F is in B or belongs to an accepted arrow or premise item.
  - The result gives `checkId` = hash(F files + statuses).
- `applySession(checkId)`:
  - require the check passed and the same checkId (no status or ws/ change since);
  - backstop again (pure; never reused);
  - `proposals.planApply({ shadow, readReal, shownState: F, label, nodes })`. This is planAccept's no-merge path: real files ≠ base → drift refusal, with plan.drift authoritative (the 1e carry-over);
  - `proposals.apply(plan, workspace, subject)` with action `apply-session` and label `Apply: Formalize for dependencies → ‹targets›`. This gives one history entry and one board Undo step (UN-2), naming the accepted Claude arrows;
  - write `.telelean/subjects/<S>/endorsements.json` ({name, textHash} for each accepted definition and presupposition; core build stops flagging those that match);
  - write layout positions of new cards from Proposed-view moves;
  - append every step's AttemptRecord plus resolution `accepted`;
  - endRun('accepted'). The session stack is gone and the board unlocks.
- Exit: the confirmation lists the counts. `exitSession` appends AttemptRecords with resolution `discarded` and calls endRun('discarded'). decisions.json stays.
- The all-or-nothing Accept: planAccept and apply are reused as above. acceptNow's D-21 rebase block and the `accept-base`/`rebase` writers are deleted (the kinds stay readable).
- The `acceptProposal`, `feedback`, `adoptGhost`, `rejectGhost` and `discardProposal` messages keep working only until the webview switches (2f), then are retired.
- Their replacements: Feedback → a Shaky decline with a note; adoptGhost → accepting a premise item; rejectGhost → rejecting it; discard → Exit.

11. RELOAD (ES-6) AND LEGACY
- recover() reads run.json v2:
  - a step in working or gate → interrupted (Resume uses `--resume` plus the resume turn; never automatic);
  - judging → re-run the judge;
  - confirming → kept, and the check re-runs if it was running;
  - applying → compare the real files with F (finish as applied) or with B (back to confirming); otherwise a notice and drift;
  - `pending` decisions are carried out when the resumed step ends.
- A v1 run in review is converted to a one-step session. The inference is its selection, the step is passed with its verdict, the items are computed from B to ws/, and ghosts become premise drafts. If conversion fails, only Exit is offered.

12. GATE RULE CHANGES (core/src/gate; all additive; with no `stepStart`/`scope` given, the slice-1 behaviour is unchanged)
```ts
RuleInput += { stepStart?: ProjectModel /* S₀ with facts */; scope?: StepScope;
  inference?: { added: string[] /* E(T) */; premisesAccepted: string[]; sessionProofs: Record<string, 'accepted'|'in-review'> };
  rejected?: { arrows: ArrowEnds[]; fingerprints: Record<string, string[]> } }
GateFindingCode += 'arrow' | 'rejected-repeat' | 'holds-kind'
```
- a. Preset: existing-changed compares S₀, not B (text, plus meaning through S₀'s facts).
  - Exempt: the scope target's `.holds` (may become a theorem, prove a pending claim, or replace a proof); openStatements; openDecls.
  - A new token `session` names content proposed earlier in the session, under review or accepted: "leave it exactly as it is in this step".
  - G0, new-axiom and footprintSinceBase keep using B, which is the baseline.
- b. G5 against S₀:
  - `premises:` may only gain ids appended after S₀'s list, and only on scope.target with openDependencies;
  - each appended id must name an existing card of the subject other than the target, not already present;
  - telelean's adoption exception and pins for scope cards stay;
  - `follows_from` may change only through adoption;
  - new blocks only as telelean's.
- c. B.3 `arrow` with tokens cycle, not-target, into-axiom, removed, reordered, rejected, mark, unknown-card. Checks: acyclic over drawn plus verified edges of the current model; no change to any other card's premises; never a DO-0-rejected arrow.
- d. B.4 `holds-kind`: no `.holds` changes kind except the scope target's axiom→theorem of identical type. A theorem never becomes an axiom; a proposition never gets a Lean-axiom `.holds` from Claude.
- e. new-axiom: "existed" = same name AND type in B. During a step an axiom is allowed only as the `.holds` of an AXIOM in fuzzyStatements, as signature vocabulary, or as a presupposition. After the step's freeze, none.
- f. undeclared-premise (B.2) allowed set = Q ∪ E(T) ∪ premisesAccepted. The same applies in the ghost check and in judgeSession for every inference on every judged state and at Apply. It never falls back to `.ilean` references.
- g. permittedAxioms (B.1): sources = Q ∪ E. A source proved in this session with its Result accepted or in review contributes its current footprint, and the in-review case records a Result dependency. Rejected or redone sources contribute nothing.
- h. status-mismatch extended: in a step not finishing proved, the target's `.holds` stays byte-identical to S₀, including removal and changed theorems.
- i. readiness and `chosen` come from scope (target + Q's AXIOM sources + premisesAccepted). proof-before-freeze uses R = S₀.
- j. `rejected-repeat`: drafts whose fingerprint equals a rejected fingerprint for the same key; also DO-3's identical Shaky set.
- k. `describeFinding` gets texts for the new codes.
- l. judgeSession (core/session/judge.ts) returns InferenceJudgment {verdict, why, provedFromNothing, footprint, direct, permitted, dependsOnResults, problems, notNeeded, usesUnselectedDrawn} plus graph-wide B.3. It is pure and uses the facts of the check.

13. PROMPTS AND TOOLS
- Context bundle: the first line is unchanged for the fixtures. It adds a FORMALIZE PLAN (targets in order with their questions), and its OTHER CARDS text becomes: "if the proof needs an existing card with a Lean `.holds`, append its id to the target's `premises:` (reviewed as its own item); otherwise finish not_proved naming it".
- New turns: `stepTurn`, `submitFeedbackTurn`, and `decisionsWhileYouWorked`.
- The system prompt gets the arrows rule and "one target per step".
- finish gains optional `arrows_added: [{source, target, why}]` (explanations only; items come from the diff) and `no_alternative?: boolean`.
- freeze_statements: exactly the step target, once per step. propose_assumption is unchanged.

14. RUNNER API AND MESSAGES
- `RunManager` keeps its existing members (current, onDidChange, answer, resume, dismiss, recover, dispose) and adds:
  - session(): SessionView | null
  - formalize(r: FormalizeRequest)
  - setItemStatus(id, change: ReviewAction)
  - showResult(id, itemId)
  - submitReview(id)
  - cancelStep(id), retryStep(id)
  - undo(id), redo(id)
  - endSession(id, 'apply'|'exit'), backToReview(id)
  - applySession(id, checkId), exitSession(id)
  - rawDiff(id): marks Results shown as seen early
  - moveProposed(id, positions)
- Protocol (core/src/protocol.ts):
  - webview → host: `formalize {inferences}` (startRun kept as a one-inference alias), `setItemStatus {sessionId, itemIds, action, own?, option?, note?, holdAs?, confirmed?}`, `showResult`, `submitReview`, `cancelStep`, `retryStep`, `sessionUndo`, `sessionRedo`, `endSession {kind}`, `backToReview`, `applySession {checkId}`, `exitSession`, `openSessionDiff`, `moveProposed`. All take requestId and have hand-written validators, and all are in RUN_MESSAGE_TYPES, so the ES-9 lock does not refuse them.
  - host → webview: `session {session}`, posted on every save, like `run`.
  - The host's Undo routing: Current → board stack (locked, UN-3); Proposed → `sessionUndo`.

15. STATE MACHINE (session phase / RunState)
```
starting ──▶ step(queue) ──▶ stage ──setItemStatus/showResult/undo──▶ stage (decision commit → judging → stage)
  step: working ⇄ waiting-for-answer ⇄ gate ; pass | gave-up(rollback ≥ S₀) | cancelled/failed(revert to S₀; mark; Retry) | skipped
  stage ──formalize (RV-9)──▶ step(queue) ──▶ same stage
  stage ──submitReview──▶ all decided? confirming(apply) : step(queue of submit steps) ──▶ stage+1
  stage ──endSession(exit)──▶ confirming(exit) ──exitSession──▶ ended(discarded)
  confirming(apply) ──finalCheck──▶ passed ──applySession──▶ applying ──▶ ended(accepted) ; Back to review ──▶ stage
  any step ──cancelStep──▶ stage (marked) ; reload: step → interrupted ──resume──▶ step
```
- **sub_slices:**
  - [1]
    - **id:** 2a
    - **scope:** The pure item engine and the session contracts in core. Contracts: core/src/session.ts (SessionView, ItemView, ItemStatus, ItemKind, markers, StageReportView, InferenceView, StepView, EndConfirmationView). Item computation: computeItems (keys, ownership of declarations, fingerprints, partOfResult). itemDependencies (RV-5), classifyItem (RV-7), and revealed with hiddenCardsOf and maskGraph (RV-6). The status reducer reduceReview: accept, decline with options, review, un-reject, show-result, the RV-8 group rule, cascades (A1, DO-0, RV-5 needs-confirmation), and the session stack undo/redo/seal (UN-4..UN-6). No runner changes.
    - **files:**
      - packages/core/src/session.ts (new)
      - packages/core/src/session/items.ts (new)
      - packages/core/src/session/deps.ts (new)
      - packages/core/src/session/review.ts (new)
      - packages/core/src/session/mask.ts (new)
      - packages/core/src/index.ts
      - packages/core/test/session/items.test.ts (new)
      - packages/core/test/session/review.test.ts (new)
      - packages/core/test/session/mask.test.ts (new)
    - **tests:** All tests are pure vitest with no Lean. They run on ProjectModels built from the hand-written Spyro facts, which have valueConsts (core/test/fixtures/project/spyro*-facts.json), plus small edited copies.
- Keys: they stay the same across two working copies. Fingerprints ignore whitespace. A changed statement keeps its key and the item is marked updated.
- Kinds:
  - new signature vocabulary becomes sub-items under one 'vocabulary' group;
  - a definition in a statement's closure gets its own decl item, classed belief;
  - a presupposition and its helper instance form one item;
  - a lemma goes with the Result whose proof uses it;
  - an appended premises id becomes an add-arrow item, grouped under its target, partOfResult, classed changesProved.
- RV-5: dependencies from mentions; a Result depends on the arrow item its proof uses and on a source's in-session Result.
- Reducer:
  - Accept is refused until dependencies are accepted;
  - an RV-7 item can't be group-accepted;
  - a hidden Result can't be accepted, even inside a group;
  - declining an accepted item's dependency returns needs-confirmation with the list, and nothing changes without confirmed;
  - A1: a Reject makes in-review dependents to be redone (reverted);
  - a Shaky decline makes them to be redone (not reverted);
  - DO-0 makes the Results using the arrow to be redone;
  - un-reject; undo/redo; the seal stops Undo.
- RV-6: hidden until the statement and belief dependencies are decided; hidden again when one returns to review; Show result sets seenEarly. maskGraph strips the verdict, the .holds text, verified edges, direct and the result diagnostics.
- A property test over random action sequences: accepted items always have accepted dependencies.
    - **risk:** Low, since it is pure code with no I/O. The real risk is the size of the test surface and getting item ownership wrong. Mitigation: 2e's backstop is computed independently, so an ownership bug fails closed at Apply instead of leaking.
  - [2]
    - **id:** 2b
    - **scope:** The gate generalised in pure core.
- RuleInput additions: stepStart, scope (StepScope), inference (E(T), premisesAccepted, sessionProofs), rejected.
- Rules:
  - existing-changed and G5 compare against S₀, with scope exemptions and the `session` token;
  - the G5 premises-append exception for Claude's arrows;
  - new code 'arrow' (B.3);
  - new code 'holds-kind' (B.4);
  - new-axiom matches name and type against B;
  - undeclared-premise allows Q ∪ E ∪ accepted premises;
  - status-mismatch extended to removals and changed theorems;
  - 'rejected-repeat';
  - readiness and chosen come from scope.
- permittedAxioms implements B.1 with session proofs and E(T).
- judgeSession, backstopProblems, planItemRevert.
- formalizeStartProblems and formalizeOrder for several inferences.
- describeFinding texts for the new codes.
    - **files:**
      - packages/core/src/gate/types.ts
      - packages/core/src/gate/rules.ts
      - packages/core/src/gate/permitted.ts
      - packages/core/src/gate/describe.ts
      - packages/core/src/gate/index.ts
      - packages/core/src/session/judge.ts (new)
      - packages/core/src/session/backstop.ts (new)
      - packages/core/src/session/revert.ts (new)
      - packages/core/src/formalize.ts
      - packages/core/test/gate/rules.test.ts
      - packages/core/test/session/judge.test.ts (new)
      - packages/core/test/session/backstop.test.ts (new)
      - packages/core/test/session/revert.test.ts (new)
      - packages/core/test/formalize.test.ts
    - **tests:** Regression: core's existing gate tests pass unchanged, since without stepStart or scope the old behaviour holds.
New rule cases, each with a pass case and a fail case:
- Preset:
  - changing a statement Claude formalised in an earlier step → existing-changed with token session;
  - filling a fuzzy statement passes;
  - changing a non-fuzzy empty card's binding → G5.
- Arrows:
  - appending an id to the step target's premises passes;
  - appending to another card → arrow/not-target;
  - removing or reordering → arrow/removed or reordered;
  - a cycle → arrow/cycle;
  - a previously rejected arrow → arrow/rejected;
  - a target with the ∅ mark → arrow/mark.
- B.4: a theorem `.holds` replaced by an axiom → holds-kind; proving a pending target passes.
- new-axiom: same name with a different type → new-axiom.
- B.2: a proof using an E(T) source passes; an unselected card is refused; a source-only walk is refused.
- B.1: a source proved in this session with an in-review Result is permitted and recorded as a dependency; a rejected source contributes nothing.
- judgeSession on a three-target chain; backstop refuses an unaccepted axiom or definition or a changed kind, and accepts the exemptions.
- planItemRevert round trips: revert followed by the inverse returns the same text, and the result parses with an unchanged block set.
- formalizeOrder: X→L→A orders L before A, and independent targets keep reading order.
    - **risk:** Medium-high. These are the security-critical rules. Two dangers: a relaxation that is not gated on `scope` would weaken slice 1 runs, and a wrong S₀ comparison would let Claude edit content under review. Mitigation: the new behaviour is opt-in through the new fields, and failures must stay fail-closed. A separate reviewer should check this slice.
  - [3]
    - **id:** 2c
    - **scope:** Runner engine and shadow support for steps.
- Shadow: commit kinds step-start, decision and completion, plus lastCommitSince.
- CheckContext additions: scope, stepStartCommit, inference, inferences, rejected. CheckReport.session.
- engine.runCheck: loads the S₀ model with step-start-facts.json and calls judgeSession.
- engine.gate: re-exports the challenge when the inference's B.1 set changed since the freeze.
- engine.checkGhost uses B.1 with E(T) and renders the explicit form.
- New engine.judge (no Claude); engine.finalCheck (per-inference fresh challenges and G4, reuse rules, items equal accepted); engine.complete (premise completion).
- ProposalService.planApply: no merge, drift is authoritative.
    - **files:**
      - packages/runner/src/shadow/types.ts
      - packages/runner/src/shadow/workspace.ts
      - packages/runner/src/gate/types.ts
      - packages/runner/src/gate/engine.ts
      - packages/runner/src/gate/findings.ts
      - packages/runner/src/proposal/types.ts
      - packages/runner/src/proposal/service.ts
      - packages/runner/test/gate/engine.test.ts
      - packages/runner/test/proposal/accept.test.ts
      - packages/runner/test/run/helpers/fakeEngine.ts
    - **tests:** Plumbing unit tests use a fake refreshFacts: S₀ facts are loaded, judgeSession runs, the scope reaches evaluateRules, and lastCommitSince never returns a commit older than step-start.
Real-Lean tests are capped and run one file at a time, and only when RAM allows (the existing 12 GB rule):
- an arrow appended after statements are fixed triggers a re-challenge, and G4 passes;
- finalCheck refuses a state whose footprint falls outside a recomputed permitted set;
- a premise completion builds and passes G4;
- judge after a decision revert builds.
planApply refuses when real ≠ base and changes nothing; the existing accept.test covers the atomic drift case.
    - **risk:** Medium. These add Lean jobs: RAM, and time per judge or final check. Keep everything under runExclusive with the memory guard, coalesce judges, and reuse a final check only when the files hash matches.
  - [4]
    - **id:** 2d1
    - **scope:** SessionManager core.
- Extract StepRunner (run/step.ts) from RunManagerImpl: turn loop, tool host, caps, gate loop.
- Sessions and steps:
  - PersistedRun v2 with PersistedSession;
  - formalize with several inferences, ordered sources first, one step each;
  - step-start commits and scope;
  - outcomes: passed, gave up with rollback bounded by S₀, cancelled or failed with a revert to S₀, skipped (A12);
  - after each step: judge, reconcile items with stable ids, then the stage;
  - mid-stage Formalize; Accept (own or group); Show result.
- Cancel and Retry step.
- Reload: a step becomes interrupted and can be resumed; a stage comes back; a v1 run is converted.
- SessionView built with redaction.
- Prompts and tools: context-bundle plan, stepTurn, system-prompt arrows rule, finish's optional fields.
    - **files:**
      - packages/runner/src/run/step.ts (new, extracted)
      - packages/runner/src/run/manager.ts
      - packages/runner/src/run/types.ts
      - packages/runner/src/run/persist.ts
      - packages/runner/src/run/prompts.ts
      - packages/runner/src/run/systemPrompt.ts
      - packages/runner/src/llm/toolSchemas.ts
      - packages/runner/src/llm/types.ts
      - packages/runner/test/run/fixtures/system-prompt-5.1.txt
      - packages/runner/test/run/manager.session.test.ts (new)
      - packages/runner/test/run/manager.*.test.ts (adapted)
      - packages/runner/test/run/prompts.test.ts
    - **tests:** All use FakeBackend scripts and the fake engine; no Lean and no real Claude.
- A three-target chain runs L before A, one step each. Every step turn names its target, and items appear with stable ids across stages.
- A12: when L ends without a `.holds`, A's step is skipped without contacting Claude.
- Give-up rolls back to the step's gate-pass, freeze or start, never to the base or to an earlier step's content.
- Cancel during step 2 keeps step 1's items, marks the stage, and Retry re-runs step 2 and the rest of the queue. Cancelling the first step gives an empty stage with Retry and Exit.
- A mid-stage Formalize joins the current stage and seals the stack.
- Reload during step 2 gives interrupted, and Resume sends the resume turn. Reload in a stage restores statuses, versions and the stack.
- A v1 run.json in review is converted.
- The posted SessionView never contains a hidden Result's verdict, proof text, premise or arrow items. Checked by serialising the view and searching for the proof text.
- prompts golden tests; the existing manager tests are kept in intent (Accept tests move to 2e).
    - **risk:** High. This is the largest refactor of a 2369-line class with heavy existing coverage. Keep the extraction behaviour-preserving first, with all existing manager tests green, before any session behaviour is added.
  - [5]
    - **id:** 2d2
    - **scope:** Declines, judging and Submit review.
- Decision commits through planItemRevert. Judge coalescing. The broken-build cascade. Decisions made during a step are queued and carried out at its end.
- The Rejected list and un-reject (3-way inverse of the decision commit).
- Shaky with an optional note.
- Submit review: the all-decided path goes to the confirmation; otherwise a queue of Submit steps with submitFeedbackTurn, each with scope opening the Shaky and to-be-redone slots.
- The DO-3 identical-set check and no_alternative; DO-1 exact-repeat refusal.
- Session Undo and Redo.
    - **files:**
      - packages/runner/src/run/manager.ts
      - packages/runner/src/run/prompts.ts
      - packages/runner/src/proposal/files.ts
      - packages/runner/test/run/manager.review.test.ts (new)
      - packages/runner/test/run/prompts.test.ts
    - **tests:** FakeBackend and the fake engine.
- A Reject commits a `decision` that removes exactly the item's content, then judging runs; A1 cascades.
- A Reject on an item an accepted Result depends on returns needs-confirmation, and cancelling changes nothing.
- DO-0 on an arrow makes the using Results to be redone and reverts their proofs.
- A Reject made while a step runs is applied after the step, and the rollback never undoes it.
- Un-reject re-applies the content, and is refused when Claude proposed a newer version.
- Shaky then Submit: one step per affected inference, sources first; the feedback text matches a golden file.
- An identical Shaky set gives a gate finding; with no_alternative the items come back marked no-alternative-found.
- An exact repeat of rejected content gives a rejected-repeat finding.
- Undo of a Reject; Undo stops at the Submit seal.
- A revert that breaks the build marks the owning items to be redone and converges.
    - **risk:** High. Working-copy mutations must stay consistent with the item table. Mitigation: every mutation is followed by a judge, and reconcile fails closed on an inconsistency.
  - [6]
    - **id:** 2d3
    - **scope:** Add premise items.
- Premise drafts come from propose_assumption.
- Accept as axiom or as pending: planGhostAdoption gains holdAs.
- The explicit-form re-check in place (meaning-differs-in-place).
- A completion step without Claude (engine.complete), with the completion-not-checked marker.
- A second premise is marked unused. Rejecting an accepted premise reverts the card, arrow, mark and completion.
    - **files:**
      - packages/core/src/gate/adoption.ts
      - packages/core/src/gate/types.ts
      - packages/runner/src/run/manager.ts
      - packages/runner/src/gate/engine.ts
      - packages/core/test/gate/adoption.test.ts
      - packages/runner/test/run/manager.premise.test.ts (new)
    - **tests:** - Accepting as axiom: telelean writes the card and the arrow (the target's mark is removed); the completion passes; Result(T) returns to review, updated, as proved.
- Accepting as pending: a PROPOSITION with `axiom P.holds`, a belief item, own Accept required.
- A failed completion sets completion-not-checked, and Retry is offered.
- An explicit-form mismatch sends the item back to review marked meaning-differs-in-place.
- A premise is hidden until Result(T) is revealed.
- Rejecting an accepted premise reverts everything and makes the Result to be redone.
- Core adoption tests for holdAs pending: the planner refuses anything else.
    - **risk:** Medium. The completion term may fail to elaborate, so completion-not-checked must never read as 'proved'.
  - [7]
    - **id:** 2e
    - **scope:** Apply, Exit and drift, plus cleanup.
- endSession and the confirmation, with finalCheck and the backstop.
- applySession: same checkId, drift atomic, backstop again, planApply and apply with action apply-session, one history entry and one Undo step.
- The endorsements sidecar, with core build reading it for the definitional-choice flag.
- Positions of new cards. Attempt records at the end of the session, which fixes the S7 leak.
- exitSession.
- The drift watcher on workspace.onDidChange.
- Delete the D-21 rebase block and the accept-base/rebase writers.
    - **files:**
      - packages/runner/src/run/manager.ts
      - packages/runner/src/proposal/service.ts
      - packages/runner/src/proposal/sidecarStore.ts
      - packages/core/src/paths.ts
      - packages/core/src/project/build.ts
      - packages/runner/test/run/manager.apply.test.ts (new)
      - packages/runner/test/proposal/apply.test.ts
      - packages/core/test/project/endorsed.test.ts (new)
    - **tests:** - Apply writes exactly F: rejected content never reaches the files, accepted content all does, with one history entry and one Undo step. Undo restores the base.
- Apply is refused while there is drift. The watcher sets drift on a hand edit and clears it when the edit is undone, live, without a reload. Files changing between the check and the click give a refusal with nothing applied.
- A changed status or ws/ after the check makes the checkId stale, and Apply is refused.
- A tampered ws/ (an axiom no accepted item covers) is refused by the backstop even when the final check is reused.
- The final check is reused only when the files hash is identical.
- Exit writes no model file.
- No attempt verdict reaches graph.attempts before the end of the session.
- An endorsed definition is no longer flagged; changing its text flags it again.
    - **risk:** Medium-high. This sub-slice writes the user's files, though only through the existing recorded write path (applyChanges). Keep the 1e atomic-drift rule and the snapshot-first history.
  - [8]
    - **id:** 2f
    - **scope:** Protocol and extension host.
- New webview→host messages with validators: formalize, setItemStatus, showResult, submitReview, cancelStep, retryStep, sessionUndo, sessionRedo, endSession, backToReview, applySession, exitSession, openSessionDiff, moveProposed. They go in RUN_MESSAGE_TYPES.
- The host→webview `session` message.
- boardSession routing and publishing. The ES-9 lock keeps its semantics, and session actions are not refused by it.
- Undo routing by view (UN-1, UN-3).
- startRun stays an alias until the webview switches; then the old review messages are retired.
    - **files:**
      - packages/core/src/protocol.ts
      - packages/core/test/protocol.test.ts
      - packages/extension/src/logic/boardSession.ts
      - packages/extension/src/logic/runs.ts
      - packages/extension/test/unit/*session*.test.ts (new)
    - **tests:** - Validators accept good payloads and refuse ids outside the token pattern, empty itemIds, unknown actions and options, and holdAs given on a non-accept action.
- Routing reaches the manager.
- During a session, board edits, board Undo and History revert are refused with EDIT_SESSION_ACTIVE. Session messages are not refused.
- sessionUndo acts only on the session stack.
- No vscode-dependent code in core.
    - **risk:** Low-medium. The risk is the switch-over window while the old review UI still sends the old messages. Keep the aliases until the webview's slice-2 builder lands.
- **open_questions:**
  - Q1: How does Claude propose an arrow into a target? Recommended: by appending ids to the target's `premises:` line in the working copy. Items come from the diff between base and working copy, which keeps RV-1 uniform. G5 allows appends only on the step's target and B.3 checks them. finish's optional `arrows_added` carries Claude's reasons, for display only. The alternative, a `propose_arrow` tool with telelean writing the arrow, needs a new commit kind and a G5 reference model.
  - Q2: How is RV-12's 'one Claude step' at Submit run? Recommended: one step per affected inference, sources first, in the same Claude conversation. This keeps invariant S (one target, one freeze and one G4 per step, as ES-2 does). Log it as an autopilot departure from RV-12's wording.
  - Q3: What happens to a Reject or decline made while a step runs? Recommended: record it at once (status, Rejected list, session stack) and carry it out on the working copy when the step ends. Claude is told in its next turn. Accept is allowed during a step, since it does not change the working copy. The alternative, disabling Decline while a step runs, is simpler but blocks reviewing during 20-minute steps.
  - Q4 (A12): an earlier target of the same Formalize ended without a `.holds`. Recommended: skip the dependent target's step without contacting Claude, so no quota is spent. Its Result reads 'not proved: ‹L› was not proved', and Retry step is offered.
  - Q5: Where is RV-6 hiding enforced? Recommended: on the host. The runner leaves hidden items and Result details out of SessionView, and core maskGraph strips hidden verdicts, `.holds` texts, verified edges and band data before posting. 1d's webview overlay stays as a second layer.
  - Q6: Can a Result be accepted while it is hidden, for example inside a group Accept? Recommended: no. A Result must have been revealed before the Accept action, so a group Accept skips it and says why. This prevents accepting a proof that was never seen (S7).
  - Q7: Slice 2 has no free-text channel to Claude. Feedback is gone and Transform's instructions come in slice 4. Recommended: a Shaky decline takes an optional note, quoted in the Submit feedback. 'Ask me instead' in the stage report becomes a Shaky decline with 'Ask me about: …' prefilled.
  - Q8: How does DO-2 Transform behave before slice 4? Recommended: it is listed but disabled, with the reason 'The transform window is not built yet: use Shaky with a note, or Reject.' It is never offered on Results or arrow items.
  - Q9: Can a Shaky step split or merge cards in slice 2? Recommended: no. A Shaky step re-proposes content only, because creating and deleting cards needs the transform rules (TR-13, CF-3 exceptions). Split and merge come with slice 4.
  - Q10: What happens to a run.json v1 that is still in review after the upgrade? Recommended: convert it to a one-step session, with items computed from base to ws/ and ghosts turned into premise drafts. If the conversion fails, offer Exit only.
  - Q11: How often does the comparator (G4) run? Recommended:
- RV-11 re-judging after every step and decision is rules-level (footprint against the recomputed B.1 set, B.2, statement integrity) on one shared build;
- G4 runs for the step's own target at its gate;
- G4 runs for every proved inference at Apply, with fresh challenges, reused only when the commit and permitted hash match a recorded pass.
  - Q12: Are 'Open the whole model' and 'Claude may add cards' in slice 2? Recommended: no, both move to slice 3. They need standing freezes, B.3 removals, Proof broken and the card-creation rules. Formalize's ▾ is hidden in slice 2.
  - Q13: What happens to an item whose content Claude removed in a Shaky step? Recommended: a new status, `withdrawn`. It needs no decision, does not block Submit or Apply, and is listed in the stage report.
  - Q14: Where are endorsements recorded (EN-3)? Recommended: in a sidecar, `.telelean/subjects/<S>/endorsements.json`, holding {Lean name, hash of the declaration text}. Core build stops showing 'needs your endorsement' while the hash matches.
  - Q15: Claude adds arrows after statements are fixed, so the permitted set grows during the prove stage. Recommended: the engine re-exports the challenge at gate time when the inference's B.1 set differs from the freeze's. Statements stay fixed, and the arrows are own-Accept items the Result depends on. The alternative, requiring Claude to call freeze_statements again, adds a second 'statements fixed' event per step.
  - Q16: When are attempts.jsonl records written? Recommended: at the end of the session (Apply or Exit, and on recovery of a crashed session), kept in run.json until then. Today they are written at round end and the Current board lists their verdicts before the reveal, which is an S7 leak.
  - Q17: Can the user select one of Claude's arrows as part of a mid-stage question? Recommended: only once it is accepted ('accepted arrows become yours', §14.2). An in-review arrow is disabled for selection, with the reason 'Accept this arrow first.'
  - Q18: Which Result items need their own Accept? Recommended: follow RV-7's wording, so only a Result that replaces a proof existing at B, or proves a statement changed in the session, needs its own Accept. Combined with Q6, every Result is still seen before it is accepted. The alternative, own Accept for every Result, costs one click per target.
  - Q19: Are the empty statements of Claude's own arrow sources (E(T)) fuzzy? Recommended: no. Only the ends of the selected arrows are fuzzy (ES-2's wording), so Claude adds arrows only from cards that already have a `.holds`. Otherwise it finishes not proved and names the card.
  - Q20: Is there one Claude conversation per session, or one per step? Recommended: one per session, continued with new step turns. It reuses the cached context and keeps the answers to questions. Caps apply per step. After a reload it is resumed with `--resume`, as today.
- **safety_notes:**
  - Files change only at Apply (§14.1, ES-5). Steps, decisions, judging, Submit and Exit never call ModelWorkspace.applyChanges, perform or invalidate. Test: a spy workspace in the manager.session, review and apply tests asserts that applyChanges is called exactly once, at Apply, with exactly F's files.
  - The base never moves, and nothing is merged (ES-7, §14.11). The `base` commit is made once. No code path writes the user's files into the shadow: D-21's rebase and the accept-base writer are deleted. Apply refuses when there is drift, and plan.drift is authoritative. Tests: the base commit id is the same throughout a session; the watcher's live drift disables Apply; files changing between the final check and Apply give a refusal with nothing applied (the 1e carry-over test, generalised).
  - Accepted items always form a self-contained whole (RV-5, §14.4). The reducer refuses Accept without accepted dependencies, and cascades with needs-confirmation. Reconcile re-enforces this defensively. Test: a property test over random action sequences in core, plus a runner test that a dependency changed by a step pulls its accepted dependents back to review.
  - Nothing becomes an assumption without an individual Accept (RV-7, §14.5). Classes are recomputed on every judged state. Group Accept skips RV-7 items. The backstop runs on every Apply click, is never reused, and is computed from B and F independently of computeItems. Tests: a tampered working copy with an uncovered axiom or definition is refused even with a reused final check; a group-accepted item that becomes a belief returns to review.
  - Meaning before proof (RV-6, §14.6, S7):
- the host leaves hidden Results' verdict, proof text, footprint, band, their premise and arrow items, lemmas, Claude's summaries and 'Assumed without asking' out of SessionView, and masks the graph;
- a Result is never accepted while hidden;
- Raw diff counts as Show result;
- attempt records are written at the end of the session, which fixes today's leak in CardDetails.
Tests: the posted JSON contains no hidden proof text or verdict; graph.attempts carries no verdict of the open session.
  - The preset is enforced mechanically and never by asking Claude (ES-2, S1, S11). existing-changed and G5 compare against the step start S₀ with an explicit StepScope, so content under review or accepted cannot be edited by a later Formalize step. Tests: FakeBackend steps that edit an earlier step's statement, weaken a target to `∨ True`, or change another card's premises each get a counted gate finding.
  - 'Proved' rests on exactly B.1's set for each inference (§14.2). The permitted set is recomputed on every judged state with E(T) and session proofs. A session-proved source's footprint counts only together with a Result dependency. A Claude-proved source never widens its own set (permitted.ts rule kept). Tests: A depends on L's Result; rejecting L's Result makes A to be redone; finalCheck refuses a footprint outside the recomputed set.
  - No hidden edges (B.2, §14.7) on every judged state and at Apply, for every inference, including the ghost check and the completion. It uses only the elaborated walk and refuses on source-only facts. Tests in 2b and 2d3.
  - Kinds and pending claims are the user's (§14.10, B.4, S19). Claude never writes `type:` (G5), never writes a Lean-axiom `.holds` for a proposition (new-axiom and holds-kind), never appends arrows except into the step target (a proposition), and never touches `follows_from`. A pending premise is written only by telelean after the user's Accept with holdAs pending. Tests in 2b and 2d3.
  - No cycles (§14.9, B.3). Claude's appended arrows are cycle-checked over drawn plus verified edges at the gate, and the arrow graph of F is checked at Apply. Formalize start validation keeps AP-13. Tests in 2b.
  - A rollback never undoes the user's decisions (ES-4). The rollback is bounded by the step's `step-start` commit, which comes after every decision carried out. Decisions made during a step are carried out after the step ends. Test: a Reject made while a step runs survives that step's give-up rollback and its Cancel.
  - Exact repeats are refused (DO-1, DO-0, DO-3): rejected fingerprints and arrows are passed to the gate (rejected-repeat, arrow/rejected), and an identical Shaky set is refused unless Claude declares no_alternative. A reworded repeat is not detectable (S13), and is harmless because it is just another item to review.
  - Undo never crosses Claude or the views (UN-1, UN-3, UN-5, UN-6, S22). The session stack is sealed at Submit, mid-stage Formalize, Retry and answers, and discarded at the end of the session. The board stack stays locked while a session is active (ES-9 lock unchanged: runLocksBoard covers the whole session). Tests: core stack tests; an extension test that board Undo is refused and sessionUndo is routed.
  - The working copy stays consistent. Every telelean mutation (decision, adopt, completion) is followed by a judge. A state that fails to build marks the owning items to be redone and converges, or the stage is marked did-not-pass with Accept disabled. Reconcile fails closed on content that vanished unexpectedly. Test: a revert that breaks the build converges in a bounded number of rounds.
  - Session state is out of Claude's reach (S3). run.json, the facts files and the item table live in the run directory, outside ws/, which is Claude's cwd behind the path guard. Claude only learns statuses through the generated feedback turn.
  - Tests never call real Claude: FakeBackend scripts, the fake engine and recorded streams, with TELELEAN_NO_REAL_CLAUDE=1. The quota tripwire tests stay. Real Lean runs only in capped engine tests, one file at a time, and skipped below the RAM threshold. Nothing is built into packages/extension/dist. A webview test build goes to a scratch TELELEAN_WEBVIEW_OUT folder.
  - Egress consent is unchanged. Consent per model root is still asked before the first Claude contact. Mid-stage Formalize, Submit steps, Retry and Resume continue the same consented session. A skipped step (A12) and a completion contact nobody.
  - Fail closed everywhere:
- the gate refuses rather than guesses (UNSEEN_PROOF);
- Apply needs the final check to pass for the same checkId, no drift, and the backstop again;
- recovery of an interrupted Apply compares the real files with F and with B before finishing, and never re-applies blindly;
- a reload never resumes Claude by itself.
