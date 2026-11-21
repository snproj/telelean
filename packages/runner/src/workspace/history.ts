/**
 * D-33 history: durable snapshots of a model root as commits on private git refs (docs/m1-plan.md section 8).
 *
 *   refs/telelean/<rootKey>/subjects/<S>   one chain per subject (its root file, module directory and sidecars)
 *   refs/telelean/<rootKey>/project        the project files (library root, lakefile, toolchain, manifest, …)
 *
 * A snapshot is a commit whose tree holds exactly the scope's files (paths relative to the model root, contents as
 * given by the caller, i.e. what the user sees, unsaved typing included), whose parent is the chain's tip, and
 * whose message is the label plus `Telelean-*` trailers. It is built with plumbing only:
 *
 *   hash-object -w --no-filters --stdin-paths   (blobs, from files in a fresh temporary directory inside the git
 *                                                directory, `<gitDir>/telelean-tmp-*`: never in the model folder or the
 *                                                OS temp dir; leftovers of a crash are removed on the next snapshot)
 *   update-index -z --index-info                (into a temporary GIT_INDEX_FILE in that directory)
 *   write-tree                                  (same temporary index)
 *   commit-tree -F -                            (explicit author/committer and date, no signing)
 *   update-ref <ref> <new> <old>                (compare-and-swap; '' = must not exist yet)
 *
 * The user's index, HEAD, branches, remotes and hooks are never touched (see ./git.ts for the flags on every call).
 */
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { HistoryActionKind, HistoryAvailability, HistoryEntry, StorageUsage } from '@telelean/core';

import { discoverRepository, GitError, gitText, isValidRefName, runGit, type RepoInfo } from './git.js';

/** Which chain a snapshot belongs to. */
export type SnapshotScope = { kind: 'subject'; subject: string } | { kind: 'project' };

export interface SnapshotFile {
  /** POSIX path relative to the model root. */
  path: string;
  text: string;
}

export interface SnapshotMeta {
  label: string;
  /** M2: includes `accept-proposal` (HistoryActionKind since the M2 integration). */
  action: HistoryActionKind;
  /** Written as the `Telelean-Subject` trailer ('' for project-level changes). */
  subject: string;
  nodes: readonly string[];
}

export interface HistoryStoreOptions {
  root: string;
  gitPath: string;
  author: { name: string; email: string };
  now: () => Date;
}

/** A history entry with what revert and preview need. */
export interface EntryDetails extends HistoryEntry {
  tree: string;
  /** The parent commit, absent for the first entry of a chain. */
  parent?: string;
}

/** Thrown when history is unavailable (no repository, git missing); the workspace maps it to `no-history`. */
export class HistoryUnavailableError extends Error {
  constructor(readonly availability: Exclude<HistoryAvailability, { state: 'ready' }>) {
    super(
      availability.state === 'no-repo'
        ? 'History needs a git repository: initialize one from the board.'
        : availability.state === 'git-missing'
          ? 'History needs git, which was not found.'
          : availability.state === 'disabled'
            ? 'History is switched off (telelean.git.snapshotRefs).'
            : `History is unavailable: ${availability.detail}`,
    );
    this.name = 'HistoryUnavailableError';
  }
}

export const HISTORY_FORMAT = '1';
const STORAGE_CACHE_MS = 10_000;
/** Prefix of the temporary directories snapshots use inside the git directory. */
export const SNAPSHOT_TEMP_PREFIX = 'telelean-tmp-';
/** A temporary directory older than this is a crash leftover (a snapshot takes well under a second). */
const STALE_TEMP_MS = 10 * 60_000;
/** Every history kind telelean writes. M2 (WP4): `accept-proposal` (an accepted "These suffice" proposal). */
const HISTORY_ACTIONS: ReadonlySet<string> = new Set<HistoryActionKind>([
  'add-node',
  'edit-node',
  'delete-node',
  'change-kind',
  'reorder',
  'set-premises',
  'create-subject',
  // Spec v4 slice 1b: arrows as board edits.
  'add-arrows',
  'remove-arrows',
  'set-from-nothing',
  'claim-pending',
  'move-cards',
  'initial',
  'manual',
  'undo',
  'redo',
  'revert',
  'initialize',
  'accept-proposal',
]);

