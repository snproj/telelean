/**
 * Slice 2b3b (docs/slice2-plan.md 2.9, 3.3-3.10, §6.1's 2b3b list): the Lean check engine in an edit session.
 *
 *  - Fake `refreshFacts` (no Lean): the scope and the session's records reach judgeState, with S₀'s facts; §2.1's
 *    failed-probe rule on a session step (AP30-3) and on `judge`, `finalCheck` and `writePremise` (AP30-4); G0 first at
 *    every purpose, with nothing synced, built, rendered or started (AP30-1 r2); the contexts `judge` and `finalCheck`
 *    take.
 *  - Real Lean (one shadow per test, capped by the caller): the challenge exported again when E(T) grows after the
 *    freeze, built from the freeze's copy, and G4 still catching a definition changed after the freeze (D2-19); the
 *    final check refusing a footprint outside the recomputed permitted set; the ghost check with E(T), `judge`'s premise
 *    re-checks, `writePremise` (P where it was written, a mismatch, the written key) and `complete` (frozen again from
 *    the adopt commit, a good completion passing).
 *  - Fixer 2b3b r1: judge's re-checks with canned Lean answers (what telelean could not judge is left out and tried
 *    again; an outcome is reported again while nothing it relies on changed) and with real Lean (a reworded source, a
 *    lemma taken out); the ghost check right after propose_arrow; G0 on S₀ and on the completion's starting state;
 *    `complete` by what its starting state holds (a replay after recover()'s revert passes; a change outside T's proof
 *    and a definition the comparator rejects are refused); `finalCheck` only when ws/ is the newest commit.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  buildProjectModel,
  ghostTextProblems,
  judgeState,
  parseLeanFile,
  planGhostAdoption,
  premiseDraftKey,
  premiseKey,
  probeFailure,
  REVIEW_TEXTS,
  UNSEEN_PROOF,
  type GateFinding,
  type InferenceJudgement,
  type JudgeInput,
  type LeanFacts,
  type LedgerEntry,
  type PremiseDraft,
  type SessionInference,
  type StateJudgement,
  type StepScope,
} from '@telelean/core';

import { createLeanCheckEngine, GHOST_NEEDS_FREEZE, statementFactsOf, type CheckContext, type LeanCheckEngine, type SessionCheckContext } from '../../src/gate/index.js';
import type { RunLeanResult } from '../../src/lean/runLean.js';
import type { RefreshRequest } from '../../src/semantic/types.js';
import { refreshLeanFacts } from '../../src/semantic/index.js';
import { createRunShadow, type ShadowWorkspace } from '../../src/shadow/index.js';
import { recordingHost, unitsOfRun } from '../semantic/helpers.js';
import {
  cleanupTempRoot,
  contextFor,
  editWs,
  fakeCore,
  fakeFreezeRecord,
  jobFor,
  knownProjectsLines,
  makeTempRoot,
  permittedAxioms,
  spyroModelFiles,
  spyroRoot,
} from './helpers.js';

const runIdFor = (label: string): string => `s2b${label}${process.pid}`;
const T = 'cynder-not-good';
const MAIN = 'Model/Spyro/Main.lean';
const ALL = ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'];
const QUESTION = { sources: ALL, fromNothing: false };
const INFERENCE: SessionInference = { target: T, question: QUESTION, order: 0, steps: ['s1'] };
const SCOPE: StepScope = { step: 's1', target: T, question: QUESTION, fuzzyStatements: ['pg-no-dark-past'], openProof: true, openArrows: true, openItems: [] };

let tmp: string;
let knownBefore: number | undefined;
beforeAll(() => {
  tmp = makeTempRoot('gate-session');
  knownBefore = knownProjectsLines();
});
afterAll(() => {
  expect(knownProjectsLines()).toBe(knownBefore);
  cleanupTempRoot(tmp);
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function newShadow(name: string, runId = runIdFor(name), files = spyroModelFiles()): Promise<ShadowWorkspace> {
  return createRunShadow({ root: spyroRoot(tmp, name), runsDir: path.join(tmp, 'runs'), runId, library: 'Model', files, copyBuild: false });
}

function session(over: Partial<SessionCheckContext> = {}): SessionCheckContext {
  return { inferences: [INFERENCE], ledger: [], items: [], premises: [], ended: [], rejectedArrows: [], ...over };
}

/** A step's context: the walkthrough's step (its target, three arrows, pg-no-dark-past fuzzy) from S₀ `s0`. */
function stepCtx(shadow: ShadowWorkspace, runId: string, s0: string, over: Partial<CheckContext> = {}, records: Partial<SessionCheckContext> = {}): CheckContext {
  return contextFor(shadow, runId, { stage: 'prove', ...over, session: session({ scope: SCOPE, stepStartCommit: s0, ...records }) });
}

/** A stage's context: the first inference's selection, stage and round (§2.9's note), and the session's records. */
function stageCtx(shadow: ShadowWorkspace, runId: string, records: Partial<SessionCheckContext> = {}, over: Partial<CheckContext> = {}): CheckContext {
  return contextFor(shadow, runId, { stage: 'prove', ...over, session: session({ ended: [T], ...records }) });
}

function factsWith(probe: LeanFacts['probe'], over: Partial<LeanFacts> = {}): LeanFacts {
  return {
    format: 'telelean-lean-facts',
    version: 1,
    toolchain: 'leanprover/lean4:v4.35.0',
    library: 'Model',
    startedAt: '',
    finishedAt: '',
    status: probe?.status === 'ok' || probe === undefined ? 'ok' : 'check-errors',
    build: { status: 'ok', durationMs: 0, messages: [], failedModules: [] },
    check: { status: 'ok', durationMs: 0, probed: 0 },
    modules: [],
    decls: [],
    ...(probe !== undefined ? { probe } : {}),
    ...over,
  };
}
const FAILED = factsWith({ status: 'failed', durationMs: 5, detail: '9:0: unknown constant Lean.Name.mkStr' });
const CUT = factsWith({ status: 'cut', durationMs: 5 });
const OK_FACTS = factsWith({ status: 'ok', durationMs: 5 });

function fakeJudgement(input: JudgeInput, over: Partial<StateJudgement> = {}): StateJudgement {
  return {
    commit: input.commit,
    filesKey: input.filesKey,
    purpose: input.purpose,
    ok: true,
    global: [],
    stepFindings: [],
    inferences: {},
    drafts: [],
    classes: {},
    classesBeforeReveal: {},
    deps: {},
    reach: {},
    problems: [],
    ...over,
  };
}

const sourceOnly: GateFinding = { step: 'G3', code: 'undeclared-premise', message: UNSEEN_PROOF, names: ['Spyro.cynder_not_good.holds'], nodeId: T, token: 'source-only' };
const other: GateFinding = { step: 'G3', code: 'existing-changed', message: 'Spyro.cynder_dark_past existed when this step started and was changed', names: ['Spyro.cynder_dark_past'], token: 'session' };

/** Appends `text` to Main.lean inside `namespace Spyro`, playing Claude. */
function appendToMain(shadow: ShadowWorkspace, text: string): void {
  const file = path.join(shadow.paths.ws, MAIN);
  const main = readFileSync(file, 'utf8');
  if (!main.endsWith('\nend Spyro\n')) throw new Error('Main.lean does not end with `end Spyro`');
  writeFileSync(file, `${main.slice(0, -'end Spyro\n'.length)}${text}\nend Spyro\n`);
}

function replaceInMain(shadow: ShadowWorkspace, from: string, to: string): void {
  const file = path.join(shadow.paths.ws, MAIN);
  const main = readFileSync(file, 'utf8');
  if (main.split(from).length !== 2) throw new Error(`Main.lean does not hold exactly one ${JSON.stringify(from)}`);
  writeFileSync(file, main.replace(from, () => to));
}

/** Main.lean in ws/, read or written directly (no commit): a write in progress, or one taken back by hand. */
const readMain = (shadow: ShadowWorkspace): string => readFileSync(path.join(shadow.paths.ws, MAIN), 'utf8');
const writeMain = (shadow: ShadowWorkspace, text: string): void => writeFileSync(path.join(shadow.paths.ws, MAIN), text);

/** The engine's private Lean seams, spied on its prototype (vi.restoreAllMocks restores them after each test). */
type EngineSeams = {
  leanStdin: (shadow: ShadowWorkspace, job: unknown, source: string) => Promise<{ ok: true; run: RunLeanResult } | { ok: false; environment?: string; budget?: string }>;
  ghostScratchCheck: (...args: unknown[]) => Promise<unknown>;
};
const seamsOf = (engine: LeanCheckEngine): EngineSeams => Object.getPrototypeOf(engine) as EngineSeams;

/** A Lean run's result for a canned answer. */
const leanRun = (over: Partial<RunLeanResult> = {}): RunLeanResult => ({ status: 'ok', exitCode: 0, stdout: '', stderr: '', durationMs: 1, unit: 'telelean-fake', ...over });
/** One message of `lean --json` at a 1-based line. */
const leanMessage = (line: number, severity: 'error' | 'information', data: string): string => JSON.stringify({ severity, pos: { line, column: 0 }, data });
/** The 1-based line of the ghost file that starts with `prefix`. */
function lineOf(source: string, prefix: string): number {
  const at = source.split('\n').findIndex((l) => l.startsWith(prefix));
  if (at < 0) throw new Error(`the ghost file has no line starting with ${JSON.stringify(prefix)}`);
  return at + 1;
}

// ===================================================================================== fake refreshFacts: no Lean

