/**
 * The edge overlay's pure geometry across the AXIOMS column (scrolls) and the PROPOSITIONS canvas (pan and zoom), spec
 * v4 BD-4 (slice 1c): card boxes in board space, the routing between card sides, the cut of an arrow whose other end is
 * out of view (at the column's top or bottom, or at the canvas edge it leaves through), the "n linked" badges of the
 * column and of each canvas edge, the ∅ stubs, culling and the drawing budget.
 */
import { describe, expect, it } from 'vitest';
import {
  anchor,
  BAND_PARTLY_DRAWN,
  bandRoute,
  badgeLabel,
  badgeText,
  cardRect,
  computeFrame,
  DEFAULT_GEOMETRY,
  routeSides,
  segmentExit,
  visibility,
  type BandSpec,
  type CanvasGeom,
  type CardGeom,
  type ColumnGeom,
  type EdgeSpec,
  type FrameInput,
  type Rect,
} from '../../src/board/geometry';
import { pathPoints } from '../../src/board/gestures';

// The column's list: board x 14..300, visible y 40..440. The canvas viewport: board x 320..1000, y 0..600.
const column: ColumnGeom = { originX: 14, originY: 40, left: 14, right: 300, viewTop: 40, viewBottom: 440 };
const canvas = (view = { x: 0, y: 0, s: 1 }): CanvasGeom => ({ left: 320, top: 0, right: 1000, bottom: 600, view });
const inColumn = (top: number, height = 50): CardGeom => ({ part: 'column', left: 4, top, width: 280, height });
const onCanvas = (left: number, top: number, width = 260, height = 60): CardGeom => ({ part: 'canvas', left, top, width, height });
const edge = (source: string, target: string, pattern: EdgeSpec['pattern'] = 'declared'): EdgeSpec => ({ id: `${source}->${target}`, source, target, pattern });
const nums = (d: string) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
const start = (d: string) => nums(d).slice(0, 2);
const end = (d: string) => nums(d).slice(-2);

const cards = new Map<string, CardGeom>([
  ['a1', inColumn(10)], // board y 50..100
  ['a2', inColumn(600)], // below the column's band
  ['a3', inColumn(-200)], // above it (scrolled past)
  ['p1', onCanvas(100, 100)], // board x 420..680, y 100..160
  ['p2', onCanvas(500, 100)], // board x 820..1080 (partly out on the right, still in view)
  ['p3', onCanvas(100, 300)], // below p1
  ['far-right', onCanvas(2000, 100)],
  ['far-right-2', onCanvas(1500, 120)],
  ['above', onCanvas(100, -500)],
  ['behind', onCanvas(-400, 100)], // board x -80..180: behind the column
]);

function frame(edges: EdgeSpec[], extra: Partial<FrameInput> = {}) {
  return computeFrame({ column, scrollTop: 0, canvas: canvas(), cards, edges, focus: new Set(), ...extra });
}

describe('boxes and visibility', () => {
  it('a column card moves with the scroll; a canvas card with the pan and the zoom', () => {
    const input = { column, scrollTop: 30, canvas: canvas({ x: -50, y: 20, s: 0.5 }) };
    expect(cardRect(inColumn(10), input)).toEqual({ x: 18, y: 40 + 10 - 30, w: 280, h: 50 });
    expect(cardRect(onCanvas(100, 100), input)).toEqual({ x: 320 - 50 + 50, y: 20 + 50, w: 130, h: 30 });
  });

  it('a column card out of the band is above or below; a canvas card counts as in view when 8 px of it show', () => {
    const input = { column, canvas: canvas() };
    const below = cards.get('a2') as CardGeom;
    expect(visibility(below, cardRect(below, { ...input, scrollTop: 0 }), input)).toEqual({ visible: false, dir: 1 });
    expect(visibility(inColumn(10), cardRect(inColumn(10), { ...input, scrollTop: 0 }), input)).toEqual({ visible: true, top: 50, bottom: 100 });
    const sliver = onCanvas(673, 100); // board x 993..1253: 7 px in view
    expect(visibility(sliver, cardRect(sliver, { ...input, scrollTop: 0 }), input).visible).toBe(false);
    const enough = onCanvas(672, 100);
    expect(visibility(enough, cardRect(enough, { ...input, scrollTop: 0 }), input).visible).toBe(true);
  });
});

