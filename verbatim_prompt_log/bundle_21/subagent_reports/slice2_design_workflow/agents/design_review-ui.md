# design:review-ui

Agent `ae02409363ac53491` of workflow `wf_bd9a405e-4c7`. Verbatim output (JSON alongside).

- **summary:** Slice 2's review UI, built on one host-computed `SessionView` that already applies RV-6. The webview renders the review list (the status table) with a detail pane and the RV-10 stage report above it. On top of that come decline options (DO-0 to DO-3), group Accept/Decline (RV-8), the CM-6 session bar, the EN-2 end confirmation, a session Undo routed by view (UN-4 to UN-6) and the ES-7 drift notice. In the Proposed view, Claude's arrows are drawn translucent with a + or − badge, and no hidden result shows anywhere.

The protocol gets one new host→webview message (`session`, with a light validator) and ten new webview→host messages, each with a hand-written validator: `formalize`, `decideItems`, `revealResult`, `sessionUndo`, `sessionRedo`, `submitReview`, `endSession`, `retryStep`, `openSessionDiff`, `sessionMoveCards`.

Every decision carries what the user saw:
- the item's revision and the stage;
- the Undo step id;
- the Results a reveal will show;
- the final check's id.

The host refuses any mismatch. Shared pure rules live in core (`planGroupAccept`, `acceptBlock`, `submitPlan`, `revealClosure`, `orderInferences`). The UI uses them to preview and the host uses them to enforce. RV-6 masking (`affectedByHidden`, `maskProposedGraph`) is computed on the host, outcome-independent, and tested by an indistinguishability property.

Nine sub-slices, rv1 to rv9, in dependency order.

I also found RV-6 leaks in slice 1's current Proposed view (more below) and give a webview-only quick fix to apply before slice 1 ships to dist:
- "changed" badges and "result after the review" chips on downstream cards, and the banner's changed count;
- the expanded target's Lean code showing its new proof;
- new proof-only lemmas;
- the Raw Lean diff.
- **current_state:** WHAT EXISTS TODAY (slice 1, with 1e in progress; read-only survey)

The review is a one-proposal stepper (M2, D-19), not a list:
- packages/webview/src/run/Review.tsx:275-352 `Review`: steps from model/run.ts:474-482 `reviewSteps` (Statement 1..N, New vocabulary, Definitions, Result). Back/Next via store `reviewGo` (state/store.ts:2385-2391); the Result is revealed after the last statement step (`pastStatements`, model/run.ts:485-488) or by "Show result" (`revealResult`, store.ts:2393-2397).
- Statement step (Review.tsx:31-83): sentence above Lean, the Fully explicit checkbox (`toggleExplicit`), "It uses" closure. Vocabulary step (Review.tsx:90-118): auto-approved, with Revoke… = Feedback. Definitions (Review.tsx:120-169): yes/no; Accept needs every yes (`definitionsApproved`, model/run.ts:498-505).
- Actions (Review.tsx:235-273): Accept (all-or-nothing `acceptProposal`, store.ts:2443-2460), Feedback… (free-text `feedback`), Discard, Raw Lean diff….
- ReportCard (run/ReportCard.tsx:49-255): verdict, Rests on, self-evident flag, unused premises, consistency, Claude's summary, gap with 1e's missing-arrow hints (model/run.ts:556-581), "Assumed without asking" with Ask me instead (prefilled Feedback), ghost suggestions (run/GhostSuggestion.tsx:18-120: I hold this / No → adoptGhost / rejectGhost), gate attempts, files, usage.
- Review state: store.ts:352-369 `ReviewUi` (step, revealed, explicit, definitions, feedback) and store.ts:384-405 `RunUi` (run, proposal, overlay, proposedView, review, runBusy …). Applying host data: `applyRun` (store.ts:1537-1570) and `applyProposal` (store.ts:1573-1592).
- Proposal banner (run/ProposalBanner.tsx:12-80): diff counts, Current|Proposed toggle, Review…/Accept/Feedback/Discard/Raw Lean diff. It sits above the board in App.tsx:17.
- Run panel (run/RunPanel.tsx:355-423): status line, single-target line (`Target`, :180-194), questions, notices, the review, folded activity.

Protocol (packages/core/src/protocol.ts):
- host→webview `run` (RunView) and `proposal` (ProposalView): :73-75, light checks :844-860.
- run messages :185-215: startRun{target,premises}, answerQuestions, cancelRun, resumeRun, acceptProposal{definitions}, feedback, discardProposal, adoptGhost, rejectGhost, openProposalDiff, dismissRun.
- RUN_MESSAGE_TYPES :257-269, LIMITS :295-310, RUN_TOKEN_PATTERN :315, validators :743-791.
- core/src/run.ts: RunView :288-332 (one target and premises; `verdict`), StatementReview/VocabularyReview/DefinitionQuestion/ReportCard/ProposalView :366-473.
- ActionOutcome (core/src/actions.ts:238-251) has no field for review results.
- Host routing: extension/src/logic/boardSession.ts:340-372 `dispatchRun`; startRun with consent, preflight and the 1e start check :385-407; `publishRuns` :262-270; the ES-9 lock :417-425. extension/src/logic/runs.ts:28-30 `isRunRequest`.
- RunManager interface: runner/src/run/types.ts:154-196 (start/answer/cancel/resume/accept/feedback/discard/adoptGhost/…); ProposalService.build (runner/src/proposal/service.ts:122-180) builds one ProposalView per round.

Proposed view (1c-1d):
- model/run.ts:647-706 `buildOverlay`: the proposal graph plus removed cards. The `hidden` set is the target, cards whose proof changed, and every card whose `resultSignature` (:740-745) differs.
- NodeCard.tsx:158-171 swaps result chips for RESULT_HIDDEN_CHIP and never shows green; DiffBadge (:33-42, :255) comes from GraphDiff. edges.ts:34-72 `toDisplayEdges` drops the hidden card's verified edges and its "not used" tooltip; bands skip hidden cards (Board.tsx:82-91, band.ts).
- No notion yet of Claude's arrows as items (Claude adds no arrows in slice 1).
- Selection is off in the Proposed view (gestures.ts `gestureGate`; menu.ts `menuSelection` readOnly).

Context Menu (1e, being built):
- header/ContextSection.tsx and board/contextActions.ts:74-93 `formalizeState`. It accepts arrows into ONE target and is otherwise disabled with FORMALIZE_TEXTS.several (:28).
- AR-8 dialog: DialogState 'formalize' (store.ts:275-283).
- core/src/formalize.ts:125-148 `formalizeStartProblem` checks one target.

Undo: Header.tsx:86-117 `UndoRedo` and main.tsx:109-125 `installShortcuts` act only on the board stack. During a run they are locked (`undoLock`, store.ts:683-685); in the Proposed view they show PROPOSED_NO_UNDO (store.ts:661: "its own stack comes with slice 2"). Drift: only `ProposalView.baseChanged` at build time (Review.tsx:323-329). AP-18 defers the live notice to the session bar.

RV-6 LEAKS FOUND IN TODAY'S PROPOSED VIEW (slice 1d code; they show the outcome before the review):
(1) Downstream cards. core/src/proposal/diff.ts:44-59 and :76-79 mark a downstream card "changed" (fields proof, status) when the target's proof changes its footprint or makes it established. model/run.ts:672-675 then puts that card in `hidden`. So the card gets the "~ changed" DiffBadge (NodeCard.tsx:255) and the "result after the review" chip (NodeCard.tsx:162), and the banner's "N changed" count (ProposalBanner.tsx:32, model/run.ts:508-517) rises. All of this happens only when the target was proved.
(2) The hidden target's expanded card. CardDetails.tsx:489-490 shows `lean.code`, which includes the `.holds` text, i.e. the new proof (model.ts:112). Only "Rests on" is hidden (CardDetails.tsx:165).
(3) Proof-only lemmas. New proof-only lemmas appear in the Vocabulary band with "+N new" (Vocabulary.tsx:303-353), and in `externalUsers` ("Used by") of the sources.
(4) The raw diff. Raw Lean diff… opens without counting as Show result (ProposalBanner.tsx:70, Review.tsx:261); v4.1 RV-6 requires it to count.
- **design:** REVIEW UI FOR SLICE 2 — webview + protocol (design; the integrator reconciles names with the session-engine design)

0. PRINCIPLES
P1 Host owns the session.
- The RunManager owns: items, statuses, RV-7 classes, RV-5 dependencies, reveal state, the session stack, the working copy, drift, and the end confirmation (B "session state lives with the run").
- It posts one `SessionView`. The webview renders it and turns gestures into messages.
- The webview never computes verdicts, classes, dependencies or reveal state. Where it previews a rule (group Accept, Submit), it calls the same core pure function the host enforces with.
P2 RV-6 by construction.
- The host builds the SessionView with one core function that applies RV-6 everywhere:
  - a masked board graph;
  - hidden items left out;
  - dependencies, counts and report sections without anything hidden.
