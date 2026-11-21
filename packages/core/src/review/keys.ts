/**
 * Slice 2a1 (docs/slice2-plan.md section 2.2, the key table): item keys, an item's identity across stages. Persisted,
 * never shown.
 *
 * | Key | Item | Kinds |
 * |---|---|---|
 * | `card:<node>` | a card's fields | formalize, change, delete; add, for a card Claude creates (slice 3) |
 * | `proof:<node>` | a card's proof | result, proof-broken |
 * | `premise:<target>:<leanName>` | a missing premise with its arrow | add-premise |
 * | `arrow:<source>><target>` / `unarrow:<source>><target>` | Claude's arrow | add-arrow / remove-arrow |
 * | `vocab:<lean name>` | one new plain vocabulary term | vocabulary-term |
 * | `decl:<lean name>` | a definition, instance or coercion; a presupposition with its helper instance; a change to existing vocabulary | declaration |
 */
import type { ArrowEnds } from '../actions.js';

export const cardKey = (node: string): string => `card:${node}`;
export const proofKey = (node: string): string => `proof:${node}`;
export const premiseKey = (target: string, leanName: string): string => `premise:${target}:${leanName}`;
export const arrowKey = (source: string, target: string): string => `arrow:${source}>${target}`;
export const unarrowKey = (source: string, target: string): string => `unarrow:${source}>${target}`;
export const vocabKey = (name: string): string => `vocab:${name}`;
export const declKey = (name: string): string => `decl:${name}`;

/** A key read back into its parts (card ids never hold `:` or `>`, ID_PATTERN; Lean names may hold neither). */
export type ParsedItemKey =
  | { kind: 'card' | 'proof'; node: string }
  | { kind: 'premise'; target: string; leanName: string }
  | { kind: 'arrow' | 'unarrow'; arrow: ArrowEnds }
  | { kind: 'vocab' | 'decl'; name: string };

export function parseItemKey(key: string): ParsedItemKey | undefined {
  const colon = key.indexOf(':');
  if (colon <= 0) return undefined;
  const kind = key.slice(0, colon);
  const rest = key.slice(colon + 1);
  if (rest === '') return undefined;
  switch (kind) {
    case 'card':
    case 'proof':
      return { kind, node: rest };
    case 'premise': {
      const at = rest.indexOf(':');
      if (at <= 0 || at === rest.length - 1) return undefined;
      return { kind, target: rest.slice(0, at), leanName: rest.slice(at + 1) };
    }
    case 'arrow':
    case 'unarrow': {
      const at = rest.indexOf('>');
      if (at <= 0 || at === rest.length - 1) return undefined;
      return { kind, arrow: { source: rest.slice(0, at), target: rest.slice(at + 1) } };
    }
    case 'vocab':
    case 'decl':
      return { kind, name: rest };
    default:
      return undefined;
  }
}
