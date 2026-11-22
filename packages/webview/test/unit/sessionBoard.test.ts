/**
 * Slice 2h (docs/slice2-plan.md 5.10-5.12, 6.1): the Proposed view of an edit session, pure (model/sessionBoard.ts and
 * the arrows it gives board/edges.ts).
 *  - `sessionOverlay` is built from the SessionView only: the twin pair (the two outcomes of a hidden stage) gives the
 *    same overlay, whatever the Current board says about a proof; while the results are hidden no Claude arrow, no
 *    "Claude suggests" card and no Result mark is drawn, and every target has the neutral chip;
 *  - Claude's arrows' looks (BD-5, D2-34): an Add in review translucent with "+" (thin unused, solid used, never round
 *    dots), an accepted Add dotted with "+", a Remove in review the base arrow translucent and dotted with "−", an
 *    accepted Remove and a declined Add not drawn; a click focuses the item, and none but an accepted Add is selectable;
 *  - the card marks' words; the Context Menu's review items; Undo's routing and the toolbar's session Undo and Redo;
 *  - edge cases: an empty board, one item, many, the boundaries of each rule.
 */
import { REVIEW_TEXTS, spyroGraph, spyroProvedGraph, type ItemKind, type ItemStatus, type SessionView, type TlGraph } from '@telelean/core';
import { describe, expect, it } from 'vitest';
import { arrowLook, edgeClass, proposedBadges, toDisplayEdges } from '../../src/board/edges';
import { pathMidpoint } from '../../src/board/gestures';
import {
  contextItems,
  focusesItem,
  formalizeSessionOf,
  markGlyph,
  markText,
  premiseAnchor,
  PROPOSED_ARROW_TITLES,
  proposedLook,
  proposedOpen,
  RESULT_CHIP_KEYS,
  RESULT_HIDDEN_CHIP,
  sessionOverlay,
  sessionUndoButtons,
  undoScope,
  type ProposedArrow,
} from '../../src/model/sessionBoard';
import { hiddenPair, hiddenStage, IDS, sessionView, shownStage, SOURCES, stepSession, TARGET } from '../shared/sessions';

const current = (graph: TlGraph = spyroGraph()) => ({ nodes: Object.fromEntries(graph.nodes.map((n) => [n.id, n])), vocabulary: graph.vocabulary, ...(graph.positions ? { positions: graph.positions } : {}) });
const PG = 'new-spyro-pg';
const DARK = 'cynder-dark-past';
const RULE = 'pg-no-dark-past';

/** A shown stage whose only Claude arrow is `arrow` (the working copy's edges as the host builds them). */
function withArrow(arrow: Omit<ProposedArrow, 'item'>, graph: TlGraph = spyroGraph(11)): SessionView {
  const base = shownStage();
  return { ...base, board: { ...base.board, graph, arrows: [{ item: IDS.arrow, ...arrow }] } };
}

