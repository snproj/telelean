/**
 * Edges of the project (D-13, docs/m1-plan.md section 6.3):
 *
 *  - `premise` (declared, dashed): one per entry of `premises:`;
 *  - `verified` (Lean, solid): FROM REFERENCES, not footprints. direct(v) = the nodes u whose `.holds` the proof of v
 *    uses: start at v's `.holds` `DeclFacts.refs` and follow references through declarations that belong to no node
 *    (untracked lemmas, definitions) until a node's `.holds` is reached; plus one `conditional` edge per node v takes
 *    as a hypothesis (`on`). A footprint lists only axioms, so it would miss every derivation -> goal edge;
 *  - `lean-ref`: v's statement mentions u's statement;
 *  - mismatch flags, only when v is proved or conditional, judged at the assumption level: `declared-unused` (TL109)
 *    when a premise is not in the closure of what the proof uses; `used-undeclared` (TL107) when a used node is not a
 *    premise and the assumptions it stands for are not covered by the premises' assumptions.
 */
import type { DeclFacts } from '../facts.js';
import { holdsName } from '../facts.js';
import { edgeId } from '../graph.js';
import type { BoardDiagnostic, TlEdge, TlNode } from '../model.js';

export interface EdgeInput {
  /** Every node of the project, in file order. */
  nodes: readonly TlNode[];
  ownerOfDecl: ReadonlyMap<string, string>;
  /** Usable facts by name (fresh files fully, stale files by name). */
  declFacts: ReadonlyMap<string, DeclFacts>;
}

export interface EdgeResult {
  edges: TlEdge[];
  /** direct(v): nodes whose `.holds` v's proof uses (only for proved/conditional v). */
  direct: Map<string, string[]>;
  diagnostics: BoardDiagnostic[];
}

function isProvedOrConditional(node: TlNode): boolean {
  return node.status.proof.kind === 'proved' || node.status.proof.kind === 'conditional';
}

function onOf(node: TlNode): string[] {
  return node.status.proof.kind === 'conditional' ? node.status.proof.on : [];
}

/** The nodes whose `.holds` the proof of `node` uses, following untracked declarations. */
export function directUses(node: TlNode, input: Pick<EdgeInput, 'ownerOfDecl' | 'declFacts'>, holdsOwner: ReadonlyMap<string, string>): string[] {
  const statement = node.lean.statement;
  if (!statement) return [];
  const own = holdsName(statement);
  const start = input.declFacts.get(own);
  if (!start) return [];
  const out: string[] = [];
  const visited = new Set<string>([own]);
  const queue = start.refs.map((r) => r.name);
  while (queue.length > 0) {
    const name = queue.shift() as string;
    if (visited.has(name)) continue;
    visited.add(name);
    const user = holdsOwner.get(name);
    if (user !== undefined) {
      if (user !== node.id && !out.includes(user)) out.push(user);
      continue;
    }
    const owner = input.ownerOfDecl.get(name);
    if (owner !== undefined && (owner !== node.id || name === statement)) continue;
    const facts = input.declFacts.get(name);
    if (facts) for (const ref of facts.refs) if (!visited.has(ref.name)) queue.push(ref.name);
  }
  return out;
}

