/**
 * Graph variants for the webview's tests, built from the frozen Spyro samples (core's samples carry the M1 card
 * data; other statuses are derived here).
 */
import {
  edgeId,
  spyroGraph,
  spyroProvedGraph,
  type BoardDiagnostic,
  type DerivedStatus,
  type HistoryListing,
  type SemanticSummary,
  type TlEdge,
  type TlGraph,
  type TlNode,
  type WorkspaceState,
} from '@telelean/core';

export function mapNode(graph: TlGraph, id: string, patch: (node: TlNode) => TlNode): TlGraph {
  return { ...graph, nodes: graph.nodes.map((n) => (n.id === id ? patch(n) : n)) };
}

export function withStatus(node: TlNode, status: Partial<DerivedStatus>): TlNode {
  return { ...node, status: { ...node.status, ...status } };
}

export function withSemantic(graph: TlGraph, semantic: SemanticSummary, version = graph.version): TlGraph {
  return { ...graph, semantic, version };
}

/** A minimal formalised node (statement abbrev) for status tests. */
export function makeNode(id: string, type: TlNode['type'], naturalName: string, status: Partial<DerivedStatus>, extra: Partial<TlNode> = {}): TlNode {
  const lean = id.replace(/-/g, '_');
  return {
    id,
    type,
    role: 'node',
    subject: 'Spyro',
    naturalName,
    premises: [],
    provenance: { wordedBy: 'user', endorsed: true, origin: 'user' },
    ext: {},
    lean: { binding: 'pinned', statement: `Spyro.${lean}`, code: `abbrev ${lean} : Prop := True` },
    status: { formal: 'formalized', proof: { kind: 'none' }, certificates: { consistency: 'none', nonVacuity: 'none' }, flags: [], ...status },
    ...extra,
  };
}

/**
 * Every ProofStatus kind and the M1 flags on one board (Spyro's vocabulary and four nodes, plus status nodes), with
 * diagnostics for the attention badge and an AXIOM whose `premises:` line was written before v4 (A19). As the host
 * sends it: its `premises` drive the "declared before v4" chip and "Drop these arrows", but no edge is sent for them
 * (core's subjectGraph leaves out arrows into an axiom), so none is drawn.
 */
export function statusGallery(version = 5): TlGraph {
  const base = spyroProvedGraph(version);
  const extra: TlNode[] = [
    makeNode('d-pending', 'PROPOSITION', 'Cynder is not PG material', { proof: { kind: 'pending' } }, { lean: { binding: 'pinned', statement: 'Spyro.d_pending', justification: 'Spyro.d_pending.holds', justificationKind: 'axiom', code: 'abbrev d_pending : Prop := True\naxiom d_pending.holds : d_pending' } }),
    makeNode('d-conditional', 'PROPOSITION', 'Spyro games avoid dark characters', { proof: { kind: 'conditional', on: ['d-pending'], footprint: ['cynder-dark-past'] } }),
    makeNode('g-sorry', 'PROPOSITION', 'The sequel will be rated PG', { flags: ['uses-sorry'] }),
    makeNode('g-unchecked', 'PROPOSITION', 'Fans will accept the change', { flags: ['not-checked'] }),
    makeNode('a-stale', 'AXIOM', 'Critics notice ratings', { proof: { kind: 'assumed' }, flags: ['stale'] }),
    makeNode('a-missing', 'AXIOM', 'Ratings are public', { flags: ['missing-holds'] }),
    makeNode('a-premised', 'AXIOM', 'Ratings follow content', { proof: { kind: 'assumed' } }, { premises: ['cynder-dark-past'] }),
  ];
  const nodes = [...base.nodes, ...extra];
  const diagnostics: BoardDiagnostic[] = [
    { code: 'TL115', severity: 'warning', message: 'declaration uses sorry', nodeId: 'g-sorry', file: 'Model/Spyro/Main.lean', range: { start: { line: 60, character: 0 }, end: { line: 60, character: 0 } } },
    { code: 'LEAN', severity: 'error', message: 'unknown identifier', nodeId: 'g-sorry', file: 'Model/Spyro/Main.lean', range: { start: { line: 61, character: 2 }, end: { line: 61, character: 2 } } },
    { code: 'TL011', severity: 'info', message: 'AXIOM without rationale', nodeId: 'a-missing' },
    { code: 'TL117', severity: 'warning', message: 'axiom without .holds', nodeId: 'a-missing' },
  ];
  return { ...base, nodes, edges: base.edges, diagnostics };
}

/**
 * The proved Spyro board plus the M1 edge kinds the samples do not have, around a proposition d-hyp whose proof is
 * conditional on pg-no-dark-past:
 *  - pg-no-dark-past -> d-hyp: verified, conditional (taken as a hypothesis);
 *  - new-spyro-pg -> d-hyp: declared but unused by the proof (mismatch, dashed);
 *  - cynder-dark-past -> d-hyp: used by the proof but not declared (mismatch, solid);
 *  - d-hyp -> cynder-not-good: lean-ref (the goal's statement mentions d-hyp's statement).
 */
