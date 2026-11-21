/**
 * Spec v4.1 BD-7, B.5 (slice 1d): the band. Which drawn arrows into a proposition form its band (those from direct(v),
 * and a conditional proof's hypotheses), when it is complete (✓, "these suffice") or open (naming what lies outside
 * it), the band on a "follows from nothing" mark, none for an unproved card, an axiom or out-of-date facts, and none
 * while the Proposed view hides the result.
 */
import { spyroGraph, spyroProvedGraph, type TlGraph, type TlNode, type VocabItem } from '@telelean/core';
import { describe, expect, it } from 'vitest';
import { BAND_COMPLETE_TITLE, bandName, bandOf, bandsOf, directOf, type BandContext } from '../../src/board/band';
import { buildOverlay } from '../../src/model/run';
import { makeNode } from '../shared/graphs';
import { normativeProposal } from '../shared/runs';

const GOAL = 'cynder-not-good';
const DARK = 'cynder-dark-past';
const PG = 'new-spyro-pg';
const RULE = 'pg-no-dark-past';

function ctxOf(graph: TlGraph, extra: Partial<BandContext> = {}): BandContext {
  return { nodes: Object.fromEntries(graph.nodes.map((n) => [n.id, n])), edges: graph.edges, vocab: new Map(graph.vocabulary.map((v) => [v.name, v])), ...extra };
}

/** The proved sample with the goal changed by `patch` (its status merged). */
function provedWith(patch: (goal: TlNode) => TlNode, more: TlNode[] = []): TlGraph {
  const graph = spyroProvedGraph();
  return { ...graph, nodes: [...graph.nodes.map((n) => (n.id === GOAL ? patch(n) : n)), ...more] };
}

const goalOf = (graph: TlGraph) => graph.nodes.find((n) => n.id === GOAL) as TlNode;

