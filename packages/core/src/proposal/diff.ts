/**
 * The proposed board vs the current one (docs/m2-plan.md section 4.5), behind the proposal overlay's diff marks.
 *
 * What each changed field means for a node present on both boards:
 *   sentence   natural_name
 *   type       the column (A/D/G)
 *   statement  the bound statement: its name, or its declaration's text (docstring included)
 *   proof      the proof status, when either side is a proof (proved, conditional, pending promotion), or the text of
 *              a `.holds` theorem (adding `axiom n.holds` to a newly formalised assumption is not a proof change)
 *   premises   the declared premises
 *   status     the status flags (e.g. `established` appearing) and certificates
 *   binding    how the card is bound (code-less, adjacent, pinned)
 *   fields     anything else of the card (rationale, notes, stance, source, dates, provenance, extensions)
 */
import { holdsName } from '../facts.js';
import { parseLeanFile } from '../markup/parser.js';
import type { ProofStatus, TlGraph, TlNode, VocabItem } from '../model.js';
import type { GraphDiff, NodeChangeField, NodeChangeKind, NodeDiff } from '../run.js';

const FIELD_ORDER: readonly NodeChangeField[] = ['sentence', 'type', 'statement', 'proof', 'premises', 'status', 'binding', 'fields'];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A declaration name as written in a card's code (relative) names `target` (fully qualified). */
const names = (written: string | undefined, target: string) => written !== undefined && (written === target || target.endsWith(`.${written}`));

/** The texts of a card's statement and `.holds` declarations, read from its `lean.code`. */
function codeParts(node: TlNode): { statement?: string; holds?: string } {
  const code = node.lean.code;
  const statement = node.lean.statement;
  if (code === undefined || statement === undefined) return {};
  const decls = parseLeanFile('card.lean', code).decls;
  const textOf = (target: string) => {
    const decl = decls.find((d) => names(d.fullName, target));
    return decl ? code.slice(decl.span.start, decl.span.end) : undefined;
  };
  const statementText = textOf(statement);
  const holdsText = textOf(holdsName(statement));
  return { ...(statementText !== undefined ? { statement: statementText } : {}), ...(holdsText !== undefined ? { holds: holdsText } : {}) };
}

const isProofKind = (proof: ProofStatus) => proof.kind === 'proved' || proof.kind === 'conditional' || proof.kind === 'pending';

function nodeFields(before: TlNode, after: TlNode): NodeChangeField[] {
  const fields = new Set<NodeChangeField>();
  if (before.naturalName !== after.naturalName) fields.add('sentence');
  if (before.type !== after.type) fields.add('type');
  const b = codeParts(before);
  const a = codeParts(after);
  if (before.lean.statement !== after.lean.statement || b.statement !== a.statement) fields.add('statement');
  const proofChanged = !same(before.status.proof, after.status.proof) && (isProofKind(before.status.proof) || isProofKind(after.status.proof));
  const holdsTheorem = before.lean.justificationKind !== 'axiom' && after.lean.justificationKind !== 'axiom' && (b.holds !== undefined || a.holds !== undefined);
  if (proofChanged || (holdsTheorem && b.holds !== a.holds)) fields.add('proof');
  if (!same(before.premises, after.premises)) fields.add('premises');
  if (!same(before.status.flags, after.status.flags) || !same(before.status.certificates, after.status.certificates)) fields.add('status');
  if (before.lean.binding !== after.lean.binding) fields.add('binding');
  const rest = (n: TlNode) => [n.rationale, n.body, n.asserted, n.stance, n.source, n.supersedes, n.refines, n.provenance, n.ext, n.role];
  if (!same(rest(before), rest(after))) fields.add('fields');
  return FIELD_ORDER.filter((f) => fields.has(f));
}

const vocabChanged = (a: VocabItem, b: VocabItem) => a.type !== b.type || a.kind !== b.kind || a.code !== b.code;

export function graphDiff(current: TlGraph, proposed: TlGraph): GraphDiff {
  const nodes: Record<string, NodeDiff> = {};
  const counts = { added: 0, changed: 0, removed: 0, vocabularyAdded: 0 };
  const before = new Map(current.nodes.map((n) => [n.id, n]));
  const after = new Set(proposed.nodes.map((n) => n.id));
  for (const node of proposed.nodes) {
    const old = before.get(node.id);
    if (!old) {
      nodes[node.id] = { change: 'added', fields: [] };
      counts.added++;
      continue;
    }
    const fields = nodeFields(old, node);
    if (fields.length === 0) continue;
    nodes[node.id] = { change: 'changed', fields };
    counts.changed++;
  }
  for (const node of current.nodes) {
    if (after.has(node.id)) continue;
    nodes[node.id] = { change: 'removed', fields: [] };
    counts.removed++;
  }
  const vocabulary: Record<string, NodeChangeKind> = {};
  const oldVocab = new Map(current.vocabulary.map((v) => [v.name, v]));
  const newVocab = new Set(proposed.vocabulary.map((v) => v.name));
  for (const item of proposed.vocabulary) {
    const old = oldVocab.get(item.name);
    if (!old) {
      vocabulary[item.name] = 'added';
      counts.vocabularyAdded++;
    } else if (vocabChanged(old, item)) vocabulary[item.name] = 'changed';
  }
  for (const item of current.vocabulary) if (!newVocab.has(item.name)) vocabulary[item.name] = 'removed';
  const oldEdges = new Set(current.edges.map((e) => e.id));
  const newEdges = new Set(proposed.edges.map((e) => e.id));
  const edges = {
    added: [...new Set(proposed.edges.map((e) => e.id).filter((id) => !oldEdges.has(id)))],
    removed: [...new Set(current.edges.map((e) => e.id).filter((id) => !newEdges.has(id)))],
  };
  return { nodes, vocabulary, edges, counts };
}
