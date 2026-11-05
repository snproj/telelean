/**
 * The engine with core's REAL gate rules and real Lean (M2 WP2, docs/m2-plan.md section 9): AT2.6 check, AT2.7
 * freeze, AT2.8 the gate's cheating cases one per line, AT2.9 checkGhost, AT2.13 normalise, AT2.15 Accept's re-check
 * with an accept-base B. (Gated on WP1 while the builders worked in parallel; the integrator removed the gates.)
 * Claude is played by the edit scripts of test-fixtures/gate/edits.json.
 */
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ghostTextProblems, type GateFinding } from '@telelean/core';

import { createLeanCheckEngine, GHOST_NEEDS_FREEZE, type CheckContext, type FreezeRecord, type GateReport, type LeanCheckEngine } from '../../src/gate/index.js';
import { refreshLeanFacts } from '../../src/semantic/index.js';
import { createRunShadow, type ShadowWorkspace } from '../../src/shadow/index.js';
import { recordingHost, unitsOfRun } from '../semantic/helpers.js';
import {
  applyEdits,
  cleanupTempRoot,
  contextFor,
  editWs,
  jobFor,
  knownProjectsLines,
  makeTempRoot,
  PERMITTED_NORMATIVE,
  selection,
  spyroModelFiles,
  spyroRoot,
} from './helpers.js';

const runIdFor = (label: string): string => `wp2r${label}${process.pid}`;
const codes = (findings: readonly GateFinding[]): string[] => findings.map((f) => f.code);
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
const GHOST_ID = 'a-character-who-cannot-be-in';
const LITERAL_GHOST = '∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g';
const LITERAL_GHOST_PROOF = 'fun h => h cynder newSpyro (pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds)';
const INJECTED = 'True) → True := fun _ => trivial\naxiom evil : False\nexample : (True';

let tmp: string;
let knownBefore: number | undefined;
beforeAll(() => {
  tmp = makeTempRoot('gate-rules');
  knownBefore = knownProjectsLines();
});
afterAll(() => {
  expect(knownProjectsLines()).toBe(knownBefore);
  cleanupTempRoot(tmp);
});

async function newShadow(name: string, overlay?: string): Promise<ShadowWorkspace> {
  return createRunShadow({ root: spyroRoot(tmp, name, overlay), runsDir: path.join(tmp, 'runs'), runId: runIdFor(name), library: 'Model', files: spyroModelFiles(overlay), copyBuild: false });
}

/** A shadow whose base check passed (B's facts kept). */
async function checkedShadow(engine: LeanCheckEngine, name: string, overlay?: string): Promise<ShadowWorkspace> {
  const shadow = await newShadow(name, overlay);
  const base = await engine.checkBase(contextFor(shadow, shadow.runId));
  if (base.outcome !== 'ok') throw new Error(`base check ${base.outcome}: ${[...base.findings.map((f) => f.message), base.environment ?? ''].join('\n')}`);
  return shadow;
}

async function mustFreeze(engine: LeanCheckEngine, ctx: CheckContext): Promise<FreezeRecord> {
  const outcome = await engine.freeze(ctx);
  if (!outcome.ok) throw new Error(`freeze refused: ${outcome.refusals.join('\n')}`);
  return outcome.record;
}

function explain(report: GateReport): string {
  return JSON.stringify({ passed: report.passed, environment: report.environment, findings: report.findings.map((f) => `${f.step} ${f.code}: ${f.message}`), comparator: report.comparator }, null, 2);
}

