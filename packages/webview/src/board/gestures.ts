/**
 * The board's arrow gestures, their pure parts (spec v4 AR-1, AR-6, AR-7, CM-2, CM-7, ES-9; slice 1c2), unit-tested
 * without a DOM. board/BoardInput.ts does the pointer work around them, and the store applies what they decide.
 *
 * - What an arrow on screen offers (`hitRole`): a drawn arrow (a declared premise of a proposition: dotted, or solid
 *   once a checked proof uses it) is selectable; an arrow a proof uses although nobody drew it (TL107, the warning
 *   colour) has only its right-click menu, whose action is "Draw this arrow"; a mention (lean-ref) offers nothing.
 * - Geometric hit-testing (`pathPoints`, `arrowAt`): the AXIOMS column lies above the overlay, so a press on the
 *   column's background finds the arrow nearest the pointer by distance instead of by its hit path.
 * - The selection rectangle (`areaSelection`): the canvas cards, drawn arrows and ∅ marks wholly inside it.
 * - Drawing by the handle (`drawTarget`, `drawHint`, `rubberBandPath`): what a release over a card does, and what the
 *   gesture states before you let go (AR-6: the impact when the target is an axiom; AR-3: a cycle).
 * - Dropping a moved proposition on the AXIOMS column (`canvasDropOutcome`, AR-7).
 * - The Delete key (`deleteOutcome`, AR-1): the selected arrows and marks first; a card's delete dialog only when no
 *   arrow or mark is selected.
 * - What an edit session (ES-9) and the Proposed view allow (`gestureGate`).
 */
import type { ArrowEnds, KindChangeImpact, TlEdge, TlNode } from '@telelean/core';
import { plainText } from '../model/format';
import { cubicPath, type EdgePattern, type Part, type Point, type Rect } from './geometry';
import { MENU_PROPOSED_ARROWS, MENU_PROPOSED_READ_ONLY, MENU_PROVISIONAL, menuName, type MenuThing } from './menu';

// ---- what an arrow offers (A)

/** `drawn`: a click selects it (CM-2). `undeclared`: a proof uses it but nobody drew it, so only its menu opens. */
export type HitRole = 'drawn' | 'undeclared';

/**
 * What a click on an arrow can do, from how the overlay draws it: null for a mention (lean-ref), which is never
 * selectable (BD-5). An arrow is drawn when its pair has a declared premise (`declared`; a declared-only arrow is the
 * `declared` pattern); a verified arrow without one is a proof's use nobody drew (TL107).
 */
export function hitRole(edge: { pattern: EdgePattern; declared?: boolean }): HitRole | null {
  if (edge.pattern === 'reference') return null;
  return edge.declared === true || edge.pattern === 'declared' ? 'drawn' : 'undeclared';
}

/** An arrow (`id`: its edge id) or a ∅ stub (`id`: its card) under the pointer. */
export type Hit = { kind: 'arrow'; id: string; source: string; target: string; role: HitRole } | { kind: 'mark'; id: string };

/** What a left click (no drag) does with what is under the pointer (CM-2). */
export type ClickOutcome =
  | { kind: 'select-arrow'; source: string; target: string; additive: boolean }
  | { kind: 'select-mark'; id: string; additive: boolean }
  /** Empty canvas: a plain click replaces the selection with nothing. */
  | { kind: 'clear' }
  | { kind: 'none' };

/**
 * CM-2: a click selects a drawn arrow or a mark (a plain click replaces the selection, Ctrl/Cmd adds or removes it); a
 * click on an undeclared arrow selects nothing (its menu is its only action); a plain click on empty canvas clears the
 * selection, and a Ctrl/Cmd click there keeps it.
 */
export function clickOutcome(hit: Hit | null, additive: boolean): ClickOutcome {
  if (hit === null) return additive ? { kind: 'none' } : { kind: 'clear' };
  if (hit.kind === 'mark') return { kind: 'select-mark', id: hit.id, additive };
  return hit.role === 'drawn' ? { kind: 'select-arrow', source: hit.source, target: hit.target, additive } : { kind: 'none' };
}

/** CM-7: the menu's thing for an arrow or a stub: a drawn arrow, an undeclared one (its menu only), or a mark. */
export function hitThing(hit: Hit): MenuThing {
  if (hit.kind === 'mark') return { kind: 'mark', id: hit.id };
  return hit.role === 'drawn' ? { kind: 'arrow', source: hit.source, target: hit.target } : { kind: 'undeclared', source: hit.source, target: hit.target };
}

