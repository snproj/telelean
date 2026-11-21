/**
 * telelean's own scratch Lean files, fed on stdin to `lake env lean --stdin --json` in the build mirror (never written
 * into ws/ or the mirror): the ghost gap check (docs/m2-plan.md section 3.8, facts 7 and 8) and the review's statement
 * renderings (fact 4). Pure: generation and parsing only. Messages are attributed by line, and the ghost's axioms are
 * read only from the `#print axioms` message that names exactly `<S>.telelean_ghost_check`.
 */
import type { LeanMessage } from '../lean/footprint.js';
import { assertModuleName, formatDeclName } from '../lean/leanNames.js';
import { parseValueProbe, VALUE_PROBE_IMPORTS, VALUE_PROBE_KEY, valueProbeLines } from '../semantic/checkFile.js';
import type { RenderedStatement } from './types.js';

export const GHOST_STATEMENT_NAME = 'telelean_ghost_stmt';
export const GHOST_CHECK_NAME = 'telelean_ghost_check';
/**
 * Slice 1e (spec v4.1 RV-1, B.2): the start of the problem when the suggestion's proof uses a card that is not selected
 * (the runner's ghost check; the rest names the card and what to do).
 */
export const GHOST_UNSELECTED = 'The proof that the suggestion closes the gap uses';
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
  /**
   * Slice 1e (spec v4.1 RV-1 "the check includes B.2"): the value probe after `#print axioms` (with `probe`): its first
   * and last 1-based lines and the names it lists, the check theorem first.
   */
  readonly valueProbe?: { readonly firstLine: number; readonly lastLine: number; readonly probed: readonly string[] };
  /**
   * Slice 2b3b (docs/slice2-plan.md 3.8; with `statementFacts`): the 1-based line of `#print` of the pinned statement
   * under the review's explicit options (`EXPLICIT_OPTIONS`), and a second value probe listing the statement abbrev
   * first: its own constants, which a session keeps as the draft's facts (`PremiseDraft.facts`).
   */
  readonly explicitLine?: number;
  readonly statementProbe?: { readonly firstLine: number; readonly lastLine: number; readonly probed: readonly string[] };
  /** The fully-qualified pinned statement, e.g. `Spyro.telelean_ghost_stmt`. */
  readonly statementName?: string;
}

