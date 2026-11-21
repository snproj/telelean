/**
 * Dropdowns and tooltips, rendered into document.body so a column's scroll box never clips them and the edge
 * engine's observers on the columns never see them. Positioned with the CSSOM (`style.setProperty`), which the
 * board's CSP allows; style attributes are not used.
 *
 * Keyboard (dropdowns, not tooltips): opening one moves the focus into it (to its checked or first menu item, else to
 * the dropdown itself); Up/Down/Home/End move between its buttons and fields; Tab past the last one, or Shift+Tab
 * before the first, leaves it as if it sat right after the button that opened it; Escape closes it. Whenever it
 * closes with the focus inside (an item was chosen, Escape), the focus goes back to that button.
 */
import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface PopoverProps {
  /** The element the popover hangs from; nothing renders without one. */
  anchor: HTMLElement | null;
  open: boolean;
  /** Called on Escape, a press outside, or when the anchor scrolls out of view (not for tooltips). */
  onClose?: () => void;
  /** Tooltips ignore the pointer and close only when their owner says so. */
  tooltip?: boolean;
  /** Which edge of the anchor the popover aligns with. */
  align?: 'start' | 'end';
  className?: string;
  role?: string;
  label?: string;
  testId?: string;
  /**
   * Where the focus goes when the dropdown closes with the focus inside (default: the anchor). The board's right-click
   * menu hangs from a 1-pixel anchor at the pointer and gives the focus back to the card it was about (slice 1c).
   */
  returnFocus?: HTMLElement | null;
  children: ReactNode;
}

const GAP = 4;
const MARGIN = 8;

/** What Tab and the arrow keys move between. */
const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

function visible(element: HTMLElement): boolean {
  return element.getClientRects().length > 0;
}

function focusables(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
}

/** Whether an element takes the arrow and Home/End keys itself (a text or number field). */
function ownsArrowKeys(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable);
}

/**
 * Whether the anchor can still be seen: in the viewport and inside the box that clips it (a column's list, or the
 * canvas, which pans and zooms: spec v4 slice 1c).
 */
function anchorVisible(anchor: HTMLElement): boolean {
  if (!anchor.isConnected) return false;
  const a = anchor.getBoundingClientRect();
  const box = anchor.closest<HTMLElement>('.tl-col__list, .tl-vcol__list, .tl-canvas')?.getBoundingClientRect();
  const top = Math.max(0, box?.top ?? 0);
  const bottom = Math.min(document.documentElement.clientHeight, box?.bottom ?? Infinity);
  const left = Math.max(0, box?.left ?? 0);
  const right = Math.min(document.documentElement.clientWidth, box?.right ?? Infinity);
  return a.height > 0 && a.bottom > top && a.top < bottom && a.right > left && a.left < right;
}

/** The canvas's view changed (pan, zoom): board/canvas/CanvasView.ts dispatches it on the canvas, bubbling. */
const CANVAS_VIEW_EVENT = 'tl-canvas-view';

/** Places `element` below `anchor` (above when there is no room), inside the viewport. */
function place(element: HTMLElement, anchor: HTMLElement, align: 'start' | 'end'): void {
  const a = anchor.getBoundingClientRect();
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  let left = align === 'end' ? a.right - width : a.left;
  left = Math.max(MARGIN, Math.min(left, vw - width - MARGIN));
  const below = a.bottom + GAP;
  const above = a.top - GAP - height;
  const top = below + height <= vh - MARGIN || above < MARGIN ? below : above;
  element.style.setProperty('left', `${Math.round(left)}px`);
  element.style.setProperty('top', `${Math.round(Math.max(MARGIN, top))}px`);
  element.style.setProperty('max-height', `${Math.max(80, Math.round(vh - Math.max(MARGIN, top) - MARGIN))}px`);
}

