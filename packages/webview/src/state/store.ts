/**
 * Board state (zustand vanilla store, created with an injected `post` so it is unit-tested without React or a DOM).
 *
 * The host is the source of truth. The store applies the host's messages (graph, workspace, history, actionResult,
 * notice) and turns the user's gestures into protocol messages. Every mutating message carries a request id
 * (`r<n>`); the host answers each with an `actionResult`. Drags, re-orders, adds and in-place edits are applied
 * optimistically and rolled back when the host refuses them (with an error toast), unless a newer graph has
 * arrived meanwhile (the graph then already shows the host's state). An added card keeps a provisional id until
 * the host's graph contains the real card; `actionResult.outcome.nodeId` names it. A `needs-confirmation` answer is
 * a question, not an error: a kind change opens the dependents dialog, a delete (never optimistic) opens the delete
 * dialog again with the host's list of declarations that would stop compiling.
 *
 * M2 (docs/m2-plan.md section 6): the host's `run` (RunView) and `proposal` (ProposalView) are kept apart from the
 * board's graph: `applyGraph` never sees them, and the proposal's graph is never applied as the board. The proposed
 * view of the board reads a derived `overlay` instead (`boardView`), read-only. The review stepper's state (step,
 * explicit toggles, definition answers, lifecycle ticks, the Feedback draft), the answer drafts of a pending
 * question and what the board's own Accept changed (`accepted`) live here too, so the run panel can be re-rendered (or
 * unit-tested) without losing them.
 */
import {
  columnOrder,
  createUserNode,
  isTerminalRunState,
  kindChangeImpact,
  LIMITS,
  NODE_TYPES,
  slugId,
  webviewMessage,
  type ActionOutcome,
  type AttemptSummary,
  type BoardDiagnostic,
  type DependentCard,
  type EditableField,
  type Evidential,
  type HistoryEntry,
  type HistoryListing,
  type HostToWebviewMessage,
  type KindChangeImpact,
  type NodeType,
  type NoticeLevel,
  type ProposalView,
  type Range,
  type RunView,
  type SemanticSummary,
  type Stance,
  type StatusFlag,
  type TlEdge,
  type TlGraph,
  type TlNode,
  type VocabItem,
  type WebviewToHostMessage,
  type WorkspaceState,
} from '@telelean/core';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { vocabIndex } from '../model/cardData';
import { oneLine } from '../model/format';
import {
  acceptChangesFiles,
  acceptSelection,
  buildOverlay,
  definitionsApproved,
  draftAnswers,
  emptyDraft,
  initialLifecycle,
  newVocabularyCount,
  pastStatements,
  reviewSteps,
  trayRunBlock,
  type AnswerDraft,
  type BoardViewData,
  type Overlay,
} from '../model/run';

export type Post = (message: WebviewToHostMessage) => void;

/** What the board keeps in the webview state (per panel; VS Code restores it after a reload). */
export interface PersistedState {
  /** The subject on screen (the extension's panel serializer may read it to reopen the same subject). */
  subject?: string;
  /** The Vocabulary group is collapsed (docs/m1-plan.md 13.1 #30: webview state, not layout.json). Default: collapsed. */
  vocabCollapsed?: boolean;
  /** The last request number used, so request ids stay unique across reloads of the webview. */
  requestCounter?: number;
  /** M2: the run panel's size the user chose by dragging its edge (per layout; null = default). */
  runSplit?: RunSplit;
}

export interface StoreOptions {
  persisted?: PersistedState;
  /** Writes a patch of the persisted state (the bridge merges it into the webview state). */
  persist?: (patch: PersistedState) => void;
  /** Timers, injectable for tests (toast expiry, highlight flashes). */
  setTimer?: (callback: () => void, ms: number) => unknown;
  /** Today's date for new cards' `asserted` (YYYY-MM-DD), injectable for tests. */
  today?: () => string;
}

export interface BoardData {
  /** Version of the last applied graph (older graphs are dropped). */
  version: number | null;
  /**
   * How many graphs this webview has applied: a local token for "this graph is on screen" (the edge engine reports
   * the value it measured). The graph's own `version` cannot serve: the same graph may be applied twice.
   */
  seq: number;
  subject: string;
  nodes: Readonly<Record<string, TlNode>>;
  order: Readonly<Record<NodeType, readonly string[]>>;
  edges: readonly TlEdge[];
  vocabulary: readonly VocabItem[];
  /** `vocabulary` by fully-qualified name. */
  vocab: ReadonlyMap<string, VocabItem>;
  diagnostics: readonly BoardDiagnostic[];
  semantic: SemanticSummary;
  /** Optimistic cards the host has not confirmed yet (an add in flight): no drag, edit or delete. */
  provisional: Readonly<Record<string, true>>;
  /** M2 (D-18): this subject's "These suffice" rounds, newest first (`TlGraph.attempts`). */
  attempts: readonly AttemptSummary[];
}

export interface Toast {
  /** Local, unique per toast. */
  key: number;
  level: NoticeLevel;
  text: string;
  /**
   * The host said this action can be undone. Only the newest such toast keeps the flag (a newer undoable notice, or
   * any Undo/Redo, clears it on the others), and its button shows only while the host's Undo would undo exactly this
   * action (see `toastCanUndo`): the protocol's `undo` names no action, it always undoes the latest one.
   */
  undoable: boolean;
}

/**
 * Whether a toast offers Undo now: it is the newest undoable toast and the host's Undo (WorkspaceState.undo, the label
 * of the action Undo reverts) is this toast's action. Without workspace state (an older host) the flag decides.
 */
export function toastCanUndo(toast: Toast, workspace: Pick<WorkspaceState, 'undo'> | null): boolean {
  return toast.undoable && (workspace === null || workspace.undo === toast.text);
}

export interface HostData {
  workspace: WorkspaceState | null;
  history: HistoryListing | null;
  /** A `historyList` request is in flight. */
  historyLoading: boolean;
  toasts: readonly Toast[];
}

export interface DragState {
  id: string;
  from: NodeType;
}

/** A short highlight of a vocabulary item or card: `vocab:<name>` or `node:<id>`; `token` makes repeats visible. */
export interface Flash {
  target: string;
  token: number;
}

export const flashTarget = {
  vocab: (name: string) => `vocab:${name}`,
  node: (id: string) => `node:${id}`,
} as const;

/** How long a highlight stays on (data-highlight). */
export const FLASH_MS = 2000;

export type DialogState =
  /** A kind change that removes a `.holds` others use (D-11 A->G, D->G): rewrite / mark broken / cancel. */
  | {
      kind: 'dependents';
      id: string;
      to: NodeType;
      beforeId: string | null;
      /** Node ids, or fully-qualified Lean names of untracked declarations. */
      dependents: readonly string[];
      /** The host's description of the dependents that are cards (any subject), when it sent one. */
      cards?: Readonly<Record<string, DependentCard>>;
      rewriteAvailable: boolean;
      summary: string;
      detail: string;
      /**
       * M2 (carry-over 3): the host refused a choice made for the dependents this dialog listed before, because it
       * found more; the list is now the host's, and the dialog says so.
       */
      relisted?: boolean;
      /** The optional reason of a change to Assumption given before the host asked (sent again with the answer). */
      rationale?: string;
    }
  /** A change to Assumption: the optional "Why do you hold it?" (D-14, never blocking). */
  | { kind: 'rationale'; id: string; to: NodeType; beforeId: string | null; summary: string; detail: string }
  /**
   * D-18 delete. Without `dependents`: the first question (what refers to the card on this board; card only, or
   * with its Lean code). With `dependents`: the host refused to delete the card's Lean code (`needs-confirmation`)
   * because these declarations use it and would stop compiling (node ids, or fully-qualified Lean names of
   * declarations without a card); the dialog lists them and offers "Delete anyway" (`confirmed: true`). `cards`:
   * the host's description of the dependents that are cards, so another subject's card shows by its sentence.
   */
  | { kind: 'delete'; id: string; dependents?: readonly string[]; cards?: Readonly<Record<string, DependentCard>> }
  | { kind: 'revert'; entry: HistoryEntry };

export interface EditingState {
  id: string;
  field: 'naturalName' | 'rationale';
}

export interface BoardUi {
  /** Selection in click order (the tray lists it in this order). */
  selected: readonly string[];
  /** Explicit target chosen in the tray; otherwise the single selected GOAL is the target. */
  target: string | null;
  expanded: Readonly<Record<string, true>>;
  hover: string | null;
  drag: DragState | null;
  /** Column under the pointer during a drag (the highlighted drop zone). */
  dropKind: NodeType | null;
  promptKind: NodeType;
  vocabCollapsed: boolean;
  flash: Flash | null;
  dialog: DialogState | null;
  editing: EditingState | null;
}