describe('check and freeze with the real rules (AT2.6, AT2.7)', () => {
  const engine = createLeanCheckEngine();

  it('AT2.6: the normative formalisation checks ok; after the freeze the proof checks ok with its footprint', async () => {
    const shadow = await checkedShadow(engine, 'check');
    editWs(shadow, 'formalise-normative');
    const formalised = await engine.check(contextFor(shadow, shadow.runId));
    expect(formalised.findings).toEqual([]);
    expect(formalised.outcome).toBe('ok');
    const record = await mustFreeze(engine, contextFor(shadow, shadow.runId));
    editWs(shadow, 'prove-normative');
    const proved = await engine.check(contextFor(shadow, shadow.runId, { stage: 'prove', freeze: record }));
    expect(proved.findings).toEqual([]);
    expect([...(proved.rules?.footprints['Spyro.cynder_not_good.holds'] ?? [])].sort()).toEqual(HONEST_FOOTPRINT);
    expect(await unitsOfRun(shadow.runId)).toEqual([]);
  });

  it('AT2.7: refused for an unformalised selected assumption, a proof before the freeze, a shape violation, a G5 change', async () => {
    const shadow = await checkedShadow(engine, 'refusals');
    const baseId = (await shadow.lastCommit(['base']))?.id ?? '';
    const refusal = async (...scripts: string[]): Promise<string[]> => {
      await shadow.revertTo(baseId, 'reset', 1);
      if (scripts.length > 0) editWs(shadow, ...scripts);
      const outcome = await engine.freeze(contextFor(shadow, shadow.runId));
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return [];
      expect(outcome.refusals.length).toBeGreaterThan(0);
      expect(outcome.environment).toBeUndefined();
      return codes([...outcome.report.g0, ...outcome.report.findings]);
    };
    expect(await refusal()).toContain('not-formalised');
    expect(await refusal('formalise-normative', 'prove-normative')).toContain('proof-before-freeze');
    expect(await refusal('formalise-normative', 'shape-violation')).toContain('vocabulary-shape');
    expect(await refusal('formalise-normative', 'cheat-edited-words')).toContain('markup');
    expect((await shadow.commits()).some((c) => c.kind === 'freeze')).toBe(false);
  });

  it('AT2.7: succeeds on the formalised state with AT1.3’s permitted set and frozen.ndjson', async () => {
    const shadow = await checkedShadow(engine, 'freezeok');
    editWs(shadow, 'formalise-normative');
    const record = await mustFreeze(engine, contextFor(shadow, shadow.runId));
    expect(record.snapshot.permitted.all).toEqual(PERMITTED_NORMATIVE);
    expect(record.snapshot.targetStatement).toBe('Spyro.cynder_not_good');
    expect(statSync(record.freeze.exportPath).size).toBeGreaterThan(0);
    expect(path.basename(record.freeze.exportPath)).toBe('frozen.ndjson');
  });

  it('AT2.7: a target .holds already in ws/ is absent from the freeze copy, and the challenge builds', async () => {
    const shadow = await checkedShadow(engine, 'freezeholds', 'proved-derivation');
    const record = await mustFreeze(engine, contextFor(shadow, shadow.runId));
    const copy = readFileSync(path.join(shadow.paths.frozenDir, '1', 'project', 'Model/Spyro/Main.lean'), 'utf8');
    expect(copy).not.toContain('theorem cynder_not_good.holds');
    expect(statSync(record.freeze.exportPath).size).toBeGreaterThan(0);
  });

  it('AT2.7: a pending promotion whose claimed .holds another proof uses: the copy lacks both, the challenge builds', async () => {
    const shadow = await checkedShadow(engine, 'freezepending', 'pending');
    const record = await mustFreeze(engine, contextFor(shadow, shadow.runId));
    expect(record.snapshot.permitted.all).not.toContain('Spyro.cynder_not_good.holds');
    const copy = readFileSync(path.join(shadow.paths.frozenDir, '1', 'project', 'Model/Spyro/Main.lean'), 'utf8');
    expect(copy).not.toContain('axiom cynder_not_good.holds');
    expect(copy).not.toContain('cynder_not_good_again');
    expect(statSync(record.freeze.exportPath).size).toBeGreaterThan(0);
    expect(await unitsOfRun(shadow.runId)).toEqual([]);
  });
});

