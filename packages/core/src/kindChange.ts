/**
 * D-11 kind changes as the board previews them: the impact text on each drop zone (D-17) and whether the drop needs
 * a confirmation, computed from the published graph alone, so the webview can show it during a drag without asking
 * the host. The host re-plans with the Lean facts (edit/planKindChange) and refuses if the picture changed. The texts
 * say only what the graph shows ("No card on this board uses it"): declarations without a card, and other subjects'
 * proofs, are known to the host alone, which asks (`needs-confirmation`) when the change would break one of them.
 *
 * Implemented by the architect as part of the M1 contract (docs/m1-plan.md section 6.2); owned by WP-model afterwards.
 * Spec v4 (docs/slice1-plan.md 2.4): two kinds. A card's place is its kind (CF-4):
 *
 * | change | Lean (D-2(b): `abbrev n : Prop := S` + `n.holds`)          | dependents                                  |
 * |--------|------------------------------------------------------------|---------------------------------------------|
 * | code-less | none: only `type:` changes                              | -                                           |
 * | P->A   | add `axiom n.holds : n`, or turn the theorem into that axiom; its arrows (`premises:`, `follows_from:`) go (AR-7) | unaffected (proof archived); a conditional proof's users must drop its arguments: confirm |
 * | A->P   | the axiom stays, "pending proof" until a run proves it (AR-6)   | unaffected; they rest on a pending claim     |
 *
 * A->P is never a `change-kind`: the board makes an axiom a proposition by an arrow into it or the "follows from
 * nothing" mark (slice 1b), and `planKindChange` refuses it (AXIOM_TO_PROPOSITION_REFUSAL). Its impact is still
 * computed here, for those gestures.
 */
import { ActionError, type ArrowEnds } from './actions.js';
import type { NodeType, TlEdge, TlGraph, TlNode } from './model.js';

/** The planner's refusal of `change-kind` to PROPOSITION (spec v4 AR-6, docs/slice1-plan.md 2.4). */
export const AXIOM_TO_PROPOSITION_REFUSAL = "To make an axiom a proposition, draw an arrow into it, or mark it 'follows from nothing'.";

/** The board's drop text when an axiom is dragged to the propositions (docs/slice1-plan.md section 3). */
export const AXIOM_DROP_REFUSAL = 'Draw an arrow into it to make it a proposition';

export type KindLeanChange =
  /** Only the `type:` line changes. */
  | 'none'
  /** `axiom n.holds : n` is added. */
  | 'add-axiom'
  /** `theorem n.holds` becomes `axiom n.holds`; the proof goes to the attic. */
  | 'theorem-to-axiom'
  /** A->P: the axiom stays, pending proof, until a proof replaces it. */
  | 'pending';

export interface KindChangeImpact {
  id: string;
  from: NodeType;
  to: NodeType;
  /** Drop-zone label, e.g. `Move to axioms: its proof becomes an axiom` (slice 1f: the words of the action, AR-7). */
  summary: string;
  /** One or two sentences for the tooltip / confirm dialog. */
  detail: string;
  leanChange: KindLeanChange;
  /** Nodes whose proofs use this node's `.holds`, directly or through other proofs (verified edges, transitively). */
  dependents: string[];
  /** P->A of a conditional proof with dependents: the drop opens a dialog (rewrite them / mark broken / cancel). */
  needsConfirmation: boolean;
  /** Offer the optional "why do you hold it?" field (any change to Axiom without a rationale). */
  asksRationale: boolean;
  /** The mechanical rewrite of dependents needs fresh Lean facts for this node. */
  rewriteAvailable: boolean;
}

/**
 * Spec v4 BD-6, AR-6 (slice 1b): the cards whose green glow rests on `id`'s axiom, i.e. the established propositions
 * whose proof footprint contains it. They lose the glow while it is pending proof. Never an axiom card (even one with a
 * proof), nor a proposition that is not established anyway.
 */
export function glowingDependents(graph: { readonly nodes: readonly TlNode[] }, id: string): string[] {
  return graph.nodes
    .filter((n) => n.id !== id && n.status.flags.includes('established') && n.status.proof.kind === 'proved' && n.status.proof.footprint.includes(id))
    .map((n) => n.id);
}

/**
 * Spec v4 A16 (slice 1b): the arrows among `arrows` that a checked proof uses, i.e. those with a verified edge from the
 * same source into the same target (a hypothesis of a conditional proof included).
 */
export function arrowsInUse(graph: { readonly edges: readonly TlEdge[] }, arrows: readonly ArrowEnds[]): ArrowEnds[] {
  const used = new Set(graph.edges.filter((e) => e.type === 'verified').map((e) => `${e.source}\u0000${e.target}`));
  return arrows.filter((a) => used.has(`${a.source}\u0000${a.target}`));
}

/**
 * The A16 confirmation for removing arrows that proofs use (`used`, from `arrowsInUse`); `nameOf` gives a card's
 * sentence. The planner's `needs-confirmation` message and the board's dialog say the same.
 */
