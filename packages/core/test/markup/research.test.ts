/**
 * AT1.2 — the non-graph tests of the research prototype
 * (verbatim_prompt_log/bundle_1/subagent_reports/research_workflow/artifacts/r4-markup-lsp/proto/test_telelean_ref.py:
 * Lexing 5, Values 7, Binding 6) ported to `parseLeanFile`, under the 02/03 rule changes: `type:` is canonical and
 * `kind:` a silent alias (no TL018), there is no DEFINITION kind, a missing version marker means v1 (no TL016), and
 * `premises:` is allowed on any type (no TL012). The two Graph tests (duplicates, cycles, purity) belong to WP2.
 */
import { describe, expect, it } from 'vitest';
import { parseLeanFile, type ParsedFile } from '../../src/index.js';

/** The research helper: a block with `kind:` (the alias), a quoted sentence and a rationale. */
const B = (id: string, kind = 'ASSUMPTION', extra = '') => `/-\n@@ telelean v1\nid: ${id}\nkind: ${kind}\nnatural_name: "n ${id}"\nrationale: r\n${extra}-/\n`;

const parse = (text: string): ParsedFile => parseLeanFile('X.lean', text);
const codes = (file: ParsedFile) => file.diagnostics.map((d) => d.code);
const declOf = (file: ParsedFile, blockIndex: number) => {
  const index = file.blocks[blockIndex]?.binding.adjacentDecl;
  return index === undefined ? undefined : file.decls[index];
};

describe('AT1.2 research tests: Lexing', () => {
  it('comment markers inside strings, chars, raw strings and guillemets are ignored', () => {
    const src = 'def s := "/- not a comment"\ndef c := \'"\'\ndef r := r#"-/ and /-"#\n' + 'def «weird/-name» := 1\ndef h\' := 2\n' + B('a') + 'axiom a : True\n';
    const file = parse(src);
    expect(file.blocks.map((b) => b.id)).toEqual(['a']);
    expect(file.blocks[0]?.binding.statement).toBe('a');
  });

  it('nested comment and line comment', () => {
    const file = parse('/- outer /- inner -/ still -/\n-- /- line comment\n' + B('b') + 'axiom b : True\n');
    expect(file.blocks[0]?.binding.mode).toBe('adjacent');
  });

  it('unterminated block is reported (TL010)', () => {
    const file = parse('/-\n@@ telelean v1\nid: u\nkind: GOAL\nnatural_name: "x /- y"\n-/\n');
    expect(codes(file)).toContain('TL010');
  });

  it('an unterminated comment that is not a block is reported too (it hides the blocks after it)', () => {
    const file = parse('/- a stray opener\n' + B('z'));
    expect(file.blocks).toEqual([]);
    expect(file.diagnostics.map((d) => [d.code, d.span.start, d.span.end])).toEqual([['TL010', 0, 2]]);
  });

  it('CRLF', () => {
    const file = parse(B('c').replaceAll('\n', '\r\n') + 'axiom c : True\r\n');
    expect(file.eol).toBe('\r\n');
    // `kind: ASSUMPTION`: the old kind, read as an alias of AXIOM (spec v4).
    expect(file.blocks[0]?.fields.type).toBe('AXIOM');
    expect(file.blocks[0]?.fields.naturalName).toBe('n c');
    expect(file.blocks[0]?.binding.statement).toBe('c');
  });

  it('a block in a docstring is flagged (TL009), not parsed', () => {
    const file = parse('/--\n@@ telelean v1\nid: d\n-/\ndef d := 1\n');
    expect(file.blocks).toEqual([]);
    expect(codes(file)).toContain('TL009');
  });
});

