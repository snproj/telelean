import { spyroGraph, spyroProvedGraph } from '@telelean/core';
import { describe, expect, it } from 'vitest';
import { MARKER_VARIANTS, markerVariant } from '../../src/board/EdgeEngine';
import { arrowLook, edgeClass, hasFocusEdges, NOT_USED_TITLE, toDisplayEdges, type ArrowState, type DisplayEdge } from '../../src/board/edges';
import { edgeKindsGraph } from '../shared/graphs';

describe('toDisplayEdges', () => {
  it('draws one arrow per pair: solid once verified, dashed while only declared', () => {
    expect(toDisplayEdges(spyroGraph().edges).map((e) => e.pattern)).toEqual(['declared', 'declared', 'declared']);
    const proved = toDisplayEdges(spyroProvedGraph().edges);
    expect(proved).toHaveLength(3);
    expect(proved.every((e) => e.pattern === 'verified' && e.declared && e.verified && !e.conditional && !e.mismatch)).toBe(true);
  });

  it('marks conditional and mismatch arrows (with tooltips) and draws lean-ref arrows only while an end has focus', () => {
    const edges = edgeKindsGraph().edges;
    expect(hasFocusEdges(edges)).toBe(true);
    const plain = toDisplayEdges(edges);
    const byId = Object.fromEntries(plain.map((e) => [e.id, e]));
    expect(byId['pg-no-dark-past->d-hyp']).toMatchObject({ pattern: 'verified', conditional: true, title: 'Taken as a hypothesis: the proof is conditional on it' });
    // Spec v4 BD-5 (slice 1d): TL109 (declared, unused by the proof) is plain dotted, not in the warning colour.
    expect(byId['new-spyro-pg->d-hyp']).toMatchObject({ pattern: 'declared', title: 'Not used by the current proof' });
    expect(byId['new-spyro-pg->d-hyp']?.mismatch).toBeUndefined();
    expect(arrowLook(byId['new-spyro-pg->d-hyp'] as DisplayEdge)).toEqual({ line: 'dotted', head: 'filled', warning: false });
    // TL107 (used, not drawn) keeps the warning colour and its tooltip.
    expect(byId['cynder-dark-past->d-hyp']).toMatchObject({ pattern: 'verified', mismatch: 'used-undeclared', title: 'The proof uses it, but no arrow is drawn from it (TL107)' });
    expect(arrowLook(byId['cynder-dark-past->d-hyp'] as DisplayEdge)).toEqual({ line: 'solid', head: 'filled', warning: true });
    expect(plain.some((e) => e.pattern === 'reference')).toBe(false);

    const focused = toDisplayEdges(edges, new Set(['cynder-not-good']));
    expect(focused.find((e) => e.pattern === 'reference')).toMatchObject({ id: 'ref:d-hyp->cynder-not-good', source: 'd-hyp', target: 'cynder-not-good' });
    expect(toDisplayEdges(edges, new Set(['d-hyp'])).some((e) => e.pattern === 'reference')).toBe(true);
    expect(toDisplayEdges(edges, new Set(['new-spyro-pg'])).some((e) => e.pattern === 'reference')).toBe(false);
    expect(hasFocusEdges(spyroGraph().edges)).toBe(false);
  });

  it('a lean-ref arrow is not drawn over an existing arrow between the same cards', () => {
    const base = spyroGraph().edges;
    const edges = [...base, { id: 'lean-ref:cynder-dark-past->cynder-not-good', type: 'lean-ref' as const, source: 'cynder-dark-past', target: 'cynder-not-good', origin: 'lean' as const }];
    expect(toDisplayEdges(edges, new Set(['cynder-not-good']))).toHaveLength(3);
  });

  it('chooses arrowheads: conditional keeps its hollow head and TL107 its notched one when focused, focus wins otherwise', () => {
    const spec = { id: 'a->b', source: 'a', target: 'b' };
    expect(markerVariant({ ...spec, pattern: 'verified', conditional: true }, false)).toBe('conditional');
    expect(markerVariant({ ...spec, pattern: 'verified', conditional: true }, true)).toBe('conditional-focus');
    expect(markerVariant({ ...spec, pattern: 'verified', mismatch: 'used-undeclared' }, false)).toBe('mismatch');
    // 1d fixer: the notched head stays while the arrow is inspected (never colour alone), in the focus colour.
    expect(markerVariant({ ...spec, pattern: 'verified', mismatch: 'used-undeclared' }, true)).toBe('mismatch-focus');
    expect(markerVariant({ ...spec, pattern: 'declared', mismatch: 'declared-unused' }, false)).toBe('declared');
    expect(markerVariant({ ...spec, pattern: 'verified' }, true)).toBe('focus');
    expect(markerVariant({ ...spec, pattern: 'reference' }, false)).toBe('reference');
    for (const edge of [{ pattern: 'declared' as const }, { pattern: 'verified' as const, mismatch: 'used-undeclared' as const }, { pattern: 'verified' as const, conditional: true }]) {
      for (const focused of [false, true]) expect(MARKER_VARIANTS).toContain(markerVariant(edge, focused));
    }
  });
});

