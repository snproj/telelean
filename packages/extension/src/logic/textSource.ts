/**
 * The runner's TextSource for one model root: what the user sees. An open editor buffer (possibly unsaved) wins over
 * the file on disk, so the board, history snapshots and the EditApplier's `before` check all agree with the editor.
 */
import { readFile } from 'node:fs/promises';

import type { TextSource } from '@telelean/runner/workspace/index.js';

import { resolveInsideRoot } from './modelPaths';

export interface TextSourcePorts {
  /** The text of the open document for this absolute path, or undefined when no document is open for it. */
  openText(absPath: string): string | undefined;
  /** The file's text on disk, or null when it does not exist. */
  readFile(absPath: string): Promise<string | null>;
}

export function createTextSource(root: string, ports: TextSourcePorts): TextSource {
  return {
    async read(file: string): Promise<string | null> {
      const absPath = resolveInsideRoot(root, file);
      const open = ports.openText(absPath);
      if (open !== undefined) return open;
      return ports.readFile(absPath);
    },
  };
}

/**
 * Reads a file as UTF-8 the way VS Code shows it: a leading byte-order mark is dropped (VS Code's document text never
 * contains it). Missing files (or a missing parent directory) give null.
 */
export async function readTextFile(absPath: string): Promise<string | null> {
  try {
    const text = await readFile(absPath, 'utf8');
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    throw error;
  }
}
