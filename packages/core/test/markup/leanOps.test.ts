/**
 * AT1.7 — `applyLeanOps` on the Spyro texts and the runner-lean proved overlay: the D-11 kind-change rewrites,
 * declaration removal with tidy spacing, the binder-first `add-hypothesis`, `apply-hypothesis` (with `@`), the
 * escaped D-9 docstring mirror, and all-or-nothing problems.
 */
import { describe, expect, it } from 'vitest';
import { applyLeanOps, applyTextEdits, findDecl, lexLean, parseLeanFile, SPYRO_LEAN, type LeanOp, type ParsedFile, type Span } from '../../src/index.js';
import mainLean from '../../../../test-fixtures/spyro/Model/Spyro/Main.lean?raw';
import provedLean from '../../../../test-fixtures/runner-lean/overlays/proved/Model/Spyro/Main.lean?raw';

const MAIN = parseLeanFile('Model/Spyro/Main.lean', mainLean);
const PROVED = parseLeanFile('Model/Spyro/Main.lean', provedLean);
const mainLines = mainLean.split('\n');
const provedLines = provedLean.split('\n');

/** Applies the ops, expecting success, and returns the new text and archive. */
function run(file: ParsedFile, ops: LeanOp[]) {
  const result = applyLeanOps(file, ops);
  expect(result.problems).toEqual([]);
  return { text: applyTextEdits(file.text, result.edits), archived: result.archived };
}

/** The span of the `n`-th occurrence (0-based) of `needle` in `text`. */
function occurrence(text: string, needle: string, n = 0): Span {
  let at = -1;
  for (let i = 0; i <= n; i++) at = text.indexOf(needle, at + 1);
  if (at < 0) throw new Error(`no occurrence ${n} of ${needle}`);
  return { start: at, end: at + needle.length };
}

const spliced = (lines: readonly string[], at: number, count: number, ...insert: string[]) => {
  const copy = [...lines];
  copy.splice(at, count, ...insert);
  return copy;
};

describe('AT1.7 add-holds-axiom', () => {
  it('inserts `axiom cynder_not_good.holds : cynder_not_good` on the line after the statement', () => {
    const { text, archived } = run(MAIN, [{ op: 'add-holds-axiom', statement: 'Spyro.cynder_not_good' }]);
    expect(text.split('\n')).toEqual(spliced(mainLines, 52, 0, 'axiom cynder_not_good.holds : cynder_not_good'));
    expect(text).toContain('abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\naxiom cynder_not_good.holds : cynder_not_good\n\nend Spyro\n');
    expect(archived).toEqual([]);
    expect(findDecl(parseLeanFile('M.lean', text), 'Spyro.cynder_not_good.holds')?.keyword).toBe('axiom');
  });

  it('writes a `_root_` statement with `_root_.` so the axiom is not declared inside the namespace', () => {
    const text = 'namespace S\nabbrev _root_.top : Prop := True\nend S\n';
    const { text: after } = run(parseLeanFile('S.lean', text), [{ op: 'add-holds-axiom', statement: 'top' }]);
    expect(after).toBe('namespace S\nabbrev _root_.top : Prop := True\naxiom _root_.top.holds : _root_.top\nend S\n');
    expect(parseLeanFile('S.lean', after).decls.map((d) => d.fullName)).toEqual(['top', 'top.holds']);
  });

  it('refuses when the statement is missing or its .holds already exists', () => {
    expect(applyLeanOps(MAIN, [{ op: 'add-holds-axiom', statement: 'Spyro.nope' }]).problems).toHaveLength(1);
    expect(applyLeanOps(MAIN, [{ op: 'add-holds-axiom', statement: 'Spyro.cynder_dark_past' }]).problems[0]).toMatch(/already exists/);
  });
});

describe('AT1.7 holds-theorem-to-axiom', () => {
  it("replaces the theorem by the axiom line and archives exactly the theorem's text", () => {
    const { text, archived } = run(PROVED, [{ op: 'holds-theorem-to-axiom', statement: 'Spyro.cynder_not_good' }]);
    expect(archived).toEqual([{ name: 'Spyro.cynder_not_good.holds', text: SPYRO_LEAN.cynderNotGoodProof }]);
    expect(text.split('\n')).toEqual(spliced(provedLines, 56, 2, 'axiom cynder_not_good.holds : cynder_not_good'));
  });

  it('refuses an axiom .holds (nothing to convert)', () => {
    expect(applyLeanOps(MAIN, [{ op: 'holds-theorem-to-axiom', statement: 'Spyro.cynder_dark_past' }]).problems[0]).toMatch(/already an axiom/);
  });
});

