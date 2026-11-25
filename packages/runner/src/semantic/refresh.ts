/**
 * `refreshLeanFacts`, step by step (docs/m1-plan.md section 4; the contract is in ./types.ts and core's
 * facts.ts):
 *
 *   1. memory guard (nothing spawned below the threshold);
 *   2. toolchain and project checks (nothing spawned when they fail);
 *   3. read + hash every module source, then `lake build <library>` in place under runLean;
 *   4. parse Lake's log (messages with full text, failed modules), convert positions to LSP;
 *   5. module states from Lake's failures and the source headers;
 *   6. read the fresh modules' `.ilean` (declarations, ranges, references, parents) and docstrings;
 *   7. one generated check file (`#check`, `#print`, `#print axioms`, `type_of%`) via `lake env lean --stdin`,
 *      importing only the model's modules;
 *   8. slice 2b3a (docs/slice2-plan.md 2.1, D2-75): the isolated probe, its own Lean job right after the check (the
 *      memory guard again, then the check's options): the constants of each elaborated value and type
 *      (`DeclFacts.valueConsts`, `typeConsts`), read from the model's built modules as data (./probeFile.ts), and the
 *      job itself as the facts' marker (`LeanFacts.probe`). A probe that is `cut` or `failed` gives no declaration
 *      constants and is a check problem naming the cause; a sandbox failure ends the refresh with its status, as the
 *      check's does. (1d's second check run without the probe, AP-21, is gone: nothing the check file imports can
 *      clash with the model any more.)
 *   9. re-hash the sources: modules that changed meanwhile become `stale`.
 *
 * Never throws for Lean or sandbox failures: they become statuses with a `detail`. Throws TypeError for invalid
 * arguments. Not self-serialising: callers use `runExclusive`.
 */
import { lstatSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_LIBRARY,
  LEAN_FACTS_FORMAT,
  LEAN_FACTS_VERSION,
  parseLeanFile,
  probeFailure,
  type BuildFacts,
  type CheckRunFacts,
  type DeclFacts,
  type DeclInfo,
  type DeclRef,
  type FactsStatus,
  type LeanFacts,
  type LeanMessageFact,
  type ModuleFacts,
  type ProbeRunFacts,
  type Range,
} from '@telelean/core';

import { parseLeanJsonMessages } from '../lean/footprint.js';
import { isValidModuleName } from '../lean/leanNames.js';
import { memoryMaxToBytes, runLean, type RunLeanOptions, type RunLeanResult } from '../lean/runLean.js';
import { resolveToolchain, toolchainExe, type LeanToolchain } from '../lean/toolchain.js';
import { generateCheckFile, parseCheckOutput, type ProbeResult } from './checkFile.js';
import { parseIlean, type IleanData } from './ilean.js';
import { generateProbeFile, readProbeOutput } from './probeFile.js';
import { mergeLakeLogs, parseLakeLog, succeededCaptions, type LakeLog, type LakeMessage } from './lakeLog.js';
import {
  computeModuleStates,
  inLibrary,
  projectProblem,
  readModuleSources,
  readProjectToolchain,
  sha256Text,
  type ModuleSource,
  type ModuleState,
} from './project.js';
import { declKeywordAt, docstringAt, docstringBefore, leanToLspPosition, lineStarts, offsetOf, positionAt } from './text.js';
import {
  DEFAULT_BUILD_TIMEOUT_MS,
  DEFAULT_CHECK_TIMEOUT_MS,
  DEFAULT_MIN_AVAILABLE_BYTES,
  DEFAULT_REFRESH_MEMORY_MAX,
  type RefreshRequest,
} from './types.js';

const RUN_ID_PATTERN = /^[A-Za-z0-9_]{1,64}$/;
type SandboxFailure = 'could-not-start' | 'timeout' | 'oom' | 'cancelled';
const SANDBOX_FAILURES: ReadonlySet<string> = new Set<SandboxFailure>(['could-not-start', 'timeout', 'oom', 'cancelled']);
const isSandboxFailure = (status: string): status is SandboxFailure => SANDBOX_FAILURES.has(status);

