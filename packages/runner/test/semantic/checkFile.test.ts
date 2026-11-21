/** The check-file generator and the parser of its `lean --json` output, on recorded Lean 4.35 runs. */
import { describe, expect, it } from 'vitest';

import { parseLeanJsonMessages } from '../../src/lean/footprint.js';
import {
  afterFirstColon,
  afterLastColon,
  generateCheckFile,
  parseCheckOutput,
  parsePrintMessage,
  parseValueProbe,
  toDeclFacts,
  TYPE_PROBE_KEY,
  VALUE_PROBE_KEY,
  valueProbeLines,
  type ProbeResult,
} from '../../src/semantic/index.js';
import { recorded } from './helpers.js';

const IMPORTS = ['Model.Spyro.Vocabulary', 'Model.Spyro.Main', 'Model'];
const SPYRO_DECLS = [
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
  'Spyro.cynder_dark_past',
  'Spyro.cynder_dark_past.holds',
  'Spyro.new_spyro_pg',
  'Spyro.new_spyro_pg.holds',
  'Spyro.cynder_not_good',
  'Spyro.nonexistent',
];
const EXTRAS_DECLS = [
  'Spyro.cynder_not_good.holds',
  'Spyro.d1.holds',
  'Spyro.d3.holds',
  'Spyro.d0.holds',
  'Spyro.g2.holds',
  'Spyro.withSorry',
  'Spyro.hidden',
  'Spyro.c2',
  'Spyro.P0',
  'Spyro.f',
  'Spyro.darkAndPG',
  'Spyro.uses_def',
  'Spyro.Rec',
  'Spyro.Rec.past',
  'Spyro.instInhabitedRec',
  'Spyro.pg_no_dark_past',
];

function results(lean: string, jsonl: string, decls: string[]): Map<string, ProbeResult> {
  const check = generateCheckFile(IMPORTS, decls);
  expect(check.source).toBe(recorded(lean)); // the recordings were made from exactly this shape
  const out = parseCheckOutput(check, parseLeanJsonMessages(recorded(jsonl)));
  expect(out.headerErrors).toEqual([]);
  return out.results;
}

describe('generateCheckFile', () => {
  it('writes imports, options and four probes per declaration, escaping names', () => {
    const check = generateCheckFile(['Model'], ['A.b', 'end', 'A.b', 'bad name']);
    expect(check.source).toBe(
      [
        'import Model',
        'set_option pp.fullNames true',
        'set_option pp.proofs false',
        '#check @A.b',
        '#print A.b',
        '#print axioms A.b',
        '#check type_of% @A.b',
        '#check @«end»',
        '#print «end»',
        '#print axioms «end»',
        '#check type_of% @«end»',
        '',
      ].join('\n'),
    );
    expect(check.headerLines).toBe(3);
    expect(check.probed).toEqual(['A.b', 'end']);
    expect([...check.unwritable.keys()]).toEqual(['bad name']);
    expect(check.probeAt.get(4)).toEqual({ decl: 'A.b', probe: 'check' });
    expect(check.probeAt.get(11)).toEqual({ decl: 'end', probe: 'sort' });
    expect(() => generateCheckFile([], ['A.b'])).toThrow(TypeError);
    expect(() => generateCheckFile(['Not A Module'], ['A.b'])).toThrow(TypeError);
  });
});

