/**
 * Spec v4 slice 1b: the board store's arrow actions (addArrows, removeArrows, setFromNothing, claimPending,
 * moveCards), each one message (one Undo step on the host), applied optimistically and rolled back on a refusal; the
 * arrows dialog that states an impact first (an axiom becoming a proposition, AR-6; a used arrow, A16) or after the
 * host's needs-confirmation; the arrow selection (selectArrow, selectIncomingArrows, Esc, Delete); "Move to axioms".
 */
import { buildGraph, hostMessage, spyroGraph, spyroProvedGraph, type ActionOutcome, type TlGraph, type WebviewToHostMessage } from '@telelean/core';
import { describe, expect, it } from 'vitest';
import { ARROW_TEXTS, createBoardStore, type StoreOptions } from '../../src/state/store';
import { makeNode, mapNode } from '../shared/graphs';
import { sessionRun, shownStage } from '../shared/sessions';

const GOAL = 'cynder-not-good';
const DARK = 'cynder-dark-past';
const PG = 'new-spyro-pg';
const RULE = 'pg-no-dark-past';

/** spyroGraph with the goal's arrows replaced (edges rebuilt from the premises). */
function withPremises(premises: string[], base: TlGraph = spyroGraph(), patch: Record<string, unknown> = {}): TlGraph {
  const nodes = base.nodes.map((n) => (n.id === GOAL ? { ...n, premises, ...patch } : n));
  return { ...buildGraph({ subject: base.subject, version: base.version, nodes, vocabulary: base.vocabulary, diagnostics: base.diagnostics }), semantic: base.semantic };
}

/** A second proposition, marked "follows from nothing" (slice 1f: a Delete of arrows and a mark together). */
const EXTRA = 'extra-from-nothing';
function withExtraMark(base: TlGraph = spyroGraph()): TlGraph {
  const nodes = [...base.nodes, makeNode(EXTRA, 'PROPOSITION', 'Spyro games are fun', {}, { fromNothing: true })];
  return { ...buildGraph({ subject: base.subject, version: base.version, nodes, vocabulary: base.vocabulary, diagnostics: base.diagnostics }), semantic: base.semantic };
}

function setup(graph: TlGraph = spyroGraph(), options: StoreOptions = {}) {
  const sent: WebviewToHostMessage[] = [];
  const store = createBoardStore((m) => sent.push(m), { today: () => '2026-11-19', setTimer: () => undefined, ...options });
  store.getState().applyGraph(graph);
  const state = () => store.getState();
  const result = (requestId: string, outcome: ActionOutcome) => state().receive(hostMessage('actionResult', { requestId, outcome }));
  const last = () => sent.at(-1);
  const ofType = (type: string) => sent.filter((m) => m.type === type);
  const requestIdOf = (m: WebviewToHostMessage | undefined) => (m?.payload as { requestId?: string } | undefined)?.requestId ?? '';
  return { store, sent, state, result, last, ofType, requestIdOf };
}

const refused = (code: Extract<ActionOutcome, { ok: false }>['code'], error: string, dependents?: string[]): ActionOutcome => ({ ok: false, code, error, ...(dependents ? { dependents } : {}) });
const premiseEdges = (graph: { edges: readonly { type: string; source: string; target: string }[] }, target: string) =>
  graph.edges.filter((e) => e.type === 'premise' && e.target === target).map((e) => e.source);

