/**
 * AT1.3 — parsing the Spyro walkthrough (test-fixtures/spyro, read with Vite `?raw`) gives the frozen sample's
 * blocks, fields and ranges (samples/spyro.ts, itself checked against a real Lean 4.35 build), its declarations
 * with their spans, and the vocabulary declarations at exactly the sample's locations.
 */
import { describe, expect, it } from 'vitest';
import { findDecl, parseLeanFile, spyroGraph, spyroProvedGraph, spyroVocabulary, type ParsedFile, type Range, type TlGraph } from '../../src/index.js';
import mainLean from '../../../../test-fixtures/spyro/Model/Spyro/Main.lean?raw';
import vocabularyLean from '../../../../test-fixtures/spyro/Model/Spyro/Vocabulary.lean?raw';
import provedLean from '../../../../test-fixtures/runner-lean/overlays/proved/Model/Spyro/Main.lean?raw';

const main = parseLeanFile('Model/Spyro/Main.lean', mainLean);
const vocabulary = parseLeanFile('Model/Spyro/Vocabulary.lean', vocabularyLean);
const proved = parseLeanFile('Model/Spyro/Main.lean', provedLean);

const lineRange = (r: Range) => [r.start.line, r.end.line];

/** Every block agrees with the sample node of the same id: fields, block range and binding. */
function expectBlocksMatch(file: ParsedFile, graph: TlGraph) {
  expect(file.blocks.map((b) => b.id)).toEqual(graph.nodes.map((n) => n.id));
  for (const node of graph.nodes) {
    const block = file.blocks.find((b) => b.id === node.id);
    expect(block, node.id).toBeDefined();
    if (block === undefined) continue;
    expect(block.idWritten).toBe(true);
    expect(block.version).toBe(1);
    expect(block.fields.type).toBe(node.type);
    expect(block.fields.naturalName).toBe(node.naturalName);
    expect(block.fields.rationale).toBe(node.rationale);
    expect(block.fields.stance).toBe(node.stance);
    expect(block.fields.source).toBe(node.source);
    expect(block.fields.asserted).toBe(node.asserted);
    expect(block.fields.premises ?? []).toEqual(node.premises);
    expect(block.range).toEqual(node.loc?.range);
    expect(block.binding.mode).toBe(node.lean.binding);
    expect(block.binding.statement).toBe(node.lean.statement);
    expect(block.extensions).toEqual({});
  }
}

describe('AT1.3 test-fixtures/spyro/Model/Spyro/Main.lean', () => {
  it('has the four blocks of the sample, with its ids, fields and ranges (lines 4-11, 13-22, 27-36, 41-49)', () => {
    expect(main.blocks.map((b) => lineRange(b.range))).toEqual([
      [4, 11],
      [13, 22],
      [27, 36],
      [41, 49],
    ]);
    expectBlocksMatch(main, spyroGraph());
  });

  it('pg-no-dark-past is code-less; the other three are pinned', () => {
    const binding = (id: string) => main.blocks.find((b) => b.id === id)?.binding;
    expect(binding('pg-no-dark-past')).toEqual({ mode: 'none' });
    expect(binding('cynder-dark-past')).toMatchObject({ mode: 'pinned', statement: 'Spyro.cynder_dark_past', pinned: ['Spyro.cynder_dark_past'] });
    expect(binding('new-spyro-pg')).toMatchObject({ mode: 'pinned', statement: 'Spyro.new_spyro_pg', pinned: ['Spyro.new_spyro_pg'] });
    expect(binding('cynder-not-good')).toMatchObject({ mode: 'pinned', statement: 'Spyro.cynder_not_good', pinned: ['Spyro.cynder_not_good'] });
  });

  it('declares the statements and .holds axioms, each span ending on its own line', () => {
    expect(main.decls.map((d) => [d.keyword, d.fullName, ...lineRange(d.range)])).toEqual([
      ['abbrev', 'Spyro.cynder_dark_past', 23, 24],
      ['axiom', 'Spyro.cynder_dark_past.holds', 25, 25],
      ['abbrev', 'Spyro.new_spyro_pg', 37, 38],
      ['axiom', 'Spyro.new_spyro_pg.holds', 39, 39],
      ['abbrev', 'Spyro.cynder_not_good', 50, 51],
    ]);
    const holds = findDecl(main, 'Spyro.cynder_dark_past.holds');
    expect(holds).toMatchObject({ keyword: 'axiom', name: 'cynder_dark_past.holds', namespace: ['Spyro'], modifiers: [] });
    expect(holds?.valueStart).toBeUndefined();
    expect(mainLean.slice(holds?.span.start, holds?.span.end)).toBe('axiom cynder_dark_past.holds : cynder_dark_past');
    const statement = findDecl(main, 'Spyro.cynder_dark_past');
    expect(statement?.docstring).toBe('Cynder is a character who has a dark past');
    expect(mainLean.slice(statement?.span.start, statement?.span.end)).toBe(
      '/-- Cynder is a character who has a dark past -/\nabbrev cynder_dark_past : Prop := HasDarkPast cynder',
    );
    expect(mainLean.slice(statement?.valueStart, (statement?.valueStart ?? 0) + 2)).toBe(':=');
    expect(mainLean.slice(statement?.nameSpan?.start, statement?.nameSpan?.end)).toBe('cynder_dark_past');
  });

  it("each card's codeLoc in the sample runs from its statement's span start to its last declaration's end", () => {
    for (const node of spyroGraph().nodes) {
      if (node.lean.statement === undefined) continue;
      const statement = findDecl(main, node.lean.statement);
      const last = findDecl(main, node.lean.justification ?? node.lean.statement);
      expect(node.lean.codeLoc?.range).toEqual({ start: statement?.range.start, end: last?.range.end });
      expect(mainLean.slice(statement?.span.start, last?.span.end)).toBe(node.lean.code);
    }
  });

  it('imports Model.Spyro.Vocabulary, keeps LF and has no diagnostics but TL011 for the rationale-less assumption', () => {
    expect(main.imports).toEqual(['Model.Spyro.Vocabulary']);
    expect(main.eol).toBe('\n');
    expect(main.text).toBe(mainLean);
    expect(main.diagnostics.map((d) => [d.code, d.nodeId])).toEqual([['TL011', 'pg-no-dark-past']]);
  });
});