describe('AT1.7 remove-holds and remove-decl', () => {
  it('remove-holds deletes the theorem (archived when asked) and keeps the spacing', () => {
    const { text, archived } = run(PROVED, [{ op: 'remove-holds', statement: 'Spyro.cynder_not_good', archive: true }]);
    expect(archived).toEqual([{ name: 'Spyro.cynder_not_good.holds', text: SPYRO_LEAN.cynderNotGoodProof }]);
    expect(text.split('\n')).toEqual(spliced(provedLines, 56, 2));
    expect(text.endsWith('abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n\nend Spyro\n')).toBe(true);
    const axiom = run(MAIN, [{ op: 'remove-holds', statement: 'Spyro.cynder_dark_past', archive: false }]);
    expect(axiom.archived).toEqual([]);
    expect(axiom.text.split('\n')).toEqual(spliced(mainLines, 25, 1));
  });

  it('remove-decl deletes the declaration with its docstring', () => {
    const { text, archived } = run(MAIN, [{ op: 'remove-decl', name: 'Spyro.cynder_not_good', archive: true }]);
    expect(archived).toEqual([{ name: 'Spyro.cynder_not_good', text: SPYRO_LEAN.cynderNotGood }]);
    expect(text.split('\n')).toEqual(spliced(mainLines, 50, 2));
  });

  it('removes one of the two blank lines a declaration leaves behind', () => {
    const text = 'namespace T\n\ntheorem a : True := trivial\n\n/-- doc of b -/\ntheorem b : True :=\n  trivial\n\ntheorem c : True := trivial\nend T\n';
    const file = parseLeanFile('T.lean', text);
    expect(run(file, [{ op: 'remove-decl', name: 'T.b', archive: false }]).text).toBe('namespace T\n\ntheorem a : True := trivial\n\ntheorem c : True := trivial\nend T\n');
    // The statement and its .holds together, as a delete does.
    expect(run(MAIN, [{ op: 'remove-decl', name: 'Spyro.cynder_dark_past', archive: false }, { op: 'remove-holds', statement: 'Spyro.cynder_dark_past', archive: false }]).text.split('\n')).toEqual(
      spliced(mainLines, 23, 3),
    );
  });
});

