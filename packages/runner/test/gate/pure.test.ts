/**
 * The engine's pure parts (M2 WP2): every ComparatorVerdict reason mapped to its finding (AT2.8's pure test), facts
 * statuses to budget/environment outcomes (plan 3.6), diagnostics, the fail-closed build findings, the freeze copy's
 * removal closure and `removeDeclarations`, and the ghost / render scratch files (facts 4, 7 and 8 of the plan).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { UNSEEN_PROOF, type DeclFacts, type GateFinding, type LeanFacts } from '@telelean/core';

import {
  buildErrorFindings,
  classifyFacts,
  COMPARATOR_FINDING_CODES,
  comparatorFindings,
  diagnosticsOf,
  filesKey,
  ghostScratchSource,
  parseNamedAxiomsMessage,
  PROBE_OUT_OF_MEMORY,
  probeOomEnvironment,
  projectModulesOf,
  readGhostScratch,
  readRenderScratch,
  removalClosure,
  renderScratchSource,
  unseenProofEnvironment,
} from '../../src/gate/index.js';
import { ghostDirectProblems } from '../../src/gate/engine.js';
import { removeDeclarations, type ComparatorVerdict, type RejectionReason } from '../../src/lean/comparator.js';
import type { LeanMessage } from '../../src/lean/footprint.js';
import { valueProbeLines } from '../../src/semantic/checkFile.js';
import { cleanupTempRoot, makeTempRoot } from './helpers.js';

const range = (line: number, character: number) => ({ start: { line, character }, end: { line, character } });

function facts(over: Partial<LeanFacts> = {}): LeanFacts {
  return {
    format: 'telelean-lean-facts',
    version: 1,
    toolchain: 'leanprover/lean4:v4.35.0',
    library: 'Model',
    startedAt: '2026-11-01T00:00:00.000Z',
    finishedAt: '2026-11-01T00:00:01.000Z',
    status: 'ok',
    build: { status: 'ok', durationMs: 1, messages: [], failedModules: [] },
    check: { status: 'ok', durationMs: 1, probed: 0 },
    modules: [],
    decls: [],
    ...over,
  };
}

function decl(name: string, refs: string[] = [], extra: Partial<DeclFacts> = {}): DeclFacts {
  return {
    name,
    module: 'Model.Spyro.Main',
    file: 'Model/Spyro/Main.lean',
    range: range(0, 0),
    selectionRange: range(0, 0),
    refs: refs.map((r) => ({ name: r, module: 'Model.Spyro.Main', range: range(0, 0) })),
    ...extra,
  };
}

describe('G4: comparator verdicts as findings', () => {
  const rejected = (reason: RejectionReason, names: string[] = ['Spyro.x']): ComparatorVerdict => ({ verdict: 'rejected', reason, names, message: `comparator says ${reason}` });

  it('maps every rejection reason to its comparator-* code with the names', () => {
    const reasons: RejectionReason[] = ['illegal-axiom', 'statement-mismatch', 'definition-mismatch', 'kind-mismatch', 'missing-declaration', 'kernel-rejected', 'build-failed', 'export-failed'];
    expect(Object.keys(COMPARATOR_FINDING_CODES).sort()).toEqual([...reasons].sort());
    const codes = reasons.map((reason) => {
      const out = comparatorFindings(rejected(reason), 120_000);
      expect(out.environment).toBeUndefined();
      expect(out.findings).toHaveLength(1);
      expect(out.findings[0]).toMatchObject({ step: 'G4', names: ['Spyro.x'] });
      return out.findings[0]?.code;
    });
    expect(codes).toEqual([
      'comparator-illegal-axiom',
      'comparator-statement-mismatch',
      'comparator-definition-mismatch',
      'comparator-kind-mismatch',
      'comparator-missing',
      'comparator-kernel',
      'comparator-build',
      'comparator-export',
    ]);
    // M0 lesson 2 wording for a weakened goal abbrev.
    expect(comparatorFindings(rejected('definition-mismatch', ['Spyro.cynder_not_good']), 1).findings[0]?.message).toContain(
      'a definition the frozen statement depends on changed: `Spyro.cynder_not_good`',
    );
    expect(comparatorFindings(rejected('illegal-axiom', ['Spyro.new_spyro_pg.holds']), 1).findings[0]?.message).toContain('`Spyro.new_spyro_pg.holds`');
    expect(comparatorFindings(rejected('kernel-rejected', []), 1).findings[0]?.names).toBeUndefined();
  });

  it('accepted -> nothing; could-not-start and cancelled -> environment; timeout and oom -> budget (counted)', () => {
    expect(comparatorFindings({ verdict: 'accepted' }, 1)).toEqual({ findings: [] });
    expect(comparatorFindings({ verdict: 'could-not-start', message: 'the sandbox could not start: x' }, 1)).toEqual({
      findings: [],
      environment: 'the comparator could not run: the sandbox could not start: x',
    });
    expect(comparatorFindings({ verdict: 'incomplete', reason: 'cancelled', message: 'c' }, 1).environment).toBe('the comparator check was cancelled');
    for (const reason of ['timeout', 'oom'] as const) {
      const out = comparatorFindings({ verdict: 'incomplete', reason, message: 'killed after 120000 ms' }, 120_000);
      expect(out.environment).toBeUndefined();
      expect(out.findings.map((f) => [f.step, f.code])).toEqual([['G4', 'budget']]);
    }
    expect(comparatorFindings({ verdict: 'incomplete', reason: 'timeout', message: 'm' }, 120_000).findings[0]?.message).toContain('120 s');
  });
});

describe('facts statuses (plan 3.6)', () => {
  it('lets Lean results through, turns timeout/oom into budget and the rest into environment', () => {
    for (const status of ['ok', 'build-errors', 'check-errors'] as const) expect(classifyFacts(facts({ status }), 120_000)).toEqual({ kind: 'ok' });
    const timeout = classifyFacts(facts({ status: 'timeout', detail: 'lake build: killed after 3000 ms' }), 3000);
    expect(timeout.kind).toBe('budget');
    expect(timeout.kind === 'budget' ? [timeout.finding.step, timeout.finding.code] : []).toEqual(['G1', 'budget']);
    expect(timeout.kind === 'budget' ? timeout.finding.message : '').toContain('3 s');
    expect(classifyFacts(facts({ status: 'oom' }), 1).kind).toBe('budget');
    // Fixer 2b3a r1 (S-V2B3A-S1, AP-33): the isolated probe's own job ran out of memory (refresh's `oom` with the probe's
    // marker `oom`): telelean's environment, not counted; the probe's timeout, and an oom without that marker, stay budget.
    const probeOom = facts({ status: 'oom', detail: 'probe: memory cap 1024M exceeded', probe: { status: 'oom', durationMs: 5 } });
    expect(classifyFacts(probeOom, 1)).toEqual({ kind: 'environment', message: `${PROBE_OUT_OF_MEMORY} (probe: memory cap 1024M exceeded)` });
    expect(probeOomEnvironment(probeOom)).toBe("telelean's probe ran out of memory, so telelean could not read what the declarations of this state use in Lean (probe: memory cap 1024M exceeded)");
    expect(classifyFacts(facts({ status: 'oom', detail: '  ', probe: { status: 'oom', durationMs: 5 } }), 1)).toEqual({ kind: 'environment', message: PROBE_OUT_OF_MEMORY });
    expect(classifyFacts(facts({ status: 'timeout', probe: { status: 'timeout', durationMs: 5 } }), 1).kind).toBe('budget');
    for (const probe of ['ok', 'cut', 'failed'] as const) expect(classifyFacts(facts({ status: 'oom', probe: { status: probe, durationMs: 5 } }), 1).kind, probe).toBe('budget');
    expect(probeOomEnvironment(facts({ status: 'check-errors', probe: { status: 'oom', durationMs: 5 } }))).toBeUndefined();
    const env = (status: LeanFacts['status'], detail?: string): string => {
      const out = classifyFacts(facts({ status, ...(detail !== undefined ? { detail } : {}) }), 1);
      return out.kind === 'environment' ? out.message : `not environment: ${out.kind}`;
    };
    expect(env('could-not-start', 'bwrap missing')).toBe('the Lean sandbox could not start: bwrap missing');
    expect(env('low-memory', 'MemAvailable is 1.0 GiB')).toBe('the machine is low on memory, so telelean did not start Lean: MemAvailable is 1.0 GiB');
    expect(env('cancelled')).toBe('the Lean job was cancelled');
    expect(env('unsupported-toolchain', 'x')).toBe('telelean cannot check this project: x');
    expect(env('unsupported-project')).toBe('telelean cannot check this project');
  });

  it('slice 1e fixer: B.2 refusing only because the proof could not be seen is an environment outcome (not counted), never with other findings', () => {
    const sourceOnly: GateFinding = { step: 'G3', code: 'undeclared-premise', message: UNSEEN_PROOF, names: ['Spyro.t.holds'], nodeId: 't', token: 'source-only' };
    const probe = 'check: the value probe could not run: importing Lean.CoreM and Lean.Util.FoldConsts failed (1:0: x)';
    expect(unseenProofEnvironment([sourceOnly])).toBe(UNSEEN_PROOF);
    expect(unseenProofEnvironment([sourceOnly, { ...sourceOnly }], probe)).toBe(`${UNSEEN_PROOF} (${probe})`);
    expect(unseenProofEnvironment([sourceOnly], `${'x'.repeat(400)}\n`)).toBe(`${UNSEEN_PROOF} (${'x'.repeat(299)}…)`);
    // Anything Claude can fix keeps the attempt Claude's: a failed build (which also leaves the facts stale), a card
    // the proof uses without its arrow (B.2's other tokens), or nothing at all.
    const build: GateFinding = { step: 'G1', code: 'build', message: 'Model/Spyro/Main.lean:3:0: error: x' };
    expect(unseenProofEnvironment([build, sourceOnly], probe)).toBeUndefined();
    expect(unseenProofEnvironment([{ ...sourceOnly, token: 'unselected', nodeId: 'l' }])).toBeUndefined();
    expect(unseenProofEnvironment([])).toBeUndefined();
  });

  it('keeps whole Lean messages as diagnostics, filtered to the requested files', () => {
    const f = facts({
      status: 'build-errors',
      build: {
        status: 'failed',
        durationMs: 1,
        failedModules: ['Model.Spyro.Main'],
        messages: [
          { severity: 'error', file: 'Model/Spyro/Main.lean', range: range(56, 4), text: 'type mismatch\n  h\nhas type\n  A : Prop\nbut is expected to have type\n  B : Prop' },
          { severity: 'warning', file: 'Model/Spyro/Vocabulary.lean', range: range(2, 0), text: 'unused variable' },
        ],
      },
    });
    expect(diagnosticsOf(f)).toEqual([
      { file: 'Model/Spyro/Main.lean', line: 57, column: 4, severity: 'error', message: 'type mismatch\n  h\nhas type\n  A : Prop\nbut is expected to have type\n  B : Prop' },
      { file: 'Model/Spyro/Vocabulary.lean', line: 3, column: 0, severity: 'warning', message: 'unused variable' },
    ]);
    expect(diagnosticsOf(f, ['Model/Spyro/Vocabulary.lean']).map((d) => d.line)).toEqual([3]);
    expect(buildErrorFindings(f)).toEqual([
      {
        step: 'G1',
        code: 'build',
        message: 'Model/Spyro/Main.lean:57:4: error: type mismatch\n  h\nhas type\n  A : Prop\nbut is expected to have type\n  B : Prop',
        file: 'Model/Spyro/Main.lean',
        range: range(56, 4),
      },
    ]);
    expect(buildErrorFindings(facts({ status: 'build-errors', detail: 'lake build failed without naming a model module: lakefile.toml: bad' }))).toEqual([
      { step: 'G1', code: 'build', message: 'The Lean build failed: lake build failed without naming a model module: lakefile.toml: bad' },
    ]);
    expect(buildErrorFindings(facts())).toEqual([]);
  });
});

describe('small helpers', () => {
  it('filesKey depends on every path and text; projectModulesOf lists the library modules', () => {
    const a = new Map([
      ['Model.lean', 'x'],
      ['Model/Spyro/Main.lean', 'y'],
    ]);
    expect(filesKey(a)).toBe(filesKey(new Map([...a].reverse())));
    expect(filesKey(a)).not.toBe(filesKey(new Map([...a, ['Model/Spyro/notes.md', '']])));
    expect(filesKey(a)).not.toBe(filesKey(new Map([['Model.lean', 'x'], ['Model/Spyro/Main.lean', 'z']])));
    expect([...projectModulesOf(new Map([...a, ['Model/Spyro/notes.md', ''], ['Model/Spyro/my file.lean', ''], ['lakefile.toml', '']]), 'Model')].sort()).toEqual(['Model', 'Model.Spyro.Main']);
  });
});

describe('the freeze copy: what is removed', () => {
  it('removes the target .holds and, transitively, every declaration that uses it (auxiliary names map to their parent)', () => {
    const f = facts({
      decls: [
        decl('Spyro.cynder_not_good'),
        decl('Spyro.cynder_not_good.holds'),
        decl('Spyro.again', ['Spyro.cynder_not_good.holds']),
        decl('Spyro.again2', ['Spyro.again', 'Spyro.cynder_not_good']),
        decl('Spyro.aux_user._proof_1', ['Spyro.again2'], { parent: 'Spyro.aux_user' }),
        decl('Spyro.aux_user'),
        decl('Spyro.unrelated', ['Spyro.cynder_not_good']),
      ],
    });
    const declared = new Set(['Spyro.cynder_not_good', 'Spyro.cynder_not_good.holds', 'Spyro.again', 'Spyro.again2', 'Spyro.aux_user', 'Spyro.unrelated']);
    expect(removalClosure(f, declared, 'Spyro.cynder_not_good.holds')).toEqual(['Spyro.again', 'Spyro.again2', 'Spyro.aux_user', 'Spyro.cynder_not_good.holds']);
    // No `.holds` yet: nothing to remove.
    expect(removalClosure(f, new Set(['Spyro.cynder_not_good']), 'Spyro.cynder_not_good.holds')).toEqual([]);
    expect(removalClosure(undefined, declared, 'Spyro.cynder_not_good.holds')).toEqual(['Spyro.cynder_not_good.holds']);
  });

  let tmp: string;
  beforeAll(() => {
    tmp = makeTempRoot('gate-pure');
  });
  afterAll(() => cleanupTempRoot(tmp));

  it('removeDeclarations drops each name with its docstring and refuses a name declared nowhere', async () => {
    const dir = path.join(tmp, 'copy');
    mkdirSync(path.join(dir, 'Model', 'Spyro'), { recursive: true });
    const main = [
      'namespace Spyro',
      'abbrev t : Prop := True',
      'axiom t.holds : t',
      '',
      '/-- uses it -/',
      'theorem again : t := t.holds',
      '',
      'theorem keep : True := trivial',
      'end Spyro',
      '',
    ].join('\n');
    writeFileSync(path.join(dir, 'Model', 'Spyro', 'Main.lean'), main);
    writeFileSync(path.join(dir, 'Model.lean'), 'import Model.Spyro.Main\n');
    const changed = await removeDeclarations(dir, ['Model.lean', 'Model/Spyro/Main.lean'], ['Spyro.t.holds', 'Spyro.again']);
    expect(changed).toEqual(['Model/Spyro/Main.lean']);
    const after = readFileSync(path.join(dir, 'Model', 'Spyro', 'Main.lean'), 'utf8');
    expect(after).not.toContain('t.holds');
    expect(after).not.toContain('uses it');
    expect(after).not.toContain('theorem again');
    expect(after).toContain('abbrev t : Prop := True');
    expect(after).toContain('theorem keep : True := trivial');
    await expect(removeDeclarations(dir, ['Model/Spyro/Main.lean'], ['Spyro.nowhere'])).rejects.toThrow(/not declared in any module/u);
  });
});

describe('the ghost check file (facts 7 and 8)', () => {
  const literal = ghostScratchSource({
    library: 'Model',
    namespace: 'Spyro',
    targetStatement: 'Spyro.cynder_not_good',
    statement: '∀ (c : Character) (g : Game),\n    ¬ InGame c g →   ¬ GoodAddition c g',
    proof: 'fun h =>\n  h cynder newSpyro (pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds)',
  });

  it('pins the collapsed statement in a named abbreviation and the proof in the check theorem', () => {
    expect(literal.source).toBe(
      [
        'import Model',
        'namespace Spyro',
        'abbrev telelean_ghost_stmt : Prop := ∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g',
        'theorem telelean_ghost_check : telelean_ghost_stmt → Spyro.cynder_not_good :=',
        '  fun h =>',
        '    h cynder newSpyro (pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds)',
        'end Spyro',
        '#print axioms Spyro.telelean_ghost_check',
        '',
      ].join('\n'),
    );
    expect(literal).toMatchObject({ checkName: 'Spyro.telelean_ghost_check', statementLine: 3, proofLines: [4, 6], printLine: 8 });
    expect(() => ghostScratchSource({ library: 'Model', namespace: 'Spy ro', targetStatement: 'Spyro.t', statement: 'True', proof: 'x' })).toThrow(TypeError);
  });

  const msg = (line: number, severity: string, data: string): LeanMessage => ({ severity, data, line, column: 0 });

  it('reads the axioms only from the message naming the check theorem on the #print line, and locates errors', () => {
    const twelve = "'Spyro.telelean_ghost_check' depends on axioms: [Classical.choice,\n Spyro.Character,\n Spyro.Game,\n Spyro.GoodAddition,\n Spyro.HasDarkPast,\n Spyro.InGame,\n Spyro.IsPG,\n Spyro.Character.exists,\n Spyro.Game.exists,\n Spyro.cynder_dark_past.holds,\n Spyro.new_spyro_pg.holds,\n Spyro.pg_no_dark_past.holds]";
    const ok = readGhostScratch(literal, [msg(8, 'information', twelve)]);
    expect(ok.errors).toEqual([]);
    expect(ok.axioms).toHaveLength(12);
    expect(ok.axioms).toContain('Spyro.InGame');
    // A message about another declaration, or on another line, never counts.
    expect(readGhostScratch(literal, [msg(8, 'information', "'Spyro.evil' does not depend on any axioms")]).axioms).toBeUndefined();
    expect(readGhostScratch(literal, [msg(5, 'information', "'Spyro.telelean_ghost_check' does not depend on any axioms")]).axioms).toBeUndefined();
    expect(readGhostScratch(literal, [msg(8, 'information', "'Spyro.telelean_ghost_check' does not depend on any axioms")]).axioms).toEqual([]);
    const errors = readGhostScratch(literal, [msg(3, 'error', "unexpected token ')'; expected command"), msg(5, 'error', 'Type mismatch'), msg(1, 'error', 'unknown module')]);
    expect(errors.errors).toEqual([
      "Lean error in the suggested statement: unexpected token ')'; expected command",
      'Lean error in the proof: Type mismatch',
      "Lean error in telelean's check file, line 1: unknown module",
    ]);
    expect(parseNamedAxiomsMessage("'A.b' depends on axioms: [x, y]")).toEqual({ name: 'A.b', axioms: ['x', 'y'] });
    expect(parseNamedAxiomsMessage('something else')).toBeUndefined();
  });
});

describe('the ghost check file with the value probe (spec v4.1 RV-1 "the check includes B.2", slice 1e)', () => {
  const names = ['Spyro.cynder_dark_past.holds', 'Spyro.Character', 'Spyro.telelean_ghost_check', 'odd name', 'Spyro.«x»'];
  const probed = ghostScratchSource({
    library: 'Model',
    namespace: 'Spyro',
    targetStatement: 'Spyro.cynder_not_good',
    statement: '¬ GoodAddition cynder newSpyro',
    proof: 'fun h => h',
    probe: { names },
  });
  const msg = (line: number, severity: string, data: string): LeanMessage => ({ severity, data, line, column: 0 });

  it('imports what the probe needs after the library, keeps the check where it was, and ends with the probe (the check theorem first)', () => {
    const lines = probed.source.split('\n');
    expect(lines.slice(0, 9)).toEqual([
      'import Model',
      'import Lean.CoreM',
      'import Lean.Util.FoldConsts',
      'namespace Spyro',
      'abbrev telelean_ghost_stmt : Prop := ¬ GoodAddition cynder newSpyro',
      'theorem telelean_ghost_check : telelean_ghost_stmt → Spyro.cynder_not_good :=',
      '  fun h => h',
      'end Spyro',
      '#print axioms Spyro.telelean_ghost_check',
    ]);
    expect(probed).toMatchObject({ statementLine: 5, proofLines: [6, 7], printLine: 9 });
    // Names the probe cannot pass are left out; the check theorem is listed once, first.
    expect(probed.valueProbe?.probed).toEqual(['Spyro.telelean_ghost_check', 'Spyro.cynder_dark_past.holds', 'Spyro.Character']);
    const probe = valueProbeLines(probed.valueProbe?.probed ?? [], 'Model', { followMain: true });
    expect(probed.valueProbe).toMatchObject({ firstLine: 10, lastLine: 9 + probe.length });
    expect(lines.slice(9, -1)).toEqual(probe);
    // It follows the constants this file declares (the pinned statement, the theorem's auxiliaries); refresh's does not.
    expect(probe).toContain('    | none => true');
    expect(valueProbeLines(['A.b'], 'Model')).toContain('    | none => false');
  });

  it('reads the check theorem\'s constants from the probe\'s line; an error in the probe voids it, never the suggestion\'s check', () => {
    const line = probed.valueProbe?.firstLine ?? 0;
    const axioms = "'Spyro.telelean_ghost_check' depends on axioms: [Spyro.cynder_dark_past.holds]";
    const ok = readGhostScratch(probed, [msg(9, 'information', axioms), msg(line, 'information', '{"telelean-value-consts":[["Spyro.cynder_dark_past.holds"],[],[]]}')]);
    expect(ok).toEqual({ errors: [], axioms: ['Spyro.cynder_dark_past.holds'], valueConsts: ['Spyro.cynder_dark_past.holds'], valueProblems: [] });
    const failed = readGhostScratch(probed, [msg(9, 'information', axioms), msg(line + 3, 'error', 'unknown constant')]);
    expect(failed.errors).toEqual([]);
    expect(failed.valueConsts).toBeUndefined();
    expect(failed.valueProblems).toEqual([`the value probe failed: ${line + 3}:0: unknown constant`]);
    expect(readGhostScratch(probed, [msg(9, 'information', axioms)]).valueProblems).toEqual(['Lean printed nothing for the value probe']);
    expect(readGhostScratch(probed, [msg(line, 'information', '{"telelean-value-consts":[[]]}')]).valueProblems).toEqual(['the value probe listed 1 entries for 3 declarations']);
    // Without the probe (as before slice 1e) nothing about values is read.
    expect(readGhostScratch(ghostScratchSource({ library: 'Model', namespace: 'Spyro', targetStatement: 'Spyro.t', statement: 'True', proof: 'fun h => h' }), []).valueProblems).toEqual([]);
  });

  it('slice 2b3a: the in-file probe keeps its place in the ghost file, now with the type walk; the check theorem\'s type constants come from the same line', () => {
    const lines = probed.source.split('\n');
    expect(lines.join('\n')).toContain('      types := types.push (walk (typeOf ci) (fun cj => typeOf cj ++ valueOf cj))');
    // In-file: the file's own environment, never importModules (its theorem is in no built module).
    expect(lines).toContain('  let env ← Lean.getEnv');
    expect(probed.source).not.toContain('importModules');
    const line = probed.valueProbe?.firstLine ?? 0;
    const axioms = "'Spyro.telelean_ghost_check' depends on axioms: [Spyro.cynder_dark_past.holds]";
    const both = '{"telelean-value-consts":[["Spyro.cynder_dark_past.holds"],[],[]],"telelean-type-consts":[["Spyro.cynder_dark_past","Spyro.Character"],[],[]]}';
    expect(readGhostScratch(probed, [msg(9, 'information', axioms), msg(line, 'information', both)])).toEqual({
      errors: [],
      axioms: ['Spyro.cynder_dark_past.holds'],
      valueConsts: ['Spyro.cynder_dark_past.holds'],
      typeConsts: ['Spyro.cynder_dark_past', 'Spyro.Character'],
      valueProblems: [],
    });
    // A malformed type key voids the whole line, values included (fail closed).
    const badType = '{"telelean-value-consts":[["Spyro.cynder_dark_past.holds"],[],[]],"telelean-type-consts":[[]]}';
    const bad = readGhostScratch(probed, [msg(9, 'information', axioms), msg(line, 'information', badType)]);
    expect(bad).toMatchObject({ valueProblems: ['the type probe listed 1 entries for 3 declarations'] });
    expect(bad).not.toHaveProperty('valueConsts');
    expect(bad).not.toHaveProperty('typeConsts');
    // A line without the check theorem (null): neither.
    const missing = readGhostScratch(probed, [msg(9, 'information', axioms), msg(line, 'information', '{"telelean-value-consts":[null,[],[]],"telelean-type-consts":[["X.y"],[],[]]}')]);
    expect(missing.valueProblems).toEqual(['the value probe found no Spyro.telelean_ghost_check']);
    expect(missing).not.toHaveProperty('typeConsts');
  });

  it('ghostDirectProblems refuses rather than guess without checked facts or a usable probe', () => {
    const ctx = { selection: { subject: 'Spyro', target: 'cynder-not-good', premises: ['cynder-dark-past'], adoptedGhosts: [] } };
    expect(ghostDirectProblems(ctx, undefined, { valueProblems: [] }, [])).toEqual([`${UNSEEN_PROOF} (no checked facts of the files).`]);
  });
});

describe('the statement rendering file (fact 4)', () => {
  it('prints each statement with default and explicit options, one line each, and reads both forms', () => {
    const scratch = renderScratchSource('Model', ['Spyro.pg_no_dark_past', 'Spyro.missing', 'bad name']);
    expect(scratch.source.split('\n').slice(0, 3)).toEqual([
      'import Model',
      '#print Spyro.pg_no_dark_past',
      'set_option pp.explicit true in set_option pp.notation false in set_option pp.universes true in set_option pp.coercions false in #print Spyro.pg_no_dark_past',
    ]);
    const pretty = '@[reducible] def Spyro.pg_no_dark_past : Prop :=\n∀ (g : Spyro.Game) (c : Spyro.Character), Spyro.IsPG g → Spyro.HasDarkPast c → ¬Spyro.InGame c g';
    const explicit = '@[reducible] def Spyro.pg_no_dark_past : Prop :=\n∀ (g : Spyro.Game) (c : Spyro.Character), Spyro.IsPG g → Spyro.HasDarkPast c → Not (Spyro.InGame c g)';
    const out = readRenderScratch(scratch, ['Spyro.pg_no_dark_past', 'Spyro.missing', 'bad name'], [
      { severity: 'information', data: pretty, line: 2, column: 0 },
      { severity: 'information', data: explicit, line: 3, column: 128 },
      { severity: 'error', data: 'Unknown constant `Spyro.missing`', line: 4, column: 7 },
      { severity: 'error', data: 'Unknown constant `Spyro.missing`', line: 5, column: 7 },
    ]);
    expect(out[0]).toEqual({ name: 'Spyro.pg_no_dark_past', pretty, explicit });
    expect(out[1]).toMatchObject({ name: 'Spyro.missing', pretty: '', explicit: '', error: 'Unknown constant `Spyro.missing`' });
    expect(out[2]?.error).toMatch(/not a usable Lean declaration name/u);
  });
});
