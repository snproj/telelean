/**
 * Syntactic declarations of one file (docs/m1-plan.md section 6.1): a header parser
 * (`[docComment] [@[attrs]]* modifiers* keyword [name]`), namespace/section/mutual scopes, declaration spans and
 * value starts, and the header's imports. The semantic layer confirms all of it; this only has to be right for
 * files written in the usual style (telelean writes every command at column 0).
 *
 * Command starts (where a declaration's span ends): a line whose first character, at column 0, begins `@[`, a `#`
 * command, or one of the command words below (declaration keywords, modifiers, `end`, `namespace`, `section`, `open`,
 * …, `import`); also every line where a declaration header starts, at any indentation (so indented namespaces and
 * `mutual` blocks split correctly). `deriving` counts only as `deriving instance` (a bare `deriving Repr` line is a
 * clause of the inductive above it).
 *
 * A line that begins with a comment at column 0 (`--`, `/-`, `/--`, `/-!`, a telelean block) is a command start only
 * when the next code after the comment begins a command (a line of the list above) or there is no more code: Lean
 * treats comments as whitespace, so a column-0 comment inside a tactic proof or a multi-line statement, followed by
 * more indented code, belongs to that declaration (cutting the declaration there would cut the proof in half).
 */
import { canonicalName, nameComponents } from './lexer.js';
import type { Lines } from './text.js';
import type { DeclInfo, DeclKeyword, LeanComment, LeanToken, LexResult, Span } from './types.js';

/** Declaration keywords (`class inductive` and `class abbrev` are recognised from `class`). */
export const DECL_KEYWORDS: ReadonlySet<string> = new Set([
  'axiom',
  'theorem',
  'lemma',
  'def',
  'abbrev',
  'opaque',
  'instance',
  'example',
  'inductive',
  'coinductive',
  'structure',
  'class',
  'mutual',
]);

/** Declaration modifiers, in any order. */
export const MODIFIERS: ReadonlySet<string> = new Set([
  'private',
  'public',
  'protected',
  'noncomputable',
  'unsafe',
  'partial',
  'nonrec',
  'scoped',
  'local',
  'meta',
]);

/** Words that start a command when they begin a line at column 0 (plan 6.1, plus a few commands it omits). */
const COMMAND_WORDS: ReadonlySet<string> = new Set([
  ...DECL_KEYWORDS,
  ...MODIFIERS,
  'end',
  'namespace',
  'section',
  'open',
  'export',
  'variable',
  'universe',
  'set_option',
  'attribute',
  'notation',
  'infix',
  'infixl',
  'infixr',
  'prefix',
  'postfix',
  'macro',
  'macro_rules',
  'syntax',
  'elab',
  'elab_rules',
  'deriving',
  'initialize',
  'builtin_initialize',
  'import',
  'declare_syntax_cat',
  'add_decl_doc',
  'include',
  'omit',
  'module',
  'prelude',
]);

/** True for a word that starts a command when it begins a line (declaration keywords, modifiers, `end`, `open`, …). */
export function isCommandWord(word: string): boolean {
  return COMMAND_WORDS.has(word);
}

const OPENERS: ReadonlySet<string> = new Set(['(', '[', '{', '⦃', '⟨', '⟦']);
const CLOSERS: ReadonlySet<string> = new Set([')', ']', '}', '⦄', '⟩', '⟧']);

/** A comment or a token, in text order (comments and tokens never overlap). */
export interface Item {
  start: number;
  end: number;
  comment?: LeanComment;
  token?: LeanToken;
  /** Index into the lexer's tokens, for a token. */
  tokenIndex?: number;
}

/** A `namespace`/`section`/`mutual` opener or an `end`. */
export interface ScopeEvent {
  kind: 'open' | 'close';
  scope?: 'namespace' | 'section' | 'mutual';
  /** The name as written after the keyword, if any (may be dotted). */
  name?: string;
  /** Offset of the keyword. */
  offset: number;
  /** Index of the matching event in `scopes` (opener <-> its `end`). */
  match?: number;
}

