/**
 * AT1.6 — `setBlockField` / `setBlockFields`, `removeBlockEdits` and `insertBlockEdits`: only the targeted lines
 * change (the rest of the file is byte-identical), a missing key goes to its FIELD_ORDER position, `null` removes
 * the line, a derived id is written back, blank-line spacing stays tidy, and CRLF stays CRLF.
 */
import { describe, expect, it } from 'vitest';
import {
  applyTextEdits,
  insertBlockEdits,
  parseLeanFile,
  removeBlockEdits,
  renderBlock,
  setBlockField,
  setBlockFields,
  subjectScaffold,
  type MarkupBlock,
  type ParsedFile,
} from '../../src/index.js';
import mainLean from '../../../../test-fixtures/spyro/Model/Spyro/Main.lean?raw';

const parse = (text: string, path = 'Model/Spyro/Main.lean'): ParsedFile => parseLeanFile(path, text);
const blockOf = (file: ParsedFile, id: string): MarkupBlock => {
  const block = file.blocks.find((b) => b.id === id);
  if (block === undefined) throw new Error(`no block ${id}`);
  return block;
};
const MAIN = parse(mainLean);
const mainLines = mainLean.split('\n');
const NEW_CARD = renderBlock({ id: 'new-card', type: 'AXIOM', naturalName: 'A new card' });

/** `lines` with `count` lines at `at` replaced by `insert`. */
const spliced = (lines: readonly string[], at: number, count: number, ...insert: string[]) => {
  const copy = [...lines];
  copy.splice(at, count, ...insert);
  return copy;
};

describe('AT1.6 setBlockField on the Spyro Main.lean', () => {
  it('changing a value touches only its line (and escapes it)', () => {
    const after = applyTextEdits(mainLean, setBlockField(MAIN, blockOf(MAIN, 'cynder-dark-past'), 'natural_name', 'Cynder has a dark past -/ really'));
    expect(after.split('\n')).toEqual(spliced(mainLines, 17, 1, 'natural_name: "Cynder has a dark past -\\/ really"'));
    expect(parse(after).blocks.find((b) => b.id === 'cynder-dark-past')?.fields.naturalName).toBe('Cynder has a dark past -/ really');
  });

  it('a missing key is inserted at its FIELD_ORDER position', () => {
    // pg-no-dark-past: id, type, natural_name, stance, asserted -> rationale goes before stance.
    const rationale = applyTextEdits(mainLean, setBlockField(MAIN, blockOf(MAIN, 'pg-no-dark-past'), 'rationale', 'the rating board says so'));
    expect(rationale.split('\n')).toEqual(spliced(mainLines, 9, 0, 'rationale: the rating board says so'));
    // cynder-not-good: id, type, natural_name, premises, asserted, lean -> stance goes before premises,
    const stance = applyTextEdits(mainLean, setBlockField(MAIN, blockOf(MAIN, 'cynder-not-good'), 'stance', 'believe'));
    expect(stance.split('\n')).toEqual(spliced(mainLines, 46, 0, 'stance: believe'));
    // and worded_by (last in FIELD_ORDER) after the last field line.
    const worded = applyTextEdits(mainLean, setBlockField(MAIN, blockOf(MAIN, 'cynder-not-good'), 'worded_by', 'user'));
    expect(worded.split('\n')).toEqual(spliced(mainLines, 49, 0, 'worded_by: user'));
    expect(parse(worded).diagnostics.map((d) => d.code)).toEqual(['TL011']);
  });

  it('null removes the line, and an empty list removes a list field', () => {
    const noSource = applyTextEdits(mainLean, setBlockField(MAIN, blockOf(MAIN, 'cynder-dark-past'), 'source', null));
    expect(noSource.split('\n')).toEqual(spliced(mainLines, 19, 1));
    const noPremises = applyTextEdits(mainLean, setBlockField(MAIN, blockOf(MAIN, 'cynder-not-good'), 'premises', []));
    expect(noPremises.split('\n')).toEqual(spliced(mainLines, 46, 1));
    expect(setBlockField(MAIN, blockOf(MAIN, 'pg-no-dark-past'), 'rationale', null)).toEqual([]);
  });

  it('lists are written `a, b`', () => {
    const after = applyTextEdits(mainLean, setBlockField(MAIN, blockOf(MAIN, 'cynder-not-good'), 'premises', ['cynder-dark-past', 'new-spyro-pg']));
    expect(after.split('\n')).toEqual(spliced(mainLines, 46, 1, 'premises: cynder-dark-past, new-spyro-pg'));
  });

  it('CRLF stays CRLF', () => {
    const crlf = mainLean.replaceAll('\n', '\r\n');
    const file = parse(crlf);
    const edits = setBlockFields(file, blockOf(file, 'pg-no-dark-past'), [
      { key: 'rationale', value: 'the rating board says so' },
      { key: 'natural_name', value: 'PG games have no dark pasts' },
    ]);
    const after = applyTextEdits(crlf, edits);
    expect(after.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/);
    const lf = applyTextEdits(
      mainLean,
      setBlockFields(MAIN, blockOf(MAIN, 'pg-no-dark-past'), [
        { key: 'rationale', value: 'the rating board says so' },
        { key: 'natural_name', value: 'PG games have no dark pasts' },
      ]),
    );
    expect(after).toBe(lf.replaceAll('\n', '\r\n'));
  });
});

