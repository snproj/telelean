/**
 * A reference stand-in for WP-markup's text primitives (markup/api.ts), written from their frozen documentation, so
 * the planner's orchestration can be tested before WP-markup lands (`vi.mock`, see plans.fake.test.ts). The same
 * scenarios run against the real primitives in plans.wp1.test.ts (skipped until WP-markup is implemented).
 * Simplifications: LF line breaks, simple Lean only. Not used by any production code.
 */
import { FIELD_ORDER, type DeclInfo, type InsertWhere, type KnownFieldKey, type LeanOp, type LeanOpsResult, type MarkupBlock, type NewBlock, type ParsedFile, type TextEdit } from '../../../src/markup/types.js';
import { parseFixture } from '../../project/helpers/parseFixture.js';

const findDecl = (file: ParsedFile, name: string): DeclInfo | undefined => file.decls.find((d) => d.fullName === name);
function relativeName(fullName: string, namespace: readonly string[]): string {
  for (let i = namespace.length; i > 0; i--) {
    const prefix = `${namespace.slice(0, i).join('.')}.`;
    if (fullName.startsWith(prefix) && fullName.length > prefix.length) return fullName.slice(prefix.length);
  }
  return fullName;
}

export function escapeJsonValue(value: string): string {
  return JSON.stringify(value)
    .replace(/\/(?=-)/g, '\\u002f')
    .replace(/(?<=-)\//g, '\\/');
}

export function formatFieldValue(key: KnownFieldKey | string, value: string | readonly string[]): string {
  void key;
  if (typeof value !== 'string') return value.join(', ');
  // eslint-disable-next-line no-control-regex
  const needsJson = value.includes('/-') || value.includes('-/') || value.startsWith('"') || /[\u0000-\u001f]/.test(value) || value !== value.trim();
  return needsJson ? escapeJsonValue(value) : value;
}

export function escapeBodyText(body: string): string {
  return body.replace(/-\//g, '-\\/').replace(/\/-/g, '/\\-');
}

export function renderBlock(block: NewBlock, eol: '\n' | '\r\n' = '\n'): string {
  const fields: Array<[string, string | readonly string[] | undefined]> = [
    ['id', block.id],
    ['type', block.type],
    ['natural_name', block.naturalName],
    ['rationale', block.rationale],
    ['stance', block.stance],
    ['source', block.source],
    ['premises', block.premises],
    ['asserted', block.asserted],
    ['lean', block.lean],
  ];
  const lines = ['/-', '@@ telelean v1'];
  for (const [key, value] of fields) if (value !== undefined) lines.push(`${key}: ${formatFieldValue(key, value)}`);
  for (const [key, value] of block.extra ?? []) lines.push(`${key}: ${formatFieldValue(key, value)}`);
  if (block.body !== undefined) lines.push('---', escapeBodyText(block.body));
  lines.push('-/');
  return lines.join(eol);
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .split('-')
      .slice(0, 6)
      .join('-') || 'n-000000'
  );
}

export function deriveId(naturalName: string, taken: (id: string) => boolean): string {
  const base = slug(naturalName);
  if (!taken(base)) return base;
  for (let n = 2; ; n++) if (!taken(`${base}-${n}`)) return `${base}-${n}`;
}

export function applyTextEdits(text: string, edits: readonly TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.span.start - a.span.start || b.span.end - a.span.end);
  let out = text;
  let limit = Infinity;
  for (const edit of sorted) {
    if (edit.span.end > limit) throw new Error('overlapping edits');
    out = out.slice(0, edit.span.start) + edit.newText + out.slice(edit.span.end);
    limit = edit.span.start;
  }
  return out;
}

/** End of the line break after `offset` (or `offset` at EOF). */
function afterLineBreak(text: string, offset: number): number {
  if (text.startsWith('\r\n', offset)) return offset + 2;
  return text[offset] === '\n' ? offset + 1 : offset;
}

export function setBlockField(file: ParsedFile, block: MarkupBlock, key: KnownFieldKey, value: string | readonly string[] | null): TextEdit[] {
  const edits: TextEdit[] = [];
  const inserts = new Map<number, string[]>();
  const insertAfter = (offset: number, line: string) => inserts.set(offset, [...(inserts.get(offset) ?? []), line]);
  const existing = block.lines.find((l) => l.key === key);
  if (value === null) {
    if (existing) edits.push({ span: { start: existing.span.start, end: afterLineBreak(file.text, existing.span.end) }, newText: '' });
  } else {
    const line = `${key}: ${formatFieldValue(key, value)}`;
    if (existing) edits.push({ span: existing.span, newText: line });
    else {
      const order = FIELD_ORDER.indexOf(key);
      const before = block.lines.filter((l) => {
        const i = FIELD_ORDER.indexOf(l.key as KnownFieldKey);
        return i >= 0 && i < order;
      });
      const anchor = before.length > 0 ? (before[before.length - 1]?.span.end ?? block.markerSpan.end) : block.markerSpan.end;
      if (!block.idWritten && key !== 'id' && anchor === block.markerSpan.end) insertAfter(anchor, `id: ${block.id}`);
      insertAfter(anchor, line);
    }
  }
  if (!block.idWritten && key !== 'id' && !inserts.has(block.markerSpan.end)) insertAfter(block.markerSpan.end, `id: ${block.id}`);
  for (const [offset, lines] of inserts) edits.push({ span: { start: offset, end: offset }, newText: lines.map((l) => `${file.eol}${l}`).join('') });
  return edits;
}

