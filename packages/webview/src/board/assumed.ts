/**
 * Spec v4 BD-1 (slice 1c): what is assumed outside the AXIOMS column, for its header line "also assumed: K pending
 * claims, N existence assumptions, M hidden assumptions", so the column accounts for every assumption Lean sees. Each
 * entry links to its card (a pending claim: a proposition whose `.holds` is a Lean axiom, AR-6) or to its Vocabulary
 * item (an existence assumption: a presupposition `axiom T.exists : Nonempty T`; a hidden assumption: a Prop-valued
 * axiom with no card, TL104).
 */
import type { NodeType, TlNode, VocabItem } from '@telelean/core';

export interface AlsoAssumed {
  /** Pending claims: proposition ids, in board order. */
  pending: string[];
  /** Existence assumptions: presupposition names, in vocabulary order. */
  existence: string[];
  /** Hidden assumptions: names of unmarked axioms, in vocabulary order. */
  hidden: string[];
}

/**
 * What the AXIOMS header counts on the board on screen. In the Proposed view before the result is revealed (`result`),
 * a card whose result is hidden counts as it stands on the Current board (`current`), and a new one not at all: that a
 * pending claim became proved tells that a proof exists (spec v4.1 RV-6; 1d fixer).
 */
export function alsoAssumed(
  view: {
    nodes: Readonly<Record<string, TlNode>>;
    order: Readonly<Record<NodeType, readonly string[]>>;
    vocabulary: readonly VocabItem[];
  },
  result?: { hidden: ReadonlySet<string>; current: Readonly<Record<string, TlNode>> },
): AlsoAssumed {
  const shown = (id: string): TlNode | undefined => (result?.hidden.has(id) ? result.current[id] : view.nodes[id]);
  return {
    pending: view.order.PROPOSITION.filter((id) => shown(id)?.type === 'PROPOSITION' && shown(id)?.status.proof.kind === 'pending'),
    existence: view.vocabulary.filter((item) => item.kind === 'presupposition').map((item) => item.name),
    hidden: view.vocabulary.filter((item) => item.kind === 'unmarked-axiom').map((item) => item.name),
  };
}

export type AssumedKind = keyof AlsoAssumed;

const NOUNS: Readonly<Record<AssumedKind, [string, string]>> = {
  pending: ['pending claim', 'pending claims'],
  existence: ['existence assumption', 'existence assumptions'],
  hidden: ['hidden assumption', 'hidden assumptions'],
};

/** The header line's parts, in the spec's order, leaving out the kinds with nothing ("2 pending claims", …). */
export function alsoAssumedParts(assumed: AlsoAssumed): Array<{ kind: AssumedKind; text: string; count: number }> {
  return (['pending', 'existence', 'hidden'] as const)
    .map((kind) => {
      const count = assumed[kind].length;
      const [one, many] = NOUNS[kind];
      return { kind, count, text: `${count} ${count === 1 ? one : many}` };
    })
    .filter((part) => part.count > 0);
}
