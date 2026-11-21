/**
 * Field values of markup v1 (03 section 3.1; 02 D-8; docs/m1-plan.md section 6.7): never YAML. A value is the
 * trimmed raw text after `key:`, or a JSON string literal when it starts with `"`. The serializer writes a value
 * raw whenever that round-trips and is safe inside a Lean block comment, and as an escaped JSON string otherwise.
 */
import { FIELD_ORDER, type KnownFieldKey } from './types.js';

/** Line breaks, C0/C1 control characters and the Unicode line/paragraph separators. */
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
/** Whitespace that `String.prototype.trim` would remove at either end. */
const EDGE_SPACE = /^\s|\s$/u;

const KNOWN_KEYS: ReadonlySet<string> = new Set(FIELD_ORDER);

/** True for keys with a meaning in v1 (03 section 3.2; `kind` is an alias, not a key of its own). */
/**
 * TL011's text, worded like the board's chip: a rule's `rationale:` says where the rule comes from ("no source yet"),
 * any other axiom's why the user holds it ("no reason yet").
 */
export function noRationaleMessage(stance: string | undefined): string {
  return stance === 'rule'
    ? 'This rule has no `rationale:` yet (no source yet: where does it come from?).'
    : 'This axiom has no `rationale:` yet (no reason yet: why do you hold it?).';
}

/** Fields whose repeated lines add up to one list (`premises:`, `lean:`, `tags:`); any other repeated field is TL005. */
export const LIST_FIELD_KEYS: ReadonlySet<string> = new Set(['premises', 'lean', 'tags']);

export function isKnownFieldKey(key: string): key is KnownFieldKey {
  return KNOWN_KEYS.has(key);
}

/** Interprets a raw field value: a JSON string when it starts with `"`, else the trimmed raw text (never YAML). */
export function parseFieldValue(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = raw.trim();
  if (!v.startsWith('"')) return { ok: true, value: v };
  try {
    const parsed: unknown = JSON.parse(v);
    if (typeof parsed !== 'string') return { ok: false, error: 'a quoted value must be one JSON string' };
    return { ok: true, value: parsed };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `not a valid JSON string literal (${detail})` };
  }
}

/**
 * A JSON string literal for `value` that can sit inside a Lean block comment: every `/` followed by `-` is written
 * `/` (so `/-` becomes the 7 characters backslash u 0 0 2 f -), and every other `/` preceded by `-` is
 * written `\/` (so `-/` becomes `-\/`). Newlines and control characters use JSON escapes (also C1 controls and
 * U+2028/U+2029, which `JSON.stringify` would leave literal).
 */
export function escapeJsonValue(value: string): string {
  const json = JSON.stringify(value);
  let out = '';
  for (let i = 0; i < json.length; i++) {
    const ch = json.charAt(i);
    const code = json.charCodeAt(i);
    if (ch === '/' && json.charAt(i + 1) === '-') out += '\\u002f';
    else if (ch === '/' && json.charAt(i - 1) === '-') out += '\\/';
    // JSON.stringify leaves C1 controls and the Unicode line/paragraph separators literal; editors treat the latter as
    // unusual line terminators, so they are escaped too.
    else if ((code >= 0x80 && code <= 0x9f) || code === 0x2028 || code === 0x2029) out += `\\u${code.toString(16).padStart(4, '0')}`;
    else out += ch;
  }
  return out;
}

/**
 * True when a scalar value cannot be written raw: empty, a comment delimiter, a leading `"`, a line break or
 * control character, or leading/trailing whitespace (the parser trims raw values).
 */
export function needsQuoting(value: string): boolean {
  return value === '' || value.includes('/-') || value.includes('-/') || value.startsWith('"') || CONTROL.test(value) || EDGE_SPACE.test(value);
}

/** One list item: raw when safe and unambiguous (no comma, no edge bracket), else a JSON string. */
export function formatListItem(item: string): string {
  const ambiguous = item.includes(',') || item.startsWith('[') || item.endsWith(']');
  return needsQuoting(item) || ambiguous ? escapeJsonValue(item) : item;
}

/**
 * The text written after `key: `. Raw when that round-trips (no comment delimiter, no leading quote, no line break,
 * no leading/trailing space); otherwise `escapeJsonValue`. Lists are written `a, b, c` (an item that is not safe
 * raw, e.g. one holding a comma, is written as a JSON string).
 */
export function formatFieldValue(key: KnownFieldKey | string, value: string | readonly string[]): string {
  void key;
  if (typeof value !== 'string') return value.map(formatListItem).join(', ');
  return needsQuoting(value) ? escapeJsonValue(value) : value;
}

/**
 * Markdown body escapes: `-/` -> `-\/`, `/-` -> `/\-` (CommonMark backslash escapes). A leading `--` (after
 * whitespace) becomes `\--` too: in a doc comment written as `/-- text -/`, Lean skips whitespace and comments right
 * after `/--`, so a leading `--` would be read as a line comment that eats the closer (verified with Lean 4.35).
 */
export function escapeBodyText(body: string): string {
  const escaped = body.replace(/-\//g, '-\\/').replace(/\/-/g, '/\\-');
  const lead = /^[ \t\r\n]*--/.exec(escaped);
  return lead === null ? escaped : `${escaped.slice(0, lead[0].length - 2)}\\${escaped.slice(lead[0].length - 2)}`;
}

/**
 * Splits a list value: optional surrounding brackets, items separated by commas, each item trimmed raw text or a
 * JSON string literal (which may hold commas). Empty items are skipped. Errors name the offending item.
 */
export function splitList(raw: string): { items: string[]; errors: string[] } {
  let v = raw.trim();
  if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1);
  const items: string[] = [];
  const errors: string[] = [];
  let i = 0;
  while (i <= v.length) {
    while (i < v.length && /\s/u.test(v.charAt(i))) i++;
    if (i >= v.length) break;
    if (v.charAt(i) === '"') {
      let j = i + 1;
      while (j < v.length && v.charAt(j) !== '"') j += v.charAt(j) === '\\' ? 2 : 1;
      const literal = v.slice(i, j + 1);
      const parsed = parseFieldValue(literal);
      if (parsed.ok) items.push(parsed.value);
      else errors.push(`${literal}: ${parsed.error}`);
      let k = j + 1;
      while (k < v.length && /\s/u.test(v.charAt(k))) k++;
      if (k < v.length && v.charAt(k) !== ',') {
        const comma = v.indexOf(',', k);
        errors.push(`unexpected text after ${literal}`);
        k = comma < 0 ? v.length : comma;
      }
      i = k + 1;
    } else {
      const comma = v.indexOf(',', i);
      const end = comma < 0 ? v.length : comma;
      const item = v.slice(i, end).trim();
      if (item !== '') items.push(item);
      i = end + 1;
    }
  }
  return { items, errors };
}
