/**
 * The generated check file (docs/m1-plan.md section 4 step 7): fed on stdin to `lake env lean --stdin --json`
 * under runLean, it imports the fresh modules and asks Lean about every declaration:
 *
 *   import Model.Spyro.Vocabulary
 *   import Model.Spyro.Main
 *   set_option pp.fullNames true
 *   set_option pp.proofs false
 *   #check @Spyro.cynder_dark_past          -- "Spyro.cynder_dark_past : Prop"
 *   #print Spyro.cynder_dark_past           -- "@[reducible] def Spyro.cynder_dark_past : Prop :=\nSpyro.HasDarkPast Spyro.cynder"
 *   #print axioms Spyro.cynder_dark_past    -- "'Spyro.cynder_dark_past' depends on axioms: [Classical.choice,\n Spyro.Character, …]"
 *   #check type_of% @Spyro.cynder_dark_past -- "Prop : Type"
 *
 * Each command sits on its own line and messages are attributed by their 1-based line (the M0 footprint
 * pattern), never by re-reading printed names. Names are written with M0's `formatDeclName`, so a name can never
 * inject a command. The `type_of%` probe runs for every declaration (the plan requires it for axioms and opaques;
 * an error there counts only for those).
 *
 * Output shapes (Lean 4.35, verified; `#print` per `Lean/Elab/Print.lean`):
 * - `#check @N`: `N : <type>`; long types wrap onto indented lines.
 * - `#print N`: `[@[attrs] ][unsafe |partial ][private ][protected ][meta ]<kind> N : <type>[ :=\n<value>]`,
 *   kind one of `axiom theorem def opaque inductive structure class constructor recursor` (`Quotient primitive`);
 *   theorems print `:=\n⋯` under `pp.proofs false`; instances print as `theorem` (Prop) or `@[instance_reducible] def`.
 * - `#print axioms N`: `'N' depends on axioms: [a,\n b]` or `'N' does not depend on any axioms`.
 * - `#check type_of% @N`: `<type> : <sort>`.
 */
import { SORRY_AXIOM, type LeanDeclKind } from '@telelean/core';

import { parseAxiomsMessage, type LeanMessage } from '../lean/footprint.js';
import { assertModuleName, formatDeclName } from '../lean/leanNames.js';
import { normalizeWhitespace } from './text.js';

export type ProbeKind = 'check' | 'print' | 'axioms' | 'sort';
const PROBE_ORDER: readonly ProbeKind[] = ['check', 'print', 'axioms', 'sort'];

export interface CheckFile {
  /** The generated Lean source. */
  readonly source: string;
  /** 1-based line number of each probe command. */
  readonly probeAt: ReadonlyMap<number, { readonly decl: string; readonly probe: ProbeKind }>;
  /** Declarations written into the file, in order. */
  readonly probed: readonly string[];
  /** Declarations whose names cannot be written into Lean source safely (not probed), with the reason. */
  readonly unwritable: ReadonlyMap<string, string>;
  /** Lines 1..headerLines are the imports and options. */
  readonly headerLines: number;
}

/** Generates the check file for `decls` (duplicates once) on top of `imports`. Throws TypeError without imports. */
export function generateCheckFile(imports: readonly string[], decls: readonly string[]): CheckFile {
  if (imports.length === 0) throw new TypeError('the check file needs at least one import');
  for (const m of imports) assertModuleName(m);
  const lines = [...imports.map((m) => `import ${m}`), 'set_option pp.fullNames true', 'set_option pp.proofs false'];
  const headerLines = lines.length;
  const probeAt = new Map<number, { decl: string; probe: ProbeKind }>();
  const probed: string[] = [];
  const unwritable = new Map<string, string>();
  const seen = new Set<string>();
  for (const decl of decls) {
    if (seen.has(decl)) continue;
    seen.add(decl);
    let written: string;
    try {
      written = formatDeclName(decl);
    } catch (e) {
      unwritable.set(decl, (e as Error).message);
      continue;
    }
    probed.push(decl);
    for (const probe of PROBE_ORDER) {
      lines.push(
        probe === 'check' ? `#check @${written}` : probe === 'print' ? `#print ${written}` : probe === 'axioms' ? `#print axioms ${written}` : `#check type_of% @${written}`,
      );
      probeAt.set(lines.length, { decl, probe });
    }
  }
  return { source: `${lines.join('\n')}\n`, probeAt, probed, unwritable, headerLines };
}

export interface ProbeResult {
  /** `#check @N`: the type, whitespace normalised. */
  type?: string;
  /** `#check type_of% @N`: the sort of the type. */
  typeSort?: string;
  /** The keyword `#print` shows (`axiom`, `theorem`, `def`, `structure`, `Quotient primitive`, …). */
  printedKeyword?: string;
  /** `printedKeyword` as a LeanDeclKind (never `instance`: that comes from the source, see refresh). */
  kind?: LeanDeclKind;
  /** `@[…]` attributes shown by `#print`. */
  attributes?: string[];
  /** The value after `:=` (whitespace normalised) for `def`/`theorem` prints; `⋯` for elided proofs. */
  value?: string;
  axioms?: string[];
  usesSorry?: boolean;
  /** Lean's error for the `#check`, `#print` or `#print axioms` probe (the first one). */
  error?: string;
  /** Lean's error for the `type_of%` probe (counted only for axioms and opaques). */
  sortError?: string;
  /** Output the parser did not understand (becomes a `check-errors` detail, never a guess). */
  problems: string[];
}

