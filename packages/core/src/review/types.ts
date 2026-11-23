/**
 * Slice 2, the review list (docs/slice2-plan.md sections 2.2, 2.7 and 2.9): the item model of an edit session, the
 * ledger telelean keeps outside ws/, the shared contracts of judging, reconciling, reducing, masking and ending a
 * session. Written by 2a1 with the functions stubbed (`review/index.ts`); every later sub-slice implements them as
 * written here.
 *
 * CONTRACT (slice 2, the integrator's): a builder who must change one records it in the plan's change log (section 8)
 * with the reason.
 *
 * Pure types: nothing here imports Node or vscode (the webview bundles core).
 */
import type { ArrowEnds } from '../actions.js';
import type { DeclFacts } from '../facts.js';
import type { FrozenSnapshot, GateFinding } from '../gate/types.js';
import type { CanvasPosition } from '../layout.js';
import type { ProjectInput, ProjectModel } from '../project/types.js';
import type { EndConfirmationView, SessionView, StepView } from './view.js';

// ---------------------------------------------------------------------------------------------
// 2.2 The review model

/** RV-1. Slice 2 produces formalize, add-premise, add-arrow, vocabulary-term, declaration and result. */
export type ItemKind =
  | 'add'
  | 'add-premise'
  | 'add-arrow'
  | 'remove-arrow'
  | 'formalize'
  | 'change'
  | 'delete'
  | 'vocabulary-term'
  | 'declaration'
  | 'result'
  | 'proof-broken';
/** For `declaration` items. Structures, inductives, classes, abbrevs and opaques count as `definition`. */
export type DeclKind = 'definition' | 'instance' | 'coercion' | 'presupposition' | 'vocabulary-change';
export type ItemStatus = 'in-review' | 'accepted' | 'declined' | 'to-be-redone' | 'withdrawn';
/**
 * (2j1, D2-76, D2-77) Who made an item to be redone (`ItemRecord.redo.kind`): `cascade`, a decline's cascade (Reject,
 * plain, Shaky), the only kind that comes back by itself when what took it down is set back to review; `question`, DO-0
 * took a source out of the Result's question (D2-59, D2-81); `judge`, the judge's reverts, the dependents they take
 * down, and premise re-checks (§3.5, §3.6); `take-out`, Submit's take-out (D2-57); `queue`, RV-3 at a queue's end.
 */
export type RedoKind = 'cascade' | 'question' | 'judge' | 'take-out' | 'queue';
/** `plain`: arrow items only (DO-0). `transform` is refused until slice 4. */
export type DeclineOption = 'plain' | 'reject' | 'shaky' | 'transform';
export type ItemMarker =
  | 'updated'
  | 'no-alternative-found'
  | 'seen-early'
  | 'meaning-differs-in-place'
  | 'completion-not-checked'
  | 'unused-premise'
  | 'adds-no-new-basis'
  | 'sentence-lean-may-disagree'
  | 'no-longer-builds'
  /** A premise draft that no longer closes the gap when checked again (§3.8). */
  | 'no-longer-closes-gap';
/** Shown only while the results are shown (§4.7). */
export type ResultFlag = 'proved-from-nothing' | 'replaces-your-proof' | 'proves-changed-statement';

