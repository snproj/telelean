/**
 * Bringing a card or an item into view without moving anything else: scrolling only the list it is in (the AXIOMS
 * column, the Vocabulary and Definitions columns; `scrollIntoView` could also scroll the page or the other lists, which
 * would break their independent scrolling), or, for a proposition on the canvas, panning and zooming the canvas to it
 * (spec v4 BD-3: "Show on board and every other reveal pan and zoom the canvas to the card").
 */
import { currentCanvas } from './canvas/CanvasView';

/** The scroll containers a reveal may scroll. */
const SCROLL_LISTS = '.tl-col__list, .tl-vcol__list';

/** Scrolls `element`'s list so the element is fully visible (with a small margin), if it is not already. */
export function revealInColumn(element: HTMLElement, margin = 8): void {
  const list = element.closest<HTMLElement>(SCROLL_LISTS);
  if (!list) return;
  const box = element.getBoundingClientRect();
  const view = list.getBoundingClientRect();
  const top = box.top - view.top - list.clientTop + list.scrollTop;
  const bottom = top + box.height;
  const height = list.clientHeight;
  if (box.height + 2 * margin >= height) list.scrollTop = Math.max(0, top - margin);
  else if (top - margin < list.scrollTop) list.scrollTop = Math.max(0, top - margin);
  else if (bottom + margin > list.scrollTop + height) list.scrollTop = bottom + margin - height;
}

/**
 * Reveals a card element: its column scrolls to it, or the canvas pans and zooms to it. On the canvas this waits a
 * frame: a card that has just appeared (a new card, the Proposed view's) gets its place in the parent's layout
 * effects, after the card's own.
 */
export function revealCard(element: HTMLElement): void {
  const slot = element.closest<HTMLElement>('[data-slot-id]');
  const id = slot?.dataset.slotId;
  if (id) {
    requestAnimationFrame(() => currentCanvas()?.reveal(id));
    return;
  }
  revealInColumn(element);
}

/** Reveals the card with this id, after React has rendered it. */
export function revealCardSoon(id: string): void {
  requestAnimationFrame(() => {
    const card = document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`);
    if (card) revealCard(card);
  });
}
