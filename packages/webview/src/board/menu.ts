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
 */
import type { ArrowEnds, CanvasPosition, TlNode } from '@telelean/core';
import type { FormalizeState } from './contextActions';

export type MenuThing =
  | { kind: 'card'; id: string }
  | { kind: 'arrow'; source: string; target: string }
  /** Slice 1c2: an arrow a proof uses without a declaration (TL107): its menu only. */
  | { kind: 'undeclared'; source: string; target: string }
  | { kind: 'mark'; id: string }
  | { kind: 'canvas'; at: CanvasPosition };

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
  | 'tidy';

export interface MenuEntry {
  action: MenuAction;
  label: string;
  /** Why it cannot be chosen now (its tooltip), or null. */
  disabled: string | null;
  /** A separator line goes above it. */
  group?: true;
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
}

/** Slice 1e: the labelled button's words (spec v4.1 CM-3), in the Context Menu section and the right-click menu. */
export const FORMALIZE_LABEL = 'Formalize for dependencies';

/** The reason the Proposed view's arrow actions are disabled (the store's PROPOSED_ARROWS_LOCKED). */
export const MENU_PROPOSED_ARROWS = 'Arrows change only through review items and transforms.';
/** The reason the Proposed view's other edits (a new card, a move, Tidy layout) are disabled. */
export const MENU_PROPOSED_READ_ONLY = "This is Claude's proposal (read-only): your board can be edited again once you accept or discard it.";
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
    if (isProposition) out.push({ action: 'move-to-axioms', label: 'Move to axioms', disabled: MENU_PROPOSED_ARROWS });
    out.push({ action: 'show', label: 'Show on board', disabled: null, group: true });
    out.push({ action: 'details', label: ctx.expanded[id] ? 'Hide details' : 'Show details', disabled: null });
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
  return [{ action: 'formalize', label: FORMALIZE_LABEL, disabled: ctx.proposed ? MENU_PROPOSED_ARROWS : ctx.formalize.disabled }];
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
      return [
        ...formalizeEntries(ctx),
        { action: 'remove-arrows', label, disabled: write(MENU_PROPOSED_ARROWS) },
        { action: 'select-incoming', label: `Select the arrows into “${menuName(ctx.nodes, thing.target)}”`, disabled: ctx.proposed ? MENU_PROPOSED_ARROWS : null },
        { action: 'show-source', label: `Show “${menuName(ctx.nodes, thing.source)}”`, disabled: null, group: true },
        { action: 'show-target', label: `Show “${menuName(ctx.nodes, thing.target)}”`, disabled: null },
      ];
    }
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
      return [
        { action: 'new-here', label: 'New proposition here', disabled: write(MENU_PROPOSED_READ_ONLY) },
        { action: 'fit', label: 'Fit all', disabled: null, group: true },
        { action: 'tidy', label: tidied > 0 ? `Tidy layout (${tidied} selected)` : 'Tidy layout', disabled: write(MENU_PROPOSED_READ_ONLY) },
      ];
    }
  }
}