/** How many problems a `detail` lists before "… (n more)". */
const DETAIL_ITEMS = 5;

interface Source extends ModuleSource {
  readonly starts: number[];
}

interface Options {
  readonly root: string;
  readonly library: string;
  readonly memoryMax: string;
  readonly minAvailableBytes: number;
  readonly buildTimeoutMs: number;
  readonly checkTimeoutMs: number;
  readonly toolchain: LeanToolchain;
  readonly now: () => Date;
}

function positiveNumber(name: string, value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new TypeError(`${name} must be a positive number`);
  return value;
}

/** Validates the request (TypeError for invalid arguments) and fills in the defaults. */
function validate(request: RefreshRequest): Options {
  if (typeof request !== 'object' || request === null) throw new TypeError('refreshLeanFacts needs a request object');
  const { root } = request;
  if (typeof root !== 'string' || !path.isAbsolute(root) || root.includes('\0')) throw new TypeError(`root must be an absolute path, got ${JSON.stringify(root)}`);
  const library = request.library ?? DEFAULT_LIBRARY;
  if (!isValidModuleName(library)) throw new TypeError(`library must be a plain Lean module name, got ${JSON.stringify(library)}`);
  if (request.runId !== undefined && !RUN_ID_PATTERN.test(request.runId)) throw new TypeError(`runId must match ${RUN_ID_PATTERN.source}`);
  const memoryMax = request.memoryMax ?? DEFAULT_REFRESH_MEMORY_MAX;
  memoryMaxToBytes(memoryMax); // throws TypeError when malformed
  const minAvailableBytes = request.minAvailableBytes ?? DEFAULT_MIN_AVAILABLE_BYTES;
  if (typeof minAvailableBytes !== 'number' || !Number.isFinite(minAvailableBytes) || minAvailableBytes < 0) {
    throw new TypeError('minAvailableBytes must be a non-negative number');
  }
  return {
    root: path.resolve(root),
    library,
    memoryMax,
    minAvailableBytes,
    buildTimeoutMs: positiveNumber('buildTimeoutMs', request.buildTimeoutMs, DEFAULT_BUILD_TIMEOUT_MS),
    checkTimeoutMs: positiveNumber('checkTimeoutMs', request.checkTimeoutMs, DEFAULT_CHECK_TIMEOUT_MS),
    toolchain: request.toolchain ?? resolveToolchain(),
    now: request.now ?? ((): Date => new Date()),
  };
}

const gib = (bytes: number): string => (bytes / 1024 ** 3).toFixed(1);

/** At most this much MemAvailable is kept free for the rest of the machine when a spawn's memory cap is lowered. */
const SPAWN_RESERVE_BYTES = 1024 ** 3;
/** A lowered memory cap never goes below this (Lean needs some room to start at all). */
const MIN_SPAWN_BYTES = 256 * 1024 ** 2;

/**
 * The `MemoryMax=` of one spawn: the configured cap, lowered to what MemAvailable leaves after a reserve (the smaller
 * of 1 GiB and half the guard threshold), so a run near the limit is stopped by its own cap (status `oom`) instead of
 * pushing the machine into swap or its OOM killer.
 */
export function spawnMemoryMax(cap: string, available: number | undefined, minAvailableBytes: number): string {
  if (available === undefined) return cap;
  const allowed = available - Math.min(SPAWN_RESERVE_BYTES, minAvailableBytes / 2);
  if (allowed >= memoryMaxToBytes(cap)) return cap;
  return `${Math.floor(Math.max(MIN_SPAWN_BYTES, allowed) / 1024 ** 2)}M`;
}

function lastLines(text: string, n = 5): string {
  return text.trim().split('\n').slice(-n).join('\n');
}

function listWithMore(items: readonly string[]): string {
  const shown = items.slice(0, DETAIL_ITEMS).join('; ');
  return items.length > DETAIL_ITEMS ? `${shown}; … (${items.length - DETAIL_ITEMS} more)` : shown;
}

/**
 * What the in-place build covers with an empty tmpfs: `root/.git`, and (2k2, D2-115) `root/.telelean/runs`, the model's
 * runs, so the model's Lean code sees no run's files (Claude's working copies, results still hidden), as when runs lived
 * under the masked home. Each only when it is a real directory (bwrap can only cover a directory with a tmpfs).
 */
