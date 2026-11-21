/**
 * Slice 1a fixer: `upgradeLegacyProposal` reads a proposal that a build before spec v4 saved in run.json (a run still in
 * review when telelean is updated) in the two kinds, so the board's proposed view never meets an unknown kind.
 */
import { describe, expect, it } from 'vitest';
import { columnOrder } from '../../src/graph.js';
import type { TlGraph } from '../../src/model.js';
import { upgradeLegacyProposal, type ProposalView } from '../../src/run.js';
import { spyroProvedGraph } from '../../src/samples/spyro.js';

/** Only the graph (and a `lifecycle` key) matter to the upgrade. */
const view = (graph: TlGraph, extra: Record<string, unknown> = {}) => ({ graph, ...extra }) as unknown as ProposalView;

/** The proved Spyro board as a build before spec v4 saved it (types, statuses and diagnostics as plain JSON). */
function legacyGraph(): TlGraph {
  const graph = JSON.parse(JSON.stringify(spyroProvedGraph())) as { nodes: Array<Record<string, unknown> & { id: string; status: Record<string, unknown> }>; diagnostics: unknown[] };
  const node = (id: string) => {
    const found = graph.nodes.find((n) => n.id === id);
    if (!found) throw new Error(`no node ${id}`);
    return found;
  };
  node('cynder-dark-past').type = 'ASSUMPTION';
  Object.assign(node('new-spyro-pg'), { type: 'DERIVATION', status: { ...node('new-spyro-pg').status, proof: { kind: 'pending-promotion' }, flags: ['claimed'] } });
  Object.assign(node('pg-no-dark-past'), { type: 'GOAL', status: { ...node('pg-no-dark-past').status, proof: { kind: 'assumed' }, flags: [] } });
  const target = node('cynder-not-good');
  Object.assign(target, { type: 'GOAL', status: { ...target.status, flags: ['proved-goal', 'rests-on-claimed', 'rests-on-claimed'] } });
  graph.diagnostics = [
    { code: 'TL105', severity: 'info', message: 'This goal is already proved: make it a Derivation?', nodeId: 'cynder-not-good' },
    { code: 'TL116', severity: 'warning', message: 'This goal is asserted as an axiom (Spyro.pg_no_dark_past.holds): make it an Assumption?', nodeId: 'pg-no-dark-past' },
    { code: 'TL102', severity: 'warning', message: 'The proof rests on a goal asserted as an axiom: pg-no-dark-past.', nodeId: 'cynder-not-good' },
    { code: 'TL102', severity: 'warning', message: 'The proof is conditional on unproved cards: x.', nodeId: 'cynder-not-good' },
  ];
  return graph as unknown as TlGraph;
}

