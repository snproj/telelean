/**
 * The PROPOSITIONS canvas (spec v4 BD-1, BD-3; slice 1c): a viewport (overflow clipped, focusable) holding one
 * transformed layer, in which every proposition is absolutely positioned at its stored position, or at the place the
 * layered placement gives it (canvas/placement.ts, from the cards' measured collapsed sizes; never written until the
 * user moves the card or chooses Tidy layout). The view (pan and zoom) is CanvasView's; the pointer, wheel and keys are
 * BoardInput's. The cards sit in the DOM in reading order (top to bottom, then left to right), so Tab goes through
 * them in that order after the AXIOMS column; when a new placement changes that order, React moves card elements,
 * which drops the keyboard focus, so the canvas gives it back. An expanded card opens over the cards below it (raised
 * above them and above the arrows), without moving anything.
 *
 * The Proposed view shows the cards it shares with the Current board where the Current board last showed them (stored
 * or placed: `keepCurrentPlaces`), so switching views moves no card; only the proposal's new cards are placed anew.
 *
 * Positions reach the DOM as CSS custom properties set through the CSSOM (`--tl-x`, `--tl-y` on each card's slot):
 * the CSP allows no inline style attributes.
 */
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useBoard, useBoardStore } from '../state/context';
import { boardView, editLock, proposedOverlay } from '../state/store';
import { placeSlot, SLOT_SELECTOR } from './BoardInput';
import type { CanvasView } from './canvas/CanvasView';
import { keepCurrentPlaces, PLACEMENT, placeCards, tidyPositions, type PlacementInput } from './canvas/placement';
import type { Box, Point, Size } from './canvas/view';
import { CanvasToolbar } from './CanvasToolbar';
import { columnTargetData, isCardDragData } from './dnd';
import { DropZone } from './DropZone';
import { CANVAS_SIDES, type CanvasSide } from './geometry';
import { NodeCard } from './NodeCard';

export interface CanvasRefs {
  viewport: (element: HTMLDivElement | null) => void;
  layer: (element: HTMLDivElement | null) => void;
  /** One empty element per canvas edge: the engine puts that edge's "n linked" button there. */
  slots: Readonly<Record<CanvasSide, (element: HTMLSpanElement | null) => void>>;
}

const ESTIMATE: Size = { w: PLACEMENT.cardWidth, h: PLACEMENT.estimatedHeight };

/**
 * A card's collapsed size: its border box, less its details while it is expanded (BD-3: placement uses the collapsed
 * sizes, so expanding a card never moves another one).
 */
function collapsedSize(card: HTMLElement): Size {
  const details = card.querySelector<HTMLElement>(':scope > .tl-details');
  if (!details) return { w: card.offsetWidth, h: card.offsetHeight };
  const margin = Number.parseFloat(getComputedStyle(details).marginTop) || 0;
  return { w: card.offsetWidth, h: Math.max(24, card.offsetHeight - details.offsetHeight - margin) };
}

const CanvasSlot = memo(function CanvasSlot({ id, x, y, expanded }: { id: string; x: number; y: number; expanded: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) placeSlot(ref.current, x, y);
  }, [x, y]);
  return (
    <div ref={ref} className="tl-canvas__slot" data-slot-id={id} data-expanded={expanded || undefined}>
      <NodeCard id={id} place="canvas" />
    </div>
  );
});

