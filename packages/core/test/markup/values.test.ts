/**
 * AT1.4 — field values: parsing (JSON or raw, never YAML), the escaping rule of docs/m1-plan.md section 6.7, and a
 * property test: random values over an alphabet rich in comment delimiters, quotes, backslashes, newlines and
 * spaces go through `renderBlock` then `parseLeanFile` and come back identical, and every rendered block is exactly
 * one terminated Lean block comment.
 */
import { describe, expect, it } from 'vitest';
import { escapeBodyText, escapeJsonValue, formatFieldValue, lexLean, parseFieldValue, parseLeanFile, renderBlock } from '../../src/index.js';

/** A small deterministic PRNG (mulberry32), so failures reproduce. */
function prng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const LONE_SURROGATE = String.fromCharCode(0xd800);
const CONTROL = String.fromCharCode(1);
/** Pieces random values are made of: both delimiters and their overlaps, quotes, backslashes, line breaks, spaces. */
const PIECES = ['/', '-', '"', '\\', '\n', ' ', '  ', 'a', 'Z', ':', '#', '/-', '-/', '/-/', '-/-', '--', '\t', 'é', '𝓝', '\r\n', '{', '}', ',', '[', ']', LINE_SEPARATOR, CONTROL, LONE_SURROGATE];

function randomValue(random: () => number): string {
  const length = Math.floor(random() * 10);
  let value = '';
  for (let i = 0; i < length; i++) value += PIECES[Math.floor(random() * PIECES.length)] ?? '';
  if (random() < 0.15) value = `"${value}`;
  if (random() < 0.15) value = `  ${value}`;
  return value;
}

describe('parseFieldValue', () => {
  it('reads raw text trimmed, and a value starting with `"` as one JSON string', () => {
    expect(parseFieldValue('  Cynder: the #1 dragon  ')).toEqual({ ok: true, value: 'Cynder: the #1 dragon' });
    expect(parseFieldValue('NO')).toEqual({ ok: true, value: 'NO' });
    expect(parseFieldValue('a "quoted" word')).toEqual({ ok: true, value: 'a "quoted" word' });
    expect(parseFieldValue(' "A -\\/ B and C \\u002f- D" ')).toEqual({ ok: true, value: 'A -/ B and C /- D' });
    expect(parseFieldValue('"tab\\there\\nnext"')).toEqual({ ok: true, value: 'tab\there\nnext' });
  });

  it('rejects a broken or non-string JSON value', () => {
    expect(parseFieldValue('"unterminated').ok).toBe(false);
    expect(parseFieldValue('"a" trailing').ok).toBe(false);
    expect(parseFieldValue('"bad \\x escape"').ok).toBe(false);
  });
});

