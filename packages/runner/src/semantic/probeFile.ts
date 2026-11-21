/**
 * Slice 2b3a (docs/slice2-plan.md 2.1, D2-75; the slice-3 ultra review's S3-1): the isolated probe. Until 2b3a the value
 * probe was an `#eval` at the end of the check file, which imports the model, so its own code (`IO.println`, string
 * concatenation, `while`, `toString`) was elaborated with the model's instances in scope: a high-priority
 * `ToString String` instance could rewrite the line it prints, and a `ForIn m Lean.Loop Unit` instance could end its walk
 * at once. B.2 and the bands, RV-5, RV-7, content keys, D2-41's step limits and the backstop all read that line.
 *
 * So the probe is its own Lean job, run by refresh right after the check file (one heavy job at a time), fed on stdin to
 * `lake env lean --stdin --json` in the same sandbox:
 *
 *   import Lean.CoreM
 *   import Lean.Util.FoldConsts
 *   #eval show IO Unit from do
 *     let mods : Array Lean.Import := ((‹modules›).splitOn " ").toArray.map fun s => { module := … }
 *     let env ← Lean.importModules mods {} (loadExts := false) (level := .private)
 *     … the walk of semantic/checkFile.ts `valueProbeLines` over `env`, the value walk and the type walk …
 *     IO.println ‹{"telelean-value-consts":[…],"telelean-type-consts":[…]}›
 *
 * ‹modules› are the check file's imports (the fresh modules) and the names its probed declarations, each list one
 * JSON-escaped string literal, so no name is ever parsed as Lean syntax. Its code is elaborated where only Lean's own
 * modules are, and it reads the model as data when it runs: no instance, coercion or notation of the model can change
 * what it walks or prints. `loadExts := false` runs no environment extension and no `[init]` (G0 refuses the `init`
 * attribute in Claude's lines too, AP30-1, so no earlier job runs Claude's IO either), and `level := .private` loads a
 * module-system file whole. A model name that Lean's modules also declare can no longer make the imports fail (1d's
 * clash): the model is never imported beside `Lean.CoreM`.
 *
 * Reading it fails closed (§2.1, "A failed probe never passes"): `cut` when Lean's output passed runLean's 32 MB cap,
 * `failed` for an error in its `#eval` or its imports, a run that failed without one, a message with the probe's key
 * anywhere but as an information message at the `#eval`'s line (even beside the real line), no line, more than one, or a
 * line `parseValueProbe` cannot read (the type key included: this job always prints both). Only `ok` gives constants.
 */
import type { ProbeRunFacts } from '@telelean/core';

import { parseLeanJsonMessages } from '../lean/footprint.js';
import type { RunLeanResult } from '../lean/runLean.js';
import { parseValueProbe, TYPE_PROBE_KEY, VALUE_PROBE_IMPORTS, VALUE_PROBE_KEY, valueProbeLines } from './checkFile.js';

/** The probe file's imports: Lean's own modules only (the Environment API, `Lean.importModules`, `Expr.getUsedConstants`). */
export const PROBE_FILE_IMPORTS: readonly string[] = VALUE_PROBE_IMPORTS;

export interface ProbeFile {
  /** The generated Lean source (fed on stdin). */
  readonly source: string;
  /** The modules its `#eval` loads (the check file's imports). */
  readonly modules: readonly string[];
  /** The declarations it probes, in order (the check file's). */
  readonly probed: readonly string[];
  /** 1-based lines of its `#eval`: the line it prints is the information message at `firstLine`. */
  readonly firstLine: number;
  readonly lastLine: number;
}

/**
 * The isolated probe file for `probed` (the check file's probed declarations) of the built `modules` of `library`.
 * Throws TypeError without a module or a declaration, for a module name that is not plain, or a name the probe cannot
 * pass (whitespace, guillemets: the check file never probes those).
 */
