/**
 * Pure edge-overlay geometry (no DOM): given cached card boxes, column viewports and the three scrollTops,
 * compute the SVG paths for one frame. The EdgeEngine does the DOM reads and writes around it.
 *
 * Coordinates are CSS pixels in "board space": the padding box of the board element, which is also the user
 * space of the absolutely positioned SVG overlays.
 */
import type { NodeType } from '@telelean/core';
import { NODE_TYPES } from '@telelean/core';

/**
 * Line pattern is reserved for epistemic status (D-13, D-15): dashed = declared, solid = verified. `reference` (a
 * statement mentions another node's statement) is drawn thin and solid, only while one end has focus.
 */
export type EdgePattern = 'declared' | 'verified' | 'reference';

export interface EdgeSpec {
  /** `${source}->${target}`: a declared and a verified edge between the same nodes are drawn as one. */
  id: string;
  source: string;
  target: string;
  pattern: EdgePattern;
  /** A verified edge into a conditional proof (the source is taken as a hypothesis): its own marker. */
  conditional?: boolean;
  /** D-13 declared-vs-verified mismatch: drawn in the warning colour. */
  mismatch?: 'declared-unused' | 'used-undeclared';
  /** Tooltip (conditional and mismatch arrows react to the pointer; plain arrows do not). */
  title?: string;
}

export const COLUMN_INDEX: Readonly<Record<NodeType, number>> = { ASSUMPTION: 0, DERIVATION: 1, GOAL: 2 };

/** A column's scroll viewport in board space. */
export interface ColumnGeom {
  /** Board-space position of the list's content origin when scrollTop is 0 (its padding-box corner). */
  originX: number;
  originY: number;
  /** Visible band of the list (its padding box). */
  viewTop: number;
  viewBottom: number;
  width: number;
}

/** A card's border box relative to its list's content origin, so it does not change while the list scrolls. */
export interface CardGeom {
  kind: NodeType;
  top: number;
  height: number;
  left: number;
  width: number;
}

export interface GeometryOptions {
  /** The endpoint sits min(height / 2, anchorMax) below the card's top edge, i.e. on the title line. */
  anchorMax: number;
  /** A card with fewer visible pixels than this inside its viewport counts as scrolled away. */
  minVisible: number;
  /** A visible endpoint stays at least this far inside the visible part of its card. */
  edgeInset: number;
  /** Size of the stub hook drawn when the other end is scrolled away. */
  stubDx: number;
  stubDy: number;
  /** Maximum number of drawn paths per frame (repainting SVG paths is the expensive part). */
  budget: number;
}

export const DEFAULT_GEOMETRY: GeometryOptions = {
  anchorMax: 18,
  minVisible: 8,
  edgeInset: 4,
  stubDx: 22,
  stubDy: 20,
  budget: 250,
};

export type Side = 'L' | 'R';
/** -1 = above the viewport, 0 = visible, 1 = below. */
export type Visibility = -1 | 0 | 1;