describe('routing (BD-4)', () => {
  it("from the source's right edge to the target's left edge; nearest sides when the target is to the left; a loop when they overlap", () => {
    const r = (x: number, y = 0) => ({ x, y, w: 100, h: 40 });
    expect(routeSides(r(0), r(200))).toEqual({ s: 'R', t: 'L', loop: false });
    expect(routeSides(r(200), r(0))).toEqual({ s: 'L', t: 'R', loop: false });
    expect(routeSides(r(0), r(50, 300))).toEqual({ s: 'R', t: 'R', loop: true });
  });

  it('draws a column-to-canvas arrow and a canvas arrow in full, on the title lines, each under its clip', () => {
    const out = frame([edge('a1', 'p1'), edge('p1', 'p2', 'verified')]);
    const [cross, inner] = out.paths;
    expect(start(cross?.d ?? '')).toEqual([298, 68]); // a1's right edge, 18 px below its top
    expect(end(cross?.d ?? '')).toEqual([420, 118]); // p1's left edge
    expect(cross).toMatchObject({ clip: 'board', stub: null });
    expect(start(inner?.d ?? '')).toEqual([680, 118]);
    expect(end(inner?.d ?? '')).toEqual([820, 118]);
    expect(inner).toMatchObject({ clip: 'canvas', stub: null });
    expect(out.badges).toEqual([]);
  });

  it('a target left of its source is entered on its right; cards above one another get a loop on the right', () => {
    const out = frame([edge('p2', 'p1'), edge('p1', 'p3')]);
    expect(start(out.paths[0]?.d ?? '')).toEqual([820, 118]);
    expect(end(out.paths[0]?.d ?? '')).toEqual([680, 118]);
    const loop = nums(out.paths[1]?.d ?? '');
    expect([loop[0], loop.at(-2)]).toEqual([680, 680]);
    expect(loop[2]).toBeGreaterThan(680);
  });

  it('follows the zoom: anchors scale, the title-line offset too', () => {
    const out = computeFrame({ column, scrollTop: 0, canvas: canvas({ x: 10, y: 0, s: 0.5 }), cards, edges: [edge('a1', 'p1')], focus: new Set() });
    expect(end(out.paths[0]?.d ?? '')).toEqual([320 + 10 + 50, 50 + 9]);
  });

  it('clamps the anchor into the visible part of a partly scrolled card', () => {
    const tall = new Map<string, CardGeom>([...cards, ['tall', inColumn(100, 200)]]);
    // Scrolled by 80, the card spans board y 60..260: its title line (18 px below its top) still shows.
    const shown = computeFrame({ column, scrollTop: 80, canvas: canvas(), cards: tall, edges: [edge('tall', 'p1')], focus: new Set() });
    expect(start(shown.paths[0]?.d ?? '')).toEqual([298, 78]);
    // Scrolled by 200 (board y -60..140): the title line is above the band, so the end sits just inside its top.
    const cut = computeFrame({ column, scrollTop: 200, canvas: canvas(), cards: tall, edges: [edge('tall', 'p1')], focus: new Set() });
    expect(cut.paths[0]).toMatchObject({ stub: null, clip: 'board' });
    expect(start(cut.paths[0]?.d ?? '')).toEqual([298, column.viewTop + DEFAULT_GEOMETRY.edgeInset]);
    // The same rule, directly: a band 40..140 keeps the anchor within 44..136.
    expect(anchor({ x: 18, y: -60, w: 280, h: 200 }, 'R', 1, { top: 40, bottom: 140 })).toEqual({ x: 298, y: 44 });
    expect(anchor({ x: 18, y: 120, w: 280, h: 200 }, 'L', 1, { top: 120, bottom: 140 })).toEqual({ x: 18, y: 136 });
  });

  it('joins two column cards in view by a loop on their right side, under the board clip', () => {
    const withA4 = new Map<string, CardGeom>([...cards, ['a4', inColumn(100)]]); // board y 140..190
    const out = computeFrame({ column, scrollTop: 0, canvas: canvas(), cards: withA4, edges: [edge('a1', 'a4', 'verified')], focus: new Set(['a4']) });
    const [p] = out.paths;
    expect(p).toMatchObject({ clip: 'board', stub: null, focused: true });
    const n = nums(p?.d ?? '');
    expect(start(p?.d ?? '')).toEqual([298, 68]); // a1's right edge, on its title line
    expect(end(p?.d ?? '')).toEqual([298, 158]); // a4's right edge
    expect(n[2]).toBeGreaterThan(298); // the control points bulge out to the right, towards the canvas
    expect(n[4]).toBeGreaterThan(298);
    expect(out.badges).toEqual([]);
  });
});

