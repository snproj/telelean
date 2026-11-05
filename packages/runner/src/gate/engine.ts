/**
 * The Lean check engine (contracts in ./types.ts; docs/m2-plan.md sections 3, 4.3 and 7.1).
 *
 *   checkBase  sync the mirror to the base, build (no G0: the user's own text); errors -> problems naming file:line;
 *              otherwise B's facts are kept in `<runDir>/base-facts.json`
 *   check      G0 (core checkFileChanges on B vs ws/) -> only if clean: sync the mirror, build + facts (one Lean job)
 *              -> core project models (B with B's facts, A = the newest `adopt` commit, the round start, S with the
 *              fresh facts) -> core evaluateRules
 *   freeze     check (purpose freeze) -> core permitted set + frozen snapshot -> lake's challenge in a copy of the
 *              mirror without the target's `.holds` and its transitive users -> commit `freeze`
 *   normalise  core normalisationChanges for the selection's statements new since B -> commit `normalise`
 *   gate       judge one committed state: G0, G1, G3, G5 via check (purpose gate-*), then G4 for `proved` only
 *   checkGhost single-term rule (no Lean) -> a clean check of ws/ -> the pinned scratch check (fact 7)
 *   render     `#print` default and explicit forms from a scratch check file
 *
 * Every Lean job runs through semantic.runExclusive under runLean with the run id as scope group (so
 * `lean.cancelRun(runId)` stops it); the memory guard is applied right before each spawn. Lean and sandbox failures
 * never throw: `timeout`/`oom` are `budget` findings (counted), everything else telelean could not do is an
 * `environment` outcome (not counted). Only invalid arguments throw TypeError.
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  ActionError,
  buildProjectModel,
  checkFileChanges,
  computePermittedAxioms,
  evaluateRules,
  frozenSnapshot,
  ghostTextProblems,
  holdsName,
  normalisationChanges,
  parseLeanFile,
  scanForbidden,
  SORRY_AXIOM,
  type FileChange,
  type FrozenSnapshot,
  type GateFinding,
  type LeanFacts,
  type ProjectModel,
  type RulePurpose,
} from '@telelean/core';

import { freezeChallenge, holdsTarget, runComparator, type ComparatorVerdict, type FreezeResult } from '../lean/comparator.js';
import { parseLeanJsonMessages } from '../lean/footprint.js';
import { runLean, type RunLeanResult } from '../lean/runLean.js';
import { resolveToolchain, toolchainExe } from '../lean/toolchain.js';
import type { FinishStatus } from '../llm/types.js';
import { readMemAvailableBytes, refreshLeanFacts, runExclusive } from '../semantic/index.js';
import { sha256Text } from '../semantic/project.js';
import { spawnMemoryMax } from '../semantic/refresh.js';
import { isLeanModelPath, isModelPath, moduleNameOf } from '../shadow/paths.js';
import { ShadowLayoutError, type ShadowCommit, type ShadowWorkspace } from '../shadow/types.js';
import { scanTree } from '../shadow/workspace.js';
import {
  budgetFinding,
  buildErrorFindings,
  classifyFacts,
  comparatorFindings,
  diagnosticsOf,
  environmentMessage,
  layoutEnvironment,
  notFrozenFinding,
} from './findings.js';
import { collapseWhitespace, ghostScratchSource, GHOST_NEEDS_FREEZE, readGhostScratch, readRenderScratch, renderScratchSource } from './scratch.js';
import type {
  CheckContext,
  CheckReport,
  EngineCore,
  FreezeOutcome,
  FreezeRecord,
  GateReport,
  GhostCheck,
  GhostCheckInput,
  LeanCheckEngine,
  LeanCheckEngineOptions,
  LeanJobSettings,
  RenderedStatement,
} from './types.js';

const DEFAULT_CORE: EngineCore = {
  checkFileChanges,
  scanForbidden,
  ghostTextProblems,
  evaluateRules,
  computePermittedAxioms,
  frozenSnapshot,
  normalisationChanges,
  parseLeanFile,
  buildProjectModel,
};

const RUN_ID_PATTERN = /^[A-Za-z0-9_]{1,64}$/u;
const FINISH_STATUSES: ReadonlySet<string> = new Set(['proved', 'insufficient', 'inconsistent', 'not_proved', 'lean_errors']);

/** B's facts, kept in the run directory by checkBase (read back by any engine opened on the same run). */
export const BASE_FACTS_FILE = 'base-facts.json';
const BASE_FACTS_FORMAT = 'telelean-base-facts';
/** The generated challenge module of every freeze copy. */
export const CHALLENGE_MODULE_NAME = 'TeleleanChallenge';

interface StoredBaseFacts {
  commit: string;
  facts: LeanFacts;
}

