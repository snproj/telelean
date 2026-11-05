/**
 * A small stand-in for WP-markup's `parseLeanFile`, good enough for the model builder's tests while WP-markup is a
 * stub (docs/m1-plan.md section 9, R7). It follows the frozen ParsedFile contract (markup/types.ts) and the binding
 * and command-start rules of section 6.1 for the simple Lean the fixtures use: blocks (`/- @@ telelean ... -/`),
 * top-level declarations with docstrings, attributes and modifiers, namespaces, imports. Not a Lean parser.
 * The gated tests run the same scenarios through the real parser once WP-markup is implemented.
 */
import type { BlockBinding, BlockFields, DeclInfo, DeclKeyword, FieldLine, MarkupBlock, ParsedFile, Span } from '../../../src/markup/types.js';
import type { Evidential, NodeType, Range, Stance } from '../../../src/model.js';

const DECL_KEYWORDS = ['axiom', 'theorem', 'lemma', 'def', 'abbrev', 'opaque', 'instance', 'example', 'inductive', 'coinductive', 'structure', 'class', 'mutual'];
const MODIFIERS = ['private', 'public', 'protected', 'noncomputable', 'unsafe', 'partial', 'nonrec', 'scoped', 'local', 'meta'];
const OTHER_COMMANDS = [
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
  'deriving',
  'initialize',
  'import',
];
const COMMAND_WORDS = new Set([...DECL_KEYWORDS, ...MODIFIERS, ...OTHER_COMMANDS]);
const IDENT_AT = /^(?:_root_\.)?[\p{L}_«][\p{L}\p{N}_'!?«».]*/u;

interface Comment {
  kind: 'line' | 'block' | 'doc' | 'moddoc';
  start: number;
  end: number;
}

class Lines {
  readonly starts: number[] = [0];
  constructor(readonly text: string) {
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') this.starts.push(i + 1);
  }
  pos(offset: number) {
    let line = 0;
    while (line + 1 < this.starts.length && (this.starts[line + 1] ?? Infinity) <= offset) line++;
    return { line, character: offset - (this.starts[line] ?? 0) };
  }
  range(span: Span): Range {
    return { start: this.pos(span.start), end: this.pos(span.end) };
  }
}

function scanComments(text: string): Comment[] {
  const out: Comment[] = [];
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('--', i)) {
      let j = i;
      while (j < text.length && text[j] !== '\n') j++;
      out.push({ kind: 'line', start: i, end: j });
      i = j;
    } else if (text.startsWith('/-', i)) {
      const kind = text.startsWith('/--', i) && !text.startsWith('/--/', i) ? 'doc' : text.startsWith('/-!', i) ? 'moddoc' : 'block';
      let depth = 1;
      let j = i + 2;
      while (j < text.length && depth > 0) {
        if (text.startsWith('/-', j)) {
          depth++;
          j += 2;
        } else if (text.startsWith('-/', j)) {
          depth--;
          j += 2;
        } else j++;
      }
      out.push({ kind, start: i, end: j });
      i = j;
    } else if (text[i] === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      i = j + 1;
    } else i++;
  }
  return out;
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

