/**
 * Slice 2b3a (docs/slice2-plan.md 2.1, 6.1; D2-75, AP-30) with Lean 4.35, sandboxed and memory-capped, on scratch copies:
 * the isolated probe, its own Lean job right after the check file, that loads the model's built modules with
 * `Lean.importModules` when it runs.
 *
 *   - importModules works on the pinned toolchain, and the probe's value constants are 1d's, name for name;
 *     the recorded probe file and its output (probe-spyro.{lean,jsonl}; UPDATE_SEMANTIC_RECORDINGS=1 rewrites them);
 *   - isolation: a model's high-priority `ToString String` and `ForIn m Lean.Loop Unit` instances forge the in-file
 *     probe (the control: the ghost check's, D2-75's residual) but not the isolated one;
 *   - no `[init]` runs in the probe job: a model module's `@[init]` (and its hygienic spelling, AP30-1 r3) prints a
 *     forged probe line in the check job (the control), never in the probe job, and G0 refuses both in Claude's text;
 *   - the type walk: a class field type, inductive constructor types, an instance's class, a coercion in a statement;
 *   - fails closed: a cut, a failed and a killed probe job, a failed probe after a failed build, low memory before it;
 *   - the probe job's own rules in refresh (fixer 2b3a r1): its lowered cap, after the check's import errors, none when
 *     nothing was probed;
 *   - what it costs (logged: the check, the probe job and the refresh, and the probe's message per declaration).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { checkFileChanges, probeFailure, type DeclFacts, type LeanFacts } from '@telelean/core';

import { parseLeanJsonMessages } from '../../src/lean/footprint.js';
import { runLean, type RunLeanOptions, type RunLeanResult } from '../../src/lean/runLean.js';
import { resolveToolchain, toolchainExe } from '../../src/lean/toolchain.js';
import { generateCheckFile, generateProbeFile, parseValueProbe, readMemAvailableBytes, refreshLeanFacts, VALUE_PROBE_IMPORTS, VALUE_PROBE_KEY, valueProbeLines } from '../../src/semantic/index.js';
import { refresh, spawnMemoryMax } from '../../src/semantic/refresh.js';
import { cleanupTempRoot, MiB, makeTempRoot, RECORDED, SEMANTIC_RUN_ID, SPYRO, spyroCopy, unitsOfRun } from './helpers.js';

const IMPORTS = ['Model.Spyro.Vocabulary', 'Model.Spyro.Main', 'Model'];
const SPYRO_NAMES = [
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
];

/** 1d's value constants of the Spyro fixture (refresh.test.ts AT3.1 since slice 1d), name for name. */
const VALUE_CONSTS_1D: Readonly<Record<string, string[]>> = {
  'Spyro.Character': [],
  'Spyro.Game': [],
  'Spyro.Character.exists': [],
  'Spyro.instNonemptyCharacter': ['Spyro.Character.exists'],
  'Spyro.Game.exists': [],
  'Spyro.instNonemptyGame': ['Spyro.Game.exists'],
  'Spyro.HasDarkPast': [],
  'Spyro.IsPG': [],
  'Spyro.GoodAddition': [],
  'Spyro.cynder': ['Spyro.Character', 'Spyro.instNonemptyCharacter'],
  'Spyro.newSpyro': ['Spyro.Game', 'Spyro.instNonemptyGame'],
  'Spyro.cynder_dark_past': ['Spyro.HasDarkPast', 'Spyro.cynder'],
  'Spyro.cynder_dark_past.holds': [],
  'Spyro.new_spyro_pg': ['Spyro.IsPG', 'Spyro.newSpyro'],
  'Spyro.new_spyro_pg.holds': [],
  'Spyro.cynder_not_good': ['Spyro.GoodAddition', 'Spyro.cynder', 'Spyro.newSpyro'],
};
/** The type constants of the Spyro fixture (2b3a, D2-30). */
const TYPE_CONSTS: Readonly<Record<string, string[]>> = {
  'Spyro.Character': [],
  'Spyro.Game': [],
  'Spyro.Character.exists': ['Spyro.Character'],
  'Spyro.instNonemptyCharacter': ['Spyro.Character'],
  'Spyro.Game.exists': ['Spyro.Game'],
  'Spyro.instNonemptyGame': ['Spyro.Game'],
  'Spyro.HasDarkPast': ['Spyro.Character'],
  'Spyro.IsPG': ['Spyro.Game'],
  'Spyro.GoodAddition': ['Spyro.Character', 'Spyro.Game'],
  'Spyro.cynder': ['Spyro.Character'],
  'Spyro.newSpyro': ['Spyro.Game'],
  'Spyro.cynder_dark_past': [],
  'Spyro.cynder_dark_past.holds': ['Spyro.cynder_dark_past'],
  'Spyro.new_spyro_pg': [],
  'Spyro.new_spyro_pg.holds': ['Spyro.new_spyro_pg'],
  'Spyro.cynder_not_good': [],
};