export interface ClassReason {
  code: 'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'c1' | 'c2' | 'c3' | 'c4';
  name?: string;
  arrow?: ArrowEnds;
  cards?: string[];
}
export interface ItemClass {
  belief: boolean;
  changesProved: boolean;
  reasons: ClassReason[];
  /** False when a closure met a declaration without valueConsts or typeConsts; `belief` is then true (D2-25). */
  complete: boolean;
  /** c4 only: the arrow "adds no new basis" (§4.4). classify sets it; the view reads it from the class in force (AF8). */
  addsNoNewBasis?: boolean;
  /**
   * (fixer 2a, ADV-3; additive) The item's draft lacks the facts of its declarations (`ItemDraft.factsMissing`: their
   * module did not build). Its class and dependencies are unknown, so its Accept is refused until a state with its
   * facts is judged, and no badge comparison (RV-7, D2-23) reads this map while any class has it.
   */
  factsMissing?: true;
  /**
   * (2b2, AP30-5; additive) With `factsMissing`, when the judged state's probe failed: `probeFailure`'s sentence
   * (docs/slice2-plan.md 2.1). The reducer's Accept refusal then reads it plus "Decline what caused it, or Exit."
   * (`REVIEW_TEXTS.acceptProbeFailed`) instead of ADV-3's text, since no check is coming that would lift it.
   */
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
  /**
   * `it` and the first 16 hex digits of the sha256 of the run id and the key (the hash of §4.3), made by reconcile
   * (`reviewItemId`). One record per key, so it is never reused in the session, and it never depends on how many other
   * items, hidden ones included, exist (AF7). Matches RUN_TOKEN_PATTERN (D2-31).
   */
  id: string;
  /** The item's identity across stages (the key table of §2.2). */
  key: string;
  kind: ItemKind;
  declKind?: DeclKind;
  /** 1 for the first version, +1 whenever its content key changes (a newer proposal, RV-1). */
  rev: number;
  /**
   * The step that first proposed it, its inference, and whether before or after that step fixed its statements.
   * Set when the record is made, never re-derived (§4.2).
   */
  origin: { step: string; target: string; phase: 'statements' | 'proof' };
  /**
   * The target whose Result it is part of (`ItemDraft.partOfResult`), set when the record is made. Such an item is
   * hidden while the results are (§4.7).
   */
  partOf?: string;
  status: ItemStatus;
  /** `note` (2j2, D2-92): the person's note for Claude, with any option (D2-13 kept it only with Shaky). */
  decline?: { option: DeclineOption; note?: string; at: string; commit?: string };
  /**
   * `result`: a Result's verdict and Rests on when it was accepted; the backstop compares them on F (§4.10).
   * `holdAs` and `rationale`: add-premise only, the hold-as choice and the one-line Why of its Accept. The premise
   * write and its replay after a crash (`inFlight`, §2.6) read them here, never a default (§3.8); a Redo sends them
   * again from its recorded request (AF13).
   */
  accepted?: {
    how: 'own' | 'group';
    fingerprint: string;
    belief: boolean;
    changesProved: boolean;
    at: string;
    result?: { verdict: 'established' | 'proved' | 'not-proved'; restsOn: string[] };
    holdAs?: 'axiom' | 'pending';
    rationale?: string;
  };
  /**
   * To be redone: `because`, the items whose decline or removal took it down; `reverted`, its content was taken out
   * of ws/. `kind` (2j1, D2-76, D2-77; additive): who set it (`RedoKind`). A record saved before 2j1 has none: it
   * never comes back by itself. `note` (2j2, D2-92, D2-93; additive): the person's note for Claude while it is to be
   * redone (the `note` action): kept while it stays so, whatever rebuilds `redo` (`copyRedo`); gone when it leaves that
   * status (`dropStaleRedoNotes`).
   */
  redo?: { because: string[]; reverted: boolean; kind?: RedoKind; note?: string };
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
  /**
   * (fixer 2a, V2A-S1; additive) `result` only: the verdict, Rests on and RV-5 dependencies (item keys) of the
   * Result's inference in the last judgement reconcile applied while its content was in ws/, each list sorted. RV-11
   * compares the next judgement with it, whatever the status; an Accept copies verdict and Rests on into
   * `accepted.result`, and is refused without it (fail closed). Set by reconcile, never by the reducer.
   */
  judged?: { verdict: 'established' | 'proved' | 'not-proved'; restsOn: string[]; deps: string[] };
}

/**
 * What telelean itself wrote or recorded. Persisted outside ws/; G5, B.3, ownership and the backstop read it. In
 * `premise`, `mark-removed` and `completion`, `item` is the Add premise item's key (`premise:<T>:<leanName>`), so
 * computeItems keys the written premise by its draft's key (§3.5); taking the premise out drops all three (§3.8).
 */
export type LedgerEntry =
  /** propose_arrow (D2-1); written into the target's `premises:` at the step's next normalise. */
  | { kind: 'arrow'; source: string; target: string; step: string; why: string; written?: string }
  | { kind: 'premise'; card: string; target: string; holdAs: 'axiom' | 'pending'; item: string; commit: string }
  | { kind: 'mark-removed'; card: string; item: string; commit: string }
  | { kind: 'completion'; target: string; item: string; commit: string }
  /**
   * The step that first created a declaration, and in which phase (D2-43). It fixes the declaration's owner for the
   * whole session (§4.2). `draft` (fixer 2a1, V2A1-C3; additive): for a definition created in a proof phase, the item
   * key of the step's premise draft that reached it when the step ended (`reachingDraft`), so it is a `decl:` item that
   * is part of the target's Result (D2-42) even after that draft is withdrawn; absent when no draft of the step
   * reached it. Written once when the step ends (2d), never re-derived.
   */
  | { kind: 'created'; name: string; step: string; phase: 'statements' | 'proof'; draft?: string };

