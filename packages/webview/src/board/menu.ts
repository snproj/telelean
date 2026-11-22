/**
 * The right-click menu's model (spec v4 CM-7; slice 1c): what a right click selects first, and which actions the menu
 * lists for the thing under the pointer. Pure, so the rules are unit-tested; board/ContextMenu.tsx renders it.
 *
 * The thing can be a card, an arrow, a "follows from nothing" mark or the empty canvas. It is selected first, unless
 * it is already part of the selection, with two exceptions: a right click on a card while other cards are selected
 * keeps the selection (the clicked card is the target of "Draw arrows from the selection"), and a right click on empty
 * canvas keeps the selection. The Proposed view is read-only: a right click never changes its selection.
 *
 * The actions are those the board has today (1b's arrow actions, Move to axioms, Show on board, Open in editor, the
 * expanded card's Edit, Add why and Delete), plus, on empty canvas, New proposition here, Fit all and Tidy layout.
 * While an edit session is active (ES-9, slice 1f) every action that would change the board is listed disabled, with
 * the session's reason; viewing actions stay.
 *
 * Slice 1c2: an arrow a proof uses although nobody drew it (TL107, the warning colour) is not selectable, but it has a
 * menu (`undeclared`): "Draw this arrow" (it becomes a declared arrow, AR-1) and Show for both ends. Its right click
 * keeps the selection.
 *
 * Slice 1e (spec v4.1 CM-7: "the Context Menu's actions for what is under it"): a drawn arrow's and a mark's menus
 * start with **Formalize for dependencies**, enabled or disabled exactly as the header's Context Menu section shows it
 * (board/contextActions.ts `formalizeState`, on the selection the right click made); the section shows a selected
 * card's actions from `cardActions`, so both share one action model.
 *
 * Slice 2h (§5.10): the Proposed view is an edit session's. A right click selects there as on the Current board; a
 * card's menu offers Select incoming arrows, its review items ("Show its review item: ‹kind›"), Show on board and Open
 * in editor ("Opens your file; Claude's version is in the raw diff", the card's place in the Current graph; disabled
 * for a card that exists only in the session), its editing entries disabled with 1f's and 1c2's reasons; Formalize is
 * a mid-stage Formalize. Claude's arrow still undecided (`proposed`) offers Accept, Decline…, Show its review item,
 * Show “source” and Show “target”.
 */
import { DECLINE_OPTION_TEXTS, ITEM_KIND_LABELS, REVIEW_TEXTS, type ArrowEnds, type CanvasPosition, type ItemView, type SessionPhase, type SourceLocation, type TlNode } from '@telelean/core';
import { itemControls, readOnlyReason } from '../model/review';
import type { CardMark } from '../model/sessionBoard';
import type { FormalizeState } from './contextActions';

export type MenuThing =
  | { kind: 'card'; id: string }
  | { kind: 'arrow'; source: string; target: string }
  /** Slice 1c2: an arrow a proof uses without a declaration (TL107): its menu only. */
  | { kind: 'undeclared'; source: string; target: string }
  | { kind: 'mark'; id: string }
  | { kind: 'canvas'; at: CanvasPosition }
  /** Slice 2h: Claude's arrow still undecided in a session's Proposed view (its menu only; never selected). */
  | { kind: 'proposed'; item: string; source: string; target: string };

/** What a right click does to the selection before the menu opens. */
export type MenuSelection = { kind: 'keep' } | { kind: 'card'; id: string } | { kind: 'arrow'; source: string; target: string } | { kind: 'mark'; id: string };

export interface SelectionState {
  selected: readonly string[];
  selectedArrows: readonly ArrowEnds[];
  selectedMarks: readonly string[];
}

/** CM-7's selection rule (see the module comment). `readOnly`: the Proposed view (nothing is selected there). */
export function menuSelection(state: SelectionState, thing: MenuThing, readOnly = false): MenuSelection {
  if (readOnly) return { kind: 'keep' };
  switch (thing.kind) {
    case 'card':
      // Already selected, or other cards are selected (they become the sources of "Draw arrows from the selection").
      if (state.selected.length > 0) return { kind: 'keep' };
      return { kind: 'card', id: thing.id };
    case 'arrow':
      return state.selectedArrows.some((a) => a.source === thing.source && a.target === thing.target)
        ? { kind: 'keep' }
        : { kind: 'arrow', source: thing.source, target: thing.target };
    case 'mark':
      return state.selectedMarks.includes(thing.id) ? { kind: 'keep' } : { kind: 'mark', id: thing.id };
    case 'undeclared':
      // Not selectable (CF-7: a proof's use without a declaration is derived): only its menu opens.
      return { kind: 'keep' };
    case 'proposed':
      // Slice 2h (§5.10, D2-20): Claude's arrow is not selectable until accepted; only its menu opens.
      return { kind: 'keep' };
    case 'canvas':
      return { kind: 'keep' };
  }
}

