/**
 * The board's pointer, wheel and keyboard handling for the canvas (spec v4 BD-3, CM-7, A21; slice 1c) and its arrow
 * gestures (AR-1, AR-6, AR-7, CM-2; slice 1c2). Attached to the board element, an ancestor of both the cards and the
 * arrow overlay, so a wheel or a press over an arrow reaches it too. Pointer events only (no new dependency);
 * pragmatic-drag-and-drop keeps the AXIOMS column's re-order. The rules live in board/gestures.ts (pure, unit-tested).
 *
 * - Wheel over the canvas: zoom about the cursor (Ctrl+wheel, a trackpad pinch, zooms faster). Over the column: its
 *   own scrolling.
 * - Right button: a press on the canvas captures the pointer; moving CLICK_SLOP px or more pans (and the press is then
 *   only a pan: no selection change, no menu, A21). A release before that opens the right-click menu at the pointer
 *   for the card, arrow, mark or empty canvas under it (CM-7), on the canvas or in the column. The native context menu
 *   is suppressed on the board, except over a text field or selected text (VS Code's Cut/Copy/Paste stay there).
 * - Arrows (slice 1c2): each drawn arrow, and each arrow a proof uses without a declaration, has a wide transparent hit
 *   path (the EdgeEngine's); so has each ∅ stub. Over the AXIOMS column the list lies above the overlay, so there the
 *   arrow near the pointer is found by distance (`EdgeEngine.hitTestColumn`). Hovering one gives it the hover look; a
 *   click selects a drawn arrow or a mark (Ctrl/Cmd adds; CM-2); an undeclared arrow (TL107) only has its right-click
 *   menu ("Draw this arrow"); a mention (lean-ref) takes no pointer at all.
 * - Left press on empty canvas (or on an arrow there): a click selects the arrow or mark, or on empty canvas clears the
 *   selection (Ctrl/Cmd: keeps it); a drag draws the selection rectangle, which selects the canvas cards, drawn arrows
 *   and marks wholly inside it (Ctrl/Cmd adds them).
 * - Left drag on a proposition card moves it (with the other selected cards when it is selected); the release stores
 *   the new positions, one Undo step (`moveCards`). Released over the AXIOMS column, one card runs "Move to axioms"
 *   (its impact dialog, AR-7) instead of moving, and several are refused; while the cards are over the column, it says
 *   what a drop does (the store's `overAxioms`). (An axiom dragged from the column onto the canvas is pragmatic-dnd's:
 *   the canvas's drop zone refuses it, AR-6.)
 * - Left drag from a card's handle (at its right edge, shown on hover) draws a rubber-band arrow that follows the
 *   pointer across the column and the canvas, and follows scrolling, panning and zooming. Over a card, the hint next
 *   to the pointer says what a release does (AR-6: the impact, when it is an axiom; AR-3: a cycle); a release there
 *   calls `addArrows(target, [source])` (into an axiom, 1b's impact dialog first); elsewhere it cancels, and so does Esc.
 * - Escape during a drag (a move, a draw, a rectangle) cancels it, and nothing else happens.
 * - While an edit session is active (ES-9) drawing and moving are off (the handles are not there); selecting and the
 *   menus stay. Slice 2h: the Proposed view is the session's: it selects (cards, drawn and accepted Claude arrows,
 *   marks), draws nothing, and a move there is a session step (`moveProposed`, off while Claude's step runs); a click on
 *   Claude's undecided arrow shows its review item (`gestureGateOf`).
 * - Keyboard, with the canvas (or a card on it) focused: + / − zoom about the centre, 0 is Fit all; with the canvas
 *   itself focused the arrow keys pan. A card focused from the keyboard (Tab) is brought into view.
 */
import { boardView, gestureGateOf, impactOf, type BoardStore } from '../state/store';
import { isTextEntry } from '../model/format';
import { NO_DRAG_SELECTOR } from './dragGuard';
import type { CanvasView } from './canvas/CanvasView';
import { PressTracker } from './canvas/gesture';
import { KEY_PAN, wheelFactor, type Point } from './canvas/view';
import type { EdgeEngine } from './EdgeEngine';
import {
  areaSelection,
  canvasDropOutcome,
  clickOutcome,
  clipRect,
  columnDropBefore,
  drawHint,
  drawRelease,
  drawTarget,
  hitThing,
  rectBetween,
  rubberBandPath,
  type DrawHint,
  type DrawTarget,
  type Hit,
} from './gestures';
import type { MenuThing } from './menu';

export interface MenuRequest {
  /** Client coordinates of the pointer. */
  x: number;
  y: number;
  thing: MenuThing;
  /** Where the focus goes back when the menu closes. */
  returnFocus: HTMLElement | null;
}

