/**
 * Lean text operations (docs/m1-plan.md section 6.2): the D-11 kind-change rewrites and the D-9 docstring mirror,
 * planned by WP-model and applied here to one file. All or nothing: any problem means no edits. Slice 2 (2b2) adds
 * `replace-decl`, which puts back another version's text of a declaration (taking an item's content out, §4.11).
 */
import { holdsName } from '../facts.js';
import { isCommandWord } from './decls.js';
import { deletionEdit } from './edits.js';
import { isLeanName, lexLean } from './lexer.js';
import { findDecl, relativeName } from './names.js';
import { Lines } from './text.js';
import type { ArchivedDecl, DeclInfo, LeanOp, LeanOpsResult, LeanToken, ParsedFile, Span, TextEdit } from './types.js';
import { escapeBodyText } from './values.js';

/** Applies Lean text operations to one file (all or nothing: check `problems`). */
export function applyLeanOps(file: ParsedFile, ops: readonly LeanOp[]): LeanOpsResult {
  const { text, eol } = file;
  const lines = new Lines(text);
  const tokens = lexLean(text).tokens;
  const edits: TextEdit[] = [];
  const archived: ArchivedDecl[] = [];
  const problems: string[] = [];
  const where = (offset: number) => {
    const p = lines.position(offset);
    return `${file.path}:${p.line + 1}:${p.character + 1}`;
  };

  const need = (name: string, what: string): DeclInfo | undefined => {
    const decl = findDecl(file, name);
    if (decl === undefined) problems.push(`${what} \`${name}\` is not declared in ${file.path}.`);
    return decl;
  };
  /** A declaration about to be removed or replaced must not hold a telelean block (e.g. between its docstring and keyword). */
  const holdsNoBlock = (decl: DeclInfo, name: string): boolean => {
    const inside = file.blocks.find((b) => b.span.start >= decl.span.start && b.span.end <= decl.span.end);
    if (inside !== undefined) problems.push(`\`${name}\` contains the telelean block \`${inside.id}\` (${where(inside.span.start)}); edit it by hand.`);
    return inside === undefined;
  };
  const textOf = (decl: DeclInfo) => text.slice(decl.span.start, decl.span.end);
  /**
   * A declaration about to be removed or replaced must end where its span ends: the code right after the span must
   * not be an indented line that continues it (the span would cut the declaration in half, e.g. a proof).
   */
  const endsCleanly = (decl: DeclInfo, name: string): boolean => {
    const index = tokenIndexAtOrAfter(tokens, decl.span.end);
    const next = tokens[index];
    if (next === undefined) return true;
    const start = next.span.start;
    const lineStart = lines.start(lines.lineOf(start));
    const indentedLineStart = start > lineStart && lines.isLineInitial(start);
    const after = tokens[index + 1];
    const glued = after !== undefined && after.span.start === next.span.end;
    const commandStart =
      (next.kind === 'ident' && isCommandWord(next.text)) ||
      (next.kind === 'symbol' && next.text === '@' && glued && after.text === '[') ||
      (next.kind === 'symbol' && next.text === '#' && glued && after.kind === 'ident') ||
      file.decls.some((d) => d.span.start <= start && start <= d.keywordSpan.start);
    if (!indentedLineStart || commandStart) return true;
    problems.push(`Where \`${name}\` ends is unclear: the indented line at ${where(start)} looks like part of it. Edit it by hand.`);
    return false;
  };
  /**
   * The occurrence spans of an op: inside the declaration, after its name, each an identifier (or a dotted prefix of
   * one); with `allowAt`, a span may also start at an `@` right before the identifier.
   */
  const occurrences = (decl: DeclInfo, name: string, spans: readonly Span[], allowAt = false): boolean => {
    const after = decl.nameSpan?.end ?? decl.keywordSpan.end;
    let ok = true;
    for (const span of spans) {
      const start = allowAt && text.charAt(span.start) === '@' ? span.start + 1 : span.start;
      const token = tokenAt(tokens, start);
      const isIdentifier =
        token !== undefined &&
        token.kind === 'ident' &&
        span.end > start &&
        (span.end === token.span.end || (span.end < token.span.end && text.charAt(span.end) === '.'));
      if (!isIdentifier || span.start < after || span.end > decl.span.end) {
        problems.push(`The occurrence ${JSON.stringify(text.slice(span.start, span.end))} at ${where(span.start)} is not an identifier inside \`${name}\`.`);
        ok = false;
      }
    }
    return ok;
  };
  /**
   * The application around an occurrence (`@` allowed) with exactly `count` plain identifier arguments in parentheses:
   * `(occ a₁ … aₖ)`, or nested `((occ a₁) a₂)`. Undefined for any other shape (no parentheses, a compound argument,
   * too few or too many arguments, a comment in between, an occurrence that is a prefix of a longer name).
   */
  const application = (span: Span, count: number): Span | undefined => {
    const idStart = text.charAt(span.start) === '@' ? span.start + 1 : span.start;
    if (tokenAt(tokens, idStart)?.span.end !== span.end) return undefined;
    let start = span.start;
    let end = span.end;
    let got = 0;
    while (got < count) {
      const open = tokens[tokenIndexAtOrAfter(tokens, start) - 1];
      if (open === undefined || open.kind !== 'symbol' || open.text !== '(' || text.slice(open.span.end, start).trim() !== '') return undefined;
      let j = tokenIndexAtOrAfter(tokens, end);
      let previous = end;
      let args = 0;
      for (let arg = tokens[j]; arg !== undefined && arg.kind === 'ident' && !NOT_AN_ARGUMENT.has(arg.text); arg = tokens[++j]) {
        if (arg.span.start === previous || text.slice(previous, arg.span.start).trim() !== '') return undefined;
        previous = arg.span.end;
        args++;
      }
      const close = tokens[j];
      if (args === 0 || got + args > count || close === undefined || close.kind !== 'symbol' || close.text !== ')' || text.slice(previous, close.span.start).trim() !== '') {
        return undefined;
      }
      start = open.span.start;
      end = close.span.end;
      got += args;
    }
    return { start, end };
  };
  /** The applications of the occurrences (see `application`), or undefined after reporting the first that is not one. */
  const applications = (decl: DeclInfo, spans: readonly Span[], count: number): Span[] | undefined => {
    const out: Span[] = [];
    for (const span of spans) {
      const app = application(span, count);
      if (app === undefined || app.end > decl.span.end) {
        const occurrence = text.slice(span.start, span.end);
        problems.push(
          `The use of \`${occurrence}\` at ${where(span.start)} is not applied to its ${count} hypothes${count === 1 ? 'is' : 'es'} in parentheses (\`(${occurrence} h …)\`), so it cannot be rewritten mechanically: choose "mark broken" instead.`,
        );
        return undefined;
      }
      out.push(app);
    }
    return out;
  };
  const validHypothesis = (hypName: string): boolean => {
    if (isLeanName(hypName) && !hypName.includes('.')) return true;
    problems.push(`\`${hypName}\` is not a valid hypothesis name.`);
    return false;
  };

  const addedHolds = new Set<string>();
  /** Declarations to delete; merged at the end so neighbours removed together leave tidy spacing. */
  const removals: Span[] = [];
  for (const op of ops) {
    switch (op.op) {
      case 'add-holds-axiom': {
        const statement = need(op.statement, 'The statement');
        if (statement === undefined) break;
        if (findDecl(file, holdsName(op.statement)) !== undefined || addedHolds.has(op.statement)) {
          problems.push(`\`${holdsName(op.statement)}\` already exists in ${file.path}.`);
          break;
        }
        addedHolds.add(op.statement);
        const indent = lines.indent(lines.lineOf(statement.span.start));
        edits.push({ span: { start: statement.span.end, end: statement.span.end }, newText: `${eol}${indent}${holdsAxiom(op.statement, statement.namespace)}` });
        break;
      }
      case 'holds-theorem-to-axiom': {
        const name = holdsName(op.statement);
        const holds = need(name, 'The justification');
        if (holds === undefined) break;
        if (holds.keyword !== 'theorem' && holds.keyword !== 'lemma') {
          problems.push(`\`${name}\` is ${holds.keyword === 'axiom' ? 'already an axiom' : `a ${holds.keyword}, not a theorem`}.`);
          break;
        }
        if (!holdsNoBlock(holds, name) || !endsCleanly(holds, name)) break;
        archived.push({ name, text: textOf(holds) });
        edits.push({ span: holds.span, newText: holdsAxiom(op.statement, holds.namespace) });
        break;
      }
      case 'remove-holds':
      case 'remove-decl': {
        const name = op.op === 'remove-holds' ? holdsName(op.statement) : op.name;
        const decl = need(name, op.op === 'remove-holds' ? 'The justification' : 'The declaration');
        if (decl === undefined || !holdsNoBlock(decl, name) || !endsCleanly(decl, name)) break;
        if (op.archive) archived.push({ name, text: textOf(decl) });
        removals.push(decl.span);
        break;
      }
      case 'add-hypothesis': {
        const decl = need(op.decl, 'The declaration');
        if (decl === undefined || !validHypothesis(op.hypName)) break;
        if (decl.nameSpan === undefined) {
          problems.push(`\`${op.decl}\` has no name to put a hypothesis after.`);
          break;
        }
        if (/[\r\n]/.test(op.hypType) || lexLean(op.hypType).comments.length > 0 || op.hypType.trim() === '') {
          problems.push(`The hypothesis type ${JSON.stringify(op.hypType)} is not a one-line Lean term.`);
          break;
        }
        if (!occurrences(decl, op.decl, op.replace, true)) break;
        const applied = op.applied ?? 0;
        const targets = applied > 0 ? applications(decl, op.replace, applied) : [...op.replace];
        if (targets === undefined) break;
        // After the name and its universe parameters (`foo.{u}`), before every existing binder.
        let at = decl.nameSpan.end;
        if (text.startsWith('.{', at)) {
          const close = text.indexOf('}', at);
          if (close > 0) at = close + 1;
        }
        edits.push({ span: { start: at, end: at }, newText: ` (${op.hypName} : ${op.hypType.trim()})` });
        for (const span of targets) edits.push({ span, newText: op.hypName });
        break;
      }
      case 'drop-arguments': {
        const decl = need(op.decl, 'The declaration');
        if (decl === undefined || !occurrences(decl, op.decl, op.replace, true)) break;
        if (!Number.isInteger(op.args) || op.args < 1) {
          problems.push(`drop-arguments needs a positive number of arguments, got ${op.args}.`);
          break;
        }
        const targets = applications(decl, op.replace, op.args);
        if (targets === undefined) break;
        op.replace.forEach((span, i) => {
          const app = targets[i];
          if (app !== undefined) edits.push({ span: app, newText: text.slice(span.start, span.end) });
        });
        break;
      }
      case 'apply-hypothesis': {
        const decl = need(op.decl, 'The declaration');
        if (decl === undefined || !validHypothesis(op.hypName) || !occurrences(decl, op.decl, op.replace, true)) break;
        for (const span of op.replace) {
          const start = text.charAt(span.start - 1) === '@' && text.charAt(span.start) !== '@' ? span.start - 1 : span.start;
          edits.push({ span: { start, end: span.end }, newText: `(${text.slice(start, span.end)} ${op.hypName})` });
        }
        break;
      }
      case 'replace-decl': {
        // 2b2 (§4.11): B's text of a declaration back in place of the current one.
        const decl = need(op.name, 'The declaration');
        if (decl === undefined || !holdsNoBlock(decl, op.name) || !endsCleanly(decl, op.name)) break;
        const replacement = op.text.split(/\r?\n/).join(eol);
        const lexed = lexLean(replacement);
        if (replacement.trim() === '') {
          problems.push(`The text to put back for \`${op.name}\` is empty.`);
          break;
        }
        if (lexed.comments.some((c) => c.unterminated) || /@@\s*telelean\b/.test(replacement)) {
          problems.push(`The text to put back for \`${op.name}\` is not one complete declaration (an unterminated comment, or a telelean block).`);
          break;
        }
        edits.push({ span: decl.span, newText: replacement });
        break;
      }
      case 'set-docstring': {
        const decl = need(op.decl, 'The declaration');
        if (decl === undefined) break;
        const doc = `/-- ${escapeBodyText(op.text.split(/\r?\n/).join(eol))} -/`;
        if (decl.docSpan !== undefined) {
          edits.push({ span: decl.docSpan, newText: doc });
        } else {
          const separator = lines.isLineInitial(decl.span.start) ? `${eol}${lines.indent(lines.lineOf(decl.span.start))}` : ' ';
          edits.push({ span: { start: decl.span.start, end: decl.span.start }, newText: `${doc}${separator}` });
        }
        break;
      }
      default: {
        const unknown: never = op;
        problems.push(`Unknown Lean operation ${JSON.stringify(unknown)}.`);
      }
    }
  }

  // Removed declarations separated only by whitespace go in one deletion (one blank line stays, not two).
  const merged: Span[] = [];
  for (const span of [...removals].sort((a, b) => a.start - b.start || a.end - b.end)) {
    const last = merged[merged.length - 1];
    if (last !== undefined && span.start >= last.end && text.slice(last.end, span.start).trim() === '') merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, span.end) };
    else merged.push(span);
  }
  for (const span of merged) edits.push(deletionEdit(text, span, lines));

  if (problems.length === 0) {
    const sorted = [...edits].sort((a, b) => a.span.start - b.span.start || a.span.end - b.span.end);
    for (let i = 1; i < sorted.length; i++) {
      const previous = sorted[i - 1];
      const current = sorted[i];
      if (previous !== undefined && current !== undefined && current.span.start < previous.span.end) {
        problems.push(`Two operations change overlapping text at ${where(current.span.start)}.`);
        break;
      }
    }
  }
  return problems.length > 0 ? { edits: [], archived: [], problems } : { edits, archived, problems };
}