describe('sessionOverlay (§5.10): the Proposed view from SessionView.board only', () => {
  it('the cards and arrows are the session board’s, never the Current board’s: a proof on the Current board does not leak in', () => {
    const view = hiddenStage();
    const unproved = sessionOverlay(view, current(spyroGraph()));
    const proved = sessionOverlay(view, current(spyroProvedGraph()));
    expect(unproved.nodes[TARGET]).toBe(view.board.graph.nodes.find((n) => n.id === TARGET));
    // What a proof could change (the cards, their statuses, the arrows, the chips, the marks) is the same either way.
    const proofPart = (o: ReturnType<typeof sessionOverlay>) => ({ nodes: o.nodes, edges: o.edges, hidden: [...o.hidden], marks: o.marks, proposed: [...o.proposed], premises: o.premises, order: o.order });
    expect(proofPart(proved)).toEqual(proofPart(unproved));
    expect(unproved).toMatchObject({ runId: view.runId, subject: 'Spyro' });
    // No GraphDiff in session mode: only the vocabulary names it adds against the Current board.
    expect(Object.keys(unproved)).not.toContain('proposalId');
    expect(unproved.diff).toEqual({ vocabulary: {} });
  });

  it('the twin pair (the hidden stage’s two outcomes) gives equal overlays (D2-5, 2c2)', () => {
    const { proved, notProved } = hiddenPair();
    expect(sessionOverlay(proved.session, current())).toEqual(sessionOverlay(notProved.session, current()));
  });

  it('while the results are hidden: no Claude arrow, no "Claude suggests" card, no Result mark; every target has the chip (whatever a view carries)', () => {
    const view = hiddenStage();
    const overlay = sessionOverlay(view, current());
    expect([...overlay.hidden]).toEqual([TARGET]);
    expect(overlay.proposed.size).toBe(0);
    expect(overlay.premises).toEqual([]);
    // A malformed hidden view (arrows, a premise, a Result mark, no hidden target): the overlay still holds to §4.7.
    const shown = shownStage();
    const leaky: SessionView = {
      ...view,
      board: {
        ...view.board,
        hiddenTargets: [],
        arrows: shown.board.arrows,
        premises: shown.board.premises,
        marks: { [TARGET]: [{ item: IDS.result, kind: 'result', status: 'in-review' }], [RULE]: [{ item: IDS.formalize, kind: 'formalize', status: 'in-review' }] },
      },
    };
    const held = sessionOverlay(leaky, current());
    expect([...held.hidden]).toEqual([TARGET]);
    expect(held.proposed.size).toBe(0);
    expect(held.premises).toEqual([]);
    expect(held.marks).toEqual({ [RULE]: [{ item: IDS.formalize, kind: 'formalize', status: 'in-review' }] });
    expect(held.edges).toBe(leaky.board.graph.edges);
  });

  it('once shown: Claude’s arrow and its premise suggestion; no chip; the marks as the host lists them', () => {
    const view = shownStage({}, { board: { ...shownStage().board, marks: { [RULE]: [{ item: IDS.formalize, kind: 'formalize', status: 'accepted' }] } } });
    const overlay = sessionOverlay(view, current());
    expect([...overlay.hidden]).toEqual([]);
    expect([...overlay.proposed.keys()]).toEqual([`${PG}->${TARGET}`]);
    expect(overlay.premises).toEqual([{ item: IDS.premise, target: TARGET, sentence: 'Cynder is evil', status: 'in-review' }]);
    expect(overlay.marks).toEqual({ [RULE]: [{ item: IDS.formalize, kind: 'formalize', status: 'accepted' }] });
  });

  it('an Add in review stays drawn; declined or withdrawn, it is not drawn even while the working copy still has it', () => {
    for (const status of ['in-review', 'to-be-redone', 'accepted'] as ItemStatus[]) {
      const o = sessionOverlay(withArrow({ change: 'add', status, used: true, source: PG, target: TARGET }), current());
      expect(o.edges.some((e) => e.type === 'premise' && e.source === PG && e.target === TARGET), status).toBe(true);
      expect(o.proposed.has(`${PG}->${TARGET}`), status).toBe(true);
    }
    for (const status of ['declined', 'withdrawn'] as ItemStatus[]) {
      const o = sessionOverlay(withArrow({ change: 'add', status, used: false, source: PG, target: TARGET }), current());
      expect(o.edges.some((e) => e.type === 'premise' && e.source === PG && e.target === TARGET), status).toBe(false);
      expect(o.proposed.size, status).toBe(0);
    }
  });

  it('a Remove in review draws the base arrow (added back when the working copy dropped it); accepted, not drawn; declined, the person’s again', () => {
    const graph = spyroGraph(11);
    const without: TlGraph = { ...graph, edges: graph.edges.filter((e) => !(e.source === DARK && e.target === TARGET)) };
    const inReview = sessionOverlay(withArrow({ change: 'remove', status: 'in-review', used: false, source: DARK, target: TARGET }, without), current());
    expect(inReview.edges.filter((e) => e.source === DARK && e.target === TARGET).map((e) => e.id)).toEqual([`proposed:${DARK}->${TARGET}`]);
    expect(inReview.proposed.get(`${DARK}->${TARGET}`)).toMatchObject({ change: 'remove', status: 'in-review' });
    const kept = sessionOverlay(withArrow({ change: 'remove', status: 'in-review', used: false, source: DARK, target: TARGET }), current());
    expect(kept.edges.filter((e) => e.source === DARK && e.target === TARGET)).toHaveLength(1); // the working copy's own, once
    const accepted = sessionOverlay(withArrow({ change: 'remove', status: 'accepted', used: false, source: DARK, target: TARGET }), current());
    expect(accepted.edges.some((e) => e.type === 'premise' && e.source === DARK && e.target === TARGET)).toBe(false);
    expect(accepted.proposed.size).toBe(0);
    const declined = sessionOverlay(withArrow({ change: 'remove', status: 'declined', used: false, source: DARK, target: TARGET }), current());
    expect(declined.edges.some((e) => e.type === 'premise' && e.source === DARK && e.target === TARGET)).toBe(true);
    expect(declined.proposed.size).toBe(0);
  });

  it('edge cases: an empty session board; a removed card (kept on the board, at its Current place); locations only for cards in the user’s files; new vocabulary', () => {
    const empty = sessionView({ items: [], board: { graph: { ...spyroGraph(11), nodes: [], edges: [], vocabulary: [] }, hiddenTargets: [], marks: {}, arrows: [], premises: [], removedNodes: [] }, inferences: [] });
    const o = sessionOverlay(empty, { nodes: {}, vocabulary: [] });
    expect(o).toMatchObject({ nodes: {}, edges: [], vocabulary: [], premises: [], marks: {}, locations: {}, positions: {} });
    expect(o.proposed.size).toBe(0);
    expect(o.hidden.size).toBe(0);
    // A card the session removes: still on the Proposed board (its mark says "−"), where the Current board has it.
    const base = shownStage();
    const gone = base.board.graph.nodes.find((n) => n.id === RULE);
    if (gone === undefined) throw new Error('fixture');
    const graph = { ...base.board.graph, nodes: base.board.graph.nodes.filter((n) => n.id !== RULE), edges: base.board.graph.edges.filter((e) => e.source !== RULE && e.target !== RULE) };
    const removed = sessionOverlay({ ...base, board: { ...base.board, graph, removedNodes: [gone] } }, { ...current(), positions: { [RULE]: { x: 9, y: 8 } } });
    expect(removed.nodes[RULE]).toBe(gone);
    expect(removed.positions[RULE]).toEqual({ x: 9, y: 8 });
    // Only a card of the user's files has a place to open (the Current graph's): a card only the session has, none.
    const fresh = { ...(base.board.graph.nodes.find((n) => n.id === TARGET) as NonNullable<(typeof base.board.graph.nodes)[number]>), id: 'only-in-session' };
    const withNew = { ...base, board: { ...base.board, graph: { ...base.board.graph, nodes: [...base.board.graph.nodes, fresh] } } };
    const now = current();
    const locations = sessionOverlay(withNew, now).locations;
    expect(locations['only-in-session']).toBeUndefined();
    expect(locations[TARGET]).toEqual(now.nodes[TARGET]?.loc);
    expect(Object.keys(locations).sort()).toEqual(Object.keys(now.nodes).filter((id) => now.nodes[id]?.loc !== undefined).sort());
    // A vocabulary name the session adds is "added" against the Current board.
    const vocab = { ...base, board: { ...base.board, graph: { ...base.board.graph, vocabulary: [...base.board.graph.vocabulary, { name: 'Spyro.IsEvil', shortName: 'IsEvil', subject: 'Spyro', kind: 'predicate' as const, type: 'Character → Prop', gloss: 'is evil', glossBy: 'agent' as const, usedBy: [], flags: [] }] } } };
    expect(sessionOverlay(vocab, current()).diff.vocabulary).toEqual({ 'Spyro.IsEvil': 'added' });
  });
});