export interface SessionInference {
  target: string;
  /**
   * Q(T): the selected arrows' sources (your arrows, or Claude's accepted ones); [] with fromNothing for the mark.
   * A re-ask replaces it only when its step proves T (§3.2); DO-0 on a selected Claude arrow removes that source (D2-59).
   */
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
  /**
   * The scratch facts of its statement's declarations, by Lean name; replaced at each re-check (§3.8). R_stmt, the
   * item's `mentions` and its statement view read them, so classes and dependencies survive a reload (F12).
   */
  facts: Record<string, DeclFacts>;
}

/** The part of an item's record that one action may change (F4). */
export type ItemState = Pick<ItemRecord, 'status' | 'decline' | 'accepted' | 'redo' | 'markers' | 'rejectedFingerprints'> & {
  /** The revs of `versions` marked rejected. */
  rejectedRevs: number[];
};
/**
 * Show results' force (§4.7): the results stay shown until a statement or belief item next becomes undecided (AF4), a
 * Result that RV-11 returns to review, or the end of any queue of Claude steps (§4.7; builder 2b3a, carry-over R1-3).
 * `decided` (fixer 2a, ADV-1; additive): telelean's own force, set when the results were shown because every meaning
 * item was decided, and D2-23's returns at that show (with their RV-5 dependents) would hide them again. It marks no
 * Result seen early, and ends as any force does.
 */
export interface SessionForce {
  via: 'show-result' | 'raw-diff' | 'activity' | 'decided';
  at: string;
}
/**
 * One step of the session stack (UN-4). It records every effect of its action, so Undo restores `before` exactly (F4),
 * once the reducer has checked the restored statuses against the current state; Redo sends `request` again through the
 * reducer, never a recorded state (AF13). With `accepted` come an Add premise's `holdAs` and `rationale`. `id` comes
 * from the session's counter (`PersistedSession.nextAction`) and is never reused, so a request naming an action (Undo,
 * Redo) can never hit a newer action that happens to sit at the same depth.
 */
export type SessionAction = { id: number } & (
  | {
      kind: 'decide';
      label: string;
      /** The decisions as the user sent them, for Redo (AF13). */
      request: { decisions: ItemDecision[]; own: boolean };
      /**
       * `rev` (builder 2a2, additive): the item's rev when the action was made. Undo gives `conflict` when it changed
       * since (a newer proposal), so it never restores a decision on content the person did not see (D2-73).
       */
      changes: Array<{ item: string; rev: number; before: ItemState; after: ItemState }>;
      /**
       * The written Add premises its write took out (§3.8): their card, written key and ledger entries, which Undo puts
       * back with the files. The write fills it in its step 4, when it adds its commit (AF2): only those written when the
       * write started, so one whose card only the write's own un-reject merge brought back is taken out but not recorded
       * (fixer 2b1a r1; `ItemWrite`).
       */
      takenOut: Array<{ item: string; card: string; fingerprint: string; ledger: LedgerEntry[] }>;
      /** DO-0 adds its arrow; un-reject of an arrow item removes it. */
      rejectedArrows: { added: ArrowEnds[]; removed: ArrowEnds[] };
      /** DO-0 on an arrow that a question selected takes its source out of that question (D2-59). */
      questions: Array<{ target: string; before: SessionInference['question']; after: SessionInference['question'] }>;
      /** The force this action ended, if any (§4.7): Undo puts it back. */
      endedForce?: SessionForce;
      /**
       * (fixer 2a, ADV-1; additive) The `decided` force this action set: it showed the results, and D2-23's returns
       * would have hidden them again. Undo removes it.
       */
      startedForce?: SessionForce;
      commits: string[];
      at: string;
    }
  /**
   * Show results. Undo removes the force; the seen-early markers stay (UN-4). `changes` (fixer 2a, V2A-S4; additive):
   * the items D2-23 returned to review at this show (§4.6), which Undo restores through the same checks as a decide
   * action's. `takenOut` and `commits` (builder 2b1a, carry-over R1-2), shaped like decide's: a written Add premise
   * that rests on a returned item returns to review with it, so the action's write takes it out (§3.8); the write
   * fills both in its step 4, and Undo inverts the commits and puts the premises back, as for a decision.
   */
  | {
      kind: 'reveal';
      label: string;
      force: SessionForce;
      changes: Array<{ item: string; rev: number; before: ItemState; after: ItemState }>;
      takenOut: Array<{ item: string; card: string; fingerprint: string; ledger: LedgerEntry[] }>;
      commits: string[];
    }
  | { kind: 'move'; label: string; before: Record<string, CanvasPosition | null>; after: Record<string, CanvasPosition>; at: string }
  /**
   * (2j2, D2-92, D2-95) A note for Claude on an item to be redone, "Note for Claude: ‹label›": the note it replaced
   * (`before`) and the one it left (`after`; absent: cleared), at the item's `rev`. Undo puts `before` back; Redo sends
   * `after` again through the rules. A records-only step: no ws/ change.
   */
  | { kind: 'note'; label: string; item: string; rev: number; before?: string; after?: string; at: string }
  /** `comment` (2j2, D2-92, D2-96; additive): Submit review's overall comment for Claude, and the stage it submitted. */
  | { kind: 'seal'; by: SealBy; at: string; comment?: { text: string; stage: number } }
);
/**
 * UN-5's sealing actions: Submit review that queues steps, a mid-stage Formalize, Retry step. Every queue of Claude
 * steps after the session's first starts with exactly one, written by its `queue-start` write, which also gives its steps
 * the queue's number (D2-63); the session's first queue, which the Formalize that starts the session queues, has none
 * (nothing precedes it on the stack). So a decision made after k seals was made while queues 1 to k + 1 had started,
 * which `buildSessionView`'s D2-59 removals rely on (fixer 2b3a r1, C-V2B3A-C1). Answering Claude's question needs no
 * seal of its own: nothing is decided while the queue runs (D2-62), so the queue's seal already covers it.
 */
