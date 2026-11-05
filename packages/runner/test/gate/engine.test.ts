/**
 * The Lean check engine with real Lean under runLean (M2 WP2), using simple fakes of WP1's core functions where the
 * engine's own mechanics are tested (the real rules are exercised by the [gated] ./rules.test.ts):
 * AT2.16 checkBase, AT2.6 (G0 starts no Lean; the job timeout is a counted budget finding), AT2.11 cancellation,
 * AT2.12 low memory, AT2.15 (RuleInput.base / adopted / roundStart), AT2.3 (incremental mirror builds), freeze and
 * gate mechanics (the freeze copy, the real comparator), checkGhost mechanics (AT2.9), AT2.10 renderStatements,
 * normalise mechanics (AT2.13). Every build happens in a scratch shadow; no `telelean-<runId>-*` unit is left.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { FileChange, LeanFacts, RuleInput } from '@telelean/core';

import { BASE_FACTS_FILE, createLeanCheckEngine, GHOST_NEEDS_FREEZE, type FreezeRecord, type LeanCheckEngine } from '../../src/gate/index.js';
import { cancelRun } from '../../src/lean/runLean.js';
import { resolveToolchain, toolchainExe } from '../../src/lean/toolchain.js';
import { runLean } from '../../src/lean/runLean.js';
import { refreshLeanFacts } from '../../src/semantic/index.js';
import type { RefreshRequest } from '../../src/semantic/types.js';
import { createRunShadow, openRunShadow, type ShadowWorkspace } from '../../src/shadow/index.js';
import { recordingHost, unitsOfRun } from '../semantic/helpers.js';
import {
  cleanupTempRoot,
  contextFor,
  editWs,
  fakeCheckFileChanges,
  fakeCore,
  fakeFreezeRecord,
  GiB,
  jobFor,
  knownProjectsLines,
  makeTempRoot,
  passingRules,
  PERMITTED_NORMATIVE,
  permittedAxioms,
  processesMatching,
  selection,
  SELECTED_ALL,
  SIGNATURE,
  spyroModelFiles,
  spyroRoot,
} from './helpers.js';

const runIdFor = (label: string): string => `wp2${label}${process.pid}`;

/** `#print axioms Spyro.cynder_not_good.holds` of the honest normative proof (M0: exactly these 11). */
const HONEST_FOOTPRINT = [
  'Classical.choice',
  'Spyro.Character',
  'Spyro.Character.exists',
  'Spyro.Game',
  'Spyro.Game.exists',
  'Spyro.GoodAddition',
  'Spyro.HasDarkPast',
  'Spyro.IsPG',
  'Spyro.cynder_dark_past.holds',
  'Spyro.new_spyro_pg.holds',
  'Spyro.pg_no_dark_past.holds',
];
/** Fact 7: the literal ghost check's footprint, 12 names. */
const LITERAL_GHOST_FOOTPRINT = [...HONEST_FOOTPRINT, 'Spyro.InGame'].sort();
const LITERAL_PERMITTED = permittedAxioms({ signature: [...SIGNATURE, 'Spyro.InGame'] });

const sorted = (xs: readonly string[] | undefined): string[] => [...(xs ?? [])].sort();

/** A refreshFacts that counts its calls and runs the real one. */
function countingRefresh(): { calls: () => number; refresh: (r: RefreshRequest) => Promise<LeanFacts> } {
  let n = 0;
  return {
    calls: () => n,
    refresh: (r) => {
      n++;
      return refreshLeanFacts(r);
    },
  };
}

let tmp: string;
let knownBefore: number | undefined;
beforeAll(() => {
  tmp = makeTempRoot('gate-engine');
  knownBefore = knownProjectsLines();
});
afterAll(async () => {
  expect(knownProjectsLines()).toBe(knownBefore);
  cleanupTempRoot(tmp);
});

async function newShadow(name: string, overlay?: string, runId = runIdFor(name), copyBuild = false): Promise<ShadowWorkspace> {
  return createRunShadow({ root: spyroRoot(tmp, name, overlay), runsDir: path.join(tmp, 'runs'), runId, library: 'Model', files: spyroModelFiles(overlay), copyBuild });
}