function validateJob(job: LeanJobSettings): void {
  if (typeof job !== 'object' || job === null) throw new TypeError('a check needs job settings');
  if (typeof job.runId !== 'string' || !RUN_ID_PATTERN.test(job.runId)) throw new TypeError(`job.runId must match ${RUN_ID_PATTERN.source}`);
  if (typeof job.memoryMax !== 'string' || job.memoryMax === '') throw new TypeError('job.memoryMax must be a MemoryMax= value such as 4G');
  if (typeof job.leanJobMs !== 'number' || !(job.leanJobMs > 0)) throw new TypeError('job.leanJobMs must be positive');
  if (typeof job.minAvailableBytes !== 'number' || !(job.minAvailableBytes >= 0)) throw new TypeError('job.minAvailableBytes must be a non-negative number');
}

function validateShadow(shadow: ShadowWorkspace): void {
  if (typeof shadow !== 'object' || shadow === null || typeof shadow.paths?.build !== 'string') throw new TypeError('ctx.shadow must be a ShadowWorkspace');
}

function validateContext(ctx: CheckContext): void {
  if (typeof ctx !== 'object' || ctx === null) throw new TypeError('a check needs a context');
  validateShadow(ctx.shadow);
  validateJob(ctx.job);
  const s = ctx.selection;
  if (typeof s !== 'object' || s === null || typeof s.subject !== 'string' || typeof s.target !== 'string' || !Array.isArray(s.premises) || !Array.isArray(s.adoptedGhosts)) {
    throw new TypeError('ctx.selection needs subject, target, premises and adoptedGhosts');
  }
  if (!Number.isInteger(ctx.round) || ctx.round < 0) throw new TypeError('ctx.round must be a non-negative integer');
  if (ctx.stage !== 'formalise' && ctx.stage !== 'prove') throw new TypeError('ctx.stage must be formalise or prove');
  if (!Array.isArray(ctx.teleleanBlocks)) throw new TypeError('ctx.teleleanBlocks must be an array');
}

/** A stable key of a file set (path and text of every file). */
export function filesKey(files: ReadonlyMap<string, string>): string {
  const hash = createHash('sha256');
  for (const p of [...files.keys()].sort()) hash.update(`${p}\0${files.get(p) ?? ''}\0`);
  return hash.digest('hex');
}

function sameFiles(a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [p, text] of a) if (b.get(p) !== text) return false;
  return true;
}

/** Module names of the library in a file set (G0's allowed imports). */
export function projectModulesOf(files: ReadonlyMap<string, string>, library: string): Set<string> {
  const out = new Set<string>();
  for (const p of files.keys()) {
    const name = moduleNameOf(p, library);
    if (name !== undefined) out.add(name);
  }
  return out;
}

/**
 * The declarations the freeze copy must lose so `theorem T.holds : T := sorry` can be added (docs/m2-plan.md section
 * 7.1 step 4): `start` (the target's `.holds`) and, transitively, every declaration whose facts refs use a removed one
 * (auxiliary names map to their parent). Only names declared syntactically in `declared` are returned (they are what
 * `remove-decl` can find), in a stable order.
 */
export function removalClosure(facts: LeanFacts | undefined, declared: ReadonlySet<string>, start: string): string[] {
  const parentOf = new Map<string, string>();
  for (const d of facts?.decls ?? []) if (d.parent !== undefined) parentOf.set(d.name, d.parent);
  const top = (name: string): string => {
    let n = name;
    for (let i = 0; i < 16 && parentOf.has(n); i++) n = parentOf.get(n) ?? n;
    return n;
  };
  const users = new Map<string, Set<string>>();
  for (const d of facts?.decls ?? []) {
    const user = top(d.name);
    for (const ref of d.refs) {
      const set = users.get(ref.name) ?? new Set<string>();
      set.add(user);
      users.set(ref.name, set);
    }
  }
  const removed = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const name = queue.shift() ?? '';
    for (const user of users.get(name) ?? []) {
      if (!removed.has(user)) {
        removed.add(user);
        queue.push(user);
      }
    }
  }
  return [...removed].filter((n) => declared.has(n)).sort();
}

function declaredNames(model: ProjectModel): Set<string> {
  const out = new Set<string>();
  for (const file of model.files.values()) for (const d of file.decls) if (d.fullName !== undefined) out.add(d.fullName);
  return out;
}

const STATUS_WORDS: Readonly<Record<string, string>> = { timeout: 'ran out of time', oom: 'ran out of memory' };

/** One engine may serve many runs (one per extension host): its caches keep only the most recent entries. */
const MODEL_CACHE_SIZE = 32;
const RUN_CACHE_SIZE = 16;

function remember<K, V>(cache: Map<K, V>, key: K, value: V, limit: number): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) {
    const oldest = cache.keys().next();
    if (oldest.done === true) break;
    cache.delete(oldest.value);
  }
}

class Engine implements LeanCheckEngine {
  private readonly core: EngineCore;
  private readonly refreshFacts: NonNullable<LeanCheckEngineOptions['refreshFacts']>;
  private readonly now: () => Date;
  /** runDir -> filesKey of the ws/ state whose check left the mirror clean (no finding). */
  private readonly cleanMirror = new Map<string, string>();
  private readonly baseFactsCache = new Map<string, StoredBaseFacts | null>();
  private readonly baseIds = new Map<string, string>();
  private readonly models = new Map<string, ProjectModel>();