export interface DeclScan {
  decls: DeclInfo[];
  scopes: ScopeEvent[];
  imports: string[];
  /** All comments and tokens in order. */
  items: Item[];
  /** The enclosing namespace components at an offset, outermost first (from the scope events; binary search). */
  namespaceAt: (offset: number) => string[];
}

interface Header {
  start: number;
  doc?: LeanComment;
  attributes: Span[];
  modifiers: string[];
  keyword: DeclKeyword;
  keywordSpan: Span;
  name?: LeanToken;
  /** Offset where the header ends (after the name, the keyword, or an instance priority). */
  end: number;
  /** Index of the first token after the header. */
  nextToken: number;
}

/** The number of leading elements of a sorted sequence for which `before(i)` holds (binary search). */
export function lowerBound(length: number, before: (index: number) => boolean): number {
  let lo = 0;
  let hi = length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (before(mid)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Merges comments and tokens into one sorted list. */
export function mergeItems(lex: LexResult): Item[] {
  const items: Item[] = [];
  const { comments, tokens } = lex;
  let c = 0;
  let t = 0;
  while (c < comments.length || t < tokens.length) {
    const comment = comments[c];
    const token = tokens[t];
    if (comment !== undefined && (token === undefined || comment.span.start < token.span.start)) {
      items.push({ start: comment.span.start, end: comment.span.end, comment });
      c++;
    } else if (token !== undefined) {
      items.push({ start: token.span.start, end: token.span.end, token, tokenIndex: t });
      t++;
    }
  }
  return items;
}

const isWord = (token: LeanToken | undefined, word: string) => token !== undefined && token.kind === 'ident' && token.text === word;
const isSymbol = (token: LeanToken | undefined, symbol: string) => token !== undefined && token.kind === 'symbol' && token.text === symbol;
const glued = (a: LeanToken | undefined, b: LeanToken | undefined) => a !== undefined && b !== undefined && a.span.end === b.span.start;

/** Scans the declarations, scopes and imports of a lexed file. */
export function scanDecls(text: string, lex: LexResult, lines: Lines): DeclScan {
  const { tokens, comments } = lex;
  const items = mergeItems(lex);
  const commandStart = new Set<number>();
  const headers: Header[] = [];
  const scopes: ScopeEvent[] = [];
  let consumedUntil = -1;

  const firstTokenAtOrAfter = (offset: number) => lowerBound(tokens.length, (i) => (tokens[i]?.span.start ?? Infinity) < offset);
  const isAttributeStart = (t: number) => isSymbol(tokens[t], '@') && isSymbol(tokens[t + 1], '[') && glued(tokens[t], tokens[t + 1]);
  /** From `@` at `t`: the index just after the matching `]`. */
  const skipAttribute = (t: number): number => {
    let depth = 0;
    let k = t + 1;
    for (; k < tokens.length; k++) {
      const tok = tokens[k];
      if (isSymbol(tok, '[')) depth++;
      else if (isSymbol(tok, ']') && --depth === 0) return k + 1;
    }
    return k;
  };

  /** Parses a declaration header made of an optional doc comment and the tokens from index `firstToken`. */
  const parseHeader = (doc: LeanComment | undefined, firstToken: number): Header | undefined => {
    let t = firstToken;
    const first = tokens[t];
    if (first === undefined) return undefined;
    if (doc !== undefined) {
      // A second docstring before the keyword is a Lean parse error: no declaration.
      const from = lowerBound(comments.length, (i) => (comments[i]?.span.start ?? Infinity) <= doc.span.start);
      for (let c = from; c < comments.length && (comments[c]?.span.start ?? Infinity) < first.span.start; c++) {
        if (comments[c]?.kind === 'doc') return undefined;
      }
    }
    const attributes: Span[] = [];
    while (isAttributeStart(t)) {
      const end = skipAttribute(t);
      attributes.push({ start: tokens[t]?.span.start ?? 0, end: tokens[end - 1]?.span.end ?? text.length });
      t = end;
    }
    const modifiers: string[] = [];
    for (let tok = tokens[t]; tok?.kind === 'ident' && MODIFIERS.has(tok.text); tok = tokens[++t]) modifiers.push(tok.text);
    const kw = tokens[t];
    if (kw === undefined || kw.kind !== 'ident' || !DECL_KEYWORDS.has(kw.text)) return undefined;
    let keyword = kw.text as DeclKeyword;
    let keywordSpan: Span = kw.span;
    t++;
    const second = tokens[t];
    if (keyword === 'class' && second !== undefined && (isWord(second, 'inductive') || isWord(second, 'abbrev'))) {
      keyword = `class ${second.text}` as DeclKeyword;
      keywordSpan = { start: kw.span.start, end: second.span.end };
      t++;
    }
    let end = keywordSpan.end;
    if (keyword === 'instance' && isSymbol(tokens[t], '(') && isWord(tokens[t + 1], 'priority') && isSymbol(tokens[t + 2], ':') && isSymbol(tokens[t + 3], '=')) {
      let depth = 0;
      for (; t < tokens.length; t++) {
        const tok = tokens[t];
        if (isSymbol(tok, '(')) depth++;
        else if (tok !== undefined && isSymbol(tok, ')') && --depth === 0) {
          end = tok.span.end;
          t++;
          break;
        }
      }
    }
    let name: LeanToken | undefined;
    const candidate = tokens[t];
    if (keyword !== 'example' && keyword !== 'mutual' && candidate?.kind === 'ident') {
      name = candidate;
      end = candidate.span.end;
      t++;
    }
    return {
      start: doc?.span.start ?? first.span.start,
      ...(doc ? { doc } : {}),
      attributes,
      modifiers,
      keyword,
      keywordSpan,
      ...(name ? { name } : {}),
      end,
      nextToken: t,
    };
  };

  /** Lines that begin with a comment at column 0, with the comment's end (resolved after the scan). */
  const commentLines: Array<{ line: number; end: number }> = [];
  let previousEndLine = -1;
  for (let k = 0; k < items.length; k++) {
    const item = items[k];
    if (item === undefined) continue;
    const line = lines.lineOf(item.start);
    const lineInitial = line !== previousEndLine;
    previousEndLine = lines.lineOf(item.end);
    if (!lineInitial) continue;
    const lineEnd = lines.contentEnd(line);

    // The line's first code item: skip plain comments that end on this line when more follows on it.
    let m = k;
    for (;;) {
      const here = items[m];
      const next = items[m + 1];
      if (here?.comment === undefined || here.comment.kind === 'doc' || here.end > lineEnd || next === undefined || next.start >= lineEnd) break;
      m++;
    }
    const code = items[m];

    if (item.start === lines.start(line)) {
      if (item.comment !== undefined) {
        commentLines.push({ line, end: item.end });
      } else if (item.token !== undefined && item.tokenIndex !== undefined) {
        const tok = item.token;
        const next = tokens[item.tokenIndex + 1];
        const word = tok.kind === 'ident' && COMMAND_WORDS.has(tok.text) && (tok.text !== 'deriving' || isWord(next, 'instance'));
        const hashCommand = isSymbol(tok, '#') && next?.kind === 'ident' && glued(tok, next);
        if (word || hashCommand || isAttributeStart(item.tokenIndex)) commandStart.add(line);
      }
    }
    if (code === undefined) continue;

    if (code.start >= consumedUntil && (code.comment?.kind === 'doc' || code.tokenIndex !== undefined)) {
      const header =
        code.comment !== undefined ? parseHeader(code.comment, firstTokenAtOrAfter(code.end)) : parseHeader(undefined, code.tokenIndex ?? tokens.length);
      if (header !== undefined) {
        headers.push(header);
        commandStart.add(line);
        consumedUntil = header.end;
      }
    }

    if (code.tokenIndex !== undefined) {
      let t = code.tokenIndex;
      for (;;) {
        const tok = tokens[t];
        if (isAttributeStart(t)) t = skipAttribute(t);
        else if (tok?.kind === 'ident' && MODIFIERS.has(tok.text)) t++;
        else break;
      }
      const word = tokens[t];
      const after = tokens[t + 1];
      if (word !== undefined && word.span.start < lineEnd) {
        const prefixed = t !== code.tokenIndex;
        const name = after !== undefined && after.kind === 'ident' && after.span.start < lineEnd ? { name: after.text } : {};
        const before = scopes.length;
        if (isWord(word, 'namespace') && !prefixed) scopes.push({ kind: 'open', scope: 'namespace', offset: word.span.start, ...name });
        else if (isWord(word, 'section')) scopes.push({ kind: 'open', scope: 'section', offset: word.span.start, ...name });
        else if (isWord(word, 'end') && !prefixed) scopes.push({ kind: 'close', offset: word.span.start, ...name });
        else if (isWord(word, 'mutual') && !prefixed) scopes.push({ kind: 'open', scope: 'mutual', offset: word.span.start });
        // A scope command starts a command at any indentation (these words never begin a line inside a term).
        if (scopes.length > before) commandStart.add(line);
      }
    }
  }

  // Match openers with their `end`s and record the namespace in force after each event.
  const stack: Array<{ event: number; scope: 'namespace' | 'section' | 'mutual'; component?: string }> = [];
  const namespaceAfter: string[][] = [];
  scopes.forEach((event, index) => {
    if (event.kind === 'open') {
      const scope = event.scope ?? 'section';
      const components = scope === 'mutual' || event.name === undefined ? [undefined] : nameComponents(event.name);
      for (const component of components) stack.push({ event: index, scope, ...(component !== undefined ? { component } : {}) });
    } else {
      const top = stack[stack.length - 1];
      const count = top?.scope === 'mutual' || event.name === undefined ? 1 : nameComponents(event.name).length;
      let opener: number | undefined;
      for (let i = 0; i < count && stack.length > 0; i++) opener = stack.pop()?.event;
      const open = opener !== undefined ? scopes[opener] : undefined;
      if (opener !== undefined && open !== undefined) {
        event.match = opener;
        open.match = index;
      }
    }
    namespaceAfter.push(stack.filter((f) => f.scope === 'namespace' && f.component !== undefined).map((f) => canonicalName(f.component ?? '')));
  });
  const namespaceAt = (offset: number): string[] => {
    const count = lowerBound(scopes.length, (i) => (scopes[i]?.offset ?? Infinity) < offset);
    return count === 0 ? [] : [...(namespaceAfter[count - 1] ?? [])];
  };

  // A column-0 comment ends the declaration above it only when the code after it starts a command (or there is none):
  // a comment followed by more indented code (a tactic proof, a multi-line statement) is inside the declaration.
  const codeStarts = new Set(commandStart);
  for (const { line, end } of commentLines) {
    const next = tokens[firstTokenAtOrAfter(end)];
    if (next === undefined || codeStarts.has(lines.lineOf(next.span.start))) commandStart.add(line);
  }

  const commandStartLines = [...commandStart].sort((a, b) => a - b);
  const nextCommandLine = (afterLine: number): number =>
    commandStartLines[lowerBound(commandStartLines.length, (i) => (commandStartLines[i] ?? Infinity) <= afterLine)] ?? lines.count;

  const decls = headers.map((header): DeclInfo => {
    const headerLine = lines.lineOf(header.end);
    const mutualOpen = header.keyword === 'mutual' ? scopes.findIndex((e) => e.offset === header.keywordSpan.start) : -1;
    const mutualClose = mutualOpen >= 0 ? scopes[mutualOpen]?.match : undefined;
    let endLine: number;
    if (mutualClose !== undefined) {
      endLine = lines.lineOf(scopes[mutualClose]?.offset ?? header.end);
    } else {
      endLine = nextCommandLine(headerLine) - 1;
      while (endLine > headerLine && lines.isBlank(endLine)) endLine--;
    }
    const span: Span = { start: header.start, end: Math.max(header.end, lines.contentEnd(endLine)) };
    const namespace = namespaceAt(header.start);
    const decl: DeclInfo = { keyword: header.keyword, namespace, modifiers: header.modifiers, span, range: lines.range(span), keywordSpan: header.keywordSpan };
    if (header.name !== undefined) {
      decl.name = header.name.text;
      decl.fullName = resolveName(header.name.text, namespace);
      decl.nameSpan = header.name.span;
    }
    if (header.attributes.length > 0) decl.attributes = header.attributes.map((a) => text.slice(a.start, a.end));
    if (header.doc !== undefined) {
      decl.docstring = text.slice(header.doc.body.start, header.doc.body.end).trim();
      decl.docSpan = header.doc.span;
    }
    const valueStart = findValueStart(tokens, header, span, lines);
    if (valueStart !== undefined) decl.valueStart = valueStart;
    return decl;
  });

  return { decls, scopes, imports: scanImports(tokens), items, namespaceAt };
}

/** `name` resolved against the enclosing namespaces (`_root_.` honoured), as Lean prints it. */
export function resolveName(name: string, namespace: readonly string[]): string {
  const written = canonicalName(name);
  if (written.startsWith('_root_.')) return written.slice('_root_.'.length);
  return namespace.length > 0 ? `${namespace.join('.')}.${written}` : written;
}

/**
 * The first top-level `:=`, `where` or `|` after the header (skipping brackets; strings and comments are not
 * tokens). `|` counts when it begins a line or the declaration is an inductive type (elsewhere it may be notation
 * such as `|x|`). Axioms and `mutual` blocks have none.
 */
function findValueStart(tokens: readonly LeanToken[], header: Header, span: Span, lines: Lines): number | undefined {
  if (header.keyword === 'axiom' || header.keyword === 'mutual') return undefined;
  const inductive = header.keyword === 'inductive' || header.keyword === 'coinductive' || header.keyword === 'class inductive';
  let depth = 0;
  for (let t = header.nextToken; t < tokens.length; t++) {
    const tok = tokens[t];
    if (tok === undefined || tok.span.start >= span.end) break;
    if (tok.kind === 'symbol') {
      if (OPENERS.has(tok.text)) depth++;
      else if (CLOSERS.has(tok.text)) depth = Math.max(0, depth - 1);
      else if (depth === 0 && tok.text === ':' && isSymbol(tokens[t + 1], '=') && glued(tok, tokens[t + 1])) return tok.span.start;
      else if (depth === 0 && tok.text === '|' && (inductive || lines.isLineInitial(tok.span.start))) return tok.span.start;
    } else if (depth === 0 && isWord(tok, 'where')) {
      return tok.span.start;
    }
  }
  return undefined;
}

/** Module names of the header's `import` lines (`module`, `prelude`, `public`/`meta` and `import all` allowed). */
function scanImports(tokens: readonly LeanToken[]): string[] {
  const imports: string[] = [];
  let t = 0;
  if (isWord(tokens[t], 'module')) t++;
  if (isWord(tokens[t], 'prelude')) t++;
  for (;;) {
    let u = t;
    if (isWord(tokens[u], 'public')) u++;
    if (isWord(tokens[u], 'meta')) u++;
    if (!isWord(tokens[u], 'import')) break;
    u++;
    if (isWord(tokens[u], 'all')) u++;
    const module = tokens[u];
    if (module === undefined || module.kind !== 'ident') break;
    imports.push(module.text);
    t = u + 1;
  }
  return imports;
}