/**
 * `axiom <rel>.holds : <rel>` with rel = relativeName(statement, namespace) (docs/m1-plan.md 6.2). When the statement
 * is not under the namespace (a `_root_` declaration), both names are written `_root_.<statement>` so the axiom is
 * declared as `<statement>.holds`, not inside the namespace.
 */
function holdsAxiom(statement: string, namespace: readonly string[]): string {
  const prefix = namespace.length > 0 ? `${namespace.join('.')}.` : '';
  const short = statement.startsWith(prefix) ? relativeName(statement, namespace) : `_root_.${statement}`;
  return `axiom ${short}.holds : ${short}`;
}

/** Identifier tokens that are Lean keywords, never a plain argument of an application. */
const NOT_AN_ARGUMENT: ReadonlySet<string> = new Set(['by', 'fun', 'let', 'have', 'show', 'from', 'at', 'with', 'match', 'if', 'then', 'else', 'do', 'in', 'calc', 'where', 'suffices', 'using']);

/** Index of the first token starting at or after `offset` (binary search). */
function tokenIndexAtOrAfter(tokens: readonly LeanToken[], offset: number): number {
  let lo = 0;
  let hi = tokens.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((tokens[mid]?.span.start ?? Infinity) < offset) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The token starting exactly at `offset`, if any. */
function tokenAt(tokens: readonly LeanToken[], offset: number): LeanToken | undefined {
  let lo = 0;
  let hi = tokens.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((tokens[mid]?.span.start ?? Infinity) < offset) lo = mid + 1;
    else hi = mid;
  }
  const token = tokens[lo];
  return token !== undefined && token.span.start === offset ? token : undefined;
}
