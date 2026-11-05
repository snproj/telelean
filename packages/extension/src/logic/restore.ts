/**
 * Which model root and subject a board shows after a window reload (D-22: the board is an editor tab that restores).
 *
 * VS Code hands the WebviewPanelSerializer the panel (with its title) and whatever state the webview saved with
 * `setState`. The host cannot write that state itself, so it keeps its own record per window (the extension's
 * workspaceState): one entry per board with its title, root and subject, updated whenever the subject changes.
 * Restoring matches, in order: a root (and subject) the webview saved, if any; the recorded entry with the panel's
 * title; the only root whose folder name the title names; the only model root of the window.
 */
import * as path from 'node:path';

/** What the host records for a board (and what a webview may save in its state). */
export interface BoardRecord {
  root: string;
  subject?: string;
  title: string;
}

export const BOARD_TITLE_PREFIX = 'telelean: ';

/** "telelean: <folder>", with the parent folder added when two model roots share a folder name. */
export function boardTitle(root: string, otherRoots: readonly string[] = []): string {
  const name = path.basename(root);
  const clash = otherRoots.some((other) => other !== root && path.basename(other) === name);
  return clash ? `${BOARD_TITLE_PREFIX}${name} (${path.basename(path.dirname(root))})` : `${BOARD_TITLE_PREFIX}${name}`;
}

function stringField(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' && field.length > 0 ? field : undefined;
}

export interface RestoreInput {
  /** The webview's saved state (opaque; `root`/`subject` are used when present, also under a `telelean` key). */
  state: unknown;
  /** The restored panel's title. */
  title: string;
  /** Model roots known now (absolute paths). */
  roots: readonly string[];
  /** The host's records, newest first. */
  records: readonly BoardRecord[];
}

export interface RestoreTarget {
  root: string;
  subject?: string;
}

export function restoreTarget({ state, title, roots, records }: RestoreInput): RestoreTarget | undefined {
  const nested = typeof state === 'object' && state !== null ? (state as Record<string, unknown>)['telelean'] : undefined;
  for (const source of [state, nested]) {
    const root = stringField(source, 'root');
    if (root && (roots.includes(root) || records.some((r) => r.root === root))) {
      const subject = stringField(source, 'subject') ?? records.find((r) => r.root === root)?.subject;
      return subject ? { root, subject } : { root };
    }
  }
  const record = records.find((r) => r.title === title);
  if (record) return record.subject ? { root: record.root, subject: record.subject } : { root: record.root };
  if (title.startsWith(BOARD_TITLE_PREFIX)) {
    const named = roots.filter((root) => boardTitle(root, roots) === title || path.basename(root) === title.slice(BOARD_TITLE_PREFIX.length));
    if (named.length === 1 && named[0]) return withSubject(named[0], records);
  }
  if (roots.length === 1 && roots[0]) return withSubject(roots[0], records);
  return undefined;
}

function withSubject(root: string, records: readonly BoardRecord[]): RestoreTarget {
  const subject = records.find((r) => r.root === root)?.subject;
  return subject ? { root, subject } : { root };
}

/** The records after a board for `record.root` showed `record.subject` (newest first, one per root, at most 50). */
export function updateRecords(records: readonly BoardRecord[], record: BoardRecord): BoardRecord[] {
  return [record, ...records.filter((r) => r.root !== record.root)].slice(0, 50);
}

/** Reads records saved by an older or newer extension leniently. */
export function parseRecords(value: unknown): BoardRecord[] {
  if (!Array.isArray(value)) return [];
  const out: BoardRecord[] = [];
  for (const entry of value) {
    const root = stringField(entry, 'root');
    const title = stringField(entry, 'title');
    if (!root || !title) continue;
    const subject = stringField(entry, 'subject');
    out.push(subject ? { root, title, subject } : { root, title });
  }
  return out;
}
