/**
 * The Lean check engine (contracts in ./types.ts; docs/m2-plan.md sections 3, 4.3 and 7.1).
 *
 *   checkBase  sync the mirror to the base, build (no G0: the user's own text); errors -> problems naming file:line;
 *              otherwise B's facts are kept in `<runDir>/base-facts.json`, and a failed isolated probe on them refuses
 *              the start (`environment`, 2b3a, AP30-2)
 *   check      G0 (core checkFileChanges on B vs ws/) -> only if clean: sync the mirror, build + facts (one refresh: the
 *              build, the check file and the isolated probe) -> core project models (B with B's facts, A = the newest
 *              `adopt` commit, the round start, S with the fresh facts) -> core evaluateRules; facts whose probe
 *              failed never pass (2b3a, §2.1: `environment` when the rules find nothing or only B.2's `source-only`)
 *   freeze     check (purpose freeze) -> core permitted set + frozen snapshot -> lake's challenge in a copy of the
 *              mirror without the target's `.holds` and its transitive users -> commit `freeze`
 *   normalise  core normalisationChanges for the selection's statements new since B -> commit `normalise`
 *   gate       judge one committed state: G0, G1, G3, G5 via check (purpose gate-*), then G4 for `proved` only
 *   checkGhost single-term rule (no Lean) -> a clean check of ws/ -> the pinned scratch check (fact 7)
 *   render     `#print` default and explicit forms from a scratch check file
 *
 * Slice 2 (docs/slice2-plan.md 2.9, 3.3-3.10; 2b3b), an edit session (`CheckContext.session`):
 *   check, freeze, gate   as above, but S₀'s facts first (this engine's facts of S₀'s files, or S₀ built once), and
 *              core `judgeState` with the step's scope, S₀, freeze and the session's records instead of
 *              evaluateRules; they decide on the judgement's `stepFindings` with §2.1's failed-probe rule, never on its
 *              `ok` (AP30-3). The freeze's permitted set is B.1's (with E(T)); at a proved finish whose B.1 set differs
 *              from the freeze's, a new challenge is exported from the freeze's copy before the comparator (D2-19).
 *   checkGhost B.1's permitted set and B.2's sources with E(T) (§3.8); the statement's explicit form and its scratch
 *              facts (`PremiseDraft.explicit`, `.facts`)
 *   judge      the head commit: G0 -> build (the mirror's facts reused when it was last built from exactly these files)
 *              -> judgeState('stage') -> the Add premise drafts whose reliance changed, checked again, the others with
 *              their last check's outcome (premiseChecks)
 *   finalCheck exactly F (the head, which ws/ must equal): G0 -> facts (EN-2's reuse, or a build) -> judgeState('final')
 *              -> the backstop -> the comparator for each proof of this session, when nothing else failed
 *   writePremise  normalise the premise's card -> G0 -> build -> render P where written -> commit `adopt` -> judge
 *   complete   the premise written and T not proved in the state it starts from (the newest commit) -> normalise -> G0
 *              (the completion and that state) -> freeze again from that state (statement-changed against the target's
 *              last freeze first) -> build the completion -> judgeState('gate-proved') -> comparator -> commit `completion`
 * G0 runs first, before any Lean job, at every purpose: when it finds anything, nothing is synced, built, probed,
 * rendered or challenged (AP30-1 r2). One operation that uses the mirror runs at a time per run (`locked`), so a judge
 * and a premise write of the same session never interleave in the mirror.
 *
 * Every Lean job runs through semantic.runExclusive under runLean with the run id as scope group (so
 * `lean.cancelRun(runId)` stops it); the memory guard is applied right before each spawn. Lean and sandbox failures
 * never throw: `timeout`/`oom` are `budget` findings (counted), everything else telelean could not do is an
 * `environment` outcome (not counted). Only invalid arguments throw TypeError; `judge` and `finalCheck` reject when
 * the shadow's history cannot be read at all (a git or I/O failure: there are no files to judge).
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  ActionError,
  applyBackstop,
  buildProjectModel,
  checkFileChanges,
  computePermittedAxioms,
  directWalkOfConsts,
  evaluateRules,
  frozenSnapshot,
  ghostTextProblems,
  holdsName,
  judgeState,
  leanDurationMs,
  normalisationChanges,
  parseLeanFile,
  premiseKey,
  probeFailure,
  scanForbidden,
  SORRY_AXIOM,
  UNSEEN_PROOF,
  type DeclFacts,
  type FileChange,
  type FrozenSnapshot,
  type GateFinding,
  type InferenceJudgement,
  type JudgeInput,
  type LeanFacts,
  type PermittedAxioms,
  type PremiseDraft,
  type ProjectModel,
  type RulePurpose,
  type Selection,
  type StateJudgement,
  type StepScope,
} from '@telelean/core';

import { freezeChallenge, holdsTarget, runComparator, type ComparatorVerdict, type Freeze, type FreezeResult } from '../lean/comparator.js';
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
  baseProbeEnvironment,
  budgetFinding,
  buildErrorFindings,
  classifyFacts,
  comparatorFindings,
  diagnosticsOf,
  environmentMessage,
  layoutEnvironment,
  notFrozenFinding,
  probeFailedEnvironment,
  unseenProofEnvironment,
} from './findings.js';
import { collapseWhitespace, ghostScratchSource, GHOST_NEEDS_FREEZE, GHOST_UNSELECTED, readGhostScratch, readRenderScratch, renderScratchSource, type GhostScratchResult } from './scratch.js';
import {
  completionScope,
  explicitBody,
  finalCheckFailures,
  finalRuleOf,
  relianceKey,
  sameNames,
  sessionContextKey,
  sessionPermitted,
  sessionProofTargets,
  statementFactsOf,
  withG0,
} from './session.js';
import type {
  CheckContext,
  CheckReport,
  CompletionReport,
  EngineCore,
  FinalCheckReport,
  FreezeOutcome,
  FreezeRecord,
  GateReport,
  GhostCheck,
  GhostCheckInput,
  LeanCheckEngine,
  LeanCheckEngineOptions,
  LeanJobSettings,
  PremiseWriteReport,
  RenderedStatement,
  SessionCheckContext,
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
  judgeState,
  applyBackstop,
};

const RUN_ID_PATTERN = /^[A-Za-z0-9_]{1,64}$/u;
const FINISH_STATUSES: ReadonlySet<string> = new Set(['proved', 'insufficient', 'inconsistent', 'not_proved', 'lean_errors']);

/** B's facts, kept in the run directory by checkBase (read back by any engine opened on the same run). */
export const BASE_FACTS_FILE = 'base-facts.json';
const BASE_FACTS_FORMAT = 'telelean-base-facts';
/** The generated challenge module of every freeze copy. */
export const CHALLENGE_MODULE_NAME = 'TeleleanChallenge';
/**
 * Slice 2b3b (§3.8): the step id of telelean's completion of a target in its judgements (`StepScope.step`): never one
 * of Claude's steps, so no ledger entry or premise draft of a step is ever read as the completion's.
 */
export const COMPLETION_STEP = 'telelean-completion';

/** Facts statuses that are a result of Lean (the files decide them), never a sandbox's: the ones worth remembering. */
const RESULT_STATUSES: ReadonlySet<string> = new Set(['ok', 'build-errors', 'check-errors']);

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
  if (ctx.session !== undefined) validateSessionShape(ctx.session);
}

function validateSessionShape(s: SessionCheckContext): void {
  if (typeof s !== 'object' || s === null) throw new TypeError('ctx.session must be a SessionCheckContext');
  for (const field of ['inferences', 'ledger', 'items', 'premises', 'ended', 'rejectedArrows'] as const) {
    if (!Array.isArray(s[field])) throw new TypeError(`ctx.session.${field} must be an array`);
  }
}

/** Slice 2b3b: a session's step purposes need the step's scope and S₀, for the step's own target. */
function validateStepSession(ctx: CheckContext): void {
  const s = ctx.session;
  if (s === undefined) return;
  const scope = s.scope;
  if (typeof scope !== 'object' || scope === null || typeof scope.step !== 'string' || typeof scope.target !== 'string') {
    throw new TypeError("a session's check, freeze or gate needs ctx.session.scope (the step's limits)");
  }
  if (typeof s.stepStartCommit !== 'string' || s.stepStartCommit === '') throw new TypeError("a session's check, freeze or gate needs ctx.session.stepStartCommit (S₀)");
  if (scope.target !== ctx.selection.target) throw new TypeError(`ctx.session.scope.target (${scope.target}) is not ctx.selection.target (${ctx.selection.target})`);
}

/** Slice 2b3b: judge, finalCheck, writePremise and complete exist only in a session. */
function requireSession(ctx: CheckContext, method: string): SessionCheckContext {
  if (ctx.session === undefined) throw new TypeError(`${method} needs ctx.session`);
  return ctx.session;
}

function validatePremise(premise: { item: string; draft: PremiseDraft; card: string }): void {
  if (typeof premise !== 'object' || premise === null || typeof premise.item !== 'string' || typeof premise.card !== 'string') {
    throw new TypeError('a premise write needs its item and card');
  }
  const d = premise.draft;
  if (typeof d !== 'object' || d === null || typeof d.target !== 'string' || typeof d.leanName !== 'string' || typeof d.explicit !== 'string') {
    throw new TypeError('a premise write needs its draft (target, leanName, explicit)');
  }
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
/** Slice 2b3b: the facts this engine keeps per run by files key (S₀'s are looked up here). */
const RECENT_FACTS = 6;

function remember<K, V>(cache: Map<K, V>, key: K, value: V, limit: number): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) {
    const oldest = cache.keys().next();
    if (oldest.done === true) break;
    cache.delete(oldest.value);
  }
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const shortText = (text: string): string => {
  const one = text.replace(/\s+/gu, ' ').trim();
  return one.length > 60 ? `${one.slice(0, 59)}…` : one;
};

