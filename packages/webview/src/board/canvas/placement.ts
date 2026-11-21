/**
 * Where propositions go on the canvas (spec v4 BD-3, A24; docs/slice1-plan.md §3 "Placement"). Pure: the canvas
 * measures its cards' collapsed sizes and calls these.
 *
 * - A card with a stored position (layout.json, `TlGraph.positions`) stays exactly there: telelean never moves it.
 * - Every other proposition gets a layered place, computed here and never written (opening a board writes nothing,
 *   AP-12) until the user moves the card or chooses Tidy layout. Its layer is the longest declared-arrow path into it
 *   from any card, the axioms being layer 0, so the canvas's first layer is 1; x = layer × (card width + column gap);
 *   within a layer the cards stack in board (file) order from the top, skipping the boxes of stored cards, so cards
 *   never overlap and sources sit to the left of their targets.
 * - Tidy layout re-places the selected cards (all, when none is selected) the same way, around the others where they
 *   are shown; the board stores the result as one move (one Undo step).
 * - BD-8: a proposition from the A|P box goes into view, next to the selected card if any (right of a proposition;
 *   level with an axiom, at the canvas's left side).
 * - The Proposed view shows the cards it shares with the Current board where the Current board shows them.
 */
import { toCanvas, type Box, type Point, type Size, type ViewTransform } from './view';

export interface PlacementOptions {
  /** A canvas card's width (CSS `--tl-card-w`; the measured width wins when known). */
  cardWidth: number;
  /** Between two layers. */
  columnGap: number;
  /** Between two cards of a layer (and around a stored card). */
  rowGap: number;
  /** The first card of a layer starts here. */
  top: number;
  /** A card's height before it has been measured. */
  estimatedHeight: number;
}

export const PLACEMENT: PlacementOptions = { cardWidth: 260, columnGap: 96, rowGap: 22, top: 0, estimatedHeight: 64 };

export interface PlacementInput {
  /** The propositions, in board (file) order. */
  ids: readonly string[];
  /** The declared arrows into a card (its `premises:`). */
  premisesOf: (id: string) => readonly string[];
  /** Axioms are layer 0; sources that are neither an axiom nor in `ids` (other subjects, deleted) count for nothing. */
  isAxiom: (id: string) => boolean;
  /** Stored positions (top-left corners, canvas coordinates). */
  stored: Readonly<Record<string, Point>>;
  /** A card's measured collapsed size (an estimate before it is measured). */
  sizeOf: (id: string) => Size;
  options?: Partial<PlacementOptions>;
}

/**
 * Each proposition's layer: 1 + the longest path of declared arrows into it, counting an axiom source as layer 0 (so a
 * proposition resting on axioms only, or on nothing, is in layer 1). A cycle in the files (TL015) is cut where the walk
 * meets it again, so every card still gets a layer.
 */
export function canvasLayers(ids: readonly string[], premisesOf: (id: string) => readonly string[], isAxiom: (id: string) => boolean): Map<string, number> {
  const known = new Set(ids);
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const layerOf = (id: string): number => {
    const done = memo.get(id);
    if (done !== undefined) return done;
    if (visiting.has(id)) return 0; // the arrow that closes a cycle adds nothing
    visiting.add(id);
    let layer = 1;
    for (const source of premisesOf(id)) {
      if (source === id) continue;
      if (known.has(source)) layer = Math.max(layer, layerOf(source) + 1);
      else if (isAxiom(source)) layer = Math.max(layer, 1);
    }
    visiting.delete(id);
    memo.set(id, layer);
    return layer;
  };
  for (const id of ids) layerOf(id);
  return memo;
}

/** Boxes that share some of the horizontal band [x, x + w), sorted by their top. */
function inBand(boxes: readonly Box[], x: number, w: number): Box[] {
  return boxes.filter((b) => b.x < x + w && x < b.x + b.w).sort((a, b) => a.y - b.y);
}

/**
 * The first y at or below `from` where a box of `size` in the band fits between `band`'s boxes (sorted by top), with
 * `gap` kept above and below each of them.
 */
function firstFree(band: readonly Box[], from: number, size: Size, gap: number): number {
  let y = from;
  for (const b of band) {
    if (b.y + b.h + gap <= y) continue; // wholly above
    if (b.y >= y + size.h + gap) break; // this one and the rest (sorted by top) are below
    y = b.y + b.h + gap;
  }
  return y;
}

/** Inserts `box` into `band` (sorted by top). */
function insertSorted(band: Box[], box: Box): void {
  const index = band.findIndex((b) => b.y > box.y);
  if (index < 0) band.push(box);
  else band.splice(index, 0, box);
}