  constructor(options: LeanCheckEngineOptions) {
    this.core = { ...DEFAULT_CORE, ...options.core };
    this.refreshFacts = options.refreshFacts ?? refreshLeanFacts;
    this.now = options.now ?? ((): Date => new Date());
  }

  // ------------------------------------------------------------------------------------------------ models and B

  private model(files: ReadonlyMap<string, string>, library: string, facts?: LeanFacts): ProjectModel {
    const lean = [...files.keys()].filter((p) => isLeanModelPath(p, library)).sort();
    const fileHashes: Record<string, string> = {};
    for (const p of lean) fileHashes[p] = sha256Text(files.get(p) ?? '');
    const lakefile = ['lakefile.toml', 'lakefile.lean'].find((p) => files.has(p));
    return this.core.buildProjectModel({
      files: lean.map((p) => this.core.parseLeanFile(p, files.get(p) ?? '')),
      fileHashes,
      library,
      ...(facts !== undefined ? { facts } : {}),
      ...(lakefile !== undefined ? { lakefile: { path: lakefile, text: files.get(lakefile) ?? '' } } : {}),
    });
  }

  /** The (cached) project model of a commit; with `facts` only for B's own facts. */
  private async commitModel(shadow: ShadowWorkspace, commitId: string, facts?: LeanFacts): Promise<ProjectModel> {
    const key = `${shadow.paths.runDir}\0${commitId}\0${facts !== undefined ? 'facts' : 'text'}`;
    const cached = this.models.get(key);
    if (cached !== undefined) return cached;
    const model = this.model(await shadow.filesAt(commitId), shadow.library, facts);
    remember(this.models, key, model, MODEL_CACHE_SIZE);
    return model;
  }

  private async baseCommitId(shadow: ShadowWorkspace): Promise<string> {
    const cached = this.baseIds.get(shadow.paths.runDir);
    if (cached !== undefined) return cached;
    const base = (await shadow.commits()).find((c) => c.kind === 'base');
    if (base === undefined) throw new ShadowLayoutError('git', `the shadow of run ${shadow.runId} has no base commit`);
    remember(this.baseIds, shadow.paths.runDir, base.id, RUN_CACHE_SIZE);
    return base.id;
  }

  private async loadBaseFacts(shadow: ShadowWorkspace): Promise<StoredBaseFacts | undefined> {
    const runDir = shadow.paths.runDir;
    if (this.baseFactsCache.has(runDir)) return this.baseFactsCache.get(runDir) ?? undefined;
    let stored: StoredBaseFacts | null = null;
    try {
      const json = JSON.parse(await readFile(path.join(runDir, BASE_FACTS_FILE), 'utf8')) as Record<string, unknown>;
      const facts = json['facts'] as LeanFacts | undefined;
      if (json['format'] === BASE_FACTS_FORMAT && typeof json['commit'] === 'string' && typeof facts === 'object' && facts !== null && facts.format === 'telelean-lean-facts') {
        stored = { commit: json['commit'], facts };
      }
    } catch {
      stored = null;
    }
    remember(this.baseFactsCache, runDir, stored, RUN_CACHE_SIZE);
    return stored ?? undefined;
  }

  private async saveBaseFacts(shadow: ShadowWorkspace, commit: string, facts: LeanFacts): Promise<void> {
    const file = path.join(shadow.paths.runDir, BASE_FACTS_FILE);
    const temp = `${file}.${process.pid}.tmp`;
    await writeFile(temp, `${JSON.stringify({ format: BASE_FACTS_FORMAT, version: 1, commit, facts })}\n`, 'utf8');
    await rename(temp, file);
    remember(this.baseFactsCache, shadow.paths.runDir, { commit, facts }, RUN_CACHE_SIZE);
  }

  // ------------------------------------------------------------------------------------------------ Lean jobs

  /** One refresh of the mirror (build + check file), one Lean job. */
  private refresh(shadow: ShadowWorkspace, job: LeanJobSettings): Promise<LeanFacts> {
    return runExclusive(() =>
      this.refreshFacts({
        root: shadow.paths.build,
        library: shadow.library,
        runId: job.runId,
        memoryMax: job.memoryMax,
        minAvailableBytes: job.minAvailableBytes,
        buildTimeoutMs: job.leanJobMs,
        checkTimeoutMs: job.leanJobMs,
        now: this.now,
        ...(job.signal !== undefined ? { signal: job.signal } : {}),
        ...(job.toolchain !== undefined ? { toolchain: job.toolchain } : {}),
        ...(job.host !== undefined ? { host: job.host } : {}),
        ...(job.readMemAvailable !== undefined ? { readMemAvailable: job.readMemAvailable } : {}),
      }),
    );
  }

