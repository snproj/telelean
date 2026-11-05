/**
 * Pure helpers of the proposal service (WP4; docs/m2-plan.md sections 4.5 and 7.1): which files a proposal deals
 * with, whole-file diffs and line counts for the raw diff and the files summary, and the 3-way merge Accept uses
 * when the user's real files changed during the run.
 *
 * The merge is M1's undo technique (workspace/undo.ts) pointed the other way: Claude's base -> shown change of a file
 * as a `diff` 9.0.0 structured patch with exactly 3 context lines, applied to the user's real text with no fuzz.
 * Because of the context lines, a user's edit within 3 lines of a change of Claude's makes the hunk unplaceable,
 * which is reported as a conflict naming the file. (diff 9.0.0's own default is 4 context lines; the plan fixes 3.)
 */
import { applyPatch, structuredPatch } from 'diff';

import type { FileChange, FileChangeKind, ProposalFile } from '@telelean/core';

import { isModelOrProjectFile } from '../workspace/files.js';

/** Context lines of Accept's patches (docs/m2-plan.md section 7.1: "a user edit within 3 lines … is a conflict"). */
export const MERGE_CONTEXT_LINES = 3;

/** The entries of `files` that a shadow and Accept deal with (model files and the project files), as a new map. */
export function shadowFilesOf(files: ReadonlyMap<string, string>, library: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [rel, text] of files) if (isModelOrProjectFile(rel, library)) out.set(rel, text);
  return out;
}

/** Files that differ between two path -> text maps, as changes `before` -> `after`, sorted by path. */
export function diffFileMaps(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): FileChange[] {
  const out: FileChange[] = [];
  for (const rel of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const b = before.get(rel) ?? null;
    const a = after.get(rel) ?? null;
    if (b !== a) out.push({ path: rel, before: b, after: a });
  }
  return out;
}

/** Lines added and removed by a whole-file change (a created file: all its lines added; a deleted one: all removed). */
export function lineCounts(before: string | null, after: string | null): { additions: number; deletions: number } {
  const patch = structuredPatch('a', 'b', before ?? '', after ?? '', undefined, undefined, { context: 0 });
  let additions = 0;
  let deletions = 0;
  for (const hunk of patch.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith('+')) additions++;
      else if (line.startsWith('-')) deletions++;
    }
  }
  return { additions, deletions };
}

export function proposalFileOf(change: FileChange): ProposalFile {
  const kind: FileChangeKind = change.before === null ? 'added' : change.after === null ? 'deleted' : 'modified';
  return { path: change.path, change: kind, ...lineCounts(change.before, change.after) };
}

/** The result of merging one file: its new text (null: the file does not exist), or a conflict. */
export type MergeResult = { ok: true; text: string | null } | { ok: false };

/**
 * One file of Accept's rebase: `base` (the run's base), `shown` (the proposal), `real` (the user's file now; null =
 * missing). Files Claude did not change keep the user's text; files the user did not change (or changed the same
 * way) get Claude's; otherwise Claude's patch is applied to the user's text with no fuzz. Creating, deleting or
 * changing a file that the other side created, deleted or changed differently is a conflict.
 */
export function mergeFile(path: string, base: string | null, shown: string | null, real: string | null): MergeResult {
  if (shown === base) return { ok: true, text: real };
  if (real === base || real === shown) return { ok: true, text: shown };
  if (base === null || shown === null || real === null) return { ok: false };
  const patch = structuredPatch(path, path, base, shown, undefined, undefined, { context: MERGE_CONTEXT_LINES });
  const merged = applyPatch(real, patch, { fuzzFactor: 0 });
  return merged === false ? { ok: false } : { ok: true, text: merged };
}

/** "a", "a and b", "a, b and c". */
export function listing(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] ?? ''}`;
}

/** The refusal sentence of a rebase conflict (docs/m2-plan.md section 7.1 step 3). */
export function conflictMessage(files: readonly string[]): string {
  return `Your edits to ${listing(files)} since the run started overlap Claude's; Discard, or Feedback to redo it on your current files.`;
}
