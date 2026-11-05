/**
 * Writing blocks (03 section 3.1; docs/m1-plan.md section 6.7): `/-`, the `@@ telelean v1` marker, the fields in
 * FIELD_ORDER (values escaped by `formatFieldValue`), then `---` and the escaped Markdown body when there is one,
 * and `-/`. The result never contains a stray comment delimiter, so it is exactly one Lean block comment.
 */
import { FIELD_ORDER, MARKUP_VERSION, type KnownFieldKey, type NewBlock } from './types.js';
import { escapeBodyText, formatFieldValue, isKnownFieldKey, splitList } from './values.js';

const KEY = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;
const LIST_KEYS: ReadonlySet<string> = new Set(['premises', 'lean', 'tags']);

/**
 * A complete block (`/-`, `@@ telelean v1`, fields in FIELD_ORDER, optional `---` body, `-/`), no trailing newline.
 * Known keys among `extra` take their FIELD_ORDER place (a NewBlock field of the same key wins; the value of a list
 * key such as `tags` is read as list text, `a, b` or JSON items); other keys follow the known fields in the given
 * order. Empty lists are omitted. Throws on a key that is not `lcid { "." lcid }`.
 */
export function renderBlock(block: NewBlock, eol: '\n' | '\r\n' = '\n'): string {
  const known = new Map<KnownFieldKey, string | readonly string[]>();
  known.set('id', block.id);
  known.set('type', block.type);
  known.set('natural_name', block.naturalName);
  if (block.rationale !== undefined) known.set('rationale', block.rationale);
  if (block.stance !== undefined) known.set('stance', block.stance);
  if (block.source !== undefined) known.set('source', block.source);
  if (block.premises !== undefined && block.premises.length > 0) known.set('premises', block.premises);
  if (block.asserted !== undefined) known.set('asserted', block.asserted);
  if (block.lean !== undefined && block.lean.length > 0) known.set('lean', block.lean);
  const others: Array<[string, string]> = [];
  for (const [key, value] of block.extra ?? []) {
    if (!KEY.test(key)) throw new Error(`renderBlock: invalid field key ${JSON.stringify(key)}`);
    if (key === 'kind') continue;
    if (isKnownFieldKey(key)) {
      if (!known.has(key)) known.set(key, LIST_KEYS.has(key) ? splitList(value).items : value);
    } else {
      others.push([key, value]);
    }
  }
  const lines = ['/-', `@@ telelean v${MARKUP_VERSION}`];
  for (const key of FIELD_ORDER) {
    const value = known.get(key);
    if (value !== undefined && !(typeof value !== 'string' && value.length === 0)) lines.push(`${key}: ${formatFieldValue(key, value)}`);
  }
  for (const [key, value] of others) lines.push(`${key}: ${formatFieldValue(key, value)}`);
  if (block.body !== undefined && block.body.trim() !== '') {
    lines.push('---', ...escapeBodyText(block.body).split(/\r?\n/));
  }
  lines.push('-/');
  return lines.join(eol);
}
