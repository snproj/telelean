/**
 * Spec v4.1 CM-1–CM-5, ES-2 (one target, AP-9), AP-13 (slice 1e): the Context Menu section's model (pure): what
 * Formalize for dependencies asks and why it is disabled (CM-3), the selection's summary (CM-5), the other actions for
 * the selection (the right-click menu's card actions, Delete), the narrow window's "…" overflow, and the right-click
 * menu's Formalize entry, which shares the same state. Slice 2h (§5.11, RV-9): several targets at once, sources first.
 */
import { EDIT_SESSION_ACTIVE, REVIEW_TEXTS, type TlEdge, type TlNode } from '@telelean/core';
import { describe, expect, it } from 'vitest';
import {
  contextActions,
  fittingActions,
  FORMALIZE_LABEL,
  FORMALIZE_TEXTS,
  formalizeRunBlock,
  formalizeState,
  reviewItemsModel,
  selectionCards,
  selectionSummary,
  summaryTitle,
  type FormalizeContext,
} from '../../src/board/contextActions';
import { MENU_PROPOSED_ARROWS, MENU_PROVISIONAL, menuEntries, type MenuContext } from '../../src/board/menu';
import { makeNode } from '../shared/graphs';
import { runView } from '../shared/runs';
import { hiddenStage, IDS, shownStage, stepSession } from '../shared/sessions';

const A = makeNode('a', 'AXIOM', 'Cynder has a dark past', { proof: { kind: 'assumed' } });
const B = makeNode('b', 'AXIOM', 'The new game is PG', { proof: { kind: 'assumed' } });
/** The target: arrows from a and b are drawn. */
const T = makeNode('t', 'PROPOSITION', 'Cynder would not be a good addition to the new Spyro game', {}, { premises: ['a', 'b'] });
/** Another proposition, drawn from a. */
const U = makeNode('u', 'PROPOSITION', 'Spyro games avoid dark characters', {}, { premises: ['a'] });
/** Marked "follows from nothing". */
const M = makeNode('m', 'PROPOSITION', 'Spyro is purple', {}, { fromNothing: true });
const nodes: Record<string, TlNode> = { a: A, b: B, t: T, u: U, m: M };

function ctx(patch: Partial<FormalizeContext> = {}): FormalizeContext {
  return { nodes, edges: [], selectedArrows: [], selectedMarks: [], provisional: {}, runBlock: null, ...patch };
}