function fieldValue(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

function skipWs(text: string, i: number, end: number): number {
  while (i < end && /\s/.test(text[i] ?? '')) i++;
  return i;
}

function wordAt(text: string, i: number): string {
  return /^[A-Za-z_]+/.exec(text.slice(i, i + 40))?.[0] ?? '';
}

export function parseFixture(path: string, text: string): ParsedFile {
  const lines = new Lines(text);
  const comments = scanComments(text);
  const insideComment = (offset: number) => comments.some((c) => c.start < offset && offset < c.end);

  // ---- command starts (column 0; docs/m1-plan.md section 6.1)
  const starts: number[] = [];
  for (const lineStart of lines.starts) {
    if (lineStart >= text.length || insideComment(lineStart)) continue;
    const rest = text.slice(lineStart, lineStart + 40);
    if (rest.startsWith('/-') || rest.startsWith('--') || rest.startsWith('@[') || rest.startsWith('#') || COMMAND_WORDS.has(wordAt(text, lineStart))) {
      starts.push(lineStart);
    }
  }

  // ---- declarations and namespaces
  const decls: DeclInfo[] = [];
  const imports: string[] = [];
  const nsStack: string[][] = [];
  let pending: { start: number; docSpan?: Span; docstring?: string; attributes: string[]; modifiers: string[] } | undefined;
  starts.forEach((segStart, index) => {
    const segEnd = index + 1 < starts.length ? (starts[index + 1] as number) : text.length;
    let p = segStart;
    const comment = comments.find((c) => c.start === p);
    if (comment && comment.kind !== 'doc') {
      pending = undefined;
      return;
    }
    const current = pending ?? { start: segStart, attributes: [], modifiers: [] };
    if (comment && comment.kind === 'doc') {
      current.start = segStart;
      current.docSpan = { start: comment.start, end: comment.end };
      current.docstring = text.slice(comment.start + 3, comment.end - 2).trim();
      p = skipWs(text, comment.end, segEnd);
    }
    while (text.startsWith('@[', p)) {
      let depth = 0;
      let j = p;
      for (; j < segEnd; j++) {
        if (text[j] === '[') depth++;
        else if (text[j] === ']') {
          depth--;
          if (depth === 0) break;
        }
      }
      current.attributes.push(text.slice(p, j + 1));
      p = skipWs(text, j + 1, segEnd);
    }
    for (let word = wordAt(text, p); MODIFIERS.includes(word); word = wordAt(text, p)) {
      current.modifiers.push(word);
      p = skipWs(text, p + word.length, segEnd);
    }
    if (p >= segEnd) {
      pending = current;
      return;
    }
    const word = wordAt(text, p);
    if (!DECL_KEYWORDS.includes(word)) {
      pending = undefined;
      const line = text.slice(p, text.indexOf('\n', p) < 0 ? text.length : text.indexOf('\n', p));
      const ns = /^namespace\s+(\S+)/.exec(line);
      if (ns) nsStack.push((ns[1] ?? '').split('.'));
      else if (/^section\b/.test(line)) nsStack.push([]);
      else if (/^end\b/.test(line)) nsStack.pop();
      else if (/^import\s+(\S+)/.test(line)) imports.push(/^import\s+(\S+)/.exec(line)?.[1] ?? '');
      return;
    }
    let keyword = word as DeclKeyword;
    const keywordStart = p;
    let q = p + word.length;
    if (word === 'class') {
      const next = wordAt(text, skipWs(text, q, segEnd));
      if (next === 'inductive' || next === 'abbrev') {
        keyword = `class ${next}` as DeclKeyword;
        q = skipWs(text, q, segEnd) + next.length;
      }
    }
    const keywordSpan = { start: keywordStart, end: q };
    q = skipWs(text, q, segEnd);
    if (keyword === 'instance' && text.startsWith('(priority', q)) q = skipWs(text, text.indexOf(')', q) + 1, segEnd);
    let name: string | undefined;
    let nameSpan: Span | undefined;
    if (keyword !== 'example' && keyword !== 'mutual') {
      const m = IDENT_AT.exec(text.slice(q, segEnd));
      if (m && !(keyword === 'instance' && /^\s*$/.test(m[0]))) {
        name = m[0];
        nameSpan = { start: q, end: q + m[0].length };
      }
    }
    const namespace = nsStack.flat();
    const fullName = name === undefined ? undefined : name.startsWith('_root_.') ? name.slice(7) : [...namespace, name].join('.');
    const end = segStart + text.slice(segStart, segEnd).trimEnd().length;
    // valueStart: first top-level `:=` / `where` / `|` after the name
    let valueStart: number | undefined;
    let depth = 0;
    for (let k = nameSpan?.end ?? keywordSpan.end; k < end; k++) {
      if (insideComment(k)) continue;
      const c = text[k] ?? '';
      if ('([{⟨'.includes(c)) depth++;
      else if (')]}⟩'.includes(c)) depth--;
      else if (depth === 0 && (text.startsWith(':=', k) || (c === '|' && keyword !== 'theorem') || (text.startsWith('where', k) && /\s/.test(text[k - 1] ?? '')))) {
        valueStart = k;
        break;
      }
    }
    const span = { start: current.start, end };
    decls.push({
      keyword,
      ...(name !== undefined ? { name, fullName } : {}),
      namespace,
      modifiers: current.modifiers,
      ...(current.attributes.length > 0 ? { attributes: current.attributes } : {}),
      ...(current.docstring !== undefined ? { docstring: current.docstring, docSpan: current.docSpan } : {}),
      span,
      range: lines.range(span),
      keywordSpan,
      ...(nameSpan ? { nameSpan } : {}),
      ...(valueStart !== undefined ? { valueStart } : {}),
    } as DeclInfo);
    pending = undefined;
  });

  // ---- blocks
  const blocks: MarkupBlock[] = [];
  const usedIds = new Set<string>();
  for (const comment of comments) {
    if (comment.kind !== 'block') continue;
    const bodyStart = comment.start + 2;
    const bodyEnd = comment.end - 2;
    const body = text.slice(bodyStart, bodyEnd);
    const rawLines = body.split('\n');
    let offset = bodyStart;
    const lineSpans = rawLines.map((l) => {
      const s = { start: offset, end: offset + l.length, text: l };
      offset += l.length + 1;
      return s;
    });
    const markerIndex = lineSpans.findIndex((l) => l.text.trim() !== '');
    const marker = lineSpans[markerIndex];
    const markerMatch = marker ? /^\s*@@\s*telelean(?:\s+v(\d+))?\s*$/.exec(marker.text) : null;
    if (!marker || !markerMatch) continue;
    const fields: BlockFields = {};
    const extensions: Record<string, string[]> = {};
    const fieldLines: FieldLine[] = [];
    let id: string | undefined;
    let bodySpan: Span | undefined;
    let markdown: string | undefined;
    for (let k = markerIndex + 1; k < lineSpans.length; k++) {
      const line = lineSpans[k] as { start: number; end: number; text: string };
      if (line.text.trim() === '---') {
        bodySpan = { start: line.start, end: bodyEnd };
        markdown = lineSpans
          .slice(k + 1)
          .map((l) => l.text)
          .join('\n')
          .trim();
        break;
      }
      const m = /^\s*([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)*)\s*:\s?(.*)$/.exec(line.text);
      if (!m) continue;
      const writtenKey = m[1] ?? '';
      const key = writtenKey === 'kind' ? 'type' : writtenKey;
      const raw = (m[2] ?? '').trim();
      const valueStartIdx = line.start + line.text.length - (m[2] ?? '').length + ((m[2] ?? '').length - (m[2] ?? '').trimStart().length);
      fieldLines.push({ key, writtenKey, span: { start: line.start, end: line.end }, valueSpan: { start: valueStartIdx, end: valueStartIdx + raw.length }, raw });
      const value = fieldValue(raw);
      const list = () => value.split(',').map((x) => x.trim()).filter(Boolean);
      switch (key) {
        case 'id':
          id = value;
          break;
        case 'type':
          fields.type = value.toUpperCase() as NodeType;
          break;
        case 'natural_name':
          fields.naturalName = value;
          break;
        case 'rationale':
          fields.rationale = value;
          break;
        case 'stance':
          fields.stance = value as Stance;
          break;
        case 'source':
          fields.source = value as Evidential;
          break;
        case 'asserted':
          fields.asserted = value;
          break;
        case 'premises':
          fields.premises = list();
          break;
        case 'lean':
          fields.lean = list();
          break;
        case 'supersedes':
          fields.supersedes = value;
          break;
        case 'refines':
          fields.refines = value;
          break;
        case 'tags':
          fields.tags = list();
          break;
        case 'origin':
          fields.origin = value as 'user' | 'agent';
          break;
        case 'session':
          fields.session = value;
          break;
        case 'worded_by':
          fields.wordedBy = value as 'user' | 'agent';
          break;
        default:
          (extensions[key] ??= []).push(raw);
      }
    }
    let idWritten = id !== undefined;
    if (id === undefined) {
      const base = slug(fields.naturalName ?? '');
      id = base;
      for (let n = 2; usedIds.has(id); n++) id = `${base}-${n}`;
      idWritten = false;
    }
    usedIds.add(id);
    const span = { start: comment.start, end: comment.end };
    let binding: BlockBinding = { mode: 'none' };
    if (fields.lean && fields.lean.length > 0) binding = { mode: 'pinned', statement: fields.lean[0], pinned: [...fields.lean] };
    else {
      const index = decls.findIndex((d) => d.span.start >= span.end);
      const decl = decls[index];
      if (decl) {
        const gap = text.slice(span.end, decl.span.start).split('\n');
        const middle = gap.slice(1, -1);
        const otherBlock = comments.some((c) => c.kind === 'block' && c.start >= span.end && c.start < decl.span.start);
        const adjacent = gap.length >= 2 && (gap[0] ?? '').trim() === '' && middle.every((l) => l.trim() !== '') && !otherBlock;
        binding = adjacent ? { mode: 'adjacent', ...(decl.fullName ? { statement: decl.fullName } : {}), adjacentDecl: index } : { mode: 'none', gapDecl: index };
      }
    }
    blocks.push({
      id,
      idWritten,
      version: Number(markerMatch[1] ?? '1'),
      fields,
      extensions,
      ...(markdown !== undefined ? { body: markdown } : {}),
      span,
      range: lines.range(span),
      markerSpan: { start: marker.start, end: marker.end },
      lines: fieldLines,
      ...(bodySpan ? { bodySpan } : {}),
      binding,
    });
  }

  return { path, text, eol: text.includes('\r\n') ? '\r\n' : '\n', blocks, decls, imports, diagnostics: [] };
}
