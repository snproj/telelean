/**
 * Small pure text helpers of the model builder and the edit planner (WP-model). They deliberately do not depend on
 * WP-markup's lexer: positions and declaration spans come from the parsed files, and these helpers only convert
 * between offsets and LSP positions, read declaration signatures and scan for namespaces/tokens.
 *
 * Offsets are UTF-16 code-unit indices; positions are LSP (0-based line, UTF-16 character).
 */
import type { Position, Range } from '../model.js';

/** Offset <-> position conversion for one text (`\n` and `\r\n` line breaks). */
export class LineMap {
  private readonly starts: number[] = [0];

  constructor(readonly text: string) {
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) this.starts.push(i + 1);
  }

  get lineCount(): number {
    return this.starts.length;
  }

  positionAt(offset: number): Position {
    const clamped = Math.max(0, Math.min(offset, this.text.length));
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((this.starts[mid] ?? 0) <= clamped) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo, character: clamped - (this.starts[lo] ?? 0) };
  }

  offsetAt(position: Position): number {
    if (position.line < 0) return 0;
    if (position.line >= this.starts.length) return this.text.length;
    const start = this.starts[position.line] ?? 0;
    const next = position.line + 1 < this.starts.length ? (this.starts[position.line + 1] ?? this.text.length) - 1 : this.text.length;
    const lineEnd = next > start && this.text.charCodeAt(next - 1) === 13 ? next - 1 : next;
    return Math.min(start + Math.max(0, position.character), lineEnd);
  }

  rangeOf(start: number, end: number): Range {
    return { start: this.positionAt(start), end: this.positionAt(end) };
  }
}

export function comparePositions(a: Position, b: Position): number {
  return a.line - b.line || a.character - b.character;
}

/** `inner` lies within `outer` (inclusive ends: a zero-width message range at a declaration's end still counts). */
export function rangeContains(outer: Range, inner: Position): boolean {
  return comparePositions(outer.start, inner) <= 0 && comparePositions(inner, outer.end) <= 0;
}

/** Every run of whitespace becomes one space (Lean wraps long `#check` types onto indented lines). */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * The text with comments (nested `/- -/`, `--`) and string literals blanked out by spaces, so offsets stay valid.
 * Line breaks inside comments are kept.
 */
export function blankComments(text: string): string {
  const out = text.split('');
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' ';
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '-' && next === '-') {
      let j = i;
      while (j < text.length && text[j] !== '\n') j++;
      blank(i, j);
      i = j;
    } else if (c === '/' && next === '-') {
      let depth = 1;
      let j = i + 2;
      while (j < text.length && depth > 0) {
        if (text[j] === '/' && text[j + 1] === '-') {
          depth++;
          j += 2;
        } else if (text[j] === '-' && text[j + 1] === '/') {
          depth--;
          j += 2;
        } else j++;
      }
      blank(i, j);
      i = j;
    } else if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"' && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      blank(i, Math.min(j + 1, text.length));
      i = j + 1;
    } else i++;
  }
  return out.join('');
}

const OPENERS = '([{⟨⦃';
const CLOSERS = ')]}⟩⦄';

/**
 * Splits a type at its top-level arrows (`→` or `->`, outside brackets). A type that starts with a binder
 * (`∀`, `∃`, `fun`, `λ`, `Π`, `Σ`) is returned whole: its arrows are not top-level implications.
 */
export function splitTopLevelArrows(type: string): string[] {
  const text = normalizeWhitespace(type);
  if (/^(∀|∃|∃!|fun\b|λ|Π|Σ)/.test(text)) return [text];
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? '';
    if (OPENERS.includes(c)) depth++;
    else if (CLOSERS.includes(c)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && (c === '→' || (c === '-' && text[i + 1] === '>'))) {
      parts.push(text.slice(start, i).trim());
      start = i + (c === '→' ? 1 : 2);
      if (c !== '→') i++;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

/** The offset of the first top-level `:` (not `:=`) in `text`, outside brackets, or -1. */
export function topLevelColon(text: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? '';
    if (OPENERS.includes(c)) depth++;
    else if (CLOSERS.includes(c)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && c === ':' && text[i + 1] !== '=' && text[i - 1] !== ':') return i;
  }
  return -1;
}

/** A binder group `(a b : T)`, `{a : T}`, `[C]`, `⦃a : T⦄` of a declaration signature. */
export interface Binder {
  explicit: boolean;
  names: string[];
  type: string;
}

/** Splits `(a b : A) {c : C} [D]` into binder groups; returns undefined when the text is not only binders. */
export function parseBinders(text: string): Binder[] | undefined {
  const binders: Binder[] = [];
  let i = 0;
  const src = text.trim();
  while (i < src.length) {
    while (i < src.length && /\s/.test(src[i] ?? '')) i++;
    if (i >= src.length) break;
    const open = src[i] ?? '';
    const close = open === '(' ? ')' : open === '{' ? '}' : open === '[' ? ']' : open === '⦃' ? '⦄' : '';
    if (!close) return undefined;
    let depth = 0;
    let j = i;
    for (; j < src.length; j++) {
      const c = src[j] ?? '';
      if (OPENERS.includes(c)) depth++;
      else if (CLOSERS.includes(c)) {
        depth--;
        if (depth === 0) break;
      }
    }
    if (j >= src.length) return undefined;
    const inner = src.slice(i + 1, j);
    const colon = topLevelColon(inner);
    if (colon < 0) binders.push({ explicit: open === '(', names: [], type: inner.trim() });
    else {
      const names = inner.slice(0, colon).trim().split(/\s+/).filter(Boolean);
      binders.push({ explicit: open === '(', names, type: inner.slice(colon + 1).trim() });
    }
    i = j + 1;
  }
  return binders;
}

const IDENT = /(?:«[^»]*»|[\p{L}_][\p{L}\p{N}_'!?₀-₉ₐ-ₜ]*)(?:\.(?:«[^»]*»|[\p{L}_][\p{L}\p{N}_'!?₀-₉ₐ-ₜ]*))*/gu;