export type MenuAction =
  /** Slice 1e: Formalize for dependencies on the selection (spec v4.1 ES-2). */
  | 'formalize'
  | 'draw-from-selection'
  | 'draw-this-arrow'
  | 'from-nothing'
  | 'remove-from-nothing'
  | 'select-incoming'
  | 'mark-pending'
  | 'legacy-make-proposition'
  | 'legacy-drop-arrows'
  | 'move-to-axioms'
  | 'show'
  | 'details'
  | 'open'
  | 'edit'
  | 'why'
  | 'delete'
  | 'remove-arrows'
  | 'show-source'
  | 'show-target'
  | 'remove-mark'
  | 'new-here'
  | 'fit'
  | 'tidy'
  // Slice 2h (§5.10): a review item's actions in a session's Proposed view.
  | 'accept-item'
  | 'decline-item'
  | 'show-item';

export interface MenuEntry {
  action: MenuAction;
  label: string;
  /** Why it cannot be chosen now (its tooltip), or null. */
  disabled: string | null;
  /** A separator line goes above it. */
  group?: true;
  /** Slice 2h: the review item it is about (`accept-item`, `decline-item`, `show-item`). */
  item?: string;
  /** Slice 2h: its tooltip when it can be chosen ("Open in editor" in the Proposed view). */
  title?: string;
}

/** Slice 2h: what a session's Proposed view adds to the menus (§5.10). */
export interface MenuReview {
  items: readonly ItemView[];
  /** The session's phase (D2-62: nothing is decided while Claude's step runs). */
  phase: SessionPhase;
  /** A session request is on its way (one at a time). */
  busy: boolean;
  /** Listed items per card (the card marks). */
  marks: Readonly<Record<string, readonly CardMark[]>>;
  /** Each card's place in the user's files (the Current graph's): "Open in editor" opens it. */
  locations: Readonly<Record<string, SourceLocation>>;
}

export interface MenuContext {
  /** The cards on screen (the current board, or the proposal's in the Proposed view). */
  nodes: Readonly<Record<string, TlNode>>;
  selected: readonly string[];
  selectedArrows: readonly ArrowEnds[];
  /** The selected "follows from nothing" marks (card ids): a Delete of the selection removes them with the arrows. */
  selectedMarks: readonly string[];
  expanded: Readonly<Record<string, true>>;
  provisional: Readonly<Record<string, true>>;
  /** ES-9 (slice 1f): why the Current board cannot be edited now, or null. */
  lock: string | null;
  /** The Proposed view is on screen (read-only). */
  proposed: boolean;
  /**
   * Slice 1e: Formalize for dependencies on the selection (contextActions.ts `formalizeState`); a drawn arrow's and a
   * mark's menus list it first. Absent: not offered.
   */
  formalize?: FormalizeState;
  /** Slice 2h: the session's review, when the Proposed view is on screen (absent otherwise). */
  review?: MenuReview;
}

/** Slice 1e: the labelled button's words (spec v4.1 CM-3), in the Context Menu section and the right-click menu. */
export const FORMALIZE_LABEL = 'Formalize for dependencies';

/** The reason the Proposed view's arrow actions are disabled (the store's PROPOSED_ARROWS_LOCKED). */
export const MENU_PROPOSED_ARROWS = 'Arrows change only through review items and transforms.';
/**
 * The reason the Proposed view's other edits (a new card, a field) are disabled. Slice 2h: worded for the session, since
 * M2's Accept and Discard are retired (builder 2h).
 */
export const MENU_PROPOSED_READ_ONLY = "This is the edit session's Proposed view: your board can be edited again once the session ends (Apply or Exit).";
/** A card the host has not written yet. */
export const MENU_PROVISIONAL = 'Waiting for the extension to write this card.';

/** A card's sentence in a menu label (cut near 40 characters, like the board's other two-card texts). */
export function menuName(nodes: Readonly<Record<string, TlNode>>, id: string): string {
  const chars = Array.from((nodes[id]?.naturalName ?? id).replace(/\s+/g, ' ').trim());
  return chars.length <= 40 ? chars.join('') : `${chars.slice(0, 39).join('')}…`;
}

