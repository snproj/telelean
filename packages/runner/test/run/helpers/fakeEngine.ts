/**
 * A scriptable LeanCheckEngine for the RunManager's tests (WP2's real engine is a stub until integration). Each
 * method records its call (with the context fields the RunManager is responsible for) and answers from a handler the
 * test may replace; the defaults behave like the real engine on an honest run:
 *   checkBase/check  ok (no findings)
 *   freeze           commits `freeze` and returns a record with the 13-name Spyro permitted set
 *   normalise        no changes
 *   gate             judges a `checkpoint` commit (GateReport.commit); `not-frozen` for finish(proved) without a freeze
 *   checkGhost       ok, statement collapsed, aloneEntails false
 *   renderStatements pretty/explicit placeholders
 *   judge            (slice 2d) core `judgeState('stage')` on the shadow's head and base, both with fake facts (core's
 *                    test helper `fakeFacts`, value and type constants and the probe's marker), so an edit session's
 *                    queue ends in a real reconcile without Lean; `checkBase` keeps B's fake facts in base-facts.json
 *                    as the real engine keeps B's
 *   finalCheck, writePremise, complete   (slice 2b3b) unscripted: they throw until a test sets their handler
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildProjectModel, judgeState, parseLeanFile, type FileChange, type GateFinding, type LeanFacts, type PermittedAxioms, type ProjectModel } from '@telelean/core';

import type { PremiseDraft, StateJudgement } from '@telelean/core';

import { fakeFacts } from '../../../../core/test/project/helpers/fakeFacts.js';
import { filesKey } from '../../../src/gate/engine.js';

import type {
  CheckContext,
  CheckReport,
  CompletionReport,
  FinalCheckReport,
  FreezeOutcome,
  FreezeRecord,
  GateReport,
  GhostCheck,
  GhostCheckInput,
  LeanCheckEngine,
  PremiseWriteReport,
  RenderedStatement,
} from '../../../src/gate/types.js';
import type { FinishStatus } from '../../../src/llm/types.js';
import { sha256Text } from '../../../src/semantic/project.js';
import { isLeanModelPath } from '../../../src/shadow/paths.js';
import type { ShadowCommit, ShadowWorkspace } from '../../../src/shadow/types.js';

/**
 * A project model of a file set with fake facts (complete: value and type constants, the probe's marker). The modules'
 * source hashes are the files' real sha256, as a refresh records them, so a model the runner builds from the same files
 * (session.ts `filesModel`) reads these facts as fresh.
 */
export function fakeModel(files: ReadonlyMap<string, string>, library = 'Model', facts = true): ProjectModel {
  const parsed = [...files.keys()].filter((p) => isLeanModelPath(p, library)).sort().map((p) => parseLeanFile(p, files.get(p) ?? ''));
  const hashes = Object.fromEntries(parsed.map((f) => [f.path, sha256Text(f.text)]));
  let f: LeanFacts | undefined = facts ? fakeFacts(parsed, { library, valueConsts: true, typeConsts: true, probe: 'ok' }) : undefined;
  if (f !== undefined) f = { ...f, modules: f.modules.map((m) => ({ ...m, sourceSha256: hashes[m.file] ?? m.sourceSha256 })) };
  return buildProjectModel({ files: parsed, fileHashes: hashes, library, ...(f !== undefined ? { facts: f } : {}) });
}

/** Slice 2d: the default stage judge of the fake engine (see the module comment). */
export async function fakeStageJudge(ctx: CheckContext): Promise<{ judgement: StateJudgement; report: CheckReport }> {
  const shadow = ctx.shadow;
  const s = ctx.session;
  if (s === undefined) throw new TypeError('judge needs ctx.session');
  const commits = await shadow.commits();
  const head = commits.at(-1);
  const base = commits.find((c) => c.kind === 'base');
  if (head === undefined || base === undefined) throw new Error('the shadow has no commits');
  const files = await shadow.filesAt(head.id);
  const baseModel = fakeModel(await shadow.filesAt(base.id), shadow.library);
  const current = fakeModel(files, shadow.library);
  const judgement = judgeState({
    purpose: 'stage',
    stage: 'prove',
    commit: head.id,
    filesKey: filesKey(files),
    base: baseModel,
    current,
    inferences: s.inferences,
    ledger: s.ledger,
    items: s.items,
    premises: s.premises,
    ended: s.ended,
    rejectedArrows: s.rejectedArrows,
  });
  const report: CheckReport = { outcome: judgement.ok ? 'ok' : 'problems', g0: [], findings: [...judgement.global], diagnostics: [], durationMs: 1, model: current, base: baseModel, judgement };
  if (current.facts !== undefined) report.facts = current.facts;
  return { judgement, report };
}