export interface CheckOutput {
  readonly results: Map<string, ProbeResult>;
  /** Errors on the import/option lines or on no probe line at all (e.g. a module that is not built). */
  readonly headerErrors: string[];
}

const KIND_OF_KEYWORD: Readonly<Record<string, LeanDeclKind>> = {
  axiom: 'axiom',
  theorem: 'theorem',
  def: 'def',
  opaque: 'opaque',
  inductive: 'inductive',
  structure: 'structure',
  class: 'class',
};

const PRINT_HEADER =
  /^(?:@\[([^\]]*)\] )?((?:(?:unsafe|partial|private|protected|meta|noncomputable) )*)(Quotient primitive|constructor|recursor|inductive|structure|class|def|theorem|axiom|opaque|instance)(?: |$)/u;

/** The text after the first ` : ` that is not inside `«…»` (the name part of `N : T`), or undefined. */
export function afterFirstColon(text: string): string | undefined {
  let inEscape = false;
  for (let i = 0; i + 2 < text.length; i++) {
    const c = text.charAt(i);
    if (c === '«') inEscape = true;
    else if (c === '»') inEscape = false;
    else if (!inEscape && c === ' ' && text.startsWith(' : ', i)) return text.slice(i + 3);
  }
  return undefined;
}

/** The text after the last ` : ` (the sort in `T : S`), or undefined. */
export function afterLastColon(text: string): string | undefined {
  const i = text.lastIndexOf(' : ');
  return i < 0 ? undefined : text.slice(i + 3);
}

export interface PrintedHeader {
  readonly keyword: string;
  readonly attributes: string[];
  readonly value?: string;
}

/** Reads the header (and the value, if any) of one `#print N` message; undefined when it does not look like one. */
export function parsePrintMessage(data: string): PrintedHeader | undefined {
  const m = PRINT_HEADER.exec(data);
  if (m === null) return undefined;
  const attributes = (m[1] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const keyword = m[3] ?? '';
  let value: string | undefined;
  if (keyword === 'def' || keyword === 'theorem' || keyword === 'instance') {
    // The value follows ` :=` and a top-level line break (column 0); wrapped type lines are indented.
    const split = / :=\n(?=\S)/u.exec(data);
    if (split !== null) value = normalizeWhitespace(data.slice(split.index + split[0].length));
  }
  return { keyword, attributes, ...(value !== undefined ? { value } : {}) };
}

/** Attributes Lean's `lean --json` messages to probes by line and parses each probe's output. */
export function parseCheckOutput(check: CheckFile, messages: readonly LeanMessage[]): CheckOutput {
  const byLine = new Map<number, LeanMessage[]>();
  const headerErrors: string[] = [];
  for (const msg of messages) {
    if (!check.probeAt.has(msg.line)) {
      if (msg.severity === 'error') headerErrors.push(`${msg.line}:${msg.column}: ${msg.data}`);
      continue;
    }
    byLine.set(msg.line, [...(byLine.get(msg.line) ?? []), msg]);
  }

  const results = new Map<string, ProbeResult>();
  for (const decl of check.probed) results.set(decl, { problems: [] });
  for (const [line, { decl, probe }] of check.probeAt) {
    const r = results.get(decl);
    if (r === undefined) continue;
    const msgs = byLine.get(line) ?? [];
    const error = msgs.find((m) => m.severity === 'error');
    if (error !== undefined) {
      if (probe === 'sort') r.sortError ??= error.data;
      else r.error ??= error.data;
      continue;
    }
    const info = msgs.find((m) => m.severity === 'information');
    if (info === undefined) {
      if (headerErrors.length === 0) r.problems.push(`Lean printed nothing for ${probeLabel(probe)} ${decl}`);
      continue;
    }
    const data = info.data;
    if (probe === 'check') {
      const type = afterFirstColon(normalizeWhitespace(data));
      if (type === undefined || type === '') r.problems.push(`unreadable #check output for ${decl}: ${JSON.stringify(data.slice(0, 200))}`);
      else r.type = type;
    } else if (probe === 'sort') {
      const sort = afterLastColon(normalizeWhitespace(data));
      if (sort === undefined || sort === '') r.problems.push(`unreadable type_of% output for ${decl}: ${JSON.stringify(data.slice(0, 200))}`);
      else r.typeSort = sort;
    } else if (probe === 'print') {
      const header = parsePrintMessage(data);
      if (header === undefined) {
        r.problems.push(`unreadable #print output for ${decl}: ${JSON.stringify(data.slice(0, 200))}`);
      } else {
        r.printedKeyword = header.keyword;
        r.kind = KIND_OF_KEYWORD[header.keyword] ?? 'other';
        r.attributes = header.attributes;
        if (header.value !== undefined) r.value = header.value;
      }
    } else {
      const axioms = parseAxiomsMessage(data);
      if (axioms === undefined) {
        r.problems.push(`unreadable #print axioms output for ${decl}: ${JSON.stringify(data.slice(0, 200))}`);
      } else {
        r.axioms = axioms;
        r.usesSorry = axioms.includes(SORRY_AXIOM);
      }
    }
  }
  return { results, headerErrors };
}

function probeLabel(probe: ProbeKind): string {
  return probe === 'check' ? '#check' : probe === 'print' ? '#print' : probe === 'axioms' ? '#print axioms' : 'type_of%';
}
