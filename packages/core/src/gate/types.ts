/**
 * The prototype gate's pure rules (03 section 8.5 as cut down by the Prototype profile of 02; amendment A2; docs/m2-plan.md
 * section 3): G0 token denylist and file rules, the D-5 permitted set computed from the freeze, G3 (footprints, no
 * sorry, simple vocabulary rule, no new axioms), G5's markup half, and the readiness rules of freeze_statements.
 * Everything here works on texts and ProjectModels (core's `buildProjectModel` over the shadow's parsed files plus the
 * Lean facts the runner produced in the build mirror); nothing runs Lean. G1 (the sandboxed build) and G4 (lake
 * comparator) run in the runner (WP2), which turns their outcomes into findings of the same shape.
 *
 * FROZEN CONTRACT (M2, docs/m2-plan.md sections 0 and 3). Owner: WP1. Additive optional fields / new exports only, recorded
 * in the plan's change log (section 14).
 */
import type { Range } from '../model.js';
import type { FileChange } from '../actions.js';
import type { ProjectModel } from '../project/types.js';
import type { GateStepId, LifecycleItem, PermittedSummary } from '../run.js';

/** Why a gate step (or a check_lean / freeze_statements rule) failed. One code per kind of finding. */
export type GateFindingCode =
  // ---- G0: token denylist over the agent's changed text, and file rules (before any Lean process sees the text)
  /** `#eval`, `#exit`, `#reduce`, … (any `#` command but `#check` and `#print`). */
  | 'hash-command'
  /** `initialize`, `builtin_initialize`, `run_cmd`/`run_elab`/`run_meta`, `macro`, `macro_rules`, `syntax`, `notation`, `infix(l|r)`, `prefix`, `postfix`, `elab`, `elab_rules`, `declare_syntax_cat`. */
  | 'metaprogramming'
  /** `native_decide`, `decide +native`, `bv_decide`, `implemented_by`, `extern`, `csimp`, `ofReduceBool`, `ofReduceNat`. */
  | 'native-code'
  /** `unsafe`, `partial`. */
  | 'unsafe'
  /** Any `set_option` (limits such as maxHeartbeats, `debug.*`, `autoImplicit`, …): the prototype allows none in agent text. */
  | 'set-option'
  /** `sorry`, `admit`. */
  | 'sorry'
  /** An `import` of a module outside the project's library (e.g. `import Lean`). */
  | 'import'
  /** `lakefile.toml`, `lakefile.lean`, `lean-toolchain` or `lake-manifest.json` changed. */
  | 'project-file'
  /** A file outside `<library>/<S>/` and `<library>/<S>.lean` changed, was added or deleted. */
  | 'outside-subject'
  /** A model file was deleted. */
  | 'deleted-file'
  /** A new file that is not `<library>/<S>/<Module>.lean` with a valid module name, or not a regular file. */
  | 'bad-path'
  // ---- G1: the sandboxed build (runner)
  /** Lean reported an error (the finding carries Lean's whole message, continuation lines included). */
  | 'build'
  /** The build ran out of time (job cap) or memory (cap): counted against the agent. */
  | 'budget'
  // ---- G3: footprints, sorry, vocabulary, axioms (from the shadow's Lean facts)
  /** finish(proved) but the target's `.holds` is missing, not a theorem, conditional (takes hypotheses) or uses sorry. */
  | 'not-proved'
  /**
   * A proof (the target's, or any theorem added in the run) rests on an axiom outside the permitted set; or (fixer round
   * 1, token `no-facts`) a declaration added or changed in the run has no Lean facts, so it cannot be checked. Fixer
   * round 2: every declaration added or changed in the run is judged whatever its kind or type (a def, instance or
   * structure can carry a proof: `def h : PLift p := ⟨p.holds⟩`, a field defaulting to `p.holds`), and so is every
   * name only Lean reports inside one (a `where` declaration, a structure's field); anything but a proof may also rest
   * on the vocabulary's existence presuppositions. Fixer round 3 (token `example`): after the round's freeze, an
   * `example` added since B, in every purpose (a proof without a name: nothing can check what it rests on).
   */
  | 'footprint'
  /** `sorryAx` in a declaration of a changed file. */
  | 'sorry-axiom'
  /**
   * An axiom added after the freeze; before it, an axiom added since B that is neither the `.holds` of a selected
   * ASSUMPTION/ghost nor vocabulary of its own (fixer round 1: whatever its type, so also a card's "statement" written
   * as an axiom directly below its block, e.g. `axiom x : Empty`).
   */
  | 'new-axiom'
  /** New vocabulary breaking the simple shape rule (D-3 prototype: TL111 / an `other` item). */
  | 'vocabulary-shape'
  /** A declaration that existed before the run changed (other than the target's `.holds`). */
  | 'existing-changed'
  /** A frozen statement or vocabulary declaration changed after the freeze (early warning; G4 is authoritative). */
  | 'statement-changed'
  /**
   * Reviewer addition (docs/m2-plan.md section 3.3): finish with a status other than `proved` while the files hold a
   * `theorem T.holds` added or changed in this run. Forces the `proved` path (freeze + G4) or the proof's removal, so
   * no unchecked proof of the target reaches a proposal.
   */
  | 'status-mismatch'
  // ---- freeze readiness / stage rules (check_lean, freeze_statements, finish)
  /**
   * The target or a selected premise has no Prop statement abbrev bound to its block (readiness: freeze and
   * finish(proved)); in every purpose (fixer round 1), a selected card bound in this run to something that is not a Prop
   * statement abbrev/def (TL101/TL113).
   */
  | 'not-formalised'
  /** A selected ASSUMPTION (or adopted ghost) has no `axiom n.holds : n`, or its `.holds` does not state `n`. */
  | 'missing-holds'
  /**
   * A theorem was added in this round before freeze_statements succeeded (D-19: no proof bodies before the freeze);
   * fixer round 2 (token `carrier`): or a declaration that is not a proof but carries one, i.e. rests on more than the
   * vocabulary layer (standard axioms, signature, existence presuppositions), e.g. `def h : PLift p := ⟨p.holds⟩`.
   * Token `example`: an `example` added since B while the round has no freeze, in every purpose (fixer round 3; it
   * was judged only in check (formalise) and freeze, so a "not proved" finish could carry one into the user's files).
   */
  | 'proof-before-freeze'
  /** finish(proved) in a round without a successful freeze_statements. */
  | 'not-frozen'
  // ---- G4: lake comparator against the freeze (runner maps `ComparatorVerdict` reasons)
  | 'comparator-illegal-axiom'
  | 'comparator-statement-mismatch'
  /** M0 lesson 2 wording: "a definition the frozen statement depends on changed". */
  | 'comparator-definition-mismatch'
  | 'comparator-kind-mismatch'
  | 'comparator-missing'
  | 'comparator-kernel'
  | 'comparator-build'
  | 'comparator-export'
  // ---- G5: markup policy (the user's words byte-identical, ids stable, blocks neither added nor removed)
  | 'markup';

