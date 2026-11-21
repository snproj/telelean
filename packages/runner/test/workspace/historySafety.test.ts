/**
 * History safety (M1 fixes): a revert refuses when the current state cannot be snapshotted first (A3), and git's
 * message names the lock file; only telelean's own sidecar files are snapshotted, reverted or deleted (a binary file
 * in `.telelean/subjects/<S>/` stays byte-exact); snapshot temp files never go to the OS temp dir; linked worktrees
 * keep separate chains. Real core, git in scratch repositories only, no Lean.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { rootKeyOf, stderrSummary } from '../../src/workspace/git.js';
import { createModelWorkspace, fsEditApplier, fsTextSource, type ModelWorkspace } from '../../src/workspace/index.js';
import { cleanup, copyMentalModel, makeTempDir, read, userGit, write } from './helpers.js';

const INBOX = 'Model/Spyro/Inbox.lean';

function workspace(root: string): ModelWorkspace {
  return createModelWorkspace({ root, text: fsTextSource(root), applier: fsEditApplier(root), semantic: { enabled: false }, git: { enabled: true } });
}

/** A copy of mental_model/ in its own repository with one user commit. */
function repoWithModel(tmp: string, name: string): string {
  const root = copyMentalModel(tmp, name);
  userGit(root, 'init', '-q', '-b', 'main');
  userGit(root, 'add', '-A');
  userGit(root, 'commit', '-q', '-m', 'user commit');
  return root;
}

const add = (ws: ModelWorkspace, sentence: string) => ws.perform({ kind: 'add-node', subject: 'Spyro', type: 'PROPOSITION', naturalName: sentence });

describe('git error messages', () => {
  it("keep git's first fatal/error line (it names the lock file) and its last line", () => {
    const stderr = [
      "fatal: cannot lock ref 'refs/telelean/root/subjects/Spyro': Unable to create '/m/.git/refs/telelean/root/subjects/Spyro.lock': File exists.",
      '',
      'Another git process seems to be running in this repository, e.g.',
      "an editor opened by 'git commit'. Please make sure all processes",
      'are terminated then try again. If it still fails, a git process',
      'may have crashed in this repository earlier:',
      'remove the file manually to continue.',
    ].join('\n');
    expect(stderrSummary(stderr)).toBe(
      "fatal: cannot lock ref 'refs/telelean/root/subjects/Spyro': Unable to create '/m/.git/refs/telelean/root/subjects/Spyro.lock': File exists. … remove the file manually to continue.",
    );
    expect(stderrSummary('one\ntwo\nthree\nfour\n')).toBe('two three four');
    expect(stderrSummary('error: just this\n')).toBe('error: just this');
  });
});

describe('revert needs the snapshot of the current state first', () => {
  let tmp: string;
  let root: string;
  let ws: ModelWorkspace;
  beforeAll(async () => {
    tmp = makeTempDir('hist-safety');
    root = repoWithModel(tmp, 'model');
    ws = workspace(root);
    await ws.load();
  });
  afterAll(() => {
    ws?.dispose();
    cleanup(tmp);
  });

  it('refuses (nothing changed) while a stale lock blocks the snapshot, naming the lock; works once it is removed', async () => {
    expect((await add(ws, 'Something telelean wrote')).ok).toBe(true);
    const initial = (await ws.listHistory('Spyro')).entries.find((e) => e.label === 'Initial state');
    if (!initial) throw new Error('no Initial state entry');
    // Hand edits: a new file and a changed one, then a stale lock on the subject's ref.
    write(root, 'Model/Spyro/Handmade.lean', '-- my own file\n');
    const inboxBefore = read(root, INBOX);
    write(root, INBOX, `${inboxBefore}-- typed by hand\n`);
    const lock = path.join(root, '.git', 'refs', 'telelean', 'root', 'subjects', 'Spyro.lock');
    writeFileSync(lock, '');

    const refused = await ws.revert('Spyro', initial.id);
    expect(refused).toMatchObject({ ok: false, code: 'no-history' });
    if (refused.ok) throw new Error('expected a refusal');
    expect(refused.error).toMatch(/^Nothing was changed: telelean could not first snapshot the current state of Spyro/);
    expect(refused.error).toContain('Spyro.lock');
    expect(read(root, 'Model/Spyro/Handmade.lean')).toBe('-- my own file\n');
    expect(read(root, INBOX)).toBe(`${inboxBefore}-- typed by hand\n`);
    expect(ws.graph('Spyro').diagnostics.find((d) => d.code === 'TL202')?.message).toContain('Spyro.lock');

    rmSync(lock);
    const reverted = await ws.revert('Spyro', initial.id);
    expect(reverted.ok).toBe(true);
    expect(() => read(root, 'Model/Spyro/Handmade.lean')).toThrow();
    const listing = await ws.listHistory('Spyro');
    expect(listing.entries.slice(0, 2).map((e) => e.label)).toEqual([expect.stringMatching(/^Revert to: Initial state/), 'Manual edits']);
    // The hand edits are in history: undo brings them back.
    expect((await ws.undo('Spyro')).ok).toBe(true);
    expect(read(root, 'Model/Spyro/Handmade.lean')).toBe('-- my own file\n');
  });
});

