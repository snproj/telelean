/**
 * Persistence of runs (docs/m2-plan.md section 4.6): `run.json` (PersistedRun) rewritten atomically after every state
 * change (a temp file in the run directory, then rename), `session/transcript.jsonl` appended with every user turn,
 * event, tool call and result and state change ("exact texts saved", 03 section 14), and the scan of a root's run
 * directories for recovery.
 */
import { renameSync, writeFileSync } from 'node:fs';
import { appendFile, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isTerminalRunState, type RunState } from '@telelean/core';

import { rootKeyOf } from '../shadow/index.js';
import { PERSISTED_RUN_FORMAT, PERSISTED_SESSION_FORMAT, type PersistedRun } from './types.js';

let tempCounter = 0;

/** Atomic replace: write a temp file next to `file`, then rename it over `file`. */
export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const text = `${JSON.stringify(value, null, 1)}\n`;
  await writeTextAtomic(file, text);
}

/** The directory must exist already (a run's files never recreate a run directory that was deleted or pruned). */
export async function writeTextAtomic(file: string, text: string): Promise<void> {
  const temp = `${file}.tmp-${process.pid}-${++tempCounter}`;
  try {
    await writeFile(temp, text, { encoding: 'utf8', mode: 0o600 });
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** The same, synchronously (dispose(): the window may be closing). */
export function writeTextAtomicSync(file: string, text: string): void {
  const temp = `${file}.tmp-${process.pid}-${++tempCounter}`;
  writeFileSync(temp, text, { encoding: 'utf8', mode: 0o600 });
  renameSync(temp, file);
}

/**
 * A run.json of version 1 (M2's runs, slice 1's) or 2 (slice 2: an edit session, docs/slice2-plan.md 2.6), so a
 * version-2 run is never dropped on recovery. A version-2 run must hold its session (format and arrays checked); a
 * version-1 run is read as before (a v1 run in review is converted when it is recovered, §3.11).
 */
export function isPersistedRun(value: unknown): value is PersistedRun {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<PersistedRun>;
  if (v.format !== PERSISTED_RUN_FORMAT || typeof v.view !== 'object' || v.view === null || typeof v.view.runId !== 'string') return false;
  if (v.version === 1) return true;
  if (v.version !== 2) return false;
  const s = v.session as unknown as Record<string, unknown> | undefined;
  if (typeof s !== 'object' || s === null || s['format'] !== PERSISTED_SESSION_FORMAT || s['version'] !== 1 || typeof s['head'] !== 'string') return false;
  return ['inferences', 'steps', 'queue', 'retry', 'items', 'premises', 'ledger', 'rejectedArrows', 'events'].every((k) => Array.isArray(s[k]));
}

export async function readPersistedRun(file: string): Promise<PersistedRun | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
    return isPersistedRun(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export interface ScannedRun {
  runDir: string;
  stateFile: string;
  run: PersistedRun;
}

/** The run directories of `root` under `runsDir` whose run.json is readable, newest first (by `view.updatedAt`). */
export async function scanRuns(runsDir: string, root: string): Promise<ScannedRun[]> {
  const base = path.join(runsDir, rootKeyOf(root));
  let entries: string[];
  try {
    entries = await readdir(base);
  } catch {
    return [];
  }
  const out: ScannedRun[] = [];
  for (const name of entries) {
    const runDir = path.join(base, name);
    const stateFile = path.join(runDir, 'run.json');
    const run = await readPersistedRun(stateFile);
    if (run !== undefined && path.resolve(run.root) === path.resolve(root)) out.push({ runDir, stateFile, run });
  }
  const time = (r: ScannedRun): number => Date.parse(r.run.view.updatedAt) || Date.parse(r.run.view.startedAt) || 0;
  return out.sort((a, b) => time(b) - time(a));
}

export function nonTerminal(state: RunState): boolean {
  return !isTerminalRunState(state);
}

/**
 * Serialised writes of one run's files: `run.json` snapshots (each write takes the text captured when it was
 * queued, so the file always holds a state the run really passed through) and transcript lines (in order).
 */
export class RunFiles {
  private chain: Promise<unknown> = Promise.resolve();
  private failed = false;
  /** Set by close(): run.json snapshots queued earlier and not yet started are dropped (the final state wins). */
  private closed = false;

  constructor(
    readonly stateFile: string,
    readonly transcriptFile: string,
    private readonly log: (message: string) => void,
  ) {}

  /** Queues an atomic write of `text` to run.json; resolves when it (and everything queued before) is written. */
  writeState(text: string): Promise<void> {
    if (this.closed) return this.flush();
    return this.enqueue(() => (this.closed ? Promise.resolve() : writeTextAtomic(this.stateFile, text)));
  }

  /**
   * Slice 2 (docs/slice2-plan.md 2.6): the same write, in the same order, but it rejects when the write fails (or when
   * the files were closed: the window is closing, nothing more may be recorded), where `writeState` logs the failure
   * and resolves. A session write's steps 1 and 4 use it: a failed step 1 aborts the write.
   */
  writeStateChecked(text: string): Promise<void> {
    if (this.closed) return Promise.reject(new Error('the run is closing'));
    const job = (): Promise<void> => (this.closed ? Promise.reject(new Error('the run is closing')) : writeTextAtomic(this.stateFile, text));
    const run = this.chain.then(job, job);
    this.chain = run.catch((e: unknown) => {
      this.log(`run.json could not be written: ${(e as Error).message}`);
    });
    return run;
  }

  writeStateSync(text: string): void {
    try {
      writeTextAtomicSync(this.stateFile, text);
    } catch (e) {
      this.log(`run.json could not be written: ${(e as Error).message}`);
    }
  }

  /**
   * The last write of this run's files (RunManager.dispose; integrator fix of the M2 dispose race): writes `finalText`
   * to run.json at once (synchronously, in case the host exits right away), drops the run.json snapshots queued
   * before that have not started, and writes `finalText` again after the write still in flight (whose rename could
   * otherwise land after the synchronous one and leave an older state). Transcript lines already queued are still
   * appended. Resolves once run.json holds `finalText`; later writeState calls change nothing.
   */
  close(finalText: string): Promise<void> {
    this.writeStateSync(finalText);
    if (this.closed) return this.flush();
    this.closed = true;
    const final = this.chain.then(
      () => writeTextAtomic(this.stateFile, finalText),
      () => writeTextAtomic(this.stateFile, finalText),
    );
    this.chain = final.catch((e: unknown) => this.log(`run.json could not be written: ${(e as Error).message}`));
    return this.flush();
  }

  /** Queues one transcript line (JSON). The session directory exists from the shadow's creation on. */
  transcript(entry: Record<string, unknown>): Promise<void> {
    const line = `${JSON.stringify(entry)}\n`;
    return this.enqueue(() => appendFile(this.transcriptFile, line, { encoding: 'utf8', mode: 0o600 }));
  }

  /** Resolves once every queued write has finished. */
  flush(): Promise<void> {
    return this.chain.then(() => undefined);
  }

  private enqueue(job: () => Promise<void>): Promise<void> {
    const run = this.chain.then(job, job).catch((e: unknown) => {
      if (!this.failed) this.log(`a run file could not be written: ${(e as Error).message}`);
      this.failed = true;
    });
    this.chain = run;
    return run;
  }
}