describe('arrow looks (spec v4 BD-5, slice 1d)', () => {
  it('dotted while only drawn, solid once a proof uses it, hollow head when it is a hypothesis; only TL107 warns', () => {
    const look = (pattern: 'declared' | 'verified' | 'reference', extra: Partial<DisplayEdge> = {}) => arrowLook({ pattern, ...extra });
    expect(look('declared')).toEqual({ line: 'dotted', head: 'filled', warning: false });
    expect(look('verified')).toEqual({ line: 'solid', head: 'filled', warning: false });
    expect(look('verified', { conditional: true })).toEqual({ line: 'solid', head: 'hollow', warning: false });
    expect(look('verified', { mismatch: 'used-undeclared' })).toEqual({ line: 'solid', head: 'filled', warning: true });
    expect(look('declared', { mismatch: 'declared-unused' })).toEqual({ line: 'dotted', head: 'filled', warning: false });
    expect(look('reference').line).toBe('thin');
  });

  it('the class the engine draws an arrow with follows its look (1d fixer: EdgeEngine.writePaths uses edgeClass)', () => {
    const still: ArrowState = { stub: false, focused: false, selected: false, hovered: false };
    const edges = Object.fromEntries(toDisplayEdges(edgeKindsGraph().edges).map((e) => [e.id, e]));
    // TL109 (drawn, unused): round dots, no warning colour. TL107 (used, not drawn): solid, the warning colour.
    expect(edgeClass(edges['new-spyro-pg->d-hyp'] as DisplayEdge, still)).toBe('tl-edge tl-edge--declared');
    expect(edgeClass(edges['cynder-dark-past->d-hyp'] as DisplayEdge, still)).toBe('tl-edge tl-edge--verified tl-edge--mismatch');
    expect(edgeClass(edges['pg-no-dark-past->d-hyp'] as DisplayEdge, still)).toBe('tl-edge tl-edge--verified tl-edge--conditional');
    expect(edgeClass({ pattern: 'reference' }, still)).toBe('tl-edge tl-edge--reference');
    // Only a proof's use without an arrow is a warning, whatever mismatch a spec carries.
    expect(edgeClass({ pattern: 'declared', mismatch: 'declared-unused' }, still)).toBe('tl-edge tl-edge--declared');
    expect(edgeClass({ pattern: 'verified' }, { stub: true, focused: true, selected: true, hovered: true })).toBe(
      'tl-edge tl-edge--verified tl-edge--stub tl-edge--focus tl-edge--selected tl-edge--hover',
    );
  });

  it('a drawn arrow into a proved card that its proof does not use directly: "Not used by the current proof", unless the result is hidden', () => {
    const graph = spyroProvedGraph();
    const nodes = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));
    // The goal's proof uses its three arrows directly; drop one verified edge (as if it were used only through another card).
    const edges = graph.edges.filter((e) => e.id !== 'verified:pg-no-dark-past->cynder-not-good');
    const shown = toDisplayEdges(edges, new Set(), { nodes });
    expect(shown.find((e) => e.id === 'pg-no-dark-past->cynder-not-good')).toMatchObject({ pattern: 'declared', title: NOT_USED_TITLE });
    expect(shown.find((e) => e.id === 'pg-no-dark-past->cynder-not-good')?.mismatch).toBeUndefined();
    const hidden = toDisplayEdges(edges, new Set(), { nodes, hidden: new Set(['cynder-not-good']) });
    expect(hidden.find((e) => e.id === 'pg-no-dark-past->cynder-not-good')?.title).toBeUndefined();
    // An unproved card's arrows say nothing about a proof.
    expect(toDisplayEdges(spyroGraph().edges, new Set(), { nodes: Object.fromEntries(spyroGraph().nodes.map((n) => [n.id, n])) }).every((e) => e.title === undefined)).toBe(true);
  });
});

