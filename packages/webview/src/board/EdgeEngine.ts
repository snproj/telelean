/**
 * Imperative SVG edge overlay across the board's two parts (03 section 7, "EdgeEngine"; spec v4 BD-4, slice 1c): the
 * AXIOMS column, which scrolls, and the PROPOSITIONS canvas, which pans and zooms. One overlay under both: arrows run
 * beneath the cards (so an expanded card covers them), and clip paths keep them to the column's visible band and the
 * canvas viewport.
 *
 * React renders the cards; this class owns the <path> elements, the "follows from nothing" stubs and the "n linked"
 * badges, so scrolling, panning, zooming and hovering never re-render React. At most one requestAnimationFrame runs
 * per change:
 *   READ    card boxes (getBoundingClientRect, in each part's own coordinates: the column list's content, or the
 *           canvas, by inverting the view transform) and the two viewports, only when the layout is dirty
 *           (ResizeObserver / MutationObserver / a placement or a move on the canvas), plus the column's scrollTop and
 *           the canvas's view every frame;
 *   COMPUTE pure geometry (geometry.ts);
 *   WRITE   reconcile pools of <path> and stub elements, touching an attribute only when its value changed.
 * Cards are found by `[data-node-id]` inside the column list and the canvas layer, so nothing has to register.
 *
 * Slice 1c2 (CM-2, AR-1): every drawn arrow, and every arrow a proof uses without a declaration, gets a transparent
 * wide hit path right after its visible path (`path.tl-edge-hit`, `pointer-events: stroke`, with `data-hit` = drawn |
 * undeclared and the arrow's tooltip): the board's handlers select it, hover it and open its menu from there. Each ∅
 * stub gets one too. The visible paths take no pointer. Over the AXIOMS column the list lies above the overlay, so the
 * engine also answers geometric questions from its last frame: the arrow near a point there (`hitTestColumn`), the
 * cards, arrows and marks as shown (the selection rectangle), and where an arrow out of a card starts (the rubber band).
 *
 * Slice 1d (BD-7): it also draws the bands (`setBands`, from board/band.ts): a bracket across the arrows a checked
 * proof uses, just before they reach the card (several arrows into one canvas card arrive spread along its left edge,
 * a band's together), with a ✓ seal when complete; in their own group, above the arrows and stubs, under the canvas clip.
 */
import type { CanvasView } from './canvas/CanvasView';
import { edgeClass, markerVariant } from './edges';
import { arrowAt, hitRole, inColumnRegion, type CardBox, type DrawnMark, type DrawnPath, type HitRole } from './gestures';
import {
  anchor,
  badgeLabel,
  badgeText,
  canvasRect,
  cardRect,
  computeFrame,
  DEFAULT_GEOMETRY,
  visibility,
  type BadgeSpec,
  type BandShape,
  type BandSpec,
  type CanvasGeom,
  type CanvasSide,
  type CardGeom,
  type ColumnGeom,
  type EdgeSpec,
  type FrameOutput,
  type GeometryOptions,
  type MarkSpec,
  type PathSpec,
  type Point,
  type Rect,
} from './geometry';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The board element's attribute that names the graph on screen (see `EdgeEngineStats.graphSeq`). */
export const GRAPH_SEQ_ATTRIBUTE = 'data-graph-seq';

export interface EdgeEngineElements {
  /** Positioned container; the SVG overlay fills its padding box. Carries `data-graph-seq`. */
  board: HTMLElement;
  /** The AXIOMS column: its scroll container and the empty "▲ / ▼ n linked" slots of its header and footer. */
  column: { list: HTMLElement; up: HTMLElement; down: HTMLElement };
  /** The canvas: its viewport, the transformed layer holding the cards, its view, and one badge slot per edge. */
  canvas: { viewport: HTMLElement; layer: HTMLElement; view: CanvasView; slots: Readonly<Record<CanvasSide, HTMLElement>> };
  /** The overlay; its clip rectangles carry `data-clip` = column | gap | canvas. */
  svg: SVGSVGElement;
  /** Arrows under the board clip, arrows under the canvas clip, the ∅ stubs, and (slice 1d) the bands. */
  groups: { board: SVGGElement; canvas: SVGGElement; marks: SVGGElement; bands: SVGGElement };
}

