/**
 * Markup language v1 and Lean source text (03 section 3; 02 D-8, D-9): the types shared by the lexer, parser,
 * binder, serializer and the text-edit primitives (WP-markup), and consumed by the graph builder and the edit
 * planner (WP-model) and the runner workspace (WP-workspace).
 *
 * FROZEN CONTRACT (M1, docs/m1-plan.md section 5.2). WP-markup owns this file but may only add OPTIONAL fields or new
 * exports (record them in the plan's change log); renames/removals go through the integrator.
 *
 * Offsets (`Span`) are UTF-16 code-unit indices into `ParsedFile.text` (JavaScript string indices), end exclusive.
 * Ranges follow the LSP convention (0-based line, UTF-16 character). Paths are POSIX, relative to the model root.
 */
import type { Evidential, NodeType, Range, Severity, Stance } from '../model.js';

export interface Span {
  readonly start: number;
  readonly end: number;
}

// ---------------------------------------------------------------------------------------------
// Lexer (Lean 4.35 comment/string rules: nested `/- -/`, `--` line comments, strings, chars, raw strings, «»)

export type CommentKind =
  /** `-- ...` */
  | 'line'
  /** `/- ... -/` (the only kind that can hold a telelean block) */
  | 'block'
  /** `/-- ... -/` docstring */
  | 'doc'
  /** `/-! ... -/` module docstring */
  | 'moddoc';

export interface LeanComment {
  kind: CommentKind;
  /** From the opener to just after the closer (or EOF when unterminated). */
  span: Span;
  /** The text between opener and closer. */
  body: Span;
  unterminated: boolean;
}

export type TokenKind = 'ident' | 'string' | 'char' | 'number' | 'symbol';

/** A code token outside comments (identifiers are dotted, with «escaped» parts; symbols are single characters). */
export interface LeanToken {
  kind: TokenKind;
  span: Span;
  text: string;
}

export interface LexResult {
  comments: LeanComment[];
  tokens: LeanToken[];
}

// ---------------------------------------------------------------------------------------------
// Blocks

export const MARKUP_VERSION = 1;
/** Markup versions this build interprets (a newer block is kept and shown, with TL008). */
export const SUPPORTED_MARKUP_VERSIONS: readonly number[] = [1];

/** Field keys with a meaning in v1 (03 section 3.2). `kind` is accepted as an alias of `type` and normalised. */
export type KnownFieldKey =
  | 'id'
  | 'type'
  | 'natural_name'
  | 'rationale'
  | 'stance'
  | 'source'
  | 'asserted'
  | 'premises'
  | 'lean'
  | 'supersedes'
  | 'refines'
  | 'tags'
  | 'origin'
  | 'session'
  | 'worded_by';

/** Canonical order in which the serializer writes known fields. */
export const FIELD_ORDER: readonly KnownFieldKey[] = [
  'id',
  'type',
  'natural_name',
  'rationale',
  'stance',
  'source',
  'premises',
  'asserted',
  'lean',
  'supersedes',
  'refines',
  'tags',
  'origin',
  'session',
  'worded_by',
];

/** The interpreted values of the known fields of one block. */
export interface BlockFields {
  type?: NodeType;
  naturalName?: string;
  rationale?: string;
  stance?: Stance;
  source?: Evidential;
  /** ISO date `YYYY-MM-DD`. */
  asserted?: string;
  premises?: string[];
  /** Pinned binding: fully-qualified names as written (the first is the statement). */
  lean?: string[];
  supersedes?: string;
  refines?: string;
  tags?: string[];
  origin?: 'user' | 'agent';
  session?: string;
  wordedBy?: 'user' | 'agent';
}

/** One `key: value` line of a block, as written. */
export interface FieldLine {
  /** Normalised key (`kind` -> `type`); dotted extension keys verbatim. */
  key: string;
  /** The key as written. */
  writtenKey: string;
  /** The whole line, from its first character up to (not including) its line break. */
  span: Span;
  /** The raw value text (after `:` and surrounding spaces). */
  valueSpan: Span;
  raw: string;
}