  /** The memory guard right before a spawn: the lowered `MemoryMax=`, or why nothing may start. */
  private memoryGate(job: LeanJobSettings): { ok: true; memoryMax: string } | { ok: false; environment: string } {
    let available: number | undefined;
    try {
      available = (job.readMemAvailable ?? readMemAvailableBytes)();
    } catch {
      available = undefined;
    }
    if (available !== undefined && available < job.minAvailableBytes) {
      const gib = (b: number): string => (b / 1024 ** 3).toFixed(1);
      return { ok: false, environment: environmentMessage('low-memory', `MemAvailable is ${gib(available)} GiB, below the ${gib(job.minAvailableBytes)} GiB threshold`) };
    }
    return { ok: true, memoryMax: spawnMemoryMax(job.memoryMax, available, job.minAvailableBytes) };
  }

  private runOptions(job: LeanJobSettings, memoryMax: string) {
    return {
      runId: job.runId,
      memoryMax,
      timeoutMs: job.leanJobMs,
      toolchain: job.toolchain ?? resolveToolchain(),
      ...(job.host !== undefined ? { host: job.host } : {}),
      ...(job.signal !== undefined ? { signal: job.signal } : {}),
    };
  }

  /** A scratch check file on stdin of `lake env lean --stdin --json` in the mirror (nothing is written). */
  private async leanStdin(
    shadow: ShadowWorkspace,
    job: LeanJobSettings,
    source: string,
  ): Promise<{ ok: true; run: RunLeanResult } | { ok: false; environment?: string; budget?: string }> {
    const outcome = await runExclusive(async () => {
      const gate = this.memoryGate(job);
      if (!gate.ok) return { environment: gate.environment };
      const options = this.runOptions(job, gate.memoryMax);
      return { run: await runLean({ ...options, shadowDir: shadow.paths.build, argv: [toolchainExe(options.toolchain, 'lake'), 'env', 'lean', '--stdin', '--json'], stdin: source }) };
    });
    if ('environment' in outcome) return { ok: false, environment: outcome.environment };
    const run = outcome.run;
    if (run.status === 'could-not-start' || run.status === 'cancelled') return { ok: false, environment: environmentMessage(run.status, run.detail) };
    if (run.status === 'timeout' || run.status === 'oom') {
      return { ok: false, budget: `telelean's check ${STATUS_WORDS[run.status] ?? run.status}${run.detail !== undefined ? ` (${run.detail})` : ''}` };
    }
    return { ok: true, run };
  }

  /** The build mirror's model files are exactly ws/'s (nothing synced it to another state since). */
  private async mirrorHolds(shadow: ShadowWorkspace, files: ReadonlyMap<string, string>): Promise<boolean> {
    const mirror = await scanTree(shadow.paths.build, { skipHidden: true });
    const model = [...files].filter(([p]) => isModelPath(p, shadow.library));
    const mirrored = [...mirror.files].filter(([p]) => isModelPath(p, shadow.library));
    return model.length === mirrored.length && model.every(([p, text]) => mirror.files.get(p) === text);
  }