export function Popover({ anchor, open, onClose, tooltip = false, align = 'start', className, role, label, testId, returnFocus = null, children }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  /** The focus is inside the popover (so closing gives it back to the anchor). */
  const focusInside = useRef(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!open || !element || !anchor) return;
    place(element, anchor, align);
    if (tooltip) return;
    const close = () => closeRef.current?.();
    const inside = (target: EventTarget | null) => target instanceof Node && (element.contains(target) || anchor.contains(target));
    const onPointerDown = (event: PointerEvent) => {
      if (inside(event.target)) return;
      focusInside.current = false; // the press puts the focus where the user pressed
      close();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
      if (element.contains(document.activeElement)) (returnFocus ?? anchor).focus({ preventScroll: true });
    };
    // Scrolling or resizing moves the anchor: follow it, and close once it is out of sight. (Scroll events arrive a
    // frame late, so a scroll that brought the anchor into view may land after the popover opened.)
    const follow = (event: Event) => {
      if (event.type === 'scroll' && inside(event.target)) return;
      if (anchorVisible(anchor)) place(element, anchor, align);
      else close();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('scroll', follow, true);
    document.addEventListener(CANVAS_VIEW_EVENT, follow, true);
    window.addEventListener('resize', follow);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('scroll', follow, true);
      document.removeEventListener(CANVAS_VIEW_EVENT, follow, true);
      window.removeEventListener('resize', follow);
    };
  });

  // The focus: into the dropdown when it opens, back to the anchor when it closes with the focus inside.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!open || tooltip || !element || !anchor) return;
    const onFocusIn = (event: FocusEvent) => {
      focusInside.current = event.target instanceof Node && element.contains(event.target);
    };
    document.addEventListener('focusin', onFocusIn, true);
    const first =
      element.querySelector<HTMLElement>('[role^="menuitem"][aria-checked="true"]:not(:disabled)') ??
      element.querySelector<HTMLElement>('[role^="menuitem"]:not(:disabled)');
    (first ?? element).focus({ preventScroll: true });
    focusInside.current = element.contains(document.activeElement);
    return () => {
      document.removeEventListener('focusin', onFocusIn, true);
      const had = focusInside.current;
      focusInside.current = false;
      if (!had) return;
      // A focus that was inside falls back to the document body when the dropdown's elements go; give it to the
      // anchor (or `returnFocus`) instead, unless something else took it meanwhile (a dialog the chosen item opened).
      const back = returnFocus?.isConnected ? returnFocus : anchor;
      const restore = () => {
        const now = document.activeElement;
        const lost = now === null || now === document.body || !now.isConnected || element.contains(now);
        if (lost && back.isConnected) back.focus({ preventScroll: true });
      };
      if (element.isConnected) queueMicrotask(restore);
      else restore();
    };
  }, [open, tooltip, anchor, returnFocus]);

  if (!open || !anchor) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const element = ref.current;
    if (tooltip || !element) return;
    const items = focusables(element);
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const index = active ? items.indexOf(active) : -1;
    if (event.key === 'Tab') {
      const leavingForward = !event.shiftKey && (items.length === 0 || index === items.length - 1);
      const leavingBack = event.shiftKey && (index <= 0 || active === element);
      if (!leavingForward && !leavingBack) return; // moves within the dropdown
      event.preventDefault();
      focusInside.current = false;
      if (leavingBack) {
        (returnFocus ?? anchor).focus();
      } else {
        // The element after the anchor, as if the dropdown sat right after it in the page.
        const page = focusables(document).filter((el) => !element.contains(el));
        (page[page.indexOf(anchor) + 1] ?? anchor).focus();
      }
      closeRef.current?.();
      return;
    }
    if (ownsArrowKeys(event.target) || items.length === 0) return;
    let next: HTMLElement | undefined;
    if (event.key === 'ArrowDown') next = items[index < 0 ? 0 : (index + 1) % items.length];
    else if (event.key === 'ArrowUp') next = items[index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length];
    else if (event.key === 'Home') next = items[0];
    else if (event.key === 'End') next = items[items.length - 1];
    if (!next) return;
    event.preventDefault();
    next.focus();
  };

  return createPortal(
    <div
      ref={ref}
      className={`tl-popover${tooltip ? ' tl-popover--tooltip' : ''}${className ? ` ${className}` : ''}`}
      role={role ?? (tooltip ? 'tooltip' : 'dialog')}
      aria-label={label}
      data-testid={testId}
      tabIndex={tooltip ? undefined : -1}
      onKeyDown={onKeyDown}
      // React bubbles events from a portal through the component tree: a click in a card's dropdown must not reach
      // the card (it would select it).
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}