describe('a session step reaches judgeState with its scope, S₀ and the session\'s records (fake refreshFacts and judgeState)', () => {
  it('check, freeze and gate judge with the step\'s scope, S₀ with its facts, its freeze and every record; evaluateRules never runs', async () => {
    const runId = runIdFor('scope');
    const shadow = await newShadow('scope', runId);
    const s0 = await shadow.commit('step-start', 'Step 1 starts', 1);
    editWs(shadow, 'formalise-normative');
    const seen: JudgeInput[] = [];
    const refreshed: LeanFacts[] = [];
    const refresh = async (): Promise<LeanFacts> => {
      const facts = factsWith({ status: 'ok', durationMs: 1 }, { startedAt: `refresh ${refreshed.length + 1}` });
      refreshed.push(facts);
      return facts;
    };
    let stepFindings: GateFinding[] = [];
    const core = fakeCore(permittedAxioms(), {
      evaluateRules: () => {
        throw new Error('a session step never runs evaluateRules');
      },
      judgeState: (input) => (seen.push(input), fakeJudgement(input, { stepFindings })),
    });
    const engine = createLeanCheckEngine({ core, refreshFacts: refresh });
    const records = {
      ledger: [{ kind: 'created', name: 'Spyro.InGame', step: 's0', phase: 'statements' }] as LedgerEntry[],
      items: [],
      premises: [],
      ended: ['some-earlier-target'],
      rejectedArrows: [{ source: 'a', target: 'b' }],
      noAlternative: true,
    };
    const ctx = stepCtx(shadow, runId, s0.id, {}, records);

    // check: S₀ is built first (this engine never saw its files), then ws/.
    const check = await engine.check(ctx);
    expect(check.outcome).toBe('ok');
    expect(refreshed).toHaveLength(2);
    const [first] = seen;
    expect(first).toMatchObject({ purpose: 'check', stage: 'prove', commit: '', scope: SCOPE, noAlternative: true });
    expect(first?.scope).toBe(ctx.session?.scope);
    for (const field of ['inferences', 'ledger', 'items', 'premises', 'ended', 'rejectedArrows'] as const) expect(first?.[field]).toBe(ctx.session?.[field]);
    expect(first?.freeze).toBeUndefined();
    expect(first?.stepStart?.files.get(MAIN)?.text).toBe(spyroModelFiles().get(MAIN));
    expect(first?.stepStart?.facts).toBe(refreshed[0]);
    expect(first?.current.facts).toBe(refreshed[1]);
    expect(first?.current.files.get(MAIN)?.text).toContain('abbrev pg_no_dark_past');
    expect(check.judgement?.purpose).toBe('check');

    // A second check of the same step: S₀'s facts are kept (one refresh, of ws/).
    await engine.check(ctx);
    expect(refreshed).toHaveLength(3);
    expect(seen[1]?.stepStart?.facts).toBe(refreshed[0]);

    // gate: the judged commit and the step's freeze.
    const record = fakeFreezeRecord(await shadow.commit('freeze', 'Statements frozen (round 1)', 1), permittedAxioms());
    const gate = await engine.gate({ ...ctx, freeze: record, status: 'not_proved' });
    expect(gate.passed).toBe(true);
    expect(seen[2]).toMatchObject({ purpose: 'gate-other', commit: gate.commit?.id });
    expect(seen[2]?.freeze).toBe(record.snapshot);
    expect(gate.judgement).toBe(gate.check.judgement);
    expect(gate.judgement?.commit).toBe(gate.commit?.id);

    // freeze: judged with no freeze (it is the step's freeze); refused on a step finding, with no challenge.
    stepFindings = [other];
    const frozen = await engine.freeze({ ...ctx, freeze: record });
    expect(frozen).toMatchObject({ ok: false, refusals: [other.message] });
    expect(seen[3]?.purpose).toBe('freeze');
    expect(seen[3]?.freeze).toBeUndefined();
    expect(frozen.report.judgement).toBeDefined();
    stepFindings = [];

    // The next step starts where this one ended: its S₀'s facts are those of the last build of those files.
    const s0b = await shadow.commit('step-start', 'Step 2 starts', 1);
    const before = refreshed.length;
    await engine.check(stepCtx(shadow, runId, s0b.id));
    expect(refreshed).toHaveLength(before + 1);
    expect(seen.at(-1)?.stepStart?.facts).toBe(refreshed[before - 1]);

    // After a reload (a new engine), S₀ is built once more, then kept.
    const reloaded = createLeanCheckEngine({ core, refreshFacts: refresh });
    const at = refreshed.length;
    await reloaded.check(stepCtx(shadow, runId, s0b.id));
    expect(refreshed).toHaveLength(at + 2);
    expect(seen.at(-1)?.stepStart?.facts).toBe(refreshed[at]);
    await reloaded.check(stepCtx(shadow, runId, s0b.id));
    expect(refreshed).toHaveLength(at + 3);
  });

  it('a step purpose in a session needs its scope and S₀, for the step\'s own target (TypeError, nothing run)', async () => {
    const runId = runIdFor('scopebad');
    const shadow = await newShadow('scopebad', runId);
    const s0 = await shadow.commit('step-start', 'Step 1 starts', 1);
    const engine = createLeanCheckEngine({ core: fakeCore(), refreshFacts: async () => OK_FACTS });
    const noScope = contextFor(shadow, runId, { session: session({ stepStartCommit: s0.id }) });
    await expect(engine.check(noScope)).rejects.toThrow(TypeError);
    await expect(engine.check(contextFor(shadow, runId, { session: session({ scope: SCOPE }) }))).rejects.toThrow(/stepStartCommit/u);
    await expect(engine.gate({ ...stepCtx(shadow, runId, s0.id, { selection: { subject: 'Spyro', target: 'new-spyro-pg', premises: [], adoptedGhosts: [] } }), status: 'not_proved' })).rejects.toThrow(/scope.target/u);
    await expect(engine.check(contextFor(shadow, runId, { session: { ...session(), ledger: 'x' } as unknown as SessionCheckContext }))).rejects.toThrow(/ledger/u);
    // A session's ghost check needs the draft's Lean name, under which its facts are kept (fixer 2b3b r1, F-FC-5): the
    // caller's mistake, never "telelean could not read the suggested statement back". Without a session it is unused.
    const ghost = { naturalName: 'x', leanStatement: 'True', proof: 'fun _ => trivial' };
    await expect(engine.checkGhost(stepCtx(shadow, runId, s0.id), ghost)).rejects.toThrow(/ghost\.leanName/u);
    await expect(engine.checkGhost(stepCtx(shadow, runId, s0.id), { ...ghost, leanName: '' })).rejects.toThrow(TypeError);
    expect(await engine.checkGhost(stepCtx(shadow, runId, s0.id), { ...ghost, leanName: 'x' })).toEqual({ ok: false, problems: [GHOST_NEEDS_FREEZE] });
    expect(await engine.checkGhost(contextFor(shadow, runId), ghost)).toEqual({ ok: false, problems: [GHOST_NEEDS_FREEZE] });
  });
});

describe('a failed probe on the session path (§2.1, AP30-3; fake refreshFacts and judgeState)', () => {
  const engineWith = (facts: LeanFacts, stepFindings: GateFinding[], over: Partial<StateJudgement> = {}): LeanCheckEngine =>
    createLeanCheckEngine({ core: fakeCore(permittedAxioms(), { judgeState: (input) => fakeJudgement(input, { stepFindings, ...over }) }), refreshFacts: async () => facts });

  it('check, freeze_statements, a proved and a not-proved finish: probeFailure\'s sentence as an environment outcome when stepFindings are empty or only source-only, the findings otherwise; never a pass', async () => {
    const runId = runIdFor('probe');
    const shadow = await newShadow('probe', runId);
    const s0 = await shadow.commit('step-start', 'Step 1 starts', 1);
    const ctx = stepCtx(shadow, runId, s0.id);
    const record = fakeFreezeRecord(await shadow.commit('freeze', 'Statements frozen (round 1)', 1), permittedAxioms());
    for (const facts of [FAILED, CUT]) {
      const sentence = probeFailure(facts) as string;
      for (const findings of [[], [sourceOnly], [sourceOnly, sourceOnly]]) {
        const engine = engineWith(facts, findings);
        const label = `${facts.probe?.status} ${findings.length}`;
        const check = await engine.check(ctx);
        expect(check, label).toMatchObject({ outcome: 'environment', environment: sentence, findings: [], g0: [] });
        expect(check.judgement).toBeDefined();
        expect(await engine.freeze(ctx)).toMatchObject({ ok: false, environment: sentence, refusals: [sentence] });
        for (const status of ['proved', 'not_proved'] as const) {
          const gated = await engine.gate({ ...ctx, freeze: record, status });
          expect(gated, `${label} ${status}`).toMatchObject({ passed: false, environment: sentence, findings: [] });
          expect(gated.comparator).toBeUndefined();
        }
      }
      // Another finding: Claude's to fix (counted), no environment; never a pass.
      const engine = engineWith(facts, [other, sourceOnly]);
      expect(await engine.check(ctx)).toMatchObject({ outcome: 'problems', findings: [other, sourceOnly] });
      const frozen = await engine.freeze(ctx);
      expect(frozen).toMatchObject({ ok: false, refusals: [other.message, UNSEEN_PROOF] });
      expect(frozen.ok ? undefined : frozen.environment).toBeUndefined();
      for (const status of ['proved', 'not_proved'] as const) {
        const gated = await engine.gate({ ...ctx, freeze: record, status });
        expect(gated).toMatchObject({ passed: false, findings: [other, sourceOnly] });
        expect(gated.environment).toBeUndefined();
      }
    }
  });

  it('the step decides on stepFindings, never on the judgement\'s ok alone: ok false without a finding passes; a finding fails with a probe that worked', async () => {
    const runId = runIdFor('okalone');
    const shadow = await newShadow('okalone', runId);
    const s0 = await shadow.commit('step-start', 'Step 1 starts', 1);
    const ctx = stepCtx(shadow, runId, s0.id);
    const record = fakeFreezeRecord(await shadow.commit('freeze', 'Statements frozen (round 1)', 1), permittedAxioms());
    const partial = engineWith(OK_FACTS, [], { ok: false, problems: [{ code: 'unowned', text: 'an old unowned line' }] });
    expect((await partial.check(ctx)).outcome).toBe('ok');
    const gated = await partial.gate({ ...ctx, freeze: record, status: 'not_proved' });
    expect(gated).toMatchObject({ passed: true, findings: [] });
    expect(gated.judgement?.ok).toBe(false);
    const finding = engineWith(OK_FACTS, [other]);
    expect(await finding.check(ctx)).toMatchObject({ outcome: 'problems', findings: [other] });
    expect(await finding.gate({ ...ctx, freeze: record, status: 'not_proved' })).toMatchObject({ passed: false, findings: [other] });
    // A build error the rules did not report still fails the step (fail closed).
    const error = { severity: 'error' as const, file: MAIN, module: 'Model.Spyro.Main', range: { start: { line: 2, character: 0 }, end: { line: 2, character: 0 } }, text: 'unknown identifier' };
    const broken = engineWith(factsWith({ status: 'ok', durationMs: 1 }, { status: 'build-errors', build: { status: 'failed', durationMs: 0, messages: [error], failedModules: ['Model.Spyro.Main'] } }), []);
    expect((await broken.check(ctx)).findings.map((f) => f.code)).toEqual(['build']);
  });

  it('judge and finalCheck on facts whose probe failed: a partial stage judgement with the sentence, and a final check that fails with it, never an environment outcome (real judgeState)', async () => {
    const runId = runIdFor('probestage');
    const shadow = await newShadow('probestage', runId);
    for (const facts of [FAILED, CUT]) {
      const engine = createLeanCheckEngine({ core: fakeCore(), refreshFacts: async () => facts });
      // A premise draft not written yet: on a state whose probe failed it is not checked again (it would fail for
      // telelean's reason), so no scratch job runs and its record stays as it is.
      const ctx = stageCtx(shadow, runId, { premises: [premiseDraft()] });
      const { judgement, report } = await engine.judge(ctx);
      expect(report.outcome).not.toBe('environment');
      expect(report.environment).toBeUndefined();
      expect(judgement.purpose).toBe('stage');
      expect(judgement.ok).toBe(false);
      const problem = REVIEW_TEXTS.factsProbeFailed(probeFailure(facts, { detail: false }) as string);
      expect(judgement.problems.filter((p) => p.code === 'facts').map((p) => p.text)).toEqual([problem]);
      expect(judgement.premiseChecks).toBeUndefined();

      const final = await engine.finalCheck(ctx);
      expect(final.passed).toBe(false);
      expect(final.environment).toBeUndefined();
      expect(final.judgement.purpose).toBe('final');
      expect(final.failures).toContainEqual({ rule: 'facts', text: problem });
      // The backstop's `facts` refusal names the cause, Lean's detail included.
      expect(final.backstop.filter((r) => r.code === 'facts').map((r) => r.text)).toEqual([probeFailure(facts)]);
      expect(final.failures).toContainEqual({ rule: 'backstop', text: probeFailure(facts) });
      expect(final.comparator).toEqual({});
    }
  });

  it('writePremise on facts whose probe failed: { ok: false } with the sentence as environment and no written key; no commit', async () => {
    const runId = runIdFor('probewrite');
    const shadow = await newShadow('probewrite', runId);
    const draft = premiseDraft();
    for (const facts of [FAILED, CUT]) {
      const engine = createLeanCheckEngine({ core: fakeCore(), refreshFacts: async () => facts });
      const commits = (await shadow.commits()).length;
      const sentence = probeFailure(facts) as string;
      const answer = await engine.writePremise(stageCtx(shadow, runId, { premises: [draft] }), { item: premiseKey(T, draft.leanName), draft, card: 'cynder-dark-past' });
      expect(answer).toEqual({ ok: false, error: sentence.slice(0, -1), environment: sentence });
      expect(await shadow.commits()).toHaveLength(commits);
    }
  });
});

