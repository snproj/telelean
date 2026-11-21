/**
 * Pure helpers of the proposal service (WP4; docs/m2-plan.md sections 4.5 and 7.1): which files a proposal deals
 * with, whole-file diffs and line counts for the raw diff and the files summary, and the 3-way merge Accept uses
 * when the user's real files changed during the run.
 *
 * The merge is M1's undo technique (workspace/undo.ts) pointed the other way: Claude's base -> shown change of a file
 * as a `diff` 9.0.0 structured patch with exactly 3 context lines, applied to the user's real text with no fuzz.
 * Because of the context lines, a user's edit within 3 lines of a change of Claude's makes the hunk unplaceable,
 * which is reported as a conflict naming the file. (diff 9.0.0's own default is 4 context lines; the plan fixes 3.)
 *
 * Turn 13 (fresh models, the demo path): the board's own edits are taken out first and put back afterwards (see
 * `boardEditsOf`): cards the person added at the end of a namespace and rationales they wrote. On a freshly typed
 * Inbox every card is within 3 lines of Claude's formalisation, so before this any card added or reason given while
 * Claude worked made Accept a conflict. Everything else keeps the 3-line rule; Accept re-gates whatever it merges.
 */
import { applyPatch, structuredPatch } from 'diff';

import {
  applyTextEdits,
  insertBlockEdits,
  parseLeanFile,
  removeBlockEdits,
  setBlockField,
  type FileChange,
  type FileChangeKind,
  type MarkupBlock,
  type ParsedFile,
  type ProposalFile,
  type TextEdit,
} from '@telelean/core';

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
  if (merged !== false) return { ok: true, text: merged };
  // Turn 13: the board's own edits are placed by card id instead of by line, so they never overlap Claude's.
  const board = path.endsWith('.lean') ? boardEditsOf(path, base, real) : undefined;
  if (board === undefined) return { ok: false };
  const onRest = board.rest === base ? shown : applyPatch(board.rest, patch, { fuzzFactor: 0 });
  if (onRest === false) return { ok: false };
  const restored = board.restore(onRest);
  return restored === undefined ? { ok: false } : { ok: true, text: restored };
}

/**
 * Slice 2e (docs/slice2-plan.md 3.6 un-reject, 4.6 Undo): a shadow commit's inverse merged onto the head. For every file
 * the commit changed (its parent's text -> its own), the change back (its own text -> its parent's) is merged onto the
 * head's text with `mergeFile` (a head that still holds the commit's text gets the parent's at once; otherwise the inverse
 * patch, 3 context lines, no fuzz). Files the commit did not change keep the head's text. The merged file set, or the
 * first file (in path order) whose merge conflicts: content a later write changed next to it, so "This version can't be
 * restored any more" (fail closed: nothing is merged).
 */
export function inverseMerge(
  commit: ReadonlyMap<string, string>,
  parent: ReadonlyMap<string, string>,
  head: ReadonlyMap<string, string>,
): { ok: true; files: Map<string, string> } | { ok: false; file: string } {
  const files = new Map(head);
  for (const rel of [...new Set([...commit.keys(), ...parent.keys()])].sort()) {
    const mine = commit.get(rel) ?? null;
    const before = parent.get(rel) ?? null;
    if (mine === before) continue;
    const merged = mergeFile(rel, mine, before, files.get(rel) ?? null);
    if (!merged.ok) return { ok: false, file: rel };
    if (merged.text === null) files.delete(rel);
    else files.set(rel, merged.text);
  }
  return { ok: true, files };
}

/** The board's edits of one file, taken out of the user's text (`rest`) and put back into a merged text. */
export interface BoardEdits {
  /** The user's text without those edits (the 3-line patch is applied to it). */
  rest: string;
  /** The merged text with the edits put back by card id, or undefined when they no longer fit. */
  restore(merged: string): string | undefined;
}

const blockText = (file: ParsedFile, block: MarkupBlock): string => file.text.slice(block.span.start, block.span.end);
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The edits the board makes while a run works (turn 13), when they are ALL the user changed in `real` apart from
 * text the 3-line patch can still place:
 *  - a card added by the A|D|G box: a new block (an id the base does not have, `id:` written, no `lean:` field,
 *    bound to nothing) followed by nothing but blank space and other such blocks up to the `end <namespace>` line
 *    of its (single) namespace, exactly where `add-node` puts it; it goes back to the end of that namespace;
 *  - a rationale written or changed on an existing card (the board asks for one on every assumption): the block
 *    reads exactly as in the base once its `rationale:` field is set back; the field goes back on that card. A
 *    rationale has no formal effect; every other field (the sentence above all) keeps the 3-line rule, so a
 *    sentence changed next to Claude's formalisation of it stays a conflict.
 * Undefined when there is no such edit, or when the file cannot be read as telelean text.
 */
