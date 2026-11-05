/**
 * The programmatic node representation (03 architecture, section 2), as the board and graph.json see it.
 * Field names match section 2 so later milestones add fields without renames.
 *
 * FROZEN CONTRACT (M1, docs/m1-plan.md section 5; M2 additions: `LeanBinding.externalUsers`, `TlGraph.attempts`,
 * docs/m2-plan.md section 6). Builders may only add OPTIONAL fields, and must record the addition in the plan's change
 * log; renames and removals go through the integrator.
 *
 * Deliberate differences from section 2:
 *  - `TlNode.loc` is optional: a node typed into the board exists before the host has written its markup block.
 *  - `LeanBinding` carries what the card shows (code, vocabulary uses, identifier refs, footprint), computed by
 *    core from the parsed files plus the runner's Lean facts.
 *  - `TlEdge.id` is a stable key for rendering and diffing; `TlEdge.mismatch` flags declared-vs-verified (D-13).
 *  - `TlGraph` is one subject's board: nodes, edges, the computed Vocabulary group (D-3), diagnostics and the state
 *    of the Lean check.
 */

import type { AttemptSummary } from './run.js';

/** The three kinds of the markup `type:` field, in column order. */
export type NodeType = 'ASSUMPTION' | 'DERIVATION' | 'GOAL';

/** Column order of the board: Assumptions | Derivations | Goals. */
export const NODE_TYPES: readonly NodeType[] = ['ASSUMPTION', 'DERIVATION', 'GOAL'];

export function isNodeType(value: unknown): value is NodeType {
  return value === 'ASSUMPTION' || value === 'DERIVATION' || value === 'GOAL';
}

/** Computed from Lean, never written by the user. */
export type Role = 'node' | 'vocabulary' | 'presupposition' | 'untracked';

/** D-14 stance chips: "I believe it" / "It's a rule or definition" / "Supposing, for argument". */
export type Stance = 'believe' | 'rule' | 'supposing';
export const STANCES: readonly Stance[] = ['believe', 'rule', 'supposing'];
/** D-14 evidential chips: observed / reported / inferred / common knowledge. */
export type Evidential = 'observed' | 'reported' | 'inferred' | 'common';
export const EVIDENTIALS: readonly Evidential[] = ['observed', 'reported', 'inferred', 'common'];

export interface Provenance {
  wordedBy: 'user' | 'agent';
  endorsed: boolean;
  origin: 'user' | 'agent';
  session?: string;
}

/** LSP convention: 0-based line, UTF-16 code-unit character. */
export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

/** Where the `@@ telelean` block lives. `file` is a POSIX path relative to the model root. */
export interface SourceLocation {
  file: string;
  range: Range;
  markupVersion: number;
}

/** A place in a model file (POSIX path relative to the model root). */
export interface FileRange {
  file: string;
  range: Range;
}

/**
 * An identifier occurrence inside `LeanBinding.code` that Lean resolved to a constant (from the `.ilean` index).
 * `range` is relative to the start of `code` (line 0 = the first line of `code`).
 */
export interface LeanRef {
  /** Fully-qualified constant name, e.g. `Spyro.HasDarkPast`. */
  name: string;
  range: Range;
  /** Set when the constant is a node's statement or `.holds`, this card's own included (hover shows that node's sentence). */
  nodeId?: string;
}

