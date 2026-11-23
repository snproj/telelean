/**
 * What an action of the right-click menu (CM-7) or of the Context Menu section (CM-1–CM-5, slice 1e) does: one runner
 * for both, so the two never drift apart. `thing` is what the action is about: the thing under the pointer for the
 * menu; for the section, the one selected card (its actions), or null (Formalize and Delete act on the selection).
 * Slice 2h (§5.10): a session's Proposed view adds a review item's actions (`entry.item`): Accept (its own Accept, as
 * the detail's: the menu names this one item), Decline… (an arrow's plain decline, DO-0), Show its review item; and
 * "Open in editor" opens the card's place in the user's files (the Current graph's: the session's graph has none).
 */
import type { TlNode } from '@telelean/core';
import { proposedOverlay, type BoardActions, type BoardStore } from '../state/store';
import type { CanvasView } from './canvas/CanvasView';
import { tidyLayout } from './CanvasToolbar';
import type { ContextAction } from './contextActions';
import type { MenuEntry, MenuThing } from './menu';

export interface ActionDeps {
  actions: BoardActions;
  store: BoardStore;
  /** The cards on screen (the Current board's, or the proposal's in the Proposed view). */
  nodes: Readonly<Record<string, TlNode>>;
  /** The canvas, for Fit all and Tidy layout (the right-click menu only). */
  canvas?: CanvasView;
}

export function runBoardAction(action: ContextAction, thing: MenuThing | null, deps: ActionDeps, entry?: Pick<MenuEntry, 'item'>): void {
  const { actions, store, nodes, canvas } = deps;
  const cardId =
    thing === null
      ? null
      : thing.kind === 'card' || thing.kind === 'mark'
        ? thing.id
        : thing.kind === 'arrow' || thing.kind === 'undeclared' || thing.kind === 'proposed'
          ? thing.target
          : null;
  const node = cardId ? nodes[cardId] : undefined;
  const item = entry?.item ?? (thing?.kind === 'proposed' ? thing.item : undefined);
  switch (action) {
    case 'accept-item':
      if (item !== undefined) actions.acceptItem(item);
      return;
    case 'decline-item': {
      // Every decline takes an optional note for Claude (2j2, D2-92, D2-94): an arrow item's one "Decline" opens its
      // arrow-only decline menu, with Decline already chosen, like any other item's menu (fixer 2j2 r1, F-F1).
      if (item === undefined) return;
      actions.focusItem(item);
      actions.openDeclineMenu([item], 'item');
      return;
    }
    case 'show-item':
      if (item !== undefined) actions.focusItem(item);
      return;
    case 'formalize':
      // Slice 1e: the selection is the question (the right click selected the arrow or mark first, CM-7).
      actions.formalize();
      return;
    case 'remove-selection':
      // The section's Delete: the selected arrows and marks, one Undo step (AR-1).
      actions.deleteSelectedArrows();
      return;
    case 'draw-from-selection':
      if (cardId) actions.drawArrowsFromSelection(cardId);
      return;
    case 'draw-this-arrow':
      // Slice 1c2: a proof's use nobody drew becomes a drawn arrow (AR-1; into an axiom, AR-6's dialog first).
      if (thing?.kind === 'undeclared') actions.addArrows(thing.target, [thing.source]);
      return;
    case 'from-nothing':
      if (cardId) actions.setFromNothing(cardId, true);
      return;
    case 'remove-from-nothing':
      if (cardId) actions.setFromNothing(cardId, false);
      return;
    case 'select-incoming':
      if (cardId) actions.selectIncomingArrows(cardId);
      return;
    case 'mark-pending':
      if (cardId) actions.claimPending(cardId);
      return;
    case 'legacy-make-proposition':
      if (node) actions.addArrows(node.id, node.premises);
      return;
    case 'legacy-drop-arrows':
      if (node) actions.removeArrows(node.premises.map((source) => ({ source, target: node.id })));
      return;
    case 'move-to-axioms':
      if (cardId) actions.moveToAxioms(cardId);
      return;
    case 'show':
      if (cardId) actions.revealNode(cardId);
      return;
    case 'details':
      if (cardId) actions.toggleExpanded(cardId);
      return;
    case 'open': {
      // Slice 2h: in the Proposed view, the card's place in the user's files (the session's graph carries none, §4.7).
      const overlay = proposedOverlay(store.getState());
      const loc = overlay !== null && cardId !== null ? overlay.locations[cardId] : node?.loc;
      if (loc) actions.openInEditor(loc.file, loc.range);
      return;
    }
    case 'edit':
      if (cardId) actions.startEdit(cardId, 'naturalName');
      return;
    case 'why':
      if (cardId) actions.startEdit(cardId, 'rationale');
      return;
    case 'delete':
      if (cardId) actions.openDelete(cardId);
      return;
    case 'remove-arrows': {
      if (thing?.kind !== 'arrow') return;
      // The selected arrows and marks (CM-7 selected this one first unless it was already part of the selection):
      // one Delete, as the entry's label says (menu.ts removeSelectionLabel).
      const s = store.getState();
      if (s.selectedArrows.some((a) => a.source === thing.source && a.target === thing.target)) actions.deleteSelectedArrows();
      else actions.removeArrows([{ source: thing.source, target: thing.target }]);
      return;
    }
    case 'show-source':
      if (thing?.kind === 'arrow' || thing?.kind === 'undeclared' || thing?.kind === 'proposed') actions.revealNode(thing.source);
      return;
    case 'show-target':
      if (thing?.kind === 'arrow' || thing?.kind === 'undeclared' || thing?.kind === 'proposed') actions.revealNode(thing.target);
      return;
    case 'remove-mark': {
      if (thing?.kind !== 'mark') return;
      // Part of the selection: the whole selection goes (arrows too), as the label says.
      if (store.getState().selectedMarks.includes(thing.id)) actions.deleteSelectedArrows();
      else actions.setFromNothing(thing.id, false);
      return;
    }
    case 'new-here':
      if (thing?.kind === 'canvas') actions.newPropositionAt(thing.at);
      return;
    case 'fit':
      canvas?.fitAll();
      return;
    case 'tidy':
      if (canvas) tidyLayout(canvas, store);
      return;
  }
}