describe('the gate with the real rules, one cheating case per line (AT2.8)', () => {
  let refreshCalls = 0;
  const engine = createLeanCheckEngine({ refreshFacts: (r) => (refreshCalls++, refreshLeanFacts(r)) });
  let normative: ShadowWorkspace;
  let frozenAll: FreezeRecord;

  beforeAll(async () => {
    normative = await checkedShadow(engine, 'gate');
    editWs(normative, 'formalise-normative');
    frozenAll = await mustFreeze(engine, contextFor(normative, normative.runId));
  });

  /** Back to the freeze, Claude's edits, telelean's normalisation, then the gate for `status`. */
  async function attempt(status: 'proved' | 'not_proved', ...scripts: string[]): Promise<GateReport> {
    await normative.revertTo(frozenAll.commit.id, 'back to the freeze', 1);
    editWs(normative, ...scripts);
    const ctx = contextFor(normative, normative.runId, { stage: 'prove', freeze: frozenAll });
    await engine.normalise(ctx);
    return engine.gate({ ...ctx, status });
  }

  it('honest normative proof -> passed (comparator accepted)', async () => {
    const r = await attempt('proved', 'prove-normative');
    expect(r.passed, explain(r)).toBe(true);
    expect(r.comparator).toEqual({ verdict: 'accepted' });
    expect([...(r.footprint ?? [])].sort()).toEqual(HONEST_FOOTPRINT);
    // The judged commit is the normalised state (normalisation pinned pg-no-dark-past).
    expect(r.commit?.kind).toBe('normalise');
    expect((await normative.filesAt(r.commit?.id ?? '')).get('Model/Spyro/Main.lean')).toContain('lean: Spyro.pg_no_dark_past');
  });

  it('axiom shortcut -> new-axiom', async () => {
    const r = await attempt('proved', 'cheat-axiom');
    expect(r.passed).toBe(false);
    expect(codes(r.findings), explain(r)).toContain('new-axiom');
    expect(r.comparator).toBeUndefined();
  });

  it(':= sorry -> G0 sorry, no Lean started', async () => {
    const before = refreshCalls;
    const r = await attempt('proved', 'cheat-sorry');
    expect(r.findings[0], explain(r)).toMatchObject({ step: 'G0', code: 'sorry' });
    expect(r.environment).toBeUndefined();
    expect(refreshCalls).toBe(before);
  });

  it('weakened abbrev -> existing-changed', async () => {
    const r = await attempt('proved', 'cheat-weakened-abbrev');
    expect(r.passed).toBe(false);
    expect(codes(r.findings), explain(r)).toContain('existing-changed');
  });

  it('weakened theorem type -> not-proved', async () => {
    const r = await attempt('proved', 'cheat-weakened-type');
    expect(r.passed).toBe(false);
    expect(codes(r.findings), explain(r)).toContain('not-proved');
  });

  it('existing GoodAddition turned into a def -> existing-changed', async () => {
    const r = await attempt('proved', 'cheat-vocabulary-redefined');
    expect(r.passed).toBe(false);
    expect(codes(r.findings), explain(r)).toContain('existing-changed');
    expect(r.findings.find((f) => f.code === 'existing-changed')?.names ?? []).toContain('Spyro.GoodAddition');
  });

  it('edited natural_name -> markup', async () => {
    const r = await attempt('proved', 'prove-normative', 'cheat-edited-words');
    expect(r.passed).toBe(false);
    expect(codes(r.findings), explain(r)).toContain('markup');
  });

  it('#eval -> G0, no Lean started', async () => {
    const before = refreshCalls;
    const r = await attempt('proved', 'cheat-eval');
    expect(r.findings[0], explain(r)).toMatchObject({ step: 'G0', code: 'hash-command' });
    expect(refreshCalls).toBe(before);
  });

  it('finish not_proved with the proof still present -> status-mismatch', async () => {
    const r = await attempt('not_proved', 'prove-normative');
    expect(r.passed).toBe(false);
    expect(codes(r.findings), explain(r)).toContain('status-mismatch');
    expect(r.comparator).toBeUndefined();
  });

  it('stray notes.md -> G0 bad-path (counted: not an environment outcome)', async () => {
    const r = await attempt('proved', 'prove-normative', 'stray-notes');
    expect(r.findings[0], explain(r)).toMatchObject({ step: 'G0', code: 'bad-path' });
    expect(r.environment).toBeUndefined();
  });

  it('literal + adopted ghost proof -> passed', async () => {
    const shadow = await checkedShadow(engine, 'gatelit');
    editWs(shadow, 'formalise-literal');
    await mustFreeze(engine, contextFor(shadow, shadow.runId));
    // telelean writes the adoption (planGhostAdoption's text) and commits `adopt`; round 2 re-freezes with the ghost.
    const current = await shadow.currentFiles();
    const adopted = applyEdits(current, 'adopt-ghost');
    await shadow.writeFiles([{ path: 'Model/Spyro/Main.lean', before: current.get('Model/Spyro/Main.lean') ?? null, after: adopted.get('Model/Spyro/Main.lean') ?? null }]);
    const adoptCommit = await shadow.commit('adopt', 'Adopted “A character who cannot be in a game would not be a good addition to it”', 2);
    const round2 = { selection: selection(undefined, [GHOST_ID]), teleleanBlocks: [GHOST_ID], round: 2, roundStartCommit: adoptCommit.id };
    const record = await mustFreeze(engine, contextFor(shadow, shadow.runId, round2));
    expect(record.snapshot.permitted.all).toContain('Spyro.not_in_game_not_good.holds');
    editWs(shadow, 'prove-literal-adopted');
    const ctx = contextFor(shadow, shadow.runId, { ...round2, stage: 'prove', freeze: record });
    await engine.normalise(ctx);
    const r = await engine.gate({ ...ctx, status: 'proved' });
    expect(r.passed, explain(r)).toBe(true);
    expect(r.comparator).toEqual({ verdict: 'accepted' });
    expect(r.footprint).toContain('Spyro.not_in_game_not_good.holds');
  });

  it('unselected new-spyro-pg -> footprint naming it; a not_proved round with a lemma resting on it -> footprint', async () => {
    const shadow = await checkedShadow(engine, 'gateunsel');
    editWs(shadow, 'formalise-normative');
    const unselected = selection(['cynder-dark-past', 'pg-no-dark-past']);
    const record = await mustFreeze(engine, contextFor(shadow, shadow.runId, { selection: unselected }));
    expect(record.snapshot.permitted.all).not.toContain('Spyro.new_spyro_pg.holds');
    const ctx = contextFor(shadow, shadow.runId, { selection: unselected, stage: 'prove', freeze: record });
    editWs(shadow, 'prove-normative');
    await engine.normalise(ctx);
    const proved = await engine.gate({ ...ctx, status: 'proved' });
    expect(proved.passed).toBe(false);
    expect(codes(proved.findings), explain(proved)).toContain('footprint');
    expect(proved.findings.filter((f) => f.code === 'footprint').flatMap((f) => [...(f.names ?? []), f.message]).join(' ')).toContain('new_spyro_pg.holds');

    await shadow.revertTo(record.commit.id, 'back to the freeze', 1);
    editWs(shadow, 'lemma-unselected');
    await engine.normalise(ctx);
    const lemma = await engine.gate({ ...ctx, status: 'not_proved' });
    expect(lemma.passed).toBe(false);
    expect(codes(lemma.findings), explain(lemma)).toContain('footprint');
  });

  it('new def InGame in the statement closure -> passed with a flagged definition', async () => {
    const shadow = await checkedShadow(engine, 'gatedef');
    editWs(shadow, 'formalise-definition');
    const record = await mustFreeze(engine, contextFor(shadow, shadow.runId));
    editWs(shadow, 'prove-normative');
    const ctx = contextFor(shadow, shadow.runId, { stage: 'prove', freeze: record });
    await engine.normalise(ctx);
    const r = await engine.gate({ ...ctx, status: 'proved' });
    expect(r.passed, explain(r)).toBe(true);
    expect(r.flaggedDefinitions.map((d) => d.name)).toContain('Spyro.InGame');
  });

  it('target pin re-pointed to a new `abbrev cynder_not_good_weak : Prop := True` -> markup, the freeze refused', async () => {
    const shadow = await checkedShadow(engine, 'gaterebind');
    editWs(shadow, 'formalise-normative', 'rebind-target');
    const outcome = await engine.freeze(contextFor(shadow, shadow.runId));
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? [] : codes([...outcome.report.g0, ...outcome.report.findings])).toContain('markup');
    expect(await unitsOfRun(shadow.runId)).toEqual([]);
  });
});