describe('Formalize for dependencies: the question and why it cannot be pressed (CM-3)', () => {
  it('the selected arrows into one proposition: their sources, in selection order', () => {
    const state = formalizeState(ctx({ selectedArrows: [{ source: 'b', target: 't' }, { source: 'a', target: 't' }] }));
    expect(state).toMatchObject({ disabled: null, inferences: [{ target: 't', premises: ['b', 'a'] }], mode: 'start' });
    expect(state.title).toBe('Ask Claude to formalise the 2 selected arrows and prove “Cynder would not be a good addition to …” from exactly their sources');
  });

  it('a "follows from nothing" mark alone: no premises', () => {
    const state = formalizeState(ctx({ selectedMarks: ['m'] }));
    expect(state).toMatchObject({ disabled: null, inferences: [{ target: 'm', premises: [] }], mode: 'start' });
    expect(state.title).toBe('Ask Claude to prove “Spyro is purple” from no premises at all (you marked it "follows from nothing")');
  });

  it('nothing to ask: cards only, or nothing (the brief\'s reason)', () => {
    expect(formalizeState(ctx()).disabled).toBe("Select arrows, or a 'follows from nothing' mark.");
    expect(FORMALIZE_TEXTS.none).toBe("Select arrows, or a 'follows from nothing' mark.");
  });

  it('slice 2h (§5.11, RV-9): several targets at once, one inference each: arrows into two cards, or an arrow and another card\'s mark', () => {
    const two = formalizeState(ctx({ selectedArrows: [{ source: 'a', target: 't' }, { source: 'a', target: 'u' }] }));
    expect(two).toMatchObject({ disabled: null, mode: 'start' });
    expect(two.inferences).toEqual([
      { target: 't', premises: ['a'] },
      { target: 'u', premises: ['a'] },
    ]);
    expect(two.title).toBe('Ask Claude to formalise the selected arrows and prove 2 targets, one step each, sources first');
    const mixed = formalizeState(ctx({ selectedArrows: [{ source: 'a', target: 't' }], selectedMarks: ['m'] }));
    expect(mixed).toMatchObject({ disabled: null, inferences: [{ target: 't', premises: ['a'] }, { target: 'm', premises: [] }] });
    // The retired reason is gone.
    expect(Object.values(FORMALIZE_TEXTS)).not.toContain('Select arrows into one card: several targets come with the review list.');
  });

  it('slice 2h (§5.11): several targets are ordered sources first (core formalizeOrder), whatever the selection order', () => {
    // t is drawn from u (u a premise of t): the step proving u comes before the one proving t.
    const chained = { ...nodes, t: { ...T, premises: ['a', 'b', 'u'] } };
    const state = formalizeState(ctx({ nodes: chained, selectedArrows: [{ source: 'u', target: 't' }, { source: 'a', target: 'u' }] }));
    expect(state.disabled).toBeNull();
    expect(state.inferences.map((i) => i.target)).toEqual(['u', 't']);
    expect(state.inferences).toEqual([
      { target: 'u', premises: ['a'] },
      { target: 't', premises: ['u'] },
    ]);
    // Many: three targets (two arrows into t count once; a mark adds its card), each once.
    const many = formalizeState(ctx({ nodes: chained, selectedArrows: [{ source: 'u', target: 't' }, { source: 'b', target: 't' }, { source: 'a', target: 'u' }], selectedMarks: ['m'] }));
    expect(many.disabled).toBeNull();
    expect(many.inferences.map((i) => i.target).sort()).toEqual(['m', 't', 'u']);
    expect(many.inferences.findIndex((i) => i.target === 'u')).toBeLessThan(many.inferences.findIndex((i) => i.target === 't'));
    expect(many.inferences.find((i) => i.target === 't')?.premises).toEqual(['u', 'b']);
    // A selected arrow or mark whose card is not on the board shown does not count (empty: the "nothing" reason).
    expect(formalizeState(ctx({ selectedArrows: [{ source: 'a', target: 'gone' }], selectedMarks: ['gone'] })).disabled).toBe(FORMALIZE_TEXTS.none);
  });

  it('a run of the model folder that is active, or a start on its way, comes first ("A run is active.")', () => {
    expect(formalizeRunBlock(null, 'Spyro', false)).toBeNull();
    expect(formalizeRunBlock(runView({ state: 'accepted' }), 'Spyro', false)).toBeNull();
    expect(formalizeRunBlock(runView({ subject: 'Bayonetta' }), 'Spyro', false)).toBe('A run is active. Claude is already working on Bayonetta: wait for it to finish, or cancel it.');
    expect(formalizeRunBlock(runView({ state: 'review' }), 'Spyro', false)).toBe('A run is active. An edit session is waiting for your review: apply or exit it first.');
    expect(formalizeRunBlock(null, 'Spyro', true)).toBe('A run is active. It is starting.');
    const blocked = formalizeState(ctx({ selectedArrows: [{ source: 'a', target: 't' }], runBlock: 'A run is active. It is starting.' }));
    expect(blocked).toMatchObject({ disabled: 'A run is active. It is starting.', inferences: [] });
  });

  it('a card the host has not written yet cannot be asked about', () => {
    expect(formalizeState(ctx({ selectedArrows: [{ source: 'a', target: 't' }], provisional: { a: true } })).disabled).toBe(MENU_PROVISIONAL);
  });

  it('AP-13: the target or a source on a cycle of arrows (drawn and solid) disables it, naming the cycle', () => {
    // u -> t is drawn (u premise of t), and t's proof... no: a solid arrow t -> u (u's proof uses t) closes the cycle.
    const cyclic = { ...nodes, t: { ...T, premises: ['a', 'b', 'u'] } };
    const solid: TlEdge = { id: 'verified:t->u', type: 'verified', source: 't', target: 'u', origin: 'lean', where: 'proof' };
    const state = formalizeState(ctx({ nodes: cyclic, edges: [solid], selectedArrows: [{ source: 'a', target: 't' }] }));
    expect(state.disabled).toBe('This card is on a cycle of arrows (Cynder would not be a good addition to … → Spyro games avoid dark characters → Cynder would not be a good addition to …): remove one arrow first.');
    // Without the solid arrow there is no cycle.
    expect(formalizeState(ctx({ nodes: cyclic, selectedArrows: [{ source: 'a', target: 't' }] })).disabled).toBeNull();
  });

  it('AP-29 (G2; slice 2b2): a cycle of drawn arrows anywhere in the subject, through none of the question’s cards, disables it, naming the cycle; removing one arrow lifts it', () => {
    const p = makeNode('p', 'PROPOSITION', 'P comes from Q', {}, { premises: ['q'] });
    const q = makeNode('q', 'PROPOSITION', 'Q comes from P', {}, { premises: ['p'] });
    const state = formalizeState(ctx({ nodes: { ...nodes, p, q }, selectedArrows: [{ source: 'a', target: 't' }] }));
    expect(state).toMatchObject({ inferences: [{ target: 't', premises: ['a'] }] });
    expect(state.disabled).toBe('The arrows of this subject form a cycle (P comes from Q → Q comes from P → P comes from Q): remove one arrow first.');
    expect(state.title).toBe(state.disabled);
    // One arrow of the cycle removed: Formalize is enabled again.
    expect(formalizeState(ctx({ nodes: { ...nodes, p, q: { ...q, premises: [] } }, selectedArrows: [{ source: 'a', target: 't' }] })).disabled).toBeNull();
  });
});