export interface EdgeEngineStats {
  frames: number;
  measures: number;
  /**
   * The board's `data-graph-seq` at the last measure: which applied graph the cached geometry belongs to. (A graph's
   * own version is not enough: two graphs can share one, and their DOM can have the same number of cards.)
   */
  graphSeq: number;
  /** Smallest viewport height (the column's list, the canvas) at the last measure (0 while there is no layout yet). */
  minColumnHeight: number;
  /** Cards found at the last measure (column and canvas). */
  cards: number;
  /** Whether the elements the engine watches are still in the document. */
  listsConnected: boolean;
  drawn: number;
  stubs: number;
  marks: number;
  /** Slice 1d: bands drawn (complete or open). */
  bands: number;
  culled: number;
  missing: number;
  overBudget: number;
  lastFrameMs: number;
}

interface PathRecord {
  el: SVGPathElement;
  d: string;
  cls: string;
  marker: string;
  stub: string;
  cut: string;
  pattern: string;
  conditional: boolean;
  mismatch: string;
  title: string;
  titleEl: SVGTitleElement | null;
  group: SVGGElement | null;
  /** Slice 1c2: the hit path after it (null for a mention, which is not selectable). */
  hit: SVGPathElement | null;
  hitRole: HitRole | '';
  hitD: string;
  hitTitle: string;
  hitTitleEl: SVGTitleElement | null;
}

/** Slice 1d: one band's elements (a bracket, the ✓ seal of a complete band, the tooltip). */
interface BandRecord {
  el: SVGGElement;
  bar: SVGPathElement;
  seal: SVGCircleElement;
  check: SVGTextElement;
  title: SVGTitleElement;
  key: string;
}

interface MarkRecord {
  el: SVGGElement;
  /** Slice 1c2: the stub's wide transparent hit line (a click selects the mark). */
  hit: SVGPathElement;
  line: SVGPathElement;
  label: SVGTextElement;
  d: string;
  cls: string;
  x: string;
  y: string;
}

/** The arrowheads (edges.ts decides them from the arrow's look; kept importable from here). */
export { markerVariant, MARKER_VARIANTS } from './edges';

export class EdgeEngine {
  private edges: readonly EdgeSpec[] = [];
  private focus: ReadonlySet<string> = new Set();
  private selectedEdges: ReadonlySet<string> = new Set();
  private marks: readonly string[] = [];
  private selectedMarks: ReadonlySet<string> = new Set();
  /** Slice 1d (BD-7): the bands to draw (board/band.ts). */
  private bands: readonly BandSpec[] = [];
  private readonly bandPool = new Map<string, BandRecord>();
  /** Slice 1c2: the arrow (edge id) or ∅ stub (card id) under the pointer. */
  private hoveredEdge: string | null = null;
  private hoveredMark: string | null = null;
  /** The last frame's paths and stubs, for the geometric questions (hit-testing in the column, the rectangle). */
  private lastPaths: readonly PathSpec[] = [];
  private lastMarks: readonly MarkSpec[] = [];
  private column: ColumnGeom | null = null;
  private canvasBox: Omit<CanvasGeom, 'view'> | null = null;
  private cards = new Map<string, CardGeom>();
  private readonly observedCards = new Set<Element>();
  private readonly pool = new Map<string, PathRecord>();
  private readonly markPool = new Map<string, MarkRecord>();
  private readonly badgeButtons = new Map<string, HTMLButtonElement>();
  private readonly badgeTargets = new Map<string, BadgeSpec>();
  private layoutDirty = true;
  private raf = 0;
  private disposed = false;
  private readonly resizeObserver: ResizeObserver;
  private readonly mutationObserver: MutationObserver;
  private readonly onScroll = () => this.schedule();
  private readonly unsubscribe: Array<() => void> = [];
  private readonly listeners = new Set<(stats: EdgeEngineStats) => void>();

  readonly stats: EdgeEngineStats = {
    frames: 0,
    measures: 0,
    graphSeq: 0,
    minColumnHeight: 0,
    cards: 0,
    listsConnected: false,
    drawn: 0,
    stubs: 0,
    marks: 0,
    bands: 0,
    culled: 0,
    missing: 0,
    overBudget: 0,
    lastFrameMs: 0,
  };

