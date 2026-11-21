/**
 * Spec v4 BD-3, CM-7, A21 (slice 1c): the canvas's pure parts: the view transform (zoom about the cursor, the wheel and
 * pinch factors, Fit all, reveals, following the focused card), the 4 px click/drag threshold, and the placement of
 * propositions that have no stored position (layers, stacking around stored cards, Tidy layout, BD-8's new card).
 */
import { describe, expect, it } from 'vitest';
import { beyondSlop, CLICK_SLOP, PressTracker } from '../../src/board/canvas/gesture';
import {
  BESIDE_AXIOM_INSET,
  besideAxiom,
  canvasLayers,
  keepCurrentPlaces,
  newCardPosition,
  PLACEMENT,
  placeCards,
  tidyPositions,
  type PlacementInput,
} from '../../src/board/canvas/placement';
import {
  boundsOf,
  centerOn,
  clampScale,
  fitView,
  followView,
  interpolateView,
  KEY_ZOOM,
  revealView,
  toCanvas,
  toViewport,
  wheelFactor,
  zoomAbout,
  zoomStep,
  ZOOM_MAX,
  ZOOM_MIN,
  type ViewTransform,
} from '../../src/board/canvas/view';

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('the view transform (BD-3)', () => {
  it('zooms about the cursor: the canvas point under it stays put (t′ = c − (c − t)·s′/s)', () => {
    const view: ViewTransform = { x: 40, y: -30, s: 1.25 };
    const cursor = { x: 300, y: 210 };
    const before = toCanvas(view, cursor);
    const zoomed = zoomAbout(view, cursor, 1.6);
    close(zoomed.s, 2);
    const after = toCanvas(zoomed, cursor);
    close(after.x, before.x);
    close(after.y, before.y);
    close(zoomed.x, cursor.x - (cursor.x - view.x) * (2 / 1.25));
    // toViewport is toCanvas's inverse.
    const back = toViewport(zoomed, after);
    close(back.x, cursor.x);
    close(back.y, cursor.y);
  });

  it('keeps the zoom within 10 %–400 %, and the point under the cursor still fixed at the limit', () => {
    expect(clampScale(0.01)).toBe(ZOOM_MIN);
    expect(clampScale(99)).toBe(ZOOM_MAX);
    expect(clampScale(Number.NaN)).toBe(1);
    const view: ViewTransform = { x: 0, y: 0, s: 3.5 };
    const cursor = { x: 100, y: 100 };
    const zoomed = zoomAbout(view, cursor, 10);
    expect(zoomed.s).toBe(ZOOM_MAX);
    close(toCanvas(zoomed, cursor).x, toCanvas(view, cursor).x);
    expect(zoomAbout({ x: 0, y: 0, s: ZOOM_MIN }, cursor, 0.5).s).toBe(ZOOM_MIN);
  });

  it('the wheel: towards the user zooms out, away zooms in; Ctrl (a pinch) is scaled up; line deltas count as 16 px', () => {
    expect(wheelFactor(100, 0, false)).toBeLessThan(1);
    expect(wheelFactor(-100, 0, false)).toBeGreaterThan(1);
    close(wheelFactor(100, 0, false) * wheelFactor(-100, 0, false), 1);
    // A pinch's small delta zooms as much as a wheel notch's large one would.
    expect(Math.abs(Math.log(wheelFactor(10, 0, true)))).toBeGreaterThan(Math.abs(Math.log(wheelFactor(10, 0, false))) * 5);
    close(wheelFactor(3, 1, false), wheelFactor(48, 0, false));
    // One event never zooms by more than 2× either way; nonsense deltas do nothing.
    expect(wheelFactor(1e6, 0, true)).toBe(0.5);
    expect(wheelFactor(-1e6, 0, true)).toBe(2);
    expect(wheelFactor(Number.NaN, 0, false)).toBe(1);
  });

  it('+ and − zoom one step about the viewport centre', () => {
    const view: ViewTransform = { x: 10, y: 20, s: 1 };
    const size = { w: 800, h: 600 };
    const centre = toCanvas(view, { x: 400, y: 300 });
    const inStep = zoomStep(view, size, 1);
    close(inStep.s, KEY_ZOOM);
    close(toCanvas(inStep, { x: 400, y: 300 }).x, centre.x);
    close(zoomStep(inStep, size, -1).s, 1);
  });

  it('Fit all centres the cards, never above 100 %; a board too large for the smallest scale starts at its top-left', () => {
    const box = boundsOf([
      { x: 0, y: 0, w: 260, h: 60 },
      { x: 400, y: 300, w: 260, h: 80 },
    ]);
    expect(box).toEqual({ x: 0, y: 0, w: 660, h: 380 });
    expect(boundsOf([])).toBeNull();
    const size = { w: 1000, h: 800 };
    const small = fitView({ x: 100, y: 50, w: 200, h: 100 }, size);
    expect(small.s).toBe(1);
    close(small.x + small.s * 200, 500); // the box's centre at the viewport's centre
    close(small.y + small.s * 100, 400);
    const big = fitView({ x: 0, y: 0, w: 4000, h: 1000 }, size);
    close(big.s, (1000 - 64) / 4000);
    const huge = fitView({ x: -50, y: 20, w: 100_000, h: 100 }, size, { margin: 32, maxScale: 1, minScale: 0.6 });
    expect(huge).toEqual({ x: 32 + 0.6 * 50, y: 32 - 0.6 * 20, s: 0.6 });
  });

  it('a reveal does nothing when the card is whole in view at a readable scale; otherwise it centres it (at 100 % when small)', () => {
    const size = { w: 800, h: 600 };
    const card = { x: 100, y: 100, w: 260, h: 60 };
    expect(revealView({ x: 0, y: 0, s: 1 }, card, size)).toBeNull();
    const far = revealView({ x: -2000, y: 0, s: 1 }, card, size);
    expect(far).toEqual(centerOn(card, size, 1));
    const tiny = revealView({ x: 0, y: 0, s: 0.3 }, card, size);
    expect(tiny?.s).toBe(1);
    close((tiny?.x ?? 0) + 230, 400);
  });

  it('following the focused card pans as little as possible and keeps the zoom', () => {
    const size = { w: 800, h: 600 };
    expect(followView({ x: 0, y: 0, s: 1 }, { x: 100, y: 100, w: 200, h: 50 }, size)).toBeNull();
    const right = followView({ x: 0, y: 0, s: 1 }, { x: 900, y: 100, w: 200, h: 50 }, size);
    expect(right).toEqual({ x: 800 - 24 - 1100, y: 0, s: 1 });
    const above = followView({ x: 0, y: 0, s: 0.5 }, { x: 100, y: -400, w: 200, h: 50 }, size);
    expect(above).toEqual({ x: 0, y: 24 + 200, s: 0.5 });
  });

  it('an animation step moves the scale geometrically and ends exactly on the target', () => {
    const size = { w: 800, h: 600 };
    const from: ViewTransform = { x: 0, y: 0, s: 0.5 };
    const to: ViewTransform = { x: -300, y: 120, s: 2 };
    expect(interpolateView(from, to, 0, size)).toEqual(from);
    const end = interpolateView(from, to, 1, size);
    close(end.x, to.x);
    close(end.y, to.y);
    close(end.s, to.s);
    close(interpolateView(from, to, 0.5, size).s, 1);
  });
});

