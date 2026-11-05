/**
 * The read-only preview of a history entry (D-33, docs/m1-plan.md section 8 "Preview"): the runner's HistoryDiff
 * becomes VS Code's multi-file diff (`vscode.changes`) over documents served by a `telelean-history:` content
 * provider. This module holds the vscode-free part: titles, the documents' identities and a bounded store.
 */
import type { HistoryDiff } from '@telelean/core';

export const HISTORY_SCHEME = 'telelean-history';

/** One side of one file in a preview: `key` identifies the document (its URI query), `path` names the file. */
export interface PreviewDocument {
  key: string;
  path: string;
  text: string;
}

/** One row of the multi-file diff: absent sides are a created (no left) or deleted (no right) file. */
export interface PreviewRow {
  path: string;
  left?: PreviewDocument;
  right?: PreviewDocument;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `2026-11-01 14:05` in local time (the ISO text itself when it does not parse). */
export function formatEntryTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** `14:05` today, `Oct 31 14:05` earlier this year, else `2025-10-31 14:05` (local time). */
export function shortEntryTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (date.getFullYear() !== now.getFullYear()) return formatEntryTime(iso);
  if (date.getMonth() === now.getMonth() && date.getDate() === now.getDate()) return time;
  return `${MONTHS[date.getMonth()]} ${date.getDate()} ${time}`;
}

/** Longest label the preview's tab title shows before it is cut with "…". */
export const PREVIEW_LABEL_MAX = 40;

/**
 * The diff editor's tab title, kept short so the board's tab keeps its place in the tab strip:
 * `History: Add assumption: Cynder can fly (14:05)`, with ` vs now` when it compares the entry with the files now.
 */
export function previewTitle(diff: HistoryDiff, now: Date = new Date()): string {
  const label = diff.entry.label.length > PREVIEW_LABEL_MAX ? `${diff.entry.label.slice(0, PREVIEW_LABEL_MAX - 1).trimEnd()}…` : diff.entry.label;
  return `History: ${label} (${shortEntryTime(diff.entry.time, now)})${diff.compare === 'current' ? ' vs now' : ''}`;
}

/**
 * The rows of a preview. `compare: 'parent'` shows what the entry changed (parent on the left, entry on the right);
 * `compare: 'current'` shows how the files now differ from the entry (entry on the left, current on the right): the
 * runner's FileChange `before`/`after` already follow that order.
 */
export function previewRows(diff: HistoryDiff, previewId: string): PreviewRow[] {
  return diff.files.map((file) => {
    const side = (name: 'before' | 'after', text: string | null): PreviewDocument | undefined =>
      text === null ? undefined : { key: `preview=${previewId}&side=${name}&entry=${diff.entry.id}`, path: file.path, text };
    const left = side('before', file.before);
    const right = side('after', file.after);
    return { path: file.path, ...(left ? { left } : {}), ...(right ? { right } : {}) };
  });
}

/** Documents of the last few previews (older ones are dropped; reopening shows a placeholder). */
export class PreviewStore {
  private readonly previews: Array<{ id: string; keys: string[] }> = [];
  private readonly texts = new Map<string, string>();

  constructor(private readonly keepPreviews = 10) {}

  add(id: string, rows: readonly PreviewRow[]): void {
    const keys: string[] = [];
    for (const row of rows) {
      for (const doc of [row.left, row.right]) {
        if (!doc) continue;
        this.texts.set(this.documentKey(doc.path, doc.key), doc.text);
        keys.push(this.documentKey(doc.path, doc.key));
      }
    }
    this.previews.push({ id, keys });
    while (this.previews.length > this.keepPreviews) {
      for (const key of this.previews.shift()?.keys ?? []) this.texts.delete(key);
    }
  }

  /** The text of a preview document by its URI path (`/<file>`) and query. */
  get(uriPath: string, query: string): string | undefined {
    return this.texts.get(this.documentKey(uriPath.replace(/^\/+/, ''), query));
  }

  private documentKey(path: string, query: string): string {
    return `${query}\u0000${path}`;
  }
}

export const EXPIRED_PREVIEW_TEXT =
  '// This telelean history preview is no longer available (it was opened in an earlier session, or many previews ago).\n// Open it again from the board: History ▸ Preview.\n';
