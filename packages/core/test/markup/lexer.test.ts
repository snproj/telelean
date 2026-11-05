/**
 * AT1.1 — the lexer (`lexLean`) on the research lexing cases of
 * verbatim_prompt_log/bundle_1/subagent_reports/research_workflow/artifacts/r4-markup-lsp/scripts/gen_lex_tests.py
 * (texts copied verbatim; the research ran each with Lean 4.35), plus edge cases checked against Lean 4.35 itself.
 */
import { describe, expect, it } from 'vitest';
import { lexLean, type CommentKind, type LexResult } from '../../src/index.js';

type ExpectedComment = [kind: CommentKind, start: number, end: number, unterminated?: 'unterminated'];

const comments = (lex: LexResult): ExpectedComment[] =>
  lex.comments.map((c): ExpectedComment => (c.unterminated ? [c.kind, c.span.start, c.span.end, 'unterminated'] : [c.kind, c.span.start, c.span.end]));
const tokens = (lex: LexResult) => lex.tokens.map((t) => t.text);

/** gen_lex_tests.py, case by case: the text, the comments (kind and span) and the code tokens Lean sees. */
const CASES: Array<{ name: string; text: string; comments: ExpectedComment[]; tokens: string[] }> = [
  {
    name: 'L01_nested_ok',
    text: '/- outer /- inner -/ still comment -/\ndef a := 1\n#print a\n',
    comments: [['block', 0, 37]],
    tokens: ['def', 'a', ':', '=', '1', '#', 'print', 'a'],
  },
  {
    // The stray `-/` inside the value ends the comment; the rest is code (Lean: "unexpected identifier").
    name: 'L02_stray_close',
    text: '/-\n@@ telelean v1\nname: "A -/ B"\n-/\ndef b := 1\n#print b\n',
    comments: [['block', 0, 29]],
    tokens: ['B', '"\n-/\ndef b := 1\n#print b\n'],
  },
  {
    // The stray `/-` nests: the comment swallows the rest of the file (Lean: "unterminated comment").
    name: 'L03_stray_open',
    text: '/-\n@@ telelean v1\nname: "A /- B"\n-/\ndef c := 1\n#print c\n',
    comments: [['block', 0, 56, 'unterminated']],
    tokens: [],
  },
  {
    name: 'L04_escaped',
    text: '/-\n@@ telelean v1\nname: "A -\\/ B and C /\\u002d D"\n-/\ndef d := 1\n#print d\n',
    comments: [['block', 0, 52]],
    tokens: ['def', 'd', ':', '=', '1', '#', 'print', 'd'],
  },
  {
    name: 'L05_doc_no_decl',
    text: '/-- A docstring with no declaration -/\n\n/- @@ telelean v1\nid: x\n-/\n',
    comments: [
      ['doc', 0, 38],
      ['block', 40, 66],
    ],
    tokens: [],
  },
  {
    name: 'L06_doc_comment_decl',
    text:
      '/-- Docstring for e. -/\n/- @@ telelean v1\nid: e\n-/\ndef e := 1\n' +
      'open Lean in\n#eval show MetaM Unit from do\n  let d? ← findDocString? (← getEnv) `e\n  IO.println s!"doc(e) = {d?}"\n',
    comments: [
      ['doc', 0, 23],
      ['block', 24, 50],
    ],
    tokens: ['def', 'e', ':', '=', '1', 'open', 'Lean', 'in', '#', 'eval', 'show', 'MetaM', 'Unit', 'from', 'do', 'let', 'd?', '←', 'findDocString?', '(', '←', 'getEnv', ')', '`', 'e', 'IO.println', 's!', '"doc(e) = {d?}"'],
  },
  {
    name: 'L07_comment_doc_decl',
    text:
      '/- @@ telelean v1\nid: f\n-/\n/-- Docstring for f. -/\ndef f := 1\n' +
      'open Lean in\n#eval show MetaM Unit from do\n  let d? ← findDocString? (← getEnv) `f\n  IO.println s!"doc(f) = {d?}"\n',
    comments: [
      ['block', 0, 26],
      ['doc', 27, 50],
    ],
    tokens: ['def', 'f', ':', '=', '1', 'open', 'Lean', 'in', '#', 'eval', 'show', 'MetaM', 'Unit', 'from', 'do', 'let', 'd?', '←', 'findDocString?', '(', '←', 'getEnv', ')', '`', 'f', 'IO.println', 's!', '"doc(f) = {d?}"'],
  },
  {
    name: 'L08_string_literal',
    text: 'def s := "/- not a comment"\ndef t := 2\n-- line comment with /- inside\ndef u := 3\n#print u\n',
    comments: [['line', 39, 69]],
    tokens: ['def', 's', ':', '=', '"/- not a comment"', 'def', 't', ':', '=', '2', 'def', 'u', ':', '=', '3', '#', 'print', 'u'],
  },
  {
    name: 'L09_tab_in_comment',
    text: '/- a tab:\there -/\ndef g := 1\n#print g\n',
    comments: [['block', 0, 17]],
    tokens: ['def', 'g', ':', '=', '1', '#', 'print', 'g'],
  },
  {
    name: 'L09b_tab_in_code',
    text: 'def g2 :=\t1\n',
    comments: [],
    tokens: ['def', 'g2', ':', '=', '1'],
  },
  {
    name: 'L10_crlf',
    text: '/-\r\n@@ telelean v1\r\nid: h\r\n-/\r\ndef h := 1\r\n#print h\r\n',
    comments: [['block', 0, 29]],
    tokens: ['def', 'h', ':', '=', '1', '#', 'print', 'h'],
  },
  {
    name: 'L11_module_doc',
    text:
      'def i := 1\n/-! @@ telelean v1\nid: codeless-in-moddoc\n-/\ndef j := 2\n' +
      'open Lean in\n#eval show MetaM Unit from do\n  let ds := getMainModuleDoc (← getEnv)\n  IO.println s!"moduledocs = {ds.toArray.map (·.doc)}"\n',
    comments: [['moddoc', 11, 55]],
    tokens: ['def', 'i', ':', '=', '1', 'def', 'j', ':', '=', '2', 'open', 'Lean', 'in', '#', 'eval', 'show', 'MetaM', 'Unit', 'from', 'do', 'let', 'ds', ':', '=', 'getMainModuleDoc', '(', '←', 'getEnv', ')', 'IO.println', 's!', '"moduledocs = {ds.toArray.map (·.doc)}"'],
  },
  {
    name: 'L13_doc_before_command',
    text: '/-- doc before #check -/\n#check 1\n',
    comments: [['doc', 0, 24]],
    tokens: ['#', 'check', '1'],
  },
  {
    // UTF-16 offsets: 𝓝 is two code units.
    name: 'L14_nonbmp',
    text: '/- 𝓝 non-BMP and ∀ BMP in comment -/\ndef k := "𝓝"\n#eval k.length\n',
    comments: [['block', 0, 37]],
    tokens: ['def', 'k', ':', '=', '"𝓝"', '#', 'eval', 'k.length'],
  },
  {
    name: 'L16_block_as_docstring',
    text:
      '/--\n@@ telelean v1\nid: l\n-/\ndef l := 1\n' +
      'open Lean in\n#eval show MetaM Unit from do\n  let d? ← findDocString? (← getEnv) `l\n  IO.println s!"doc(l) = {repr d?}"\n',
    comments: [['doc', 0, 27]],
    tokens: ['def', 'l', ':', '=', '1', 'open', 'Lean', 'in', '#', 'eval', 'show', 'MetaM', 'Unit', 'from', 'do', 'let', 'd?', '←', 'findDocString?', '(', '←', 'getEnv', ')', '`', 'l', 'IO.println', 's!', '"doc(l) = {repr d?}"'],
  },
  {
    name: 'L17_triple_dash',
    text: '/--- three dashes -/\ndef m := 1\n',
    comments: [['doc', 0, 20]],
    tokens: ['def', 'm', ':', '=', '1'],
  },
  {
    name: 'L18_comment_between_attr_decl',
    text: '@[simp]\n/- comment between attribute and theorem -/\ntheorem n : 1 = 1 := rfl\n',
    comments: [['block', 8, 51]],
    tokens: ['@', '[', 'simp', ']', 'theorem', 'n', ':', '1', '=', '1', ':', '=', 'rfl'],
  },
  {
    name: 'L19_blank_line_doc_decl',
    text:
      '/-- doc then blank line -/\n\ndef o := 1\n' +
      'open Lean in\n#eval show MetaM Unit from do\n  let d? ← findDocString? (← getEnv) `o\n  IO.println s!"doc(o) = {d?}"\n',
    comments: [['doc', 0, 26]],
    tokens: ['def', 'o', ':', '=', '1', 'open', 'Lean', 'in', '#', 'eval', 'show', 'MetaM', 'Unit', 'from', 'do', 'let', 'd?', '←', 'findDocString?', '(', '←', 'getEnv', ')', '`', 'o', 'IO.println', 's!', '"doc(o) = {d?}"'],
  },
  {
    name: 'L20_unterminated_eof',
    text: 'def p := 1\n/- @@ telelean v1\nid: q\n',
    comments: [['block', 11, 35, 'unterminated']],
    tokens: ['def', 'p', ':', '=', '1'],
  },
];