export type SealBy = 'submit' | 'formalize' | 'retry';

/** webview -> host, in `decideItems`. The message's `own` flag, never the count, makes an Accept the item's own (RV-7, D2-32). */
export interface ItemDecision {
  item: string;
  /** The version the user saw: a stale rev is refused (`conflict`). */
  rev: number;
  to: 'accepted' | 'declined' | 'in-review';
  /** Required with `declined`, and only there. */
  option?: DeclineOption;
  /** Only with `declined`, any option: the person's note for Claude (2j2, D2-92; D2-13 allowed it only with `shaky`). */
  note?: string;
  /**
   * Only with `accepted`, on an add-premise item. One already written (an adopted ghost of a converted v1 run, §3.11)
   * takes only `axiom` (AF12).
   */
  holdAs?: 'axiom' | 'pending';
  /** Only with `holdAs`: the new card's Why, one line. */
  rationale?: string;
}

/**
 * An entry of a cascade (§2.3 ActionOutcome, §3.6): an item whose status the action changes besides those it decides.
 * While the results are hidden, a Result or a Result's part is never an entry (D2-64).
 */
export interface CascadeEntry {
  item: string;
  to: ItemStatus;
  why: string;
}

// ---------------------------------------------------------------------------------------------
// 2.7 Gate contracts (StepScope and JudgeInput; judgeState is 2b1b's, in judge.ts)

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
  /**
   * A12 (D2-4): the source, an earlier target of the queue, that has no `.holds` at S₀. The step only formalises
   * statements: `openProof` and `openArrows` are false, and it finishes not proved naming this source. Never in a view.
   */
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
  /**
   * The session's item records. They do not change while a queue runs (D2-62), so a step's checks, and its Resume,
   * read the records of its start.
   */
  items: readonly ItemRecord[];
  /** Add premise drafts: computeItems makes their items (§3.5), and `classes` counts their statements (§4.1). */
  premises: readonly PremiseDraft[];
  /** The inferences whose step ended: each has a Result draft (§4.2). */
  ended: readonly string[];
  rejectedArrows: readonly ArrowEnds[];
  /** The step's finish said it found no other arrangement (DO-3). */
  noAlternative?: boolean;
}