export function computeEdges(input: EdgeInput): EdgeResult {
  const byId = new Map(input.nodes.map((n) => [n.id, n]));
  const statementOwner = new Map<string, string>();
  const holdsOwner = new Map<string, string>();
  for (const node of input.nodes) {
    const statement = node.lean.statement;
    if (!statement || input.ownerOfDecl.get(statement) !== node.id) continue;
    statementOwner.set(statement, node.id);
    holdsOwner.set(holdsName(statement), node.id);
  }

  const direct = new Map<string, string[]>();
  for (const node of input.nodes) if (isProvedOrConditional(node)) direct.set(node.id, directUses(node, input, holdsOwner));

  const premiseEdges: TlEdge[] = [];
  const verifiedEdges: TlEdge[] = [];
  const refEdges: TlEdge[] = [];
  const seen = new Set<string>();
  const push = (list: TlEdge[], edge: TlEdge) => {
    if (seen.has(edge.id)) return;
    seen.add(edge.id);
    list.push(edge);
  };

  for (const node of input.nodes) {
    for (const premise of node.premises) {
      if (premise === node.id || !byId.has(premise)) continue;
      push(premiseEdges, { id: edgeId('premise', premise, node.id), type: 'premise', source: premise, target: node.id, origin: 'declared' });
    }
    const uses = direct.get(node.id) ?? [];
    for (const source of uses) {
      push(verifiedEdges, { id: edgeId('verified', source, node.id), type: 'verified', source, target: node.id, origin: 'lean', where: 'proof' });
    }
    for (const source of onOf(node)) {
      if (!byId.has(source) || source === node.id) continue;
      push(verifiedEdges, { id: edgeId('verified', source, node.id), type: 'verified', source, target: node.id, origin: 'lean', where: 'proof', conditional: true });
    }
    const statement = node.lean.statement;
    const facts = statement ? input.declFacts.get(statement) : undefined;
    if (facts && statement && statementOwner.get(statement) === node.id) {
      for (const ref of facts.refs) {
        const source = statementOwner.get(ref.name);
        if (source === undefined || source === node.id) continue;
        push(refEdges, { id: edgeId('lean-ref', source, node.id), type: 'lean-ref', source, target: node.id, origin: 'lean', where: 'statement' });
      }
    }
  }

  // D-13 mismatches, at the assumption level.
  const closureMemo = new Map<string, Set<string>>();
  const closure = (id: string, stack: Set<string> = new Set()): Set<string> => {
    const memo = closureMemo.get(id);
    if (memo) return memo;
    const out = new Set<string>();
    if (stack.has(id)) return out;
    stack.add(id);
    const node = byId.get(id);
    for (const u of [...(direct.get(id) ?? []), ...(node ? onOf(node) : [])]) {
      if (!byId.has(u)) continue;
      out.add(u);
      for (const w of closure(u, stack)) out.add(w);
    }
    stack.delete(id);
    closureMemo.set(id, out);
    return out;
  };
  const rests = (id: string): string[] => {
    const node = byId.get(id);
    if (!node || !isProvedOrConditional(node)) return [id];
    const proof = node.status.proof;
    const footprint = proof.kind === 'proved' ? proof.footprint : proof.kind === 'conditional' ? (proof.footprint ?? []) : [];
    return [...new Set([...footprint.filter((x) => byId.has(x)), ...onOf(node)])];
  };

  const diagnostics: BoardDiagnostic[] = [];
  const at = (node: TlNode) => (node.loc ? { file: node.loc.file, range: node.loc.range } : {});
  for (const node of input.nodes) {
    if (!isProvedOrConditional(node)) continue;
    const premises = node.premises.filter((p) => byId.has(p) && p !== node.id);
    const used = closure(node.id);
    for (const edge of premiseEdges) {
      if (edge.target !== node.id || used.has(edge.source)) continue;
      edge.mismatch = 'declared-unused';
      diagnostics.push({ code: 'TL109', severity: 'hint', message: `Declared premise "${edge.source}" is not used by the proof.`, nodeId: node.id, ...at(node) });
    }
    const covered = new Set(premises.flatMap((p) => rests(p)));
    for (const edge of verifiedEdges) {
      if (edge.target !== node.id || premises.includes(edge.source)) continue;
      if (rests(edge.source).every((x) => covered.has(x))) continue;
      edge.mismatch = 'used-undeclared';
      diagnostics.push({
        code: 'TL107',
        severity: 'warning',
        message: `The proof uses "${edge.source}", which the declared premises do not cover.`,
        nodeId: node.id,
        ...at(node),
      });
    }
  }

  return { edges: [...premiseEdges, ...verifiedEdges, ...refEdges], direct, diagnostics };
}