/** Slice 1c2: what a gesture draws while it lasts, in an overlay above both parts that never takes the pointer. */
export interface BoardDraft {
  svg: SVGSVGElement;
  /** The selection rectangle. */
  area: SVGRectElement;
  /** The rubber-band arrow. */
  arrow: SVGPathElement;
  /** The words next to the pointer while an arrow is drawn. */
  hint: HTMLElement;
}

export interface BoardInputOptions {
  board: HTMLElement;
  /** The AXIOMS column (header, list and footer). */
  column: HTMLElement;
  /** The column's scrolling list (a press on its scrollbar is never a click on an arrow). */
  list: HTMLElement;
  viewport: HTMLElement;
  canvas: CanvasView;
  store: BoardStore;
  engine: EdgeEngine;
  openMenu: (request: MenuRequest) => void;
  draft: BoardDraft;
}

/** A card slot on the canvas (PropositionCanvas renders one per proposition). */
export const SLOT_SELECTOR = '[data-slot-id]';

/** Sets a slot's position (canvas coordinates) through the CSSOM, touching it only when it changed. */
export function placeSlot(slot: HTMLElement, x: number, y: number): void {
  const px = `${Math.round(x * 100) / 100}px`;
  const py = `${Math.round(y * 100) / 100}px`;
  if (slot.style.getPropertyValue('--tl-x') !== px) slot.style.setProperty('--tl-x', px);
  if (slot.style.getPropertyValue('--tl-y') !== py) slot.style.setProperty('--tl-y', py);
}

/** Whether the pointer is over a text field or over selected text (where VS Code's own menu stays, CM-7). */
export function textContextAt(target: EventTarget | null, x: number, y: number): boolean {
  if (isTextEntry(target)) return true;
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
  for (let i = 0; i < selection.rangeCount; i++) {
    for (const r of selection.getRangeAt(i).getClientRects()) if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
  }
  return false;
}

interface RightPress {
  kind: 'right';
  pointerId: number;
  tracker: PressTracker;
  /** The press started on the canvas: a drag pans. */
  pan: boolean;
  thing: MenuThing | null;
  returnFocus: HTMLElement | null;
}

interface MovePress {
  kind: 'move';
  pointerId: number;
  tracker: PressTracker;
  /** The cards that move, with where they were. */
  cards: Array<{ id: string; slot: HTMLElement; from: Point }>;
  /** The card pressed (its focus is given back after the move). */
  id: string;
  /** The pointer is over the AXIOMS column (AR-7: a release there is "Move to axioms"). */
  overColumn: boolean;
}

interface DrawPress {
  kind: 'draw';
  pointerId: number;
  tracker: PressTracker;
  /** The card the arrow starts from, and its element. */
  source: string;
  sourceCard: HTMLElement;
  /** The pointer (client coordinates), kept to redraw after a pan, a zoom or a scroll. */
  at: Point;
  /** Where the rubber band starts (board space); the last one is kept while the source is out of view. */
  from: Point | null;
  /** What a release here does, and the card it is about (marked `data-draw-target`). */
  target: DrawTarget;
  over: HTMLElement | null;
}

interface AreaPress {
  kind: 'area';
  pointerId: number;
  tracker: PressTracker;
  /** Ctrl/Cmd at the press: the selection grows instead of being replaced. */
  additive: boolean;
  /** What the press began on: an arrow or a mark (a click selects it), or nothing (a click clears the selection). */
  hit: Hit | null;
  /** A drag draws the selection rectangle (a press on the canvas); in the column a press only clicks an arrow. */
  rectangle: boolean;
  /** A menu was open at the press: a click on empty canvas only closes it (CM-2), it does not clear the selection. */
  closes: boolean;
}

type Press = RightPress | MovePress | DrawPress | AreaPress;

