/**
 * telelean's own scratch Lean files, fed on stdin to `lake env lean --stdin --json` in the build mirror (never written
 * into ws/ or the mirror): the ghost gap check (docs/m2-plan.md section 3.8, facts 7 and 8) and the review's statement
 * renderings (fact 4). Pure: generation and parsing only. Messages are attributed by line, and the ghost's axioms are
 * read only from the `#print axioms` message that names exactly `<S>.telelean_ghost_check`.
 */
import type { LeanMessage } from '../lean/footprint.js';
import { assertModuleName, formatDeclName } from '../lean/leanNames.js';
import type { RenderedStatement } from './types.js';

export const GHOST_STATEMENT_NAME = 'telelean_ghost_stmt';
export const GHOST_CHECK_NAME = 'telelean_ghost_check';
/** The refusal before the round's freeze (docs/m2-plan.md section 3.8). */
export const GHOST_NEEDS_FREEZE = 'freeze first; the gap is judged against the frozen statements';

const NAMESPACE = /^[A-Za-z_][A-Za-z0-9_]*$/u;

/** Every whitespace run becomes one space, trimmed: the checked text a ghost card shows and adoption writes. */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

export interface GhostScratch {
  readonly source: string;
  /** The fully-qualified check theorem, e.g. `Spyro.telelean_ghost_check`. */
  readonly checkName: string;
  /** 1-based line of the pinned statement abbrev. */
  readonly statementLine: number;
  /** 1-based lines of the check theorem's header and its proof (inclusive). */
  readonly proofLines: readonly [number, number];
  /** 1-based line of `#print axioms <checkName>`. */
  readonly printLine: number;
}

/**
 * The pinned ghost check (fact 7):
 *
 *   import <library>
 *   namespace <S>
 *   abbrev telelean_ghost_stmt : Prop := <statement, whitespace collapsed>
 *   theorem telelean_ghost_check : telelean_ghost_stmt → <T> :=
 *     <proof, every line indented by two spaces>
 *   end <S>
 *   #print axioms <S>.telelean_ghost_check
 *
 * Claude's statement is pinned inside a named abbreviation, so text that tries to close the declaration early turns into
 * parse errors (fact 8) instead of changing what is checked; core's single-term rule has already refused such text.
 */
export function ghostScratchSource(input: { library: string; namespace: string; targetStatement: string; statement: string; proof: string }): GhostScratch {
  assertModuleName(input.library);
  if (!NAMESPACE.test(input.namespace)) throw new TypeError(`not a usable namespace: ${JSON.stringify(input.namespace)}`);
  const target = formatDeclName(input.targetStatement);
  const statement = collapseWhitespace(input.statement);
  const proof = input.proof.split(/\r?\n/u).map((line) => `  ${line}`);
  const lines = [
    `import ${input.library}`,
    `namespace ${input.namespace}`,
    `abbrev ${GHOST_STATEMENT_NAME} : Prop := ${statement}`,
    `theorem ${GHOST_CHECK_NAME} : ${GHOST_STATEMENT_NAME} → ${target} :=`,
    ...proof,
    `end ${input.namespace}`,
  ];
  const proofEnd = lines.length - 1;
  const checkName = `${input.namespace}.${GHOST_CHECK_NAME}`;
  lines.push(`#print axioms ${checkName}`);
  return { source: `${lines.join('\n')}\n`, checkName, statementLine: 3, proofLines: [4, proofEnd], printLine: lines.length };
}

const AXIOMS_MESSAGE = /^'([^']*)' (?:depends on axioms: \[([^]*)\]|does not depend on any axioms)\s*$/u;