export interface Endpoint {
  id: string;
  kind: NodeType;
  x: number;
  y: number;
  vis: Visibility;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fmt = (v: number) => String(Math.round(v * 10) / 10);

export function endpoint(
  id: string,
  card: CardGeom,
  col: ColumnGeom,
  scrollTop: number,
  side: Side,
  opts: GeometryOptions = DEFAULT_GEOMETRY,
): Endpoint {
  const top = col.originY + card.top - scrollTop;
  const bottom = top + card.height;
  const x = col.originX + card.left + (side === 'R' ? card.width : 0);
  const visTop = Math.max(top, col.viewTop);
  const visBottom = Math.min(bottom, col.viewBottom);
  if (visBottom - visTop < opts.minVisible) {
    const vis: Visibility = top + card.height / 2 < (col.viewTop + col.viewBottom) / 2 ? -1 : 1;
    return { id, kind: card.kind, x, y: vis < 0 ? col.viewTop : col.viewBottom, vis };
  }
  const inset = Math.min(opts.edgeInset, (visBottom - visTop) / 2);
  const y = clamp(top + Math.min(card.height / 2, opts.anchorMax), visTop + inset, visBottom - inset);
  return { id, kind: card.kind, x, y, vis: 0 };
}

/** Which card sides an edge leaves and enters. Same-column edges use the gutter (left of Goals, else right). */
export function sidesFor(source: NodeType, target: NodeType): { s: Side; t: Side; sameColumn: boolean } {
  const si = COLUMN_INDEX[source];
  const ti = COLUMN_INDEX[target];
  if (si === ti) {
    const side: Side = source === 'GOAL' ? 'L' : 'R';
    return { s: side, t: side, sameColumn: true };
  }
  return si < ti ? { s: 'R', t: 'L', sameColumn: false } : { s: 'L', t: 'R', sameColumn: false };
}

interface Point {
  x: number;
  y: number;
}

export function curvePath(s: Point, t: Point): string {
  const dir = t.x >= s.x ? 1 : -1;
  const dx = clamp(Math.abs(t.x - s.x) * 0.45, 30, 160) * dir;
  return `M${fmt(s.x)} ${fmt(s.y)}C${fmt(s.x + dx)} ${fmt(s.y)} ${fmt(t.x - dx)} ${fmt(t.y)} ${fmt(t.x)} ${fmt(t.y)}`;
}

/** Vertical room kept between a routed arrow and the cards it passes. */
export const ROUTE_CLEARANCE = 3;

/** An opaque block in a column (a card, the empty-column placeholder), relative to the list's content origin. */
export interface Block {
  top: number;
  height: number;
}

/**
 * A y (board space) where a line can cross a column without touching any of its blocks: inside the column's visible
 * band, in a gap between blocks (or above or below them), as close to `want` as possible. Null when there is none.
 */
export function gutterY(col: ColumnGeom, blocks: readonly Block[], scrollTop: number, want: number, clearance = ROUTE_CLEARANCE): number | null {
  const spans = blocks
    .map((b) => [col.originY + b.top - scrollTop - clearance, col.originY + b.top - scrollTop + b.height + clearance] as const)
    .filter(([top, bottom]) => bottom > col.viewTop && top < col.viewBottom)
    .sort((x, y) => x[0] - y[0]);
  let best: number | null = null;
  const consider = (lo: number, hi: number) => {
    if (hi - lo < 1) return;
    const margin = Math.min(2, (hi - lo) / 2);
    const y = clamp(want, lo + margin, hi - margin);
    if (best === null || Math.abs(y - want) < Math.abs(best - want)) best = y;
  };
  let cursor = col.viewTop;
  for (const [top, bottom] of spans) {
    consider(cursor, Math.min(top, col.viewBottom));
    cursor = Math.max(cursor, bottom);
    if (cursor >= col.viewBottom) break;
  }
  consider(cursor, col.viewBottom);
  return best;
}

/**
 * An arrow that crosses a column through a gap at `y`: a curve from `s` to the column's near edge, straight across
 * between `left` and `right`, and a curve on to `t` (so it never runs over that column's cards).
 */
export function routedPath(s: Point, t: Point, y: number, left: number, right: number): string {
  const dir = t.x >= s.x ? 1 : -1;
  const enter = dir > 0 ? left : right;
  const leave = dir > 0 ? right : left;
  const d1 = clamp(Math.abs(enter - s.x) * 0.5, 8, 80) * dir;
  const d2 = clamp(Math.abs(t.x - leave) * 0.5, 8, 80) * dir;
  return (
    `M${fmt(s.x)} ${fmt(s.y)}C${fmt(s.x + d1)} ${fmt(s.y)} ${fmt(enter - d1)} ${fmt(y)} ${fmt(enter)} ${fmt(y)}` +
    `L${fmt(leave)} ${fmt(y)}C${fmt(leave + d2)} ${fmt(y)} ${fmt(t.x - d2)} ${fmt(t.y)} ${fmt(t.x)} ${fmt(t.y)}`
  );
}

export function loopPath(s: Point, t: Point, side: Side): string {
  const k = (side === 'R' ? 1 : -1) * (18 + Math.min(34, Math.abs(t.y - s.y) * 0.12));
  return `M${fmt(s.x)} ${fmt(s.y)}C${fmt(s.x + k)} ${fmt(s.y)} ${fmt(t.x + k)} ${fmt(t.y)} ${fmt(t.x)} ${fmt(t.y)}`;
}

/**
 * A short hook from the visible card's side towards the scrolled-away end: out by `hs * stubDx`, then up or down.
 * When the visible card is the edge's target, the path runs into the card so the arrowhead still lands on it.
 */
export function stubPath(v: Point, hs: 1 | -1, dir: -1 | 1, intoCard: boolean, opts: GeometryOptions = DEFAULT_GEOMETRY): string {
  const tipX = v.x + hs * opts.stubDx;
  const tipY = v.y + dir * opts.stubDy;
  const c = v.x + hs * opts.stubDx * 0.7;
  return intoCard
    ? `M${fmt(tipX)} ${fmt(tipY)}C${fmt(tipX)} ${fmt(v.y)} ${fmt(c)} ${fmt(v.y)} ${fmt(v.x)} ${fmt(v.y)}`
    : `M${fmt(v.x)} ${fmt(v.y)}C${fmt(c)} ${fmt(v.y)} ${fmt(tipX)} ${fmt(v.y)} ${fmt(tipX)} ${fmt(tipY)}`;
}

export interface FrameInput {
  cols: Readonly<Record<NodeType, ColumnGeom>>;
  cards: ReadonlyMap<string, CardGeom>;
  scroll: Readonly<Record<NodeType, number>>;
  edges: readonly EdgeSpec[];
  /** Hovered and selected nodes: their edges are highlighted and drawn first. */
  focus: ReadonlySet<string>;
  /** Opaque blocks in a column that are not cards (the empty-column placeholder): routed arrows avoid them too. */
  obstacles?: Readonly<Partial<Record<NodeType, readonly Block[]>>>;
}

export interface PathSpec {
  edge: EdgeSpec;
  d: string;
  /**
   * Edges that skip the Derivations column run under the (opaque) cards; a focused one is drawn over them instead,
   * routed through a gap between the Derivation cards (`routed`) so it never strikes through a card's text.
   */
  layer: 'under' | 'over';
  routed?: boolean;
  /** Null for a full arrow; otherwise which end is on screen while the other end is scrolled away. */
  stub: null | 'source' | 'target';
  focused: boolean;
}

export type BadgeDir = 'up' | 'down';

/**
 * "▲ n linked" / "▼ n linked" for a column: cards linked to visible cards but scrolled out of view above or below.
 * The buttons live in the column's header (▲) and footer (▼) strips, outside the scrolling list, so they never
 * cover a card.
 */
export interface BadgeSpec {
  kind: NodeType;
  dir: BadgeDir;
  /** Hidden linked card ids, sorted top to bottom. */
  ids: string[];
}

export interface FrameOutput {
  paths: PathSpec[];
  badges: BadgeSpec[];
  /** Edges with both ends scrolled away: not drawn. */
  culled: number;
  /** Edges dropped by the budget. */
  overBudget: number;
  /** Edges whose cards are not on the board (e.g. filtered out). */
  missing: number;
}

export function computeFrame(input: FrameInput, opts: GeometryOptions = DEFAULT_GEOMETRY): FrameOutput {
  const paths: PathSpec[] = [];
  const hidden = new Map<string, { kind: NodeType; dir: BadgeDir; ids: Set<string> }>();
  let culled = 0;
  let missing = 0;
  let middleBlocks: Block[] | undefined; // the Derivation column's cards and placeholder, when a routed arrow needs them

  for (const edge of input.edges) {
    if (edge.source === edge.target) continue;
    const sc = input.cards.get(edge.source);
    const tc = input.cards.get(edge.target);
    if (!sc || !tc) {
      missing++;
      continue;
    }
    const sides = sidesFor(sc.kind, tc.kind);
    const s = endpoint(edge.source, sc, input.cols[sc.kind], input.scroll[sc.kind], sides.s, opts);
    const t = endpoint(edge.target, tc, input.cols[tc.kind], input.scroll[tc.kind], sides.t, opts);
    if (s.vis !== 0 && t.vis !== 0) {
      culled++;
      continue;
    }
    const focused = input.focus.has(edge.source) || input.focus.has(edge.target);
    if (s.vis === 0 && t.vis === 0) {
      const skips = Math.abs(COLUMN_INDEX[sc.kind] - COLUMN_INDEX[tc.kind]) === 2;
      if (skips && focused) {
        middleBlocks ??= [...[...input.cards.values()].filter((c) => c.kind === 'DERIVATION'), ...(input.obstacles?.DERIVATION ?? [])];
        const mid = input.cols.DERIVATION;
        const y = gutterY(mid, middleBlocks, input.scroll.DERIVATION, (s.y + t.y) / 2);
        if (y !== null) {
          paths.push({ edge, d: routedPath(s, t, y, mid.originX, mid.originX + mid.width), layer: 'over', stub: null, focused, routed: true });
          continue;
        }
      }
      paths.push({
        edge,
        d: sides.sameColumn ? loopPath(s, t, sides.s) : curvePath(s, t),
        layer: skips && !focused ? 'under' : 'over',
        stub: null,
        focused,
      });
      continue;
    }
    const visible = s.vis === 0 ? s : t;
    const away = s.vis === 0 ? t : s;
    const hs: 1 | -1 = sides.sameColumn
      ? sides.s === 'R' ? 1 : -1
      : COLUMN_INDEX[away.kind] > COLUMN_INDEX[visible.kind] ? 1 : -1;
    const dir = away.vis as -1 | 1;
    paths.push({ edge, d: stubPath(visible, hs, dir, visible === t, opts), layer: 'over', stub: visible === s ? 'source' : 'target', focused });
    const key = `${away.kind}:${dir < 0 ? 'up' : 'down'}`;
    let entry = hidden.get(key);
    if (!entry) hidden.set(key, (entry = { kind: away.kind, dir: dir < 0 ? 'up' : 'down', ids: new Set() }));
    entry.ids.add(away.id);
  }

  let drawn = paths;
  let overBudget = 0;
  if (paths.length > opts.budget) {
    // Focused first, then full arrows, then stubs; stable within each group.
    const rank = (p: PathSpec) => (p.focused ? 0 : p.stub ? 2 : 1);
    drawn = paths
      .map((p, i) => ({ p, i }))
      .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i)
      .slice(0, opts.budget)
      .map((x) => x.p);
    overBudget = paths.length - drawn.length;
  }

  const badges: BadgeSpec[] = [];
  for (const kind of NODE_TYPES) {
    for (const dir of ['up', 'down'] as const) {
      const entry = hidden.get(`${kind}:${dir}`);
      if (!entry) continue;
      const ids = [...entry.ids].sort((a, b) => (input.cards.get(a)?.top ?? 0) - (input.cards.get(b)?.top ?? 0));
      badges.push({ kind, dir, ids });
    }
  }
  return { paths: drawn, badges, culled, overBudget, missing };
}