describe('AT1.7 add-hypothesis and apply-hypothesis (the D-11 rewrite)', () => {
  const text = 'namespace Spyro\nabbrev d1 : Prop := cynder_not_good\ntheorem d1.holds (h : cynder_not_good) : d1 := foo x.holds h\ntheorem d2.holds : d2 := foo c (@c y) c.left\nend Spyro\n';
  const file = parseLeanFile('D.lean', text);

  it('puts the binder right after the name, before the existing binders, and replaces the given spans', () => {
    const { text: after } = run(file, [{ op: 'add-hypothesis', decl: 'Spyro.d1.holds', hypName: 'h_x', hypType: 'x', replace: [occurrence(text, 'x.holds')] }]);
    expect(after).toContain('theorem d1.holds (h_x : x) (h : cynder_not_good) : d1 := foo h_x h\n');
    expect(after.split('\n').filter((line, i) => line !== text.split('\n')[i])).toEqual(['theorem d1.holds (h_x : x) (h : cynder_not_good) : d1 := foo h_x h']);
  });

  it('wraps each occurrence as (c h_x), including a preceding @ as (@c h_x), also inside a dotted name', () => {
    const plain = text.indexOf('foo c (') + 4;
    const at = text.indexOf('@c') + 1;
    const dotted = text.indexOf('c.left');
    const replace: Span[] = [
      { start: plain, end: plain + 1 },
      { start: at, end: at + 1 },
      { start: dotted, end: dotted + 1 },
    ];
    const { text: after } = run(file, [{ op: 'apply-hypothesis', decl: 'Spyro.d2.holds', hypName: 'h_x', replace }]);
    expect(after).toContain('theorem d2.holds : d2 := foo (c h_x) ((@c h_x) y) (c h_x).left\n');
  });

  it('accepts an occurrence span that already starts at the @', () => {
    const at = text.indexOf('@c');
    const { text: after } = run(file, [{ op: 'apply-hypothesis', decl: 'Spyro.d2.holds', hypName: 'h_x', replace: [{ start: at, end: at + 2 }] }]);
    expect(after).toContain('theorem d2.holds : d2 := foo c ((@c h_x) y) c.left\n');
  });

  it('goes after universe parameters', () => {
    const u = 'theorem e.holds.{u} (h : P) : e := h\n';
    expect(run(parseLeanFile('E.lean', u), [{ op: 'add-hypothesis', decl: 'e.holds', hypName: 'h_x', hypType: 'x', replace: [] }]).text).toBe(
      'theorem e.holds.{u} (h_x : x) (h : P) : e := h\n',
    );
  });

  it('refuses spans that are not identifiers inside the declaration, and bad hypothesis names or types', () => {
    const bad = (op: LeanOp) => applyLeanOps(file, [op]).problems;
    expect(bad({ op: 'add-hypothesis', decl: 'Spyro.d1.holds', hypName: 'h_x', hypType: 'x', replace: [{ start: text.indexOf('x.holds') + 1, end: text.indexOf('x.holds') + 3 }] })).toHaveLength(1);
    expect(bad({ op: 'add-hypothesis', decl: 'Spyro.d1.holds', hypName: 'h_x', hypType: 'x', replace: [occurrence(text, 'cynder_not_good')] })).toHaveLength(1);
    expect(bad({ op: 'apply-hypothesis', decl: 'Spyro.d2.holds', hypName: 'h x', replace: [] })).toHaveLength(1);
    expect(bad({ op: 'add-hypothesis', decl: 'Spyro.d1.holds', hypName: 'h_x', hypType: 'x -- comment', replace: [] })).toHaveLength(1);
  });
});

describe('AT1.7 set-docstring (the D-9 mirror)', () => {
  it('replaces an existing docstring, escaping both comment delimiters', () => {
    const { text } = run(MAIN, [{ op: 'set-docstring', decl: 'Spyro.cynder_dark_past', text: 'Cynder has a dark past -/ or /- not' }]);
    expect(text.split('\n')).toEqual(spliced(mainLines, 23, 1, '/-- Cynder has a dark past -\\/ or /\\- not -/'));
    const decl = findDecl(parseLeanFile('M.lean', text), 'Spyro.cynder_dark_past');
    expect(decl?.docstring).toBe('Cynder has a dark past -\\/ or /\\- not');
    expect(lexLean(text).comments.filter((c) => c.kind === 'doc')).toHaveLength(3);
  });

  it('never writes a docstring that Lean would not close (a leading `--` is escaped)', () => {
    const { text } = run(MAIN, [{ op: 'set-docstring', decl: 'Spyro.cynder_not_good', text: '-- not good' }]);
    expect(text.split('\n')[50]).toBe('/-- \\-- not good -/');
    const decl = findDecl(parseLeanFile('M.lean', text), 'Spyro.cynder_not_good');
    expect(decl?.docstring).toBe('\\-- not good');
    expect(decl?.range.start.line).toBe(50);
  });

  it('inserts a docstring before the declaration (and its attributes), with its indentation', () => {
    const text = 'namespace T\n  @[simp] theorem a : True := trivial\nabbrev b : Prop := True\nend T\n';
    const file = parseLeanFile('T.lean', text);
    const { text: after } = run(file, [
      { op: 'set-docstring', decl: 'T.a', text: 'A -/ B' },
      { op: 'set-docstring', decl: 'T.b', text: 'C /- D' },
    ]);
    expect(after).toBe('namespace T\n  /-- A -\\/ B -/\n  @[simp] theorem a : True := trivial\n/-- C /\\- D -/\nabbrev b : Prop := True\nend T\n');
    const reparsed = parseLeanFile('T.lean', after);
    expect(reparsed.decls.map((d) => [d.fullName, d.docstring])).toEqual([
      ['T.a', 'A -\\/ B'],
      ['T.b', 'C /\\- D'],
    ]);
  });
});

