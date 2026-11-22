/**
 * Slice 2g (docs/slice2-plan.md 5.1, 5.2): the board's state of an edit session, a slice of the board store
 * (`createBoardStore` spreads it in; store.ts keeps only the wiring: the `session` message, the `actionResult` routing,
 * the overlay and the persisted state).
 *
 * The host owns the session (§5.1). The slice keeps:
 *  - `session`: the SessionView as the host posted it (masked by the host while the results are hidden, D2-5);
 *  - `sessionReview`: the review UI (`current`, the filter, the pane, the explicit toggles, the events seen, the note a
 *    group decision left), reset by a new run, kept across stages while `current` still exists (§5.2);
 *  - `selectedItems` (a group's selection, apart from the board's cards) and `sessionBusy` (one request at a time);
 *  - `declineMenu`: the decline menu that is open (an item's, a group's, or "Ask me instead"'s, §5.7, RV-10).
 * Decisions are not optimistic: an item shows a spinner until the host's `actionResult`, and the next `session`
 * message is the truth. Each request carries what the user saw (`rev`, `stage`, the Undo `step`, the check id). One
 * message per user action; a cascade comes back as `needs-confirmation` and opens the cascade dialog, whose Continue
 * sends the same request again with `confirmed`. While Claude's step runs (phases step and interrupted) every action
 * that decides does nothing (D2-62): the list stays browsable, and Exit stays.
 *
 * The Proposed view of a session is model/sessionBoard.ts `sessionOverlay` (slice 2h, §5.10): the host's board
 * (`SessionView.board`: under the base mask while the results are hidden, every target with the neutral chip), its
 * card marks, Claude's arrows and the premise suggestions, rebuilt on every `session` message and every Current graph.
 * Slice 2h also routes a mid-stage Formalize (`formalizeInStage`, RV-9), a move on the Proposed view (`moveProposed`,
 * D2-33, one session-stack step; shown at once, rolled back if refused) and the Context Menu's group Accept here.
 */
import {
  LIMITS,
  REVIEW_TEXTS,
  webviewMessage,
  type ActionOutcome,
  type ArrowEnds,
  type CanvasPosition,
  type CascadeEntry,
  type DeclineOption,
  type ItemDecision,
  type ItemView,
  type SessionView,
  type WebviewToHostMessage,
} from '@telelean/core';
import { oneLine } from '../model/format';
import { focusesItem, sessionOverlay, type CurrentBoard, type Overlay } from '../model/sessionBoard';
import {
  askMeItems,
  declinePlan,
  firstInReview,
  inReviewIds,
  isHiddenResult,
  leftNote,
  moveFrom,
  reviewKey,
  reviewRows,
  rowIds,
  type ReviewFilter,
  type ReviewKeyEvent,
} from '../model/review';
import { exitCounts, readOnlyReason } from '../model/sessionBar';
import type { BoardState, DialogState } from './store';

/** The review UI (§5.2), per run. */
export interface SessionReviewUi {
  runId: string;
  /** The item the detail shows (keyboard `aria-activedescendant`). */
  current: string | null;
  filter: ReviewFilter;
  /** Below 640 px: the list or the detail (`paneModeFor`). */
  pane: 'list' | 'detail';
  /** Statements shown fully explicit, by item id. */
  explicit: Readonly<Record<string, true>>;
  /** The newest event the user dismissed (the events box shows the ones after it). */
  seenEvent: number;
  /** "Left 2: …" after a group decision, until the next decision or stage. */
  lastGroup: string | null;
}

/** What the webview state keeps of the review across reloads: used only for the same run (§6.1). */
export interface PersistedSessionReview {
  runId: string;
  current: string | null;
  filter: ReviewFilter;
}

export type SessionBusyAction = 'decide' | 'reveal' | 'undo' | 'redo' | 'submit' | 'end' | 'retry' | 'diff' | 'formalize' | 'move';

export interface SessionBusy {
  action: SessionBusyAction;
  requestId: string;
  /** The items a decision is about (their rows show a spinner). */
  items?: readonly string[];
}

/**
 * The decline menu (§5.7): one item's (`item`), the group's (`group`), "Ask me instead"'s (`report`, RV-10), or (slice
 * 2h, §5.7) the Context Menu section's for the review items its selection names (`context`, a group too).
 */
export interface DeclineMenuState {
  items: readonly string[];
  origin: 'item' | 'group' | 'report' | 'context';
  /** Shaky chosen: its note field and its Decline button show. */
  option: 'shaky' | null;
  note: string;
  /** For `report`: the report entry it came from (`step:index`). */
  key?: string;
}

/** A request the cascade dialog may send again, `confirmed` (§3.6, §5.12). */
export type SessionResend =
  | {
      kind: 'decide';
      runId: string;
      stage: number;
      own: boolean;
      decisions: ItemDecision[];
      /** A group's decision: what it left is noted after it (RV-8). */
      group: boolean;
      /** "Ask me instead" (RV-10): not the list's group action, so the user's selection stays. */
      keepSelection?: boolean;
      /** What the board's own preview left (a group Decline sends only what the rules take). */
      localLeft: Array<{ item: string; reason: string }>;
      /** Accept & next: where to go back to when it is refused. */
      back?: string;
    }
  | { kind: 'undo' | 'redo'; runId: string; step: number };

