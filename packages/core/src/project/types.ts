/**
 * The project model: every subject's nodes with derived statuses, the computed vocabulary and the diagnostics,
 * built from the parsed model files plus the latest Lean facts (03 section 2 "Building the graph", steps 1-5).
 *
 * FROZEN CONTRACT (M1, docs/m1-plan.md section 5.3). WP-model owns it; additive optional fields only.
 */
import type { LeanFacts, DeclFacts } from '../facts.js';
import type { Layout } from '../layout.js';
import type { BoardDiagnostic, Range, SemanticSummary, SubjectInfo, TlNode, VocabItem } from '../model.js';
import type { DeclInfo, DeclKeyword, MarkupBlock, ParsedFile, Span } from '../markup/types.js';

/**
 * Slice 2 (docs/slice2-plan.md 4.7, 2c1; additive): the RV-6 base mask as the build applies it, so no hidden proof text
 * reaches a graph. Made from core's `BaseMask` by `projectMaskOf` (review/mask.ts), with the masked facts (`maskFacts`)
 * as the input's `facts`. The texts and positions stay the working copy's: a masked declaration is left out of the
 * model (no binding, vocabulary item, code, user or diagnostic of its own), and a card's code is composed without it.
 * The model's files list only what the mask keeps; a card's `ModelNode.block` keeps the working copy's fields, and its
 * masked arrows and mark are its node's `premises` and `fromNothing`. Each block's binding, and the parser's TL013 and
 * TL014 hints, are read as the parser reads the file without what the mask leaves out (fixer 2c1 r1).
 */
export interface ProjectMask {
  /** `.holds` declarations of targets B had none for (`BaseMask.holds` `absent`): left out, so the card has no proof. */
  absent: readonly string[];
  /**
   * A target's `.holds` under `BaseMask.holds` `base`, by name: the card's code takes B's `text` in place of the
   * working copy's declaration, and its refs (B's facts, from `maskFacts`) are placed against `range`, B's range of it,
   * so the card's code-relative refs are B's (AF6). `joined`: B's text between the card's statement and this `.holds`
   * when B's code held both as one stretch (the same file, with only blank lines and comments between); absent, they
   * are two pieces, as B showed them. `keyword` (fixer 2c1 r1, S-V2C1-S2): B's keyword of it, which the build reads in
   * place of the working copy's wherever facts do not decide the kind (no usable facts, a stale file), so a proof the
   * step wrote never shows as a theorem.
   */
  codeOverride: Readonly<Record<string, { text: string; range: Range; keyword: DeclKeyword; joined?: string }>>;
  /**
   * (Fixer 2c1 r1, C-V2C1-C3; additive) Every other card whose statement and `.holds` the working copy has with B's
   * texts, by its `.holds` name: its code is composed as B composed it, the working copy's texts (B's) joined by
   * `joined`, B's text between them, or two pieces when B showed two. The working copy's text between them (a hidden
   * lemma, a comment or blank lines written with it, a target's `.holds` moved there) is never read.
   */
  codeLayout: Readonly<Record<string, { joined?: string }>>;
  /**
   * (Fixer 2c1 r1, C-V2C1-C2/C3; additive) By file: the lines of the working copy's text that go with a left-out
   * declaration or with a `codeOverride`'s `.holds` (a proof's comment goes with its Result), as computeItems reads them
   * (`compareTexts`): a comment line attached to one, and an enclosing line (`namespace`/`section`/`mutual`, `end`) all
   * of whose declarations are such. Left out with them.
   */
  lines: Readonly<Record<string, readonly Span[]>>;
  /** Declarations left out: every proof-phase declaration (`BaseMask.drop`) and the declarations of `dropNodes`. */
  drop: readonly string[];
  /** Claude's arrows (`BaseMask.dropArrows`): left out of their targets' `premises:`. */
  dropArrows: ReadonlyArray<{ source: string; target: string }>;
  /** Written premise cards (`BaseMask.dropNodes`): their blocks left out, with their arrows into any card. */
  dropNodes: readonly string[];
  /**
   * Cards whose `follows_from: nothing` a written premise removed (ledger `mark-removed`) and B had: shown with the mark
   * again when no arrow into them stays.
   */
  restoreMarks: readonly string[];
  /**
   * By the id the working copy's block writes: cards whose `id:` line only telelean's hidden writes (an arrow, a written
   * premise or its mark removal into them) wrote back over the id B derived, with that id. Read as derived again, with
   * the parser's TL112, as in B.
   */
  derivedIds: Readonly<Record<string, string>>;
}