describe('parseCheckOutput (recorded runs)', () => {
  it('reads types, kinds, attributes, values, sorts and axioms of the Spyro declarations', () => {
    const res = results('check-spyro.lean', 'check-spyro.jsonl', SPYRO_DECLS);
    expect(res.get('Spyro.HasDarkPast')).toEqual({
      type: 'Spyro.Character → Prop',
      printedKeyword: 'axiom',
      kind: 'axiom',
      attributes: [],
      axioms: ['Spyro.Character', 'Spyro.HasDarkPast'],
      usesSorry: false,
      typeSort: 'Type',
      problems: [],
    });
    expect(res.get('Spyro.Character')).toMatchObject({ type: 'Type', kind: 'axiom', typeSort: 'Type 1' });
    expect(res.get('Spyro.Character.exists')).toMatchObject({ type: 'Nonempty Spyro.Character', kind: 'axiom', typeSort: 'Prop' });
    expect(res.get('Spyro.cynder')).toMatchObject({ type: 'Spyro.Character', kind: 'opaque', typeSort: 'Type', axioms: ['Classical.choice', 'Spyro.Character', 'Spyro.Character.exists'] });
    // A Prop instance prints as a theorem (the refresh turns it into `instance` from the source keyword).
    expect(res.get('Spyro.instNonemptyCharacter')).toMatchObject({ printedKeyword: 'theorem', kind: 'theorem', value: 'Spyro.Character.exists' });
    expect(res.get('Spyro.cynder_dark_past')).toMatchObject({
      type: 'Prop',
      kind: 'def',
      attributes: ['reducible'],
      value: 'Spyro.HasDarkPast Spyro.cynder',
      typeSort: 'Type',
      axioms: ['Classical.choice', 'Spyro.Character', 'Spyro.HasDarkPast', 'Spyro.Character.exists'],
    });
    expect(res.get('Spyro.cynder_dark_past.holds')).toMatchObject({
      type: 'Spyro.cynder_dark_past',
      kind: 'axiom',
      typeSort: 'Prop',
      axioms: ['Classical.choice', 'Spyro.Character', 'Spyro.HasDarkPast', 'Spyro.Character.exists', 'Spyro.cynder_dark_past.holds'],
    });
    expect(res.get('Spyro.cynder_not_good')).toMatchObject({ value: '¬Spyro.GoodAddition Spyro.cynder Spyro.newSpyro' });
    const missing = res.get('Spyro.nonexistent');
    expect(missing?.error).toBe('Unknown identifier `Spyro.nonexistent`');
    expect(missing?.sortError).toBe('Unknown identifier `Spyro.nonexistent`');
    expect(missing?.typeSort).toBeUndefined(); // the `?m.1 : Sort ?u.1` info on the erroring line is ignored
    expect([...res.values()].every((r) => r.problems.length === 0)).toBe(true);
  });

  it('reads the extras: wrapped types, theorems, sorry, structures, fields and data instances', () => {
    const res = results('check-extras.lean', 'check-extras.jsonl', EXTRAS_DECLS);
    expect(res.get('Spyro.d1.holds')).toMatchObject({ type: 'Spyro.cynder_not_good → Spyro.d1', kind: 'theorem', value: '⋯', typeSort: 'Prop' });
    expect(res.get('Spyro.d3.holds')?.type).toBe(
      'Spyro.a_statement_with_a_rather_long_name_so_that_types_wrap → Spyro.another_statement_with_a_long_name_so_types_wrap_too → Spyro.d3',
    );
    expect(res.get('Spyro.g2.holds')?.axioms).not.toContain('Spyro.d0.holds');
    expect(res.get('Spyro.withSorry')).toMatchObject({ usesSorry: true });
    expect(res.get('Spyro.withSorry')?.axioms?.[0]).toBe('sorryAx');
    expect(res.get('Spyro.hidden')).toMatchObject({ kind: 'axiom', typeSort: 'Prop', type: '∀ (c : Spyro.Character), Spyro.HasDarkPast c' });
    expect(res.get('Spyro.c2')).toMatchObject({ kind: 'axiom', typeSort: 'Type' });
    expect(res.get('Spyro.P0')).toMatchObject({ kind: 'axiom', type: 'Prop', typeSort: 'Type' });
    expect(res.get('Spyro.f')).toMatchObject({ kind: 'axiom', type: 'Spyro.Character → Spyro.Game', typeSort: 'Type' });
    expect(res.get('Spyro.darkAndPG')).toMatchObject({ kind: 'def', attributes: [], value: 'fun c g => Spyro.HasDarkPast c ∧ Spyro.IsPG g' });
    expect(res.get('Spyro.uses_def')).toMatchObject({ kind: 'def', attributes: ['reducible'], value: 'Spyro.darkAndPG Spyro.cynder Spyro.newSpyro' });
    expect(res.get('Spyro.Rec')).toMatchObject({ kind: 'structure', type: 'Type', typeSort: 'Type 1', axioms: [] });
    expect(res.get('Spyro.Rec')?.value).toBeUndefined();
    expect(res.get('Spyro.Rec.past')).toMatchObject({ kind: 'def', attributes: ['reducible'], type: 'Spyro.Rec → Prop' });
    expect(res.get('Spyro.instInhabitedRec')).toMatchObject({ kind: 'def', attributes: ['instance_reducible'], value: '{ default := { past := True } }' });
    expect(res.get('Spyro.pg_no_dark_past')?.value).toBe(
      '∀ (g : Spyro.Game) (c : Spyro.Character), Spyro.IsPG g → Spyro.HasDarkPast c → ¬Spyro.GoodAddition c g',
    );
  });

  it('attributes import failures to the header and reports silent probes as problems', () => {
    const check = generateCheckFile(['Nope'], ['A.b']);
    const header = parseCheckOutput(check, parseLeanJsonMessages('{"severity":"error","data":"unknown module prefix \'Nope\'","pos":{"line":1,"column":0}}'));
    expect(header.headerErrors).toEqual(["1:0: unknown module prefix 'Nope'"]);
    expect(header.results.get('A.b')?.problems).toEqual([]); // not blamed on the declaration
    const silent = parseCheckOutput(check, []);
    expect(silent.results.get('A.b')?.problems).toHaveLength(4);
    const odd = parseCheckOutput(check, parseLeanJsonMessages('{"severity":"information","data":"something else","pos":{"line":5,"column":0}}'));
    expect(odd.results.get('A.b')?.problems[1]).toMatch(/^unreadable #print output for A\.b/u);
  });
});

/**
 * Slice 1d (spec v4.1 B.2): the value probe's line, recorded on 2026-11-19 from Lean 4.35 on a scratch copy of the
 * Spyro fixture, when the probe was still the check file's `#eval` (line 76): a line from before 2b3a, without the type
 * key, as old recordings hold.
 */
const SPYRO_VALUE_LINE =
  '{"caption":"","data":"{\\"telelean-value-consts\\":[[],[],[],[\\"Spyro.Character.exists\\"],[],[\\"Spyro.Game.exists\\"],[],[],[],[\\"Spyro.Character\\",\\"Spyro.instNonemptyCharacter\\"],[\\"Spyro.Game\\",\\"Spyro.instNonemptyGame\\"],[\\"Spyro.HasDarkPast\\",\\"Spyro.cynder\\"],[],[\\"Spyro.IsPG\\",\\"Spyro.newSpyro\\"],[],[\\"Spyro.GoodAddition\\",\\"Spyro.cynder\\",\\"Spyro.newSpyro\\"],null]}\\n","endPos":{"column":5,"line":76},"fileName":"<stdin>","isSilent":false,"keepFullRange":false,"kind":"[anonymous]","pos":{"column":0,"line":76},"severity":"information"}';

describe('the check file without the probe (slice 2b3a, D2-75)', () => {
  it('has no #eval and imports only the model\'s modules: the recorded Spyro check file exactly', () => {
    const check = generateCheckFile(IMPORTS, SPYRO_DECLS);
    expect(check.source).toBe(recorded('check-spyro.lean'));
    expect(check.source).not.toContain('#eval');
    expect(check.source.split('\n').filter((l) => l.startsWith('import '))).toEqual(IMPORTS.map((m) => `import ${m}`));
    expect(check.headerLines).toBe(IMPORTS.length + 2);
    // The value probe's old shape is gone from it (its keys never appear).
    expect(check.source).not.toContain(VALUE_PROBE_KEY);
    expect(Object.keys(check).sort()).toEqual(['headerLines', 'probeAt', 'probed', 'source', 'unwritable']);
    // A probe line in the output is no longer read: an information message off every probe line is ignored.
    const out = parseCheckOutput(check, parseLeanJsonMessages([recorded('check-spyro.jsonl'), SPYRO_VALUE_LINE].join('\n')));
    expect(out.headerErrors).toEqual([]);
    expect(Object.keys(out).sort()).toEqual(['headerErrors', 'results']);
    expect([...out.results.values()].every((r) => !('valueConsts' in r))).toBe(true);
  });
});

describe('valueProbeLines: the value walk and the type walk, in-file and isolated (slices 1d, 1e, 2b3a)', () => {
  it('the isolated form loads the modules with importModules (4.35\'s defaults written out) and walks that environment; the in-file form reads its own', () => {
    const isolated = valueProbeLines(SPYRO_DECLS, 'Model', { modules: IMPORTS });
    expect(isolated[0]).toBe('#eval show IO Unit from do');
    expect(isolated[1]).toContain(JSON.stringify(IMPORTS.join(' ')));
    expect(isolated[2]).toBe('  let env ← Lean.importModules mods {} (loadExts := false) (level := .private)');
    expect(isolated.join('\n')).not.toContain('Lean.getEnv');
    const inFile = valueProbeLines(SPYRO_DECLS, 'Model');
    expect(inFile.slice(0, 2)).toEqual(['#eval show Lean.CoreM Unit from do', '  let env ← Lean.getEnv']);
    expect(inFile.join('\n')).not.toContain('importModules');
    // The walk is the same text after the environment: the names as one string literal, then both walks.
    expect(isolated.slice(3)).toEqual(inFile.slice(2));
    expect(inFile[2]).toContain(JSON.stringify(SPYRO_DECLS.join(' ')));
    const walk = inFile.join('\n');
    expect(walk).toContain('  let typeOf (ci : Lean.ConstantInfo) : Array Lean.Name :=');
    expect(walk).toContain('    | .inductInfo v => v.ctors.foldl (fun acc c => match env.find? c with');
    // The value walk follows an unprobed library constant's value (1d); the type walk its type and value (2b3a).
    expect(walk).toContain('      values := values.push (walk (valueOf ci) valueOf)');
    expect(walk).toContain('      types := types.push (walk (typeOf ci) (fun cj => typeOf cj ++ valueOf cj))');
    expect(inFile.at(-1)).toBe(`  IO.println ("{\\"${VALUE_PROBE_KEY}\\":[" ++ ",".intercalate values.toList ++ "],\\"${TYPE_PROBE_KEY}\\":[" ++ ",".intercalate types.toList ++ "]}")`);
    // followMain: the ghost check's own declarations are followed; the isolated environment has none of its own.
    expect(valueProbeLines(['A.b'], 'Model', { followMain: true })).toContain('    | none => true');
    expect(inFile).toContain('    | none => false');
    expect(isolated).toContain('    | none => false');
    // Single and many names: the literal is the names joined by spaces, in order (no name is refused, below).
    expect(valueProbeLines(['A.b'], 'Model', { modules: ['Model'] })[3]).toContain('(("A.b").splitOn " ")');
    expect(valueProbeLines(['A.b', 'C.d', 'E'], 'Model')[2]).toContain('(("A.b C.d E").splitOn " ")');
  });

  it('refuses what it cannot pass: no name, a name with whitespace or guillemets, a module that is not plain, no module, followMain with modules', () => {
    // No name (fixer 2b3a r1, C-V2B3A-C4): Lean splits `""` into one empty name, so the line would list one entry (null)
    // for no declaration, in either form.
    expect(() => valueProbeLines([], 'Model', { modules: ['Model'] })).toThrow(new TypeError('the value probe needs at least one name'));
    expect(() => valueProbeLines([], 'Model')).toThrow(TypeError);
    expect(() => valueProbeLines([], 'Model', { followMain: true })).toThrow(TypeError);
    expect(() => valueProbeLines(['A.b c'], 'Model')).toThrow(TypeError);
    expect(() => valueProbeLines(['A.«b»'], 'Model', { modules: ['Model'] })).toThrow(TypeError);
    expect(() => valueProbeLines(['A.b'], 'Not A Module')).toThrow(TypeError);
    expect(() => valueProbeLines(['A.b'], 'Model', { modules: ['Not A Module'] })).toThrow(TypeError);
    expect(() => valueProbeLines(['A.b'], 'Model', { modules: [] })).toThrow(TypeError);
    expect(() => valueProbeLines(['A.b'], 'Model', { modules: ['Model'], followMain: true })).toThrow(TypeError);
  });
});

describe('parseValueProbe: both keys, and old lines without the type key (slice 2b3a)', () => {
  it('reads the recorded 1d line (no type key: no typeConsts), the constants of each value, none for a name Lean does not know', () => {
    const line = parseLeanJsonMessages(SPYRO_VALUE_LINE)[0]?.data ?? '';
    const parsed = parseValueProbe(line, SPYRO_DECLS);
    if (typeof parsed === 'string') throw new Error(parsed);
    expect(parsed.typeConsts).toBeUndefined();
    expect(parsed.valueConsts.get('Spyro.Character')).toEqual([]);
    expect(parsed.valueConsts.get('Spyro.cynder')).toEqual(['Spyro.Character', 'Spyro.instNonemptyCharacter']);
    expect(parsed.valueConsts.get('Spyro.cynder_not_good')).toEqual(['Spyro.GoodAddition', 'Spyro.cynder', 'Spyro.newSpyro']);
    expect(parsed.valueConsts.has('Spyro.nonexistent')).toBe(false);
    const module = { name: 'Model.Spyro.Main', file: 'Model/Spyro/Main.lean' };
    const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } };
    expect(toDeclFacts(module, { name: 'Spyro.cynder', range, selectionRange: range, refs: [] }, undefined, { valueConsts: parsed.valueConsts.get('Spyro.cynder') })).toMatchObject({
      valueConsts: ['Spyro.Character', 'Spyro.instNonemptyCharacter'],
    });
  });

  it('reads both keys, each list deduplicated; empty, single and many declarations', () => {
    const both = parseValueProbe(`{"${VALUE_PROBE_KEY}":[["X.y","X.y"],null,[]],"${TYPE_PROBE_KEY}":[["X.t"],null,["X.u","X.u","X.v"]]}`, ['A.b', 'A.c', 'A.d']);
    expect(both).toEqual({
      valueConsts: new Map([
        ['A.b', ['X.y']],
        ['A.d', []],
      ]),
      typeConsts: new Map([
        ['A.b', ['X.t']],
        ['A.d', ['X.u', 'X.v']],
      ]),
    });
    expect(parseValueProbe(`{"${VALUE_PROBE_KEY}":[],"${TYPE_PROBE_KEY}":[]}`, [])).toEqual({ valueConsts: new Map(), typeConsts: new Map() });
    expect(parseValueProbe(`{"${VALUE_PROBE_KEY}":[["Z.z"]],"${TYPE_PROBE_KEY}":[[]]}`, ['A.b'])).toEqual({ valueConsts: new Map([['A.b', ['Z.z']]]), typeConsts: new Map([['A.b', []]]) });
  });

  it('every deviation is a problem, the type key\'s too: not JSON, no value key, the wrong number of entries, an entry that is not a list of names', () => {
    expect(parseValueProbe('not json', ['A.b'])).toMatch(/^unreadable value probe output/u);
    expect(parseValueProbe('[1]', ['A.b'])).toBe('the value probe listed no entries for 1 declarations');
    expect(parseValueProbe(`{"${TYPE_PROBE_KEY}":[[]]}`, ['A.b'])).toBe('the value probe listed no entries for 1 declarations');
    expect(parseValueProbe(`{"${VALUE_PROBE_KEY}":[[]]}`, ['A.b', 'A.c'])).toBe('the value probe listed 1 entries for 2 declarations');
    expect(parseValueProbe(`{"${VALUE_PROBE_KEY}":[[1]]}`, ['A.b'])).toBe('unreadable value probe entry for A.b');
    expect(parseValueProbe(`{"${VALUE_PROBE_KEY}":[[]],"${TYPE_PROBE_KEY}":[[],[]]}`, ['A.b'])).toBe('the type probe listed 2 entries for 1 declarations');
    expect(parseValueProbe(`{"${VALUE_PROBE_KEY}":[[]],"${TYPE_PROBE_KEY}":[{"x":1}]}`, ['A.b'])).toBe('unreadable type probe entry for A.b');
    expect(parseValueProbe(`{"${VALUE_PROBE_KEY}":[[]],"${TYPE_PROBE_KEY}":null}`, ['A.b'])).toBe('the type probe listed no entries for 1 declarations');
  });
});