describe('upgradeLegacyProposal (a run.json proposal saved before spec v4)', () => {
  it('leaves a proposal of this build exactly as it is', () => {
    const graph = spyroProvedGraph();
    const before = JSON.stringify(graph);
    expect(upgradeLegacyProposal(view(graph))).toBe(false);
    expect(JSON.stringify(graph)).toBe(before);
  });

  it('reads the old kinds, pending proofs, flags and diagnostics in v4 terms, drops the lifecycle items, and is idempotent', () => {
    const proposal = view(legacyGraph(), { lifecycle: [{ id: 'l1', kind: 'change-kind', nodeId: 'cynder-not-good', from: 'GOAL', to: 'DERIVATION' }] });
    expect(upgradeLegacyProposal(proposal)).toBe(true);
    expect(proposal).not.toHaveProperty('lifecycle');
    const byId = Object.fromEntries(proposal.graph.nodes.map((n) => [n.id, n]));
    expect(Object.fromEntries(proposal.graph.nodes.map((n) => [n.id, n.type]))).toEqual({
      'cynder-dark-past': 'AXIOM',
      'new-spyro-pg': 'PROPOSITION',
      'pg-no-dark-past': 'PROPOSITION',
      'cynder-not-good': 'PROPOSITION',
    });
    expect(byId['new-spyro-pg']?.status).toMatchObject({ proof: { kind: 'pending' }, flags: [] });
    expect(byId['pg-no-dark-past']?.status).toMatchObject({ proof: { kind: 'pending' }, flags: [] });
    expect(byId['cynder-dark-past']?.status.proof.kind).toBe('assumed');
    // proved-goal gone, rests-on-claimed renamed once; the proof rests on the now pending cards.
    expect(byId['cynder-not-good']?.status.proof.kind).toBe('proved');
    expect(byId['cynder-not-good']?.status.flags).toEqual(['rests-on-pending']);
    // Slice 1f (carry-over 3): beside the flag, the TL102 warning a fresh build gives (B.5), at the card's block.
    expect(proposal.graph.diagnostics.map((d) => [d.code, d.message])).toEqual([
      ['TL102', 'The proof is conditional on unproved cards: x.'],
      ['TL102', 'The proof rests on pending: new-spyro-pg, pg-no-dark-past.'],
    ]);
    expect(proposal.graph.diagnostics[1]).toEqual({
      code: 'TL102',
      severity: 'warning',
      message: 'The proof rests on pending: new-spyro-pg, pg-no-dark-past.',
      file: byId['cynder-not-good']?.loc?.file,
      range: byId['cynder-not-good']?.loc?.range,
      nodeId: 'cynder-not-good',
    });
    const order = columnOrder(proposal.graph.nodes);
    expect(order.AXIOM).toEqual(['cynder-dark-past']);
    expect([...order.PROPOSITION].sort()).toEqual(['cynder-not-good', 'new-spyro-pg', 'pg-no-dark-past']);
    const once = JSON.stringify(proposal);
    expect(upgradeLegacyProposal(proposal)).toBe(false);
    expect(JSON.stringify(proposal)).toBe(once);
  });

  it('a proof resting on an old GOAL asserted as an axiom (TL102 before v4) now carries rests-on-pending, and its TL102', () => {
    const graph = legacyGraph();
    const target = graph.nodes.find((n) => n.id === 'cynder-not-good');
    if (!target) throw new Error('no target');
    target.status.flags = [];
    expect(upgradeLegacyProposal(view(graph))).toBe(true);
    expect(target.status.flags).toEqual(['rests-on-pending']);
    expect(graph.diagnostics.filter((d) => d.nodeId === 'cynder-not-good' && d.message.startsWith('The proof rests on pending'))).toEqual([
      { code: 'TL102', severity: 'warning', message: 'The proof rests on pending: new-spyro-pg, pg-no-dark-past.', file: target.loc?.file, range: target.loc?.range, nodeId: 'cynder-not-good' },
    ]);
  });

  it('slice 1f carry-over 3: a proposal that has rests-on-pending but no TL102 gets it once; one that has it keeps it as it is', () => {
    // Saved after slice 1a and before 1b added the warning: the v4 kinds and flag, no TL102.
    const graph = spyroProvedGraph();
    const premise = graph.nodes.find((n) => n.id === 'new-spyro-pg');
    const target = graph.nodes.find((n) => n.id === 'cynder-not-good');
    if (!premise || !target) throw new Error('no such cards');
    premise.type = 'PROPOSITION';
    premise.status = { ...premise.status, proof: { kind: 'pending' }, flags: [] };
    target.status = { ...target.status, flags: ['rests-on-pending'] };
    expect(upgradeLegacyProposal(view(graph))).toBe(true);
    expect(target.status.flags).toEqual(['rests-on-pending']);
    const warnings = graph.diagnostics.filter((d) => d.code === 'TL102');
    expect(warnings.map((d) => [d.nodeId, d.message])).toEqual([['cynder-not-good', 'The proof rests on pending: new-spyro-pg.']]);
    // Idempotent: a second upgrade (or a proposal of this build, which has the warning) changes nothing.
    const once = JSON.stringify(graph);
    expect(upgradeLegacyProposal(view(graph))).toBe(false);
    expect(JSON.stringify(graph)).toBe(once);
  });

  it('columnOrder skips a node of no known kind instead of throwing (a proposal that was not upgraded)', () => {
    const graph = legacyGraph();
    expect(() => columnOrder(graph.nodes)).not.toThrow();
    expect(columnOrder(graph.nodes).AXIOM).toEqual([]);
  });
});