/**
 * The words of "remove the selection" for an arrow or a mark that is part of it. The entry removes every selected
 * arrow and mark at once (the store's deleteSelectedArrows: one plan, one Undo step), so it names them all, as core's
 * plan label counts them: "Remove arrow", "Remove 2 arrows", "Remove 'follows from nothing'", "Remove 2 'follows from
 * nothing' marks", "Remove 2 arrows and 1 'follows from nothing' mark".
 */
export function removeSelectionLabel(arrows: number, marks: number): string {
  const markWords = marks === 1 ? "1 'follows from nothing' mark" : `${marks} 'follows from nothing' marks`;
  if (marks === 0) return arrows === 1 ? 'Remove arrow' : `Remove ${arrows} arrows`;
  if (arrows === 0) return marks === 1 ? "Remove 'follows from nothing'" : `Remove ${markWords}`;
  return `Remove ${arrows === 1 ? '1 arrow' : `${arrows} arrows`} and ${markWords}`;
}

/** Whether "Mark pending" (AR-8) applies: a formalised proposition with a Lean statement and no `.holds`. */
export function canMarkPending(node: TlNode): boolean {
  return node.type === 'PROPOSITION' && node.status.formal === 'formalized' && node.lean.statement !== undefined && node.lean.justification === undefined;
}

/** A card's actions (its right-click menu; the Context Menu section shows them for one selected card, slice 1e). */
export function cardActions(id: string, ctx: MenuContext): MenuEntry[] {
  const node = ctx.nodes[id];
  if (!node) return [];
  const out: MenuEntry[] = [];
  const provisional = ctx.provisional[id] === true;
  const isProposition = node.type === 'PROPOSITION';
  const arrowsIn = node.premises.length;
  const marked = node.fromNothing === true;
  const declaredBefore = !isProposition && arrowsIn > 0;
  const sources = ctx.selected.filter((x) => x !== id && ctx.nodes[x] !== undefined && !ctx.provisional[x]);
  /** An action that changes the Current board: disabled while locked, in the Proposed view, or on a provisional card. */
  const edit = (proposedReason: string) => (ctx.proposed ? proposedReason : (ctx.lock ?? (provisional ? MENU_PROVISIONAL : null)));

  if (ctx.proposed) {
    // As the expanded card's read-only actions: shown, disabled, with the reason.
    if (sources.length > 0) out.push({ action: 'draw-from-selection', label: 'Draw arrows from the selection', disabled: MENU_PROPOSED_ARROWS });
    if (marked) out.push({ action: 'remove-from-nothing', label: "Remove 'follows from nothing'", disabled: MENU_PROPOSED_ARROWS });
    else if (!isProposition || arrowsIn === 0) out.push({ action: 'from-nothing', label: 'Follows from nothing', disabled: MENU_PROPOSED_ARROWS });
    // Slice 2h (§5.10, RV-9): the Proposed view selects, so a mid-stage Formalize can take a card's arrows.
    if (ctx.review !== undefined && isProposition && (arrowsIn > 0 || marked)) out.push({ action: 'select-incoming', label: 'Select incoming arrows', disabled: null });
    if (isProposition) out.push({ action: 'move-to-axioms', label: 'Move to axioms', disabled: MENU_PROPOSED_ARROWS });
    // Slice 2h: the card's review items (a click on its mark does the same).
    const marks = ctx.review?.marks[id] ?? [];
    marks.forEach((m, i) =>
      out.push({ action: 'show-item', label: `${REVIEW_TEXTS.showReviewItem}: ${ITEM_KIND_LABELS[m.kind]}`, disabled: null, item: m.item, ...(i === 0 ? { group: true as const } : {}) }),
    );
    out.push({ action: 'show', label: 'Show on board', disabled: null, group: true });
    out.push({ action: 'details', label: ctx.expanded[id] ? 'Hide details' : 'Show details', disabled: null });
    // Slice 2h (§5.10): the card's place in the user's files; Claude's version is in the raw diff.
    if (ctx.review !== undefined) {
      const placed = ctx.review.locations[id] !== undefined;
      out.push({ action: 'open', label: 'Open in editor', disabled: placed ? null : REVIEW_TEXTS.openInEditorDisabled, ...(placed ? { title: REVIEW_TEXTS.openInEditorTip } : {}) });
    }
    return out;
  }

  // CM-7: other cards selected: the clicked card is the target of arrows from them (AR-1).
  if (sources.length > 0) out.push({ action: 'draw-from-selection', label: sources.length === 1 ? 'Draw an arrow from the selection' : `Draw ${sources.length} arrows from the selection`, disabled: edit(MENU_PROPOSED_ARROWS) });
  if (isProposition) {
    if (arrowsIn === 0 && !marked) out.push({ action: 'from-nothing', label: 'Follows from nothing', disabled: edit(MENU_PROPOSED_ARROWS) });
    if (marked) out.push({ action: 'remove-from-nothing', label: "Remove 'follows from nothing'", disabled: edit(MENU_PROPOSED_ARROWS) });
    // Only a selection: allowed on a locked board (slice 1f).
    if (arrowsIn > 0 || marked) out.push({ action: 'select-incoming', label: 'Select incoming arrows', disabled: provisional ? MENU_PROVISIONAL : null });
    if (canMarkPending(node)) out.push({ action: 'mark-pending', label: 'Mark pending', disabled: edit(MENU_PROPOSED_READ_ONLY) });
    out.push({ action: 'move-to-axioms', label: 'Move to axioms', disabled: edit(MENU_PROPOSED_ARROWS) });
  } else if (declaredBefore) {
    out.push({ action: 'legacy-make-proposition', label: 'Make it a proposition (pending)', disabled: edit(MENU_PROPOSED_ARROWS) });
    out.push({ action: 'legacy-drop-arrows', label: 'Drop these arrows', disabled: edit(MENU_PROPOSED_ARROWS) });
  } else if (!marked) {
    out.push({ action: 'from-nothing', label: 'Follows from nothing', disabled: edit(MENU_PROPOSED_ARROWS) });
  }
  out.push({ action: 'show', label: 'Show on board', disabled: null, group: true });
  out.push({ action: 'details', label: ctx.expanded[id] ? 'Hide details' : 'Show details', disabled: null });
  if (node.loc) out.push({ action: 'open', label: 'Open in editor', disabled: null });
  out.push({ action: 'edit', label: 'Edit sentence', disabled: edit(MENU_PROPOSED_READ_ONLY), group: true });
  out.push({ action: 'why', label: node.rationale ? 'Edit why' : 'Add why', disabled: edit(MENU_PROPOSED_READ_ONLY) });
  out.push({ action: 'delete', label: 'Delete…', disabled: edit(MENU_PROPOSED_READ_ONLY) });
  return out;
}