describe('Lean could not judge the state (a sandbox status or a budget; fake refreshFacts)', () => {
  it('judge: the files judged without facts, the report an environment or budget outcome; finalCheck: not passed, with the environment or the budget\'s failure; writePremise: { ok: false }', async () => {
    const runId = runIdFor('sandbox');
    const shadow = await newShadow('sandbox', runId);
    const sandbox = factsWith(undefined, { status: 'could-not-start', detail: 'bwrap failed' });
    const budget = factsWith(undefined, { status: 'timeout', detail: 'check: killed after 120000 ms' });
    const stage = stageCtx(shadow, runId);
    const draft = premiseDraft();

    const off = createLeanCheckEngine({ core: fakeCore(), refreshFacts: async () => sandbox });
    const judged = await off.judge(stage);
    expect(judged.report).toMatchObject({ outcome: 'environment', environment: 'the Lean sandbox could not start: bwrap failed' });
    expect(judged.judgement.ok).toBe(false);
    expect(judged.judgement.problems.map((p) => p.code)).toContain('facts');
    const final = await off.finalCheck(stage);
    expect(final).toMatchObject({ passed: false, environment: 'the Lean sandbox could not start: bwrap failed', failures: [], backstop: [], reusedFileChecks: false });
    expect(await off.writePremise(stage, { item: 'premise:x:y', draft, card: 'cynder-dark-past' })).toEqual({ ok: false, error: 'the Lean sandbox could not start: bwrap failed', environment: 'the Lean sandbox could not start: bwrap failed' });

    const slow = createLeanCheckEngine({ core: fakeCore(), refreshFacts: async () => budget });
    const timed = await slow.judge(stage);
    expect(timed.report.outcome).toBe('problems');
    expect(timed.report.findings.map((f) => f.code)).toEqual(['budget']);
    expect(timed.judgement.ok).toBe(false);
    const late = await slow.finalCheck(stage);
    expect(late.passed).toBe(false);
    expect(late.environment).toBeUndefined();
    expect(late.failures[0]).toMatchObject({ rule: 'build' });
    expect(late.failures[0]?.text).toContain('did not finish within the limit');
    const write = await slow.writePremise(stage, { item: 'premise:x:y', draft, card: 'cynder-dark-past' });
    expect(write.ok).toBe(false);
    expect(write.ok ? '' : write.error).toContain('did not finish within the limit');
    expect(write.ok ? undefined : write.environment).toBeUndefined();
  });
});

describe('a premise write on a state that does not build (§3.8; fake refreshFacts)', () => {
  it('{ ok: false } with Lean\'s first error; nothing rendered, no commit', async () => {
    const runId = runIdFor('writebuild');
    const shadow = await newShadow('writebuild', runId);
    const error = { severity: 'error' as const, file: MAIN, module: 'Model.Spyro.Main', range: { start: { line: 2, character: 0 }, end: { line: 2, character: 0 } }, text: 'unknown identifier' };
    const broken = factsWith({ status: 'ok', durationMs: 1 }, { status: 'build-errors', build: { status: 'failed', durationMs: 0, messages: [error], failedModules: ['Model.Spyro.Main'] } });
    const engine = createLeanCheckEngine({ core: fakeCore(), refreshFacts: async () => broken });
    const fake = recordingHost(path.join(tmp, 'fake-host-writebuild'));
    const commits = (await shadow.commits()).length;
    const answer = await engine.writePremise(stageCtx(shadow, runId, {}, { job: jobFor(runId, { host: fake.host }) }), { item: 'premise:x:y', draft: premiseDraft(), card: 'cynder-dark-past' });
    expect(answer).toEqual({ ok: false, error: `${MAIN}:3:0: error: unknown identifier` });
    expect(fake.calls()).toEqual([]);
    expect(await shadow.commits()).toHaveLength(commits);
  });
});

describe('judge\'s premise re-checks: what telelean could not judge is left out, and an outcome stands until its reliance changes (fixer 2b3b r1; fake refreshFacts, judgeState and Lean answers)', () => {
  const inference: InferenceJudgement = {
    target: T,
    passes: true,
    verdict: 'not-proved',
    flags: [],
    footprint: [],
    direct: [],
    extra: [],
    contrib: { 'cynder-dark-past': { kind: 'claim' } },
    permitted: ['Spyro.cynder_dark_past.holds'],
    throughResults: [],
    restsOn: [],
    band: { used: [], notNeeded: [], complete: true, open: [] },
    missing: [],
    findings: [],
  };
  const engineFor = (over: Parameters<typeof fakeCore>[1] = {}): LeanCheckEngine =>
    createLeanCheckEngine({ core: fakeCore(permittedAxioms(), { judgeState: (input) => fakeJudgement(input, { inferences: { [T]: inference } }), ...over }), refreshFacts: async () => OK_FACTS });
  type Answer = (source: string) => Awaited<ReturnType<EngineSeams['leanStdin']>>;
  const printLine = (source: string) => lineOf(source, '#print axioms ');
  const noAxioms = (source: string) => leanMessage(printLine(source), 'information', "'Spyro.telelean_ghost_check' does not depend on any axioms");

  it('a budget, a run that failed with no message, an error only in the file\'s header or in telelean\'s own lines, no #print axioms answer, or B.2 that could not see the proof: the draft is left out, nothing is remembered, and the next judge checks it again; an error in the proof is the suggestion\'s', async () => {
    const runId = runIdFor('recheckfake');
    const shadow = await newShadow('recheckfake', runId);
    const engine = engineFor();
    const answers: Answer[] = [];
    const lean = vi.spyOn(seamsOf(engine), 'leanStdin').mockImplementation(async (_shadow, _job, source) => {
      const next = answers.shift();
      if (next === undefined) throw new Error('no Lean answer scripted');
      return next(source);
    });
    const draft = premiseDraft();
    const item = premiseKey(T, draft.leanName);
    const ctx = stageCtx(shadow, runId, { premises: [draft] });
    const cases: Array<[string, Answer]> = [
      ['a budget (the scratch job ran out of time or memory under telelean\'s cap)', () => ({ ok: false, budget: "telelean's check ran out of time (killed after 1 ms)" })],
      ['a run that failed with no message', () => ({ ok: true, run: leanRun({ status: 'failed', exitCode: 139, stderr: 'Segmentation fault' }) })],
      [
        'an error in the file\'s header (its imports), which every later line fails with',
        (source) => ({ ok: true, run: leanRun({ status: 'failed', exitCode: 1, stdout: [leanMessage(1, 'error', "unknown module prefix 'Model'"), leanMessage(lineOf(source, 'abbrev telelean_ghost_stmt'), 'error', "unknown identifier 'Character'")].join('\n') }) }),
      ],
      ['an error only in telelean\'s own lines (the #print after the proof)', (source) => ({ ok: true, run: leanRun({ status: 'failed', exitCode: 1, stdout: leanMessage(printLine(source), 'error', 'unknown constant') }) })],
      ['no #print axioms answer', () => ({ ok: true, run: leanRun() })],
      ['B.2 that could not see what the proof uses (no value probe line)', (source) => ({ ok: true, run: leanRun({ stdout: noAxioms(source) }) })],
    ];
    for (const [label, answer] of cases) {
      const calls = lean.mock.calls.length;
      answers.push(answer);
      const { judgement } = await engine.judge(ctx);
      expect(lean.mock.calls.length, label).toBe(calls + 1);
      expect(judgement.premiseChecks, label).toBeUndefined();
    }
    // An error in the proof is the suggestion's: it no longer closes the gap (its facts kept), and that is remembered.
    answers.push((source) => ({ ok: true, run: leanRun({ status: 'failed', exitCode: 1, stdout: leanMessage(lineOf(source, 'abbrev telelean_ghost_stmt') + 2, 'error', 'type mismatch') }) }));
    const failed = await engine.judge(ctx);
    expect(failed.judgement.premiseChecks).toEqual({ [item]: { closesGap: false, facts: draft.facts } });
    expect(lean).toHaveBeenCalledTimes(cases.length + 1);

    // F-FC-1, A-V2B3B-ADV-3: a decision then moves the head (that judge's judge-apply is dropped, §2.6) and changes
    // nothing the draft relies on: the next judge reports the same outcome again, with no Lean job.
    const vocabulary = path.join(shadow.paths.ws, 'Model/Spyro/Vocabulary.lean');
    writeFileSync(vocabulary, `${readFileSync(vocabulary, 'utf8')}-- an unrelated decision\n`);
    await shadow.commit('decision', 'A decision on another item', 1);
    const again = await engine.judge(ctx);
    expect(again.judgement.commit).not.toBe(failed.judgement.commit);
    expect(again.judgement.premiseChecks).toEqual({ [item]: { closesGap: false, facts: draft.facts } });
    expect(lean).toHaveBeenCalledTimes(cases.length + 1);
  });

  it('a draft whose text the single-term rule refuses no longer closes the gap, with no Lean job (A-V2B3B-ADV-4)', async () => {
    const runId = runIdFor('rechecktext');
    const shadow = await newShadow('rechecktext', runId);
    const engine = engineFor({ ghostTextProblems });
    const lean = vi.spyOn(seamsOf(engine), 'leanStdin').mockResolvedValue({ ok: false, environment: 'no Lean in this test' });
    const sneaky = premiseDraft({ leanName: 'sneaky', proof: 'fun h => h -- end Spyro' });
    const { judgement } = await engine.judge(stageCtx(shadow, runId, { premises: [sneaky] }));
    expect(judgement.premiseChecks).toEqual({ [premiseKey(T, 'sneaky')]: { closesGap: false, facts: sneaky.facts } });
    expect(lean).not.toHaveBeenCalled();
  });
});