describe('addArrows (AR-1)', () => {
  it('into a proposition: optimistic arrows, one addArrows message; a refusal (a cycle) rolls back with its message', () => {
    const { state, last, result, requestIdOf } = setup(withPremises([DARK]));
    expect(state().addArrows(GOAL, [PG, DARK, PG])).toBe(true);
    expect(last()).toEqual({ v: 1, type: 'addArrows', payload: { target: GOAL, sources: [PG, DARK], requestId: 'r1' } });
    expect(state().nodes[GOAL]?.premises).toEqual([DARK, PG]);
    expect(premiseEdges(state(), GOAL)).toEqual([DARK, PG]);
    result(requestIdOf(last()), refused('invalid', 'This arrow would make a cycle: A → B → A.'));
    expect(state().nodes[GOAL]?.premises).toEqual([DARK]);
    expect(premiseEdges(state(), GOAL)).toEqual([DARK]);
    expect(state().toasts.map((t) => [t.level, t.text])).toEqual([['error', 'This arrow would make a cycle: A → B → A.']]);
  });

  it('an accepted change stays until the host\'s graph arrives (which then decides)', () => {
    const { state, last, result, requestIdOf } = setup(withPremises([]));
    state().addArrows(GOAL, [RULE]);
    result(requestIdOf(last()), { ok: true, label: 'Draw arrow: …', undoable: true });
    expect(state().nodes[GOAL]?.premises).toEqual([RULE]);
    state().applyGraph(withPremises([RULE], spyroGraph(2)));
    expect(premiseEdges(state(), GOAL)).toEqual([RULE]);
  });

  it('removes the "follows from nothing" mark with the arrow (AR-5), and a refusal puts it back', () => {
    const { state, last, result, requestIdOf } = setup(withPremises([], spyroGraph(), { fromNothing: true }));
    state().addArrows(GOAL, [DARK]);
    expect(state().nodes[GOAL]?.fromNothing).toBeUndefined();
    result(requestIdOf(last()), refused('conflict', 'changed since'));
    expect(state().nodes[GOAL]?.fromNothing).toBe(true);
    expect(state().nodes[GOAL]?.premises).toEqual([]);
  });

  it('nothing to send: unknown or provisional sources, only the target, or every arrow drawn already (a toast says so)', () => {
    const { state, sent } = setup();
    expect(state().addArrows(GOAL, ['nope', GOAL])).toBe(false);
    expect(state().addArrows('nope', [DARK])).toBe(false);
    expect(state().addArrows(GOAL, [DARK, PG])).toBe(false);
    expect(state().toasts.map((t) => t.text)).toEqual([ARROW_TEXTS.alreadyDrawn]);
    expect(sent.filter((m) => m.type === 'addArrows')).toEqual([]);
  });

  it('into an axiom: the impact first (AR-6), then the arrow, confirmed; it moves to the propositions until refused', () => {
    const { state, sent, last, result, requestIdOf } = setup(spyroProvedGraph());
    expect(state().addArrows(PG, [DARK])).toBe(true);
    expect(sent.some((m) => m.type === 'addArrows')).toBe(false);
    expect(state().dialog).toEqual({
      kind: 'arrows',
      id: PG,
      change: { kind: 'add-arrows', target: PG, sources: [DARK] },
      summary: 'Becomes a proposition: pending proof until proved',
      detail:
        'Drawing this arrow into “The new Spyro game is PG” makes it a proposition. `axiom new_spyro_pg.holds` stays, marked pending proof, until a run proves it (`theorem new_spyro_pg.holds : … := …`). 1 card that rests on it will lose its green glow until it is proved.',
      dependents: [GOAL],
      listTitle: ARROW_TEXTS.glowList,
      confirm: 'Draw the arrow',
    });
    state().confirmArrows();
    expect(state().dialog).toBeNull();
    expect(last()).toEqual({ v: 1, type: 'addArrows', payload: { target: PG, sources: [DARK], confirmed: true, requestId: 'r1' } });
    expect(state().nodes[PG]?.type).toBe('PROPOSITION');
    expect(state().order.PROPOSITION).toEqual([GOAL, PG]);
    expect(premiseEdges(state(), PG)).toEqual([DARK]);
    result(requestIdOf(last()), refused('invalid', 'This arrow would make a cycle: X → Y → X.'));
    expect(state().nodes[PG]?.type).toBe('AXIOM');
    expect(state().order).toEqual({ AXIOM: [RULE, DARK, PG], PROPOSITION: [GOAL] });
    expect(premiseEdges(state(), PG)).toEqual([]);
    // A confirmed change that the host still refuses is an error, never the dialog again.
    expect(state().dialog).toBeNull();
  });

  it('the host asks (needs-confirmation) when the board saw nothing to confirm: the dialog uses its words; Cancel sends nothing', () => {
    const { state, sent, last, result, requestIdOf } = setup(withPremises([]));
    state().addArrows(GOAL, [DARK]);
    result(requestIdOf(last()), { ok: false, code: 'needs-confirmation', error: 'The host knows more.', dependents: ['Spyro.helper'], dependentCards: {} });
    expect(state().nodes[GOAL]?.premises).toEqual([]);
    expect(state().dialog).toMatchObject({ kind: 'arrows', id: GOAL, detail: 'The host knows more.', dependents: ['Spyro.helper'], change: { kind: 'add-arrows', target: GOAL, sources: [DARK] } });
    state().closeDialog();
    expect(sent.filter((m) => m.type === 'addArrows')).toHaveLength(1);
    // Asked again, the confirmed resend goes out.
    state().addArrows(GOAL, [DARK]);
    result(requestIdOf(last()), { ok: false, code: 'needs-confirmation', error: 'The host knows more.' });
    state().confirmArrows();
    expect(last()).toMatchObject({ type: 'addArrows', payload: { target: GOAL, sources: [DARK], confirmed: true } });
  });

  it('"Draw arrows from the selection" (the target\'s right-click menu; slice 1c2 removed the card\'s button): the selected cards (not the target) become the sources; none selected is a hint', () => {
    const { state, last } = setup(withPremises([]));
    expect(state().drawArrowsFromSelection(GOAL)).toBe(false);
    expect(state().toasts.map((t) => t.text)).toEqual([ARROW_TEXTS.noSources]);
    state().clickCard(DARK, false);
    state().clickCard(GOAL, true);
    state().clickCard(RULE, true);
    expect(state().drawArrowsFromSelection(GOAL)).toBe(true);
    expect(last()).toMatchObject({ type: 'addArrows', payload: { target: GOAL, sources: [DARK, RULE] } });
  });
});