/** The declaration a `#print axioms` message is about and its axioms, or undefined for any other message. */
export function parseNamedAxiomsMessage(data: string): { name: string; axioms: string[] } | undefined {
  const m = AXIOMS_MESSAGE.exec(data);
  if (m === null) return undefined;
  const axioms = (m[2] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return { name: m[1] ?? '', axioms };
}

export interface GhostScratchResult {
  /** Every Lean error, located ("in the suggested statement", "in the proof", or a line of telelean's file). */
  errors: string[];
  /** The axioms of the check theorem, read from the message naming it (absent when Lean printed none). */
  axioms?: string[];
}

/** Reads Lean's messages for a ghost check. */
export function readGhostScratch(scratch: GhostScratch, messages: readonly LeanMessage[]): GhostScratchResult {
  const errors: string[] = [];
  let axioms: string[] | undefined;
  for (const m of messages) {
    if (m.severity === 'error') {
      const where =
        m.line === scratch.statementLine
          ? 'in the suggested statement'
          : m.line >= scratch.proofLines[0] && m.line <= scratch.proofLines[1]
            ? 'in the proof'
            : `in telelean's check file, line ${m.line}`;
      errors.push(`Lean error ${where}: ${m.data}`);
      continue;
    }
    if (m.line !== scratch.printLine) continue;
    const parsed = parseNamedAxiomsMessage(m.data);
    if (parsed !== undefined && parsed.name === scratch.checkName) axioms = parsed.axioms;
  }
  return { errors, ...(axioms !== undefined ? { axioms } : {}) };
}

/** The options of the review's explicit form (fact 4). */
export const EXPLICIT_OPTIONS = 'set_option pp.explicit true in set_option pp.notation false in set_option pp.universes true in set_option pp.coercions false in';

export interface RenderScratch {
  readonly source: string;
  /** 1-based line -> the statement and form printed there. */
  readonly lines: ReadonlyMap<number, { readonly name: string; readonly form: 'pretty' | 'explicit' }>;
  /** Names that cannot be written into Lean source, with the reason. */
  readonly unwritable: ReadonlyMap<string, string>;
}

/** `#print <name>` with default options, then the same under the explicit options, one line each. */
export function renderScratchSource(library: string, names: readonly string[]): RenderScratch {
  assertModuleName(library);
  const lines = [`import ${library}`];
  const at = new Map<number, { name: string; form: 'pretty' | 'explicit' }>();
  const unwritable = new Map<string, string>();
  for (const name of new Set(names)) {
    let written: string;
    try {
      written = formatDeclName(name);
    } catch (error) {
      unwritable.set(name, (error as Error).message);
      continue;
    }
    lines.push(`#print ${written}`);
    at.set(lines.length, { name, form: 'pretty' });
    lines.push(`${EXPLICIT_OPTIONS} #print ${written}`);
    at.set(lines.length, { name, form: 'explicit' });
  }
  return { source: `${lines.join('\n')}\n`, lines: at, unwritable };
}

/** One RenderedStatement per requested name, in order (an `error` when Lean could not print it). */
export function readRenderScratch(scratch: RenderScratch, names: readonly string[], messages: readonly LeanMessage[]): RenderedStatement[] {
  const byName = new Map<string, { pretty?: string; explicit?: string; error?: string }>();
  const headerErrors: string[] = [];
  for (const m of messages) {
    const slot = scratch.lines.get(m.line);
    if (slot === undefined) {
      if (m.severity === 'error') headerErrors.push(m.data);
      continue;
    }
    const entry = byName.get(slot.name) ?? {};
    if (m.severity === 'error') entry.error ??= m.data;
    else if (m.severity === 'information') entry[slot.form] ??= m.data.trim();
    byName.set(slot.name, entry);
  }
  return names.map((name) => {
    const why = scratch.unwritable.get(name);
    if (why !== undefined) return { name, pretty: '', explicit: '', error: why };
    const entry = byName.get(name) ?? {};
    const error =
      entry.error ??
      (headerErrors.length > 0 && (entry.pretty === undefined || entry.explicit === undefined) ? headerErrors.join('\n') : undefined) ??
      (entry.pretty === undefined || entry.explicit === undefined ? `Lean printed nothing for ${name}` : undefined);
    return { name, pretty: entry.pretty ?? '', explicit: entry.explicit ?? '', ...(error !== undefined ? { error } : {}) };
  });
}