/** A premise draft for the target (the literal reading's bridge), as the ghost check would give it. */
function premiseDraft(over: Partial<PremiseDraft> = {}): PremiseDraft {
  return {
    target: T,
    step: 's1',
    naturalName: 'A character who cannot be in a game would not be a good addition to it',
    leanName: 'not_in_game_not_good',
    leanStatement: '∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g',
    explicit: '∀ (c : Spyro.Character) (g : Spyro.Game), Not (Spyro.InGame c g) → Not (Spyro.GoodAddition c g)',
    whyNeeded: 'the literal reading needs a bridge',
    proof: 'fun h => h cynder newSpyro (pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds)',
    footprint: [],
    aloneEntails: false,
    facts: {},
    ...over,
  };
}

describe('G0 runs first, before any Lean job, at every purpose (AP30-1 r2; fake refreshFacts as a spy)', () => {
  it('ws/ holding `@[init] def x : IO Unit := pure ()`: G0\'s finding at every purpose, and refreshFacts, renderStatements and syncMirror are never called, nor any Lean process', async () => {
    const runId = runIdFor('g0');
    const shadow = await newShadow('g0', runId);
    const s0 = await shadow.commit('step-start', 'Step 1 starts', 1);
    let refreshes = 0;
    let syncs = 0;
    const realSync = shadow.syncMirror.bind(shadow);
    const spied: ShadowWorkspace = Object.assign(Object.create(Object.getPrototypeOf(shadow) as object) as ShadowWorkspace, shadow, {
      syncMirror: (files?: ReadonlyMap<string, string>) => {
        syncs++;
        return realSync(files);
      },
    });
    const fake = recordingHost(path.join(tmp, 'fake-host-g0'));
    const job = jobFor(runId, { host: fake.host });
    // The real G0 (core), and real rules otherwise: only the facts are a fake (a spy).
    const engine = createLeanCheckEngine({
      refreshFacts: async () => {
        refreshes++;
        return OK_FACTS;
      },
    });
    const engineProto = Object.getPrototypeOf(engine) as { renderNow: unknown; renderStatements: unknown };
    const renderNow = vi.spyOn(engineProto as { renderNow: () => Promise<unknown> }, 'renderNow');
    const renderPublic = vi.spyOn(engine, 'renderStatements');
    appendToMain(spied, '@[init] def x : IO Unit := pure ()');
    const isG0 = (f: GateFinding | undefined) => f !== undefined && f.step === 'G0';
    const refusesInit = (findings: readonly GateFinding[]) => findings.length > 0 && findings.every(isG0) && findings.some((f) => f.code === 'metaprogramming');
    const step = stepCtx(spied, runId, s0.id, { job });
    const record = fakeFreezeRecord(await shadow.commit('freeze', 'Statements frozen (round 1)', 1), permittedAxioms());

    // Step purposes: G0's findings, counted (problems), with no judgement.
    const check = await engine.check(step);
    expect(check.outcome).toBe('problems');
    expect(refusesInit(check.g0)).toBe(true);
    expect(check.judgement).toBeUndefined();
    const frozen = await engine.freeze(step);
    expect(frozen.ok).toBe(false);
    expect(refusesInit(frozen.report.g0)).toBe(true);
    for (const status of ['proved', 'not_proved'] as const) {
      const gated = await engine.gate({ ...step, freeze: record, status });
      expect(gated.passed, status).toBe(false);
      expect(refusesInit(gated.findings)).toBe(true);
      expect(gated.environment).toBeUndefined();
      expect(gated.judgement).toBeUndefined();
    }
    const ghost = await engine.checkGhost({ ...step, freeze: record }, { naturalName: 'x', leanStatement: 'True', proof: 'fun _ => trivial', leanName: 'x' });
    expect(ghost.ok).toBe(false);
    expect(ghost.ok ? [] : ghost.problems[0]).toBe('The files do not pass check_lean, so the suggestion was not checked. Fix these first:');

    // judge and finalCheck: the head (committed) judged without facts, G0's findings first in global, ok false.
    await shadow.commit('decision', 'The state judged', 1);
    const stage = stageCtx(spied, runId, {}, { job });
    const judged = await engine.judge(stage);
    expect(isG0(judged.judgement.global[0])).toBe(true);
    expect(judged.judgement.ok).toBe(false);
    expect(judged.judgement.problems.map((p) => p.code)).toContain('facts');
    expect(judged.report.outcome).toBe('problems');
    expect(refusesInit(judged.report.g0)).toBe(true);
    expect(judged.judgement.global.slice(0, judged.report.g0.length)).toEqual(judged.report.g0);
    const final = await engine.finalCheck(stage);
    expect(final.passed).toBe(false);
    expect(isG0(final.judgement.global[0])).toBe(true);
    expect(final.failures.find((f) => f.rule === 'rules')?.text).toBe(final.judgement.global[0]?.message);
    expect(final.failures.some((f) => f.rule === 'facts')).toBe(true);

    // writePremise and complete: { ok: false } with G0's first message; no commit.
    const draft = premiseDraft();
    const item = premiseKey(T, draft.leanName);
    const commits = (await shadow.commits()).length;
    const written = await engine.writePremise(stage, { item, draft, card: 'cynder-dark-past' });
    expect(written).toEqual({ ok: false, error: judged.judgement.global[0]?.message });
    await shadow.commit('adopt', 'Premise written', 1);
    const entry: LedgerEntry = { kind: 'premise', card: 'cynder-dark-past', target: T, holdAs: 'axiom', item, commit: '' };
    const withPremise = stageCtx(spied, runId, { ledger: [entry] }, { job, freeze: record });
    const completed = await engine.complete(withPremise, { item, draft, card: 'cynder-dark-past' });
    expect(completed).toEqual({ ok: false, error: judged.judgement.global[0]?.message });
    expect(await shadow.commits()).toHaveLength(commits + 1);

    // Fixer 2b3b r1 (F-FC-4, A-V2B3B-ADV-4): text G0 refuses reaches no Lean job from another state either. A step that
    // starts from a state holding it (a stage G0 refused is judged without facts, so no facts of it are kept), with ws/
    // without it (Claude took it out): S₀ is judged by G0 first, neither synced nor built, and the step's check is
    // telelean's environment outcome. A completion written on such a state, ws/ without it: refused with G0's message.
    const withInit = readMain(spied);
    const s0bad = await shadow.commit('step-start', 'Step 2 starts from a state G0 refuses', 1);
    writeMain(spied, spyroModelFiles().get(MAIN) ?? '');
    const fromBad = await engine.check(stepCtx(spied, runId, s0bad.id, { job }));
    expect(fromBad.outcome).toBe('environment');
    expect(fromBad.environment).toBe(`telelean could not build the state this step started from: it holds text that is not allowed in the model files (${judged.judgement.global[0]?.message ?? ''})`);
    expect(fromBad.g0).toEqual([]);
    expect(fromBad.judgement).toBeUndefined();
    expect(await engine.complete(withPremise, { item, draft, card: 'cynder-dark-past' })).toEqual({ ok: false, error: judged.judgement.global[0]?.message });
    expect(readMain(spied)).not.toBe(withInit);
    expect(await shadow.commits()).toHaveLength(commits + 2);

    expect(refreshes).toBe(0);
    expect(syncs).toBe(0);
    expect(renderNow).not.toHaveBeenCalled();
    expect(renderPublic).not.toHaveBeenCalled();
    expect(fake.calls()).toEqual([]);
  });
});

describe('one operation that uses the mirror at a time per run (2b3b: a judge runs outside the session\'s write queue)', () => {
  it('a judge and a premise write started together: each builds exactly its own files, the judge first', async () => {
    const runId = runIdFor('lock');
    const shadow = await newShadow('lock', runId);
    const built: string[] = [];
    const engine = createLeanCheckEngine({
      core: fakeCore(permittedAxioms(), { judgeState: (input) => fakeJudgement(input) }),
      // A slow build: it reads the mirror only after a pause, as Lean reads its files after starting.
      refreshFacts: async (request: RefreshRequest) => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        built.push(readFileSync(path.join(request.root, MAIN), 'utf8'));
        return OK_FACTS;
      },
    });
    // The premise write's files are in ws/ (its step 2); the head is still B.
    appendToMain(shadow, '-- the premise written');
    const written = readFileSync(path.join(shadow.paths.ws, MAIN), 'utf8');
    const fake = recordingHost(path.join(tmp, 'fake-host-lock'));
    const ctx = stageCtx(shadow, runId, {}, { job: jobFor(runId, { host: fake.host }) });
    const [judged, write] = await Promise.all([engine.judge(ctx), engine.writePremise(ctx, { item: 'premise:x:y', draft: premiseDraft(), card: 'cynder-dark-past' })]);
    expect(built).toEqual([spyroModelFiles().get(MAIN), written]);
    expect(judged.judgement.filesKey).not.toBe('');
    // The write's render could not start (a fake host), so it failed: what matters is what each one built.
    expect(write.ok).toBe(false);
  });
});

