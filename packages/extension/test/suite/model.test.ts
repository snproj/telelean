/**
 * AT5.5: the smoke flow on the copied sample model with the REAL runner workspace (WP4), core model (WP1, WP2) and
 * Lean refresh (WP3), all integrated.
 *
 *   4 cards -> refresh: semantic fresh, 9 vocabulary items -> addNode writes a block to Model/Spyro/Inbox.lean, undo
 *   removes it -> G->A on cynder-not-good adds the axiom, the refresh shows it assumed -> copyText -> initGit,
 *   historyList, historyPreview (diff editor), historyRevert (and its undo) -> openInEditor Main.lean ->
 *   .telelean/graph.json exists. Git runs only in the scratch copy (refs/telelean/* only, no branch commits).
 */
import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

import type { TlGraph } from '@telelean/core';

import type { OpenBoardResult, TeleleanApi } from '../../src/api';
import type { InitializeResult } from '../../src/logic/initialize';
import { closeAllEditors, closeTextEditors, getApi, isRendered, message, nextBoardMessage, nextPost, settleEditors, waitFor, workspacePaths } from './helpers';

const LEAN_TIMEOUT_MS = 240_000;

function git(root: string, args: string[]): { status: number | null; stdout: string } {
  const result = spawnSync('git', ['-C', root, '-c', 'core.hooksPath=/dev/null', ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' },
  });
  return { status: result.status, stdout: result.stdout ?? '' };
}