/** The rules of one ghost check (slice 1: the freeze's permitted set and the selection; a session: B.1 with E(T)). */
interface GhostRules {
  permitted: ReadonlySet<string>;
  /** B.2: the cards the proof may use directly. */
  allowed: ReadonlySet<string>;
  /** `.holds` names whose use means the suggestion does not alone entail the target. */
  selectedHolds: ReadonlySet<string>;
  /** An edit session's check (§3.8): B.2's wording, and the statement's explicit form and facts. */
  session: boolean;
}

/** Slice 2b3b (§3.8): a session's ghost rules for target T, from its B.1 judgement in the checked state (with E(T)). */
function sessionGhostRules(b1: Pick<InferenceJudgement, 'permitted' | 'contrib'>): GhostRules {
  return {
    permitted: new Set(b1.permitted),
    allowed: new Set(Object.keys(b1.contrib)),
    selectedHolds: new Set(b1.permitted.filter((a) => a.endsWith('.holds'))),
    session: true,
  };
}

/**
 * What one scratch gap check found (the engine maps it to a GhostCheck, or to a premise re-check). `consts` (a
 * session's check): the check theorem's value and type constants, what its gap proof used (`relianceKey`'s
 * `proofConsts`). `unchecked` (fixer 2b3b r1, A-V2B3B-ADV-2): telelean could not judge the suggestion (Lean's run
 * failed with no message; errors only in telelean's own lines of the file, or in its header; no `#print axioms` answer;
 * B.2 could not see what the proof uses): the ghost check refuses with these problems as before, and a premise
 * re-check leaves the draft out, as for an environment or budget outcome, never "no longer closes the gap".
 */
type ScratchOutcome =
  | { kind: 'ok'; footprint: string[]; aloneEntails: boolean; statement: string; explicit?: string; facts?: Record<string, DeclFacts>; consts?: string[] }
  | { kind: 'problems'; problems: string[] }
  | { kind: 'unchecked'; problems: string[] }
  | { kind: 'budget'; problem: string }
  | { kind: 'environment'; environment: string };

/**
 * Slice 2b3b (§3.8): `judge`'s last check of one premise draft: the reliance key it was made under (with `consts`),
 * its outcome, and the constants its gap proof used (fixer 2b3b r1: kept from the last check that read them).
 */
interface PremiseCheckMemo {
  reliance: string;
  closesGap: boolean;
  facts: Record<string, DeclFacts>;
  consts: string[];
  /** (fixer 2d r1, F-V2D-FC-8) The statement's fully explicit form, when the check passed. */
  explicit?: string;
}

class Engine implements LeanCheckEngine {
  private readonly core: EngineCore;
  private readonly refreshFacts: NonNullable<LeanCheckEngineOptions['refreshFacts']>;
  private readonly now: () => Date;
  /** runDir -> filesKey of the ws/ state whose check left the mirror clean (no finding). */
  private readonly cleanMirror = new Map<string, string>();
  /**
   * Slice 1e: runDir -> the project model (with the facts) of that clean check, for the ghost check's B.2 walk; in a
   * session (2b3b) also its judgement, for B.1 and B.2 with E(T), and the session's records it was judged under
   * (`sessionContextKey`; fixer 2b3b r1, F-FC-3: B.1 reads them, not only the files).
   */
  private readonly cleanModels = new Map<string, { key: string; model: ProjectModel; judgement?: StateJudgement; context?: string }>();
  private readonly baseFactsCache = new Map<string, StoredBaseFacts | null>();
  private readonly baseIds = new Map<string, string>();
  private readonly models = new Map<string, ProjectModel>();
  /** Slice 2b3b: runDir -> the files key and facts of the mirror's last refresh, when Lean gave a result. */
  private readonly built = new Map<string, { key: string; facts: LeanFacts }>();
  /** Slice 2b3b: runDir -> recent facts by files key (S₀'s facts are found here). */
  private readonly recent = new Map<string, Map<string, LeanFacts>>();
  /** Slice 2b3b: runDir -> the active step's S₀ and its facts. */
  private readonly stepStarts = new Map<string, { commit: string; facts: LeanFacts }>();
  /** Slice 2b3b (§3.8): runDir -> premise item key -> its last check by `judge` (fixer 2b3b r1: with its outcome). */
  private readonly reliances = new Map<string, Map<string, PremiseCheckMemo>>();
  /** Slice 2b3b: runDir -> the tail of the run's operations that use the mirror (one at a time per run). */
  private readonly locks = new Map<string, Promise<void>>();

  constructor(options: LeanCheckEngineOptions) {
    this.core = { ...DEFAULT_CORE, ...options.core };
    this.refreshFacts = options.refreshFacts ?? refreshLeanFacts;
    this.now = options.now ?? ((): Date => new Date());
  }

