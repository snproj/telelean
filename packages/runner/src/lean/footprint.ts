/**
 * Footprints: the axioms each declaration rests on, from `#print axioms` (gate step G3, 02 D-5/D-26).
 *
 * A generated check file (`import …` + one `#print axioms` per declaration) is fed to the toolchain's
 * `lake env lean --stdin --json` under runLean, so nothing is written into the shadow. Each message is
 * attributed to a declaration by its line number, not by re-parsing the printed name.
 *
 * `#print axioms` trusts the environment, so it is fooled by kernel-bypass hacks (verified in review);
 * G4 (comparator) and, in hardening, G2 (leanchecker) are what make the verdict trustworthy.
 */
import { assertModuleName, formatDeclName } from './leanNames.js';
import { runLean, type RunLeanOptions, type RunLeanResult } from './runLean.js';
import { resolveToolchain, toolchainExe } from './toolchain.js';

export interface FootprintCheck {
  /** The generated Lean source. */
  readonly source: string;
  /** 1-based line number of each declaration's `#print axioms` command. */
  readonly lineOfDecl: ReadonlyMap<string, number>;
  /** Lines 1..headerLines are the imports. */
  readonly headerLines: number;
}

/** Generates the check file. Duplicate names are checked once. */
export function generateFootprintCheck(imports: readonly string[], decls: readonly string[]): FootprintCheck {
  if (imports.length === 0) throw new TypeError('at least one import is needed');
  for (const m of imports) assertModuleName(m);
  const lines = imports.map((m) => `import ${m}`);
  const lineOfDecl = new Map<string, number>();
  for (const decl of decls) {
    if (lineOfDecl.has(decl)) continue;
    lines.push(`#print axioms ${formatDeclName(decl)}`);
    lineOfDecl.set(decl, lines.length);
  }
  return { source: `${lines.join('\n')}\n`, lineOfDecl, headerLines: imports.length };
}

/** One message from `lean --json`. */
export interface LeanMessage {
  readonly severity: 'information' | 'warning' | 'error' | string;
  readonly data: string;
  readonly line: number;
  readonly column: number;
  readonly fileName?: string;
}

/** Parses `lean --json` output (one JSON object per line); other lines are ignored. */
export function parseLeanJsonMessages(stdout: string): LeanMessage[] {
  const messages: LeanMessage[] = [];
  for (const raw of stdout.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('{')) continue;
    try {
      const m = JSON.parse(line) as {
        severity?: unknown;
        data?: unknown;
        pos?: { line?: unknown; column?: unknown };
        fileName?: unknown;
      };
      if (typeof m.severity !== 'string' || typeof m.data !== 'string') continue;
      messages.push({
        severity: m.severity,
        data: m.data,
        line: typeof m.pos?.line === 'number' ? m.pos.line : 0,
        column: typeof m.pos?.column === 'number' ? m.pos.column : 0,
        ...(typeof m.fileName === 'string' ? { fileName: m.fileName } : {}),
      });
    } catch {
      // not a message
    }
  }
  return messages;
}

const DEPENDS = /^'([^]*)' depends on axioms: \[([^]*)\]\s*$/;
const NO_AXIOMS = /^'([^]*)' does not depend on any axioms\s*$/;

/** Parses one `#print axioms` message: the axiom list, `[]`, or undefined if it is not such a message. */
export function parseAxiomsMessage(data: string): string[] | undefined {
  if (NO_AXIOMS.test(data)) return [];
  const m = DEPENDS.exec(data);
  if (m === null) return undefined;
  return (m[2] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export type DeclFootprint =
  | { readonly decl: string; readonly ok: true; readonly axioms: readonly string[] }
  | { readonly decl: string; readonly ok: false; readonly error: string };

export interface FootprintResult {
  /** `ok`: every declaration has a footprint. `lean-error`: some do not (see `footprints` and `headerErrors`). `sandbox-error`: Lean did not run to completion. */
  readonly status: 'ok' | 'lean-error' | 'sandbox-error';
  readonly footprints: ReadonlyMap<string, DeclFootprint>;
  /** Errors on the import lines (e.g. a module that is not built). */
  readonly headerErrors: readonly string[];
  readonly check: FootprintCheck;
  readonly run: RunLeanResult;
}

/** Attributes `lean --json` messages to declarations by line. */
export function footprintsFromMessages(check: FootprintCheck, messages: readonly LeanMessage[]): {
  footprints: Map<string, DeclFootprint>;
  headerErrors: string[];
} {
  const declOfLine = new Map<number, string>();
  for (const [decl, line] of check.lineOfDecl) declOfLine.set(line, decl);
  const footprints = new Map<string, DeclFootprint>();
  const headerErrors: string[] = [];
  for (const msg of messages) {
    const decl = declOfLine.get(msg.line);
    if (decl === undefined) {
      if (msg.severity === 'error') headerErrors.push(`${msg.line}:${msg.column}: ${msg.data}`);
      continue;
    }
    if (msg.severity === 'error') {
      footprints.set(decl, { decl, ok: false, error: msg.data });
      continue;
    }
    const axioms = parseAxiomsMessage(msg.data);
    if (axioms !== undefined && footprints.get(decl)?.ok !== false) footprints.set(decl, { decl, ok: true, axioms });
  }
  for (const decl of check.lineOfDecl.keys()) {
    if (!footprints.has(decl)) {
      footprints.set(decl, {
        decl,
        ok: false,
        error: headerErrors.length > 0 ? 'not checked: the imports failed' : 'Lean printed no axioms for this declaration',
      });
    }
  }
  return { footprints, headerErrors };
}

export interface FootprintOptions {
  /** The shadow (already built: footprints import its compiled modules). */
  readonly shadowDir: string;
  /** Modules that define the declarations, e.g. `['Model']`. */
  readonly imports: readonly string[];
  readonly decls: readonly string[];
  /** Passed through to runLean (runId, timeoutMs, memoryMax, toolchain, packagesDir, signal, host). */
  readonly run?: Omit<Partial<RunLeanOptions>, 'shadowDir' | 'argv' | 'stdin' | 'stdoutFile'>;
}

/** Computes `#print axioms` footprints for `decls` inside the sandbox. */
export async function computeFootprints(options: FootprintOptions): Promise<FootprintResult> {
  const check = generateFootprintCheck(options.imports, options.decls);
  const toolchain = options.run?.toolchain ?? resolveToolchain();
  const run = await runLean({
    ...options.run,
    toolchain,
    shadowDir: options.shadowDir,
    argv: [toolchainExe(toolchain, 'lake'), 'env', 'lean', '--stdin', '--json'],
    stdin: check.source,
  });
  if (run.status !== 'ok' && run.status !== 'failed') {
    return { status: 'sandbox-error', footprints: new Map(), headerErrors: [], check, run };
  }
  const messages = parseLeanJsonMessages(run.stdout);
  const { footprints, headerErrors } = footprintsFromMessages(check, messages);
  if (run.status === 'failed' && messages.length === 0) {
    // Lean never got to the check file (e.g. `lake env` itself failed).
    headerErrors.push(run.stderr.trim().split('\n').slice(-5).join('\n') || `exit code ${String(run.exitCode)}`);
  }
  const allOk = headerErrors.length === 0 && [...footprints.values()].every((f) => f.ok);
  return { status: allOk ? 'ok' : 'lean-error', footprints, headerErrors, check, run };
}
