/**
 * AT1.9 — declaration spans end at plan 6.1's command starts (a column-0 `--` comment, `set_option`, `variable`,
 * `open`, `attribute` and `#check` lines end the preceding declaration; an indented continuation line does not; a
 * block comment after a theorem ends it) — and the rest of the header parser: names, namespaces, keywords,
 * modifiers, value starts, `mutual`, `deriving`, imports.
 */
import { describe, expect, it } from 'vitest';
import { parseLeanFile, type DeclInfo } from '../../src/index.js';

const decls = (text: string) => parseLeanFile('X.lean', text).decls;
const lines = (d: DeclInfo) => [d.range.start.line, d.range.end.line];
const summary = (text: string) => decls(text).map((d) => [d.fullName ?? d.keyword, ...lines(d)]);

describe('AT1.9 declaration spans end at command starts', () => {
  const text = [
    'namespace T',
    'theorem a : True := by',
    '  trivial',
    '-- column-0 comment',
    'theorem b : True := trivial',
    'set_option pp.all true',
    'theorem c : True :=',
    '  trivial',
    'variable (x : Nat)',
    'theorem d : True := trivial',
    'open Nat',
    'theorem e : True := trivial',
    'attribute [simp] e',
    'theorem f : True := trivial',
    '#check f',
    'theorem g : True := trivial',
    '/- a block comment -/',
    'theorem h : True :=',
    '  -- an indented comment stays in h',
    '  trivial',
    '',
    'end T',
    '',
  ].join('\n');

  it('ends each theorem before the next command start, keeping indented continuation lines', () => {
    expect(summary(text)).toEqual([
      ['T.a', 1, 2],
      ['T.b', 4, 4],
      ['T.c', 6, 7],
      ['T.d', 9, 9],
      ['T.e', 11, 11],
      ['T.f', 13, 13],
      ['T.g', 15, 15],
      ['T.h', 17, 19],
    ]);
  });

  it('a span ends at the end of its last non-blank line', () => {
    const h = decls(text).find((d) => d.name === 'h');
    expect(text.slice(h?.span.start, h?.span.end)).toBe('theorem h : True :=\n  -- an indented comment stays in h\n  trivial');
  });

  it('`deriving Repr` is a clause of the inductive above it; `deriving instance` is a command', () => {
    const src = 'inductive Color where\n  | red\n  | green\nderiving Repr\nderiving instance BEq for Color\nstructure P where\n  x : Nat\n  deriving DecidableEq\n';
    expect(summary(src)).toEqual([
      ['Color', 0, 3],
      ['P', 5, 7],
    ]);
  });

  it('`mutual … end` is one declaration (through its `end`), its members are found, and its `end` closes no namespace', () => {
    const src = [
      'namespace M',
      'mutual',
      '  def even : Nat → Bool',
      '    | 0 => true',
      '    | n+1 => odd n',
      '  def odd : Nat → Bool',
      '    | 0 => false',
      '    | n+1 => even n',
      'end',
      'theorem after : True := trivial',
      'end M',
    ].join('\n');
    const found = decls(src);
    expect(found.map((d) => [d.keyword, d.fullName, ...lines(d)])).toEqual([
      ['mutual', undefined, 1, 8],
      ['def', 'M.even', 2, 4],
      ['def', 'M.odd', 5, 7],
      ['theorem', 'M.after', 9, 9],
    ]);
    const even = found[1];
    expect(src.slice(even?.valueStart, (even?.valueStart ?? 0) + 5)).toBe('| 0 =');
  });

  it('indented declarations (an indented namespace body) are found and split', () => {
    const src = 'namespace I\n  /-- a doc -/\n  theorem a : True := trivial\n  theorem b : True :=\n    trivial\nend I\n';
    expect(decls(src).map((d) => [d.fullName, d.docstring, ...lines(d)])).toEqual([
      ['I.a', 'a doc', 1, 2],
      ['I.b', undefined, 3, 4],
    ]);
  });
});

