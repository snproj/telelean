/**
 * `parseLeanFile`: telelean blocks (markup v1, 03 section 3) with their diagnostics, the file's declarations and
 * imports, and each block's binding. Rules of 02/03 that differ from the research prototype: `type:` is canonical
 * and `kind:` a silent alias; there is no DEFINITION kind; a missing version marker means v1 without a diagnostic;
 * `premises:` is allowed on every type; a block without `id:` gets a derived id (TL112).
 */
import type { Evidential, NodeType, Severity, Stance } from '../model.js';
import { EVIDENTIALS, STANCES } from '../model.js';
import { lowerBound, scanDecls, type DeclScan, type Item } from './decls.js';
import { deriveId, ID_PATTERN } from './ids.js';
import { isLeanName, lexLean } from './lexer.js';
import { detectEol, Lines } from './text.js';
import {
  SUPPORTED_MARKUP_VERSIONS,
  type BlockBinding,
  type BlockFields,
  type FieldLine,
  type KnownFieldKey,
  type LeanComment,
  type MarkupBlock,
  type MarkupDiagnostic,
  type ParsedFile,
  type Span,
} from './types.js';
import { isKnownFieldKey, LIST_FIELD_KEYS, noRationaleMessage, parseFieldValue, splitList } from './values.js';

/** `@@ telelean` with an optional `vN` (the first non-blank line of a block). */
const MARKER = /^@@[ \t]*telelean(?:[ \t]+v(\d+))?[ \t]*$/;
/** `key: value`, where key = lcid { "." lcid } (dotted keys are extensions); the value may hold any character (`s`). */
const FIELD = /^([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*)[ \t]*:(.*)$/s;
const TAG = /^[A-Za-z0-9][A-Za-z0-9_./-]*$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:+-]*$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const NODE_TYPES: readonly NodeType[] = ['ASSUMPTION', 'DERIVATION', 'GOAL'];
const LIST_KEYS = LIST_FIELD_KEYS;

/** Normalised key: `kind` is an alias of `type`. */
export function normaliseKey(key: string): string {
  return key === 'kind' ? 'type' : key;
}

interface Segment {
  start: number;
  end: number;
}

/** The lines of `text[start, end)`, each without its line break (the last one ends at `end`). */
function segments(text: string, start: number, end: number): Segment[] {
  const out: Segment[] = [];
  let p = start;
  for (;;) {
    const nl = text.indexOf('\n', p);
    if (nl < 0 || nl >= end) {
      out.push({ start: p, end });
      return out;
    }
    out.push({ start: p, end: nl > p && text.charCodeAt(nl - 1) === 0x0d ? nl - 1 : nl });
    p = nl + 1;
  }
}

const indentWidth = (line: string) => line.length - line.trimStart().length;

/** A block diagnostic recorded before the block's id is known. */
interface PendingDiagnostic {
  code: string;
  severity: Severity;
  message: string;
  span: Span;
}

/** One block before binding and id derivation. */
interface RawBlock {
  comment: LeanComment;
  version: number;
  fields: BlockFields;
  extensions: Record<string, string[]>;
  writtenId?: string;
  body?: string;
  bodySpan?: Span;
  markerSpan: Span;
  lines: FieldLine[];
}

class Diagnostics {
  readonly list: MarkupDiagnostic[] = [];
  constructor(private readonly lines: Lines) {}
  add(code: string, severity: Severity, message: string, span: Span, nodeId?: string): MarkupDiagnostic {
    const diagnostic: MarkupDiagnostic = { code, severity, message, span, range: this.lines.range(span), ...(nodeId !== undefined ? { nodeId } : {}) };
    this.list.push(diagnostic);
    return diagnostic;
  }
}

/**
 * Reads the block in `comment` if its first non-blank line is the marker. Doc and module-doc comments with a marker
 * get TL009 and are ignored. Field diagnostics are collected into `pending` (their node id is known only later).
 */
