/**
 * Spec v4 CM-7 (slice 1c): the right-click menu's rules: what it selects first (the thing under the pointer, unless it
 * is selected already, with the two exceptions: a card while other cards are selected, and empty canvas), and which
 * actions it lists (today's actions of a card, an arrow, a mark; New proposition here, Fit all and Tidy layout on
 * empty canvas), disabled with the reason during an edit session (ES-9) and in the Proposed view. Also the AXIOMS
 * header's "also assumed" line and the Vocabulary and Definitions band's summary (BD-1).
 */
import { EDIT_SESSION_ACTIVE, type TlNode, type VocabItem } from '@telelean/core';
import { describe, expect, it } from 'vitest';
import { alsoAssumed, alsoAssumedParts } from '../../src/board/assumed';
import { MENU_PROPOSED_ARROWS, MENU_PROPOSED_READ_ONLY, MENU_PROVISIONAL, menuEntries, menuSelection, removeSelectionLabel, type MenuContext } from '../../src/board/menu';
import { bandSummary, bandSummaryText, splitVocabulary } from '../../src/board/vocabularyBand';
import { PROPOSED_ARROWS_LOCKED } from '../../src/state/store';
import { makeNode } from '../shared/graphs';

/** Proved (so "Mark pending" does not apply). */
const proved = (id: string) => ({ binding: 'pinned' as const, statement: `Spyro.${id}`, justification: `Spyro.${id}.holds`, justificationKind: 'theorem' as const });
const P = makeNode('p', 'PROPOSITION', 'Cynder is not PG material', { proof: { kind: 'proved', footprint: ['a'] } }, {
  premises: ['a'],
  lean: proved('p'),
  loc: { file: 'Model/Spyro/Main.lean', range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } }, markupVersion: 1 },
});
/** A Lean statement and no `.holds`: "Mark pending" applies (AR-8). */
const Q = makeNode('q', 'PROPOSITION', 'Spyro games avoid dark characters', {}, { lean: { binding: 'pinned', statement: 'Spyro.q' } });
const M = makeNode('m', 'PROPOSITION', 'Spyro is purple', { proof: { kind: 'proved', footprint: [] } }, { fromNothing: true, lean: proved('m') });
const A = makeNode('a', 'AXIOM', 'Cynder has a dark past', { proof: { kind: 'assumed' } });
const L = makeNode('legacy', 'AXIOM', 'Ratings follow content', { proof: { kind: 'assumed' } }, { premises: ['a'] });
const nodes: Record<string, TlNode> = { p: P, q: Q, m: M, a: A, legacy: L };

function ctx(patch: Partial<MenuContext> = {}): MenuContext {
  return { nodes, selected: [], selectedArrows: [], selectedMarks: [], expanded: {}, provisional: {}, lock: null, proposed: false, ...patch };
}
const actions = (thing: Parameters<typeof menuEntries>[0], c: MenuContext) => menuEntries(thing, c).map((e) => e.action);
const reasons = (thing: Parameters<typeof menuEntries>[0], c: MenuContext) => Object.fromEntries(menuEntries(thing, c).map((e) => [e.action, e.disabled]));

describe('what a right click selects (CM-7)', () => {
  const none = { selected: [], selectedArrows: [], selectedMarks: [] };
  it('selects the thing under the pointer first', () => {
    expect(menuSelection(none, { kind: 'card', id: 'p' })).toEqual({ kind: 'card', id: 'p' });
    expect(menuSelection(none, { kind: 'arrow', source: 'a', target: 'p' })).toEqual({ kind: 'arrow', source: 'a', target: 'p' });
    expect(menuSelection(none, { kind: 'mark', id: 'm' })).toEqual({ kind: 'mark', id: 'm' });
    // A card replaces a selection of arrows (only other *cards* keep the selection).
    expect(menuSelection({ ...none, selectedArrows: [{ source: 'a', target: 'p' }] }, { kind: 'card', id: 'q' })).toEqual({ kind: 'card', id: 'q' });
  });

  it('keeps the selection when the thing is part of it already', () => {
    expect(menuSelection({ ...none, selected: ['p'] }, { kind: 'card', id: 'p' })).toEqual({ kind: 'keep' });
    expect(menuSelection({ ...none, selectedArrows: [{ source: 'a', target: 'p' }] }, { kind: 'arrow', source: 'a', target: 'p' })).toEqual({ kind: 'keep' });
    expect(menuSelection({ ...none, selectedMarks: ['m'] }, { kind: 'mark', id: 'm' })).toEqual({ kind: 'keep' });
  });

  it('exception 1: a right click on a card while other cards are selected keeps the selection', () => {
    expect(menuSelection({ ...none, selected: ['a', 'q'] }, { kind: 'card', id: 'p' })).toEqual({ kind: 'keep' });
  });

  it('exception 2: a right click on empty canvas keeps the selection; the Proposed view never selects', () => {
    expect(menuSelection({ ...none, selected: ['p'] }, { kind: 'canvas', at: { x: 1, y: 2 } })).toEqual({ kind: 'keep' });
    expect(menuSelection(none, { kind: 'card', id: 'p' }, true)).toEqual({ kind: 'keep' });
    expect(menuSelection(none, { kind: 'arrow', source: 'a', target: 'p' }, true)).toEqual({ kind: 'keep' });
  });

  it('slice 1c2: an arrow a proof uses that nobody drew (TL107) is not selectable: its right click keeps the selection', () => {
    expect(menuSelection(none, { kind: 'undeclared', source: 'q', target: 'p' })).toEqual({ kind: 'keep' });
    expect(menuSelection({ ...none, selected: ['a'] }, { kind: 'undeclared', source: 'q', target: 'p' })).toEqual({ kind: 'keep' });
  });
});