/** An arrow as the overlay drew it in its last frame (board space), for hit-testing and the selection rectangle. */
export interface DrawnPath {
  /** The edge id, `${source}->${target}`. */
  id: string;
  source: string;
  target: string;
  role: HitRole;
  d: string;
  /** Null for a whole arrow; set when one end is out of view (a cut arrow is never wholly inside a rectangle). */
  stub: null | 'source' | 'target';
}

/** A "follows from nothing" stub as drawn (board space). */
export interface DrawnMark {
  id: string;
  d: string;
}

/** A card's box as shown (board space), and the part of the board it is in. */
export interface CardBox {
  id: string;
  part: Part;
  rect: Rect;
}

// ---- geometric hit-testing (the column lies over the overlay)

/** Half the width of an arrow's hit path (board.css `.tl-edge-hit`): how close a press must be to count. */
export const HIT_TOLERANCE = 6;

const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

/**
 * The points along one of the overlay's paths: absolute `M x y`, then `L x y` and `C x1 y1 x2 y2 x y` segments (what
 * geometry.ts writes), each curve sampled `steps` times. Anything else is ignored.
 */
export function pathPoints(d: string, steps = 12): Point[] {
  const points: Point[] = [];
  let at: Point | null = null;
  for (const match of d.matchAll(/([MLC])([^MLC]*)/g)) {
    const n = (match[2]?.match(NUMBER) ?? []).map(Number);
    if (n.some((v) => !Number.isFinite(v))) continue;
    switch (match[1]) {
      case 'M':
        if (n.length >= 2) {
          at = { x: n[0] ?? 0, y: n[1] ?? 0 };
          points.push(at);
        }
        break;
      case 'L':
        for (let i = 0; at && i + 1 < n.length; i += 2) {
          at = { x: n[i] ?? 0, y: n[i + 1] ?? 0 };
          points.push(at);
        }
        break;
      case 'C':
        for (let i = 0; at && i + 5 < n.length; i += 6) {
          const p0: Point = at;
          const p1 = { x: n[i] ?? 0, y: n[i + 1] ?? 0 };
          const p2 = { x: n[i + 2] ?? 0, y: n[i + 3] ?? 0 };
          const p3 = { x: n[i + 4] ?? 0, y: n[i + 5] ?? 0 };
          for (let k = 1; k <= steps; k++) {
            const t = k / steps;
            const u = 1 - t;
            const a = u * u * u;
            const b = 3 * u * u * t;
            const c = 3 * u * t * t;
            const e = t * t * t;
            points.push({ x: a * p0.x + b * p1.x + c * p2.x + e * p3.x, y: a * p0.y + b * p1.y + c * p2.y + e * p3.y });
          }
          at = p3;
        }
        break;
    }
  }
  return points;
}

/** The distance from `p` to the segment `a`–`b`. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** The distance from `p` to a polyline (Infinity for none). */
export function distanceToPolyline(p: Point, points: readonly Point[]): number {
  if (points.length === 0) return Infinity;
  if (points.length === 1) return Math.hypot(p.x - (points[0]?.x ?? 0), p.y - (points[0]?.y ?? 0));
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) best = Math.min(best, distanceToSegment(p, a, b));
  }
  return best;
}

/**
 * The path nearest `p` within `tolerance` (CM-2: "the clickable area is wider than the line"), or null. On a tie the
 * later path wins: it is painted over the earlier one.
 */
export function arrowAt<T extends { d: string }>(paths: readonly T[], p: Point, tolerance = HIT_TOLERANCE): T | null {
  let best: T | null = null;
  let bestDistance = tolerance;
  for (const path of paths) {
    const distance = distanceToPolyline(p, pathPoints(path.d));
    if (distance <= bestDistance) {
      best = path;
      bestDistance = distance;
    }
  }
  return best;
}

// ---- the selection rectangle (D)

/** The rectangle between two corners, whichever way it was dragged. */
export function rectBetween(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

/** The part of `a` inside `b` (a rectangle of no size when they do not meet). */
export function clipRect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return { x, y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y) };
}