function readBlock(text: string, comment: LeanComment, diags: Diagnostics, pending: PendingDiagnostic[]): RawBlock | undefined {
  const segs = segments(text, comment.body.start, comment.body.end);
  let s = 0;
  while (s < segs.length && text.slice(segs[s]?.start, segs[s]?.end).trim() === '') s++;
  const markerSeg = segs[s];
  if (markerSeg === undefined) return undefined;
  const markerLine = text.slice(markerSeg.start, markerSeg.end);
  const markerMatch = MARKER.exec(markerLine.trim());
  if (!markerMatch) return undefined;
  const markerStart = markerSeg.start + indentWidth(markerLine);
  const markerSpan: Span = { start: markerStart, end: markerStart + markerLine.trim().length };
  if (comment.kind === 'doc' || comment.kind === 'moddoc') {
    const opener = comment.kind === 'doc' ? '/--' : '/-!';
    diags.add('TL009', 'warning', `This telelean block is inside a doc comment (\`${opener}\`), so it is ignored: use a plain \`/- … -/\` comment.`, markerSpan);
    return undefined;
  }
  const version = markerMatch[1] !== undefined ? Number.parseInt(markerMatch[1], 10) : 1;
  const block: RawBlock = { comment, version, fields: {}, extensions: {}, markerSpan, lines: [] };
  const note = (code: string, severity: Severity, message: string, span: Span) => {
    pending.push({ code, severity, message, span });
  };
  if (comment.unterminated) note('TL010', 'error', 'Unterminated comment: this block swallows the rest of the file (Lean reports "unterminated comment"). Close it with `-/`.', { start: comment.span.start, end: Math.min(comment.span.start + 2, text.length) });
  if (!SUPPORTED_MARKUP_VERSIONS.includes(version)) {
    const newer = version > Math.max(...SUPPORTED_MARKUP_VERSIONS);
    note('TL008', 'warning', `Markup v${version} is ${newer ? 'newer than' : 'not a version'} this telelean understands (v${SUPPORTED_MARKUP_VERSIONS.join(', v')}); the block is shown, unknown fields are kept.`, markerSpan);
  }
  const seen = new Set<string>();
  for (let i = s + 1; i < segs.length; i++) {
    const seg = segs[i];
    if (seg === undefined) continue;
    const raw = text.slice(seg.start, seg.end);
    const content = raw.trim();
    if (content === '') continue;
    const contentStart = seg.start + indentWidth(raw);
    const lineSpan: Span = { start: seg.start, end: seg.end };
    if (content === '---') {
      const rest = segs.slice(i + 1);
      const restText = rest.map((r) => text.slice(r.start, r.end));
      let first = 0;
      let last = restText.length - 1;
      while (first <= last && (restText[first] ?? '').trim() === '') first++;
      while (last >= first && (restText[last] ?? '').trim() === '') last--;
      const kept = restText.slice(first, last + 1);
      const indent = kept.reduce((least, l) => (l.trim() === '' ? least : Math.min(least, indentWidth(l))), Infinity);
      const body = kept.map((l) => l.slice(Math.min(indent, indentWidth(l)))).join('\n');
      if (body !== '') block.body = body;
      const lastSeg = last >= first ? rest[last] : undefined;
      block.bodySpan = { start: seg.start, end: lastSeg !== undefined ? lastSeg.end : seg.end };
      break;
    }
    const match = FIELD.exec(content);
    if (!match || match[1] === undefined || match[2] === undefined) {
      // In an unterminated block the rest of the file is code, not fields: TL010 already says so.
      if (comment.unterminated) break;
      note('TL001', 'error', `Malformed line (expected \`key: value\`): ${JSON.stringify(content.length > 60 ? `${content.slice(0, 60)}…` : content)}`, lineSpan);
      continue;
    }
    const writtenKey = match[1];
    const key = normaliseKey(writtenKey);
    const colon = content.indexOf(':', writtenKey.length);
    const afterColon = content.slice(colon + 1);
    const value = afterColon.trim();
    const valueStart = contentStart + colon + 1 + indentWidth(afterColon);
    const valueSpan: Span = { start: valueStart, end: valueStart + value.length };
    block.lines.push({ key, writtenKey, span: lineSpan, valueSpan, raw: value });
    if (key.includes('.') || !isKnownFieldKey(key)) {
      if (!key.includes('.')) note('TL002', 'warning', `Unknown field \`${key}\` (kept as written; use a dotted key such as \`mytool.${key}\` for tool data).`, lineSpan);
      (block.extensions[key] ??= []).push(value);
      continue;
    }
    if (seen.has(key) && !LIST_KEYS.has(key)) {
      note('TL005', 'error', `Duplicate field \`${key}\` (the first value is used).`, lineSpan);
      continue;
    }
    seen.add(key);
    interpretField(block, key, value, lineSpan, note);
  }
  return block;
}