export interface ProjectInput {
  /** Every model file of the project (`<library>.lean`, `<library>/**.lean`), parsed (open buffers preferred to disk). */
  files: readonly ParsedFile[];
  /** sha256 (hex) of each file's current text, by path: compared with `facts.modules[].sourceSha256`. */
  fileHashes: Readonly<Record<string, string>>;
  /** The latest Lean facts, possibly stale for some files, or absent. */
  facts?: LeanFacts;
  /** The Lake library holding the subjects (`.telelean/config.json`, default `Model`). */
  library: string;
  /**
   * The project's lakefile (`lakefile.toml`, else `lakefile.lean`), when the caller read it: used for TL110
   * (`autoImplicit` on). Optional (integrator addition, docs/m1-plan.md section 14); absent = no TL110 check.
   */
  lakefile?: { path: string; text: string };
  /**
   * Slice 2 (docs/slice2-plan.md 2.6, D2-18, EN-3; 2c1; additive): each subject's endorsed definitions, by subject
   * (`.telelean/subjects/<S>/endorsements.json`'s `endorsed`, read by the runner's ModelWorkspace, 2f). A definition of
   * subject S whose name and `endorsementHash` of its source text (`VocabItem.code`) an entry of S holds loses
   * `definitional-choice`, and so does a card none of whose definitions still needs it. Absent: none endorsed.
   */
  endorsements?: Readonly<Record<string, ReadonlyArray<{ name: string; textHash: string }>>>;
  /** Slice 2 (docs/slice2-plan.md 4.7, 2c1; additive): the RV-6 base mask (`ProjectMask`); absent: no mask. */
  mask?: ProjectMask;
}

/** One node with where it lives. */
export interface ModelNode {
  /** The node as the board shows it (status derived; `lean` filled from code + facts). */
  readonly node: TlNode;
  /** Path of the file holding the block. */
  readonly file: string;
  readonly block: MarkupBlock;
  /** The bound statement declaration (syntactic), if found in `file` or another project file. */
  readonly statementDecl?: { file: string; decl: DeclInfo };
  /** The `n.holds` declaration (syntactic), if any. */
  readonly holdsDecl?: { file: string; decl: DeclInfo };
}

export interface ProjectModel {
  readonly library: string;
  /** Subjects in name order (a subject exists when `<library>/<S>/` holds a .lean file or `<library>/<S>.lean` exists). */
  readonly subjects: readonly SubjectInfo[];
  /** Every node of every subject, by id (workspace-unique ids; duplicates are reported, the first wins). */
  readonly nodes: ReadonlyMap<string, ModelNode>;
  readonly files: ReadonlyMap<string, ParsedFile>;
  readonly facts?: LeanFacts;
  /** Files whose current hash matches the facts (their positions and statuses are trustworthy). */
  readonly freshFiles: ReadonlySet<string>;
  /** Vocabulary of every subject. */
  readonly vocabulary: readonly VocabItem[];
  /** Markup, Lean and graph diagnostics of every subject (each with `file` and, when known, `nodeId`). */
  readonly diagnostics: readonly BoardDiagnostic[];
  /** Facts by fully-qualified declaration name. */
  readonly declFacts: ReadonlyMap<string, DeclFacts>;
  /** Fully-qualified declaration name -> id of the node that binds it (statement and `.holds`). */
  readonly ownerOfDecl: ReadonlyMap<string, string>;
}

export interface SubjectGraphOptions {
  /** The graph version (the board's publish counter). */
  version: number;
  /** The subject's layout.json. */
  layout?: Layout;
  /** State of the Lean check, passed through to the board. */
  semantic: SemanticSummary;
}
