/**
 * "telelean: Initialize Model Here" (D-28, docs/m1-plan.md sections 3 and 7.2), without the vscode API:
 *
 *   1. inspect the folder (runner `inspectFolder`): empty, already a model, a dependency-free Lake project, or
 *      unsupported (with the reason, e.g. Lake dependencies such as Mathlib, which M1 refuses);
 *   2. empty folder: ask the first subject's name (validated; suggested from the folder name);
 *      Lake project: confirm adding `.telelean/` and `.gitignore` lines;
 *   3. plan the files (runner `planInitialize`) and write them through the EditApplier;
 *   4. when the folder is not inside a git repository, offer `git init` for telelean's history (modal);
 *   5. open the board.
 */
import * as path from 'node:path';

import { isSubjectName, SUBJECT_NAME_PATTERN, type FileChange, type HistoryAvailability } from '@telelean/core';
import type { FolderInspection, InitializeOptions } from '@telelean/runner/workspace/index.js';

/**
 * The suggested first subject for a folder: its name as a capitalised identifier (`mental_model` -> `MentalModel`,
 * `spyro notes` -> `SpyroNotes`); characters outside `[A-Za-z0-9]` separate words and are dropped; `Subject` when
 * nothing usable is left (or the result would start with a digit).
 */
export function defaultSubjectName(folderName: string): string {
  const words = folderName.split(/[^A-Za-z0-9]+/).filter((w) => w.length > 0);
  const candidate = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('').slice(0, 64);
  return isSubjectName(candidate) ? candidate : 'Subject';
}

/** Why `value` is not a usable subject name (for the input box), or undefined when it is. */
export function subjectNameProblem(value: string): string | undefined {
  if (value.length === 0) return 'Type a name, e.g. Spyro.';
  if (SUBJECT_NAME_PATTERN.test(value)) return undefined;
  if (!/^[A-Z]/.test(value)) return 'Start with a capital letter (it becomes a Lean namespace and module name).';
  if (value.length > 64) return 'Use at most 64 characters.';
  return 'Use only letters, digits and "_" (it becomes a Lean namespace and module name).';
}

export interface InitializePorts {
  inspect(folder: string): Promise<FolderInspection>;
  /** Asks for the first subject (input box validated with `subjectNameProblem`); undefined = cancelled. */
  askSubject(folder: string, suggested: string): Promise<string | undefined>;
  /** Confirms adding telelean to an existing Lake project. */
  confirmLakeProject(folder: string, library: string, subjects: readonly string[]): Promise<boolean>;
  plan(options: InitializeOptions): FileChange[];
  /** Writes the planned files (EditApplier for that folder). */
  apply(folder: string, changes: readonly FileChange[]): Promise<void>;
  /** History availability of the new model root (`no-repo` when it is not inside a git repository). */
  historyStatus(folder: string): Promise<HistoryAvailability>;
  /** The modal "Initialize a git repository here for telelean's history?" offer. */
  offerGitInit(folder: string): Promise<boolean>;
  initGit(folder: string): Promise<HistoryAvailability>;
  openBoard(folder: string): Promise<void>;
  show(level: 'info' | 'warn' | 'error', message: string): void;
}

export type GitOutcome = 'initialized' | 'declined' | 'ready' | 'unavailable';

export type InitializeResult =
  | { status: 'initialized'; root: string; files: string[]; git: GitOutcome; gitDetail?: string; opened: boolean }
  | { status: 'already-model'; root: string; opened: boolean }
  | { status: 'unsupported'; root: string; reason: string }
  | { status: 'cancelled'; root: string }
  | { status: 'failed'; root: string; error: string };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function runInitialize(folder: string, ports: InitializePorts, options: { openBoard?: boolean } = {}): Promise<InitializeResult> {
  const openBoard = options.openBoard ?? true;
  const name = path.basename(folder);
  let inspection: FolderInspection;
  try {
    inspection = await ports.inspect(folder);
  } catch (error) {
    ports.show('error', `telelean could not inspect "${name}": ${message(error)}`);
    return { status: 'failed', root: folder, error: message(error) };
  }

  let subject: string;
  switch (inspection.kind) {
    case 'model':
      ports.show('info', `"${name}" is already a telelean model.`);
      if (openBoard) await ports.openBoard(folder);
      return { status: 'already-model', root: folder, opened: openBoard };
    case 'unsupported':
      ports.show('error', `telelean cannot initialize "${name}": ${inspection.reason}`);
      return { status: 'unsupported', root: folder, reason: inspection.reason };
    case 'empty': {
      const typed = await ports.askSubject(folder, defaultSubjectName(name));
      if (typed === undefined) return { status: 'cancelled', root: folder };
      if (subjectNameProblem(typed)) {
        const problem = `"${typed}" is not a subject name: ${subjectNameProblem(typed)}`;
        ports.show('error', problem);
        return { status: 'failed', root: folder, error: problem };
      }
      subject = typed;
      break;
    }
    case 'lake-project':
      if (!(await ports.confirmLakeProject(folder, inspection.library, inspection.subjects))) return { status: 'cancelled', root: folder };
      subject = inspection.subjects[0] ?? defaultSubjectName(name);
      break;
  }

  let changes: FileChange[];
  try {
    changes = ports.plan({ subject, inspection });
    await ports.apply(folder, changes);
  } catch (error) {
    ports.show('error', `telelean could not initialize "${name}": ${message(error)}`);
    return { status: 'failed', root: folder, error: message(error) };
  }

  let git: GitOutcome = 'unavailable';
  let gitDetail: string | undefined;
  try {
    const status = await ports.historyStatus(folder);
    if (status.state === 'ready') {
      git = 'ready';
    } else if (status.state === 'no-repo') {
      if (await ports.offerGitInit(folder)) {
        const after = await ports.initGit(folder);
        git = after.state === 'ready' ? 'initialized' : 'unavailable';
        if (after.state !== 'ready') gitDetail = after.state === 'error' ? after.detail : after.state;
      } else {
        git = 'declined';
      }
    } else {
      gitDetail = status.state === 'error' ? status.detail : status.state;
    }
  } catch (error) {
    gitDetail = message(error);
  }
  if (git === 'unavailable' && gitDetail) ports.show('warn', `telelean history is unavailable for "${name}": ${gitDetail}`);

  const files = changes.map((c) => c.path);
  ports.show('info', `Initialized the telelean model in "${name}" (${files.length} ${files.length === 1 ? 'file' : 'files'}).`);
  if (openBoard) await ports.openBoard(folder);
  return { status: 'initialized', root: folder, files, git, ...(gitDetail ? { gitDetail } : {}), opened: openBoard };
}
