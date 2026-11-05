/**
 * The engine's pure mappings (docs/m2-plan.md sections 3.3, 3.5 and 3.6): Lean facts statuses and comparator verdicts
 * to findings or `environment` outcomes, and Lean messages to diagnostics. Nothing here runs Lean.
 *
 *   runLean / facts status          outcome
 *   ok, build-errors, check-errors  the rules decide (G1 `build` findings come from core, with a fallback here)
 *   timeout, oom                    a `budget` finding (counted against the attempt)
 *   could-not-start, low-memory,    `environment` (not the agent's fault, not counted)
 *   cancelled, unsupported-*
 *   ShadowLayoutError (unsyncable)  `environment`
 */
import type { GateFinding, GateFindingCode, LeanFacts, LeanMessageFact } from '@telelean/core';

import type { ComparatorVerdict, RejectionReason } from '../lean/comparator.js';
import type { ShadowLayoutError } from '../shadow/types.js';
import type { LeanDiagnosticView } from './types.js';

/** The G4 finding code of each comparator rejection reason (docs/m2-plan.md section 3.3). */
export const COMPARATOR_FINDING_CODES: Readonly<Record<RejectionReason, GateFindingCode>> = {
  'illegal-axiom': 'comparator-illegal-axiom',
  'statement-mismatch': 'comparator-statement-mismatch',
  'definition-mismatch': 'comparator-definition-mismatch',
  'kind-mismatch': 'comparator-kind-mismatch',
  'missing-declaration': 'comparator-missing',
  'kernel-rejected': 'comparator-kernel',
  'build-failed': 'comparator-build',
  'export-failed': 'comparator-export',
};

const seconds = (ms: number): string => `${Math.round(ms / 100) / 10} s`;

/** The `budget` finding for a Lean job that hit the per-job time limit or the memory cap. */
export function budgetFinding(kind: 'timeout' | 'oom', detail: string | undefined, leanJobMs: number, step: GateFinding['step'] = 'G1'): GateFinding {
  const what = step === 'G4' ? 'The comparator check' : 'The Lean build';
  const message =
    kind === 'timeout'
      ? `${what} did not finish within the limit of ${seconds(leanJobMs)} per Lean job${detail ? ` (${detail})` : ''}. Simplify the proof (smaller terms, fewer or cheaper tactics) and check again.`
      : `${what} ran out of memory${detail ? ` (${detail})` : ''}. Simplify the proof (smaller terms, fewer or cheaper tactics) and check again.`;
  return { step, code: 'budget', message };
}

/** Plain words for a facts status that means telelean could not run Lean. */
export function environmentMessage(status: string, detail?: string): string {
  const why = detail !== undefined && detail !== '' ? `: ${detail}` : '';
  switch (status) {
    case 'could-not-start':
      return `the Lean sandbox could not start${why}`;
    case 'low-memory':
      return `the machine is low on memory, so telelean did not start Lean${why}`;
    case 'cancelled':
      return 'the Lean job was cancelled';
    case 'unsupported-toolchain':
    case 'unsupported-project':
      return `telelean cannot check this project${why}`;
    default:
      return `Lean could not run (${status})${why}`;
  }
}

export type FactsOutcome =
  /** Lean ran: the rules decide (the build may still have errors). */
  | { kind: 'ok' }
  | { kind: 'budget'; finding: GateFinding }
  | { kind: 'environment'; message: string };

/** What a refresh's status means for a check (docs/m2-plan.md section 3.6). */
export function classifyFacts(facts: LeanFacts, leanJobMs: number): FactsOutcome {
  switch (facts.status) {
    case 'ok':
    case 'build-errors':
    case 'check-errors':
      return { kind: 'ok' };
    case 'timeout':
    case 'oom':
      return { kind: 'budget', finding: budgetFinding(facts.status, facts.detail, leanJobMs) };
    default:
      return { kind: 'environment', message: environmentMessage(facts.status, facts.detail) };
  }
}

/** The environment sentence for a working copy telelean cannot sync (a symlink, special file or dot-entry in ws/). */
export function layoutEnvironment(error: ShadowLayoutError): string {
  return `telelean could not use its working copy: ${error.message}`;
}

/** `file:line:col` of a Lean message (1-based line, as Lean prints it), or undefined without a position. */
export function messageLocation(m: LeanMessageFact): string | undefined {
  if (m.file === undefined) return undefined;
  if (m.range === undefined) return m.file;
  return `${m.file}:${m.range.start.line + 1}:${m.range.start.character}`;
}