describe('checkBase (AT2.16)', () => {
  it('builds the Spyro copy: ok, B’s facts kept in the run dir and read back by a second engine; no G0 scan of the base', async () => {
    const runId = runIdFor('base');
    const shadow = await newShadow('base', undefined, runId);
    let g0Calls = 0;
    const engine = createLeanCheckEngine({ core: { checkFileChanges: () => (g0Calls++, []) } });
    const report = await engine.checkBase(contextFor(shadow, runId));
    expect(report.outcome).toBe('ok');
    expect(report.findings).toEqual([]);
    expect(report.facts?.status).toBe('ok');
    expect(report.facts?.decls.map((d) => d.name)).toContain('Spyro.cynder_not_good');
    expect(report.model?.nodes.get('cynder-not-good')?.statementDecl?.decl.fullName).toBe('Spyro.cynder_not_good');
    expect(g0Calls).toBe(0);
    expect(existsSync(path.join(shadow.paths.runDir, BASE_FACTS_FILE))).toBe(true);

    // A second engine, on the run dir opened again (recovery), sees B's facts in RuleInput.base.
    const reopened = await openRunShadow(shadow.paths.runDir, { root: shadow.root, library: 'Model' });
    let captured: RuleInput | undefined;
    const second = createLeanCheckEngine({
      core: { checkFileChanges: () => [], evaluateRules: (input) => ((captured = input), passingRules(input)) },
      refreshFacts: async () => report.facts as LeanFacts,
    });
    const check = await second.check(contextFor(reopened, runId));
    expect(check.outcome).toBe('ok');
    expect(captured?.base.facts).toEqual(report.facts);
    expect(captured?.base.files.get('Model/Spyro/Main.lean')?.text).toBe(spyroModelFiles().get('Model/Spyro/Main.lean'));
    expect(await unitsOfRun(runId)).toEqual([]);
  });

  it('a Lean error in another subject’s module: problems naming the file and the line, no facts kept', async () => {
    const runId = runIdFor('baseerr');
    const shadow = await newShadow('baseerr', 'broken-other', runId);
    const engine = createLeanCheckEngine({ core: { checkFileChanges: () => [] } });
    const report = await engine.checkBase(contextFor(shadow, runId));
    expect(report.outcome).toBe('problems');
    expect(report.findings.length).toBeGreaterThan(0);
    const first = report.findings[0];
    expect(first).toMatchObject({ step: 'G1', code: 'build', file: 'Model/Other/Main.lean' });
    expect(first?.range?.start.line).toBe(2);
    expect(first?.message).toMatch(/^Model\/Other\/Main\.lean:3:\d+: error: /u);
    expect(report.diagnostics.some((d) => d.file === 'Model/Other/Main.lean' && d.line === 3 && d.severity === 'error')).toBe(true);
    expect(existsSync(path.join(shadow.paths.runDir, BASE_FACTS_FILE))).toBe(false);
    expect(await unitsOfRun(runId)).toEqual([]);
  });
});

describe('check: G0, the build, budgets (AT2.6 parts that need no rules)', () => {
  let shadow: ShadowWorkspace;
  const runId = runIdFor('check');
  beforeAll(async () => {
    shadow = await newShadow('check', undefined, runId);
  });

  it('a G0 finding starts no Lean process (sorry, #eval, a stray notes.md)', async () => {
    for (const script of ['cheat-sorry', 'cheat-eval', 'stray-notes']) {
      editWs(shadow, 'formalise-normative', script);
      const counting = countingRefresh();
      const engine = createLeanCheckEngine({ core: fakeCore(), refreshFacts: counting.refresh });
      const report = await engine.check(contextFor(shadow, runId, { stage: 'prove' }));
      expect(report.outcome).toBe('problems');
      expect(report.g0.map((f) => f.code)).toEqual([script === 'cheat-sorry' ? 'sorry' : script === 'cheat-eval' ? 'hash-command' : 'bad-path']);
      expect(report.findings).toEqual([]);
      expect(report.facts).toBeUndefined();
      expect(counting.calls()).toBe(0);
      await shadow.revertTo((await shadow.lastCommit(['base']))?.id ?? '', 'reset', 1);
    }
    expect(await unitsOfRun(runId)).toEqual([]);
  });

  it('with clean G0 it syncs the mirror, builds, and hands the rules S with fresh facts (footprints, filtered diagnostics)', async () => {
    editWs(shadow, 'formalise-normative', 'prove-normative');
    let captured: RuleInput | undefined;
    const engine = createLeanCheckEngine({ core: fakeCore(permittedAxioms(), { evaluateRules: (i) => ((captured = i), passingRules(i)) }) });
    const report = await engine.check(contextFor(shadow, runId, { stage: 'prove', files: ['Model/Spyro/Vocabulary.lean'] }));
    expect(report.outcome).toBe('ok');
    expect(report.build?.status).toBe('ok');
    expect(sorted(report.rules?.footprints['Spyro.cynder_not_good.holds'])).toEqual(HONEST_FOOTPRINT);
    expect(captured?.purpose).toBe('check');
    expect(captured?.stage).toBe('prove');
    expect(captured?.current.facts?.status).toBe('ok');
    expect(captured?.current.freshFiles.has('Model/Spyro/Main.lean')).toBe(true);
    expect(captured?.base.files.get('Model/Spyro/Main.lean')?.text).toBe(spyroModelFiles().get('Model/Spyro/Main.lean'));
    expect(readFileSync(path.join(shadow.paths.build, 'Model/Spyro/Main.lean'), 'utf8')).toBe(readFileSync(path.join(shadow.paths.ws, 'Model/Spyro/Main.lean'), 'utf8'));
    expect(report.diagnostics.every((d) => d.file === 'Model/Spyro/Vocabulary.lean')).toBe(true);
  });

  it('never passes a build with Lean errors, even when the rules say nothing (whole message, file:line:col)', async () => {
    writeFileSync(path.join(shadow.paths.ws, 'Model/Spyro/Main.lean'), readFileSync(path.join(shadow.paths.ws, 'Model/Spyro/Main.lean'), 'utf8').replace('cynder_dark_past.holds\n', 'cynder_dark_past\n'));
    const engine = createLeanCheckEngine({ core: fakeCore() });
    const report = await engine.check(contextFor(shadow, runId, { stage: 'prove' }));
    expect(report.outcome).toBe('problems');
    expect(report.findings[0]).toMatchObject({ step: 'G1', code: 'build', file: 'Model/Spyro/Main.lean' });
    expect(report.findings[0]?.message).toMatch(/^Model\/Spyro\/Main\.lean:\d+:\d+: error: [^]*\n/u); // the whole message, several lines
    expect(report.diagnostics.some((d) => d.severity === 'error' && d.message.includes('\n'))).toBe(true);
    expect(await unitsOfRun(runId)).toEqual([]);
  });

  it('a job timeout on the slow fixture is a budget finding (counted), not an environment outcome', async () => {
    const slowId = runIdFor('slow');
    const slow = await newShadow('slow', 'slow', slowId);
    const engine = createLeanCheckEngine({ core: fakeCore() });
    const started = Date.now();
    const report = await engine.check(contextFor(slow, slowId, { job: jobFor(slowId, { leanJobMs: 4000 }) }));
    expect(report.outcome).toBe('problems');
    expect(report.environment).toBeUndefined();
    expect(report.findings.map((f) => [f.step, f.code])).toEqual([['G1', 'budget']]);
    expect(report.findings[0]?.message).toContain('4 s');
    expect(Date.now() - started).toBeLessThan(60_000);
    expect(await unitsOfRun(slowId)).toEqual([]);
    expect(processesMatching(slow.paths.build)).toEqual([]);
  });
});