/** One record of `ls-tree -r -z`. */
interface TreeEntry {
  mode: string;
  type: string;
  oid: string;
  path: string;
}

/** Parsed `git cat-file commit` output. */
interface RawCommit {
  tree: string;
  parents: string[];
  author: GitIdentity;
  committer: GitIdentity;
  message: string;
}

interface GitIdentity {
  name: string;
  email: string;
  /** Git's internal date, e.g. `1793000000 +0000`. */
  date: string;
}

export class HistoryStore {
  private repo: RepoInfo | undefined;
  /** Per ref: the commit telelean last wrote or saw there and the content digest of its files (skips needless git calls). */
  private readonly known = new Map<string, { commit: string; digest: string }>();
  private storageCache: { at: number; value: Omit<StorageUsage, 'subjectBytes'> } | undefined;
  /** Git directories whose crash leftovers were already removed. */
  private readonly swept = new Set<string>();

  constructor(private readonly options: HistoryStoreOptions) {}

  /** `ready`, `no-repo`, `git-missing` or `error` (the workspace adds `disabled`). Cached once ready. */
  async availability(): Promise<HistoryAvailability> {
    if (this.repo) return { state: 'ready' };
    try {
      const found = await discoverRepository(this.options.gitPath, this.options.root);
      if (found === 'no-repo') return { state: 'no-repo' };
      for (const ref of [this.refName(found, { kind: 'project' }), this.refName(found, { kind: 'subject', subject: 'Probe' })]) {
        if (!(await isValidRefName(this.options.gitPath, this.options.root, ref))) {
          return { state: 'error', detail: `"${ref}" is not a valid git ref name` };
        }
      }
      this.repo = found;
      return { state: 'ready' };
    } catch (error) {
      if (error instanceof GitError && error.kind === 'missing') return { state: 'git-missing' };
      return { state: 'error', detail: (error as Error).message };
    }
  }

  /** Forgets the cached repository (after `git init`, or when git reports that it is gone). */
  reset(): void {
    this.repo = undefined;
    this.known.clear();
    this.storageCache = undefined;
  }

  async repository(): Promise<RepoInfo> {
    const availability = await this.availability();
    if (availability.state !== 'ready' || !this.repo) throw new HistoryUnavailableError(availability.state === 'ready' ? { state: 'error', detail: 'no repository' } : availability);
    return this.repo;
  }

  refName(repo: RepoInfo, scope: SnapshotScope): string {
    const base = `refs/telelean/${repo.rootKey}`;
    return scope.kind === 'project' ? `${base}/project` : `${base}/subjects/${scope.subject}`;
  }

  /** The chain's tip commit, or undefined when the chain does not exist yet. */
  async tip(scope: SnapshotScope): Promise<string | undefined> {
    const repo = await this.repository();
    return this.resolveRef(this.refName(repo, scope));
  }

  /**
   * Commits `files` as the next snapshot of `scope`, unless the tree equals the tip's (returns undefined then).
   * A missing chain starts with this commit (a root commit); an empty file list with no chain records nothing.
   */
  async snapshot(scope: SnapshotScope, files: readonly SnapshotFile[], meta: SnapshotMeta): Promise<string | undefined> {
    const repo = await this.repository();
    const ref = this.refName(repo, scope);
    const digest = digestFiles(files);
    for (let attempt = 0; ; attempt++) {
      const tip = await this.resolveRef(ref);
      if (tip === undefined && files.length === 0) return undefined;
      const known = this.known.get(ref);
      if (tip !== undefined && known?.commit === tip && known.digest === digest) return undefined;
      const tree = await this.writeTree(files, repo.gitDir);
      if (tip !== undefined && (await this.treeOf(tip)) === tree) {
        this.known.set(ref, { commit: tip, digest });
        return undefined;
      }
      const commit = await this.commitTree(tree, tip === undefined ? [] : [tip], snapshotMessage(meta), this.identityNow(), this.identityNow());
      try {
        await this.git(['update-ref', ref, commit, tip ?? '']);
      } catch (error) {
        // Another telelean window moved the chain between our read and our write: rebuild on its new tip once.
        if (attempt === 0 && error instanceof GitError && error.kind === 'failed') continue;
        throw error;
      }
      this.known.set(ref, { commit, digest });
      this.storageCache = undefined;
      return commit;
    }
  }