describe('ends out of view (BD-4)', () => {
  it('in the column: cut at the column\'s bottom, upright, and counted in "▼ n linked"', () => {
    const out = frame([edge('a2', 'p1')]);
    const [p] = out.paths;
    expect(p).toMatchObject({ stub: 'target', cut: 'down', clip: 'board' });
    const n = nums(p?.d ?? '');
    expect(n.slice(0, 2)).toEqual([298, 440]); // a2's right edge, at the bottom of the band
    expect(n[3]).toBeLessThan(440); // leaving upwards
    expect(end(p?.d ?? '')).toEqual([420, 118]);
    expect(out.badges).toEqual([{ part: 'column', dir: 'down', ids: ['a2'] }]);
    expect(frame([edge('a3', 'p1')]).badges).toEqual([{ part: 'column', dir: 'up', ids: ['a3'] }]);
  });

  it('within the column: a short hook from the card in view towards the scrolled-away end, counted in "▲ / ▼ n linked"', () => {
    // a1 → a2 (below the band): the hook leaves a1's right edge and turns down.
    const down = frame([edge('a1', 'a2')]);
    expect(down.paths[0]).toMatchObject({ stub: 'source', cut: 'down', clip: 'board' });
    expect(start(down.paths[0]?.d ?? '')).toEqual([298, 68]);
    expect(end(down.paths[0]?.d ?? '')).toEqual([298 + DEFAULT_GEOMETRY.stubDx, 68 + DEFAULT_GEOMETRY.stubDy]);
    expect(down.badges).toEqual([{ part: 'column', dir: 'down', ids: ['a2'] }]);
    // a3 (above the band) → a1: the hook comes down from above and runs into a1, so the arrowhead lands on it.
    const up = frame([edge('a3', 'a1')]);
    expect(up.paths[0]).toMatchObject({ stub: 'target', cut: 'up', clip: 'board' });
    expect(start(up.paths[0]?.d ?? '')).toEqual([298 + DEFAULT_GEOMETRY.stubDx, 68 - DEFAULT_GEOMETRY.stubDy]);
    expect(end(up.paths[0]?.d ?? '')).toEqual([298, 68]);
    expect(up.badges).toEqual([{ part: 'column', dir: 'up', ids: ['a3'] }]);
  });

  it('on the canvas: stops at the edge it leaves through, arriving square to it, with a badge per edge', () => {
    const out = frame([edge('p1', 'far-right'), edge('above', 'p3')]);
    const [right, top] = out.paths;
    expect(right).toMatchObject({ stub: 'source', cut: 'right', clip: 'canvas' });
    expect(start(right?.d ?? '')).toEqual([680, 118]);
    const r = nums(right?.d ?? '');
    expect(r.at(-2)).toBe(1000); // the canvas's right edge
    expect(r[5]).toBe(r.at(-1)); // the last control point is level with the end: it arrives moving right
    expect(top).toMatchObject({ stub: 'target', cut: 'top', clip: 'canvas' });
    expect(nums(top?.d ?? '')[1]).toBe(0); // starts on the canvas's top edge
    expect(out.badges).toEqual([
      { part: 'canvas', side: 'top', ids: ['above'] },
      { part: 'canvas', side: 'right', ids: ['far-right'] },
    ]);
  });

  it('a card behind the column is counted on the canvas\'s left edge; the badge lists the nearest hidden card first', () => {
    const out = frame([edge('a1', 'behind'), edge('p1', 'far-right'), edge('p3', 'far-right-2')]);
    expect(out.paths[0]).toMatchObject({ stub: 'source', cut: 'left', clip: 'board' });
    expect(end(out.paths[0]?.d ?? '')[0]).toBe(320);
    expect(out.badges).toEqual([
      { part: 'canvas', side: 'left', ids: ['behind'] },
      { part: 'canvas', side: 'right', ids: ['far-right-2', 'far-right'] },
    ]);
  });

  it('the exit point: where the segment leaves the viewport, or the point of the edge nearest a card it never reaches', () => {
    const rect = { x: 0, y: 0, w: 100, h: 50 };
    expect(segmentExit({ x: 50, y: 25 }, { x: 250, y: 25 }, rect)).toEqual({ point: { x: 100, y: 25 }, side: 'right' });
    expect(segmentExit({ x: 50, y: 25 }, { x: 50, y: -75 }, rect)).toEqual({ point: { x: 50, y: 0 }, side: 'top' });
    expect(segmentExit({ x: 90, y: 45 }, { x: 190, y: 145 }, rect).side).toBe('bottom');
    // From outside the viewport (a column card): it crosses, then leaves through the far side.
    const across = segmentExit({ x: -40, y: 25 }, { x: 300, y: 25 }, rect);
    expect(across.side).toBe('right');
    expect(across.point.x).toBeCloseTo(100, 9);
    expect(across.point.y).toBe(25);
    expect(segmentExit({ x: -40, y: 25 }, { x: -200, y: 30 }, rect)).toEqual({ point: { x: 0, y: 30 }, side: 'left' });
  });

  it('culls arrows whose two ends are out of view, counts cards that are not on the board', () => {
    const out = frame([edge('a2', 'far-right'), edge('a1', 'zz')]);
    expect(out.paths).toEqual([]);
    expect(out.culled).toBe(1);
    expect(out.missing).toBe(1);
  });

  it('badge words for every place', () => {
    expect(badgeText({ part: 'column', dir: 'up', ids: ['a'] })).toBe('▲ 1 linked');
    expect(badgeText({ part: 'column', dir: 'down', ids: ['a', 'b'] })).toBe('▼ 2 linked');
    expect(badgeText({ part: 'canvas', side: 'left', ids: ['a', 'b'] })).toBe('◀ 2 linked');
    expect(badgeText({ part: 'canvas', side: 'top', ids: ['a'] })).toBe('▲ 1 linked');
    expect(badgeText({ part: 'canvas', side: 'right', ids: ['a'] })).toBe('▶ 1 linked');
    expect(badgeText({ part: 'canvas', side: 'bottom', ids: ['a'] })).toBe('▼ 1 linked');
    expect(badgeLabel({ part: 'canvas', side: 'right', ids: ['a', 'b'] })).toBe('2 linked cards right of the view; pan to the nearest');
  });
});