describe('checkGhost with the real rules (AT2.9)', () => {
  const engine = createLeanCheckEngine();
  let literal: ShadowWorkspace;
  let record: FreezeRecord;

  beforeAll(async () => {
    literal = await checkedShadow(engine, 'ghost');
    editWs(literal, 'formalise-literal');
    record = await mustFreeze(engine, contextFor(literal, literal.runId));
  });
  const ctx = (over: Partial<CheckContext> = {}): CheckContext => contextFor(literal, literal.runId, { stage: 'prove', freeze: record, ...over });

  it('the literal ghost -> ok with fact 7’s footprint, not alone-entailing, statement collapsed', async () => {
    const r = await engine.checkGhost(ctx(), { naturalName: 'A character who cannot be in a game would not be a good addition to it', leanStatement: `∀ (c : Character)  (g : Game),\n ¬ InGame c g → ¬ GoodAddition c g`, proof: LITERAL_GHOST_PROOF });
    if (!r.ok) throw new Error(r.problems.join('\n'));
    expect([...r.footprint].sort()).toEqual([...HONEST_FOOTPRINT, 'Spyro.InGame'].sort());
    expect(r.aloneEntails).toBe(false);
    expect(r.statement).toBe(LITERAL_GHOST);
  });

  it('`¬ GoodAddition cynder newSpyro` with `fun h => h` -> ok, alone entails', async () => {
    const r = await engine.checkGhost(ctx(), { naturalName: 'Cynder would not be a good addition', leanStatement: '¬ GoodAddition cynder newSpyro', proof: 'fun h => h' });
    expect(r).toMatchObject({ ok: true, aloneEntails: true });
  });

  it('a proof using an unselected .holds -> problems', async () => {
    const shadow = await checkedShadow(engine, 'ghostunsel');
    editWs(shadow, 'formalise-literal');
    const unselected = selection(['cynder-dark-past', 'pg-no-dark-past']);
    const frozen = await mustFreeze(engine, contextFor(shadow, shadow.runId, { selection: unselected }));
    const r = await engine.checkGhost(contextFor(shadow, shadow.runId, { selection: unselected, stage: 'prove', freeze: frozen }), {
      naturalName: 'x',
      leanStatement: LITERAL_GHOST,
      proof: LITERAL_GHOST_PROOF,
    });
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.problems.join('\n')).toContain('new_spyro_pg.holds');
  });

  it('before the freeze -> refused; a forbidden token and fact 8’s injected statement -> refused without Lean', async () => {
    const fake = recordingHost(path.join(tmp, 'fake-host-ghost-rules'));
    const job = jobFor(literal.runId, { host: fake.host });
    expect(await engine.checkGhost(contextFor(literal, literal.runId, { stage: 'prove', job }), { naturalName: 'x', leanStatement: LITERAL_GHOST, proof: LITERAL_GHOST_PROOF })).toEqual({
      ok: false,
      problems: [GHOST_NEEDS_FREEZE],
    });
    const forbidden = await engine.checkGhost(ctx({ job }), { naturalName: 'x', leanStatement: LITERAL_GHOST, proof: 'sorry' });
    expect(forbidden.ok).toBe(false);
    const injected = await engine.checkGhost(ctx({ job }), { naturalName: 'x', leanStatement: INJECTED, proof: 'fun h => h' });
    expect(injected.ok).toBe(false);
    expect(injected.ok ? [] : injected.problems).toEqual(ghostTextProblems(INJECTED, 'fun h => h'));
    expect(fake.calls()).toEqual([]);
  });

  it('fact 8’s injected statement with a permissive single-term rule -> refused because the pinned file has errors', async () => {
    const permissive = createLeanCheckEngine({ core: { ghostTextProblems: () => [] } });
    const r = await permissive.checkGhost(ctx(), { naturalName: 'x', leanStatement: INJECTED, proof: 'fun h => h' });
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.problems.join('\n')).toMatch(/Lean error in the suggested statement/u);
    expect(await unitsOfRun(literal.runId)).toEqual([]);
  });
});

