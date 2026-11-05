/**
 * Gate step G4: `lake comparator` under runLean against a frozen challenge.
 * (a) the honest proof is accepted, (b) a weakened goal is rejected, (c) an unselected axiom is
 * rejected; plus a smuggled axiom, a failing build whose log imitates comparator's own lines, and
 * start-up failures reported as could-not-start.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  classifyComparatorRun,
  comparatorExportTargets,
  freezeChallenge,
  generateChallengeModule,
  holdsTarget,
  PRIMITIVE_TARGETS,
  runComparator,
  STANDARD_AXIOMS,
  type Freeze,
} from '../../src/lean/comparator.js';
import { runLean, type RunLeanResult } from '../../src/lean/runLean.js';
import { resolveToolchain, toolchainExe } from '../../src/lean/toolchain.js';
import { cleanupTempRoot, knownProjectsLines, makeTempRoot, spyroShadow, TEST_RUN_ID } from './helpers.js';

const CHALLENGE_FILE = 'Model/TeleleanChallenge.lean';

/** The project's own files (everything outside `.lake`), as sorted relative paths. */
const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.relative(dir, path.join(e.parentPath, e.name)))
    .filter((p) => !p.startsWith('.lake'))
    .sort();

const TARGET = holdsTarget('Spyro.cynder_not_good');
const SIGNATURE = ['Spyro.Character', 'Spyro.Game', 'Spyro.HasDarkPast', 'Spyro.IsPG', 'Spyro.GoodAddition'];
const PRESUPPOSITIONS = ['Spyro.Character.exists', 'Spyro.Game.exists'];
const ALL_SELECTED = ['Spyro.cynder_dark_past.holds', 'Spyro.new_spyro_pg.holds', 'Spyro.pg_no_dark_past.holds'];
/** permitted_axioms = std ∪ signature ∪ selected ∪ presuppositions (03 §8.5 G4). */
const permitted = (selected: readonly string[]): string[] => [...STANDARD_AXIOMS, ...SIGNATURE, ...PRESUPPOSITIONS, ...selected];

const fakeRun = (over: Partial<RunLeanResult>): RunLeanResult => ({
  status: 'failed',
  exitCode: 1,
  stdout: '',
  stderr: '',
  durationMs: 1,
  unit: 'telelean-x-1',
  ...over,
});