describe('marks, focus, selection, budget', () => {
  it('draws a ∅ stub into the left edge of a card in view that follows from nothing (none for a card out of view)', () => {
    const out = frame([], { marks: ['p1', 'far-right'], focus: new Set(['p1']), selectedMarks: new Set(['p1']) });
    expect(out.marks).toEqual([{ id: 'p1', d: 'M392 118L420 118', labelX: 389, labelY: 118, focused: true, selected: true }]);
    // At 25 % the stub is shorter, never under 14 px.
    const zoomed = computeFrame({ column, scrollTop: 0, canvas: canvas({ x: 0, y: 0, s: 0.25 }), cards, edges: [], focus: new Set(), marks: ['p1'] });
    expect(start(zoomed.marks[0]?.d ?? '')[0]).toBe(320 + 25 - 14);
  });

  it('marks focused and selected arrows, and keeps them first when over budget', () => {
    const many = Array.from({ length: 4 }, (_, i) => ({ ...edge('a1', 'p1'), id: `a1->p1#${i}` }));
    const out = computeFrame(
      { column, scrollTop: 0, canvas: canvas(), cards, edges: [...many, edge('p2', 'p3'), edge('p1', 'p2')], focus: new Set(['p3']), selectedEdges: new Set(['p1->p2']) },
      { ...DEFAULT_GEOMETRY, budget: 2 },
    );
    expect(out.paths.map((p) => [p.edge.id, p.focused, p.selected])).toEqual([
      ['p2->p3', true, false],
      ['p1->p2', false, true],
    ]);
    expect(out.overBudget).toBe(4);
  });
});