describe('judge and finalCheck: the context they take (§2.9)', () => {
  it('pass validateContext with the first inference\'s selection, stage and round; need ctx.session (TypeError otherwise)', async () => {
    const runId = runIdFor('ctx');
    const shadow = await newShadow('ctx', runId);
    const engine = createLeanCheckEngine({ core: fakeCore(), refreshFacts: async () => OK_FACTS });
    const ctx = stageCtx(shadow, runId, {}, { selection: { subject: 'Spyro', target: T, premises: ALL, adoptedGhosts: [] }, stage: 'prove', round: 2 });
    const judged = await engine.judge(ctx);
    expect(judged.judgement.purpose).toBe('stage');
    expect(judged.judgement.commit).toBe((await shadow.commits()).at(-1)?.id);
    expect((await engine.finalCheck(ctx)).judgement.purpose).toBe('final');
    const { session: _s, ...plain } = ctx;
    await expect(engine.judge(plain)).rejects.toThrow(/judge needs ctx.session/u);
    await expect(engine.finalCheck(plain)).rejects.toThrow(/finalCheck needs ctx.session/u);
    await expect(engine.writePremise(plain, { item: 'premise:x:y', draft: premiseDraft(), card: 'c' })).rejects.toThrow(/writePremise needs ctx.session/u);
    await expect(engine.complete(plain, { item: 'premise:x:y', draft: premiseDraft(), card: 'c' })).rejects.toThrow(/complete needs ctx.session/u);
    await expect(engine.judge({ ...ctx, round: -1 })).rejects.toThrow(/ctx.round/u);
    await expect(engine.writePremise(ctx, { item: 'premise:x:y', draft: { ...premiseDraft(), explicit: undefined } as unknown as PremiseDraft, card: 'c' })).rejects.toThrow(TypeError);
    await expect(engine.finalCheck(ctx, { judgement: judged.judgement } as unknown as Parameters<LeanCheckEngine['finalCheck']>[1])).rejects.toThrow(TypeError);
  });

  it('complete refuses, before anything runs, a target that is no inference of the session, a missing last freeze or another target\'s, a premise not written (no ledger entry, or its card not in the state the completion starts from), and a target proved there; never for the commit\'s kind (fixer 2b3b r1)', async () => {
    const runId = runIdFor('completeearly');
    const shadow = await newShadow('completeearly', runId);
    let refreshes = 0;
    const engine = createLeanCheckEngine({ core: fakeCore(), refreshFacts: async () => (refreshes++, OK_FACTS) });
    const record = fakeFreezeRecord(await shadow.commit('freeze', 'Statements frozen (round 1)', 1), permittedAxioms());
    const item = premiseKey(T, premiseDraft().leanName);
    const entry: LedgerEntry = { kind: 'premise', card: 'cynder-dark-past', target: T, holdAs: 'axiom', item, commit: '' };
    const ctx = stageCtx(shadow, runId, { ledger: [entry] }, { freeze: record });
    const premise = { item, draft: premiseDraft(), card: 'cynder-dark-past' };
    expect(await engine.complete(ctx, { ...premise, draft: premiseDraft({ target: 'new-spyro-pg' }) })).toEqual({ ok: false, error: '“new-spyro-pg” is not an inference of this session' });
    const { freeze: _f, ...unfrozen } = ctx;
    expect(await engine.complete(unfrozen, premise)).toEqual({ ok: false, error: 'the completion of “cynder-not-good” needs its last freeze' });
    // A-V2B3B-ADV-7: T's own last freeze, never another target's.
    const others = { ...record, selection: { ...record.selection, target: 'new-spyro-pg' } };
    expect(await engine.complete({ ...ctx, freeze: others }, premise)).toEqual({ ok: false, error: 'the completion of “cynder-not-good” needs that target\'s last freeze, not the one of “new-spyro-pg”' });
    // F-FC-2: what the completion needs, in the state it is written on (here a `freeze` commit: the kind never counts).
    expect(await engine.complete(stageCtx(shadow, runId, {}, { freeze: record }), premise)).toEqual({ ok: false, error: `the completion of “cynder-not-good” needs its premise written first (no ledger entry for ${item})` });
    expect(await engine.complete(ctx, { ...premise, card: 'no-such-card' })).toEqual({
      ok: false,
      error: 'the completion of “cynder-not-good” needs its premise\'s card no-such-card, which the state it starts from (the freeze commit) does not hold',
    });
    const statement = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';
    replaceInMain(shadow, statement, `${statement}theorem cynder_not_good.holds : cynder_not_good := sorry\n`);
    await shadow.commit('decision', 'A state where the target is proved', 1);
    expect(await engine.complete(ctx, premise)).toEqual({ ok: false, error: '“cynder-not-good” is already proved in the state its completion starts from (the decision commit)' });
    expect(refreshes).toBe(0);
  });

  it('judge reads the head commit\'s files, never ws/ (a write in progress); finalCheck reuses the facts only for an ok judgement of exactly F', async () => {
    const runId = runIdFor('head');
    const shadow = await newShadow('head', runId);
    const refreshed: string[] = [];
    const seen: JudgeInput[] = [];
    const engine = createLeanCheckEngine({
      core: fakeCore(permittedAxioms(), { judgeState: (input) => (seen.push(input), fakeJudgement(input)) }),
      refreshFacts: async (request: RefreshRequest) => (refreshed.push(readFileSync(path.join(request.root, MAIN), 'utf8')), OK_FACTS),
    });
    const ctx = stageCtx(shadow, runId);
    editWs(shadow, 'formalise-normative'); // a write in progress: ws/ is not the head
    const judged = await engine.judge(ctx);
    expect(seen[0]?.current.files.get(MAIN)?.text).toBe(spyroModelFiles().get(MAIN));
    expect(refreshed).toEqual([spyroModelFiles().get(MAIN)]);
    // The same head again: the mirror's facts reused, no build.
    await engine.judge(ctx);
    expect(refreshed).toHaveLength(1);
    // The final check judges F, ws/ at the end, only when ws/ is exactly the newest commit (fixer 2b3b r1,
    // A-V2B3B-ADV-6): ws/ ahead of it, or a commit ws/ is not at, is telelean's environment outcome, nothing built.
    const behind = await engine.finalCheck(ctx, { judgement: judged.judgement, comparator: {} });
    expect(behind).toMatchObject({ passed: false, reusedFileChecks: false, failures: [], backstop: [] });
    expect(behind.environment).toBe("telelean's working copy is not its newest recorded state (the base commit), so the final check did not run: reload the window to recover the session");
    const written = readMain(shadow);
    const stray = await shadow.commit('adopt', 'A commit the working copy is not at', 1);
    writeMain(shadow, spyroModelFiles().get(MAIN) ?? '');
    const astray = await engine.finalCheck(ctx);
    expect(astray.passed).toBe(false);
    expect(astray.environment).toContain('(the adopt commit)');
    expect(astray.judgement.commit).toBe(stray.id);
    expect(refreshed).toHaveLength(1);
    writeMain(shadow, written);
    await shadow.revertTo((await shadow.commits()).find((c) => c.kind === 'base')?.id ?? '', 'Back to B', 1);
    // The final check reuses them only for an ok judgement of exactly F's files; a fresh build otherwise.
    expect((await engine.finalCheck(ctx, { judgement: judged.judgement, comparator: {} })).reusedFileChecks).toBe(true);
    expect(refreshed).toHaveLength(1);
    expect((await engine.finalCheck(ctx, { judgement: { ...judged.judgement, ok: false }, comparator: {} })).reusedFileChecks).toBe(false);
    expect(refreshed).toHaveLength(2);
    expect((await engine.finalCheck(ctx, { judgement: { ...judged.judgement, filesKey: 'other' }, comparator: {} })).reusedFileChecks).toBe(false);
    expect((await engine.finalCheck(ctx)).reusedFileChecks).toBe(false);
    expect(refreshed).toHaveLength(4);
  });
});

// ===================================================================================== real Lean

/** The Spyro fixture whose target selects only two of its three arrows in B (new-spyro-pg is not drawn). */
function twoArrowSpyro(): Map<string, string> {
  const files = spyroModelFiles();
  const main = files.get(MAIN) ?? '';
  const drawn = 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past';
  if (!main.includes(drawn)) throw new Error('the Spyro fixture changed');
  files.set(MAIN, main.replace(drawn, 'premises: cynder-dark-past, pg-no-dark-past'));
  return files;
}

describe('the challenge exported again when E(T) grows after the freeze (D2-19, §3.3 step 5; real Lean)', () => {
  const runId = runIdFor('reexport');
  const two = { sources: ['cynder-dark-past', 'pg-no-dark-past'], fromNothing: false };
  const scope: StepScope = { ...SCOPE, question: two };
  const selection = { subject: 'Spyro', target: T, premises: two.sources, adoptedGhosts: [] };
  const arrow: LedgerEntry = { kind: 'arrow', source: 'new-spyro-pg', target: T, step: 's1', why: 'the game must be PG' };
  let shadow: ShadowWorkspace;
  let engine: LeanCheckEngine;
  let record: NonNullable<CheckContext['freeze']>;
  let gateCtx: CheckContext;

  beforeAll(async () => {
    shadow = await newShadow('reexport', runId, twoArrowSpyro());
    engine = createLeanCheckEngine();
    expect((await engine.checkBase(contextFor(shadow, runId))).outcome).toBe('ok');
    const s0 = await shadow.commit('step-start', 'Step 1 starts', 1);
    const records = (ledger: LedgerEntry[] = []): SessionCheckContext => ({ ...session({ inferences: [{ ...INFERENCE, question: two }], ledger }), scope, stepStartCommit: s0.id });
    editWs(shadow, 'formalise-normative');
    const frozen = await engine.freeze(contextFor(shadow, runId, { selection, stage: 'formalise', session: records() }));
    if (!frozen.ok) throw new Error(`freeze refused: ${frozen.refusals.join('; ')}`);
    record = frozen.record;
    gateCtx = contextFor(shadow, runId, { selection, stage: 'prove', freeze: record, session: records([arrow]) });
  });

  it('a ghost check right after propose_arrow (a ledger arrow, no file changed since the freeze cached its clean check): B.1 and B.2 with that arrow\'s source, from the session\'s records as they are now (fixer 2b3b r1, F-FC-3)', async () => {
    // ws/ is the frozen state; the context's ledger now holds the step's arrow new-spyro-pg -> T, not drawn yet.
    const ghost = await engine.checkGhost(gateCtx, {
      naturalName: 'The new Spyro game is rated PG',
      leanStatement: 'IsPG newSpyro',
      proof: 'fun _ => pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds',
      leanName: 'game_is_pg',
    });
    if (!ghost.ok) throw new Error(`the ghost check refused: ${ghost.problems.join('\n')}`);
    expect(ghost.footprint).toContain('Spyro.new_spyro_pg.holds');
    expect(ghost.facts).toBeDefined();
  });

  it('a proved finish whose B.1 set grew gets a new challenge from the freeze\'s copy and passes; the ghost check then uses E(T) too', async () => {
    expect(record.snapshot.permitted.all).toContain('Spyro.pg_no_dark_past.holds');
    expect(record.snapshot.permitted.all).not.toContain('Spyro.new_spyro_pg.holds');
    expect(record.freeze.permittedAxioms).toEqual(record.snapshot.permitted.all);

    // Claude proposes new-spyro-pg -> T (a ledger arrow, drawn at normalise) and proves T with all three.
    replaceInMain(shadow, 'premises: cynder-dark-past, pg-no-dark-past', 'premises: cynder-dark-past, pg-no-dark-past, new-spyro-pg');
    editWs(shadow, 'prove-normative');
    await engine.normalise(gateCtx);
    const gated = await engine.gate({ ...gateCtx, status: 'proved' });
    expect(gated.findings).toEqual([]);
    expect(gated.environment).toBeUndefined();
    expect(gated.comparator).toEqual({ verdict: 'accepted' });
    expect(gated.passed).toBe(true);
    const renewed = gated.freeze;
    if (renewed === undefined) throw new Error('no challenge was exported again');
    expect(renewed.snapshot.permitted.all).toContain('Spyro.new_spyro_pg.holds');
    expect(renewed.freeze.permittedAxioms).toContain('Spyro.new_spyro_pg.holds');
    expect(renewed.commit).toEqual(record.commit);
    expect(renewed.round).toBe(record.round);
    expect(renewed.snapshot.declarations).toEqual(record.snapshot.declarations);
    // Built from the freeze's copy, not from the gated state: the same sources (no proof, B's two arrows).
    const copy = (exportPath: string) => readFileSync(path.join(path.dirname(exportPath), 'project', MAIN), 'utf8');
    expect(renewed.freeze.exportPath).not.toBe(record.freeze.exportPath);
    expect(copy(renewed.freeze.exportPath)).toBe(copy(record.freeze.exportPath));
    expect(copy(renewed.freeze.exportPath)).not.toContain('cynder_not_good.holds');
    expect(copy(renewed.freeze.exportPath)).toContain('premises: cynder-dark-past, pg-no-dark-past\n');
    expect(existsSync(path.join(path.dirname(renewed.freeze.exportPath), 'project', '.lake'))).toBe(false);

    // The ghost check in this state (§3.8): B.1's permitted set and B.2's sources with E(T), not the freeze's. A gap
    // proof that uses new-spyro-pg directly passes, though the freeze's set and the selection both lack it.
    const ghost = await engine.checkGhost(gateCtx, {
      naturalName: 'The new Spyro game is rated PG',
      leanStatement: 'IsPG newSpyro',
      proof: 'fun _ => pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds',
      leanName: 'game_is_pg',
    });
    if (!ghost.ok) throw new Error(`the ghost check refused: ${ghost.problems.join('\n')}`);
    expect(ghost.footprint).toContain('Spyro.new_spyro_pg.holds');
    expect(ghost.explicit).toBe('Spyro.IsPG Spyro.newSpyro');
    expect(Object.keys(ghost.facts ?? {})).toEqual(['Spyro.game_is_pg', 'Spyro.game_is_pg.holds']);
  });

  it('a definition changed after the freeze, with the rules made to pass: the challenge exported again from the freeze\'s copy holds the frozen definition, so G4 still refuses it', async () => {
    await shadow.revertTo(record.commit.id, 'back to the freeze', 1);
    replaceInMain(shadow, 'premises: cynder-dark-past, pg-no-dark-past', 'premises: cynder-dark-past, pg-no-dark-past, new-spyro-pg');
    editWs(shadow, 'cheat-weakened-abbrev');
    const lenient = createLeanCheckEngine({ core: { judgeState: (input) => ({ ...judgeState(input), stepFindings: [] }) } });
    const cheat = await lenient.gate({ ...gateCtx, status: 'proved' });
    expect(cheat.freeze).toBeDefined();
    expect(cheat.comparator).toMatchObject({ verdict: 'rejected', reason: 'definition-mismatch' });
    expect(cheat.findings.map((f) => f.code)).toEqual(['comparator-definition-mismatch']);
    expect(cheat.passed).toBe(false);
    expect(await unitsOfRun(runId)).toEqual([]);
  });
});

