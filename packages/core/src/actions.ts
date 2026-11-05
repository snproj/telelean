/**
 * Board actions and their results: what a user gesture asks for (BoardAction), what core plans for it (EditPlan),
 * what the runner applies and records (FileChange), and the history/undo records the board lists.
 *
 * FROZEN CONTRACT (M1, docs/m1-plan.md sections 5 and 8). Additive optional fields only.
 *
 *   webview message --(extension)--> BoardAction --(core planAction)--> EditPlan
 *     --(runner materialises sidecars)--> FileChange[] --(extension EditApplier: WorkspaceEdit + save)--> disk
 *     --(runner)--> history snapshot (git private ref) + undo entry + re-parse + Lean refresh
 */
import type { Evidential, NodeType, Stance } from './model.js';
import type { Layout } from './layout.js';

// ---------------------------------------------------------------------------------------------
// Actions

/** Fields the board can edit in place (D-17 "edit text/rationale"; D-14 chips). */
export type EditableField = 'naturalName' | 'rationale' | 'stance' | 'source';

/** What to do with Lean dependents when a kind change removes `n.holds` (D-11 A->G, D->G). */
export type DependentsChoice = 'rewrite' | 'mark-broken';

export type BoardAction =
  /** D-16: a comment-only node with the user's verbatim words, written to the subject's Inbox. */
  | {
      kind: 'add-node';
      subject: string;
      type: NodeType;
      naturalName: string;
      rationale?: string;
      stance?: Stance;
      source?: Evidential;
      /** Id the webview proposed (used when valid and unused across the workspace). */
      preferredId?: string;
    }
  /** `value: null` removes the field (not allowed for naturalName). */
  | { kind: 'edit-node'; id: string; field: EditableField; value: string | null }
  /**
   * D-18 delete: the block, and unless `keepLean` also its bound declarations (theorem proofs are archived). Without
   * `keepLean`, when other declarations use them (DeletePlan.brokenDependents) the planner refuses with
   * `needs-confirmation` listing them, unless `confirmed` is set (the user saw the list and still deletes).
   */
  | { kind: 'delete-node'; id: string; keepLean: boolean; confirmed?: boolean }
  /** D-11 kind change (the card moves to `to`, above `beforeId`). */
  | {
      kind: 'change-kind';
      id: string;
      to: NodeType;
      beforeId: string | null;
      /** Required when the change removes a `.holds` that others use (KindChangeImpact.needsConfirmation). */
      dependents?: DependentsChoice;
      /**
       * M2 (carry-over 3, docs/m2-plan.md section 9 WP1): the dependents (node ids or fully-qualified names) the
       * user saw listed when choosing `dependents`. When the planner's own dependents (computed with the facts) are not
       * all in this list, it refuses with `needs-confirmation` listing all of them, so a choice is never applied to a
       * dependent the dialog did not show. With `dependents` set and this absent, the planner treats it as `[]`.
       */
      confirmedDependents?: string[];
      /** G->A: "you supply the reason" (optional, never blocking: D-14). */
      rationale?: string;
    }
  /** D-17 drag within a column: layout only. */
  | { kind: 'reorder'; id: string; column: NodeType; beforeId: string | null }
  /** M1 "These suffice": declare `premises` as the target's joint support (replaces `premises:`, D-13). */
  | { kind: 'set-premises'; target: string; premises: string[] }
  /** D-10: a new subject (module subtree + namespace), with the scaffold files. */
  | { kind: 'create-subject'; name: string };

export type BoardActionKind = BoardAction['kind'];

/** Every kind of history entry (board actions plus housekeeping). */
export type HistoryActionKind =
  | BoardActionKind
  /** The first snapshot of a subject (when its history starts). */
  | 'initial'
  /** Hand edits found on disk before telelean's next write. */
  | 'manual'
  | 'undo'
  | 'redo'
  | 'revert'
  /** "telelean: Initialize Model Here". */
  | 'initialize'
  /** M2: an accepted "These suffice" proposal (one history entry and one Undo step, docs/m2-plan.md section 7). */
  | AcceptProposalAction;

/**
 * M2: the history kind of an accepted proposal (docs/m2-plan.md section 7). Part of HistoryActionKind since the M2
 * integration (plan section 11 step 2); still exported on its own for the places that name it.
 */
export type AcceptProposalAction = 'accept-proposal';
export const ACCEPT_PROPOSAL_ACTION: AcceptProposalAction = 'accept-proposal';

// ---------------------------------------------------------------------------------------------
// Plans and file changes

/** A whole-file change. `before: null` = the file is created; `after: null` = the file is deleted. */
export interface FileChange {
  /** POSIX path relative to the model root. */
  path: string;
  before: string | null;
  after: string | null;
}

/** A declaration removed from a model file and kept in the subject's attic (D-11 D->A, D-18 delete). */
export interface ArchiveEntry {
  subject: string;
  nodeId: string;
  /** Fully-qualified name of the archived declaration. */
  declName: string;
  /** Its source text, verbatim. */
  text: string;
  /** e.g. `Derivation -> Assumption`, `deleted`. */
  reason: string;
}