describe('Claude’s arrows: looks, badges, tooltips (BD-5, S15, D2-34)', () => {
  it('an Add in review: translucent with "+", thin while unused, solid once the proof uses it, never round dots; accepted: dotted with "+"', () => {
    expect(proposedLook({ change: 'add', status: 'in-review', used: false })).toEqual({ line: 'thin', translucent: true, badge: '+', title: PROPOSED_ARROW_TITLES.addInReview });
    expect(proposedLook({ change: 'add', status: 'in-review', used: true })).toEqual({ line: 'solid', translucent: true, badge: '+', title: PROPOSED_ARROW_TITLES.addInReview });
    expect(proposedLook({ change: 'add', status: 'to-be-redone', used: true }).translucent).toBe(true);
    expect(proposedLook({ change: 'add', status: 'accepted', used: true })).toEqual({ line: 'dotted', translucent: false, badge: '+', title: REVIEW_TEXTS.arrowAccepted });
    expect(REVIEW_TEXTS.arrowAccepted).toBe("Claude's arrow, accepted: written to your files at Apply");
    // A Remove in review: the base arrow, translucent and dotted, with "−".
    expect(proposedLook({ change: 'remove', status: 'in-review', used: false })).toEqual({ line: 'dotted', translucent: true, badge: '−', title: PROPOSED_ARROW_TITLES.removeInReview });
    // An undecided Add is never the person's round dots.
    for (const used of [false, true]) expect(proposedLook({ change: 'add', status: 'in-review', used }).line).not.toBe('dotted');
  });

  it('toDisplayEdges gives Claude’s arrow its own look, tooltip and badge whatever the proof edges say; the class says proposed and translucent', () => {
    const proved = spyroProvedGraph(11);
    const overlay = sessionOverlay(withArrow({ change: 'add', status: 'in-review', used: true, source: PG, target: TARGET }, proved), current());
    const edges = toDisplayEdges(overlay.edges, new Set(), { nodes: overlay.nodes, hidden: overlay.hidden, proposed: overlay.proposed });
    const claude = edges.find((e) => e.id === `${PG}->${TARGET}`);
    expect(claude).toMatchObject({ pattern: 'verified', proposed: { item: IDS.arrow, change: 'add', status: 'in-review', used: true }, title: PROPOSED_ARROW_TITLES.addInReview });
    expect(claude?.conditional).toBeUndefined();
    expect(arrowLook(claude as NonNullable<typeof claude>)).toEqual({ line: 'solid', head: 'filled', warning: false, translucent: true, badge: '+' });
    const still = { stub: false, focused: false, selected: false, hovered: false };
    expect(edgeClass(claude as NonNullable<typeof claude>, still)).toBe('tl-edge tl-edge--verified tl-edge--proposed tl-edge--translucent');
    // The person's arrows into the same card keep their own looks (no badge, not translucent).
    const mine = edges.find((e) => e.id === `${DARK}->${TARGET}`);
    expect(mine?.proposed).toBeUndefined();
    expect(arrowLook(mine as NonNullable<typeof mine>)).toMatchObject({ translucent: false, badge: null });
    // One badge per Claude arrow drawn, with the arrow's tooltip; none for the person's.
    expect(proposedBadges(edges)).toEqual([{ edge: `${PG}->${TARGET}`, text: '+', title: PROPOSED_ARROW_TITLES.addInReview }]);
    // An unused Add is thin (the reference line), an accepted one dotted (the declared line) with its badge.
    const unused = toDisplayEdges(sessionOverlay(withArrow({ change: 'add', status: 'in-review', used: false, source: PG, target: TARGET }), current()).edges, new Set(), {
      nodes: {},
      proposed: new Map([[`${PG}->${TARGET}`, { item: IDS.arrow, change: 'add', status: 'in-review', used: false, source: PG, target: TARGET }]]),
    });
    expect(unused.find((e) => e.id === `${PG}->${TARGET}`)?.pattern).toBe('reference');
    const acceptedEdges = toDisplayEdges(spyroGraph(11).edges, new Set(), { nodes: {}, proposed: new Map([[`${PG}->${TARGET}`, { item: IDS.arrow, change: 'add', status: 'accepted', used: true, source: PG, target: TARGET }]]) });
    const accepted = acceptedEdges.find((e) => e.id === `${PG}->${TARGET}`);
    expect(accepted).toMatchObject({ pattern: 'declared', title: REVIEW_TEXTS.arrowAccepted });
    expect(edgeClass(accepted as NonNullable<typeof accepted>, still)).toBe('tl-edge tl-edge--declared tl-edge--proposed');
    expect(proposedBadges(acceptedEdges)).toEqual([{ edge: `${PG}->${TARGET}`, text: '+', title: REVIEW_TEXTS.arrowAccepted }]);
    // No Claude arrow: no badge (empty edges, too).
    expect(proposedBadges(toDisplayEdges(spyroGraph().edges))).toEqual([]);
    expect(proposedBadges([])).toEqual([]);
  });

  it('a click on Claude’s arrow focuses its item; only an accepted Add is an arrow like the person’s (selectable, D2-20)', () => {
    expect(focusesItem(undefined)).toBe(false);
    expect(focusesItem({ change: 'add', status: 'in-review' })).toBe(true);
    expect(focusesItem({ change: 'add', status: 'to-be-redone' })).toBe(true);
    expect(focusesItem({ change: 'add', status: 'accepted' })).toBe(false);
    expect(focusesItem({ change: 'remove', status: 'in-review' })).toBe(true);
    expect(proposedOpen('in-review')).toBe(true);
    expect(proposedOpen('to-be-redone')).toBe(true);
    for (const status of ['accepted', 'declined', 'withdrawn'] as ItemStatus[]) expect(proposedOpen(status)).toBe(false);
  });

  it('the badge sits at the middle of the arrow’s path (pathMidpoint): a line, a bent path, a single point, nothing', () => {
    expect(pathMidpoint('M0,0 L10,0')).toEqual({ x: 5, y: 0 });
    expect(pathMidpoint('M0,0 L10,0 L10,10')).toEqual({ x: 10, y: 0 });
    expect(pathMidpoint('M3,4')).toEqual({ x: 3, y: 4 });
    expect(pathMidpoint('')).toBeNull();
  });

  it('the "Claude suggests" card is an arrow end of its own (data-edge-anchor)', () => {
    expect(premiseAnchor(IDS.premise)).toBe(`premise:${IDS.premise}`);
    expect(premiseAnchor('')).toBe('premise:');
  });
});

