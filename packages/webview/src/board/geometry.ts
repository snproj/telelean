/**
 * Pure edge-overlay geometry (no DOM): given cached card boxes, the AXIOMS column's viewport and scrollTop, and the
 * PROPOSITIONS canvas's viewport and view transform, compute the SVG paths, the "follows from nothing" stubs and the
 * "n linked" badges of one frame. The EdgeEngine does the DOM reads and writes around it. Spec v4 BD-4 (slice 1c):
 * arrows run across the two parts and follow the column's scrolling and the canvas's pan and zoom.
 *
 * Coordinates are CSS pixels in "board space": the padding box of the board element, which is also the user space of
 * the absolutely positioned SVG overlay. A card's box is cached in its part's own coordinates (the column list's
 * content, or the canvas), so scrolling, panning and zooming never need a new measure.
 *
 * - Arrows run as smooth curves from the source's right edge to the target's left edge, or between the nearest sides
 *   when the target is left of the source (a loop on the right when they overlap horizontally).
 * - In the AXIOMS column, an end scrolled out of view is cut at the column's top or bottom, counted in "▲ n linked" /
 *   "▼ n linked" (an arrow within the column keeps its short hook, as before).
 * - On the canvas, an arrow whose other end is out of view stops at the canvas edge it leaves through, arriving square
 *   to that edge; each edge counts its hidden cards ("◀ 2 linked", "▲ 1 linked", "▶ …", "▼ …").
 * - An arrow with both ends out of view is not drawn.
 * - Slice 1d: several arrows into one canvas card's left edge arrive spread along it (`arrivalGap` apart, in the order
 *   of their sources' heights, a band's arrows together); each band (BD-7) is a bracket across its arrows (or the ∅
 *   stub) just before the card, with a ✓ seal when complete. Every arrow of a band enters the card's LEFT edge, wherever
 *   its source lies (`bandRoute`: a loop on the left from a card above or below, a hook round the card from one on its
 *   right), so the bracket always crosses the whole band; a band whose arrows are not all drawn shows no seal.
 */
import type { ItemStatus } from '@telelean/core';
import type { ViewTransform } from './canvas/view';

/**
 * Line pattern is reserved for epistemic status (D-13, D-15, BD-5): dotted = declared, solid = verified. `reference`
 * (a statement mentions another node's statement) is drawn thin and solid, only while one end has focus.
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
  /**
   * The pair has a declared premise (the user drew it), also when a proof uses it (solid). Slice 1c2: a drawn arrow
   * is selectable; a verified arrow without it is a proof's use nobody drew, which has only its right-click menu.
   */
  declared?: boolean;
  /** Tooltip, on the arrow's hit path (slice 1c2: every drawn or used arrow takes the pointer there). */
  title?: string;
  /**
   * Slice 2h (BD-5, D2-34): one of Claude's arrows in a session's Proposed view, its item and its state (the look is
   * edges.ts `arrowLook`'s; the badge is drawn by the engine's `setBadges`).
   */
  proposed?: { item: string; change: 'add' | 'remove'; status: ItemStatus; used: boolean };
}

/** Where a card is: the AXIOMS column (it scrolls) or the PROPOSITIONS canvas (pan and zoom). */
export type Part = 'column' | 'canvas';

/**
 * A card's border box in its part's own coordinates: relative to the column list's content origin (unchanged by
 * scrolling), or in canvas coordinates (unchanged by pan and zoom).
 */