/** Names the value probe can pass (no whitespace, no guillemets: see valueProbeLines). */
const PROBEABLE = (name: string) => name.length > 0 && !/[\s«»]/u.test(name);

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
 *
 * Slice 1e (spec v4.1 RV-1: "the check includes B.2"): with `probe`, the file also imports what the value probe needs
 * (`Lean.CoreM`, `Lean.Util.FoldConsts`, right after the library) and ends with the value probe in its in-file form
 * (semantic/checkFile.ts `valueProbeLines`, following the constants this file declares too), listing the check theorem
 * first and then `probe.names` (the declarations of the facts the walk continues through): so the runner learns which
 * of those the elaborated proof uses, a `@[simp]` lemma or an instance included, and walks on over the facts.
 *
 * Slice 2b3a (docs/slice2-plan.md 2.1, D2-75): this probe stays in the file, with the type walk too, since its theorem
 * and the suggestion's pinned statement are in no built module, so the isolated probe (semantic/probeFile.ts) cannot
 * load them. Residual (D2-75's own): model text in ws/ can forge its constants through its instances on Lean's types
 * (no `[init]` code runs here: G0 refuses it). They decide only the draft's gap check and its facts before it is
 * written; every decision that counts is judged again with the isolated probe.
 */
export function ghostScratchSource(input: {
  library: string;
  namespace: string;
  targetStatement: string;
  statement: string;
  proof: string;
  probe?: { readonly names: readonly string[] };
  /**
   * Slice 2b3b (§3.8, an edit session's ghost check; additive): also print the pinned statement's fully explicit form,
   * and, with `probe`, probe the statement's own constants in a second block (its names first, then `probe.names`).
   */
  statementFacts?: boolean;
}): GhostScratch {
  assertModuleName(input.library);
  if (!NAMESPACE.test(input.namespace)) throw new TypeError(`not a usable namespace: ${JSON.stringify(input.namespace)}`);
  const target = formatDeclName(input.targetStatement);
  const statement = collapseWhitespace(input.statement);
  const proof = input.proof.split(/\r?\n/u).map((line) => `  ${line}`);
  const imports = [`import ${input.library}`, ...(input.probe !== undefined ? VALUE_PROBE_IMPORTS.filter((m) => m !== input.library).map((m) => `import ${m}`) : [])];
  const lines = [
    ...imports,
    `namespace ${input.namespace}`,
    `abbrev ${GHOST_STATEMENT_NAME} : Prop := ${statement}`,
    `theorem ${GHOST_CHECK_NAME} : ${GHOST_STATEMENT_NAME} → ${target} :=`,
    ...proof,
    `end ${input.namespace}`,
  ];
  const statementLine = imports.length + 2;
  const proofEnd = lines.length - 1;
  const checkName = `${input.namespace}.${GHOST_CHECK_NAME}`;
  const statementName = `${input.namespace}.${GHOST_STATEMENT_NAME}`;
  lines.push(`#print axioms ${checkName}`);
  const printLine = lines.length;
  let explicitLine: number | undefined;
  if (input.statementFacts === true) {
    lines.push(`${EXPLICIT_OPTIONS} #print ${statementName}`);
    explicitLine = lines.length;
  }
  let valueProbe: GhostScratch['valueProbe'];
  let statementProbe: GhostScratch['statementProbe'];
  if (input.probe !== undefined) {
    const others = [...new Set(input.probe.names.filter((n) => n !== checkName && n !== statementName && PROBEABLE(n)))];
    const probed = [checkName, ...others];
    const eval_ = valueProbeLines(probed, input.library, { followMain: true });
    valueProbe = { firstLine: lines.length + 1, lastLine: lines.length + eval_.length, probed };
    lines.push(...eval_);
    if (input.statementFacts === true) {
      const own = [statementName, ...others];
      const second = valueProbeLines(own, input.library, { followMain: true });
      statementProbe = { firstLine: lines.length + 1, lastLine: lines.length + second.length, probed: own };
      lines.push(...second);
    }
  }
  return {
    source: `${lines.join('\n')}\n`,
    checkName,
    statementLine,
    proofLines: [statementLine + 1, proofEnd],
    printLine,
    ...(valueProbe !== undefined ? { valueProbe } : {}),
    ...(explicitLine !== undefined ? { explicitLine, statementName } : {}),
    ...(statementProbe !== undefined ? { statementProbe } : {}),
  };
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
  /**
   * Fixer 2b3b r1 (A-V2B3B-ADV-2), with `errors` only: `suggestion` when an error is at the pinned statement or in the
   * proof (the suggestion's own lines, the check theorem's header included); `telelean` when every error is in
   * telelean's own lines (the `#print`s after the proof), or when one is in the file's header (its imports and
   * namespace: every later line fails with it, so nothing of the suggestion was judged).
   */
  errorsAt?: 'suggestion' | 'telelean';
  /** The axioms of the check theorem, read from the message naming it (absent when Lean printed none). */
  axioms?: string[];
  /** Slice 1e: the constants of the check theorem's elaborated value (absent without the probe, or when it failed). */
  valueConsts?: string[];
  /**
   * Slice 2b3a (D2-30): the constants of the check theorem's elaborated type (its pinned statement unfolded through
   * this file's own declarations), from the same line; absent without the probe, when it failed, or for a line without
   * the type key.
   */
  typeConsts?: string[];
  /** Slice 1e: what went wrong with the value probe (an error in its `#eval`, no output, unreadable output). */
  valueProblems: string[];
  /**
   * Slice 2b3b (with `statementFacts`): what `#print` printed for the pinned statement under the explicit options,
   * trimmed (absent when Lean printed nothing there), and the statement's own value and type constants from the second
   * probe (absent when it failed: `statementProblems` says why).
   */
  explicit?: string;
  statementValueConsts?: string[];
  statementTypeConsts?: string[];
  statementProblems?: string[];
}

/** Reads Lean's messages for a ghost check. */
export function readGhostScratch(scratch: GhostScratch, messages: readonly LeanMessage[]): GhostScratchResult {
  const errors: string[] = [];
  let header = false;
  let suggestion = false;
  let axioms: string[] | undefined;
  const probe = scratch.valueProbe;
  const valueProblems: string[] = [];
  let valueConsts: string[] | undefined;
  let typeConsts: string[] | undefined;
  let probeLine: LeanMessage | undefined;
  const second = scratch.statementProbe;
  const statementProblems: string[] = [];
  let secondLine: LeanMessage | undefined;
  let explicit: string | undefined;
  for (const m of messages) {
    if (probe !== undefined && m.line >= probe.firstLine && m.line <= probe.lastLine) {
      // The value probe's own messages: an error voids it (B.2 then refuses), never the suggestion's check.
      if (m.severity === 'error') valueProblems.push(`the value probe failed: ${m.line}:${m.column}: ${m.data.split('\n')[0] ?? ''}`);
      else if (m.severity === 'information' && m.line === probe.firstLine && m.data.includes(VALUE_PROBE_KEY)) probeLine ??= m;
      continue;
    }
    if (second !== undefined && m.line >= second.firstLine && m.line <= second.lastLine) {
      // Slice 2b3b: the statement's own probe; an error voids only its facts (the session then has none for it).
      if (m.severity === 'error') statementProblems.push(`the statement's probe failed: ${m.line}:${m.column}: ${m.data.split('\n')[0] ?? ''}`);
      else if (m.severity === 'information' && m.line === second.firstLine && m.data.includes(VALUE_PROBE_KEY)) secondLine ??= m;
      continue;
    }
    if (scratch.explicitLine !== undefined && m.line === scratch.explicitLine && m.severity === 'information') {
      explicit ??= m.data.trim();
      continue;
    }
    if (m.severity === 'error') {
      const inProof = m.line >= scratch.proofLines[0] && m.line <= scratch.proofLines[1];
      const where = m.line === scratch.statementLine ? 'in the suggested statement' : inProof ? 'in the proof' : `in telelean's check file, line ${m.line}`;
      if (m.line === scratch.statementLine || inProof) suggestion = true;
      else if (m.line < scratch.statementLine) header = true;
      errors.push(`Lean error ${where}: ${m.data}`);
      continue;
    }
    if (m.line !== scratch.printLine) continue;
    const parsed = parseNamedAxiomsMessage(m.data);
    if (parsed !== undefined && parsed.name === scratch.checkName) axioms = parsed.axioms;
  }
  if (probe !== undefined && valueProblems.length === 0) {
    if (probeLine === undefined) {
      if (errors.length === 0) valueProblems.push('Lean printed nothing for the value probe');
    } else {
      const parsed = parseValueProbe(probeLine.data, probe.probed);
      if (typeof parsed === 'string') valueProblems.push(parsed);
      else {
        valueConsts = parsed.valueConsts.get(scratch.checkName);
        typeConsts = parsed.typeConsts?.get(scratch.checkName);
        if (valueConsts === undefined) valueProblems.push(`the value probe found no ${scratch.checkName}`);
      }
    }
  }
  if (valueProblems.length > 0) typeConsts = undefined;
  let statementValueConsts: string[] | undefined;
  let statementTypeConsts: string[] | undefined;
  if (second !== undefined && statementProblems.length === 0) {
    const name = second.probed[0] ?? '';
    if (secondLine === undefined) {
      if (errors.length === 0) statementProblems.push("Lean printed nothing for the statement's probe");
    } else {
      const parsed = parseValueProbe(secondLine.data, second.probed);
      if (typeof parsed === 'string') statementProblems.push(parsed);
      else {
        statementValueConsts = parsed.valueConsts.get(name);
        statementTypeConsts = parsed.typeConsts?.get(name);
        if (statementValueConsts === undefined || statementTypeConsts === undefined) statementProblems.push(`the statement's probe found no ${name}`);
      }
    }
  }
  const statementFacts = statementProblems.length === 0 && statementValueConsts !== undefined && statementTypeConsts !== undefined;
  return {
    errors,
    ...(errors.length > 0 ? { errorsAt: suggestion && !header ? ('suggestion' as const) : ('telelean' as const) } : {}),
    ...(axioms !== undefined ? { axioms } : {}),
    ...(valueConsts !== undefined ? { valueConsts } : {}),
    ...(typeConsts !== undefined ? { typeConsts } : {}),
    valueProblems,
    ...(explicit !== undefined ? { explicit } : {}),
    ...(statementFacts ? { statementValueConsts, statementTypeConsts } : {}),
    ...(second !== undefined ? { statementProblems } : {}),
  };
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
