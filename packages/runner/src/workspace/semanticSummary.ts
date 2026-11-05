/**
 * The board's SemanticSummary from the latest refresh and the facts in use (docs/m1-plan.md section 4, "Mapping to
 * the board's SemanticSummary"):
 *
 *   ok                          -> fresh (stale when files changed since)
 *   build-errors, check-errors  -> failed with errorCount (facts for fresh modules are still used)
 *   low-memory                  -> paused-low-memory
 *   unsupported-toolchain       -> unsupported-toolchain (syntactic mode, D-7)
 *   unsupported-project         -> disabled with the detail (+ diagnostic TL201)
 *   could-not-start             -> disabled ("sandbox unavailable: …")
 *   timeout, oom, cancelled     -> failed with the detail
 *
 * Refreshes that produce no facts keep the previous facts in use (marked stale where hashes differ), except
 * `unsupported-toolchain` and `unsupported-project`: the previous facts are dropped, so the board really is
 * syntactic (D-7), as its banner says, and names the project's current pin.
 */
import type { BoardDiagnostic, FactsStatus, LeanFacts, SemanticSummary } from '@telelean/core';

/** Statuses whose LeanFacts carry no usable facts (see KEEPS_FACTS / DROPS_FACTS for what happens to the old ones). */
export const NO_FACTS_STATUSES: ReadonlySet<FactsStatus> = new Set<FactsStatus>([
  'could-not-start',
  'timeout',
  'oom',
  'cancelled',
  'low-memory',
  'unsupported-toolchain',
  'unsupported-project',
]);

/**
 * No new facts, and the project as it is now cannot be checked at all (another toolchain, Lake dependencies, no
 * manifest): the previous facts no longer describe it, so they are dropped and the board shows what the files say.
 */
export const DROPS_FACTS: ReadonlySet<FactsStatus> = new Set<FactsStatus>(['unsupported-toolchain', 'unsupported-project']);

/** What the workspace remembers about its last refresh. */
export interface RefreshRecord {
  /** The facts' status, or `error` when the refresh itself threw. */
  status: FactsStatus | 'error';
  detail?: string;
  toolchain?: string;
  durationMs?: number;
}

export interface SummaryInput {
  enabled: boolean;
  running: boolean;
  phase?: 'build' | 'check';
  last?: RefreshRecord;
  /** The facts in use (possibly from an earlier refresh). */
  facts?: LeanFacts;
  /** sha256 of every current model file, by path. */
  fileHashes: Readonly<Record<string, string>>;
}

/** Model files whose current text is not the one the facts were computed from (changed, new, deleted or stale). */
export function staleFilesOf(facts: LeanFacts, fileHashes: Readonly<Record<string, string>>): string[] {
  const stale = new Set<string>();
  const covered = new Set<string>();
  for (const module of facts.modules) {
    covered.add(module.file);
    if (module.state === 'stale' || fileHashes[module.file] !== module.sourceSha256) stale.add(module.file);
  }
  for (const file of Object.keys(fileHashes)) if (!covered.has(file)) stale.add(file);
  return [...stale].sort();
}

/** Lean errors in the facts: build error messages plus declarations whose probe failed. */
export function errorCountOf(facts: LeanFacts): number {
  return facts.build.messages.filter((m) => m.severity === 'error').length + facts.decls.filter((d) => d.error !== undefined).length;
}

export function summarize(input: SummaryInput): SemanticSummary {
  if (!input.enabled) return { state: 'disabled', detail: 'Lean checking is switched off.' };
  const facts = input.facts;
  const common: Omit<SemanticSummary, 'state'> = {};
  // In syntactic mode the toolchain to name is the project's current pin, never that of facts from before.
  const syntactic = input.last !== undefined && DROPS_FACTS.has(input.last.status as FactsStatus);
  const toolchain = syntactic ? input.last?.toolchain : facts?.toolchain || input.last?.toolchain;
  if (toolchain) common.toolchain = toolchain;
  if (facts && !syntactic) {
    common.checkedAt = facts.finishedAt;
    const stale = staleFilesOf(facts, input.fileHashes);
    if (stale.length > 0) common.staleFiles = stale;
    const errors = errorCountOf(facts);
    if (errors > 0) common.errorCount = errors;
  }
  if (input.last?.durationMs !== undefined) common.durationMs = input.last.durationMs;

  if (input.running) {
    const detail = input.phase === 'build' ? 'Lean: building the project…' : input.phase === 'check' ? 'Lean: checking declarations…' : 'Lean: starting…';
    return { ...common, state: 'checking', detail };
  }
  const last = input.last;
  if (!last) return facts ? { ...common, state: common.staleFiles ? 'stale' : 'fresh' } : { state: 'unavailable', ...common };
  const detail = last.detail?.trim() || undefined;
  const withDetail = (text: string | undefined): Partial<SemanticSummary> => (text ? { detail: text } : {});
  switch (last.status) {
    case 'ok':
      if (!facts) return { ...common, state: 'unavailable' };
      return { ...common, state: common.staleFiles ? 'stale' : 'fresh' };
    case 'build-errors':
      return { ...common, ...withDetail(detail ?? 'The Lean build reported errors.'), state: 'failed' };
    case 'check-errors':
      return { ...common, ...withDetail(detail ?? 'Lean reported errors while checking declarations.'), state: 'failed' };
    case 'low-memory':
      return { ...common, ...withDetail(detail ?? 'Lean paused: low memory.'), state: 'paused-low-memory' };
    case 'unsupported-toolchain':
      return { ...common, ...withDetail(detail), state: 'unsupported-toolchain' };
    case 'unsupported-project':
      return { ...common, ...withDetail(detail ?? 'This project cannot be checked as it is.'), state: 'disabled' };
    case 'could-not-start':
      return { ...common, ...withDetail(`sandbox unavailable: ${detail ?? 'unknown reason'}`), state: 'disabled' };
    case 'timeout':
      return { ...common, ...withDetail(detail ?? 'Lean timed out.'), state: 'failed' };
    case 'oom':
      return { ...common, ...withDetail(detail ?? 'Lean ran out of memory (memory cap reached).'), state: 'failed' };
    case 'cancelled':
      return { ...common, ...withDetail(detail ?? 'The Lean check was cancelled.'), state: 'failed' };
    case 'error':
      return { ...common, ...withDetail(`refresh failed: ${detail ?? 'unknown error'}`), state: 'failed' };
  }
}

/** Workspace diagnostics derived from the last refresh: TL201 when the project cannot be checked as it is. */
export function refreshDiagnostics(last: RefreshRecord | undefined): BoardDiagnostic[] {
  if (last?.status !== 'unsupported-project') return [];
  return [{ code: 'TL201', severity: 'warning', message: last.detail?.trim() || 'This project cannot be checked as it is (lake-manifest.json or Lake dependencies).' }];
}