// ---------------------------------------------------------------------------------------------
// 2.9 Shared contracts

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
  /**
   * E(T)'s sources: Claude's arrows into T that are not declined and that the judged state draws into T (the running
   * step's own entries before its normalise draws them), and T's written premises (§4.8; fixer 2b1b r2, R1-2).
   */
  extra: string[];
  /** B.1: what each source of Q(T) ∪ E(T) contributes. */
  contrib: Record<string, { kind: 'claim' | 'own-proof' | 'session-proof' | 'nothing'; reason?: ContribReason; pending?: boolean }>;
  permitted: string[];
  /** Sources whose session proof counted: the RV-5 edges Result(T) -> Result(u). */
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
  /**
   * RV-7 classes by item key, every premise draft's statement counted in R_stmt: in force while the results are
   * shown (§4.1, D2-42).
   */
  classes: Record<string, ItemClass>;
  /** The same with no premise draft counted: in force while the results are hidden, and the only one the reveal rule reads (§4.7). */
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
  /**
   * The target whose Result it is part of, hidden while the results are (§4.7): arrow items into the target, its
   * premise items, and the `decl:` items created in its steps' proof phases that its premise drafts reach. Read from
   * the ledger, never from later reach (§4.2). A declaration created in a statement phase is never part of a Result.
   */
  partOfResult?: string;
  contentKey: string;
  content: ItemContent;
  /**
   * A Result's draft that is B's version: T.holds as in B (the same text, or absent in both) and no proof material.
   * It exists only because the step ended (F9), and reconcile never reads it as a new proposal (§3.5, AF1).
   */
  asInBase?: true;
  /**
   * (fixer 2a, ADV-3; additive) A declaration it provides in the judged state has no facts, because its module did not
   * build: its content key and `mentions` lack what the facts give. Reconcile keeps its record as it was; classify
   * marks its class (`ItemClass.factsMissing`), and its Accept waits.
   */
  factsMissing?: true;
}

/** The step of a session's queue (PersistedStep.state). */
export type StepState = 'queued' | 'running' | 'passed' | 'gave-up' | 'cancelled' | 'failed' | 'interrupted' | 'not-run';

/**
 * The ws/ changes of one action, carried out at once through the write queue (§2.6). The runner applies `reapply`'s
 * merges first, then `revert`, then the premise take-outs (fixer 2a, V2A-C2): an inverse merge brings back everything
 * its decision commit took out, and `revert` takes out again what must stay out.
 *
 * Taking a written Add premise out (§3.8) removes whatever of it is in ws/ when the take-out runs (its card, arrow, mark
 * removal and completion) and drops its ledger entries; step 4 clears the record's `card` and gives it its draft key
 * again. Step 4 records in the action's `takenOut` only the premises that were written when the write started, with
 * their card, written key and ledger entries, so `takenOut` is what the action's commits, together, took out (fixer
 * 2b1a r1).
 *
 * A decision commit holds the take-out of the written Add premises its write took out, so an un-reject's inverse merge
 * brings their card, arrow, mark removal and completion back, without their ledger entries (builder 2b1a, carry-over
 * R1-1). Their entries are in the `takenOut` of the stack action whose `commits` hold the un-rejected item's
 * `decline.commit` (read before the action), the action the reducer reads. Such a premise is in `reapply` when it comes
 * back: its record holds its card and written key again, and the runner puts that entry's ledger entries back. It is
 * in `premises.takeOut` when its status keeps it out: its record holds the card again, so the runner plans that
 * take-out, after the merge, from the record's card (no ledger entry of it exists). It was not written when the write
 * started, so step 4 does not record it in `takenOut`: the write's merge and take-out together leave it as it was, and
 * so does their inversion (fixer 2b1a r1). One written again since keeps its record: the merge of its old take-out
 * changes nothing, or conflicts and refuses the un-reject.
 *
 * For an Undo, `action` is the undone action's id (a decision or Show results): the runner inverts its `commits`,
 * newest first, and puts back its `takenOut` ledger entries before anything else, ahead of any premise write that is
 * due; `reapply` lists what that brings back, `revert` what must go out again afterwards (fixer 2a, V2A-S3, V2A-S6).
 * The Undo writes a premise of its action's `takenOut` again (its card and written key back on its record, in
 * `reapply`) only when it restores that premise's change to a state that keeps it in ws/: in review only when it was in
 * review before the action (a converted v1 ghost). Every other one (a judge changed it since, its Accept is kept
 * silently, or the Undo itself returns it to review) is in `premises.takeOut`, taken out again after the inversion,
 * planned from that entry's card (fixer 2b1a r1). An Undo whose action made commits always has a write, so they are
 * inverted even when no status changes ws/.
 */