describe('cancellation and low memory (AT2.11, AT2.12)', () => {
  it('lean.cancelRun(runId) during the build (onPhase build hook) gives an environment outcome and leaves no unit', async () => {
    const runId = runIdFor('cancel');
    const shadow = await newShadow('cancel', 'slow', runId);
    let phases = 0;
    const engine = createLeanCheckEngine({
      core: fakeCore(),
      refreshFacts: (r) =>
        refreshLeanFacts({
          ...r,
          onPhase: (p) => {
            phases++;
            if (p === 'build') setTimeout(() => void cancelRun(runId), 1500);
          },
        }),
    });
    const report = await engine.check(contextFor(shadow, runId));
    expect(phases).toBe(1);
    expect(report.outcome).toBe('environment');
    expect(report.environment).toBe('the Lean job was cancelled');
    expect(report.findings).toEqual([]);
    expect(await unitsOfRun(runId)).toEqual([]);
    expect(processesMatching(shadow.paths.build)).toEqual([]);
  });

  it('an injected low MemAvailable gives environment and spawns nothing (check, renderStatements)', async () => {
    const runId = runIdFor('lowmem');
    const shadow = await newShadow('lowmem', undefined, runId);
    const fake = recordingHost(path.join(tmp, 'fake-host-lowmem'));
    const job = jobFor(runId, { readMemAvailable: () => 1 * GiB, minAvailableBytes: 2 * GiB, host: fake.host });
    const engine = createLeanCheckEngine({ core: fakeCore() });
    const report = await engine.check(contextFor(shadow, runId, { job }));
    expect(report.outcome).toBe('environment');
    expect(report.environment).toMatch(/^the machine is low on memory, so telelean did not start Lean: MemAvailable is 1\.0 GiB/u);
    const rendered = await engine.renderStatements({ shadow, job }, ['Spyro.cynder_not_good']);
    expect(rendered[0]?.error).toMatch(/low on memory/u);
    const base = await engine.checkBase(contextFor(shadow, runId, { job }));
    expect(base.outcome).toBe('environment');
    expect(fake.calls()).toEqual([]);
  });
});