export function gitMaskPaths(root: string): string[] {
  const out: string[] = [];
  for (const dir of [path.join(root, '.git'), path.join(root, '.telelean', 'runs')]) {
    try {
      if (lstatSync(dir).isDirectory()) out.push(dir);
    } catch {
      // absent
    }
  }
  return out;
}

/** The runLean options of the in-place build (the check reuses them with its own argv, stdin, timeout and cap). */
function buildRunOptions(request: RefreshRequest, options: Options, memoryMax: string): RunLeanOptions {
  return {
    shadowDir: options.root,
    argv: [toolchainExe(options.toolchain, 'lake'), 'build', options.library],
    maskPaths: gitMaskPaths(options.root),
    memoryMax,
    timeoutMs: options.buildTimeoutMs,
    toolchain: options.toolchain,
    ...(request.runId !== undefined ? { runId: request.runId } : {}),
    ...(request.signal !== undefined ? { signal: request.signal } : {}),
    ...(request.host !== undefined ? { host: request.host } : {}),
  };
}

/** A path as Lake printed it, relative to the root (POSIX), or undefined when it lies outside the root. */
export function rootRelativeFile(file: string, root: string): string | undefined {
  let f = file;
  if (path.isAbsolute(f)) {
    const rel = path.relative(root, f);
    if (rel === '' || path.isAbsolute(rel)) return undefined;
    f = rel.split(path.sep).join('/');
  }
  f = path.posix.normalize(f);
  if (f === '.' || f === '..' || f.startsWith('../')) return undefined;
  return f;
}

/** Lake messages as facts: root-relative files, modules, LSP ranges (zero-width: Lake gives no end position). */
export function messageFacts(
  messages: readonly LakeMessage[],
  root: string,
  sources: ReadonlyMap<string, { readonly name: string; readonly text: string; readonly starts: readonly number[] }>,
): LeanMessageFact[] {
  return messages.map((m) => {
    const file = m.file === undefined ? undefined : rootRelativeFile(m.file, root);
    const src = file === undefined ? undefined : sources.get(file);
    let range: Range | undefined;
    if (m.line !== undefined) {
      const start = leanToLspPosition(m.line, m.column ?? 0, src?.text, src?.starts);
      range = { start, end: { ...start } };
    }
    return {
      severity: m.severity,
      ...(file !== undefined ? { file } : {}),
      ...(src !== undefined ? { module: src.name } : {}),
      ...(range !== undefined ? { range } : {}),
      text: m.text,
    };
  });
}

/** A declaration from `.ilean` plus what the source text adds, before the check results are merged in. */
export interface DeclDraft {
  readonly name: string;
  readonly range: Range;
  readonly selectionRange: Range;
  readonly docstring?: string;
  readonly parent?: string;
  /** The declaration keyword in the source, after docstring, attributes and modifiers (non-auxiliary names). */
  readonly keyword?: string;
  readonly refs: DeclRef[];
}

const notAfter = (a: Range['start'], b: Range['start']): boolean => a.line < b.line || (a.line === b.line && a.character <= b.character);

