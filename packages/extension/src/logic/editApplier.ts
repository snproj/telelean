/**
 * The EditApplier behind every board write (docs/m1-plan.md section 2, "board to files"), without the vscode API:
 *
 *   0. load the documents of the files to be edited in place (the extension: `openTextDocument`), so that the check
 *      below reads exactly the text VS Code will edit and VS Code's own version check refuses the edit if such a
 *      document changes in between (it checks only documents the extension host has open);
 *   1. check that each file's current text (open buffer first, via the TextSource) still equals the change's
 *      `before` (`null`: the file must not exist); otherwise refuse with ActionError `conflict`, applying nothing;
 *   2. turn the whole-file changes into one batch of operations: minimal line-based text edits for files that are
 *      changed (so open editors keep their cursors, folds and undo history outside the edited lines), create and
 *      delete for files that appear or disappear;
 *   3. apply the batch (the extension: one `vscode.WorkspaceEdit`). When VS Code refuses it, re-read the files: VS
 *      Code applies a WorkspaceEdit in steps and keeps the steps done before the one that failed, so the files it did
 *      change are changed back; then refuse (`conflict`: nothing was applied), or, if changing back failed, report
 *      exactly which files are left changed (`internal`);
 *   4. save every file that was edited in place, so the change is on disk when `apply` resolves (D-17 "edits are
 *      saved immediately"; this also saves unsaved typing in those files, risk R4). A file that cannot be saved
 *      keeps the change in its editor: `apply` still resolves (the change is applied, so the runner records it for
 *      Undo, snapshots and re-reads it) and `onUnsaved` tells the user to save it.
 */
import { ActionError, type FileChange, type Position, type Range } from '@telelean/core';
import type { EditApplier, TextSource } from '@telelean/runner/workspace/index.js';
import { diffLines } from 'diff';

import { OutsideRootError, resolveInsideRoot } from './modelPaths';

/** Replace `before.slice(start, end)` with `text` (offsets into the text the edits were computed from). */
export interface TextReplacement {
  start: number;
  end: number;
  text: string;
}

/** Beyond this, a whole-file replacement is cheaper than searching for a minimal diff. */
const DIFF_TIMEOUT_MS = 2000;

/**
 * Line-granular edits that turn `before` into `after`: one replacement per changed run of lines, non-overlapping
 * and in order (what VS Code expects of the edits for one document). Empty when the texts are equal.
 */
export function minimalTextEdits(before: string, after: string): TextReplacement[] {
  if (before === after) return [];
  const parts = diffLines(before, after, { timeout: DIFF_TIMEOUT_MS });
  if (!parts) return [{ start: 0, end: before.length, text: after }];
  const edits: TextReplacement[] = [];
  let offset = 0;
  let open: TextReplacement | undefined; // the replacement being built at the current offset
  for (const part of parts) {
    if (part.added) {
      if (open && open.end === offset) open.text += part.value;
      else edits.push((open = { start: offset, end: offset, text: part.value }));
    } else if (part.removed) {
      if (open && open.end === offset) open.end += part.value.length;
      else edits.push((open = { start: offset, end: offset + part.value.length, text: '' }));
      offset += part.value.length;
    } else {
      offset += part.value.length;
      open = undefined;
    }
  }
  return edits;
}

/** Applies replacements computed by `minimalTextEdits` (used by tests and to double-check a plan). */
export function applyTextReplacements(text: string, edits: readonly TextReplacement[]): string {
  let out = '';
  let cursor = 0;
  for (const edit of edits) {
    if (edit.start < cursor || edit.end < edit.start || edit.end > text.length) throw new RangeError('overlapping or out-of-range replacement');
    out += text.slice(cursor, edit.start) + edit.text;
    cursor = edit.end;
  }
  return out + text.slice(cursor);
}

/** Offsets where lines start; `\r\n`, `\n` and a lone `\r` each end a line (as in VS Code's text model). */
export function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 13) {
      if (text.charCodeAt(i + 1) === 10) i++;
      starts.push(i + 1);
    } else if (c === 10) {
      starts.push(i + 1);
    }
  }
  return starts;
}