describe('RuleInput: B, A and the round start (AT2.15, fake evaluateRules)', () => {
  it('B = the base commit (or ctx.baseCommit, e.g. accept-base, without facts); A = the newest adopt commit; roundStart = ctx.roundStartCommit', async () => {
    const runId = runIdFor('inputs');
    const shadow = await newShadow('inputs', undefined, runId);
    const main = 'Model/Spyro/Main.lean';
    const text = (): string => readFileSync(path.join(shadow.paths.ws, main), 'utf8');
    const write = async (suffix: string): Promise<void> => {
      const before = text();
      await shadow.writeFiles([{ path: main, before, after: `${before}-- ${suffix}\n` }]);
    };
    await write('adopted once');
    const adopt1 = await shadow.commit('adopt', 'Adopted 1', 2);
    await write('adopted twice');
    const adopt2 = await shadow.commit('adopt', 'Adopted 2', 3);
    await write('the user edited this during the run');
    const acceptBase = await shadow.commit('accept-base', 'Your files at Accept', 3);
    const inputs: RuleInput[] = [];
    const facts = { format: 'telelean-lean-facts', version: 1, toolchain: 'leanprover/lean4:v4.35.0', library: 'Model', startedAt: '', finishedAt: '', status: 'ok', build: { status: 'ok', durationMs: 0, messages: [], failedModules: [] }, check: { status: 'ok', durationMs: 0, probed: 0 }, modules: [], decls: [] } satisfies LeanFacts;
    const engine = createLeanCheckEngine({ core: fakeCore(permittedAxioms(), { evaluateRules: (i) => (inputs.push(i), passingRules(i)) }), refreshFacts: async () => facts });
    await engine.check(contextFor(shadow, runId, { roundStartCommit: adopt1.id, teleleanBlocks: ['ghost-node'] }));
    await engine.check(contextFor(shadow, runId, { baseCommit: acceptBase.id }));
    const [first, second] = inputs;
    expect(first?.base.files.get(main)?.text).toBe((await shadow.baseFiles()).get(main));
    expect(first?.adopted?.files.get(main)?.text).toBe((await shadow.filesAt(adopt2.id)).get(main));
    expect(first?.roundStart?.files.get(main)?.text).toBe((await shadow.filesAt(adopt1.id)).get(main));
    expect(first?.teleleanBlocks).toEqual(['ghost-node']);
    expect(first?.current.files.get(main)?.text).toBe(text());
    expect(second?.base.files.get(main)?.text).toBe((await shadow.filesAt(acceptBase.id)).get(main));
    expect(second?.base.facts).toBeUndefined();
    expect(second?.adopted?.files.get(main)?.text).toBe((await shadow.filesAt(adopt2.id)).get(main));
    expect(second?.roundStart).toBeUndefined();

    // A freeze is judged without the previous round's freeze (adoption re-freeze, Accept's re-check).
    let frozenInput: RuleInput | undefined;
    const refusing = createLeanCheckEngine({
      core: fakeCore(permittedAxioms(), {
        evaluateRules: (i) => ((frozenInput = i), { ...passingRules(i), findings: [{ step: 'G3', code: 'markup', message: 'stop here' }] }),
      }),
      refreshFacts: async () => facts,
    });
    const previous = fakeFreezeRecord(adopt1, permittedAxioms());
    const refused = await refusing.freeze(contextFor(shadow, runId, { freeze: previous, round: 3 }));
    expect(refused.ok).toBe(false);
    expect(frozenInput?.purpose).toBe('freeze');
    expect(frozenInput?.freeze).toBeUndefined();
    // ... while check and gate do see the round's freeze.
    await engine.check(contextFor(shadow, runId, { freeze: previous, stage: 'prove' }));
    expect(inputs.at(-1)?.freeze).toEqual(previous.snapshot);
  });

  it('a shadow git failure (an unknown base commit) is an environment outcome, never an exception', async () => {
    const runId = runIdFor('gitfail');
    const shadow = await newShadow('gitfail', undefined, runId);
    const engine = createLeanCheckEngine({ core: fakeCore(), refreshFacts: async () => { throw new Error('no Lean expected'); } });
    const bogus = '0'.repeat(40);
    const report = await engine.check(contextFor(shadow, runId, { baseCommit: bogus }));
    expect(report.outcome).toBe('environment');
    expect(report.environment).toMatch(/^telelean could not use its working copy: git ls-tree failed/u);
    const frozen = await engine.freeze(contextFor(shadow, runId, { baseCommit: bogus }));
    expect(frozen.ok).toBe(false);
    expect(frozen.ok ? undefined : frozen.environment).toMatch(/git ls-tree failed/u);
    const gated = await engine.gate({ ...contextFor(shadow, runId, { baseCommit: bogus }), status: 'not_proved' });
    expect(gated).toMatchObject({ passed: false, findings: [] });
    expect(gated.environment).toMatch(/git ls-tree failed/u);
  });
});