describe('AT1.1 lexLean: the research lexing cases (gen_lex_tests.py)', () => {
  for (const c of CASES) {
    it(`${c.name}: comment kinds, spans and code tokens`, () => {
      const lex = lexLean(c.text);
      expect(comments(lex)).toEqual(c.comments);
      expect(tokens(lex)).toEqual(c.tokens);
      // Spans are UTF-16 offsets into the text; comments and tokens are disjoint and sorted.
      const spans = [...lex.comments.map((x) => x.span), ...lex.tokens.map((x) => x.span)].sort((a, b) => a.start - b.start);
      for (let i = 1; i < spans.length; i++) expect(spans[i]?.start).toBeGreaterThanOrEqual(spans[i - 1]?.end ?? 0);
      for (const t of lex.tokens) expect(c.text.slice(t.span.start, t.span.end)).toBe(t.text);
    });
  }

  it('comment bodies: after `/-`, or where Lean starts a doc body (after the whitespace following `/--`, `/-!`)', () => {
    const bodies = (text: string) => lexLean(text).comments.map((x) => text.slice(x.body.start, x.body.end));
    expect(bodies('/- outer /- inner -/ still comment -/\n')).toEqual([' outer /- inner -/ still comment ']);
    expect(bodies('/--- three dashes -/')).toEqual(['- three dashes ']);
    expect(bodies('/-! module doc -/')).toEqual(['module doc ']);
    expect(bodies('/-- Docstring for e. -/')).toEqual(['Docstring for e. ']);
    expect(bodies('-- note\r\nx')).toEqual([' note']);
    expect(bodies('def p := 1\n/- @@ telelean v1\nid: q\n')).toEqual([' @@ telelean v1\nid: q\n']);
  });

  it('token kinds: identifiers, strings, chars, numbers, symbols', () => {
    const kinds = (text: string) => lexLean(text).tokens.map((t) => `${t.kind}:${t.text}`);
    expect(kinds('def k := "𝓝"')).toEqual(['ident:def', 'ident:k', 'symbol::', 'symbol:=', 'string:"𝓝"']);
    expect(kinds("x 'a' '\\n' '\\x41' '\\u03B1' '𝓝'")).toEqual(['ident:x', "char:'a'", "char:'\\n'", "char:'\\x41'", "char:'\\u03B1'", "char:'𝓝'"]);
    expect(kinds('0x1F 0b101 0o17 1_000 1.5e-3 2e10')).toEqual(['number:0x1F', 'number:0b101', 'number:0o17', 'number:1_000', 'number:1.5e-3', 'number:2e10']);
    expect(kinds('h.1.2 [1..5]')).toEqual(['ident:h', 'symbol:.', 'number:1', 'symbol:.', 'number:2', 'symbol:[', 'number:1', 'symbol:.', 'symbol:.', 'number:5', 'symbol:]']);
  });
});

