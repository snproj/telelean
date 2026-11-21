# Plan extract for sub-slice 2g (from docs/slice2-plan.md, AP-38)

This file holds only the parts of /home/zhengyew/telelean/docs/slice2-plan.md that 2g needs. Read the full plan only for a section cited here but not included. Left out: §1.1 entries of other sub-slices; 2.1 Facts: `DeclFacts.typeConsts` (the field in 2a1; the probe in 2b3, isolated in 2b3a; its core half in 2b2); 2.2 The review model (core `review/types.ts`, 2a1); 2.5 RunManager (runner `run/types.ts`; each method added by the sub-slice that implements it); 2.6 Persistence; 2.7 Gate contracts (core `gate/`; 2b1b); 2.8 Tools and turns (runner; 2d); §3 (the session engine); §4 (core items and checks; built in 2a1-2c2: read the code); §6.1 entries of other sub-slices; §8 entries that do not mention 2g.


## 0. Rules for everyone working on slice 2

Slice 1's rules hold unchanged (§0 of `docs/slice1-plan.md`; the builder rules file is pasted into every builder's brief):
- no git changes, no installs, never real Claude (`TELELEAN_NO_REAL_CLAUDE=1`), never write `packages/extension/dist` or `out`;
- one heavy job at a time under `capped.sh`;
- vitest with one worker; the extension's vitest with `--no-cache`;
- binaries from `node_modules/.bin` (never `npx` or `npm`); `TELELEAN_TEST_TMP` in the scratch dir;
- real-Lean tests only for the files a change touches, and only above the 12 GB rule; otherwise listed as not run.

Additions for slice 2:
- **Fixtures.** `test-fixtures/` is the integrator's: the recorded facts are regenerated there (§2.1). New FakeBackend session scripts go in `packages/runner/test/run/fixtures/sessions/`.
- **Contracts.** The contracts of §2 are the integrator's. A builder who must change one records it in §8 with the reason, and says so in the report when another sub-slice already uses it.
- **Texts.** Every user-facing text quoted in this plan is used verbatim. Core `review/texts.ts` holds those shared by host and webview, and 2a1 writes every such text this plan quotes. A sub-slice that runs beside 2g reports a missing text instead of adding it, and the integrator adds it between sub-slices.
- **One builder at a time in core.** Every package compiles core's sources (`@telelean/core` resolves to `core/src/index.ts`), so a half-written core file breaks every package's tsc and vitest. No sub-slice runs beside one that changes a core source file: 2a1, 2a2, 2b1a, 2b1b, 2b2, 2c1 and 2c2 run one after another, and 2g runs beside 2b3 and 2d–2f only because they change no core source. A builder who finds that one must change stops and reports it.
- **Tests that move** (from 2d on). Every start is then a session, so the existing manager, extension and e2e tests of Accept, Feedback and ghosts fail until 2e, 2f or 2h rewrites or retires them. 2d marks each such test `it.skip` with "moves to 2e/2f/2h: ‹name›" and lists them in its report; the sub-slice named un-skips or deletes it, and the integrator checks at the slice end that the list is empty.
- **Browser and VS Code tests.** Webview test builds go to a scratch folder (`TELELEAN_WEBVIEW_OUT`). Only the integrator runs Playwright and the VS Code suite, and only when RAM allows (AP-6).
- **Baseline before 2a1:** measured by the integrator after slice 1's last fixer (§9).


## 1. Order of work

Each sub-slice ends compiling, with the unit tests of every package it touched passing, its entry in §8, and a patch saved (§7.4). Each is sized for one builder. The core ones, 2a1 to 2c2, run strictly one after another (§0).