describe('removeArrows (AR-1, A16)', () => {
  it('an arrow no proof uses: removed at once (optimistic), one message; a refusal restores it', () => {
    const { state, last, result, requestIdOf } = setup();
    expect(state().removeArrows([{ source: PG, target: GOAL }, { source: PG, target: GOAL }, { source: 'nope', target: GOAL }])).toBe(true);
    expect(last()).toEqual({ v: 1, type: 'removeArrows', payload: { arrows: [{ source: PG, target: GOAL }], requestId: 'r1' } });
    expect(state().nodes[GOAL]?.premises).toEqual([DARK, RULE]);
    expect(premiseEdges(state(), GOAL)).toEqual([DARK, RULE]);
    result(requestIdOf(last()), refused('conflict', 'Model/Spyro/Main.lean changed since; use History to revert'));
    expect(state().nodes[GOAL]?.premises).toEqual([DARK, PG, RULE]);
    expect(premiseEdges(state(), GOAL).sort()).toEqual([DARK, PG, RULE].sort());
  });

  it('an arrow a proof uses: the A16 dialog first, then the removal, confirmed', () => {
    const { state, sent, last } = setup(spyroProvedGraph());
    state().removeArrows([{ source: DARK, target: GOAL }]);
    expect(sent.some((m) => m.type === 'removeArrows')).toBe(false);
    expect(state().dialog).toMatchObject({
      kind: 'arrows',
      id: GOAL,
      summary: 'Remove an arrow that a proof uses?',
      dependents: [GOAL],
      listTitle: ARROW_TEXTS.usedList,
      confirm: 'Remove anyway',
    });
    const dialog = state().dialog;
    // Sentences are cut near 40 characters, as in core's labels.
    expect(dialog?.kind === 'arrows' ? dialog.detail : '').toMatch(/^The proof of “Cynder would not be a good addition to …” uses “Cynder is a character who has a dark pa…”\. Without the arrow/);
    state().confirmArrows();
    expect(last()).toEqual({ v: 1, type: 'removeArrows', payload: { arrows: [{ source: DARK, target: GOAL }], confirmed: true, requestId: 'r1' } });
    expect(state().nodes[GOAL]?.premises).toEqual([PG, RULE]);
  });

  it('nothing to remove: an arrow that is not drawn', () => {
    const { state, sent } = setup();
    expect(state().removeArrows([{ source: GOAL, target: DARK }])).toBe(false);
    expect(sent).toEqual([]);
  });
});

