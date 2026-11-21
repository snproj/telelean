/**
 * The PROPOSITIONS canvas's view (spec v4 BD-3, slice 1c): the pan and zoom of one viewport, applied without React.
 * The transform lives here, not in the store, so panning and zooming never re-render a card: it is written as CSS
 * custom properties on the viewport (`--tl-tx`, `--tl-ty`, `--tl-s`, through the CSSOM, which the CSP allows), and
 * the canvas layer's class turns them into `transform: translate(tx, ty) scale(s)`. Listeners (the edge engine, the
 * toolbar's zoom label) hear every change; popovers hear the `tl-canvas-view` event the viewport dispatches.
 *
 * `layout` is the canvas as PropositionCanvas lays it out: every card's position (stored or placed) and collapsed
 * size, in canvas coordinates. The board's pointer handlers, the toolbar and the reveals read it.
 */
import { besideAxiom, newCardPosition, PLACEMENT } from './placement';
import {
  boundsOf,
  centerOn,
  clampScale,
  FIT_ALL,
  fitView,
  followView,
  IDENTITY,
  interpolateView,
  revealView,
  sameView,
  toCanvas,
  zoomAbout,
  zoomStep,
  type Box,
  type FitOptions,
  type Point,
  type Size,
  type ViewTransform,
} from './view';

/** Dispatched (bubbling) on the viewport after each view change, so popovers anchored in a card can follow it. */
export const CANVAS_VIEW_EVENT = 'tl-canvas-view';

/** How long an animated view change (a reveal, Fit all) takes, unless motion is reduced. */
const ANIMATION_MS = 180;

/** The first view of a board: Fit all, but never so small that the first cards cannot be read. */
const INITIAL_FIT: FitOptions = { margin: 32, maxScale: 1, minScale: 0.6 };

/** Zoom to selection: fit the selected cards, zooming in up to 150 %. */
const SELECTION_FIT: FitOptions = { margin: 48, maxScale: 1.5, minScale: FIT_ALL.minScale };

/**
 * What a new proposition goes next to (BD-8): a card on the canvas (by id), or an axiom of the AXIOMS column (the
 * client y of its top: the new card goes level with it).
 */
export type NewCardAnchor = { kind: 'canvas'; id: string } | { kind: 'axiom'; clientTop: number };

