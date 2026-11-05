/**
 * M2 carry-over 3: a kind change's DependentsChoice applies only to the dependents the dialog listed
 * (`confirmedDependents`). These helpers mirror the board's flow for the M1 tests: ask without a choice, take the
 * dependents the planner lists (what the dialog shows), then send the choice with exactly that list.
 */
import { ActionError, type BoardAction } from '../../../src/actions.js';
import { planKindChange, type KindChangeRequest } from '../../../src/edit/index.js';
import type { NodeType } from '../../../src/model.js';
import type { ProjectModel } from '../../../src/project/types.js';

/** The dependents the planner lists when the change is asked without a choice (none when it needs no confirmation). */
export function listedDependents(model: ProjectModel, id: string, to: NodeType): string[] {
  try {
    planKindChange(model, { id, to });
    return [];
  } catch (error) {
    if (error instanceof ActionError && error.code === 'needs-confirmation') return [...error.dependents];
    throw error;
  }
}

/** The request with `confirmedDependents` = what the dialog listed. */
export function confirmed(model: ProjectModel, request: KindChangeRequest): KindChangeRequest {
  return { ...request, confirmedDependents: listedDependents(model, request.id, request.to) };
}

/** A `change-kind` action with `confirmedDependents` = what the dialog listed. */
export function confirmedAction(model: ProjectModel, action: Extract<BoardAction, { kind: 'change-kind' }>): Extract<BoardAction, { kind: 'change-kind' }> {
  return { ...action, confirmedDependents: listedDependents(model, action.id, action.to) };
}