  constructor(
    private readonly el: EdgeEngineElements,
    private readonly opts: GeometryOptions = DEFAULT_GEOMETRY,
  ) {
    this.resizeObserver = new ResizeObserver(() => this.invalidateLayout());
    // Cards added, removed or edited change boxes without resizing the lists. A new graph always re-measures, even
    // when its cards render to the same DOM as the previous graph's.
    this.mutationObserver = new MutationObserver(() => this.invalidateLayout());
    this.mutationObserver.observe(el.board, { attributes: true, attributeFilter: [GRAPH_SEQ_ATTRIBUTE] });
    this.mutationObserver.observe(el.column.list, { childList: true, subtree: true, characterData: true });
    this.mutationObserver.observe(el.canvas.layer, { childList: true, subtree: true, characterData: true });
    this.resizeObserver.observe(el.board);
    this.resizeObserver.observe(el.column.list);
    this.resizeObserver.observe(el.canvas.viewport);
    el.column.list.addEventListener('scroll', this.onScroll, { passive: true });
    // Pan and zoom only move the cached boxes (no measure); a placement or a move changes them.
    this.unsubscribe.push(el.canvas.view.onChange(() => this.schedule()));
    this.unsubscribe.push(el.canvas.view.onLayout(() => this.invalidateLayout()));
    this.schedule();
  }

  setEdges(edges: readonly EdgeSpec[]): void {
    this.edges = edges;
    this.schedule();
  }

  setFocus(ids: ReadonlySet<string>): void {
    this.focus = ids;
    this.schedule();
  }

  /** CM-2: the selected arrows (edge ids `${source}->${target}`) and "follows from nothing" marks (card ids). */
  setSelection(edges: ReadonlySet<string>, marks: ReadonlySet<string>): void {
    this.selectedEdges = edges;
    this.selectedMarks = marks;
    this.schedule();
  }

  /** AR-5: the cards marked "follows from nothing" (each gets a ∅ stub). */
  setMarks(ids: readonly string[]): void {
    this.marks = ids;
    this.schedule();
  }

  /** Slice 1d (BD-7): the bands (each binds its arrows, or its card's ∅ stub, just before the card). */
  setBands(bands: readonly BandSpec[]): void {
    this.bands = bands;
    this.schedule();
  }

  /** Slice 1c2: the arrow (edge id) or ∅ stub (card id) under the pointer gets the hover look; null for none. */
  setHovered(edge: string | null, mark: string | null): void {
    if (this.hoveredEdge === edge && this.hoveredMark === mark) return;
    this.hoveredEdge = edge;
    this.hoveredMark = mark;
    this.schedule();
  }

  invalidateLayout(): void {
    this.layoutDirty = true;
    this.schedule();
  }

  // ---- slice 1c2: geometric questions, from the last frame (board space: the board's padding box)

  /** The board-space point of a client point. */
  toBoard(clientX: number, clientY: number): Point {
    const board = this.el.board;
    const b = board.getBoundingClientRect();
    return { x: clientX - b.left - board.clientLeft, y: clientY - b.top - board.clientTop };
  }

  /** The canvas viewport in board space (null before the first measure). */
  canvasViewRect(): Rect | null {
    const box = this.canvasBox;
    return box ? canvasRect({ ...box, view: this.el.canvas.view.transform }) : null;
  }

  /** The arrows of the last frame that take the pointer (drawn ones, and those a proof uses without a declaration). */
  drawnPaths(): DrawnPath[] {
    const out: DrawnPath[] = [];
    for (const p of this.lastPaths) {
      const role = hitRole(p.edge);
      if (role) out.push({ id: p.edge.id, source: p.edge.source, target: p.edge.target, role, d: p.d, stub: p.stub });
    }
    return out;
  }

  /** The ∅ stubs of the last frame. */
  drawnMarks(): DrawnMark[] {
    return this.lastMarks.map((m) => ({ id: m.id, d: m.d }));
  }

  /** Every measured card's box as shown now (the column's scroll and the canvas's view applied). */
  cardBoxes(): CardBox[] {
    const input = this.frameGeometry();
    if (!input) return [];
    return [...this.cards].map(([id, card]) => ({ id, part: card.part, rect: cardRect(card, input) }));
  }

