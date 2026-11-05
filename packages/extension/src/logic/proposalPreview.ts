/**
 * The raw Lean diff of a Claude proposal ("Raw Lean diff…", `openProposalDiff`, docs/m2-plan.md section 8.1): the
 * RunManager's whole-file changes (the run's base on the left, the proposal on the right) become VS Code's
 * multi-file diff (`vscode.changes`) over read-only documents of a `telelean-proposal:` content provider, the same
 * way a history preview works (historyPreview.ts). This module holds the vscode-free part.
 */
import type { FileChange } from '@telelean/core';

import type { PreviewRow } from './historyPreview';

export const PROPOSAL_SCHEME = 'telelean-proposal';

/** What the board session hands the host to show. */
export interface ProposalDiff {
  runId: string;
  proposalId: string;
  /** The diff editor's tab title. */
  title: string;
  /** `before` = the run's base (the user's files when the run started), `after` = the proposal. */
  files: FileChange[];
}

/** `Raw Lean diff: Spyro (round 1)`, or `Raw Lean diff: Main.lean` when one file is shown. */
export function proposalDiffTitle(input: { subject?: string; round?: number; file?: string }): string {
  if (input.file !== undefined) return `Raw Lean diff: ${input.file.slice(input.file.lastIndexOf('/') + 1)}`;
  if (input.subject === undefined) return 'Raw Lean diff';
  return `Raw Lean diff: ${input.subject}${input.round !== undefined ? ` (round ${input.round})` : ''}`;
}

/** The rows of a proposal diff (a created file has no left side, a deleted one no right side). */
export function proposalRows(diff: ProposalDiff, previewId: string): PreviewRow[] {
  return diff.files.map((file) => {
    const side = (name: 'base' | 'proposal', text: string | null) =>
      text === null ? undefined : { key: `preview=${previewId}&side=${name}&run=${diff.runId}&proposal=${diff.proposalId}`, path: file.path, text };
    const left = side('base', file.before);
    const right = side('proposal', file.after);
    return { path: file.path, ...(left ? { left } : {}), ...(right ? { right } : {}) };
  });
}

export const EXPIRED_PROPOSAL_TEXT =
  "// This raw Lean diff of Claude's proposal is no longer available (it was opened in an earlier session, or many diffs ago).\n// Open it again from the board: Raw Lean diff….\n";