describe('AT1.4 escapeJsonValue: the D-8 / plan 6.7 rule', () => {
  it('writes `/-` as \\u002f- (7 characters) and `-/` as -\\/', () => {
    const slashDash = escapeJsonValue('/-');
    expect(slashDash).toBe('"\\u002f-"');
    expect(slashDash.slice(1, -1)).toHaveLength(7);
    expect(escapeJsonValue('-/')).toBe('"-\\/"');
    expect(escapeJsonValue('/-/')).toBe('"\\u002f-\\/"');
    expect(escapeJsonValue('-/-')).toBe('"-\\u002f-"');
    expect(escapeJsonValue('a/b')).toBe('"a/b"');
    expect(escapeJsonValue('say "hi"\n')).toBe('"say \\"hi\\"\\n"');
    // Separators and C1 controls are escaped too (JSON.stringify would keep them literal).
    expect(escapeJsonValue(`a${LINE_SEPARATOR}b${String.fromCharCode(0x85)}`)).toBe('"a\\u2028b\\u0085"');
  });

  it('never contains a comment delimiter and always parses back', () => {
    const random = prng(7);
    for (let i = 0; i < 2000; i++) {
      const value = randomValue(random);
      const escaped = escapeJsonValue(value);
      expect(escaped).not.toMatch(/\/-|-\//);
      expect(parseFieldValue(escaped)).toEqual({ ok: true, value });
    }
  });
});

describe('formatFieldValue', () => {
  it('keeps safe values raw', () => {
    expect(formatFieldValue('natural_name', 'Cynder: the #1 dragon')).toBe('Cynder: the #1 dragon');
    expect(formatFieldValue('rationale', 'a "quoted" word, with commas')).toBe('a "quoted" word, with commas');
    expect(formatFieldValue('natural_name', 'path a/b or c-d')).toBe('path a/b or c-d');
  });

  it('quotes a delimiter, a leading quote, a line break, a control character, edge spaces or an empty value', () => {
    expect(formatFieldValue('natural_name', 'A -/ B')).toBe('"A -\\/ B"');
    expect(formatFieldValue('natural_name', 'A /- B')).toBe('"A \\u002f- B"');
    expect(formatFieldValue('natural_name', '"quoted" first')).toBe('"\\"quoted\\" first"');
    expect(formatFieldValue('rationale', 'two\nlines')).toBe('"two\\nlines"');
    expect(formatFieldValue('rationale', `tab\there`)).toBe('"tab\\there"');
    expect(formatFieldValue('rationale', ' padded ')).toBe('" padded "');
    expect(formatFieldValue('rationale', '')).toBe('""');
  });

  it('writes lists as `a, b, c`, quoting an item that is not safe raw', () => {
    expect(formatFieldValue('premises', ['cynder-dark-past', 'new-spyro-pg'])).toBe('cynder-dark-past, new-spyro-pg');
    expect(formatFieldValue('lean', ['Spyro.«a, b»', 'Spyro.c'])).toBe('"Spyro.«a, b»", Spyro.c');
    expect(formatFieldValue('tags', ['a-/b', '[x'])).toBe('"a-\\/b", "[x"');
    expect(formatFieldValue('tags', [])).toBe('');
  });
});

describe('escapeBodyText', () => {
  it('writes `-/` as `-\\/` and `/-` as `/\\-`, leaving no delimiter', () => {
    expect(escapeBodyText('a -/ b /- c')).toBe('a -\\/ b /\\- c');
    expect(escapeBodyText('/-/')).toBe('/\\-\\/');
    expect(escapeBodyText('-/-')).toBe('-\\/\\-');
    const random = prng(11);
    for (let i = 0; i < 1000; i++) expect(escapeBodyText(randomValue(random))).not.toMatch(/\/-|-\//);
  });

  it('escapes a leading `--` (Lean would read it as a line comment right after `/--`)', () => {
    expect(escapeBodyText('-- a dashed start')).toBe('\\-- a dashed start');
    expect(escapeBodyText(' \n --x')).toBe(' \n \\--x');
    expect(escapeBodyText('a -- b')).toBe('a -- b');
    expect(escapeBodyText('-x')).toBe('-x');
  });

  it('property: `/-- <escaped> -/` is always exactly one terminated doc comment (the set-docstring form)', () => {
    const random = prng(13);
    for (let i = 0; i < 2000; i++) {
      const value = randomValue(random);
      const doc = `/-- ${escapeBodyText(value)} -/`;
      const lex = lexLean(`${doc}\ndef x := 1\n`);
      expect(lex.comments.map((c) => [c.kind, c.span.start, c.span.end, c.unterminated]), JSON.stringify(value)).toEqual([['doc', 0, doc.length, false]]);
    }
  });
});

describe('AT1.4 property: renderBlock then parseLeanFile round-trips every value', () => {
  it('random sentences and rationales come back identical; each rendered block is one terminated block comment', () => {
    const random = prng(2026);
    for (let i = 0; i < 1500; i++) {
      const naturalName = randomValue(random);
      const rationale = randomValue(random);
      const body = random() < 0.3 ? randomValue(random) : undefined;
      const rendered = renderBlock({ id: 'x', type: 'PROPOSITION', naturalName, rationale, ...(body !== undefined ? { body } : {}) }, random() < 0.5 ? '\n' : '\r\n');
      const lex = lexLean(rendered);
      expect(lex.comments.map((c) => [c.kind, c.span.start, c.span.end, c.unterminated])).toEqual([['block', 0, rendered.length, false]]);
      expect(lex.tokens).toEqual([]);

      // Inside a file, the block neither swallows nor exposes code: the declaration after it still binds.
      const text = `namespace T\n${rendered}\nabbrev x : Prop := True\nend T\n`;
      const file = parseLeanFile('T.lean', text);
      expect(file.blocks).toHaveLength(1);
      const block = file.blocks[0];
      expect(block?.fields.naturalName, JSON.stringify(naturalName)).toBe(naturalName);
      expect(block?.fields.rationale, JSON.stringify(rationale)).toBe(rationale);
      expect(block?.binding).toMatchObject({ mode: 'adjacent', statement: 'T.x' });
      expect(file.decls.map((d) => d.fullName)).toEqual(['T.x']);
      expect(file.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    }
  });

  it('the fixed hard cases: both delimiters, `/-/`, `-/-`, a leading quote, leading spaces, a newline', () => {
    for (const value of ['-/', '/-', '/-/', '-/-', '"', '"quoted', '  leading', 'trailing  ', 'a\nb', 'x -/ y /- z', '\\', '\\"', '-', '/']) {
      const file = parseLeanFile('T.lean', renderBlock({ id: 'x', type: 'PROPOSITION', naturalName: value, rationale: value }));
      expect(file.blocks[0]?.fields.naturalName).toBe(value);
      expect(file.blocks[0]?.fields.rationale).toBe(value);
    }
  });

  it('lists round-trip too, including items that need quoting', () => {
    const lean = ['Spyro.«a, b»', 'Spyro.c'];
    const tags = ['a-/b', 'plain', 'x/-y'];
    const premises = ['cynder-dark-past', 'new-spyro-pg'];
    const file = parseLeanFile('T.lean', renderBlock({ id: 'x', type: 'PROPOSITION', naturalName: 'n', premises, lean, extra: [['tags', formatFieldValue('tags', tags)]] }));
    expect(file.blocks[0]?.fields).toMatchObject({ premises, lean, tags });
    expect(file.diagnostics).toEqual([]);
  });
});