describe('card marks (§5.10: ItemMark replaces DiffBadge) and the hidden chip', () => {
  it('glyph, word and status, never colour alone', () => {
    expect(markText({ kind: 'add', status: 'in-review' })).toBe(REVIEW_TEXTS.markNewInReview);
    expect(markText({ kind: 'formalize', status: 'accepted' })).toBe('~ Formalize · accepted ✓');
    expect(markText({ kind: 'delete', status: 'declined' })).toMatch(/^− .* · declined ✗$/);
    expect(markText({ kind: 'add-premise', status: 'to-be-redone' })).toMatch(/^\+ .* · to be redone ↻$/);
    expect(markText({ kind: 'add', status: 'accepted' })).toBe('+ new · accepted ✓');
    const glyphs: Array<[ItemKind, string]> = [
      ['add', '+'],
      ['add-premise', '+'],
      ['add-arrow', '+'],
      ['delete', '−'],
      ['remove-arrow', '−'],
      ['formalize', '~'],
      ['result', '~'],
      ['vocabulary-term', '~'],
    ];
    for (const [kind, glyph] of glyphs) expect(markGlyph(kind), kind).toBe(glyph);
  });

  it('the hidden chip says nothing about a result, and stands for every chip that would', () => {
    expect(RESULT_HIDDEN_CHIP.label).toBe(REVIEW_TEXTS.resultAfterReview);
    expect(RESULT_HIDDEN_CHIP.title).not.toMatch(/proved|established/i);
    for (const key of ['proof', 'established', 'conditional', 'pending', 'self-evident', 'uses-sorry']) expect(RESULT_CHIP_KEYS.has(key), key).toBe(true);
    expect(RESULT_CHIP_KEYS.has(RESULT_HIDDEN_CHIP.key)).toBe(false);
  });
});