describe('slice 1d: arrivals spread along a card\'s left edge, and the band (BD-7)', () => {
  // p2 (board x 820..1080, y 100..160) gets three arrows: from a1 (column, y 50..100), p1 (y 100..160) and p3 (y 300..360).
  const into = [edge('a1', 'p2'), edge('p1', 'p2'), edge('p3', 'p2')];

  it('one arrow arrives on the title line; several are spread 12 px apart in the order of their sources, around it', () => {
    const one = frame([edge('p1', 'p2')]);
    expect(end(one.paths[0]?.d ?? '')).toEqual([820, 118]);
    const three = frame(into);
    const ys = Object.fromEntries(three.paths.map((p) => [p.edge.source, end(p.d)[1]]));
    expect(ys).toEqual({ a1: 106, p1: 118, p3: 130 });
    expect(three.paths.every((p) => end(p.d)[0] === 820)).toBe(true);
  });

  it("a band's arrows arrive together, and its bracket crosses them just before the card, with the ✓ seal when complete", () => {
    const band = { target: 'p2', arrows: ['a1->p2', 'p3->p2'], onMark: false, complete: true, title: 'Together these suffice' };
    const out = frame(into, { bands: [band] });
    const ys = Object.fromEntries(out.paths.map((p) => [p.edge.source, end(p.d)[1]]));
    // p1 (not in the band) arrives above the band's two, which stay next to each other.
    expect(ys).toEqual({ p1: 106, a1: 118, p3: 130 });
    expect(out.bands).toEqual([{ target: 'p2', d: 'M814 112L810 112L810 136L814 136', seal: { x: 810, y: 124 }, r: 6.5, complete: true, onMark: false, title: 'Together these suffice' }]);
    const open = frame(into, { bands: [{ ...band, complete: false }] });
    expect(open.bands[0]?.seal).toBeNull();
  });

  it('follows the zoom (the bracket and the seal scale within bounds) and is not drawn for a card out of view', () => {
    // At 200 %, p1 is at board x 520..1040, y 200..320: the seal's radius stops at 9 px, the bracket's inset at 14.
    const zoomed = frame([edge('a1', 'p1')], { canvas: canvas({ x: 0, y: 0, s: 2 }), bands: [{ target: 'p1', arrows: ['a1->p1'], onMark: false, complete: true, title: 't' }] });
    expect(zoomed.bands[0]).toMatchObject({ r: 9, seal: { x: 506, y: 236 } });
    const away = frame([edge('p1', 'far-right')], { bands: [{ target: 'far-right', arrows: ['p1->far-right'], onMark: false, complete: true, title: 't' }] });
    expect(away.bands).toEqual([]);
  });

  it('on a "follows from nothing" mark: the bracket crosses the ∅ stub', () => {
    const out = frame([], { marks: ['p1'], bands: [{ target: 'p1', arrows: [], onMark: true, complete: true, title: 't' }] });
    expect(out.marks[0]?.labelY).toBe(118);
    expect(out.bands[0]).toMatchObject({ onMark: true, seal: { x: 410, y: 118 } });
  });
});

