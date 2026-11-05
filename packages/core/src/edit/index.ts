/**
 * WP-model: planning board actions (docs/m1-plan.md sections 5.4 and 6.2). Signatures and documented behaviour are
 * FROZEN; the implementation lives in ./planAction.ts, ./planKind.ts, ./planDelete.ts and ./scaffold.ts.
 */
import type { BoardAction, EditPlan } from '../actions.js';
import type { ProjectModel } from '../project/types.js';
import { plan } from './planAction.js';
import { planDel } from './planDelete.js';
import { planKind } from './planKind.js';
import type { DeletePlan, DeleteRequest, KindChangePlan, KindChangeRequest, PlanContext } from './types.js';

export * from './types.js';
export { subjectScaffold } from './scaffold.js';

/**
 * Plans one board action against the current parsed files (pure). Throws ActionError for refusals
 * (`not-found`, `invalid`, `needs-confirmation`, `facts-stale`, `unsafe`, `not-yet`). Edits blocks only through
 * WP-markup's primitives, so unrelated text is untouched byte for byte.
 */
export function planAction(model: ProjectModel, action: BoardAction, ctx: PlanContext): EditPlan {
  return plan(model, action, ctx);
}

/**
 * D-11 with the facts: which `.holds` changes, which dependents need `(h : n)`, what breaks (docs/m1-plan.md 6.2).
 * `rewrite` throws ActionError `facts-stale` unless every touched file is fresh, and `unsafe` (listing them) when a
 * declaration in the closure of users of `n.holds` is not a `theorem` (a def/instance/abbrev cannot take a
 * hypothesis without changing its type) or, for an axiom `n.holds`, when a declaration whose `#print axioms` lists
 * it is not reached through the `.ilean` references (a use the mechanical rewrite could not find).
 */
export function planKindChange(model: ProjectModel, request: KindChangeRequest): KindChangePlan {
  return planKind(model, request);
}

/**
 * D-18: what a delete removes and breaks. `brokenDependents` covers proofs that use the removed `.holds` AND
 * statements (other nodes' or untracked) that mention the removed statement abbrev.
 */
export function planDelete(model: ProjectModel, request: DeleteRequest): DeletePlan {
  return planDel(model, request);
}