export function containsPoint(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function containsRect(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

/** What a selection rectangle selects (CM-2): card ids in reading order, drawn arrows and marks in drawing order. */
export interface AreaSelection {
  cards: string[];
  arrows: ArrowEnds[];
  marks: string[];
}

/**
 * BD-3, CM-2: the cards, arrows and "follows from nothing" marks wholly inside the rectangle `area` (board space). Only
 * the canvas's cards count (the rectangle is drawn on the canvas; the AXIOMS column's cards are never inside it), and
 * only drawn arrows shown whole: a mention or an arrow a proof uses without a declaration is not selectable, and an
 * arrow cut at an edge of the view has an end outside it.
 */
export function areaSelection(area: Rect, input: { cards: readonly CardBox[]; paths: readonly DrawnPath[]; marks: readonly DrawnMark[] }): AreaSelection {
  const inside = (d: string) => {
    const points = pathPoints(d);
    return points.length > 0 && points.every((p) => containsPoint(area, p));
  };
  const cards = input.cards
    .filter((c) => c.part === 'canvas' && containsRect(area, c.rect))
    .sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)
    .map((c) => c.id);
  const arrows: ArrowEnds[] = [];
  for (const path of input.paths) {
    if (path.role !== 'drawn' || path.stub !== null || !inside(path.d)) continue;
    if (!arrows.some((a) => a.source === path.source && a.target === path.target)) arrows.push({ source: path.source, target: path.target });
  }
  const marks = [...new Set(input.marks.filter((m) => inside(m.d)).map((m) => m.id))];
  return { cards: [...new Set(cards)], arrows, marks };
}

// ---- drawing by the handle (C)

/** The texts of a draw that cannot land (the store's ARROW_TEXTS.alreadyDrawn is the same). */
export const DRAW_TEXTS = {
  alreadyDrawn: 'That arrow is drawn already.',
  cycle: (names: readonly string[]) => `This arrow would make a cycle: ${names.join(' → ')}.`,
} as const;

/**
 * Where a draw would land: `none` (not over a card, or over the card it starts from: a release cancels), `refused`
 * (over a card the arrow cannot go into: a release draws nothing, and the reason is shown), or `ok` (a release draws
 * the arrow; into an axiom, AR-6's impact dialog comes first).
 */
export type DrawTarget = { kind: 'none' } | { kind: 'refused'; id: string; reason: string } | { kind: 'ok'; id: string; axiom: boolean };

export interface DrawBoard {
  nodes: Readonly<Record<string, TlNode>>;
  provisional: Readonly<Record<string, true>>;
  /** The board's edges: verified ones count for cycles (AR-3: drawn arrows and the solid arrows of checked proofs). */
  edges: readonly TlEdge[];
}

/**
 * AR-3: the cycle a new arrow `source → target` would close, as core's planner names it (`source`, `target`, …, back
 * to `source`, over the drawn arrows (the premises of propositions; an old axiom's `premises:` is not drawn, A19) and
 * the verified edges), or null.
 */
export function cycleThrough(source: string, target: string, board: Pick<DrawBoard, 'nodes' | 'edges'>): string[] | null {
  const next = new Map<string, string[]>();
  const add = (from: string, to: string) => {
    if (from === to) return;
    const list = next.get(from) ?? [];
    if (!list.includes(to)) list.push(to);
    next.set(from, list);
  };
  for (const node of Object.values(board.nodes)) {
    if (node.type !== 'PROPOSITION') continue;
    for (const premise of node.premises) if (board.nodes[premise]) add(premise, node.id);
  }
  for (const edge of board.edges) if (edge.type === 'verified') add(edge.source, edge.target);
  // Shortest path target → … → source along the arrows (breadth first).
  const parent = new Map<string, string>();
  const seen = new Set([target]);
  const queue = [target];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (id === source) {
      const path = [source];
      for (let at = source; at !== target; ) {
        at = parent.get(at) as string;
        path.unshift(at);
      }
      return [source, ...path];
    }
    for (const to of next.get(id) ?? []) {
      if (seen.has(to)) continue;
      seen.add(to);
      parent.set(to, id);
      queue.push(to);
    }
  }
  return null;
}

