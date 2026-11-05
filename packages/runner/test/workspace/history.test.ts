/**
 * AT4.5 History (D-33) in scratch repositories: "Initial state"; a "Manual edits" snapshot before an action; the
 * action snapshot with its trailers; per-subject scopes; listHistory order and labels; historyDiff against the
 * parent and the current state; revert and undo of the revert; prune keeps N with the same trees; storage counters;
 * and the user's repository state (index, HEAD, branches, status, hooks, other refs) is never touched.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ActionError, type HistoryListing } from '@telelean/core';

import { rootKeyOf } from '../../src/workspace/git.js';
import { createModelWorkspace, fsTextSource, initGitRepository, type ModelWorkspace, type ModelWorkspaceOptions } from '../../src/workspace/index.js';
import { fakeCore } from './fakeCore.js';
import { cleanup, copyMentalModel, makeTempDir, read, recordingApplier, sha256, userGit, write } from './helpers.js';

const HOOKS = ['pre-commit', 'prepare-commit-msg', 'commit-msg', 'post-commit', 'reference-transaction', 'post-index-change', 'post-checkout', 'post-rewrite', 'pre-auto-gc'];

function options(root: string, extra: Partial<ModelWorkspaceOptions> = {}): ModelWorkspaceOptions {
  return { root, text: fsTextSource(root), applier: recordingApplier(root), core: fakeCore, semantic: { enabled: false }, ...extra };
}

/**
 * Everything about the user's repository that telelean must not change. The status is compared outside the model
 * folder (telelean's edits to the model's own tracked files are expected to show there, as worktree changes).
 */
function repoState(repo: string, modelDir: string): Record<string, string> {
  const gitDir = path.join(repo, '.git');
  const index = path.join(gitDir, 'index');
  return {
    head: userGit(repo, 'rev-parse', 'HEAD'),
    symbolicHead: userGit(repo, 'symbolic-ref', 'HEAD'),
    otherRefs: userGit(repo, 'for-each-ref', '--format=%(refname) %(objectname)')
      .split('\n')
      .filter((l) => l !== '' && !l.startsWith('refs/telelean/'))
      .join('\n'),
    indexMtime: String(statSync(index).mtimeMs),
    indexHash: sha256(readFileSync(index)),
    config: readFileSync(path.join(gitDir, 'config'), 'utf8'),
    hooks: readdirSync(path.join(gitDir, 'hooks')).sort().join(','),
    // Last: `status` runs with GIT_OPTIONAL_LOCKS=0, so it never rewrites the index.
    status: userGit(repo, 'status', '--porcelain=v1', '--untracked-files=all', '--', '.', `:(exclude)${modelDir}`),
  };
}

function treeOf(repo: string, commit: string): string {
  return userGit(repo, 'rev-parse', `${commit}^{tree}`).trim();
}

function treePaths(repo: string, commit: string): string[] {
  return userGit(repo, 'ls-tree', '--full-tree', '-r', '--name-only', commit)
    .split('\n')
    .filter((l) => l !== '')
    .sort();
}

const labels = (listing: HistoryListing): string[] => listing.entries.map((e) => e.label);