/** The LSP position (0-based line, UTF-16 character) of an offset, given `lineStarts` of the same text. */
export function positionAt(starts: readonly number[], offset: number): Position {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if ((starts[mid] ?? 0) <= offset) low = mid;
    else high = mid - 1;
  }
  return { line: low, character: offset - (starts[low] ?? 0) };
}

/** One step of the batch for one file. Paths: `path` relative POSIX (for messages), `absPath` for the editor. */
export type FileOperation =
  | { kind: 'create'; path: string; absPath: string; text: string }
  | { kind: 'delete'; path: string; absPath: string }
  | { kind: 'edit'; path: string; absPath: string; edits: Array<{ range: Range; text: string }> };

/** The batch for `changes` (already checked); no-op changes produce nothing. */
export function planFileOperations(root: string, changes: readonly FileChange[]): FileOperation[] {
  const operations: FileOperation[] = [];
  for (const change of changes) {
    const absPath = resolveInsideRoot(root, change.path);
    if (change.before === change.after) continue;
    if (change.before === null && change.after !== null) {
      operations.push({ kind: 'create', path: change.path, absPath, text: change.after });
    } else if (change.before !== null && change.after === null) {
      operations.push({ kind: 'delete', path: change.path, absPath });
    } else if (change.before !== null && change.after !== null) {
      const starts = lineStarts(change.before);
      const edits = minimalTextEdits(change.before, change.after).map((edit) => ({
        range: { start: positionAt(starts, edit.start), end: positionAt(starts, edit.end) },
        text: edit.text,
      }));
      operations.push({ kind: 'edit', path: change.path, absPath, edits });
    }
  }
  return operations;
}

/** What the EditApplier needs from the editor (VS Code in the extension, fakes in unit tests). */
export interface WorkspaceEditPort {
  /**
   * Loads the documents of files about to be edited in place (before their current text is checked), so that the
   * editor's own check refuses the edit if one of them changes in between. Optional; failures are ignored (the check
   * that follows reports a missing file).
   */
  prepare?(absPaths: readonly string[]): Promise<void>;
  /**
   * Applies the batch as one edit; resolves false (or rejects) when the editor refused it. The editor may have
   * applied the operations before the one that failed (VS Code does): the applier finds and reverses them.
   */
  apply(operations: readonly FileOperation[], label: string): Promise<boolean>;
  /** Saves the document of a file edited in place (a no-op when it is not dirty); false when it could not be saved. */
  save(absPath: string): Promise<boolean>;
}

export interface CheckedEditApplierOptions {
  root: string;
  text: TextSource;
  port: WorkspaceEditPort;
  log?: (level: 'info' | 'warn' | 'error', message: string) => void;
  /**
   * Told about each file just before a batch is applied (`text` = its content afterwards, null = deleted), so the
   * extension's watchers can recognise the echo of telelean's own write.
   */
  onWillWrite?: (writes: ReadonlyArray<{ absPath: string; text: string | null }>) => void;
  /**
   * The change was applied, but these files (relative paths) could not be saved: their editors hold the change and
   * the user has to save them. `apply` resolved normally (the change is recorded for Undo).
   */
  onUnsaved?: (paths: readonly string[], label: string) => void;
}

const listed = (paths: readonly string[]) => paths.join(', ');

export class CheckedEditApplier implements EditApplier {
  constructor(private readonly options: CheckedEditApplierOptions) {}