describe('setFromNothing (AR-5) and claimPending (AR-8)', () => {
  it('on a proposition: optimistic mark, one message; off removes it; a refusal restores', () => {
    const { state, last, result, requestIdOf } = setup(withPremises([]));
    expect(state().setFromNothing(GOAL, true)).toBe(true);
    expect(last()).toEqual({ v: 1, type: 'setFromNothing', payload: { id: GOAL, on: true, requestId: 'r1' } });
    expect(state().nodes[GOAL]?.fromNothing).toBe(true);
    result(requestIdOf(last()), refused('invalid', 'It has arrows into it: a card follows from nothing only without them. Remove its arrows first.'));
    expect(state().nodes[GOAL]?.fromNothing).toBeUndefined();
    expect(state().setFromNothing(GOAL, false)).toBe(false);
    state().setFromNothing(GOAL, true);
    result(requestIdOf(last()), { ok: true, label: 'Follows from nothing: …', undoable: true });
    expect(state().setFromNothing(GOAL, true)).toBe(false);
    expect(state().setFromNothing(GOAL, false)).toBe(true);
    expect(last()).toMatchObject({ type: 'setFromNothing', payload: { id: GOAL, on: false } });
    expect(state().nodes[GOAL]?.fromNothing).toBeUndefined();
  });

  it('on an axiom: the impact first ("Make it a proposition"), then the mark, confirmed', () => {
    const { state, sent, last } = setup(spyroProvedGraph());
    state().setFromNothing(PG, true);
    expect(sent.some((m) => m.type === 'setFromNothing')).toBe(false);
    expect(state().dialog).toMatchObject({ kind: 'arrows', id: PG, confirm: ARROW_TEXTS.confirmProposition, dependents: [GOAL] });
    const dialog = state().dialog;
    expect(dialog?.kind === 'arrows' ? dialog.detail : '').toMatch(/^Marking “The new Spyro game is PG” "follows from nothing" makes it a proposition\. `axiom new_spyro_pg\.holds` stays/);
    state().confirmArrows();
    expect(last()).toEqual({ v: 1, type: 'setFromNothing', payload: { id: PG, on: true, confirmed: true, requestId: 'r1' } });
    expect(state().nodes[PG]).toMatchObject({ type: 'PROPOSITION', fromNothing: true });
  });

  it('claimPending posts one message, changes nothing on the board, and a refusal is an error toast', () => {
    const { state, last, result, requestIdOf } = setup();
    const before = state().nodes[GOAL];
    state().claimPending(GOAL);
    expect(last()).toEqual({ v: 1, type: 'claimPending', payload: { id: GOAL, requestId: 'r1' } });
    expect(state().nodes[GOAL]).toBe(before);
    result(requestIdOf(last()), refused('invalid', 'It has a proof already: there is nothing to mark.'));
    expect(state().toasts.map((t) => t.text)).toEqual(['It has a proof already: there is nothing to mark.']);
    state().claimPending('nope');
    expect(last()).toMatchObject({ type: 'claimPending', payload: { id: GOAL } });
  });
});

describe('moveCards (BD-3)', () => {
  it('stores positions optimistically (propositions only), posts one message, and a refusal restores them', () => {
    const graph: TlGraph = { ...spyroGraph(), positions: { [GOAL]: { x: 1, y: 2 } } };
    const { state, last, result, requestIdOf } = setup(graph);
    expect(state().positions).toEqual({ [GOAL]: { x: 1, y: 2 } });
    state().moveCards({ [GOAL]: { x: 30, y: 2e7 }, [DARK]: { x: 5, y: 5 } });
    expect(last()).toEqual({ v: 1, type: 'moveCards', payload: { positions: { [GOAL]: { x: 30, y: 1_000_000 } }, requestId: 'r1' } });
    expect(state().positions).toEqual({ [GOAL]: { x: 30, y: 1_000_000 } });
    result(requestIdOf(last()), refused('invalid', 'nope'));
    expect(state().positions).toEqual({ [GOAL]: { x: 1, y: 2 } });
    // The host's graph has the last word.
    state().applyGraph({ ...spyroGraph(3), positions: { [GOAL]: { x: 7, y: 8 } } });
    expect(state().positions).toEqual({ [GOAL]: { x: 7, y: 8 } });
    state().applyGraph(spyroGraph(4));
    expect(state().positions).toEqual({});
  });
});