/** Keeps B's fake facts in the run directory, as the real engine's checkBase keeps B's (base-facts.json). */
async function keepBaseFacts(shadow: ShadowWorkspace): Promise<void> {
  const base = (await shadow.commits()).find((c) => c.kind === 'base');
  if (base === undefined) return;
  const facts = fakeModel(await shadow.filesAt(base.id), shadow.library).facts;
  await writeFile(path.join(shadow.paths.runDir, 'base-facts.json'), `${JSON.stringify({ format: 'telelean-base-facts', version: 1, commit: base.id, facts })}\n`);
}

export const SPYRO_PERMITTED: PermittedAxioms = {
  standard: ['propext', 'Classical.choice', 'Quot.sound'],
  signature: ['Spyro.Character', 'Spyro.Game', 'Spyro.HasDarkPast', 'Spyro.IsPG', 'Spyro.GoodAddition'],
  selected: ['Spyro.cynder_dark_past.holds', 'Spyro.new_spyro_pg.holds', 'Spyro.pg_no_dark_past.holds'],
  presuppositions: ['Spyro.Character.exists', 'Spyro.Game.exists'],
  derivationFootprints: [],
  unusable: [],
  all: [
    'Classical.choice',
    'Quot.sound',
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
    'propext',
  ],
};

/** What a call looked like from the RunManager's side. */
export interface EngineCall {
  method: 'checkBase' | 'check' | 'freeze' | 'normalise' | 'gate' | 'checkGhost' | 'renderStatements' | 'judge' | 'finalCheck' | 'writePremise' | 'complete';
  round?: number;
  stage?: string;
  frozen?: boolean;
  freezeRound?: number;
  baseCommit?: string;
  roundStartCommit?: string;
  adoptedGhosts?: string[];
  teleleanBlocks?: string[];
  status?: FinishStatus;
  files?: string[];
  runId?: string;
  leanJobMs?: number;
  names?: string[];
  ghost?: GhostCheckInput;
}

export function okReport(extra: Partial<CheckReport> = {}): CheckReport {
  return { outcome: 'ok', g0: [], findings: [], diagnostics: [], durationMs: 1, build: { status: 'ok', durationMs: 1, errorCount: 0 }, ...extra };
}

export function finding(code: GateFinding['code'], message: string, extra: Partial<GateFinding> = {}): GateFinding {
  const step: GateFinding['step'] = code === 'build' || code === 'budget' ? 'G1' : code === 'markup' ? 'G5' : code.startsWith('comparator-') ? 'G4' : ['hash-command', 'sorry', 'set-option', 'import', 'bad-path'].includes(code) ? 'G0' : 'G3';
  return { step, code, message, ...extra };
}

type Handler<A extends unknown[], R> = (...args: A) => R | Promise<R>;

export class FakeEngine implements LeanCheckEngine {
  readonly calls: EngineCall[] = [];
  gateCalls = 0;
  checkCalls = 0;

  onCheckBase: Handler<[CheckContext], CheckReport> = () => okReport();
  onCheck: Handler<[CheckContext, number], CheckReport> = () => okReport();
  onFreeze: Handler<[CheckContext], FreezeOutcome | undefined> = () => undefined;
  onNormalise: Handler<[CheckContext], { changes: FileChange[]; commit?: ShadowCommit }> = () => ({ changes: [] });
  /** Return the findings of this gate call (default: none, or `not-frozen` for finish(proved) without a freeze). */
  onGate: Handler<[CheckContext & { status: FinishStatus }, number], Partial<GateReport> | undefined> = () => undefined;
  onCheckGhost: Handler<[CheckContext, GhostCheckInput], GhostCheck | undefined> = () => undefined;
  /** Slice 2d: the stage judge (default `fakeStageJudge`); finalCheck, writePremise and complete have no default. */
  onJudge: Handler<[CheckContext], { judgement: StateJudgement; report: CheckReport }> = (ctx) => fakeStageJudge(ctx);
  /** Slice 2d: whether checkBase keeps B's fake facts (default yes). */
  keepBaseFacts = true;
  onFinalCheck: Handler<[CheckContext], FinalCheckReport> = () => {
    throw new Error('FakeEngine.finalCheck is not scripted');
  };
  onWritePremise: Handler<[CheckContext, { item: string; draft: PremiseDraft; card: string }], PremiseWriteReport> = () => {
    throw new Error('FakeEngine.writePremise is not scripted');
  };
  onComplete: Handler<[CheckContext, { item: string; draft: PremiseDraft; card: string }], CompletionReport> = () => {
    throw new Error('FakeEngine.complete is not scripted');
  };

  private record(method: EngineCall['method'], ctx: Partial<CheckContext>, extra: Partial<EngineCall> = {}): void {
    const call: EngineCall = { method, ...extra };
    if (ctx.round !== undefined) call.round = ctx.round;
    if (ctx.stage !== undefined) call.stage = ctx.stage;
    call.frozen = ctx.freeze !== undefined;
    if (ctx.freeze !== undefined) call.freezeRound = ctx.freeze.round;
    if (ctx.baseCommit !== undefined) call.baseCommit = ctx.baseCommit;
    if (ctx.roundStartCommit !== undefined) call.roundStartCommit = ctx.roundStartCommit;
    if (ctx.selection !== undefined) call.adoptedGhosts = [...ctx.selection.adoptedGhosts];
    if (ctx.teleleanBlocks !== undefined) call.teleleanBlocks = [...ctx.teleleanBlocks];
    if (ctx.files !== undefined) call.files = [...ctx.files];
    if (ctx.job !== undefined) {
      call.runId = ctx.job.runId;
      call.leanJobMs = ctx.job.leanJobMs;
    }
    this.calls.push(call);
  }