type Job = { kind: 'build' | 'check' | 'probe'; options: RunLeanOptions; result: RunLeanResult };
const kindOf = (o: RunLeanOptions): Job['kind'] => (o.argv.includes('build') ? 'build' : (o.stdin ?? '').includes('Lean.importModules') ? 'probe' : 'check');
type FakeJob = (o: RunLeanOptions) => Promise<RunLeanResult>;
type SpyOptions = { readMemAvailable?: () => number | undefined; minAvailableBytes?: number };

/** A refresh whose Lean jobs are recorded, each kind's replaced by its fake when given (the others run for real). */
async function spiedJobs(root: string, fakes: { check?: FakeJob; probe?: FakeJob }, extra: SpyOptions = {}): Promise<{ facts: LeanFacts; jobs: Job[] }> {
  const jobs: Job[] = [];
  const facts = await refresh({ root, runId: SEMANTIC_RUN_ID, ...extra }, readMemAvailableBytes, {
    runLean: async (options) => {
      const kind = kindOf(options);
      const fake = kind === 'build' ? undefined : fakes[kind];
      const result = fake !== undefined ? await fake(options) : await runLean(options);
      jobs.push({ kind, options, result });
      return result;
    },
  });
  return { facts, jobs };
}

/** A refresh whose Lean jobs are recorded (and the probe job's replaced by `probe`, when given). */
async function spied(root: string, probe?: FakeJob, extra: SpyOptions = {}): Promise<{ facts: LeanFacts; jobs: Job[] }> {
  return spiedJobs(root, probe !== undefined ? { probe } : {}, extra);
}

const decl = (f: LeanFacts, name: string): DeclFacts => {
  const d = f.decls.find((x) => x.name === name);
  if (d === undefined) throw new Error(`no facts for ${name}`);
  return d;
};
const constsOf = (f: LeanFacts, names?: readonly string[]) =>
  Object.fromEntries(f.decls.filter((d) => names === undefined || names.includes(d.name)).map((d) => [d.name, { value: d.valueConsts, type: d.typeConsts }]));
const mib = (bytes: number | undefined): string => (bytes === undefined ? '?' : (bytes / MiB).toFixed(0));

/** `lake env lean --stdin --json` on `source` in `root` (sandboxed, as refresh runs it). */
async function leanStdin(root: string, source: string): Promise<RunLeanResult> {
  const toolchain = resolveToolchain();
  return runLean({ shadowDir: root, argv: [toolchainExe(toolchain, 'lake'), 'env', 'lean', '--stdin', '--json'], stdin: source, runId: SEMANTIC_RUN_ID, toolchain, memoryMax: '4G', timeoutMs: 120_000 });
}

/** The in-file probe (the ghost check's form, D2-75's residual) of `names` appended to a check file importing the model. */
function inFileProbe(names: readonly string[]): string {
  const check = generateCheckFile(IMPORTS, names);
  const lines = check.source.split('\n').slice(0, check.headerLines);
  const imports = lines.filter((l) => l.startsWith('import '));
  const options = lines.filter((l) => !l.startsWith('import '));
  return `${[...imports, ...VALUE_PROBE_IMPORTS.map((m) => `import ${m}`), ...options, ...valueProbeLines(names, 'Model')].join('\n')}\n`;
}