export interface ItemWrite {
  /** The stack action (SessionAction.id) that made it: its commit joins that action's `commits`, so Undo inverts it. */
  action: number;
  /**
   * Items whose content goes (planItemRevert), and items whose rejected version comes back (the inverse merge of the
   * decision commit that declined them). `revert` also holds the items such a merge brings back that stay out.
   */
  revert: string[];
  reapply: string[];
  /**
   * `write`: the Add premise items this action makes due; their premise writes join the queue after this write (§3.8),
   * and each reads `holdAs` and `rationale` from the item's `accepted` record, never from a default. `takeOut`: the Add
   * premise items this action gives a status whose content is outside ws/ (in review, declined by Reject or plain, to
   * be redone and reverted), taken out when they are written as the write starts (§2.6, §3.8, AF2); also those an
   * un-reject's merge brings back that their status keeps out, taken out after the merge from the record's card (R1-1),
   * and for an Undo those of its action's `takenOut` it does not write again, from that entry's card (fixer 2b1a r1).
   */
  premises: { write: string[]; takeOut: string[] };
}

/**
 * The reducer's input (§4.6): the records, and what its rules read from the last judged state. The runner calls it only
 * in a stage: while a step runs, every action is refused before it (D2-62).
 */
export interface ReviewState {
  items: readonly ItemRecord[];
  /**
   * RV-5 edges by item id, from the stage judgement: the real dependencies, Results included (§4.5). One source only
   * (builder 2b1a, carry-over R1-4): `depsById` of the records and the `deps` of the stage judgement the records were
   * reconciled with, a partial one (some draft `factsMissing`, ADV-3) included; never an older map. A partial map lacks
   * only the outgoing edges of the items whose facts are missing, whose Accept is refused meanwhile, and a cascade it
   * misses is made up by the next judge (their no-longer-builds reverts, then RV-5's defensive rule).
   */
  deps: Readonly<Record<string, readonly string[]>>;
  /** Both class maps of the stage judgement, by item key; the reducer uses the one in force (§4.7). */
  classes: Readonly<Record<string, ItemClass>>;
  classesBeforeReveal: Readonly<Record<string, ItemClass>>;
  /** Show results' force (`PersistedSession.forced`). */
  forced: SessionForce | null;
  inferences: readonly SessionInference[];
  rejectedArrows: readonly ArrowEnds[];
  /**
   * For every Result item id: the Add arrow items its question selected (a mid-stage Formalize, D2-20). DO-0 on one of
   * them also takes its source out of that question (D2-59).
   */
  questionArrows: Readonly<Record<string, readonly string[]>>;
  didNotPass: boolean;
  stack: { done: readonly SessionAction[]; undone: readonly SessionAction[] };
  /** The id the next SessionAction gets (`PersistedSession.nextAction`). */
  nextAction: number;
  /**
   * (builder 2a2, additive) The labels the reducer's texts use (refusals, stack labels): items by id, as the view labels
   * them, and cards by card id (a move's label). A missing one falls back to the kind's label and the key's names.
   */
  labels?: Readonly<Record<string, string>>;
}
export type ReviewAction =
  | { kind: 'decide'; decisions: readonly ItemDecision[]; own: boolean; confirmed: boolean }
  | { kind: 'reveal'; via: 'show-result' | 'raw-diff' | 'activity' }
  | { kind: 'move'; before: Readonly<Record<string, CanvasPosition | null>>; after: Readonly<Record<string, CanvasPosition>> }
  /** `step`: the SessionAction id the user saw; a different top of the stack gives `conflict`. */
  | { kind: 'undo' | 'redo'; step: number; confirmed: boolean }
  | { kind: 'seal'; by: SealBy }
  /** (2j2, D2-92, D2-95) Sets, replaces or (blank) clears the note of a listed item to be redone. */
  | { kind: 'note'; item: string; rev: number; note: string };
