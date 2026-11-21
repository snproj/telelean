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
 *
 * Since slice 2b3a (docs/slice2-plan.md 2.1, D2-75) the check file holds only these probes and imports only the model's
 * modules. The value probe (slice 1d) that ended it moved to its own Lean job, the isolated probe (./probeFile.ts):
 * elaborated where only Lean's own modules are, it reads the model as data when it runs, so no instance of the model
 * can change what it walks or prints. `valueProbeLines` below writes that probe's `#eval`, in both of its forms:
 *
 *   - with `modules` (the isolated probe, ./probeFile.ts): an `IO` action that loads the model's built modules with
 *     `Lean.importModules mods {} (loadExts := false) (level := .private)` (4.35's defaults, written out) and walks
 *     that environment;
 *   - without (the ghost check's in-file probe, gate/scratch.ts, whose theorem is in no built module): a `CoreM`
 *     action on the file's own environment (D2-75's residual: model text can forge that one).
 *
 * Either prints one JSON line:
 *
 *   {"telelean-value-consts":[[…], null, …],"telelean-type-consts":[[…], null, …]}
 *
 * one entry per probed declaration, in `probed` order, `null` when the name is not in the environment. The value
 * entry: the constants of its ELABORATED value (`Expr.getUsedConstants` of a definition's, theorem's or opaque's value;
 * `[]` for an axiom, an inductive, a constructor …). The type entry (2b3a, D2-30): the constants of its elaborated type,
 * plus, for an inductive type (a structure or class too), those of every constructor's type. A constant of the model
 * library that is not probed itself (an auxiliary such as `_proof_1`, `match_1`, an equation lemma, a private or
 * derived declaration) is replaced, in the value walk by its own value's constants (1d's rule), in the type walk by its
 * own type and value constants, transitively; constants from outside the library (Lean's own) are left out. So every
 * name listed is a probed declaration, and a proof that reaches a card only through a `@[simp]` lemma or an instance
 * lists that lemma or instance. `.ilean` references miss both (they record what the source text names). The names
 * (and the modules) reach Lean as one string literal each (JSON-escaped, space-separated; probed names never contain
 * whitespace or guillemets), split into components there, so no name is ever parsed as Lean syntax.
 */
import { SORRY_AXIOM, type LeanDeclKind } from '@telelean/core';

import { parseAxiomsMessage, type LeanMessage } from '../lean/footprint.js';
import { assertModuleName, formatDeclName } from '../lean/leanNames.js';
import { normalizeWhitespace } from './text.js';

export type ProbeKind = 'check' | 'print' | 'axioms' | 'sort';
const PROBE_ORDER: readonly ProbeKind[] = ['check', 'print', 'axioms', 'sort'];

/** The imports the value probe needs (the Environment API, `Lean.importModules` and `Expr.getUsedConstants`). */
export const VALUE_PROBE_IMPORTS: readonly string[] = ['Lean.CoreM', 'Lean.Util.FoldConsts'];
/** The key of the value constants in the probe's JSON line. */
export const VALUE_PROBE_KEY = 'telelean-value-consts';
/** Slice 2b3a (D2-30): the key of the type constants in the probe's JSON line. */
export const TYPE_PROBE_KEY = 'telelean-type-consts';

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

/** Options of `valueProbeLines`. */
export interface ValueProbeOptions {
  /**
   * Slice 1e (B.2 for the "Claude suggests" scratch check): also follow the constants declared in the probed file itself
   * (they have no module index: the scratch theorem's own auxiliaries, and the suggestion's pinned statement), as the
   * library's are followed. In-file form only: an environment that `modules` loads has no constant of its own file.
   */
  readonly followMain?: boolean;
  /**
   * Slice 2b3a (docs/slice2-plan.md 2.1, D2-75): the isolated probe. Its `#eval` is then an `IO` action that loads these
   * built modules (the check file's imports) with `Lean.importModules` and walks that environment, instead of a `CoreM`
   * action that reads the file's own: the file imports only Lean's modules, so nothing of the model is in scope where
   * the probe's code is elaborated. Without it, the in-file form (the ghost check's).
   */
  readonly modules?: readonly string[];
}

/**
 * The value probe's `#eval` (see the module comment): `names` are probed names, `library` a module name, and with
 * `options.modules` the isolated form. Throws TypeError for no name (fixer 2b3a r1, C-V2B3A-C4: Lean splits the empty
 * literal into one empty name, so the line would list one entry for no declaration), a name it cannot pass, a module
 * name that is not plain, an empty `modules`, or `followMain` with `modules`.
 */
export function valueProbeLines(names: readonly string[], library: string, options: ValueProbeOptions = {}): string[] {
  assertModuleName(library);
  if (names.length === 0) throw new TypeError('the value probe needs at least one name');
  for (const name of names) if (/[\s«»]/u.test(name)) throw new TypeError(`not a name the value probe can pass: ${JSON.stringify(name)}`);
  const modules = options.modules;
  if (modules !== undefined) {
    if (modules.length === 0) throw new TypeError('the isolated probe needs at least one module');
    for (const m of modules) assertModuleName(m);
    if (options.followMain === true) throw new TypeError('followMain applies to the in-file probe only');
  }
  // JSON string escapes (\" \\ \uXXXX) are Lean string escapes too.
  const literal = (text: string) => JSON.stringify(text);
  const environment =
    modules !== undefined
      ? [
          '#eval show IO Unit from do',
          `  let mods : Array Lean.Import := ((${literal(modules.join(' '))}).splitOn " ").toArray.map (fun s => { module := (s.splitOn ".").foldl Lean.Name.mkStr Lean.Name.anonymous })`,
          // 4.35's defaults, written out so a toolchain bump cannot change them: no environment extension and no
          // `[init]` runs, and a module-system file loads whole (AP30-1).
          '  let env ← Lean.importModules mods {} (loadExts := false) (level := .private)',
        ]
      : ['#eval show Lean.CoreM Unit from do', '  let env ← Lean.getEnv'];
  return [
    ...environment,
    `  let names : Array Lean.Name := ((${literal(names.join(' '))}).splitOn " ").toArray.map (fun s => (s.splitOn ".").foldl Lean.Name.mkStr Lean.Name.anonymous)`,
    `  let lib : Lean.Name := ((${literal(library)}).splitOn ".").foldl Lean.Name.mkStr Lean.Name.anonymous`,
    '  let probed : Lean.NameSet := names.foldl (fun s n => s.insert n) {}',
    '  let valueOf (ci : Lean.ConstantInfo) : Array Lean.Name :=',
    '    match ci with',
    '    | .defnInfo v => v.value.getUsedConstants',
    '    | .thmInfo v => v.value.getUsedConstants',
    '    | .opaqueInfo v => v.value.getUsedConstants',
    '    | _ => #[]',
    '  let typeOf (ci : Lean.ConstantInfo) : Array Lean.Name :=',
    '    match ci with',
    '    | .inductInfo v => v.ctors.foldl (fun acc c => match env.find? c with',
    '      | some cc => acc ++ cc.type.getUsedConstants',
    '      | none => acc) ci.type.getUsedConstants',
    '    | _ => ci.type.getUsedConstants',
    '  let inLibrary (c : Lean.Name) : Bool :=',
    '    match env.getModuleIdxFor? c with',
    '    | some i => match env.header.moduleNames[i.toNat]? with',
    '      | some m => lib.isPrefixOf m',
    '      | none => false',
    `    | none => ${options.followMain === true ? 'true' : 'false'}`,
    '  let walk (start : Array Lean.Name) (next : Lean.ConstantInfo → Array Lean.Name) : String := Id.run do',
    '    let mut stack : List Lean.Name := start.toList',
    '    let mut seen : Lean.NameSet := {}',
    '    let mut acc : Array String := #[]',
    '    while true do',
    '      match stack with',
    '      | [] => break',
    '      | c :: rest =>',
    '        stack := rest',
    '        if seen.contains c then continue',
    '        seen := seen.insert c',
    '        if probed.contains c then acc := acc.push c.toString.quote',
    '        else if inLibrary c then',
    '          match env.find? c with',
    '          | some cj => stack := (next cj).toList ++ stack',
    '          | none => pure ()',
    '    return "[" ++ ",".intercalate acc.toList ++ "]"',
    '  let mut values : Array String := #[]',
    '  let mut types : Array String := #[]',
    '  for n in names do',
    '    match env.find? n with',
    '    | none =>',
    '      values := values.push "null"',
    '      types := types.push "null"',
    '    | some ci =>',
    '      values := values.push (walk (valueOf ci) valueOf)',
    '      types := types.push (walk (typeOf ci) (fun cj => typeOf cj ++ valueOf cj))',
    `  IO.println ("{\\"${VALUE_PROBE_KEY}\\":[" ++ ",".intercalate values.toList ++ "],\\"${TYPE_PROBE_KEY}\\":[" ++ ",".intercalate types.toList ++ "]}")`,
  ];
}

/**
 * Generates the check file for `decls` (duplicates once) on top of `imports`: only the model's modules, no probe of
 * values since 2b3a (the isolated probe, ./probeFile.ts, is its own Lean job). Throws TypeError without imports.
 */
export function generateCheckFile(imports: readonly string[], decls: readonly string[]): CheckFile {
  if (imports.length === 0) throw new TypeError('the check file needs at least one import');
  for (const m of imports) assertModuleName(m);
  // The declarations that can be written into Lean source, in order (duplicates once).
  const probed: string[] = [];
  const written = new Map<string, string>();
  const unwritable = new Map<string, string>();
  for (const decl of decls) {
    if (written.has(decl) || unwritable.has(decl)) continue;
    try {
      written.set(decl, formatDeclName(decl));
      probed.push(decl);
    } catch (e) {
      unwritable.set(decl, (e as Error).message);
    }
  }
  const lines = [...imports.map((m) => `import ${m}`), 'set_option pp.fullNames true', 'set_option pp.proofs false'];
  const headerLines = lines.length;
  const probeAt = new Map<number, { decl: string; probe: ProbeKind }>();
  for (const decl of probed) {
    const name = written.get(decl) as string;
    for (const probe of PROBE_ORDER) {
      lines.push(probe === 'check' ? `#check @${name}` : probe === 'print' ? `#print ${name}` : probe === 'axioms' ? `#print axioms ${name}` : `#check type_of% @${name}`);
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

/** The probe's line read (`parseValueProbe`): each probed declaration's constants; none for a name Lean does not have. */
export interface ProbeConsts {
  readonly valueConsts: Map<string, string[]>;
  /** Absent when the line has no type key (a line from before 2b3a, as old recordings hold). */
  readonly typeConsts?: Map<string, string[]>;
}

/**
 * Reads the probe's line: under each key one array (or null) per probed declaration, in order. A line without the type
 * key gives no `typeConsts` (2b3a: old recordings still parse); every other deviation (not JSON, a missing value key,
 * the wrong number of entries, an entry that is not a list of names) returns the problem as a string.
 */
export function parseValueProbe(data: string, probed: readonly string[]): ProbeConsts | string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data.trim());
  } catch {
    return `unreadable value probe output: ${JSON.stringify(data.slice(0, 200))}`;
  }
  const line = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  const read = (key: string, what: string): Map<string, string[]> | string => {
    const list = Object.prototype.hasOwnProperty.call(line, key) ? line[key] : undefined;
    if (!Array.isArray(list) || list.length !== probed.length) {
      return `the ${what} probe listed ${Array.isArray(list) ? list.length : 'no'} entries for ${probed.length} declarations`;
    }
    const out = new Map<string, string[]>();
    for (let i = 0; i < probed.length; i++) {
      const entry: unknown = list[i];
      const name = probed[i] as string;
      if (entry === null) continue;
      if (!Array.isArray(entry) || !entry.every((x): x is string => typeof x === 'string')) return `unreadable ${what} probe entry for ${name}`;
      out.set(name, [...new Set(entry)]);
    }
    return out;
  };
  const valueConsts = read(VALUE_PROBE_KEY, 'value');
  if (typeof valueConsts === 'string') return valueConsts;
  if (!Object.prototype.hasOwnProperty.call(line, TYPE_PROBE_KEY)) return { valueConsts };
  const typeConsts = read(TYPE_PROBE_KEY, 'type');
  if (typeof typeConsts === 'string') return typeConsts;
  return { valueConsts, typeConsts };
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
