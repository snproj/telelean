/**
 * Text edits on model files (docs/m1-plan.md sections 6.1, 6.2): set or remove block fields touching only their
 * lines, remove a block, insert a rendered block with tidy blank lines. Every function returns `TextEdit`s against
 * the parsed text; the rest of the file stays byte-identical, and the file's line breaks (LF or CRLF) are kept.
 */
import { holdsName } from '../facts.js';
import { scanDecls } from './decls.js';
import { canonicalName, lexLean } from './lexer.js';
import { endsWithNewline, isHorizontalSpace, Lines } from './text.js';
import { FIELD_ORDER, type InsertWhere, type KnownFieldKey, type MarkupBlock, type ParsedFile, type Span, type TextEdit } from './types.js';
import { formatFieldValue, LIST_FIELD_KEYS } from './values.js';

/** One field change for `setBlockFields`: a value, or `null` (or an empty list) to remove the field. */
export interface BlockFieldChange {
  key: KnownFieldKey;
  value: string | readonly string[] | null;
}

/** Applies non-overlapping edits (any order) and returns the new text. Throws a RangeError on overlap or a bad span. */
export function applyTextEdits(text: string, edits: readonly TextEdit[]): string {
  const sorted = edits
    .map((edit, index) => ({ edit, index }))
    .sort((a, b) => {
      const byStart = a.edit.span.start - b.edit.span.start;
      if (byStart !== 0) return byStart;
      // At one offset, insertions come before a replacement; otherwise keep the given order.
      const aWidth = a.edit.span.end === a.edit.span.start ? 0 : 1;
      const bWidth = b.edit.span.end === b.edit.span.start ? 0 : 1;
      return aWidth - bWidth || a.index - b.index;
    });
  let out = '';
  let position = 0;
  for (const { edit } of sorted) {
    const { start, end } = edit.span;
    if (!(Number.isInteger(start) && Number.isInteger(end) && start >= 0 && start <= end && end <= text.length)) {
      throw new RangeError(`applyTextEdits: span [${start}, ${end}) is outside the text (length ${text.length})`);
    }
    if (start < position) throw new RangeError(`applyTextEdits: edits overlap at offset ${start}`);
    out += text.slice(position, start) + edit.newText;
    position = end;
  }
  return out + text.slice(position);
}

/** FIELD_ORDER position of a key (unknown and dotted keys come after every known one). */
const rank = (key: string): number => {
  const index = FIELD_ORDER.indexOf(key as KnownFieldKey);
  return index < 0 ? FIELD_ORDER.length : index;
};

/** Where a block's comment body ends (before its `-/`, or at the end of an unterminated comment). */
function bodyEnd(text: string, block: MarkupBlock): number {
  return text.startsWith('-/', block.span.end - 2) && block.span.end - 2 >= block.markerSpan.end ? block.span.end - 2 : block.span.end;
}

/**
 * Sets (or with `null` removes) one known field of a block, touching only that line (inserting it in FIELD_ORDER
 * position when absent). Writes the id line too when the block's id is derived. Values are escaped as needed.
 */
export function setBlockField(file: ParsedFile, block: MarkupBlock, key: KnownFieldKey, value: string | readonly string[] | null): TextEdit[] {
  return setBlockFields(file, block, [{ key, value }]);
}

/**
 * Several field changes of one block as one edit list (so a derived id is written once, and edits never overlap):
 *  - an existing field keeps its line, written key and indentation; only the value changes; repeated lines of a list
 *    field (`premises:`, `lean:`, `tags:`, which add up to one list) are removed, while TL005 duplicates of any other
 *    field are kept (they are text the user typed; TL005 keeps pointing at them);
 *  - a new field goes to its FIELD_ORDER position: before the first remaining line whose key comes later, else
 *    after the last field line, else right after the marker; with that line's indentation;
 *  - `null` or an empty list removes every line of the field (with its line break);
 *  - a later change of the same key wins; when `block.idWritten` is false, `id: <block.id>` is written too.
 */