describe('AT4.5 history in a scratch repository (model root nested in the user repo)', () => {
  let tmp: string;
  let repo: string;
  let root: string;
  let markers: string;
  let before: Record<string, string>;
  let ws: ModelWorkspace;
  const rel = 'models/my model';

  beforeAll(async () => {
    tmp = makeTempDir('history');
    repo = path.join(tmp, 'repo');
    markers = path.join(tmp, 'hook-markers');
    mkdirSync(markers);
    mkdirSync(path.join(repo, 'models'), { recursive: true });
    root = copyMentalModel(path.join(repo, 'models'), 'my model');
    userGit(repo, 'init', '-q', '-b', 'main');
    write(repo, 'README.md', 'user readme\n');
    write(repo, 'notes.txt', 'v1\n');
    userGit(repo, 'add', '-A');
    userGit(repo, 'commit', '-q', '-m', 'user commit');
    userGit(repo, 'tag', 'v1');
    // A dirty working tree: a staged change, an unstaged change, an untracked file.
    write(repo, 'notes.txt', 'v2 staged\n');
    userGit(repo, 'add', 'notes.txt');
    write(repo, 'README.md', 'user readme, edited\n');
    write(repo, 'untracked.txt', 'x\n');
    // Hooks that leave a marker if they ever run; checked to work by running them directly.
    for (const hook of HOOKS) {
      const file = path.join(repo, '.git', 'hooks', hook);
      writeFileSync(file, `#!/bin/sh\necho ran >> "${markers}/${hook}"\n`);
      chmodSync(file, 0o755);
      execFileSync('sh', [file]); // positive control, run directly (never through git)
    }
    expect(readdirSync(markers).sort()).toEqual([...HOOKS].sort());
    for (const marker of readdirSync(markers)) rmSync(path.join(markers, marker));
    before = repoState(repo, rel);
    ws = createModelWorkspace(options(root));
    await ws.load();
  });
  afterAll(() => {
    ws?.dispose();
    cleanup(tmp);
  });

  it('starts each chain with "Initial state" under refs/telelean/<rootKey>/', async () => {
    expect(await ws.historyStatus()).toEqual({ state: 'ready' });
    const key = rootKeyOf(rel);
    expect(key).toBe(`models.my_model-${createHash('sha1').update(rel).digest('hex').slice(0, 8)}`);
    const refs = userGit(repo, 'for-each-ref', '--format=%(refname)', 'refs/telelean/').split('\n').filter((l) => l !== '');
    expect(refs.sort()).toEqual([`refs/telelean/${key}/project`, `refs/telelean/${key}/subjects/Spyro`]);
    const listing = await ws.listHistory('Spyro');
    expect(listing.entries).toHaveLength(1);
    expect(listing.entries[0]).toMatchObject({ action: 'initial', label: 'Initial state', subject: 'Spyro', nodes: [] });
    expect(listing.more).toBe(false);
    const commit = userGit(repo, 'cat-file', 'commit', listing.entries[0]?.id ?? '');
    expect(commit).toMatch(/^author telelean <telelean@localhost> \d+ \+0000$/m);
    expect(commit).toMatch(/^committer telelean <telelean@localhost> \d+ \+0000$/m);
    expect(commit).not.toMatch(/^parent /m);
    expect(commit).not.toMatch(/gpgsig/);
    // Exactly the subject's scope, paths relative to the model root (not to the repository).
    expect(treePaths(repo, listing.entries[0]?.id ?? '')).toEqual([
      '.telelean/subjects/Spyro/layout.json',
      'Model/Spyro.lean',
      'Model/Spyro/Inbox.lean',
      'Model/Spyro/Main.lean',
      'Model/Spyro/Vocabulary.lean',
    ]);
    expect(treePaths(repo, `refs/telelean/${key}/project`)).toEqual(['.gitignore', '.telelean/config.json', 'Model.lean', 'lake-manifest.json', 'lakefile.toml', 'lean-toolchain']);
  });

  it('snapshots hand edits as "Manual edits" before an action, then the action with its trailers', async () => {
    const main = 'Model/Spyro/Main.lean';
    write(root, main, read(root, main).replace('end Spyro', '-- typed by hand\n\nend Spyro'));
    await ws.invalidate([main]);
    const handEdited = read(root, main);
    expect(await ws.perform({ kind: 'edit-node', id: 'cynder-dark-past', field: 'naturalName', value: 'Cynder has a dark past' })).toMatchObject({ ok: true });
    const listing = await ws.listHistory('Spyro');
    expect(labels(listing)).toEqual(['Edit sentence: Cynder has a dark past', 'Manual edits', 'Initial state']);
    expect(listing.entries.map((e) => e.action)).toEqual(['edit-node', 'manual', 'initial']);
    expect(listing.entries.map((e) => e.nodes)).toEqual([['cynder-dark-past'], [], []]);
    const [action, manual] = listing.entries;
    expect(userGit(repo, 'show', `${manual?.id}:${main}`)).toBe(handEdited);
    expect(userGit(repo, 'show', `${action?.id}:${main}`)).toBe(read(root, main));
    const message = userGit(repo, 'log', '-1', '--format=%B', action?.id ?? '');
    expect(message).toBe(
      'Edit sentence: Cynder has a dark past\n\nTelelean-Action: edit-node\nTelelean-Subject: Spyro\nTelelean-Nodes: cynder-dark-past\nTelelean-Format: 1\n\n',
    );
    for (const entry of listing.entries) expect(entry.time).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
    expect(userGit(repo, 'rev-list', '--parents', '-n', '1', action?.id ?? '').trim().split(' ')[1]).toBe(manual?.id);
  });

  it('keeps one chain per subject (and project files in the project chain)', async () => {
    const spyroBefore = labels(await ws.listHistory('Spyro'));
    expect(await ws.perform({ kind: 'create-subject', name: 'Other' })).toMatchObject({ ok: true, label: 'New subject: Other' });
    expect(labels(await ws.listHistory('Other'))).toEqual(['New subject: Other']);
    expect(labels(await ws.listHistory('Spyro'))).toEqual(spyroBefore);
    const key = rootKeyOf(rel);
    expect(userGit(repo, 'log', '--format=%s', `refs/telelean/${key}/project`).trim().split('\n')).toEqual(['New subject: Other', 'Initial state']);
    const otherTip = (await ws.listHistory('Other')).entries[0]?.id ?? '';
    expect(treePaths(repo, otherTip)).toEqual([
      '.telelean/subjects/Other/layout.json',
      'Model/Other.lean',
      'Model/Other/Inbox.lean',
      'Model/Other/Main.lean',
      'Model/Other/Vocabulary.lean',
    ]);
    expect(userGit(repo, 'log', '-1', '--format=%B', otherTip)).toContain('Telelean-Action: create-subject\nTelelean-Subject: Other\nTelelean-Nodes:\n');
  });

  it('diffs an entry against its parent and against the current files', async () => {
    const main = 'Model/Spyro/Main.lean';
    const listing = await ws.listHistory('Spyro');
    const [action, manual, initial] = listing.entries;
    const parentDiff = await ws.historyDiff('Spyro', action?.id ?? '', 'parent');
    expect(parentDiff.entry).toEqual(action);
    expect(parentDiff.files.map((f) => f.path)).toEqual([main]);
    expect(parentDiff.files[0]?.before).toBe(userGit(repo, 'show', `${manual?.id}:${main}`));
    expect(parentDiff.files[0]?.after).toBe(read(root, main));
    const rootDiff = await ws.historyDiff('Spyro', initial?.id ?? '', 'parent');
    expect(rootDiff.files.every((f) => f.before === null)).toBe(true);
    expect(rootDiff.files).toHaveLength(5);
    const currentDiff = await ws.historyDiff('Spyro', (initial?.id ?? '').slice(0, 12), 'current');
    expect(currentDiff.files.map((f) => f.path)).toEqual([main]);
    expect(currentDiff.files[0]?.after).toBe(read(root, main));
    await expect(ws.historyDiff('Spyro', 'deadbeefdeadbeef', 'parent')).rejects.toBeInstanceOf(ActionError);
    const otherEntry = (await ws.listHistory('Other')).entries[0]?.id ?? '';
    await expect(ws.historyDiff('Spyro', otherEntry, 'parent')).rejects.toMatchObject({ code: 'not-found' });
  });

  it('reverts a subject to an entry (snapshotted, undoable), leaving other subjects and project files alone', async () => {
    const main = 'Model/Spyro/Main.lean';
    const initial = (await ws.listHistory('Spyro')).entries.at(-1);
    const current = read(root, main);
    const untouched = { model: read(root, 'Model.lean'), other: read(root, 'Model/Other/Main.lean') };
    const outcome = await ws.revert('Spyro', initial?.id ?? '');
    expect(outcome).toMatchObject({ ok: true, undoable: true });
    expect(outcome.ok && outcome.label).toMatch(/^Revert to: Initial state \(\d{4}-\d\d-\d\d \d\d:\d\d\)$/);
    expect(read(root, main)).toBe(userGit(repo, 'show', `${initial?.id}:${main}`));
    expect(read(root, 'Model.lean')).toBe(untouched.model);
    expect(read(root, 'Model/Other/Main.lean')).toBe(untouched.other);
    const afterRevert = await ws.listHistory('Spyro');
    expect(afterRevert.entries[0]).toMatchObject({ action: 'revert', subject: 'Spyro' });
    expect(treeOf(repo, afterRevert.entries[0]?.id ?? '')).toBe(treeOf(repo, initial?.id ?? ''));
    expect((await ws.workspaceState('Spyro')).undo).toBe(outcome.ok ? outcome.label : '');

    expect(await ws.undo('Spyro')).toMatchObject({ ok: true, label: `Undo: ${outcome.ok ? outcome.label : ''}` });
    expect(read(root, main)).toBe(current);
    const afterUndo = await ws.listHistory('Spyro');
    expect(afterUndo.entries[0]).toMatchObject({ action: 'undo', label: `Undo: ${outcome.ok ? outcome.label : ''}` });
    expect(await ws.revert('Spyro', 'abcdef1234567')).toMatchObject({ ok: false, code: 'not-found' });
  });

  it('counts storage per subject and in total', async () => {
    const listing = await ws.listHistory('Spyro');
    expect(listing.storage.subjectBytes).toBeGreaterThan(0);
    expect(Object.keys(listing.storage.perSubject).sort()).toEqual(['Other', 'Spyro']);
    expect(listing.storage.perSubject['Spyro']).toBe(listing.storage.subjectBytes);
    for (const bytes of Object.values(listing.storage.perSubject)) expect(listing.storage.totalBytes).toBeGreaterThanOrEqual(bytes);
    expect((await ws.listHistory('Other')).storage.subjectBytes).toBe(listing.storage.perSubject['Other']);
  });

  it('prunes to the last N entries with the same trees, labels and times (the oldest kept becomes a root)', async () => {
    const full = await ws.listHistory('Spyro');
    expect(full.entries.length).toBeGreaterThan(3);
    const kept = full.entries.slice(0, 2);
    const pruned = await ws.prune('Spyro', 2);
    expect(pruned.entries).toHaveLength(2);
    expect(pruned.more).toBe(false);
    expect(pruned.entries.map((e) => [e.label, e.time, e.action, e.nodes])).toEqual(kept.map((e) => [e.label, e.time, e.action, e.nodes]));
    expect(pruned.entries.map((e) => treeOf(repo, e.id))).toEqual(kept.map((e) => treeOf(repo, e.id)));
    const oldest = pruned.entries[1]?.id ?? '';
    expect(userGit(repo, 'rev-list', '--parents', '-n', '1', oldest).trim().split(' ')).toHaveLength(1);
    await expect(ws.prune('Spyro', 0)).rejects.toBeInstanceOf(TypeError);
    // Snapshots continue on the pruned chain.
    expect(await ws.perform({ kind: 'edit-node', id: 'new-spyro-pg', field: 'naturalName', value: 'The new game is rated PG' })).toMatchObject({ ok: true });
    expect(labels(await ws.listHistory('Spyro'))).toEqual(['Edit sentence: The new game is rated PG', ...kept.map((e) => e.label)]);
  });

  it("never touches the user's index, HEAD, branches, tags, status, config or hooks; only refs/telelean/* change", () => {
    expect(repoState(repo, rel)).toEqual(before);
    // Inside the model folder telelean's edits are plain worktree changes: nothing is ever staged.
    const modelStatus = userGit(repo, 'status', '--porcelain=v1', '--untracked-files=all', '--', rel).split('\n').filter((l) => l !== '');
    expect(modelStatus.length).toBeGreaterThan(0);
    for (const line of modelStatus) expect(line[0], line).toMatch(/[ ?]/);
    expect(readdirSync(markers)).toEqual([]);
    expect(existsSync(path.join(repo, '.git', 'logs', 'refs', 'telelean'))).toBe(false);
    const key = rootKeyOf(rel);
    const refs = userGit(repo, 'for-each-ref', '--format=%(refname)', 'refs/telelean/').split('\n').filter((l) => l !== '');
    expect(refs.sort()).toEqual([`refs/telelean/${key}/project`, `refs/telelean/${key}/subjects/Other`, `refs/telelean/${key}/subjects/Spyro`]);
  });
});

