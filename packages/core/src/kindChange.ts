/**
 * D-11 kind changes as the board previews them: the impact text on each drop zone (D-17) and whether the drop needs
 * a confirmation, computed from the published graph alone, so the webview can show it during a drag without asking
 * the host. The host re-plans with the Lean facts (edit/planKindChange) and refuses if the picture changed. The texts
 * say only what the graph shows ("No card on this board uses it"): declarations without a card, and other subjects'
 * proofs, are known to the host alone, which asks (`needs-confirmation`) when the change would break one of them.
 *
 * Implemented by the architect as part of the M1 contract (docs/m1-plan.md section 6.2); owned by WP-model afterwards.
 *
 * | change      | Lean (D-2(b): `abbrev n : Prop := S` + `n.holds`)          | dependents                        |
 * |-------------|------------------------------------------------------------|-----------------------------------|
 * | code-less   | none: only `type:` changes                                  | -                                 |
 * | G->D        | none now; `theorem n.holds` once proved                      | unaffected                        |
 * | G->A, D->A  | add `axiom n.holds : n`, or turn the theorem into that axiom | unaffected (proof archived); a conditional proof's users must drop its arguments: confirm |
 * | A->D        | the axiom stays, "claimed": promotion pending until proved   | unaffected; flagged rests-on-claimed |
 * | A->G, D->G  | `n.holds` must go                                            | confirm: rewrite to `(h : n)` or mark broken |
 */
import { ActionError } from './actions.js';
import type { NodeType, TlGraph, TlNode } from './model.js';

const NOUN: Readonly<Record<NodeType, string>> = { ASSUMPTION: 'Assumption', DERIVATION: 'Derivation', GOAL: 'Goal' };

export type KindLeanChange =
  /** Only the `type:` line changes. */
  | 'none'
  /** `axiom n.holds : n` is added. */
  | 'add-axiom'
  /** `theorem n.holds` becomes `axiom n.holds`; the proof goes to the attic. */
  | 'theorem-to-axiom'
  /** `n.holds` is removed (a theorem's proof goes to the attic). */
  | 'remove-holds'
  /** A->D: the axiom stays until a proof replaces it. */
  | 'pending-promotion';

export interface KindChangeImpact {
  id: string;
  from: NodeType;
  to: NodeType;
  /** Drop-zone label, e.g. `Make Derivation: promotion pending until proved`. */
  summary: string;
  /** One or two sentences for the tooltip / confirm dialog. */
  detail: string;
  leanChange: KindLeanChange;
  /** Nodes whose proofs use this node's `.holds`, directly or through other proofs (verified edges, transitively). */
  dependents: string[];
  /** A->G / D->G with dependents: the drop opens a dialog (rewrite to a hypothesis / mark broken / cancel). */
  needsConfirmation: boolean;
  /** Offer the optional "why do you hold it?" field (G->A "you supply the reason"; any change to Assumption without a rationale). */
  asksRationale: boolean;
  /** The mechanical hypothesis rewrite needs fresh Lean facts for this node. */
  rewriteAvailable: boolean;
}

/** Ids of nodes reachable from `id` along verified (proof) edges: everything whose proof rests on `id`. */
export function proofDependents(graph: Pick<TlGraph, 'edges'>, id: string): string[] {
  const out: string[] = [];
  const seen = new Set([id]);
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const edge of graph.edges) {
      if (edge.type !== 'verified' || edge.source !== current || seen.has(edge.target)) continue;
      seen.add(edge.target);
      out.push(edge.target);
      queue.push(edge.target);
    }
  }
  return out;
}