/** The session's dialogs (§5.2). Exit's is the board's own (D2-36), never persisted. */
export type SessionDialogState =
  /** A decision (or Undo) that takes Accepts away: the list, the hidden-results sentence (D2-64); Continue sends it again. */
  | { kind: 'cascade'; lead: string; cascade: readonly CascadeEntry[]; hiddenResults: boolean; resend: SessionResend }
  /** Show results, Raw Lean diff… and Show Claude's activity share it (D2-10, D2-61). */
  | { kind: 'reveal'; via: 'show-result' | 'raw-diff' | 'activity'; file?: string }
  /** Accept on an Add premise: how the user holds it (RV-1, §3.8). */
  | { kind: 'hold-as'; item: string; next: boolean }
  | { kind: 'exit-session'; accepted: number; inReview: number; stepRunning: boolean };

export const SESSION_DIALOG_KINDS: ReadonlySet<string> = new Set(['cascade', 'reveal', 'hold-as', 'exit-session']);

export function isSessionDialog(dialog: DialogState | null): dialog is SessionDialogState {
  return dialog !== null && SESSION_DIALOG_KINDS.has(dialog.kind);
}

export interface SessionUi {
  /** The root's session as the host last posted it (null: none). */
  session: SessionView | null;
  sessionReview: SessionReviewUi | null;
  /** Items selected for a group decision, in the order they were selected. */
  selectedItems: readonly string[];
  sessionBusy: SessionBusy | null;
  declineMenu: DeclineMenuState | null;
}

export interface SessionActions {
  /** Shows the item in the detail (the list's click, a link). */
  focusItem(id: string): void;
  moveCurrent(to: 1 | -1 | 'first' | 'last'): void;
  toggleItemSelected(id: string): void;
  /** "Select them" (RV-5): the missing dependencies a disabled Accept names. */
  selectItems(ids: readonly string[]): void;
  selectAllInReview(): void;
  clearItemSelection(): void;
  setReviewFilter(filter: ReviewFilter): void;
  setReviewPane(pane: 'list' | 'detail'): void;
  toggleItemExplicit(id: string): void;
  /** Hides the events shown so far (the events box). */
  dismissEvents(): void;
  /** The item's own Accept (`own: true`); an Add premise asks how it is held first. `next`: Accept & next. */
  acceptItem(id: string, next?: boolean): boolean;
  /** The hold-as dialog's Accept. */
  confirmHoldAs(holdAs: 'axiom' | 'pending', rationale: string): boolean;
  /** One item's decline: plain for an arrow item (DO-0), Reject or Shaky (with its note) for the others. */
  declineItem(id: string, option: DeclineOption, note?: string): boolean;
  /** Back to "in review" (RV-3), un-reject included ("Rejected in this session"). */
  reopenItem(id: string): boolean;
  /** "Rejected in this session": Un-reject, with the rejected version's rev. */
  unrejectItem(id: string): boolean;
  /** The list's group buttons: one `decideItems`, `own: false`, whatever its size (D2-32). */
  acceptSelected(): boolean;
  declineSelected(option: DeclineOption, note?: string): boolean;
  openDeclineMenu(items: readonly string[], origin: DeclineMenuState['origin']): void;
  /** The menu's entries: Reject (and an arrow's Decline) decline at once; Shaky shows its note and its Decline button. */
  chooseDeclineOption(option: DeclineOption): void;
  setDeclineNote(note: string): void;
  /** The menu's Decline button (Shaky with its note). */
  confirmDeclineMenu(): boolean;
  closeDeclineMenu(): void;
  /** RV-10, D2-13: the decline menu on the items that rely on the choice, Shaky, "Ask me about: ‹choice›" prefilled. */
  askMeInstead(step: string, index: number): void;
  /** "Select these arrows" (§5.4): the target's question and the missing arrow, on the board. */
  selectReportArrows(target: string, extra?: ArrowEnds): void;
  /** The cascade dialog's Continue. */
  confirmCascade(): void;
  /** Show results, Raw Lean diff… while hidden, Show Claude's activity: the reveal dialog first. */
  openReveal(via: 'show-result' | 'raw-diff' | 'activity', file?: string): void;
  confirmReveal(): void;
  submitReview(): boolean;
  openExitSession(): void;
  confirmExitSession(): boolean;
  /** The end confirmation's Apply (with the check id) and Back to review. */
  applyEnd(): boolean;
  backToReview(): boolean;
  retryStep(): boolean;
  /** Raw Lean diff…: asks first while the results are hidden (it shows every proof). */
  openSessionDiff(file?: string): void;
  sessionUndo(): void;
  sessionRedo(): void;
  /** The review list's keys (D2-37); true when the key was the list's. */
  pressReviewKey(event: ReviewKeyEvent): boolean;
  /**
   * Slice 2h (RV-9, §5.11): a mid-stage Formalize of the session's current stage (`formalize { runId, stage, inferences }`);
   * refused while Claude's step runs (D2-62). The store's `formalize` checks the question first.
   */
  formalizeInStage(inferences: ReadonlyArray<{ target: string; premises: readonly string[] }>): boolean;
  /**
   * Slice 2h (D2-33, UN-4): cards moved on the Proposed view, one session-stack step (`moveProposed`): shown there at
   * once, put back if the host refuses; refused while Claude's step runs (D2-62).
   */
  moveProposedCards(positions: Readonly<Record<string, CanvasPosition>>): boolean;
  /** Slice 2h (CM-2, RV-8): the Context Menu section's Accept: one group `decideItems` (`own: false`) of `ids`. */
  acceptGroup(ids: readonly string[]): boolean;
}