describe('the selection in one line (CM-5)', () => {
  const sel = { nodes, selected: [] as string[], selectedArrows: [] as { source: string; target: string }[], selectedMarks: [] as string[] };
  it('arrows into one card, into several, marks and cards; every item on hover', () => {
    expect(selectionSummary(sel)).toBeNull();
    expect(selectionSummary({ ...sel, selectedArrows: [{ source: 'a', target: 't' }, { source: 'b', target: 't' }] })).toEqual({
      text: '2 arrows into “Cynder would not be a good addition to …”',
      title: '“Cynder has a dark past” → “Cynder would not be a good addition to …”\n“The new game is PG” → “Cynder would not be a good addition to …”',
    });
    expect(selectionSummary({ ...sel, selectedArrows: [{ source: 'a', target: 't' }, { source: 'a', target: 'u' }] })?.text).toBe('2 arrows into 2 propositions');
    expect(selectionSummary({ ...sel, selectedMarks: ['m'] })?.text).toBe('the "follows from nothing" mark of “Spyro is purple”');
    expect(selectionSummary({ ...sel, selected: ['a', 'b', 'u'] })?.text).toBe('3 cards');
    expect(selectionSummary({ ...sel, selected: ['a'], selectedArrows: [{ source: 'a', target: 'u' }] })?.text).toBe('1 arrow into “Spyro games avoid dark characters” · “Cynder has a dark past”');
  });

  it('D-3b (fixer 1e): the tooltip lists what the question\'s cards presuppose, not only the selected cards\'', () => {
    // Selecting an arrow clears the selected cards: the question's cards are the arrows' ends and the marked cards.
    expect(selectionCards({ ...sel, selectedArrows: [{ source: 'a', target: 't' }, { source: 'b', target: 't' }] })).toEqual(['t', 'a', 'b']);
    expect(selectionCards({ ...sel, selectedMarks: ['m'], selected: ['u', 'm', 'gone'] })).toEqual(['m', 'u']);
    expect(selectionCards(sel)).toEqual([]);
    const summary = { title: '“Cynder has a dark past” → “Cynder would not be a good addition to …”' };
    expect(summaryTitle(summary, [])).toBe(summary.title);
    expect(summaryTitle(summary, ['assumes characters exist', 'assumes there is a Game'])).toBe(`${summary.title}\n+ presupposes: assumes characters exist, assumes there is a Game`);
  });
});

