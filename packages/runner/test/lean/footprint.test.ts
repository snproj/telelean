/** Footprints via `#print axioms` (gate step G3). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  computeFootprints,
  footprintsFromMessages,
  generateFootprintCheck,
  parseAxiomsMessage,
  parseLeanJsonMessages,
} from '../../src/lean/footprint.js';
import { runLean } from '../../src/lean/runLean.js';
import { resolveToolchain, toolchainExe } from '../../src/lean/toolchain.js';
import { cleanupTempRoot, knownProjectsLines, makeTempRoot, MiB, spyroShadow, TEST_RUN_ID } from './helpers.js';

const TARGET = 'Spyro.cynder_not_good.holds';
const EXPECTED_TARGET_FOOTPRINT = [
  'Classical.choice',
  'Spyro.Character',
  'Spyro.Game',
  'Spyro.GoodAddition',
  'Spyro.HasDarkPast',
  'Spyro.IsPG',
  'Spyro.Character.exists',
  'Spyro.Game.exists',
  'Spyro.cynder_dark_past.holds',
  'Spyro.new_spyro_pg.holds',
  'Spyro.pg_no_dark_past.holds',
];

// Verbatim `lean --stdin --json` lines captured from the toolchain (v4.35.0) during this spike.
const CAPTURED = [
  String.raw`{"caption":"","data":"'Spyro.cynder_dark_past.holds' depends on axioms: [Classical.choice,\n Spyro.Character,\n Spyro.HasDarkPast,\n Spyro.Character.exists,\n Spyro.cynder_dark_past.holds]","endPos":{"column":6,"line":2},"fileName":"<stdin>","isSilent":false,"keepFullRange":false,"kind":"[anonymous]","pos":{"column":0,"line":2},"severity":"information"}`,
  String.raw`{"caption":"","data":"Unknown constant ` + '`Spyro.nonexistent`' + String.raw`","endPos":{"column":31,"line":3},"fileName":"<stdin>","isSilent":false,"keepFullRange":false,"kind":"lean.unknownIdentifier._namedError","pos":{"column":14,"line":3},"severity":"error"}`,
  String.raw`{"caption":"","data":"'Spyro.Character.exists' depends on axioms: [Spyro.Character, Spyro.Character.exists]","endPos":{"column":6,"line":4},"fileName":"<stdin>","isSilent":false,"keepFullRange":false,"kind":"[anonymous]","pos":{"column":0,"line":4},"severity":"information"}`,
].join('\n');

describe('footprint parsing', () => {
  it('generates one #print axioms line per declaration, after the imports', () => {
    const check = generateFootprintCheck(['Model'], ['A.b', 'end', 'A.b']);
    expect(check.source).toBe('import Model\n#print axioms A.b\n#print axioms «end»\n');
    expect([...check.lineOfDecl]).toEqual([['A.b', 2], ['end', 3]]);
    expect(() => generateFootprintCheck(['Model'], ['x\n#eval 1'])).toThrow(TypeError);
    expect(() => generateFootprintCheck([], ['x'])).toThrow(TypeError);
  });

  it('parses axiom lists, "does not depend on any axioms", and errors by line', () => {
    expect(parseAxiomsMessage("'Nat.add' does not depend on any axioms")).toEqual([]);
    expect(parseAxiomsMessage("'x' depends on axioms: [propext,\n sorryAx]")).toEqual(['propext', 'sorryAx']);
    expect(parseAxiomsMessage('declaration uses sorry')).toBeUndefined();

    const check = generateFootprintCheck(['Model'], ['Spyro.cynder_dark_past.holds', 'Spyro.nonexistent', 'Spyro.Character.exists', 'Spyro.silent']);
    const { footprints, headerErrors } = footprintsFromMessages(check, parseLeanJsonMessages(CAPTURED));
    expect(headerErrors).toEqual([]);
    expect(footprints.get('Spyro.cynder_dark_past.holds')).toEqual({
      decl: 'Spyro.cynder_dark_past.holds',
      ok: true,
      axioms: ['Classical.choice', 'Spyro.Character', 'Spyro.HasDarkPast', 'Spyro.Character.exists', 'Spyro.cynder_dark_past.holds'],
    });
    expect(footprints.get('Spyro.nonexistent')).toEqual({ decl: 'Spyro.nonexistent', ok: false, error: 'Unknown constant `Spyro.nonexistent`' });
    expect(footprints.get('Spyro.Character.exists')).toMatchObject({ ok: true, axioms: ['Spyro.Character', 'Spyro.Character.exists'] });
    expect(footprints.get('Spyro.silent')).toMatchObject({ ok: false, error: 'Lean printed no axioms for this declaration' });
  });

  it('attributes import errors to the header', () => {
    const check = generateFootprintCheck(['Nope'], ['A.b']);
    const msg = '{"severity":"error","data":"unknown module prefix \'Nope\'","pos":{"line":1,"column":0}}';
    const { footprints, headerErrors } = footprintsFromMessages(check, parseLeanJsonMessages(msg));
    expect(headerErrors).toEqual(["1:0: unknown module prefix 'Nope'"]);
    expect(footprints.get('A.b')).toMatchObject({ ok: false, error: 'not checked: the imports failed' });
  });
});

describe('computeFootprints (sandboxed)', () => {
  let tmp: string;
  let knownBefore: number | undefined;
  beforeAll(() => {
    tmp = makeTempRoot('footprint');
    knownBefore = knownProjectsLines();
  });
  afterAll(() => cleanupTempRoot(tmp));

  it('gives the normative proof exactly its eleven axioms', async () => {
    // The shadow after a run that formalised pg-no-dark-past (normative reading) and proved the goal.
    const shadow = await spyroShadow(tmp, 'proved', 'proved');
    const lake = toolchainExe(resolveToolchain(), 'lake');
    const build = await runLean({ shadowDir: shadow.dir, argv: [lake, 'build'], runId: TEST_RUN_ID });
    expect(build.status, build.stdout + build.stderr).toBe('ok');

    const result = await computeFootprints({
      shadowDir: shadow.dir,
      imports: ['Model'],
      decls: [TARGET, 'Spyro.cynder_dark_past.holds', 'Nat.add', 'Spyro.nonexistent'],
      run: { runId: TEST_RUN_ID },
    });
    console.log(
      `[footprints] status=${result.status} lean run ${result.run.durationMs} ms, peak ${((result.run.peakMemoryBytes ?? 0) / MiB).toFixed(1)} MiB\n` +
        [...result.footprints.values()].map((f) => `  ${f.decl}: ${f.ok ? `[${f.axioms.join(', ')}]` : `ERROR ${f.error}`}`).join('\n'),
    );
    expect(result.run.status).toBe('failed'); // lean exits 1 because of the deliberate unknown constant
    expect(result.status).toBe('lean-error');
    expect(result.headerErrors).toEqual([]);
    const target = result.footprints.get(TARGET);
    expect(target?.ok).toBe(true);
    expect(new Set(target?.ok ? target.axioms : [])).toEqual(new Set(EXPECTED_TARGET_FOOTPRINT));
    expect(target?.ok ? target.axioms.length : 0).toBe(EXPECTED_TARGET_FOOTPRINT.length);
    expect(result.footprints.get('Nat.add')).toEqual({ decl: 'Nat.add', ok: true, axioms: [] });
    expect(result.footprints.get('Spyro.nonexistent')).toMatchObject({ ok: false });

    const clean = await computeFootprints({ shadowDir: shadow.dir, imports: ['Model'], decls: [TARGET], run: { runId: TEST_RUN_ID } });
    expect(clean.status).toBe('ok');
    expect(clean.run.status).toBe('ok');
  });

  it('reports a module that was never built as a header error', async () => {
    const shadow = await spyroShadow(tmp, 'unbuilt', 'proved');
    const result = await computeFootprints({ shadowDir: shadow.dir, imports: ['Model'], decls: [TARGET], run: { runId: TEST_RUN_ID } });
    console.log(`[footprints, unbuilt] status=${result.status} header=${JSON.stringify(result.headerErrors)}`);
    expect(result.status).toBe('lean-error');
    expect(result.headerErrors.length).toBeGreaterThan(0);
    expect(result.footprints.get(TARGET)?.ok).toBe(false);
  });

  it('left ~/.elan/known-projects untouched', () => {
    expect(knownProjectsLines()).toBe(knownBefore);
  });
});

