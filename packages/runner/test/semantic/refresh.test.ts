/**
 * refreshLeanFacts on scratch copies of the fixtures, building in place under runLean (sandboxed, memory-capped):
 * AT3.1 (Spyro), AT3.2 (build error), AT3.3 (proved overlay + extras), AT3.5 (cancel, timeout), AT3.7 (stale),
 * AT3.9 (non-BMP column, end to end). Every test uses its own copy; nothing is built under test-fixtures/.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DeclFacts, LeanFacts } from '@telelean/core';

import { refreshLeanFacts } from '../../src/semantic/index.js';
import { processesMatching } from '../lean/helpers.js';
import { cleanupTempRoot, knownProjectsLines, makeTempRoot, MiB, SEMANTIC_FIXTURES, SEMANTIC_RUN_ID, spyroCopy, unitsOfRun } from './helpers.js';

const VOCABULARY_NAMES = [
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
];
const MAIN_NAMES = ['Spyro.cynder_dark_past', 'Spyro.cynder_dark_past.holds', 'Spyro.new_spyro_pg', 'Spyro.new_spyro_pg.holds', 'Spyro.cynder_not_good'];

const mib = (bytes: number | undefined): string => (bytes === undefined ? '?' : (bytes / MiB).toFixed(0));

function report(label: string, f: LeanFacts): void {
  console.log(
    `[refresh ${label}] status=${f.status}; build ${f.build.status} ${f.build.durationMs} ms, peak ${mib(f.build.peakMemoryBytes)} MiB; ` +
      `check ${f.check.status} ${f.check.durationMs} ms, peak ${mib(f.check.peakMemoryBytes)} MiB, ${f.check.probed} declarations probed` +
      (f.detail !== undefined ? `\n  detail: ${f.detail}` : ''),
  );
}

function decl(f: LeanFacts, name: string): DeclFacts {
  const d = f.decls.find((x) => x.name === name);
  if (d === undefined) throw new Error(`no facts for ${name}`);
  return d;
}

/** The facts without what changes from run to run (times, durations, memory peaks). */
function withoutVolatile(f: LeanFacts): LeanFacts {
  const strip = <T extends { durationMs: number; peakMemoryBytes?: number }>(run: T): T => {
    const { peakMemoryBytes: _peak, ...rest } = run;
    return { ...rest, durationMs: 0 } as T;
  };
  return { ...f, startedAt: '1970-01-01T00:00:00.000Z', finishedAt: '1970-01-01T00:00:00.000Z', build: strip(f.build), check: strip(f.check) };
}

/**
 * The facts equal `test-fixtures/semantic/recorded/<name>` (for core's tests and the integrator), apart from times,
 * durations and peaks. Regenerate with UPDATE_SEMANTIC_RECORDINGS=1 after changing a fixture or the semantic layer.
 */
function expectRecorded(name: string, f: LeanFacts): void {
  const normalised = `${JSON.stringify(withoutVolatile(f), null, 2)}\n`;
  const file = path.join(SEMANTIC_FIXTURES, 'recorded', name);
  if (process.env['UPDATE_SEMANTIC_RECORDINGS'] === '1') writeFileSync(file, normalised);
  expect(normalised).toBe(readFileSync(file, 'utf8'));
}

const states = (f: LeanFacts): Record<string, string> => Object.fromEntries(f.modules.map((m) => [m.name, m.state]));
const r = (l1: number, c1: number, l2: number, c2: number): { start: { line: number; character: number }; end: { line: number; character: number } } => ({
  start: { line: l1, character: c1 },
  end: { line: l2, character: c2 },
});