describe('output helpers', () => {
  it('splits `N : T` at the first colon outside guillemets and `T : S` at the last', () => {
    expect(afterFirstColon('Spyro.«odd : name» : Prop')).toBe('Prop');
    expect(afterFirstColon('Spyro.d1.holds : Spyro.cynder_not_good → Spyro.d1')).toBe('Spyro.cynder_not_good → Spyro.d1');
    expect(afterFirstColon('no colon')).toBeUndefined();
    expect(afterLastColon('∀ (c : Spyro.Character), Spyro.HasDarkPast c : Prop')).toBe('Prop');
  });

  it('reads #print headers with attributes, modifiers and other kinds', () => {
    expect(parsePrintMessage('@[reducible, defeq] unsafe private protected def X.y : Nat :=\n1')).toEqual({ keyword: 'def', attributes: ['reducible', 'defeq'], value: '1' });
    expect(parsePrintMessage('constructor Spyro.Rec.mk : Prop → Spyro.Rec')).toEqual({ keyword: 'constructor', attributes: [] });
    expect(parsePrintMessage('Quotient primitive Quot.mk.{u} : …')).toEqual({ keyword: 'Quotient primitive', attributes: [] });
    expect(parsePrintMessage('theorem t : A →\n  B :=\n⋯')).toEqual({ keyword: 'theorem', attributes: [], value: '⋯' });
    expect(parsePrintMessage('Unknown constant `x`')).toBeUndefined();
  });

  it('builds DeclFacts: instance from the source keyword, values only for defs and instances, sort errors only for axioms', () => {
    const module = { name: 'M', file: 'M.lean' };
    const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } };
    const draft = { name: 'M.i', range, selectionRange: range, refs: [], keyword: 'instance' };
    const asTheorem: ProbeResult = { printedKeyword: 'theorem', kind: 'theorem', value: 'M.c', attributes: [], problems: [] };
    expect(toDeclFacts(module, draft, asTheorem)).toMatchObject({ kind: 'instance', value: 'M.c' });
    expect(toDeclFacts(module, { ...draft, keyword: 'theorem' }, { ...asTheorem, value: '⋯' })).not.toHaveProperty('value');
    expect(toDeclFacts(module, { ...draft, keyword: 'theorem' }, asTheorem)).not.toHaveProperty('value');
    const axiomWithSortError: ProbeResult = { printedKeyword: 'axiom', kind: 'axiom', sortError: 'boom', problems: [] };
    expect(toDeclFacts(module, { ...draft, keyword: 'axiom' }, axiomWithSortError).error).toBe('boom');
    expect(toDeclFacts(module, { ...draft, keyword: 'def' }, { ...axiomWithSortError, printedKeyword: 'def', kind: 'def' })).not.toHaveProperty('error');
    expect(toDeclFacts(module, draft)).toEqual({ name: 'M.i', module: 'M', file: 'M.lean', range, selectionRange: range, refs: [] });
  });
});
