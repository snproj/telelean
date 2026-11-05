/**
 * Which names a declaration's text may refer to, read without Lean (docs/m1-plan.md section 6.2 `usersOf` while the
 * facts are stale; M2 carry-over 1 `externalUsers`). Deliberately generous: a possible use found too often only
 * means one more question or one more "used by" line, a missed one means something others use changes silently.
 * Moved here from edit/dependents.ts (unchanged) so the board's graph builder can use it too.
 */
import type { DeclInfo, ParsedFile } from '../markup/types.js';
import { blankComments } from './text.js';

/** The text of a declaration after its name (signature and value), comments and strings blanked. */
export function declBody(file: ParsedFile, decl: DeclInfo): string {
  return blankComments(file.text.slice(decl.nameSpan?.end ?? decl.keywordSpan.end, decl.span.end));
}

/**
 * The namespaces opened before each offset of a file (`open A B`, `open A in`, `open scoped A`, `open A (x)`,
 * `open A hiding x`, `open A renaming x → y`), read from the text with comments blanked. Deliberately generous: an
 * `open … in` or an `open` inside a section is taken to apply to everything after it in the file (a possible use
 * found too often only means one more question, a missed one means a `.holds` removed while others use it).
 */
export function openedNamespaces(file: ParsedFile): (offset: number) => string[] {
  const clean = blankComments(file.text);
  const opens: Array<{ offset: number; names: string[] }> = [];
  const pattern = /(^|\n)[ \t]*open[ \t]+([^\n]*)/g;
  for (const match of clean.matchAll(pattern)) {
    const offset = (match.index ?? 0) + (match[1] ?? '').length;
    const names: string[] = [];
    for (const word of (match[2] ?? '').split(/[\s()]+/)) {
      if (word === '' || word === 'scoped') continue;
      if (word === 'in' || word === 'hiding' || word === 'renaming' || word.includes('→') || word === '->') break;
      if (/^[\p{L}_«][\p{L}\p{N}_'.!?«»]*$/u.test(word)) names.push(word);
    }
    if (names.length > 0) opens.push({ offset, names });
  }
  return (offset: number) => opens.filter((o) => o.offset < offset).flatMap((o) => o.names);
}

/** The names a token written inside `namespace` with `opened` namespaces may refer to (generous). */
export function candidatesOf(token: string, namespace: readonly string[], opened: readonly string[]): string[] {
  const out: string[] = [];
  const written = token.startsWith('_root_.') ? token.slice('_root_.'.length) : token;
  out.push(written);
  if (written !== token) return out;
  for (let i = namespace.length; i > 0; i--) out.push(`${namespace.slice(0, i).join('.')}.${token}`);
  for (const open of opened) {
    // `open A` inside `namespace N` opens `N.A` (or `A` itself).
    for (let i = namespace.length; i >= 0; i--) out.push(`${[...namespace.slice(0, i), open].join('.')}.${token}`);
  }
  return out;
}
