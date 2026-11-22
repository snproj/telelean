/**
 * Spec v4 AR-1, AR-3, AR-6, AR-7, CM-2, CM-7, ES-9 (slice 1c2): the pure parts of the board's arrow gestures
 * (board/gestures.ts): what a click on an arrow can do (selectable drawn arrows, menu-only undeclared ones, no mention),
 * the geometric hit-testing used over the AXIOMS column, the selection rectangle's members, what a draw by the handle
 * would land on and what it says before you let go, a moved proposition dropped on the AXIOMS column, the Delete key,
 * and what an edit session and the Proposed view allow.
 */
import { EDIT_SESSION_ACTIVE, edgeId, REVIEW_TEXTS, kindChangeImpact, spyroGraph, spyroProvedGraph, type TlEdge, type TlGraph, type TlNode } from '@telelean/core';
import { describe, expect, it } from 'vitest';
import { toDisplayEdges } from '../../src/board/edges';
import { cubicPath, curvePath, loopPath, type Rect } from '../../src/board/geometry';
import {
  areaSelection,
  arrowAt,
  canvasDropOutcome,
  clickOutcome,
  clipRect,
  columnDropBefore,
  columnDropCue,
  cycleThrough,
  deleteOutcome,
  distanceToPolyline,
  DRAW_TEXTS,
  drawHint,
  drawRelease,
  drawTarget,
  gestureGate,
  HIT_TOLERANCE,
  inColumnRegion,
  hitRole,
  hitThing,
  pathPoints,
  rectBetween,
  rubberBandPath,
  SEVERAL_TO_AXIOMS,
  type CardBox,
  type DrawBoard,
  type DrawnPath,
} from '../../src/board/gestures';
import { MENU_PROPOSED_ARROWS, MENU_PROPOSED_READ_ONLY, MENU_PROVISIONAL } from '../../src/board/menu';
import { ARROW_TEXTS } from '../../src/state/store';
import { edgeKindsGraph, makeNode } from '../shared/graphs';

const GOAL = 'cynder-not-good';
const DARK = 'cynder-dark-past';
const PG = 'new-spyro-pg';
const RULE = 'pg-no-dark-past';

const byId = (graph: TlGraph): Record<string, TlNode> => Object.fromEntries(graph.nodes.map((n) => [n.id, n]));
const board = (graph: TlGraph, provisional: Record<string, true> = {}): DrawBoard => ({ nodes: byId(graph), provisional, edges: graph.edges });

