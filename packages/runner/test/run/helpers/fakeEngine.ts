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
 */
import type { FileChange, GateFinding, PermittedAxioms } from '@telelean/core';

import type {
  CheckContext,
  CheckReport,
  FreezeOutcome,
  FreezeRecord,
  GateReport,
  GhostCheck,
  GhostCheckInput,
  LeanCheckEngine,
  RenderedStatement,
} from '../../../src/gate/types.js';
import type { FinishStatus } from '../../../src/llm/types.js';
import type { ShadowCommit } from '../../../src/shadow/types.js';

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
  method: 'checkBase' | 'check' | 'freeze' | 'normalise' | 'gate' | 'checkGhost' | 'renderStatements';
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
    return this.onCheckBase(ctx);
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
}