describe("slice 1d fixer: every arrow of a band enters the card's left edge, so the bracket crosses the whole band", () => {
  // t: board x 420..680, y 300..360 (canvas 100, 300). Its band binds a1 (the column, on its left) and one more arrow.
  const T: Rect = { x: 420, y: 300, w: 260, h: 60 };
  const band = (target: string, members: string[], complete = true): BandSpec => ({
    target,
    arrows: members.map((m) => `${m}->${target}`),
    onMark: false,
    complete,
    title: 'Together these suffice',
  });
  const layout = (more: Array<[string, CardGeom]>) => new Map<string, CardGeom>([['a1', inColumn(10)], ['t', onCanvas(100, 300)], ...more]);
  /** Where each arrow ends (its slot on the card's left edge, or another side), by source. */
  const ends = (out: ReturnType<typeof computeFrame>) => Object.fromEntries(out.paths.map((p) => [p.edge.source, end(p.d)]));
  /** How far a path runs inside a rect (0 when it stays out of it, its last 2 px, the arrival, apart). */
  const depthInside = (d: string, r: Rect) =>
    Math.max(0, ...pathPoints(d, 40).map((q) => (q.x > r.x + 2 && q.x < r.x + r.w && q.y > r.y && q.y < r.y + r.h ? Math.min(q.x - r.x, r.x + r.w - q.x, q.y - r.y, r.y + r.h - q.y) : 0)));
  const bracketYs = (d: string) => [nums(d)[1] ?? NaN, nums(d)[5] ?? NaN];

  it('a band arrow from a card on the right goes round the card into its left edge; an arrow outside the band is still entered on the right', () => {
    const cards = layout([
      ['r', onCanvas(400, 300)], // board x 720..980, the same row
      ['r2', onCanvas(400, 450)], // to the right, lower: not in the band
    ]);
    const out = frame([edge('a1', 't', 'verified'), edge('r', 't', 'verified'), edge('r2', 't')], { cards, bands: [band('t', ['a1', 'r'])] });
    const at = ends(out);
    expect(at.a1?.[0]).toBe(420);
    expect(at.r?.[0]).toBe(420);
    expect(at.r2).toEqual([680, 318]);
    const around = out.paths.find((p) => p.edge.source === 'r')?.d ?? '';
    expect(start(around)).toEqual([720, 318]);
    expect(depthInside(around, T)).toBe(0);
    // It arrives moving right (its last control point lies left of its end), like the band's other arrow.
    expect((nums(around).at(-4) ?? 0) < 420).toBe(true);
    const [y1, y2] = bracketYs(out.bands[0]?.d ?? '');
    for (const id of ['a1', 'r']) expect(at[id]?.[1]).toBeGreaterThan(y1 as number);
    for (const id of ['a1', 'r']) expect(at[id]?.[1]).toBeLessThan(y2 as number);
    expect(out.bands[0]).toMatchObject({ complete: true, seal: { x: 410 }, title: 'Together these suffice' });
  });

  it('from a card above the target (they overlap horizontally): a loop on the left, into the left edge', () => {
    // p1 (board 420..680, y 100..160) stands straight above p3 (y 300..360).
    const out = frame([edge('a1', 'p3', 'verified'), edge('p1', 'p3', 'verified')], { bands: [band('p3', ['a1', 'p1'])] });
    const loop = out.paths.find((p) => p.edge.source === 'p1')?.d ?? '';
    expect(start(loop)).toEqual([420, 118]);
    expect(end(loop)[0]).toBe(420);
    expect(nums(loop)[2]).toBeLessThan(420);
    expect(ends(out).a1?.[0]).toBe(420);
    expect(out.bands[0]).toMatchObject({ complete: true, seal: { x: 410 } });
    // Without the band, the same arrow still loops on the right (BD-4's routing is unchanged).
    expect(end(frame([edge('p1', 'p3')]).paths[0]?.d ?? '')[0]).toBe(680);
  });

  it('from an expanded card in the layer before (420 px wide, overlapping the target horizontally): still bound, with its ✓', () => {
    const cards = new Map<string, CardGeom>([
      ['wide', onCanvas(36, 60, 420, 200)], // board x 356..776, y 60..260
      ['t', onCanvas(392, 300)], // board x 712..972
    ]);
    expect(routeSides({ x: 356, y: 60, w: 420, h: 200 }, { x: 712, y: 300, w: 260, h: 60 })).toMatchObject({ t: 'R', loop: true });
    const out = frame([edge('wide', 't', 'verified')], { cards, bands: [band('t', ['wide'])] });
    expect(end(out.paths[0]?.d ?? '')).toEqual([712, 318]);
    expect(out.bands).toHaveLength(1);
    expect(out.bands[0]).toMatchObject({ complete: true, seal: { x: 702, y: 318 } });
  });

  it('from a card out of view on the right: the arrow comes in from the canvas edge, round the card, into its left edge', () => {
    const cards = layout([['far', onCanvas(1500, 300)]]); // board x 1820..: out of view
    const out = frame([edge('a1', 't', 'verified'), edge('far', 't', 'verified')], { cards, bands: [band('t', ['a1', 'far'])] });
    const stub = out.paths.find((p) => p.edge.source === 'far');
    expect(stub).toMatchObject({ stub: 'target', cut: 'right' });
    expect(start(stub?.d ?? '')[0]).toBe(1000);
    expect(end(stub?.d ?? '')[0]).toBe(420);
    expect(depthInside(stub?.d ?? '', T)).toBe(0);
    expect(out.bands[0]).toMatchObject({ complete: true });
  });

  it('bandRoute: left of the target as BD-4; overlapping: a loop on the left; on the right: round it, above unless the source lies below it', () => {
    const t = { x: 400, y: 300, w: 260, h: 60 };
    expect(bandRoute({ x: 0, y: 300, w: 260, h: 60 }, t)).toEqual({ s: 'R', t: 'L', loop: false });
    expect(bandRoute({ x: 400, y: 100, w: 260, h: 60 }, t)).toEqual({ s: 'L', t: 'L', loop: true });
    expect(bandRoute({ x: 800, y: 300, w: 260, h: 60 }, t)).toEqual({ s: 'L', t: 'L', loop: false, around: 'above' });
    expect(bandRoute({ x: 800, y: 500, w: 260, h: 60 }, t)).toEqual({ s: 'L', t: 'L', loop: false, around: 'below' });
  });

  it('a band one of whose arrows is not drawn (its source is not on the board) is drawn open: no ✓ over part of it', () => {
    const out = frame([edge('a1', 'p1', 'verified'), edge('gone', 'p1', 'verified')], { bands: [band('p1', ['a1', 'gone'])] });
    expect(out.missing).toBe(1);
    expect(out.bands[0]).toMatchObject({ complete: false, seal: null, title: `Together these suffice\n${BAND_PARTLY_DRAWN}` });
  });

  it("on a short card crowded with arrows, the bracket stops halfway to the next arrow outside the band", () => {
    // Seven arrows into a 60 px card arrive 8 px apart (less than 12): the bracket pads by 4 px, not 6.
    const cards = new Map<string, CardGeom>([['t', onCanvas(300, 300)], ...Array.from({ length: 7 }, (_, i): [string, CardGeom] => [`s${i}`, onCanvas(0, 40 + i * 70, 200, 40)])]);
    const sources = Array.from({ length: 7 }, (_, i) => `s${i}`);
    const out = frame(
      sources.map((s) => edge(s, 't', 'verified')),
      { cards, bands: [band('t', ['s3', 's4'])] },
    );
    const at = ends(out);
    const ys = sources.map((s) => at[s]?.[1] ?? NaN);
    expect(ys.slice(1).map((y, i) => y - (ys[i] ?? 0))).toEqual([8, 8, 8, 8, 8, 8]);
    const [y1, y2] = bracketYs(out.bands[0]?.d ?? '');
    expect([y1, y2]).toEqual([(at.s3?.[1] ?? 0) - 4, (at.s4?.[1] ?? 0) + 4]);
    expect(y1).toBeGreaterThan(at.s2?.[1] ?? Infinity);
    expect(y2).toBeLessThan(at.s5?.[1] ?? -Infinity);
  });
});