describe('what a click on an arrow can do (A, CM-2)', () => {
  it('a drawn arrow (dotted, or solid once a proof uses it) is selectable; a proof\'s use nobody drew has its menu only; a mention offers nothing', () => {
    const shown = toDisplayEdges(edgeKindsGraph().edges, new Set(['d-hyp', GOAL]));
    const role = (id: string) => {
      const edge = shown.find((e) => e.id === id);
      if (!edge) throw new Error(`no edge ${id}`);
      return hitRole(edge);
    };
    // Declared and verified (the proved goal's premises): solid, still the user's arrow.
    expect(role(`${DARK}->${GOAL}`)).toBe('drawn');
    // Declared, unused by the proof (TL109): dotted, the user's arrow.
    expect(role(`${PG}->d-hyp`)).toBe('drawn');
    // Used by the proof, never drawn (TL107): the warning colour, its menu only ("Draw this arrow").
    expect(role(`${DARK}->d-hyp`)).toBe('undeclared');
    // Taken as a hypothesis without a declaration: also a proof's use nobody drew.
    expect(role(`${RULE}->d-hyp`)).toBe('undeclared');
    // A mention (lean-ref) is never selectable (BD-5).
    expect(role(`ref:d-hyp->${GOAL}`)).toBeNull();
    // A declared-only pattern counts as drawn even without the flag.
    expect(hitRole({ pattern: 'declared' })).toBe('drawn');
    expect(hitRole({ pattern: 'verified' })).toBe('undeclared');
  });

  it('a click selects a drawn arrow or a mark (Ctrl adds), nothing for an undeclared arrow; on empty canvas a plain click clears', () => {
    const drawn = { kind: 'arrow' as const, id: `${DARK}->${GOAL}`, source: DARK, target: GOAL, role: 'drawn' as const };
    const undeclared = { ...drawn, role: 'undeclared' as const };
    expect(clickOutcome(drawn, false)).toEqual({ kind: 'select-arrow', source: DARK, target: GOAL, additive: false });
    expect(clickOutcome(drawn, true)).toEqual({ kind: 'select-arrow', source: DARK, target: GOAL, additive: true });
    expect(clickOutcome(undeclared, false)).toEqual({ kind: 'none' });
    expect(clickOutcome({ kind: 'mark', id: GOAL }, true)).toEqual({ kind: 'select-mark', id: GOAL, additive: true });
    expect(clickOutcome(null, false)).toEqual({ kind: 'clear' });
    expect(clickOutcome(null, true)).toEqual({ kind: 'none' });
  });

  it('slice 2h (§5.10, D2-20): Claude\'s arrow not accepted takes the pointer as `proposed` whatever its line; a click focuses its item, never selects it; its menu is its own', () => {
    for (const pattern of ['declared', 'verified', 'reference'] as const) {
      expect(hitRole({ pattern, declared: true, proposed: { change: 'add', status: 'in-review' } }), pattern).toBe('proposed');
      expect(hitRole({ pattern, proposed: { change: 'remove', status: 'in-review' } }), pattern).toBe('proposed');
    }
    expect(hitRole({ pattern: 'declared', declared: true, proposed: { change: 'add', status: 'to-be-redone' } })).toBe('proposed');
    // Accepted, Claude's Add is drawn as any arrow: it can be selected (and so asked about).
    expect(hitRole({ pattern: 'declared', declared: true, proposed: { change: 'add', status: 'accepted' } })).toBe('drawn');
    const claude = { kind: 'arrow' as const, id: `${PG}->${GOAL}`, source: PG, target: GOAL, role: 'proposed' as const, item: 'it5' };
    expect(clickOutcome(claude, false)).toEqual({ kind: 'focus-item', item: 'it5' });
    expect(clickOutcome(claude, true)).toEqual({ kind: 'focus-item', item: 'it5' });
    const { item: _none, ...withoutItem } = claude;
    expect(clickOutcome(withoutItem, false)).toEqual({ kind: 'none' });
    expect(hitThing(claude)).toEqual({ kind: 'proposed', item: 'it5', source: PG, target: GOAL });
  });

  it('the right-click menu\'s thing: a drawn arrow, an undeclared one (its own menu), or a mark (the ∅ stub)', () => {
    expect(hitThing({ kind: 'arrow', id: 'x->y', source: 'x', target: 'y', role: 'drawn' })).toEqual({ kind: 'arrow', source: 'x', target: 'y' });
    expect(hitThing({ kind: 'arrow', id: 'x->y', source: 'x', target: 'y', role: 'undeclared' })).toEqual({ kind: 'undeclared', source: 'x', target: 'y' });
    expect(hitThing({ kind: 'mark', id: 'y' })).toEqual({ kind: 'mark', id: 'y' });
  });
});