export function setBlockFields(file: ParsedFile, block: MarkupBlock, changes: readonly BlockFieldChange[]): TextEdit[] {
  const text = file.text;
  const lines = new Lines(text);
  const wanted = new Map<KnownFieldKey, string | readonly string[] | null>();
  for (const change of changes) wanted.set(change.key, change.value);
  if (!block.idWritten && !wanted.has('id')) wanted.set('id', block.id);

  const edits: TextEdit[] = [];
  const removed = new Set<number>();
  const additions: Array<{ key: KnownFieldKey; line: string }> = [];
  const removeLine = (index: number) => {
    const line = block.lines[index];
    if (line === undefined) return;
    removed.add(index);
    const at = text.charCodeAt(line.span.end);
    const end = at === 0x0d ? line.span.end + 2 : at === 0x0a ? line.span.end + 1 : line.span.end;
    edits.push({ span: { start: line.span.start, end }, newText: '' });
  };

  for (const [key, value] of wanted) {
    const indices = block.lines.flatMap((line, index) => (line.key === key ? [index] : []));
    if (value === null || (typeof value !== 'string' && value.length === 0)) {
      indices.forEach(removeLine);
      continue;
    }
    const formatted = formatFieldValue(key, value);
    const [first, ...duplicates] = indices;
    const line = first !== undefined ? block.lines[first] : undefined;
    if (line === undefined) {
      additions.push({ key, line: `${key}: ${formatted}` });
      continue;
    }
    const { start, end } = line.valueSpan;
    const before = text.charAt(start - 1) === ':' ? ' ' : '';
    const after = text.startsWith('-/', end) ? ' ' : '';
    edits.push({ span: { start, end }, newText: `${before}${formatted}${after}` });
    if (LIST_FIELD_KEYS.has(key)) duplicates.forEach(removeLine);
  }
  if (additions.length === 0) return edits;

  // Group the new lines by insertion point (FIELD_ORDER within a group).
  const survivors = block.lines.filter((_, index) => !removed.has(index));
  const openerIndent = lines.indent(lines.lineOf(block.span.start));
  const groups = new Map<string, { before: boolean; offset: number; indent: string; lines: string[] }>();
  for (const addition of additions.sort((a, b) => rank(a.key) - rank(b.key))) {
    const r = rank(addition.key);
    const next = survivors.find((line) => rank(line.key) > r);
    const last = survivors[survivors.length - 1];
    let point: { before: boolean; offset: number; indent: string };
    if (next !== undefined) point = { before: true, offset: next.span.start, indent: lines.indent(lines.lineOf(next.span.start)) };
    else if (last !== undefined) point = { before: false, offset: last.span.end, indent: lines.indent(lines.lineOf(last.span.start)) };
    else {
      const markerLine = lines.lineOf(block.markerSpan.start);
      const offset = Math.max(block.markerSpan.end, Math.min(lines.contentEnd(markerLine), bodyEnd(text, block)));
      point = { before: false, offset, indent: markerLine === lines.lineOf(block.span.start) ? openerIndent : lines.indent(markerLine) };
    }
    const id = `${point.before ? 'before' : 'after'}:${point.offset}`;
    const group = groups.get(id);
    if (group !== undefined) group.lines.push(addition.line);
    else groups.set(id, { ...point, lines: [addition.line] });
  }
  for (const group of groups.values()) {
    let newText: string;
    if (group.before) {
      newText = group.lines.map((line) => `${group.indent}${line}${file.eol}`).join('');
    } else {
      newText = group.lines.map((line) => `${file.eol}${group.indent}${line}`).join('');
      // A closer right after the insertion point goes to its own line, so no value is glued to `-/`.
      if (text.startsWith('-/', group.offset)) newText += `${file.eol}${openerIndent}`;
    }
    edits.push({ span: { start: group.offset, end: group.offset }, newText });
  }
  return edits;
}

/**
 * A deletion of `span` that keeps the spacing tidy. When the span covers whole lines it takes their line break
 * too, plus one blank line when that would otherwise leave two blank lines in a row (or a blank line at the start
 * of the file); when it removes the end of the file, the blank line before it goes. A span sharing its line with
 * other code removes only itself and the adjacent spaces.
 */
