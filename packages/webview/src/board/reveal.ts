/**
 * Scrolling helpers that move only the column an element is in (`scrollIntoView` could also scroll the page or the
 * other columns, which would break the board's independent scrolling).
 */

/** Scrolls `element`'s column list so the element is fully visible (with a small margin), if it is not already. */
export function revealInColumn(element: HTMLElement, margin = 8): void {
  const list = element.closest<HTMLElement>('.tl-col__list');
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

/** Reveals the card with this id, after React has rendered it. */
export function revealCardSoon(id: string): void {
  requestAnimationFrame(() => {
    const card = document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`);
    if (card) revealInColumn(card);
  });
}