/** One failed rule, for the agent (exact) and the board (plain, via `describeFinding`). */
export interface GateFinding {
  step: GateStepId;
  code: GateFindingCode;
  /** Exact, for Claude's retry prompt: names, `file:line:col`, Lean's whole message, what to do. */
  message: string;
  /** Lean names involved (axioms used, declarations changed, …), fully qualified. */
  names?: string[];
  /** The card concerned, if any. */
  nodeId?: string;
  /** POSIX path relative to the model root (= the shadow root). */
  file?: string;
  range?: Range;
  /**
   * The offending token or path (G0). WP1 addition (doc only): on other findings, a short marker of the variant the
   * board's sentence depends on (`describeFinding`): `markup` the block field concerned (`natural_name`, `lean`, …) or
   * `binding` / `formalised` / `block` / `removed` / `moved` / `telelean`; `existing-changed` `target` (the target's
   * statement), `removed`, `meaning`, `ghost`; `not-proved` `missing` / `axiom` / `sorry` / `mismatch` / `conditional` /
   * `unchecked`; `new-axiom` `belief` / `after-freeze`, and (fixer round 1) `statement` (an axiom bound to a card as its
   * statement) / `unclassified` (an axiom that is neither vocabulary nor a selected `.holds`); `footprint` `no-facts`
   * (fixer round 1: a declaration of the run Lean reported nothing about, e.g. `private`, so it cannot be checked);
   * `not-formalised` `malformed` (fixer round 1: bound to something that is not a Prop statement); `build` `not-built`;
   * `proof-before-freeze` `example`, and (fixer round 2) `carrier` (a declaration that is not a proof but carries one);
   * (fixer round 3) `footprint` `example` (an `example` added after the round's freeze).
   */
  token?: string;
}