/** `needs-option` (fixer 2a, V2A-N2; additive): a group's plain decline of an item that is no arrow item (DO-0). */
export type GroupLeftReason = 'own-accept' | 'depends' | 'hidden-result' | 'blocked' | 'not-in-review' | 'needs-option';
export type ReviewOutcome =
  | {
      ok: true;
      items: ItemRecord[];
      inferences: SessionInference[];
      rejectedArrows: ArrowEnds[];
      /** The force after the action: set by `reveal`, cleared when a statement or belief item became undecided (§4.7). */
      forced: SessionForce | null;
      stack: ReviewState['stack'];
      nextAction: number;
      label: string;
      /** ActionOutcome.review's parts; a Result or a Result's part is never named while the results are hidden. */
      taken: string[];
      left: Array<{ item: string; reason: GroupLeftReason }>;
      cascade: CascadeEntry[];
      /**
       * telelean's reports of the action's own effects, D2-23's at a reveal included; never about a hidden item. The
       * runner numbers and times them (AF7, AF9).
       */
      events: Array<{ text: string; items: string[] }>;
      /** The ws/ changes, carried out at once through the write queue. */
      write: ItemWrite | null;
    }
  | { ok: false; code: 'needs-confirmation'; cascade: CascadeEntry[]; hiddenResults?: true }
  | { ok: false; code: 'refused' | 'conflict'; error: string; item?: string };

/**
 * RV-8 (§4.6; 2a2), generic so the webview runs it on ItemViews and the host on its records (F12). `blocked`: its
 * Accept is refused for a reason other than its dependencies ("did not pass", waiting for the results).
 */
export interface GroupItem {
  id: string;
  status: ItemStatus | null;
  dependsOn: readonly string[];
  ownAccept: boolean;
  hidden: boolean;
  blocked: boolean;
  arrow: boolean;
}

/** The RV-6 base mask (§4.7; filled by 2c1): while the results are hidden, every proof as in B. */
export interface BaseMask {
  /** Each target's `.holds` as in B: absent, or B's text. */
  holds: Record<string, { kind: 'absent' } | { kind: 'base'; name: string; text: string }>;
  /**
   * Every declaration created in a proof phase (ledger `created`, its first entry): lemmas, proof-phase definitions and
   * vocabulary. (Builder 2c1: never a name B has, which the ledger cannot have created.)
   */
  drop: string[];
  /** Claude's arrows: every ledger `arrow` entry. (Builder 2c1: but one B draws, which Claude cannot have added.) */
  dropArrows: ArrowEnds[];
  /** Written premise cards (ledger `premise`), with their arrows and mark removals. */
  dropNodes: string[];
  /**
   * (builder 2c1; additive) The mark removals of `dropNodes` as data: the cards a ledger `mark-removed` names that B
   * marked "follows from nothing", which show the mark again (`ProjectMask.restoreMarks`), so the marks show as in B.
   */
  restoreMarks: string[];
}

/**
 * What core reads of PersistedSession (§2.6). The runner's PersistedSession is this plus `format`, `version`,
 * `head`, `inFlight`, `judged` and `viewVersion`, with full PersistedStep records; `toSessionRecords` maps it.
 */
export interface SessionRecords {
  stage: number;
  phase: SessionView['phase'];
  inferences: SessionInference[];
  steps: Array<{
    id: string;
    kind: StepView['kind'];
    target: string;
    stage: number;
    state: StepState;
    /** The question it asked (its StepScope's). */
    question: StepScope['question'];
    /** Its finish said `no_alternative` (DO-3, §3.5). */
    noAlternative?: boolean;
    retryOf?: string;
    /**
     * (builder 2c2; additive) A12: the source its StepScope's `statementsOnly` named, for a statements-only step (D2-4).
     * The view reads it only while the results are shown: its Result's reason chip, "“‹L›” was not proved" (§3.4).
     */
    statementsOnly?: string;
    /**
     * (builder 2c2; additive) The queue it runs in: the queues of the session numbered from 1, in the order they start
     * (2d sets it at the queue's start). The view numbers a step "‹index› of ‹of›" within its queue (StepView); without
     * it, within the run of consecutive steps of the same stage and kind.
     */
    queue?: number;
  }>;
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
  confirmation?: {
    checkId: string;
    filesKey: string;
    state: 'running' | 'passed' | 'failed';
    failures: EndConfirmationView['check']['failures'];
    /** (builder 2c2; additive) The final check reused the last judgement's file checks (EN-2): the view's `reusedFileChecks`. */
    reusedFileChecks?: boolean;
  };
  drift?: { files: string[]; at: string };
  positions?: Record<string, CanvasPosition>;
  events: SessionView['events'];
}