describe('declaration headers', () => {
  it('resolves names against namespaces and sections (`_root_`, «escapes», dotted ends)', () => {
    const src = [
      'namespace A.B',
      'section S',
      'def x := 1',
      'end S',
      'noncomputable section',
      'def y := 2',
      'end',
      'def _root_.top := 3',
      'def «weird name» := 4',
      'def «plain» := 5',
      'end A.B',
      'def z := 6',
    ].join('\n');
    expect(decls(src).map((d) => [d.name, d.fullName, d.namespace.join('.')])).toEqual([
      ['x', 'A.B.x', 'A.B'],
      ['y', 'A.B.y', 'A.B'],
      ['_root_.top', 'top', 'A.B'],
      ['«weird name»', 'A.B.«weird name»', 'A.B'],
      ['«plain»', 'A.B.plain', 'A.B'],
      ['z', 'z', ''],
    ]);
  });

  it('reads keywords, modifiers, attributes, instance priorities and anonymous instances', () => {
    const src = [
      '@[simp, reducible] private noncomputable def m : Nat := 1',
      'instance (priority := low) instFoo : Inhabited Nat := ⟨0⟩',
      'instance (n : Nat) : Inhabited (Fin (n+1)) := ⟨0⟩',
      'class abbrev Both := Inhabited, Nonempty',
      'class inductive Foo',
      'protected theorem p : True := trivial',
      'example : True := trivial',
      'opaque o : Nat',
      'coinductive Stream',
    ].join('\n');
    const found = decls(src);
    expect(found.map((d) => [d.keyword, d.name])).toEqual([
      ['def', 'm'],
      ['instance', 'instFoo'],
      ['instance', undefined],
      ['class abbrev', 'Both'],
      ['class inductive', 'Foo'],
      ['theorem', 'p'],
      ['example', undefined],
      ['opaque', 'o'],
      ['coinductive', 'Stream'],
    ]);
    expect(found[0]).toMatchObject({ modifiers: ['private', 'noncomputable'], attributes: ['@[simp, reducible]'] });
    expect(found[5]?.modifiers).toEqual(['protected']);
    expect(src.slice(found[3]?.keywordSpan.start, found[3]?.keywordSpan.end)).toBe('class abbrev');
  });

  it('finds the value start: the first top-level `:=`, `where` or `|` (not inside brackets, not `|x|` notation)', () => {
    const at = (src: string) => {
      const d = decls(src)[0];
      return d?.valueStart === undefined ? undefined : src.slice(d.valueStart, d.valueStart + 5);
    };
    expect(at('def f (x : Nat := 1) : Nat := x')).toBe(':= x');
    expect(at('theorem t : 0 ≤ |a| := by simp')).toBe(':= by');
    expect(at('structure S where\n  x : Nat')).toBe('where');
    expect(at('instance : Inhabited Nat where default := 0')).toBe('where');
    expect(at('inductive C | a | b')).toBe('| a |');
    expect(at('def g : Nat → Nat\n  | 0 => 1\n  | n => n')).toBe('| 0 =');
    expect(at('def s : String := ":= not here"')).toBe(':= ":');
    expect(at('axiom ax : True')).toBeUndefined();
    expect(at('opaque o : Nat')).toBeUndefined();
  });

  it('a docstring attaches across a blank line and plain comments; a second docstring or a non-declaration does not attach', () => {
    expect(decls('/-- d -/\n\n-- note\n/- block -/\ndef x := 1\n').map((d) => [d.name, d.docstring, d.range.start.line])).toEqual([['x', 'd', 0]]);
    expect(decls('/-- first -/\n/-- second -/\ndef x := 1\n').map((d) => [d.name, d.docstring])).toEqual([['x', 'second']]);
    expect(decls('/-- doc before #check -/\n#check 1\ndef y := 2\n').map((d) => [d.name, d.docstring])).toEqual([['y', undefined]]);
  });

  it('reads the header imports only (module, public/meta, import all)', () => {
    const file = parseLeanFile('X.lean', 'module\n-- note\npublic import A.B\nimport all C\nmeta import D\nimport E\ndef x := 1\nimport F\n');
    expect(file.imports).toEqual(['A.B', 'C', 'D', 'E']);
  });
});

describe('column-0 comments inside a declaration (Lean treats comments as whitespace)', () => {
  const text = [
    'namespace Spyro',
    'abbrev d_col0 : Prop := True',
    'theorem d_col0.holds : d_col0 := by',
    '  unfold d_col0',
    '-- the key step: use the assumption',
    '  exact trivial',
    'theorem d2.holds : True := by',
    '/- older attempt:',
    '  simp',
    '-/',
    '  exact trivial',
    'abbrev a_multi : Prop :=',
    '-- the game is PG',
    '  True',
    'axiom a_multi.holds : a_multi',
    '-- a comment before the next command ends the declaration above it',
    '',
    '/- and so does a block comment before a command -/',
    'theorem last : True := trivial',
    '-- a trailing comment at the end of the file ends it too',
    'end Spyro',
    '',
  ].join('\n');

  it('a column-0 `--` or `/- -/` followed by indented code stays inside the declaration', () => {
    expect(summary(text)).toEqual([
      ['Spyro.d_col0', 1, 1],
      ['Spyro.d_col0.holds', 2, 5],
      ['Spyro.d2.holds', 6, 10],
      ['Spyro.a_multi', 11, 13],
      ['Spyro.a_multi.holds', 14, 14],
      ['Spyro.last', 18, 18],
    ]);
  });

  it('the spans hold the whole proof and the whole statement', () => {
    const span = (name: string) => {
      const d = decls(text).find((x) => x.fullName === name);
      return text.slice(d?.span.start, d?.span.end);
    };
    expect(span('Spyro.d_col0.holds')).toBe('theorem d_col0.holds : d_col0 := by\n  unfold d_col0\n-- the key step: use the assumption\n  exact trivial');
    expect(span('Spyro.d2.holds')).toBe('theorem d2.holds : True := by\n/- older attempt:\n  simp\n-/\n  exact trivial');
    expect(span('Spyro.a_multi')).toBe('abbrev a_multi : Prop :=\n-- the game is PG\n  True');
  });

  it('a column-0 comment followed by a blank line and more indented code still belongs to the declaration', () => {
    const src = 'theorem t : True := by\n  skip\n-- note\n\n  trivial\ntheorem u : True := trivial\n';
    expect(summary(src)).toEqual([
      ['t', 0, 4],
      ['u', 5, 5],
    ]);
  });

  it('an indented `end`/`namespace` is a command start too, so a column-0 comment before it ends the declaration', () => {
    const src = 'namespace Foo\n  theorem a : True := by\n    trivial\n-- a comment\n  end Foo\ntheorem b : True := trivial\n';
    expect(summary(src)).toEqual([
      ['Foo.a', 1, 2],
      ['b', 5, 5],
    ]);
  });

  it('a column-0 comment before `deriving Repr` (a clause, not a command) stays inside the inductive', () => {
    const src = 'inductive C where\n  | a\n-- derive it\nderiving Repr\ntheorem t : True := trivial\n';
    expect(summary(src)).toEqual([
      ['C', 0, 3],
      ['t', 4, 4],
    ]);
  });
});