export function removeBlockEdits(file: ParsedFile, block: MarkupBlock): TextEdit[] {
  const text = file.text;
  let end = afterLineBreak(text, block.span.end);
  const prevBlank = block.span.start === 0 || text.slice(0, block.span.start).endsWith('\n\n');
  if (prevBlank && text[end] === '\n') end += 1;
  return [{ span: { start: block.span.start, end }, newText: '' }];
}

export function insertBlockEdits(file: ParsedFile, blockText: string, where: InsertWhere): TextEdit[] {
  const text = file.text;
  const eol = file.eol;
  if (where.kind === 'end-of-namespace') {
    const lines = text.split('\n');
    let offset = 0;
    let nsLine = -1;
    const starts: number[] = [];
    lines.forEach((line, i) => {
      starts.push(offset);
      if (line === `namespace ${where.namespace}`) nsLine = i;
      offset += line.length + 1;
    });
    const endLine = lines.findIndex((line, i) => i > nsLine && line === `end ${where.namespace}`);
    if (nsLine >= 0 && endLine >= 0) {
      const endStart = starts[endLine] ?? text.length;
      const contentEnd = text.slice(0, endStart).trimEnd().length;
      return [{ span: { start: contentEnd, end: endStart }, newText: `${eol}${eol}${blockText}${eol}${eol}` }];
    }
  }
  const contentEnd = text.trimEnd().length;
  return [{ span: { start: contentEnd, end: text.length }, newText: `${eol}${eol}${blockText}${eol}` }];
}

export function applyLeanOps(file: ParsedFile, ops: readonly LeanOp[]): LeanOpsResult {
  const result: LeanOpsResult = { edits: [], archived: [], problems: [] };
  const text = file.text;
  const removal = (decl: DeclInfo): TextEdit => ({ span: { start: decl.span.start, end: afterLineBreak(text, decl.span.end) }, newText: '' });
  for (const op of ops) {
    switch (op.op) {
      case 'add-holds-axiom': {
        const decl = findDecl(file, op.statement);
        if (!decl) {
          result.problems.push(`${op.statement} not found.`);
          break;
        }
        const short = relativeName(op.statement, decl.namespace);
        result.edits.push({ span: { start: decl.span.end, end: decl.span.end }, newText: `${file.eol}axiom ${short}.holds : ${short}` });
        break;
      }
      case 'holds-theorem-to-axiom': {
        const holds = findDecl(file, `${op.statement}.holds`);
        if (!holds) {
          result.problems.push(`${op.statement}.holds not found.`);
          break;
        }
        const short = relativeName(op.statement, holds.namespace);
        result.archived.push({ name: `${op.statement}.holds`, text: text.slice(holds.span.start, holds.span.end) });
        result.edits.push({ span: holds.span, newText: `axiom ${short}.holds : ${short}` });
        break;
      }
      case 'remove-holds':
      case 'remove-decl': {
        const name = op.op === 'remove-holds' ? `${op.statement}.holds` : op.name;
        const decl = findDecl(file, name);
        if (!decl) {
          result.problems.push(`${name} not found.`);
          break;
        }
        if (op.archive) result.archived.push({ name, text: text.slice(decl.span.start, decl.span.end) });
        result.edits.push(removal(decl));
        break;
      }
      case 'add-hypothesis': {
        const decl = findDecl(file, op.decl);
        if (!decl?.nameSpan) {
          result.problems.push(`${op.decl} not found.`);
          break;
        }
        result.edits.push({ span: { start: decl.nameSpan.end, end: decl.nameSpan.end }, newText: ` (${op.hypName} : ${op.hypType})` });
        for (const span of op.replace) result.edits.push({ span, newText: op.hypName });
        break;
      }
      case 'apply-hypothesis': {
        for (const span of op.replace) {
          const start = text[span.start - 1] === '@' ? span.start - 1 : span.start;
          result.edits.push({ span: { start, end: span.end }, newText: `(${text.slice(start, span.end)} ${op.hypName})` });
        }
        break;
      }
      case 'set-docstring': {
        const decl = findDecl(file, op.decl);
        if (!decl) {
          result.problems.push(`${op.decl} not found.`);
          break;
        }
        const doc = `/-- ${escapeBodyText(op.text)} -/`;
        if (decl.docSpan) result.edits.push({ span: decl.docSpan, newText: doc });
        else result.edits.push({ span: { start: decl.span.start, end: decl.span.start }, newText: `${doc}${file.eol}` });
        break;
      }
    }
  }
  if (result.problems.length > 0) result.edits = [];
  return result;
}

export function parseLeanFile(path: string, text: string): ParsedFile {
  return parseFixture(path, text);
}

/** Everything the planner imports from markup/api.ts, faked. */
export const fakeMarkup = {
  escapeJsonValue,
  formatFieldValue,
  escapeBodyText,
  renderBlock,
  deriveId,
  applyTextEdits,
  setBlockField,
  removeBlockEdits,
  insertBlockEdits,
  applyLeanOps,
  parseLeanFile,
};