describe('the arrow selection (CM-2) and Delete (AR-1)', () => {
  it('a plain click on an arrow replaces the selection; Ctrl adds or removes; only drawn arrows', () => {
    const { state, ofType } = setup();
    state().clickCard(DARK, false);
    state().selectArrow(PG, GOAL, false);
    expect(state().selected).toEqual([]);
    expect(state().selectedArrows).toEqual([{ source: PG, target: GOAL }]);
    expect(ofType('select').at(-1)?.payload).toEqual({ ids: [] });
    state().selectArrow(DARK, GOAL, true);
    state().selectArrow(PG, GOAL, true);
    expect(state().selectedArrows).toEqual([{ source: DARK, target: GOAL }]);
    state().selectArrow(GOAL, DARK, false);
    expect(state().selectedArrows).toEqual([{ source: DARK, target: GOAL }]);
    // A plain click on a card replaces arrows too; Ctrl-click keeps them.
    state().clickCard(RULE, true);
    expect(state().selectedArrows).toHaveLength(1);
    state().clickCard(RULE, false);
    expect(state().selectedArrows).toEqual([]);
    expect(state().selected).toEqual([RULE]);
  });

  it('"Select incoming arrows" selects every drawn arrow into the card, or its mark; Esc (clearSelection) clears all', () => {
    const { state, sent } = setup();
    expect(state().selectIncomingArrows(GOAL)).toBe(true);
    expect(state().selectedArrows).toEqual([DARK, PG, RULE].map((source) => ({ source, target: GOAL })));
    expect(state().selectIncomingArrows(DARK)).toBe(false);
    const count = sent.length;
    state().clearSelection();
    expect([state().selectedArrows, state().selectedMarks, state().selected]).toEqual([[], [], []]);
    // No card was selected: nothing to tell the host.
    expect(sent.length).toBe(count);
    const marked = setup(withPremises([], spyroGraph(), { fromNothing: true }));
    expect(marked.state().selectIncomingArrows(GOAL)).toBe(true);
    expect(marked.state().selectedMarks).toEqual([GOAL]);
    expect(marked.state().selectedArrows).toEqual([]);
    expect(setup(withPremises([])).state().selectIncomingArrows(GOAL)).toBe(false);
  });

  it('Delete with arrows selected removes them in one message; a mark goes in the same message (slice 1f); with nothing, false', () => {
    const { state, last, ofType } = setup();
    expect(state().deleteSelectedArrows()).toBe(false);
    state().selectIncomingArrows(GOAL);
    expect(state().deleteSelectedArrows()).toBe(true);
    expect(ofType('removeArrows')).toHaveLength(1);
    expect(last()).toMatchObject({ type: 'removeArrows', payload: { arrows: [DARK, PG, RULE].map((source) => ({ source, target: GOAL })) } });
    expect(last()?.payload).not.toHaveProperty('marks');
    // The host's graph without those arrows drops them from the selection.
    state().applyGraph(withPremises([], spyroGraph(5)));
    expect(state().selectedArrows).toEqual([]);
    // Slice 1f (carry-over 2): a mark is removed by the same removeArrows (one Undo step), not by "follows from nothing" off.
    const marked = setup(withPremises([], spyroGraph(), { fromNothing: true }));
    marked.state().selectIncomingArrows(GOAL);
    expect(marked.state().deleteSelectedArrows()).toBe(true);
    expect(marked.sent.map((m) => m.type)).toEqual(['removeArrows']);
    expect(marked.last()).toEqual({ v: 1, type: 'removeArrows', payload: { arrows: [], marks: [GOAL], requestId: 'r1' } });
    expect(marked.state().nodes[GOAL]?.fromNothing).toBeUndefined();
  });

  it('slice 1f (carry-over 2): arrows and marks in one Delete are one message; a used arrow asks first for all of it, Cancel sends nothing; a refusal restores both', () => {
    const graph = withExtraMark(spyroProvedGraph());
    const { state, sent, last, result, requestIdOf } = setup(graph);
    state().selectIncomingArrows(EXTRA); // the mark
    state().selectArrow(DARK, GOAL, true); // plus an arrow the proof uses (A16)
    expect(state().selectedMarks).toEqual([EXTRA]);
    expect(state().selectedArrows).toEqual([{ source: DARK, target: GOAL }]);
    expect(state().deleteSelectedArrows()).toBe(true);
    // The question first, about the whole Delete: nothing is sent or changed yet.
    expect(sent).toEqual([]);
    const dialog = state().dialog;
    expect(dialog).toMatchObject({ kind: 'arrows', id: GOAL, change: { kind: 'remove-arrows', arrows: [{ source: DARK, target: GOAL }], marks: [EXTRA] } });
    expect(dialog?.kind === 'arrows' ? dialog.detail : '').toContain('The selected "follows from nothing" mark is removed with them.');
    state().closeDialog();
    expect(sent).toEqual([]);
    expect(state().nodes[EXTRA]?.fromNothing).toBe(true);
    expect(state().nodes[GOAL]?.premises).toContain(DARK);
    // Again, confirmed: one message with both, applied optimistically.
    state().deleteSelectedArrows();
    state().confirmArrows();
    expect(sent.map((m) => m.type)).toEqual(['removeArrows']);
    expect(last()).toEqual({ v: 1, type: 'removeArrows', payload: { arrows: [{ source: DARK, target: GOAL }], marks: [EXTRA], confirmed: true, requestId: 'r1' } });
    expect(state().nodes[EXTRA]?.fromNothing).toBeUndefined();
    expect(state().nodes[GOAL]?.premises).not.toContain(DARK);
    // A refusal puts both back.
    result(requestIdOf(last()), refused('conflict', 'changed since'));
    expect(state().nodes[EXTRA]?.fromNothing).toBe(true);
    expect(state().nodes[GOAL]?.premises).toContain(DARK);
    expect(premiseEdges(state(), GOAL)).toContain(DARK);
  });

  it('a new subject clears the arrow selection', () => {
    const { state } = setup();
    state().selectIncomingArrows(GOAL);
    state().applyGraph({ ...spyroGraph(9), subject: 'Bayonetta' });
    expect(state().selectedArrows).toEqual([]);
  });
});