  methods(): string[] {
    return this.calls.map((c) => c.method);
  }

  async normalise(ctx: CheckContext): Promise<{ changes: FileChange[]; commit?: ShadowCommit }> {
    this.record('normalise', ctx);
    return this.onNormalise(ctx);
  }

  async checkBase(ctx: CheckContext): Promise<CheckReport> {
    this.record('checkBase', ctx);
    const report = await this.onCheckBase(ctx);
    if (this.keepBaseFacts && report.outcome === 'ok') await keepBaseFacts(ctx.shadow);
    return report;
  }

  async check(ctx: CheckContext): Promise<CheckReport> {
    this.record('check', ctx);
    this.checkCalls += 1;
    return this.onCheck(ctx, this.checkCalls);
  }

  async freeze(ctx: CheckContext): Promise<FreezeOutcome> {
    this.record('freeze', ctx);
    const custom = await this.onFreeze(ctx);
    if (custom !== undefined) return custom;
    const commit = await ctx.shadow.commit('freeze', `Statements frozen (round ${ctx.round})`, ctx.round);
    const record: FreezeRecord = {
      round: ctx.round,
      commit,
      at: new Date().toISOString(),
      selection: ctx.selection,
      snapshot: { round: ctx.round, permitted: SPYRO_PERMITTED, targetStatement: 'Spyro.cynder_not_good', declarations: {}, axioms: [] },
      freeze: { exportPath: '', challengeModule: 'Model.TeleleanChallenge', theoremNames: ['Spyro.cynder_not_good.holds'], permittedAxioms: SPYRO_PERMITTED.all, definitionNames: [] },
    };
    return { ok: true, record, report: okReport() };
  }

  async gate(ctx: CheckContext & { status: FinishStatus }): Promise<GateReport> {
    this.record('gate', ctx, { status: ctx.status });
    this.gateCalls += 1;
    const custom = (await this.onGate(ctx, this.gateCalls)) ?? {};
    let findings = custom.findings;
    if (findings === undefined) findings = ctx.status === 'proved' && ctx.freeze === undefined ? [finding('not-frozen', 'finish(proved) needs a successful freeze_statements in this round')] : [];
    if (custom.environment !== undefined) {
      return { passed: false, environment: custom.environment, findings: [], flaggedDefinitions: [], check: okReport({ outcome: 'environment', environment: custom.environment }), durationMs: 1 };
    }
    const commit = await ctx.shadow.commit('checkpoint', `Judged state (round ${ctx.round})`, ctx.round);
    return {
      passed: findings.length === 0,
      findings,
      flaggedDefinitions: custom.flaggedDefinitions ?? [],
      check: custom.check ?? okReport(findings.length > 0 ? { outcome: 'problems', findings } : {}),
      durationMs: 1,
      commit,
      ...(custom.footprint !== undefined ? { footprint: custom.footprint } : {}),
    };
  }

  async checkGhost(ctx: CheckContext, ghost: GhostCheckInput): Promise<GhostCheck> {
    this.record('checkGhost', ctx, { ghost });
    const custom = await this.onCheckGhost(ctx, ghost);
    if (custom !== undefined) return custom;
    return { ok: true, footprint: ['Spyro.pg_no_dark_past.holds'], aloneEntails: false, statement: ghost.leanStatement.replace(/\s+/g, ' ').trim() };
  }

  async renderStatements(ctx: Pick<CheckContext, 'shadow' | 'job'>, names: readonly string[]): Promise<RenderedStatement[]> {
    this.record('renderStatements', ctx, { names: [...names] });
    return names.map((name) => ({ name, pretty: `pretty ${name}`, explicit: `explicit ${name}` }));
  }

  async judge(ctx: CheckContext): Promise<{ judgement: StateJudgement; report: CheckReport }> {
    this.record('judge', ctx);
    return this.onJudge(ctx);
  }

  async finalCheck(ctx: CheckContext): Promise<FinalCheckReport> {
    this.record('finalCheck', ctx);
    return this.onFinalCheck(ctx);
  }

  async writePremise(ctx: CheckContext, premise: { item: string; draft: PremiseDraft; card: string }): Promise<PremiseWriteReport> {
    this.record('writePremise', ctx);
    return this.onWritePremise(ctx, premise);
  }

  async complete(ctx: CheckContext, premise: { item: string; draft: PremiseDraft; card: string }): Promise<CompletionReport> {
    this.record('complete', ctx);
    return this.onComplete(ctx, premise);
  }
}
