import { describe, expect, it } from 'vitest';
import {
  columnOrder,
  largeGraph,
  spyroGraph,
  spyroProvedGraph,
  validateGraph,
  type TlGraph,
} from '../src/index.js';

const byId = (graph: TlGraph, id: string) => {
  const node = graph.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`missing node ${id}`);
  return node;
};

describe('spyroGraph (03 section 3.3)', () => {
  const graph = spyroGraph();

  it('has the four walkthrough nodes in the right columns', () => {
    expect(columnOrder(graph.nodes)).toEqual({
      ASSUMPTION: ['pg-no-dark-past', 'cynder-dark-past', 'new-spyro-pg'],
      DERIVATION: [],
      GOAL: ['cynder-not-good'],
    });
    expect(validateGraph(graph)).toEqual([]);
  });

  it('marks pg-no-dark-past code-less and the others formalised', () => {
    expect(byId(graph, 'pg-no-dark-past').status.formal).toBe('informal');
    expect(byId(graph, 'pg-no-dark-past').lean.code).toBeUndefined();
    for (const id of ['cynder-dark-past', 'new-spyro-pg', 'cynder-not-good']) {
      expect(byId(graph, id).status.formal).toBe('formalized');
    }
    expect(byId(graph, 'cynder-dark-past').lean.code).toContain('abbrev cynder_dark_past : Prop := HasDarkPast cynder');
    expect(byId(graph, 'cynder-not-good').lean.code).toContain('abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro');
  });

  it('draws three declared premise arrows into the goal and nothing verified', () => {
    expect(graph.edges.map((e) => [e.source, e.target, e.origin])).toEqual([
      ['cynder-dark-past', 'cynder-not-good', 'declared'],
      ['new-spyro-pg', 'cynder-not-good', 'declared'],
      ['pg-no-dark-past', 'cynder-not-good', 'declared'],
    ]);
  });

  it('after the normative run, the proof footprint becomes verified arrows (presuppositions are not nodes)', () => {
    const proved = spyroProvedGraph();
    expect(validateGraph(proved)).toEqual([]);
    const verified = proved.edges.filter((e) => e.type === 'verified').map((e) => e.source);
    expect(verified).toEqual(['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past']);
    expect(byId(proved, 'pg-no-dark-past').status.formal).toBe('formalized');
  });
});

describe('largeGraph', () => {
  it('is deterministic and has about 25 cards per column', () => {
    const a = largeGraph();
    const b = largeGraph();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const order = columnOrder(a.nodes);
    expect(order.ASSUMPTION).toHaveLength(25);
    expect(order.DERIVATION).toHaveLength(25);
    expect(order.GOAL).toHaveLength(25);
    expect(validateGraph(a)).toEqual([]);
  });

  it('contains every edge shape the overlay must draw', () => {
    const graph = largeGraph();
    const typeOf = new Map(graph.nodes.map((n) => [n.id, n.type]));
    const shapes = new Set(graph.edges.map((e) => `${typeOf.get(e.source)}->${typeOf.get(e.target)}`));
    expect(shapes).toContain('ASSUMPTION->DERIVATION');
    expect(shapes).toContain('DERIVATION->GOAL');
    expect(shapes).toContain('ASSUMPTION->GOAL');
    expect(shapes).toContain('DERIVATION->DERIVATION');
    expect(graph.edges.some((e) => e.origin === 'lean')).toBe(true);
    expect(graph.edges.some((e) => e.origin === 'declared')).toBe(true);
    expect(graph.nodes.filter((n) => n.status.formal === 'formalized').length).toBeGreaterThan(10);
  });

  it('honours perColumn', () => {
    expect(columnOrder(largeGraph({ perColumn: 3 }).nodes).GOAL).toHaveLength(3);
  });
});