/** Lean's build messages as diagnostics (whole messages), only those of `files` when given. */
export function diagnosticsOf(facts: LeanFacts | undefined, files?: readonly string[]): LeanDiagnosticView[] {
  if (facts === undefined) return [];
  const wanted = files !== undefined && files.length > 0 ? new Set(files) : undefined;
  return facts.build.messages
    .filter((m) => wanted === undefined || (m.file !== undefined && wanted.has(m.file)))
    .map((m) => ({
      file: m.file ?? '',
      line: (m.range?.start.line ?? 0) + 1,
      column: m.range?.start.character ?? 0,
      severity: m.severity,
      message: m.text,
    }));
}

/**
 * One G1 `build` finding per Lean error of the build (the whole message, with `file:line:col`), or one from the facts'
 * detail when the build failed without naming a position (e.g. a lakefile error). Empty when the build had no errors.
 */
export function buildErrorFindings(facts: LeanFacts): GateFinding[] {
  const errors = facts.build.messages.filter((m) => m.severity === 'error');
  const findings: GateFinding[] = errors.map((m) => {
    const where = messageLocation(m);
    return {
      step: 'G1',
      code: 'build',
      message: `${where !== undefined ? `${where}: ` : ''}error: ${m.text}`,
      ...(m.file !== undefined ? { file: m.file } : {}),
      ...(m.range !== undefined ? { range: m.range } : {}),
    };
  });
  if (findings.length === 0 && (facts.status === 'build-errors' || facts.build.failedModules.length > 0)) {
    findings.push({ step: 'G1', code: 'build', message: `The Lean build failed: ${facts.detail ?? `modules ${facts.build.failedModules.join(', ')} failed`}` });
  }
  return findings;
}

export interface ComparatorOutcome {
  findings: GateFinding[];
  /** Set when the comparator itself could not judge (not the agent's fault, not counted). */
  environment?: string;
}

/**
 * G4: a comparator verdict as findings (docs/m2-plan.md section 3.3): accepted -> none; each rejection reason -> its
 * `comparator-*` code with the names and comparator's message; `could-not-start` and a cancellation -> environment; a
 * timeout or memory cap -> `budget` (counted). The definition-mismatch wording follows M0 lesson 2.
 */
export function comparatorFindings(verdict: ComparatorVerdict, leanJobMs: number): ComparatorOutcome {
  switch (verdict.verdict) {
    case 'accepted':
      return { findings: [] };
    case 'could-not-start':
      return { findings: [], environment: `the comparator could not run: ${verdict.message}` };
    case 'incomplete':
      if (verdict.reason === 'cancelled') return { findings: [], environment: 'the comparator check was cancelled' };
      return { findings: [budgetFinding(verdict.reason, verdict.message, leanJobMs, 'G4')] };
    case 'rejected': {
      const names = [...verdict.names];
      const list = names.map((n) => `\`${n}\``).join(', ');
      let message: string;
      switch (verdict.reason) {
        case 'illegal-axiom':
          message = `lake comparator: the proof uses axioms outside the permitted set: ${list}. Use only what freeze_statements listed (the selected premises' .holds, the vocabulary, Lean's standard axioms).`;
          break;
        case 'statement-mismatch':
          message = `lake comparator: the statement of ${list} differs from the frozen one. Prove exactly the frozen statement.`;
          break;
        case 'definition-mismatch':
          message = `lake comparator: a definition the frozen statement depends on changed: ${list}. Restore it exactly as it was frozen.`;
          break;
        case 'kind-mismatch':
          message = `lake comparator: ${list} changed kind since the freeze (for example from axiom to theorem).`;
          break;
        case 'missing-declaration':
          message = `lake comparator: missing from the files, or not a theorem: ${list}.`;
          break;
        case 'kernel-rejected':
          message = `lake comparator: Lean's kernel rejected the solution: ${verdict.message}`;
          break;
        case 'build-failed':
          message = `lake comparator: the files did not build: ${verdict.message}`;
          break;
        case 'export-failed':
          message = `lake comparator: the solution could not be exported: ${verdict.message}`;
          break;
      }
      return { findings: [{ step: 'G4', code: COMPARATOR_FINDING_CODES[verdict.reason], message, ...(names.length > 0 ? { names } : {}) }] };
    }
  }
}

/** finish(proved) in a round without a successful freeze (when core's rules did not already say so). */
export function notFrozenFinding(): GateFinding {
  return {
    step: 'G3',
    code: 'not-frozen',
    message: 'finish with status proved needs a successful freeze_statements in this round: call check_lean, then freeze_statements, then prove and finish again.',
  };
}