/** Stores one known field's value in `block.fields`, reporting TL004/TL019 through `note`. */
function interpretField(
  block: RawBlock,
  key: KnownFieldKey,
  raw: string,
  span: Span,
  note: (code: string, severity: Severity, message: string, span: Span) => void,
): void {
  const fields = block.fields;
  if (LIST_KEYS.has(key)) {
    const { items, errors } = splitList(raw);
    for (const error of errors) note('TL004', 'error', `${key}: ${error}`, span);
    const valid = key === 'premises' ? (x: string) => ID_PATTERN.test(x) : key === 'lean' ? isLeanName : (x: string) => TAG.test(x);
    const what = key === 'premises' ? 'node id' : key === 'lean' ? 'Lean name' : 'tag';
    const good: string[] = [];
    for (const item of items) {
      if (valid(item)) good.push(item);
      else note('TL004', 'error', `${key}: ${JSON.stringify(item)} is not a valid ${what}.`, span);
    }
    if (key === 'premises') fields.premises = [...(fields.premises ?? []), ...good];
    else if (key === 'lean') fields.lean = [...(fields.lean ?? []), ...good];
    else fields.tags = [...(fields.tags ?? []), ...good];
    return;
  }
  const parsed = parseFieldValue(raw);
  if (!parsed.ok) {
    note('TL004', 'error', `${key}: ${parsed.error}.`, span);
    return;
  }
  const value = parsed.value;
  const invalid = (expected: string) => note('TL004', 'error', `Invalid ${key} ${JSON.stringify(value)} (expected ${expected}).`, span);
  switch (key) {
    case 'id':
      if (value === '') invalid('a node id');
      else {
        if (!ID_PATTERN.test(value)) invalid('lower-case letters and digits joined by "-", "_" or "."');
        block.writtenId = value;
      }
      return;
    case 'type': {
      const upper = value.toUpperCase();
      const type = NODE_TYPES.find((t) => t === upper);
      if (type === undefined) invalid(NODE_TYPES.join(', '));
      else {
        if (value !== upper) note('TL019', 'hint', `The type is written in upper case: ${upper}.`, span);
        fields.type = type;
      }
      return;
    }
    case 'natural_name':
      if (/[\r\n]/.test(value)) note('TL004', 'warning', 'natural_name should be a single line.', span);
      fields.naturalName = value;
      return;
    case 'rationale':
      fields.rationale = value;
      return;
    case 'stance':
      if ((STANCES as readonly string[]).includes(value)) fields.stance = value as Stance;
      else invalid(STANCES.join(', '));
      return;
    case 'source':
      if ((EVIDENTIALS as readonly string[]).includes(value)) fields.source = value as Evidential;
      else invalid(EVIDENTIALS.join(', '));
      return;
    case 'asserted': {
      const date = DATE.exec(value);
      const month = Number(date?.[2]);
      const day = Number(date?.[3]);
      if (date && month >= 1 && month <= 12 && day >= 1 && day <= 31) fields.asserted = value;
      else invalid('a date YYYY-MM-DD');
      return;
    }
    case 'supersedes':
    case 'refines':
      if (ID_PATTERN.test(value)) fields[key] = value;
      else invalid('a node id');
      return;
    case 'origin':
    case 'worded_by':
      if (value === 'user' || value === 'agent') {
        if (key === 'origin') fields.origin = value;
        else fields.wordedBy = value;
      } else invalid('user or agent');
      return;
    case 'session':
      if (TOKEN.test(value)) fields.session = value;
      else invalid('letters, digits and _ . : + -');
      return;
    default:
      return;
  }
}