/** buildSessionView's input (2c2). The function is pure; the runner gathers this. */
export interface SessionViewInput {
  runId: string;
  subject: string;
  records: SessionRecords;
  /** The stage judgement (`PersistedSession.judged`), computed again after a reload (D2-72); null until the first queue ends. */
  judgement: StateJudgement | null;
  /** B, with the base facts: the base mask takes proofs from them (§4.7). */
  base: ProjectModel;
  /**
   * The stage judgement's working copy (its commit's files, `judged-facts.json`), unmasked: buildSessionView masks it
   * while the results are hidden. Never ws/ while a queue runs.
   */
  current: ProjectModel;
  /** Lean's pretty and fully explicit renderings, by content key (§3.12). */
  renderings: Readonly<Record<string, { pretty: string; explicit: string }>>;
  /** Claude's words per step; buildSessionView shows them only while the results are shown (D2-10). */
  words: Readonly<
    Record<string, { summary?: string; gap?: string; proposedNothing?: string; assumedWithoutAsking?: Array<{ text: string; items: string[] }> }>
  >;
  judging: boolean;
  /** `PersistedSession.viewVersion`: the masked graph's `version` (F17). */
  viewVersion: number;
  /**
   * (builder 2c2; additive, §2.9's note on `maskedModel`) The build inputs the working copy's model was built with,
   * which a ProjectModel does not keep: the masked board is built with them too, so it flags what the working copy's
   * board flags (an endorsed definition, TL110). Absent: none.
   */
  endorsements?: ProjectInput['endorsements'];
  lakefile?: ProjectInput['lakefile'];
  /**
   * (fixer 2c2 r1, S-STAGE-PROBLEMS-NO-PATH; additive) The runner's own problems of the stage, which neither the records
   * nor the judgement hold: a premise write that failed (§3.8, 2f: "“‹item›” was accepted, but telelean could not write
   * it: …"), each with the ids of the items it names. While the results are hidden, one that names a hidden item is
   * left out (its text names it). Absent: none.
   */
  problems?: ReadonlyArray<{ text: string; items: readonly string[] }>;
}

/** The backstop (§4.10; filled by 2b2). */
export interface BackstopInput {
  base: ProjectModel;
  final: ProjectModel;
  items: readonly ItemRecord[];
  ledger: readonly LedgerEntry[];
  inferences: readonly SessionInference[];
  judgement: StateJudgement;
}
export interface BackstopRefusal {
  code:
    | 'facts'
    | 'unowned'
    | 'not-accepted'
    | 'not-written'
    | 'own-accept'
    | 'content-changed'
    | 'class'
    | 'arrow'
    | 'mark'
    | 'b2'
    | 'cycle'
    | 'kind'
    | 'scc';
  text: string;
  name?: string;
  arrow?: ArrowEnds;
  item?: string;
}

/**
 * Submit's plan (§3.7; filled by 2b2). Submit is open only while the results are shown, so the plan reads every item's
 * real status and dependencies.
 */
export interface SubmitPlan {
  /** Nothing Shaky, nothing to be redone: the end confirmation, with no Claude step (D2-54). */
  confirm: boolean;
  /** The affected inferences' targets, in the order their steps run (D2-57). */
  steps: string[];
  /** Item ids whose kept content is taken out before the queue starts (D2-57). */
  takeOut: string[];
  counts: { shaky: number; redo: number };
  /**
   * (builder 2b2; additive) RV-5 cycles of items (SCCs of two or more) with an accepted member that are not wholly
   * accepted, as item ids in the records' order: Submit to the end confirmation is refused while one exists, with
   * "Accept or reject all of ‹items› together." (§3.7, §4.5). One computation for the view's gate (2c2) and the runner (2e).
   */
  partlyAccepted: string[][];
}

/**
 * What formalizeStartProblems reads of a session (§4.12; 2b2; F12). The host builds it from SessionView, which holds all
 * of it while the results are shown, the only time a mid-stage Formalize is allowed (D2-65). The runner builds it from
 * its records and runs the full check itself, so the host's check only answers early (before consent, for a start).
 */
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
  /**
   * (builder 2b2; additive) Targets whose Result is declined Shaky, which `results` cannot tell from a Reject (check 5,
   * D2-53). The host reads it from the Result items' decline (`ItemView.declined`), the runner from its records. Without
   * it, a declined Result of a target in `shakyTargets` counts as Shaky.
   */
  shakyResults?: string[];
}
export interface StartProblem {
  check: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  card?: string;
  arrow?: ArrowEnds;
}