- Nothing the webview receives depends on an unrevealed Result's outcome. This is tested as an indistinguishability property in core (§3.4).
- The webview's only hiding is cosmetic: the neutral chip on hidden targets.
P3 You decide exactly what you saw. Each request carries what the user saw, and the host refuses a mismatch with `conflict` and the text "‹item› changed since you looked at it: look again.":
- every decision carries the item's `rev` and the `stage`;
- Undo carries the stack `step`;
- Show result carries the Results it will reveal;
- Apply carries the final check `id`.
P4 Nothing accepted as a side effect.
- One message per user action.
- Cascades come back as `needs-confirmation` with the list.
- Group Accept takes only what RV-8 allows, and reports what it left and why.
P5 Reuse what exists:
- the renderers in Review.tsx (StatementStep, VocabularyStep, DefinitionItem) and ReportCard.tsx (CardName, footprint, gate attempts, files), moved to run/review/parts.tsx;
- 1d's band.ts/cardData.ts (chips, glow, footprintEntries, bandsOf);
- 1e's contextActions/menu/runAction;
- common Modal/Popover, AgentText/UserText (D-15 provenance).

1. CONTRACTS — packages/core/src/session.ts (new; exported from core/src/index.ts)
```ts
export type SessionPhase = 'step' | 'review' | 'ending' | 'interrupted';
export type ReviewStatus = 'in-review' | 'accepted' | 'declined' | 'to-be-redone';
export type DeclineOption = 'plain' | 'reject' | 'shaky' | 'transform';   // plain = arrow items (DO-0)
export type OwnAcceptClass = 'belief' | 'changes-proved';                  // RV-7
export type ReviewItemKind = 'add' | 'add-premise' | 'add-arrow' | 'remove-arrow' | 'change' | 'formalize'
  | 'delete' | 'vocabulary' | 'declaration' | 'result' | 'proof-broken';
export type ItemMarker = 'updated' | 'no-alternative-found' | 'meaning-differs-in-place' | 'completion-not-checked'
  | 'adds-no-new-basis' | 'replaces-from-nothing' | 'replaces-your-proof' | 'sentence-lean-may-disagree'
  | 'seen-early' | 'unused-premise';

/** A card as an item names it (renderable even when the card is not on the board on screen). */
export interface CardRef { id: string; type: NodeType; sentence: string; wordedBy: 'user' | 'agent' }
export interface LeanStatementView { name: string; pretty: string; explicit: string; closure: StatementReview['closure'] }

export interface SessionView {
  runId: string;                 // a session is a run with rounds (Appendix B); RUN_ID_PATTERN
  subject: string;
  stage: number;                 // review stage = round; mid-stage Formalize keeps the number
  phase: SessionPhase;
  inferences: InferenceView[];   // sources first (core orderInferences)
  stepOutcome: StepOutcomeView | null;   // ES-4 heading of this stage
  items: ReviewItemView[];       // RV-6: hidden items are never included
  rejectedVersions: RejectedVersionView[]; // DO-1 versions superseded by a reworded repeat (view only)
  report: StageReportView;       // RV-10 parts that are not per item
  board: StageBoardView;         // the Proposed view, masked (RV-6)
  undo: { step: number; label: string } | null;   // UN-4 top of the session stack
  redo: { step: number; label: string } | null;
  sealed: { by: 'submit' | 'formalize' | 'retry' | 'answer'; at: string } | null;  // UN-5
  drift: { files: string[] } | null;             // ES-7, live watcher
  ending?: EndingView;                            // phase 'ending' (EN-2)
  checking: boolean;                              // working copy being re-checked after a decline
  events: SessionEventView[];                     // telelean's own item changes, newest last (max 50)
}
export interface InferenceView { target: string; premises: string[]; fromNothing: boolean; result: string;
  step: 'queued' | 'running' | 'passed' | 'did-not-pass' | 'cancelled' | 'failed' }  // step outcome, never a verdict
export interface StepOutcomeView { kind: 'did-not-pass' | 'cancelled' | 'failed'; text: string; firstStep: boolean; canRetry: boolean }

export interface ReviewItemView {
  id: string; rev: number; kind: ReviewItemKind;
  group: { kind: 'card'; card: CardRef } | { kind: 'vocabulary' } | { kind: 'definitions' };  // RV-2
  cards: CardRef[];              // label names: [card] | [source, target] | [premise, target]
  status: ReviewStatus; decline?: DeclineOption;
  classes: OwnAcceptClass[];     // recomputed on every judged state
  markers: ItemMarker[];
  dependsOn: string[];           // RV-5, hidden ones left out (RV-6)
  dependents: string[];          // accepted items that depend on it
  declineOptions: Array<{ option: DeclineOption; disabled?: string }>;
  acceptBlocked?: string;        // ES-4 heading, target of the running step, …
  detail: ItemDetailView; previous?: ItemDetailView;   // RV-1 previous proposal
  subItems?: Array<{ name: string; vocabKind: string; type?: string; gloss?: string; code?: string;
    status: ReviewStatus; decline?: DeclineOption }>;  // Vocabulary (N)
}
export type ItemDetailView =
  | { kind: 'formalize'; card: CardRef; statement: LeanStatementView }
  | { kind: 'change'; card: CardRef; fields: FieldChangeView[]; mentionedBy: CardRef[] }
  | { kind: 'add'; card: CardRef; statement?: LeanStatementView; fields: Array<{ field: string; value: string; by: 'user' | 'agent' }> }
  | { kind: 'add-premise'; card: CardRef; target: CardRef; statement: LeanStatementView; whyNeeded: string;
      closesGap: boolean; mayRestate: boolean; heldAs?: 'axiom' | 'pending' }
  | { kind: 'add-arrow' | 'remove-arrow'; source: CardRef; target: CardRef }
  | { kind: 'delete'; card: CardRef; arrows: Array<{ source: CardRef; target: CardRef }>; mentionedBy: CardRef[] }
  | { kind: 'vocabulary' }
  | { kind: 'declaration'; declKind: 'definition' | 'presupposition' | 'instance' | 'coercion' | 'vocabulary-change' | 'lean-axiom';
      name: string; code: string; before?: string; gloss?: string; glossBy?: 'user' | 'agent'; usedByStatementsOf: CardRef[] }
  | ResultDetailView
  | { kind: 'proof-broken'; card: CardRef; error: string };
export interface FieldChangeView { field: 'sentence' | 'statement' | 'why' | 'stance' | 'source' | 'dependencies';
  before?: string; after?: string; beforeStatement?: LeanStatementView; afterStatement?: LeanStatementView }
export type ResultDetailView =
  | { kind: 'result'; target: CardRef; question: CardRef[]; fromNothing: boolean; revealed: false; seenEarly: boolean;
      waitingFor: string[] }       // undecided statement/belief items + unrevealed Results (outcome-independent)
  | { kind: 'result'; target: CardRef; question: CardRef[]; fromNothing: boolean; revealed: true; seenEarly: boolean;
      verdict: 'established' | 'proved' | 'not-proved';
      flags: Array<'proved-from-nothing' | 'statement-changed' | 'replaces-your-proof'>;
      proof?: { name: string; code: string }; previousProof?: string;
      notNeeded: CardRef[]; basisChanged: CardRef[]; gap?: string /* Claude's words */; arrowItems: string[] };
export interface StageBoardView {
  graph: TlGraph;                       // working copy, masked (§3.4)
  hiddenTargets: string[];              // Results not revealed (neutral chip)
  removedNodes: TlNode[];               // cards Delete items take away (shown with −), from the base
  arrows: Array<{ item: string; change: 'add' | 'remove'; source: string; target: string; status: ReviewStatus }>;
  premises: Array<{ item: string; card: CardRef; statement: string; target: string; status: ReviewStatus }>;
  positions?: Record<string, CanvasPosition>;   // session moves (UN-4)
}
export interface StageReportView {
  steps: Array<{ target: string | null; purpose: 'prove' | 'redo' | 'shaky' | 'completion';
    outcome: 'passed' | 'did-not-pass' | 'cancelled' | 'failed' | 'proposed-nothing'; text?: string;
    revealed: boolean; summary?: string; assumedWithoutAsking?: Array<{ text: string; items: string[] }> }>;  // Claude's words only when revealed
  consistency: 'unchecked';
}
export interface EndingView { check: { id: string; state: 'running' | 'passed' | 'failed'; reused: boolean;
    failures: Array<{ rule: string; text: string; items?: string[]; declaration?: string }> };
  changes: string[]; rejected: string[]; endorsed: string[]; empty: boolean }
export interface SessionEventView { id: number; at: string; text: string; items: string[] }
export interface RejectedVersionView { item: string; rev: number; at: string; detail: ItemDetailView }
```
Additive RunView fields (core/src/run.ts):
- `inferences?: Array<{target; premises}>`
- `step?: { index; count; target: string | null; purpose }`
- `session?: { stage; phase }`
- In a session, `verdict` carries only step outcomes (gave-up/cap-reached/no-finish/cancelled/failed), never proved/not-proved.

Additive ActionOutcome fields (core/src/actions.ts):
- on ok: `review?: { taken: string[]; left: Array<{ item: string; reason: string }>; cascade: CascadeEntry[] }`
- on `needs-confirmation`: `cascade?: CascadeEntry[]` and `reveal?: string[]`
- `CascadeEntry = { item: string; to: ReviewStatus; why: string }`