/** What follows a block: the declaration it binds to by adjacency, or one after a blank line. */
function findFollowingDecl(text: string, end: number, scan: DeclScan, blockComments: ReadonlySet<LeanComment>): { adjacent?: number; gap?: number } {
  const { items, decls } = scan;
  let p = end;
  for (;;) {
    let q = p;
    let newlines = 0;
    for (; q < text.length; q++) {
      const c = text.charCodeAt(q);
      if (c === 0x0a) newlines++;
      else if (c !== 0x20 && c !== 0x09 && c !== 0x0d) break;
    }
    if (q >= text.length) return {};
    const blank = newlines >= 2;
    const item: Item | undefined = items[lowerBound(items.length, (i) => (items[i]?.start ?? Infinity) < q)];
    if (item === undefined || item.start !== q) return {};
    if (item.comment !== undefined && blockComments.has(item.comment)) return {};
    if (item.comment !== undefined && (item.comment.kind === 'line' || item.comment.kind === 'block')) {
      if (blank) return {};
      p = item.end;
      continue;
    }
    // A doc comment or a token: is it inside a declaration's header (between its start and its keyword)?
    const index = lowerBound(decls.length, (i) => (decls[i]?.span.start ?? Infinity) <= q) - 1;
    const decl = decls[index];
    if (decl === undefined || q > decl.keywordSpan.start) return {};
    return blank ? { gap: index } : { adjacent: index };
  }
}

/**
 * Parses one model file: telelean blocks (with markup diagnostics TL001-TL019, TL112), syntactic declarations,
 * imports, and each block's binding (pinned `lean:` > adjacency; blank line, EOF or another block = code-less).
 * Never throws on bad input: problems become diagnostics.
 */
export function parseLeanFile(path: string, text: string): ParsedFile {
  const eol = detectEol(text);
  const lines = new Lines(text);
  try {
    return parse(path, text, eol, lines);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const span: Span = { start: 0, end: 0 };
    return {
      path,
      text,
      eol,
      blocks: [],
      decls: [],
      imports: [],
      diagnostics: [{ code: 'TL001', severity: 'error', message: `telelean could not read this file (internal error: ${detail}).`, span, range: lines.range(span) }],
    };
  }
}