describe('the other actions for the selection (shared with the right-click menu)', () => {
  const menu = (patch: Partial<MenuContext> = {}): MenuContext => ({
    nodes,
    selected: [],
    selectedArrows: [],
    selectedMarks: [],
    expanded: {},
    provisional: {},
    lock: null,
    proposed: false,
    ...patch,
  });
  const ready = formalizeState(ctx({ selectedArrows: [{ source: 'a', target: 't' }] }));
  const entries = (patch: Partial<MenuContext>) => contextActions(menu(patch), ready).entries.map((e) => [e.action, e.label, e.disabled]);

  it('arrows and marks: Delete, which removes them all (one Undo step)', () => {
    expect(entries({ selectedArrows: [{ source: 'a', target: 't' }], selectedMarks: ['m'] })).toEqual([['remove-selection', "Remove 1 arrow and 1 'follows from nothing' mark", null]]);
  });

  it('one card: its actions from the right-click menu (no field editing), in that order', () => {
    expect(entries({ selected: ['u'] })).toEqual([
      ['select-incoming', 'Select incoming arrows', null],
      ['mark-pending', 'Mark pending', null],
      ['move-to-axioms', 'Move to axioms', null],
      ['show', 'Show on board', null],
    ]);
    expect(entries({ selected: ['m'] }).map(([action]) => action)).toEqual(['remove-from-nothing', 'select-incoming', 'mark-pending', 'move-to-axioms', 'show']);
    expect(entries({ selected: ['a'] }).map(([action]) => action)).toEqual(['from-nothing', 'show']);
  });

  it('several cards (CM-3, fixer 1e): the card actions any of them offers, disabled with the reason on hover; the section acts on one card only', () => {
    const several = FORMALIZE_TEXTS.severalCards;
    expect(several).toBe('Select one card for this action.');
    expect(entries({ selected: ['a', 'u'] })).toEqual([
      ['from-nothing', 'Follows from nothing', several],
      ['select-incoming', 'Select incoming arrows', several],
      ['mark-pending', 'Mark pending', several],
      ['move-to-axioms', 'Move to axioms', several],
      ['show', 'Show on board', several],
    ]);
    // With arrows selected too, Delete (which acts on the selection) stays enabled.
    expect(entries({ selected: ['a', 'u'], selectedArrows: [{ source: 'a', target: 't' }] })[0]).toEqual(['remove-selection', 'Remove arrow', null]);
    // The card the actions run on is the one the entries were built for: a selected id not on the board shown does not
    // count (fixer 1e, F9).
    expect(contextActions(menu({ selected: ['u'] }), ready).card).toBe('u');
    expect(contextActions(menu({ selected: ['u', 'gone'] }), ready).card).toBe('u');
    expect(contextActions(menu({ selected: ['a', 'u'] }), ready).card).toBeNull();
    expect(contextActions(menu({ selectedArrows: [{ source: 'a', target: 't' }] }), ready).card).toBeNull();
  });

  it('disabled with the reason during an edit session (ES-9) and in the Proposed view; selecting stays', () => {
    const locked = Object.fromEntries(contextActions(menu({ selected: ['u'], lock: EDIT_SESSION_ACTIVE }), ready).entries.map((e) => [e.action, e.disabled]));
    expect(locked).toEqual({ 'select-incoming': null, 'mark-pending': EDIT_SESSION_ACTIVE, 'move-to-axioms': EDIT_SESSION_ACTIVE, show: null });
    expect(entries({ selectedArrows: [{ source: 'a', target: 't' }], lock: EDIT_SESSION_ACTIVE })).toEqual([['remove-selection', 'Remove arrow', EDIT_SESSION_ACTIVE]]);
    expect(entries({ selectedArrows: [{ source: 'a', target: 't' }], proposed: true })).toEqual([['remove-selection', 'Remove arrow', MENU_PROPOSED_ARROWS]]);
  });

  it('a narrow window: the actions that do not fit go into the "…" menu', () => {
    expect(fittingActions(200, 5, 26, 26)).toBe(5);
    expect(fittingActions(130, 5, 26, 26)).toBe(5);
    expect(fittingActions(129, 5, 26, 26)).toBe(3);
    expect(fittingActions(20, 5, 26, 26)).toBe(0);
  });

  it('the right-click menu of a drawn arrow or a mark starts with Formalize for dependencies, as the section shows it', () => {
    const blocked = formalizeState(ctx({ selectedMarks: ['m'], provisional: { m: true } }));
    const first = (thing: Parameters<typeof menuEntries>[0], f = ready, patch: Partial<MenuContext> = {}) => menuEntries(thing, menu({ formalize: f, ...patch }))[0];
    expect(first({ kind: 'arrow', source: 'a', target: 't' })).toEqual({ action: 'formalize', label: FORMALIZE_LABEL, disabled: null });
    expect(first({ kind: 'mark', id: 'm' }, blocked)).toEqual({ action: 'formalize', label: 'Formalize for dependencies', disabled: MENU_PROVISIONAL });
    expect(first({ kind: 'arrow', source: 'a', target: 't' }, ready, { proposed: true })?.disabled).toBe(MENU_PROPOSED_ARROWS);
    // A card's menu and an undeclared (warning) arrow's do not offer it: only drawn arrows and marks are a question.
    expect(menuEntries({ kind: 'card', id: 't' }, menu({ formalize: ready })).some((e) => e.action === 'formalize')).toBe(false);
    expect(menuEntries({ kind: 'undeclared', source: 'b', target: 'u' }, menu({ formalize: ready })).some((e) => e.action === 'formalize')).toBe(false);
  });
});

