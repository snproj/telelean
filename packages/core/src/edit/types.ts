/**
 * Edit planning (WP-model): from a BoardAction and the project model to an EditPlan, using WP-markup's text
 * primitives. FROZEN CONTRACT (M1, docs/m1-plan.md sections 5.4 and 6.2).
 */
import type { DependentsChoice } from '../actions.js';
import type { KindChangeImpact } from '../kindChange.js';
import type { Layout } from '../layout.js';
import type { NodeType } from '../model.js';
import type { KnownFieldKey, LeanOp } from '../markup/types.js';

export interface PlanContext {
  /** ISO date for `asserted:` on new nodes, e.g. `2026-11-01`. */
  today: string;
  /** ISO timestamp for attic headers. */
  now: string;
  /** Each subject's current layout (missing = empty). */
  layouts: Readonly<Record<string, Layout>>;
}

/** The D-11 plan for one kind change, with the Lean facts (host side). */
export interface KindChangePlan {
  id: string;
  from: NodeType;
  to: NodeType;
  /** The same impact the webview previewed, recomputed with the facts (dependents may include untracked declarations). */
  impact: KindChangeImpact;
  /** Block field changes: `type`; for P->A also the removal of `premises:` and `follows_from:` (AR-7); optionally `rationale`. */
  fieldChanges: Array<{ key: KnownFieldKey; value: string | null }>;
  /** Lean text operations, grouped by file. */
  leanOps: Array<{ file: string; ops: LeanOp[] }>;
  /** Fully-qualified declarations that will no longer compile (dependents kept as "broken"). */
  broken: string[];
}

export interface KindChangeRequest {
  id: string;
  to: NodeType;
  dependents?: DependentsChoice;
  /**
   * M2 (carry-over 3, docs/m2-plan.md section 9 WP1): the dependents (node ids or fully-qualified names) the user saw
   * listed when choosing `dependents`. When the planner's dependents are not all in it (absent = `[]`), it refuses with
   * `needs-confirmation` listing all of them, so a choice is never applied to a dependent the dialog did not show.
   */
  confirmedDependents?: readonly string[];
}

/** What deleting a node does (D-18), computed before asking the user. */
export interface DeletePlan {
  id: string;
  /** Declarations removed with the block (none when `keepLean`). */
  removeDecls: string[];
  /** Nodes that list `id` in `premises:` and lose that entry. */
  premiseRemovals: string[];
  /** Fully-qualified declarations (other nodes' or untracked) that use the removed declarations and will break. */
  brokenDependents: string[];
  /** With `keepLean`, an `axiom n.holds` left behind becomes an unmarked assumption (TL104). */
  leavesUnmarkedAxiom: boolean;
}

export interface DeleteRequest {
  id: string;
  keepLean: boolean;
}