/**
 * Slice 1e: the Formalize entry of a drawn arrow's or a mark's menu (the thing is part of the selection by then, CM-7):
 * as the Context Menu section shows it; in the Proposed view (read-only) with its reason.
 */
function formalizeEntries(ctx: MenuContext): MenuEntry[] {
  if (ctx.formalize === undefined) return [];
  // Slice 2h: in a session's Proposed view it is a mid-stage Formalize (formalizeState knows the session's reasons).
  return [{ action: 'formalize', label: FORMALIZE_LABEL, disabled: ctx.proposed && ctx.review === undefined ? MENU_PROPOSED_ARROWS : ctx.formalize.disabled }];
}

/**
 * Slice 2h (§5.10): Claude's arrow still undecided: Accept (its own Accept: the menu names this one item, as the
 * detail's Accept does), Decline… (an arrow's one plain decline, DO-0), Show its review item, and both ends.
 */
function proposedEntries(thing: Extract<MenuThing, { kind: 'proposed' }>, ctx: MenuContext): MenuEntry[] {
  const review = ctx.review;
  const item = review?.items.find((i) => i.id === thing.item);
  const missing = REVIEW_TEXTS.conflict(thing.item);
  const controls = item !== undefined && review !== undefined ? itemControls(item, { phase: review.phase }, review.busy) : undefined;
  const reason = (c: { enabled: boolean; title: string } | undefined) => (c === undefined ? missing : c.enabled ? null : c.title);
  const acceptOff = item !== undefined && item.status !== 'in-review' ? (readOnlyReason({ phase: review?.phase ?? 'stage' }) ?? REVIEW_TEXTS.leftNotInReview(item.label)) : reason(controls?.accept);
  // D2-35: an Add premise draft's "+" arrow (from its "Claude suggests" card): decided only in the list.
  if (item?.kind === 'add-premise') {
    return [
      { action: 'show-item', label: REVIEW_TEXTS.showReviewItem, disabled: null, item: thing.item },
      { action: 'show-target', label: `Show “${menuName(ctx.nodes, thing.target)}”`, disabled: null, group: true },
    ];
  }
  return [
    { action: 'accept-item', label: REVIEW_TEXTS.accept, disabled: acceptOff, item: thing.item },
    { action: 'decline-item', label: `${DECLINE_OPTION_TEXTS.plain}…`, disabled: reason(controls?.decline), item: thing.item },
    { action: 'show-item', label: REVIEW_TEXTS.showReviewItem, disabled: item === undefined ? REVIEW_TEXTS.conflict(thing.item) : null, item: thing.item, group: true },
    { action: 'show-source', label: `Show “${menuName(ctx.nodes, thing.source)}”`, disabled: null, group: true },
    { action: 'show-target', label: `Show “${menuName(ctx.nodes, thing.target)}”`, disabled: null },
  ];
}