/** What a release over card `over` (null: no card) does for a draw from `source` (AR-1, AR-3, AR-6). */
export function drawTarget(source: string, over: string | null, board: DrawBoard): DrawTarget {
  const node = over === null ? undefined : board.nodes[over];
  if (over === null || over === source || !node || !board.nodes[source]) return { kind: 'none' };
  if (board.provisional[over] || board.provisional[source]) return { kind: 'refused', id: over, reason: MENU_PROVISIONAL };
  if (node.type === 'PROPOSITION' && node.premises.includes(source)) return { kind: 'refused', id: over, reason: DRAW_TEXTS.alreadyDrawn };
  const cycle = cycleThrough(source, over, board);
  if (cycle) return { kind: 'refused', id: over, reason: DRAW_TEXTS.cycle(cycle.map((id) => menuName(board.nodes, id))) };
  return { kind: 'ok', id: over, axiom: node.type === 'AXIOM' };
}

/** What releasing a drawn arrow does (AR-1): one arrow from the source into the card under the pointer, a refusal, or nothing. */
export type DrawRelease = { kind: 'add'; target: string; sources: [string] } | { kind: 'refused'; reason: string } | { kind: 'cancel' };

/**
 * The release of a draw (BoardInput), pure: an `ok` target gets one arrow FROM the card the draw started on INTO the
 * card under the pointer (source → target, never the other way round); a refused one only says why; anywhere else
 * cancels.
 */
export function drawRelease(source: string, target: DrawTarget): DrawRelease {
  if (target.kind === 'ok') return { kind: 'add', target: target.id, sources: [source] };
  if (target.kind === 'refused') return { kind: 'refused', reason: target.reason };
  return { kind: 'cancel' };
}

/** What the gesture says while the pointer is over a card (shown next to the pointer). */
export interface DrawHint {
  text: string;
  lines: string[];
  refused: boolean;
}

/**
 * AR-6 "Before you let go, the gesture states the impact": over an axiom, what it becomes and how many cards lose
 * their green glow (kindChangeImpact's A→P summary and detail); over a proposition marked "follows from nothing", that
 * the mark goes (AR-5); over a card the arrow cannot go into, why. Null when not over a card.
 */
export function drawHint(target: DrawTarget, nodes: Readonly<Record<string, TlNode>>, impact: KindChangeImpact | null): DrawHint | null {
  switch (target.kind) {
    case 'none':
      return null;
    case 'refused':
      return { text: target.reason, lines: [], refused: true };
    case 'ok': {
      const text = `Arrow into “${menuName(nodes, target.id)}”`;
      if (target.axiom) {
        const lines = impact ? [impact.summary, plainText(impact.detail)] : ['It becomes a proposition.'];
        return { text, lines: lines.filter((line) => line.length > 0), refused: false };
      }
      return { text, lines: nodes[target.id]?.fromNothing === true ? ['Its "follows from nothing" mark is removed.'] : [], refused: false };
    }
  }
}

/**
 * The rubber-band arrow while drawing (board space): it leaves the source's right edge rightwards, as the arrow will,
 * and arrives at the pointer from where it came.
 */
export function rubberBandPath(from: Point, to: Point): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const arrive = length < 1 ? { x: 1, y: 0 } : { x: dx / length, y: dy / length };
  return cubicPath(from, { x: 1, y: 0 }, to, arrive);
}

// ---- dragging a proposition onto the AXIOMS column (E)

/** AR-7 with several cards moving: the column takes one card at a time (a kind change is one card's). */
export const SEVERAL_TO_AXIOMS = {
  label: 'One card at a time',
  summary: 'Move one proposition at a time to the axioms',
  detail: 'Drop a single card here, or choose "Move to axioms" on each card.',
} as const;

export type CanvasDropOutcome = { kind: 'move' } | { kind: 'to-axioms'; id: string } | { kind: 'refused'; reason: string };

/**
 * Where a move on the canvas ends (BD-3, AR-7): released over the AXIOMS column, one proposition runs "Move to axioms"
 * (its impact dialog first) instead of moving, and several are refused (they go back where they were); anywhere else
 * the cards move.
 */
export function canvasDropOutcome(ids: readonly string[], overColumn: boolean): CanvasDropOutcome {
  if (!overColumn) return { kind: 'move' };
  const only = ids.length === 1 ? ids[0] : undefined;
  return only === undefined ? { kind: 'refused', reason: SEVERAL_TO_AXIOMS.summary } : { kind: 'to-axioms', id: only };
}

