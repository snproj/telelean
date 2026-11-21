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
 * D-11 with the facts: which `.holds` changes, which dependents must change, what breaks (docs/m1-plan.md 6.2; spec
 * v4: docs/slice1-plan.md 2.4). Only P->A is planned: it removes the card's `premises:` and `follows_from:` lines too
 * (AR-7); A->P throws ActionError `invalid` (AR-6: an arrow or "follows from nothing" makes an axiom a proposition).
 * When a conditional proof becomes an axiom, the declarations that pass it arguments need a DependentsChoice:
 * `rewrite` throws `facts-stale` unless every touched file is fresh, and `unsafe` when the `.holds` type is not
 * `… → n`.
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
