/**
 * Imperative SVG edge overlay for three independently scrolling columns (03 section 7, "EdgeEngine").
 *
 * React renders the cards; this class owns the <path> elements and the "n linked" badges, so scrolling and
 * hovering never re-render React. At most one requestAnimationFrame runs per change:
 *   READ    card boxes and column viewports, only when the layout is dirty (ResizeObserver / MutationObserver),
 *           plus the three scrollTops every frame;
 *   COMPUTE pure geometry (geometry.ts);
 *   WRITE   reconcile a pool of <path> elements, touching an attribute only when its value changed.
 * Cards are found by `[data-node-id]` inside each column list, so nothing has to register with the engine.
 */
import type { NodeType } from '@telelean/core';
import { NODE_TYPES } from '@telelean/core';
import {
  computeFrame,
  DEFAULT_GEOMETRY,
  type BadgeDir,
  type BadgeSpec,
  type Block,
  type CardGeom,
  type ColumnGeom,
  type EdgeSpec,
  type FrameOutput,
  type GeometryOptions,
} from './geometry';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The board element's attribute that names the graph on screen (see `EdgeEngineStats.graphSeq`). */
export const GRAPH_SEQ_ATTRIBUTE = 'data-graph-seq';

export interface EdgeEngineElements {
  /** Positioned container; the SVG overlays fill its padding box. Carries `data-graph-seq`. */
  board: HTMLElement;
  /** The three scroll containers. Cards inside them carry `data-node-id`. */
  lists: Readonly<Record<NodeType, HTMLElement>>;
  layers: { under: SVGGElement; over: SVGGElement };
  /** Clip rectangles (one per SVG) kept to the band covered by the column lists. */
  clipRects: readonly SVGRectElement[];
  /**
   * Empty elements React renders in each column's header (`up`) and footer (`down`), outside the scrolling list.
   * The engine owns the "n linked" button inside each one; React never renders children into them.
   */
  badgeSlots: Readonly<Record<NodeType, Readonly<Record<BadgeDir, HTMLElement>>>>;
}

export interface EdgeEngineStats {
  frames: number;
  measures: number;
  /**
   * The board's `data-graph-seq` at the last measure: which applied graph the cached geometry belongs to. (A graph's
   * own version is not enough: two graphs can share one, and their DOM can have the same number of cards.)
   */
  graphSeq: number;
  /** Smallest column viewport height at the last measure (0 while the webview has no layout yet). */
  minColumnHeight: number;
  /** Cards found at the last measure. */
  cards: number;
  /** Whether the three list elements the engine watches are still in the document. */
  listsConnected: boolean;
  drawn: number;
  stubs: number;
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
  pattern: string;
  conditional: boolean;
  mismatch: string;
  title: string;
  titleEl: SVGTitleElement | null;
  layer: 'under' | 'over' | null;
}

/** The arrowhead of an edge: conditional edges keep their own (hollow) head even when focused. */
export function markerVariant(edge: EdgeSpec, focused: boolean): string {
  if (edge.conditional) return focused ? 'conditional-focus' : 'conditional';
  if (focused) return 'focus';
  if (edge.mismatch) return 'mismatch';
  return edge.pattern;
}

/** Every marker variant the board defines (Board.tsx renders one <marker> per variant and layer). */
export const MARKER_VARIANTS = ['declared', 'verified', 'reference', 'focus', 'mismatch', 'conditional', 'conditional-focus'] as const;

export class EdgeEngine {
  private edges: readonly EdgeSpec[] = [];
  private focus: ReadonlySet<string> = new Set();
  private cols: Record<NodeType, ColumnGeom> | null = null;
  private cards = new Map<string, CardGeom>();
  /** Opaque non-card blocks per column (`[data-edge-obstacle]`, the empty-column placeholder). */
  private obstacles: Partial<Record<NodeType, Block[]>> = {};
  private readonly observedCards = new Set<Element>();
  private readonly pool = new Map<string, PathRecord>();
  private readonly badgeButtons = new Map<string, HTMLButtonElement>();
  private readonly badgeTargets = new Map<string, BadgeSpec>();
  private layoutDirty = true;
  private raf = 0;
  private disposed = false;
  private readonly resizeObserver: ResizeObserver;
  private readonly mutationObserver: MutationObserver;
  private readonly onScroll = () => this.schedule();
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
    // Cards added, removed, moved between columns or expanded change offsets without resizing the lists. A new
    // graph always re-measures, even when its cards render to the same DOM as the previous graph's.
    this.mutationObserver = new MutationObserver(() => this.invalidateLayout());
    this.mutationObserver.observe(el.board, { attributes: true, attributeFilter: [GRAPH_SEQ_ATTRIBUTE] });
    this.resizeObserver.observe(el.board);
    for (const kind of NODE_TYPES) {
      const list = el.lists[kind];
      this.resizeObserver.observe(list);
      this.mutationObserver.observe(list, { childList: true, subtree: true, characterData: true });
      list.addEventListener('scroll', this.onScroll, { passive: true });
    }
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

  invalidateLayout(): void {
    this.layoutDirty = true;
    this.schedule();
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
    for (const kind of NODE_TYPES) this.el.lists[kind].removeEventListener('scroll', this.onScroll);
    for (const rec of this.pool.values()) rec.el.remove();
    for (const button of this.badgeButtons.values()) button.remove();
    this.pool.clear();
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
    const cols = this.cols;
    if (!cols) return;
    const { lists } = this.el;
    const scroll = { ASSUMPTION: lists.ASSUMPTION.scrollTop, DERIVATION: lists.DERIVATION.scrollTop, GOAL: lists.GOAL.scrollTop };
    const out = computeFrame({ cols, cards: this.cards, scroll, edges: this.edges, focus: this.focus, obstacles: this.obstacles }, this.opts);
    this.writePaths(out);
    this.writeBadges(out.badges);
    const s = this.stats;
    s.frames++;
    s.drawn = out.paths.length;
    s.stubs = out.paths.filter((p) => p.stub).length;
    s.culled = out.culled;
    s.missing = out.missing;
    s.overBudget = out.overBudget;
    s.lastFrameMs = performance.now() - t0;
    for (const listener of this.listeners) listener(s);
  };