describe('the actions it lists (CM-7, CM-4)', () => {
  it("a proposition: its arrow actions, Move to axioms, Show on board, details, Open in editor, Edit, Add why, Delete", () => {
    expect(actions({ kind: 'card', id: 'p' }, ctx())).toEqual(['select-incoming', 'move-to-axioms', 'show', 'details', 'open', 'edit', 'why', 'delete']);
    expect(actions({ kind: 'card', id: 'q' }, ctx())).toEqual(['from-nothing', 'mark-pending', 'move-to-axioms', 'show', 'details', 'edit', 'why', 'delete']);
    expect(actions({ kind: 'card', id: 'm' }, ctx())).toEqual(['remove-from-nothing', 'select-incoming', 'move-to-axioms', 'show', 'details', 'edit', 'why', 'delete']);
    expect(menuEntries({ kind: 'card', id: 'p' }, ctx({ expanded: { p: true } })).find((e) => e.action === 'details')?.label).toBe('Hide details');
  });

  it('an axiom: "Follows from nothing" (it becomes a proposition), or an old axiom\'s two choices (A19)', () => {
    expect(actions({ kind: 'card', id: 'a' }, ctx())).toEqual(['from-nothing', 'show', 'details', 'edit', 'why', 'delete']);
    expect(actions({ kind: 'card', id: 'legacy' }, ctx())).toEqual(['legacy-make-proposition', 'legacy-drop-arrows', 'show', 'details', 'edit', 'why', 'delete']);
  });

  it('other cards selected: "Draw arrows from the selection" into the clicked card comes first (AR-1)', () => {
    const entries = menuEntries({ kind: 'card', id: 'p' }, ctx({ selected: ['a', 'q'] }));
    expect(entries[0]).toEqual({ action: 'draw-from-selection', label: 'Draw 2 arrows from the selection', disabled: null });
    expect(menuEntries({ kind: 'card', id: 'p' }, ctx({ selected: ['p', 'a'] }))[0]?.label).toBe('Draw an arrow from the selection');
  });

  it('during an edit session (ES-9) every edit is disabled with the reason; selecting and viewing stay', () => {
    const r = reasons({ kind: 'card', id: 'p' }, ctx({ lock: EDIT_SESSION_ACTIVE, selected: ['a'] }));
    expect(r).toEqual({
      'draw-from-selection': EDIT_SESSION_ACTIVE,
      'select-incoming': null,
      'move-to-axioms': EDIT_SESSION_ACTIVE,
      show: null,
      details: null,
      open: null,
      edit: EDIT_SESSION_ACTIVE,
      why: EDIT_SESSION_ACTIVE,
      delete: EDIT_SESSION_ACTIVE,
    });
    expect(reasons({ kind: 'canvas', at: { x: 0, y: 0 } }, ctx({ lock: EDIT_SESSION_ACTIVE }))).toEqual({ 'new-here': EDIT_SESSION_ACTIVE, fit: null, tidy: EDIT_SESSION_ACTIVE });
    expect(reasons({ kind: 'arrow', source: 'a', target: 'p' }, ctx({ lock: EDIT_SESSION_ACTIVE }))['remove-arrows']).toBe(EDIT_SESSION_ACTIVE);
  });

  it('a card the host has not written yet: its edits wait', () => {
    expect(reasons({ kind: 'card', id: 'q' }, ctx({ provisional: { q: true } }))).toMatchObject({ 'from-nothing': MENU_PROVISIONAL, edit: MENU_PROVISIONAL, show: null });
  });

  it('the Proposed view: read-only, its arrow actions shown disabled with their reason, no edits', () => {
    expect(MENU_PROPOSED_ARROWS).toBe(PROPOSED_ARROWS_LOCKED);
    const entries = menuEntries({ kind: 'card', id: 'q' }, ctx({ proposed: true, selected: ['a'] }));
    expect(entries.map((e) => [e.action, e.disabled])).toEqual([
      ['draw-from-selection', MENU_PROPOSED_ARROWS],
      ['from-nothing', MENU_PROPOSED_ARROWS],
      ['move-to-axioms', MENU_PROPOSED_ARROWS],
      ['show', null],
      ['details', null],
    ]);
    expect(reasons({ kind: 'canvas', at: { x: 0, y: 0 } }, ctx({ proposed: true }))).toEqual({ 'new-here': MENU_PROPOSED_READ_ONLY, fit: null, tidy: MENU_PROPOSED_READ_ONLY });
  });

  it('an arrow, a mark, and empty canvas (Tidy layout names the selected propositions)', () => {
    expect(menuEntries({ kind: 'arrow', source: 'a', target: 'p' }, ctx()).map((e) => e.label)).toEqual([
      'Remove arrow',
      'Select the arrows into “Cynder is not PG material”',
      'Show “Cynder has a dark past”',
      'Show “Cynder is not PG material”',
    ]);
    const two = [
      { source: 'a', target: 'p' },
      { source: 'q', target: 'p' },
    ];
    expect(menuEntries({ kind: 'arrow', source: 'a', target: 'p' }, ctx({ selectedArrows: two }))[0]?.label).toBe('Remove 2 arrows');
    expect(actions({ kind: 'mark', id: 'm' }, ctx())).toEqual(['remove-mark', 'show']);
    expect(menuEntries({ kind: 'canvas', at: { x: 5, y: 5 } }, ctx()).map((e) => e.label)).toEqual(['New proposition here', 'Fit all', 'Tidy layout']);
    expect(menuEntries({ kind: 'canvas', at: { x: 5, y: 5 } }, ctx({ selected: ['p', 'a', 'q'] }))[2]?.label).toBe('Tidy layout (2 selected)');
  });

  it('slice 1c2: an undeclared arrow\'s menu offers "Draw this arrow" (disabled while locked or in the Proposed view) and both ends', () => {
    const thing = { kind: 'undeclared' as const, source: 'a', target: 'q' };
    expect(menuEntries(thing, ctx()).map((e) => [e.action, e.label, e.disabled])).toEqual([
      ['draw-this-arrow', 'Draw this arrow', null],
      ['show-source', 'Show “Cynder has a dark past”', null],
      ['show-target', 'Show “Spyro games avoid dark characters”', null],
    ]);
    expect(reasons(thing, ctx({ lock: EDIT_SESSION_ACTIVE }))).toEqual({ 'draw-this-arrow': EDIT_SESSION_ACTIVE, 'show-source': null, 'show-target': null });
    expect(reasons(thing, ctx({ proposed: true }))).toEqual({ 'draw-this-arrow': MENU_PROPOSED_ARROWS, 'show-source': null, 'show-target': null });
  });

  it('removing a selected arrow or mark removes the whole selection, and the label names all of it', () => {
    const two = [
      { source: 'a', target: 'p' },
      { source: 'q', target: 'p' },
    ];
    const label = (thing: Parameters<typeof menuEntries>[0], c: MenuContext) => menuEntries(thing, c)[0]?.label;
    // Arrows and a mark selected together: one Delete takes both (the store's deleteSelectedArrows).
    expect(label({ kind: 'arrow', source: 'a', target: 'p' }, ctx({ selectedArrows: two, selectedMarks: ['m'] }))).toBe("Remove 2 arrows and 1 'follows from nothing' mark");
    expect(label({ kind: 'mark', id: 'm' }, ctx({ selectedArrows: two.slice(0, 1), selectedMarks: ['m'] }))).toBe("Remove 1 arrow and 1 'follows from nothing' mark");
    expect(label({ kind: 'mark', id: 'm' }, ctx({ selectedMarks: ['m', 'q'] }))).toBe("Remove 2 'follows from nothing' marks");
    expect(label({ kind: 'mark', id: 'm' }, ctx({ selectedMarks: ['m'] }))).toBe("Remove 'follows from nothing'");
    // Not part of the selection: only this one goes, and the label says so.
    expect(label({ kind: 'arrow', source: 'q', target: 'p' }, ctx({ selectedArrows: two.slice(0, 1), selectedMarks: ['m'] }))).toBe('Remove arrow');
    expect(label({ kind: 'mark', id: 'm' }, ctx({ selectedArrows: two }))).toBe("Remove 'follows from nothing'");
    // The Proposed view removes nothing (the entry is disabled): it names the thing only.
    expect(label({ kind: 'arrow', source: 'a', target: 'p' }, ctx({ proposed: true, selectedArrows: two, selectedMarks: ['m'] }))).toBe('Remove arrow');
    expect(label({ kind: 'mark', id: 'm' }, ctx({ proposed: true, selectedArrows: two, selectedMarks: ['m'] }))).toBe("Remove 'follows from nothing'");
    expect(removeSelectionLabel(1, 0)).toBe('Remove arrow');
    expect(removeSelectionLabel(3, 2)).toBe("Remove 3 arrows and 2 'follows from nothing' marks");
  });
});