  /**
   * Slice 2b3b: runs `job` after every earlier operation of the same run that uses its mirror has ended. A session's
   * judge runs outside its write queue (§2.6), so without this a premise write's build could replace the mirror between
   * the judge's build and its premise checks or renders.
   */
  private locked<T>(shadow: ShadowWorkspace, job: () => Promise<T>): Promise<T> {
    const key = shadow.paths.runDir;
    const previous = this.locks.get(key) ?? Promise.resolve();
    const run = previous.then(job);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.locks.set(key, tail);
    void tail.then(() => {
      if (this.locks.get(key) === tail) this.locks.delete(key);
    });
    return run;
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

  /** B for the rules (the base commit, or `ctx.baseCommit`): its files, and its model with B's facts when kept. */
  private async baseOf(ctx: CheckContext): Promise<{ id: string; files: Map<string, string>; model: ProjectModel }> {
    const shadow = ctx.shadow;
    const baseCommit = await this.baseCommitId(shadow);
    const id = ctx.baseCommit ?? baseCommit;
    const files = await shadow.filesAt(id);
    const stored = id === baseCommit ? await this.loadBaseFacts(shadow) : undefined;
    const model = await this.commitModel(shadow, id, stored !== undefined && stored.commit === id ? stored.facts : undefined);
    return { id, files, model };
  }

  // ------------------------------------------------------------------------------------------------ Lean jobs

  /**
   * One refresh of the mirror: its build, check and isolated probe jobs (2b3a), one after another under one
   * `runExclusive`, so no other Lean job of telelean runs between them.
   */
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

  /**
   * Slice 2b3b: syncs the mirror to `files` (ws/ when absent, as slice 1 does) and refreshes it; facts that are Lean's
   * result for these files are remembered by their files key (the mirror's build, and S₀'s facts later).
   * Throws ShadowLayoutError like `syncMirror`.
   */
  private async build(shadow: ShadowWorkspace, job: LeanJobSettings, files: ReadonlyMap<string, string> | undefined, key: string): Promise<LeanFacts> {
    const runDir = shadow.paths.runDir;
    this.cleanMirror.delete(runDir);
    this.built.delete(runDir);
    await shadow.syncMirror(files);
    const facts = await this.refresh(shadow, job);
    if (RESULT_STATUSES.has(facts.status)) {
      remember(this.built, runDir, { key, facts }, RUN_CACHE_SIZE);
      const recent = this.recent.get(runDir) ?? new Map<string, LeanFacts>();
      remember(recent, key, facts, RECENT_FACTS);
      remember(this.recent, runDir, recent, RUN_CACHE_SIZE);
    }
    return facts;
  }

  /**
   * Slice 2b3b: the facts of exactly `files`: the mirror's own when `reusable` and it was last built from them (its
   * sources still theirs), else a build. `environment` when the mirror cannot be synced.
   */
  private async factsFor(
    ctx: CheckContext,
    files: ReadonlyMap<string, string>,
    key: string,
    reusable: boolean,
  ): Promise<{ facts: LeanFacts; reused: boolean } | { environment: string }> {
    const last = this.built.get(ctx.shadow.paths.runDir);
    if (reusable && last !== undefined && last.key === key && (await this.mirrorHolds(ctx.shadow, files))) return { facts: last.facts, reused: true };
    try {
      return { facts: await this.build(ctx.shadow, ctx.job, files, key), reused: false };
    } catch (error) {
      if (error instanceof ShadowLayoutError) return { environment: layoutEnvironment(error) };
      throw error;
    }
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

  /**
   * A G4 challenge (docs/m2-plan.md sections 3.3 and 7.1): a copy of `snapshotDir` (the mirror, or a freeze's copy)
   * without `removeDecls`, plus `theorem T.holds : T := sorry`, built and exported in `frozen/<n>`, whose build tree
   * goes afterwards (its sources and the export stay for the record).
   */
  private async challenge(
    ctx: CheckContext,
    i: { snapshotDir: string; targetStatement: string; permitted: readonly string[]; removeDecls: readonly string[]; definitionNames?: readonly string[] },
  ): Promise<{ freeze: Freeze } | { environment: string }> {
    const shadow = ctx.shadow;
    const library = shadow.library;
    const dir = await this.nextDir(shadow.paths.frozenDir);
    const outcome = await runExclusive(async (): Promise<{ result: FreezeResult } | { environment: string }> => {
      const gate = this.memoryGate(ctx.job);
      if (!gate.ok) return { environment: gate.environment };
      try {
        const result = await freezeChallenge({
          snapshotDir: i.snapshotDir,
          freezeDir: path.join(dir, 'project'),
          imports: [library],
          challengeModule: `${library}.${CHALLENGE_MODULE_NAME}`,
          targets: [holdsTarget(i.targetStatement)],
          permittedAxioms: [...i.permitted],
          definitionNames: [...(i.definitionNames ?? [])],
          exportPath: path.join(dir, 'frozen.ndjson'),
          removeDecls: [...i.removeDecls],
          run: this.runOptions(ctx.job, gate.memoryMax),
        });
        return { result };
      } catch (error) {
        return { environment: `telelean could not prepare the frozen statements: ${(error as Error).message}` };
      }
    });
    // The copy's build tree is large and no longer needed; its sources and the export stay for the record.
    await rm(path.join(dir, 'project', '.lake'), { recursive: true, force: true });
    if ('environment' in outcome) return outcome;
    if (!outcome.result.ok) {
      // The agent's files built and passed the rules: a failing challenge is telelean's problem, never counted.
      const run = outcome.result.export ?? outcome.result.build;
      return {
        environment:
          run.status === 'cancelled'
            ? environmentMessage('cancelled')
            : `telelean could not export the frozen statements (challenge ${outcome.result.stage}): ${outcome.result.detail}`,
      };
    }
    return { freeze: outcome.result.freeze };
  }

  // ------------------------------------------------------------------------------------------------ check

  private envReport(environment: string, started: number, extra: Partial<CheckReport> = {}): CheckReport {
    return { outcome: 'environment', environment, g0: [], findings: [], diagnostics: [], ...extra, durationMs: Math.round(performance.now() - started) };
  }

  /**
   * Slice 2b3b: S₀ with its facts, for a session step's rules (D2-41: S₀'s meaning, by its facts). This engine's facts
   * of S₀'s files when it has them (the judge or the gate that judged S₀), else S₀ is built once (after a reload),
   * before the mirror is built for ws/.
   * Fixer 2b3b r1 (F-FC-4, A-V2B3B-ADV-4; AP30-1 r2): G0 judges S₀'s files first, so text G0 refuses never reaches the
   * mirror from S₀ either (a stage that G0 refused is judged without facts, so no facts of it are kept, and a step may
   * start from it): when it finds anything, S₀ is neither synced nor built, and the step's check is an `environment`
   * outcome (Claude cannot change S₀).
   */
  private async stepStartModel(ctx: CheckContext, baseFiles: ReadonlyMap<string, string>): Promise<{ model: ProjectModel } | { environment: string }> {
    const shadow = ctx.shadow;
    const runDir = shadow.paths.runDir;
    const commit = ctx.session?.stepStartCommit ?? '';
    const files = await shadow.filesAt(commit);
    const refused = this.g0Of(ctx, baseFiles, files);
    if (refused.length > 0) {
      return { environment: `telelean could not build the state this step started from: it holds text that is not allowed in the model files (${refused[0]?.message ?? 'G0'})` };
    }
    const key = filesKey(files);
    const pinned = this.stepStarts.get(runDir);
    let facts = pinned?.commit === commit ? pinned.facts : this.recent.get(runDir)?.get(key);
    if (facts === undefined) {
      const built = await this.build(shadow, ctx.job, files, key);
      const outcome = classifyFacts(built, ctx.job.leanJobMs);
      if (outcome.kind !== 'ok') {
        return { environment: `telelean could not build the state this step started from (${outcome.kind === 'budget' ? outcome.finding.message : outcome.message})` };
      }
      facts = built;
    }
    remember(this.stepStarts, runDir, { commit, facts }, RUN_CACHE_SIZE);
    return { model: this.model(files, shadow.library, facts) };
  }

  /** Slice 2b3b: core judgeState with the session's records, for any purpose. */
  private judgeSession(
    ctx: CheckContext,
    purpose: JudgeInput['purpose'],
    commit: string,
    key: string,
    base: ProjectModel,
    current: ProjectModel,
    step?: { stage?: JudgeInput['stage']; stepStart: ProjectModel; scope: StepScope; freeze?: FrozenSnapshot },
  ): StateJudgement {
    const s = requireSession(ctx, 'judgeState');
    return this.core.judgeState({
      purpose,
      stage: step?.stage ?? 'prove',
      commit,
      filesKey: key,
      base,
      current,
      ...(step !== undefined ? { stepStart: step.stepStart, scope: step.scope } : {}),
      ...(step?.freeze !== undefined ? { freeze: step.freeze } : {}),
      inferences: s.inferences,
      ledger: s.ledger,
      items: s.items,
      premises: s.premises,
      ended: s.ended,
      rejectedArrows: s.rejectedArrows,
      ...(s.noAlternative !== undefined ? { noAlternative: s.noAlternative } : {}),
    });
  }

  /**
   * The check behind check/freeze/gate/ghost: G0 -> sync -> build -> models -> rules. `given` = ws/ already read;
   * `judgedCommit`: the gate's commit, which a session's judgement names (check and freeze judge no commit: '').
   */
  private async runCheck(ctx: CheckContext, purpose: RulePurpose, given?: ReadonlyMap<string, string>, judgedCommit?: string): Promise<CheckReport> {
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

    // Slice 2b3b: a session step's rules compare with S₀ by its facts; built first when this engine has none of them.
    let stepStart: ProjectModel | undefined;
    if (ctx.session !== undefined) {
      try {
        const start = await this.stepStartModel(ctx, baseFiles);
        if ('environment' in start) return this.envReport(start.environment, started);
        stepStart = start.model;
      } catch (error) {
        if (error instanceof ShadowLayoutError) return this.envReport(layoutEnvironment(error), started);
        throw error;
      }
    }

    // G1: the build mirror holds exactly ws/'s model files; one refresh builds and checks it.
    let facts: LeanFacts;
    try {
      facts = await this.build(shadow, ctx.job, ctx.session !== undefined ? files : undefined, filesKey(files));
    } catch (error) {
      if (error instanceof ShadowLayoutError) return this.envReport(layoutEnvironment(error), started);
      throw error;
    }
    const diagnostics = diagnosticsOf(facts, ctx.files);
    const build = {
      status: facts.status,
      durationMs: leanDurationMs(facts),
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
    if (ctx.session !== undefined) {
      const scope = ctx.session.scope;
      if (stepStart === undefined || scope === undefined) throw new TypeError("a session's check needs its scope and S₀");
      return this.sessionVerdict(ctx, purpose, files, judgedCommit ?? '', base, current, stepStart, scope, facts, { diagnostics, build }, started);
    }
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
    // Slice 2b3a (§2.1, "A failed probe never passes"): no declaration has constants, so when the rules find nothing, or
    // only B.2's `source-only` (which the missing constants cause), the check is telelean's `environment` outcome with
    // the probe's cause (not counted); any other finding is Claude's to fix as usual.
    const probeEnvironment = probeFailedEnvironment(findings, facts);
    if (probeEnvironment !== undefined) return this.envReport(probeEnvironment, started, { diagnostics, build, rules, model: current, base, facts });
    const ok = findings.length === 0;
    if (ok) {
      const key = filesKey(files);
      remember(this.cleanMirror, shadow.paths.runDir, key, RUN_CACHE_SIZE);
      remember(this.cleanModels, shadow.paths.runDir, { key, model: current }, RUN_CACHE_SIZE);
    }
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

  /**
   * Slice 2b3b (§2.9, AP30-3): a session step's verdict. judgeState with the step's scope, S₀ and freeze (none at the
   * freeze itself) and the session's records; the step's findings are the judgement's `stepFindings` (and the build's
   * Lean errors, fail closed, when the rules did not report them). §2.1's failed-probe rule applies to them: an
   * `environment` outcome with `probeFailure`'s sentence when they are empty or only `source-only`. The judgement's
   * `ok` never decides alone (a `facts` or `unowned` problem is in no step finding).
   */
  private sessionVerdict(
    ctx: CheckContext,
    purpose: RulePurpose,
    files: ReadonlyMap<string, string>,
    commit: string,
    base: ProjectModel,
    current: ProjectModel,
    stepStart: ProjectModel,
    scope: StepScope,
    facts: LeanFacts,
    lean: Pick<CheckReport, 'diagnostics' | 'build'>,
    started: number,
  ): CheckReport {
    const key = filesKey(files);
    const judgement = this.judgeSession(ctx, purpose, commit, key, base, current, {
      stage: ctx.stage,
      stepStart,
      scope,
      ...(ctx.freeze !== undefined ? { freeze: ctx.freeze.snapshot } : {}),
    });
    const findings = [...judgement.stepFindings];
    if (!findings.some((f) => f.code === 'build')) findings.unshift(...buildErrorFindings(facts));
    const probeEnvironment = probeFailedEnvironment(findings, facts);
    if (probeEnvironment !== undefined) return this.envReport(probeEnvironment, started, { ...lean, model: current, base, facts, judgement });
    const ok = findings.length === 0;
    if (ok) {
      remember(this.cleanMirror, ctx.shadow.paths.runDir, key, RUN_CACHE_SIZE);
      const context = ctx.session !== undefined ? sessionContextKey(ctx.session) : undefined;
      remember(this.cleanModels, ctx.shadow.paths.runDir, { key, model: current, judgement, ...(context !== undefined ? { context } : {}) }, RUN_CACHE_SIZE);
    }
    return { outcome: ok ? 'ok' : 'problems', g0: [], findings, ...lean, model: current, base, facts, judgement, durationMs: Math.round(performance.now() - started) };
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
    return this.locked(ctx.shadow, () =>
      this.guarded(
        () => this.checkBaseNow(ctx, started),
        (environment) => this.envReport(environment, started),
      ),
    );
  }

  private async checkBaseNow(ctx: CheckContext, started: number): Promise<CheckReport> {
    const shadow = ctx.shadow;
    const baseId = ctx.baseCommit ?? (await this.baseCommitId(shadow));
    const files = await shadow.currentFiles();
    if (!sameFiles(files, await shadow.filesAt(baseId))) {
      return this.envReport('the working copy changed before telelean built your files; start the run again', started);
    }
    const facts = await this.build(shadow, ctx.job, undefined, filesKey(files));
    const diagnostics = diagnosticsOf(facts);
    const build = {
      status: facts.status,
      durationMs: leanDurationMs(facts),
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
      // Slice 2b3a (§2.1, AP30-2): B built, but its own probe failed (its size, or an error of the walk on the person's
      // files): every state of the session would fail the same way, so the start refuses before Claude is contacted.
      const baseProbe = baseProbeEnvironment(facts);
      if (baseProbe !== undefined) return this.envReport(baseProbe, started, { diagnostics, build, model, facts });
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
    validateStepSession(ctx);
    const started = performance.now();
    return this.locked(ctx.shadow, () =>
      this.guarded(
        () => this.runCheck(ctx, 'check'),
        (environment) => this.envReport(environment, started),
      ),
    );
  }

  async freeze(ctx: CheckContext): Promise<FreezeOutcome> {
    validateContext(ctx);
    validateStepSession(ctx);
    const started = performance.now();
    return this.locked(ctx.shadow, () =>
      this.guarded(
        () => this.freezeNow(ctx),
        (environment) => ({ ok: false, refusals: [environment], report: this.envReport(environment, started), environment }),
      ),
    );
  }

  /**
   * Slice 2b3b (D2-19, §3.3): a session's permitted set for the step's target, from B.1 in `judgement` (with E(T)), in
   * slice 1's categories over B.1's sources.
   */
  private sessionPermittedOf(model: ProjectModel, base: ProjectModel | undefined, selection: Selection, b1: InferenceJudgement): PermittedAxioms {
    const sources = Object.keys(b1.contrib).filter((id) => model.nodes.get(id)?.node.subject === selection.subject && id !== selection.target);
    const categories = this.core.computePermittedAxioms(model, { ...selection, premises: sources, adoptedGhosts: [] }, base);
    return sessionPermitted(categories, b1);
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
      let permitted: PermittedAxioms;
      if (ctx.session !== undefined) {
        // Slice 2b3b (§3.3, D2-19): B.1's permitted set on the frozen state, with E(T).
        const b1 = report.judgement?.inferences[ctx.selection.target];
        if (b1 === undefined) {
          const environment = `telelean did not judge “${ctx.selection.target}” on the frozen state`;
          return { ok: false, refusals: [environment], report, environment };
        }
        permitted = this.sessionPermittedOf(model, report.base, ctx.selection, b1);
      } else {
        // Derivation footprints only from the user's own proofs in B (never from a proof Claude wrote in the run).
        permitted = this.core.computePermittedAxioms(model, ctx.selection, report.base);
      }
      snapshot = { ...this.core.frozenSnapshot(model, ctx.selection, ctx.round, report.base), permitted };
    } catch (error) {
      if (error instanceof ActionError) return { ok: false, refusals: [error.message], report };
      throw error;
    }

    // G4's challenge: a copy of the mirror without the target's `.holds` and everything that uses it, plus
    // `theorem T.holds : T := sorry`, built and exported (docs/m2-plan.md sections 3.3 and 7.1).
    const target = snapshot.targetStatement;
    const challenge = await this.challenge(ctx, {
      snapshotDir: shadow.paths.build,
      targetStatement: target,
      permitted: snapshot.permitted.all,
      removeDecls: removalClosure(facts, declaredNames(model), holdsName(target)),
    });
    if ('environment' in challenge) return { ok: false, refusals: [challenge.environment], report, environment: challenge.environment };
    const commit = await shadow.commit('freeze', `Statements frozen (round ${ctx.round})`, ctx.round);
    const record: FreezeRecord = { round: ctx.round, commit, at: this.now().toISOString(), selection: ctx.selection, snapshot, freeze: challenge.freeze };
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
    validateStepSession(ctx);
    if (!FINISH_STATUSES.has(ctx.status)) throw new TypeError(`unknown finish status ${JSON.stringify(ctx.status)}`);
    const started = performance.now();
    return this.locked(ctx.shadow, () =>
      this.guarded(
        () => this.gateNow(ctx, started),
        (environment) => ({
          passed: false,
          environment,
          findings: [],
          flaggedDefinitions: [],
          check: this.envReport(environment, started),
          durationMs: Math.round(performance.now() - started),
        }),
      ),
    );
  }

  private async gateNow(ctx: CheckContext & { status: FinishStatus }, started: number): Promise<GateReport> {
    const elapsed = (): number => Math.round(performance.now() - started);
    const files = await ctx.shadow.currentFiles();
    const commit = await this.judgedCommit(ctx, files);
    const proved = ctx.status === 'proved';
    const report = await this.runCheck(ctx, proved ? 'gate-proved' : 'gate-other', files, commit.id);
    const flaggedDefinitions = report.rules?.flaggedDefinitions ?? [];
    const judgement = report.judgement !== undefined ? { judgement: report.judgement } : {};
    if (report.outcome === 'environment') {
      return { passed: false, environment: report.environment ?? 'telelean could not run Lean', findings: [], flaggedDefinitions, check: report, durationMs: elapsed(), commit, ...judgement };
    }
    const findings = [...report.g0, ...report.findings];
    if (proved && ctx.freeze === undefined && !findings.some((f) => f.code === 'not-frozen')) findings.push(notFrozenFinding());
    // Slice 1e fixer (AP-13, A2): B.2 refusing only because telelean could not see which cards the proof uses is not
    // Claude's to fix: an environment outcome, so no attempt is counted (findings.ts `unseenProofEnvironment`).
    const unseen = unseenProofEnvironment(findings, report.facts?.detail);
    if (unseen !== undefined) return { passed: false, environment: unseen, findings: [], flaggedDefinitions, check: report, durationMs: elapsed(), commit, ...judgement };
    const targetStatement = ctx.freeze?.snapshot.targetStatement ?? report.model?.nodes.get(ctx.selection.target)?.statementDecl?.decl.fullName;
    const footprint = proved && targetStatement !== undefined ? report.facts?.decls.find((d) => d.name === holdsName(targetStatement))?.axioms : undefined;
    let comparator: ComparatorVerdict | undefined;
    let environment: string | undefined;
    let renewed: FreezeRecord | undefined;
    if (proved && ctx.freeze !== undefined && findings.length === 0) {
      let challenge = ctx.freeze.freeze;
      // Slice 2b3b (D2-19, §3.3 step 5): B.1's permitted set recomputed on the gated state, with E(T); when it differs
      // from the freeze's, a new challenge from the freeze's copy, changing only the permitted axioms.
      const b1 = ctx.session !== undefined ? report.judgement?.inferences[ctx.selection.target] : undefined;
      if (b1 !== undefined && report.model !== undefined && !sameNames(b1.permitted, ctx.freeze.snapshot.permitted.all)) {
        let again: { record: FreezeRecord } | { environment: string };
        try {
          again = await this.reexport(ctx, ctx.freeze, this.sessionPermittedOf(report.model, report.base, ctx.selection, b1));
        } catch (error) {
          if (!(error instanceof ActionError)) throw error;
          again = { environment: `telelean could not compute the permitted set again: ${error.message}` };
        }
        if ('environment' in again) environment = again.environment;
        else {
          renewed = again.record;
          challenge = renewed.freeze;
        }
      }
      if (environment === undefined) {
        const g4 = await this.compare(ctx, challenge);
        comparator = g4.verdict;
        environment = g4.environment;
        findings.push(...g4.findings);
      }
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
      ...judgement,
      ...(renewed !== undefined ? { freeze: renewed } : {}),
    };
  }

  /**
   * Slice 2b3b (D2-19, §3.3 step 5): a new challenge for `freeze`'s step with `permitted`, built from the freeze's own
   * copy (`frozen/<n>/project`: the sources at the freeze, without the target's `.holds` and its users, and the
   * challenge module; only its `.lake` is built again), never from the mirror, which holds the gated state: a challenge
   * exported from it would already hold a definition changed after the freeze, which G4 could then not catch.
   */
  private async reexport(ctx: CheckContext, freeze: FreezeRecord, permitted: PermittedAxioms): Promise<{ record: FreezeRecord } | { environment: string }> {
    const challenge = await this.challenge(ctx, {
      snapshotDir: path.join(path.dirname(freeze.freeze.exportPath), 'project'),
      targetStatement: freeze.snapshot.targetStatement,
      permitted: permitted.all,
      removeDecls: [],
      definitionNames: freeze.freeze.definitionNames,
    });
    if ('environment' in challenge) return { environment: `telelean could not export the frozen statements again with the new permitted set: ${challenge.environment}` };
    return { record: { ...freeze, at: this.now().toISOString(), snapshot: { ...freeze.snapshot, permitted }, freeze: challenge.freeze } };
  }

  /** G4: lake comparator in the mirror against a challenge. */
  private async compare(ctx: CheckContext, challenge: Freeze): Promise<{ verdict?: ComparatorVerdict; findings: GateFinding[]; environment?: string }> {
    const workDir = await this.nextDir(ctx.shadow.paths.gateDir);
    const outcome = await runExclusive(async (): Promise<{ verdict: ComparatorVerdict } | { environment: string }> => {
      const gate = this.memoryGate(ctx.job);
      if (!gate.ok) return { environment: gate.environment };
      const result = await runComparator({
        solutionDir: ctx.shadow.paths.build,
        freeze: challenge,
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
    validateStepSession(ctx);
    if (typeof ghost !== 'object' || ghost === null || typeof ghost.leanStatement !== 'string' || typeof ghost.proof !== 'string') {
      throw new TypeError('a ghost needs leanStatement and proof');
    }
    // Fixer 2b3b r1 (F-FC-5): in a session the draft's facts are kept under its Lean name, so a check without one is
    // the caller's mistake, never "telelean could not read the suggested statement back".
    if (ctx.session !== undefined && (typeof ghost.leanName !== 'string' || ghost.leanName === '')) {
      throw new TypeError("a session's ghost check needs ghost.leanName (the draft's Lean name, under which its facts are kept)");
    }
    if (ctx.freeze === undefined) return { ok: false, problems: [GHOST_NEEDS_FREEZE] };
    const freeze = ctx.freeze;
    // The single-term rule, before any Lean (docs/m2-plan.md section 3.8, fact 8).
    const textProblems = this.core.ghostTextProblems(ghost.leanStatement, ghost.proof);
    if (textProblems.length > 0) return { ok: false, problems: [...textProblems] };
    return this.locked(ctx.shadow, () =>
      this.guarded(
        () => this.checkGhostNow(ctx, freeze, ghost),
        (environment) => ({ ok: false, problems: [environment], environment }),
      ),
    );
  }

  private async checkGhostNow(ctx: CheckContext, freeze: FreezeRecord, ghost: GhostCheckInput): Promise<GhostCheck> {
    // The mirror must hold a clean check of ws/ as it is (this engine's last clean check, of exactly the mirror's files).
    // In a session, its judgement must also have been made under the session's records as they are now (fixer 2b3b
    // r1, F-FC-3): B.1 with E(T) reads the ledger, and a propose_arrow adds an arrow there with no file changed.
    const files = await ctx.shadow.currentFiles();
    const runDir = ctx.shadow.paths.runDir;
    const key = filesKey(files);
    const cached = this.cleanModels.get(runDir);
    const usable =
      cached !== undefined && cached.key === key && (ctx.session === undefined || (cached.judgement !== undefined && cached.context === sessionContextKey(ctx.session)));
    let model: ProjectModel | undefined = usable ? cached.model : undefined;
    let judgement: StateJudgement | undefined = usable ? cached.judgement : undefined;
    if (this.cleanMirror.get(runDir) !== key || model === undefined || !(await this.mirrorHolds(ctx.shadow, files))) {
      const report = await this.runCheck(ctx, 'check', files);
      if (report.outcome === 'environment') {
        const environment = report.environment ?? 'telelean could not run Lean';
        return { ok: false, problems: [environment], environment };
      }
      if (report.outcome === 'problems') {
        return { ok: false, problems: ['The files do not pass check_lean, so the suggestion was not checked. Fix these first:', ...[...report.g0, ...report.findings].map((f) => f.message)] };
      }
      model = report.model;
      judgement = report.judgement;
    }

    let rules: GhostRules;
    if (ctx.session !== undefined) {
      // Slice 2b3b (§3.8): B.1's permitted set with E(T), and B.2's sources of Q(T) ∪ E(T), on this state.
      const b1 = judgement?.inferences[ctx.selection.target];
      if (b1 === undefined) {
        const environment = `telelean did not judge “${ctx.selection.target}” on these files, so the suggestion was not checked`;
        return { ok: false, problems: [environment], environment };
      }
      rules = sessionGhostRules(b1);
    } else {
      rules = {
        permitted: new Set(freeze.snapshot.permitted.all),
        allowed: new Set([...ctx.selection.premises, ...ctx.selection.adoptedGhosts]),
        selectedHolds: new Set([...freeze.snapshot.permitted.selected, ...freeze.snapshot.permitted.derivationFootprints].filter((a) => a.endsWith('.holds'))),
        session: false,
      };
    }
    const outcome = await this.ghostScratchCheck(ctx, ctx.selection.target, freeze.snapshot.targetStatement, model, ghost, rules);
    switch (outcome.kind) {
      case 'environment':
        return { ok: false, problems: [outcome.environment], environment: outcome.environment };
      case 'budget':
        return { ok: false, problems: [`${outcome.problem}: simplify the proof of the suggestion.`] };
      case 'problems':
      case 'unchecked':
        return { ok: false, problems: outcome.problems };
      case 'ok':
        if (rules.session && (outcome.explicit === undefined || outcome.facts === undefined)) {
          return { ok: false, problems: ['telelean could not read the suggested statement back from Lean (its fully explicit form, or what it uses), so the suggestion was not checked.'] };
        }
        return {
          ok: true,
          footprint: outcome.footprint,
          aloneEntails: outcome.aloneEntails,
          statement: outcome.statement,
          ...(outcome.explicit !== undefined ? { explicit: outcome.explicit } : {}),
          ...(outcome.facts !== undefined ? { facts: outcome.facts } : {}),
        };
    }
  }

  /**
   * The pinned scratch check (fact 7) of one suggestion against `target`, in the mirror (which holds a clean, built
   * state: `model` is its project model with facts), with the value probe for B.2 (slice 1e) and, in a session (2b3b,
   * §3.8), the statement's explicit form and its own constants.
   */
  private async ghostScratchCheck(
    ctx: CheckContext,
    target: string,
    targetStatement: string,
    model: ProjectModel | undefined,
    ghost: GhostCheckInput,
    rules: GhostRules,
  ): Promise<ScratchOutcome> {
    const statement = collapseWhitespace(ghost.leanStatement);
    const namespace = ctx.selection.subject;
    // The declarations of the clean check's facts are the names the walk continues through.
    const scratch = ghostScratchSource({
      library: ctx.shadow.library,
      namespace,
      targetStatement,
      statement,
      proof: ghost.proof,
      probe: { names: [...(model?.declFacts.keys() ?? [])] },
      ...(rules.session ? { statementFacts: true } : {}),
    });
    const lean = await this.leanStdin(ctx.shadow, ctx.job, scratch.source);
    if (!lean.ok) {
      if (lean.environment !== undefined) return { kind: 'environment', environment: lean.environment };
      return { kind: 'budget', problem: lean.budget ?? "telelean's check failed" };
    }
    const messages = parseLeanJsonMessages(lean.run.stdout);
    const result = readGhostScratch(scratch, messages);
    // Fixer 2b3b r1 (A-V2B3B-ADV-2): what telelean could not judge is `unchecked`, never the suggestion's failure: a run
    // that failed with no message, errors only in telelean's own lines (or in the header, which fails every line after
    // it), and no `#print axioms` answer. The ghost check refuses with them as before; a premise re-check leaves the
    // draft out.
    if (lean.run.status === 'failed' && messages.length === 0) {
      return { kind: 'unchecked', problems: [`Lean could not check the suggestion: ${lean.run.stderr.trim().split('\n').slice(-5).join('\n') || `exit code ${String(lean.run.exitCode)}`}`] };
    }
    if (result.errors.length > 0) return { kind: result.errorsAt === 'suggestion' ? 'problems' : 'unchecked', problems: [...result.errors] };
    if (result.axioms === undefined) return { kind: 'unchecked', problems: [`Lean printed no axioms for ${scratch.checkName}, so the suggestion could not be checked.`] };
    const axioms = result.axioms;
    if (axioms.includes(SORRY_AXIOM)) return { kind: 'problems', problems: ['The proof that the suggestion closes the gap uses sorry.'] };
    const outside = axioms.filter((a) => !rules.permitted.has(a));
    if (outside.length > 0) {
      return {
        kind: 'problems',
        problems: [
          rules.session
            ? `The proof that the suggestion closes the gap rests on axioms outside the permitted set: ${outside.map((a) => `\`${a}\``).join(', ')}. It may use only the .holds of the target's sources (the arrows the person selected, and yours into the target), the vocabulary and Lean's standard axioms (besides the suggestion itself).`
            : `The proof that the suggestion closes the gap rests on axioms outside the permitted set: ${outside.map((a) => `\`${a}\``).join(', ')}. It may use only the selected premises' .holds, the vocabulary and Lean's standard axioms (besides the suggestion itself).`,
        ],
      };
    }
    // Spec v4.1 RV-1 ("the check includes B.2"), slice 1e: the proof that the suggestion closes the gap may use directly
    // only the allowed cards (and the suggestion, its hypothesis): the footprint above lets through an unselected
    // proved card whose basis the selection covers (S14). In a session (2b3b) the allowed cards are Q(T) ∪ E(T)'s.
    const direct = ghostDirectProblems({ selection: { ...ctx.selection, target } }, model, result, axioms, rules.allowed, rules.session);
    // B.2 that could not see what the proof uses (UNSEEN_PROOF: no value probe line, out-of-date facts) is telelean's;
    // a card used without an arrow, or behind the arrows, is the suggestion's.
    if (direct.length > 0) return { kind: direct.every((p) => p.startsWith(UNSEEN_PROOF)) ? 'unchecked' : 'problems', problems: direct };
    const aloneEntails = !axioms.some((a) => rules.selectedHolds.has(a));
    if (!rules.session) return { kind: 'ok', footprint: axioms, aloneEntails, statement };
    const explicit = result.explicit !== undefined ? explicitBody(result.explicit) : undefined;
    const facts =
      ghost.leanName !== undefined && result.statementValueConsts !== undefined && result.statementTypeConsts !== undefined
        ? statementFactsOf({ namespace, leanName: ghost.leanName, statement, valueConsts: result.statementValueConsts, typeConsts: result.statementTypeConsts })
        : undefined;
    const consts = [...new Set([...(result.valueConsts ?? []), ...(result.typeConsts ?? [])])].sort();
    return { kind: 'ok', footprint: axioms, aloneEntails, statement, consts, ...(explicit !== undefined ? { explicit } : {}), ...(facts !== undefined ? { facts } : {}) };
  }

  async renderStatements(ctx: Pick<CheckContext, 'shadow' | 'job'>, names: readonly string[]): Promise<RenderedStatement[]> {
    if (typeof ctx !== 'object' || ctx === null) throw new TypeError('renderStatements needs a context');
    validateShadow(ctx.shadow);
    validateJob(ctx.job);
    if (!Array.isArray(names) || names.some((n) => typeof n !== 'string')) throw new TypeError('names must be an array of strings');
    if (names.length === 0) return [];
    return this.locked(ctx.shadow, () => this.renderNow(ctx, names));
  }

  /** `renderStatements` inside an operation that already holds the run's lock. */
  private async renderNow(ctx: Pick<CheckContext, 'shadow' | 'job'>, names: readonly string[]): Promise<RenderedStatement[]> {
    const scratch = renderScratchSource(ctx.shadow.library, names);
    if (scratch.lines.size === 0) return readRenderScratch(scratch, names, []);
    const lean = await this.leanStdin(ctx.shadow, ctx.job, scratch.source);
    if (!lean.ok) {
      const error = lean.environment ?? lean.budget ?? 'telelean could not run Lean';
      return names.map((name) => ({ name, pretty: '', explicit: '', error }));
    }
    return readRenderScratch(scratch, names, parseLeanJsonMessages(lean.run.stdout));
  }

  // ------------------------------------------------------------------------------------------------ a session's states

  /** Slice 2b3b: the shadow's newest commit, the head a session judges outside a step (§2.6). */
  private async headOf(shadow: ShadowWorkspace): Promise<ShadowCommit> {
    const head = (await shadow.commits()).at(-1);
    if (head === undefined) throw new ShadowLayoutError('git', `the shadow of run ${shadow.runId} has no commit`);
    return head;
  }

  /** G0 on `files` against B (Claude's lines only; B's are the person's). */
  private g0Of(ctx: CheckContext, baseFiles: ReadonlyMap<string, string>, files: ReadonlyMap<string, string>): GateFinding[] {
    const library = ctx.shadow.library;
    return this.core.checkFileChanges(baseFiles, files, { library, subject: ctx.selection.subject, projectModules: projectModulesOf(files, library) });
  }

  /** The Lean part of a report for `facts`. */
  private leanParts(facts: LeanFacts): Pick<CheckReport, 'diagnostics' | 'build'> {
    return {
      diagnostics: diagnosticsOf(facts),
      build: { status: facts.status, durationMs: leanDurationMs(facts), errorCount: facts.build.messages.filter((m) => m.severity === 'error').length },
    };
  }

  async judge(ctx: CheckContext): Promise<{ judgement: StateJudgement; report: CheckReport }> {
    validateContext(ctx);
    requireSession(ctx, 'judge');
    const started = performance.now();
    return this.locked(ctx.shadow, () => this.judgeNow(ctx, started));
  }

  private async judgeNow(ctx: CheckContext, started: number): Promise<{ judgement: StateJudgement; report: CheckReport }> {
    const elapsed = (): number => Math.round(performance.now() - started);
    const shadow = ctx.shadow;
    const library = shadow.library;
    const head = await this.headOf(shadow);
    const files = await shadow.filesAt(head.id);
    const key = filesKey(files);
    const base = await this.baseOf(ctx);
    const factless = (): StateJudgement => this.judgeSession(ctx, 'stage', head.id, key, base.model, this.model(files, library));

    // G0 first (AP30-1 r2): nothing is synced, built, probed or checked; the files are judged without facts.
    const g0 = this.g0Of(ctx, base.files, files);
    if (g0.length > 0) return { judgement: withG0(factless(), g0), report: { outcome: 'problems', g0, findings: [], diagnostics: [], durationMs: elapsed() } };

    const got = await this.factsFor(ctx, files, key, true);
    if ('environment' in got) return { judgement: factless(), report: this.envReport(got.environment, started) };
    const facts = got.facts;
    const lean = this.leanParts(facts);
    // Lean could not judge these files (a sandbox status, or a budget): judged without facts, as partial as G0's.
    const outcome = classifyFacts(facts, ctx.job.leanJobMs);
    if (outcome.kind === 'environment') return { judgement: factless(), report: this.envReport(outcome.message, started, { ...lean, facts }) };
    if (outcome.kind === 'budget') return { judgement: factless(), report: { outcome: 'problems', g0: [], findings: [outcome.finding], ...lean, facts, durationMs: elapsed() } };

    const current = this.model(files, library, facts);
    let judgement = this.judgeSession(ctx, 'stage', head.id, key, base.model, current);
    const rechecked = await this.premiseRechecks(ctx, judgement, current);
    if (rechecked !== undefined) judgement = { ...judgement, premiseChecks: rechecked.checks };
    const premiseExplicit = rechecked !== undefined && Object.keys(rechecked.explicit).length > 0 ? rechecked.explicit : undefined;
    return {
      judgement,
      report: {
        outcome: judgement.ok ? 'ok' : 'problems',
        g0: [],
        findings: [...judgement.global],
        ...lean,
        model: current,
        base: base.model,
        facts,
        judgement,
        ...(premiseExplicit !== undefined ? { premiseExplicit } : {}),
        durationMs: elapsed(),
      },
    };
  }

  /**
   * Slice 2b3b (§3.8, RV-1 "re-checks whenever something it relies on changes"): each Add premise draft not written yet
   * (no ledger `premise` entry for its key), of an inference whose step ended, not declined or withdrawn, whose
   * reliance key (`relianceKey`) differs from the one of its last check by this engine, is checked again in the scratch
   * file, under the same rules (B.1 and B.2 with E(T) from `judgement`): `closesGap`, and its statement's facts (the old
   * ones when the check failed). Only on a state that built with complete facts: a failed probe or a build error is
   * telelean's or another item's, and would make every draft fail.
   * Fixer 2b3b r1:
   *  - a draft whose reliance key equals its last check's gets that check's outcome again, with no Lean job (F-FC-1,
   *    A-V2B3B-ADV-3): it holds on this state too, and a judge whose `judge-apply` was dropped (§2.6: a decision moved
   *    the head meanwhile, the judge runs again) must report it again. Reconcile applies it once: a draft already to be
   *    redone and reverted is skipped, its facts replaced by the same ones;
   *  - a check telelean could not judge (its environment, a budget, an `unchecked` scratch outcome, or no explicit form
   *    or facts read back) is left out, with nothing remembered, and tried again at the next judge (A-V2B3B-ADV-2): it
   *    never reads as "no longer closes the gap", which would take an Accept away;
   *  - the key also covers the constants the gap proof used at its last check (A-V2B3B-ADV-1, `relianceKey`).
   * Fixer 2d r1 (F-V2D-FC-8): `explicit` gives the statement's fully explicit form of each draft whose check passed (its
   * memo's again when nothing changed), for the session to fill into a draft that has none.
   */
  private async premiseRechecks(
    ctx: CheckContext,
    judgement: StateJudgement,
    current: ProjectModel,
  ): Promise<{ checks: NonNullable<StateJudgement['premiseChecks']>; explicit: Record<string, string> } | undefined> {
    const facts = current.facts;
    if (facts === undefined || facts.status !== 'ok' || probeFailure(facts) !== undefined || judgement.problems.some((p) => p.code === 'facts')) return undefined;
    const s = requireSession(ctx, 'judge');
    const runDir = ctx.shadow.paths.runDir;
    const written = new Set(s.ledger.flatMap((e) => (e.kind === 'premise' ? [e.item] : [])));
    const statusOf = new Map(s.items.map((r) => [r.key, r.status]));
    const memo = this.reliances.get(runDir) ?? new Map<string, PremiseCheckMemo>();
    remember(this.reliances, runDir, memo, RUN_CACHE_SIZE);
    const out: NonNullable<StateJudgement['premiseChecks']> = {};
    const explicit: Record<string, string> = {};
    for (const draft of s.premises) {
      const key = premiseKey(draft.target, draft.leanName);
      if (written.has(key) || !s.ended.includes(draft.target)) continue;
      const status = statusOf.get(key);
      if (status === 'declined' || status === 'withdrawn') continue;
      const b1 = judgement.inferences[draft.target];
      if (b1 === undefined) continue;
      const targetStatement = current.nodes.get(draft.target)?.node.lean.statement;
      const last = memo.get(key);
      const consts = last?.consts ?? [];
      if (last !== undefined && last.reliance === relianceKey(draft, current, targetStatement, b1, consts)) {
        out[key] = { closesGap: last.closesGap, facts: last.closesGap ? { ...last.facts } : { ...draft.facts } };
        if (last.closesGap && last.explicit !== undefined) explicit[key] = last.explicit;
        continue;
      }
      const checked = await this.premiseCheck(ctx, draft, targetStatement, current, b1);
      if (checked === undefined) continue;
      const used = checked.consts ?? consts;
      memo.set(key, {
        reliance: relianceKey(draft, current, targetStatement, b1, used),
        closesGap: checked.closesGap,
        facts: checked.facts,
        consts: used,
        ...(checked.explicit !== undefined ? { explicit: checked.explicit } : {}),
      });
      out[key] = { closesGap: checked.closesGap, facts: checked.facts };
      if (checked.closesGap && checked.explicit !== undefined) explicit[key] = checked.explicit;
    }
    return Object.keys(out).length > 0 ? { checks: out, explicit } : undefined;
  }

  /**
   * Slice 2b3b (§3.8): one premise draft's gap check on `current`, under B.1 and B.2 with E(T); undefined when telelean
   * could not judge it (fixer 2b3b r1, A-V2B3B-ADV-2: its environment, a budget, an `unchecked` outcome, or no explicit
   * form or facts read back). A failed check keeps the draft's facts; a passed one gives the facts and the constants
   * its gap proof used.
   */
  private async premiseCheck(
    ctx: CheckContext,
    draft: PremiseDraft,
    targetStatement: string | undefined,
    current: ProjectModel,
    b1: InferenceJudgement,
  ): Promise<{ closesGap: boolean; facts: Record<string, DeclFacts>; consts?: string[]; explicit?: string } | undefined> {
    const failed = { closesGap: false, facts: { ...draft.facts } };
    // The target lost its statement: nothing the gap check could prove.
    if (targetStatement === undefined) return failed;
    // The single-term rule, before any Lean job, as the ghost check applies it (fixer 2b3b r1, A-V2B3B-ADV-4): Lean
    // never elaborates text it refuses (a draft converted from a v1 run was checked under older rules).
    if (this.core.ghostTextProblems(draft.leanStatement, draft.proof).length > 0) return failed;
    const outcome = await this.ghostScratchCheck(
      ctx,
      draft.target,
      targetStatement,
      current,
      { naturalName: draft.naturalName, leanStatement: draft.leanStatement, proof: draft.proof, leanName: draft.leanName },
      sessionGhostRules(b1),
    );
    switch (outcome.kind) {
      case 'environment':
      case 'budget':
      case 'unchecked':
        return undefined;
      case 'problems':
        return failed;
      case 'ok':
        if (outcome.facts === undefined || outcome.explicit === undefined) return undefined;
        return { closesGap: true, facts: outcome.facts, explicit: outcome.explicit, ...(outcome.consts !== undefined ? { consts: outcome.consts } : {}) };
    }
  }

  async finalCheck(ctx: CheckContext, reuse?: { judgement: StateJudgement; comparator: Record<string, { filesKey: string; permitted: string[] }> }): Promise<FinalCheckReport> {
    validateContext(ctx);
    requireSession(ctx, 'finalCheck');
    if (reuse !== undefined && (typeof reuse !== 'object' || reuse === null || typeof reuse.judgement !== 'object' || typeof reuse.comparator !== 'object')) {
      throw new TypeError('finalCheck: reuse needs a judgement and the recorded comparator passes');
    }
    return this.locked(ctx.shadow, () => this.finalCheckNow(ctx, reuse));
  }

  private async finalCheckNow(ctx: CheckContext, reuse: { judgement: StateJudgement; comparator: Record<string, { filesKey: string; permitted: string[] }> } | undefined): Promise<FinalCheckReport> {
    const s = requireSession(ctx, 'finalCheck');
    const shadow = ctx.shadow;
    const library = shadow.library;
    const head = await this.headOf(shadow);
    const files = await shadow.filesAt(head.id);
    const key = filesKey(files);
    const base = await this.baseOf(ctx);
    const judgeFinal = (current: ProjectModel): StateJudgement => this.judgeSession(ctx, 'final', head.id, key, base.model, current);
    const backstopOf = (final: ProjectModel, judgement: StateJudgement) =>
      this.core.applyBackstop({ base: base.model, final, items: s.items, ledger: s.ledger, inferences: s.inferences, judgement }).refusals;
    const failed = (current: ProjectModel, judgement: StateJudgement, extra: FinalCheckReport['failures'] = []): FinalCheckReport => {
      const backstop = backstopOf(current, judgement);
      return { passed: false, reusedFileChecks: false, judgement, failures: [...extra, ...finalCheckFailures(judgement, s.items, backstop)], backstop, model: current };
    };

    // F is ws/ at the end, where no write is in flight (Submit and Apply wait for the session's write queue): the final
    // check judges the newest commit only when ws/ is exactly it (fixer 2b3b r1, A-V2B3B-ADV-6), so it never passes a
    // state that is not F (a commit a take-out left behind without one of its own, say). Nothing is built.
    let ws: ReadonlyMap<string, string> | undefined;
    let unreadable: string | undefined;
    try {
      ws = await shadow.currentFiles();
    } catch (error) {
      if (!(error instanceof ShadowLayoutError)) throw error;
      unreadable = layoutEnvironment(error);
    }
    if (ws === undefined || !sameFiles(ws, files)) {
      const environment = unreadable ?? `telelean's working copy is not its newest recorded state (the ${head.kind} commit), so the final check did not run: reload the window to recover the session`;
      return { passed: false, environment, reusedFileChecks: false, judgement: judgeFinal(this.model(files, library)), failures: [], backstop: [] };
    }

    // G0 first (AP30-1 r2): judged without facts, G0's findings in `global`; the backstop (pure) still runs.
    const g0 = this.g0Of(ctx, base.files, files);
    if (g0.length > 0) {
      const current = this.model(files, library);
      return failed(current, withG0(judgeFinal(current), g0));
    }

    // EN-2: the last judgement's facts when it judged exactly F and was ok, and the mirror still holds them built.
    const reusable = reuse !== undefined && reuse.judgement.filesKey === key && reuse.judgement.ok;
    const got = await this.factsFor(ctx, files, key, reusable);
    if ('environment' in got) {
      return { passed: false, environment: got.environment, reusedFileChecks: false, judgement: judgeFinal(this.model(files, library)), failures: [], backstop: [] };
    }
    const outcome = classifyFacts(got.facts, ctx.job.leanJobMs);
    if (outcome.kind === 'environment') {
      return { passed: false, environment: outcome.message, reusedFileChecks: false, judgement: judgeFinal(this.model(files, library)), failures: [], backstop: [] };
    }
    if (outcome.kind === 'budget') {
      const current = this.model(files, library);
      return failed(current, judgeFinal(current), [{ rule: 'build', text: outcome.finding.message }]);
    }

    const current = this.model(files, library, got.facts);
    const judgement = judgeFinal(current);
    const backstop = backstopOf(current, judgement);
    const failures = finalCheckFailures(judgement, s.items, backstop);
    const comparator: Record<string, { filesKey: string; permitted: string[] }> = {};
    let environment: string | undefined;
    // The comparator for every proof of this session, on its permitted set in F: only when nothing else failed (it
    // cannot turn a failure into a pass, and costs a challenge and a comparator run each).
    if (failures.length === 0) {
      const idOf = new Map(s.items.map((r) => [r.key, r.id]));
      for (const target of sessionProofTargets(base.model, current, judgement)) {
        const permitted = [...(judgement.inferences[target]?.permitted ?? [])];
        const recorded = reuse?.comparator[target];
        if (recorded !== undefined && recorded.filesKey === key && sameNames(recorded.permitted, permitted)) {
          comparator[target] = { filesKey: key, permitted };
          continue;
        }
        const statement = current.nodes.get(target)?.node.lean.statement;
        if (statement === undefined) continue;
        const challenge = await this.challenge(ctx, {
          snapshotDir: shadow.paths.build,
          targetStatement: statement,
          permitted,
          removeDecls: removalClosure(got.facts, declaredNames(current), holdsName(statement)),
        });
        if ('environment' in challenge) {
          environment = challenge.environment;
          break;
        }
        const g4 = await this.compare(ctx, challenge.freeze);
        if (g4.environment !== undefined) {
          environment = g4.environment;
          break;
        }
        const result = idOf.get(`proof:${target}`);
        for (const f of g4.findings) failures.push({ rule: finalRuleOf(f), text: f.message, ...(result !== undefined ? { items: [result] } : {}), ...(f.names?.[0] !== undefined ? { declaration: f.names[0] } : {}) });
        if (g4.findings.length === 0) comparator[target] = { filesKey: key, permitted };
      }
    }
    return {
      passed: failures.length === 0 && environment === undefined,
      ...(environment !== undefined ? { environment } : {}),
      reusedFileChecks: got.reused,
      judgement,
      failures,
      backstop,
      comparator,
      // Builder 2f: F with the facts judged, for Apply's backstop (run again there, pure, never reused).
      model: current,
    };
  }

  async writePremise(ctx: CheckContext, premise: { item: string; draft: PremiseDraft; card: string }): Promise<PremiseWriteReport> {
    validateContext(ctx);
    requireSession(ctx, 'writePremise');
    validatePremise(premise);
    return this.locked(ctx.shadow, () =>
      this.guarded(
        () => this.writePremiseNow(ctx, premise),
        (environment): PremiseWriteReport => ({ ok: false, error: environment, environment }),
      ),
    );
  }

  /**
   * Normalises `nodes` whose statement is new since B (D-8, D-9: the pin and the docstring mirror) in ws/; returns ws/
   * as it is then.
   */
  private async normaliseNew(ctx: CheckContext, baseId: string, nodes: readonly string[]): Promise<Map<string, string>> {
    const shadow = ctx.shadow;
    const files = await shadow.currentFiles();
    const baseText = await this.commitModel(shadow, baseId);
    const current = this.model(files, shadow.library);
    const ids = nodes.filter((id) => current.nodes.get(id)?.statementDecl !== undefined && baseText.nodes.get(id)?.statementDecl === undefined);
    if (ids.length === 0) return files;
    const changes = this.core.normalisationChanges(current, ids);
    if (changes.length === 0) return files;
    await shadow.writeFiles(changes);
    return shadow.currentFiles();
  }

  private async writePremiseNow(ctx: CheckContext, premise: { item: string; draft: PremiseDraft; card: string }): Promise<PremiseWriteReport> {
    const shadow = ctx.shadow;
    const library = shadow.library;
    const base = await this.baseOf(ctx);
    const files = await this.normaliseNew(ctx, base.id, [premise.card]);
    // G0 first (AP30-1 r2): no commit, no Lean job; the caller takes the write back out.
    const g0 = this.g0Of(ctx, base.files, files);
    if (g0.length > 0) return { ok: false, error: g0[0]?.message ?? 'G0 refused the files' };

    const key = filesKey(files);
    const got = await this.factsFor(ctx, files, key, false);
    if ('environment' in got) return { ok: false, error: got.environment, environment: got.environment };
    const facts = got.facts;
    const outcome = classifyFacts(facts, ctx.job.leanJobMs);
    if (outcome.kind === 'environment') return { ok: false, error: outcome.message, environment: outcome.message };
    if (outcome.kind === 'budget') return { ok: false, error: outcome.finding.message };
    // AP30-4: a judgement whose probe failed is partial (a `factsMissing` key would read as changed once the probe
    // works): the write fails like a Lean environment failure, naming the cause.
    const probe = probeFailure(facts);
    if (probe !== undefined) return { ok: false, error: probe.replace(/\.$/u, ''), environment: probe };
    const errors = buildErrorFindings(facts);
    if (errors.length > 0) return { ok: false, error: errors[0]?.message ?? 'the Lean build failed' };

    const current = this.model(files, library, facts);
    const name = current.nodes.get(premise.card)?.node.lean.statement;
    if (name === undefined) return { ok: false, error: `the written card ${premise.card} is bound to no Lean statement` };
    // F11: P's fully explicit form where it was written, against the draft's (the ghost check's, §3.8).
    const [rendered] = await this.renderNow(ctx, [name]);
    if (rendered === undefined || rendered.error !== undefined) return { ok: false, error: `telelean could not print ${name} where it was written: ${rendered?.error ?? 'no answer'}` };
    const explicit = explicitBody(rendered.explicit);
    const meaningMatches = explicit !== '' && explicit === collapseWhitespace(premise.draft.explicit);
    // Step 3 of the write order (§2.6): the `adopt` commit of exactly the files built, which the judgement names. A
    // write that failed above leaves none (the caller takes the write back out).
    const commit = await shadow.commit('adopt', `Premise written: “${shortText(premise.draft.naturalName)}”`, ctx.round);
    if (!sameFiles(await shadow.filesAt(commit.id), files)) return { ok: false, error: 'the working copy changed while telelean built the premise' };
    const judgement = this.judgeSession(ctx, 'stage', commit.id, key, base.model, current);
    return { ok: true, meaningMatches, explicit, judgement };
  }

  async complete(ctx: CheckContext, premise: { item: string; draft: PremiseDraft; card: string }): Promise<CompletionReport> {
    validateContext(ctx);
    requireSession(ctx, 'complete');
    validatePremise(premise);
    return this.locked(ctx.shadow, () =>
      this.guarded(
        () => this.completeNow(ctx, premise),
        (environment): CompletionReport => ({ ok: false, error: environment, environment }),
      ),
    );
  }

  private async completeNow(ctx: CheckContext, premise: { item: string; draft: PremiseDraft; card: string }): Promise<CompletionReport> {
    const s = requireSession(ctx, 'complete');
    const shadow = ctx.shadow;
    const library = shadow.library;
    const target = premise.draft.target;
    const inference = s.inferences.find((i) => i.target === target);
    if (inference === undefined) return { ok: false, error: `“${target}” is not an inference of this session` };
    const lastFreeze = ctx.freeze;
    if (lastFreeze === undefined) return { ok: false, error: `the completion of “${target}” needs its last freeze` };
    // Fixer 2b3b r1 (A-V2B3B-ADV-7): T's own freeze; another target's would compare T's statements with its snapshot.
    if (lastFreeze.selection.target !== target) {
      return { ok: false, error: `the completion of “${target}” needs that target's last freeze, not the one of “${lastFreeze.selection.target}”` };
    }
    // The state the completion is written on: the shadow's newest commit, the write's parent (fixer 2b3b r1, F-FC-2).
    // Usually the premise's `adopt` commit; after recover()'s `revert` (a crash during the completion's write: §2.6
    // replays it), or when the completion becomes due later (§3.8: a premise written while T was proved, whose Result a
    // decision then took out), another one. So what the completion needs is checked, never the commit's kind: the
    // premise is written (its ledger `premise` entry, and its card in that state), and T is not proved there.
    const parent = await this.headOf(shadow);
    if (!s.ledger.some((e) => e.kind === 'premise' && e.item === premise.item)) {
      return { ok: false, error: `the completion of “${target}” needs its premise written first (no ledger entry for ${premise.item})` };
    }
    const parentText = await this.commitModel(shadow, parent.id);
    if (parentText.nodes.get(premise.card) === undefined) {
      return { ok: false, error: `the completion of “${target}” needs its premise's card ${premise.card}, which the state it starts from (the ${parent.kind} commit) does not hold` };
    }
    if (parentText.nodes.get(target)?.node.lean.justificationKind === 'theorem') {
      return { ok: false, error: `“${target}” is already proved in the state its completion starts from (the ${parent.kind} commit)` };
    }
    const base = await this.baseOf(ctx);
    const files = await this.normaliseNew(ctx, base.id, [target]);
    const parentFiles = await shadow.filesAt(parent.id);
    // G0 first (AP30-1 r2), on the completion and on the state it starts from, which is built for the new freeze
    // (fixer 2b3b r1, A-V2B3B-ADV-4): no Lean job, no commit.
    const g0 = [...this.g0Of(ctx, base.files, files), ...this.g0Of(ctx, base.files, parentFiles)];
    if (g0.length > 0) return { ok: false, error: g0[0]?.message ?? 'G0 refused the files' };
    const selection: Selection = { subject: ctx.selection.subject, target, premises: [...inference.question.sources], adoptedGhosts: [] };
    const scope = completionScope(COMPLETION_STEP, inference);
    const failure = (why: string, environment?: string): CompletionReport => ({ ok: false, error: why, ...(environment !== undefined ? { environment } : {}) });
    const leanFailure = (facts: LeanFacts): CompletionReport | undefined => {
      const outcome = classifyFacts(facts, ctx.job.leanJobMs);
      if (outcome.kind === 'environment') return failure(outcome.message, outcome.message);
      if (outcome.kind === 'budget') return failure(outcome.finding.message);
      const probe = probeFailure(facts);
      if (probe !== undefined) return failure(probe.replace(/\.$/u, ''), probe);
      return undefined;
    };

    // 1. Freeze again from the state the completion starts from (the premise written, T not proved): its statements
    //    against the target's last freeze (statement-changed), then B.1's permitted set there (P.holds now among E(T)'s)
    //    and a challenge from it.
    const parentKey = filesKey(parentFiles);
    const gotP = await this.factsFor(ctx, parentFiles, parentKey, true);
    if ('environment' in gotP) return failure(gotP.environment, gotP.environment);
    const parentLean = leanFailure(gotP.facts);
    if (parentLean !== undefined) return parentLean;
    const parentModel = this.model(parentFiles, library, gotP.facts);
    // Only `statement-changed` is asked of T's last freeze: the premise's `.holds` is an axiom that freeze did not have
    // (slice 1's "added after the freeze" rule would refuse it), and the new freeze governs everything after it.
    const frozenCheck = this.judgeSession(ctx, 'check', parent.id, parentKey, base.model, parentModel, { stage: 'prove', stepStart: parentModel, scope, freeze: lastFreeze.snapshot });
    const changed = frozenCheck.stepFindings.filter((f) => f.code === 'statement-changed');
    if (changed.length > 0) return failure(`the statements changed since “${target}” was frozen: ${changed.map((f) => f.message).join(' ')}`);
    const broken = buildErrorFindings(gotP.facts);
    if (broken.length > 0) return failure(broken.map((f) => f.message).join('\n'));
    const b1 = frozenCheck.inferences[target];
    if (b1 === undefined) return failure(`telelean did not judge “${target}” on its premise's state`);
    let snapshot: FrozenSnapshot;
    try {
      snapshot = { ...this.core.frozenSnapshot(parentModel, selection, ctx.round, base.model), permitted: this.sessionPermittedOf(parentModel, base.model, selection, b1) };
    } catch (error) {
      if (error instanceof ActionError) return failure(error.message);
      throw error;
    }
    const challenge = await this.challenge(ctx, {
      snapshotDir: shadow.paths.build,
      targetStatement: snapshot.targetStatement,
      permitted: snapshot.permitted.all,
      removeDecls: removalClosure(gotP.facts, declaredNames(parentModel), holdsName(snapshot.targetStatement)),
    });
    if ('environment' in challenge) return failure(challenge.environment, challenge.environment);

    // 2. Gate the completion as gate-proved with that freeze: build, footprint, statements fixed, B.2, comparator.
    const key = filesKey(files);
    const got = await this.factsFor(ctx, files, key, false);
    if ('environment' in got) return failure(got.environment, got.environment);
    const lean = leanFailure(got.facts);
    if (lean !== undefined) return lean;
    const current = this.model(files, library, got.facts);
    const gated = this.judgeSession(ctx, 'gate-proved', '', key, base.model, current, { stage: 'prove', stepStart: parentModel, scope, freeze: snapshot });
    const findings = [...gated.stepFindings];
    if (!findings.some((f) => f.code === 'build')) findings.unshift(...buildErrorFindings(got.facts));
    if (findings.length > 0) return failure(findings.map((f) => f.message).join('\n'));
    const g4 = await this.compare(ctx, challenge.freeze);
    if (g4.environment !== undefined) return failure(g4.environment, g4.environment);
    if (g4.findings.length > 0) return failure(g4.findings.map((f) => f.message).join('\n'));

    // 3. It passed: the `completion` commit, and the stage judgement of it (no Lean job: the same files and facts).
    const commit = await shadow.commit('completion', `Completed “${target}” from “${shortText(premise.draft.naturalName)}”`, ctx.round);
    if (!sameFiles(await shadow.filesAt(commit.id), files)) return failure('the working copy changed while telelean checked the completion');
    const judgement = this.judgeSession(ctx, 'stage', commit.id, key, base.model, current);
    return { ok: true, commit, judgement };
  }
}

/**
 * Spec v4.1 B.2 for the "Claude suggests" scratch check (RV-1, slice 1e): the cards the scratch theorem's elaborated
 * proof uses directly (core `directWalkOfConsts`, from the value probe's constants, through the clean check's facts) must
 * be selected premises or adopted ghosts, and B.2's cross-check must explain its footprint. Without the elaborated
 * values (no probe output, a failed probe, a declaration the walk passes through without `valueConsts`, out-of-date
 * facts) the check refuses rather than guess. Returns the problems for Claude (empty: B.2 holds).
 * Slice 2b3b (§3.8; additive): `allowed`, the cards the proof may use directly (default: the selection's premises and
 * adopted ghosts); in a session (`session`) the sources of Q(T) ∪ E(T), with the session's wording.
 */
export function ghostDirectProblems(
  ctx: Pick<CheckContext, 'selection'>,
  model: ProjectModel | undefined,
  result: Pick<GhostScratchResult, 'valueConsts' | 'valueProblems'>,
  axioms: readonly string[],
  allowed?: ReadonlySet<string>,
  session = false,
): string[] {
  const target = model?.nodes.get(ctx.selection.target)?.node;
  const unseen = (detail?: string) => [`${UNSEEN_PROOF}${detail !== undefined ? ` (${detail})` : ''}.`];
  if (model === undefined || target === undefined) return unseen('no checked facts of the files');
  if (result.valueConsts === undefined || result.valueProblems.length > 0) return unseen(result.valueProblems.join('; ') || undefined);
  const nodes = [...model.nodes.values()].map((entry) => entry.node);
  const walk = directWalkOfConsts(target, result.valueConsts, axioms, { nodes, ownerOfDecl: model.ownerOfDecl, declFacts: model.declFacts, freshFiles: model.freshFiles });
  if (walk === undefined || walk.outdated) return unseen();
  const may = allowed ?? new Set([...ctx.selection.premises, ...ctx.selection.adoptedGhosts]);
  const card = (id: string) => {
    const node = model.nodes.get(id)?.node;
    const holds = node?.lean.statement !== undefined ? holdsName(node.lean.statement) : `${id}.holds`;
    return `${holds} (the card ${id}, ${JSON.stringify(node?.naturalName ?? id)})`;
  };
  const problems: string[] = [];
  for (const id of walk.ids) {
    if (may.has(id)) continue;
    problems.push(
      session
        ? `${GHOST_UNSELECTED} ${card(id)}, which is not a source of the target (an arrow the person selected, or yours into the target): it may use only those sources' .holds (and the suggestion itself). If the target needs that card, propose its arrow with propose_arrow first, or name ${id} in gap.`
        : `${GHOST_UNSELECTED} ${card(id)}, which is not one of the selected premises: it may use only the selected premises' .holds (and the suggestion itself). If the target needs that card, do not propose a premise: finish with status not_proved and name ${id} in gap.`,
    );
  }
  for (const id of walk.unseen) {
    problems.push(
      session
        ? `The proof that the suggestion closes the gap rests on ${card(id)} in a way the arrows do not show: use only the .holds of the target's sources, directly.`
        : `The proof that the suggestion closes the gap rests on ${card(id)} in a way the arrows do not show: use only the selected premises' .holds, directly.`,
    );
  }
  return problems;
}

/** See ./index.ts. */
export function createEngine(options: LeanCheckEngineOptions = {}): LeanCheckEngine {
  return new Engine(options);
}