  async apply(changes: readonly FileChange[], label: string): Promise<void> {
    const { root, text, port, log, onWillWrite, onUnsaved } = this.options;
    const seen = new Set<string>();
    for (const change of changes) {
      try {
        resolveInsideRoot(root, change.path);
      } catch (error) {
        if (error instanceof OutsideRootError) throw new ActionError('internal', `telelean refused to write ${error.message}`);
        throw error;
      }
      if (seen.has(change.path)) throw new ActionError('internal', `"${label}" changes ${change.path} twice`);
      seen.add(change.path);
    }

    const inPlace = changes.filter((c) => c.before !== null && c.after !== null && c.before !== c.after).map((c) => resolveInsideRoot(root, c.path));
    if (inPlace.length > 0 && port.prepare) {
      try {
        await port.prepare(inPlace);
      } catch (error) {
        log?.('warn', `could not open the documents for "${label}" first: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const conflicts: string[] = [];
    for (const change of changes) {
      const current = await text.read(change.path);
      if (current !== change.before) conflicts.push(change.path);
    }
    if (conflicts.length > 0) {
      throw new ActionError('conflict', `${listed(conflicts)} changed since telelean planned "${label}"; nothing was applied.`);
    }

    const operations = planFileOperations(root, changes);
    if (operations.length === 0) return;
    onWillWrite?.(changes.filter((c) => c.before !== c.after).map((c) => ({ absPath: resolveInsideRoot(root, c.path), text: c.after })));
    if (!(await this.tryApply(operations, label))) await this.recoverRefused(changes, label);

    const unsaved: string[] = [];
    for (const operation of operations) {
      if (operation.kind === 'edit' && !(await port.save(operation.absPath).catch(() => false))) unsaved.push(operation.path);
    }
    if (unsaved.length > 0) {
      log?.('warn', `applied "${label}", but ${listed(unsaved)} could not be saved: the change is in the editor, unsaved`);
      onUnsaved?.(unsaved, label);
      return;
    }
    log?.('info', `applied "${label}": ${operations.map((o) => `${o.kind} ${o.path}`).join(', ')}`);
  }

  private async tryApply(operations: readonly FileOperation[], label: string): Promise<boolean> {
    try {
      return await this.options.port.apply(operations, label);
    } catch (error) {
      this.options.log?.('warn', `VS Code refused "${label}": ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * After the editor refused a batch: finds the files it changed anyway (their text now equals `after`) and changes
   * them back, so that "nothing was applied" is true again. Always throws.
   */
  private async recoverRefused(changes: readonly FileChange[], label: string): Promise<never> {
    const { root, text, log, onWillWrite } = this.options;
    const read = (path: string) => text.read(path).catch(() => undefined);
    const applied: FileChange[] = [];
    const elsewhere: string[] = [];
    for (const change of changes) {
      if (change.before === change.after) continue;
      const current = await read(change.path);
      if (current === change.before) continue;
      if (current === change.after) applied.push(change);
      else elsewhere.push(change.path);
    }
    const meanwhile = elsewhere.length > 0 ? `${listed(elsewhere)} changed at the same moment` : 'a file probably changed at the same moment';
    if (applied.length === 0) {
      throw new ActionError('conflict', `VS Code could not apply "${label}" (${meanwhile}); nothing was applied.`);
    }

    const reverse: FileChange[] = applied.map((c) => ({ path: c.path, before: c.after, after: c.before }));
    onWillWrite?.(reverse.map((c) => ({ absPath: resolveInsideRoot(root, c.path), text: c.after })));
    let left = applied.map((c) => c.path);
    if (await this.tryApply(planFileOperations(root, reverse), `Undo part of "${label}"`)) {
      const still: string[] = [];
      for (const change of applied) if ((await read(change.path)) !== change.before) still.push(change.path);
      left = still;
    }
    if (left.length === 0) {
      log?.('warn', `VS Code applied only part of "${label}"; changed back: ${listed(applied.map((c) => c.path))}`);
      throw new ActionError(
        'conflict',
        `VS Code applied only part of "${label}" (${meanwhile}); telelean changed ${listed(applied.map((c) => c.path))} back, so nothing was applied.`,
      );
    }
    log?.('error', `VS Code applied only part of "${label}"; could not change back: ${listed(left)}`);
    throw new ActionError(
      'internal',
      `VS Code applied only part of "${label}" (${meanwhile}) and telelean could not change ${listed(left)} back. Check ${left.length === 1 ? 'that file' : 'those files'}: Undo does not cover this change.`,
    );
  }
}