describe('"Move to axioms" (AR-7) shows its impact first', () => {
  it('a proposition with a reason and arrows: the rationale dialog with its reason, then the kind change (the reason not re-sent)', () => {
    const graph = mapNode(spyroGraph(), GOAL, (n) => ({ ...n, rationale: 'lore' }));
    const { state, sent, last } = setup(graph);
    state().moveToAxioms(GOAL);
    expect(sent.some((m) => m.type === 'kindChange')).toBe(false);
    expect(state().dialog).toMatchObject({ kind: 'rationale', id: GOAL, to: 'AXIOM', initial: 'lore', summary: 'Move to axioms: adds axiom cynder_not_good.holds' });
    const dialog = state().dialog;
    expect(dialog?.kind === 'rationale' ? dialog.detail : '').toContain('Its 3 incoming arrows are removed.');
    state().confirmRationale('lore');
    expect(last()).toEqual({ v: 1, type: 'kindChange', payload: { id: GOAL, from: 'PROPOSITION', to: 'AXIOM', beforeId: null, requestId: 'r1' } });
    expect(state().nodes[GOAL]).toMatchObject({ type: 'AXIOM', premises: [] });
  });

  it('a new reason typed in the dialog is sent; an axiom has no "Move to axioms"', () => {
    const { state, last, sent } = setup();
    state().moveToAxioms(GOAL);
    state().confirmRationale('a friend said so');
    expect(last()).toMatchObject({ type: 'kindChange', payload: { id: GOAL, to: 'AXIOM', rationale: 'a friend said so' } });
    const count = sent.length;
    state().moveToAxioms(DARK);
    expect(state().dialog).toBeNull();
    expect(sent.length).toBe(count);
  });
});

describe('the proposed view changes no arrow (slice 2h: an edit session’s)', () => {
  it('no arrow change or pending mark is made while the session’s Proposed view is on screen; selecting works there, and a move is a session step', () => {
    const { state, sent } = setup(spyroProvedGraph());
    state().receive(hostMessage('run', { run: sessionRun(shownStage()) }));
    state().receive(hostMessage('session', { session: shownStage() }));
    expect(state().proposedView).toBe(true);
    const count = sent.length;
    expect(state().addArrows(GOAL, [DARK])).toBe(false);
    expect(state().removeArrows([{ source: DARK, target: GOAL }])).toBe(false);
    expect(state().setFromNothing(GOAL, true)).toBe(false);
    state().claimPending(GOAL);
    expect(state().deleteSelectedArrows()).toBe(false);
    expect(sent.length).toBe(count);
    // Slice 2h (§5.10): it selects the drawn arrows (never Claude's still in review), and moves through the session.
    expect(state().selectIncomingArrows(GOAL)).toBe(true);
    expect(state().selectedArrows.map((a) => a.source)).toEqual([DARK, 'pg-no-dark-past']);
    state().moveCards({ [GOAL]: { x: 1, y: 1 } });
    expect(sent.slice(count).map((m) => m.type)).toEqual(['moveProposed']);
  });
});
