/**
 * VS Code adapters for the runner's TextSource and EditApplier (the logic lives in ../logic/textSource.ts and
 * ../logic/editApplier.ts): open documents are read through `workspace.textDocuments`, writes go through one
 * `WorkspaceEdit` and `TextDocument.save`.
 */
import * as vscode from 'vscode';

import type { TextSource } from '@telelean/runner/workspace/index.js';

import { CheckedEditApplier, type FileOperation, type WorkspaceEditPort } from '../logic/editApplier';
import type { GroupInfo } from '../logic/groups';
import { createTextSource, readTextFile } from '../logic/textSource';

/** The open (possibly unsaved) document for an absolute file path, if VS Code has one. */
export function openDocument(absPath: string): vscode.TextDocument | undefined {
  return vscode.workspace.textDocuments.find((doc) => doc.uri.scheme === 'file' && doc.uri.fsPath === absPath && !doc.isClosed);
}

/** The window's editor groups with the files their tabs show (for logic/groups.ts). */
export function editorGroups(): GroupInfo[] {
  return vscode.window.tabGroups.all.map((group) => ({
    viewColumn: group.viewColumn,
    files: group.tabs.flatMap((tab) => (tab.input instanceof vscode.TabInputText && tab.input.uri.scheme === 'file' ? [tab.input.uri.fsPath] : [])),
  }));
}

/** Reads model files the way the user sees them: an open editor buffer wins over the file on disk. */
export function vscodeTextSource(root: string): TextSource {
  return createTextSource(root, {
    openText: (absPath) => openDocument(absPath)?.getText(),
    readFile: readTextFile,
  });
}

/** Applies a batch as one `WorkspaceEdit` (text edits for changed files, create/delete for the others). */
export class VscodeWorkspaceEditPort implements WorkspaceEditPort {
  /**
   * Opens (without showing) the documents of the files about to be edited, before the applier checks their text: a
   * WorkspaceEdit carries the extension host's version of each document it has open, and VS Code refuses the edit
   * when that document changed in between; for a file with no document it would edit whatever is on disk by then.
   * (Applying the edit would open these documents anyway.)
   */
  async prepare(absPaths: readonly string[]): Promise<void> {
    for (const absPath of absPaths) {
      if (openDocument(absPath)) continue;
      try {
        await vscode.workspace.openTextDocument(vscode.Uri.file(absPath));
      } catch {
        // missing or unreadable: the applier's check reports it
      }
    }
  }

  async apply(operations: readonly FileOperation[], label: string): Promise<boolean> {
    const edit = new vscode.WorkspaceEdit();
    for (const operation of operations) {
      const uri = vscode.Uri.file(operation.absPath);
      switch (operation.kind) {
        case 'create':
          edit.createFile(uri, { overwrite: false, contents: new TextEncoder().encode(operation.text) });
          break;
        case 'delete':
          edit.deleteFile(uri, { ignoreIfNotExists: false });
          break;
        case 'edit':
          for (const { range, text } of operation.edits) {
            edit.replace(uri, new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character), text);
          }
          break;
      }
    }
    void label;
    return vscode.workspace.applyEdit(edit, { isRefactoring: false });
  }

  async save(absPath: string): Promise<boolean> {
    const doc = openDocument(absPath) ?? (await vscode.workspace.openTextDocument(vscode.Uri.file(absPath)));
    if (!doc.isDirty) return true;
    return doc.save();
  }
}

/** What the user is told when a change was applied but a file could not be saved (the change is in its editor). */
export function unsavedWarning(paths: readonly string[], label: string): string {
  const files = paths.join(', ');
  return `telelean: "${label}" is applied, but ${files} could not be saved, so the change is only in the editor. Save ${paths.length === 1 ? 'it' : 'them'} yourself (VS Code says why it refused); Undo works as usual.`;
}

/** The EditApplier for one model root (Initialize uses it before the root has a workspace). */
export function vscodeEditApplier(
  root: string,
  log: (level: 'info' | 'warn' | 'error', message: string) => void,
  onWillWrite?: (writes: ReadonlyArray<{ absPath: string; text: string | null }>) => void,
): CheckedEditApplier {
  return new CheckedEditApplier({
    root,
    text: vscodeTextSource(root),
    port: new VscodeWorkspaceEditPort(),
    log,
    onUnsaved: (paths, label) => void vscode.window.showWarningMessage(unsavedWarning(paths, label)),
    ...(onWillWrite ? { onWillWrite } : {}),
  });
}