export interface LeanBinding {
  binding: 'none' | 'adjacent' | 'pinned';
  /** Fully-qualified Lean name `n` of the statement (`abbrev n : Prop := ...`). */
  statement?: string;
  /** Fully-qualified Lean name `n.holds`, when that declaration exists (an axiom, or a theorem once proved). */
  justification?: string;
  /** Kind of the `n.holds` declaration: `axiom` (assumed, or claimed while promotion is pending) or `theorem`. */
  justificationKind?: 'axiom' | 'theorem' | 'other';
  /** Source text of the bound declarations (docstring mirror, statement, `.holds`), shown when a card is expanded. */
  code?: string;
  /** Where `code` starts in its file (for "Open in editor" and for mapping refs). */
  codeLoc?: FileRange;
  /**
   * Vocabulary items (fully-qualified) the statement uses, in first-occurrence order: the statement's own
   * references first, then those reached through other nodes' statement abbrevs and through vocabulary
   * definitions (def/abbrev/structure bodies) — the statement closure (docs/m1-plan.md section 6.4).
   * Computed from Lean (`.ilean` references), never hard-coded. Absent when no Lean facts exist for the statement;
   * kept (by name) from the previous facts while its file is stale.
   */
  uses?: string[];
  /** Identifier occurrences in `code` (for hover glosses and click-to-highlight). Absent when the facts are stale for this file. */
  refs?: LeanRef[];
  /** Presupposition axioms (fully-qualified, e.g. `Spyro.Character.exists`) in the statement's footprint (D-3b; shown in the tray). */
  presupposes?: string[];
  /** Raw `#print axioms` footprint of the justification (fully-qualified names), for the expanded card. */
  axioms?: string[];
  /**
   * M2 (carry-over 1, docs/m2-plan.md section 9 WP1): declarations that use this card's statement or `.holds` but are
   * NOT cards on this board: lemmas without a card (any subject) and other subjects' cards. Computed by
   * `subjectGraph` from the whole project (facts refs, plus the text scan while files are stale, as D-11's `usersOf`);
   * the board's "Used by" list and the delete dialog's "Nothing else refers to it" use it together with the board's
   * own edges. Absent = nothing outside the board uses it (or no facts and no textual use).
   */
  externalUsers?: ExternalUser[];
}

/** A user of a card's Lean that the board does not show as a card (see `LeanBinding.externalUsers`). */
export interface ExternalUser {
  /** Fully-qualified declaration name. */
  name: string;
  /** The card that binds `name`, when it is another subject's card. */
  nodeId?: string;
  /** That card's subject. */
  subject?: string;
  /** That card's sentence (so the board can show it, as `DependentCard` does). */
  naturalName?: string;
  /** Where the use is: in a proof (`.holds` users) or in a statement (users of the statement abbrev). */
  where: 'proof' | 'statement';
}

export type Cert = 'none' | 'ok' | 'refuted';

export type StatusFlag =
  | 'self-evident'
  | 'unselected-used'
  | 'claimed'
  | 'stale'
  | 'broken'
  | 'depends-on-removed'
  | 'no-rationale'
  | 'signoff-stale'
  | 'definitional-choice'
  | 'existence-commitment'
  // M1 additions (docs/m1-plan.md section 6.3)
  /** A proof uses the `.holds` axiom of a DERIVATION whose promotion is pending (D-11 A->D). */
  | 'rests-on-claimed'
  /** A GOAL whose `.holds` is proved: offer "Make Derivation" (TL105). */
  | 'proved-goal'
  /** An ASSUMPTION whose `.holds` is a theorem (TL106). */
  | 'provable-assumption'
  /** A formalised ASSUMPTION without `axiom n.holds` (TL117). */
  | 'missing-holds'
  /** The justification's footprint contains `sorryAx` (TL115). */
  | 'uses-sorry'
  /** `n.holds` does not state `n` (nor `h1 -> ... -> n`) (TL114). */
  | 'holds-mismatch'
  /** Lean has not checked this node: its module failed or is not imported, or there are no facts yet. */
  | 'not-checked';

/**
 * `footprint` (proved, and optionally conditional) = the nodes whose `.holds` AXIOM the proof rests on, from
 * `#print axioms` (transitively, so a derivation proved by a theorem never appears in it: its own assumptions do),
 * plus `presup:<Lean name>` entries (docs/m1-plan.md section 6.3). `on` = the unproved nodes taken as hypotheses.
 */