describe('the Context Menu’s review items (CM-2, RV-8)', () => {
  const marks = { [RULE]: [{ item: IDS.formalize, kind: 'formalize' as const, status: 'in-review' as const }], [TARGET]: [{ item: IDS.arrow, kind: 'add-arrow' as const, status: 'in-review' as const }] };
  const view = shownStage({}, { board: { ...shownStage().board, marks } });
  it('the items selected in the list or on the board, and the selected cards’ marks: each once, in the list’s order', () => {
    expect(contextItems(view, [], [])).toEqual([]);
    expect(contextItems(view, [IDS.vocab], [])).toEqual([IDS.vocab]);
    expect(contextItems(view, [], [RULE])).toEqual([IDS.formalize]);
    expect(contextItems(view, [IDS.arrow, IDS.vocab], [TARGET, RULE])).toEqual(view.items.filter((i) => [IDS.vocab, IDS.formalize, IDS.arrow].includes(i.id as never)).map((i) => i.id));
    // A card without marks adds nothing; an id the view does not list is never named.
    expect(contextItems(view, ['gone'], [DARK])).toEqual([]);
  });

  it('a hidden Result is never one of them (its card has no mark for it; the list never selects it)', () => {
    const hidden = hiddenStage();
    expect(contextItems(hidden, [IDS.result], [TARGET])).toEqual([]);
  });
});