export function reducedMotion(): boolean {
  return document.body.classList.contains('vscode-reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export class CanvasView {
  private viewport: HTMLElement | null = null;
  private view: ViewTransform = IDENTITY;
  private animation = 0;
  private readonly listeners = new Set<() => void>();
  private readonly layoutListeners = new Set<() => void>();
  private boxes: ReadonlyMap<string, Box> = new Map();
  private tidyPlanner: ((which: readonly string[] | null) => Record<string, Point>) | null = null;
  /** The subject the view was last fitted for: a board seen for the first time (or another subject) is fitted. */
  fittedFor: string | null = null;

  attach(viewport: HTMLElement): void {
    this.viewport = viewport;
    this.write();
  }

  detach(): void {
    this.stopAnimation();
    this.viewport = null;
  }

  get transform(): ViewTransform {
    return this.view;
  }

  get element(): HTMLElement | null {
    return this.viewport;
  }

  /** The viewport's size (its padding box). */
  size(): Size {
    return { w: this.viewport?.clientWidth ?? 0, h: this.viewport?.clientHeight ?? 0 };
  }

  /** Every card on the canvas: its position and collapsed size (canvas coordinates). */
  get layout(): ReadonlyMap<string, Box> {
    return this.boxes;
  }

  /** PropositionCanvas, after each placement: the cards' boxes. The edge engine re-measures. */
  setLayout(boxes: ReadonlyMap<string, Box>): void {
    this.boxes = boxes;
    for (const listener of this.layoutListeners) listener();
  }

  /** PropositionCanvas: how Tidy layout places cards (it has the placement's input). */
  setTidyPlanner(planner: ((which: readonly string[] | null) => Record<string, Point>) | null): void {
    this.tidyPlanner = planner;
  }

  /** Tidy layout: new positions for `which` (every proposition when null), not stored yet. */
  tidyPositions(which: readonly string[] | null): Record<string, Point> {
    return this.tidyPlanner?.(which) ?? {};
  }

  /** Called after every view change. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Called when the cards' layout changes (a placement, a move). */
  onLayout(listener: () => void): () => void {
    this.layoutListeners.add(listener);
    return () => this.layoutListeners.delete(listener);
  }

  /** Shows `next` (the scale clamped to the zoom range); `animate` eases there unless motion is reduced. */
  set(next: ViewTransform, animate = false): void {
    const target = { x: next.x, y: next.y, s: clampScale(next.s) };
    if (![target.x, target.y].every(Number.isFinite)) return;
    this.stopAnimation();
    if (!animate || reducedMotion() || !this.viewport) {
      this.apply(target);
      return;
    }
    const from = this.view;
    const size = this.size();
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ANIMATION_MS);
      const eased = 1 - Math.pow(1 - k, 3);
      this.apply(k >= 1 ? target : interpolateView(from, target, eased, size));
      this.animation = k >= 1 ? 0 : requestAnimationFrame(step);
    };
    this.animation = requestAnimationFrame(step);
  }

  panBy(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    const v = this.view;
    this.set({ x: v.x + dx, y: v.y + dy, s: v.s });
  }

  /** Zooms by `factor` about the client point (x, y) (the wheel: about the cursor). */
  zoomAtClient(clientX: number, clientY: number, factor: number): void {
    const origin = this.origin();
    this.set(zoomAbout(this.view, { x: clientX - origin.x, y: clientY - origin.y }, factor));
  }

  /** + / − and the toolbar: one step about the viewport's centre. */
  zoomStep(direction: 1 | -1): void {
    this.set(zoomStep(this.view, this.size(), direction));
  }

  /** Fit all: every card in view (at most 100 %). False when there is no card. */
  fitAll(animate = true): boolean {
    const box = boundsOf(this.boxes.values());
    if (!box) return false;
    this.set(fitView(box, this.size(), FIT_ALL), animate);
    return true;
  }

  /** The first view of a board: Fit all, at 60 % at least (the top-left cards then show). */
  fitInitial(): boolean {
    const box = boundsOf(this.boxes.values());
    if (!box || this.size().w === 0) return false;
    this.set(fitView(box, this.size(), INITIAL_FIT));
    return true;
  }

  /** Zoom to selection: the given cards in view. False when none of them is on the canvas. */
  fitCards(ids: Iterable<string>): boolean {
    const boxes = [...ids].flatMap((id) => {
      const box = this.boxes.get(id);
      return box ? [box] : [];
    });
    const box = boundsOf(boxes);
    if (!box) return false;
    this.set(fitView(box, this.size(), SELECTION_FIT), true);
    return true;
  }

  /**
   * BD-3 "Show on board and every other reveal pan and zoom the canvas to the card": centres it (at 100 % when the view
   * is smaller than readable), unless it is in view already. `box` overrides the layout (a card expanded since).
   */
  reveal(id: string, box?: Box): boolean {
    const target = box ?? this.boxes.get(id);
    if (!target) return false;
    const next = revealView(this.view, target, this.size());
    if (next && !sameView(next, this.view)) this.set(next, true);
    return true;
  }

  /** BD-4: a canvas edge's "n linked" badge pans (at the current zoom) to centre the card. */
  panTo(id: string): boolean {
    const box = this.boxes.get(id);
    if (!box) return false;
    this.set(centerOn(box, this.size(), this.view.s), true);
    return true;
  }

  /** The canvas follows the focused card: the smallest pan that brings it into view. */
  follow(id: string, box?: Box): void {
    const target = box ?? this.boxes.get(id);
    if (!target) return;
    const next = followView(this.view, target, this.size());
    if (next) this.set(next);
  }

  /** The canvas point under a client point. */
  clientToCanvas(clientX: number, clientY: number): Point {
    const origin = this.origin();
    return toCanvas(this.view, { x: clientX - origin.x, y: clientY - origin.y });
  }

  /**
   * BD-8: where a new proposition from the A|P box goes, never on top of another card: right of the selected card
   * when it is on the canvas; at the canvas's left side, level with it (in view), when it is an axiom of the column;
   * else in the middle of the view.
   */
  newCardPosition(near: NewCardAnchor | null, size: Size = { w: PLACEMENT.cardWidth, h: PLACEMENT.estimatedHeight }): Point {
    const viewSize = this.size();
    const center = toCanvas(this.view, { x: viewSize.w / 2, y: viewSize.h / 2 });
    const boxes = [...this.boxes.values()];
    if (near?.kind === 'axiom') {
      const beside = besideAxiom(this.view, viewSize, near.clientTop - this.origin().y, size);
      return newCardPosition({ near: null, beside, center, boxes, size });
    }
    return newCardPosition({ near: near ? (this.boxes.get(near.id) ?? null) : null, center, boxes, size });
  }

  /** The viewport's padding-box corner in client coordinates. */
  private origin(): Point {
    const viewport = this.viewport;
    if (!viewport) return { x: 0, y: 0 };
    const r = viewport.getBoundingClientRect();
    return { x: r.left + viewport.clientLeft, y: r.top + viewport.clientTop };
  }

  private stopAnimation(): void {
    if (this.animation) cancelAnimationFrame(this.animation);
    this.animation = 0;
  }

  private apply(view: ViewTransform): void {
    if (sameView(view, this.view)) return;
    this.view = view;
    this.write();
  }

  private write(): void {
    const viewport = this.viewport;
    if (viewport) {
      viewport.style.setProperty('--tl-tx', `${this.view.x}px`);
      viewport.style.setProperty('--tl-ty', `${this.view.y}px`);
      viewport.style.setProperty('--tl-s', String(this.view.s));
      viewport.dispatchEvent(new Event(CANVAS_VIEW_EVENT, { bubbles: true }));
    }
    for (const listener of this.listeners) listener();
  }
}

let current: CanvasView | null = null;

/** The board's canvas (one per webview), for the reveals of cards and the A|P box's placement. */
export function setCurrentCanvas(view: CanvasView | null): void {
  current = view;
}

export function currentCanvas(): CanvasView | null {
  return current;
}