export type ProofStatus =
  | { kind: 'none' }
  | { kind: 'assumed' }
  | { kind: 'pending-promotion' }
  | { kind: 'conditional'; on: string[]; footprint?: string[] }
  | { kind: 'proved'; footprint: string[] };

/** A product of dimensions, not a ladder (D-15). Computed, never written to disk. */
export interface DerivedStatus {
  formal: 'informal' | 'formalized' | 'ill-formed';
  proof: ProofStatus;
  certificates: { consistency: Cert; nonVacuity: Cert; independence?: Cert };
  flags: StatusFlag[];
}

export interface TlNode {
  id: string;
  type: NodeType;
  role: Role;
  subject: string;
  /** The user's sentence, verbatim. */
  naturalName: string;
  rationale?: string;
  body?: string;
  /** ISO date written when the node is added. */
  asserted?: string;
  stance?: Stance;
  source?: Evidential;
  /** Declared joint support (D-13): drawn as dashed arrows into this node. */
  premises: string[];
  supersedes?: string;
  refines?: string;
  provenance: Provenance;
  ext: Record<string, string>;
  loc?: SourceLocation;
  lean: LeanBinding;
  status: DerivedStatus;
}

export type EdgeType = 'premise' | 'verified' | 'lean-ref';

/**
 * `premise` = declared support (`premises:`, dashed). `verified` = the target's `.holds` proof uses the source's
 * `.holds` (or takes the source's statement as a hypothesis: `conditional`), found from the `.ilean` references of
 * the proof, following untracked lemmas until the first node: so a goal proved through a derivation gets the edge
 * from that derivation, not from the derivation's assumptions (docs/m1-plan.md section 6.3). `lean-ref` = the
 * target's statement mentions the source's statement.
 */
export interface TlEdge {
  /** Stable key, `${type}:${source}->${target}`. */
  id: string;
  type: EdgeType;
  /** The supporting node (premise, or dependency used by a proof). */
  source: string;
  /** The supported node. */
  target: string;
  origin: 'declared' | 'lean';
  where?: 'statement' | 'proof';
  /** A verified edge into a conditional proof: the source is taken as a hypothesis `(h : n)`. */
  conditional?: boolean;
  /** D-13 mismatch flags: a declared premise the proof does not use, or a node the proof uses without declaring it. */
  mismatch?: 'declared-unused' | 'used-undeclared';
}

export type Severity = 'error' | 'warning' | 'info' | 'hint';

/** A problem shown on the board (and in graph.json). Codes: TL001-TL099 markup, TL101-TL199 Lean/graph, TL2xx workspace, `LEAN` = a Lean message. */
export interface BoardDiagnostic {
  code: string;
  severity: Severity;
  message: string;
  file?: string;
  range?: Range;
  nodeId?: string;
  /** Fully-qualified name of the vocabulary item the diagnostic is about. */
  vocab?: string;
}

/**
 * What a computed vocabulary item is (D-3 simple shape check, docs/m1-plan.md section 6.4):
 * `sort` (`axiom T : Type`), `predicate` (`... -> Prop`, arity >= 0), `constant` (`opaque c : T`),
 * `function` (a data-valued function symbol), `presupposition` (`axiom T.exists : Nonempty T`),
 * `definition` (a def/abbrev/structure/inductive/instance without a block: needs endorsement, D-4),
 * `lemma` (a theorem without a block: proof-only, conservative), `unmarked-axiom` (a Prop-valued axiom without a
 * block: a hidden assumption, TL104), `other`.
 */
export type VocabKind =
  | 'sort'
  | 'predicate'
  | 'constant'
  | 'function'
  | 'presupposition'
  | 'definition'
  | 'lemma'
  | 'unmarked-axiom'
  | 'other';