const vocabItem = (name: string, kind: VocabItem['kind'], flags: VocabItem['flags'] = []): VocabItem =>
  ({ name, shortName: name.split('.').at(-1) ?? name, kind, subject: 'Spyro', flags, usedBy: [] }) as VocabItem;

describe('what the AXIOMS header counts, and the band above (BD-1)', () => {
  const vocabulary = [
    vocabItem('Spyro.Character', 'sort'),
    vocabItem('Spyro.Character.exists', 'presupposition'),
    vocabItem('Spyro.Game.exists', 'presupposition'),
    vocabItem('Spyro.sneaky', 'unmarked-axiom', ['unmarked-assumption']),
    vocabItem('Spyro.InGame', 'definition', ['definitional-choice']),
    vocabItem('Spyro.IsPG', 'definition'),
  ];

  it('"also assumed": pending claims (cards), existence and hidden assumptions (Vocabulary items), in order; nothing when none', () => {
    const pending = makeNode('pend', 'PROPOSITION', 'Pending', { proof: { kind: 'pending' } });
    const view = { nodes: { ...nodes, pend: pending }, order: { AXIOM: ['a', 'legacy'], PROPOSITION: ['p', 'pend', 'q'] }, vocabulary };
    const assumed = alsoAssumed(view);
    expect(assumed).toEqual({ pending: ['pend'], existence: ['Spyro.Character.exists', 'Spyro.Game.exists'], hidden: ['Spyro.sneaky'] });
    expect(alsoAssumedParts(assumed).map((p) => p.text)).toEqual(['1 pending claim', '2 existence assumptions', '1 hidden assumption']);
    expect(alsoAssumedParts(alsoAssumed({ nodes, order: { AXIOM: [], PROPOSITION: ['p'] }, vocabulary: [] }))).toEqual([]);
  });

  it('in the Proposed view before the reveal, a card whose result is hidden counts as on the Current board (RV-6; 1d fixer)', () => {
    const before = makeNode('pend', 'PROPOSITION', 'Pending', { proof: { kind: 'pending' } });
    const after = makeNode('pend', 'PROPOSITION', 'Pending', { proof: { kind: 'proved', footprint: ['a'] } });
    const added = makeNode('new', 'PROPOSITION', 'New, pending', { proof: { kind: 'pending' } });
    const proposal = { nodes: { ...nodes, pend: after, new: added }, order: { AXIOM: ['a'], PROPOSITION: ['p', 'pend', 'new'] }, vocabulary: [] };
    const current = { ...nodes, pend: before };
    // The run proved the pending claim: before the reveal it still counts (the count must not tell that a proof
    // exists); the new card, whose result is hidden too, is not counted until then.
    expect(alsoAssumed(proposal, { hidden: new Set(['pend', 'new']), current }).pending).toEqual(['pend']);
    expect(alsoAssumed(proposal).pending).toEqual(['new']);
  });

  it('splits Definitions from the rest of the vocabulary, and sums both up on one line with their flags', () => {
    const { vocabulary: vocab, definitions } = splitVocabulary(vocabulary);
    expect(vocab.map((i) => i.name)).toEqual(['Spyro.Character', 'Spyro.Character.exists', 'Spyro.Game.exists', 'Spyro.sneaky']);
    expect(definitions.map((i) => i.name)).toEqual(['Spyro.InGame', 'Spyro.IsPG']);
    const summary = bandSummary(vocabulary, { 'Spyro.IsPG': 'added', 'Spyro.Character': 'changed' });
    expect(summary).toEqual({ vocabulary: 4, definitions: 2, hidden: 1, endorse: 1, added: { vocabulary: 0, definitions: 1 } });
    expect(bandSummaryText(summary)).toBe('Vocabulary 4 · 1 hidden assumption · Definitions 2 · 1 needs your endorsement · 1 new');
    expect(bandSummaryText(bandSummary([]))).toBe('Vocabulary 0 · Definitions 0');
  });
});