describe('which arrows form a card’s band', () => {
  it('the proved goal: its three drawn arrows, all used directly by the proof: complete, with the presuppositions named', () => {
    const graph = spyroProvedGraph();
    const band = bandOf(goalOf(graph), ctxOf(graph));
    expect(band).toEqual({
      target: GOAL,
      arrows: [`${DARK}->${GOAL}`, `${PG}->${GOAL}`, `${RULE}->${GOAL}`],
      onMark: false,
      complete: true,
      outside: [],
      title: `${BAND_COMPLETE_TITLE}\nalso presupposes: Character.exists, Game.exists`,
    });
    expect(bandsOf(ctxOf(graph)).map((b) => b.target)).toEqual([GOAL]);
  });

  it('a card the proof uses without an arrow: the band binds the others and is open, naming it', () => {
    const graph = provedWith((goal) => ({ ...goal, premises: [DARK, PG] }));
    const band = bandOf(goalOf(graph), ctxOf(graph));
    expect(band?.arrows).toEqual([`${DARK}->${GOAL}`, `${PG}->${GOAL}`]);
    expect(band?.complete).toBe(false);
    expect(band?.outside).toEqual([`also uses ${bandName(RULE, ctxOf(graph).nodes)} (no arrow)`]);
    expect(bandName(RULE, ctxOf(graph).nodes)).toBe('“PG games cannot have characters with da…”');
    expect(band?.title.split('\n')[0]).toBe(`Open band (no ✓): also uses “PG games cannot have characters with da…” (no arrow) · consistency unchecked`);
  });

  it('a drawn arrow the proof does not use stays outside the band', () => {
    const extra = makeNode('extra', 'AXIOM', 'An extra axiom', { proof: { kind: 'assumed' } });
    const graph = provedWith((goal) => ({ ...goal, premises: [...goal.premises, 'extra'] }), [extra]);
    const band = bandOf(goalOf(graph), ctxOf(graph));
    expect(band?.arrows).not.toContain(`extra->${GOAL}`);
    expect(band?.complete).toBe(true);
  });

  it('a conditional proof: the hollow-head arrows are inside the open band, "given …"', () => {
    const graph = provedWith((goal) => ({
      ...goal,
      status: { ...goal.status, flags: [], proof: { kind: 'conditional', on: [RULE], footprint: [DARK, PG] }, direct: { ids: [DARK, PG], from: 'proof' } },
    }));
    const band = bandOf(goalOf(graph), ctxOf(graph));
    expect(band?.arrows).toEqual([`${DARK}->${GOAL}`, `${PG}->${GOAL}`, `${RULE}->${GOAL}`]);
    expect(band?.complete).toBe(false);
    expect(band?.outside).toEqual(['given “PG games cannot have characters with da…” (not proved)']);
  });

  it('a hidden assumption, a use the arrows do not show, or direct(v) from the source text only: open, each named', () => {
    const hidden = provedWith((goal) => ({ ...goal, status: { ...goal.status, flags: [], proof: { kind: 'proved', footprint: [DARK, PG, RULE, 'axiom:Spyro.hidden'] } } }));
    expect(bandOf(goalOf(hidden), ctxOf(hidden))?.outside).toEqual(['a hidden assumption']);
    const unseen = provedWith((goal) => ({ ...goal, status: { ...goal.status, flags: ['uses-unseen'], direct: { ids: [DARK, PG], from: 'proof', unseen: [RULE] } } }));
    expect(bandOf(goalOf(unseen), ctxOf(unseen))?.outside).toEqual(['uses “PG games cannot have characters with da…” in a way the arrows do not show']);
    // The arrow from RULE is drawn but not in direct(v) here: outside the band.
    expect(bandOf(goalOf(unseen), ctxOf(unseen))?.arrows).toEqual([`${DARK}->${GOAL}`, `${PG}->${GOAL}`]);
    const source = provedWith((goal) => ({ ...goal, status: { ...goal.status, direct: { ids: [RULE, PG, DARK], from: 'source' } } }));
    expect(bandOf(goalOf(source), ctxOf(source))).toMatchObject({ complete: false, outside: ['computed from the source text only'] });
    // A graph from before slice 1d has no `direct`: the solid arrows stand for it, and the band cannot be certified.
    const old = provedWith((goal) => {
      const { direct: _gone, ...status } = goal.status;
      return { ...goal, status };
    });
    expect(directOf(goalOf(old), old.edges).sort()).toEqual([DARK, PG, RULE].sort());
    expect(bandOf(goalOf(old), ctxOf(old))).toMatchObject({ complete: false, outside: ['computed from the source text only'], arrows: [`${DARK}->${GOAL}`, `${PG}->${GOAL}`, `${RULE}->${GOAL}`] });
  });

  it('a .holds that states something else (TL114), the card’s own or a used card’s: open, each named', () => {
    // The arrow from DARK stands for DARK's statement, but Lean checked the goal from what DARK's .holds states.
    const graph = spyroProvedGraph();
    const usedMismatch = { ...graph, nodes: graph.nodes.map((n) => (n.id === DARK ? { ...n, status: { ...n.status, flags: ['holds-mismatch' as const] } } : n)) };
    const band = bandOf(goalOf(usedMismatch), ctxOf(usedMismatch));
    expect(band).toMatchObject({ complete: false, outside: ['the .holds of “Cynder is a character who has a dark pa…” states something else (TL114)'] });
    expect(band?.arrows).toEqual([`${DARK}->${GOAL}`, `${PG}->${GOAL}`, `${RULE}->${GOAL}`]);
    expect(band?.title.split('\n')[0]).toBe('Open band (no ✓): the .holds of “Cynder is a character who has a dark pa…” states something else (TL114) · consistency unchecked');
    const own = provedWith((goal) => ({ ...goal, status: { ...goal.status, flags: ['holds-mismatch'] } }));
    expect(bandOf(goalOf(own), ctxOf(own))).toMatchObject({ complete: false, outside: ['its own .holds states something else (TL114)'] });
  });

  it('names the definitions its statement relies on', () => {
    const definition: VocabItem = { name: 'Spyro.InGame', shortName: 'InGame', subject: 'Spyro', kind: 'definition', usedBy: [GOAL], flags: [] };
    const graph = provedWith((goal) => ({ ...goal, lean: { ...goal.lean, uses: [...(goal.lean.uses ?? []), 'Spyro.InGame'] } }));
    const ctx = { ...ctxOf(graph), vocab: new Map([...(ctxOf(graph).vocab ?? new Map<string, VocabItem>()), ['Spyro.InGame', definition]]) };
    expect(bandOf(goalOf(graph), ctx)?.title.split('\n')).toEqual([BAND_COMPLETE_TITLE, 'also by definition: InGame', 'also presupposes: Character.exists, Game.exists']);
  });
});