/** Identifier tokens (dotted names) of a text, with their offsets; comments and strings should be blanked first. */
export function identifierTokens(text: string): Array<{ text: string; start: number }> {
  const out: Array<{ text: string; start: number }> = [];
  for (const match of text.matchAll(IDENT)) {
    const start = match.index ?? 0;
    const before = start > 0 ? text[start - 1] ?? '' : '';
    if (before && /[\p{L}\p{N}_'.]/u.test(before)) continue;
    out.push({ text: match[0], start });
  }
  return out;
}

/** True when `name` occurs as a whole identifier token in `text` (comments and strings ignored). */
export function hasToken(text: string, name: string): boolean {
  return identifierTokens(blankComments(text)).some((t) => t.text === name || t.text.startsWith(`${name}.`));
}

/**
 * The enclosing namespaces (outermost first) at `offset`, from `namespace X` / `section` / `end` commands at column 0
 * before it (comments ignored). One call scans the text before `offset`; for many lookups in one text use
 * `namespaceTable` (one pass, then a binary search per lookup).
 */
export function namespaceAt(text: string, offset: number): string[] {
  return namespaceTable(text.slice(0, offset))(offset);
}

/**
 * A lookup of the enclosing namespaces (outermost first) at any offset of `text`, built in one pass over the text's
 * column-0 `namespace X` / `section` / `end` lines (comments ignored), so a file with many blocks costs one scan
 * instead of one per block.
 */
export function namespaceTable(text: string): (offset: number) => string[] {
  const clean = blankComments(text);
  const stack: Array<{ kind: 'namespace' | 'section'; parts: string[] }> = [];
  /** After the line starting at `offset`, the namespaces are `namespaces`. */
  const changes: Array<{ offset: number; namespaces: string[] }> = [];
  let lineStart = 0;
  for (const line of clean.split('\n')) {
    const start = lineStart;
    lineStart += line.length + 1;
    const ns = /^namespace\s+(\S+)/.exec(line);
    if (ns) stack.push({ kind: 'namespace', parts: (ns[1] ?? '').split('.').filter(Boolean) });
    else if (/^section(\s|$)/.test(line)) stack.push({ kind: 'section', parts: [] });
    else if (/^end(\s|$)/.test(line)) stack.pop();
    else continue;
    changes.push({ offset: start, namespaces: stack.flatMap((entry) => entry.parts) });
  }
  return (offset: number): string[] => {
    // The last change whose line starts before `offset` (a command line counts once its start is passed).
    let lo = 0;
    let hi = changes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((changes[mid]?.offset ?? Infinity) < offset) lo = mid + 1;
      else hi = mid;
    }
    return lo === 0 ? [] : [...(changes[lo - 1]?.namespaces ?? [])];
  };
}

/** The candidates a name written inside `namespace` may refer to, innermost first (`_root_.` honoured). */
export function resolutionCandidates(name: string, namespace: readonly string[]): string[] {
  if (name.startsWith('_root_.')) return [name.slice('_root_.'.length)];
  const out: string[] = [];
  for (let i = namespace.length; i > 0; i--) out.push(`${namespace.slice(0, i).join('.')}.${name}`);
  out.push(name);
  return out;
}

/** One line for labels and messages: the text cut to `max` characters (code points) with `…`. */
export function cutText(text: string, max = 60): string {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim());
  return chars.length <= max ? chars.join('') : `${chars.slice(0, max - 1).join('')}…`;
}

/** Compares Lean names the way `#print axioms` orders them (`Name.cmp`: fewer components first, then by string). */
export function compareLeanNames(a: string, b: string): number {
  const pa = a.split('.');
  const pb = b.split('.');
  if (pa.length !== pb.length) return pa.length - pb.length;
  for (let i = 0; i < pa.length; i++) {
    const x = pa[i] ?? '';
    const y = pb[i] ?? '';
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