/** Run requests whose buttons show that they are in flight (until the host's `actionResult`). */
export type RunAction = 'start' | 'answer' | 'cancel' | 'resume' | 'stop' | 'accept' | 'feedback' | 'discard' | 'adopt' | 'reject';

export interface RunBusy {
  action: RunAction;
  requestId: string;
  /** The question set, ghost or proposal it is about. */
  key?: string;
}

/** The end-of-round review (D-19), per proposal (proposal ids are unique within a run only, so the run id is part of the key). */
export interface ReviewUi {
  runId: string;
  proposalId: string;
  /** Index into `reviewSteps(proposal)`. */
  step: number;
  /** The report card is shown: the user went through the statements, or pressed "Show result" (D-19). */
  revealed: boolean;
  /** Statements shown in their fully explicit form, by node id. */
  explicit: Readonly<Record<string, true>>;
  /** Answers to the definition questions (Accept needs "yes" for each; "no" is Feedback). */
  definitions: Readonly<Record<string, 'yes' | 'no'>>;
  /** Lifecycle ticks (recommended items start ticked). */
  lifecycle: Readonly<Record<string, boolean>>;
  /** The Feedback draft (the user's words; may span lines). */
  feedback: string;
  feedbackOpen: boolean;
  /** Bumped whenever the Feedback field should take the focus (a prefill, the banner's Feedback). */
  feedbackFocus: number;
}

/**
 * What this board's own Accept did to the user's files, for the run panel's outcome line: an Accept of a round that
 * changed no file (and with no card change ticked) only records the outcome (no Undo step, no history entry). Set when
 * Accept is sent, from the proposal's `empty` and the ticks; the host's answer then says for certain (`undoable` is
 * false exactly when Accept applied nothing, e.g. Claude's changes rebased onto identical edits of the user's).
 * Cleared by a refusal and by another run.
 */
export interface AcceptedUi {
  runId: string;
  proposalId: string;
  changedFiles: boolean;
}

export interface RunUi {
  /** The model root's current run (any subject), as the host last posted it. Never part of the graph. */
  run: RunView | null;
  /** The current run's proposal, as the host last posted it. Its graph is shown only through `overlay`. */
  proposal: ProposalView | null;
  /** The board as the proposal would leave it (derived from `proposal`; read through `boardView`). */
  overlay: Overlay | null;
  /** The board shows the proposal ("Proposed") instead of the current files ("Current"). */
  proposedView: boolean;
  /** The Vocabulary group in the proposed view: null = automatic (open when the proposal adds vocabulary). */
  vocabProposedCollapsed: boolean | null;
  /** The run panel is open (it opens by itself when something needs the user). */
  runPanelOpen: boolean;
  /** The run panel's size, per layout (webview state). */
  runSplit: RunSplit;
  review: ReviewUi | null;
  /** Answer drafts of the pending question set, by set id (one per question). */
  answerDrafts: Readonly<Record<string, readonly AnswerDraft[]>>;
  runBusy: RunBusy | null;
  /** What the board's own Accept of the current run changed (null: no Accept sent from this board for it). */
  accepted: AcceptedUi | null;
}

export interface AddExtras {
  rationale?: string;
  stance?: Stance;
  source?: Evidential;
}

export interface BoardActions {
  /** Applies a host message (graph, workspace, history, actionResult, notice). */
  receive(message: HostToWebviewMessage): void;
  /** Applies a graph unless it is older than the last one applied. Returns whether it was applied. */
  applyGraph(graph: TlGraph): boolean;
  /** Click selects only this card; Ctrl/Cmd-click (`additive`) toggles it in the selection. */
  clickCard(id: string, additive: boolean): void;
  deselect(id: string): void;
  clearSelection(): void;
  setTarget(id: string | null): void;
  toggleExpanded(id: string): void;
  setExpanded(id: string, open: boolean): void;
  setHover(id: string | null): void;
  startDrag(id: string): void;
  setDropKind(kind: NodeType | null): void;
  endDrag(): void;
  /** A drop: within the card's column a re-order, across columns a kind change (D-11, with its dialogs). */
  dropCard(id: string, to: NodeType, beforeId: string | null): void;
  /** Re-orders a card within its column (layout only) and posts `reorder`. */
  reorder(id: string, beforeId: string | null): void;
  /** The keyboard re-order (Alt+Up/Down): one place up (-1) or down (+1) in its column. False when it cannot move. */
  moveCard(id: string, delta: -1 | 1): boolean;
  /** "Make <kind>" (drop zones, the expanded card's buttons): opens the dialog the impact needs, or posts at once. */
  requestKindChange(id: string, to: NodeType, beforeId: string | null): void;
  /** Answers the dependents dialog. */
  confirmDependents(choice: 'rewrite' | 'mark-broken'): void;
  /** Answers the rationale dialog: the reason, or null to skip it. */
  confirmRationale(rationale: string | null): void;
  closeDialog(): void;
  /** Adds an optimistic card from the A|D|G box and posts `addNode`. Returns its provisional id. */
  addNode(type: NodeType, text: string, extras?: AddExtras): string | null;
  setPromptKind(kind: NodeType): void;
  startEdit(id: string, field: EditingState['field']): void;
  stopEdit(): void;
  /** Posts `editNode` (optimistically applied). Returns false when nothing changes or the value is invalid. */
  editNode(id: string, field: EditableField, value: string | null): boolean;
  openDelete(id: string): void;
  /**
   * Posts `deleteNode` (not optimistic) and closes the delete dialog. `confirmed` (only with `keepLean` false): the
   * user saw the declarations that use its Lean code and deletes it anyway ("Delete anyway"). When the host answers
   * `needs-confirmation` to an unconfirmed delete, the delete dialog opens again and lists them.
   */
  deleteNode(id: string, keepLean: boolean, confirmed?: boolean): void;
  /**
   * M2 "These suffice ▶" / "Self-evident?": posts `startRun` with the tray's target and premises (none: "Self-evident?"),
   * unless the tray is incomplete, the target is an assumption, or a run of this model folder is active. `replace` (the
   * default, D-13: the host declares exactly the selected premises) or `add` ("Add to its premises ▶": the target's
   * declared premises plus the selected ones).
   */
  startRun(mode?: 'replace' | 'add'): boolean;
  /** Edits the answer draft of question `index` of the pending set `setId`. */
  setAnswerDraft(setId: string, index: number, patch: Partial<AnswerDraft>): void;
  /** Posts `answerQuestions` for the pending set, once every question has a valid answer. */
  submitAnswers(): boolean;
  cancelRun(): void;
  /** "Resume" on an interrupted run. */
  resumeRun(): void;
  /** "Stop" on an interrupted run (= Discard, docs/m2-plan.md section 2). */
  stopRun(): void;
  /** Removes an ended run from the board. */
  dismissRun(): void;
  setRunPanelOpen(open: boolean): void;
  /** The run panel's size in a layout, as a fraction of the workspace (clamped), or null for the default; persisted. */
  setRunSplit(layout: RunPanelLayout, fraction: number | null): void;
  /** Current | Proposed. */
  setProposedView(proposed: boolean): void;
  /** The review stepper: go to a step (reaching one past the statements reveals the result). */
  reviewGo(step: number): void;
  /** "Show result" before the statements are done (D-19's explicit early reveal). */
  revealResult(): void;
  toggleExplicit(nodeId: string): void;
  /** A definition question's yes/no. A "no" opens Feedback, prefilled. */
  answerDefinition(id: string, answer: 'yes' | 'no'): void;
  setLifecycleTick(id: string, ticked: boolean): void;
  setFeedback(text: string): void;
  /** Opens the Feedback field (and focuses it); `prefill` is added on a new line of the draft. */
  openFeedback(prefill?: string): void;
  closeFeedback(): void;
  /** Posts `feedback` with the draft. */
  sendFeedback(): boolean;
  /** Posts `acceptProposal` with the ticked lifecycle items and the approved definitions; refused until all are "yes". */
  acceptProposal(): boolean;
  discardProposal(): void;
  /** "Raw Lean diff…" (one file, or all). */
  openProposalDiff(file?: string): void;
  /** "I hold this" (D-6), with the optional reason. */
  adoptGhost(ghostId: string, rationale?: string): void;
  rejectGhost(ghostId: string): void;
  /** Shows a card of the proposal on the board (switches to the proposed view). */
  showOnBoard(nodeId: string): void;
  toggleVocabulary(): void;
  setVocabularyCollapsed(collapsed: boolean): void;
  /** Expands the Vocabulary group and flashes the item. Returns false for a name that is not on this board. */
  highlightVocab(name: string): boolean;
  /** Flashes a card (its column scrolls to it). Returns false for an id that is not on this board. */
  revealNode(id: string): boolean;
  undo(): void;
  redo(): void;
  selectSubject(subject: string): void;
  /** Posts `createSubject`; `onResult` receives the host's answer. */
  createSubject(name: string, onResult?: (outcome: ActionOutcome) => void): void;
  requestHistory(limit?: number): void;
  previewHistory(entryId: string, compare: 'parent' | 'current'): void;
  openRevert(entry: HistoryEntry): void;
  revertHistory(entryId: string): void;
  pruneHistory(keepLast: number): void;
  initGit(): void;
  copyText(text: string): boolean;
  openInEditor(file: string, range?: Range): void;
  refresh(): void;
  pushToast(level: NoticeLevel, text: string, undoable?: boolean): void;
  dismissToast(key: number): void;
  /** Whether a card is an add the host has not confirmed yet (read at drag start, not subscribed). */
  isProvisional(id: string): boolean;
}