/**
 * What core plans for one action, from the parsed files alone (pure). The runner turns `layout` and `archive` into
 * sidecar FileChanges (layout.json, attic files) before applying.
 */
export interface EditPlan {
  action: HistoryActionKind;
  /** One line for the history dropdown and the Undo toast, e.g. `Delete: Cynder would not be a good addition…`. */
  label: string;
  /** The subject the action belongs to ('' for project-level changes). */
  subject: string;
  /** Node ids the action is about. */
  nodes: string[];
  /** Model (Lean) file changes. */
  changes: FileChange[];
  /** The subject's new layout, when the column order changes. */
  layout?: { subject: string; layout: Layout };
  /** Declarations to append to attic files. */
  archive?: ArchiveEntry[];
  /** Only the layout changes: undoable, but not snapshotted on its own (docs/m1-plan.md section 8). */
  layoutOnly?: boolean;
  /** The id of a node the action created (add-node). */
  nodeId?: string;
}

export type ActionErrorCode =
  /** The node, subject or history entry does not exist (any more). */
  | 'not-found'
  /** The request is invalid (e.g. empty sentence, premise cycle, subject name taken). */
  | 'invalid'
  /** The change removes a `.holds` that others use and no DependentsChoice was given (show the confirm dialog). */
  | 'needs-confirmation'
  /** The Lean facts needed for a mechanical rewrite are stale or missing: refresh first. */
  | 'facts-stale'
  /** A file changed since the plan was made, or since the action being undone. */
  | 'conflict'
  /** The block or declaration cannot be edited safely (duplicate id, parse error in the block, ...). */
  | 'unsafe'
  /** Available from M2 on (e.g. "Self-evident?" with zero premises). */
  | 'not-yet'
  /** History is unavailable (no git repository, git missing). */
  | 'no-history'
  | 'internal';

/** A user-facing refusal. `message` is shown on the board as is. */
export class ActionError extends Error {
  constructor(
    readonly code: ActionErrorCode,
    message: string,
    /** For `needs-confirmation`: the dependents to list. */
    readonly dependents: readonly string[] = [],
  ) {
    super(message);
    this.name = 'ActionError';
  }
}

/** A card named in a `needs-confirmation` list, as the board shows it (by its sentence, with its subject). */
export interface DependentCard {
  subject: string;
  type: NodeType;
  naturalName: string;
}

/** The result of performing an action, undo, redo or revert (runner -> extension -> webview `actionResult`). */
export type ActionOutcome =
  | { ok: true; label: string; undoable: boolean; nodeId?: string }
  | {
      ok: false;
      code: ActionErrorCode;
      error: string;
      dependents?: string[];
      /**
       * For `needs-confirmation`: the entries of `dependents` that are cards, by id, in any subject (added by the
       * extension host). The board's graph holds only its own subject's cards; with this it shows another subject's
       * card by its sentence rather than its id. Entries not listed here are fully-qualified Lean names.
       */
      dependentCards?: Record<string, DependentCard>;
    };

// ---------------------------------------------------------------------------------------------
// History (D-33) and undo

export interface HistoryEntry {
  /** Commit id (hex) of the snapshot. */
  id: string;
  /** ISO time of the snapshot. */
  time: string;
  action: HistoryActionKind;
  /** e.g. `Delete: Cynder would not be a good addition…`. */
  label: string;
  subject: string;
  nodes: string[];
}

/** Disk used by telelean's history (D-33 counter): objects reachable from telelean's refs and from no branch or tag. */
export interface StorageUsage {
  subjectBytes: number;
  totalBytes: number;
  perSubject: Record<string, number>;
}

export type HistoryAvailability =
  | { state: 'ready' }
  /** The model folder is not inside a git repository; Initialize/the board can offer `git init`. */
  | { state: 'no-repo' }
  | { state: 'git-missing' }
  /** Switched off by the `telelean.git.snapshotRefs` setting. */
  | { state: 'disabled' }
  | { state: 'error'; detail: string };

export interface HistoryListing {
  subject: string;
  /** Newest first. */
  entries: HistoryEntry[];
  storage: StorageUsage;
  /** More entries exist beyond `entries`. */
  more: boolean;
}

/** Files of a history entry compared with its parent or with the current state, for the read-only preview. */
export interface HistoryDiff {
  entry: HistoryEntry;
  compare: 'parent' | 'current';
  files: FileChange[];
}

// ---------------------------------------------------------------------------------------------
// Board-level state the host sends besides the graph

export interface WorkspaceState {
  /** Display name of the model root (its folder name). */
  rootName: string;
  subjects: Array<{ name: string; nodeCount: number }>;
  /** The subject the board shows. */
  subject: string;
  /** Label of the action Undo would revert / Redo would re-apply, or null. */
  undo: string | null;
  redo: string | null;
  history: HistoryAvailability;
}