export type SessionSlice = SessionUi & SessionActions;

export interface SessionSliceContext {
  set: (patch: Partial<BoardState>) => void;
  get: () => BoardState;
  post: (message: WebviewToHostMessage) => void;
  nextRequestId: () => string;
  persist: (review: PersistedSessionReview) => void;
  /** The persisted review UI of the last session this panel showed (applied only to the same run). */
  persisted?: PersistedSessionReview;
  /** Slice 2h: the Current board, which the Proposed view reads its cards' places (files, canvas) and vocabulary from. */
  current: () => CurrentBoard;
}

/** Reads the persisted review UI defensively (an older build or a hand-edited state may hold anything). */
export function readPersistedReview(raw: unknown): PersistedSessionReview | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.runId !== 'string' || r.runId === '') return undefined;
  return {
    runId: r.runId,
    current: typeof r.current === 'string' ? r.current : null,
    filter: r.filter === 'in-review' ? 'in-review' : 'all',
  };
}

/** The cascade dialog's lead-in for a request (§3.6, §5.12). */
function leadOf(resend: SessionResend): string {
  if (resend.kind !== 'decide') return REVIEW_TEXTS.cascadeUndoAccept;
  const first = resend.decisions[0];
  if (first?.to === 'declined') return first.option === 'shaky' ? REVIEW_TEXTS.cascadeShaky : REVIEW_TEXTS.cascadeReject;
  return REVIEW_TEXTS.cascadeBackToReview;
}

/** A Shaky note as the protocol takes it: trimmed, dropped when blank, at most `LIMITS.textLength` (it may span lines). */
function noteOf(note: string | undefined): string | undefined {
  const trimmed = (note ?? '').trim();
  return trimmed === '' ? undefined : trimmed.slice(0, LIMITS.textLength);
}

interface Pending {
  action: SessionBusyAction;
  resend?: SessionResend;
  confirmed: boolean;
  file?: string;
}

/** Slice 2h: a move shown at once on the Proposed view, put back if the host refuses it. */
interface MoveShown {
  /** The positions the overlay had before, per moved card (null: it had none). */
  back: Readonly<Record<string, CanvasPosition | null>>;
}


/** What `createSessionSlice` gives the store: the slice, and the hooks of its wiring. */
export interface SessionWiring {
  slice: SessionSlice;
  /** The host's `session` message (§2.4, §5.2). */
  receive(view: SessionView | null): void;
  /** The host's answer to a session request: true when it was one (the store routes every `actionResult` here first). */
  result(requestId: string, outcome: ActionOutcome): boolean;
  /**
   * Slice 2h: the Proposed view of `view` against a Current board (the store rebuilds it on a new Current graph); a
   * move shown before the host answered stays shown.
   */
  overlayOf(view: SessionView, current: CurrentBoard): Overlay;
}