describe('AT4.5 history: other repository layouts and availability', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = makeTempDir('history2');
  });
  afterAll(() => cleanup(tmp));

  it('a model root at the repository top level uses the rootKey "root"', async () => {
    const root = copyMentalModel(tmp, 'top');
    userGit(root, 'init', '-q');
    const ws = createModelWorkspace(options(root));
    await ws.load();
    expect(userGit(root, 'for-each-ref', '--format=%(refname)', 'refs/telelean/').trim().split('\n').sort()).toEqual([
      'refs/telelean/root/project',
      'refs/telelean/root/subjects/Spyro',
    ]);
    expect(() => userGit(root, 'rev-parse', '--verify', '-q', 'HEAD')).toThrow(); // still no commit on any branch
    ws.dispose();
  });

  it('without a repository: no-repo, actions still work, initGit starts the histories', async () => {
    const root = copyMentalModel(tmp, 'norepo');
    const ws = createModelWorkspace(options(root));
    await ws.load();
    expect(await ws.historyStatus()).toEqual({ state: 'no-repo' });
    expect((await ws.workspaceState('Spyro')).history).toEqual({ state: 'no-repo' });
    expect(await ws.perform({ kind: 'edit-node', id: 'new-spyro-pg', field: 'naturalName', value: 'PG it is' })).toMatchObject({ ok: true });
    expect(await ws.listHistory('Spyro')).toEqual({ subject: 'Spyro', entries: [], storage: { subjectBytes: 0, totalBytes: 0, perSubject: {} }, more: false });
    expect(await ws.revert('Spyro', 'abcdef1')).toMatchObject({ ok: false, code: 'no-history' });
    await expect(ws.historyDiff('Spyro', 'abcdef1', 'parent')).rejects.toMatchObject({ code: 'no-history' });

    expect(await ws.initGit()).toEqual({ state: 'ready' });
    expect(existsSync(path.join(root, '.git'))).toBe(true);
    expect(labels(await ws.listHistory('Spyro'))).toEqual(['Initial state']);
    expect(userGit(root, 'for-each-ref', '--format=%(refname)', 'refs/heads/', 'refs/tags/').trim()).toBe('');
    expect(await ws.perform({ kind: 'edit-node', id: 'new-spyro-pg', field: 'naturalName', value: 'PG again' })).toMatchObject({ ok: true });
    expect(labels(await ws.listHistory('Spyro'))).toEqual(['Edit sentence: PG again', 'Initial state']);
    expect(await ws.initGit()).toEqual({ state: 'ready' }); // idempotent inside the repository it made
    ws.dispose();
  });

  it('reports disabled and git-missing, and still performs actions', async () => {
    const root = copyMentalModel(tmp, 'nogit');
    userGit(root, 'init', '-q');
    const disabled = createModelWorkspace(options(root, { git: { enabled: false } }));
    await disabled.load();
    expect(await disabled.historyStatus()).toEqual({ state: 'disabled' });
    expect(userGit(root, 'for-each-ref', 'refs/telelean/').trim()).toBe('');
    disabled.dispose();
    const missing = createModelWorkspace(options(root, { git: { gitPath: path.join(tmp, 'no-such-git') } }));
    await missing.load();
    expect(await missing.historyStatus()).toEqual({ state: 'git-missing' });
    expect(await missing.perform({ kind: 'edit-node', id: 'new-spyro-pg', field: 'naturalName', value: 'Still works' })).toMatchObject({ ok: true });
    expect(await missing.initGit()).toEqual({ state: 'git-missing' });
    missing.dispose();
  });

  it('initGitRepository refuses inside an existing repository and never commits', async () => {
    const outer = path.join(tmp, 'outer');
    mkdirSync(path.join(outer, 'inner'), { recursive: true });
    await initGitRepository(outer);
    await expect(initGitRepository(outer)).rejects.toThrow(/already inside the git repository/);
    await expect(initGitRepository(path.join(outer, 'inner'))).rejects.toThrow(/already inside the git repository/);
    expect(existsSync(path.join(outer, 'inner', '.git'))).toBe(false);
    expect(userGit(outer, 'for-each-ref').trim()).toBe('');
    await expect(initGitRepository(path.join(tmp, 'missing-dir'))).rejects.toThrow(/does not exist/);
  });

  it('a failing snapshot is a history error (TL202), never a failed action, and clears once git works again', async () => {
    const root = copyMentalModel(tmp, 'readonly-objects');
    userGit(root, 'init', '-q');
    const ws = createModelWorkspace(options(root));
    await ws.load();
    const objects = path.join(root, '.git', 'objects');
    const setWritable = (dir: string, writable: boolean): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) setWritable(path.join(dir, entry.name), writable);
      chmodSync(dir, writable ? 0o755 : 0o555);
    };
    setWritable(objects, false);
    try {
      write(root, 'Model/Spyro/Main.lean', `${read(root, 'Model/Spyro/Main.lean')}-- hand edit\n`);
      await ws.invalidate(['Model/Spyro/Main.lean']);
      expect(await ws.perform({ kind: 'edit-node', id: 'new-spyro-pg', field: 'naturalName', value: 'Edited without history' })).toMatchObject({ ok: true });
      const status = await ws.historyStatus();
      expect(status.state).toBe('error');
      expect(status.state === 'error' && status.detail).toMatch(/snapshot/);
      expect(ws.graph('Spyro').diagnostics.filter((d) => d.code === 'TL202')).toHaveLength(1);
    } finally {
      setWritable(objects, true);
    }
    expect(await ws.perform({ kind: 'edit-node', id: 'new-spyro-pg', field: 'naturalName', value: 'Edited with history' })).toMatchObject({ ok: true });
    expect(await ws.historyStatus()).toEqual({ state: 'ready' });
    expect(ws.graph('Spyro').diagnostics.filter((d) => d.code === 'TL202')).toHaveLength(0);
    expect(labels(await ws.listHistory('Spyro'))).toEqual(['Edit sentence: Edited with history', 'Manual edits', 'Initial state']);
    ws.dispose();
  });

  it('a snapshot after the ref moved elsewhere (another window) builds on the new tip', async () => {
    const root = copyMentalModel(tmp, 'race');
    userGit(root, 'init', '-q');
    const a = createModelWorkspace(options(root));
    await a.load();
    const b = createModelWorkspace(options(root));
    await b.load();
    expect(await a.perform({ kind: 'edit-node', id: 'new-spyro-pg', field: 'naturalName', value: 'from window A' })).toMatchObject({ ok: true });
    await b.invalidate(['Model/Spyro/Main.lean']);
    expect(await b.perform({ kind: 'edit-node', id: 'cynder-dark-past', field: 'naturalName', value: 'from window B' })).toMatchObject({ ok: true });
    expect(labels(await a.listHistory('Spyro'))).toEqual(['Edit sentence: from window B', 'Edit sentence: from window A', 'Initial state']);
    a.dispose();
    b.dispose();
  });
});
