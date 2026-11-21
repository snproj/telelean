/**
 * Lean facts: what the semantic layer (runner, WP-semantic) learned from one sandboxed `lake build` plus the
 * telelean-generated check file, keyed by Lean names and file positions. Pure data, no markup knowledge: core
 * (WP-model) merges it with the parsed blocks (docs/m1-plan.md section 4).
 *
 * FROZEN CONTRACT (M1). Additive optional fields only; record them in the plan's change log.
 *
 * Positions follow the LSP convention (0-based line, UTF-16 character), as the `.ilean` files store them.
 * Paths are POSIX, relative to the model root.
 */
import type { Range } from './model.js';

export const LEAN_FACTS_FORMAT = 'telelean-lean-facts' as const;
export const LEAN_FACTS_VERSION = 1 as const;

/** The axioms `#print axioms` treats as a clean proof (same list as runner/lean/comparator.ts STANDARD_AXIOMS). */
export const STANDARD_AXIOM_NAMES: readonly string[] = ['propext', 'Classical.choice', 'Quot.sound'];
/** The axiom behind `sorry`. */
export const SORRY_AXIOM = 'sorryAx';
/** D-2(b): the justification of statement `n` is `n.holds`. */
export const HOLDS_SUFFIX = '.holds';

export type FactsStatus =
  /** Build and check succeeded; every module is fresh. */
  | 'ok'
  /** The build had errors: facts cover the modules that built (see `modules[].state`). */
  | 'build-errors'
  /** The build succeeded but the check file reported errors for some declarations (see `decls[].error`). */
  | 'check-errors'
  /** The sandbox could not start (no bwrap/systemd user manager, cap not enforced, ...). No facts. */
  | 'could-not-start'
  | 'timeout'
  | 'oom'
  | 'cancelled'
  /** Not started: MemAvailable was below the threshold. No facts. */
  | 'low-memory'
  /** Not started: `lean-toolchain` is not the pinned toolchain (D-7). No facts. */
  | 'unsupported-toolchain'
  /**
   * Not started: M1 cannot check this project as it is: `lake-manifest.json` is missing (the sandbox keeps the
   * root read-only, so Lake could not write it), or the project has Lake dependencies (manifest `packages` not
   * empty; e.g. Mathlib, which needs an explicit opt-in, D-28/M4). No facts; `detail` says which.
   */
  | 'unsupported-project';

export interface LeanMessageFact {
  severity: 'error' | 'warning' | 'information';
  /** Model file the message is about, when Lean names one. */
  file?: string;
  module?: string;
  /**
   * 0-based line / UTF-16 character (converted from Lean's 1-based line and 0-based code-point column, using the
   * source text the build saw). Lake's log gives only a start position: such ranges are zero-width (start = end).
   */
  range?: Range;
  /** The whole message, continuation lines included (Lean's first line alone loses the detail). */
  text: string;
}

export interface BuildFacts {
  status: 'ok' | 'failed' | 'oom' | 'timeout' | 'cancelled' | 'could-not-start' | 'skipped';
  durationMs: number;
  peakMemoryBytes?: number;
  /** Lean messages from the build (errors, warnings such as "declaration uses `sorry`", infos). */
  messages: LeanMessageFact[];
  /** Modules Lake reported as failed. */
  failedModules: string[];
  detail?: string;
}

export interface CheckRunFacts {
  status: 'ok' | 'failed' | 'oom' | 'timeout' | 'cancelled' | 'could-not-start' | 'skipped';
  durationMs: number;
  peakMemoryBytes?: number;
  /** Number of declarations probed. */
  probed: number;
  detail?: string;
}

export interface ModuleFacts {
  /** e.g. `Model.Spyro.Main`. */
  name: string;
  /** e.g. `Model/Spyro/Main.lean`. */
  file: string;
  /** sha256 (hex) of the source the build saw, hashed before the build started. */
  sourceSha256: string;
  /**
   * `fresh`: built in this refresh (or up to date) and checked. `failed`: Lake reported it failed (Lake deletes
   * its .olean/.ilean). `dependency-failed`: an import failed, so it was not built. `not-built`: not imported by
   * the library root, so `lake build` never compiles it. `stale`: its source changed while the refresh ran.
   */
  state: 'fresh' | 'failed' | 'dependency-failed' | 'not-built' | 'stale';
  /** Project-internal imports, from the source header. */
  imports: string[];
}

