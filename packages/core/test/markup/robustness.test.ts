/**
 * Robustness: `parseLeanFile` never throws and keeps its invariants (sorted, in-bounds, consistent spans and
 * ranges) on random Lean-ish text full of half-written comments, strings and blocks; `lineIndex` converts both
 * ways; a large file parses quickly (research: 27k lines in ~145 ms in CPython).
 */
import { describe, expect, it } from 'vitest';
import { lexLean, lineIndex, parseLeanFile, renderBlock, type ParsedFile, type Span } from '../../src/index.js';

const PIECES = [
  'def',
  'theorem',
  'axiom',
  'abbrev',
  'instance',
  'mutual',
  'namespace',
  'section',
  'end',
  'private',
  'x',
  'A.B',
  ' ',
  ' ',
  '\n',
  '\n',
  '\r\n',
  '\t',
  '/-',
  '-/',
  '/--',
  '/-!',
  '--',
  '"',
  "'",
  "'a'",
  'r#"',
  '"#',
  '«',
  '»',
  '@[',
  ']',
  ':=',
  ':',
  '|',
  '(',
  ')',
  '{',
  '}',
  's!"',
  '@@ telelean v1',
  '@@ telelean v9',
  'id: x',
  'id: Bad Id',
  'kind: goal',
  'type: GOAL',
  'natural_name: y',
  'natural_name: "q\\"',
  'lean: A.b, «c d»',
  'premises: [a, b',
  'mytool.k: v',
  '---',
  '𝓝',
  'é',
  '0x1F',
  '1.5e3',
  '#check',
  'open',
  'where',
];

function prng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const inside = (span: Span, outer: Span) => span.start >= outer.start && span.end <= outer.end && span.start <= span.end;

function checkInvariants(file: ParsedFile) {
  const { text } = file;
  const whole: Span = { start: 0, end: text.length };
  const index = lineIndex(text);
  const range = (span: Span) => ({ start: index.positionAt(span.start), end: index.positionAt(span.end) });
  const lex = lexLean(text);
  const commentSpans = new Set(lex.comments.map((c) => `${c.span.start}:${c.span.end}`));
  expect(file.diagnostics.filter((d) => d.message.includes('internal error'))).toEqual([]);
  let previous = -1;
  for (const block of file.blocks) {
    expect(commentSpans.has(`${block.span.start}:${block.span.end}`)).toBe(true);
    expect(block.span.start).toBeGreaterThan(previous);
    previous = block.span.end - 1;
    expect(block.range).toEqual(range(block.span));
    expect(inside(block.markerSpan, block.span)).toBe(true);
    for (const line of block.lines) {
      expect(inside(line.span, block.span)).toBe(true);
      expect(inside(line.valueSpan, line.span)).toBe(true);
      expect(text.slice(line.valueSpan.start, line.valueSpan.end)).toBe(line.raw);
    }
    if (block.bodySpan) expect(inside(block.bodySpan, block.span)).toBe(true);
    const { adjacentDecl, gapDecl } = block.binding;
    if (adjacentDecl !== undefined) expect(file.decls[adjacentDecl]).toBeDefined();
    if (gapDecl !== undefined) expect(file.decls[gapDecl]).toBeDefined();
    if (block.binding.mode !== 'none') expect(block.binding.statement).toBeTruthy();
  }
  previous = -1;
  for (const decl of file.decls) {
    expect(decl.span.start).toBeGreaterThanOrEqual(previous);
    previous = decl.span.start;
    expect(inside(decl.span, whole)).toBe(true);
    expect(inside(decl.keywordSpan, decl.span)).toBe(true);
    if (decl.nameSpan) expect(inside(decl.nameSpan, decl.span)).toBe(true);
    if (decl.docSpan) expect(inside(decl.docSpan, decl.span)).toBe(true);
    if (decl.valueStart !== undefined) expect(decl.valueStart >= decl.keywordSpan.end && decl.valueStart < decl.span.end).toBe(true);
    expect(decl.range).toEqual(range(decl.span));
  }
  for (const d of file.diagnostics) {
    expect(inside(d.span, whole)).toBe(true);
    expect(d.range).toEqual(range(d.span));
  }
}

describe('parseLeanFile never throws and keeps its invariants', () => {
  it('on 3000 random Lean-ish texts', () => {
    const random = prng(31337);
    for (let i = 0; i < 3000; i++) {
      let text = '';
      for (let j = Math.floor(random() * 60); j > 0; j--) text += PIECES[Math.floor(random() * PIECES.length)] ?? '';
      let file: ParsedFile | undefined;
      expect(() => (file = parseLeanFile('F.lean', text)), JSON.stringify(text)).not.toThrow();
      if (file !== undefined) checkInvariants(file);
    }
  });

  it('on every prefix of the Spyro-style text (as while typing)', () => {
    const text = `namespace S\n\n${renderBlock({ id: 'a', type: 'GOAL', naturalName: 'A -/ b', lean: ['S.a'] })}\n/-- A -/\nabbrev a : Prop := True\naxiom a.holds : a\n\nend S\n`;
    for (let n = 0; n <= text.length; n++) checkInvariants(parseLeanFile('S.lean', text.slice(0, n)));
  });
});

describe('lineIndex', () => {
  it('converts offsets and positions both ways (LF, CRLF, non-BMP), clamping out-of-range positions', () => {
    const text = 'ab\r\n𝓝c\n\nlast';
    const index = lineIndex(text);
    expect(index.lineCount).toBe(4);
    expect(index.positionAt(0)).toEqual({ line: 0, character: 0 });
    expect(index.positionAt(4)).toEqual({ line: 1, character: 0 });
    expect(index.positionAt(7)).toEqual({ line: 1, character: 3 });
    expect(index.positionAt(text.length)).toEqual({ line: 3, character: 4 });
    expect(index.positionAt(99)).toEqual({ line: 3, character: 4 });
    for (let offset = 0; offset <= text.length; offset++) {
      if (offset === 3) continue; // between \r and \n: not a position LSP can name
      expect(index.offsetAt(index.positionAt(offset))).toBe(offset);
    }
    expect(index.offsetAt({ line: 0, character: 99 })).toBe(2);
    expect(index.offsetAt({ line: 9, character: 0 })).toBe(text.length);
    expect(index.offsetAt({ line: -1, character: 5 })).toBe(0);
  });
});

describe('performance', () => {
  it('parses a 30 000-line model file well within a second or two', () => {
    const parts: string[] = ['import Model.Big.Vocabulary', '', 'namespace Big', ''];
    for (let i = 0; i < 2500; i++) {
      parts.push(renderBlock({ id: `node-${i}`, type: 'ASSUMPTION', naturalName: `Fact number ${i} holds`, rationale: 'r', lean: [`Big.f${i}`] }));
      parts.push(`/-- Fact number ${i} holds -/`, `abbrev f${i} : Prop := P${i % 7} c${i % 11}`, `axiom f${i}.holds : f${i}`, '');
    }
    parts.push('end Big', '');
    const text = parts.join('\n');
    expect(text.split('\n').length).toBeGreaterThan(29_000);
    const started = Date.now();
    const file = parseLeanFile('Model/Big/Main.lean', text);
    const elapsed = Date.now() - started;
    expect(file.blocks).toHaveLength(2500);
    expect(file.decls).toHaveLength(5000);
    expect(file.blocks.every((b) => b.binding.mode === 'pinned' && b.binding.adjacentDecl !== undefined)).toBe(true);
    // Generous bound for a loaded machine; typically a few hundred milliseconds.
    expect(elapsed).toBeLessThan(5000);
  });
});