describe('sidecar files telelean does not write are never snapshotted, reverted or deleted', () => {
  let tmp: string;
  afterAll(() => cleanup(tmp));

  it('a binary file in .telelean/subjects/Spyro/ survives a revert and its undo byte-exactly, and is in no snapshot', async () => {
    tmp = makeTempDir('hist-sidecar');
    const root = repoWithModel(tmp, 'model');
    const png = Buffer.from('89504e470d0a1a0a00fffe8081c3280010', 'hex');
    const diagram = path.join(root, '.telelean', 'subjects', 'Spyro', 'diagram.png');
    writeFileSync(diagram, png);
    const ws = workspace(root);
    try {
      await ws.load();
      expect((await add(ws, 'Something telelean wrote')).ok).toBe(true);
      const initial = (await ws.listHistory('Spyro')).entries.find((e) => e.label === 'Initial state');
      if (!initial) throw new Error('no Initial state entry');
      expect((await ws.revert('Spyro', initial.id)).ok).toBe(true);
      expect((await ws.undo('Spyro')).ok).toBe(true);
      expect(readFileSync(diagram)).toEqual(png);
      const refs = userGit(root, 'for-each-ref', '--format=%(refname)', 'refs/telelean/').split('\n').filter((r) => r !== '');
      for (const ref of refs) {
        const paths = userGit(root, 'log', '--format=', '--name-only', ref).split('\n');
        expect(paths.filter((p) => p.includes('diagram.png')), ref).toEqual([]);
      }
    } finally {
      ws.dispose();
    }
  });
});

describe('snapshot temp files', () => {
  let tmp: string;
  afterAll(() => cleanup(tmp));

  it('go into the git directory (snapshots work with an unusable OS temp dir) and crash leftovers are removed', async () => {
    tmp = makeTempDir('hist-temp');
    const root = repoWithModel(tmp, 'model');
    const leftover = path.join(root, '.git', 'telelean-tmp-crashed');
    mkdirSync(leftover);
    writeFileSync(path.join(leftover, 'blob-0'), 'old');
    const hourAgo = new Date(Date.now() - 3_600_000);
    utimesSync(leftover, hourAgo, hourAgo);
    const savedTmp = process.env['TMPDIR'];
    process.env['TMPDIR'] = path.join(tmp, 'no-such-temp-dir');
    const ws = workspace(root);
    try {
      await ws.load();
      expect((await add(ws, 'Snapshotted without the OS temp dir')).ok).toBe(true);
      expect(await ws.historyStatus()).toEqual({ state: 'ready' });
      expect((await ws.listHistory('Spyro')).entries.map((e) => e.label)).toEqual(['Add proposition: Snapshotted without the OS temp dir', 'Initial state']);
      expect(readdirSync(path.join(root, '.git')).filter((n) => n.startsWith('telelean-tmp-'))).toEqual([]);
    } finally {
      if (savedTmp === undefined) delete process.env['TMPDIR'];
      else process.env['TMPDIR'] = savedTmp;
      ws.dispose();
    }
  });
});

describe('linked worktrees keep separate history chains', () => {
  let tmp: string;
  afterAll(() => cleanup(tmp));

  it('a model at the same path in the main and in a linked worktree gets two root keys', async () => {
    tmp = makeTempDir('hist-worktree');
    const main = repoWithModel(tmp, 'main');
    const feature = path.join(tmp, 'feature');
    userGit(main, 'worktree', 'add', '-q', feature, '-b', 'feature');
    const wsMain = workspace(main);
    const wsFeature = workspace(feature);
    try {
      await wsMain.load();
      await wsFeature.load();
      expect((await add(wsMain, 'Only in the main worktree')).ok).toBe(true);
      expect((await add(wsFeature, 'Only in the feature worktree')).ok).toBe(true);
      expect((await wsMain.listHistory('Spyro')).entries.map((e) => e.label)).toEqual(['Add proposition: Only in the main worktree', 'Initial state']);
      expect((await wsFeature.listHistory('Spyro')).entries.map((e) => e.label)).toEqual(['Add proposition: Only in the feature worktree', 'Initial state']);
      const refs = userGit(main, 'for-each-ref', '--format=%(refname)', 'refs/telelean/').split('\n').filter((r) => r !== '');
      const featureKey = rootKeyOf('', 'worktrees/feature');
      expect(featureKey).toMatch(/^root-wt[0-9a-f]{8}$/);
      expect(refs).toEqual(expect.arrayContaining(['refs/telelean/root/subjects/Spyro', `refs/telelean/${featureKey}/subjects/Spyro`]));
      expect(rootKeyOf('a/b')).toBe(rootKeyOf('a/b', undefined)); // the main worktree keeps its key
    } finally {
      wsMain.dispose();
      wsFeature.dispose();
    }
  });
});