describe('click or drag (CM-7, A21)', () => {
  it('less than 4 px between press and release is a click; 4 px or more is a drag, even if the pointer comes back', () => {
    expect(CLICK_SLOP).toBe(4);
    expect(beyondSlop({ x: 0, y: 0 }, { x: 3, y: 2 })).toBe(false); // √13 ≈ 3.6
    expect(beyondSlop({ x: 0, y: 0 }, { x: 0, y: 4 })).toBe(true);
    const click = new PressTracker({ x: 10, y: 10 });
    expect(click.move({ x: 12, y: 11 })).toEqual({ dx: 0, dy: 0, started: false });
    expect(click.isClick({ x: 12, y: 12 })).toBe(true);
    const drag = new PressTracker({ x: 10, y: 10 });
    expect(drag.move({ x: 15, y: 10 })).toEqual({ dx: 5, dy: 0, started: true }); // the first step covers the whole way
    expect(drag.move({ x: 17, y: 13 })).toEqual({ dx: 2, dy: 3, started: false });
    drag.move({ x: 10, y: 10 });
    expect(drag.dragging).toBe(true);
    expect(drag.isClick({ x: 10, y: 10 })).toBe(false); // a right drag that comes back only panned: no menu
    expect(drag.total).toEqual({ dx: 0, dy: 0 });
  });
});

