/**
 * Text helpers for the semantic layer: line indexes, Lean (code point) to LSP (UTF-16) positions, and the few
 * pieces of Lean source scanning the facts need (docstrings, the `instance` keyword, import headers).
 *
 * Lean reports message positions as a 1-based line and a 0-based column counted in Unicode code points; the board
 * (and the `.ilean` files) use LSP positions: 0-based line and UTF-16 code units. A character outside the Basic
 * Multilingual Plane (e.g. `𝔸`) is one code point but two UTF-16 units, so columns after it differ.
 */
import type { Position } from '@telelean/core';

/** Start offsets (UTF-16 indexes into the string) of every line; lines end at `\n` (a preceding `\r` stays in the line). */
export function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  return starts;
}

/** The text of a 0-based line (without its `\n`), or undefined past the end. */
export function lineText(text: string, starts: readonly number[], line: number): string | undefined {
  const start = starts[line];
  if (start === undefined) return undefined;
  const next = starts[line + 1];
  return text.slice(start, next === undefined ? text.length : next - 1);
}

/**
 * UTF-16 length of the first `codePoints` code points of `line`. Columns past the end of the line count one unit
 * each (Lean can point just past the last character).
 */
export function codePointsToUtf16(line: string, codePoints: number): number {
  let units = 0;
  let seen = 0;
  for (const ch of line) {
    if (seen >= codePoints) return units;
    units += ch.length;
    seen++;
  }
  return units + Math.max(0, codePoints - seen);
}

/**
 * Converts a Lean message position (1-based line, 0-based code-point column) to an LSP position (0-based line,
 * UTF-16 character) using the source text the build saw. Without the text the column is kept as is.
 */
export function leanToLspPosition(line1: number, column: number, text?: string, starts?: readonly number[]): Position {
  const line = Math.max(0, line1 - 1);
  if (text === undefined) return { line, character: column };
  const lineContent = lineText(text, starts ?? lineStarts(text), line);
  return { line, character: lineContent === undefined ? column : codePointsToUtf16(lineContent, column) };
}

/** UTF-16 offset of an LSP position, or undefined when the line does not exist. Characters are clamped to the line. */
export function offsetOf(text: string, starts: readonly number[], pos: Position): number | undefined {
  const start = starts[pos.line];
  if (start === undefined) return undefined;
  const next = starts[pos.line + 1];
  const end = next === undefined ? text.length : next - 1;
  return Math.min(start + Math.max(0, pos.character), end);
}

/** The LSP position of a UTF-16 offset (offsets past the end land on the last line). */
export function positionAt(starts: readonly number[], offset: number): Position {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((starts[mid] ?? 0) <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo, character: Math.max(0, offset - (starts[lo] ?? 0)) };
}

/** Every run of whitespace becomes one space; leading and trailing whitespace is removed. */
export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/gu, ' ').trim();
}

/**
 * The end offset (just past `-/`) of the block comment that starts at `start` (`/-`, `/--` or `/-!`), honouring
 * nesting as Lean does; undefined when it is not terminated.
 */
export function blockCommentEnd(text: string, start: number): number | undefined {
  if (!text.startsWith('/-', start)) return undefined;
  let depth = 1;
  let i = start + 2;
  while (i < text.length) {
    if (text.startsWith('/-', i)) {
      depth++;
      i += 2;
    } else if (text.startsWith('-/', i)) {
      depth--;
      i += 2;
      if (depth === 0) return i;
    } else {
      i++;
    }
  }
  return undefined;
}

/** The docstring (between `/--` and `-/`, trimmed) that starts exactly at `offset`, if any. */
export function docstringAt(text: string, offset: number): string | undefined {
  if (!text.startsWith('/--', offset) || text.startsWith('/--/', offset)) return undefined;
  const end = blockCommentEnd(text, offset);
  if (end === undefined) return undefined;
  return text.slice(offset + 3, end - 2).trim();
}

/**
 * The docstring that ends right before `offset` (only whitespace in between), with its start offset. Used for
 * auxiliary declarations such as structure fields, whose `.ilean` entry gives only the name's range.
 */