  /** The subject's entries, newest first (at most `limit`), and whether older ones exist. */
  async list(subject: string, limit: number): Promise<{ entries: HistoryEntry[]; more: boolean }> {
    const repo = await this.repository();
    const ref = this.refName(repo, { kind: 'subject', subject });
    if ((await this.resolveRef(ref)) === undefined) return { entries: [], more: false };
    const out = await this.git([
      '-c',
      'i18n.logOutputEncoding=UTF-8',
      'log',
      '-z',
      '--no-show-signature',
      '--no-color',
      '--first-parent',
      `--max-count=${limit + 1}`,
      '--format=%H%x1f%aI%x1f%B',
      ref,
      '--',
    ]);
    const records = out.split('\0').filter((r) => r.trim() !== '');
    const entries = records.slice(0, limit).map((record) => {
      const [id = '', time = '', ...rest] = record.split('\x1f');
      return entryFromMessage(id.trim(), time.trim(), rest.join('\x1f'), subject);
    });
    return { entries, more: records.length > limit };
  }

  /** One entry of the subject's chain (abbreviated ids accepted), or undefined when the id is not on that chain. */
  async entry(subject: string, id: string): Promise<EntryDetails | undefined> {
    const repo = await this.repository();
    const ref = this.refName(repo, { kind: 'subject', subject });
    const tip = await this.resolveRef(ref);
    if (tip === undefined || !/^[0-9a-f]{4,64}$/.test(id)) return undefined;
    let full: string;
    try {
      full = (await runGit(this.options.gitPath, ['rev-parse', '--verify', '--quiet', `${id}^{commit}`], { cwd: this.options.root, okCodes: [0, 1] })).stdout
        .toString('utf8')
        .trim();
    } catch {
      return undefined; // e.g. an ambiguous abbreviation
    }
    if (full === '') return undefined;
    const ancestor = await runGit(this.options.gitPath, ['merge-base', '--is-ancestor', full, tip], { cwd: this.options.root, okCodes: [0, 1] });
    if (ancestor.code !== 0) return undefined;
    const raw = await this.readCommit(full);
    const base = entryFromMessage(full, isoOfGitDate(raw.author.date), raw.message, subject);
    return { ...base, tree: raw.tree, ...(raw.parents[0] !== undefined ? { parent: raw.parents[0] } : {}) };
  }

  /** The text of one file in a commit's tree, or undefined when the tree has no such file. */
  async fileAt(commit: string, rel: string): Promise<string | undefined> {
    const result = await runGit(this.options.gitPath, ['rev-parse', '--verify', '--quiet', `${commit}:${rel}`], { cwd: this.options.root, okCodes: [0, 1] });
    const oid = result.stdout.toString('utf8').trim();
    if (result.code !== 0 || oid === '') return undefined;
    return (await this.readBlobs([oid])).get(oid);
  }

  /** The files of a tree (or commit): path -> text. */
  async treeFiles(treeish: string): Promise<Map<string, string>> {
    const listing = await this.git(['ls-tree', '--full-tree', '-r', '-z', treeish]);
    const entries: TreeEntry[] = [];
    for (const record of listing.split('\0')) {
      if (record === '') continue;
      const tab = record.indexOf('\t');
      const [mode = '', type = '', oid = ''] = record.slice(0, tab).split(' ');
      if (type === 'blob') entries.push({ mode, type, oid, path: record.slice(tab + 1) });
    }
    const blobs = await this.readBlobs(entries.map((e) => e.oid));
    const files = new Map<string, string>();
    for (const entry of entries) files.set(entry.path, blobs.get(entry.oid) ?? '');
    return files;
  }

