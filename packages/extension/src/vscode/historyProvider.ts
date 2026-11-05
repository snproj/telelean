/**
 * Read-only multi-file diffs beside the board, shown with VS Code's multi-file diff editor (`vscode.changes`) over
 * documents of a content provider (documents of a content provider cannot be edited or saved, so a preview never
 * writes anything):
 *
 *   telelean-history:    a history entry (D-33): HistoryPreviews
 *   telelean-proposal:   the raw Lean diff of a Claude proposal (M2, docs/m2-plan.md section 8.1): ProposalPreviews
 */
import * as path from 'node:path';
import * as vscode from 'vscode';

import type { HistoryDiff } from '@telelean/core';

import { focusCommandBesideBoard } from '../logic/groups';
import { EXPIRED_PREVIEW_TEXT, HISTORY_SCHEME, previewRows, previewTitle, PreviewStore, type PreviewDocument, type PreviewRow } from '../logic/historyPreview';
import { EXPIRED_PROPOSAL_TEXT, PROPOSAL_SCHEME, proposalRows, type ProposalDiff } from '../logic/proposalPreview';
import { editorGroups } from './editor';

/** One content-provider scheme and the documents of its last few diffs. */
export class DiffPreviews implements vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly store = new PreviewStore();
  private readonly registration: vscode.Disposable;
  private counter = 0;

  constructor(
    private readonly scheme: string,
    private readonly expiredText: string,
  ) {
    this.registration = vscode.workspace.registerTextDocumentContentProvider(scheme, this);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.store.get(uri.path, uri.query) ?? this.expiredText;
  }

  /** A new preview id (the documents' URI queries carry it, so reopening an old preview never shows newer text). */
  nextId(): string {
    return `${Date.now().toString(36)}${++this.counter}`;
  }

  /**
   * Opens the rows as one multi-file diff beside the board (in another editor group, created when the board's is the
   * only one, so the diff never covers the board); resolves with the title.
   */
  async show(id: string, title: string, rows: readonly PreviewRow[], root: string, boardColumn: vscode.ViewColumn | undefined): Promise<string> {
    this.store.add(id, rows);
    const uri = (doc: PreviewDocument) => vscode.Uri.from({ scheme: this.scheme, path: `/${doc.path}`, query: doc.key });
    const resources = rows.map((row) => [
      vscode.Uri.file(path.join(root, ...row.path.split('/'))),
      row.left ? uri(row.left) : undefined,
      row.right ? uri(row.right) : undefined,
    ]);
    // `vscode.changes` opens in the active group and takes no view column: make the group beside the board active.
    const focus = focusCommandBesideBoard(editorGroups(), boardColumn);
    if (focus) await vscode.commands.executeCommand(focus);
    await vscode.commands.executeCommand('vscode.changes', title, resources);
    return title;
  }

  dispose(): void {
    this.registration.dispose();
  }
}

/** History previews (D-33): what an entry changed, or how the files now differ from it. */
export class HistoryPreviews implements vscode.Disposable {
  private readonly previews = new DiffPreviews(HISTORY_SCHEME, EXPIRED_PREVIEW_TEXT);

  /** Opens the diff of one history entry beside the board; resolves with the title of the diff editor. */
  async show(diff: HistoryDiff, root: string, boardColumn: vscode.ViewColumn | undefined): Promise<string> {
    const id = this.previews.nextId();
    return this.previews.show(id, previewTitle(diff), previewRows(diff, id), root, boardColumn);
  }

  dispose(): void {
    this.previews.dispose();
  }
}

/** The raw Lean diff of a proposal: the run's base on the left, the proposal on the right. */
export class ProposalPreviews implements vscode.Disposable {
  private readonly previews = new DiffPreviews(PROPOSAL_SCHEME, EXPIRED_PROPOSAL_TEXT);

  async show(diff: ProposalDiff, root: string, boardColumn: vscode.ViewColumn | undefined): Promise<string> {
    const id = this.previews.nextId();
    return this.previews.show(id, diff.title, proposalRows(diff, id), root, boardColumn);
  }

  dispose(): void {
    this.previews.dispose();
  }
}
