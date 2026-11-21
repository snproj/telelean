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
 * explicit toggles, definition answers, the Feedback draft), the answer drafts of a pending
 * question and what the board's own Accept changed (`accepted`) live here too, so the run panel can be re-rendered (or
 * unit-tested) without losing them.
 *
 * Spec v4 slice 1b: arrows as board edits (`addArrows`, `removeArrows`, `setFromNothing`, `claimPending`, `moveCards`),
 * each one message and one Undo step on the host, optimistic and rolled back like a drag; the `arrows` dialog states an
 * impact first (an axiom becoming a proposition, a used arrow) or after the host's `needs-confirmation`. The selection
 * also holds arrows and "follows from nothing" marks (`selectedArrows`, `selectedMarks`), which Delete removes.
 *
 * Spec v4 ES-7, ES-9, UN-3 (slice 1f): while a run of the model folder is active (any subject, any state before it
 * ends), or this board's start is on its way, the Current board is read-only (`editLock`): every edit action changes
 * nothing (an info toast says why when a key asked for it: the controls are disabled with the reason), Undo and Redo
 * post nothing at all (A27: the disabled button says why), and an edit, drag or edit dialog under way ends when the lock
 * begins. Viewing stays: select, expand, scroll, Current | Proposed, the History list. The Proposed view never posts a
 * board edit or a board Undo either; its arrow actions are disabled with their own reason (`arrowLock`). One Delete of
 * arrows and marks is one `removeArrows` (one Undo step, slice 1f carry-over 2).
 *
 * Spec v4 slice 1c2 (the board's gestures; board/gestures.ts holds their rules): the Delete key (`pressDelete`: the
 * selected arrows and marks first, a card's dialog only without them), the selection rectangle (`selectArea`), and a
 * proposition moved over the AXIOMS column (`overAxioms`, for the column's drop zone). Drawing by the handle uses
 * `addArrows`, and a drop on the column `moveToAxioms`.
 *
 * Spec v4.1 ES-2, AR-8, CM-1–CM-5 (slice 1e): the tray and its premises ⊢ target are gone. Formalize for dependencies
 * (`formalize`) takes the selected arrows into one proposition (or its "follows from nothing" mark) as the run's
 * question, as board/contextActions.ts `formalizeState` judges it; a source that is a proposition with neither a proof
 * nor a pending claim is asked about first (the `formalize` dialog: mark it pending, which is the user's own edit made
 * before the start, or cancel), then `startRun(target, sources)` is posted.
 */
import {
  arrowsInUse,
  AXIOM_TO_PROPOSITION_REFUSAL,
  columnOrder,
  createUserNode,
  EDIT_SESSION_ACTIVE,
  edgeId,
  glowingDependents,
  isTerminalRunState,
  kindChangeImpact,
  LIMITS,
  needsHoldsFirst,
  NODE_TYPES,
  removeUsedArrowsText,
  runLocksBoard,
  slugId,
  webviewMessage,
  type ActionOutcome,
  type ArrowEnds,
  type AttemptSummary,
  type BoardDiagnostic,
  type CanvasPosition,
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
import { formalizeRunBlock, formalizeState, FORMALIZE_TEXTS, type FormalizeState } from '../board/contextActions';
import { deleteOutcome, DRAW_TEXTS, gestureGate, type AreaSelection, type GestureGate } from '../board/gestures';
import { canMarkPending, MENU_PROPOSED_ARROWS, menuSelection, type MenuThing } from '../board/menu';
import { vocabIndex } from '../model/cardData';
import { oneLine } from '../model/format';
import {
  acceptChangesFiles,
  acceptSelection,
  buildOverlay,
  definitionsApproved,
  draftAnswers,
  emptyDraft,
  newVocabularyCount,
  pastStatements,
  reviewSteps,
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
  /**
   * Spec v4 BD-1 (slice 1c): the height of the Vocabulary and Definitions band above the board, as a fraction of the
   * board area, chosen by dragging the divider (absent or null = the default height).
   */
  topSplit?: number | null;
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
  /** Spec v4 BD-3 (slice 1b): the stored canvas positions of propositions (`TlGraph.positions`; moves applied optimistically). */
  positions: Readonly<Record<string, CanvasPosition>>;
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
  /** A kind change that breaks dependents (D-11 P->A of a proof that takes hypotheses): rewrite / mark broken / cancel. */
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
      /** The optional reason of a change to Axiom given before the host asked (sent again with the answer). */
      rationale?: string;
    }
  /**
   * A change to Axiom: the optional "Why do you hold it?" (D-14, never blocking). `initial`: the card's reason, shown
   * in the field when "Move to axioms" opens the dialog to state the impact first (slice 1b).
   */
  | { kind: 'rationale'; id: string; to: NodeType; beforeId: string | null; summary: string; detail: string; initial?: string }
  /**
   * Spec v4 slice 1b: an arrow change whose impact the user confirms first. An axiom becomes a proposition (AR-6: what
   * it becomes, and the cards that lose their green glow), or a removed arrow is used by a proof (A16). The board asks
   * before sending when its graph shows the impact, and after the host's `needs-confirmation` otherwise; the confirm
   * button sends the change again, `confirmed`.
   */
  | {
      kind: 'arrows';
      /** The card it is about (its sentence is shown). */
      id: string;
      change: ArrowChange;
      summary: string;
      detail: string;
      /** Cards to list (node ids, or Lean names of declarations without a card), under `listTitle`. */
      dependents: readonly string[];
      listTitle: string;
      /** The host's description of the dependents that are cards (any subject), when it sent one. */
      cards?: Readonly<Record<string, DependentCard>>;
      /** The confirm button's words. */
      confirm: string;
    }
  /**
   * D-18 delete. Without `dependents`: the first question (what refers to the card on this board; card only, or
   * with its Lean code). With `dependents`: the host refused to delete the card's Lean code (`needs-confirmation`)
   * because these declarations use it and would stop compiling (node ids, or fully-qualified Lean names of
   * declarations without a card); the dialog lists them and offers "Delete anyway" (`confirmed: true`). `cards`:
   * the host's description of the dependents that are cards, so another subject's card shows by its sentence.
   */
  | { kind: 'delete'; id: string; dependents?: readonly string[]; cards?: Readonly<Record<string, DependentCard>> }
  | { kind: 'revert'; entry: HistoryEntry }
  /**
   * Spec v4.1 AR-8 (★D7 (b), slice 1e): Formalize for dependencies asks first about a source (`id`) that is a
   * proposition with neither a proof nor a pending claim: `mark-pending` when it has a Lean statement (mark it pending,
   * assumed until proved, and continue; or cancel), `no-statement` when it has none (formalize and prove it first:
   * Cancel only, AP-10). One source at a time: `queue` holds the next ones to ask about, `confirmed` those the user
   * chose to mark. `target` and `sources` are the question as it was when Formalize was pressed.
   */
  | {
      kind: 'formalize';
      mode: 'mark-pending' | 'no-statement';
      id: string;
      target: string;
      sources: readonly string[];
      queue: readonly string[];
      confirmed: readonly string[];
    };

export interface EditingState {
  id: string;
  field: 'naturalName' | 'rationale';
}

/**
 * Spec v4 slice 1b: an arrow change the board asks the host for (core's `add-arrows`, `remove-arrows` and
 * `set-from-nothing`), kept so a confirmation dialog can send it again.
 */
export type ArrowChange =
  | { kind: 'add-arrows'; target: string; sources: readonly string[] }
  /** Slice 1f: `marks`, the "follows from nothing" marks the same Delete removes (one message, one Undo step). */
  | { kind: 'remove-arrows'; arrows: readonly ArrowEnds[]; marks: readonly string[] }
  | { kind: 'set-from-nothing'; id: string; on: boolean };

export interface BoardUi {
  /** Selection in click order (the Context Menu section lists it in this order). */
  selected: readonly string[];
  /**
   * Spec v4 CM-2 (slice 1b): selected arrows, drawn ones only (a target's declared premises), in selection order. A
   * plain click on an arrow replaces the whole selection, Ctrl adds; "Select incoming arrows" selects a card's; Esc
   * clears. (1c draws them selected and makes them clickable.)
   */
  selectedArrows: readonly ArrowEnds[];
  /** Spec v4 AR-5 (slice 1b): cards whose "follows from nothing" mark is selected (Delete removes the mark). */
  selectedMarks: readonly string[];
  expanded: Readonly<Record<string, true>>;
  hover: string | null;
  drag: DragState | null;
  /** Column under the pointer during a drag (the highlighted drop zone). */
  dropKind: NodeType | null;
  /**
   * Spec v4 AR-7 (slice 1c2): propositions moved on the canvas are over the AXIOMS column (BoardInput sets it while
   * they are, null otherwise): `id` the card pressed, `count` how many move. The column shows what a drop does.
   */
  overAxioms: { id: string; count: number } | null;
  promptKind: NodeType;
  /**
   * Spec v4 CM-7 "New proposition here" (slice 1c): where the next proposition added from the A|P box goes on the
   * canvas (canvas coordinates), or null (BD-8: then in view, next to the selected card). Cleared by that add, by
   * switching the box to Axiom, and by a subject change.
   */
  newCardAt: CanvasPosition | null;
  /** Bumped whenever the A|P box's text field should take the focus ("New proposition here"). */
  promptFocus: number;
  /**
   * Spec v4 BD-1 (slice 1c): the Vocabulary and Definitions band is collapsed to its one-line summary (webview state:
   * docs/m1-plan.md 13.1 #30). Default: collapsed.
   */
  vocabCollapsed: boolean;
  /** BD-1: the band's height as a fraction of the board area (the divider), or null for the default. */
  topSplit: number | null;
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
  /** The Feedback draft (the user's words; may span lines). */
  feedback: string;
  feedbackOpen: boolean;
  /** Bumped whenever the Feedback field should take the focus (a prefill, the banner's Feedback). */
  feedbackFocus: number;
}

/**
 * What this board's own Accept did to the user's files, for the run panel's outcome line: an Accept of a round that
 * changed no file only records the outcome (no Undo step, no history entry). Set when Accept is sent, from the
 * proposal's `empty`; the host's answer then says for certain (`undoable` is
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
  /**
   * Spec v4 BD-3, BD-8, CM-7 (slice 1c): a new proposition's place on the canvas (canvas coordinates), stored with the
   * card in the same Undo step (core's `add-node.position`). Ignored for an axiom.
   */
  position?: CanvasPosition;
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
  /**
   * "Move to axioms" in a proposition's details (AR-7, slice 1b): the kind change to Axiom, with its impact always shown
   * first (the dependents dialog when it needs a choice, otherwise the rationale dialog, with the card's reason in it).
   */
  /** AR-7: "Move to axioms" (its impact first); `beforeId` is where the card lands in the column (a drop there), else at the end. */
  moveToAxioms(id: string, beforeId?: string | null): void;
  /** Answers the dependents dialog. */
  confirmDependents(choice: 'rewrite' | 'mark-broken'): void;
  /** Answers the rationale dialog: the reason, or null to skip it. */
  confirmRationale(rationale: string | null): void;
  closeDialog(): void;
  /** Adds an optimistic card from the A|P box and posts `addNode`. Returns its provisional id (null: nothing added). */
  addNode(type: NodeType, text: string, extras?: AddExtras): string | null;
  setPromptKind(kind: NodeType): void;
  /**
   * CM-7 "New proposition here" (slice 1c): the A|P box switches to Proposition and takes the focus, and the next
   * proposition added from it goes to `point` (canvas coordinates). False (nothing changes) in the Proposed view or
   * while the board is locked (ES-9: its info toast says why).
   */
  newPropositionAt(point: CanvasPosition): boolean;
  /** Forgets the point "New proposition here" chose (the A|P box's ✕). */
  clearNewCardAt(): void;
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
  // Spec v4 slice 1b, arrows as board edits. Each posts one message (one Undo step on the host), applied optimistically
  // and rolled back when the host refuses (with an error toast). Its impact is confirmed first in the arrows dialog
  // when the board's graph shows one (an axiom becomes a proposition; a removed arrow is used by a proof), and after
  // the host's `needs-confirmation` otherwise. They return false when they change nothing (or the proposed view is on
  // screen: it is read-only).
  /** AR-1: arrows from `sources` into `target` (an axiom becomes a proposition: AR-6, after the dialog). */
  addArrows(target: string, sources: readonly string[]): boolean;
  /** 1b's stand-in for 1c's gestures: the selected cards (except `target`) become sources of arrows into `target`. */
  drawArrowsFromSelection(target: string): boolean;
  /** AR-1, A16: removes drawn arrows. */
  removeArrows(arrows: readonly ArrowEnds[]): boolean;
  /** AR-5: marks a card "follows from nothing" (an axiom becomes a proposition, after the dialog), or removes the mark. */
  setFromNothing(id: string, on: boolean): boolean;
  /** AR-8 "Mark pending": `axiom n.holds : n` for a proposition with a Lean statement and no `.holds` (not optimistic). */
  claimPending(id: string): void;
  /** BD-3: stores canvas positions of propositions (layout only). */
  moveCards(positions: Readonly<Record<string, CanvasPosition>>): void;
  /** Answers the arrows dialog: the change is sent again, confirmed. */
  confirmArrows(): void;
  /** Plain click on an arrow replaces the selection with it; Ctrl/Cmd (`additive`) toggles it in the selection. */
  selectArrow(source: string, target: string, additive: boolean): void;
  /**
   * AR-5, CM-2 (slice 1c, for 1c2's gestures and the right-click menu): a plain click on a card's "follows from
   * nothing" mark replaces the selection with it; Ctrl/Cmd (`additive`) toggles it. Nothing in the Proposed view.
   */
  selectMark(id: string, additive: boolean): void;
  /**
   * CM-7: what a right click selects before its menu opens (board/menu.ts `menuSelection`): the thing under the
   * pointer, unless it is selected already, or it is a card while other cards are selected, or it is empty canvas.
   */
  selectForMenu(thing: MenuThing): void;
  /** CM-2 "Select incoming arrows": the selection becomes the arrows into the card (or its "follows from nothing" mark). */
  selectIncomingArrows(id: string): boolean;
  /**
   * AR-1 Delete with arrows or marks selected: removes the arrows and the marks in one `removeArrows` (one Undo step;
   * its A16 question, when a proof uses an arrow, covers all of it). False when none is selected: Delete then means the
   * focused card's delete dialog. True (nothing sent) while the board is locked (slice 1f).
   */
  deleteSelectedArrows(): boolean;
  /**
   * AR-1 (slice 1c2): the Delete key, with the focused card (null: none). The selected arrows and marks go first, in one
   * `removeArrows`; the card's delete dialog opens only when no arrow or mark is selected (cards are never deleted
   * together with arrows). While the board is locked (ES-9), or for arrows in the Proposed view, nothing is sent and an
   * info toast gives the reason. False when the key does nothing (nothing selected, no card focused).
   */
  pressDelete(focused: string | null): boolean;
  /**
   * CM-2 (slice 1c2): the selection rectangle on the canvas selects the cards, drawn arrows and marks inside it; it
   * replaces the selection, or with Ctrl/Cmd (`additive`) adds to it. Nothing in the Proposed view (read-only).
   */
  selectArea(found: AreaSelection, additive: boolean): void;
  /** AR-7 (slice 1c2): BoardInput's moved propositions entered (or left: null) the AXIOMS column. */
  setOverAxioms(over: { id: string; count: number } | null): void;
  /**
   * Spec v4.1 ES-2 (slice 1e) "Formalize for dependencies": the selected arrows into one proposition (or its "follows
   * from nothing" mark) are the question (`formalizeOf`). Refused, with an info toast giving the reason, when it cannot
   * be pressed (CM-3). A source that is a proposition with neither a proof nor a pending claim opens the `formalize`
   * dialog first (AR-8); otherwise posts `startRun` with the target and the sources. False when nothing was started or
   * asked.
   */
  formalize(): boolean;
  /**
   * AR-8: "Mark pending and continue" in the `formalize` dialog. The next unproved source is asked about; after the
   * last one, each chosen source is marked pending (`claimPending`, the user's own edit, one Undo step each), and once
   * the host has written them all the run is started. A refused mark starts nothing (its error toast says why).
   */
  confirmFormalizePending(): void;
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
  setFeedback(text: string): void;
  /** Opens the Feedback field (and focuses it); `prefill` is added on a new line of the draft. */
  openFeedback(prefill?: string): void;
  closeFeedback(): void;
  /** Posts `feedback` with the draft. */
  sendFeedback(): boolean;
  /** Posts `acceptProposal` with the approved definitions; refused until all are "yes". */
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
  /** BD-1: the Vocabulary and Definitions band's height (a fraction of the board area, clamped; null = default); persisted. */
  setTopSplit(fraction: number | null): void;
  /** Expands the Vocabulary group and flashes the item. Returns false for a name that is not on this board. */
  highlightVocab(name: string): boolean;
  /** Flashes a card (its column scrolls to it). Returns false for an id that is not on this board. */
  revealNode(id: string): boolean;
  /**
   * The board's Undo and Redo (the host's stack of the user's files). Slice 1f (UN-1, UN-3, A27): they post nothing
   * while the board is locked, nor in the Proposed view (it has no file Undo).
   */
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

/**
 * Slice 1e: why no run can start now (board/contextActions.ts `formalizeRunBlock`): a run of the model folder is active,
 * or this board's start is on its way. A string or null, so components may select it directly.
 */
export function formalizeRunBlockOf(state: Pick<BoardState, 'run' | 'subject' | 'runBusy'>): string | null {
  return formalizeRunBlock(state.run, state.subject, state.runBusy?.action === 'start');
}

/** Slice 1e: Formalize for dependencies on the selection (board/contextActions.ts `formalizeState`), for the store's actions. */
export function formalizeOf(
  state: Pick<BoardState, 'nodes' | 'edges' | 'selectedArrows' | 'selectedMarks' | 'provisional' | 'run' | 'subject' | 'runBusy'>,
): FormalizeState {
  return formalizeState({ ...state, runBlock: formalizeRunBlockOf(state) });
}

/** The proposed view applies to the board on screen only while the proposal is about its subject. */
export function proposedOverlay(state: Pick<BoardState, 'proposedView' | 'overlay' | 'subject'>): Overlay | null {
  return state.proposedView && state.overlay !== null && state.overlay.subject === state.subject ? state.overlay : null;
}

/** Spec v4 ES-9 (slice 1f): the reason the Proposed view's arrow actions are disabled (the right-click menu's too). */
export const PROPOSED_ARROWS_LOCKED = MENU_PROPOSED_ARROWS;

/**
 * Spec v4 UN-1 (slice 1f): the Proposed view has no file Undo (its own stack comes with slice 2). It exists only during
 * a run, whose lock says more; this is the reason should it ever be on screen without one.
 */
export const PROPOSED_NO_UNDO = 'Undo works on the Current view: the proposal has no Undo of its own yet.';

/**
 * Spec v4 ES-7, ES-9, UN-3 (slice 1f): why the board cannot be edited now (core EDIT_SESSION_ACTIVE), or null. While a
 * run of the model folder is active (any subject, any state before it ends: in slice 1 the run is the edit session),
 * or while this board's start is on its way to the host, the session's base must not change: no field edit, arrow,
 * kind change, add, delete, move, new subject, Undo, Redo or History revert. Every control that would do one is
 * disabled with this text; the host refuses the same messages with it.
 */
export function editLock(state: Pick<BoardState, 'run' | 'runBusy'>): string | null {
  return runLocksBoard(state.run) || state.runBusy?.action === 'start' ? EDIT_SESSION_ACTIVE : null;
}

/** Why the arrows on screen cannot be changed (ES-9), or null: in the Proposed view its own reason, else `editLock`. */
export function arrowLock(state: Pick<BoardState, 'run' | 'runBusy' | 'proposedView' | 'overlay' | 'subject'>): string | null {
  return proposedOverlay(state) !== null ? PROPOSED_ARROWS_LOCKED : editLock(state);
}

/**
 * Why the board's Undo and Redo (the host's stack of the user's files) do nothing now, or null (UN-1, UN-3, A27;
 * slice 1f): the edit session's lock, else the Proposed view, which has no file Undo.
 */
export function undoLock(state: Pick<BoardState, 'run' | 'runBusy' | 'proposedView' | 'overlay' | 'subject'>): string | null {
  return editLock(state) ?? (proposedOverlay(state) !== null ? PROPOSED_NO_UNDO : null);
}

/**
 * Slice 1c2: which of the board's gestures work now (board/gestures.ts `gestureGate`): during an edit session the
 * editing ones (drawing an arrow, moving a card, a drop on the column) are off with its reason, selecting stays; the
 * Proposed view selects nothing and changes nothing.
 */
export function gestureGateOf(state: Pick<BoardState, 'run' | 'runBusy' | 'proposedView' | 'overlay' | 'subject'>): GestureGate {
  return gestureGate({ lock: editLock(state), proposed: proposedOverlay(state) !== null });
}

export interface UndoButton {
  disabled: boolean;
  title: string;
}

/** The header's Undo and Redo buttons: whether they can be pressed, and their tooltips (the reason while locked). */
export function undoRedoButtons(workspace: Pick<WorkspaceState, 'undo' | 'redo'> | null, lock: string | null): { undo: UndoButton; redo: UndoButton } {
  if (lock !== null) return { undo: { disabled: true, title: lock }, redo: { disabled: true, title: lock } };
  const undo = workspace?.undo ?? null;
  const redo = workspace?.redo ?? null;
  return {
    undo: { disabled: !undo, title: undo ? `Undo: ${undo} (Ctrl+Z)` : 'Nothing to undo' },
    redo: { disabled: !redo, title: redo ? `Redo: ${redo} (Ctrl+Shift+Z)` : 'Nothing to redo' },
  };
}

/**
 * What the board's columns show: the current graph, or in the proposed view the proposal's overlay. Both are kept in
 * the store, so a selector may return any field of the result (it is never a fresh object).
 */
export function boardView(state: Pick<BoardState, 'proposedView' | 'overlay' | 'subject' | 'nodes' | 'order' | 'edges' | 'vocabulary' | 'vocab' | 'positions'>): BoardViewData {
  return proposedOverlay(state) ?? state;
}

/** BD-1: the Vocabulary and Definitions band's height limits, as fractions of the board area. */
export const TOP_SPLIT_LIMITS = { min: 0.1, max: 0.75 } as const;

/** A band height within TOP_SPLIT_LIMITS, rounded to a tenth of a percent; null for anything that is not a number. */
export function readTopSplit(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  return Math.round(Math.min(TOP_SPLIT_LIMITS.max, Math.max(TOP_SPLIT_LIMITS.min, raw)) * 1000) / 1000;
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

/**
 * Spec v4 AR-6: an axiom never becomes a proposition by a drop or a "Make" button (an arrow into it, or "follows from
 * nothing", does it: slice 1b). The drop zone says so, and the drop is refused before anything is sent.
 */
export function kindChangeRefused(state: Pick<BoardState, 'nodes'>, id: string, to: NodeType): boolean {
  return state.nodes[id]?.type === 'AXIOM' && to === 'PROPOSITION';
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

const emptyOrder = (): Record<NodeType, string[]> => ({ AXIOM: [], PROPOSITION: [] });

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
      /**
       * `arrows`: what an optimistic P->A took off the card (AR-7: its incoming arrows and its "follows from nothing"
       * mark go with the kind change), restored with it.
       */
      back: { column: NodeType; beforeId: string | null; type: NodeType; arrows?: { premises: string[]; fromNothing: boolean; edges: TlEdge[] } };
      /** For a kind change: what to re-ask if the host wants a confirmation. */
      change?: { to: NodeType; beforeId: string | null };
      /** M2 carry-over 3: the dependents the dialog listed when the user chose what to do with them. */
      confirmed?: readonly string[];
      /** The optional reason sent with a change to Axiom (re-sent with the answer if the host asks first). */
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
  /**
   * Spec v4 slice 1b: an arrow change applied optimistically on graph `seq`; `back` undoes exactly what it changed.
   * `needs-confirmation` to an unconfirmed change opens the arrows dialog.
   */
  | { kind: 'arrows'; seq: number; change: ArrowChange; confirmed: boolean; back: ArrowsBack }
  /** Spec v4 slice 1b: a move on the canvas; `back` holds the previous positions (null: there was none). */
  | { kind: 'positions'; seq: number; back: Readonly<Record<string, CanvasPosition | null>> }
  | { kind: 'plain'; onResult?: (outcome: ActionOutcome) => void };

/** What an optimistic arrow change altered, to restore it on a refusal. */
interface ArrowsBack {
  /** The changed cards' fields as they were (only these are restored). */
  nodes: Record<string, { type: NodeType; premises: string[]; fromNothing: boolean }>;
  /** Edge ids it added (taken away again) and the edges it removed (put back). */
  added: string[];
  removed: TlEdge[];
  /** An axiom that became a proposition: where it was in its column. */
  moved?: { id: string; column: NodeType; beforeId: string | null };
}

/** Spec v4 slice 1b: the arrows dialog's confirm words and list titles. */
export const ARROW_TEXTS = {
  glowList: 'These lose their green glow until it is proved:',
  usedList: 'Proofs that use them:',
  confirmDraw: (n: number) => (n === 1 ? 'Draw the arrow' : 'Draw the arrows'),
  confirmProposition: 'Make it a proposition',
  confirmRemove: 'Remove anyway',
  alreadyDrawn: DRAW_TEXTS.alreadyDrawn,
  noSources: 'Select the cards the arrows start from (click, Ctrl/Cmd-click), then draw them into this card.',
  noIncoming: 'No arrow leads into this card yet.',
} as const;

/** A card's sentence in a two-card text (cut like core's labels, near 40 characters). */
function shortName(nodes: Readonly<Record<string, TlNode>>, id: string): string {
  const chars = Array.from((nodes[id]?.naturalName ?? id).replace(/\s+/g, ' ').trim());
  return chars.length <= 40 ? chars.join('') : `${chars.slice(0, 39).join('')}…`;
}

const sameArrow = (a: ArrowEnds, b: ArrowEnds) => a.source === b.source && a.target === b.target;

const KIND_NAME: Readonly<Record<NodeType, string>> = { AXIOM: 'Axiom', PROPOSITION: 'Proposition' };

/**
 * The dialog title for a kind change the host wants confirmed although the board's own impact (from the graph alone)
 * did not ask: the host's facts know dependents the graph does not show. Worded like core's kindChangeImpact.
 */
function confirmSummary(to: NodeType, count: number): string {
  const dependents = count === 0 ? 'its dependents need' : `${count} dependent${count === 1 ? '' : 's'} ${count === 1 ? 'needs' : 'need'}`;
  // Slice 1f (carry-over 4): the change to Axiom is the board's "Move to axioms" (AR-7).
  return `${to === 'AXIOM' ? 'Move to axioms' : `Make ${KIND_NAME[to]}`}: ${dependents} a rewrite`;
}

/** A new review: the first step, nothing answered. */
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

    /**
     * Slice 1f (ES-9): whether the board is locked now (`editLock`). An edit gesture then changes nothing and says why in
     * an info toast (its controls are disabled with the reason, so only a key or a race reaches here). `quiet`: no toast
     * (Undo and Redo do nothing at all, A27; a caller that reports the refusal itself).
     */
    const locked = (quiet = false): boolean => {
      const reason = editLock(get());
      if (reason === null) return false;
      if (!quiet) get().pushToast('info', reason);
      return true;
    };

    /** Renames card ids in the UI state (a provisional card replaced by the host's), dropping ids that are gone. */
    const remapUi = (nodes: Readonly<Record<string, TlNode>>, map: (id: string) => string) => {
      const s = get();
      const keep = (id: string) => nodes[id] !== undefined;
      const selected = unique(s.selected.map(map)).filter(keep);
      const expanded: Record<string, true> = {};
      for (const id of Object.keys(s.expanded)) if (keep(map(id))) expanded[map(id)] = true;
      const hover = s.hover && keep(map(s.hover)) ? map(s.hover) : null;
      const editing = s.editing && keep(map(s.editing.id)) ? { ...s.editing, id: map(s.editing.id) } : null;
      return { selected, expanded, hover, editing };
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
      // Slice 1c: its optimistic place on the canvas goes with it (the host's card has its own, from layout.json).
      const positions = s.positions[clientId] ? Object.fromEntries(Object.entries(s.positions).filter(([id]) => id !== clientId)) : s.positions;
      set({ nodes, provisional, order, positions, ...ui });
      if (!sameList(ui.selected, s.selected)) postSelection(ui.selected);
    };

    /** Undoes an optimistic move, unless a graph arrived since (it shows the host's state already). */
    const rollbackMove = (entry: Extract<Pending, { kind: 'move' }>) => {
      const s = get();
      const node = s.nodes[entry.id];
      if (s.seq !== entry.seq || !node) return;
      const { order } = moveInOrder(s.order, entry.id, entry.back.column, entry.back.beforeId);
      const arrows = entry.back.arrows;
      if (arrows === undefined) {
        set({ order, nodes: node.type === entry.back.type ? s.nodes : { ...s.nodes, [entry.id]: { ...node, type: entry.back.type } } });
        return;
      }
      const restored: TlNode = { ...node, type: entry.back.type, premises: arrows.premises, ...(arrows.fromNothing ? { fromNothing: true } : {}) };
      const known = new Set(s.edges.map((e) => e.id));
      set({ order, nodes: { ...s.nodes, [entry.id]: restored }, edges: [...s.edges, ...arrows.edges.filter((e) => !known.has(e.id))] });
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
      // P->A (AR-7): the card loses its incoming arrows and its "follows from nothing" mark in the same change, so
      // the board shows neither on the new axiom while the host writes it (restored if the host refuses).
      const dropped = to === 'AXIOM' ? s.edges.filter((e) => e.type === 'premise' && e.target === id) : [];
      const arrows = to === 'AXIOM' ? { premises: [...node.premises], fromNothing: node.fromNothing === true, edges: dropped } : undefined;
      const changed: TlNode = { ...node, type: to };
      if (arrows !== undefined) {
        changed.premises = [];
        delete changed.fromNothing;
      }
      set({ order: moved.order, nodes: { ...s.nodes, [id]: changed }, ...(dropped.length > 0 ? { edges: s.edges.filter((e) => !dropped.includes(e)) } : {}) });
      const rationale = extra.rationale ? oneLine(extra.rationale) : '';
      const confirmed = extra.dependents ? unique(extra.confirmedDependents ?? []).slice(0, LIMITS.listLength) : undefined;
      const requestId = track({
        kind: 'move',
        id,
        seq: s.seq,
        back: { column: moved.previous?.column ?? from, beforeId: moved.previous?.beforeId ?? null, type: from, ...(arrows !== undefined ? { arrows } : {}) },
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

    // ---- spec v4 slice 1b: arrows as board edits

    /**
     * The change as the board can send it, or null when it changes nothing: unknown and provisional cards are left out,
     * an arrow into its own source too, and a removal of an arrow that is not drawn (any more).
     */
    const normalizeArrows = (change: ArrowChange): ArrowChange | null => {
      const s = get();
      const usable = (id: string) => s.nodes[id] !== undefined && !s.provisional[id];
      switch (change.kind) {
        case 'add-arrows': {
          const node = s.nodes[change.target];
          if (!node || !usable(node.id)) return null;
          const sources = unique(change.sources).filter((id) => id !== node.id && usable(id));
          if (sources.length === 0) return null;
          return { kind: 'add-arrows', target: node.id, sources: sources.slice(0, LIMITS.listLength) };
        }
        case 'remove-arrows': {
          const arrows: ArrowEnds[] = [];
          for (const arrow of change.arrows) {
            if (arrow.source === arrow.target || !s.nodes[arrow.target]?.premises.includes(arrow.source)) continue;
            if (!arrows.some((a) => sameArrow(a, arrow))) arrows.push({ source: arrow.source, target: arrow.target });
          }
          // Slice 1f: marks still drawn go with the arrows (one message, one Undo step).
          const marks = unique(change.marks).filter((id) => usable(id) && s.nodes[id]?.fromNothing === true);
          if (arrows.length === 0 && marks.length === 0) return null;
          return { kind: 'remove-arrows', arrows: arrows.slice(0, LIMITS.listLength), marks: marks.slice(0, LIMITS.listLength) };
        }
        case 'set-from-nothing': {
          const node = s.nodes[change.id];
          if (!node || !usable(node.id)) return null;
          if (change.on && node.type === 'PROPOSITION' && node.fromNothing === true) return null;
          if (!change.on && node.fromNothing !== true) return null;
          return change;
        }
      }
    };

    /** The arrows dialog for a change: the board's own impact, or the host's (`host`) when it asked. */
    const arrowsDialog = (
      change: ArrowChange,
      host?: { text: string; dependents: readonly string[] | undefined; cards: Readonly<Record<string, DependentCard>> | undefined },
    ): Extract<DialogState, { kind: 'arrows' }> | null => {
      const s = get();
      const cards = host?.cards ? { cards: host.cards } : {};
      if (change.kind === 'remove-arrows') {
        const used = arrowsInUse(s, change.arrows);
        const marks = change.marks.length;
        // Slice 1f: the question covers the whole Delete, marks included (Cancel removes nothing).
        const withMarks =
          marks === 0 ? '' : ` The ${marks === 1 ? 'selected "follows from nothing" mark is' : `${marks} selected "follows from nothing" marks are`} removed with them.`;
        return {
          kind: 'arrows',
          id: change.arrows[0]?.target ?? change.marks[0] ?? '',
          change,
          summary: change.arrows.length === 1 ? 'Remove an arrow that a proof uses?' : 'Remove arrows that proofs use?',
          detail: `${host?.text || removeUsedArrowsText(used, (id) => shortName(s.nodes, id))}${withMarks}`,
          dependents: host?.dependents ?? unique(used.map((a) => a.target)),
          listTitle: ARROW_TEXTS.usedList,
          ...cards,
          confirm: ARROW_TEXTS.confirmRemove,
        };
      }
      const id = change.kind === 'add-arrows' ? change.target : change.id;
      const node = s.nodes[id];
      if (!node) return null;
      const impact = node.type === 'AXIOM' ? impactOf(s, id, 'PROPOSITION') : null;
      const name = `“${shortName(s.nodes, id)}”`;
      let how: string;
      let confirm: string;
      if (change.kind === 'set-from-nothing') {
        how = `Marking ${name} "follows from nothing" makes it a proposition.`;
        confirm = ARROW_TEXTS.confirmProposition;
      } else {
        const fresh = change.sources.filter((source) => !node.premises.includes(source));
        how =
          fresh.length === 0
            ? `Its arrows from before v4 make ${name} a proposition.`
            : `Drawing ${fresh.length === 1 ? 'this arrow' : 'these arrows'} into ${name} makes it a proposition.${node.type === 'AXIOM' && node.premises.length > 0 ? ' Its arrows from before v4 are drawn too.' : ''}`;
        confirm = fresh.length === 0 ? ARROW_TEXTS.confirmProposition : ARROW_TEXTS.confirmDraw(fresh.length);
      }
      return {
        kind: 'arrows',
        id,
        change,
        summary: impact?.summary ?? 'Becomes a proposition',
        detail: host?.text || `${how} ${impact?.detail ?? ''}`.trim(),
        dependents: host?.dependents ?? (node.type === 'AXIOM' ? glowingDependents(impactGraph(s), id) : []),
        listTitle: ARROW_TEXTS.glowList,
        ...cards,
        confirm,
      };
    };

    /** Whether the board's own graph shows an impact to confirm before sending (always for an axiom becoming a proposition). */
    const confirmsFirst = (change: ArrowChange): boolean => {
      const s = get();
      if (change.kind === 'remove-arrows') return arrowsInUse(s, change.arrows).length > 0;
      if (change.kind === 'set-from-nothing' && !change.on) return false;
      const id = change.kind === 'add-arrows' ? change.target : change.id;
      // AR-6: "before you let go, the gesture states the impact": a button has no "before", so it asks.
      return s.nodes[id]?.type === 'AXIOM';
    };

    /** Applies a change optimistically; returns what to restore on a refusal. */
    const applyArrows = (change: ArrowChange): ArrowsBack => {
      const s = get();
      const nodes = { ...s.nodes };
      let edges = s.edges;
      let order = s.order;
      const back: ArrowsBack = { nodes: {}, added: [], removed: [] };
      const remember = (node: TlNode) => {
        if (!back.nodes[node.id]) back.nodes[node.id] = { type: node.type, premises: node.premises, fromNothing: node.fromNothing === true };
      };
      /** AR-6: the card becomes a proposition, last in the propositions' column (as the host's layout will say). */
      const asProposition = (node: TlNode): TlNode => {
        if (node.type !== 'AXIOM') return node;
        const moved = moveInOrder(order, node.id, 'PROPOSITION', null);
        back.moved = { id: node.id, column: moved.previous?.column ?? 'AXIOM', beforeId: moved.previous?.beforeId ?? null };
        order = moved.order;
        return { ...node, type: 'PROPOSITION' };
      };
      switch (change.kind) {
        case 'add-arrows': {
          const node = nodes[change.target];
          if (!node) break;
          remember(node);
          const premises = [...node.premises, ...change.sources.filter((source) => !node.premises.includes(source))];
          const next: TlNode = { ...asProposition(node), premises };
          delete next.fromNothing;
          nodes[node.id] = next;
          // Every arrow into the new proposition is drawn now (into an axiom, those declared before v4 were not).
          const known = new Set(edges.map((e) => e.id));
          const fresh: TlEdge[] = premises
            .filter((source) => nodes[source] !== undefined && !known.has(edgeId('premise', source, node.id)))
            .map((source) => ({ id: edgeId('premise', source, node.id), type: 'premise', source, target: node.id, origin: 'declared' }));
          if (fresh.length > 0) {
            edges = [...edges, ...fresh];
            back.added.push(...fresh.map((e) => e.id));
          }
          break;
        }
        case 'remove-arrows': {
          for (const { source, target } of change.arrows) {
            const node = nodes[target];
            if (!node) continue;
            remember(node);
            nodes[target] = { ...node, premises: node.premises.filter((premise) => premise !== source) };
          }
          for (const id of change.marks) {
            const node = nodes[id];
            if (!node) continue;
            remember(node);
            const next: TlNode = { ...node };
            delete next.fromNothing;
            nodes[id] = next;
          }
          const ids = new Set(change.arrows.map((a) => edgeId('premise', a.source, a.target)));
          back.removed = edges.filter((e) => ids.has(e.id));
          edges = edges.filter((e) => !ids.has(e.id));
          break;
        }
        case 'set-from-nothing': {
          const node = nodes[change.id];
          if (!node) break;
          remember(node);
          const next: TlNode = change.on ? { ...asProposition(node), fromNothing: true } : { ...node };
          if (!change.on) delete next.fromNothing;
          nodes[node.id] = next;
          break;
        }
      }
      set({ nodes, edges, order });
      return back;
    };

    /** Undoes an optimistic arrow change, unless a graph arrived since (it shows the host's state already). */
    const rollbackArrows = (entry: Extract<Pending, { kind: 'arrows' }>) => {
      const s = get();
      if (s.seq !== entry.seq) return;
      const nodes = { ...s.nodes };
      for (const [id, was] of Object.entries(entry.back.nodes)) {
        const node = nodes[id];
        if (!node) continue;
        const restored: TlNode = { ...node, type: was.type, premises: was.premises };
        if (was.fromNothing) restored.fromNothing = true;
        else delete restored.fromNothing;
        nodes[id] = restored;
      }
      const added = new Set(entry.back.added);
      const kept = s.edges.filter((e) => !added.has(e.id));
      const known = new Set(kept.map((e) => e.id));
      const edges = [...kept, ...entry.back.removed.filter((e) => !known.has(e.id))];
      const moved = entry.back.moved;
      const order = moved ? moveInOrder(s.order, moved.id, moved.column, moved.beforeId).order : s.order;
      set({ nodes, edges, order });
    };

    /** Posts an arrow change (applied optimistically first). `confirmed`: the user saw its impact in the dialog. */
    const sendArrows = (change: ArrowChange, confirmed: boolean) => {
      const seq = get().seq;
      const back = applyArrows(change);
      const requestId = track({ kind: 'arrows', seq, change, confirmed, back });
      const sure = confirmed ? { confirmed: true } : {};
      switch (change.kind) {
        case 'add-arrows':
          post(webviewMessage('addArrows', { target: change.target, sources: [...change.sources], ...sure, requestId }));
          return;
        case 'remove-arrows':
          post(
            webviewMessage('removeArrows', {
              arrows: change.arrows.map(({ source, target }) => ({ source, target })),
              ...(change.marks.length > 0 ? { marks: [...change.marks] } : {}),
              ...sure,
              requestId,
            }),
          );
          return;
        case 'set-from-nothing':
          post(webviewMessage('setFromNothing', { id: change.id, on: change.on, ...sure, requestId }));
          return;
      }
    };

    /** An arrow change from a gesture or button: its impact dialog first when the board sees one, else sent at once. */
    const requestArrows = (change: ArrowChange): boolean => {
      if (proposedOverlay(get()) !== null || locked()) return false;
      const normalized = normalizeArrows(change);
      if (!normalized) return false;
      if (normalized.kind === 'add-arrows') {
        const node = get().nodes[normalized.target];
        if (node?.type === 'PROPOSITION' && node.fromNothing !== true && normalized.sources.every((source) => node.premises.includes(source))) {
          get().pushToast('info', ARROW_TEXTS.alreadyDrawn);
          return false;
        }
      }
      if (confirmsFirst(normalized)) {
        const dialog = arrowsDialog(normalized);
        if (!dialog) return false;
        set({ dialog });
        return true;
      }
      sendArrows(normalized, false);
      return true;
    };

    /** Undoes an optimistic move, unless a graph arrived since. */
    const rollbackPositions = (entry: Extract<Pending, { kind: 'positions' }>) => {
      const s = get();
      if (s.seq !== entry.seq) return;
      const positions = { ...s.positions };
      for (const [id, was] of Object.entries(entry.back)) {
        if (was === null) delete positions[id];
        else positions[id] = was;
      }
      set({ positions });
    };

    /** A run request: tracked like any request, and its buttons show it until the host answers. */
    const trackRun = (action: RunAction, key?: string) => {
      const requestId = track({ kind: 'run', action });
      set({ runBusy: { action, requestId, ...(key !== undefined ? { key } : {}) } });
      return requestId;
    };

    /**
     * Slice 1e: posts `startRun` for Formalize for dependencies (the host checks the question again on the files, and
     * asks for the egress consent), unless a run of the model folder is active by now (an info toast then).
     */
    const postStart = (target: string, sources: readonly string[]): boolean => {
      const s = get();
      const blocked = formalizeRunBlockOf(s);
      if (blocked !== null) {
        get().pushToast('info', blocked);
        return false;
      }
      // A new start makes the note about an earlier declined consent stale.
      for (const toast of s.toasts) if (toast.text.startsWith(CONSENT_DECLINED_PREFIX)) get().dismissToast(toast.key);
      post(webviewMessage('startRun', { target, premises: [...sources], requestId: trackRun('start') }));
      return true;
    };

    /** The run a review action is about: the proposal's run, else the current run. */
    const reviewRunId = () => get().proposal?.runId ?? get().run?.runId ?? null;

    /** A new overlay for the current proposal (after the proposal, the board's graph or the reveal changed). */
    const overlayFor = (
      proposal: ProposalView | null,
      review: ReviewUi | null,
      current: { nodes: Readonly<Record<string, TlNode>>; vocabulary: readonly VocabItem[]; positions: Readonly<Record<string, CanvasPosition>> },
    ) => (proposal ? buildOverlay(proposal, current, !(review?.revealed ?? false)) : null);

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
        case 'arrows': {
          if (outcome.ok) return;
          rollbackArrows(entry);
          // The host's facts may show an impact the board's graph did not (or the board asked nothing): a question,
          // not an error. A confirmed change is never asked again (a host that still refuses says why in a toast).
          if (outcome.code === 'needs-confirmation' && !entry.confirmed) {
            const dialog = arrowsDialog(entry.change, { text: outcome.error, dependents: outcome.dependents, cards: outcome.dependentCards });
            if (dialog) {
              set({ dialog });
              return;
            }
          }
          errorToast(outcome);
          return;
        }
        case 'positions':
          if (outcome.ok) return;
          rollbackPositions(entry);
          errorToast(outcome);
          return;
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
      // Slice 1f (ES-9): the board becomes read-only (a run became active without this board's start, e.g. one an
      // earlier window left): an inline edit, a drag or an edit dialog under way ends, as the host would refuse it.
      if (runLocksBoard(run) && editLock(s) === null) Object.assign(patch, { editing: null, drag: null, dropKind: null, overAxioms: null, dialog: null });
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
        // Switching to the Proposed view ends a move over the AXIOMS column (slice 1d carry-over), as the toggle does.
        ...(fresh ? { vocabProposedCollapsed: null, runPanelOpen: true, ...(show ? { proposedView: true, overAxioms: null } : {}) } : {}),
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
      positions: {},
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
      selectedArrows: [],
      selectedMarks: [],
      expanded: {},
      hover: null,
      drag: null,
      dropKind: null,
      overAxioms: null,
      promptKind: 'AXIOM',
      newCardAt: null,
      promptFocus: 0,
      // Collapsed to its one-line summary until the user opens it (the board gets the room); highlighting an item opens it.
      vocabCollapsed: options.persisted?.vocabCollapsed ?? true,
      topSplit: readTopSplit(options.persisted?.topSplit),
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
        const provisionalPositions: Record<string, CanvasPosition> = {};
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
              // Slice 1c: it keeps its optimistic place on the canvas until the host's card arrives.
              const at = s.positions[entry.clientId];
              if (at) provisionalPositions[entry.clientId] = at;
            }
          }
        }
        hostIds = new Set(graph.nodes.map((n) => n.id));

        const map = (id: string) => replaced.get(id) ?? id;
        const keep = (id: string) => nodes[id] !== undefined;
        const ui = subjectChanged
          ? { selected: [] as string[], expanded: {}, hover: null, editing: null }
          : (() => {
              const selected = unique(s.selected.map(map)).filter(keep);
              const expanded: Record<string, true> = {};
              for (const id of Object.keys(s.expanded)) if (keep(map(id))) expanded[map(id)] = true;
              return {
                selected,
                expanded,
                hover: s.hover && keep(map(s.hover)) ? map(s.hover) : null,
                editing: s.editing && keep(map(s.editing.id)) ? { ...s.editing, id: map(s.editing.id) } : null,
              };
            })();
        const dialog = s.dialog && !subjectChanged && dialogStillValid(s.dialog, nodes) ? s.dialog : null;
        // Selected arrows and marks stay selected while they are still drawn (a removed one leaves the selection).
        const arrowsKept = subjectChanged ? [] : s.selectedArrows.filter((a) => nodes[a.source] !== undefined && nodes[a.target]?.premises.includes(a.source) === true);
        const marksKept = subjectChanged ? [] : s.selectedMarks.filter((id) => nodes[id]?.fromNothing === true);
        const selectedArrows = arrowsKept.length === s.selectedArrows.length ? s.selectedArrows : arrowsKept;
        const selectedMarks = marksKept.length === s.selectedMarks.length ? s.selectedMarks : marksKept;
        const positions = Object.keys(provisionalPositions).length > 0 ? { ...(graph.positions ?? {}), ...provisionalPositions } : (graph.positions ?? {});
        // The run and the proposal are not part of the graph; only the overlay derived from them refers to the
        // current cards (the ones a proposal removes), so it is rebuilt.
        const overlay = overlayFor(s.proposal, s.review, { nodes, vocabulary: graph.vocabulary, positions });

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
          positions,
          overlay,
          ...ui,
          selectedArrows,
          selectedMarks,
          dialog,
          ...(subjectChanged
            ? { flash: null, history: null, drag: null, dropKind: null, overAxioms: null, newCardAt: null, proposedView: s.proposal?.subject === graph.subject && s.proposedView }
            : {}),
        });
        if (!sameList(ui.selected, s.selected)) postSelection(ui.selected);
        if (graph.subject !== s.subject) persist({ subject: graph.subject });
        return true;
      },

      clickCard(id, additive) {
        const { selected, selectedArrows, selectedMarks } = get();
        // A plain click replaces the whole selection, arrows and marks included (CM-2); Ctrl/Cmd keeps them.
        const others = !additive && (selectedArrows.length > 0 || selectedMarks.length > 0);
        let next: readonly string[];
        if (additive) next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
        else if (selected.length === 1 && selected[0] === id && !others) return;
        else next = [id];
        set({ selected: next, ...(others ? { selectedArrows: [], selectedMarks: [] } : {}) });
        postSelection(next);
      },

      deselect(id) {
        const { selected } = get();
        if (!selected.includes(id)) return;
        const next = selected.filter((x) => x !== id);
        set({ selected: next });
        postSelection(next);
      },

      clearSelection() {
        const s = get();
        if (s.selected.length === 0 && s.selectedArrows.length === 0 && s.selectedMarks.length === 0) return;
        set({ selected: [], selectedArrows: [], selectedMarks: [] });
        if (s.selected.length > 0) postSelection([]);
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
        // Slice 1f: no drag while the board is locked (the cards cannot be dragged then anyway).
        if (node && editLock(get()) === null) set({ drag: { id, from: node.type }, dropKind: null, hover: null });
      },

      setDropKind(kind) {
        if (get().dropKind !== kind) set({ dropKind: kind });
      },

      endDrag() {
        set({ drag: null, dropKind: null });
      },

      dropCard(id, to, beforeId) {
        const node = get().nodes[id];
        if (!node || beforeId === id || locked()) return;
        if (node.type === to) get().reorder(id, beforeId);
        else get().requestKindChange(id, to, beforeId);
      },

      reorder(id, beforeId) {
        const s = get();
        const node = s.nodes[id];
        if (!node || s.provisional[id] || beforeId === id || locked()) return;
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
        if (!node || s.provisional[id] || locked()) return false;
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
        if (node.type === to || locked()) return;
        if (kindChangeRefused(s, id, to)) {
          get().pushToast('info', AXIOM_TO_PROPOSITION_REFUSAL);
          return;
        }
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

      moveToAxioms(id, beforeId = null) {
        const s = get();
        const node = s.nodes[id];
        if (!node || node.type !== 'PROPOSITION' || s.provisional[id] || proposedOverlay(s) !== null || locked()) return;
        const impact = impactOf(s, id, 'AXIOM');
        if (!impact) return;
        // Slice 1d carry-over: a drop on the column lands where it was dropped (an axiom it names, or the end).
        const landing = beforeId !== null && s.order.AXIOM.includes(beforeId) ? beforeId : null;
        // A choice about dependents first (the dependents dialog states the impact), as a drop does.
        if (impact.needsConfirmation) {
          get().requestKindChange(id, 'AXIOM', landing);
          return;
        }
        // AR-7: the impact (the arrows or the mark it loses, its proof) is shown before anything changes.
        set({
          dialog: { kind: 'rationale', id, to: 'AXIOM', beforeId: landing, summary: impact.summary, detail: impact.detail, ...(node.rationale ? { initial: node.rationale } : {}) },
        });
      },

      confirmDependents(choice) {
        const dialog = get().dialog;
        if (dialog?.kind !== 'dependents') return;
        if (choice === 'rewrite' && !dialog.rewriteAvailable) return;
        set({ dialog: null });
        if (locked()) return;
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
        if (locked()) return;
        const text = rationale === null ? '' : oneLine(rationale);
        // The card's own reason, shown in the field and left as it was, is not written again.
        const changed = text !== '' && text !== get().nodes[dialog.id]?.rationale;
        performKindChange(dialog.id, dialog.to, dialog.beforeId, changed ? { rationale: text } : {});
      },

      closeDialog() {
        if (get().dialog) set({ dialog: null });
      },

      addNode(type, text, extras = {}) {
        const naturalName = oneLine(text);
        if (!naturalName || locked()) return null;
        const s = get();
        // Spec v4 BD-3, BD-8, CM-7 (slice 1c): a proposition's place on the canvas goes with it (one Undo step).
        const limit = LIMITS.coordinate;
        const place = (v: number) => Math.round(Math.max(-limit, Math.min(limit, v)));
        const at = extras.position;
        const position = type === 'PROPOSITION' && at && Number.isFinite(at.x) && Number.isFinite(at.y) ? { x: place(at.x), y: place(at.y) } : undefined;
        const inFlight = new Set([...pending.values()].flatMap((p) => (p.kind === 'add' ? [p.clientId] : [])));
        const id = slugId(naturalName, (candidate) => candidate in s.nodes || inFlight.has(candidate));
        const rationale = extras.rationale ? oneLine(extras.rationale) : '';
        const base = createUserNode({ id, type, naturalName, subject: s.subject, asserted: today() });
        const node: TlNode = {
          ...base,
          ...(rationale ? { rationale } : {}),
          ...(extras.stance ? { stance: extras.stance } : {}),
          ...(extras.source ? { source: extras.source } : {}),
          status: { ...base.status, flags: type === 'AXIOM' && !rationale ? ['no-rationale'] : [] },
        };
        set({
          nodes: { ...s.nodes, [id]: node },
          order: { ...s.order, [type]: [...s.order[type], id] },
          provisional: { ...s.provisional, [id]: true },
          ...(position ? { positions: { ...s.positions, [id]: position } } : {}),
          // "New proposition here" chose the place of this card only.
          ...(type === 'PROPOSITION' ? { newCardAt: null } : {}),
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
            ...(position ? { position } : {}),
          }),
        );
        return id;
      },

      setPromptKind(kind) {
        // The point "New proposition here" chose is for a proposition only.
        set({ promptKind: kind, ...(kind === 'AXIOM' && get().newCardAt !== null ? { newCardAt: null } : {}) });
      },

      newPropositionAt(point) {
        const s = get();
        if (proposedOverlay(s) !== null || locked()) return false;
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
        const limit = LIMITS.coordinate;
        const place = (v: number) => Math.round(Math.max(-limit, Math.min(limit, v)));
        set({ promptKind: 'PROPOSITION', newCardAt: { x: place(point.x), y: place(point.y) }, promptFocus: s.promptFocus + 1 });
        return true;
      },

      clearNewCardAt() {
        if (get().newCardAt !== null) set({ newCardAt: null });
      },

      startEdit(id, field) {
        const s = get();
        if (!s.nodes[id] || s.provisional[id] || locked()) return;
        set({ editing: { id, field } });
      },

      stopEdit() {
        if (get().editing) set({ editing: null });
      },

      editNode(id, field, value) {
        const s = get();
        const node = s.nodes[id];
        if (!node || s.provisional[id] || locked()) return false;
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
            if (!reason && node.type === 'AXIOM') flags.push('no-rationale');
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
        if (!s.nodes[id] || s.provisional[id] || locked()) return;
        set({ dialog: { kind: 'delete', id } });
      },

      deleteNode(id, keepLean, confirmed = false) {
        const s = get();
        if (!s.nodes[id] || s.provisional[id]) return;
        if (s.dialog?.kind === 'delete') set({ dialog: null });
        if (locked()) return;
        const sure = confirmed && !keepLean;
        const requestId = track({ kind: 'delete', id, keepLean, confirmed: sure });
        post(webviewMessage('deleteNode', { id, keepLean, ...(sure ? { confirmed: true } : {}), requestId }));
      },

      addArrows(target, sources) {
        return requestArrows({ kind: 'add-arrows', target, sources });
      },

      drawArrowsFromSelection(target) {
        const s = get();
        if (proposedOverlay(s) !== null || locked()) return false;
        const sources = s.selected.filter((id) => id !== target && s.nodes[id] !== undefined && !s.provisional[id]);
        if (sources.length === 0) {
          get().pushToast('info', ARROW_TEXTS.noSources);
          return false;
        }
        return get().addArrows(target, sources);
      },

      removeArrows(arrows) {
        return requestArrows({ kind: 'remove-arrows', arrows, marks: [] });
      },

      setFromNothing(id, on) {
        return requestArrows({ kind: 'set-from-nothing', id, on });
      },

      claimPending(id) {
        const s = get();
        if (!s.nodes[id] || s.provisional[id] || proposedOverlay(s) !== null || locked()) return;
        // Not optimistic: "pending proof" is a status the host derives from the Lean it writes.
        post(webviewMessage('claimPending', { id, requestId: plain() }));
      },

      moveCards(positions) {
        const s = get();
        if (proposedOverlay(s) !== null || locked()) return;
        const limit = LIMITS.coordinate;
        const clamp = (v: number) => Math.max(-limit, Math.min(limit, v));
        const moves = Object.entries(positions)
          .filter(([id, p]) => s.nodes[id]?.type === 'PROPOSITION' && !s.provisional[id] && Number.isFinite(p.x) && Number.isFinite(p.y))
          .slice(0, LIMITS.listLength)
          .map(([id, p]): [string, CanvasPosition] => [id, { x: clamp(p.x), y: clamp(p.y) }]);
        if (moves.length === 0) return;
        const back: Record<string, CanvasPosition | null> = {};
        const next: Record<string, CanvasPosition> = { ...s.positions };
        for (const [id, p] of moves) {
          back[id] = s.positions[id] ?? null;
          next[id] = p;
        }
        set({ positions: next });
        const requestId = track({ kind: 'positions', seq: s.seq, back });
        post(webviewMessage('moveCards', { positions: Object.fromEntries(moves), requestId }));
      },

      confirmArrows() {
        const dialog = get().dialog;
        if (dialog?.kind !== 'arrows') return;
        set({ dialog: null });
        if (proposedOverlay(get()) !== null || locked()) return;
        const change = normalizeArrows(dialog.change);
        if (change) sendArrows(change, true);
      },

      selectArrow(source, target, additive) {
        const s = get();
        // Only drawn arrows can be selected (spec v4 Part 4, T21 ¶3): an old axiom's premises are not drawn (A19). The
        // proposed view selects nothing (slice 1f, the 1b verification's F3); selecting stays allowed on a locked board.
        const into = s.nodes[target];
        if (proposedOverlay(s) !== null) return;
        if (source === target || s.nodes[source] === undefined || into?.type !== 'PROPOSITION' || !into.premises.includes(source)) return;
        const arrow = { source, target };
        const has = s.selectedArrows.some((a) => sameArrow(a, arrow));
        if (additive) {
          set({ selectedArrows: has ? s.selectedArrows.filter((a) => !sameArrow(a, arrow)) : [...s.selectedArrows, arrow] });
          return;
        }
        if (has && s.selectedArrows.length === 1 && s.selected.length === 0 && s.selectedMarks.length === 0) return;
        set({ selected: [], selectedArrows: [arrow], selectedMarks: [] });
        if (s.selected.length > 0) postSelection([]);
      },

      selectMark(id, additive) {
        const s = get();
        // Like an arrow (1b): only a mark that is drawn; nothing in the Proposed view; allowed on a locked board.
        if (proposedOverlay(s) !== null || s.nodes[id]?.fromNothing !== true) return;
        const has = s.selectedMarks.includes(id);
        if (additive) {
          set({ selectedMarks: has ? s.selectedMarks.filter((x) => x !== id) : [...s.selectedMarks, id] });
          return;
        }
        if (has && s.selectedMarks.length === 1 && s.selected.length === 0 && s.selectedArrows.length === 0) return;
        set({ selected: [], selectedArrows: [], selectedMarks: [id] });
        if (s.selected.length > 0) postSelection([]);
      },

      selectForMenu(thing) {
        const s = get();
        const choice = menuSelection(s, thing, proposedOverlay(s) !== null);
        switch (choice.kind) {
          case 'keep':
            return;
          case 'card':
            get().clickCard(choice.id, false);
            return;
          case 'arrow':
            get().selectArrow(choice.source, choice.target, false);
            return;
          case 'mark':
            get().selectMark(choice.id, false);
            return;
        }
      },

      selectIncomingArrows(id) {
        const s = get();
        const node = s.nodes[id];
        // An old axiom's arrows (declared before v4) are not drawn, so they cannot be selected (A19).
        if (!node || node.type !== 'PROPOSITION' || proposedOverlay(s) !== null) return false;
        const arrows = unique(node.premises)
          .filter((source) => source !== id && s.nodes[source] !== undefined)
          .map((source) => ({ source, target: id }));
        const marks = node.fromNothing === true ? [id] : [];
        if (arrows.length === 0 && marks.length === 0) {
          get().pushToast('info', ARROW_TEXTS.noIncoming);
          return false;
        }
        set({ selected: [], selectedArrows: arrows, selectedMarks: marks });
        if (s.selected.length > 0) postSelection([]);
        return true;
      },

      deleteSelectedArrows() {
        const s = get();
        if (proposedOverlay(s) !== null || (s.selectedArrows.length === 0 && s.selectedMarks.length === 0)) return false;
        // AR-1: Delete never deletes cards together with arrows. Slice 1f (UN-2, carry-over 2): the arrows and the
        // marks go in one message, so one Undo step; when a proof uses an arrow, the A16 question covers all of it.
        // While the board is locked nothing is sent (the toast says why), and the card's delete dialog stays shut.
        if (locked()) return true;
        requestArrows({ kind: 'remove-arrows', arrows: s.selectedArrows, marks: s.selectedMarks });
        return true;
      },

      pressDelete(focused) {
        const s = get();
        const card = focused !== null && s.nodes[focused] !== undefined ? focused : null;
        const outcome = deleteOutcome({ arrows: s.selectedArrows.length, marks: s.selectedMarks.length }, card, {
          lock: editLock(s),
          proposed: proposedOverlay(s) !== null,
        });
        switch (outcome.kind) {
          case 'remove-selection':
            requestArrows({ kind: 'remove-arrows', arrows: s.selectedArrows, marks: s.selectedMarks });
            return true;
          case 'delete-card':
            get().openDelete(outcome.id);
            return true;
          case 'refused':
            get().pushToast('info', outcome.reason);
            return true;
          case 'none':
            return false;
        }
      },

      selectArea(found, additive) {
        const s = get();
        if (proposedOverlay(s) !== null) return;
        // As a click would: known cards; drawn arrows only (a proposition's declared premises, A19); drawn marks.
        const cards = unique(found.cards).filter((id) => s.nodes[id] !== undefined);
        const arrows: ArrowEnds[] = [];
        for (const arrow of found.arrows) {
          const into = s.nodes[arrow.target];
          if (arrow.source === arrow.target || s.nodes[arrow.source] === undefined || into?.type !== 'PROPOSITION' || !into.premises.includes(arrow.source)) continue;
          if (!arrows.some((a) => sameArrow(a, arrow))) arrows.push({ source: arrow.source, target: arrow.target });
        }
        const marks = unique(found.marks).filter((id) => s.nodes[id]?.fromNothing === true);
        const selected = additive ? unique([...s.selected, ...cards]) : cards;
        const selectedArrows = additive ? [...s.selectedArrows, ...arrows.filter((a) => !s.selectedArrows.some((b) => sameArrow(a, b)))] : arrows;
        const selectedMarks = additive ? unique([...s.selectedMarks, ...marks]) : marks;
        const sameArrows = selectedArrows.length === s.selectedArrows.length && selectedArrows.every((a, i) => s.selectedArrows[i] !== undefined && sameArrow(a, s.selectedArrows[i] as ArrowEnds));
        if (sameList(selected, s.selected) && sameArrows && sameList(selectedMarks, s.selectedMarks)) return;
        set({ selected, selectedArrows, selectedMarks });
        if (!sameList(selected, s.selected)) postSelection(selected);
      },

      setOverAxioms(over) {
        const current = get().overAxioms;
        if (current === over || (current !== null && over !== null && current.id === over.id && current.count === over.count)) return;
        set({ overAxioms: over });
      },

      formalize() {
        const s = get();
        const question = formalizeOf(s);
        if (question.disabled !== null || question.target === null) {
          get().pushToast('info', question.disabled ?? FORMALIZE_TEXTS.none);
          return false;
        }
        const { target, sources } = question;
        // AR-8 (★D7 (b)): a source that is a proposition with neither a proof nor a pending claim is asked about first.
        // One without a Lean statement must be formalised and proved first (AP-10), so it is asked about before any mark.
        const unproved = sources.filter((id) => s.nodes[id] !== undefined && needsHoldsFirst(s.nodes[id] as TlNode));
        const bare = unproved.find((id) => !canMarkPending(s.nodes[id] as TlNode));
        if (bare !== undefined) {
          set({ dialog: { kind: 'formalize', mode: 'no-statement', id: bare, target, sources, queue: [], confirmed: [] } });
          return true;
        }
        const [first, ...rest] = unproved;
        if (first !== undefined) {
          set({ dialog: { kind: 'formalize', mode: 'mark-pending', id: first, target, sources, queue: rest, confirmed: [] } });
          return true;
        }
        return postStart(target, sources);
      },

      confirmFormalizePending() {
        const dialog = get().dialog;
        if (dialog?.kind !== 'formalize' || dialog.mode !== 'mark-pending') return;
        const confirmed = [...dialog.confirmed, dialog.id];
        const [next, ...rest] = dialog.queue;
        if (next !== undefined) {
          set({ dialog: { ...dialog, id: next, queue: rest, confirmed } });
          return;
        }
        set({ dialog: null });
        if (proposedOverlay(get()) !== null || locked()) return;
        // AR-8: each mark is the user's own edit (claimPending: `axiom n.holds`, one Undo step), made before the run starts
        // (the host applies the edits that reached it before the start first, so the run's base holds them).
        let left = confirmed.length;
        let refused = false;
        for (const id of confirmed) {
          post(
            webviewMessage('claimPending', {
              id,
              requestId: plain((outcome) => {
                if (!outcome.ok) refused = true;
                left -= 1;
                if (left === 0 && !refused) postStart(dialog.target, dialog.sources);
              }),
            }),
          );
        }
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
        set({ proposedView: next, ...(next ? { editing: null, drag: null, dropKind: null, overAxioms: null } : {}) });
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
        const { definitions } = acceptSelection(proposal, review);
        // The run panel words the outcome by this until the host's answer says for certain (the run may end before it).
        set({ accepted: { runId: proposal.runId, proposalId: proposal.proposalId, changedFiles: acceptChangesFiles(proposal) } });
        post(
          webviewMessage('acceptProposal', {
            runId: proposal.runId,
            proposalId: proposal.proposalId,
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

      setTopSplit(fraction) {
        const value = fraction === null ? null : readTopSplit(fraction);
        if (get().topSplit === value) return;
        set({ topSplit: value });
        persist({ topSplit: value });
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
        // UN-1, UN-3, A27 (slice 1f): nothing in the Proposed view or on a locked board reaches the host's Undo.
        if (proposedOverlay(get()) !== null || locked(true)) return;
        clearToastUndo();
        post(webviewMessage('undo', { requestId: plain() }));
      },

      redo() {
        if (proposedOverlay(get()) !== null || locked(true)) return;
        clearToastUndo();
        post(webviewMessage('redo', { requestId: plain() }));
      },

      selectSubject(subject) {
        if (subject !== get().subject) post(webviewMessage('selectSubject', { subject }));
      },

      createSubject(name, onResult) {
        // Slice 1f (ES-9): a new subject changes Model.lean, part of the session's base. The caller shows the refusal.
        const lock = editLock(get());
        if (lock !== null) {
          onResult?.({ ok: false, code: 'conflict', error: lock });
          return;
        }
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
        if (locked()) return;
        set({ dialog: { kind: 'revert', entry } });
      },

      revertHistory(entryId) {
        if (get().dialog?.kind === 'revert') set({ dialog: null });
        if (locked()) return;
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
  if (dialog.kind === 'revert') return true;
  // Slice 1e: the AR-8 question needs its whole question still on the board.
  if (dialog.kind === 'formalize') return [dialog.id, dialog.target, ...dialog.sources].every((id) => nodes[id] !== undefined);
  return nodes[dialog.id] !== undefined;
}