export function boardEditsOf(path: string, base: string, real: string): BoardEdits | undefined {
  const b = parseLeanFile(path, base);
  const r = parseLeanFile(path, real);
  const baseBlocks = new Map(b.blocks.map((block) => [block.id, block]));
  if (baseBlocks.size !== b.blocks.length || new Set(r.blocks.map((block) => block.id)).size !== r.blocks.length) return undefined;

  // Rationales: set back to the base's value, after which the block must read exactly as in the base.
  const rationales: Array<{ id: string; value: string | null }> = [];
  const rationaleEdits: TextEdit[] = [];
  for (const block of r.blocks) {
    const was = baseBlocks.get(block.id);
    if (was === undefined || blockText(r, block) === blockText(b, was)) continue;
    if ((block.fields.rationale ?? null) === (was.fields.rationale ?? null)) continue;
    rationales.push({ id: block.id, value: block.fields.rationale ?? null });
    rationaleEdits.push(...setBlockField(r, block, 'rationale', was.fields.rationale ?? null));
  }
  let rest = rationaleEdits.length > 0 ? applyTextEdits(real, rationaleEdits) : real;
  if (rationales.length > 0) {
    const restFile = parseLeanFile(path, rest);
    for (const { id } of rationales) {
      const now = restFile.blocks.find((block) => block.id === id);
      const was = baseBlocks.get(id);
      if (now === undefined || was === undefined || blockText(restFile, now) !== blockText(b, was)) return undefined;
    }
  }

  // Added cards: the run of new blocks that ends the file's namespace (only blank space between them and after the
  // last one before `end <namespace>`), in file order.
  const eligible = (block: MarkupBlock): boolean =>
    !baseBlocks.has(block.id) && block.idWritten && block.fields.lean === undefined && block.binding.mode === 'none' && block.namespace?.length === 1;
  const cards: Array<{ id: string; text: string; namespace: string }> = [];
  let after: { start: number; namespace: string } | undefined;
  for (let i = r.blocks.length - 1; i >= 0; i--) {
    const block = r.blocks[i] as MarkupBlock;
    if (!eligible(block)) break;
    const namespace = (block.namespace as string[])[0] as string;
    const following = real.slice(block.span.end, after?.start ?? real.length);
    const fits =
      after === undefined ? new RegExp(`^\\s*end\\s+${escapeRegExp(namespace)}(?![\\w.'!?])`).test(following) : after.namespace === namespace && /^\s*$/.test(following);
    if (!fits) break;
    cards.unshift({ id: block.id, text: blockText(r, block), namespace });
    after = { start: block.span.start, namespace };
  }
  for (const card of cards) {
    const file = parseLeanFile(path, rest);
    const block = file.blocks.find((x) => x.id === card.id);
    if (block === undefined) return undefined;
    rest = applyTextEdits(rest, removeBlockEdits(file, block));
  }
  if (rationales.length === 0 && cards.length === 0) return undefined;

  return {
    rest,
    restore(merged: string): string | undefined {
      let text = merged;
      for (const { id, value } of rationales) {
        const file = parseLeanFile(path, text);
        const block = file.blocks.find((x) => x.id === id);
        if (block === undefined) return undefined;
        text = applyTextEdits(text, setBlockField(file, block, 'rationale', value));
      }
      for (const card of cards) {
        const file = parseLeanFile(path, text);
        if (file.blocks.some((x) => x.id === card.id)) return undefined;
        text = applyTextEdits(text, insertBlockEdits(file, card.text, { kind: 'end-of-namespace', namespace: card.namespace }));
      }
      // What was put back reads as the user wrote it.
      const out = parseLeanFile(path, text);
      for (const card of cards) {
        const block = out.blocks.find((x) => x.id === card.id);
        if (block === undefined || blockText(out, block) !== card.text || block.binding.mode !== 'none') return undefined;
      }
      for (const { id, value } of rationales) {
        if ((out.blocks.find((x) => x.id === id)?.fields.rationale ?? null) !== value) return undefined;
      }
      return text;
    },
  };
}

/** "a", "a and b", "a, b and c". */
export function listing(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] ?? ''}`;
}

/**
 * The refusal sentence of a rebase conflict (docs/m2-plan.md section 7.1 step 3). Turn 13: it used to offer "Feedback to
 * redo it on your current files", but Feedback continues on the run's working copy (it never rebases onto the person's
 * files), so the same Accept met the same conflict; undoing the overlapping edits is what makes the patch fit.
 */
export function conflictMessage(files: readonly string[]): string {
  return `Your edits to ${listing(files)} since the run started overlap Claude's; Discard, or undo those edits and Accept again.`;
}
