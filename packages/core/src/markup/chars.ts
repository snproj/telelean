/**
 * Lean 4.35 identifier character classes (`Init/Meta/Defs.lean`: `isLetterLike`, `isSubScriptAlnum`, `isIdFirst`,
 * `isIdRest`), on Unicode code points. `Char.isAlpha` and `Char.isAlphanum` are ASCII-only in Lean.
 */

/** Greek (but λ, Π, Σ), Coptic, polytonic Greek, the letter-like block, script/double-struck/fraktur, Latin-1 and Latin Extended-A letters. */
export function isLetterLike(cp: number): boolean {
  return (
    (cp >= 0x3b1 && cp <= 0x3c9 && cp !== 0x3bb) ||
    (cp >= 0x391 && cp <= 0x3a9 && cp !== 0x3a0 && cp !== 0x3a3) ||
    (cp >= 0x3ca && cp <= 0x3fb) ||
    (cp >= 0x1f00 && cp <= 0x1ffe) ||
    (cp >= 0x2100 && cp <= 0x214f) ||
    (cp >= 0x1d49c && cp <= 0x1d59f) ||
    (cp >= 0x00c0 && cp <= 0x00ff && cp !== 0x00d7 && cp !== 0x00f7) ||
    (cp >= 0x0100 && cp <= 0x017f)
  );
}

/** Subscript digits, letters and the subscript j. */
export function isSubScriptAlnum(cp: number): boolean {
  return (cp >= 0x2080 && cp <= 0x2089) || (cp >= 0x2090 && cp <= 0x209c) || (cp >= 0x1d62 && cp <= 0x1d6a) || cp === 0x2c7c;
}

/** First character of an identifier part: ASCII letter, `_` or letter-like. */
export function isIdFirst(cp: number): boolean {
  return (cp >= 0x61 && cp <= 0x7a) || (cp >= 0x41 && cp <= 0x5a) || cp === 0x5f || isLetterLike(cp);
}

/** Later characters of an identifier part: also digits, `'`, `!`, `?` and subscripts. */
export function isIdRest(cp: number): boolean {
  return isIdFirst(cp) || (cp >= 0x30 && cp <= 0x39) || cp === 0x27 || cp === 0x21 || cp === 0x3f || isSubScriptAlnum(cp);
}

/** Lean's `Char.isWhitespace`: space, tab, carriage return, line feed (nothing else). */
export function isLeanWhitespace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0d || code === 0x0a;
}

/** The code point at `index` (a whole surrogate pair) or -1 past the end. */
export function codePointAt(text: string, index: number): number {
  return index < text.length ? (text.codePointAt(index) ?? -1) : -1;
}

/** Number of UTF-16 code units of the code point `cp`. */
export function cpWidth(cp: number): number {
  return cp > 0xffff ? 2 : 1;
}
