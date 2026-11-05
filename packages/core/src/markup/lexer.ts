/**
 * A Lean 4.35 lexer for comments, literals and identifiers: enough to find telelean blocks and declaration headers
 * without being fooled by comment delimiters inside strings, characters, raw strings or «escaped» names.
 *
 * Mirrors `Lean/Parser/Basic.lean` of the pinned toolchain:
 *  - `whitespace`: `--` starts a line comment; `/-` starts a block comment, `/--` a doc comment and `/-!` a module
 *    doc comment;
 *  - `finishCommentBlock`: block comments nest (`/-` opens, `-/` closes). For a plain comment the nesting scan
 *    starts after the third character (`whitespace` skips the character after `/-`). The doc tokens `/--` and `/-!`
 *    are three characters long and, like every token, are followed by whitespace — spaces, line breaks, `--` line
 *    comments and plain `/- -/` comments — before the comment body starts. Verified with Lean 4.35: `/-/-/` is one
 *    complete comment, `/--/ doc -/` a valid docstring, `/-- -- -/` and `/-! -- -/` unterminated (the line comment
 *    eats the closer), and `/-- -- note⏎real doc -/` documents "real doc ";
 *  - `tokenFnAux`: strings (`\` escapes the next character), character literals (`'a'`, `'\n'`, `'\x41'`,
 *    `'α'`; a `'` followed by `'` starts none), numbers (decimal with `_`, `0b`/`0o`/`0x`, scientific), raw
 *    strings `r#"…"#`, identifiers (dotted, with «escaped» parts; `isIdFirst`/`isIdRest`).
 * An unterminated comment or string runs to the end of the text, as in Lean. Interpolated strings (`s!"…"`, `m!"…"`,
 * `f!"…"`) skip their `{…}` parts as code, so a quote inside the braces does not end them. Whitespace is Lean's
 * (space, tab, CR, LF); any other character outside the above is a one-code-point symbol. Comments and tokens are
 * disjoint and sorted by offset; offsets are UTF-16 code units.
 */
import { codePointAt, cpWidth, isIdFirst, isIdRest, isLeanWhitespace } from './chars.js';
import type { CommentKind, LeanComment, LeanToken, LexResult, TokenKind } from './types.js';

const CR = 0x0d;
const BANG = 0x21;
const QUOTE = 0x22;
const HASH = 0x23;
const APOS = 0x27;
const DASH = 0x2d;
const DOT = 0x2e;
const SLASH = 0x2f;
const BACKSLASH = 0x5c;
const UNDERSCORE = 0x5f;
const LOWER_R = 0x72;
const LBRACE = 0x7b;
const RBRACE = 0x7d;
const GUILLEMET_OPEN = 0xab;
const GUILLEMET_CLOSE = 0xbb;

/** Identifiers whose syntax takes an interpolated string right after them. */
const INTERPOLATING = new Set(['s!', 'm!', 'f!']);

const isDigit = (c: number) => c >= 0x30 && c <= 0x39;
const isHexDigit = (c: number) => isDigit(c) || (c >= 0x61 && c <= 0x66) || (c >= 0x41 && c <= 0x46);

/** The code point that ends just before `index`, or -1. */
function codePointBefore(text: string, index: number): number {
  if (index <= 0) return -1;
  const low = text.charCodeAt(index - 1);
  if (low >= 0xdc00 && low <= 0xdfff && index >= 2) {
    const high = text.charCodeAt(index - 2);
    if (high >= 0xd800 && high <= 0xdbff) return text.codePointAt(index - 2) ?? -1;
  }
  return low;
}