export type BoardState = BoardData & HostData & BoardUi & RunUi & BoardActions;
export type BoardStore = StoreApi<BoardState>;

export interface TrayModel {
  premises: string[];
  target: string | null;
  /** Why the run buttons are disabled by the selection itself (no target, an assumption as target), or null. */
  blocked: string | null;
  /**
   * The target's declared premises that are not selected: "These suffice" replaces the declared premises (D-13), so
   * it would drop these; "Add to its premises" keeps them.
   */
  dropped: string[];
  /** A target and no premises: "Self-evident?" (D-5: provable from no premises at all) instead of "These suffice". */
  selfEvident: boolean;
}

/** The tray's reason for an assumption as the target (docs/m2-plan.md section 4.1, D-11). */
export const ASSUMPTION_TARGET_BLOCK = 'An assumption is something you hold: make it a Derivation first, then prove it.';

/** The tray's reason when no goal is selected but a Derivation is: a Derivation is a valid target too, chosen with ⊢. */
export const TARGET_CHOICE_BLOCK = 'Choose the target (a Goal or a Derivation) with ⊢.';

/**
 * The start of the host's answer when the user declined the egress consent (packages/extension/src/logic/runs.ts,
 * CONSENT_DECLINED; its unit test pins the prefix): the user's own choice, so the board says it as information, not as
 * an error.
 */
export const CONSENT_DECLINED_PREFIX = 'Not started:';

/** Which layout the run panel is in: below the board (a narrow board) or beside it. */
export type RunPanelLayout = 'narrow' | 'wide';

/**
 * The user's size for the run panel, per layout, as a fraction of the workspace (its height below the board, its
 * width beside it); null = the default size. Fractions, so the split follows window resizes.
 */
export type RunSplit = Readonly<Record<RunPanelLayout, number | null>>;

/** The fractions a dragged split is kept within (CSS keeps the board and the panel at a minimum size besides). */
export const RUN_SPLIT_LIMITS = { min: 0.15, max: 0.85 } as const;

/** Splits the selection into premises and the target slot (pure; the tray and `startRun` share it). */
export function trayModel(state: Pick<BoardState, 'selected' | 'target' | 'nodes'>): TrayModel {
  const selected = state.selected.filter((id) => state.nodes[id]);
  const explicit = state.target && selected.includes(state.target) ? state.target : null;
  const goals = selected.filter((id) => state.nodes[id]?.type === 'GOAL');
  const target = explicit ?? (goals.length === 1 ? (goals[0] ?? null) : null);
  const premises = selected.filter((id) => id !== target);
  let blocked: string | null = null;
  if (!target) {
    if (goals.length > 1) blocked = 'Several goals are selected: choose the target with ⊢.';
    else if (selected.some((id) => state.nodes[id]?.type === 'DERIVATION')) blocked = TARGET_CHOICE_BLOCK;
    else blocked = 'Select the card to prove too: a Goal, or a Derivation (then choose it with ⊢).';
  } else if (state.nodes[target]?.type === 'ASSUMPTION') blocked = ASSUMPTION_TARGET_BLOCK;
  const dropped = target ? (state.nodes[target]?.premises ?? []).filter((id) => !premises.includes(id)) : [];
  return { premises, target, blocked, dropped, selfEvident: target !== null && premises.length === 0 };
}

/** The proposed view applies to the board on screen only while the proposal is about its subject. */
export function proposedOverlay(state: Pick<BoardState, 'proposedView' | 'overlay' | 'subject'>): Overlay | null {
  return state.proposedView && state.overlay !== null && state.overlay.subject === state.subject ? state.overlay : null;
}

/**
 * What the board's columns show: the current graph, or in the proposed view the proposal's overlay. Both are kept in
 * the store, so a selector may return any field of the result (it is never a fresh object).
 */
export function boardView(state: Pick<BoardState, 'proposedView' | 'overlay' | 'subject' | 'nodes' | 'order' | 'edges' | 'vocabulary' | 'vocab'>): BoardViewData {
  return proposedOverlay(state) ?? state;
}

/**
 * Whether the Vocabulary group is collapsed: the user's choice on the current board; in the proposed view it opens by
 * itself when the proposal adds vocabulary ("+N new", 03 section 7) until the user closes it there.
 */
export function vocabularyCollapsed(state: Pick<BoardState, 'proposedView' | 'overlay' | 'subject' | 'vocabCollapsed' | 'vocabProposedCollapsed'>): boolean {
  const overlay = proposedOverlay(state);
  if (!overlay) return state.vocabCollapsed;
  return state.vocabProposedCollapsed ?? (newVocabularyCount(overlay.diff) > 0 ? false : state.vocabCollapsed);
}

/** The graph as kindChangeImpact sees it: the board's current cards (optimistic moves included, provisional ones not). */
export function impactGraph(state: Pick<BoardState, 'nodes' | 'edges' | 'semantic' | 'provisional'>): Pick<TlGraph, 'nodes' | 'edges' | 'semantic'> {
  // kindChangeImpact only reads the edges (its parameter type is merely not `readonly`).
  return { nodes: Object.values(state.nodes).filter((n) => !state.provisional[n.id]), edges: state.edges as TlEdge[], semantic: state.semantic };
}

/** The D-11 impact of dropping `id` on `to`, or null when there is none (same column, unknown or provisional card). */
export function impactOf(state: Pick<BoardState, 'nodes' | 'edges' | 'semantic' | 'provisional'>, id: string, to: NodeType): KindChangeImpact | null {
  const node = state.nodes[id];
  if (!node || node.type === to || state.provisional[id]) return null;
  try {
    return kindChangeImpact(impactGraph(state), id, to);
  } catch {
    return null;
  }
}

const emptyOrder = (): Record<NodeType, string[]> => ({ ASSUMPTION: [], DERIVATION: [], GOAL: [] });