export interface CardGeom {
  part: Part;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The AXIOMS column's list in board space. */
export interface ColumnGeom {
  /** Board-space position of the list's content origin when scrollTop is 0 (its padding-box corner). */
  originX: number;
  originY: number;
  /** The list's padding box: its visible band. */
  left: number;
  right: number;
  viewTop: number;
  viewBottom: number;
}

/** The canvas viewport in board space, and the view (a canvas point p shows at viewport-local t + s·p). */
export interface CanvasGeom {
  left: number;
  top: number;
  right: number;
  bottom: number;
  view: ViewTransform;
}

export interface GeometryOptions {
  /** The endpoint sits min(height / 2, anchorMax × zoom) below the card's top edge, i.e. on the title line. */
  anchorMax: number;
  /** A card with fewer visible pixels than this (in either direction) counts as out of view. */
  minVisible: number;
  /** A visible endpoint stays at least this far inside the visible part of its card. */
  edgeInset: number;
  /** Size of the hook drawn in the column when an arrow's other end there is scrolled away. */
  stubDx: number;
  stubDy: number;
  /** Length of the "follows from nothing" stub at 100 % (it scales with the zoom, within 14–40 px). */
  markLength: number;
  /**
   * Slice 1d: several arrows into one canvas card's left edge arrive this far apart at 100 % (less on a short card), so
   * a band can bind some of them and not the others.
   */
  arrivalGap: number;
  /** Maximum number of drawn paths per frame (repainting SVG paths is the expensive part). */
  budget: number;
}

export const DEFAULT_GEOMETRY: GeometryOptions = {
  anchorMax: 18,
  minVisible: 8,
  edgeInset: 4,
  stubDx: 22,
  stubDy: 20,
  markLength: 28,
  arrivalGap: 12,
  budget: 250,
};

export type Side = 'L' | 'R';
export type CanvasSide = 'left' | 'top' | 'right' | 'bottom';
export const CANVAS_SIDES: readonly CanvasSide[] = ['left', 'top', 'right', 'bottom'];

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fmt = (v: number) => String(Math.round(v * 10) / 10);

/** The outward normal of a canvas edge. */
const NORMAL: Readonly<Record<CanvasSide, Point>> = {
  left: { x: -1, y: 0 },
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
};

export interface FrameInput {
  column: ColumnGeom;
  scrollTop: number;
  canvas: CanvasGeom;
  cards: ReadonlyMap<string, CardGeom>;
  edges: readonly EdgeSpec[];
  /** Hovered and selected cards: their arrows are highlighted and drawn first. */
  focus: ReadonlySet<string>;
  /** Selected arrows (edge ids) and selected "follows from nothing" marks (card ids). */
  selectedEdges?: ReadonlySet<string>;
  /** Cards marked "follows from nothing" (AR-5): each gets a ∅ stub into its left edge. */
  marks?: readonly string[];
  selectedMarks?: ReadonlySet<string>;
  /** Slice 1d (BD-7): the bands to draw (board/band.ts decides them). */
  bands?: readonly BandSpec[];
}

/** The line a band's tooltip gains when not all of its arrows are drawn (it is then shown open, without the ✓). */
export const BAND_PARTLY_DRAWN = 'Not every arrow of this band is drawn here, so it shows no ✓';

/** Slice 1d (BD-7): a band: the drawn arrows (edge ids) it binds into `target`, or the target's ∅ stub. */
export interface BandSpec {
  target: string;
  arrows: readonly string[];
  onMark: boolean;
  complete: boolean;
  title: string;
}

/**
 * Slice 1d: a band as drawn: a bracket left of the card, across its arrows just before they arrive (they arrive spread
 * along the card's left edge, the band's together), with a ✓ seal on it when the band is complete.
 */
export interface BandShape {
  target: string;
  d: string;
  /** The ✓ seal's centre (complete bands only). */
  seal: Point | null;
  /** The seal's radius (it follows the zoom, within 5–9 px). */
  r: number;
  complete: boolean;
  onMark: boolean;
  title: string;
}

/** A card's box in board space. */
export function cardRect(card: CardGeom, input: Pick<FrameInput, 'column' | 'scrollTop' | 'canvas'>): Rect {
  if (card.part === 'column') {
    return { x: input.column.originX + card.left, y: input.column.originY + card.top - input.scrollTop, w: card.width, h: card.height };
  }
  const { view } = input.canvas;
  return {
    x: input.canvas.left + view.x + view.s * card.left,
    y: input.canvas.top + view.y + view.s * card.top,
    w: card.width * view.s,
    h: card.height * view.s,
  };
}

/** The canvas viewport as a rect. */
export function canvasRect(canvas: CanvasGeom): Rect {
  return { x: canvas.left, y: canvas.top, w: Math.max(0, canvas.right - canvas.left), h: Math.max(0, canvas.bottom - canvas.top) };
}

/**
 * Whether a card shows, and the part of it that does (in board space). A column card out of view is above (-1) or
 * below (1) the list's band.
 */
export function visibility(
  card: CardGeom,
  rect: Rect,
  input: Pick<FrameInput, 'column' | 'canvas'>,
  opts: GeometryOptions = DEFAULT_GEOMETRY,
): { visible: true; top: number; bottom: number } | { visible: false; dir: -1 | 1 } {
  if (card.part === 'column') {
    const { viewTop, viewBottom } = input.column;
    const top = Math.max(rect.y, viewTop);
    const bottom = Math.min(rect.y + rect.h, viewBottom);
    if (bottom - top >= opts.minVisible) return { visible: true, top, bottom };
    return { visible: false, dir: rect.y + rect.h / 2 < (viewTop + viewBottom) / 2 ? -1 : 1 };
  }
  const c = input.canvas;
  const w = Math.min(rect.x + rect.w, c.right) - Math.max(rect.x, c.left);
  const top = Math.max(rect.y, c.top);
  const bottom = Math.min(rect.y + rect.h, c.bottom);
  if (w >= opts.minVisible && bottom - top >= opts.minVisible) return { visible: true, top, bottom };
  return { visible: false, dir: rect.y + rect.h / 2 < (c.top + c.bottom) / 2 ? -1 : 1 };
}

/** The anchor on a card's side: on its title line, kept inside the part of it that shows (`band`). */
export function anchor(rect: Rect, side: Side, scale: number, band: { top: number; bottom: number } | null, opts: GeometryOptions = DEFAULT_GEOMETRY): Point {
  const x = side === 'R' ? rect.x + rect.w : rect.x;
  const y = rect.y + Math.min(rect.h / 2, opts.anchorMax * scale);
  if (!band) return { x, y };
  const inset = Math.min(opts.edgeInset, (band.bottom - band.top) / 2);
  return { x, y: clamp(y, band.top + inset, band.bottom - inset) };
}

/**
 * Which sides an arrow leaves and enters: the source's right edge to the target's left edge; the nearest sides (left
 * to right) when the target is left of the source; a loop on the right when the two overlap horizontally.
 */
export function routeSides(source: Rect, target: Rect): { s: Side; t: Side; loop: boolean } {
  const EPS = 1;
  if (target.x >= source.x + source.w - EPS) return { s: 'R', t: 'L', loop: false };
  if (target.x + target.w <= source.x + EPS) return { s: 'L', t: 'R', loop: false };
  return { s: 'R', t: 'R', loop: true };
}

/** A route: the sides an arrow leaves and enters, and how it gets there. */
export interface Route {
  s: Side;
  t: Side;
  /** Both ends on the same side (`t`): a loop out and back. */
  loop: boolean;
  /** Slice 1d: round the target, above or below it, into its left edge (a band's arrow from a card on its right). */
  around?: 'above' | 'below';
}

/**
 * Slice 1d (BD-7): the route of an arrow that belongs to its target's band. It always enters the target's LEFT edge, so
 * the band's bracket (just left of the card) crosses it: from a card on the left, as any arrow; from a card that
 * overlaps it horizontally (above or below it, or a wide expanded card), a loop on the left from the source's left
 * edge; from a card on its right, from the source's left edge round the target (above it, unless the source's middle
 * lies below the target) into its left edge.
 */
export function bandRoute(source: Rect, target: Rect): Route {
  const sides = routeSides(source, target);
  if (sides.t === 'L') return sides;
  if (sides.loop) return { s: 'L', t: 'L', loop: true };
  return { s: 'L', t: 'L', loop: false, around: source.y + source.h / 2 < target.y + target.h ? 'above' : 'below' };
}

/**
 * Where the segment from `p` towards `q` (out of view) leaves `rect`, and through which edge. When the segment never
 * crosses the rect (the hidden card lies behind the column, say), the point of the rect nearest `q` stands in, on the
 * edge `q` lies beyond.
 */
export function segmentExit(p: Point, q: Point, rect: Rect): { point: Point; side: CanvasSide } {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  let t0 = 0;
  let t1 = 1;
  let exit: CanvasSide | null = null;
  let crosses = true;
  const bounds: Array<[number, number, CanvasSide]> = [
    [-dx, p.x - rect.x, 'left'],
    [dx, rect.x + rect.w - p.x, 'right'],
    [-dy, p.y - rect.y, 'top'],
    [dy, rect.y + rect.h - p.y, 'bottom'],
  ];
  for (const [pi, qi, side] of bounds) {
    if (pi === 0) {
      if (qi < 0) crosses = false;
      continue;
    }
    const r = qi / pi;
    if (pi < 0) t0 = Math.max(t0, r);
    else if (r < t1) {
      t1 = r;
      exit = side;
    }
  }
  if (crosses && t0 <= t1 && exit !== null) return { point: { x: p.x + t1 * dx, y: p.y + t1 * dy }, side: exit };
  // No crossing (or `q` itself inside): the rect's point nearest `q`, on the side `q` overshoots most.
  const over: Record<CanvasSide, number> = {
    left: rect.x - q.x,
    right: q.x - (rect.x + rect.w),
    top: rect.y - q.y,
    bottom: q.y - (rect.y + rect.h),
  };
  let side: CanvasSide = 'left';
  for (const s of ['right', 'top', 'bottom'] as const) if (over[s] > over[side]) side = s;
  if (over[side] <= 0) {
    // `q` is inside: the nearest edge.
    const inside: Record<CanvasSide, number> = { left: q.x - rect.x, right: rect.x + rect.w - q.x, top: q.y - rect.y, bottom: rect.y + rect.h - q.y };
    side = 'left';
    for (const s of ['right', 'top', 'bottom'] as const) if (inside[s] < inside[side]) side = s;
  }
  const point = {
    x: side === 'left' ? rect.x : side === 'right' ? rect.x + rect.w : clamp(q.x, rect.x, rect.x + rect.w),
    y: side === 'top' ? rect.y : side === 'bottom' ? rect.y + rect.h : clamp(q.y, rect.y, rect.y + rect.h),
  };
  return { point, side };
}

/** A smooth curve from `s` to `t` with horizontal tangents at both ends. */
export function curvePath(s: Point, t: Point): string {
  const dir = t.x >= s.x ? 1 : -1;
  const dx = clamp(Math.abs(t.x - s.x) * 0.45, 30, 160) * dir;
  return `M${fmt(s.x)} ${fmt(s.y)}C${fmt(s.x + dx)} ${fmt(s.y)} ${fmt(t.x - dx)} ${fmt(t.y)} ${fmt(t.x)} ${fmt(t.y)}`;
}

/** A loop between two points on the same side of their cards (cards above one another). */
export function loopPath(s: Point, t: Point, side: Side): string {
  const k = (side === 'R' ? 1 : -1) * (18 + Math.min(34, Math.abs(t.y - s.y) * 0.12));
  return `M${fmt(s.x)} ${fmt(s.y)}C${fmt(s.x + k)} ${fmt(s.y)} ${fmt(t.x + k)} ${fmt(t.y)} ${fmt(t.x)} ${fmt(t.y)}`;
}

/** A curve leaving `from` in direction `fromDir` and arriving at `to` moving in direction `toDir` (unit vectors). */
export function cubicPath(from: Point, fromDir: Point, to: Point, toDir: Point): string {
  const d = clamp(Math.hypot(to.x - from.x, to.y - from.y) * 0.4, 16, 120);
  return (
    `M${fmt(from.x)} ${fmt(from.y)}C${fmt(from.x + fromDir.x * d)} ${fmt(from.y + fromDir.y * d)} ` +
    `${fmt(to.x - toDir.x * d)} ${fmt(to.y - toDir.y * d)} ${fmt(to.x)} ${fmt(to.y)}`
  );
}

/**
 * Slice 1d (BD-7): a band's arrow that must enter `target`'s left edge at `to` although it comes from the right. It
 * leaves `from` in direction `fromDir` (rising or falling at once towards the clear line when that direction is
 * horizontal, so it passes over or under the target), runs to a point clear of the target's top-left (or bottom-left)
 * corner, and hooks into the left edge, arriving horizontally, so the band's bracket crosses it like the others.
 */
export function aroundPath(from: Point, fromDir: Point, to: Point, target: Rect, above: boolean, scale: number): string {
  const clear = clamp(22 * scale, 12, 30);
  const reach = clamp(26 * scale, 16, 36);
  const corner = { x: target.x - reach, y: above ? target.y - clear : target.y + target.h + clear };
  const lead = clamp(Math.hypot(corner.x - from.x, corner.y - from.y) * 0.08, 16, 40);
  const first = { x: from.x + fromDir.x * lead, y: fromDir.y === 0 ? corner.y : from.y + fromDir.y * lead };
  const run = clamp(Math.abs(from.x - corner.x) * 0.4, 30, 200);
  const hook = clamp(20 * scale, 12, 28);
  return (
    `M${fmt(from.x)} ${fmt(from.y)}C${fmt(first.x)} ${fmt(first.y)} ${fmt(corner.x + run)} ${fmt(corner.y)} ${fmt(corner.x)} ${fmt(corner.y)}` +
    `C${fmt(corner.x - hook)} ${fmt(corner.y)} ${fmt(to.x - hook)} ${fmt(to.y)} ${fmt(to.x)} ${fmt(to.y)}`
  );
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

/** The direction an arrow leaves a card's side (or enters it: the opposite of where it leaves). */
const sideOut = (side: Side): Point => ({ x: side === 'R' ? 1 : -1, y: 0 });

/**
 * Which clip an arrow is drawn under: `canvas` (the canvas viewport only) for arrows between two canvas cards, so they
 * never spill over the column; `board` (the column's visible band, the canvas, and the strip between them) otherwise.
 */
export type Clip = 'canvas' | 'board';

export interface PathSpec {
  edge: EdgeSpec;
  d: string;
  clip: Clip;
  /** Null for a full arrow; otherwise which end is on screen while the other end is out of view. */
  stub: null | 'source' | 'target';
  /** Where an arrow with an end out of view is cut: the column's top or bottom, or a canvas edge. */
  cut?: 'up' | 'down' | CanvasSide;
  focused: boolean;
  selected: boolean;
}

/** AR-5: a "follows from nothing" mark, drawn as a short stub arrow labelled ∅ into the card's left edge. */
export interface MarkSpec {
  id: string;
  d: string;
  /** Where the ∅ label's right end sits (text-anchor end). */
  labelX: number;
  labelY: number;
  focused: boolean;
  selected: boolean;
}

/**
 * "n linked" badges: cards linked to cards in view but themselves out of view. In the AXIOMS column, above (▲, in the
 * header) or below (▼, in the footer); on the canvas, beyond one of its four edges. `ids` lists the hidden cards
 * nearest first (column: the one nearest the band first; canvas: the one nearest the viewport first).
 */
export type BadgeSpec = { part: 'column'; dir: 'up' | 'down'; ids: string[] } | { part: 'canvas'; side: CanvasSide; ids: string[] };

export interface FrameOutput {
  paths: PathSpec[];
  marks: MarkSpec[];
  badges: BadgeSpec[];
  /** Slice 1d: the bands of cards in view. */
  bands: BandShape[];
  /** Edges with both ends out of view: not drawn. */
  culled: number;
  /** Edges dropped by the budget. */
  overBudget: number;
  /** Edges whose cards are not on the board (e.g. filtered out). */
  missing: number;
}

/** The distance between a rect and the canvas viewport (0 when they touch). */
function distanceTo(rect: Rect, view: Rect): number {
  const dx = Math.max(view.x - (rect.x + rect.w), 0, rect.x - (view.x + view.w));
  const dy = Math.max(view.y - (rect.y + rect.h), 0, rect.y - (view.y + view.h));
  return Math.hypot(dx, dy);
}

/** One card's arrivals on its left edge: the arrows (edge ids) and its ∅ stub (`mark:` + card id), each with a sort key. */
interface Arrivals {
  card: CardGeom;
  rect: Rect;
  band: { top: number; bottom: number };
  items: Array<{ key: string; y: number }>;
}

/**
 * Slice 1d: where each arrow into a canvas card's left edge arrives (`slots`, by edge id, and `mark:<card>` for its ∅
 * stub). One arrow arrives on the title line, as before; several are spread along the edge, `arrivalGap` apart (less
 * when the card is short; `gaps`, by card), in the order of their sources' heights, so they do not cross; a band's
 * arrows (and its ∅ stub) are kept together, so its bracket crosses only them.
 */
function arrivalSlots(
  groups: ReadonlyMap<string, Arrivals>,
  bands: ReadonlyMap<string, BandSpec>,
  scaleOf: (card: CardGeom) => number,
  opts: GeometryOptions,
): { slots: Map<string, number>; gaps: Map<string, number> } {
  const out = new Map<string, number>();
  const gaps = new Map<string, number>();
  for (const [target, g] of groups) {
    const band = bands.get(target);
    const member = (key: string) => (band ? (key === `mark:${target}` ? band.onMark : band.arrows.includes(key)) : false);
    const byY = (a: { y: number }, b: { y: number }) => a.y - b.y;
    const members = g.items.filter((x) => member(x.key)).sort(byY);
    const others = g.items.filter((x) => !member(x.key)).sort(byY);
    const mean = members.length > 0 ? members.reduce((sum, x) => sum + x.y, 0) / members.length : Infinity;
    const ordered = [...others.filter((x) => x.y < mean), ...members, ...others.filter((x) => x.y >= mean)];
    const s = scaleOf(g.card);
    const base = anchor(g.rect, 'L', s, g.band, opts).y;
    if (ordered.length === 1) {
      out.set(ordered[0]?.key ?? '', base);
      continue;
    }
    const inset = Math.min(opts.edgeInset + 2, (g.band.bottom - g.band.top) / 2);
    const lo = g.band.top + inset;
    const hi = g.band.bottom - inset;
    const gap = Math.max(0, Math.min(opts.arrivalGap * s, (hi - lo) / (ordered.length - 1)));
    const span = gap * (ordered.length - 1);
    const first = Math.max(lo, Math.min(base - span / 2, hi - span));
    ordered.forEach((x, i) => out.set(x.key, first + i * gap));
    gaps.set(target, gap);
  }
  return { slots: out, gaps };
}

export function computeFrame(input: FrameInput, opts: GeometryOptions = DEFAULT_GEOMETRY): FrameOutput {
  const paths: PathSpec[] = [];
  const view = canvasRect(input.canvas);
  const scale = (card: CardGeom) => (card.part === 'canvas' ? input.canvas.view.s : 1);
  const columnHidden = { up: new Map<string, number>(), down: new Map<string, number>() };
  const canvasHidden: Record<CanvasSide, Map<string, number>> = { left: new Map(), top: new Map(), right: new Map(), bottom: new Map() };
  const selectedEdges = input.selectedEdges ?? new Set<string>();
  const bands = new Map((input.bands ?? []).map((b) => [b.target, b]));
  /**
   * Slice 1d (BD-7): the route of an arrow; one of its target's band, between two canvas cards with the target in view,
   * enters the target's left edge (bandRoute). An arrow from the AXIOMS column needs no special route: the column lies
   * left of the canvas, so it arrives there anyway (unless the target is panned behind the column, out of sight).
   */
  const routeOf = (edge: EdgeSpec, sc: CardGeom, tc: CardGeom, tv: ReturnType<typeof visibility>, sr: Rect, tr: Rect): Route =>
    tv.visible && sc.part === 'canvas' && tc.part === 'canvas' && (bands.get(edge.target)?.arrows.includes(edge.id) ?? false)
      ? bandRoute(sr, tr)
      : routeSides(sr, tr);
  let culled = 0;
  let missing = 0;

  // Pass 1: the boxes, what shows, and which arrows arrive on a canvas card's left edge (slice 1d: spread there).
  interface Plan {
    edge: EdgeSpec;
    sc: CardGeom;
    tc: CardGeom;
    sr: Rect;
    tr: Rect;
    sv: ReturnType<typeof visibility>;
    tv: ReturnType<typeof visibility>;
  }
  const plans: Plan[] = [];
  const arrivals = new Map<string, Arrivals>();
  const arrive = (target: string, card: CardGeom, rect: Rect, band: { top: number; bottom: number }, key: string, y: number) => {
    let g = arrivals.get(target);
    if (!g) arrivals.set(target, (g = { card, rect, band, items: [] }));
    g.items.push({ key, y });
  };
  for (const edge of input.edges) {
    if (edge.source === edge.target) continue;
    const sc = input.cards.get(edge.source);
    const tc = input.cards.get(edge.target);
    if (!sc || !tc) {
      missing++;
      continue;
    }
    const sr = cardRect(sc, input);
    const tr = cardRect(tc, input);
    const sv = visibility(sc, sr, input, opts);
    const tv = visibility(tc, tr, input, opts);
    if (!sv.visible && !tv.visible) {
      culled++;
      continue;
    }
    plans.push({ edge, sc, tc, sr, tr, sv, tv });
    // A mention (drawn only while an end has focus) takes no slot: hovering a card must not move its arrows. A band's
    // arrow always takes one (bandRoute), so its bracket crosses all of them.
    if (!tv.visible || tc.part !== 'canvas' || edge.pattern === 'reference') continue;
    if (routeOf(edge, sc, tc, tv, sr, tr).t === 'L') arrive(edge.target, tc, tr, tv, edge.id, sr.y + sr.h / 2);
  }
  for (const id of input.marks ?? []) {
    const card = input.cards.get(id);
    if (!card || card.part !== 'canvas') continue;
    const rect = cardRect(card, input);
    const vis = visibility(card, rect, input, opts);
    if (vis.visible) arrive(id, card, rect, vis, `mark:${id}`, anchor(rect, 'L', scale(card), vis, opts).y);
  }
  const { slots, gaps } = arrivalSlots(arrivals, bands, scale, opts);
  /** The target end of an arrow arriving on side `side` of card `tc` (its slot on a canvas card's left edge). */
  const targetAnchor = (edge: EdgeSpec, tc: CardGeom, tr: Rect, side: Side, band: { top: number; bottom: number }): Point => {
    const at = anchor(tr, side, scale(tc), band, opts);
    const slot = side === 'L' && tc.part === 'canvas' ? slots.get(edge.id) : undefined;
    return slot === undefined ? at : { x: at.x, y: slot };
  };

  for (const { edge, sc, tc, sr, tr, sv, tv } of plans) {
    const focused = input.focus.has(edge.source) || input.focus.has(edge.target);
    const selected = selectedEdges.has(edge.id);
    const bothColumn = sc.part === 'column' && tc.part === 'column';

    if (sv.visible && tv.visible) {
      const sides: Route = bothColumn ? { s: 'R', t: 'R', loop: true } : routeOf(edge, sc, tc, tv, sr, tr);
      const s = anchor(sr, sides.s, scale(sc), sv, opts);
      const t = targetAnchor(edge, tc, tr, sides.t, tv);
      const clip: Clip = sc.part === 'canvas' && tc.part === 'canvas' ? 'canvas' : 'board';
      const d = sides.around
        ? aroundPath(s, sideOut(sides.s), t, tr, sides.around === 'above', scale(tc))
        : sides.loop
          ? loopPath(s, t, sides.t)
          : curvePath(s, t);
      paths.push({ edge, d, clip, stub: null, focused, selected });
      continue;
    }

    // One end shows (v), the other is out of view (a).
    const sourceShows = sv.visible;
    const vCard = sourceShows ? sc : tc;
    const aCard = sourceShows ? tc : sc;
    const vRect = sourceShows ? sr : tr;
    const aRect = sourceShows ? tr : sr;
    const vBand = (sourceShows ? sv : tv) as { top: number; bottom: number };
    const aVis = (sourceShows ? tv : sv) as { dir: -1 | 1 };
    const stub = sourceShows ? ('source' as const) : ('target' as const);

    if (bothColumn) {
      // Within the column: today's short hook towards the scrolled-away end.
      const v = anchor(vRect, 'R', 1, vBand, opts);
      paths.push({ edge, d: stubPath(v, 1, aVis.dir, !sourceShows, opts), clip: 'board', stub, cut: aVis.dir < 0 ? 'up' : 'down', focused, selected });
      columnHidden[aVis.dir < 0 ? 'up' : 'down'].set(aCard === sc ? edge.source : edge.target, aRect.y);
      continue;
    }

    // The visible end's side: as if both were in view; a column card always faces the canvas (its right edge).
    const sides = routeOf(edge, sc, tc, tv, sr, tr);
    const vSide: Side = vCard.part === 'column' && aCard.part === 'canvas' ? 'R' : sourceShows ? sides.s : sides.t;
    const v = sourceShows ? anchor(vRect, vSide, scale(vCard), vBand, opts) : targetAnchor(edge, tc, tr, vSide, vBand);
    const awayId = sourceShows ? edge.target : edge.source;

    if (aCard.part === 'column') {
      // The column end is scrolled away: the arrow is cut at the column's top or bottom, arriving (or leaving) upright.
      const aSide: Side = sourceShows ? sides.t : sides.s;
      const cut = { x: aSide === 'R' ? aRect.x + aRect.w : aRect.x, y: aVis.dir < 0 ? input.column.viewTop : input.column.viewBottom };
      const outward = { x: 0, y: aVis.dir };
      const d = sourceShows ? cubicPath(v, sideOut(vSide), cut, outward) : cubicPath(cut, { x: 0, y: -aVis.dir }, v, { x: -sideOut(vSide).x, y: 0 });
      paths.push({ edge, d, clip: 'board', stub, cut: aVis.dir < 0 ? 'up' : 'down', focused, selected });
      columnHidden[aVis.dir < 0 ? 'up' : 'down'].set(awayId, aRect.y);
      continue;
    }

    // The canvas end is out of view: the arrow stops at the canvas edge it leaves through.
    const aSide: Side = sourceShows ? sides.t : sides.s;
    const a = anchor(aRect, aSide, scale(aCard), null, opts);
    const exit = segmentExit(v, a, view);
    const normal = NORMAL[exit.side];
    const inward = { x: -normal.x, y: -normal.y };
    const d = sourceShows
      ? cubicPath(v, sideOut(vSide), exit.point, normal)
      : sides.around && exit.point.x > tr.x
        ? // A band's arrow from a card out of view on the right: round the target into its left edge (slice 1d).
          aroundPath(exit.point, inward, v, tr, sides.around === 'above', scale(tc))
        : cubicPath(exit.point, inward, v, { x: -sideOut(vSide).x, y: 0 });
    const clip: Clip = vCard.part === 'canvas' ? 'canvas' : 'board';
    paths.push({ edge, d, clip, stub, cut: exit.side, focused, selected });
    canvasHidden[exit.side].set(awayId, distanceTo(aRect, view));
  }

  let drawn = paths;
  let overBudget = 0;
  if (paths.length > opts.budget) {
    // Focused and selected first, then full arrows, then stubs; stable within each group.
    const rank = (p: PathSpec) => (p.focused || p.selected ? 0 : p.stub ? 2 : 1);
    drawn = paths
      .map((p, i) => ({ p, i }))
      .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i)
      .slice(0, opts.budget)
      .map((x) => x.p);
    overBudget = paths.length - drawn.length;
  }

  const marks: MarkSpec[] = [];
  const markEnds = new Map<string, Point>();
  const selectedMarks = input.selectedMarks ?? new Set<string>();
  for (const id of input.marks ?? []) {
    const card = input.cards.get(id);
    if (!card) continue;
    const rect = cardRect(card, input);
    const vis = visibility(card, rect, input, opts);
    if (!vis.visible) continue;
    const at = anchor(rect, 'L', scale(card), vis, opts);
    const end = { x: at.x, y: slots.get(`mark:${id}`) ?? at.y };
    markEnds.set(id, end);
    const length = clamp(opts.markLength * scale(card), 14, 40);
    const start = end.x - length;
    marks.push({
      id,
      d: `M${fmt(start)} ${fmt(end.y)}L${fmt(end.x)} ${fmt(end.y)}`,
      labelX: start - 3,
      labelY: end.y,
      focused: input.focus.has(id),
      selected: selectedMarks.has(id),
    });
  }

  // Slice 1d (BD-7): each band crosses its arrows (or its ∅ stub) just before they reach the card. Every arrow of a band
  // arrives on the card's left edge (bandRoute); one that is not drawn there all the same (its source card is not on the
  // board, say) leaves the bracket short of the band, so the band is then drawn open: never a ✓ over part of it.
  const bandShapes: BandShape[] = [];
  for (const band of bands.values()) {
    const card = input.cards.get(band.target);
    if (!card || card.part !== 'canvas') continue;
    const ys = band.onMark
      ? [markEnds.get(band.target)?.y].filter((y): y is number => y !== undefined)
      : band.arrows.map((id) => slots.get(id)).filter((y): y is number => y !== undefined);
    if (ys.length === 0) continue;
    const whole = band.onMark || ys.length === band.arrows.length;
    const complete = band.complete && whole;
    const rect = cardRect(card, input);
    const s = scale(card);
    const x = rect.x - clamp(10 * s, 6, 14);
    // At most half the spacing of the arrivals, so the bracket never reaches the arrows next to the band's.
    const gap = gaps.get(band.target);
    const pad = Math.max(1, Math.min(clamp(6 * s, 4, 8), gap === undefined ? Infinity : gap / 2));
    const hook = clamp(4 * s, 3, 6);
    const y1 = Math.min(...ys) - pad;
    const y2 = Math.max(...ys) + pad;
    bandShapes.push({
      target: band.target,
      d: `M${fmt(x + hook)} ${fmt(y1)}L${fmt(x)} ${fmt(y1)}L${fmt(x)} ${fmt(y2)}L${fmt(x + hook)} ${fmt(y2)}`,
      seal: complete ? { x, y: (y1 + y2) / 2 } : null,
      r: clamp(6.5 * s, 5, 9),
      complete,
      onMark: band.onMark,
      title: whole ? band.title : `${band.title}\n${BAND_PARTLY_DRAWN}`,
    });
  }

  const badges: BadgeSpec[] = [];
  for (const dir of ['up', 'down'] as const) {
    const hidden = columnHidden[dir];
    if (hidden.size === 0) continue;
    // Nearest the band first: above, the lowest card; below, the highest.
    const ids = [...hidden.entries()].sort((a, b) => (dir === 'up' ? b[1] - a[1] : a[1] - b[1])).map(([id]) => id);
    badges.push({ part: 'column', dir, ids });
  }
  for (const side of CANVAS_SIDES) {
    const hidden = canvasHidden[side];
    if (hidden.size === 0) continue;
    const ids = [...hidden.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
    badges.push({ part: 'canvas', side, ids });
  }
  return { paths: drawn, marks, badges, bands: bandShapes, culled, overBudget, missing };
}

/** A badge's words: "▲ 2 linked" (column above, canvas top), "▼ …", "◀ …" (canvas left), "▶ …" (canvas right). */
export function badgeText(badge: BadgeSpec): string {
  const arrow = badge.part === 'column' ? (badge.dir === 'up' ? '▲' : '▼') : { left: '◀', top: '▲', right: '▶', bottom: '▼' }[badge.side];
  return `${arrow} ${badge.ids.length} linked`;
}

/** A badge's accessible name. */
export function badgeLabel(badge: BadgeSpec): string {
  const n = badge.ids.length;
  const where = badge.part === 'column' ? (badge.dir === 'up' ? 'above' : 'below') : { left: 'left of the view', top: 'above the view', right: 'right of the view', bottom: 'below the view' }[badge.side];
  return `${n} linked card${n === 1 ? '' : 's'} ${where}; ${badge.part === 'column' ? 'scroll' : 'pan'} to the nearest`;
}
