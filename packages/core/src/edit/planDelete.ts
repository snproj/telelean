/**
 * D-18 delete, computed before asking the user: which declarations go, which premises lose the id, and what will no
 * longer compile (proofs that use the removed `.holds` and statements that mention the removed abbrev). Slice 2i (spec
 * v4 S9, ES-9): the card's Lean always goes with it (there is no card-only delete any more).
 */
import { ActionError } from '../actions.js';
import { holdsName } from '../facts.js';
import type { ProjectModel } from '../project/types.js';
import { axiomListUsers, usersOf } from './dependents.js';
import type { DeletePlan, DeleteRequest } from './types.js';

export function planDel(model: ProjectModel, request: DeleteRequest): DeletePlan {
  const entry = model.nodes.get(request.id);
  if (!entry) throw new ActionError('not-found', `No card "${request.id}".`);
  const node = entry.node;
  const statement = node.lean.statement;
  const exists = (name: string) => model.declFacts.has(name) || [...model.files.values()].some((f) => f.decls.some((d) => d.fullName === name));
  const decls: string[] = [];
  // The `.holds` is looked up on its own: an `axiom ….holds` whose abbrev is missing must not be left behind (S9).
  if (statement && exists(statement)) decls.push(statement);
  if (statement && exists(holdsName(statement))) decls.push(holdsName(statement));
  const premiseRemovals = [...model.nodes.values()].filter((n) => n.node.id !== node.id && n.node.premises.includes(node.id)).map((n) => n.node.id);
  let brokenDependents: string[] = [];
  if (decls.length > 0) {
    brokenDependents = usersOf(model, decls, new Set(decls)).all;
    // An axiom `.holds` also breaks the declarations whose `#print axioms` lists it (uses the references do not show).
    if (statement && node.lean.justificationKind === 'axiom') brokenDependents.push(...axiomListUsers(model, holdsName(statement), brokenDependents, new Set(decls)));
  }
  return { id: node.id, removeDecls: decls, premiseRemovals, brokenDependents };
}
