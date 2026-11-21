/**
 * The engine's pure mappings (docs/m2-plan.md sections 3.3, 3.5 and 3.6): Lean facts statuses and comparator verdicts
 * to findings or `environment` outcomes, and Lean messages to diagnostics. Nothing here runs Lean.
 *
 *   runLean / facts status          outcome
 *   ok, build-errors, check-errors  the rules decide (G1 `build` findings come from core, with a fallback here)
 *   timeout, oom                    a `budget` finding (counted against the attempt)
 *   oom of the probe job            `environment` (fixer 2b3a r1, S-V2B3A-S1, AP-33: telelean's own job, which loads
 *                                   Lean's library a second time; not counted)
 *   could-not-start, low-memory,    `environment` (not the agent's fault, not counted)
 *   cancelled, unsupported-*
 *   ShadowLayoutError (unsyncable)  `environment`
 *   B.2 `source-only` alone (gate)  `environment` (slice 1e fixer: telelean could not see which cards the proof uses)
 *   a failed probe (2b3a, §2.1)     `environment` with `probeFailure`'s sentence when the rules find nothing or only
 *                                   B.2's `source-only`, at check, freeze and gate; at the start (checkBase) always
 */
import { probeFailure, UNSEEN_PROOF, type GateFinding, type GateFindingCode, type LeanFacts, type LeanMessageFact } from '@telelean/core';

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

/** The start of `probeOomEnvironment`'s sentence. */
export const PROBE_OUT_OF_MEMORY = "telelean's probe ran out of memory, so telelean could not read what the declarations of this state use in Lean";

/**
 * Fixer 2b3a r1 (S-V2B3A-S1, AP-33): the isolated probe's job ran out of memory (refresh ended with `oom`, the probe's
 * marker `oom`: a build or check job that is killed ends the refresh before the probe, with no marker). The probe loads
 * Lean's own library a second time (§2.1's Cost: about 390 MB more than the check), so it is the job most likely to pass
 * a memory cap lowered on a machine short of memory, and its kill is telelean's own overhead far more often than Claude's
 * proof or the person's files. So it is an `environment` outcome (not counted; the gate tries again once, and the start
 * refuses with the environment notice, nothing sent to Claude), never a budget finding. Nothing passes either way.
 * Undefined for any other facts (a probe's timeout stays a budget finding, as the check's: the probe adds little time).
 */
export function probeOomEnvironment(facts: LeanFacts): string | undefined {
  if (facts.status !== 'oom' || facts.probe?.status !== 'oom') return undefined;
  const detail = facts.detail?.trim() ?? '';
  return detail === '' ? PROBE_OUT_OF_MEMORY : `${PROBE_OUT_OF_MEMORY} (${detail})`;
}

/** What a refresh's status means for a check (docs/m2-plan.md section 3.6; the probe's `oom` since fixer 2b3a r1). */
export function classifyFacts(facts: LeanFacts, leanJobMs: number): FactsOutcome {
  switch (facts.status) {
    case 'ok':
    case 'build-errors':
    case 'check-errors':
      return { kind: 'ok' };
    case 'timeout':
    case 'oom': {
      const probe = probeOomEnvironment(facts);
      if (probe !== undefined) return { kind: 'environment', message: probe };
      return { kind: 'budget', finding: budgetFinding(facts.status, facts.detail, leanJobMs) };
    }
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

/**
 * Slice 1e fixer (spec v4.1 B.2 with AP-13 and A2): B.2's `source-only` refusal says that telelean could not see which
 * cards the proof uses (the facts have no elaborated values for it: a declaration the check file could not write, or
 * facts without the probe's marker; since 2b3a a probe that was cut or failed has its own rule, `probeFailedEnvironment`,
 * which runs first, and no model name can make the isolated probe's imports fail). Claude cannot fix that, so when it is
 * the gate's only problem the gate reports an `environment` outcome instead (not counted as an attempt; the run stops
 * after one retry with this text and the facts' detail), rather than spending every attempt of the round on it. With any
 * other finding the attempt is Claude's to fix as usual (a failed build, for instance, also leaves the target without
 * fresh facts). Undefined when the findings are not exactly that.
 */
export function unseenProofEnvironment(findings: readonly GateFinding[], detail?: string): string | undefined {
  if (findings.length === 0 || !findings.every((f) => f.code === 'undeclared-premise' && f.token === 'source-only')) return undefined;
  const why = detail?.replace(/\s+/g, ' ').trim() ?? '';
  return why === '' ? UNSEEN_PROOF : `${UNSEEN_PROOF} (${why.length > 300 ? `${why.slice(0, 299)}…` : why})`;
}

/**
 * Slice 2b3a (docs/slice2-plan.md 2.1, D2-75, "A failed probe never passes"): the facts' isolated probe was `cut` or
 * `failed` (`probeFailure`), so no declaration has constants. At check, freeze and gate the rules still run: when they
 * find nothing, or only B.2's `source-only` (which the missing constants cause), the check is an `environment` outcome
 * with `probeFailure`'s sentence (Claude reads the cause and can take out what caused it; not counted as an attempt);
 * otherwise their findings fail it as usual. Either way nothing passes. Undefined when the probe did not fail, or when
 * the rules found something else.
 */
export function probeFailedEnvironment(findings: readonly GateFinding[], facts: LeanFacts | undefined): string | undefined {
  const failure = probeFailure(facts);
  if (failure === undefined) return undefined;
  return findings.every((f) => f.code === 'undeclared-premise' && f.token === 'source-only') ? failure : undefined;
}

/** Slice 2b3a (§2.1, AP30-2): what the start adds to `probeFailure`'s sentence when B's own probe failed. */
export const BASE_PROBE_FAILED = "Claude's work on this model cannot be checked.";

/**
 * Slice 2b3a (§2.1, AP30-2): B's probe failed (its size, or an error of the walk on the person's own files), so every
 * state of the session would fail the same way: the start refuses before anything is sent to Claude, with
 * `probeFailure`'s sentence and BASE_PROBE_FAILED. Undefined when B's probe did not fail.
 */
export function baseProbeEnvironment(facts: LeanFacts | undefined): string | undefined {
  const failure = probeFailure(facts);
  return failure === undefined ? undefined : `${failure} ${BASE_PROBE_FAILED}`;
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