suite('model board on the copied sample (real workspace; AT5.5)', () => {
  let api: TeleleanApi;
  let root: string;
  let latest: TlGraph | undefined;
  let subscription: vscode.Disposable | undefined;

  async function request(type: string, payload: Record<string, unknown>) {
    const requestId = String(payload.requestId);
    const result = nextPost(api, (e) => e.root === root && e.message.type === 'actionResult' && e.message.payload.requestId === requestId, LEAN_TIMEOUT_MS, `actionResult ${requestId}`);
    await api.simulateBoardMessage(root, message(type, payload));
    const event = await result;
    assert.ok(event.message.type === 'actionResult');
    return event.message.payload.outcome;
  }

  suiteSetup(async function () {
    this.timeout(30_000);
    api = await getApi();
    await api.testing?.reset();
    await settleEditors();
    root = workspacePaths().mental;
    subscription = api.onDidPostToBoard((e) => {
      if (e.root === root && e.message.type === 'graph') latest = e.message.payload.graph;
    });
  });

  suiteTeardown(async () => {
    subscription?.dispose();
    await api?.testing?.reset();
    await closeAllEditors();
  });

  test('Open Board (two roots: asks) shows the 4 Spyro cards', async function () {
    this.timeout(90_000);
    const rendered = nextBoardMessage(api, root, isRendered, 60_000, 'the "rendered" diagnostic');
    const result = await vscode.commands.executeCommand<OpenBoardResult>('telelean.openBoard', { pick: 'mental_model' });
    assert.deepEqual(result, { root, asked: true });
    await waitFor(() => latest?.nodes.length === 4, 30_000, 'a graph with 4 cards');
    assert.deepEqual(latest?.nodes.map((n) => n.id).sort(), ['cynder-dark-past', 'cynder-not-good', 'new-spyro-pg', 'pg-no-dark-past']);
    const done = await rendered;
    assert.ok(done.type === 'diagnostic');
    assert.equal(done.payload.data?.cards, 4, done.payload.message);
  });

  test('after a refresh: semantic fresh and 9 vocabulary items', async function () {
    this.timeout(LEAN_TIMEOUT_MS + 10_000);
    await api.simulateBoardMessage(root, message('refresh'));
    await waitFor(() => latest?.semantic.state === 'fresh', LEAN_TIMEOUT_MS, `semantic "fresh" (now ${latest?.semantic.state}: ${latest?.semantic.detail ?? ''})`, 500);
    assert.equal(latest?.vocabulary.length, 9, JSON.stringify(latest?.vocabulary.map((v) => v.name)));
    assert.equal(latest?.nodes.find((n) => n.id === 'cynder-dark-past')?.status.proof.kind, 'assumed');
    assert.equal(latest?.nodes.find((n) => n.id === 'cynder-not-good')?.status.proof.kind, 'none');
  });

  test('addNode writes a block to Model/Spyro/Inbox.lean; undo removes it', async function () {
    this.timeout(60_000);
    const inbox = path.join(root, 'Model', 'Spyro', 'Inbox.lean');
    const before = existsSync(inbox) ? readFileSync(inbox, 'utf8') : null;
    const added = await request('addNode', { clientId: 'tmp-1', type: 'ASSUMPTION', naturalName: 'Cynder can fly', requestId: 'm-add' });
    assert.equal(added.ok, true, JSON.stringify(added));
    assert.match(readFileSync(inbox, 'utf8'), /natural_name: Cynder can fly/);
    await waitFor(() => latest?.nodes.length === 5, 30_000, 'a graph with 5 cards');
    const undone = await request('undo', { requestId: 'm-undo' });
    assert.equal(undone.ok, true, JSON.stringify(undone));
    assert.equal(existsSync(inbox) ? readFileSync(inbox, 'utf8') : null, before);
  });

  test('G->A on cynder-not-good adds the axiom; the refresh shows it assumed', async function () {
    this.timeout(LEAN_TIMEOUT_MS + 30_000);
    const outcome = await request('kindChange', { id: 'cynder-not-good', from: 'GOAL', to: 'ASSUMPTION', beforeId: null, requestId: 'm-g2a' });
    assert.equal(outcome.ok, true, JSON.stringify(outcome));
    assert.match(readFileSync(path.join(root, 'Model', 'Spyro', 'Main.lean'), 'utf8'), /axiom cynder_not_good\.holds/);
    await waitFor(
      () => {
        const node = latest?.nodes.find((n) => n.id === 'cynder-not-good');
        return node?.type === 'ASSUMPTION' && node.status.proof.kind === 'assumed' && latest?.semantic.state === 'fresh';
      },
      LEAN_TIMEOUT_MS,
      'cynder-not-good assumed after the refresh',
      500,
    );
  });

  test('copyText puts the code on the clipboard', async function () {
    this.timeout(30_000);
    const code = latest?.nodes.find((n) => n.id === 'cynder-dark-past')?.lean.code ?? 'abbrev cynder_dark_past : Prop := HasDarkPast cynder';
    await api.simulateBoardMessage(root, message('copyText', { text: code }));
    assert.equal(await vscode.env.clipboard.readText(), code);
  });

  test('initGit, historyList, historyPreview (diff editor) and historyRevert work, with private refs only', async function () {
    this.timeout(120_000);
    assert.ok(api.testing);
    api.testing.answerPrompts({ initGit: true });
    const init = await request('initGit', { requestId: 'm-git' });
    api.testing.answerPrompts({ initGit: undefined });
    assert.equal(init.ok, true, JSON.stringify(init));
    assert.ok(existsSync(path.join(root, '.git')));
    // Make one more recorded change so the history has something to revert.
    assert.equal((await request('editNode', { id: 'new-spyro-pg', field: 'rationale', value: 'announced at a showcase', requestId: 'm-edit' })).ok, true);

    const listed = nextPost(api, (e) => e.root === root && e.message.type === 'history', 30_000, 'the history listing');
    await api.simulateBoardMessage(root, message('historyList', { subject: 'Spyro' }));
    const event = await listed;
    assert.ok(event.message.type === 'history');
    const { entries, storage } = event.message.payload.listing;
    assert.ok(entries.length >= 2, JSON.stringify(entries));
    assert.ok(storage.subjectBytes > 0 && storage.totalBytes >= storage.subjectBytes, JSON.stringify(storage));

    const newest = entries[0];
    const oldest = entries[entries.length - 1];
    assert.ok(newest && oldest);
    await api.simulateBoardMessage(root, message('historyPreview', { subject: 'Spyro', entryId: newest.id, compare: 'parent' }));
    await waitFor(() => vscode.window.tabGroups.all.flatMap((g) => g.tabs).some((t) => t.label.startsWith('History: ')), 15_000, 'the history diff editor');

    const reverted = await request('historyRevert', { subject: 'Spyro', entryId: oldest.id, requestId: 'm-revert' });
    assert.equal(reverted.ok, true, JSON.stringify(reverted));
    const undone = await request('undo', { requestId: 'm-undo-revert' });
    assert.equal(undone.ok, true, JSON.stringify(undone));

    const refs = git(root, ['for-each-ref', '--format=%(refname)']).stdout.split('\n').filter(Boolean);
    assert.ok(refs.length > 0 && refs.every((ref) => ref.startsWith('refs/telelean/')), `refs: ${refs.join(', ')}`);
    assert.notEqual(git(root, ['rev-parse', '--verify', '--quiet', 'HEAD']).status, 0, 'no commit may land on a branch');
    assert.equal(git(root, ['status', '--porcelain', '--untracked-files=no']).stdout, '', 'the index must stay untouched');
    await closeTextEditors();
  });

  test('openInEditor opens Main.lean', async function () {
    this.timeout(30_000);
    const main = path.join(root, 'Model', 'Spyro', 'Main.lean');
    await api.simulateBoardMessage(root, message('openInEditor', { file: 'Model/Spyro/Main.lean', range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } } }));
    await waitFor(() => vscode.window.activeTextEditor?.document.uri.fsPath === main, 15_000, 'Main.lean in the active editor');
    await closeTextEditors();
  });

  test('.telelean/graph.json exists', async function () {
    this.timeout(30_000);
    const file = path.join(root, '.telelean', 'graph.json');
    await waitFor(() => existsSync(file), 20_000, '.telelean/graph.json');
    const json = JSON.parse(readFileSync(file, 'utf8')) as { format?: string; nodes?: unknown[] };
    assert.equal(json.format, 'telelean-graph');
    assert.ok(Array.isArray(json.nodes) && json.nodes.length >= 4);
  });

  test('Initialize Model Here on a fresh empty folder (real planInitialize): refuses a bad name, scaffolds, git offer, board (AT5.3)', async function () {
    this.timeout(120_000);
    const fresh = path.join(workspacePaths().ws, 'fresh_model');
    mkdirSync(fresh, { recursive: true });
    const invalid = await vscode.commands.executeCommand<InitializeResult>('telelean.initializeModel', { folder: fresh, subject: 'lower', gitInit: false });
    assert.equal(invalid?.status, 'failed');
    assert.equal(existsSync(path.join(fresh, '.telelean')), false);
    const result = await vscode.commands.executeCommand<InitializeResult>('telelean.initializeModel', { folder: fresh, subject: 'FreshModel', gitInit: true });
    assert.ok(result?.status === 'initialized', JSON.stringify(result));
    for (const file of ['lakefile.toml', 'lean-toolchain', 'lake-manifest.json', '.gitignore', 'Model.lean', 'Model/FreshModel.lean', 'Model/FreshModel/Main.lean', '.telelean/config.json', '.telelean/subjects/FreshModel/layout.json']) {
      assert.ok(existsSync(path.join(fresh, file)), `${file} missing`);
    }
    assert.equal(result.git, 'initialized', JSON.stringify(result));
    assert.ok(existsSync(path.join(fresh, '.git')));
    await waitFor(() => api.boardFor(fresh)?.subject === 'FreshModel', 30_000, 'the new board on subject FreshModel');
  });
});