export function docstringBefore(text: string, offset: number): { start: number; text: string } | undefined {
  let i = offset;
  while (i > 0 && /\s/u.test(text.charAt(i - 1))) i--;
  if (!text.startsWith('-/', i - 2)) return undefined;
  // Walk back over candidate `/--` openings; the right one is the closest whose comment ends exactly at `i`.
  for (let open = text.lastIndexOf('/--', i - 2); open >= 0; open = open === 0 ? -1 : text.lastIndexOf('/--', open - 1)) {
    const end = blockCommentEnd(text, open);
    if (end === i) {
      const doc = docstringAt(text, open);
      return doc === undefined ? undefined : { start: open, text: doc };
    }
  }
  return undefined;
}

/** Characters of a Lean identifier (letters of any script, digits incl. subscripts, `_`, `'`, `!`, `?`). */
const IDENT_CHAR = /[\p{L}\p{N}_'!?]/u;
/** Modifiers (and attribute kinds) that may precede a declaration keyword. */
const DECL_MODIFIERS = new Set(['private', 'protected', 'public', 'noncomputable', 'unsafe', 'partial', 'nonrec', 'meta', 'scoped', 'local']);

/** Skips whitespace, line comments and block comments (doc comments included) from `i`. */
function skipTrivia(text: string, i: number): number {
  for (;;) {
    while (i < text.length && /\s/u.test(text.charAt(i))) i++;
    if (text.startsWith('--', i)) {
      const nl = text.indexOf('\n', i);
      i = nl < 0 ? text.length : nl + 1;
    } else if (text.startsWith('/-', i)) {
      const end = blockCommentEnd(text, i);
      if (end === undefined) return text.length;
      i = end;
    } else {
      return i;
    }
  }
}

/** Skips a balanced `@[ … ]` attribute block at `i` (brackets inside strings are not special-cased). */
function skipAttributes(text: string, i: number): number {
  let depth = 0;
  for (let j = i + 1; j < text.length; j++) {
    const c = text.charAt(j);
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return j + 1;
    }
  }
  return text.length;
}

/**
 * The declaration keyword at `offset` (the start of a declaration's full range), after its docstring, attributes
 * and modifiers: e.g. `instance` for `/-- doc -/ @[simp] noncomputable instance foo : …`. Undefined when no word
 * follows.
 */
export function declKeywordAt(text: string, offset: number): string | undefined {
  let i = offset;
  for (let guard = 0; guard < 64; guard++) {
    i = skipTrivia(text, i);
    if (text.startsWith('@[', i)) {
      i = skipAttributes(text, i);
      continue;
    }
    let j = i;
    while (j < text.length && IDENT_CHAR.test(text.charAt(j))) j++;
    if (j === i) return undefined;
    const word = text.slice(i, j);
    if (!DECL_MODIFIERS.has(word)) return word;
    i = j;
  }
  return undefined;
}

/**
 * The modules a Lean file imports, from its header: an optional `module`/`prelude`, then `import` commands
 * (with the module-system forms `public import`, `meta import`, `import all`). Stops at the first other token.
 */
export function parseImports(text: string): string[] {
  const imports: string[] = [];
  let i = 0;
  const word = (): string | undefined => {
    i = skipTrivia(text, i);
    if (i >= text.length) return undefined;
    let j = i;
    if (text.charAt(j) === '«') {
      // Escaped module names: keep the guillemets as written; such names never match a project module path.
      while (j < text.length && !/\s/u.test(text.charAt(j))) {
        if (text.charAt(j) === '»') {
          j++;
          if (j >= text.length || /\s/u.test(text.charAt(j))) break;
        } else j++;
      }
    } else {
      while (j < text.length && !/\s/u.test(text.charAt(j))) j++;
    }
    return text.slice(i, j);
  };
  const advance = (w: string): void => {
    i += w.length;
  };
  for (let guard = 0; guard < 100_000; guard++) {
    const w = word();
    if (w === undefined) break;
    if (w === 'module' || w === 'prelude' || w === 'public' || w === 'private' || w === 'meta') {
      advance(w);
      continue;
    }
    if (w !== 'import') break;
    advance(w);
    let name = word();
    if (name === 'all' || name === 'runtime') {
      advance(name);
      name = word();
    }
    if (name === undefined) break;
    advance(name);
    imports.push(name);
  }
  return imports;
}
