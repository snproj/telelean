/**
 * Spec v4 markup (docs/slice1-plan.md 2.1 and 2.2): `type:` takes AXIOM or PROPOSITION and reads the old ASSUMPTION,
 * DERIVATION and GOAL as aliases (no diagnostic, never rewritten); `follows_from: nothing` is the "follows from
 * nothing" mark (TL022 for another value, TL023 together with declared premises: the arrows win).
 */
import { describe, expect, it } from 'vitest';
import { applyTextEdits, parseLeanFile, setBlockField, setBlockFields } from '../../src/markup/api.js';
import type { MarkupBlock, ParsedFile } from '../../src/markup/types.js';
import { parseNodeType } from '../../src/model.js';
import { buildProjectModel } from '../../src/project/index.js';

const block = (fields: string[]) => ['/-', '@@ telelean v1', ...fields, '-/'].join('\n');
const parse = (text: string): ParsedFile => parseLeanFile('Model/S/Main.lean', `namespace S\n\n${text}\n\nend S\n`);
const only = (file: ParsedFile): MarkupBlock => {
  const first = file.blocks[0];
  if (first === undefined || file.blocks.length !== 1) throw new Error('expected one block');
  return first;
};
const codes = (file: ParsedFile) => file.diagnostics.map((d) => d.code);
/** The cards of one parsed file (subject S, no facts). */
const nodesOf = (file: ParsedFile) => buildProjectModel({ files: [file], fileHashes: {}, library: 'Model' }).nodes;

describe('parseNodeType', () => {
  it('reads the two kinds, and the old ones as aliases naming the old kind', () => {
    expect(parseNodeType('AXIOM')).toEqual({ type: 'AXIOM' });
    expect(parseNodeType('PROPOSITION')).toEqual({ type: 'PROPOSITION' });
    expect(parseNodeType('ASSUMPTION')).toEqual({ type: 'AXIOM', alias: 'ASSUMPTION' });
    expect(parseNodeType('DERIVATION')).toEqual({ type: 'PROPOSITION', alias: 'DERIVATION' });
    expect(parseNodeType('GOAL')).toEqual({ type: 'PROPOSITION', alias: 'GOAL' });
  });

  it('is case-insensitive, and undefined for anything else', () => {
    expect(parseNodeType('axiom')).toEqual({ type: 'AXIOM' });
    expect(parseNodeType('Proposition')).toEqual({ type: 'PROPOSITION' });
    expect(parseNodeType('goal')).toEqual({ type: 'PROPOSITION', alias: 'GOAL' });
    for (const raw of ['', 'LEMMA', 'DEFINITION', ' AXIOM', 'AXIOMS', 'GOALS']) expect(parseNodeType(raw), raw).toBeUndefined();
  });
});

describe('`type:` in the markup', () => {
  it.each([
    ['AXIOM', 'AXIOM'],
    ['PROPOSITION', 'PROPOSITION'],
    ['ASSUMPTION', 'AXIOM'],
    ['DERIVATION', 'PROPOSITION'],
    ['GOAL', 'PROPOSITION'],
  ] as const)('`type: %s` reads as %s, with no diagnostic', (written, kind) => {
    const file = parse(block(['id: x', `type: ${written}`, 'natural_name: X', 'rationale: r']));
    expect(only(file).fields.type).toBe(kind);
    expect(codes(file)).toEqual([]);
    expect(nodesOf(file).get('x')?.node.type).toBe(kind);
  });

  it('`kind:` stays an alias of `type:`; lower case keeps the TL019 hint (naming what is written)', () => {
    const file = parse(block(['id: x', 'kind: goal', 'natural_name: X']));
    expect(only(file).fields.type).toBe('PROPOSITION');
    expect(file.diagnostics.map((d) => [d.code, d.severity, d.message])).toEqual([['TL019', 'hint', 'The type is written in upper case: GOAL.']]);
    expect(only(parse(block(['id: x', 'type: axiom', 'natural_name: X', 'rationale: r']))).fields.type).toBe('AXIOM');
  });

  it('any other value is TL004 naming the two kinds', () => {
    const file = parse(block(['id: x', 'type: LEMMA', 'natural_name: X']));
    expect(only(file).fields.type).toBeUndefined();
    expect(file.diagnostics.find((d) => d.code === 'TL004')?.message).toBe('Invalid type "LEMMA" (expected AXIOM, PROPOSITION).');
  });

  it('an alias is never rewritten by an edit of another field (G5 compares the line byte for byte)', () => {
    const text = block(['id: x', 'type: GOAL', 'natural_name: X']);
    const file = parse(text);
    const after = applyTextEdits(file.text, setBlockField(file, only(file), 'rationale', 'because'));
    expect(after).toContain('type: GOAL\nnatural_name: X\nrationale: because\n');
  });

  it('TL011 (no rationale) is about axioms, written either way', () => {
    expect(codes(parse(block(['id: x', 'type: AXIOM', 'natural_name: X'])))).toEqual(['TL011']);
    expect(codes(parse(block(['id: x', 'type: ASSUMPTION', 'natural_name: X'])))).toEqual(['TL011']);
    expect(parse(block(['id: x', 'type: AXIOM', 'natural_name: X'])).diagnostics[0]?.message).toBe('This axiom has no `rationale:` yet (no reason yet: why do you hold it?).');
    expect(codes(parse(block(['id: x', 'type: PROPOSITION', 'natural_name: X'])))).toEqual([]);
  });
});