describe('a session\'s freeze takes B.1\'s permitted set, with E(T) (§3.3, D2-19; real Lean)', () => {
  it('an arrow the step proposed before freezing: its source\'s `.holds` is permitted in the freeze and its challenge, though the question does not select it', async () => {
    const runId = runIdFor('freezeet');
    const shadow = await newShadow('freezeet', runId, twoArrowSpyro());
    const engine = createLeanCheckEngine();
    expect((await engine.checkBase(contextFor(shadow, runId))).outcome).toBe('ok');
    const s0 = await shadow.commit('step-start', 'Step 1 starts', 1);
    const two = { sources: ['cynder-dark-past', 'pg-no-dark-past'], fromNothing: false };
    replaceInMain(shadow, 'premises: cynder-dark-past, pg-no-dark-past', 'premises: cynder-dark-past, pg-no-dark-past, new-spyro-pg');
    editWs(shadow, 'formalise-normative');
    const arrow: LedgerEntry = { kind: 'arrow', source: 'new-spyro-pg', target: T, step: 's1', why: 'the game must be PG' };
    const ctx = contextFor(shadow, runId, {
      selection: { subject: 'Spyro', target: T, premises: two.sources, adoptedGhosts: [] },
      stage: 'formalise',
      session: { ...session({ inferences: [{ ...INFERENCE, question: two }], ledger: [arrow] }), scope: { ...SCOPE, question: two }, stepStartCommit: s0.id },
    });
    const check = await engine.check(ctx);
    const b1 = check.judgement?.inferences[T]?.permitted ?? [];
    expect(b1).toContain('Spyro.new_spyro_pg.holds');
    const frozen = await engine.freeze(ctx);
    if (!frozen.ok) throw new Error(`freeze refused: ${frozen.refusals.join('; ')}`);
    expect([...frozen.record.snapshot.permitted.all].sort()).toEqual([...b1].sort());
    expect(frozen.record.freeze.permittedAxioms).toContain('Spyro.new_spyro_pg.holds');
    expect(frozen.record.snapshot.permitted.selected).toContain('Spyro.new_spyro_pg.holds');
    expect(await unitsOfRun(runId)).toEqual([]);
  });
});

describe('the final check\'s comparator: each proof of the session on its permitted set in F, a recorded pass reused (EN-2; real Lean, fake rules)', () => {
  it('runs a challenge and the comparator for the proved target when nothing else failed; reuses a pass for the same files and set; refuses an axiom outside it', async () => {
    const runId = runIdFor('finalg4');
    const shadow = await newShadow('finalg4', runId);
    const real = createLeanCheckEngine();
    expect((await real.checkBase(contextFor(shadow, runId))).outcome).toBe('ok');
    editWs(shadow, 'formalise-normative', 'prove-normative');
    await shadow.commit('gate-pass', 'The step passed', 1);
    let permitted: string[] = [];
    const engine = createLeanCheckEngine({
      core: {
        // Every rule and the backstop pass; T is proved, with `permitted` as its set in F.
        judgeState: (input) => ({ ...judgeState(input), ok: true, global: [], stepFindings: [], problems: [], inferences: { [T]: { ...(judgeState(input).inferences[T] as NonNullable<StateJudgement['inferences'][string]>), verdict: 'proved', permitted, findings: [] } } }),
        applyBackstop: () => ({ ok: true, refusals: [] }),
      },
    });
    const ctx = stageCtx(shadow, runId);
    const dirs = () => readdirSync(shadow.paths.frozenDir).length;
    permitted = permittedAxioms().all;
    const passed = await engine.finalCheck(ctx);
    expect(passed.failures).toEqual([]);
    expect(passed.environment).toBeUndefined();
    expect(passed.passed).toBe(true);
    expect(passed.comparator).toEqual({ [T]: { filesKey: passed.judgement.filesKey, permitted } });
    expect(dirs()).toBe(1);
    // The same F and set again: the recorded pass is reused (no challenge, no comparator).
    const reused = await engine.finalCheck(ctx, { judgement: passed.judgement, comparator: passed.comparator ?? {} });
    expect(reused.passed).toBe(true);
    expect(reused.reusedFileChecks).toBe(true);
    expect(dirs()).toBe(1);
    // A recorded pass for another files key or another set is not.
    const other = await engine.finalCheck(ctx, { judgement: passed.judgement, comparator: { [T]: { filesKey: 'other', permitted } } });
    expect(other.passed).toBe(true);
    expect(dirs()).toBe(2);
    // A set without new_spyro_pg.holds: the comparator refuses the proof that uses it.
    permitted = permittedAxioms().all.filter((a) => a !== 'Spyro.new_spyro_pg.holds');
    const refused = await engine.finalCheck(ctx, { judgement: passed.judgement, comparator: passed.comparator ?? {} });
    expect(refused.passed).toBe(false);
    expect(refused.failures.map((f) => f.rule)).toEqual(['comparator']);
    expect(refused.failures[0]?.text).toContain('Spyro.new_spyro_pg.holds');
    expect(refused.comparator).toEqual({});
    expect(await unitsOfRun(runId)).toEqual([]);
  });
});

describe('the final check refuses a footprint outside the recomputed permitted set (§3.10; real Lean)', () => {
  it('a proof that uses an axiom card the question does not select: `permitted` on F; with that arrow selected, none', async () => {
    const runId = runIdFor('final');
    const shadow = await newShadow('final', runId);
    const engine = createLeanCheckEngine();
    expect((await engine.checkBase(contextFor(shadow, runId))).outcome).toBe('ok');
    editWs(shadow, 'formalise-normative', 'prove-normative');
    await shadow.commit('gate-pass', 'The step passed', 1);
    const two: SessionInference = { ...INFERENCE, question: { sources: ['cynder-dark-past', 'pg-no-dark-past'], fromNothing: false } };
    const final = await engine.finalCheck(stageCtx(shadow, runId, { inferences: [two] }));
    expect(final.passed).toBe(false);
    expect(final.environment).toBeUndefined();
    const permitted = final.failures.filter((f) => f.rule === 'permitted');
    expect(permitted.length).toBeGreaterThan(0);
    expect(permitted.map((f) => f.text).join('\n')).toContain('Spyro.new_spyro_pg.holds');
    expect(final.judgement.inferences[T]?.permitted).not.toContain('Spyro.new_spyro_pg.holds');
    // The same F, its third arrow selected: the recomputed set covers the footprint.
    const all = await engine.finalCheck(stageCtx(shadow, runId));
    expect(all.failures.filter((f) => f.rule === 'permitted')).toEqual([]);
    expect(all.judgement.inferences[T]?.permitted).toContain('Spyro.new_spyro_pg.holds');
    expect(await unitsOfRun(runId)).toEqual([]);
  });
});

describe('judge\'s re-checks follow what a gap proof relies on beyond its footprint (fixer 2b3b r1, A-V2B3B-ADV-1; real Lean)', () => {
  it('a source\'s statement reworded under the same constants, then a lemma of a gap proof taken out: each draft is checked again and no longer closes the gap; an unchanged one keeps its outcome with no Lean job', async () => {
    const runId = runIdFor('reliance');
    const lemma = 'theorem helper_l : ¬ GoodAddition cynder newSpyro → cynder_not_good := fun h => h';
    const files = spyroModelFiles();
    const main = files.get(MAIN) ?? '';
    if (!main.endsWith('\nend Spyro\n')) throw new Error('the Spyro fixture changed');
    const shadow = await newShadow('reliance', runId);
    const engine = createLeanCheckEngine();
    expect((await engine.checkBase(contextFor(shadow, runId))).outcome).toBe('ok');
    appendToMain(shadow, lemma);
    await shadow.commit('gate-pass', 'Step 1 ended, not proved (a lemma written)', 1);
    const scratch = vi.spyOn(seamsOf(engine), 'ghostScratchCheck');
    // A: its gap proof uses cynder_dark_past.holds (in its footprint); its statement is behind it.
    const darkStatement = 'HasDarkPast cynder → ¬ GoodAddition cynder newSpyro';
    const dark = premiseDraft({
      naturalName: 'A dark past rules Cynder out',
      leanName: 'dark_rules_out',
      leanStatement: darkStatement,
      explicit: 'Spyro.HasDarkPast Spyro.cynder → Not (Spyro.GoodAddition Spyro.cynder Spyro.newSpyro)',
      proof: 'fun h => h cynder_dark_past.holds',
      footprint: ['Spyro.cynder_dark_past.holds', 'Spyro.HasDarkPast', 'Spyro.GoodAddition'],
      facts: statementFactsOf({ namespace: 'Spyro', leanName: 'dark_rules_out', statement: darkStatement, valueConsts: ['Spyro.HasDarkPast', 'Spyro.GoodAddition', 'Spyro.cynder', 'Spyro.newSpyro'], typeConsts: [] }),
    });
    // B: its gap proof uses the lemma, a theorem, which no `#print axioms` lists.
    const viaLemma = premiseDraft({
      naturalName: 'Cynder would not be a good addition',
      leanName: 'cynder_not_good_assumed',
      leanStatement: '¬ GoodAddition cynder newSpyro',
      explicit: 'Not (Spyro.GoodAddition Spyro.cynder Spyro.newSpyro)',
      proof: 'fun h => helper_l h',
      footprint: [],
      aloneEntails: true,
      facts: statementFactsOf({ namespace: 'Spyro', leanName: 'cynder_not_good_assumed', statement: '¬ GoodAddition cynder newSpyro', valueConsts: ['Spyro.GoodAddition', 'Spyro.cynder', 'Spyro.newSpyro'], typeConsts: [] }),
    });
    const a = premiseKey(T, dark.leanName);
    const b = premiseKey(T, viaLemma.leanName);
    const created: LedgerEntry = { kind: 'created', name: 'Spyro.helper_l', step: 's1', phase: 'proof' };
    const stage = stageCtx(shadow, runId, { ledger: [created], premises: [dark, viaLemma] });
    const closes = (j: StateJudgement) => Object.fromEntries(Object.entries(j.premiseChecks ?? {}).map(([k, v]) => [k, v.closesGap]));

    const first = await engine.judge(stage);
    expect(closes(first.judgement)).toEqual({ [a]: true, [b]: true });
    expect(scratch).toHaveBeenCalledTimes(2);
    // Fixer 2d r1 (F-V2D-FC-8): each passed re-check gives the statement's fully explicit form (Lean's, as the ghost
    // check renders it), which the session fills into a draft that has none.
    expect(first.report.premiseExplicit).toEqual({ [a]: dark.explicit, [b]: viaLemma.explicit });
    // Nothing changed: both outcomes again (F-FC-1), no Lean job.
    const same = await engine.judge(stage);
    expect(same.judgement.premiseChecks).toEqual(first.judgement.premiseChecks);
    expect(same.report.premiseExplicit).toEqual(first.report.premiseExplicit);
    expect(scratch).toHaveBeenCalledTimes(2);

    // (a) A decision rewords the source's statement with the same constants: its `.holds` keeps its facts, so only the
    // closure behind the footprint shows the change. A is checked again; B relies on nothing of it.
    replaceInMain(shadow, 'abbrev cynder_dark_past : Prop := HasDarkPast cynder', 'abbrev cynder_dark_past : Prop := ¬ HasDarkPast cynder');
    await shadow.commit('decision', 'The source reworded', 1);
    const reworded = await engine.judge(stage);
    expect(closes(reworded.judgement)).toEqual({ [a]: false, [b]: true });
    expect(reworded.judgement.premiseChecks?.[a]?.facts).toEqual(dark.facts);
    // A check that failed gives no form; B's comes again from its unchanged check.
    expect(reworded.report.premiseExplicit).toEqual({ [b]: viaLemma.explicit });
    expect(scratch).toHaveBeenCalledTimes(3);

    // (b) A decision takes the lemma out (the gap proof's own constant): B is checked again; A keeps its outcome.
    replaceInMain(shadow, `${lemma}\n`, '');
    await shadow.commit('decision', 'The lemma taken out', 1);
    const noLemma = await engine.judge(stage);
    expect(closes(noLemma.judgement)).toEqual({ [a]: false, [b]: false });
    expect(scratch).toHaveBeenCalledTimes(4);
    expect(await unitsOfRun(runId)).toEqual([]);
  });
});