export function generateProbeFile(modules: readonly string[], probed: readonly string[], library: string): ProbeFile {
  if (probed.length === 0) throw new TypeError('the probe needs at least one declaration');
  const header = PROBE_FILE_IMPORTS.map((m) => `import ${m}`);
  const lines = valueProbeLines(probed, library, { modules });
  return {
    source: `${[...header, ...lines].join('\n')}\n`,
    modules: [...modules],
    probed: [...probed],
    firstLine: header.length + 1,
    lastLine: header.length + lines.length,
  };
}

/** What `readProbeOutput` reads of the probe job's runLean result. */
export type ProbeRun = Pick<RunLeanResult, 'status' | 'stdout' | 'stderr' | 'exitCode' | 'durationMs' | 'peakMemoryBytes' | 'detail' | 'stdoutTruncated'>;

export interface ProbeReading {
  /** The facts' marker (`LeanFacts.probe`). */
  readonly probe: ProbeRunFacts;
  /** Only when `probe.status` is `ok`: each probed declaration's constants (none for a name Lean does not have). */
  readonly consts?: { readonly valueConsts: ReadonlyMap<string, string[]>; readonly typeConsts: ReadonlyMap<string, string[]> };
}

const SANDBOX_STATUSES: ReadonlySet<string> = new Set(['could-not-start', 'timeout', 'oom', 'cancelled']);

function tail(text: string, n = 5): string {
  return text.trim().split('\n').slice(-n).join('\n');
}

/**
 * The probe job's outcome (§2.1): `ok` with both constant maps, else the marker alone: `cut` (stdout over runLean's
 * cap), `failed` with Lean's first error and its line, or what could not be read, or the sandbox's status, which ends
 * the refresh as the check's does.
 */
export function readProbeOutput(file: ProbeFile, run: ProbeRun): ProbeReading {
  const measured = { durationMs: run.durationMs, ...(run.peakMemoryBytes !== undefined ? { peakMemoryBytes: run.peakMemoryBytes } : {}) };
  if (SANDBOX_STATUSES.has(run.status)) return { probe: { status: run.status as ProbeRunFacts['status'], ...measured } };
  if (run.stdoutTruncated === true) return { probe: { status: 'cut', ...measured } };
  const failed = (detail: string): ProbeReading => ({ probe: { status: 'failed', ...measured, detail } });
  const messages = parseLeanJsonMessages(run.stdout);
  const error = messages.find((m) => m.severity === 'error');
  if (error !== undefined) return failed(`${error.line}:${error.column}: ${error.data.split('\n')[0] ?? ''}`);
  if (run.status !== 'ok') return failed(`lake env lean exited with ${String(run.exitCode)}${tail(run.stderr) !== '' ? `: ${tail(run.stderr)}` : ''}`);
  // Every message with the key must be the probe's own line, an information message at the `#eval`'s line: one anywhere
  // else (another line, another severity) is a forged placement, and voids the run even beside the real line (fixer
  // 2b3a r1, C-V2B3A-C3: as §8 states the rule).
  const keyed = messages.filter((m) => m.data.includes(VALUE_PROBE_KEY));
  const stray = keyed.find((m) => m.severity !== 'information' || m.line !== file.firstLine);
  if (stray !== undefined) return failed(`Lean printed the probe's key outside its line (${stray.severity} at ${stray.line}:${stray.column})`);
  const lines = keyed;
  if (lines.length === 0) return failed('Lean printed nothing for the probe');
  if (lines.length > 1) return failed(`Lean printed ${lines.length} lines for the probe`);
  const parsed = parseValueProbe((lines[0] as { data: string }).data, file.probed);
  if (typeof parsed === 'string') return failed(parsed);
  if (parsed.typeConsts === undefined) return failed(`the probe's line has no ${TYPE_PROBE_KEY}`);
  return { probe: { status: 'ok', ...measured }, consts: { valueConsts: parsed.valueConsts, typeConsts: parsed.typeConsts } };
}
