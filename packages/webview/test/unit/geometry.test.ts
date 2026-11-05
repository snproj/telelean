import type { NodeType } from '@telelean/core';
import { describe, expect, it } from 'vitest';
import { computeFrame, DEFAULT_GEOMETRY, endpoint, gutterY, ROUTE_CLEARANCE, sidesFor, type CardGeom, type ColumnGeom, type EdgeSpec } from '../../src/board/geometry';

// Three 300 px wide columns, 56 px apart, viewport y in [40, 440].
const col = (i: number): ColumnGeom => ({ originX: 14 + i * 356, originY: 40, viewTop: 40, viewBottom: 440, width: 300 });
const cols: Record<NodeType, ColumnGeom> = { ASSUMPTION: col(0), DERIVATION: col(1), GOAL: col(2) };
const card = (kind: NodeType, top: number, height = 50): CardGeom => ({ kind, top, height, left: 4, width: 290 });
const edge = (source: string, target: string, pattern: EdgeSpec['pattern'] = 'declared'): EdgeSpec => ({ id: `${source}->${target}`, source, target, pattern });
const noScroll = { ASSUMPTION: 0, DERIVATION: 0, GOAL: 0 };
const nums = (d: string) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

describe('endpoint', () => {
  it('anchors on the title line of a visible card, on the requested side', () => {
    const e = endpoint('a', card('ASSUMPTION', 10), cols.ASSUMPTION, 0, 'R');
    expect(e).toEqual({ id: 'a', kind: 'ASSUMPTION', x: 14 + 4 + 290, y: 40 + 10 + 18, vis: 0 });
  });

  it('reports cards scrolled above or below the viewport', () => {
    expect(endpoint('a', card('ASSUMPTION', 10), cols.ASSUMPTION, 100, 'R').vis).toBe(-1);
    expect(endpoint('a', card('ASSUMPTION', 900), cols.ASSUMPTION, 0, 'R').vis).toBe(1);
  });

  it('clamps the anchor into the visible part of a partly scrolled card', () => {
    // Card spans y 40+100-80 = 60 .. 260 in board space when scrolled by 80; its title line is still visible.
    const tall = card('ASSUMPTION', 100, 200);
    expect(endpoint('a', tall, cols.ASSUMPTION, 80, 'R')).toMatchObject({ y: 78, vis: 0 });
    // Scrolled by 200: the top of the card is hidden; the anchor moves to the top of the visible part.
    expect(endpoint('a', tall, cols.ASSUMPTION, 200, 'R')).toMatchObject({ y: 40 + DEFAULT_GEOMETRY.edgeInset, vis: 0 });
  });
});

describe('sidesFor', () => {
  it('leaves rightwards, enters leftwards, and loops through the gutter within a column', () => {
    expect(sidesFor('ASSUMPTION', 'GOAL')).toEqual({ s: 'R', t: 'L', sameColumn: false });
    expect(sidesFor('GOAL', 'DERIVATION')).toEqual({ s: 'L', t: 'R', sameColumn: false });
    expect(sidesFor('DERIVATION', 'DERIVATION')).toEqual({ s: 'R', t: 'R', sameColumn: true });
    expect(sidesFor('GOAL', 'GOAL')).toEqual({ s: 'L', t: 'L', sameColumn: true });
  });
});