export function createSessionSlice(ctx: SessionSliceContext): SessionWiring {
  const { set, get, post } = ctx;
  const pending = new Map<string, Pending>();
  /** Slice 2h: the moves shown before the host answered, by request id. */
  const moves = new Map<string, MoveShown>();
  /** `built` with the cards of the moves still on their way where they were shown (`shown`: the overlay on screen). */
  const withMovesShown = (built: Overlay, shown: Overlay | null): Overlay => {
    if (moves.size === 0 || shown === null) return built;
    const ids = [...moves.values()].flatMap((m) => Object.keys(m.back));
    return { ...built, positions: { ...built.positions, ...pick(shown.positions, ids) } };
  };
  /** The persisted review UI, applied once, to its own run. */
  let persisted = ctx.persisted;
  /** An Exit on its way: a second Exit waits for its answer (a double click sends one). */
  let exiting: string | null = null;

  const view = () => get().session;
  const ui = () => get().sessionReview;
  const itemOf = (id: string | null): ItemView | undefined => (id === null ? undefined : view()?.items.find((i) => i.id === id));
  /** D2-62 and one request at a time: nothing that decides is sent now. */
  const blocked = () => {
    const v = view();
    return v === null || readOnlyReason(v) !== null || get().sessionBusy !== null;
  };

  const persistUi = (r: SessionReviewUi) => ctx.persist({ runId: r.runId, current: r.current, filter: r.filter });

  const setUi = (patch: Partial<SessionReviewUi>) => {
    const current = ui();
    if (current === null) return;
    const next = { ...current, ...patch };
    set({ sessionReview: next });
    if (next.current !== current.current || next.filter !== current.filter) persistUi(next);
  };

  /** The ids of the rows on screen (the filter applied), in order. */
  const visible = (): string[] => {
    const v = view();
    const r = ui();
    if (v === null || r === null) return [];
    const nodes = Object.fromEntries(v.board.graph.nodes.map((n) => [n.id, n]));
    return rowIds(reviewRows(v.items, v.inferences, nodes, r.filter));
  };

  const busyOf = (requestId: string, entry: Pending): SessionBusy => {
    const items = entry.resend?.kind === 'decide' ? entry.resend.decisions.map((d) => d.item) : undefined;
    return { action: entry.action, requestId, ...(items !== undefined ? { items } : {}) };
  };

  /**
   * Sends are one at a time, except Exit (AF14). `sessionBusy` names the request the rows wait for: Exit never takes
   * it from a decision that is on its way (builder 2g r1, F-V2G-FC-6), and when the one it names is answered, an Exit
   * still pending takes over, so nothing else goes out beside it.
   */
  const track = (entry: Pending, o: { exit?: boolean } = {}): string => {
    const requestId = ctx.nextRequestId();
    pending.set(requestId, entry);
    if (!(o.exit === true && get().sessionBusy !== null)) set({ sessionBusy: busyOf(requestId, entry) });
    return requestId;
  };

  const sendResend = (resend: SessionResend, confirmed: boolean) => {
    if (resend.kind === 'decide') {
      const requestId = track({ action: 'decide', resend, confirmed });
      post(
        webviewMessage('decideItems', {
          runId: resend.runId,
          stage: resend.stage,
          own: resend.own,
          decisions: resend.decisions.map((d) => ({ ...d })),
          ...(confirmed ? { confirmed: true } : {}),
          requestId,
        }),
      );
      return;
    }
    const requestId = track({ action: resend.kind, resend, confirmed });
    const payload = { runId: resend.runId, step: resend.step, ...(confirmed ? { confirmed: true } : {}), requestId };
    post(resend.kind === 'undo' ? webviewMessage('sessionUndo', payload) : webviewMessage('sessionRedo', payload));
  };

  /** One `decideItems` (§2.4): `own` only for exactly one Accept, the detail's (D2-32). */
  const decide = (decisions: ItemDecision[], o: { own?: boolean; group?: boolean; keepSelection?: boolean; localLeft?: Array<{ item: string; reason: string }>; back?: string } = {}): boolean => {
    const v = view();
    if (v === null || decisions.length === 0 || decisions.length > LIMITS.decisions) return false;
    if (get().declineMenu !== null) set({ declineMenu: null });
    setUi({ lastGroup: null });
    sendResend(
      {
        kind: 'decide',
        runId: v.runId,
        stage: v.stage,
        own: o.own === true && decisions.length === 1,
        decisions,
        group: o.group === true,
        ...(o.keepSelection === true ? { keepSelection: true } : {}),
        localLeft: o.localLeft ?? [],
        ...(o.back !== undefined ? { back: o.back } : {}),
      },
      false,
    );
    return true;
  };

  const declineDecision = (item: ItemView, option: DeclineOption, note?: string): ItemDecision => {
    const kept = option === 'shaky' ? noteOf(note) : undefined;
    return { item: item.id, rev: item.rev, to: 'declined', option, ...(kept !== undefined ? { note: kept } : {}) };
  };

  /** Declines several items in one message: one option, the plain decline for arrow items (RV-8, `planGroupDecline`). */
  const declineMany = (ids: readonly string[], option: DeclineOption, note?: string, fromReport = false): boolean => {
    const v = view();
    if (v === null || blocked()) return false;
    const plan = declinePlan(v.items, ids, option);
    const decisions = plan.decisions.flatMap((d) => {
      const item = itemOf(d.item);
      return item === undefined ? [] : [declineDecision(item, d.option, note)];
    });
    if (decisions.length === 0) {
      set({ declineMenu: null });
      setUi({ lastGroup: leftNote(v.items, plan.left) });
      return false;
    }
    return decide(decisions, { group: true, keepSelection: fromReport, localLeft: plan.left });
  };

  const errorToast = (outcome: Extract<ActionOutcome, { ok: false }>) => get().pushToast('error', outcome.error || `Refused (${outcome.code}).`);

  /** Accept & next: the row after `id` among those on screen. */
  const nextAfter = (id: string): string | null => {
    const ids = visible();
    const at = ids.indexOf(id);
    return at >= 0 && at + 1 < ids.length ? (ids[at + 1] ?? null) : null;
  };

  const slice: SessionSlice = {
    session: null,
    sessionReview: null,
    selectedItems: [],
    sessionBusy: null,
    declineMenu: null,

    focusItem(id) {
      if (itemOf(id) === undefined) return;
      setUi({ current: id, pane: 'detail' });
      // Slice 2h: a mark or Claude's arrow on the board shows its item in the review panel.
      if (!get().runPanelOpen) set({ runPanelOpen: true });
    },

    moveCurrent(to) {
      const r = ui();
      if (r === null) return;
      const next = moveFrom(visible(), r.current, to);
      if (next !== null && next !== r.current) setUi({ current: next });
    },

    toggleItemSelected(id) {
      const item = itemOf(id);
      if (item === undefined || isHiddenResult(item)) return;
      const selected = get().selectedItems;
      set({ selectedItems: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id] });
    },

    selectItems(ids) {
      const v = view();
      if (v === null) return;
      set({ selectedItems: [...new Set(ids)].filter((id) => v.items.some((i) => i.id === id && !isHiddenResult(i))) });
    },

    selectAllInReview() {
      const v = view();
      if (v !== null) set({ selectedItems: inReviewIds(v.items) });
    },

    clearItemSelection() {
      if (get().selectedItems.length > 0) set({ selectedItems: [] });
    },

    setReviewFilter(filter) {
      setUi({ filter });
    },

    setReviewPane(pane) {
      setUi({ pane });
    },

    toggleItemExplicit(id) {
      const r = ui();
      if (r === null) return;
      const explicit = { ...r.explicit };
      if (explicit[id]) delete explicit[id];
      else explicit[id] = true;
      setUi({ explicit });
    },

    dismissEvents() {
      const v = view();
      if (v !== null) setUi({ seenEvent: v.events.reduce((m, e) => Math.max(m, e.id), 0) });
    },

    acceptItem(id, next = false) {
      const item = itemOf(id);
      if (item === undefined || blocked() || item.status !== 'in-review' || !item.accept.ok) return false;
      if (item.kind === 'add-premise') {
        set({ dialog: { kind: 'hold-as', item: id, next } });
        return true;
      }
      const after = next ? nextAfter(id) : null;
      const sent = decide([{ item: id, rev: item.rev, to: 'accepted' }], { own: true, ...(next ? { back: id } : {}) });
      if (sent && after !== null) setUi({ current: after });
      return sent;
    },

    confirmHoldAs(holdAs, rationale) {
      const dialog = get().dialog;
      if (dialog?.kind !== 'hold-as') return false;
      const item = itemOf(dialog.item);
      set({ dialog: null });
      if (item === undefined || blocked() || item.status !== 'in-review' || !item.accept.ok) return false;
      // AF12: one already written (an adopted ghost of a converted v1 run) is accepted only as an axiom.
      if (item.detail.kind === 'add-premise' && item.detail.writtenInReview === true && holdAs !== 'axiom') return false;
      const why = oneLine(rationale).slice(0, LIMITS.textLength);
      const after = dialog.next ? nextAfter(item.id) : null;
      const sent = decide([{ item: item.id, rev: item.rev, to: 'accepted', holdAs, ...(why !== '' ? { rationale: why } : {}) }], {
        own: true,
        ...(dialog.next ? { back: item.id } : {}),
      });
      if (sent && after !== null) setUi({ current: after });
      return sent;
    },

    declineItem(id, option, note) {
      const item = itemOf(id);
      if (item === undefined || blocked() || !item.decline.ok) return false;
      // DO-0: an arrow item has no options; any other item needs Reject or Shaky (never the plain decline).
      const chosen: DeclineOption = item.kind === 'add-arrow' || item.kind === 'remove-arrow' ? 'plain' : option;
      const offered = item.decline.options.find((o) => o.option === chosen);
      if (offered === undefined || offered.disabled !== undefined) return false;
      return decide([declineDecision(item, chosen, note)]);
    },

    reopenItem(id) {
      const item = itemOf(id);
      if (item === undefined || blocked() || !item.review.ok) return false;
      return decide([{ item: id, rev: item.rev, to: 'in-review' }]);
    },

    unrejectItem(id) {
      const rejected = view()?.rejected.find((r) => r.item === id && !r.superseded);
      if (rejected === undefined || blocked() || !rejected.unreject.ok) return false;
      return decide([{ item: id, rev: rejected.rev, to: 'in-review' }]);
    },

    acceptSelected() {
      if (blocked()) return false;
      const decisions = get().selectedItems.flatMap((id) => {
        const item = itemOf(id);
        return item === undefined || isHiddenResult(item) ? [] : [{ item: id, rev: item.rev, to: 'accepted' as const }];
      });
      return decide(decisions, { group: true });
    },

    declineSelected(option, note) {
      return declineMany(get().selectedItems, option, note);
    },

    openDeclineMenu(items, origin) {
      if (blocked() || items.length === 0) return;
      set({ declineMenu: { items: [...items], origin, option: null, note: '' } });
    },

    chooseDeclineOption(option) {
      const menu = get().declineMenu;
      if (menu === null) return;
      if (option === 'shaky') {
        set({ declineMenu: { ...menu, option: 'shaky' } });
        return;
      }
      if (option === 'transform') return; // D2-14: disabled until a later slice
      const only = menu.origin === 'item' && menu.items.length === 1 ? menu.items[0] : undefined;
      if (only !== undefined) get().declineItem(only, option);
      else declineMany(menu.items, option, undefined, menu.origin === 'report');
    },

    setDeclineNote(note) {
      const menu = get().declineMenu;
      if (menu !== null) set({ declineMenu: { ...menu, note } });
    },

    confirmDeclineMenu() {
      const menu = get().declineMenu;
      if (menu === null || menu.option !== 'shaky') return false;
      const only = menu.origin === 'item' && menu.items.length === 1 ? menu.items[0] : undefined;
      if (only !== undefined) return get().declineItem(only, 'shaky', menu.note);
      return declineMany(menu.items, 'shaky', menu.note, menu.origin === 'report');
    },

    closeDeclineMenu() {
      if (get().declineMenu !== null) set({ declineMenu: null });
    },

    askMeInstead(step, index) {
      const v = view();
      if (v === null || blocked()) return;
      const entry = v.report.steps.find((s) => s.step === step)?.assumedWithoutAsking?.[index];
      if (entry === undefined) return;
      const items = askMeItems(v, step, entry.items);
      if (items.length === 0) return;
      set({ declineMenu: { items, origin: 'report', option: 'shaky', note: REVIEW_TEXTS.askMeAbout(entry.text), key: `${step}:${index}` } });
    },

    selectReportArrows(target, extra) {
      const v = view();
      if (v === null) return;
      // Slice 2h (§5.4, RV-9): on the Proposed view, where a mid-stage Formalize asks about them (switched to it).
      const overlay = get().overlay;
      if (overlay !== null && overlay.subject === get().subject && !get().proposedView) get().setProposedView(true);
      const nodes = overlay !== null && get().proposedView ? overlay.nodes : get().nodes;
      const question = v.inferences.find((i) => i.target.id === target)?.question.map((c) => ({ source: c.id, target })) ?? [];
      const wanted = [...question, ...(extra !== undefined ? [{ source: extra.source, target: extra.target }] : [])];
      // The selection holds drawn arrows only (slice 1b): those the board on screen draws, once each, and never one of
      // Claude's still undecided (D2-20).
      const drawn = wanted.filter(
        (a, i) =>
          nodes[a.target]?.premises.includes(a.source) === true &&
          !focusesItem(overlay?.proposed.get(`${a.source}->${a.target}`)) &&
          wanted.findIndex((b) => b.source === a.source && b.target === a.target) === i,
      );
      set({ selected: [], selectedArrows: drawn, selectedMarks: [] });
    },

    confirmCascade() {
      const dialog = get().dialog;
      if (dialog?.kind !== 'cascade') return;
      set({ dialog: null });
      if (blocked()) return;
      sendResend(dialog.resend, true);
    },

    openReveal(via, file) {
      const v = view();
      if (v === null || blocked() || v.phase !== 'stage') return;
      if (v.results.shown && via !== 'raw-diff') return;
      set({ dialog: { kind: 'reveal', via, ...(file !== undefined ? { file } : {}) } });
    },

    confirmReveal() {
      const dialog = get().dialog;
      if (dialog?.kind !== 'reveal') return;
      set({ dialog: null });
      const v = view();
      if (v === null || blocked() || v.phase !== 'stage') return;
      if (dialog.via === 'raw-diff') {
        const requestId = track({ action: 'diff', confirmed: true, ...(dialog.file !== undefined ? { file: dialog.file } : {}) });
        post(webviewMessage('openSessionDiff', { runId: v.runId, stage: v.stage, confirmed: true, ...(dialog.file !== undefined ? { file: dialog.file } : {}), requestId }));
        return;
      }
      const requestId = track({ action: 'reveal', confirmed: true });
      post(webviewMessage('revealResult', { runId: v.runId, stage: v.stage, via: dialog.via, requestId }));
    },

    submitReview() {
      const v = view();
      if (v === null || blocked() || v.phase !== 'stage' || !v.submit.gate.ok) return false;
      const requestId = track({ action: 'submit', confirmed: false });
      post(webviewMessage('submitReview', { runId: v.runId, stage: v.stage, requestId }));
      return true;
    },

    openExitSession() {
      const v = view();
      if (v === null || v.phase === 'applying') return;
      set({ dialog: { kind: 'exit-session', ...exitCounts(v) } });
    },

    confirmExitSession() {
      if (get().dialog?.kind === 'exit-session') set({ dialog: null });
      const v = view();
      // Exit always reaches the host (AF14: it can stop a step, even while a decision is on its way), once.
      if (v === null || v.phase === 'applying' || (exiting !== null && pending.has(exiting))) return false;
      const requestId = track({ action: 'end', confirmed: false }, { exit: true });
      exiting = requestId;
      post(webviewMessage('endSession', { runId: v.runId, decision: 'exit', requestId }));
      return true;
    },

    applyEnd() {
      const v = view();
      const c = v?.confirmation;
      if (v === null || c === undefined || blocked() || v.phase !== 'confirming' || !c.apply.ok || c.check.state !== 'passed' || v.drift !== null || v.judging) return false;
      const requestId = track({ action: 'end', confirmed: false });
      post(webviewMessage('endSession', { runId: v.runId, decision: 'apply', stage: v.stage, check: c.check.id, requestId }));
      return true;
    },

    backToReview() {
      const v = view();
      if (v === null || blocked() || v.phase !== 'confirming') return false;
      const requestId = track({ action: 'end', confirmed: false });
      post(webviewMessage('endSession', { runId: v.runId, decision: 'back', stage: v.stage, requestId }));
      return true;
    },

    retryStep() {
      const v = view();
      if (v === null || blocked() || v.phase !== 'stage' || v.heading === null || !v.heading.retry.ok) return false;
      const requestId = track({ action: 'retry', confirmed: false });
      post(webviewMessage('retryStep', { runId: v.runId, requestId }));
      return true;
    },

    openSessionDiff(file) {
      const v = view();
      if (v === null || blocked() || v.phase !== 'stage') return;
      if (!v.results.shown) {
        get().openReveal('raw-diff', file);
        return;
      }
      const requestId = track({ action: 'diff', confirmed: false, ...(file !== undefined ? { file } : {}) });
      post(webviewMessage('openSessionDiff', { runId: v.runId, stage: v.stage, ...(file !== undefined ? { file } : {}), requestId }));
    },

    sessionUndo() {
      const v = view();
      if (v === null || blocked() || v.phase !== 'stage') return;
      if (v.undo === null) {
        if (v.sealed !== null) get().pushToast('info', REVIEW_TEXTS.sealed);
        return;
      }
      sendResend({ kind: 'undo', runId: v.runId, step: v.undo.step }, false);
    },

    sessionRedo() {
      const v = view();
      if (v === null || blocked() || v.phase !== 'stage' || v.redo === null) return;
      sendResend({ kind: 'redo', runId: v.runId, step: v.redo.step }, false);
    },

    formalizeInStage(inferences) {
      const v = view();
      if (v === null || blocked() || v.phase !== 'stage' || inferences.length === 0 || inferences.length > LIMITS.inferences) return false;
      const requestId = track({ action: 'formalize', confirmed: false });
      post(webviewMessage('formalize', { inferences: inferences.map((i) => ({ target: i.target, premises: [...i.premises] })), runId: v.runId, stage: v.stage, requestId }));
      return true;
    },

    moveProposedCards(positions) {
      const v = view();
      const overlay = get().overlay;
      if (v === null || overlay === null || blocked() || v.phase !== 'stage') return false;
      const limit = LIMITS.coordinate;
      const clamp = (n: number) => Math.max(-limit, Math.min(limit, n));
      const moved = Object.entries(positions)
        .filter(([id, p]) => overlay.nodes[id]?.type === 'PROPOSITION' && Number.isFinite(p.x) && Number.isFinite(p.y))
        .slice(0, LIMITS.listLength)
        .map(([id, p]): [string, CanvasPosition] => [id, { x: clamp(p.x), y: clamp(p.y) }]);
      if (moved.length === 0) return false;
      const back: Record<string, CanvasPosition | null> = {};
      for (const [id] of moved) back[id] = overlay.positions[id] ?? null;
      set({ overlay: { ...overlay, positions: { ...overlay.positions, ...Object.fromEntries(moved) } } });
      const requestId = track({ action: 'move', confirmed: false });
      moves.set(requestId, { back });
      post(webviewMessage('moveProposed', { runId: v.runId, positions: Object.fromEntries(moved), requestId }));
      return true;
    },

    acceptGroup(ids) {
      if (blocked()) return false;
      const decisions = [...new Set(ids)].flatMap((id) => {
        const item = itemOf(id);
        return item === undefined || isHiddenResult(item) ? [] : [{ item: id, rev: item.rev, to: 'accepted' as const }];
      });
      return decide(decisions, { group: true, keepSelection: true });
    },

    pressReviewKey(event) {
      const s = get();
      const r = s.sessionReview;
      if (s.session === null || r === null) return false;
      const item = itemOf(r.current) ?? null;
      const action = reviewKey(event, { item, menuOpen: s.declineMenu !== null });
      if (action === null) return false;
      switch (action.kind) {
        case 'move':
          s.moveCurrent(action.to);
          return true;
        case 'toggle-select':
          if (r.current !== null) s.toggleItemSelected(r.current);
          return true;
        case 'accept':
          if (r.current !== null) s.acceptItem(r.current, action.next);
          return true;
        case 'decline-now':
          if (r.current !== null) s.declineItem(r.current, 'plain');
          return true;
        case 'decline-menu':
          if (r.current !== null && item !== null && item.decline.ok) s.openDeclineMenu([r.current], 'item');
          return true;
        case 'menu-option':
          s.chooseDeclineOption(action.option);
          return true;
        case 'open-detail':
          s.setReviewPane('detail');
          return true;
        case 'escape':
          if (s.declineMenu !== null) s.closeDeclineMenu();
          else if (s.selectedItems.length > 0) s.clearItemSelection();
          else return false;
          return true;
        case 'undo':
          s.sessionUndo();
          return true;
        case 'redo':
          s.sessionRedo();
          return true;
      }
    },
  };

  /** §5.2: when a `session` message arrives. */
  const receive = (next: SessionView | null) => {
    const s = get();
    const prev = s.session;
    if (next === null) {
      if (prev === null && s.sessionReview === null) return;
      // Slice 2h: no session, no Proposed view (M2's proposal overlay is retired).
      moves.clear();
      set({
        session: null,
        sessionReview: null,
        selectedItems: [],
        sessionBusy: null,
        declineMenu: null,
        ...(isSessionDialog(s.dialog) ? { dialog: null } : {}),
        overlay: null,
        proposedView: false,
      });
      return;
    }
    const newRun = prev === null || prev.runId !== next.runId;
    let review = s.sessionReview;
    if (review === null || review.runId !== next.runId) {
      // A new run resets the review UI; the persisted one counts only for its own run (ES-6).
      const kept = persisted !== undefined && persisted.runId === next.runId ? persisted : undefined;
      persisted = undefined;
      review = { runId: next.runId, current: kept?.current ?? null, filter: kept?.filter ?? 'all', pane: 'list', explicit: {}, seenEvent: 0, lastGroup: null };
    }
    const exists = (id: string) => next.items.some((i) => i.id === id);
    const selectable = (id: string) => next.items.some((i) => i.id === id && !isHiddenResult(i));
    // A new stage keeps `current` while that item exists; else the first item in review (§5.2).
    const current = review.current !== null && exists(review.current) ? review.current : firstInReview(next.items);
    const newStage = !newRun && prev !== null && prev.stage !== next.stage;
    const explicit = Object.fromEntries(Object.keys(review.explicit).filter(exists).map((id) => [id, true as const]));
    const nextReview: SessionReviewUi = { ...review, current, explicit, ...(newStage ? { lastGroup: null } : {}) };
    const readOnly = readOnlyReason(next) !== null;
    const menu = s.declineMenu !== null && !newRun && !readOnly && s.declineMenu.items.every(selectable) ? s.declineMenu : null;
    let dialog = s.dialog;
    if (isSessionDialog(dialog)) {
      const d = dialog;
      const stale =
        newRun ||
        (d.kind === 'hold-as' && (readOnly || next.items.find((i) => i.id === d.item)?.status !== 'in-review')) ||
        (d.kind === 'reveal' && (next.phase !== 'stage' || (next.results.shown && d.via !== 'raw-diff'))) ||
        (d.kind === 'cascade' && readOnly);
      if (stale) dialog = null;
      // Exit's dialog counts what Exit would discard now (listed items only); none while Apply runs.
      else if (d.kind === 'exit-session') dialog = next.phase === 'applying' ? null : { kind: 'exit-session', ...exitCounts(next) };
    }
    // The first stage switches the board to Proposed, as a new proposal did (unless a drag or an edit is under way).
    const firstStage = next.stage >= 1 && (prev === null || newRun || prev.stage === 0);
    const show = firstStage && next.subject === s.subject && s.drag === null && s.editing === null;
    // Slice 2h: a move shown before the host answered stays shown until its answer comes (the host's board then has it).
    const built = sessionOverlay(next, ctx.current());
    const shown = withMovesShown(built, s.overlay);
    // Slice 2h: on the Proposed view the selection is the session board's: what it no longer draws leaves it, and so
    // does Claude's arrow that is undecided again (D2-20).
    // (The first stage's switch to Proposed counts: what the Current board selected and Proposed does not draw leaves.)
    const onProposed = (s.proposedView || show) && built.subject === s.subject;
    const arrows = onProposed
      ? s.selectedArrows.filter((a) => built.nodes[a.target]?.premises.includes(a.source) === true && built.nodes[a.source] !== undefined && !focusesItem(built.proposed.get(`${a.source}->${a.target}`)))
      : s.selectedArrows;
    const marks = onProposed ? s.selectedMarks.filter((id) => built.nodes[id]?.fromNothing === true) : s.selectedMarks;
    set({
      session: next,
      sessionReview: nextReview,
      selectedItems: newRun ? [] : s.selectedItems.filter(selectable),
      declineMenu: menu,
      dialog,
      overlay: shown,
      ...(arrows.length !== s.selectedArrows.length ? { selectedArrows: arrows } : {}),
      ...(marks.length !== s.selectedMarks.length ? { selectedMarks: marks } : {}),
      ...(newRun ? { sessionBusy: null } : {}),
      ...(show ? { proposedView: true, overAxioms: null, runPanelOpen: true } : {}),
    });
    if (newRun || nextReview.current !== review.current) persistUi(nextReview);
  };

  /** The host's answer to a session request (§5.1: decisions are not optimistic). */
  const result = (requestId: string, outcome: ActionOutcome): boolean => {
    const entry = pending.get(requestId);
    if (entry === undefined) return false;
    pending.delete(requestId);
    // Slice 2h: a refused move goes back to where it was (an accepted one is the host's board from now on).
    const move = moves.get(requestId);
    moves.delete(requestId);
    const overlay = get().overlay;
    if (move !== undefined && !outcome.ok && overlay !== null) {
      const positions = { ...overlay.positions };
      for (const [id, was] of Object.entries(move.back)) {
        if (was === null) delete positions[id];
        else positions[id] = was;
      }
      set({ overlay: { ...overlay, positions } });
    }
    if (exiting === requestId) exiting = null;
    if (get().sessionBusy?.requestId === requestId) {
      const exit = exiting === null ? undefined : pending.get(exiting);
      set({ sessionBusy: exiting === null || exit === undefined ? null : busyOf(exiting, exit) });
    }
    const resend = entry.resend;
    if (outcome.ok) {
      if (resend?.kind === 'decide' && resend.group) {
        const v = view();
        const left = [...resend.localLeft, ...(outcome.review?.left ?? [])];
        setUi({ lastGroup: v === null ? null : leftNote(v.items, left) });
        if (resend.keepSelection !== true) set({ selectedItems: [] });
      }
      return true;
    }
    if (outcome.code === 'needs-confirmation') {
      if (resend !== undefined && !entry.confirmed) {
        set({ dialog: { kind: 'cascade', lead: leadOf(resend), cascade: [...(outcome.cascade ?? [])], hiddenResults: outcome.hiddenResults === true, resend } });
        return true;
      }
      if (entry.action === 'diff' && outcome.reveal === true && !entry.confirmed) {
        set({ dialog: { kind: 'reveal', via: 'raw-diff', ...(entry.file !== undefined ? { file: entry.file } : {}) } });
        return true;
      }
    }
    // Refused (D2-62), a conflict ("“‹item›” changed since you looked at it: look again."), or anything else.
    if (resend?.kind === 'decide' && resend.back !== undefined && itemOf(resend.back) !== undefined) setUi({ current: resend.back });
    errorToast(outcome);
    return true;
  };

  return { slice, receive, result, overlayOf: (v, current) => withMovesShown(sessionOverlay(v, current), get().overlay) };
}

/** The entries of `record` named in `ids` (those it has). */
function pick<T>(record: Readonly<Record<string, T>>, ids: readonly string[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const id of ids) if (Object.hasOwn(record, id)) out[id] = record[id] as T;
  return out;
}