2. PROTOCOL — core/src/protocol.ts
host→webview: `SessionMessage = Envelope<'session', { session: SessionView | null }>`. Posted on ready and on every RunChange.session.
Light check in `parseHostToWebview` (the host is trusted, like `proposal`), requiring:
- runId: string; stage: number; phase: string;
- items and inferences: arrays;
- board.graph.nodes and board.graph.edges: arrays.

webview→host (all `requestId?`, answered by `actionResult`; all in RUN_MESSAGE_TYPES; hand-written validators returning fresh objects):
```ts
formalize      { inferences: Array<{ target: string; premises: string[] }>; runId?: string; stage?: number }
decideItems    { runId; stage: number; decisions: ItemDecision[]; confirmed?: boolean }
  ItemDecision = { item: string; sub?: string; rev: number; to: 'accepted' | 'declined' | 'in-review';
                   option?: 'reject' | 'shaky' | 'transform'; holdAs?: 'axiom' | 'pending'; rationale?: string }
revealResult   { runId; stage; item: string; alsoReveal: string[] }
sessionUndo    { runId; step: number; confirmed?: boolean }        sessionRedo (same)
submitReview   { runId; stage; note?: string }
endSession     { runId; decision: 'apply' | 'exit' | 'back'; stage?: number; check?: string }
retryStep      { runId }
openSessionDiff{ runId; stage; file?: string; reveal?: string[] }
sessionMoveCards { runId; positions: Record<string, CanvasPosition> }
```
Validator rules (reusing id/ids/token/tokens/int/str/freeText/runId/relativePath/positionMap/confirmedFlag):
- formalize:
  - 1..LIMITS.inferences (50) inferences;
  - targets distinct; a target never among its own premises;
  - Σ premises ≤ LIMITS.listLength;
  - runId and stage come together ("a mid-stage Formalize names both").
- decideItems:
  - 1..LIMITS.decisions (500) decisions; item is a token; sub is a Lean name (≤ idLength, no whitespace);
  - rev is an int 0..LIMITS.revision;
  - option only with to='declined'; holdAs only with to='accepted'; rationale only with holdAs (one line, ≤ textLength, trimmed, dropped when blank);
  - no duplicate (item, sub);
  - stage is an int 1..LIMITS.stages.
- revealResult: alsoReveal holds distinct tokens, ≤ LIMITS.inferences.
- sessionUndo/sessionRedo: step is an int 0..LIMITS.revision.
- submitReview: note optional; dropped when blank; may span lines; ≤ textLength.
- endSession:
  - decision is one of the three;
  - apply needs stage and check; back needs stage; exit needs neither.
- openSessionDiff: as openProposalDiff, plus `reveal` tokens.
- sessionMoveCards: as moveCards.
- Unknown fields never survive (the existing parse pattern).
New LIMITS: inferences 50, decisions 500, stages 10_000, revision 1_000_000. Kept: answerQuestions, cancelRun (labelled "Cancel step"), resumeRun ("Resume"), dismissRun. Retired in rv9, after the engine stops using them: startRun (kept until then as a one-inference alias of formalize), acceptProposal, feedback, discardProposal, adoptGhost, rejectGhost, openProposalDiff, and host→webview `proposal`.

Host routing (extension/src/logic/boardSession.ts, runs.ts). The new messages go through `enqueueRun`.
- formalize without runId: today's startRun path (busy check, wait for queued edits, core `formalizeStartProblems`, consent, then manager.formalize).
- formalize with runId (mid-stage): no consent; straight to manager.formalize.
- openSessionDiff: queued (a reveal changes state). When the manager answers with files, the existing ProposalDiff view opens.
- cancelRun stays unqueued.
- RUN_SUCCESS_NOTICES gains formalize, submitReview, endSession, retryStep. Decisions get no toast: the panel shows them.
- `publishRuns` posts `session` when change.session.
- ES-7: while a session is active, the extension's model-file and editor-buffer change events, through the existing PathBatcher, call `manager.filesChanged()`, which recomputes drift and posts.
- ES-9's board-edit lock is unchanged; session messages are not board edits.

RunManager boundary (runner/src/run/types.ts; interface only, semantics belong to the engine design):
```ts
session(): SessionView | null; filesChanged(): void;
formalize(r: { subject: string; inferences: InferenceRequest[]; runId?: string; stage?: number }): Promise<ActionOutcome>;
decide(runId, stage, decisions, confirmed): Promise<ActionOutcome>;  reveal(runId, stage, item, alsoReveal): Promise<ActionOutcome>;
undoSession(runId, step, confirmed) / redoSession(…);  submit(runId, stage, note?);  end(runId, decision, stage?, check?);
retry(runId);  sessionDiff(runId, stage, reveal): Promise<{ ok: true; files: FileChange[] } | ActionOutcome>;  moveCards(runId, positions);
RunChange { run; proposal; session?: boolean }
```

3. SHARED CORE RULES (core/src/session.ts, formalize.ts; pure, used by the webview to preview and the host to enforce)
3.1 `planGroupAccept(items, selected)` returns `{ take, left: Array<{ item; reason: GroupLeft }> }`.
- Candidates are selected items that are:
  - status in-review;
  - without classes (RV-7);
  - without acceptBlocked;
  - not an unrevealed Result.
