/**
 * M0 graph helpers (edges from premises and footprints, column order, structural checks, ids, comment-only nodes).
 * Owned by WP-model after the M1 freeze (docs/m1-plan.md section 9); signatures are relied on by the webview.
 */
import type { BoardDiagnostic, EdgeType, NodeType, SemanticSummary, TlEdge, TlGraph, TlNode, VocabItem } from './model.js';
import { isNodeType, NODE_TYPES } from './model.js';

/** Prefix of footprint entries that name a Lean presupposition rather than a node (03 section 2). */
export const PRESUPPOSITION_PREFIX = 'presup:';

export function edgeId(type: EdgeType, source: string, target: string): string {
  return `${type}:${source}->${target}`;
}

/** Declared support: one dashed `premise` edge per entry of `premises:`. */
export function declaredEdges(nodes: readonly TlNode[]): TlEdge[] {
  const edges: TlEdge[] = [];
  for (const node of nodes) {
    for (const premise of node.premises) {
      edges.push({
        id: edgeId('premise', premise, node.id),
        type: 'premise',
        source: premise,
        target: node.id,
        origin: 'declared',
      });
    }
  }
  return edges;
}

/**
 * Verified dependencies approximated from footprints: one solid `verified` edge per node in a proved node's
 * footprint. Used by the samples and tests (where proofs use assumptions directly). The M1 graph builder
 * (`subjectGraph`, docs/m1-plan.md section 6.3) computes verified edges from the `.ilean` references of each proof
 * instead, because a footprint only lists axioms: a proposition proved through another proved proposition (a
 * theorem) must get the edge from that proposition, which no footprint mentions.
 */
export function verifiedEdges(nodes: readonly TlNode[]): TlEdge[] {
  const ids = new Set(nodes.map((n) => n.id));
  const edges: TlEdge[] = [];
  for (const node of nodes) {
    if (node.status.proof.kind !== 'proved') continue;
    for (const dep of node.status.proof.footprint) {
      if (dep.startsWith(PRESUPPOSITION_PREFIX) || !ids.has(dep)) continue;
      edges.push({
        id: edgeId('verified', dep, node.id),
        type: 'verified',
        source: dep,
        target: node.id,
        origin: 'lean',
        where: 'proof',
      });
    }
  }
  return edges;
}

export function deriveEdges(nodes: readonly TlNode[]): TlEdge[] {
  return [...declaredEdges(nodes), ...verifiedEdges(nodes)];
}

/** A graph from nodes alone (samples and tests); the M1 graph builder is `subjectGraph` in ./project. */
export function buildGraph(args: {
  subject: string;
  version: number;
  nodes: TlNode[];
  vocabulary?: VocabItem[];
  diagnostics?: BoardDiagnostic[];
  semantic?: SemanticSummary;
}): TlGraph {
  return {
    version: args.version,
    subject: args.subject,
    nodes: args.nodes,
    edges: deriveEdges(args.nodes),
    vocabulary: args.vocabulary ?? [],
    diagnostics: args.diagnostics ?? [],
    semantic: args.semantic ?? { state: 'unavailable' },
  };
}

export function nodesOfType(graph: Pick<TlGraph, 'nodes'>, type: NodeType): TlNode[] {
  return graph.nodes.filter((n) => n.type === type);
}

/**
 * Column order derived from the node array: `{ AXIOM: [...ids], PROPOSITION: [...] }`. A node of no known kind (data
 * from an older build that was not upgraded, e.g. a proposal saved before spec v4) has no column, instead of throwing.
 */
export function columnOrder(nodes: readonly TlNode[]): Record<NodeType, string[]> {
  const order = Object.fromEntries(NODE_TYPES.map((t) => [t, [] as string[]])) as Record<NodeType, string[]>;
  for (const node of nodes) if (isNodeType(node.type)) order[node.type].push(node.id);
  return order;
}

export function isFormalized(node: TlNode): boolean {
  return node.status.formal === 'formalized';
}

export interface GraphProblem {
  code: 'duplicate-id' | 'dangling-premise' | 'self-premise' | 'dangling-edge' | 'premise-cycle';
  message: string;
}

/**
 * Structural checks a graph must pass before the board shows it (the subset of 03 section 3.4
 * TL001-TL009 that concerns the graph rather than the markup text).
 */
export function validateGraph(graph: TlGraph): GraphProblem[] {
  const problems: GraphProblem[] = [];
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (ids.has(node.id)) problems.push({ code: 'duplicate-id', message: `duplicate node id "${node.id}"` });
    ids.add(node.id);
  }
  for (const node of graph.nodes) {
    for (const premise of node.premises) {
      if (premise === node.id) problems.push({ code: 'self-premise', message: `"${node.id}" lists itself as a premise` });
      else if (!ids.has(premise)) {
        problems.push({ code: 'dangling-premise', message: `"${node.id}" lists unknown premise "${premise}"` });
      }
    }
  }
  for (const edge of graph.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      problems.push({ code: 'dangling-edge', message: `edge ${edge.id} references an unknown node` });
    }
  }
  const cycle = findPremiseCycle(graph.nodes);
  if (cycle) problems.push({ code: 'premise-cycle', message: `premise cycle: ${cycle.join(' -> ')}` });
  return problems;
}

function findPremiseCycle(nodes: readonly TlNode[]): string[] | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    const mark = state.get(id);
    if (mark === 'done') return null;
    if (mark === 'visiting') return [...stack.slice(stack.indexOf(id)), id];
    state.set(id, 'visiting');
    stack.push(id);
    for (const premise of byId.get(id)?.premises ?? []) {
      if (!byId.has(premise)) continue;
      const found = visit(premise);
      if (found) return found;
    }
    stack.pop();
    state.set(id, 'done');
    return null;
  };
  for (const node of nodes) {
    const found = visit(node.id);
    if (found) return found;
  }
  return null;
}

/** Turns a sentence into a markup-safe id (`[a-z0-9-]`), unique among `taken`. */
export function slugId(text: string, taken: ReadonlySet<string> | ((id: string) => boolean)): string {
  const isTaken = typeof taken === 'function' ? taken : (id: string) => taken.has(id);
  const base =
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .split('-')
      .slice(0, 6)
      .join('-') || 'node';
  if (!isTaken(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!isTaken(candidate)) return candidate;
  }
}

/**
 * A comment-only node with the user's verbatim words (D-16): no Lean, no LLM involved.
 * The host turns it into a markup block; until then it has no `loc`.
 */
export function createUserNode(args: {
  id: string;
  type: NodeType;
  naturalName: string;
  subject: string;
  asserted?: string;
}): TlNode {
  return {
    id: args.id,
    type: args.type,
    role: 'node',
    subject: args.subject,
    naturalName: args.naturalName,
    ...(args.asserted ? { asserted: args.asserted } : {}),
    premises: [],
    provenance: { wordedBy: 'user', endorsed: true, origin: 'user' },
    ext: {},
    lean: { binding: 'none' },
    status: {
      formal: 'informal',
      proof: { kind: 'none' },
      certificates: { consistency: 'none', nonVacuity: 'none' },
      flags: args.type === 'AXIOM' ? ['no-rationale'] : [],
    },
  };
}