export function PropositionCanvas({ canvas, refs }: { canvas: CanvasView; refs: CanvasRefs }) {
  const ids = useBoard((s) => boardView(s).order.PROPOSITION);
  const nodes = useBoard((s) => boardView(s).nodes);
  const viewStored = useBoard((s) => boardView(s).positions);
  const proposed = useBoard((s) => proposedOverlay(s) !== null);
  const expanded = useBoard((s) => s.expanded);
  const subject = useBoard((s) => s.subject);
  const hasGraph = useBoard((s) => s.version !== null);
  const dragFrom = useBoard((s) => s.drag?.from ?? null);
  const dragId = useBoard((s) => s.drag?.id ?? null);
  const dropActive = useBoard((s) => s.dropKind === 'PROPOSITION');
  const store = useBoardStore();
  const viewport = useRef<HTMLDivElement | null>(null);
  const layer = useRef<HTMLDivElement | null>(null);
  /** Measured collapsed sizes, by card id. */
  const [sizes, setSizes] = useState<ReadonlyMap<string, Size>>(() => new Map());
  /** Where the Current board last showed its cards (stored or placed), by subject: the Proposed view keeps them there. */
  const currentShown = useRef(new Map<string, Readonly<Record<string, Point>>>());
  /** The element on the canvas that has the keyboard focus (a card, or a control in one), to give it back after a re-sort. */
  const focused = useRef<{ id: string; element: HTMLElement } | null>(null);

  // The Proposed view (read-only, nothing is written): the proposal's positions, then the Current board's places.
  const stored = useMemo(
    () => (proposed ? keepCurrentPlaces(ids, viewStored, currentShown.current.get(subject)) : viewStored),
    [proposed, ids, viewStored, subject],
  );

  const input = useMemo<PlacementInput>(
    () => ({
      ids,
      premisesOf: (id) => nodes[id]?.premises ?? [],
      isAxiom: (id) => nodes[id]?.type === 'AXIOM',
      stored,
      sizeOf: (id) => sizes.get(id) ?? ESTIMATE,
    }),
    [ids, nodes, stored, sizes],
  );
  const placed = useMemo(() => placeCards(input), [input]);
  // Reading order: top to bottom, then left to right (the Tab order, BD-3).
  const sorted = useMemo(() => [...ids].sort((a, b) => (placed[a]?.y ?? 0) - (placed[b]?.y ?? 0) || (placed[a]?.x ?? 0) - (placed[b]?.x ?? 0)), [ids, placed]);

  // What the Current board shows, for the Proposed view (above).
  useLayoutEffect(() => {
    if (!proposed) currentShown.current.set(subject, placed);
  }, [proposed, subject, placed]);

  // Which element on the canvas has the focus. A press anywhere else means the user moved on, even to something that
  // takes no focus: the focus is then not given back.
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      const slot = target instanceof HTMLElement && layer.current?.contains(target) ? target.closest<HTMLElement>(SLOT_SELECTOR) : null;
      const id = slot?.dataset.slotId;
      focused.current = id && target instanceof HTMLElement ? { id, element: target } : null;
    };
    const onPointerDown = (event: PointerEvent) => {
      const f = focused.current;
      if (f && !(event.target instanceof Node && f.element.contains(event.target))) focused.current = null;
    };
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, []);

  // A new reading order (a move, an edit that changed a card's height, a new graph) makes React move card elements,
  // and moving the focused one drops the keyboard focus to <body>: give it back (to the same element, else its card),
  // without scrolling. BoardInput brings a card focused from the keyboard into view.
  useLayoutEffect(() => {
    const f = focused.current;
    const active = document.activeElement;
    if (!f || (active !== null && active !== document.body)) return;
    const target = f.element.isConnected
      ? f.element
      : layer.current?.querySelector<HTMLElement>(`${SLOT_SELECTOR}[data-slot-id="${CSS.escape(f.id)}"] > .tl-card`);
    if (target) target.focus({ preventScroll: true });
    else focused.current = null;
  }, [sorted]);

  /** Reads the cards' collapsed sizes; a change re-places the cards that have no stored position. */
  const measure = useCallback(() => {
    const element = layer.current;
    if (!element) return;
    setSizes((previous) => {
      const next = new Map<string, Size>();
      let changed = false;
      for (const slot of element.querySelectorAll<HTMLElement>('[data-slot-id]')) {
        const id = slot.dataset.slotId;
        const card = slot.querySelector<HTMLElement>(':scope > .tl-card');
        if (!id || !card) continue;
        const old = previous.get(id);
        // An expanded card keeps the collapsed size measured before it opened.
        const size = card.dataset.expanded && old ? old : collapsedSize(card);
        if (size.w === 0 && size.h === 0) {
          if (old) next.set(id, old);
          continue;
        }
        next.set(id, size);
        if (!old || Math.abs(old.w - size.w) >= 1 || Math.abs(old.h - size.h) >= 1) changed = true;
      }
      if (next.size !== previous.size) changed = true;
      return changed ? next : previous;
    });
  }, []);

  // After every render: new cards, edited sentences, expanded or collapsed cards.
  useLayoutEffect(measure);

  // Text reflow without a render (fonts loading, the panel resizing the card's chips): measure again.
  useEffect(() => {
    const element = layer.current;
    if (!element) return;
    const observer = new ResizeObserver(() => measure());
    for (const card of element.querySelectorAll('.tl-card')) observer.observe(card);
    return () => observer.disconnect();
  }, [sorted, measure]);

  // The canvas as laid out: what the view (Fit all, reveals, moves) and the edge engine work with.
  useLayoutEffect(() => {
    const boxes = new Map<string, Box>();
    for (const id of ids) {
      const p = placed[id];
      if (!p) continue;
      const size = sizes.get(id) ?? ESTIMATE;
      boxes.set(id, { x: p.x, y: p.y, w: size.w, h: size.h });
    }
    canvas.setLayout(boxes);
  }, [canvas, ids, placed, sizes]);

  // Tidy layout re-places cards with this board's placement, around the others where they are shown.
  useEffect(() => {
    canvas.setTidyPlanner((which) => tidyPositions(input, placed, which));
    return () => canvas.setTidyPlanner(null);
  }, [canvas, input, placed]);

  // The first view of a board (and of each subject): Fit all, once the cards have been measured.
  const measuredAll = ids.every((id) => sizes.has(id));
  const fitFirst = useCallback(() => {
    if (!hasGraph || canvas.fittedFor === subject || !measuredAll) return;
    if (ids.length === 0 || canvas.fitInitial()) canvas.fittedFor = subject;
  }, [canvas, hasGraph, subject, measuredAll, ids.length]);
  useLayoutEffect(fitFirst);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    // A board laid out later (a hidden panel shown) is fitted once it has a size.
    const observer = new ResizeObserver(() => fitFirst());
    observer.observe(element);
    return () => observer.disconnect();
  }, [fitFirst]);

  // An axiom dragged here from the column is refused (AR-6: "Draw an arrow into it to make it a proposition").
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    return dropTargetForElements({
      element,
      getData: () => columnTargetData('PROPOSITION'),
      // Slice 1f (ES-9): no drop lands while an edit session (a run) is active.
      canDrop: ({ source }) => isCardDragData(source.data) && editLock(store.getState()) === null,
    });
  }, [store]);

  const setViewport = useCallback(
    (element: HTMLDivElement | null) => {
      viewport.current = element;
      // The view writes its transform on the viewport from the start (before any layout effect needs it).
      if (element) canvas.attach(element);
      else canvas.detach();
      refs.viewport(element);
    },
    [canvas, refs],
  );
  const setLayer = useCallback(
    (element: HTMLDivElement | null) => {
      layer.current = element;
      refs.layer(element);
    },
    [refs],
  );

  return (
    <div
      ref={setViewport}
      className="tl-canvas"
      data-canvas="true"
      data-drop={dragFrom === null ? undefined : dropActive ? 'active' : 'candidate'}
      tabIndex={0}
      role="region"
      aria-roledescription="canvas"
      aria-label="Propositions: the mouse wheel zooms, right-drag pans; with the canvas focused, + and − zoom, 0 shows all, the arrow keys pan"
      aria-keyshortcuts="+ - 0 ArrowLeft ArrowRight ArrowUp ArrowDown"
    >
      <div ref={setLayer} className="tl-canvas__layer" role="list" aria-label="Propositions">
        {sorted.map((id) => {
          const p = placed[id];
          return p ? <CanvasSlot key={id} id={id} x={p.x} y={p.y} expanded={expanded[id] === true} /> : null;
        })}
      </div>
      {hasGraph && ids.length === 0 ? (
        <p className="tl-canvas__empty" data-testid="canvas-empty">
          No propositions yet: add one in the box below (choose Proposition), or right-click here and choose “New proposition here”.
        </p>
      ) : null}
      {dragFrom === 'AXIOM' && dragId !== null ? <DropZone kind="PROPOSITION" id={dragId} active={dropActive} /> : null}
      <CanvasToolbar canvas={canvas} />
      {CANVAS_SIDES.map((side) => (
        // Filled by the edge engine; React never renders children here.
        <span key={side} ref={refs.slots[side]} className="tl-canvas__badge-slot" data-side={side} />
      ))}
    </div>
  );
}