describe('normalise (AT2.13 mechanics, fake normalisationChanges)', () => {
  it('asks core only for the selection’s statements new since B, writes and commits `normalise`, and is idempotent', async () => {
    const runId = runIdFor('norm');
    const shadow = await newShadow('norm', undefined, runId);
    editWs(shadow, 'formalise-normative');
    const asked: string[][] = [];
    const pin = 'stance: rule\nasserted: 2026-11-01\nlean: Spyro.pg_no_dark_past\n';
    const normalisationChanges = (model: { files: ReadonlyMap<string, { text: string }> }, ids: readonly string[]): FileChange[] => {
      asked.push([...ids]);
      const text = model.files.get('Model/Spyro/Main.lean')?.text ?? '';
      if (text.includes(pin)) return [];
      return [{ path: 'Model/Spyro/Main.lean', before: text, after: text.replace('stance: rule\nasserted: 2026-11-01\n', pin) }];
    };
    const engine = createLeanCheckEngine({ core: fakeCore(permittedAxioms(), { normalisationChanges: normalisationChanges as never }) });
    const first = await engine.normalise(contextFor(shadow, runId, { stage: 'prove' }));
    expect(asked).toEqual([['pg-no-dark-past']]);
    expect(first.changes).toHaveLength(1);
    expect(first.commit?.kind).toBe('normalise');
    expect(readFileSync(path.join(shadow.paths.ws, 'Model/Spyro/Main.lean'), 'utf8')).toContain(pin);
    const count = (await shadow.commits()).length;
    const second = await engine.normalise(contextFor(shadow, runId, { stage: 'prove' }));
    expect(second).toEqual({ changes: [] });
    expect(await shadow.commits()).toHaveLength(count);
  });
});

describe('the mirror builds incrementally (AT2.3 with Lean)', () => {
  it('a second build after an empty sync recompiles 0 modules; a changed module rebuilds only itself and its dependents', async () => {
    const runId = runIdFor('mirror');
    const shadow = await newShadow('mirror', undefined, runId);
    const lake = toolchainExe(resolveToolchain(), 'lake');
    const build = async (): Promise<string[]> => {
      const r = await runLean({ shadowDir: shadow.paths.build, argv: [lake, 'build'], runId });
      expect(r.status).toBe('ok');
      return r.stdout.split('\n').filter((l) => /Built /u.test(l));
    };
    expect(await shadow.syncMirror()).toEqual({ copied: [], removed: [] });
    expect((await build()).length).toBeGreaterThan(0);
    const mtime = statSync(path.join(shadow.paths.build, 'Model/Spyro/Vocabulary.lean')).mtimeMs;
    expect(await shadow.syncMirror()).toEqual({ copied: [], removed: [] });
    expect(await build()).toEqual([]);
    editWs(shadow, 'formalise-normative');
    expect((await shadow.syncMirror()).copied).toEqual(['Model/Spyro/Main.lean']);
    const rebuilt = (await build()).join('\n');
    expect(rebuilt).toContain('Model.Spyro.Main');
    expect(rebuilt).not.toContain('Model.Spyro.Vocabulary');
    expect(statSync(path.join(shadow.paths.build, 'Model/Spyro/Vocabulary.lean')).mtimeMs).toBe(mtime);
    expect(await unitsOfRun(runId)).toEqual([]);
  });
});

