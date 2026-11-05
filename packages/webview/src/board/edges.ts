import type { TlEdge } from '@telelean/core';
import type { EdgeSpec } from './geometry';

export interface DisplayEdge extends EdgeSpec {
  declared: boolean;
  verified: boolean;
}

const MISMATCH_TITLE: Readonly<Record<NonNullable<TlEdge['mismatch']>, string>> = {
  'declared-unused': 'Declared, but the proof does not use it (TL109)',
  'used-undeclared': 'The proof uses it, but it is not among the declared premises (TL107)',
};

/**
 * Merges the graph's edges into what the overlay draws (03 section 7, D-13, D-15):
 *  - one arrow per (source, target) pair: solid once Lean verified it, dashed while it is only declared;
 *  - a verified edge into a conditional proof keeps the solid line but gets its own marker and the tooltip
 *    "taken as a hypothesis";
 *  - a declared-vs-verified mismatch is drawn in the warning colour, with a tooltip saying which one;
 *  - `lean-ref` edges (a statement mentions another node's statement) are drawn thin, and only while one of their
 *    ends is in `focus` (hovered or selected) and no declared or verified arrow already joins the pair.
 */
export function toDisplayEdges(edges: readonly TlEdge[], focus: ReadonlySet<string> = new Set()): DisplayEdge[] {
  const byPair = new Map<string, DisplayEdge>();
  const references: TlEdge[] = [];
  for (const edge of edges) {
    if (edge.type === 'lean-ref') {
      references.push(edge);
      continue;
    }
    const id = `${edge.source}->${edge.target}`;
    const entry = byPair.get(id) ?? { id, source: edge.source, target: edge.target, pattern: 'declared', declared: false, verified: false };
    if (edge.type === 'premise') entry.declared = true;
    if (edge.type === 'verified') {
      entry.verified = true;
      if (edge.conditional) entry.conditional = true;
    }
    // A verified edge's mismatch (used-undeclared) wins over a premise edge's (declared-unused): they cannot both
    // hold for one pair, but the verified one describes the solid line that is drawn.
    if (edge.mismatch && (edge.type === 'verified' || !entry.mismatch)) entry.mismatch = edge.mismatch;
    entry.pattern = entry.verified ? 'verified' : 'declared';
    byPair.set(id, entry);
  }
  for (const entry of byPair.values()) {
    const titles: string[] = [];
    if (entry.conditional) titles.push('Taken as a hypothesis: the proof is conditional on it');
    if (entry.mismatch) titles.push(MISMATCH_TITLE[entry.mismatch]);
    if (titles.length > 0) entry.title = titles.join('. ');
  }
  for (const edge of references) {
    if (!focus.has(edge.source) && !focus.has(edge.target)) continue;
    if (byPair.has(`${edge.source}->${edge.target}`)) continue;
    const id = `ref:${edge.source}->${edge.target}`;
    if (byPair.has(id)) continue;
    byPair.set(id, { id, source: edge.source, target: edge.target, pattern: 'reference', declared: false, verified: false, title: 'Its statement mentions this one' });
  }
  return [...byPair.values()];
}

/** Whether a graph has edges whose visibility depends on the focus (so a hover must recompute the arrows). */
export function hasFocusEdges(edges: readonly TlEdge[]): boolean {
  return edges.some((edge) => edge.type === 'lean-ref');
}
