/**
 * Disk-only TextSource and EditApplier for a model root. The extension uses its own (open editor buffers first,
 * WorkspaceEdit + save); these serve tests, the integrator's end-to-end test and later command-line use.
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ActionError, type FileChange } from '@telelean/core';

import { assertRelativePath } from './files.js';
import type { EditApplier, TextSource } from './types.js';

function resolveInside(root: string, rel: string): string {
  assertRelativePath(rel);
  const base = path.resolve(root);
  const absolute = path.resolve(base, rel);
  if (!absolute.startsWith(base + path.sep)) throw new TypeError(`${rel} is outside ${base}`);
  return absolute;
}

async function readOrNull(absolute: string): Promise<string | null> {
  try {
    return await readFile(absolute, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    throw error;
  }
}

let tempCounter = 0;

/**
 * Writes atomically (a temp file, then rename). The temp file lives in the root's `.telelean/` folder, which the
 * scaffold's `.gitignore` line `/.telelean/*.tmp` covers, so a crash between write and rename leaves nothing git
 * would offer to commit.
 */
async function writeOrDelete(root: string, absolute: string, text: string | null): Promise<void> {
  if (text === null) {
    await rm(absolute, { force: true });
    return;
  }
  await mkdir(path.dirname(absolute), { recursive: true });
  const tempDir = path.join(path.resolve(root), '.telelean');
  await mkdir(tempDir, { recursive: true });
  const temp = path.join(tempDir, `${path.basename(absolute)}.${process.pid}-${++tempCounter}.tmp`);
  try {
    await writeFile(temp, text, 'utf8');
    await rename(temp, absolute);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** Reads files of `root` from disk (`null` when missing). */
export function fsTextSource(root: string): TextSource {
  return { read: (rel) => readOrNull(resolveInside(root, rel)) };
}

/**
 * Applies whole-file changes to disk: first checks every `before` (rejects with ActionError `conflict`, writing
 * nothing), then writes; if a write fails, the files already written are restored before rejecting.
 */
export function fsEditApplier(root: string): EditApplier {
  return {
    async apply(changes: readonly FileChange[]): Promise<void> {
      const targets = changes.map((change) => ({ change, absolute: resolveInside(root, change.path) }));
      for (const { change, absolute } of targets) {
        const current = await readOrNull(absolute);
        if (current !== change.before) {
          throw new ActionError('conflict', `${change.path} changed since the edit was planned; nothing was written.`);
        }
      }
      const done: Array<{ change: FileChange; absolute: string }> = [];
      try {
        for (const target of targets) {
          await writeOrDelete(root, target.absolute, target.change.after);
          done.push(target);
        }
      } catch (error) {
        for (const { change, absolute } of done.reverse()) {
          try {
            await writeOrDelete(root, absolute, change.before);
          } catch {
            // best effort: the original error below matters more
          }
        }
        throw error;
      }
    },
  };
}
