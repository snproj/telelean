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

/**
 * The two kinds of the markup `type:` field (spec v4, Terms), in column order: an AXIOM is something you hold (its
 * `.holds` is a Lean `axiom`), a PROPOSITION is derived or to be derived (its `.holds` is a theorem, an axiom while it
 * is pending proof, or missing).
 */
export type NodeType = 'AXIOM' | 'PROPOSITION';

/** Column order of the board: Axioms | Propositions. */
export const NODE_TYPES: readonly NodeType[] = ['AXIOM', 'PROPOSITION'];

export function isNodeType(value: unknown): value is NodeType {
  return value === 'AXIOM' || value === 'PROPOSITION';
}

/** The kinds before spec v4, still read as aliases (B.6, A19): never rewritten except by a kind change. */
export type NodeTypeAlias = 'ASSUMPTION' | 'DERIVATION' | 'GOAL';

const KIND_OF_ALIAS: Readonly<Record<NodeTypeAlias, NodeType>> = { ASSUMPTION: 'AXIOM', DERIVATION: 'PROPOSITION', GOAL: 'PROPOSITION' };

/**
 * Reads a `type:` value (docs/slice1-plan.md 2.1): AXIOM or PROPOSITION, or an old kind as an alias (ASSUMPTION ->
 * AXIOM; DERIVATION and GOAL -> PROPOSITION), with `alias` naming the old kind. Case-insensitive, as the parser has
 * always been (it reports a value that is not upper case with the TL019 hint); undefined for anything else.
 */
export function parseNodeType(raw: string): { type: NodeType; alias?: NodeTypeAlias } | undefined {
  const upper = raw.toUpperCase();
  if (isNodeType(upper)) return { type: upper };
  if (upper === 'ASSUMPTION' || upper === 'DERIVATION' || upper === 'GOAL') return { type: KIND_OF_ALIAS[upper], alias: upper };
  return undefined;
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
  /** Kind of the `n.holds` declaration: `axiom` (an axiom card's assumption, or a proposition pending proof) or `theorem`. */
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
  | 'stale'
  | 'broken'
  | 'depends-on-removed'
  | 'no-rationale'
  | 'signoff-stale'
  | 'definitional-choice'
  | 'existence-commitment'
  // M1 additions (docs/m1-plan.md section 6.3)
  /** A proof uses the `.holds` axiom of a PROPOSITION that is pending proof (spec v4 AR-6; was `rests-on-claimed`). */
  | 'rests-on-pending'
  /** An AXIOM whose `.holds` is a theorem: "has a proof" (TL106). */
  | 'provable-assumption'
  /** A formalised AXIOM without `axiom n.holds` (TL117). */
  | 'missing-holds'
  /** The justification's footprint contains `sorryAx` (TL115). */
  | 'uses-sorry'
  /** `n.holds` does not state `n` (nor `h1 -> ... -> n`) (TL114). */
  | 'holds-mismatch'
  /** Lean has not checked this node: its module failed or is not imported, or there are no facts yet. */
  | 'not-checked'
  /**
   * Spec v4 B.5 / BD-6 (the green glow): a PROPOSITION proved with no hypotheses, no `sorry` and no hidden axiom
   * (TL103), resting only on AXIOM cards (and presuppositions), never on a pending proposition; with fresh facts and
   * no mismatched `.holds` (TL114) on it, on the cards it rests on, or on the cards its proof reaches (docs/slice1-plan.md
   * section 8, S-3 and S-9).
   */
  | 'established'
  /**
   * Spec v4.1 B.2's cross-check (slice 1d): the footprint holds a card's `.holds` that neither direct(v) nor what the
   * cards in direct(v) rest on explains, so the proof uses that card in a way the arrows do not show (TL123; the
   * card's band gets no ✓). `DerivedStatus.direct.unseen` names the cards.
   */
  | 'uses-unseen';

/**
 * Spec v4.1 B.2 and BD-7 (slice 1d): what the board knows of direct(v), the cards a proved or conditional card's proof
 * uses directly (the solid arrows into it, and the band's members).
 */
export interface DirectUses {
  /** direct(v), every subject's cards (the board's verified edges keep only its own subject's), in the walk's order. */
  ids: string[];
  /**
   * `proof`: from the elaborated proof (`DeclFacts.valueConsts`); `source`: from the source text's `.ilean` references
   * only (facts from before slice 1d, or a failed value probe), which miss a `@[simp]` lemma or an instance that
   * elaboration inserted, so no band gets its ✓ (BD-7).
   */
  from: 'proof' | 'source';
  /** B.2's cross-check: the cards behind the `uses-unseen` flag. */
  unseen?: string[];
}

/**
 * `footprint` (proved, and optionally conditional) = the nodes whose `.holds` axiom the proof rests on, from
 * `#print axioms` (transitively, so a proposition proved by a theorem never appears in it: what it rests on does),
 * plus `presup:<Lean name>` entries (docs/m1-plan.md section 6.3). `on` = the unproved nodes taken as hypotheses.
 * `assumed` = an AXIOM card's `axiom n.holds`; `pending` = a PROPOSITION's `axiom n.holds` (pending proof, AR-6).
 */
export type ProofStatus =
  | { kind: 'none' }
  | { kind: 'assumed' }
  | { kind: 'pending' }
  | { kind: 'conditional'; on: string[]; footprint?: string[] }
  | { kind: 'proved'; footprint: string[] };

/** A product of dimensions, not a ladder (D-15). Computed, never written to disk. */
export interface DerivedStatus {
  formal: 'informal' | 'formalized' | 'ill-formed';
  proof: ProofStatus;
  certificates: { consistency: Cert; nonVacuity: Cert; independence?: Cert };
  flags: StatusFlag[];
  /** Slice 1d (optional, additive): direct(v), for a proved or conditional card only (see `DirectUses`). */
  direct?: DirectUses;
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
  /** Declared joint support (D-13): drawn as dashed arrows into this node (spec v4: the Dependencies field, AR-4). */
  premises: string[];
  /**
   * Spec v4 AR-5: the card is marked "follows from nothing" (`follows_from: nothing`, B.6). Set only when true, and
   * never together with `premises` (TL023: the arrows win).
   */
  fromNothing?: boolean;
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
 * `premise` = declared support (`premises:`, dotted). `verified` = the target's `.holds` proof uses the source's
 * `.holds` (or takes the source's statement as a hypothesis: `conditional`), found from the constants of the
 * elaborated proof (slice 1d, spec v4.1 B.2; the `.ilean` references of the proof while those facts are missing),
 * following untracked lemmas until the first node: so a proposition proved through another proposition gets the edge
 * from that proposition, not from what that one rests on (docs/m1-plan.md section 6.3). `lean-ref` = the target's
 * statement mentions the source's statement.
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

/** One item of the computed Vocabulary group at the top of the Axioms column (D-3). */
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
  /**
   * Spec v4 BD-3 (slice 1b; optional, additive): the canvas positions the user stored for this board's propositions
   * (`layout.json`, by card id). Absent when none is stored; the board places the other propositions itself (1c).
   */
  positions?: Record<string, { x: number; y: number }>;
}