describe('lexLean: strings, chars, raw strings and «» hide comment markers', () => {
  it('a `/-` inside a string, char, raw string or «name» is not a comment', () => {
    const text = 'def s := "/- not a comment"\ndef c := \'"\'\ndef r := r#"-/ and /-"#\ndef «weird/-name» := 1\ndef h\' := 2\n';
    const lex = lexLean(text);
    expect(lex.comments).toEqual([]);
    expect(tokens(lex)).toEqual(['def', 's', ':', '=', '"/- not a comment"', 'def', 'c', ':', '=', '\'"\'', 'def', 'r', ':', '=', 'r#"-/ and /-"#', 'def', '«weird/-name»', ':', '=', '1', 'def', "h'", ':', '=', '2']);
  });

  it("an escaped quote `'\\''` is one char literal; `''` starts none", () => {
    expect(tokens(lexLean("x := '\\'' -- c"))).toEqual(['x', ':', '=', "'\\''"]);
    expect(lexLean("x := '\\'' -- c").comments.map((c) => c.kind)).toEqual(['line']);
    expect(tokens(lexLean("''a"))).toEqual(["'", "'", 'a']);
  });

  it('raw strings end at a quote followed by the same number of #', () => {
    expect(tokens(lexLean('r"a\\" b r##"x"# "#y"## z'))).toEqual(['r"a\\"', 'b', 'r##"x"# "#y"##', 'z']);
    expect(tokens(lexLean('r x'))).toEqual(['r', 'x']);
  });

  it('strings escape with backslash, may span lines, and run to EOF when unterminated', () => {
    expect(tokens(lexLean('"a\\"/-b" c'))).toEqual(['"a\\"/-b"', 'c']);
    expect(tokens(lexLean('"line1\n/- line2" d'))).toEqual(['"line1\n/- line2"', 'd']);
    expect(tokens(lexLean('x "never closed /- -/'))).toEqual(['x', '"never closed /- -/']);
  });

  it('interpolated strings: a quote inside {…} does not end them', () => {
    const lex = lexLean('def x := s!"a {f "/-" "}"} b" -- end');
    expect(tokens(lex)).toEqual(['def', 'x', ':', '=', 's!', '"a {f "/-" "}"} b"']);
    expect(lex.comments.map((c) => c.kind)).toEqual(['line']);
    // Not after other identifiers ending in `!`, nor a qualified one.
    expect(tokens(lexLean('foo!"{" x'))).toEqual(['foo!', '"{"', 'x']);
  });

  it('identifiers: dotted, «escaped» parts, Unicode letter-like and subscripts; other characters are symbols', () => {
    expect(tokens(lexLean('Foo.«a b».c x₁ α.β 𝓝x λ'))).toEqual(['Foo.«a b».c', 'x₁', 'α.β', '𝓝x', 'λ']);
    expect(tokens(lexLean('a.b. c'))).toEqual(['a.b', '.', 'c']);
    expect(tokens(lexLean('«open x'))).toEqual(['«', 'open', 'x']);
    expect(tokens(lexLean('😀 ∀'))).toEqual(['😀', '∀']);
  });

  it('`--` and `/-` start comments right after a token; a line comment ends before CRLF', () => {
    const lex = lexLean('a--b\r\nc/-d-/e');
    expect(tokens(lex)).toEqual(['a', 'c', 'e']);
    expect(comments(lex)).toEqual([
      ['line', 1, 4],
      ['block', 7, 12],
    ]);
  });
});