  /**
   * Where an arrow out of card `id` starts now: its right edge, on the title line, kept inside the part of it that
   * shows (the rubber band's start). Null when the card is out of view or not measured.
   */
  sourceAnchor(id: string): Point | null {
    const input = this.frameGeometry();
    const card = this.cards.get(id);
    if (!input || !card) return null;
    const rect = cardRect(card, input);
    const vis = visibility(card, rect, input, this.opts);
    if (!vis.visible) return null;
    return anchor(rect, 'R', card.part === 'canvas' ? input.canvas.view.s : 1, vis, this.opts);
  }

  /**
   * The arrow near board point `p` over the AXIOMS column (its visible band, or the strip between it and the canvas),
   * by distance: the column lies above the overlay there, so its hit paths never get the pointer. Null elsewhere.
   */
  hitTestColumn(p: Point): DrawnPath | null {
    const column = this.column;
    const box = this.canvasBox;
    if (!column || !box) return null;
    if (!inColumnRegion(p, column, box.left)) return null;
    // Only arrows drawn under the board clip reach the column (the canvas clip keeps the others in the canvas).
    const clipped = new Set(this.lastPaths.filter((x) => x.clip === 'board').map((x) => x.edge.id));
    return arrowAt(this.drawnPaths().filter((x) => clipped.has(x.id)), p);
  }

  /** The inputs `cardRect` needs, read now (the column's scroll and the canvas's view change without a measure). */
  private frameGeometry(): { column: ColumnGeom; scrollTop: number; canvas: CanvasGeom } | null {
    const column = this.column;
    const box = this.canvasBox;
    if (!column || !box) return null;
    return { column, scrollTop: this.el.column.list.scrollTop, canvas: { ...box, view: this.el.canvas.view.transform } };
  }