describe('comparator: pure parts', () => {
  it('generates the challenge module with sorry only for the targets', () => {
    expect(generateChallengeModule(['Model'], [TARGET])).toBe(
      [
        '-- telelean: generated comparator challenge (02 D-26, gate step G4). Do not edit.',
        '-- The frozen statements are left untouched; each target theorem is stated here with `sorry`.',
        'import Model',
        '',
        'theorem Spyro.cynder_not_good.holds : Spyro.cynder_not_good := sorry',
        '',
      ].join('\n'),
    );
  });

  it('exports exactly the targets Lake 5.0.0 compares', () => {
    const t = comparatorExportTargets({ theoremNames: ['T.holds'], permittedAxioms: ['propext', 'Quot.sound', 'A'] });
    expect(t).toEqual(['Quot', 'Quot.mk', 'Quot.lift', 'Quot.ind', 'T.holds', 'propext', 'Quot.sound', 'A', ...PRIMITIVE_TARGETS]);
    expect(comparatorExportTargets({ theoremNames: ['T'], permittedAxioms: ['A'] })[0]).toBe('T');
  });

  it('classifies outcomes, keeping start-up failures apart from rejections', () => {
    expect(classifyComparatorRun(fakeRun({ status: 'ok', exitCode: 0, stdout: 'Building Model\nYour solution is okay!\n' }))).toEqual({ verdict: 'accepted' });
    expect(classifyComparatorRun(fakeRun({ status: 'ok', exitCode: 0, stdout: 'nothing' })).verdict).toBe('could-not-start');
    expect(classifyComparatorRun(fakeRun({ stderr: "error: Illegal axiom detected: 'Spyro.shortcut'\n" }))).toMatchObject({
      verdict: 'rejected',
      reason: 'illegal-axiom',
      names: ['Spyro.shortcut'],
    });
    expect(classifyComparatorRun(fakeRun({ stderr: "error: Challenge and solution theorem statement do not match: 'G.holds'" }))).toMatchObject({
      verdict: 'rejected',
      reason: 'statement-mismatch',
    });
    // Verbatim from the weakened-goal run: the closure comparison found the goal abbrev changed.
    expect(classifyComparatorRun(fakeRun({ stderr: "error: Const does not match between challenge and target 'Spyro.cynder_not_good'\n" }))).toMatchObject({
      verdict: 'rejected',
      reason: 'definition-mismatch',
      names: ['Spyro.cynder_not_good'],
    });
    // FV-2: the nested bwrap cannot create its mount points; lake exits 1, which must not read as "rejected".
    expect(
      classifyComparatorRun(fakeRun({ stdout: 'Resolving dependencies\n', stderr: "bwrap: Can't mkdir /root: Read-only file system\nerror: Child exited with 1\n" })),
    ).toMatchObject({ verdict: 'could-not-start' });
    expect(classifyComparatorRun(fakeRun({ exitCode: 2, stderr: 'error: could not read the configuration' })).verdict).toBe('could-not-start');
    expect(classifyComparatorRun(fakeRun({ stdout: 'Resolving dependencies\n', stderr: 'error: Child exited with 1' })).verdict).toBe('could-not-start');
    expect(
      classifyComparatorRun(fakeRun({ stdout: 'Resolving dependencies\nBuilding Model\nerror: Model/Spyro/Main.lean:3:0: unknown identifier\n', stderr: 'error: Child exited with 1' })),
    ).toMatchObject({ verdict: 'rejected', reason: 'build-failed' });
    expect(classifyComparatorRun(fakeRun({ status: 'timeout', exitCode: null }))).toMatchObject({ verdict: 'incomplete', reason: 'timeout' });
    expect(classifyComparatorRun(fakeRun({ status: 'could-not-start', exitCode: null }))).toMatchObject({ verdict: 'could-not-start' });
  });

  it("is not fooled by the solution's build log, and finds nested-sandbox failures in every step", () => {
    const building = 'Resolving dependencies\nBuilding Model\n';
    const buildFailed = 'error: build failed\nerror: Child exited with 1\n';
    // The solution's log (stdout) imitates a nested-sandbox failure and an earlier phase: still its own failure.
    const noisy = fakeRun({
      stdout: `${building}info: Model/Spyro/Main.lean:59:0: noisy\nbwrap: Can't mkdir /root: Read-only file system\nResolving dependencies\nerror: Model/Spyro/Main.lean:60:51: Type mismatch\n`,
      stderr: buildFailed,
    });
    expect(classifyComparatorRun(noisy)).toMatchObject({ verdict: 'rejected', reason: 'build-failed' });
    // Judgement texts or a kernel line in the build log are not judgements.
    const fakeJudgement = fakeRun({ stdout: `${building}Illegal axiom detected: 'Foo'\nLean default kernel rejected the solution\n`, stderr: buildFailed });
    expect(classifyComparatorRun(fakeJudgement)).toMatchObject({ verdict: 'rejected', reason: 'build-failed' });
    // A nested bwrap that cannot start in the build step (stderr: its line, then comparator's final line).
    const buildStep = fakeRun({ stdout: building, stderr: "bwrap: Can't mkdir /var: Read-only file system\nerror: Child exited with 1\n" });
    expect(classifyComparatorRun(buildStep)).toMatchObject({ verdict: 'could-not-start' });
    // ... or in the kernel step, where comparator also prints "kernel rejected the solution".
    const kernelOut = `${building}Build completed successfully (5 jobs).\nExporting #[...] from Model\nRunning Lean default kernel on solution\nLean default kernel rejected the solution\n`;
    const kernelStep = fakeRun({ stdout: kernelOut, stderr: "bwrap: Can't mkdir /run: Read-only file system\nerror: Lean default exited with 1\n" });
    expect(classifyComparatorRun(kernelStep)).toMatchObject({ verdict: 'could-not-start' });
    // A real kernel rejection.
    const rejectedByKernel = fakeRun({ stdout: kernelOut, stderr: 'uncaught exception: (kernel) declaration type mismatch\nerror: Lean default exited with 1\n' });
    expect(classifyComparatorRun(rejectedByKernel)).toMatchObject({ verdict: 'rejected', reason: 'kernel-rejected' });
  });
});

