/**
 * WP1: the prototype gate's pure rules (docs/m2-plan.md sections 0 and 3). Signatures and documented behaviour are
 * FROZEN; the implementations live in the modules next to this file (g0, permitted, rules, normalise, adoption,
 * describe). Pure TypeScript: no Node or vscode APIs (the webview bundles core).
 */
import type { FileChange } from '../actions.js';
import type { LifecycleItem } from '../run.js';
import type { ProjectModel } from '../project/types.js';
import { adoptionPlan } from './adoption.js';
import { describe, notice } from './describe.js';
import { checkChangeSet, ghostProblems, scanForbiddenText } from './g0.js';
import { lifecycle, normalisation } from './normalise.js';
import { permittedAxioms, snapshotOf } from './permitted.js';
import { evaluate } from './rules.js';
import type {
  DescribeContext,
  FrozenSnapshot,
  G0Context,
  GateFinding,
  GhostAdoptionPlan,
  GhostAdoptionRequest,
  PermittedAxioms,
  RuleInput,
  RuleReport,
  Selection,
} from './types.js';

export * from './types.js';

/**
 * G0 token denylist over one Lean file's text (03 section 8.5 G0, prototype): `lexLean` tokens only, so words in
 * comments, strings and telelean blocks never count. Returns one `step: 'G0'` finding per offending token (codes
 * `hash-command`, `metaprogramming`, `native-code`, `unsafe`, `set-option`, `sorry`, `import`), with its range.
 * The exact token lists are in docs/m2-plan.md section 3.1.
 * `baseText` (reviewer addition): the same file in B (null/absent: a new file). A token on a line whose exact text
 * also occurs in `baseText` is the user's own and is not reported, up to that line's number of occurrences in B
 * (a line-multiset comparison; the extra occurrences, last first, are reported), so a user's own `set_option … in`
 * or `#eval` line never fails Claude's attempt just because Claude edited the same file.
 */
export function scanForbidden(file: string, text: string, ctx: G0Context, baseText?: string | null): GateFinding[] {
  return scanForbiddenText(file, text, ctx, baseText);
}

/**
 * Reviewer addition (docs/m2-plan.md sections 3.8 and 4.9): the "single term" rule for Claude's ghost text, used by
 * the runner's ghost check before any Lean runs and by `planGhostAdoption`. Returns one exact sentence per problem
 * (empty = acceptable):
 *   - `scanForbidden` findings in either text (G0 tokens);
 *   - a comment delimiter (`/-`, `-/`, `--`) or a `#` command token in either text;
 *   - a command keyword token in either text (`axiom`, `theorem`, `lemma`, `def`, `abbrev`, `example`, `instance`,
 *     `structure`, `class`, `inductive`, `opaque`, `namespace`, `section`, `end`, `universe`, `variable`, `import`,
 *     `attribute`, `mutual`, `deriving`, `noncomputable`, `private`, `protected`, `@[`), so the text cannot close the
 *     generated declaration and start another one;
 *   - in `statement`: a `:=` or `|` outside brackets, unbalanced brackets (a closing bracket with no opening one
 *     before it, or one left open at the end), or an empty text.
 * `proof` is optional (adoption checks only the statement).
 */
export function ghostTextProblems(statement: string, proof?: string): string[] {
  return ghostProblems(statement, proof);
}

/**
 * G0 over a whole change set: the file rules (`project-file`, `outside-subject`, `deleted-file`, `bad-path`) for
 * every path that differs between `base` and `current` (path -> text maps; `current` holds EVERY regular file of the
 * agent's root, so a stray file is a finding rather than a layout error: `notes.md` at the root, or anywhere outside
 * the subject, is `outside-subject`; `<library>/<S>/notes.md` is `bad-path`), then `scanForbidden` on every added or
 * modified `.lean` file with its base text, except `lakefile.lean` (a project file: `project-file` only). Unchanged
 * files and unchanged lines are never judged.
 */
export function checkFileChanges(base: ReadonlyMap<string, string>, current: ReadonlyMap<string, string>, ctx: G0Context): GateFinding[] {
  return checkChangeSet(base, current, ctx);
}

/**
 * D-5 permitted set from the FROZEN project model (docs/m2-plan.md section 3.2):
 *   standard (propext, Classical.choice, Quot.sound)
 *   ∪ signature: every axiom of the project's modules whose `typeSort` is not `Prop` and that is vocabulary of a
 *     signature kind (sorts, predicates, functions, constants); never a declaration bound to a card (fixer round 1:
 *     `axiom x : Empty` right below a card's block is that card's statement, not vocabulary), never vocabulary of kind
 *     `other`; an axiom outside every subject's modules (only the user writes there) counts when it is not a Prop
 *   ∪ selected: `n.holds` of each selected premise / adopted ghost whose `.holds` is an axiom
 *   ∪ presuppositions: presupposition axioms in `lean.presupposes` of the target's and the selected statements
 *   ∪ derivation footprints: `#print axioms` of each selected premise whose `.holds` is a theorem with status `proved`
 *     (minus `sorryAx`), unless that footprint contains the target's own `.holds` (a pending promotion: circular).
 *     Fixer round 1: given `base` (B: the user's files, the run's base or Accept's accept-base commit), only for the
 *     user's own proof: the premise had the same statement in B and its `.holds` keeps B's source text (B's footprint
 *     when B has facts). A proof Claude added or changed in the run never widens the set it is judged against.
 * Selected premises contributing nothing (no `.holds`, conditional, resting on the target's claimed `.holds`, or, given
 * `base`, proved only in this run) are listed in `unusable`. The target's `.holds` is never in the result.
 * Throws ActionError `invalid` when the target or a selected id is not a node of `selection.subject`.
 */