export type LeanDeclKind = 'axiom' | 'theorem' | 'def' | 'opaque' | 'instance' | 'structure' | 'inductive' | 'class' | 'other';

/** An identifier occurrence inside a declaration that Lean resolved to a constant (`.ilean` `usages`). */
export interface DeclRef {
  /** Fully-qualified constant name. */
  name: string;
  /** Module that defines the constant. */
  module: string;
  /** Absolute range of the occurrence in the declaration's file. */
  range: Range;
}

export interface DeclFacts {
  /** Fully-qualified name, e.g. `Spyro.cynder_dark_past.holds`. */
  name: string;
  module: string;
  file: string;
  /** Full range from the `.ilean` `decls` table (starts at the docstring when there is one). */
  range: Range;
  /** The name's range. */
  selectionRange: Range;
  /**
   * From the `#print` header (`@[reducible] def` counts as `def` with attribute `reducible`), except `instance`:
   * Lean prints a Prop-valued instance as `theorem` (verified: `instance : Nonempty Character := Character.exists`
   * prints `theorem Spyro.instNonemptyCharacter : …`) and a data instance as `@[instance_reducible] def`, so the
   * semantic layer reports `instance` when the source text of the declaration (after its docstring, attributes
   * and modifiers) starts with the `instance` keyword.
   */
  kind?: LeanDeclKind;
  /** Attributes shown by `#print`, e.g. `reducible`, `instance_reducible`. */
  attributes?: string[];
  /**
   * `#check @name` with `pp.fullNames`: the declaration's type, e.g. `Spyro.Character → Prop`, with whitespace
   * normalised (Lean wraps long types onto indented lines; every run of whitespace becomes one space).
   */
  type?: string;
  /**
   * The sort of `type`, from `#check type_of% @name` (the text after its last ` : `): `Prop` means the declaration
   * is a proof of a proposition (an axiom of sort Prop is an assertion, i.e. an assumption), `Type` a data or
   * function symbol, `Type 1` a sort such as `axiom T : Type`. Probed at least for axioms and opaques.
   */
  typeSort?: string;
  /** `#print` value for definitions (e.g. a statement abbrev's proposition), `pp.fullNames`; absent for axioms, opaque, theorems. */
  value?: string;
  /** `#print axioms` with `pp.fullNames`, in Lean's order. Absent if the probe failed. */
  axioms?: string[];
  /** `axioms` contains `sorryAx`. */
  usesSorry?: boolean;
  /** A probe failed (e.g. the name did not resolve); the text is Lean's message. */
  error?: string;
  /** The docstring text (between `/--` and `-/`, trimmed), read from the source at `range`. */
  docstring?: string;
  /** Usages inside this declaration (`.ilean` usages whose parent declaration is this one), in source order. */
  refs: DeclRef[];
  /** For auxiliary names that `.ilean` attributes to another declaration (e.g. structure fields): that declaration. */
  parent?: string;
  /**
   * Spec v4.1 B.2 (slice 1d, the review's S-1): the constants of the declaration's ELABORATED value (a definition's,
   * theorem's or opaque's; `[]` for an axiom, an inductive, a constructor …), from the value probe
   * (`Expr.getUsedConstants`; since slice 2b3a the isolated probe, its own Lean job that reads the built modules as
   * data, docs/slice2-plan.md 2.1, D2-75; before it, an `#eval` at the end of the check file). Only declarations of the
   * facts are listed: an auxiliary of the model library that is not
   * a declaration of the facts (`_proof_1`, `match_1`, an equation lemma …) is replaced by its own value's constants,
   * and constants from outside the library are left out. Unlike `refs`, it includes what elaboration inserted: a
   * `@[simp]` lemma `simp` used without the source naming it, an instance found by type-class search. Absent in facts
   * from before slice 1d, or when the probe failed: core then falls back to `refs` (and no band gets its ✓).
   */
  valueConsts?: string[];
  /**
   * Slice 2 (docs/slice2-plan.md 2.1, D2-30; the field in 2a1, the isolated probe in 2b3a): the constants of the
   * declaration's ELABORATED type, plus, for an inductive type (a structure or class too), those of every constructor's
   * type. Same
   * rules as `valueConsts`: only declarations of the facts are listed, a model-library constant that is not probed is
   * replaced by its own type and value constants (transitively), and constants from outside the library are left out.
   * Absent in facts from before slice 2 (old recordings, a failed probe): closures then report `complete: false`, RV-7
   * counts every new or changed definition and instance as a belief, and Apply is refused (D2-25, fail closed).
   */
  typeConsts?: string[];
}