  /** `<parent>/<n>` for the next free n (1, 2, …), created. */
  private async nextDir(parent: string): Promise<string> {
    await mkdir(parent, { recursive: true });
    let n = 1 + Math.max(0, ...(await readdir(parent)).map((name) => (/^\d+$/u.test(name) ? Number(name) : 0)));
    for (;;) {
      const dir = path.join(parent, String(n));
      try {
        await mkdir(dir);
        return dir;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        n++;
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ check

  private envReport(environment: string, started: number, extra: Partial<CheckReport> = {}): CheckReport {
    return { outcome: 'environment', environment, g0: [], findings: [], diagnostics: [], ...extra, durationMs: Math.round(performance.now() - started) };
  }

  /** The check behind check/freeze/gate/ghost: G0 -> sync -> build -> models -> rules. `given` = ws/ already read. */
  private async runCheck(ctx: CheckContext, purpose: RulePurpose, given?: ReadonlyMap<string, string>): Promise<CheckReport> {
    const started = performance.now();
    const shadow = ctx.shadow;
    const library = shadow.library;
    let files: ReadonlyMap<string, string>;
    try {
      files = given ?? (await shadow.currentFiles());
    } catch (error) {
      if (error instanceof ShadowLayoutError) return this.envReport(layoutEnvironment(error), started);
      throw error;
    }
    const baseId = ctx.baseCommit ?? (await this.baseCommitId(shadow));
    const baseFiles = await shadow.filesAt(baseId);

    // G0: text only. Lean never elaborates text that fails it.
    const g0 = this.core.checkFileChanges(baseFiles, files, { library, subject: ctx.selection.subject, projectModules: projectModulesOf(files, library) });
    if (g0.length > 0) {
      return { outcome: 'problems', g0, findings: [], diagnostics: [], durationMs: Math.round(performance.now() - started) };
    }

    // G1: the build mirror holds exactly ws/'s model files; one Lean job builds and checks it.
    this.cleanMirror.delete(shadow.paths.runDir);
    try {
      await shadow.syncMirror();
    } catch (error) {
      if (error instanceof ShadowLayoutError) return this.envReport(layoutEnvironment(error), started);
      throw error;
    }
    const facts = await this.refresh(shadow, ctx.job);
    const diagnostics = diagnosticsOf(facts, ctx.files);
    const build = {
      status: facts.status,
      durationMs: facts.build.durationMs + facts.check.durationMs,
      errorCount: facts.build.messages.filter((m) => m.severity === 'error').length,
    };
    const outcome = classifyFacts(facts, ctx.job.leanJobMs);
    if (outcome.kind === 'environment') return this.envReport(outcome.message, started, { diagnostics, build, facts });
    if (outcome.kind === 'budget') {
      return { outcome: 'problems', g0: [], findings: [outcome.finding], diagnostics, build, facts, durationMs: Math.round(performance.now() - started) };
    }

    // G3, G5 and the stage rules, on S (fresh facts) against B (B's facts when this is the base commit), A and the round start.
    const current = this.model(files, library, facts);
    const stored = ctx.baseCommit === undefined || ctx.baseCommit === (await this.baseCommitId(shadow)) ? await this.loadBaseFacts(shadow) : undefined;
    const base = await this.commitModel(shadow, baseId, stored !== undefined && stored.commit === baseId ? stored.facts : undefined);
    const adoptCommit = await shadow.lastCommit(['adopt']);
    const adopted = adoptCommit !== undefined ? await this.commitModel(shadow, adoptCommit.id) : undefined;
    const roundStart = ctx.roundStartCommit !== undefined ? await this.commitModel(shadow, ctx.roundStartCommit) : undefined;
    const rules = this.core.evaluateRules({
      purpose,
      selection: ctx.selection,
      stage: ctx.stage,
      base,
      current,
      teleleanBlocks: ctx.teleleanBlocks,
      ...(adopted !== undefined ? { adopted } : {}),
      ...(roundStart !== undefined ? { roundStart } : {}),
      ...(ctx.freeze !== undefined ? { freeze: ctx.freeze.snapshot } : {}),
    });
    const findings = [...rules.findings];
    // Fail closed: a build with Lean errors never passes, even if the rules said nothing about it.
    if (!findings.some((f) => f.code === 'build')) findings.unshift(...buildErrorFindings(facts));
    const ok = findings.length === 0;
    if (ok) remember(this.cleanMirror, shadow.paths.runDir, filesKey(files), RUN_CACHE_SIZE);
    return {
      outcome: ok ? 'ok' : 'problems',
      g0: [],
      findings,
      diagnostics,
      build,
      rules,
      model: current,
      base,
      facts,
      durationMs: Math.round(performance.now() - started),
    };
  }

  // ------------------------------------------------------------------------------------------------ public API

  /** Runs `job`; a ShadowLayoutError (layout, git, io) becomes `onLayout`'s environment outcome. */
  private async guarded<T>(job: () => Promise<T>, onLayout: (environment: string) => T): Promise<T> {
    try {
      return await job();
    } catch (error) {
      if (error instanceof ShadowLayoutError) return onLayout(layoutEnvironment(error));
      throw error;
    }
  }

  async checkBase(ctx: CheckContext): Promise<CheckReport> {
    validateContext(ctx);
    const started = performance.now();
    return this.guarded(
      () => this.checkBaseNow(ctx, started),
      (environment) => this.envReport(environment, started),
    );
  }

  private async checkBaseNow(ctx: CheckContext, started: number): Promise<CheckReport> {
    const shadow = ctx.shadow;
    const baseId = ctx.baseCommit ?? (await this.baseCommitId(shadow));
    const files = await shadow.currentFiles();
    if (!sameFiles(files, await shadow.filesAt(baseId))) {
      return this.envReport('the working copy changed before telelean built your files; start the run again', started);
    }
    this.cleanMirror.delete(shadow.paths.runDir);
    await shadow.syncMirror();
    const facts = await this.refresh(shadow, ctx.job);
    const diagnostics = diagnosticsOf(facts);
    const build = {
      status: facts.status,
      durationMs: facts.build.durationMs + facts.check.durationMs,
      errorCount: facts.build.messages.filter((m) => m.severity === 'error').length,
    };
    const outcome = classifyFacts(facts, ctx.job.leanJobMs);
    if (outcome.kind === 'environment') return this.envReport(outcome.message, started, { diagnostics, build, facts });
    const findings: GateFinding[] =
      outcome.kind === 'budget'
        ? [{ ...outcome.finding, message: `Your files took too long or too much memory to build (${facts.detail ?? facts.status}).` }]
        : buildErrorFindings(facts);
    const model = this.model(files, shadow.library, facts);
    if (findings.length === 0) {
      await this.saveBaseFacts(shadow, baseId, facts);
      remember(this.cleanMirror, shadow.paths.runDir, filesKey(files), RUN_CACHE_SIZE);
    }
    return {
      outcome: findings.length === 0 ? 'ok' : 'problems',
      g0: [],
      findings,
      diagnostics,
      build,
      model,
      facts,
      durationMs: Math.round(performance.now() - started),
    };
  }

  async check(ctx: CheckContext): Promise<CheckReport> {
    validateContext(ctx);
    const started = performance.now();
    return this.guarded(
      () => this.runCheck(ctx, 'check'),
      (environment) => this.envReport(environment, started),
    );
  }

  async freeze(ctx: CheckContext): Promise<FreezeOutcome> {
    validateContext(ctx);
    const started = performance.now();
    return this.guarded(
      () => this.freezeNow(ctx),
      (environment) => ({ ok: false, refusals: [environment], report: this.envReport(environment, started), environment }),
    );
  }

  private async freezeNow(given: CheckContext): Promise<FreezeOutcome> {
    // A freeze is judged as the state before THIS freeze: a previous round's freeze (an adoption's re-freeze, Accept's
    // re-check) must not make the new ghost's `.holds` or the user's own axioms look like axioms added after a freeze.
    const { freeze: _previous, ...rest } = given;
    const ctx: CheckContext = rest;
    const shadow = ctx.shadow;
    const files = await shadow.currentFiles();
    const report = await this.runCheck(ctx, 'freeze', files);
    if (report.outcome === 'environment') {
      const environment = report.environment ?? 'telelean could not run Lean';
      return { ok: false, refusals: [environment], report, environment };
    }
    if (report.outcome === 'problems') return { ok: false, refusals: [...report.g0, ...report.findings].map((f) => f.message), report };
    const model = report.model;
    const facts = report.facts;
    if (model === undefined || facts === undefined) {
      return { ok: false, refusals: ['telelean has no Lean facts for the frozen state'], report, environment: 'telelean has no Lean facts for the frozen state' };
    }

    let snapshot: FrozenSnapshot;
    try {
      // Derivation footprints only from the user's own proofs in B (never from a proof Claude wrote in the run).
      const permitted = this.core.computePermittedAxioms(model, ctx.selection, report.base);
      snapshot = { ...this.core.frozenSnapshot(model, ctx.selection, ctx.round, report.base), permitted };
    } catch (error) {
      if (error instanceof ActionError) return { ok: false, refusals: [error.message], report };
      throw error;
    }

    // G4's challenge: a copy of the mirror without the target's `.holds` and everything that uses it, plus
    // `theorem T.holds : T := sorry`, built and exported (docs/m2-plan.md sections 3.3 and 7.1).
    const target = snapshot.targetStatement;
    const removeDecls = removalClosure(facts, declaredNames(model), holdsName(target));
    const dir = await this.nextDir(shadow.paths.frozenDir);
    const library = shadow.library;
    const outcome = await runExclusive(async (): Promise<{ result: FreezeResult } | { environment: string }> => {
      const gate = this.memoryGate(ctx.job);
      if (!gate.ok) return { environment: gate.environment };
      try {
        const result = await freezeChallenge({
          snapshotDir: shadow.paths.build,
          freezeDir: path.join(dir, 'project'),
          imports: [library],
          challengeModule: `${library}.${CHALLENGE_MODULE_NAME}`,
          targets: [holdsTarget(target)],
          permittedAxioms: snapshot.permitted.all,
          definitionNames: [],
          exportPath: path.join(dir, 'frozen.ndjson'),
          removeDecls,
          run: this.runOptions(ctx.job, gate.memoryMax),
        });
        return { result };
      } catch (error) {
        return { environment: `telelean could not prepare the frozen statements: ${(error as Error).message}` };
      }
    });
    // The copy's build tree is large and no longer needed; its sources and the export stay for the record.
    await rm(path.join(dir, 'project', '.lake'), { recursive: true, force: true });
    if ('environment' in outcome) return { ok: false, refusals: [outcome.environment], report, environment: outcome.environment };
    if (!outcome.result.ok) {
      // The agent's files built and passed the rules: a failing challenge is telelean's problem, never counted.
      const run = outcome.result.export ?? outcome.result.build;
      const environment =
        run.status === 'cancelled'
          ? environmentMessage('cancelled')
          : `telelean could not export the frozen statements (challenge ${outcome.result.stage}): ${outcome.result.detail}`;
      return { ok: false, refusals: [environment], report, environment };
    }
    const commit = await shadow.commit('freeze', `Statements frozen (round ${ctx.round})`, ctx.round);
    const record: FreezeRecord = { round: ctx.round, commit, at: this.now().toISOString(), selection: ctx.selection, snapshot, freeze: outcome.result.freeze };
    return { ok: true, record, report };
  }

  async normalise(ctx: CheckContext): Promise<{ changes: FileChange[]; commit?: ShadowCommit }> {
    validateContext(ctx);
    const shadow = ctx.shadow;
    let files: Map<string, string>;
    try {
      files = await shadow.currentFiles();
    } catch (error) {
      if (error instanceof ShadowLayoutError) return { changes: [] };
      throw error;
    }
    const base = await this.commitModel(shadow, ctx.baseCommit ?? (await this.baseCommitId(shadow)));
    const current = this.model(files, shadow.library);
    const wanted = [...new Set([ctx.selection.target, ...ctx.selection.premises, ...ctx.selection.adoptedGhosts])];
    const nodeIds = wanted.filter((id) => current.nodes.get(id)?.statementDecl !== undefined && base.nodes.get(id)?.statementDecl === undefined);
    if (nodeIds.length === 0) return { changes: [] };
    const changes = this.core.normalisationChanges(current, nodeIds);
    if (changes.length === 0) return { changes: [] };
    await shadow.writeFiles(changes);
    const commit = await shadow.commit('normalise', `Normalised (round ${ctx.round})`, ctx.round);
    return { changes, commit };
  }

  /** The commit the gate judges: the head when it is the normalise (or a gate checkpoint) commit of exactly ws/, else a new checkpoint. */
  private async judgedCommit(ctx: CheckContext, files: ReadonlyMap<string, string>): Promise<ShadowCommit> {
    const head = (await ctx.shadow.commits()).at(-1);
    if (head !== undefined && (head.kind === 'normalise' || head.kind === 'checkpoint') && sameFiles(files, await ctx.shadow.filesAt(head.id))) return head;
    return ctx.shadow.commit('checkpoint', `State judged by the gate (round ${ctx.round})`, ctx.round);
  }

  async gate(ctx: CheckContext & { status: FinishStatus }): Promise<GateReport> {
    validateContext(ctx);
    if (!FINISH_STATUSES.has(ctx.status)) throw new TypeError(`unknown finish status ${JSON.stringify(ctx.status)}`);
    const started = performance.now();
    return this.guarded(
      () => this.gateNow(ctx, started),
      (environment) => ({
        passed: false,
        environment,
        findings: [],
        flaggedDefinitions: [],
        check: this.envReport(environment, started),
        durationMs: Math.round(performance.now() - started),
      }),
    );
  }

  private async gateNow(ctx: CheckContext & { status: FinishStatus }, started: number): Promise<GateReport> {
    const elapsed = (): number => Math.round(performance.now() - started);
    const files = await ctx.shadow.currentFiles();
    const commit = await this.judgedCommit(ctx, files);
    const proved = ctx.status === 'proved';
    const report = await this.runCheck(ctx, proved ? 'gate-proved' : 'gate-other', files);
    const flaggedDefinitions = report.rules?.flaggedDefinitions ?? [];
    if (report.outcome === 'environment') {
      return { passed: false, environment: report.environment ?? 'telelean could not run Lean', findings: [], flaggedDefinitions, check: report, durationMs: elapsed(), commit };
    }
    const findings = [...report.g0, ...report.findings];
    if (proved && ctx.freeze === undefined && !findings.some((f) => f.code === 'not-frozen')) findings.push(notFrozenFinding());
    const targetStatement = ctx.freeze?.snapshot.targetStatement ?? report.model?.nodes.get(ctx.selection.target)?.statementDecl?.decl.fullName;
    const footprint = proved && targetStatement !== undefined ? report.facts?.decls.find((d) => d.name === holdsName(targetStatement))?.axioms : undefined;
    let comparator: ComparatorVerdict | undefined;
    let environment: string | undefined;
    if (proved && ctx.freeze !== undefined && findings.length === 0) {
      const g4 = await this.compare(ctx, ctx.freeze);
      comparator = g4.verdict;
      environment = g4.environment;
      findings.push(...g4.findings);
    }
    return {
      passed: findings.length === 0 && environment === undefined,
      ...(environment !== undefined ? { environment } : {}),
      findings,
      flaggedDefinitions,
      ...(footprint !== undefined ? { footprint: [...footprint] } : {}),
      check: report,
      ...(comparator !== undefined ? { comparator } : {}),
      durationMs: elapsed(),
      commit,
    };
  }

  /** G4: lake comparator in the mirror against the round's freeze. */
  private async compare(ctx: CheckContext, freeze: FreezeRecord): Promise<{ verdict?: ComparatorVerdict; findings: GateFinding[]; environment?: string }> {
    const workDir = await this.nextDir(ctx.shadow.paths.gateDir);
    const outcome = await runExclusive(async (): Promise<{ verdict: ComparatorVerdict } | { environment: string }> => {
      const gate = this.memoryGate(ctx.job);
      if (!gate.ok) return { environment: gate.environment };
      const result = await runComparator({
        solutionDir: ctx.shadow.paths.build,
        freeze: freeze.freeze,
        solutionModule: ctx.shadow.library,
        workDir,
        run: this.runOptions(ctx.job, gate.memoryMax),
      });
      return { verdict: result.verdict };
    });
    if ('environment' in outcome) return { findings: [], environment: outcome.environment };
    return { verdict: outcome.verdict, ...comparatorFindings(outcome.verdict, ctx.job.leanJobMs) };
  }

  async checkGhost(ctx: CheckContext, ghost: GhostCheckInput): Promise<GhostCheck> {
    validateContext(ctx);
    if (typeof ghost !== 'object' || ghost === null || typeof ghost.leanStatement !== 'string' || typeof ghost.proof !== 'string') {
      throw new TypeError('a ghost needs leanStatement and proof');
    }
    if (ctx.freeze === undefined) return { ok: false, problems: [GHOST_NEEDS_FREEZE] };
    const freeze = ctx.freeze;
    // The single-term rule, before any Lean (docs/m2-plan.md section 3.8, fact 8).
    const textProblems = this.core.ghostTextProblems(ghost.leanStatement, ghost.proof);
    if (textProblems.length > 0) return { ok: false, problems: [...textProblems] };
    return this.guarded(
      () => this.checkGhostNow(ctx, freeze, ghost),
      (environment) => ({ ok: false, problems: [environment], environment }),
    );
  }

  private async checkGhostNow(ctx: CheckContext, freeze: FreezeRecord, ghost: GhostCheckInput): Promise<GhostCheck> {
    const statement = collapseWhitespace(ghost.leanStatement);
    // The mirror must hold a clean check of ws/ as it is (this engine's last clean check, of exactly the mirror's files).
    const files = await ctx.shadow.currentFiles();
    if (this.cleanMirror.get(ctx.shadow.paths.runDir) !== filesKey(files) || !(await this.mirrorHolds(ctx.shadow, files))) {
      const report = await this.runCheck(ctx, 'check', files);
      if (report.outcome === 'environment') {
        const environment = report.environment ?? 'telelean could not run Lean';
        return { ok: false, problems: [environment], environment };
      }
      if (report.outcome === 'problems') {
        return { ok: false, problems: ['The files do not pass check_lean, so the suggestion was not checked. Fix these first:', ...[...report.g0, ...report.findings].map((f) => f.message)] };
      }
    }

    // The pinned scratch check (fact 7).
    const scratch = ghostScratchSource({ library: ctx.shadow.library, namespace: ctx.selection.subject, targetStatement: freeze.snapshot.targetStatement, statement, proof: ghost.proof });
    const lean = await this.leanStdin(ctx.shadow, ctx.job, scratch.source);
    if (!lean.ok) {
      if (lean.environment !== undefined) return { ok: false, problems: [lean.environment], environment: lean.environment };
      return { ok: false, problems: [`${lean.budget ?? "telelean's check failed"}: simplify the proof of the suggestion.`] };
    }
    const messages = parseLeanJsonMessages(lean.run.stdout);
    const result = readGhostScratch(scratch, messages);
    const problems = [...result.errors];
    if (lean.run.status === 'failed' && messages.length === 0) {
      problems.push(`Lean could not check the suggestion: ${lean.run.stderr.trim().split('\n').slice(-5).join('\n') || `exit code ${String(lean.run.exitCode)}`}`);
    }
    if (problems.length > 0) return { ok: false, problems };
    if (result.axioms === undefined) return { ok: false, problems: [`Lean printed no axioms for ${scratch.checkName}, so the suggestion could not be checked.`] };
    const axioms = result.axioms;
    if (axioms.includes(SORRY_AXIOM)) return { ok: false, problems: ['The proof that the suggestion closes the gap uses sorry.'] };
    const permitted = new Set(freeze.snapshot.permitted.all);
    const outside = axioms.filter((a) => !permitted.has(a));
    if (outside.length > 0) {
      return {
        ok: false,
        problems: [
          `The proof that the suggestion closes the gap rests on axioms outside the permitted set: ${outside.map((a) => `\`${a}\``).join(', ')}. It may use only the selected premises' .holds, the vocabulary and Lean's standard axioms (besides the suggestion itself).`,
        ],
      };
    }
    const selectedHolds = new Set([...freeze.snapshot.permitted.selected, ...freeze.snapshot.permitted.derivationFootprints].filter((a) => a.endsWith('.holds')));
    const aloneEntails = !axioms.some((a) => selectedHolds.has(a));
    return { ok: true, footprint: axioms, aloneEntails, statement };
  }

  async renderStatements(ctx: Pick<CheckContext, 'shadow' | 'job'>, names: readonly string[]): Promise<RenderedStatement[]> {
    if (typeof ctx !== 'object' || ctx === null) throw new TypeError('renderStatements needs a context');
    validateShadow(ctx.shadow);
    validateJob(ctx.job);
    if (!Array.isArray(names) || names.some((n) => typeof n !== 'string')) throw new TypeError('names must be an array of strings');
    if (names.length === 0) return [];
    const scratch = renderScratchSource(ctx.shadow.library, names);
    if (scratch.lines.size === 0) return readRenderScratch(scratch, names, []);
    const lean = await this.leanStdin(ctx.shadow, ctx.job, scratch.source);
    if (!lean.ok) {
      const error = lean.environment ?? lean.budget ?? 'telelean could not run Lean';
      return names.map((name) => ({ name, pretty: '', explicit: '', error }));
    }
    return readRenderScratch(scratch, names, parseLeanJsonMessages(lean.run.stdout));
  }
}

/** See ./index.ts. */
export function createEngine(options: LeanCheckEngineOptions = {}): LeanCheckEngine {
  return new Engine(options);
}