describe('geometric hit-testing (the column lies over the overlay)', () => {
  it('reads the overlay\'s paths: M, then C curves sampled along the way, and L segments', () => {
    const curve = pathPoints(curvePath({ x: 0, y: 0 }, { x: 200, y: 100 }), 10);
    expect(curve).toHaveLength(11);
    expect(curve[0]).toEqual({ x: 0, y: 0 });
    expect(curve[10]?.x).toBeCloseTo(200, 6);
    expect(curve[10]?.y).toBeCloseTo(100, 6);
    // A curve with horizontal tangents passes through its midpoint.
    expect(curve[5]?.x).toBeCloseTo(100, 6);
    expect(curve[5]?.y).toBeCloseTo(50, 6);
    expect(pathPoints('M10 20L30 20L30 -5.5')).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 20 },
      { x: 30, y: -5.5 },
    ]);
    expect(pathPoints('')).toEqual([]);
    expect(distanceToPolyline({ x: 20, y: 25 }, pathPoints('M10 20L30 20'))).toBeCloseTo(5, 6);
  });

  it('finds the arrow within the hit width of the pointer (wider than the line), the nearest one first', () => {
    const a = { id: 'a', d: curvePath({ x: 0, y: 0 }, { x: 200, y: 0 }) };
    const b = { id: 'b', d: curvePath({ x: 0, y: 10 }, { x: 200, y: 10 }) };
    expect(arrowAt([a, b], { x: 100, y: 2 })?.id).toBe('a');
    expect(arrowAt([a, b], { x: 100, y: 8 })?.id).toBe('b');
    expect(arrowAt([a, b], { x: 100, y: 5 })?.id).toBe('b'); // a tie: the one painted later
    expect(arrowAt([a, b], { x: 100, y: -HIT_TOLERANCE - 0.5 })).toBeNull();
    expect(arrowAt([a, b], { x: 100, y: -HIT_TOLERANCE })?.id).toBe('a');
    expect(arrowAt([], { x: 0, y: 0 })).toBeNull();
    // A loop (cards above one another) is hit along its bulge, not on the straight line between its ends.
    const loop = { id: 'loop', d: loopPath({ x: 100, y: 0 }, { x: 100, y: 200 }, 'R') };
    expect(arrowAt([loop], { x: 100, y: 100 })).toBeNull();
    const bulge = pathPoints(loop.d)[6];
    expect(bulge && arrowAt([loop], bulge)?.id).toBe('loop');
  });
});