export interface LeanFacts {
  format: typeof LEAN_FACTS_FORMAT;
  version: typeof LEAN_FACTS_VERSION;
  /** The toolchain the project pins and the facts come from, e.g. `leanprover/lean4:v4.35.0`. */
  toolchain: string;
  /** Library whose modules were checked, e.g. `Model`. */
  library: string;
  startedAt: string;
  finishedAt: string;
  status: FactsStatus;
  detail?: string;
  build: BuildFacts;
  check: CheckRunFacts;
  modules: ModuleFacts[];
  /** Declarations of the fresh modules, in module then source order. */
  decls: DeclFacts[];
  /**
   * Slice 2 (docs/slice2-plan.md 2.1, D2-75; the field in 2b2, the job in 2b3a; additive): the isolated probe's run,
   * present whenever the probe job ran on these facts, whatever it gave (the facts' marker). Absent in facts from before
   * 2b3a (old recordings, a converted v1 run's base-facts.json). When it is `cut` or `failed`, no declaration of these
   * facts has constants (`probeFailure`).
   */
  probe?: ProbeRunFacts;
}

/** The isolated probe's run (`LeanFacts.probe`, docs/slice2-plan.md 2.1). */
export interface ProbeRunFacts {
  /**
   * `ok`: its line was read. `cut`: Lean's output passed runLean's 32 MB cap. `failed`: an error in its `#eval` or its
   * imports, no line, or a line `parseValueProbe` cannot read. The sandbox's statuses end the refresh with the same
   * status, as the check's do, so facts that have declarations only ever carry the first three.
   */
  status: 'ok' | 'cut' | 'failed' | 'oom' | 'timeout' | 'cancelled' | 'could-not-start';
  durationMs: number;
  peakMemoryBytes?: number;
  /** For `failed`: Lean's first error, with its line, or what could not be read. */
  detail?: string;
}

/**
 * The cause of a failed probe as a sentence (docs/slice2-plan.md 2.1, D2-75): "telelean could not read what the
 * declarations of this state use in Lean: ‹cause›.", ‹cause› "Lean's answer was over 32 MB" (`cut`) or "the probe
 * failed: ‹detail›" (`failed`; the detail on one line, without a final period; "the probe failed" without one).
 * Undefined when the probe gave its line (`ok`), for the sandbox's statuses (`oom`, `timeout`, `cancelled`,
 * `could-not-start`: such facts carry no declarations, and their status already says why; AP30-5), or when the facts
 * have no marker (facts from before 2b3a keep D2-25's fallbacks) or are absent.
 * `detail: false` (fixer 2b2 r1, A-V2B2-ADV-7; additive): "the probe failed" without its detail, for what may be shown
 * while the results are hidden (§4.7): Lean's error can name or quote a declaration of hidden proof material.
 */
export function probeFailure(facts: LeanFacts | undefined, options: { detail?: boolean } = {}): string | undefined {
  const probe = facts?.probe;
  if (probe === undefined) return undefined;
  if (probe.status === 'cut') return "telelean could not read what the declarations of this state use in Lean: Lean's answer was over 32 MB.";
  if (probe.status !== 'failed') return undefined;
  const detail = options.detail === false ? '' : (probe.detail ?? '').replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
  return `telelean could not read what the declarations of this state use in Lean: the probe failed${detail !== '' ? `: ${detail}` : ''}.`;
}

/**
 * The time of a refresh's Lean jobs (fixer 2b3a r1, C-V2B3A-C2; additive): the build's, the check's and, since slice
 * 2b3a, the isolated probe's, its own job (before 2b3a the probe ran inside the check job, so its time was the check's).
 * Every reported Lean duration of a check or a session view is this sum.
 */
export function leanDurationMs(facts: LeanFacts): number {
  return facts.build.durationMs + facts.check.durationMs + (facts.probe?.durationMs ?? 0);
}

/** `n.holds` for statement `n`. */
export function holdsName(statement: string): string {
  return `${statement}${HOLDS_SUFFIX}`;
}

/** The statement name of a `.holds` name, or undefined. */
export function statementOfHolds(name: string): string | undefined {
  return name.endsWith(HOLDS_SUFFIX) && name.length > HOLDS_SUFFIX.length ? name.slice(0, -HOLDS_SUFFIX.length) : undefined;
}