/** The value constants the in-file probe printed, by name. */
function inFileValues(result: RunLeanResult, names: readonly string[]): Record<string, string[]> {
  const line = parseLeanJsonMessages(result.stdout).find((m) => m.severity === 'information' && m.data.includes(VALUE_PROBE_KEY));
  if (line === undefined) throw new Error(`the in-file probe printed nothing: ${result.stdout.slice(0, 400)}`);
  const parsed = parseValueProbe(line.data, names);
  if (typeof parsed === 'string') throw new Error(parsed);
  return Object.fromEntries(parsed.valueConsts);
}

/** Main.lean of the probe-forge overlay without the forgery (the two instances at its end). */
function withoutForgery(main: string): string {
  const at = main.indexOf('-- The forgery');
  const end = main.lastIndexOf('end Spyro');
  if (at < 0 || end < at) throw new Error('the probe-forge overlay has no forgery marker');
  return `${main.slice(0, at)}${main.slice(end)}`;
}

describe('the isolated probe with Lean 4.35 (slice 2b3a, D2-75)', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = makeTempRoot('semantic-probe');
  });
  afterAll(() => cleanupTempRoot(tmp));

  it('importModules first: the probe job loads the Spyro fixture\'s built modules on the pinned toolchain, its value constants are 1d\'s name for name; the recorded probe file and output', async () => {
    const root = spyroCopy(tmp, 'spyro');
    const { facts: f, jobs } = await spied(root);
    expect(f.status, f.detail).toBe('ok');
    expect(f.detail).toBeUndefined();
    // Three Lean jobs: the build, the check file, the probe (in this order; no second check, AP-21's is gone).
    expect(jobs.map((j) => j.kind)).toEqual(['build', 'check', 'probe']);
    const [, check, probe] = jobs as [Job, Job, Job];
    expect(check.options.stdin).not.toContain('#eval');
    expect(check.options.stdin?.split('\n').filter((l) => l.startsWith('import '))).toEqual(IMPORTS.map((m) => `import ${m}`));
    expect(probe.options.stdin?.split('\n').filter((l) => l.startsWith('import '))).toEqual(['import Lean.CoreM', 'import Lean.Util.FoldConsts']);
    expect(probe.options.stdin).toContain('Lean.importModules mods {} (loadExts := false) (level := .private)');
    // The check's options: its argv and its timeout. (The lowered cap is checked in the test "refresh's probe job
    // (fixer 2b3a r1, S-V2B3A-S2)" below.)
    expect(probe.options.argv).toEqual(check.options.argv);
    expect(probe.options.timeoutMs).toBe(check.options.timeoutMs);
    expect(f.probe).toMatchObject({ status: 'ok' });
    expect(f.probe?.durationMs).toBeGreaterThan(0);
    expect(f.probe?.detail).toBeUndefined();
    expect(Object.fromEntries(f.decls.map((d) => [d.name, d.valueConsts]))).toEqual(VALUE_CONSTS_1D);
    expect(Object.fromEntries(f.decls.map((d) => [d.name, d.typeConsts]))).toEqual(TYPE_CONSTS);

    // The recorded probe file (16 declarations plus Spyro.nonexistent, as check-spyro.lean) and Lean's answer to it.
    const file = generateProbeFile(IMPORTS, [...SPYRO_NAMES, 'Spyro.nonexistent'], 'Model');
    const answer = await leanStdin(root, file.source);
    expect(answer.status).toBe('ok');
    if (process.env['UPDATE_SEMANTIC_RECORDINGS'] === '1') {
      writeFileSync(path.join(RECORDED, 'probe-spyro.lean'), file.source);
      writeFileSync(path.join(RECORDED, 'probe-spyro.jsonl'), answer.stdout);
    }
    expect(readFileSync(path.join(RECORDED, 'probe-spyro.lean'), 'utf8')).toBe(file.source);
    expect(readFileSync(path.join(RECORDED, 'probe-spyro.jsonl'), 'utf8')).toBe(answer.stdout);

    // What it costs (§2.1's Cost, AP30-2): logged for the report; the cap estimate from the message per declaration.
    const bytes = Buffer.byteLength(probe.result.stdout, 'utf8');
    const perDecl = bytes / SPYRO_NAMES.length;
    console.log(
      `[probe cost, spyro] build ${f.build.durationMs} ms, peak ${mib(f.build.peakMemoryBytes)} MiB; check ${f.check.durationMs} ms, peak ${mib(f.check.peakMemoryBytes)} MiB; ` +
        `probe ${f.probe?.durationMs ?? '?'} ms, peak ${mib(f.probe?.peakMemoryBytes)} MiB; probe message ${bytes} bytes, ${perDecl.toFixed(0)} bytes per declaration ` +
        `(runLean's 32 MiB cap at about ${Math.floor((32 * MiB) / perDecl)} declarations like these)`,
    );
    expect(await unitsOfRun(SEMANTIC_RUN_ID)).toEqual([]);
  });

  it('isolation: high-priority ToString String and ForIn Loop instances of the model forge the in-file probe (the control), never the isolated one', async () => {
    const forge = spyroCopy(tmp, 'forge', 'probe-forge');
    const main = path.join('Model', 'Spyro', 'Main.lean');
    const honest = spyroCopy(tmp, 'honest', 'probe-forge');
    writeFileSync(path.join(honest, main), withoutForgery(readFileSync(path.join(forge, main), 'utf8')));
    const forged = await refreshLeanFacts({ root: forge, runId: SEMANTIC_RUN_ID });
    const truth = await refreshLeanFacts({ root: honest, runId: SEMANTIC_RUN_ID });
    expect([forged.status, truth.status]).toEqual(['ok', 'ok']);
    expect([forged.probe?.status, truth.probe?.status]).toEqual(['ok', 'ok']);
    const FORGERIES = ['Spyro.forgeToString', 'Spyro.forgeLoop'];
    expect(forged.decls.filter((d) => FORGERIES.includes(d.name)).map((d) => d.name)).toEqual(FORGERIES);
    expect(truth.decls.some((d) => FORGERIES.includes(d.name))).toBe(false);
    // The true lists, the same with or without the two instances (but for their own entries).
    const names = truth.decls.map((d) => d.name);
    expect(constsOf(forged, names)).toEqual(constsOf(truth));
    // The statement elaborates through the instance placed before it: its value lists it, and B.2, RV-7 and RV-5 see it.
    expect(decl(forged, 'Spyro.someone_dark').valueConsts).toEqual(['Spyro.HasDarkPast', 'Spyro.Character', 'Spyro.instWitness']);
    expect(decl(forged, 'Spyro.someone_dark.holds').typeConsts).toEqual(['Spyro.someone_dark']);
    expect(constsOf(forged, SPYRO_NAMES)).toEqual(Object.fromEntries(SPYRO_NAMES.map((n) => [n, { value: VALUE_CONSTS_1D[n], type: TYPE_CONSTS[n] }])));

    // The control: the in-file probe on the same model prints forged lists (the loop ends at once: every list empty).
    const all = forged.decls.map((d) => d.name);
    const control = inFileValues(await leanStdin(forge, inFileProbe(all)), all);
    expect(Object.values(control).every((list) => list.length === 0)).toBe(true);
    expect(decl(forged, 'Spyro.cynder').valueConsts?.length).toBeGreaterThan(0);
    // With the ToString instance alone (the loop instance taken out), the printed line loses the witness instance.
    const toStringOnly = spyroCopy(tmp, 'forge-tostring', 'probe-forge');
    const text = readFileSync(path.join(forge, main), 'utf8');
    const loopAt = text.indexOf('/-- Ends every `while` loop at once. -/');
    writeFileSync(path.join(toStringOnly, main), `${text.slice(0, loopAt)}${text.slice(text.lastIndexOf('end Spyro'))}`);
    const built = await refreshLeanFacts({ root: toStringOnly, runId: SEMANTIC_RUN_ID });
    expect(built.status).toBe('ok');
    expect(decl(built, 'Spyro.someone_dark').valueConsts).toContain('Spyro.instWitness');
    const names2 = built.decls.map((d) => d.name);
    const control2 = inFileValues(await leanStdin(toStringOnly, inFileProbe(names2)), names2);
    expect(control2['Spyro.someone_dark']).toEqual(['Spyro.HasDarkPast', 'Spyro.Character']);
    expect(control2['Spyro.cynder']).toEqual(VALUE_CONSTS_1D['Spyro.cynder']);
    expect(await unitsOfRun(SEMANTIC_RUN_ID)).toEqual([]);
  });

  it('no [init] runs in the probe job: the check job prints the forged lines of @[init] and of its hygienic spelling (the control), the probe job does not; G0 refuses both in Claude\'s text', async () => {
    const root = spyroCopy(tmp, 'init', 'probe-init');
    const { facts: f, jobs } = await spied(root);
    expect(f.status, f.detail).toBe('ok');
    expect(f.probe?.status).toBe('ok');
    // The Spyro declarations' constants are the true ones (the Spyro fixture's).
    expect(constsOf(f, SPYRO_NAMES)).toEqual(Object.fromEntries(SPYRO_NAMES.map((n) => [n, { value: VALUE_CONSTS_1D[n], type: TYPE_CONSTS[n] }])));
    expect(f.decls.map((d) => d.name)).toEqual(expect.arrayContaining(['Spyro.forgedProbeLine', 'Spyro.forgedHygienicLine']));
    const check = jobs.find((j) => j.kind === 'check');
    const probe = jobs.find((j) => j.kind === 'probe');
    // The frontend imports the model, so its `[init]` code ran in the check job: both forged lines are on its stdout.
    expect(check?.result.stdout).toContain('"caption":"forged-init"');
    expect(check?.result.stdout).toContain('"caption":"forged-init-hygienic"');
    // importModules with loadExts := false runs none: only the probe's own line.
    expect(probe?.result.stdout).not.toContain('forged');
    expect(parseLeanJsonMessages(probe?.result.stdout ?? '').map((m) => m.line)).toEqual([3]);
    // In Claude's text G0 refuses both, before any Lean job (AP30-1, AP30-1 r3).
    const base = new Map([['Model.lean', readFileSync(path.join(SPYRO, 'Model.lean'), 'utf8')]]);
    for (const rel of ['Model/Spyro/InitForge.lean', 'Model/Spyro/InitHygienic.lean']) {
      const current = new Map([...base, [rel, readFileSync(path.join(root, rel), 'utf8')]]);
      const findings = checkFileChanges(base, current, { library: 'Model', subject: 'Spyro', projectModules: new Set(['Model', 'Model.Spyro.InitForge', 'Model.Spyro.InitHygienic']) });
      expect(findings.map((x) => x.code), rel).toContain('metaprogramming');
    }
    expect(await unitsOfRun(SEMANTIC_RUN_ID)).toEqual([]);
  });

  it('the type walk: a definition reached only through a class field type, inductive constructor types, an instance\'s class, a coercion in a statement', async () => {
    const root = path.join(tmp, 'types');
    mkdirSync(path.join(root, 'Model', 'Typ'), { recursive: true });
    for (const name of ['lean-toolchain', 'lakefile.toml', 'lake-manifest.json']) writeFileSync(path.join(root, name), readFileSync(path.join(SPYRO, name)));
    writeFileSync(path.join(root, 'Model.lean'), 'import Model.Typ.Main\n');
    writeFileSync(
      path.join(root, 'Model', 'Typ', 'Main.lean'),
      `namespace Typ

axiom Character : Type
axiom Game : Type
axiom Evil : Character → Prop
axiom IsPG : Game → Prop
axiom someone : Character
axiom gameOf : Character → Game

/-- reached only through the field type of a class -/
def Dark (c : Character) : Prop := Evil c
class Wicked (c : Character) : Prop where
  p : Dark c

/-- reached only through a constructor's type -/
def Haunted (c : Character) : Prop := Evil c
inductive Bag : Type where
  | hold : (c : Character) → Haunted c → Bag

axiom someone_evil : Evil someone
instance wickedSomeone : Wicked someone := ⟨someone_evil⟩

/-- a coercion -/
@[coe] noncomputable def toGame (c : Character) : Game := gameOf c
noncomputable instance : Coe Character Game := ⟨toGame⟩

abbrev someone_pg : Prop := IsPG (someone : Game)
axiom pg_direct : IsPG (someone : Game)

end Typ
`,
    );
    const f = await refreshLeanFacts({ root, runId: SEMANTIC_RUN_ID });
    expect(f.status, f.detail).toBe('ok');
    expect(f.probe?.status).toBe('ok');
    const type = (n: string) => decl(f, n).typeConsts;
    const value = (n: string) => decl(f, n).valueConsts;
    // A class: its type and its constructor's type, the field's definition included (not in valueConsts: a class
    // has no value).
    expect(type('Typ.Wicked')).toEqual(['Typ.Character', 'Typ.Dark', 'Typ.Wicked']);
    expect(value('Typ.Wicked')).toEqual([]);
    // An inductive: every constructor's type.
    expect(type('Typ.Bag')).toEqual(['Typ.Character', 'Typ.Haunted', 'Typ.Bag']);
    // An instance's class (and the class's argument).
    expect(type('Typ.wickedSomeone')).toEqual(['Typ.Wicked', 'Typ.someone']);
    // A coercion in a statement: in an abbrev's value, and in an axiom's type.
    expect(value('Typ.someone_pg')).toEqual(['Typ.IsPG', 'Typ.toGame', 'Typ.someone']);
    expect(type('Typ.pg_direct')).toEqual(['Typ.IsPG', 'Typ.toGame', 'Typ.someone']);
    expect(f.decls.every((d) => d.valueConsts !== undefined && d.typeConsts !== undefined)).toBe(true);
    console.log(`[probe, types] ${JSON.stringify(constsOf(f))}`);
    expect(await unitsOfRun(SEMANTIC_RUN_ID)).toEqual([]);
  });

  it('fails closed (§2.1): a cut, a failed and a killed probe job; a failed probe after a failed build; low memory before the probe', async () => {
    const root = spyroCopy(tmp, 'failing');
    const expectNoConsts = (f: LeanFacts) => {
      expect(f.decls.length).toBeGreaterThan(0);
      expect(f.decls.every((d) => d.valueConsts === undefined && d.typeConsts === undefined)).toBe(true);
      // The build's and the check's parts are kept.
      expect(f.build.status).toBe('ok');
      expect(f.check).toMatchObject({ status: 'ok', probed: 16 });
      expect(f.decls.every((d) => d.kind !== undefined && d.type !== undefined)).toBe(true);
    };

    // Cut: the real probe job, with an output cap it passes.
    const cut = await spied(root, (o) => runLean({ ...o, maxOutputBytes: 64 }));
    expect(cut.facts.status).toBe('check-errors');
    expect(cut.facts.probe).toMatchObject({ status: 'cut' });
    expectNoConsts(cut.facts);
    expect(cut.facts.detail).toBe(`check: ${(probeFailure(cut.facts) ?? '').replace(/\.$/u, '')}`);
    expect(cut.facts.detail).toContain("Lean's answer was over 32 MB");

    // Failed: each way the job's answer cannot be read.
    const fake = (stdout: string, over: Partial<RunLeanResult> = {}) => async (): Promise<RunLeanResult> => ({ status: 'ok', exitCode: 0, stdout, stderr: '', durationMs: 5, unit: 'fake', ...over });
    const at = (line: number, severity: string, data: string) => JSON.stringify({ severity, data, pos: { line, column: 0 } });
    const cases: Array<[string, () => Promise<RunLeanResult>, string]> = [
      ['an error in its #eval', fake(at(9, 'error', 'unknown constant Lean.Name.mkStr'), { status: 'failed', exitCode: 1 }), '9:0: unknown constant Lean.Name.mkStr'],
      ['an error in its imports', fake(at(1, 'error', "unknown module prefix 'Lean'"), { status: 'failed', exitCode: 1 }), "1:0: unknown module prefix 'Lean'"],
      ['no line', fake(''), 'Lean printed nothing for the probe'],
      ['an unreadable line', fake(at(3, 'information', `{"${VALUE_PROBE_KEY}": [`)), 'unreadable value probe output'],
      ['the wrong number of entries', fake(at(3, 'information', `{"${VALUE_PROBE_KEY}":[[]],"telelean-type-consts":[[]]}`)), 'the value probe listed 1 entries for 16 declarations'],
    ];
    for (const [label, run, detail] of cases) {
      const { facts: f } = await spied(root, run);
      expect(f.status, label).toBe('check-errors');
      expect(f.probe?.status, label).toBe('failed');
      expect(f.probe?.detail, label).toContain(detail);
      expectNoConsts(f);
      expect(f.detail, label).toBe(`check: ${(probeFailure(f) ?? '').replace(/\.$/u, '')}`);
    }

    // A sandbox status ends the refresh with that status, as the check's does: no declarations, the marker kept.
    for (const status of ['timeout', 'oom', 'cancelled', 'could-not-start'] as const) {
      const { facts: f } = await spied(root, fake('', { status, exitCode: null, detail: `the probe was ${status}` }));
      expect(f.status).toBe(status);
      expect(f.detail).toBe(`probe: the probe was ${status}`);
      expect(f.decls).toEqual([]);
      expect(f.check).toMatchObject({ status: 'ok', probed: 16 });
      expect(f.probe).toMatchObject({ status });
      expect(probeFailure(f)).toBeUndefined();
    }

    // A failed build too: build-errors, with the probe's cause in the detail.
    const broken = spyroCopy(tmp, 'failing-build', 'build-error');
    const { facts: both } = await spied(broken, fake('', { status: 'ok' }));
    expect(both.status).toBe('build-errors');
    expect(both.detail).toContain('lake build reported errors');
    expect(both.detail).toContain('telelean could not read what the declarations of this state use in Lean: the probe failed: Lean printed nothing for the probe');
    expect(both.decls.every((d) => d.valueConsts === undefined && d.typeConsts === undefined)).toBe(true);

    // The memory guard runs again before the probe spawn: low memory after the check skips it.
    const GiB = 1024 * MiB;
    let reads = 0;
    const { facts: low, jobs } = await spied(root, undefined, { readMemAvailable: () => (++reads <= 2 ? 64 * GiB : 1 * GiB), minAvailableBytes: 2 * GiB });
    expect(low.status).toBe('low-memory');
    expect(low.detail).toBe('MemAvailable dropped to 1.0 GiB after the check, below the 2.0 GiB threshold, so the probe did not run');
    expect(low.check).toMatchObject({ status: 'ok', probed: 16 });
    expect(low.decls).toEqual([]);
    expect(low.probe).toBeUndefined();
    expect(jobs.map((j) => j.kind)).toEqual(['build', 'check']);
    expect(reads).toBe(3);
    expect(await unitsOfRun(SEMANTIC_RUN_ID)).toEqual([]);
  });

  it('refresh\'s probe job (fixer 2b3a r1, S-V2B3A-S2): its cap lowered from the memory read right before it; it runs after the check\'s imports failed; none, and no marker, when the check file probed nothing', async () => {
    const GiB = 1024 * MiB;
    const MIN = 2 * GiB;

    // §2.1: the probe's memory cap is lowered by `spawnMemoryMax` from the read taken right before it, not from the
    // check's. Plenty of memory for the build and the check (they keep the configured 4G), less before the probe.
    const beforeProbe = 3 * GiB;
    let reads = 0;
    const lowered = await spied(spyroCopy(tmp, 'probe-cap'), undefined, { readMemAvailable: () => (++reads <= 2 ? 64 * GiB : beforeProbe), minAvailableBytes: MIN });
    expect(lowered.facts.status, lowered.facts.detail).toBe('ok');
    expect(reads).toBe(3);
    expect(lowered.jobs.map((j) => j.kind)).toEqual(['build', 'check', 'probe']);
    const [build, check, probe] = lowered.jobs as [Job, Job, Job];
    expect([build.options.memoryMax, check.options.memoryMax]).toEqual(['4G', '4G']);
    expect(probe.options.memoryMax).toBe(spawnMemoryMax('4G', beforeProbe, MIN));
    expect(probe.options.memoryMax).toBe('2048M');
    expect(lowered.facts.probe?.status).toBe('ok');

    // The check's imports failed (a fake check job; the build and the probe are real): the probe is another job with its
    // own cause, so it still runs, its marker is kept, and the detail names the check's problem, and the probe's too
    // when it fails as well.
    const importsFailed: FakeJob = async () => ({
      status: 'failed',
      exitCode: 1,
      stdout: `${JSON.stringify({ severity: 'error', data: "unknown module prefix 'Model'", pos: { line: 1, column: 0 } })}\n`,
      stderr: '',
      durationMs: 5,
      unit: 'fake-check',
    });
    const importsText = "the check file's imports failed: 1:0: unknown module prefix 'Model'";
    const root = spyroCopy(tmp, 'probe-after-imports');
    const real = await spiedJobs(root, { check: importsFailed });
    expect(real.jobs.map((j) => j.kind)).toEqual(['build', 'check', 'probe']);
    expect(real.facts.status).toBe('check-errors');
    expect(real.facts.detail).toBe(`check: ${importsText}`);
    expect(real.facts.check.detail).toBe(importsText);
    expect(real.facts.probe?.status).toBe('ok');
    expect(constsOf(real.facts, SPYRO_NAMES)).toEqual(Object.fromEntries(SPYRO_NAMES.map((n) => [n, { value: VALUE_CONSTS_1D[n], type: TYPE_CONSTS[n] }])));
    const both = await spiedJobs(root, {
      check: importsFailed,
      probe: async () => ({ status: 'ok', exitCode: 0, stdout: '', stderr: '', durationMs: 5, unit: 'fake-probe' }),
    });
    expect(both.jobs.map((j) => j.kind)).toEqual(['build', 'check', 'probe']);
    expect(both.facts.status).toBe('check-errors');
    expect(both.facts.probe).toMatchObject({ status: 'failed', detail: 'Lean printed nothing for the probe' });
    expect(both.facts.detail).toBe(`check: ${importsText}; ${(probeFailure(both.facts) ?? '').replace(/\.$/u, '')}`);
    expect(both.facts.decls.every((d) => d.valueConsts === undefined && d.typeConsts === undefined)).toBe(true);

    // A model whose only declaration cannot be written into the check file: the check runs with nothing to probe, and
    // no probe job runs (it would have no declaration), so the facts carry no marker.
    const odd = path.join(tmp, 'probe-nothing');
    mkdirSync(path.join(odd, 'Model', 'Odd'), { recursive: true });
    for (const name of ['lean-toolchain', 'lakefile.toml', 'lake-manifest.json']) writeFileSync(path.join(odd, name), readFileSync(path.join(SPYRO, name)));
    writeFileSync(path.join(odd, 'Model.lean'), 'import Model.Odd.Main\n');
    writeFileSync(path.join(odd, 'Model', 'Odd', 'Main.lean'), 'namespace Odd\n\ndef «odd name» : Nat := 1\n\nend Odd\n');
    const nothing = await spied(odd);
    expect(nothing.jobs.map((j) => j.kind)).toEqual(['build', 'check']);
    expect(nothing.facts.status).toBe('check-errors');
    expect(nothing.facts.detail).toMatch(/^check: Odd\.«odd name» was not checked: not a usable Lean declaration name/u);
    expect(nothing.facts.check).toMatchObject({ status: 'ok', probed: 0 });
    expect(nothing.facts.decls.map((d) => d.name)).toEqual(['Odd.«odd name»']);
    expect(nothing.facts.probe).toBeUndefined();
    expect(probeFailure(nothing.facts)).toBeUndefined();
    expect(await unitsOfRun(SEMANTIC_RUN_ID)).toEqual([]);
  });
});
