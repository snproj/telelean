# Plan extract for sub-slice 2f (from docs/slice2-plan.md, AP-38)

This file holds only the parts of /home/zhengyew/telelean/docs/slice2-plan.md that 2f needs. Read the full plan only for a section cited here but not included. Left out: §1.1 entries of other sub-slices; 2.1 Facts: `DeclFacts.typeConsts` (the field in 2a1; the probe in 2b3, isolated in 2b3a; its core half in 2b2); 2.3 Views (host → webview; built only by `buildSessionView`, 2c2); §5 (the review UI); §4 (core items and checks; built in 2a1-2c2: read the code); §6.1 entries of other sub-slices; §8 entries that do not mention 2f.


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


### 1.1 Scope of 2f (extract)

**2f: Add premise items and the end.** No core file (`holdAs` comes from 2b2, and Apply uses M2's history kind, D2-67).
- Runner:
  - `run/premises.ts` (the premise writes and completions that are due, `recover()` enqueueing them, and taking a written premise out, §3.8, AF2) and `run/sessionEnd.ts`;
  - `proposal/sidecarStore.ts` (attempt records at the end);
  - `workspace/files.ts` (`isSubjectSidecarFile` adds `endorsements.json`), `workspace/modelWorkspace.ts` and `workspace/types.ts` (`applyChanges` accepts the two sidecars, §2.6);
  - `workspace/modelWorkspace.ts` also reads `endorsements.json` (on load, when it changes, and after an Apply or its Undo) and passes it to `buildProjectModel`.
- Host routing: `endSession` (with `exit` outside the host's run queue, as `cancelRun`, AF14) and `moveProposed`.
- The D-21 rebase block and the `accept-base` / `rebase` writers are deleted.
- Scope: §3.8–3.10.


### 2.2 The review model (core `review/types.ts`, 2a1)

```ts
/** RV-1. Slice 2 produces formalize, add-premise, add-arrow, vocabulary-term, declaration and result. */
export type ItemKind =
  | 'add' | 'add-premise' | 'add-arrow' | 'remove-arrow' | 'formalize' | 'change' | 'delete'
  | 'vocabulary-term' | 'declaration' | 'result' | 'proof-broken';
/** For `declaration` items. Structures, inductives, classes, abbrevs and opaques count as `definition`. */
export type DeclKind = 'definition' | 'instance' | 'coercion' | 'presupposition' | 'vocabulary-change';
export type ItemStatus = 'in-review' | 'accepted' | 'declined' | 'to-be-redone' | 'withdrawn';
/** `plain`: arrow items only (DO-0). `transform` is refused until slice 4. */
export type DeclineOption = 'plain' | 'reject' | 'shaky' | 'transform';
export type ItemMarker =
  | 'updated' | 'no-alternative-found' | 'seen-early' | 'meaning-differs-in-place' | 'completion-not-checked'
  | 'unused-premise' | 'adds-no-new-basis' | 'sentence-lean-may-disagree' | 'no-longer-builds'
  /** A premise draft that no longer closes the gap when checked again (§3.8). */
  | 'no-longer-closes-gap';
/** Shown only while the results are shown (§4.7). */
export type ResultFlag = 'proved-from-nothing' | 'replaces-your-proof' | 'proves-changed-statement';

export interface ClassReason { code: 'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'c1' | 'c2' | 'c3' | 'c4'; name?: string; arrow?: ArrowEnds; cards?: string[] }
export interface ItemClass {
  belief: boolean;
  changesProved: boolean;
  reasons: ClassReason[];
  /** False when a closure met a declaration without valueConsts or typeConsts; `belief` is then true (D2-25). */
  complete: boolean;
  /** c4 only: the arrow "adds no new basis" (§4.4). classify sets it; the view reads it from the class in force (AF8). */
  addsNoNewBasis?: boolean;
  /** (fixer 2a, ADV-3) Its draft lacks its declarations' facts (`ItemDraft.factsMissing`): its Accept waits, and no badge
   *  comparison (RV-7, D2-23) reads the map while any class has it. */
  factsMissing?: true;
  /** (2b2, AP30-5; additive) With `factsMissing`, when the judged state's probe failed: `probeFailure`'s sentence (§2.1).
   *  The reducer's Accept refusal then reads it plus "Decline what caused it, or Exit." (`REVIEW_TEXTS.acceptProbeFailed`)
   *  instead of ADV-3's text, since no check is coming that would lift it. */
  probeFailure?: string;
}

/** Enough to render an earlier version and to re-apply a rejected one. */
export interface ItemContent {
  decls: Array<{ name: string; text: string; kind?: string }>;
  fields?: Record<string, string>;
  arrow?: ArrowEnds;
  premise?: PremiseDraft;
}

export interface ItemRecord {
  /** `it` and the first 16 hex digits of the sha256 of the run id and the key (the hash of §4.3), made by reconcile. One
   *  record per key, so it is never reused in the session, and it never depends on how many other items, hidden ones
   *  included, exist (AF7). Matches RUN_TOKEN_PATTERN (D2-31). */
  id: string;
  /** The item's identity across stages (table below). */
  key: string;
  kind: ItemKind;
  declKind?: DeclKind;
  /** 1 for the first version, +1 whenever its content key changes (a newer proposal, RV-1). */
  rev: number;
  /** The step that first proposed it, its inference, and whether before or after that step fixed its statements.
   *  Set when the record is made, never re-derived (§4.2). */
  origin: { step: string; target: string; phase: 'statements' | 'proof' };
  /** The target whose Result it is part of (`ItemDraft.partOfResult`), set when the record is made. Such an item is
   *  hidden while the results are (§4.7). */
  partOf?: string;
  status: ItemStatus;
  decline?: { option: DeclineOption; note?: string; at: string; commit?: string };
  /** `result`: a Result's verdict and Rests on when it was accepted; the backstop compares them on F (§4.10).
   *  `holdAs` and `rationale`: add-premise only, the hold-as choice and the one-line Why of its Accept. The premise
   *  write and its replay after a crash (`inFlight`, §2.6) read them here, never a default (§3.8); a Redo sends them
   *  again from its recorded request (AF13). */
  accepted?: { how: 'own' | 'group'; fingerprint: string; belief: boolean; changesProved: boolean; at: string;
    result?: { verdict: 'established' | 'proved' | 'not-proved'; restsOn: string[] };
    holdAs?: 'axiom' | 'pending'; rationale?: string };
  redo?: { because: string[]; reverted: boolean };
  markers: ItemMarker[];
  /** Content key of the current version (§4.3). */
  fingerprint: string;
  content: ItemContent;
  /** Earlier versions, newest last: RV-1's "previous proposal", DO-1's superseded rejected versions. */
  versions: Array<{ rev: number; stage: number; fingerprint: string; content: ItemContent; rejected?: boolean }>;
  /** DO-1: content keys of the versions rejected in this session; a step may not propose them again (§4.9). */
  rejectedFingerprints: string[];
  /** add-premise: the card id once telelean wrote it. */
  card?: string;
  /** (fixer 2a, V2A-S1) `result` only: its inference's verdict, Rests on and RV-5 dependencies (item keys), each sorted, in
   *  the last judgement reconcile applied while its content was in ws/. RV-11 compares the next judgement with it,
   *  whatever the status (§3.5); an Accept copies verdict and Rests on into `accepted.result`, and is refused without it. */
  judged?: { verdict: 'established' | 'proved' | 'not-proved'; restsOn: string[]; deps: string[] };
}

/** What telelean itself wrote or recorded. Persisted outside ws/; G5, B.3, ownership and the backstop read it. In
 *  `premise`, `mark-removed` and `completion`, `item` is the Add premise item's key (`premise:<T>:<leanName>`), so
 *  computeItems keys the written premise by its draft's key (§3.5); taking the premise out drops all three (§3.8). */
export type LedgerEntry =
  /** propose_arrow (D2-1); written into the target's `premises:` at the step's next normalise. */
  | { kind: 'arrow'; source: string; target: string; step: string; why: string; written?: string }
  | { kind: 'premise'; card: string; target: string; holdAs: 'axiom' | 'pending'; item: string; commit: string }
  | { kind: 'mark-removed'; card: string; item: string; commit: string }
  | { kind: 'completion'; target: string; item: string; commit: string }
  /** The step that first created a declaration, and in which phase (D2-43). It fixes the declaration's owner for the
   *  whole session (§4.2). */
  | { kind: 'created'; name: string; step: string; phase: 'statements' | 'proof';
      /** (fixer 2a1, V2A1-C3) A proof-phase definition: the key of the step's premise draft that reached it (D2-42). */
      draft?: string };

export interface SessionInference {
  target: string;
  /** Q(T): the selected arrows' sources (your arrows, or Claude's accepted ones); [] with fromNothing for the mark.
   *  A re-ask replaces it only when its step proves T (§3.2); DO-0 on a selected Claude arrow removes that source (D2-59). */
  question: { sources: string[]; fromNothing: boolean };
  /** Sources first (formalizeOrder), ties by reading order. */
  order: number;
  steps: string[];
}

/** A missing premise Claude proposed (propose_assumption): outside ws/ until accepted (RV-1). */
export interface PremiseDraft {
  target: string;
  step: string;
  naturalName: string;
  leanName: string;
  leanStatement: string;
  explicit: string;
  whyNeeded: string;
  proof: string;
  footprint: string[];
  /** "may simply restate the target" */
  aloneEntails: boolean;
  /** The scratch facts of its statement's declarations, by Lean name; replaced at each re-check (§3.8). R_stmt, the
   *  item's `mentions` and its statement view read them, so classes and dependencies survive a reload (F12). */
  facts: Record<string, DeclFacts>;
}

/** The part of an item's record that one action may change (F4). */
export type ItemState = Pick<ItemRecord, 'status' | 'decline' | 'accepted' | 'redo' | 'markers' | 'rejectedFingerprints'> & {
  /** The revs of `versions` marked rejected. */
  rejectedRevs: number[] };
/** Show results' force (§4.7): the results stay shown until a statement or belief item next becomes undecided (AF4), a
 *  Result that RV-11 returns to review, or the end of any queue of Claude steps (§4.7).
 *  `decided` (fixer 2a, ADV-1): telelean's own force, set when the results were shown because every meaning item was
 *  decided and D2-23's returns at that show would hide them again; it marks no Result seen early (§4.6, §4.7). */
export interface SessionForce { via: 'show-result' | 'raw-diff' | 'activity' | 'decided'; at: string }
/** One step of the session stack (UN-4). It records every effect of its action, so Undo restores `before` exactly (F4),
 *  once the reducer has checked the restored statuses against the current state; Redo sends `request` again through the
 *  reducer, never a recorded state (AF13). With `accepted` come an Add premise's `holdAs` and `rationale`. `id` comes
 *  from the session's counter (`PersistedSession.nextAction`) and is never reused, so a request naming an action (Undo,
 *  Redo) can never hit a newer action that happens to sit at the same depth. */
export type SessionAction = { id: number } & (
  | { kind: 'decide'; label: string;
      /** The decisions as the user sent them, for Redo (AF13). */
      request: { decisions: ItemDecision[]; own: boolean };
      /** `rev` (builder 2a2): the item's rev when the action was made; Undo gives `conflict` when a listed one changed. */
      changes: Array<{ item: string; rev: number; before: ItemState; after: ItemState }>;
      /** The written Add premises its write took out (§3.8): their card, written key and ledger entries, which Undo puts
       *  back with the files. The write fills it in its step 4, when it adds its commit (AF2): only those written when
       *  the write started, so one whose card only the write's own un-reject merge brought back is taken out but not
       *  recorded (fixer 2b1a r1; ItemWrite, §2.9). */
      takenOut: Array<{ item: string; card: string; fingerprint: string; ledger: LedgerEntry[] }>;
      /** DO-0 adds its arrow; un-reject of an arrow item removes it. */
      rejectedArrows: { added: ArrowEnds[]; removed: ArrowEnds[] };
      /** DO-0 on an arrow that a question selected takes its source out of that question (D2-59). */
      questions: Array<{ target: string; before: SessionInference['question']; after: SessionInference['question'] }>;
      /** The force this action ended, if any (§4.7): Undo puts it back. */
      endedForce?: SessionForce;
      /** (fixer 2a, ADV-1) The `decided` force this action set: Undo removes it. */
      startedForce?: SessionForce;
      commits: string[]; at: string }
  /** Show results. Undo removes the force; the seen-early markers stay (UN-4). */
  | { kind: 'reveal'; label: string; force: SessionForce;
      /** (fixer 2a, V2A-S4) The items D2-23 returned at this show: Undo restores them, through the same checks. */
      changes: Array<{ item: string; rev: number; before: ItemState; after: ItemState }>;
      /** (builder 2b1a, carry-over R1-2) As decide's: a written Add premise resting on a returned item returns to review
       *  with it, so the show's write takes it out (§3.8); its step 4 fills both, and Undo inverts and puts back. */
      takenOut: Array<{ item: string; card: string; fingerprint: string; ledger: LedgerEntry[] }>;
      commits: string[] }
  | { kind: 'move'; label: string; before: Record<string, CanvasPosition | null>; after: Record<string, CanvasPosition>; at: string }
  | { kind: 'seal'; by: SealBy; at: string });
/** UN-5's sealing actions. Every queue of Claude steps after the session's first starts with exactly one, written by
 *  its `queue-start` write (D2-63); the session's first queue, which the starting Formalize queues, has none (fixer 2b3a
 *  r1, C-V2B3A-C1: `buildSessionView`'s D2-59 removals count a decision made after k seals against queues 1 to k + 1).
 *  Answering Claude's question needs no seal of its own: nothing is decided while the queue runs (D2-62), so the
 *  queue's seal already covers it. */
export type SealBy = 'submit' | 'formalize' | 'retry';

/** webview → host, in `decideItems`. The message's `own` flag, never the count, makes an Accept the item's own (RV-7, D2-32). */
export interface ItemDecision {
  item: string;
  /** The version the user saw: a stale rev is refused (`conflict`). */
  rev: number;
  to: 'accepted' | 'declined' | 'in-review';
  /** Required with `declined`, and only there. */
  option?: DeclineOption;
  /** Only with `shaky`: the person's note for Claude (D2-13). */
  note?: string;
  /** Only with `accepted`, on an add-premise item. One already written (an adopted ghost of a converted v1 run, §3.11)
   *  takes only `axiom` (AF12). */
  holdAs?: 'axiom' | 'pending';
  /** Only with `holdAs`: the new card's Why, one line. */
  rationale?: string;
}
```

**Item keys** (identity; persisted; never shown):

| Key | Item | Kinds |
|---|---|---|
| `card:<node>` | a card's fields | formalize, change, delete; add, for a card Claude creates (slice 3) |
| `proof:<node>` | a card's proof | result, proof-broken |
| `premise:<target>:<leanName>` | a missing premise with its arrow | add-premise |
| `arrow:<source>><target>` / `unarrow:<source>><target>` | Claude's arrow | add-arrow / remove-arrow |
| `vocab:<lean name>` | one new plain vocabulary term | vocabulary-term |
| `decl:<lean name>` | a definition, instance or coercion; a presupposition with its helper instance; a change to existing vocabulary | declaration |

Every vocabulary term is its own item, shown in one "Vocabulary (N)" group with "k of N accepted" (D2-31).


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


### 2.5 RunManager (runner `run/types.ts`; each method added by the sub-slice that implements it)

```ts
session(): SessionView | null;
formalize(r: { subject: string; inferences: ReadonlyArray<{ target: string; premises: readonly string[] }>;
  runId?: string; stage?: number }): Promise<ActionOutcome>;
decide(runId: string, stage: number, own: boolean, decisions: readonly ItemDecision[], confirmed: boolean): Promise<ActionOutcome>;
reveal(runId: string, stage: number, via: 'show-result' | 'activity'): Promise<ActionOutcome>;
undoSession(runId: string, step: number, confirmed: boolean): Promise<ActionOutcome>;
redoSession(runId: string, step: number, confirmed: boolean): Promise<ActionOutcome>;
submit(runId: string, stage: number): Promise<ActionOutcome>;
end(runId: string, decision: 'apply' | 'exit' | 'back', stage?: number, check?: string): Promise<ActionOutcome>;
retry(runId: string): Promise<ActionOutcome>;
sessionDiff(runId: string, stage: number, confirmed: boolean): Promise<{ ok: true; kind: 'diff'; files: FileChange[] } | ActionOutcome>;
moveProposed(runId: string, positions: Readonly<Record<string, CanvasPosition>>): Promise<ActionOutcome>;
```
- `RunChange` gains `session: boolean`.
- `undoSession` and `redoSession` take the SessionAction id the user saw. `sessionDiff` answers `needs-confirmation` while the results are hidden, unless `confirmed`; with it, the diff counts as Show results (§2.4).
- `start(request)` becomes a one-inference `formalize`; the runner's tests and scripts keep using it.
- In a session, `cancel(runId)` is Cancel step. On a running or interrupted step it ends that step as cancelled (back to S₀), marks the rest of the queue `not-run`, puts them in `retry`, and opens the stage (§3.4, D2-55). It never ends the session.
- While a step runs, `decide`, `reveal`, `undoSession`, `redoSession`, `submit`, `retry`, `sessionDiff`, `moveProposed`, a mid-stage `formalize`, and `end` other than `exit` answer `refused` with D2-62's text.
- `answer`, `resume`, `dismiss`, `recover` and `dispose` keep their meaning. `answer` adds no seal: the seal at the queue's start already covers it (UN-5, D2-62).
- **When each call resolves** (D2-74). The host runs every run message except `cancelRun` through one queue (`enqueueRun`) and waits for each call, so no call may wait for Claude, a judge or a Lean job it starts:
  - `formalize`, `submit` and `retry` resolve once their queue's first step is working, as `start` does; a `submit` that leads to the end confirmation, once the phase is `confirming` (its final check runs after);
  - `decide`, `reveal`, `undoSession`, `redoSession` and `moveProposed` resolve after their write's step 4 (§2.6), never after the judge, the premise write or the completion they start;
  - `end` with `exit` is not queued by the host, as `cancelRun` is not, so it can stop a running step at once; `end` with `back` resolves after its run.json write, and with `apply` when Apply ends.

  So an answer to a question that Claude asks during a queue never waits behind the call that started the queue.


### 2.6 Persistence
- **run.json version 2:** `PersistedRun.version: 1 | 2` and `session?: PersistedSession`. `isPersistedRun` (`run/persist.ts`) accepts only version 1 today; from 2d it accepts versions 1 and 2, so a version-2 run is never dropped on recovery. Version 1 is still read; a v1 run in review is converted when it is recovered (§3.11).

```ts
interface PersistedSession {
  format: 'telelean-session'; version: 1;
  stage: number;
  phase: SessionView['phase'];
  inferences: SessionInference[];
  steps: PersistedStep[];
  /** Step ids still to run in the current queue. */
  queue: string[];
  /** After a Cancel step or a failure: the cancelled or failed step and the steps of its queue that it dropped
   *  (`not-run`), in either mode, a statements-only step's included (F3). Retry step moves them back to `queue`, and
   *  each decides its mode again at its new S₀; Submit review and a mid-stage Formalize drop them (D2-44). */
  retry: string[];
  /** Item ids come from the run id and the key (§2.2), so no item counter is kept (AF7). */
  items: ItemRecord[];
  /** The next SessionAction id (never reused in the session). */
  nextAction: number;
  /** Add premise drafts, outside ws/ until accepted. */
  premises: PremiseDraft[];
  ledger: LedgerEntry[];
  /** DO-0. */
  rejectedArrows: ArrowEnds[];
  stack: { done: SessionAction[]; undone: SessionAction[] };
  /** Show results' force, until a statement or belief item next becomes undecided, a Result that RV-11 returns to review,
   *  or the end of any queue of Claude steps (§4.7). */
  forced?: SessionForce;
  /** The shadow commit ws/ is at outside a running step: set by each write's step 4 (below) and by each step's end. */
  head: string;
  /** A write to ws/ in progress (the write order below); `recover()` finishes it. `SessionWrite`: §2.9. */
  inFlight?: { action: SessionWrite; parent: string };
  /** The stage judgement that the records and the view describe. A `judge-apply`, a premise write or a completion
   *  replaces it (AF9), so it stays as it was while a queue runs (D2-63). The StateJudgement itself is not persisted:
   *  `recover()` computes it again from the judged commit's files and `judged-facts.json` (§3.11, D2-72). */
  judged?: { commit: string; filesKey: string; ok: boolean; problems: string[]; at: string };
  heading?: SessionView['heading'];
  confirmation?: { checkId: string; filesKey: string; state: 'running' | 'passed' | 'failed';
    failures: EndConfirmationView['check']['failures'];
    /** (fixer 2c2 r1, S-PERSIST-NEW-RECORD-FIELDS; additive) EN-2: the final check reused the last judgement's file
     *  checks; 2f writes it with the check's result, `toSessionRecords` maps it (SessionRecords.confirmation). */
    reusedFileChecks?: boolean };
  /** ES-7: the files that differ from B, and when that was first seen; absent while none differs (AF9). */
  drift?: { files: string[]; at: string };
  positions?: Record<string, CanvasPosition>;
  events: SessionView['events'];
  /** Raised whenever the view changes in a way the user can see; the masked graph's `version` (F17). */
  viewVersion: number;
}
interface PersistedStep {
  id: string;
  kind: 'formalize' | 'submit';
  target: string;
  stage: number;
  /** The step's limits; for a re-asked target, `scope.question` is the new question (§3.2). */
  scope: StepScope;
  retryOf?: string;
  /** StepState (§2.9). A statements-only step (A12, D2-4) ends `passed` (or `gave-up`). */
  state: StepState;
  /** (fixer 2c2 r1, S-PERSIST-NEW-RECORD-FIELDS; additive) The queue it runs in, numbered from 1 in the session: 2d
   *  writes it in the `queue-start` write that queues the step (and in the session's first queue), a Retry step's new
   *  queue number included, so `toSessionRecords` maps it (SessionRecords.steps[].queue) and StepView's `index` and
   *  `of` count the same after a reload (D2-72). */
  queue?: number;
  startCommit?: string;
  freezeCommit?: string;
  endCommit?: string;
  freezes: FreezeRecord[];
  gateAttempts: GateAttemptView[];
  lastFinish?: FinishArgs;
  counters: RunCounters;
  agentMs: number;
  /** Written to attempts.jsonl only when the session ends (D2-11). */
  attempt?: AttemptRecord;
}
```
- **The run directory** holds, all outside ws/ and so out of Claude's reach (S3):
  - `base-facts.json`, as today; the base mask takes proofs from it (§4.7);
  - `judged-facts.json`: the stage judgement's facts, replaced only with `judged` (the judgement itself is computed again on load, D2-72);
  - `renderings.json`: Lean's renderings of statements, by content key (§3.12);
  - `transcript.jsonl`.
- **Write order** (D2-51). Every write telelean makes to ws/ outside a running step is made in four writes, in the order below. That covers a decision, an Add premise's write and its completion, Submit's take-out, the judge's outcome (its reverts), and a queue's start (whose step 2 writes no file).
  1. run.json gets `inFlight` (atomic replace).
  2. The files are written into ws/.
  3. The shadow commit is made.
  4. run.json gets the new records, with `head` set to that commit and `inFlight` cleared (atomic replace).

  Outside a running step, `recover()` reverts ws/ to `head` (a `revert` commit, or nothing when they are equal) and runs `inFlight` again, which is idempotent. A write is then either not made or fully made, never half made. A ledger entry is written to run.json before the normalise that writes it into ws/.

  **The in-memory session changes only at step 1** (`inFlight`) **and step 4** (the records, `head`, `inFlight` cleared); a records-only write changes it at its one run.json write. Everything in between, reconcile's output included, works on copies. So `dispose()`, which writes the in-memory run.json at once when the window closes, always writes a state this order allows: never records ahead of `head` without `inFlight` (AF11).
- **One write queue** (D2-51). Every write of a session runs in one queue, in order, from its step 1 to its step 4, with nothing interleaved: decisions, an Add premise's write and its completion, Submit's take-out (§3.7), the judge's outcome (`judge-apply`), and the start of a queue of Claude steps in a stage (`queue-start`: its seal and its first `step-start` commit, AF3). So `inFlight` needs only one slot, and no write overwrites another's.
  - A change to the records alone (Accept, back to review, Shaky, Show results, a move) also takes the queue, for one run.json write. It waits only behind a write in progress, a premise write's or a completion's Lean job included, never behind a judge.
  - Each write plans its files when it starts, for its step 2, on the head and the ledger as they are then (a replay after a crash plans them again). So a take-out also covers a premise that a write queued before it has written meanwhile (§3.8).
  - While the queue holds a write, queued or running, the session is `judging` (§3.6, AF3): Submit review, Apply, a mid-stage Formalize and Retry step wait until it is empty and no judge runs. A queue of Claude steps then starts as the queue's last write (`queue-start`), so no premise write, completion or decision write is ever left behind it.
  - The judge's Lean job runs outside the queue, on the head. Its whole outcome is one `judge-apply` write, planned inside the queue (F8). When the head is no longer the commit it judged (a decision moved it meanwhile), the write is dropped and the judge runs again on the new head. Otherwise `reconcile` (§3.5) runs on the records as they are then, so a decision made meanwhile is kept; the judge's reverts (§3.6) are the write's ws/ part, and its records, `judged` and `judged-facts.json` are written in its step 4.
  - While a step runs, the session takes no action (D2-62), and a queue starts only once the write queue is empty (above), so no session write interleaves with the step's own commits and run.json writes, nor with the step that comes after it.
  - Steps 1 and 4 use a new `RunFiles.writeStateChecked`, which rejects when the write fails (today's `writeState` logs the failure and resolves). A failed step 1 aborts the write: ws/ and the records stay as they were, and the action is refused with "telelean could not save the session: ‹error›". A failed step 4 is tried once more; if it still fails, the queue stops with the same text, and after a reload `recover()` finishes the write.
- **Shadow commit kinds:**
  - new: `step-start` (S₀), `decision` (telelean carried out a decline) and `completion` (a premise completion);
  - a step's rollback target is `lastCommitSince(step.startCommit, ['gate-pass', 'freeze', 'step-start'])`;
  - `rebase` and `accept-base` stay readable, but nothing writes them any more.
- **Sidecars:**
  - `attempts.jsonl`: one AttemptRecord per step (`round` = the step's index, `premises` = its question) plus its resolution, all written when the session ends (D2-11);
  - new `.telelean/subjects/<S>/endorsements.json`: `{ format: 'telelean-endorsements', version: 1, endorsed: Array<{ name: string; textHash: string; run: string; date: string }> }`. Apply writes it inside its history entry. Core build drops `definitional-choice` from a definition whose name and text hash are endorsed (D2-18). `textHash` is core's `endorsementHash(text)` (2c1), so 2f writes exactly what the build compares. The runner's ModelWorkspace reads the file and passes it to `buildProjectModel` (2f).
  - **Apply's sidecars** (an additive change to M2's frozen `ExternalChangeSet`):
    - `ExternalChangeSet.changes` may include the subject's `layout.json` and `endorsements.json`;
    - `ModelWorkspace.applyChanges`, which today refuses every file that is not a model file, accepts exactly those two besides model files;
    - `isSubjectSidecarFile` adds `endorsements.json`, so History's snapshots and Undo cover both.
  - **Apply's history entry** uses M2's kind `accept-proposal`, with its own label (§3.10, D2-67), so no history kind is added.
- **Webview state:** `review?: { runId; current; filter }`, used only for the same runId (ES-6).


### 2.7 Gate contracts (core `gate/`; 2b1b)

```ts
/** ES-2's preset for one step, relative to its start S₀. */
export interface StepScope {
  step: string;
  target: string;
  question: { sources: string[]; fromNothing: boolean };
  /** Cards at either end of a selected arrow whose Lean statement is empty at S₀; never E(T)'s sources (D2-21). */
  fuzzyStatements: string[];
  /** The target's proof may be written, replaced or completed; never made an axiom. */
  openProof: boolean;
  /** propose_arrow into the target; false when the question is the target's mark. */
  openArrows: boolean;
  /** Submit steps: keys of this inference's Shaky and to-be-redone items, whose content may change or go. */
  openItems: string[];
  /** A12 (D2-4): the source, an earlier target of the queue, that has no `.holds` at S₀. The step only formalises
   *  statements: `openProof` and `openArrows` are false, and it finishes not proved naming this source. Never in a view. */
  statementsOnly?: string;
}
export interface JudgeInput {
  purpose: 'check' | 'freeze' | 'gate-proved' | 'gate-other' | 'stage' | 'final';
  stage: 'formalise' | 'prove';
  /** The state judged: its shadow commit and files key, passed through to StateJudgement. */
  commit: string;
  filesKey: string;
  /** B, with the base facts. */
  base: ProjectModel;
  /** The judged state, with fresh facts. */
  current: ProjectModel;
  /** S₀ and the step's limits: step purposes only. */
  stepStart?: ProjectModel;
  scope?: StepScope;
  /** The active step's freeze. */
  freeze?: FrozenSnapshot;
  inferences: readonly SessionInference[];
  ledger: readonly LedgerEntry[];
  /** The session's item records. They do not change while a queue runs (D2-62), so a step's checks, and its Resume,
   *  read the records of its start. */
  items: readonly ItemRecord[];
  /** Add premise drafts: computeItems makes their items (§3.5), and `classes` counts their statements (§4.1). */
  premises: readonly PremiseDraft[];
  /** The inferences whose step ended: each has a Result draft (§4.2). */
  ended: readonly string[];
  rejectedArrows: readonly ArrowEnds[];
  /** The step's finish said it found no other arrangement (DO-3). */
  noAlternative?: boolean;
}
export function judgeState(input: JudgeInput): StateJudgement;   // StateJudgement: §2.9
// GateFindingCode: + 'arrow' | 'holds-kind' | 'rejected-repeat' | 'stray-command'
// GateFinding:     + inference?: string   (the target of a per-inference finding)
```

New tokens (each with a board sentence in `describeFinding`, and a message for Claude):
- `existing-changed`:
  - new token `session`: content proposed earlier in this session, "leave it exactly as it is in this step";
  - `meaning` now also fires when the sets of value or type constants differ (D2-41);
  - (fixer 2b1b r1) `closed-proof`: the target's `.holds` while the step's proof is closed; `text`: a line of S₀ outside declarations removed or moved; `unowned`: a difference no review item can hold that S₀ did not have, which no other rule named (§4.9).
  - (fixer 2b1b r2, R1-3) `uncovered`: content an earlier step of the session wrote that no review item of S₀ covers (`session` is for content the person reviews); `closed-proof`'s sentence names any change of the closed proof (added, changed, removed or moved).
- `arrow` (B.3): `not-target`, `into-axiom`, `mark`, `no-holds`, `declined`, `cycle`, `unknown-card`, `drawn`, and `other-target` (the source is another target of the session, D2-50).
- `holds-kind` (B.4): `theorem-to-axiom`, `axiom-for-proposition`, `type-changed`; (fixer 2b1b r1) `axiom-to-theorem` and `not-target`: a theorem `.holds` on a card other than the step's target (at a stage and the end, than a session target), from an axiom, or new or rewritten.
- `markup` (G5, fixer 2b1b r1): token `lines`, a block's other lines reordered, added or rewritten (computeItems' F1 rule).
- `rejected-repeat` (step purposes only, for content created or changed since S₀; D2-66): `rejected` (DO-1), `arrow` (DO-0), `premise` (a rejected Add premise), `shaky-identical` (DO-3).
- `new-axiom`: + `type-changed` (a reused name with another type: S6).
- `undeclared-premise`: + `other-result` (a declaration of a Result's proof phase used outside it, D2-50, §4.9).
- `stray-command`, a new code: a top-level command that is not a declaration, nor a line enclosing new declarations (D2-52).

`status-mismatch` already has the tokens `changed` and `removed`, which the slice-1e fixer added; slice 2 adds none.

`evaluateRules` keeps its signature and slice 1's behaviour, as the single-target entry point built on the same rule helpers (2b1a), so the M2 and 1e gate suites keep guarding every rule. Sessions use `judgeState`.


### 2.8 Tools and turns (runner; 2d)
- **New tool `propose_arrow { source: string; target: string; why: string }`** (D2-1).
  - It is validated at once by core `proposeArrowProblems` (§4.9); a refusal is the tool result's text.
  - An accepted proposal becomes a ledger `arrow` entry. telelean writes it into the target's `premises:` at the step's next normalise, before each gate attempt; Claude never edits that field.
  - It does not count as a check.
- **`finish`** gains `no_alternative?: boolean` (DO-3).
- **`freeze_statements`** fixes exactly the step's target, once per step. `propose_assumption` keeps its shape; its check changes (§3.8).
- **Turns.** Their first lines are fixed, so FakeBackend scripts can `match` them.
  - The session's first turn is today's context bundle, with its first line unchanged (`Run: "These suffice" for the subject …`), plus a FORMALIZE PLAN: the targets in order, each with its question.
  - Each step starts with `Step <i> of <n>: formalize and prove “<target id>”`, `Step <i> of <n>: rework “<target id>” after the review`, or, for a statements-only step (§3.3), `Step <i> of <n>: formalize the statements of “<target id>” (no proof: “<source id>” was not proved)`. Then:
    - the target, its question, and Claude's arrows so far;
    - what is open, and what is fixed (everything else, content under review included).
  - The first Submit step is preceded by `Review submitted (stage <n>)`, with ACCEPTED, REJECTED, SHAKY (each note quoted), TO BE REDONE and STEPS PLANNED (§3.7).
  - Nothing is decided while a queue runs (D2-62), so all the steps of a queue see the same decisions. The first step of a mid-stage Formalize or a Retry queue lists the decisions made since the previous queue, under `Your decisions since the last step:`; a Submit queue's feedback turn covers them.
- **System prompt** (and the fixture `system-prompt-5.1.txt`):
  - "You work in steps: one target per step."
  - The arrow rule: "If the proof needs an existing card that is not a selected premise and has a `.holds`, propose its arrow with propose_arrow (the person reviews it as an item), then use it. If that card has no `.holds`, finish not_proved and name it in gap. Never edit `premises:`, `follows_from:` or any other field of a block yourself."
  - For a target whose question is its "follows from nothing" mark: no arrows; propose a missing premise with propose_assumption.
  - "Never propose an arrow from another target of this session, and never use a lemma from another target's proof unless that target is a selected premise. A statement may never use a declaration you wrote after fixing the statements." (D2-50)
  - "Write only declarations: no `open`, `variable`, `universe`, `attribute` or `#check` lines, and no `open … in` before a declaration. Write fully qualified names (e.g. `Classical.em`), and put `@[…]` on the declaration itself." (D2-52)
- `docs/m2-plan.md` §2 (the state machine) and §5 (the prompts) get dated notes pointing here.


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


## 3. The session engine (runner; 2d–2f)

### 3.1 Invariants
- **One session is one run** (Appendix B): one run directory, one shadow, one Claude conversation (resumed with `--resume` after a reload; D2-22), one transcript.
  - RunState is unchanged: stages and the end confirmation are `review`; Apply ends in `accepted`, Exit in `discarded`.
  - So `runLocksBoard` and the host's ES-9 lock keep working as they are.
- **The base never moves (ES-7).**
  - The shadow's `base` commit is made once.
  - Nothing writes the user's files into the shadow: the D-21 rebase and `accept-base` go in 2f.
  - Every item is computed from B to the working copy.
- **The working copy (W).** Outside a running step, the head of ws/ is a state telelean judged, or `judging` is true (a judge, or a write in the session's queue, AF3).
  - When nothing is judging, ws/ = B + the content of every item that is in review (Add premise drafts excepted), accepted, declined Shaky, or to be redone without revert.
  - An Add premise enters ws/ only by its premise write, after its Accept (§3.8). A premise in review is always outside ws/, so every action that returns a written one to review takes it out; the one exception is an adopted ghost of a converted v1 run, written while in review (§3.11, AF12).
  - Rejected and plain-declined content is out, and so is what it took down.
  - So at the end, ws/ = B + the accepted items = F.
- **One inference per step (S).** A step proves one target, with its own statements fixed, its own gate and its own comparator run. Its gate judges every inference; RV-11's effect on the items comes when the queue ends (§3.5).
- **A queue runs to its end (Q, D2-63).** The start, a mid-stage Formalize, Submit review and Retry step each queue Claude steps. The stage opens when the last of them ends, or when a Cancel step or a failure drops the rest ("not run"). Until then the item records, the stage judgement (`judged`) and the view stay as they were when the queue started; the view is built from the judged commit's files and `judged-facts.json`, never from ws/ while a queue runs.
- **Decisions are the user's (D).** Statuses change in only two ways:
  - by the user's actions in a stage, with the cascades shown to them (a hidden Result's change shows when the results are shown, D2-64);
  - by the reconcile rules of §3.5 (telelean's changes, reported as events).

  While a step runs, the session takes no action (D2-62): the list is read-only, and Cancel step, answering Claude, Exit and looking stay. So telelean writes nothing into ws/ while Claude works except the step's own normalise and commits, and a rollback never goes behind its step's `step-start` commit, which comes after every decision and every session write: a queue starts as the write queue's last write (§2.6, AF3).
- **The baseline is B.** G0, new-axiom and "footprint since base" compare with B. Claude's content never counts as the user's.
- **Files change only at Apply.** Steps, decisions, judging, Submit and Exit never call `applyChanges`, `perform` or `invalidate`.

### 3.2 Starting a session, and Formalize during a stage
- **Start** (no session active):
  1. The host checks the request (core `formalizeStartProblems`, §4.12), asks egress consent, then calls `formalize`.
  2. The runner does preflight, the shadow and its `base` commit, the backend and the conversation, as today.
  3. It orders the inferences (`formalizeOrder`) and queues one `formalize` step per target, in that order.
  4. It sends the first turn, then runs the queue (§3.3). The first stage opens when the queue ends (§3.5).
- **During a stage (RV-9):**
  - Allowed only in phase `stage`, with no step running or queued, nothing being judged (no judge, and no write in the session's queue, AF3), and the results shown (D2-65): "The results are not shown yet: decide the statements, or show the results, first." So nothing the request is checked against, and nothing its steps start from, can show a hidden outcome.
  - The targets must be in the session's subject. The same start check runs, on the session's working copy: Claude's accepted arrows count as drawn, and arrows still in review are refused (D2-20). In a session it also refuses (§4.12):
    - a target with a Shaky item, and a source whose Result is Shaky or to be redone (D2-53);
    - a new target that is the source of Claude's arrow (not declined) into another target, unless the same request selects that arrow (D2-50). Selected, the arrow joins that target's question in a re-ask (below), and a later decline of it follows D2-59.
  - The runner runs the full check on its own records; the host's check only answers early. In one `queue-start` write (§2.6, AF3), it seals the session stack, adds the new inferences, queues one step per target (sources first), and drops `retry` (D2-44). The queue runs to its end, then its items join the current stage (D2-63).
  - **A re-asked target** (one already in the session; D2-46). The step carries the new question in its StepScope.
    - **It passed, gave up, or ran statements only (§3.3).** Its statement-phase content stays in ws/, as items, whatever the outcome.
      - With a proof, T's question is replaced and its Result gets a new version.
      - Without one, T.holds, the step's proof material, its arrows and its premise drafts go back to S₀ (a `revert` commit, ES-2), with their ledger entries (§3.4). T's old question and Result stay on the record, with their statuses.
      - While the results are hidden, T's InferenceView shows the question this step asked, and its Result is a neutral row, in both cases (§4.7). Once they are shown, the view shows the new version, or the old question and Result with the stage report's note "The new question for “‹T›” was not proved: your earlier result stands."
    - **It was cancelled or failed:** ws/ goes back to S₀ at once (D2-29). The old question and Result stand, and the step is in `retry`.
    - A target whose step never ended has no Result, and is asked as new.
  - No consent question: it continues the consented session.

### 3.3 A step
1. **Its start.** The head is a judged state: a queue in a stage starts only when no judge runs and the write queue is empty, and its seal and first `step-start` commit are themselves the write queue's last write (`queue-start`, §2.6, AF3); each step ends on a state its gate judged (§3.4).
2. Commit `step-start` (S₀) and record the step's StepScope on it (PersistedStep, §2.6), in the same run.json write:
   - a `formalize` step:
     - `fuzzyStatements`: the cards at either end of a selected arrow whose Lean statement is empty at S₀;
     - `openProof`: true;
     - `openArrows`: true, unless the question is the mark;
     - `openItems`: empty;
   - a `submit` step: as a formalize step for its inference, but:
     - `openItems` holds the keys of its Shaky and to-be-redone items (after Submit's take-out, §3.7);
     - `openProof` is true only if its Result is Shaky or to be redone.
3. **A12: statements only (D2-4).** A source of the question may be an earlier target of the same queue that has no `.holds` at S₀. The step still runs, but only formalises (`scope.statementsOnly`: that source):
   - its turn starts `Step <i> of <n>: formalize the statements of “<target id>” (no proof: “<source id>” was not proved)`, and asks Claude to formalise the statements, call freeze_statements, and finish not_proved naming that source, with no proof attempt;
   - `openProof` and `openArrows` are false, so the gate-other rules hold (T.holds stays as at S₀). propose_arrow and propose_assumption answer "This step only formalises the statements: “‹L›” was not proved.";
   - its Result reads not proved, "“‹L›” was not proved";
   - an ended statements-only step is not retried: to try the target again once L is proved, Formalize it again (★D7, A12). A cancelled or failed one goes to `retry` like any step, and Retry step decides its mode again at its new S₀ (F3).

   So the statement items exist whether or not L was proved, and only the step's duration differs (§4.7's residuals). The mode is never in a view.
4. **The round.** Send the step turn; today's round runs inside the step:
   - Claude works with check_lean, freeze_statements (the step's target only), propose_arrow, propose_assumption and finish;
   - normalise: pins for the scope's cards, and this step's ledger arrows written into the target's `premises:`;
   - the gate: `judgeState` with the step's purpose, scope and S₀, with up to `maxGateAttempts` attempts.
5. **At the gate,** B.1's permitted set is recomputed on the gated state, with E(T). If it differs from the freeze's, the engine exports a new challenge before the comparator: a new FreezeRecord in the same step, with the statements still fixed (D2-19).
   - The new challenge is built from the step's freeze commit (its `frozen/<n>` copy, whose sources are kept; only its `.lake` is rebuilt), changing only `permittedAxioms`. It is never built from `build/`, which holds the gated state: a challenge exported from that state would already contain a definition changed after the freeze, and G4's `comparator-definition-mismatch` could no longer catch it.
6. **Every inference** is judged at the gate. Findings about other inferences never count against Claude; their effect on the items comes once, when the queue ends (§3.5).

### 3.4 How a step ends

| Outcome | When | Working copy | Its Result | Queue |
|---|---|---|---|---|
| passed | the gate passed (proved, not proved, insufficient, inconsistent) | the gate-pass commit | from the working copy | next step |
| gave up | 3 failed gate attempts, or no finish twice | rolled back to `lastCommitSince(S₀, [gate-pass, freeze, step-start])`, then normalised and judged | not proved: "Claude's step did not finish" | next step |
| statements only | A12 (§3.3); it ends `passed` (or gave up, as above) | the gate-pass commit, with statements only | not proved: "“‹L›” was not proved" | next step |
| cancelled / failed | Cancel step (of a running or an interrupted step); a turn, check or time cap; an environment or backend failure | back to S₀ (a `revert` commit) (D2-29); the step's premise drafts are dropped (AF10) | none for this step | ends: the rest of the queue becomes `not-run`; this step and those go to `retry` (in either mode); the stage opens |
| interrupted | a reload or crash during the step | as it was | — | waits for Resume or Cancel step (D2-55) |

A re-asked target (§3.2) differs: a step that ends without a proof keeps its statement-phase content, takes its proof material, arrows and premise drafts back to S₀, and leaves the old question and Result standing on the record. The view shows neither outcome while the results are hidden.

- **When a step ends** (passed or gave up), the run.json write that records it adds ledger `created` entries for every declaration new since S₀ that is still in ws/: `statements` if it is in the step's freeze commit, `proof` otherwise (D2-43). They fix each declaration's owner for the session (§4.2). It also sets `head` to the step's last commit. A card's statement, its `.holds` and its pins stay that card's content whatever their entry says (§4.2, §4.7), and the gate refuses a finish that leaves a card's statement using what its step wrote while that reads `proof`: without a freeze, the step must call `freeze_statements` first (§4.9, fixer 2c1 r2, R1-1).
- **The ledger follows every rollback:** a give-up, Cancel step, a cap, a failure, and a re-ask that ends without a proof. The run.json write that records the rollback also drops the step's ledger `arrow` and `created` entries for the content it takes out: for a rollback to a commit, those made after that commit. So B.3 (§4.9) never meets a ledger arrow that is no longer in ws/. The take-back happens before reconcile (§3.5), so what it removed never becomes an item.
- **So do the step's premise drafts** (AF10). When a step is cancelled or fails (Cancel step, a cap, a failure, a re-ask's included), the run.json write that records its rollback also drops every premise draft the step proposed; a re-ask that ends without a proof drops them too (§3.2). A give-up keeps them: the step ended, and its drafts belong to its Result. And computeItems makes a premise item only for a draft whose target is in `ended` (§4.2), so no premise item can belong to a Result that does not exist.
- **The queue's end** (D2-63). When the last step ends, or a Cancel step or a failure ends the queue, the head is judged and reconciled (§3.5), and the stage opens.
- **"Did not pass" (ES-4).** The heading "Claude's step did not pass: ‹reason›" appears when a step fails and no passing state at or after the latest decision exists: S₀ itself did not pass its judgement. Accept is then disabled until a later step passes; Decline, Formalize and Exit stay.
- **Cancelled or failed.** The stage is headed "Step cancelled" or "Step failed: ‹reason›", with Retry step; the steps the queue did not run read "not run". The session's first step leaves an empty stage with Retry step and Exit session. A step never ends the session.
- **Retry step** (enabled in phase `stage` when `retry` is not empty and nothing is being judged, a write in the queue included, AF3) seals the stack and moves `retry` back to `queue` in one `queue-start` write, so the queue runs again from the cancelled or failed step, with fresh caps; each step decides its mode at its own S₀. Each step has the full caps, as each round has today. The queue runs to its end, and its items join the stage.
- **An inference whose step never ended** has no Result item. Submit review drops it, and the end confirmation lists it as "not run" (D2-44).
- **A step that proposes nothing** (RV-13) passes with no new items. Its report line, "Claude's step proposed nothing: ‹Claude's reason›", is shown with the results.

### 3.5 Reconcile: when a queue ends, and after every judge
`reconcile` (core, §2.9) applies a stage judgement to the records. It runs inside the write queue as the `judge-apply` write (§2.6): once when a queue ends, and after every judge that a decision started (§3.6).
1. **The judgement.** `engine.judge` builds the head and runs `judgeState('stage')` over every inference; when a queue ends, the last gate's facts are reused if nothing changed ws/ since. It also checks again the premise drafts that need it (§3.8).
2. **The records** are reconciled with the judgement's drafts (`computeItems`, §4.2), which include a Result for every inference whose step ended (F9):
   - **Premise items** come from `PersistedSession.premises`, by the key `premise:<T>:<leanName>`, like the other drafts; a draft's content key is §4.3's draft key. Once a premise is accepted and written, its item is computed from ws/ (its card, arrow and mark removal, through the ledger), and its draft stays as its record's content. The ledger's `premise` entry names the item by its key, so the key stays the draft's whatever Lean name and card id adoption chose. Its content key is then the written item's, which the premise write recorded as accepted (§3.8), so reconcile finds no change. When a later step for T ends with a new Result version, T's drafts from earlier steps that are not accepted are withdrawn (D2-17).
     - A draft stays in `premises` while its item exists, written or not; it leaves only when its item is withdrawn, or when its step is rolled back (§3.4, AF10).
     - When a written premise is taken out (§3.8), its item is computed from its draft again, and the take-out has set the record's key back to the draft's, so reconcile finds no change there either (AF1).
   - **a new key:** a new record, in review, rev 1, with its id from the run id and the key (§2.2, AF7), and `origin` and `partOf` from its draft, never changed later (§4.2);
   - **a Shaky or to-be-redone item with a draft, in an inference whose Submit step ended in the queue that just ended** (F5; `queueSteps`, so only when a queue ends, never at a judge that a decision started, which would undo a later Reject or revert, AF1): back to in review, with `redo` cleared (so no longer reverted) and its decline dropped. It is marked "updated" only when its content key changed (the old version goes into `versions`, rev + 1), and "no alternative found" when that step's finish said `no_alternative`. This rule comes before the rules below, so a set that came back unchanged can be accepted, and the next Submit review does not ask Claude about it again;
   - **a declined or reverted record whose draft is B's version** (AF1): a record declined by Reject or a plain decline, or to be redone with `redo.reverted`, keeps its status, key and rev when its draft is marked `asInBase` (§4.2). Such a draft exists only because its step ended (F9); the decline or the revert put B's version back, which is no new proposal. So the changed-key and RV-11 rules below never apply to it: a rejected Result stays rejected and can still be un-rejected, and a Result taken out to be redone (by a Reject or DO-0 cascade, or by the judge) stays so until its Submit step reworks it (the rule above). A draft that differs from B's version is a new proposal, and the changed-key rule applies (DO-1's reworded repeat; the rejected version stays under "Rejected in this session"). *(Fixer 2a, V2A-C2: only when a queue ends, and never for an exact repeat of a rejected version; otherwise the record keeps its decision and the write takes the content out again, §8.)*;
   - **the same key and content key:** unchanged, but for its content, which reconcile refreshes from the draft (fixer 2a, V2A-C1: a premise a later step proposed again, a declaration whose text changed only in whitespace; §8);
   - **a changed content key:**
     - the old version goes into `versions`; rev + 1; the item is in review again, marked "updated";
     - if it was accepted, it leaves accepted together with its accepted dependents (RV-5), each marked "updated". There is no confirmation, because the change is not the user's; an event says so, naming no Result or Result's part while the results are hidden;
   - **a Result whose verdict, "rests on" or dependencies changed** (RV-11): the same as a changed content key; compared with the record's `judged`, for a Result in review or accepted (fixer 2a, V2A-S1);
   - **a record with no draft:**
     - expected when it is declined (Reject, plain) or to be redone with its content removed;
     - `withdrawn` when it was Shaky or to be redone and a Submit step removed its content (D2-17);
     - otherwise the stage gets the problem "“‹item›” disappeared, and no decision removed it", and Apply is disabled (fail closed). A Result always has a draft once its step ended (§4.2), so this never applies to a Result that was not proved;
   - **RV-3:** a new or updated item in review that depends on an item that is Shaky or to be redone becomes to be redone at once, not reverted, as if that decision had just been made (A1);
   - **RV-7:** the classes in force are recomputed (§4.1: `classes` while the results are shown, `classesBeforeReveal` while they are hidden). An accepted item whose badges grew returns to in review with the new badge, together with its accepted dependents (D2-23);
   - **RV-5, defensively:** an accepted item with a dependency outside its SCC that is not accepted returns to in review;
   - **premise re-checks** (§3.8): a draft that no longer closes the gap becomes to be redone, marked "no longer closes the gap", and its facts are replaced;
   - **a state that does not build, or an inference that fails** B.1, B.2 or its footprint: the items the judge makes to be redone and takes out (§3.6) are `reverts`, the write's ws/ part.
3. **The reveal** (§4.7). A statement or belief item that became undecided here (§4.7: new, or back in review, or to be redone with its content in ws/ after a decided status, AF4) ends Show results' force, and so does a Result that RV-11 returned to review ("with its result hidden again"). Every queue's end ends it too, the user's force and telelean's `decided` one alike, whatever changed (fixer 2c2 r1, C-V2C2-C1: otherwise a re-ask that proves its target, whose new Result version ends the force, would hide the stage, and one that does not would leave it shown, before the meaning items are decided); ADV-1's `decided` rule then applies as at any judge. While the results are forced and a statement or belief item is undecided, every Result gets the seen-early marker.
4. **Publish.** When a queue ended, the phase becomes `stage`: the stage number rises by one when the queue came from the start or from Submit review; a mid-stage Formalize or a Retry keeps it. `viewVersion` rises whenever the visible view changed (F17).

### 3.6 Decisions on the working copy, and judging
- **Only in a stage** (D2-62). While a step runs or is interrupted, decisions, Show results, Undo, Redo, moves, Submit review and Retry step are refused: "Claude's step is running: you can review when it ends." This departs slightly from RV-3 ("at any time") and from RV-6's Show result. Cancel step, answering Claude's questions, Exit and looking stay.
- **Reject and plain decline** (D2-28):
  - the reducer's outcome lists the item and every item that depends on it, transitively, that is in review, to be redone, or declined Shaky (a Shaky dependent's content rests on what goes);
  - `planItemRevert` (§4.11) restores B's version of all their content;
  - telelean writes the files into the shadow, as one `decision` commit per user action;
  - the dependents become to be redone, with `reverted: true`.

  The dependencies are the real ones (§4.5), Results included, also while the results are hidden. A hidden Result changes silently, and its new status shows when the results are shown (D2-64).
- **Shaky:** nothing leaves ws/. Dependents in review become to be redone, transitively, with `reverted: false`. A Shaky Result, like one to be redone without revert, still counts for the inferences that use it (B.1, §4.8), so nothing downstream fails because of the decline (D2-48).
- **Accepted dependents** (RV-5): first `needs-confirmation`, with the list. Sending again with `confirmed` applies the change; Cancel sends nothing. The dialog says what happens to them:
  - Reject or a plain decline: "These accepted items lose their Accept and are taken out to be redone: …";
  - Shaky: "These accepted items lose their Accept and will be redone: …";
  - back to review: "These accepted items return to review with it: …".

  **While the results are hidden** (D2-64), no Result is listed. Instead, every action that takes an Accept away, from a decided item or from a listed dependent, asks first, even with nothing to list, and the dialog adds: "The results are hidden now: a result you accepted that rests on these loses its Accept too. You will see it when the results are shown." The trigger reads only listed statuses, so it tells nothing about a Result.
- **Judging (RV-11):**
  - after every decision commit, `engine.judge` builds the head and runs `judgeState('stage')`; its outcome is applied by a `judge-apply` write (§2.6, §3.5);
  - one judge at a time (`runExclusive`, with the memory guard), coalesced: decisions made meanwhile run it again on the newest head;
  - **judging** means that a judge runs or is due, or that the session's write queue holds a write, queued or running: a decision's, a take-out, a premise write or a completion (AF3). While judging, Submit review, Apply (and its confirmation), Formalize and Retry wait, showing "Re-checking the working copy…". Accept, Decline, back to review, Undo, Redo and Show results stay allowed (D2-27): their writes join the session's one write queue (§2.6), never beside another write.
- **A judged state that does not build:**
  - the errors are mapped to the items owning the failing declarations; those items become to be redone (reverted, marked "no longer builds"), and the state is judged again, at most once per item. The reverts are the `judge-apply` write's ws/ part; the write is dropped when a decision moved the head since the judged commit, and the judge then runs again (§2.6);
  - a judged inference that fails B.1, B.2 or its footprint makes its Result to be redone (reverted), the same way. A Result that is Shaky, or to be redone without revert, is left as it is: its Submit step reworks it (D2-48);
  - if B plus the accepted items still fail, the stage gets the "did not pass" heading (Accept disabled; Exit allowed).
- **Un-reject:** the decision commit's inverse patch is merged onto the head (`proposal/files.ts mergeFile`). The item's current key leaves `rejectedFingerprints`, an arrow item's arrow leaves `rejectedArrows`, and the stack action records both (F4). The dependents that commit took out come back with it, as to be redone without revert (D2-60); what the merge brings back that must stay out is taken out again after it (`ItemWrite.revert`, fixer 2a, V2A-C2). Un-reject of an Add premise merges nothing: in review, a premise is outside ws/ (§3.1), so only its status and its key in `rejectedFingerprints` change, and the dependents its decline took out stay to be redone, since their content needs the written premise (AF2). It is refused in three cases:
  - Claude has proposed a newer version: "Claude proposed a newer version: review that one.";
  - the merge conflicts: "This version can't be restored any more: ‹file›.";
  - a Result or a Result's part while the results are hidden: "The results are not shown yet: show them first." Such items are not listed then (F10).
- **Undo and Redo** (UN-4–UN-6), each the same as doing the action by hand, under the same rules (D2-73):
  - Undo is the inverse action, through the same reducer and the same commits, so it gets the same RV-5 list. It restores every effect its action recorded (§2.2): statuses, declines and Accepts (with `holdAs` and Why), rejected keys and versions, `rejectedArrows`, question changes (D2-59), a force the action ended, and the written premises its write took out (their card, key and ledger entries, AF2). The reducer first checks the restored statuses against the current state (RV-5's dependencies, RV-7's own Accept, D2-8, the "did not pass" heading): when a judge has changed what they rest on since, the Undo is refused with the rule's text (AF13).
  - Redo sends the action's recorded request again through `reduceReview`, on the current state, never a recorded state: a decision that the rules now refuse refuses the Redo with the rule's text, and an item whose rev changed gives `conflict` (AF13).
  - Undo of an Add premise's Accept is a back to review by hand: a written premise is taken out (§3.8). Its Redo accepts it again, and its premise write runs again.
  - Any new action, a seal included, clears Redo (`undone`), so a Redo never crosses Claude's step (AF13).
  - A seal stops Undo: "Undo stops at Claude's step: it has already acted on what came before. To change an earlier decision, set the item's status directly."
  - `sessionUndo` and `sessionRedo` name the id of the action they expect (SessionAction.id); a different top of the stack gives `conflict`.

### 3.7 Submit review (RV-12)
- **Enabled** when no listed item is in review, the results are shown, no step runs or is queued, and nothing is being judged (no judge, and no write in the session's queue, AF3). Every Result is then listed with its real status.
  - A statement or belief item to be redone with its content kept is undecided, so it keeps the results hidden (§4.7, AF4), though it does not block Submit itself (RV-3). Submit's gate then reads "The results are not shown yet: decide these statements to be redone (declined as Shaky, Claude redoes them), or show the results, first.", with those items as `missing`.
- **The plan** is core's `planSubmit` (§2.9), which the view's `submit` counts use too.
- **Every item accepted or rejected** (nothing Shaky, nothing to be redone): phase `confirming` (§3.10), with no Claude step and no seal (D2-54).
  - Here Submit's gate also refuses a cycle whose members are partly accepted (an SCC with an accepted member must be wholly accepted, §4.5): "Accept or reject all of ‹items› together."
- **Otherwise** (D2-2): Submit seals the stack (UN-5) and drops `retry` (D2-44), in the `queue-start` write that follows its take-out (§2.6, AF3). The affected inferences are the origins of the Shaky and to-be-redone items, plus the targets of Shaky or to-be-redone Results.
  - **Take-out first** (D2-57). A Shaky or to-be-redone item whose content is still in ws/ may depend, directly or transitively, on an item that another step of the queue opens (RV-5). That other step may change what the item rests on, but its limits keep the item fixed, so the item would stop building there, counted against Claude. So, before the queue starts, Submit takes every such item out, in one `decision` commit (a `submit-take-out` write, §2.6):
    - it becomes to be redone, reverted, and the feedback turn says which item's rework took it out;
    - a Shaky one keeps its decline and note: it is still quoted under SHAKY, and still counts in its inference's DO-3 set;
    - its own step proposes it again.
  - One `submit` step per affected inference, in the same conversation. A step whose open items others depend on runs before those others (RV-5 order over the open items); then sources first, ties by reading order.
  - The queue runs to its end (D2-63), and the stage number rises when it ends.
- **The feedback turn** is generated from the statuses, with the items' labels and Lean texts:
  - ACCEPTED: keep them exactly as they are;
  - REJECTED: they were removed; never propose these exact versions again;
  - SHAKY: propose a different arrangement for these together, with the person's notes; any single item may come back unchanged, but not the whole set; if there is none, finish with `no_alternative: true`;
  - TO BE REDONE: what each relied on;
  - STEPS PLANNED: the targets in order.
- **At each Submit step's gate:**
  - an exact repeat of a rejected version is `rejected-repeat` (`rejected`);
  - a Shaky set of this inference that comes back identical (kinds, sentences, Lean statements and arrows, with whitespace collapsed) is `rejected-repeat` (`shaky-identical`), unless the finish says `no_alternative`. Reconcile then returns the set to review, marked "no alternative found" (§3.5).
- **A Shaky step re-proposes content only:** no new cards, no splits, no merges (D2-15).

### 3.8 Add premise items (RV-1; 2f)
- **Proposing.** `propose_assumption` runs after the statements are fixed, as today, with three changes to its check:
  - it uses B.1's permitted set with E(T);
  - B.2's allowed set is the sources of Q(T) ∪ E(T), T's written premises included, plus the suggestion;
  - it also renders the statement's fully explicit form.

  An exact repeat of a rejected premise (the same draft key, §4.3) is refused. The draft becomes item `premise:<T>:<leanName>`, part of T's Result, hidden while the results are (§4.7). Its scratch facts are kept on the draft (`PremiseDraft.facts`), so its statement's reach and its item's dependencies survive a reload (F12).
- **Checked again** (RV-1: "re-checks whenever something it relies on changes"). `engine.judge` checks again, in the scratch file, each draft not written yet, under the same rules (E(T) and B.2 included), when something changed in its footprint, its statement's closure or T's statement (`StateJudgement.premiseChecks`). *(Fixer 2b3b r1, §8: also in what its gap proof uses and what all of these reach; a draft nothing of which changed gets its last check's outcome again, and a check telelean could not run or judge leaves the draft out, never "no longer closes the gap".)*
  - If it no longer closes the gap, reconcile makes it to be redone, marked "no longer closes the gap", and replaces its facts (§3.5).
  - While the results are hidden, the change shows only when they are shown.
- **Accept** is the item's own Accept (a belief item), possible only while the results are shown. It asks how the user holds the premise (`holdAs`), with an optional one-line Why. Both are kept in the record's `accepted` (§2.2), so the write and its replay after a crash read them there, never a default; a Redo sends them again from its recorded request (AF13):
  - as an axiom: an AXIOM card;
  - as a proposition pending proof: a PROPOSITION card with `axiom P.holds`, never green (A26).

  telelean writes it right after the Accept, through the write queue (a `premise` write, §2.6; due writes, below). Core `planGhostAdoption`, extended with `holdAs`, writes the card in Claude's words, its arrow into T, and the removal of T's "follows from nothing" mark. That is an `adopt` commit, with ledger entries `premise` (and `mark-removed`).

  An Add premise that is already written when it is accepted (an adopted ghost of a converted v1 run, §3.11) is accepted only as an axiom, since its card is an AXIOM card, and nothing is written again; `holdAs: 'pending'` is refused with "“‹sentence›” is already written as an axiom card: accept it as an axiom, or decline it." (AF12).
- **Meaning in place, and the written item's key** (F11). The write's Lean job is `engine.writePremise` (§2.9): it normalises, builds, renders P's fully explicit form where it was written, and judges the state.
  - On a mismatch, the write is taken back out (ws/ returns to the write's parent), and the item returns to review, marked "meaning differs in place".
  - When the judgement's facts have a failed probe (§2.1), the write fails like a Lean environment failure (AP30-4): it is taken back out (ws/ returns to the write's parent), the item stays accepted and its write due, and the stage gets the problem of a write that could not be made (below), its ‹error› `probeFailure`'s sentence without its final period; once what caused it is declined, a reload runs the due write again. So step 4 never reads a partial judgement: a `factsMissing` draft's key lacks the constants (§4.3), and recording it as accepted would make the premise read as changed once the probe works again.
  - When it matches, the write's step 4 sets the record's `fingerprint` and `accepted.fingerprint` to the written item's content key from that judgement, keeps the draft's key in `versions` (same rev, no "updated" marker), and stores the judgement as `judged`. The written block carries more than the draft did (`asserted`, `session`, the Why, the card id and Lean name adoption chose), so its key differs from the draft's (§4.3). This is safe: telelean wrote exactly the accepted draft, and the render checked it. So reconcile sees no change, the item stays accepted, and the backstop compares F with what was written.
- **Completion** (no Claude), when T is not proved. It is a `completion` write, never a step (F15):
  - telelean writes `theorem T.holds : T := (<checked gap proof>) P.holds`;
  - `engine.complete` normalises it, freezes again from the `adopt` commit (after `statement-changed` passes against T's last freeze snapshot; fixer 2b3b r1, §8: from the state the completion is written on, which holds the written premise, the `adopt` commit or a later one after a crash replay or a decision), and gates it as `gate-proved` with that new freeze's challenge: build, footprint, statements fixed, B.2, comparator (F11). The old freeze's challenge would lack P.holds, which is now an export target. It is recorded as a `completion` commit and ledger entry;
  - passed: T's Result returns to in review, marked "updated";
  - failed: the completion is taken back out (ws/ returns to the write's parent, the head the completion was written on: the `adopt` commit when it runs right after its premise write; as a `revert` commit; builder 2d, carry-over R1-2), so the head is again a state that passes. The premise stays accepted. The Result is marked "completion not checked", with Lean's message, and Retry step is offered: a `submit` step for T with `openProof`, put in `retry` (D2-56). It never reads as proved.
- **A second accepted premise** for an already proved T is written and marked "unused premise".
- **Due writes, and recovery** (D2-71). The Accept is a records-only write, and the premise write and the completion follow it in the write queue, each with its own `inFlight`. So both follow from the records:
  - a premise write is due for an accepted Add premise with no ledger `premise` entry;
  - a completion is due for an accepted, written premise whose target is not proved in the stage judgement, with no ledger `completion` entry for it and no "completion not checked" marker on T's Result.

  The action that makes one due enqueues it: an Accept (or an Undo or Redo that accepts a premise again) its premise write, and the premise write's step 4 its completion, next in the queue, ahead of any write queued meanwhile, so that the completion this step 4 enqueues starts from the `adopt` commit (one that becomes due later, after a decision or a crash replay, starts from the head it is written on: §2.9's note; builder 2d, carry-over R1-2). `recover()` enqueues every one still due, before anything else and completions first, once it has finished `inFlight` and computed the stage judgement (§3.11), so a crash between the Accept, the write and the completion loses nothing. Each due write checks at its step 1 that it is still due, and otherwise does nothing (a premise declined or already written meanwhile, a T proved meanwhile). A write that fails for another reason than a meaning mismatch (a Lean environment failure, a failed run.json write) leaves the stage the problem "“‹item›” was accepted, but telelean could not write it: ‹error›. Reload the window to try again, or decline it." In every case, the final check and the backstop refuse an accepted Add premise that is not written in F (§3.10, §4.10).
- **Taking a written premise out** (D2-71). A written premise stays in ws/ while it is accepted, declined Shaky, or to be redone without revert. Every action that gives it another status (a Reject, a cascade, back to review, the Undo of its Accept) takes it out in its own write, planned when that write starts (§2.6); so does the `judge-apply` write when reconcile returns it to review (reconcile lists it in `reverts`). In that write:
  - `planItemRevert` removes the card, its arrow and the mark removal, and the completion with them (§4.11);
  - the ledger's `premise`, `mark-removed` and `completion` entries for its key are dropped, so B.3 and ownership expect none of it; the stack action records them, with the card and the written key, so Undo puts them back with the files (§2.2);
  - (fixer 2b2 r1) when another written premise's arrow into the same card stays, `planItemRevert` leaves the mark removed, so the write moves the dropped `mark-removed` to that premise (the first written of them, in ledger order) instead, and Undo restores both; otherwise the follows_from removal would read as unowned;
  - the record's `card` is cleared and its `fingerprint` is the draft key again, so reconcile computes the item from its draft and finds no change (§3.5, AF1).

  A decline also makes T's Result to be redone, since it depends on the premise (RV-5), and takes it out with the rest (§3.6). Back to review returns T's accepted Result to review with it (RV-5's list); without the completion, the Result is then marked "updated". Un-reject of a premise merges nothing (§3.6).

### 3.9 Drift (ES-7; 2f)
- The session layer watches for changes:
  - it subscribes to `ModelWorkspace.onDidChange` (typing, saves, file-watcher and git events), debounced by 300 ms;
  - it also checks once after recovery, and right before Apply.

  Each time, it computes `baseDrift`, with open buffers first, so unsaved edits count.
- A change is persisted, with the time it was first seen (`drift.at`, AF9), and published. While drift is not empty:
  - Apply is disabled, with the drift text (§5.8);
  - steps go on;
  - nothing is merged, and the base commit is never rewritten.

### 3.10 The end (EN-1–EN-4; 2f)
1. **Opening.** Submit review with every item decided gives phase `confirming`, with the check `running`. `checkId` is a hash of F's files key and the item statuses.
2. **`engine.finalCheck(F)`:**
   - drift: listed, and it blocks Apply;
   - facts of exactly F: the judged facts when `judged.filesKey` equals F's and `judged.ok`; otherwise a fresh build;
   - `judgeState('final')` over every inference, plus B.2 for every proposition whose `.holds` or Dependencies differ between B and F;
   - the comparator for every proved inference on F's permitted set. A recorded pass is reused only for the same files key and the same permitted set (EN-2);
   - the items recomputed on F equal the accepted records (content key = accepted key; for a Result, also its verdict and Rests on), and nothing else differs;
   - every accepted Add premise is written in F: a ledger `premise` entry for its key, and its card in F. An unwritten draft keeps its draft key, which equals its accepted key, so the rule above alone would not see it (AF2);
   - the backstop (§4.10).
3. **After the check:**
   - passed: Apply is enabled, unless there is drift;
   - failed: the failures are listed, and Apply stays disabled.

   Back to review returns to the submitted stage, unsubmitted, with the session stack as it was before Submit (EN-2: "with nothing changed"; D2-54).
4. **Apply** (`endSession apply`, with the check id):
   - the check passed for the same id: no status or ws/ change since;
   - drift is checked again, and the backstop runs again (pure, never reused);
   - `planApply` is planAccept's no-merge path: exactly F (fixer 2b3b r1: the files of the commit the passed final check judged, which the caller passes). Real files that differ from B are refused, with `plan.drift` authoritative;
   - `apply` with M2's history kind `accept-proposal` (D2-67) and the label "Apply: Formalize for dependencies → ‹targets›" makes one history entry and one Undo step (UN-2). It includes `endorsements.json` and the layout positions of the cards moved on the Proposed view, which `applyChanges` accepts as the subject's two sidecars (§2.6);
   - the attempt records are written, with resolution accepted. **Provenance (§14 item 2 bullet 1: "History records where they came from"; coverage audit G1, AP-29):** the accepted-resolution record gains an optional `arrows?: { source: string; target: string; step: string; kind: 'arrow' | 'premise' }[]`, one entry for each accepted Add arrow and each accepted Add premise's arrow, with the step that proposed it. The attempt records live in the model folder's telelean data, so they outlive the run directory, which `pruneRunDirs` deletes. History's entry for the Apply shows them under "Arrows from Claude" (a line each: "‹source› → ‹target› (step ‹n›)"). An old record without `arrows` reads as none;
   - the run ends `accepted`, the stack is discarded, and the board unlocks.
5. **Nothing accepted:** no file changes, no history entry, no Undo step; the records are still written (D2-39).
6. **Exit**, after the board's confirmation (D2-36):
   - it stops a running step;
   - it writes the attempt records, with resolution discarded;
   - it ends the run `discarded`.

   The files are untouched, and decisions.json keeps the answers (EN-4).
7. **A reload during Apply:** the real files are compared with F (then it finishes as applied) and with B (then it goes back to confirming). Anything else gives a notice and drift. Nothing is re-applied blindly.

### 3.11 Reload (ES-6) and old runs
- **`recover()` reads run.json v2:**
  - outside a running step, it first finishes the write in flight: ws/ back to `head`, then `inFlight` again (§2.6);
  - it then computes the stage judgement again (below) and, in a stage, enqueues the premise writes and completions that are due (§3.8, AF2);
  - a step that was working or at the gate becomes interrupted. Resume uses `--resume` and the resume turn, never starts by itself, and the queue goes on after it. Cancel step ends it as cancelled: back to its S₀, the rest of the queue not run, and the stage opens (D2-55);
  - a queue found between two steps (a crash after one step ended), or right after its `queue-start` write (AF3), waits the same way: Resume starts the next step, and Cancel step drops the rest and opens the stage;
  - a judge that was running runs again;
  - a confirmation comes back, and its check runs again if it was running.
- **The stage judgement is not persisted** (D2-72, AF9). `recover()` computes it again, in every phase that has one, with `judgeState('stage')`, which is pure, on the judged commit's files with `judged-facts.json`, B and the records; that needs no Lean job. In a stage it then applies it through a `judge-apply` write, which changes nothing when nothing differs. During a queue and in `confirming` the records stay as they are (D2-63), and the judgement only feeds the view. When `judged-facts.json` does not match `judged.filesKey` (a crash between their writes), or, in a stage, the head has moved past `judged.commit` (a decision whose judge had not ended), the judge runs instead, with a build.
- **A v1 run in review is converted** (D2-16) into a session with one passed step:
  - its selection becomes the inference;
  - the ledger is written from the v1 run: `created` for every declaration new since B (its phase taken from the v1 freeze commit), and `premise` and `mark-removed` for adopted ghosts;
  - items are computed from its B to its ws/. Its pending ghosts become Add premise drafts, checked again as drafts (with E(T) and B.2), which gives them their facts;
  - an adopted ghost ("I hold this") becomes an Add premise item that is already written: its draft rebuilt from the v1 ghost, its `card` set, and its key the written item's, from the fresh judge. It is the one item in review whose content is in ws/ (§3.1). Its Accept offers only "as an axiom", since v1 wrote an AXIOM card, and writes nothing again; a decline takes it out, and so does back to review after its Accept (§3.8). It is not converted as accepted: its statement may rest on vocabulary still in review, and RV-5's defensive rule would send it back at once (D2-16, AF12);
  - a fresh judge runs, so the facts gain `typeConsts`;
  - everything else is in review, at stage 1, and its proposal is not used again.

  If the conversion fails, only Exit is offered.

### 3.12 The RunView of a session (2d)
- The runner sets `session`, `inferences` and `step` (with `statementsFixed`).
- `inferences`, `target` and `premises` follow the InferenceView's question rule (§2.3): while the results are hidden, each target's premises are the sources of the question its latest ended step asked, whether or not that step proved it. The runner fills them from the SessionView's InferenceViews, so the two never differ (AF5).
- `verdict` is never a proof outcome.
- `activity` and `notices` are empty arrays (M2's validator requires both), and gate attempts are left out, while a step runs and while the results are hidden (D2-10, AF9).
- `ghosts` stays empty. `frozen` is left out: its permitted summary lists what each source contributes, which tells earlier outcomes; `step.statementsFixed` says what the panel needs (D2-68).
- While a step runs, the run panel shows only telelean's progress ("Claude is working on “‹T›” (step 2 of 3): 14 tool calls · 3 checks") and Claude's questions. Progress ticks reach the webview through `run` only; `session` is posted only when the session changes (§2.4).
- **Renderings** (the pretty and fully explicit forms of statements) run as one scratch Lean job after each queue and each judge. They cover only the statement items whose content key is new, and are cached by content key in `renderings.json`. Results need none.

### 3.13 States
```
formalize ──▶ queue of steps ──(the last step ends)──▶ stage ──decide / reveal / undo──▶ stage   (decision commit → judging → stage)
step: working ⇄ waiting-for-answer ⇄ gate → passed (statements only too) | gave up (rollback ≥ S₀) ──▶ the queue's next step
step ──Cancel step / cap / failure──▶ stage (back to S₀; the rest of the queue not run; heading; Retry)
stage ──formalize (RV-9; results shown)──▶ queue ──▶ the same stage
stage ──Retry step──▶ queue ──▶ the same stage
stage ──submitReview──▶ every item accepted or rejected ? confirming : queue of Submit steps ──▶ stage + 1
confirming ──finalCheck──▶ passed ──Apply──▶ applying ──▶ ended (accepted)
confirming ──Back to review──▶ stage
any phase ──Exit (confirmed)──▶ ended (discarded)
step ──reload──▶ interrupted ──Resume──▶ step (the queue goes on)
interrupted ──Cancel step──▶ stage (step cancelled, back to S₀; the rest not run; Retry)
```


## 6.1 Tests for 2f (extract)

**2f:**
- **Provenance (AP-29, G1):** an Apply with two accepted Claude arrows and one accepted Add premise writes an attempt record whose `arrows` lists the three, with their steps; a declined arrow is not listed; nothing accepted writes none; History's entry shows "Arrows from Claude"; an old record without `arrows` still loads.
- **Add premise:**
  - as an axiom: the card, the arrow and the mark removal are written at once, `writePremise`'s key is recorded as the accepted one, the completion passes, and the Result is updated;
  - as pending: a PROPOSITION with `axiom P.holds`; its own Accept is required;
  - a failed completion is taken back out (ws/ returns to the write's parent, the head the completion was written on: the adopt commit when it runs right after its premise write, as a `revert` commit), with the marker, and Retry step runs a `submit` step for T with `openProof` (F15); a meaning mismatch sends it back to review, with the write removed; a premise write whose judgement's probe failed (fake engine) is taken back out, the item stays accepted with its draft key in `fingerprint` and `accepted.fingerprint`, the stage problem names the probe's cause, and once the probe works again a reload's due write records the written key, with no "updated" item and no dependent back in review (AP30-4);
  - a second premise is unused; declining an accepted premise takes everything out, and the Result becomes to be redone;
  - hidden while the results are;
  - accepted as pending, with a crash injected before the write: after recovery the write gives a PROPOSITION card with `axiom P.holds`, and the Why the user gave;
  - due writes (AF2): a crash after the Accept's run.json write, before the premise write's step 1, and a crash after the premise write's step 4, before the completion's step 1: after recovery the write and the completion run; an Accept undone while its premise write still waits in the queue writes nothing;
  - taking out (AF2): Undo of a written premise's Accept, and back to review after it, take out the card, the arrow, the mark removal and the completion, drop their ledger entries, and leave the item in review with its draft key; later judged states pass B.3; Redo writes it again; Undo of a Reject that took a written premise out puts it back, ledger entries included;
  - the final check and the backstop refuse an accepted Add premise whose write never ran (AF2);
  - gates (AF3): a mid-stage Formalize, Submit review and Retry step wait while a premise write or its completion is queued or running, and a queue started after them begins at their last commit;
  - an accepted premise stays accepted after its write and its completion, and Apply passes the backstop's `content-changed`;
  - a draft that no longer closes the gap after a source's Formalize is rejected becomes to be redone, with its marker.
- **Apply:**
  - a spy shows `applyChanges` called exactly once, at Apply, with exactly F's files and the two sidecars, across the session, review and apply tests;
  - one history entry, of kind `accept-proposal` with the Apply label (D2-67), and one Undo step; Undo restores B, removes the endorsements and puts the moved cards back;
  - `applyChanges` still refuses any other file that is not a model file;
  - Back to review leaves the session stack as it was before Submit.
- **Drift:**
  - a hand edit sets drift at once, and undoing it clears it; Apply is refused meanwhile;
  - files changing between the check and Apply: refused, nothing applied;
  - the base commit id stays the same through the session.
- **Final check and backstop:**
  - a stale checkId is refused;
  - a tampered ws/ is refused by the backstop although the file checks were reused;
  - the backstop runs on every Apply (spy);
  - the comparator is reused only for identical files and permitted set.
- **Exit and records:**
  - Exit writes no model file;
  - attempt records are written only at the end: `graph.attempts` carries no verdict of an open session.
- **Endorsements:** written in the Apply's history entry with `endorsementHash`; ModelWorkspace reads them, so core stops flagging; a changed text flags again; Undo of the Apply makes the flag return.
- An empty Apply only records; an interrupted Apply on reload compares with F and B.
- **Host routing:** `endSession` and `moveProposed`; `endSession` with `exit` reaches the manager, and stops the step, while another run message waits in the host's run queue (AF14).


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


## 8. Change log (extract: the 13 of 33 entries that mention 2f)

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
- **orchestrator, 2026-11-19 (AP-29, spec coverage audit):** a read-only audit mapped 873 requirements of spec v4.1 to the code and the slice-1/2/3 plans and confirmed 15 gaps (report: `verbatim_prompt_log/bundle_21/subagent_reports/spec_coverage_audit/coverage_audit.md`). For slice 2: G2 → §4.12 check 6 (any hand-drawn cycle in the subject blocks Formalize; 2b2), G1 → §3.10 step 4 (`arrows?` provenance on the accepted attempt record, shown in History; 2f), and a new sub-slice **2i** (§1, §1.1, §6.1) for built code: the card-only Delete removed (S9), an old axiom's premises named (A19), the guide's placement text corrected. The slice-3 gaps go into the slice-3 plan; G9–G13 are logged as decisions in AP-29.
- **plan fixer, 2026-11-20 (AP-30's review of the isolated probe: AP30-1–AP30-6).** Plan text only; the slice-3 plan gets the matching changes.
  - **AP30-1 (major; fixed):** G0 refused `initialize` but not the `init` attribute it expands to, and on the pinned 4.35 every `lean` process that imports a module runs its `[init]` IO (downstream builds, the check job, the ghost and render scratch files, with `<shadow>/.lake` writable), so Claude's code could rewrite the `.olean` files the probe job loads or inject JSON messages into the check's output; the isolated probe ran no model code only because of `importModules`' defaults. 2b2: G0 refuses an attribute named `init` or `builtin_init` in any attribute list (`metaprogramming`), the identifier `init` staying allowed elsewhere; the probe file writes `(loadExts := false) (level := .private)` out. §1.1 (2b2, 2b3a), §2.1 ("No Claude code runs at import", the outline), §6.1 (2b2; 2b3a's new overlay `probe-init`), §7.4, D2-75.
  - **AP30-2 (minor; fixed):** a probe that fails on B fails every state of its session. `checkBase` now answers `environment` with `probeFailure`'s sentence and "Claude's work on this model cannot be checked." (still writing base-facts.json), so the start refuses before anything is sent to Claude. Adapted: `environment`, not the finding's "problem", because the start's text for problems says "your files have Lean errors … fix or save them", which is wrong for a probe failure, while the environment notice says nothing was sent to Claude. The size cause is logged, not removed: 2b3a measures the model size at which the probe's message reaches the 32 MB cap, and D2-75 states the limit and how to lift it. §1.1 (2b3a), §2.1 (the start sub-bullet, Compared approximately, Cost), §6.1 (2b3a), D2-75.
  - **AP30-3 (minor; fixed):** 2b3b carries §2.1's failed-probe rule onto the session path: check, freeze and gate with `CheckContext.session` decide on `stepFindings` (an `environment` outcome when they are empty or only `source-only`), never on `ok` alone. §1.1 (2b3b), §2.9 (SessionCheckContext), §6.1 (2b3a's gate-not-proved; 2b3b's four session cases).
  - **AP30-4 (minor; fixed, slice-2 half):** a premise write whose judgement's probe failed fails like a Lean environment failure (taken back out, item still accepted and due, the stage problem naming the cause), so step 4 never records a `factsMissing` key. §1.1 (2b3b), §2.9 (`writePremise`), §3.8, §6.1 (2b3b, 2f).
  - **AP30-5 (nit; fixed, slice-2 half):** in a stage whose probe failed, an Accept of a declaration item is refused with `probeFailure`'s sentence and "Decline what caused it, or Exit." (new `ItemClass.probeFailure`, `REVIEW_TEXTS.acceptProbeFailed`, 2b2), not ADV-3's "its file did not build. Wait for the check to finish."; `probeFailure`'s contract says it is undefined for `ok` and the sandbox's four statuses. §1.1 (2b2), §2.1, §2.2, §6.1 (2b2).
  - **AP30-6 (nit; fixed, slice-2 half):** D2-75's reverse names 3p's meaning walk (reverse D3-52 too, or keep the probe job for it); the ghost check's residual is stated as D2-75's own, without the circular pointer to D3-52. §2.1, D2-75.
- 2026-11-20 (fixer 2b2 r1: the review of builder 2b2). Core, the extension's and core's doc comments for check 6, the user guide's two Formalize lines, and this plan.
  - **A Result whose T.holds moved could not be taken out (S-V2B2-S1, C-V2B2-C1, A-V2B2-ADV-2, major; fixed in the revert):** the step limits open the target's `.holds` under `openProof`, its place included, so a step may rewrite B's `axiom T.holds` (or the person's proof) below a later declaration; computeItems gives the moved T.holds to the Result, and `planItemRevert` refused every moved declaration (`unsafe`), so a Reject, a cascade, the judge's reverts and Submit's take-out of that Result all failed. Now a declaration B has that the state moved goes from where it is and B's text goes back in B's place (`baseDeclPlace`, items.ts: right after the nearest unit before it in B that the comparison keeps in place, else right before the nearest kept unit after it, replacing the whitespace there with B's own around it); a `.holds` the state lacks goes back the same way (it went right after its statement, which need not be B's place). The check refuses a result in which what went back is not in B's place or anything else moved; an anonymous instance that moved is still refused. This replaces builder 2b2's "a moved declaration (`unsafe`)" and "a `.holds` the state lacks put back right after its statement". (Fixer 2b2 r2, R1-2: two that go back next to the same unit were still refused; see that entry below.)
    - **fixer 2b2 r1 decided:** the revert handles the move, rather than the step limits refusing it. Lean needs a source's `.holds` declared before a proof uses it, so a pending target placed above a source declared later can only be proved below that source; slice 1 allows it, the plan's step limits open the `.holds`'s place, and §4.11 asks the take-out for "T.holds as in B" whatever the step did. *(Alternative: the reviews' preferred fix, the move check applied to the target's `.holds` under `openProof` too, which would make such a Formalize fail.)*
  - **The mark with two written premises (C-V2B2-C2, minor; A-V2B2-ADV-3, major; fixed):** taking out the written premise whose ledger `mark-removed` removed T's mark put `follows_from: nothing` back while a second written premise's arrow into T stayed (TL023, which the parser resolves by dropping the mark). Now the mark comes back only when no arrow into the card stays, and the revert's check refuses a card it edits that ends with both the mark and arrows (read from the lines, since the parser drops such a mark). **fixer 2b2 r1 decided:** the take-out write then moves the dropped `mark-removed` to the remaining written premise (§3.8, for 2f), so the removal stays owned. *(Alternative: computeItems and the backstop count a `follows_from` removal as owned by any written ledger premise of the card.)*
  - **A completion taken out after a rework (A-V2B2-ADV-1, major; fixed):** a premise's take-out put T.holds back as in B whenever the ledger had its `completion`, also after a later step reworked T.holds without the premise, silently removing a proof that did not depend on it (and the person's Accept with it). **fixer 2b2 r1 decided:** T.holds goes with the premise only while it still rests on it: its `uses` closure reaches a declaration the premise provides, or, without complete facts, its text names one (the completion's term names the premise's `.holds`); a card with no `.holds` gets B's back as before. The ledger entry's lifetime is unchanged. *(Alternatives: record the completion's text on the ledger entry and compare; drop the `completion` entry when a later step changes T.holds, which would make a completion due again once that rework is taken out.)*
  - **S₀'s comments re-attached by a step (A-V2B2-ADV-4, minor; fixed):** R2-1 judged only the comment lines a step adds, so a lemma written between an earlier step's comment and the definition it describes, a lemma written below such a definition's trailing comment, or a Submit step that removed its opened lemma and left the lemma's comment changed a frozen item's content key unseen (an accepted item back in review, "updated", with its accepted dependents). **fixer 2b2 r1 decided:** a general rule rather than a comment rule: at step purposes, when no other rule spoke (after the `unowned` rule), every item of S₀ the scope does not open (its `openItems`; under `openProof` the target's Result, its own rules') keeps its content key, or it is a finding `existing-changed`, token `session` (the board's sentence: "it changed ‹names›, which an earlier step proposed and you are reviewing"), naming its declarations, with `CLAUDE_SESSION_TEXTS.frozenItemChanged` for Claude; skipped for an item whose facts are missing in either state (a failed probe stays the engine's `environment` outcome, §2.1), and altogether when S₀'s facts and the judged state's come from different probes (one with the marker, one without), whose keys differ by the facts alone. The R2-1 line above is annotated. *(Alternative: compare only the S₀ comments' attachments, with token `comment`.)* (Fixer 2b2 r2, R1-1: not for a premise draft that is not written, whose item is the draft itself; see that entry below.)
  - **The probe's detail while the results are hidden (A-V2B2-ADV-7, minor; fixed):** Lean's error in a failed probe's detail can name or quote hidden proof material, and it reached the Accept refusals of listed items and the stage's `facts` problem. `probeFailure` gains `{ detail: false }` (additive): "the probe failed." without the error. **fixer 2b2 r1 decided:** the stage's `facts` problem never carries the detail (the judge cannot tell whether the results are shown), and `classesBeforeReveal`, the map in force while they are hidden, gives the sentence without it, so the reducer's Accept refusal says the cause only; `classes` (shown) and the backstop at Apply keep the detail. Whether the probe fails at all can depend on hidden content: added to §4.7's accepted residuals. *(Alternatives: keep the detail in the problem and have 2c2 mask it while hidden; have 2b3a keep declaration names out of the detail.)*
  - **`holdAs`'s default (S-V2B2-S2, minor; fixed by hand-off):** kept optional for M2's `adoptGhost` until 2h retires it; §1.1's 2h entry now makes it required then, with a test, and says 2f's premise write passes the record's `accepted.holdAs`. *(Alternative: a session entry point that requires it now.)*
  - **Check 6 and a self-arrow (S-V2B2-S4, nit; fixed):** `subjectCycle` counts a proposition that lists itself in `premises:` (TL015) as the cycle `[x, x]`, first in the board's order like any other (an old axiom's self-premise is not drawn, A19); slice 1's `arrowCycleThrough` is unchanged. §4.12.
  - **Stale docs (S-V2B2-S3, C-V2B2-C3, nits; fixed):** the user guide's Context Menu line and start-check list name the subject-wide check and its text; the host's `startRun` and the protocol's `StartRunMessage` doc comments say "no cycle of arrows anywhere in the subject".
  - **A test name (C-V2B2-C4, nit; fixed):** "at the stage and the end nothing changes" now judges `final` too.
  - **Tests the reviews asked for (A-V2B2-ADV-5, A-V2B2-ADV-6, minor; fixed):** the backstop passes a rejected Result whose T.holds is B's again beside accepted items (the `asInBase` filter), and refuses (`b2`) a proof that uses a source its recorded question still lists but whose arrow is in neither B nor F (D2-59).
  - **Contracts (additive):** `probeFailure(facts, options?)`; core's `baseDeclPlace` (items.ts) and `CLAUDE_SESSION_TEXTS.frozenItemChanged`. No §2.9 signature changed.
  - **Tests** (core 72 files, 991 tests; was 980): `test/review/revert.test.ts` +4 and 1 replaced (the moved vocabulary declaration, refused before, now goes back in B's place, in the new tests; in its place, an instance without a name that moved is refused): T.holds moved below later content (the person's proof replaced, with a lemma and comments, moved unchanged, a pending claim proved, a `.holds` the state lacks put back away from its statement), B's place before and after (first in its file), two written premises into a marked target, a premise's completion after a rework (by its closure, through a lemma, by its text without facts); `judge.test.ts` +4 (A1, A2, A3 and the closed-proof Result, with an opened item, a failed probe and facts from two probes) and 1 extended (C4); `backstop.test.ts` +2; `formalize.test.ts` +1 (the self-arrow); `probe.test.ts` 3 updated (the detail rule: `probeFailure`'s option, the problem and both class maps, the reducer while hidden and shown). No test was deleted, skipped or moved.
  - **Mutation checks:** 34, each run against the final code and restored byte for byte (`cmp`); 30 fail at least one test. Four are defensive halves that the rules before them make unreachable, so no test can fail without breaking those first: the revert check's "not in B's place" (the placement puts it there) and "both the mark and arrows" (breaking the mark rule instead fails in that very check: "would both follow from nothing and have arrows"); the frozen-items rule's lost item (every reachable loss of a frozen item is another rule's finding first) and its skip of an item whose facts are missing only in the judged state (a module that did not build, which the build rule reports first; a failed probe, which the probe guard skips).

- 2026-11-20 (builder 2c1: the base mask, the build's mask option and endorsements, `endorsementHash`, the protocol messages; with the carry-overs AP30-1 r3 and 2b2's review R2-1). Core, one `default` of the extension host with its routing test (the host decision below), and this plan. `baseMask` and `maskFacts` replace their stubs; `review/index.ts` is unchanged.
  - **AP30-1 r3 (carry-over): found done** by builder 2b2 (its entry above: `eraseMacroScopes`, `isHygienicName`, the `init` list judged as a whole; §6.1's hygienic-name tests in `test/gate/g0.test.ts`). Mutations run again here, each failing a test: the hygienic-name rule dropped (the `macro.«_@».x._hyg` case), the comparison without `eraseMacroScopes` (the `init.«_@».x._hyg` cases), the list judged line by line (the whole-list test), a `«_@»` component alone not hygienic (the `a.«_@».b` cases).
  - **R2-1 of 2b2's review (minor; fixed as the brief says):** `planItemRevert` step 2 ends a run where B's declaration text ends in what went in (`newText.indexOf` of B's `DeclEntry.text` in the file's line breaks, its trailing spaces included; `trimEnd()` only as a fallback), for both sides; `follows` requires the same side, path and offset; after a unit the next place starts at the run's end as before, and before a unit it starts at the run's end instead of walking back over whitespace (which ate the previous declaration's trailing spaces). §4.11 and fixer 2b2 r2's entry reworded. Tests (`revert.test.ts` +3): both layouts with trailing spaces, tabs and both, each also alone; CRLF; three in a row; R1-2's two pending claims with the first ending in spaces. Mutations: the file as before the fix, the run's end at `trimEnd()`, and the walk back restored each fail them; dropping the side from `follows` is equivalent (an `after` offset is a kept unit's end and a `before` one the first kept unit's start, and every `before` place of a file precedes every `after` one in B's order, so the two never meet at one offset).
  - **Where things live.** `review/mask.ts`: `baseMask`, `maskFacts`, and (additive, imported by path, §2.9's note) `projectMaskOf` (the build's form, `ProjectMask`) and `maskedModel` (the masked project 2c2's `buildSessionView` builds the hidden graph from). `project/types.ts`: `ProjectMask`, `ProjectInput.mask`, `ProjectInput.endorsements`. `project/build.ts`: `maskFiles`, `maskedCode`, and `codeJoint` (exported: B's joined stretch). `paths.ts`: `endorsementsPath`, `Endorsement`, `EndorsementsFile`, `endorsementHash`, `parseEndorsements`, `serializeEndorsements`. `protocol.ts`: `SessionMessage`, the ten messages, `SESSION_MESSAGE_TYPES` (RUN_MESSAGE_TYPES ends with it), the new LIMITS.
  - **Contracts (additive):** `BaseMask.restoreMarks` (§2.9 shows it): `dropNodes`' "mark removals" as data, since the build cannot read the ledger. `ProjectMask` holds the plan's `absent`, `codeOverride`, `drop`, `dropArrows`, `dropNodes`, plus `restoreMarks`, `derivedIds` and `codeOverride.joined` (the decisions on a target's code and on derived ids, below). No §2.9 signature changed.
  - **builder 2c1 decided (the build's form of the mask):** the build reads the working copy's texts and positions: a left-out declaration (`drop`, `absent`) is removed from the build's view of its file (no binding, vocabulary item, code piece, users text scan or markup diagnostic of it; a `mutual` whose named declarations all go, with them), a written premise card's block before ids are assigned, Claude's and the written premises' arrows from `premises:`; `maskFacts`' facts are the input's. *(Alternative: rewrite the texts, the hidden declarations out and B's `.holds` in, and re-position the facts.)*
  - **builder 2c1 decided (a target's code):** composed as B's: the working copy's statement (B's, the step limits keep it), B's `.holds` text, joined as B joined them (`codeOverride.joined`: B's text between them when B's code held both as one stretch; else two pieces); its refs from B's DeclFacts, which `maskFacts` keeps at B's positions (in the working copy's file) and the build places against B's range; B's messages for it at the start of the working copy's declaration. So a lemma written between the target's statement and its `.holds`, or a `.holds` moved, never shows in the code. *(Alternative: the working copy's layout around B's text, which shows where proof material was written.)* *Amended by fixer 2c1 r1 (S-V2C1-S2, S-V2C1-S4): the `.holds` also reads with B's keyword, and B's messages for it go to the start of the target's statement.*
  - **builder 2c1 decided (other cards' code):** a card whose statement and `.holds` would be one stretch but for left-out declarations or blocks between them is one stretch without them, as LeanOps' removal (`deletionEdit`) leaves the text, its `.holds` refs moved up by the lines removed. *(Alternative: the working copy's two pieces, which tell that something hidden sits there.)* *Superseded by fixer 2c1 r1 (C-V2C1-C3): a card with B's statement and `.holds` texts is composed in B's layout (`codeLayout`); only a card new in the session is composed this way, its hidden declarations taken out with the lines that go with them, merged (C5).*
  - **builder 2c1 decided (`baseMask`'s lists):** `drop` reads each name's first `created` entry and never takes a name B has; `dropArrows` leaves out an arrow B draws; `dropNodes` a card B has; `restoreMarks` takes only cards B marked; each sorted, once each; `holds` without a prototype. A target's B `.holds` always wins over `drop` (`maskedNames`). *(Alternative: every ledger entry as it is.)*
  - **builder 2c1 decided (a written premise card's declarations):** what the card owns (`ownerOfDecl`: its statement, `.holds` and any other pin). *(Alternative: its statement's and `.holds`' names, which would hide another card's statement a premise card were bound to (TL017).)*
  - **builder 2c1 decided (`maskFacts`' details):** a name only Lean reports goes with its parent (the facts' `parent`, else the declaration whose range holds it, else the longest name prefix: computeItems' rule); a message is a declaration's when its start lies in the declaration's syntactic range; B's messages of a same-text declaration move by the line offset (and the first line's column), into the working copy's file; the working copy's envelope stays, `check.probed` counts the masked declarations; a state without facts is refused (`invalid`), and `maskedModel` builds it without facts, masked. *(Alternatives: keep the working copy's count; return empty facts.)*
  - **builder 2c1 decided (derived ids):** a card into which only hidden writes went (Claude's arrow, a written premise, its mark removal) and whose `id:` line telelean wrote back over B's derived id reads as derived again, with the parser's TL112 (`ProjectMask.derivedIds`), unless its `lean:` pins changed too (a visible write). *(Alternative: show the written id, so a hidden arrow into a derived-id card removes its TL112.)* *Amended by fixer 2c1 r1 (S-V2C1-S5): every card whose id was written back over B's derived id while its pins stayed B's, a hidden write current or taken out.*
  - **builder 2c1 decided (a new file of proof material):** a file B lacks, with no block, all of whose declarations the mask leaves out, is left out of the masked build whole (its TL118 would tell). *(Alternative: keep it, empty.)*
  - **builder 2c1 decided (freshness):** `maskedModel` keeps the working copy's: a fresh file gets its module's hash, any other one that differs (a module the facts call `stale` whose file still hashes the same would lose message attachment; no judged state is like that). *(Alternative: a file-hashes input.)*
  - **builder 2c1 decided (a block next to a left-out declaration):** bound adjacently to one, it is code-less; its gap declaration is re-indexed, or dropped when left out; the parser's TL013 hint that B had is not re-derived (the working copy changed a card's binding: a card change the step limits refuse, so no stage holds it). *(Alternative: re-parse.)* *Superseded by fixer 2c1 r1 (S-V2C1-S1, C-V2C1-C2): the alternative, re-parse; a pinned block was unbound and hints about hidden declarations stayed.*
  - **builder 2c1 decided (endorsements):** `endorsementHash(text)` is SHA-256 of the declaration's source text as core's scanner spans it (`VocabItem.code`, `DeclEntry.text`: docstring and attributes, no comment line around it), whitespace collapsed, as content keys compare texts; the build takes each subject's entries (`{ name, textHash }`) and counts a definition endorsed only by its own subject's; a card needs endorsement while any definition it uses does; `parseEndorsements` (lenient, failing closed) and `serializeEndorsements` (sorted by name and hash) sit in `paths.ts`, since 2f changes no core file. *(Alternatives: the exact text; one list for all subjects.)*
  - **builder 2c1 decided (protocol details):** `requestId` optional on each, as on every message; `stage` 0 to LIMITS.stages; a decision's `rev` and an Undo's or Redo's `step` 0 to LIMITS.revision; item ids and the check id are host tokens (RUN_TOKEN_PATTERN); `note` kept as typed unless blank; `rationale` trimmed, one line, dropped when blank; `endSession` `back` refuses a check and `exit` a stage or a check; `revealResult` refuses `raw-diff` (the diff's own `confirmed` counts as it). *(Alternative: a required `requestId`.)*
  - **builder 2c1 decided (the host, pulled forward from 2c2):** with the session messages in RUN_MESSAGE_TYPES the host's `dispatchRun` was no longer exhaustive (tsc TS2366), so it gains a `default` answering `not-yet` with `REVIEW_TEXTS.notBuiltYet` ("Not built yet (slice 2)"), §1.1's 2c2 answer (*fixer 2c1 r1, C-V2C1-C6: ten explicit case labels instead of the `default`, so the switch stays exhaustive*); the extension's routing test covers it (each session message answered `not-yet`, no RunManager call). 2c2's host bullet keeps what remains. *(Alternative: keep the session messages out of RUN_MESSAGE_TYPES until 2c2, against §2.4.)*
  - **Tests:** new `test/review/mask.test.ts` (28: baseMask's lists and boundaries; the proved and not-proved outcomes alike under the mask; Used by and the target's code, B's or none; Claude's arrows, proof-phase definitions, vocabulary and an unmarked axiom dropped; a written premise card with its arrow, mark and messages, as an axiom and pending, and one with two pins; old facts without typeConsts; messages; AF6's positions with a hidden lemma above a card and an anonymous instance, and a working-copy message B did not have; a lemma inside another card's code, tight and spaced; two pieces, an indented `.holds`, a stray ref; derived ids; a new file of lemmas and a `mutual`; an empty mask; maskFacts without facts, B without facts, its order, facts-only children, a changed declaration, freshness; a hidden lemma next to a block; a mark the arrows outweigh), `test/project/endorsements.test.ts` (7), `test/protocol.session.test.ts` (15); `test/review/revert.test.ts` +3 (R2-1); `test/protocol.m2.test.ts` updated (RUN_MESSAGE_TYPES has 21 entries, M2's eleven first); extension `test/unit/runRouting.test.ts` updated (the routed set plus SESSION_MESSAGE_TYPES) and +1 (`not-yet`). No test was deleted, skipped or moved.
  - **Mutation checks:** 8 on the carry-overs (7 fail tests, R2-1's side condition is equivalent, above) and 98 on 2c1's rules, each restored byte for byte (`cmp`), all failing at least one test. The first run's six survivors were fixed: two redundant paths to a premise card's declarations (one kept: what it owns), a working-copy message identical to B's that the build de-duplicates (a test with one B did not have), a mark guard the node rule repeats (removed), refs outside their declaration (a test), and endorsement format cases with empty lists (a test with entries).
  - **Verification:** tsc clean for core and runner (tsconfig.test.json), webview (tsconfig.json, tsconfig.node.json) and extension; vitest core 1050 (75 files; was 997), webview 314, extension 204 (`--no-cache`); the runner files the core change reaches, with real Lean: `workspace/arrows` 7, `scan` 7, `realcore` 4, `refresh` 13, `perform` 8, `integration/fixes` 5, `session` 8, `m2flow` 5, `semantic/valueProbe` 2, `run/manager.gate` 8, `gate/engine` 30, all passed. No webview file changed, so no scratch build and no Playwright.

- 2026-11-20 (fixer 2c1 r1: the review of 2c1, three reviewers, findings S-V2C1-S1 to S6, C-V2C1-C1 to C6, A-ADV-1 to 6; all fixed). Core (`review/mask.ts`, `project/build.ts`, `project/types.ts`), the host's `dispatchRun`, `test/review/mask.test.ts`, and this plan (§2.9, §4.7, §6.1, the builder's entry above).
  - **A card's statement is never hidden (A-ADV-1, blocker; fixed).** A step that formalised statements and ended not proved without `freeze_statements` records its new declarations as `proof` (D2-43), so the mask hid the statement of a card computeItems lists as a visible Formalize item (`card:<c>`), and the board told the outcome. **fixer 2c1 r1 decided:** `maskedNames` leaves a name of `BaseMask.drop` out only when no card of the working copy binds it (its statement, an AXIOM card's `.holds`, a pin: `ownerOfDecl`); a written premise card's names still go with it, and a target's `.holds` stays covered by `holds`. `baseMask` is unchanged. *(Alternative: amend D2-43 for 2d so that a name bound to a card is always recorded as `statements`; the mask would still have to agree with computeItems' ownership.)* *Completed by fixer 2c1 r2 (R1-1): the definitions such a statement uses are kept too, since the gate now judges a card's statement as a statement whatever phase wrote it.*
  - **Bindings and hints read as the parser reads the file without what is left out (S-V2C1-S1, C-V2C1-C1, A-ADV-2, blockers; C-V2C1-C2, A-ADV-3, majors; fixed).** A hidden lemma right below a pinned card's block unbound the card (the build reset every binding whose adjacent declaration was left out, pinned ones included): the target or a source showed informal, its statement and `.holds` became vocabulary, the `.holds` a hidden assumption (TL104) whose code was the proof. And TL013/TL014, which sit on a block's marker, kept naming or describing a hidden declaration. **fixer 2c1 r1 decided:** `maskFiles` re-parses each file that loses anything (`withoutSpans`: LeanOps' removal of each left-out declaration, block and line, merged) and takes each kept block's binding and its TL013/TL014 hints from that parse, so a pinned block stays pinned, an adjacent one reads what follows it then, and B's own hint comes back; when that text does not read as the same blocks and declarations, it fails safe: indices re-indexed, an adjacent binding to a left-out declaration code-less, a pinned one kept, and every hint about a left-out declaration dropped. The builder's decision "a block next to a left-out declaration" is superseded (its entry says so). *(Alternative: only the fail-safe path, which drops a hint about a hidden declaration but cannot bring back the hint B had about the visible one after it.)* *Amended by fixer 2c1 r2 (R1-2): the twin text also leaves out each target's `.holds` under `codeOverride`, and is read in every file that holds one.*
  - **Another card's code is B's (C-V2C1-C3, S-V2C1-S3, A-ADV-4, majors; C-V2C1-C5, minor; fixed).** Composing another card's code without the hidden declarations alone kept the comment written with a hidden lemma, extra blank lines, and a namespace around it (two pieces where B had one); a hidden `mutual`'s stale span also deleted the person's own text after it. **fixer 2c1 r1 decided:** `projectMaskOf` records B's layout (`ProjectMask.codeLayout`, B's joint or two pieces) for every other card the working copy has with B's statement and `.holds` texts, and the build composes such a card from the working copy's texts in that layout, whatever lies between them in the working copy (a hidden lemma, its comment or blank lines, a target's `.holds` moved there, or a blank line the step added, which no item owns); a card new in the session is composed from the working copy's text with its left-out declarations, and a target's `.holds` the step put there, taken out together with the lines that go with them (`ProjectMask.lines`: the comment lines attached to a left-out declaration or to a target's `.holds` shown as B's, whose comment is its Result's, and the enclosing lines around such declarations only, by `compareTexts`), merged (`mergeSpans`: overlapping spans and spans apart by whitespace only are one deletion, as planItemRevert's step 3 takes lines out). Residual (accepted, §4.7's kind): around a hidden lemma inside the code of a card new in the session, the working copy's text cannot tell which blank lines came with the lemma (the same text arises from a tight statement with a spaced lemma and from a spaced statement with a tight one), so they stay as LeanOps' removal leaves them; B cannot say either, since the card is new. *(Superseded by fixer 2c1 r2, R1-3: such a card's code drops every blank line between its statement and its `.holds`, so the residual is gone.)* A composed piece's refs now move by the column where it starts (`CodeDecl.column`), which equals B's own build for joined, apart and indented `.holds`. The builder's decision "other cards' code" is superseded. *(Alternative: B's layout only when something hidden sits between the statement and the `.holds`.)*
  - **A target's `.holds` keeps B's kind (S-V2C1-S2, major; fixed).** The build fell back to the working copy's keyword (`theorem`) wherever facts did not decide the `.holds`' kind (no facts, B without facts, an unchecked module, a stale file through `kindsAgree`), so the hidden board showed the target `not-checked` with a theorem instead of pending. **fixer 2c1 r1 decided:** `codeOverride` carries B's keyword, and `maskFiles` reads the overridden declaration with it, so `holdsKind`'s fallback and the facts index's stale match read B's kind. *(Alternative: give the build B's kind through the facts only, which cannot cover a state without facts.)*
  - **B's messages for a target's `.holds` go to its statement (S-V2C1-S4, minor; fixed):** at the start of the target's statement in the working copy (the `.holds`' start if the working copy lacks that statement), so they attach to the same card and keep the twin's order among the other diagnostics wherever the step moved the `.holds`. §2.9's `maskFacts` bullet and §4.7 amended. *(Alternative: B's position moved by the line offset of the statement.)*
  - **Derived ids (S-V2C1-S5, minor; fixed):** `derivedIds` restores B's derived id for every card whose block wrote an id over B's derived id while its `lean:` pins stayed B's, not only for the cards a current hidden write touches: a premise written and taken out leaves the written id (the revert restores the fields it wrote, not the id), and only a hidden write, current or taken out, writes such an id in slice 2. The builder's decision on derived ids is amended. *(Alternative: also restore the id when a written premise is taken out, in planItemRevert.)*
  - **The masked board's other inputs (S-V2C1-S6, C-V2C1-C4, A-ADV-5, minors; fixed):** `maskedModel` takes optional `endorsements` and `lakefile` and passes them to the build, since a ProjectModel keeps neither; 2c2 passes the ones the working copy's board was built with (§2.9's note). *(Alternative: keep them on ProjectModel.)*
  - **No `detail` in the masked facts (A-ADV-6, nit; fixed):** `maskFacts` drops the envelope's, `build`'s, `check`'s and `probe`'s `detail` (Lean's own words, which can quote hidden proof material; `probeFailure` of masked facts gives the sentence without it). *(Alternative: keep only `probe.status`.)*
  - **The host's `not-yet` (C-V2C1-C6, nit; fixed):** `dispatchRun` names the ten SESSION_MESSAGE_TYPES as case labels instead of a `default`, so a run message nobody routes fails to compile again (TS2366, checked by removing one label); 2d–2f take their labels out as they route them. *(Alternative: keep the `default`.)*
  - **Contracts (additive):** `ProjectMask.codeLayout`, `ProjectMask.lines`, `codeOverride[name].keyword` (required, since `projectMaskOf` is its only maker); `maskedModel`'s optional `endorsements` and `lakefile`. No §2.9 signature of `baseMask` or `maskFacts` changed.
  - **Tests** (`test/review/mask.test.ts`, 28 → 41): new: a source and a code-less target formalised without a freeze; a hidden lemma or anonymous instance below a pinned card's block (the target, another card); hints below a code-less card (a lemma after a blank line, an anonymous instance, a `mutual`; B's hint back, also around a namespace); failing safe on a hand-made mask whose text does not parse alike; B's layout only for B's texts; a target's `.holds` moved into another card's code, B's or new in the session; a card new in the session (a comment with and without a blank line, a hidden `mutual` before its own note), and a hidden `mutual` before the person's own note in a card B has; the target's kind in four states without deciding facts; B's message order for a moved `.holds`; derived ids with a hidden write left or taken out; endorsements and lakefile; no `detail`. Rewritten: a hidden lemma inside another card's code (oracle: the not-proved twin, five layouts), the empty mask (the new fields, B's layout composed byte for byte, apart and indented too), and the adjacent block (now a hand-made mask, since a card's own statement is never dropped). No test was deleted, skipped or moved.
  - **Mutation checks:** 34 on the fixes, each restored byte for byte (`cmp`), each failing at least one test (the list: the fixer's report), and one compile check (a session label removed fails the extension's tsc with TS2366).
  - **Verification:** tsc clean for core and runner (tsconfig.test.json), webview (tsconfig.json, tsconfig.node.json) and extension; vitest core 1063 (75 files; was 1050), webview 314, extension 204 (`--no-cache`). No runner file changed and no runner source reaches the masked build (`ProjectInput.mask`), so no runner test file is touched; the runner's `test/gate/pure.test.ts` and `test/gate/rules.test.ts` passed as a smoke run (40).

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
- 2026-11-20 (builder 2b3b: the runner engine; with the carry-over R1-1 of 2b3a's review). Runner only (`gate/engine.ts`, `types.ts`, `index.ts`, `scratch.ts`, the new `gate/session.ts`; `shadow/types.ts`, `workspace.ts`; `proposal/service.ts`, `types.ts`), the test fakes that implement those contracts (runner `test/run/helpers/fakeEngine.ts`, `fakeServices.ts`, `fakeShadow.ts`, `test/proposal/helpers.ts`; extension `test/unit/realRuns.test.ts`), and this plan (§2.9's note, this entry). No core source, no webview file.
  - **Contracts (additive; §2.9's note lists them):** `CheckContext.session` and `SessionCheckContext` as written; `CheckReport.judgement?`, `GateReport.judgement?` and `GateReport.freeze?`; `LeanCheckEngine.judge`, `finalCheck`, `writePremise`, `complete` with §2.9's report types, `FinalCheckReport.comparator?` added; `GhostCheckInput.leanName?`, `GhostCheck.explicit?` and `.facts?`; `EngineCore.judgeState` and `applyBackstop` (test hooks); `COMPLETION_STEP`; `ghostDirectProblems(…, allowed?, session?)`; the ghost file's `statementFacts` option and what it reads; `gate/session.ts`'s pure helpers, exported from the gate index. Shadow: the kinds `step-start`, `decision`, `completion`; `lastCommitSince(since, kinds)`, a required member (the plan names it on the shadow; the two test fakes that implement ShadowWorkspace implement it); `syncMirror(files?)`. Proposals: `planApply(ApplyRequest)`, a required member (the test fake implements it). The four new engine methods are required members too: the runner's FakeEngine throws until a test scripts them, the extension's FAKE_ENGINE lists them as unused.
  - **builder 2b3b decided (what a session judges):** `judge` and `finalCheck` judge the shadow's newest commit, from its files (`filesAt`, the mirror synced from them with `syncMirror(files)`), never ws/, so a write between its steps 2 and 3, which may run beside a judge (§2.6), never enters a judgement; G0 judges those files too. `writePremise` and `complete` judge ws/ (the write in progress). *(Alternative: judge ws/ and name the newest commit, which a write in progress can make the wrong one.)*
  - **builder 2b3b decided (one mirror operation at a time per run):** every engine method that uses the mirror (checkBase, check, freeze, gate, checkGhost, renderStatements and the four new ones) waits for the run's earlier one (`locked`, per run directory; Lean jobs stay serialised globally by `runExclusive`), since a judge runs outside the write queue and a premise write's build could otherwise replace the mirror between the judge's build and its premise checks or renders. `normalise` (no mirror) is not locked. *(Alternative: leave it to 2d and 2f never to overlap a judge with a premise write or a render.)*
  - **builder 2b3b decided (S₀'s facts):** a session step's rules compare with S₀ by its facts (D2-41's meaning, the frozen-items rule's same-probe test). The engine keeps the facts of its recent builds by files key (and pins the active step's S₀): S₀'s are those of the judge or gate that built its files; after a reload the first check builds S₀ once, before ws/, and an S₀ that does not build then is an `environment` outcome. *(Alternatives: persist S₀'s facts in the run directory; judge S₀ without facts, text only, which skips D2-41's meaning comparison at the step.)*
  - **builder 2b3b decided (the session step):** a session's check, freeze and gate need `scope` and `stepStartCommit`, with `scope.target` the selection's target (TypeError otherwise); judgeState gets the step's stage, the gate's judged commit (check and freeze: `''`), the step's freeze (none at the freeze itself), and the session's records by reference; the build's Lean errors are added, fail closed, when the rules did not report them. The freeze's permitted set is B.1's for the target (with E(T)), sorted into slice 1's categories over B.1's sources (`sessionPermitted`: a session proof's footprint is a derivation footprint, `unusable` the sources that give nothing). *(Alternative: slice 1's permitted set over the selection, which misses E(T) and session proofs.)*
  - **builder 2b3b decided (D2-19's re-export):** at a proved finish with findings empty, B.1's set on the gated state is compared with the freeze's as sets; when it differs, `frozen/<n>/project` (the freeze's copy) is copied into a new `frozen/<m>`, its challenge built again from scratch and exported with the new set; the new FreezeRecord keeps the freeze commit, round and snapshot (all but `permitted`) and is returned as `GateReport.freeze`; the comparator then judges against it. A re-export that fails is an `environment` outcome (not counted). *(Alternative: re-export into the same directory, losing the first challenge's record.)*
  - **builder 2b3b decided (the ghost check in a session, §3.8):** the permitted set is B.1's for the target on the checked state, B.2's allowed cards B.1's sources (Q(T) ∪ E(T) in that state), "alone entails" read from B.1's `.holds` names; its Claude-facing B.2 wording names the target's sources and propose_arrow. The ghost file also prints the pinned statement under the review's explicit options and probes the statement's own constants in a second in-file probe block: `explicit` is the value of that `#print` (its header `… : Prop :=` cut, whitespace collapsed: `PremiseDraft.explicit`), `facts` the statement abbrev and its `.holds` under `<subject>.<leanName>` (`PremiseDraft.facts`); a session check that cannot read either back refuses the suggestion (fail closed). Slice 1's file and reading are unchanged. *(Alternatives: the freeze's permitted set, stale once E(T) grows; the whole `#print` compared with the name substituted.)*
  - **builder 2b3b decided (judge's premise re-checks):** a draft is checked again when its reliance key changed since this engine last checked it (`relianceKey`: the draft's statement and proof, T's statement and its meaning, B.1's permitted set and sources, and the meaning and `#print axioms` of every name in its footprint and its statement's closure); none recorded (a new draft, a reload) counts as changed. Only drafts with no ledger `premise` entry, of an ended inference, not declined or withdrawn; only on a state whose facts are `ok`, probe fine and with no `facts` problem (a failed probe or a build error is telelean's or another item's, and would fail every draft); a check telelean could not run, or that read nothing back, is left out and tried at the next judge; a failed one keeps the draft's facts. `premiseChecks` is set only when a draft was checked. *(Alternatives: check every draft at every judge, a Lean job each; persist the reliance keys.)*
  - **builder 2b3b decided (writePremise):** normalise the premise's card (when its statement is new since B), G0, build, refuse a failed probe (AP30-4), a state with a Lean error (Lean's first error) and a render that failed, then commit exactly the files built as `adopt` (step 3) and judge that commit (`stage`); a failure leaves no commit. `meaningMatches`: the written statement's explicit value equals the draft's `explicit`. *(Alternatives: the caller commits after writePremise and judges again; commit before the build, which leaves an `adopt` commit on every failure.)*
  - **builder 2b3b decided (complete):** the newest commit must be an `adopt` commit and `ctx.freeze` (T's last freeze) is required; "statement-changed against T's last freeze snapshot" is exactly the `statement-changed` findings of a `check` (stage prove) judgement of the adopt state against it (slice 1's other freeze-relative rules would refuse the premise's own `.holds` as an axiom added after the freeze); a Lean error in the adopt state refuses too. The new freeze is taken on the adopt state (B.1 with E(T): the premise's `.holds` permitted), its challenge from the mirror holding that state; the completion's judgement scope is telelean's own step (`telelean-completion`, the inference's recorded question, the proof open, nothing else); the gate is `gate-proved` with S₀ the adopt state; on a pass the `completion` commit is made and judged as a `stage` (no Lean job). *(Alternatives: the whole freeze purpose against the last freeze; return the gate-proved judgement.)*
  - **builder 2b3b decided (finalCheck):** drift is the caller's (the engine never reads the real files); EN-2's reuse of the facts needs `reuse.judgement` to have judged F's files key and be `ok`, and the mirror last built from them; the comparators run only when nothing else failed (they cannot turn a failure into a pass), for each inference whose `.holds` in F is a proof of this session (its text differs from B's, or its elaborated value does), each on a challenge built from the mirror holding F with that inference's permitted set in F, a recorded pass reused for the same files key and set; failures by rule: `facts` and `items` (unowned) problems, every finding by code (G0 → rules, build or budget → build, footprint → permitted, undeclared-premise → no-hidden-edges, arrow → arrows, holds-kind → kinds, comparator-* → comparator, else rules), the backstop's refusals → backstop (also in `backstop`), identical failures once, `no-longer-builds` left out (the build's findings name them). *(Alternatives: always run the comparators; list the backstop only in `backstop`.)*
  - **builder 2b3b decided (when Lean cannot judge):** judge, finalCheck, writePremise and complete never throw for Lean or sandbox failures: a sandbox status, low memory or a budget judges the files without facts (partial, `ok` false) with the report's `environment` or budget finding (finalCheck: the environment, or a `build` failure; writePremise and complete: `{ ok: false }`, `environment` for the sandbox's). A shadow whose history cannot be read rejects judge and finalCheck (there are no files to judge). *(Alternative: a return type without a judgement.)*
  - **builder 2b3b decided (planApply):** its request is `{ shadow, readReal, finalState?, targets, nodes, realFiles? }`; one read of the real files; any that differs from B (an edit, an unsaved buffer, a file added or deleted) refuses the plan (`conflict`, core `REVIEW_TEXTS.drift`, the files in `files`), "plan.drift authoritative" read as the drift of the plan's own read deciding inside it; otherwise B -> F, `drift` empty, the label `REVIEW_TEXTS.applyLabel(targets)`. *(Alternative: return an ok plan carrying `drift` for the caller to refuse, as planAccept does.)*
  - **Carry-over R1-1 of 2b3a's review (nit; fixed as proposed):** `test/semantic/probe.test.ts`'s comment now says the test checks the check's argv and timeout, and points to the test of the probe job's lowered cap by name rather than by line. A comment: no behaviour, no mutation check.
  - **Tests.** Runner: new `test/gate/session.test.ts` (21: the scope, S₀ and records reaching judgeState; a session step's scope and S₀ required; AP30-3 at check, freeze and both finishes, and never on `ok` alone; judge and finalCheck on a failed probe (real judgeState); writePremise on a failed probe and on a state that does not build; Lean that could not judge; G0 first at every purpose with spies on refreshFacts, renderStatements, syncMirror and the Lean host; the per-run lock; judge's head and EN-2's reuse; the contexts judge and finalCheck take; complete's early refusals; real Lean: the re-export and G4 after it, the session freeze's B.1 set, the final comparator and its reuse, the final check's `permitted`, and the premise flow: the ghost check with E(T), judge's re-checks of two drafts, writePremise and complete) and `test/gate/sessionPure.test.ts` (15); `test/shadow/shadow.test.ts` +3 (the kinds, `lastCommitSince`, `syncMirror(files)`); `test/proposal/accept.test.ts` +2 (`planApply`); `test/semantic/probe.test.ts` (R1-1's comment). No test was deleted, skipped or moved.
  - **Mutation checks:** 49, each restored byte for byte (`cmp`), each failing at least one test: G0 first at a session step, in judge, finalCheck, writePremise and complete (5); the failed-probe rule on a session step, `ok` alone, the build fallback (3); writePremise's probe refusal, its `environment`, a state that does not build, the explicit comparison (4); the re-export, from the freeze's copy, from build/ with the target removed (3); complete's new challenge, statement-changed, the adopt head, the last freeze (4); judge's memo, written drafts, partial facts, a failed re-check, the reliance's footprint (5); the final comparator, its reuse's files key, EN-2's `ok`, each inference's failures, proofs of the session by text, a sandbox status in judge and in finalCheck (7); the head not ws/, the lock, S₀'s facts kept and passed, the gate's freeze passed (5); the ghost's B.1 set and B.2 sources, the session freeze's B.1 set (3); `lastCommitSince`, `syncMirror(files)`, planApply's drift (3); `explicitBody`, `withG0`'s ok, the statement probe's order, `sessionPermitted`'s extras, `completionScope`, the scope target check, judge's session requirement (7). Defensive, unreached by a test: the committed files compared with the files built in writePremise and complete (nothing writes ws/ while the run's lock is held), freeze's "did not judge the target" (judgeState always judges it), runCheck's session without scope (the public methods refuse it first).
  - **Verification:** tsc clean for core and runner (tsconfig.test.json), webview (tsconfig.json, tsconfig.node.json) and extension; vitest core 1133 (76 files), webview 314 (19), extension 205 (22, `--no-cache`); runner, with real Lean where needed (capped 3000, one worker): `gate/session` + `sessionPure` + `shadow/shadow` + `proposal/*` 98 (9 files), `gate/engine` + `gate/pure` 49, `gate/rules` + the seven `run/manager.*` 80, `integration/m2flow` + `semantic/probe` 11, `run/fresh.e2e` 9, `run/walkthrough.e2e` 22, all passed. No webview file changed, so no scratch build and no Playwright.
- 2026-11-20 (builder 2d: sessions, queues and steps; with the carry-overs R1-1, R1-2 and R1-3 of the 2b3b review). Runner: the new `run/step.ts` (the StepRunner: M2's round machinery taken out of `manager.ts`), `run/session.ts` (the session layer) and `run/legacy.ts` (old runs); `run/manager.ts` (now `RunManagerImpl extends SessionRunner extends StepRunner`), `run/types.ts`, `persist.ts`, `prompts.ts`, `systemPrompt.ts`; `llm/types.ts`, `toolSchemas.ts`, `toolServer.ts`, `fake.ts`, `stubToolHost.ts`; their tests and helpers. Extension host: `logic/boardSession.ts`, `logic/runs.ts`, plus the fakes and tests. Docs: `docs/m2-plan.md` (§5.1's system prompt regenerated from the TS, §5.2's OTHER CARDS line, with dated notes) and this plan (§3.8, §6.1, this entry). No core source, no webview file, no `test-fixtures/` file.
  - **Carry-overs, all fixed:**
    - **R1-1:** a real-Lean test of `complete` after a decision (`test/gate/session.test.ts`). After the adopt commit, a decision commit rewords another card's docstring (new-spyro-pg's, not the premise's: corrected by fixer 2d r1, A-F9); `complete` then passes on that head. Mutation-checked: `completeNow`'s narrow adopt-files rule restored makes the test fail.
    - **R1-2:** §3.8's failed-completion bullet and the due-writes paragraph, plus §6.1's 2f line, now say the completion starts from the head it is written on. Right after its premise write, that head is the `adopt` commit; after a decision or a crash replay, it is the head at that time (2b3b fixer's F-FC-2).
    - **R1-3:** `expect(scratch).toHaveBeenCalledTimes(2)` after the `written` judge. Mutation-checked: `relianceKey` without `permitted` or `sources` fails it.
  - **Contracts:**
    - Additive:
      - `SessionWrite` `queue-start` gains `inferences?`: the targets a mid-stage Formalize adds, so a replay after a crash builds them again.
      - `PersistedStep` gains `round?`: the run's round while the step ran; its freezes and gate attempts carry it.
    - Changed: `RunChange.session`, required. Every emitter says whether the session changed. The extension's fakes and its two tests that build a `RunChange` are updated.
    - As §2.5–§2.6 have them:
      - `PersistedRun.version: 1 | 2` and `session?`, `PERSISTED_SESSION_FORMAT`, `FormalizeRequest`;
      - the RunManager's session methods, and `RunFiles.writeStateChecked`;
      - the agent tool `propose_arrow`: `ProposeArrowArgs`, `ArrowProposal`, `AgentToolHost.propose_arrow`, its MCP schema, and the replies "Arrow recorded: …" and "Arrow refused: …";
      - `FinishArgs.no_alternative?`.
  - **builder 2d decided (the extraction):** a class chain, `StepRunner` → `SessionRunner` → `RunManagerImpl`. The StepRunner calls hooks where a round ends or a tool needs the session:
    - abstract hooks: `roundAccepted`, `roundReverted`, `roundEnvironment`, `roundCrashed`, `sessionCheckContext`, `proposeAssumptionInSession`, `toolProposeArrow`;
    - no-op hooks: `onFrozen`, `beforeGate`, `onStateChanged`, `onPersisted`.

    M2's behaviour was moved unchanged first, with the seven manager suites green. *(Alternative: composition, a StepRunner object that the manager calls with the session's callbacks.)*
  - **builder 2d decided (a step is one round):** each step is the run's next M2 round, with fresh caps and counters (D2-22). Its freezes and gate attempts are those of its round. *(Alternative: one round per session, with the counters reset at each step.)*
  - **builder 2d decided (the first turn):** the context bundle comes first, its first line unchanged, so the FakeBackend scripts of `test-fixtures/` still match. Then the FORMALIZE PLAN, then step 1's turn. Each later step is a new turn of the same conversation. *(Alternative: the plan as a turn of its own before step 1.)*
  - **builder 2d decided (Claude's texts):**
    - the OTHER CARDS heading of the bundle now says: propose an arrow for a card with a `.holds`; for a card without one, finish not proved and name it in `gap`;
    - the system prompt gains a "You work in steps" paragraph and the arrow rule (core `CLAUDE_SESSION_TEXTS.arrowRule`);
    - its rules name "the arrows you proposed", and gain the `otherTargets` and `declarationsOnly` lines;
    - the fixture and m2-plan §5.1 were regenerated from the TS.

    *(Alternative: a separate system prompt for sessions beside M2's.)*
  - **builder 2d decided (review methods before 2e and 2f):** `decide`, `reveal`, `undoSession`, `redoSession`, `submit`, `sessionDiff` and `moveProposed` answer D2-62's refusal while a step runs, and `not-yet` "Not built yet (slice 2)" otherwise. `end` answers the same, `exit` included. Until 2f, the stopgap Exit is `discard`: the session ends ("Session ended") and its attempt records are written as discarded (D2-11). *(Alternatives: leave the methods unimplemented, so only the host answers not-yet; refuse `discard` in a session, which would leave no way out until 2f.)*
  - **builder 2d decided (Cancel step):** Cancel step stops the round, closes Claude's process and cancels the run's Lean jobs. It then takes the step back to S₀; the rest of the queue becomes `not-run`, both go to `retry`, and the stage opens. Retry resumes the same conversation with `--resume`. *(Alternative: keep the process alive between steps.)*
  - **builder 2d decided (how a step ends):**
    - "No finish twice" is a give-up.
    - A give-up goes back to the newest `gate-pass`, `freeze` or `step-start` commit since S₀. So with no freeze, it goes back to S₀, and it never goes further back.
    - A give-up keeps its premise drafts (AF10) and the ledger arrows that are still drawn; it drops the arrows its rollback undrew (§3.4).
    - A cap, an environment failure twice, or a crash fails the step (D2-29).

    *(Alternative: no finish twice as a failure, back to S₀ with its drafts dropped.)*
  - **builder 2d decided (the ledger at a step's end, D2-43):** a `created` entry for every declaration name of the end state that is neither in S₀ nor already in the ledger. Its phase is `statements` when the freeze commit had the name, `proof` otherwise. A proof name a premise draft's statement reaches records that draft (`reachingDraft`). A later step that changes the declaration keeps its first creator. *(Alternative: only the names the finish's footprint reaches.)*
  - **builder 2d decided (a re-ask without a proof, D2-46):** core `computeItems` is run over S₀ → the end state with the step's ledger, and its own Result and arrow drafts are reverted with `planItemRevert` into a `revert` commit. If that plan throws, the whole step goes back to S₀, which fails closed. *(Alternative: always the whole step back to S₀, losing the statements it wrote.)*
  - **builder 2d decided (proposed arrows, §2.8):** before each gate attempt, `beforeGate` writes each of the step's ledger arrows that is not drawn yet. It uses core `planAction({ kind: 'add-arrows' })`; `written` records the time. A plan that throws is logged, and B.3 then refuses the undrawn arrow. *(Alternative: write the arrow when it is proposed, which turns a mid-step check into a write.)*
  - **builder 2d decided (judging):**
    - **Phase and state.** The phase stays `step` until the queue-end judge converges. The run's state is `review` from the last step's end.
    - **Judge rounds.** Reverts make the judge run again, up to 8 rounds (`MAX_JUDGE_ROUNDS`). A judge that throws opens the stage without a judgement, so nothing can be accepted. *(Fixer 2d r1, A-F4: only since that round does the previous judgement stop standing in for it; below.)*
    - **A judge-apply that changes nothing writes nothing:** same judged commit and files key, same `ok` and problems, same records, no event or revert, not a queue end, no written cards. No run.json write, no new view version.
    - **Recovery's head.** A write in flight is finished by reverting ws/ to `head`, and that `revert` commit becomes `head`. The judge judges the newest commit, and would otherwise be dropped forever.
    - **Renderings and facts.** Renderings are made after each converged judge and kept in `renderings.json`. The judged facts go to `judged-facts.json` as `{ format: 'telelean-judged-facts', version: 1, commit, filesKey, facts | null }`, written in judge-apply's step 4.
    - **A mid-stage Formalize and Retry** wait for the session to be idle (no judge, no write) before their checks.

    *(Alternatives: write at every judge; keep `head` and compare files keys; render once when the stage opens; keep the facts in run.json; refuse while judging.)*
  - **builder 2d decided (the views):**
    - The RunView withholds `activity` and `notices` only once a step has started, so a start refused before any step ran still shows its reason, such as a base with Lean errors. *(Alternative: withhold them from the start.)*
    - `proposedNothing` is a passed step's summary when its end commit is its start commit. *(Alternative: compare the end and start files instead of the commits.)* *(Replaced by fixer 2d r1, F-V2D-FC-1: a passed step always ends on a new `gate-pass` commit, so the line never showed; it is decided on content now, below.)*
    - ES-4's "did not pass" applies when the queue-end judgement of a queue with a cancelled or failed step is not `ok`. *(Alternative: ES-4's text for every failed or cancelled queue, whatever its judgement.)*
  - **builder 2d decided (old runs, AF12):** a v1 run in review becomes a session with one passed step (`legacy.ts`):
    - ws/ goes back to the proposal's head when it is ahead;
    - `created` entries are made from the v1 freeze;
    - `premise` entries (with `mark-removed`) are made for its adopted ghosts, which become written Add premise items through the judge-apply's `writtenCards`; *(replaced by fixer 2d r1, A-F2: every judge-apply derives the record's `card` from that ledger entry, so a reload during the first judge keeps it)*
    - its pending ghosts become drafts;
    - then a fresh judge runs.

    *(Alternative: end such a run, losing its proposal.)*
  - **builder 2d decided (a reload before Claude had started, as M2):**
    - A session is ended failed with "the editor reloaded before Claude had started" when every step is still `queued` and its state is `starting` or `interrupted`. That covers a crash or a window closing during the base check, and a window closing after Claude's process started but before the first turn.
    - Resuming such a session would start step 1 without the bundle and the plan. No other session has every step queued.

    *(Alternative: keep it interrupted, and persist the first turn's prefix so Resume can send it.)*
  - **builder 2d decided (the start's checks):** the runner does not check a start again (`formalizeStartProblems` runs in the host, as in slice 1e). A mid-stage Formalize is checked by the runner on its own records. *(Alternative: check both again in the runner.)*
  - **builder 2d decided (tests):**
    - The FakeEngine judges with core's `judgeState` over core's `fakeFacts` test helper, imported from core's tests, with real source hashes. *(Alternative: a copy of the helper in the runner.)*
    - The walkthrough's cheating scripts (AT3.15) run as one-step sessions with real Lean; the checks are kept and read from run.json. *(Alternative: move them with the rest.)*
    - The fresh models (all of them end in Accept) and m2flow (a)–(c) move to 2f; m2flow (d) and (e) run as sessions.
  - **Runner texts not in core (reported; no core text added):**
    - user-facing:
      - "Claude resumed the step." and "Claude resumed the session."
      - "You cancelled the step. Its changes were taken back; Retry step runs it again."
      - "The editor reloaded while Claude was working. Resume continues the same session; Cancel step takes the step back."
      - "Changes made after finish were discarded: the step ends on exactly the files the checks passed."
      - "telelean could not check the working copy (…)."
      - "This run was started by an older telelean: it is now an edit session, with every item in review."
      - "This run is an edit session: review its items instead." and "This run is not an edit session."
      - "No step of this session is running." and "No step of this session waits."
      - the step's environment notice ending "…the step stops here: fix the cause, then Retry step."
      - the labels "Session ended", "Step cancelled", "Claude continues" and "Claude is working on “…”"
    - Claude-facing:
      - "The person rejected this premise in this session: do not propose it again."
      - the `propose_arrow` acceptance message, its tool title and description
      - the OTHER CARDS heading, and the system prompt's lines above
  - **Tests that move (§0)** are 29, all in the runner, each `it.skip` with "moves to 2e/2f/2h: ‹name›":
    - `manager.lifecycle` 1 (to 2h);
    - `manager.rounds` 3 (Feedback to 2e; two ghost tests to 2f);
    - `manager.accept` 10 (to 2f; Discard's to 2e/2f);
    - `walkthrough.e2e` 3 ((a), (b), and definition-belief's Accept refusal, to 2f);
    - `fresh.e2e` 9 (to 2f);
    - `integration/m2flow` 3 ((a)–(c), to 2f).
  - **Tests.**
    - **New** (the FakeBackend and the fake engine):
      - `session.queue` 12: chains, A12 with its tool refusals, give-up bounds, caps per step, Cancel and Retry, D2-62, a mid-stage Formalize and the seals, queue numbers;
      - `session.tools` 9: `propose_arrow` and `propose_assumption` in a session, AF10;
      - `session.reload` 20: a reload during a step, between steps, at and in a queue-start, before Claude started (3 variants), during a stage (D2-72), a judge whose head moved (F8, white box), a judge-apply crashed after each of its writes (AF11), persistence, v1 conversion;
      - `session.views` 5: the views, nothing leaking, the re-ask's outcomes;
      - one new real-Lean session test in `walkthrough.e2e`;
      - `toolServer` +1 (`propose_arrow` over MCP);
      - extension `runRouting` +8 (Formalize start and mid-stage, the start's lock, Retry step, Cancel step, AF14 ×2, the `session` message).
    - **Adapted to sessions:** `manager.start`, `happy`, `gate`, `caps`, `lifecycle`, `rounds`; `prompts`; the 20 cheating scripts; m2flow (d) and (e); the tool counts in `toolServer` and `m2Harness`; extension `runRouting` and `hostRuns` (the `session` message).
  - **Mutation checks:** 33, each restored byte for byte (`cmp`).
    - **31 fail at least one test.** The two carry-overs, then:
      - D2-62's refusal, and `stepRunning` without `interrupted`;
      - A12's detection, and its `propose_assumption` refusal;
      - the give-up without S₀ as a target;
      - AF10's drafts, and the ledger on a rollback and on a give-up;
      - `beforeGate`'s write, `proposeArrowProblems` ignored;
      - the seal of a later queue;
      - a judge-apply on a moved head, and recovery's head;
      - `isPersistedRun` v2;
      - queue-start's step-1 refusal and its replay on recovery;
      - D2-46's take-back;
      - the RunView's withholding;
      - AF12's written cards;
      - the never-started rule, and its narrower first draft;
      - D2-63, with the queue ending early;
      - D2-72's recompute;
      - Cancel's revert;
      - the host's start check, its mid-stage bypass, its `retryStep` routing, its `session` post and its start lock.
    - **Two are equivalent, and say so:**
      - the give-up's search bound S₀ replaced by the base: S₀ is itself a `step-start` commit, so the newest commit of the three kinds is never older than it;
      - `propose_arrow`'s A12 refusal removed: core's `arrowProblems` gives the same text as its only problem.
    - **Three survived at first and got tests:** the give-up and the moved head, and the A12 refusal checked by its exact tool result.
  - **Outside this sub-slice's files (reported, not changed):** `scripts/walkthrough-claude.mjs`, the integrator's walkthrough dry run, still drives M2's start, proposal and Accept. With 2d its start is a session whose `proposal()` is null, so the script ends it with Discard. It needs 2f's Apply, and was not run.
  - **Verification:**
    - tsc is clean for core and runner (`tsconfig.test.json`), webview (`tsconfig.json`, `tsconfig.node.json`) and extension.
    - vitest, all passed: core 1133 (76 files), webview 314 (19 files), extension 213 (22 files, `--no-cache`).
    - Runner, capped at 3000 MB, one worker, `TELELEAN_NO_REAL_CLAUDE=1`:
      - `session.*`, `manager.*`, `prompts`, `llm/*`, `backend` and `quotaTripwire`: 220 passed, 15 skipped. The skips are the 14 moved tests above and `llm/binary`'s pre-existing opt-in.
      - With real Lean:
        - `gate/session`: 27 passed;
        - `integration/m2flow`: 2 passed, 3 skipped;
        - `run/walkthrough.e2e`: 21 passed, 3 skipped;
        - `run/fresh.e2e`: 9 skipped.
    - No webview file changed, so there was no scratch build and no Playwright.

