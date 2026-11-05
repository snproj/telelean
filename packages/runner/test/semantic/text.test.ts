/** Text helpers: positions (code points vs UTF-16), docstrings, declaration keywords, import headers. */
import { describe, expect, it } from 'vitest';

import {
  codePointsToUtf16,
  declKeywordAt,
  docstringAt,
  docstringBefore,
  leanToLspPosition,
  lineStarts,
  lineText,
  normalizeWhitespace,
  offsetOf,
  parseImports,
  positionAt,
} from '../../src/semantic/index.js';
import { overlayText } from './helpers.js';

describe('positions', () => {
  it('converts a Lean column after a non-BMP character to UTF-16 (AT3.9, unit)', () => {
    const line = 'def nonBmp : String := "𝔸" ++ undefinedThing';
    // Lean reported 56:30 for `undefinedThing` (recorded/lake-nonbmp-error.stdout.txt): 30 code points.
    expect(line.indexOf('undefinedThing')).toBe(31); // UTF-16 index: 𝔸 is two code units
    expect(codePointsToUtf16(line, 30)).toBe(31);
    expect(codePointsToUtf16(line, 24)).toBe(24); // before the 𝔸: no difference
    expect(codePointsToUtf16(line, 25)).toBe(26); // just after it
    expect(codePointsToUtf16('ab', 5)).toBe(5); // past the end: one unit per column

    const text = overlayText('nonbmp-error', 'Model/Spyro/Main.lean');
    expect(leanToLspPosition(56, 30, text)).toEqual({ line: 55, character: 31 });
    expect(leanToLspPosition(56, 30)).toEqual({ line: 55, character: 30 }); // no text: column kept
    expect(leanToLspPosition(1, 0, text)).toEqual({ line: 0, character: 0 });
  });

  it('indexes lines, offsets and positions', () => {
    const text = 'ab\r\n𝔸c\n\nlast';
    const starts = lineStarts(text);
    expect(starts).toEqual([0, 4, 8, 9]);
    expect(lineText(text, starts, 0)).toBe('ab\r');
    expect(lineText(text, starts, 1)).toBe('𝔸c');
    expect(lineText(text, starts, 3)).toBe('last');
    expect(lineText(text, starts, 4)).toBeUndefined();
    expect(offsetOf(text, starts, { line: 1, character: 2 })).toBe(6);
    expect(offsetOf(text, starts, { line: 1, character: 99 })).toBe(7); // clamped to the line end
    expect(offsetOf(text, starts, { line: 9, character: 0 })).toBeUndefined();
    expect(positionAt(starts, 6)).toEqual({ line: 1, character: 2 });
    expect(positionAt(starts, 0)).toEqual({ line: 0, character: 0 });
    expect(positionAt(starts, 9)).toEqual({ line: 3, character: 0 });
  });

  it('normalises whitespace runs (wrapped #check output)', () => {
    expect(normalizeWhitespace('Spyro.a →\n  Spyro.b → Spyro.d3 ')).toBe('Spyro.a → Spyro.b → Spyro.d3');
  });
});

describe('docstrings and declaration keywords', () => {
  it('reads the docstring at a declaration start, honouring nested comments', () => {
    const text = '/-- Cynder /- nested -/ is a character -/\nabbrev x : Prop := True';
    expect(docstringAt(text, 0)).toBe('Cynder /- nested -/ is a character');
    expect(docstringAt('/- plain comment -/ def x', 0)).toBeUndefined();
    expect(docstringAt('abbrev x : Prop := True', 0)).toBeUndefined();
    expect(docstringAt('/-- unterminated', 0)).toBeUndefined();
  });

  it('finds the docstring right before a structure field', () => {
    const text = 'structure Rec where\n  /-- the past -/\n  past : Prop\n';
    const at = text.indexOf('past :');
    expect(docstringBefore(text, at)).toEqual({ start: text.indexOf('/--'), text: 'the past' });
    expect(docstringBefore('structure Rec where\n  past : Prop', 22)).toBeUndefined();
    const nested = 'x\n/-- a /-- inner -/ b -/\n  f : T';
    expect(docstringBefore(nested, nested.indexOf('f :'))).toEqual({ start: 2, text: 'a /-- inner -/ b' });
  });

  it('finds the keyword after docstring, attributes and modifiers (the instance rule)', () => {
    expect(declKeywordAt('instance : Nonempty Character := Character.exists', 0)).toBe('instance');
    expect(declKeywordAt('/-- A data instance -/\ninstance instInhabitedRec : Inhabited Rec := ⟨⟨True⟩⟩', 0)).toBe('instance');
    expect(declKeywordAt('@[simp, instance 100] noncomputable scoped instance foo : T := x', 0)).toBe('instance');
    expect(declKeywordAt('@[instance] def foo : T := x', 0)).toBe('def');
    expect(declKeywordAt('/-- doc -/ -- comment\nprivate theorem t : True := trivial', 0)).toBe('theorem');
    expect(declKeywordAt('instance_like_name', 0)).toBe('instance_like_name');
    expect(declKeywordAt('noncomputable opaque cynder : Character', 0)).toBe('opaque');
    expect(declKeywordAt('   ', 0)).toBeUndefined();
  });
});

describe('import headers', () => {
  it('reads the imports of a module header', () => {
    expect(parseImports('import Model.Spyro.Vocabulary\n\nnamespace Spyro\nimport Not.This\n')).toEqual(['Model.Spyro.Vocabulary']);
    expect(parseImports('/-! module doc -/\n-- comment\nimport A.B -- trailing\nimport C\n\ndef x := 1')).toEqual(['A.B', 'C']);
    expect(parseImports('module\n\npublic import A\nmeta import B\nimport all C\nprelude')).toEqual(['A', 'B', 'C']);
    expect(parseImports('namespace X\nend X\n')).toEqual([]);
    expect(parseImports('')).toEqual([]);
  });
});