/** A board: axioms a1, a2; propositions p1..p5 with arrows a1 → p1, p1 → p2, p2 → p3, a2 → p4, p5 with none. */
function board(stored: PlacementInput['stored'] = {}, heights: Record<string, number> = {}): PlacementInput {
  const premises: Record<string, string[]> = { p1: ['a1'], p2: ['p1'], p3: ['p2', 'a2'], p4: ['a2'], p5: [] };
  return {
    ids: ['p1', 'p2', 'p3', 'p4', 'p5'],
    premisesOf: (id) => premises[id] ?? [],
    isAxiom: (id) => id.startsWith('a'),
    stored,
    sizeOf: (id) => ({ w: 260, h: heights[id] ?? 60 }),
  };
}
const step = PLACEMENT.cardWidth + PLACEMENT.columnGap;
const gap = PLACEMENT.rowGap;

describe('placement (BD-3, A24)', () => {
  it('layers: the longest declared-arrow path, axioms at layer 0 (so the canvas starts at 1); a cycle in the files is cut', () => {
    const input = board();
    expect(Object.fromEntries(canvasLayers(input.ids, input.premisesOf, input.isAxiom))).toEqual({ p1: 1, p2: 2, p3: 3, p4: 1, p5: 1 });
    const cyclic: Record<string, string[]> = { c1: ['c2'], c2: ['c1'], c3: ['c1', 'gone'] };
    const layers = canvasLayers(['c1', 'c2', 'c3'], (id) => cyclic[id] ?? [], () => false);
    expect(layers.get('c2')).toBe(1);
    expect(layers.get('c1')).toBe(2);
    expect(layers.get('c3')).toBe(3);
  });

  it('places each layer in its own column (x = layer × (card width + gap)) and stacks it in board order', () => {
    const placed = placeCards(board({}, { p1: 100 }));
    expect(placed).toEqual({
      p1: { x: step, y: 0 },
      p4: { x: step, y: 100 + gap },
      p5: { x: step, y: 100 + gap + 60 + gap },
      p2: { x: 2 * step, y: 0 },
      p3: { x: 3 * step, y: 0 },
    });
  });

  it('never moves a stored card, and stacks the others around it', () => {
    const placed = placeCards(board({ p4: { x: step + 10, y: 50 }, p3: { x: -500, y: 7 } }));
    expect(placed.p4).toEqual({ x: step + 10, y: 50 });
    expect(placed.p3).toEqual({ x: -500, y: 7 });
    // p1 fits above p4 (0..60 + gap stays clear of 50? no: it overlaps), so it goes below it.
    expect(placed.p1).toEqual({ x: step, y: 50 + 60 + gap });
    expect(placed.p5).toEqual({ x: step, y: 50 + 60 + gap + 60 + gap });
  });

  it('Tidy layout re-places the chosen cards around the others where they are shown (all of them when none is chosen)', () => {
    const input = board({ p2: { x: 9000, y: 9000 } });
    const shown = placeCards(input);
    // All: a clean layered layout, stored positions ignored.
    expect(tidyPositions(input, shown, null)).toEqual(placeCards(board()));
    // Only p2: back into layer 2, around the cards that stay.
    expect(tidyPositions(input, shown, ['p2'])).toEqual({ p2: { x: 2 * step, y: 0 } });
    // Axioms and unknown ids are not canvas cards.
    expect(tidyPositions(input, shown, ['a1', 'nope'])).toEqual({});
  });

  it('BD-8: a new card goes right of the selected card, or in the middle of the view, below any card in the way', () => {
    const boxes = [
      { x: 0, y: 0, w: 260, h: 60 },
      { x: step, y: 0, w: 260, h: 60 },
    ];
    expect(newCardPosition({ near: boxes[0] ?? null, center: { x: 0, y: 0 }, boxes, size: { w: 260, h: 60 } })).toEqual({ x: step, y: 60 + gap });
    expect(newCardPosition({ near: null, center: { x: 1000, y: 500 }, boxes, size: { w: 260, h: 60 } })).toEqual({ x: 870, y: 470 });
  });

  it('BD-8: next to a selected axiom, at the canvas\'s left side, level with it and in view, below any card in the way', () => {
    const size = { w: 260, h: 60 };
    const viewport = { w: 800, h: 600 };
    const view: ViewTransform = { x: 100, y: -40, s: 0.5 };
    // The axiom's top is 200 px down the viewport: the new card's top-left shows at (24, 200).
    const beside = besideAxiom(view, viewport, 200, size);
    expect(beside).toEqual(toCanvas(view, { x: BESIDE_AXIOM_INSET, y: 200 }));
    expect(toViewport(view, beside)).toEqual({ x: 24, y: 200 });
    // An axiom scrolled out of the column's view: the card still goes in view, at the top or at the bottom.
    expect(toViewport(view, besideAxiom(view, viewport, -500, size)).y).toBe(24);
    expect(toViewport(view, besideAxiom(view, viewport, 5000, size)).y).toBe(600 - 24 - 60 * 0.5);
    // A card in the way there: it moves down past it.
    const at = { x: -100, y: 400 };
    expect(newCardPosition({ near: null, beside: at, center: { x: 0, y: 0 }, boxes: [{ x: -150, y: 380, w: 260, h: 60 }], size })).toEqual({ x: -100, y: 380 + 60 + gap });
    expect(newCardPosition({ near: null, beside: at, center: { x: 0, y: 0 }, boxes: [], size })).toEqual(at);
  });

  it("the Proposed view keeps every card where the Current board shows it: only the proposal's new cards are placed", () => {
    // The Current board: nothing stored, so p1, p4 and p5 are stacked in layer 1 by the placement.
    const current = board();
    const shown = placeCards(current);
    expect([shown.p1, shown.p4, shown.p5]).toEqual([
      { x: step, y: 0 },
      { x: step, y: 60 + gap },
      { x: step, y: 2 * (60 + gap) },
    ]);
    // The proposal changes p1 (its diff line makes it 20 px taller) and adds n, which rests on the axiom a1 (layer 1).
    const ids = [...current.ids, 'n'];
    const proposedInput = (stored: PlacementInput['stored']): PlacementInput => ({
      ...current,
      ids,
      premisesOf: (id) => (id === 'n' ? ['a1'] : current.premisesOf(id)),
      stored,
      sizeOf: (id) => ({ w: 260, h: id === 'p1' ? 80 : 60 }),
    });
    const kept = placeCards(proposedInput(keepCurrentPlaces(ids, {}, shown)));
    for (const id of current.ids) expect(kept[id]).toEqual(shown[id]);
    // n goes into its layer, below the cards that stay.
    expect(kept.n).toEqual({ x: step, y: 3 * (60 + gap) });
    // Without the Current board's places, the taller p1 would push p4 and p5 down when the view switches.
    expect(placeCards(proposedInput({})).p4).toEqual({ x: step, y: 80 + gap });
    // The proposal's own stored positions win; nothing to add gives the stored record itself.
    const stored = { p1: { x: 7, y: 8 } };
    expect(keepCurrentPlaces(['p1', 'p4'], stored, shown)).toEqual({ p1: { x: 7, y: 8 }, p4: shown.p4 });
    expect(keepCurrentPlaces(['p1'], stored, shown)).toBe(stored);
    expect(keepCurrentPlaces(['p1', 'p4'], stored, undefined)).toBe(stored);
  });
});