  /**
   * Disk used by history (D-33 counter): objects reachable from each subject's chain and from all of this root's
   * refs, but from no branch, tag or remote-tracking ref. Cached for 10 s (cleared by snapshots and prunes).
   */
  async storage(subject: string): Promise<StorageUsage> {
    const repo = await this.repository();
    const now = Date.now();
    if (!this.storageCache || now - this.storageCache.at > STORAGE_CACHE_MS) {
      const refs = (await this.git(['for-each-ref', '--format=%(refname)', `refs/telelean/${repo.rootKey}/`])).split('\n').filter((r) => r !== '');
      const perSubject: Record<string, number> = {};
      const subjectPrefix = `refs/telelean/${repo.rootKey}/subjects/`;
      for (const ref of refs) {
        if (ref.startsWith(subjectPrefix)) perSubject[ref.slice(subjectPrefix.length)] = await this.diskUsage([ref]);
      }
      const totalBytes = refs.length === 0 ? 0 : await this.diskUsage(refs);
      this.storageCache = { at: now, value: { totalBytes, perSubject } };
    }
    const { totalBytes, perSubject } = this.storageCache.value;
    return { subjectBytes: perSubject[subject] ?? 0, totalBytes, perSubject: { ...perSubject } };
  }

  /**
   * Keeps the subject's last `keepLast` snapshots: recreates them with the same trees, messages, authors and dates
   * (the oldest kept one becomes a root commit) and moves the ref with a compare-and-swap. No gc.
   */
  async prune(subject: string, keepLast: number): Promise<number> {
    const repo = await this.repository();
    const ref = this.refName(repo, { kind: 'subject', subject });
    const tip = await this.resolveRef(ref);
    if (tip === undefined) return 0;
    const chain = (await this.git(['rev-list', '--first-parent', tip])).split('\n').filter((l) => l !== '');
    if (chain.length <= keepLast) return 0;
    let parent: string | undefined;
    for (const id of chain.slice(0, keepLast).reverse()) {
      const raw = await this.readCommit(id);
      parent = await this.commitTree(raw.tree, parent === undefined ? [] : [parent], raw.message, raw.author, raw.committer);
    }
    if (parent === undefined) return 0;
    await this.git(['update-ref', ref, parent, tip]);
    this.known.delete(ref);
    this.storageCache = undefined;
    return chain.length - keepLast;
  }

  // ------------------------------------------------------------------------------------------- plumbing

  private async git(args: readonly string[], env?: Readonly<Record<string, string>>, input?: string): Promise<string> {
    try {
      return await gitText(this.options.gitPath, args, { cwd: this.options.root, ...(env ? { env } : {}), ...(input !== undefined ? { input } : {}) });
    } catch (error) {
      if (error instanceof GitError && /not a git repository/i.test(error.stderr)) this.reset();
      throw error;
    }
  }

