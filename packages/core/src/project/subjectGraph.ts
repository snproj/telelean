/**
 * One subject's board (docs/m1-plan.md sections 5.3 and 6.3): its nodes in column order (layout.json first, then file
 * order), the edges with both ends in the subject, its Vocabulary group and its diagnostics. M2: each card's
 * `lean.externalUsers` (users that are not cards of this board, ./users.ts). Spec v4 (slice 1b): no declared edge into
 * an axiom (A19), and the stored canvas positions of its propositions (`positions`).
 */
import { orderByLayout } from '../layout.js';
import type { BoardDiagnostic, TlGraph, TlNode, VocabItem } from '../model.js';
import { NODE_TYPES } from '../model.js';
import { edgesOf } from './build.js';
import type { ProjectModel, SubjectGraphOptions } from './types.js';
import { externalUsersOf } from './users.js';

/** Which subject a diagnostic belongs to, or undefined for project-level ones (files outside every subject). */
function subjectOfDiagnostic(model: ProjectModel, d: BoardDiagnostic, fileSubject: ReadonlyMap<string, string>, vocabSubject: ReadonlyMap<string, string>): string | undefined {
  if (d.nodeId !== undefined) {
    const node = model.nodes.get(d.nodeId);
    if (node) return node.node.subject;
  }
  if (d.vocab !== undefined) {
    const subject = vocabSubject.get(d.vocab);
    if (subject !== undefined) return subject;
  }
  if (d.file !== undefined) return fileSubject.get(d.file);
  return undefined;
}

/**
 * Items of other subjects' vocabularies that this subject's cards use (D-10 explicit imports): their `uses`,
 * `presupposes` and code references, plus the sort a used presupposition is about. Listed after the subject's own
 * items, read-only: `subject` stays the item's own subject and `shortName` is the fully-qualified name (relative to
 * this board's namespace nothing shortens it), so hover glosses and click-to-highlight work for them too.
 */
function foreignVocabulary(model: ProjectModel, subject: string, nodes: readonly TlNode[]): VocabItem[] {
  const items = new Map(model.vocabulary.map((item) => [item.name, item]));
  const wanted = new Set<string>();
  for (const node of nodes) {
    for (const name of [...(node.lean.uses ?? []), ...(node.lean.presupposes ?? []), ...(node.lean.refs ?? []).map((r) => r.name)]) wanted.add(name);
  }
  for (const name of [...wanted]) {
    const presupposed = items.get(name)?.presupposes;
    if (presupposed !== undefined) wanted.add(presupposed);
  }
  const ids = new Set(nodes.map((n) => n.id));
  return model.vocabulary
    .filter((item) => item.subject !== subject && wanted.has(item.name))
    .map((item) => ({ ...item, shortName: item.name, usedBy: item.usedBy.filter((id) => ids.has(id)) }));
}

export function buildSubjectGraph(model: ProjectModel, subject: string, options: SubjectGraphOptions): TlGraph {
  const subjectNodes: TlNode[] = [];
  for (const entry of model.nodes.values()) if (entry.node.subject === subject) subjectNodes.push(entry.node);
  const byId = new Map(subjectNodes.map((n) => [n.id, n]));
  const order = orderByLayout(subjectNodes, options.layout);
  // M2 carry-over 1: users the board does not show as cards (copies: the model's nodes are shared).
  const nodes = NODE_TYPES.flatMap((type) =>
    order[type].map((id) => {
      const node = byId.get(id) as TlNode;
      const externalUsers = externalUsersOf(model, node, subject);
      return externalUsers.length > 0 ? { ...node, lean: { ...node.lean, externalUsers } } : node;
    }),
  );

  // Spec v4 A19 (slice 1b): only a proposition has arrows into it. An old axiom's `premises:` (written before v4) is not
  // drawn; build.ts reports it (TL122) and the card offers to make it a proposition or to drop those arrows.
  const edges = edgesOf(model).edges.filter((e) => byId.has(e.source) && byId.has(e.target) && !(e.type === 'premise' && byId.get(e.target)?.type === 'AXIOM'));
  // Spec v4 BD-3: the stored canvas positions of this board's propositions (layout only; the board places the others).
  const positions = Object.entries(options.layout?.positions ?? {}).filter(([id]) => byId.get(id)?.type === 'PROPOSITION');

  const own = model.vocabulary.filter((item) => item.subject === subject).map((item) => ({ ...item, usedBy: item.usedBy.filter((id) => byId.has(id)) }));
  const vocabulary = [...own, ...foreignVocabulary(model, subject, subjectNodes)];

  const fileSubject = new Map<string, string>();
  for (const info of model.subjects) for (const file of info.files) fileSubject.set(file, info.name);
  const vocabSubject = new Map(model.vocabulary.map((item) => [item.name, item.subject]));
  const diagnostics = model.diagnostics.filter((d) => {
    const owner = subjectOfDiagnostic(model, d, fileSubject, vocabSubject);
    // Project-level problems (e.g. a block outside every subject, TL120) are shown on every board.
    return owner === undefined || owner === subject;
  });

  return {
    version: options.version,
    subject,
    nodes,
    edges,
    vocabulary,
    diagnostics,
    semantic: options.semantic,
    ...(positions.length > 0 ? { positions: Object.fromEntries(positions.map(([id, p]) => [id, { x: p.x, y: p.y }])) } : {}),
  };
}
