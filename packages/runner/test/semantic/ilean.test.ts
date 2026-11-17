/** The `.ilean` reader on recorded Lean 4.35 index files. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { declDrafts, lineStarts, parseIlean, type IleanData } from '../../src/semantic/index.js';
import { overlayText, recorded, SPYRO } from './helpers.js';

const r = (l1: number, c1: number, l2: number, c2: number): { start: { line: number; character: number }; end: { line: number; character: number } } => ({
  start: { line: l1, character: c1 },
  end: { line: l2, character: c2 },
});

function parsed(file: string, module: string): IleanData {
  const result = parseIlean(recorded(file), module);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

describe('parseIlean', () => {
  it('reads Spyro Vocabulary: eleven declarations in source order, with full and selection ranges', () => {
    const data = parsed('spyro-Vocabulary.ilean.json', 'Model.Spyro.Vocabulary');
    expect(data.decls.map((d) => d.name)).toEqual([
      'Spyro.Character',
      'Spyro.Game',
      'Spyro.Character.exists',
      'Spyro.instNonemptyCharacter',
      'Spyro.Game.exists',
      'Spyro.instNonemptyGame',
      'Spyro.HasDarkPast',
      'Spyro.IsPG',
      'Spyro.GoodAddition',
      'Spyro.cynder',
      'Spyro.newSpyro',
    ]);
    expect(data.decls[0]).toEqual({ name: 'Spyro.Character', range: r(2, 0, 3, 22), selectionRange: r(3, 6, 3, 15), auxiliary: false });
    expect(data.decls.every((d) => d.parent === undefined && !d.auxiliary)).toBe(true);
    // Usages keep the defining module; `Nonempty` comes from the prelude.
    expect(data.usages.filter((u) => u.parent === 'Spyro.instNonemptyCharacter')).toEqual([
      { name: 'Nonempty', module: 'Init.Prelude', range: r(8, 11, 8, 19), parent: 'Spyro.instNonemptyCharacter' },
      { name: 'Spyro.Character', module: 'Model.Spyro.Vocabulary', range: r(8, 20, 8, 29), parent: 'Spyro.instNonemptyCharacter' },
      { name: 'Spyro.Character.exists', module: 'Model.Spyro.Vocabulary', range: r(8, 33, 8, 49), parent: 'Spyro.instNonemptyCharacter' },
    ]);
  });

  it('reads Spyro Main: references inside each declaration, in source order', () => {
    const data = parsed('spyro-Main.ilean.json', 'Model.Spyro.Main');
    expect(data.decls.map((d) => d.name)).toEqual([
      'Spyro.cynder_dark_past',
      'Spyro.cynder_dark_past.holds',
      'Spyro.new_spyro_pg',
      'Spyro.new_spyro_pg.holds',
      'Spyro.cynder_not_good',
    ]);
    expect(data.usages.filter((u) => u.parent === 'Spyro.cynder_dark_past')).toEqual([
      { name: 'Spyro.HasDarkPast', module: 'Model.Spyro.Vocabulary', range: r(24, 34, 24, 45), parent: 'Spyro.cynder_dark_past' },
      { name: 'Spyro.cynder', module: 'Model.Spyro.Vocabulary', range: r(24, 46, 24, 52), parent: 'Spyro.cynder_dark_past' },
    ]);
    expect(data.usages.filter((u) => u.parent === 'Spyro.cynder_not_good').map((u) => u.name)).toEqual(['Spyro.GoodAddition', 'Spyro.cynder', 'Spyro.newSpyro']);
  });

  it('adds auxiliary names with their parent, skips private names, keeps elaborated projections', () => {
    const data = parsed('extras-Main.ilean.json', 'Model.Spyro.Main');
    const past = data.decls.find((d) => d.name === 'Spyro.Rec.past');
    expect(past).toEqual({ name: 'Spyro.Rec.past', range: r(101, 2, 101, 6), selectionRange: r(101, 2, 101, 6), parent: 'Spyro.Rec', auxiliary: true });
    expect(data.decls.some((d) => d.name.startsWith('_private.'))).toBe(false);
    expect(data.usages.some((u) => u.parent.startsWith('_private.') || u.name.startsWith('_private.'))).toBe(false);
    expect(data.usages.filter((u) => u.parent === 'Spyro.g2.holds').map((u) => [u.name, u.module])).toEqual([
      ['Spyro.g2', 'Model.Spyro.Main'],
      ['Spyro.d0.holds', 'Model.Spyro.Main'],
      ['And.right', 'Init.Prelude'],
    ]);
    // Declarations with their own `decls` entry never get a parent from their own definition record.
    expect(data.decls.filter((d) => d.parent !== undefined).map((d) => d.name)).toEqual(['Spyro.Rec.past']);
  });

  it('reports the declarations Lean leaves out of `decls` (no constant in their source), never `example` or private ones', () => {
    // Recorded on Lean 4.35 (turn 13): `decls` omits a top-level declaration whose source mentions no constant
    // (`2 + 2 = 4`, a generic propositional lemma); its own `references` entry still has a parent-less definition.
    const data = parsed('unlisted-Inbox.ilean.json', 'Model.Demo.Inbox');
    expect(data.decls.filter((d) => d.unlisted === true).map((d) => d.name)).toEqual(['Demo.two_plus_two_is_four', 'Demo.plain_mp']);
    expect(data.decls.find((d) => d.name === 'Demo.two_plus_two_is_four')).toEqual({
      name: 'Demo.two_plus_two_is_four',
      range: r(3, 7, 3, 27),
      selectionRange: r(3, 7, 3, 27),
      auxiliary: false,
      unlisted: true,
    });
    const names = data.decls.map((d) => d.name);
    expect(names).toContain('Demo.two_plus_two_is_four.holds');
    expect(names).toContain('Demo.withWhere.aux');
    expect(names).toContain('Demo.Pt.x');
    expect(names.some((n) => n.endsWith('_example') || n.startsWith('_private.'))).toBe(false);
    expect(data.decls.filter((d) => d.unlisted === true && d.parent !== undefined)).toEqual([]);
  });

  it('refuses other versions, other modules and malformed files (no decls rather than wrong ones)', () => {
    const text = recorded('spyro-Main.ilean.json');
    const v6 = JSON.stringify({ ...JSON.parse(text), version: 6 });
    expect(parseIlean(v6, 'Model.Spyro.Main')).toEqual({ ok: false, error: 'unsupported .ilean version 6 (expected 5)' });
    expect(parseIlean(text, 'Model.Spyro.Vocabulary')).toMatchObject({ ok: false });
    expect(parseIlean('{not json', 'X')).toMatchObject({ ok: false });
    expect(parseIlean('[]', 'X')).toMatchObject({ ok: false });
    const odd = JSON.stringify({
      version: 5,
      module: 'M',
      decls: { 'A.ok': [0, 0, 0, 5, 0, 0, 0, 1], 'A.bad': [0, -1, 0, 5, 0, 0, 0, 1], 'A.short': [1, 2] },
      references: { notjson: {}, '{"f":{"m":"M","i":1}}': { usages: [[0, 1, 0, 2, 'A.ok']] }, '{"c":{"m":"M","n":"B"}}': { definition: null, usages: [[0, 1, 0, 2], [0, 3, 0, 4, 'A.ok']] } },
    });
    expect(parseIlean(odd, 'M')).toEqual({
      ok: true,
      data: {
        module: 'M',
        decls: [{ name: 'A.ok', range: r(0, 0, 0, 5), selectionRange: r(0, 0, 0, 1), auxiliary: false }],
        usages: [{ name: 'B', module: 'M', range: r(0, 3, 0, 4), parent: 'A.ok' }],
      },
    });
  });
});

describe('declDrafts', () => {
  it('attaches docstrings, source keywords and references to the Spyro Vocabulary declarations', () => {
    const text = readFileSync(path.join(SPYRO, 'Model/Spyro/Vocabulary.lean'), 'utf8');
    const drafts = declDrafts({ text, starts: lineStarts(text) }, parsed('spyro-Vocabulary.ilean.json', 'Model.Spyro.Vocabulary'));
    const by = new Map(drafts.map((d) => [d.name, d]));
    expect(by.get('Spyro.Character')).toMatchObject({ docstring: 'characters', keyword: 'axiom' });
    expect(by.get('Spyro.instNonemptyCharacter')).toMatchObject({ keyword: 'instance' });
    expect(by.get('Spyro.instNonemptyCharacter')?.docstring).toBeUndefined();
    expect(by.get('Spyro.cynder')).toMatchObject({ docstring: 'Cynder', keyword: 'opaque' });
    expect(by.get('Spyro.HasDarkPast')?.refs).toEqual([{ name: 'Spyro.Character', module: 'Model.Spyro.Vocabulary', range: r(13, 20, 13, 29) }]);
  });

  it('gives an unlisted declaration its full range, docstring and keyword from the source', () => {
    const text = recorded('unlisted-Inbox.lean');
    const drafts = declDrafts({ text, starts: lineStarts(text) }, parsed('unlisted-Inbox.ilean.json', 'Model.Demo.Inbox'));
    expect(drafts.find((d) => d.name === 'Demo.two_plus_two_is_four')).toEqual({
      name: 'Demo.two_plus_two_is_four',
      range: r(2, 0, 3, 47),
      selectionRange: r(3, 7, 3, 27),
      docstring: 'Two plus two is four',
      keyword: 'abbrev',
      refs: [],
    });
    expect(drafts.find((d) => d.name === 'Demo.plain_mp')).toMatchObject({ range: { start: { line: 6, character: 0 } }, keyword: 'theorem', refs: [] });
    expect(drafts.find((d) => d.name === 'Demo.plain_mp')?.docstring).toBeUndefined();
    // A parent-less definition of a name the source does not declare (a name Lean generates) is never reported.
    const generated = { name: 'Demo.instReprPt', range: r(8, 10, 8, 12), selectionRange: r(8, 10, 8, 12), auxiliary: false, unlisted: true as const };
    const data = parsed('unlisted-Inbox.ilean.json', 'Model.Demo.Inbox');
    expect(declDrafts({ text, starts: lineStarts(text) }, { ...data, decls: [...data.decls, generated] }).map((d) => d.name)).toEqual(drafts.map((d) => d.name));
  });

  it('extends an auxiliary declaration to its docstring', () => {
    const text = overlayText('extras', 'Model/Spyro/Main.lean');
    const drafts = declDrafts({ text, starts: lineStarts(text) }, parsed('extras-Main.ilean.json', 'Model.Spyro.Main'));
    const past = drafts.find((d) => d.name === 'Spyro.Rec.past');
    expect(past).toEqual({ name: 'Spyro.Rec.past', range: r(100, 2, 101, 6), selectionRange: r(101, 2, 101, 6), docstring: 'the past', parent: 'Spyro.Rec', refs: [] });
    expect(drafts.find((d) => d.name === 'Spyro.instInhabitedRec')).toMatchObject({ keyword: 'instance', docstring: 'A data instance' });
    expect(drafts.find((d) => d.name === 'Spyro.Rec')).toMatchObject({ keyword: 'structure', docstring: 'A record with one field' });
  });
});