- `take` is the greatest fixpoint: drop any candidate with a dependency that is neither accepted nor in take (RV-8: "taken by this same Accept").
- Reasons: own-accept(classes) | depends(on[]) | hidden-result | blocked(text) | not-in-review.
- `planGroupDecline(items, selected, option)`: arrow items get 'plain'; unrevealed Results are left ("result not shown"); items already declined that way are left.
3.2 `acceptBlock(item, items)` returns null or `{ text, missing? }`, in this order:
- to-be-redone: "To be redone: Claude's next step proposes it again.";
- unrevealed Result: "Show the result first.";
- acceptBlocked;
- missing dependencies: "Accept these first: …" (with "Select them").
3.3 `submitPlan(session)` returns `{ enabled, reason?, next?: 'end' | 'claude-step', work? }`, for RV-12.
- Disabled unless phase is 'review'.
- Disabled while any item is in-review: "Decide every item first: N still in review." to-be-redone does not block.
- next is 'claude-step' when any Shaky, to-be-redone or (slice 4) queued transform exists; otherwise 'end'.
- Invariant: when Submit is enabled, every Result is decided, hence revealed, so no hidden items remain.
- `revealClosure(item, items)`: the Result plus the unrevealed Results in its waitingFor, transitively (RV-6: a Result that rests on another's result reveals both).
- formalize.ts:
  - `orderInferences(board, inferences)` puts sources first (a target that is a source of another target's question comes before it; ties by board order).
  - `formalizeStartProblems(board, inferences, { hiddenTargets })` generalises 1e's check:
    - a premise that is a target of the same request needs no `.holds` (it is proved first, A12);
    - a source whose Result is hidden gets only "‹source›'s result is not shown yet: show it first." This check comes first, so no refusal text tells whether a proof exists.
3.4 RV-6 masking (core/src/session/mask.ts; the host calls it when building SessionView)
- `affectedByHidden(base, inferences, hidden)` is the closure from each hidden target T along "is used by". C is reached when either:
  - X is a source of C's question (C a target); or
  - X ∈ direct(C), or a verified edge X→C exists, in the BASE graph.
  Computed only from the questions and the base, so membership is outcome-independent (under the preset, non-target proofs never change).
- `maskProposedGraph(base, working, { affected, hiddenTargets, hiddenArrows, hiddenDecls })` starts from `working`, then for every affected card C:
  - takes C's `status` (proof, flags, direct, certificates) from base;
  - takes `lean.justification`, `justificationKind` and `axioms` from base;
  - recomposes `lean.code` as the statement text plus the base `.holds` text (or none), and drops `lean.refs`;
  - takes the verified edges into C and the mismatch flags on edges into C from base;
  - takes C's diagnostics from base.
  Graph-wide, it also:
  - removes the hidden Add-arrow edges and premise entries (and their effect on `fromNothing`);
  - removes hidden declarations (proof-only lemmas) from the vocabulary and from every `externalUsers`.
- Property, tested in core: for two working copies that differ only in the outcome of hidden T (proof vs none, its arrow and premise items, lemmas, Claude's step texts), `sessionView(…)` is deep-equal.
- The webview test checks that the store's rows, counts and overlay are equal for that fixture pair.

4. WEBVIEW STATE (packages/webview/src/state/session.ts, wired into createBoardStore; store.ts gets the new slice and dialog kinds)
```ts
interface SessionUi {
  session: SessionView | null;          // as posted
  review: { runId: string; current: string | null; filter: 'all' | 'in-review'; pane: 'list' | 'detail';
            explicit: Record<string, true>; note: string; seenEvent: number;
            lastGroup: { taken: string[]; left: Array<{ item: string; reason: string }> } | null } | null;
  selectedItems: readonly string[];     // CM-2 review items (checkbox / Ctrl / Space; separate from `current`)
  sessionBusy: { action: 'decide' | 'reveal' | 'undo' | 'redo' | 'submit' | 'end' | 'retry' | 'diff' | 'formalize' | 'move'; requestId: string; items?: string[] } | null;
}
```
Actions:
- navigation: `focusItem(id, {reveal?})`, `moveCurrent(1 | -1 | 'first' | 'last')`, `toggleItemSelected(id)`, `selectItems(ids)`, `setReviewFilter`, `setReviewPane`, `toggleItemExplicit`;
- decisions: `acceptItem(id, {next?})` (an add-premise item opens the hold-as dialog first), `declineItem(id, option?)`, `reopenItem(id)` (back to in review, also un-reject), `acceptSelected()`, `declineSelected(option)`, `confirmCascade()`, `revealResult(id)`;
- session controls: `submitReview()`, `openExit()`, `confirmExit()`, `endSession('apply' | 'back')`, `retryStep()`, `openSessionDiff(file?)`, `sessionMove(positions)`;
- undo: `undo(scope)` and `redo(scope)` route by scope (§7).
Decisions are not optimistic. The item shows a spinner until `actionResult`; the next `session` message carries the truth.
- `ok.review.left` sets `lastGroup` (shown inline).
- `needs-confirmation` with `cascade` opens DialogState `{ kind: 'cascade'; cascade; retry }`; Continue re-sends with confirmed:true, Cancel sends nothing.
- `conflict` gives an error toast, keeps the current item, and marks it to look again.
- Accept & next moves `current` at once; on refusal it moves back.
New DialogState kinds:
- 'cascade';
- 'reveal' `{ via: 'show-result' | 'raw-diff'; item?; results; file? }`;
- 'hold-as' `{ item; next }`, with options as an axiom / as a proposition pending proof, plus an optional one-line Why;
- 'exit-session' `{ accepted; inReview; stepRunning }`;
- 'formalize' modes extended with 'in-session' and 'result-hidden' (§9).
applySession behaviour:
- A new runId resets the review UI. A new stage keeps `current` if that item still exists, otherwise the first in-review item. Stale selectedItems are dropped.
- The first review stage switches the board to Proposed, as today.
- null clears the session UI.
- While `session` is null, a legacy `proposal` keeps today's stepper until rv9.
PersistedState gains `review?: { runId; current; filter }`. It is read defensively and applied only when the session's runId matches (ES-6).

5. THE REVIEW PANEL (RunPanel in session mode; aria-label "Edit session")
Order, top to bottom:
- status line;
- Inferences: "Formalize for dependencies" with one line per target ("“T” ← 2 arrows" / "← follows from nothing") and its step chip (queued, running, step passed, step did not pass, cancelled). Never a verdict.
- pending questions (today's Questions.tsx);
- upfront notices;
- the StageReport;
- the events box ("Since your last action: …" with item links; dismiss sets seenEvent);
- the ReviewList with ItemDetail;
- "Rejected in this session";
- folded notices, answered questions, activity, backend.
5.1 StageReport (RV-10). A <details open>, summary "Stage N · K targets · R results shown · consistency unchecked".
- For each target, once revealed: the verdict line from its Result item, the band (webview `bandsOf` on the revealed graph: arrows used, Claude's arrows marked with their item status, ✓ or open reasons) and Rests on (`footprintEntries`). A hidden target gets only "result after the review" with a link to its Result.
- "Not needed" and "What is missing" for revealed targets (gap in Claude's words, plus `missingArrowHints`, whose "select ‹card› → ‹target› too" becomes a "Select these arrows" button).
- "Consistency unchecked", always (outcome-independent).
- Per revealed step: Claude's summary, and Assumed without asking with "Ask me instead" (Q4).
- RV-13: "Claude's step proposed nothing: ‹reason›".
- Step outcomes (ES-4) in telelean's words.
5.2 ReviewList (RV-2). `model/review.ts` `reviewRows(items, inferences, nodes, filter)`.
- Group order:
  1. cards that are sources (not targets), in board order;
  2. Vocabulary;
  3. Definitions;
  4. targets in inference order (sources first);
  5. other cards;
  6. cards not on the board.
- Within a card group: fields item (Add/Change/Formalize/Delete), Remove arrow, Add arrow, Add premise, then Result or Proof broken.
- Invariant (unit-tested): every item's dependsOn precede it, so walking with Next reveals each Result as its dependencies are decided.
- Header line: counts "3 in review · 5 accepted · 1 declined" (+ "· 1 to be redone"), the "Only in review" filter, a Select all in review checkbox, and group buttons "Accept N" (the label previews planGroupAccept, e.g. "Accept 4 of 6") and "Decline…" (DeclineMenu). After a group Accept, an inline note lists what was left: "Left 2: ‹item› needs its own Accept (belief) · ‹item› depends on ‹item› (in review)".
- Row contents:
  - selection checkbox;
  - status glyph and word (● in review, ✓ accepted, ✗ declined (Reject|Shaky|declined), ↻ to be redone; never colour alone);
  - short label from `itemLabel(item,'row')` (e.g. "Formalize · new statement", "Add arrow from “X”", "Vocabulary (5) · 3 of 5 accepted"), each card name in UserText/AgentText by wordedBy;
  - badges "belief", "changes what is proved", "depends on N";
  - markers ("updated", "no alternative found", …);
  - a spinner while being decided.
- Group headers show the card (kind glyph and sentence); a click reveals the card on the Proposed board.
5.3 Keyboard and a11y.
- The list is role=listbox aria-multiselectable with role=group per card, options carrying aria-selected (selection), and aria-activedescendant for `current`.
- Keys (pure `reviewKey(event, item)`), not inside text fields:
  - ↑/↓ Back/Next, Home/End;
  - Space toggles selection;
  - A Accept (own Accept); Shift+A Accept & next;
  - D Decline: arrow items decline at once; others open DeclineMenu, where R is Reject, S is Shaky, and T Transform is disabled;
  - Enter opens the detail (narrow panel);
  - Esc closes a menu, then clears the item selection;
  - Ctrl+Z / Ctrl+Shift+Z for the session stack.
- No key for Show result: it is a click only, because seen-early is permanent.
- Panel layout: `paneModeFor(width)` gives a list|detail split at ≥ 640 px; below that, the detail replaces the list ("◀ All items").
5.4 ItemDetail.
- Header: full label, status, badges, markers, position "4 of 12" with Back/Next, and "Show on board" (switches to Proposed, pans, flashes the card or arrow).
- Body by kind:
  - formalize: sentence above Lean (StatementStep), Fully explicit toggle, "What the Lean uses" closure; vocabulary links call `highlightVocab`.
  - change: field by field before → after (statements with the explicit toggle), "sentence and Lean may disagree", "Mentioned by: …".
  - add: every field, Claude's words in italic.
  - add-premise: Claude's sentence and why needed, Lean, "closes the gap (checked)", "may simply restate the target", "replaces follows from nothing", "completion not checked" or "meaning differs where it was written".
  - add-arrow / remove-arrow: both cards' sentences, "adds no new basis".
  - delete: the card, its Lean, its arrows, "Mentioned by".
  - vocabulary: sub-item rows (name, kind, type, gloss in Claude's words, code), each with Accept and Decline… ("k of N accepted").
  - declaration: code, gloss, "Your statements rely on it: …", the before code for a change.
  - result, hidden: "The result is shown once you have decided: ‹items› and these results are shown: ‹results›", with links and statuses. Show result (secondary) is noted as seen early; when revealClosure brings others, the 'reveal' dialog lists them first.
  - result, revealed:
    - verdict (established, proved with its reason chips via cardChips on the revealed node, or not proved);
    - flags: proved from nothing ("check what the statement says"), "proves a statement changed in this session", "replaces your proof" with the previous proof (collapsible);
    - "you saw this result early";
    - the band; Rests on; Not needed; cards whose basis changes;
    - the proof (collapsible "The proof (Lean)");
    - for not proved: gap and hints; "consistency unchecked".
  - proof-broken: the error. Accept is disabled with "Re-prove it with Formalize for dependencies" (not produced under slice 2's preset).
- "updated" opens "Previous proposal" (`previous`).
- Footer:
  - in review: Accept, Accept & next, Decline ▾;
  - decided: "✓ Accepted · Back to review" or "✗ Declined (Reject) · Back to review" (RV-3: any time);
  - when Accept is disabled, the acceptBlock text, with "Select them" for missing dependencies.
- Labels by verdict: Accept on a not-proved Result has the tooltip "Accept the outcome: “T” stays as it was".
5.5 Decline options (§10), from `item.declineOptions`, sent by the host. In DeclineMenu (Popover):
- arrow items: one "Decline" (DO-0: the arrow is put back or taken away at once; Results using it become to be redone; cards Claude added at its ends are declined);
- Result: Reject ("keeps the previous proof; Claude may not offer this exact proof again") and Shaky ("Claude tries again at Submit review");
- other kinds: Reject, Shaky, and "Transform…" disabled with "The transform window comes with a later slice: use Reject, or Shaky to let Claude try something else."
- "Rejected in this session" (DO-1): current reject declines with "Un-reject" (= reopenItem), plus superseded rejected versions (view only).
5.6 Group decisions (RV-8). The list buttons and the Context Menu section (CM-4: when items are selected, its summary reads "N review items" with labelled Accept / Decline… buttons) both call acceptSelected/declineSelected. That sends one decideItems; the host applies planGroupAccept/planGroupDecline. Group Decline applies one option, with plain for arrow items.

6. SESSION BAR (CM-6) — run/SessionBar.tsx replaces ProposalBanner in App.tsx; pure state in model/sessionBar.ts
- Left side: "Edit session · Formalize for dependencies: “T”" (or "· 3 targets"), "Stage N", and the phase text:
  - step: "Claude's step for “T” (2 of 3): working · formalising";
  - "waiting for your answer";
  - "checking Claude's result";
  - review: "Review: 3 in review · 5 accepted";
  - ending: "Confirm the end of the session";
  - interrupted: "Interrupted: the window reloaded while Claude was working".
- Then the Current | Proposed switch.
- Right side:
  - Cancel step (phase step), Resume (interrupted, canResume), Retry step (stepOutcome.canRetry);
  - Raw Lean diff… (if any hiddenTargets, the 'reveal' dialog lists them first: "The raw diff shows Claude's proofs: opening it shows the results of ‹targets› (noted as seen early).");
  - Submit review (primary; disabled reason from submitPlan, with "Go to the first one" link). Enabled tooltip: "Leads to the end confirmation: every item is accepted or rejected (no Claude step)" or "Starts Claude's next step for 2 Shaky items and 1 to be redone; accepted items carry over". When next is claude-step, an optional "Note for Claude's next step" field (Q4);
  - Exit session…;
  - "Review (N)" when the panel is hidden.
- Second lines:
  - ES-4 heading: "Claude's step did not pass: ‹text›. You can decline, formalize again or exit; nothing can be accepted until a later step passes." / "Step cancelled" / "Step failed: ‹text›", with Retry step. A first step that failed shows an empty stage with Retry step and Exit session.
  - ES-7 drift: "Your files changed since the session started: ‹files›. Apply stays disabled until they match again (undo those edits in the editor), or until you exit the session."
  - `checking`: "Re-checking the working copy…".
- Another subject's session: the RunElsewhere line reads "An edit session is active on ‹subject›: the boards of this folder are read-only until it ends. [Show it]".
- RunBadge texts, never a verdict: "Edit session: Claude working · Spyro · 3/25 checks" / "Edit session: review · Spyro".
- Exit confirmation (modal 'exit-session'; it may stay webview-local, Q8): "Exit the edit session? This discards N accepted items and M items in review [and stops Claude's step]. Your files are not changed; your answers to Claude's questions stay recorded. Exit cannot be undone." Buttons: [Exit session] [Back]; endSession exit.
- End confirmation (phase 'ending'; run/review/EndConfirmation.tsx; it replaces the list in the panel, not modal, so its links work):
  - "Changes (N)": accepted items grouped like the list, each a link (focus the item, reveal the card);
  - "Rejected, not applied (M)", collapsed;
  - "Definitions and presuppositions you endorse" (EN-3);
  - "Final check": running (spinner: build · checks · backstop), passed ✓ ("every check passed on exactly this state; every new assumption, definition and instance was accepted individually"; "file checks reused the last result" when reused), or failed ✗ with failures (rule label via FINAL_CHECK_RULE, text, item and declaration links);
  - buttons: [Apply] (enabled only when the check passed and there is no drift; it sends check.id; tooltip "Writes the changes as one history entry and one Undo step", or "Records the outcome: nothing in your files changes" when empty), [Back to review], [Exit session…].
  - In slice 2 there are no freezes and no keep ticks (FROZEN is slice 3).
- After Apply: the run panel outcome reads "Applied: the session's changes are in your files. One Undo takes the whole session back."

7. SESSION UNDO (UN-4–UN-6)
- What is a step, by host label:
  - "Accept: ‹label›" (Accept & next too);
  - "Accept N items";
  - "Decline: ‹label› (Reject|Shaky)" / "Decline N items (Reject)";
  - "Back to review: ‹label›" (also un-reject);
  - "Accept: Add premise ‹card› (as an axiom)";
  - "Show result: ‹target›" (+ "and N others") and "Show results (raw diff)"; undo hides them again, and the seen-early note stays;
  - "Move: ‹card›" (Proposed view);
  - later, freezes and queued transforms.
- Not steps: navigation, selection, filter, the explicit toggle, panes, opening details, Exit (cannot be undone), Apply (it becomes one board-stack step).
- Sealing (UN-5): Submit review, mid-stage Formalize, Retry step, answering questions (and unfreeze requests in slice 3) leave `undo: null` and `sealed` set. The button reads "Undo stops at Claude's step: it has already acted on what came before. To change an earlier decision, set the item's status directly."
- The stack is discarded at the end (UN-6), and it never touches the user's files: only session state and the working copy.
- Routing: `undoScope({ session, proposedOnScreen, focusInSession })` is 'session' when a session exists and either the Proposed view is on screen or the focus is inside an element marked data-undo-scope="session" (the panel, the session dialogs); otherwise 'board'.
  - main.tsx `installShortcuts` computes focusInSession.
  - Header UndoRedo follows the view: in the Proposed view, the session stack with its labels; in the Current view during a session, the board stack, locked as in 1f, with "Your files can't change during an edit session; Undo in the Proposed view undoes your review steps."
  - sessionUndo sends `step` (the top step the label named).
  - A cascade answer opens the 'cascade' dialog: "Undoing it also returns these accepted items to review: …".

8. THE PROPOSED VIEW (model/sessionBoard.ts `sessionOverlay(board, current)` builds the `Overlay` in session mode)
- Content: nodes and edges from `board.graph` (already masked), plus `removedNodes` (marked −) and premise ghosts.
- Positions: `board.positions`, then 1c's keepCurrentPlaces; new cards by the layered placement over the masked premises, so hidden arrows never move cards.
- The webview no longer runs `resultSignature` hiding or GraphDiff in session mode, which also removes the leaks in current_state.
- Card marks (`cardMarks`, from items): NodeCard's ItemMark replaces DiffBadge.
  - Glyph, word and status: "+ new · in review", "~ Formalize · accepted ✓", "− delete · declined ✗".
  - A click focuses the item (and opens the panel).
  - Hidden targets show RESULT_HIDDEN_CHIP ("result after the review"; a click focuses the Result). They also keep 1d's rules: no green glow, no band, no result chips. Downstream affected cards show the base-derived data as if nothing changed (masked), with no chip, so membership never shows.
  - Vocabulary band marks come from Vocabulary sub-items and declaration items.
- Proposed arrows (BD-5, S15). `toDisplayEdges` takes `ctx.proposed`, and EdgeSpec gains `proposed?: { item: string; change: 'add' | 'remove'; status: ReviewStatus }`.
  - Add in review: translucent (opacity .45), thin solid when unused and solid when the revealed proof uses it, never round dots, with a "+" badge (circle with glyph) at its midpoint.
  - Accepted add: full opacity, dotted (it becomes yours at Apply) and still "+" badged; tooltip "Claude's arrow, accepted: written to your files at Apply".
  - Remove in review: the base arrow drawn translucent dotted with a "−" badge. Accepted remove and declined add are not drawn; a declined remove is your dotted arrow again.
  - `arrowLook` gets `proposed`; `edgeClass` adds tl-edge--proposed, --proposed-add|remove, --accepted.
  - The EdgeEngine gets `setBadges(Map<edgeId, BadgeSpec>)` (shared later with FZ-13's lock badges).
  - Hit paths get data-hit="proposed" and data-item: a click focuses the item; a right click opens its menu (Accept, Decline…, Show its review item, Show “source”, Show “target”). They are not selectable for Formalize.
  - High contrast: no opacity; a dashed outline and the badge (never colour alone).
  - Bands bind proposed arrows the revealed proof uses, as drawn arrows of the working copy.
- Premise ghosts: GhostCards.tsx renders `board.premises` (revealed Add premise items) as translucent "Claude suggests" cards at the top of the AXIOMS column (Q12). Each has a "Review it" button and a "+" arrow into its target; deciding happens only in the list.
- Selection (RV-9, CM-2): during a session, the Proposed view allows selecting cards, drawn arrows (yours and accepted Claude arrows), marks and items (rectangle too). `gestureGate({ lock, proposed, session })` keeps drawing off (MENU_PROPOSED_ARROWS); moving is on only with rv9's session moves. `menuSelection` stops treating the Proposed view as readOnly during a session.
- Menus and Context Menu in the Proposed view:
  - Formalize (mid-stage);
  - the card's item entries ("Review: Formalize (in review)", Accept, Decline…);
  - Select incoming arrows, Show on board;
  - editing entries stay disabled with the 1f/1c2 reasons;
  - "Open in editor" opens your file, with tooltip "Opens your file; Claude's version is in the raw diff".
- Legend (header/legend.ts): add 'proposed' ("proposed by Claude: + adds, − removes", translucent line with a badge). Listed during a session only.

9. FORMALIZE: SEVERAL TARGETS, MID-STAGE (board/contextActions.ts, store.formalize, Dialogs.tsx)
`formalizeState` returns `{ disabled, inferences: Array<{target, sources}> (orderInferences), title, mode: 'start' | 'mid-stage' }`, and the `several` reason goes. It is disabled:
- during a step: "Claude's step is running: Formalize again when it ends (RV-9).";
- in phase ending: "Back to review first.";
- in the Current view during a session: "During a session, Formalize asks about the Proposed view: switch to Proposed.";
- when another subject has a session (ES-1);
- for a provisional card, or a cycle (AP-13).
AR-8 queue, for sources that are not targets of the same request, checked in this order:
1. a source that is a hidden target: 'result-hidden', "‹L›'s result is not shown yet." with [Show result] [Cancel]; it never says whether a proof exists;
2. a source with no `.holds`:
   - outside a session with a Lean statement: 'mark-pending' with [Mark pending and continue] [Select the arrows into ‹L› too] [Cancel];
   - in a session with a Lean statement: 'in-session', "‹L› is not proved; during a session it can't be marked pending" with [Select the arrows into ‹L› too] [Cancel];
   - no statement: 'no-statement' with [Select the arrows into ‹L› too] (when it has arrows or the mark) [Cancel].
"Select … too" adds L's incoming drawn arrows (or its ∅ mark) to the selection and re-evaluates. The store then posts `formalize { inferences }` (start) or `formalize { runId, stage, inferences }` (mid-stage; seals).

10. PHASE → AFFORDANCES
| Phase | List | Accept | Decline | Submit | Formalize | Controls | Undo |
|---|---|---|---|---|---|---|---|
| step | shown | yes, except items of running targets | yes, same exception | off | off | Cancel step, Exit, Raw diff | until the seal |
| review | shown | yes, none under a did-not-pass heading | yes | submitPlan | Proposed view only | Retry when a step was cancelled or failed; Exit; Raw diff | yes |
| interrupted | shown | as in step | as in step | off | off | Resume, Exit | as in step |
| ending | the confirmation replaces it | — | — | — | off | Apply / Back / Exit | after Back |
Decisions during a step are host-serialised (ES-4: rollback never undoes decisions).

11. RELOAD (ES-6). Everything comes back from `run` and `session` on ready. The persisted UI (current item, filter) is a convenience only, ignored for another runId. An open end confirmation is phase 'ending' on the host.

12. REPLACED/REMOVED (rv9)
- run/Review.tsx's stepper, ReviewUi, `reviewSteps`, `pastStatements`, `definitionsApproved`, `acceptSelection`, `answerDefinition`, the Feedback composer.
- run/ProposalBanner.tsx.
- GhostSuggestion's I hold this / No (Add premise items replace ghosts).
- store `acceptProposal`, `sendFeedback`, `adoptGhost`, `rejectGhost`, `discardProposal`, `openProposalDiff`.
- PROPOSED_NO_UNDO.
- The legacy `proposal` path. Tests of those are deleted and listed.
- **sub_slices:**
  - [1]
    - **id:** rv1
    - **scope:** Contracts and shared rules in core. core/src/session.ts holds the types and pure helpers planGroupAccept, planGroupDecline, acceptBlock, submitPlan and revealClosure. Protocol: the session message and the ten webview-to-host messages with hand-written validators and LIMITS; RUN_MESSAGE_TYPES; additive ActionOutcome.review/cascade/reveal and RunView.inferences/step/session. formalize.ts gains orderInferences and formalizeStartProblems (several targets; premises that are same-request targets exempt from needing a .holds; the hidden-source text first). No UI.
    - **files:**
      - packages/core/src/session.ts
      - packages/core/src/protocol.ts
      - packages/core/src/actions.ts
      - packages/core/src/run.ts
      - packages/core/src/formalize.ts
      - packages/core/src/index.ts
      - packages/core/test/protocol.session.test.ts
      - packages/core/test/session.test.ts
      - packages/core/test/formalize.test.ts
    - **tests:** Validators: each new message round-trips unchanged. Malformed payloads are refused: empty or more than 50 inferences, duplicate targets, a target among its premises, runId without stage, option without declined, holdAs without accepted, rationale with a newline, duplicate decisions, out-of-range rev/step/stage, apply without check, unknown decision. No extra properties survive, and the session light check works. Pure rules: planGroupAccept leaves RV-7 items with their classes, takes dependencies accepted in the same Accept (fixpoint), and leaves unrevealed Results and blocked items. planGroupDecline gives arrow items plain and leaves neutral Results. Also covered: acceptBlock texts and order; submitPlan (in review blocks, to be redone does not; end vs claude-step); revealClosure is transitive; orderInferences on a chain (sources first, ties by board order); formalizeStartProblems with chain exemption and hidden-source text. Run with capped vitest, one worker.
    - **risk:** Contract churn if the session-engine design shapes items differently. The integrator should reconcile names and item kinds with the engine plan before rv4. Additive changes only to the frozen M2 contracts.
  - [2]
    - **id:** rv2
    - **scope:** RV-6 masking on the host side, in core: affectedByHidden (outcome-independent closure from the questions and the base graph) and maskProposedGraph (derived data, .holds text, verified edges, mismatch flags and diagnostics of affected cards from the base; hidden added arrows and premises removed; hidden proof-only declarations removed from the vocabulary and from every externalUsers). Pure, so it can be built before the engine; the host calls it when building SessionView.
    - **files:**
      - packages/core/src/session/mask.ts
      - packages/core/src/index.ts
      - packages/core/test/session.mask.test.ts
    - **tests:** Indistinguishability: two working copies (Spyro fixtures) that differ only in hidden T's outcome (proof vs none, its arrow and premise, a helper lemma) give deep-equal masked graphs. A downstream card that would become established keeps its base status. A source's Used by does not name T or the hidden lemma. The expanded target's lean.code has no new proof text. A revealed T is unmasked. Chain L then A with L hidden and A revealed: A's derived data are masked. Membership is computed from the base only: the test mutates the working graph's direct sets and sees no change in affected.
    - **risk:** The masked derived data come from the base (conservative): a downstream card may show already-revealed effects late, until its hidden dependencies are revealed. If the engine designer owns SessionView building, this function moves with it.
  - [3]
    - **id:** rv3
    - **scope:** Host routing in the extension: boardSession dispatches formalize, decideItems, revealResult, sessionUndo/Redo, submitReview, endSession, retryStep, openSessionDiff and sessionMoveCards to the RunManager boundary methods. It posts session on ready and on RunChange.session, keeps posting proposal for legacy runs until rv9, and handles toasts. formalize-start reuses startRun's busy check, queued-edits wait, formalizeStartProblems and consent; mid-stage skips consent. ES-7: model-file and buffer change events during a session call manager.filesChanged(). The RunManager interface is declared only; the engine implements it.
    - **files:**
      - packages/extension/src/logic/boardSession.ts
      - packages/extension/src/logic/runs.ts
      - packages/runner/src/run/types.ts
      - packages/extension/test/unit/runRouting.test.ts
      - packages/extension/test/unit/hostRuns.test.ts
      - packages/extension/test/unit/editSessionLock.test.ts
      - packages/extension/test/unit/fakes.ts
    - **tests:** Each message reaches a fake RunManager with exactly its payload, and the actionResult is relayed. session is posted on change and on ready. A mid-stage formalize asks no consent. A formalize start refused by formalizeStartProblems never reaches consent. Session messages pass the ES-9 lock, while board edits, Undo and Redo stay refused during a session. Cancel step stays unqueued. filesChanged is called after batched file events. Extension vitest with --no-cache; FakeBackend only.
    - **risk:** It needs the engine's RunManager methods for anything end-to-end; a fake covers the unit tests.
  - [4]
    - **id:** rv4
    - **scope:** Webview model and store, with no new components. model/review.ts: reviewRows (grouping, order, ordering invariant), reviewCounts, filter, navigation, itemLabel parts by provenance, badge and marker texts, reviewKey keyboard map, paneModeFor. model/sessionBar.ts: phase texts, button states, submit text, drift text, step heading, FINAL_CHECK_RULE labels. state/session.ts: the store slice (applySession, review UI, selectedItems, sessionBusy, every action in design section 4, the cascade/reveal/hold-as/exit dialogs, refusal handling, persisted review UI). The legacy proposal stepper keeps working while session is null.
    - **files:**
      - packages/webview/src/model/review.ts
      - packages/webview/src/model/sessionBar.ts
      - packages/webview/src/state/session.ts
      - packages/webview/src/state/store.ts
      - packages/webview/src/main.tsx
      - packages/webview/test/shared/sessions.ts
      - packages/webview/test/unit/review.test.ts
      - packages/webview/test/unit/sessionBar.test.ts
      - packages/webview/test/unit/store-session.test.ts
    - **tests:** Rows and order: group order holds, and every visible dependency precedes its item, for all fixtures. Counts exclude nothing extra; filter and navigation skip as specified. acceptItem posts exactly one decideItems with rev and stage. Accept & next moves current and returns on refusal. An add-premise item opens hold-as and sends holdAs plus rationale; an arrow item declines plain. needs-confirmation with a cascade opens the dialog; Continue re-sends with confirmed and Cancel sends nothing. Group accept and decline send one message, and ok.review.left is shown. revealResult sends alsoReveal from revealClosure (dialog when more than one). Submit, end, exit, retry and diff messages carry the right fields, and busy blocks a second request. A new stage keeps current. Persisted UI is restored only for the same runId. The fixture pair (proved vs not, both hidden) gives equal rows, counts and overlay.
    - **risk:** store.ts is already 2,600 lines, so the slice lives in state/session.ts with a small wiring diff to limit merge conflicts with 1e.
  - [5]
    - **id:** rv5
    - **scope:** The review panel components: ReviewPanel (stage report, events box, list and detail, Rejected in this session), ReviewList and ReviewRow (listbox, groups, badges, counts, filter, group buttons with the planGroupAccept preview), ItemDetail with per-kind detail components reusing Review.tsx and ReportCard.tsx pieces moved to run/review/parts.tsx, DeclineMenu (Transform disabled with its reason), StageReport, Inferences header, the narrow pane, keyboard handling, the cascade, reveal, hold-as and exit dialogs in Dialogs.tsx, and CSS. RunPanel switches to the session layout when a SessionView exists.
    - **files:**
      - packages/webview/src/run/review/ReviewPanel.tsx
      - packages/webview/src/run/review/ReviewList.tsx
      - packages/webview/src/run/review/ReviewRow.tsx
      - packages/webview/src/run/review/ItemDetail.tsx
      - packages/webview/src/run/review/details.tsx
      - packages/webview/src/run/review/parts.tsx
      - packages/webview/src/run/review/DeclineMenu.tsx
      - packages/webview/src/run/review/StageReport.tsx
      - packages/webview/src/run/review/RejectedList.tsx
      - packages/webview/src/run/review/Inferences.tsx
      - packages/webview/src/run/RunPanel.tsx
      - packages/webview/src/dialogs/Dialogs.tsx
      - packages/webview/src/styles/board.css
      - packages/webview/test/unit/review.test.ts
      - packages/webview/test/e2e/s2-review.spec.ts
    - **tests:** Pure parts in review.test.ts: reviewKey (A, Shift+A, D on arrow vs other items, Space, arrows, Esc; no reveal key), paneModeFor, and label parts that render Claude's words via AgentText (provenance). tsc for both webview configs. A Playwright spec is drafted for the integrator against fixtures posted by the harness, not run by the builder: list, keyboard, group accept with left items, Show result reveal dialog, decline menu. No Claude anywhere.
    - **risk:** Mostly UI volume. The panel can be narrow (minimum 260 px): keep the stacked mode first-class.
  - [6]
    - **id:** rv6
    - **scope:** Session bar and ending: SessionBar replaces ProposalBanner (phase text, Current|Proposed, Cancel step, Resume, Retry step, Raw Lean diff with the RV-6 reveal dialog, Submit review with plan text and the optional note, Exit session, Review (N)), the ES-4 heading, the ES-7 drift line and the checking line, EndConfirmation (changes as links, rejected, endorsed, final check states and failures, Apply only after the check passed with no drift, sending check.id; Back to review; Exit), the exit modal, RunBadge and RunElsewhere texts without verdicts, and run panel outcome texts.
    - **files:**
      - packages/webview/src/run/SessionBar.tsx
      - packages/webview/src/run/review/EndConfirmation.tsx
      - packages/webview/src/App.tsx
      - packages/webview/src/run/RunBadge.tsx
      - packages/webview/src/model/run.ts
      - packages/webview/src/model/sessionBar.ts
      - packages/webview/src/styles/board.css
      - packages/webview/test/unit/sessionBar.test.ts
      - packages/webview/test/unit/store-session.test.ts
    - **tests:** sessionBarState for every phase and stepOutcome: which buttons are shown and why. Submit's disabled text gives N in review; its enabled text differs for end vs claude-step. Raw diff asks to reveal only when hidden targets exist. Drift disables Apply with the ES-7 text. Apply is disabled while the check runs or after it fails, and it sends the check id. The Exit dialog counts use visible items only and say it cannot be undone. Back sends endSession back. Badge texts never contain proved or not proved in a session.
    - **risk:** The final check can take a while (Lean). The UI must keep Back and Exit usable while it runs.
  - [7]
    - **id:** rv7
    - **scope:** The Proposed view in session mode: sessionOverlay (masked graph, removed nodes, positions, card marks, vocabulary marks) replaces buildOverlay's own hidden computation and GraphDiff badges. ItemMark on NodeCard; the result chip on hidden targets only. Proposed arrows: EdgeSpec.proposed, arrowLook/edgeClass/markerVariant, EdgeEngine.setBadges, hit role proposed (click focuses the item; right-click menu). Premise ghosts from board.premises. Selection allowed in the Proposed view during a session (gestureGate, menuSelection). The Context Menu section's Accept and Decline… for selected items. Legend entry.
    - **files:**
      - packages/webview/src/model/sessionBoard.ts
      - packages/webview/src/state/store.ts
      - packages/webview/src/board/edges.ts
      - packages/webview/src/board/EdgeEngine.ts
      - packages/webview/src/board/Board.tsx
      - packages/webview/src/board/NodeCard.tsx
      - packages/webview/src/board/GhostCards.tsx
      - packages/webview/src/board/Vocabulary.tsx
      - packages/webview/src/board/gestures.ts
      - packages/webview/src/board/menu.ts
      - packages/webview/src/board/BoardInput.ts
      - packages/webview/src/header/ContextSection.tsx
      - packages/webview/src/board/contextActions.ts
      - packages/webview/src/header/legend.ts
      - packages/webview/src/styles/board.css
      - packages/webview/test/unit/sessionBoard.test.ts
      - packages/webview/test/unit/edges.test.ts
      - packages/webview/test/unit/gestures.test.ts
      - packages/webview/test/unit/menu.test.ts
      - packages/webview/test/unit/store-gestures.test.ts
      - packages/webview/test/unit/legend.test.ts
    - **tests:** sessionOverlay uses only SessionView data (no graph diff, no resultSignature). The indistinguishable fixture pair gives equal overlays, and a downstream card has no chip and no change mark. Arrow looks: an add in review is translucent with a + badge and never round dots; an accepted add is dotted with a +; a remove in review is translucent dotted with a −; accepted removes and declined adds are not drawn; the high-contrast class has no opacity. A click on a proposed arrow focuses its item, and the arrow is never selected for Formalize. Selection works in the Proposed view during a session, while drawing stays off with its reason. The Context Menu shows Accept and Decline… for selected items, with planGroupAccept's disabled reasons.
    - **risk:** EdgeEngine is large: badges should share the midpoint code that FZ-13 lock badges will need. Touches 1e's ContextSection, so build it after 1e lands.
  - [8]
    - **id:** rv8
    - **scope:** Formalize for several targets and mid-stage (RV-9): formalizeState returns ordered inferences; disabled reasons for step, ending, Current view in a session and another subject's session. AR-8 dialog modes: result-hidden first, in-session, mark-pending with Select the arrows into L too, no-statement. store.formalize posts formalize (start) or formalize with runId and stage (mid-stage, seals). The right-click menu entry is the same.
    - **files:**
      - packages/webview/src/board/contextActions.ts
      - packages/webview/src/board/useFormalize.ts
      - packages/webview/src/board/runAction.ts
      - packages/webview/src/board/menu.ts
      - packages/webview/src/state/store.ts
      - packages/webview/src/dialogs/Dialogs.tsx
      - packages/webview/test/unit/contextActions.test.ts
      - packages/webview/test/unit/store-formalize.test.ts
    - **tests:** Arrows into two targets in a chain give inferences in sources-first order, and the chain's middle card needs no pending mark. A hidden-target source shows only the result-not-shown dialog, whose text never says proved or not; Show result goes through the reveal flow. In a session, Mark pending is never offered, and Select the arrows into L too adds L's arrows or mark and re-evaluates. Mid-stage posts runId and stage. Formalize is disabled while a step runs, in ending, and in the Current view during a session.
    - **risk:** Depends on 1e's final shape of contextActions and the formalize dialog. Rebase on 1e's verified code.
  - [9]
    - **id:** rv9
    - **scope:** Session Undo routing and cleanup: undoScope (Proposed view or focus inside data-undo-scope=session gives session), the Header UndoRedo labels and seal text, main.tsx shortcuts, sessionUndo/Redo with step id and the cascade dialog. Proposed-view card moves become sessionMoveCards (a session step). Delete the stepper, ProposalBanner, ghost adopt/reject UI, ReviewUi and the old store actions, and retire the old protocol messages once the engine no longer emits or handles them. List deleted tests and e2e specs to update.
    - **files:**
      - packages/webview/src/header/Header.tsx
      - packages/webview/src/main.tsx
      - packages/webview/src/state/session.ts
      - packages/webview/src/state/store.ts
      - packages/webview/src/board/BoardInput.ts
      - packages/webview/src/run/Review.tsx
      - packages/webview/src/run/ProposalBanner.tsx
      - packages/webview/src/run/GhostSuggestion.tsx
      - packages/webview/src/model/run.ts
      - packages/core/src/protocol.ts
      - packages/webview/test/unit/store-session-undo.test.ts
      - packages/webview/test/unit/store-run.test.ts
      - packages/webview/test/unit/run.test.ts
      - packages/core/test/protocol.m2.test.ts
    - **tests:** Ctrl+Z in the Proposed view, or with focus in the panel, posts sessionUndo with the top step. In the Current view during a session it posts nothing, and the button shows the locked reason. When sealed, the button is disabled with the UN-5 text. A cascade on undo opens the dialog. A move in the Proposed view during a session posts sessionMoveCards, never moveCards. Removed messages are refused by the validator. Obsolete tests are deleted and listed in the report.
    - **risk:** Retiring messages must wait for the engine sub-slice that replaces accept, feedback and ghost flows, and for the legacy-run conversion (Q9). Until then the old path stays behind the session-null branch.
- **open_questions:**
  - Q1 Where is RV-6 enforced? Recommend on the host: core maskProposedGraph inside one sessionView builder, so the webview never receives an unrevealed outcome. The alternative of masking in the webview (as 1d does) leaks through any rendering path that forgets the mask (see current_state).
  - Q2 Source of masked derived data. Recommend the base graph's derived data for every card in the outcome-independent affected set (conservative). Exact per-target step-start recomputation needs hybrid Lean facts and is not worth it in slice 2.
  - Q3 Show result on a Result that depends on hidden Results. Recommend revealing them together (revealClosure), after a dialog naming them; each is noted as seen early. Revealing one alone would leak the other's outcome through its verdict and chips.
  - Q4 Free text to Claude until slice 4. Feedback is gone, and DO-2 Transform waits for slice 4. Recommend an optional 'Note for Claude's next step' (user's words) at Submit review when a Claude step follows. 'Ask me instead' then declines the items the host links to that assumption as Shaky and prefills the note with 'Ask me about: …'. Log as an autopilot decision.
  - Q5 Activity feed of a step whose Result is hidden (it can show Claude saying it proved T). Recommend: keep it folded with the label 'Activity (may show results you have not revealed)'; opening it is not recorded as Show result (today's D-19 behaviour). Stricter alternative: opening counts as Show result for that step's target.
  - Q6 Decisions while a step runs. Recommend allowing them (RV-3 'any time'; ES-4 rollback never undoes decisions), except on items whose card is a target of the running step. The host enforces the same rule.
  - Q7 Keyboard. Recommend: A accepts; Shift+A is Accept & next; D declines (at once for arrow items, otherwise the options menu with R/S); up and down arrows navigate; Space selects. No key for Show result, because seen early is permanent.
  - Q8 Exit confirmation. Recommend a webview-local modal (re-pressing Exit after a reload costs nothing). The Apply confirmation is a persisted host phase 'ending', because it holds the final check's result (ES-6).
  - Q9 Legacy slice-1 runs left in review, such as the user's 'doorstuck' run. Recommend the host converts them into a one-target session at stage 1, with items computed from the shadow's base and working copy and all statuses in review. The stepper can then be deleted in rv9 instead of being kept forever.
  - Q10 The Formalize ▾ (Open the whole model, Claude may add cards). Recommend not showing it in slice 2; it comes with FROZEN in slice 3, where its banners and freezes live.
  - Q11 Accepted Claude arrows before Apply. Recommend drawing them dotted (they become yours at Apply) and still marked with the + badge. In-review ones are translucent, never dotted (S15).
  - Q12 Where Add premise cards show before acceptance. Recommend translucent 'Claude suggests' ghosts at the top of the AXIOMS column (as today), with a + arrow into the target. They are decided only in the list (hold-as dialog).
  - Q13 Card moves on the Proposed view (UN-4). Recommend implementing them in rv9 as session-stack steps kept in session state, written to layout.json with Apply's history entry and discarded at Exit. If time is short, defer and show the handle disabled with a reason.
  - Q14 Decline cascades. Recommend needs-confirmation whenever an accepted item would leave accepted or another item would be declined (RV-5, DO-0). Items becoming 'to be redone' are reported in the events box without asking.
  - Q15 Undo in the Current view during a session. Recommend that the toolbar keeps the locked board stack there (A27), with a tooltip pointing to the Proposed view, and that Ctrl+Z with focus in the review panel acts on the session stack.
  - Q16 Apply with no accepted changes. Recommend keeping today's 'recorded' semantics: Apply records the outcome (attempts) with no history entry and no Undo step, and the tooltip says so.
  - Q17 Retire the proposal message and the old run messages (acceptProposal, feedback, adoptGhost …). Recommend in rv9, only after the engine stops emitting or handling them and Q9's conversion exists.
  - Q18 Fix slice 1's RV-6 leaks before slice 1 ships to dist (AP-8)? Recommend yes, as a small webview-only fix in 1g or a 1e fixer: (a) hidden set = target plus cards downstream of it in the CURRENT graph, with base statuses shown and the chip on the target only; (b) DiffBadge and the banner counts ignore the proof and status fields of hidden cards; (c) CardDetails shows the current .holds text for a hidden target; (d) lemmas the proposal adds stay out of '+N new' until revealed; (e) Raw Lean diff asks first and then reveals.
- **safety_notes:**
  - Meaning before proof (RV-6, D-19, S7, §14.6). The host masks everything it sends: the graph, items, dependencies, counts, report sections and RunView verdicts. Tested by the core indistinguishability property (rv2) and by webview tests that the fixture pair gives equal rows, counts and overlays (rv4, rv7). Webview-side rules: no single-key Show result; reveal dialogs for raw diff and dependent results; the in-session AR-8 dialog never says whether a hidden source was proved; host refusal texts check hidden sources first (formalizeStartProblems).
  - Slice 1 already leaks the outcome in the Proposed view (current_state items 1-4). Fix it before slice 1 ships (Q18), with a store test that a proved and a not-proved proposal hidden behind the review render identical card marks, chips, counts and expanded code.
  - You decide exactly what you saw. decideItems carries rev and stage; sessionUndo/Redo carry step; revealResult carries alsoReveal; Apply carries check.id. The host refuses mismatches with conflict. Tested by validator tests and store tests that each request carries these values; host refusal is the engine's test.
  - Nothing is accepted as a side effect (RV-5, S4, §14.4). One message per gesture. 'Select them' only selects. Group Accept is planned by the shared planGroupAccept and re-checked by the host. Cascades require confirmation. Tested: store sends exactly one decision per Accept; the cascade dialog's Cancel sends nothing; planGroupAccept fixpoint tests.
  - Own Accept for belief and changes-what-is-proved items (★D2, RV-7, S5, S6, S15). Group Accept skips them and lists them with their classes; A, Accept and Accept & next act on one item; the Context Menu group Accept uses the same plan. Tested in core (planGroupAccept) and in the store (left items shown).
  - Hidden items are never listed, counted or offered for selection (RV-6 counts). True by construction (not sent); tested by fixtures where hidden arrow items exist only in the unmasked state.
  - The Current view stays read-only during a session (ES-9, §14.11). Session messages never mutate the user's files; only endSession apply writes, through the host. Tested by extending store-lock's sweep: every session action posts only session messages, and no board edit, Undo or Redo is posted during a session. editSessionLock.test covers the host side.
  - Undo never crosses views or Claude steps (UN-1, UN-5, S22). The board stack stays locked; session Undo is routed by view and focus and sealed at Submit, mid-stage Formalize, Retry and answers; the stack is discarded at the end. Tested in store-session-undo (routing, seal text, step id).
  - Apply only on a passing final check of exactly that state, with no drift (EN-2, ES-7, §14.1, §14.5). Apply is disabled while the check runs, after it fails, or while drift exists, and it sends the check id. The host re-verifies, and the backstop is never reused. UI tested in sessionBar tests; the backstop is the engine's test.
  - Claude's arrows never look like yours (S15, BD-5, D-15). In-review proposed arrows are translucent with a + or − glyph badge and never round dots; accepted ones keep the + until Apply; high contrast uses no opacity, an outline and the badge (never colour alone). Tested in edges.test and legend.test.
  - Provenance (D-15, CF-6). Every sentence, gloss, summary, gap and assumption from Claude renders through AgentText (italic, marker), and the user's through UserText, chosen by CardRef.wordedBy or glossBy. Tested on label parts and detail renderers.
  - Decline semantics are correct by kind (§10). Arrow items have only a plain decline; Results offer Reject and Shaky; Transform is shown disabled with its reason until slice 4; a neutral Result cannot be accepted or declined (Show result first). Tested in decline menu and store tests; the host enforces declineOptions.
  - Exit discards the session and leaves the user's files untouched; its confirmation says it cannot be undone (ES-8, EN-4, UN-6). Its counts use visible items only, so they reveal nothing. Tested in the exit dialog tests.
  - No real Claude anywhere. Webview tests use SessionView fixtures (test/shared/sessions.ts), extension tests use fake RunManagers or FakeBackend, Playwright specs post fixtures through the harness, and TELELEAN_NO_REAL_CLAUDE=1 is set as in the builder rules. Builders never build into packages/extension/dist (AP-8).
  - Reload (ES-6). All authority comes from the host's run and session messages on ready. The persisted review UI is a convenience, validated on read and ignored for another runId. Tested in store-session.
  - Decisions on items of a running step's targets are refused (Q6), so a decision cannot race the step that is replacing those items. The host and the UI apply the same rule, which comes from item.acceptBlocked.