export function deletionEdit(text: string, span: Span, lines: Lines = new Lines(text)): TextEdit {
  const startLine = lines.lineOf(span.start);
  const endLine = lines.lineOf(span.end);
  const lineInitial = lines.isLineInitial(span.start);
  const restBlank = isHorizontalSpace(text, span.end, lines.contentEnd(endLine));
  let start = span.start;
  let end = span.end;
  if (lineInitial && restBlank) {
    start = lines.start(startLine);
    end = lines.fullEnd(endLine);
    const previousBlank = startLine === 0 || lines.isBlank(startLine - 1);
    const next = endLine + 1;
    const blankFollows = next < lines.count && lines.start(next) < text.length && lines.isBlank(next);
    if (previousBlank && blankFollows) end = lines.fullEnd(next);
    else if (end >= text.length && startLine > 0 && lines.isBlank(startLine - 1)) start = lines.start(startLine - 1);
  } else if (restBlank) {
    while (start > 0 && (text.charCodeAt(start - 1) === 0x20 || text.charCodeAt(start - 1) === 0x09)) start--;
    end = lines.contentEnd(endLine);
  } else {
    while (end < text.length && (text.charCodeAt(end) === 0x20 || text.charCodeAt(end) === 0x09)) end++;
  }
  return { span: { start, end }, newText: '' };
}

/** Removes a block comment and the line break after it (and one blank line, so spacing stays tidy). */
export function removeBlockEdits(file: ParsedFile, block: MarkupBlock): TextEdit[] {
  return [deletionEdit(file.text, block.span)];
}

/**
 * Inserts `blockText` (its line breaks converted to `eol`) at `offset` — a line start, or the end of the text —
 * with exactly one blank line between it and each non-blank neighbour (existing blank lines are reused).
 */
export function insertionEdit(text: string, eol: '\n' | '\r\n', offset: number, blockText: string, lines: Lines = new Lines(text)): TextEdit {
  const block = blockText.split(/\r?\n/).join(eol);
  let prefix: string;
  let suffix = eol;
  if (offset >= text.length && text.length > 0 && !endsWithNewline(text)) {
    prefix = eol + (lines.isBlank(lines.count - 1) ? '' : eol);
  } else {
    const line = lines.lineOf(offset);
    prefix = line === 0 || lines.isBlank(line - 1) ? '' : eol;
    if (lines.start(line) < text.length && !lines.isBlank(line)) suffix += eol;
  }
  return { span: { start: offset, end: offset }, newText: `${prefix}${block}${suffix}` };
}

/**
 * Inserts a rendered block (separated by one blank line from its neighbours) at `where`:
 *  - `end-of-namespace`: before the `end <ns>` line that closes the file's last `namespace <ns>`, else at the end;
 *  - `end-of-file`: at the end (a missing final line break is added first);
 *  - `after-block`: after the block and the declarations bound to it that follow it before the next block (its
 *    adjacent declaration, its pinned names and their `.holds`). Throws when no block has that id.
 */
export function insertBlockEdits(file: ParsedFile, blockText: string, where: InsertWhere): TextEdit[] {
  const text = file.text;
  const lines = new Lines(text);
  let offset = text.length;
  if (where.kind === 'end-of-namespace') {
    const scopes = scanDecls(text, lexLean(text), lines).scopes;
    const wanted = canonicalName(where.namespace);
    for (let i = scopes.length - 1; i >= 0; i--) {
      const event = scopes[i];
      if (event?.kind !== 'open' || event.scope !== 'namespace' || event.name === undefined || canonicalName(event.name) !== wanted) continue;
      const close = event.match !== undefined ? scopes[event.match] : undefined;
      if (close !== undefined) offset = lines.start(lines.lineOf(close.offset));
      break;
    }
  } else if (where.kind === 'after-block') {
    const index = file.blocks.findIndex((b) => b.id === where.blockId);
    const block = file.blocks[index];
    if (block === undefined) throw new Error(`insertBlockEdits: no block with id ${JSON.stringify(where.blockId)} in ${file.path}`);
    const limit = file.blocks[index + 1]?.span.start ?? text.length;
    const names = new Set<string>();
    for (const name of [block.binding.statement, ...(block.binding.pinned ?? [])]) {
      if (name !== undefined) names.add(name).add(holdsName(name));
    }
    let end = block.span.end;
    file.decls.forEach((decl, i) => {
      const bound = i === block.binding.adjacentDecl || (decl.fullName !== undefined && names.has(decl.fullName));
      if (bound && decl.span.start >= block.span.end && decl.span.start < limit) end = Math.max(end, decl.span.end);
    });
    offset = lines.fullEnd(lines.lineOf(end));
  }
  return [insertionEdit(text, file.eol, offset, blockText, lines)];
}