  /** Called after each frame (diagnostics and tests). */
  onFrame(listener: (stats: EdgeEngineStats) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  schedule(): void {
    if (this.raf === 0 && !this.disposed) this.raf = requestAnimationFrame(this.frame);
  }

  dispose(): void {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.mutationObserver.disconnect();
    this.el.column.list.removeEventListener('scroll', this.onScroll);
    for (const off of this.unsubscribe) off();
    for (const rec of this.pool.values()) {
      rec.el.remove();
      rec.hit?.remove();
    }
    for (const rec of this.markPool.values()) rec.el.remove();
    for (const rec of this.bandPool.values()) rec.el.remove();
    for (const button of this.badgeButtons.values()) button.remove();
    this.pool.clear();
    this.markPool.clear();
    this.bandPool.clear();
    this.badgeButtons.clear();
    this.listeners.clear();
  }

  private readonly frame = (): void => {
    this.raf = 0;
    if (this.disposed) return;
    const t0 = performance.now();
    if (this.layoutDirty) {
      this.layoutDirty = false;
      this.measure();
    }
    const column = this.column;
    const box = this.canvasBox;
    if (!column || !box) return;
    const out = computeFrame(
      {
        column,
        scrollTop: this.el.column.list.scrollTop,
        canvas: { ...box, view: this.el.canvas.view.transform },
        cards: this.cards,
        edges: this.edges,
        focus: this.focus,
        selectedEdges: this.selectedEdges,
        marks: this.marks,
        selectedMarks: this.selectedMarks,
        bands: this.bands,
      },
      this.opts,
    );
    this.lastPaths = out.paths;
    this.lastMarks = out.marks;
    this.writePaths(out);
    this.writeMarks(out.marks);
    this.writeBands(out.bands);
    this.writeBadges(out.badges);
    const s = this.stats;
    s.frames++;
    s.drawn = out.paths.length;
    s.stubs = out.paths.filter((p) => p.stub).length;
    s.marks = out.marks.length;
    s.bands = out.bands.length;
    s.culled = out.culled;
    s.missing = out.missing;
    s.overBudget = out.overBudget;
    s.lastFrameMs = performance.now() - t0;
    for (const listener of this.listeners) listener(s);
  };

  /** READ phase: the viewports and the card boxes. Runs only when the layout changed. */
  private measure(): void {
    const { board, column: col, canvas, svg } = this.el;
    this.stats.measures++;
    this.stats.graphSeq = Number(board.getAttribute(GRAPH_SEQ_ATTRIBUTE)) || 0;
    const b = board.getBoundingClientRect();
    const bx = b.left + board.clientLeft;
    const by = b.top + board.clientTop;
    const cards = new Map<string, CardGeom>();
    const seen = new Set<Element>();

    const list = col.list;
    const r = list.getBoundingClientRect();
    const contentLeft = r.left + list.clientLeft;
    const contentTop = r.top + list.clientTop;
    const column: ColumnGeom = {
      originX: contentLeft - bx,
      originY: contentTop - by,
      left: contentLeft - bx,
      right: contentLeft - bx + list.clientWidth,
      viewTop: contentTop - by,
      viewBottom: contentTop - by + list.clientHeight,
    };
    const scrollTop = list.scrollTop;
    for (const card of list.querySelectorAll<HTMLElement>('[data-node-id]')) {
      const id = card.dataset.nodeId;
      if (!id) continue;
      const c = card.getBoundingClientRect();
      cards.set(id, { part: 'column', left: c.left - contentLeft, top: c.top - contentTop + scrollTop, width: c.width, height: c.height });
      seen.add(card);
    }

    const viewport = canvas.viewport;
    const v = viewport.getBoundingClientRect();
    const vx = v.left + viewport.clientLeft;
    const vy = v.top + viewport.clientTop;
    const box = { left: vx - bx, top: vy - by, right: vx - bx + viewport.clientWidth, bottom: vy - by + viewport.clientHeight };
    // The cards' boxes in canvas coordinates: what the view transform maps to their screen boxes.
    const t = canvas.view.transform;
    for (const card of canvas.layer.querySelectorAll<HTMLElement>('[data-node-id]')) {
      const id = card.dataset.nodeId;
      if (!id) continue;
      const c = card.getBoundingClientRect();
      cards.set(id, { part: 'canvas', left: (c.left - vx - t.x) / t.s, top: (c.top - vy - t.y) / t.s, width: c.width / t.s, height: c.height / t.s });
      seen.add(card);
    }

    // Keep the ResizeObserver on exactly the current cards (text reflow, font loads, expand/collapse).
    for (const card of seen) {
      if (!this.observedCards.has(card)) {
        this.resizeObserver.observe(card);
        this.observedCards.add(card);
      }
    }
    for (const card of this.observedCards) {
      if (!seen.has(card)) {
        this.resizeObserver.unobserve(card);
        this.observedCards.delete(card);
      }
    }
    this.column = column;
    this.canvasBox = box;
    this.cards = cards;
    this.stats.minColumnHeight = Math.min(list.clientHeight, viewport.clientHeight);
    this.stats.cards = cards.size;
    this.stats.listsConnected = list.isConnected && viewport.isConnected;

    // The clips: arrows between two canvas cards stay in the canvas; the others may also use the column's visible
    // band and the strip between the column's list and the canvas (its scrollbar and border).
    const gapTop = Math.max(column.viewTop, box.top);
    const gapBottom = Math.min(column.viewBottom, box.bottom);
    const rects: Record<string, { x: number; y: number; w: number; h: number }> = {
      column: { x: column.left, y: column.viewTop, w: column.right - column.left, h: column.viewBottom - column.viewTop },
      gap: { x: column.right, y: gapTop, w: Math.max(0, box.left - column.right), h: Math.max(0, gapBottom - gapTop) },
      canvas: { x: box.left, y: box.top, w: box.right - box.left, h: box.bottom - box.top },
    };
    for (const rect of svg.querySelectorAll<SVGRectElement>('rect[data-clip]')) {
      const value = rects[rect.dataset.clip ?? ''];
      if (!value) continue;
      rect.setAttribute('x', String(value.x));
      rect.setAttribute('y', String(value.y));
      rect.setAttribute('width', String(Math.max(0, value.w)));
      rect.setAttribute('height', String(Math.max(0, value.h)));
    }
  }

  /** WRITE phase for paths: reconcile the pool, touching only changed attributes. */
  private writePaths(out: FrameOutput): void {
    const seen = new Set<string>();
    for (const p of out.paths) {
      const { edge } = p;
      seen.add(edge.id);
      let rec = this.pool.get(edge.id);
      if (!rec) {
        const el = document.createElementNS(SVG_NS, 'path');
        el.dataset.edgeId = edge.id;
        el.dataset.source = edge.source;
        el.dataset.target = edge.target;
        rec = {
          el,
          d: '',
          cls: '',
          marker: '',
          stub: '',
          cut: '',
          pattern: '',
          conditional: false,
          mismatch: '',
          title: '',
          titleEl: null,
          group: null,
          hit: null,
          hitRole: '',
          hitD: '',
          hitTitle: '',
          hitTitleEl: null,
        };
        this.pool.set(edge.id, rec);
      }
      // Slice 1d (BD-5): the line, head and colour come from the arrow's look (edges.ts arrowLook), never decided here.
      const cls = edgeClass(edge, { stub: p.stub !== null, focused: p.focused, selected: p.selected, hovered: this.hoveredEdge === edge.id });
      if (rec.cls !== cls) rec.el.setAttribute('class', (rec.cls = cls));
      const marker = `url(#tl-arrow-${markerVariant(edge, p.focused || p.selected)})`;
      if (rec.marker !== marker) rec.el.setAttribute('marker-end', (rec.marker = marker));
      if (rec.pattern !== edge.pattern) rec.el.dataset.pattern = rec.pattern = edge.pattern;
      const conditional = edge.conditional === true;
      if (rec.conditional !== conditional) {
        if (conditional) rec.el.dataset.conditional = 'true';
        else delete rec.el.dataset.conditional;
        rec.conditional = conditional;
      }
      const mismatch = edge.mismatch ?? '';
      if (rec.mismatch !== mismatch) {
        if (mismatch) rec.el.dataset.mismatch = mismatch;
        else delete rec.el.dataset.mismatch;
        rec.mismatch = mismatch;
      }
      const title = edge.title ?? '';
      if (rec.title !== title) {
        // An SVG tooltip is a <title> child (textContent: never parsed as markup).
        if (title) {
          rec.titleEl ??= rec.el.appendChild(document.createElementNS(SVG_NS, 'title'));
          rec.titleEl.textContent = title;
        } else if (rec.titleEl) {
          rec.titleEl.remove();
          rec.titleEl = null;
        }
        rec.title = title;
      }
      const stub = p.stub ?? '';
      if (rec.stub !== stub) {
        if (stub) rec.el.dataset.stub = stub;
        else delete rec.el.dataset.stub;
        rec.stub = stub;
      }
      const cut = p.cut ?? '';
      if (rec.cut !== cut) {
        if (cut) rec.el.dataset.cut = cut;
        else delete rec.el.dataset.cut;
        rec.cut = cut;
      }
      if (rec.d !== p.d) rec.el.setAttribute('d', (rec.d = p.d));
      const group = p.clip === 'canvas' ? this.el.groups.canvas : this.el.groups.board;
      if (rec.group !== group) {
        group.appendChild(rec.el);
        rec.group = group;
      }
      this.writeHit(rec, edge, p.d);
    }
    for (const [id, rec] of this.pool) {
      if (!seen.has(id)) {
        rec.el.remove();
        rec.hit?.remove();
        this.pool.delete(id);
      }
    }
  }

  /**
   * Slice 1c2: the arrow's hit path, right after its visible path in the same group (so the same clip limits where it
   * takes the pointer): the same `d`, a wide transparent stroke, the arrow's role and tooltip. A mention gets none.
   */
  private writeHit(rec: PathRecord, edge: EdgeSpec, d: string): void {
    const role = hitRole(edge);
    if (!role) {
      if (rec.hit) {
        rec.hit.remove();
        rec.hit = null;
        rec.hitRole = '';
        rec.hitD = '';
        rec.hitTitle = '';
        rec.hitTitleEl = null;
      }
      return;
    }
    if (!rec.hit) {
      const hit = document.createElementNS(SVG_NS, 'path');
      hit.setAttribute('class', 'tl-edge-hit');
      hit.dataset.hitEdge = edge.id;
      hit.dataset.source = edge.source;
      hit.dataset.target = edge.target;
      rec.hit = hit;
    }
    const hit = rec.hit;
    if (rec.hitRole !== role) hit.dataset.hit = rec.hitRole = role;
    if (rec.hitD !== d) hit.setAttribute('d', (rec.hitD = d));
    const title = edge.title ?? '';
    if (rec.hitTitle !== title) {
      if (title) {
        rec.hitTitleEl ??= hit.appendChild(document.createElementNS(SVG_NS, 'title'));
        rec.hitTitleEl.textContent = title;
      } else if (rec.hitTitleEl) {
        rec.hitTitleEl.remove();
        rec.hitTitleEl = null;
      }
      rec.hitTitle = title;
    }
    if (hit.previousSibling !== rec.el) rec.el.after(hit);
  }

  /**
   * WRITE phase for the ∅ stubs (AR-5): a short arrow into the card's left edge, labelled ∅. The mark is the user's
   * declaration, so it is drawn as a declared arrow (dotted, the declared head; BD-5), never as a verified one: 1d's
   * band over the stub says when a proof from nothing was checked.
   */
  private writeMarks(marks: readonly MarkSpec[]): void {
    const seen = new Set<string>();
    for (const m of marks) {
      seen.add(m.id);
      let rec = this.markPool.get(m.id);
      if (!rec) {
        const el = document.createElementNS(SVG_NS, 'g');
        el.dataset.markId = m.id;
        // Slice 1c2: a wide transparent line under the stub takes the pointer (a click selects the mark, CM-2).
        const hit = el.appendChild(document.createElementNS(SVG_NS, 'path'));
        hit.setAttribute('class', 'tl-mark__hit');
        const line = el.appendChild(document.createElementNS(SVG_NS, 'path'));
        line.setAttribute('class', 'tl-mark__line');
        const label = el.appendChild(document.createElementNS(SVG_NS, 'text'));
        label.setAttribute('class', 'tl-mark__label');
        label.setAttribute('text-anchor', 'end');
        label.setAttribute('dominant-baseline', 'central');
        label.textContent = '∅';
        const title = el.appendChild(document.createElementNS(SVG_NS, 'title'));
        title.textContent = 'Follows from nothing';
        this.el.groups.marks.appendChild(el);
        rec = { el, hit, line, label, d: '', cls: '', x: '', y: '' };
        this.markPool.set(m.id, rec);
      }
      const cls = `tl-mark${m.focused ? ' tl-mark--focus' : ''}${m.selected ? ' tl-mark--selected' : ''}${this.hoveredMark === m.id ? ' tl-mark--hover' : ''}`;
      if (rec.cls !== cls) {
        rec.el.setAttribute('class', (rec.cls = cls));
        rec.line.setAttribute('marker-end', `url(#tl-arrow-${m.focused || m.selected ? 'focus' : 'declared'})`);
      }
      if (rec.d !== m.d) {
        rec.line.setAttribute('d', (rec.d = m.d));
        rec.hit.setAttribute('d', m.d);
      }
      const x = String(Math.round(m.labelX * 10) / 10);
      const y = String(Math.round(m.labelY * 10) / 10);
      if (rec.x !== x) rec.label.setAttribute('x', (rec.x = x));
      if (rec.y !== y) rec.label.setAttribute('y', (rec.y = y));
    }
    for (const [id, rec] of this.markPool) {
      if (!seen.has(id)) {
        rec.el.remove();
        this.markPool.delete(id);
      }
    }
  }

  /**
   * WRITE phase for the bands (slice 1d, BD-7): a bracket in the proved colour across the band's arrows just before
   * the card, with a ✓ seal when the band is complete (an open band is drawn dashed, without the ✓: never colour alone).
   * Its tooltip says what it certifies, or what lies outside it. Like the arrows, it follows pan, zoom and scroll, and
   * the canvas clip limits it.
   */
  private writeBands(bands: readonly BandShape[]): void {
    const seen = new Set<string>();
    for (const b of bands) {
      seen.add(b.target);
      let rec = this.bandPool.get(b.target);
      if (!rec) {
        const el = document.createElementNS(SVG_NS, 'g');
        el.dataset.bandFor = b.target;
        const bar = el.appendChild(document.createElementNS(SVG_NS, 'path'));
        bar.setAttribute('class', 'tl-band__bar');
        const seal = el.appendChild(document.createElementNS(SVG_NS, 'circle'));
        seal.setAttribute('class', 'tl-band__seal');
        const check = el.appendChild(document.createElementNS(SVG_NS, 'text'));
        check.setAttribute('class', 'tl-band__check');
        check.setAttribute('text-anchor', 'middle');
        check.setAttribute('dominant-baseline', 'central');
        check.textContent = '✓';
        const title = el.appendChild(document.createElementNS(SVG_NS, 'title'));
        this.el.groups.bands.appendChild(el);
        rec = { el, bar, seal, check, title, key: '' };
        this.bandPool.set(b.target, rec);
      }
      const r = Math.round(b.r * 10) / 10;
      const key = `${b.d}|${b.complete}|${b.onMark}|${b.seal ? `${b.seal.x},${b.seal.y}` : ''}|${r}|${b.title}`;
      if (rec.key === key) continue;
      rec.key = key;
      rec.el.setAttribute('class', `tl-band${b.complete ? ' tl-band--complete' : ' tl-band--open'}${b.onMark ? ' tl-band--mark' : ''}`);
      rec.el.dataset.complete = String(b.complete);
      rec.bar.setAttribute('d', b.d);
      rec.title.textContent = b.title;
      if (b.seal) {
        const x = String(Math.round(b.seal.x * 10) / 10);
        const y = String(Math.round(b.seal.y * 10) / 10);
        rec.seal.setAttribute('cx', x);
        rec.seal.setAttribute('cy', y);
        rec.seal.setAttribute('r', String(r));
        rec.check.setAttribute('x', x);
        rec.check.setAttribute('y', y);
        rec.check.setAttribute('font-size', String(Math.round(r * 15) / 10));
        rec.seal.removeAttribute('display');
        rec.check.removeAttribute('display');
      } else {
        rec.seal.setAttribute('display', 'none');
        rec.check.setAttribute('display', 'none');
      }
    }
    for (const [id, rec] of this.bandPool) {
      if (!seen.has(id)) {
        rec.el.remove();
        this.bandPool.delete(id);
      }
    }
  }

  /** WRITE phase for the "n linked" buttons: the column's in its header and footer, the canvas's at its edges. */
  private writeBadges(badges: readonly BadgeSpec[]): void {
    const seen = new Set<string>();
    for (const badge of badges) {
      const key = badge.part === 'column' ? `column:${badge.dir}` : `canvas:${badge.side}`;
      seen.add(key);
      this.badgeTargets.set(key, badge);
      let button = this.badgeButtons.get(key);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'tl-badge';
        button.dataset.part = badge.part;
        if (badge.part === 'column') {
          button.dataset.dir = badge.dir;
          button.dataset.kind = 'AXIOM';
        } else button.dataset.side = badge.side;
        button.addEventListener('click', () => this.revealNearestHidden(key));
        const slot = badge.part === 'column' ? this.el.column[badge.dir] : this.el.canvas.slots[badge.side];
        slot.appendChild(button);
        this.badgeButtons.set(key, button);
      }
      const text = badgeText(badge);
      if (button.textContent !== text) {
        button.textContent = text;
        button.setAttribute('aria-label', badgeLabel(badge));
      }
      if (button.hidden) button.hidden = false;
    }
    for (const [key, button] of this.badgeButtons) {
      if (!seen.has(key) && !button.hidden) {
        button.hidden = true;
        this.badgeTargets.delete(key);
      }
    }
  }

  private revealNearestHidden(key: string): void {
    const badge = this.badgeTargets.get(key);
    const id = badge?.ids[0];
    const card = id ? this.cards.get(id) : undefined;
    if (!badge || !id || !card) return;
    if (badge.part === 'canvas') {
      // BD-4: the badge pans to the nearest hidden card.
      this.el.canvas.view.panTo(id);
      return;
    }
    const list = this.el.column.list;
    const top = badge.dir === 'up' ? card.top - 24 : card.top + card.height - list.clientHeight + 24;
    const reduced = document.body.classList.contains('vscode-reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
    list.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' });
  }
}