function parse(path: string, text: string, eol: '\n' | '\r\n', lines: Lines): ParsedFile {
  const lex = lexLean(text);
  const scan = scanDecls(text, lex, lines);
  const diags = new Diagnostics(lines);
  const raws: Array<{ raw: RawBlock; pending: PendingDiagnostic[] }> = [];
  for (const comment of lex.comments) {
    if (comment.kind === 'line') continue;
    const pending: PendingDiagnostic[] = [];
    const raw = readBlock(text, comment, diags, pending);
    if (raw !== undefined) raws.push({ raw, pending });
    else if (comment.unterminated) {
      // Not a block, but it hides every block after it.
      diags.add('TL010', 'error', 'Unterminated comment: it swallows the rest of the file, so no telelean block after it is seen. Close it with `-/`.', {
        start: comment.span.start,
        end: Math.min(comment.span.start + 2, text.length),
      });
    }
  }

  // Ids: written ids are kept; id-less blocks get a derived id, unique within the file.
  const taken = new Set(raws.map(({ raw }) => raw.writtenId).filter((id): id is string => id !== undefined));
  const blockComments = new Set(raws.map(({ raw }) => raw.comment));
  const blocks: MarkupBlock[] = raws.map(({ raw, pending }) => {
    const idWritten = raw.writtenId !== undefined;
    const id = raw.writtenId ?? deriveId(raw.fields.naturalName ?? '', (candidate) => taken.has(candidate));
    taken.add(id);
    for (const d of pending) diags.add(d.code, d.severity, d.message, d.span, id);
    if (!idWritten) {
      diags.add('TL112', 'info', `This block has no \`id:\`; telelean uses \`${id}\` and writes it into the block on its next edit.`, raw.markerSpan, id);
    }
    const missing = [raw.lines.some((l) => l.key === 'type') ? undefined : 'type', raw.lines.some((l) => l.key === 'natural_name') ? undefined : 'natural_name'].filter(
      (k): k is string => k !== undefined,
    );
    for (const key of missing) diags.add('TL003', 'error', `Missing required field \`${key}:\`.`, raw.markerSpan, id);
    if (raw.fields.type === 'ASSUMPTION' && raw.fields.rationale === undefined) {
      diags.add('TL011', 'info', noRationaleMessage(raw.fields.stance), raw.markerSpan, id);
    }
    const block: MarkupBlock = {
      id,
      idWritten,
      version: raw.version,
      fields: raw.fields,
      extensions: raw.extensions,
      span: raw.comment.span,
      range: lines.range(raw.comment.span),
      markerSpan: raw.markerSpan,
      lines: raw.lines,
      binding: { mode: 'none' },
    };
    if (raw.body !== undefined) block.body = raw.body;
    if (raw.bodySpan !== undefined) block.bodySpan = raw.bodySpan;
    block.namespace = scan.namespaceAt(raw.comment.span.start);
    block.binding = bindBlock(text, block, scan, blockComments, diags);
    return block;
  });

  diags.list.sort((a, b) => a.span.start - b.span.start);
  return { path, text, eol, blocks, decls: scan.decls, imports: scan.imports, diagnostics: diags.list };
}

/** A pinned `lean:` field wins; otherwise Go-style adjacency (03 section 3.1; docs/m1-plan.md 6.1). */
function bindBlock(text: string, block: MarkupBlock, scan: DeclScan, blockComments: ReadonlySet<LeanComment>, diags: Diagnostics): BlockBinding {
  const following = block.span.end < text.length ? findFollowingDecl(text, block.span.end, scan, blockComments) : {};
  const position: Pick<BlockBinding, 'adjacentDecl' | 'gapDecl'> = {
    ...(following.adjacent !== undefined ? { adjacentDecl: following.adjacent } : {}),
    ...(following.gap !== undefined ? { gapDecl: following.gap } : {}),
  };
  const pinned = block.fields.lean;
  if (pinned !== undefined && pinned.length > 0) {
    const names = pinned.map((name) => (name.startsWith('_root_.') ? name.slice('_root_.'.length) : name));
    return { mode: 'pinned', statement: names[0], pinned: names, ...position };
  }
  const adjacent = following.adjacent !== undefined ? scan.decls[following.adjacent] : undefined;
  if (adjacent !== undefined) {
    if (adjacent.fullName !== undefined && adjacent.keyword !== 'example' && adjacent.keyword !== 'mutual') {
      return { mode: 'adjacent', statement: adjacent.fullName, ...position };
    }
    const what =
      adjacent.keyword === 'example'
        ? '`example` declarations are not added to the environment'
        : adjacent.keyword === 'mutual'
          ? 'a `mutual` block holds several declarations: name one with `lean:`'
          : 'this declaration has no name: name it, or pin it with `lean:`';
    diags.add('TL014', 'warning', `The declaration after this block cannot be bound (${what}); the node stays code-less.`, block.markerSpan, block.id);
    return { mode: 'none', ...position };
  }
  const gap = following.gap !== undefined ? scan.decls[following.gap] : undefined;
  if (gap?.name !== undefined && gap.keyword !== 'example' && gap.keyword !== 'mutual') {
    diags.add(
      'TL013',
      'hint',
      `This node is code-less, but \`${gap.name}\` follows after a blank line: remove the blank line to attach it.`,
      block.markerSpan,
      block.id,
    );
  }
  return { mode: 'none', ...position };
}