/** Every proposition's position: its stored one, else its layered place (see the module comment). */
export function placeCards(input: PlacementInput): Record<string, Point> {
  const o = { ...PLACEMENT, ...input.options };
  const out: Record<string, Point> = {};
  const obstacles: Box[] = [];
  for (const id of input.ids) {
    const p = input.stored[id];
    if (!p) continue;
    out[id] = { x: p.x, y: p.y };
    const size = input.sizeOf(id);
    obstacles.push({ x: p.x, y: p.y, w: size.w, h: size.h });
  }
  const layers = canvasLayers(input.ids, input.premisesOf, input.isAxiom);
  const byLayer = new Map<number, string[]>();
  for (const id of input.ids) {
    if (out[id]) continue;
    const layer = layers.get(id) ?? 1;
    const list = byLayer.get(layer);
    if (list) list.push(id);
    else byLayer.set(layer, [id]);
  }
  for (const layer of [...byLayer.keys()].sort((a, b) => a - b)) {
    const x = layer * (o.cardWidth + o.columnGap);
    const ids = byLayer.get(layer) ?? [];
    const band = inBand(obstacles, x, Math.max(o.cardWidth, ...ids.map((id) => input.sizeOf(id).w)));
    let cursor = o.top;
    for (const id of ids) {
      const size = input.sizeOf(id);
      const y = firstFree(band, cursor, size, o.rowGap);
      out[id] = { x, y };
      const box = { x, y, w: size.w, h: size.h };
      obstacles.push(box);
      insertSorted(band, box);
      cursor = y + size.h + o.rowGap;
    }
  }
  return out;
}

/**
 * Tidy layout: new positions for the cards in `which` (all of `input.ids` when null), placed as if they had none,
 * around the other cards where they are shown (`shown`: every card's current position, stored or placed).
 */
export function tidyPositions(input: PlacementInput, shown: Readonly<Record<string, Point>>, which: readonly string[] | null): Record<string, Point> {
  const moving = new Set((which ?? input.ids).filter((id) => input.ids.includes(id)));
  const stored: Record<string, Point> = {};
  for (const id of input.ids) {
    const p = shown[id];
    if (!moving.has(id) && p) stored[id] = p;
  }
  const placed = placeCards({ ...input, stored });
  const out: Record<string, Point> = {};
  for (const id of input.ids) {
    const p = placed[id];
    if (moving.has(id) && p) out[id] = { x: Math.round(p.x), y: Math.round(p.y) };
  }
  return out;
}

/**
 * BD-8: where a new proposition from the A|P box goes: right of `near` (the selected card's box, on the canvas) when
 * there is one; else at `beside` (the place next to a selected axiom: `besideAxiom`); else centred on `center` (the
 * middle of the view). In each case it is moved down past the cards `boxes` it would overlap.
 */
export function newCardPosition(args: { near: Box | null; beside?: Point | null; center: Point; boxes: readonly Box[]; size: Size; options?: Partial<PlacementOptions> }): Point {
  const o = { ...PLACEMENT, ...args.options };
  const start = args.near
    ? { x: args.near.x + args.near.w + o.columnGap, y: args.near.y }
    : (args.beside ?? { x: args.center.x - args.size.w / 2, y: args.center.y - args.size.h / 2 });
  const y = firstFree(inBand(args.boxes, start.x, args.size.w), start.y, args.size, o.rowGap);
  return { x: Math.round(start.x), y: Math.round(y) };
}

/** BD-8: a new card next to a selected axiom keeps this far (viewport px) inside the canvas's edges. */
export const BESIDE_AXIOM_INSET = 24;

/**
 * BD-8 for a selected axiom (it sits in the AXIOMS column, left of the canvas): the new proposition goes to the
 * canvas's left side, level with the axiom's top (`top`, viewport px, which may lie outside the view when the column
 * is scrolled), kept in view. Returns the card's top-left corner in canvas coordinates (`newCardPosition`'s `beside`).
 */
export function besideAxiom(view: ViewTransform, viewport: Size, top: number, size: Size, inset = BESIDE_AXIOM_INSET): Point {
  const lowest = Math.max(inset, viewport.h - inset - size.h * view.s);
  return toCanvas(view, { x: inset, y: Math.min(lowest, Math.max(inset, top)) });
}

/**
 * The stored positions the Proposed view places its cards with (BD-3; brief 1c E): the proposal's own (`stored`: the
 * board's, carried over by the runner, plus those of the cards it removes), and, for every other card it shows that
 * the Current board shows too, the place the Current board gives it (`shown`: stored or placed). Switching between
 * Current and Proposed then never moves a card the user has not moved; only the proposal's new cards go through the
 * layered placement, around the others. Nothing is written: these places are only shown. Returns `stored` itself when
 * nothing is added.
 */
export function keepCurrentPlaces(
  ids: readonly string[],
  stored: Readonly<Record<string, Point>>,
  shown: Readonly<Record<string, Point>> | undefined,
): Readonly<Record<string, Point>> {
  if (!shown) return stored;
  let out: Record<string, Point> | null = null;
  for (const id of ids) {
    const p = shown[id];
    if (stored[id] || !p) continue;
    out ??= { ...stored };
    out[id] = p;
  }
  return out ?? stored;
}