export interface BlockBinding {
  /** `pinned`: a `lean:` field; `adjacent`: the next declaration (no blank line in between); `none`: code-less. */
  mode: 'none' | 'adjacent' | 'pinned';
  /** Fully-qualified name of the statement declaration (the first `lean:` name, or the adjacent declaration's name). */
  statement?: string;
  /** All pinned names, fully qualified (a multi-name `lean:` field). */
  pinned?: string[];
  /** Index into `ParsedFile.decls` of the adjacent declaration. */
  adjacentDecl?: number;
  /** Index into `ParsedFile.decls` of a declaration that follows after a blank line (TL013 hint). */
  gapDecl?: number;
}

export interface MarkupBlock {
  /** The node id: as written, or derived from `natural_name` when absent (`idWritten: false`, TL112). */
  id: string;
  idWritten: boolean;
  version: number;
  fields: BlockFields;
  /** Dotted extension keys and unknown keys, verbatim values, in order of appearance (round-tripped untouched). */
  extensions: Record<string, string[]>;
  /** Markdown notes after `---`, dedented, with the `-\/` and `/\-` escapes kept. */
  body?: string;
  /** The whole `/- ... -/` comment. */
  span: Span;
  range: Range;
  markerSpan: Span;
  lines: FieldLine[];
  /** From the `---` line to the end of the body. */
  bodySpan?: Span;
  binding: BlockBinding;
  /**
   * Enclosing namespace components at the block, outermost first (from the file's `namespace`/`section`/`mutual`/`end`
   * commands; pinned names resolve against them). Optional: set by `parseLeanFile`.
   */
  namespace?: string[];
}

// ---------------------------------------------------------------------------------------------
// Declarations (syntactic; the semantic layer confirms them)

export type DeclKeyword =
  | 'axiom'
  | 'theorem'
  | 'lemma'
  | 'def'
  | 'abbrev'
  | 'opaque'
  | 'instance'
  | 'example'
  | 'inductive'
  | 'coinductive'
  | 'structure'
  | 'class'
  | 'class inductive'
  | 'class abbrev'
  | 'mutual';

/** A top-level declaration found by the header parser (docstring, `@[...]`, modifiers, keyword, name). */
export interface DeclInfo {
  keyword: DeclKeyword;
  /** The name as written (may be relative to the namespace); absent for anonymous instances, `example`, `mutual`. */
  name?: string;
  /** Resolved against the enclosing namespaces (`_root_.` honoured). */
  fullName?: string;
  /** Enclosing namespace components at the declaration, outermost first. */
  namespace: string[];
  /** `private`, `noncomputable`, ... in order. */
  modifiers: string[];
  /** Raw text of the `@[...]` attribute lists, if any. */
  attributes?: string[];
  /** Docstring text (inside `/-- -/`, trimmed). */
  docstring?: string;
  docSpan?: Span;
  /**
   * From the start of the docstring/attributes/modifiers to the end of the declaration's last non-blank line
   * (the declaration ends where the next top-level command or `end`/`namespace`/`section` starts, or a column-0
   * comment that is followed by such a command or by nothing; a column-0 comment followed by more indented code is
   * inside the declaration; docs/m1-plan.md section 6.1 lists the command starts).
   */
  span: Span;
  range: Range;
  keywordSpan: Span;
  nameSpan?: Span;
  /** Offset of the top-level `:=` (or `where`/`|`) that ends the signature; absent for axioms and bodiless opaques. */
  valueStart?: number;
}

export interface MarkupDiagnostic {
  /** TL001-TL099 (docs/m1-plan.md section 6.5). */
  code: string;
  severity: Severity;
  message: string;
  span: Span;
  range: Range;
  nodeId?: string;
}

/** One model file, parsed. Cheap enough to redo on every keystroke (research: ~145 ms for 27k lines in CPython). */
export interface ParsedFile {
  path: string;
  text: string;
  eol: '\n' | '\r\n';
  blocks: MarkupBlock[];
  decls: DeclInfo[];
  /** Module names imported by the header. */
  imports: string[];
  diagnostics: MarkupDiagnostic[];
}

/** Offset <-> position conversion for one text. */
export interface LineIndex {
  positionAt(offset: number): { line: number; character: number };
  offsetAt(position: { line: number; character: number }): number;
  readonly lineCount: number;
}

// ---------------------------------------------------------------------------------------------
// Writing