describe('computeFrame', () => {
  const cards = new Map<string, CardGeom>([
    ['a1', card('ASSUMPTION', 0)],
    ['a2', card('ASSUMPTION', 600)], // below the fold
    ['d1', card('DERIVATION', 0)],
    ['d2', card('DERIVATION', 100)],
    ['g1', card('GOAL', 0)],
    ['g2', card('GOAL', 700)], // below the fold
  ]);

  it('draws full arrows between visible cards with endpoints on the card edges', () => {
    const out = computeFrame({ cols, cards, scroll: noScroll, edges: [edge('a1', 'd1'), edge('a1', 'g1')], focus: new Set() });
    expect(out.paths).toHaveLength(2);
    const [ad, ag] = out.paths;
    expect(nums(ad?.d ?? '').slice(0, 2)).toEqual([308, 58]); // right edge of a1
    expect(nums(ad?.d ?? '').slice(-2)).toEqual([374, 58]); // left edge of d1
    expect(ad?.layer).toBe('over');
    expect(ag?.layer).toBe('under'); // skips the Derivations column, so it runs under the cards
  });

  it('turns an edge with one end scrolled away into a short stub towards it, and counts it in a badge', () => {
    const out = computeFrame({ cols, cards, scroll: noScroll, edges: [edge('a2', 'd1'), edge('d2', 'g2')], focus: new Set() });
    expect(out.paths.map((p) => p.stub)).toEqual(['target', 'source']);
    const intoD1 = nums(out.paths[0]?.d ?? '');
    expect(intoD1.slice(-2)).toEqual([374, 58]); // ends on d1's left edge (arrowhead on the visible card)
    expect(intoD1.slice(0, 2)).toEqual([374 - 22, 58 + 20]); // tip points down-left, towards a2
    expect(out.badges).toEqual([
      { kind: 'ASSUMPTION', dir: 'down', ids: ['a2'] },
      { kind: 'GOAL', dir: 'down', ids: ['g2'] },
    ]);
  });

  it('culls edges whose ends are both scrolled away', () => {
    const out = computeFrame({ cols, cards, scroll: noScroll, edges: [edge('a2', 'g2')], focus: new Set() });
    expect(out.paths).toEqual([]);
    expect(out.culled).toBe(1);
  });

  it('routes same-column edges through the gutter and highlights focused edges', () => {
    const out = computeFrame({ cols, cards, scroll: noScroll, edges: [edge('d1', 'd2', 'verified')], focus: new Set(['d2']) });
    const [p] = out.paths;
    const n = nums(p?.d ?? '');
    expect(n[0]).toBe(n[6]); // both ends on the same (right) edge
    expect(n[2]).toBeGreaterThan(n[0] ?? 0); // control points in the gutter to the right
    expect(p?.focused).toBe(true);
    expect(p?.edge.pattern).toBe('verified');
  });

  it('keeps focused edges first when over budget', () => {
    const many = Array.from({ length: 5 }, (_, i) => edge('a1', i % 2 ? 'd1' : 'd2'));
    const unique = many.map((e, i) => ({ ...e, id: `${e.id}#${i}` }));
    const out = computeFrame(
      { cols, cards, scroll: noScroll, edges: [...unique, edge('d2', 'g1')], focus: new Set(['g1']) },
      { ...DEFAULT_GEOMETRY, budget: 2 },
    );
    expect(out.paths).toHaveLength(2);
    expect(out.paths[0]?.edge.id).toBe('d2->g1');
    expect(out.overBudget).toBe(4);
  });

  it('reports edges whose cards are not on the board', () => {
    expect(computeFrame({ cols, cards, scroll: noScroll, edges: [edge('a1', 'zz')], focus: new Set() }).missing).toBe(1);
  });

  it('routes a focused arrow that skips the Derivations column through a gap between its cards, never over them', () => {
    // d1 covers y 40..90 and d2 140..190 in board space; the straight line from a3 to g3 would cross d2's text.
    const routed = new Map<string, CardGeom>([...cards, ['a3', card('ASSUMPTION', 100)], ['g3', card('GOAL', 120)]]);
    const unfocused = computeFrame({ cols, cards: routed, scroll: noScroll, edges: [edge('a3', 'g3')], focus: new Set() });
    expect(unfocused.paths[0]).toMatchObject({ layer: 'under' });
    expect(unfocused.paths[0]?.routed).toBeUndefined();

    const out = computeFrame({ cols, cards: routed, scroll: noScroll, edges: [edge('a3', 'g3')], focus: new Set(['g3']) });
    const [p] = out.paths;
    expect(p).toMatchObject({ layer: 'over', routed: true, focused: true, stub: null });
    // M sx sy C … ex y L lx y C … tx ty: the straight part runs across the whole Derivations list at the gap's y.
    const n = nums(p?.d ?? '');
    const [ex, y, lx, ly] = [n[6], n[7], n[8], n[9]];
    expect([ex, lx]).toEqual([cols.DERIVATION.originX, cols.DERIVATION.originX + cols.DERIVATION.width]);
    expect(ly).toBe(y);
    for (const id of ['d1', 'd2']) {
      const c = routed.get(id) as CardGeom;
      const top = cols.DERIVATION.originY + c.top - ROUTE_CLEARANCE;
      const bottom = cols.DERIVATION.originY + c.top + c.height + ROUTE_CLEARANCE;
      expect(y !== undefined && (y <= top || y >= bottom)).toBe(true);
    }
    expect(nums(p?.d ?? '').slice(-2)).toEqual([cols.GOAL.originX + 4, 40 + 120 + 18]); // still ends on g3's left edge
  });

  it('finds the gap nearest to where the line wants to cross, inside the visible band', () => {
    const mid = cols.DERIVATION; // visible y 40..440
    const blocks = [{ top: 0, height: 50 }, { top: 62, height: 50 }]; // board y 40..90 and 102..152
    // The 12 px gap between them, minus the clearance, is y 93..99; a line keeps 2 px inside it (95..97).
    expect(gutterY(mid, blocks, 0, 96)).toBe(96);
    expect(gutterY(mid, blocks, 0, 92)).toBe(95);
    expect(gutterY(mid, blocks, 0, 300)).toBe(300); // below both cards
    expect(gutterY(mid, blocks, 0, 20)).toBe(95); // above the band: the nearest gap inside it
    expect(gutterY(mid, [{ top: -10, height: 500 }], 0, 200)).toBeNull(); // one block fills the whole band
    expect(gutterY(mid, blocks, 30, 70)).toBe(67); // scrolled by 30: the gap moved up to 63..69 (65..67)
  });
});