describe('AT1.2 research tests: Values', () => {
  it('JSON string escapes for comment delimiters', () => {
    const file = parse('/-\n@@ telelean v1\nid: e\nkind: GOAL\nnatural_name: "A -\\/ B and C \\u002f- D"\n-/\n');
    expect(file.blocks[0]?.fields.naturalName).toBe('A -/ B and C /- D');
  });

  it('raw text values with colons, hashes and NO', () => {
    const file = parse('/-\n@@ telelean v1\nid: f\nkind: ASSUMPTION\nnatural_name: Cynder: the #1 dragon\n' + 'rationale: NO\n-/\n');
    expect(file.blocks[0]?.fields.naturalName).toBe('Cynder: the #1 dragon');
    expect(file.blocks[0]?.fields.rationale).toBe('NO');
  });

  it('lists: brackets and repetition', () => {
    const file = parse('/-\n@@ telelean v1\nid: g\nkind: GOAL\nnatural_name: x\npremises: [a, b]\n' + 'tags: t1, t2\ntags: t3\n-/\n');
    expect(file.blocks[0]?.fields.premises).toEqual(['a', 'b']);
    expect(file.blocks[0]?.fields.tags).toEqual(['t1', 't2', 't3']);
  });

  it('the body is dedented and its Markdown escapes are kept', () => {
    const file = parse('/-\n@@ telelean v1\nid: h\nkind: GOAL\nnatural_name: x\n---\n  Para one\n' + '  uses -\\/ escape\n-/\n');
    expect(file.blocks[0]?.body).toBe('Para one\nuses -\\/ escape');
  });

  it('alias, lower case, unknown field, extension, missing version (02/03: no TL016, no TL018)', () => {
    const file = parse('/-\n@@ telelean\nid: i\ntype: goal\nnatural_name: x\nfoo: 1\nmytool.prio: 3\n-/\n');
    const found = codes(file);
    // `goal` is the old GOAL (an alias of PROPOSITION, spec v4), in lower case: TL019 says so.
    expect(file.blocks[0]?.fields.type).toBe('PROPOSITION');
    expect(file.blocks[0]?.version).toBe(1);
    expect(file.blocks[0]?.extensions).toEqual({ foo: ['1'], 'mytool.prio': ['3'] });
    expect(found).toContain('TL002');
    expect(found).toContain('TL019');
    expect(found).not.toContain('TL016');
    expect(found).not.toContain('TL018');
    // `kind:` is a silent alias of `type:`, normalised in the field lines.
    const aliased = parse('/-\n@@ telelean\nid: i\nkind: goal\nnatural_name: x\n-/\n');
    expect(aliased.blocks[0]?.fields.type).toBe('PROPOSITION');
    expect(aliased.blocks[0]?.lines.find((l) => l.writtenKey === 'kind')?.key).toBe('type');
    expect(codes(aliased)).toEqual(['TL019']);
  });

  it('a newer version is a warning (TL008), not a failure', () => {
    const file = parse('/-\n@@ telelean v2\nid: j\nkind: GOAL\nnatural_name: x\nnewfield: y\n-/\n');
    expect(file.blocks[0]?.version).toBe(2);
    expect(file.blocks[0]?.fields.naturalName).toBe('x');
    expect(codes(file)).toContain('TL008');
  });

  it('missing required fields and bad values (TL003, TL004; no DEFINITION kind)', () => {
    // (AXIOM is one of spec v4's two kinds; LEMMA is no kind.)
    const file = parse('/-\n@@ telelean v1\nid: Bad_ID\nkind: LEMMA\n-/\n');
    const found = codes(file);
    expect(found.filter((c) => c === 'TL004').length).toBeGreaterThanOrEqual(2);
    expect(found).toContain('TL003');
    expect(codes(parse('/-\n@@ telelean v1\nid: k\ntype: DEFINITION\nnatural_name: x\n-/\n'))).toContain('TL004');
  });

  it('premises are allowed on every type (no TL012)', () => {
    const file = parse(B('a1', 'ASSUMPTION', 'premises: b1\n'));
    expect(file.blocks[0]?.fields.premises).toEqual(['b1']);
    expect(codes(file)).toEqual([]);
  });
});

describe('AT1.2 research tests: Binding', () => {
  it('a blank line makes the node code-less, with a TL013 hint', () => {
    const file = parse(B('k') + '\naxiom k : True\n');
    expect(file.blocks[0]?.binding.mode).toBe('none');
    expect(file.blocks[0]?.binding.gapDecl).toBe(0);
    expect(codes(file)).toContain('TL013');
  });

  it('the next block stops binding', () => {
    const file = parse(B('l1') + B('l2') + 'axiom l2 : True\n');
    expect(file.blocks[0]?.binding.mode).toBe('none');
    expect(file.blocks[1]?.binding.statement).toBe('l2');
    expect(codes(file)).not.toContain('TL013');
  });

  it('docstring, attributes, modifiers and an intervening comment', () => {
    const file = parse(B('m') + '-- a note\n/-- doc -/\n@[simp, reducible]\nprivate noncomputable def m : Nat := 1\n');
    expect(file.blocks[0]?.binding.statement).toBe('m');
    const decl = declOf(file, 0);
    expect(decl?.keyword).toBe('def');
    expect(decl?.docstring).toBe('doc');
    expect(decl?.attributes).toEqual(['@[simp, reducible]']);
    expect(decl?.modifiers).toEqual(['private', 'noncomputable']);
  });

  it('namespaces qualify names', () => {
    const file = parse('namespace Spyro.Lore\nsection\n' + B('n') + 'theorem cyn : True := trivial\nend\nend Spyro.Lore\n');
    expect(file.blocks[0]?.binding.statement).toBe('Spyro.Lore.cyn');
    expect(declOf(file, 0)?.namespace).toEqual(['Spyro', 'Lore']);
  });

  it('structure, class inductive, instance (named, anonymous) and example', () => {
    const src =
      B('o1') +
      'structure Character where\n  name : String\n\n' +
      B('o2') +
      'class inductive Foo\n\n' +
      B('o3') +
      'instance (priority := low) instFoo : Inhabited Nat := ⟨0⟩\n\n' +
      B('o4') +
      'instance : Inhabited Nat := ⟨0⟩\n\n' +
      B('o5', 'GOAL') +
      'example : True := trivial\n';
    const file = parse(src);
    expect(file.blocks.map((_, i) => declOf(file, i)?.keyword)).toEqual(['structure', 'class inductive', 'instance', 'instance', 'example']);
    expect(file.blocks.map((_, i) => declOf(file, i)?.name)).toEqual(['Character', 'Foo', 'instFoo', undefined, undefined]);
    // A declaration without a name (anonymous instance) or an example cannot be bound: code-less with TL014.
    expect(file.blocks.map((b) => b.binding.mode)).toEqual(['adjacent', 'adjacent', 'adjacent', 'none', 'none']);
    expect(file.diagnostics.filter((d) => d.code === 'TL014').map((d) => d.nodeId)).toEqual(['o4', 'o5']);
  });

  it('an explicit lean: field overrides adjacency (pinned)', () => {
    const file = parse(B('p', 'ASSUMPTION', 'lean: Character, Character.isPG\n') + '\n-- later\n');
    expect(file.blocks[0]?.binding.mode).toBe('pinned');
    expect(file.blocks[0]?.binding.pinned).toEqual(['Character', 'Character.isPG']);
    expect(file.blocks[0]?.binding.statement).toBe('Character');
  });
});