describe('freeze and gate mechanics (fake rules, real challenge and comparator)', () => {
  const runId = runIdFor('fg');
  let shadow: ShadowWorkspace;
  let engine: LeanCheckEngine;
  let record: FreezeRecord;

  beforeAll(async () => {
    shadow = await newShadow('fg', undefined, runId);
    engine = createLeanCheckEngine({ core: fakeCore(permittedAxioms()) });
    expect((await engine.checkBase(contextFor(shadow, runId))).outcome).toBe('ok');
    editWs(shadow, 'formalise-normative');
  });

  it('freezes: commit `freeze`, the permitted set, frozen.ndjson, the challenge module in a copy (never in ws/)', async () => {
    const outcome = await engine.freeze(contextFor(shadow, runId));
    if (!outcome.ok) throw new Error(`freeze refused: ${outcome.refusals.join('; ')}`);
    record = outcome.record;
    expect(record.commit.kind).toBe('freeze');
    expect(record.round).toBe(1);
    expect(record.snapshot.permitted.all).toEqual(PERMITTED_NORMATIVE);
    expect(record.freeze.permittedAxioms).toEqual(PERMITTED_NORMATIVE);
    expect(record.freeze.theoremNames).toEqual(['Spyro.cynder_not_good.holds']);
    expect(statSync(record.freeze.exportPath).size).toBeGreaterThan(0);
    expect(record.freeze.exportPath).toBe(path.join(shadow.paths.frozenDir, '1', 'frozen.ndjson'));
    const copy = path.join(shadow.paths.frozenDir, '1', 'project');
    expect(readFileSync(path.join(copy, 'Model/TeleleanChallenge.lean'), 'utf8')).toContain('theorem Spyro.cynder_not_good.holds : Spyro.cynder_not_good := sorry');
    expect(existsSync(path.join(copy, '.lake'))).toBe(false);
    expect(existsSync(path.join(shadow.paths.ws, 'Model/TeleleanChallenge.lean'))).toBe(false);
    expect(existsSync(path.join(shadow.paths.build, 'Model/TeleleanChallenge.lean'))).toBe(false);
    expect(await shadow.filesAt(record.commit.id)).toEqual(await shadow.currentFiles());
  });

  it('a refused freeze commits nothing and runs no challenge', async () => {
    const count = (await shadow.commits()).length;
    const refusing = createLeanCheckEngine({
      core: fakeCore(permittedAxioms(), {
        evaluateRules: (i) => ({ ...passingRules(i), findings: [{ step: 'G3', code: 'not-formalised', message: 'pg-no-dark-past has no statement' }] }),
      }),
    });
    const outcome = await refusing.freeze(contextFor(shadow, runId));
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? [] : outcome.refusals).toEqual(['pg-no-dark-past has no statement']);
    expect(await shadow.commits()).toHaveLength(count);
    expect(existsSync(path.join(shadow.paths.frozenDir, '2'))).toBe(false);
  });

  it('gate(proved) on the honest proof: G4 accepted, footprint, judged commit = exactly ws/', async () => {
    editWs(shadow, 'prove-normative');
    const report = await engine.gate({ ...contextFor(shadow, runId, { stage: 'prove', freeze: record }), status: 'proved' });
    expect(report.findings).toEqual([]);
    expect(report.environment).toBeUndefined();
    expect(report.comparator).toEqual({ verdict: 'accepted' });
    expect(report.passed).toBe(true);
    expect(sorted(report.footprint)).toEqual(HONEST_FOOTPRINT);
    expect(report.commit?.kind).toBe('checkpoint');
    expect(await shadow.filesAt(report.commit?.id ?? '')).toEqual(await shadow.currentFiles());
    // The same state again: the same judged commit, no new one.
    const count = (await shadow.commits()).length;
    const again = await engine.gate({ ...contextFor(shadow, runId, { stage: 'prove', freeze: record }), status: 'proved' });
    expect(again.commit?.id).toBe(report.commit?.id);
    expect(await shadow.commits()).toHaveLength(count);
  });

  it('gate(not_proved) never runs the comparator; gate(proved) without a freeze is not-frozen', async () => {
    const other = await engine.gate({ ...contextFor(shadow, runId, { stage: 'prove', freeze: record }), status: 'not_proved' });
    expect(other.passed).toBe(true);
    expect(other.comparator).toBeUndefined();
    expect(other.footprint).toBeUndefined();
    const unfrozen = await engine.gate({ ...contextFor(shadow, runId, { stage: 'prove' }), status: 'proved' });
    expect(unfrozen.passed).toBe(false);
    expect(unfrozen.findings.map((f) => f.code)).toEqual(['not-frozen']);
    expect(unfrozen.comparator).toBeUndefined();
  });

  it('G4 rejects a weakened goal abbrev (definition mismatch, M0 wording) and an unselected assumption (illegal axiom)', async () => {
    await shadow.revertTo(record.commit.id, 'back to the freeze', 1);
    editWs(shadow, 'cheat-weakened-abbrev');
    const weakened = await engine.gate({ ...contextFor(shadow, runId, { stage: 'prove', freeze: record }), status: 'proved' });
    expect(weakened.passed).toBe(false);
    expect(weakened.comparator).toMatchObject({ verdict: 'rejected', reason: 'definition-mismatch' });
    expect(weakened.findings.map((f) => [f.step, f.code])).toEqual([['G4', 'comparator-definition-mismatch']]);
    expect(weakened.findings[0]?.message).toContain('a definition the frozen statement depends on changed: `Spyro.cynder_not_good`');

    await shadow.revertTo(record.commit.id, 'back to the freeze', 1);
    const partial = permittedAxioms({ selected: SELECTED_ALL.filter((a) => a !== 'Spyro.new_spyro_pg.holds') });
    const partialEngine = createLeanCheckEngine({ core: fakeCore(partial) });
    const unselected = selection(['cynder-dark-past', 'pg-no-dark-past']);
    const frozen = await partialEngine.freeze(contextFor(shadow, runId, { selection: unselected }));
    if (!frozen.ok) throw new Error(`freeze refused: ${frozen.refusals.join('; ')}`);
    editWs(shadow, 'prove-normative');
    const report = await partialEngine.gate({ ...contextFor(shadow, runId, { stage: 'prove', selection: unselected, freeze: frozen.record }), status: 'proved' });
    expect(report.comparator).toMatchObject({ verdict: 'rejected', reason: 'illegal-axiom', names: ['Spyro.new_spyro_pg.holds'] });
    expect(report.findings.map((f) => f.code)).toEqual(['comparator-illegal-axiom']);
    expect(report.findings[0]?.names).toEqual(['Spyro.new_spyro_pg.holds']);
  });

  it('a comparator that cannot judge (the export is gone) is environment, not a finding', async () => {
    const missing = fakeFreezeRecord(record.commit, permittedAxioms());
    const report = await engine.gate({ ...contextFor(shadow, runId, { stage: 'prove', freeze: missing }), status: 'proved' });
    expect(report.passed).toBe(false);
    expect(report.findings).toEqual([]);
    expect(report.environment).toMatch(/^the comparator could not run/u);
    expect(await unitsOfRun(runId)).toEqual([]);
  });

  it('a G0 finding in the gate starts no Lean and judges (commits) the state anyway', async () => {
    editWs(shadow, 'stray-notes');
    const counting = countingRefresh();
    const g0Engine = createLeanCheckEngine({ core: fakeCore(permittedAxioms()), refreshFacts: counting.refresh });
    const report = await g0Engine.gate({ ...contextFor(shadow, runId, { stage: 'prove', freeze: record }), status: 'proved' });
    expect(report.passed).toBe(false);
    expect(report.findings.map((f) => [f.step, f.code])).toEqual([['G0', 'bad-path']]);
    expect(report.environment).toBeUndefined();
    expect(counting.calls()).toBe(0);
    expect((await shadow.filesAt(report.commit?.id ?? '')).has('Model/Spyro/notes.md')).toBe(true);
  });
});