/** Declarations of one module from its `.ilean`, with docstrings and source keywords from the text. */
export function declDrafts(src: { readonly text: string; readonly starts: readonly number[] }, data: IleanData): DeclDraft[] {
  const refsByParent = new Map<string, DeclRef[]>();
  for (const u of data.usages) {
    const list = refsByParent.get(u.parent) ?? [];
    list.push({ name: u.name, module: u.module, range: u.range });
    refsByParent.set(u.parent, list);
  }
  // An unlisted declaration (ilean.ts) comes with its name's range only: telelean's own declaration scanner (the one
  // the board uses, so the ranges agree) gives its full range, from the docstring to its last line.
  let syntactic: readonly DeclInfo[] | undefined;
  const syntacticRange = (name: string, selection: Range): Range | undefined => {
    syntactic ??= parseLeanFile('', src.text).decls;
    const decl = syntactic.find((x) => x.fullName === name && notAfter(x.range.start, selection.start) && notAfter(selection.end, x.range.end));
    return decl?.range;
  };
  return data.decls.flatMap((d): DeclDraft[] => {
    let range = d.range;
    let docstring: string | undefined;
    let keyword: string | undefined;
    if (d.unlisted) {
      // Only a declaration written in the source counts (never a name Lean generated, e.g. by `deriving`).
      const full = syntacticRange(d.name, d.selectionRange);
      if (full === undefined) return [];
      range = full;
      const off = offsetOf(src.text, src.starts, full.start);
      if (off !== undefined) {
        docstring = docstringAt(src.text, off);
        keyword = declKeywordAt(src.text, off);
      }
    } else if (d.auxiliary) {
      const off = offsetOf(src.text, src.starts, d.selectionRange.start);
      const before = off === undefined ? undefined : docstringBefore(src.text, off);
      if (before !== undefined) {
        range = { start: positionAt(src.starts, before.start), end: d.range.end };
        docstring = before.text;
      }
    } else {
      const off = offsetOf(src.text, src.starts, d.range.start);
      if (off !== undefined) {
        docstring = docstringAt(src.text, off);
        keyword = declKeywordAt(src.text, off);
      }
    }
    return [
      {
        name: d.name,
        range,
        selectionRange: d.selectionRange,
        ...(docstring !== undefined ? { docstring } : {}),
        ...(d.parent !== undefined ? { parent: d.parent } : {}),
        ...(keyword !== undefined ? { keyword } : {}),
        refs: refsByParent.get(d.name) ?? [],
      },
    ];
  });
}

/**
 * One DeclFacts from its draft, its check results and (2b3a) the isolated probe's constants for it, in a stable key
 * order.
 */
export function toDeclFacts(
  module: { readonly name: string; readonly file: string },
  draft: DeclDraft,
  probe?: ProbeResult,
  consts?: { readonly valueConsts?: readonly string[]; readonly typeConsts?: readonly string[] },
): DeclFacts {
  const kind = probe?.kind === undefined ? undefined : draft.keyword === 'instance' ? 'instance' : probe.kind;
  const value = probe?.value !== undefined && probe.value !== '⋯' && (kind === 'def' || kind === 'instance') ? probe.value : undefined;
  const sortCounts = probe?.printedKeyword === 'axiom' || probe?.printedKeyword === 'opaque';
  const error = probe?.error ?? (sortCounts ? probe?.sortError : undefined);
  return {
    name: draft.name,
    module: module.name,
    file: module.file,
    range: draft.range,
    selectionRange: draft.selectionRange,
    ...(kind !== undefined ? { kind } : {}),
    ...(probe?.attributes !== undefined && probe.attributes.length > 0 ? { attributes: probe.attributes } : {}),
    ...(probe?.type !== undefined ? { type: probe.type } : {}),
    ...(probe?.typeSort !== undefined ? { typeSort: probe.typeSort } : {}),
    ...(value !== undefined ? { value } : {}),
    ...(probe?.axioms !== undefined ? { axioms: probe.axioms } : {}),
    ...(probe?.usesSorry !== undefined ? { usesSorry: probe.usesSorry } : {}),
    ...(error !== undefined ? { error } : {}),
    ...(draft.docstring !== undefined ? { docstring: draft.docstring } : {}),
    refs: draft.refs,
    ...(draft.parent !== undefined ? { parent: draft.parent } : {}),
    // Slice 1d (B.2) and 2b3a (D2-30): the elaborated value's and type's constants, from the isolated probe when it read
    // its line (never from a probe that failed: §2.1).
    ...(consts?.valueConsts !== undefined ? { valueConsts: [...consts.valueConsts] } : {}),
    ...(consts?.typeConsts !== undefined ? { typeConsts: [...consts.typeConsts] } : {}),
  };
}

const SKIPPED_BUILD: BuildFacts = { status: 'skipped', durationMs: 0, messages: [], failedModules: [] };
const SKIPPED_CHECK: CheckRunFacts = { status: 'skipped', durationMs: 0, probed: 0 };

