/**
 * Scrolling inside the run panel only (like board/reveal.ts for the columns: `scrollIntoView` could also scroll the
 * page or the board). The panel keeps its scroll position when its content changes, so new content (a question set,
 * the review, the next review step) can land outside the visible part; these helpers bring its top into view.
 */

/**
 * Scrolls the run panel's body so that `element`'s top is in view: when it is above the visible part, or starts so
 * low that little of it shows, its top goes to the top of the panel. Otherwise nothing moves.
 */
export function revealInPanel(element: HTMLElement, margin = 6): void {
  const body = element.closest<HTMLElement>('.tl-run__body');
  if (!body) return;
  const box = element.getBoundingClientRect();
  const view = body.getBoundingClientRect();
  const top = box.top - view.top - body.clientTop; // relative to the visible top of the body
  const height = body.clientHeight;
  if (top < 0 || top > height * 0.6) body.scrollTop = Math.max(0, body.scrollTop + top - margin);
}