describe('refreshLeanFacts (sandboxed Lean)', () => {
  let tmp: string;
  let knownBefore: number | undefined;
  beforeAll(() => {
    tmp = makeTempRoot('semantic-refresh');
    knownBefore = knownProjectsLines();
  });
  afterAll(() => cleanupTempRoot(tmp));

  it('AT3.1: the Spyro fixture: ok, every module fresh, all 16 declarations with their facts', async () => {
    const root = spyroCopy(tmp, 'spyro');
    const phases: string[] = [];
    const f = await refreshLeanFacts({ root, runId: SEMANTIC_RUN_ID, onPhase: (p) => phases.push(p) });
    report('spyro', f);
    expect(f.status).toBe('ok');
    expect(f.detail).toBeUndefined();
    expect(phases).toEqual(['build', 'check']);
    expect(f).toMatchObject({ format: 'telelean-lean-facts', version: 1, toolchain: 'leanprover/lean4:v4.35.0', library: 'Model' });
    expect(Date.parse(f.finishedAt)).toBeGreaterThanOrEqual(Date.parse(f.startedAt));
    expect(f.build).toMatchObject({ status: 'ok', messages: [], failedModules: [] });
    expect(f.build.peakMemoryBytes).toBeGreaterThan(0);
    expect(f.check).toMatchObject({ status: 'ok', probed: 16 });

    expect(f.modules.map((m) => [m.name, m.file, m.state, m.imports])).toEqual([
      ['Model.Spyro.Vocabulary', 'Model/Spyro/Vocabulary.lean', 'fresh', []],
      ['Model.Spyro.Main', 'Model/Spyro/Main.lean', 'fresh', ['Model.Spyro.Vocabulary']],
      ['Model', 'Model.lean', 'fresh', ['Model.Spyro.Main']],
    ]);
    for (const m of f.modules) {
      expect(m.sourceSha256).toBe(createHash('sha256').update(readFileSync(path.join(root, m.file))).digest('hex'));
    }

    expect(f.decls.map((d) => d.name)).toEqual([...VOCABULARY_NAMES, ...MAIN_NAMES]);
    expect(f.decls.filter((d) => d.error !== undefined)).toEqual([]);
    const kinds = Object.fromEntries(f.decls.map((d) => [d.name, d.kind]));
    expect(kinds).toEqual({
      'Spyro.Character': 'axiom',
      'Spyro.Game': 'axiom',
      'Spyro.Character.exists': 'axiom',
      'Spyro.instNonemptyCharacter': 'instance', // Lean prints it as a theorem; the source says `instance`
      'Spyro.Game.exists': 'axiom',
      'Spyro.instNonemptyGame': 'instance',
      'Spyro.HasDarkPast': 'axiom',
      'Spyro.IsPG': 'axiom',
      'Spyro.GoodAddition': 'axiom',
      'Spyro.cynder': 'opaque',
      'Spyro.newSpyro': 'opaque',
      'Spyro.cynder_dark_past': 'def',
      'Spyro.cynder_dark_past.holds': 'axiom',
      'Spyro.new_spyro_pg': 'def',
      'Spyro.new_spyro_pg.holds': 'axiom',
      'Spyro.cynder_not_good': 'def',
    });
    for (const abbrev of ['Spyro.cynder_dark_past', 'Spyro.new_spyro_pg', 'Spyro.cynder_not_good']) {
      expect(decl(f, abbrev).attributes).toEqual(['reducible']);
      expect(decl(f, abbrev).type).toBe('Prop');
    }
    expect(decl(f, 'Spyro.HasDarkPast').type).toBe('Spyro.Character → Prop');
    expect(decl(f, 'Spyro.GoodAddition').type).toBe('Spyro.Character → Spyro.Game → Prop');
    expect(decl(f, 'Spyro.Character').typeSort).toBe('Type 1');
    expect(decl(f, 'Spyro.HasDarkPast').typeSort).toBe('Type');
    expect(decl(f, 'Spyro.Character.exists').typeSort).toBe('Prop');
    expect(decl(f, 'Spyro.cynder').typeSort).toBe('Type');
    expect(decl(f, 'Spyro.cynder_dark_past.holds').typeSort).toBe('Prop');
    expect(decl(f, 'Spyro.cynder_dark_past.holds').axioms).toEqual([
      'Classical.choice',
      'Spyro.Character',
      'Spyro.HasDarkPast',
      'Spyro.Character.exists',
      'Spyro.cynder_dark_past.holds',
    ]);
    expect(decl(f, 'Spyro.cynder_dark_past.holds').usesSorry).toBe(false);
    expect(decl(f, 'Spyro.cynder_dark_past').value).toBe('Spyro.HasDarkPast Spyro.cynder');
    expect(decl(f, 'Spyro.cynder_not_good').value).toBe('¬Spyro.GoodAddition Spyro.cynder Spyro.newSpyro');
    expect(decl(f, 'Spyro.cynder_dark_past.holds').value).toBeUndefined();
    expect(decl(f, 'Spyro.cynder').value).toBeUndefined();

    const dark = decl(f, 'Spyro.cynder_dark_past');
    expect(dark).toMatchObject({ module: 'Model.Spyro.Main', file: 'Model/Spyro/Main.lean', range: r(23, 0, 24, 52), selectionRange: r(24, 7, 24, 23) });
    expect(dark.refs).toEqual([
      { name: 'Spyro.HasDarkPast', module: 'Model.Spyro.Vocabulary', range: r(24, 34, 24, 45) },
      { name: 'Spyro.cynder', module: 'Model.Spyro.Vocabulary', range: r(24, 46, 24, 52) },
    ]);
    expect(decl(f, 'Spyro.cynder_dark_past.holds').refs).toEqual([{ name: 'Spyro.cynder_dark_past', module: 'Model.Spyro.Main', range: r(25, 31, 25, 47) }]);
    expect(dark.docstring).toBe('Cynder is a character who has a dark past');
    expect(decl(f, 'Spyro.Character').docstring).toBe('characters');
    expect(decl(f, 'Spyro.newSpyro').docstring).toBe('the new Spyro game');
    expect(decl(f, 'Spyro.instNonemptyGame').docstring).toBeUndefined();
    expect(decl(f, 'Spyro.cynder_dark_past.holds').docstring).toBeUndefined();
    expect(f.decls.every((d) => d.parent === undefined)).toBe(true);

    expect(await unitsOfRun(SEMANTIC_RUN_ID)).toEqual([]);
    expect(knownProjectsLines()).toBe(knownBefore);

    expectRecorded('spyro-facts.json', f);
  });

  it('AT3.2: a build error in Main: Main failed, the root dependency-failed, Vocabulary fresh, the full message', async () => {
    // Built once successfully first, so old artifacts exist when the error appears: they must not be checked.
    const root = spyroCopy(tmp, 'build-error');
    expect((await refreshLeanFacts({ root, runId: SEMANTIC_RUN_ID })).status).toBe('ok');
    cpSync(path.join(SEMANTIC_FIXTURES, 'overlays', 'build-error'), root, { recursive: true });
    const f = await refreshLeanFacts({ root, runId: SEMANTIC_RUN_ID });
    report('build-error', f);
    expect(f.status).toBe('build-errors');
    expect(states(f)).toEqual({ 'Model.Spyro.Vocabulary': 'fresh', 'Model.Spyro.Main': 'failed', Model: 'dependency-failed' });
    expect(f.build.status).toBe('failed');
    expect(f.build.failedModules).toEqual(['Model.Spyro.Main']);
    expect(f.detail).toContain('Model.Spyro.Main failed; Model not built (an import failed)');
    expect(f.decls.map((d) => d.name)).toEqual(VOCABULARY_NAMES);
    expect(f.decls.every((d) => d.kind !== undefined && d.type !== undefined && d.error === undefined)).toBe(true);
    expect(f.check).toMatchObject({ status: 'ok', probed: 11 }); // only the fresh module was imported
    expect(existsSync(path.join(root, '.lake/build/lib/lean/Model.olean'))).toBe(true); // the stale root artifact is still there, unused

    const errors = f.build.messages.filter((m) => m.severity === 'error');
    expect(errors).toEqual([
      {
        severity: 'error',
        file: 'Model/Spyro/Main.lean',
        module: 'Model.Spyro.Main',
        range: r(57, 51, 57, 51),
        text: 'Type mismatch\n  cynder_dark_past.holds\nhas type\n  cynder_dark_past\nbut is expected to have type\n  cynder_not_good',
      },
    ]);
    const line = readFileSync(path.join(root, 'Model/Spyro/Main.lean'), 'utf8').split('\n')[57] ?? '';
    expect(line.slice(51)).toBe('cynder_dark_past.holds');
    expect(await unitsOfRun(SEMANTIC_RUN_ID)).toEqual([]);
  });

  it('AT3.3: the proved overlay plus extras', async () => {
    const root = spyroCopy(tmp, 'extras', 'extras');
    const f = await refreshLeanFacts({ root, runId: SEMANTIC_RUN_ID });
    report('extras', f);
    expect(f.status).toBe('ok');
    expect(states(f)).toEqual({ 'Model.Spyro.Vocabulary': 'fresh', 'Model.Spyro.Main': 'fresh', Model: 'fresh', 'Model.Spyro.Orphan': 'not-built' });
    expect(f.build.messages).toEqual([
      { severity: 'warning', file: 'Model/Spyro/Main.lean', module: 'Model.Spyro.Main', range: r(86, 8, 86, 8), text: 'declaration uses `sorry`' },
    ]);
    expect(f.decls.some((d) => d.name.startsWith('_private.') || d.name.includes('secret_helper'))).toBe(false);
    expect(f.decls.some((d) => d.name === 'Spyro.orphan')).toBe(false); // not-built modules have no facts

    expect(decl(f, 'Spyro.d1.holds')).toMatchObject({ kind: 'theorem', type: 'Spyro.cynder_not_good → Spyro.d1', typeSort: 'Prop' });
    expect(decl(f, 'Spyro.d3.holds').type).toBe(
      'Spyro.a_statement_with_a_rather_long_name_so_that_types_wrap → Spyro.another_statement_with_a_long_name_so_types_wrap_too → Spyro.d3',
    );
    const g2 = decl(f, 'Spyro.g2.holds');
    expect(g2.refs.map((x) => x.name)).toEqual(['Spyro.g2', 'Spyro.d0.holds', 'And.right']);
    expect(g2.axioms).toContain('Spyro.cynder_dark_past.holds');
    expect(g2.axioms).toContain('Spyro.new_spyro_pg.holds');
    expect(g2.axioms?.filter((a) => a.endsWith('.holds'))).toEqual(['Spyro.cynder_dark_past.holds', 'Spyro.new_spyro_pg.holds']);
    expect(decl(f, 'Spyro.g3.holds').refs.map((x) => x.name)).toEqual(['Spyro.g3', 'Spyro.helper_lemma']);
    expect(decl(f, 'Spyro.helper_lemma')).toMatchObject({ kind: 'theorem', docstring: 'An untracked lemma' });
    expect(decl(f, 'Spyro.withSorry')).toMatchObject({ kind: 'theorem', usesSorry: true });
    expect(decl(f, 'Spyro.cynder_not_good.holds')).toMatchObject({ kind: 'theorem', usesSorry: false });
    expect(decl(f, 'Spyro.hidden')).toMatchObject({ kind: 'axiom', typeSort: 'Prop', docstring: 'A hidden assumption' });
    expect(decl(f, 'Spyro.c2')).toMatchObject({ kind: 'axiom', type: 'Spyro.Character', typeSort: 'Type' });
    expect(decl(f, 'Spyro.P0')).toMatchObject({ kind: 'axiom', type: 'Prop', typeSort: 'Type' });
    expect(decl(f, 'Spyro.f')).toMatchObject({ kind: 'axiom', type: 'Spyro.Character → Spyro.Game', typeSort: 'Type' });
    expect(decl(f, 'Spyro.Rec')).toMatchObject({ kind: 'structure', typeSort: 'Type 1', docstring: 'A record with one field' });
    expect(decl(f, 'Spyro.Rec.past')).toMatchObject({ parent: 'Spyro.Rec', kind: 'def', docstring: 'the past', type: 'Spyro.Rec → Prop' });
    for (const d of f.decls.filter((x) => x.kind === 'theorem')) expect(d.value, d.name).toBeUndefined();
    expect(f.decls.filter((x) => x.kind === 'theorem').length).toBeGreaterThanOrEqual(8);
    expect(decl(f, 'Spyro.uses_def')).toMatchObject({ kind: 'def', attributes: ['reducible'], value: 'Spyro.darkAndPG Spyro.cynder Spyro.newSpyro' });
    expect(decl(f, 'Spyro.uses_def').refs.map((x) => x.name)).toEqual(['Spyro.darkAndPG', 'Spyro.cynder', 'Spyro.newSpyro']);
    expect(decl(f, 'Spyro.darkAndPG')).toMatchObject({ kind: 'def', docstring: 'dark past and PG' });
    expect(decl(f, 'Spyro.darkAndPG').attributes).toBeUndefined();
    expect(decl(f, 'Spyro.instInhabitedRec')).toMatchObject({
      kind: 'instance',
      attributes: ['instance_reducible'],
      value: '{ default := { past := True } }',
      docstring: 'A data instance',
    });
    expect(f.decls.filter((d) => d.error !== undefined)).toEqual([]);
    expectRecorded('extras-facts.json', f);

    // Again, with nothing changed: Lake replays the stored warning, and the facts are the same.
    const again = await refreshLeanFacts({ root, runId: SEMANTIC_RUN_ID });
    report('extras, unchanged', again);
    expect(again.status).toBe('ok');
    expect(again.build.messages).toEqual(f.build.messages);
    expect(again.modules).toEqual(f.modules);
    expect(again.decls).toEqual(f.decls);
    expect(await unitsOfRun(SEMANTIC_RUN_ID)).toEqual([]);
  });

  it('AT3.5: cancellation and a tiny timeout give cancelled / timeout with a detail and leave no scope behind', async () => {
    const cancelRoot = spyroCopy(tmp, 'cancel');
    const controller = new AbortController();
    const cancelled = await refreshLeanFacts({
      root: cancelRoot,
      runId: SEMANTIC_RUN_ID,
      signal: controller.signal,
      onPhase: (p) => {
        if (p === 'build') setTimeout(() => controller.abort(), 300);
      },
    });
    report('cancelled', cancelled);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.detail).toMatch(/cancelled (by caller|before start)/u);
    expect(cancelled.decls).toEqual([]);

    const timeoutRoot = spyroCopy(tmp, 'timeout');
    const timedOut = await refreshLeanFacts({ root: timeoutRoot, runId: SEMANTIC_RUN_ID, buildTimeoutMs: 50 });
    report('timeout', timedOut);
    expect(timedOut.status).toBe('timeout');
    expect(timedOut.detail).toBe('lake build: killed after 50 ms');
    expect(timedOut.build.status).toBe('timeout');
    expect(timedOut.check.status).toBe('skipped');

    expect(await unitsOfRun(SEMANTIC_RUN_ID)).toEqual([]);
    expect(processesMatching(cancelRoot)).toEqual([]);
    expect(processesMatching(timeoutRoot)).toEqual([]);
  });

  it('AT3.7: a source edited during the check makes its module stale', async () => {
    const root = spyroCopy(tmp, 'stale');
    const main = path.join(root, 'Model/Spyro/Main.lean');
    const before = readFileSync(main);
    const f = await refreshLeanFacts({
      root,
      runId: SEMANTIC_RUN_ID,
      onPhase: (p) => {
        if (p === 'check') appendFileSync(main, '\n-- edited while the check ran\n');
      },
    });
    report('stale', f);
    expect(f.status).toBe('ok');
    expect(states(f)).toEqual({ 'Model.Spyro.Vocabulary': 'fresh', 'Model.Spyro.Main': 'stale', Model: 'fresh' });
    const mainFacts = f.modules.find((m) => m.name === 'Model.Spyro.Main');
    expect(mainFacts?.sourceSha256).toBe(createHash('sha256').update(before).digest('hex')); // the text the build saw
    expect(f.detail).toBe('changed while the refresh ran (stale): Model/Spyro/Main.lean');
    expect(f.decls.map((d) => d.name)).toEqual([...VOCABULARY_NAMES, ...MAIN_NAMES]); // kept: core uses them by name only
  });

  it('AT3.9: a message column after a non-BMP character arrives as a UTF-16 character', async () => {
    const root = spyroCopy(tmp, 'nonbmp', 'nonbmp-error');
    const f = await refreshLeanFacts({ root, runId: SEMANTIC_RUN_ID });
    report('nonbmp', f);
    expect(f.status).toBe('build-errors');
    expect(f.build.messages).toEqual([
      {
        severity: 'error',
        file: 'Model/Spyro/Main.lean',
        module: 'Model.Spyro.Main',
        range: r(55, 31, 55, 31),
        text: 'Unknown identifier `undefinedThing`',
      },
    ]);
    const line = readFileSync(path.join(root, 'Model/Spyro/Main.lean'), 'utf8').split('\n')[55] ?? '';
    expect(line.slice(31)).toBe('undefinedThing'); // UTF-16 index into the JS string
  });

  it('check-errors: a declaration whose name cannot be written into the check file stays unchecked, the rest is checked', async () => {
    const root = spyroCopy(tmp, 'odd-name');
    const main = path.join(root, 'Model/Spyro/Main.lean');
    const text = readFileSync(main, 'utf8');
    const at = text.lastIndexOf('end Spyro');
    writeFileSync(main, `${text.slice(0, at)}def «odd name» : Nat := 1\n\n${text.slice(at)}`);
    const f = await refreshLeanFacts({ root, runId: SEMANTIC_RUN_ID });
    report('odd-name', f);
    expect(f.status).toBe('check-errors');
    expect(f.detail).toMatch(/^check: Spyro\.«odd name» was not checked: not a usable Lean declaration name/u);
    expect(f.check).toMatchObject({ status: 'ok', probed: 16 });
    const odd = decl(f, 'Spyro.«odd name»');
    expect(odd.kind).toBeUndefined();
    expect(odd.type).toBeUndefined();
    expect(f.decls.filter((d) => d.name !== odd.name).every((d) => d.kind !== undefined && d.type !== undefined)).toBe(true);
  });

  it('the memory guard runs again before the check spawn: low memory after the build skips the check', async () => {
    const root = spyroCopy(tmp, 'lowmem-check');
    const GiB = 1024 * MiB;
    let reads = 0;
    const phases: string[] = [];
    const f = await refreshLeanFacts({
      root,
      runId: SEMANTIC_RUN_ID,
      readMemAvailable: () => (++reads === 1 ? 64 * GiB : 1 * GiB),
      minAvailableBytes: 2 * GiB,
      onPhase: (p) => phases.push(p),
    });
    report('lowmem-check', f);
    expect(f.status).toBe('low-memory');
    expect(f.detail).toBe('MemAvailable dropped to 1.0 GiB after the build, below the 2.0 GiB threshold, so the check did not run');
    expect(f.build.status).toBe('ok');
    expect(f.check).toEqual({ status: 'skipped', durationMs: 0, probed: 0 });
    expect(phases).toEqual(['build']);
    expect(reads).toBe(2);
  });

  it('left no scope of this run and ~/.elan/known-projects untouched', async () => {
    expect(await unitsOfRun(SEMANTIC_RUN_ID)).toEqual([]);
    expect(knownProjectsLines()).toBe(knownBefore);
  });
});
