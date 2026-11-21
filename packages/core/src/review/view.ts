/**
 * Slice 2 (docs/slice2-plan.md section 2.3): the views the host sends the webview in the `session` message. They are
 * built only by `buildSessionView` (2c2), on the host, so the webview receives only the masked view while the results
 * are hidden (RV-6, D2-5).
 *
 * CONTRACT (slice 2, the integrator's; 2a1 wrote the types, 2c2 writes `buildSessionView` here).
 */
import type { ArrowEnds } from '../actions.js';
import { holdsName, leanDurationMs, type DeclFacts, type FactsStatus } from '../facts.js';
import { declTables } from '../gate/decls.js';
import type { CanvasPosition } from '../layout.js';
import type { NodeType, SemanticSummary, TlGraph, TlNode, VocabItem, VocabKind } from '../model.js';
import { subjectGraph, type ProjectModel } from '../project/index.js';
import { cutText } from '../project/text.js';
import type { StatementReview } from '../run.js';
import { constsOf } from './closure.js';
import { parseItemKey, proofKey, type ParsedItemKey } from './keys.js';
import { baseMask, maskedModel } from './mask.js';
import { depsById, inWorkingCopy, isArrowKind, isDeclinedOut, isReverted } from './records.js';
import { decidedBy, itemGates } from './reducer.js';
import { isResultOrPart, resultsState } from './reveal.js';
import { planSubmit } from './submit.js';
import { CLASS_REASON_TEXTS, DECL_KIND_LABELS, ITEM_KIND_LABELS, REVIEW_TEXTS } from './texts.js';
import type {
  DeclKind,
  DeclineOption,
  ItemClass,
  ItemKind,
  ItemMarker,
  ItemRecord,
  ItemStatus,
  ResultFlag,
  ReviewState,
  SealBy,
  SessionAction,
  SessionInference,
  SessionRecords,
  SessionViewInput,
  StateJudgement,
  StepState,
} from './types.js';

export type Gate = { ok: true } | { ok: false; reason: string; missing?: string[] };
export interface CardRef {
  id: string;
  type: NodeType;
  sentence: string;
  wordedBy: 'user' | 'agent';
}
export interface LeanStatementView {
  name: string;
  pretty: string;
  explicit: string;
  closure: StatementReview['closure'];
}

/** The phases of a session (§2.3; `SessionView.phase`). */
export type SessionPhase = 'step' | 'interrupted' | 'stage' | 'confirming' | 'applying';

export interface SessionView {
  runId: string;
  subject: string;
  /** The review stage, from 1; 0 until the session's first queue ends. */
  stage: number;
  phase: SessionPhase;
  /**
   * The stage reveal (RV-6, §4.7): shown when no statement or belief item is undecided, or when Show results forced
   * them. `waitingFor`: the undecided statement and belief items: in review, or to be redone with their content still
   * in ws/ (AF4).
   */
  results: { shown: boolean; forced: boolean; waitingFor: string[] };
  inferences: InferenceView[];
  steps: StepView[];
  /** ES-4. */
  heading: { kind: 'did-not-pass' | 'cancelled' | 'failed'; text: string; firstStep: boolean; retry: Gate } | null;
  /**
   * In list order (§5.5). While the results are hidden, each Result is a neutral row and Results' parts are left out
   * (§4.7). While a queue runs: the stage as it was when the queue started, with every action gate closed (D2-62, D2-63).
   */
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
  /**
   * A judge runs or is due, or the session's write queue holds a write (a decision's, a take-out, a premise write, a
   * completion): Submit, Apply, a mid-stage Formalize and Retry wait (§3.6, AF3).
   */
  judging: boolean;
  /** Open only while the results are shown (§3.7), so `work` reads real statuses (`planSubmit`). */
  submit: { gate: Gate; next?: 'confirm' | 'claude-steps'; work?: { shaky: number; redo: number; steps: number } };
  /** Mid-stage Formalize (RV-9): closed while a step runs, while judging, and while the results are hidden (D2-65). */
  formalize: Gate;
  confirmation?: EndConfirmationView;
  /**
   * telelean's own changes since the user's last action, newest last, at most 50; never about a hidden item. No event
   * is made for a change that touches only hidden items, and the runner numbers each new event after the last one, so
   * the ids count visible events only (AF7).
   */
  events: Array<{ id: number; at: string; text: string; items: string[] }>;
  /**
   * (fixer 2c2 r1, S-STAGE-PROBLEMS-NO-PATH; additive) The stage's problems, which the final check refuses too (§2.1,
   * §3.5, §3.8, §4.2): the stage judgement's `facts` and `unowned` problems; an item that disappeared with no decision
   * removing it (§3.5, read from the records and the judgement's drafts, not while judging); the runner's own
   * (`SessionViewInput.problems`: a premise write that failed). `items`: the listed items each names. Never about a
   * hidden item: while the results are hidden, a problem that names only hidden items, or a runner's that names one, is
   * left out. The judgement's `no-longer-builds` problems are not repeated: reconcile takes those items out and its
   * event names them, and their text holds Lean's message and positions, which hidden lines move.
   */
  problems: Array<{ text: string; items: string[] }>;
}