function runFacts(run: RunLeanResult): { status: RunLeanResult['status']; durationMs: number; peakMemoryBytes?: number; detail?: string } {
  return {
    status: run.status,
    durationMs: run.durationMs,
    ...(run.peakMemoryBytes !== undefined ? { peakMemoryBytes: run.peakMemoryBytes } : {}),
    ...(run.detail !== undefined ? { detail: run.detail } : {}),
  };
}

/** Summary of a failed build for `detail`. */
function buildSummary(build: RunLeanResult, log: LakeLog, states: ReadonlyMap<string, ModuleState>): string {
  const failed = [...states].filter(([, s]) => s === 'failed').map(([n]) => n);
  const blocked = [...states].filter(([, s]) => s === 'dependency-failed').map(([n]) => n);
  if (failed.length > 0) {
    return `lake build reported errors: ${failed.join(', ')} failed${blocked.length > 0 ? `; ${blocked.join(', ')} not built (an import failed)` : ''}`;
  }
  const firstError = log.messages.find((m) => m.severity === 'error');
  const why =
    firstError !== undefined
      ? `${firstError.file !== undefined ? `${firstError.file}: ` : ''}${firstError.text.split('\n')[0] ?? ''}`
      : build.detail ?? (lastLines([...log.otherLines].join('\n')) || lastLines(build.stderr) || `exit code ${String(build.exitCode)}`);
  return `lake build failed without naming a model module: ${why}`;
}

/**
 * Test seams of `refresh` (2b3a), outside the frozen RefreshRequest: `runLean` replaces the sandbox wrapper for every Lean
 * job of the refresh (the build, the check and the probe), so a test can count the jobs or give the probe job an
 * outcome no small model produces (a cut output, a failed or killed job) while the build and the check run for real.
 */
export interface RefreshHooks {
  readonly runLean?: (options: RunLeanOptions) => Promise<RunLeanResult>;
}