/** Lexes Lean 4.35 source: comments (nesting), strings, chars, raw strings, «»-identifiers (research r4 lexer). */
export function lexLean(text: string): LexResult {
  const comments: LeanComment[] = [];
  const tokens: LeanToken[] = [];
  const n = text.length;
  const at = (i: number) => (i >= 0 && i < n ? text.charCodeAt(i) : -1);

  /** Nesting scan of a block comment from `scanFrom`: the offset just after its closer, or -1 when unterminated. */
  const finishCommentBlock = (scanFrom: number): number => {
    let depth = 1;
    let k = scanFrom;
    while (k < n) {
      const c = text.charCodeAt(k);
      if (c === DASH && at(k + 1) === SLASH) {
        k += 2;
        if (--depth === 0) return k;
      } else if (c === SLASH && at(k + 1) === DASH) {
        k += 2;
        depth++;
      } else {
        k++;
      }
    }
    return -1;
  };

  /**
   * Lean's `whitespace` after a token: spaces, tabs, line breaks, `--` line comments and plain block comments (not
   * `/--` or `/-!`, which are tokens). Returns where it stops, or -1 when a plain comment there is unterminated.
   */
  const skipTokenWhitespace = (from: number): number => {
    let p = from;
    for (;;) {
      const c = at(p);
      if (c === 0x20 || c === 0x09 || c === CR || c === 0x0a) p++;
      else if (c === DASH && at(p + 1) === DASH) {
        const newline = text.indexOf('\n', p);
        if (newline < 0) return n;
        p = newline;
      } else if (c === SLASH && at(p + 1) === DASH && at(p + 2) !== DASH && at(p + 2) !== BANG) {
        const end = finishCommentBlock(p + 2 < n ? p + 2 + cpWidth(codePointAt(text, p + 2)) : n);
        if (end < 0) return -1;
        p = end;
      } else return p;
    }
  };

  /** Whether the `"` at `i` opens an interpolated string (`s!"`, `m!"`, `f!"` with nothing glued before the name). */
  const interpolationAt = (i: number): boolean => {
    if (i < 2 || at(i - 1) !== BANG || !INTERPOLATING.has(text.slice(i - 2, i))) return false;
    const before = codePointBefore(text, i - 2);
    return !(before >= 0 && (isIdRest(before) || before === DOT || before === GUILLEMET_CLOSE));
  };

  /** End of the string literal opening at `i`, or `n` when unterminated. */
  const scanString = (i: number): number => {
    const interpolated = interpolationAt(i);
    let j = i + 1;
    while (j < n) {
      const c = text.charCodeAt(j);
      if (c === BACKSLASH) j += 2;
      else if (c === QUOTE) return j + 1;
      else if (interpolated && c === LBRACE) j = skipInterpolation(j + 1);
      else j++;
    }
    return n;
  };

  /** End of a character literal opening at `i`, or -1 when this `'` starts none (Lean: "missing end of character literal"). */
  const scanChar = (i: number): number => {
    const c = codePointAt(text, i + 1);
    if (c < 0) return -1;
    let k = -1;
    if (c === BACKSLASH) {
      const e = at(i + 2);
      if (e === BACKSLASH || e === QUOTE || e === APOS || e === 0x72 || e === 0x6e || e === 0x74) k = i + 3;
      else if (e === 0x78 && isHexDigit(at(i + 3)) && isHexDigit(at(i + 4))) k = i + 5;
      else if (e === 0x75 && [3, 4, 5, 6].every((d) => isHexDigit(at(i + d)))) k = i + 7;
    } else {
      k = i + 1 + cpWidth(c);
    }
    return k > 0 && at(k) === APOS ? k + 1 : -1;
  };

  /** End of the raw string at `i` (`r`, `#`s, `"` … `"`, the same `#`s), or -1 when `r` does not start one. */
  const scanRawString = (i: number): number => {
    let j = i + 1;
    while (at(j) === HASH) j++;
    if (at(j) !== QUOTE) return -1;
    const close = `"${'#'.repeat(j - i - 1)}`;
    const k = text.indexOf(close, j + 1);
    return k < 0 ? n : k + close.length;
  };

  const scanDigits = (from: number, ok: (c: number) => boolean): number => {
    let j = from;
    while (j < n && (ok(text.charCodeAt(j)) || text.charCodeAt(j) === UNDERSCORE)) j++;
    return j;
  };

  /** End of the number at `i` (a digit). Right after a `.` only digits are read (`h.1.2` is two projections). */
  const scanNumber = (i: number): number => {
    const base = at(i + 1) | 0x20;
    if (at(i) === 0x30 && (base === 0x62 || base === 0x6f || base === 0x78)) {
      const ok = base === 0x62 ? (c: number) => c === 0x30 || c === 0x31 : base === 0x6f ? (c: number) => c >= 0x30 && c <= 0x37 : isHexDigit;
      return scanDigits(i + 2, ok);
    }
    let j = scanDigits(i, isDigit);
    if (at(i - 1) === DOT) return j;
    if (at(j) === DOT && at(j + 1) !== DOT) j = scanDigits(j + 1, isDigit);
    if ((at(j) | 0x20) === 0x65) {
      let k = j + 1;
      if (at(k) === 0x2b || at(k) === DASH) k++;
      if (isDigit(at(k))) j = scanDigits(k, isDigit);
    }
    return j;
  };

  /** End of the dotted identifier at `i`, or -1 when it starts with an unterminated «. */
  const scanIdent = (i: number): number => {
    let j = i;
    for (;;) {
      const cp = codePointAt(text, j);
      if (cp === GUILLEMET_OPEN) {
        const k = text.indexOf('»', j + 1);
        if (k < 0) return -1;
        j = k + 1;
      } else if (isIdFirst(cp)) {
        j += cpWidth(cp);
        for (let r = codePointAt(text, j); r >= 0 && isIdRest(r); r = codePointAt(text, j)) j += cpWidth(r);
      } else {
        return j;
      }
      if (at(j) !== DOT) return j;
      const next = codePointAt(text, j + 1);
      if (isIdFirst(next) || (next === GUILLEMET_OPEN && text.indexOf('»', j + 2) >= 0)) j++;
      else return j;
    }
  };

  /** Skips the code of an interpolation `{…}` (from just after the `{`) through its matching `}`; records nothing. */
  const skipInterpolation = (start: number): number => {
    let i = start;
    let depth = 0;
    while (i < n) {
      const end = scanItem(i, false);
      if (end > i) {
        i = end;
        continue;
      }
      const c = text.charCodeAt(i);
      if (c === LBRACE) depth++;
      else if (c === RBRACE && depth-- === 0) return i + 1;
      i += cpWidth(codePointAt(text, i));
    }
    return n;
  };

  /**
   * Lexes the comment, literal or identifier starting at `i` (recording it when `record`) and returns its end, or
   * returns `i` when the character there is whitespace or a symbol.
   */
  const scanItem = (i: number, record: boolean): number => {
    const c = text.charCodeAt(i);
    if (c === DASH && at(i + 1) === DASH) {
      const newline = text.indexOf('\n', i);
      const next = newline < 0 ? n : newline;
      const end = newline > i + 2 && text.charCodeAt(newline - 1) === CR ? newline - 1 : next;
      if (record) comments.push({ kind: 'line', span: { start: i, end }, body: { start: i + 2, end }, unterminated: false });
      return next;
    }
    if (c === SLASH && at(i + 1) === DASH) {
      const third = at(i + 2);
      const kind: CommentKind = third === DASH ? 'doc' : third === BANG ? 'moddoc' : 'block';
      let bodyStart: number;
      let end: number;
      if (kind === 'block') {
        bodyStart = Math.min(i + 2, n);
        end = finishCommentBlock(i + 2 < n ? i + 2 + cpWidth(codePointAt(text, i + 2)) : n);
      } else {
        const after = skipTokenWhitespace(i + 3);
        bodyStart = after < 0 ? Math.min(i + 3, n) : after;
        end = after < 0 ? -1 : finishCommentBlock(after);
      }
      if (record) {
        comments.push(
          end < 0
            ? { kind, span: { start: i, end: n }, body: { start: bodyStart, end: n }, unterminated: true }
            : { kind, span: { start: i, end }, body: { start: bodyStart, end: Math.max(bodyStart, end - 2) }, unterminated: false },
        );
      }
      return end < 0 ? n : end;
    }
    let kind: TokenKind = 'symbol';
    let end = -1;
    if (c === QUOTE) {
      kind = 'string';
      end = scanString(i);
    } else if (c === APOS && at(i + 1) !== APOS) {
      kind = 'char';
      end = scanChar(i);
    } else if (isDigit(c)) {
      kind = 'number';
      end = scanNumber(i);
    } else if (c === LOWER_R) {
      kind = 'string';
      end = scanRawString(i);
    }
    if (end < 0) {
      const cp = codePointAt(text, i);
      if (cp === GUILLEMET_OPEN || isIdFirst(cp)) {
        kind = 'ident';
        end = scanIdent(i);
      }
    }
    if (end <= i) return i;
    if (record) tokens.push({ kind, span: { start: i, end }, text: text.slice(i, end) });
    return end;
  };

  let i = 0;
  while (i < n) {
    if (isLeanWhitespace(text.charCodeAt(i))) {
      i++;
      continue;
    }
    const end = scanItem(i, true);
    if (end > i) {
      i = end;
      continue;
    }
    const width = cpWidth(codePointAt(text, i));
    tokens.push({ kind: 'symbol', span: { start: i, end: i + width }, text: text.slice(i, i + width) });
    i += width;
  }
  return { comments, tokens };
}