export function removeUsedArrowsText(used: readonly ArrowEnds[], nameOf: (id: string) => string): string {
  const quote = (id: string) => `“${nameOf(id)}”`;
  const first = used[0];
  if (used.length === 1 && first !== undefined) {
    return (
      `The proof of ${quote(first.target)} uses ${quote(first.source)}. Without the arrow the proof still builds, but it then uses a card you drew no arrow ` +
      'from: the board shows that use in the warning colour, and its band loses its ✓ until you draw the arrow again or the card is proved again.'
    );
  }
  const shown = used.slice(0, 3).map((a) => `${quote(a.source)} → ${quote(a.target)}`);
  const more = used.length > 3 ? `; … (${used.length - 3} more)` : '';
  return (
    `Proofs use ${used.length} of these arrows: ${shown.join('; ')}${more}. Without them the proofs still build, but they then use cards you drew no ` +
    'arrow from: the board shows those uses in the warning colour, and their bands lose their ✓ until you draw the arrows again or the cards are proved again.'
  );
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

/** AR-7: what a proposition loses when it becomes an axiom (its incoming arrows, its "follows from nothing" mark). */
function arrowsNote(node: TlNode): string {
  const arrows = node.premises.length;
  if (arrows > 0) return ` Its ${plural(arrows, 'incoming arrow')} ${agree(arrows, 'is', 'are')} removed.`;
  return node.fromNothing === true ? ' Its "follows from nothing" mark is removed.' : '';
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
  // A->P is no "Make" action of its own (AR-6): it happens by an arrow or the "follows from nothing" mark. P->A is the
  // board's "Move to axioms" (AR-7), worded so on its drop zone and in its dialog (slice 1f carry-over 4).
  const label = to === 'AXIOM' ? 'Move to axioms' : 'Becomes a proposition';
  const dependents = proofDependents(graph, id);
  const rewriteAvailable = graph.semantic.state === 'fresh' && !node.status.flags.includes('stale');
  const asksRationale = to === 'AXIOM' && node.rationale === undefined;
  const base = { id, from, to, dependents, rewriteAvailable, asksRationale, needsConfirmation: false };
  const arrows = to === 'AXIOM' ? arrowsNote(node) : '';

  const codeLess = node.lean.statement === undefined || node.status.formal === 'informal';
  if (codeLess) {
    return { ...base, leanChange: 'none', summary: `${label}: no Lean change`, detail: `This card has no Lean code yet, so only its type changes.${arrows}` };
  }

  const holds = `${shortStatement(node)}.holds`;
  // `other` (a def proving the statement, …) counts as a theorem (docs/m1-plan.md 6.2).
  const kind = node.lean.justificationKind === 'other' ? 'theorem' : node.lean.justificationKind;
  const dependentsNote =
    dependents.length > 0
      ? ` ${plural(dependents.length, 'proof')} that ${agree(dependents.length, 'uses', 'use')} it ${agree(dependents.length, 'stays', 'stay')} valid.`
      : '';

  if (to === 'AXIOM') {
    const proof = node.status.proof;
    if (kind === 'theorem' && proof.kind === 'conditional') {
      // A conditional proof takes hypotheses; the axiom replacing it states the statement directly.
      const on = proof.on.length === 1 ? 'a hypothesis' : `${proof.on.length} hypotheses`;
      if (dependents.length === 0) {
        return {
          ...base,
          leanChange: 'theorem-to-axiom',
          summary: `${label}: its proof becomes an axiom`,
          detail: `\`theorem ${holds}\` (which takes ${on}) becomes \`axiom ${holds} : ${shortStatement(node)}\`; the proof is kept in the attic. No card on this board uses it.${arrows}`,
        };
      }
      return {
        ...base,
        leanChange: 'theorem-to-axiom',
        needsConfirmation: true,
        summary: `${label}: ${plural(dependents.length, 'dependent')} ${agree(dependents.length, 'needs', 'need')} a rewrite`,
        detail:
          `\`theorem ${holds}\` takes ${on}; as an axiom it becomes \`axiom ${holds} : ${shortStatement(node)}\` (the proof is kept in the attic), so the ${plural(dependents.length, 'proof')} that ${agree(dependents.length, 'passes', 'pass')} it arguments must change.${arrows} ` +
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
        detail: `\`theorem ${holds}\` becomes \`axiom ${holds}\`; the proof is kept in the attic.${dependentsNote}${arrows}`,
      };
    }
    if (kind === 'axiom') {
      return { ...base, leanChange: 'none', summary: `${label}: keeps its axiom`, detail: `\`axiom ${holds}\` stays as it is.${dependentsNote}${arrows}` };
    }
    return {
      ...base,
      leanChange: 'add-axiom',
      summary: `${label}: adds axiom ${holds}`,
      detail: `Adds \`axiom ${holds} : ${shortStatement(node)}\` after the statement, so proofs may use it.${arrows}`,
    };
  }

  // to === 'PROPOSITION' (AR-6): the `.holds` is kept as it is.
  if (kind === 'theorem') {
    return { ...base, leanChange: 'none', summary: `${label}: already proved`, detail: `\`theorem ${holds}\` already proves it.` };
  }
  if (kind === 'axiom') {
    // Only an established card glows green (BD-6), and it loses the glow when a card in its footprint becomes pending:
    // never an axiom card (even one with a proof), nor a proposition that is not established anyway.
    const glowing = glowingDependents(graph, id).length;
    const resting = glowing > 0 ? ` ${plural(glowing, 'card')} that ${agree(glowing, 'rests', 'rest')} on it will lose ${agree(glowing, 'its', 'their')} green glow until it is proved.` : '';
    return {
      ...base,
      leanChange: 'pending',
      summary: `${label}: pending proof until proved`,
      detail: `\`axiom ${holds}\` stays, marked pending proof, until a run proves it (\`theorem ${holds} : … := …\`).${resting}`,
    };
  }
  return {
    ...base,
    leanChange: 'none',
    summary: `${label}: unproved until a run proves it`,
    detail: `It has no \`${holds}\` yet: a run proves it (\`theorem ${holds} : ${shortStatement(node)} := …\`).`,
  };
}