describe('`follows_from: nothing` (spec v4 AR-5)', () => {
  it('is read as the mark and carried to the card as fromNothing', () => {
    const file = parse(block(['id: p', 'type: PROPOSITION', 'natural_name: P', 'follows_from: nothing', 'asserted: 2026-11-19']));
    expect(only(file).fields).toMatchObject({ type: 'PROPOSITION', followsFrom: 'nothing' });
    expect(codes(file)).toEqual([]);
    expect(nodesOf(file).get('p')?.node).toMatchObject({ premises: [], fromNothing: true });
  });

  it('round-trips: other edits keep its line; setBlockField writes it right after `premises:` and removes it', () => {
    const text = block(['id: p', 'type: PROPOSITION', 'natural_name: P', 'follows_from: nothing', 'asserted: 2026-11-19']);
    const file = parse(text);
    const edited = applyTextEdits(file.text, setBlockField(file, only(file), 'natural_name', 'P again'));
    expect(edited).toContain('natural_name: P again\nfollows_from: nothing\nasserted: 2026-11-19\n');
    expect(only(parseLeanFile('Model/S/Main.lean', edited)).fields.followsFrom).toBe('nothing');
    // Written by telelean (slice 1b): FIELD_ORDER puts it after `premises:`, before `asserted:`.
    const bare = parse(block(['id: q', 'type: PROPOSITION', 'natural_name: Q', 'source: inferred', 'asserted: 2026-11-19']));
    const marked = applyTextEdits(bare.text, setBlockField(bare, only(bare), 'follows_from', 'nothing'));
    expect(marked).toContain('source: inferred\nfollows_from: nothing\nasserted: 2026-11-19\n');
    const reparsed = parseLeanFile('Model/S/Main.lean', marked);
    expect(only(reparsed).fields.followsFrom).toBe('nothing');
    expect(applyTextEdits(reparsed.text, setBlockFields(reparsed, only(reparsed), [{ key: 'follows_from', value: null }]))).toBe(bare.text);
  });

  it('any other value is TL022 (an error) and the field is ignored', () => {
    for (const value of ['everything', 'Nothing', '[]', '""']) {
      const file = parse(block(['id: p', 'type: PROPOSITION', 'natural_name: P', `follows_from: ${value}`]));
      expect(only(file).fields.followsFrom, value).toBeUndefined();
      expect(file.diagnostics.map((d) => [d.code, d.severity]), value).toEqual([['TL022', 'error']]);
      expect(file.diagnostics[0]?.message).toMatch(/^follows_from takes only the value nothing/);
      expect(nodesOf(file).get('p')?.node.fromNothing, value).toBeUndefined();
    }
  });

  it('with declared premises it is TL023 (an error): the arrows win and the mark is ignored', () => {
    const file = parse(block(['id: p', 'type: PROPOSITION', 'natural_name: P', 'premises: a, b', 'follows_from: nothing']));
    expect(only(file).fields).toMatchObject({ premises: ['a', 'b'] });
    expect(only(file).fields.followsFrom).toBeUndefined();
    const tl023 = file.diagnostics.find((d) => d.code === 'TL023');
    expect(tl023).toMatchObject({ severity: 'error', nodeId: 'p' });
    expect(tl023?.message).toMatch(/^A card cannot both follow from nothing and have arrows/);
    // It points at the follows_from line.
    expect(file.text.slice(tl023?.span.start, tl023?.span.end)).toBe('follows_from: nothing');
    expect(nodesOf(file).get('p')?.node).toMatchObject({ premises: ['a', 'b'] });
    expect(nodesOf(file).get('p')?.node.fromNothing).toBeUndefined();
  });

  it('a `premises:` line with no valid id is not an arrow: the mark stands (and such a line is never the mark itself)', () => {
    const empty = parse(block(['id: p', 'type: PROPOSITION', 'natural_name: P', 'premises: []', 'follows_from: nothing']));
    expect(codes(empty)).toEqual([]);
    expect(nodesOf(empty).get('p')?.node).toMatchObject({ premises: [], fromNothing: true });
    const noMark = parse(block(['id: p', 'type: PROPOSITION', 'natural_name: P', 'premises: []']));
    expect(nodesOf(noMark).get('p')?.node.fromNothing).toBeUndefined();
  });

  it('a repeated line is TL005 (the first one counts)', () => {
    const file = parse(block(['id: p', 'type: PROPOSITION', 'natural_name: P', 'follows_from: nothing', 'follows_from: something']));
    expect(only(file).fields.followsFrom).toBe('nothing');
    expect(codes(file)).toEqual(['TL005']);
  });
});