/** True when `name` is exactly one Lean identifier (dotted, «escaped» parts allowed), e.g. `Spyro.cynder_not_good`. */
export function isLeanName(name: string): boolean {
  if (name.length === 0) return false;
  const { comments, tokens } = lexLean(name);
  const only = tokens[0];
  return comments.length === 0 && tokens.length === 1 && only !== undefined && only.kind === 'ident' && only.span.start === 0 && only.span.end === name.length;
}

/** Splits a dotted name into its components, keeping «escaped» parts whole (`A.«b.c»` -> `A`, `«b.c»`). */
export function nameComponents(name: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inEscape = false;
  for (const ch of name) {
    if (ch === '«') inEscape = true;
    else if (ch === '»') inEscape = false;
    if (ch === '.' && !inEscape) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

/** `«x»` -> `x` when `x` is a plain identifier part (Lean prints such names without the escape); other parts unchanged. */
function canonicalNamePart(part: string): string {
  if (part.length < 3 || !part.startsWith('«') || !part.endsWith('»')) return part;
  const inner = part.slice(1, -1);
  const cps = Array.from(inner, (ch) => ch.codePointAt(0) ?? -1);
  const first = cps[0];
  return first !== undefined && isIdFirst(first) && cps.every(isIdRest) ? inner : part;
}

/** A name as Lean prints it: unnecessary «» removed per component (`«cynder»` -> `cynder`, `«a b»` kept). */
export function canonicalName(name: string): string {
  return nameComponents(name).map(canonicalNamePart).join('.');
}
