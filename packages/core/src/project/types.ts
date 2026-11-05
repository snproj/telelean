/**
 * The project model: every subject's nodes with derived statuses, the computed vocabulary and the diagnostics,
 * built from the parsed model files plus the latest Lean facts (03 section 2 "Building the graph", steps 1-5).
 *
 * FROZEN CONTRACT (M1, docs/m1-plan.md section 5.3). WP-model owns it; additive optional fields only.
 */
import type { LeanFacts, DeclFacts } from '../facts.js';
import type { Layout } from '../layout.js';
import type { BoardDiagnostic, SemanticSummary, SubjectInfo, TlNode, VocabItem } from '../model.js';
import type { DeclInfo, MarkupBlock, ParsedFile } from '../markup/types.js';

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