describe('the freeze copy drops the target’s .holds and its users (fake rules)', () => {
  it('a target .holds already in ws/ (as in Accept’s re-check) is absent from the copy and the challenge builds', async () => {
    const runId = runIdFor('fzholds');
    const shadow = await newShadow('fzholds', 'proved-derivation', runId);
    const engine = createLeanCheckEngine({ core: fakeCore(permittedAxioms()) });
    const outcome = await engine.freeze(contextFor(shadow, runId));
    if (!outcome.ok) throw new Error(`freeze refused: ${outcome.refusals.join('; ')}`);
    const copyMain = readFileSync(path.join(shadow.paths.frozenDir, '1', 'project', 'Model/Spyro/Main.lean'), 'utf8');
    expect(copyMain).not.toContain('theorem cynder_not_good.holds');
    expect(copyMain).toContain('abbrev cynder_not_good : Prop');
    expect(readFileSync(path.join(shadow.paths.ws, 'Model/Spyro/Main.lean'), 'utf8')).toContain('theorem cynder_not_good.holds');
    expect(statSync(outcome.record.freeze.exportPath).size).toBeGreaterThan(0);
  });

  it('a pending promotion whose claimed .holds another proof uses: both are absent from the copy and the challenge builds', async () => {
    const runId = runIdFor('fzpending');
    const shadow = await newShadow('fzpending', 'pending', runId);
    const engine = createLeanCheckEngine({ core: fakeCore(permittedAxioms()) });
    const outcome = await engine.freeze(contextFor(shadow, runId));
    if (!outcome.ok) throw new Error(`freeze refused: ${outcome.refusals.join('; ')}`);
    const copyMain = readFileSync(path.join(shadow.paths.frozenDir, '1', 'project', 'Model/Spyro/Main.lean'), 'utf8');
    expect(copyMain).not.toContain('axiom cynder_not_good.holds');
    expect(copyMain).not.toContain('cynder_not_good_again');
    expect(copyMain).not.toContain('the same conclusion, restated');
    expect(statSync(outcome.record.freeze.exportPath).size).toBeGreaterThan(0);
    expect(await unitsOfRun(runId)).toEqual([]);
  });
});

