import { spyroGraph, spyroProvedGraph } from '@telelean/core';
import { describe, expect, it } from 'vitest';
import { markerVariant } from '../../src/board/EdgeEngine';
import { hasFocusEdges, toDisplayEdges } from '../../src/board/edges';
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
    expect(byId['new-spyro-pg->d-hyp']).toMatchObject({ pattern: 'declared', mismatch: 'declared-unused' });
    expect(byId['new-spyro-pg->d-hyp']?.title).toMatch(/does not use it/);
    expect(byId['cynder-dark-past->d-hyp']).toMatchObject({ pattern: 'verified', mismatch: 'used-undeclared' });
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

  it('chooses arrowheads: conditional keeps its hollow head, focus wins otherwise', () => {
    const spec = { id: 'a->b', source: 'a', target: 'b' };
    expect(markerVariant({ ...spec, pattern: 'verified', conditional: true }, false)).toBe('conditional');
    expect(markerVariant({ ...spec, pattern: 'verified', conditional: true }, true)).toBe('conditional-focus');
    expect(markerVariant({ ...spec, pattern: 'declared', mismatch: 'declared-unused' }, false)).toBe('mismatch');
    expect(markerVariant({ ...spec, pattern: 'declared', mismatch: 'declared-unused' }, true)).toBe('focus');
    expect(markerVariant({ ...spec, pattern: 'reference' }, false)).toBe('reference');
  });
});