describe('AT1.7 all or nothing', () => {
  it('a missing declaration is reported in problems and no edits are returned', () => {
    const result = applyLeanOps(MAIN, [
      { op: 'add-holds-axiom', statement: 'Spyro.cynder_not_good' },
      { op: 'remove-decl', name: 'Spyro.missing', archive: true },
    ]);
    expect(result.problems).toEqual(['The declaration `Spyro.missing` is not declared in Model/Spyro/Main.lean.']);
    expect(result.edits).toEqual([]);
    expect(result.archived).toEqual([]);
  });

  it('overlapping operations are refused', () => {
    const result = applyLeanOps(MAIN, [
      { op: 'remove-decl', name: 'Spyro.cynder_dark_past', archive: false },
      { op: 'set-docstring', decl: 'Spyro.cynder_dark_past', text: 'x' },
    ]);
    expect(result.problems[0]).toMatch(/overlapping/);
    expect(result.edits).toEqual([]);
  });

  it('a declaration holding a telelean block (between its docstring and keyword) is not removed', () => {
    const text = '/-- Docstring for e. -/\n/-\n@@ telelean v1\nid: e\ntype: GOAL\nnatural_name: e\n-/\ndef e : Prop := True\n';
    const result = applyLeanOps(parseLeanFile('E.lean', text), [{ op: 'remove-decl', name: 'e', archive: false }]);
    expect(result.problems[0]).toMatch(/contains the telelean block `e`/);
    expect(result.edits).toEqual([]);
  });
});

describe('column-0 comments inside a declaration: removal and replacement take the whole declaration', () => {
  const text = [
    'namespace Spyro',
    '',
    'abbrev d_col0 : Prop := True',
    'theorem d_col0.holds : d_col0 := by',
    '  unfold d_col0',
    '-- the key step: use the assumption',
    '  exact trivial',
    '',
    '/-- The game is PG -/',
    'abbrev a_multi : Prop :=',
    '-- the game is PG',
    '  True',
    'axiom a_multi.holds : a_multi',
    '',
    'end Spyro',
    '',
  ].join('\n');
  const file = parseLeanFile('Model/Spyro/Main.lean', text);

  it('holds-theorem-to-axiom replaces (and archives) the whole proof', () => {
    const { text: after, archived } = run(file, [{ op: 'holds-theorem-to-axiom', statement: 'Spyro.d_col0' }]);
    expect(archived).toEqual([{ name: 'Spyro.d_col0.holds', text: 'theorem d_col0.holds : d_col0 := by\n  unfold d_col0\n-- the key step: use the assumption\n  exact trivial' }]);
    expect(after).toContain('abbrev d_col0 : Prop := True\naxiom d_col0.holds : d_col0\n\n/-- The game is PG -/');
    expect(after).not.toContain('exact trivial');
  });

  it('remove-holds and remove-decl remove the whole declarations', () => {
    const { text: after } = run(file, [
      { op: 'remove-holds', statement: 'Spyro.d_col0', archive: true },
      { op: 'remove-decl', name: 'Spyro.a_multi', archive: false },
      { op: 'remove-holds', statement: 'Spyro.a_multi', archive: false },
    ]);
    expect(after).toBe('namespace Spyro\n\nabbrev d_col0 : Prop := True\n\nend Spyro\n');
  });

  it('refuses to remove a declaration whose span would leave an indented continuation behind', () => {
    // A hand-built parse whose span stops early (as the old command-start rule did): the indented line after it is refused.
    const decl = findDecl(file, 'Spyro.d_col0.holds');
    if (!decl) throw new Error('no decl');
    const cut = text.indexOf('\n-- the key step');
    const truncated: ParsedFile = { ...file, decls: file.decls.map((d) => (d === decl ? { ...d, span: { start: d.span.start, end: cut } } : d)) };
    const result = applyLeanOps(truncated, [{ op: 'remove-holds', statement: 'Spyro.d_col0', archive: true }]);
    expect(result.edits).toEqual([]);
    expect(result.problems.join(' ')).toMatch(/Where `Spyro\.d_col0\.holds` ends is unclear/);
  });
});