export function edgeKindsGraph(version = 6): TlGraph {
  const base = spyroProvedGraph(version);
  const extra = makeNode('d-hyp', 'PROPOSITION', 'A PG game has no dark-past characters', { proof: { kind: 'conditional', on: ['pg-no-dark-past'] } }, { premises: ['new-spyro-pg'] });
  const edges: TlEdge[] = [
    ...base.edges,
    { id: edgeId('premise', 'new-spyro-pg', 'd-hyp'), type: 'premise', source: 'new-spyro-pg', target: 'd-hyp', origin: 'declared', mismatch: 'declared-unused' },
    { id: edgeId('verified', 'pg-no-dark-past', 'd-hyp'), type: 'verified', source: 'pg-no-dark-past', target: 'd-hyp', origin: 'lean', where: 'proof', conditional: true },
    { id: edgeId('verified', 'cynder-dark-past', 'd-hyp'), type: 'verified', source: 'cynder-dark-past', target: 'd-hyp', origin: 'lean', where: 'proof', mismatch: 'used-undeclared' },
    { id: edgeId('lean-ref', 'd-hyp', 'cynder-not-good'), type: 'lean-ref', source: 'd-hyp', target: 'cynder-not-good', origin: 'lean', where: 'statement' },
  ];
  return { ...base, nodes: [...base.nodes, extra], edges };
}

/**
 * spyroGraph plus d1, a proposition proved conditionally (its `theorem d1.holds` takes the hypothesis
 * `h_cynder_dark_past`), and g1, a proposition whose proof applies `d1.holds`: P->A of d1 makes `.holds` an axiom
 * without the hypothesis, so g1 must drop the argument (core's needs-confirmation for P->A).
 */
export function conditionalGraph(version = 1): TlGraph {
  const base = spyroGraph(version);
  const d1 = makeNode(
    'd1',
    'PROPOSITION',
    'Cynder is too dark for a PG game',
    { proof: { kind: 'conditional', on: ['cynder-dark-past'] } },
    {
      lean: {
        binding: 'pinned',
        statement: 'Spyro.d1',
        justification: 'Spyro.d1.holds',
        justificationKind: 'theorem',
        code: 'abbrev d1 : Prop := True\ntheorem d1.holds (h_cynder_dark_past : cynder_dark_past) : d1 := trivial',
      },
    },
  );
  const g1 = makeNode('g1', 'PROPOSITION', 'Cynder stays out of the game', { proof: { kind: 'conditional', on: ['cynder-dark-past'] } });
  const edges: TlEdge[] = [...base.edges, { id: edgeId('verified', 'd1', 'g1'), type: 'verified', source: 'd1', target: 'g1', origin: 'lean', where: 'proof' }];
  return { ...base, nodes: [...base.nodes, d1, g1], edges };
}

/** spyroGraph with a lean-ref edge: the goal's statement mentions cynder-dark-past's statement. */
export function mentionGraph(version = 7): TlGraph {
  const base = spyroGraph(version);
  return {
    ...base,
    edges: [...base.edges, { id: edgeId('lean-ref', 'cynder-dark-past', 'cynder-not-good'), type: 'lean-ref', source: 'cynder-dark-past', target: 'cynder-not-good', origin: 'lean', where: 'statement' }],
  };
}

export function workspaceState(patch: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    rootName: 'mental_model',
    subjects: [
      { name: 'Spyro', nodeCount: 4 },
      { name: 'Bayonetta', nodeCount: 2 },
    ],
    subject: 'Spyro',
    undo: 'Add assumption: Cynder is a character who has a dark past',
    redo: null,
    history: { state: 'ready' },
    ...patch,
  };
}

export function historyListing(subject = 'Spyro'): HistoryListing {
  return {
    subject,
    entries: [
      { id: 'c0ffee1', time: '2026-11-01T09:30:00.000Z', action: 'set-premises', label: 'These suffice: Cynder would not be a good addition… ← 3 premises', subject, nodes: ['cynder-not-good'] },
      { id: 'b0ffee2', time: '2026-11-01T09:20:00.000Z', action: 'add-node', label: 'Add assumption: The new Spyro game is PG', subject, nodes: ['new-spyro-pg'] },
      { id: 'a0ffee3', time: '2026-10-31T18:05:00.000Z', action: 'initial', label: 'Initial state', subject, nodes: [] },
    ],
    storage: { subjectBytes: 12 * 1024, totalBytes: 30 * 1024, perSubject: { Spyro: 12 * 1024, Bayonetta: 18 * 1024 } },
    more: false,
  };
}