/** The fields of a block telelean writes (add-node; M2 proposals). */
export interface NewBlock {
  id: string;
  type: NodeType;
  naturalName: string;
  rationale?: string;
  stance?: Stance;
  source?: Evidential;
  premises?: string[];
  asserted?: string;
  lean?: string[];
  /** Extra `key: value` pairs written after the known fields (e.g. `origin`, dotted extensions). */
  extra?: Array<[string, string]>;
  /** Markdown notes after `---` (escaped by the serializer). */
  body?: string;
}

/** Replace `text[span.start, span.end)` by `newText`. Edits passed together must not overlap. */
export interface TextEdit {
  span: Span;
  newText: string;
}

export type InsertWhere =
  /** Before the `end <namespace>` that closes the file's last `namespace <namespace>`, else at end of file. */
  | { kind: 'end-of-namespace'; namespace: string }
  | { kind: 'end-of-file' }
  /** After the block with this id, and after the declarations bound to it. */
  | { kind: 'after-block'; blockId: string };

/**
 * A Lean text operation (planned by WP-model from the graph and the facts, applied by WP-markup to one file).
 * Names are fully qualified; `Span`s refer to the current text of the file the op is applied to.
 */
export type LeanOp =
  /** G->A, D->A (unproved): insert `axiom <short>.holds : <short>` on the line after the statement declaration. */
  | { op: 'add-holds-axiom'; statement: string }
  /** D->A: replace `theorem S.holds ... := proof` by `axiom S.holds : S`, archiving the theorem's text. */
  | { op: 'holds-theorem-to-axiom'; statement: string }
  /** A->G, D->G: delete `S.holds` (archived when it is a theorem). */
  | { op: 'remove-holds'; statement: string; archive: boolean }
  /** Delete any declaration (with its docstring), e.g. the statement abbrev on delete. */
  | { op: 'remove-decl'; name: string; archive: boolean }
  /**
   * D-11 rewrite of a dependent: add the binder ` (hypName : hypType)` RIGHT AFTER the declaration's name, before
   * any existing binders (so it becomes the FIRST explicit argument, and `apply-hypothesis`'s partial application
   * `(c h)` stays correct for callers that pass further arguments), and replace each span (an occurrence of the
   * removed `.holds`, from the facts' refs; a leading `@` included) by `hypName`.
   *
   * `applied` (optional, default 0): the removed `.holds` took that many explicit arguments (a conditional proof,
   * `theorem n.holds (h : a) : n`), so each occurrence must be the head of an application to exactly that many
   * plain identifiers in parentheses, `(n.holds h₁ … hₖ)` or `((n.holds h₁) h₂)`, and the whole application is
   * replaced by `hypName` (the hypothesis states `n` itself). Any other use is a problem (nothing is applied).
   */
  | { op: 'add-hypothesis'; decl: string; hypName: string; hypType: string; replace: readonly Span[]; applied?: number }
  /**
   * D-11 cascade: wrap each span (an occurrence of a dependent that gained a hypothesis) as `(<occurrence> <hypName>)`;
   * an `@` immediately before the occurrence is included in the wrap: `(@c hypName)`.
   */
  | { op: 'apply-hypothesis'; decl: string; hypName: string; replace: readonly Span[] }
  /**
   * D-11 D->A / G->A of a conditional proof: `n.holds` took `args` explicit arguments and becomes `axiom n.holds : n`,
   * so in `decl` each span (an occurrence of `n.holds`, a leading `@` included) must be the head of an application to
   * exactly `args` plain identifiers in parentheses, `(n.holds h₁ … hₖ)`, and the application is replaced by the
   * occurrence alone (`n.holds`). Any other use is a problem (nothing is applied).
   */
  | { op: 'drop-arguments'; decl: string; args: number; replace: readonly Span[] }
  /**
   * D-9 docstring mirror: set the declaration's docstring to `/-- text -/` (inserted when absent). `text` is
   * escaped like a block body (`-/` -> `-\/`, `/-` -> `/\-`): doc comments nest, so a raw `/-` would swallow code.
   */
  | { op: 'set-docstring'; decl: string; text: string };

/** A declaration's text removed by a LeanOp, for the attic. */
export interface ArchivedDecl {
  name: string;
  text: string;
}

export interface LeanOpsResult {
  edits: TextEdit[];
  archived: ArchivedDecl[];
  /** Ops that could not be applied (e.g. the declaration was not found), as user-facing sentences. Non-empty = do not apply. */
  problems: string[];
}