describe('lexLean: where the nesting scan starts (checked with Lean 4.35)', () => {
  // Lean's `whitespace` skips the character after `/-`, and the doc tokens `/--`, `/-!` are three characters long,
  // so for every kind the scan for `/-` and `-/` starts at the fourth character. Verified with
  // ~/.elan/toolchains/leanprover--lean4---v4.35.0/bin/lean on 2026-11-01:
  //   `/-/-/` + `def a` + `#print a`        -> prints `def a` (one complete comment)
  //   `/-/- inner -/ still open? -/`         -> error at 1:14 "unexpected identifier" (closed at the first `-/`)
  //   `/--/ doc -/` + `def b` + `#print b`   -> prints `def b` (a valid docstring)
  //   `/--/-/` + `def e`                     -> error "unterminated comment"
  it('`/-/-/` is one complete comment', () => {
    expect(comments(lexLean('/-/-/\ndef a : Nat := 1\n'))).toEqual([['block', 0, 5]]);
  });
  it('`/-/- inner -/` closes at the first `-/`', () => {
    const text = '/-/- inner -/ still open? -/\n';
    expect(comments(lexLean(text))).toEqual([['block', 0, 13]]);
    expect(tokens(lexLean(text))).toEqual(['still', 'open?', '-', '/']);
  });
  it('`/--/ doc -/` is a docstring', () => {
    const lex = lexLean('/--/ doc -/\ndef b : Nat := 1\n');
    expect(comments(lex)).toEqual([['doc', 0, 11]]);
    expect(tokens(lex).slice(0, 2)).toEqual(['def', 'b']);
  });
  it('`/--/-/` is unterminated', () => {
    const text = '/--/-/\ndef e : Nat := 1\n';
    expect(comments(lexLean(text))).toEqual([['doc', 0, text.length, 'unterminated']]);
  });
});

