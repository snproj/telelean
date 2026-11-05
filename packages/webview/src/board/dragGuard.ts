/**
 * Keeps a press inside a card's text or controls from dragging the card (the user's turn-9 request 1; risk R5 in
 * docs/m1-plan.md section 12).
 *
 * CSS cannot do this in Chrome: when a press inside a `draggable="true"` element moves, Chromium looks for the drag
 * source by walking up from the pressed node to the nearest draggable ancestor, skipping descendants marked
 * `draggable="false"` or `-webkit-user-drag: none`, so the card is dragged and no text gets selected. That search
 * happens when the pointer starts moving, after `pointerdown`. So on `pointerdown` inside a no-drag zone the card's
 * own `draggable` attribute is switched off, and switched back on at `pointerup` / `pointercancel` / window blur.
 * pragmatic-drag-and-drop sets the attribute once when the card registers and never reads it back, so the toggle is
 * safe; `blocked()` additionally feeds its `canDrag`, in case a drag starts anyway.
 *
 * Measured in Chrome 155 (AT6.16 negative controls): each mechanism alone is enough. With only `canDrag` false,
 * pragmatic-dnd's preventDefault on `dragstart` also lets the text selection continue; with neither, the card drags
 * and nothing is selected. Both stay, so a change in either Chrome or pragmatic-dnd cannot bring the bug back.
 * (This corrects plan risk R5, which said that only the attribute toggle works.)
 */

/** Where a press must select text or operate a control instead of dragging the card. */
export const NO_DRAG_SELECTOR = '.tl-lean, input, textarea, select, button, a[href], [contenteditable], [data-nodrag]';

export interface CardDragGuard {
  /** A press that started in a no-drag zone is still down. */
  blocked(): boolean;
  dispose(): void;
}

export function guardCardDrag(card: HTMLElement): CardDragGuard {
  let blocked = false;
  let unlisten: (() => void) | null = null;

  const release = () => {
    if (!blocked) return;
    blocked = false;
    card.setAttribute('draggable', 'true');
    unlisten?.();
    unlisten = null;
  };

  const onPointerDown = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const zone = target.closest(NO_DRAG_SELECTOR);
    if (!zone || zone === card || !card.contains(zone)) return;
    release(); // a second press before the first one was released (should not happen; be safe)
    blocked = true;
    card.setAttribute('draggable', 'false');
    const view = card.ownerDocument.defaultView ?? window;
    view.addEventListener('pointerup', release, true);
    view.addEventListener('pointercancel', release, true);
    view.addEventListener('blur', release);
    unlisten = () => {
      view.removeEventListener('pointerup', release, true);
      view.removeEventListener('pointercancel', release, true);
      view.removeEventListener('blur', release);
    };
  };

  card.addEventListener('pointerdown', onPointerDown, true);
  return {
    blocked: () => blocked,
    dispose: () => {
      card.removeEventListener('pointerdown', onPointerDown, true);
      unlisten?.();
      unlisten = null;
      blocked = false;
    },
  };
}
