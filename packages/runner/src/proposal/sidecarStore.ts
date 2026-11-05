/**
 * The run sidecars on disk (WP4; docs/m2-plan.md section 7.3; formats core run.ts; paths core paths.ts):
 *
 *   .telelean/subjects/<S>/attempts.jsonl   append-only: each line is written with ONE write() on a file descriptor
 *                                           opened with O_APPEND, so lines of concurrent writers (another window,
 *                                           another store) never interleave; a missing final newline (a hand edit)
 *                                           is completed first so a line never joins the previous one
 *   .telelean/subjects/<S>/decisions.json   read-modify-write, replaced atomically: a temp file inside `.telelean/`
 *                                           (covered by the scaffold's `/.telelean/*.tmp` gitignore line), fsync,
 *                                           rename over the old file
 *
 * Neither file goes through the EditApplier: they are logs of what happened and what the user answered, never undone,
 * never in history snapshots (workspace/files.ts isSubjectSidecarFile covers only layout.json and attic/), and
 * committed with the user's own commits (D-12). Within one process every write to one file runs after the previous
 * one (a per-file queue), so concurrent `recordDecisions` calls never lose an update.
 */
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import {
  addDecisions,
  attemptsPath,
  decisionsPath,
  isSubjectName,
  parseAttemptLines,
  parseDecisionsFile,
  serializeAttemptLine,
  serializeDecisionsFile,
  summariseAttempts,
  TELELEAN_DIR,
  type AttemptLine,
  type AttemptRecord,
  type AttemptResolution,
  type AttemptSummary,
  type DecisionRecord,
  type DecisionsFile,
} from '@telelean/core';

import type { RunSidecarStore, SidecarCore } from './types.js';

let tempCounter = 0;

/** Per absolute file path: the tail of its write queue (shared by every store of this process). */
const queues = new Map<string, Promise<unknown>>();

function serially<T>(file: string, job: () => Promise<T>): Promise<T> {
  const previous = queues.get(file) ?? Promise.resolve();
  const run = previous.then(job, job);
  const tail = run.catch(() => undefined);
  queues.set(file, tail);
  void tail.then(() => {
    if (queues.get(file) === tail) queues.delete(file);
  });
  return run;
}

async function readOrNull(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    throw error;
  }
}

/** Defaults overridden only by the members that are actually set. */
function withDefaults<T extends object>(defaults: T, partial: Partial<T> | undefined): T {
  const out = { ...defaults };
  for (const [key, value] of Object.entries(partial ?? {})) if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  return out;
}

function checkRoot(root: string): string {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new TypeError(`the model root must be an absolute path, got ${JSON.stringify(root)}`);
  return path.resolve(root);
}

function checkSubject(subject: string): string {
  if (typeof subject !== 'string' || !isSubjectName(subject)) throw new TypeError(`not a subject name: ${JSON.stringify(subject)}`);
  return subject;
}

/** Writes all of `data` at the end of the file (O_APPEND: the kernel positions every write at the current end). */
async function writeAll(handle: import('node:fs/promises').FileHandle, data: Buffer): Promise<void> {
  let offset = 0;
  while (offset < data.length) {
    const { bytesWritten } = await handle.write(data, offset, data.length - offset, null);
    if (bytesWritten <= 0) throw new Error('could not append to the attempts log');
    offset += bytesWritten;
  }
}

export class DiskSidecarStore implements RunSidecarStore {
  private readonly core: SidecarCore;

  constructor(options: { core?: Partial<SidecarCore> } = {}) {
    this.core = withDefaults<SidecarCore>(
      { parseAttemptLines, serializeAttemptLine, summariseAttempts, parseDecisionsFile, serializeDecisionsFile, addDecisions },
      options.core,
    );
  }

  async appendAttempt(root: string, record: AttemptRecord): Promise<void> {
    await this.appendLine(checkRoot(root), checkSubject(record.subject), record);
  }

  async resolveAttempt(root: string, subject: string, resolution: AttemptResolution): Promise<void> {
    await this.appendLine(checkRoot(root), checkSubject(subject), resolution);
  }

  async recordDecisions(root: string, subject: string, records: readonly DecisionRecord[]): Promise<void> {
    const base = checkRoot(root);
    const file = path.join(base, decisionsPath(checkSubject(subject)));
    return serially(file, async () => {
      const next = this.core.serializeDecisionsFile(this.core.addDecisions(this.core.parseDecisionsFile(await readOrNull(file)), records));
      await mkdir(path.dirname(file), { recursive: true });
      const tempDir = path.join(base, TELELEAN_DIR);
      await mkdir(tempDir, { recursive: true });
      const temp = path.join(tempDir, `decisions-${subject}.${process.pid}-${++tempCounter}.tmp`);
      try {
        const handle = await open(temp, 'wx', 0o644);
        try {
          await handle.writeFile(next, 'utf8');
          await handle.sync();
        } finally {
          await handle.close();
        }
        await rename(temp, file);
      } catch (error) {
        await rm(temp, { force: true }).catch(() => undefined);
        throw error;
      }
    });
  }

  async readAttempts(root: string, subject: string): Promise<AttemptSummary[]> {
    const text = await readOrNull(path.join(checkRoot(root), attemptsPath(checkSubject(subject))));
    if (text === null) return [];
    return this.core.summariseAttempts(this.core.parseAttemptLines(text));
  }

  async readDecisions(root: string, subject: string): Promise<DecisionsFile> {
    return this.core.parseDecisionsFile(await readOrNull(path.join(checkRoot(root), decisionsPath(checkSubject(subject)))));
  }

  private async appendLine(root: string, subject: string, line: AttemptLine): Promise<void> {
    const text = this.core.serializeAttemptLine(line);
    if (/[\r\n]/.test(text)) throw new Error('an attempts.jsonl line must not contain a line break');
    const file = path.join(root, attemptsPath(subject));
    return serially(file, async () => {
      await mkdir(path.dirname(file), { recursive: true });
      const handle = await open(file, 'a+', 0o644);
      try {
        const { size } = await handle.stat();
        let prefix = '';
        if (size > 0) {
          const last = Buffer.alloc(1);
          await handle.read(last, 0, 1, size - 1);
          if (last[0] !== 0x0a) prefix = '\n';
        }
        await writeAll(handle, Buffer.from(`${prefix}${text}\n`, 'utf8'));
      } finally {
        await handle.close();
      }
    });
  }
}