describe('Undo routing (§5.12, UN-1, D2-38) and the toolbar’s session Undo and Redo', () => {
  it('the session stack when a session exists and the Proposed view is on screen or the focus is in the session’s scope; else the board', () => {
    const cases: Array<[boolean, boolean, boolean, 'session' | 'board']> = [
      [false, false, false, 'board'],
      [false, true, false, 'board'],
      [false, false, true, 'board'],
      [false, true, true, 'board'],
      [true, false, false, 'board'],
      [true, true, false, 'session'],
      [true, false, true, 'session'],
      [true, true, true, 'session'],
    ];
    for (const [session, proposedOnScreen, focusInSession, scope] of cases) expect(undoScope({ session, proposedOnScreen, focusInSession }), `${session} ${proposedOnScreen} ${focusInSession}`).toBe(scope);
  });

  it('the host’s step labels; nothing to undo; sealed (UN-5); D2-62 while a step runs; busy; confirming and applying', () => {
    const shown = shownStage();
    expect(sessionUndoButtons(shown, false)).toEqual({ undo: { disabled: false, title: 'Undo: Show results (Ctrl+Z)' }, redo: { disabled: true, title: 'Nothing to redo' } });
    expect(sessionUndoButtons({ ...shown, redo: { step: 5, label: 'Accept: Vocabulary term Spyro.InGame' } }, false).redo).toEqual({ disabled: false, title: 'Redo: Accept: Vocabulary term Spyro.InGame (Ctrl+Shift+Z)' });
    expect(sessionUndoButtons(shown, true).undo).toEqual({ disabled: true, title: 'Undo: Show results (Ctrl+Z)' });
    expect(sessionUndoButtons({ ...shown, undo: null }, false).undo).toEqual({ disabled: true, title: 'Nothing to undo' });
    expect(sessionUndoButtons({ ...shown, undo: null, sealed: { by: 'submit', at: '2026-11-21T10:00:00.000Z' } }, false).undo).toEqual({ disabled: true, title: REVIEW_TEXTS.sealed });
    const step = sessionUndoButtons(stepSession(), false);
    expect(step).toEqual({ undo: { disabled: true, title: REVIEW_TEXTS.stepRunning }, redo: { disabled: true, title: REVIEW_TEXTS.stepRunning } });
    expect(sessionUndoButtons({ ...shown, phase: 'interrupted' }, false).undo.title).toBe(REVIEW_TEXTS.stepRunning);
    expect(sessionUndoButtons({ ...shown, phase: 'applying' }, false).undo).toEqual({ disabled: true, title: REVIEW_TEXTS.applyingNow });
    expect(sessionUndoButtons({ ...shown, phase: 'confirming' }, false).undo).toEqual({ disabled: true, title: REVIEW_TEXTS.formalizeConfirming });
  });
});

describe('formalizeSessionOf (§4.12): what core’s start check reads of the session', () => {
  it('the shown stage: its targets, results, Claude’s arrows not declined, no shaky target', () => {
    expect(formalizeSessionOf(shownStage())).toEqual({
      subject: 'Spyro',
      resultsShown: true,
      targets: [TARGET],
      arrows: [{ item: IDS.arrow, source: PG, target: TARGET, status: 'in-review' }],
      shakyTargets: [],
      results: { [TARGET]: 'in-review' },
      shakyResults: [],
    });
  });

  it('a declined arrow is no arrow; a Shaky Result and a Shaky item make shaky targets; a hidden Result gives no result', () => {
    const declined = formalizeSessionOf(shownStage({ arrow: 'declined' }));
    expect(declined.arrows).toEqual([]);
    const base = shownStage();
    const shaky = {
      ...base,
      items: base.items.map((i) => (i.id === IDS.result || i.id === IDS.formalize ? { ...i, status: 'declined' as const, declined: { option: 'shaky' as const, at: '2026-11-21T10:00:00.000Z' } } : i)),
    };
    const s = formalizeSessionOf(shaky);
    expect(s.results).toEqual({ [TARGET]: 'declined' });
    expect(s.shakyResults).toEqual([TARGET]);
    expect(s.shakyTargets).toEqual([TARGET]);
    const hidden = formalizeSessionOf(hiddenStage());
    expect(hidden).toMatchObject({ resultsShown: false, results: {}, shakyResults: [], targets: [TARGET] });
    // Many inferences, one without a Result item yet.
    const many = formalizeSessionOf({ ...base, inferences: [...base.inferences, { target: { id: RULE, type: 'PROPOSITION', sentence: 'x', wordedBy: 'user' }, question: SOURCES.map((id) => ({ id, type: 'AXIOM' as const, sentence: id, wordedBy: 'user' as const })), fromNothing: false, order: 1 }] });
    expect(many.targets).toEqual([TARGET, RULE]);
    expect(many.results).toEqual({ [TARGET]: 'in-review' });
  });
});