describe('AT1.3 test-fixtures/spyro/Model/Spyro/Vocabulary.lean', () => {
  it('declares 11 declarations, including two anonymous instances', () => {
    expect(vocabulary.decls.map((d) => [d.keyword, d.fullName])).toEqual([
      ['axiom', 'Spyro.Character'],
      ['axiom', 'Spyro.Game'],
      ['axiom', 'Spyro.Character.exists'],
      ['instance', undefined],
      ['axiom', 'Spyro.Game.exists'],
      ['instance', undefined],
      ['axiom', 'Spyro.HasDarkPast'],
      ['axiom', 'Spyro.IsPG'],
      ['axiom', 'Spyro.GoodAddition'],
      ['opaque', 'Spyro.cynder'],
      ['opaque', 'Spyro.newSpyro'],
    ]);
    const instances = vocabulary.decls.filter((d) => d.keyword === 'instance');
    expect(instances.map((d) => [d.name, d.nameSpan, d.docstring, d.range.start.line])).toEqual([
      [undefined, undefined, undefined, 8],
      [undefined, undefined, undefined, 11],
    ]);
    expect(vocabulary.blocks).toEqual([]);
    expect(vocabulary.imports).toEqual([]);
    expect(vocabulary.diagnostics).toEqual([]);
  });

  it("puts each vocabulary declaration (with its docstring) exactly where the sample's Vocabulary group says", () => {
    for (const item of spyroVocabulary()) {
      const decl = findDecl(vocabulary, item.name);
      expect(decl?.range, item.name).toEqual(item.loc?.range);
      expect(vocabularyLean.slice(decl?.span.start, decl?.span.end)).toBe(item.code);
      expect(decl?.docstring).toBe(item.gloss);
    }
    expect(findDecl(vocabulary, 'Spyro.cynder')?.modifiers).toEqual(['noncomputable']);
  });
});

describe('AT1.3 the proved overlay (test-fixtures/runner-lean/overlays/proved)', () => {
  it("matches the sample's proved graph: four pinned blocks at its ranges", () => {
    expectBlocksMatch(proved, spyroProvedGraph());
  });

  it('declares the theorem cynder_not_good.holds over two lines, with its value start', () => {
    const theorem = findDecl(proved, 'Spyro.cynder_not_good.holds');
    expect(theorem?.keyword).toBe('theorem');
    expect(theorem?.range).toEqual({ start: { line: 56, character: 0 }, end: { line: 57, character: 81 } });
    expect(provedLean.slice(theorem?.valueStart, (theorem?.valueStart ?? 0) + 2)).toBe(':=');
    for (const node of spyroProvedGraph().nodes) {
      const statement = findDecl(proved, node.lean.statement ?? '');
      const last = findDecl(proved, node.lean.justification ?? node.lean.statement ?? '');
      expect(node.lean.codeLoc?.range, node.id).toEqual({ start: statement?.range.start, end: last?.range.end });
      expect(provedLean.slice(statement?.span.start, last?.span.end)).toBe(node.lean.code);
    }
  });
});