describe('normalise with the real normalisationChanges (AT2.13)', () => {
  it('writes the pin and the docstring of a statement new in this run, commits `normalise`, and is idempotent', async () => {
    const engine = createLeanCheckEngine();
    const shadow = await newShadow('normalise');
    editWs(shadow, 'formalise-normative');
    const main = path.join(shadow.paths.ws, 'Model/Spyro/Main.lean');
    const before = readFileSync(main, 'utf8');
    const reworded = before.replace('/-- PG games cannot have characters with dark pasts -/', '/-- the normative reading -/');
    await shadow.writeFiles([{ path: 'Model/Spyro/Main.lean', before, after: reworded }]);
    const ctx = contextFor(shadow, shadow.runId, { stage: 'prove' });
    const first = await engine.normalise(ctx);
    expect(first.commit?.kind).toBe('normalise');
    const after = readFileSync(main, 'utf8');
    expect(after).toContain('lean: Spyro.pg_no_dark_past');
    expect(after).toContain('/-- PG games cannot have characters with dark pasts -/\nabbrev pg_no_dark_past');
    expect(after).not.toContain('the normative reading');
    const count = (await shadow.commits()).length;
    expect(await engine.normalise(ctx)).toEqual({ changes: [] });
    expect(await shadow.commits()).toHaveLength(count);
  });
});