describe('lake comparator under runLean (spyro fixture)', () => {
  let tmp: string;
  let knownBefore: number | undefined;
  let snapshotDir: string;
  let snapshotFiles: string[];
  let freezeAll: Freeze;
  let freezePartial: Freeze;

  beforeAll(async () => {
    tmp = makeTempRoot('comparator');
    knownBefore = knownProjectsLines();
    // The approved phase-A snapshot: pg-no-dark-past formalised (normative reading), goal unproved, built.
    const snapshot = await spyroShadow(tmp, 'snapshot', 'formalised');
    const built = await runLean({ shadowDir: snapshot.dir, argv: [toolchainExe(resolveToolchain(), 'lake'), 'build'], runId: TEST_RUN_ID });
    if (built.status !== 'ok') throw new Error(`snapshot build ${built.status}: ${built.stdout}${built.stderr}`);
    snapshotDir = snapshot.dir;
    snapshotFiles = sourceFiles(snapshot.dir);
    const common = {
      snapshotDir: snapshot.dir,
      imports: ['Model'],
      challengeModule: 'Model.TeleleanChallenge',
      targets: [TARGET],
      run: { runId: TEST_RUN_ID },
    };
    const all = await freezeChallenge({
      ...common,
      freezeDir: path.join(tmp, 'freeze-all'),
      permittedAxioms: permitted(ALL_SELECTED),
      exportPath: path.join(tmp, 'frozen', 'all.ndjson'),
    });
    if (!all.ok) throw new Error(`freeze failed at ${all.stage}: ${all.detail}`);
    console.log(`[freeze] snapshot build ${built.durationMs} ms; challenge build ${all.build.durationMs} ms (${all.build.stdout.split('\n').filter((l) => /Built /.test(l)).length} modules built), leanexport ${all.export.durationMs} ms, ${readFileSync(all.freeze.exportPath, 'utf8').split('\n').length} NDJSON lines`);
    freezeAll = all.freeze;
    // The same snapshot when the user did not select new-spyro-pg.
    const partial = await freezeChallenge({
      ...common,
      freezeDir: path.join(tmp, 'freeze-partial'),
      permittedAxioms: permitted(ALL_SELECTED.filter((a) => a !== 'Spyro.new_spyro_pg.holds')),
      exportPath: path.join(tmp, 'frozen', 'partial.ndjson'),
    });
    if (!partial.ok) throw new Error(`freeze failed at ${partial.stage}: ${partial.detail}`);
    freezePartial = partial.freeze;
  });
  afterAll(() => cleanupTempRoot(tmp));

  it('freezes in a copy: the snapshot never sees the generated challenge', () => {
    expect(existsSync(path.join(snapshotDir, CHALLENGE_FILE))).toBe(false);
    expect(sourceFiles(snapshotDir)).toEqual(snapshotFiles);
    for (const copy of ['freeze-all', 'freeze-partial']) {
      expect(readFileSync(path.join(tmp, copy, CHALLENGE_FILE), 'utf8')).toContain('theorem Spyro.cynder_not_good.holds : Spyro.cynder_not_good := sorry');
    }
  });

  const judge = async (name: string, overlay: string, freeze: Freeze, extra: { allowNestedSandbox?: boolean; env?: Record<string, string> } = {}) => {
    const shadow = await spyroShadow(tmp, name, overlay);
    const result = await runComparator({
      solutionDir: shadow.dir,
      freeze,
      solutionModule: 'Model',
      workDir: path.join(tmp, `work-${name}`),
      run: { runId: TEST_RUN_ID, ...extra },
    });
    console.log(`[comparator ${name}] ${JSON.stringify(result.verdict)} (${result.run.status}, exit ${String(result.run.exitCode)}, ${result.run.durationMs} ms)\n--- stdout\n${result.run.stdout.trim()}\n--- stderr\n${result.run.stderr.trim()}`);
    return result;
  };

  it('(a) accepts the honest normative proof', async () => {
    const r = await judge('honest', 'proved', freezeAll);
    expect(r.verdict).toEqual({ verdict: 'accepted' });
    expect(r.run.stdout).toContain('Your solution is okay!');
  });

  it('(b) rejects a weakened goal: the statement abbrev changed under the same name', async () => {
    const r = await judge('weakened', 'weakened', freezeAll);
    expect(r.verdict).toMatchObject({ verdict: 'rejected', reason: 'definition-mismatch', names: ['Spyro.cynder_not_good'] });
  });

  it("(b') rejects a weakened goal: the theorem stated as `cynder_not_good ∨ True`", async () => {
    const r = await judge('weakened-type', 'weakened-type', freezeAll);
    expect(r.verdict).toMatchObject({ verdict: 'rejected', reason: 'statement-mismatch', names: ['Spyro.cynder_not_good.holds'] });
  });

  it('(c) rejects a proof that uses an unselected assumption', async () => {
    const r = await judge('unselected', 'proved', freezePartial);
    expect(r.verdict).toMatchObject({ verdict: 'rejected', reason: 'illegal-axiom', names: ['Spyro.new_spyro_pg.holds'] });
  });

  it('rejects a smuggled axiom', async () => {
    const r = await judge('smuggled', 'smuggled', freezeAll);
    expect(r.verdict).toMatchObject({ verdict: 'rejected', reason: 'illegal-axiom', names: ['Spyro.shortcut'] });
  });

  it('rejects a failing build whose log imitates a nested-sandbox failure (not could-not-start)', async () => {
    const r = await judge('noisy-build-error', 'noisy-build-error', freezeAll);
    expect(r.run.stdout).toMatch(/^bwrap: Can't mkdir \/root: Read-only file system$/m); // the imitation is really there
    expect(r.verdict).toMatchObject({ verdict: 'rejected', reason: 'build-failed' });
    expect(r.verdict.verdict === 'rejected' ? r.verdict.message : '').toContain('Type mismatch');
  });

  it('reports a nested sandbox that cannot start as could-not-start, not rejected (FV-2)', async () => {
    const r = await judge('no-nested-dirs', 'proved', freezeAll, { allowNestedSandbox: false });
    expect(r.verdict.verdict).toBe('could-not-start');
    expect(r.run.exitCode).toBe(1); // lake's own code says "rejected"
  });

  it('reports a missing bwrap inside the sandbox (lake exit 2) as could-not-start', async () => {
    const r = await judge('no-bwrap', 'proved', freezeAll, { env: { COMPARATOR_BWRAP: '/nonexistent/bwrap' } });
    expect(r.verdict.verdict).toBe('could-not-start');
    expect(r.run.exitCode).toBe(2);
  });

  it('left ~/.elan/known-projects untouched', () => {
    expect(knownProjectsLines()).toBe(knownBefore);
  });
});