/** Moves `id` into column `to` above `beforeId` (null or absent = end). Returns the new order and where it landed. */
export function moveInOrder(
  order: Readonly<Record<NodeType, readonly string[]>>,
  id: string,
  to: NodeType,
  beforeId: string | null,
): { order: Record<NodeType, string[]>; beforeId: string | null; previous: { column: NodeType; beforeId: string | null } | null } {
  let previous: { column: NodeType; beforeId: string | null } | null = null;
  const next = emptyOrder();
  for (const kind of NODE_TYPES) {
    const index = order[kind].indexOf(id);
    if (index >= 0) previous = { column: kind, beforeId: order[kind][index + 1] ?? null };
    next[kind] = order[kind].filter((x) => x !== id);
  }
  const column = next[to];
  const index = beforeId && beforeId !== id ? column.indexOf(beforeId) : -1;
  if (index >= 0) column.splice(index, 0, id);
  else column.push(id);
  return { order: next, beforeId: index >= 0 ? beforeId : null, previous };
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const unique = (ids: readonly string[]) => [...new Set(ids)];
const defaultToday = () => new Date().toISOString().slice(0, 10);

/** How long a toast stays (ms). Errors stay longest; the close button is always there. */
const TOAST_MS: Readonly<Record<NoticeLevel, number>> = { info: 6000, warning: 10_000, error: 15_000 };
/** At most this many toasts at once (the oldest goes first), so they never cover much of the board. */
export const MAX_TOASTS = 3;

/** What a request in flight needs when its `actionResult` arrives. */
type Pending =
  /** A drag (kind change or re-order): `back` undoes the optimistic move; `seq` = the graph it was applied on. */
  | {
      kind: 'move';
      id: string;
      seq: number;
      back: { column: NodeType; beforeId: string | null; type: NodeType };
      /** For a kind change: what to re-ask if the host wants a confirmation. */
      change?: { to: NodeType; beforeId: string | null };
      /** M2 carry-over 3: the dependents the dialog listed when the user chose what to do with them. */
      confirmed?: readonly string[];
      /** The optional reason sent with a change to Assumption (re-sent with the answer if the host asks first). */
      rationale?: string;
    }
  /** An add: the provisional card `clientId` until the host's card (`finalId`, or a sentence match) is on the board. */
  | { kind: 'add'; clientId: string; type: NodeType; naturalName: string; finalId?: string; matchedId?: string }
  /** An in-place edit: `previous` is the card before it (only `field` is restored on a refusal). */
  | { kind: 'edit'; id: string; seq: number; field: EditableField; previous: TlNode }
  /** A delete: `needs-confirmation` (its Lean code is used elsewhere) re-opens the delete dialog with the list. */
  | { kind: 'delete'; id: string; keepLean: boolean; confirmed: boolean }
  /** M2: a run request (its buttons stay disabled until the answer; a refusal is an error toast). */
  | { kind: 'run'; action: RunAction }
  | { kind: 'plain'; onResult?: (outcome: ActionOutcome) => void };

const KIND_NAME: Readonly<Record<NodeType, string>> = { ASSUMPTION: 'Assumption', DERIVATION: 'Derivation', GOAL: 'Goal' };

/**
 * The dialog title for a kind change the host wants confirmed although the board's own impact (from the graph alone)
 * did not ask: the host's facts know dependents the graph does not show. Worded like core's kindChangeImpact.
 */
function confirmSummary(to: NodeType, count: number): string {
  const dependents = count === 0 ? 'its dependents need' : `${count} dependent${count === 1 ? '' : 's'} ${count === 1 ? 'needs' : 'need'}`;
  return `Make ${KIND_NAME[to]}: ${dependents} ${to === 'GOAL' ? 'a hypothesis rewrite' : 'a rewrite'}`;
}

/** A new review: the first step, nothing answered, the recommended lifecycle items ticked (D-21). */
function initialReview(proposal: ProposalView): ReviewUi {
  const steps = reviewSteps(proposal);
  return {
    runId: proposal.runId,
    proposalId: proposal.proposalId,
    step: 0,
    // Nothing to read first (no new or changed statement): the result is shown at once.
    revealed: pastStatements(steps, 0),
    explicit: {},
    definitions: {},
    lifecycle: initialLifecycle(proposal),
    feedback: '',
    feedbackOpen: false,
    feedbackFocus: 0,
  };
}

/** A split fraction within RUN_SPLIT_LIMITS, rounded to a tenth of a percent. */
export function clampSplit(fraction: number): number {
  return Math.round(Math.min(RUN_SPLIT_LIMITS.max, Math.max(RUN_SPLIT_LIMITS.min, fraction)) * 1000) / 1000;
}

/** The persisted split, read defensively (an older build or a hand-edited state may hold anything). */
export function readSplit(raw: unknown): RunSplit {
  const value = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? clampSplit(v) : null);
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return { narrow: value(record.narrow), wide: value(record.wide) };
}

/** The draft with `prefill` added on its own line (an empty draft becomes just the prefill). */
function withPrefill(draft: string, prefill: string): string {
  if (!prefill) return draft;
  if (draft.trim().length === 0) return prefill;
  return `${draft.replace(/\s+$/, '')}\n${prefill}`;
}

