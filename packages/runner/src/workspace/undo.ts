/**
 * In-board Undo/Redo (D-17; docs/m1-plan.md section 8): per subject, in memory, at most 100 entries.
 *
 * An entry is one applied operation as whole-file changes (`before` -> `after`, sidecars included). Both stacks hold
 * changes *as last applied*, and both Undo and Redo apply the top entry backwards (`after` -> `before`):
 *
 *   perform:  push the applied changes C on the undo stack, clear redo
 *   undo:     pop C, apply it backwards -> applied changes A; push A on the redo stack
 *   redo:     pop A, apply it backwards -> applied changes A'; push A' on the undo stack
 *
 * Applying a change backwards to a file's current text: exact when the file still equals `after`; a no-op when it
 * already equals `before`; otherwise the reverse patch (`diff` structuredPatch/applyPatch, no fuzz) when the hunks
 * still fit. A file the change created is deleted only while unchanged, a deleted file is re-created only while
 * absent. Anything else refuses the whole step (all or nothing).
 */
import { applyPatch, structuredPatch } from 'diff';

import type { FileChange } from '@telelean/core';

export const UNDO_LIMIT = 100;

export interface UndoEntry {
  /** The label of the original operation (Undo/Redo prefix their own). */
  label: string;
  subject: string;
  nodes: string[];
  /** The changes as last applied. */
  changes: FileChange[];
  /** Layout-only operations are not snapshotted on their own (docs/m1-plan.md section 8). */
  layoutOnly: boolean;
}

export type BackwardResult = { ok: true; changes: FileChange[] } | { ok: false; path: string };

const CONFLICT = Symbol('conflict');

/**
 * The text a file should get when `change` is applied backwards to `current`, or CONFLICT. `null` = the file must
 * not exist.
 */
export function backwardText(change: FileChange, current: string | null): string | null | typeof CONFLICT {
  if (current === change.after) return change.before;
  if (current === change.before) return current;
  if (current === null || change.before === null || change.after === null) return CONFLICT;
  const patch = structuredPatch(change.path, change.path, change.after, change.before);
  const result = applyPatch(current, patch, { fuzzFactor: 0 });
  return result === false ? CONFLICT : result;
}

/**
 * Applies `changes` backwards to the current files (read through `read`), all or nothing: the changes to write
 * (`before` = the current text), or the first file that no longer fits.
 */
export async function applyBackwards(changes: readonly FileChange[], read: (path: string) => Promise<string | null>): Promise<BackwardResult> {
  const out: FileChange[] = [];
  for (const change of changes) {
    const current = await read(change.path);
    const target = backwardText(change, current);
    if (target === CONFLICT) return { ok: false, path: change.path };
    if (target !== current) out.push({ path: change.path, before: current, after: target });
  }
  return { ok: true, changes: out };
}

/** Per-subject undo and redo stacks. */
export class UndoStacks {
  private readonly undo = new Map<string, UndoEntry[]>();
  private readonly redo = new Map<string, UndoEntry[]>();

  /** A new operation: push it and clear the subject's redo stack. */
  record(entry: UndoEntry): void {
    push(this.undo, entry);
    this.redo.delete(entry.subject);
  }

  peek(kind: 'undo' | 'redo', subject: string): UndoEntry | undefined {
    return (kind === 'undo' ? this.undo : this.redo).get(subject)?.at(-1);
  }

  /** After an undo (or redo) of the top entry: move it to the other stack with the changes as applied now. */
  move(kind: 'undo' | 'redo', subject: string, applied: FileChange[]): void {
    const from = kind === 'undo' ? this.undo : this.redo;
    const entry = from.get(subject)?.pop();
    if (!entry) return;
    push(kind === 'undo' ? this.redo : this.undo, { ...entry, changes: applied });
  }

  labels(subject: string): { undo: string | null; redo: string | null } {
    return { undo: this.peek('undo', subject)?.label ?? null, redo: this.peek('redo', subject)?.label ?? null };
  }
}

function push(stacks: Map<string, UndoEntry[]>, entry: UndoEntry): void {
  const stack = stacks.get(entry.subject) ?? [];
  stack.push(entry);
  if (stack.length > UNDO_LIMIT) stack.splice(0, stack.length - UNDO_LIMIT);
  stacks.set(entry.subject, stack);
}