describe('an Add premise in a session: the ghost check with E(T), judge\'s re-checks, writePremise and complete (§3.8, F11; real Lean)', () => {
  const runId = runIdFor('premise');
  let shadow: ShadowWorkspace;
  let refreshes = 0;
  let engine: LeanCheckEngine;
  let record: Parameters<LeanCheckEngine['gate']>[0]['freeze'];
  let draft: PremiseDraft;
  /** A second draft that alone entails the target: its gap check relies on nothing pg_no_dark_past says. */
  let alone: PremiseDraft;
  let stepEnd: string;
  let s0Id: string;
  /** Set by the premise write's test: the `adopt` commit, the premise's card and its ledger entry (carry-over R1-1). */
  let writtenAdopt = '';
  let writtenCard = '';
  let writtenEntry: LedgerEntry | undefined;
  const item = premiseKey(T, 'not_in_game_not_good');
  const created: LedgerEntry = { kind: 'created', name: 'Spyro.InGame', step: 's1', phase: 'statements' };

  beforeAll(async () => {
    shadow = await newShadow('premise', runId);
    engine = createLeanCheckEngine({
      refreshFacts: (request: RefreshRequest) => {
        refreshes++;
        return refreshLeanFacts(request);
      },
    });
    expect((await engine.checkBase(contextFor(shadow, runId))).outcome).toBe('ok');
    const s0 = await shadow.commit('step-start', 'Step 1 starts', 1);
    s0Id = s0.id;
    editWs(shadow, 'formalise-literal');
    const frozen = await engine.freeze(stepCtx(shadow, runId, s0.id, { stage: 'formalise' }));
    if (!frozen.ok) throw new Error(`freeze refused: ${frozen.refusals.join('; ')}`);
    record = frozen.record;
    const ghost = await engine.checkGhost(stepCtx(shadow, runId, s0.id, { freeze: record }), {
      naturalName: premiseDraft().naturalName,
      leanStatement: premiseDraft().leanStatement,
      proof: premiseDraft().proof,
      leanName: 'not_in_game_not_good',
    });
    if (!ghost.ok) throw new Error(`the ghost check refused: ${ghost.problems.join('\n')}`);
    draft = premiseDraft({ explicit: ghost.explicit ?? '', footprint: ghost.footprint, aloneEntails: ghost.aloneEntails, facts: ghost.facts ?? {}, leanStatement: ghost.statement ?? '' });
    const second = await engine.checkGhost(stepCtx(shadow, runId, s0.id, { freeze: record }), {
      naturalName: 'Cynder would not be a good addition',
      leanStatement: '¬ GoodAddition cynder newSpyro',
      proof: 'fun h => h',
      leanName: 'cynder_not_good_assumed',
    });
    if (!second.ok) throw new Error(`the second ghost check refused: ${second.problems.join('\n')}`);
    alone = premiseDraft({
      naturalName: 'Cynder would not be a good addition',
      leanName: 'cynder_not_good_assumed',
      leanStatement: second.statement ?? '',
      explicit: second.explicit ?? '',
      proof: 'fun h => h',
      footprint: second.footprint,
      aloneEntails: second.aloneEntails,
      facts: second.facts ?? {},
    });
    stepEnd = (await shadow.commit('gate-pass', 'Step 1 ended, not proved', 1)).id;
  });

  it('the ghost check with E(T) gives the statement\'s explicit form and its scratch facts under the draft\'s name', () => {
    expect(draft.explicit).toBe('∀ (c : Spyro.Character) (g : Spyro.Game), Not (Spyro.InGame c g) → Not (Spyro.GoodAddition c g)');
    expect(Object.keys(draft.facts)).toEqual(['Spyro.not_in_game_not_good', 'Spyro.not_in_game_not_good.holds']);
    expect([...(draft.facts['Spyro.not_in_game_not_good']?.valueConsts ?? [])].sort()).toEqual(['Spyro.Character', 'Spyro.Game', 'Spyro.GoodAddition', 'Spyro.InGame']);
    expect(draft.facts['Spyro.not_in_game_not_good']?.typeConsts).toEqual([]);
    expect(draft.facts['Spyro.not_in_game_not_good.holds']?.typeConsts).toEqual(['Spyro.not_in_game_not_good']);
    expect(draft.footprint).toContain('Spyro.new_spyro_pg.holds');
    expect(draft.aloneEntails).toBe(false);
  });

  it('a session ghost check that cannot read the statement\'s own probe back refuses the suggestion (fail closed; fixer 2b3b r1, A-V2B3B-ADV-5)', async () => {
    // Lean's real answer, without the line of the file's second probe (the statement's).
    const seams = seamsOf(engine);
    const real = seams.leanStdin;
    const lean = vi.spyOn(seams, 'leanStdin').mockImplementation(async function (this: unknown, shadowArg: ShadowWorkspace, job: unknown, source: string) {
      const answer = await real.call(this, shadowArg, job, source);
      const probes = source.split('\n').flatMap((l, i) => (l.startsWith('#eval show Lean.CoreM Unit from do') ? [i + 1] : []));
      const second = probes[1];
      if (!answer.ok || second === undefined) throw new Error('the session ghost file has no second probe, or Lean did not run');
      const atSecond = (l: string): boolean => {
        try {
          return (JSON.parse(l) as { pos?: { line?: number } }).pos?.line === second;
        } catch {
          return false;
        }
      };
      const kept = answer.run.stdout.split('\n').filter((l) => !atSecond(l));
      if (kept.length === answer.run.stdout.split('\n').length) throw new Error('Lean printed nothing at the statement probe\'s line');
      return { ok: true, run: { ...answer.run, stdout: kept.join('\n') } };
    });
    const unread = await engine.checkGhost(stepCtx(shadow, runId, s0Id, { freeze: record }), {
      naturalName: premiseDraft().naturalName,
      leanStatement: premiseDraft().leanStatement,
      proof: premiseDraft().proof,
      leanName: 'not_in_game_not_good',
    });
    expect(lean).toHaveBeenCalledTimes(1);
    expect(unread).toEqual({ ok: false, problems: ['telelean could not read the suggested statement back from Lean (its fully explicit form, or what it uses), so the suggestion was not checked.'] });
  });

  it('judge checks a draft again when its reliance changed (its footprint\'s `.holds` changed): it no longer closes the gap; nothing changed: the same outcomes, no re-check; another draft keeps its outcome', async () => {
    expect(alone.aloneEntails).toBe(true);
    expect(alone.footprint).not.toContain('Spyro.pg_no_dark_past.holds');
    const otherItem = premiseKey(T, 'cynder_not_good_assumed');
    const stage = stageCtx(shadow, runId, { ledger: [created], premises: [draft, alone] });
    const first = await engine.judge(stage);
    expect(first.judgement.commit).toBe(stepEnd);
    expect(Object.keys(first.judgement.premiseChecks ?? {}).sort()).toEqual([otherItem, item].sort());
    expect(first.judgement.premiseChecks?.[otherItem]?.closesGap).toBe(true);
    expect(first.judgement.premiseChecks?.[item]?.closesGap).toBe(true);
    expect(first.judgement.premiseChecks?.[item]?.facts['Spyro.not_in_game_not_good']?.valueConsts).toEqual(draft.facts['Spyro.not_in_game_not_good']?.valueConsts);
    const builds = refreshes;
    // Nothing changed: both outcomes reported again (fixer 2b3b r1, F-FC-1), with no build and no Lean job.
    const scratch = vi.spyOn(seamsOf(engine), 'ghostScratchCheck');
    const again = await engine.judge(stage);
    expect(again.judgement.premiseChecks).toEqual(first.judgement.premiseChecks);
    expect(refreshes).toBe(builds);
    expect(scratch).not.toHaveBeenCalled();
    // pg_no_dark_past (its `.holds` is in the gap proof's footprint) now says GoodAddition where it said InGame.
    replaceInMain(shadow, 'HasDarkPast c → ¬ InGame c g', 'HasDarkPast c → ¬ GoodAddition c g');
    await shadow.commit('decision', 'A decision changed the premise\'s statement', 1);
    const changed = await engine.judge(stage);
    expect(changed.judgement.premiseChecks).toEqual({ [item]: { closesGap: false, facts: draft.facts }, [otherItem]: first.judgement.premiseChecks?.[otherItem] });
    expect(scratch).toHaveBeenCalledTimes(1);
    // A written draft is never checked again here (its item is computed from ws/); the written premise joins E(T),
    // which the other draft's gap check relies on, so that one is checked again.
    await shadow.revertTo(stepEnd, 'back to the step\'s end', 1);
    const written = await engine.judge(stageCtx(shadow, runId, { ledger: [created, { kind: 'premise', card: 'x', target: T, holdAs: 'axiom', item, commit: '' }], premises: [draft, alone] }));
    expect(Object.keys(written.judgement.premiseChecks ?? {})).toEqual([otherItem]);
    // Builder 2d (carry-over R1-3): checked again, not only reported again (outcomes are re-emitted since fixer 2b3b r1).
    expect(scratch).toHaveBeenCalledTimes(2);
  });

  it('writePremise renders P where it was written, returns the written item\'s key, and reports a mismatch; complete freezes again from the state it starts from, refuses a change outside T\'s proof and a definition the comparator rejects, and passes a good completion replayed after recover()\'s revert', async () => {
    // The premise write (as 2f writes it): the card, its arrow into T, its ledger entry.
    const files = await shadow.currentFiles();
    const lean = [...files.keys()].filter((p) => p.endsWith('.lean') && p.startsWith('Model'));
    const model = buildProjectModel({ files: lean.map((p) => parseLeanFile(p, files.get(p) ?? '')), fileHashes: {}, library: 'Model' });
    const plan = planGhostAdoption(model, {
      subject: 'Spyro',
      target: T,
      naturalName: draft.naturalName,
      leanStatement: draft.leanStatement,
      leanName: draft.leanName,
      holdAs: 'axiom',
      session: runId,
      today: '2026-11-20',
    });
    await shadow.writeFiles(plan.changes);
    const premiseEntry: LedgerEntry = { kind: 'premise', card: plan.nodeId, target: T, holdAs: 'axiom', item, commit: '' };
    const stage = stageCtx(shadow, runId, { ledger: [created, premiseEntry], premises: [draft] });
    const written = await engine.writePremise(stage, { item, draft, card: plan.nodeId });
    if (!written.ok) throw new Error(`the premise write failed: ${written.error}`);
    expect(written.meaningMatches).toBe(true);
    expect(written.explicit).toBe(draft.explicit);
    const head = (await shadow.commits()).at(-1);
    expect(head?.kind).toBe('adopt');
    expect(written.judgement).toMatchObject({ commit: head?.id, purpose: 'stage' });
    const writtenDraft = written.judgement.drafts.find((d) => d.key === item);
    expect(writtenDraft?.kind).toBe('add-premise');
    expect(writtenDraft?.factsMissing).toBeUndefined();
    expect(writtenDraft?.contentKey).not.toBe(premiseDraftKey(draft));
    expect(writtenDraft?.provides.cards).toContain(plan.nodeId);
    // A draft whose explicit form differs from what Lean prints where it was written: a mismatch, still judged.
    const mismatched = await engine.writePremise(stage, { item, draft: { ...draft, explicit: draft.explicit.replace('Not (Spyro.InGame c g)', 'Spyro.InGame c g') }, card: plan.nodeId });
    expect(mismatched).toMatchObject({ ok: true, meaningMatches: false, explicit: draft.explicit });

    // The completion (as 2f writes it), its ledger entry; T's last freeze is the step's.
    const adoptId = (await shadow.commits()).at(-1)?.id ?? '';
    const adoptMain = readMain(shadow);
    const statement = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';
    if (!adoptMain.includes(statement)) throw new Error('the target\'s statement moved');
    const completionMain = adoptMain.replace(statement, () => `${statement}theorem cynder_not_good.holds : cynder_not_good :=\n  (${draft.proof}) not_in_game_not_good.holds\n`);
    writeMain(shadow, completionMain);
    const completion = stageCtx(shadow, runId, { ledger: [created, premiseEntry, { kind: 'completion', target: T, item, commit: '' }], premises: [draft] }, { freeze: record });
    const premise = { item, draft, card: plan.nodeId };
    // statement-changed against T's last freeze snapshot comes first: a statement changed since refuses, with no commit.
    const commits = (await shadow.commits()).length;
    const frozenDirs = readdirSync(shadow.paths.frozenDir).length;
    if (record === undefined) throw new Error('no freeze');
    const stale = { ...record, snapshot: { ...record.snapshot, declarations: { ...record.snapshot.declarations, 'Spyro.pg_no_dark_past': { kind: 'def', type: 'Prop', value: 'True' } } } };
    const refused = await engine.complete({ ...completion, freeze: stale }, premise);
    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.error).toContain('changed after freeze_statements');
    expect(await shadow.commits()).toHaveLength(commits);
    expect(readdirSync(shadow.paths.frozenDir)).toHaveLength(frozenDirs);

    // Fixer 2b3b r1 (A-V2B3B-ADV-5): a completion that also changes something outside T's proof (an axiom of its own):
    // the gate's step findings refuse it (only T's proof is open), with no commit.
    writeMain(shadow, completionMain.replace('\nend Spyro\n', '\naxiom extra_fact : True\nend Spyro\n'));
    const extra = await engine.complete(completion, premise);
    expect(extra.ok).toBe(false);
    expect(extra.ok ? '' : extra.error).toContain('extra_fact');
    expect(await shadow.commits()).toHaveLength(commits);
    // ... and one whose rules are made to pass, with the target's statement weakened after the state it starts from:
    // the challenge frozen from that state holds the old definition, so the comparator refuses it, with no commit.
    writeMain(shadow, adoptMain);
    editWs(shadow, 'cheat-weakened-abbrev');
    const lenient = createLeanCheckEngine({ core: { judgeState: (input) => ({ ...judgeState(input), stepFindings: [] }) } });
    const cheat = await lenient.complete(completion, premise);
    expect(cheat.ok).toBe(false);
    expect(cheat.ok ? '' : cheat.error).toContain('a definition the frozen statement depends on changed');
    expect(await shadow.commits()).toHaveLength(commits);

    // F-FC-2: a crash during the completion's write (its text in ws/, no commit yet). recover() reverts ws/ to the
    // session's head, the adopt commit, with a `revert` commit, and runs the write again: the replay starts from that
    // `revert` commit (the adopt state), and passes.
    writeMain(shadow, completionMain);
    await shadow.revertTo(adoptId, 'Recovered: back to the session head', 1);
    const recovered = (await shadow.commits()).at(-1);
    expect(recovered?.kind).toBe('revert');
    expect([...(await shadow.filesAt(recovered?.id ?? ''))]).toEqual([...(await shadow.filesAt(adoptId))]);
    writeMain(shadow, completionMain);
    const completed = await engine.complete(completion, premise);
    if (!completed.ok) throw new Error(`the completion failed: ${completed.error}`);
    expect(completed.commit.kind).toBe('completion');
    expect((await shadow.commits()).at(-1)?.id).toBe(completed.commit.id);
    expect(completed.judgement).toMatchObject({ commit: completed.commit.id, purpose: 'stage' });
    expect(completed.judgement.inferences[T]?.verdict).not.toBe('not-proved');
    expect(completed.judgement.inferences[T]?.extra).toContain(plan.nodeId);
    // Frozen again from the adopt commit: its copy holds the written premise and no proof of T, and the comparator ran
    // with the premise's `.holds` permitted (the step's freeze lacked it).
    const dirs = readdirSync(shadow.paths.frozenDir).map(Number).sort((a, b) => a - b);
    const newest = String(dirs.at(-1));
    const copy = readFileSync(path.join(shadow.paths.frozenDir, newest, 'project', MAIN), 'utf8');
    expect(copy).toContain('abbrev not_in_game_not_good');
    expect(copy).not.toContain('cynder_not_good.holds');
    expect(record.snapshot.permitted.all).not.toContain('Spyro.not_in_game_not_good.holds');
    const gates = readdirSync(shadow.paths.gateDir).map(Number).sort((a, b) => a - b);
    const config = JSON.parse(readFileSync(path.join(shadow.paths.gateDir, String(gates.at(-1)), 'comparator.json'), 'utf8')) as { permitted_axioms: string[] };
    expect(config.permitted_axioms).toContain('Spyro.not_in_game_not_good.holds');
    // A second completion, on the state the first one proved T in: refused before anything runs.
    const twice = await engine.complete(completion, premise);
    expect(twice).toEqual({ ok: false, error: '“cynder-not-good” is already proved in the state its completion starts from (the completion commit)' });
    expect(await unitsOfRun(runId)).toEqual([]);
    writtenAdopt = adoptId;
    writtenCard = plan.nodeId;
    writtenEntry = premiseEntry;
  });

  it('complete passes on a later head that holds the written premise: a completion that becomes due after a decision, whose commit also changed something unrelated, freezes again from that decision state (fixer 2b3b r1, F-FC-2\'s second case; builder 2d, carry-over R1-1)', async () => {
    if (writtenAdopt === '' || writtenEntry === undefined) throw new Error('the premise write\'s test did not run first');
    // The adopt state again (as after a decision that took T's Result out), then a decision commit that also rewords
    // another card's docstring: its files differ from the adopt commit's, so only a rule that checks what the state
    // holds (never "the adopt commit's files") lets the completion start from it.
    await shadow.revertTo(writtenAdopt, 'Back to the premise write (T not proved)', 1);
    const docBefore = '/-- The new Spyro game is PG -/';
    const docAfter = '/-- The new Spyro game, as rated: PG -/';
    replaceInMain(shadow, docBefore, docAfter);
    const decision = await shadow.commit('decision', 'A decision that also changed another card', 1);
    expect([...(await shadow.filesAt(decision.id))]).not.toEqual([...(await shadow.filesAt(writtenAdopt))]);
    const commits = (await shadow.commits()).length;
    // The completion (as 2f writes it), on that head.
    const statement = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';
    const decisionMain = readMain(shadow);
    if (!decisionMain.includes(statement)) throw new Error('the target\'s statement moved');
    writeMain(shadow, decisionMain.replace(statement, () => `${statement}theorem cynder_not_good.holds : cynder_not_good :=\n  (${draft.proof}) not_in_game_not_good.holds\n`));
    const completion = stageCtx(shadow, runId, { ledger: [created, writtenEntry, { kind: 'completion', target: T, item, commit: '' }], premises: [draft] }, { freeze: record });
    const completed = await engine.complete(completion, { item, draft, card: writtenCard });
    if (!completed.ok) throw new Error(`the completion failed: ${completed.error}`);
    expect(completed.commit.kind).toBe('completion');
    expect(await shadow.commits()).toHaveLength(commits + 1);
    expect(completed.judgement.inferences[T]?.verdict).not.toBe('not-proved');
    // Frozen again from the decision state: the newest frozen copy holds the decision's change and no proof of T.
    const dirs = readdirSync(shadow.paths.frozenDir).map(Number).sort((a, b) => a - b);
    const copy = readFileSync(path.join(shadow.paths.frozenDir, String(dirs.at(-1)), 'project', MAIN), 'utf8');
    expect(copy).toContain(docAfter);
    expect(copy).not.toContain(docBefore);
    expect(copy).not.toContain('cynder_not_good.holds');
    expect(await unitsOfRun(runId)).toEqual([]);
  });
});