/** What G0 needs to know about the project. */
export interface G0Context {
  /** The Lake library holding the subjects (`.telelean/config.json`), e.g. `Model`. */
  library: string;
  /** The run's subject: only `<library>/<subject>/**` and `<library>/<subject>.lean` may change. */
  subject: string;
  /** Module names of the project's library in the CURRENT files (allowed imports, new subject modules included). */
  projectModules: ReadonlySet<string>;
}

/** The selection a round proves from (D-5), with its target. Node ids. */
export interface Selection {
  subject: string;
  target: string;
  /** The user's selected premises (may be empty: "Self-evident?"). */
  premises: readonly string[];
  /** ASSUMPTION cards created by adopting ghosts in this run (they count as selected, D-6). */
  adoptedGhosts: readonly string[];
}

/** D-5 permitted axioms, computed from the frozen snapshot (docs/m2-plan.md section 3.2). */
export interface PermittedAxioms extends PermittedSummary {
  /** Sorted, distinct union of the categories: comparator's `permitted_axioms`. */
  all: string[];
}

/** What the rules remember of a freeze (the runner keeps it in the run state; JSON-serialisable). */
export interface FrozenSnapshot {
  round: number;
  permitted: PermittedAxioms;
  /** Fully-qualified target statement name, e.g. `Spyro.cynder_not_good`. */
  targetStatement: string;
  /**
   * `#check` type and `#print` value (facts `type` / `value`) of every declaration of the subject's modules at the
   * freeze (statements, vocabulary, definitions), by fully-qualified name: "statement-changed" compares against it.
   */
  declarations: Record<string, { kind?: string; type?: string; value?: string }>;
  /** Every axiom declared in the frozen project (by name): an axiom not in this list after the freeze is "new-axiom". */
  axioms: string[];
}

/** What the rules are evaluated for. */
export type RulePurpose =
  /** check_lean: report everything, block nothing (findings become `CheckResult.violations`). */
  | 'check'
  /** freeze_statements: readiness (formalised, `.holds` axioms, shapes, no proof bodies, markup). */
  | 'freeze'
  /** finish with status `proved`: everything incl. the target proof and footprints. */
  | 'gate-proved'
  /**
   * finish with any other status: nothing is claimed proved, the files must still be clean: every theorem added in the
   * run rests only on the permitted set (the round's freeze, else computed from `current`; fixer round 2: every other
   * declaration added in the run too, plus the existence presuppositions), and no `theorem T.holds` was added or
   * changed (`status-mismatch`); fixer round 3: and no `example` was added (in every purpose). The readiness rules
   * (`not-formalised`, `missing-holds`) do not apply.
   */
  | 'gate-other';