describe('cards without a band', () => {
  it('none for an unproved card, an axiom, or a pending one', () => {
    const graph = spyroGraph();
    expect(bandsOf(ctxOf(graph))).toEqual([]);
    const pending = makeNode('p', 'PROPOSITION', 'Pending', { proof: { kind: 'pending' } }, { premises: [DARK] });
    const provedAxiom = makeNode('ax', 'AXIOM', 'An axiom with a proof', { proof: { kind: 'proved', footprint: [] }, direct: { ids: [], from: 'proof' } });
    const ctx = ctxOf({ ...graph, nodes: [...graph.nodes, pending, provedAxiom] });
    expect(bandOf(pending, ctx)).toBeNull();
    expect(bandOf(provedAxiom, ctx)).toBeNull();
  });

  it('none from out-of-date facts: the card, or a card its proof uses directly, changed since the last check', () => {
    const stale = provedWith((goal) => ({ ...goal, status: { ...goal.status, flags: ['stale'] } }));
    expect(bandOf(goalOf(stale), ctxOf(stale))).toBeNull();
    const graph = spyroProvedGraph();
    const usedStale = { ...graph, nodes: graph.nodes.map((n) => (n.id === DARK ? { ...n, status: { ...n.status, flags: ['stale' as const] } } : n)) };
    expect(bandOf(goalOf(usedStale), ctxOf(usedStale))).toBeNull();
    const unchecked = provedWith((goal) => ({ ...goal, status: { ...goal.status, flags: ['not-checked'] } }));
    expect(bandOf(goalOf(unchecked), ctxOf(unchecked))).toBeNull();
  });
});

describe('proved from nothing (no card in the footprint)', () => {
  const fromNothing = (mark: boolean) =>
    makeNode(
      'fn',
      'PROPOSITION',
      'Spyro games are games',
      { formal: 'formalized', proof: { kind: 'proved', footprint: [] }, flags: ['established', 'self-evident'], direct: { ids: [], from: 'proof' } },
      mark ? { fromNothing: true } : {},
    );

  it('with the "follows from nothing" mark: the band sits on its ∅ stub (complete)', () => {
    const node = fromNothing(true);
    expect(bandOf(node, { nodes: { fn: node }, edges: [] })).toEqual({ target: 'fn', arrows: [], onMark: true, complete: true, outside: [], title: BAND_COMPLETE_TITLE });
  });

  it('without the mark: no band (the card shows "proved from nothing" instead)', () => {
    const node = fromNothing(false);
    expect(bandOf(node, { nodes: { fn: node }, edges: [] })).toBeNull();
  });

  it('with the mark and a card used without an arrow: an open band on the stub', () => {
    const node = { ...fromNothing(true), status: { ...fromNothing(true).status, direct: { ids: [DARK], from: 'proof' as const } } };
    const graph = spyroProvedGraph();
    const ctx = ctxOf({ ...graph, nodes: [...graph.nodes, node] });
    expect(bandOf(node, ctx)).toMatchObject({ onMark: true, complete: false, outside: ['also uses “Cynder is a character who has a dark pa…” (no arrow)'] });
  });
});

describe('the Proposed view (D-19, RV-6)', () => {
  it('the band of a card whose result is hidden is not drawn until the result is revealed', () => {
    const proposal = normativeProposal();
    const current = spyroGraph();
    const nodes = Object.fromEntries(current.nodes.map((n) => [n.id, n]));
    const hidden = buildOverlay(proposal, { nodes, vocabulary: current.vocabulary }, true);
    expect(hidden.hidden.has(GOAL)).toBe(true);
    expect(bandsOf({ nodes: hidden.nodes, edges: hidden.edges, vocab: hidden.vocab, hidden: hidden.hidden })).toEqual([]);
    const revealed = buildOverlay(proposal, { nodes, vocabulary: current.vocabulary }, false);
    expect(bandsOf({ nodes: revealed.nodes, edges: revealed.edges, vocab: revealed.vocab, hidden: revealed.hidden }).map((b) => [b.target, b.complete])).toEqual([[GOAL, true]]);
  });
});