/** The menu for the thing under the pointer (after `menuSelection` was applied). */
export function menuEntries(thing: MenuThing, ctx: MenuContext): MenuEntry[] {
  const write = (proposedReason: string) => (ctx.proposed ? proposedReason : ctx.lock);
  switch (thing.kind) {
    case 'card':
      return cardActions(thing.id, ctx);
    case 'arrow': {
      // Part of the selection: the entry removes the whole selection (arrows and marks), so its label counts it all.
      // (The Proposed view selects nothing and removes nothing: its entry is disabled and names this arrow only.)
      const inSelection = !ctx.proposed && ctx.selectedArrows.some((a) => a.source === thing.source && a.target === thing.target);
      const label = inSelection ? removeSelectionLabel(ctx.selectedArrows.length, ctx.selectedMarks.length) : 'Remove arrow';
      // Slice 2h: an accepted Claude arrow in the Proposed view also shows its review item.
      const accepted = ctx.review?.items.find((i) => i.kind === 'add-arrow' && i.detail.kind === 'add-arrow' && i.detail.source.id === thing.source && i.detail.target.id === thing.target);
      return [
        ...formalizeEntries(ctx),
        { action: 'remove-arrows', label, disabled: write(MENU_PROPOSED_ARROWS) },
        { action: 'select-incoming', label: `Select the arrows into “${menuName(ctx.nodes, thing.target)}”`, disabled: ctx.proposed && ctx.review === undefined ? MENU_PROPOSED_ARROWS : null },
        ...(accepted !== undefined ? [{ action: 'show-item' as const, label: REVIEW_TEXTS.showReviewItem, disabled: null, item: accepted.id, group: true as const }] : []),
        { action: 'show-source', label: `Show “${menuName(ctx.nodes, thing.source)}”`, disabled: null, group: true },
        { action: 'show-target', label: `Show “${menuName(ctx.nodes, thing.target)}”`, disabled: null },
      ];
    }
    case 'proposed':
      return proposedEntries(thing, ctx);
    case 'undeclared':
      // AR-1, A16, A20: drawing it makes the proof's use a declared arrow (into an axiom: AR-6's dialog first).
      return [
        { action: 'draw-this-arrow', label: 'Draw this arrow', disabled: write(MENU_PROPOSED_ARROWS) },
        { action: 'show-source', label: `Show “${menuName(ctx.nodes, thing.source)}”`, disabled: null, group: true },
        { action: 'show-target', label: `Show “${menuName(ctx.nodes, thing.target)}”`, disabled: null },
      ];
    case 'mark':
      return [
        ...formalizeEntries(ctx),
        {
          action: 'remove-mark',
          label: !ctx.proposed && ctx.selectedMarks.includes(thing.id) ? removeSelectionLabel(ctx.selectedArrows.length, ctx.selectedMarks.length) : "Remove 'follows from nothing'",
          disabled: write(MENU_PROPOSED_ARROWS),
        },
        { action: 'show', label: 'Show on board', disabled: null, group: true },
      ];
    case 'canvas': {
      const tidied = ctx.selected.filter((id) => ctx.nodes[id]?.type === 'PROPOSITION').length;
      // Slice 2h (D2-33): in a session's Proposed view Tidy layout is a move, one session step (refused while a step runs).
      const tidy = ctx.proposed && ctx.review !== undefined ? (readOnlyReason({ phase: ctx.review.phase }) ?? (ctx.review.phase === 'stage' ? null : REVIEW_TEXTS.formalizeConfirming)) : write(MENU_PROPOSED_READ_ONLY);
      return [
        { action: 'new-here', label: 'New proposition here', disabled: write(MENU_PROPOSED_READ_ONLY) },
        { action: 'fit', label: 'Fit all', disabled: null, group: true },
        { action: 'tidy', label: tidied > 0 ? `Tidy layout (${tidied} selected)` : 'Tidy layout', disabled: tidy },
      ];
    }
  }
}