/**
 * Slice 1d (AR-7, the 1c2 verification's carry-over): where a proposition dropped on the AXIOMS column lands, as the
 * column's own drop does: before the first column card (other than the moved one) whose middle lies below the drop
 * point, else at the end (null). `cards` are the board's boxes as shown (board space), `y` the drop point's.
 */
export function columnDropBefore(cards: readonly CardBox[], y: number, moving: string): string | null {
  const column = cards.filter((c) => c.part === 'column' && c.id !== moving).sort((a, b) => a.rect.y - b.rect.y);
  return column.find((c) => c.rect.y + c.rect.h / 2 > y)?.id ?? null;
}

/**
 * The AXIOMS column's drop cue (slice 1d carry-over): a proposition moved over it from the canvas makes it the active
 * zone, but several moved cards are refused there (a kind change is one card's), so the column shows the refusal, not
 * the accepting cue; during the column's own re-order drag it is the source, the target or a candidate as before.
 */
export function columnDropCue(input: { moved: { count: number } | null; dragFrom: string | null; active: boolean; kind: string }): 'active' | 'refused' | 'source' | 'candidate' | undefined {
  if (input.moved !== null) return input.moved.count > 1 ? 'refused' : 'active';
  if (input.dragFrom === null) return undefined;
  return input.active ? 'active' : input.dragFrom === input.kind ? 'source' : 'candidate';
}

/**
 * Slice 1c2's geometric hit-testing over the AXIOMS column, pure (the 1c2 verification's carry-over): a board point
 * counts for the arrows there when it lies in the list's visible band, from the list's left edge to the canvas's.
 */
export function inColumnRegion(p: Point, column: { left: number; viewTop: number; viewBottom: number }, canvasLeft: number): boolean {
  return p.x >= column.left && p.x <= canvasLeft && p.y >= column.viewTop && p.y <= column.viewBottom;
}

// ---- the Delete key (B)

export type DeleteOutcome =
  /** One `removeArrows` with the selected arrows and marks (one Undo step; A16's question covers all of it). */
  | { kind: 'remove-selection' }
  /** The focused card's delete dialog. */
  | { kind: 'delete-card'; id: string }
  /** Nothing is sent: why (an edit session, ES-9; the Proposed view's arrows). */
  | { kind: 'refused'; reason: string }
  | { kind: 'none' };

/**
 * AR-1: Delete removes the selected arrows and marks; cards are never deleted together with arrows, so the focused card's
 * delete dialog opens only when no arrow or mark is selected. During an edit session (ES-9) nothing is sent and the
 * reason is shown. The Proposed view is read-only: with arrows or marks selected the reason is shown, and a card's
 * Delete does nothing there.
 */
export function deleteOutcome(selection: { arrows: number; marks: number }, focused: string | null, gate: { lock: string | null; proposed: boolean }): DeleteOutcome {
  const arrowsOrMarks = selection.arrows + selection.marks > 0;
  if (gate.proposed) return arrowsOrMarks ? { kind: 'refused', reason: MENU_PROPOSED_ARROWS } : { kind: 'none' };
  if (!arrowsOrMarks && focused === null) return { kind: 'none' };
  if (gate.lock !== null) return { kind: 'refused', reason: gate.lock };
  return arrowsOrMarks ? { kind: 'remove-selection' } : { kind: 'delete-card', id: focused ?? '' };
}

// ---- what an edit session and the Proposed view allow (F)

export interface GestureGate {
  /** Drawing an arrow by its handle (AR-1): null when allowed, else why not. */
  draw: string | null;
  /** Moving cards on the canvas, and dropping one on the AXIOMS column (BD-3, AR-7): null when allowed, else why not. */
  move: string | null;
  /** Selecting arrows, marks and cards by click or rectangle (CM-2): allowed during an edit session, never in the Proposed view. */
  select: boolean;
}

/**
 * ES-9 (slice 1f): while an edit session is active (`lock`), the gestures that edit are off with its reason, and
 * selecting and menus stay. The Proposed view is read-only: arrows change only through review items and transforms,
 * nothing moves, and nothing is selected.
 */
export function gestureGate(state: { lock: string | null; proposed: boolean }): GestureGate {
  if (state.proposed) return { draw: MENU_PROPOSED_ARROWS, move: MENU_PROPOSED_READ_ONLY, select: false };
  return { draw: state.lock, move: state.lock, select: true };
}