describe('AT1.6 setBlockField: derived ids, duplicates, indentation, closers', () => {
  const idless = 'namespace X\n\n/-\n@@ telelean v1\ntype: GOAL\nnatural_name: Two words\n-/\n\nend X\n';

  it('writes the derived id (from the sentence it was derived from) once, right after the marker', () => {
    const file = parse(idless, 'X.lean');
    const block = file.blocks[0];
    expect(block?.idWritten).toBe(false);
    expect(block?.id).toBe('two-words');
    if (block === undefined) return;
    const after = applyTextEdits(idless, setBlockField(file, block, 'natural_name', 'Three words now'));
    expect(after).toBe('namespace X\n\n/-\n@@ telelean v1\nid: two-words\ntype: GOAL\nnatural_name: Three words now\n-/\n\nend X\n');
    const several = applyTextEdits(
      idless,
      setBlockFields(file, block, [
        { key: 'lean', value: ['X.two'] },
        { key: 'stance', value: 'rule' },
      ]),
    );
    expect(several).toBe('namespace X\n\n/-\n@@ telelean v1\nid: two-words\ntype: GOAL\nnatural_name: Two words\nstance: rule\nlean: X.two\n-/\n\nend X\n');
    const reparsed = parse(several, 'X.lean').blocks[0];
    expect(reparsed).toMatchObject({ id: 'two-words', idWritten: true, binding: { mode: 'pinned', statement: 'X.two' } });
  });

  it('removes repeated lines of a list key it sets, and keeps TL005 duplicates of other keys (user text)', () => {
    const text = '/-\n@@ telelean v1\nid: a\ntype: GOAL\nnatural_name: x\nnatural_name: y\ntags: t1\ntags: t2\n-/\n';
    const file = parse(text, 'X.lean');
    const block = file.blocks[0];
    if (block === undefined) throw new Error('no block');
    const after = applyTextEdits(
      text,
      setBlockFields(file, block, [
        { key: 'natural_name', value: 'z' },
        { key: 'tags', value: ['t3'] },
      ]),
    );
    // The second `natural_name:` (TL005, never shown) stays: only the first line's value changes.
    expect(after).toBe('/-\n@@ telelean v1\nid: a\ntype: GOAL\nnatural_name: z\nnatural_name: y\ntags: t3\n-/\n');
    const reparsed = parse(after, 'X.lean');
    expect(reparsed.blocks[0]?.fields.naturalName).toBe('z');
    expect(reparsed.diagnostics.map((d) => d.code)).toContain('TL005');
  });

  it('keeps the written key (`kind:`), the indentation of indented blocks, and spacing after `:`', () => {
    const text = '  /-\n  @@ telelean v1\n  id: a\n  kind: GOAL\n  natural_name:x\n  -/\n';
    const file = parse(text, 'X.lean');
    const block = file.blocks[0];
    if (block === undefined) throw new Error('no block');
    const after = applyTextEdits(
      text,
      setBlockFields(file, block, [
        { key: 'type', value: 'AXIOM' },
        { key: 'natural_name', value: 'y' },
        { key: 'rationale', value: 'r' },
      ]),
    );
    expect(after).toBe('  /-\n  @@ telelean v1\n  id: a\n  kind: AXIOM\n  natural_name: y\n  rationale: r\n  -/\n');
  });

  it('never glues a value to a closer on the same line', () => {
    const text = '/-\n@@ telelean v1\nid: a\ntype: GOAL\nnatural_name: x-/\n';
    const file = parse(text, 'X.lean');
    const block = file.blocks[0];
    if (block === undefined) throw new Error('no block');
    const value = applyTextEdits(text, setBlockField(file, block, 'natural_name', 'ends with a slash/'));
    expect(value).toBe('/-\n@@ telelean v1\nid: a\ntype: GOAL\nnatural_name: ends with a slash/ -/\n');
    expect(parse(value, 'X.lean').blocks[0]?.fields.naturalName).toBe('ends with a slash/');
    const added = applyTextEdits(text, setBlockField(file, block, 'rationale', 'r/'));
    expect(added).toBe('/-\n@@ telelean v1\nid: a\ntype: GOAL\nnatural_name: x\nrationale: r/\n-/\n');
    expect(parse(added, 'X.lean').blocks[0]?.fields).toMatchObject({ naturalName: 'x', rationale: 'r/' });
  });

  it('a block whose fields are all on the opener line gets new lines after the marker', () => {
    const text = '/- @@ telelean v1 -/\n';
    const file = parse(text, 'X.lean');
    const block = file.blocks[0];
    if (block === undefined) throw new Error('no block');
    const after = applyTextEdits(
      text,
      setBlockFields(file, block, [
        { key: 'type', value: 'PROPOSITION' },
        { key: 'natural_name', value: 'x/' },
      ]),
    );
    const reparsed = parse(after, 'X.lean');
    expect(reparsed.blocks[0]?.fields).toMatchObject({ type: 'PROPOSITION', naturalName: 'x/' });
    expect(reparsed.blocks[0]?.idWritten).toBe(true);
    expect(reparsed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});

describe('AT1.6 removeBlockEdits', () => {
  it('removes a code-less block, its line break and one of the two blank lines around it', () => {
    const after = applyTextEdits(mainLean, removeBlockEdits(MAIN, blockOf(MAIN, 'pg-no-dark-past')));
    expect(after.split('\n')).toEqual(spliced(mainLines, 4, 9));
    expect(after.startsWith('import Model.Spyro.Vocabulary\n\nnamespace Spyro\n\n/-\n@@ telelean v1\nid: cynder-dark-past\n')).toBe(true);
  });

  it('removes a formalised block and leaves its declarations where they were', () => {
    const after = applyTextEdits(mainLean, removeBlockEdits(MAIN, blockOf(MAIN, 'cynder-dark-past')));
    expect(after.split('\n')).toEqual(spliced(mainLines, 13, 10));
    const file = parse(after);
    expect(file.decls.map((d) => d.fullName)).toEqual(MAIN.decls.map((d) => d.fullName));
    expect(file.blocks.map((b) => b.id)).toEqual(['pg-no-dark-past', 'new-spyro-pg', 'cynder-not-good']);
  });

  it('leaves no blank line at the start or the end of a file, and keeps CRLF', () => {
    const block = '/-\n@@ telelean v1\nid: a\ntype: GOAL\nnatural_name: x\n-/';
    const first = `${block}\n\ndef y := 1\n`;
    expect(applyTextEdits(first, removeBlockEdits(parse(first, 'X.lean'), parse(first, 'X.lean').blocks[0] as MarkupBlock))).toBe('def y := 1\n');
    const last = `def y := 1\n\n${block}\n`;
    expect(applyTextEdits(last, removeBlockEdits(parse(last, 'X.lean'), parse(last, 'X.lean').blocks[0] as MarkupBlock))).toBe('def y := 1\n');
    const crlf = mainLean.replaceAll('\n', '\r\n');
    const file = parse(crlf);
    expect(applyTextEdits(crlf, removeBlockEdits(file, blockOf(file, 'pg-no-dark-past')))).toBe(spliced(mainLines, 4, 9).join('\r\n'));
  });
});

describe('AT1.6 insertBlockEdits', () => {
  it('end-of-namespace in the subjectScaffold Inbox text leaves exactly one blank line on each side (twice)', () => {
    const inbox = subjectScaffold('Spyro', 'Model').find((f) => f.path === 'Model/Spyro/Inbox.lean');
    expect(inbox).toBeDefined();
    const text = inbox?.text ?? '';
    const once = applyTextEdits(text, insertBlockEdits(parse(text, 'Model/Spyro/Inbox.lean'), NEW_CARD, { kind: 'end-of-namespace', namespace: 'Spyro' }));
    expect(once).toBe(`import Model.Spyro.Vocabulary\n\n-- New cards typed on the telelean board are added here.\nnamespace Spyro\n\n${NEW_CARD}\n\nend Spyro\n`);
    const second = renderBlock({ id: 'second-card', type: 'PROPOSITION', naturalName: 'Second' });
    const twice = applyTextEdits(once, insertBlockEdits(parse(once, 'Model/Spyro/Inbox.lean'), second, { kind: 'end-of-namespace', namespace: 'Spyro' }));
    expect(twice).toBe(`import Model.Spyro.Vocabulary\n\n-- New cards typed on the telelean board are added here.\nnamespace Spyro\n\n${NEW_CARD}\n\n${second}\n\nend Spyro\n`);
    const file = parse(twice, 'Model/Spyro/Inbox.lean');
    expect(file.blocks.map((b) => [b.id, b.binding.mode])).toEqual([
      ['new-card', 'none'],
      ['second-card', 'none'],
    ]);
    expect(file.diagnostics.map((d) => d.code)).toEqual(['TL011']);
  });

  it('end-of-namespace: the last matching namespace; no blank line is added where one exists; EOF when absent', () => {
    const text = 'namespace A\nend A\nnamespace B\ndef x := 1\nend B\nnamespace A\ndef y := 2\nend A\n';
    const after = applyTextEdits(text, insertBlockEdits(parse(text, 'X.lean'), NEW_CARD, { kind: 'end-of-namespace', namespace: 'A' }));
    expect(after).toBe(`namespace A\nend A\nnamespace B\ndef x := 1\nend B\nnamespace A\ndef y := 2\n\n${NEW_CARD}\n\nend A\n`);
    const missing = applyTextEdits(text, insertBlockEdits(parse(text, 'X.lean'), NEW_CARD, { kind: 'end-of-namespace', namespace: 'C' }));
    expect(missing).toBe(`${text}\n${NEW_CARD}\n`);
  });

  it('end-of-file with and without a final line break, and into an empty file', () => {
    const insert = (text: string) => applyTextEdits(text, insertBlockEdits(parse(text, 'X.lean'), NEW_CARD, { kind: 'end-of-file' }));
    expect(insert('def y := 1\n')).toBe(`def y := 1\n\n${NEW_CARD}\n`);
    expect(insert('def y := 1')).toBe(`def y := 1\n\n${NEW_CARD}\n`);
    expect(insert('def y := 1\n\n')).toBe(`def y := 1\n\n${NEW_CARD}\n`);
    expect(insert('')).toBe(`${NEW_CARD}\n`);
  });

  it('after-block: after the block and the declarations bound to it', () => {
    const afterFormalised = applyTextEdits(mainLean, insertBlockEdits(MAIN, NEW_CARD, { kind: 'after-block', blockId: 'cynder-dark-past' }));
    expect(afterFormalised.split('\n')).toEqual(spliced(mainLines, 26, 0, '', ...NEW_CARD.split('\n')));
    const afterCodeless = applyTextEdits(mainLean, insertBlockEdits(MAIN, NEW_CARD, { kind: 'after-block', blockId: 'pg-no-dark-past' }));
    expect(afterCodeless.split('\n')).toEqual(spliced(mainLines, 12, 0, '', ...NEW_CARD.split('\n')));
    const afterGoal = applyTextEdits(mainLean, insertBlockEdits(MAIN, NEW_CARD, { kind: 'after-block', blockId: 'cynder-not-good' }));
    expect(afterGoal.split('\n')).toEqual(spliced(mainLines, 52, 0, '', ...NEW_CARD.split('\n')));
    expect(parse(afterFormalised).blocks.find((b) => b.id === 'new-card')?.binding.mode).toBe('none');
    expect(() => insertBlockEdits(MAIN, NEW_CARD, { kind: 'after-block', blockId: 'nope' })).toThrow(/no block/);
  });

  it('converts the inserted block to CRLF in a CRLF file', () => {
    const crlf = mainLean.replaceAll('\n', '\r\n');
    const after = applyTextEdits(crlf, insertBlockEdits(parse(crlf), NEW_CARD, { kind: 'end-of-namespace', namespace: 'Spyro' }));
    expect(after.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/);
    expect(after).toBe(applyTextEdits(mainLean, insertBlockEdits(MAIN, NEW_CARD, { kind: 'end-of-namespace', namespace: 'Spyro' })).replaceAll('\n', '\r\n'));
  });
});

describe('applyTextEdits', () => {
  it('applies edits given in any order; insertions at one offset keep their order', () => {
    expect(
      applyTextEdits('abcdef', [
        { span: { start: 4, end: 6 }, newText: 'X' },
        { span: { start: 0, end: 1 }, newText: '' },
        { span: { start: 2, end: 2 }, newText: '1' },
        { span: { start: 2, end: 2 }, newText: '2' },
        { span: { start: 2, end: 3 }, newText: 'C' },
      ]),
    ).toBe('b12CdX');
  });

  it('refuses overlapping edits and spans outside the text', () => {
    expect(() =>
      applyTextEdits('abcdef', [
        { span: { start: 1, end: 3 }, newText: '' },
        { span: { start: 2, end: 4 }, newText: '' },
      ]),
    ).toThrow(/overlap/);
    expect(() => applyTextEdits('abc', [{ span: { start: 2, end: 5 }, newText: '' }])).toThrow(/outside/);
  });
});