describe('Accept’s re-check with an accept-base B, with the real rules (AT2.15)', () => {
  it('with baseCommit = an accept-base commit holding the user’s edits (a rationale, a declaration’s docstring), the rules see neither as changed', async () => {
    const engine = createLeanCheckEngine();
    const shadow = await checkedShadow(engine, 'acceptbase');
    // The user's real files at Accept: their own edits during the run.
    const base = await shadow.baseFiles();
    const user = new Map(base);
    user.set('Model/Spyro/Main.lean', (base.get('Model/Spyro/Main.lean') ?? '').replace('rationale: known from gaming news', 'rationale: known from the official announcement'));
    user.set('Model/Spyro/Vocabulary.lean', (base.get('Model/Spyro/Vocabulary.lean') ?? '').replace('/-- the new Spyro game -/', '/-- the newest Spyro game -/'));
    const current = await shadow.currentFiles();
    await shadow.writeFiles([...user].filter(([p, text]) => current.get(p) !== text).map(([p, text]) => ({ path: p, before: current.get(p) ?? null, after: text })));
    const acceptBase = await shadow.commit('accept-base', 'Your files at Accept', 1);
    // The rebased proposal: Claude's formalisation and proof on top of the user's files.
    const merged = applyEdits(user, 'formalise-normative', 'prove-normative');
    const now = await shadow.currentFiles();
    await shadow.writeFiles([...merged].filter(([p, text]) => now.get(p) !== text).map(([p, text]) => ({ path: p, before: now.get(p) ?? null, after: text })));
    const rebase = await shadow.commit('rebase', 'Rebased onto your files', 1);
    const ctx = contextFor(shadow, shadow.runId, { baseCommit: acceptBase.id, roundStartCommit: rebase.id });
    await engine.normalise(ctx);
    const record = await mustFreeze(engine, ctx);
    const r = await engine.gate({ ...ctx, stage: 'prove', freeze: record, status: 'proved' });
    expect(codes(r.findings), explain(r)).not.toContain('existing-changed');
    expect(codes(r.findings)).not.toContain('markup');
    expect(r.passed, explain(r)).toBe(true);
    expect(await unitsOfRun(shadow.runId)).toEqual([]);
  });
});