export function attachBoardInput(o: BoardInputOptions): () => void {
  const { board, column, list, viewport, canvas, store, engine, draft } = o;
  let press: Press | null = null;
  let suppressClick = false;
  /** The last input was a key (Tab): a card that gets the focus is brought into view. */
  let fromKeyboard = false;
  /** When the right button last went down or up: a `contextmenu` event soon after comes from the mouse. */
  let lastRightButton = -Infinity;
  /** The draw hint's words now (they are rebuilt only when they change). */
  let hintKey = '';
  /**
   * A popover (a menu) was open when the current press began. Read in the capture phase, before the popover's own
   * listener closes it (and React may remove it before the board's listener runs).
   */
  let popoverAtPress = false;

  const gate = () => gestureGateOf(store.getState());

  const inViewport = (x: number, y: number) => {
    const r = viewport.getBoundingClientRect();
    return x >= r.left && x < r.right && y >= r.top && y < r.bottom;
  };

  const inColumn = (x: number, y: number) => {
    const r = column.getBoundingClientRect();
    return x >= r.left && x < r.right && y >= r.top && y < r.bottom;
  };

  /** Controls drawn over the canvas (its toolbar, the "n linked" badges): never a pan, a move or a menu. */
  const onControl = (target: Element) => target.closest('.tl-canvas__tools, .tl-badge, .tl-canvas__badge-slot') !== null;

  /** A card, or a suggestion of Claude's in the column (they take the pointer themselves; no arrow is found under them). */
  const onItem = (target: Element) => target.closest('[data-node-id], [data-ghost-id]') !== null;

  /** A press on the column list's own scrollbar. */
  const onScrollbar = (target: Element, x: number) => {
    if (target !== list) return false;
    const r = list.getBoundingClientRect();
    return x >= r.left + list.clientLeft + list.clientWidth;
  };

  /**
   * The arrow or ∅ stub under the pointer: its hit path on the canvas; over the column's background, the arrow nearest
   * the pointer (the list lies above the overlay there). Null over a card, a control or nothing.
   */
  const hitAt = (target: Element, x: number, y: number): Hit | null => {
    const mark = target.closest<SVGElement>('[data-mark-id]');
    if (mark?.dataset.markId && board.contains(mark)) return { kind: 'mark', id: mark.dataset.markId };
    const path = target.closest<SVGPathElement>('path[data-hit-edge]');
    if (path) {
      const { hitEdge, source, target: into, hit, hitItem } = path.dataset;
      if (hitEdge && source && into && (hit === 'drawn' || hit === 'undeclared')) return { kind: 'arrow', id: hitEdge, source, target: into, role: hit };
      // Slice 2h: Claude's arrow still undecided (its click shows its review item).
      if (hitEdge && source && into && hit === 'proposed' && hitItem) return { kind: 'arrow', id: hitEdge, source, target: into, role: 'proposed', item: hitItem };
      return null;
    }
    if (!column.contains(target) || onItem(target) || target.closest(NO_DRAG_SELECTOR) || onScrollbar(target, x)) return null;
    const found = engine.hitTestColumn(engine.toBoard(x, y));
    return found ? { kind: 'arrow', id: found.id, source: found.source, target: found.target, role: found.role, ...(found.item !== undefined ? { item: found.item } : {}) } : null;
  };

  /** The card, drawn arrow, mark or empty canvas under the pointer, or null (the column's background, a control). */
  const thingAt = (target: Element, x: number, y: number): { thing: MenuThing; focus: HTMLElement | null } | null => {
    if (onControl(target)) return null;
    const card = target.closest<HTMLElement>('[data-node-id]');
    if (card && board.contains(card) && card.dataset.nodeId) return { thing: { kind: 'card', id: card.dataset.nodeId }, focus: card };
    // A drawn arrow (a declared premise) or a mark is selected first; a proof's use nobody drew (TL107) has its menu only.
    const hit = hitAt(target, x, y);
    if (hit) return { thing: hitThing(hit), focus: viewport };
    if (column.contains(target) || !inViewport(x, y)) return null;
    return { thing: { kind: 'canvas', at: canvas.clientToCanvas(x, y) }, focus: viewport };
  };

  /**
   * A proposition card on the canvas that a left drag may move now (ES-9: not during an edit session; slice 2h: on the
   * session's Proposed view, as a session step).
   */
  const movable = (id: string) => {
    const s = store.getState();
    return boardView(s).nodes[id]?.type === 'PROPOSITION' && !s.provisional[id] && gate().move === null && canvas.layout.has(id);
  };

  const slotOf = (id: string) => board.querySelector<HTMLElement>(`${SLOT_SELECTOR}[data-slot-id="${CSS.escape(id)}"]`);

  /** The click that follows a drag must not change the selection. */
  const suppressNextClick = () => {
    suppressClick = true;
    setTimeout(() => {
      suppressClick = false;
    }, 0);
  };

  // ---- hover (slice 1c2): the arrow or stub under the pointer gets the hover look

  let hovered = '';
  const setHovered = (hit: Hit | null, viaColumn: boolean) => {
    const key = hit ? `${hit.kind}:${hit.id}` : '';
    if (key === hovered) return;
    hovered = key;
    engine.setHovered(hit?.kind === 'arrow' ? hit.id : null, hit?.kind === 'mark' ? hit.id : null);
    // Over the column the list shows the pointer cursor itself (its hit paths lie under it).
    if (hit && viaColumn) board.dataset.arrowHover = 'true';
    else delete board.dataset.arrowHover;
  };

  const hoverAt = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Element) || event.buttons !== 0 || onItem(target) || onControl(target)) {
      setHovered(null, false);
      return;
    }
    setHovered(hitAt(target, event.clientX, event.clientY), column.contains(target));
  };

  // ---- moving cards (slice 1c), and dropping one on the AXIOMS column (AR-7, slice 1c2)

  const startMove = (event: PointerEvent, card: HTMLElement, target: Element) => {
    const id = card.dataset.nodeId ?? '';
    // A press in the code, a field or a button never moves the card (as it never drags a column card).
    const zone = target.closest(NO_DRAG_SELECTOR);
    if ((zone && zone !== card && card.contains(zone)) || !movable(id)) return;
    const s = store.getState();
    const ids = s.selected.includes(id) ? s.selected.filter(movable) : [id];
    const cards = ids.flatMap((x) => {
      const slot = slotOf(x);
      const box = canvas.layout.get(x);
      return slot && box ? [{ id: x, slot, from: { x: box.x, y: box.y } }] : [];
    });
    if (cards.length === 0) return;
    press = { kind: 'move', pointerId: event.pointerId, tracker: new PressTracker({ x: event.clientX, y: event.clientY }), cards, id, overColumn: false };
  };

  const moveStep = (p: MovePress, started: boolean, point: Point, pointerId: number) => {
    if (!p.tracker.dragging) return;
    if (started) {
      board.setPointerCapture(pointerId);
      board.dataset.moving = 'true';
      for (const c of p.cards) c.slot.dataset.moving = 'true';
      store.getState().setHover(null);
    }
    const { dx, dy } = p.tracker.total;
    const s = canvas.transform.s;
    for (const c of p.cards) placeSlot(c.slot, c.from.x + dx / s, c.from.y + dy / s);
    engine.invalidateLayout();
    // AR-7: over the AXIOMS column, the column states what a drop there does.
    const over = inColumn(point.x, point.y);
    if (over === p.overColumn) return;
    p.overColumn = over;
    if (over) board.dataset.overAxioms = 'true';
    else delete board.dataset.overAxioms;
    store.getState().setOverAxioms(over ? { id: p.id, count: p.cards.length } : null);
  };

  const leaveColumn = (p: MovePress) => {
    if (!p.overColumn) return;
    p.overColumn = false;
    delete board.dataset.overAxioms;
    store.getState().setOverAxioms(null);
  };

  const finishMove = (p: MovePress, commit: boolean) => {
    for (const c of p.cards) {
      delete c.slot.dataset.moving;
      // Back to where React placed it; a committed move re-renders it at its new place (before the next paint).
      placeSlot(c.slot, c.from.x, c.from.y);
    }
    delete board.dataset.moving;
    engine.invalidateLayout();
    if (!commit) return;
    const { dx, dy } = p.tracker.total;
    const s = canvas.transform.s;
    const positions = Object.fromEntries(p.cards.map((c) => [c.id, { x: Math.round(c.from.x + dx / s), y: Math.round(c.from.y + dy / s) }]));
    // React may then move the card's element (the canvas keeps its cards in reading order), which drops its focus:
    // PropositionCanvas gives it back after every re-sort.
    store.getState().moveCards(positions);
  };

  // ---- drawing an arrow from a card's handle (AR-1, AR-6; slice 1c2)

  const startDraw = (event: PointerEvent, handle: HTMLElement) => {
    const card = handle.closest<HTMLElement>('[data-node-id]');
    const source = card?.dataset.nodeId;
    const s = store.getState();
    if (!card || !source || !board.contains(card) || gate().draw !== null || s.provisional[source] || !s.nodes[source]) return;
    const at = { x: event.clientX, y: event.clientY };
    press = { kind: 'draw', pointerId: event.pointerId, tracker: new PressTracker(at), source, sourceCard: card, at, from: null, target: { kind: 'none' }, over: null };
  };

  /** The card under a client point (the overlays above the cards never take the pointer), and what a release there does. */
  const drawTargetAt = (source: string, at: Point): { target: DrawTarget; card: HTMLElement | null } => {
    const under = document.elementFromPoint(at.x, at.y);
    const found = under instanceof Element ? under.closest<HTMLElement>('[data-node-id]') : null;
    const card = found && board.contains(found) ? found : null;
    const s = store.getState();
    const target = drawTarget(source, card?.dataset.nodeId ?? null, { nodes: s.nodes, provisional: s.provisional, edges: s.edges });
    return { target, card: target.kind === 'none' ? null : card };
  };

  /** Where the rubber band starts when the engine has no anchor for the source (not measured yet): its handle. */
  const handleAnchor = (p: DrawPress): Point | null => {
    const handle = p.sourceCard.querySelector<HTMLElement>('[data-handle]');
    if (!handle) return null;
    const r = handle.getBoundingClientRect();
    return engine.toBoard(r.left + r.width / 2, r.top + r.height / 2);
  };

  const showHint = (hint: DrawHint | null, at: Point) => {
    const el = draft.hint;
    if (!hint) {
      if (!el.hidden) el.hidden = true;
      hintKey = '';
      return;
    }
    const key = `${hint.refused}\n${hint.text}\n${hint.lines.join('\n')}`;
    if (key !== hintKey) {
      hintKey = key;
      const text = document.createElement('span');
      text.className = 'tl-draw-hint__text';
      text.textContent = hint.text;
      const lines = hint.lines.map((line) => {
        const span = document.createElement('span');
        span.className = 'tl-draw-hint__line';
        span.textContent = line;
        return span;
      });
      el.replaceChildren(text, ...lines);
      if (hint.refused) el.dataset.refused = 'true';
      else delete el.dataset.refused;
    }
    el.hidden = false;
    // Next to the pointer, kept inside the board.
    const room = { w: board.clientWidth, h: board.clientHeight };
    let x = at.x + 16;
    let y = at.y + 18;
    if (x + el.offsetWidth > room.w - 4) x = Math.max(4, at.x - 16 - el.offsetWidth);
    if (y + el.offsetHeight > room.h - 4) y = Math.max(4, at.y - 12 - el.offsetHeight);
    el.style.setProperty('left', `${Math.round(x)}px`);
    el.style.setProperty('top', `${Math.round(y)}px`);
  };

  /** Redraws the rubber band from the source (where it shows now: pan, zoom and scroll aware) to the pointer. */
  const updateDraw = (p: DrawPress) => {
    p.from = engine.sourceAnchor(p.source) ?? p.from ?? handleAnchor(p);
    const to = engine.toBoard(p.at.x, p.at.y);
    if (p.from) draft.arrow.setAttribute('d', rubberBandPath(p.from, to));
    const { target, card } = drawTargetAt(p.source, p.at);
    p.target = target;
    if (p.over && p.over !== card) delete p.over.dataset.drawTarget;
    p.over = card;
    if (card) card.dataset.drawTarget = target.kind === 'ok' ? 'ok' : 'refused';
    const s = store.getState();
    const impact = target.kind === 'ok' && target.axiom ? impactOf(s, target.id, 'PROPOSITION') : null;
    showHint(drawHint(target, s.nodes, impact), to);
  };

  const endDraw = (p: DrawPress) => {
    delete board.dataset.drawing;
    delete p.sourceCard.dataset.drawSource;
    if (p.over) delete p.over.dataset.drawTarget;
    p.over = null;
    draft.arrow.setAttribute('d', 'M0 0');
    showHint(null, { x: 0, y: 0 });
  };

  // ---- the selection rectangle (CM-2; slice 1c2)

  /** The rectangle between two client points, in board space, kept to the canvas viewport. */
  const areaRect = (a: Point, b: Point) => {
    const rect = rectBetween(engine.toBoard(a.x, a.y), engine.toBoard(b.x, b.y));
    const view = engine.canvasViewRect();
    return view ? clipRect(rect, view) : rect;
  };

  const drawArea = (p: AreaPress, at: Point) => {
    const r = areaRect(p.tracker.start, at);
    draft.area.setAttribute('x', String(Math.round(r.x * 10) / 10));
    draft.area.setAttribute('y', String(Math.round(r.y * 10) / 10));
    draft.area.setAttribute('width', String(Math.round(r.w * 10) / 10));
    draft.area.setAttribute('height', String(Math.round(r.h * 10) / 10));
  };

  const endArea = () => {
    delete board.dataset.selecting;
    draft.area.setAttribute('width', '0');
    draft.area.setAttribute('height', '0');
  };

  // ---- pointer events

  const onPointerDown = (event: PointerEvent) => {
    fromKeyboard = false;
    // A press whose release never reached the board (it ended outside the window, say) is over.
    if (press) abort();
    if (!(event.target instanceof Element)) return;
    const target = event.target;
    setHovered(null, false);
    if (event.button === 2) {
      lastRightButton = performance.now();
      if (textContextAt(target, event.clientX, event.clientY)) return;
      const found = thingAt(target, event.clientX, event.clientY);
      const pan = !column.contains(target) && !onControl(target) && inViewport(event.clientX, event.clientY);
      if (!found && !pan) return;
      press = { kind: 'right', pointerId: event.pointerId, tracker: new PressTracker({ x: event.clientX, y: event.clientY }), pan, thing: found?.thing ?? null, returnFocus: found?.focus ?? null };
      // The release comes back to the board wherever it happens (a right press selects nothing until then).
      board.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    // AR-1: a card's arrow handle (in the column or on the canvas) starts an arrow.
    const handle = target.closest<HTMLElement>('[data-handle]');
    if (handle && board.contains(handle)) {
      startDraw(event, handle);
      return;
    }
    if (onControl(target)) return;
    const card = target.closest<HTMLElement>('[data-node-id]');
    if (card && board.contains(card)) {
      // A canvas card moves; a column card has its own click and the column's re-order drag.
      if (viewport.contains(card)) startMove(event, card, target);
      return;
    }
    const tracker = new PressTracker({ x: event.clientX, y: event.clientY });
    const additive = event.ctrlKey || event.metaKey;
    if (column.contains(target)) {
      // The column's background: a click on an arrow there selects it (found by distance). The board takes the pointer
      // at once (slice 1d carry-over), so a press dragged out of the board still ends here (its release, or the lost
      // capture), never leaving a stale press behind.
      const hit = gate().select ? hitAt(target, event.clientX, event.clientY) : null;
      if (hit) {
        press = { kind: 'area', pointerId: event.pointerId, tracker, additive, hit, rectangle: false, closes: popoverAtPress };
        board.setPointerCapture(event.pointerId);
      }
      return;
    }
    if (!inViewport(event.clientX, event.clientY)) return;
    const hit = hitAt(target, event.clientX, event.clientY);
    if (!hit && target !== board) return;
    // The canvas takes the keyboard focus, so + / − / 0 and the arrow keys work after a click on it.
    viewport.focus({ preventScroll: true });
    // The Proposed view selects nothing (read-only).
    if (!gate().select) return;
    press = { kind: 'area', pointerId: event.pointerId, tracker, additive, hit, rectangle: true, closes: popoverAtPress };
  };

  const onPointerMove = (event: PointerEvent) => {
    const p = press;
    if (!p) {
      hoverAt(event);
      return;
    }
    if (event.pointerId !== p.pointerId) return;
    const point = { x: event.clientX, y: event.clientY };
    const step = p.tracker.move(point);
    switch (p.kind) {
      case 'right':
        if (!p.pan) return;
        if (step.started) board.dataset.panning = 'true';
        canvas.panBy(step.dx, step.dy);
        return;
      case 'move':
        moveStep(p, step.started, point, event.pointerId);
        return;
      case 'draw':
        if (!p.tracker.dragging) return;
        if (step.started) {
          board.setPointerCapture(event.pointerId);
          board.dataset.drawing = 'true';
          p.sourceCard.dataset.drawSource = 'true';
          store.getState().setHover(null);
        }
        p.at = point;
        updateDraw(p);
        return;
      case 'area':
        if (!p.tracker.dragging || !p.rectangle) return;
        if (step.started) {
          board.setPointerCapture(event.pointerId);
          board.dataset.selecting = 'true';
        }
        drawArea(p, point);
        return;
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    const p = press;
    if (!p || event.pointerId !== p.pointerId) return;
    press = null;
    if (board.hasPointerCapture(event.pointerId)) board.releasePointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    const s = store.getState();
    switch (p.kind) {
      case 'right':
        lastRightButton = performance.now();
        delete board.dataset.panning;
        // CM-7: a right click without movement opens the menu; a right drag only pans (A21).
        if (p.thing && p.tracker.isClick(point)) {
          s.selectForMenu(p.thing);
          o.openMenu({ x: event.clientX, y: event.clientY, thing: p.thing, returnFocus: p.returnFocus });
        }
        return;
      case 'move': {
        if (!p.tracker.dragging) return; // a click: the card's own handler selects it
        suppressNextClick();
        const outcome = canvasDropOutcome(p.cards.map((c) => c.id), p.overColumn);
        leaveColumn(p);
        if (outcome.kind === 'move') {
          finishMove(p, true);
          return;
        }
        // AR-7: dropped on the AXIOMS column: the cards go back, and one card runs "Move to axioms" (its impact first),
        // landing where it was dropped in the column (slice 1d carry-over: as the column's own drop does).
        finishMove(p, false);
        if (outcome.kind === 'to-axioms') s.moveToAxioms(outcome.id, columnDropBefore(engine.cardBoxes(), engine.toBoard(point.x, point.y).y, outcome.id));
        else s.pushToast('info', outcome.reason);
        return;
      }
      case 'draw': {
        if (!p.tracker.dragging) {
          endDraw(p); // a click on the handle: the card's own click handler selects the card
          return;
        }
        suppressNextClick();
        const { target } = drawTargetAt(p.source, point);
        endDraw(p);
        // AR-1: one arrow, source → target (into an axiom: the store states AR-6's impact in its dialog first).
        const release = drawRelease(p.source, target);
        if (release.kind === 'add') s.addArrows(release.target, release.sources);
        else if (release.kind === 'refused') s.pushToast('info', release.reason);
        return;
      }
      case 'area': {
        const additive = p.additive || event.ctrlKey || event.metaKey;
        if (!p.tracker.dragging) {
          // A click: on a drawn arrow or a mark, it selects it (Ctrl/Cmd adds); on empty canvas it clears the
          // selection (Ctrl/Cmd keeps it), unless it only closed a menu. An undeclared arrow has its menu only.
          if (p.hit === null && p.closes) return;
          const click = clickOutcome(p.hit, additive);
          if (click.kind === 'select-arrow') s.selectArrow(click.source, click.target, click.additive);
          else if (click.kind === 'select-mark') s.selectMark(click.id, click.additive);
          else if (click.kind === 'focus-item') s.focusItem(click.item);
          else if (click.kind === 'clear') s.clearSelection();
          return;
        }
        endArea();
        if (!p.rectangle) return;
        suppressNextClick();
        const found = areaSelection(areaRect(p.tracker.start, point), { cards: engine.cardBoxes(), paths: engine.drawnPaths(), marks: engine.drawnMarks() });
        s.selectArea(found, additive);
        return;
      }
    }
  };

  /** Ends the press under way without effect (a move puts its cards back; a draw or a rectangle disappears). */
  const abort = () => {
    const p = press;
    if (!p) return;
    press = null;
    delete board.dataset.panning;
    if (board.hasPointerCapture(p.pointerId)) board.releasePointerCapture(p.pointerId);
    switch (p.kind) {
      case 'move':
        leaveColumn(p);
        if (p.tracker.dragging) finishMove(p, false);
        return;
      case 'draw':
        endDraw(p);
        return;
      case 'area':
        endArea();
        return;
      case 'right':
        return;
    }
  };

  const cancel = (event: PointerEvent) => {
    if (press && event.pointerId === press.pointerId) abort();
  };

  /**
   * Only the board's own capture counts. `lostpointercapture` bubbles: a card's descendant loses the implicit capture
   * that touch and pen pointers get on a press when the board takes the pointer over (a move starting, a right
   * press), and that must not end the press.
   */
  const lostCapture = (event: PointerEvent) => {
    if (event.target === board) cancel(event);
  };

  const onPointerLeave = () => setHovered(null, false);

  const onAnyPointerDown = () => {
    popoverAtPress = document.querySelector('.tl-popover:not(.tl-popover--tooltip)') !== null;
  };

  const onClick = (event: MouseEvent) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.stopPropagation();
    event.preventDefault();
  };

  // CM-7: telelean's menu replaces VS Code's default one on the board, except over a text field or selected text.
  // The mouse's menu opens on the right button's release (above); the keyboard's (Shift+F10, the Menu key) opens here,
  // for the focused card or the canvas, at the card's corner.
  const onContextMenu = (event: MouseEvent) => {
    if (textContextAt(event.target, event.clientX, event.clientY)) return;
    event.preventDefault();
    if (press || performance.now() - lastRightButton < 1000 || !(event.target instanceof HTMLElement)) return;
    const target = event.target;
    const card = target.closest<HTMLElement>('[data-node-id]');
    const r = (card ?? target).getBoundingClientRect();
    if (card?.dataset.nodeId) {
      const thing: MenuThing = { kind: 'card', id: card.dataset.nodeId };
      store.getState().selectForMenu(thing);
      o.openMenu({ x: r.left + 12, y: r.top + Math.min(r.height, 28), thing, returnFocus: card });
    } else if (target === viewport) {
      const thing: MenuThing = { kind: 'canvas', at: canvas.clientToCanvas(r.left + r.width / 2, r.top + r.height / 2) };
      o.openMenu({ x: r.left + r.width / 2, y: r.top + r.height / 2, thing, returnFocus: viewport });
    }
  };

  const onWheel = (event: WheelEvent) => {
    if (!(event.target instanceof Element) || column.contains(event.target)) return; // the column scrolls itself
    if (!inViewport(event.clientX, event.clientY)) return;
    event.preventDefault();
    if (event.deltaY === 0) return;
    canvas.zoomAtClient(event.clientX, event.clientY, wheelFactor(event.deltaY, event.deltaMode, event.ctrlKey, viewport.clientHeight));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || isTextEntry(target)) return;
    const onCanvas = target === viewport;
    // The canvas, or a card on it (not a control inside an expanded card).
    if (!onCanvas && !(target.matches('.tl-card') && viewport.contains(target))) return;
    const pan = event.shiftKey ? KEY_PAN * 4 : KEY_PAN;
    switch (event.key) {
      case '+':
      case '=':
        canvas.zoomStep(1);
        break;
      case '-':
      case '_':
        canvas.zoomStep(-1);
        break;
      case '0':
        canvas.fitAll();
        break;
      case 'ArrowLeft':
        if (!onCanvas) return;
        canvas.panBy(pan, 0);
        break;
      case 'ArrowRight':
        if (!onCanvas) return;
        canvas.panBy(-pan, 0);
        break;
      case 'ArrowUp':
        if (!onCanvas) return;
        canvas.panBy(0, pan);
        break;
      case 'ArrowDown':
        if (!onCanvas) return;
        canvas.panBy(0, -pan);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const onAnyKey = (event: KeyboardEvent) => {
    fromKeyboard = true;
    if (event.key !== 'Escape' || !press || press.kind === 'right') return;
    // Escape cancels a move (its cards go back), a draw or a rectangle under way, and does nothing else then (the
    // selection stays). A press that has not become a drag just ends, and Escape goes on as usual.
    const dragging = press.tracker.dragging;
    abort();
    if (!dragging) return;
    event.preventDefault();
    event.stopPropagation();
  };

  // BD-3: the canvas follows the card the keyboard focused (Tab, Shift+Tab).
  const onFocusIn = (event: FocusEvent) => {
    if (!fromKeyboard || !(event.target instanceof HTMLElement)) return;
    const slot = event.target.closest<HTMLElement>(SLOT_SELECTOR);
    const id = slot?.dataset.slotId;
    if (id && event.target.matches('.tl-card')) canvas.follow(id);
  };

  // Belt and braces: the viewport clips its content (overflow: clip), so nothing should scroll it; if the browser
  // scrolls it anyway (bringing a focused card into view), the scroll becomes a pan.
  const onViewportScroll = () => {
    const { scrollLeft, scrollTop } = viewport;
    if (scrollLeft === 0 && scrollTop === 0) return;
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
    canvas.panBy(-scrollLeft, -scrollTop);
  };

  // The rubber band follows the source card when the column scrolls or the canvas pans or zooms during a draw (the
  // engine draws a frame after each of them).
  const offFrame = engine.onFrame(() => {
    if (press?.kind === 'draw' && press.tracker.dragging) updateDraw(press);
  });

  // ES-9: an edit session that begins during a move or a draw ends it (the host would refuse the edit), and switching
  // to the Proposed view ends any gesture but a pan.
  const offStore = store.subscribe((state) => {
    const p = press;
    if (!p || p.kind === 'right') return;
    const g = gestureGateOf(state);
    if ((p.kind === 'move' && g.move !== null) || (p.kind === 'draw' && g.draw !== null) || (p.kind === 'area' && !g.select)) abort();
  });

  document.addEventListener('pointerdown', onAnyPointerDown, true);
  board.addEventListener('pointerdown', onPointerDown);
  board.addEventListener('pointermove', onPointerMove);
  board.addEventListener('pointerup', onPointerUp);
  board.addEventListener('pointercancel', cancel);
  board.addEventListener('pointerleave', onPointerLeave);
  board.addEventListener('lostpointercapture', lostCapture);
  board.addEventListener('click', onClick, true);
  board.addEventListener('contextmenu', onContextMenu);
  board.addEventListener('wheel', onWheel, { passive: false });
  viewport.addEventListener('keydown', onKeyDown);
  window.addEventListener('keydown', onAnyKey, true);
  viewport.addEventListener('focusin', onFocusIn);
  viewport.addEventListener('scroll', onViewportScroll);
  return () => {
    abort();
    offFrame();
    offStore();
    document.removeEventListener('pointerdown', onAnyPointerDown, true);
    board.removeEventListener('pointerdown', onPointerDown);
    board.removeEventListener('pointermove', onPointerMove);
    board.removeEventListener('pointerup', onPointerUp);
    board.removeEventListener('pointercancel', cancel);
    board.removeEventListener('pointerleave', onPointerLeave);
    board.removeEventListener('lostpointercapture', lostCapture);
    board.removeEventListener('click', onClick, true);
    board.removeEventListener('contextmenu', onContextMenu);
    board.removeEventListener('wheel', onWheel);
    viewport.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keydown', onAnyKey, true);
    viewport.removeEventListener('focusin', onFocusIn);
    viewport.removeEventListener('scroll', onViewportScroll);
  };
}