| Sub-slice | What | Main clauses | After |
|---|---|---|---|
| 2a1 | Review contracts and the item model, part 1 (core, pure): the shared contracts of §2.9 with stubs for later sub-slices, the texts, closures, ownership (`computeItems`) and content keys | RV-1, RV-2 | slice 1 |
| 2a2 | The item model, part 2 (core, pure): RV-7 classes, RV-5 dependencies, the stage reveal rule, the reconcile rules, and the status reducer with the session stack | RV-3–RV-8, RV-11, A1, DO-0/1/3 cascades, UN-4–UN-6 | 2a1 |
| 2b1a | Judging, part 1 (core, refactor only): the rule helpers taken out of `evaluate()`, with `evaluateRules` and every gate suite unchanged | Appendix B (kept rules) | 2a2 |
| 2b1b | Judging, part 2 (core): step limits, B.1–B.4, `judgeState` over every inference, the new tokens, `proposeArrowProblems` | ES-2, B.1–B.4, Appendix B, AR-3 | 2b1a |
| 2b2 | The backstop, taking content out (with a new `replace-decl` LeanOp), the start checks, Submit's plan, and `holdAs` in adoption (core, pure) | §14.5, Appendix B, AR-8, RV-1, RV-9, RV-12 | 2b1b |
| 2c1 | The base mask, the build's mask option and endorsements, `endorsementHash`, and the protocol messages (core) | RV-6, CM-6 | 2b2 |
| 2c2 | The session view, `buildSessionView` (core), and the host's `not-yet` answers | RV-2, RV-6, RV-10 | 2c1 |
| 2b3 | In two parts, one after the other (D2-75). 2b3a: the type-constant probe, isolated in its own Lean job, its measurement, and the recordings and core's Spyro facts regenerated with it. 2b3b: the runner engine: the shadow's kinds, `CheckContext.session`, judge, final check, the premise write and its completion, the ghost check with E(T), `planApply` | ES-2, B.1–B.4, EN-2 | 2c2 (2b3b after 2b3a) |
| 2d | Sessions, queues and steps (runner, with the host's routing for them) | ES-1, ES-2, ES-4, ES-6, RV-9, RV-11, RV-13, A12 | 2b3 |
| 2e | Review actions (runner + host): decisions on the working copy, re-judging, Reject and Shaky, Submit review, session Undo, Show results | RV-3, RV-5, RV-6, RV-11, RV-12, DO-0/1/3, UN-4–UN-6 | 2d |
| 2f | Add premise items and the end (runner + host): confirmation, final check, Apply, Exit, drift, endorsements | RV-1 (Add premise), EN-1–EN-4, ES-7, ES-8, §14.5 | 2e |
| 2g | The review panel and the session bar (webview) | RV-2, RV-3, RV-6, RV-8, RV-10, DO-*, CM-6, EN-2, ES-4, ES-7 | 2c2 (may run beside 2b3 and 2d–2f, §0) |
| 2h | The Proposed view in a session; Formalize for several targets and mid-stage; session Undo; retiring the old review; the user guide | BD-5, RV-9, AR-8, CM-2, CM-4, UN-1, UN-4, ES-9 | 2f, 2g |
| 2i | Cleanup of built code found by the coverage audit (AP-29): the card-only Delete removed, an old axiom's declared premises named, the guide corrected | ES-9, S9, A19, BD-3 | 2h |

- **A session cannot be reviewed on the board until 2g lands.** From 2d on, Formalize starts a session, which the old stepper does not show. The user's installed extension is not affected: `dist` is rebuilt only at the verified slice end (AP-8).
- **2a2, 2c2, 2b3, 2d and 2g are the largest.** If a builder reports running out of room:
  - 2a2 splits after the reveal rule (2a2a: classify, deps and `resultsState`; 2a2b: reconcile and the reducer);
  - 2c2 splits after the item views (2c2a: the items, their details and the counts; 2c2b: the report, the board, the gates and the confirmation);
  - 2b3 is split from the start (D2-75): 2b3a, the isolated probe, its measurement and the regenerated recordings; then 2b3b, the shadow, the engine and `planApply`;
  - 2d splits after the StepRunner extraction (2d1: the extraction and run.json v2; 2d2: the session layer and its queues);
  - 2g splits after the store (2g1: the store, the list and the detail; 2g2: the stage report, the session bar and the end confirmation).


### 1.1 Scope of 2g (extract)

**2g: the review panel and the session bar.**
- Webview:
  - state: `state/session.ts` (wired into `store.ts`), `model/review.ts`, `model/sessionBar.ts`;
  - components: `run/review/*`, `run/SessionBar.tsx`, `run/RunPanel.tsx`, `run/RunBadge.tsx`, `dialogs/Dialogs.tsx`, `App.tsx`;
  - `styles/board.css`; test fixtures in `test/shared/sessions.ts`.
- The old stepper keeps working while `session` is null, until 2h.
- Scope: §5.1–5.9, §5.13.
- Drafts `test/e2e/s2-review.spec.ts` (not run).


### 2.3 Views (host → webview; built only by `buildSessionView`, 2c2)

```ts
export type Gate = { ok: true } | { ok: false; reason: string; missing?: string[] };
export interface CardRef { id: string; type: NodeType; sentence: string; wordedBy: 'user' | 'agent' }
export interface LeanStatementView { name: string; pretty: string; explicit: string; closure: StatementReview['closure'] }

export interface SessionView {
  runId: string;
  subject: string;
  /** The review stage, from 1; 0 until the session's first queue ends. */
  stage: number;
  phase: 'step' | 'interrupted' | 'stage' | 'confirming' | 'applying';
  /** The stage reveal (RV-6, §4.7): shown when no statement or belief item is undecided, or when Show results forced
   *  them. `waitingFor`: the undecided statement and belief items: in review, or to be redone with their content still
   *  in ws/ (AF4). */
  results: { shown: boolean; forced: boolean; waitingFor: string[] };
  inferences: InferenceView[];
  steps: StepView[];
  /** ES-4. */
  heading: { kind: 'did-not-pass' | 'cancelled' | 'failed'; text: string; firstStep: boolean; retry: Gate } | null;
  /** In list order (§5.5). While the results are hidden, each Result is a neutral row and Results' parts are left out
   *  (§4.7). While a queue runs: the stage as it was when the queue started, with every action gate closed (D2-62, D2-63). */
  items: ItemView[];
  /** Listed items only; a Result is not counted while the results are hidden. */
  counts: { inReview: number; accepted: number; declined: number; toBeRedone: number };
  report: StageReportView;
  rejected: RejectedView[];
  board: SessionBoardView;
  /** `step`: the id of the stack action (SessionAction.id) that Undo or Redo would act on; null while a step runs. */
  undo: { step: number; label: string } | null;
  redo: { step: number; label: string } | null;
  sealed: { by: SealBy; at: string } | null;
  drift: { files: string[]; at: string } | null;
  /** A judge runs or is due, or the session's write queue holds a write (a decision's, a take-out, a premise write, a
   *  completion): Submit, Apply, a mid-stage Formalize and Retry wait (§3.6, AF3). */
  judging: boolean;
  /** Open only while the results are shown (§3.7), so `work` reads real statuses (`planSubmit`). */
  submit: { gate: Gate; next?: 'confirm' | 'claude-steps'; work?: { shaky: number; redo: number; steps: number } };
  /** Mid-stage Formalize (RV-9): closed while a step runs, while judging, and while the results are hidden (D2-65). */
  formalize: Gate;
  confirmation?: EndConfirmationView;
  /** telelean's own changes since the user's last action, newest last, at most 50; never about a hidden item. No event
   *  is made for a change that touches only hidden items, and the runner numbers each new event after the last one, so
   *  the ids count visible events only (AF7). */
  events: Array<{ id: number; at: string; text: string; items: string[] }>;
  /** (fixer 2c2 r1, S-STAGE-PROBLEMS-NO-PATH; additive) The stage's problems, which the final check refuses too (§2.1,
   *  §3.5, §3.8, §4.2): the stage judgement's `facts` and `unowned` problems; an item that disappeared with no decision
   *  removing it (§3.5's rule, read from the records and the judgement's drafts, not while judging); the runner's own
   *  (`SessionViewInput.problems`: a premise write that failed). `items`: the listed items each names. Never about a
   *  hidden item: while the results are hidden, a judgement's problem that names only hidden items, or a runner's that
   *  names one, is left out. `no-longer-builds` problems are not repeated (reconcile's event and the "no longer builds"
   *  marker name those items; their text holds Lean's message and positions, which hidden lines move). */
  problems: Array<{ text: string; items: string[] }>;
}

export interface InferenceView {
  target: CardRef;
  /** While the results are hidden: the question the target's latest ended step asked, whether or not that step proved
   *  it (§3.2); while a step runs, the same for a target whose step ended in the running queue, since a proved re-ask
   *  puts its question on the record when it ends (fixer 2c2 r1, A-V2C2-ADV-1). Either is shown less the sources the
   *  user's declines took out of it once that step's queue had started (D2-59, A-V2C2-ADV-6; builder 2b3a, R1-1).
   *  Otherwise the question on record. */
  question: CardRef[];
  fromNothing: boolean;
  order: number;
  /** The Result item, once a step for the target ended (D2-44). */
  result?: string;
}

export interface StepView {
  id: string;
  index: number;
  of: number;
  kind: 'formalize' | 'submit';
  target: string;
  /** While the results are hidden, an ended step reads `ended`, whatever happened (passed, gave up, statements only).
   *  `not-run`: a Cancel step or a failure earlier in its queue dropped it; Retry step runs it (§3.4). */
  state: 'queued' | 'running' | 'ended' | 'cancelled' | 'failed' | 'interrupted' | 'not-run';
  /** Only while the results are shown: what happened, in telelean's words. */
  outcome?: string;
  /** Claude's activity, gate attempts and notices of this step: withheld while a step runs and while the results are
   *  hidden (D2-10). */
  activity: 'shown' | 'withheld';
}

export interface ItemView {
  id: string;
  rev: number;
  kind: ItemKind;
  declKind?: DeclKind;
  /** The kind's short label ("Formalize", "Add arrow", "Vocabulary term", "Definition", "Result" …). */
  label: string;
  group: { kind: 'card'; card: CardRef } | { kind: 'vocabulary' } | { kind: 'definitions' };
  cards: CardRef[];
  /** null on a Result while the results are hidden: the row reads "result after the review" (§4.7). */
  status: ItemStatus | null;
  /** The current decline, when declined. (`decline` below is the action's gate.) */
  declined?: { option: DeclineOption; note?: string };
  redo?: { because: string[] };
  /** null on a hidden Result: its class would tell whether a proof was found (D2-61). */
  classes: { belief: boolean; changesProved: boolean; reasons: string[] } | null;
  markers: ItemMarker[];
  /** RV-5, listed items only; [] on a hidden Result. A hidden dependency is not named (§4.5). */
  dependsOn: string[];
  /** Accepted listed items that depend on it; [] on a hidden Result. */
  dependents: string[];
  accept: Gate;
  decline: Gate & { options: Array<{ option: DeclineOption; disabled?: string }> };
  /** Back to "in review", un-reject included. */
  review: Gate;
  detail: ItemDetailView;
  previous?: ItemDetailView;
  origin: { step: string; target: string };
}

export type ItemDetailView =
  | { kind: 'formalize'; card: CardRef; statement: LeanStatementView }
  | { kind: 'change'; card: CardRef; fields: FieldChangeView[]; mentionedBy: CardRef[] }
  | { kind: 'add'; card: CardRef; statement?: LeanStatementView; fields: Array<{ field: string; value: string; by: 'user' | 'agent' }> }
  /** `heldAs`: from the Accept (`accepted.holdAs`), shown from the Accept on. `writtenInReview`: an adopted ghost of a
   *  converted v1 run, already written as an AXIOM card, so hold-as offers only "as an axiom" (§3.11, AF12). */
  | { kind: 'add-premise'; sentence: string; leanName: string; target: CardRef; statement: LeanStatementView; whyNeeded: string;
      mayRestate: boolean; replacesFromNothing: boolean; heldAs?: 'axiom' | 'pending'; writtenInReview?: true }
  | { kind: 'add-arrow' | 'remove-arrow'; source: CardRef; target: CardRef; why?: string; addsNoNewBasis: boolean }
  | { kind: 'delete'; card: CardRef; arrows: ArrowEnds[]; mentionedBy: CardRef[] }
  | { kind: 'vocabulary-term'; name: string; vocabKind: VocabKind; type?: string; gloss?: string; glossBy?: 'user' | 'agent'; code: string }
  | { kind: 'declaration'; declKind: DeclKind; name: string; code: string; before?: string; gloss?: string; glossBy?: 'user' | 'agent';
      usedByStatementsOf: CardRef[] }
  /** Hidden: `question` as in its InferenceView. Shown: `gap` and `summary` too (D2-10). */
  | { kind: 'result'; target: CardRef; question: CardRef[]; fromNothing: boolean; revealed: false; seenEarly: boolean }
  | { kind: 'result'; target: CardRef; question: CardRef[]; fromNothing: boolean; revealed: true; seenEarly: boolean;
      verdict: 'established' | 'proved' | 'not-proved'; reasonChip?: string; flags: ResultFlag[];
      proof?: { name: string; code: string }; previousProof?: string;
      band: { used: string[]; notNeeded: string[]; complete: boolean; open: string[] };
      restsOn: string[]; throughResults: string[]; basisChanged: CardRef[];
      gap?: string; missingArrows: Array<{ source: string; drawn: boolean }>; arrowItems: string[]; premiseItems: string[];
      completion?: 'checked' | 'not-checked'; summary?: string }
  | { kind: 'proof-broken'; card: CardRef; error: string };
export interface FieldChangeView {
  field: 'sentence' | 'statement' | 'why' | 'stance' | 'source' | 'dependencies';
  before?: string; after?: string; beforeStatement?: LeanStatementView; afterStatement?: LeanStatementView;
}

export interface SessionBoardView {
  /** The stage judgement's working copy. While the results are hidden, under the base mask (§4.7): every proof-derived
   *  datum as in B, statements and vocabulary from the working copy. */
  graph: TlGraph;
  /** Targets with the neutral chip: every target while the results are hidden, else []. */
  hiddenTargets: string[];
  /** Listed items per card, for the card's mark. While the results are hidden, Results are left out: the target's
   *  neutral chip stands for them, so no status is ever needed for a hidden one (AF9). */
  marks: Record<string, Array<{ item: string; kind: ItemKind; status: ItemStatus }>>;
  /** Arrow items, only while the results are shown. `used`: the proof uses it. */
  arrows: Array<{ item: string; change: 'add' | 'remove'; source: string; target: string; status: ItemStatus; used: boolean }>;
  /** Add premise items that are not written yet, only while the results are shown. */
  premises: Array<{ item: string; target: string; sentence: string; status: ItemStatus }>;
  removedNodes: TlNode[];
  /** Moves on the Proposed view (UN-4, D2-33). */
  positions?: Record<string, CanvasPosition>;
}

export interface StageReportView {
  stage: number;
  /** `verdict`, `band`, `restsOn` and the rest only while the results are shown. */
  targets: Array<{ target: string; revealed: boolean; verdict?: 'established' | 'proved' | 'not-proved'; reasonChip?: string;
    band?: { used: string[]; complete: boolean; open: string[] }; restsOn?: string[]; throughResults?: string[];
    notNeeded?: string[]; missing?: Array<{ text: string; select?: ArrowEnds }> }>;
  /** Claude's words: only while the results are shown (D2-10). */
  steps: Array<{ step: string; target: string; revealed: boolean; summary?: string;
    assumedWithoutAsking?: Array<{ text: string; items: string[] }>; proposedNothing?: string }>;
  /** telelean's lines about questions, only while the results are shown: a re-ask that was not proved (§3.2), and a
   *  source that left a question (D2-59). */
  notes: string[];
  consistency: 'unchecked';
  /** Results and their parts are left out while the results are hidden (F10). */
  withdrawn: Array<{ label: string; at: string }>;
}

export type FinalCheckRule =
  | 'drift' | 'facts' | 'build' | 'rules' | 'permitted' | 'no-hidden-edges' | 'arrows' | 'kinds' | 'comparator' | 'items' | 'backstop';
export interface EndConfirmationView {
  changes: Array<{ item: string; label: string }>;
  rejected: Array<{ item: string; label: string }>;
  notRun: string[];   // inferences whose step never ended (D2-44)
  endorsed: Array<{ name: string; declKind: DeclKind }>;
  check: { id: string; state: 'running' | 'passed' | 'failed'; reusedFileChecks: boolean;
    failures: Array<{ rule: FinalCheckRule; text: string; items?: string[]; declaration?: string }> };
  /** Nothing accepted: Apply only records the outcome (D2-39). */
  empty: boolean;
  apply: Gate;
}
/** "Rejected in this session". Results and their parts are left out while the results are hidden (F10). */
export interface RejectedView { item: string; label: string; rev: number; at: string; unreject: Gate; superseded: boolean }
```

**RunView of a session** (core `run.ts`, additive):
- `session?: { stage: number; phase: SessionView['phase'] }`, present for a session;
- `inferences?: Array<{ target: string; premises: string[] }>`; `target` and `premises` are the first inference's, for old readers. All three follow the InferenceView's question rule: while the results are hidden, a target's premises are the sources of the question its latest ended step asked, so a re-ask's outcome never shows here (AF5); and while a step runs, so do those of a target whose step ended in the running queue (fixer 2c2 r1, A-V2C2-ADV-1: a proved re-ask's question reaches the record mid-queue), each less D2-59's removals;
- `step?: { index: number; of: number; target: string; kind: StepView['kind']; statementsFixed: boolean }`;
- in a session (§3.12) the runner:
  - never sets `verdict` to a proof outcome (only `cancelled`, `failed` and `cap-reached`, which describe a step);
  - sets `activity` and `notices` to empty arrays (M2's validator requires both), and leaves out gate attempts, while a step runs and while the results are hidden (AF9);
  - leaves out `frozen`: its `PermittedSummary` lists what each source contributes (whether it is in `unusable`, and its session-proof footprint), which tells earlier outcomes. M2's type stays as it is, and `step.statementsFixed` gives the panel what it needs (D2-68);
  - keeps `ghosts` empty and `proposalId` absent.

**ActionOutcome** (core `actions.ts`, additive):
- ok: `review?: { taken: string[]; left: Array<{ item: string; reason: string }>; cascade: CascadeEntry[] }`;
- `needs-confirmation`: `cascade?: CascadeEntry[]`, `hiddenResults?: true` (§3.6, D2-64), and `reveal?: true` (the raw diff would show the results, §2.4);
- `CascadeEntry = { item: string; to: ItemStatus; why: string }`. While the results are hidden, a Result or a Result's part is never an entry;
- `conflict` for a stale `rev`, `stage`, Undo `step` or check id, with "“‹item›” changed since you looked at it: look again." (or the check's own text);
- `refused` while a step runs, with "Claude's step is running: you can review when it ends." (D2-62). `refused` is a new `ActionErrorCode` (2a1, AF9).


### 2.4 Protocol (core `protocol.ts`; types and validators in 2c1, routing in 2d–2f)

**Host → webview:** `session { session: SessionView | null }`. It is posted on `ready`, and whenever the session itself changes: items, statuses, phase, step states, the reveal, the stack, drift, the heading, judging, the confirmation. A step's progress ticks reach the webview only through `run` (§3.12).
- It gets a light check, like `proposal`: `runId`, `stage` and `phase` present; `items`, `inferences`, `steps`, `board.graph.nodes` and `board.graph.edges` are arrays.

**Webview → host.** Every message:
- takes `requestId` and is answered by `actionResult`;
- is in `RUN_MESSAGE_TYPES`, so the ES-9 lock never refuses it;
- has a hand-written validator that returns a fresh object without unknown fields.
`stage` is an integer from 0 to `LIMITS.stages`, and the host refuses one that is not the current stage.

| Message | Payload | Validator rules |
|---|---|---|
| `formalize` | `{ inferences: Array<{ target, premises }>, runId?, stage? }` | 1–50 inferences; distinct targets; a target never among its own premises; all premises together ≤ `listLength`; `runId` and `stage` together (mid-stage) or neither (a start) |
| `decideItems` | `{ runId, stage, own, decisions: ItemDecision[], confirmed? }` | 1–500 decisions; no item twice; `own` a boolean, true only with exactly one decision (D2-32); `option` required with `declined`, and only there; `note` only with `shaky` (≤ `textLength`, may span lines, dropped when blank); `holdAs` only with `accepted`; `rationale` only with `holdAs` (one line, ≤ `textLength`); `rev` 0–1 000 000 |
| `revealResult` | `{ runId, stage, via: 'show-result' \| 'activity' }` | `via` one of the two; it shows every Result of the stage (D2-61) |
| `sessionUndo` / `sessionRedo` | `{ runId, step, confirmed? }` | `step`: the SessionAction id the user saw (`SessionView.undo.step`), 0–1 000 000 |
| `submitReview` | `{ runId, stage }` | |
| `endSession` | `{ runId, decision: 'apply' \| 'exit' \| 'back', stage?, check? }` | `apply` needs `stage` and `check`; `back` needs `stage`; `exit` neither |
| `retryStep` | `{ runId }` | |
| `openSessionDiff` | `{ runId, stage, confirmed?, file? }` | as `openProposalDiff`, plus `confirmed`, a boolean. While the results are hidden the host opens the diff only with `confirmed` (the raw diff shows every proof, so it counts as Show results); otherwise it answers `needs-confirmation` with `reveal: true` |
| `moveProposed` | `{ runId, positions }` | as `moveCards` |

- **While a step runs** (phases `step` and `interrupted`), the runner refuses every message of this table except `endSession` with `exit`, with "Claude's step is running: you can review when it ends." (D2-62). `answerQuestions`, `cancelRun`, `resumeRun` and `dismissRun` are not refused.
- **Kept:** `answerQuestions`, `cancelRun` (now Cancel step), `resumeRun`, `dismissRun`.
- **`startRun`** stays, as a one-inference `formalize`, until 2h.
- **Retired in 2h:** `startRun`, `acceptProposal`, `feedback`, `discardProposal`, `adoptGhost`, `rejectGhost`, `openProposalDiff`, and the host → webview `proposal`.
- **New LIMITS:** `inferences: 50`, `decisions: 500`, `stages: 10_000`, `revision: 1_000_000`.


### 2.9 Shared contracts (core `review/types.ts` in 2a1; runner `gate/types.ts` and `run/types.ts` in 2b3 and 2d)

These types cross sub-slices. 2a1 writes the core ones, with the functions stubbed (§1.1), and every later sub-slice implements them as written.

```ts
// ---- core review/types.ts (2a1)

/** One inference judged on one state (§4.8, §4.9; filled by 2b1b). */
export interface InferenceJudgement {
  target: string;
  /** Every per-inference rule holds in this state. */
  passes: boolean;
  verdict: 'established' | 'proved' | 'not-proved';
  reasonChip?: string;
  flags: ResultFlag[];
  /** `#print axioms` of T.holds; [] without a proof. */
  footprint: string[];
  /** B.2's direct(T): card ids. */
  direct: string[];
  /** E(T)'s sources: Claude's arrows into T that are not declined and that the judged state draws into T (the running
   *  step's own entries before its normalise draws them), and T's written premises (§4.8; fixer 2b1b r2, R1-2: never
   *  the ledger and the records alone, so `extraSources` requires the judged state). */
  extra: string[];
  /** B.1: what each source of Q(T) ∪ E(T) contributes. */
  contrib: Record<string, { kind: 'claim' | 'own-proof' | 'session-proof' | 'nothing'; reason?: ContribReason; pending?: boolean }>;
  permitted: string[];
  /** Sources whose session proof counted: the RV-5 edges Result(T) → Result(u). */
  throughResults: string[];
  restsOn: string[];
  band: { used: string[]; notNeeded: string[]; complete: boolean; open: string[] };
  missing: Array<{ source: string; drawn: boolean }>;
  findings: GateFinding[];
}
export type ContribReason = 'no-holds' | 'conditional' | 'mismatch' | 'circular' | 'not-passing' | 'unchecked';

/** One judged state (judgeState, §4.9): everything reconcile (§3.5), the view (2c2) and the end (§3.10) read about it. */
export interface StateJudgement {
  commit: string;
  filesKey: string;
  purpose: JudgeInput['purpose'];
  /** It built, its facts are complete where needed, and there is no global finding. */
  ok: boolean;
  global: GateFinding[];
  /** Step purposes: `global` plus the active inference's findings. */
  stepFindings: GateFinding[];
  /** By target; judged sources first. */
  inferences: Record<string, InferenceJudgement>;
  /** computeItems on this state (§4.2): premise items included, and a Result for every inference whose step ended. */
  drafts: ItemDraft[];
  /** RV-7 classes by item key, every premise draft's statement counted in R_stmt: in force while the results are
   *  shown (§4.1, D2-42). */
  classes: Record<string, ItemClass>;
  /** The same with no premise draft counted: in force while the results are hidden, and the only one the reveal rule
   *  reads (§4.7). */
  classesBeforeReveal: Record<string, ItemClass>;
  /** RV-5 edges by item key: the keys each item depends on (§4.5). */
  deps: Record<string, string[]>;
  /** R_stmt's `by`: the cards and drafts whose statements reach each name. */
  reach: Record<string, string[]>;
  /** `engine.judge` only: the premise drafts not written yet that it checked again on this state, by item key (§3.8). */
  premiseChecks?: Record<string, { closesGap: boolean; facts: Record<string, DeclFacts> }>;
  /**
   * Unowned differences, build errors mapped to item keys, missing facts. `scc` (a cycle of items partly accepted) is
   * not emitted by judgeState (builder 2b1b): it depends on the records, which change without a judge, so planSubmit,
   * the view and the backstop compute it from the records.
   */
  problems: Array<{ code: 'unowned' | 'no-longer-builds' | 'facts' | 'scc'; text: string; keys?: string[]; declaration?: string }>;
}

/** computeItems' output for one key (§4.2). */
export interface ItemDraft {
  key: string;
  kind: ItemKind;
  declKind?: DeclKind;
  /** For a new record: the creating step, its inference and phase (ledger `created`, `arrow`, `premise`). */
  origin: ItemRecord['origin'];
  provides: { decls: string[]; arrows: ArrowEnds[]; cards: string[] };
  /** Its declarations' `uses` constants (§4.1). */
  mentions: string[];
  /** The target whose Result it is part of, hidden while the results are (§4.7): arrow items into the target, its
   *  premise items, and the `decl:` items created in its steps' proof phases that its premise drafts reach. Read from
   *  the ledger, never from later reach (§4.2). A declaration created in a statement phase is never part of a Result. */
  partOfResult?: string;
  contentKey: string;
  content: ItemContent;
  /** A Result's draft that is B's version: T.holds as in B (the same text, or absent in both) and no proof material.
   *  It exists only because the step ended (F9), and reconcile never reads it as a new proposal (§3.5, AF1). */
  asInBase?: true;
  /** (fixer 2a, ADV-3) A declaration it provides has no facts in this state (its module did not build): its key and
   *  `mentions` are partial, so reconcile keeps its record, and classify marks its class. */
  factsMissing?: true;
}

/** The step of a session's queue (PersistedStep.state). */
export type StepState = 'queued' | 'running' | 'passed' | 'gave-up' | 'cancelled' | 'failed' | 'interrupted' | 'not-run';

/** The ws/ changes of one action, carried out at once through the write queue (§2.6): `reapply`'s inverse merges first,
 *  then `revert`, then the premise take-outs (fixer 2a, V2A-C2).
 *  Taking a written Add premise out (§3.8) removes whatever of it is in ws/ when the take-out runs and drops its ledger
 *  entries; step 4 clears the record's `card` and gives it its draft key again, and records in the action's `takenOut`
 *  only the premises written when the write started (card, written key, ledger entries): `takenOut` is what the
 *  action's commits, together, took out (fixer 2b1a r1).
 *  A decision commit holds the take-out of the written premises its write took out, so an un-reject's merge brings their
 *  card back without their ledger entries (builder 2b1a, R1-1). Their entries are in the `takenOut` of the stack action
 *  whose `commits` hold the un-rejected item's `decline.commit` (read before the action), the action the reducer reads.
 *  Such a premise is in `reapply` when it comes back (its record holds its card and written key again; the runner puts
 *  that entry's ledger entries back), and in `premises.takeOut` when its status keeps it out (its record holds the card
 *  again, so the runner plans that take-out after the merge from the record's card; no ledger entry of it exists). It
 *  was not written when the write started, so step 4 does not record it in `takenOut`: the merge and the take-out
 *  together leave it as it was, and so does their inversion (fixer 2b1a r1). One written again since keeps its record:
 *  the merge of its old take-out changes nothing, or conflicts (refused).
 *  For an Undo, `action` is the undone action (a decision or Show results, builder 2b1a's R1-2): the runner inverts its
 *  `commits`, newest first, and puts its `takenOut` ledger entries back, before any premise write that is due; `reapply`
 *  lists what that brings back, `revert` what must go out again (fixer 2a, V2A-S3). The Undo writes a premise of its
 *  action's `takenOut` again (card and written key back on its record, in `reapply`) only when it restores that
 *  premise's change to a state that keeps it in ws/, in review only when it was in review before the action (a
 *  converted v1 ghost); every other one (changed by a judge since, its Accept kept silently, or returned to review by
 *  the Undo itself) is in `premises.takeOut`, taken out again after the inversion from that entry's card (fixer 2b1a
 *  r1). An Undo whose action made commits always has a write. */
export interface ItemWrite {
  /** The stack action (SessionAction.id) that made it: its commit joins that action's `commits`, so Undo inverts it. */
  action: number;
  /** Items whose content goes (planItemRevert), and items whose rejected version comes back (the inverse merge). */
  revert: string[];
  reapply: string[];
  /** `write`: the Add premise items this action makes due; their premise writes join the queue after this write (§3.8),
   *  and each reads `holdAs` and `rationale` from the item's `accepted` record, never from a default. `takeOut`: the Add
   *  premise items this action gives a status whose content is outside ws/ (in review, declined by Reject or plain, to
   *  be redone and reverted), taken out when they are written as the write starts (§2.6, §3.8, AF2); also those an
   *  un-reject's merge brings back that their status keeps out, from the record's card (R1-1), and for an Undo those of
   *  its action's `takenOut` it does not write again, from that entry's card (fixer 2b1a r1). */
  premises: { write: string[]; takeOut: string[] };
}

/** The reducer's input (§4.6): the records, and what its rules read from the last judged state. The runner calls it only
 *  in a stage: while a step runs, every action is refused before it (D2-62). */
export interface ReviewState {
  items: readonly ItemRecord[];
  /** RV-5 edges by item id, from the stage judgement: the real dependencies, Results included (§4.5). One source only
   *  (builder 2b1a, R1-4): `depsById` of the records and the `deps` of the stage judgement they were reconciled with,
   *  a partial one included (ADV-3), never an older map. */
  deps: Readonly<Record<string, readonly string[]>>;
  /** Both class maps of the stage judgement, by item key; the reducer uses the one in force (§4.7). */
  classes: Readonly<Record<string, ItemClass>>;
  classesBeforeReveal: Readonly<Record<string, ItemClass>>;
  /** Show results' force (`PersistedSession.forced`). */
  forced: SessionForce | null;
  inferences: readonly SessionInference[];
  rejectedArrows: readonly ArrowEnds[];
  /** For every Result item id: the Add arrow items its question selected (a mid-stage Formalize, D2-20). DO-0 on one of
   *  them also takes its source out of that question (D2-59). */
  questionArrows: Readonly<Record<string, readonly string[]>>;
  didNotPass: boolean;
  stack: { done: readonly SessionAction[]; undone: readonly SessionAction[] };
  /** The id the next SessionAction gets (`PersistedSession.nextAction`). */
  nextAction: number;
  /** (builder 2a2) The labels the reducer's texts use: items by id as the view labels them, cards by card id. A missing
   *  one falls back to the kind's label and the key's names. (Builder 2a2's `results?` is gone: an Accept reads a
   *  Result's verdict and Rests on from its record's `judged`, fixer 2a, V2A-S5.) */
  labels?: Readonly<Record<string, string>>;
}
export type ReviewAction =
  | { kind: 'decide'; decisions: readonly ItemDecision[]; own: boolean; confirmed: boolean }
  | { kind: 'reveal'; via: 'show-result' | 'raw-diff' | 'activity' }
  | { kind: 'move'; before: Readonly<Record<string, CanvasPosition | null>>; after: Readonly<Record<string, CanvasPosition>> }
  /** `step`: the SessionAction id the user saw; a different top of the stack gives `conflict`. */
  | { kind: 'undo' | 'redo'; step: number; confirmed: boolean }
  | { kind: 'seal'; by: SealBy };
/** `needs-option` (fixer 2a, V2A-N2): a group's plain decline of an item that is no arrow item. */
export type GroupLeftReason = 'own-accept' | 'depends' | 'hidden-result' | 'blocked' | 'not-in-review' | 'needs-option';
export type ReviewOutcome =
  | { ok: true; items: ItemRecord[]; inferences: SessionInference[]; rejectedArrows: ArrowEnds[];
      /** The force after the action: set by `reveal`, cleared when a statement or belief item became undecided (§4.7). */
      forced: SessionForce | null;
      stack: ReviewState['stack']; nextAction: number; label: string;
      /** ActionOutcome.review's parts; a Result or a Result's part is never named while the results are hidden. */
      taken: string[];
      left: Array<{ item: string; reason: GroupLeftReason }>;
      cascade: CascadeEntry[];
      /** telelean's reports of the action's own effects, D2-23's at a reveal included; never about a hidden item. The
       *  runner numbers and times them (AF7, AF9). */
      events: Array<{ text: string; items: string[] }>;
      /** The ws/ changes, carried out at once through the write queue. */
      write: ItemWrite | null }
  | { ok: false; code: 'needs-confirmation'; cascade: CascadeEntry[]; hiddenResults?: true }
  | { ok: false; code: 'refused' | 'conflict'; error: string; item?: string };
export function reduceReview(state: ReviewState, action: ReviewAction, at: string): ReviewOutcome;

/** RV-8 (§4.6; 2a2), generic so the webview runs it on ItemViews and the host on its records (F12). `blocked`: its
 *  Accept is refused for a reason other than its dependencies ("did not pass", waiting for the results). */
export interface GroupItem { id: string; status: ItemStatus | null; dependsOn: readonly string[]; ownAccept: boolean;
  hidden: boolean; blocked: boolean; arrow: boolean }
export function planGroupAccept(items: readonly GroupItem[], selected: readonly string[]):
  { take: string[]; left: Array<{ item: string; reason: GroupLeftReason }> };
export function planGroupDecline(items: readonly GroupItem[], selected: readonly string[], option: DeclineOption):
  { decisions: Array<{ item: string; option: DeclineOption }>; left: Array<{ item: string; reason: GroupLeftReason }> };

/** §4.2 (2a1). `ended`: the inferences whose step ended; each gets its Result draft, with or without a difference (F9),
 *  marked `asInBase` when it is B's version (AF1), and premise items come only for these (AF10).
 *  `active` (step purposes): the running step, whose declarations new since S₀ have no `created` entry yet; they are
 *  its own, `statements` when its freeze holds them and `proof` otherwise, as its end will record (§3.4). */
export function computeItems(i: { base: ProjectModel; current: ProjectModel; ledger: readonly LedgerEntry[];
  premises: readonly PremiseDraft[]; inferences: readonly SessionInference[]; ended: readonly string[];
  active?: { step: string; target: string; stepStart: ProjectModel; freeze?: FrozenSnapshot } }):
  { drafts: ItemDraft[]; problems: StateJudgement['problems'] };
/** §4.4 (2a2). `withDrafts`: every premise draft's statement in R_stmt (`classes`), or none (`classesBeforeReveal`).
 *  `inferences` give Q's sources for c4's "adds no new basis", which it sets on the arrow item's class (AF8). */
export function classify(i: { base: ProjectModel; current: ProjectModel; drafts: readonly ItemDraft[];
  premises: readonly PremiseDraft[]; inferences: readonly SessionInference[]; withDrafts: boolean }): Record<string, ItemClass>;
/** §4.5 (2a2): RV-5 edges by item key. */
export function itemDeps(i: { base: ProjectModel; current: ProjectModel; drafts: readonly ItemDraft[];
  inferences: Readonly<Record<string, InferenceJudgement>> }): Record<string, string[]>;
/** §4.7 (2a2): the stage reveal. `meaning`: the statement and belief items that are not Results' parts (belief read
 *  from `classesBeforeReveal`, by item key); `waitingFor`: those that are undecided, in review or to be redone with
 *  their content in ws/ (`redo.reverted` false, AF4). */
export function resultsState(i: { items: readonly ItemRecord[]; classesBeforeReveal: Readonly<Record<string, ItemClass>>;
  forced: SessionForce | null }): { shown: boolean; meaning: string[]; waitingFor: string[] };
/** §3.5 (2a2): a stage judgement applied to the records, when a queue ends and in every `judge-apply` write. `runId`
 *  gives new records their ids (§2.2, AF7). `queueSteps`: the steps of the queue this judgement ends, absent at a judge
 *  that a decision started; F5's rule reads only these (§3.5, AF1). */
export function reconcile(i: { runId: string; records: SessionRecords; judgement: StateJudgement;
  queueSteps?: readonly string[]; at: string }):
  { records: SessionRecords;
    /** Never about a hidden item; the runner numbers and times them (AF7, AF9). */
    events: Array<{ text: string; items: string[] }>; problems: string[];
    /** Items the judge makes to be redone and takes out (§3.6), and written premises it returned to review, which are
     *  taken out too (§3.8): the write's ws/ part. */
    reverts: string[] };

/** §4.8 (2b1b, `review/permitted.ts`): B.1 for one inference on one state. `earlier`: the judgements of the inferences
 *  judged before it, sources first; `items` and `ledger` give E(T). judgeState calls it once per inference (AF8). */
export function permittedFor(i: { base: ProjectModel; current: ProjectModel; target: string;
  inferences: readonly SessionInference[]; ledger: readonly LedgerEntry[]; items: readonly ItemRecord[];
  earlier: Readonly<Record<string, InferenceJudgement>> }):
  Pick<InferenceJudgement, 'extra' | 'contrib' | 'permitted' | 'throughResults'>;
/** §4.9 (2b1b, `review/judge.ts`): propose_arrow's refusals, each with its `arrow` token and its text for Claude; []
 *  accepts the arrow (AF8). */
export function proposeArrowProblems(i: { current: ProjectModel; scope: StepScope; inferences: readonly SessionInference[];
  ledger: readonly LedgerEntry[]; rejectedArrows: readonly ArrowEnds[]; source: string; target: string }):
  Array<{ token: string; text: string }>;

/** The RV-6 base mask (§4.7; filled by 2c1): while the results are hidden, every proof as in B. */
export interface BaseMask {
  /** Each target's `.holds` as in B: absent, or B's text. */
  holds: Record<string, { kind: 'absent' } | { kind: 'base'; name: string; text: string }>;
  /** Every declaration created in a proof phase (ledger `created`): lemmas, proof-phase definitions and vocabulary. */
  drop: string[];
  /** Claude's arrows: every ledger `arrow` entry. */
  dropArrows: ArrowEnds[];
  /** Written premise cards (ledger `premise`), with their arrows and mark removals. */
  dropNodes: string[];
  /** (builder 2c1; additive) Those mark removals as data: the cards a ledger `mark-removed` names that B marked. */
  restoreMarks: string[];
}
export function baseMask(i: { base: ProjectModel; inferences: readonly SessionInference[]; ledger: readonly LedgerEntry[] }): BaseMask;
/** The masked facts, field by field (§4.7, AF6). The models give the texts and ranges the rules compare:
 *  - `modules`: the working copy's (states and source hashes), so no file reads stale;
 *  - the masked names (`drop`, the declarations of `dropNodes`, a `.holds` that `holds` makes absent): left out, with
 *    their messages;
 *  - each target's `.holds` under `holds: base`: B's DeclFacts, and B's messages for it, placed at the start of the
 *    target's statement in the working copy, so they attach to the same card and keep their place among the other
 *    diagnostics wherever the step put the `.holds` (fixer 2c1 r1, S-V2C1-S4);
 *  - every other declaration B has with the same text: the working copy's DeclFacts (range, selection range, refs,
 *    module and the rest), with only `axioms` and `usesSorry` taken from B; B's messages for it replace the working
 *    copy's, moved by the line offset between its range in B and in the working copy;
 *  - the rest: the working copy's DeclFacts and messages;
 *  - every other message, one with no position included: dropped;
 *  - no `detail` (the envelope's, `build`'s, `check`'s, `probe`'s): Lean's own words can quote hidden proof material
 *    (fixer 2c1 r1, A-ADV-6). */
export function maskFacts(i: { current: ProjectModel; base: ProjectModel; mask: BaseMask }): LeanFacts;
// (builder 2c1; additive, review/mask.ts, imported by path) The build's form of the mask (`ProjectMask`, project/types.ts:
// `ProjectInput.mask`) and the masked project, which 2c2's buildSessionView builds the hidden view's graph from:
//   export function projectMaskOf(i: { current: ProjectModel; base: ProjectModel; mask: BaseMask }): ProjectMask;
//   export function maskedModel(i: { current: ProjectModel; base: ProjectModel; mask: BaseMask;
//     endorsements?: ProjectInput['endorsements']; lakefile?: ProjectInput['lakefile'] }): ProjectModel;
// (fixer 2c1 r1, S-V2C1-S6; additive) `endorsements` and `lakefile`: the working copy's build inputs, which a
// ProjectModel does not keep; 2c2 passes the ones the working copy's board was built with, so the masked board flags
// what that board flags (an endorsed definition, TL110).

/** What core reads of PersistedSession (§2.6). The runner's PersistedSession is this plus `format`, `version`,
 *  `head`, `inFlight`, `judged` and `viewVersion`, with full PersistedStep records; `toSessionRecords` maps it. */
export interface SessionRecords {
  stage: number;
  phase: SessionView['phase'];
  inferences: SessionInference[];
  steps: Array<{ id: string; kind: StepView['kind']; target: string; stage: number; state: StepState;
    /** The question it asked (its StepScope's). */
    question: StepScope['question'];
    /** Its finish said `no_alternative` (DO-3, §3.5). */
    noAlternative?: boolean;
    retryOf?: string;
    /** (builder 2c2; additive) A12's source, its StepScope's `statementsOnly`: the Result's reason chip, shown with the
     *  results only ("“‹L›” was not proved"). 2d sets it. */
    statementsOnly?: string;
    /** (builder 2c2; additive) The queue it runs in, numbered from 1 in the session (2d sets it at `queue-start`):
     *  StepView's `index` and `of` count within it. */
    queue?: number }>;
  queue: string[];
  retry: string[];
  items: ItemRecord[];
  premises: PremiseDraft[];
  ledger: LedgerEntry[];
  rejectedArrows: ArrowEnds[];
  stack: { done: SessionAction[]; undone: SessionAction[] };
  nextAction: number;
  forced?: SessionForce;
  heading?: SessionView['heading'];
  confirmation?: { checkId: string; filesKey: string; state: 'running' | 'passed' | 'failed';
    failures: EndConfirmationView['check']['failures'];
    /** (builder 2c2; additive) EN-2: the final check reused the last judgement's file checks. 2f sets it. */
    reusedFileChecks?: boolean };
  drift?: { files: string[]; at: string };
  positions?: Record<string, CanvasPosition>;
  events: SessionView['events'];
}

/** buildSessionView's input (2c2). The function is pure; the runner gathers this. */
export interface SessionViewInput {
  runId: string;
  subject: string;
  records: SessionRecords;
  /** The stage judgement (`PersistedSession.judged`), computed again after a reload (D2-72); null until the first
   *  queue ends. */
  judgement: StateJudgement | null;
  /** B, with the base facts: the base mask takes proofs from them (§4.7). */
  base: ProjectModel;
  /** The stage judgement's working copy (its commit's files, `judged-facts.json`), unmasked: buildSessionView masks it
   *  while the results are hidden. Never ws/ while a queue runs. Before the first stage judgement (`judgement` null, the
   *  session's first queue) B: buildSessionView shows B then whatever is passed (fixer 2c2 r1, C-V2C2-C6). */
  current: ProjectModel;
  /** Lean's pretty and fully explicit renderings, by content key (§3.12). */
  renderings: Readonly<Record<string, { pretty: string; explicit: string }>>;
  /** Claude's words per step; buildSessionView shows them only while the results are shown (D2-10). */
  words: Readonly<Record<string, { summary?: string; gap?: string; proposedNothing?: string;
    assumedWithoutAsking?: Array<{ text: string; items: string[] }> }>>;
  judging: boolean;
  /** `PersistedSession.viewVersion`: the masked graph's `version` (F17). */
  viewVersion: number;
  /** (builder 2c2; additive) The working copy's build inputs, which a ProjectModel does not keep: `maskedModel` builds
   *  the hidden board with them (the note under `maskedModel` above). */
  endorsements?: ProjectInput['endorsements'];
  lakefile?: ProjectInput['lakefile'];
  /** (fixer 2c2 r1, S-STAGE-PROBLEMS-NO-PATH; additive) The runner's own problems of the stage, which neither the
   *  records nor the judgement hold: a premise write that failed (§3.8; 2f passes them), each with the ids of the items
   *  it names; while the results are hidden, one that names a hidden item is left out (its text names it). */
  problems?: ReadonlyArray<{ text: string; items: readonly string[] }>;
}
/** 2c2 (`review/view.ts`): the one builder of SessionView (§2.3, §4.7), pure (AF8). */
export function buildSessionView(input: SessionViewInput): SessionView;
// (builder 2c2; additive, in review/view.ts) `itemLabel(item)`, an item's full label; `sessionLabels(view)`, the
// reducer's `ReviewState.labels`; `reviewStateOf(records, judgement, labels?)`, the reducer's input as the view reads
// it (2e and the host's early answers use it). In review/reducer.ts: `itemGates(state)`, every item's own Accept,
// decline and back-to-review gates on one Work (`acceptGate`'s rules); (fixer 2c2 r1) `decidedBy(action)`, the items
// a decide action carried out, which the view reads to offer no Undo or Redo of a decision on an item hidden now.

/** The backstop (§4.10; filled by 2b2). */
export interface BackstopInput {
  base: ProjectModel; final: ProjectModel; items: readonly ItemRecord[]; ledger: readonly LedgerEntry[];
  inferences: readonly SessionInference[]; judgement: StateJudgement;
}
export interface BackstopRefusal {
  code: 'facts' | 'unowned' | 'not-accepted' | 'not-written' | 'own-accept' | 'content-changed' | 'class' | 'arrow' | 'mark'
    | 'b2' | 'cycle' | 'kind' | 'scc';
  text: string; name?: string; arrow?: ArrowEnds; item?: string;
}
export function applyBackstop(i: BackstopInput): { ok: boolean; refusals: BackstopRefusal[] };

/** §4.11 (2b2, `review/revert.ts`): B's version of the given items' content, as whole-file changes of `current`.
 *  `drafts`: the items' drafts on `current` (their `provides`); `ledger`: a premise's completion, and which declarations
 *  enclosing lines hold (AF2, AF8). */
export function planItemRevert(i: { base: ProjectModel; current: ProjectModel; drafts: readonly ItemDraft[];
  ledger: readonly LedgerEntry[] }): FileChange[];

/** Submit's plan (§3.7; filled by 2b2). Submit is open only while the results are shown, so the plan reads every item's
 *  real status and dependencies. */
export interface SubmitPlan {
  /** Nothing Shaky, nothing to be redone: the end confirmation, with no Claude step (D2-54). */
  confirm: boolean;
  /** The affected inferences' targets, in the order their steps run (D2-57). */
  steps: string[];
  /** Item ids whose kept content is taken out before the queue starts (D2-57). */
  takeOut: string[];
  counts: { shaky: number; redo: number };
  /** (builder 2b2; additive) RV-5 cycles of items (SCCs of two or more) with an accepted member that are not wholly
   *  accepted, as item ids: Submit to the end confirmation is refused while one exists (§3.7, §4.5). */
  partlyAccepted: string[][];
}
export function planSubmit(i: { records: SessionRecords; judgement: StateJudgement }): SubmitPlan;

/** What formalizeStartProblems reads of a session (§4.12; 2b2; F12). The host builds it from SessionView, which holds all
 *  of it while the results are shown, the only time a mid-stage Formalize is allowed (D2-65). The runner builds it from
 *  its records and runs the full check itself, so the host's check only answers early (before consent, for a start). */
export interface FormalizeSession {
  subject: string;
  resultsShown: boolean;
  /** The session's targets. */
  targets: string[];
  /** Claude's arrow items that are not declined. */
  arrows: Array<{ item: string; source: string; target: string; status: ItemStatus }>;
  /** Targets that have a Shaky item (D2-53). */
  shakyTargets: string[];
  /** Each target's Result status. */
  results: Record<string, ItemStatus>;
  /** (builder 2b2; additive) Targets whose Result is declined Shaky, which `results` cannot tell from a Reject (check 5).
   *  Without it, a declined Result of a target in `shakyTargets` counts as Shaky. */
  shakyResults?: string[];
}
export interface StartProblem { check: 1 | 2 | 3 | 4 | 5 | 6; text: string; card?: string; arrow?: ArrowEnds }
export function formalizeStartProblems(board: TlGraph, inferences: ReadonlyArray<{ target: string; premises: readonly string[] }>,
  session?: FormalizeSession): StartProblem[];
export function formalizeOrder(board: TlGraph, inferences: ReadonlyArray<{ target: string; premises: readonly string[] }>): string[];

// ---- runner gate/types.ts (2b3)

/** What a session adds to CheckContext (`session?: SessionCheckContext`). With it, check, freeze and gate call
 *  judgeState instead of evaluateRules, and GateReport gains `judgement?: StateJudgement`. They decide on the
 *  judgement's `stepFindings` with §2.1's failed-probe rule (an `environment` outcome with `probeFailure`'s sentence when
 *  they are empty or only `source-only`), never on `ok` alone (2b3b, AP30-3). G0 runs before all of it: when it finds
 *  anything they return its findings, counted, with no judgement and no Lean job (§1.1's 2b3b, AP30-1 r2). */
export interface SessionCheckContext {
  inferences: readonly SessionInference[];
  ledger: readonly LedgerEntry[];
  /** The session's records: they do not change while a queue runs (D2-62), so a step and its Resume read the same. */
  items: readonly ItemRecord[];
  premises: readonly PremiseDraft[];
  ended: readonly string[];
  rejectedArrows: readonly ArrowEnds[];
  /** Step purposes: the step's limits and its S₀ commit. */
  scope?: StepScope;
  stepStartCommit?: string;
  noAlternative?: boolean;
}
// For `judge` and `finalCheck` (purposes `stage` and `final`), CheckContext's single-target `selection`, `stage` and
// `round` are the active step's, or else the first inference's, so `validateContext` passes unchanged; judgeState
// ignores them, and JudgeInput.stage is passed as `prove` and ignored for these purposes.
// Each method below runs G0 first, before any Lean job (§1.1's 2b3b, AP30-1 r2). When it finds anything, nothing is
// synced, built, probed, rendered or challenged: `judge` and `finalCheck` judge the files without facts, G0's findings
// in `global` (so `ok` is false), and `writePremise` and `complete` answer `{ ok: false }` with G0's first message.
// LeanCheckEngine gains:
//   /** RV-11: builds the head (reusing the facts when the files key is unchanged), judges every inference, and checks
//    *  again the premise drafts that need it (§3.8). */
//   judge(ctx: CheckContext): Promise<{ judgement: StateJudgement; report: CheckReport }>;
//   /** §3.10 step 2, on exactly F; `reuse` holds what EN-2 lets it reuse. */
//   finalCheck(ctx: CheckContext, reuse?: { judgement: StateJudgement;
//     comparator: Record<string, { filesKey: string; permitted: string[] }> }): Promise<FinalCheckReport>;
//   /** §3.8 (F11): normalises the premise write the caller made, builds, renders P's fully explicit form where it was
//    *  written, and judges the state; the write's step 4 takes the written item's key from that judgement. A judgement
//    *  whose probe failed answers `{ ok: false, error, environment: probeFailure's sentence }`, so step 4 never reads a
//    *  partial judgement (AP30-4). */
//   writePremise(ctx: CheckContext, premise: { item: string; draft: PremiseDraft; card: string }): Promise<PremiseWriteReport>;
//   /** §3.8 (F11): normalises the completion the caller wrote, freezes again from the `adopt` commit (after
//    *  `statement-changed` passes against T's last freeze snapshot), gates it as `gate-proved` with that freeze's
//    *  challenge, and commits `completion` when it passes. */
//   complete(ctx: CheckContext, premise: { item: string; draft: PremiseDraft; card: string }): Promise<CompletionReport>;
export interface FinalCheckReport {
  passed: boolean;
  environment?: string;
  reusedFileChecks: boolean;
  judgement: StateJudgement;
  failures: Array<{ rule: FinalCheckRule; text: string; items?: string[]; declaration?: string }>;
  backstop: BackstopRefusal[];
}
export type PremiseWriteReport =
  | { ok: true; meaningMatches: boolean; explicit: string; judgement: StateJudgement }
  | { ok: false; error: string; environment?: string };
export type CompletionReport =
  | { ok: true; commit: ShadowCommit; judgement: StateJudgement }
  | { ok: false; error: string; environment?: string };
// (builder 2b3b; additive, §8) CheckReport.judgement? (check and freeze carry it as the gate does); GateReport.freeze?:
// the FreezeRecord a proved finish exported again (D2-19), which 2d records as the step's newest freeze;
// FinalCheckReport.comparator?: the comparator's passes of the check (run or reused) by target, for 2f to record;
// GhostCheckInput.leanName? and, in a session, GhostCheck.explicit? (PremiseDraft.explicit: the value of the
// statement's explicit #print) and .facts? (PremiseDraft.facts); writePremise commits the files it built as `adopt`
// (step 3) and judges that commit, with no commit on a failure; complete's judgement is judgeState('stage') of the
// `completion` commit. Shadow: ShadowWorkspace.lastCommitSince(since, kinds) and syncMirror(files?). Proposals:
// ProposalService.planApply(ApplyRequest { shadow, readReal, finalState?, targets, nodes, realFiles? }).
// (fixer 2b3b r1, §8) ApplyRequest.finalState is required (the files of the commit the passed final check judged; a
// request without it is a TypeError); in a session GhostCheckInput.leanName is required (TypeError); `judge`'s
// premiseChecks lists every draft judged on the state, a draft whose reliance did not change with its last check's
// outcome again (no Lean job), and leaves out a check telelean could not run or judge; `complete` freezes again from the
// state the completion is written on (the shadow's newest commit: the adopt commit, or a later one after recover()'s
// revert or when the completion becomes due after a decision), which must hold the written premise (ledger entry, card)
// with T not proved, `ctx.freeze` being T's own; `finalCheck` refuses (environment) unless ws/ equals the newest commit.

// ---- runner run/types.ts (2d)

/** A write to ws/ that `recover()` can run again (§2.6's write order); all of a session's writes run in one queue. */
export type SessionWrite =
  | { kind: 'decide'; action: ReviewAction }
  /** Reads `holdAs` and `rationale` from the item's `accepted` record. Its Lean job is `engine.writePremise`; its step 4
   *  sets the record's `fingerprint` and `accepted.fingerprint` to the written item's content key (§3.8). `premise` and
   *  `completion` are due writes: the action that makes one due enqueues it, `recover()` enqueues every one still due,
   *  and each does nothing when, at its step 1, it is no longer due (§3.8, AF2). */
  | { kind: 'premise'; item: string }
  | { kind: 'completion'; item: string }
  /** The judge's whole outcome: planned inside the queue on the current records, dropped when the head is no longer
   *  `judged` (§2.6, F8). `queueSteps`: the steps of the queue it ends, if it ends one (reconcile's input, AF1). */
  | { kind: 'judge-apply'; judged: string; queueSteps?: string[] }
  /** Submit's take-out before its queue starts (§3.7, D2-57). */
  | { kind: 'submit-take-out'; items: string[] }
  /** The start of a queue of Claude steps in a stage (a mid-stage Formalize, Submit review, Retry step): its seal, its
   *  steps queued, and its first step's `step-start` commit and StepScope. It is the write queue's last write; after a
   *  crash the queue waits for Resume or Cancel step, as between two steps (§3.3, §3.11, AF3). */
  | { kind: 'queue-start'; by: SealBy; steps: string[] };
```


## 5. The review UI (webview; 2g, 2h)

### 5.1 Principles
- **The host owns the session:** items, statuses, classes, dependencies, the reveal state, the stack, the drift and the confirmation.
  - The webview renders `session` and turns gestures into messages.
  - Where it previews a rule (group Accept, Submit review, Formalize), it calls the same core function the host enforces with.
- **RV-6 by construction:** the webview receives only the masked view (D2-5). Its own hiding is the neutral Result rows and the neutral chip on the targets.
- **Read-only while Claude works** (D2-62): in phases step and interrupted, every review control is disabled with "Claude's step is running: you can review when it ends." The list, the details and the board stay browsable.
- **Each request carries what the user saw:** `rev`, `stage`, the Undo `step`, the check id. A mismatch is refused with "“‹item›” changed since you looked at it: look again."
- **Decisions are not optimistic.** The item shows a spinner until `actionResult`, and the next `session` message is the truth.
- **One message per user action.** Cascades come back as `needs-confirmation`, with the list.

### 5.2 State (2g)
- **The slice** (`state/session.ts`, with a small wiring diff in `store.ts`):
  - `session`;
  - `review { runId, current, filter ('all' | 'in-review'), pane, explicit, seenEvent, lastGroup }`;
  - `selectedItems` and `sessionBusy`.
- **Dialogs:** `cascade` (with the hidden-results sentence when `hiddenResults`, §3.6), `reveal { via }` (Show results, Raw Lean diff… and Show Claude's activity share it), `hold-as { item, next }`, `exit-session { accepted, inReview, stepRunning }`. 2h adds the `formalize` modes `in-session` and `results-hidden`.
- **When a `session` message arrives:**
  - a new runId resets the review UI;
  - a new stage keeps `current` if that item still exists, else moves to the first item in review;
  - selections that no longer exist are dropped;
  - the first stage switches the board to Proposed, as today;
  - `session: null` clears it.

### 5.3 The panel
RunPanel in session mode (aria-label "Edit session") shows, top to bottom:
1. the status line;
2. **Inferences:** "Formalize for dependencies", with one line per target ("“T” ← 2 arrows" or "“T” ← follows from nothing") and its step chip: queued, running, ended, cancelled, failed or not run. Never a verdict;
3. Claude's pending questions, and the notices shown up front;
4. the stage report (§5.4);
5. **the events box:** "Since your last action: …", with links to the items;
6. the list with the detail (§5.5–5.6);
7. "Rejected in this session";
8. folded: answered questions; Claude's activity, withheld while a step runs and while the results are hidden ("Show Claude's activity" opens the reveal dialog, D2-10); the backend.

### 5.4 The stage report (RV-10)
A `<details open>` block, summarised "Stage N · K targets · results shown · consistency unchecked", or, while the results are hidden, "Stage N · K targets · results after the review (M items to decide) · consistency unchecked" with Show results. It holds:
- **each target, while the results are shown:** the verdict line, the band (`bandsOf` on the shown graph, with Claude's arrows marked by their status), and Rests on, including "through ‹L›'s proof (this session)". While they are hidden, each target reads "result after the review";
- **"Not needed"** and **"What is missing"** (results shown): the gap in Claude's words, plus `missingArrowHints`; their "select ‹card› → ‹target› too" gets a "Select these arrows" button;
- **"Consistency unchecked",** always;
- **each step's words, while the results are shown** (D2-10): Claude's summary, and "Assumed without asking" with **Ask me instead** (D2-13). That opens the decline menu on the step's statement items, set to Shaky with the note "Ask me about: ‹choice›" prefilled; the user confirms;
- RV-13's "proposed nothing", the step outcomes in telelean's words and telelean's notes on questions (§3.2, D2-59), while the results are shown; and the withdrawn items, leaving out Results' parts while the results are hidden (F10).

### 5.5 The list (RV-2)
- **Order** (`reviewRows(items, inferences, nodes, filter)`). Groups:
  1. the source cards that are not targets, in board order;
  2. Vocabulary (N): its terms, with "k of N accepted";
  3. Definitions: the declaration items;
  4. the targets, in inference order;
  5. other cards;
  6. cards not on the board.

  Within a card: its fields item, then its Add arrow and Add premise items, then its Result. Every item's listed dependencies come before it (tested).
- **Header:**
  - the counts: "3 in review · 5 accepted · 1 declined", plus "· 1 to be redone";
  - the "Only in review" filter and "Select all in review";
  - group buttons "Accept N" (previewing `planGroupAccept`, e.g. "Accept 4 of 6") and "Decline…". They send `own: false`, even for one item (D2-32).

  After a group Accept, a note lists what was left: "Left 2: ‹item› needs its own Accept (belief) · ‹item› depends on ‹item› (in review)".
- **Rows:**
  - a checkbox;
  - the status as glyph and word, never colour alone: ● in review, ✓ accepted, ✗ declined (Reject, Shaky or declined), ↻ to be redone, – withdrawn. A Result while the results are hidden reads ◌ "result after the review", with no status;
  - the label, with card names in UserText or AgentText;
  - the badges belief, changes what is proved and depends on N; the markers;
  - a spinner while a decision is on its way.
- **Keyboard** (D2-37), outside text fields:
  - ↑/↓ Back/Next; Home/End;
  - Space selects;
  - A accepts the current item, as its own Accept (`own: true`); Shift+A is Accept & next;
  - D declines: at once for an arrow item, otherwise it opens the menu (R Reject, S Shaky; T disabled);
  - Enter opens the detail on a narrow panel; Esc closes a menu, then clears the selection;
  - Ctrl+Z / Ctrl+Shift+Z act on the session stack.

  There is no key for Show results: seen early is permanent. While a step runs, the keys that decide do nothing (D2-62).
- **Accessibility:** a listbox, `aria-multiselectable`, one group per card, `aria-activedescendant` for `current`.
- **Narrow panel:** the list and the detail sit side by side from 640 px; below that, the detail replaces the list ("◀ All items").

### 5.6 The item detail
- **Header:** the label, status, badges and markers; "4 of 12" with Back/Next; "Show on board".
- **Body, by kind:**
  - **formalize:** the sentence above its Lean, the Fully explicit toggle, and "What the Lean uses";
  - **change:** field by field, before → after; "sentence and Lean may disagree"; Mentioned by;
  - **add:** every field;
  - **add-premise:** Claude's sentence and why it is needed, the Lean, "closes the gap (checked)", "may simply restate the target", "replaces follows from nothing", and "completion not checked" or "meaning differs where it was written";
  - **add-arrow / remove-arrow:** both cards' sentences, Claude's why, "adds no new basis";
  - **delete;**
  - **vocabulary term;**
  - **declaration:** the code, the gloss, "Your statements rely on it: …", and the code before a change;
  - **a hidden Result:** "The results are shown once you have decided every statement and belief item: ‹items›." Show results is a secondary button; its dialog says that every result of the stage is shown and noted as seen early;
  - **a shown Result:**
    - the verdict, with its reason chips;
    - the flags: proved from nothing ("check what the statement says"), "proves a statement changed in this session", and "replaces your proof" with the previous proof;
    - "you saw this result early";
    - the band, Rests on, Not needed, and the cards whose basis changes;
    - the proof (collapsible);
    - for not proved: the gap and the hints, and "consistency unchecked";
  - **proof-broken:** Accept is disabled, with "Re-prove it with Formalize for dependencies".
- **"updated"** opens "Previous proposal".
- **Footer:**
  - in review: Accept and Accept & next (both the item's own Accept, `own: true`), Decline ▾;
  - decided: "✓ Accepted · Back to review", or "✗ Declined (Reject) · Back to review";
  - a disabled Accept shows the gate's reason, with "Select them" for missing dependencies;
  - Accept on a not-proved Result has the tooltip "Accept the outcome: “T” stays as it was";
  - while a step runs: "Claude's step is running: you can review when it ends." in place of the buttons.
- **Hold-as dialog** (Accept on an Add premise): "How do you hold “‹sentence›”?", with "As an axiom (you hold it)" and "As a proposition, pending proof (assumed until proved; never green)", plus an optional one-line Why. For an Add premise that is already written (an adopted ghost of a converted v1 run), only "As an axiom (you hold it)" is offered (AF12).

### 5.7 The decline menu and group decisions (§10)
- **Arrow items:** one "Decline" (DO-0), described as "The arrow is taken away at once; results that use it are redone."
- **Results:**
  - Reject: "keeps the previous proof; Claude may not offer this exact proof again";
  - Shaky: "Claude tries again at Submit review".
- **Other kinds:**
  - Reject;
  - Shaky, with a "Note for Claude (optional)" field;
  - "Transform…", disabled: "The transform window comes with a later slice: use Reject, or Shaky to let Claude try something else." (D2-14). Transform is never offered on Results or arrow items.
- **Hidden Results:** no menu; Show results first.
- **Rejected in this session:** current rejects, with Un-reject; superseded rejected versions, view only. Results and their parts are left out while the results are hidden (F10).
- **Group decisions:** the list's buttons, and the Context Menu section in 2h ("N review items", Accept / Decline…), send one `decideItems` with `own: false`. So a group never gives an RV-7 item its own Accept, even when it holds a single item. A group Decline applies one option, and the plain decline to arrow items.

### 5.8 The session bar (CM-6; replaces ProposalBanner)
- **Left side:** "Edit session · Formalize for dependencies: “T”" (or "· 3 targets"), "Stage N", and the phase text:
  - step: "Claude's step for “T” (2 of 3): working · formalising", "waiting for your answer", or "checking Claude's result", then "The review waits until the last step ends.";
  - stage: "Review: 3 in review · 5 accepted", plus "· results after the review" while they are hidden;
  - confirming: "Confirm the end of the session";
  - interrupted: "Interrupted: the window reloaded while Claude was working".
- **The Current | Proposed switch.**
- **Right side:**
  - Cancel step (phases step and interrupted) and Resume (interrupted); Retry step (from the heading). With steps left in the queue, Cancel step's tooltip says "Cancels this step and the N after it; Retry step runs them later.";
  - Raw Lean diff… (phase stage): while the results are hidden, the reveal dialog comes first: "The raw diff shows Claude's proofs: opening it shows the results (noted as seen early).";
  - Submit review, the primary button:
    - disabled: the reason from `submit.gate`, with "Go to the first one";
    - enabled: the tooltip "Leads to the end confirmation: every item is accepted or rejected (no Claude step)" or "Starts Claude's next steps for N Shaky items and M to be redone; accepted items carry over";
  - Exit session…;
  - "Review (N)", when the panel is hidden.
- **Second lines:**
  - the ES-4 heading: "Claude's step did not pass: ‹text›. You can decline, formalize again or exit; nothing can be accepted until a later step passes.", "Step cancelled", or "Step failed: ‹text›", with Retry step;
  - ES-7 drift: "Your files changed since the session started: ‹files›. Apply stays disabled until they match again (undo those edits in the editor), or until you exit the session.";
  - judging: "Re-checking the working copy…";
  - (fixer 2c2 r1) the stage's problems (`SessionView.problems`), each with its text and a link to the items it names.
- **RunBadge**, never a verdict: "Edit session: Claude working · Spyro · 3/25 checks", "Edit session: review · Spyro".
- **RunElsewhere:** "An edit session is active on ‹subject›: the boards of this folder are read-only until it ends. [Show it]".

### 5.9 The end confirmation and Exit
- **Phase confirming:** EndConfirmation replaces the list. It is not modal, so its links work. It holds:
  - Changes (N), each a link;
  - Rejected, not applied (M), folded; "not run" for dropped inferences;
  - "Definitions and presuppositions you endorse";
  - **Final check:**
    - running: build · checks · backstop;
    - passed ✓: "every check passed on exactly this state; every new assumption, definition and instance was accepted individually", plus "file checks reused the last result" when they were;
    - failed ✗: the failures, each with its rule label, text, and links to the item and declaration;
  - **buttons:**
    - [Apply]: enabled only when the check passed and there is no drift; it sends the check id. Tooltip: "Writes the changes as one history entry and one Undo step", or "Records the outcome: nothing in your files changes";
    - [Back to review];
    - [Exit session…].

  There is no freeze list and no keep tick in slice 2.
- **Exit:** a modal, "Exit the edit session? This discards N accepted items and M items in review[, and stops Claude's step]. Your files are not changed; your answers to Claude's questions stay recorded. Exit cannot be undone.", with [Exit session] and [Back].
- **After Apply:** "Applied: the session's changes are in your files. One Undo takes the whole session back."

### 5.10 The Proposed view in a session (2h)
- **The overlay.** `sessionOverlay(board, current)` builds it from `SessionView.board` only: no GraphDiff and no `resultSignature` in session mode. This also ends slice 1's leaks (§7.3).
- **Card marks:** ItemMark replaces DiffBadge.
  - Glyph, word and status: "+ new · in review", "~ Formalize · accepted ✓"; a click focuses the item.
  - While the results are hidden, every target gets RESULT_HIDDEN_CHIP, and every card shows the base-masked data (§4.7), downstream cards with no chip.
- **Claude's arrows** (BD-5, S15, D2-34): `EdgeSpec.proposed { item, change, status }`, drawn only while the results are shown.
  - **An Add in review:** translucent (opacity .45), with a "+" badge at its midpoint; thin when unused, solid once the proof uses it; never round dots.
  - **An accepted Add:** dotted, still with the "+" badge, and the tooltip "Claude's arrow, accepted: written to your files at Apply".
  - **A Remove in review:** the base arrow, translucent and dotted, with a "−" badge.
  - **An accepted Remove, and a declined Add:** not drawn.
  - **High contrast:** no opacity; a dashed outline and the badge.
  - The EdgeEngine gets `setBadges`, which FZ-13's lock badges will share later.
  - Hit role `proposed`: a click focuses the item; a right click offers Accept, Decline…, Show its review item, Show “source”, Show “target”. Never selectable for Formalize until accepted.
- **Add premise drafts** (D2-35): translucent "Claude suggests" cards at the top of the AXIOMS column, with a "+" arrow into the target and a "Review it" button, only while the results are shown. They are decided only in the list.
- **Selection** (RV-9, CM-2): during a session, the Proposed view allows selecting cards, drawn arrows, accepted Claude arrows, marks and items, by click or rectangle. Drawing stays off. Moving a card is a session step (`moveProposed`), refused while a step runs (D2-62).
- **Menus:**
  - Formalize (mid-stage), the card's item entries, Select incoming arrows, Show on board;
  - editing entries stay disabled, with 1f's and 1c2's reasons;
  - "Open in editor" gets the tooltip "Opens your file; Claude's version is in the raw diff". It opens the card's place in the Current graph, since the masked graph carries no positions (§4.7); for a card that exists only in the session it is disabled, with "Claude's version is in the raw diff".
- **Legend:** an entry `proposed` ("proposed by Claude: + adds, − removes"), listed only during a session.

### 5.11 Formalize (2h)
- **`formalizeState`** returns `{ disabled, inferences (ordered), title, mode: 'start' | 'mid-stage' }`. The "several targets" reason goes. Formalize is disabled:
  - during a step: "Claude's step is running: Formalize again when it ends.";
  - while the results are hidden: "The results are not shown yet: decide the statements, or show the results, first.", with Show results (D2-65);
  - while confirming: "Back to review first.";
  - in the Current view during a session: "During a session, Formalize asks about the Proposed view: switch to Proposed.";
  - while judging, during another subject's session, on a provisional card, and on a cycle.
- **The AR-8 questions,** for each source that is not a target of the same request, in this order:
  1. in a session: "“‹L›” is not proved; during a session it can't be marked pending." [Select the arrows into “‹L›” too] [Cancel];
  2. outside a session: as in 1e (mark pending);
  3. no statement: [Select the arrows into “‹L›” too] (when it has arrows or the mark) [Cancel].

  "Select … too" adds L's drawn arrows (or its mark) to the selection and evaluates again.
- **Posting:** `formalize { inferences }`, or `formalize { runId, stage, inferences }` for a mid-stage Formalize.

### 5.12 Session Undo (2h; D2-38)
- **Steps,** by the host's label: "Accept: ‹label›", "Accept N items", "Decline: ‹label› (Reject)", "Back to review: ‹label›", "Accept: Add premise ‹card› (as an axiom)", "Show results", "Move: ‹card›".
- **Not steps:** navigation, selection, the filter, the explicit toggle, panes, opening details, Exit, Apply.
- **Routing** (`undoScope({ session, proposedOnScreen, focusInSession })`):
  - `session` when a session exists and either the Proposed view is on screen or the focus is inside `data-undo-scope="session"` (the panel, the session dialogs);
  - otherwise `board`, which stays locked during a session, with "Your files can't change during an edit session; Undo in the Proposed view undoes your review steps."
- **When sealed:** disabled, with the UN-5 text. **While a step runs:** disabled, with D2-62's text.
- `sessionUndo` sends the top action's id (`SessionView.undo.step`). A cascade opens the dialog, worded as §3.6 words the inverse action. For example, undoing an Accept: "Undoing it also returns these accepted items to review: …".

### 5.13 Phases and what they allow

| Phase | List | Accept | Decline | Submit | Formalize | Controls | Undo |
|---|---|---|---|---|---|---|---|
| step | the stage as the queue found it, read-only (D2-62) | no | no | off | off | Cancel step (with the rest of the queue), Exit | no |
| interrupted | as in step | no | no | off | off | Resume, Cancel step, Exit | no |
| stage | shown | yes; none under "did not pass"; a Result or a Result's part only while the results are shown | yes, with the same exception for hidden Results | its gate | Proposed view only, with the results shown | Retry (with a heading), Exit, Raw diff, Show results | yes |
| confirming | replaced by the confirmation | — | — | — | off | Apply, Back, Exit | after Back |
| applying | — | — | — | — | off | none | — |

While judging (a judge, or a write in the session's queue: a decision's, a take-out, a premise write or a completion; AF3): Submit, Apply, Formalize and Retry wait.

### 5.14 Removed in 2h
- `run/Review.tsx`'s stepper, `ReviewUi`, `reviewSteps`, `pastStatements`, `definitionsApproved`, `acceptSelection`, `answerDefinition`, and the Feedback composer;
- `run/ProposalBanner.tsx`;
- GhostSuggestion's "I hold this" / "No": Add premise items replace ghosts;
- the store's `acceptProposal`, `sendFeedback`, `adoptGhost`, `rejectGhost`, `discardProposal`, `openProposalDiff`, and `PROPOSED_NO_UNDO`;
- the legacy `proposal` path, and the old messages (§2.4).

Their tests are deleted, and each deletion is listed in the report.


## 6.1 Tests for 2g (extract)

**2g** (webview unit tests):
- **the list:** `reviewRows`' order, and the dependency-first invariant on every fixture; counts, filter, navigation; hidden Results as neutral rows;
- **decisions:**
  - Accept posts exactly one `decideItems` with `rev`, `stage` and `own: true`; Accept & next moves on, and moves back on a refusal; "Select all in review" then Accept, with one item, sends `own: false`;
  - an Add premise opens hold-as and sends `holdAs` and `rationale`, with only "As an axiom" for one already written (AF12); arrow items decline plain;
  - `needs-confirmation` opens the cascade dialog, with the hidden-results sentence when `hiddenResults`; Continue sends `confirmed`; Cancel sends nothing;
  - a group sends one message and shows what was left;
- **messages:**
  - `revealResult` sends `via` after the reveal dialog;
  - submit, end, exit, retry and diff carry the right fields (the diff sends `confirmed` after the dialog); busy blocks a second request;
- **read-only while a step runs:** every review control is disabled with D2-62's text, and the keys that decide do nothing;
- **session changes:** a new stage keeps `current`; the persisted UI is used only for the same runId;
- **the session bar:**
  - its state for every phase and heading; the Submit texts; Cancel step's tooltip with the steps left;
  - drift disables Apply; Apply is disabled while the check runs and after it fails;
  - the Exit dialog counts listed items only;
  - badges never say proved or not proved in a session;
- `reviewKey` (no reveal key), `paneModeFor`, provenance (AgentText / UserText);
- the fixture pair (proved and not proved, results hidden) gives equal rows, counts and panel text.


### 6.2 Cheat scenarios
Each is a FakeBackend script in `packages/runner/test/run/fixtures/sessions/`, and the same state is built by hand in `core/test/review/cheats.test.ts`.
- **S1:**
  - the step rewrites the target to `¬ GoodAddition cynder newSpyro ∨ True` and proves it by `Or.inr trivial` → `existing-changed` (`target`), a counted attempt, rollback;
  - the same with a premise's Lean, and inside a mid-stage Formalize;
  - an instance placed before a fixed statement, whose printed value stays the same but whose constants change → `meaning`.
- **S4:**
  - Formalize(P) and Result(T), where T uses P.holds: the Result's Accept is blocked by Formalize(P);
  - declining Formalize(P) makes the Result to be redone, listing the accepted ones;
  - tampered records (Result accepted, P declined, P's statement left in F) → backstop `not-accepted`, also when the session's records omit P.
- **S5:**
  - `def InGame := GoodAddition`, a premise formalised through it, a one-line proof:
    - `decl:InGame` is a belief, and a group Accept leaves it;
    - the results stay hidden until InGame and the Formalize items are decided;
    - backstop `own-accept` if it was accepted by a group;
  - the class-field variant: a belief through typeConsts; with `noTypeConsts`, conservative, and Apply refused (`facts`);
  - the coercion variant (`def toGame` reached through ↑);
  - `axiom Unicorn.exists : Nonempty Unicorn`: a belief, with its helper instance in the same item.
- **S6:**
  - Claude writes `axiom T.holds : T` → `holds-kind`, or `new-axiom` (`pending`);
  - a theorem made an axiom with the same name → `type-changed` or `holds-kind`;
  - a Prop axiom bound to no card → `new-axiom` (`belief`);
  - an Add premise stays outside ws/ until accepted, then is written by the ledger;
  - an extra axiom in F → backstop `unowned`;
  - T2's proof uses a lemma of T1's proof, and T1 is not a source of Q(T2) → `undeclared-premise` (`other-result`); Claude proposes T1 → T2 → refused (`other-target`);
  - a later step's statement mentions a definition that T1's premise draft reaches → `undeclared-premise` (`other-result`, F7).
- **Stray commands:**
  - `attribute [simp] lemma` or `#print lemma` beside a lemma → `stray-command`, so a later Reject of the lemma can never leave an orphan line behind;
  - `open Classical` or `variable` before a fixed statement → `stray-command`; the same text in F → backstop `unowned`.
- **S14:**
  - an unselected proved card whose basis the question covers → `undeclared-premise` (`unselected`); the same through a `@[simp]` lemma (real Lean once);
  - `propose_arrow` makes it pass: the Result depends on the arrow item, and declining the arrow makes the Result to be redone;
  - facts without valueConsts → `source-only`;
  - at Apply, B.2 for every changed proposition.
- **S15:**
  - Claude edits `premises:` → `markup`;
  - `propose_arrow` into a non-target, into an axiom, into a target questioned by its mark, a declined arrow, or one closing a cycle → each refused with its exact text;
  - an Add arrow is own-Accept, hidden until the results are shown, and gates the Result's Accept.
- **S17:**
  - a source without `.holds` gives nothing; a proof taking it as a hypothesis is not proved;
  - Claude writes `axiom L.holds` → `holds-kind`;
  - a session-proved source counts and creates the dependency; one that does not pass in the current state gives nothing;
  - while the results are hidden, every mid-stage Formalize gets the same start message, whether or not its source was proved (D2-65).
- **S18:**
  - Claude sets or removes `follows_from` → refused;
  - a proof using no card is flagged proved from nothing;
  - an accepted premise removes the mark, only through the ledger.
- **S22:**
  - Apply refuses while the files drift, including a hand edit between the two reads;
  - a stale Undo after a sealing step cannot make Apply write anything that is not keyed and checked again;
  - no `accept-base` commit is ever made.


## 7. Decisions, conflicts, patches

### 7.1 How the three designs were reconciled

| Topic | Session engine | Review UI | Checks | Resolved |
|---|---|---|---|---|
| How Claude adds an arrow | appends ids to `premises:` itself | — | a `propose_arrow` tool | the tool, written by telelean at normalise (D2-1): no G5 exception, immediate refusals, every arrow attributable |
| Module | `core/src/session*` | `core/src/session.ts` | `core/src/review/` | `core/src/review/`: avoids confusion with `edit/session.ts`'s EditSession |
| Item identity | `id` + `key` | `id` + `rev` | the key as the id | an opaque id, a key, and a rev (D2-31) |
| Vocabulary | a group + sub-items | one item with sub-statuses | one item per term | one item per term, grouped (D2-31) |
| Statuses | an object union | strings | strings + records | a string status with side fields (§2.2) |
| Phases | starting, step, stage, confirming, applying, ended | step, review, ending, interrupted | — | step, interrupted, stage, confirming, applying (§2.3) |
| Messages | setItemStatus, showResult, applySession, exitSession, backToReview … | decideItems, revealResult, endSession { decision } … | — | the UI's set, with the engine's semantics (§2.4) |
| RV-6 mask | graph-level, from base | base-derived data for an outcome-independent set | facts-level, at step start | first the spec's step-start data, facts-level (D2-6), with a reveal closure (D2-9); since AP-24, B's data for every proof while the stage's results are hidden, facts-level, with the UI's indistinguishability test (D2-61) |
| What a hidden Result waits for | RV-5's dependencies | "outcome-independent" (named, not defined) | RV-5's dependencies | first an outcome-independent pre-set per Result (D2-7); since AP-24, every undecided statement and belief item, for all Results at once (D2-61) |
| Claude's activity | — | folded, not counted | must not leak | withheld while the results are hidden; opening it counts as Show results (D2-10) |
| Free text to Claude | a note on Shaky | one note at Submit | — | a note on Shaky; Ask me instead uses it (D2-13) |
| Decisions during a step | all allowed, carried out after | all, except the running step's items | — | first both (D2-3); since AP-24, none: the list is read-only while Claude works (D2-62) |
| Submit | one step per inference | one Claude step | one step with openings | one step per inference (D2-2) |
| Step-start facts | one file, overwritten | — | one per step | first one per step; since AP-24 none: the base mask needs only B's facts (D2-61) |
| Decisions while judging | Accept allowed | — | Accept waits | allowed; Submit and Apply wait (D2-27) |
| Proof-only declarations | owned by reach | — | owned by the creating step | the creating step and phase (D2-43) |
| Step-limit finding | `existing-changed` + token | — | a new code `preset` | `existing-changed` + `session` (D2-41) |
| Comparator at Apply | reused for the same commit and permitted set | — | reused unless the proof's reach changed | the engine's rule: EN-2 allows reuse only on an identical state |
| A cascade's content | removed "when it would not build" | — | not said | always removed on Reject; kept on Shaky (D2-28) |
| Badge growth | group-accepted items only | — | any growth | any growth (D2-23) |
| Drift watcher | the runner subscribes to `onDidChange` | the host calls `filesChanged()` | — | the runner subscribes: no new host API |
| Exit confirmation | a host phase | a dialog in the board | — | a dialog in the board (D2-36) |
| Endorsements | a sidecar | listed | recorded | a sidecar inside the Apply's history entry (D2-18) |
| `typeConsts` | — | — | needed for RV-7 and the backstop | adopted (D2-30) |
| Old runs in review | converted | converted | — | converted (D2-16) |
| Sub-slices | 8 | 9 | 8 | 8, ordered core → runner → webview (§1); 10 after the critic's round 1 split 2b into three, 11 after round 2 split 2a into two, and 13 after AP-24 split 2b1 and 2c into two each (§8) |

### 7.2 Autopilot decisions (for `02_autopilot_decisions.md`)

1. **D2-1** AUTOPILOT DECISION: Claude proposes arrows with a new tool, `propose_arrow { source, target, why }`. telelean validates it at once and writes the arrow into the target's `premises:` at the step's normalise. *Alternative:* Claude appends ids to `premises:` itself, under a G5 exception for the step's target.
2. **D2-2** AUTOPILOT DECISION: Submit review runs one Claude step per affected inference, sources first, in the same conversation; DO-3's "not identical" is checked per inference. Content that another step's rework would break is taken out first (D2-57). *Alternative:* one Claude step for all Shaky and to-be-redone items, as RV-12 words it.
3. **D2-3** withdrawn by AP-24 (2026-11-19): nothing is decided while a step runs (D2-62), so no decision waits for a step's end. *It was:* decisions during a step, those that change the working copy recorded at once and carried out after the step, with the step judged on the records of its start.
4. **D2-4** AUTOPILOT DECISION (A12; revised 2026-11-19, round 2, and by AP-24): a target whose source, an earlier target of the same queue, has no `.holds` when the target's step starts gets a statements-only step. Claude formalises the statements, fixes them, and finishes not proved naming that source, with no proof attempt. Its Result reads "not proved: ‹L› was not proved". Once it ended, the step is not offered to Retry step; formalize the target again once L is proved. A cancelled or failed statements-only step goes to Retry step like any other, and decides its mode again when it runs (F3). So the visible items never depend on L's hidden outcome; only the step's duration does. *Alternative:* run the step normally, letting Claude try and fail. Or (the first version) skip it without contacting Claude: the target's statements were then formalised only when L was proved, which showed L's hidden outcome.
5. **D2-5** AUTOPILOT DECISION (revised by AP-24): RV-6 is enforced on the host. While the results are hidden, the runner sends only a masked view: the base mask (D2-61), each Result as a neutral row, Results' parts left out, and Claude's words withheld. *Alternative:* mask in the webview, as 1d does.
6. **D2-6** withdrawn by AP-24 (2026-11-19): the base mask of D2-61, its former alternative, replaces it. *It was:* each hidden target's `.holds` as at the start of its step, through per-step start facts and footprints recomputed from the type and value constants.
7. **D2-7** withdrawn by AP-24 (2026-11-19): no Result waits for a set of its own; all of them wait for every undecided statement and belief item (D2-61). *It was:* an outcome-independent waiting set per hidden Result.
8. **D2-8** AUTOPILOT DECISION (revised by AP-24): while the results are hidden, a Result or a Result's part can be neither accepted nor declined; Show results first. Group decisions skip them and say so. *Alternative:* allow Decline unseen.
9. **D2-9** withdrawn by AP-24 (2026-11-19): Show results shows every Result of the stage (D2-61), so there is no closure to compute. *It was:* Show result revealed a Result together with the hidden Results it waited for.
10. **D2-10** AUTOPILOT DECISION (revised by AP-24, which folds D2-58 into it): Claude's words (summary, gap, "Assumed without asking", "proposed nothing"), activity, gate attempts and notices are withheld while a step runs and while the results are hidden. "Show Claude's activity" counts as Show results, like Raw Lean diff…. A running step shows only neutral progress counts. *Alternative:* today's D-19 (folded; opening not counted).
11. **D2-11** AUTOPILOT DECISION: a session's attempt records reach attempts.jsonl only when it ends (Apply, Exit, or the recovery of a crashed session). This fixes the M2 leak through the Current board's card details. *Alternative:* records per step.
12. **D2-12** AUTOPILOT DECISION: "Open the whole model" and "Claude may add cards" wait for slice 3, and Formalize's ▾ is not shown. *Alternative:* build them in slice 2 (they need Proof broken, Remove arrow and the card-creation rules).
13. **D2-13** AUTOPILOT DECISION: until slice 4, a Shaky decline takes an optional note, shared by a group decline and quoted in the Submit feedback. "Ask me instead" is a Shaky decline of that step's statement items, with "Ask me about: …" prefilled. *Alternative:* one "note for Claude's next step" at Submit review.
14. **D2-14** AUTOPILOT DECISION: Transform (DO-2) is listed in the decline menu, disabled, with "The transform window comes with a later slice: use Reject, or Shaky to let Claude try something else." *Alternative:* hide it.
15. **D2-15** AUTOPILOT DECISION: a Shaky step re-proposes content only: no new cards, no splits, no merges. *Alternative:* allow splits now, without the transform rules.
16. **D2-16** AUTOPILOT DECISION (revised 2026-11-19 after AP-24's recheck, AF12): a run left in review by slice 1 (v1, e.g. the doorstuck run) is converted on reload into a one-step session, with all its items in review. A ghost it adopted ("I hold this") becomes an Add premise item that is already written: in review, accepted only as an axiom (v1 wrote an AXIOM card), with no second write; a decline takes it out. If the conversion fails, only Exit is offered. *Alternative:* keep the old stepper for old runs. For adopted ghosts: convert them as accepted, as an axiom, since the user said "I hold this"; but RV-5's defensive rule would return one to review whenever its statement uses vocabulary still in review, leaving a written premise in review anyway.
17. **D2-17** AUTOPILOT DECISION: a new status, "withdrawn", for an item whose content Claude removed in a Shaky step. It needs no decision, blocks nothing, and is listed in the stage report. *Alternative:* count it as declined.
18. **D2-18** AUTOPILOT DECISION: endorsements (EN-3) go in `.telelean/subjects/<S>/endorsements.json` as {name, text hash}, written inside Apply's history entry, so Undo of the Apply removes them. *Alternative:* an append-only log outside History, like decisions.json.
19. **D2-19** AUTOPILOT DECISION: when Claude adds an arrow after the statements were fixed, the gate re-exports the challenge with the inference's new permitted set before the comparator; the statements stay fixed. *Alternative:* require a second freeze_statements.
20. **D2-20** AUTOPILOT DECISION: a mid-stage Formalize may select your arrows and Claude's accepted ones (declining such an arrow later takes its source out of the question, D2-59). An arrow in review is not selectable: "Accept this arrow first." *Alternative:* allow arrows in review, so the new inference would depend on an undecided item.
21. **D2-21** AUTOPILOT DECISION: Claude may propose an arrow only from a card that has a `.holds`. An empty statement at the source of Claude's own arrow is not fuzzy. *Alternative:* let Claude formalise E(T)'s sources too.
22. **D2-22** AUTOPILOT DECISION: one Claude conversation per session, with a new turn per step, resumed with `--resume` after a reload; the caps apply per step. *Alternative:* a new conversation per step.
23. **D2-23** AUTOPILOT DECISION: an accepted item returns to "in review" whenever its badges grow, not only when it was accepted by a group. *Alternative:* only group-accepted items.
24. **D2-24** AUTOPILOT DECISION: every change in the final state must belong to an accepted item, including lemmas and definitions that Appendix B exempts from own-Accept. This is stricter than Appendix B. *Alternative:* the exempt ones need no item at all.
25. **D2-25** AUTOPILOT DECISION: facts without type constants (old recordings, a failed probe) make every new or changed definition and instance a belief, and refuse Apply until a fresh build provides them. *Alternative:* fall back to references.
26. **D2-26** AUTOPILOT DECISION: items depending on each other in a cycle (an SCC) are accepted one by one, each blocked only by dependencies outside the cycle; Apply requires such a cycle to be wholly accepted. *Alternative:* refuse cyclic items.
27. **D2-27** AUTOPILOT DECISION (revised 2026-11-19 after AP-24's recheck, AF3): Accept, Decline, back to review, Undo, Redo and Show result stay allowed while telelean re-checks or writes the working copy: while a judge runs, and while any write waits in the session's queue (a decision's, a take-out, a premise write, a completion). Submit, Apply, Formalize and Retry wait until both are done, and a queue of Claude steps then starts as the queue's last write, so no premise write or completion can interleave with Claude's step or with the end confirmation. *Alternative:* block every decision while checking.
28. **D2-28** AUTOPILOT DECISION (revised 2026-11-19): Reject (and a plain decline) also takes out every item that depends on the declined one, transitively, if it is in review, to be redone or declined Shaky; they become "to be redone". Shaky takes nothing out: its dependents become "to be redone" with their content kept (D2-48). *Alternative:* take a dependent out only if it would no longer build.
29. **D2-29** AUTOPILOT DECISION: Cancel step, a cap or an environment failure drops the whole step (back to its start) and keeps the rest of the queue for Retry step. *Alternative:* keep the step's passing part (its fixed statements).
30. **D2-30** AUTOPILOT DECISION: a new facts field, typeConsts, from the existing value probe (since 2b3a its own Lean job, D2-75), so definitions reached through a field, an instance's class or an axiom's type count for RV-7 and the backstop. *Alternative:* valueConsts only, so S5's class-field variant would escape.
31. **D2-31** AUTOPILOT DECISION (its id revised 2026-11-19 after AP-24's recheck, AF7): items have an opaque id, a key (`card:…`, `proof:…`, `arrow:…`, `premise:…`, `vocab:…`, `decl:…`) and a revision. The id is `it` and 16 hex digits of the sha256 of the run id and the key, so no visible id depends on how many hidden items exist. Every vocabulary term is its own item, in one "Vocabulary (N)" group. *Alternative:* one Vocabulary item with sub-statuses. For the id: two counters, one for listed items and one for Results' parts, each numbering new records in key order.
32. **D2-32** AUTOPILOT DECISION (revised 2026-11-19, to the former alternative): `decideItems` carries an explicit `own` flag. Only the detail's Accept and Accept & next, and the A key on the current item, send it; a group action never does, whatever its size. So "Select all in review" with one item never gives an RV-7 item its own Accept. *Alternative:* one decision counts as the item's own Accept (the first version).
33. **D2-33** AUTOPILOT DECISION: moving cards on the Proposed view is a session-stack step; Apply writes the positions in its history entry, and Exit drops them. *Alternative:* defer moves to slice 3.
34. **D2-34** AUTOPILOT DECISION: Claude's arrows in review are translucent with a "+" badge (never dotted). Accepted ones are dotted with the "+" badge until Apply. High contrast uses no opacity, a dashed outline and the badge. *Alternative:* accepted ones stay translucent.
35. **D2-35** AUTOPILOT DECISION: an Add premise not yet accepted shows as a translucent "Claude suggests" card at the top of the AXIOMS column, with a "+" arrow into its target; it is decided only in the list. *Alternative:* on the canvas, next to the target.
36. **D2-36** AUTOPILOT DECISION: Exit's confirmation is a dialog in the board, not persisted. The Apply confirmation is a persisted phase, since it holds the final check. *Alternative:* both persisted.
37. **D2-37** AUTOPILOT DECISION, the review keys: ↑/↓, A Accept, Shift+A Accept & next, D Decline (the menu, with R and S), Space selects. No key for Show result. *Alternative:* a key for Show result.
38. **D2-38** AUTOPILOT DECISION: Undo acts on the session stack in the Proposed view, and also when the focus is in the review panel or a session dialog; in the Current view the board stack stays locked. *Alternative:* route by view only.
39. **D2-39** AUTOPILOT DECISION: Apply with nothing accepted only records the outcome: no file change, no history entry, no Undo step. *Alternative:* refuse Apply and offer Exit.
40. **D2-40** AUTOPILOT DECISION: Claude may not add a Prop axiom bound to no card; new-axiom refuses it, and a missing premise is always an Add premise item. *Alternative:* allow it as a belief item.
41. **D2-41** AUTOPILOT DECISION: the step limits reuse the finding `existing-changed`, now compared with the step's start, with a new token `session`. Meaning is compared by printed type and value plus the sets of value and type constants (from the isolated probe, D2-75; a judged state whose probe failed is refused, §2.1). *Alternative:* a new code `preset`, and printed text only.
42. **D2-42** AUTOPILOT DECISION (revised 2026-11-19, rounds 1 and 2, and by AP-24): RV-7's statement closure includes the statements of Add premise drafts while the results are shown, so a definition they rely on is a belief before the premise can be accepted. Two class maps are kept: with every draft (in force while the results are shown), and with none (in force while they are hidden, and the only one the reveal rule reads), so showing the results never changes what they wait for. A definition created in a proof phase that a draft reaches is part of its Result; one created before the statements were fixed is always its own visible item, so its visibility never depends on whether a draft exists. *Alternative:* written statements only. The premise's Accept would then be undone when its definition turns up as a new belief item.
43. **D2-43** AUTOPILOT DECISION (revised 2026-11-19, and by AP-24): a new declaration (a definition, or vocabulary) is its own item when its step created it before fixing the statements. Otherwise it is proof material, owned by the Result of the step that created it and hidden with it. The owner is fixed when the declaration is created, never re-derived from later reach, and statements may not mention proof-phase declarations (F7). *Alternative:* decide by reach from the proofs only; or give proof-phase vocabulary its own item, which would show at once and so tell the outcome.
44. **D2-44** AUTOPILOT DECISION (clarified by AP-24): an inference whose step never ended (cancelled, failed, or "not run" because a Cancel step or a failure earlier in its queue dropped it) has no Result item; Submit review drops it, and the confirmation lists it as "not run". *Alternative:* a Result item reading "not run", which would need a decision.
45. **D2-45** withdrawn by AP-24 (2026-11-19): every Result's parts are hidden whenever the results are (D2-61), and keep their statuses. *It was:* a Result hidden again took its Add arrow and Add premise items with it.
46. **D2-46** AUTOPILOT DECISION (revised 2026-11-19, round 2, and by AP-24): a target re-asked by a mid-stage Formalize keeps its old question and Result on the record until the new step ends with a proof. A step that ends without one (not proved, gave up, statements only) keeps its statement-phase content, and takes back only the target's proof, its proof material, its arrows and its premise drafts. While the results are hidden, the view shows the question asked and a neutral Result either way, so how the step ended never shows early. Once they are shown, the view shows the new version, or the old question and Result with "The new question for “T” was not proved: your earlier result stands." A cancelled or failed step goes back to its start at once. A re-ask, like any mid-stage Formalize, needs the results shown first (D2-65). *Alternative:* replace the question at once and re-judge the old proof against it; a cancelled step could then take away an accepted Result, against ES-4. Or (the first version) take the whole step back when it ends without a proof, which showed the outcome as soon as the step ended.
47. **D2-47** withdrawn by AP-24 (2026-11-19): nothing is decided while a queue runs (D2-62), so the seal at the queue's start is enough. *It was:* a seal at the start of every queued step after the first.
48. **D2-48** AUTOPILOT DECISION: a Shaky Result, like one to be redone with its content kept, still counts for the inferences that use it (B.1). The judge never reverts such an item because a check fails: its Submit step reworks it. So Shaky takes nothing out of the working copy. *Alternative:* B.1 as worded ("still in review"): Shaky on a Result then reverts every Result that rests on it, and the decline menu says so.
49. **D2-49** withdrawn by AP-24 (2026-11-19), replaced by D2-64: no cascade set and no shown status. *It was:* a hidden Result's status followed an outcome-independent cascade set and showed the status it had when last shown.
50. **D2-50** AUTOPILOT DECISION (revised 2026-11-19, round 2, and by AP-24; ES-2: a target uses another target only through a selected arrow):
    - Claude may not propose an arrow from another target of the session, and may not use a declaration of another target's proof phase unless that target is a source of its question. Statements and statement-phase content may not mention any declaration of a proof phase, the definitions that premise drafts reach included (F7), nor a target's `.holds` while its Result's content is in the working copy, so nothing visible depends on a Result.
    - A mid-stage Formalize refuses a new target that is the source of Claude's arrow into another target, unless the same request selects that arrow, which re-asks that target. The refusals that existed for hidden Results are gone: a mid-stage Formalize waits for the results to be shown (D2-65).

    *Alternative:* allow such arrows and lemmas, and make the Result wait for the other Result.
51. **D2-51** AUTOPILOT DECISION (revised 2026-11-19, round 2, by AP-24, and after AP-24's recheck): a write to the working copy is recorded in run.json as in flight before it starts, and the records name the commit they describe. Recovery reverts to that commit and runs the write again. Every write of a session runs in one queue, so no two interleave: a decision that changes only statuses waits behind a write in progress (a premise write's or a completion's Lean job included), never behind a judge. The judge's whole outcome, its record changes and its reverts, is one write, planned in the queue on the current records and dropped when the working copy moved meanwhile (F8). No session write runs while a step runs (D2-62), and the start of a queue of Claude steps is itself the queue's last write (AF3). The in-memory session changes only when run.json records it, so closing the window during a write saves a state that recovery can finish (AF11). The two run.json writes that bracket a write fail loudly, and a failed first one aborts the write. *Alternative:* rebuild the records from the working copy on recovery, which can lose decisions; or let status-only decisions bypass the queue, with each write merging the records written meanwhile.
52. **D2-52** AUTOPILOT DECISION (revised 2026-11-19, round 2, and by AP-24): in a session, Claude's files may hold only declarations, with attributes written on them, and the `namespace`, `section` and `mutual` lines around new ones. Those lines are owned jointly by the items whose declarations they enclose, go with the last of those declarations, and pass Apply when all of them are accepted (F13). Any other top-level command is refused, `open … in` before a declaration included, since core's declaration scanner does not read it as part of the declaration: Claude writes fully qualified names. *Alternative:* teach the scanner to read `open … in` prefixes as part of a declaration's header (a core parser change that G0, G5, normalisation and EditSession must follow, with its own tests); or attach each such line to the next declaration's item.
53. **D2-53** AUTOPILOT DECISION: a mid-stage Formalize refuses a target with a Shaky item, since RV-9 counts it as frozen and its proof could not change. It also refuses a source whose Result is Shaky or to be redone. *Alternative:* run the step with the target's proof closed, or let the step run and fail.
54. **D2-54** AUTOPILOT DECISION: Submit review seals the stack only when it queues Claude steps. Going to the end confirmation does not seal, and Back to review leaves the stack as it was before Submit (EN-2: "with nothing changed"). *Alternative:* Submit always seals, as UN-5's list says.
55. **D2-55** AUTOPILOT DECISION (revised by AP-24): an interrupted step also offers Cancel step, which ends it as cancelled (back to its start), drops the rest of its queue as "not run", and opens the stage, with Retry step. So the user need neither spend quota on Resume nor lose the session by Exit. *Alternative:* Resume or Exit only.
56. **D2-56** AUTOPILOT DECISION (clarified by AP-24): a premise completion that fails is taken back out of the working copy. The premise stays accepted, and the Result reads "completion not checked", with Lean's message and Retry step, which runs a Claude `submit` step for the target with its proof open. A completion is a write, never a step (F15). *Alternative:* leave the failed completion in place and block Accept until a step fixes it.
57. **D2-57** AUTOPILOT DECISION (2026-11-19, round 2): before Submit review's Claude steps start, telelean takes out every Shaky or to-be-redone item kept in the working copy that depends on an item another step of the queue opens. It becomes "to be redone" (a Shaky one keeps its note and still counts in its DO-3 set), and its own step proposes it again. The step that opens what others depend on runs first. So a Shaky item that another inference's content uses, such as a shared premise's Formalize item, can be reworked; without this, the other inference's proof would break in that step and count against Claude. *Alternative:* one Claude step for every Shaky and to-be-redone item, as RV-12 words it (D2-2's alternative), which needs a step with several targets.
58. **D2-58** withdrawn by AP-24 (2026-11-19): all of Claude's words wait for the stage's results (D2-10, revised). *It was:* a step's words waited for the Results of that step and of every earlier step.
59. **D2-59** AUTOPILOT DECISION (2026-11-19, round 2; Undo clarified by AP-24): a question's sources count for B.1 and B.2 only while their arrow exists in the state judged, at Apply too. Declining Claude's arrow that a mid-stage Formalize selected also takes its source out of that question: the Result becomes "to be redone", and the stage report says so. The decline's stack step records the change, so its Undo puts the arrow and the source back (F4). So Apply can never write a proof that uses a card with no arrow into its target (§14.7). *Alternative:* refuse to decline an arrow while a question selects it.
60. **D2-60** AUTOPILOT DECISION (2026-11-19, round 2): a to-be-redone item whose content was taken out cannot be set back to "in review" by hand: "Its content was taken out: un-reject what took it out, or let Claude redo it at Submit review." One whose content is still in the working copy can be. Un-reject brings back the dependents its commit took out, as "to be redone" with their content in place. *Alternative:* setting a taken-out item back to review re-applies its content by an inverse merge, as un-reject does.
61. **D2-61** AUTOPILOT DECISION (AP-24, 2026-11-19; revised after its recheck, AF4 and AF6): meaning before proof is one reveal for the whole stage. Every Result is neutral while any statement or belief item that is not part of a Result is undecided (belief judged without the premise drafts, so the rule has no fixpoint), or until Show results, which shows them all at once, noted as seen early. Undecided means in review, or to be redone with its content still in the working copy, which RV-6 does not count as decided; a Shaky cascade, RV-3 at a queue's end and un-reject make such items without the user deciding them. They are hidden again when such an item next becomes undecided, which also ends the force. Submit review needs the results shown (D2-64), so a statement to be redone with its content kept is first decided (as Shaky, Claude redoes it), or the results are shown. While they are hidden, the Proposed view shows every proof-derived datum as in the session's base: each target's `.holds` with B's text and facts; proof-phase declarations, Claude's arrows and written premise cards dropped; for every declaration B has with the same text, B's proof-derived facts (axioms, sorry) and B's messages, at the working copy's positions, since the build places refs, messages and anonymous instances by position. Statements and vocabulary come from the working copy. This hides at least what RV-6 requires. *Alternative:* the per-Result reveal of the earlier rounds (a waiting set and a cascade set per Result, a reveal closure, masks from each step's start, a shown status), in which two fix rounds kept finding new leaks. For items to be redone: not counting them, as before the recheck, which showed the results before the user had judged such a statement.
62. **D2-62** AUTOPILOT DECISION (AP-24, 2026-11-19): while any step of the session runs, a queue included, the review list is read-only: no status change, no Show results, no Undo or Redo, no move, no Submit or Retry. The user can still look; Cancel step, answering Claude's questions and Exit stay (freezing comes with slice 3). This departs slightly from RV-3's "at any time". *Alternative:* D2-3, decisions during a step carried out after it, with pending writes, deferred decisions and checks on the step's start records.
63. **D2-63** AUTOPILOT DECISION (AP-24, 2026-11-19): a queue of Claude steps runs to its end before the stage opens. Formalize proves its targets in sequential steps, sources first, each with its own question and permitted set (B.1); a mid-stage Formalize is a new queue whose items join the stage when it ends; Submit review runs one queue, one step per affected inference. Cancel step cancels the running step and drops the rest of the queue, listed as "not run", with Retry step. Until the queue ends, the records and the view stay as they were when it started, and reconcile runs once, at its end. *Alternative:* each step's items join the stage as soon as the step ends.
64. **D2-64** AUTOPILOT DECISION (AP-24, 2026-11-19): while the results are hidden, a Result shows no status at all, and decisions on listed items cascade into Results by their real dependencies, silently; the change shows with the results. Before an action takes an Accept away, the confirmation always comes, with "The results are hidden now: a result you accepted that rests on these loses its Accept too. You will see it when the results are shown.", naming no Result. Submit review needs the results shown, so it always reads real statuses. *Alternative:* D2-49's shown status and outcome-independent cascade set.
65. **D2-65** AUTOPILOT DECISION (AP-24, 2026-11-19): a mid-stage Formalize, a re-ask included, waits for the results to be shown: "The results are not shown yet: decide the statements, or show the results, first." So no start check, step mode or question can depend on a hidden outcome. This narrows RV-9's "at any point". *Alternative:* refuse only the requests that touch a hidden Result (a target with a hidden Result as a source or as a re-ask, or a card a hidden step could have used through Claude's arrow), as the earlier check 2 did.
66. **D2-66** AUTOPILOT DECISION (AP-24, resolving the second recheck's F4): `rejected-repeat` judges only content a step created or changed since its start, and every stack action records all its effects (rejected keys and versions, declined arrows, question changes, a force it ended), so Undo, Redo and un-reject restore them. Content the user brings back is never refused afterwards. *Alternative:* keep `rejected-repeat` for every purpose, and have Undo and un-reject clear the keys and arrows they bring back.
67. **D2-67** AUTOPILOT DECISION (AP-24, resolving the second recheck's F14): Apply records its history entry with M2's kind `accept-proposal`, labelled "Apply: Formalize for dependencies → ‹targets›", so no history kind is added and no exhaustive label map changes. *Alternative:* a new kind `apply-session`, with its entries in runner `workspace/history.ts` and webview `labels.ts`.
68. **D2-68** AUTOPILOT DECISION (AP-24, resolving the second recheck's F19; extended after AP-24's recheck, AF5): a session's RunView leaves `frozen` out, and `step.statementsFixed` tells the panel what it needs. M2's field stays as it is. Its `inferences`, `target` and `premises` follow the InferenceView's question rule, so a re-ask's outcome never shows there while the results are hidden. *Alternative:* make `frozen.permitted` optional, and update the three tests that read it. For the questions: leave `inferences` out of a session's RunView; `target` and `premises` are required fields, so they would still need the rule.
69. **D2-69** AUTOPILOT DECISION (AP-24, resolving the second recheck's F16): two residual channels are accepted and listed rather than closed. Claude, in one conversation, knows the earlier outcomes, so the visible content of a later step of the same queue may differ with them; and hidden declarations occupy Lean names, so a later visible declaration may need another name in one outcome. *Alternative:* put proof-phase declarations under the target's statement namespace, enforced as a new token, and make adoption's name scan ignore hidden declarations.
70. **D2-70** AUTOPILOT DECISION (2026-11-19, the recheck after AP-24, AF1): reconcile keeps a record declined by Reject or a plain decline, or to be redone with its content taken out, as it is when its draft is B's version: a Result whose step ended, with T.holds as in B and no proof material (`asInBase`). Only a draft that differs from B's version is a new proposal, which comes back in review, "updated" (DO-1's reworded repeat). Taking a written premise out sets its record's key back to the draft's in the same write. The rule that returns a Shaky or to-be-redone item to review once its Submit step ended reads only the queue that just ended. So a Reject stays a Reject and can still be un-rejected, and a Result taken out to be redone stays so until its Submit step reworks it. *Alternative:* give a Result no draft while it is as in B, which would undo F9's stable key for a Result that was not proved; or update the record's key at every revert, which loses the rejected version's key that un-reject and DO-1 need.
71. **D2-71** AUTOPILOT DECISION (2026-11-19, the recheck after AP-24, AF2): the writes an accepted Add premise needs follow from the records. With no ledger entry it needs its premise write; written, for a target that is not proved, it needs its completion. The action that makes one due enqueues it (the completion right after its premise write), and `recover()` enqueues every one still due, so a crash between the Accept, the write and the completion loses nothing; each write checks at its start that it is still due. The final check and the backstop (`not-written`) refuse an accepted premise that is not written. Every action that gives a written premise a status whose content is outside the working copy (a Reject, a cascade, back to review, the Undo of its Accept, reconcile's return to review) takes it out in its own write: the card, arrow, mark removal and completion go, their ledger entries are dropped (recorded on the stack, so Undo puts them back), and the key is the draft's again. So a premise in review is always outside the working copy, but for an adopted ghost of a converted v1 run (D2-16). *Alternative:* one write from the Accept to the completion, whose in-flight record lasts until the completion; the Accept would then wait for two Lean jobs, and every message behind it at the host too (D2-74). Or keep a written premise written while it is in review, and change the working-copy invariant and B.3 to match.
72. **D2-72** AUTOPILOT DECISION (2026-11-19, the recheck after AP-24, AF9): the stage judgement is not persisted. After a reload, `recover()` computes it again with `judgeState`, which is pure, from the judged commit's files and `judged-facts.json`, and in a stage applies it as a judge would; only when those facts do not belong to the judged commit, or the head has moved past it, does the judge build again. *Alternative:* persist the StateJudgement in the run directory, written before run.json names it.
73. **D2-73** AUTOPILOT DECISION (2026-11-19, the recheck after AP-24, AF13): Undo and Redo follow the rules of the same action done by hand (UN-4). Undo restores what its action recorded once the reducer has checked the restored statuses against the current state; Redo sends the recorded request again through the reducer, never a recorded state. Either is refused with the rule's text when a judge has changed a class, a dependency or the reveal since, and an item whose rev changed gives `conflict`. Any new action, a seal included, clears Redo. *Alternative:* re-apply recorded states verbatim, and let the backstop catch at Apply what the rules would have refused.
74. **D2-74** AUTOPILOT DECISION (2026-11-19, the recheck after AP-24, AF14): `formalize`, `submit` and `retry` resolve once their queue's first step is working, as `start` does, and `decide`, `reveal`, Undo, Redo and moves once their own write is recorded, never after a judge, a premise write or a completion they start. `endSession` with exit is not queued by the host, as `cancelRun` is not. So an answer to Claude's question never waits behind the call that started the queue, and Exit can always stop a step. *Alternative:* resolve every call at once and report its end in a separate message.
75. **D2-75** AUTOPILOT DECISION (2026-11-20, AP-30; the slice-3 ultra review's S3-1, confirmed by its refuter, moved here from the slice-3 plan's D3-52): the probe that gives `valueConsts` and `typeConsts` runs as its own Lean job (2b3a), from a file that imports only Lean's `Lean.CoreM` and `Lean.Util.FoldConsts` and loads the model's built modules with `Lean.importModules` when it runs. Its code is elaborated without the model, so no instance of the model on Lean's own types can forge the constants that B.2 and the bands, RV-5, RV-7, content keys, D2-41's step limits and the backstop read: not a high-priority `ToString String` that rewrites the printed line, nor a `ForIn m Lean.Loop Unit` that ends the walk at once, both of which G0 allows. That rests on two more things (AP30-1): the probe file calls `Lean.importModules mods {} (loadExts := false) (level := .private)` (4.35's defaults, written out so a toolchain bump cannot change them), so no environment extension and no `[init]` runs in it, and module-system files load whole; and G0 refuses both `initialize` and the `init` attribute (2b2), and runs before any Lean job at every purpose, the engine syncing and building nothing when it finds anything (2b3b; AP30-1 r2), so no earlier Lean job (a downstream module's build, the check job, a scratch file: each runs the `[init]` code of what it imports, with `<shadow>/.lake` writable) runs Claude's IO, which could rewrite the `.lake` artefacts the probe loads or inject Lean messages. This holds for a model whose files import only its own modules (Init is always there; AP30-7): a person's file that imports one of Lean's modules gives Claude's modules Lean's elaborator attributes (`command_elab`, `term_elab`, `tactic`, `delab`) and the `register_*` commands, which run code in later Lean jobs and which G0 does not refuse. This is logged, not closed: the person's model imports nothing but its own modules today, and telelean writes no other import. To close it, `checkBase` (2b3a) would refuse, before anything is sent to Claude, a B whose files import a module outside the project, with the notice "your files import ‹module›: telelean checks Claude's work only on models that import nothing but their own modules". The check file keeps only `#check`, `#print`, `#print axioms` and `type_of%`, and refresh's second run without the probe goes (AP-21): no model name can clash with the probe's imports any more, so such a model keeps its constants, and its bands their ✓. A judged state whose probe failed is refused, naming the cause; B's facts and facts from before 2b3a are compared approximately (§2.1); and a start whose B's probe fails is refused before anything is sent to Claude, since every state of its session would fail the same way (AP30-2). The probe's output is one Lean message under runLean's 32 MB cap, so a model whose message passes it cannot be checked at all: a limit on model size, never a pass, which 2b3a measures (the model size at which the message reaches the cap) and reports; lifting it means writing the lines to a file the runner reads with a larger bound (AP30-2). The ghost check keeps its in-file probe, since its theorem is in no built module; its constants decide only a draft's gap check and its facts before it is written, and everything they decide is judged again with the isolated probe (the residual, §2.1). The cost is one more Lean process per refresh, measured in 2b3a and accepted (AP-33): on the Spyro fixture (median of three) the refresh's peak RSS rises from 567 to 954 MB (1.68×) and its time from 0.97 to 1.48 s (1.53×), since the probe job reads Init's `.olean` parts a second time into anonymous memory (about 390 MB; runLean's cgroup peak of the probe job 469 MiB); *alternative if memory becomes a problem:* read only the model's own modules with `Lean.readModuleData` (560 MB / 0.27 s, which must then also load a module-system file's `.olean.private` part, or refuse such a model). A probe job that runs out of memory is telelean's `environment` outcome, never a budget finding (fixer 2b3a r1, AP-33). The size limit (AP30-2), measured: the probe's message is about 52 bytes per declaration on Spyro (66 estimated on extras) and about 25 bytes per listed constant, so runLean's 32 MB cap is reached near 500,000 to 650,000 such declarations, but near 13,000 declarations that list about 100 constants each. If `importModules` cannot load the model on the pinned toolchain, the integrator takes the constants from the kernel export instead (`lake env leanexport`, which G4 already runs, read by a parser in the runner), or the alternative. *Alternative:* keep the in-file probe and accept the residual. The refuter rated it major, not a blocker: it needs sabotage aimed at telelean's own probe, which Claude cannot see, and the instances still reach the person as items; but Apply's own checks read the same forged line. Refusing instances on Lean's own types instead is evaded by an `abbrev` of a Lean type. *To reverse:* before 2b3a is built, give 2b3 back its single probe bullet (§1.1). Afterwards, put the value probe's `#eval`, with the type walk, back at the end of the check file with its imports, restore refresh's second run without it, and delete `semantic/probeFile.ts`. After the slice-3 plan's 3p, the meaning walk moves with the value probe and is forgeable again: reverse D3-52 too, or keep the probe job for it (AP30-6). G0's `init` rule stays either way: it also keeps Claude's IO out of the builds and the check job. The `probe` marker and §2.1's refusals may stay, set from the in-file probe's outcome (a model whose names clash with the probe's imports then fails every check), or go, so that a failed probe is compared approximately again (S3-2's gap).

### 7.3 Carried in from slice 1 (for the integrator)
- **Leaks the designs found in slice 1's code.** The review-UI and checks designs found that the 1d Proposed view shows the outcome before the reveal:
  1. downstream cards get the "changed" badge and the "result after the review" chip only when the target was proved, and the banner's changed count rises;
  2. the hidden target's expanded card shows `lean.code`, which includes the new proof;
  3. new proof-only lemmas show in the Vocabulary band ("+N new") and in Used by;
  4. Raw Lean diff… opens without counting as Show result.

  The session-engine design found a fifth, since M2:

  5. attempts.jsonl gets the round's verdict at round end, and the Current board's card details list it.

  Slice 2 removes all five (§4.7, §5.10, D2-11).
- **For the slice-1 `dist` build** (AP-8), the integrator decides whether 1g first fixes leaks 1–4 in the webview. The review-UI design proposes a small fix:
  - the hidden set = the target plus the cards downstream of it in the current graph, shown with base statuses;
  - DiffBadge and the counts ignore the proof and status fields of hidden cards;
  - CardDetails shows the current `.holds` text for a hidden target;
  - the proposal's lemmas stay out of "+N new" until revealed;
  - Raw Lean diff asks first, then reveals.

  Recommended: it is webview-only and small.
- **Recorded facts:** regeneration is still pending from 1d, and is done together with `typeConsts`, with the isolated probe, at the end of 2b3a (§2.1, D2-75).
- **FakeBackend fixtures:** their first line `Run: "These suffice"` stays. Renaming it goes with those fixtures (the integrator's call, outside slice 2).

### 7.4 Patches and logs
- After each sub-slice, the integrator saves `verbatim_prompt_log/bundle_21/evidence/patches/after_slice_2x.patch`: every file changed or created since the baseline, excluding `package-lock.json`.
- The builder's report goes in `bundle_21/subagent_reports/`.
- At the slice end:
  - the integrator logs §7.2's decisions in `02_autopilot_decisions.md` (one AP entry, listing D2-1–D2-75, the ones withdrawn by AP-24 marked as such, and how to reverse each). The entry also warns that reversing slice 2 (`git apply -R` of its patches) leaves any open session unrecoverable, since the older build reads only version-1 run.json: Exit open sessions first. It also says, in plain words, that the Lean check's probe now runs as its own job (D2-75), so AP-21's "the check runs again without the probe" is gone, and a model whose names clash with the probe's imports now keeps its constants; that a model whose probe fails (too large, or an error of the walk on its own files) can no longer start a Formalize, with the cause named before anything is sent to Claude; and that Claude may no longer write the `init` attribute, which ran Claude's code in every Lean job that imported it (AP30-1, AP30-2). It adds that this protection assumes the model's files import nothing but their own modules: if the person's files ever import Lean's own modules (`import Lean`), Claude's files get other ways to run code in those jobs, which telelean does not refuse (AP30-7);
  - then a "slice 2 done" entry.


## 8. Change log (extract: the 6 of 33 entries that mention 2g)

- 2026-11-19 (plan fixer, critic's round 1). Source: `bundle_21/subagent_reports/slice2_design_workflow/agents/critique_plan.json`, with 1 blocker, 14 major, 17 minor and 2 nit findings. Every finding was fixed; the new and revised decisions are D2-3, D2-7, D2-28, D2-32, D2-42, D2-43 and D2-46–D2-56.
  - **Blocker:**
    - **S1** (an Add premise accepted during a step was undone by the step's rollback): during a step, every decision that changes ws/ waits in `pending`, any Add premise decision included, and is carried out after the rollback. A premise's write and completion run then, with the marker `after-step`. §3.1, §3.6, §3.8, §5.13, D2-3; tests in 2a and 2f.
      - Unlike the critic's text, Shaky takes effect at once: under D2-48 it changes no file.
      - Also added: a step's own checks use the records of its S₀, and Undo of a deferred decision drops its pending write.
  - **Major:**
    - **S2** (queued steps did not seal): a seal `by: 'step'` at every queued step after the first. §2.2, §2.3, §3.3, §4.6, §5.13, D2-47; tests in 2a, 2d and 2e.
    - **S3** (a hidden Result's status leaked its outcome): a hidden Result follows its cascade set cas(R), and the judge's changes to it are recorded but not shown. Its view has rev 0 and only the seen-early marker; it never appears in lists and never blocks Submit. §2.3, §3.5, §3.7, §4.7, D2-49; non-interference over decision sequences in 2c and 2e.
      - This differs from the critic's fix in one point. Cascades run over the narrower cas(R), not over the waiting list pre(R), which S4 widened. Otherwise one decline of an earlier step's statement item would take out every later hidden proof. The critic's version is D2-49's alternative.
      - "Never blocks Submit" is added: without it, a hidden Result waiting for an item to be redone would block Submit, which only Show result could release.
    - **S4** (pre(R) missed what Claude's arrows and lemmas reach): pre(R) is now an outcome-independent superset. §4.7, D2-7; test in 2a.
    - **S5** (D2-42 and proof-phase vocabulary changed visible items before the reveal):
      - drafts count in R_stmt for classes only once revealed;
      - proof-phase declarations, vocabulary included, are proof material;
      - a definition that only drafts reach is part of their Result.

      §4.1, §4.2, D2-42, D2-43; twins in 2c.
    - **S6** (one target's proof could use another target's lemma):
      - proof material stays with its Result (`other-result`);
      - Claude's arrows never come from another target (`other-target`);
      - two mid-stage start checks.

      §2.7, §2.8, §4.8, §4.9, §4.12, D2-50; cheats in §6.2, tests in 2b1 and 2b2. Beyond the critic's fix, which allowed E(T)'s sources: ES-2 forbids a target to use another target through an unselected arrow, and pre(R)'s Results bullet needs this.
    - **S7** (a cancelled re-ask could revert an accepted Result): a re-asked target keeps its old question and Result until a proof. §3.2, §3.4, D2-46; test in 2d.
    - **S8** (no write order between commits and run.json): `head`, `inFlight`, the four-write order and recovery. §2.6, §3.11, D2-51; crash tests in 2d and 2e.
    - **I1** (commands outside declarations belonged to no item):
      - `stray-command`;
      - text outside declarations is unowned;
      - reverts remove the namespace lines.

      §2.7, §2.8, §4.2, §4.9, §4.10, §4.11, D2-52; cheats in §6.2.
    - **I2** (undefined shared types): a new §2.9 defines them:
      - core: InferenceJudgement, StateJudgement, ItemDraft, PendingWrite, ReviewState, ReviewAction, ReviewOutcome, ResultMask, SessionRecords, SessionViewInput, and the backstop's types;
      - runner: SessionCheckContext, `judge`, `finalCheck`, `complete`, and SessionWrite.

      JudgeInput gains `commit`, `filesKey`, `premises` and `revealed`.
    - **I3** (ItemView declared `decline` twice): the current decline is renamed `declined`; 2g's fixtures follow.
    - **I4** (2b was too big, and 2c ran beside it in core): 2b is split into three. The new sub-slices are below.
      - 2b1 judges, with the refactor-first rule.
      - 2b2 holds the backstop, revert with `replace-decl`, the start checks, and `holdAs`, which moved from 2f.
      - 2b3 holds the probe and the runner engine.

      2a writes `review/index.ts` with stubs, and §0 gets a rule: one builder at a time in core. 2c now runs after 2b2, and 2g beside 2b3 and 2d–2f. §0, §1, §1.1, §6.1.
    - **C1** (premise drafts were never checked again): after every judged state; drafts are reconciled by key and withdrawn when superseded. §3.5, §3.8; test in 2f.
    - **C2** (the Shaky rule contradicted B.1): Shaky Results, and to-be-redone ones not reverted, still count in B.1, and the judge never reverts them. This is the critic's first option; the second is D2-48's alternative. §3.6, §4.8, D2-48, D2-28.
    - **I5** (`applyChanges` refused the sidecars): `applyChanges` accepts `layout.json` and `endorsements.json`; `isSubjectSidecarFile` adds `endorsements.json`; 2f lists the workspace files. §1.1, §2.6, §3.10; test in 2f.
  - **Minor:**
    - **S9**: Cancel step on an interrupted step. §2.5, §3.4, §3.11, §3.13, §5.8, §5.13, D2-55.
    - **S10**: an explicit `own` flag. §2.2, §2.4, §2.5, §4.6, §5.5–5.7, D2-32; tests in 2a and 2g.
    - **C3**: the backstop derives ownership from B, F and the ledger; accepted Results keep their verdict and Rests on. §2.2, §3.10, §4.10.
    - **C4**: statement abbrevs are excepted from b4 and from own-accept. §4.4, §4.10.
    - **C5**: Submit seals only when it queues steps, and Back to review restores the stack. §3.7, §3.10, §4.6, D2-54.
    - **C6**: a `retry` list. §2.6, §3.2, §3.3, §3.4, §3.7.
    - **C7**: decisions reach Claude in the next step's first turn, and a step is judged with its S₀ records. §2.8, §3.3, §3.6, §2.7 (`JudgeInput.items`).
    - **C8**: the Reject cascade includes Shaky dependents, and the confirmation is worded per action. §3.6, §4.6, §5.12, D2-28.
    - **I6**: tests that move are marked `it.skip` and listed. §0, §1.1, §6.1.
    - **I7**: when `session` is posted; renderings cached by content key. §2.4, §2.6, §3.12.
    - **I8**: `isPersistedRun` accepts version 2, and the AP entry warns about reversing. §1.1, §2.6, §6.1, §7.4.
    - **C9**: a mid-stage Formalize of a target with a Shaky item is refused. §3.2, §4.12, D2-53.
    - **C10**: `PersistedStep.reveal`, which reconcile copies to the Result. §2.6, §3.5.
    - **C11**: a failed completion is taken back out. §3.8, D2-56.
    - **C12**: start check 5, for Shaky and to-be-redone sources. §4.12, D2-53. It is narrower than the critic's "neither accepted nor in review": a rejected Result puts B's `.holds` back, which contributes as it did in B (§4.8), and check 4 already covers a source left with no `.holds`.
    - **C13**: 2c lists the host files, and 2d's mid-stage `formalize` bypasses `busyRefusal`. §1.1; tests in 2c and 2d.
    - **I9**: the v1 conversion writes the ledger, checks the ghosts again and judges afresh. §3.11.
  - **Nit:**
    - **N1**: `status-mismatch` `removed` is not new; the working-copy invariant excepts drafts. §2.7, §3.1.
    - **N2**: `option` is required with `declined`; `sessionDiff` returns `kind: 'diff'`; Submit refuses a partly accepted cycle. §2.4, §2.5, §3.7.
  - **Also changed, for consistency with the fixes:**
    - RV-3 for new items that depend on Shaky or to-be-redone ones (§3.5);
    - a decision whose cascade would reach the running step's inference is refused (§3.6);
    - the forced reveal ends when a step for T ends, or when a Result in pre(R) is hidden again (§4.7);
    - two new lines in the system prompt (§2.8).
  - **New sub-slice list:**
    - 2a: contracts (§2.9 with stubs) and the item model;
    - 2b1: judging (core);
    - 2b2: backstop, revert, start checks, `holdAs` (core);
    - 2c: mask, session view, protocol;
    - 2b3: probe and runner engine;
    - 2d: sessions and steps;
    - 2e: review actions;
    - 2f: Add premise and the end;
    - 2g: review panel and session bar;
    - 2h: Proposed view in a session, Formalize, Undo, retirement.
- 2026-11-19 (plan fixer, critic's round 2). Source: the critic's round-2 findings, relayed by the workflow: 9 major, 12 minor and 1 nit, no blocker. Every finding was fixed; none was judged wrong. Where the critic offered a choice, the choice is noted. New decisions: D2-57–D2-60; revised: D2-4, D2-42, D2-46, D2-49, D2-50, D2-51, D2-52; D2-6 refined (the mask's start); D2-2, D2-10 and D2-20 now point to D2-57, D2-58 and D2-59.
  - **Major:**
    - **S1-reask-outcome-shown** (a re-ask's end showed whether it proved T): a re-ask step that passes, gives up or runs statements only keeps its statement-phase content in every case; without a proof only T.holds, its proof material, arrows and drafts go back to S₀. The inference gets `asked` until the reveal: the view shows the question asked, pre and cas use both questions' sources, pre's reference step is the latest ended step for T, and the Result shows its `shown` status. The old version and status stay on the record, shown with the report line only at the reveal. Cancel and failure still go back to S₀ at once. §2.2 (`SessionInference.asked`), §2.3, §2.6 (`PersistedStep.startHolds`), §3.2, §3.3, §3.4, §3.5, §4.7, D2-46; twins in 2c and 2e, the 2d re-ask test rewritten.
      - Also, to keep the fix closed: a re-asked target whose Result is hidden is refused (check 2, §4.12); while `asked` is set, a later step for T asks the question asked; and §4.9's `other-result` now also keeps statement-phase content from mentioning a target's `.holds`, so no visible item depends on a Result and a hidden Result's recorded changes reach only hidden items (§4.7, D2-50).
      - Found while fixing S1, and fixed with it: the mask's start (`startHolds`) moved at every step's end, so a Result that stayed hidden through a Submit step for its own target showed its first version's outcome through the mask. It now moves only when T's Result was shown since the step that set it (`shownSinceStart`). §2.2, §3.3, §4.7; twin in 2c.
    - **S2-a12-skip-shows-source-outcome** (A12's skip showed L's outcome): the critic's main fix. The step runs in statements-only mode (`StepScope.statementsOnly`): its turn names L; Claude formalises, freezes and finishes not proved naming L; `openProof` and `openArrows` are false, and propose_arrow and propose_assumption are refused with a text. The step is never put in `retry`, because its mode depends on L's outcome. The `skipped` state is gone. §2.6, §2.7, §2.8, §2.9, §3.3, §3.4, §3.13, §4.7 (residuals), D2-4; chain twins in 2c and 2e, the 2d A12 test rewritten.
    - **S3-mask-keeps-messages-and-positions:** `maskFacts` drops every Lean message located in a hidden declaration, and every message with no position; a hidden `.holds` takes its start messages. `buildSessionView` strips `loc`, `lean.codeLoc`, vocabulary `loc` and diagnostic `range`, leaves out `semantic.durationMs`, and recounts `semantic.errorCount` (beyond the finding: the header shows the error count, and the build's duration would differ in the JSON the twins compare). "Open in editor" in the Proposed view uses the Current graph's place. §4.7, §5.10; mask tests and twin variants (proof lengths, a proof before other cards, a linter warning) in 2c.
    - **S4-hold-as-not-persisted:** `ItemRecord.accepted` gains `holdAs` and `rationale`; StatusSnapshot carries them through Undo and Redo; PendingWrite and SessionWrite `premise` read them from the record; `heldAs` shows from the Accept on. §2.2, §2.3, §2.9, §3.6, §3.8; tests in 2a2 and 2f (a pending Accept during a step, with a crash before the write).
    - **S5-session-writes-not-serialised:** one write queue per session for every write, the judge's reverts included (planned in the queue against the current head, dropped and re-judged when the head moved); records-only actions take the queue briefly; steps 1 and 4 use a new `RunFiles.writeStateChecked`, and a failed step 1 aborts the write. §1.1 (2d), §2.6, §2.9 (`judge-revert` carries the judged commit), §3.6, D2-51; tests in 2d and 2e.
    - **S6-claude-arrow-source-becomes-target:** check 3's exception records the arrow's source in the target's `selectedArrows`, which counts as a question source for pre and cas from the request on, while B.1 and B.2 keep the old question. B.3 no longer re-checks an earlier step's arrow for `other-target`, which the exception would otherwise break on every later state. §2.2, §3.2, §4.7, §4.8, §4.9, §4.12, D2-50; tests in 2a2, 2b2 and 2e.
    - **I1-shaky-rework-across-inferences:** the critic's main fix. Before a Submit queue, `planSubmit` (core, 2b2) takes out every kept Shaky or to-be-redone item that depends on an item another step opens (a hidden Result through its cascade set), in one `submit-take-out` write; it becomes to be redone, reverted, a Shaky one keeping its note and DO-3 set. The step that opens what others depend on runs first. §1, §1.1, §2.9 (`SubmitPlan`), §3.3, §3.7, D2-57; tests in 2b2 and 2e.
    - **I2-premise-key-changes-on-write:** a draft's content key is defined (sentence, collapsed Lean statement, target), and DO-1 uses it for rejected premises. The premise write's step 4 records the written item's key as the record's and the accepted one, keeping the draft's in `versions`. The key stays the draft's through the ledger, whatever Lean name adoption chose. §3.5, §3.8, §4.3, §2.9; tests in 2a1, 2a2 and 2f.
    - **I3-open-in-not-declaration-text:** the critic's option (a), the smaller change: `open … in` before a declaration is a stray command; the system prompt and the message say to write fully qualified names. No parser change. §2.8, §4.2, §4.9, D2-52; tests in 2a1 and 2b1, including what Claude is told to write.
  - **Minor:**
    - **S7-step-start-records-not-persisted:** `PersistedStep.startRecords` and `startHolds`; Resume and `recover()` build SessionCheckContext from them. §2.6, §2.9, §3.3, §3.6, §3.11; the 2d reload test gains a Reject made during the step.
    - **S8-hidden-result-shown-state:** `ItemRecord.shown`, kept by the reducer and shown while hidden; Submit's plan and counts use visible items plus hidden Results by `shown`; RV-5's confirmation lists a hidden accepted Result by its label alone. §2.2, §2.3, §3.7, §4.7, D2-49; tests in 2a2, 2b2 and 2c.
    - **S9-statement-phase-decl-hidden-with-draft:** `partOfResult` and §4.7 cover proof-phase declarations only. §2.9, §4.2, §4.7, D2-42; twin in 2c.
    - **S10-host-sends-hidden-data:** in a session `RunView.frozen` holds only `round` and `at` (`permitted` optional, 2a1); the host answers `openSessionDiff` with `needs-confirmation` unless `reveal` names every hidden Result. §1.1, §2.3, §2.4, §2.5, §3.12; tests in 2d and 2e.
    - **S11-force-survives-new-hidden-source:** a force also ends when a hidden Result joins pre(R). §4.7; test in 2a2.
    - **S12-declined-arrow-left-in-question:** a question's sources count only while their arrow exists, at Apply too; declining Claude's arrow that a question selected takes its source out of the question, and the Result becomes to be redone. `ReviewState.questionArrows` lets the reducer do it. §2.9, §4.6, §4.8, §4.9, §4.10, D2-59; tests in 2a2, 2b1 and 2e.
    - **S13-claude-words-cross-steps:** the critic's first option, the mechanical one: a step's words wait for the Results of that step and every earlier step. §2.3, §2.9, §3.12, §4.7, §5.3, §5.4, D2-58 (D2-10 extended); tests in 2a2, 2c and 2e.
    - **C1-ledger-after-rollback:** one rule for every rollback, and B.3 compares with the ledger arrows whose item is not declined. §3.4, §4.9; tests in 2b1 and 2d.
    - **C2-reexport-source:** the re-export is built from the step's freeze commit, changing only `permittedAxioms`. §3.3; test in 2b3.
    - **I4-reducer-contract-gaps:** `ReviewState.waiting` (pre and cas), `SessionAction.id` with `nextAction` (used by Undo, Redo and PendingWrite), and the table row for "to be redone → in review" (refused when reverted). Un-reject now says what happens to the dependents its commit took out. §2.2, §2.3, §2.4, §2.6, §2.9, §3.6, §4.6, §5.12, D2-60; tests in 2a2.
    - **I5-endorsements-read-and-hash:** 2c exports `endorsementHash`; 2f's ModelWorkspace reads `endorsements.json`. §1.1, §2.6; tests in 2c and 2f, Undo of an Apply included.
    - **I6-2a-size:** 2a is split into 2a1 and 2a2, one after the other. Unlike the critic's grouping, the reconcile rules go to 2a2, since they read classes, dependencies and cascade sets. 2a2 also gets a fallback split point. §0, §1, §1.1, §2, §4, §6.1, §7.1, §9.
  - **Nit:**
    - **N1-check-context-for-session-judges:** for `judge` and `finalCheck`, CheckContext's selection, stage and round are the active step's (or the first inference's), and judgeState ignores them; `validateContext` is unchanged. §2.9; test in 2b3.
  - **New sub-slice list:**
    - 2a1: contracts (§2.9 with stubs), texts, closures, ownership and content keys (core);
    - 2a2: classes, dependencies, reveal rules, reconcile and the reducer (core);
    - 2b1: judging (core);
    - 2b2: backstop, revert, start checks, Submit's plan, `holdAs` (core);
    - 2c: mask, session view, protocol, `endorsementHash` (core and host);
    - 2b3: probe and runner engine;
    - 2d: sessions and steps, with the write queue, statements-only steps and re-asks;
    - 2e: review actions;
    - 2f: Add premise and the end;
    - 2g: review panel and session bar;
    - 2h: Proposed view in a session, Formalize, Undo, retirement.
- 2026-11-19 (integrator on autopilot, AP-24: slice 2 simplified). Two fix rounds kept finding new major problems in the most intricate mechanisms, so the integrator simplified slice 2 and removed the machinery the simplification makes unnecessary. New decisions: D2-61–D2-69. Withdrawn: D2-3, D2-6, D2-7, D2-9, D2-45, D2-47, D2-49, D2-58. Revised: D2-4, D2-5, D2-8, D2-10, D2-42, D2-43, D2-44, D2-46, D2-50, D2-51, D2-52, D2-55, D2-56, D2-59.
  - **The simplifications:**
    - **One reveal per stage** (D2-61, D2-64, D2-65). All Results are neutral while any statement or belief item (not part of a Result) is in review, or until Show results, which shows them all, noted as seen early. They are hidden again when such an item enters review. Meanwhile the Proposed view shows every proof-derived datum as in the session's base, with statements and vocabulary from the working copy. This hides at least what RV-6 requires. A hidden Result shows no status, decisions reach it through its real dependencies, and a mid-stage Formalize waits for the results.
    - **No decisions while a step runs** (D2-62). The list is read-only while any step of the session runs, a queue included: no status change, Show results, Undo, Redo or move. Looking, Cancel step, answering Claude and Exit stay. This departs slightly from RV-3's "at any time".
    - **A queue runs to its end before the stage opens** (D2-63). The start's targets, a mid-stage Formalize, Submit review and Retry step each run one queue, one step per target or affected inference, sources first. The stage opens when the last step ends, or when Cancel step or a failure drops the rest ("not run", with Retry step). The records and the view stay as they were until then, and reconcile runs once, at the end.
    - **Kept,** because they are sound and needed: the items, statuses, RV-5 dependencies, RV-7 classes recomputed on every judged state, the decline options, Apply with the final check and the backstop, Exit, the session stack sealed when every queue starts, crash-safe persistence and the one write queue, arrow items, Add premise items, and the masked view built on the host, now with the simpler rule.
  - **Removed:**
    - the per-Result reveal: the waiting sets pre(R), the cascade sets cas(R), the reference step, `revealClosure`, rule 1 for hidden Results, the per-Result force (`ItemRecord.reveal`) and the shown status (`ItemRecord.shown`);
    - the re-ask's twin questions (`SessionInference.asked`) and `selectedArrows`;
    - the step-start mask: `startHolds`, `shownSinceStart`, the per-step `start-facts.json`, `ResultMask`, `resultMask`, the residual-axioms recomputation, and `SessionViewInput.startFacts`;
    - decisions during a step: `PendingWrite` and `PersistedSession.pending` (an action's ws/ changes, now `ItemWrite`, are carried out at once), the `after-step` marker, `ReviewState.running`, the "Decisions made while you worked" turn, and `PersistedStep.startRecords` (the records cannot change during a queue);
    - the seal at every queued step (`SealBy` `step`) and the seal on answering Claude's question (`answer`: the queue's own seal has the same effect, since nothing is decided during it), and the activity reveal of a running step (`PersistedStep.reveal`, `revealResult`'s `step`);
    - per-step withholding of Claude's words (D2-58), the reveal lists of `revealResult` (`alsoReveal`) and `openSessionDiff` (`reveal`), and `revealed` in JudgeInput and SessionCheckContext;
    - the `completion` step kind (a completion is a write, F15);
    - check 2's three hidden-source refusals (one rule replaces them, D2-65), and the generated twin variants that only the per-Result reveal needed (re-ask questions, `selectedArrows` chains, step-start masks); fixed pairs remain as the non-interference test.
  - **Changed:**
    - §1 and §1.1: 2b1 is split into 2b1a (the refactor) and 2b1b (the new rules), and 2c into 2c1 (the base mask, the build option, the protocol) and 2c2 (the session view); fallback splits for 2a2, 2c2, 2b3, 2d and 2g.
    - §2.2: `SessionAction` records every effect of an action; `ItemRecord.partOf`; `PremiseDraft.facts`; `SessionForce`; `SealBy` without `step` and `answer`.
    - §2.3: `SessionView.results`; a hidden Result's `status` is null; `StepView` gains `not-run` and loses `completion`; `StageReportView.notes`; the RunView's `step.statementsFixed`, and no `frozen` in a session.
    - §2.4 and §2.5: `revealResult { via }`; `openSessionDiff { confirmed }`; every review message refused while a step runs; Cancel step drops the rest of the queue.
    - §2.6: `forced` and `viewVersion`; the `judge-apply` write; no session write while a step runs; Apply's history kind.
    - §2.7 and §2.9: the two class maps; `premiseChecks`; `StepState`; `ItemWrite`; the simpler `ReviewState` and `ReviewOutcome`; `BaseMask`; signatures for `computeItems`, `classify`, `itemDeps`, `resultsState`, `reconcile`, the group planners and the start checks (`FormalizeSession`); `writePremise`.
    - §3: rewritten for queues (§3.1, §3.3–§3.5, §3.13), decisions only in a stage (§3.6), Submit with the results shown (§3.7), premise writes at once (§3.8), reload between steps (§3.11), and the RunView (§3.12).
    - §4.7 is rewritten as the stage reveal and the base mask; §4.1, §4.2, §4.5, §4.6, §4.8, §4.9 and §4.12 follow it.
    - §5: read-only while Claude works; hidden Results as neutral rows; Show results for the whole stage; Formalize disabled while the results are hidden.
    - §6: the tests per new sub-slice; the non-interference test uses fixed pairs; cheats S5, S6, S15 and S17 follow.
  - **The second recheck's findings** (`bundle_21/subagent_reports/slice2_planfix_workflow/agents/recheck_round2.json`, F1–F20: 11 major, 8 minor, 1 nit):
    - **gone with the simplification:** F1 (the reveal rule had no fixpoint: the stage rule reads `classesBeforeReveal` and leaves Results' parts out, so showing the results never changes what they wait for; a 2a2 test keeps it so), F2 (`asked` and its earlier question are gone), F6 (cascades follow the real dependencies, and Submit needs the results shown, so take-out reads real statuses), F20 (no shown status to read);
    - **fixed:**
      - F3: a cancelled or failed step goes to `retry` in either mode, and Retry decides the mode again (§2.6, §3.3, §3.4);
      - F4: every action records all its effects, un-reject clears the key and the arrow, and `rejected-repeat` applies only at step purposes, to content made since S₀ (§2.2, §3.6, §4.6, §4.9, D2-66). Its part (c), the activity reveal, is gone;
      - F5: Shaky and to-be-redone items return to review when their Submit step ended (§3.5);
      - F7: ownership is fixed at creation, and `other-result` covers every proof-phase declaration (§4.2, §4.9, D2-43, D2-50);
      - F8: the judge's whole outcome is one `judge-apply` write, reconciled on the current records (§2.6, §3.5, D2-51);
      - F9: a Result for every inference whose step ended (§4.2);
      - F10: Results and their parts are left out of the Rejected and withdrawn lists while the results are hidden (§2.3, §3.6, §5.4, §5.7);
      - F11: `engine.writePremise`, and a completion that freezes again from the adopt commit (§2.9, §3.8);
      - F12: `PremiseDraft.facts`, the function signatures, `FormalizeSession` (its second point gone with D2-65), and generic group planners (§2.2, §2.9, §4.6, §4.12);
      - F13: enclosing lines owned jointly (§4.2, §4.9, §4.10, §4.11, D2-52);
      - F14: Apply uses M2's `accept-proposal` kind (D2-67);
      - F15: a completion is a write; its Retry is a `submit` step (§2.3, §3.8, D2-56);
      - F16: both channels listed as accepted residuals (§4.7, D2-69);
      - F17: the hidden view drops build times and details, takes `version` from `viewVersion`, and is published only from a converged judgement (§4.7);
      - F18: 2b1 and 2c are split (§1);
      - F19: a session's RunView leaves `frozen` out (D2-68);
    - **still open:** none.
  - **New sub-slice list** (the core ones strictly in this order; 2g beside 2b3 and 2d–2f):
    - 2a1: contracts (§2.9 with stubs), texts, closures, ownership and content keys (core);
    - 2a2: classes, dependencies, the stage reveal rule, reconcile and the reducer (core);
    - 2b1a: the rule helpers taken out of `evaluate()`, behaviour unchanged (core);
    - 2b1b: step limits, B.1–B.4, `judgeState`, the new tokens, `proposeArrowProblems` (core);
    - 2b2: backstop, revert, start checks, Submit's plan, `holdAs` (core);
    - 2c1: base mask, build option, `endorsementHash`, protocol (core);
    - 2c2: `buildSessionView` and the host's `not-yet` (core and host);
    - 2b3: probe and runner engine, `writePremise` included;
    - 2d: sessions, queues and steps, with the write queue, statements-only steps and re-asks;
    - 2e: review actions;
    - 2f: Add premise and the end;
    - 2g: review panel and session bar;
    - 2h: Proposed view in a session, Formalize, Undo, retirement.
- 2026-11-19 (plan fixer, the recheck after AP-24). Source: the recheck's findings, relayed by the workflow: 6 major and 8 minor, no blocker. They are numbered F1–F14 there and cited here as AF1–AF14, since (F1)–(F20) already name the second recheck's. Every finding was fixed; none was judged wrong. The AP-24 simplifications stay as they were: one reveal per stage, nothing decided while a step runs, and every queue runs to its end. New decisions: D2-70–D2-74; revised: D2-16, D2-27, D2-31, D2-51, D2-61, D2-68.
  - **Major:**
    - **AF1** (reconcile read B's version of a rejected or reverted Result as a new proposal, so a Reject was lost, and a Result to be redone became an "updated" one that no Submit step reworked): computeItems marks a Result draft that is B's version `asInBase`, and reconcile keeps a declined or reverted record as it is when its draft is; only a draft that differs is DO-1's reworded repeat. Taking a written premise out sets its key back to the draft's. Beyond the finding: F5's rule (a Shaky or to-be-redone item returns to review once its Submit step ended) now reads only the steps of the queue that just ended (`queueSteps`), since at a later judge it would undo a Reject or a revert the same way. §2.9 (`ItemDraft.asInBase`, `reconcile`'s and `judge-apply`'s `queueSteps`), §3.5, §3.8, §4.2, §4.6, D2-70; tests in 2a1, 2a2 and 2e.
    - **AF2** (an accepted premise's write and completion were lost after a crash, and nothing noticed; back to review and Undo of a written premise were undefined): for (a), the critic's first option: premise writes and completions are due writes, enqueued again by `recover()` and checked again when they start; the final check and a new backstop code `not-written` refuse an accepted premise that is not written. For (c), the critic's first option: every action that gives a written premise a status outside the working copy takes it out in its own write, with its ledger entries recorded on the stack for Undo and its key back to the draft's; un-reject of a premise merges nothing. Beyond the finding, to keep the fix closed: ledger entries name the premise by its key (computeItems has no records to map an id); a take-out is planned when its write starts, so a premise written meanwhile is covered; the completion runs right after its premise write, so it always starts from the `adopt` commit; and reconcile's own return of a written premise to review takes it out too. §2.2 (`LedgerEntry`, `SessionAction.takenOut`), §2.9 (`ItemWrite`, `SessionWrite`, `BackstopRefusal`), §3.1, §3.6, §3.8, §3.10, §3.11, §4.10, §4.11, D2-71; tests in 2a2, 2b2 and 2f.
    - **AF3** (the gates did not wait for a premise write or its completion): `judging` covers every write still in the session's queue, for Submit, Apply, Formalize and Retry, and a queue of Claude steps starts as the write queue's last write (`queue-start`), after which recovery waits as it does between two steps. §2.3, §2.6, §2.9, §3.1–§3.4, §3.6, §3.7, §3.11, §5.13, D2-27, D2-51; tests in 2d, 2e and 2f.
    - **AF4** (a statement to be redone with its content kept did not keep the results hidden): such an item is undecided, and counts in `waitingFor` and for the force like an item in review. Submit's gate names it when it is what keeps the results hidden. No new mechanism. §2.3, §2.9, §3.5, §3.7, §4.6, §4.7, D2-61; tests in 2a2 (each source: a Shaky cascade, RV-3 at a queue's end, un-reject), 2c2 and 2e.
    - **AF5** (RunView's `inferences` and `premises` showed a re-ask's outcome): the critic's first option: they follow the InferenceView's question rule and are filled from the SessionView; the RunView joins the fixed pairs' byte comparisons. §2.3, §3.12, §4.7, D2-68; tests in 2d and 2e.
    - **AF6** (B's facts carried B's positions into the masked build): `maskFacts` is specified field by field: the working copy's DeclFacts and module entries, with only `axioms` and `usesSorry` from B; B's messages moved by the declaration's line offset; an overridden `.holds` placed against B's range. Its signature now takes the two models, since facts hold no texts to compare. §1.1, §2.9, §4.7, D2-61; test in 2c1.
  - **Minor:**
    - **AF7** (one id counter told how many hidden parts exist): item ids are a hash of the run id and the key, so there is no counter (`nextItem` is gone); no event is made about hidden items, so event ids count visible ones only. §2.2, §2.3, §2.6, §2.9, §3.5, D2-31; tests in 2a2 and 2e (a Retry pair).
    - **AF8** (missing signatures): §2.9 gains `permittedFor` (B.1), `proposeArrowProblems`, `planItemRevert` and `buildSessionView`; `reconcile` takes the run id instead of a counter; `classify` takes the inferences and sets `ItemClass.addsNoNewBasis`. §1.1, §2.2, §2.9, §4.4, §4.9, §4.11.
    - **AF9** (contracts that did not type-check): (a) the stage judgement is computed again on load (D2-72, §3.11); (b) a premise write and a completion also replace `judged` (§2.6); (c) `refused` joins `ActionErrorCode` in 2a1; (d) a session's RunView sends `activity` and `notices` as empty arrays; (e) Results are left out of the board's `marks` while hidden; (f) `ReviewOutcome.events`, and reconcile's events, without ids, which the runner gives; (g) drift is persisted as `{ files, at }`; (h) a `premises:` addition's key covers only its own entry (§4.3). Tests in 2a1, 2c2 and 2d.
    - **AF10** (a rolled-back step's premise drafts stayed): every cancelled or failed step drops its drafts in its rollback's write, and premise items exist only for inferences in `ended`. §3.4, §4.2; tests in 2a1 and 2d.
    - **AF11** (closing the window during a write could save records ahead of `head`): the in-memory session changes only at a write's steps 1 and 4. §2.6, D2-51; test in 2d.
    - **AF12** (a converted adopted ghost would be written twice): it converts as a written Add premise in review, accepted only as an axiom with no second write, and its detail says so (`writtenInReview`). The critic's first option, since converting it as accepted would meet RV-5's defensive rule. Beyond the finding: E(T) and B.2 now read T's written premises (the ledger), not its accepted ones, so the converted run's proof that uses the ghost still passes while the ghost is in review, and E(T) always matches what ws/ holds. §2.2, §2.3, §2.9, §3.1, §3.8, §3.11, §4.8, §4.9, §5.6, D2-16; tests in 2d and 2g.
    - **AF13** (Redo re-applied recorded states verbatim): Undo checks the restored statuses against the current state, Redo sends the recorded request again through the reducer, and any new action, a seal included, clears Redo. §2.2 (`SessionAction.request`), §3.6, §4.6, D2-73; tests in 2a2 and 2e.
    - **AF14** (when RunManager calls resolve was not said, so a question asked during a queue could wait forever behind the call that started it): each call's resolution is specified, and `endSession` exit bypasses the host's run queue. §1.1, §2.5, D2-74; tests in 2d and 2f.
  - **Sub-slices:** unchanged, 13. No fix needed a new one, and every core change stays in 2a1–2c2. The core ones run strictly in this order; 2g runs beside 2b3 and 2d–2f:
    - 2a1: contracts (§2.9 with stubs), texts, closures, ownership and content keys (core);
    - 2a2: classes, dependencies, the stage reveal rule, reconcile and the reducer (core);
    - 2b1a: the rule helpers taken out of `evaluate()`, behaviour unchanged (core);
    - 2b1b: step limits, B.1–B.4, `judgeState`, the new tokens, `proposeArrowProblems` (core);
    - 2b2: backstop, revert, start checks, Submit's plan, `holdAs` (core);
    - 2c1: base mask, build option, `endorsementHash`, protocol (core);
    - 2c2: `buildSessionView` and the host's `not-yet` (core and host);
    - 2b3: probe and runner engine, `writePremise` included;
    - 2d: sessions, queues and steps, with the write queue, statements-only steps and re-asks;
    - 2e: review actions;
    - 2f: Add premise and the end;
    - 2g: review panel and session bar;
    - 2h: Proposed view in a session, Formalize, Undo, retirement.
- 2026-11-20 (builder 2c2: the session view, `buildSessionView`, and the host's `not-yet` answers; with the carry-over R2-1 of 2c1's review). Core (`review/view.ts`, `review/reducer.ts`, `review/texts.ts`, `review/types.ts`), the extension's routing test, and this plan (§4.7, §4.9 and the fixer 2c1 r2 entry, for R2-1). `buildSessionView` replaces its stub; `review/index.ts` is unchanged (view.ts's new exports go through its `export *`).
  - **R2-1 of 2c1's review (minor; fixed):** the R1-1 refusal's late freeze holds everything the step wrote but proofs, so a helper definition or vocabulary written for a failed proof attempt is listed as statement content in the not-proved branch only, where a step frozen before its attempt hides it with the Result. §4.7's residuals now list the channel; the fixer 2c1 r2 entry's reason for rejecting (a) is corrected (the chosen fix produces that difference too, in the cases it refuses; what sets (a) apart is its reach); and `CLAUDE_SESSION_TEXTS.otherResultNotFrozen` now ends "Remove what you wrote only for the proof attempt, call freeze_statements, then finish again.", so the late freeze holds statement content only when Claude follows it (§4.9's quote and `judge.test.ts`'s `toContain` follow).
  - **Where things live.** `review/view.ts`: `buildSessionView`, and (additive, exported through the index's `export *`) `itemLabel(item)` (an item's full label), `sessionLabels(view)` (the reducer's `ReviewState.labels`, as builder 2a2 asked: "items by id, as the view labels them, and cards by card id"), `reviewStateOf(records, judgement, labels?)` (the reducer's input as the view reads it, for 2e and the host's early answers). `review/reducer.ts`: `itemGates(state)` (every item's own Accept, decline and back-to-review gates on one Work; `acceptGate` now runs on the same internal `acceptGateIn`, behaviour unchanged). `review/texts.ts`: builder 2c2's wording below.
  - **Contracts (additive; no §2.9 signature changed):**
    - `SessionRecords.steps[].statementsOnly?` (A12's source, from the step's StepScope; read only while the results are shown, for the Result's reason chip "“‹L›” was not proved", which builder 2b1b left to 2c2 "from the records": SessionRecords had no field for it) and `.queue?` (the queue a step runs in, numbered from 1 in the session; StepView's `index` and `of` count within it). **2d sets both** in `toSessionRecords` (the first from `PersistedStep.scope.statementsOnly`, the second at each `queue-start`).
    - `SessionRecords.confirmation.reusedFileChecks?` (EndConfirmationView's `reusedFileChecks`, which the records could not give); **2f sets it** with the final check.
    - `SessionViewInput.endorsements?` and `.lakefile?` (§2.9's note: "2c2 passes the ones the working copy's board was built with", but the input had no field for them); **2d/2f pass** the ModelWorkspace's.
  - **builder 2c2 decided (the board):** the graph has no source position (every node's `loc` and `lean.codeLoc`, every vocabulary item's `loc`, every diagnostic's `range`) and its `version` is `viewVersion`, whether the results are hidden or shown, since its positions are those of the judged commit's files, which the Proposed view never opens (§5.10). While hidden, the semantic summary has no time, duration, detail or stale files, its error count is the masked facts' (build errors plus declarations whose probe failed), and its state reads only the masked facts: `failed` when that count is not zero or the state's probe failed (§4.7's accepted residual), else `fresh`, never the envelope's status, which a hidden lemma's build error would set. Shown, it is the working copy's summary as the runner's `summarize` reads it (time, duration, detail, stale files). *(Alternatives: strip only while hidden; the envelope's status while hidden.)* *Corrected by fixer 2c2 r1 (S-HIDDEN-SUMMARY-ENVELOPE, C-V2C2-C7): "never the envelope's status" holds for its `build-errors` and `check-errors`; the sandbox statuses, which come with no declarations (timeout, oom, cancelled, low-memory, could-not-start, unsupported-*), still map as the runner maps them, which is better than "fresh" for a check that did not run; that they can depend on hidden content is now among §4.7's accepted residuals.*
  - **builder 2c2 decided (labels):** `ItemView.label` is the kind's label only (§2.3). Texts that name an item (the rejected list, the confirmation, the withdrawn list, the reducer's gate texts and stack labels through `sessionLabels`) use `itemLabel`: the kind's label and its card's sentence (cut to 60 characters, quoted), an arrow's two cards, a premise's sentence, or a declaration's Lean name. The view's own labels apply the same rule to the records (one helper), so `sessionLabels(view)` gives exactly the labels the view's texts use, even for a key that does not parse. *(Alternative: card ids, as the reducer's fallbacks.)*
  - **builder 2c2 decided (the list order, §5.5):** the groups in §5.5's order (sources that are no target in board order, Vocabulary, Definitions, the targets in inference order, other cards in board order, cards off the board), within a card its fields item, its Add arrow items, its Add premise items, its Result, within a group the records' order; then a walk from that order puts every item's listed dependencies before it, in their own order, a cycle as the walk meets it. So the "every item's listed dependencies come before it" invariant holds on `SessionView.items` itself (a source's Formalize that uses a new vocabulary term comes after that term, which leaves its group). The sources are those of the questions the view shows (while hidden, the latest ended steps'), so the order never reads a hidden outcome. *(Alternative: the groups only, the invariant left to 2g's `reviewRows`.)*
  - **builder 2c2 decided (gates):** the item gates are the reducer's own rules (`itemGates`): `accept` is the item's own Accept (the detail's, `own: true`), `decline` closes only for what refuses a decline whatever its option (hidden, declined already, withdrawn; Transform's and the plain decline's refusals are the menu's, `options`), `review` closes in review (`inReviewAlready`: nothing to go back to), withdrawn, taken out (D2-60) and for S-F5's mixed un-reject. A phase closes every action first: while a step runs D2-62's text (a mid-stage Formalize: "Claude's step is running: Formalize again when it ends."), in `confirming` "Back to review first.", in `applying` `applyingNow`. Submit: in review (`submitInReview`, the items as `missing`), then hidden (AF4's text, `waitingFor` as `missing`), then judging, then a partly accepted cycle (its items in list order, those not accepted as `missing`); its `next` and `work` (from `planSubmit`) only while the results are shown, in a stage, with a judgement. Formalize: running, the phase, hidden (D2-65), judging. Retry (the heading's): the phase, nothing to retry (`nothingToRetry`), judging. Apply: applying, judging, the check running, failed, drift. Undo and Redo only in a stage (null while a step runs and in a confirmation); `sealed` whenever the top action is a seal. *(Alternatives: `acceptGate` per item, O(n²); judging before the item rules.)*
  - **builder 2c2 decided (what a hidden Result's row holds):** rev 0, status null, classes null, the seen-early marker only, no dependency or dependent, every gate closed with "show them first", the decline options of a Result, its origin, and its detail's question (the target's latest ended step's). A listed item never names a hidden one: its `dependsOn`, `dependents` (accepted listed items only), `redo.because` and an event's items are filtered to listed items (an event left with none is dropped: the runner should make none, defence in depth). *(Alternative: trust the runner's events.)*
  - **builder 2c2 decided (cards):** a CardRef is the board's node, else B's, else (while shown only) the working copy's, else a bare reference (`sentence` its id, `wordedBy: 'agent'`), so a written premise card the mask drops is never named while hidden. *(Alternative: the working copy's always.)*
  - **builder 2c2 decided (the report and the outcomes):** while the results are shown and no step runs (D2-10: "withheld while a step runs and while the results are hidden"): each ended step's `outcome` (`stepPassed`, `stepDidNotFinish`, `stepStatementsOnlyOutcome`), its activity `shown`, its words in the report and in its target's Result detail, the Result's `reasonChip` (only for a not-proved verdict, from the target's latest ended step: gave up `stepDidNotFinish`, statements only `sourceNotProved`; a proved-but-not-established Result's BD-6 reason is its card's own chip on the shown board), and the notes: a re-ask not proved (the latest ended step's question, less the sources D2-59's declines took out, differs from the record's) and D2-59's "left the question" from the done stack's decide actions. The report lists every ended step of the session, and every inference (a verdict only when its Result exists); its `missing` are the judgement's (drawn: "select ‹card› → ‹target› too" with `select`; not drawn: `drawTooHint`), the gap's own hints staying the webview's (`missingArrowHints` on `gap`). *(Alternatives: the report's steps of the current stage only; BD-6's reason in core.)*
  - **builder 2c2 decided (details):** a Result whose content is out of ws/ (declined, taken out) shows the version its record holds: verdict and Rests on from `judged`, its proof from its content, no band, flag or missing arrow (the stage judgement judged B's version). `basisChanged`: the cards downstream of T through the shown board's verified edges whose proof footprint differs from B's. `previous` ("updated"): the newest earlier version, for Formalize, vocabulary terms, declarations and Add premises (a Result's earlier version has no judgement to show). `endorsed`: the accepted `decl:` items but vocabulary changes (EN-3's "each definition and presupposition", instances and coercions being D-4's definitions). `marks`: card and Result items on their card, a written premise on its own card; arrow and unwritten premise items are `arrows` and `premises`. `premises`: every unwritten Add premise but a withdrawn one. A withdrawn item's `at` is the newest event that reported it withdrawn, else ''; a superseded rejected version's `at` is '' (the records keep no time for either). *(Alternatives: the stage judgement for a declined Result; time fields on the records.)*
  - **builder 2c2 decided (problems):** SessionView has no field for the stage's problems (§2.3); they reach the person through the gates (a failed probe's `facts` problem in every Accept's refusal), the events (no longer builds) and the final check's failures (unowned, disappeared, not written), as the plan has it. *(Alternative: a `problems` field.)* *Superseded by fixer 2c2 r1 (S-STAGE-PROBLEMS-NO-PATH): the alternative, `SessionView.problems`.*
  - **builder 2c2 decided (no judgement yet):** at stage 0 (the first queue) every class is unknown (fail closed), there is no plan, and the board is the given working copy unmasked (nothing is waiting, so the results count as shown; the runner passes B). *Changed by fixer 2c2 r1 (C-V2C2-C6, A-V2C2-ADV-4): the board is B whatever is passed (fail closed), and no report target reads revealed.*
  - **The host (§1.1's 2c2 bullet):** builder 2c1 already answers every session message `not-yet` (fixer 2c1 r1's ten case labels); 2c2 adds a test that the answer stays `not-yet` while a run is active (never the ES-9 lock's or busy refusal) and is a warning toast without a request id.
  - **Texts** (`REVIEW_TEXTS`, builder 2c2's wording): `inReviewAlready`, `submitInReview`, `nothingToRetry`, `applyingNow`, `applyWaitsForCheck`, `applyCheckFailed`, `stepPassed`, `stepStatementsOnlyOutcome`, `drawTooHint`, `classIncomplete`; `CLASS_REASON_TEXTS` (one line per RV-7 reason, §4.4).
  - **Seen while testing, not fixed here (2a2's reconcile, outside 2c2's entry; for the orchestrator):** a user's Show results force that is still on when a queue starts (a mid-stage Formalize needs the results shown, and a force shows them) ends at the queue's end only when a meaning item became undecided or a Result changed (§3.5 step 3, reconcile's `endsForce`). So with a meaning item still undecided, a re-ask that proves its target (a new Result version) hides the results, and one that does not leaves them shown: whether the stage is hidden tells the re-ask's outcome before that item is decided. The fixed pairs of §4.7 compare two hidden views and do not see it. The smallest fix: reconcile ends the user's force at every queue's end (then both outcomes are hidden while a meaning item is undecided). *(Builder 2c2 decided: reported, not fixed, since it changes §4.7's force rule and 2a2's reconcile; alternative: list it in §4.7's accepted residuals.)* *Fixed by fixer 2c2 r1 (C-V2C2-C1, A-V2C2-ADV-3, S-F1-confirmed): every queue's end ends every force.*
  - **Tests** (core 76 files, 1115 tests; was 75 and 1072): new `test/review/view.test.ts` (43): the hidden Result's neutral row; Results' parts left out of the list, the counts, the board, the rejected and withdrawn lists, and named by no listed item; the InferenceView's question rule; Claude's words, outcomes, chips and activity withheld; AF4 and Submit's gate; the hidden board (no position, time, duration, detail or stale file; `viewVersion`; the masked error count); the class map in force and `dependents`; card references while hidden; once shown (real statuses, the unmasked board, verdicts, words, the `decided` force); `submit.work` from `planSubmit` and the partly accepted cycle; every gate text (D2-62, D2-65, D2-27, the reducer's, Submit's, Formalize's, Retry's, the confirmation's); the confirmation; the list order and the step numbers; the details of every kind and `previous`; D2-59's notes, `reviewStateOf`, endorsements and the lakefile; what only the results show; `itemGates` against `acceptGate` and `reduceReview`; no judgement yet, a rebuild from persisted records (a reload), events, moves; and the non-interference pairs (a proof or none; a premise draft reaching a proof-phase definition; Claude's arrow; a lemma before the other cards with a linter warning; a re-ask; a chain with a statements-only step; a Retry queue, with the same item ids; sequences of Accept, Reject, Shaky, a group Accept and Undo on listed items, the answers compared too). DO-0 is in no hidden sequence: an arrow item is a Result's part, never listed while the results are hidden. `test/review/judge.test.ts`: R2-1's `toContain` updated. Extension `test/unit/runRouting.test.ts` +1 (205 tests). No test was deleted, skipped or moved; none moves to a later sub-slice.
  - **Mutation checks:** 104 on the final code, each restored byte for byte (`cmp`), every one failing at least one test: 91 on the view, 12 on `itemGates` and `acceptGateIn`, 1 on R2-1's text. On a first run (101, before the labels shared one rule) 6 survived: the board's arrows and premises while hidden for items no Result holds, `dependents` only accepted, no chip on a proved verdict, `heldAs` only once accepted, a declined Result's own version; 4 tests and one assertion were added for them.
  - **Verification:** tsc clean for core and runner (tsconfig.test.json), webview (tsconfig.json, tsconfig.node.json) and extension; vitest core 1115 (76 files), webview 314, extension 205 (`--no-cache`). No runner file changed and no runner source or test uses what changed (`buildSessionView`, `itemGates`, the new `SessionRecords` and `SessionViewInput` fields, `otherResultNotFrozen`), so no runner test file is touched; `test/gate/pure.test.ts` passed as a smoke run (14). No webview file changed, so no scratch build and no Playwright.

- 2026-11-20 (fixer 2c2 r1: the review of 2c2; findings S-F1-confirmed, S-TEST-REASK-PAIR, S-STAGE-PROBLEMS-NO-PATH, S-PERSIST-NEW-RECORD-FIELDS, S-STALEFILES-VACUOUS, S-HIDDEN-SUMMARY-ENVELOPE, C-V2C2-C1–C7, A-V2C2-ADV-1–9; 5 major, 14 minor, 3 nit, every one fixed, none judged wrong). Core (`review/reconcile.ts`, `review/view.ts`, `review/reducer.ts`, `review/texts.ts`, `review/types.ts`), the core tests (`test/review/view.test.ts`, `test/review/reconcile.test.ts`), and this plan (§2.3, §2.6, §2.9, §3.5, §4.7, §5.8, §6.1, and the builder 2c2 entry above).
  - **A force that survived a re-ask queue in one outcome (the builder's F1; C-V2C2-C1, A-V2C2-ADV-3, S-F1-confirmed; major; fixed in 2a2's reconcile).** Show results' force ended at a queue's end only when a meaning item became undecided or a Result changed, so with a meaning item undecided a re-ask that proved its target (new Result content) hid the stage and one that did not left it shown, and marked every Result seen early in that outcome only. **fixer 2c2 r1 decided:** every queue's end (`queueSteps` given) ends every force, the user's and telelean's `decided` one, before RV-7, and ADV-1's `decided` rule then applies as at any judge; §3.5 step 3 and §4.7's force rule say so. Both outcomes are hidden while a meaning item is undecided, and shown when none is; a queue that starts under the force still runs with the stage shown as it was (D2-63). *(Alternatives: only the user's force (A-V2C2-ADV-3's wording), which leaves the same channel through a `decided` force whose returned items are still undecided; list it among §4.7's residuals.)* Tests: a reconcile case (both forces end at a queue's end, a judge a decision started keeps them, nothing waiting stays shown), and view.test.ts's pipeline pair (S-TEST-REASK-PAIR): stage 1 judged and reconciled, Show results and the seal through `reduceReview`, each twin's own working copy judged (the record's question the re-ask's when it proved T, the old one when not) and reconciled with `queueSteps`, byte-identical views, also with a definition the re-ask wrote before its freeze (listed in both). The hand-made pair stays, renamed, for the record-level question rule.
  - **The question while a step runs (A-V2C2-ADV-1, major; fixed).** A proved re-ask puts its question on the record when it ends, mid-queue (D2-46, fixer 2b1b r1), so with the results shown at the queue's start the InferenceView, the Result detail's question and the list order showed the new question during the queue's next step only if the re-ask proved T. **fixer 2c2 r1 decided:** while a step runs, a target whose latest ended step belongs to the running queue (the newest `queue` number; a step without one counts as in it) shows that step's asked question, as while hidden; every other target keeps the record's, which no step of the running queue changed, so the view stays as it was when the queue started for them. **For 2d:** the session's RunView follows this rule too (§2.3's AF5 line). *(Alternative: the review's, the asked question for every target while a step runs, which flips a target with an earlier re-ask not proved from the record's question to the asked one when the queue starts.)*
  - **D2-59's removals while hidden (A-V2C2-ADV-6, minor; fixed):** a question asked is shown less the sources the user's declines took out of it (the done stack's question changes), the rule the re-ask note already used. ~~A source declined this way can never come back into a later question (its arrow is in `rejectedArrows`), so the subtraction never takes out a source a later step asked.~~ *Corrected by builder 2b3a (carry-over R1-1): it can come back. Un-reject takes the declined arrow out of `rejectedArrows`, the arrow can be accepted again, and check 3 then lets a later mid-stage Formalize re-ask the target with that source. So a decline is now subtracted only from the questions of steps whose queue had started when it was made (queue q ≥ 2 starts at the (q−1)-th seal of the done stack; queue 1, and a step without a queue number, take every decline), and its "left the question" note shows only while the source is out of the question on record.*
  - **A Result telelean took out (A-V2C2-ADV-2, major; fixed).** Its detail read verdict and Rests on from `judged`, which reconcile sets from the very judgement that takes it out (a failing inference's verdict is still "established"), with its proof, beside "No longer pass their checks". **fixer 2c2 r1 decided:** `judged` and the proof only for a Result the user declined with its content in (status declined, no `redo.reverted`: the version they declined); a Result to be redone with its content taken out, and one declined after such a take-out (the decline keeps `redo`, D2-60), read the stage judgement's inference for the target (what ws/ holds now, B's version) and show no proof. *(Alternative: the earlier version's proof shown as such; ItemDetailView has no field for it.)*
  - **Words while a step runs (C-V2C2-C2, major; test).** The running case now has every outcome-like datum in its records (a gave-up step and its words, D2-59's decline, a re-ask of another question that gave up in the running queue, a declined item), and asserts no words, chip, note or outcome; the same records once the queue ended show each. Each consumer's guard broken alone (`outcomes` read as `shown`) fails it.
  - **The reason chip and words of a Result (A-V2C2-ADV-5, minor; fixed):** from the step whose version stands: the latest ended step that asked the question on record, less D2-59's removals, else the latest ended step (a re-ask of the same question that did not prove T is that step; the records cannot tell it from the earlier one). Claude's gap and summary on the Result follow the same step.
  - **Undo and Redo labels (C-V2C2-C4, minor; fixed):** while an action that decided an item hidden now (made while the results were shown) is on top, Undo (or Redo) is null: the reducer refuses it (D2-8), and its label names the item. `reducer.ts` exports `decidedBy` (additive) so the view reads the reducer's rule.
  - **Previous proposal (C-V2C2-C5, minor; fixed):** the newest version with an earlier rev; a premise write's same-rev draft key is never a previous proposal.
  - **Stage 0 (C-V2C2-C6, A-V2C2-ADV-4, minor; fixed):** with no judgement the board is B whatever working copy is passed (a card only that working copy has is never named), and no report target reads revealed; §2.9's `current` says so.
  - **A rejected Result while hidden; Un-reject outside a stage (C-V2C2-C3, A-V2C2-ADV-8, minor; tests).**
  - **Random sequences (A-V2C2-ADV-7, minor; test):** 40 seeds of up to 12 actions on each of three pairs (a proof or none, Claude's arrow, each with a statement-phase definition, so two meaning items wait; the Retry pair): own and group Accept, Reject, Shaky with a note, back to review and un-reject, Undo and Redo, each with or without `confirmed`, chosen from twin A's listed items; equal answers at every action, equal views before each while either twin is hidden; every kind of action is carried out somewhere, and some are refused, stale or asked to confirm.
  - **The stage's problems (S-STAGE-PROBLEMS-NO-PATH, minor; fixed).** The plan has the stage report problems (§2.1's `facts`, §3.5's "disappeared", §3.8's failed premise write, §4.2's unowned difference), but the view had no field. **fixer 2c2 r1 decided:** `SessionView.problems` (additive, §2.3): the judgement's `facts` and `unowned` problems (no Lean detail, no position), the items that disappeared (§3.5's rule on the records and the judgement's drafts, not while judging, when an un-reject's merge puts records ahead of the judgement), and the runner's own through `SessionViewInput.problems` (additive, §2.9; **2f passes** a failed premise write, with its item). While the results are hidden, a judgement's problem that names only hidden items, and a runner's that names one, is left out, and hidden items are never named. `no-longer-builds` problems are not repeated (reconcile's event and the marker name those items; their text holds Lean's message and positions that hidden lines move). §5.8's second lines show them (2g). Apply's gate is unchanged: the final check refuses each of them. *(Alternative: name a channel per text (events, notices); events are only "since the user's last action", and §3.8's "Reload the window to try again" would be lost.)*
  - **Persistence (S-PERSIST-NEW-RECORD-FIELDS, minor; docs):** §2.6 gains `PersistedStep.queue?` and `PersistedSession.confirmation.reusedFileChecks?`. **2d persists** `queue` at each `queue-start` (and the session's first queue), **2f** `reusedFileChecks`; `toSessionRecords` maps both, so step numbers and "file checks reused" read the same after a reload.
  - **Stale files (S-STALEFILES-VACUOUS, minor; test):** a working copy with a stale module: no `staleFiles` and state "fresh" while hidden, `staleFiles` and "stale" once shown.
  - **The hidden summary's status (S-HIDDEN-SUMMARY-ENVELOPE, C-V2C2-C7, nits; docs):** the builder's entry is corrected (the sandbox statuses map from the envelope while hidden), and §4.7's residuals list a judge build that times out or runs out of memory on hidden content.
  - **"Claude's step passed its checks" (A-V2C2-ADV-9, nit; fixed):** `REVIEW_TEXTS.stepPassed` now reads "Claude's step finished", which no reader takes for a verdict (the Result's verdict says whether it proved).
  - **Tests:** core 76 files, 1127 tests (was 1115): view.test.ts 54 (was 43), reconcile.test.ts 33 (was 32). **Mutation checks:** 40 on the fixes, each restored byte for byte (`cmp`), every one failing at least one test (among them each of the review's surviving mutations M41–M48 and ADV-8's). **Verification:** tsc clean for core and runner (tsconfig.test.json), webview (tsconfig.json, tsconfig.node.json) and extension; vitest core 1127 (76 files), webview 314, extension 205 (`--no-cache`); no runner source or test uses what changed (a pure runner file, 14 tests, as a smoke run).