export interface RuleInput {
  purpose: RulePurpose;
  selection: Selection;
  /** The stage the round is in (D-19). */
  stage: 'formalise' | 'prove';
  /**
   * B: the user's files exactly as they were at run start (the shadow's `base` commit), or, for Accept's re-check
   * after the real files drifted, the user's files at Accept (the `accept-base` commit), parsed, with B's facts from
   * the runner's base check when available (absent for `accept-base`; syntactic declarations suffice for G0, G5 and
   * the declaration diff). With facts, `existing-changed` also compares each B declaration's facts `type`/`value`.
   * Reviewer change (docs/m2-plan.md section 3): B no longer includes telelean's adopted-ghost text; that text is
   * checked against `adopted` instead, so no synthetic "base plus adoptions" model is needed.
   */
  base: ProjectModel;
  /**
   * The shadow at its newest `adopt` commit (absent when no ghost was adopted in this run): every block in
   * `teleleanBlocks` and its statement abbrev and `.holds` axiom must still equal their text there (G5 and
   * `existing-changed` for telelean's own additions).
   */
  adopted?: ProjectModel;
  /** The shadow now, parsed, with the build mirror's FRESH facts (a stale or failed build is reported as G1 first). */
  current: ProjectModel;
  /** The shadow at the start of this round (round > 1: Feedback or adoption), for proof-before-freeze. Default: `base`. */
  roundStart?: ProjectModel;
  /** The round's freeze, once freeze_statements succeeded. */
  freeze?: FrozenSnapshot;
  /**
   * Node ids whose block telelean itself added in this run (adopted ghosts): G5 accepts them as new blocks as long as
   * they equal their version in `adopted`.
   */
  teleleanBlocks: readonly string[];
}

/** A definition (or presupposition) introduced by the run that needs the user's yes/no (A2, D-4, D-3). */
export interface FlaggedDefinition {
  name: string;
  kind: 'definition' | 'presupposition';
  /** Source text with docstring. */
  code?: string;
  gloss?: string;
  /** Node ids whose statement closure contains it. */
  usedByStatementsOf: string[];
}

export interface RuleReport {
  /** Empty = every rule for this purpose holds. Order: G0, G1, G3, G5, then readiness codes. */
  findings: GateFinding[];
  /** Questions for the user, never failures. */
  flaggedDefinitions: FlaggedDefinition[];
  /** `#print axioms` of the target's `.holds` and of every theorem added in the run, fully qualified, by name. */
  footprints: Record<string, string[]>;
  /** Node ids (target, selected, ghosts) whose statement abbrev is new in this run (normalisation pins them). */
  formalisedThisRun: string[];
  /** Fully-qualified names of declarations added / changed / removed since `base` (syntactic, by name and text). */
  declarations: { added: string[]; changed: string[]; removed: string[] };
}

/** A ghost the user adopted ("I hold this"), to be written into the shadow by telelean (never by the agent). */
export interface GhostAdoptionRequest {
  subject: string;
  /** The target node: the ghost's block and declarations go right before the target's block (same file, same namespace). */
  target: string;
  /** Claude's sentence (kept verbatim; the block gets `worded_by: agent`, `origin: agent`). */
  naturalName: string;
  /** The Lean proposition (already elaborated by the ghost check). */
  leanStatement: string;
  /** Preferred short statement name (Claude's `lean_name`), used when it is a valid identifier and free. */
  leanName?: string;
  /** The user's optional "why I hold it" (D-14: encouraged, never required). */
  rationale?: string;
  /** The run id, written as `session:`. */
  session: string;
  /** `YYYY-MM-DD` for `asserted:`. */
  today: string;
}

export interface GhostAdoptionPlan {
  /** Whole-file changes to the shadow's files (the target's file). */
  changes: FileChange[];
  /** The new card's id (`deriveId` of the sentence, unique in the project). */
  nodeId: string;
  /** Fully-qualified statement name; its `.holds` axiom is `<leanName>.holds`. */
  leanName: string;
}

/** Context for turning findings into plain board sentences (A2 notices). */
export interface DescribeContext {
  /** The sentence of a card, by id (current board). */
  sentenceOf(nodeId: string): string | undefined;
  /** The card that binds a fully-qualified declaration name (statement or `.holds`), if any. */
  nodeOfDecl(name: string): string | undefined;
  /** Selected premise ids (to say "which you didn't select"). */
  selected: readonly string[];
}

/** Re-exported for the runner's convenience. */
export type { LifecycleItem };