describe('lexLean: whitespace after `/--` and `/-!` (checked with Lean 4.35)', () => {
  // Like every token, `/--` and `/-!` are followed by whitespace — including `--` line comments and plain block
  // comments — before the comment body. Verified on 2026-11-01: `/-- -- -/` and `/-! -- -/` -> "unterminated
  // comment"; `/-- a -- b -/` is fine; findDocString? gives "real doc " for `/-- -- note⏎real doc -/`, "text " for
  // `/-- /- c -/ text -/`, "y " for `/---- x⏎y -/`, "z " for `/--⏎-- on its own line⏎z -/`, "\\-- escaped " for
  // `/-- \-- escaped -/`.
  const body = (text: string) => {
    const c = lexLean(text).comments[0];
    return c === undefined ? undefined : text.slice(c.body.start, c.body.end);
  };
  it('a line comment right after the opener eats the closer on its line', () => {
    for (const text of ['/-- -- -/\ndef a : Nat := 1\n', '/-! -- -/\ndef a : Nat := 1\n', '/-- --x -/\ndef d : Nat := 1\n']) {
      expect(comments(lexLean(text))).toEqual([[text.startsWith('/-!') ? 'moddoc' : 'doc', 0, text.length, 'unterminated']]);
    }
    expect(comments(lexLean('/-- a -- b -/\ndef c : Nat := 1\n'))).toEqual([['doc', 0, 13]]);
  });
  it('the body starts after leading whitespace and comments, as Lean reads the docstring', () => {
    expect(body('/-- -- note\nreal doc -/')).toBe('real doc ');
    expect(body('/-- /- c -/ text -/')).toBe('text ');
    expect(body('/---- x\ny -/')).toBe('y ');
    expect(body('/--\n-- on its own line\nz -/')).toBe('z ');
    expect(body('/-- \\-- escaped -/')).toBe('\\-- escaped ');
    expect(lexLean('/-- /- never closed -/').comments.map((c) => c.unterminated)).toEqual([true]);
  });
});