  private async resolveRef(ref: string): Promise<string | undefined> {
    const result = await runGit(this.options.gitPath, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: this.options.root, okCodes: [0, 1] });
    const id = result.stdout.toString('utf8').trim();
    return result.code === 0 && id !== '' ? id : undefined;
  }

  private async treeOf(commit: string): Promise<string> {
    return (await this.git(['rev-parse', '--verify', `${commit}^{tree}`])).trim();
  }

  /**
   * Blobs + a temporary index + write-tree; nothing outside the object store and a fresh temporary directory inside
   * the git directory (`<gitDir>/telelean-tmp-*`, removed afterwards) is written.
   */
  private async writeTree(files: readonly SnapshotFile[], gitDir: string): Promise<string> {
    if (files.length === 0) return (await this.git(['mktree', '-z'], undefined, '')).trim();
    await this.sweepTempDirs(gitDir);
    const dir = await mkdtemp(path.join(gitDir, SNAPSHOT_TEMP_PREFIX));
    try {
      const blobPaths: string[] = [];
      for (const [i, file] of files.entries()) {
        const blobPath = path.join(dir, `blob-${i}`);
        await writeFile(blobPath, file.text, { encoding: 'utf8', mode: 0o600 });
        blobPaths.push(blobPath);
      }
      const oids = (await this.git(['hash-object', '-w', '--no-filters', '--stdin-paths'], undefined, `${blobPaths.join('\n')}\n`)).trim().split('\n');
      if (oids.length !== files.length) throw new GitError(`git hash-object returned ${oids.length} ids for ${files.length} files`, 'failed');
      const index = { GIT_INDEX_FILE: path.join(dir, 'index') };
      const info = files.map((file, i) => `100644 ${oids[i] ?? ''}\t${file.path}\0`).join('');
      await this.git(['update-index', '-z', '--index-info'], index, info);
      return (await this.git(['write-tree'], index)).trim();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /** Removes `telelean-tmp-*` directories a crashed snapshot left in the git directory (once per directory). */
  private async sweepTempDirs(gitDir: string): Promise<void> {
    if (this.swept.has(gitDir)) return;
    this.swept.add(gitDir);
    let names: string[];
    try {
      names = await readdir(gitDir);
    } catch {
      return;
    }
    const now = Date.now();
    for (const name of names) {
      if (!name.startsWith(SNAPSHOT_TEMP_PREFIX)) continue;
      const dir = path.join(gitDir, name);
      try {
        const info = await lstat(dir);
        if (info.isDirectory() && now - info.mtimeMs > STALE_TEMP_MS) await rm(dir, { recursive: true, force: true });
      } catch {
        // Another window may be removing it right now.
      }
    }
  }

  private async commitTree(tree: string, parents: readonly string[], message: string, author: GitIdentity, committer: GitIdentity): Promise<string> {
    const args = ['-c', 'i18n.commitEncoding=UTF-8', 'commit-tree', tree];
    for (const parent of parents) args.push('-p', parent);
    args.push('-F', '-');
    const env = {
      GIT_AUTHOR_NAME: author.name,
      GIT_AUTHOR_EMAIL: author.email,
      GIT_AUTHOR_DATE: `@${author.date}`,
      GIT_COMMITTER_NAME: committer.name,
      GIT_COMMITTER_EMAIL: committer.email,
      GIT_COMMITTER_DATE: `@${committer.date}`,
    };
    return (await this.git(args, env, message)).trim();
  }

  private identityNow(): GitIdentity {
    const seconds = Math.floor(this.options.now().getTime() / 1000);
    return { name: this.options.author.name, email: this.options.author.email, date: `${seconds} +0000` };
  }

  private async readCommit(id: string): Promise<RawCommit> {
    const raw = await this.git(['cat-file', 'commit', id]);
    const split = raw.indexOf('\n\n');
    const headers = (split < 0 ? raw : raw.slice(0, split)).split('\n');
    const message = split < 0 ? '' : raw.slice(split + 2);
    let tree = '';
    const parents: string[] = [];
    let author: GitIdentity | undefined;
    let committer: GitIdentity | undefined;
    for (const line of headers) {
      if (line.startsWith('tree ')) tree = line.slice(5);
      else if (line.startsWith('parent ')) parents.push(line.slice(7));
      else if (line.startsWith('author ')) author = parseIdentity(line.slice(7));
      else if (line.startsWith('committer ')) committer = parseIdentity(line.slice(10));
    }
    if (tree === '' || !author || !committer) throw new GitError(`cannot parse commit ${id}`, 'failed');
    return { tree, parents, author, committer, message };
  }

  /** Reads many blobs with one `cat-file --batch`. */
  private async readBlobs(oids: readonly string[]): Promise<Map<string, string>> {
    const unique = [...new Set(oids)];
    const blobs = new Map<string, string>();
    if (unique.length === 0) return blobs;
    const { stdout } = await runGit(this.options.gitPath, ['cat-file', '--batch'], { cwd: this.options.root, input: `${unique.join('\n')}\n` });
    let offset = 0;
    for (const oid of unique) {
      const newline = stdout.indexOf(0x0a, offset);
      if (newline < 0) throw new GitError('truncated git cat-file --batch output', 'failed');
      const header = stdout.subarray(offset, newline).toString('utf8').split(' ');
      if (header[1] === 'missing') throw new GitError(`git object ${oid} is missing`, 'failed');
      const size = Number(header[2]);
      if (!Number.isInteger(size)) throw new GitError(`unexpected git cat-file header ${header.join(' ')}`, 'failed');
      blobs.set(oid, stdout.subarray(newline + 1, newline + 1 + size).toString('utf8'));
      offset = newline + 1 + size + 1;
    }
    return blobs;
  }

  private async diskUsage(refs: readonly string[]): Promise<number> {
    const out = await this.git(['rev-list', '--objects', '--disk-usage', ...refs, '--not', '--branches', '--tags', '--remotes']);
    const bytes = Number(out.trim());
    return Number.isFinite(bytes) ? bytes : 0;
  }
}

// ------------------------------------------------------------------------------------------- messages

/** The snapshot commit message: the label, a blank line, the `Telelean-*` trailers. */
export function snapshotMessage(meta: SnapshotMeta): string {
  const oneLine = (s: string): string => s.replace(/[\r\n]+/g, ' ').trim();
  const nodes = meta.nodes.map(oneLine).filter((n) => n !== '');
  return [
    oneLine(meta.label) || 'Snapshot',
    '',
    `Telelean-Action: ${meta.action}`,
    `Telelean-Subject:${meta.subject ? ` ${oneLine(meta.subject)}` : ''}`,
    `Telelean-Nodes:${nodes.length > 0 ? ` ${nodes.join(', ')}` : ''}`,
    `Telelean-Format: ${HISTORY_FORMAT}`,
    '',
  ].join('\n');
}

/** A HistoryEntry from a commit's message (label = first line; trailers parsed leniently). */
export function entryFromMessage(id: string, time: string, message: string, fallbackSubject: string): HistoryEntry {
  const lines = message.replace(/\r\n/g, '\n').split('\n');
  const label = (lines[0] ?? '').trim();
  const trailer = (key: string): string | undefined => {
    for (const line of lines) {
      const match = new RegExp(`^Telelean-${key}:[ \\t]*(.*)$`).exec(line);
      if (match) return (match[1] ?? '').trim();
    }
    return undefined;
  };
  const action = trailer('Action') ?? '';
  const nodes = (trailer('Nodes') ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n !== '');
  return {
    id,
    time,
    action: HISTORY_ACTIONS.has(action) ? (action as HistoryActionKind) : 'manual',
    label,
    subject: trailer('Subject') || fallbackSubject,
    nodes,
  };
}

function parseIdentity(text: string): GitIdentity {
  const match = /^(.*) <(.*)> (\d+) ([+-]\d{4})$/.exec(text);
  if (!match) throw new GitError(`cannot parse git identity "${text}"`, 'failed');
  return { name: match[1] ?? '', email: match[2] ?? '', date: `${match[3] ?? '0'} ${match[4] ?? '+0000'}` };
}

/** `1793000000 +0100` -> ISO 8601 in that offset. */
export function isoOfGitDate(date: string): string {
  const [seconds = '0', tz = '+0000'] = date.split(' ');
  const sign = tz.startsWith('-') ? -1 : 1;
  const offsetMinutes = sign * (Number(tz.slice(1, 3)) * 60 + Number(tz.slice(3, 5)));
  const local = new Date((Number(seconds) + offsetMinutes * 60) * 1000).toISOString().slice(0, 19);
  return `${local}${tz.slice(0, 3)}:${tz.slice(3, 5)}`;
}

/** Order-independent digest of a file set (paths and contents). */
export function digestFiles(files: readonly SnapshotFile[]): string {
  const hash = createHash('sha256');
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    hash.update(file.path, 'utf8');
    hash.update('\0');
    hash.update(createHash('sha256').update(file.text, 'utf8').digest('hex'));
    hash.update('\0');
  }
  return hash.digest('hex');
}