describe('the selection rectangle (D, CM-2): the cards and arrows wholly inside it', () => {
  const card = (id: string, x: number, y: number, part: CardBox['part'] = 'canvas'): CardBox => ({ id, part, rect: { x, y, w: 100, h: 40 } });
  const path = (source: string, target: string, d: string, patch: Partial<DrawnPath> = {}): DrawnPath => ({ id: `${source}->${target}`, source, target, role: 'drawn', d, stub: null, ...patch });
  const inner = { x: 0, y: 0, w: 500, h: 300 };

  it('selects whole canvas cards in reading order, never a column card or one cut by the edge', () => {
    const found = areaSelection(inner, {
      cards: [card('right', 300, 10), card('top-left', 10, 10), card('low', 10, 200), card('cut', 450, 10), card('axiom', 10, 100, 'column')],
      paths: [],
      marks: [],
    });
    expect(found.cards).toEqual(['top-left', 'right', 'low']);
  });

  it('selects drawn arrows shown whole inside it; not a cut one, one reaching out, an undeclared one, or a duplicate', () => {
    const inside = curvePath({ x: 110, y: 20 }, { x: 300, y: 30 });
    const found = areaSelection(inner, {
      cards: [],
      paths: [
        path('a', 'b', inside),
        path('a', 'b', inside),
        path('c', 'd', inside, { role: 'undeclared' }),
        path('e', 'f', inside, { stub: 'source' }),
        path('g', 'h', curvePath({ x: 110, y: 20 }, { x: 600, y: 30 })),
        // A loop whose bulge leaves the rectangle on the right.
        path('i', 'j', loopPath({ x: 490, y: 20 }, { x: 490, y: 250 }, 'R')),
      ],
      marks: [
        { id: 'm-in', d: 'M50 100L78 100' },
        { id: 'm-out', d: 'M-10 100L18 100' },
      ],
    });
    expect(found.arrows).toEqual([{ source: 'a', target: 'b' }]);
    expect(found.marks).toEqual(['m-in']);
  });

  it('a rectangle dragged any way round, and kept to the canvas', () => {
    expect(rectBetween({ x: 50, y: 80 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, w: 40, h: 60 });
    const canvas: Rect = { x: 300, y: 0, w: 400, h: 300 };
    expect(clipRect({ x: 100, y: 50, w: 300, h: 100 }, canvas)).toEqual({ x: 300, y: 50, w: 100, h: 100 });
    expect(clipRect({ x: 0, y: 0, w: 100, h: 100 }, canvas)).toMatchObject({ w: 0 });
  });
});

describe('drawing an arrow by the handle (C, AR-1, AR-3, AR-6)', () => {
  it('a release over another card draws into it (an axiom too: AR-6\'s dialog follows); over nothing or its own card it cancels', () => {
    const b = board(spyroGraph());
    const graph = spyroGraph();
    const withLoose: TlGraph = { ...graph, nodes: [...graph.nodes, makeNode('loose', 'PROPOSITION', 'Spyro is purple', {})] };
    expect(drawTarget(DARK, 'loose', board(withLoose))).toEqual({ kind: 'ok', id: 'loose', axiom: false });
    expect(drawTarget(GOAL, PG, b)).toMatchObject({ kind: 'refused' }); // a cycle, below
    expect(drawTarget(DARK, PG, b)).toEqual({ kind: 'ok', id: PG, axiom: true });
    expect(drawTarget(DARK, null, b)).toEqual({ kind: 'none' });
    expect(drawTarget(DARK, DARK, b)).toEqual({ kind: 'none' });
    expect(drawTarget(DARK, 'nope', b)).toEqual({ kind: 'none' });
  });

  it('refuses, with why, an arrow drawn already, one into or from a card not written yet, and one closing a cycle (named as core names it)', () => {
    const b = board(spyroGraph());
    expect(drawTarget(DARK, GOAL, b)).toEqual({ kind: 'refused', id: GOAL, reason: DRAW_TEXTS.alreadyDrawn });
    expect(DRAW_TEXTS.alreadyDrawn).toBe(ARROW_TEXTS.alreadyDrawn);
    expect(drawTarget(DARK, PG, board(spyroGraph(), { [PG]: true }))).toEqual({ kind: 'refused', id: PG, reason: MENU_PROVISIONAL });
    // GOAL rests on PG, so PG → … → GOAL exists: GOAL → PG would close it.
    expect(drawTarget(GOAL, PG, b)).toEqual({
      kind: 'refused',
      id: PG,
      reason: 'This arrow would make a cycle: Cynder would not be a good addition to … → The new Spyro game is PG → Cynder would not be a good addition to ….',
    });
  });

  it('cycles run over the drawn arrows and the solid arrows of checked proofs, never over an old axiom\'s premises (A19)', () => {
    // spyroProvedGraph: the goal's arrows are also verified edges.
    expect(cycleThrough(GOAL, DARK, board(spyroProvedGraph()))).toEqual([GOAL, DARK, GOAL]);
    // A verified edge alone (no declared premise) closes it too.
    const graph = spyroGraph();
    const nodes = byId(graph);
    const loose = makeNode('loose', 'PROPOSITION', 'Spyro is purple', {});
    const used: TlEdge = { id: edgeId('verified', 'loose', GOAL), type: 'verified', source: 'loose', target: GOAL, origin: 'lean', where: 'proof' };
    expect(cycleThrough(GOAL, 'loose', { nodes: { ...nodes, loose }, edges: [...graph.edges, used] })).toEqual([GOAL, 'loose', GOAL]);
    // An axiom's premises from before v4 are not drawn: no cycle through them (GOAL → legacy is not an arrow).
    const legacy = makeNode('legacy', 'AXIOM', 'Ratings follow content', {}, { premises: [GOAL] });
    expect(cycleThrough('legacy', GOAL, { nodes: { ...nodes, legacy }, edges: graph.edges })).toBeNull();
    expect(cycleThrough(DARK, 'loose', { nodes: { ...nodes, loose }, edges: graph.edges })).toBeNull();
  });

  it('states what a release does before you let go: the impact into an axiom (AR-6), the mark that goes (AR-5), or why not', () => {
    const graph = spyroProvedGraph();
    const nodes = byId(graph);
    const impact = kindChangeImpact(graph, PG, 'PROPOSITION');
    const intoAxiom = drawHint({ kind: 'ok', id: PG, axiom: true }, nodes, impact);
    expect(intoAxiom).toEqual({
      text: 'Arrow into “The new Spyro game is PG”',
      lines: [
        'Becomes a proposition: pending proof until proved',
        'axiom new_spyro_pg.holds stays, marked pending proof, until a run proves it (theorem new_spyro_pg.holds : … := …). 1 card that rests on it will lose its green glow until it is proved.',
      ],
      refused: false,
    });
    expect(drawHint({ kind: 'ok', id: PG, axiom: true }, nodes, null)?.lines).toEqual(['It becomes a proposition.']);
    const marked = { ...nodes, [GOAL]: { ...(nodes[GOAL] as TlNode), premises: [], fromNothing: true } };
    expect(drawHint({ kind: 'ok', id: GOAL, axiom: false }, marked, null)).toEqual({
      text: 'Arrow into “Cynder would not be a good addition to …”',
      lines: ['Its "follows from nothing" mark is removed.'],
      refused: false,
    });
    expect(drawHint({ kind: 'ok', id: GOAL, axiom: false }, nodes, null)?.lines).toEqual([]);
    expect(drawHint({ kind: 'refused', id: GOAL, reason: DRAW_TEXTS.alreadyDrawn }, nodes, null)).toEqual({ text: DRAW_TEXTS.alreadyDrawn, lines: [], refused: true });
    expect(drawHint({ kind: 'none' }, nodes, null)).toBeNull();
  });

  it('the rubber band leaves the source\'s right edge rightwards and ends at the pointer', () => {
    const from = { x: 100, y: 50 };
    const to = { x: 40, y: 220 };
    const d = rubberBandPath(from, to);
    const points = pathPoints(d);
    expect(points[0]).toEqual(from);
    expect(points.at(-1)?.x).toBeCloseTo(to.x, 6);
    expect(points.at(-1)?.y).toBeCloseTo(to.y, 6);
    // The first control point is right of the source, on its line.
    const numbers = d.match(/-?[\d.]+/g)?.map(Number) ?? [];
    expect(numbers[2]).toBeGreaterThan(from.x);
    expect(numbers[3]).toBe(from.y);
    // At the pointer itself: still a path (no division by zero).
    expect(rubberBandPath(from, from)).toBe(cubicPath(from, { x: 1, y: 0 }, from, { x: 1, y: 0 }));
  });
});

describe('a moved proposition dropped on the AXIOMS column (E, AR-7)', () => {
  it('one card runs "Move to axioms" instead of moving; several are refused; anywhere else the cards move', () => {
    expect(canvasDropOutcome([GOAL], true)).toEqual({ kind: 'to-axioms', id: GOAL });
    expect(canvasDropOutcome([GOAL, 'other'], true)).toEqual({ kind: 'refused', reason: SEVERAL_TO_AXIOMS.summary });
    expect(canvasDropOutcome([GOAL], false)).toEqual({ kind: 'move' });
    expect(canvasDropOutcome([GOAL, 'other'], false)).toEqual({ kind: 'move' });
  });
});

describe('the Delete key (B, AR-1)', () => {
  const open = { lock: null, proposed: false };
  it('the selected arrows and marks go first, in one removal; a focused card\'s dialog only when none is selected', () => {
    expect(deleteOutcome({ arrows: 2, marks: 1 }, GOAL, open)).toEqual({ kind: 'remove-selection' });
    expect(deleteOutcome({ arrows: 0, marks: 1 }, null, open)).toEqual({ kind: 'remove-selection' });
    expect(deleteOutcome({ arrows: 0, marks: 0 }, GOAL, open)).toEqual({ kind: 'delete-card', id: GOAL });
    expect(deleteOutcome({ arrows: 0, marks: 0 }, null, open)).toEqual({ kind: 'none' });
  });

  it('during an edit session nothing is sent and the reason is shown; the Proposed view says why for arrows only', () => {
    const locked = { lock: EDIT_SESSION_ACTIVE, proposed: false };
    expect(deleteOutcome({ arrows: 1, marks: 0 }, null, locked)).toEqual({ kind: 'refused', reason: EDIT_SESSION_ACTIVE });
    expect(deleteOutcome({ arrows: 0, marks: 0 }, GOAL, locked)).toEqual({ kind: 'refused', reason: EDIT_SESSION_ACTIVE });
    expect(deleteOutcome({ arrows: 0, marks: 0 }, null, locked)).toEqual({ kind: 'none' });
    const proposed = { lock: EDIT_SESSION_ACTIVE, proposed: true };
    expect(deleteOutcome({ arrows: 1, marks: 1 }, GOAL, proposed)).toEqual({ kind: 'refused', reason: MENU_PROPOSED_ARROWS });
    expect(deleteOutcome({ arrows: 0, marks: 0 }, GOAL, proposed)).toEqual({ kind: 'none' });
  });
});

describe('what an edit session and the Proposed view allow (F, ES-9)', () => {
  it('unlocked: everything; locked: no drawing or moving (with the reason), selecting stays; Proposed: arrows change only through review items', () => {
    expect(gestureGate({ lock: null, proposed: false })).toEqual({ draw: null, move: null, select: true });
    expect(gestureGate({ lock: EDIT_SESSION_ACTIVE, proposed: false })).toEqual({ draw: EDIT_SESSION_ACTIVE, move: EDIT_SESSION_ACTIVE, select: true });
    const proposed = { draw: MENU_PROPOSED_ARROWS, move: MENU_PROPOSED_READ_ONLY, select: false };
    expect(gestureGate({ lock: EDIT_SESSION_ACTIVE, proposed: true })).toEqual(proposed);
    expect(gestureGate({ lock: null, proposed: true })).toEqual(proposed);
    expect(MENU_PROPOSED_ARROWS).toBe('Arrows change only through review items and transforms.');
  });

  it('slice 2h (§5.10, D2-33, D2-62): a session’s Proposed view selects and moves (a session step); drawing stays off; no move while a step runs, confirming or applying', () => {
    const during = (session: { stage: boolean; stepRunning: boolean; applying?: boolean }, lock: string | null = EDIT_SESSION_ACTIVE) => gestureGate({ lock, proposed: true, session });
    expect(during({ stage: true, stepRunning: false })).toEqual({ draw: MENU_PROPOSED_ARROWS, move: null, select: true });
    // The Current board's lock does not reach the session's own view.
    expect(during({ stage: true, stepRunning: false }, null)).toEqual({ draw: MENU_PROPOSED_ARROWS, move: null, select: true });
    expect(during({ stage: false, stepRunning: true })).toEqual({ draw: MENU_PROPOSED_ARROWS, move: REVIEW_TEXTS.stepRunning, select: true });
    // A step running wins over any other phase reason.
    expect(during({ stage: false, stepRunning: true, applying: true }).move).toBe(REVIEW_TEXTS.stepRunning);
    expect(during({ stage: false, stepRunning: false })).toEqual({ draw: MENU_PROPOSED_ARROWS, move: REVIEW_TEXTS.formalizeConfirming, select: true });
    expect(during({ stage: false, stepRunning: false, applying: true }).move).toBe(REVIEW_TEXTS.applyingNow);
    // The Current view during a session: the session's lock, selecting stays.
    expect(gestureGate({ lock: EDIT_SESSION_ACTIVE, proposed: false, session: { stage: true, stepRunning: false } })).toEqual({ draw: EDIT_SESSION_ACTIVE, move: EDIT_SESSION_ACTIVE, select: true });
  });
});

describe('slice 1d: carry-overs from the 1c2 verification', () => {
  it('the release of a draw: one arrow FROM the card the draw started on INTO the card under the pointer, never swapped', () => {
    const board: DrawBoard = { nodes: Object.fromEntries(spyroGraph().nodes.map((n) => [n.id, n])), provisional: {}, edges: spyroGraph().edges };
    const target = drawTarget('cynder-dark-past', 'pg-no-dark-past', board);
    expect(target).toEqual({ kind: 'ok', id: 'pg-no-dark-past', axiom: true });
    expect(drawRelease('cynder-dark-past', target)).toEqual({ kind: 'add', target: 'pg-no-dark-past', sources: ['cynder-dark-past'] });
    expect(drawRelease('cynder-dark-past', { kind: 'refused', id: 'x', reason: 'why' })).toEqual({ kind: 'refused', reason: 'why' });
    expect(drawRelease('cynder-dark-past', { kind: 'none' })).toEqual({ kind: 'cancel' });
  });

  it('a proposition dropped on the AXIOMS column lands before the first axiom whose middle is below the drop point, else last', () => {
    const box = (id: string, y: number, part: 'column' | 'canvas' = 'column'): CardBox => ({ id, part, rect: { x: 14, y, w: 280, h: 50 } });
    const cards = [box('a3', 220), box('a1', 40), box('a2', 130), box('moved', 60, 'canvas'), box('p', 400, 'canvas')];
    expect(columnDropBefore(cards, 30, 'moved')).toBe('a1');
    expect(columnDropBefore(cards, 70, 'moved')).toBe('a2'); // below a1's middle (65)
    expect(columnDropBefore(cards, 200, 'moved')).toBe('a3');
    expect(columnDropBefore(cards, 300, 'moved')).toBeNull();
    expect(columnDropBefore([], 10, 'moved')).toBeNull();
  });

  it('several propositions over the column: the refusal, never the accepting cue; one: active', () => {
    expect(columnDropCue({ moved: { count: 2 }, dragFrom: null, active: false, kind: 'AXIOM' })).toBe('refused');
    expect(columnDropCue({ moved: { count: 1 }, dragFrom: null, active: false, kind: 'AXIOM' })).toBe('active');
    expect(columnDropCue({ moved: null, dragFrom: null, active: false, kind: 'AXIOM' })).toBeUndefined();
    expect(columnDropCue({ moved: null, dragFrom: 'AXIOM', active: false, kind: 'AXIOM' })).toBe('source');
    expect(columnDropCue({ moved: null, dragFrom: 'AXIOM', active: true, kind: 'AXIOM' })).toBe('active');
    expect(columnDropCue({ moved: null, dragFrom: 'PROPOSITION', active: false, kind: 'AXIOM' })).toBe('candidate');
  });

  it("the column's region for arrow hit-testing: the list's visible band, from its left edge to the canvas", () => {
    const column = { left: 14, viewTop: 40, viewBottom: 440 };
    expect(inColumnRegion({ x: 100, y: 100 }, column, 320)).toBe(true);
    expect(inColumnRegion({ x: 310, y: 100 }, column, 320)).toBe(true); // the strip between the list and the canvas
    expect(inColumnRegion({ x: 321, y: 100 }, column, 320)).toBe(false);
    expect(inColumnRegion({ x: 100, y: 30 }, column, 320)).toBe(false);
    expect(inColumnRegion({ x: 100, y: 441 }, column, 320)).toBe(false);
    expect(inColumnRegion({ x: 10, y: 100 }, column, 320)).toBe(false);
  });
});