export function createBoardStore(post: Post, options: StoreOptions = {}): BoardStore {
  const persist = options.persist ?? (() => {});
  const setTimer = options.setTimer ?? ((callback: () => void, ms: number) => setTimeout(callback, ms));
  const today = options.today ?? defaultToday;
  const pending = new Map<string, Pending>();
  let requestCounter = options.persisted?.requestCounter ?? 0;
  let toastKey = 0;
  let flashToken = 0;
  /** Ids of the last host graph (to recognise the host's card for an add whose result has not arrived). */
  let hostIds = new Set<string>();

  return createStore<BoardState>()((set, get) => {
    const postSelection = (ids: readonly string[]) => post(webviewMessage('select', { ids: [...ids] }));

    const nextRequestId = () => {
      requestCounter += 1;
      persist({ requestCounter });
      return `r${requestCounter}`;
    };

    /** Registers a request and returns its id. */
    const track = (entry: Pending) => {
      const requestId = nextRequestId();
      pending.set(requestId, entry);
      return requestId;
    };

    const plain = (onResult?: (outcome: ActionOutcome) => void) => track({ kind: 'plain', ...(onResult ? { onResult } : {}) });

    const errorToast = (outcome: Extract<ActionOutcome, { ok: false }>) => get().pushToast('error', outcome.error || `Refused (${outcome.code}).`);

    /** Renames card ids in the UI state (a provisional card replaced by the host's), dropping ids that are gone. */
    const remapUi = (nodes: Readonly<Record<string, TlNode>>, map: (id: string) => string) => {
      const s = get();
      const keep = (id: string) => nodes[id] !== undefined;
      const selected = unique(s.selected.map(map)).filter(keep);
      const expanded: Record<string, true> = {};
      for (const id of Object.keys(s.expanded)) if (keep(map(id))) expanded[map(id)] = true;
      const target = s.target && keep(map(s.target)) ? map(s.target) : null;
      const hover = s.hover && keep(map(s.hover)) ? map(s.hover) : null;
      const editing = s.editing && keep(map(s.editing.id)) ? { ...s.editing, id: map(s.editing.id) } : null;
      return { selected, expanded, target, hover, editing };
    };

    /** Removes a provisional card (its add failed, or the host's card replaced it under `replacement`). */
    const dropProvisional = (clientId: string, replacement?: string) => {
      const s = get();
      if (!s.provisional[clientId]) return;
      const nodes = { ...s.nodes };
      delete nodes[clientId];
      const provisional = { ...s.provisional };
      delete provisional[clientId];
      const order = emptyOrder();
      for (const kind of NODE_TYPES) order[kind] = s.order[kind].filter((id) => id !== clientId);
      const ui = remapUi(nodes, (id) => (id === clientId && replacement ? replacement : id));
      set({ nodes, provisional, order, ...ui });
      if (!sameList(ui.selected, s.selected)) postSelection(ui.selected);
    };

    /** Undoes an optimistic move, unless a graph arrived since (it shows the host's state already). */
    const rollbackMove = (entry: Extract<Pending, { kind: 'move' }>) => {
      const s = get();
      const node = s.nodes[entry.id];
      if (s.seq !== entry.seq || !node) return;
      const { order } = moveInOrder(s.order, entry.id, entry.back.column, entry.back.beforeId);
      set({ order, nodes: node.type === entry.back.type ? s.nodes : { ...s.nodes, [entry.id]: { ...node, type: entry.back.type } } });
    };

    /** Undoes an optimistic edit of one field (later edits of other fields stay), unless a graph arrived since. */
    const rollbackEdit = (entry: Extract<Pending, { kind: 'edit' }>) => {
      const s = get();
      const current = s.nodes[entry.id];
      if (s.seq !== entry.seq || !current) return;
      const { previous } = entry;
      const restored: TlNode = { ...current };
      switch (entry.field) {
        case 'naturalName':
          restored.naturalName = previous.naturalName;
          break;
        case 'rationale':
          if (previous.rationale === undefined) delete restored.rationale;
          else restored.rationale = previous.rationale;
          restored.status = { ...current.status, flags: previous.status.flags };
          break;
        case 'stance':
          if (previous.stance === undefined) delete restored.stance;
          else restored.stance = previous.stance;
          break;
        case 'source':
          if (previous.source === undefined) delete restored.source;
          else restored.source = previous.source;
          break;
      }
      set({ nodes: { ...s.nodes, [entry.id]: restored } });
    };

    /**
     * The dependents dialog after the host answered a kind change with `needs-confirmation`. When the board's own
     * impact asks for the same confirmation about the same dependents, its texts are used; otherwise (the host's
     * facts know dependents the graph does not show) its texts would contradict the host ("no card on this board uses
     * it", "stays valid", another count), so the title is worded from the host's list and the explanation is the
     * host's message.
     */
    const openDependents = (
      id: string,
      to: NodeType,
      beforeId: string | null,
      dependents: readonly string[] | undefined,
      hostMessage: string,
      cards?: Readonly<Record<string, DependentCard>>,
      extra: { relisted?: boolean; rationale?: string } = {},
    ) => {
      const impact = impactOf(get(), id, to);
      const list = dependents ?? impact?.dependents ?? [];
      const agrees = impact?.needsConfirmation === true && sameList([...impact.dependents].sort(), [...list].sort());
      set({
        dialog: {
          kind: 'dependents',
          id,
          to,
          beforeId,
          dependents: list,
          ...(cards ? { cards } : {}),
          rewriteAvailable: impact?.rewriteAvailable ?? false,
          summary: agrees ? impact.summary : confirmSummary(to, list.length),
          detail: agrees ? impact.detail : hostMessage || 'Other proofs use this card.',
          ...(extra.relisted ? { relisted: true } : {}),
          ...(extra.rationale ? { rationale: extra.rationale } : {}),
        },
      });
    };

    /**
     * The optimistic move + `kindChange` post (after any dialog). `confirmedDependents` (carry-over 3): the dependents
     * the dialog listed when the user chose `dependents`, so the host never applies the choice to one it did not show.
     */
    const performKindChange = (
      id: string,
      to: NodeType,
      beforeId: string | null,
      extra: { dependents?: 'rewrite' | 'mark-broken'; rationale?: string; confirmedDependents?: readonly string[] },
    ) => {
      const s = get();
      const node = s.nodes[id];
      if (!node || node.type === to || s.provisional[id]) return;
      const from = node.type;
      const moved = moveInOrder(s.order, id, to, beforeId);
      set({ order: moved.order, nodes: { ...s.nodes, [id]: { ...node, type: to } } });
      const rationale = extra.rationale ? oneLine(extra.rationale) : '';
      const confirmed = extra.dependents ? unique(extra.confirmedDependents ?? []).slice(0, LIMITS.listLength) : undefined;
      const requestId = track({
        kind: 'move',
        id,
        seq: s.seq,
        back: { column: moved.previous?.column ?? from, beforeId: moved.previous?.beforeId ?? null, type: from },
        change: { to, beforeId: moved.beforeId },
        ...(confirmed ? { confirmed } : {}),
        ...(rationale ? { rationale } : {}),
      });
      post(
        webviewMessage('kindChange', {
          id,
          from,
          to,
          beforeId: moved.beforeId,
          requestId,
          ...(extra.dependents ? { dependents: extra.dependents } : {}),
          ...(rationale ? { rationale } : {}),
          ...(confirmed ? { confirmedDependents: confirmed } : {}),
        }),
      );
    };

    /** A run request: tracked like any request, and its buttons show it until the host answers. */
    const trackRun = (action: RunAction, key?: string) => {
      const requestId = track({ kind: 'run', action });
      set({ runBusy: { action, requestId, ...(key !== undefined ? { key } : {}) } });
      return requestId;
    };

    /** The run a review action is about: the proposal's run, else the current run. */
    const reviewRunId = () => get().proposal?.runId ?? get().run?.runId ?? null;

    /** A new overlay for the current proposal (after the proposal, the board's graph or the reveal changed). */
    const overlayFor = (proposal: ProposalView | null, review: ReviewUi | null, current: { nodes: Readonly<Record<string, TlNode>>; vocabulary: readonly VocabItem[] }) =>
      proposal ? buildOverlay(proposal, current, !(review?.revealed ?? false)) : null;

    const setReview = (patch: Partial<ReviewUi>) => {
      const s = get();
      if (!s.review) return;
      const review = { ...s.review, ...patch };
      const revealChanged = review.revealed !== s.review.revealed;
      set({ review, ...(revealChanged ? { overlay: overlayFor(s.proposal, review, s) } : {}) });
    };

    /** After any Undo or Redo, no toast's Undo names the action Undo would revert any more. */
    const clearToastUndo = () => {
      const toasts = get().toasts;
      if (toasts.some((t) => t.undoable)) set({ toasts: toasts.map((t) => (t.undoable ? { ...t, undoable: false } : t)) });
    };

    const flash = (target: string) => {
      const token = ++flashToken;
      set({ flash: { target, token } });
      setTimer(() => {
        if (get().flash?.token === token) set({ flash: null });
      }, FLASH_MS);
    };

    const applyActionResult = (requestId: string, outcome: ActionOutcome) => {
      const entry = pending.get(requestId);
      pending.delete(requestId);
      if (!entry) {
        // Not ours (e.g. sent before this webview reloaded): still worth telling the user about a refusal.
        if (!outcome.ok) errorToast(outcome);
        return;
      }
      switch (entry.kind) {
        case 'add': {
          if (!outcome.ok) {
            dropProvisional(entry.clientId);
            errorToast(outcome);
            return;
          }
          const finalId = outcome.nodeId;
          if (entry.matchedId) {
            // The graph came first and a card with the same sentence took the provisional card's place; if the host
            // names a different card, move the selection there.
            if (finalId && finalId !== entry.matchedId && get().nodes[finalId]) {
              const ui = remapUi(get().nodes, (id) => (id === entry.matchedId ? finalId : id));
              const before = get().selected;
              set(ui);
              if (!sameList(ui.selected, before)) postSelection(ui.selected);
            }
            return;
          }
          if (finalId && get().nodes[finalId] && !get().provisional[finalId]) {
            dropProvisional(entry.clientId, finalId);
            return;
          }
          // Wait for the graph that contains the host's card.
          pending.set(requestId, finalId ? { ...entry, finalId } : entry);
          return;
        }
        case 'move': {
          if (outcome.ok) return;
          rollbackMove(entry);
          // Carry-over 3: after a choice made for the listed dependents, the host asks again only when it found more;
          // the dialog then lists the host's dependents. Asked again about nothing new, it would loop: say why instead.
          const confirmed = entry.confirmed;
          const nothingNew = confirmed !== undefined && (outcome.dependents ?? []).every((d) => confirmed.includes(d));
          if (outcome.code === 'needs-confirmation' && entry.change && !nothingNew) {
            openDependents(entry.id, entry.change.to, entry.change.beforeId, outcome.dependents, outcome.error, outcome.dependentCards, {
              relisted: confirmed !== undefined,
              ...(entry.rationale ? { rationale: entry.rationale } : {}),
            });
          } else {
            errorToast(outcome);
          }
          return;
        }
        case 'edit':
          if (outcome.ok) return;
          rollbackEdit(entry);
          errorToast(outcome);
          return;
        case 'delete': {
          if (outcome.ok) return;
          const s = get();
          // Deleting its Lean code would break other declarations: ask again, listing them (D-18). A confirmed delete
          // is never asked again (a host that still refuses it says why in a toast), nor is "card only".
          if (outcome.code === 'needs-confirmation' && !entry.keepLean && !entry.confirmed && s.nodes[entry.id] && !s.provisional[entry.id]) {
            set({
              dialog: { kind: 'delete', id: entry.id, dependents: [...(outcome.dependents ?? [])], ...(outcome.dependentCards ? { cards: outcome.dependentCards } : {}) },
            });
            return;
          }
          errorToast(outcome);
          return;
        }
        case 'run': {
          if (get().runBusy?.requestId === requestId) set({ runBusy: null });
          // The host's answer to Accept says for certain whether it changed the files (an Accept that applied
          // nothing has no Undo step); a refused Accept changed nothing and the run goes on.
          const accepted = get().accepted;
          if (entry.action === 'accept' && accepted) set({ accepted: outcome.ok ? { ...accepted, changedFiles: outcome.undoable } : null });
          // Declining the egress consent is the user's own choice: information, not an error.
          if (!outcome.ok && entry.action === 'start' && outcome.error.startsWith(CONSENT_DECLINED_PREFIX)) get().pushToast('info', outcome.error);
          else if (!outcome.ok) errorToast(outcome);
          return;
        }
        case 'plain':
          entry.onResult?.(outcome);
          if (!outcome.ok) errorToast(outcome);
          return;
      }
    };

    /** The host's run: kept as sent (never through applyGraph); the panel opens when something needs the user. */
    const applyRun = (run: RunView | null) => {
      const s = get();
      const previous = s.run;
      const patch: Partial<BoardState> = { run };
      if (!run) {
        patch.answerDrafts = {};
        patch.accepted = null;
        if (s.runBusy && s.runBusy.action !== 'start') patch.runBusy = null;
        set(patch);
        return;
      }
      const newRun = previous?.runId !== run.runId;
      // What the board's own Accept changed is about that run only.
      if (s.accepted && s.accepted.runId !== run.runId) patch.accepted = null;
      const pendingId = run.pendingQuestions?.id;
      const newQuestion = pendingId !== undefined && pendingId !== previous?.pendingQuestions?.id;
      const changedState = newRun || previous?.state !== run.state || previous?.round !== run.round;
      // Something that needs the user, or a new run: open the panel (only the board's own subject has one).
      if (newRun || newQuestion || (changedState && (run.state === 'review' || run.state === 'interrupted' || isTerminalRunState(run.state)))) {
        patch.runPanelOpen = true;
      }
      // Drafts belong to the pending set only.
      const drafts = pendingId !== undefined ? s.answerDrafts[pendingId] : undefined;
      patch.answerDrafts = pendingId !== undefined && drafts ? { [pendingId]: drafts } : {};
      // A request in flight is answered by its actionResult; a new state (or a new question) settles it as well.
      if (s.runBusy && (changedState || newQuestion || (s.runBusy.action === 'answer' && s.runBusy.key !== pendingId))) patch.runBusy = null;
      // A run that left review (Feedback, an adopted suggestion, Accept) has no proposal to show any more, even before
      // the host's `proposal: null` arrives.
      if (s.proposedView && run.state !== 'review' && s.proposal?.runId === run.runId) patch.proposedView = false;
      set(patch);
    };

    /** The host's proposal: kept as sent; the review starts on a new proposal id, and the board shows it. */
    const applyProposal = (proposal: ProposalView | null) => {
      const s = get();
      if (!proposal) {
        set({ proposal: null, overlay: null, proposedView: false, review: null, vocabProposedCollapsed: null, ...(s.runBusy?.key === s.proposal?.proposalId ? { runBusy: null } : {}) });
        return;
      }
      const fresh = !s.review || s.review.proposalId !== proposal.proposalId || s.review.runId !== proposal.runId;
      const review = fresh ? initialReview(proposal) : s.review;
      const overlay = overlayFor(proposal, review, s);
      // The board switches to the proposal (its result hidden until the review reveals it, D-19), unless the user is
      // in the middle of a drag or an edit; the Current | Proposed toggle switches back.
      const show = fresh && proposal.subject === s.subject && s.drag === null && s.editing === null;
      set({
        proposal,
        overlay,
        review,
        ...(fresh ? { vocabProposedCollapsed: null, runPanelOpen: true, ...(show ? { proposedView: true } : {}) } : {}),
      });
    };

    return {
      version: null,
      seq: 0,
      subject: '',
      nodes: {},
      order: emptyOrder(),
      edges: [],
      vocabulary: [],
      vocab: new Map(),
      diagnostics: [],
      semantic: { state: 'unavailable' },
      provisional: {},
      attempts: [],
      run: null,
      proposal: null,
      overlay: null,
      proposedView: false,
      vocabProposedCollapsed: null,
      runPanelOpen: true,
      runSplit: readSplit(options.persisted?.runSplit),
      review: null,
      answerDrafts: {},
      runBusy: null,
      accepted: null,
      workspace: null,
      history: null,
      historyLoading: false,
      toasts: [],
      selected: [],
      target: null,
      expanded: {},
      hover: null,
      drag: null,
      dropKind: null,
      promptKind: 'ASSUMPTION',
      // Collapsed until the user opens it (it would push the Assumptions down); highlighting an item opens it.
      vocabCollapsed: options.persisted?.vocabCollapsed ?? true,
      flash: null,
      dialog: null,
      editing: null,

      receive(message) {
        switch (message.type) {
          case 'graph':
            get().applyGraph(message.payload.graph);
            return;
          case 'workspace':
            set({ workspace: message.payload.state });
            return;
          case 'history':
            set({ history: message.payload.listing, historyLoading: false });
            return;
          case 'actionResult':
            applyActionResult(message.payload.requestId, message.payload.outcome);
            return;
          case 'notice':
            get().pushToast(message.payload.level, message.payload.text, message.payload.undoable);
            return;
          case 'run':
            applyRun(message.payload.run);
            return;
          case 'proposal':
            applyProposal(message.payload.proposal);
            return;
        }
      },

      applyGraph(graph) {
        const s = get();
        if (s.version !== null && graph.version < s.version) return false;
        const subjectChanged = s.subject !== '' && graph.subject !== s.subject;
        const nodes: Record<string, TlNode> = {};
        for (const node of graph.nodes) nodes[node.id] = node;
        const order = columnOrder(graph.nodes);
        const provisional: Record<string, true> = {};
        const replaced = new Map<string, string>();

        if (subjectChanged) {
          // Cards being added belong to the subject that was on screen; the host files them there.
          for (const [requestId, entry] of pending) if (entry.kind === 'add') pending.delete(requestId);
        } else {
          const claimed = new Set<string>();
          for (const [requestId, entry] of pending) {
            if (entry.kind !== 'add' || entry.matchedId) continue;
            if (entry.finalId && nodes[entry.finalId]) {
              replaced.set(entry.clientId, entry.finalId);
              pending.delete(requestId);
              continue;
            }
            if (!entry.finalId) {
              // The graph may come before the actionResult: a new card with the same type and sentence is the one.
              const match = graph.nodes.find((n) => !hostIds.has(n.id) && !claimed.has(n.id) && n.type === entry.type && n.naturalName === entry.naturalName);
              if (match) {
                claimed.add(match.id);
                replaced.set(entry.clientId, match.id);
                entry.matchedId = match.id;
                continue;
              }
            }
            const card = s.nodes[entry.clientId];
            if (card && !nodes[entry.clientId]) {
              nodes[entry.clientId] = card;
              order[card.type].push(entry.clientId);
              provisional[entry.clientId] = true;
            }
          }
        }
        hostIds = new Set(graph.nodes.map((n) => n.id));

        const map = (id: string) => replaced.get(id) ?? id;
        const keep = (id: string) => nodes[id] !== undefined;
        const ui = subjectChanged
          ? { selected: [] as string[], expanded: {}, target: null, hover: null, editing: null }
          : (() => {
              const selected = unique(s.selected.map(map)).filter(keep);
              const expanded: Record<string, true> = {};
              for (const id of Object.keys(s.expanded)) if (keep(map(id))) expanded[map(id)] = true;
              return {
                selected,
                expanded,
                target: s.target && keep(map(s.target)) ? map(s.target) : null,
                hover: s.hover && keep(map(s.hover)) ? map(s.hover) : null,
                editing: s.editing && keep(map(s.editing.id)) ? { ...s.editing, id: map(s.editing.id) } : null,
              };
            })();
        const dialog = s.dialog && !subjectChanged && dialogStillValid(s.dialog, nodes) ? s.dialog : null;
        // The run and the proposal are not part of the graph; only the overlay derived from them refers to the
        // current cards (the ones a proposal removes), so it is rebuilt.
        const overlay = overlayFor(s.proposal, s.review, { nodes, vocabulary: graph.vocabulary });

        set({
          version: graph.version,
          seq: s.seq + 1,
          subject: graph.subject,
          nodes,
          order,
          edges: graph.edges,
          vocabulary: graph.vocabulary,
          vocab: vocabIndex(graph.vocabulary),
          diagnostics: graph.diagnostics,
          semantic: graph.semantic,
          provisional,
          attempts: graph.attempts ?? [],
          overlay,
          ...ui,
          dialog,
          ...(subjectChanged ? { flash: null, history: null, drag: null, dropKind: null, proposedView: s.proposal?.subject === graph.subject && s.proposedView } : {}),
        });
        if (!sameList(ui.selected, s.selected)) postSelection(ui.selected);
        if (graph.subject !== s.subject) persist({ subject: graph.subject });
        return true;
      },

      clickCard(id, additive) {
        const { selected } = get();
        let next: readonly string[];
        if (additive) next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
        else if (selected.length === 1 && selected[0] === id) return;
        else next = [id];
        set({ selected: next });
        postSelection(next);
      },

      deselect(id) {
        const { selected, target } = get();
        if (!selected.includes(id)) return;
        const next = selected.filter((x) => x !== id);
        set({ selected: next, target: target === id ? null : target });
        postSelection(next);
      },

      clearSelection() {
        if (get().selected.length === 0) return;
        set({ selected: [], target: null });
        postSelection([]);
      },

      setTarget(id) {
        set({ target: id });
      },

      toggleExpanded(id) {
        get().setExpanded(id, !get().expanded[id]);
      },

      setExpanded(id, open) {
        const expanded = { ...get().expanded };
        if (open === Boolean(expanded[id])) return;
        if (open) expanded[id] = true;
        else delete expanded[id];
        set({ expanded });
      },

      setHover(id) {
        if (get().hover !== id) set({ hover: id });
      },

      startDrag(id) {
        const node = get().nodes[id];
        if (node) set({ drag: { id, from: node.type }, dropKind: null, hover: null });
      },

      setDropKind(kind) {
        if (get().dropKind !== kind) set({ dropKind: kind });
      },

      endDrag() {
        set({ drag: null, dropKind: null });
      },

      dropCard(id, to, beforeId) {
        const node = get().nodes[id];
        if (!node || beforeId === id) return;
        if (node.type === to) get().reorder(id, beforeId);
        else get().requestKindChange(id, to, beforeId);
      },

      reorder(id, beforeId) {
        const s = get();
        const node = s.nodes[id];
        if (!node || s.provisional[id] || beforeId === id) return;
        const column = node.type;
        const current = s.order[column];
        const index = current.indexOf(id);
        if (index < 0) return;
        const after = current[index + 1] ?? null;
        const landing = beforeId && current.includes(beforeId) ? beforeId : null;
        if (landing === after) return; // dropped where it already is
        const moved = moveInOrder(s.order, id, column, landing);
        set({ order: moved.order });
        const requestId = track({ kind: 'move', id, seq: s.seq, back: { column, beforeId: after, type: column } });
        post(webviewMessage('reorder', { id, column, beforeId: moved.beforeId, requestId }));
      },

      moveCard(id, delta) {
        const s = get();
        const node = s.nodes[id];
        if (!node || s.provisional[id]) return false;
        const column = s.order[node.type];
        const index = column.indexOf(id);
        if (index < 0 || index + delta < 0 || index + delta >= column.length) return false;
        // Up: in front of the card above it. Down: in front of the card two below (the end of the column after the last).
        const beforeId = delta < 0 ? (column[index - 1] ?? null) : (column[index + 2] ?? null);
        get().reorder(id, beforeId);
        return true;
      },

      requestKindChange(id, to, beforeId) {
        const s = get();
        const node = s.nodes[id];
        if (!node || s.provisional[id]) return;
        if (node.type === to) return;
        const impact = impactOf(s, id, to);
        if (!impact) return;
        if (impact.needsConfirmation) {
          set({
            dialog: {
              kind: 'dependents',
              id,
              to,
              beforeId,
              dependents: impact.dependents,
              rewriteAvailable: impact.rewriteAvailable,
              summary: impact.summary,
              detail: impact.detail,
            },
          });
          return;
        }
        if (impact.asksRationale) {
          set({ dialog: { kind: 'rationale', id, to, beforeId, summary: impact.summary, detail: impact.detail } });
          return;
        }
        performKindChange(id, to, beforeId, {});
      },

      confirmDependents(choice) {
        const dialog = get().dialog;
        if (dialog?.kind !== 'dependents') return;
        if (choice === 'rewrite' && !dialog.rewriteAvailable) return;
        set({ dialog: null });
        performKindChange(dialog.id, dialog.to, dialog.beforeId, {
          dependents: choice,
          confirmedDependents: dialog.dependents,
          ...(dialog.rationale ? { rationale: dialog.rationale } : {}),
        });
      },

      confirmRationale(rationale) {
        const dialog = get().dialog;
        if (dialog?.kind !== 'rationale') return;
        set({ dialog: null });
        const text = rationale === null ? '' : oneLine(rationale);
        performKindChange(dialog.id, dialog.to, dialog.beforeId, text ? { rationale: text } : {});
      },

      closeDialog() {
        if (get().dialog) set({ dialog: null });
      },

      addNode(type, text, extras = {}) {
        const naturalName = oneLine(text);
        if (!naturalName) return null;
        const s = get();
        const inFlight = new Set([...pending.values()].flatMap((p) => (p.kind === 'add' ? [p.clientId] : [])));
        const id = slugId(naturalName, (candidate) => candidate in s.nodes || inFlight.has(candidate));
        const rationale = extras.rationale ? oneLine(extras.rationale) : '';
        const base = createUserNode({ id, type, naturalName, subject: s.subject, asserted: today() });
        const node: TlNode = {
          ...base,
          ...(rationale ? { rationale } : {}),
          ...(extras.stance ? { stance: extras.stance } : {}),
          ...(extras.source ? { source: extras.source } : {}),
          status: { ...base.status, flags: type === 'ASSUMPTION' && !rationale ? ['no-rationale'] : [] },
        };
        set({
          nodes: { ...s.nodes, [id]: node },
          order: { ...s.order, [type]: [...s.order[type], id] },
          provisional: { ...s.provisional, [id]: true },
          // The new card is the user's, on the current board: show that board (D-16: the box works during a run).
          proposedView: false,
        });
        const requestId = track({ kind: 'add', clientId: id, type, naturalName });
        post(
          webviewMessage('addNode', {
            clientId: id,
            type,
            naturalName,
            requestId,
            ...(rationale ? { rationale } : {}),
            ...(extras.stance ? { stance: extras.stance } : {}),
            ...(extras.source ? { source: extras.source } : {}),
          }),
        );
        return id;
      },

      setPromptKind(kind) {
        set({ promptKind: kind });
      },

      startEdit(id, field) {
        const s = get();
        if (!s.nodes[id] || s.provisional[id]) return;
        set({ editing: { id, field } });
      },

      stopEdit() {
        if (get().editing) set({ editing: null });
      },

      editNode(id, field, value) {
        const s = get();
        const node = s.nodes[id];
        if (!node || s.provisional[id]) return false;
        let next: TlNode;
        let sent: string | null;
        switch (field) {
          case 'naturalName': {
            const sentence = oneLine(value ?? '');
            if (!sentence || sentence === node.naturalName) return false;
            next = { ...node, naturalName: sentence };
            sent = sentence;
            break;
          }
          case 'rationale': {
            const reason = value === null ? '' : oneLine(value);
            if ((reason || undefined) === node.rationale) return false;
            const flags: StatusFlag[] = node.status.flags.filter((f) => f !== 'no-rationale');
            if (!reason && node.type === 'ASSUMPTION') flags.push('no-rationale');
            next = { ...node, status: { ...node.status, flags } };
            if (reason) next.rationale = reason;
            else delete next.rationale;
            sent = reason || null;
            break;
          }
          case 'stance': {
            if ((value ?? undefined) === node.stance) return false;
            next = { ...node };
            if (value === null) delete next.stance;
            else next.stance = value as Stance;
            sent = value;
            break;
          }
          case 'source': {
            if ((value ?? undefined) === node.source) return false;
            next = { ...node };
            if (value === null) delete next.source;
            else next.source = value as Evidential;
            sent = value;
            break;
          }
        }
        set({ nodes: { ...s.nodes, [id]: next } });
        const requestId = track({ kind: 'edit', id, seq: s.seq, field, previous: node });
        post(webviewMessage('editNode', { id, field, value: sent, requestId }));
        return true;
      },

      openDelete(id) {
        const s = get();
        if (!s.nodes[id] || s.provisional[id]) return;
        set({ dialog: { kind: 'delete', id } });
      },

      deleteNode(id, keepLean, confirmed = false) {
        const s = get();
        if (!s.nodes[id] || s.provisional[id]) return;
        if (s.dialog?.kind === 'delete') set({ dialog: null });
        const sure = confirmed && !keepLean;
        const requestId = track({ kind: 'delete', id, keepLean, confirmed: sure });
        post(webviewMessage('deleteNode', { id, keepLean, ...(sure ? { confirmed: true } : {}), requestId }));
      },

      startRun(mode = 'replace') {
        const s = get();
        const tray = trayModel(s);
        if (tray.blocked || !tray.target || trayRunBlock(s.run, s.subject) !== null || s.runBusy?.action === 'start') return false;
        const premises = mode === 'add' ? unique([...(s.nodes[tray.target]?.premises ?? []), ...tray.premises]) : tray.premises;
        // A new start makes the note about an earlier declined consent stale.
        for (const toast of s.toasts) if (toast.text.startsWith(CONSENT_DECLINED_PREFIX)) get().dismissToast(toast.key);
        post(webviewMessage('startRun', { target: tray.target, premises: premises.filter((id) => id !== tray.target), requestId: trackRun('start') }));
        return true;
      },

      setAnswerDraft(setId, index, patch) {
        const s = get();
        const questions = s.run?.pendingQuestions;
        if (!questions || questions.id !== setId || index < 0 || index >= questions.questions.length) return;
        const drafts = questions.questions.map((_, i) => s.answerDrafts[setId]?.[i] ?? emptyDraft());
        const current = drafts[index] ?? emptyDraft();
        drafts[index] = { ...current, ...patch };
        set({ answerDrafts: { ...s.answerDrafts, [setId]: drafts } });
      },

      submitAnswers() {
        const s = get();
        const run = s.run;
        const set_ = run?.pendingQuestions;
        if (!run || !set_ || run.state !== 'waiting-for-answer' || s.runBusy !== null) return false;
        const answers = draftAnswers(set_.questions, s.answerDrafts[set_.id]);
        if (!answers) return false;
        post(webviewMessage('answerQuestions', { runId: run.runId, setId: set_.id, answers, requestId: trackRun('answer', set_.id) }));
        return true;
      },

      cancelRun() {
        const run = get().run;
        if (!run || isTerminalRunState(run.state) || get().runBusy?.action === 'cancel') return;
        post(webviewMessage('cancelRun', { runId: run.runId, requestId: trackRun('cancel') }));
      },

      resumeRun() {
        const run = get().run;
        if (!run || run.state !== 'interrupted' || !run.canResume || get().runBusy !== null) return;
        post(webviewMessage('resumeRun', { runId: run.runId, requestId: trackRun('resume') }));
      },

      stopRun() {
        const run = get().run;
        if (!run || run.state !== 'interrupted' || get().runBusy !== null) return;
        post(webviewMessage('discardProposal', { runId: run.runId, requestId: trackRun('stop') }));
      },

      dismissRun() {
        const run = get().run;
        if (!run || !isTerminalRunState(run.state)) return;
        post(webviewMessage('dismissRun', { runId: run.runId }));
      },

      setRunPanelOpen(open) {
        if (get().runPanelOpen !== open) set({ runPanelOpen: open });
      },

      setRunSplit(layout, fraction) {
        const value = fraction === null || !Number.isFinite(fraction) ? null : clampSplit(fraction);
        const current = get().runSplit;
        if (current[layout] === value) return;
        const runSplit = { ...current, [layout]: value };
        set({ runSplit });
        persist({ runSplit });
      },

      setProposedView(proposed) {
        const s = get();
        const next = proposed && s.overlay !== null && s.overlay.subject === s.subject;
        if (s.proposedView === next) return;
        // The proposed view is read-only: an inline edit or a drag of the current board ends.
        set({ proposedView: next, ...(next ? { editing: null, drag: null, dropKind: null } : {}) });
      },

      reviewGo(step) {
        const s = get();
        if (!s.proposal || !s.review) return;
        const steps = reviewSteps(s.proposal);
        const next = Math.max(0, Math.min(steps.length - 1, Math.round(step)));
        setReview({ step: next, ...(pastStatements(steps, next) ? { revealed: true } : {}) });
      },

      revealResult() {
        const s = get();
        if (!s.proposal || !s.review || s.review.revealed) return;
        setReview({ revealed: true });
      },

      toggleExplicit(nodeId) {
        const review = get().review;
        if (!review) return;
        const explicit = { ...review.explicit };
        if (explicit[nodeId]) delete explicit[nodeId];
        else explicit[nodeId] = true;
        setReview({ explicit });
      },

      answerDefinition(id, answer) {
        const s = get();
        const question = s.proposal?.definitions.find((d) => d.id === id);
        if (!s.review || !question) return;
        setReview({ definitions: { ...s.review.definitions, [id]: answer } });
        if (answer === 'no') {
          const gloss = question.gloss ? ` (“${oneLine(question.gloss)}”)` : '';
          get().openFeedback(`I don't endorse the definition \`${question.name}\`${gloss}: `);
        }
      },

      setLifecycleTick(id, ticked) {
        const s = get();
        if (!s.review || !s.proposal?.lifecycle.some((item) => item.id === id)) return;
        setReview({ lifecycle: { ...s.review.lifecycle, [id]: ticked } });
      },

      setFeedback(text) {
        if (get().review) setReview({ feedback: text });
      },

      openFeedback(prefill = '') {
        const s = get();
        if (!s.review) return;
        setReview({ feedbackOpen: true, feedback: withPrefill(s.review.feedback, prefill), feedbackFocus: s.review.feedbackFocus + 1 });
        if (!s.runPanelOpen) set({ runPanelOpen: true });
      },

      closeFeedback() {
        if (get().review?.feedbackOpen) setReview({ feedbackOpen: false });
      },

      sendFeedback() {
        const s = get();
        const runId = reviewRunId();
        const text = s.review?.feedback.trim() ?? '';
        if (!runId || !s.review || text.length === 0 || text.length > LIMITS.textLength || s.runBusy !== null) return false;
        post(webviewMessage('feedback', { runId, text, requestId: trackRun('feedback', s.review.proposalId) }));
        return true;
      },

      acceptProposal() {
        const s = get();
        const { proposal, review } = s;
        if (!proposal || !review || review.proposalId !== proposal.proposalId || review.runId !== proposal.runId || s.runBusy !== null) return false;
        if (!definitionsApproved(proposal, review.definitions)) return false;
        const { lifecycle, definitions } = acceptSelection(proposal, review);
        // The run panel words the outcome by this until the host's answer says for certain (the run may end before it).
        set({ accepted: { runId: proposal.runId, proposalId: proposal.proposalId, changedFiles: acceptChangesFiles(proposal, review.lifecycle) } });
        post(
          webviewMessage('acceptProposal', {
            runId: proposal.runId,
            proposalId: proposal.proposalId,
            lifecycle,
            definitions,
            requestId: trackRun('accept', proposal.proposalId),
          }),
        );
        return true;
      },

      discardProposal() {
        const s = get();
        const runId = reviewRunId();
        if (!runId || s.runBusy !== null) return;
        post(webviewMessage('discardProposal', { runId, requestId: trackRun('discard', s.proposal?.proposalId) }));
      },

      openProposalDiff(file) {
        const proposal = get().proposal;
        if (!proposal) return;
        post(webviewMessage('openProposalDiff', { runId: proposal.runId, proposalId: proposal.proposalId, ...(file ? { file } : {}) }));
      },

      adoptGhost(ghostId, rationale) {
        const s = get();
        const runId = reviewRunId();
        if (!runId || s.runBusy !== null) return;
        const reason = rationale ? oneLine(rationale) : '';
        post(webviewMessage('adoptGhost', { runId, ghostId, ...(reason ? { rationale: reason } : {}), requestId: trackRun('adopt', ghostId) }));
      },

      rejectGhost(ghostId) {
        const s = get();
        const runId = reviewRunId();
        if (!runId || s.runBusy !== null) return;
        post(webviewMessage('rejectGhost', { runId, ghostId, requestId: trackRun('reject', ghostId) }));
      },

      showOnBoard(nodeId) {
        get().setProposedView(true);
        get().revealNode(nodeId);
      },

      toggleVocabulary() {
        const s = get();
        const overlay = proposedOverlay(s);
        if (overlay) {
          set({ vocabProposedCollapsed: !vocabularyCollapsed(s) });
          return;
        }
        get().setVocabularyCollapsed(!s.vocabCollapsed);
      },

      setVocabularyCollapsed(collapsed) {
        if (get().vocabCollapsed === collapsed) return;
        set({ vocabCollapsed: collapsed });
        persist({ vocabCollapsed: collapsed });
      },

      highlightVocab(name) {
        const s = get();
        if (!boardView(s).vocab.has(name)) return false;
        // In the proposed view the group's open state is the overlay's own (the current board's stays as it was).
        if (proposedOverlay(s)) set({ vocabProposedCollapsed: false });
        else get().setVocabularyCollapsed(false);
        flash(flashTarget.vocab(name));
        return true;
      },

      revealNode(id) {
        if (!boardView(get()).nodes[id]) return false;
        flash(flashTarget.node(id));
        return true;
      },

      undo() {
        clearToastUndo();
        post(webviewMessage('undo', { requestId: plain() }));
      },

      redo() {
        clearToastUndo();
        post(webviewMessage('redo', { requestId: plain() }));
      },

      selectSubject(subject) {
        if (subject !== get().subject) post(webviewMessage('selectSubject', { subject }));
      },

      createSubject(name, onResult) {
        post(webviewMessage('createSubject', { name, requestId: plain(onResult) }));
      },

      requestHistory(limit) {
        const subject = get().subject;
        if (!subject) return;
        set({ historyLoading: true });
        post(webviewMessage('historyList', { subject, ...(limit !== undefined ? { limit } : {}) }));
      },

      previewHistory(entryId, compare) {
        post(webviewMessage('historyPreview', { subject: get().subject, entryId, compare }));
      },

      openRevert(entry) {
        set({ dialog: { kind: 'revert', entry } });
      },

      revertHistory(entryId) {
        if (get().dialog?.kind === 'revert') set({ dialog: null });
        post(webviewMessage('historyRevert', { subject: get().subject, entryId, requestId: plain() }));
      },

      pruneHistory(keepLast) {
        post(webviewMessage('historyPrune', { subject: get().subject, keepLast, requestId: plain() }));
      },

      initGit() {
        post(webviewMessage('initGit', { requestId: plain() }));
      },

      copyText(text) {
        if (text.length === 0) return false;
        if (text.length > LIMITS.copyLength) {
          get().pushToast('error', 'This code is too long to copy from the board; open it in the editor instead.');
          return false;
        }
        post(webviewMessage('copyText', { text }));
        return true;
      },

      openInEditor(file, range) {
        post(webviewMessage('openInEditor', { file, ...(range ? { range } : {}) }));
      },

      refresh() {
        post(webviewMessage('refresh', {}));
      },

      pushToast(level, text, undoable = false) {
        const key = ++toastKey;
        // The same message twice (e.g. the host's notice and our own refusal toast) shows once. A new undoable action
        // makes every older toast's Undo wrong (Undo always undoes the latest action): only the new one keeps it.
        const others = get()
          .toasts.filter((t) => !(t.text === text && t.level === level))
          .map((t) => (undoable && t.undoable ? { ...t, undoable: false } : t));
        set({ toasts: [...others, { key, level, text, undoable }].slice(-MAX_TOASTS) });
        setTimer(() => get().dismissToast(key), undoable ? Math.max(TOAST_MS[level], 10_000) : TOAST_MS[level]);
      },

      dismissToast(key) {
        const toasts = get().toasts;
        if (toasts.some((t) => t.key === key)) set({ toasts: toasts.filter((t) => t.key !== key) });
      },

      isProvisional(id) {
        return get().provisional[id] === true;
      },
    };
  });
}

function dialogStillValid(dialog: DialogState, nodes: Readonly<Record<string, TlNode>>): boolean {
  return dialog.kind === 'revert' || nodes[dialog.id] !== undefined;
}