describe('checkGhost mechanics (AT2.9 with fake rules) and renderStatements (AT2.10)', () => {
  const runId = runIdFor('ghost');
  let shadow: ShadowWorkspace;
  let record: FreezeRecord;
  let counting: ReturnType<typeof countingRefresh>;
  let engine: LeanCheckEngine;

  beforeAll(async () => {
    shadow = await newShadow('ghost', undefined, runId);
    counting = countingRefresh();
    engine = createLeanCheckEngine({ core: fakeCore(LITERAL_PERMITTED), refreshFacts: counting.refresh });
    editWs(shadow, 'formalise-literal');
    const outcome = await engine.freeze(contextFor(shadow, runId));
    if (!outcome.ok) throw new Error(`freeze refused: ${outcome.refusals.join('; ')}`);
    record = outcome.record;
  });
  const ghostCtx = () => contextFor(shadow, runId, { stage: 'prove', freeze: record });

  it('the literal ghost closes the gap: fact 7’s footprint, not alone-entailing, statement collapsed; the clean mirror is reused', async () => {
    const before = counting.calls();
    const result = await engine.checkGhost(ghostCtx(), {
      naturalName: 'A character who cannot be in a game would not be a good addition to it',
      leanStatement: '∀ (c : Character) (g : Game),\n  ¬ InGame c g   →  ¬ GoodAddition c g',
      proof: 'fun h => h cynder newSpyro (pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds)',
    });
    if (!result.ok) throw new Error(result.problems.join('\n'));
    expect(sorted(result.footprint)).toEqual(LITERAL_GHOST_FOOTPRINT);
    expect(result.aloneEntails).toBe(false);
    expect(result.statement).toBe('∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g');
    expect(counting.calls()).toBe(before); // the freeze's clean check of exactly these files was reused
  });

  it('`¬ GoodAddition cynder newSpyro` with `fun h => h` alone entails the goal', async () => {
    const result = await engine.checkGhost(ghostCtx(), { naturalName: 'Cynder would not be good', leanStatement: '¬ GoodAddition cynder newSpyro', proof: 'fun h => h' });
    expect(result).toMatchObject({ ok: true, aloneEntails: true, statement: '¬ GoodAddition cynder newSpyro' });
  });

  it('a proof resting on an unselected .holds is refused with the axiom named', async () => {
    const partial = permittedAxioms({ signature: [...SIGNATURE, 'Spyro.InGame'], selected: SELECTED_ALL.filter((a) => a !== 'Spyro.new_spyro_pg.holds') });
    const freeze = { ...record, snapshot: { ...record.snapshot, permitted: partial } };
    const result = await engine.checkGhost(contextFor(shadow, runId, { stage: 'prove', freeze, selection: selection(['cynder-dark-past', 'pg-no-dark-past']) }), {
      naturalName: 'x',
      leanStatement: '∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g',
      proof: 'fun h => h cynder newSpyro (pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds)',
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.problems.join('\n')).toContain('`Spyro.new_spyro_pg.holds`');
  });

  it('before the freeze, and on a single-term problem, it refuses without starting Lean', async () => {
    const fake = recordingHost(path.join(tmp, 'fake-host-ghost'));
    const job = jobFor(runId, { host: fake.host });
    const early = await engine.checkGhost(contextFor(shadow, runId, { stage: 'prove', job }), { naturalName: 'x', leanStatement: 'True', proof: 'fun _ => trivial' });
    expect(early).toEqual({ ok: false, problems: [GHOST_NEEDS_FREEZE] });
    const strict = createLeanCheckEngine({ core: fakeCore(LITERAL_PERMITTED, { ghostTextProblems: () => ['The statement contains a forbidden token (`sorry`).'] }) });
    const refused = await strict.checkGhost(contextFor(shadow, runId, { stage: 'prove', job, freeze: record }), { naturalName: 'x', leanStatement: 'sorry', proof: 'fun h => h' });
    expect(refused).toEqual({ ok: false, problems: ['The statement contains a forbidden token (`sorry`).'] });
    expect(fake.calls()).toEqual([]);
  });

  it('fact 8’s injected statement, let through by a permissive single-term rule, is refused because the pinned file has errors', async () => {
    const result = await engine.checkGhost(ghostCtx(), {
      naturalName: 'injected',
      leanStatement: 'True) → True := fun _ => trivial\naxiom evil : False\nexample : (True',
      proof: 'fun h => h',
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.problems.join('\n')).toMatch(/Lean error in the suggested statement/u);
  });

  it('renders the review’s pretty and explicit forms of pg_no_dark_past (explicit shows `Not (`), and an error for a missing name', async () => {
    const rendered = await engine.renderStatements({ shadow, job: jobFor(runId) }, ['Spyro.pg_no_dark_past', 'Spyro.no_such_statement']);
    expect(rendered[0]?.name).toBe('Spyro.pg_no_dark_past');
    expect(rendered[0]?.error).toBeUndefined();
    expect(rendered[0]?.pretty).toContain('¬Spyro.InGame c g');
    expect(rendered[0]?.explicit).toContain('Not (Spyro.InGame c g)');
    expect(rendered[0]?.pretty).not.toContain('Not (');
    expect(rendered[1]).toMatchObject({ name: 'Spyro.no_such_statement', pretty: '', explicit: '' });
    expect(rendered[1]?.error).toMatch(/Unknown constant/u);
    expect(await unitsOfRun(runId)).toEqual([]);
  });

  it('a check with problems refuses the ghost with them (Lean never sees the ghost)', async () => {
    editWs(shadow, 'stray-notes');
    const result = await engine.checkGhost(ghostCtx(), { naturalName: 'x', leanStatement: '¬ GoodAddition cynder newSpyro', proof: 'fun h => h' });
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.problems.slice(1)).toEqual([fakeCheckFileChanges(await shadow.baseFiles(), await shadow.currentFiles())[0]?.message]);
  });
});