/** Runs one refresh. `defaultReadMemAvailable` is used when the request has no `readMemAvailable` hook. */
export async function refresh(request: RefreshRequest, defaultReadMemAvailable: () => number | undefined, hooks: RefreshHooks = {}): Promise<LeanFacts> {
  const leanJob = hooks.runLean ?? runLean;
  const options = validate(request);
  const { root, library } = options;
  const startedAt = options.now().toISOString();
  const project = readProjectToolchain(root);

  const facts = (status: FactsStatus, detail: string | undefined, rest: Partial<LeanFacts> = {}): LeanFacts => ({
    format: LEAN_FACTS_FORMAT,
    version: LEAN_FACTS_VERSION,
    toolchain: project.toolchain,
    library,
    startedAt,
    finishedAt: options.now().toISOString(),
    status,
    ...(detail !== undefined ? { detail } : {}),
    build: SKIPPED_BUILD,
    check: SKIPPED_CHECK,
    modules: [],
    decls: [],
    ...rest,
  });
  const phase = (p: 'build' | 'check'): void => {
    try {
      request.onPhase?.(p);
    } catch {
      // A failing progress callback must not break the refresh.
    }
  };

  // 1. Memory guard (again before the check: the build may have taken a while).
  const readAvailable = (): number | undefined => {
    try {
      return (request.readMemAvailable ?? defaultReadMemAvailable)();
    } catch {
      return undefined;
    }
  };
  const available = readAvailable();
  if (available !== undefined && available < options.minAvailableBytes) {
    return facts('low-memory', `MemAvailable is ${gib(available)} GiB, below the ${gib(options.minAvailableBytes)} GiB threshold`);
  }
  try {
    if (!statSync(root).isDirectory()) return facts('could-not-start', `model root ${root} is not a directory`);
  } catch {
    return facts('could-not-start', `model root ${root} does not exist`);
  }

  // 2. Toolchain and project.
  if (project.problem !== undefined) return facts('unsupported-toolchain', project.problem);
  const unsupported = projectProblem(root);
  if (unsupported !== undefined) return facts('unsupported-project', unsupported);

  // 3. Sources (hashed before the build) and the build.
  const sources: Source[] = readModuleSources(root, library).map((s) => ({ ...s, starts: lineStarts(s.text) }));
  const sourceByFile = new Map(sources.map((s) => [s.file, s]));
  const runOptions = buildRunOptions(request, options, spawnMemoryMax(options.memoryMax, available, options.minAvailableBytes));
  phase('build');
  const build = await leanJob(runOptions);

  // 4. Lake's log.
  const log = mergeLakeLogs(parseLakeLog(build.stdout), parseLakeLog(build.stderr));
  const failedModules = [...new Set(log.failedTargets.filter((t) => isValidModuleName(t) && inLibrary(t, library)))];
  const buildFacts: BuildFacts = {
    ...runFacts(build),
    messages: messageFacts(log.messages, root, sourceByFile),
    failedModules,
  };
  if (isSandboxFailure(build.status)) {
    return facts(build.status, `lake build: ${build.detail ?? build.status}`, { build: buildFacts });
  }

  // 5. Module states.
  const states = computeModuleStates({
    modules: sources,
    library,
    failedTargets: new Set(log.failedTargets),
    buildOk: build.status === 'ok',
    reportedOk: succeededCaptions(log),
  });
  const problems: string[] = [];
  if (build.stdoutTruncated || build.stderrTruncated) problems.push('the lake build output was truncated');

  // 6. `.ilean` of the fresh modules (+ docstrings and source keywords).
  const fresh = sources.filter((s) => states.get(s.name) === 'fresh');
  const drafts = new Map<string, DeclDraft[]>();
  for (const s of fresh) {
    const file = path.join(root, '.lake', 'build', 'lib', 'lean', `${s.name.split('.').join('/')}.ilean`);
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch (e) {
      problems.push(`${s.name}: no .ilean after the build (${(e as NodeJS.ErrnoException).code ?? (e as Error).message})`);
      continue;
    }
    const parsed = parseIlean(text, s.name);
    if (!parsed.ok) {
      problems.push(`${s.name}: ${parsed.error}`);
      continue;
    }
    drafts.set(s.name, declDrafts(s, parsed.data));
  }

  // 7. The check file: only the model's modules and the four probes per declaration (2b3a).
  const probeNames = fresh.flatMap((s) => (drafts.get(s.name) ?? []).map((d) => d.name));
  let checkFacts: CheckRunFacts = SKIPPED_CHECK;
  let results = new Map<string, ProbeResult>();
  let probeFacts: ProbeRunFacts | undefined;
  let consts: { readonly valueConsts: ReadonlyMap<string, string[]>; readonly typeConsts: ReadonlyMap<string, string[]> } | undefined;
  if (probeNames.length > 0) {
    const imports = fresh.map((s) => s.name);
    const checkFile = generateCheckFile(imports, probeNames);
    const availableForCheck = readAvailable();
    if (availableForCheck !== undefined && availableForCheck < options.minAvailableBytes) {
      return facts(
        'low-memory',
        `MemAvailable dropped to ${gib(availableForCheck)} GiB after the build, below the ${gib(options.minAvailableBytes)} GiB threshold, so the check did not run`,
        { build: buildFacts },
      );
    }
    phase('check');
    const run = await leanJob({
      ...runOptions,
      argv: [toolchainExe(options.toolchain, 'lake'), 'env', 'lean', '--stdin', '--json'],
      stdin: checkFile.source,
      timeoutMs: options.checkTimeoutMs,
      memoryMax: spawnMemoryMax(options.memoryMax, availableForCheck, options.minAvailableBytes),
    });
    const buildPart = build.status === 'failed' ? ` (after: ${buildSummary(build, log, states)})` : '';
    if (isSandboxFailure(run.status)) {
      return facts(run.status, `check: ${run.detail ?? run.status}${buildPart}`, { build: buildFacts, check: { ...runFacts(run), probed: checkFile.probed.length } });
    }
    const messages = parseLeanJsonMessages(run.stdout);
    const output = parseCheckOutput(checkFile, messages);
    if (run.status === 'failed' && messages.length === 0) {
      output.headerErrors.push(lastLines(run.stderr) || `lake env lean exited with ${String(run.exitCode)}`);
    }
    checkFacts = { ...runFacts(run), probed: checkFile.probed.length };
    results = output.results;
    if (output.headerErrors.length > 0) {
      const header = `the check file's imports failed: ${listWithMore(output.headerErrors)}`;
      problems.push(header);
      checkFacts = { ...checkFacts, detail: header };
    }
    if (run.stdoutTruncated) problems.push('the check output was truncated');
    for (const [decl, why] of checkFile.unwritable) problems.push(`${decl} was not checked: ${why}`);
    for (const r of results.values()) problems.push(...r.problems);

    // 8. The isolated probe (2b3a, D2-75): its own Lean job, the memory guard again, then the check's options.
    if (checkFile.probed.length > 0) {
      const availableForProbe = readAvailable();
      if (availableForProbe !== undefined && availableForProbe < options.minAvailableBytes) {
        return facts(
          'low-memory',
          `MemAvailable dropped to ${gib(availableForProbe)} GiB after the check, below the ${gib(options.minAvailableBytes)} GiB threshold, so the probe did not run`,
          { build: buildFacts, check: checkFacts },
        );
      }
      const probeFile = generateProbeFile(imports, checkFile.probed, library);
      const probeRun = await leanJob({
        ...runOptions,
        argv: [toolchainExe(options.toolchain, 'lake'), 'env', 'lean', '--stdin', '--json'],
        stdin: probeFile.source,
        timeoutMs: options.checkTimeoutMs,
        memoryMax: spawnMemoryMax(options.memoryMax, availableForProbe, options.minAvailableBytes),
      });
      const reading = readProbeOutput(probeFile, probeRun);
      probeFacts = reading.probe;
      if (isSandboxFailure(probeRun.status)) {
        return facts(probeRun.status, `probe: ${probeRun.detail ?? probeRun.status}${buildPart}`, { build: buildFacts, check: checkFacts, probe: reading.probe });
      }
      // §2.1: a probe that is cut or failed gives no declaration constants, and its cause is a check problem.
      const failure = probeFailure(facts('ok', undefined, { probe: reading.probe }));
      if (failure !== undefined) problems.push(failure.replace(/\.$/u, ''));
      consts = reading.consts;
    }
  }

  // 9. Re-hash: sources that changed while the refresh ran make their module stale.
  const changed = new Set<string>();
  for (const s of sources) {
    let now: string | undefined;
    try {
      now = sha256Text(readFileSync(path.join(root, s.file), 'utf8'));
    } catch {
      now = undefined;
    }
    if (now !== s.sha256) changed.add(s.name);
  }

  const modules: ModuleFacts[] = sources.map((s) => ({
    name: s.name,
    file: s.file,
    sourceSha256: s.sha256,
    state: changed.has(s.name) ? 'stale' : states.get(s.name) ?? 'not-built',
    imports: [...s.imports],
  }));
  // Declarations of the modules that were fresh when checked (a module that became stale keeps them: core uses
  // a stale file's facts by name only, since its hash no longer matches).
  const decls = fresh.flatMap((s) =>
    (drafts.get(s.name) ?? []).map((d) =>
      toDeclFacts(s, d, results.get(d.name), consts !== undefined ? { valueConsts: consts.valueConsts.get(d.name), typeConsts: consts.typeConsts.get(d.name) } : undefined),
    ),
  );
  for (const d of decls) if (d.error !== undefined) problems.push(`${d.name}: ${d.error.split('\n')[0] ?? ''}`);

  const status: FactsStatus = build.status === 'failed' ? 'build-errors' : problems.length > 0 ? 'check-errors' : 'ok';
  const parts: string[] = [];
  if (build.status === 'failed') parts.push(buildSummary(build, log, states));
  if (problems.length > 0) parts.push(`check: ${listWithMore(problems)}`);
  if (changed.size > 0) {
    parts.push(`changed while the refresh ran (stale): ${sources.filter((s) => changed.has(s.name)).map((s) => s.file).join(', ')}`);
  }
  return facts(status, parts.length > 0 ? parts.join('. ') : undefined, { build: buildFacts, check: checkFacts, modules, decls, ...(probeFacts !== undefined ? { probe: probeFacts } : {}) });
}