export function computePermittedAxioms(frozen: ProjectModel, selection: Selection, base?: ProjectModel): PermittedAxioms {
  return permittedAxioms(frozen, selection, true, base);
}

/**
 * The freeze record the rules need later (permitted set, frozen declarations, frozen axioms), from the frozen model.
 * `base`: as for `computePermittedAxioms` (the runner always passes B).
 */
export function frozenSnapshot(frozen: ProjectModel, selection: Selection, round: number, base?: ProjectModel): FrozenSnapshot {
  return snapshotOf(frozen, selection, round, base);
}

/**
 * G3, G5 and the stage/readiness rules for one purpose (docs/m2-plan.md section 3.3): every rule that applies, in
 * the order of `RuleReport.findings`; flagged definitions; footprints; the declaration diff. G1 findings for Lean
 * errors are included when `current.facts` reports build errors in changed files (the runner adds sandbox and budget
 * outcomes itself). Never throws for a malformed model: problems are findings.
 * Reviewer changes: `footprint` applies to `gate-other` too (permitted set = the round's freeze, else
 * `computePermittedAxioms(current, selection)`); `status-mismatch`; `markup` forbids changing or removing `lean:`
 * lines and re-binding any card formalised in B (section 3.3 has the exact rule list).
 * Fixer round 2: `footprint` judges every declaration added or changed in the run, whatever its kind or type, and
 * the names only Lean reports inside one; `proof-before-freeze` also refuses a proof carried inside a declaration
 * that is not one (token `carrier`).
 * Fixer round 3: every `example` added since B is a finding in every purpose (`proof-before-freeze` before the
 * round's freeze, `footprint` after it; token `example`), so none reaches the user's files.
 */
export function evaluateRules(input: RuleInput): RuleReport {
  return evaluate(input);
}

/**
 * telelean's deterministic normalisation of the shadow before the gate (docs/m2-plan.md section 3.4): for each node
 * in `nodeIds` (formalised in this run) pin the binding (`lean: <statement>`, D-8), write a derived id back (TL112),
 * and set the statement's docstring to the sentence (D-9 mirror, `escapeBodyText`). Uses only WP-markup primitives
 * (`setBlockFields`, `applyLeanOps` `set-docstring`), so nothing else changes byte for byte. Returns whole-file
 * changes (`before` = the model's text); empty when nothing needs normalising.
 */
export function normalisationChanges(model: ProjectModel, nodeIds: readonly string[]): FileChange[] {
  return normalisation(model, nodeIds);
}

/**
 * D-6 adoption ("I hold this"): inserts, right before the target's block in the target's file, a new ASSUMPTION
 * block (`renderBlock`: id, type, natural_name = Claude's sentence, rationale?, asserted, lean, origin: agent,
 * session, worded_by: agent) followed by `/-- <sentence> -/`, `abbrev <name> : Prop := <statement>` and
 * `axiom <name>.holds : <name>`, then a blank line; and (fixer round 1) appends the new card's id to the target's
 * `premises:` (the user adopted it for this target: it joins the declared selection, so the accepted proof shows no
 * TL107; G5 accepts exactly that telelean-written line, held to A). Throws ActionError (`not-found` target, `invalid` when
 * `ghostTextProblems(request.leanStatement)` is not empty, when the name is not a valid non-keyword identifier, or
 * when `scanForbidden` finds anything in the generated text) when it cannot be written safely. The statement is
 * written with every whitespace run collapsed to one space, exactly as the runner's ghost check elaborated it
 * (`GhostView.leanStatement` holds that collapsed text), so the adopted text is the checked text.
 */
export function planGhostAdoption(model: ProjectModel, request: GhostAdoptionRequest): GhostAdoptionPlan {
  return adoptionPlan(model, request);
}

/**
 * The confirmed lifecycle items of a proposal as text changes (D-21): `change-kind` G->D of a proved target changes
 * only its block's `type:` (06.2 table: "type only (already proved)"). Applied by Accept on top of the rebased files.
 * Throws ActionError `unsafe` if an item no longer applies (e.g. the target is no longer proved).
 */
export function lifecycleChanges(model: ProjectModel, items: readonly LifecycleItem[]): FileChange[] {
  return lifecycle(model, items);
}

/**
 * One plain sentence for the board (A2 notice style, telelean's words), e.g. "it used “The new Spyro game is PG”
 * (new_spyro_pg.holds), which you didn't select", "it left a gap (`sorry`) in cynder_not_good.holds", "it changed
 * the statement it had to prove (a definition the frozen statement depends on changed: cynder_not_good)".
 */
export function describeFinding(finding: GateFinding, ctx: DescribeContext): string {
  return describe(finding, ctx);
}

/**
 * A2's board notice for a failed attempt: "Attempt 1 didn't pass: <first finding, described>[ (and n more)]. Asking
 * Claude to retry." — or, when `attempt === maxAttempts`, "Claude's attempts didn't pass the checks <max> times:
 * <what kept failing>. telelean reverted its working copy to <label>."
 */
export function attemptNotice(
  findings: readonly GateFinding[],
  attempt: number,
  maxAttempts: number,
  ctx: DescribeContext,
  revertedTo?: string,
): string {
  return notice(findings, attempt, maxAttempts, ctx, revertedTo);
}