  /** READ phase: column viewports and card boxes. Runs only when the layout changed. */
  private measure(): void {
    const { board, lists } = this.el;
    this.stats.measures++;
    this.stats.graphSeq = Number(board.getAttribute(GRAPH_SEQ_ATTRIBUTE)) || 0;
    const b = board.getBoundingClientRect();
    const bx = b.left + board.clientLeft;
    const by = b.top + board.clientTop;
    const cols = {} as Record<NodeType, ColumnGeom>;
    const cards = new Map<string, CardGeom>();
    const obstacles: Partial<Record<NodeType, Block[]>> = {};
    const seen = new Set<Element>();
    for (const kind of NODE_TYPES) {
      const list = lists[kind];
      const r = list.getBoundingClientRect();
      const contentLeft = r.left + list.clientLeft;
      const contentTop = r.top + list.clientTop;
      const originX = contentLeft - bx;
      const originY = contentTop - by;
      cols[kind] = { originX, originY, viewTop: originY, viewBottom: originY + list.clientHeight, width: list.clientWidth };
      const scrollTop = list.scrollTop;
      for (const card of list.querySelectorAll<HTMLElement>('[data-node-id]')) {
        const id = card.dataset.nodeId;
        if (!id) continue;
        const c = card.getBoundingClientRect();
        cards.set(id, { kind, top: c.top - contentTop + scrollTop, height: c.height, left: c.left - contentLeft, width: c.width });
        seen.add(card);
      }
      for (const block of list.querySelectorAll<HTMLElement>('[data-edge-obstacle]')) {
        const box = block.getBoundingClientRect();
        (obstacles[kind] ??= []).push({ top: box.top - contentTop + scrollTop, height: box.height });
      }
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
    this.cols = cols;
    this.cards = cards;
    this.obstacles = obstacles;
    this.stats.minColumnHeight = Math.min(...NODE_TYPES.map((k) => cols[k].viewBottom - cols[k].viewTop));
    this.stats.cards = cards.size;
    this.stats.listsConnected = NODE_TYPES.every((k) => lists[k].isConnected);
    const top = Math.min(...NODE_TYPES.map((k) => cols[k].viewTop));
    const bottom = Math.max(...NODE_TYPES.map((k) => cols[k].viewBottom));
    for (const rect of this.el.clipRects) {
      rect.setAttribute('x', '0');
      rect.setAttribute('y', String(top));
      rect.setAttribute('width', String(board.clientWidth));
      rect.setAttribute('height', String(Math.max(0, bottom - top)));
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
        rec = { el, d: '', cls: '', marker: '', stub: '', pattern: '', conditional: false, mismatch: '', title: '', titleEl: null, layer: null };
        this.pool.set(edge.id, rec);
      }
      const cls =
        `tl-edge tl-edge--${edge.pattern}` +
        `${edge.conditional ? ' tl-edge--conditional' : ''}${edge.mismatch ? ' tl-edge--mismatch' : ''}` +
        `${p.stub ? ' tl-edge--stub' : ''}${p.focused ? ' tl-edge--focus' : ''}`;
      if (rec.cls !== cls) rec.el.setAttribute('class', (rec.cls = cls));
      const marker = `url(#tl-arrow-${p.layer}-${markerVariant(edge, p.focused)})`;
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
      if (rec.d !== p.d) rec.el.setAttribute('d', (rec.d = p.d));
      if (rec.layer !== p.layer) {
        (p.layer === 'under' ? this.el.layers.under : this.el.layers.over).appendChild(rec.el);
        rec.layer = p.layer;
      }
    }
    for (const [id, rec] of this.pool) {
      if (!seen.has(id)) {
        rec.el.remove();
        this.pool.delete(id);
      }
    }
  }

  /** WRITE phase for the "n linked" buttons: one per column and direction, in that column's header or footer slot. */
  private writeBadges(badges: readonly BadgeSpec[]): void {
    const seen = new Set<string>();
    for (const badge of badges) {
      const key = `${badge.kind}:${badge.dir}`;
      seen.add(key);
      this.badgeTargets.set(key, badge);
      let button = this.badgeButtons.get(key);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'tl-badge';
        button.dataset.kind = badge.kind;
        button.dataset.dir = badge.dir;
        button.addEventListener('click', () => this.revealNearestHidden(key));
        this.el.badgeSlots[badge.kind][badge.dir].appendChild(button);
        this.badgeButtons.set(key, button);
      }
      const text = `${badge.dir === 'up' ? '▲' : '▼'} ${badge.ids.length} linked`;
      if (button.textContent !== text) {
        button.textContent = text;
        button.setAttribute('aria-label', `${badge.ids.length} linked cards ${badge.dir === 'up' ? 'above' : 'below'}; scroll to the nearest`);
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
    if (!badge) return;
    const id = badge.dir === 'up' ? badge.ids[badge.ids.length - 1] : badge.ids[0];
    const card = id ? this.cards.get(id) : undefined;
    if (!card) return;
    const list = this.el.lists[badge.kind];
    const top = badge.dir === 'up' ? card.top - 24 : card.top + card.height - list.clientHeight + 24;
    const reduced = document.body.classList.contains('vscode-reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
    list.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' });
  }
}