describe('slice 2h (CM-2, RV-8): the selection’s review items in the section, decided as a group', () => {
  const view = shownStage();
  it('none: no review items part; one: "1 review item", Accept 1; several: "Accept k of N" naming what it leaves and why', () => {
    expect(reviewItemsModel(view, [], false)).toBeNull();
    const one = reviewItemsModel(view, [IDS.vocab], false);
    expect(one).toMatchObject({ items: [IDS.vocab], text: '1 review item', accept: { enabled: true, label: REVIEW_TEXTS.acceptN(1), title: REVIEW_TEXTS.acceptN(1) }, decline: { enabled: true } });
    // The Formalize is a belief (its own Accept, RV-7): left, with core's reason on hover.
    const two = reviewItemsModel(view, [IDS.vocab, IDS.formalize], false);
    expect(two?.text).toBe('2 review items');
    expect(two?.accept).toMatchObject({ enabled: true, label: REVIEW_TEXTS.acceptKOfN(1, 2) });
    expect(two?.accept.title).toBe(`${REVIEW_TEXTS.acceptKOfN(1, 2)}\n${REVIEW_TEXTS.leftNote([REVIEW_TEXTS.leftOwnAccept('Formalize “PG games cannot have characters with dark pasts”')])}`);
    // Nothing it could take: disabled, the reasons as its tooltip.
    const none = reviewItemsModel(view, [IDS.formalize], false);
    expect(none?.accept).toMatchObject({ enabled: false, label: REVIEW_TEXTS.acceptKOfN(0, 1) });
    expect(none?.accept.title).toBe(REVIEW_TEXTS.leftNote([REVIEW_TEXTS.leftOwnAccept('Formalize “PG games cannot have characters with dark pasts”')]));
  });

  it('one request at a time (busy), and D2-62 while Claude’s step runs: disabled with the reason', () => {
    expect(reviewItemsModel(view, [IDS.vocab], true)?.accept.enabled).toBe(false);
    const step = reviewItemsModel(stepSession(), [IDS.vocab], false);
    expect(step?.accept).toMatchObject({ enabled: false, title: REVIEW_TEXTS.stepRunning });
    expect(step?.decline).toMatchObject({ enabled: false, title: REVIEW_TEXTS.stepRunning });
    // A hidden Result is left (hidden-result) even if named: its card shows no mark for it, and the list never selects it.
    expect(reviewItemsModel(hiddenStage(), [IDS.result], false)?.accept.enabled).toBe(false);
  });
});