export type VocabFlag =
  /** TL104: a Prop-valued axiom with no block. */
  | 'unmarked-assumption'
  /** TL111: violates the simple vocabulary shape rule. */
  | 'shape-violation'
  /** D-4: a definition on a statement path needs the user's endorsement. */
  | 'definitional-choice'
  /** Facts for its file are stale. */
  | 'stale'
  /** Added by a proposal (M2 "+3 new"). */
  | 'new';

/** One item of the computed Vocabulary group at the top of the Assumptions column (D-3). */
export interface VocabItem {
  /** Fully-qualified Lean name, e.g. `Spyro.HasDarkPast`. Unique within a graph. */
  name: string;
  /** The name relative to the subject namespace, e.g. `HasDarkPast` (what the board prints). */
  shortName: string;
  subject: string;
  kind: VocabKind;
  /** Pretty-printed type with full names (`#check`), e.g. `Spyro.Character → Prop`. */
  type?: string;
  /** Number of arguments, for predicates and functions. */
  arity?: number;
  /** The docstring (the gloss). */
  gloss?: string;
  /** Who worded the gloss: Claude's wording is shown italic with a marker (D-3). M1 has no agent: `user` unless recorded otherwise. */
  glossBy?: 'user' | 'agent';
  /** For a presupposition: the sort it says is non-empty (fully-qualified). */
  presupposes?: string;
  /** For a sort: its presupposition axiom (fully-qualified), if any. */
  presupposition?: string;
  loc?: FileRange;
  /** Source text of the declaration (with its docstring). */
  code?: string;
  /** Node ids whose statement closure uses this item. */
  usedBy: string[];
  flags: VocabFlag[];
}

/** State of the Lean check behind a board (docs/m1-plan.md section 4). */
export interface SemanticSummary {
  state:
    /** No facts yet (never checked, or Lean is not set up). */
    | 'unavailable'
    /** A build + check is running. */
    | 'checking'
    /** Facts match every file on screen. */
    | 'fresh'
    /** Facts exist, but some files changed since (see `staleFiles`). */
    | 'stale'
    /** The last check failed to run, or the build had errors (see `detail` and the diagnostics). */
    | 'failed'
    /** Refreshes are paused because MemAvailable is below the threshold. */
    | 'paused-low-memory'
    /** The project is not on the pinned toolchain: syntactic mode (D-7). */
    | 'unsupported-toolchain'
    /** Lean checking is switched off (setting) or the sandbox is unavailable. */
    | 'disabled';
  detail?: string;
  /** e.g. `leanprover/lean4:v4.35.0`. */
  toolchain?: string;
  /** ISO time the facts in use were produced. */
  checkedAt?: string;
  durationMs?: number;
  staleFiles?: string[];
  /** Number of Lean build errors in the facts in use. */
  errorCount?: number;
}

export interface SubjectInfo {
  /** The subject's name: its directory under the library (`Model/<name>/`) and its namespace. */
  name: string;
  nodeCount: number;
  /** Model files of the subject (POSIX, relative to the model root). */
  files: string[];
}

/** One published state of one subject's mental model. */
export interface TlGraph {
  /**
   * Increases with every publish (03 section 2, step 6), across subjects and across re-created workspaces of one
   * extension host (the runner seeds its counter from `Date.now()`), so the webview can drop queued older graphs.
   */
  version: number;
  subject: string;
  /** Column order is the order of the nodes of each type in this array (layout.json first, then file order). */
  nodes: TlNode[];
  edges: TlEdge[];
  /** The computed Vocabulary group (D-3), in display order. */
  vocabulary: VocabItem[];
  diagnostics: BoardDiagnostic[];
  semantic: SemanticSummary;
  /**
   * M2 (D-18 attempts history, docs/m2-plan.md section 6): this subject's "These suffice" rounds from
   * `.telelean/subjects/<S>/attempts.jsonl`, newest first, with their resolutions. Attached by the runner's workspace
   * after `subjectGraph` (core never reads sidecars); the expanded card lists those whose `target` is the card.
   */
  attempts?: AttemptSummary[];
}