export interface InferenceView {
  target: CardRef;
  /**
   * While the results are hidden: the question the target's latest ended step asked, whether or not that step proved
   * it (§3.2); while a step runs, the same for a target whose step ended in the running queue (fixer 2c2 r1,
   * A-V2C2-ADV-1). Either is shown less the sources the user's declines took out of it once that step's queue had
   * started (D2-59, A-V2C2-ADV-6; builder 2b3a, R1-1). Otherwise the question on record.
   */
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
  /**
   * While the results are hidden, an ended step reads `ended`, whatever happened (passed, gave up, statements only).
   * `not-run`: a Cancel step or a failure earlier in its queue dropped it; Retry step runs it (§3.4).
   */
  state: 'queued' | 'running' | 'ended' | 'cancelled' | 'failed' | 'interrupted' | 'not-run';
  /** Only while the results are shown: what happened, in telelean's words. */
  outcome?: string;
  /** Claude's activity, gate attempts and notices of this step: withheld while a step runs and while the results are hidden (D2-10). */
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
  /**
   * `heldAs`: from the Accept (`accepted.holdAs`), shown from the Accept on. `writtenInReview`: an adopted ghost of a
   * converted v1 run, already written as an AXIOM card, so hold-as offers only "as an axiom" (§3.11, AF12).
   */
  | {
      kind: 'add-premise';
      sentence: string;
      leanName: string;
      target: CardRef;
      statement: LeanStatementView;
      whyNeeded: string;
      mayRestate: boolean;
      replacesFromNothing: boolean;
      heldAs?: 'axiom' | 'pending';
      writtenInReview?: true;
    }
  | { kind: 'add-arrow' | 'remove-arrow'; source: CardRef; target: CardRef; why?: string; addsNoNewBasis: boolean }
  | { kind: 'delete'; card: CardRef; arrows: ArrowEnds[]; mentionedBy: CardRef[] }
  | { kind: 'vocabulary-term'; name: string; vocabKind: VocabKind; type?: string; gloss?: string; glossBy?: 'user' | 'agent'; code: string }
  | {
      kind: 'declaration';
      declKind: DeclKind;
      name: string;
      code: string;
      before?: string;
      gloss?: string;
      glossBy?: 'user' | 'agent';
      usedByStatementsOf: CardRef[];
    }
  /** Hidden: `question` as in its InferenceView. Shown: `gap` and `summary` too (D2-10). */
  | { kind: 'result'; target: CardRef; question: CardRef[]; fromNothing: boolean; revealed: false; seenEarly: boolean }
  | {
      kind: 'result';
      target: CardRef;
      question: CardRef[];
      fromNothing: boolean;
      revealed: true;
      seenEarly: boolean;
      verdict: 'established' | 'proved' | 'not-proved';
      reasonChip?: string;
      flags: ResultFlag[];
      proof?: { name: string; code: string };
      previousProof?: string;
      band: { used: string[]; notNeeded: string[]; complete: boolean; open: string[] };
      restsOn: string[];
      throughResults: string[];
      basisChanged: CardRef[];
      gap?: string;
      missingArrows: Array<{ source: string; drawn: boolean }>;
      arrowItems: string[];
      premiseItems: string[];
      completion?: 'checked' | 'not-checked';
      summary?: string;
    }
  | { kind: 'proof-broken'; card: CardRef; error: string };
export interface FieldChangeView {
  field: 'sentence' | 'statement' | 'why' | 'stance' | 'source' | 'dependencies';
  before?: string;
  after?: string;
  beforeStatement?: LeanStatementView;
  afterStatement?: LeanStatementView;
}

export interface SessionBoardView {
  /**
   * The stage judgement's working copy. While the results are hidden, under the base mask (§4.7): every proof-derived
   * datum as in B, statements and vocabulary from the working copy.
   */
  graph: TlGraph;
  /** Targets with the neutral chip: every target while the results are hidden, else []. */
  hiddenTargets: string[];
  /**
   * Listed items per card, for the card's mark. While the results are hidden, Results are left out: the target's
   * neutral chip stands for them, so no status is ever needed for a hidden one (AF9).
   */
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
  targets: Array<{
    target: string;
    revealed: boolean;
    verdict?: 'established' | 'proved' | 'not-proved';
    reasonChip?: string;
    band?: { used: string[]; complete: boolean; open: string[] };
    restsOn?: string[];
    throughResults?: string[];
    notNeeded?: string[];
    missing?: Array<{ text: string; select?: ArrowEnds }>;
  }>;
  /** Claude's words: only while the results are shown (D2-10). */
  steps: Array<{
    step: string;
    target: string;
    revealed: boolean;
    summary?: string;
    assumedWithoutAsking?: Array<{ text: string; items: string[] }>;
    proposedNothing?: string;
  }>;
  /**
   * telelean's lines about questions, only while the results are shown: a re-ask that was not proved (§3.2), and a
   * source that left a question (D2-59).
   */
  notes: string[];
  consistency: 'unchecked';
  /** Results and their parts are left out while the results are hidden (F10). */
  withdrawn: Array<{ label: string; at: string }>;
}

export type FinalCheckRule =
  | 'drift'
  | 'facts'
  | 'build'
  | 'rules'
  | 'permitted'
  | 'no-hidden-edges'
  | 'arrows'
  | 'kinds'
  | 'comparator'
  | 'items'
  | 'backstop';
export interface EndConfirmationView {
  changes: Array<{ item: string; label: string }>;
  rejected: Array<{ item: string; label: string }>;
  /** Inferences whose step never ended (D2-44). */
  notRun: string[];
  endorsed: Array<{ name: string; declKind: DeclKind }>;
  check: {
    id: string;
    state: 'running' | 'passed' | 'failed';
    reusedFileChecks: boolean;
    failures: Array<{ rule: FinalCheckRule; text: string; items?: string[]; declaration?: string }>;
  };
  /** Nothing accepted: Apply only records the outcome (D2-39). */
  empty: boolean;
  apply: Gate;
}
/** "Rejected in this session". Results and their parts are left out while the results are hidden (F10). */
export interface RejectedView {
  item: string;
  label: string;
  rev: number;
  at: string;
  unreject: Gate;
  superseded: boolean;
}

// ---------------------------------------------------------------------------------------------
// 2c2: buildSessionView (§2.3, §4.7; builder 2c2)

const OPEN: Gate = { ok: true };
/** A closed gate; `missing` only when it names something ("Select them", "Go to the first one"). */
function closed(reason: string, missing?: readonly string[]): Gate {
  return missing !== undefined && missing.length > 0 ? { ok: false, reason, missing: [...missing] } : { ok: false, reason };
}

/** An object without its undefined properties, so the JSON the twins compare holds only what is there. */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/** A record without a prototype, so no card id or item id is read as one of Object's own keys (`__proto__`, …). */
const record = <T>(): Record<string, T> => Object.create(null) as Record<string, T>;
const own = <T>(map: Readonly<Record<string, T>>, key: string): T | undefined => (Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined);

/** A class the judgement did not give: every badge, incomplete (fail closed, D2-25; as the reducer reads it). */
const UNKNOWN_CLASS: ItemClass = { belief: true, changesProved: true, reasons: [], complete: false };

type Step = SessionRecords['steps'][number];
/** Ended steps (§3.4): passed (statements only too) or gave up. Their Results exist (F9). */
const ENDED: ReadonlySet<StepState> = new Set<StepState>(['passed', 'gave-up']);
const STEP_STATES: Readonly<Record<StepState, StepView['state']>> = {
  queued: 'queued',
  running: 'running',
  passed: 'ended',
  'gave-up': 'ended',
  cancelled: 'cancelled',
  failed: 'failed',
  interrupted: 'interrupted',
  'not-run': 'not-run',
};

/** The review actions a phase closes (D2-62: while a step runs; the confirmation; Apply), or undefined in a stage. */
function phaseClosure(phase: SessionPhase): string | undefined {
  switch (phase) {
    case 'step':
    case 'interrupted':
      return REVIEW_TEXTS.stepRunning;
    case 'confirming':
      return REVIEW_TEXTS.formalizeConfirming;
    case 'applying':
      return REVIEW_TEXTS.applyingNow;
    case 'stage':
      return undefined;
  }
}

/** The sandbox's statuses (facts with no declarations), as the board's summary reads them (runner `summarize`). */
const SANDBOX_STATES: Readonly<Partial<Record<FactsStatus, SemanticSummary['state']>>> = {
  'low-memory': 'paused-low-memory',
  'unsupported-toolchain': 'unsupported-toolchain',
  'unsupported-project': 'disabled',
  'could-not-start': 'disabled',
  timeout: 'failed',
  oom: 'failed',
  cancelled: 'failed',
};

/**
 * The board's semantic summary (§4.7). While the results are hidden: no time, duration, detail or stale files, and the
 * error count and the state read the masked facts only (`failed` when a masked message is an error, a declaration's
 * probe failed, or the state's probe failed: §2.1's accepted residual), so no hidden error changes them. The sandbox
 * statuses, which come with no declarations (a timeout, out of memory, cancelled, low memory, could not start), map as
 * the runner maps them, hidden or not: that a judge's build ran out of time can depend on hidden content, one of §4.7's
 * accepted residuals (fixer 2c2 r1, S-HIDDEN-SUMMARY-ENVELOPE). Once shown: the working copy's facts as the runner's
 * summary reads them.
 */
function semanticOf(model: ProjectModel, hidden: boolean): SemanticSummary {
  const facts = model.facts;
  if (facts === undefined) return { state: 'unavailable' };
  const errors = facts.build.messages.filter((m) => m.severity === 'error').length + facts.decls.filter((d) => d.error !== undefined).length;
  const probeFailed = facts.probe?.status === 'cut' || facts.probe?.status === 'failed';
  const stale = hidden ? [] : [...model.files.keys()].filter((path) => !model.freshFiles.has(path)).sort();
  const failed = errors > 0 || probeFailed || (!hidden && facts.status !== 'ok');
  const state = SANDBOX_STATES[facts.status] ?? (failed ? 'failed' : stale.length > 0 ? 'stale' : 'fresh');
  const detail = facts.detail?.trim();
  return compact<SemanticSummary>({
    state,
    ...(facts.toolchain !== '' ? { toolchain: facts.toolchain } : {}),
    ...(hidden
      ? {}
      : {
          ...(detail !== undefined && detail !== '' ? { detail } : {}),
          checkedAt: facts.finishedAt,
          durationMs: leanDurationMs(facts),
          ...(stale.length > 0 ? { staleFiles: stale } : {}),
        }),
    ...(errors > 0 ? { errorCount: errors } : {}),
  });
}

/** A node without its source positions (`loc`, `lean.codeLoc`): the Proposed view never opens ws/ (§4.7, §5.10). */
function withoutPositions(node: TlNode): TlNode {
  const copy: TlNode = { ...node, lean: { ...node.lean } };
  delete copy.loc;
  delete copy.lean.codeLoc;
  return copy;
}

/** One subject's board of `model`, positions stripped (nodes, vocabulary, diagnostics), `version` the view's (F17). */
function boardGraph(model: ProjectModel, subject: string, version: number, hidden: boolean): TlGraph {
  const graph = subjectGraph(model, subject, { version, semantic: semanticOf(model, hidden) });
  return {
    ...graph,
    version,
    nodes: graph.nodes.map(withoutPositions),
    vocabulary: graph.vocabulary.map((v) => {
      const copy: VocabItem = { ...v };
      delete copy.loc;
      return copy;
    }),
    diagnostics: graph.diagnostics.map((d) => {
      const copy = { ...d };
      delete copy.range;
      return copy;
    }),
  };
}

const cardRefOf = (node: TlNode): CardRef => ({ id: node.id, type: node.type, sentence: node.naturalName, wordedBy: node.provenance.wordedBy });

/** The card an item is grouped under (§5.5, RV-2: arrow and premise items under their target), if any. */
function groupCardOf(parsed: ParsedItemKey | undefined): string | undefined {
  switch (parsed?.kind) {
    case 'card':
    case 'proof':
      return parsed.node;
    case 'premise':
      return parsed.target;
    case 'arrow':
    case 'unarrow':
      return parsed.arrow.target;
    default:
      return undefined;
  }
}

/** A statement's source text without its docstring (what the view shows when Lean has not rendered it). */
function statementSource(model: ProjectModel, name: string): string {
  const entry = declTables(model).byName.get(name);
  if (entry === undefined) return '';
  const start = entry.decl.docSpan?.end ?? entry.decl.span.start;
  return entry.file.text.slice(start, entry.decl.span.end).trim();
}

/** One entry of a statement's closure (StatementReview's): a vocabulary item, a card's statement, or another name. */
function closureEntry(model: ProjectModel, vocabulary: ReadonlyMap<string, VocabItem>, name: string): LeanStatementView['closure'][number] {
  const item = vocabulary.get(name);
  if (item !== undefined) return compact({ name, kind: item.kind, type: item.type, gloss: item.gloss, glossBy: item.glossBy });
  const owner = model.ownerOfDecl.get(name);
  const card = owner !== undefined ? model.nodes.get(owner)?.node : undefined;
  const facts = model.declFacts.get(name);
  if (card !== undefined) return compact({ name, kind: 'statement', type: facts?.type, gloss: card.naturalName, glossBy: card.provenance.wordedBy });
  return compact({ name, kind: facts?.kind ?? 'other', type: facts?.type, gloss: facts?.docstring });
}

/** The proof footprint a card's status gives (proved, or conditional), for comparing B with the working copy. */
function footprintKey(node: TlNode | undefined): string {
  const proof = node?.status.proof;
  if (proof === undefined) return '';
  const footprint = proof.kind === 'proved' ? proof.footprint : proof.kind === 'conditional' ? (proof.footprint ?? []) : [];
  return `${proof.kind}:${[...footprint].sort().join('\u0000')}`;
}

/** An Add premise's statement name: its draft's facts' name for its Lean name (qualified), else the Lean name. */
function premiseStatementName(draft: NonNullable<ItemRecord['content']['premise']>): string {
  const names = Object.keys(draft.facts).sort();
  return names.find((n) => n === draft.leanName) ?? names.find((n) => n.endsWith(`.${draft.leanName}`)) ?? draft.leanName;
}

/** The text of an item's content (its declarations, in its order). */
const contentText = (content: ItemRecord['content']): string => content.decls.map((d) => d.text).join('\n');

/**
 * A step's number in its queue (StepView `index` and `of`): the steps that share its queue (`queue`, 2d), else the run
 * of consecutive steps of its stage and kind (a queue's steps are recorded together, in their order).
 */
function stepNumbers(steps: SessionRecords['steps']): Map<string, { index: number; of: number }> {
  const groups = new Map<string, string[]>();
  const groupOf = new Map<string, string>();
  let run = 0;
  let previous: string | undefined;
  for (const step of steps) {
    let key: string;
    if (step.queue !== undefined) key = `queue:${step.queue}`;
    else {
      const runKey = `${step.stage}:${step.kind}`;
      if (runKey !== previous) run += 1;
      key = `run:${run}`;
    }
    previous = step.queue !== undefined ? undefined : `${step.stage}:${step.kind}`;
    const list = groups.get(key) ?? [];
    list.push(step.id);
    groups.set(key, list);
    groupOf.set(step.id, key);
  }
  const out = new Map<string, { index: number; of: number }>();
  for (const step of steps) {
    const list = groups.get(groupOf.get(step.id) as string) as string[];
    out.set(step.id, { index: list.indexOf(step.id) + 1, of: list.length });
  }
  return out;
}

/**
 * Builder 2c2: an item's full label, the kind's label and what it names (card sentences, the premise's sentence, a
 * Lean name), for the texts that name an item: the reducer's `ReviewState.labels` (2e builds them from the view with
 * this), "Rejected in this session", the end confirmation, the withdrawn list, the gates' texts.
 */
export function itemLabel(item: Pick<ItemView, 'label' | 'kind' | 'cards' | 'detail'>): string {
  const detail = item.detail;
  return labelText(
    item.label,
    item.kind,
    item.cards,
    detail.kind === 'add-premise' ? detail.sentence : undefined,
    detail.kind === 'vocabulary-term' || detail.kind === 'declaration' ? detail.name : undefined,
  );
}

/** An item's full label from what its view holds (one rule for `itemLabel` and the view's own labels). */
function labelText(label: string, kind: ItemKind, cards: readonly CardRef[], sentence: string | undefined, name: string | undefined): string {
  const quote = (card: CardRef | undefined) => `“${cutText(card?.sentence ?? '', 60)}”`;
  switch (kind) {
    case 'add-premise':
      return `${label} “${cutText(sentence ?? '', 60)}”`;
    case 'vocabulary-term':
    case 'declaration':
      return `${label} ${name ?? ''}`;
    case 'add-arrow':
    case 'remove-arrow':
      return `${label} ${quote(cards[0])} → ${quote(cards[1])}`;
    default:
      return cards.length > 0 ? `${label} ${quote(cards[0])}` : label;
  }
}

/**
 * Builder 2c2: the labels the reducer's texts use (`ReviewState.labels`, builder 2a2: "items by id, as the view labels
 * them, and cards by card id"): every item the view lists, by id (`itemLabel`), and every card of its board, quoted.
 */
export function sessionLabels(view: Pick<SessionView, 'items' | 'board'>): Record<string, string> {
  const labels = Object.create(null) as Record<string, string>;
  for (const node of view.board.graph.nodes) labels[node.id] = `“${cutText(node.naturalName, 60)}”`;
  for (const item of view.items) labels[item.id] = itemLabel(item);
  return labels;
}

/**
 * Builder 2c2: the reducer's input (§2.9 `ReviewState`) for a session's records and its stage judgement, as the view
 * reads them, so whoever reduces (the host's early answers, the runner in 2e) reads what the view shows: the RV-5 edges
 * by item id (`depsById` of the judgement's), both class maps, Show results' force, the Add arrow items each question
 * selected (D2-20, D2-59: Claude's arrow `s` → T with `s` in T's question), "did not pass" from the heading (ES-4).
 * With no judgement yet, no class and no edge (an item then counts as RV-7, fail closed). `labels`: the view's
 * (`sessionLabels`); without them the reducer names items by their fallbacks.
 */
export function reviewStateOf(records: SessionRecords, judgement: StateJudgement | null, labels?: Readonly<Record<string, string>>): ReviewState {
  const questionArrows = Object.create(null) as Record<string, string[]>;
  for (const inf of records.inferences) {
    const result = records.items.find((r) => r.key === proofKey(inf.target));
    if (result === undefined) continue;
    questionArrows[result.id] = records.items
      .filter((r) => {
        const parsed = parseItemKey(r.key);
        return parsed?.kind === 'arrow' && parsed.arrow.target === inf.target && inf.question.sources.includes(parsed.arrow.source);
      })
      .map((r) => r.id);
  }
  return {
    items: records.items,
    deps: depsById(records.items, judgement?.deps ?? {}),
    classes: judgement?.classes ?? {},
    classesBeforeReveal: judgement?.classesBeforeReveal ?? {},
    forced: records.forced ?? null,
    inferences: records.inferences,
    rejectedArrows: records.rejectedArrows,
    questionArrows,
    didNotPass: records.heading?.kind === 'did-not-pass',
    stack: records.stack,
    nextAction: records.nextAction,
    ...(labels !== undefined ? { labels } : {}),
  };
}

/**
 * 2c2 (`review/view.ts`): the one builder of SessionView (§2.3, §4.7), pure (AF8). The results of the stage are shown or
 * hidden together (`resultsState`, D2-61). While they are hidden:
 *  - each Result is a neutral row: rev 0, no status, no class, no dependencies, only the seen-early marker, its detail
 *    the question its target's latest ended step asked (§3.2); it can be neither accepted nor declined (D2-8);
 *  - Results' parts (arrow and premise items, proof-phase definitions: `ItemRecord.partOf`) are left out of the list,
 *    the counts, the board, "Rejected in this session" and the withdrawn list (F10), and no listed item names one (its
 *    dependencies, its `redo.because`, the events);
 *  - the board is the stage judgement's working copy under the base mask (`maskedModel`, 2c1), and its semantic summary
 *    has no time, duration, detail or stale files, its error count recounted from the masked messages;
 *  - the report has no verdict, band, Rests on, missing list, step outcome, note or Claude's words (D2-10), every
 *    step's activity is withheld, and Submit and a mid-stage Formalize are closed (§3.7, D2-65).
 * Once they are shown, the board is the working copy, unmasked, and every Result is listed with its real status. Either
 * way the graph carries no source position (§4.7) and its `version` is `viewVersion` (F17).
 * While a step runs (phases `step` and `interrupted`) the view is the stage as it was when the queue started (the
 * runner passes the stage judgement and its working copy, never ws/), with every action gate closed (D2-62, D2-63), no
 * Undo or Redo, and no step outcome, reason chip or Claude's words; a target whose step ended in the running queue
 * shows the question that step asked, whatever it proved (fixer 2c2 r1, A-V2C2-ADV-1). Before the first stage
 * judgement (`judgement` null) the board is B (fail closed, C-V2C2-C6).
 */
export function buildSessionView(input: SessionViewInput): SessionView {
  const { records, judgement } = input;
  const phase = records.phase;
  const running = phase === 'step' || phase === 'interrupted';
  const closure = phaseClosure(phase);
  const classesBefore = judgement?.classesBeforeReveal ?? {};
  const reveal = resultsState({ items: records.items, classesBeforeReveal: classesBefore, forced: records.forced ?? null });
  const shown = reveal.shown;
  /** Claude's words, step outcomes and reason chips: only while the results are shown and no step runs (D2-10). */
  const outcomes = shown && !running;
  const hidden = (r: ItemRecord) => !shown && isResultOrPart(r);
  const classes = shown ? (judgement?.classes ?? {}) : classesBefore;
  const classOf = (r: ItemRecord): ItemClass => own(classes, r.key) ?? UNKNOWN_CLASS;

  // ---- the board (§4.7): the stage judgement's working copy, under the base mask while the results are hidden. Before
  // the first stage judgement (the session's first queue) nothing was judged, so nothing can be shown: B, whatever
  // working copy the caller passes (fixer 2c2 r1, C-V2C2-C6, A-V2C2-ADV-4: fail closed)
  const model =
    judgement === null
      ? input.base
      : shown
        ? input.current
        : maskedModel({
            current: input.current,
            base: input.base,
            mask: baseMask({ base: input.base, inferences: records.inferences, ledger: records.ledger }),
            ...(input.endorsements !== undefined ? { endorsements: input.endorsements } : {}),
            ...(input.lakefile !== undefined ? { lakefile: input.lakefile } : {}),
          });
  const graph = boardGraph(model, input.subject, input.viewVersion, !shown);
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const vocabulary = new Map(graph.vocabulary.map((v) => [v.name, v]));
  const baseTables = declTables(input.base);
  /** A card as the board shows it; else B's (never the working copy's while hidden: a written premise card is dropped). */
  const cardRef = (id: string): CardRef => {
    const node = nodes.get(id) ?? input.base.nodes.get(id)?.node ?? (shown && judgement !== null ? input.current.nodes.get(id)?.node : undefined);
    return node !== undefined ? cardRefOf(node) : { id, type: 'PROPOSITION', sentence: id, wordedBy: 'agent' };
  };
  const quoted = (id: string) => `“${cutText(cardRef(id).sentence, 60)}”`;

  // ---- the records, the inferences and their questions
  const byId = new Map(records.items.map((r) => [r.id, r]));
  const byKey = new Map(records.items.map((r) => [r.key, r]));
  const inferences = records.inferences
    .map((inf, at) => ({ inf, at }))
    .sort((a, b) => a.inf.order - b.inf.order || a.at - b.at)
    .map(({ inf }) => inf);
  const latestEnded = new Map<string, Step>();
  for (const step of records.steps) if (ENDED.has(step.state)) latestEnded.set(step.target, step);
  /**
   * D2-59: the sources the user's declines took out of each target's question (the done stack's decide actions), each
   * with the number of seals before its action in the done stack. Every queue after the session's first starts with one
   * seal (§4.6: Submit review that queues steps, a mid-stage Formalize, Retry step; the first queue has none), and a seal
   * is never undone, so `seals` + 1 queues had started when the decline was made (builder 2b3a, carry-over R1-1).
   */
  const removals: Array<{ source: string; target: string; seals: number }> = [];
  let sealsSoFar = 0;
  for (const action of records.stack.done) {
    if (action.kind === 'seal') sealsSoFar += 1;
    if (action.kind !== 'decide') continue;
    for (const change of action.questions) {
      const after = new Set(change.after.sources);
      for (const source of change.before.sources) if (!after.has(source)) removals.push({ source, target: change.target, seals: sealsSoFar });
    }
  }
  /**
   * The question a step asked, less the sources the user's declines took out of it since (D2-59; fixer 2c2 r1,
   * A-V2C2-ADV-6): the user's own decisions, made while the results were shown, so it tells no outcome. A decline counts
   * only against a step whose queue had started when it was made (queue q ≥ 2 starts at the (q−1)-th seal): an
   * un-reject takes the declined arrow out of `rejectedArrows`, and once accepted it can be selected again, so a later
   * re-ask may ask that source again (builder 2b3a, carry-over R1-1). A step without a queue number counts every decline.
   */
  const askedBy = (step: Step): SessionInference['question'] => {
    const removed = new Set(
      removals.filter((l) => l.target === step.target && (step.queue === undefined || step.queue <= l.seals + 1)).map((l) => l.source),
    );
    return { sources: step.question.sources.filter((s) => !removed.has(s)), fromNothing: step.question.fromNothing };
  };
  const sameQuestion = (a: SessionInference['question'], b: SessionInference['question']) =>
    a.fromNothing === b.fromNothing && [...new Set(a.sources)].sort().join('\u0000') === [...new Set(b.sources)].sort().join('\u0000');
  /** The queue that runs while a step runs: the newest one (2d numbers them from 1); a step without a number counts as in it. */
  const runningQueue = records.steps.reduce<number | undefined>((max, s) => (s.queue !== undefined && (max === undefined || s.queue > max) ? s.queue : max), undefined);
  const inRunningQueue = (step: Step) => step.queue === undefined || step.queue === runningQueue;
  const stepById = new Map(records.steps.map((s) => [s.id, s]));
  /**
   * The ledger as the view's details read it (builder 2b3a, carry-over R1-2): while a step runs, without the entries a
   * step of the running queue wrote (`arrow` and `created` name their step; one naming no recorded step counts as the
   * running queue's), so the view reads the ledger as it was when the queue started (D2-63). The `premise`,
   * `mark-removed` and `completion` entries name no step: only a write outside a step makes or drops one, and none runs
   * during a queue (D2-62), so all of them stay. The base mask still reads the whole ledger: it drops what the entries
   * name, and must not keep a proof-phase declaration whose step no queue number places.
   */
  const ledgerSeen = running
    ? records.ledger.filter((e) => {
        if (e.kind !== 'arrow' && e.kind !== 'created') return true;
        const step = stepById.get(e.step);
        return step !== undefined && !inRunningQueue(step);
      })
    : records.ledger;
  /**
   * §3.2, AF5: the question an InferenceView shows. While the results are hidden, the one its target's latest ended step
   * asked. While a step runs (fixer 2c2 r1, A-V2C2-ADV-1), the same for a target whose step ended in the running queue: a
   * proved re-ask puts its new question on the record when it ends, mid-queue (D2-46), and one that is not proved leaves
   * the old one, so the record's would tell the outcome; for any other target the record's, as when the queue started.
   * Otherwise the record's. A question asked is shown less D2-59's removals (`askedBy`).
   */
  const questionOf = (inf: SessionInference): SessionInference['question'] => {
    const step = latestEnded.get(inf.target);
    return step !== undefined && (!shown || (running && inRunningQueue(step))) ? askedBy(step) : inf.question;
  };
  /**
   * The ended step whose version of a target's Result stands (fixer 2c2 r1, A-V2C2-ADV-5): the latest that asked the
   * question on record, less D2-59's removals, since a re-ask that did not prove its target leaves the earlier question
   * and Result on the record (§3.2); else the latest ended step. Its reason chip and Claude's words go with the Result.
   */
  const standingStep = (target: string): Step | undefined => {
    const inference = records.inferences.find((inf) => inf.target === target);
    for (let k = records.steps.length - 1; k >= 0 && inference !== undefined; k--) {
      const step = records.steps[k] as Step;
      if (step.target === target && ENDED.has(step.state) && sameQuestion(askedBy(step), inference.question)) return step;
    }
    return latestEnded.get(target);
  };
  const resultOf = (target: string) => byKey.get(proofKey(target));

  // ---- labels, dependencies and the reducer's gates
  const kindLabel = (r: Pick<ItemRecord, 'kind' | 'declKind'>) =>
    r.kind === 'declaration' && r.declKind !== undefined ? DECL_KIND_LABELS[r.declKind] : ITEM_KIND_LABELS[r.kind];
  /** The card an item is about (its group's card, or the target of the step that proposed it), its cards, its name. */
  const cardsOf = (r: ItemRecord): CardRef[] => {
    const parsed = parseItemKey(r.key);
    switch (parsed?.kind) {
      case 'card':
      case 'proof':
        return [cardRef(parsed.node)];
      case 'premise':
        return [cardRef(parsed.target), ...(r.card !== undefined && !hidden(r) ? [cardRef(r.card)] : [])];
      case 'arrow':
      case 'unarrow':
        return [cardRef(parsed.arrow.source), cardRef(parsed.arrow.target)];
      default:
        return [];
    }
  };
  const nameOf = (r: ItemRecord): string => {
    const parsed = parseItemKey(r.key);
    return parsed?.kind === 'vocab' || parsed?.kind === 'decl' ? parsed.name : r.key;
  };
  const premiseSentenceOf = (r: ItemRecord): string => {
    const parsed = parseItemKey(r.key);
    return r.content.premise?.naturalName ?? r.content.premise?.leanName ?? (parsed?.kind === 'premise' ? parsed.leanName : '');
  };
  /** The full label (`itemLabel`'s rule, on the record): what the reducer's texts and the view's own lists name. */
  const labelOf = (r: ItemRecord): string => labelText(kindLabel(r), r.kind, cardsOf(r), premiseSentenceOf(r), nameOf(r));
  const labels = record<string>();
  for (const n of graph.nodes) labels[n.id] = quoted(n.id);
  for (const r of records.items) labels[r.id] = labelOf(r);
  const allDeps = depsById(records.items, judgement?.deps ?? {});
  const isListedId = (id: string) => {
    const r = byId.get(id);
    return r !== undefined && !hidden(r);
  };
  const dependsOn = (r: ItemRecord): string[] => (hidden(r) ? [] : (allDeps[r.id] ?? []).filter(isListedId));
  const dependents = new Map<string, string[]>();
  for (const r of records.items) {
    if (hidden(r) || r.status !== 'accepted') continue;
    for (const d of dependsOn(r)) dependents.set(d, [...(dependents.get(d) ?? []), r.id]);
  }
  const gates = itemGates(reviewStateOf(records, judgement, labels));
  const phaseGate = (gate: Gate): Gate => (closure !== undefined ? closed(closure) : gate);

  // ---- list order (§5.5): sources that are not targets (board order), Vocabulary, Definitions, the targets (inference
  // order), other cards (board order), cards not on the board; within a card its fields item, its Add arrow items, its
  // Add premise items, its Result; within a group the records' order. Then every item's listed dependencies come before
  // it: a walk from that order places each item's dependencies first, in their own order (a cycle as the walk meets it)
  const targetRank = new Map(inferences.map((inf, i) => [inf.target, i]));
  const sources = new Set(inferences.flatMap((inf) => questionOf(inf).sources).filter((s) => !targetRank.has(s)));
  const boardIndex = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const placeOf = (r: ItemRecord): [number, number, string, number] => {
    const parsed = parseItemKey(r.key);
    if (parsed?.kind === 'vocab') return [2, 0, '', 0];
    if (parsed?.kind === 'decl') return [3, 0, '', 0];
    const card = groupCardOf(parsed);
    if (card === undefined) return [6, 0, r.key, 0];
    const within = parsed?.kind === 'card' ? 0 : parsed?.kind === 'arrow' || parsed?.kind === 'unarrow' ? 1 : parsed?.kind === 'premise' ? 2 : 3;
    const rank = targetRank.get(card);
    if (rank !== undefined) return [4, rank, card, within];
    const at = boardIndex.get(card);
    if (at !== undefined) return [sources.has(card) ? 1 : 5, at, card, within];
    return [6, 0, card, within];
  };
  const shownRecords = records.items.filter((r) => !hidden(r) || r.kind === 'result');
  const recordIndex = new Map(records.items.map((r, i) => [r.id, i]));
  const compare = (a: ItemRecord, b: ItemRecord): number => {
    const pa = placeOf(a);
    const pb = placeOf(b);
    return pa[0] - pb[0] || pa[1] - pb[1] || (pa[2] < pb[2] ? -1 : pa[2] > pb[2] ? 1 : 0) || pa[3] - pb[3] || (recordIndex.get(a.id) as number) - (recordIndex.get(b.id) as number);
  };
  const sorted = [...shownRecords].sort(compare);
  const position = new Map(sorted.map((r, i) => [r.id, i]));
  const ordered: ItemRecord[] = [];
  const placed = new Set<string>();
  const onPath = new Set<string>();
  const visit = (r: ItemRecord): void => {
    if (placed.has(r.id) || onPath.has(r.id)) return;
    onPath.add(r.id);
    const deps = dependsOn(r)
      .filter((d) => position.has(d))
      .sort((x, y) => (position.get(x) as number) - (position.get(y) as number));
    for (const d of deps) visit(byId.get(d) as ItemRecord);
    onPath.delete(r.id);
    placed.add(r.id);
    ordered.push(r);
  };
  for (const r of sorted) visit(r);
  const listOrder = new Map(ordered.map((r, i) => [r.id, i]));
  const byListOrder = (a: string, b: string) => (listOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (listOrder.get(b) ?? Number.MAX_SAFE_INTEGER);
  const listed = ordered.filter((r) => !hidden(r));

  // ---- the item views
  const groupOf = (r: ItemRecord): ItemView['group'] => {
    const parsed = parseItemKey(r.key);
    if (parsed?.kind === 'vocab') return { kind: 'vocabulary' };
    const card = groupCardOf(parsed);
    return card !== undefined ? { kind: 'card', card: cardRef(card) } : { kind: 'definitions' };
  };
  const cardOf = (r: ItemRecord): string => groupCardOf(parseItemKey(r.key)) ?? r.origin.target;
  const declineOptions = (r: ItemRecord): ItemView['decline']['options'] =>
    isArrowKind(r.kind)
      ? [{ option: 'plain' }]
      : r.kind === 'result'
        ? [{ option: 'reject' }, { option: 'shaky' }]
        : [{ option: 'reject' }, { option: 'shaky' }, { option: 'transform', disabled: REVIEW_TEXTS.transformLater }];
  const statementOf = (card: string, fingerprint: string): LeanStatementView => {
    const node = nodes.get(card);
    const name = node?.lean.statement ?? '';
    const rendered = own(input.renderings, fingerprint);
    const source = name !== '' ? statementSource(model, name) : '';
    return { name, pretty: rendered?.pretty ?? source, explicit: rendered?.explicit ?? source, closure: (node?.lean.uses ?? []).map((n) => closureEntry(model, vocabulary, n)) };
  };
  const premiseStatement = (r: ItemRecord): LeanStatementView => {
    const draft = r.content.premise;
    const rendered = own(input.renderings, r.fingerprint);
    if (draft === undefined) return { name: '', pretty: rendered?.pretty ?? '', explicit: rendered?.explicit ?? '', closure: [] };
    const name = premiseStatementName(draft);
    const facts: DeclFacts | undefined = own(draft.facts, name);
    const uses = facts !== undefined ? (constsOf(facts, 'meaning') ?? []) : [];
    return {
      name,
      pretty: rendered?.pretty ?? draft.leanStatement,
      explicit: rendered?.explicit ?? draft.explicit,
      closure: [...new Set(uses)].filter((n) => n !== name).map((n) => closureEntry(model, vocabulary, n)),
    };
  };
  const arrowOf = (r: ItemRecord): ArrowEnds => {
    const parsed = parseItemKey(r.key);
    return parsed?.kind === 'arrow' || parsed?.kind === 'unarrow' ? parsed.arrow : (r.content.arrow ?? { source: '', target: '' });
  };
  /**
   * Claude's reason for an arrow: its newest ledger `arrow` entry. While a step runs, never one a step of the running
   * queue wrote (an ended step's entry stays only if that step passed, so it would tell the outcome before the queue
   * ends, D2-63, and show Claude's words from the running queue, D2-10): the ledger as it was when the queue started
   * (builder 2b3a, carry-over R1-2).
   */
  const whyOf = (arrow: ArrowEnds): string | undefined => {
    for (let k = ledgerSeen.length - 1; k >= 0; k--) {
      const e = ledgerSeen[k];
      if (e?.kind === 'arrow' && e.source === arrow.source && e.target === arrow.target) return e.why;
    }
    return undefined;
  };
  const mentionedBy = (card: string): CardRef[] => {
    const ids = graph.edges.filter((e) => e.source === card && e.target !== card && (e.type === 'lean-ref' || e.type === 'verified')).map((e) => e.target);
    return [...new Set(ids)].sort((a, b) => (boardIndex.get(a) ?? 0) - (boardIndex.get(b) ?? 0)).map(cardRef);
  };
  const usedByStatementsOf = (name: string): CardRef[] => {
    const item = vocabulary.get(name);
    const ids = item !== undefined ? item.usedBy : (own(judgement?.reach ?? {}, name) ?? []).filter((id) => nodes.has(id));
    return [...new Set(ids)].map(cardRef);
  };
  /**
   * A Result's reason chip (§3.4, builder 2b1b's hand-off), for a not-proved verdict: how the step whose version stands
   * ended (`standingStep`, fixer 2c2 r1, A-V2C2-ADV-5), never a later re-ask's that left it standing.
   */
  const reasonChipOf = (target: string, verdict: string): string | undefined => {
    if (!outcomes || verdict !== 'not-proved') return undefined;
    const step = standingStep(target);
    if (step?.state === 'gave-up') return REVIEW_TEXTS.stepDidNotFinish;
    if (step?.state === 'passed' && step.statementsOnly !== undefined) return REVIEW_TEXTS.sourceNotProved(cutText(cardRef(step.statementsOnly).sentence, 60));
    return undefined;
  };
  /** Claude's words on a Result (its gap and summary): those of the step whose version stands. */
  const wordsOf = (target: string) => {
    const step = standingStep(target);
    return outcomes && step !== undefined ? own(input.words, step.id) : undefined;
  };
  const holdsOf = (target: string): string | undefined => {
    const statement = input.current.nodes.get(target)?.node.lean.statement ?? input.base.nodes.get(target)?.node.lean.statement;
    return statement !== undefined ? holdsName(statement) : undefined;
  };
  /** §5.6: the cards whose basis changes with T's Result: downstream of T on the board, their footprint not B's. */
  const basisChanged = (target: string): CardRef[] => {
    const seen = new Set<string>([target]);
    const queue = [target];
    for (let k = 0; k < queue.length; k++) {
      for (const e of graph.edges) {
        if (e.type !== 'verified' || e.source !== queue[k] || seen.has(e.target)) continue;
        seen.add(e.target);
        queue.push(e.target);
      }
    }
    seen.delete(target);
    return [...seen]
      .filter((id) => footprintKey(nodes.get(id)) !== footprintKey(input.base.nodes.get(id)?.node))
      .sort((a, b) => (boardIndex.get(a) ?? 0) - (boardIndex.get(b) ?? 0))
      .map(cardRef);
  };

  const resultDetail = (r: ItemRecord): ItemDetailView => {
    const target = cardOf(r);
    const inference = records.inferences.find((inf) => inf.target === target);
    const question = inference !== undefined ? questionOf(inference) : { sources: [], fromNothing: false };
    const seenEarly = r.markers.includes('seen-early');
    const common = { kind: 'result' as const, target: cardRef(target), question: question.sources.map(cardRef), fromNothing: question.fromNothing };
    if (hidden(r)) return { ...common, revealed: false, seenEarly };
    // Its content in ws/: the stage judgement judged it, with its proof. Declined by the user with its content out
    // (Reject): the version they declined, as its record keeps it (verdict and Rests on in `judged`, its proof). Taken out
    // by telelean or a cascade (`redo.reverted`, which a later decline keeps): what ws/ holds for the target now, the
    // stage judgement's (B's version), and no proof, since its record's `judged` can come from the very judgement that
    // took it out (fixer 2c2 r1, A-V2C2-ADV-2: it read "established" beside "no longer pass their checks").
    const inWs = inWorkingCopy(r.kind, r, r.card);
    const declinedVersion = !inWs && r.status === 'declined' && !isReverted(r);
    const j = declinedVersion ? undefined : own(judgement?.inferences ?? {}, target);
    const kept = declinedVersion ? r.judged : undefined;
    const verdict = j?.verdict ?? kept?.verdict ?? 'not-proved';
    const holds = holdsOf(target);
    const proofDecl = holds !== undefined && (inWs || declinedVersion) ? r.content.decls.find((d) => d.name === holds) : undefined;
    const isTheorem = proofDecl !== undefined && (proofDecl.kind === 'theorem' || /^(?:@\[[^\]]*\]\s*)?(?:private\s+|protected\s+)*theorem\b/u.test(proofDecl.text.replace(/^\/--[\s\S]*?-\/\s*/u, '').trimStart()));
    const flags = j?.flags ?? [];
    // Claude's summary and gap go with the version they describe: none for a Result telelean or a cascade took out, as
    // for its proof (builder 2b3a, carry-over R1-5: "Proved from the three arrows." beside the verdict of B's version).
    const words = inWs || declinedVersion ? wordsOf(target) : undefined;
    const completion = r.markers.includes('completion-not-checked')
      ? ('not-checked' as const)
      : ledgerSeen.some((e) => e.kind === 'completion' && e.target === target)
        ? ('checked' as const)
        : undefined;
    return compact({
      ...common,
      revealed: true as const,
      seenEarly,
      verdict,
      reasonChip: reasonChipOf(target, verdict),
      flags: [...flags],
      proof: isTheorem && holds !== undefined ? { name: holds, code: contentText(r.content) } : undefined,
      previousProof: flags.includes('replaces-your-proof') && holds !== undefined ? baseTables.byName.get(holds)?.text : undefined,
      band: j !== undefined ? { used: [...j.band.used], notNeeded: [...j.band.notNeeded], complete: j.band.complete, open: [...j.band.open] } : { used: [], notNeeded: [], complete: false, open: [] },
      restsOn: [...(j?.restsOn ?? kept?.restsOn ?? [])],
      throughResults: [...(j?.throughResults ?? [])],
      basisChanged: j !== undefined ? basisChanged(target) : [],
      gap: words?.gap,
      missingArrows: (j?.missing ?? []).map((m) => ({ source: m.source, drawn: m.drawn })),
      arrowItems: listed.filter((x) => isArrowKind(x.kind) && arrowOf(x).target === target).map((x) => x.id),
      premiseItems: listed.filter((x) => x.kind === 'add-premise' && cardOf(x) === target).map((x) => x.id),
      completion,
      summary: words?.summary,
    });
  };

  const detailOf = (r: ItemRecord): ItemDetailView => {
    const card = cardOf(r);
    switch (r.kind) {
      case 'formalize':
        return { kind: 'formalize', card: cardRef(card), statement: statementOf(card, r.fingerprint) };
      case 'change': {
        const before = input.base.nodes.get(card)?.node;
        const after = nodes.get(card);
        const fields: FieldChangeView[] = [];
        const field = (name: FieldChangeView['field'], b: string | undefined, a: string | undefined) => {
          if (b !== a) fields.push(compact({ field: name, before: b, after: a }));
        };
        field('sentence', before?.naturalName, after?.naturalName);
        const statementBefore = before?.lean.statement !== undefined ? statementSource(input.base, before.lean.statement) : undefined;
        const statementAfter = after?.lean.statement !== undefined ? statementSource(model, after.lean.statement) : undefined;
        if (statementBefore !== statementAfter) {
          fields.push(
            compact({
              field: 'statement' as const,
              before: statementBefore,
              after: statementAfter,
              afterStatement: after?.lean.statement !== undefined ? statementOf(card, r.fingerprint) : undefined,
            }),
          );
        }
        field('why', before?.rationale, after?.rationale);
        field('stance', before?.stance, after?.stance);
        field('source', before?.source, after?.source);
        field('dependencies', before?.premises.join(', '), after?.premises.join(', '));
        return { kind: 'change', card: cardRef(card), fields, mentionedBy: mentionedBy(card) };
      }
      case 'add': {
        const node = nodes.get(card);
        const by = node?.provenance.wordedBy ?? 'agent';
        const fields: Array<{ field: string; value: string; by: 'user' | 'agent' }> = [];
        if (node !== undefined) {
          fields.push({ field: 'sentence', value: node.naturalName, by });
          if (node.rationale !== undefined) fields.push({ field: 'why', value: node.rationale, by });
          if (node.stance !== undefined) fields.push({ field: 'stance', value: node.stance, by });
          if (node.source !== undefined) fields.push({ field: 'source', value: node.source, by });
          if (node.premises.length > 0) fields.push({ field: 'dependencies', value: node.premises.join(', '), by });
        }
        return compact({ kind: 'add' as const, card: cardRef(card), statement: node?.lean.statement !== undefined ? statementOf(card, r.fingerprint) : undefined, fields });
      }
      case 'delete': {
        const before = input.base.nodes.get(card)?.node;
        const arrows: ArrowEnds[] = [
          ...(before?.premises ?? []).map((source) => ({ source, target: card })),
          ...[...input.base.nodes.values()].filter((n) => n.node.premises.includes(card)).map((n) => ({ source: card, target: n.node.id })),
        ];
        const statement = before?.lean.statement;
        const users = statement === undefined ? [] : [...input.base.nodes.values()].filter((n) => n.node.id !== card && (n.node.lean.uses ?? []).includes(statement));
        return { kind: 'delete', card: cardRef(card), arrows, mentionedBy: users.map((n) => cardRef(n.node.id)) };
      }
      case 'add-premise': {
        const draft = r.content.premise;
        const parsed = parseItemKey(r.key);
        const leanName = draft?.leanName ?? (parsed?.kind === 'premise' ? parsed.leanName : '');
        return compact({
          kind: 'add-premise' as const,
          sentence: premiseSentenceOf(r),
          leanName,
          target: cardRef(card),
          statement: premiseStatement(r),
          whyNeeded: draft?.whyNeeded ?? '',
          mayRestate: draft?.aloneEntails === true,
          replacesFromNothing: input.base.nodes.get(card)?.node.fromNothing === true,
          heldAs: r.status === 'accepted' ? r.accepted?.holdAs : undefined,
          writtenInReview: r.status === 'in-review' && r.card !== undefined ? (true as const) : undefined,
        });
      }
      case 'add-arrow':
      case 'remove-arrow': {
        const arrow = arrowOf(r);
        return compact({ kind: r.kind, source: cardRef(arrow.source), target: cardRef(arrow.target), why: whyOf(arrow), addsNoNewBasis: classOf(r).addsNoNewBasis === true });
      }
      case 'vocabulary-term': {
        const name = nameOf(r);
        const item = vocabulary.get(name);
        return compact({
          kind: 'vocabulary-term' as const,
          name,
          vocabKind: item?.kind ?? ('other' as const),
          type: item?.type,
          gloss: item?.gloss,
          glossBy: item?.gloss !== undefined ? item.glossBy : undefined,
          code: item?.code ?? contentText(r.content),
        });
      }
      case 'declaration': {
        const name = nameOf(r);
        const item = vocabulary.get(name);
        const declKind = r.declKind ?? 'definition';
        const docstring = item?.gloss ?? model.declFacts.get(name)?.docstring;
        const code = contentText(r.content);
        return compact({
          kind: 'declaration' as const,
          declKind,
          name,
          code: code !== '' ? code : (item?.code ?? ''),
          before: declKind === 'vocabulary-change' ? baseTables.byName.get(name)?.text : undefined,
          gloss: docstring,
          glossBy: docstring === undefined ? undefined : item?.gloss !== undefined ? item.glossBy : baseTables.byName.has(name) ? ('user' as const) : ('agent' as const),
          usedByStatementsOf: usedByStatementsOf(name),
        });
      }
      case 'result':
        return resultDetail(r);
      case 'proof-broken': {
        const error = graph.diagnostics.find((d) => d.nodeId === card && d.severity === 'error')?.message ?? '';
        return { kind: 'proof-broken', card: cardRef(card), error };
      }
    }
  };

  /**
   * "updated" opens the previous proposal (§5.6): the newest earlier version, for the kinds whose content tells it. An
   * earlier rev only (fixer 2c2 r1, C-V2C2-C5): a premise write keeps the draft's key in `versions` at the same rev, which
   * no one proposed before this version (§3.8).
   */
  const previousOf = (r: ItemRecord): ItemDetailView | undefined => {
    const version = [...r.versions].reverse().find((v) => v.rev < r.rev);
    if (version === undefined || hidden(r)) return undefined;
    const text = contentText(version.content);
    const rendered = own(input.renderings, version.fingerprint);
    const card = cardOf(r);
    switch (r.kind) {
      case 'formalize': {
        const name = nodes.get(card)?.lean.statement ?? '';
        const statement = version.content.decls.find((d) => d.name === name)?.text ?? text;
        return { kind: 'formalize', card: cardRef(card), statement: { name, pretty: rendered?.pretty ?? statement, explicit: rendered?.explicit ?? statement, closure: [] } };
      }
      case 'vocabulary-term':
        return { kind: 'vocabulary-term', name: nameOf(r), vocabKind: vocabulary.get(nameOf(r))?.kind ?? 'other', code: text };
      case 'declaration':
        return { kind: 'declaration', declKind: r.declKind ?? 'definition', name: nameOf(r), code: text, usedByStatementsOf: [] };
      case 'add-premise': {
        const draft = version.content.premise;
        if (draft === undefined) return undefined;
        return {
          kind: 'add-premise',
          sentence: draft.naturalName,
          leanName: draft.leanName,
          target: cardRef(card),
          statement: {
            name: premiseStatementName(draft),
            pretty: rendered?.pretty ?? draft.leanStatement,
            explicit: rendered?.explicit ?? draft.explicit,
            closure: [],
          },
          whyNeeded: draft.whyNeeded,
          mayRestate: draft.aloneEntails,
          replacesFromNothing: input.base.nodes.get(card)?.node.fromNothing === true,
        };
      }
      default:
        return undefined;
    }
  };

  const markersOf = (r: ItemRecord, cls: ItemClass): ItemMarker[] => {
    const markers = [...r.markers];
    if (cls.addsNoNewBasis === true && !markers.includes('adds-no-new-basis')) markers.push('adds-no-new-basis');
    if (cls.reasons.some((x) => x.code === 'c3') && !markers.includes('sentence-lean-may-disagree')) markers.push('sentence-lean-may-disagree');
    return markers;
  };
  const classView = (cls: ItemClass): NonNullable<ItemView['classes']> => ({
    belief: cls.belief,
    changesProved: cls.changesProved,
    reasons: [
      ...cls.reasons.map((x) => CLASS_REASON_TEXTS[x.code](x.name, x.cards !== undefined && x.cards.length > 0 ? x.cards.map(quoted).join(', ') : undefined)),
      ...(cls.complete ? [] : [REVIEW_TEXTS.classIncomplete]),
    ],
  });

  const itemView = (r: ItemRecord): ItemView => {
    const gate = gates.get(r.id);
    const accept = phaseGate(gate === undefined || gate.accept.ok ? OPEN : closed(gate.accept.text, gate.accept.missing));
    const decline = phaseGate(gate === undefined || gate.decline.ok ? OPEN : closed(gate.decline.text));
    const review = phaseGate(gate === undefined || gate.review.ok ? OPEN : closed(gate.review.text));
    const base = {
      id: r.id,
      kind: r.kind,
      label: kindLabel(r),
      group: groupOf(r),
      cards: cardsOf(r),
    };
    const origin = { step: r.origin.step, target: r.origin.target };
    if (hidden(r)) {
      // A neutral row (§4.7): nothing that tells whether a proof was found (D2-61, D2-64).
      return {
        ...base,
        rev: 0,
        status: null,
        classes: null,
        markers: r.markers.includes('seen-early') ? ['seen-early'] : [],
        dependsOn: [],
        dependents: [],
        accept,
        decline: { ...decline, options: declineOptions(r) },
        review,
        detail: resultDetail(r),
        origin,
      };
    }
    const cls = classOf(r);
    const previous = previousOf(r);
    return {
      id: r.id,
      rev: r.rev,
      kind: r.kind,
      ...(r.declKind !== undefined ? { declKind: r.declKind } : {}),
      label: base.label,
      group: base.group,
      cards: base.cards,
      status: r.status,
      ...(r.status === 'declined' && r.decline !== undefined ? { declined: compact({ option: r.decline.option, note: r.decline.note }) } : {}),
      ...(r.status === 'to-be-redone' && r.redo !== undefined ? { redo: { because: r.redo.because.filter(isListedId) } } : {}),
      classes: classView(cls),
      markers: markersOf(r, cls),
      dependsOn: dependsOn(r),
      dependents: [...(dependents.get(r.id) ?? [])].sort(byListOrder),
      accept,
      decline: { ...decline, options: declineOptions(r) },
      review,
      detail: detailOf(r),
      ...(previous !== undefined ? { previous } : {}),
      origin,
    };
  };
  const items = ordered.map(itemView);

  // ---- the inferences and the steps
  const inferenceViews: InferenceView[] = inferences.map((inf) => {
    const question = questionOf(inf);
    const result = resultOf(inf.target);
    return {
      target: cardRef(inf.target),
      question: question.sources.map(cardRef),
      fromNothing: question.fromNothing,
      order: inf.order,
      ...(result !== undefined ? { result: result.id } : {}),
    };
  });
  const numbers = stepNumbers(records.steps);
  const steps: StepView[] = records.steps.map((step) => {
    const outcome = !outcomes
      ? undefined
      : step.state === 'gave-up'
        ? REVIEW_TEXTS.stepDidNotFinish
        : step.state === 'passed'
          ? step.statementsOnly !== undefined
            ? REVIEW_TEXTS.stepStatementsOnlyOutcome(cutText(cardRef(step.statementsOnly).sentence, 60))
            : REVIEW_TEXTS.stepPassed
          : undefined;
    const number = numbers.get(step.id) as { index: number; of: number };
    return {
      id: step.id,
      index: number.index,
      of: number.of,
      kind: step.kind,
      target: step.target,
      state: STEP_STATES[step.state],
      ...(outcome !== undefined ? { outcome } : {}),
      activity: outcomes ? 'shown' : 'withheld',
    };
  });

  // ---- the stage report (RV-10, §5.4). Notes: a re-ask that was not proved (the latest ended step asked another
  // question than the record's, less D2-59's removals, §3.2), then each source that left a question (D2-59), once, and
  // only while it is out of the question on record: a later re-ask that asked it again and proved its target put it back
  // (builder 2b3a, carry-over R1-1)
  const leftNotes = new Set<string>();
  for (const l of removals) {
    const question = records.inferences.find((inf) => inf.target === l.target)?.question;
    if (question?.sources.includes(l.source) === true) continue;
    leftNotes.add(REVIEW_TEXTS.leftQuestion(cutText(cardRef(l.source).sentence, 60), cutText(cardRef(l.target).sentence, 60)));
  }
  const notes: string[] = !outcomes
    ? []
    : [
        ...inferences
          .filter((inf) => {
            const step = latestEnded.get(inf.target);
            return step !== undefined && resultOf(inf.target) !== undefined && !sameQuestion(askedBy(step), inf.question);
          })
          .map((inf) => REVIEW_TEXTS.reaskNotProved(cutText(cardRef(inf.target).sentence, 60))),
        ...leftNotes,
      ];
  const reportTargets: StageReportView['targets'] = inferences.map((inf) => {
    const result = resultOf(inf.target);
    const j = own(judgement?.inferences ?? {}, inf.target);
    // Before the first stage judgement nothing was judged, so nothing is revealed (fixer 2c2 r1, A-V2C2-ADV-4).
    if (!shown || result === undefined || j === undefined) return { target: inf.target, revealed: shown && judgement !== null };
    return compact({
      target: inf.target,
      revealed: true,
      verdict: j.verdict,
      reasonChip: reasonChipOf(inf.target, j.verdict),
      band: { used: [...j.band.used], complete: j.band.complete, open: [...j.band.open] },
      restsOn: [...j.restsOn],
      throughResults: [...j.throughResults],
      notNeeded: [...j.band.notNeeded],
      missing: j.missing.map((m) =>
        m.drawn
          ? { text: REVIEW_TEXTS.selectTooHint(quoted(m.source), quoted(inf.target)), select: { source: m.source, target: inf.target } }
          : { text: REVIEW_TEXTS.drawTooHint(quoted(m.source), quoted(inf.target)) },
      ),
    });
  });
  const reportSteps: StageReportView['steps'] = records.steps
    .filter((step) => ENDED.has(step.state))
    .map((step) => {
      const words = outcomes ? own(input.words, step.id) : undefined;
      return compact({
        step: step.id,
        target: step.target,
        revealed: outcomes,
        summary: words?.summary,
        assumedWithoutAsking: words?.assumedWithoutAsking?.map((a) => ({ text: a.text, items: a.items.filter(isListedId) })),
        proposedNothing: words?.proposedNothing !== undefined ? REVIEW_TEXTS.proposedNothing(words.proposedNothing) : undefined,
      });
    });
  const withdrawnAt = (id: string): string => {
    for (let k = records.events.length - 1; k >= 0; k--) {
      const event = records.events[k];
      if (event?.text === REVIEW_TEXTS.eventWithdrawn && event.items.includes(id)) return event.at;
    }
    return '';
  };

  // ---- "Rejected in this session" (§5.7): current rejects with Un-reject, superseded rejected versions view only
  const rejected: RejectedView[] = [];
  for (const r of listed) {
    if (r.status === 'declined' && isDeclinedOut(r)) {
      const gate = gates.get(r.id);
      rejected.push({
        item: r.id,
        label: labelOf(r),
        rev: r.rev,
        at: r.decline?.at ?? '',
        unreject: phaseGate(gate === undefined || gate.review.ok ? OPEN : closed(gate.review.text)),
        superseded: false,
      });
    }
    for (const version of r.versions) {
      if (version.rejected !== true) continue;
      rejected.push({ item: r.id, label: labelOf(r), rev: version.rev, at: '', unreject: closed(REVIEW_TEXTS.unrejectNewer), superseded: true });
    }
  }

  // ---- the board's other parts (§2.3 SessionBoardView)
  const marks = record<Array<{ item: string; kind: ItemKind; status: ItemStatus }>>();
  for (const r of listed) {
    const parsed = parseItemKey(r.key);
    const card = parsed?.kind === 'card' || parsed?.kind === 'proof' ? parsed.node : r.kind === 'add-premise' ? r.card : undefined;
    if (card === undefined) continue;
    (marks[card] ??= []).push({ item: r.id, kind: r.kind, status: r.status });
  }
  const arrows: SessionBoardView['arrows'] = !shown
    ? []
    : listed
        .filter((r) => isArrowKind(r.kind))
        .map((r) => {
          const arrow = arrowOf(r);
          const direct = own(judgement?.inferences ?? {}, arrow.target)?.direct ?? [];
          return { item: r.id, change: r.kind === 'add-arrow' ? ('add' as const) : ('remove' as const), source: arrow.source, target: arrow.target, status: r.status, used: direct.includes(arrow.source) };
        });
  const premises: SessionBoardView['premises'] = !shown
    ? []
    : listed
        .filter((r) => r.kind === 'add-premise' && r.card === undefined && r.status !== 'withdrawn')
        .map((r) => ({ item: r.id, target: cardOf(r), sentence: r.content.premise?.naturalName ?? labelOf(r), status: r.status }));
  const removedNodes = [...input.base.nodes.values()]
    .filter((n) => n.node.subject === input.subject && !nodes.has(n.node.id))
    .map((n) => withoutPositions(n.node));

  // ---- the stack (UN-4, UN-5): Undo and Redo only in a stage (D2-62; after Back, in a confirmation, §5.13)
  const done = records.stack.done;
  const top: SessionAction | undefined = done[done.length - 1];
  const next: SessionAction | undefined = records.stack.undone[records.stack.undone.length - 1];
  // A decision on an item that is hidden now (made while the results were shown) can be neither undone nor redone until
  // they are shown again (D2-8: the reducer refuses it), and its label would name that item (fixer 2c2 r1, C-V2C2-C4).
  const decidesHidden = (action: SessionAction | undefined): boolean =>
    action?.kind === 'decide' &&
    decidedBy(action).some((id) => {
      const r = byId.get(id);
      return r !== undefined && hidden(r);
    });
  const undo = phase === 'stage' && top !== undefined && top.kind !== 'seal' && !decidesHidden(top) ? { step: top.id, label: top.label } : null;
  const redo = phase === 'stage' && next !== undefined && next.kind !== 'seal' && !decidesHidden(next) ? { step: next.id, label: next.label } : null;
  const sealed = top?.kind === 'seal' ? { by: top.by, at: top.at } : null;

  // ---- Submit review (§3.7, RV-12): open only while the results are shown, so its plan reads real statuses
  const inReview = listed.filter((r) => r.status === 'in-review').map((r) => r.id);
  const waitingFor = [...reveal.waitingFor].sort(byListOrder);
  const plan = shown && phase === 'stage' && judgement !== null ? planSubmit({ records, judgement }) : undefined;
  const work = plan !== undefined ? { next: plan.confirm ? ('confirm' as const) : ('claude-steps' as const), work: { shaky: plan.counts.shaky, redo: plan.counts.redo, steps: plan.steps.length } } : {};
  let submitGate: Gate;
  if (closure !== undefined) submitGate = closed(closure);
  else if (inReview.length > 0) submitGate = closed(REVIEW_TEXTS.submitInReview(inReview.length), inReview);
  else if (!shown) submitGate = closed(REVIEW_TEXTS.submitResultsHidden, waitingFor);
  else if (input.judging || plan === undefined) submitGate = closed(REVIEW_TEXTS.judging);
  else if (plan.confirm && plan.partlyAccepted.length > 0) {
    const cycle = [...(plan.partlyAccepted[0] as string[])].sort(byListOrder);
    submitGate = closed(
      REVIEW_TEXTS.acceptOrRejectTogether(cycle.map((id) => labels[id] ?? id)),
      cycle.filter((id) => byId.get(id)?.status !== 'accepted'),
    );
  } else submitGate = OPEN;

  // ---- a mid-stage Formalize (RV-9, D2-65) and Retry step (§3.4)
  const formalize = running
    ? closed(REVIEW_TEXTS.formalizeStepRunning)
    : closure !== undefined
      ? closed(closure)
      : !shown
        ? closed(REVIEW_TEXTS.formalizeResultsHidden)
        : input.judging
          ? closed(REVIEW_TEXTS.judging)
          : OPEN;
  const retry =
    closure !== undefined ? closed(closure) : records.retry.length === 0 ? closed(REVIEW_TEXTS.nothingToRetry) : input.judging ? closed(REVIEW_TEXTS.judging) : OPEN;

  // ---- the end confirmation (§3.10, §5.9)
  let confirmation: EndConfirmationView | undefined;
  const ending = records.confirmation;
  if (ending !== undefined && (phase === 'confirming' || phase === 'applying')) {
    const accepted = listed.filter((r) => r.status === 'accepted');
    const drift = records.drift;
    let apply: Gate;
    if (phase === 'applying') apply = closed(REVIEW_TEXTS.applyingNow);
    else if (input.judging) apply = closed(REVIEW_TEXTS.judging);
    else if (ending.state === 'running') apply = closed(REVIEW_TEXTS.applyWaitsForCheck);
    else if (ending.state === 'failed') apply = closed(REVIEW_TEXTS.applyCheckFailed);
    else if (drift !== undefined && drift.files.length > 0) apply = closed(REVIEW_TEXTS.drift(drift.files));
    else apply = OPEN;
    confirmation = {
      changes: accepted.map((r) => ({ item: r.id, label: labelOf(r) })),
      rejected: listed.filter((r) => r.status === 'declined' && isDeclinedOut(r)).map((r) => ({ item: r.id, label: labelOf(r) })),
      notRun: inferences.filter((inf) => resultOf(inf.target) === undefined).map((inf) => inf.target),
      endorsed: accepted
        .filter((r) => r.kind === 'declaration' && r.declKind !== undefined && r.declKind !== 'vocabulary-change')
        .map((r) => ({ name: nameOf(r), declKind: r.declKind as DeclKind })),
      check: {
        id: ending.checkId,
        state: ending.state,
        reusedFileChecks: ending.reusedFileChecks === true,
        failures: ending.failures.map((f) => compact({ rule: f.rule, text: f.text, items: f.items !== undefined ? [...f.items] : undefined, declaration: f.declaration })),
      },
      empty: accepted.length === 0,
      apply,
    };
  }

  // ---- telelean's events (AF7): the runner's, never naming a hidden item (defensively filtered while hidden)
  const events = records.events.flatMap((event) => {
    const visible = shown ? [...event.items] : event.items.filter(isListedId);
    if (!shown && event.items.length > 0 && visible.length === 0) return [];
    return [{ id: event.id, at: event.at, text: event.text, items: visible }];
  });

  // ---- the stage's problems (fixer 2c2 r1, S-STAGE-PROBLEMS-NO-PATH), never about a hidden item: the judgement's `facts`
  // and `unowned` problems (texts with no Lean detail and no position), the items that disappeared (§3.5, reconcile's
  // rule: a record with no draft whose content no decision or take-out removed; not while judging, when the records may
  // be ahead of the judgement, an un-reject's merge for one), and the runner's own (a premise write that failed, §3.8)
  const problems: SessionView['problems'] = [];
  for (const p of judgement?.problems ?? []) {
    if (p.code !== 'facts' && p.code !== 'unowned') continue;
    const visible = (p.keys ?? []).map((k) => byKey.get(k)?.id).filter((id): id is string => id !== undefined && isListedId(id));
    if (!shown && (p.keys ?? []).length > 0 && visible.length === 0) continue;
    problems.push({ text: p.text, items: visible.sort(byListOrder) });
  }
  if (judgement !== null && !input.judging) {
    const drafted = new Set(judgement.drafts.map((d) => d.key));
    for (const r of listed) {
      if (drafted.has(r.key) || isDeclinedOut(r) || isReverted(r) || r.status === 'withdrawn') continue;
      problems.push({ text: REVIEW_TEXTS.disappeared(labelOf(r)), items: [r.id] });
    }
  }
  for (const p of input.problems ?? []) {
    if (!shown && p.items.some((id) => !isListedId(id))) continue;
    problems.push({ text: p.text, items: [...p.items] });
  }

  const counts = { inReview: 0, accepted: 0, declined: 0, toBeRedone: 0 };
  for (const r of listed) {
    if (r.status === 'in-review') counts.inReview += 1;
    else if (r.status === 'accepted') counts.accepted += 1;
    else if (r.status === 'declined') counts.declined += 1;
    else if (r.status === 'to-be-redone') counts.toBeRedone += 1;
  }

  return {
    runId: input.runId,
    subject: input.subject,
    stage: records.stage,
    phase,
    results: { shown, forced: records.forced !== undefined && records.forced.via !== 'decided', waitingFor },
    inferences: inferenceViews,
    steps,
    heading: records.heading !== undefined && records.heading !== null ? { kind: records.heading.kind, text: records.heading.text, firstStep: records.heading.firstStep, retry } : null,
    items,
    counts,
    report: {
      stage: records.stage,
      targets: reportTargets,
      steps: reportSteps,
      notes,
      consistency: 'unchecked',
      withdrawn: listed.filter((r) => r.status === 'withdrawn').map((r) => ({ label: labelOf(r), at: withdrawnAt(r.id) })),
    },
    rejected,
    board: {
      graph,
      hiddenTargets: shown ? [] : inferences.map((inf) => inf.target),
      marks,
      arrows,
      premises,
      removedNodes,
      ...(records.positions !== undefined ? { positions: Object.fromEntries(Object.entries(records.positions).map(([id, p]) => [id, { x: p.x, y: p.y }])) } : {}),
    },
    undo,
    redo,
    sealed,
    drift: records.drift !== undefined ? { files: [...records.drift.files], at: records.drift.at } : null,
    judging: input.judging,
    submit: { gate: submitGate, ...work },
    formalize,
    ...(confirmation !== undefined ? { confirmation } : {}),
    events,
    problems,
  };
}