function shortStatement(node: TlNode): string {
  const name = node.lean.statement ?? node.id;
  const prefix = `${node.subject}.`;
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** The "refresh first" choice of a dependents dialog, singular or plural (M2 carry-over 2, texts frozen in docs/m2-plan.md 1.3). */
function refreshFirst(n: number): string {
  return n === 1
    ? 'Refresh Lean first to rewrite it mechanically, or keep it and let it show as broken.'
    : 'Refresh Lean first to rewrite them mechanically, or keep them and let them show as broken.';
}

/** A verb agreeing with a count: `agree(1, 'uses', 'use')` = 'uses', `agree(2, 'uses', 'use')` = 'use'. */
function agree(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? singular : pluralForm;
}

/**
 * What dropping card `id` on column `to` would do (D-11), from the graph alone.
 * Throws ActionError `not-found` for an unknown id and `invalid` when `to` is the card's own column (a re-order).
 */
export function kindChangeImpact(graph: Pick<TlGraph, 'nodes' | 'edges' | 'semantic'>, id: string, to: NodeType): KindChangeImpact {
  const node = graph.nodes.find((n) => n.id === id);
  if (!node) throw new ActionError('not-found', `No card "${id}" on this board.`);
  const from = node.type;
  if (from === to) throw new ActionError('invalid', 'Moving a card within its own column only re-orders it.');
  const label = `Make ${NOUN[to]}`;
  const dependents = proofDependents(graph, id);
  const rewriteAvailable = graph.semantic.state === 'fresh' && !node.status.flags.includes('stale');
  const asksRationale = to === 'ASSUMPTION' && node.rationale === undefined;
  const base = { id, from, to, dependents, rewriteAvailable, asksRationale, needsConfirmation: false };

  const codeLess = node.lean.statement === undefined || node.status.formal === 'informal';
  if (codeLess) {
    return { ...base, leanChange: 'none', summary: `${label}: no Lean change`, detail: 'This card has no Lean code yet, so only its type changes.' };
  }

  const holds = `${shortStatement(node)}.holds`;
  const hypothesis = `(h_${(node.lean.statement ?? node.id).split('.').pop() ?? node.id} : ${shortStatement(node)})`;
  // `other` (a def proving the statement, …) counts as a theorem (docs/m1-plan.md 6.2).
  const kind = node.lean.justificationKind === 'other' ? 'theorem' : node.lean.justificationKind;
  const dependentsNote =
    dependents.length > 0
      ? ` ${plural(dependents.length, 'proof')} that ${agree(dependents.length, 'uses', 'use')} it ${agree(dependents.length, 'stays', 'stay')} valid.`
      : '';

  if (to === 'ASSUMPTION') {
    const proof = node.status.proof;
    if (kind === 'theorem' && proof.kind === 'conditional') {
      // A conditional proof takes hypotheses; the axiom replacing it states the statement directly.
      const on = proof.on.length === 1 ? 'a hypothesis' : `${proof.on.length} hypotheses`;
      if (dependents.length === 0) {
        return {
          ...base,
          leanChange: 'theorem-to-axiom',
          summary: `${label}: its proof becomes an axiom`,
          detail: `\`theorem ${holds}\` (which takes ${on}) becomes \`axiom ${holds} : ${shortStatement(node)}\`; the proof is kept in the attic. No card on this board uses it.`,
        };
      }
      return {
        ...base,
        leanChange: 'theorem-to-axiom',
        needsConfirmation: true,
        summary: `${label}: ${plural(dependents.length, 'dependent')} ${agree(dependents.length, 'needs', 'need')} a rewrite`,
        detail:
          `\`theorem ${holds}\` takes ${on}; as an assumption it becomes \`axiom ${holds} : ${shortStatement(node)}\` (the proof is kept in the attic), so the ${plural(dependents.length, 'proof')} that ${agree(dependents.length, 'passes', 'pass')} it arguments must change. ` +
          (rewriteAvailable
            ? dependents.length === 1
              ? 'Either rewrite that proof to use it directly (mechanical, undoable), or keep that proof and let it show as broken.'
              : 'Either rewrite them to use it directly (mechanical, undoable), or keep them and let them show as broken.'
            : refreshFirst(dependents.length)),
      };
    }
    if (kind === 'theorem') {
      return {
        ...base,
        leanChange: 'theorem-to-axiom',
        summary: `${label}: its proof becomes an axiom`,
        detail: `\`theorem ${holds}\` becomes \`axiom ${holds}\`; the proof is kept in the attic.${dependentsNote}`,
      };
    }
    if (kind === 'axiom') {
      return { ...base, leanChange: 'none', summary: `${label}: keeps its axiom`, detail: `\`axiom ${holds}\` stays as it is.${dependentsNote}` };
    }
    return {
      ...base,
      leanChange: 'add-axiom',
      summary: `${label}: adds axiom ${holds}`,
      detail: `Adds \`axiom ${holds} : ${shortStatement(node)}\` after the statement, so proofs may use it.`,
    };
  }

  if (to === 'DERIVATION') {
    if (kind === 'theorem') {
      return { ...base, leanChange: 'none', summary: `${label}: already proved`, detail: `\`theorem ${holds}\` already proves it.` };
    }
    if (kind === 'axiom') {
      const resting =
        dependents.length > 0 ? ` Until then ${plural(dependents.length, 'proof')} ${agree(dependents.length, 'rests', 'rest')} on a claimed node.` : '';
      return {
        ...base,
        leanChange: 'pending-promotion',
        summary: `${label}: promotion pending until proved`,
        detail: `\`axiom ${holds}\` stays, marked claimed, until you replace it with a proof (\`theorem ${holds} : … := …\`).${resting}`,
      };
    }
    return {
      ...base,
      leanChange: 'none',
      summary: `${label}: counts as derived once proved`,
      detail: `Write \`theorem ${holds} : ${shortStatement(node)} := …\` to prove it.`,
    };
  }

  // to === 'GOAL'
  if (kind === undefined) {
    return { ...base, leanChange: 'none', summary: `${label}: no Lean change`, detail: `It has no \`${holds}\` yet, so only its type changes.` };
  }
  const archived = kind === 'theorem' ? ' (its proof is archived)' : '';
  if (dependents.length === 0) {
    return {
      ...base,
      leanChange: 'remove-holds',
      summary: `${label}: removes ${holds}`,
      detail: `A goal is not taken as given, so \`${holds}\` is removed${archived}. No card on this board uses it.`,
    };
  }
  return {
    ...base,
    leanChange: 'remove-holds',
    needsConfirmation: true,
    summary: `${label}: ${plural(dependents.length, 'dependent')} ${agree(dependents.length, 'needs', 'need')} a hypothesis rewrite`,
    detail:
      `\`${holds}\` will be removed${archived}, but ${plural(dependents.length, 'proof')} ${agree(dependents.length, 'uses', 'use')} it. ` +
      (rewriteAvailable
        ? dependents.length === 1
          ? `Either rewrite that proof to take it as a hypothesis \`${hypothesis}\` (mechanical, undoable), or keep that proof and let it show as broken.`
          : `Either rewrite them to take it as a hypothesis \`${hypothesis}\` (mechanical, undoable), or keep them and let them show as broken.`
        : refreshFirst(dependents.length)),
  };
}
